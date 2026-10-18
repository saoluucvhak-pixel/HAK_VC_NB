'use strict';
/**
 * Module VC Cost (quản lý · tính toán · đối chiếu chi phí vận chuyển) — chạy trong vỏ chung của ứng dụng.
 * Dữ liệu:
 *   - Bản Portable: thư mục "VCCost-data" cạnh file .exe (PORTABLE_EXECUTABLE_DIR)
 *   - Bản Setup   : %APPDATA%/VCCost
 *   - Người dùng đổi trong Cài đặt → ghi vccost-location.json (cạnh .exe / %APPDATA%/VCCost)
 *   - Ghi đè bằng biến môi trường VCCOST_DATA_DIR
 * Khởi tạo lười: chỉ mở CSDL SQLite khi người dùng mở tab này lần đầu.
 */
const path = require('path');
const fs = require('fs');
const { createRuntime } = require('../src/runtime');
const loc = require('../src/utils/storageLocation');

function dirSize(d) { let n = 0; try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); n += e.isDirectory() ? dirSize(p) : fs.statSync(p).size; } } catch { /* bỏ qua */ } return n; }

let rt = null;

module.exports = {
  id: 'vccost',
  title: 'VC Cost',
  subtitle: 'Chi phí vận chuyển',
  preload: path.join(__dirname, 'preload.js'),
  index: path.join(__dirname, '..', 'renderer', 'index.html'),

  /** @returns {boolean} false nếu người dùng chọn thoát / không mở được */
  init({ app, ipcMain, dialog, shell, BrowserWindow, owner, relaunch }) {
    const where = () => loc.resolveDataDir({ env: process.env, portableDir: process.env.PORTABLE_EXECUTABLE_DIR || null, appData: app.getPath('appData') });
    const w = where();
    if (w.missing) {
      // Thư mục đã chọn không còn (rút USB…): không tạo CSDL trắng — hỏi người dùng
      const r = dialog.showMessageBoxSync({ type: 'error', title: 'VC Cost', message: `Không tìm thấy thư mục dữ liệu:\n${w.dir}`, detail: 'Cắm lại ổ đĩa/USB rồi mở lại, hoặc quay về thư mục mặc định (dữ liệu trong thư mục cũ vẫn được giữ nguyên).',
        buttons: ['Đóng', 'Dùng thư mục mặc định'], defaultId: 0, cancelId: 0 });
      if (r === 0) return false;
      loc.writeCustom(w.bootstrapDir, null); relaunch(); return false;
    }
    const renderPdf = async (html) => {
      const tmp = path.join(app.getPath('temp'), `vccost-print-${Date.now()}.html`);
      fs.writeFileSync(tmp, html, 'utf8');
      const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
      try {
        await pw.loadFile(tmp);
        return await pw.webContents.printToPDF(require('../src/print/pdfOptions').pdfOptions());
      } finally { pw.destroy(); try { fs.unlinkSync(tmp); } catch { /* bỏ qua */ } }
    };
    rt = createRuntime({ dataDir: w.dir, version: app.getVersion(), autoInit: true, renderPdf });
    ipcMain.handle('vc:storage.info', () => ({ current: w.dir, default: w.defaultDir, source: w.source, size: dirSize(w.dir) }));
    ipcMain.handle('vc:dialog.pickFolder', async () => { const r = await dialog.showOpenDialog(owner(), { properties: ['openDirectory', 'createDirectory'], title: 'Chọn thư mục lưu trữ dữ liệu' }); return r.canceled ? null : r.filePaths[0]; });
    ipcMain.handle('vc:storage.change', (_e, { target, mode }) => {
      if (w.source === 'ENV') return { ok: false, error: 'Thư mục đang bị cố định bởi biến môi trường VCCOST_DATA_DIR' };
      const target_ = target === null ? w.defaultDir : target;
      const m = target === null ? 'USE' : mode;
      const v = loc.validateTarget({ current: w.dir, target: target_, mode: m });
      if (!v.ok) return v;
      let closed = false;
      try {
        if (m === 'COPY') { rt.backup.backupNow('MANUAL', 'Trước khi đổi thư mục lưu trữ'); rt.close(); closed = true; loc.copyData(w.dir, target_); }
        loc.writeCustom(w.bootstrapDir, target === null ? null : path.resolve(target_));
      } catch (e) { if (closed) setTimeout(relaunch, 800); /* DB đã đóng → mở lại app, vẫn dùng thư mục cũ */ return { ok: false, error: e.message + (closed ? ' — ứng dụng sẽ tự khởi động lại và vẫn dùng thư mục cũ.' : '') }; }
      setTimeout(relaunch, 600);
      return { ok: true, target: target_, note: m === 'COPY' ? 'Đã chép dữ liệu. Thư mục cũ được giữ nguyên để bạn tự xóa khi chắc chắn.' : '' };
    });
    ipcMain.handle('vc:api', (_e, channel, args) => rt.dispatch(channel, args));
    ipcMain.handle('vc:dialog.openFile', async (_e, { filters } = {}) => {
      const r = await dialog.showOpenDialog(owner(), { properties: ['openFile'], filters: filters || [{ name: 'Excel / CSV', extensions: ['xlsx', 'xls', 'csv'] }] });
      return r.canceled ? null : r.filePaths[0];
    });
    ipcMain.handle('vc:dialog.saveExport', async (_e, { path: src, fileName }) => {
      const r = await dialog.showSaveDialog(owner(), { defaultPath: fileName, filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
      if (r.canceled) return null;
      fs.copyFileSync(src, r.filePath);
      return r.filePath;
    });
    ipcMain.handle('vc:shell.showItem', (_e, p) => shell.showItemInFolder(p));
    ipcMain.handle('vc:shell.openPath', (_e, p) => shell.openPath(p));
    return true;
  },

  close() { if (rt) { try { rt.close(); } catch { /* bỏ qua */ } rt = null; } },
};
