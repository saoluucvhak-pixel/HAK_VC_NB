'use strict';
/** P2 (1.6.1): 4 lỗi sao lưu / khôi phục — bản monthly bị bỏ sót, 2 bản daily cùng lúc, khôi phục JSON giữa chừng làm hỏng kho, bản chép ngoài không được kiểm. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { install } = require('./install');
const { BackupService } = require('../main/services/BackupService');
const { newStore } = require('../main/repo/createStore');

const U = { username: 'admin', role: 'ADMIN' };
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `dgvc-bf-${p}-`));

async function machine(kind) {
  const ctx = await install('DH', { withData: false, kind });
  let day = new Date(2026, 8, 15, 9, 0, 0); // 15/09/2026 — KHÔNG phải ngày 1
  const clock = { set: (d) => { day = d; }, now: () => new Date(day) };
  const bs = new BackupService(ctx.store, { reopen: (root) => newStore(root, {}, kind).open(), now: clock.now });
  const setCfg = (k, v) => ctx.store.transaction((tx) => { const r = tx.get('CONFIG', k); if (r) tx.update('CONFIG', k, { config_value: String(v) }); else tx.insert('CONFIG', { config_key: k, config_value: String(v), value_type: 'TEXT', description: 'thử' }); }, { user: 'test' });
  const files = (k) => fs.readdirSync(path.join(ctx.store.root, 'backups', k)).filter((f) => f.endsWith('.zip')).sort();
  return { ctx, bs, clock, setCfg, files, kind };
}

for (const kind of ['json', 'sqlite']) {
  test(`[${kind}] LỖI 1: bản monthly tạo khi tháng hiện tại chưa có, bất kể ngày (không chỉ ngày 1)`, async () => {
    const m = await machine(kind);
    const first = await m.bs.autoDaily(); assert.equal(first.length, 2, 'ngày 15, tháng chưa có monthly → 1 daily + 1 monthly');
    assert.deepEqual(first.map((x) => x.kind).sort(), ['daily', 'monthly']);
    assert.equal((await m.bs.autoDaily()).length, 0, 'gọi lại cùng ngày → không tạo thêm');
    m.clock.set(new Date(2026, 8, 16, 9, 0, 0)); assert.equal((await m.bs.autoDaily()).length, 1, 'ngày khác cùng tháng: chỉ daily');
    m.clock.set(new Date(2026, 9, 20, 9, 0, 0)); const next = await m.bs.autoDaily(); assert.equal(next.length, 2, 'tháng sau (không mở app ngày 1) vẫn có monthly');
    assert.equal(m.files('monthly').length, 2); m.ctx.store.close();
  });

  test(`[${kind}] LỖI 2: gọi autoDaily() 5 lần song song → đúng 1 file daily; đã kiểm xong ngày thì không quét thư mục nữa`, async () => {
    const m = await machine(kind);
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => m.bs.autoDaily()));
    assert.equal(m.files('daily').length, 1); assert.equal(m.files('monthly').length, 1);
    assert.ok(rs.every((r) => r === rs[0] || r.length === rs[0].length), 'mọi lời gọi nhận cùng kết quả');
    const orig = fs.readdirSync; let n = 0; fs.readdirSync = (...a) => { n += 1; return orig(...a); };
    try { assert.deepEqual(await m.bs.autoDaily(), []); } finally { fs.readdirSync = orig; }
    assert.equal(n, 0, 'ngày đã kiểm xong → không readdirSync'); m.ctx.store.close();
  });

  test(`[${kind}] LỖI 4: bản chép ra ngoài bị ghi hỏng → báo lỗi SHA-256, không để lại file .zip/.part hỏng; xoay vòng BACKUP_MIRROR_KEEP`, async () => {
    const m = await machine(kind); const usb = tmp('usb');
    await m.setCfg('BACKUP_MIRROR_ENABLED', 'TRUE'); await m.setCfg('BACKUP_MIRROR_FOLDER', usb);
    const dir = path.join(usb, 'DGVC_BACKUP', 'DH');
    const orig = fs.copyFileSync;
    fs.copyFileSync = (a, b, ...r) => { orig(a, b, ...r); if (String(b).includes('DGVC_BACKUP')) fs.appendFileSync(b, 'HONG'); }; // giả lập ghi hỏng
    let bad; try { bad = await m.bs.backup({ kind: 'manual' }); } finally { fs.copyFileSync = orig; }
    assert.equal(bad.mirrored.ok, false); assert.match(bad.mirrored.message, /sai nội dung \(SHA-256\)/);
    assert.deepEqual(fs.existsSync(dir) ? fs.readdirSync(dir) : [], [], 'không còn file hỏng ở thư mục ngoài');
    assert.equal(m.bs.list().lastMirror.ok, false, 'màn Cài đặt lấy được trạng thái lần chép ngoài gần nhất');
    const good = await m.bs.backup({ kind: 'manual', note: 'tot' }); assert.equal(good.mirrored.ok, true);
    assert.equal(fs.readFileSync(good.mirrored.path).length, fs.readFileSync(good.file).length); assert.equal(m.bs.list().lastMirror.ok, true);
    // xoay vòng thư mục ngoài
    await m.setCfg('BACKUP_MIRROR_KEEP', 2);
    for (let i = 1; i <= 3; i += 1) { m.clock.set(new Date(2026, 8, 15, 10, i, 0)); await m.bs.backup({ kind: 'manual', note: `r${i}` }); }
    assert.equal(fs.readdirSync(dir).filter((f) => f.endsWith('.zip')).length, 2, 'giữ tối đa 2 bản ở thư mục ngoài');
    await m.setCfg('BACKUP_MIRROR_KEEP', 0);
    for (let i = 4; i <= 6; i += 1) { m.clock.set(new Date(2026, 8, 15, 10, i, 0)); await m.bs.backup({ kind: 'manual', note: `r${i}` }); }
    assert.equal(fs.readdirSync(dir).filter((f) => f.endsWith('.zip')).length, 5, '0 = không xóa'); m.ctx.store.close();
  });
}

test('LỖI 3: khôi phục kho JSON — thành công không để lại *.before-restore; lỗi ở bước mở lại / đổi tên → dữ liệu trước khôi phục còn nguyên, kho vẫn đọc/ghi được', async () => {
  const m = await machine('json'); const root = m.ctx.store.root;
  const mark = (id) => m.bs.store.transaction((tx) => { tx.insert('CONFIG', { config_key: id, config_value: '1', value_type: 'TEXT', description: 'dấu' }); }, { user: 'test' });
  await mark('MOC_TRUOC'); const snap = await m.bs.backup({ kind: 'manual', note: 'moc' });
  await mark('SAU_SAO_LUU'); // dữ liệu sau bản sao lưu — khôi phục thành công sẽ mất, thất bại phải còn
  // (a) mở lại bản khôi phục lỗi
  let calls = 0; const realReopen = m.bs.reopen;
  m.bs.reopen = (r) => { calls += 1; if (calls === 1) throw new Error('giả lập lỗi mở lại'); return realReopen(r); };
  await assert.rejects(m.bs.restore({ file: snap.file, reason: 'thử', user: U }), /giả lập lỗi mở lại/);
  assert.ok(m.bs.store.get('CONFIG', 'SAU_SAO_LUU'), 'dữ liệu trước khôi phục còn nguyên'); await mark('GHI_DUOC_SAU_LOI');
  assert.ok(m.bs.store.get('CONFIG', 'GHI_DUOC_SAU_LOI'), 'kho vẫn ghi được'); assert.ok(fs.existsSync(path.join(root, 'tables')));
  assert.deepEqual(fs.readdirSync(root).filter((f) => /before-restore|^restore-/.test(f)), [], 'không để rác');
  // (b) lỗi ở bước đổi tên thư mục tables mới vào chỗ
  const rn = fs.renameSync; m.bs.reopen = realReopen;
  fs.renameSync = (a, b) => { if (String(a).includes('restore-') && String(b).endsWith('tables')) throw new Error('giả lập lỗi đổi tên'); return rn(a, b); };
  try { await assert.rejects(m.bs.restore({ file: snap.file, reason: 'thử', user: U }), /giả lập lỗi đổi tên/); } finally { fs.renameSync = rn; }
  assert.ok(m.bs.store.get('CONFIG', 'SAU_SAO_LUU')); assert.ok(fs.existsSync(path.join(root, 'tables')));
  assert.deepEqual(fs.readdirSync(root).filter((f) => /before-restore|^restore-/.test(f)), []);
  // (c) khôi phục thành công
  const ok = await m.bs.restore({ file: snap.file, reason: 'thử', user: U });
  assert.ok(ok.store.get('CONFIG', 'MOC_TRUOC')); assert.ok(!ok.store.get('CONFIG', 'SAU_SAO_LUU'), 'dữ liệu sau bản sao lưu đã mất đúng như khôi phục');
  assert.deepEqual(fs.readdirSync(root).filter((f) => /before-restore|^restore-/.test(f)), [], 'xóa *.before-restore sau khi thành công'); ok.store.close();
});
