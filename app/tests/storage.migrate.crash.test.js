'use strict';
/**
 * Giai đoạn 2 — mất điện giữa chừng khi di chuyển: kill -9 tiến trình đang di chuyển ở nhiều thời điểm khác nhau.
 * Bất biến sau MỖI lần kill: kho JSON nguồn nguyên vẹn (manifest cùng SHA-256, mở được, cùng dấu vân tay); nếu đã có dgvc.sqlite thì nó khớp nguồn (không bao giờ có DB chưa kiểm chứng);
 * rồi chạy lại di chuyển → thành công, không nhân đôi bản ghi.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { install } = require('./install');
const { JsonStore } = require('../main/repo/JsonStore');
const { SqliteStore, sqliteAvailable } = require('../main/repo/SqliteStore');
const { migrateJsonToSqlite } = require('../main/repo/migrate/migrate');

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const CHILD = `
const { migrateJsonToSqlite } = require(${JSON.stringify(path.join(__dirname, '../main/repo/migrate/migrate'))});
process.stdout.write('GO\\n');
migrateJsonToSqlite({ root: process.argv[1], backup: process.argv[2] === 'backup' }).then(() => process.exit(0), () => process.exit(1));
`;

test('Di chuyển bị kill -9 ở 8 thời điểm khác nhau → nguồn nguyên vẹn, không DB chưa kiểm chứng, chạy lại thành công', { skip: !sqliteAvailable() && 'không có node:sqlite', timeout: 600000 }, async () => {
  const c = await install('DH', { kind: 'json' }); const fp = c.store.fingerprint(); c.store.close();
  const mp = path.join(c.dir, 'manifest.json'); const mSha = sha(mp);
  const delays = [1, 15, 40, 80, 150, 250, 400, 700];
  for (const [i, d] of delays.entries()) {
    const child = spawn(process.execPath, ['--no-warnings', '-e', CHILD, c.dir, i % 2 ? 'backup' : 'nobackup'], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((res) => child.stdout.once('data', res));
    await new Promise((r) => setTimeout(r, d));
    const done = child.exitCode !== null; if (!done) child.kill('SIGKILL'); await new Promise((r) => (child.exitCode !== null || child.signalCode ? r() : child.on('exit', r)));
    assert.equal(sha(mp), mSha, `vòng ${i}: manifest nguồn bị đổi`);
    // khóa còn sót do kill → chiếm quyền (như người dùng xác nhận)
    const j = new JsonStore(c.dir, { lockStaleMs: 0 }).open({ takeoverStaleLock: true }); assert.equal(j.fingerprint().sha256, fp.sha256, `vòng ${i}: JSON nguồn đổi`); j.close();
    const db = path.join(c.dir, 'dgvc.sqlite');
    if (fs.existsSync(db)) { const s = new SqliteStore(c.dir, { lockStaleMs: 0 }).open({ takeoverStaleLock: true }); assert.equal(s.fingerprint().sha256, fp.sha256, `vòng ${i}: dgvc.sqlite chưa kiểm chứng mà đã tồn tại`); s.close(); }
  }
  // chạy lại sau chuỗi sự cố
  try { fs.rmSync(path.join(c.dir, '.lock'), { force: true }); } catch { /* không có */ }
  const r = await migrateJsonToSqlite({ root: c.dir, backup: false });
  assert.equal(r.verified, true); assert.equal(r.report.verification.fingerprint, fp.sha256);
  const s = new SqliteStore(c.dir).open(); assert.equal(s.all('PHIEU_CAN').length, fp.perTable.PHIEU_CAN.rows); s.close();
});
