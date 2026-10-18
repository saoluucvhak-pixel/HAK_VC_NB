'use strict';
/**
 * Phát hiện trùng khi import phiếu cân.
 *
 *  business_key  = so_phieu | noi_xuat  (mặc định — số phiếu đánh riêng theo từng trạm cân)
 *  strong_key    = so_phieu | bien_so_chuan | ngay_gio_can_1 | noi_xuat
 *  fingerprint   = SHA-256 của toàn bộ trường dữ liệu đã chuẩn hóa
 *
 * Phân loại:
 *  NEW                 : chưa có business_key
 *  EXACT_DUPLICATE     : có business_key, fingerprint giống hệt → bỏ qua, không tạo dòng mới
 *  KEY_CONFLICT        : có business_key nhưng khác KL / biển số / thời gian / nơi xuất / cân 1 / cân 2
 *                        → đưa vào "Cần kiểm tra" (Giữ cũ / Cập nhật mới / Bỏ qua), KHÔNG tự ghi đè
 *  IN_FILE_DUPLICATE   : trong CÙNG file có 2 dòng cùng business_key
 */
const crypto = require('crypto');
const { normalizePlate } = require('../utils/plate');
const { fold } = require('../excel/columnMapping');

const COMPARE_FIELDS = ['bien_so_chuan', 'ngay_gio_can_1', 'ngay_gio_can_2', 'can_lan_1', 'can_lan_2', 'kl_hang_kg', 'noi_xuat_key'];

function canon(t) {
  return {
    so_phieu: String(t.so_phieu ?? '').trim(),
    bien_so_chuan: normalizePlate(t.bien_so),
    ngay_gio_can_1: t.ngay_gio_can_1 || '',
    ngay_gio_can_2: t.ngay_gio_can_2 || '',
    can_lan_1: t.can_lan_1 == null ? '' : String(Number(t.can_lan_1)),
    can_lan_2: t.can_lan_2 == null ? '' : String(Number(t.can_lan_2)),
    kl_hang_kg: t.kl_hang_kg == null ? '' : String(Number(t.kl_hang_kg)),
    noi_xuat_key: fold(t.noi_xuat ?? '').toUpperCase(), // không dấu: 'Quế Sơn' = 'QUE SON'
  };
}

const businessKey = (t) => { const c = canon(t); return `${c.so_phieu}|${c.noi_xuat_key}`; };
const strongKey = (t) => { const c = canon(t); return `${c.so_phieu}|${c.bien_so_chuan}|${c.ngay_gio_can_1}|${c.noi_xuat_key}`; };
const fingerprint = (t) => crypto.createHash('sha256').update(JSON.stringify(canon(t))).digest('hex');

/**
 * @param {Array} incoming      các dòng đã parse từ file
 * @param {Map<string,object>} existingByKey  business_key → phiếu đã có trong DB (kèm fingerprint)
 */
function classify(incoming, existingByKey) {
  const seen = new Map();
  return incoming.map((row, idx) => {
    const key = businessKey(row);
    const fp = fingerprint(row);
    if (seen.has(key)) { const f = seen.get(key); return { idx, key, fp, status: 'IN_FILE_DUPLICATE', firstIdx: f.idx, differs: f.fp !== fp }; }
    seen.set(key, { idx, fp });
    const old = existingByKey.get(key);
    if (!old) return { idx, key, fp, status: 'NEW' };
    if (old.fingerprint === fp) return { idx, key, fp, status: 'EXACT_DUPLICATE', existingId: old.id };
    const a = canon(old), b = canon(row);
    const diffs = COMPARE_FIELDS.filter((f) => a[f] !== b[f]).map((f) => ({ field: f, old: a[f], new: b[f] }));
    return { idx, key, fp, status: 'KEY_CONFLICT', existingId: old.id, diffs };
  });
}

module.exports = { businessKey, strongKey, fingerprint, classify };
