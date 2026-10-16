'use strict';
/**
 * Bù trừ nhiên liệu (dòng dầu âm) — chốt 05/10/2026:
 *  - import nhận dòng số lít âm (cảnh báo "bù trừ"), được để trống đơn giá;
 *  - dầu thực nhận = Σ số lít (dòng âm trừ đi); đơn giá dầu = TB cộng các dòng DƯƠNG (dòng âm không kéo giá);
 *  - tổng dầu tuyến ≤ 0 vẫn tính, cảnh báo rõ; chỉ có dòng âm không giá → lỗi.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { install, KETOAN, rid } = require('./install');
const { ImportService } = require('../main/import/ImportService');
const { ReportService } = require('../main/reports/ReportService');

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-offset-'));
const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' };
async function fuelFile(name, rows) {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('NL_GIAONHANDAU');
  ws.addRow(['Ngày nhận dầu', 'Mã cự ly VC', 'Biển số xe', 'ĐVT', 'Số lượng (lít)', 'Đơn giá dầu', 'Ngày mua dầu', 'Đơn vị']);
  for (const r of rows) ws.addRow(r);
  const f = path.join(OUT, name); await wb.xlsx.writeFile(f); return f;
}
async function setup() {
  const ctx = await install('DH');
  const dup = ctx.store.find('GIAO_NHAN_DAU', (r) => r.receive_date === '2026-09-18' && r.plate_no === '92H-00192' && r.qty_liter === 400);
  const base = (await ctx.periods.preview({ contractId: ctx.contractId, ...W, excludeReceiptIds: [dup[1].receipt_id] })).results[0];
  return { ...ctx, imp: new ImportService(ctx.store), ex: [dup[1].receipt_id], base };
}
const load = async (imp, contractId, f) => {
  const pv = await imp.preview({ importType: 'GIAO_NHAN_DAU', contractId, filePath: f, user: 'ketoan' });
  await imp.confirm({ batchId: pv.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' });
  return pv;
};

test('Dòng bù trừ không ghi giá: trừ lít, đơn giá dầu giữ nguyên, đơn giá VC tăng đúng công thức; biên bản ghi "Bù trừ"', async () => {
  const { store, periods, contractId, imp, ex, base } = await setup();
  assert.equal(base.transportPrice, 96900); const P = base.fuelPrice;
  const pv = await load(imp, contractId, await fuelFile('bu_tru.xlsx', [['21/09/2026', 'VC.007', 'DH_92H00192', 'LÍT', -100, null, '', 'HAKQN']]));
  const row = pv.rows[0];
  assert.equal(row.status, 'WARNING'); assert.ok(row.issues.some((i) => i.code === 'W_FUEL_OFFSET'));
  const off = store.find('GIAO_NHAN_DAU', (r) => r.qty_liter === -100)[0];
  assert.equal(off.fuel_price_excl_vat, 0, 'để trống đơn giá → lưu 0 (chỉ trừ lít)');

  const k = await periods.calculate({ contractId, ...W, excludeReceiptIds: ex, reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  const r = k.results[0];
  assert.equal(r.actualFuelLiter, base.actualFuelLiter - 100);
  assert.equal(r.fuelPrice, P, 'dòng bù trừ không kéo đơn giá dầu bình quân');
  assert.equal(r.fuelLineCount, base.fuelLineCount + 1);
  assert.ok(Math.abs(r.transportPriceRaw - (base.transportPriceRaw + 100 * P / base.totalTon)) < 1e-6, 'trừ 100 lít → đơn giá VC tăng 100 × giá dầu / tổng tấn');
  assert.ok(k.issues.some((i) => i.code === 'I_FUEL_OFFSET' && i.ref === off.receipt_id));
  assert.ok(!k.issues.some((i) => i.level === 'ERROR'));

  const rs = new ReportService(store);
  const doc = rs.fuelHandover({ periodId: k.period.period_id }).docs[0];
  const line = doc.rows.find((x) => x.receiptId === off.receipt_id);
  assert.equal(line.note, 'Bù trừ (giá BQ)'); assert.equal(line.price, Math.round(doc.totals.avgPrice)); assert.equal(line.amount, -100 * line.price);
  assert.equal(doc.totals.qty, Math.round((r.actualFuelLiter) * 100) / 100);
  const fl = rs.fuelList({ dateFrom: '2026-09-21', dateTo: '2026-09-21' });
  assert.ok(fl.rows.some((x) => x.qty_liter === -100 && /Bù trừ/.test(x.note)));
  store.close();
});

test('Dòng bù trừ có ghi giá vẫn không tính vào đơn giá bình quân; tổng dầu ≤ 0 vẫn tính, có cảnh báo; số lít 0 bị chặn', async () => {
  const { store, periods, contractId, imp, ex, base } = await setup();
  const f0 = await fuelFile('zero.xlsx', [['21/09/2026', 'VC.007', 'DH_92H00192', 'LÍT', 0, 30000, '', 'HAKQN'], ['21/09/2026', 'VC.007', 'DH_92H00192', 'LÍT', 50, null, '', 'HAKQN']]);
  const z = await imp.preview({ importType: 'GIAO_NHAN_DAU', contractId, filePath: f0, user: 'ketoan' });
  assert.ok(z.rows[0].issues.some((i) => i.code === 'E_QTY_INVALID'), '0 lít → lỗi');
  assert.ok(z.rows[1].issues.some((i) => i.code === 'E_PRICE_NEGATIVE'), 'dòng dương thiếu đơn giá → lỗi');
  await imp.cancel({ batchId: z.batchId });

  await load(imp, contractId, await fuelFile('bu_tru_lon.xlsx', [['22/09/2026', 'VC.007', 'DH_92H00057', 'LÍT', -(base.actualFuelLiter + 200), 35000, '', 'HAKQN']]));
  const pv = await periods.preview({ contractId, ...W, excludeReceiptIds: ex });
  const r = pv.results[0];
  assert.equal(r.fuelPrice, base.fuelPrice, 'dòng âm có giá 35.000 vẫn không kéo giá');
  assert.equal(r.actualFuelLiter, -200);
  assert.equal(r.resultStatus === 'ERROR', false);
  assert.ok(pv.issues.some((i) => i.code === 'W_FUEL_TOTAL_NONPOSITIVE' && /-200 lít/.test(i.message)));
  assert.ok(r.transportPrice > base.transportPrice);
  store.close();
});

test('Tuyến chỉ có dòng bù trừ không giá → lỗi rõ ràng; có giá → dùng giá đó', async () => {
  const { store, periods, contractId, imp } = await install('DH').then(async (c) => ({ ...c, imp: new ImportService(c.store) }));
  // bỏ hết dòng dầu dương khỏi kỳ, chỉ còn dòng bù trừ
  const all = store.find('GIAO_NHAN_DAU', (r) => !r.is_deleted).map((r) => r.receipt_id);
  await load(imp, contractId, await fuelFile('chi_am.xlsx', [['21/09/2026', 'VC.007', 'DH_92H00192', 'LÍT', -50, null, '', 'HAKQN']]));
  let pv = await periods.preview({ contractId, ...W, excludeReceiptIds: all });
  assert.ok(pv.issues.some((i) => i.code === 'E_FUEL_OFFSET_NO_PRICE'));
  await load(imp, contractId, await fuelFile('chi_am_gia.xlsx', [['22/09/2026', 'VC.007', 'DH_92H00192', 'LÍT', -10, 31000, '', 'HAKQN']]));
  pv = await periods.preview({ contractId, ...W, excludeReceiptIds: all });
  assert.equal(pv.results[0].fuelPrice, 31000); assert.equal(pv.results[0].actualFuelLiter, -60);
  store.close();
});
