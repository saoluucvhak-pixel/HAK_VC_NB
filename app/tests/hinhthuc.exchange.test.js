'use strict';
/** Gói trao đổi Danh mục mang bảng HINH_THUC_GIA: thêm dòng / gỡ dòng ở máy gửi → máy nhận đọc lại đúng; gói cũ không có bảng này nhập không lỗi. JSON + SQLite. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { install, storageKinds, KETOAN } = require('./install');
const { CatalogService } = require('../main/services/CatalogService');
const { ExchangeService, canon } = require('../main/services/ExchangeService');

const U = { username: 'ketoan' }; const SYS = { username: 'system' };
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-hinhthuc-'));
let n = 0;
const tick = () => new Promise((r) => setTimeout(r, 1100));
const view = (store, m) => new CatalogService(store).listForms({ methodCode: m }).items.map((x) => [x.formId, x.catalogDate, x.effectiveTo, x.status, x.formulaText].join('|'));

for (const kind of storageKinds()) {
  test(`[${kind}] gói Danh mục mang Hình thức giá: thêm dòng mới (đóng dòng cũ), gỡ dòng, thêm lại — máy nhận khớp máy gửi`, async () => {
    const a = await install('DH', { kind, withData: false, installId: `ht-gui-${kind}` }); const b = await install('HAKQN', { kind, withData: false, installId: `ht-nhan-${kind}` });
    const ca = new CatalogService(a.store); const cb = new CatalogService(b.store);
    await ca.backfillCodeMethods({ user: SYS });
    const send = async () => { const pkg = await new ExchangeService(a.store).exportPackage({ packageType: 'DANH_MUC', targetPath: path.join(OUT, `dm-${kind}-${++n}.dgvcx`), user: U }); return pkg; };
    const take = async (file) => { const ex = new ExchangeService(b.store); const pv = ex.previewPackage({ filePath: file, user: U }); assert.ok(pv.canImport, JSON.stringify(pv.rejected || pv)); assert.equal(pv.conflicts.length, 0, JSON.stringify(pv.conflicts)); return ex.importPackage({ previewId: pv.previewId, user: U }); };
    // gói đầu: chỉ 2 dòng hạt giống; máy nhận chưa chạy hạt giống (bản vừa cài) → nhận được cả 2 dòng
    assert.equal(cb.listForms().total, 0);
    const p1 = await send(); assert.equal(p1.counts.HINH_THUC_GIA, 2, JSON.stringify(p1.counts));
    await take(p1.file);
    assert.deepEqual(view(b.store, 'CO_DINH'), view(a.store, 'CO_DINH')); assert.equal(cb.listForms().total, 2);
    // máy nhận tự chạy hạt giống khi mở: đã có dòng → không nhân đôi
    await cb.backfillCodeMethods({ user: SYS }); assert.equal(cb.listForms().total, 2);
    await tick();
    // máy gửi thêm dòng mới cùng mã → đóng dòng cũ; máy nhận đọc lại đúng
    await ca.saveForm({ create: true, record: { methodCode: 'CO_DINH', catalogDate: '2026-12-01', formulaText: 'Công thức v2' }, user: KETOAN });
    const p2 = await send(); await take(p2.file);
    assert.deepEqual(view(b.store, 'CO_DINH'), view(a.store, 'CO_DINH'));
    assert.deepEqual(view(b.store, 'CO_DINH').map((x) => x.split('|').slice(1, 4).join('|')), ['2026-12-01||ACTIVE', '2000-01-01|2026-11-30|CLOSED']);
    assert.deepEqual(view(b.store, 'THEO_DAU'), view(a.store, 'THEO_DAU'), 'mã khác không đổi');
    await tick();
    // gỡ dòng mới nhất → máy nhận cũng không còn dòng đó, dòng cũ mở lại
    const newest = ca.listForms({ methodCode: 'CO_DINH' }).items[0];
    await ca.removeForm({ formId: newest.formId, user: KETOAN });
    await take((await send()).file);
    assert.deepEqual(view(b.store, 'CO_DINH'), view(a.store, 'CO_DINH'));
    assert.equal(cb.listForms({ methodCode: 'CO_DINH' }).total, 1); assert.equal(cb.listForms({ methodCode: 'CO_DINH' }).items[0].status, 'ACTIVE');
    await tick();
    // thêm lại cùng ngày → truyền sang
    await ca.saveForm({ create: true, record: { methodCode: 'CO_DINH', catalogDate: '2026-12-01', formulaText: 'Lại' }, user: KETOAN });
    await take((await send()).file);
    assert.deepEqual(view(b.store, 'CO_DINH'), view(a.store, 'CO_DINH')); assert.equal(cb.listForms({ methodCode: 'CO_DINH' }).items[0].formulaText, 'Lại');
    a.store.close(); b.store.close();
  });

  test(`[${kind}] máy nhận chạy hạt giống SAU máy gửi thêm dòng mới: nhập gói không báo xung đột, không có hai dòng cùng hiệu lực`, async () => {
    const a = await install('DH', { kind, withData: false, installId: `ht2-gui-${kind}` }); const b = await install('HAKQN', { kind, withData: false, installId: `ht2-nhan-${kind}` });
    const ca = new CatalogService(a.store); const cb = new CatalogService(b.store);
    await ca.backfillCodeMethods({ user: SYS });
    await ca.saveForm({ create: true, record: { methodCode: 'THEO_DAU', catalogDate: '2026-12-01' }, user: KETOAN });
    await tick(); await cb.backfillCodeMethods({ user: SYS }); // dòng hạt giống của máy nhận mới hơn dòng đóng của máy gửi
    const pkg = await new ExchangeService(a.store).exportPackage({ packageType: 'DANH_MUC', targetPath: path.join(OUT, `dm-${kind}-${++n}.dgvcx`), user: U });
    const ex = new ExchangeService(b.store); const pv = ex.previewPackage({ filePath: pkg.file, user: U }); assert.ok(pv.canImport, JSON.stringify(pv));
    assert.equal(pv.conflicts.length, 0, JSON.stringify(pv.conflicts));
    await ex.importPackage({ previewId: pv.previewId, user: U });
    assert.deepEqual(view(b.store, 'THEO_DAU'), view(a.store, 'THEO_DAU'));
    assert.equal(cb.listForms({ methodCode: 'THEO_DAU', includeClosed: false }).total, 1, 'chỉ một dòng đang hiệu lực');
    a.store.close(); b.store.close();
  });

  test(`[${kind}] gói Danh mục cũ (không có bảng HINH_THUC_GIA) nhập vào không lỗi và không đổi Hình thức giá của máy nhận`, async () => {
    const a = await install('DH', { kind, withData: false, installId: `ht3-gui-${kind}` }); const b = await install('HAKQN', { kind, withData: false, installId: `ht3-nhan-${kind}` });
    await new CatalogService(b.store).backfillCodeMethods({ user: SYS });
    const before = view(b.store, 'CO_DINH').concat(view(b.store, 'THEO_DAU'));
    const pkg = await new ExchangeService(a.store).exportPackage({ packageType: 'DANH_MUC', targetPath: path.join(OUT, `dm-${kind}-${++n}.dgvcx`), user: U });
    const body = JSON.parse(zlib.gunzipSync(fs.readFileSync(pkg.file)).toString('utf8')); assert.ok(body.tables.HINH_THUC_GIA === undefined || Array.isArray(body.tables.HINH_THUC_GIA));
    delete body.tables.HINH_THUC_GIA; body.contentSha256 = crypto.createHash('sha256').update(canon(body.tables)).digest('hex');
    const old = path.join(OUT, `cu-${kind}-${++n}.dgvcx`); fs.writeFileSync(old, zlib.gzipSync(JSON.stringify(body)));
    const ex = new ExchangeService(b.store); const pv = ex.previewPackage({ filePath: old, user: U }); assert.ok(pv.canImport, JSON.stringify(pv.rejected || pv));
    await ex.importPackage({ previewId: pv.previewId, user: U });
    assert.deepEqual(view(b.store, 'CO_DINH').concat(view(b.store, 'THEO_DAU')), before);
    a.store.close(); b.store.close();
  });
}
