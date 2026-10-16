'use strict';
/**
 * Electron main — vỏ cửa sổ Windows của DGVC. MỘT bộ cài cho mọi nhà máy: lần đầu mở chọn đơn vị + thư mục dữ liệu (AppContext.init).
 * Toàn bộ nghiệp vụ nằm ở main/app + main/services (không phụ thuộc Electron); file này chỉ nối IPC, hộp thoại, in / PDF.
 */
const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const { AppContext } = require('../app/AppContext');
const { Router } = require('../api/router');
const { electronPdfRenderer } = require('../reports/pdf');

app.commandLine.appendSwitch('lang', 'vi');
// chạy thử / kiểm thử tự động: tách thư mục cấu hình máy
if (process.env.DGVC_USER_DATA) app.setPath('userData', process.env.DGVC_USER_DATA);
const documentsDir = () => process.env.DGVC_DOCUMENTS || app.getPath('documents');
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let win = null; let ctx = null; let router = null;
const logFile = () => path.join(app.getPath('userData'), 'dgvc-main.log');
const log = (...a) => { try { fs.appendFileSync(logFile(), `${new Date().toISOString()} ${a.map((x) => (x && x.stack) || String(x)).join(' ')}\n`); } catch { /* bỏ qua */ } };

function host() {
  return {
    openFile: async ({ title, filters } = {}) => { const r = await dialog.showOpenDialog(win, { title, properties: ['openFile'], filters: filters || [] }); return r.canceled ? { canceled: true } : { path: r.filePaths[0] }; },
    openFolder: async ({ title } = {}) => { const r = await dialog.showOpenDialog(win, { title, properties: ['openDirectory', 'createDirectory'] }); return r.canceled ? { canceled: true } : { path: r.filePaths[0] }; },
    saveFile: async ({ title, defaultPath, filters } = {}) => { const r = await dialog.showSaveDialog(win, { title, defaultPath: defaultPath ? path.join(app.getPath('documents'), defaultPath) : undefined, filters: filters || [] }); return r.canceled ? { canceled: true } : { path: r.filePath }; },
    openPath: async ({ path: p }) => ({ ok: !(await shell.openPath(p)) }),
    print: async ({ html, landscape }) => {
      const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
      await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      return new Promise((res) => w.webContents.print({ landscape, printBackground: true }, (ok, reason) => { w.destroy(); res({ ok, reason }); }));
    },
  };
}

function createWindow() {
  win = new BrowserWindow({ width: 1440, height: 900, minWidth: 1280, minHeight: 760, title: 'Đơn giá vận chuyển dăm', backgroundColor: '#F1EFE9', show: false,
    icon: path.join(__dirname, `../../build/icon.${process.platform === 'win32' ? 'ico' : 'png'}`),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, '../../renderer/index.html'));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Tệp', submenu: [{ role: 'reload', label: 'Tải lại' }, { type: 'separator' }, { role: 'quit', label: 'Thoát' }] },
    { label: 'Xem', submenu: [{ role: 'zoomIn', label: 'Phóng to' }, { role: 'zoomOut', label: 'Thu nhỏ' }, { role: 'resetZoom', label: 'Cỡ chuẩn' }, { role: 'togglefullscreen', label: 'Toàn màn hình' },
      ...(process.env.DGVC_DEVTOOLS ? [{ role: 'toggleDevTools' }] : [])] },
    { label: 'Trợ giúp', submenu: [{ label: 'Mở thư mục nhật ký', click: () => shell.showItemInFolder(logFile()) }] },
  ]));
  ctx = new AppContext({ configFile: path.join(app.getPath('userData'), 'dgvc-config.json'), pdfRenderer: electronPdfRenderer(BrowserWindow), documentsDir: documentsDir() });
  const st = ctx.status();
  if (st.initialized) {
    try { ctx.open(); } catch (e) {
      log('open', e);
      if (e.code === 'DATA_LOCKED') {
        const r = dialog.showMessageBoxSync({ type: 'warning', buttons: ['Chiếm quyền mở', 'Thoát'], defaultId: 1, title: 'Dữ liệu đang mở', message: `${e.message}\n\nNếu chắc chắn không có máy / cửa sổ nào khác đang mở dữ liệu này (vd lần trước bị tắt đột ngột), chọn "Chiếm quyền mở".` });
        if (r === 0) ctx.open({ takeoverStaleLock: true }); else { app.quit(); return; }
      } else dialog.showErrorBox('Không mở được dữ liệu', `${e.message}\n\nVào Cài đặt → Dữ liệu & sao lưu để khôi phục bản sao lưu, hoặc liên hệ ADMIN.`);
    }
  }
  router = new Router(ctx, { host: host(), log });
  ipcMain.handle('api', (_e, action, payload, token) => router.handle(action, payload, token));
  createWindow();
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
});

app.on('before-quit', () => { try { if (ctx) ctx.close(); } catch (e) { log('close', e); } });
app.on('window-all-closed', () => app.quit());
process.on('uncaughtException', (e) => log('uncaught', e));
