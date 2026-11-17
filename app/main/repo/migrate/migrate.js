'use strict';
/**
 * Di chuyển kho JSON → SQLite (và xuất ngược SQLite → JSON) — GIAI ĐOẠN 2 của kế hoạch lưu trữ (báo cáo §5).
 *
 * Trình tự (mỗi bước dừng an toàn, kho JSON nguồn KHÔNG bị sửa / xóa):
 *   [1] kiểm kho nguồn (mở bằng JsonStore: SHA-256, journal; dung lượng trống ≥ 3× kho)
 *   [2] bản sao an toàn (BackupService, không ghi audit vào nguồn) + verify
 *   [3] dựng `dgvc.sqlite.migrating` (cùng thư mục) bằng MỘT giao dịch; có sẵn tệp tạm từ lần trước → xóa, dựng lại (nguồn bất biến nên xác định)
 *   [4] kiểm chứng: mở lại DB tạm bằng chính SqliteStore, so số dòng + dấu vân tay `canon` từng bảng + bộ đếm sinh mã + dataVersion + bất biến nghiệp vụ kỳ đã chốt
 *   [5] đổi tên nguyên tử dgvc.sqlite.migrating → dgvc.sqlite (cùng ổ) + ghi STORAGE_MIGRATED.json + báo cáo
 * "Điểm chốt" (đổi cấu hình `storage: 'sqlite'`) do người gọi làm SAU khi hàm này trả về `verified: true` (AppContext.migrateStorage).
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { JsonStore, SCHEMA } = require('../JsonStore');
const { SqliteStore, DB_FILE } = require('../SqliteStore');
const { AppError } = require('../../../shared/errors');

const TMP_DB = `${DB_FILE}.migrating`;
const sha256File = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rmIf = (p) => { try { fs.rmSync(p, { force: true }); } catch { /* không có */ } };
const rmDbFiles = (base) => { for (const sfx of ['', '-wal', '-shm', '-journal']) rmIf(base + sfx); };
function fsyncDir(dir) { try { const fd = fs.openSync(dir, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } } catch { /* Windows */ } }
function dirSize(d) { let n = 0; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['backups', 'exports', 'logs', 'archive'].includes(e.name)) n += dirSize(p); } else n += fs.statSync(p).size; } return n; }
function freeBytes(dir) { try { const s = fs.statfsSync(dir); return Number(s.bavail) * Number(s.bsize); } catch { return Infinity; } }

/** Bất biến nghiệp vụ của kỳ đã chốt: tổng dòng BKVC (tiền, VAT, chuyến, kg) từng kỳ; mỗi phiếu / dòng dầu tối đa 1 kỳ đã chốt; bộ đếm ≥ số lớn nhất trong ID. */
function businessInvariants(store) {
  const per = {}; const problems = [];
  for (const p of store.find('KY_TINH', (k) => k.status === 'DA_XAC_NHAN' || k.status === 'DA_KHOA')) {
    const lines = store.find('BKVC_LINE', (l) => l.period_id === p.period_id && l.is_current);
    const sum = (f) => lines.reduce((a, l) => a + (Number(l[f]) || 0), 0);
    per[p.period_id] = { status: p.status, lines: lines.length, trips: sum('trip_count'), kg: sum('kg'), amount: sum('amount'), vat: sum('vat'), total: sum('amount_incl_vat') };
  }
  const closed = (r) => r.is_current && (r.usage_state === 'CONFIRMED' || r.usage_state === 'LOCKED');
  for (const [tbl, key] of [['TRANSPORT_DETAIL', 'ticket_id'], ['FUEL_DETAIL', 'receipt_id']]) {
    const seen = new Set();
    for (const r of store.find(tbl, closed)) { const k = `${r.contract_id}|${r[key]}`; if (seen.has(k)) problems.push(`${tbl}: ${k} dùng ở nhiều kỳ đã chốt`); seen.add(k); }
  }
  const seq = store.snapshot().sequences; const maxByPrefix = {};
  for (const [t, def] of Object.entries(SCHEMA.tables)) {
    for (const r of store.all(t)) { const m = /^([A-Z]+)-[A-Z0-9]+-(\d+)$/.exec(String(r[def.pk])); if (m) maxByPrefix[m[1]] = Math.max(maxByPrefix[m[1]] || 0, Number(m[2])); }
  }
  for (const [pre, mx] of Object.entries(maxByPrefix)) if ((seq[pre] || 0) < mx && seq[pre] !== undefined) problems.push(`bộ đếm ${pre}=${seq[pre]} < số lớn nhất đang có ${mx}`);
  return { periods: per, problems };
}

/** So hai kho (nguồn ↔ đích): số dòng, dấu vân tay từng bảng, bộ đếm, dataVersion, bất biến nghiệp vụ. */
function compareStores(src, dst, { checkDataVersion = true } = {}) {
  const a = src.fingerprint(); const b = dst.fingerprint(); const problems = [];
  for (const t of Object.keys(SCHEMA.tables)) {
    if (a.perTable[t].rows !== b.perTable[t].rows) problems.push(`${t}: số dòng ${a.perTable[t].rows} ≠ ${b.perTable[t].rows}`);
    else if (a.perTable[t].sha256 !== b.perTable[t].sha256) problems.push(`${t}: dấu vân tay khác`);
  }
  if (a.sequences !== b.sequences) problems.push('bộ đếm sinh mã khác');
  if (checkDataVersion && src.dataVersion !== dst.dataVersion) problems.push(`dataVersion ${src.dataVersion} ≠ ${dst.dataVersion}`);
  const ia = businessInvariants(src); const ib = businessInvariants(dst);
  if (JSON.stringify(ia.periods) !== JSON.stringify(ib.periods)) problems.push('tổng kỳ đã chốt khác nguyên trạng');
  problems.push(...ib.problems.map((x) => `đích: ${x}`));
  return { ok: problems.length === 0, problems, rows: Object.fromEntries(Object.entries(a.perTable).map(([t, v]) => [t, v.rows])), fingerprint: a.sha256, invariants: ia.periods };
}

function dbHealth(dst) {
  const out = [];
  const q = (sql, key) => dst.db.prepare(sql).get()[key];
  if (q('PRAGMA integrity_check', 'integrity_check') !== 'ok') out.push('integrity_check không ok');
  if (dst.db.prepare('PRAGMA foreign_key_check').all().length) out.push('foreign_key_check có lỗi');
  return out;
}

/**
 * Di chuyển. opts: { root, dryRun=false, backup=true, user='system', now=()=>new Date(), log=()=>{} }
 * Trả { verified, dryRun, report, dbPath, safetyBackup }. Lỗi ở bất kỳ bước nào → ném AppError, kho nguồn nguyên vẹn, DB tạm bị xóa.
 */
async function migrateJsonToSqlite({ root, dryRun = false, backup = true, user = 'system', now = () => new Date(), log = () => {} } = {}) {
  if (!root) throw new AppError('VALIDATION_FAILED', 'Thiếu thư mục dữ liệu');
  const finalDb = path.join(root, DB_FILE); const tmpDb = path.join(root, TMP_DB);
  if (!fs.existsSync(path.join(root, 'manifest.json'))) throw new AppError('NOT_FOUND', `Không phải kho JSON: ${root}`);
  const srcManifestPath = path.join(root, 'manifest.json'); const srcShaBefore = sha256File(srcManifestPath);
  const started = now().toISOString(); const report = { tool: 'migrateJsonToSqlite', startedAt: started, root, dryRun, steps: [] };
  const step = (name, extra = {}) => { report.steps.push({ name, at: now().toISOString(), ...extra }); log(name); };

  // [1] kiểm kho nguồn
  const src = new JsonStore(root).open();
  let tmpBuilt = false;
  try {
    if (src.mounted.size) throw new AppError('VALIDATION_FAILED', 'Đang xem năm lưu trữ — thôi xem rồi chạy lại');
    const need = dirSize(root) * 3; const free = freeBytes(root);
    if (free < need) throw new AppError('STORAGE_ERROR', `Không đủ dung lượng trống (cần ≥ ${need} byte, còn ${free})`);
    report.source = { dataVersion: src.dataVersion, schemaVersion: src.schemaVersion, installId: src.installId, unitCode: src.unitCode, manifestSha256: srcShaBefore, rows: src.stats().rows };
    step('1-kiem-nguon', { dataVersion: src.dataVersion });

    // [2] bản sao an toàn
    let safety = null;
    if (backup && !dryRun) {
      const { BackupService } = require('../../services/BackupService');
      const bs = new BackupService(src, { now });
      safety = await bs.backup({ kind: 'safety', note: 'truoc-chuyen-sqlite', user: { username: user }, audit: false });
      bs.verify(safety.file);
      step('2-ban-sao-an-toan', { file: path.basename(safety.file), sha256: safety.sha256 });
    } else step('2-ban-sao-an-toan', { skipped: true });

    // [3] dựng DB tạm (xóa tệp tạm cũ nếu có)
    rmDbFiles(tmpDb);
    const manifest = { ...src.manifest, storage: 'sqlite', migration: { from: 'json', at: started, sourceManifestSha256: srcShaBefore, sourceDataVersion: src.dataVersion, appVersion: require('../../../package.json').version } };
    SqliteStore.populate(tmpDb, manifest, (t) => src.all(t).filter((r) => !src.isMountedRow(t, r[SCHEMA.tables[t].pk])));
    tmpBuilt = true; step('3-dung-db-tam', { bytes: fs.statSync(tmpDb).size });

    // [4] kiểm chứng bằng chính đường đọc của ứng dụng
    const dst = new SqliteStore(root, { dbFile: TMP_DB, noLock: true }).open();
    let cmp; let health;
    try { cmp = compareStores(src, dst); health = dbHealth(dst); } finally { dst.close(); }
    const problems = [...cmp.problems, ...health];
    report.verification = { ok: problems.length === 0, problems, fingerprint: cmp.fingerprint, rows: cmp.rows, closedPeriods: cmp.invariants };
    step('4-kiem-chung', { ok: problems.length === 0, problems });
    if (problems.length) throw new AppError('INTEGRITY_ERROR', `Kiểm chứng di chuyển thất bại (${problems.length} lỗi): ${problems.slice(0, 3).join('; ')}`, { problems });

    if (dryRun) { rmDbFiles(tmpDb); step('dry-run-xong-xoa-db-tam'); report.verified = true; return finish(report, { verified: true, dryRun: true, dbPath: null, safetyBackup: null }); }

    // [5] đổi tên nguyên tử (DB tạm đã đóng + checkpoint → không còn -wal/-shm cần đi kèm)
    if (fs.existsSync(finalDb)) { const aside = `${finalDb}.replaced-${Date.now()}`; fs.renameSync(finalDb, aside); rmDbFiles(finalDb); step('5a-db-cu-dat-sang-mot-ben', { aside: path.basename(aside) }); }
    rmIf(`${tmpDb}-wal`); rmIf(`${tmpDb}-shm`);
    fs.renameSync(tmpDb, finalDb); fsyncDir(root); tmpBuilt = false;
    fs.writeFileSync(path.join(root, 'STORAGE_MIGRATED.json'), JSON.stringify({ migratedAt: started, from: 'json', to: 'sqlite', sourceManifestSha256: srcShaBefore, sourceDataVersion: src.dataVersion, fingerprint: cmp.fingerprint, note: 'Kho JSON cũ (manifest.json, tables/, journal/) được ĐÓNG BĂNG làm đường lui — không còn nhận giao dịch mới' }, null, 1));
    step('5-doi-ten-xong', { db: DB_FILE });
    report.verified = true;
    return finish(report, { verified: true, dryRun: false, dbPath: finalDb, safetyBackup: safety && safety.file });
  } catch (e) {
    if (tmpBuilt) rmDbFiles(tmpDb);
    report.failed = { code: e.code || 'ERROR', message: e.message }; throw e;
  } finally {
    src.close();
    report.sourceUnchanged = sha256File(srcManifestPath) === srcShaBefore;
  }

  function finish(rep, res) {
    rep.finishedAt = now().toISOString();
    if (!res.dryRun) { try { const dir = path.join(root, 'backups', 'safety'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `migration-report-${started.replace(/[:.]/g, '-')}.json`), JSON.stringify(rep, null, 1)); } catch { /* báo cáo là phụ */ } }
    return { ...res, report: rep };
  }
}

/**
 * Xuất ngược SQLite → thư mục JSON mới (đường lui sau khi đã có giao dịch mới trên SQLite): `dest` phải trống / chưa có. Kiểm chứng như bước [4].
 * dataVersion của kho JSON mới bắt đầu lại từ 1 (dấu vân tay không gồm dataVersion).
 */
async function exportSqliteToJson({ root, dest, now = () => new Date() } = {}) {
  if (!root || !dest) throw new AppError('VALIDATION_FAILED', 'Thiếu thư mục nguồn / đích');
  if (fs.existsSync(dest) && fs.readdirSync(dest).length) throw new AppError('VALIDATION_FAILED', `Thư mục đích phải trống: ${dest}`);
  const src = new SqliteStore(root).open();
  try {
    const m = src.manifest;
    JsonStore.create(dest, { installCode: m.installCode, unitCode: m.unitCode, installId: m.installId, appVersion: m.appVersion });
    const out = new JsonStore(dest).open();
    try {
      await out.transaction((tx) => {
        for (const t of Object.keys(SCHEMA.tables)) tx.restoreRows(t, src.all(t).filter((r) => !src.isMountedRow(t, r[SCHEMA.tables[t].pk])).map((r) => ({ ...r })));
        tx.sequences = { ...(m.sequences || {}) };
        for (const k of ['archives', 'lastBackupAt', 'createdAt']) if (m[k] !== undefined) tx.setManifest(k, m[k]);
      }, { user: 'export-json' });
      const cmp = compareStores(src, out, { checkDataVersion: false });
      if (!cmp.ok) throw new AppError('INTEGRITY_ERROR', `Kiểm chứng xuất ngược thất bại: ${cmp.problems.slice(0, 3).join('; ')}`, { problems: cmp.problems });
      return { ok: true, dest, dataVersionSource: src.dataVersion, dataVersionExport: out.dataVersion, fingerprint: cmp.fingerprint, rows: cmp.rows, at: now().toISOString() };
    } finally { out.close(); }
  } finally { src.close(); }
}

module.exports = { migrateJsonToSqlite, exportSqliteToJson, compareStores, businessInvariants, TMP_DB };
