'use strict';
/**
 * Bộ in PDF — nhận HTML, trả Buffer PDF.
 *  - Trong bản cài Electron: electronPdfRenderer (webContents.printToPDF của một cửa sổ ẩn, không cần mạng).
 *  - Khi lập trình / kiểm thử (không có Electron): chromiumPdfRenderer dùng playwright-core + Chromium có sẵn.
 */
function electronPdfRenderer(BrowserWindow) {
  return async (html, { landscape = false } = {}) => {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      return await win.webContents.printToPDF({ pageSize: 'A4', landscape, printBackground: true, preferCSSPageSize: true });
    } finally { win.destroy(); }
  };
}

function chromiumPdfRenderer({ executablePath } = {}) {
  let browserP = null;
  const render = async (html, { landscape = false } = {}) => {
    const { chromium } = require('playwright-core');
    browserP ||= chromium.launch({ executablePath: executablePath || process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
    const browser = await browserP; const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load' });
      return await page.pdf({ format: 'A4', landscape, printBackground: true, preferCSSPageSize: true });
    } finally { await page.close(); }
  };
  render.close = async () => { if (browserP) (await browserP).close(); };
  return render;
}

module.exports = { electronPdfRenderer, chromiumPdfRenderer };
