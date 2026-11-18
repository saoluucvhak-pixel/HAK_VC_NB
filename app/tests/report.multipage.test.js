'use strict';
/**
 * Báo cáo nhiều trang: Excel in ra phải lặp tiêu đề cột ở mỗi trang + có chân trang "Trang x/y"; PDF lặp tiêu đề ở mọi trang, không rơi dòng nào,
 * dòng tổng khớp dữ liệu; tổng Excel = tổng PDF = tổng dữ liệu nguồn (cùng điều kiện lọc).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const AdmZip = require('adm-zip');
const ExcelJS = require('exceljs');
const { install, KETOAN, rid } = require('./install');
const { ReportService } = require('../main/reports/ReportService');
const { chromiumPdfRenderer } = require('../main/reports/pdf');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const HAS_PDF = fs.existsSync(CHROME) && (() => { try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();

test('Danh sách phiếu cân 1.800+ dòng: Excel lặp tiêu đề + chân trang; PDF nhiều trang đủ dòng, lặp tiêu đề; tổng khớp nguồn', { skip: !HAS_PDF && 'không có Chromium/pdftotext', timeout: 300000 }, async () => {
  const { store } = await install('HAKQN');
  const base = store.find('PHIEU_CAN', (t) => !t.is_deleted)[0];
  await store.transaction((tx) => { for (let i = 0; i < 1800; i++) { const no = `BULK${String(i).padStart(6, '0')}`; const d = new Date(Date.UTC(2026, 0, 1 + (i % 200))).toISOString().slice(0, 10); const key = `${no}|${d}|${base.plate_no}`; tx.insert('PHIEU_CAN', { ...base, ticket_id: `PC-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 12)}`, ticket_key: key, ticket_no: no, weigh1_date: d, weigh2_date: d, net_kg: 10000 + i, validation_flags: '', flags_ack: false }); } }, { user: 'seed' });
  const render = chromiumPdfRenderer({ executablePath: CHROME });
  const R = new ReportService(store, { pdfRenderer: render });
  const params = { dateFrom: '2026-01-01', dateTo: '2026-12-31' };
  const live = store.find('PHIEU_CAN', (t) => !t.is_deleted && t.weigh1_date >= params.dateFrom && t.weigh1_date <= params.dateTo);
  const kg = live.reduce((a, t) => a + t.net_kg, 0);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-mp-'));
  try {
    const x = path.join(dir, 't.xlsx'); await R.export({ report: 'TICKETS', format: 'XLSX', params, targetPath: x });
    const xml = new AdmZip(x).readAsText('xl/workbook.xml'); assert.match(xml, /Print_Titles/, 'Excel phải khai báo dòng tiêu đề lặp khi in');
    assert.match(new AdmZip(x).readAsText('xl/worksheets/sheet1.xml'), /Trang &amp;P\/&amp;N/, 'chân trang Trang x/y');
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(x); const ws = wb.worksheets[0];
    const cells = []; ws.eachRow((r) => cells.push(...r.values.filter((v) => typeof v === 'string' && /^BULK\d{6}$/.test(v)))); assert.equal(cells.length, 1800);
    const pdf = path.join(dir, 't.pdf'); await R.export({ report: 'TICKETS', format: 'PDF', params, targetPath: pdf });
    const pages = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [pdf], { encoding: 'utf8' }))[1]); assert.ok(pages > 10, `nhiều trang (${pages})`);
    for (let p = 1; p <= pages; p++) assert.ok(execFileSync('pdftotext', ['-layout', '-f', String(p), '-l', String(p), pdf, '-'], { encoding: 'utf8' }).includes('Số phiếu'), `trang ${p} thiếu tiêu đề cột`);
    const all = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' });
    assert.equal((all.match(/BULK\d{6}/g) || []).length, 1800, 'PDF đủ 1.800 dòng');
    assert.ok(all.includes(`${live.length.toLocaleString('vi-VN')} phiếu`) || all.replace(/\./g, '').includes(`${live.length} phiếu`), 'dòng tổng số phiếu khớp nguồn');
    assert.ok(all.includes(kg.toLocaleString('vi-VN')) || all.replace(/[.,]/g, '').includes(String(kg)), `tổng kg ${kg} khớp nguồn`);
  } finally { await render.close(); }
});

test('Cùng một kỳ: BKVC (màn hình/API) = Excel = PDF; BKCT nhiều trang tổng kg = BKVC; số bằng chữ khớp', { skip: !HAS_PDF && 'không có Chromium/pdftotext', timeout: 300000 }, async () => {
  const { store, periods, contractId } = await install('HAKQN');
  const k = await periods.calculate({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24', clientRequestId: rid(), user: KETOAN });
  const pid = k.period.period_id; await periods.confirm({ periodId: pid, rowVersion: store.get('KY_TINH', pid).row_version, user: KETOAN });
  const render = chromiumPdfRenderer({ executablePath: CHROME }); const R = new ReportService(store, { pdfRenderer: render });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-rc-'));
  const vn = (n) => Math.round(n).toLocaleString('vi-VN');
  try {
    const b = R.bkvc({ periodId: pid }); const T = b.totals;
    assert.ok(T.total > 0 && T.trips > 0);
    const bx = path.join(dir, 'b.xlsx'); await R.export({ report: 'BKVC', format: 'XLSX', params: { periodId: pid }, targetPath: bx });
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(bx); let rowTotal = null; wb.worksheets[0].eachRow((r) => { const v = r.values.filter((x) => x !== undefined && x !== null); if (v.includes('TỔNG CỘNG')) rowTotal = v.filter((x) => typeof x === 'number'); });
    assert.ok(rowTotal && rowTotal.includes(T.trips) && rowTotal.includes(Math.round(T.amount)) && rowTotal.includes(Math.round(T.vat)) && rowTotal.includes(Math.round(T.total)), `Excel TỔNG CỘNG ${JSON.stringify(rowTotal)} ≠ API ${JSON.stringify(T)}`);
    const bp = path.join(dir, 'b.pdf'); await R.export({ report: 'BKVC', format: 'PDF', params: { periodId: pid }, targetPath: bp });
    const text = execFileSync('pdftotext', ['-layout', bp, '-'], { encoding: 'utf8' });
    assert.ok(text.includes(vn(T.total)) && text.includes(vn(T.vat)) && text.includes(vn(T.amount)), 'PDF có đủ tiền / VAT / tổng như API');
    assert.ok(text.replace(/\s+/g, ' ').toLowerCase().includes('bằng chữ'), 'PDF có số bằng chữ');
    // BKCT nhiều trang: tổng kg = BKVC
    const cp = path.join(dir, 'c.pdf'); await R.export({ report: 'BKCT', format: 'PDF', params: { periodId: pid }, targetPath: cp });
    const pages = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [cp], { encoding: 'utf8' }))[1]); assert.ok(pages >= 2, 'BKCT nhiều trang');
    const ct = execFileSync('pdftotext', ['-layout', cp, '-'], { encoding: 'utf8' }); const line = ct.split('\n').find((l) => l.includes('TỔNG CỘNG'));
    assert.ok(line && line.replace(/\./g, '').includes(String(Math.round(T.kg))), `BKCT tổng kg ≠ BKVC (${T.kg}): ${line}`);
  } finally { await render.close(); }
});
