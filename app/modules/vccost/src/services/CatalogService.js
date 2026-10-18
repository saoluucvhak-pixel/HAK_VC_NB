'use strict';
/**
 * CRUD chung cho mọi danh mục, điều khiển bởi src/models/catalogs.js.
 * - Chỉ ghi các cột khai báo (whitelist), validate bắt buộc, đổi tiền ×1000.
 * - Không xóa bản ghi đang được tham chiếu → yêu cầu chuyển INACTIVE.
 * - Lịch sử xe → đơn vị: thêm dòng mới tự đóng dòng cũ (versioning), chặn chồng lấn.
 * - Bảng giá đã có phiếu dùng: không cho sửa đơn giá/VAT/ngày bắt đầu (BR-PRICE-06).
 * - Mọi thay đổi ghi audit_log.
 */
const { CATALOGS } = require('../models/catalogs');
const { toDb, fromDb } = require('../utils/dbMoney');
const { normalizePlate, displayPlate, isValidPlate } = require('../utils/plate');
const { fold } = require('../excel/columnMapping');
const { derivePrice } = require('./FuelAdjustmentService');

class ValidationError extends Error { constructor(msg) { super(msg); this.name = 'ValidationError'; } }

const REFERENCES = {
  don_vi_van_chuyen: [['xe_don_vi_lich_su', 'don_vi_van_chuyen_id', 'lịch sử xe'], ['phieu_can', 'don_vi_van_chuyen_id', 'phiếu cân'], ['bang_gia_van_chuyen', 'don_vi_van_chuyen_id', 'bảng giá'], ['hop_dong', 'don_vi_van_chuyen_id', 'hợp đồng']],
  xe: [['phieu_can', 'xe_id', 'phiếu cân']],
  dia_diem: [['tuyen_van_chuyen', 'noi_xuat_id', 'tuyến'], ['tuyen_van_chuyen', 'noi_den_id', 'tuyến'], ['phieu_can', 'noi_xuat_id', 'phiếu cân'], ['phieu_can', 'noi_den_id', 'phiếu cân'], ['dot_van_chuyen', 'noi_giao_id', 'đợt']],
  tuyen_van_chuyen: [['bang_gia_van_chuyen', 'tuyen_id', 'bảng giá'], ['phieu_can', 'tuyen_id', 'phiếu cân']],
  dot_van_chuyen: [['phieu_can', 'dot_van_chuyen_id', 'phiếu cân']],
  bang_gia_van_chuyen: [['phieu_can', 'bang_gia_id', 'phiếu cân']],
};

const PRICE_LOCKED_FIELDS = ['tuyen_id', 'don_vi_van_chuyen_id', 'loai_hang', 'tu_ngay', 'don_gia_goc', 'don_gia_dieu_chinh', 'don_gia_ap_dung', 'don_vi_tinh', 'vat_percent',
  'phuong_thuc', 'gia_dau_co_so', 'gia_dau_ap_dung', 'khoang_cach_km', 'dinh_muc_dau', 'khoi_luong_binh_quan'];

const dayBefore = (d) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); };

class CatalogService {
  constructor(db, audit, { onChange = () => {} } = {}) {
    this.db = db; this.audit = audit; this.onChange = onChange;
  }

  cfg(table) {
    const c = CATALOGS[table];
    if (!c) throw new ValidationError(`Danh mục không tồn tại: ${table}`);
    return c;
  }

  // ------------------------------------------------------------ đọc
  _fromRow(table, row) {
    if (!row) return row;
    const c = this.cfg(table);
    for (const f of c.fields) if (f.money && row[f.key] !== undefined) row[f.key] = fromDb(row[f.key]);
    if (table === 'dia_diem_alias') row.alias = row.alias ?? row.alias_folded;
    return row;
  }

  list(table, { parentId = null, search = '', includeInactive = true } = {}) {
    const c = this.cfg(table);
    let sql; const p = [];
    switch (table) {
      case 'xe':
        sql = `SELECT x.*, (SELECT d.ma FROM xe_don_vi_lich_su h JOIN don_vi_van_chuyen d ON d.id=h.don_vi_van_chuyen_id
                 WHERE h.xe_id=x.id AND (h.tu_ngay IS NULL OR h.tu_ngay<=date('now','localtime')) AND (h.den_ngay IS NULL OR h.den_ngay>=date('now','localtime'))
                 ORDER BY h.tu_ngay DESC LIMIT 1) AS don_vi_hien_tai,
                 (SELECT h.don_vi_van_chuyen_id FROM xe_don_vi_lich_su h
                 WHERE h.xe_id=x.id AND (h.tu_ngay IS NULL OR h.tu_ngay<=date('now','localtime')) AND (h.den_ngay IS NULL OR h.den_ngay>=date('now','localtime'))
                 ORDER BY h.tu_ngay DESC LIMIT 1) AS don_vi_van_chuyen_id,
                 (SELECT COUNT(*) FROM phieu_can pc WHERE pc.xe_id=x.id AND pc.trang_thai='ACTIVE') AS so_chuyen
               FROM xe x`; break;
      case 'dia_diem':
        sql = `SELECT d.*, (SELECT group_concat(alias, ' · ') FROM dia_diem_alias a WHERE a.dia_diem_id=d.id) AS aliases FROM dia_diem d`; break;
      case 'dot_van_chuyen':
        sql = `SELECT t.*, (SELECT COUNT(*) FROM phieu_can p WHERE p.dot_van_chuyen_id=t.id AND p.trang_thai='ACTIVE') AS so_phieu FROM dot_van_chuyen t`; break;
      case 'bang_gia_van_chuyen':
        sql = `SELECT t.*, (SELECT COUNT(*) FROM phieu_can p WHERE p.bang_gia_id=t.id AND p.trang_thai='ACTIVE') AS so_phieu FROM bang_gia_van_chuyen t`; break;
      default: sql = `SELECT * FROM ${table} t`;
    }
    const w = [];
    if (c.parent) { w.push(`${c.parentKey} = ?`); p.push(parentId); }
    if (!includeInactive && c.fields.some((f) => f.key === 'trang_thai')) w.push(`trang_thai = 'ACTIVE'`);
    if (search) {
      const textCols = c.fields.filter((f) => f.type === 'text').map((f) => f.key);
      if (textCols.length) { w.push('(' + textCols.map((k) => `${k} LIKE ?`).join(' OR ') + ')'); textCols.forEach(() => p.push(`%${search}%`)); }
    }
    const order = { xe: 'bien_so_chuan', gia_dau: 'ngay DESC', bang_gia_van_chuyen: 'tuyen_id, tu_ngay DESC', xe_don_vi_lich_su: 'tu_ngay', dot_van_chuyen: 'tu_ngay DESC' }[table] || 'id';
    const rows = this.db.all(`SELECT * FROM (${sql}) ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY ${order}`, p);
    return rows.map((r) => this._fromRow(table, r));
  }

  get(table, id) {
    this.cfg(table);
    return this._fromRow(table, this.db.get(`SELECT * FROM ${table} WHERE id = ?`, [id]));
  }

  options(table) {
    const c = this.cfg(table);
    return this.db.all(`SELECT id, ${c.displayField} AS label${c.fields.some((f) => f.key === 'trang_thai') ? ', trang_thai' : ''} FROM ${table} ORDER BY label`);
  }

  // ------------------------------------------------------------ ghi
  _clean(table, data, { partial = false } = {}) {
    const c = this.cfg(table);
    const out = {};
    for (const f of c.fields) {
      if (f.readonly || f.computed || f.virtual) continue; // trường tự tính: bỏ qua giá trị người dùng gửi
      if (!(f.key in data)) { if (!partial && f.default !== undefined) out[f.key] = f.default; continue; }
      let v = data[f.key];
      if (v === '' || v === undefined) v = null;
      if (v !== null && f.type === 'number') {
        const n = Number(String(v).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
        if (!isFinite(n)) throw new ValidationError(`${f.label}: không phải số`);
        v = n;
      }
      if (v !== null && f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ValidationError(`${f.label}: ngày phải dạng YYYY-MM-DD`);
      if (v !== null && f.type === 'select' && f.options && !f.options.includes(v)) throw new ValidationError(`${f.label}: giá trị không hợp lệ`);
      if (v !== null && f.ref) v = Number(v);
      if (typeof v === 'string') v = v.trim();
      out[f.key] = f.money ? toDb(v) : v;
    }
    if (!partial) for (const f of c.fields) if (f.required && (out[f.key] === null || out[f.key] === undefined)) throw new ValidationError(`Thiếu "${f.label}"`);
    if (partial) for (const f of c.fields) if (f.required && f.key in out && out[f.key] === null) throw new ValidationError(`Thiếu "${f.label}"`);
    return out;
  }

  _prepare(table, row, existing) {
    if (table === 'xe' && 'bien_so_hien_thi' in row) {
      if (!isValidPlate(row.bien_so_hien_thi)) throw new ValidationError(`Biển số "${row.bien_so_hien_thi}" không đúng định dạng`);
      row.bien_so_chuan = normalizePlate(row.bien_so_hien_thi);
      row.bien_so_hien_thi = displayPlate(row.bien_so_hien_thi);
      const dup = this.db.get('SELECT id FROM xe WHERE bien_so_chuan = ? AND id <> ?', [row.bien_so_chuan, existing ? existing.id : -1]);
      if (dup) throw new ValidationError(`Xe ${row.bien_so_hien_thi} đã có trong danh mục`);
    }
    if (table === 'dia_diem_alias' && 'alias' in row) {
      row.alias_folded = fold(row.alias);
      const dup = this.db.get('SELECT a.id, d.ten FROM dia_diem_alias a JOIN dia_diem d ON d.id=a.dia_diem_id WHERE alias_folded = ? AND a.id <> ?', [row.alias_folded, existing ? existing.id : -1]);
      if (dup) throw new ValidationError(`Tên gọi "${row.alias}" đã gán cho địa điểm ${dup.ten}`);
    }
    if ((row.tu_ngay && row.den_ngay) && row.tu_ngay > row.den_ngay) throw new ValidationError('Từ ngày phải ≤ Đến ngày');
    if (table === 'tuyen_van_chuyen' && row.noi_xuat_id && row.noi_den_id && row.noi_xuat_id === row.noi_den_id) throw new ValidationError('Nơi xuất và nơi đến phải khác nhau');
    if (table === 'bang_gia_van_chuyen') this._derivePrice(row, existing);
    if (table === 'bang_gia_van_chuyen' && existing) {
      const used = this.db.get('SELECT COUNT(*) n FROM phieu_can WHERE bang_gia_id = ? AND trang_thai = \'ACTIVE\'', [existing.id]).n;
      if (used) {
        const changed = PRICE_LOCKED_FIELDS.filter((k) => k in row && row[k] !== existing[k]);
        if (changed.length) throw new ValidationError(`Bảng giá đang được ${used} phiếu sử dụng — không sửa (${changed.join(', ')}). Hãy tạo bảng giá mới từ ngày áp dụng (bảng cũ sẽ được đóng).`);
        if ('den_ngay' in row && row.den_ngay !== existing.den_ngay) {
          const out = this.db.get('SELECT COUNT(*) n FROM phieu_can WHERE bang_gia_id = ? AND trang_thai=\'ACTIVE\' AND ngay_can > ?', [existing.id, row.den_ngay || '9999-12-31']).n;
          if (out) throw new ValidationError(`Không thể đóng bảng giá trước ngày của ${out} phiếu đang dùng giá này`);
        }
      }
    }
    return row;
  }

  /** Đơn giá áp dụng + điều chỉnh luôn TỰ TÍNH từ thông số (không nhận giá nhập tay). Khi sửa: chỉ tính lại nếu đổi thông số. */
  _derivePrice(row, existing) {
    const PARAMS = ['phuong_thuc', 'don_gia_goc', 'gia_dau_co_so', 'gia_dau_ap_dung', 'khoang_cach_km', 'dinh_muc_dau', 'khoi_luong_binh_quan'];
    if (existing && !PARAMS.some((k) => k in row && row[k] !== existing[k])) return;
    const m = { ...(existing || {}), ...row };
    const mon = (k) => (m[k] === null || m[k] === undefined ? null : fromDb(m[k]));
    const rounding = m.quy_tac_lam_tron_json ? JSON.parse(m.quy_tac_lam_tron_json) : undefined;
    let r;
    try {
      r = derivePrice({ phuong_thuc: m.phuong_thuc || 'CO_DINH', don_gia_goc: mon('don_gia_goc'), gia_dau_co_so: mon('gia_dau_co_so'), gia_dau_ap_dung: mon('gia_dau_ap_dung'),
        khoang_cach_km: m.khoang_cach_km, dinh_muc_dau: m.dinh_muc_dau, khoi_luong_binh_quan: m.khoi_luong_binh_quan, rounding });
    } catch (e) { throw new ValidationError(e.message); }
    row.don_gia_dieu_chinh = toDb(r.adjustment);
    row.don_gia_ap_dung = toDb(r.appliedPrice);
    if (r.breakdown) row.cong_thuc = JSON.stringify(r.breakdown);
  }

  /** Tự đóng phiên bản cũ khi thêm lịch sử xe → đơn vị (versioning). */
  _versionHistory(row, existing) {
    const xeId = row.xe_id ?? existing.xe_id;
    const tu = row.tu_ngay ?? null;
    const den = 'den_ngay' in row ? row.den_ngay : existing ? existing.den_ngay : null;
    const others = this.db.all('SELECT * FROM xe_don_vi_lich_su WHERE xe_id = ? AND id <> ?', [xeId, existing ? existing.id : -1]);
    const closed = [];
    for (const o of others) {
      const oTu = o.tu_ngay || '0000-01-01', oDen = o.den_ngay || '9999-12-31';
      const nTu = tu || '0000-01-01', nDen = den || '9999-12-31';
      if (oDen < nTu || nDen < oTu) continue; // không chồng lấn
      if (!existing && tu && oTu < tu && o.den_ngay === null && nDen === '9999-12-31') {
        // dòng cũ đang mở, dòng mới bắt đầu sau → đóng dòng cũ = ngày trước ngày mới
        this.db.run('UPDATE xe_don_vi_lich_su SET den_ngay = ? WHERE id = ?', [dayBefore(tu), o.id]);
        this.audit.log('CLOSE_VERSION', 'xe_don_vi_lich_su', o.id, { den_ngay: o.den_ngay }, { den_ngay: dayBefore(tu) }, 'Tự đóng khi thêm đơn vị mới');
        closed.push(o.id);
        continue;
      }
      throw new ValidationError(`Khoảng hiệu lực chồng lấn với dòng lịch sử khác (${o.tu_ngay || '…'} → ${o.den_ngay || '…'})`);
    }
    return closed;
  }

  /** Gán đơn vị cho xe ngay trong form Xe: tạo dòng lịch sử nếu khác đơn vị hiện tại (dòng cũ tự đóng). */
  _assignCarrier(xeId, data) {
    const dv = data.don_vi_van_chuyen_id; if (dv === undefined || dv === null || dv === '') return;
    const tu = data.tu_ngay_don_vi || null;
    const cur = this.db.get(`SELECT * FROM xe_don_vi_lich_su WHERE xe_id=? AND den_ngay IS NULL ORDER BY tu_ngay DESC LIMIT 1`, [xeId]);
    if (cur && cur.don_vi_van_chuyen_id === Number(dv)) return;
    if (cur && !tu) throw new ValidationError('Xe đang thuộc đơn vị khác — nhập "Áp dụng từ ngày" để đổi sang đơn vị mới');
    this.create('xe_don_vi_lich_su', { don_vi_van_chuyen_id: dv, tu_ngay: tu }, { parentId: xeId });
  }

  create(table, data, { parentId = null } = {}) {
    const c = this.cfg(table);
    return this.db.tx(() => {
      const row = this._prepare(table, this._clean(table, data));
      if (c.parent) row[c.parentKey] = parentId ?? data[c.parentKey];
      if (c.parent && !row[c.parentKey]) throw new ValidationError('Thiếu bản ghi cha');
      if (table === 'xe_don_vi_lich_su') this._versionHistory(row, null);
      const cols = Object.keys(row);
      let id;
      try {
        id = this.db.run(`INSERT INTO ${table}(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((k) => row[k])).id;
      } catch (e) {
        if (/UNIQUE/i.test(e.message)) throw new ValidationError(`Mã đã tồn tại trong "${c.label}"`);
        throw e;
      }
      this.audit.log('CREATE', table, id, null, row);
      this.onChange(table, { id, row });
      if (table === 'xe') this._assignCarrier(id, data);
      return this.get(table, id);
    });
  }

  update(table, id, data) {
    const c = this.cfg(table);
    return this.db.tx(() => {
      const existing = this.db.get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
      if (!existing) throw new ValidationError('Không tìm thấy bản ghi');
      const row = this._prepare(table, this._clean(table, data, { partial: true }), existing);
      if (table === 'xe_don_vi_lich_su') this._versionHistory(row, existing);
      const cols = Object.keys(row).filter((k) => row[k] !== existing[k]);
      if (table === 'xe') this._assignCarrier(id, data);
      if (!cols.length) return this.get(table, id);
      const hasUpdated = this.db.all(`PRAGMA table_info(${table})`).some((x) => x.name === 'updated_at');
      try {
        this.db.run(`UPDATE ${table} SET ${cols.map((k) => `${k} = ?`).join(', ')}${hasUpdated ? ", updated_at = strftime('%Y-%m-%dT%H:%M:%S','now','localtime')" : ''} WHERE id = ?`, [...cols.map((k) => row[k]), id]);
      } catch (e) {
        if (/UNIQUE/i.test(e.message)) throw new ValidationError(`Mã đã tồn tại trong "${c.label}"`);
        throw e;
      }
      const old = Object.fromEntries(cols.map((k) => [k, existing[k]]));
      const neu = Object.fromEntries(cols.map((k) => [k, row[k]]));
      this.audit.log('UPDATE', table, id, old, neu);
      this.onChange(table, { id, old: existing, row: { ...existing, ...row } });
      return this.get(table, id);
    });
  }

  remove(table, id) {
    const c = this.cfg(table);
    return this.db.tx(() => {
      const existing = this.db.get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
      if (!existing) throw new ValidationError('Không tìm thấy bản ghi');
      for (const [t, col, lbl] of REFERENCES[table] || []) {
        const n = this.db.get(`SELECT COUNT(*) n FROM ${t} WHERE ${col} = ?`, [id]).n;
        if (n) throw new ValidationError(`Không xóa được: đang được dùng bởi ${n} ${lbl}. Hãy chuyển trạng thái INACTIVE.`);
      }
      for (const childTable of c.children || []) {
        const cc = this.cfg(childTable);
        this.db.run(`DELETE FROM ${childTable} WHERE ${cc.parentKey} = ?`, [id]);
      }
      this.db.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
      this.audit.log('DELETE', table, id, existing, null);
      this.onChange(table, { id, old: existing, deleted: true });
      return { ok: true };
    });
  }
}

module.exports = { CatalogService, ValidationError };
