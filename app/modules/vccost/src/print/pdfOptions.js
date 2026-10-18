'use strict';
/** Tùy chọn in PDF dùng chung (Electron printToPDF và Playwright): khổ/lề theo CSS @page, chân trang "Trang x / y". */
const FOOTER = '<div style="font-size:8px;width:100%;text-align:center;font-family:Arial,sans-serif;color:#555">Trang <span class="pageNumber"></span> / <span class="totalPages"></span></div>';
const pdfOptions = () => ({ printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: FOOTER });
module.exports = { pdfOptions, FOOTER };
