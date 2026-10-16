'use strict';
/** Dựng một bản cài MỚI trong thư mục tạm: nạp danh mục mẫu + import thẳng file Excel gốc (dùng chung cho test kỳ tính và báo cáo). */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JsonStore } = require('../main/repo/JsonStore');
const { ImportService } = require('../main/import/ImportService');
const { PeriodService } = require('../main/services/PeriodService');
const { loadDataFolder } = require('./helpers');

const X = path.join(__dirname, 'fixtures/excel');
const FILE = { HAKQN: path.join(X, 'Dongiavanchuyen_24.09 QS-TS( XUẤT QS).xlsx'), DH: path.join(X, 'Dongiavanchuyen_24.09_DH.xlsx'), HAK: path.join(X, 'Dongiavanchuyen_24.09_ĐN.xlsx') };
const CONTRACT = { HAKQN: 'HD-HAKQN-QS', DH: 'HD-DH-HAKQN', HAK: 'HD-HAK-HAKQN' };
const CATALOG = ['DON_VI', 'XE', 'TUYEN_VC', 'HOP_DONG', 'PRICE_HISTORY', 'HOP_DONG_XE', 'CONFIG', 'USERS'];
const ADMIN = { username: 'phuthuy.apple@gmail.com', role: 'ADMIN' };
const KETOAN = { username: 'ketoan', role: 'KE_TOAN' };
let n = 0; const rid = (p = 'req') => `${p}-${process.pid}-${++n}`;

async function install(inst, { withData = true, installId = `INS-T12-${inst}` } = {}) {
  const seed = loadDataFolder(inst);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `dgvc12-${inst}-`));
  JsonStore.create(dir, { installCode: inst, unitCode: seed.manifest.unitCode, installId });
  const store = new JsonStore(dir).open();
  await store.transaction((tx) => { for (const t of CATALOG) for (const r of seed.rows[t]) tx.insert(t, r); }, { user: 'setup' });
  if (withData) {
    const imp = new ImportService(store);
    const a = await imp.preview({ importType: 'PHIEU_CAN', filePath: FILE[inst], user: 'ketoan' });
    await imp.confirm({ batchId: a.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' });
    const b = await imp.preview({ importType: 'GIAO_NHAN_DAU', contractId: CONTRACT[inst], filePath: FILE[inst], user: 'ketoan' });
    await imp.confirm({ batchId: b.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' });
  }
  return { dir, store, seed: seed.rows, periods: new PeriodService(store), contractId: CONTRACT[inst] };
}

module.exports = { install, FILE, CONTRACT, ADMIN, KETOAN, rid };
