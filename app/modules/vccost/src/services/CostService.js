'use strict';
/**
 * Tính & lưu chi phí phiếu cân vào DB — bọc TransportCostEngine (engine là nơi DUY NHẤT tính tiền).
 * - Chỉ phiếu ACTIVE và CHƯA CHỐT được tính lại.
 * - Tự phân giải lại nơi xuất (alias) và xe (danh mục) mỗi lần tính → thêm xe/alias xong chỉ cần tính lại.
 * - Đồng bộ cảnh báo (engine + thời gian) cho các phiếu vừa tính.
 */
const { computeTicket } = require('./TransportCostEngine');
const { VehicleResolver } = require('./VehicleResolver');
const { buildTimeline } = require('./TimeAnomalyService');
const { toDb, fromDb } = require('../utils/dbMoney');
const { fold } = require('../excel/columnMapping');

class CostService {
  constructor(db, alerts, settings) { this.db = db; this.alerts = alerts; this.settings = settings; }

  loadContext() {
    const db = this.db;
    const xe = db.all('SELECT id, bien_so_chuan FROM xe');
    const hist = db.all(`SELECT x.bien_so_chuan, h.don_vi_van_chuyen_id, h.tu_ngay, h.den_ngay
                         FROM xe_don_vi_lich_su h JOIN xe x ON x.id = h.xe_id`);
    const routes = db.all(`SELECT id, noi_xuat_id, noi_den_id FROM tuyen_van_chuyen WHERE trang_thai='ACTIVE'`);
    const routeMap = new Map(routes.map((r) => [`${r.noi_xuat_id}|${r.noi_den_id}`, r.id]));
    const rules = db.all(`SELECT * FROM bang_gia_van_chuyen WHERE trang_thai='ACTIVE'`)
      .map((r) => ({ ...r, don_gia_ap_dung: fromDb(r.don_gia_ap_dung) }));
    const alias = new Map(db.all('SELECT alias_folded, dia_diem_id FROM dia_diem_alias').map((a) => [a.alias_folded, a.dia_diem_id]));
    for (const d of db.all('SELECT id, ma, ten FROM dia_diem')) { if (!alias.has(fold(d.ma))) alias.set(fold(d.ma), d.id); if (!alias.has(fold(d.ten))) alias.set(fold(d.ten), d.id); }
    const locName = new Map(db.all('SELECT id, ten FROM dia_diem').map((d) => [d.id, d.ten]));
    return {
      xeId: new Map(xe.map((x) => [x.bien_so_chuan, x.id])),
      alias, locName,
      ctx: {
        vehicleResolver: new VehicleResolver(hist, xe.map((x) => x.bien_so_chuan)),
        routeResolver: (nx, nd) => {
          if (!nx || !nd) return { status: 'UNKNOWN_LOCATION', routeId: null };
          const id = routeMap.get(`${nx}|${nd}`);
          return id ? { status: 'OK', routeId: id } : { status: 'UNKNOWN_ROUTE', routeId: null };
        },
        priceRules: rules,
        settings: { roundingLevel: 'TICKET', rounding: { amount: null, vat: null, total: null } }, // giá trị từng phiếu: không làm tròn (bảng kê làm tròn)
      },
    };
  }

  /**
   * Tính lại phiếu theo bộ lọc. filter: {ids, xeId, bienSoChuan, tuyenId, batchId, unresolved, all}
   * @returns {{count, changedPrice}}
   */
  recalc(filter = { all: true }) {
    const w = [`p.trang_thai='ACTIVE'`, 'p.chot_ky_id IS NULL'];
    const params = [];
    if (filter.ids) { w.push(`p.id IN (${filter.ids.map(() => '?').join(',') || 'NULL'})`); params.push(...filter.ids); }
    if (filter.bienSoChuan) { w.push('p.bien_so_chuan = ?'); params.push(filter.bienSoChuan); }
    if (filter.xeId) { w.push('(p.xe_id = ? OR p.bien_so_chuan = (SELECT bien_so_chuan FROM xe WHERE id = ?))'); params.push(filter.xeId, filter.xeId); }
    if (filter.tuyenId) { w.push('p.tuyen_id = ?'); params.push(filter.tuyenId); }
    if (filter.batchId) { w.push('p.import_batch_id = ?'); params.push(filter.batchId); }
    if (filter.unresolved) w.push(`p.trang_thai_tinh_gia <> 'OK'`);
    const tickets = this.db.all(`SELECT p.* FROM phieu_can p WHERE ${w.join(' AND ')}`, params);
    if (!tickets.length) return { count: 0, changedPrice: 0 };
    const { ctx, xeId, alias, locName } = this.loadContext();
    let changedPrice = 0;
    this.db.tx(() => {
      for (const t of tickets) {
        const nx = t.noi_xuat_id || alias.get(fold(t.noi_xuat_goc)) || null;
        const r = computeTicket({ ...t, noi_xuat_id: nx, noi_den_id: t.noi_den_id }, ctx);
        const newGia = toDb(r.don_gia);
        if (t.don_gia !== null && newGia !== null && t.don_gia !== newGia) {
          changedPrice++;
          this.alerts.open('PRICE_CHANGED', 'phieu_can', t.id, { cu: fromDb(t.don_gia), moi: r.don_gia }, `Đơn giá đổi ${fromDb(t.don_gia)} → ${r.don_gia}`);
        }
        this.db.run(`UPDATE phieu_can SET xe_id=?, noi_xuat_id=?, noi_xuat=?, noi_den=?, tuyen_id=?, don_vi_van_chuyen_id=?, bang_gia_id=?,
                       don_vi_tinh=?, don_gia=?, tien_truoc_vat=?, ty_le_vat=?, tien_vat=?, tong_tien=?, trang_thai_tinh_gia=?,
                       updated_at=strftime('%Y-%m-%dT%H:%M:%S','now','localtime') WHERE id=?`,
        [xeId.get(t.bien_so_chuan) || null, nx, nx ? locName.get(nx) : null, t.noi_den_id ? locName.get(t.noi_den_id) : null,
          r.tuyen_id, r.don_vi_van_chuyen_id, r.price_rule_id, r.don_vi_tinh, newGia, toDb(r.tien_truoc_vat), r.vat_percent,
          toDb(r.tien_vat), toDb(r.tong_tien), r.status, t.id]);
        this.alerts.syncTicket(t.id, r.warnings, { so_phieu: t.so_phieu, bien_so: t.bien_so, noi_xuat: t.noi_xuat_goc });
      }
      this.syncTimeAlerts([...new Set(tickets.map((t) => t.bien_so_chuan))]);
    });
    return { count: tickets.length, changedPrice };
  }

  /** Cảnh báo thời gian theo timeline từng xe (cần toàn bộ chuyến của xe, kể cả đã chốt). */
  syncTimeAlerts(plates) {
    const th = this.settings.get('time_anomaly');
    for (const bs of plates) {
      const list = this.db.all(`SELECT id, so_phieu, bien_so, ngay_gio_can_1, ngay_gio_can_2, can_lan_1, can_lan_2 FROM phieu_can
                                WHERE bien_so_chuan = ? AND trang_thai='ACTIVE'`, [bs]);
      for (const t of buildTimeline(list, th)) this.alerts.syncTimeFlags(t.id, t.flags, { so_phieu: t.so_phieu, bien_so: t.bien_so });
    }
  }
}

module.exports = { CostService };
