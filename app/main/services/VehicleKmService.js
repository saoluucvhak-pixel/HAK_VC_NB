'use strict';
/**
 * VehicleKmService — CHỐT ĐỒNG HỒ KM của xe (API vehicleKm.list / vehicleKm.save). Không cần nhập hằng ngày:
 * chỉ cần chốt ở vài thời điểm (vd đầu năm, cuối năm, cuối tháng). Giữa 2 lần chốt liền nhau:
 *   km đồng hồ = số sau − số trước;  km theo tuyến = Σ cự ly chuyến (đi + về) của các chuyến trong khoảng đó;
 *   chênh lệch = km đồng hồ − km theo tuyến (chạy rỗng, đi sửa xe, đường vòng…).
 * Lúc chốt: DAU_NGAY = trước các chuyến trong ngày (vd sáng 01/01); CUOI_NGAY = sau các chuyến trong ngày (vd tối 31/12).
 * → khoảng giữa lần chốt A và B gồm các ngày từ (A đầu ngày ? ngày A : ngày A + 1) đến (B cuối ngày ? ngày B : ngày B − 1).
 */
const { AppError } = require('../../shared/errors');

const AT = { DAU_NGAY: 'đầu ngày', CUOI_NGAY: 'cuối ngày' };
const isBlank = (v) => v === '' || v === null || v === undefined;
const num = (v) => (isBlank(v) ? null : Number(typeof v === 'string' ? v.trim().replace(/\s/g, '') : v));
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
const fmt = (n) => Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
/** số đồng hồ của dòng (bản 1.2.1 lưu ở odo_end / odo_start) */
const odoOf = (r) => (!isBlank(r.odometer) ? Number(r.odometer) : !isBlank(r.odo_end) ? Number(r.odo_end) : !isBlank(r.odo_start) ? Number(r.odo_start) : null);
const atOf = (r) => (r.read_at === 'DAU_NGAY' || r.read_at === 'CUOI_NGAY' ? r.read_at : (!isBlank(r.odometer) || !isBlank(r.odo_end) ? 'CUOI_NGAY' : 'DAU_NGAY'));
/** mốc thời gian để sắp xếp: đầu ngày D = D, cuối ngày D = D + 1 */
const pointOf = (r) => (atOf(r) === 'DAU_NGAY' ? r.km_date : addDays(r.km_date, 1));

class VehicleKmService {
  constructor(store) { this.store = store; }

  readings(plateNo) {
    return this.store.find('XE_KM', (r) => r.plate_no === plateNo && odoOf(r) !== null)
      .map((r) => ({ id: r.km_id, date: r.km_date, odometer: odoOf(r), readAt: atOf(r), readAtText: AT[atOf(r)], point: pointOf(r), note: r.note || '' }))
      .sort((a, b) => a.point.localeCompare(b.point) || a.date.localeCompare(b.date));
  }

  /**
   * Các khoảng giữa 2 lần chốt liền nhau (mốc nằm trong [dateFrom, dateTo + 1]); routeKmOf(from, to) và fuelOf(from, to) do báo cáo truyền vào.
   */
  segments(plateNo, { dateFrom = '', dateTo = '', routeKmOf = () => 0, fuelOf = () => 0, tripsOf = () => 0 } = {}) {
    const all = this.readings(plateNo);
    const inP = all.filter((r) => (!dateFrom || r.point >= dateFrom) && (!dateTo || r.point <= addDays(dateTo, 1)));
    const seg = [];
    for (let i = 1; i < inP.length; i++) {
      const a = inP[i - 1]; const b = inP[i];
      const from = a.point; const to = addDays(b.point, -1); // các ngày thuộc khoảng
      const odoKm = Math.round((b.odometer - a.odometer) * 10) / 10;
      const routeKm = from <= to ? routeKmOf(from, to) : 0; const fuel = from <= to ? fuelOf(from, to) : 0;
      seg.push({ from, to, fromText: `${dmy(a.date)} ${a.readAtText}`, toText: `${dmy(b.date)} ${b.readAtText}`, odoStart: a.odometer, odoEnd: b.odometer, odoKm,
        trips: from <= to ? tripsOf(from, to) : 0, routeKm, diffKm: Math.round((odoKm - routeKm) * 10) / 10, diffPct: routeKm ? Math.round((odoKm - routeKm) / routeKm * 1000) / 10 : null,
        fuel: Math.round(fuel * 100) / 100, per100: odoKm > 0 ? Math.round(fuel / odoKm * 10000) / 100 : null, warn: odoKm < 0 ? 'Đồng hồ giảm — kiểm tra số chốt (thay đồng hồ?)' : '' });
    }
    const total = seg.length ? {
      fromText: seg[0].fromText, toText: seg[seg.length - 1].toText, from: seg[0].from, to: seg[seg.length - 1].to,
      odoStart: seg[0].odoStart, odoEnd: seg[seg.length - 1].odoEnd,
      odoKm: Math.round(seg.reduce((x, s) => x + s.odoKm, 0) * 10) / 10, routeKm: seg.reduce((x, s) => x + s.routeKm, 0), trips: seg.reduce((x, s) => x + s.trips, 0),
      fuel: Math.round(seg.reduce((x, s) => x + s.fuel, 0) * 100) / 100,
    } : null;
    if (total) { total.diffKm = Math.round((total.odoKm - total.routeKm) * 10) / 10; total.diffPct = total.routeKm ? Math.round(total.diffKm / total.routeKm * 1000) / 10 : null; total.per100 = total.odoKm > 0 ? Math.round(total.fuel / total.odoKm * 10000) / 100 : null; }
    return { readings: inP, segments: seg, total };
  }

  list({ plateNo } = {}) {
    if (!plateNo) throw new AppError('VALIDATION_FAILED', 'Chọn xe');
    const items = this.readings(plateNo);
    return { plateNo, items, warnings: this._warn(items) };
  }

  _warn(items) {
    const out = [];
    for (let i = 1; i < items.length; i++) if (items[i].odometer < items[i - 1].odometer) out.push({ date: items[i].date, message: `Chốt ${dmy(items[i].date)}: đồng hồ ${fmt(items[i].odometer)} nhỏ hơn lần chốt trước (${dmy(items[i - 1].date)}: ${fmt(items[i - 1].odometer)}) — kiểm tra lại` });
    return out;
  }

  /** Lưu các lần chốt của 1 xe. rows: [{date, odometer, readAt, note}] — số đồng hồ để trống = xóa lần chốt ngày đó. */
  async save({ plateNo, rows = [], user }) {
    const s = this.store;
    if (!plateNo || !s.get('XE', plateNo)) throw new AppError('VALIDATION_FAILED', `Không có xe ${plateNo || ''}`);
    const errs = []; const plan = [];
    const byDate = new Map(s.find('XE_KM', (r) => r.plate_no === plateNo).map((r) => [r.km_date, r]));
    const seen = new Set();
    for (const x of rows) {
      const d = String(x.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { errs.push(`Ngày chốt không hợp lệ: ${x.date || '(trống)'}`); continue; }
      if (seen.has(d)) { errs.push(`${dmy(d)}: trùng ngày chốt`); continue; } seen.add(d);
      const o = num(x.odometer); const old = byDate.get(d); const note = String(x.note || '').trim();
      const at = x.readAt === 'DAU_NGAY' ? 'DAU_NGAY' : 'CUOI_NGAY';
      if (o === null) { if (old) plan.push({ act: 'DEL', old }); continue; }
      if (!(Number.isFinite(o) && o >= 0)) { errs.push(`${dmy(d)}: số đồng hồ không hợp lệ (${x.odometer})`); continue; }
      const rec = { odometer: o, read_at: at, note, odo_start: '', odo_end: '', km: '' };
      if (!old) plan.push({ act: 'NEW', rec: { plate_no: plateNo, km_date: d, ...rec } });
      else if (odoOf(old) !== o || atOf(old) !== at || (old.note || '') !== note || !isBlank(old.odo_end) || !isBlank(old.km)) plan.push({ act: 'UPD', old, rec });
    }
    if (errs.length) throw new AppError('VALIDATION_FAILED', errs.slice(0, 5).join('; '), { errors: errs });
    const out = { added: 0, updated: 0, deleted: 0 };
    if (plan.length) {
      await s.transaction((tx) => {
        for (const p of plan) {
          if (p.act === 'NEW') { const r = tx.insert('XE_KM', { km_id: tx.nextId('KM', 6), ...p.rec }); tx.audit('CREATE', 'XE_KM', r.km_id, null, { km_date: p.rec.km_date, odometer: p.rec.odometer, read_at: p.rec.read_at }); out.added++; }
          else if (p.act === 'UPD') { tx.update('XE_KM', p.old.km_id, p.rec); tx.audit('UPDATE', 'XE_KM', p.old.km_id, { odometer: odoOf(p.old), read_at: atOf(p.old) }, { odometer: p.rec.odometer, read_at: p.rec.read_at }); out.updated++; }
          else { tx.remove('XE_KM', p.old.km_id); tx.audit('DELETE', 'XE_KM', p.old.km_id, { km_date: p.old.km_date, odometer: odoOf(p.old) }, null); out.deleted++; }
        }
      }, { user: user.username });
    }
    return { ...out, warnings: this._warn(this.readings(plateNo)) };
  }
}

module.exports = { VehicleKmService, odoOf, atOf, addDays };
