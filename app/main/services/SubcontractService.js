'use strict';
/**
 * SubcontractService — Quản lý các đợt nạp dữ liệu của ĐỐI TÁC (bản sao phục vụ ĐỐI CHIẾU — không vào kỳ, không đổi số tiền kỳ nào).
 *
 * Lưu trữ:
 *  - Metadata các đợt: <store.root>/subcontract/batches.json
 *  - Dữ liệu chi tiết từng đợt: <store.root>/subcontract/files/<batchId>.json
 *
 * Nghiệp vụ:
 *  - Nhập file JSON (hoặc .dgvc, .xlsx phiếu cân / dầu) của từng đợt thuê vận chuyển gửi về.
 *  - Gán (tùy chọn) vào Kỳ vận chuyển công ty đang chạy cho đối tác (periodId).
 *  - Quản lý đơn giá thuê (đ/tấn), đơn giá dầu (đ/lít), khấu trừ tiền dầu vào cước.
 *  - Cung cấp số liệu tổng hợp (chuyến, tấn, xe, lít dầu) và liên kết trực tiếp sang Đối chiếu 3 tiêu chí.
 *  - Chống nạp trùng: clientRequestId, SHA-256 file, trùng toàn bộ khóa phiếu (E_BATCH_DUPLICATE, có xác nhận ở giao diện).
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { AppError, businessError } = require('../../shared/errors');
const { idempotentMethod } = require('./idempotent');
const { normTickets, normFuels, extractFromObj, fuelDate } = require('../import/partnerNorm');
const { rentLine, tonOf } = require('./rentMath');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const fold = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
/** Đơn giá / số tiền kiểu Việt: "150.000" = 150000; "150,5" = 150,5; số thật giữ nguyên; chữ lạ → NaN. Rỗng → ''. */
const moneyOrEmpty = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  if (typeof v !== 'string') return Number(v);
  const s = v.trim().replace(/\s/g, ''); if (!s) return '';
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
  if (/^\d+([.,]\d+)?$/.test(s)) return Number(s.replace(',', '.'));
  return NaN;
};
const MAX_PRICE = 1000000000;
const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const dmy = (s) => (s ? `${String(s).slice(8, 10)}/${String(s).slice(5, 7)}/${String(s).slice(0, 4)}` : '');
/** Chữ ký NỘI DUNG của đợt: tập khóa phiếu cân (số phiếu|ngày cân 1|biển số) + dòng dầu (ngày|biển số|lít) — không phụ thuộc định dạng file. */
const contentSig = (tickets, fuelRows) => {
  const keys = [...tickets.map((t) => `T|${t.ticket_no}|${t.weigh1_date}|${t.plate_no}`), ...fuelRows.map((f) => `F|${f.receipt_date}|${f.plate_no}|${f.qty_liter}`)].sort();
  return keys.length ? sha256(keys.join('\n')) : '';
};

class SubcontractService {
  constructor(store, { exchange, importService } = {}) {
    this.store = store;
    this.exchange = exchange;
    this.importService = importService;
    this.done = store.requestMap('subcontract'); // clientRequestId → kết quả (bấm 2 lần / gửi lại không nạp 2 đợt)
    idempotentMethod(this, 'importBatch');
  }

  _batchesDir() {
    return path.join(this.store.root, 'subcontract');
  }

  _batchesFile() {
    return path.join(this._batchesDir(), 'batches.json');
  }

  _filesDir() {
    return path.join(this._batchesDir(), 'files');
  }

  _readBatches() {
    const f = this._batchesFile();
    if (!fs.existsSync(f)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(f, 'utf8'));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  _writeBatches(list) {
    fs.mkdirSync(this._batchesDir(), { recursive: true });
    const f = this._batchesFile();
    const tmp = `${f}.tmp-${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf8');
    fs.renameSync(tmp, f);
  }

  /** Chữ ký nội dung của một đợt đã lưu (đợt cũ chưa có thì tính từ file chi tiết). */
  _sigOf(meta) {
    if (meta.contentSig !== undefined) return meta.contentSig;
    try {
      const d = JSON.parse(fs.readFileSync(meta.filePath, 'utf8'));
      return contentSig(d.tickets || [], d.fuelRows || []);
    } catch {
      return '';
    }
  }

  /** Các đợt đã nạp trùng với file này: cùng SHA-256 file (SAME_FILE) hoặc trùng toàn bộ khóa phiếu / dầu (SAME_TICKETS). */
  _findDuplicates({ fileSha256, sig }) {
    const out = [];
    for (const b of this._readBatches()) {
      const reason = fileSha256 && b.fileSha256 === fileSha256 ? 'SAME_FILE' : sig && this._sigOf(b) === sig ? 'SAME_TICKETS' : '';
      if (reason) out.push({ batchId: b.batchId, batchName: b.batchName, createdAt: b.createdAt, reason });
    }
    return out;
  }

  /**
   * Đọc và trích xuất danh sách phiếu cân và dòng dầu từ file .json, .dgvc hoặc .xlsx (Excel phiếu cân / Excel dầu / cả hai sheet).
   * Trả thêm `duplicates` (các đợt đã nạp trùng file / trùng nội dung) và `unreadable` (dòng Excel không đọc được).
   */
  async previewBatch({ filePath, jsonContent }) {
    if (!filePath && !jsonContent) throw new AppError('VALIDATION_FAILED', 'Thiếu đường dẫn file hoặc nội dung JSON');

    let tickets = [];
    let fuelRows = [];
    const fileName = filePath ? path.basename(filePath) : 'batch.json';
    let partnerSuggested = '';
    let fileSha256 = '';
    const unreadable = [];

    if (jsonContent) {
      let data;
      try {
        data = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
      } catch (e) {
        throw new AppError('VALIDATION_FAILED', `JSON không hợp lệ: ${e.message}`);
      }
      const parsed = extractFromObj(data);
      tickets = parsed.tickets;
      fuelRows = parsed.fuelRows;
      partnerSuggested = parsed.partner || '';
      fileSha256 = sha256(typeof jsonContent === 'string' ? jsonContent : JSON.stringify(jsonContent));
    } else {
      if (!fs.existsSync(filePath)) throw new AppError('NOT_FOUND', `Không tìm thấy file: ${filePath}`);
      const ext = path.extname(filePath).toLowerCase();
      fileSha256 = sha256(fs.readFileSync(filePath));

      if (ext === '.dgvc') {
        let pkg;
        if (this.exchange) {
          pkg = this.exchange.read(filePath);
        } else {
          const raw = fs.readFileSync(filePath);
          try {
            pkg = JSON.parse(zlib.gunzipSync(raw));
          } catch {
            pkg = JSON.parse(raw.toString('utf8'));
          }
        }
        const parsed = extractFromObj(pkg);
        tickets = parsed.tickets;
        fuelRows = parsed.fuelRows;
        partnerSuggested = parsed.partner || '';
      } else if (ext === '.json') {
        const raw = fs.readFileSync(filePath);
        let data;
        try {
          data = JSON.parse(zlib.gunzipSync(raw));
        } catch {
          try {
            data = JSON.parse(raw.toString('utf8'));
          } catch (e) {
            throw new AppError('VALIDATION_FAILED', `File JSON không hợp lệ: ${e.message}`);
          }
        }
        const parsed = extractFromObj(data);
        tickets = parsed.tickets;
        fuelRows = parsed.fuelRows;
        partnerSuggested = parsed.partner || '';
      } else if (['.xlsx', '.xlsm', '.xls'].includes(ext)) {
        if (!this.importService) throw new AppError('VALIDATION_FAILED', 'ImportService chưa được khởi tạo để đọc Excel');
        const r = await this.importService.readPartnerExcel({ filePath });
        if (r.tickets) {
          const ok = (x) => x.record.ticket_no && x.record.weigh1_date && x.record.plate_no && typeof x.record.net_kg === 'number';
          tickets = r.tickets.rows.filter(ok).map((x) => ({ ...x.record, _rowNo: x.rowNo }));
          for (const x of r.tickets.rows.filter((y) => !ok(y))) unreadable.push({ sheet: 'phiếu cân', rowNo: x.rowNo, note: x.errors.join('; ') });
        }
        if (r.fuel) {
          fuelRows = r.fuel.rows.filter((x) => !x.errors.length).map((x) => ({ ...x.record, _rowNo: x.rowNo }));
          for (const x of r.fuel.rows.filter((y) => y.errors.length)) unreadable.push({ sheet: 'dầu', rowNo: x.rowNo, note: x.errors.join('; ') });
        }
      } else {
        throw new AppError('VALIDATION_FAILED', 'Định dạng file không hỗ trợ (chỉ nhận .json, .dgvc, .xlsx)');
      }
    }

    // Chuẩn hóa — CÙNG bộ chuẩn hóa với ReconcileService (đường đọc file trực tiếp)
    const normTk = normTickets(tickets);
    const normFuel = normFuels(fuelRows);

    const platesSet = new Set([...normTk.map((t) => t.plate_no), ...normFuel.map((f) => f.plate_no)]);
    const totalKg = normTk.reduce((sum, t) => sum + (t.net_kg || 0), 0);
    const totalFuelLiter = normFuel.reduce((sum, f) => sum + (f.qty_liter || 0), 0);

    const dates = [...normTk.map((t) => t.weigh1_date), ...normFuel.map((f) => f.receipt_date)].filter(Boolean).sort();
    const dateFrom = dates[0] || '';
    const dateTo = dates[dates.length - 1] || '';
    const sig = contentSig(normTk, normFuel);

    return {
      fileName,
      fileSha256,
      contentSig: sig,
      partnerSuggested,
      unreadable,
      duplicates: this._findDuplicates({ fileSha256, sig }),
      summary: {
        ticketCount: normTk.length,
        totalKg,
        totalTon: Math.round(totalKg / 10) / 100,
        plateCount: platesSet.size,
        plates: [...platesSet].sort(),
        fuelCount: normFuel.length,
        totalFuelLiter: Math.round(totalFuelLiter * 100) / 100,
        dateFrom,
        dateTo
      },
      tickets: normTk,
      fuelRows: normFuel
    };
  }

  /**
   * Nạp và lưu đợt thuê vận chuyển (bản sao phục vụ ĐỐI CHIẾU).
   * Chống trùng: cùng clientRequestId → một kết quả; trùng SHA-256 file hoặc trùng toàn bộ khóa phiếu với đợt đã có → lỗi
   * E_BATCH_DUPLICATE (details.duplicates) trừ khi người dùng đã xác nhận (confirmDuplicate: true).
   * Ghi file đợt kiểu tạm rồi đổi tên; ghi nhật ký thao tác thất bại thì HOÀN TÁC đợt và báo lỗi (không nuốt lỗi).
   */
  async importBatch({ periodId, partnerName, batchName, rentUnitPrice = 0, fuelUnitPrice = 0, deductFuel = true, filePath, jsonContent, confirmDuplicate = false, clientRequestId, user }) {
    const preview = await this.previewBatch({ filePath, jsonContent });
    if (!preview.summary.ticketCount && !preview.summary.fuelCount) {
      throw new AppError('VALIDATION_FAILED', 'File không có dữ liệu phiếu cân hoặc dầu');
    }

    let periodCode = '';
    let contractId = '';
    if (periodId) {
      const p = this.store.get('KY_TINH', periodId);
      if (!p) throw new AppError('NOT_FOUND', `Không tìm thấy kỳ vận chuyển mã ${periodId}`);
      periodCode = p.period_code;
      contractId = p.contract_id;
    }

    // kiểm trùng và ghi đợt nằm trong CÙNG đoạn chạy đồng bộ (không có await xen giữa) → hai yêu cầu song song không cùng lọt qua
    const dups = this._findDuplicates({ fileSha256: preview.fileSha256, sig: preview.contentSig });
    if (dups.length && !confirmDuplicate) {
      const d = dups[0];
      throw businessError('E_BATCH_DUPLICATE', d.reason === 'SAME_FILE'
        ? `File này đã nạp ở đợt "${d.batchName}" (${d.batchId}, ${dmy(d.createdAt)}). Nạp lại sẽ bị đếm hai lần — chỉ nạp thêm khi chắc chắn cần.`
        : `Toàn bộ phiếu cân / dầu trong file trùng với đợt đã nạp "${d.batchName}" (${d.batchId}, ${dmy(d.createdAt)}). Chỉ nạp thêm khi chắc chắn cần.`, { duplicates: dups });
    }

    const batchId = `SCB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const filesDir = this._filesDir();
    fs.mkdirSync(filesDir, { recursive: true });
    const storedFilePath = path.join(filesDir, `${batchId}.json`);

    const batchPayload = {
      batchId,
      periodId: periodId || '',
      periodCode,
      contractId,
      partnerName: String(partnerName || preview.partnerSuggested || '').trim(),
      batchName: String(batchName || '').trim() || `Đợt ${batchId}`,
      rentUnitPrice: Number(rentUnitPrice) || 0,
      fuelUnitPrice: Number(fuelUnitPrice) || 0,
      deductFuel: deductFuel !== false,
      summary: preview.summary,
      tickets: preview.tickets,
      fuelRows: preview.fuelRows,
      importedAt: new Date().toISOString(),
      importedBy: user ? user.username : 'system'
    };

    const tmpFile = `${storedFilePath}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
    fs.writeFileSync(tmpFile, JSON.stringify(batchPayload, null, 2), 'utf8');
    fs.renameSync(tmpFile, storedFilePath);

    const batchMeta = {
      batchId,
      periodId: batchPayload.periodId,
      periodCode: batchPayload.periodCode,
      contractId: batchPayload.contractId,
      partnerName: batchPayload.partnerName,
      batchName: batchPayload.batchName,
      rentUnitPrice: batchPayload.rentUnitPrice,
      fuelUnitPrice: batchPayload.fuelUnitPrice,
      deductFuel: batchPayload.deductFuel,
      fileName: preview.fileName,
      fileSha256: preview.fileSha256,
      contentSig: preview.contentSig,
      filePath: storedFilePath,
      dateFrom: preview.summary.dateFrom,
      dateTo: preview.summary.dateTo,
      summary: preview.summary,
      status: 'IMPORTED',
      createdAt: batchPayload.importedAt,
      createdBy: batchPayload.importedBy
    };

    this._writeBatches([batchMeta, ...this._readBatches()]);

    try {
      await this.store.transaction((tx) => {
        tx.audit('IMPORT_SUBCONTRACT_BATCH', 'SUBCONTRACT_BATCH', batchId, null, {
          periodId: batchMeta.periodId,
          partnerName: batchMeta.partnerName,
          tickets: preview.summary.ticketCount,
          fuel: preview.summary.fuelCount,
          totalTon: preview.summary.totalTon,
          fileSha256: preview.fileSha256,
          confirmedDuplicate: Boolean(dups.length)
        });
      }, { user: user ? user.username : 'system' });
    } catch (err) {
      // không ghi được nhật ký thao tác → hoàn tác: bỏ đợt vừa ghi (không để đợt "không dấu vết")
      this._writeBatches(this._readBatches().filter((b) => b.batchId !== batchId));
      try { fs.unlinkSync(storedFilePath); } catch { /* file đã mất: bỏ qua */ }
      throw err;
    }

    if (clientRequestId) this.done.set(clientRequestId, batchMeta);
    return batchMeta;
  }

  list({ periodId, contractId } = {}) {
    let batches = this._readBatches();
    if (periodId) batches = batches.filter((b) => b.periodId === periodId);
    if (contractId) batches = batches.filter((b) => b.contractId === contractId);
    return batches;
  }

  getBatch({ batchId }) {
    if (!batchId) throw new AppError('VALIDATION_FAILED', 'Thiếu batchId');
    const batches = this._readBatches();
    const meta = batches.find((b) => b.batchId === batchId);
    if (!meta) throw new AppError('NOT_FOUND', `Không tìm thấy đợt ${batchId}`);

    let details = null;
    if (fs.existsSync(meta.filePath)) {
      try {
        details = JSON.parse(fs.readFileSync(meta.filePath, 'utf8'));
      } catch {
        details = null;
      }
    }
    return { ...meta, details };
  }

  // ─────────────────────────── BÁO CÁO THUÊ VẬN CHUYỂN (tổng hợp số liệu nhận về) ───────────────────────────
  /**
   * Tính số liệu của MỘT đợt theo ĐÚNG cách ReconcileService.compare tính phần "bên kia" (their*): phiếu lọc theo khoảng ngày của kỳ gắn kèm (nếu có),
   * bỏ phiếu trùng khóa (số phiếu|ngày cân 1|biển số), tiền thuê tính THEO TỪNG XE (rentMath.rentLine — công thức dùng chung), dầu chỉ tính cho xe có chuyến.
   */
  _computeBatch(meta) {
    let data = null;
    try { if (meta.filePath && fs.existsSync(meta.filePath)) data = JSON.parse(fs.readFileSync(meta.filePath, 'utf8')); } catch { data = null; }
    const ex = extractFromObj(data); const tickets = normTickets(ex.tickets); const fuelRows = normFuels(ex.fuelRows);
    let from = ''; let to = '';
    if (meta.periodId) { const period = this.store.get('KY_TINH', meta.periodId); if (period) { from = period.date_from || ''; to = period.date_to || ''; } }
    const dates = [...tickets.map((t) => t.weigh1_date), ...fuelRows.map(fuelDate)].filter(Boolean).sort();
    if (!from) from = dates[0] || '';
    if (!to) to = dates[dates.length - 1] || '';
    const inRange = (d) => (!from || d >= from) && (!to || d <= to);
    const seen = new Map();
    for (const t of tickets) { if (!inRange(t.weigh1_date)) continue; const k = `${t.ticket_no}|${t.weigh1_date}|${t.plate_no}`; if (!seen.has(k)) seen.set(k, t); }
    const fuel = fuelRows.filter((f) => inRange(fuelDate(f)));
    const rentPrice = Number(meta.rentUnitPrice) || 0; const fuelPrice = Number(meta.fuelUnitPrice) || 0; const deductFuel = meta.deductFuel !== false;
    const plates = new Map(); const dayMap = new Map();
    const day = (d) => { if (!dayMap.has(d)) dayMap.set(d, { date: d, ticketCount: 0, kg: 0, fuelLiter: 0 }); return dayMap.get(d); };
    for (const t of seen.values()) {
      if (!plates.has(t.plate_no)) plates.set(t.plate_no, { plateNo: t.plate_no, ticketCount: 0, kg: 0, fuelCount: 0, fuelLiter: 0 });
      const x = plates.get(t.plate_no); x.ticketCount += 1; x.kg += Number(t.net_kg) || 0;
      const d = day(t.weigh1_date); d.ticketCount += 1; d.kg += Number(t.net_kg) || 0;
    }
    const fuelOnly = new Map();
    for (const f of fuel) {
      const l = Number(f.qty_liter) || 0; day(fuelDate(f)).fuelLiter += l;
      if (plates.has(f.plate_no)) { const x = plates.get(f.plate_no); x.fuelCount += 1; x.fuelLiter += l; }
      else { const o = fuelOnly.get(f.plate_no) || { plateNo: f.plate_no, fuelCount: 0, fuelLiter: 0 }; o.fuelCount += 1; o.fuelLiter += l; fuelOnly.set(f.plate_no, o); }
    }
    const byPlate = [...plates.values()].sort((a, b) => a.plateNo.localeCompare(b.plateNo)).map((x) => ({ ...x, ton: tonOf(x.kg),
      ...rentLine({ kg: x.kg, liter: x.fuelLiter, rentPrice, fuelPrice, deductFuel }), fuelLiter: round2(x.fuelLiter) }));
    const sum = (k) => byPlate.reduce((a, r) => a + r[k], 0);
    const kg = sum('kg'); const liter = byPlate.reduce((a, r) => a + r.fuelLiter, 0);
    const row = { batchId: meta.batchId, batchName: meta.batchName, partnerName: meta.partnerName || '', periodId: meta.periodId || '', periodCode: meta.periodCode || '', contractId: meta.contractId || '',
      dateFrom: meta.dateFrom || (meta.summary && meta.summary.dateFrom) || '', dateTo: meta.dateTo || (meta.summary && meta.summary.dateTo) || '',
      ticketCount: seen.size, plateCount: byPlate.length, totalKg: kg, totalTon: tonOf(kg), fuelLiter: round2(liter), fuelLiterUnmatched: round2([...fuelOnly.values()].reduce((a, o) => a + o.fuelLiter, 0)),
      rentUnitPrice: rentPrice, fuelUnitPrice: fuelPrice, deductFuel, rentAmount: sum('rentAmount'), fuelAmount: sum('fuelAmount'), deductFuelAmount: sum('deductFuelAmount'), payable: sum('payable'),
      importedAt: meta.createdAt || '', rowVersion: meta.rowVersion || 1, missingFile: !data };
    return { row, byPlate, byDate: [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ ...d, ton: tonOf(d.kg), fuelLiter: round2(d.fuelLiter) })),
      fuelOnly: [...fuelOnly.values()].sort((a, b) => a.plateNo.localeCompare(b.plateNo)).map((o) => ({ ...o, fuelLiter: round2(o.fuelLiter) })) };
  }

  _sumRows(rows) {
    const t = { batchCount: rows.length, ticketCount: 0, plateCount: 0, totalKg: 0, fuelLiter: 0, rentAmount: 0, fuelAmount: 0, deductFuelAmount: 0, payable: 0 };
    for (const r of rows) { t.ticketCount += r.ticketCount; t.plateCount += r.plateCount; t.totalKg += r.totalKg; t.fuelLiter += r.fuelLiter; t.rentAmount += r.rentAmount; t.fuelAmount += r.fuelAmount; t.deductFuelAmount += r.deductFuelAmount; t.payable += r.payable; }
    t.totalTon = tonOf(t.totalKg); t.fuelLiter = round2(t.fuelLiter);
    return t;
  }

  /**
   * Báo cáo thuê vận chuyển: gom các đợt đã nạp thành bảng số liệu nhận về (chuyến, tấn, dầu, tiền thuê = tấn × đơn giá thuê, dầu trừ, thực trả).
   * Lọc: partnerName (đúng tên) · q (tìm không dấu theo đơn vị / tên đợt) · dateFrom/dateTo hoặc month 'yyyy-MM' (giao với khoảng ngày dữ liệu của đợt) · contractId · periodId.
   */
  report({ partnerName = '', q = '', dateFrom = '', dateTo = '', month = '', contractId = '', periodId = '' } = {}) {
    if (month) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) throw new AppError('VALIDATION_FAILED', 'Tháng phải có dạng yyyy-MM', { field: 'month' });
      const [y, m] = String(month).split('-').map(Number); const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      dateFrom = dateFrom || `${month}-01`; dateTo = dateTo || `${month}-${String(last).padStart(2, '0')}`;
    }
    for (const [k, v] of [['dateFrom', dateFrom], ['dateTo', dateTo]]) if (v && !isDay(v)) throw new AppError('VALIDATION_FAILED', `${k} phải có dạng yyyy-MM-dd`, { field: k });
    if (dateFrom && dateTo && dateFrom > dateTo) throw new AppError('VALIDATION_FAILED', 'Từ ngày không được sau đến ngày', { field: 'dateFrom' });
    const all = this._readBatches();
    const partners = [...new Set(all.map((b) => b.partnerName || '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
    const fq = fold(q);
    const kept = all.filter((b) => {
      if (partnerName && (b.partnerName || '') !== partnerName) return false;
      if (contractId && b.contractId !== contractId) return false;
      if (periodId && b.periodId !== periodId) return false;
      if (fq && !fold(`${b.partnerName || ''} ${b.batchName || ''} ${b.periodCode || ''}`).includes(fq)) return false;
      if (dateFrom || dateTo) {
        const a = b.dateFrom || (b.summary && b.summary.dateFrom) || ''; const z = b.dateTo || (b.summary && b.summary.dateTo) || '';
        if (!a && !z) return false;
        if (dateTo && a && a > dateTo) return false;
        if (dateFrom && z && z < dateFrom) return false;
      }
      return true;
    });
    const rows = kept.map((b) => this._computeBatch(b).row)
      .sort((a, b) => a.partnerName.localeCompare(b.partnerName, 'vi') || String(a.dateFrom).localeCompare(String(b.dateFrom)) || String(a.importedAt).localeCompare(String(b.importedAt)));
    const byMap = new Map();
    for (const r of rows) { if (!byMap.has(r.partnerName)) byMap.set(r.partnerName, []); byMap.get(r.partnerName).push(r); }
    const byPartner = [...byMap.entries()].map(([name, rs]) => { const t = this._sumRows(rs); return { partnerName: name, batchCount: t.batchCount, ticketCount: t.ticketCount, totalKg: t.totalKg, totalTon: t.totalTon, fuelLiter: t.fuelLiter,
      rentAmount: t.rentAmount, fuelAmount: t.fuelAmount, deductFuelAmount: t.deductFuelAmount, payable: t.payable }; });
    return { filter: { partnerName, q, dateFrom, dateTo, month, contractId, periodId }, partners, totalBatches: all.length, rows, byPartner, totals: this._sumRows(rows) };
  }

  /** Chi tiết một đợt theo xe (và theo ngày) — cộng lại đúng bằng dòng của `report`. fuelOnly: dầu của xe KHÔNG có chuyến nào (Đối chiếu 3 tiêu chí cũng không tính — chỉ để nhìn thấy). */
  reportDetail({ batchId } = {}) {
    if (!batchId) throw new AppError('VALIDATION_FAILED', 'Thiếu batchId', { field: 'batchId' });
    const meta = this._readBatches().find((b) => b.batchId === batchId);
    if (!meta) throw new AppError('NOT_FOUND', `Không tìm thấy đợt ${batchId}`);
    const c = this._computeBatch(meta); const r = c.row;
    return { batch: r, byPlate: c.byPlate, byDate: c.byDate, fuelOnly: c.fuelOnly, totals: { ticketCount: r.ticketCount, plateCount: r.plateCount, totalKg: r.totalKg, totalTon: r.totalTon, fuelLiter: r.fuelLiter,
      rentAmount: r.rentAmount, fuelAmount: r.fuelAmount, deductFuelAmount: r.deductFuelAmount, payable: r.payable } };
  }

  /**
   * Sửa đơn giá thuê (đ/tấn), giá dầu (đ/lít), cờ trừ dầu của một đợt (trước đây chỉ nhập lúc nạp). Bắt buộc lý do; ghi nhật ký TRƯỚC khi lưu.
   * Không đụng dữ liệu phiếu / dầu của đợt. Trường nào không gửi thì giữ nguyên; rowVersion (nếu gửi) phải khớp phiên bản hiện có (CONFLICT_VERSION).
   */
  async updateTerms({ batchId, rentUnitPrice, fuelUnitPrice, deductFuel, reason, rowVersion, user } = {}) {
    if (!batchId) throw new AppError('VALIDATION_FAILED', 'Thiếu batchId', { field: 'batchId' });
    const why = String(reason == null ? '' : reason).trim();
    if (!why) throw new AppError('VALIDATION_FAILED', 'Sửa đơn giá phải nhập lý do', { field: 'reason' });
    const cur = this._readBatches().find((b) => b.batchId === batchId);
    if (!cur) throw new AppError('NOT_FOUND', `Không tìm thấy đợt ${batchId}`);
    if (rowVersion !== undefined && rowVersion !== null && Number(rowVersion) !== (cur.rowVersion || 1)) throw new AppError('CONFLICT_VERSION', `Đợt ${batchId} đã được sửa ở nơi khác — mở lại rồi sửa`, { current: cur.rowVersion || 1 });
    const next = {};
    for (const [field, label, v] of [['rentUnitPrice', 'Đơn giá thuê', rentUnitPrice], ['fuelUnitPrice', 'Giá dầu', fuelUnitPrice]]) {
      if (v === undefined || v === null || v === '') continue;
      const n = moneyOrEmpty(v);
      if (typeof n !== 'number' || !Number.isFinite(n)) throw new AppError('VALIDATION_FAILED', `${label} không hợp lệ — nhập số, vd 150.000`, { field });
      if (n < 0) throw new AppError('VALIDATION_FAILED', `${label} không được âm`, { field });
      if (n > MAX_PRICE) throw new AppError('VALIDATION_FAILED', `${label} quá lớn (tối đa ${MAX_PRICE.toLocaleString('vi-VN')})`, { field });
      next[field] = n;
    }
    if (deductFuel !== undefined && deductFuel !== null) next.deductFuel = deductFuel !== false && deductFuel !== 'false';
    const before = { rentUnitPrice: cur.rentUnitPrice, fuelUnitPrice: cur.fuelUnitPrice, deductFuel: cur.deductFuel !== false };
    const after = { ...before, ...next };
    if (after.rentUnitPrice === before.rentUnitPrice && after.fuelUnitPrice === before.fuelUnitPrice && after.deductFuel === before.deductFuel) throw new AppError('VALIDATION_FAILED', 'Không có thay đổi nào để lưu');
    // ghi file TRƯỚC (lỗi ghi thì chưa có nhật ký sai); nhật ký lỗi thì HOÀN TÁC file — không để đổi giá mà không có dấu vết
    const list = this._readBatches(); const i = list.findIndex((b) => b.batchId === batchId);
    if (i < 0) throw new AppError('NOT_FOUND', `Đợt ${batchId} vừa bị xóa`);
    const prev = list.map((b) => ({ ...b }));
    list[i] = { ...list[i], ...after, rowVersion: (list[i].rowVersion || 1) + 1 };
    this._writeBatches(list);
    try { await this.store.transaction((tx) => { tx.audit('UPDATE_SUBCONTRACT_TERMS', 'SUBCONTRACT_BATCH', batchId, before, after, { reason: why }); }, { user: user ? user.username : 'system' }); } catch (e) { this._writeBatches(prev); throw e; }
    return this._computeBatch(list[i]).row;
  }

  /** Dữ liệu Excel của báo cáo: sheet Tổng hợp (từng đợt + tổng) · Theo đơn vị · Chi tiết theo xe (từng đợt). Tiêu đề cột tiếng Việt; số tiền định dạng #,##0. */
  reportSheets(params = {}) {
    const rep = this.report(params); const C = (header, key, fmt = 'text') => ({ header, key, fmt });
    const f = rep.filter; const range = f.dateFrom || f.dateTo ? `dữ liệu từ ngày ${dmy(f.dateFrom) || '…'} đến ngày ${dmy(f.dateTo) || '…'}` : 'toàn bộ các đợt đã nạp';
    const sub = `( ${range}${f.partnerName ? ` · đơn vị vận chuyển: ${f.partnerName}` : ''} · lập ${dmy(new Date().toISOString().slice(0, 10))} )`;
    const T = rep.totals;
    const detail = []; let n = 0;
    for (const r of rep.rows) { for (const x of this._computeBatch(this._readBatches().find((b) => b.batchId === r.batchId)).byPlate) detail.push({ stt: ++n, partnerName: r.partnerName, batchName: r.batchName, ...x }); }
    const dsum = (k) => detail.reduce((a, r) => a + r[k], 0);
    const company = this.store.get('DON_VI', this.store.unitCode);
    return { company, title: 'BÁO CÁO THUÊ VẬN CHUYỂN', subtitle: sub, sheets: [
      { name: 'Tong hop', title: 'TỔNG HỢP THEO ĐỢT', columns: [C('STT', 'stt', 'int'), C('Đơn vị vận chuyển', 'partnerName'), C('Tên đợt', 'batchName'), C('Dữ liệu từ ngày', 'dateFrom', 'date'), C('Dữ liệu đến ngày', 'dateTo', 'date'),
        C('Số chuyến', 'ticketCount', 'int'), C('Số xe', 'plateCount', 'int'), C('Tổng tấn', 'totalTon', 'dec2'), C('Dầu nhận (lít)', 'fuelLiter', 'dec2'), C('Đơn giá thuê (đ/tấn)', 'rentUnitPrice', 'int'),
        C('Giá dầu (đ/lít)', 'fuelUnitPrice', 'int'), C('Tiền thuê', 'rentAmount', 'int'), C('Dầu trừ', 'deductFuelAmount', 'int'), C('Thực trả', 'payable', 'int')],
        rows: rep.rows.map((r, i) => ({ stt: i + 1, ...r })),
        totalsRow: { partnerName: 'TỔNG CỘNG', batchName: `${rep.rows.length} đợt`, ticketCount: T.ticketCount, plateCount: T.plateCount, totalTon: T.totalTon, fuelLiter: T.fuelLiter, rentAmount: T.rentAmount, deductFuelAmount: T.deductFuelAmount, payable: T.payable } },
      { name: 'Theo don vi', title: 'TỔNG HỢP THEO ĐƠN VỊ VẬN CHUYỂN', columns: [C('Đơn vị vận chuyển', 'partnerName'), C('Số đợt', 'batchCount', 'int'), C('Số chuyến', 'ticketCount', 'int'), C('Tổng tấn', 'totalTon', 'dec2'),
        C('Dầu nhận (lít)', 'fuelLiter', 'dec2'), C('Tiền thuê', 'rentAmount', 'int'), C('Dầu trừ', 'deductFuelAmount', 'int'), C('Thực trả', 'payable', 'int')],
        rows: rep.byPartner.map((x) => ({ ...x, partnerName: x.partnerName || '(chưa ghi tên đơn vị)' })),
        totalsRow: { partnerName: 'TỔNG CỘNG', batchCount: T.batchCount, ticketCount: T.ticketCount, totalTon: T.totalTon, fuelLiter: T.fuelLiter, rentAmount: T.rentAmount, deductFuelAmount: T.deductFuelAmount, payable: T.payable } },
      { name: 'Chi tiet theo xe', title: 'CHI TIẾT THEO XE', columns: [C('STT', 'stt', 'int'), C('Đơn vị vận chuyển', 'partnerName'), C('Tên đợt', 'batchName'), C('Biển số', 'plateNo'), C('Số chuyến', 'ticketCount', 'int'),
        C('Tổng tấn', 'ton', 'dec2'), C('Dầu nhận (lít)', 'fuelLiter', 'dec2'), C('Tiền thuê', 'rentAmount', 'int'), C('Dầu trừ', 'deductFuelAmount', 'int'), C('Thực trả', 'payable', 'int')],
        rows: detail, totalsRow: { partnerName: 'TỔNG CỘNG', ticketCount: dsum('ticketCount'), ton: tonOf(dsum('kg')), fuelLiter: round2(dsum('fuelLiter')), rentAmount: dsum('rentAmount'), deductFuelAmount: dsum('deductFuelAmount'), payable: dsum('payable') } },
    ] };
  }

  async exportReport({ params = {}, targetPath } = {}) {
    if (!targetPath) throw new AppError('VALIDATION_FAILED', 'Thiếu đường dẫn lưu file');
    const { writeSheets } = require('../reports/xlsxExport');
    const d = this.reportSheets(params);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    await writeSheets(d, targetPath);
    return { path: targetPath, sizeBytes: fs.statSync(targetPath).size, rows: d.sheets[0].rows.length };
  }

  async deleteBatch({ batchId, user }) {
    if (!batchId) throw new AppError('VALIDATION_FAILED', 'Thiếu batchId');
    const removed = this._readBatches().find((b) => b.batchId === batchId);
    if (!removed) throw new AppError('NOT_FOUND', `Không tìm thấy đợt ${batchId}`);

    // ghi nhật ký TRƯỚC khi xóa: lỗi nhật ký thì không xóa và báo lỗi (trước đây `.catch(() => {})` nuốt lỗi)
    if (this.store && this.store.transaction) {
      await this.store.transaction((tx) => {
        tx.audit('DELETE_SUBCONTRACT_BATCH', 'SUBCONTRACT_BATCH', batchId, removed, null);
      }, { user: user ? user.username : 'system' });
    }

    this._writeBatches(this._readBatches().filter((b) => b.batchId !== batchId));
    if (removed.filePath && fs.existsSync(removed.filePath)) {
      try {
        fs.unlinkSync(removed.filePath);
      } catch {
        /* bỏ qua nếu không xóa được file chi tiết (đợt đã bỏ khỏi danh sách) */
      }
    }
    return { ok: true, batchId };
  }
}

module.exports = { SubcontractService };
