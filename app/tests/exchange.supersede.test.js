'use strict';
/**
 * Bên vận chuyển HỦY kỳ đã gửi rồi lập lại kỳ mới cùng khoảng ngày (mã thêm #2):
 *  - bên thuê trước đây bị TỪ CHỐI ("hai kỳ chồng ngày nhau") → nút Nhập gói mờ, không nhận được bản sửa;
 *  - nay: cùng máy gửi + cùng hợp đồng + cùng khoảng ngày/tuyến → hiện LỰA CHỌN "Thay kỳ cũ bằng kỳ này" (mặc định giữ kỳ cũ);
 *  - kỳ của MÁY KHÁC chồng ngày vẫn bị từ chối.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { install, KETOAN, ADMIN, rid } = require('./install');
const { ExchangeService } = require('../main/services/ExchangeService');

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-xsup-'));
const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' };
const U = { username: 'ketoan' };

test('Hủy kỳ rồi lập lại cùng khoảng ngày: bên nhận được chọn thay kỳ cũ; giữ kỳ cũ thì không đổi gì', async () => {
  const q = await install('HAKQN'); const ex = new ExchangeService(q.store);
  const dh = await install('DH', { installId: 'INS-AAAA1111' }); const dex = new ExchangeService(dh.store);
  const send = async (name, pid) => { const f = path.join(OUT, name); await dex.exportPackage({ packageType: 'KY_TINH', periodIds: [pid], targetPath: f, user: U }); return f; };

  // bên gửi: tính + xác nhận kỳ 1, gửi, bên nhận nhập
  const k1 = await dh.periods.calculate({ contractId: dh.contractId, ...W, reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  const pid1 = k1.period.period_id; await dh.periods.confirm({ periodId: pid1, user: KETOAN });
  const f1 = await send('v1.dgvc', pid1);
  const pv1 = ex.previewPackage({ filePath: f1, user: U }); assert.equal(pv1.summary.KY_TINH.NEW, 1);
  await ex.importPackage({ previewId: pv1.previewId, user: U });
  const oldCode = k1.period.period_code;
  assert.equal(q.store.get('KY_TINH', pid1).status, 'DA_XAC_NHAN');

  // bên gửi: trả về nháp → HỦY → lập lại kỳ mới (bỏ 1 dòng dầu) → xác nhận → gửi
  await dh.periods.reopen({ periodId: pid1, reason: 'sai', user: ADMIN });
  await dh.periods.cancel({ periodId: pid1, reason: 'lập lại', user: KETOAN });
  const drop = [dh.store.find('GIAO_NHAN_DAU', () => true)[0].receipt_id];
  const k2 = await dh.periods.calculate({ contractId: dh.contractId, ...W, excludeReceiptIds: drop, reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  const pid2 = k2.period.period_id; assert.notEqual(pid2, pid1); assert.match(k2.period.period_code, /#2$/);
  await dh.periods.confirm({ periodId: pid2, user: KETOAN });
  const f2 = await send('v2.dgvc', pid2);

  // xem trước: KHÔNG bị từ chối nữa, là xung đột kiểu "thay kỳ cũ", mặc định giữ
  const pv = ex.previewPackage({ filePath: f2, user: U });
  assert.equal(pv.canImport, true, JSON.stringify(pv.rejected)); assert.equal(pv.rejected.length, 0);
  const cf = pv.conflicts.find((c) => c.table === 'KY_TINH');
  assert.equal(cf.kind, 'SUPERSEDE'); assert.equal(cf.default, 'KEEP'); assert.deepEqual(cf.supersedeCodes, [oldCode]);
  assert.deepEqual(cf.changes.find((x) => x.field === 'Mã kỳ'), { field: 'Mã kỳ', local: oldCode, incoming: k2.period.period_code });

  // (a) giữ kỳ cũ (mặc định): không đổi gì
  const keep = ex.previewPackage({ filePath: f2, user: U });
  await ex.importPackage({ previewId: keep.previewId, user: U });
  assert.equal(q.store.get('KY_TINH', pid1).status, 'DA_XAC_NHAN'); assert.equal(q.store.get('KY_TINH', pid2), null);
  assert.equal(q.store.find('TRANSPORT_DETAIL', (d) => d.period_id === pid1 && d.is_current && d.usage_state === 'CONFIRMED').length, 77);

  // (b) thay kỳ cũ bằng kỳ mới
  const pvT = ex.previewPackage({ filePath: f2, user: U }); assert.equal(pvT.canImport, true);
  await ex.importPackage({ previewId: pvT.previewId, decisions: { [`KY_TINH:${pid2}`]: 'TAKE' }, user: U });
  assert.equal(q.store.get('KY_TINH', pid1).status, 'HUY', 'kỳ cũ → Đã hủy, giữ lịch sử');
  assert.equal(q.store.get('KY_TINH', pid2).status, 'DA_XAC_NHAN'); assert.equal(q.store.get('KY_TINH', pid2).origin, 'IMPORTED');
  assert.equal(q.store.find('TRANSPORT_DETAIL', (d) => d.period_id === pid1 && d.is_current).length, 0, 'phiếu của kỳ cũ được giải phóng');
  assert.equal(q.store.find('TRANSPORT_DETAIL', (d) => d.period_id === pid2 && d.is_current && d.usage_state === 'CONFIRMED').length, 77);
  assert.equal(q.store.find('FUEL_DETAIL', (d) => d.period_id === pid2 && d.is_current).length, 15, 'kỳ mới bỏ 1 dòng dầu');
  assert.equal(q.store.find('FUEL_DETAIL', (d) => d.period_id === pid1 && d.is_current).length, 0);
  assert.ok(q.store.all('AUDIT_LOG').some((a) => a.action === 'SUPERSEDE_PERIOD' && a.entity_id === pid1));
  // gói gửi lại y nguyên sau khi đã thay → không còn xung đột
  const again = ex.previewPackage({ filePath: f2, user: U });
  assert.equal(again.canImport, true); assert.equal(again.conflicts.length, 0); assert.equal(again.summary.KY_TINH.SAME, 1);
  for (const x of [q, dh]) x.store.close();
});

test('Kỳ chồng ngày của MÁY KHÁC (không phải bản trước của cùng máy gửi) vẫn bị từ chối', async () => {
  const q = await install('HAKQN'); const ex = new ExchangeService(q.store);
  const mk = async (installId) => {
    const c = await install('DH', { installId }); const k = await c.periods.calculate({ contractId: c.contractId, ...W, reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
    await c.periods.confirm({ periodId: k.period.period_id, user: KETOAN });
    const f = path.join(OUT, `${installId}.dgvc`); await new ExchangeService(c.store).exportPackage({ packageType: 'KY_TINH', periodIds: [k.period.period_id], targetPath: f, user: U });
    // máy này hủy kỳ rồi lập lại → mã #2 (id khác)
    await c.periods.reopen({ periodId: k.period.period_id, reason: 'x', user: ADMIN }); await c.periods.cancel({ periodId: k.period.period_id, reason: 'x', user: KETOAN });
    const k2 = await c.periods.calculate({ contractId: c.contractId, ...W, reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
    await c.periods.confirm({ periodId: k2.period.period_id, user: KETOAN });
    const f2 = path.join(OUT, `${installId}-2.dgvc`); await new ExchangeService(c.store).exportPackage({ packageType: 'KY_TINH', periodIds: [k2.period.period_id], targetPath: f2, user: U });
    c.store.close(); return { f, f2 };
  };
  const a = await mk('INS-AAAA1111'); const b = await mk('INS-BBBB2222');
  await ex.importPackage({ previewId: ex.previewPackage({ filePath: a.f, user: U }).previewId, user: U });
  const pv = ex.previewPackage({ filePath: b.f2, user: U });
  assert.equal(pv.canImport, false); assert.match(pv.rejected[0].note, /chồng ngày/); assert.equal(pv.conflicts.filter((c) => c.kind === 'SUPERSEDE').length, 0);
  q.store.close();
});
