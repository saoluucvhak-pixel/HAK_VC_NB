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
        if (fs.existsSync(p)) zip.addFile(rel.replace(/\\/g, '/'), fs.readFileSync(p));
      }
    }
    const info = { app: 'DGVC', kind, note, createdAt: this.now().toISOString(), createdBy: user.username, installId: m.installId, unitCode: m.unitCode, dataVersion: m.dataVersion, ...extra };
    zip.addFile('backup-info.json', Buffer.from(JSON.stringify(info, null, 1)));
    const name = `DGVC_${m.unitCode}_${stamp(this.now())}_${kind}${note ? `_${note.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 30)}` : ''}.zip`;
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
    if (dbBuf) return this._verifySqlite(zip, dbBuf);
    const mBuf = zip.readFile('manifest.json'); if (!mBuf) throw new AppError('INTEGRITY_ERROR', 'File sao lưu không có manifest.json');
    const m = JSON.parse(mBuf); const bad = [];
    for (const [rel, meta] of Object.entries(m.files)) { const b = zip.readFile(rel.replace(/\\/g, '/')); if (!b) bad.push(`${rel}: thiếu`); else if (sha(b) !== meta.sha256) bad.push(`${rel}: sai SHA-256`); }
    if (bad.length) throw new AppError('INTEGRITY_ERROR', `File sao lưu không toàn vẹn: ${bad.join('; ')}`, { problems: bad });
    return { manifest: m, zip, storageFormat: 'json' };
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
    const { manifest, storageFormat, zip } = this.verify(file);
    let info = {}; try { info = JSON.parse(zip.readAsText('backup-info.json') || '{}'); } catch { /* thiếu info */ }
    const sameInstall = manifest.installId === this.store.installId; const sameUnit = manifest.unitCode === this.store.unitCode;
    const kindHere = this.store.storageKind;
    const problem = !sameUnit ? `Sao lưu của đơn vị ${manifest.unitCode}, bản cài này là ${this.store.unitCode} — không khôi phục được`
      : kindHere === 'json' && storageFormat === 'sqlite' ? 'Bản sao lưu này là của kho SQLite — không khôi phục vào kho JSON (xuất ngược SQLite → JSON trước)' : '';
    return { file, storageFormat, unitCode: manifest.unitCode, installId: manifest.installId, dataVersion: manifest.dataVersion, createdAt: info.createdAt || '', kind: info.kind || '', note: info.note || '',
      sameInstall, sameUnit, canRestore: !problem, problem, needsOtherInstallConfirm: sameUnit && !sameInstall };
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
    const info = { app: 'DGVC', source: 'json', exportedAt: new Date().toISOString(), exportedBy: user.username, dataVersion: m.dataVersion, schemaVersion: m.schemaVersion, installId: m.installId, unitCode: m.unitCode,
      appVersion: require('../../package.json').version, files: Object.keys(m.files).length, rows: this.store.stats().rows };
    fs.writeFileSync(path.join(dest, 'snapshot-info.json'), JSON.stringify(info, null, 1));
    await this.store.transaction((tx) => tx.audit('EXPORT_JSON', 'DATA', 'snapshot', null, { dest, dataVersion: m.dataVersion }), { user: user.username });
    return { ok: true, dest, files: info.files, dataVersion: m.dataVersion, rows: info.rows };
  }

  async restore({ file, reason = '', user, allowOtherInstall = false }) {
    if (!reason) throw new AppError('VALIDATION_FAILED', 'Khôi phục phải nhập lý do');
    const { manifest, zip, storageFormat } = this.verify(file);
    if (manifest.unitCode !== this.store.unitCode) throw new AppError('VALIDATION_FAILED', `Bản sao lưu của đơn vị ${manifest.unitCode} — không khôi phục vào bản cài đơn vị ${this.store.unitCode}`);
    if (manifest.installId !== this.store.installId && !allowOtherInstall) {
      throw new AppError('VALIDATION_FAILED', `Bản sao lưu của một bản cài khác cùng đơn vị (${manifest.unitCode} · ${manifest.installId}) — cần xác nhận khôi phục từ máy khác (thay toàn bộ dữ liệu và mã bản cài)`, { code: 'E_OTHER_INSTALL', installId: manifest.installId });
    }
    const kind = this.store.storageKind;
    if (kind === 'json' && storageFormat === 'sqlite') throw new AppError('VALIDATION_FAILED', 'Bản sao lưu này là của kho SQLite — không khôi phục được vào kho JSON (dùng công cụ xuất ngược SQLite → JSON trước)');
    const safety = await this.backup({ kind: 'safety', note: 'truoc-khoi-phuc', user });
    const root = this.store.root;
    this.store.close();
    let store = null;
    if (kind === 'json') {
      // an toàn: giải nén + kiểm SHA-256 → đổi tên bản cũ sang *.before-restore → đặt bản mới → thử mở lại; lỗi bất kỳ → trả bản cũ, kho luôn được mở lại
      const tmp = path.join(root, `restore-${Date.now()}`); const tablesNew = path.join(tmp, 'tables'); const tables = path.join(root, 'tables');
      const tablesBak = path.join(root, 'tables.before-restore'); const manifest0 = path.join(root, 'manifest.json'); const manBak = path.join(root, 'manifest.json.before-restore');
      let movedOld = false; const rmQuiet = (p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* không có */ } };
      try {
        fs.mkdirSync(tmp, { recursive: true }); zip.extractAllTo(tmp, true);
        const mNew = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8')); const bad = [];
        for (const [rel, meta] of Object.entries(mNew.files)) { const p = path.join(tmp, rel); if (!fs.existsSync(p)) bad.push(`${rel}: thiếu`); else if (sha(fs.readFileSync(p)) !== meta.sha256) bad.push(`${rel}: sai SHA-256`); }
        if (bad.length) throw new AppError('INTEGRITY_ERROR', `Giải nén sai: ${bad.join('; ')}`, { problems: bad });
        rmQuiet(tablesBak); rmQuiet(manBak);
        fs.renameSync(tables, tablesBak); movedOld = true; fs.copyFileSync(manifest0, manBak);
        fs.renameSync(tablesNew, tables); fs.copyFileSync(path.join(tmp, 'manifest.json'), manifest0);
        store = this.reopen(root); // lỗi ở đây → khối catch trả bản cũ
        rmQuiet(tablesBak); rmQuiet(manBak); rmQuiet(tmp);
      } catch (e) {
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
        this.store = this.reopen(root);
        clean(old);
      } catch (e) {
        if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* bỏ */ } }
        clean(next);
        if (swapped && fs.existsSync(old)) { clean(cur); try { fs.renameSync(old, cur); } catch { /* cố hết sức */ } }
        try { this.store = this.reopen(root); } catch { /* không mở lại được — ném lỗi gốc */ }
        throw e;
      }
    }
    if (kind !== 'json') store = this.store;
    this.store = store;
    await store.transaction((tx) => tx.audit('RESTORE', 'DATA', path.basename(file), { dataVersionBefore: safety && safety.sha256 }, { file: path.basename(file), dataVersion: manifest.dataVersion, storageFormat, safety: path.basename(safety.file) }, { reason }), { user: user.username });
    return { store, restoredFrom: file, safetyBackup: safety.file, dataVersion: store.dataVersion };
  }
}

module.exports = { BackupService };
