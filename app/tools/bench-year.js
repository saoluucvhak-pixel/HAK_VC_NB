'use strict';
/**
 * Chạy thử khối lượng 1 NĂM trên dữ liệu thật: nhân tuần thật 18–23/09/2026 (326 phiếu, 18 dòng dầu) thành N tuần liên tiếp
 * (dời ngày +7 ngày/tuần, số phiếu +1000/tuần), mỗi tuần làm đúng như kế toán:
 *   import file phiếu cân → import bảng kê dầu → tính kỳ → xác nhận → khóa → (mỗi 4 tuần) xuất BKVC Excel.
 * Đo thời gian từng bước, mở lại kho cuối năm, dung lượng thư mục dữ liệu.
 *
 *   node tools/bench-year.js [số tuần = 52] [thư mục làm việc]
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { openWorkbook } = require('../main/import/excelReader');
const M = require('../main/import/mapping');
const { JsonStore } = require('../main/repo/JsonStore');
const { ImportService } = require('../main/import/ImportService');
const { PeriodService } = require('../main/services/PeriodService');
const { ReportService } = require('../main/reports/ReportService');
const { loadDataFolder } = require('../tests/helpers');

const WEEKS = Number(process.argv[2] || 52);
const WORK = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-year-'));
const SRC = path.join(__dirname, '../tests/fixtures/excel/Dongiavanchuyen_24.09 QS-TS( XUẤT QS).xlsx');
const CONTRACT = 'HD-HAKQN-QS';
const CATALOG = ['DON_VI', 'XE', 'TUYEN_VC', 'HOP_DONG', 'PRICE_HISTORY', 'HOP_DONG_XE', 'CONFIG', 'USERS'];
const USER = { username: 'ketoan', role: 'KE_TOAN' };

const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const ms = (t0) => Number(process.hrtime.bigint() - t0) / 1e6;
const now = () => process.hrtime.bigint();
let rq = 0; const rid = () => `bench-${++rq}`;

function sheetOut(ws, rows, headerIdx, shiftDays, ticketCol, weekNo) {
  rows.forEach((r, i) => {
    const out = (r || []).map((c, j) => {
      if (c && typeof c === 'object' && c.__date) return i > headerIdx ? new Date(`${addDays(c.__date, shiftDays)}T00:00:00Z`) : new Date(`${c.__date}T00:00:00Z`);
      if (c && typeof c === 'object' && c.__time) return c.__time;
      if (i > headerIdx && j === ticketCol && c !== null && c !== '' && !Number.isNaN(Number(c))) return String(Number(c) + weekNo * 1000);
      return c;
    });
    ws.addRow(out);
  });
}

async function makeWeekFiles(dir) {
  const wb = await openWorkbook(SRC);
  const tSheet = 'NL_VC'; const fSheet = 'NL_GIAONHANDAU';
  const tRows = wb.rows(tSheet); const fRows = wb.rows(fSheet);
  const tH = M.detectHeaderRow(tRows, 'PHIEU_CAN'); const fH = M.detectHeaderRow(fRows, 'GIAO_NHAN_DAU');
  const map = M.suggestMapping(tRows[tH].map(String), 'PHIEU_CAN');
  const ticketCol = tRows[tH].findIndex((h) => map[String(h)] === 'ticket_no');
  const files = [];
  for (let w = 0; w < WEEKS; w++) {
    const out = new ExcelJS.Workbook();
    sheetOut(out.addWorksheet(tSheet), tRows, tH, 7 * w, ticketCol, w);
    sheetOut(out.addWorksheet(fSheet), fRows, fH, 7 * w, -1, w);
    const f = path.join(dir, `tuan_${String(w + 1).padStart(2, '0')}.xlsx`);
    await out.xlsx.writeFile(f); files.push(f);
  }
  return files;
}

function dirSize(d) {
  let n = 0; let files = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { const s = dirSize(p); n += s.bytes; files += s.files; } else { n += fs.statSync(p).size; files += 1; }
  }
  return { bytes: n, files };
}

(async () => {
  console.log(`Thư mục làm việc: ${WORK}`);
  const filesDir = path.join(WORK, 'files'); fs.mkdirSync(filesDir, { recursive: true });
  let t = now(); const files = await makeWeekFiles(filesDir);
  console.log(`Sinh ${files.length} file tuần: ${(ms(t) / 1000).toFixed(1)} s`);

  const seed = loadDataFolder('HAKQN');
  const data = path.join(WORK, 'DGVC_DATA');
  JsonStore.create(data, { installCode: 'HAKQN', unitCode: 'HAKQN', installId: 'INS-BENCH' });
  let store = new JsonStore(data).open();
  // hợp đồng + giá: mở hiệu lực đủ 1 năm để chạy thử (dữ liệu mẫu chỉ có hiệu lực quanh kỳ thật)
  await store.transaction((tx) => { for (const tb of CATALOG) for (const r of seed.rows[tb]) tx.insert(tb, r); }, { user: 'setup' });
  const imp = new ImportService(store); const per = new PeriodService(store); const rep = new ReportService(store);
  const rows = []; const prices = new Set();
  for (let w = 0; w < files.length; w++) {
    const from = addDays('2026-09-18', 7 * w); const to = addDays('2026-09-23', 7 * w);
    const r = { week: w + 1, from, to };
    t = now(); const a = await imp.preview({ importType: 'PHIEU_CAN', filePath: files[w], user: 'ketoan' });
    await imp.confirm({ batchId: a.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' }); r.importTickets = ms(t);
    if (a.summary.error) throw new Error(`Tuần ${w + 1}: ${a.summary.error} dòng lỗi phiếu cân`);
    t = now(); const b = await imp.preview({ importType: 'GIAO_NHAN_DAU', contractId: CONTRACT, filePath: files[w], user: 'ketoan' });
    await imp.confirm({ batchId: b.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' }); r.importFuel = ms(t);
    t = now();
    const pv = per.preview({ contractId: CONTRACT, dateFrom: from, dateTo: to, routeCode: 'VC.007' });
    if (!pv.canCalculate) throw new Error(`Tuần ${w + 1} không tính được: ${pv.issues.filter((i) => i.level === 'ERROR').map((i) => i.message).join('; ')}`);
    r.blocked = pv.blocked.length;
    r.fuelEarlier = (pv.issues.find((i) => i.code === 'I_FUEL_USED_EARLIER') || { params: { count: 0 } }).params.count;
    const k = await per.calculate({ contractId: CONTRACT, dateFrom: from, dateTo: to, routeCode: 'VC.007', clientRequestId: rid(), user: USER });
    r.calc = ms(t);
    t = now(); await per.confirm({ periodId: k.period.period_id, user: USER }); await per.lock({ periodId: k.period.period_id, user: USER }); r.confirmLock = ms(t);
    r.price = k.results[0].transportPrice; r.trips = k.results[0].tripCount; prices.add(r.price);
    if (w % 4 === 3) { t = now(); await rep.export({ report: 'BKVC', format: 'XLSX', params: { periodId: k.period.period_id }, targetPath: path.join(WORK, 'bao_cao', `BKVC_tuan_${w + 1}.xlsx`) }); r.export = ms(t); }
    rows.push(r);
    if ((w + 1) % 13 === 0 || w === 0) console.log(`tuần ${String(w + 1).padStart(2)} ${from}: phiếu ${r.importTickets.toFixed(0)} ms · dầu ${r.importFuel.toFixed(0)} ms · tính ${r.calc.toFixed(0)} ms · xác nhận+khóa ${r.confirmLock.toFixed(0)} ms · ĐG ${r.price}`);
  }
  store.close();
  t = now(); store = new JsonStore(data).open(); const openMs = ms(t);
  const count = (tb) => store.all(tb).length;
  const size = dirSize(data);
  const parts = fs.readdirSync(path.join(data, 'tables'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `${e.name}: ${fs.readdirSync(path.join(data, 'tables', e.name)).join(', ')}`);
  const avg = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0) / rows.filter((r) => r[k] !== undefined).length;
  const max = (k) => Math.max(...rows.map((r) => r[k] || 0));
  const summary = {
    weeks: rows.length, tickets: count('PHIEU_CAN'), fuel: count('GIAO_NHAN_DAU'), periods: count('KY_TINH'), details: count('TRANSPORT_DETAIL'), audit: count('AUDIT_LOG'),
    prices: [...prices], allTrips326: rows.every((r) => r.trips === 326), maxBlocked: max('blocked'),
    fuelEarlierLastWeek: rows[rows.length - 1].fuelEarlier,
    avgMs: { importTickets: avg('importTickets'), importFuel: avg('importFuel'), calc: avg('calc'), confirmLock: avg('confirmLock'), exportBkvc: avg('export') },
    maxMs: { importTickets: max('importTickets'), importFuel: max('importFuel'), calc: max('calc'), confirmLock: max('confirmLock') },
    firstWeek: rows[0], lastWeek: rows[rows.length - 1],
    reopenMs: openMs, dataFolderMB: size.bytes / 1048576, dataFiles: size.files, partitions: parts,
  };
  // tra cứu cuối năm
  t = now(); const hit = store.find('PHIEU_CAN', (x) => x.plate_no === '92H-00903' && x.weigh1_date >= '2027-01-01'); summary.lookupMs = ms(t); summary.lookupHits = hit.length;
  store.close();
  fs.writeFileSync(path.join(WORK, 'bench-year.json'), JSON.stringify({ summary, rows }, null, 1));
  console.log(JSON.stringify(summary, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
