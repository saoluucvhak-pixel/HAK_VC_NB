'use strict';
/**
 * Đọc số tiền thành chữ tiếng Việt — văn phong theo file Excel hiện tại (hàm vnd của vnTools):
 * "Một tỷ, hai trăm năm mươi lăm triệu, bảy trăm chín mươi chín ngàn, năm trăm tám mươi mốt đồng …"
 * Quy tắc: "lẻ" cho hàng chục = 0; "mốt" (21, 31…); "lăm" (15, 25…); nhóm giữa luôn đọc đủ "không trăm".
 */
const DIG = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

function readGroup(n, full) {
  const h = Math.floor(n / 100); const t = Math.floor(n / 10) % 10; const u = n % 10;
  const w = [];
  if (full || h) w.push(DIG[h], 'trăm');
  if (t === 0 && u && (full || h)) w.push('lẻ');
  else if (t === 1) w.push('mười');
  else if (t > 1) w.push(DIG[t], 'mươi');
  if (u) w.push(u === 1 && t > 1 ? 'mốt' : (u === 5 && t >= 1 ? 'lăm' : DIG[u]));
  return w;
}

function numberToVietnameseWords(amount, { thousand = 'ngàn', suffix = 'đồng' } = {}) {
  if (!Number.isFinite(amount)) throw new TypeError('Số tiền không hợp lệ');
  let n = Math.round(Math.abs(amount));
  if (!Number.isSafeInteger(n)) throw new RangeError('Số tiền quá lớn');
  const neg = amount < 0 && n !== 0;
  if (n === 0) return `Không ${suffix}`.trim();
  const names = ['', thousand, 'triệu', 'tỷ', `${thousand} tỷ`, 'triệu tỷ'];
  const groups = [];
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
  const parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    const w = readGroup(groups[i], i !== groups.length - 1);
    if (names[i]) w.push(names[i]);
    parts.push(w.join(' '));
  }
  let s = `${neg ? 'âm ' : ''}${parts.join(', ')} ${suffix}`.trim();
  return s[0].toUpperCase() + s.slice(1);
}

module.exports = { numberToVietnameseWords };
