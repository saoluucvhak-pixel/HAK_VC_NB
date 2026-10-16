'use strict';
/**
 * Journal 2 pha — ghi nhiều file như 1 giao dịch (DATA_STORAGE_DESIGN §4).
 *   PREPARED   : đã ghi journal + mọi <file>.new (fsync). Chưa đụng file thật.
 *   COMMITTING : bắt đầu đổi tên <file> → .bak, <file>.new → <file>, rồi manifest.
 * Khi mở lại: PREPARED → hoàn tác (xóa .new); COMMITTING → làm tiếp cho xong. Không bao giờ để dữ liệu nửa vời.
 * `fault(point)` cho phép test mô phỏng mất điện tại từng điểm.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function writeFileSync(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const fd = fs.openSync(p, 'w');
  try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function fsyncDir(dir) {
  try { const fd = fs.openSync(dir, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } } catch { /* Windows không hỗ trợ fsync thư mục */ }
}
function writeAtomic(p, data) {
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, data);
  fs.renameSync(tmp, p);
  fsyncDir(path.dirname(p));
}
const exists = (p) => fs.existsSync(p);
function rmIf(p) { try { fs.unlinkSync(p); } catch (e) { if (e.code !== 'ENOENT') throw e; } }

class Journal {
  constructor(root, { fault = () => {} } = {}) {
    this.root = root;
    this.dir = path.join(root, 'journal');
    this.fault = fault;
  }

  /**
   * files: [{ rel, data: Buffer }] ; manifestData: Buffer (ghi cuối cùng).
   * Trả về id giao dịch.
   */
  commit(files, manifestData) {
    const id = `txn-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const jpath = path.join(this.dir, `${id}.json`);
    const entries = files.map((f) => ({ rel: f.rel, sha256: sha256(f.data) }));
    const rec = { id, state: 'PREPARED', startedAt: new Date().toISOString(), files: entries, manifestSha256: sha256(manifestData) };
    writeAtomic(jpath, JSON.stringify(rec));
    this.fault('afterJournalPrepared');
    files.forEach((f, i) => {
      writeFileSync(path.join(this.root, `${f.rel}.new`), f.data);
      if (i === 0) this.fault('afterFirstNewFile');
    });
    writeFileSync(path.join(this.root, 'manifest.json.new'), manifestData);
    this.fault('afterAllNewFiles');
    rec.state = 'COMMITTING';
    writeAtomic(jpath, JSON.stringify(rec));
    this.fault('afterCommitting');
    files.forEach((f, i) => {
      this._swap(f.rel);
      if (i === 0) this.fault('afterFirstSwap');
    });
    this.fault('beforeManifestSwap');
    fs.renameSync(path.join(this.root, 'manifest.json.new'), path.join(this.root, 'manifest.json'));
    fsyncDir(this.root);
    this.fault('afterManifestSwap');
    for (const f of files) rmIf(path.join(this.root, `${f.rel}.bak`));
    rmIf(jpath);
    return id;
  }

  _swap(rel) {
    const p = path.join(this.root, rel);
    if (exists(`${p}.new`)) {
      if (exists(p)) { rmIf(`${p}.bak`); fs.renameSync(p, `${p}.bak`); }
      fs.renameSync(`${p}.new`, p);
      fsyncDir(path.dirname(p));
    }
  }

  /** Gọi khi mở kho: xử lý mọi giao dịch dở dang. Trả danh sách {id, action: ROLLED_BACK|ROLLED_FORWARD}. */
  recover() {
    if (!exists(this.dir)) return [];
    const done = [];
    for (const name of fs.readdirSync(this.dir).filter((n) => n.endsWith('.json')).sort()) {
      const jpath = path.join(this.dir, name);
      let rec;
      try { rec = JSON.parse(fs.readFileSync(jpath, 'utf8')); } catch { rmIf(jpath); continue; } // journal chưa ghi xong = chưa có gì thay đổi
      if (rec.state === 'PREPARED') {
        for (const f of rec.files) rmIf(path.join(this.root, `${f.rel}.new`));
        rmIf(path.join(this.root, 'manifest.json.new'));
        done.push({ id: rec.id, action: 'ROLLED_BACK' });
      } else if (rec.state === 'COMMITTING') {
        for (const f of rec.files) this._swap(f.rel);
        const mnew = path.join(this.root, 'manifest.json.new');
        if (exists(mnew)) fs.renameSync(mnew, path.join(this.root, 'manifest.json'));
        for (const f of rec.files) rmIf(path.join(this.root, `${f.rel}.bak`));
        done.push({ id: rec.id, action: 'ROLLED_FORWARD' });
      }
      rmIf(jpath);
    }
    for (const n of fs.readdirSync(this.dir)) if (n.endsWith('.tmp')) rmIf(path.join(this.dir, n));
    return done;
  }
}

module.exports = { Journal, sha256, writeAtomic, writeFileSync };
