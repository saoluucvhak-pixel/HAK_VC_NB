'use strict';
/**
 * Sao lưu / khôi phục phải mang theo dữ liệu Thuê vận chuyển (thư mục subcontract/ nằm CẠNH kho, ngoài bảng): trước 1.9.5 bản sao lưu bỏ sót nó →
 * chuyển máy hoặc khôi phục sau sự cố là mất toàn bộ các đợt nạp của đối tác. Kiểm cả hai loại kho (JSON và SQLite — đặt DGVC_STORAGE=sqlite):
 *  - bản sao lưu có subcontract/** + sidecar.json (kể cả khi 0 đợt); khôi phục lại đọc đúng đợt; tệp bị sửa → INTEGRITY_ERROR ở xem trước và khôi phục;
 *  - bản sao lưu CŨ (không sidecar) không đụng subcontract/ đang có; bản mới rỗng → khôi phục về rỗng;
 *  - lỗi giữa chừng → kho VÀ subcontract/ về đúng trạng thái trước khôi phục; bản sao lưu an toàn có subcontract/; sao lưu / khôi phục từ thư mục JSON.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { install, KETOAN, rid } = require('./install');
const { newStore } = require('../main/repo/createStore');
const { BackupService } = require('../main/services/BackupService');
const { SubcontractService } = require('../main/services/SubcontractService');
const { ExchangeService } = require('../main/services/ExchangeService');

const U = { username: 'admin', role: 'ADMIN' };
const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' };
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `dgvc-bs-${p}-`));
const entries = (file) => new AdmZip(file).getEntries().map((e) => e.entryName);
const subFiles = (root) => { const out = []; const walk = (d, rel) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else out.push(r); } }; walk(path.join(root, 'subcontract'), ''); return out.sort(); };

async function scene(failFirstReopen = false) {
  const c = await install('DH');
  const k = await c.periods.calculate({ contractId: c.contractId, ...W, excludeReceiptIds: [], reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  await c.periods.confirm({ periodId: k.period.period_id, user: KETOAN });
  let reopens = 0; const kind = c.store.storageKind;
  const bs = new BackupService(c.store, { reopen: (root) => { if (failFirstReopen && ++reopens === 1) throw new Error('mở lại kho lỗi (giả lập)'); return newStore(root, {}, kind).open(); } });
  const sub = () => new SubcontractService(bs.store, { exchange: new ExchangeService(bs.store) });
  const addBatch = (name) => sub().importBatch({ periodId: k.period.period_id, partnerName: 'ĐỐI TÁC THỬ', batchName: name, rentUnitPrice: 150000, fuelUnitPrice: 19500, deductFuel: true, user: KETOAN,
    jsonContent: { partnerName: 'ĐỐI TÁC THỬ', batchName: name, tickets: [{ ticket_no: `T-${name}`, weigh1_date: '2026-09-20', weigh1_time: '08:00:00', plate_no: '92H-00141', net_kg: 10000, route_code: 'VC.007' }],
      fuel: [{ receipt_no: `D-${name}`, receipt_date: '2026-09-20', plate_no: '92H-00141', qty_liter: 100 }] } });
  return { ...c, bs, sub, addBatch, period: k.period };
}

test('Sao lưu mang theo subcontract/ + sidecar.json; xóa rồi khôi phục: đợt nạp đọc lại y nguyên', async () => {
  const c = await scene(); const b1 = await c.addBatch('ĐỢT-1'); const before = c.sub().getBatch({ batchId: b1.batchId }); const listBefore = c.sub().list({ periodId: c.period.period_id });
  const bk = await c.bs.backup({ kind: 'manual', user: U }); const names = entries(bk.file);
  assert.ok(names.includes('subcontract/batches.json'), 'có danh sách đợt'); assert.ok(names.includes(`subcontract/files/${b1.batchId}.json`), 'có dữ liệu từng đợt'); assert.ok(names.includes('sidecar.json'));
  assert.equal(JSON.parse(new AdmZip(bk.file).readAsText('backup-info.json')).sidecarFiles, 2, 'ghi số tệp trong backup-info');
  fs.rmSync(path.join(c.store.root, 'subcontract'), { recursive: true, force: true }); assert.deepEqual(c.sub().list({ periodId: c.period.period_id }), [], 'đã mất sạch');
  const i = c.bs.inspect({ file: bk.file }); assert.equal(i.subcontractFiles, 2); assert.match(i.subcontractNote, /2 tệp/);
  const r = await c.bs.restore({ file: bk.file, reason: 'thử', user: U }); assert.equal(r.subcontractFiles, 2);
  assert.deepEqual(c.sub().list({ periodId: c.period.period_id }), listBefore, 'danh sách đợt như cũ'); assert.deepEqual(c.sub().getBatch({ batchId: b1.batchId }), before, 'chi tiết đợt như cũ');
  assert.ok(!fs.existsSync(path.join(c.store.root, 'subcontract.before-restore')) && !fs.existsSync(path.join(c.store.root, 'subcontract.restoring')), 'không để thư mục tạm');
  assert.ok(entries(r.safetyBackup).includes('sidecar.json'), 'bản sao lưu an toàn cũng mang subcontract'); r.store.close();
});

test('Tệp Thuê vận chuyển trong bản sao lưu bị sửa → INTEGRITY_ERROR ở xem trước và khôi phục; dữ liệu hiện có không đổi', async () => {
  const c = await scene(); const b1 = await c.addBatch('ĐỢT-1'); const bk = await c.bs.backup({ kind: 'manual', user: U });
  const z = new AdmZip(bk.file); const e = z.getEntry(`subcontract/files/${b1.batchId}.json`); z.updateFile(e, Buffer.from(JSON.stringify({ sua: 'tay' }))); const bad = path.join(tmp('bad'), 'bad.zip'); z.writeZip(bad);
  assert.throws(() => c.bs.inspect({ file: bad }), (e2) => e2.code === 'INTEGRITY_ERROR' && /sai SHA-256/.test(e2.message));
  const files0 = subFiles(c.store.root);
  await assert.rejects(c.bs.restore({ file: bad, reason: 'thử', user: U }), (e2) => e2.code === 'INTEGRITY_ERROR');
  assert.deepEqual(subFiles(c.store.root), files0, 'subcontract/ hiện có không đổi'); c.store.close();
});

test('Bản sao lưu CŨ (không có sidecar): khôi phục KHÔNG đụng subcontract/ đang có; xem trước nói rõ', async () => {
  const c = await scene(); await c.addBatch('ĐỢT-1'); const bk = await c.bs.backup({ kind: 'manual', user: U });
  const z = new AdmZip(bk.file); for (const n of entries(bk.file)) if (n === 'sidecar.json' || n.startsWith('subcontract/')) z.deleteFile(n); const old = path.join(tmp('old'), 'cu.zip'); z.writeZip(old);
  await c.addBatch('ĐỢT-2'); const files0 = subFiles(c.store.root); const content0 = fs.readFileSync(path.join(c.store.root, 'subcontract', 'batches.json'), 'utf8');
  const i = c.bs.inspect({ file: old }); assert.equal(i.subcontractFiles, null); assert.match(i.subcontractNote, /chưa có dữ liệu Thuê vận chuyển.*giữ nguyên/);
  const r = await c.bs.restore({ file: old, reason: 'thử', user: U }); assert.equal(r.subcontractFiles, null);
  assert.deepEqual(subFiles(c.store.root), files0); assert.equal(fs.readFileSync(path.join(c.store.root, 'subcontract', 'batches.json'), 'utf8'), content0); r.store.close();
});

test('Bản sao lưu MỚI lúc chưa có đợt nào (sidecar rỗng): khôi phục đưa subcontract/ về rỗng', async () => {
  const c = await scene(); const bk = await c.bs.backup({ kind: 'manual', user: U });
  assert.ok(entries(bk.file).includes('sidecar.json'), 'luôn có sidecar, kể cả 0 tệp'); assert.equal(JSON.parse(new AdmZip(bk.file).readAsText('backup-info.json')).sidecarFiles, 0);
  await c.addBatch('ĐỢT-SAU'); assert.equal(c.sub().list({ periodId: c.period.period_id }).length, 1);
  const r = await c.bs.restore({ file: bk.file, reason: 'thử', user: U }); assert.deepEqual(c.sub().list({ periodId: c.period.period_id }), []); assert.deepEqual(subFiles(c.store.root), []); r.store.close();
});

test('Lỗi giữa chừng (mở lại kho lỗi): kho VÀ subcontract/ về đúng trạng thái trước khôi phục', async () => {
  const c = await scene(true); await c.addBatch('ĐỢT-1'); const bk = await c.bs.backup({ kind: 'manual', user: U });
  const code = c.bs.store.all('DON_VI')[0].unit_code; // tra theo mã (thứ tự dòng của kho SQLite không cố định sau khi mở lại)
  await c.addBatch('ĐỢT-2'); await c.bs.store.transaction((tx) => tx.update('DON_VI', code, { unit_name: 'TÊN SAU SAO LƯU' }), { user: 'test' });
  const files0 = subFiles(c.store.root); const content0 = fs.readFileSync(path.join(c.store.root, 'subcontract', 'batches.json'), 'utf8');
  await assert.rejects(c.bs.restore({ file: bk.file, reason: 'thử', user: U }), /mở lại kho lỗi/);
  assert.deepEqual(subFiles(c.store.root), files0, 'subcontract/ như trước (cả đợt 2)'); assert.equal(fs.readFileSync(path.join(c.store.root, 'subcontract', 'batches.json'), 'utf8'), content0);
  assert.equal(c.bs.store.get('DON_VI', code).unit_name, 'TÊN SAU SAO LƯU', 'bảng cũng như trước'); assert.equal(c.sub().list({ periodId: c.period.period_id }).length, 2);
  assert.ok(!fs.existsSync(path.join(c.store.root, 'subcontract.before-restore')) && !fs.existsSync(path.join(c.store.root, 'subcontract.restoring'))); c.bs.store.close();
});

test('Tệp tạm của lần ghi nguyên tử (.tmp-…) không bị chụp vào bản sao lưu', async () => {
  const c = await scene(); await c.addBatch('ĐỢT-1'); fs.writeFileSync(path.join(c.store.root, 'subcontract', 'files', 'X.json.tmp-123'), 'nửa vời'); fs.writeFileSync(path.join(c.store.root, 'subcontract', 'batches.json.tmp-9'), 'nửa vời');
  const bk = await c.bs.backup({ kind: 'manual', user: U }); assert.ok(!entries(bk.file).some((n) => /\.tmp-/.test(n)), 'không có tệp tạm'); c.store.close();
});

test('Sao lưu JSON ra thư mục + khôi phục từ thư mục mang theo subcontract/ (chỉ kho JSON)', { skip: process.env.DGVC_STORAGE === 'sqlite' && 'chỉ kho JSON' }, async () => {
  const c = await scene(); const b1 = await c.addBatch('ĐỢT-1'); const before = c.sub().getBatch({ batchId: b1.batchId });
  const dest = path.join(tmp('json'), 'DGVC_JSON'); await c.bs.exportJsonFolder({ dest, user: U });
  assert.ok(fs.existsSync(path.join(dest, 'subcontract', 'batches.json')) && fs.existsSync(path.join(dest, 'subcontract', 'files', `${b1.batchId}.json`)), 'thư mục xuất có subcontract/');
  fs.rmSync(path.join(c.store.root, 'subcontract'), { recursive: true, force: true });
  const r = await c.bs.restore({ file: path.join(dest, 'manifest.json'), reason: 'thử', user: U });
  assert.deepEqual(c.sub().getBatch({ batchId: b1.batchId }), before, 'khôi phục từ thư mục: đợt về đủ'); r.store.close();
});
