'use strict';
/**
 * Gỡ đơn giá RIÊNG của hợp đồng phải truyền sang nhà máy khác qua gói Danh mục: dòng không bị xóa cứng mà được ĐÓNG
 * (CLOSED, hiệu lực kết thúc trước ngày bắt đầu → không còn dòng nào khớp ngày nào), nên bên nhận cập nhật được.
 * Gỡ xong vẫn thêm lại được đúng ngày cũ, mã phiên bản không bị dùng lại.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { install, storageKinds, KETOAN } = require('./install');
const { CatalogService } = require('../main/services/CatalogService');
const { ExchangeService } = require('../main/services/ExchangeService');

const U = { username: 'ketoan' };
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-rmprice-'));
let n = 0;
const tick = () => new Promise((r) => setTimeout(r, 1100)); // dấu thời gian chính xác tới giây: các thao tác trên hai máy phải khác giây như ngoài đời

for (const kind of storageKinds()) {
  test(`[${kind}] gỡ đơn giá riêng của hợp đồng → gửi lại gói Danh mục → máy nhận không còn giá riêng hiệu lực; thêm lại cùng ngày được`, async () => {
    const a = await install('DH', { kind, withData: false, installId: `may-gui-${kind}` }); const b = await install('HAKQN', { kind, withData: false, installId: `may-nhan-${kind}` });
    const ca = new CatalogService(a.store); const cb = new CatalogService(b.store);
    await ca.backfillCodeMethods({ user: { username: 'system' } });
    const cid = a.contractId;
    const src = await ca.addCodeLine({ priceCode: 'PT-CD', record: { routeCode: 'VC.007', fixedPrice: 95500, effectiveFrom: '2026-01-01' }, user: KETOAN });
    await ca.activatePrice({ priceId: src.record.price_id, rowVersion: src.record.row_version, user: KETOAN });
    const add = await ca.addContractPrice({ contractId: cid, routeCode: 'VC.007', priceId: src.record.price_id, effectiveFrom: '2026-09-01', user: KETOAN });
    const pid = add.record.price_id;
    const send = async () => { const f = path.join(OUT, `dm-${kind}-${++n}.dgvcx`); const pkg = await new ExchangeService(a.store).exportPackage({ packageType: 'DANH_MUC', targetPath: f, user: U }); return pkg.file; };
    const take = async (file) => { const ex = new ExchangeService(b.store); const pv = ex.previewPackage({ filePath: file, user: U }); assert.ok(pv.canImport, JSON.stringify(pv.rejected || pv)); await ex.importPackage({ previewId: pv.previewId, user: U }); };
    const effective = (store) => store.find('PRICE_HISTORY', (p) => p.contract_id === cid && !p.price_code && p.status !== 'DRAFT' && p.effective_from <= '2026-09-20' && (!p.effective_to || p.effective_to >= '2026-09-20')).map((p) => p.price_id);
    await take(await send());
    assert.deepEqual(effective(b.store), [pid], 'máy nhận có giá riêng sau lần gửi đầu');
    // máy gửi gỡ đơn giá riêng rồi gửi lại
    await tick();
    const rm = await ca.removeContractPrice({ contractId: cid, priceId: pid, user: KETOAN });
    assert.equal(rm.removed, pid);
    const row = a.store.get('PRICE_HISTORY', pid); assert.ok(row, 'dòng không bị xóa cứng (để gói trao đổi mang được trạng thái đóng)');
    assert.equal(row.status, 'CLOSED'); assert.ok(row.effective_to < row.effective_from, 'hiệu lực kết thúc trước ngày bắt đầu → không khớp ngày nào');
    assert.deepEqual(effective(a.store), [], 'máy gửi: không còn giá riêng hiệu lực');
    await take(await send());
    assert.deepEqual(effective(b.store), [], 'máy nhận cũng không còn giá riêng hiệu lực sau khi gỡ');
    await tick();
    // thêm lại đúng ngày cũ: được (dùng lại chính dòng đã gỡ vì khóa duy nhất tuyến + hợp đồng + ngày) và truyền sang máy nhận
    const again = await ca.addContractPrice({ contractId: cid, routeCode: 'VC.007', priceId: src.record.price_id, effectiveFrom: '2026-09-01', user: KETOAN });
    assert.deepEqual(effective(a.store), [again.record.price_id]); assert.equal(again.record.status, 'ACTIVE');
    await take(await send()); assert.deepEqual(effective(b.store), [again.record.price_id], 'thêm lại cùng ngày → máy nhận cũng có lại giá riêng');
    // gỡ bản trước khi có bản mới hơn (đã voided) không bị chặn bởi dòng đã gỡ
    await ca.removeContractPrice({ contractId: cid, priceId: again.record.price_id, user: KETOAN });
    assert.deepEqual(effective(a.store), []);
    a.store.close(); b.store.close(); assert.ok(cb);
  });
}
