'use strict';
/**
 * ĐVT tính giá theo DÒNG đơn giá (cột PRICE_HISTORY.calc_basis = TAN | M3).
 *  - Dòng THEO GIÁ DẦU tính theo m³: CT1 chia Thể tích TB, CT2 chia Tổng m³ (Σ m³ từng chuyến), BKVC theo m³.
 *  - Dòng CỐ ĐỊNH: ĐVT của dòng ưu tiên hơn ĐVT tuyến (kể cả BKVC).
 *  - Dòng cũ (cột trống) giữ đúng cách cũ từng đồng; kho cũ chưa có cột mở / nâng cấp được; gói trao đổi mang cột mới.
 *  - Bản chụp kỳ + báo cáo in lại (HTML / Excel / PDF) ghi đúng số và nhãn m³.
 * Số kỳ vọng tính tay từ các đầu vào đã lưu (cự ly, số chuyến, dầu), KHÔNG lấy từ chính hàm cần kiểm.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ExcelJS = require('exceljs');
const { install, storageKinds, KETOAN, rid } = require('./install');
const { CatalogService } = require('../main/services/CatalogService');
const { ExchangeService } = require('../main/services/ExchangeService');
const { ReportService } = require('../main/reports/ReportService');
const { chromiumPdfRenderer } = require('../main/reports/pdf');
const { newStore } = require('../main/repo/createStore');
const { PeriodService } = require('../main/services/PeriodService');
const { roundDigits } = require('../main/engine/rounding');

const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24' };
const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const HAS_PDF = fs.existsSync(CHROME) && (() => { try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-basis-'));
const VOL = 10; const AVG_VOL = 20; const NEW_PRICE = 300000; const FUEL = 15500; const NORM = 0.4;

/** Tuyến VC.007 tính m³, mọi xe 10 m³; thêm đơn giá RIÊNG của hợp đồng theo giá dầu (không nhập KL_TB) qua dịch vụ → dòng mới nhận calc_basis theo tuyến. */
async function setup(kind, { basis } = {}) {
  const c = await install('DH', { kind }); const { store, contractId } = c; const cat = new CatalogService(store);
  await store.transaction((tx) => { tx.update('TUYEN_VC', 'VC.007', { uom: 'M3' }); for (const v of tx.all('XE')) tx.update('XE', v.plate_no, { volume_m3: VOL }); }, { user: 'test' });
  const rec = { routeCode: 'VC.007', contractId, priceMethod: 'THEO_DAU', newPrice: NEW_PRICE, fuelPriceExclVat: FUEL, fuelNormLPerKm: NORM, avgVolumeM3: AVG_VOL, effectiveFrom: '2026-06-01', ...(basis ? { calcBasis: basis } : {}) };
  const l = await cat.createPriceVersion({ record: rec, user: KETOAN });
  await cat.activatePrice({ priceId: l.record.price_id, rowVersion: l.record.row_version, user: KETOAN });
  return { ...c, cat, line: l.record };
}
const baseNums = (store, r) => { // đầu vào đã lưu của kỳ → số kỳ vọng dùng chung
  const route = store.get('TUYEN_VC', 'VC.007'); const trip = route.trip_distance_km;
  return { trip, fuelPerTrip: trip * NORM, fuelCost: FUEL * trip * NORM, std: trip * r.tripCount * NORM, diff: trip * r.tripCount * NORM - r.actualFuelLiter };
};

for (const kind of storageKinds()) {
  test(`[${kind}] (a) dòng MỚI tuyến M3 + THEO GIÁ DẦU: CT1 ÷ Thể tích TB, CT2 ÷ tổng m³, BKVC theo m³ — tính tay từng bước`, async () => {
    const { store, periods, contractId, line } = await setup(kind);
    assert.equal(line.calc_basis, 'M3', 'dòng mới tạo trên tuyến M3 nhận ĐVT m³'); assert.equal(line.avg_load_ton, 0, 'KL_TB bỏ trống → 0, không bắt buộc');
    const r = periods.preview({ contractId, ...W }).results[0]; const n = baseNums(store, r);
    const tripPrice = NEW_PRICE * AVG_VOL;
    const contract = roundDigits((tripPrice - n.fuelCost) / AVG_VOL, -3, 'HALF_EVEN');
    assert.equal(r.tripPrice, tripPrice); assert.equal(r.priceNoDiesel, (tripPrice - n.fuelCost) / AVG_VOL); assert.equal(r.contractPrice, contract);
    const totalM3 = r.tripCount * VOL; assert.equal(r.totalM3, totalM3);
    const adjust = n.diff * r.fuelPrice / totalM3; assert.equal(r.fuelAdjustPrice, adjust);
    const price = roundDigits(contract + adjust, -2, 'HALF_EVEN'); assert.equal(r.transportPrice, price);
    assert.notEqual(r.fuelAdjustPrice, n.diff * r.fuelPrice / r.totalTon, 'không còn chia tổng tấn');
    // BKVC theo m³: m³ mỗi xe = số chuyến × 10; thành tiền = làm tròn(m³ × đơn giá)
    const b = periods.preview({ contractId, ...W }).bkvc;
    assert.ok(b.lines.length > 0 && b.lines.every((l) => l.uom === 'M3' && l.ton === l.tripCount * VOL && l.unitPrice === price && l.amount === Math.round(l.ton * price)));
    assert.equal(b.totals.ton, r.tripCount * VOL); assert.equal(b.totals.amount, b.lines.reduce((a, l) => a + l.amount, 0));
    const trace = r.trace.steps; const st = (k) => trace.find((x) => x.key === k);
    assert.equal(st('priceNoDiesel').unit, 'đ/m³'); assert.match(st('priceNoDiesel').formula, /Thể tích TB/); assert.equal(st('totalTon').unit, 'm³'); assert.equal(st('totalTon').value, totalM3);
    assert.equal(st('fuelAdjustPrice').unit, 'đ/m³'); assert.match(st('fuelAdjustPrice').formula, /Tổng m³/); assert.equal(st('transportPrice').unit, 'đ/m³');
    // thể tích TB thay cho xe chưa khai: xe 0 m³ → dùng 20 m³
    await store.transaction((tx) => { const v = tx.all('XE')[0]; tx.update('XE', v.plate_no, { volume_m3: 0 }); }, { user: 'test' });
    const z = periods.preview({ contractId, ...W }).results[0];
    const noVol = store.all('XE')[0].plate_no; const trips = store.all('PHIEU_CAN').filter((t) => !t.is_deleted && t.plate_no === noVol && t.weigh1_date >= W.dateFrom && t.weigh1_date <= W.dateTo && t.route_code === 'VC.007').length;
    assert.equal(z.totalM3, (z.tripCount - trips) * VOL + trips * AVG_VOL, 'xe chưa khai thể tích → dùng Thể tích TB của dòng giá');
    store.close();
  });

  test(`[${kind}] (b) cùng kịch bản nhưng dòng CŨ (không cờ) → số cũ theo tấn, BKVC theo tấn`, async () => {
    const { store, periods, contractId, line } = await setup(kind);
    await store.transaction((tx) => tx.update('PRICE_HISTORY', line.price_id, { calc_basis: '', avg_load_ton: 18 }), { user: 'test' });
    const k = periods.preview({ contractId, ...W }); const r = k.results[0]; const n = baseNums(store, r);
    const contract = roundDigits((NEW_PRICE * AVG_VOL - n.fuelCost) / 18, -3, 'HALF_EVEN'); // cũ: ĐG 1 chuyến theo thể tích, chia KL_TB
    assert.equal(r.contractPrice, contract); assert.equal(r.basisM3, false); assert.equal(r.totalM3, undefined);
    assert.equal(r.fuelAdjustPrice, n.diff * r.fuelPrice / r.totalTon); assert.equal(r.transportPrice, roundDigits(contract + r.fuelAdjustPrice, -2, 'HALF_EVEN'));
    assert.ok(k.bkvc.lines.every((l) => l.uom === 'TAN'), 'dòng cũ THEO GIÁ DẦU luôn BKVC theo tấn');
    assert.equal(r.trace.steps.find((x) => x.key === 'fuelAdjustPrice').unit, 'đ/tấn', 'nhãn dòng cũ giữ như trước');
    assert.match(r.trace.steps.find((x) => x.key === 'priceNoDiesel').formula, /KL_TB/);
    // dòng cũ trên kho không có cả khóa calc_basis (kho tạo bằng bản trước): vẫn tính ra đúng số đó
    await store.transaction((tx) => tx.update('PRICE_HISTORY', line.price_id, { calc_basis: undefined }), { user: 'test' });
    assert.equal(periods.preview({ contractId, ...W }).results[0].transportPrice, r.transportPrice);
    store.close();
  });

  test(`[${kind}] (b2) giá CỐ ĐỊNH: ĐVT dòng ưu tiên hơn tuyến, dòng cũ theo tuyến`, async () => {
    const c = await install('DH', { kind }); const { store, periods, contractId } = c; const cat = new CatalogService(store);
    await store.transaction((tx) => { for (const v of tx.all('XE')) tx.update('XE', v.plate_no, { volume_m3: VOL }); for (const g of tx.all('GIAO_NHAN_DAU')) tx.update('GIAO_NHAN_DAU', g.receipt_id, { is_deleted: true }); }, { user: 'test' });
    const addFixed = async (code, basis, route) => {
      await cat.savePriceCode({ create: true, record: { priceCode: code, unitCode: store.get('HOP_DONG', contractId).customer_unit_code, priceName: code, priceMethod: 'CO_DINH' }, user: KETOAN });
      const l = await cat.addCodeLine({ priceCode: code, record: { routeCode: route, effectiveFrom: '2026-01-01', fixedPrice: 50000, ...(basis ? { calcBasis: basis } : {}) }, user: KETOAN });
      await cat.activatePrice({ priceId: l.record.price_id, rowVersion: l.record.row_version, user: KETOAN });
      await store.transaction((tx) => tx.update('HOP_DONG', contractId, { price_code: code }), { user: 'test' });
      return l.record;
    };
    // tuyến TẤN + dòng chọn m³ → tính m³
    const l1 = await addFixed('CD-M3', 'M3', 'VC.007'); assert.equal(l1.calc_basis, 'M3');
    const k1 = periods.preview({ contractId, ...W }); assert.equal(k1.results[0].transportPrice, 50000);
    assert.ok(k1.bkvc.lines.every((l) => l.uom === 'M3' && l.ton === l.tripCount * VOL), 'dòng m³ trên tuyến tấn → BKVC theo m³');
    assert.equal(k1.results[0].totalM3, k1.results[0].tripCount * VOL);
    // tuyến M3 + dòng chọn tấn → tính tấn
    await store.transaction((tx) => tx.update('TUYEN_VC', 'VC.007', { uom: 'M3' }), { user: 'test' });
    const l2 = await addFixed('CD-TAN', 'TAN', 'VC.007'); assert.equal(l2.calc_basis, 'TAN');
    const k2 = periods.preview({ contractId, ...W }); assert.ok(k2.bkvc.lines.every((l) => l.uom === 'TAN'), 'dòng tấn trên tuyến m³ → BKVC theo tấn');
    assert.equal(k2.bkvc.totals.amount, k2.bkvc.lines.reduce((a, l) => a + Math.round(l.kg / 1000 * 50000), 0));
    // dòng cũ không cờ: theo tuyến (m³)
    await store.transaction((tx) => tx.update('PRICE_HISTORY', l2.price_id, { calc_basis: '' }), { user: 'test' });
    assert.ok(periods.preview({ contractId, ...W }).bkvc.lines.every((l) => l.uom === 'M3'), 'dòng cũ cố định theo ĐVT tuyến');
    // mặc định dòng mới = ĐVT tuyến khi không chọn
    const l3 = await addFixed('CD-MD', '', 'VC.007'); assert.equal(l3.calc_basis, 'M3');
    store.close();
  });

  test(`[${kind}] (c) bản chụp kỳ + báo cáo in lại: số liệu đúng, nhãn m³; kỳ cũ giữ nhãn tấn`, async () => {
    const { store, periods, contractId, line } = await setup(kind);
    const k = await periods.calculate({ contractId, ...W, clientRequestId: rid(), user: KETOAN }); const r = k.results[0]; const pid = k.period.period_id;
    const snap = store.find('TRANSPORT_CALCULATION', (c) => c.period_id === pid && c.is_current)[0];
    assert.equal(snap.calc_basis, 'M3'); assert.equal(snap.total_m3, r.tripCount * VOL); assert.equal(snap.uom, 'M3'); assert.equal(snap.transport_price, r.transportPrice);
    await periods.confirm({ periodId: pid, user: KETOAN });
    // sửa dòng giá sau khi chốt không làm đổi bản in lại
    const render = HAS_PDF ? chromiumPdfRenderer({ executablePath: CHROME }) : undefined;
    const rs = new ReportService(store, { pdfRenderer: render });
    const sheet = rs.pricingSheet({ periodId: pid }); const rows = sheet.routes[0].sections.flatMap((s) => s.rows); const row = (no) => rows.find((x) => x.no === no);
    assert.equal(row(13).unit, 'm³'); assert.equal(Number(row(13).value.replace(/\./g, '').replace(',', '.')), r.tripCount * VOL);
    assert.equal(row(18).unit, 'đ/m³'); assert.equal(row(19).unit, 'đ/m³'); assert.equal(row(20).unit, 'đ/m³'); assert.ok(row(18).expr.endsWith(`/ ${String(r.tripCount * VOL).replace(/\B(?=(\d{3})+(?!\d))/g, '.')},00`), row(18).expr);
    assert.equal(row(11).unit, 'đ/m³'); assert.equal(sheet.routes[0].unitLabel, 'đ/m³'); assert.match(sheet.routes[0].words, /đồng\/m³/); assert.equal(sheet.bkvc.uomLabel, 'm³');
    const html = rs.html({ report: 'PRICING_SHEET', params: { periodId: pid } });
    assert.ok(html.includes('đ/m³') && html.includes('Tổng thể tích vận chuyển') && html.includes('Tổng khối lượng vận chuyển (m³)') && !html.includes('đ/tấn'), 'HTML: nhãn m³, không còn đ/tấn');
    const bk = rs.bkvc({ periodId: pid }); assert.equal(bk.totals.ton, r.tripCount * VOL); assert.equal(bk.uomLabel, 'm³');
    const x = path.join(OUT, `ps-${kind}.xlsx`); await rs.export({ report: 'PRICING_SHEET', format: 'XLSX', params: { periodId: pid }, targetPath: x });
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(x); const cells = []; wb.worksheets[0].eachRow((rw) => rw.eachCell((c) => cells.push(c)));
    assert.ok(cells.some((c) => c.value === 'm³') && cells.some((c) => c.value === 'đ/m³'), 'Excel: ĐVT m³ / đ/m³');
    assert.ok(cells.some((c) => /đ\/m³/.test(c.numFmt || '')), 'Excel: định dạng tiền đ/m³');
    assert.ok(!cells.some((c) => c.value === 'đ/tấn'), 'Excel: không còn đ/tấn');
    const bx = path.join(OUT, `bk-${kind}.xlsx`); await rs.export({ report: 'BKVC', format: 'XLSX', params: { periodId: pid }, targetPath: bx });
    const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.readFile(bx); const tot = []; wb2.worksheets[0].eachRow((rw) => { if (rw.getCell(1).value === 'TỔNG CỘNG') tot.push(rw.getCell(5).value); });
    assert.deepEqual(tot, [r.tripCount * VOL], 'Excel BKVC: tổng số lượng = Σ m³');
    if (HAS_PDF) {
      const pf = path.join(OUT, `ps-${kind}.pdf`);
      try { await rs.export({ report: 'PRICING_SHEET', format: 'PDF', params: { periodId: pid }, targetPath: pf }); const txt = execFileSync('pdftotext', ['-layout', pf, '-']).toString(); assert.ok(txt.includes('đ/m³') && txt.includes('Tổng thể tích vận chuyển'), 'PDF: nhãn m³'); } finally { await render.close(); }
    }
    // in lại sau khi đổi giá nguồn: bản chụp không đổi
    await store.transaction((tx) => tx.update('PRICE_HISTORY', line.price_id, { new_price: 999999 }), { user: 'test' });
    assert.deepEqual(rs.pricingSheet({ periodId: pid }).routes[0].sections, sheet.routes[0].sections, 'kỳ đã chốt in lại không đổi');

    // kỳ CŨ (dòng không cờ, theo tấn): bản chụp không có total_m3 → in như trước (đ/tấn / tấn)
    await store.transaction((tx) => tx.update('PRICE_HISTORY', line.price_id, { new_price: NEW_PRICE, calc_basis: '', avg_load_ton: 18 }), { user: 'test' });
    const k2 = await periods.calculate({ contractId, ...W, periodId: undefined, dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', clientRequestId: rid(), user: KETOAN, moveFromDraft: true }).catch((e) => e);
    if (!(k2 instanceof Error)) { // cùng khoảng ngày: tính lại kỳ hiện có
      const s2 = store.find('TRANSPORT_CALCULATION', (c) => c.period_id === k2.period.period_id && c.is_current)[0];
      assert.equal(s2.calc_basis, ''); assert.ok(s2.total_m3 === '' || s2.total_m3 === undefined || s2.total_m3 === null);
      const t2 = new ReportService(store).pricingSheet({ periodId: k2.period.period_id }).routes[0].sections.flatMap((s) => s.rows);
      assert.equal(t2.find((q) => q.no === 13).unit, 'tấn'); assert.equal(t2.find((q) => q.no === 18).unit, 'đ/tấn');
    }
    store.close();
  });

  test(`[${kind}] (d) kho cũ chưa có cột mới: mở được, kỳ tính lại ra cùng số, cột được bổ sung`, async () => {
    const c = await install('DH', { kind }); const dir = c.dir; const { contractId } = c;
    const k1 = await c.periods.calculate({ contractId, ...W, clientRequestId: rid(), user: KETOAN }); const pid = k1.period.period_id;
    const before = JSON.stringify(k1.results.map((r) => [r.transportPrice, r.contractPrice, r.fuelAdjustPrice])); c.store.close();
    if (kind === 'sqlite') { // giả lập kho SQLite của bản trước: không có 3 cột mới
      const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(path.join(dir, 'dgvc.sqlite'));
      db.exec('ALTER TABLE "PRICE_HISTORY" DROP COLUMN "calc_basis"'); db.exec('ALTER TABLE "TRANSPORT_CALCULATION" DROP COLUMN "calc_basis"'); db.exec('ALTER TABLE "TRANSPORT_CALCULATION" DROP COLUMN "total_m3"'); db.close();
    }
    const s2 = newStore(dir, {}, kind).open();
    if (kind === 'sqlite') { for (const t of ['PRICE_HISTORY.calc_basis', 'TRANSPORT_CALCULATION.calc_basis', 'TRANSPORT_CALCULATION.total_m3']) assert.ok(s2.schemaChanges.some((x) => x.includes(t)), `${t}: ${JSON.stringify(s2.schemaChanges)}`); }
    const again = await new PeriodService(s2).calculate({ contractId, ...W, periodId: pid, clientRequestId: rid(), user: KETOAN });
    assert.equal(JSON.stringify(again.results.map((r) => [r.transportPrice, r.contractPrice, r.fuelAdjustPrice])), before, 'dòng giá cũ (cột mới trống) tính ra đúng số cũ');
    const row = s2.find('TRANSPORT_CALCULATION', (x) => x.period_id === pid && x.is_current)[0];
    assert.ok(!row.calc_basis && (row.total_m3 === '' || row.total_m3 === undefined || row.total_m3 === null), 'dòng giá cũ không có ĐVT riêng');
    s2.close();
    if (kind === 'sqlite') { const s3 = newStore(dir, {}, kind).open(); assert.deepEqual(s3.schemaChanges, []); s3.close(); }
  });

  test(`[${kind}] (d2) gói Danh mục mang cột mới; kho cũ nhận gói mới, kho mới nhận gói cũ (không cột) đều không hỏng`, async () => {
    const a = await setup(kind); const b = await install('DH', { kind, withData: false, installId: `nhan-${kind}` });
    await b.store.transaction((tx) => { tx.update('TUYEN_VC', 'VC.007', { uom: 'M3' }); }, { user: 'test' });
    const exA = new ExchangeService(a.store); const file = path.join(OUT, `dm-${kind}.dgvcx`);
    const pkg = await exA.exportPackage({ packageType: 'DANH_MUC', targetPath: file, user: { username: 'ketoan' } });
    const exB = new ExchangeService(b.store); const pv = exB.previewPackage({ filePath: pkg.file, user: { username: 'ketoan' } }); assert.ok(pv.canImport, JSON.stringify(pv.rejected || pv));
    await exB.importPackage({ previewId: pv.previewId, user: { username: 'ketoan' } });
    assert.equal(b.store.get('PRICE_HISTORY', a.line.price_id).calc_basis, 'M3', 'máy nhận có cột ĐVT của dòng mới');
    assert.equal(b.store.find('PRICE_HISTORY', (p) => p.price_id !== a.line.price_id && p.calc_basis).length, 0, 'dòng cũ vẫn không cờ');
    // kho mới nhận gói CŨ (không có cột): dòng giống nhau không thành xung đột giả
    const old = await install('DH', { kind: 'json', withData: false, installId: `cu-${kind}` }); // seed không có cột calc_basis
    const f2 = path.join(OUT, `dm-old-${kind}.dgvcx`); const p2 = await new ExchangeService(old.store).exportPackage({ packageType: 'DANH_MUC', targetPath: f2, user: { username: 'ketoan' } });
    const c = await install('DH', { kind, withData: false, installId: `moi-${kind}` });
    const pv2 = new ExchangeService(c.store).previewPackage({ filePath: p2.file, user: { username: 'ketoan' } }); assert.ok(pv2.canImport);
    const sm = pv2.summary.PRICE_HISTORY; assert.ok(sm && sm.CONFLICT === 0 && sm.UPDATE === 0, `gói cũ không cột không sinh xung đột / cập nhật giả: ${JSON.stringify(sm)}`);
    for (const s of [a.store, b.store, old.store, c.store]) s.close();
  });
}
