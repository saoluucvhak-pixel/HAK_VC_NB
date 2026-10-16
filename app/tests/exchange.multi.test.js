'use strict';
/**
 * Trao đổi gói kỳ tính khi có NHIỀU bên gửi:
 *  - bên thuê HAKQN nhận kỳ của 2 máy cài cùng đơn vị DH (mã kỳ trùng KY-DH-000001) → 2 kỳ riêng, KHÔNG "thay bản cũ" nhầm;
 *  - gửi lại kỳ đã tính lại → chỉ thay đúng kỳ của máy đó;
 *  - bản cài là BÊN VẬN CHUYỂN nhận gói kỳ của máy khác → từ chối, nói rõ lý do, cho "chỉ nhập phiếu cân trong gói".
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { install, KETOAN, ADMIN, rid } = require('./install');
const { ExchangeService } = require('../main/services/ExchangeService');

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-xmulti-'));
const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' };
const U = { username: 'ketoan' };

async function carrier(inst, installId, { dropDup = false } = {}) {
  const ctx = await install(inst, { installId });
  const { store, periods, contractId } = ctx;
  let ex = [];
  if (dropDup) { const d = store.find('GIAO_NHAN_DAU', (r) => r.receive_date === '2026-09-18' && r.plate_no === '92H-00192' && r.qty_liter === 400); ex = [d[1].receipt_id]; }
  const k = await periods.calculate({ contractId, ...W, excludeReceiptIds: ex, reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  await periods.confirm({ periodId: k.period.period_id, user: KETOAN });
  const exs = new ExchangeService(store);
  const send = async (name) => { const f = path.join(OUT, name); await exs.exportPackage({ packageType: 'KY_TINH', periodIds: [k.period.period_id], targetPath: f, user: U }); return f; };
  return { ...ctx, k, exs, send };
}
const preview = (ex, f, o = {}) => ex.previewPackage({ filePath: f, user: U, ...o });
const take = async (ex, f) => { const pv = preview(ex, f); assert.ok(pv.canImport, JSON.stringify(pv.rejected)); return { pv, r: await ex.importPackage({ previewId: pv.previewId, user: U }) }; };
const lines = (store, pid) => store.find('BKVC_LINE', (l) => l.period_id === pid && l.is_current);

test('Bên thuê nhận kỳ của 2 máy cùng đơn vị DH: kỳ khác ngày → 2 kỳ riêng; CÙNG kỳ → báo xung đột, không tự thay', async () => {
  const q = await install('HAKQN');
  const own = await q.periods.calculate({ contractId: q.contractId, ...W, reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  const ex = new ExchangeService(q.store);
  const price = (pid) => q.store.find('TRANSPORT_CALCULATION', (c) => c.period_id === pid && c.is_current)[0].transport_price;
  const fuel = (pid) => q.store.find('FUEL_DETAIL', (d) => d.period_id === pid && d.is_current);

  // (1) máy A tính 18–23/09, máy B (cùng đơn vị DH, cài riêng) tính cùng kỳ nhưng bỏ dòng dầu trùng
  const a = await carrier('DH', 'INS-AAAA1111');
  const b = await carrier('DH', 'INS-BBBB2222', { dropDup: true });
  assert.equal(a.k.period.period_id, b.k.period.period_id, 'hai máy cùng đơn vị sinh cùng mã kỳ');
  const fa = await a.send('A.dgvc'); const fb = await b.send('B.dgvc');
  const A = await take(ex, fa);
  assert.equal(A.pv.summary.KY_TINH.NEW, 1);
  const pid = a.k.period.period_id;
  assert.equal(price(pid), 88900);
  // gói máy B: cùng hợp đồng + cùng khoảng ngày → XUNG ĐỘT (không phải "Thay bản cũ"), mặc định giữ bản đang có
  const pv = preview(ex, fb);
  assert.equal(pv.summary.KY_TINH.CONFLICT, 1); assert.equal(pv.summary.KY_TINH.REPLACE, 0); assert.equal(pv.canImport, true);
  const cf = pv.conflicts.find((c) => c.table === 'KY_TINH');
  assert.match(cf.note, /MÁY KHÁC/); assert.deepEqual(cf.changes.find((x) => x.field === 'Đơn giá'), { field: 'Đơn giá', local: '88.900', incoming: '96.900' });
  await ex.importPackage({ previewId: pv.previewId, user: U });
  assert.equal(price(pid), 88900, 'giữ bản đang có'); assert.equal(q.store.get('KY_TINH', pid).origin_install_id, 'INS-AAAA1111');
  assert.equal(fuel(pid).length, 16);
  assert.equal(q.store.all('KY_TINH').length, 2);
  // chọn "Lấy bản đến" → thay bằng bản máy B
  const pv2 = preview(ex, fb);
  await ex.importPackage({ previewId: pv2.previewId, decisions: { [`KY_TINH:${pid}`]: 'TAKE' }, user: U });
  assert.equal(price(pid), 96900); assert.equal(q.store.get('KY_TINH', pid).origin_install_id, 'INS-BBBB2222');
  assert.equal(fuel(pid).length, 15);
  for (const d of fuel(pid)) assert.ok(q.store.get('GIAO_NHAN_DAU', d.receipt_id), `dòng dầu ${d.receipt_id} có trong máy nhận`);
  assert.equal(q.store.find('BKVC_LINE', (l) => l.period_id === pid && l.is_current).length, lines(b.store, pid).length);
  assert.equal(q.store.all('KY_TINH').length, 2);
  // máy B gửi lại y nguyên → giống
  assert.equal(preview(ex, fb).summary.KY_TINH.SAME, 1);
  for (const x of [a, b]) x.store.close();

  // (2) máy C và D (cùng đơn vị HAK, cài riêng) tính 2 kỳ KHÁC ngày → mã kỳ trùng nhưng là 2 kỳ riêng
  const mk = async (installId, from, to) => {
    const c = await install('HAK', { installId });
    const k = await c.periods.calculate({ contractId: c.contractId, dateFrom: from, dateTo: to, routeCode: 'VC.007', reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
    await c.periods.confirm({ periodId: k.period.period_id, user: KETOAN });
    const f = path.join(OUT, `${installId}.dgvc`);
    await new ExchangeService(c.store).exportPackage({ packageType: 'KY_TINH', periodIds: [k.period.period_id], targetPath: f, user: U });
    c.store.close(); return { f, k };
  };
  const c1 = await mk('INS-CCCC3333', '2026-09-18', '2026-09-20'); const c2 = await mk('INS-DDDD4444', '2026-09-21', '2026-09-23');
  assert.equal(c1.k.period.period_id, c2.k.period.period_id);
  const C1 = await take(ex, c1.f);
  assert.equal(C1.pv.summary.KY_TINH.NEW, 1);
  // máy D không biết dầu đã tính ở máy C ("tính hết bảng kê") → cùng dòng dầu ở 2 kỳ → từ chối, nói rõ; KHÔNG coi là "thay bản cũ"
  const pvD = preview(ex, c2.f);
  assert.equal(pvD.canImport, false); assert.equal(pvD.summary.KY_TINH.REPLACE, 0);
  assert.match(pvD.rejected[0].note, /dòng dầu đã tính ở kỳ HAK-HAKQN\/20260918-20260920/);
  assert.equal(pvD.remapped.length, 1, 'mã kỳ trùng KY-HAK-000001 được đổi, không đè kỳ máy C');
  assert.equal(q.store.all('KY_TINH').filter((p) => p.contract_id === 'HD-HAK-HAKQN').length, 1);
  // (3) máy D gửi thêm kỳ 18–23 chồng lên kỳ 18–20 của máy C → từ chối, nói rõ
  const c3 = await mk('INS-EEEE5555', '2026-09-18', '2026-09-23');
  const pv3 = preview(ex, c3.f);
  assert.equal(pv3.canImport, false); assert.match(pv3.rejected[0].note, /chồng ngày/);
  assert.equal(q.store.get('KY_TINH', own.period.period_id).origin, 'LOCAL');
  q.store.close();
});

test('Bản cài là bên vận chuyển nhận gói kỳ của máy khác: từ chối, nói rõ; chỉ nhập phiếu cân trong gói được', async () => {
  const a = await carrier('DH', 'INS-AAAA1111');
  const f = await a.send('A.dgvc');
  const me = await install('DH', { installId: 'INS-CCCC3333' });
  const ex = new ExchangeService(me.store);
  const pv = preview(ex, f);
  assert.equal(pv.canImport, false);
  assert.match(pv.rejected[0].note, /BÊN VẬN CHUYỂN/); assert.match(pv.rejected[0].note, /phiếu cân/);
  assert.equal(pv.ticketsInPackage, 77);
  const t = preview(ex, f, { ticketsOnly: true });
  assert.equal(t.canImport, true); assert.equal(t.summary.PHIEU_CAN.SAME, 77); assert.equal(Object.keys(t.summary).join(), 'PHIEU_CAN');
  await ex.importPackage({ previewId: t.previewId, user: U });
  assert.equal(me.store.all('KY_TINH').length, 0, 'không nhận kỳ của máy khác');
  for (const x of [a, me]) x.store.close();
});
