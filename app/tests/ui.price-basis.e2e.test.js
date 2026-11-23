'use strict';
/**
 * Giao diện: ô "ĐVT tính giá" (Tấn / m³) trên form dòng đơn giá — mặc định theo tuyến, nhãn / gợi ý đổi theo lựa chọn,
 * đổi tuyến không ghi đè lựa chọn của người dùng; dòng THEO GIÁ DẦU tính m³ không bắt buộc KL_TB (Thể tích TB bắt buộc) và lưu được.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');

const CHROME = process.env.CHROMIUM_PATH || (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe') ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/opt/pw-browsers/chromium');

test('Giao diện HAKQN: form dòng đơn giá — ô ĐVT tính giá, nhãn m³ / tấn động, KL_TB không bắt buộc khi tính m³, lưu được', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const toast = async (re) => { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 30000 }); };
  const nav = async (label) => { await page.locator('nav button', { has: page.locator('.nav-txt', { hasText: new RegExp(`^${label}$`) }) }).first().click(); await page.waitForTimeout(500); };
  const addVia = async (re) => {
    await page.getByRole('button', { name: 'Thêm đơn giá' }).click();
    const pk = page.locator('.modal', { hasText: 'chọn Hình thức giá' }); const sel = pk.getByLabel('Hình thức giá');
    await sel.selectOption({ label: (await sel.locator('option').allInnerTexts()).find((t) => re.test(t)) });
    await pk.getByRole('button', { name: 'Tiếp tục' }).click();
  };
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.locator('.unit-pick label', { hasText: 'HAKQN —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026'); await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    const ctx = srv.ctx;
    // VC.007 → tuyến m³; VC.008 vẫn tính tấn
    await ctx.store.transaction((tx) => tx.update('TUYEN_VC', 'VC.007', { uom: 'M3' }), { user: 'test' });
    assert.notEqual(ctx.store.get('TUYEN_VC', 'VC.008').uom, 'M3');
    await page.evaluate(() => window.DGVC.refreshBoot());
    await nav('Đơn giá');

    // ── THEO GIÁ DẦU ──
    await addVia(/giá dầu/i);
    const tm = page.locator('.modal', { hasText: 'Thêm đơn giá điều chỉnh theo giá dầu — PT-TD' });
    const uom = tm.getByLabel('ĐVT tính giá'); const route = tm.getByRole('combobox', { name: /^Tuyến/ });
    await route.selectOption('VC.007');
    assert.equal(await uom.inputValue(), 'M3', 'tuyến m³ → ĐVT mặc định m³');
    await tm.getByText('Mặc định theo tuyến (m³). Chọn khác nếu dòng đơn giá này tính theo đơn vị khác.').waitFor();
    await tm.getByLabel(/^\(2\) KL_TB/).waitFor(); assert.ok(!/\*$/.test((await tm.locator('label', { hasText: '(2) KL_TB' }).first().locator('span').first().innerText()).trim()), 'KL_TB không bắt buộc khi tính m³');
    assert.match(await tm.locator('label', { hasText: 'Thể tích TB' }).first().locator('span').first().innerText(), /\*$/, 'Thể tích TB bắt buộc');
    await tm.getByText(/Thể tích TB \(m³\)/).first().waitFor();
    // đổi tuyến khi CHƯA tự chọn → ĐVT theo tuyến mới; tự chọn rồi → không bị ghi đè
    await route.selectOption('VC.008'); assert.equal(await uom.inputValue(), 'TAN'); await tm.getByText(/Mặc định theo tuyến \(Tấn\)/).waitFor();
    assert.match(await tm.locator('label', { hasText: '(2) KL_TB' }).first().locator('span').first().innerText(), /\*$/, 'tính tấn → KL_TB bắt buộc');
    await uom.selectOption('M3'); await route.selectOption('VC.007'); await route.selectOption('VC.008'); assert.equal(await uom.inputValue(), 'M3', 'đã tự chọn ĐVT thì đổi tuyến không ghi đè');
    await tm.getByText(/Mặc định theo tuyến \(Tấn\)/).waitFor();
    await route.selectOption('VC.007'); await uom.selectOption('M3');
    // thiếu Thể tích TB → báo chưa nhập (không đòi KL_TB)
    await tm.getByLabel(/Đơn giá cước dự kiến/).fill('165.000'); await tm.getByLabel(/ĐG dầu chưa VAT/).fill('15.500'); await tm.getByLabel(/Định mức dầu/).fill('0.4');
    await tm.getByLabel(/Ngày cập nhật/).fill('2027-01-01');
    await tm.getByRole('button', { name: 'Lưu' }).click();
    await toast(/Chưa nhập: .*Thể tích TB/); assert.ok(!/KL_TB/.test(await page.locator('.toast', { hasText: 'Chưa nhập' }).first().innerText()), 'không đòi KL_TB');
    await tm.getByLabel(/Thể tích TB/).fill('20');
    // xem trước hiển thị đơn vị đ/m³
    await tm.getByText(/đ\/m³/).first().waitFor();
    await tm.getByRole('button', { name: 'Lưu' }).click(); await toast(/Đã thêm dòng giá/);
    const row = ctx.store.all('PRICE_HISTORY').find((x) => x.price_code === 'PT-TD' && x.route_code === 'VC.007' && x.effective_from === '2027-01-01');
    assert.equal(row.calc_basis, 'M3'); assert.equal(row.avg_volume_m3, 20); assert.equal(row.avg_load_ton, 0);

    // ── CỐ ĐỊNH: ô ĐVT hiện, mặc định theo tuyến, nhãn đổi động ──
    await nav('Đơn giá'); await addVia(/cố định/i);
    const lm = page.locator('.modal', { hasText: 'Thêm đơn giá cố định — PT-CD' });
    const u2 = lm.getByLabel('ĐVT tính giá'); const r2 = lm.getByRole('combobox', { name: /^Tuyến/ });
    await r2.selectOption('VC.008'); assert.equal(await u2.inputValue(), 'TAN');
    await lm.getByText('ĐG ký HĐ = DG_CO_DINH (đ/tấn trọn gói, không bù trừ dầu)').waitFor(); await lm.getByLabel(/Đơn giá cố định \(chưa VAT\) \[đ\/tấn\]/).waitFor();
    await u2.selectOption('M3');
    await lm.getByText('ĐG ký HĐ = DG_CO_DINH (đ/m³ trọn gói, không bù trừ dầu)').waitFor(); await lm.getByText('Biến: DG_CO_DINH (đơn giá cố định đ/m³ áp dụng cho tuyến).').waitFor();
    await lm.getByLabel(/Đơn giá cố định \(chưa VAT\) \[đ\/m³\]/).fill('50.000'); await lm.getByLabel(/Ngày cập nhật/).fill('2027-01-01');
    // đơn giá quá nhỏ → thông báo lỗi nhắc đúng đơn vị đang chọn
    await lm.getByLabel(/Đơn giá cố định \(chưa VAT\)/).fill('500'); await lm.locator('[role=status]').getByText(/đ\/m³/).first().waitFor({ timeout: 10000 });
    await lm.getByLabel(/Đơn giá cố định \(chưa VAT\)/).fill('50.000');
    await lm.getByRole('button', { name: 'Lưu' }).click(); await toast(/Đã thêm dòng giá/);
    const fx = ctx.store.all('PRICE_HISTORY').find((x) => x.price_code === 'PT-CD' && x.route_code === 'VC.008' && x.effective_from === '2027-01-01');
    assert.equal(fx.calc_basis, 'M3', 'dòng cố định trên tuyến tấn chọn m³ → lưu ĐVT m³'); assert.equal(fx.fixed_price, 50000);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
