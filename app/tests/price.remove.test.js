'use strict';
/** Xóa dòng đơn giá dùng chung ở Danh mục Đơn giá (prices.remove): nháp xóa hẳn; đã kích hoạt chưa dùng → đóng dòng, mở lại bản trước, truyền được sang máy khác; đã dùng → E_PRICE_USED. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { install, storageKinds, KETOAN } = require('./install');
const { CatalogService } = require('../main/services/CatalogService');

const rejects = (p, code) => assert.rejects(p, (e) => e.code === code || (e.details && e.details.code === code), `phải lỗi ${code}`);
for (const kind of storageKinds()) {
  test(`[${kind}] prices.remove: nháp xóa hẳn; kích hoạt chưa dùng → đóng + mở lại bản trước; không xóa giá riêng hợp đồng; xóa lần hai báo NOT_FOUND`, async () => {
    const { store } = await install('DH', { kind, withData: false });
    const cat = new CatalogService(store); await cat.backfillCodeMethods({ user: { username: 'system' } });
    const mk = async (from, price) => { const r = await cat.addCodeLine({ priceCode: 'PT-CD', record: { routeCode: 'VC.007', fixedPrice: price, effectiveFrom: from }, user: KETOAN }); return r.record; };
    const v1 = await mk('2026-01-01', 90000); const a1 = await cat.activatePrice({ priceId: v1.price_id, rowVersion: v1.row_version, user: KETOAN });
    const v2 = await mk('2026-06-01', 95000);
    // nháp: xóa hẳn
    const rm = await cat.removePriceLine({ priceId: v2.price_id, user: KETOAN }); assert.equal(rm.wasDraft, true); assert.ok(!store.get('PRICE_HISTORY', v2.price_id));
    // kích hoạt v2 rồi xóa: đóng dòng + mở lại v1
    const v3 = await mk('2026-06-01', 96000); await cat.activatePrice({ priceId: v3.price_id, rowVersion: v3.row_version, user: KETOAN });
    assert.equal(store.get('PRICE_HISTORY', v1.price_id).status, 'CLOSED');
    const rm2 = await cat.removePriceLine({ priceId: v3.price_id, user: KETOAN });
    assert.equal(rm2.wasDraft, false); assert.deepEqual(rm2.reopened, [v1.price_id]);
    const gone = store.get('PRICE_HISTORY', v3.price_id); assert.equal(gone.status, 'CLOSED'); assert.ok(gone.effective_to < gone.effective_from);
    const back = store.get('PRICE_HISTORY', v1.price_id); assert.equal(back.status, 'ACTIVE'); assert.equal(back.effective_to, '');
    await rejects(cat.removePriceLine({ priceId: v3.price_id, user: KETOAN }), 'NOT_FOUND');
    // bản cũ không phải mới nhất: thêm bản 2026-09-01 rồi thử xóa bản 2026-01-01
    const v4 = await mk('2026-09-01', 97000); await cat.activatePrice({ priceId: v4.price_id, rowVersion: v4.row_version, user: KETOAN });
    await rejects(cat.removePriceLine({ priceId: v1.price_id, user: KETOAN }), 'E_PRICE_USED');
    // đã dùng → từ chối
    await store.transaction((tx) => tx.update('PRICE_HISTORY', v4.price_id, { is_used: true }), { user: 'test' });
    await rejects(cat.removePriceLine({ priceId: v4.price_id, user: KETOAN }), 'E_PRICE_USED');
    await rejects(cat.removePriceLine({ priceId: 'KHONG-CO', user: KETOAN }), 'NOT_FOUND');
    store.close();
  });

  test(`[${kind}] prices.remove rồi thêm lại ĐÚNG ngày cũ được (dùng lại dòng đã xóa, không vướng khóa duy nhất)`, async () => {
    const { store } = await install('DH', { kind, withData: false });
    const cat = new CatalogService(store); await cat.backfillCodeMethods({ user: { username: 'system' } });
    const mk = async (from, price) => (await cat.addCodeLine({ priceCode: 'PT-CD', record: { routeCode: 'VC.007', fixedPrice: price, effectiveFrom: from }, user: KETOAN })).record;
    const a = await mk('2026-03-01', 91000); await cat.activatePrice({ priceId: a.price_id, rowVersion: a.row_version, user: KETOAN });
    await cat.removePriceLine({ priceId: a.price_id, user: KETOAN });
    const again = await mk('2026-03-01', 92000); // trước đây: VALIDATION_FAILED trùng khóa (tuyến + hợp đồng + mã + ngày)
    assert.equal(again.price_id, a.price_id, 'dùng lại chính dòng đã xóa'); assert.equal(again.status, 'DRAFT'); assert.equal(again.fixed_price, 92000);
    const on = await cat.activatePrice({ priceId: again.price_id, rowVersion: again.row_version, user: KETOAN }); assert.ok(on);
    assert.equal(store.get('PRICE_HISTORY', a.price_id).status, 'ACTIVE');
    store.close();
  });
}
