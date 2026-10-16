'use strict';
/** CSV UTF-8 có BOM (Excel mở đúng tiếng Việt), phân cách dấu phẩy, số dạng máy (dấu chấm thập phân), ngày dd/MM/yyyy. */
const dmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
function cell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(columns, rows) {
  const lines = [columns.map((c) => cell(c.header)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => cell(c.fmt === 'date' ? dmy(r[c.key]) : r[c.key])).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}
module.exports = { toCsv };
