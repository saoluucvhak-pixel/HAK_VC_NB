'use strict';
/**
 * Sinh "danh mục đi kèm bản cài" (resources/catalog/catalog.json) — dùng chung cho MỌI nhà máy.
 * Nguồn: danh mục của dữ liệu mẫu (đủ đơn vị, xe, tuyến, giá, 3 hợp đồng, cấu hình, 2 ADMIN).
 * Lúc khởi tạo, SetupService chỉ lấy hợp đồng mà đơn vị của bản cài là 1 bên.
 *   node tools/build-catalog.js
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadDataFolder } = require('../tests/helpers');

const TABLES = ['DON_VI', 'XE', 'TUYEN_VC', 'PRICE_HISTORY', 'HOP_DONG', 'HOP_DONG_XE', 'CONFIG', 'USERS'];
const all = {}; for (const t of TABLES) all[t] = new Map();
const pk = { DON_VI: 'unit_code', XE: 'plate_no', TUYEN_VC: 'route_code', PRICE_HISTORY: 'price_id', HOP_DONG: 'contract_id', HOP_DONG_XE: 'id', CONFIG: 'config_key', USERS: 'username' };
for (const inst of ['HAKQN', 'DH', 'HAK']) {
  const { rows } = loadDataFolder(inst);
  for (const t of TABLES) for (const r of rows[t] || []) if (!all[t].has(r[pk[t]])) all[t].set(r[pk[t]], r);
}
const out = { format: 'DGVC-CATALOG', version: 1, builtAt: new Date().toISOString().slice(0, 10), tables: Object.fromEntries(TABLES.map((t) => [t, [...all[t].values()]])) };
const f = path.join(__dirname, '../resources/catalog/catalog.json');
fs.mkdirSync(path.dirname(f), { recursive: true });
fs.writeFileSync(f, JSON.stringify(out, null, 1));
console.log(f, Object.fromEntries(TABLES.map((t) => [t, out.tables[t].length])));
