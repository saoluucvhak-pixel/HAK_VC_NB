'use strict';
/**
 * MasterDataService — danh mục ĐƠN VỊ, XE, HỢP ĐỒNG (+ phạm vi xe) (API units.* / vehicles.* / contracts.*).
 * Bản cài nào cũng sửa được (chốt 25/09/2026); mỗi thay đổi → nhắc sửa giống ở các nhà máy còn lại (SYNC_REMINDER).
 * Không xóa cứng: ngừng dùng (is_active = false).
 */
const E = require('../engine');
const { AppError } = require('../../shared/errors');
const { remindTx } = require('./SyncReminderService');
const { plateKey } = require('../import/mapping');

const snake = (k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toSnake = (o = {}) => Object.fromEntries(Object.entries(o).map(([k, v]) => [snake(k), v]));
const trimAll = (o) => { for (const k of Object.keys(o)) if (typeof o[k] === 'string') o[k] = o[k].replace(/\s+/g, ' ').trim(); return o; };
const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const diffSummary = (before, patch) => Object.keys(patch).map((k) => `${k}: ${before[k] === '' || before[k] === undefined ? '(trống)' : before[k]} → ${patch[k] === '' ? '(trống)' : patch[k]}`).join('; ');

const UNIT_FIELDS = ['unit_code', 'unit_name', 'short_name', 'unit_type', 'name_aliases', 'tax_code', 'address', 'legal_rep_name', 'legal_rep_salutation', 'legal_rep_title',
  'factory_name', 'email', 'phone', 'doc_display_name', 'sign_priority', 'accountant_name', 'fuel_prefix', 'note'];
const VEH_FIELDS = ['plate_no', 'owner_unit_code', 'fuel_code', 'note'];
const CONTRACT_FIELDS = ['contract_id', 'contract_code', 'contract_no', 'customer_unit_code', 'carrier_unit_code', 'effective_from', 'effective_to', 'report_title', 'service_desc',
  'carrier_print_name', 'customer_print_name', 'sign_place', 'customer_signers_json', 'carrier_signers_json', 'note'];

class MasterDataService {
  constructor(store) { this.store = store; }

  async _save(table, pkField, fields, record, { rowVersion, create, validate, defaults = {}, label, reason = '', user }) {
    const inp = trimAll(toSnake(record));
    for (const k of Object.keys(inp)) if (!fields.includes(k)) delete inp[k];
    const id = inp[pkField];
    const old = id ? this.store.get(table, id) : null;
    if (create && old) throw new AppError('DUPLICATE', `${label} ${id} đã có`);
    if (!create && !old) throw new AppError('NOT_FOUND', `Không có ${label.toLowerCase()} ${id}`);
    const warnings = [];
    if (!old) {
      const rec = { ...defaults, ...inp, is_active: true };
      validate(rec, null);
      const r = await this.store.transaction((tx) => {
        const x = tx.insert(table, rec); tx.audit('CREATE', table, id, null, x, { reason });
        const w = remindTx(tx, this.store, { entity: table, entityId: id, action: 'CREATE', summary: `Thêm ${label.toLowerCase()} ${id}` }); if (w) warnings.push(w);
        return x;
      }, { user: user.username });
      return { record: r, created: true, warnings };
    }
    if (rowVersion === undefined) throw new AppError('VALIDATION_FAILED', `Sửa ${label.toLowerCase()} phải gửi rowVersion`);
    const patch = {}; for (const k of fields) if (k in inp && k !== pkField && inp[k] !== old[k]) patch[k] = inp[k];
    if (!Object.keys(patch).length) return { record: old, created: false, warnings };
    validate({ ...old, ...patch }, old);
    const r = await this.store.transaction((tx) => {
      const { before, after } = tx.update(table, id, patch, { expectedRowVersion: rowVersion });
      tx.audit('UPDATE', table, id, Object.fromEntries(Object.keys(patch).map((k) => [k, before[k]])), patch, { reason });
      const w = remindTx(tx, this.store, { entity: table, entityId: id, action: 'UPDATE', summary: `Sửa ${label.toLowerCase()} ${id}: ${diffSummary(before, patch)}` }); if (w) warnings.push(w);
      return after;
    }, { user: user.username });
    return { record: r, created: false, warnings };
  }

  async _setActive(table, id, active, label, { rowVersion, reason = '', user }) {
    const r = this.store.get(table, id); if (!r) throw new AppError('NOT_FOUND', `Không có ${label.toLowerCase()} ${id}`);
    return this.store.transaction((tx) => {
      const { after } = tx.update(table, id, { is_active: !!active }, { expectedRowVersion: rowVersion });
      tx.audit('SET_ACTIVE', table, id, { is_active: r.is_active }, { is_active: !!active }, { reason });
      const w = remindTx(tx, this.store, { entity: table, entityId: id, action: 'SET_ACTIVE', summary: `${active ? 'Dùng lại' : 'Ngừng dùng'} ${label.toLowerCase()} ${id}` });
      return { record: after, warnings: w ? [w] : [] };
    }, { user: user.username });
  }

  // ── Đơn vị ──
  listUnits({ includeInactive = true } = {}) {
    return { items: this.store.find('DON_VI', (u) => includeInactive || u.is_active).sort((a, b) => a.sign_priority - b.sign_priority || a.unit_code.localeCompare(b.unit_code)) };
  }
  saveUnit({ record, rowVersion, create = false, reason, user }) {
    if (record.unitCode) record.unitCode = String(record.unitCode).trim().toUpperCase();
    if (record.signPriority !== undefined && record.signPriority !== '') record.signPriority = Number(record.signPriority);
    return this._save('DON_VI', 'unit_code', UNIT_FIELDS, record, { rowVersion, create, reason, user, label: 'Đơn vị',
      defaults: { unit_type: 'CONG_TY', sign_priority: 50, name_aliases: '', short_name: record.unitCode || '' },
      validate: (u) => {
        const bad = [];
        if (!/^[A-Z0-9]{2,12}$/.test(u.unit_code || '')) bad.push('Mã đơn vị 2–12 ký tự chữ HOA / số');
        if (!u.unit_name) bad.push('Thiếu tên đơn vị');
        if (!['CONG_TY', 'CHI_NHANH'].includes(u.unit_type)) bad.push('Loại đơn vị: CONG_TY / CHI_NHANH');
        if (!(Number.isInteger(u.sign_priority) && u.sign_priority > 0)) bad.push('Thứ tự ký phải là số nguyên > 0');
        if (u.legal_rep_salutation && !['Ông', 'Bà'].includes(u.legal_rep_salutation)) bad.push('Xưng hô: Ông / Bà');
        if (bad.length) throw new AppError('VALIDATION_FAILED', bad.join('; '), { errors: bad });
      } });
  }
  setUnitActive({ unitCode, active, rowVersion, reason, user }) { return this._setActive('DON_VI', unitCode, active, 'Đơn vị', { rowVersion, reason, user }); }

  // ── Xe ──
  listVehicles({ ownerUnitCode = '', includeInactive = true } = {}) {
    return { items: this.store.find('XE', (x) => (includeInactive || x.is_active) && (!ownerUnitCode || x.owner_unit_code === ownerUnitCode)).sort((a, b) => a.plate_no.localeCompare(b.plate_no)) };
  }
  saveVehicle({ record, rowVersion, create = false, reason, user }) {
    if (record.plateNo) record.plateNo = String(record.plateNo).trim().toUpperCase();
    const cfg = Object.fromEntries(this.store.all('CONFIG').map((c) => [c.config_key, c.config_value]));
    const re = new RegExp(cfg.PLATE_REGEX || '^\\d{2}[A-Z]{1,2}-\\d{4,5}$');
    const rec = { ...record }; if (rec.plateNo) rec.plateKey = plateKey(rec.plateNo);
    return this._save('XE', 'plate_no', [...VEH_FIELDS, 'plate_key'], rec, { rowVersion, create, reason, user, label: 'Xe',
      defaults: { fuel_code: '', note: '' },
      validate: (x) => {
        const bad = [];
        if (!re.test(x.plate_no || '')) bad.push(`Biển số không đúng dạng (vd 92H-00057): ${x.plate_no}`);
        if (!this.store.get('DON_VI', x.owner_unit_code)) bad.push(`Chủ xe ${x.owner_unit_code} không có trong danh mục đơn vị`);
        const dup = this.store.find('XE', (y) => y.plate_key === x.plate_key && y.plate_no !== x.plate_no);
        if (dup.length) bad.push(`Trùng biển số với ${dup[0].plate_no}`);
        if (bad.length) throw new AppError('VALIDATION_FAILED', bad.join('; '), { errors: bad });
      } });
  }
  setVehicleActive({ plateNo, active, rowVersion, reason, user }) { return this._setActive('XE', plateNo, active, 'Xe', { rowVersion, reason, user }); }

  /** Xe đang được dùng ở đâu (để biết có đổi biển số / xóa được không). */
  vehicleUsage({ plateNo }) {
    const s = this.store;
    const tickets = s.find('PHIEU_CAN', (t) => t.plate_no === plateNo && !t.is_deleted).length;
    const fuelRows = s.find('GIAO_NHAN_DAU', (r) => r.plate_no === plateNo && !r.is_deleted);
    const usedFuel = new Set(s.find('FUEL_DETAIL', (d) => d.is_current && d.usage_state !== 'RELEASED').map((d) => d.receipt_id));
    const fuelInPeriod = fuelRows.filter((r) => usedFuel.has(r.receipt_id)).length;
    const periodLines = s.find('BKVC_LINE', (l) => l.plate_no === plateNo).length + s.find('TRANSPORT_DETAIL', (d) => d.plate_no === plateNo).length;
    const contracts = [...new Set(s.find('HOP_DONG_XE', (v) => v.plate_no === plateNo).map((v) => v.contract_id))];
    const blockers = [];
    if (tickets) blockers.push(`${tickets} phiếu cân`);
    if (fuelInPeriod) blockers.push(`${fuelInPeriod} dòng dầu đã tính trong kỳ`);
    if (periodLines) blockers.push('kết quả kỳ tính');
    const archYears = Object.entries(s.archives || {}).filter(([, a]) => (a.plates || []).includes(plateNo)).map(([y]) => y);
    if (archYears.length) blockers.push(`dữ liệu năm đã lưu trữ ${archYears.join(', ')}`);
    return { plateNo, tickets, fuelRows: fuelRows.length, fuelInPeriod, periodLines, contracts, blockers, canRename: !blockers.length };
  }

  /**
   * Sửa BIỂN SỐ xe nhập nhầm (biển số là mã khóa nên không sửa trực tiếp được): tạo xe biển số đúng, chuyển phạm vi xe của hợp đồng
   * và dòng dầu CHƯA tính kỳ sang biển số mới, xóa xe sai. Chỉ làm được khi xe sai chưa có phiếu cân / chưa nằm trong kỳ tính.
   */
  async renameVehicle({ plateNo, newPlateNo, rowVersion, reason = '', user }) {
    const s = this.store; const old = s.get('XE', plateNo);
    if (!old) throw new AppError('NOT_FOUND', `Không có xe ${plateNo}`);
    if (rowVersion !== undefined && old.row_version !== rowVersion) throw new AppError('CONFLICT_VERSION', `Xe ${plateNo} đã bị sửa ở nơi khác — mở lại`);
    const np = String(newPlateNo || '').trim().toUpperCase();
    if (!np || np === plateNo) throw new AppError('VALIDATION_FAILED', 'Nhập biển số mới (khác biển số cũ)');
    const u = this.vehicleUsage({ plateNo });
    if (!u.canRename) throw new AppError('VALIDATION_FAILED', `Xe ${plateNo} đã có ${u.blockers.join(', ')} — biển số này đến từ dữ liệu cân, không đổi được. Nếu xe ${plateNo} nhập nhầm: thêm xe ${np} rồi bấm "Ngừng dùng" xe ${plateNo}`, { usage: u });
    const cfg = Object.fromEntries(s.all('CONFIG').map((c) => [c.config_key, c.config_value]));
    const re = new RegExp(cfg.PLATE_REGEX || '^\\d{2}[A-Z]{1,2}-\\d{4,5}$');
    if (!re.test(np)) throw new AppError('VALIDATION_FAILED', `Biển số không đúng dạng (vd 92H-00057): ${np}`);
    const key = plateKey(np);
    const dup = s.find('XE', (y) => (y.plate_no === np || y.plate_key === key) && y.plate_no !== plateNo);
    if (dup.length) throw new AppError('DUPLICATE', `Đã có xe ${dup[0].plate_no} — không đổi trùng biển số`);
    const out = { from: plateNo, to: np, contractRows: 0, fuelRows: 0, warnings: [] };
    const rec = await s.transaction((tx) => {
      const { created_at, created_by, updated_at, updated_by, row_version, ...keep } = old;
      const x = tx.insert('XE', { ...keep, plate_no: np, plate_key: key });
      for (const v of tx.all('HOP_DONG_XE').filter((y) => y.plate_no === plateNo)) { tx.update('HOP_DONG_XE', v.id, { plate_no: np }); out.contractRows++; }
      for (const r of tx.all('GIAO_NHAN_DAU').filter((y) => y.plate_no === plateNo)) { tx.update('GIAO_NHAN_DAU', r.receipt_id, { plate_no: np }); out.fuelRows++; }
      tx.remove('XE', plateNo);
      tx.audit('RENAME', 'XE', plateNo, { plate_no: plateNo }, { plate_no: np, contractRows: out.contractRows, fuelRows: out.fuelRows }, { reason });
      const w = remindTx(tx, this.store, { entity: 'XE', entityId: np, action: 'RENAME', summary: `Sửa biển số xe ${plateNo} → ${np}` }); if (w) out.warnings.push(w);
      return x;
    }, { user: user.username });
    return { record: rec, ...out };
  }

  /** Xóa xe nhập nhầm — chỉ khi chưa dùng ở đâu (không phiếu cân, không dòng dầu, không hợp đồng). Đã dùng thì "Ngừng dùng". */
  async deleteVehicle({ plateNo, reason = '', user }) {
    const s = this.store; const old = s.get('XE', plateNo);
    if (!old) throw new AppError('NOT_FOUND', `Không có xe ${plateNo}`);
    const u = this.vehicleUsage({ plateNo });
    const any = [...u.blockers, u.fuelRows ? `${u.fuelRows} dòng dầu` : '', u.contracts.length ? `${u.contracts.length} hợp đồng` : ''].filter(Boolean);
    if (any.length) throw new AppError('VALIDATION_FAILED', `Xe ${plateNo} đang có ${any.join(', ')} — không xóa được. Dùng "Sửa biển số" (nếu chưa có phiếu cân) hoặc "Ngừng dùng"`, { usage: u });
    const warnings = [];
    await s.transaction((tx) => {
      tx.remove('XE', plateNo);
      tx.audit('DELETE', 'XE', plateNo, old, null, { reason });
      const w = remindTx(tx, this.store, { entity: 'XE', entityId: plateNo, action: 'DELETE', summary: `Xóa xe nhập nhầm ${plateNo}` }); if (w) warnings.push(w);
    }, { user: user.username });
    return { deleted: plateNo, warnings };
  }

  // ── Hợp đồng ──
  listContracts() {
    const u = this.store.unitCode;
    return { items: this.store.all('HOP_DONG').map((c) => ({ ...c, role: c.carrier_unit_code === u ? 'CARRIER' : c.customer_unit_code === u ? 'CUSTOMER' : 'OTHER',
      vehicles: this.store.find('HOP_DONG_XE', (v) => v.contract_id === c.contract_id).length })).sort((a, b) => a.contract_code.localeCompare(b.contract_code)) };
  }
  async saveContract({ record, rowVersion, create = false, reason, user }) {
    const rec = { ...record };
    if (!create && rec.contractId) {
      const old = this.store.get('HOP_DONG', rec.contractId);
      const changed = old && [['contractCode', 'contract_code', 'mã hợp đồng'], ['carrierUnitCode', 'carrier_unit_code', 'bên vận chuyển'], ['customerUnitCode', 'customer_unit_code', 'bên thuê']]
        .filter(([k, col]) => rec[k] !== undefined && String(rec[k]).trim().toUpperCase() !== String(old[col]).toUpperCase()).map((x) => x[2]);
      if (changed && changed.length) {
        const u = this.contractUsage({ contractId: rec.contractId });
        if (!u.canEditParties) throw new AppError('VALIDATION_FAILED', `Hợp đồng ${old.contract_code} đã có ${u.blockers.join(', ')} — không đổi ${changed.join(', ')} được. Nếu nhập nhầm: thêm hợp đồng đúng rồi "Ngừng dùng" hợp đồng này`, { usage: u });
      }
      if (rec.contractCode !== undefined) rec.contractCode = String(rec.contractCode).trim().toUpperCase();
    }
    if (create && !rec.contractId && rec.contractCode) rec.contractId = `HD-${String(rec.contractCode).trim().toUpperCase()}`;
    for (const k of ['carrierSignersJson', 'customerSignersJson']) if (Array.isArray(rec[k])) rec[k] = JSON.stringify(rec[k]);
    return this._save('HOP_DONG', 'contract_id', CONTRACT_FIELDS, rec, { rowVersion, create, reason, user, label: 'Hợp đồng',
      defaults: { report_title: 'BẢNG XÁC NHẬN KHỐI LƯỢNG VẬN CHUYỂN DĂM', service_desc: '', carrier_print_name: '', customer_print_name: '', sign_place: '',
        customer_signers_json: '[]', carrier_signers_json: '[]', contract_no: '', effective_to: '', note: '' },
      validate: (c) => {
        const bad = [];
        if (!c.contract_code) bad.push('Thiếu mã hợp đồng');
        if (!this.store.get('DON_VI', c.carrier_unit_code)) bad.push('Bên vận chuyển không có trong danh mục');
        if (!this.store.get('DON_VI', c.customer_unit_code)) bad.push('Bên thuê không có trong danh mục');
        if (c.carrier_unit_code === c.customer_unit_code) bad.push('Bên vận chuyển phải khác bên thuê');
        if (!isDate(c.effective_from)) bad.push('Ngày hiệu lực từ: yyyy-MM-dd');
        if (c.effective_to && (!isDate(c.effective_to) || c.effective_to < c.effective_from)) bad.push('Ngày hết hiệu lực phải sau ngày bắt đầu');
        const dup = this.store.find('HOP_DONG', (x) => x.contract_code === c.contract_code && x.contract_id !== c.contract_id);
        if (dup.length) bad.push(`Mã hợp đồng ${c.contract_code} đã dùng`);
        for (const k of ['carrier_signers_json', 'customer_signers_json']) { try { const v = JSON.parse(c[k] || '[]'); if (!Array.isArray(v)) throw 0; } catch { bad.push(`${k} phải là danh sách [{title, name}]`); } }
        if (bad.length) throw new AppError('VALIDATION_FAILED', bad.join('; '), { errors: bad });
      } });
  }
  /**
   * Hợp đồng đang dùng ở đâu (bản 1.2.4): kỳ tính, dòng dầu, lô import, giá riêng, phạm vi xe.
   * - Sửa mã HĐ / bên vận chuyển / bên thuê: chỉ khi CHƯA có kỳ tính và CHƯA có dòng dầu (kể cả đã xóa) — các thứ này gắn với hai bên của hợp đồng.
   * - Xóa: cũng chỉ khi chưa có kỳ tính / dòng dầu / lô import dầu; xóa luôn phạm vi xe và giá riêng (chưa dùng) của hợp đồng. Đã dùng → "Ngừng dùng".
   */
  contractUsage({ contractId }) {
    const s = this.store; const c = s.get('HOP_DONG', contractId);
    if (!c) throw new AppError('NOT_FOUND', `Không có hợp đồng ${contractId}`);
    const periods = s.find('KY_TINH', (k) => k.contract_id === contractId);
    const fuel = s.find('GIAO_NHAN_DAU', (r) => r.contract_id === contractId);
    const batches = s.find('IMPORT_BATCH', (b) => b.contract_id === contractId);
    const calcs = s.find('TRANSPORT_CALCULATION', (x) => x.contract_id === contractId);
    const prices = s.find('PRICE_HISTORY', (p) => p.contract_id === contractId);
    const vehicles = s.find('HOP_DONG_XE', (v) => v.contract_id === contractId);
    const blockers = [];
    if (periods.length) blockers.push(`${periods.length} kỳ tính${periods.some((k) => k.status === 'HUY') ? ` (${periods.filter((k) => k.status === 'HUY').length} kỳ đã hủy)` : ''}`);
    if (fuel.length) blockers.push(`${fuel.length} dòng dầu${fuel.some((r) => r.is_deleted) ? ` (${fuel.filter((r) => r.is_deleted).length} dòng đã xóa)` : ''}`);
    if (!fuel.length && batches.length) blockers.push(`${batches.length} lô import dầu`);
    if (!periods.length && calcs.length) blockers.push(`${calcs.length} kết quả tính`);
    const archYears = Object.entries(s.archives || {}).filter(([, a]) => (a.contracts || {})[contractId]).map(([y]) => y);
    if (archYears.length) blockers.push(`dữ liệu năm đã lưu trữ ${archYears.join(', ')}`);
    const usedPrices = prices.filter((p) => p.is_used);
    if (usedPrices.length) blockers.push(`${usedPrices.length} phiên bản giá riêng đã dùng`);
    return { contractId, contractCode: c.contract_code, periods: periods.length, fuelRows: fuel.length, importBatches: batches.length, prices: prices.length, vehicles: vehicles.length,
      blockers, canEditParties: !blockers.length, canDelete: !blockers.length };
  }

  async deleteContract({ contractId, reason = '', user }) {
    const s = this.store; const c = s.get('HOP_DONG', contractId);
    if (!c) throw new AppError('NOT_FOUND', `Không có hợp đồng ${contractId}`);
    const u = this.contractUsage({ contractId });
    if (!u.canDelete) throw new AppError('VALIDATION_FAILED', `Hợp đồng ${c.contract_code} đã có ${u.blockers.join(', ')} — không xóa được. Dùng "Ngừng dùng" để không chọn hợp đồng này nữa`, { usage: u });
    const out = { deleted: contractId, contractCode: c.contract_code, vehicleRows: 0, priceRows: 0, warnings: [] };
    await s.transaction((tx) => {
      for (const v of tx.all('HOP_DONG_XE').filter((x) => x.contract_id === contractId)) { tx.remove('HOP_DONG_XE', v.id); out.vehicleRows++; }
      for (const p of tx.all('PRICE_HISTORY').filter((x) => x.contract_id === contractId)) { tx.remove('PRICE_HISTORY', p.price_id); out.priceRows++; }
      tx.remove('HOP_DONG', contractId);
      tx.audit('DELETE', 'HOP_DONG', contractId, c, { vehicleRows: out.vehicleRows, priceRows: out.priceRows }, { reason });
      const w = remindTx(tx, this.store, { entity: 'HOP_DONG', entityId: contractId, action: 'DELETE', summary: `Xóa hợp đồng nhập nhầm ${c.contract_code} (${c.carrier_unit_code} → ${c.customer_unit_code})` }); if (w) out.warnings.push(w);
    }, { user: user.username });
    return out;
  }

  setContractActive({ contractId, active, rowVersion, reason, user }) { return this._setActive('HOP_DONG', contractId, active, 'Hợp đồng', { rowVersion, reason, user }); }

  /** Ghi phạm vi xe của hợp đồng: danh sách {plateNo, effectiveFrom, effectiveTo}; dòng không còn trong danh sách → đóng hiệu lực (không xóa). */
  async setContractVehicles({ contractId, vehicles = [], reason = '', user }) {
    const c = this.store.get('HOP_DONG', contractId); if (!c) throw new AppError('NOT_FOUND', `Không có hợp đồng ${contractId}`);
    const bad = [];
    const want = vehicles.map((v) => ({ plate_no: String(v.plateNo || '').toUpperCase(), effective_from: v.effectiveFrom || c.effective_from, effective_to: v.effectiveTo || '' }));
    for (const v of want) {
      if (!this.store.get('XE', v.plate_no)) bad.push(`Xe ${v.plate_no} chưa có trong danh mục`);
      if (!isDate(v.effective_from) || (v.effective_to && v.effective_to < v.effective_from)) bad.push(`Xe ${v.plate_no}: ngày hiệu lực sai`);
    }
    if (bad.length) throw new AppError('VALIDATION_FAILED', bad.join('; '), { errors: bad });
    const cur = this.store.find('HOP_DONG_XE', (v) => v.contract_id === contractId);
    return this.store.transaction((tx) => {
      const out = { added: 0, updated: 0, closed: 0 };
      for (const v of want) {
        const same = cur.find((x) => x.plate_no === v.plate_no && x.effective_from === v.effective_from);
        if (same) { if ((same.effective_to || '') !== v.effective_to) { tx.update('HOP_DONG_XE', same.id, { effective_to: v.effective_to }); out.updated++; } continue; }
        tx.insert('HOP_DONG_XE', { id: tx.nextId('HX', 5), contract_id: contractId, ...v }); out.added++;
      }
      const today = tx.now.slice(0, 10);
      for (const x of cur) {
        if (want.some((v) => v.plate_no === x.plate_no && v.effective_from === x.effective_from)) continue;
        if (!x.effective_to || x.effective_to > today) { tx.update('HOP_DONG_XE', x.id, { effective_to: x.effective_from > today ? x.effective_from : today }); out.closed++; }
      }
      tx.audit('CONTRACT_VEHICLES', 'HOP_DONG', contractId, null, out, { reason });
      const w = remindTx(tx, this.store, { entity: 'HOP_DONG_XE', entityId: contractId, action: 'CONTRACT_VEHICLES', summary: `Phạm vi xe hợp đồng ${c.contract_code}: thêm ${out.added}, sửa ${out.updated}, đóng ${out.closed}` });
      return { ...out, warnings: w ? [w] : [] };
    }, { user: user.username });
  }

  /** Gợi ý phạm vi xe = xe của bên vận chuyển + xe của các hợp đồng mà bên vận chuyển là bên thuê. */
  suggestVehicles({ contractId }) {
    const c = this.store.get('HOP_DONG', contractId); if (!c) throw new AppError('NOT_FOUND', `Không có hợp đồng ${contractId}`);
    const own = this.store.find('XE', (x) => x.is_active && x.owner_unit_code === c.carrier_unit_code).map((x) => x.plate_no);
    const subIds = this.store.find('HOP_DONG', (h) => h.customer_unit_code === c.carrier_unit_code).map((h) => h.contract_id);
    const sub = this.store.find('HOP_DONG_XE', (v) => subIds.includes(v.contract_id)).map((v) => v.plate_no);
    return { plates: [...new Set([...own, ...sub])].sort() };
  }

  resolveSigners({ contractId }) {
    const c = this.store.get('HOP_DONG', contractId); if (!c) throw new AppError('NOT_FOUND', `Không có hợp đồng ${contractId}`);
    return E.resolveSigners(c, this.store.all('DON_VI'), E.buildConfig(this.store.all('CONFIG')));
  }
}

module.exports = { MasterDataService };
