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
const { normTickets, normFuels, extractFromObj } = require('../import/partnerNorm');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
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
