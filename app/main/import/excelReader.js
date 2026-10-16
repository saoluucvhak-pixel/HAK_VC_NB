'use strict';
/**
 * Đọc file Excel (.xlsx) bằng exceljs (đóng gói trong bản cài — không cần mạng) hoặc CSV (UTF-8).
 * Chuẩn hóa ô: công thức → kết quả; rich text → chữ; ngày (Excel lưu số serial, exceljs trả Date UTC) → {__date, __time}.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ExcelJS = require('exceljs');
const { AppError } = require('../../shared/errors');

const pad = (n) => String(n).padStart(2, '0');
function normCell(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    return { __date: `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`, __time: `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}` };
  }
  if (typeof v === 'object') {
    if ('result' in v) return normCell(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return normCell(v.text);
    if ('error' in v) return null;
    return String(v);
  }
  return v;
}

function parseCsv(text) {
  const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === ';') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.map((r) => r.map((x) => (x === '' ? null : x)));
}

/** Mở file → { fileName, fileSha256, sheets:[{name, hidden, rowCount}], rows(sheetName) → mảng các dòng (mảng ô, cột A = chỉ số 0) }. */
async function openWorkbook(filePath) {
  if (!fs.existsSync(filePath)) throw new AppError('NOT_FOUND', `Không thấy file: ${filePath}`);
  const buf = fs.readFileSync(filePath);
  const fileSha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv') {
    const text = buf.toString('utf8').replace(/^﻿/, '');
    const data = parseCsv(text);
    return { fileName, fileSha256, sheets: [{ name: 'CSV', hidden: false, rowCount: data.length }], rows: () => data };
  }
  if (ext !== '.xlsx' && ext !== '.xlsm') throw new AppError('VALIDATION_FAILED', `Chỉ nhận file .xlsx / .xlsm / .csv (file .xls cũ: mở bằng Excel và lưu lại dạng .xlsx) — ${fileName}`);
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf); } catch (e) { throw new AppError('VALIDATION_FAILED', `Không đọc được file Excel ${fileName}: ${e.message}`); }
  const cache = new Map();
  return {
    fileName, fileSha256,
    sheets: wb.worksheets.map((w) => ({ name: w.name, hidden: w.state !== 'visible', rowCount: w.actualRowCount })),
    rows(sheetName) {
      if (cache.has(sheetName)) return cache.get(sheetName);
      const ws = wb.getWorksheet(sheetName);
      if (!ws) throw new AppError('NOT_FOUND', `File ${fileName} không có sheet "${sheetName}"`);
      const out = [];
      for (let r = 1; r <= ws.rowCount; r++) {
        const vals = ws.getRow(r).values; // chỉ số 1 = cột A
        const row = [];
        for (let c = 1; c < vals.length; c++) row.push(normCell(vals[c]));
        out.push(row);
      }
      cache.set(sheetName, out);
      return out;
    },
  };
}

module.exports = { openWorkbook, normCell, parseCsv };
