'use strict';
/**
 * SubcontractService — Quản lý các đợt nạp dữ liệu thuê vận chuyển từ đơn vị khác.
 * 
 * Lưu trữ:
 *  - Metadata các đợt: <store.root>/subcontract/batches.json
 *  - Dữ liệu chi tiết từng đợt: <store.root>/subcontract/files/<batchId>.json
 * 
 * Nghiệp vụ:
 *  - Nhập file JSON (hoặc .dgvc, .xlsx) của từng đợt thuê vận chuyển gửi về.
 *  - Gán vào Kỳ vận chuyển công ty đang chạy cho đối tác (periodId).
 *  - Quản lý đơn giá thuê (đ/tấn), đơn giá dầu (đ/lít), khấu trừ tiền dầu vào cước.
 *  - Cung cấp số liệu tổng hợp (chuyến, tấn, xe, lít dầu) và liên kết trực tiếp sang Đối chiếu 3 tiêu chuẩn.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { AppError } = require('../../shared/errors');

const num = (v) => (typeof v === 'number' ? v : v === '' || v == null ? null : Number(v));

class SubcontractService {
  constructor(store, { exchange, importService } = {}) {
    this.store = store;
    this.exchange = exchange;
    this.importService = importService;
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

  /**
   * Đọc và trích xuất danh sách phiếu cân và dòng dầu từ file .json, .dgvc hoặc .xlsx
   */
  async previewBatch({ filePath, jsonContent }) {
    if (!filePath && !jsonContent) throw new AppError('VALIDATION_FAILED', 'Thiếu đường dẫn file hoặc nội dung JSON');

    let tickets = [];
    let fuelRows = [];
    let fileName = filePath ? path.basename(filePath) : 'batch.json';
    let partnerSuggested = '';

    if (jsonContent) {
      let data;
      try {
        data = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
      } catch (e) {
        throw new AppError('VALIDATION_FAILED', `JSON không hợp lệ: ${e.message}`);
      }
      const parsed = this._extractFromObj(data);
      tickets = parsed.tickets;
      fuelRows = parsed.fuelRows;
      partnerSuggested = parsed.partner || '';
    } else {
      if (!fs.existsSync(filePath)) throw new AppError('NOT_FOUND', `Không tìm thấy file: ${filePath}`);
      const ext = path.extname(filePath).toLowerCase();

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
        tickets = (pkg.tables && (pkg.tables.PHIEU_CAN || pkg.tables.tickets)) || [];
        fuelRows = (pkg.tables && (pkg.tables.GIAO_NHAN_DAU || pkg.tables.fuel)) || [];
        partnerSuggested = (pkg.header && pkg.header.sourceUnitCode) || '';
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
        const parsed = this._extractFromObj(data);
        tickets = parsed.tickets;
        fuelRows = parsed.fuelRows;
        partnerSuggested = parsed.partner || '';
      } else if (['.xlsx', '.xlsm', '.xls'].includes(ext)) {
        if (!this.importService) throw new AppError('VALIDATION_FAILED', 'ImportService chưa được khởi tạo để đọc Excel');
        const r = await this.importService.readTickets({ filePath });
        const ok = (x) => x.record.ticket_no && x.record.weigh1_date && x.record.plate_no && typeof x.record.net_kg === 'number';
        tickets = r.rows.filter(ok).map((x) => ({ ...x.record, _rowNo: x.rowNo }));
        fuelRows = [];
      } else {
        throw new AppError('VALIDATION_FAILED', 'Định dạng file không hỗ trợ (chỉ nhận .json, .dgvc, .xlsx)');
      }
    }

    // Chuẩn hóa phiếu cân
    const normTickets = tickets.filter((t) => !t.is_deleted).map((t, idx) => ({
      ticket_no: String(t.ticket_no ?? t.ticketNo ?? `PH-${idx + 1}`).trim(),
      weigh1_date: String(t.weigh1_date ?? t.date ?? t.weighDate ?? '').slice(0, 10),
      weigh1_time: String(t.weigh1_time ?? t.time ?? t.weighTime ?? '').slice(0, 8),
      weigh2_date: String(t.weigh2_date ?? t.weigh2Date ?? '').slice(0, 10),
      weigh2_time: String(t.weigh2_time ?? t.weigh2Time ?? '').slice(0, 8),
      plate_no: String(t.plate_no ?? t.plateNo ?? '').trim().toUpperCase(),
      weight1_kg: t.weight1_kg != null ? num(t.weight1_kg) : null,
      weight2_kg: t.weight2_kg != null ? num(t.weight2_kg) : null,
      net_kg: num(t.net_kg ?? t.netKg ?? t.weightKg ?? 0) || 0,
      route_code: String(t.route_code ?? t.routeCode ?? '').trim(),
      owner_unit_code: String(t.owner_unit_code ?? t.owner ?? '').trim(),
      _rowNo: t._rowNo || idx + 1
    })).filter((t) => t.ticket_no && t.plate_no);

    // Chuẩn hóa dòng dầu
    const normFuel = fuelRows.filter((f) => !f.is_deleted).map((f, idx) => ({
      receipt_no: String(f.receipt_no ?? f.receiptNo ?? `D-${idx + 1}`).trim(),
      receipt_date: String(f.receipt_date ?? f.receive_date ?? f.issue_date ?? f.date ?? '').slice(0, 10),
      plate_no: String(f.plate_no ?? f.plateNo ?? '').trim().toUpperCase(),
      qty_liter: num(f.qty_liter ?? f.qtyLiter ?? f.liter ?? f.liters ?? 0) || 0,
      note: String(f.note ?? '').trim()
    })).filter((f) => f.plate_no);

    const platesSet = new Set([...normTickets.map((t) => t.plate_no), ...normFuel.map((f) => f.plate_no)]);
    const totalKg = normTickets.reduce((sum, t) => sum + (t.net_kg || 0), 0);
    const totalFuelLiter = normFuel.reduce((sum, f) => sum + (f.qty_liter || 0), 0);

    const dates = [...normTickets.map((t) => t.weigh1_date), ...normFuel.map((f) => f.receipt_date)].filter(Boolean).sort();
    const dateFrom = dates[0] || '';
    const dateTo = dates[dates.length - 1] || '';

    return {
      fileName,
      partnerSuggested,
      summary: {
        ticketCount: normTickets.length,
        totalKg,
        totalTon: Math.round(totalKg / 10) / 100,
        plateCount: platesSet.size,
        plates: [...platesSet].sort(),
        fuelCount: normFuel.length,
        totalFuelLiter: Math.round(totalFuelLiter * 100) / 100,
        dateFrom,
        dateTo
      },
      tickets: normTickets,
      fuelRows: normFuel
    };
  }

  _extractFromObj(data) {
    if (!data) return { tickets: [], fuelRows: [], partner: '' };
    if (Array.isArray(data)) return { tickets: data, fuelRows: [], partner: '' };
    if (data.tables) {
      const tickets = (data.tables.PHIEU_CAN || data.tables.tickets || []).filter((t) => !t.is_deleted);
      const fuelRows = (data.tables.GIAO_NHAN_DAU || data.tables.fuel || []).filter((f) => !f.is_deleted);
      const partner = (data.header && data.header.sourceUnitCode) || '';
      return { tickets, fuelRows, partner };
    }
    const tickets = (data.tickets || data.PHIEU_CAN || []).filter((t) => !t.is_deleted);
    const fuelRows = (data.fuel || data.fuelRows || data.GIAO_NHAN_DAU || []).filter((f) => !f.is_deleted);
    const partner = data.partnerName || data.partner || data.sourceUnit || '';
    return { tickets, fuelRows, partner };
  }

  /**
   * Nạp và lưu đợt thuê vận chuyển vào hệ thống
   */
  async importBatch({ periodId, partnerName, batchName, rentUnitPrice = 0, fuelUnitPrice = 0, deductFuel = true, filePath, jsonContent, user }) {
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

    fs.writeFileSync(storedFilePath, JSON.stringify(batchPayload, null, 2), 'utf8');

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
      filePath: storedFilePath,
      dateFrom: preview.summary.dateFrom,
      dateTo: preview.summary.dateTo,
      summary: preview.summary,
      status: 'IMPORTED',
      createdAt: batchPayload.importedAt,
      createdBy: batchPayload.importedBy
    };

    const batches = this._readBatches();
    batches.unshift(batchMeta);
    this._writeBatches(batches);

    if (this.store && this.store.transaction) {
      await this.store.transaction((tx) => {
        tx.audit('IMPORT_SUBCONTRACT_BATCH', 'SUBCONTRACT_BATCH', batchId, null, {
          periodId: batchMeta.periodId,
          partnerName: batchMeta.partnerName,
          tickets: preview.summary.ticketCount,
          fuel: preview.summary.fuelCount,
          totalTon: preview.summary.totalTon
        });
      }, { user: user ? user.username : 'system' });
    }

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

  deleteBatch({ batchId, user }) {
    if (!batchId) throw new AppError('VALIDATION_FAILED', 'Thiếu batchId');
    const batches = this._readBatches();
    const idx = batches.findIndex((b) => b.batchId === batchId);
    if (idx === -1) throw new AppError('NOT_FOUND', `Không tìm thấy đợt ${batchId}`);

    const [removed] = batches.splice(idx, 1);
    this._writeBatches(batches);

    if (removed.filePath && fs.existsSync(removed.filePath)) {
      try {
        fs.unlinkSync(removed.filePath);
      } catch {
        /* bỏ qua nếu không xóa được file */
      }
    }

    if (this.store && this.store.transaction) {
      this.store.transaction((tx) => {
        tx.audit('DELETE_SUBCONTRACT_BATCH', 'SUBCONTRACT_BATCH', batchId, removed, null);
      }, { user: user ? user.username : 'system' }).catch(() => {});
    }

    return { ok: true, batchId };
  }
}

module.exports = { SubcontractService };
