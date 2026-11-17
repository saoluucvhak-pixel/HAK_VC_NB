'use strict';
/**
 * Giai đoạn 1 — T-SQL-01: kill -9 (SIGKILL) tiến trình đang ghi liên tục vào kho SQLite → mở lại phải nguyên vẹn:
 *  quick_check = ok; mỗi giao dịch ghi CẶP dòng (A,B) cùng số thứ tự + tăng dataVersion 1 → sau khi mở lại không có dòng lẻ cặp, dataVersion khớp số cặp.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { install } = require('./install');
const { newStore, storageKinds } = require('../main/repo/createStore');

const CHILD = `
const { newStore } = require(${JSON.stringify(path.join(__dirname, '../main/repo/createStore'))});
const s = newStore(process.argv[1], {}, 'sqlite').open();
(async () => {
  for (let n = 1; ; n++) {
    await s.transaction((tx) => {
      tx.audit('CRASH_A', 'X', String(n), null, { n }, { reason: 'a' });
      tx.audit('CRASH_B', 'X', String(n), null, { n }, { reason: 'b' });
    }, { user: 'crash' });
    if (n === 5) process.stdout.write('READY\\n');
  }
})();
`;

test('SQLite: SIGKILL giữa chuỗi giao dịch (5 lần ở các thời điểm khác nhau) → mở lại nguyên vẹn, không giao dịch nửa vời', { skip: !storageKinds().includes('sqlite') && 'không có node:sqlite', timeout: 120000 }, async () => {
  const ctx = await install('DH', { withData: false, kind: 'sqlite' }); ctx.store.close();
  let lastPairs = 0;
  for (let round = 0; round < 5; round++) {
    const child = spawn(process.execPath, ['--no-warnings', '-e', CHILD, ctx.dir], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((res, rej) => { child.stdout.on('data', (d) => { if (String(d).includes('READY')) res(); }); child.on('exit', () => rej(new Error('child thoát sớm'))); });
    await new Promise((r) => setTimeout(r, 20 + round * 37)); // thời điểm kill khác nhau
    child.kill('SIGKILL'); await new Promise((r) => child.on('exit', r));
    // khóa thư mục còn sót do kill: chiếm quyền như người dùng xác nhận trong ứng dụng
    const s = newStore(ctx.dir, { lockStaleMs: 0 }, 'sqlite').open({ takeoverStaleLock: true });
    const a = s.find('AUDIT_LOG', (x) => x.action === 'CRASH_A').map((x) => x.entity_id); const b = s.find('AUDIT_LOG', (x) => x.action === 'CRASH_B').map((x) => x.entity_id);
    assert.deepEqual(a.slice().sort(), b.slice().sort(), `vòng ${round}: có cặp lẻ`);
    assert.ok(a.length >= lastPairs, 'không mất giao dịch đã xác nhận trước đó');
    assert.equal(s.db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
    assert.equal(s.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(s.dataVersion, ctx.store.dataVersion + a.length, 'dataVersion khớp số giao dịch đã ghi');
    lastPairs = a.length; s.close();
  }
  assert.ok(lastPairs >= 5);
});
