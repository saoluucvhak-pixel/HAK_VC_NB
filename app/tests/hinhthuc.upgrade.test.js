'use strict';
/** Nâng cấp kho cũ (chưa có bảng HINH_THUC_GIA): mở bằng mã mới → tự có bảng + 2 dòng mặc định; dữ liệu cũ nguyên vẹn; kỳ đã tính ra cùng số. JSON + SQLite. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { install, storageKinds, KETOAN, rid } = require('./install');
const { newStore } = require('../main/repo/createStore');
const { CatalogService } = require('../main/services/CatalogService');
const { PeriodService } = require('../main/services/PeriodService');

const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24' };
const snap = (k) => JSON.stringify({ results: k.results.map(({ priceId, trace, ...r }) => ({ ...r, trace: { ...trace, priceId: undefined } })), bkvc: k.bkvc });

for (const kind of storageKinds()) {
  test(`[${kind}] kho cũ chưa có bảng Hình thức giá: mở bằng mã mới tự có bảng + 2 dòng mặc định, kỳ cũ tính ra cùng số`, async () => {
    const c = await install('DH', { kind }); const dir = c.dir;
    const k1 = await c.periods.calculate({ contractId: c.contractId, ...W, clientRequestId: rid(), user: KETOAN });
    const before = snap(k1); const pid = k1.period.period_id;
    assert.equal(c.store.all('HINH_THUC_GIA').length, 0, 'kho dựng bằng bản cũ: chưa có dòng hình thức nào');
    const fp = c.store.fingerprint().sha256; c.store.close();
    if (kind === 'sqlite') { // giả lập kho SQLite của bản cũ: không có bảng
      const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(path.join(dir, 'dgvc.sqlite'));
      db.exec('DROP TABLE "HINH_THUC_GIA"'); db.exec("DELETE FROM \"_meta\" WHERE \"key\"='index_sig'"); db.close();
    }
    const s2 = newStore(dir, {}, kind).open();
    if (kind === 'sqlite') assert.ok(s2.schemaChanges.some((x) => x.includes('HINH_THUC_GIA')), JSON.stringify(s2.schemaChanges));
    assert.equal(s2.fingerprint().sha256, fp, 'dữ liệu cũ nguyên vẹn sau khi bổ sung bảng');
    assert.equal(s2.all('HINH_THUC_GIA').length, 0);
    // đúng như AppContext.open(): chạy nâng cấp hạt giống khi mở kho
    const cat = new CatalogService(s2); await cat.backfillCodeMethods({ user: { username: 'system' } });
    const l = cat.listForms(); assert.equal(l.total, 2);
    assert.deepEqual(l.items.map((x) => [x.methodCode, x.catalogDate, x.status, x.formName]), [['CO_DINH', '2000-01-01', 'ACTIVE', 'Đơn giá cố định'], ['THEO_DAU', '2000-01-01', 'ACTIVE', 'Đơn giá điều chỉnh theo giá dầu']]);
    assert.ok(l.items.every((x) => x.formulaText), 'công thức mô tả tự sinh');
    assert.equal(l.items.find((x) => x.methodCode === 'THEO_DAU').priceLineCount, 12, 'dòng giá cũ (cột price_method rỗng) tính là theo giá dầu');
    s2.close();
    // mở lần hai: không đổi cấu trúc, không nhân đôi hạt giống
    const s3 = newStore(dir, {}, kind).open(); if (kind === 'sqlite') assert.deepEqual(s3.schemaChanges, [], 'mở lần hai không còn gì để đổi');
    const cat3 = new CatalogService(s3); await cat3.backfillCodeMethods({ user: { username: 'system' } }); assert.equal(cat3.listForms().total, 2);
    const again = await new PeriodService(s3).calculate({ contractId: c.contractId, ...W, periodId: pid, clientRequestId: rid(), user: KETOAN });
    assert.equal(snap(again), before, 'kỳ cũ tính lại ra cùng số sau nâng cấp');
    s3.close();
  });
}
