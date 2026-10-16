'use strict';
/**
 * Lưu trữ theo năm (bản 1.2.5): định dạng gọn + chia tháng, tự chuyển dữ liệu cũ; lưu trữ đến hết năm Y (kỳ vắt năm giữ lại),
 * mở xem chỉ đọc, chặn nhập vào năm đã lưu trữ, mở lại năm → dữ liệu trở lại nguyên vẹn.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { install, KETOAN, ADMIN, rid, FILE } = require('./install');
const { JsonStore, SCHEMA } = require('../main/repo/JsonStore');
const { sha256 } = require('../main/repo/Journal');
const { ArchiveService } = require('../main/services/ArchiveService');
const { BackupService } = require('../main/services/BackupService');
const { ReportService } = require('../main/reports/ReportService');
const { ImportService } = require('../main/import/ImportService');
const { MasterDataService } = require('../main/services/MasterDataService');
const { expandRaw } = require('../main/services/TicketService');

const snap = (store, tables) => Object.fromEntries(tables.map((t) => [t, JSON.stringify(store.all(t).slice().sort((a, b) => String(a[SCHEMA.tables[t].pk]).localeCompare(String(b[SCHEMA.tables[t].pk]))))]));
const TABLES = ['PHIEU_CAN', 'GIAO_NHAN_DAU', 'KY_TINH', 'TRANSPORT_CALCULATION', 'TRANSPORT_DETAIL', 'FUEL_DETAIL', 'BKVC_LINE', 'CALC_RUN'];

/** Đưa thư mục dữ liệu về định dạng cũ (bản ≤ 1.2.4): mỗi dòng 1 object, thụt lề, mỗi năm 1 file. */
function toOldFormat(dir) {
  const s = new JsonStore(dir).open(); const data = Object.fromEntries(Object.keys(SCHEMA.tables).map((t) => [t, s.all(t)])); const m = s.manifest; s.close();
  for (const rel of Object.keys(m.files)) fs.unlinkSync(path.join(dir, rel));
  m.files = {};
  for (const [t, def] of Object.entries(SCHEMA.tables)) {
    const groups = new Map();
    if (!def.partition) groups.set(null, data[t]); else for (const r of data[t]) { const k = String(r[def.partition[1]]).slice(0, 4); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    for (const [k, rows] of groups) {
      const rel = k === null ? `tables/${t}.json` : `tables/${t}/${k}.json`;
      const buf = Buffer.from(JSON.stringify({ table: t, partition: k, schemaVersion: 1, columns: def.columns.map((c) => c.name), rows }, null, 1));
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), buf); m.files[rel] = { sha256: sha256(buf), rows: rows.length };
    }
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 1));
}

test('Dữ liệu định dạng cũ → mở được, compact() chuyển sang định dạng gọn + chia tháng, số liệu giữ nguyên từng ô, nhỏ hơn', async () => {
  const { store, dir, periods, contractId } = await install('DH');
  await periods.calculate({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', clientRequestId: rid(), user: KETOAN });
  const before = snap(store, [...TABLES, 'AUDIT_LOG', 'XE', 'CONFIG']); store.close();
  toOldFormat(dir);
  assert.ok(fs.existsSync(path.join(dir, 'tables/PHIEU_CAN/2026.json')));
  const s = new JsonStore(dir).open();
  assert.equal(s.needsCompaction, true);
  assert.deepEqual(snap(s, [...TABLES, 'AUDIT_LOG', 'XE', 'CONFIG']), before, 'đọc định dạng cũ đúng');
  const r = await s.compact();
  assert.ok(r.after < r.before / 1.5, `nhỏ hơn: ${r.before} → ${r.after}`);
  assert.ok(!fs.existsSync(path.join(dir, 'tables/PHIEU_CAN/2026.json')));
  assert.ok(fs.existsSync(path.join(dir, 'tables/PHIEU_CAN/2026/2026-09.json')));
  s.close();
  const s2 = new JsonStore(dir).open();
  assert.equal(s2.needsCompaction, false);
  assert.deepEqual(snap(s2, [...TABLES, 'AUDIT_LOG', 'XE', 'CONFIG']), before, 'sau chuyển đổi: từng ô giữ nguyên');
  // dữ liệu gốc trong file: lưu mảng giá trị, hiện lại đủ tên cột
  const t = s2.all('PHIEU_CAN')[0];
  assert.ok(Array.isArray(JSON.parse(t.raw_row_json)));
  assert.equal(expandRaw(s2, t)['Số phiếu'], t.ticket_no);
  s2.close();
});

test('Lưu trữ đến hết năm 2026: kỳ vắt năm giữ lại; mở app không nạp; báo cáo tự mở xem chỉ đọc; chặn nhập năm đã lưu trữ; mở lại năm → nguyên vẹn', async () => {
  const { store, dir, periods, contractId } = await install('DH');
  const k1 = await periods.calculate({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-20', routeCode: 'VC.007', clientRequestId: rid(), user: KETOAN });
  await periods.confirm({ periodId: k1.period.period_id, user: KETOAN });
  // kỳ 21–23/09 giả lập "vắt sang năm sau" (Đến ngày 2027) → phải giữ lại cùng phiếu / dầu của nó
  const k2 = await periods.calculate({ contractId, dateFrom: '2026-09-21', dateTo: '2026-09-23', routeCode: 'VC.007', overrides: [{ code: 'E_NO_FUEL', routeCode: 'VC.007', fuelPrice: 29000, reason: 'thử' }], clientRequestId: rid(), user: KETOAN });
  await store.transaction((tx) => tx.update('KY_TINH', k2.period.period_id, { date_to: '2027-01-03' }), { user: 'test' });
  const before = snap(store, TABLES);
  const backup = new BackupService(store); const ar = new ArchiveService(store, { backup });

  const pv = ar.preview({ year: 2026 });
  assert.equal(pv.periods, 1); assert.deepEqual(pv.keptPeriods, [k2.period.period_code]);
  assert.ok(pv.checks.some((w) => /năm hiện tại/.test(w.message)));
  const keptT = store.find('TRANSPORT_DETAIL', (d) => d.period_id === k2.period.period_id).map((d) => d.ticket_id);
  const r = await ar.archive({ year: 2026, reason: 'thử', user: ADMIN });
  assert.ok(fs.existsSync(r.zip)); assert.ok(fs.existsSync(path.join(dir, 'archive/2026/archive-manifest.json')));
  assert.equal(store.archivedThrough, 2026);
  assert.equal(store.get('KY_TINH', k1.period.period_id), null, 'kỳ đã chốt năm 2026 đã chuyển đi');
  assert.ok(store.get('KY_TINH', k2.period.period_id), 'kỳ vắt năm giữ lại');
  const live = new Set(store.all('PHIEU_CAN').map((t) => t.ticket_id));
  assert.deepEqual([...live].sort(), [...new Set(keptT)].sort(), 'chỉ còn phiếu của kỳ vắt năm');
  // sao lưu hằng ngày chỉ gồm kho đang dùng
  const b = await backup.backup({ kind: 'manual' });
  assert.ok(b.sizeBytes < r.sizeBytes + 200000);
  store.close();

  // mở lại app: không nạp năm lưu trữ
  const s = new JsonStore(dir).open();
  assert.equal(s.all('PHIEU_CAN').length, live.size);
  const ar2 = new ArchiveService(s, { backup: new BackupService(s) }); const rs = new ReportService(s);
  const y = ar2.years().items.find((x) => x.year === 2026);
  assert.equal(y.archived, true); assert.equal(y.archive.folderOk, true); assert.equal(y.canReopen, true);
  // báo cáo khoảng ngày 2026 → tự mở xem
  await ar2.ensureFor({ dateFrom: '2026-09-01', dateTo: '2026-09-30' });
  assert.deepEqual([...s.mounted.keys()], ['2026']);
  assert.equal(rs.ticketList({ dateFrom: '2026-09-18', dateTo: '2026-09-23' }).rows.length, 77);
  assert.equal(rs.bkvc({ periodId: k1.period.period_id }).totals.kg, 639730, 'in lại BKVC kỳ đã lưu trữ');
  // chỉ xem: sửa dòng lưu trữ bị chặn
  const archT = s.all('PHIEU_CAN').find((t) => !live.has(t.ticket_id));
  await assert.rejects(s.transaction((tx) => tx.update('PHIEU_CAN', archT.ticket_id, { ldd: 'x' })), /đã lưu trữ/);
  // ghi kho khi đang xem: dòng lưu trữ không bị ghi lại vào kho đang dùng
  const keep = s.all('PHIEU_CAN').find((t) => live.has(t.ticket_id));
  await s.transaction((tx) => tx.update('PHIEU_CAN', keep.ticket_id, { ldd: 'sửa khi đang xem' }), { user: 'test' });
  await ar2.unmount({});
  assert.equal(s.all('PHIEU_CAN').length, live.size);
  // nhập phiếu năm đã lưu trữ → lỗi ngay ở xem trước
  const imp = new ImportService(s);
  const pvi = await imp.preview({ importType: 'PHIEU_CAN', filePath: FILE.DH, user: 'ketoan' });
  assert.ok(pvi.rows.every((x) => x.issues.some((i) => i.code === 'E_YEAR_ARCHIVED') || x.status === 'DUPLICATE' || x.status === 'UPDATE'));
  await imp.cancel({ batchId: pvi.batchId });
  // xe có dữ liệu năm lưu trữ → không đổi biển số
  assert.match(new MasterDataService(s).vehicleUsage({ plateNo: archT.plate_no }).blockers.join(), /năm đã lưu trữ 2026/);
  s.close();
  const s3 = new JsonStore(dir).open(); assert.equal(s3.get('PHIEU_CAN', keep.ticket_id).ldd, 'sửa khi đang xem'); assert.equal(s3.all('PHIEU_CAN').length, live.size);

  // mở lại năm → mọi thứ trở lại
  const ar3 = new ArchiveService(s3, { backup: new BackupService(s3) });
  await assert.rejects(ar3.reopen({ year: 2026, user: ADMIN }), /lý do/);
  await ar3.reopen({ year: 2026, reason: 'cần nhập bổ sung', user: ADMIN });
  assert.equal(s3.archivedThrough, 0);
  const after = snap(s3, TABLES);
  for (const t of TABLES) if (t !== 'PHIEU_CAN') assert.equal(after[t], before[t], `${t} giữ nguyên sau mở lại`);
  assert.equal(s3.all('PHIEU_CAN').length, 77);
  s3.close();
  const s4 = new JsonStore(dir).open(); assert.equal(s4.all('PHIEU_CAN').length, 77); assert.equal(s4.all('KY_TINH').length, 2); s4.close();
});

test('Máy mới thiếu thư mục lưu trữ → báo rõ; nạp lại từ file zip lưu trữ → xem được', async () => {
  const { store, dir } = await install('DH');
  const ar = new ArchiveService(store, { backup: new BackupService(store) });
  const r = await ar.archive({ year: 2026, reason: 'thử', user: ADMIN });
  const zipCopy = path.join(path.dirname(dir), `copy-${path.basename(r.zip)}`); fs.copyFileSync(r.zip, zipCopy);
  fs.rmSync(path.join(dir, 'archive/2026'), { recursive: true });
  assert.equal(ar.years().items.find((x) => x.year === 2026).archive.folderOk, false);
  await assert.rejects(ar.mount({ year: 2026 }), /Thiếu thư mục lưu trữ năm 2026/);
  await ar.restoreFile({ file: zipCopy });
  await ar.mount({ year: 2026 });
  assert.equal(store.all('PHIEU_CAN').length, 77);
  store.close();
});

void ExcelJS;
