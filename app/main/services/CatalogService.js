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
const PRICE_METHOD_LABEL = { CO_DINH: 'Đơn giá cố định', THEO_DAU: 'Đơn giá điều chỉnh dầu', HON_HOP: 'Hỗn hợp (cần tách mã)' };
const MIXED_WARNING = 'Mã có cả dòng cố định và điều chỉnh dầu (tạo ở bản cũ) — tách thành 2 mã';
const lineMethod = (p) => (p.price_method === 'CO_DINH' ? 'CO_DINH' : 'THEO_DAU'); // dòng giá cũ cột rỗng = theo giá dầu
const { remindTx } = require('./SyncReminderService');

const ROUTE_FIELDS = ['route_code', 'route_name', 'distance_km', 'trip_distance_km', 'from_place', 'to_place', 'uom', 'catalog_unit_code', 'note', 'catalog_date'];
const localToday = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const ROUTE_CALC_FIELDS = ['distance_km', 'trip_distance_km', 'uom'];
const PRICE_FIELDS = ['route_code', 'contract_id', 'effective_from', 'base_price_excl_vat', 'base_price_source', 'price_per_km', 'new_price', 'fuel_price_excl_vat', 'fuel_norm_l_per_km',
  'avg_load_ton', 'avg_volume_m3', 'source_note', 'price_method', 'fixed_price', 'price_code', 'contract_price'];
const snake = (k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toSnake = (o = {}) => Object.fromEntries(Object.entries(o).map(([k, v]) => [snake(k), v]));
const canUnlock = (u) => u && (u.role === 'ADMIN' || u.canUnlock);
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
const numOrEmpty = (v) => (v === '' || v === null || v === undefined ? '' : Number(v));
/** Tiền dạng chuỗi (gõ tay / API): "150.000" = 150000 (dấu ngăn cách nghìn kiểu Việt — Number("150.000") sẽ ra 150, sai 1.000 lần); "150,5" = 150,5; số thật giữ nguyên. */
const moneyOrEmpty = (v) => {
  if (typeof v !== 'string') return numOrEmpty(v);
  const s = v.trim().replace(/\s/g, ''); if (!s) return '';
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
  if (/^\d+([.,]\d+)?$/.test(s)) return Number(s.replace(',', '.'));
  return NaN;
};
const MONEY_FIELDS = ['base_price_excl_vat', 'price_per_km', 'new_price', 'fuel_price_excl_vat', 'fixed_price', 'contract_price'];

// Hình thức giá (danh mục HINH_THUC_GIA): mô tả theo mã hình thức; công thức chỉ để hiển thị, KHÔNG tham gia tính giá
const FORM_METHODS = ['CO_DINH', 'THEO_DAU'];
const FORM_SEED_DATE = '2000-01-01';
const FORM_DEFAULTS = {
  CO_DINH: { name: 'Đơn giá cố định', formula: 'Đơn giá vận chuyển = đơn giá cố định (đ/tấn hoặc đ/m³) ghi ở từng tuyến; không tính chênh lệch dầu, không làm tròn lại.' },
  THEO_DAU: { name: 'Đơn giá điều chỉnh theo giá dầu', formula: 'Đơn giá ký hợp đồng = làm tròn[(đơn giá mới × khối lượng TB − giá dầu × định mức × cự ly chuyến) ÷ khối lượng TB]; đơn giá vận chuyển của kỳ = đơn giá ký hợp đồng + chênh lệch dầu (định mức − thực tế) × giá dầu ÷ tổng tấn, làm tròn theo cấu hình.' },
};
const isVoidForm = (f) => f.status === 'CLOSED' && !!f.effective_to && f.effective_to < f.catalog_date; // dòng đã gỡ (xem removeForm)
const formIdOf = (method, date) => `HT-${method === 'CO_DINH' ? 'CD' : 'TD'}-${String(date).replace(/-/g, '')}`;
const numOrNull = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

/** Dòng giá đã GỠ (không xóa cứng để gói trao đổi mang được trạng thái): đóng với hiệu lực kết thúc trước ngày bắt đầu → không khớp ngày nào. */
const isVoidLine = (x) => x.status === 'CLOSED' && !!x.effective_to && x.effective_to < x.effective_from;

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
      .map((r) => ({ ...r, catalogDate: r.catalog_date || String(r.updated_at || r.created_at || '').slice(0, 10), usedInPeriods: this._periodsUsingRoute(r.route_code).length, activePrice: this._activePrice(r.route_code, '', null) }));
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

  /** Mã tuyến gợi ý kế tiếp: VC. + (số lớn nhất dạng VC.nnn + 1), 3 chữ số. Chỉ gợi ý — sửa được trước khi lưu; trùng mã khi lưu → DUPLICATE (không ghi đè). */
  nextRouteCode() {
    let max = 0; for (const r of this.store.all('TUYEN_VC')) { const m = /^VC\.(\d+)$/.exec(r.route_code || ''); if (m) max = Math.max(max, Number(m[1])); }
    return { routeCode: `VC.${String(max + 1).padStart(3, '0')}` };
  }

  async saveRoute({ record, rowVersion, reason = '', create = false, user }) {
    const inp = toSnake(record);
    for (const k of Object.keys(inp)) if (!ROUTE_FIELDS.includes(k)) delete inp[k];
    for (const k of ['route_code', 'uom']) if (typeof inp[k] === 'string') inp[k] = inp[k].trim().toUpperCase();
    for (const k of ['route_name', 'from_place', 'to_place', 'note']) if (typeof inp[k] === 'string') inp[k] = inp[k].replace(/\s+/g, ' ').trim();
    for (const k of ['distance_km', 'trip_distance_km']) if (k in inp) inp[k] = numOrEmpty(inp[k]);
    if ('catalog_date' in inp) { inp.catalog_date = String(inp.catalog_date || '').trim(); if (inp.catalog_date && !isDate(inp.catalog_date)) throw new AppError('VALIDATION_FAILED', 'Ngày cập nhật phải dạng yyyy-MM-dd'); }
    const old = inp.route_code ? this.store.get('TUYEN_VC', inp.route_code) : null;
    const warnings = [];
    if (create && old) throw new AppError('DUPLICATE', `Mã tuyến ${inp.route_code} đã có (${old.route_name}) — chọn mã khác hoặc mở tuyến đó để sửa`);
    if (!create && !old) throw new AppError('NOT_FOUND', `Không có tuyến ${inp.route_code} — muốn thêm tuyến mới thì chọn "Thêm tuyến"`);

    if (!old) { // ── thêm tuyến mới
      const rec = { uom: 'TAN', from_place: '', to_place: '', catalog_unit_code: this.store.unitCode, note: '', ...inp, is_active: true };
      if (!rec.catalog_date) rec.catalog_date = localToday(); // ngày cập nhật mặc định = ngày hệ thống
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
      // có sửa nội dung → ngày cập nhật = ngày chỉnh sửa gần nhất (điền tay thì giữ ngày đã điền); ngày tự gán không đưa vào bản vá của nhật ký
      const { before, after } = tx.update('TUYEN_VC', old.route_code, patch.catalog_date ? patch : { ...patch, catalog_date: localToday() }, { expectedRowVersion: rowVersion });
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
  _activePrice(routeCode, contractId, date, priceCode = '') {
    const d = date || new Date().toISOString().slice(0, 10);
    return this.store.find('PRICE_HISTORY', (p) => p.route_code === routeCode && (p.price_code || '') === (priceCode || '') && (p.contract_id || '') === (contractId || '') && p.status !== 'DRAFT'
      && p.effective_from <= d && (!p.effective_to || p.effective_to >= d)).sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0] || null;
  }

  listPrices({ routeCode = '', contractId, status = '', priceCode = '' } = {}) {
    const cfg = this._cfg();
    const isDefaultTd = priceCode === 'PT-TD';
    const isDefaultCd = priceCode === 'PT-CD';
    // dòng giá thuộc MÃ ĐƠN GIÁ chỉ hiện khi hỏi đúng mã đó — dòng giá cũ (chưa gán mã) tự động vào mã PT-TD hoặc PT-CD theo hình thức
    const items = this.store.find('PRICE_HISTORY', (p) => {
      const matchCode = priceCode
        ? (p.price_code === priceCode || (isDefaultTd && (!p.price_code || p.price_code === '') && !p.contract_id && p.price_method !== 'CO_DINH') || (isDefaultCd && (!p.price_code || p.price_code === '') && !p.contract_id && p.price_method === 'CO_DINH'))
        : (!p.price_code || p.price_code === '');
      return matchCode && (!routeCode || p.route_code === routeCode) && (contractId === undefined || (p.contract_id || '') === contractId) && (!status || p.status === status);
    })
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
    if (p.price_code) {
      const pc = this.store.get('MA_DON_GIA', p.price_code);
      if (!pc) bad.push(`Mã đơn giá ${p.price_code} không có`); else if (pc.status !== 'ACTIVE') bad.push(`Mã đơn giá ${p.price_code} đã đóng — không thêm dòng giá`);
      if (p.contract_id) bad.push('Dòng giá thuộc mã đơn giá không gắn riêng một hợp đồng (hợp đồng chọn mã đơn giá ở màn Hợp đồng)');
    }
    if (!isDate(p.effective_from)) bad.push('Ngày hiệu lực phải dạng yyyy-MM-dd');
    if (p.price_method === 'CO_DINH') {
      const uomLabel = route && route.uom === 'M3' ? 'đ/m³' : 'đ/tấn';
      if (!(p.fixed_price > 0)) bad.push(`Đơn giá cố định (${uomLabel}, chưa VAT) phải > 0`);
      else if (p.fixed_price < 1000) bad.push(`Đơn giá cố định ${p.fixed_price} ${uomLabel} quá nhỏ (< 1.000) — kiểm tra dấu chấm ngăn cách nghìn (vd nhập 150000 hoặc 150.000)`);
      else if (p.fixed_price > 1e9) bad.push(`Đơn giá cố định quá lớn (> 1.000.000.000 ${uomLabel}) — kiểm tra lại số nhập`);
    } else {
      if (!(p.new_price > 0)) bad.push('Đơn giá mới phải > 0');
      else if (p.new_price < 1000) bad.push(`Đơn giá cước dự kiến ${p.new_price} đ quá nhỏ (< 1.000) — kiểm tra dấu chấm ngăn cách nghìn (vd nhập 150000 hoặc 150.000)`);
      if (!(p.fuel_price_excl_vat > 0)) bad.push('Đơn giá dầu (chưa VAT) phải > 0');
      if (!(p.fuel_norm_l_per_km > 0)) bad.push('Định mức dầu (lít/km) phải > 0');
      if (!(p.avg_load_ton > 0)) bad.push('KL trung bình (tấn) phải > 0');
      if (route && route.uom === 'M3' && !(p.avg_volume_m3 > 0)) bad.push('Tuyến tính theo M3 — Thể tích TB phải > 0');
      if (!bad.length && route) { // các số hợp lệ từng ô nhưng công thức ra đơn giá ≤ 0 (vd nhập thiếu 3 chữ số 0 ở đơn giá cước): báo ngay, không để ra −17.000
        const a = E.computeContractPrice(route, p, this._cfg());
        if (!(a.contractPrice > 0)) bad.push(`Đơn giá ký hợp đồng tính theo công thức = ${a.contractPrice} (≤ 0) — kiểm tra đơn giá cước, định mức dầu, giá dầu, KL trung bình`);
      }
    }
    if (bad.length) throw new AppError('VALIDATION_FAILED', bad.join('; '), { errors: bad });
  }
  _normPrice(record) {
    const p = toSnake(record);
    for (const k of Object.keys(p)) if (!PRICE_FIELDS.includes(k)) delete p[k];
    for (const k of ['base_price_excl_vat', 'price_per_km', 'new_price', 'fuel_price_excl_vat', 'fuel_norm_l_per_km', 'avg_load_ton', 'avg_volume_m3', 'fixed_price', 'contract_price']) if (k in p) p[k] = MONEY_FIELDS.includes(k) ? moneyOrEmpty(p[k]) : numOrEmpty(p[k]);
    if ('price_method' in p) p.price_method = p.price_method === 'CO_DINH' ? 'CO_DINH' : 'THEO_DAU';
    if (p.price_method === 'CO_DINH') {
      // các cột bắt buộc của cách tính theo giá dầu không dùng → ghi 0 (bảng giá vẫn đủ cột, xem lại thấy rõ là không dùng)
      for (const k of ['new_price', 'fuel_price_excl_vat', 'fuel_norm_l_per_km', 'avg_load_ton']) p[k] = 0;
      p.avg_volume_m3 = ''; p.base_price_excl_vat = ''; p.base_price_source = ''; p.price_per_km = '';
    } else if (p.price_method === 'THEO_DAU') p.fixed_price = '';
    if (typeof p.route_code === 'string') p.route_code = p.route_code.trim().toUpperCase();
    p.contract_id = p.contract_id || '';
    if ('price_code' in p) p.price_code = String(p.price_code || '').trim().toUpperCase();
    return p;
  }

  /** Tầng A cho 1 bộ tham số — không lưu. */
  previewPrice({ record }) {
    const p = this._normPrice(record); const route = this.store.get('TUYEN_VC', p.route_code);
    this._validatePrice({ effective_from: '2000-01-01', ...p }, route, { forSave: false });
    const a = E.computeContractPrice(route, p, this._cfg());
    const cur = this._activePrice(p.route_code, p.contract_id, p.effective_from, p.price_code);
    return { ...a, current: cur ? { priceId: cur.price_id, contractPrice: E.computeContractPrice(route, cur, this._cfg()).contractPrice } : null };
  }

  /** Dựng bản ghi phiên bản giá NHÁP (kiểm hợp lệ + chống điền lùi ngày) — chưa ghi. Dùng chung createPriceVersion và addCodeLine (gộp giao dịch). */
  _buildPriceVersion(record) {
    const p = this._normPrice(record); const route = this.store.get('TUYEN_VC', p.route_code);
    this._validatePrice(p, route);
    const same = this.store.find('PRICE_HISTORY', (x) => x.route_code === p.route_code && (x.contract_id || '') === p.contract_id && (x.price_code || '') === (p.price_code || ''));
    const lastActive = same.filter((x) => x.status !== 'DRAFT' && !isVoidLine(x)).sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
    if (lastActive && p.effective_from <= lastActive.effective_from) {
      throw businessError('E_PRICE_DATE_OVERLAP', `Ngày hiệu lực ${p.effective_from} phải sau phiên bản đang dùng ${lastActive.price_id} (từ ${lastActive.effective_from})`);
    }
    const version = same.reduce((m, x) => Math.max(m, x.version_no), 0) + 1;
    const rec = { base_price_excl_vat: '', base_price_source: '', price_per_km: '', avg_volume_m3: '', source_note: '', price_method: 'THEO_DAU', fixed_price: '', ...p,
      price_id: `PR-${p.route_code}${p.contract_id ? `-${p.contract_id}` : ''}${p.price_code ? `-${p.price_code}` : ''}-v${version}`, version_no: version, effective_to: '', status: 'DRAFT', is_used: false };
    return { rec, route };
  }

  async createPriceVersion({ record, user }) {
    const { rec, route } = this._buildPriceVersion(record);
    this._assertLineMatchesCode(rec); // rà soát 1.8.2: dòng thuộc mã đơn giá phải đúng hình thức của mã (trước đây chỉ kiểm ở sửa nháp / áp dụng)
    const out = await this.store.transaction((tx) => {
      const r = tx.insert('PRICE_HISTORY', rec);
      tx.audit('PRICE_CREATE', 'PRICE_HISTORY', r.price_id, null, r);
      return r;
    }, { user: user.username });
    return { record: out, contractPrice: E.computeContractPrice(route, out, this._cfg()).contractPrice, warnings: [] };
  }

  _assertLineMatchesCode(line) {
    if (!line.price_code) return; // giá chung / giá riêng hợp đồng: không ràng buộc
    const c = this.store.get('MA_DON_GIA', line.price_code); if (!c) return;
    const method = this._codeMethod(c); const lm = lineMethod(line);
    if (method !== lm) throw this._methodMismatch(c.price_code, method, lm);
  }

  async updatePriceDraft({ priceId, record, rowVersion, user }) {
    const old = this.store.get('PRICE_HISTORY', priceId);
    if (!old) throw new AppError('NOT_FOUND', `Không có phiên bản giá ${priceId}`);
    if (old.status !== 'DRAFT' || old.is_used) throw businessError('E_PRICE_USED', `Phiên bản ${priceId} đã kích hoạt/đã dùng — không sửa, hãy tạo phiên bản mới`);
    const p = this._normPrice(record); delete p.route_code; delete p.contract_id; delete p.price_code;
    const next = { ...old, ...p }; const route = this.store.get('TUYEN_VC', old.route_code);
    this._assertLineMatchesCode(next); // dòng thuộc mã: hình thức sau khi sửa phải bằng hình thức của mã
    this._validatePrice(next, route);
    const out = await this.store.transaction((tx) => {
      const { before, after } = tx.update('PRICE_HISTORY', priceId, p, { expectedRowVersion: rowVersion });
      tx.audit('PRICE_UPDATE', 'PRICE_HISTORY', priceId, Object.fromEntries(Object.keys(p).map((k) => [k, before[k]])), p);
      return after;
    }, { user: user.username });
    return { record: out, contractPrice: E.computeContractPrice(route, out, this._cfg()).contractPrice };
  }

  /** Kiểm chốt chặn khi áp dụng dòng giá d (đã dựng): phiên bản cũ phải kết thúc trước ngày mới; kỳ đã xác nhận/khóa không đổi giá sau lưng. Dùng chung activatePrice và addContractPrice. */
  _activationPlan(d) {
    const priceId = d.price_id;
    const prev = this.store.find('PRICE_HISTORY', (x) => x.price_id !== priceId && x.route_code === d.route_code && (x.contract_id || '') === (d.contract_id || '') && (x.price_code || '') === (d.price_code || '') && x.status !== 'DRAFT'
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
    return { prev, drafts, to: addDays(d.effective_from, -1) };
  }

  async activatePrice({ priceId, rowVersion, user }) {
    const d = this.store.get('PRICE_HISTORY', priceId);
    if (!d) throw new AppError('NOT_FOUND', `Không có phiên bản giá ${priceId}`);
    if (d.status !== 'DRAFT') throw businessError('E_PRICE_USED', `Phiên bản ${priceId} không ở trạng thái nháp`);
    this._assertLineMatchesCode(d);
    const { prev, drafts, to } = this._activationPlan(d);
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

  /**
   * Hợp đồng: từng tuyến đang có giá kèm NGUỒN GIÁ tại ngày hôm nay — chọn bằng chính selectPriceVersion của engine (mã gán cho hợp đồng > giá riêng hợp đồng > giá chung).
   * source: CODE (dòng của mã) | CONTRACT (giá riêng hợp đồng) | GENERAL (giá chung, cách cũ). CHỈ ĐỌC — không đổi cách tính giá.
   */
  contractRouteSources({ contractId }) {
    const c = this.store.get('HOP_DONG', contractId); if (!c) throw new AppError('NOT_FOUND', `Không có hợp đồng ${contractId}`);
    const prices = this.store.all('PRICE_HISTORY'); const cfg = this._cfg(); const code = c.price_code || ''; const today = localToday();
    // TUYẾN CỦA HỢP ĐỒNG (rà soát #38): tuyến có phiếu cân của xe trong phạm vi hợp đồng (đúng hiệu lực xe) ∪ tuyến có dòng giá
    // trong mã đang gán ∪ tuyến có giá riêng hợp đồng. Các tuyến khác vẫn trả về (inContract=false) để xem nguồn giá nếu sau này chạy.
    const byPlate = new Map(); for (const v of this.store.find('HOP_DONG_XE', (x) => x.contract_id === contractId)) { if (!byPlate.has(v.plate_no)) byPlate.set(v.plate_no, []); byPlate.get(v.plate_no).push(v); }
    const inScope = (v, d) => v.effective_from <= d && (!v.effective_to || v.effective_to >= d);
    const used = new Set();
    if (byPlate.size) for (const t of this.store.all('PHIEU_CAN')) { const vs = !t.is_deleted && byPlate.get(t.plate_no); if (vs && vs.some((v) => inScope(v, t.weigh1_date))) used.add(t.route_code); }
    const priced = new Set(prices.filter((p) => (code && (p.price_code === code || (code === 'PT-TD' && !p.price_code && !p.contract_id && p.price_method !== 'CO_DINH'))) || (!p.price_code && p.contract_id === contractId)).map((p) => p.route_code));
    const items = [];
    for (const r of this.store.all('TUYEN_VC').filter((x) => x.is_active).sort((a, b) => a.route_code.localeCompare(b.route_code, 'vi', { numeric: true }))) {
      const sel = E.selectPriceVersion(prices, r.route_code, contractId, today, today, cfg, code);
      if (!sel.price) continue; // tuyến chưa có giá hiệu lực: không có nguồn để nêu
      const p = sel.price; const source = code && (p.price_code === code || (code === 'PT-TD' && !p.price_code && !p.contract_id)) ? 'CODE' : p.contract_id ? 'CONTRACT' : 'GENERAL';
      const inUse = used.has(r.route_code);
      let contractPrice = p.fixed_price;
      if (p.price_method !== 'CO_DINH') {
        try {
          const cp = E.computeContractPrice(r, p, cfg);
          contractPrice = cp ? cp.contractPrice : p.new_price;
        } catch {
          contractPrice = p.new_price;
        }
      }
      items.push({ routeCode: r.route_code, routeName: r.route_name, source, priceCode: p.price_code || (source === 'CODE' ? code : ''), priceMethod: lineMethod(p), priceId: p.price_id, inUse, inContract: inUse || priced.has(r.route_code), contractPrice });
    }
    items.sort((a, b) => Number(b.inContract) - Number(a.inContract)); // tuyến của hợp đồng lên đầu (sort ổn định, giữ thứ tự mã tuyến)
    const mine = items.filter((x) => x.inContract);
    // allFixed: true = mọi tuyến của hợp đồng là giá cố định (không cần nhập dầu); false = còn tuyến theo giá dầu; null = chưa xác định (chưa có tuyến của hợp đồng)
    return { items, contractRoutes: mine.length, allFixed: mine.length ? mine.every((x) => x.priceMethod === 'CO_DINH') : null };
  }

  // ─────────────────────── ĐƠN GIÁ CỦA HỢP ĐỒNG (cách đơn giản) ───────────────────────
  // Hợp đồng không "gán mã": chỉ THÊM ĐƠN GIÁ — chọn tuyến → chọn dòng đơn giá của tuyến (thuộc PT-CD / PT-TD), hoặc chọn dòng đơn giá trước → tuyến tự xác định.
  // Đơn giá được chọn = một dòng giá RIÊNG của hợp đồng (PRICE_HISTORY có contract_id, price_code rỗng) sao chép từ dòng nguồn; engine đã ưu tiên giá riêng nên không đổi cách tính.

  /** Dòng đơn giá "dùng chung" có thể chọn cho hợp đồng: thuộc PT-CD / PT-TD (kể cả giá chung cũ chưa gắn mã), không phải giá riêng của một hợp đồng. */
  _isSharedLine(p) { return !p.contract_id && (!p.price_code || p.price_code === 'PT-CD' || p.price_code === 'PT-TD'); }
  _lineCode(p) { return p.price_code || (p.contract_id ? '' : (p.price_method === 'CO_DINH' ? 'PT-CD' : 'PT-TD')); }
  /** Tiền của dòng giá: cố định → đơn giá cố định; theo dầu → ĐG_HĐ Tầng A (cùng cách listPrices / contractRouteSources đang tính). */
  _lineAmount(route, p, cfg) {
    if (p.price_method === 'CO_DINH') return Number(p.fixed_price);
    try { const cp = route ? E.computeContractPrice(route, p, cfg) : null; return cp ? cp.contractPrice : p.new_price; } catch { return p.new_price; }
  }
  _priceItem(p, cfg, extra = {}) {
    const r = this.store.get('TUYEN_VC', p.route_code); const m = lineMethod(p); const amount = this._lineAmount(r, p, cfg);
    return { routeCode: p.route_code, routeName: r ? r.route_name : '', distanceKm: r ? r.distance_km : null, uom: r ? r.uom : '', priceId: p.price_id, priceCode: this._lineCode(p), priceMethod: m, priceMethodLabel: PRICE_METHOD_LABEL[m],
      contractPrice: amount, fixedPrice: m === 'CO_DINH' ? Number(p.fixed_price) : null, effectiveFrom: p.effective_from, status: p.status, ...extra };
  }
  _needContract(contractId) { const c = this.store.get('HOP_DONG', contractId); if (!c) throw new AppError('NOT_FOUND', `Không có hợp đồng ${contractId}`); return c; }

  /**
   * Từng tuyến của hợp đồng với dòng đơn giá ĐANG ÁP DỤNG (hôm nay) — đúng dòng engine chọn (dùng contractRouteSources → selectPriceVersion, không tính lại).
   * source: HOP_DONG (giá riêng của hợp đồng) | PHUONG_THUC (dòng của PT-CD/PT-TD hoặc mã gán cho hợp đồng) | CHUNG (giá chung cũ). Chỉ đọc.
   */
  contractRoutePrices({ contractId }) {
    this._needContract(contractId); const cfg = this._cfg();
    const SRC = { CONTRACT: 'HOP_DONG', CODE: 'PHUONG_THUC', GENERAL: 'CHUNG' };
    const items = this.contractRouteSources({ contractId }).items.filter((x) => x.inContract).map((x) => {
      const p = this.store.get('PRICE_HISTORY', x.priceId);
      return this._priceItem(p, cfg, { source: SRC[x.source], inUse: x.inUse });
    });
    return { items, total: items.length };
  }

  /** Dòng đơn giá có thể chọn cho hợp đồng. priceId → đúng dòng đó (kèm routeCode của nó); routeCode → mọi dòng ACTIVE của tuyến thuộc PT-CD/PT-TD; không truyền → mọi dòng ACTIVE như vậy. Chỉ đọc. */
  contractPriceChoices({ contractId, routeCode = '', priceId = '' } = {}) {
    this._needContract(contractId); const cfg = this._cfg();
    const own = this.store.find('PRICE_HISTORY', (p) => p.contract_id === contractId && !p.price_code && p.status === 'ACTIVE');
    const flag = (p) => ({ chosenForContract: own.some((o) => o.route_code === p.route_code) });
    let lines;
    if (priceId) {
      const p = this.store.get('PRICE_HISTORY', priceId); if (!p) throw new AppError('NOT_FOUND', `Không có đơn giá ${priceId}`);
      if (routeCode && routeCode !== p.route_code) throw new AppError('VALIDATION_FAILED', `Đơn giá ${priceId} thuộc tuyến ${p.route_code}, không phải tuyến ${routeCode}`);
      lines = [p];
    } else {
      lines = this.store.find('PRICE_HISTORY', (p) => this._isSharedLine(p) && p.status === 'ACTIVE' && (!routeCode || p.route_code === routeCode))
        .sort((a, b) => a.route_code.localeCompare(b.route_code, 'vi', { numeric: true }) || this._lineCode(a).localeCompare(this._lineCode(b)) || (a.effective_from < b.effective_from ? 1 : -1));
    }
    const items = lines.map((p) => this._priceItem(p, cfg, flag(p)));
    return { items, total: items.length, routeCode: priceId && items[0] ? items[0].routeCode : routeCode };
  }

  /**
   * Thêm đơn giá cho hợp đồng: sao chép dòng nguồn (priceId, thuộc PT-CD/PT-TD, đang ACTIVE) thành dòng giá RIÊNG của hợp đồng, áp dụng ngay — MỘT giao dịch.
   * Giữ hình thức (CO_DINH / THEO_DAU) của nguồn; tuyến lấy từ nguồn (routeCode truyền vào mà khác → VALIDATION_FAILED).
   * Chốt chặn giữ nguyên: E_PRICE_DATE_OVERLAP (ngày không sau bản giá riêng đang dùng), kỳ đã xác nhận/khóa giữ số (E_PRICE_USED), kiểm hợp lệ như createPriceVersion.
   */
  async addContractPrice({ contractId, routeCode = '', priceId, effectiveFrom = '', user }) {
    const c = this._needContract(contractId);
    if (!priceId) throw new AppError('VALIDATION_FAILED', 'Chọn đơn giá cần thêm cho hợp đồng');
    const src = this.store.get('PRICE_HISTORY', priceId); if (!src) throw new AppError('NOT_FOUND', `Không có đơn giá ${priceId}`);
    const rc = String(routeCode || '').trim().toUpperCase();
    if (rc && rc !== src.route_code) throw new AppError('VALIDATION_FAILED', `Đơn giá ${priceId} thuộc tuyến ${src.route_code}, không phải tuyến ${rc} — chọn đúng đơn giá của tuyến`);
    if (!this._isSharedLine(src)) throw new AppError('VALIDATION_FAILED', `Đơn giá ${priceId} không thuộc đơn giá cố định / điều chỉnh theo giá dầu — chỉ chọn được dòng của PT-CD hoặc PT-TD`);
    if (src.status !== 'ACTIVE') throw new AppError('VALIDATION_FAILED', `Đơn giá ${priceId} đang ở trạng thái ${src.status} — chỉ chọn được đơn giá đang áp dụng`);
    const from = effectiveFrom || localToday();
    const record = { contractId, priceCode: '' };
    for (const k of PRICE_FIELDS) if (!['price_code', 'contract_id', 'effective_from'].includes(k)) record[k] = src[k];
    record.price_method = src.price_method || 'THEO_DAU'; record.effective_from = from;
    record.source_note = `Chọn từ đơn giá ${priceId} (${this._lineCode(src)})`;
    if (record.base_price_excl_vat !== '' && record.base_price_excl_vat != null && !String(record.base_price_source || '').trim()) record.base_price_source = `Sao chép từ ${priceId}`;
    const { rec, route } = this._buildPriceVersion(record);
    rec.status = 'ACTIVE';
    const { prev, drafts, to } = this._activationPlan(rec);
    // kỳ của hợp đồng này ở tuyến này: đã xác nhận/khóa có ngày từ ngày hiệu lực → dòng riêng mới sẽ thay giá phía sau lưng kỳ đó; kỳ nháp → cần tính lại
    const inRoute = this.store.find('TRANSPORT_CALCULATION', (x) => x.is_current && x.contract_id === contractId && x.route_code === rec.route_code)
      .map((x) => this.store.get('KY_TINH', x.period_id)).filter((p) => p && p.status !== 'HUY' && p.date_to >= from);
    const hard = inRoute.filter((p) => p.status !== 'NHAP');
    if (hard.length) throw businessError('E_PRICE_USED', `Kỳ ${[...new Set(hard.map((p) => p.period_code))].join(', ')} đã xác nhận/khóa — chọn ngày hiệu lực sau ${hard.map((p) => p.date_to).sort().pop()}`);
    const draftPeriods = [...new Set([...drafts, ...inRoute.map((p) => p.period_id)])];
    const out = await this.store.transaction((tx) => {
      const closed = [];
      for (const x of prev) { tx.update('PRICE_HISTORY', x.price_id, { effective_to: to, status: 'CLOSED' }); closed.push({ priceId: x.price_id, effectiveTo: to }); }
      // thêm lại đúng ngày của một dòng đã gỡ: dùng lại chính dòng đó (khóa duy nhất tuyến + hợp đồng + ngày hiệu lực) → bên nhận gói nhận bản cập nhật, không phải bản trùng khóa
      const dead = this.store.find('PRICE_HISTORY', (x) => isVoidLine(x) && x.route_code === rec.route_code && x.contract_id === contractId && !x.price_code && x.effective_from === rec.effective_from)[0];
      let r;
      if (dead) { const patch = {}; for (const k of PRICE_FIELDS) patch[k] = rec[k]; Object.assign(patch, { status: 'ACTIVE', effective_to: '', is_used: false }); r = tx.update('PRICE_HISTORY', dead.price_id, patch).after; } else r = tx.insert('PRICE_HISTORY', rec);
      for (const pid of draftPeriods) tx.update('KY_TINH', pid, { needs_recalc: true });
      tx.audit('PRICE_CREATE', 'PRICE_HISTORY', r.price_id, null, r, { reason: `Thêm đơn giá cho hợp đồng ${c.contract_code || contractId} từ ${priceId}` });
      tx.audit('PRICE_ACTIVATE', 'PRICE_HISTORY', r.price_id, { status: 'DRAFT' }, { status: 'ACTIVE', closed });
      const w = remindTx(tx, this.store, { entity: 'PRICE_HISTORY', entityId: r.price_id, action: 'PRICE_ACTIVATE',
        summary: `Thêm đơn giá riêng cho HĐ ${contractId}, tuyến ${r.route_code} từ ${r.effective_from} (chọn từ ${priceId}): ${r.price_method === 'CO_DINH' ? `ĐƠN GIÁ CỐ ĐỊNH ${r.fixed_price}` : `đơn giá mới ${r.new_price}, dầu ${r.fuel_price_excl_vat}, ĐM ${r.fuel_norm_l_per_km}, KL_TB ${r.avg_load_ton}`}` });
      return { r, closed, w };
    }, { user: user.username });
    const warnings = out.w ? [out.w] : [];
    const sel = E.selectPriceVersion(this.store.all('PRICE_HISTORY'), rec.route_code, contractId, from, from, this._cfg(), c.price_code || '');
    if (sel.price && sel.price.price_id !== out.r.price_id) warnings.push({ code: 'W_CONTRACT_PRICE_NOT_PREFERRED', level: 'WARNING', message: `Hợp đồng đang dùng mã đơn giá ${c.price_code} nên tuyến ${rec.route_code} vẫn tính theo ${sel.price.price_id} — đơn giá vừa thêm chưa được ưu tiên` });
    return { record: out.r, contractPrice: this._lineAmount(route, out.r, this._cfg()), closed: out.closed, affectedPeriods: draftPeriods, warnings };
  }

  /**
   * Gỡ đơn giá RIÊNG của hợp đồng (chưa dùng ở kỳ nào): xóa dòng; nếu nó đã đóng bản riêng trước đó thì mở lại bản trước. Đã dùng (kỳ đã xác nhận/khóa) → từ chối, thêm đơn giá mới thay vì xóa.
   * Chỉ gỡ được bản MỚI NHẤT của tuyến (tránh để hở lịch sử).
   */
  async removeContractPrice({ contractId, priceId, user }) {
    const c = this._needContract(contractId);
    const p = this.store.get('PRICE_HISTORY', priceId); if (!p) throw new AppError('NOT_FOUND', `Không có đơn giá ${priceId}`);
    if (isVoidLine(p)) throw new AppError('NOT_FOUND', `Đơn giá ${priceId} đã được gỡ trước đó`);
    if (p.contract_id !== contractId || p.price_code) throw new AppError('VALIDATION_FAILED', `Đơn giá ${priceId} không phải đơn giá riêng của hợp đồng ${c.contract_code || contractId} — không gỡ ở đây`);
    const calcs = this.store.find('TRANSPORT_CALCULATION', (x) => x.is_current && x.price_id === priceId);
    const periods = [...new Set(calcs.map((x) => x.period_id))].map((id) => this.store.get('KY_TINH', id)).filter((k) => k && k.status !== 'HUY');
    const hard = periods.filter((k) => k.status !== 'NHAP');
    if (p.is_used || hard.length) throw businessError('E_PRICE_USED', `Đơn giá ${priceId} đã dùng ở ${hard.length ? `kỳ ${hard.map((k) => k.period_code).join(', ')}` : 'kỳ đã xác nhận'} — không xóa; hãy thêm đơn giá mới (ngày hiệu lực sau) thay thế`);
    const same = this.store.find('PRICE_HISTORY', (x) => x.price_id !== priceId && x.route_code === p.route_code && x.contract_id === contractId && !x.price_code && !isVoidLine(x));
    if (same.some((x) => x.version_no > p.version_no)) throw businessError('E_PRICE_USED', `Đơn giá ${priceId} không phải bản mới nhất của tuyến ${p.route_code} — gỡ bản mới nhất trước`);
    const before = same.filter((x) => x.status !== 'DRAFT' && x.version_no < p.version_no && x.effective_to === addDays(p.effective_from, -1));
    const drafts = periods.filter((k) => k.status === 'NHAP').map((k) => k.period_id);
    const w = await this.store.transaction((tx) => {
      for (const x of before) tx.update('PRICE_HISTORY', x.price_id, { effective_to: '', status: 'ACTIVE' });
      // không xóa cứng: gói Danh mục chỉ cập nhật/thêm, không mang lệnh xóa → đóng dòng (hiệu lực kết thúc trước ngày bắt đầu) để máy nhận cũng thôi dùng
      tx.update('PRICE_HISTORY', priceId, { status: 'CLOSED', effective_to: addDays(p.effective_from, -1) });
      for (const pid of drafts) tx.update('KY_TINH', pid, { needs_recalc: true });
      tx.audit('PRICE_REMOVE', 'PRICE_HISTORY', priceId, p, { reopened: before.map((x) => x.price_id) }, { reason: `Gỡ đơn giá riêng khỏi hợp đồng ${contractId}` });
      return remindTx(tx, this.store, { entity: 'PRICE_HISTORY', entityId: priceId, action: 'PRICE_REMOVE', summary: `Gỡ đơn giá riêng ${priceId} (HĐ ${contractId}, tuyến ${p.route_code})` });
    }, { user: user.username });
    return { removed: priceId, routeCode: p.route_code, reopened: before.map((x) => x.price_id), affectedPeriods: drafts, warnings: w ? [w] : [] };
  }

  /**
   * Xóa dòng đơn giá DÙNG CHUNG (không phải giá riêng của hợp đồng) ở Danh mục Đơn giá.
   * Nháp → xóa hẳn (nháp không truyền sang nhà máy khác). Đã kích hoạt nhưng chưa dùng ở kỳ nào → ĐÓNG dòng (hiệu lực kết thúc trước ngày bắt đầu, như removeContractPrice)
   * để gói Danh mục mang trạng thái "đã gỡ" sang nhà máy khác; bản trước (nếu bị bản này đóng) được mở lại. Đã dùng ở kỳ đã xác nhận/khóa → E_PRICE_USED (thêm bản mới thay vì xóa).
   */
  async removePriceLine({ priceId, user }) {
    const p = this.store.get('PRICE_HISTORY', priceId); if (!p) throw new AppError('NOT_FOUND', `Không có đơn giá ${priceId}`);
    if (isVoidLine(p)) throw new AppError('NOT_FOUND', `Đơn giá ${priceId} đã được xóa trước đó`);
    if (p.contract_id) throw new AppError('VALIDATION_FAILED', `Đơn giá ${priceId} là giá riêng của hợp đồng ${p.contract_id} — gỡ ở màn Hợp đồng › Tuyến và đơn giá vận chuyển`);
    const calcs = this.store.find('TRANSPORT_CALCULATION', (x) => x.is_current && x.price_id === priceId);
    const periods = [...new Set(calcs.map((x) => x.period_id))].map((id) => this.store.get('KY_TINH', id)).filter((k) => k && k.status !== 'HUY');
    const hard = periods.filter((k) => k.status !== 'NHAP');
    if (p.is_used || hard.length) throw businessError('E_PRICE_USED', `Đơn giá ${priceId} đã dùng ở ${hard.length ? `kỳ ${hard.map((k) => k.period_code).join(', ')}` : 'kỳ đã xác nhận'} — không xóa; hãy thêm đơn giá mới (ngày cập nhật mới) để thay`);
    const scope = (x) => x.price_id !== priceId && x.route_code === p.route_code && !x.contract_id && (x.price_code || '') === (p.price_code || '') && !isVoidLine(x);
    const same = this.store.find('PRICE_HISTORY', scope);
    if (p.status !== 'DRAFT' && same.some((x) => x.status !== 'DRAFT' && x.version_no > p.version_no)) throw businessError('E_PRICE_USED', `Đơn giá ${priceId} không phải bản mới nhất của tuyến ${p.route_code} — xóa bản mới nhất trước`);
    const before = p.status === 'DRAFT' ? [] : same.filter((x) => x.status !== 'DRAFT' && x.version_no < p.version_no && x.effective_to === addDays(p.effective_from, -1));
    const drafts = periods.filter((k) => k.status === 'NHAP').map((k) => k.period_id);
    const w = await this.store.transaction((tx) => {
      for (const x of before) tx.update('PRICE_HISTORY', x.price_id, { effective_to: '', status: 'ACTIVE' });
      if (p.status === 'DRAFT') tx.remove('PRICE_HISTORY', priceId);
      else tx.update('PRICE_HISTORY', priceId, { status: 'CLOSED', effective_to: addDays(p.effective_from, -1) });
      for (const pid of drafts) tx.update('KY_TINH', pid, { needs_recalc: true });
      tx.audit('PRICE_REMOVE', 'PRICE_HISTORY', priceId, p, { reopened: before.map((x) => x.price_id) }, { reason: `Xóa đơn giá dùng chung ${priceId} (tuyến ${p.route_code})` });
      return p.status === 'DRAFT' ? null : remindTx(tx, this.store, { entity: 'PRICE_HISTORY', entityId: priceId, action: 'PRICE_REMOVE', summary: `Xóa đơn giá ${priceId} (tuyến ${p.route_code}, từ ${p.effective_from})` });
    }, { user: user.username });
    return { removed: priceId, routeCode: p.route_code, wasDraft: p.status === 'DRAFT', reopened: before.map((x) => x.price_id), affectedPeriods: drafts, warnings: w ? [w] : [] };
  }

  /** Thống kê CHỈ ĐỌC giao nhận dầu của hợp đồng theo tuyến (bỏ dòng đã xóa). Không có thao tác ghi — dầu nhập ở màn Giao nhận dầu. */
  contractFuelStats({ contractId }) {
    this._needContract(contractId);
    const by = new Map();
    for (const f of this.store.find('GIAO_NHAN_DAU', (x) => x.contract_id === contractId && !x.is_deleted)) {
      const g = by.get(f.route_code) || { routeCode: f.route_code, receipts: 0, liters: 0, amount: 0, firstDate: '', lastDate: '' };
      const q = Number(f.qty_liter) || 0; g.receipts += 1; g.liters += q; g.amount += q * (Number(f.fuel_price_excl_vat) || 0);
      if (!g.firstDate || f.receive_date < g.firstDate) g.firstDate = f.receive_date;
      if (!g.lastDate || f.receive_date > g.lastDate) g.lastDate = f.receive_date;
      by.set(f.route_code, g);
    }
    const items = [...by.values()].sort((a, b) => a.routeCode.localeCompare(b.routeCode, 'vi', { numeric: true })).map((g) => {
      const r = this.store.get('TUYEN_VC', g.routeCode);
      const liters = Math.round(g.liters * 1000) / 1000; const amount = Math.round(g.amount);
      return { ...g, routeName: r ? r.route_name : '', liters, amount, avgFuelPrice: liters ? Math.round(g.amount / g.liters) : 0 };
    });
    const totals = items.reduce((t, x) => ({ receipts: t.receipts + x.receipts, liters: t.liters + x.liters, amount: t.amount + x.amount }), { receipts: 0, liters: 0, amount: 0 });
    totals.liters = Math.round(totals.liters * 1000) / 1000;
    return { contractId, items, total: items.length, totals };
  }

  // ─────────────────────── MÃ ĐƠN GIÁ (cha) → DÒNG GIÁ (con) ───────────────────────
  // Cha: Đơn vị (DON_VI) → Mã đơn giá (MA_DON_GIA). Con: dòng giá = PRICE_HISTORY có price_code (tuyến + đơn giá, hiệu lực). Hợp đồng chọn mã ở HOP_DONG.price_code.
  // Hợp đồng không chọn mã → giá chung / giá riêng hợp đồng chạy NGUYÊN NHƯ CŨ (xem engine/period.js selectPriceVersion).

  /** Hình thức của mã. Cột rỗng (mã 1.5.x) → suy từ các dòng: không dòng/toàn cố định → CO_DINH; toàn khác → THEO_DAU; lẫn cả hai → HON_HOP. */
  _codeMethod(c) {
    if (!c) return 'CO_DINH';
    if (c.price_method === 'THEO_DAU' || c.price_method === 'CO_DINH') return c.price_method;
    const ms = new Set(this.store.find('PRICE_HISTORY', (p) => p.price_code === c.price_code).map(lineMethod));
    return ms.size === 0 ? 'CO_DINH' : ms.size === 2 ? 'HON_HOP' : [...ms][0];
  }

  /** Lỗi khi dòng giá không cùng hình thức với mã (dùng chung addCodeLine / updatePriceDraft / activatePrice). */
  _methodMismatch(priceCode, method, lineM) {
    if (method === 'HON_HOP') return new AppError('VALIDATION_FAILED', `Mã ${priceCode}: ${MIXED_WARNING} trước khi thêm / sửa / áp dụng dòng giá`);
    return new AppError('VALIDATION_FAILED', `Mã ${priceCode} là ${PRICE_METHOD_LABEL[method].toLowerCase()} — không thêm dòng ${PRICE_METHOD_LABEL[lineM] ? PRICE_METHOD_LABEL[lineM].toLowerCase() : lineM} (tạo mã đúng hình thức)`);
  }

  /** Số dòng giá / hợp đồng cũ còn chờ chuyển vào PT-TD (để sao lưu an toàn TRƯỚC khi chuyển lần đầu). */
  legacyMigrationPending() {
    return { prices: this.store.all('PRICE_HISTORY').filter((p) => (!p.price_code || p.price_code === '') && (!p.contract_id || p.contract_id === '')).length,
      contracts: this.store.all('HOP_DONG').filter((h) => !h.price_code || h.price_code === '').length };
  }

  /** Nâng cấp một lần khi mở kho: ghi price_method cho mã cũ còn rỗng theo quy tắc suy ra; chuyển dữ liệu cũ vào PT-TD (THEO_DAU). */
  async backfillCodeMethods({ user = { username: 'system' } } = {}) {
    this.ensureDefaultMethods(user);
    await this.ensureDefaultForms(user); // hạt giống Hình thức giá (HINH_THUC_GIA) — bản mới / kho cũ chưa có bảng

    // Chuyển toàn bộ dữ liệu đơn giá cũ (chưa gán mã, không gắn riêng hợp đồng) vào Đơn giá hình thức điều chỉnh dầu (PT-TD)
    const legacyPrices = this.store.all('PRICE_HISTORY').filter((p) => (!p.price_code || p.price_code === '') && (!p.contract_id || p.contract_id === ''));
    if (legacyPrices.length) {
      await this.store.transaction((tx) => {
        for (const p of legacyPrices) {
          tx.update('PRICE_HISTORY', p.price_id, {
            price_code: 'PT-TD',
            price_method: p.price_method || 'THEO_DAU'
          });
          tx.audit('PRICE_LEGACY_MIGRATION', 'PRICE_HISTORY', p.price_id, { price_code: p.price_code, price_method: p.price_method }, { price_code: 'PT-TD', price_method: p.price_method || 'THEO_DAU' }, { reason: 'Chuyển dữ liệu cũ vào Đơn giá hình thức điều chỉnh dầu (PT-TD)' });
        }
      }, { user: user.username });
    }

    // Gán mã đơn giá điều chỉnh dầu PT-TD cho hợp đồng cũ chưa có mã
    const legacyContracts = this.store.all('HOP_DONG').filter((h) => !h.price_code || h.price_code === '');
    if (legacyContracts.length) {
      await this.store.transaction((tx) => {
        for (const h of legacyContracts) {
          tx.update('HOP_DONG', h.contract_id, { price_code: 'PT-TD' });
          tx.audit('CONTRACT_PRICE_CODE_MIGRATION', 'HOP_DONG', h.contract_id, { price_code: h.price_code }, { price_code: 'PT-TD' }, { reason: 'Gán mã PT-TD cho hợp đồng cũ' });
        }
      }, { user: user.username });
    }

    const todo = this.store.all('MA_DON_GIA').filter((c) => !c.price_method).map((c) => ({ c, m: this._codeMethod(c) }));
    const mixed = todo.filter((x) => x.m === 'HON_HOP').map((x) => x.c.price_code); const set = todo.filter((x) => x.m !== 'HON_HOP');
    if (set.length) await this.store.transaction((tx) => { for (const { c, m } of set) { tx.update('MA_DON_GIA', c.price_code, { price_method: m }); tx.audit('PRICE_CODE_METHOD_BACKFILL', 'MA_DON_GIA', c.price_code, { price_method: '' }, { price_method: m }, { reason: 'Nâng cấp 1.7.0: suy hình thức của mã cũ từ các dòng giá' }); } }, { user: user.username });
    return { updated: set.map((x) => x.c.price_code), mixed, legacyPrices: legacyPrices.length, legacyContracts: legacyContracts.length };
  }

  ensureDefaultMethods(user = { username: 'system' }) {
    const defaults = [
      { price_code: 'PT-CD', price_name: 'Đơn giá cố định', price_method: 'CO_DINH', note: 'Mỗi tuyến một đơn giá đ/tấn cố định, không tính chênh lệch dầu' },
      { price_code: 'PT-TD', price_name: 'Đơn giá điều chỉnh dầu', price_method: 'THEO_DAU', note: 'Đơn giá tính theo công thức điều chỉnh giá dầu thực tế' }
    ];
    const unitCode = this.store.unitCode || (this.store.all('DON_VI')[0] || {}).unit_code || 'HAK';
    for (const d of defaults) {
      if (!this.store.get('MA_DON_GIA', d.price_code)) {
        this.store.transaction((tx) => {
          tx.insert('MA_DON_GIA', {
            price_code: d.price_code,
            unit_code: unitCode,
            price_name: d.price_name,
            price_method: d.price_method,
            status: 'ACTIVE',
            note: d.note
          });
        }, { user: user.username || 'system' });
      }
    }
  }

  _codeView(c) {
    const isDefault = c.price_code === 'PT-CD' || c.price_code === 'PT-TD';
    const lines = this.store.find('PRICE_HISTORY', (p) => p.price_code === c.price_code || (
      isDefault && (!p.price_code || p.price_code === '') && !p.contract_id && (
        c.price_method === 'CO_DINH' ? p.price_method === 'CO_DINH' : p.price_method !== 'CO_DINH'
      )
    ));
    const unit = this.store.get('DON_VI', c.unit_code);
    const contracts = this.store.find('HOP_DONG', (h) => h.price_code === c.price_code);
    const method = this._codeMethod(c);
    return { ...c, priceMethod: method, priceMethodLabel: PRICE_METHOD_LABEL[method], ...(method === 'HON_HOP' ? { methodWarning: MIXED_WARNING } : {}), unitName: unit ? unit.unit_name : (c.unit_code || 'Tất cả'), lineCount: lines.length, activeLines: lines.filter((p) => p.status === 'ACTIVE').length, draftLines: lines.filter((p) => p.status === 'DRAFT').length,
      contracts: contracts.map((h) => ({ contractId: h.contract_id, contractCode: h.contract_code })), used: lines.some((p) => p.is_used) };
  }

  /** Cây cha–con: đơn vị → các mã đơn giá. Đơn vị không có mã vẫn hiện (để tạo mã đầu tiên). */
  listPriceCodes({ unitCode = '', includeClosed = true, ensureDefaults = true } = {}) {
    if (ensureDefaults) this.ensureDefaultMethods();
    const codes = this.store.all('MA_DON_GIA').filter((c) => (!unitCode || c.unit_code === unitCode) && (includeClosed || c.status === 'ACTIVE')).map((c) => this._codeView(c))
      .sort((a, b) => a.price_code.localeCompare(b.price_code, 'vi', { numeric: true }));
    const units = this.store.all('DON_VI').filter((u) => !unitCode || u.unit_code === unitCode).sort((a, b) => (a.sign_priority - b.sign_priority) || a.unit_code.localeCompare(b.unit_code))
      .map((u) => ({ unitCode: u.unit_code, unitName: u.unit_name, codes: codes.filter((c) => c.unit_code === u.unit_code) }));
    const methods = ['CO_DINH', 'THEO_DAU', 'HON_HOP'].map((m) => ({ method: m, label: PRICE_METHOD_LABEL[m], codes: codes.filter((c) => c.priceMethod === m) })).filter((g) => g.method !== 'HON_HOP' || g.codes.length);
    return { methods, units, items: codes, total: codes.length };
  }

  getPriceCode({ priceCode }) {
    const c = this.store.get('MA_DON_GIA', priceCode); if (!c) throw new AppError('NOT_FOUND', `Không có mã đơn giá ${priceCode}`);
    const cfg = this._cfg();
    const isDefault = priceCode === 'PT-CD' || priceCode === 'PT-TD';
    const lines = this.store.find('PRICE_HISTORY', (p) => p.price_code === priceCode || (
      isDefault && (!p.price_code || p.price_code === '') && !p.contract_id && (
        c.price_method === 'CO_DINH' ? p.price_method === 'CO_DINH' : p.price_method !== 'CO_DINH'
      )
    ))
      .sort((a, b) => a.route_code.localeCompare(b.route_code, 'vi', { numeric: true }) || a.version_no - b.version_no)
      .map((p) => { const r = this.store.get('TUYEN_VC', p.route_code); return { ...p, routeName: r ? r.route_name : '', uom: r ? r.uom : '', contractPrice: r && p.price_method !== 'CO_DINH' ? E.computeContractPrice(r, p, cfg).contractPrice : (p.fixed_price || null) }; });
    return { record: this._codeView(c), lines };
  }

  async savePriceCode({ record = {}, rowVersion, create = false, reason = '', user }) {
    const r = toSnake(record); const code = String(r.price_code || '').trim().toUpperCase();
    const bad = [];
    if (!/^[A-Z0-9][A-Z0-9._-]{1,23}$/.test(code)) bad.push('Mã đơn giá 2–24 ký tự: chữ HOA, số, . _ - (vd DG-DH-2026)');
    const name = String(r.price_name || '').trim(); if (!name) bad.push('Thiếu tên mã đơn giá'); else if (name.length > 120) bad.push('Tên mã đơn giá tối đa 120 ký tự');
    if (String(r.note || '').trim().length > 500) bad.push('Ghi chú tối đa 500 ký tự');
    const wantMethod = r.price_method === undefined || r.price_method === null || r.price_method === '' ? '' : String(r.price_method);
    if (wantMethod && !PRICE_METHOD_LABEL[wantMethod]) bad.push('Hình thức giá chỉ có: CO_DINH (đơn giá cố định) hoặc THEO_DAU (đơn giá điều chỉnh dầu)');
    const unitCode = String(r.unit_code || '').trim().toUpperCase() || this.store.unitCode || (this.store.all('DON_VI')[0] || {}).unit_code || '';
    if (unitCode && !this.store.get('DON_VI', unitCode)) bad.push(`Đơn vị ${unitCode || '(chưa chọn)'} không có trong danh mục`);
    if (bad.length) throw new AppError('VALIDATION_FAILED', bad.join('; '), { errors: bad });
    const note = String(r.note || '').trim();
    if (create) {
      if (this.store.get('MA_DON_GIA', code)) throw new AppError('DUPLICATE', `Mã đơn giá ${code} đã có — chọn mã khác hoặc mở mã đó để sửa`);
      return this.store.transaction((tx) => {
        const rec = tx.insert('MA_DON_GIA', { price_code: code, unit_code: unitCode, price_name: name, status: 'ACTIVE', price_method: wantMethod || 'CO_DINH', note });
        tx.audit('PRICE_CODE_CREATE', 'MA_DON_GIA', code, null, rec);
        const w = remindTx(tx, this.store, { entity: 'MA_DON_GIA', entityId: code, action: 'CREATE', summary: `Tạo mã đơn giá ${code} (${name}) cho đơn vị ${unitCode}` });
        return { record: this._codeView(rec), warnings: w ? [w] : [] };
      }, { user: user.username });
    }
    const old = this.store.get('MA_DON_GIA', code); if (!old) throw new AppError('NOT_FOUND', `Không có mã đơn giá ${code}`);
    if (rowVersion === undefined) throw new AppError('VALIDATION_FAILED', 'Sửa mã đơn giá phải gửi rowVersion');
    if (old.unit_code !== unitCode && unitCode) {
      const used = this.store.find('PRICE_HISTORY', (p) => p.price_code === code).length + this.store.find('HOP_DONG', (h) => h.price_code === code).length;
      if (used) throw new AppError('VALIDATION_FAILED', 'Mã đã có dòng giá hoặc đã gán cho hợp đồng — không đổi đơn vị (tạo mã mới cho đơn vị khác)');
    }
    const patch = { unit_code: unitCode || old.unit_code, price_name: name, note };
    if (wantMethod && wantMethod !== this._codeMethod(old)) {
      const used = this.store.find('PRICE_HISTORY', (p) => p.price_code === code).length + this.store.find('HOP_DONG', (h) => h.price_code === code).length;
      if (used) throw new AppError('VALIDATION_FAILED', 'Mã đã có dòng giá hoặc đã gán cho hợp đồng — không đổi hình thức giá (tạo mã mới cho hình thức khác)');
      patch.price_method = wantMethod;
    } else if (!old.price_method && this._codeMethod(old) !== 'HON_HOP') patch.price_method = this._codeMethod(old);
    return this.store.transaction((tx) => {
      const { before, after } = tx.update('MA_DON_GIA', code, patch, { expectedRowVersion: rowVersion });
      tx.audit('PRICE_CODE_UPDATE', 'MA_DON_GIA', code, before, after, { reason });
      return { record: this._codeView(after), warnings: [] };
    }, { user: user.username });
  }

  /** Đóng / mở lại mã đơn giá. Đóng: không thêm dòng giá, không gán cho hợp đồng mới; hợp đồng đang dùng mã vẫn tính bình thường (lịch sử). */
  async setPriceCodeActive({ priceCode, active, rowVersion, reason = '', user }) {
    const c = this.store.get('MA_DON_GIA', priceCode); if (!c) throw new AppError('NOT_FOUND', `Không có mã đơn giá ${priceCode}`);
    return this.store.transaction((tx) => {
      const { before, after } = tx.update('MA_DON_GIA', priceCode, { status: active ? 'ACTIVE' : 'CLOSED' }, { expectedRowVersion: rowVersion });
      tx.audit(active ? 'PRICE_CODE_OPEN' : 'PRICE_CODE_CLOSE', 'MA_DON_GIA', priceCode, before, after, { reason });
      return { record: this._codeView(after) };
    }, { user: user.username });
  }

  /**
   * Thêm DÒNG GIÁ vào mã (con): nhập trực tiếp {routeCode, fixedPrice, effectiveFrom…} hoặc CHỌN MỘT ĐƠN GIÁ CÓ SẴN (fromPriceId) để sao chép vào mã.
   * Mặc định đơn giá CỐ ĐỊNH (đ/tấn, không tính dầu). Dòng mới ở trạng thái NHÁP → "Áp dụng" bằng activatePrice như mọi phiên bản giá.
   */
  async addCodeLine({ priceCode, record = {}, fromPriceId = '', user }) {
    const c = this.store.get('MA_DON_GIA', priceCode); if (!c) throw new AppError('NOT_FOUND', `Không có mã đơn giá ${priceCode}`);
    let base = {};
    if (fromPriceId) {
      const src = this.store.get('PRICE_HISTORY', fromPriceId); if (!src) throw new AppError('NOT_FOUND', `Không có đơn giá ${fromPriceId}`);
      for (const k of PRICE_FIELDS) if (k !== 'price_code' && k !== 'contract_id' && k !== 'effective_from') base[k] = src[k];
      base.source_note = base.source_note || `Sao chép từ ${fromPriceId}`;
      base.price_method = src.price_method || 'THEO_DAU'; // giá cũ cột rỗng = theo giá dầu
    }
    const method = this._codeMethod(c); const asked = toSnake(record).price_method; const copied = base.price_method || '';
    if (method === 'HON_HOP') throw this._methodMismatch(priceCode, method, asked || copied);
    if (asked && asked !== method) throw this._methodMismatch(priceCode, method, asked);
    // sao chép từ giá có sẵn khác hình thức: chỉ khi mã còn TRỐNG (chưa dòng, chưa hợp đồng) thì mã nhận hình thức của dòng đầu tiên
    let adopt = '';
    if (!asked && copied && copied !== method) {
      const used = this.store.find('PRICE_HISTORY', (p) => p.price_code === priceCode).length + this.store.find('HOP_DONG', (h) => h.price_code === priceCode).length;
      if (used) throw this._methodMismatch(priceCode, method, copied);
      adopt = copied;
    }
    const rec = { ...base, ...toSnake(record), price_method: adopt || method, price_code: priceCode, contract_id: '' };
    if (!rec.effective_from) throw new AppError('VALIDATION_FAILED', 'Nhập ngày hiệu lực');
    if (adopt) { // chèn dòng + đổi hình thức mã trong MỘT giao dịch: lỗi ở bước nào cũng không để lại dòng nháp thừa
      const { rec: built, route } = this._buildPriceVersion(rec);
      const out = await this.store.transaction((tx) => {
        const r = tx.insert('PRICE_HISTORY', built); tx.audit('PRICE_CREATE', 'PRICE_HISTORY', r.price_id, null, r);
        const { before, after } = tx.update('MA_DON_GIA', priceCode, { price_method: adopt }, { expectedRowVersion: c.row_version });
        tx.audit('PRICE_CODE_UPDATE', 'MA_DON_GIA', priceCode, before, after, { reason: 'Mã còn trống nhận hình thức giá của dòng sao chép đầu tiên' });
        return r;
      }, { user: user.username });
      return { record: out, contractPrice: E.computeContractPrice(route, out, this._cfg()).contractPrice, warnings: [] };
    }
    return this.createPriceVersion({ record: rec, user });
  }

  // ─────────────────────── HÌNH THỨC GIÁ (danh mục) ───────────────────────
  // Danh mục tra cứu: mỗi mã hình thức (CO_DINH | THEO_DAU) có các dòng theo ngày cập nhật; dòng mới cùng mã đóng dòng cũ (hiệu lực đến = ngày mới − 1).
  // Công thức CHỈ MÔ TẢ (hiển thị): cách tính giá do bộ tính (engine) cố định theo mã hình thức — không đọc bảng này.
  // Dòng giá nối tới hình thức qua price_method (= method_code); hình thức "của" dòng giá = dòng có hiệu lực tại effective_from của dòng giá.
  // Xóa = ĐÓNG dòng với hiệu lực kết thúc trước ngày bắt đầu (gói trao đổi Danh mục chỉ upsert, không mang lệnh xóa) và ẩn khỏi danh sách.

  /** Có đủ dòng hình thức mặc định chưa (đọc thuần, không ghi). */
  formsSeeded() { return FORM_METHODS.every((m) => this.store.all('HINH_THUC_GIA').some((f) => f.method_code === m && !isVoidForm(f))); }

  /** Hạt giống 2 dòng mặc định (ngày 2000-01-01) khi kho chưa có — một giao dịch, có audit; gọi lại không nhân đôi. */
  async ensureDefaultForms(user = { username: 'system' }) {
    if (this.formsSeeded()) return { seeded: [] };
    return this.store.transaction((tx) => {
      const seeded = [];
      for (const m of FORM_METHODS) {
        const rows = tx.all('HINH_THUC_GIA').filter((f) => f.method_code === m);
        if (rows.some((f) => !isVoidForm(f))) continue;
        const id = formIdOf(m, FORM_SEED_DATE); const d = FORM_DEFAULTS[m];
        const dead = rows.find((f) => f.form_id === id);
        if (dead) { const { before, after } = tx.update('HINH_THUC_GIA', id, { status: 'ACTIVE', effective_to: '' }); tx.audit('FORM_SEED', 'HINH_THUC_GIA', id, before, after, { reason: 'Hạt giống hình thức giá mặc định' }); }
        else { const r = tx.insert('HINH_THUC_GIA', { form_id: id, method_code: m, form_name: d.name, formula_text: d.formula, catalog_date: FORM_SEED_DATE, effective_to: '', status: 'ACTIVE', note: '' }); tx.audit('FORM_SEED', 'HINH_THUC_GIA', id, null, r, { reason: 'Hạt giống hình thức giá mặc định' }); }
        seeded.push(id);
      }
      return { seeded };
    }, { user: (user && user.username) || 'system' });
  }

  _formRows(methodCode = '') {
    return this.store.all('HINH_THUC_GIA').filter((f) => !isVoidForm(f) && (!methodCode || f.method_code === methodCode))
      .sort((a, b) => (a.method_code < b.method_code ? -1 : a.method_code > b.method_code ? 1 : a.catalog_date < b.catalog_date ? 1 : a.catalog_date > b.catalog_date ? -1 : 0));
  }
  /** Hình thức có hiệu lực tại một ngày (null nếu kho chưa có dòng nào cho mã). Ngày trước dòng sớm nhất → dòng sớm nhất. */
  _formAt(methodCode, date, rows = this._formRows(methodCode)) {
    const list = rows.filter((f) => f.method_code === methodCode);
    return list.find((f) => f.catalog_date <= date && (!f.effective_to || f.effective_to >= date)) || (list.length && date < list[list.length - 1].catalog_date ? list[list.length - 1] : null);
  }
  _formText(methodCode, f) {
    const d = FORM_DEFAULTS[methodCode] || { name: methodCode, formula: '' };
    return { formId: f ? f.form_id : '', formName: (f && f.form_name) || d.name, formulaText: (f && f.formula_text) || d.formula };
  }
  _linesOfForms() { return this.store.find('PRICE_HISTORY', (p) => !isVoidLine(p)); }
  _formView(f, lines) {
    const rows = this._formRows(f.method_code); const mine = lines.filter((p) => lineMethod(p) === f.method_code && (this._formAt(f.method_code, p.effective_from, rows) || {}).form_id === f.form_id);
    return { formId: f.form_id, methodCode: f.method_code, methodLabel: PRICE_METHOD_LABEL[f.method_code], formName: f.form_name, formulaText: f.formula_text || '', catalogDate: f.catalog_date, effectiveTo: f.effective_to || '', status: f.status,
      priceLineCount: mine.length, activeLineCount: mine.filter((p) => p.status === 'ACTIVE').length, note: f.note || '', rowVersion: f.row_version };
  }
  _needForm(formId) {
    const f = this.store.get('HINH_THUC_GIA', formId);
    if (!f || isVoidForm(f)) throw new AppError('NOT_FOUND', `Không có hình thức giá ${formId}`);
    return f;
  }

  listForms({ includeClosed = true, methodCode = '' } = {}) {
    const lines = this._linesOfForms();
    const items = this._formRows(methodCode).filter((f) => includeClosed || f.status === 'ACTIVE').map((f) => this._formView(f, lines));
    return { items, total: items.length };
  }

  getForm({ formId }) {
    const f = this._needForm(formId); const lines = this._linesOfForms(); const rows = this._formRows(f.method_code);
    const mine = lines.filter((p) => lineMethod(p) === f.method_code && (this._formAt(f.method_code, p.effective_from, rows) || {}).form_id === f.form_id);
    return { record: this._formView(f, lines), lines: this._catalogItems(mine) };
  }

  /** Thêm hình thức mới (create) hoặc sửa mô tả / ghi chú (rowVersion). Mã hình thức + ngày cập nhật không đổi được khi sửa. */
  async saveForm({ record = {}, rowVersion, create = false, user }) {
    const r = toSnake(record);
    if (create) await this.ensureDefaultForms(user);
    return this.store.transaction((tx) => {
      const all = tx.all('HINH_THUC_GIA'); const w = [];
      if (!create) {
        if (!Number.isInteger(rowVersion)) throw new AppError('VALIDATION_FAILED', 'Thiếu rowVersion (phiên bản bản ghi đang sửa) — tải lại dữ liệu rồi thao tác lại', { field: 'rowVersion' });
        const old = all.find((f) => f.form_id === r.form_id);
        if (!old || isVoidForm(old)) throw new AppError('NOT_FOUND', `Không có hình thức giá ${r.form_id || ''}`.trim());
        if (r.method_code && r.method_code !== old.method_code) throw new AppError('VALIDATION_FAILED', 'Không đổi mã hình thức của dòng đã có — thêm dòng mới cho mã hình thức khác');
        if (r.catalog_date && r.catalog_date !== old.catalog_date) throw new AppError('VALIDATION_FAILED', 'Không đổi ngày cập nhật của dòng đã có — thêm dòng mới với ngày cập nhật mới');
        const patch = {};
        if (r.form_name !== undefined) { const n = String(r.form_name).trim(); if (!n) throw new AppError('VALIDATION_FAILED', 'Nhập tên hình thức giá'); patch.form_name = n; }
        if (r.formula_text !== undefined) patch.formula_text = String(r.formula_text).trim() || FORM_DEFAULTS[old.method_code].formula;
        if (r.note !== undefined) patch.note = String(r.note).trim();
        const { before, after } = tx.update('HINH_THUC_GIA', old.form_id, patch, { expectedRowVersion: rowVersion });
        tx.audit('FORM_UPDATE', 'HINH_THUC_GIA', old.form_id, before, after);
        const m = remindTx(tx, this.store, { entity: 'HINH_THUC_GIA', entityId: old.form_id, action: 'UPDATE', summary: `Sửa hình thức giá ${old.form_id} — ${after.form_name}` });
        if (m) w.push(m);
        return { record: this._formViewTx(after, tx), closed: [], warnings: w };
      }
      const method = r.method_code;
      if (!FORM_METHODS.includes(method)) throw new AppError('VALIDATION_FAILED', 'Chọn mã hình thức giá hợp lệ: Đơn giá cố định (CO_DINH) hoặc Đơn giá điều chỉnh theo giá dầu (THEO_DAU)', { field: 'methodCode' });
      const date = r.catalog_date || localToday();
      if (!isDate(date)) throw new AppError('VALIDATION_FAILED', 'Ngày cập nhật phải đúng dạng yyyy-MM-dd', { field: 'catalogDate' });
      const mine = all.filter((f) => f.method_code === method && !isVoidForm(f)).sort((a, b) => (a.catalog_date < b.catalog_date ? 1 : -1));
      const cur = mine[0] || null;
      if (cur && date <= cur.catalog_date) throw new AppError('VALIDATION_FAILED', `Ngày cập nhật ${date} phải SAU ngày của dòng đang hiệu lực (${cur.catalog_date}) — không điền lùi ngày; muốn đổi nội dung dòng đang hiệu lực thì sửa dòng đó`, { field: 'catalogDate' });
      const d = FORM_DEFAULTS[method]; const id = formIdOf(method, date);
      const content = { form_name: String(r.form_name || '').trim() || d.name, formula_text: String(r.formula_text || '').trim() || d.formula, note: String(r.note || '').trim(), status: 'ACTIVE', effective_to: '' };
      const closed = [];
      if (cur) {
        const { before, after } = tx.update('HINH_THUC_GIA', cur.form_id, { effective_to: addDays(date, -1), status: 'CLOSED' });
        tx.audit('FORM_CLOSE', 'HINH_THUC_GIA', cur.form_id, before, after, { reason: `Có hình thức mới ngày ${date} cùng mã ${method}` }); closed.push(cur.form_id);
      }
      const dead = all.find((f) => f.form_id === id); // dòng đã gỡ cùng mã + ngày: dùng lại (khóa duy nhất mã + ngày)
      let row;
      if (dead) { row = tx.update('HINH_THUC_GIA', id, { method_code: method, catalog_date: date, ...content }).after; tx.audit('FORM_CREATE', 'HINH_THUC_GIA', id, dead, row, { reason: 'Thêm lại dòng đã gỡ' }); }
      else { row = tx.insert('HINH_THUC_GIA', { form_id: id, method_code: method, catalog_date: date, ...content }); tx.audit('FORM_CREATE', 'HINH_THUC_GIA', id, null, row); }
      const m = remindTx(tx, this.store, { entity: 'HINH_THUC_GIA', entityId: id, action: 'CREATE', summary: `Thêm hình thức giá ${id} — ${row.form_name} (từ ${date})` });
      if (m) w.push(m);
      return { record: this._formViewTx(row, tx), closed, warnings: w };
    }, { user: user.username });
  }
  _formViewTx(f, tx) { void tx; return this._formView(f, this._linesOfForms()); }

  /** Xóa hình thức = đóng dòng (hiệu lực kết thúc trước ngày bắt đầu) và mở lại dòng trước. Chỉ bản MỚI NHẤT của mã, chưa có đơn giá nào dùng, và không phải dòng duy nhất của mã. */
  async removeForm({ formId, user }) {
    this._needForm(formId);
    return this.store.transaction((tx) => {
      const f = tx.get('HINH_THUC_GIA', formId); const rows = tx.all('HINH_THUC_GIA').filter((x) => x.method_code === f.method_code && !isVoidForm(x));
      if (rows.some((x) => x.catalog_date > f.catalog_date)) throw businessError('E_FORM_NOT_LATEST', `Hình thức ${formId} không phải dòng mới nhất của mã ${f.method_code} — xóa dòng mới nhất trước`);
      const sorted = rows.sort((a, b) => (a.catalog_date < b.catalog_date ? 1 : -1));
      const used = this._linesOfForms().filter((p) => lineMethod(p) === f.method_code && (this._formAt(f.method_code, p.effective_from, sorted) || {}).form_id === formId);
      if (used.length) throw businessError('E_FORM_IN_USE', `Hình thức ${formId} đang có ${used.length} đơn giá dùng (tính theo ngày hiệu lực của đơn giá) — không xóa. Muốn đổi cách mô tả thì sửa dòng này hoặc thêm dòng hình thức mới (ngày cập nhật mới); thêm / sửa / xóa đơn giá ở Danh mục › Đơn giá`, { lineCount: used.length, priceIds: used.slice(0, 20).map((p) => p.price_id) });
      if (rows.length < 2) throw businessError('E_FORM_LAST', `Hình thức ${formId} là dòng duy nhất của mã ${f.method_code} — hệ thống luôn cần một dòng cho mỗi mã hình thức; hãy thêm dòng mới (ngày cập nhật mới) hoặc sửa mô tả`);
      const prev = sorted[1] && sorted[1].effective_to === addDays(f.catalog_date, -1) ? sorted[1] : null;
      const reopened = [];
      if (prev) { tx.update('HINH_THUC_GIA', prev.form_id, { effective_to: '', status: 'ACTIVE' }); reopened.push(prev.form_id); }
      // không xóa cứng: gói Danh mục chỉ cập nhật/thêm → đóng dòng với hiệu lực kết thúc trước ngày bắt đầu để máy nhận cũng thôi dùng
      const { before, after } = tx.update('HINH_THUC_GIA', formId, { status: 'CLOSED', effective_to: addDays(f.catalog_date, -1) });
      tx.audit('FORM_REMOVE', 'HINH_THUC_GIA', formId, before, { ...after, reopened }, { reason: 'Gỡ hình thức giá chưa có đơn giá dùng' });
      const m = remindTx(tx, this.store, { entity: 'HINH_THUC_GIA', entityId: formId, action: 'REMOVE', summary: `Gỡ hình thức giá ${formId} — ${f.form_name}` });
      return { removed: formId, methodCode: f.method_code, reopened, warnings: m ? [m] : [] };
    }, { user: user.username });
  }

  // ─────────────────────── DANH MỤC ĐƠN GIÁ (phẳng) ───────────────────────
  _catalogItems(lines) {
    const cfg = this._cfg(); const rows = this._formRows();
    return lines.map((p) => {
      const rt = this.store.get('TUYEN_VC', p.route_code); const m = lineMethod(p); const f = this._formAt(m, p.effective_from, rows); const t = this._formText(m, f);
      const price = this._lineAmount(rt, p, cfg);
      return { updateDate: p.effective_from, priceId: p.price_id, priceCode: p.price_code || '', contractId: p.contract_id || '', routeCode: p.route_code, routeName: rt ? rt.route_name : '', uom: rt ? rt.uom : '',
        methodCode: m, methodLabel: PRICE_METHOD_LABEL[m], formId: t.formId, formName: t.formName, formulaText: t.formulaText,
        price: price === undefined || price === null || price === '' ? null : Number(price), fixedPrice: m === 'CO_DINH' ? Number(p.fixed_price) : null, newPrice: m === 'THEO_DAU' ? numOrNull(p.new_price) : null,
        contractPrice: m === 'THEO_DAU' ? (price === undefined ? null : Number(price)) : null, fuelPriceExclVat: m === 'THEO_DAU' ? numOrNull(p.fuel_price_excl_vat) : null, fuelNormLPerKm: m === 'THEO_DAU' ? numOrNull(p.fuel_norm_l_per_km) : null,
        avgLoadTon: m === 'THEO_DAU' ? numOrNull(p.avg_load_ton) : null, avgVolumeM3: m === 'THEO_DAU' ? numOrNull(p.avg_volume_m3) : null,
        effectiveFrom: p.effective_from, effectiveTo: p.effective_to || '', status: p.status, isUsed: !!p.is_used, versionNo: p.version_no, rowVersion: p.row_version };
    }).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : 0) || a.routeCode.localeCompare(b.routeCode, 'vi', { numeric: true }) || (a.priceId < b.priceId ? -1 : 1));
  }

  /** Danh mục đơn giá phẳng (chỉ đọc): mọi dòng đơn giá (giá chung, giá của mã, giá riêng hợp đồng; trừ dòng đã gỡ) kèm hình thức có hiệu lực tại ngày hiệu lực của dòng. */
  priceCatalog({ routeCode = '', methodCode = '', status = '' } = {}) {
    if (methodCode && !FORM_METHODS.includes(methodCode)) throw new AppError('VALIDATION_FAILED', 'Mã hình thức không hợp lệ (CO_DINH | THEO_DAU)');
    const lines = this.store.find('PRICE_HISTORY', (p) => !isVoidLine(p) && (!routeCode || p.route_code === routeCode) && (!status || p.status === status) && (!methodCode || lineMethod(p) === methodCode));
    const items = this._catalogItems(lines);
    return { items, total: items.length };
  }

  /** Đơn giá của một tuyến (kèm hình thức có hiệu lực). Chỉ đọc. */
  routePriceLines({ routeCode }) {
    const r = this.store.get('TUYEN_VC', routeCode); if (!r) throw new AppError('NOT_FOUND', `Không có tuyến ${routeCode}`);
    const { items } = this.priceCatalog({ routeCode });
    return { route: { routeCode: r.route_code, routeName: r.route_name, distanceKm: r.distance_km, uom: r.uom, isActive: !!r.is_active }, items, total: items.length };
  }
}

module.exports = { CatalogService, ROUTE_FIELDS, ROUTE_CALC_FIELDS };
