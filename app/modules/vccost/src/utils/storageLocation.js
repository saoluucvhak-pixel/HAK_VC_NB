'use strict';
/**
 * Vị trí thư mục dữ liệu. Thứ tự ưu tiên:
 *   1. VCCOST_DATA_DIR (biến môi trường)
 *   2. file "vccost-location.json" do người dùng chọn trong Cài đặt (đặt ở thư mục mặc định / cạnh .exe)
 *   3. Portable: <thư mục .exe>/VCCost-data ; Setup: %APPDATA%/VCCost
 */
const fs = require('fs');
const path = require('path');

const CONFIG_NAME = 'vccost-location.json';
const SUBDIRS = ['data', 'backups', 'imports', 'exports', 'logs'];

/** {defaultDir, bootstrapDir} — bootstrapDir là nơi đặt file cấu hình (luôn cố định). */
function defaults({ portableDir, appData }) {
  if (portableDir) return { defaultDir: path.join(portableDir, 'VCCost-data'), bootstrapDir: portableDir };
  return { defaultDir: path.join(appData, 'VCCost'), bootstrapDir: path.join(appData, 'VCCost') };
}

function readCustom(bootstrapDir) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(bootstrapDir, CONFIG_NAME), 'utf8'));
    return j && typeof j.dataDir === 'string' && j.dataDir ? j.dataDir : null;
  } catch { return null; }
}

function resolveDataDir({ env = {}, portableDir = null, appData }) {
  const { defaultDir, bootstrapDir } = defaults({ portableDir, appData });
  if (env.VCCOST_DATA_DIR) return { dir: env.VCCOST_DATA_DIR, defaultDir, bootstrapDir, source: 'ENV' };
  const custom = readCustom(bootstrapDir);
  // thư mục tùy chọn không còn truy cập được (ổ USB rút ra…) → KHÔNG tự tạo DB trắng, báo lỗi rõ
  if (custom) return { dir: custom, defaultDir, bootstrapDir, source: 'CUSTOM', missing: !fs.existsSync(custom) };
  return { dir: defaultDir, defaultDir, bootstrapDir, source: 'DEFAULT' };
}

function writeCustom(bootstrapDir, dataDir) {
  fs.mkdirSync(bootstrapDir, { recursive: true });
  const f = path.join(bootstrapDir, CONFIG_NAME);
  if (dataDir === null) { try { fs.unlinkSync(f); } catch { /* chưa có */ } return; }
  fs.writeFileSync(f, JSON.stringify({ dataDir, changedAt: new Date().toISOString() }, null, 2));
}

const hasData = (dir) => fs.existsSync(path.join(dir, 'data', 'app.db'));
const isInside = (child, parent) => { const r = path.relative(path.resolve(parent), path.resolve(child)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };

/**
 * Kiểm tra thư mục đích. mode: 'COPY' (chép dữ liệu hiện tại sang) | 'USE' (dùng dữ liệu đã có sẵn ở đích).
 * Trả {ok, error?}. KHÔNG bao giờ ghi đè dữ liệu có sẵn ở đích.
 */
function validateTarget({ current, target, mode }) {
  if (!target) return { ok: false, error: 'Chưa chọn thư mục' };
  const t = path.resolve(target); const c = path.resolve(current);
  if (t === c) return { ok: false, error: 'Đây đang là thư mục dữ liệu hiện tại' };
  if (isInside(t, c) || isInside(c, t)) return { ok: false, error: 'Thư mục mới không được nằm trong (hoặc chứa) thư mục dữ liệu hiện tại' };
  try { fs.mkdirSync(t, { recursive: true }); const probe = path.join(t, '.vccost-write-test'); fs.writeFileSync(probe, 'ok'); fs.unlinkSync(probe); } catch (e) { return { ok: false, error: `Không ghi được vào thư mục này: ${e.message}` }; }
  if (mode === 'COPY' && hasData(t)) return { ok: false, error: 'Thư mục đích đã có dữ liệu VC Cost. Chọn "Dùng dữ liệu có sẵn trong thư mục này" hoặc chọn thư mục trống.' };
  if (mode === 'USE' && !hasData(t)) return { ok: false, error: 'Thư mục này chưa có dữ liệu VC Cost (thiếu data/app.db)' };
  return { ok: true };
}

/** Chép toàn bộ dữ liệu (db, backups, imports, exports, logs). Gọi khi DB đã đóng. */
function copyData(src, dst) {
  for (const d of SUBDIRS) if (fs.existsSync(path.join(src, d))) fs.cpSync(path.join(src, d), path.join(dst, d), { recursive: true, errorOnExist: true, force: false });
  if (!hasData(dst)) throw new Error('Chép dữ liệu không thành công (không thấy data/app.db ở đích)');
}

module.exports = { CONFIG_NAME, defaults, resolveDataDir, readCustom, writeCustom, validateTarget, copyData, hasData };
