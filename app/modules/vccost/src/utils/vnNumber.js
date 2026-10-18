'use strict';
/** Số tiền → chữ tiếng Việt: 1234567 → "Một triệu hai trăm ba mươi bốn nghìn năm trăm sáu mươi bảy đồng." */
const D = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const UNIT = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

function readTriple(n, full) {
  const tr = Math.floor(n / 100), ch = Math.floor((n % 100) / 10), dv = n % 10;
  const out = [];
  if (tr > 0 || full) out.push(`${D[tr]} trăm`);
  if (ch > 1) out.push(`${D[ch]} mươi`);
  else if (ch === 1) out.push('mười');
  else if ((tr > 0 || full) && dv > 0) out.push('lẻ');
  if (dv > 0) {
    if (ch > 1 && dv === 1) out.push('mốt');
    else if (ch >= 1 && dv === 5) out.push('lăm');
    else out.push(D[dv]);
  }
  return out.join(' ');
}

function docTienBangChu(value) {
  let n = Math.round(Number(value) || 0);
  if (n === 0) return 'Không đồng.';
  const neg = n < 0; n = Math.abs(n);
  const groups = [];
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
  const parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    const full = i < groups.length - 1; // nhóm không phải đầu tiên: đọc đủ "không trăm"
    parts.push(`${readTriple(g, full)}${UNIT[i] ? ' ' + UNIT[i] : ''}`.trim());
  }
  let s = parts.join(' ').replace(/\s+/g, ' ').trim();
  s = (neg ? 'Âm ' : '') + s + ' đồng.';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = { docTienBangChu };
