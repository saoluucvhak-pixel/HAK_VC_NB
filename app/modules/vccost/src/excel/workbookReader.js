'use strict';
/** Đọc .xlsx / .xls / .csv thành danh sách sheet + mảng 2 chiều. Không ghi gì. */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const XLSX = require('xlsx');

function readWorkbook({ filePath, buffer, fileName }) {
  const buf = buffer ? Buffer.from(buffer) : fs.readFileSync(filePath);
  const name = fileName || (filePath ? path.basename(filePath) : 'file');
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  let wb;
  if (/\.csv$/i.test(name)) {
    let text = buf.toString('utf8').replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const FS = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
    wb = XLSX.read(text, { type: 'string', FS, raw: true });
  } else {
    wb = XLSX.read(buf, { type: 'buffer', cellDates: false });
  }
  const aoaCache = new Map();
  const aoa = (sheet) => {
    if (!aoaCache.has(sheet)) aoaCache.set(sheet, XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: true, defval: null, blankrows: true }));
    return aoaCache.get(sheet);
  };
  const sheets = wb.SheetNames.map((n) => {
    const ref = wb.Sheets[n]['!ref'];
    const rng = ref ? XLSX.utils.decode_range(ref) : null;
    return { name: n, rows: rng ? rng.e.r + 1 : 0, cols: rng ? rng.e.c + 1 : 0 };
  });
  return { fileName: name, hash, size: buf.length, sheets, aoa, buffer: buf };
}

module.exports = { readWorkbook };
