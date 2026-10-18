'use strict';
/**
 * DỮ LIỆU BAN ĐẦU từ file Excel "Tổng hợp chi phí VC PRINCE OF NATURE V.47" (đóng gói kèm app).
 * Dùng ĐÚNG các luồng nghiệp vụ thật (không chèn SQL trực tiếp):
 *   1. data/seed/sample-v47.json → địa điểm, tuyến, đơn vị VC, giá dầu, kỳ điều chỉnh, bảng giá, đợt/tàu
 *   2. Excel sheet "Số xe"        → danh mục xe + đơn vị vận chuyển
 *   3. Excel sheet phiếu cân      → phiếu cân V.47, tự tính giá
 * Idempotent: chạy lại không tạo trùng (phiếu trùng bị bỏ qua).
 */
const fs = require('fs');
const path = require('path');

const EXCEL_NAME = 'Tong-hop-chi-phi-VC-V47.xlsx';

function loadInitialData(app, seedDir) {
  const excel = path.join(seedDir, EXCEL_NAME);
  if (!fs.existsSync(excel)) throw new Error(`Thiếu file dữ liệu ban đầu: ${EXCEL_NAME}`);
  const seed = JSON.parse(fs.readFileSync(path.join(seedDir, 'sample-v47.json'), 'utf8'));
  const out = { seed: app.seed.load(seed) };

  const pv = app.vehicleImport.preview({ filePath: excel, fileName: EXCEL_NAME });
  const vr = app.vehicleImport.commit(pv.token, { createMissingCarriers: true });
  out.xe = { trongFile: pv.rows.length, ...vr };

  const dot = app.db.get('SELECT id FROM dot_van_chuyen WHERE ma_dot=?', [seed.dot_van_chuyen.ma_dot]);
  const o = app.imports.open({ filePath: excel });
  const si = app.imports.sheetInfo(o.token, o.suggestedSheet);
  const prev = app.imports.preview(o.token, { sheetName: si.sheetName, headerRow: si.headerRow, mapping: si.mapping, dotId: dot ? dot.id : null });
  const cm = app.imports.commit(o.token, { note: 'Dữ liệu ban đầu từ file Excel V.47' });
  delete cm.fileBuffer;
  out.phieu = { sheet: si.sheetName, counts: prev.counts, inserted: cm.inserted, duplicate: cm.duplicate, conflict: cm.conflict, calculated: cm.calculated };

  app.settings.set('initial_data', { at: new Date().toISOString(), source: EXCEL_NAME, phieu: cm.inserted });
  app.audit.log('INITIAL_DATA', 'system', null, null, out, 'Nạp dữ liệu ban đầu từ Excel V.47');
  return out;
}

/** DB hoàn toàn trống và chưa từng nạp → chạy lần đầu. */
function isFreshDb(app) {
  const n = (t) => app.db.get(`SELECT COUNT(*) n FROM ${t}`).n;
  return !app.settings.get('initial_data') && n('phieu_can') === 0 && n('xe') === 0 && n('don_vi_van_chuyen') === 0 && n('tuyen_van_chuyen') === 0;
}

module.exports = { loadInitialData, isFreshDb, EXCEL_NAME };
