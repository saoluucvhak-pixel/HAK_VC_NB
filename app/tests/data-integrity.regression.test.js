'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { install, storageKinds, ADMIN, KETOAN, rid } = require('./install');
const { Router } = require('../main/api/router');
const { ArchiveService } = require('../main/services/ArchiveService');
const { BackupService } = require('../main/services/BackupService');
const { SubcontractService } = require('../main/services/SubcontractService');
const { newStore } = require('../main/repo/createStore');
const { sha256 } = require('../main/repo/Journal');

async function fixture(t, kind, withData = false) {
  const ctx = await install('DH', { kind, withData });
  t.after(() => {
    try { ctx.store.close(); } catch {}
    try { fs.rmSync(ctx.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
  });
  return ctx;
}

const mark = (store) => store.transaction((tx) => {
  tx.insert('CONFIG', { config_key: 'REGRESSION_MARK', config_value: '1', value_type: 'TEXT', description: 'fixture' });
});

const ticketData = (ticketNo) => JSON.stringify({
  tickets: [{ ticket_no: ticketNo, weigh1_date: '2026-09-18', weigh1_time: '08:00:00', plate_no: '92H-00141', net_kg: 10000, route_code: 'VC.007' }]
});

for (const kind of storageKinds()) {
  test(`${kind}: xác nhận và tính lại cùng lúc chỉ một lệnh thành công`, async (t) => {
    const { store, contractId, periods } = await fixture(t, kind, true);
    const base = { contractId, dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', user: KETOAN };
    const router = new Router({ store, svc: { periods, auth: { check: () => ({ user: KETOAN }) }, backup: { autoDaily: async () => {} } } });
    const initial = await periods.calculate({ ...base, clientRequestId: rid() });
    const periodId = initial.period.period_id;
    const confirm = (rowVersion) => router.handle('periods.confirm', { periodId, rowVersion }, 'test');
    const recalculate = () => router.handle('periods.calculate', { ...base, periodId, vatRate: 0.10, clientRequestId: rid() }, 'test');
    const [confirmed, rejectedCalc] = await Promise.all([confirm(initial.period.row_version), recalculate()]);
    assert.equal(confirmed.ok, true);
    assert.equal(rejectedCalc.error.details.code, 'E_PERIOD_STATUS');
    assert.equal(store.get('KY_TINH', periodId).calc_version, 1);
    assert.equal(store.find('BKVC_LINE', (d) => d.period_id === periodId && d.is_current)[0].vat_rate, initial.vatRate);
    assert.ok(store.find('TRANSPORT_DETAIL', (d) => d.period_id === periodId && d.is_current).every((d) => d.usage_state === 'CONFIRMED'));
    await periods.reopen({ periodId, reason: 'fixture', user: ADMIN });
    const version = store.get('KY_TINH', periodId).row_version;
    const pendingCalc = recalculate();
    // Lớp chống gửi trùng đặt lệnh tính vào hàng đợi ở microtask kế tiếp.
    await Promise.resolve();
    const [calculated, rejectedConfirm] = await Promise.all([pendingCalc, confirm(version)]);
    assert.equal(calculated.ok, true, JSON.stringify(calculated.error));
    assert.equal(rejectedConfirm.error.code, 'CONFLICT_VERSION');
    assert.equal(store.get('KY_TINH', periodId).status, 'NHAP');
  });

  test(`${kind}: hai bản sao lưu trong cùng một giây vẫn giữ đủ nội dung`, async (t) => {
    const { store } = await fixture(t, kind);
    const backup = new BackupService(store, { now: () => new Date('2026-11-24T12:00:00Z') });
    const first = await backup.backup();
    await mark(store);
    const second = await backup.backup();
    assert.notEqual(first.file, second.file);
    for (const result of [first, second]) {
      assert.equal(sha256(fs.readFileSync(result.file)), result.sha256);
      backup.verify(result.file);
    }
  });

  test(`${kind}: lỗi audit khôi phục trả lại kho cũ và kho vẫn ghi được`, async (t) => {
    const ctx = await fixture(t, kind);
    let failedOnce = false;
    const backup = new BackupService(ctx.store, {
      reopen(root) {
        const fault = kind === 'json' && !failedOnce ? (phase) => {
          if (phase === 'afterCommitting') throw new Error('fixture: restore audit failed');
        } : undefined;
        const store = newStore(root, { fault }, kind).open();
        if (!failedOnce) {
          failedOnce = true;
          if (kind === 'sqlite') store.transaction = () => Promise.reject(new Error('fixture: restore audit failed'));
        }
        return store;
      }
    });
    t.after(() => backup.store.close());
    const snapshot = await backup.backup();
    await mark(ctx.store);
    const subcontract = new SubcontractService(ctx.store);
    const batch = await subcontract.importBatch({ jsonContent: ticketData('AFTER'), user: ADMIN });
    await assert.rejects(backup.restore({ file: snapshot.file, reason: 'fixture', user: ADMIN }), /restore audit failed/);
    assert.equal(backup.store.get('CONFIG', 'REGRESSION_MARK').config_value, '1');
    assert.equal(new SubcontractService(backup.store).list()[0].batchId, batch.batchId);
    await backup.store.transaction((tx) => tx.update('CONFIG', 'REGRESSION_MARK', { config_value: '2' }));
    assert.equal(backup.store.get('CONFIG', 'REGRESSION_MARK').config_value, '2');
  });

  test(`${kind}: ZIP lỗi giữ nguyên năm cũ và lỗi dọn thư mục sau khi mở năm chỉ cảnh báo`, async (t) => {
    const { store, dir } = await fixture(t, kind, true);
    const archive = new ArchiveService(store);
    const count = store.all('PHIEU_CAN').length;
    const { zip: source } = await archive.archive({ year: 2026, reason: 'fixture', user: ADMIN });
    const zip = new AdmZip(source);
    const manifest = JSON.parse(zip.readAsText('archive-manifest.json'));
    zip.updateFile(Object.keys(manifest.files)[0], Buffer.from('{}'));
    const bad = path.join(dir, 'bad.zip');
    zip.writeZip(bad);
    await assert.rejects(archive.restoreFile({ file: bad }), { code: 'INTEGRITY_ERROR' });
    assert.equal(archive._readArchive(2026).rows.PHIEU_CAN.length, count);
    const rename = fs.renameSync;
    fs.renameSync = (from, to) => {
      if (String(from).startsWith(path.join(dir, 'archive', '2026.tmp-'))) throw new Error('fixture: swap failed');
      return rename(from, to);
    };
    try {
      await assert.rejects(archive.restoreFile({ file: source }), /swap failed/);
      assert.equal(archive._readArchive(2026).rows.PHIEU_CAN.length, count);
    } finally {
      fs.renameSync = rename;
    }
    fs.renameSync = (from, to) => {
      if (String(to).includes('.mo-lai-')) throw new Error('fixture: rename failed');
      return rename(from, to);
    };
    try {
      const result = await archive.reopen({ year: 2026, reason: 'fixture', user: ADMIN });
      assert.equal(result.warnings[0].code, 'W_ARCHIVE_CLEANUP');
      assert.equal(store.all('PHIEU_CAN').length, count);
      assert.equal(store.archives[2026], undefined);
    } finally {
      fs.renameSync = rename;
    }
  });

  test(`${kind}: hoàn tác một đợt thuê bảo toàn đợt khác, chỉ mục hỏng chặn ghi`, async (t) => {
    const { store } = await fixture(t, kind);
    const service = new SubcontractService(store);
    const add = (ticketNo) => service.importBatch({ jsonContent: ticketData(ticketNo), rentUnitPrice: 10000, user: ADMIN });
    const a = await add('A1');
    const b = await add('B1');
    const transaction = store.transaction.bind(store);
    let fail = true;
    store.transaction = (fn, ...args) => {
      if (!fail) return transaction(fn, ...args);
      fail = false;
      return transaction(() => { throw new Error('fixture: terms audit failed'); }, ...args);
    };
    const edit = (batchId) => service.updateTerms({ batchId, rentUnitPrice: 20000, rowVersion: 1, reason: 'fixture', user: ADMIN });
    try {
      await Promise.all([assert.rejects(edit(a.batchId), /terms audit failed/), edit(b.batchId)]);
      const batches = service.list();
      assert.equal(batches.find((row) => row.batchId === a.batchId).rentUnitPrice, 10000);
      assert.equal(batches.find((row) => row.batchId === b.batchId).rentUnitPrice, 20000);
    } finally {
      store.transaction = transaction;
    }
    fs.writeFileSync(service._batchesFile(), '{');
    assert.throws(() => service.list(), { code: 'INTEGRITY_ERROR' });
    await assert.rejects(add('A1'), { code: 'INTEGRITY_ERROR' });
    assert.equal(fs.readFileSync(service._batchesFile(), 'utf8'), '{');
    assert.ok(fs.existsSync(a.filePath));
  });
}

test('JSON: sao lưu từ chối tệp bảng bị mất hoặc sai SHA-256', async (t) => {
  const { store, dir } = await fixture(t, 'json');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json')));
  const file = path.join(dir, Object.keys(manifest.files)[0]);
  fs.appendFileSync(file, ' ');
  const backup = new BackupService(store);
  await assert.rejects(backup.backup({ audit: false }), { code: 'INTEGRITY_ERROR' });
  fs.rmSync(file);
  await assert.rejects(backup.backup({ audit: false }), { code: 'INTEGRITY_ERROR' });
  assert.equal(backup.list().items.length, 0);
});
