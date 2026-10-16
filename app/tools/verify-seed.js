'use strict';
/**
 * Chạy Engine trên thư mục dữ liệu mẫu và in bảng so sánh APP ↔ Excel (QR_DGVC (2)).
 *   node tools/verify-seed.js [đường dẫn data_seed]
 * Không sửa kết quả cho khớp: chỉ báo KHỚP / KHÁC kèm giá trị hai bên.
 */
const path = require('node:path');
process.env.DGVC_SEED = process.argv[2] || process.env.DGVC_SEED || path.resolve(__dirname, '../data_seed');
const E = require('../main/engine');
const { loadDataFolder, fixture } = require('../tests/helpers');

const EXCEL = fixture('excel_expected.json');
const ROWS = [
  ['Số chuyến', 'tripCount'], ['Tổng KL (Tấn)', 'totalTon'], ['Dầu Diezel thực nhận', 'actualFuelLiter'],
  ['Nhiên liệu dầu Diezel tiêu hao theo định mức (lít)', 'standardFuelLiter'], ['CL Tiêu hao Diezel ', 'fuelDiffLiter'],
  ['Đơn giá dầu', 'fuelPrice'], ['Đơn giá theo hợp đồng (chưa bao gồm nhiên liệu)', 'contractPrice'],
  ['Đơn giá CL Diezel', 'fuelAdjustPrice'], ['Đơn giá vận chuyển', 'transportPrice'],
];
let allOk = true;
for (const [inst, cid] of [['HAKQN', 'HD-HAKQN-QS'], ['DH', 'HD-DH-HAKQN'], ['HAK', 'HD-HAK-HAKQN']]) {
  const { manifest, rows } = loadDataFolder(inst);
  const out = E.calculatePeriod({
    contract: rows.HOP_DONG.find((c) => c.contract_id === cid), contractVehicles: rows.HOP_DONG_XE, units: rows.DON_VI, routes: rows.TUYEN_VC,
    prices: rows.PRICE_HISTORY, tickets: rows.PHIEU_CAN, receipts: rows.GIAO_NHAN_DAU, installUnitCode: manifest.unitCode, cfg: E.buildConfig(rows.CONFIG),
    params: { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' },
  });
  const r = out.results[0];
  console.log(`\n=== Bản cài ${inst} · ${cid} · kỳ 18–23/09/2026 · VC.007 ===`);
  for (const [xl, js] of ROWS) {
    const a = r[js]; const b = EXCEL[inst][xl]; const ok = a === b;
    allOk &&= ok;
    console.log(`${ok ? 'KHỚP' : 'KHÁC'}  ${xl.trim().padEnd(52)} APP ${String(a).padStart(22)}   Excel ${String(b).padStart(22)}`);
  }
  console.log(`BKVC: ${out.bkvc.lines.length} xe · ${out.bkvc.totals.trips} chuyến · thành tiền ${out.bkvc.totals.amount} · VAT ${out.bkvc.totals.vat} · tổng ${out.bkvc.totals.total}`);
  console.log(`Cảnh báo: ${[...new Set(out.issues.map((i) => i.code))].join(', ') || '—'}`);
}
console.log(`\n${allOk ? 'TẤT CẢ KHỚP EXCEL' : 'CÓ CHỈ TIÊU KHÁC EXCEL — xem các dòng KHÁC'}`);
process.exitCode = allOk ? 0 : 1;
