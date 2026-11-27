'use strict';
/**
 * Tương phản chữ/nền >= 4.5:1 (chữ thường) hoặc >= 3:1 (chữ lớn) cho MỌI phần tử có chữ, ở 4 bảng màu x sáng/tối, trên:
 *  - màn khởi tạo (chọn thư mục, đơn vị, tạo tài khoản) và màn đăng nhập;
 *  - các màn chính CÓ DỮ LIỆU (nhập một gói kỳ tính mẫu trước khi quét) kèm thẻ trạng thái, thông báo;
 *  - các hộp thoại thêm/sửa chính và hộp xác nhận.
 * Khác ui.palette.e2e (đo một danh sách cặp cố định): ở đây quét tất cả phần tử có chữ; phần tử nghi ngờ được kiểm lại bằng điểm ảnh thật
 * (xem contrast-lib.js). Chưa đo: trạng thái hover/focus, chữ trong ảnh / biểu tượng.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { install, KETOAN, rid } = require('./install');
const { ExchangeService } = require('../main/services/ExchangeService');
const { SKINS, measure } = require('./contrast-lib');

const CHROME = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');
const COMBOS = ['light', 'dark'].flatMap((t) => SKINS.map((s) => [t, s]));
// Các màn chính (đủ kiểu thành phần: thẻ KPI, bảng, ô tìm, thẻ tab, hộp hướng dẫn, viên trạng thái, liên kết, nút nhỏ).
const VIEWS = [['dashboard'], ['guide'], ['units'], ['vehicles'], ['routes'], ['contracts'], ['forms'], ['pricecodes'], ['tickets'], ['fuel'], ['calc'], ['bkvc'], ['bkct'], ['reports'], ['basis'], ['rentreport'],
  ['exchange', { tab: 'import' }], ['exchange', { tab: 'history' }], ['reconcile', { tab: 'compare' }], ['settings', { tab: 'backup' }], ['settings', { tab: 'login' }]];
// Hộp thoại mở bằng nút: [màn, tham số, tên nút]
const MODALS = [['units', {}, 'Sửa thông tin công ty'], ['vehicles', {}, 'Thêm xe'], ['routes', {}, 'Thêm tuyến'], ['contracts', {}, 'Thêm hợp đồng'], ['forms', {}, 'Thêm hình thức'], ['pricecodes', {}, 'Thêm đơn giá'], ['settings', { tab: 'login' }, 'Chuyển sang một người sử dụng']];

/** Gói kỳ tính mẫu từ máy khác đơn vị (DH): nhập vào bản cài HAKQN để các màn có kỳ / phiếu cân / dầu / hợp đồng thật. */
async function samplePackage(file) {
  const { store, periods, contractId } = await install('DH', { installId: 'INS-CONTRAST-DH' });
  const k = await periods.calculate({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', excludeReceiptIds: [], reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  await periods.confirm({ periodId: k.period.period_id, user: KETOAN });
  await new ExchangeService(store).exportPackage({ packageType: 'KY_TINH', periodIds: [k.period.period_id], targetPath: file, user: { username: 'ketoan' } });
  store.close(); return file;
}

test('Tương phản: mọi chữ đạt 4.5:1 (chữ lớn 3:1) ở 4 bảng màu x sáng/tối — khởi tạo, đăng nhập, màn có dữ liệu, hộp thoại', { skip: !CHROME && 'không có Chromium', timeout: 1500000 }, async () => {
  const { chromium } = require('playwright-core');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-contrast-'));
  const pkgFile = await samplePackage(path.join(tmp, 'ky_mau.dgvc'));
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const fails = []; const seen = new Set(); let states = 0;
  const apply = (t, s) => page.evaluate(([th, sk]) => { localStorage.setItem('dgvc.theme', th); localStorage.setItem('dgvc.skin', sk); window.DGVC.applyTheme(); }, [t, s]);
  const everyCombo = async (label) => { for (const [t, s] of COMBOS) { await apply(t, s); fails.push(...await measure(page, `${s}/${t} · ${label}`)); states += 1; } };
  const go = async (view, params) => { await page.evaluate(([v, p]) => window.DGVC.go(v, p || {}), [view, params]); await page.waitForFunction(() => !document.querySelector('main[aria-busy="true"]'), null, { timeout: 8000 }); };
  try {
    // ── khởi tạo: chọn thư mục → đơn vị → bước kế → chọn đăng nhập → tạo tài khoản ──
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA')); await everyCombo('khởi tạo 1 (thư mục)');
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.locator('.unit-pick label', { hasText: 'HAKQN —' }).click(); await everyCombo('khởi tạo 2 (đơn vị)');
    await page.getByRole('button', { name: 'Tiếp' }).click(); await everyCombo('khởi tạo 3');
    await page.getByRole('button', { name: 'Tiếp' }).click(); await everyCombo('khởi tạo 4 (xác nhận)');
    await page.getByRole('radio', { name: 'Sử dụng tài khoản đăng nhập' }).check();
    await everyCombo('tạo tài khoản đăng nhập');
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com');
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026');
    await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Tạo tài khoản và khởi tạo' }).click();
    await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    // ── nạp dữ liệu mẫu (gói kỳ tính của máy khác) rồi quét các màn chính ──
    const imp = await page.evaluate(async (fp) => { const D = window.DGVC; const pv = await D.api('exchange.previewPackage', { filePath: fp, ticketsOnly: false }); const r = await D.api('exchange.importPackage', { previewId: pv.previewId, decisions: {} }); await D.refreshBoot(); return Object.keys(r.counts || {}); }, pkgFile);
    assert.ok(imp.length > 0, 'đã nhập dữ liệu mẫu');
    for (const [view, params] of VIEWS) {
      for (const [t, s] of COMBOS) {
        await apply(t, s); await go(view, params);
        await page.evaluate(() => { const D = window.DGVC; const m = document.querySelector('.main'); if (m && !document.getElementById('probe-tags')) m.prepend(D.h('div', { class: 'card', id: 'probe-tags' }, ['ok', 'warn', 'info', 'mute', 'err'].map((k) => D.tag(k, `Thẻ ${k}`)))); });
        fails.push(...await measure(page, `${s}/${t} · ${view}${params && params.tab ? `:${params.tab}` : ''}`)); states += 1;
      }
    }
    // ── hộp thoại thêm / sửa, hộp xác nhận, thông báo ──
    for (const [view, params, btn] of MODALS) {
      for (const [t, s] of COMBOS) {
        await apply(t, s); await go(view, params);
        await page.getByRole('button', { name: btn }).first().click(); await page.locator('.modal, .drawer').first().waitFor({ timeout: 8000 });
        fails.push(...await measure(page, `${s}/${t} · hộp thoại “${btn}”`)); states += 1;
        await page.keyboard.press('Escape'); await page.locator('.overlay').first().waitFor({ state: 'detached', timeout: 8000 }).catch(() => page.evaluate(() => document.querySelectorAll('.overlay').forEach((e) => e.remove())));
      }
    }
    for (const [t, s] of COMBOS) {
      await apply(t, s); await go('dashboard');
      await page.evaluate(() => { const D = window.DGVC; D.confirm({ title: 'Xác nhận mẫu', message: 'Nội dung hộp xác nhận mẫu.\nDòng thứ hai.', okLabel: 'Đồng ý' }); for (const k of ['ok', 'err', 'info', 'warn']) D.toast(`Thông báo ${k} mẫu`, k, 60000); });
      await page.locator('.modal').waitFor(); fails.push(...await measure(page, `${s}/${t} · hộp xác nhận + thông báo`)); states += 1;
      await page.evaluate(() => { document.querySelectorAll('.overlay,.toast').forEach((e) => e.remove()); });
    }
    // ── đăng nhập lại (sau đăng xuất) ──
    await page.evaluate(async () => { const D = window.DGVC; await D.api('auth.logout', {}, { quiet: true }).catch(() => {}); D.go('login'); });
    await page.getByLabel('Tên đăng nhập').waitFor(); await everyCombo('đăng nhập');
    assert.equal(states, COMBOS.length * (6 + VIEWS.length + MODALS.length + 1), 'đã quét đủ mọi trạng thái x bảng màu');
    assert.deepEqual(errors, [], 'không có lỗi JavaScript khi quét');
    for (const f of fails) seen.add(f);
    assert.deepEqual([...seen], [], `Chữ dưới ngưỡng tương phản:\n${[...seen].slice(0, 40).join('\n')}`);
  } finally { await browser.close(); await srv.close(); }
});
