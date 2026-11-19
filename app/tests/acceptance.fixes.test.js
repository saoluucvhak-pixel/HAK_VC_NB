'use strict';
/**
 * Rà soát nghiệm thu 1.5.1 — lỗi xác nhận và ca hồi quy:
 *  1) Tiền gõ "150.000" (dấu chấm ngăn cách nghìn) bị hiểu thành 150 (sai 1.000 lần) → nay hiểu đúng 150000; số quá nhỏ / quá lớn bị chặn; tên / ghi chú mã có giới hạn độ dài.
 *  2) Xuất JSON gửi máy khác từ kho SQLite ĐÓNG kho đang dùng → mọi thao tác đang chạy lỗi "Kho dữ liệu chưa mở" → nay xuất từ ảnh chụp, không đóng kho.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { install, KETOAN } = require('./install');
const { CatalogService } = require('../main/services/CatalogService');
const { AppContext } = require('../main/app/AppContext');

test('Tiền kiểu Việt "150.000" = 150000; "150" / "150,5" bị chặn vì quá nhỏ; 1e30 bị chặn; tên mã ≤ 120 ký tự', async () => {
  const { store, contractId } = await install('HAKQN', { withData: false }); const cat = new CatalogService(store);
  const unit = store.get('HOP_DONG', contractId).customer_unit_code;
  await cat.savePriceCode({ create: true, record: { priceCode: 'DG-T', unitCode: unit, priceName: 'thử' }, user: KETOAN });
  const add = (fixedPrice, effectiveFrom) => cat.addCodeLine({ priceCode: 'DG-T', record: { routeCode: 'VC.007', fixedPrice, effectiveFrom }, user: KETOAN });
  assert.equal((await add('150.000', '2026-01-01')).record.fixed_price, 150000);
  assert.equal((await add(' 151 000 ', '2026-02-01')).record.fixed_price, 151000);
  assert.equal((await add('152000', '2026-03-01')).record.fixed_price, 152000);
  assert.equal((await add(153000, '2026-04-01')).record.fixed_price, 153000);
  await assert.rejects(add(150, '2026-05-01'), /quá nhỏ/); await assert.rejects(add('150,5', '2026-05-01'), /quá nhỏ/);
  await assert.rejects(add(1e30, '2026-05-01'), /quá lớn/); await assert.rejects(add('abc', '2026-05-01'), /phải > 0/);
  await assert.rejects(cat.savePriceCode({ create: true, record: { priceCode: 'DG-L', unitCode: unit, priceName: 'Đ'.repeat(121) }, user: KETOAN }), /tối đa 120/);
});

test('Xuất JSON gửi máy khác từ kho SQLite KHÔNG đóng kho: ghi đồng thời vẫn chạy bình thường, file xuất đủ và nhất quán', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-acc-'));
  const ctx = new AppContext({ configFile: path.join(home, 'u', 'c.json'), documentsDir: home }); await ctx.init({ mode: 'NEW', dataFolder: path.join(home, 'D'), unitCode: 'DH' });
  assert.equal(ctx.store.storageKind, 'sqlite');
  let stop = false; let n = 0; const errs = [];
  const writer = (async () => { while (!stop) { try { await ctx.store.transaction((tx) => { tx.audit('W_A', 'X', String(++n)); tx.audit('W_B', 'X', String(n)); }, { user: 'w' }); } catch (e) { errs.push(e.message); } await new Promise((r) => setImmediate(r)); } })();
  const files = []; for (let i = 0; i < 3; i++) { const f = path.join(home, `share${i}.zip`); await ctx.exportJsonShare({ file: f, user: { username: 'admin' } }); files.push(f); }
  stop = true; await writer;
  assert.deepEqual(errs, [], 'không thao tác nào bị lỗi trong lúc xuất'); assert.ok(n >= 1, 'ghi đồng thời có chạy');
  for (const f of files) {
    const z = new AdmZip(f); assert.ok(z.getEntry('manifest.json') && z.getEntry('snapshot-info.json'));
    const chk = ctx.svc.backup.inspect({ file: f }); assert.equal(chk.storageFormat, 'json'); assert.equal(chk.canRestore, true);
  }
  assert.equal(ctx.store.storageKind, 'sqlite'); ctx.close();
});
