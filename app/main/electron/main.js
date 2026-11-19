'use strict';
/**
 * Electron main — vỏ cửa sổ Windows của DGVC. MỘT bộ cài cho mọi nhà máy: lần đầu mở chọn đơn vị + thư mục dữ liệu (AppContext.init).
 * Toàn bộ nghiệp vụ nằm ở main/app + main/services (không phụ thuộc Electron); file này chỉ nối IPC, hộp thoại, in / PDF.
 */
const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, screen } = require('electron');
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
const LOG_MAX = 2 * 1024 * 1024; // nhật ký quá 2 MB thì đổi tên thành .1 (giữ 1 bản cũ) để không phình mãi
const log = (...a) => {
  try {
    const f = logFile();
    try { if (fs.statSync(f).size > LOG_MAX) fs.renameSync(f, `${f}.1`); } catch { /* chưa có file */ }
    fs.appendFileSync(f, `${new Date().toISOString()} ${a.map((x) => (x && x.stack) || String(x)).join(' ')}\n`);
  } catch { /* bỏ qua */ }
};
// lỗi không bắt được: ghi nhật ký VÀ báo người dùng (tối đa 1 hộp thoại / 30 giây để không dồn dập)
let lastErrorBox = 0;
const reportFatal = (kind, e) => {
  log(kind, e);
  const now = Date.now();
  if (!app.isReady() || now - lastErrorBox < 30000) return;
  lastErrorBox = now;
  dialog.showErrorBox('Lỗi không mong muốn', `${(e && e.message) || String(e)}\n\nChi tiết đã ghi vào nhật ký. Nếu lỗi lặp lại: menu Trợ giúp → Mở thư mục nhật ký, gửi file dgvc-main.log cho ADMIN.`);
};
// cửa sổ giao diện hỏng / treo → cho người dùng tải lại hoặc thoát (trước đây chỉ trắng màn hình)
let recovering = false;
async function offerRecover(why) {
  if (!win || win.isDestroyed() || recovering) return;
  recovering = true;
  const r = await dialog.showMessageBox(win, { type: 'error', buttons: ['Tải lại', 'Thoát'], defaultId: 0, cancelId: 1, title: 'Giao diện gặp sự cố', message: why,
    detail: 'Dữ liệu đã lưu không bị ảnh hưởng. Chọn Tải lại để mở lại giao diện (có thể phải đăng nhập lại).' });
  recovering = false;
  if (win && !win.isDestroyed()) { if (r.response === 0) win.webContents.reload(); else app.quit(); }
}

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
  // Kích thước tính theo ĐƠN VỊ ĐỘC LẬP THIẾT BỊ (DIP): màn 1366×768 để tỉ lệ 125 % / 150 % chỉ còn 1093 / 910 DIP rộng — minWidth cũ 1280 buộc cửa sổ rộng hơn màn hình.
  const wa = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({ width: Math.min(1440, wa.width), height: Math.min(900, wa.height), minWidth: Math.min(900, wa.width), minHeight: Math.min(520, wa.height), title: 'Đơn giá vận chuyển dăm', backgroundColor: '#F1EFE9', show: false,
    icon: path.join(__dirname, `../../build/icon.${process.platform === 'win32' ? 'ico' : 'png'}`),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('render-process-gone', (_e, d) => { log('render-process-gone', JSON.stringify(d)); if (d.reason !== 'clean-exit') offerRecover(`Cửa sổ giao diện bị dừng đột ngột (${d.reason}).`); });
  win.webContents.on('did-fail-load', (_e, code, desc, _url, isMain) => { if (isMain && code !== -3) { log('did-fail-load', code, desc); offerRecover(`Không nạp được giao diện (${desc}).`); } }); // -3 = bị hủy do điều hướng, bỏ qua
  win.on('unresponsive', () => { log('unresponsive'); offerRecover('Giao diện không phản hồi.'); });
  win.loadFile(path.join(__dirname, '../../renderer/index.html'));
}

app.whenReady().then(async () => {
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
  // bản cài cũ (kho JSON) tự nâng cấp sang SQLite một lần, có sao lưu + đối chiếu; lỗi thì vẫn dùng JSON
  try { if (ctx.store) { const u = await ctx.autoUpgradeStorage(); if (u.state !== 'skip') log('storage-upgrade', JSON.stringify(u)); } } catch (e) { log('storage-upgrade', e); }
  router = new Router(ctx, { host: host(), log });
  ipcMain.handle('api', (_e, action, payload, token) => router.handle(action, payload, token));
  ipcMain.on('client-log', (_e, msg) => { if (typeof msg === 'string') log('renderer', msg.slice(0, 2000)); }); // lỗi JavaScript của giao diện
  createWindow();
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
});

app.on('before-quit', () => { try { if (ctx) ctx.close(); } catch (e) { log('close', e); } });
app.on('window-all-closed', () => app.quit());
process.on('uncaughtException', (e) => reportFatal('uncaught', e));
process.on('unhandledRejection', (e) => reportFatal('unhandledRejection', e));
