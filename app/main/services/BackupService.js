'use strict';
/**
 * BackupService — sao lưu / khôi phục thư mục dữ liệu (DATA_STORAGE_DESIGN §5).
 *   daily   : lần ghi đầu tiên mỗi ngày (autoDaily) — giữ BACKUP_DAILY_KEEP bản
 *   monthly : ngày đầu tháng — giữ BACKUP_MONTHLY_KEEP bản
 *   manual  : nút "Sao lưu ngay" — không tự xóa
 *   safety  : trước khôi phục / nhập gói / đổi thư mục — giữ 10 bản
 * Sao lưu ra ngoài: sau mỗi bản, chép file zip sang BACKUP_MIRROR_FOLDER (USB, ổ mạng, thư mục Google Drive for Desktop) nếu BACKUP_MIRROR_ENABLED.
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
    if (!dest) return { ok: false, message: 'Chưa chọn thư mục sao lưu ngoài (USB / Google Drive)' };
    try {
      if (!fs.existsSync(dest)) return { ok: false, message: `Không thấy thư mục ${dest} — USB chưa cắm hoặc Google Drive chưa chạy` };
      const d = path.join(dest, 'DGVC_BACKUP', this.store.unitCode); fs.mkdirSync(d, { recursive: true });
      const to = path.join(d, path.basename(file)); fs.copyFileSync(file, to);
      return { ok: true, path: to };
    } catch (e) { return { ok: false, message: `Không chép được ra ${dest}: ${e.message}` }; }
  }

  _rotate() {
    const keep = { daily: Number(this._cfg('BACKUP_DAILY_KEEP', 30)), monthly: Number(this._cfg('BACKUP_MONTHLY_KEEP', 24)), safety: 10 };
    for (const [kind, n] of Object.entries(keep)) {
      const files = fs.readdirSync(this._dir(kind)).filter((f) => f.endsWith('.zip')).sort();
      for (const f of files.slice(0, Math.max(0, files.length - n))) fs.rmSync(path.join(this._dir(kind), f));
    }
  }

  /** Gọi sau mỗi lần ghi (hoặc lúc mở APP): nếu hôm nay chưa có bản daily → tạo; ngày 1 → thêm bản monthly. */
  async autoDaily() {
    const today = localDate(this.now()).replace(/-/g, '');
    const made = [];
    const has = (kind, prefix) => fs.readdirSync(this._dir(kind)).some((f) => f.includes(`_${prefix}`));
    if (!has('daily', today)) made.push(await this.backup({ kind: 'daily' }));
    if (today.endsWith('01') && !has('monthly', today.slice(0, 6))) made.push(await this.backup({ kind: 'monthly' }));
    return made;
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
    return { items, lastBackupAt: last ? last.createdAt : null, warning: ageDays === null || ageDays > 7 ? { code: 'W_BACKUP_OLD', message: ageDays === null ? 'Chưa có bản sao lưu nào' : `Đã ${Math.floor(ageDays)} ngày chưa sao lưu` } : null };
  }

  /** Kiểm 1 file sao lưu (JSON hoặc SQLite): đúng định dạng, đủ file, SHA-256 khớp; SQLite thêm mở chỉ đọc + integrity_check + đối chiếu số dòng. */
  verify(file) {
    if (!fs.existsSync(file)) throw new AppError('NOT_FOUND', `Không có file ${file}`);
    let zip; try { zip = new AdmZip(file); } catch (e) { throw new AppError('INTEGRITY_ERROR', `File sao lưu hỏng: ${e.message}`); }
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
  async restore({ file, reason = '', user }) {
    if (!reason) throw new AppError('VALIDATION_FAILED', 'Khôi phục phải nhập lý do');
    const { manifest, zip, storageFormat } = this.verify(file);
    if (manifest.installId !== this.store.installId) {
      throw new AppError('VALIDATION_FAILED', `Bản sao lưu của bản cài khác (${manifest.unitCode} · ${manifest.installId}) — không khôi phục vào bản cài ${this.store.unitCode}`);
    }
    const kind = this.store.storageKind;
    if (kind === 'json' && storageFormat === 'sqlite') throw new AppError('VALIDATION_FAILED', 'Bản sao lưu này là của kho SQLite — không khôi phục được vào kho JSON (dùng công cụ xuất ngược SQLite → JSON trước)');
    const safety = await this.backup({ kind: 'safety', note: 'truoc-khoi-phuc', user });
    const root = this.store.root;
    this.store.close();
    if (kind === 'json') {
      const tmp = path.join(root, `restore-${Date.now()}`);
      fs.mkdirSync(tmp, { recursive: true });
      zip.extractAllTo(tmp, true);
      fs.rmSync(path.join(root, 'tables'), { recursive: true, force: true });
      fs.renameSync(path.join(tmp, 'tables'), path.join(root, 'tables'));
      fs.copyFileSync(path.join(tmp, 'manifest.json'), path.join(root, 'manifest.json'));
      fs.rmSync(tmp, { recursive: true, force: true });
    } else {
      const cur = path.join(root, 'dgvc.sqlite'); const next = path.join(root, 'dgvc.sqlite.restoring'); const old = path.join(root, 'dgvc.sqlite.before-restore');
      const clean = (p) => { for (const sfx of ['', '-wal', '-shm']) { try { fs.rmSync(p + sfx, { force: true }); } catch { /* không có */ } } };
      clean(next);
      if (storageFormat === 'sqlite') fs.writeFileSync(next, zip.readFile('dgvc.db'));
      else {
        const { migrateJsonToSqlite } = require('../repo/migrate/migrate');
        const tmp = path.join(root, `restore-${Date.now()}`); fs.mkdirSync(tmp, { recursive: true }); zip.extractAllTo(tmp, true);
        try { await migrateJsonToSqlite({ root: tmp, backup: false, user: user.username }); fs.renameSync(path.join(tmp, 'dgvc.sqlite'), next); }
        catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); this.store = this.reopen(root); throw e; }
        fs.rmSync(tmp, { recursive: true, force: true });
      }
      clean(old); fs.renameSync(cur, old); clean(cur); fs.renameSync(next, cur);
      try { this.store = this.reopen(root); } catch (e) { clean(cur); fs.renameSync(old, cur); this.store = this.reopen(root); throw e; }
      clean(old);
    }
    const store = kind === 'json' ? this.reopen(root) : this.store;
    this.store = store;
    await store.transaction((tx) => tx.audit('RESTORE', 'DATA', path.basename(file), { dataVersionBefore: safety && safety.sha256 }, { file: path.basename(file), dataVersion: manifest.dataVersion, storageFormat, safety: path.basename(safety.file) }, { reason }), { user: user.username });
    return { store, restoredFrom: file, safetyBackup: safety.file, dataVersion: store.dataVersion };
  }
}

module.exports = { BackupService };
