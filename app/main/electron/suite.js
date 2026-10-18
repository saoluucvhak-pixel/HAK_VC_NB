'use strict';
/**
 * Vỏ chung của ứng dụng HAK VC: một cửa sổ, một thanh chuyển giữa 2 phân hệ
 *   - DGVC    : đơn giá vận chuyển dăm (dữ liệu JSON, chọn đơn vị/thư mục lần đầu mở)
 *   - VC Cost : quản lý · tính toán · đối chiếu chi phí vận chuyển (SQLite)
 * Mỗi phân hệ chạy trong WebContentsView riêng (preload, kênh IPC và CSS tách biệt) nên không ảnh hưởng nhau.
 * Phân hệ khởi tạo lười — chỉ mở dữ liệu khi người dùng bấm vào tab lần đầu.
 * Chạy riêng một phân hệ (kiểm thử / debug): đặt HAK_MODULE=dgvc hoặc HAK_MODULE=vccost → cửa sổ thường, không có thanh tab.
 */
const path = require('node:path');
const fs = require('node:fs');
const { app, BaseWindow, BrowserWindow, WebContentsView, ipcMain, dialog, shell, Menu } = require('electron');

app.commandLine.appendSwitch('lang', 'vi'); // ô chọn ngày hiển thị dd/mm/yyyy
// chạy thử / kiểm thử tự động: tách thư mục cấu hình máy
if (process.env.DGVC_USER_DATA) app.setPath('userData', process.env.DGVC_USER_DATA);
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const MODULES = [require('./dgvc'), require('../../modules/vccost/electron/module')];
const BAR_H = 52;
const logFile = () => path.join(app.getPath('userData'), 'dgvc-main.log');
const log = (...a) => { try { fs.appendFileSync(logFile(), `${new Date().toISOString()} ${a.map((x) => (x && x.stack) || String(x)).join(' ')}\n`); } catch { /* bỏ qua */ } };

function relaunch() {
  // Portable: chạy lại đúng file .exe gốc
  if (process.env.PORTABLE_EXECUTABLE_FILE) app.relaunch({ execPath: process.env.PORTABLE_EXECUTABLE_FILE });
  else app.relaunch();
  app.exit(0);
}

let win = null; // BaseWindow (có tab) hoặc BrowserWindow (chạy riêng 1 phân hệ)
let bar = null;
let active = null;
const views = new Map(); // id → WebContentsView
const started = new Map(); // id → true/false (kết quả init)
const owner = () => win;

const webPrefs = (preload) => ({ preload, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false });
function lock(wc) {
  wc.on('will-navigate', (e) => e.preventDefault()); // chặn mọi điều hướng ra Internet
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function startModule(m) {
  if (started.has(m.id)) return started.get(m.id);
  let ok = false;
  try { ok = m.init({ app, ipcMain, dialog, shell, BrowserWindow, owner, relaunch, log, logFile }) !== false; } catch (e) {
    log('init', m.id, e);
    dialog.showErrorBox(`Không khởi động được ${m.title}`, e.message);
  }
  started.set(m.id, ok);
  return ok;
}

function layout() {
  if (!win || win.isDestroyed?.() || !bar) return;
  const { width, height } = win.getContentBounds();
  bar.setBounds({ x: 0, y: 0, width, height: BAR_H });
  for (const [id, v] of views) v.setBounds(id === active ? { x: 0, y: BAR_H, width, height: height - BAR_H } : { x: 0, y: BAR_H, width: 0, height: 0 });
}

function pushState() {
  if (bar) bar.webContents.send('suite:state', { modules: MODULES.map(({ id, title, subtitle }) => ({ id, title, subtitle })), active });
}

function switchTo(id) {
  const m = MODULES.find((x) => x.id === id);
  if (!m || id === active) return;
  if (!startModule(m)) return;
  if (!views.has(id)) {
    const v = new WebContentsView({ webPreferences: webPrefs(m.preload) });
    lock(v.webContents);
    v.setBackgroundColor('#F1EFE9');
    win.contentView.addChildView(v);
    views.set(id, v);
    v.webContents.loadFile(m.index);
  }
  active = id;
  win.setTitle(`HAK VC — ${m.subtitle}`);
  layout(); pushState();
}

function createTabbedWindow() {
  win = new BaseWindow({ width: 1440, height: 900, minWidth: 1280, minHeight: 760, title: 'HAK VC', backgroundColor: '#F1EFE9', show: false,
    icon: path.join(__dirname, `../../build/icon.${process.platform === 'win32' ? 'ico' : 'png'}`) });
  bar = new WebContentsView({ webPreferences: webPrefs(path.join(__dirname, 'bar-preload.js')) });
  lock(bar.webContents);
  win.contentView.addChildView(bar);
  bar.webContents.loadFile(path.join(__dirname, 'bar.html'));
  ipcMain.on('suite:ready', pushState);
  ipcMain.on('suite:switch', (_e, id) => switchTo(id));
  win.on('resize', layout);
  win.on('closed', () => { win = null; });
  layout();
  win.show();
  switchTo(MODULES[0].id);
}

function createSingleWindow(m) {
  if (!startModule(m)) return app.quit();
  win = new BrowserWindow({ width: 1440, height: 900, minWidth: 1100, minHeight: 700, title: m.subtitle, backgroundColor: '#F1EFE9', show: false, webPreferences: webPrefs(m.preload) });
  lock(win.webContents);
  win.once('ready-to-show', () => win.show());
  win.loadFile(m.index);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Tệp', submenu: [{ role: 'reload', label: 'Tải lại' }, { type: 'separator' }, { role: 'quit', label: 'Thoát' }] },
    { label: 'Xem', submenu: [{ role: 'zoomIn', label: 'Phóng to' }, { role: 'zoomOut', label: 'Thu nhỏ' }, { role: 'resetZoom', label: 'Cỡ chuẩn' }, { role: 'togglefullscreen', label: 'Toàn màn hình' },
      ...(process.env.DGVC_DEVTOOLS ? [{ role: 'toggleDevTools' }] : [])] },
    { label: 'Trợ giúp', submenu: [{ label: 'Mở thư mục nhật ký', click: () => shell.showItemInFolder(logFile()) }] },
  ]));
  const only = MODULES.find((m) => m.id === process.env.HAK_MODULE);
  if (only) createSingleWindow(only); else createTabbedWindow();
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
});

app.on('before-quit', () => { for (const m of MODULES) { try { m.close(); } catch (e) { log('close', m.id, e); } } });
app.on('window-all-closed', () => app.quit());
process.on('uncaughtException', (e) => log('uncaught', e));
