'use strict';
/**
 * Bảng giá & kỳ điều chỉnh giá dầu.
 * - Không sửa bảng giá cũ: tạo phiên bản mới từ ngày X, đóng bảng cũ = X − 1 (BR-PRICE-06).
 * - Kỳ điều chỉnh dầu: bình quân giá dầu trong kỳ tham chiếu → xem trước → duyệt → sinh bảng giá mới cho mọi tuyến
 *   có phương thức DIEU_CHINH_DAU (BR-FUEL-*). Lưu breakdown từng bước vào `cong_thuc`.
 */
const { computeFuelAdjustment, derivePrice } = require('./FuelAdjustmentService');
const { toDb, fromDb } = require('../utils/dbMoney');
const { ValidationError } = require('./CatalogService');

const dayBefore = (d) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); };

class PriceService {
  constructor(db, audit, cost) { this.db = db; this.audit = audit; this.cost = cost; }

  _rule(r) {
    if (!r) return r;
    for (const k of ['don_gia_goc', 'don_gia_dieu_chinh', 'don_gia_ap_dung', 'gia_dau_co_so', 'gia_dau_ap_dung']) r[k] = fromDb(r[k]);
    r.cong_thuc = r.cong_thuc ? JSON.parse(r.cong_thuc) : null;
    return r;
  }

  /** Bảng giá đang hiệu lực của tuyến tại ngày (giá chung, mọi loại hàng). */
  activeRule(tuyenId, date, carrierId = null) {
    return this._rule(this.db.get(`SELECT * FROM bang_gia_van_chuyen WHERE tuyen_id=? AND trang_thai='ACTIVE'
      AND ${carrierId ? 'don_vi_van_chuyen_id = ?' : 'don_vi_van_chuyen_id IS NULL'} AND loai_hang IS NULL
      AND tu_ngay <= ? AND (den_ngay IS NULL OR den_ngay >= ?) ORDER BY tu_ngay DESC LIMIT 1`,
    carrierId ? [tuyenId, carrierId, date, date] : [tuyenId, date, date]));
  }

  /** Đóng bảng giá cũ (nếu mở/chồng) rồi tạo bảng giá mới. Dùng trong transaction của caller. */
  _insertVersion(base, newRule) {
    if (base && (base.den_ngay === null || base.den_ngay >= newRule.tu_ngay)) {
      if (base.tu_ngay >= newRule.tu_ngay) throw new ValidationError(`Bảng giá mới phải bắt đầu sau ${base.tu_ngay} (bảng ${base.ma_bang_gia})`);
      const locked = this.db.get(`SELECT COUNT(*) n FROM phieu_can WHERE bang_gia_id=? AND chot_ky_id IS NOT NULL AND ngay_can >= ?`, [base.id, newRule.tu_ngay]).n;
      if (locked) throw new ValidationError(`${locked} phiếu đã chốt đang dùng giá ${base.ma_bang_gia} sau ngày ${newRule.tu_ngay} — mở khóa kỳ trước`);
      this.db.run('UPDATE bang_gia_van_chuyen SET den_ngay = ? WHERE id = ?', [dayBefore(newRule.tu_ngay), base.id]);
      this.audit.log('CLOSE_PRICE', 'bang_gia_van_chuyen', base.id, { den_ngay: base.den_ngay }, { den_ngay: dayBefore(newRule.tu_ngay) });
    }
    // Bảng giá mới không được chồng lên bảng giá bắt đầu sau nó (cùng tuyến/đơn vị/loại hàng): chặn den_ngay ở ngày liền trước.
    const next = this.db.get(`SELECT * FROM bang_gia_van_chuyen WHERE tuyen_id=? AND trang_thai='ACTIVE' AND IFNULL(don_vi_van_chuyen_id,0)=IFNULL(?,0)
      AND IFNULL(loai_hang,'')=IFNULL(?,'') AND tu_ngay > ? ORDER BY tu_ngay LIMIT 1`, [newRule.tuyen_id, newRule.don_vi_van_chuyen_id ?? null, newRule.loai_hang ?? null, newRule.tu_ngay]);
    if (next && (newRule.den_ngay === null || newRule.den_ngay === undefined || newRule.den_ngay >= next.tu_ngay)) newRule.den_ngay = dayBefore(next.tu_ngay);
    const cols = Object.keys(newRule);
    const id = this.db.run(`INSERT INTO bang_gia_van_chuyen(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((k) => newRule[k])).id;
    this.audit.log('CREATE_PRICE', 'bang_gia_van_chuyen', id, null, newRule);
    return id;
  }

  /** Tạo phiên bản giá cố định mới cho 1 tuyến từ ngày X. */
  /**
   * Tạo phiên bản bảng giá mới từ ngày X. Chỉ nhập THÔNG SỐ; đơn giá áp dụng tự tính (derivePrice).
   * Thông số bỏ trống thì kế thừa từ bảng giá hiện hành (vd đổi km → giá mới tự tính lại).
   * `don_gia` (cũ) = đơn giá gốc.
   */
  createVersion({ tuyen_id, tu_ngay, don_gia, don_gia_goc, vat_percent, don_vi_tinh, ma_bang_gia, ghi_chu, don_vi_van_chuyen_id = null,
    phuong_thuc, gia_dau_co_so, gia_dau_ap_dung, khoang_cach_km, dinh_muc_dau, khoi_luong_binh_quan }) {
    return this.db.tx(() => {
      const base = this.activeRule(tuyen_id, tu_ngay, don_vi_van_chuyen_id) || null;
      const tuyen = this.db.get('SELECT ma_tuyen, khoang_cach_km FROM tuyen_van_chuyen WHERE id=?', [tuyen_id]);
      const pick = (v, d) => (v === undefined || v === null || v === '' ? d : v);
      const p = {
        phuong_thuc: pick(phuong_thuc, base ? base.phuong_thuc : 'CO_DINH'),
        don_gia_goc: pick(pick(don_gia_goc, don_gia), base ? base.don_gia_goc : null),
        gia_dau_co_so: pick(gia_dau_co_so, base ? base.gia_dau_co_so : null),
        gia_dau_ap_dung: pick(gia_dau_ap_dung, base ? base.gia_dau_ap_dung : null),
        khoang_cach_km: pick(khoang_cach_km, base ? base.khoang_cach_km : tuyen.khoang_cach_km),
        dinh_muc_dau: pick(dinh_muc_dau, base?.dinh_muc_dau ?? null),
        khoi_luong_binh_quan: pick(khoi_luong_binh_quan, base?.khoi_luong_binh_quan ?? null),
      };
      let r;
      try { r = derivePrice({ ...p, rounding: base?.quy_tac_lam_tron_json ? JSON.parse(base.quy_tac_lam_tron_json) : undefined }); }
      catch (e) { throw new ValidationError(e.message); }
      const id = this._insertVersion(base, {
        ma_bang_gia: ma_bang_gia || `${tuyen.ma_tuyen}-${tu_ngay}`, tuyen_id, don_vi_van_chuyen_id, tu_ngay, den_ngay: null,
        phuong_thuc: p.phuong_thuc, don_gia_goc: toDb(p.don_gia_goc), don_gia_dieu_chinh: toDb(r.adjustment), don_gia_ap_dung: toDb(r.appliedPrice),
        don_vi_tinh: don_vi_tinh || base?.don_vi_tinh || 'DONG_TAN', vat_percent: vat_percent ?? (base ? base.vat_percent : null),
        gia_dau_co_so: p.gia_dau_co_so === null ? null : toDb(p.gia_dau_co_so), gia_dau_ap_dung: p.gia_dau_ap_dung === null ? null : toDb(p.gia_dau_ap_dung),
        dinh_muc_dau: p.dinh_muc_dau, khoi_luong_binh_quan: p.khoi_luong_binh_quan, khoang_cach_km: p.khoang_cach_km,
        quy_tac_lam_tron_json: base?.quy_tac_lam_tron_json ?? null, cong_thuc: r.breakdown ? JSON.stringify(r.breakdown) : null,
        bang_gia_goc_id: base ? base.id : null, ghi_chu: ghi_chu ?? null, trang_thai: 'ACTIVE',
      });
      if (this.cost) { this.cost.recalc({ tuyenId: tuyen_id }); this.cost.recalc({ unresolved: true }); }
      return id;
    });
  }

  /**
   * BẢNG TÍNH ĐƠN GIÁ VẬN CHUYỂN (như sheet "Giá dầu + Giá VC"): từng tuyến, từng bước I.1…III.1.
   * @param {{ngay:string, gia_dau?:number, dau_tu?:string, dau_den?:string, loai_dau?:string}} o
   *   gia_dau: giá dầu áp dụng giả định; hoặc dau_tu/dau_den: lấy bình quân bảng giá dầu; bỏ trống = giá dầu áp dụng đang lưu ở bảng giá.
   */
  priceSheet({ ngay, gia_dau = null, dau_tu = null, dau_den = null, loai_dau = 'DO 0,05S-II' } = {}) {
    if (!ngay) throw new ValidationError('Cần ngày hiệu lực');
    let dauSo = null, soNgay = null;
    if (gia_dau !== null && gia_dau !== undefined && gia_dau !== '') dauSo = Number(gia_dau);
    else if (dau_tu && dau_den) {
      const ps = this.db.all('SELECT gia FROM gia_dau WHERE loai_dau=? AND ngay BETWEEN ? AND ? ORDER BY ngay', [loai_dau, dau_tu, dau_den]).map((x) => fromDb(x.gia));
      if (!ps.length) throw new ValidationError('Không có giá dầu trong khoảng ngày đã chọn');
      dauSo = ps.reduce((a, b) => a + b, 0) / ps.length; soNgay = ps.length;
    }
    const routes = this.db.all(`SELECT t.*, dx.ten noi_xuat, dd.ten noi_den FROM tuyen_van_chuyen t JOIN dia_diem dx ON dx.id=t.noi_xuat_id JOIN dia_diem dd ON dd.id=t.noi_den_id WHERE t.trang_thai='ACTIVE' ORDER BY t.ma_tuyen`);
    const rows = [];
    for (const t of routes) {
      const r = this.activeRule(t.id, ngay);
      if (!r) { rows.push({ tuyen_id: t.id, ma_tuyen: t.ma_tuyen, noi_xuat: t.noi_xuat, noi_den: t.noi_den, thieu: 'Chưa có bảng giá hiệu lực' }); continue; }
      const row = { tuyen_id: t.id, ma_tuyen: t.ma_tuyen, noi_xuat: t.noi_xuat, noi_den: t.noi_den, bang_gia: r.ma_bang_gia, phuong_thuc: r.phuong_thuc, vat_percent: r.vat_percent,
        don_gia_goc: r.don_gia_goc, gia_hien_hanh: r.don_gia_ap_dung, km: r.khoang_cach_km };
      if (r.phuong_thuc !== 'DIEU_CHINH_DAU') { Object.assign(row, { gia_moi: r.don_gia_goc, dieu_chinh: 0 }); rows.push(row); continue; }
      try {
        const b = computeFuelAdjustment({ basePrice: r.don_gia_goc, baseFuelPrice: r.gia_dau_co_so, currentFuelPrice: dauSo ?? r.gia_dau_ap_dung,
          distanceKm: r.khoang_cach_km ?? t.khoang_cach_km, fuelNormPer100km: r.dinh_muc_dau, avgTonPerTrip: r.khoi_luong_binh_quan,
          rounding: r.quy_tac_lam_tron_json ? JSON.parse(r.quy_tac_lam_tron_json) : undefined });
        Object.assign(row, { gia_dau_co_so: b.baseFuelPrice, gia_dau_ap_dung: b.currentFuelPrice, dinh_muc: b.fuelNormPer100km, tan_bq: b.avgTonPerTrip, km: b.distanceKm,
          lit_chuyen: b.fuelLitPerTrip, chenh_dau: b.fuelDiff, cp_chenh_chuyen: b.costDiffPerTrip, dc_tan_raw: b.adjustmentPerTonRaw, dc_tan: b.adjustmentPerTon, dieu_chinh: b.adjustmentFinal, gia_moi: b.appliedPrice });
      } catch (e) { row.thieu = e.message; }
      rows.push(row);
    }
    return { ngay, gia_dau_ap_dung: dauSo, so_ngay_gia: soNgay, rows };
  }

  /** Áp dụng bảng tính thành phiên bản bảng giá mới từ ngày X cho các tuyến điều chỉnh theo dầu. */
  applySheet({ ngay_ap_dung, gia_dau }) {
    if (!ngay_ap_dung || !(Number(gia_dau) > 0)) throw new ValidationError('Cần ngày áp dụng và giá dầu áp dụng');
    const sh = this.priceSheet({ ngay: dayBefore(ngay_ap_dung), gia_dau });
    const items = sh.rows.filter((r) => r.phuong_thuc === 'DIEU_CHINH_DAU' && !r.thieu);
    if (!items.length) throw new ValidationError('Không có tuyến nào điều chỉnh theo dầu để áp dụng');
    return this.db.tx(() => {
      const ids = items.map((r) => this.createVersion({ tuyen_id: r.tuyen_id, tu_ngay: ngay_ap_dung, gia_dau_ap_dung: Number(gia_dau), ghi_chu: 'Từ bảng tính đơn giá' }));
      return { created: ids.length };
    });
  }

  /**
   * XÓA bảng giá (chỉ khi KHÔNG có phiếu nào dùng). Bảng giá đã có phiếu dùng thì KHÔNG xóa được:
   * hãy tạo phiên bản giá mới từ ngày áp dụng (bảng cũ tự đóng). Nếu bảng này đã đóng bảng liền trước thì mở lại bảng trước.
   */
  removeRule(id, { recalc = false } = {}) {
    return this.db.tx(() => {
      const r = this.db.get('SELECT * FROM bang_gia_van_chuyen WHERE id=?', [id]);
      if (!r) throw new ValidationError('Không tìm thấy bảng giá');
      const used = this.db.get('SELECT COUNT(*) n FROM phieu_can WHERE bang_gia_id=?', [id]).n;
      let freed = [];
      if (used) {
        const locked = this.db.get('SELECT COUNT(*) n FROM phieu_can WHERE bang_gia_id=? AND chot_ky_id IS NOT NULL', [id]).n;
        if (locked) throw new ValidationError(`Không xóa được bảng giá ${r.ma_bang_gia}: ${locked} phiếu đã chốt kỳ đang dùng. Hãy mở lại kỳ đã chốt hoặc tạo bảng giá mới từ ngày áp dụng.`);
        if (!recalc) throw new ValidationError(`Không xóa được bảng giá ${r.ma_bang_gia}: đang có ${used} phiếu sử dụng. Chọn "xóa và tính lại" để gỡ giá khỏi các phiếu rồi tính lại.`);
        freed = this.db.all('SELECT id FROM phieu_can WHERE bang_gia_id=?', [id]).map((x) => x.id);
        this.db.run('UPDATE phieu_can SET bang_gia_id=NULL WHERE bang_gia_id=?', [id]);
      }
      let reopened = null;
      const prev = this.db.get(`SELECT * FROM bang_gia_van_chuyen WHERE tuyen_id=? AND IFNULL(don_vi_van_chuyen_id,0)=IFNULL(?,0) AND IFNULL(loai_hang,'')=IFNULL(?,'')
        AND id<>? AND den_ngay = ? ORDER BY tu_ngay DESC LIMIT 1`, [r.tuyen_id, r.don_vi_van_chuyen_id, r.loai_hang, id, dayBefore(r.tu_ngay)]);
      if (prev) { this.db.run('UPDATE bang_gia_van_chuyen SET den_ngay=? WHERE id=?', [r.den_ngay, prev.id]); reopened = prev.ma_bang_gia; }
      this.db.run('UPDATE bang_gia_van_chuyen SET bang_gia_goc_id=? WHERE bang_gia_goc_id=?', [prev ? prev.id : null, id]);
      this.db.run('DELETE FROM bang_gia_van_chuyen WHERE id=?', [id]);
      this.audit.log('DELETE_PRICE', 'bang_gia_van_chuyen', id, r, null, `Xóa bảng giá ${r.ma_bang_gia}${reopened ? `; mở lại ${reopened}` : ''}`);
      if (freed.length && this.cost) this.cost.recalc({ ids: freed });
      return { ok: true, mo_lai: reopened, tinh_lai: freed.length };
    });
  }

  // ------------------------------------------------------------- KỲ ĐIỀU CHỈNH GIÁ DẦU
  createFuelPeriod({ ma_ky, loai_dau, tu_ngay_tham_chieu, den_ngay_tham_chieu, ngay_ap_dung, so_cong_van, ghi_chu }) {
    const prices = this.db.all('SELECT gia FROM gia_dau WHERE loai_dau=? AND ngay BETWEEN ? AND ? ORDER BY ngay', [loai_dau, tu_ngay_tham_chieu, den_ngay_tham_chieu]);
    if (!prices.length) throw new ValidationError('Không có giá dầu nào trong kỳ tham chiếu');
    const avg = Math.round(prices.reduce((a, p) => a + p.gia, 0) / prices.length); // ×1000 → làm tròn 1/1000 đồng
    const id = this.db.run(`INSERT INTO ky_dieu_chinh_gia_dau(ma_ky, loai_dau, tu_ngay_tham_chieu, den_ngay_tham_chieu, gia_dau_binh_quan, ngay_ap_dung, so_cong_van, ghi_chu)
                            VALUES (?,?,?,?,?,?,?,?)`, [ma_ky, loai_dau, tu_ngay_tham_chieu, den_ngay_tham_chieu, avg, ngay_ap_dung, so_cong_van ?? null, ghi_chu ?? null]).id;
    this.audit.log('CREATE', 'ky_dieu_chinh_gia_dau', id, null, { ma_ky, avg: fromDb(avg), so_ngay: prices.length });
    return id;
  }

  /** Xem trước: mọi tuyến có bảng giá DIEU_CHINH_DAU hiệu lực ngay trước ngày áp dụng. */
  previewFuelPeriod(kyId) {
    const ky = this.db.get('SELECT * FROM ky_dieu_chinh_gia_dau WHERE id=?', [kyId]);
    if (!ky) throw new ValidationError('Không tìm thấy kỳ');
    const prices = this.db.all('SELECT gia FROM gia_dau WHERE loai_dau=? AND ngay BETWEEN ? AND ? ORDER BY ngay', [ky.loai_dau, ky.tu_ngay_tham_chieu, ky.den_ngay_tham_chieu]).map((p) => fromDb(p.gia));
    const before = dayBefore(ky.ngay_ap_dung);
    const routes = this.db.all(`SELECT t.*, dx.ten noi_xuat, dd.ten noi_den FROM tuyen_van_chuyen t JOIN dia_diem dx ON dx.id=t.noi_xuat_id JOIN dia_diem dd ON dd.id=t.noi_den_id WHERE t.trang_thai='ACTIVE' ORDER BY t.ma_tuyen`);
    const items = [];
    for (const t of routes) {
      const generic = this.activeRule(t.id, before) || this.activeRule(t.id, ky.ngay_ap_dung);
      const specific = this.db.all(`SELECT * FROM bang_gia_van_chuyen WHERE tuyen_id=? AND trang_thai='ACTIVE' AND phuong_thuc='DIEU_CHINH_DAU'
        AND (don_vi_van_chuyen_id IS NOT NULL OR loai_hang IS NOT NULL) AND tu_ngay <= ? AND (den_ngay IS NULL OR den_ngay >= ?) ORDER BY id`, [t.id, before, before]).map((x) => this._rule(x));
      for (const base of [generic, ...specific]) {
        const isSpecific = base && (base.don_vi_van_chuyen_id || base.loai_hang);
        const label = isSpecific ? `${t.ma_tuyen} [${[base.don_vi_van_chuyen_id ? this.db.get('SELECT ma FROM don_vi_van_chuyen WHERE id=?', [base.don_vi_van_chuyen_id])?.ma : '', base.loai_hang].filter(Boolean).join('/')}]` : t.ma_tuyen;
        if (!base || base.gia_dau_co_so === null || !(base.dinh_muc_dau && base.khoi_luong_binh_quan && (base.khoang_cach_km || t.khoang_cach_km))) {
          items.push({ tuyen_id: t.id, ma_tuyen: label, skip: base ? 'Bảng giá không đủ tham số dầu (giá dầu cơ sở, định mức, tấn BQ, km)' : 'Chưa có bảng giá' });
          continue;
        }
        const b = computeFuelAdjustment({
          basePrice: base.don_gia_goc, baseFuelPrice: base.gia_dau_co_so, fuelPrices: prices,
          distanceKm: base.khoang_cach_km || t.khoang_cach_km, fuelNormPer100km: base.dinh_muc_dau, avgTonPerTrip: base.khoi_luong_binh_quan,
          rounding: base.quy_tac_lam_tron_json ? JSON.parse(base.quy_tac_lam_tron_json) : undefined,
        });
        items.push({ tuyen_id: t.id, ma_tuyen: label, ma_tuyen_goc: t.ma_tuyen, noi_xuat: t.noi_xuat, noi_den: t.noi_den, base_rule_id: base.id, base_ma: base.ma_bang_gia,
          gia_cu: base.don_gia_ap_dung, gia_moi: b.appliedPrice, vat_percent: base.vat_percent, breakdown: b });
      }
    }
    return { ky: { ...ky, gia_dau_binh_quan: fromDb(ky.gia_dau_binh_quan) }, so_ngay_gia: prices.length, items };
  }

  approveFuelPeriod(kyId) {
    return this.db.tx(() => {
      const pv = this.previewFuelPeriod(kyId);
      if (pv.ky.trang_thai !== 'NHAP') throw new ValidationError('Kỳ đã duyệt/hủy');
      const created = [];
      for (const it of pv.items.filter((i) => !i.skip)) {
        const base = this._rule(this.db.get('SELECT * FROM bang_gia_van_chuyen WHERE id=?', [it.base_rule_id]));
        const id = this._insertVersion(base, {
          ma_bang_gia: `${base.don_vi_van_chuyen_id || base.loai_hang ? `${it.ma_tuyen_goc}-${base.id}` : it.ma_tuyen_goc}-${pv.ky.ngay_ap_dung}`, tuyen_id: it.tuyen_id, don_vi_van_chuyen_id: base.don_vi_van_chuyen_id, loai_hang: base.loai_hang,
          tu_ngay: pv.ky.ngay_ap_dung, den_ngay: null, phuong_thuc: 'DIEU_CHINH_DAU',
          don_gia_goc: toDb(base.don_gia_goc), don_gia_dieu_chinh: toDb(it.breakdown.adjustmentFinal), don_gia_ap_dung: toDb(it.gia_moi),
          don_vi_tinh: base.don_vi_tinh, vat_percent: base.vat_percent, gia_dau_co_so: toDb(base.gia_dau_co_so), gia_dau_ap_dung: toDb(it.breakdown.currentFuelPrice),
          dinh_muc_dau: base.dinh_muc_dau, khoi_luong_binh_quan: base.khoi_luong_binh_quan, khoang_cach_km: it.breakdown.distanceKm,
          quy_tac_lam_tron_json: base.quy_tac_lam_tron_json, cong_thuc: JSON.stringify(it.breakdown), ky_dieu_chinh_id: kyId,
          bang_gia_goc_id: base.id, trang_thai: 'ACTIVE', ghi_chu: `Điều chỉnh theo giá dầu kỳ ${pv.ky.ma_ky}`,
        });
        created.push(id);
      }
      this.db.run(`UPDATE ky_dieu_chinh_gia_dau SET trang_thai='DA_DUYET' WHERE id=?`, [kyId]);
      this.audit.log('APPROVE', 'ky_dieu_chinh_gia_dau', kyId, null, { bang_gia_moi: created });
      if (this.cost) this.cost.recalc({ all: true });
      return { created };
    });
  }

  /** Xóa kỳ điều chỉnh NHÁP (kỳ đã duyệt đã sinh bảng giá → không xóa). */
  /** Xóa kỳ điều chỉnh: kỳ nháp xóa thẳng; kỳ đã duyệt chỉ xóa được khi chưa phiếu nào dùng các bảng giá do kỳ sinh ra (các bảng giá đó bị gỡ, bảng cũ mở lại). */
  removeFuelPeriod(id, { recalc = false } = {}) {
    return this.db.tx(() => {
      const k = this.db.get('SELECT * FROM ky_dieu_chinh_gia_dau WHERE id=?', [id]);
      if (!k) throw new ValidationError('Không tìm thấy kỳ');
      const rules = this.db.all('SELECT * FROM bang_gia_van_chuyen WHERE ky_dieu_chinh_id=?', [id]);
      const used = rules.reduce((a, r) => a + this.db.get('SELECT COUNT(*) n FROM phieu_can WHERE bang_gia_id=?', [r.id]).n, 0);
      if (used && !recalc) throw new ValidationError(`Không xóa được kỳ ${k.ma_ky}: ${used} phiếu đang dùng bảng giá do kỳ này sinh ra. Chọn "xóa và tính lại" để gỡ giá rồi tính lại các phiếu.`);
      for (const r of rules.sort((x, y) => y.tu_ngay.localeCompare(x.tu_ngay))) this.removeRule(r.id, { recalc });
      this.db.run('DELETE FROM ky_dieu_chinh_gia_dau WHERE id=?', [id]);
      this.audit.log('DELETE', 'ky_dieu_chinh_gia_dau', id, k, null, `Xóa kỳ ${k.ma_ky}${rules.length ? `; gỡ ${rules.length} bảng giá` : ''}`);
      return { ok: true, go_bang_gia: rules.length };
    });
  }

  listFuelPeriods() {
    return this.db.all('SELECT * FROM ky_dieu_chinh_gia_dau ORDER BY ngay_ap_dung DESC').map((k) => ({ ...k, gia_dau_binh_quan: fromDb(k.gia_dau_binh_quan) }));
  }

  /** "Tại sao phiếu này có giá này?" */
  explainTicket(ticketId) {
    const t = this.db.get('SELECT * FROM phieu_can WHERE id=?', [ticketId]);
    if (!t) throw new ValidationError('Không tìm thấy phiếu');
    const rule = t.bang_gia_id ? this._rule(this.db.get('SELECT * FROM bang_gia_van_chuyen WHERE id=?', [t.bang_gia_id])) : null;
    const ky = rule && rule.ky_dieu_chinh_id ? this.db.get('SELECT * FROM ky_dieu_chinh_gia_dau WHERE id=?', [rule.ky_dieu_chinh_id]) : null;
    return { ticket: { ...t, don_gia: fromDb(t.don_gia), tien_truoc_vat: fromDb(t.tien_truoc_vat), tien_vat: fromDb(t.tien_vat), tong_tien: fromDb(t.tong_tien) }, rule, ky: ky && { ...ky, gia_dau_binh_quan: fromDb(ky.gia_dau_binh_quan) } };
  }
}

module.exports = { PriceService };
