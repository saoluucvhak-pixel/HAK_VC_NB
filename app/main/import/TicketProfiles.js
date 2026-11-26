'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { AppError, businessError } = require('../../shared/errors');
const { openWorkbook } = require('./excelReader');
const M = require('./mapping');

const TABLE = 'IMPORT_PROFILE';
const WEIGHTS = ['net_kg', 'weight1_kg', 'weight2_kg'];
const FIELDS = {
  ticket_no: 'Số phiếu', plate_no: 'Biển số', weigh1_date: 'Ngày cân 1', weigh1_time: 'Giờ cân 1',
  weigh2_date: 'Ngày cân 2', weigh2_time: 'Giờ cân 2', net_kg: 'Khối lượng hàng', weight1_kg: 'Cân lần 1',
  weight2_kg: 'Cân lần 2', weight_unit: 'Đơn vị khối lượng', warehouse: 'Kho', import_note: 'Ghi chú', route_code: 'Mã tuyến',
  origin: 'Nguồn gốc', customer: 'Khách hàng', ldd: 'Lệnh điều động', weigh_type: 'Kiểu cân',
  transport_unit_name: 'Đơn vị vận chuyển', row_no: 'STT',
};
const aliases = {
  weigh1_date: ['ngày cân 1', 'ngày cân', 'ngày giờ cân', 'thời gian cân', 'ngày giờ cân 1'],
  weigh1_time: ['giờ cân', 'giờ cân 1'], weigh2_date: ['ngày cân 2', 'ngày giờ cân 2'], weigh2_time: ['giờ cân 2'],
  net_kg: ['kl hàng', 'khối lượng hàng', 'khối lượng', 'khối lượng tịnh', 'net'], weight_unit: ['đơn vị', 'đơn vị tính', 'đvt', 'đơn vị khối lượng'],
  warehouse: ['kho', 'kho hàng'], import_note: ['ghi chú', 'ghi chú cân'],
};
const key = (s) => M.normHeader(s).normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
const present = (v) => v !== undefined && v !== null && v !== '';
const unitOf = (s) => {
  const u = key(s).replace(/\.$/, '');
  if (['kg', 'kgs', 'kilogram', 'kilograms', 'ki lo gam', 'kilogam'].includes(u)) return 'kg';
  if (['t', 'tan', 'ton', 'tons', 'tonne', 'tonnes', 'mt'].includes(u)) return 't';
  return '';
};
const unitPattern = /(?:\(\s*(kg|kgs|t|tấn|tan|tons?|tonnes?|mt|kilograms?)\s*\)|(?:^|[\s/]|(?<=\d))(kg|kgs|t|tấn|tan|tons?|tonnes?|mt|kilograms?))\s*$/iu;
const matchUnit = (s) => M.toText(s).match(unitPattern);
const headerUnit = (s) => { const m = matchUnit(s); return m ? unitOf(m[1] || m[2]) : ''; };
const dateSignature = /\bngay\s+(?:\d{1,2}\s+thang\s+\d{1,2}\s+nam\s+\d{4}|\d{1,2}[/.-]\d{1,2}[/.-]\d{4})\s*$/u;
const signatureLabel = /^(?:nguoi (?:duyet|kiem tra|lap(?: bieu| bang)?|ky)|(?:\(\s*)?ky(?:\s*,)?\s+ghi ro ho ten(?:\s*\))?)$/u;
const totalLabel = /^(?:tong(?: cong| khoi luong(?: hang)?| kl(?: hang)?)?|cong|total|grand total)(?:\s*\([^()]+\))?$/;
function totalParts(value) {
  if (typeof value !== 'string') return null;
  const [, label, raw] = value.match(/^([^:=]+)(?:[:=](.*))?$/) || [];
  return totalLabel.test(key(label)) ? { label, inline: raw?.trim() } : null;
}
const profileError = (message, details = {}) => businessError('E_IMPORT_PROFILE', message, details);

// Một cột Date Time có thể cấp cả ngày và giờ cho cùng một lần cân, hoặc ngày cân 2 dùng chung cột với ngày cân 1.
const dateForTime = { weigh1_time: 'weigh1_date', weigh2_time: 'weigh2_date', weigh2_date: 'weigh1_date' };
function hasConflictingColumn(mapping) {
  const assigned = Object.entries(mapping).filter(([field, column]) =>
    !Object.hasOwn(dateForTime, field) || mapping[dateForTime[field]] !== column);
  return new Set(assigned.map(([, column]) => column)).size !== assigned.length;
}

function validateConfig(config) {
  const { headerRow, mapping, fallbackUnit = '' } = config || {};
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > 1048576) throw profileError('Dòng tiêu đề phải là số nguyên từ 1 đến 1.048.576');
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw profileError('Chưa ghép cột');
  const entries = Object.entries(mapping);
  if (entries.some(([field, name]) => !Object.hasOwn(FIELDS, field) || typeof name !== 'string' || !key(name))) throw profileError('Cách ghép cột không hợp lệ');
  if (hasConflictingColumn(Object.fromEntries(entries.map(([field, name]) => [field, key(name)])))) {
    throw profileError('Chỉ được ghép chung một cột cho Ngày cân và Giờ cân cùng lần hoặc hai lần cân cùng ngày');
  }
  const missing = ['plate_no', 'weigh1_date'].filter((field) => !mapping[field]);
  if (!mapping.net_kg && !(mapping.weight1_kg && mapping.weight2_kg)) missing.push('net_kg');
  if (missing.length) throw profileError('Cần ghép biển số, ngày cân 1 và khối lượng hàng hoặc cả hai lần cân', { missing });
  if (!['', 'kg', 't'].includes(fallbackUnit)) throw profileError('Đơn vị dự phòng phải là kg hoặc tấn');
  return { headerRow, mapping: Object.fromEntries(entries.map(([field, name]) => [field, name.trim()])), fallbackUnit };
}

function headersAt(rows, headerRow) {
  const row = rows[headerRow - 1] || [];
  const upper = rows[headerRow - 2] || [];
  return Array.from({ length: Math.max(row.length, upper.length) }, (_, index) => {
    const parent = M.toText(upper[index]);
    const name = M.toText(row[index]) || parent;
    return { name, parent, combined: name && parent && key(name) !== key(parent) ? `${parent} ${name}` : '' };
  });
}

function resolveColumns(headers, mapping, headerRow) {
  const colOf = {};
  const problems = [];
  for (const [field, title] of Object.entries(mapping)) {
    const hits = headers.flatMap(({ name, combined }, index) => [name, combined].some((v) => key(v) && key(v) === key(title)) ? [index] : []);
    if (hits.length === 1) colOf[field] = hits[0];
    else problems.push(`${hits.length ? 'Trùng' : 'Thiếu'} tiêu đề “${title}” (${FIELDS[field]})`);
  }
  if (problems.length) throw profileError(`Dòng ${headerRow}: ${problems.join(' · ')}`, { problems });
  if (hasConflictingColumn(colOf)) throw profileError(`Dòng ${headerRow}: nhiều trường đang ghép vào cùng một cột`);
  return colOf;
}

function inspect(wb, sheetName, headerRow) {
  const sheets = wb.sheets.filter((sheet) => !sheet.hidden);
  const sheet = sheetName || sheets.find((s) => ['NL_VC', 'CAN'].includes(s.name))?.name || sheets[0]?.name;
  if (!sheet) throw profileError('File không có sheet đang hiển thị');
  const rows = wb.rows(sheet);
  headerRow = headerRow ?? (M.detectHeaderRow(rows, 'PHIEU_CAN') + 1 || 1);
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > Math.max(1, rows.length)) throw profileError(`Sheet “${sheet}” chỉ có ${rows.length} dòng`);
  const headers = headersAt(rows, headerRow);
  const counts = new Map();
  const names = new Set();
  for (const { name, combined } of headers) {
    for (const title of new Set([name, combined].filter(Boolean))) {
      names.add(title);
      const normalized = key(title);
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
  }
  const options = [...names].map((name) => ({ name, duplicate: counts.get(key(name)) > 1 }));
  const inferField = (title) => {
    const base = title.replace(unitPattern, '');
    return Object.keys(aliases).find((field) => aliases[field].some((alias) => key(alias) === key(base)))
      || M.matchField(M.FIELDS.PHIEU_CAN, title) || M.matchField(M.FIELDS.PHIEU_CAN, base);
  };
  const suggested = {};
  headers.forEach(({ name, combined, parent }) => {
    const field = inferField(name) || (combined && inferField(parent));
    const chosen = counts.get(key(name)) === 1 ? name : combined;
    if (field && !suggested[field] && counts.get(key(chosen)) === 1) suggested[field] = chosen;
  });
  const headerCells = (rows[headerRow - 1] || []).flatMap((value, index) => {
    const title = M.toText(value);
    return title ? [{ column: index + 1, title }] : [];
  });
  return { sheets, sheet, rowCount: rows.length, headerRow, headerCells, options, suggested };
}

function chooseSheet(wb, sheetName, config) {
  if (sheetName) {
    const rows = wb.rows(sheetName);
    if (config.headerRow > rows.length) throw profileError(`Sheet “${sheetName}” chỉ có ${rows.length} dòng`);
    return { sheet: sheetName, colOf: resolveColumns(headersAt(rows, config.headerRow), config.mapping, config.headerRow) };
  }
  const matches = [];
  const errors = [];
  for (const { name, hidden } of wb.sheets) {
    if (hidden) continue;
    try { matches.push(chooseSheet(wb, name, config)); }
    catch (error) { errors.push(`${name}: ${error.message}`); }
  }
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw profileError(`Nhiều sheet có cùng tiêu đề: ${matches.map((m) => m.sheet).join(', ')}. Hãy chọn sheet.`);
  throw profileError(errors.join(' | ') || 'File không có sheet đang hiển thị');
}

function dateTime(raw) {
  if (raw && typeof raw === 'object') return { date: M.toDate(raw), time: M.toTime(raw) };
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    return { date: M.toDate(raw), time: raw % 1 ? M.toTime(raw % 1) : { value: '' } };
  }
  const [, date, time] = M.toText(raw).match(/^(\S+?)[ T]+(.+)$/) || [];
  return { date: M.toDate(date || raw), time: M.toTime(time) };
}

// Validate the whole cell before removing locale separators. The shared legacy parser is permissive.
const numberVn = /^[+-]?(?:(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?|,\d+)$/;
const numberEn = /^[+-]?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?|\.\d+)$/;
function profileNumber(raw, unit, style) {
  if (typeof raw !== 'string') return M.toNumber(raw, style);
  const text = raw.trim().replace(/\s/g, '');
  const vn = style !== 'EN' && numberVn.test(text) ? M.toNumber(text, 'VN').value : undefined;
  const en = style !== 'VN' && numberEn.test(text) ? M.toNumber(text, 'EN').value : undefined;
  if (vn === undefined && en === undefined) return { error: `số không đọc được "${raw}"` };
  // A dot with three following digits may be decimal for tonnes. Preserve the
  // existing Vietnamese thousands convention for kilograms.
  if (vn !== undefined && en !== undefined && vn !== en && (unit === 't' || text.includes(','))) return { ambiguous: true };
  return { value: vn ?? en };
}

function weight(raw, columnUnit, rowUnit, fallback, numberStyle) {
  if (!present(raw)) return {};
  const suffix = matchUnit(raw);
  const value = suffix ? String(raw).slice(0, suffix.index).trim() : raw;
  const unit = suffix ? unitOf(suffix[1] || suffix[2]) : rowUnit || columnUnit || fallback;
  const n = profileNumber(value, unit, numberStyle);
  if (n.ambiguous) return { error: `Số “${raw}” mơ hồ. Hãy chọn kiểu số Việt Nam hoặc Anh / Mỹ.`, ambiguous: true };
  if (n.error && /\p{L}/u.test(M.toText(value))) return { unitError: `Không xác định được đơn vị của “${raw}”` };
  if (n.error || typeof n.value !== 'number') return { error: n.error || `Khối lượng không hợp lệ “${raw}”` };
  if (!unit) return { unitError: 'Không xác định được đơn vị kg/tấn' };
  const kg = n.value * (unit === 't' ? 1000 : 1);
  return Number.isFinite(kg) ? { kg } : { error: 'Khối lượng vượt giới hạn' };
}

function generatedTicketNo(row) {
  const identity = ['plate_no', 'weigh1_date', 'weigh1_time', 'weigh2_date', 'weigh2_time', 'net_kg', 'weight1_kg', 'weight2_kg']
    .map((field) => row[field] ?? '');
  return `AUTO-${createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 16).toUpperCase()}`;
}

function read(wb, sheetName, input, numberStyle = 'AUTO') {
  if (!['AUTO', 'VN', 'EN'].includes(numberStyle)) throw new AppError('VALIDATION_FAILED', 'Kiểu số không hợp lệ');
  const config = validateConfig(input);
  const { sheet, colOf } = chooseSheet(wb, sheetName, config);
  const all = wb.rows(sheet);
  const headerDetails = headersAt(all, config.headerRow);
  const headers = headerDetails.map(({ name }) => name);
  const columnUnits = Object.fromEntries(WEIGHTS.map((field) => {
    const { name, parent } = headerDetails[colOf[field]] || {};
    return [field, headerUnit(name) || headerUnit(parent)];
  }));
  const rowWarnings = [];
  const dataRows = [];
  const rows = [];
  const declared = [];
  const unitErrors = [];
  const footerFields = ['plate_no', 'weigh1_date', 'weight_unit', ...WEIGHTS];
  const columns = new Set(Object.keys(colOf).filter((field) => field !== 'weight_unit'));
  columns.add('ticket_no');
  columns.add('net_kg');
  columns.add('weigh2_date');
  for (const field of ['weigh1_time', 'weigh2_time']) {
    if (colOf[field] !== undefined || colOf[field === 'weigh1_time' ? 'weigh1_date' : 'weigh2_date'] !== undefined) columns.add(field);
  }

  for (let index = config.headerRow; index < all.length; index++) {
    const rowNo = index + 1;
    const cells = all[index];
    const at = (field) => cells[colOf[field]];
    if (!cells.some(present)) continue;
    const total = cells.map(totalParts).find(Boolean);
    const rawRowUnit = M.toText(at('weight_unit'));
    const rowUnit = unitOf(rawRowUnit);
    const forWeight = (field, raw = at(field), totalUnit = '') => weight(raw, totalUnit || columnUnits[field], rowUnit, config.fallbackUnit, numberStyle);
    if (total && (!present(at('plate_no')) || totalParts(at('plate_no')))) {
      const field = config.mapping.net_kg ? 'net_kg' : '';
      const totalUnit = headerUnit(total.label);
      const quantities = cells.filter((v, col) => col !== colOf.weight_unit && present(v)
        && (typeof v === 'number' || /^-?\d[\d.,\s]*(?:\s*[\p{L}]+)?$/u.test(M.toText(v))));
      const raw = total.inline || (field && present(at(field)) ? at(field) : quantities.length === 1 ? quantities[0] : null);
      const result = rawRowUnit && !rowUnit ? {} : forWeight(field, raw, totalUnit);
      if (result.kg !== undefined) declared.push({ rowNo, kg: result.kg });
      else rowWarnings.push({ rowNo, message: 'Không đọc được tổng công bố hoặc đơn vị của dòng tổng' });
      continue;
    }
    const ticket = wb.ticketText ? wb.ticketText(sheet, rowNo, colOf.ticket_no) : M.toText(at('ticket_no'));
    const plate = M.toText(at('plate_no')).toUpperCase();
    const hasMass = WEIGHTS.some((field) => present(at(field)));
    const ticketLike = /^\S*[0-9]\S*$/.test(ticket) && !M.toDate(ticket).value;
    const primary = dateTime(at('weigh1_date'));
    const signature = !primary.date.value && footerFields.some((field) => {
      const label = key(at(field));
      return signatureLabel.test(label) || dateSignature.test(label);
    });
    if (!ticketLike && (signature || (!hasMass && (!plate || M.toDate(at('plate_no')).value)))) {
      rowWarnings.push({ rowNo, message: 'Bỏ qua dòng ngoài bảng phiếu cân' });
      continue;
    }
    const issues = [];
    const warn = (message, code = 'E_PROFILE_ROW') => issues.push({ code, level: 'ERROR', message });
    const secondary = dateTime(at('weigh2_date'));
    const time1 = colOf.weigh1_time !== colOf.weigh1_date && present(at('weigh1_time')) ? M.toTime(at('weigh1_time')) : primary.time;
    const time2 = colOf.weigh2_time !== colOf.weigh2_date && present(at('weigh2_time')) ? M.toTime(at('weigh2_time')) : secondary.time;
    const record = Object.fromEntries([...columns].map((field) => [field, M.toText(at(field))]));
    let date2 = secondary.date.value || primary.date.value || '';
    if (primary.date.value && time1.value && time2.value && time2.value < time1.value) {
      if (colOf.weigh2_date === undefined || colOf.weigh2_date === colOf.weigh1_date) {
        const d = new Date(primary.date.value + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + 1);
        date2 = d.toISOString().slice(0, 10);
      }
    }
    Object.assign(record, {
      ticket_no: ticket, plate_no: plate, weigh1_date: primary.date.value || '', weigh1_time: time1.value || '',
      weigh2_date: date2, weigh2_time: time2.value || '',
    });
    if (!plate) warn('Thiếu biển số');
    if (!record.weigh1_date) warn(primary.date.error || 'Thiếu ngày cân');
    for (const v of [secondary.date, time1, time2]) if (v.error) warn(v.error);
    if (rawRowUnit && !rowUnit) unitErrors.push({ rowNo, message: `Đơn vị “${rawRowUnit}” chưa được hỗ trợ` });
    for (const field of WEIGHTS) {
      if (colOf[field] === undefined) continue;
      const result = forWeight(field);
      record[field] = result.kg ?? '';
      if (result.unitError) unitErrors.push({ rowNo, message: `${FIELDS[field]}: ${result.unitError}` });
      if (result.error) warn(`${FIELDS[field]}: ${result.error}`, result.ambiguous ? 'E_NUMBER_AMBIGUOUS' : undefined);
    }
    if (!present(at('net_kg')) && typeof record.weight1_kg === 'number' && typeof record.weight2_kg === 'number') {
      record.net_kg = Math.abs(record.weight1_kg - record.weight2_kg);
    }
    if (!(record.net_kg > 0)) warn('Khối lượng hàng phải lớn hơn 0');
    if (!record.ticket_no) {
      record.ticket_no = generatedTicketNo(record);
      rowWarnings.push({ rowNo, message: `Không có số phiếu. Dùng mã ${record.ticket_no}` });
    }
    const valid = !issues.length;
    rows.push({ rowNo, normalized: record, issues, valid });
    rowWarnings.push(...issues.map(({ message }) => ({ rowNo, message })));
    dataRows.push({ rowNo, cells, normalized: record, issues });
  }
  if (unitErrors.length) {
    const description = unitErrors.slice(0, 5).map((w) => `Dòng ${w.rowNo}: ${w.message}`).join(' · ');
    throw profileError(description, { warnings: unitErrors.slice(0, 100), warningCount: unitErrors.length });
  }
  const valid = rows.filter((row) => row.valid);
  const totalKg = valid.reduce((sum, row) => sum + row.normalized.net_kg, 0);
  return {
    config, sheet, colOf, headers, dataRows, columns,
    trial: { rows: rows.slice(0, 8), count: valid.length, totalRows: rows.length, totalKg, warningCount: rowWarnings.length,
      warnings: rowWarnings.slice(0, 100), declaredTotals: declared.map((total) => ({ ...total, differenceKg: totalKg - total.kg })) },
  };
}

const unpack = (row) => ({ id: row.profile_id, name: row.name, ...JSON.parse(row.config_json), isDefault: row.is_default === true, rowVersion: row.row_version });
const list = (store) => ({ items: store.all(TABLE).map(unpack).sort((a, b) => a.name.localeCompare(b.name, 'vi')) });

async function save(store, { id, rowVersion, name, filePath, sheetName, config, numberStyle, copyFromId }, user) {
  if (numberStyle !== undefined && !['AUTO', 'VN', 'EN'].includes(numberStyle)) throw new AppError('VALIDATION_FAILED', 'Kiểu số không hợp lệ');
  name = typeof name === 'string' ? name.trim() : '';
  if (!name || name.length > 120) throw new AppError('VALIDATION_FAILED', 'Tên mẫu phải có từ 1 đến 120 ký tự');
  if (id && copyFromId) throw new AppError('VALIDATION_FAILED', 'Hãy lưu bản sao thành mẫu mới');
  const parsed = copyFromId ? null : read(await openWorkbook(filePath), sheetName, config, numberStyle);
  if (parsed && !parsed.trial.count) throw profileError('File đọc thử cần có ít nhất một phiếu hợp lệ');
  const saved = await store.transaction((tx) => {
    if (tx.all(TABLE).some((row) => row.profile_id !== id && key(row.name) === key(name))) throw profileError(`Tên mẫu “${name}” đã được dùng`);
    const source = copyFromId && tx.get(TABLE, copyFromId);
    if (copyFromId && !source) throw new AppError('NOT_FOUND', 'Không tìm thấy mẫu để sao chép');
    const fields = { name, config_json: source ? source.config_json : JSON.stringify(parsed.config) };
    if (id && !Number.isInteger(rowVersion)) throw new AppError('VALIDATION_FAILED', 'Thiếu phiên bản mẫu');
    const changed = id ? tx.update(TABLE, id, fields, { expectedRowVersion: rowVersion }) : {
      before: null, after: tx.insert(TABLE, { profile_id: randomUUID(), is_default: false, ...fields }),
    };
    tx.audit('IMPORT_PROFILE_SAVE', TABLE, changed.after.profile_id, changed.before, changed.after);
    return changed.after;
  }, { user });
  return { item: unpack(saved), trial: parsed?.trial };
}

function selectDefault(store, { id = '' }, user) {
  return store.transaction((tx) => {
    if (id && !tx.get(TABLE, id)) throw new AppError('NOT_FOUND', 'Không tìm thấy mẫu');
    for (const row of tx.all(TABLE)) {
      const active = row.profile_id === id;
      if (row.is_default !== active) {
        const { before, after } = tx.update(TABLE, row.profile_id, { is_default: active });
        tx.audit('IMPORT_PROFILE_DEFAULT', TABLE, row.profile_id, before, after);
      }
    }
    return { defaultId: id };
  }, { user });
}

function remove(store, { id }, user) {
  return store.transaction((tx) => {
    const before = tx.remove(TABLE, id);
    tx.audit('IMPORT_PROFILE_DELETE', TABLE, id, before);
    return { id };
  }, { user });
}

module.exports = { inspect, read, list, save, selectDefault, remove, FIELDS, profileError };
