'use strict';
/**
 * Bước 13 — chạy với DỮ LIỆU THẬT (3 file Excel gốc, 326 phiếu, 18 + 16 + 13 dòng dầu) như người dùng làm thật:
 *   - 3 bản cài riêng (HAKQN, ĐH, HAK) → import → sửa LDĐ về 0726 (đã xác nhận) → tính → xác nhận → khóa → báo cáo.
 *   - Đối chiếu chéo giữa các bản cài: phiếu ĐH + phiếu HAK + xe nhà HAKQN = kỳ HAKQN → CNHAK.
 *   - Chia 1 tuần thành 2 kỳ; xe rời hợp đồng giữa kỳ; phiếu không thuộc hợp đồng nào.
 *   - Sửa phiếu: cột định danh / cốt lõi / mô tả theo trạng thái kỳ.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { TicketService } = require('../main/services/TicketService');
const { ReportService } = require('../main/reports/ReportService');
const { install, ADMIN, KETOAN, rid } = require('./install');
const { fixture } = require('./helpers');

const EXCEL = fixture('excel_expected.json');
const WEEK = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' };
const LDD_OK = 'UTXK/ĐN-QS/0726'; const LDD_BAD = 'UTXK/ĐN-QS/0526';
const REASON = 'Người dùng xác nhận LDĐ đúng là UTXK/ĐN-QS/0726 (24/09/2026)';
const cur = (s, t, pid) => s.find(t, (r) => r.period_id === pid && r.is_current);
const rejects = (p, code, issue) => assert.rejects(p, (e) => { assert.equal(e.code, code, e.message); if (issue) assert.equal(e.details.code, issue); return true; });

test('LDĐ: file ĐH / ĐN ghi 0526 → sửa hàng loạt về 0726 (có lý do, audit từng phiếu), bảng kê in đúng', async () => {
  for (const [inst, n] of [['DH', 77], ['HAK', 100]]) {
    const { store, periods, contractId } = await install(inst);
    const ts = new TicketService(store);
    assert.ok(store.all('PHIEU_CAN').every((t) => t.ldd === LDD_BAD), 'file gốc ghi 0526');
    const pv = ts.previewBulkDescriptive({ field: 'ldd', fromValue: LDD_BAD, toValue: LDD_OK });
    assert.equal(pv.count, n); assert.equal(pv.inConfirmed, 0); assert.equal(pv.inLocked, 0); assert.equal(pv.sample.length, 5);
    await assert.rejects(ts.bulkUpdateDescriptive({ field: 'ldd', fromValue: LDD_BAD, toValue: LDD_OK, clientRequestId: rid(), user: KETOAN }), /lý do/);
    await assert.rejects(ts.bulkUpdateDescriptive({ field: 'net_kg', fromValue: '1', toValue: '2', reason: 'x', clientRequestId: rid(), user: KETOAN }), /cột mô tả/);
    const req = rid();
    const r = await ts.bulkUpdateDescriptive({ field: 'ldd', fromValue: LDD_BAD, toValue: LDD_OK, reason: REASON, clientRequestId: req, user: KETOAN });
    assert.equal(r.updated, n);
    assert.equal(await ts.bulkUpdateDescriptive({ field: 'ldd', fromValue: LDD_BAD, toValue: LDD_OK, reason: REASON, clientRequestId: req, user: KETOAN }), r, 'bấm 2 lần chỉ ghi 1 lần');
    assert.ok(store.all('PHIEU_CAN').every((t) => t.ldd === LDD_OK));
    const logs = store.find('AUDIT_LOG', (a) => a.entity === 'PHIEU_CAN' && a.action === 'UPDATE');
    assert.equal(logs.length, n); assert.ok(logs.every((a) => a.reason === REASON && JSON.parse(a.before_json).ldd === LDD_BAD));
    assert.equal(store.find('AUDIT_LOG', (a) => a.action === 'BULK_UPDATE').length, 1);
    // số tính không đổi, bảng kê in 0726
    const k = await periods.calculate({ contractId, ...WEEK, clientRequestId: rid(), user: KETOAN });
    assert.equal(k.results[0].transportPrice, EXCEL[inst]['Đơn giá vận chuyển']);
    const ct = new ReportService(store).bkct({ periodId: k.period.period_id });
    assert.equal(ct.rows.length, n); assert.ok(ct.rows.every((t) => t.ldd === LDD_OK));
    // kỳ đã khóa: sửa mô tả cần quyền mở khóa
    await periods.confirm({ periodId: k.period.period_id, user: KETOAN });
    await periods.lock({ periodId: k.period.period_id, user: KETOAN });
    const pv2 = ts.previewBulkDescriptive({ field: 'ldd', fromValue: LDD_OK, toValue: 'X' });
    assert.equal(pv2.inLocked, n); assert.deepEqual(pv2.periods.map((p) => p.status), ['DA_KHOA']);
    await rejects(ts.bulkUpdateDescriptive({ field: 'ldd', fromValue: LDD_OK, toValue: 'X', reason: 'thử', clientRequestId: rid(), user: KETOAN }), 'FORBIDDEN');
    store.close();
  }
});

test('Sửa 1 phiếu: định danh cấm; cốt lõi cấm khi kỳ đã xác nhận, kỳ nháp → cần tính lại; mô tả theo quyền', async () => {
  const { store, periods, contractId } = await install('HAKQN');
  const ts = new TicketService(store);
  const k = await periods.calculate({ contractId, ...WEEK, clientRequestId: rid(), user: KETOAN });
  const pid = k.period.period_id;
  const t = store.all('PHIEU_CAN').find((x) => x.ticket_no === '573');
  await rejects(ts.update({ ticketId: t.ticket_id, changes: { plate_no: '43H-99999' }, user: KETOAN }), 'BUSINESS_RULE', 'E_TICKET_IDENTITY');
  await assert.rejects(ts.update({ ticketId: t.ticket_id, changes: { import_batch_id: 'x' }, user: KETOAN }), (e) => e.code === 'VALIDATION_FAILED');
  await assert.rejects(ts.update({ ticketId: t.ticket_id, changes: { net_kg: -1 }, user: KETOAN }), /≥ 0/);
  await assert.rejects(ts.update({ ticketId: t.ticket_id, changes: { route_code: 'VC.XXX' }, user: KETOAN }), /tuyến/);
  // kỳ nháp: sửa KL → kỳ phải tính lại, tính lại ra số mới
  const r = await ts.update({ ticketId: t.ticket_id, changes: { net_kg: t.net_kg + 1000 }, reason: 'Cân lại', user: KETOAN });
  assert.deepEqual(r.affectedPeriods, [pid]); assert.equal(store.get('KY_TINH', pid).needs_recalc, true);
  await rejects(periods.confirm({ periodId: pid, user: KETOAN }), 'BUSINESS_RULE', 'E_NEEDS_RECALC');
  const k2 = await periods.calculate({ contractId, ...WEEK, periodId: pid, clientRequestId: rid(), user: KETOAN });
  assert.equal(k2.results[0].totalKg, 6143680 + 1000);
  await ts.update({ ticketId: t.ticket_id, changes: { net_kg: t.net_kg }, reason: 'Trả lại số đúng', user: KETOAN });
  await periods.calculate({ contractId, ...WEEK, periodId: pid, clientRequestId: rid(), user: KETOAN });
  await periods.confirm({ periodId: pid, user: KETOAN });
  // kỳ đã xác nhận: cốt lõi cấm, mô tả được (bắt buộc lý do)
  await rejects(ts.update({ ticketId: t.ticket_id, changes: { net_kg: 1 }, reason: 'x', user: ADMIN }), 'BUSINESS_RULE', 'E_TICKET_LOCKED');
  await assert.rejects(ts.update({ ticketId: t.ticket_id, changes: { customer: 'XIAMEN JIULI PAPER IMP. AND EXP. CO., LTD' }, user: KETOAN }), /lý do/);
  const d = await ts.update({ ticketId: t.ticket_id, changes: { customer: 'XIAMEN JIULI PAPER IMP. AND EXP. CO., LTD' }, reason: 'Bổ sung khách hàng', user: KETOAN });
  assert.equal(d.record.customer, 'XIAMEN JIULI PAPER IMP. AND EXP. CO., LTD'); assert.deepEqual(d.affectedPeriods, []);
  assert.equal(store.get('KY_TINH', pid).needs_recalc, false, 'sửa cột mô tả không bắt tính lại');
  const g = ts.get({ ticketId: t.ticket_id });
  assert.deepEqual(g.usages.map((u) => u.status), ['DA_XAC_NHAN']);
  assert.equal(g.audit.length, 3);
  store.close();
});

test('Đối chiếu chéo 3 bản cài: phiếu kỳ ĐH + kỳ HAK + xe nhà HAKQN = kỳ HAKQN → CNHAK', async () => {
  const run = async (inst) => {
    const c = await install(inst);
    if (inst !== 'HAKQN') await new TicketService(c.store).bulkUpdateDescriptive({ field: 'ldd', fromValue: LDD_BAD, toValue: LDD_OK, reason: REASON, clientRequestId: rid(), user: KETOAN });
    const k = await c.periods.calculate({ contractId: c.contractId, ...WEEK, clientRequestId: rid(), user: KETOAN });
    await c.periods.confirm({ periodId: k.period.period_id, user: KETOAN });
    await c.periods.lock({ periodId: k.period.period_id, user: KETOAN });
    const rs = new ReportService(c.store);
    const out = { inst, price: k.results[0].transportPrice, bkvc: rs.bkvc({ periodId: k.period.period_id }),
      ids: new Set(cur(c.store, 'TRANSPORT_DETAIL', k.period.period_id).map((d) => d.ticket_id)),
      tickets: new Map(c.store.all('PHIEU_CAN').map((t) => [t.ticket_id, t])), issues: k.issues };
    c.store.close();
    return out;
  };
  const [Q, D, H] = [await run('HAKQN'), await run('DH'), await run('HAK')];
  assert.deepEqual([Q.price, D.price, H.price], [178000, 88900, 125600]);
  // cùng phiếu → cùng ID ở mọi bản cài; ĐH và HAK không trùng phiếu nhau; cả hai nằm trong kỳ HAKQN
  assert.equal([...D.ids].filter((id) => H.ids.has(id)).length, 0);
  assert.ok([...D.ids, ...H.ids].every((id) => Q.ids.has(id)));
  const own = [...Q.ids].filter((id) => Q.tickets.get(id).owner_unit_code === 'HAKQN');
  assert.equal(D.ids.size + H.ids.size + own.length, Q.ids.size);
  assert.deepEqual([D.ids.size, H.ids.size, own.length, Q.ids.size], [77, 100, 149, 326]);
  const kg = (o) => o.bkvc.totals.kg;
  const ownKg = own.reduce((a, id) => a + Q.tickets.get(id).net_kg, 0);
  assert.equal(kg(D) + kg(H) + ownKg, kg(Q));
  assert.deepEqual([kg(D), kg(H), ownKg, kg(Q)], [1452130, 1870380, 2821170, 6143680]);
  // từng xe thuê: số chuyến + KG ở BKVC bên thầu phụ = dòng xe đó ở BKVC HAKQN → CNHAK
  const qLine = new Map(Q.bkvc.lines.map((l) => [l.plate_no, l]));
  for (const l of [...D.bkvc.lines, ...H.bkvc.lines]) {
    assert.equal(l.trip_count, qLine.get(l.plate_no).trip_count, l.plate_no);
    assert.equal(l.kg, qLine.get(l.plate_no).kg, l.plate_no);
  }
  // phiếu ở kỳ thầu phụ có đúng chủ xe
  assert.ok([...D.ids].every((id) => D.tickets.get(id).owner_unit_code === 'DH'));
  assert.ok([...H.ids].every((id) => H.tickets.get(id).owner_unit_code === 'HAK'));
  // không bản cài nào có phiếu "lọt" khỏi mọi hợp đồng
  for (const o of [Q, D, H]) assert.ok(!o.issues.some((i) => i.code === 'W_TICKET_NO_CONTRACT'), o.inst);
});

test('Chia tuần thật thành 2 kỳ (18–20, 21–23): không phiếu / dòng dầu nào tính 2 lần, cộng lại đủ cả tuần', async () => {
  const { store, periods, contractId } = await install('HAKQN');
  const fuel = store.find('GIAO_NHAN_DAU', (r) => r.contract_id === contractId);
  const late = fuel.filter((r) => r.receive_date > '2026-09-20').map((r) => r.receipt_id);
  const p1 = { dateFrom: '2026-09-18', dateTo: '2026-09-20', routeCode: 'VC.007' };
  // không loại dầu ngày sau: "tính hết bảng kê" → dầu 21–23 vào kỳ 1, APP cảnh báo từng dòng
  const pv = periods.preview({ contractId, ...p1 });
  assert.equal(pv.issues.filter((i) => i.code === 'W_AFTER_PERIOD').length, late.length);
  // người dùng loại dầu 21–23 khỏi kỳ 1
  const a = await periods.calculate({ contractId, ...p1, excludeReceiptIds: late, clientRequestId: rid(), user: KETOAN });
  await periods.confirm({ periodId: a.period.period_id, user: KETOAN });
  const b = await periods.calculate({ contractId, dateFrom: '2026-09-21', dateTo: '2026-09-23', routeCode: 'VC.007', clientRequestId: rid(), user: KETOAN });
  await periods.confirm({ periodId: b.period.period_id, user: KETOAN });
  const [ra, rb] = [a.results[0], b.results[0]];
  assert.equal(ra.tripCount + rb.tripCount, 326);
  assert.equal(ra.totalKg + rb.totalKg, 6143680);
  assert.equal(ra.actualFuelLiter + rb.actualFuelLiter, 5853);
  assert.deepEqual([ra.tripCount, rb.tripCount], [168, 158]);
  assert.deepEqual([ra.actualFuelLiter, rb.actualFuelLiter], [2892, 2961]);
  const ta = new Set(cur(store, 'TRANSPORT_DETAIL', a.period.period_id).map((d) => d.ticket_id));
  assert.ok(cur(store, 'TRANSPORT_DETAIL', b.period.period_id).every((d) => !ta.has(d.ticket_id)));
  // phiếu qua đêm ở ranh giới (cân 1 ngày 20, cân 2 ngày 21) thuộc kỳ 1 theo Ngày cân 1 (cấu hình mặc định)
  const edge = store.find('PHIEU_CAN', (t) => t.weigh1_date === '2026-09-20' && t.weigh2_date === '2026-09-21');
  console.log(`  phiếu qua đêm 20→21/09: ${edge.length}`);
  assert.ok(edge.every((t) => ta.has(t.ticket_id)));
  const fa = new Set(cur(store, 'FUEL_DETAIL', a.period.period_id).map((d) => d.receipt_id));
  assert.ok(cur(store, 'FUEL_DETAIL', b.period.period_id).every((d) => !fa.has(d.receipt_id)));
  // đơn giá từng kỳ khác đơn giá cả tuần (dầu nhận/định mức khác) — đúng công thức, không so với Excel vì Excel không có kỳ này
  for (const r of [ra, rb]) { assert.equal(r.contractPrice, 115000); assert.ok(r.transportPrice > 0 && r.transportPrice % 100 === 0); }
  console.log(`  kỳ 18–20: ${ra.transportPrice} đ/tấn · kỳ 21–23: ${rb.transportPrice} đ/tấn · cả tuần: 178000`);
  // kỳ cả tuần bây giờ bị chặn toàn bộ
  assert.equal(periods.preview({ contractId, ...WEEK }).canCalculate, false);
  store.close();
});

test('Xe rời hợp đồng giữa kỳ → phiếu sau ngày rời không tính + cảnh báo; không lọt âm thầm', async () => {
  const { store, periods, contractId } = await install('HAKQN');
  const link = store.find('HOP_DONG_XE', (v) => v.contract_id === contractId && v.plate_no === '92H-00057')[0];
  await store.transaction((tx) => tx.update('HOP_DONG_XE', link.id, { effective_to: '2026-09-20' }), { user: 'admin' });
  const after = store.find('PHIEU_CAN', (t) => t.plate_no === '92H-00057' && t.weigh1_date > '2026-09-20');
  assert.ok(after.length > 0);
  const kgAfter = after.reduce((a, t) => a + t.net_kg, 0);
  const pv = periods.preview({ contractId, ...WEEK });
  const w = pv.issues.find((i) => i.code === 'W_VEHICLE_PARTIAL_CONTRACT');
  assert.ok(w, 'phải cảnh báo xe rời hợp đồng giữa kỳ');
  assert.deepEqual([w.params.plateNo, w.params.count, w.params.kg], ['92H-00057', after.length, kgAfter]);
  const o = pv.issues.find((i) => i.code === 'W_TICKET_NO_CONTRACT');
  assert.ok(o, 'phiếu không thuộc hợp đồng nào của HAKQN'); assert.equal(o.params.count, after.length); assert.equal(o.params.plates, '92H-00057');
  assert.equal(pv.results[0].tripCount, 326 - after.length);
  assert.equal(pv.results[0].totalKg, 6143680 - kgAfter);
  // gắn xe vào hợp đồng khác của HAKQN từ 21/09 → hết cảnh báo "không thuộc hợp đồng nào", còn cảnh báo rời HĐ
  await store.transaction((tx) => {
    tx.insert('HOP_DONG', { ...store.get('HOP_DONG', contractId), contract_id: 'HD-HAKQN-TEST', contract_code: 'HAKQN-TEST', contract_no: '' });
    tx.insert('HOP_DONG_XE', { id: 'HDX-T-1', contract_id: 'HD-HAKQN-TEST', plate_no: '92H-00057', effective_from: '2026-09-21', effective_to: '' });
  }, { user: 'admin' });
  const pv2 = periods.preview({ contractId, ...WEEK });
  assert.ok(pv2.issues.some((i) => i.code === 'W_VEHICLE_PARTIAL_CONTRACT'));
  assert.ok(!pv2.issues.some((i) => i.code === 'W_TICKET_NO_CONTRACT'));
  store.close();
});

test('Tính tất cả dầu vào kỳ (chốt 25/09/2026): dầu ĐH nhận 16/09, trước kỳ 18/09, vẫn tính → 88.900 như Excel', async () => {
  const { store, periods, contractId } = await install('DH');
  const early = store.all('GIAO_NHAN_DAU').filter((r) => r.receive_date < WEEK.dateFrom);
  assert.equal(early.length, 2); assert.equal(early.reduce((a, r) => a + r.qty_liter, 0), 768);
  const k = await periods.calculate({ contractId, ...WEEK, clientRequestId: rid(), user: KETOAN });
  const fd = new Set(cur(store, 'FUEL_DETAIL', k.period.period_id).map((d) => d.receipt_id));
  assert.ok(early.every((r) => fd.has(r.receipt_id)), 'dầu trước kỳ nằm trong kỳ');
  assert.equal(fd.size, store.all('GIAO_NHAN_DAU').length, 'toàn bộ bảng kê');
  assert.equal(k.results[0].actualFuelLiter, EXCEL.DH['Dầu Diezel thực nhận']);
  assert.equal(k.results[0].transportPrice, 88900);
  assert.equal(k.issues.filter((i) => i.code === 'W_BEFORE_PERIOD').length, 2, 'chỉ cảnh báo, không chặn');
  store.close();
});
