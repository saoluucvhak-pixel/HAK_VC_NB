'use strict';
/**
 * Bước 12 — lưu kỳ tính: tính → xác nhận → khóa → mở khóa → trả về nháp → hủy; tính lại giữ lịch sử;
 * chống tính trùng phiếu / dầu giữa các kỳ; kỳ nháp bị lấy phiếu phải tính lại; quyền; bản cài không phải bên vận chuyển.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { JsonStore } = require('../main/repo/JsonStore');
const { install, ADMIN, KETOAN, rid } = require('./install');
const { fixture } = require('./helpers');

const EXCEL = fixture('excel_expected.json');
const FULL = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' };
const cur = (store, t, pid) => store.find(t, (r) => r.period_id === pid && r.is_current);
const rejects = (p, code, issue) => assert.rejects(p, (e) => { assert.equal(e.code, code, e.message); if (issue) assert.equal(e.details.code, issue, e.message); return true; });

test('vòng đời kỳ: tính → tính lại → xác nhận → khóa → mở khóa → trả nháp → hủy', async () => {
  const { store, periods, contractId, seed } = await install('HAKQN');
  const nFuel = seed.GIAO_NHAN_DAU.length;
  const req = rid();
  const r1 = await periods.calculate({ contractId, ...FULL, reportDate: '2026-09-24', clientRequestId: req, user: KETOAN });
  const p = r1.period; const pid = p.period_id;
  assert.equal(p.period_code, 'HAKQN-QS/20260918-20260923-VC.007');
  assert.equal(p.status, 'NHAP'); assert.equal(p.calc_version, 1); assert.equal(p.origin, 'LOCAL');
  assert.equal(r1.results[0].transportPrice, EXCEL.HAKQN['Đơn giá vận chuyển']);
  // gửi lại cùng clientRequestId → không tính thêm lần nữa
  assert.equal(await periods.calculate({ contractId, ...FULL, clientRequestId: req, user: KETOAN }), r1);
  assert.equal(store.all('KY_TINH').length, 1);

  // đã ghi đủ, truy vết được từ phiếu tới dòng BKVC
  const tc = cur(store, 'TRANSPORT_CALCULATION', pid);
  assert.equal(tc.length, 1); assert.equal(tc[0].transport_price, 178000); assert.equal(tc[0].contract_price, 115000);
  assert.equal(JSON.parse(tc[0].trace_json).steps.length, 15);
  const td = cur(store, 'TRANSPORT_DETAIL', pid);
  assert.equal(td.length, 326); assert.ok(td.every((d) => d.usage_state === 'DRAFT' && d.calc_id === tc[0].calc_id));
  assert.equal(td.reduce((a, d) => a + d.net_kg, 0), 6143680);
  assert.equal(cur(store, 'FUEL_DETAIL', pid).length, nFuel);
  const bl = cur(store, 'BKVC_LINE', pid);
  assert.equal(bl.length, 17); assert.equal(bl.reduce((a, l) => a + l.amount_incl_vat, 0), 1181061043);
  assert.equal(bl.reduce((a, l) => a + l.trip_count, 0), 326);
  assert.ok(store.all('AUDIT_LOG').some((a) => a.action === 'CALC' && a.entity_id === pid));

  // trùng kỳ: cùng hợp đồng + cùng khoảng ngày khi kỳ cũ còn sống
  await rejects(periods.calculate({ contractId, ...FULL, clientRequestId: rid(), user: KETOAN }), 'DUPLICATE');

  // tính lại: lần 2 là hiện hành, lần 1 giữ làm lịch sử
  const r2 = await periods.calculate({ contractId, ...FULL, periodId: pid, clientRequestId: rid(), user: KETOAN });
  assert.equal(r2.period.calc_version, 2);
  assert.equal(store.find('TRANSPORT_DETAIL', (d) => d.period_id === pid).length, 652);
  assert.equal(cur(store, 'TRANSPORT_DETAIL', pid).length, 326);
  assert.ok(store.find('TRANSPORT_DETAIL', (d) => d.period_id === pid && !d.is_current).every((d) => d.usage_state === 'RELEASED'));
  assert.equal(store.find('TRANSPORT_CALCULATION', (c) => c.period_id === pid).length, 2);
  assert.ok(store.all('AUDIT_LOG').some((a) => a.action === 'RECALC' && a.entity_id === pid));
  await assert.rejects(periods.calculate({ contractId, ...FULL, dateTo: '2026-09-22', periodId: pid, clientRequestId: rid(), user: KETOAN }), /giữ nguyên/);

  // xác nhận
  const priceId = cur(store, 'TRANSPORT_CALCULATION', pid)[0].price_id;
  let k = await periods.confirm({ periodId: pid, rowVersion: store.get('KY_TINH', pid).row_version, user: KETOAN });
  assert.equal(k.status, 'DA_XAC_NHAN'); assert.equal(k.confirmed_by, 'ketoan');
  assert.ok(cur(store, 'TRANSPORT_DETAIL', pid).every((d) => d.usage_state === 'CONFIRMED'));
  assert.ok(cur(store, 'FUEL_DETAIL', pid).every((d) => d.usage_state === 'CONFIRMED'));
  assert.equal(store.get('PRICE_HISTORY', priceId).is_used, true, 'đơn giá đã dùng cho kỳ xác nhận thì đánh dấu is_used');
  await rejects(periods.calculate({ contractId, ...FULL, periodId: pid, clientRequestId: rid(), user: KETOAN }), 'BUSINESS_RULE', 'E_PERIOD_STATUS');
  await rejects(periods.cancel({ periodId: pid, reason: 'x', user: KETOAN }), 'BUSINESS_RULE', 'E_PERIOD_STATUS');

  // khóa
  k = await periods.lock({ periodId: pid, user: KETOAN });
  assert.equal(k.status, 'DA_KHOA');
  assert.ok(cur(store, 'TRANSPORT_DETAIL', pid).every((d) => d.usage_state === 'LOCKED'));
  // mở khóa: cần quyền + lý do
  await rejects(periods.unlock({ periodId: pid, reason: 'sửa', user: KETOAN }), 'FORBIDDEN');
  await rejects(periods.unlock({ periodId: pid, user: ADMIN }), 'VALIDATION_FAILED');
  // rowVersion cũ → xung đột
  await assert.rejects(periods.unlock({ periodId: pid, reason: 'sửa', rowVersion: 1, user: ADMIN }), (e) => e.code === 'CONFLICT_VERSION');
  k = await periods.unlock({ periodId: pid, reason: 'Khách hàng yêu cầu điều chỉnh', user: ADMIN });
  assert.equal(k.status, 'DA_XAC_NHAN');
  k = await periods.reopen({ periodId: pid, reason: 'Tính lại', user: { username: 'kt2', role: 'KE_TOAN', canUnlock: true } });
  assert.equal(k.status, 'NHAP'); assert.equal(k.confirmed_by, '');
  assert.ok(cur(store, 'TRANSPORT_DETAIL', pid).every((d) => d.usage_state === 'DRAFT'));

  // hủy: cần lý do; hủy xong tạo lại cùng khoảng ngày được, mã có hậu tố #2
  await rejects(periods.cancel({ periodId: pid, user: KETOAN }), 'VALIDATION_FAILED');
  k = await periods.cancel({ periodId: pid, reason: 'Lập nhầm', user: KETOAN });
  assert.equal(k.status, 'HUY');
  assert.ok(cur(store, 'TRANSPORT_DETAIL', pid).every((d) => d.usage_state === 'RELEASED'));
  const again = await periods.calculate({ contractId, ...FULL, clientRequestId: rid(), user: KETOAN });
  assert.equal(again.period.period_code, 'HAKQN-QS/20260918-20260923-VC.007#2');
  assert.equal(again.results[0].transportPrice, 178000);

  const actions = store.find('AUDIT_LOG', (a) => a.entity_id === pid).map((a) => a.action);
  assert.deepEqual(actions, ['CALC', 'RECALC', 'CONFIRM', 'LOCK', 'UNLOCK', 'REOPEN', 'CANCEL']);
  const unlockLog = store.find('AUDIT_LOG', (a) => a.entity_id === pid && a.action === 'UNLOCK')[0];
  assert.equal(unlockLog.reason, 'Khách hàng yêu cầu điều chỉnh');
  store.close();
});

test('chống tính trùng: phiếu và dầu của kỳ đã xác nhận không vào được kỳ khác cùng hợp đồng', async () => {
  const { store, periods, contractId } = await install('HAKQN');
  const a = await periods.calculate({ contractId, ...FULL, clientRequestId: rid(), user: KETOAN });
  await periods.confirm({ periodId: a.period.period_id, user: KETOAN });
  // kỳ chồng ngày (18 → 25): mọi phiếu đã thuộc kỳ xác nhận → bị chặn, không còn gì để tính
  const pv = periods.preview({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-25', routeCode: 'VC.007' });
  assert.equal(pv.canCalculate, false);
  assert.equal(pv.blocked.filter((b) => b.kind === 'ticket').length, 326);
  assert.ok(pv.blocked.some((b) => b.kind === 'fuel' && b.code === 'E_FUEL_USED_IN_PERIOD'));
  assert.ok(pv.blocked.every((b) => b.message.includes(a.period.period_code)));
  await rejects(periods.calculate({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-25', routeCode: 'VC.007', clientRequestId: rid(), user: KETOAN }),
    'BUSINESS_RULE', 'E_CALC_BLOCKED');
  // tầng lưu trữ cũng chặn: không thể có 2 dòng CONFIRMED cho cùng (hợp đồng, phiếu)
  const d = cur(store, 'TRANSPORT_DETAIL', a.period.period_id)[0];
  await assert.rejects(store.transaction((tx) => tx.insert('TRANSPORT_DETAIL', { ...d, id: 'TD-X-0000001', period_id: 'KY-X', usage_state: 'CONFIRMED' })), /đã dùng ở kỳ đã xác nhận/);
  store.close();
});

test('kỳ nháp bị kỳ khác lấy phiếu (moveFromDraft) → phải tính lại mới xác nhận được', async () => {
  const { store, periods, contractId } = await install('HAKQN');
  const a = await periods.calculate({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-20', routeCode: 'VC.007', clientRequestId: rid(), user: KETOAN });
  const aid = a.period.period_id; const nA = cur(store, 'TRANSPORT_DETAIL', aid).length;
  assert.ok(nA > 0 && nA < 326);
  // kỳ B phủ cả A: không cho lấy phiếu nháp → chỉ cảnh báo, phiếu của A đứng ngoài
  const pv = periods.preview({ contractId, ...FULL });
  assert.equal(pv.issues.filter((i) => i.code === 'W_TICKET_IN_DRAFT_PERIOD').length, nA);
  assert.equal(pv.tickets.length, 326 - nA);
  // cho lấy → A bị đánh dấu cần tính lại
  const b = await periods.calculate({ contractId, ...FULL, moveFromDraft: true, clientRequestId: rid(), user: KETOAN });
  assert.deepEqual(b.affectedPeriods, [aid]);
  assert.equal(cur(store, 'TRANSPORT_DETAIL', b.period.period_id).length, 326);
  assert.equal(b.results[0].transportPrice, 178000);
  assert.equal(store.get('KY_TINH', aid).needs_recalc, true);
  await rejects(periods.confirm({ periodId: aid, user: KETOAN }), 'BUSINESS_RULE', 'E_NEEDS_RECALC');
  // B xác nhận → A tính lại thì mọi phiếu đã thuộc B → bị chặn → hủy A
  await periods.confirm({ periodId: b.period.period_id, user: KETOAN });
  await rejects(periods.calculate({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-20', routeCode: 'VC.007', periodId: aid, clientRequestId: rid(), user: KETOAN }),
    'BUSINESS_RULE', 'E_CALC_BLOCKED');
  assert.equal((await periods.cancel({ periodId: aid, reason: 'Gộp vào kỳ 18–23', user: KETOAN })).status, 'HUY');
  store.close();
});

test('bản cài chỉ ghi kỳ của hợp đồng mà đơn vị mình là bên vận chuyển (kể cả ADMIN)', async () => {
  const { store, periods } = await install('HAKQN');
  await rejects(periods.calculate({ contractId: 'HD-DH-HAKQN', ...FULL, clientRequestId: rid(), user: ADMIN }), 'BUSINESS_RULE', 'E_NOT_CARRIER');
  await assert.rejects(periods.calculate({ contractId: 'HD-KHONG-CO', ...FULL, clientRequestId: rid(), user: ADMIN }), (e) => e.code === 'NOT_FOUND');
  await assert.rejects(periods.calculate({ contractId: 'HD-HAKQN-QS', ...FULL, user: ADMIN }), /clientRequestId/);
  await assert.rejects(periods.calculate({ contractId: 'HD-HAKQN-QS', ...FULL, overrides: [{ code: 'W_KG_MISMATCH' }], clientRequestId: rid(), user: ADMIN }), /lý do/);
  store.close();
});

for (const inst of ['DH', 'HAK']) {
  test(`${inst}: lưu kỳ ra đúng Excel, đóng mở lại dữ liệu vẫn nguyên`, async () => {
    const { store, dir, periods, contractId } = await install(inst);
    const r = await periods.calculate({ contractId, ...FULL, clientRequestId: rid(), user: KETOAN });
    await periods.confirm({ periodId: r.period.period_id, user: KETOAN });
    await periods.lock({ periodId: r.period.period_id, user: KETOAN });
    assert.equal(r.results[0].transportPrice, EXCEL[inst]['Đơn giá vận chuyển']);
    store.close();
    const s2 = new JsonStore(dir).open();
    const p = s2.get('KY_TINH', r.period.period_id);
    assert.equal(p.status, 'DA_KHOA');
    assert.equal(cur(s2, 'TRANSPORT_CALCULATION', p.period_id)[0].transport_price, EXCEL[inst]['Đơn giá vận chuyển']);
    assert.ok(cur(s2, 'TRANSPORT_DETAIL', p.period_id).every((d) => d.usage_state === 'LOCKED'));
    s2.close();
  });
}
