'use strict';
/**
 * Ca tính có KẾT QUẢ ĐỘC LẬP BIẾT TRƯỚC (tính tay theo docs/CALCULATION_RULES.md, không lấy từ app) — tuyến VC.007, HĐ HD-HAKQN-QS, kỳ 18–20/09/2026:
 *   6 phiếu (2 ngoài kỳ, 1 qua đêm tính theo ngày cân 1), dầu 40 L@29.000 + 20 L@30.000 + (−5 L bù trừ, không giá).
 *   ĐG 1 chuyến 2.970.000 · tiền dầu 892.800 · ĐGVC chưa dầu 115.400 → ĐG_HĐ 115.000 · dầu định mức 230,4 L · thực nhận 55 L · chênh 175,4 L · đơn giá dầu TB 29.500
 *   ĐG chênh lệch 77.006,5334 · ĐG VC 192.006,53 → 192.000 · BKVC 3 xe: 6.810.816 + 3.210.240 + 2.880.000 = 12.901.056 · VAT 8% 1.032.084 · tổng 13.933.140.
 * Chạy trên cả kho JSON và SQLite (DGVC_STORAGE).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { install, KETOAN, rid } = require('./install');
const { ImportService } = require('../main/import/ImportService');
const { RecordService } = require('../main/services/RecordService');

const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
const HDR = ['Số phiếu', 'Ngày cân 1', 'Giờ cân 1', 'Ngày cân 2', 'Giờ cân 2', 'Biển số', 'Cân lần 1', 'Cân lần 2', 'KL hàng (kg)', 'Mã tuyến'];
const row = (no, d1, t1, d2, t2, plate, w1, w2) => [no, d1, t1, d2, t2, plate, w1, w2, w2 - w1, 'VC.007'];

test('Ca biết trước: đơn giá, từng xe, tổng kỳ, VAT, tổng tiền khớp tính tay; phiếu ngoài kỳ không vào; qua đêm tính theo ngày cân 1', async () => {
  const { store, periods } = await install('HAKQN', { withData: false });
  const imp = new ImportService(store); const rec = new RecordService(store, { importService: imp });
  const contractId = 'HD-HAKQN-QS';
  const tickets = [row('M1', '2026-09-18', '08:00:00', '2026-09-18', '09:00:00', '43H-01021', 13810, 31280), row('M2', '2026-09-19', '08:00:00', '2026-09-19', '09:00:00', '43H-01055', 13000, 29720),
    row('M3', '2026-09-20', '08:00:00', '2026-09-20', '09:00:00', '43H-01021', 13500, 31503), row('M4', '2026-09-20', '23:50:00', '2026-09-21', '00:20:00', '92H-00057', 14000, 29000),
    row('X1', '2026-09-17', '08:00:00', '2026-09-17', '09:00:00', '43H-01021', 13000, 30000), row('X2', '2026-09-21', '08:00:00', '2026-09-21', '09:00:00', '43H-01021', 13000, 30000)];
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-ka-')), 'm.csv'); fs.writeFileSync(f, `﻿${[HDR, ...tickets].map((r) => r.map(q).join(',')).join('\n')}`);
  const pv = await imp.preview({ importType: 'PHIEU_CAN', filePath: f, user: 'ketoan' });
  await imp.confirm({ batchId: pv.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' });
  const fuel = [['2026-09-19', 40, 29000], ['2026-09-19', 20, 30000], ['2026-09-20', -5, null]];
  const fr = await rec.saveFuelRows({ contractId, acceptWarnings: true, clientRequestId: rid(), user: KETOAN,
    rows: fuel.map(([d, qty, p]) => ({ receive_date: d, route_code: 'VC.007', fuel_vehicle_code: 'DH_92H00192', uom: 'LÍT', qty_liter: qty, fuel_price_excl_vat: p === null ? '' : p, giver_unit_code: 'DH' })) });
  assert.equal(fr.inserted, 3);
  const k = await periods.calculate({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-20', routeCode: 'VC.007', reportDate: '2026-09-24', clientRequestId: rid(), user: KETOAN });
  const r = k.results[0]; const pid = k.period.period_id;
  assert.equal(r.contractPrice, 115000, 'ĐG_HĐ'); assert.equal(r.transportPrice, 192000, 'ĐG VC làm tròn');
  const lines = store.find('BKVC_LINE', (l) => l.period_id === pid && l.is_current).sort((a, b) => (a.plate_no < b.plate_no ? -1 : 1));
  assert.deepEqual(lines.map((l) => [l.plate_no, l.kg, l.amount]), [['43H-01021', 35473, 6810816], ['43H-01055', 16720, 3210240], ['92H-00057', 15000, 2880000]]);
  const sum = (f2) => lines.reduce((a, l) => a + l[f2], 0);
  assert.equal(sum('amount'), 12901056); assert.equal(sum('vat'), 1032084); assert.equal(sum('amount_incl_vat'), 13933140);
  const inPeriod = store.find('TRANSPORT_DETAIL', (d) => d.period_id === pid && d.is_current).map((d) => store.get('PHIEU_CAN', d.ticket_id).ticket_no).sort();
  assert.deepEqual(inPeriod, ['M1', 'M2', 'M3', 'M4'], 'X1/X2 ngoài kỳ; M4 qua đêm tính theo ngày cân 1');
  // tổng kỳ trong dữ liệu chi tiết = tổng BKVC (kỳ chưa chốt vẫn phải khớp)
  assert.equal(store.find('TRANSPORT_CALCULATION', (c) => c.period_id === pid && c.is_current).length, 1);
});
