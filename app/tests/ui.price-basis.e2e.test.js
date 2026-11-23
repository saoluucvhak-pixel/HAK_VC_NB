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

    // ── Định dạng số: ngăn nghìn '.', thập phân ',' khi gõ và khi mở lại; không mất độ chính xác ──
    const MAIN = 'section[aria-label="Danh mục đơn giá"]';
    await nav('Đơn giá'); await addVia(/giá dầu/i);
    const nm = page.locator('.modal', { hasText: 'Thêm đơn giá điều chỉnh theo giá dầu — PT-TD' });
    await nm.getByRole('combobox', { name: /^Tuyến/ }).selectOption('VC.008');
    const typeInto = async (loc, text) => { await loc.click(); await loc.fill(''); await loc.pressSequentially(text); };
    const cuoc = nm.getByLabel(/Đơn giá cước dự kiến/); const dau = nm.getByLabel(/ĐG dầu chưa VAT/); const kl = nm.getByLabel(/^\(2\) KL_TB/); const dm = nm.getByLabel(/Định mức dầu/); const tk = nm.getByLabel(/^Đơn giá tham khảo/);
    await typeInto(cuoc, '165000'); assert.equal(await cuoc.inputValue(), '165.000', 'gõ 165000 → 165.000');
    await typeInto(dau, '15500'); assert.equal(await dau.inputValue(), '15.500');
    await typeInto(kl, '12,5'); assert.equal(await kl.inputValue(), '12,5', 'gõ 12,5 giữ 12,5 (không thành 125)');
    await typeInto(dm, '0,4'); assert.equal(await dm.inputValue(), '0,4', 'định mức 0,4 không thành 4');
    await typeInto(tk, '1234567'); assert.equal(await tk.inputValue(), '1.234.567'); await typeInto(tk, '170000'); assert.equal(await tk.inputValue(), '170.000');
    await nm.getByLabel(/Nguồn đơn giá tham khảo/).fill('Bảng giá thử'); await nm.getByLabel(/Ngày cập nhật/).fill('2027-03-01');
    await nm.getByText(/cao hơn \(1\) DG_CUOC/).waitFor(); await nm.getByText(/\+5\.000 đ \(\+3,03%\)/).waitFor();
    // dán '0.400' vào định mức → hiểu thành 400 (> 10 lít/km) → chặn bằng hộp xác nhận, hủy thì không lưu
    await dm.fill('0.400'); assert.equal(await dm.inputValue(), '400');
    await nm.getByRole('button', { name: 'Lưu' }).click();
    const ck = page.locator('.modal', { hasText: 'Kiểm tra dấu chấm / phẩy' }); await ck.getByText(/Định mức dầu = 400 lít\/km/).waitFor(); await ck.getByRole('button', { name: 'Hủy' }).click();
    await page.waitForTimeout(300); assert.equal(ctx.store.all('PRICE_HISTORY').filter((x) => x.price_code === 'PT-TD' && x.route_code === 'VC.008' && x.effective_from === '2027-03-01').length, 0, 'hủy → không lưu');
    await typeInto(dm, '0,4');
    await nm.getByRole('button', { name: 'Lưu' }).click(); await toast(/Đã thêm dòng giá/);
    const nr = ctx.store.all('PRICE_HISTORY').find((x) => x.price_code === 'PT-TD' && x.route_code === 'VC.008' && x.effective_from === '2027-03-01');
    assert.equal(nr.new_price, 165000); assert.equal(nr.fuel_price_excl_vat, 15500); assert.equal(nr.avg_load_ton, 12.5); assert.equal(nr.fuel_norm_l_per_km, 0.4); assert.equal(nr.base_price_excl_vat, 170000);
    // bảng dòng đơn giá có cột tham khảo + chênh lệch (tham khảo − DG_CUOC)
    const trw = page.locator(`${MAIN} tbody tr`, { hasText: 'VC.008' }).filter({ hasText: '01/03/2027' });
    await trw.getByText('170.000').waitFor(); await trw.getByText('+5.000 đ').waitFor(); await trw.getByText('(+3,03%)').waitFor();
    await page.locator(MAIN).getByRole('columnheader', { name: /Đơn giá tham khảo/ }).waitFor(); await page.locator(MAIN).getByRole('columnheader', { name: /Chênh lệch \(tham khảo − DG_CUOC\)/ }).waitFor();
    // mở lại để sửa: hiển thị đúng định dạng
    await trw.getByRole('button', { name: /^Sửa/ }).click();
    const em = page.locator('.modal', { hasText: 'Sửa công thức tính đơn giá' });
    assert.equal(await em.getByLabel(/Đơn giá cước dự kiến/).inputValue(), '165.000'); assert.equal(await em.getByLabel(/ĐG dầu chưa VAT/).inputValue(), '15.500');
    assert.equal(await em.getByLabel(/^\(2\) KL_TB/).inputValue(), '12,5'); assert.equal(await em.getByLabel(/Định mức dầu/).inputValue(), '0,4'); assert.equal(await em.getByLabel(/^Đơn giá tham khảo/).inputValue(), '170.000');
    await em.getByRole('button', { name: 'Lưu' }).click(); await toast(/Đã lưu dòng giá nháp/);
    const nr2 = ctx.store.get('PRICE_HISTORY', nr.price_id); assert.equal(nr2.avg_load_ton, 12.5); assert.equal(nr2.fuel_norm_l_per_km, 0.4); assert.equal(nr2.new_price, 165000);

    // ── Phân tích số: ô tiền tương thích cũ ("150,000" = 150000), "1,5" = 1,5; ô thập phân không đoán ──
    const parsed = await page.evaluate(() => { const D = window.DGVC; return { m: ['150,000', '1,5', '150.000', '1.234,5', '150000', '1,234,567'].map((x) => D.parseVn(x, true)), old: ['150,000', '150.000'].map((x) => D.parseMoney(x)), dec: ['0,4', '12,5', '0.4', '12.5'].map((x) => D.parseVn(x)) }; });
    assert.deepEqual(parsed.m, [150000, 1.5, 150000, 1234.5, 150000, 1234567]); assert.deepEqual(parsed.old, [150000, 150000]); assert.deepEqual(parsed.dec, [0.4, 12.5, 0.4, 12.5]);

    // ── Sửa dòng nháp CŨ (chưa có ĐVT riêng) trên tuyến m³: giữ trống, ĐG ký HĐ không đổi ──
    const E = require('../main/engine');
    const lg = await ctx.svc.catalog.addCodeLine({ priceCode: 'PT-TD', record: { routeCode: 'VC.007', effectiveFrom: '2027-04-01', newPrice: 165000, fuelPriceExclVat: 15500, fuelNormLPerKm: 0.4, avgLoadTon: 18, avgVolumeM3: 20 }, user: { username: 'k', role: 'KE_TOAN' } });
    await ctx.store.transaction((tx) => tx.update('PRICE_HISTORY', lg.record.price_id, { calc_basis: '' }), { user: 'test' });
    const cp = () => E.computeContractPrice(ctx.store.get('TUYEN_VC', 'VC.007'), ctx.store.get('PRICE_HISTORY', lg.record.price_id), E.buildConfig(ctx.store.all('CONFIG'))).contractPrice;
    const cp0 = cp();
    await nav('Đơn giá');
    const lrow = page.locator(`${MAIN} tbody tr`, { hasText: 'VC.007' }).filter({ hasText: '01/04/2027' }); await lrow.getByRole('button', { name: /^Sửa/ }).click();
    const lm2 = page.locator('.modal', { hasText: 'Sửa công thức tính đơn giá' });
    assert.equal(await lm2.getByLabel('ĐVT tính giá').inputValue(), '', 'dòng cũ: ô ĐVT = "Theo cách cũ"'); await lm2.getByLabel('ĐVT tính giá').locator('option', { hasText: 'Theo cách cũ (giữ nguyên)' }).waitFor({ state: 'attached' });
    await lm2.getByRole('button', { name: 'Lưu' }).click(); await toast(/Đã lưu dòng giá nháp/);
    assert.ok(!ctx.store.get('PRICE_HISTORY', lg.record.price_id).calc_basis, 'lưu không tự ghi cờ'); assert.equal(cp(), cp0, 'ĐG ký HĐ không đổi');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
