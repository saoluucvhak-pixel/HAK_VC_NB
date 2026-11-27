'use strict';
/** Giao diện: màn "Đơn giá" (danh mục phẳng, chính–phụ): thêm đơn giá bằng cách chọn Hình thức giá (cố định / theo giá dầu) từ danh mục → form như cũ → áp dụng → kỳ tính dùng đúng. Ngăn xem chéo Hình thức giá: ui.forms.e2e.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE, KETOAN, rid } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe') ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/opt/pw-browsers/chromium');

test('Giao diện HAKQN: Đơn giá — chọn Hình thức giá, thêm đơn giá cố định / theo giá dầu, áp dụng, kỳ tính, vai trò XEM, bố cục', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const toast = async (re) => { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 30000 }); };
  const nav = async (label) => {
    const l = (label === 'Mã đơn giá' || label === 'DM Đơn giá') ? 'Đơn giá' : label;
    await page.locator('nav button', { has: page.locator('.nav-txt', { hasText: new RegExp(`^${l}$`) }) }).first().click();
    await page.waitForTimeout(500);
  };
  const MAIN = 'section[aria-label="Danh mục đơn giá"]';
  // mở hộp chọn Hình thức giá → chọn hình thức theo chữ trong nhãn → mở form đơn giá của hình thức đó
  const addVia = async (re) => {
    await page.getByRole('button', { name: 'Thêm đơn giá' }).click();
    const pk = page.locator('.modal', { hasText: 'chọn Hình thức giá' }); const sel = pk.getByLabel('Hình thức giá');
    await sel.selectOption({ label: (await sel.locator('option').allInnerTexts()).find((t) => re.test(t)) });
    await pk.getByRole('button', { name: 'Tiếp tục' }).click();
  };
  try {
    await srv.ctx.init({ dataFolder: path.join(srv.home, 'DGVC_DATA'), unitCode: 'HAKQN' });
    await page.goto(srv.url);
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026'); await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    const ctx = srv.ctx; const contractId = 'HD-HAKQN-QS'; const ct = () => ctx.store.get('HOP_DONG', contractId); const unit = ct().customer_unit_code;
    const imp = ctx.svc.import; const a = await imp.preview({ importType: 'PHIEU_CAN', filePath: FILE.HAKQN, user: 'k' }); await imp.confirm({ batchId: a.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'k' });

    // màn Đơn giá: danh mục phẳng, lối vào thêm qua Hình thức giá; không còn tạo mã / gán hợp đồng / thẻ chọn hình thức cũ
    await nav('Đơn giá'); await page.getByRole('heading', { name: 'Đơn giá', exact: true }).first().waitFor();
    await page.locator(MAIN).getByRole('columnheader', { name: 'Hình thức giá', exact: true }).waitFor();
    for (const name of [/Tạo mã/, /\+ Mã/, /Sửa mã/, /Đóng mã/, /Gán cho hợp đồng/, /Chọn đơn giá có sẵn/, /Thêm dòng giá/]) assert.equal(await page.getByRole('button', { name }).count(), 0, `không còn nút ${name}`);
    assert.equal(await page.locator('.pc-cards, .pc-card, .pc-tree').count(), 0, 'không còn thẻ chọn hình thức / cây mã cũ');

    // PT-CD: thêm đơn giá cố định cho VC.007 → áp dụng
    await addVia(/cố định/i);
    const lm = page.locator('.modal', { hasText: 'Thêm đơn giá cố định — PT-CD' });
    await lm.getByRole('combobox', { name: /^Tuyến/ }).selectOption('VC.007'); await lm.getByLabel(/Đơn giá cố định/).fill('150.000'); // gõ dấu chấm ngăn cách nghìn kiểu Việt
    assert.equal(await lm.getByLabel(/Cự ly chuyến/).getAttribute('readonly') !== null, true);
    await lm.getByLabel(/Ngày cập nhật/).fill('2026-01-01'); await lm.getByRole('button', { name: 'Lưu' }).click();
    await toast(/Đã thêm dòng giá/); const CD = () => page.locator(`${MAIN} tbody tr`, { hasText: 'VC.007' }).filter({ hasText: 'Cố định' }); const row = CD(); await row.getByText('Nháp').waitFor();
    await row.getByRole('button', { name: 'Sửa' }).waitFor();
    await row.getByRole('button', { name: 'Áp dụng' }).click(); await toast(/Đã áp dụng/); await CD().getByText('Đang dùng').waitFor();
    // hợp đồng dùng PT-CD (việc gán thực hiện ở màn Hợp đồng — ở đây gán bằng API) → kỳ tính dùng đúng giá cố định
    const cur = ct(); await page.evaluate(([id, rv]) => window.DGVC.api('contracts.save', { record: { contractId: id, priceCode: 'PT-CD' }, rowVersion: rv }), [contractId, cur.row_version]);
    assert.equal(ct().price_code, 'PT-CD');
    const k = await ctx.svc.periods.calculate({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24', clientRequestId: rid(), user: KETOAN });
    assert.equal(k.results[0].transportPrice, 150000); assert.equal(k.results[0].priceMethod, 'CO_DINH');

    // PT-TD: thêm đơn giá theo giá dầu (ĐG ký HĐ dự kiến, giá dầu, định mức, tải trọng; cự ly chỉ hiển thị) → áp dụng
    await nav('Đơn giá'); await addVia(/giá dầu/i);
    const tm = page.locator('.modal', { hasText: 'Thêm đơn giá điều chỉnh theo giá dầu — PT-TD' });
    await tm.getByRole('combobox', { name: /^Tuyến/ }).selectOption('VC.007'); assert.equal(await tm.getByLabel(/Cự ly chuyến/).inputValue(), '144'); assert.equal(await tm.getByLabel(/Cự ly chuyến/).getAttribute('readonly') !== null, true);
    // cảnh báo sớm, trước khi lưu — chưa nhập đơn giá/định mức → báo ngay
    await tm.getByLabel(/ĐG dầu chưa VAT/).fill('15.500'); await tm.locator('[role=status]').getByText(/phải > 0/).first().waitFor();
    await tm.getByLabel(/Đơn giá cước dự kiến/).fill('165.000'); await tm.getByLabel(/Định mức dầu/).fill('0.4'); await tm.getByLabel(/KL trung bình/).fill('18');
    await tm.getByLabel(/Ngày cập nhật/).fill('2027-01-01');
    // ĐG dự kiến ký hợp đồng tự tính (chỉ đọc), đúng số engine (prices.preview); ĐG ký HĐ mặc định = ĐG dự kiến
    const est = tm.getByLabel(/Đơn giá dự kiến ký hợp đồng/); const cpf = tm.getByLabel(/Đơn giá ký hợp đồng/);
    assert.equal(await est.getAttribute('readonly') !== null, true);
    await page.waitForFunction(() => { const l = [...document.querySelectorAll('.modal label')].find((x) => /Đơn giá dự kiến ký hợp đồng/.test(x.textContent)); return l && l.querySelector('input').value !== ''; });
    const pv = await page.evaluate(() => window.DGVC.api('prices.preview', { record: { routeCode: 'VC.007', priceCode: 'PT-TD', priceMethod: 'THEO_DAU', newPrice: 165000, fuelPriceExclVat: 15500, fuelNormLPerKm: 0.4, avgLoadTon: 18, effectiveFrom: '2027-01-01' } }));
    const vnum = async (loc) => Number((await loc.inputValue()).replace(/\./g, '').replace(',', '.'));
    const estimate = await vnum(est); assert.equal(estimate, pv.formulaContractPrice); assert.equal(await vnum(cpf), estimate, 'ĐG ký HĐ mặc định = ĐG dự kiến');
    // đơn giá tham khảo (nhập tay) → khối so sánh chênh lệch + %
    // đơn giá tham khảo được so với (1) DG_CUOC (165.000), không phải với (6)
    await tm.getByLabel(/^Đơn giá tham khảo/).fill('170.000');
    await tm.getByText(/cao hơn \(1\) DG_CUOC/).waitFor(); await tm.getByText(/\+5\.000 đ/).waitFor({ timeout: 3000 });
    await tm.getByLabel(/^Đơn giá tham khảo/).fill('160.000');
    await tm.getByText(/thấp hơn \(1\) DG_CUOC/).waitFor(); await tm.getByText(/−5\.000 đ/).waitFor();
    await tm.getByLabel(/^Đơn giá tham khảo/).fill(''); // không tham khảo → không cần nguồn; không sửa ĐG ký HĐ → lưu rỗng (tự tính)
    await tm.getByRole('button', { name: 'Lưu' }).click(); await toast(/Đã thêm dòng giá/);
    const tr = page.locator(`${MAIN} tbody tr`, { hasText: 'VC.007' }).filter({ hasText: '01/01/2027' }); await tr.getByText('Nháp').waitFor();
    assert.equal(ctx.store.all('PRICE_HISTORY').find((x) => x.price_code === 'PT-TD' && x.route_code === 'VC.007' && x.effective_from === '2027-01-01').contract_price || '', '', 'không sửa tay → contract_price rỗng');
    await tr.getByRole('button', { name: 'Áp dụng' }).click(); await toast(/Đã áp dụng/);
    // sửa tay ĐG ký HĐ → lưu đúng số tay; nút "Dùng lại ĐG dự kiến" khôi phục
    await addVia(/giá dầu/i);
    const t2 = page.locator('.modal', { hasText: 'Thêm đơn giá điều chỉnh theo giá dầu — PT-TD' });
    await t2.getByRole('combobox', { name: /^Tuyến/ }).selectOption('VC.008'); await t2.getByLabel(/Đơn giá cước dự kiến/).fill('150.000'); await t2.getByLabel(/ĐG dầu chưa VAT/).fill('15.500'); await t2.getByLabel(/Định mức dầu/).fill('0.4'); await t2.getByLabel(/KL trung bình/).fill('18'); await t2.getByLabel(/Ngày cập nhật/).fill('2027-01-01');
    await page.waitForFunction(() => { const l = [...document.querySelectorAll('.modal label')].find((x) => /Đơn giá ký hợp đồng \(nhập tay\)/.test(x.textContent)); return l && l.querySelector('input').value !== ''; });
    const est2 = await vnum(t2.getByLabel(/Đơn giá dự kiến ký hợp đồng/)); await t2.getByLabel(/Đơn giá ký hợp đồng/).fill('123.000');
    await t2.getByLabel(/Đơn giá cước dự kiến/).fill('151.000'); await page.waitForTimeout(900); assert.equal(await vnum(t2.getByLabel(/Đơn giá ký hợp đồng/)), 123000, 'đã sửa tay thì ngừng tự theo ĐG dự kiến');
    await t2.getByRole('button', { name: 'Dùng lại ĐG dự kiến' }).click(); assert.equal(await vnum(t2.getByLabel(/Đơn giá ký hợp đồng/)), await vnum(t2.getByLabel(/Đơn giá dự kiến ký hợp đồng/)));
    assert.notEqual(est2, 123000); await t2.getByLabel(/Đơn giá ký hợp đồng/).fill('123.000');
    await t2.getByLabel(/^Đơn giá tham khảo/).fill('110.000'); await t2.getByLabel(/Nguồn đơn giá tham khảo/).fill('Bảng giá thử'); await t2.getByText(/So sánh/).waitFor();
    for (const w of [1366, 910]) { await page.setViewportSize({ width: w, height: 800 }); if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, `price-form-${w}.png`) }); }
    await page.setViewportSize({ width: 1366, height: 800 });
    await t2.getByRole('button', { name: 'Lưu' }).click(); await toast(/Đã thêm dòng giá/);
    assert.equal(Number(ctx.store.all('PRICE_HISTORY').find((x) => x.price_code === 'PT-TD' && x.route_code === 'VC.008' && x.effective_from === '2027-01-01').contract_price), 123000);
    await page.locator(`${MAIN} tbody tr`, { hasText: 'VC.008' }).filter({ hasText: '01/01/2027' }).getByText('Thủ công').waitFor();
    await page.locator(MAIN).getByRole('columnheader', { name: /ĐG ký HĐ/ }).waitFor();

    // thuật ngữ: "Đơn giá ký hợp đồng"; không còn "Đơn giá hợp đồng" / "ĐG HĐ" ở các màn giá
    for (const label of ['Hình thức giá', 'Đơn giá', 'Báo cáo giá hợp đồng']) {
      await nav(label); await page.waitForTimeout(400);
      assert.ok(!/DM Đơn giá/.test(await page.locator('body').innerText()), `màn ${label} còn nhãn "DM Đơn giá"`);
      const txt = await page.locator('main').innerText(); assert.ok(!/đơn giá hợp đồng|ĐG HĐ/i.test(txt), `màn ${label} còn nhãn cũ`); // không phân biệt hoa/thường (bản trước bỏ sót "ĐƠN GIÁ HỢP ĐỒNG")
    }
    // bố cục: không tràn ngang ở 1366 và 910 (kể cả bảng đơn giá không phải cuộn ngang)
    await nav('Đơn giá'); await page.locator(`${MAIN} tbody tr`, { hasText: 'VC.007' }).first().waitFor();
    for (const w of [1366, 910]) {
      await page.setViewportSize({ width: w, height: 800 });
      if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, `pricecodes-${w}.png`) });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); assert.ok(over <= 1, `tràn ngang ${over}px ở ${w}px`);
      const tbl = await page.evaluate(() => { const box = document.querySelector('.xv-main table').parentElement; return box.scrollWidth - box.clientWidth; }); assert.ok(tbl <= 1, `bảng đơn giá phải cuộn ngang ${tbl}px ở ${w}px`);
    }
    // mã cũ tự tạo (từ bản trước): mã còn dòng giá vẫn hiện trong danh mục phẳng (dữ liệu không mất); mã rỗng không sinh dòng; không có nút tạo mã
    await ctx.store.transaction((tx) => { tx.insert('MA_DON_GIA', { price_code: 'DG-CU-01', unit_code: unit, price_name: 'Mã cũ rỗng', status: 'ACTIVE', note: '' }); }, { user: 'test' });
    await ctx.svc.catalog.savePriceCode({ create: true, record: { priceCode: 'DG-CU-02', unitCode: unit, priceName: 'Mã cũ có dòng giá' }, user: KETOAN });
    await ctx.svc.catalog.addCodeLine({ priceCode: 'DG-CU-02', record: { routeCode: 'VC.007', effectiveFrom: '2026-01-01', fixedPrice: 120000 }, user: KETOAN });
    await nav('Đơn giá'); await page.locator(`${MAIN} tbody tr`, { hasText: 'DG-CU-02' }).first().waitFor();
    assert.equal(await page.locator(`${MAIN} tbody tr`, { hasText: 'DG-CU-01' }).count(), 0, 'mã cũ rỗng không có dòng giá');
    assert.equal(await page.getByRole('button', { name: /Tạo mã/ }).count(), 0);
    // vai trò XEM không thấy nút thêm/sửa/áp dụng
    const xem = await srv.ctx.svc.auth.saveUser({ record: { username: 'xem.qn', fullName: 'Người xem', role: 'XEM', unitCode: 'HAKQN' }, user: { username: 'legacy-fixture' } }); // 1.6.1: nhận mã kích hoạt một lần
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await page.getByLabel('Tên đăng nhập').fill('xem.qn'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mã kích hoạt').fill(xem.setupCode);
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026'); await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    await nav('Đơn giá'); await page.locator(`${MAIN} tbody tr`, { hasText: 'VC.007' }).first().waitFor();
    for (const name of [/Thêm đơn giá/, /^Sửa$/, /^Áp dụng$/, /Tạo mã/]) assert.equal(await page.getByRole('button', { name }).count(), 0, `XEM không được thấy nút ${name}`);
    // Kiểm tra Báo cáo -> Đơn giá theo tuyến
    await page.locator('nav .nav-items').getByRole('button', { name: 'Báo cáo' }).first().click();
    await page.getByRole('tab', { name: 'Đơn giá theo tuyến' }).click();
    await page.getByLabel('Nguồn bảng giá').waitFor();
    await page.locator('tbody tr', { hasText: 'VC.007' }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
