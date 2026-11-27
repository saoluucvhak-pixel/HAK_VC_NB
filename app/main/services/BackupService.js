'use strict';
/**
 * BackupService — sao lưu / khôi phục thư mục dữ liệu (DATA_STORAGE_DESIGN §5).
 *   daily   : lần ghi đầu tiên mỗi ngày (autoDaily) — giữ BACKUP_DAILY_KEEP bản
 *   monthly : lần đầu tiên của THÁNG chưa có bản monthly (bất kể ngày nào) — giữ BACKUP_MONTHLY_KEEP bản
 *   manual  : nút "Sao lưu ngay" — không tự xóa
 *   safety  : trước khôi phục / nhập gói / đổi thư mục — giữ 10 bản
 * Sao lưu ra ngoài: sau mỗi bản, chép file zip sang BACKUP_MIRROR_FOLDER (USB, ổ mạng, thư mục Google Drive for Desktop) nếu BACKUP_MIRROR_ENABLED:
 *   chép ra <tên>.part → đọc lại kiểm SHA-256 → khớp mới đổi tên; giữ tối đa BACKUP_MIRROR_KEEP bản (mặc định 60; 0 = không xóa).
 * File zip kho JSON: manifest.json + tables/** (không có .lock, journal, backups, exports, logs). Kiểm SHA-256 từng file theo manifest khi khôi phục.
 * File zip kho SQLite (giai đoạn 2): dgvc.db (ảnh chụp nhất quán bằng VACUUM INTO — KHÔNG chép thô tệp khi còn -wal) + backup-info.json {storageFormat:'sqlite', userVersion,
 *   schemaVersion, dataVersion, dbSha256, rows, installId, unitCode}. Bản sao lưu JSON CŨ vẫn khôi phục được vào kho SQLite (Q9) qua trình di chuyển.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const { AppError } = require('../../shared/errors');
const os = require('node:os');

const KINDS = ['daily', 'monthly', 'manual', 'safety'];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const stamp = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ── Dữ liệu NGOÀI kho nằm cạnh kho, mà trước 1.9.5 sao lưu bỏ sót (chuyển máy / khôi phục sau sự cố là MẤT):
//   subcontract/        — phân hệ Thuê vận chuyển: các đợt nạp của đối tác (batches.json + files/<đợt>.json);
//   archive/<năm>/      — dữ liệu các năm đã "Lưu trữ" (chuyển khỏi kho đang dùng; chủ sản phẩm chốt 24/11/2026: đưa vào sao lưu thường).
// Bản sao lưu mới LUÔN có sidecar.json (kể cả khi 0 tệp) ghi danh sách thư mục + SHA-256 từng tệp: phân biệt "lúc sao lưu chưa có gì" với "bản sao lưu cũ
// (trước 1.9.5)": cũ → khôi phục KHÔNG đụng các thư mục này; mới → thay đúng như lúc sao lưu (cùng thời điểm với bảng).
const SIDECAR = 'sidecar.json';
const SUB = 'subcontract';
const ARC = 'archive';
const SIDE_DIRS = [SUB, ARC];
const SKIP_TMP = /\.tmp-|\.part$/; // tệp tạm của lần ghi nguyên tử (ghi tệp tạm rồi đổi tên) — không chụp nửa vời
/** Mọi tệp ngoài kho cần sao lưu, theo đường dẫn tương đối so với `root` (vd "subcontract/batches.json", "archive/2025/…"). archive/ chỉ lấy thư mục năm 4 chữ số
 *  (bỏ bản cũ *.old-… / *.mo-lai-… / *.tmp mà ArchiveService giữ lại). `dirs` = chỉ xét các thư mục này. */
function listSidecar(root, dirs = SIDE_DIRS) {
  const out = [];
  for (const dir of dirs) {
    const base = path.join(root, dir); if (!fs.existsSync(base)) continue;
    const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!rel && dir === ARC && !/^\d{4}$/.test(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r); else if (e.isFile() && !SKIP_TMP.test(e.name)) out.push(`${dir}/${r}`);
    } };
    walk(base, '');
  }
  return out.sort(); // subcontract/batches.json đứng trước subcontract/files/…: tệp đợt luôn được ghi TRƯỚC danh sách, nên không bao giờ chụp được dòng danh sách trỏ vào tệp chưa có
}
/** Thêm các tệp ngoài kho + sidecar.json vào zip. `always` = ghi đủ mọi thư mục kể cả khi chưa có (bản sao lưu mới); không thì chỉ các thư mục ĐANG có (thư mục JSON). */
function addSidecar(zip, root, always) {
  const dirs = SIDE_DIRS.filter((d) => always || fs.existsSync(path.join(root, d))); if (!dirs.length) return 0;
  const files = {};
  for (const name of listSidecar(root, dirs)) { const buf = fs.readFileSync(path.join(root, name)); zip.addFile(name, buf); files[name] = { sha256: sha(buf), size: buf.length }; }
  zip.addFile(SIDECAR, Buffer.from(JSON.stringify({ version: 2, dirs, files }, null, 1)));
  return Object.keys(files).length;
}
const safeSidecarName = (n) => { const x = String(n).replace(/\\/g, '/'); return SIDE_DIRS.some((d) => x.startsWith(`${d}/`)) && !x.split('/').some((p) => p === '..' || p === '' || p === '.') && !path.isAbsolute(x) && !/^[A-Za-z]:/.test(x); };
const dirOfName = (n) => String(n).replace(/\\/g, '/').split('/')[0];
/** Đọc + kiểm sidecar.json trong zip: null = bản sao lưu cũ (không có); ngoài ra {files, names, dirs, counts}. Thiếu tệp / sai SHA-256 / tên lạ → INTEGRITY_ERROR. */
function checkSidecar(zip) {
  const buf = zip.readFile(SIDECAR); if (!buf) return null;
  let sc; try { sc = JSON.parse(buf.toString('utf8')); } catch (e) { throw new AppError('INTEGRITY_ERROR', `sidecar.json hỏng: ${e.message}`); }
  const bad = []; const files = sc && sc.files && typeof sc.files === 'object' ? sc.files : {};
  const dirs = (Array.isArray(sc && sc.dirs) ? sc.dirs : [SUB]).filter((d) => SIDE_DIRS.includes(d)); // bản đầu (chỉ subcontract) không có trường dirs
  for (const [name, meta] of Object.entries(files)) {
    if (!safeSidecarName(name)) { bad.push(`${name}: tên không hợp lệ`); continue; }
    const b = zip.readFile(name); if (!b) bad.push(`${name}: thiếu`); else if (sha(b) !== meta.sha256) bad.push(`${name}: sai SHA-256`);
  }
  if (bad.length) throw new AppError('INTEGRITY_ERROR', `Dữ liệu Thuê vận chuyển / năm lưu trữ trong bản sao lưu không toàn vẹn: ${bad.join('; ')}`, { problems: bad });
  const names = Object.keys(files); const counts = Object.fromEntries(SIDE_DIRS.map((d) => [d, names.filter((n) => dirOfName(n) === d).length]));
  return { files: names.length, names, dirs, counts };
}

class BackupService {
  /** @param reopen  hàm (root) => kho mới đã mở — dùng sau khôi phục */
  constructor(store, { reopen, now = () => new Date() } = {}) { this.store = store; this.reopen = reopen; this.now = now; }

  _cfg(k, d) { const r = this.store.all('CONFIG').find((c) => c.config_key === k); return r && r.config_value !== '' && r.config_value != null ? r.config_value : d; }
  _dir(kind) { const d = path.join(this.store.root, 'backups', kind); fs.mkdirSync(d, { recursive: true }); return d; }

  /** Tạo 1 bản sao lưu; trả {file, kind, sizeBytes, sha256, mirrored}. */
  async backup({ kind = 'manual', note = '', user = { username: 'system' }, audit = true } = {}) {
    if (!KINDS.includes(kind)) throw new AppError('VALIDATION_FAILED', `Loại sao lưu không hợp lệ: ${kind}`);
    await this.store.queue; // chờ giao dịch đang ghi xong → chụp trạng thái nhất quán
    const root = this.store.root; const zip = new AdmZip();
    let m; let extra = {};
    if (this.store.storageKind === 'sqlite') {
      const snap = path.join(os.tmpdir(), `dgvc-snap-${process.pid}-${Date.now()}.sqlite`);
      try {
        const { userVersion } = this.store.snapshotDbTo(snap); // ảnh chụp nhất quán, không kèm -wal
        const db = fs.readFileSync(snap); zip.addFile('dgvc.db', db);
        const st = this.store; m = { installId: st.installId, unitCode: st.unitCode, dataVersion: st.dataVersion };
        extra = { storageFormat: 'sqlite', userVersion, schemaVersion: st.schemaVersion, dbSha256: sha(db), rows: st.stats().rows };
      } finally { for (const sfx of ['', '-wal', '-shm']) { try { fs.rmSync(snap + sfx, { force: true }); } catch { /* không có */ } } }
    } else {
      const manifest = fs.readFileSync(path.join(root, 'manifest.json'));
      zip.addFile('manifest.json', manifest);
      m = JSON.parse(manifest);
      for (const rel of Object.keys(m.files)) {
        const p = path.join(root, rel);
        if (!fs.existsSync(p)) throw new AppError('INTEGRITY_ERROR', `Thiếu tệp sao lưu ${rel}`);
        const data = fs.readFileSync(p);
        if (sha(data) !== m.files[rel].sha256) throw new AppError('INTEGRITY_ERROR', `Tệp sao lưu ${rel} sai SHA-256`);
        zip.addFile(rel.replace(/\\/g, '/'), data);
      }
    }
    const sidecarFiles = addSidecar(zip, root, true); // dữ liệu Thuê vận chuyển nằm ngoài kho (xem SIDECAR)
    const info = { app: 'DGVC', kind, note, createdAt: this.now().toISOString(), createdBy: user.username, installId: m.installId, unitCode: m.unitCode, dataVersion: m.dataVersion, sidecarFiles, ...extra };
    zip.addFile('backup-info.json', Buffer.from(JSON.stringify(info, null, 1)));
    const createdAt = new Date(info.createdAt);
    const name = `DGVC_${m.unitCode}_${stamp(createdAt)}-${String(createdAt.getMilliseconds()).padStart(3, '0')}_${kind}${note ? `_${note.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 30)}` : ''}_${crypto.randomUUID()}.zip`;
    const file = path.join(this._dir(kind), name);
    const buf = zip.toBuffer(); fs.writeFileSync(`${file}.part`, buf); fs.renameSync(`${file}.part`, file);
    const out = { file, kind, sizeBytes: buf.length, sha256: sha(buf), mirrored: null, createdAt: info.createdAt };
    out.mirrored = this._mirror(file);
    this._rotate();
    if (audit) await this.store.transaction((tx) => tx.audit('BACKUP', 'DATA', kind, null, { file: name, sizeBytes: buf.length, mirrored: out.mirrored }), { user: user.username });
    return out;
  }

  _mirror(file) {
    if (String(this._cfg('BACKUP_MIRROR_ENABLED', 'FALSE')).toUpperCase() !== 'TRUE') return null;
    const dest = this._cfg('BACKUP_MIRROR_FOLDER', '');
    const done = (r) => { this.lastMirror = { ...r, at: this.now().toISOString() }; return r; };
    if (!dest) return done({ ok: false, message: 'Chưa chọn thư mục sao lưu ngoài (USB / Google Drive)' });
    let part = '';
    try {
      if (!fs.existsSync(dest)) return done({ ok: false, message: `Không thấy thư mục ${dest} — USB chưa cắm hoặc Google Drive chưa chạy` });
      const d = path.join(dest, 'DGVC_BACKUP', this.store.unitCode); fs.mkdirSync(d, { recursive: true });
      const to = path.join(d, path.basename(file)); part = `${to}.part`;
      fs.copyFileSync(file, part);
      if (sha(fs.readFileSync(part)) !== sha(fs.readFileSync(file))) { fs.rmSync(part, { force: true }); return done({ ok: false, message: `Bản chép ra ${dest} bị sai nội dung (SHA-256) — kiểm tra USB/ổ mạng` }); }
      fs.renameSync(part, to); part = '';
      this._rotateMirror(d);
      return done({ ok: true, path: to });
    } catch (e) { if (part) { try { fs.rmSync(part, { force: true }); } catch { /* không có */ } } return done({ ok: false, message: `Không chép được ra ${dest}: ${e.message}` }); }
  }

  /**
   * Thư mục ngoài: xoay vòng THEO TỪNG LOẠI (tên tệp có _daily / _safety / _monthly / _manual).
   * daily + safety: giữ tối đa BACKUP_MIRROR_KEEP bản mỗi loại (mặc định 60; 0 = không xóa); monthly: giữ BACKUP_MONTHLY_KEEP như trên máy; manual: không tự xóa.
   * Rà soát 1.8.2: trước đây đếm chung mọi loại → bản tháng và bản thủ công ở USB/Drive bị xóa sau ~2 tháng.
   */
  _rotateMirror(dir) {
    const keep = Number(this._cfg('BACKUP_MIRROR_KEEP', 60)); if (!(keep > 0)) return;
    const limit = { daily: keep, safety: keep, monthly: Number(this._cfg('BACKUP_MONTHLY_KEEP', 24)) || 24 };
    const kindOf = (f) => (/_(daily|monthly|manual|safety)(?:_|\.zip$)/.exec(f) || [])[1] || '';
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.zip')).sort();
    for (const [kind, n] of Object.entries(limit)) {
      const mine = files.filter((f) => kindOf(f) === kind);
      for (const f of mine.slice(0, Math.max(0, mine.length - n))) { try { fs.rmSync(path.join(dir, f)); } catch { /* bỏ qua */ } }
    }
  }

  _rotate() {
    const keep = { daily: Number(this._cfg('BACKUP_DAILY_KEEP', 30)), monthly: Number(this._cfg('BACKUP_MONTHLY_KEEP', 24)), safety: 10 };
    for (const [kind, n] of Object.entries(keep)) {
      const files = fs.readdirSync(this._dir(kind)).filter((f) => f.endsWith('.zip')).sort();
      for (const f of files.slice(0, Math.max(0, files.length - n))) fs.rmSync(path.join(this._dir(kind), f));
    }
  }

  /**
   * Gọi sau mỗi lần ghi (hoặc lúc mở APP): hôm nay chưa có bản daily → tạo; THÁNG này chưa có bản monthly → tạo (bất kể ngày).
   * Gọi dồn dập (không chờ) dùng chung MỘT lượt chạy; ngày đã kiểm xong thì không quét thư mục nữa.
   */
  autoDaily() {
    const today = localDate(this.now()).replace(/-/g, '');
    if (this._autoRunning) return this._autoRunning;
    if (this._autoCheckedDay === today) return Promise.resolve([]);
    this._autoRunning = (async () => {
      try {
        const made = [];
        const has = (kind, prefix) => fs.readdirSync(this._dir(kind)).some((f) => f.includes(`_${prefix}`));
        if (!has('daily', today)) made.push(await this.backup({ kind: 'daily' }));
        if (!has('monthly', today.slice(0, 6))) made.push(await this.backup({ kind: 'monthly' }));
        this._autoCheckedDay = today;
        return made;
      } finally { this._autoRunning = null; }
    })();
    return this._autoRunning;
  }

  list() {
    const items = [];
    for (const kind of KINDS) {
      for (const f of fs.readdirSync(this._dir(kind)).filter((x) => x.endsWith('.zip'))) {
        const p = path.join(this._dir(kind), f); const st = fs.statSync(p);
        let info = {}; try { info = JSON.parse(new AdmZip(p).readAsText('backup-info.json') || '{}'); } catch { info = { broken: true }; }
        items.push({ file: p, name: f, kind, sizeBytes: st.size, createdAt: info.createdAt || st.mtime.toISOString(), note: info.note || '', dataVersion: info.dataVersion, unitCode: info.unitCode, broken: !!info.broken });
      }
    }
    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const last = items.find((i) => i.kind !== 'safety');
    const ageDays = last ? (this.now() - new Date(last.createdAt)) / 86400000 : null;
    return { items, lastMirror: this.lastMirror || null, lastBackupAt: last ? last.createdAt : null, warning: ageDays === null || ageDays > 7 ? { code: 'W_BACKUP_OLD', message: ageDays === null ? 'Chưa có bản sao lưu nào' : `Đã ${Math.floor(ageDays)} ngày chưa sao lưu` } : null };
  }

  /** Kiểm 1 file sao lưu (JSON hoặc SQLite): đúng định dạng, đủ file, SHA-256 khớp; SQLite thêm mở chỉ đọc + integrity_check + đối chiếu số dòng. */
  /** Dựng "zip trong bộ nhớ" từ THƯ MỤC dữ liệu JSON (chọn file manifest.json): kiểm SHA-256 từng tệp rồi dùng chung luồng khôi phục. */
  _zipFromJsonFolder(dir) {
    const mp = path.join(dir, 'manifest.json'); let m;
    try { m = JSON.parse(fs.readFileSync(mp, 'utf8')); } catch (e) { throw new AppError('INTEGRITY_ERROR', `manifest.json không đọc được: ${e.message}`); }
    if (!m || m.app !== 'DGVC' || !m.files) throw new AppError('INTEGRITY_ERROR', 'Không phải manifest.json của thư mục dữ liệu DGVC');
    const zip = new AdmZip(); zip.addFile('manifest.json', fs.readFileSync(mp));
    for (const rel of Object.keys(m.files)) {
      const p = path.join(dir, rel); if (!fs.existsSync(p)) throw new AppError('INTEGRITY_ERROR', `Thư mục dữ liệu thiếu tệp ${rel} — chép đủ thư mục (manifest.json + tables) rồi chọn lại`, { problems: [`${rel}: thiếu`] });
      zip.addFile(rel.replace(/\\/g, '/'), fs.readFileSync(p));
    }
    addSidecar(zip, dir, false); // có thư mục subcontract/ cạnh manifest.json thì mang theo (không có thì không đụng dữ liệu hiện có)
    zip.addFile('backup-info.json', Buffer.from(JSON.stringify({ app: 'DGVC', kind: 'folder', note: 'thư mục dữ liệu JSON', installId: m.installId, unitCode: m.unitCode, dataVersion: m.dataVersion, createdAt: m.lastBackupAt || '' })));
    return zip;
  }

  verify(file) {
    if (!fs.existsSync(file)) throw new AppError('NOT_FOUND', `Không có file ${file}`);
    let zip;
    if (/\.json$/i.test(file)) {
      if (path.basename(file).toLowerCase() !== 'manifest.json') throw new AppError('VALIDATION_FAILED', 'Chọn file sao lưu .zip, hoặc file manifest.json nằm trong thư mục dữ liệu JSON (cùng thư mục với tables/)');
      zip = this._zipFromJsonFolder(path.dirname(file));
    } else {
      try { zip = new AdmZip(file); } catch (e) { throw new AppError('INTEGRITY_ERROR', `File sao lưu hỏng: ${e.message}`); }
    }
    const dbBuf = zip.readFile('dgvc.db');
    if (dbBuf) { const r = this._verifySqlite(zip, dbBuf); r.sidecar = checkSidecar(zip); return r; }
    const mBuf = zip.readFile('manifest.json'); if (!mBuf) throw new AppError('INTEGRITY_ERROR', 'File sao lưu không có manifest.json');
    const m = JSON.parse(mBuf); const bad = [];
    for (const [rel, meta] of Object.entries(m.files)) { const b = zip.readFile(rel.replace(/\\/g, '/')); if (!b) bad.push(`${rel}: thiếu`); else if (sha(b) !== meta.sha256) bad.push(`${rel}: sai SHA-256`); }
    if (bad.length) throw new AppError('INTEGRITY_ERROR', `File sao lưu không toàn vẹn: ${bad.join('; ')}`, { problems: bad });
    return { manifest: m, zip, storageFormat: 'json', sidecar: checkSidecar(zip) };
  }

  _verifySqlite(zip, dbBuf) {
    let info = {}; try { info = JSON.parse(zip.readAsText('backup-info.json') || '{}'); } catch { /* thiếu info */ }
    if (info.dbSha256 && sha(dbBuf) !== info.dbSha256) throw new AppError('INTEGRITY_ERROR', 'File sao lưu không toàn vẹn: dgvc.db sai SHA-256', { problems: ['dgvc.db: sai SHA-256'] });
    const tmp = path.join(os.tmpdir(), `dgvc-verify-${process.pid}-${Date.now()}.sqlite`); fs.writeFileSync(tmp, dbBuf);
    try {
      const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(tmp, { readOnly: true });
      try {
        const ic = db.prepare('PRAGMA integrity_check').get().integrity_check;
        if (ic !== 'ok') throw new AppError('INTEGRITY_ERROR', 'File sao lưu không toàn vẹn: integrity_check không ok', { problems: [ic] });
        const row = db.prepare('SELECT "value" FROM "_meta" WHERE "key"=?').get('manifest'); if (!row) throw new AppError('INTEGRITY_ERROR', 'File sao lưu không có manifest trong dgvc.db');
        const man = JSON.parse(row.value); const bad = [];
        for (const [t, n] of Object.entries(info.rows || {})) { const c = db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c; if (c !== n) bad.push(`${t}: ${c} dòng ≠ ${n}`); }
        if (bad.length) throw new AppError('INTEGRITY_ERROR', `File sao lưu không toàn vẹn: ${bad.join('; ')}`, { problems: bad });
        return { manifest: { installId: man.installId, unitCode: man.unitCode, dataVersion: man.dataVersion, schemaVersion: man.schemaVersion }, zip, storageFormat: 'sqlite' };
      } finally { db.close(); }
    } finally { for (const sfx of ['', '-wal', '-shm']) { try { fs.rmSync(tmp + sfx, { force: true }); } catch { /* không có */ } } }
  }

  /**
   * Khôi phục: kiểm → sao lưu an toàn hiện trạng → đóng kho → thay dữ liệu → mở lại. Trả store mới.
   *  kho JSON × bản JSON: thay tables/ + manifest.json (như trước)
   *  kho SQLite × bản SQLite: thay dgvc.sqlite bằng ảnh chụp (đổi tên nguyên tử, giữ bản cũ tới khi mở lại thành công)
   *  kho SQLite × bản JSON CŨ (Q9): giải ra thư mục tạm, chạy trình di chuyển + kiểm chứng rồi thay dgvc.sqlite
   *  kho JSON × bản SQLite: từ chối (dùng công cụ xuất ngược trước)
   */
  /** Xem trước một file sao lưu (zip / manifest.json) TRƯỚC khi khôi phục: không đổi gì. */
  inspect({ file }) {
    const { manifest, storageFormat, zip, sidecar } = this.verify(file);
    let info = {}; try { info = JSON.parse(zip.readAsText('backup-info.json') || '{}'); } catch { /* thiếu info */ }
    const sameInstall = manifest.installId === this.store.installId; const sameUnit = manifest.unitCode === this.store.unitCode;
    const kindHere = this.store.storageKind;
    const problem = !sameUnit ? `Sao lưu của đơn vị ${manifest.unitCode}, bản cài này là ${this.store.unitCode} — không khôi phục được`
      : kindHere === 'json' && storageFormat === 'sqlite' ? 'Bản sao lưu này là của kho SQLite — không khôi phục vào kho JSON (xuất ngược SQLite → JSON trước)' : '';
    return { file, storageFormat, unitCode: manifest.unitCode, installId: manifest.installId, dataVersion: manifest.dataVersion, createdAt: info.createdAt || '', kind: info.kind || '', note: info.note || '',
      sameInstall, sameUnit, canRestore: !problem, problem, needsOtherInstallConfirm: sameUnit && !sameInstall,
      subcontractFiles: sidecar ? sidecar.counts[SUB] : null, archiveFiles: sidecar ? sidecar.counts[ARC] : null,
      subcontractNote: sidecar ? `Dữ liệu Thuê vận chuyển: ${sidecar.counts[SUB]} tệp; năm lưu trữ: ${sidecar.counts[ARC]} tệp (sẽ thay các thư mục hiện có)` : 'Bản sao lưu này chưa có dữ liệu Thuê vận chuyển và năm lưu trữ (tạo trước 1.9.5): giữ nguyên các dữ liệu đó đang có' };
  }

  /**
   * Xuất BẢN CHỤP JSON ra thư mục mới (manifest.json + tables/** + snapshot-info.json). Dùng làm sao lưu đọc được bằng mắt / lưu trữ lâu dài;
   * khôi phục bằng "Khôi phục từ file… → chọn manifest.json" hoặc "Dùng dữ liệu có sẵn". Chỉ kho JSON (kho SQLite dùng AppContext.exportStorageToJson).
   */
  async exportJsonFolder({ dest, user = { username: 'system' } }) {
    if (this.store.storageKind !== 'json') throw new AppError('VALIDATION_FAILED', 'Kho đang là SQLite — dùng "Xuất ngược ra JSON"');
    if (!dest) throw new AppError('VALIDATION_FAILED', 'Chọn thư mục đích');
    if (fs.existsSync(dest) && fs.readdirSync(dest).length) throw new AppError('VALIDATION_FAILED', 'Thư mục đích phải trống');
    await this.store.queue; // chờ giao dịch đang ghi xong → chụp nhất quán
    const root = this.store.root; const mBuf = fs.readFileSync(path.join(root, 'manifest.json')); const m = JSON.parse(mBuf);
    fs.mkdirSync(dest, { recursive: true });
    for (const [rel, meta] of Object.entries(m.files)) {
      const buf = fs.readFileSync(path.join(root, rel)); if (sha(buf) !== meta.sha256) throw new AppError('INTEGRITY_ERROR', `Tệp ${rel} sai SHA-256 — dừng xuất`);
      const to = path.join(dest, rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, buf);
    }
    fs.writeFileSync(path.join(dest, 'manifest.json'), mBuf);
    for (const dir of SIDE_DIRS) fs.mkdirSync(path.join(dest, dir), { recursive: true }); // luôn có (kể cả rỗng): khôi phục từ thư mục này thay đúng như lúc xuất
    for (const name of listSidecar(root)) { const to = path.join(dest, name); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(root, name), to); }
    const info = { app: 'DGVC', source: 'json', exportedAt: new Date().toISOString(), exportedBy: user.username, dataVersion: m.dataVersion, schemaVersion: m.schemaVersion, installId: m.installId, unitCode: m.unitCode,
      appVersion: require('../../package.json').version, files: Object.keys(m.files).length, rows: this.store.stats().rows };
    fs.writeFileSync(path.join(dest, 'snapshot-info.json'), JSON.stringify(info, null, 1));
    await this.store.transaction((tx) => tx.audit('EXPORT_JSON', 'DATA', 'snapshot', null, { dest, dataVersion: m.dataVersion }), { user: user.username });
    return { ok: true, dest, files: info.files, dataVersion: m.dataVersion, rows: info.rows };
  }

  async restore({ file, reason = '', user, allowOtherInstall = false }) {
    if (!reason) throw new AppError('VALIDATION_FAILED', 'Khôi phục phải nhập lý do');
    const { manifest, zip, storageFormat, sidecar } = this.verify(file);
    if (manifest.unitCode !== this.store.unitCode) throw new AppError('VALIDATION_FAILED', `Bản sao lưu của đơn vị ${manifest.unitCode} — không khôi phục vào bản cài đơn vị ${this.store.unitCode}`);
    if (manifest.installId !== this.store.installId && !allowOtherInstall) {
      throw new AppError('VALIDATION_FAILED', `Bản sao lưu của một bản cài khác cùng đơn vị (${manifest.unitCode} · ${manifest.installId}) — cần xác nhận khôi phục từ máy khác (thay toàn bộ dữ liệu và mã bản cài)`, { code: 'E_OTHER_INSTALL', installId: manifest.installId });
    }
    const kind = this.store.storageKind;
    if (kind === 'json' && storageFormat === 'sqlite') throw new AppError('VALIDATION_FAILED', 'Bản sao lưu này là của kho SQLite — không khôi phục được vào kho JSON (dùng công cụ xuất ngược SQLite → JSON trước)');
    const safety = await this.backup({ kind: 'safety', note: 'truoc-khoi-phuc', user }); // đã gồm cả subcontract/ hiện có → khôi phục nhầm vẫn quay lại được
    const root = this.store.root;
    // Dữ liệu ngoài kho (Thuê vận chuyển, năm lưu trữ): dựng sẵn bản mới ở thư mục tạm TRƯỚC khi đụng kho; đổi chỗ trong CÙNG khối thử-và-trả-lại với kho chính
    // (khôi phục nửa vời = bảng ở thời điểm này, đợt nạp / năm lưu trữ ở thời điểm khác; với kho SQLite bảng "đã xử lý yêu cầu" và danh sách năm lưu trữ nằm trong DB nên phải cùng thời điểm).
    const sideDirs = sidecar ? sidecar.dirs : []; const rmq = (p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* không có */ } };
    const moved = [];
    for (const dir of sideDirs) {
      const stage = path.join(root, `${dir}.restoring`); rmq(stage); fs.mkdirSync(stage, { recursive: true });
      for (const name of sidecar.names.filter((n) => dirOfName(n) === dir)) { const to = path.join(stage, name.slice(dir.length + 1)); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, zip.readFile(name)); }
    }
    const swapSub = () => { for (const dir of sideDirs) { const cur = path.join(root, dir); const bak = path.join(root, `${dir}.before-restore`); rmq(bak); if (fs.existsSync(cur)) fs.renameSync(cur, bak); moved.push(dir); fs.renameSync(path.join(root, `${dir}.restoring`), cur); } };
    const undoSub = () => { for (const dir of sideDirs) { if (moved.includes(dir)) { const cur = path.join(root, dir); const bak = path.join(root, `${dir}.before-restore`); rmq(cur); try { if (fs.existsSync(bak)) fs.renameSync(bak, cur); } catch { /* cố hết sức */ } } rmq(path.join(root, `${dir}.restoring`)); } };
    const doneSub = () => { for (const dir of sideDirs) { rmq(path.join(root, `${dir}.before-restore`)); rmq(path.join(root, `${dir}.restoring`)); } };
    // Khôi phục dữ liệu tại chỗ vẫn giữ lựa chọn đăng nhập và thông tin xác thực hiện tại.
    const loginSettings = this.store.loginSettings;
    const users = this.store.all('USERS');
    const auditRestore = (store) => store.transaction((tx) => {
      if (loginSettings || store.loginSettings) {
        tx.setManifest('loginSettings', loginSettings);
        tx.removeMany('USERS', new Set(tx.all('USERS').map((u) => u.username)));
        tx.restoreRows('USERS', users);
      }
      tx.audit('RESTORE', 'DATA', path.basename(file), { dataVersionBefore: safety && safety.sha256 },
        { file: path.basename(file), dataVersion: manifest.dataVersion, storageFormat, safety: path.basename(safety.file) }, { reason });
    }, { user: user.username });
    this.store.close();
    let store = null;
    if (kind === 'json') {
      // an toàn: giải nén + kiểm SHA-256 → đổi tên bản cũ sang *.before-restore → đặt bản mới → thử mở lại; lỗi bất kỳ → trả bản cũ, kho luôn được mở lại
      const tmp = path.join(root, `restore-${Date.now()}`); const tablesNew = path.join(tmp, 'tables'); const tables = path.join(root, 'tables');
      const tablesBak = path.join(root, 'tables.before-restore'); const manifest0 = path.join(root, 'manifest.json'); const manBak = path.join(root, 'manifest.json.before-restore');
      const journal = path.join(root, 'journal'); const journalBak = path.join(root, 'journal.before-restore');
      let movedOld = false; let movedJournal = false; const rmQuiet = (p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* không có */ } };
      try {
        fs.mkdirSync(tmp, { recursive: true }); zip.extractAllTo(tmp, true);
        const mNew = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8')); const bad = [];
        for (const [rel, meta] of Object.entries(mNew.files)) { const p = path.join(tmp, rel); if (!fs.existsSync(p)) bad.push(`${rel}: thiếu`); else if (sha(fs.readFileSync(p)) !== meta.sha256) bad.push(`${rel}: sai SHA-256`); }
        if (bad.length) throw new AppError('INTEGRITY_ERROR', `Giải nén sai: ${bad.join('; ')}`, { problems: bad });
        rmQuiet(tablesBak); rmQuiet(manBak);
        fs.copyFileSync(manifest0, manBak);
        fs.renameSync(tables, tablesBak); movedOld = true;
        // Nhật ký của kho khôi phục phải đi cùng bảng của kho đó khi audit thất bại.
        if (fs.existsSync(journal)) {
          fs.renameSync(journal, journalBak);
          movedJournal = true;
        }
        fs.renameSync(tablesNew, tables); fs.copyFileSync(path.join(tmp, 'manifest.json'), manifest0);
        swapSub();
        store = this.reopen(root); // lỗi ở đây → khối catch trả bản cũ
        await auditRestore(store);
        rmQuiet(tablesBak); rmQuiet(manBak); rmQuiet(journalBak); rmQuiet(tmp); doneSub();
      } catch (e) {
        if (store) {
          store.close();
          rmQuiet(journal);
          rmQuiet(`${manifest0}.new`);
        }
        if (movedJournal) fs.renameSync(journalBak, journal);
        undoSub();
        if (movedOld) { rmQuiet(tables); try { fs.renameSync(tablesBak, tables); if (fs.existsSync(manBak)) fs.copyFileSync(manBak, manifest0); } catch { /* cố hết sức; bước dưới vẫn mở lại */ } }
        rmQuiet(tmp); rmQuiet(manBak);
        try { this.store = this.reopen(root); } catch { /* không mở lại được — ném lỗi gốc */ }
        throw e;
      }
    } else {
      // rà soát 1.8.2: MỌI lỗi sau close() (ghi tệp tạm, chuyển JSON → SQLite, đổi tên, mở lại) → trả bản cũ và LUÔN mở lại kho
      const cur = path.join(root, 'dgvc.sqlite'); const next = path.join(root, 'dgvc.sqlite.restoring'); const old = path.join(root, 'dgvc.sqlite.before-restore');
      const clean = (p) => { for (const sfx of ['', '-wal', '-shm']) { try { fs.rmSync(p + sfx, { force: true }); } catch { /* không có */ } } };
      let swapped = false; let tmp = '';
      try {
        clean(next);
        if (storageFormat === 'sqlite') fs.writeFileSync(next, zip.readFile('dgvc.db'));
        else {
          const { migrateJsonToSqlite } = require('../repo/migrate/migrate');
          tmp = path.join(root, `restore-${Date.now()}`); fs.mkdirSync(tmp, { recursive: true }); zip.extractAllTo(tmp, true);
          await migrateJsonToSqlite({ root: tmp, backup: false, user: user.username }); fs.renameSync(path.join(tmp, 'dgvc.sqlite'), next);
          fs.rmSync(tmp, { recursive: true, force: true }); tmp = '';
        }
        clean(old); fs.renameSync(cur, old); swapped = true; clean(cur); fs.renameSync(next, cur);
        swapSub();
        store = this.reopen(root);
        await auditRestore(store);
        clean(old); doneSub();
      } catch (e) {
        if (store) store.close();
        if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* bỏ */ } }
        clean(next); undoSub();
        if (swapped && fs.existsSync(old)) { clean(cur); try { fs.renameSync(old, cur); } catch { /* cố hết sức */ } }
        try { this.store = this.reopen(root); } catch { /* không mở lại được — ném lỗi gốc */ }
        throw e;
      }
    }
    this.store = store;
    return { store, restoredFrom: file, safetyBackup: safety.file, dataVersion: store.dataVersion, subcontractFiles: sidecar ? sidecar.counts[SUB] : null, archiveFiles: sidecar ? sidecar.counts[ARC] : null };
  }
}

module.exports = { BackupService, listSidecar, addSidecar, SIDE_DIRS };
