'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SEED = process.env.DGVC_SEED || path.resolve(__dirname, '../data_seed');
const FIX = path.join(__dirname, 'fixtures');

/** Đọc 1 thư mục dữ liệu theo manifest (kiểm SHA-256 từng file) → { manifest, rows: {BẢNG: [...]}}. Bản rút gọn cho test — JsonStore thật ở Bước 11. */
function loadDataFolder(inst) {
  const base = path.join(SEED, inst);
  const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8'));
  const rows = {};
  for (const [rel, meta] of Object.entries(manifest.files)) {
    const buf = fs.readFileSync(path.join(base, rel));
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (sha !== meta.sha256) throw new Error(`INTEGRITY_ERROR ${rel}`);
    const d = JSON.parse(buf.toString('utf8'));
    (rows[d.table] ||= []).push(...d.rows);
  }
  return { manifest, rows };
}

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'));

module.exports = { loadDataFolder, fixture, SEED };
