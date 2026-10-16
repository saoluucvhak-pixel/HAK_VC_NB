'use strict';
/**
 * Kiểm tra 1 dòng theo schema (shared/schema.json): cột lạ, bắt buộc, kiểu, enum.
 * Quy ước lưu: ngày 'yyyy-MM-dd', giờ 'HH:mm:ss', ngày giờ ISO; ô trống của cột không bắt buộc = '' (hoặc null).
 */
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const isEmpty = (v) => v === '' || v === null || v === undefined;

function validDate(s) {
  if (!DATE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function checkType(col, v) {
  switch (col.type) {
    case 'TEXT': return typeof v === 'string';
    case 'INT': return Number.isInteger(v);
    case 'NUM': return typeof v === 'number' && Number.isFinite(v);
    case 'DATE': return typeof v === 'string' && validDate(v);
    case 'TIME': return typeof v === 'string' && TIME.test(v);
    case 'DATETIME': return typeof v === 'string' && DATETIME.test(v);
    case 'BOOL': return typeof v === 'boolean';
    case 'JSON': if (typeof v !== 'string') return false; try { JSON.parse(v); return true; } catch { return false; }
    case 'ENUM': return typeof v === 'string' && col.enum.includes(v);
    default: return false;
  }
}

/** Trả danh sách lỗi [{field, code, message}] — rỗng = hợp lệ. */
function validateRow(tableName, def, row) {
  const errs = [];
  const known = new Set(def.columns.map((c) => c.name));
  for (const k of Object.keys(row)) if (!known.has(k)) errs.push({ field: k, code: 'UNKNOWN_COLUMN', message: `${tableName}: cột lạ "${k}"` });
  for (const c of def.columns) {
    const v = row[c.name];
    if (isEmpty(v)) {
      if (c.required && c.type !== 'BOOL') errs.push({ field: c.name, code: 'REQUIRED', message: `${tableName}.${c.name} bắt buộc` });
      if (c.required && c.type === 'BOOL') errs.push({ field: c.name, code: 'REQUIRED', message: `${tableName}.${c.name} bắt buộc (true/false)` });
      continue;
    }
    if (!checkType(c, v)) {
      errs.push({ field: c.name, code: 'TYPE', message: `${tableName}.${c.name} sai kiểu ${c.type}${c.enum ? ` (${c.enum.join('/')})` : ''}: ${JSON.stringify(v)}` });
    }
  }
  return errs;
}

/** Bổ sung cột thiếu (không bắt buộc) bằng '' và sắp đúng thứ tự cột schema. */
function normalizeRow(def, row) {
  const o = {};
  for (const c of def.columns) o[c.name] = row[c.name] === undefined ? '' : row[c.name];
  for (const k of Object.keys(row)) if (!(k in o)) o[k] = row[k]; // giữ để validateRow báo cột lạ
  return o;
}

module.exports = { validateRow, normalizeRow, isEmpty, validDate };
