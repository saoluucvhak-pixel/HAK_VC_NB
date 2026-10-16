'use strict';
/**
 * CatalogService — danh mục TUYẾN VẬN CHUYỂN và PHIÊN BẢN GIÁ (API: routes.list / save / setActive · prices.list / preview / createVersion / updateDraft / activate).
 * Chốt 25/09/2026: tuyến vận chuyển sửa được, bổ sung được.
 *
 * Tuyến (TUYEN_VC):
 *   - Thêm tuyến mới: mã tuyến duy nhất (vd VC.016), tên, cự ly, cự ly/chuyến (trống = 2 × cự ly), ĐVT TAN|M3, điểm đi / điểm đến (in diễn giải hóa đơn).
 *   - Sửa: tên, điểm đi/đến, ghi chú → luôn được. Mã tuyến → không đổi (đã gắn vào phiếu cân, giá, kỳ).
 *     Cự ly / cự ly chuyến / ĐVT (làm đổi số tính):
 *       · tuyến đang ở kỳ NHÁP → kỳ đó "cần tính lại";
 *       · tuyến đã dùng ở kỳ ĐÃ XÁC NHẬN / ĐÃ KHÓA → chỉ ADMIN hoặc người có quyền mở khóa, bắt buộc lý do
 *         (kết quả các kỳ đó đã lưu snapshot, BKVC in lại không đổi).
 *   - Ngừng dùng: không xóa cứng; cấm khi đang có kỳ NHÁP dùng tuyến.
 * Giá (PRICE_HISTORY): phiên bản — không sửa bản đã kích hoạt; tạo bản DRAFT → xem trước ĐG_HĐ → kích hoạt (tự đóng bản trước = ngày mới − 1).
 * Bản cài nào cũng sửa được danh mục (chốt 25/09/2026 — không riêng HAKQN); mỗi lần sửa → nhắc sửa giống ở các nhà máy còn lại (SYNC_REMINDER).
 */
const E = require('../engine');
const { AppError, businessError } = require('../../shared/errors');
const { remindTx } = require('./SyncReminderService');

const ROUTE_FIELDS = ['route_code', 'route_name', 'distance_km', 'trip_distance_km', 'from_place', 'to_place', 'uom', 'catalog_unit_code', 'note'];
const ROUTE_CALC_FIELDS = ['distance_km', 'trip_distance_km', 'uom'];
const PRICE_FIELDS = ['route_code', 'contract_id', 'effective_from', 'base_price_excl_vat', 'base_price_source', 'price_per_km', 'new_price', 'fuel_price_excl_vat', 'fuel_norm_l_per_km',
  'avg_load_ton', 'avg_volume_m3', 'source_note', 'price_method', 'fixed_price'];
const snake = (k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toSnake = (o = {}) => Object.fromEntries(Object.entries(o).map(([k, v]) => [snake(k), v]));
const canUnlock = (u) => u && (u.role === 'ADMIN' || u.canUnlock);
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
const numOrEmpty = (v) => (v === '' || v === null || v === undefined ? '' : Number(v));

class CatalogService {
  constructor(store) { this.store = store; }

  _cfg() { return E.buildConfig(this.store.all('CONFIG')); }
  /** Các kỳ (chưa hủy) có dùng tuyến. */
  _periodsUsingRoute(routeCode) {
    const ids = new Set(this.store.find('TRANSPORT_CALCULATION', (c) => c.route_code === routeCode && c.is_current).map((c) => c.period_id));
    return [...ids].map((id) => this.store.get('KY_TINH', id)).filter((p) => p && p.status !== 'HUY');
  }

  // ─────────────────────────── TUYẾN ───────────────────────────
  listRoutes({ q = '', includeInactive = false } = {}) {
    const k = q.trim().toLowerCase();
    const items = this.store.find('TUYEN_VC', (r) => (includeInactive || r.is_active) && (!k || `${r.route_code} ${r.route_name} ${r.from_place || ''} ${r.to_place || ''}`.toLowerCase().includes(k)))
      .sort((a, b) => a.route_code.localeCompare(b.route_code, 'vi', { numeric: true }))
      .map((r) => ({ ...r, usedInPeriods: this._periodsUsingRoute(r.route_code).length, activePrice: this._activePrice(r.route_code, '', null) }));
    return { items, total: items.length };
  }

  _validateRoute(r) {
    const bad = [];
    if (!r.route_code || !/^[A-Z0-9][A-Z0-9._-]{1,19}$/.test(r.route_code)) bad.push('Mã tuyến chỉ gồm chữ HOA, số, dấu . _ - (vd VC.016)');
    if (!r.route_name || !String(r.route_name).trim()) bad.push('Thiếu tên tuyến');
    if (!(r.distance_km > 0)) bad.push(`Cự ly phải > 0 (đang là ${r.distance_km})`);
    if (!(r.trip_distance_km > 0)) bad.push(`Cự ly chuyến phải > 0 (đang là ${r.trip_distance_km})`);
    if (!['TAN', 'M3'].includes(r.uom)) bad.push('ĐVT tính giá phải là TAN hoặc M3');
    if (r.catalog_unit_code && !this.store.get('DON_VI', r.catalog_unit_code)) bad.push(`Đơn vị ${r.catalog_unit_code} không có trong danh mục`);
    if (bad.length) throw new AppError('VALIDATION_FAILED', bad.join('; '), { errors: bad });
  }

  async saveRoute({ record, rowVersion, reason = '', create = false, user }) {
    const inp = toSnake(record);
    for (const k of Object.keys(inp)) if (!ROUTE_FIELDS.includes(k)) delete inp[k];
    for (const k of ['route_code', 'uom']) if (typeof inp[k] === 'string') inp[k] = inp[k].trim().toUpperCase();
    for (const k of ['route_name', 'from_place', 'to_place', 'note']) if (typeof inp[k] === 'string') inp[k] = inp[k].replace(/\s+/g, ' ').trim();
    for (const k of ['distance_km', 'trip_distance_km']) if (k in inp) inp[k] = numOrEmpty(inp[k]);
    const old = inp.route_code ? this.store.get('TUYEN_VC', inp.route_code) : null;
    const warnings = [];
    if (create && old) throw new AppError('DUPLICATE', `Mã tuyến ${inp.route_code} đã có (${old.route_name}) — chọn mã khác hoặc mở tuyến đó để sửa`);
    if (!create && !old) throw new AppError('NOT_FOUND', `Không có tuyến ${inp.route_code} — muốn thêm tuyến mới thì chọn "Thêm tuyến"`);

    if (!old) { // ── thêm tuyến mới
      const rec = { uom: 'TAN', from_place: '', to_place: '', catalog_unit_code: this.store.unitCode, note: '', ...inp, is_active: true };
      if (rec.trip_distance_km === '' || rec.trip_distance_km === undefined) rec.trip_distance_km = rec.distance_km * 2; // chuyến = đi + về
      this._validateRoute(rec);
      const dup = this.store.find('TUYEN_VC', (r) => r.route_name.toLowerCase() === rec.route_name.toLowerCase() && r.uom === rec.uom && r.is_active);
      if (dup.length) warnings.push({ code: 'W_ROUTE_NAME_DUP', level: 'WARNING', message: `Đã có tuyến cùng tên và ĐVT: ${dup.map((r) => r.route_code).join(', ')}` });
      const created = await this.store.transaction((tx) => {
        const r = tx.insert('TUYEN_VC', rec);
        tx.audit('CREATE', 'TUYEN_VC', r.route_code, null, r, { reason });
        const w = remindTx(tx, this.store, { entity: 'TUYEN_VC', entityId: r.route_code, action: 'CREATE', summary: `Thêm tuyến ${r.route_code} — ${r.route_name} (${r.distance_km} km, chuyến ${r.trip_distance_km} km, ${r.uom})` });
        if (w) warnings.push(w);
        return r;
      }, { user: user.username });
      return { record: created, created: true, affectedPeriods: [], warnings };
    }

    // ── sửa tuyến
    if (rowVersion === undefined) throw new AppError('VALIDATION_FAILED', 'Sửa tuyến phải gửi rowVersion');
    const patch = {};
    for (const k of ROUTE_FIELDS) if (k in inp && k !== 'route_code' && inp[k] !== old[k]) patch[k] = inp[k];
    if (!Object.keys(patch).length) return { record: old, created: false, affectedPeriods: [], warnings };
    const next = { ...old, ...patch };
    this._validateRoute(next);
    const calcChanged = ROUTE_CALC_FIELDS.filter((k) => k in patch);
    const periods = calcChanged.length ? this._periodsUsingRoute(old.route_code) : [];
    const hard = periods.filter((p) => p.status !== 'NHAP');
    if (hard.length) {
      if (!canUnlock(user)) {
        throw businessError('E_ROUTE_IN_CONFIRMED', `Tuyến ${old.route_code} đã dùng ở ${hard.length} kỳ đã xác nhận/khóa (${hard.map((p) => p.period_code).join(', ')}) — `
          + `chỉ ADMIN hoặc người có quyền mở khóa được sửa ${calcChanged.join(', ')}`, { periods: hard.map((p) => p.period_code) });
      }
      if (!reason) throw new AppError('VALIDATION_FAILED', 'Tuyến đã dùng ở kỳ đã xác nhận/khóa — phải nhập lý do');
      warnings.push({ code: 'W_ROUTE_CHANGED_AFTER_CONFIRM', level: 'WARNING',
        message: `${hard.length} kỳ đã xác nhận/khóa giữ nguyên kết quả đã lưu; nếu trả về nháp và tính lại sẽ dùng cự ly mới` });
    }
    const drafts = periods.filter((p) => p.status === 'NHAP').map((p) => p.period_id);
    const out = await this.store.transaction((tx) => {
      const { before, after } = tx.update('TUYEN_VC', old.route_code, patch, { expectedRowVersion: rowVersion });
      for (const pid of drafts) tx.update('KY_TINH', pid, { needs_recalc: true });
      tx.audit('UPDATE', 'TUYEN_VC', old.route_code, Object.fromEntries(Object.keys(patch).map((k) => [k, before[k]])), patch, { reason });
      const w = remindTx(tx, this.store, { entity: 'TUYEN_VC', entityId: old.route_code, action: 'UPDATE',
        summary: `Sửa tuyến ${old.route_code}: ${Object.keys(patch).map((k) => `${k} ${before[k] === '' ? '(trống)' : before[k]} → ${patch[k] === '' ? '(trống)' : patch[k]}`).join('; ')}` });
      if (w) warnings.push(w);
      return after;
    }, { user: user.username });
    return { record: out, created: false, affectedPeriods: drafts, warnings };
  }

  async setRouteActive({ routeCode, active, rowVersion, reason = '', user }) {
    const r = this.store.get('TUYEN_VC', routeCode);
    if (!r) throw new AppError('NOT_FOUND', `Không có tuyến ${routeCode}`);
    if (!active) {
      const drafts = this._periodsUsingRoute(routeCode).filter((p) => p.status === 'NHAP');
      if (drafts.length) throw businessError('E_IN_USE', `Tuyến ${routeCode} đang dùng ở kỳ nháp ${drafts.map((p) => p.period_code).join(', ')} — xác nhận hoặc hủy kỳ trước`);
    }
    const out = await this.store.transaction((tx) => {
      const { after } = tx.update('TUYEN_VC', routeCode, { is_active: !!active }, { expectedRowVersion: rowVersion });
      tx.audit('SET_ACTIVE', 'TUYEN_VC', routeCode, { is_active: r.is_active }, { is_active: !!active }, { reason });
      const w = remindTx(tx, this.store, { entity: 'TUYEN_VC', entityId: routeCode, action: 'SET_ACTIVE', summary: `${active ? 'Dùng lại' : 'Ngừng dùng'} tuyến ${routeCode} — ${r.route_name}` });
      return { after, w };
    }, { user: user.username });
    return { record: out.after, warnings: out.w ? [out.w] : [] };
  }

  // ─────────────────────────── GIÁ ───────────────────────────
  _activePrice(routeCode, contractId, date) {
    const d = date || new Date().toISOString().slice(0, 10);
    return this.store.find('PRICE_HISTORY', (p) => p.route_code === routeCode && (p.contract_id || '') === (contractId || '') && p.status !== 'DRAFT'
      && p.effective_from <= d && (!p.effective_to || p.effective_to >= d)).sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0] || null;
  }

  listPrices({ routeCode = '', contractId, status = '' } = {}) {
    const cfg = this._cfg();
    const items = this.store.find('PRICE_HISTORY', (p) => (!routeCode || p.route_code === routeCode) && (contractId === undefined || (p.contract_id || '') === contractId) && (!status || p.status === status))
      .sort((a, b) => a.route_code.localeCompare(b.route_code, 'vi', { numeric: true }) || (a.contract_id || '').localeCompare(b.contract_id || '') || a.version_no - b.version_no)
      .map((p) => { const r = this.store.get('TUYEN_VC', p.route_code); return { ...p, contractPrice: r ? E.computeContractPrice(r, p, cfg).contractPrice : null }; });
    return { items, total: items.length };
  }

  _validatePrice(p, route, { forSave = true } = {}) {
    const bad = [];
    if (forSave && p.base_price_excl_vat !== '' && p.base_price_excl_vat !== undefined && !String(p.base_price_source || '').trim()) bad.push('Có đơn giá tham khảo thì phải ghi nguồn tham khảo (file / bảng / cột / ngày)');
    if (!route) bad.push(`Tuyến ${p.route_code} không có trong danh mục`);
    else if (!route.is_active) bad.push(`Tuyến ${p.route_code} đang ngừng dùng`);
    if (p.contract_id && !this.store.get('HOP_DONG', p.contract_id)) bad.push(`Hợp đồng ${p.contract_id} không có`);
    if (!isDate(p.effective_from)) bad.push('Ngày hiệu lực phải dạng yyyy-MM-dd');
    if (p.price_method === 'CO_DINH') {
      // đơn giá cố định (bản 1.2.3): chỉ cần đơn giá đ/tấn; không dùng định mức, giá dầu, KL_TB
      if (!(p.fixed_price > 0)) bad.push('Đơn giá cố định (đ/tấn, chưa VAT) phải > 0');
      if (route && route.uom === 'M3') bad.push('Tuyến tính theo M3 — đơn giá cố định chỉ áp cho tuyến tính theo tấn');
    } else {
      if (!(p.new_price > 0)) bad.push('Đơn giá mới phải > 0');
      if (!(p.fuel_price_excl_vat > 0)) bad.push('Đơn giá dầu (chưa VAT) phải > 0');
      if (!(p.fuel_norm_l_per_km > 0)) bad.push('Định mức dầu (lít/km) phải > 0');
      if (!(p.avg_load_ton > 0)) bad.push('KL trung bình (tấn) phải > 0');
      if (route && route.uom === 'M3' && !(p.avg_volume_m3 > 0)) bad.push('Tuyến tính theo M3 — Thể tích TB phải > 0');
    }
    if (bad.length) throw new AppError('VALIDATION_FAILED', bad.join('; '), { errors: bad });
  }
  _normPrice(record) {
    const p = toSnake(record);
    for (const k of Object.keys(p)) if (!PRICE_FIELDS.includes(k)) delete p[k];
    for (const k of ['base_price_excl_vat', 'price_per_km', 'new_price', 'fuel_price_excl_vat', 'fuel_norm_l_per_km', 'avg_load_ton', 'avg_volume_m3', 'fixed_price']) if (k in p) p[k] = numOrEmpty(p[k]);
    if ('price_method' in p) p.price_method = p.price_method === 'CO_DINH' ? 'CO_DINH' : 'THEO_DAU';
    if (p.price_method === 'CO_DINH') {
      // các cột bắt buộc của cách tính theo giá dầu không dùng → ghi 0 (bảng giá vẫn đủ cột, xem lại thấy rõ là không dùng)
      for (const k of ['new_price', 'fuel_price_excl_vat', 'fuel_norm_l_per_km', 'avg_load_ton']) p[k] = 0;
      p.avg_volume_m3 = ''; p.base_price_excl_vat = ''; p.base_price_source = ''; p.price_per_km = '';
    } else if (p.price_method === 'THEO_DAU') p.fixed_price = '';
    if (typeof p.route_code === 'string') p.route_code = p.route_code.trim().toUpperCase();
    p.contract_id = p.contract_id || '';
    return p;
  }

  /** Tầng A cho 1 bộ tham số — không lưu. */
  previewPrice({ record }) {
    const p = this._normPrice(record); const route = this.store.get('TUYEN_VC', p.route_code);
    this._validatePrice({ effective_from: '2000-01-01', ...p }, route, { forSave: false });
    const a = E.computeContractPrice(route, p, this._cfg());
    const cur = this._activePrice(p.route_code, p.contract_id, p.effective_from);
    return { ...a, current: cur ? { priceId: cur.price_id, contractPrice: E.computeContractPrice(route, cur, this._cfg()).contractPrice } : null };
  }

  async createPriceVersion({ record, user }) {
    const p = this._normPrice(record); const route = this.store.get('TUYEN_VC', p.route_code);
    this._validatePrice(p, route);
    const same = this.store.find('PRICE_HISTORY', (x) => x.route_code === p.route_code && (x.contract_id || '') === p.contract_id);
    const lastActive = same.filter((x) => x.status !== 'DRAFT').sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
    if (lastActive && p.effective_from <= lastActive.effective_from) {
      throw businessError('E_PRICE_DATE_OVERLAP', `Ngày hiệu lực ${p.effective_from} phải sau phiên bản đang dùng ${lastActive.price_id} (từ ${lastActive.effective_from})`);
    }
    const version = same.reduce((m, x) => Math.max(m, x.version_no), 0) + 1;
    const rec = { base_price_excl_vat: '', base_price_source: '', price_per_km: '', avg_volume_m3: '', source_note: '', price_method: 'THEO_DAU', fixed_price: '', ...p,
      price_id: `PR-${p.route_code}${p.contract_id ? `-${p.contract_id}` : ''}-v${version}`, version_no: version, effective_to: '', status: 'DRAFT', is_used: false };
    const out = await this.store.transaction((tx) => {
      const r = tx.insert('PRICE_HISTORY', rec);
      tx.audit('PRICE_CREATE', 'PRICE_HISTORY', r.price_id, null, r);
      return r;
    }, { user: user.username });
    return { record: out, contractPrice: E.computeContractPrice(route, out, this._cfg()).contractPrice, warnings: [] };
  }

  async updatePriceDraft({ priceId, record, rowVersion, user }) {
    const old = this.store.get('PRICE_HISTORY', priceId);
    if (!old) throw new AppError('NOT_FOUND', `Không có phiên bản giá ${priceId}`);
    if (old.status !== 'DRAFT' || old.is_used) throw businessError('E_PRICE_USED', `Phiên bản ${priceId} đã kích hoạt/đã dùng — không sửa, hãy tạo phiên bản mới`);
    const p = this._normPrice(record); delete p.route_code; delete p.contract_id;
    const next = { ...old, ...p }; const route = this.store.get('TUYEN_VC', old.route_code);
    this._validatePrice(next, route);
    const out = await this.store.transaction((tx) => {
      const { before, after } = tx.update('PRICE_HISTORY', priceId, p, { expectedRowVersion: rowVersion });
      tx.audit('PRICE_UPDATE', 'PRICE_HISTORY', priceId, Object.fromEntries(Object.keys(p).map((k) => [k, before[k]])), p);
      return after;
    }, { user: user.username });
    return { record: out, contractPrice: E.computeContractPrice(route, out, this._cfg()).contractPrice };
  }

  async activatePrice({ priceId, rowVersion, user }) {
    const d = this.store.get('PRICE_HISTORY', priceId);
    if (!d) throw new AppError('NOT_FOUND', `Không có phiên bản giá ${priceId}`);
    if (d.status !== 'DRAFT') throw businessError('E_PRICE_USED', `Phiên bản ${priceId} không ở trạng thái nháp`);
    const prev = this.store.find('PRICE_HISTORY', (x) => x.price_id !== priceId && x.route_code === d.route_code && (x.contract_id || '') === (d.contract_id || '') && x.status !== 'DRAFT'
      && (!x.effective_to || x.effective_to >= d.effective_from));
    for (const x of prev) {
      if (x.effective_from >= d.effective_from) throw businessError('E_PRICE_DATE_OVERLAP', `Phiên bản ${x.price_id} bắt đầu ${x.effective_from} — không sớm hơn ${d.effective_from}`);
    }
    // kỳ ĐÃ XÁC NHẬN/KHÓA đã dùng bản cũ cho ngày ≥ ngày hiệu lực mới → không được đổi giá phía sau lưng kỳ đó
    const prevIds = new Set(prev.map((x) => x.price_id));
    const calcs = this.store.find('TRANSPORT_CALCULATION', (c) => c.is_current && prevIds.has(c.price_id));
    const hit = [...new Set(calcs.map((c) => c.period_id))].map((id) => this.store.get('KY_TINH', id)).filter((p) => p && p.status !== 'HUY' && p.date_to >= d.effective_from);
    const hard = hit.filter((p) => p.status !== 'NHAP');
    if (hard.length) throw businessError('E_PRICE_USED', `Kỳ ${hard.map((p) => p.period_code).join(', ')} đã xác nhận/khóa với giá cũ và có ngày từ ${d.effective_from} — chọn ngày hiệu lực sau ${hard.map((p) => p.date_to).sort().pop()}`);
    const drafts = hit.filter((p) => p.status === 'NHAP').map((p) => p.period_id);
    const to = addDays(d.effective_from, -1);
    return this.store.transaction((tx) => {
      const closed = [];
      for (const x of prev) { tx.update('PRICE_HISTORY', x.price_id, { effective_to: to, status: 'CLOSED' }); closed.push({ priceId: x.price_id, effectiveTo: to }); }
      const { after } = tx.update('PRICE_HISTORY', priceId, { status: 'ACTIVE' }, { expectedRowVersion: rowVersion });
      for (const pid of drafts) tx.update('KY_TINH', pid, { needs_recalc: true });
      tx.audit('PRICE_ACTIVATE', 'PRICE_HISTORY', priceId, { status: 'DRAFT' }, { status: 'ACTIVE', closed });
      const w = remindTx(tx, this.store, { entity: 'PRICE_HISTORY', entityId: priceId, action: 'PRICE_ACTIVATE',
        summary: `Áp dụng giá mới ${priceId} cho tuyến ${d.route_code}${d.contract_id ? ` (HĐ ${d.contract_id})` : ''} từ ${d.effective_from}: ${d.price_method === 'CO_DINH' ? `ĐƠN GIÁ CỐ ĐỊNH ${d.fixed_price} đ/tấn` : `đơn giá mới ${d.new_price}, dầu ${d.fuel_price_excl_vat}, ĐM ${d.fuel_norm_l_per_km}, KL_TB ${d.avg_load_ton}`}` });
      return { activated: after, closed, affectedPeriods: drafts, warnings: w ? [w] : [] };
    }, { user: user.username });
  }
}

module.exports = { CatalogService, ROUTE_FIELDS, ROUTE_CALC_FIELDS };
