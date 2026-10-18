'use strict';
/**
 * Chuẩn hóa biển số xe.
 *  - bien_so_goc   : giữ nguyên như dữ liệu nguồn (truy vết)
 *  - bien_so_chuan : chỉ còn chữ HOA + số, bỏ khoảng trắng, '-', '.', '_' ...
 *  - bien_so_hien_thi: dạng đẹp "43H-01021" / "34K-9190"
 * Luôn xử lý như CHUỖI — không bao giờ ép kiểu số (tránh mất số 0 đầu).
 */

// Thứ tự ưu tiên quan trọng: "92H00903" phải ra 92H-00903 (không phải 92H0-0903).
const PATTERNS = [
  /^(\d{2})([A-Z]{1,2})(\d{5})$/,      // 43H-01021 (ô tô biển 5 số)
  /^(\d{2})([A-Z]{1,2}\d)(\d{4,5})$/,  // 29H1-12345 (seri có số)
  /^(\d{2})([A-Z]{1,2})(\d{4})$/,      // 34K-9190 (biển 4 số cũ)
];
const matchPlate = (n) => { for (const p of PATTERNS) { const m = n.match(p); if (m) return m; } return null; };
const VN_PLATE = { test: (n) => matchPlate(n) !== null };

function normalizePlate(raw) {
  if (raw === null || raw === undefined) return '';
  const n = String(raw)
    .normalize('NFKC')            // số/chữ full-width → ASCII
    .toUpperCase()
    .replace(/Đ/g, 'D')
    .replace(/[^A-Z0-9]/g, '');
  // Biển số dân dụng KHÔNG dùng chữ I, O ở seri → nếu có I/O thì là gõ nhầm 1/0 ở vị trí SỐ.
  if (/[OI]/.test(n)) {
    const m = n.match(/^([0-9OI]{2})([A-HJ-NP-Z]{1,2}?)([0-9OI]{4,6})$/);
    if (m) {
      const fix = (x) => x.replace(/O/g, '0').replace(/I/g, '1');
      const f = fix(m[1]) + m[2] + fix(m[3]);
      if (matchPlate(f)) return f;
    }
  }
  return n;
}

function displayPlate(raw) {
  const n = normalizePlate(raw);
  const m = matchPlate(n);
  if (!m) return String(raw ?? '').trim();
  return `${m[1]}${m[2]}-${m[3]}`;
}

function isValidPlate(raw) {
  return VN_PLATE.test(normalizePlate(raw));
}

module.exports = { normalizePlate, displayPlate, isValidPlate };
