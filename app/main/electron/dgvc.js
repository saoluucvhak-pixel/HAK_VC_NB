'use strict';
/**
 * Module DGVC (đơn giá vận chuyển dăm) — MỘT bộ cài cho mọi nhà máy: lần đầu mở chọn đơn vị + thư mục dữ liệu (AppContext.init).
 * Toàn bộ nghiệp vụ nằm ở main/app + main/services (không phụ thuộc Electron); file này chỉ nối IPC, hộp thoại, in / PDF.
 */
const path = require('node:path');
const fs = require('node:fs');
const { AppContext } = require('../app/AppContext');
const { Router } = require('../api/router');
const { electronPdfRenderer } = require('../reports/pdf');

let ctx = null; let router = null;

module.exports = {
  id: 'dgvc',
  title: 'DGVC',
  subtitle: 'Đơn giá vận chuyển dăm',
  preload: path.join(__dirname, 'preload.js'),
  index: path.join(__dirname, '../../renderer/index.html'),

  /** @returns {boolean} false nếu người dùng chọn thoát */
  init({ app, ipcMain, dialog, shell, BrowserWindow, owner, log, logFile }) {
    const documentsDir = () => process.env.DGVC_DOCUMENTS || app.getPath('documents');
    const host = {
      openFile: async ({ title, filters } = {}) => { const r = await dialog.showOpenDialog(owner(), { title, properties: ['openFile'], filters: filters || [] }); return r.canceled ? { canceled: true } : { path: r.filePaths[0] }; },
      openFolder: async ({ title } = {}) => { const r = await dialog.showOpenDialog(owner(), { title, properties: ['openDirectory', 'createDirectory'] }); return r.canceled ? { canceled: true } : { path: r.filePaths[0] }; },
      saveFile: async ({ title, defaultPath, filters } = {}) => { const r = await dialog.showSaveDialog(owner(), { title, defaultPath: defaultPath ? path.join(app.getPath('documents'), defaultPath) : undefined, filters: filters || [] }); return r.canceled ? { canceled: true } : { path: r.filePath }; },
      openPath: async ({ path: p }) => ({ ok: !(await shell.openPath(p)) }),
      print: async ({ html, landscape }) => {
        const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
        await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        return new Promise((res) => w.webContents.print({ landscape, printBackground: true }, (ok, reason) => { w.destroy(); res({ ok, reason }); }));
      },
    };
    ctx = new AppContext({ configFile: path.join(app.getPath('userData'), 'dgvc-config.json'), pdfRenderer: electronPdfRenderer(BrowserWindow), documentsDir: documentsDir() });
    const st = ctx.status();
    if (st.initialized) {
      try { ctx.open(); } catch (e) {
        log('open', e);
        if (e.code === 'DATA_LOCKED') {
          const r = dialog.showMessageBoxSync({ type: 'warning', buttons: ['Chiếm quyền mở', 'Đóng'], defaultId: 1, title: 'Dữ liệu đang mở', message: `${e.message}\n\nNếu chắc chắn không có máy / cửa sổ nào khác đang mở dữ liệu này (vd lần trước bị tắt đột ngột), chọn "Chiếm quyền mở".` });
          if (r === 0) ctx.open({ takeoverStaleLock: true }); else return false;
        } else dialog.showErrorBox('Không mở được dữ liệu', `${e.message}\n\nVào Cài đặt → Dữ liệu & sao lưu để khôi phục bản sao lưu, hoặc liên hệ ADMIN.`);
      }
    }
    router = new Router(ctx, { host, log });
    ipcMain.handle('api', (_e, action, payload, token) => router.handle(action, payload, token));
    return true;
  },

  close() { try { if (ctx) ctx.close(); } catch { /* bỏ qua */ } ctx = null; },
};
