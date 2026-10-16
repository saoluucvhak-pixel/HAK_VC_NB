'use strict';
/**
 * ExchangeService — gói trao đổi .dgvc giữa các bản cài (DATA_STORAGE_DESIGN §8).
 *   DANH_MUC  : đơn vị, xe, tuyến, giá, hợp đồng (+ xe) — BẢN CÀI NÀO CŨNG XUẤT ĐƯỢC (chốt 25/09/2026, không riêng HAKQN);
 *               xuất cho nhà máy X → tự đánh dấu X "đã nhận" các nhắc sửa danh mục đang mở.
 *   PHIEU_CAN : phiếu cân theo khoảng ngày (+ xe)
 *   KY_TINH   : kỳ ĐÃ XÁC NHẬN / ĐÃ KHÓA của hợp đồng mình là bên vận chuyển → gửi bên thuê (nhận về: chỉ xem)
 * Định dạng: JSON nén gzip { header, contentSha256, tables }. contentSha256 = SHA-256 của tables ở dạng JSON chuẩn (khóa sắp xếp, không khoảng trắng).
 * Nhập: luôn qua xem trước (mới / giống / cập nhật / xung đột), tự sao lưu an toàn rồi mới ghi, 1 giao dịch.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { AppError, businessError } = require('../../shared/errors');
const { markTx } = require('./SyncReminderService');
const { SCHEMA } = require('../repo/JsonStore');

const APP_VERSION = require('../../package.json').version;
const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const META = new Set(['created_at', 'created_by', 'updated_at', 'updated_by', 'row_version']);
const content = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => !META.has(k)));
const sameContent = (a, b) => canon(content(a)) === canon(content(b));
const vnNum = (n) => Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const stampOf = (r) => r.updated_at || r.created_at || '';
const CORE_TICKET = ['ticket_no', 'weigh1_date', 'weigh1_time', 'weigh2_date', 'weigh2_time', 'plate_no', 'weight1_kg', 'weight2_kg', 'net_kg', 'route_code', 'owner_unit_code'];
const CATALOG_ORDER = ['DON_VI', 'XE', 'TUYEN_VC', 'HOP_DONG', 'HOP_DONG_XE', 'PRICE_HISTORY'];
const DATA_ORDER = ['PHIEU_CAN', 'GIAO_NHAN_DAU', 'KY_TINH', 'TRANSPORT_CALCULATION', 'TRANSPORT_DETAIL', 'FUEL_DETAIL', 'BKVC_LINE'];
const TYPE_TEXT = { DANH_MUC: 'Danh mục', PHIEU_CAN: 'Phiếu cân', KY_TINH: 'Kỳ tính' };

class ExchangeService {
  constructor(store, { backup } = {}) { this.store = store; this.backup = backup; this.staged = new Map(); }

  // ─────────────────────────── XUẤT ───────────────────────────
  async exportPackage({ packageType, targetUnitCode = '', periodIds = [], dateFrom = '', dateTo = '', plates = [], targetPath, user }) {
    const s = this.store; const tables = {}; const header = { format: 'DGVC-PKG', formatVersion: 1, packageType, schemaVersion: SCHEMA.schemaVersion,
      sourceInstallId: s.manifest.installId, sourceUnitCode: s.unitCode, targetUnitCode: targetUnitCode || '', createdAt: '', createdBy: user.username, appVersion: APP_VERSION };
    if (targetUnitCode && !s.get('DON_VI', targetUnitCode)) throw new AppError('VALIDATION_FAILED', `Không có đơn vị nhận ${targetUnitCode}`);
    if (targetUnitCode === s.unitCode) throw new AppError('VALIDATION_FAILED', 'Đơn vị nhận phải khác bản cài này');
    let reminderIds = [];
    if (packageType === 'DANH_MUC') {
      const party = (c) => !targetUnitCode || c.carrier_unit_code === targetUnitCode || c.customer_unit_code === targetUnitCode;
      const cons = s.all('HOP_DONG').filter(party); const cids = new Set(cons.map((c) => c.contract_id));
      Object.assign(tables, { DON_VI: s.all('DON_VI'), XE: s.all('XE'), TUYEN_VC: s.all('TUYEN_VC'), HOP_DONG: cons,
        HOP_DONG_XE: s.all('HOP_DONG_XE').filter((v) => cids.has(v.contract_id)),
        PRICE_HISTORY: s.all('PRICE_HISTORY').filter((p) => p.status !== 'DRAFT' && (!p.contract_id || cids.has(p.contract_id))) });
      reminderIds = targetUnitCode ? s.find('SYNC_REMINDER', (r) => r.status === 'OPEN' && JSON.parse(r.targets_json).includes(targetUnitCode)).map((r) => r.reminder_id) : [];
    } else if (packageType === 'PHIEU_CAN') {
      if (!dateFrom || !dateTo) throw new AppError('VALIDATION_FAILED', 'Chọn khoảng ngày phiếu cân');
      const pl = new Set(plates.map((p) => p.toUpperCase()));
      tables.PHIEU_CAN = s.find('PHIEU_CAN', (t) => !t.is_deleted && t.weigh1_date >= dateFrom && t.weigh1_date <= dateTo && (!pl.size || pl.has(t.plate_no)));
      if (!tables.PHIEU_CAN.length) throw new AppError('VALIDATION_FAILED', 'Không có phiếu cân nào trong khoảng đã chọn');
      Object.assign(header, { dateFrom, dateTo });
    } else if (packageType === 'KY_TINH') {
      if (!periodIds.length) throw new AppError('VALIDATION_FAILED', 'Chọn kỳ cần gửi');
      const ps = periodIds.map((id) => s.get('KY_TINH', id));
      const cur = (t, pid) => s.find(t, (r) => r.period_id === pid && r.is_current);
      Object.assign(tables, { HOP_DONG: [], HOP_DONG_XE: [], PRICE_HISTORY: [], PHIEU_CAN: [], GIAO_NHAN_DAU: [], KY_TINH: [], TRANSPORT_CALCULATION: [], TRANSPORT_DETAIL: [], FUEL_DETAIL: [], BKVC_LINE: [] });
      const seen = { HOP_DONG: new Set(), PHIEU_CAN: new Set(), GIAO_NHAN_DAU: new Set(), PRICE_HISTORY: new Set() };
      for (const p of ps) {
        if (!p) throw new AppError('NOT_FOUND', 'Có kỳ không tồn tại');
        const c = s.get('HOP_DONG', p.contract_id);
        if (p.origin !== 'LOCAL' || c.carrier_unit_code !== s.unitCode) throw businessError('E_NOT_CARRIER', `Kỳ ${p.period_code}: chỉ bên vận chuyển (${c.carrier_unit_code}) gửi được kỳ này`);
        if (!['DA_XAC_NHAN', 'DA_KHOA'].includes(p.status)) throw businessError('E_PERIOD_STATUS', `Kỳ ${p.period_code} chưa xác nhận — chỉ gửi kỳ đã xác nhận / đã khóa`);
        if (targetUnitCode && targetUnitCode !== c.customer_unit_code) throw new AppError('VALIDATION_FAILED', `Kỳ ${p.period_code} gửi cho bên thuê ${c.customer_unit_code}, không phải ${targetUnitCode}`);
        header.targetUnitCode = header.targetUnitCode || c.customer_unit_code;
        if (!seen.HOP_DONG.has(c.contract_id)) { seen.HOP_DONG.add(c.contract_id); tables.HOP_DONG.push(c); tables.HOP_DONG_XE.push(...s.find('HOP_DONG_XE', (v) => v.contract_id === c.contract_id)); }
        tables.KY_TINH.push(p);
        const calcs = cur('TRANSPORT_CALCULATION', p.period_id); tables.TRANSPORT_CALCULATION.push(...calcs);
        for (const cc of calcs) if (!seen.PRICE_HISTORY.has(cc.price_id)) { seen.PRICE_HISTORY.add(cc.price_id); tables.PRICE_HISTORY.push(s.get('PRICE_HISTORY', cc.price_id)); }
        const td = cur('TRANSPORT_DETAIL', p.period_id); tables.TRANSPORT_DETAIL.push(...td);
        for (const d of td) if (!seen.PHIEU_CAN.has(d.ticket_id)) { seen.PHIEU_CAN.add(d.ticket_id); tables.PHIEU_CAN.push(s.get('PHIEU_CAN', d.ticket_id)); }
        const fd = cur('FUEL_DETAIL', p.period_id); tables.FUEL_DETAIL.push(...fd);
        for (const d of fd) if (!seen.GIAO_NHAN_DAU.has(d.receipt_id)) { seen.GIAO_NHAN_DAU.add(d.receipt_id); tables.GIAO_NHAN_DAU.push(s.get('GIAO_NHAN_DAU', d.receipt_id)); }
        tables.BKVC_LINE.push(...cur('BKVC_LINE', p.period_id));
      }
      header.periodCodes = ps.map((p) => p.period_code);
    } else throw new AppError('VALIDATION_FAILED', `Loại gói không hợp lệ: ${packageType}`);

    const contentSha256 = sha(canon(tables));
    const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
    return s.transaction((tx) => {
      header.createdAt = tx.now;
      const buf = zlib.gzipSync(Buffer.from(JSON.stringify({ header, contentSha256, tables })));
      const file = targetPath || path.join(s.root, 'exports', defaultName(header));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buf);
      const id = tx.nextId('EX', 5);
      tx.insert('EXCHANGE_LOG', { exchange_id: id, direction: 'EXPORT', package_type: packageType, file_name: path.basename(file), package_sha256: contentSha256,
        source_install_id: s.manifest.installId, source_unit_code: s.unitCode, target_unit_code: header.targetUnitCode, counts_json: JSON.stringify(counts), status: 'DONE', message: '', created_at: tx.now, created_by: user.username });
      tx.audit('EXPORT_PACKAGE', 'EXCHANGE_LOG', id, null, { packageType, file: path.basename(file), counts, targetUnitCode: header.targetUnitCode });
      const marked = reminderIds.length ? markTx(tx, reminderIds, targetUnitCode, 'PACKAGE', path.basename(file)).updated : 0;
      return { exchangeId: id, file, sizeBytes: buf.length, contentSha256, counts, header, remindersMarked: marked };
    }, { user: user.username });
  }

  // ─────────────────────────── ĐỌC + XEM TRƯỚC ───────────────────────────
  read(filePath) {
    let pkg;
    try { pkg = JSON.parse(zlib.gunzipSync(fs.readFileSync(filePath))); } catch (e) { throw new AppError('INTEGRITY_ERROR', `Không đọc được gói ${path.basename(filePath)}: ${e.message}`); }
    const h = pkg && pkg.header;
    if (!h || h.format !== 'DGVC-PKG') throw new AppError('INTEGRITY_ERROR', 'Không phải gói DGVC');
    if (h.schemaVersion !== SCHEMA.schemaVersion) throw new AppError('INTEGRITY_ERROR', `Gói schemaVersion ${h.schemaVersion}, APP cần ${SCHEMA.schemaVersion} — cập nhật APP cho cùng phiên bản`);
    const got = sha(canon(pkg.tables));
    if (got !== pkg.contentSha256) throw new AppError('INTEGRITY_ERROR', 'Gói bị sửa hoặc hỏng (SHA-256 không khớp) — xin gửi lại gói');
    return pkg;
  }

  /**
   * Mã kỳ / dòng kết quả / dòng dầu đánh số theo mã bản cài (KY-DH-000001…). Hai máy cài cùng 1 đơn vị (hoặc kỳ trùng mã với kỳ bản cài này tự tính)
   * sẽ trùng mã → đổi mã dòng đến thành `<mã>@<đơn vị gửi>.<4 ký tự mã máy>` để KHÔNG ghi đè / thay nhầm kỳ của máy khác.
   * Giữ nguyên mã khi chưa có, hoặc bản đang có do CHÍNH máy gửi gửi trước đó (→ "Thay bản cũ" đúng nghĩa).
   */
  _remap(T0, h) {
    const s = this.store; const src = h.sourceInstallId; const T = { ...T0 };
    if (!(T0.KY_TINH || []).length) return T;
    const tag = `${h.sourceUnitCode}.${String(src).replace(/^INS-/, '').slice(0, 4)}`;
    const alt = (id) => `${id}@${tag}`;
    const ownerP = (pid) => { const p = s.get('KY_TINH', pid); return !p ? null : p.origin === 'IMPORTED' ? p.origin_install_id : 'LOCAL'; };
    // cùng mã bản cài (2 máy cùng đơn vị) → cùng dãy số: mã đến có thể trùng mã máy này sẽ sinh sau → luôn đổi mã (trừ bản cũ cùng máy gửi)
    const sameSpace = h.sourceUnitCode === s.installCode;
    const pmap = new Map();
    for (const p of T0.KY_TINH) {
      // cùng hợp đồng + cùng mã kỳ (cùng khoảng ngày, tuyến) đã có → đó là CÙNG kỳ: gắn vào kỳ đang có (thay nếu cùng máy gửi, xung đột nếu khác máy)
      const same = s.find('KY_TINH', (x) => x.contract_id === p.contract_id && x.period_code === p.period_code && x.status !== 'HUY')[0];
      if (same) { pmap.set(p.period_id, same.period_id); continue; }
      const o = ownerP(p.period_id); pmap.set(p.period_id, o === src || (o === null && !sameSpace) ? p.period_id : alt(p.period_id));
    }
    const childId = (t, r) => {
      const raw = r[SCHEMA.tables[t].pk];
      if (pmap.get(r.period_id) !== r.period_id && /@/.test(pmap.get(r.period_id))) return alt(raw);
      const l = s.get(t, raw); if (!l) return sameSpace && ownerP(r.period_id) !== src ? alt(raw) : raw;
      return ownerP(l.period_id) === src ? raw : alt(raw);
    };
    const cmap = new Map();
    T.TRANSPORT_CALCULATION = (T0.TRANSPORT_CALCULATION || []).map((r) => { const id = childId('TRANSPORT_CALCULATION', r); cmap.set(r.calc_id, id); return { ...r, calc_id: id, period_id: pmap.get(r.period_id) || r.period_id }; });
    const fuelOwner = new Map(); for (const d of s.all('FUEL_DETAIL')) if (!fuelOwner.has(d.receipt_id)) fuelOwner.set(d.receipt_id, ownerP(d.period_id));
    const rmap = new Map();
    T.GIAO_NHAN_DAU = (T0.GIAO_NHAN_DAU || []).map((r) => {
      const l = s.get('GIAO_NHAN_DAU', r.receipt_id); let id = r.receipt_id;
      if (!l && sameSpace) id = alt(r.receipt_id);
      if (l && !sameContent({ ...l, import_batch_id: '' }, { ...r, import_batch_id: '' })) {
        const o = fuelOwner.has(r.receipt_id) ? fuelOwner.get(r.receipt_id) : (l.import_batch_id ? 'LOCAL' : null);
        if (o !== src) id = alt(r.receipt_id);
      }
      rmap.set(r.receipt_id, id); return { ...r, receipt_id: id };
    });
    for (const t of ['TRANSPORT_DETAIL', 'FUEL_DETAIL', 'BKVC_LINE']) {
      T[t] = (T0[t] || []).map((r) => ({ ...r, [SCHEMA.tables[t].pk]: childId(t, r), period_id: pmap.get(r.period_id) || r.period_id,
        ...(r.calc_id ? { calc_id: cmap.get(r.calc_id) || r.calc_id } : {}), ...(t === 'FUEL_DETAIL' ? { receipt_id: rmap.get(r.receipt_id) || r.receipt_id } : {}) }));
    }
    T.KY_TINH = T0.KY_TINH.map((p) => (pmap.get(p.period_id) === p.period_id ? p : { ...p, period_id: pmap.get(p.period_id), current_run_id: '' }));
    return T;
  }

  previewPackage({ filePath, ticketsOnly = false, user }) {
    const pkg = this.read(filePath); const s = this.store; const h = pkg.header;
    if (h.sourceInstallId === s.manifest.installId) throw new AppError('VALIDATION_FAILED', 'Gói do chính bản cài này xuất — không nhập lại');
    if (ticketsOnly && !(pkg.tables.PHIEU_CAN || []).length) throw new AppError('VALIDATION_FAILED', 'Gói không có phiếu cân');
    const plan = []; const add = (table, id, action, row, extra = {}) => plan.push({ table, id, action, row, ...extra });
    const T = ticketsOnly ? { PHIEU_CAN: pkg.tables.PHIEU_CAN } : this._remap(pkg.tables, h);
    const party = (c) => c && (c.carrier_unit_code === s.unitCode || c.customer_unit_code === s.unitCode);
    const pkOf = (t) => SCHEMA.tables[t].pk;

    // danh mục: theo khóa chính; bên đến mới hơn → cập nhật; bên mình mới hơn / cùng lúc khác nội dung → xung đột
    for (const t of CATALOG_ORDER) {
      for (const r of T[t] || []) {
        const id = r[pkOf(t)]; const local = s.get(t, id);
        if ((t === 'HOP_DONG' && !party(r)) || (t === 'HOP_DONG_XE' && !party((T.HOP_DONG || []).find((c) => c.contract_id === r.contract_id) || s.get('HOP_DONG', r.contract_id)))) { add(t, id, 'SKIP', r, { note: 'hợp đồng không liên quan đơn vị này' }); continue; }
        if (t === 'PRICE_HISTORY' && r.contract_id && !s.get('HOP_DONG', r.contract_id) && !(T.HOP_DONG || []).some((c) => c.contract_id === r.contract_id && party(c))) { add(t, id, 'SKIP', r, { note: 'giá riêng của hợp đồng không liên quan' }); continue; }
        if (!local) { add(t, id, 'NEW', r); continue; }
        if (sameContent(local, r)) { add(t, id, 'SAME', r); continue; }
        if (t === 'PRICE_HISTORY') {
          const onlyClose = canon(content({ ...local, effective_to: '', status: '' })) === canon(content({ ...r, effective_to: '', status: '' })) && r.status === 'CLOSED';
          if (onlyClose || (local.status === 'DRAFT' && r.status !== 'DRAFT')) { add(t, id, 'UPDATE', r, { changes: diff(local, r) }); continue; }
          if (local.is_used) { add(t, id, 'CONFLICT', r, { changes: diff(local, r), note: 'phiên bản giá đã dùng ở kỳ của bản cài này', default: 'KEEP' }); continue; }
        }
        if (stampOf(r) > stampOf(local)) add(t, id, 'UPDATE', r, { changes: diff(local, r) });
        else add(t, id, 'CONFLICT', r, { changes: diff(local, r), note: stampOf(r) === stampOf(local) ? 'hai bên cùng sửa' : 'bản cài này sửa sau', default: 'KEEP' });
      }
    }
    // phiếu cân: theo ticket_id; khác số liệu cốt lõi → xung đột
    for (const r of T.PHIEU_CAN || []) {
      const local = s.get('PHIEU_CAN', r.ticket_id);
      if (!local) { add('PHIEU_CAN', r.ticket_id, 'NEW', r); continue; }
      const core = CORE_TICKET.filter((f) => local[f] !== r[f]);
      if (core.length) add('PHIEU_CAN', r.ticket_id, 'CONFLICT', r, { changes: core.map((f) => ({ field: f, local: local[f], incoming: r[f] })), note: 'khác số liệu trạm cân', default: 'KEEP' });
      else add('PHIEU_CAN', r.ticket_id, 'SAME', r);
    }
    // kỳ tính: bản cài nhận phải là bên thuê
    let periodsOk = true;
    for (const p of T.KY_TINH || []) {
      const c = s.get('HOP_DONG', p.contract_id) || (T.HOP_DONG || []).find((x) => x.contract_id === p.contract_id);
      if (c && c.carrier_unit_code === s.unitCode) { periodsOk = false; add('KY_TINH', p.period_id, 'REJECT', p, { note: `kỳ ${p.period_code} thuộc hợp đồng ${c.contract_code} mà bản cài ${s.unitCode} là BÊN VẬN CHUYỂN — kỳ này do chính bản cài này tính, không nhận kỳ của máy khác. Chỉ cần lấy phiếu cân trong gói` }); continue; }
      if (!c || c.customer_unit_code !== s.unitCode) { periodsOk = false; add('KY_TINH', p.period_id, 'REJECT', p, { note: `bản cài ${s.unitCode} không phải bên thuê của hợp đồng ${c ? c.contract_code : p.contract_id}` }); continue; }
      const local = s.get('KY_TINH', p.period_id);
      // phiếu cân của kỳ đến đã nằm trong KỲ KHÁC (đã xác nhận / khóa) của cùng hợp đồng → 2 kỳ chồng nhau, tính tiền 2 lần
      const mine = new Set((T.TRANSPORT_DETAIL || []).filter((d) => d.period_id === p.period_id && d.is_current).map((d) => d.ticket_id));
      const clash = s.find('TRANSPORT_DETAIL', (d) => d.contract_id === p.contract_id && d.is_current && ['CONFIRMED', 'LOCKED'].includes(d.usage_state) && d.period_id !== p.period_id && mine.has(d.ticket_id));
      if (clash.length) {
        const other = [...new Set(clash.map((d) => d.period_id))].map((id) => s.get('KY_TINH', id)).filter(Boolean);
        periodsOk = false; add('KY_TINH', p.period_id, 'REJECT', p, { note: `kỳ ${p.period_code} có ${clash.length} phiếu cân đã nằm trong kỳ ${other.map((o) => o.period_code).join(', ')} đã nhận trước — hai kỳ chồng ngày nhau, nhận thêm sẽ tính tiền 2 lần. Đề nghị bên vận chuyển kiểm tra lại` });
        continue;
      }
      const myFuel = new Set((T.FUEL_DETAIL || []).filter((d) => d.period_id === p.period_id && d.is_current).map((d) => d.receipt_id));
      const fclash = s.find('FUEL_DETAIL', (d) => d.contract_id === p.contract_id && d.is_current && ['CONFIRMED', 'LOCKED'].includes(d.usage_state) && d.period_id !== p.period_id && myFuel.has(d.receipt_id));
      if (fclash.length) {
        const other = [...new Set(fclash.map((d) => d.period_id))].map((id) => s.get('KY_TINH', id)).filter(Boolean);
        periodsOk = false; add('KY_TINH', p.period_id, 'REJECT', p, { note: `kỳ ${p.period_code} có ${fclash.length} dòng dầu đã tính ở kỳ ${other.map((o) => o.period_code).join(', ')} đã nhận trước — nhận thêm sẽ trừ dầu 2 lần. Đề nghị bên vận chuyển tính trên 1 máy (hoặc nhập dữ liệu kỳ trước) rồi gửi lại` });
        continue;
      }
      if (!local) add('KY_TINH', p.period_id, 'NEW', p);
      else if (local.origin === 'LOCAL') { periodsOk = false; add('KY_TINH', p.period_id, 'REJECT', p, { note: 'trùng mã kỳ của bản cài này' }); }
      else if (local.origin_install_id !== h.sourceInstallId) {
        const sum = (pid, src) => { const L = src ? (src.BKVC_LINE || []).filter((l) => l.period_id === pid && l.is_current) : s.find('BKVC_LINE', (l) => l.period_id === pid && l.is_current);
          const C = src ? (src.TRANSPORT_CALCULATION || []).filter((c) => c.period_id === pid && c.is_current) : s.find('TRANSPORT_CALCULATION', (c) => c.period_id === pid && c.is_current);
          return { price: C.map((c) => vnNum(c.transport_price)).join(' · '), trips: L.reduce((a, l) => a + l.trip_count, 0), total: vnNum(L.reduce((a, l) => a + l.amount_incl_vat, 0)) }; };
        const a = sum(local.period_id); const b = sum(p.period_id, T);
        add('KY_TINH', p.period_id, 'CONFLICT', p, { default: 'KEEP', note: `Đã có kỳ ${p.period_code} nhận từ MÁY KHÁC (${local.origin_install_id}) — gói này từ máy ${h.sourceInstallId}. Cùng hợp đồng, cùng khoảng ngày: chỉ giữ 1 bản`,
          changes: [{ field: 'Lần tính', local: local.calc_version, incoming: p.calc_version }, { field: 'Đơn giá', local: a.price, incoming: b.price }, { field: 'Số chuyến', local: a.trips, incoming: b.trips }, { field: 'Tổng thanh toán', local: a.total, incoming: b.total }] });
      }
      else if (p.calc_version > local.calc_version || p.status !== local.status) add('KY_TINH', p.period_id, 'REPLACE', p, { note: `lần tính ${local.calc_version} → ${p.calc_version}, ${local.status} → ${p.status}` });
      else add('KY_TINH', p.period_id, 'SAME', p);
    }
    if (T.KY_TINH && T.KY_TINH.length && periodsOk) {
      const keep = new Set(plan.filter((x) => x.table === 'KY_TINH' && ['NEW', 'REPLACE', 'CONFLICT'].includes(x.action)).map((x) => x.id));
      const dep = new Set(plan.filter((x) => x.table === 'KY_TINH' && x.action === 'CONFLICT').map((x) => x.id)); // phụ thuộc lựa chọn ở kỳ
      const rPeriods = new Map(); for (const d of T.FUEL_DETAIL || []) { if (!rPeriods.has(d.receipt_id)) rPeriods.set(d.receipt_id, new Set()); rPeriods.get(d.receipt_id).add(d.period_id); }
      for (const t of ['GIAO_NHAN_DAU', 'TRANSPORT_CALCULATION', 'TRANSPORT_DETAIL', 'FUEL_DETAIL', 'BKVC_LINE']) {
        for (const r of T[t] || []) {
          const id = r[pkOf(t)];
          if (t !== 'GIAO_NHAN_DAU' && !keep.has(r.period_id)) { add(t, id, 'SAME', r); continue; }
          const l = s.get(t, id);
          const periodsOf = t === 'GIAO_NHAN_DAU' ? [...(rPeriods.get(id) || [])] : [r.period_id];
          const onlyIf = periodsOf.length && periodsOf.every((x) => dep.has(x)) ? periodsOf : null;
          add(t, id, !l ? 'NEW' : (t === 'GIAO_NHAN_DAU' ? sameContent({ ...l, import_batch_id: '' }, { ...r, import_batch_id: '' }) : sameContent(l, r)) ? 'SAME' : 'UPDATE', r, onlyIf ? { onlyIf } : {});
        }
      }
    }
    const summary = {};
    for (const x of plan) { summary[x.table] ||= { NEW: 0, SAME: 0, UPDATE: 0, CONFLICT: 0, SKIP: 0, REPLACE: 0, REJECT: 0 }; summary[x.table][x.action]++; }
    const previewId = `PV-${crypto.randomBytes(6).toString('hex')}`;
    const result = { previewId, header: h, fileName: path.basename(filePath), sizeBytes: fs.statSync(filePath).size, integrity: 'OK', contentSha256: pkg.contentSha256,
      role: roleText(h, s), summary, conflicts: plan.filter((x) => x.action === 'CONFLICT').map(({ table, id, changes, note, default: d }) => ({ table, id, changes, note, default: d })),
      rejected: plan.filter((x) => x.action === 'REJECT').map(({ table, id, note }) => ({ table, id, note })), totals: pkgTotals(T),
      canImport: !plan.some((x) => x.action === 'REJECT'), ticketsOnly, ticketsInPackage: (pkg.tables.PHIEU_CAN || []).length,
      remapped: (T.KY_TINH || []).filter((p) => /@/.test(p.period_id)).map((p) => p.period_code) };
    this.staged.set(previewId, { pkg, plan, filePath, sig: this._sig(plan), user: user && user.username });
    return result;
  }

  // ─────────────────────────── NHẬP ───────────────────────────
  async importPackage({ previewId, decisions = {}, user }) {
    const st = this.staged.get(previewId); if (!st) throw new AppError('NOT_FOUND', 'Hết phiên xem trước — hãy xem trước lại gói');
    if (st.sig !== this._sig(st.plan)) throw businessError('E_PREVIEW_STALE', 'Dữ liệu đã thay đổi kể từ lúc xem trước — hãy xem trước lại');
    if (st.plan.some((x) => x.action === 'REJECT')) throw businessError('E_PACKAGE_REJECTED', 'Gói có phần không nhận được — xem danh sách bị từ chối');
    const safety = this.backup ? await this.backup.backup({ kind: 'safety', note: 'truoc-nhap-goi', user }) : null;
    const h = st.pkg.header; const s = this.store;
    const out = await s.transaction((tx) => {
      const counts = {};
      const inc = (t, a) => { counts[t] ||= {}; counts[t][a] = (counts[t][a] || 0) + 1; };
      const order = [...CATALOG_ORDER, ...DATA_ORDER];
      const byTable = (t) => st.plan.filter((x) => x.table === t);
      // kỳ thay bản cũ: các dòng kết quả hiện hành cũ → không còn hiện hành
      const choiceOf = (t, x) => decisions[`${t}:${x.id}`] || x.default || 'KEEP';
      const skipPeriods = new Set(byTable('KY_TINH').filter((y) => y.action === 'CONFLICT' && choiceOf('KY_TINH', y) !== 'TAKE').map((y) => y.id));
      for (const x of byTable('KY_TINH').filter((y) => y.action === 'REPLACE' || (y.action === 'CONFLICT' && choiceOf('KY_TINH', y) === 'TAKE'))) {
        for (const t of ['TRANSPORT_CALCULATION', 'TRANSPORT_DETAIL', 'FUEL_DETAIL', 'BKVC_LINE']) {
          const pk = SCHEMA.tables[t].pk;
          for (const r of tx.all(t).filter((y) => y.period_id === x.id && y.is_current)) tx.update(t, r[pk], { is_current: false, ...(r.usage_state ? { usage_state: 'RELEASED' } : {}) });
        }
      }
      for (const t of order) {
        for (const x of byTable(t)) {
          if (x.onlyIf && x.onlyIf.every((pid) => skipPeriods.has(pid))) { inc(t, 'KEEP'); continue; }
          const choice = x.action === 'CONFLICT' ? (decisions[`${t}:${x.id}`] || x.default || 'KEEP') : null;
          const act = x.action === 'CONFLICT' ? (choice === 'TAKE' ? 'UPDATE' : 'KEEP') : x.action;
          const row = sanitize(t, x.row, h, st.pkg.contentSha256);
          if (act === 'NEW') { tx.insert(t, row); inc(t, 'NEW'); }
          else if (act === 'UPDATE' || act === 'REPLACE') {
            const pk = SCHEMA.tables[t].pk; const patch = { ...row }; delete patch[pk];
            for (const k of META) delete patch[k];
            tx.update(t, x.id, patch); inc(t, act);
          } else inc(t, act);
        }
      }
      const id = tx.nextId('EX', 5);
      tx.insert('EXCHANGE_LOG', { exchange_id: id, direction: 'IMPORT', package_type: h.packageType, file_name: path.basename(st.filePath), package_sha256: st.pkg.contentSha256,
        source_install_id: h.sourceInstallId, source_unit_code: h.sourceUnitCode, target_unit_code: s.unitCode, counts_json: JSON.stringify(counts), status: 'DONE',
        message: safety ? `sao lưu an toàn: ${path.basename(safety.file)}` : '', created_at: tx.now, created_by: user.username });
      tx.audit('IMPORT_PACKAGE', 'EXCHANGE_LOG', id, null, { packageType: h.packageType, from: h.sourceUnitCode, file: path.basename(st.filePath), counts, decisions });
      return { exchangeId: id, counts };
    }, { user: user.username });
    this.staged.delete(previewId);
    return { ...out, safetyBackup: safety ? safety.file : null };
  }

  /** Chữ ký các bản ghi cục bộ mà gói sẽ chạm tới — đổi = phải xem trước lại (sao lưu, nhật ký không tính). */
  _sig(plan) {
    return sha(plan.map((x) => { const r = this.store.get(x.table, x.id); return `${x.table}:${x.id}:${r ? canon(content(r)) : '-'}`; }).join('|'));
  }

  list() { return { items: this.store.all('EXCHANGE_LOG').slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)) }; }
}

/** Chuẩn hóa dòng nhận từ gói cho bản cài này. */
function sanitize(t, r, h, pkgSha) {
  const x = { ...r };
  if (t === 'PHIEU_CAN' || t === 'GIAO_NHAN_DAU') x.import_batch_id = ''; // lô import thuộc bản cài nguồn
  if (t === 'KY_TINH') Object.assign(x, { origin: 'IMPORTED', origin_install_id: h.sourceInstallId, package_sha256: pkgSha });
  return x;
}
function diff(a, b) { return Object.keys({ ...a, ...b }).filter((k) => !META.has(k) && canon(a[k]) !== canon(b[k])).map((k) => ({ field: k, local: a[k], incoming: b[k] })); }
function roleText(h, s) {
  if (h.packageType === 'KY_TINH') return `Bản cài ${s.unitCode} nhận kỳ tính của bên vận chuyển ${h.sourceUnitCode} — lưu để xem / in lại, không sửa được`;
  if (h.packageType === 'DANH_MUC') return `Nhận danh mục do bản cài ${h.sourceUnitCode} gửi — cập nhật tuyến, giá, đơn vị, xe, hợp đồng liên quan`;
  return `Nhận phiếu cân do bản cài ${h.sourceUnitCode} gửi`;
}
function pkgTotals(T) {
  const lines = T.BKVC_LINE || []; const calcs = T.TRANSPORT_CALCULATION || [];
  return { periods: (T.KY_TINH || []).map((p) => p.period_code), trips: lines.reduce((a, l) => a + l.trip_count, 0), ton: lines.reduce((a, l) => a + l.kg, 0) / 1000,
    prices: calcs.map((c) => ({ routeCode: c.route_code, transportPrice: c.transport_price })), totalInclVat: lines.reduce((a, l) => a + l.amount_incl_vat, 0),
    tickets: (T.PHIEU_CAN || []).length, catalog: Object.fromEntries(CATALOG_ORDER.filter((t) => T[t]).map((t) => [t, T[t].length])) };
}
function defaultName(h) {
  const d = h.createdAt.slice(0, 10).replace(/-/g, '');
  if (h.packageType === 'KY_TINH') return `${h.periodCodes.map((c) => c.replace(/[/#]/g, '_')).join('+')}.dgvc`;
  return `${TYPE_TEXT[h.packageType].replace(/\s/g, '')}_${h.sourceUnitCode}${h.targetUnitCode ? `_cho_${h.targetUnitCode}` : ''}_${d}.dgvc`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

module.exports = { ExchangeService, canon };
