'use strict';
/**
 * Định nghĩa cột import + tự dò dòng tiêu đề + tự ghép cột + chuyển đổi giá trị ô.
 * Tên cột so khớp sau khi chuẩn hóa: chữ thường, gộp khoảng trắng / xuống dòng ("Số\n phiếu" = "số phiếu"), bỏ dấu (dự phòng).
 */
const FIELDS = {
  PHIEU_CAN: [
    { key: 'row_no', aliases: ['stt', 'số thứ tự'] },
    { key: 'ticket_no', required: true, aliases: ['số phiếu', 'so phieu', 'số phiếu cân'] },
    { key: 'weigh1_date', required: true, aliases: ['ngày cân 1', 'ngày cân lần 1'] },
    { key: 'weigh1_time', aliases: ['giờ cân 1', 'giờ cân lần 1'] },
    { key: 'weigh2_date', required: true, aliases: ['ngày cân 2', 'ngày cân lần 2'] },
    { key: 'weigh2_time', aliases: ['giờ cân 2', 'giờ cân lần 2'] },
    { key: 'plate_no', required: true, aliases: ['biển số 1', 'biển số', 'biển số xe', 'bsx'] },
    { key: 'weight1_kg', aliases: ['cân lần 1', 'trọng lượng lần 1'] },
    { key: 'weight2_kg', aliases: ['cân lần 2', 'trọng lượng lần 2'] },
    { key: 'net_kg', required: true, aliases: ['kl hàng (kg)', 'kl hàng', 'khối lượng hàng (kg)', 'khối lượng (kg)'] },
    { key: 'origin', aliases: ['nguồn gốc'] },
    { key: 'customer', aliases: ['khách hàng'] },
    { key: 'ldd', aliases: ['ldđ', 'lđđ', 'ldd', 'lệnh điều động'] },
    { key: 'weigh_type', aliases: ['kiểu cân'] },
    { key: 'route_code', required: true, aliases: ['mã cự ly vc', 'mã tuyến', 'mã cự ly'] },
    { key: 'transport_unit_name', aliases: ['đơn vị vc', 'cty vc', 'đơn vị vận chuyển'] },
  ],
  GIAO_NHAN_DAU: [
    { key: 'receive_date', required: true, aliases: ['ngày nhận dầu', 'ngày nhận'] },
    { key: 'route_code', required: true, aliases: ['mã cự ly vc', 'mã tuyến'] },
    { key: 'fuel_vehicle_code', required: true, aliases: ['biển số xe', 'biển số', 'mã xe'] },
    { key: 'uom', aliases: ['đvt', 'đơn vị tính'] },
    { key: 'qty_liter', required: true, aliases: ['số lượng (lít)', 'số lượng', 'số lít'] },
    { key: 'fuel_price_excl_vat', required: true, aliases: ['đơn giá dầu', 'đơn giá', 'đơn giá dầu (chưa vat)'] },
    { key: 'purchase_date', aliases: ['ngày mua dầu', 'ngày mua'] },
    { key: 'giver_unit_code', required: true, aliases: ['đơn vị', 'bên giao', 'đơn vị giao'] },
    { key: 'fuel_depot', aliases: ['kho nhận dầu', 'kho nhận', 'kho dầu', 'kho', 'cây xăng', 'nơi nhận dầu', 'cửa hàng xăng dầu'] },
  ],
};

// dấu * đánh dấu cột bắt buộc trong file mẫu ("Số phiếu *") được bỏ khi so khớp
const normHeader = (s) => String(s ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim().replace(/\s*\(?\*\)?$/, '').trim();
const unaccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

function matchField(fields, header) {
  const h = normHeader(header); if (!h) return null;
  for (const f of fields) if (f.aliases.some((a) => normHeader(a) === h)) return f.key;
  const hu = unaccent(h);
  for (const f of fields) if (f.aliases.some((a) => unaccent(normHeader(a)) === hu)) return f.key;
  return null;
}

/** Dò dòng tiêu đề trong 15 dòng đầu: dòng khớp nhiều tên cột nhất (bỏ dòng tiêu đề bảng gộp ô). */
function detectHeaderRow(rows, importType) {
  const fields = FIELDS[importType]; let best = { row: -1, score: 0 };
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const keys = new Set((rows[i] || []).map((h) => matchField(fields, h)).filter(Boolean));
    if (keys.size > best.score) best = { row: i, score: keys.size };
  }
  return best.row;
}

/** Gợi ý ghép cột: { tênCộtGốc: key } + danh sách key bắt buộc còn thiếu. */
function suggestMapping(headers, importType) {
  const fields = FIELDS[importType]; const mapping = {}; const used = new Set();
  headers.forEach((h) => { const k = matchField(fields, h); if (k && !used.has(k)) { mapping[String(h)] = k; used.add(k); } });
  return mapping;
}
function missingRequired(mapping, importType) {
  const got = new Set(Object.values(mapping));
  return FIELDS[importType].filter((f) => f.required && !got.has(f.key)).map((f) => f.key);
}

// ───────────── chuyển đổi giá trị ô ─────────────
const pad = (n) => String(n).padStart(2, '0');
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
function toDate(v) {
  if (v === null || v === undefined || v === '') return { value: '' };
  if (typeof v === 'object' && v.__date) return { value: v.__date };
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(EXCEL_EPOCH + Math.floor(v) * 86400000); return { value: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` }; }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);            // dd/MM/yyyy (Việt Nam)
  if (m) return checkYmd(+m[3], +m[2], +m[1], s);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/);               // yyyy-MM-dd
  if (m) return checkYmd(+m[1], +m[2], +m[3], s);
  return { error: `ngày không đọc được "${s}"` };
}
function checkYmd(y, mo, d, raw) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return { error: `ngày không hợp lệ "${raw}"` };
  return { value: `${y}-${pad(mo)}-${pad(d)}` };
}
function toTime(v) {
  if (v === null || v === undefined || v === '') return { value: '' };
  if (typeof v === 'object' && v.__time) return { value: v.__time };
  if (typeof v === 'number' && v >= 0 && v < 1) { const s = Math.round(v * 86400); return { value: `${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` }; }
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m && +m[1] < 24 && +m[2] < 60 && +(m[3] || 0) < 60) return { value: `${pad(+m[1])}:${m[2]}:${pad(+(m[3] || 0))}` };
  return { error: `giờ không đọc được "${v}"` };
}
function toNumber(v) {
  if (v === null || v === undefined || v === '') return { value: '' };
  if (typeof v === 'number') return Number.isFinite(v) ? { value: v } : { error: 'số không hợp lệ' };
  let s = String(v).trim().replace(/\s/g, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');   // 17.470 hoặc 1.234,5 (kiểu VN)
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');                               // 5088,35
  else s = s.replace(/,/g, '');                                                          // 17,470 (kiểu Anh)
  const n = Number(s);
  return Number.isFinite(n) && s !== '' ? { value: n } : { error: `số không đọc được "${v}"` };
}
function toText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v.__date) return v.__date;
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).trim();
}
const plateKey = (s) => String(s || '').trim().toUpperCase().replace(/^[A-Z]{2}_/, '').replace(/[^0-9A-Z]/g, '');

module.exports = { FIELDS, normHeader, matchField, detectHeaderRow, suggestMapping, missingRequired, toDate, toTime, toNumber, toText, plateKey };
