'use strict';
/** Thông tin công ty vận chuyển (ngân hàng, người đại diện…) lưu / đọc lại được trên cả JSON và SQLite; công ty mình không lẫn vào danh mục đối tác. */
const test = require('node:test'); const assert = require('node:assert/strict');
const { install, KETOAN } = require('./install');
const { MasterDataService } = require('../main/services/MasterDataService');

test('Lưu thông tin ngân hàng + người đại diện của công ty mình; sửa tiếp không mất; ngân hàng trống vẫn hợp lệ', async () => {
  const { store } = await install('HAKQN', { withData: false }); const ctx = { store, svc: { master: new MasterDataService(store) } };
  const me = store.unitCode; const u0 = ctx.store.get('DON_VI', me);
  assert.equal(u0.bank_name || '', ''); // bản cũ chưa có thông tin ngân hàng
  const r = await ctx.svc.master.saveUnit({ record: { unitCode: me, bankName: ' Vietcombank  Đà Nẵng ', bankAccount: '0071000123456', legalRepName: 'VÕ THỊ NHƯ NGỌC', phone: '0914404449' }, rowVersion: u0.row_version, user: KETOAN });
  assert.equal(r.record.bank_name, 'Vietcombank Đà Nẵng'); assert.equal(r.record.bank_account, '0071000123456');
  const u1 = ctx.store.get('DON_VI', me);
  await ctx.svc.master.saveUnit({ record: { unitCode: me, note: 'x' }, rowVersion: u1.row_version, user: KETOAN });
  const u2 = ctx.store.get('DON_VI', me); assert.equal(u2.bank_account, '0071000123456'); assert.equal(u2.legal_rep_name, 'VÕ THỊ NHƯ NGỌC');
  // đối tác: thêm mới có/không có ngân hàng
  await ctx.svc.master.saveUnit({ create: true, record: { unitCode: 'DTAC1', unitName: 'Công ty đối tác thử' }, user: KETOAN });
  assert.equal(ctx.store.get('DON_VI', 'DTAC1').unit_name, 'Công ty đối tác thử');
});
