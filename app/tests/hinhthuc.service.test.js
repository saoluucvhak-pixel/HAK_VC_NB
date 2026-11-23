'use strict';
/** Danh mục Hình thức giá (HINH_THUC_GIA): hạt giống, thêm dòng mới đóng dòng cũ, chặn điền lùi, công thức chỉ mô tả (không đổi kết quả tính),
 *  xóa (= đóng dòng), danh mục đơn giá phẳng, đơn giá theo tuyến, quyền qua Router. Chạy trên JSON và SQLite (DGVC_STORAGE). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { install, storageKinds, KETOAN, rid } = require('./install');
const { CatalogService } = require('../main/services/CatalogService');
const { Router } = require('../main/api/router');

const U = KETOAN;
const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24' };
const snap = (k) => JSON.stringify({ results: k.results.map(({ priceId, trace, ...r }) => ({ ...r, trace: { ...trace, priceId: undefined } })), bkvc: k.bkvc });

async function setup(kind) {
  const ctx = await install('DH', { kind }); const cat = new CatalogService(ctx.store);
  await cat.backfillCodeMethods({ user: { username: 'system' } });
  return { ...ctx, cat };
}
const fixedLine = async (s, record = {}) => {
  const l = await s.cat.addCodeLine({ priceCode: 'PT-CD', record: { routeCode: 'VC.007', fixedPrice: 95500, effectiveFrom: '2026-02-01', ...record }, user: U });
  await s.cat.activatePrice({ priceId: l.record.price_id, rowVersion: l.record.row_version, user: U });
  return l;
};

for (const kind of storageKinds()) {
  const T = (name, fn) => test(`[${kind}] ${name}`, () => fn(kind));

  T('hạt giống: mở kho có đúng 2 hình thức mặc định ngày 2000-01-01, mở lại không nhân đôi', async (k) => {
    const s = await setup(k);
    const l = s.cat.listForms();
    assert.equal(l.total, 2);
    assert.deepEqual(l.items.map((x) => x.methodCode), ['CO_DINH', 'THEO_DAU']);
    const cd = l.items[0]; const td = l.items[1];
    assert.equal(cd.formName, 'Đơn giá cố định'); assert.equal(td.formName, 'Đơn giá điều chỉnh theo giá dầu');
    assert.ok(cd.formulaText && td.formulaText && cd.formulaText !== td.formulaText);
    assert.equal(cd.catalogDate, '2000-01-01'); assert.equal(cd.status, 'ACTIVE'); assert.equal(cd.effectiveTo, '');
    assert.ok(Number.isInteger(cd.rowVersion));
    await s.cat.ensureDefaultForms(); await s.cat.backfillCodeMethods({ user: { username: 'system' } });
    assert.equal(s.cat.listForms().total, 2, 'gọi lại không thêm dòng');
    assert.ok(s.store.find('AUDIT_LOG', (a) => a.entity_type === 'HINH_THUC_GIA' || a.table_name === 'HINH_THUC_GIA' || JSON.stringify(a).includes('HINH_THUC_GIA')).length >= 1, 'hạt giống có audit');
    s.store.close();
  });

  T('thêm hình thức mới cùng mã, ngày mới → dòng cũ tự đóng (ngày mới − 1) trong một giao dịch', async (k) => {
    const s = await setup(k);
    const r = await s.cat.saveForm({ create: true, record: { methodCode: 'CO_DINH', catalogDate: '2026-12-01', formulaText: 'Mô tả mới', note: 'ghi chú' }, user: U });
    assert.equal(r.record.status, 'ACTIVE'); assert.equal(r.record.catalogDate, '2026-12-01'); assert.equal(r.record.formulaText, 'Mô tả mới'); assert.equal(r.record.formName, 'Đơn giá cố định');
    const items = s.cat.listForms().items.filter((x) => x.methodCode === 'CO_DINH');
    assert.deepEqual(items.map((x) => x.catalogDate), ['2026-12-01', '2000-01-01'], 'sắp ngày giảm dần');
    const old = items[1]; assert.equal(old.status, 'CLOSED'); assert.equal(old.effectiveTo, '2026-11-30');
    assert.equal(s.cat.listForms().items.filter((x) => x.methodCode === 'THEO_DAU').length, 1, 'mã khác không bị ảnh hưởng');
    assert.equal(s.cat.listForms().items.find((x) => x.methodCode === 'THEO_DAU').status, 'ACTIVE');
    assert.ok(Array.isArray(r.warnings));
    s.store.close();
  });

  T('chặn điền lùi / cùng ngày; ngày sai định dạng; mã hình thức lạ; sửa thiếu rowVersion', async (k) => {
    const s = await setup(k);
    await s.cat.saveForm({ create: true, record: { methodCode: 'THEO_DAU', catalogDate: '2026-06-01' }, user: U });
    const bad = (rec, re) => assert.rejects(() => s.cat.saveForm({ create: true, record: rec, user: U }), (e) => e.code === 'VALIDATION_FAILED' && (!re || re.test(e.message)));
    await bad({ methodCode: 'THEO_DAU', catalogDate: '2026-05-31' }, /lùi|sau/i);
    await bad({ methodCode: 'THEO_DAU', catalogDate: '2026-06-01' }, /sau/i);
    await bad({ methodCode: 'THEO_DAU', catalogDate: '01/12/2026' });
    await bad({ methodCode: 'KHAC', catalogDate: '2026-12-01' });
    await bad({ catalogDate: '2026-12-01' });
    const cur = s.cat.listForms().items.find((x) => x.methodCode === 'THEO_DAU' && x.status === 'ACTIVE');
    await assert.rejects(() => s.cat.saveForm({ record: { formId: cur.formId, formName: 'Tên khác' }, user: U }), (e) => e.code === 'VALIDATION_FAILED');
    await assert.rejects(() => s.cat.saveForm({ record: { formId: cur.formId, formName: 'Tên khác' }, rowVersion: cur.rowVersion + 5, user: U }), (e) => e.code === 'CONFLICT_VERSION');
    s.store.close();
  });

  T('sửa mô tả: giữ mã + ngày, đổi mã/ngày bị từ chối; rowVersion tăng', async (k) => {
    const s = await setup(k);
    const cur = s.cat.listForms().items.find((x) => x.methodCode === 'CO_DINH');
    const r = await s.cat.saveForm({ record: { formId: cur.formId, formName: 'Cố định (sửa)', formulaText: 'Công thức mô tả sửa', note: 'n' }, rowVersion: cur.rowVersion, user: U });
    assert.equal(r.record.formName, 'Cố định (sửa)'); assert.equal(r.record.formulaText, 'Công thức mô tả sửa'); assert.equal(r.record.rowVersion, cur.rowVersion + 1);
    await assert.rejects(() => s.cat.saveForm({ record: { formId: cur.formId, methodCode: 'THEO_DAU' }, rowVersion: r.record.rowVersion, user: U }), (e) => e.code === 'VALIDATION_FAILED');
    await assert.rejects(() => s.cat.saveForm({ record: { formId: cur.formId, catalogDate: '2001-01-01' }, rowVersion: r.record.rowVersion, user: U }), (e) => e.code === 'VALIDATION_FAILED');
    await assert.rejects(() => s.cat.saveForm({ record: { formId: 'HT-KHONG-CO' }, rowVersion: 1, user: U }), (e) => e.code === 'NOT_FOUND');
    s.store.close();
  });

  T('nhắc sửa giống nhà máy khác khi thêm / sửa / xóa hình thức', async (k) => {
    const s = await setup(k);
    const before = s.store.all('SYNC_REMINDER').length;
    const r = await s.cat.saveForm({ create: true, record: { methodCode: 'CO_DINH', catalogDate: '2026-12-01' }, user: U });
    assert.ok(s.store.all('SYNC_REMINDER').length > before, 'có dòng nhắc'); assert.ok(r.warnings.some((w) => w.code === 'I_SYNC_REMINDER'));
    assert.ok(s.store.all('SYNC_REMINDER').some((x) => x.entity === 'HINH_THUC_GIA'));
    s.store.close();
  });

  T('công thức chỉ mô tả: thêm / sửa hình thức không đổi kết quả tính của kỳ mẫu', async (k) => {
    const s = await setup(k);
    const a = await s.periods.calculate({ contractId: s.contractId, ...W, clientRequestId: rid(), user: U });
    const pid = a.period.period_id; const before = snap(a);
    await s.cat.saveForm({ create: true, record: { methodCode: 'THEO_DAU', catalogDate: '2026-01-01', formulaText: 'Công thức hoàn toàn khác: đơn giá = 1 đồng' }, user: U });
    await s.cat.saveForm({ create: true, record: { methodCode: 'CO_DINH', catalogDate: '2026-01-01', formulaText: 'Cố định = 0' }, user: U });
    const b = await s.periods.calculate({ contractId: s.contractId, ...W, periodId: pid, clientRequestId: rid(), user: U });
    assert.equal(snap(b), before, 'kỳ tính lại sau khi đổi hình thức ra đúng từng số');
    assert.equal(b.results[0].transportPrice, a.results[0].transportPrice);
    s.store.close();
  });

  T('xóa hình thức chưa dùng = đóng dòng (không xóa cứng), mở lại dòng trước, thêm lại cùng ngày được', async (k) => {
    const s = await setup(k);
    const n = await s.cat.saveForm({ create: true, record: { methodCode: 'CO_DINH', catalogDate: '2027-01-01' }, user: U });
    const rm = await s.cat.removeForm({ formId: n.record.formId, user: U });
    assert.equal(rm.removed, n.record.formId); assert.ok(rm.reopened.length === 1);
    const row = s.store.get('HINH_THUC_GIA', n.record.formId); assert.ok(row, 'không xóa cứng (gói trao đổi chỉ upsert)');
    assert.equal(row.status, 'CLOSED'); assert.ok(row.effective_to < row.catalog_date);
    assert.deepEqual(s.cat.listForms().items.map((x) => x.formId).includes(n.record.formId), false, 'dòng đã gỡ không hiện');
    const cur = s.cat.listForms().items.filter((x) => x.methodCode === 'CO_DINH');
    assert.equal(cur.length, 1); assert.equal(cur[0].status, 'ACTIVE'); assert.equal(cur[0].effectiveTo, '');
    assert.throws(() => s.cat.getForm({ formId: n.record.formId }), (e) => e.code === 'NOT_FOUND');
    const again = await s.cat.saveForm({ create: true, record: { methodCode: 'CO_DINH', catalogDate: '2027-01-01', formulaText: 'Lại' }, user: U });
    assert.equal(again.record.status, 'ACTIVE'); assert.equal(again.record.formulaText, 'Lại');
    s.store.close();
  });

  T('xóa hình thức đang có đơn giá dùng → lỗi nghiệp vụ kèm hướng dẫn; dòng duy nhất của mã không xóa được', async (k) => {
    const s = await setup(k);
    await fixedLine(s); // dòng cố định hiệu lực 2026-02-01
    const n = await s.cat.saveForm({ create: true, record: { methodCode: 'CO_DINH', catalogDate: '2026-01-01' }, user: U });
    const g = s.cat.getForm({ formId: n.record.formId });
    assert.equal(g.lines.length, 1); assert.equal(g.lines[0].methodCode, 'CO_DINH'); assert.equal(g.record.priceLineCount, 1);
    await assert.rejects(() => s.cat.removeForm({ formId: n.record.formId, user: U }), (e) => e.code === 'BUSINESS_RULE' && e.details && e.details.code === 'E_FORM_IN_USE' && /Đơn giá|thêm|dòng mới/.test(e.message));
    assert.equal(s.store.get('HINH_THUC_GIA', n.record.formId).status, 'ACTIVE', 'không đổi gì');
    // THEO_DAU chỉ còn dòng hạt giống, đang có 12 dòng giá mẫu → đang dùng
    const td = s.cat.listForms().items.find((x) => x.methodCode === 'THEO_DAU');
    await assert.rejects(() => s.cat.removeForm({ formId: td.formId, user: U }), (e) => e.details && e.details.code === 'E_FORM_IN_USE');
    // dòng cũ (đã đóng) không phải bản mới nhất → xóa bản mới nhất trước
    const old = s.cat.listForms().items.find((x) => x.methodCode === 'CO_DINH' && x.status === 'CLOSED');
    await assert.rejects(() => s.cat.removeForm({ formId: old.formId, user: U }), (e) => e.code === 'BUSINESS_RULE');
    s.store.close();
  });

  T('priceCatalog: danh mục phẳng, lọc theo tuyến / hình thức / trạng thái; kèm hình thức + công thức', async (k) => {
    const s = await setup(k);
    await fixedLine(s);
    const all = s.cat.priceCatalog();
    assert.equal(all.total, 13); assert.equal(all.items.length, 13);
    const row = all.items.find((x) => x.routeCode === 'VC.007' && x.methodCode === 'CO_DINH');
    assert.ok(row);
    for (const f of ['updateDate', 'priceId', 'routeCode', 'routeName', 'methodCode', 'formName', 'formulaText', 'price', 'effectiveFrom', 'effectiveTo', 'status', 'isUsed', 'priceCode']) assert.ok(f in row, `thiếu ${f}`);
    assert.equal(row.updateDate, '2026-02-01'); assert.equal(row.price, 95500); assert.equal(row.priceCode, 'PT-CD'); assert.equal(row.formName, 'Đơn giá cố định'); assert.ok(row.formulaText);
    const r7 = s.cat.priceCatalog({ routeCode: 'VC.007' });
    assert.ok(r7.items.length === 2 && r7.items.every((x) => x.routeCode === 'VC.007'));
    assert.deepEqual(s.cat.priceCatalog({ methodCode: 'CO_DINH' }).items.map((x) => x.priceId), [row.priceId]);
    const td = s.cat.priceCatalog({ methodCode: 'THEO_DAU' }); assert.equal(td.total, 12);
    assert.ok(td.items.every((x) => x.methodCode === 'THEO_DAU' && x.formName === 'Đơn giá điều chỉnh theo giá dầu' && x.price > 0));
    assert.equal(s.cat.priceCatalog({ status: 'DRAFT' }).total, 0);
    assert.equal(s.cat.priceCatalog({ routeCode: 'VC.007', methodCode: 'CO_DINH', status: 'ACTIVE' }).total, 1);
    // hình thức có hiệu lực tại effective_from: thêm dòng THEO_DAU 2025-12-01 → dòng giá 2025-07-10 vẫn thấy dòng hạt giống, dòng 2026 thấy dòng mới
    await s.cat.saveForm({ create: true, record: { methodCode: 'CO_DINH', catalogDate: '2026-03-01', formName: 'Cố định v2', formulaText: 'v2' }, user: U });
    assert.equal(s.cat.priceCatalog({ methodCode: 'CO_DINH' }).items[0].formName, 'Đơn giá cố định', 'dòng giá 2026-02-01 còn thuộc hình thức hiệu lực tại ngày đó');
    s.store.close();
  });

  T('priceCatalog không đưa dòng riêng đã gỡ; routePriceLines theo tuyến', async (k) => {
    const s = await setup(k);
    const src = await fixedLine(s);
    const add = await s.cat.addContractPrice({ contractId: s.contractId, routeCode: 'VC.007', priceId: src.record.price_id, effectiveFrom: '2026-09-01', user: U });
    const withOwn = s.cat.priceCatalog({ routeCode: 'VC.007' });
    assert.ok(withOwn.items.some((x) => x.priceId === add.record.price_id && x.contractId === s.contractId));
    await s.cat.removeContractPrice({ contractId: s.contractId, priceId: add.record.price_id, user: U });
    assert.ok(!s.cat.priceCatalog({ routeCode: 'VC.007' }).items.some((x) => x.priceId === add.record.price_id), 'dòng đã gỡ bị ẩn');
    const pl = s.cat.routePriceLines({ routeCode: 'VC.007' });
    assert.equal(pl.route.routeCode, 'VC.007'); assert.ok(pl.route.routeName);
    assert.ok(pl.items.length === 2 && pl.items.every((x) => x.routeCode === 'VC.007' && x.formName));
    assert.equal(pl.total, pl.items.length);
    assert.throws(() => s.cat.routePriceLines({ routeCode: 'VC.999' }), (e) => e.code === 'NOT_FOUND');
    s.store.close();
  });

  T('Router: forms.* và prices.catalog / routes.priceLines — đọc mọi vai trò, ghi ADMIN/KẾ TOÁN', async (k) => {
    const s = await setup(k);
    let role = 'XEM';
    const ctx = { store: s.store, svc: { catalog: s.cat, auth: { check: () => ({ user: { username: 'u', role } }) }, backup: { autoDaily: () => Promise.resolve() }, archive: null } };
    const r = new Router(ctx);
    const l = await r.handle('forms.list', {}, 't'); assert.equal(l.ok, true); assert.equal(l.data.items.length, 2);
    const id = l.data.items[0].formId;
    assert.equal((await r.handle('forms.get', { formId: id }, 't')).ok, true);
    assert.equal((await r.handle('prices.catalog', { routeCode: 'VC.007' }, 't')).ok, true);
    assert.equal((await r.handle('routes.priceLines', { routeCode: 'VC.007' }, 't')).ok, true);
    for (const [a, p] of [['forms.save', { create: true, record: { methodCode: 'CO_DINH', catalogDate: '2026-12-01' } }], ['forms.remove', { formId: id }]]) {
      const x = await r.handle(a, p, 't'); assert.equal(x.ok, false); assert.equal(x.error.code, 'FORBIDDEN', a);
    }
    role = 'KE_TOAN';
    const w = await r.handle('forms.save', { create: true, record: { methodCode: 'CO_DINH', catalogDate: '2026-12-01' } }, 't'); assert.equal(w.ok, true, JSON.stringify(w.error));
    assert.equal(w.data.record.methodCode, 'CO_DINH');
    role = 'ADMIN';
    const rm = await r.handle('forms.remove', { formId: w.data.record.formId }, 't'); assert.equal(rm.ok, true, JSON.stringify(rm.error));
    // lệnh đọc tự có hạt giống kể cả khi kho chưa chạy backfill
    s.store.close();
  });

  T('Router forms.list trên kho chưa chạy hạt giống: tự có 2 dòng mặc định (ghi có audit, chỉ một lần)', async (k) => {
    const ctx0 = await install('DH', { kind: k, withData: false }); const cat = new CatalogService(ctx0.store);
    assert.equal(cat.listForms().total, 0); assert.equal(cat.formsSeeded(), false);
    const r = new Router({ store: ctx0.store, svc: { catalog: cat, auth: { check: () => ({ user: { username: 'u', role: 'XEM' } }) }, backup: { autoDaily: () => Promise.resolve() }, archive: null } });
    const a = await r.handle('forms.list', {}, 't'); assert.equal(a.ok, true); assert.equal(a.data.total, 2);
    const v = ctx0.store.dataVersion; await r.handle('forms.list', {}, 't'); assert.equal(ctx0.store.dataVersion, v, 'lần sau không ghi nữa');
    ctx0.store.close();
  });
}
