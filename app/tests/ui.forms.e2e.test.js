'use strict';
const { openLegacyInstall } = require('./ui-login-setup');
/** Giao diện: Danh mục Hình thức giá (chính–phụ) và Đơn giá (chọn Hình thức giá từ danh mục, ngăn hình thức chỉ-xem); vai trò XEM; bố cục hẹp; không lỗi JS. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { KETOAN } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');
const SHOT = process.env.SHOT_DIR || '';

test('Giao diện HAKQN: Hình thức giá + Đơn giá — thêm/sửa/xóa, xem chéo chỉ-xem, vai trò XEM, bố cục hẹp', { skip: !CHROME && 'không có Chromium', timeout: 420000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const toast = async (re) => { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 30000 }); };
  const nav = async (label, heading) => { await page.locator('nav button', { hasText: label }).first().click(); await page.getByRole('heading', { name: heading || label, exact: true }).first().waitFor(); };
  const shot = async (name) => { if (SHOT) { fs.mkdirSync(SHOT, { recursive: true }); await page.evaluate(() => document.querySelectorAll('.toasts').forEach((t) => t.remove())); await page.screenshot({ path: path.join(SHOT, name) }); } };
  const noOverflow = async (tag) => { const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); assert.ok(o <= 1, `${tag}: tràn ngang ${o}px`); };
  const api = (a, p) => page.evaluate(([x, y]) => window.DGVC.api(x, y), [a, p || {}]);
  try {
    await openLegacyInstall(page, srv, 'HAKQN');
    const ctx = srv.ctx;

    // ── menu: Hình thức giá ngay trước Đơn giá, trong nhóm Danh mục; không còn nhãn "DM Đơn giá"
    const labels = await page.locator('#nav-g-master button .nav-txt').allInnerTexts();
    assert.ok(labels.indexOf('Hình thức giá') >= 0 && labels.indexOf('Đơn giá') === labels.indexOf('Hình thức giá') + 1, `thứ tự menu Danh mục: ${labels.join(' | ')}`);
    assert.equal(await page.locator('nav button', { hasText: 'DM Đơn giá' }).count(), 0);
    // đơn giá có sẵn cho màn xem chéo (qua dịch vụ): cố định VC.007 từ 2026-01-01
    await api('forms.list');
    await ctx.svc.catalog.addCodeLine({ priceCode: 'PT-CD', record: { routeCode: 'VC.007', effectiveFrom: '2026-01-01', fixedPrice: 150000 }, user: KETOAN });

    // ── màn Hình thức giá: bảng chính
    await nav('Hình thức giá');
    const table = page.locator('section[aria-label="Danh mục hình thức giá"] table');
    for (const col of ['Ngày cập nhật', 'Mã hình thức', 'Công thức tính giá', 'Hiệu lực']) await table.getByRole('columnheader', { name: col, exact: true }).waitFor();
    const cdOld = table.locator('tbody tr', { hasText: 'HT-CD-20000101'.slice(0, 0) + 'CO_DINH' }).first();
    await cdOld.getByText('đang hiệu lực').first().waitFor();
    assert.equal(await table.locator('tbody tr').count(), 2, 'hai dòng hạt giống');
    await shot('forms-1366-empty-side.png');

    // thêm hình thức mới cùng mã CO_DINH → dòng cũ hết hiệu lực
    await page.getByRole('button', { name: 'Thêm hình thức' }).click();
    const dlg = page.locator('.modal', { hasText: 'Thêm hình thức giá' });
    await dlg.getByText('Chỉ mô tả — không đổi cách tính của phần mềm').waitFor();
    await dlg.getByLabel(/^Mã hình thức/).selectOption('CO_DINH');
    // điền lùi ngày → bị chặn, hộp thoại còn mở
    await dlg.getByLabel(/^Ngày cập nhật/).fill('1999-01-01'); await dlg.getByRole('button', { name: 'Lưu' }).click(); await toast(/phải SAU/); await dlg.waitFor();
    await dlg.getByLabel(/^Ngày cập nhật/).fill('2026-12-01');
    await dlg.getByLabel(/^Tên hình thức giá/).fill('Đơn giá cố định 2027'); await dlg.getByLabel(/^Công thức tính giá/).fill('Đơn giá cố định đ/tấn trọn gói — bảng giá mới');
    await dlg.getByRole('button', { name: 'Lưu' }).click();
    await toast(/Dòng cũ HT-CD-20000101 đã hết hiệu lực/);
    const oldRow = table.locator('tbody tr', { hasText: 'HT-CD-20000101'.slice(0, 0) + '01/01/2000' }).filter({ hasText: 'CO_DINH' });
    await oldRow.getByText('Hết hiệu lực').waitFor(); await oldRow.getByText('30/11/2026').waitFor();
    const newRow = table.locator('tbody tr', { hasText: '01/12/2026' }); await newRow.getByText('đang hiệu lực').waitFor(); await newRow.getByText('Đơn giá cố định đ/tấn trọn gói — bảng giá mới').waitFor();
    assert.equal((await api('forms.get', { formId: 'HT-CD-20000101' })).record.status, 'CLOSED');

    // bấm một dòng → ngăn đơn giá chỉ-xem + hướng dẫn, không có nút thêm/sửa/xóa đơn giá
    const side = page.locator('aside[aria-label^="Đơn giá theo hình thức"]');
    await oldRow.locator('td').first().click();
    await side.getByText('Chỉ để xem.').waitFor(); await side.getByText('Danh mục › Đơn giá').first().waitFor();
    await side.locator('tbody tr', { hasText: 'PR-VC.007' }).waitFor();
    for (const col of ['Ngày cập nhật', 'Mã đơn giá', 'Tuyến', 'Đơn giá', 'Hiệu lực', 'Trạng thái']) await side.getByRole('columnheader', { name: col, exact: true }).waitFor();
    const btns = await side.getByRole('button').allInnerTexts(); assert.deepEqual(btns, ['Mở Đơn giá'], `ngăn chỉ-xem chỉ có nút Mở Đơn giá: ${btns}`);
    for (const re of [/Thêm đơn giá/, /^Sửa/, /^Xóa/]) assert.equal(await side.getByRole('button', { name: re }).count(), 0);
    assert.equal(await side.locator('tbody tr.click').count(), 0, 'dòng đơn giá trong ngăn xem chéo không bấm sửa được');
    assert.equal(await oldRow.getAttribute('aria-current'), 'true');
    await shot('forms-1366-side.png');

    // xóa: dòng cũ (không phải mới nhất) bị chặn, hiện nguyên văn lỗi nghiệp vụ; Hủy không xóa
    await oldRow.getByRole('button', { name: /^Xóa hình thức/ }).click(); await page.getByRole('button', { name: 'Hủy' }).click();
    await oldRow.getByRole('button', { name: /^Xóa hình thức/ }).click(); await page.locator('.modal').getByRole('button', { name: 'Xóa' }).click();
    await toast(/không phải dòng mới nhất/);
    // sửa dòng mới: tên + ghi chú (rowVersion)
    await newRow.getByRole('button', { name: /^Sửa hình thức/ }).click();
    const ed = page.locator('.modal', { hasText: 'Sửa hình thức HT-CD-20261201' });
    assert.equal(await ed.getByLabel(/^Mã hình thức/).getAttribute('readonly') !== null, true);
    await ed.getByLabel(/^Tên hình thức giá/).fill('Đơn giá cố định (bảng 2027)'); await ed.getByLabel(/^Ghi chú/).fill('thử nghiệm');
    await ed.getByRole('button', { name: 'Lưu' }).click(); await toast(/Đã lưu hình thức HT-CD-20261201/);
    assert.equal((await api('forms.get', { formId: 'HT-CD-20261201' })).record.formName, 'Đơn giá cố định (bảng 2027)');
    // xóa dòng mới nhất (chưa đơn giá nào dùng) → dòng cũ hiệu lực trở lại
    await table.locator('tbody tr', { hasText: '01/12/2026' }).getByRole('button', { name: /^Xóa hình thức/ }).click(); await page.locator('.modal').getByRole('button', { name: 'Xóa' }).click();
    await toast(/Đã xóa hình thức HT-CD-20261201/);
    await table.locator('tbody tr', { hasText: '01/01/2000' }).filter({ hasText: 'CO_DINH' }).getByText('đang hiệu lực').waitFor();
    // dòng đang có đơn giá dùng: không xóa được, báo nguyên văn
    await table.locator('tbody tr', { hasText: 'CO_DINH' }).getByRole('button', { name: /^Xóa hình thức/ }).click(); await page.locator('.modal').getByRole('button', { name: 'Xóa' }).click();
    await toast(/đang có 1 đơn giá dùng|là dòng duy nhất/);

    // "Mở Đơn giá" → màn Đơn giá
    await table.locator('tbody tr', { hasText: 'CO_DINH' }).locator('td').first().click();
    await page.locator('aside[aria-label^="Đơn giá theo hình thức"]').getByRole('button', { name: 'Mở Đơn giá' }).click();
    await page.getByRole('heading', { name: 'Đơn giá', exact: true }).first().waitFor();

    // ── màn Đơn giá: thêm đơn giá chọn Hình thức giá từ danh mục
    await page.getByRole('button', { name: 'Thêm đơn giá' }).click();
    const pk = page.locator('.modal', { hasText: 'chọn Hình thức giá' });
    const sel = pk.getByLabel('Hình thức giá');
    assert.equal(await sel.locator('option').count(), 2, 'chỉ hình thức đang hiệu lực');
    await sel.selectOption({ index: 0 }); await pk.getByText('Công thức tính giá:').waitFor();
    const first = await sel.locator('option:checked').innerText(); assert.match(first, /Đơn giá cố định/);
    await pk.getByRole('button', { name: 'Tiếp tục' }).click();
    const lm = page.locator('.modal', { hasText: 'Thêm đơn giá cố định — PT-CD' });
    await lm.getByRole('combobox', { name: /^Tuyến/ }).selectOption('VC.008'); await lm.getByLabel(/Đơn giá cố định/).fill('160.000'); await lm.getByLabel(/Ngày cập nhật/).fill('2026-02-01');
    await lm.getByRole('button', { name: 'Lưu' }).click(); await toast(/Đã thêm dòng giá/);
    const prow = page.locator('section[aria-label="Danh mục đơn giá"] tbody tr', { hasText: 'VC.008' }).filter({ hasText: '01/02/2026' }); await prow.getByText('Nháp').waitFor();
    await prow.getByRole('button', { name: /^Áp dụng/ }).click(); await toast(/Đã áp dụng/);
    await page.locator('section[aria-label="Danh mục đơn giá"] tbody tr', { hasText: 'VC.008' }).filter({ hasText: '01/02/2026' }).getByText('Đang dùng').waitFor();
    // theo giá dầu: chọn hình thức thứ hai
    await page.getByRole('button', { name: 'Thêm đơn giá' }).click();
    const pk2 = page.locator('.modal', { hasText: 'chọn Hình thức giá' }); await pk2.getByLabel('Hình thức giá').selectOption({ label: (await pk2.getByLabel('Hình thức giá').locator('option').allInnerTexts()).find((t) => /giá dầu/.test(t)) });
    await pk2.getByRole('button', { name: 'Tiếp tục' }).click();
    const tm = page.locator('.modal', { hasText: 'Thêm đơn giá điều chỉnh theo giá dầu — PT-TD' }); await tm.waitFor();
    await tm.getByLabel(/Đơn giá cước dự kiến/).fill('165.000'); await tm.getByLabel(/ĐG dầu chưa VAT/).fill('15.500'); await tm.getByLabel(/Định mức dầu/).fill('0.4'); await tm.getByLabel(/KL trung bình/).fill('18');
    await tm.getByRole('combobox', { name: /^Tuyến/ }).selectOption('VC.007'); await tm.getByLabel(/Ngày cập nhật/).fill('2027-01-01');
    await page.waitForFunction(() => { const l = [...document.querySelectorAll('.modal label')].find((x) => /Đơn giá dự kiến ký hợp đồng/.test(x.textContent)); return l && l.querySelector('input').value !== ''; });
    await tm.getByRole('button', { name: 'Lưu' }).click(); await toast(/Đã thêm dòng giá/);
    const main = page.locator('section[aria-label="Danh mục đơn giá"]');
    for (const col of ['Ngày cập nhật', 'Mã đơn giá', 'Tuyến', 'Hình thức giá', 'Cự ly chuyến', 'ĐG ký HĐ', 'Hiệu lực', 'Trạng thái']) await main.getByRole('columnheader', { name: col, exact: true }).waitFor();

    // bấm một dòng đơn giá → ngăn Hình thức giá chỉ-xem
    const trow = main.locator('tbody tr', { hasText: 'VC.007' }).filter({ hasText: 'Theo dầu' });
    await trow.locator('td').first().click();
    const fside = page.locator('aside[aria-label^="Hình thức giá của đơn giá"]');
    await fside.getByText('Chỉ để xem.').waitFor(); await fside.getByText('Danh mục › Hình thức giá').first().waitFor();
    await fside.getByText('Đơn giá điều chỉnh theo giá dầu').first().waitFor(); await fside.getByText('Công thức tính giá').first().waitFor();
    const fb = await fside.getByRole('button').allInnerTexts(); assert.deepEqual(fb, ['Mở Hình thức giá']);
    await shot('pricecodes-1366-side.png');
    // lọc theo Hình thức giá (bộ lọc thông minh)
    await page.locator('[data-sf="pricecodes"]').waitFor();
    const total = await main.locator('tbody tr.click').count(); assert.ok(total >= 3);
    await page.locator('[data-sf="pricecodes"]').getByLabel('Hình thức giá').first().selectOption('CO_DINH');
    await page.waitForFunction(() => [...document.querySelectorAll('section[aria-label="Danh mục đơn giá"] tbody tr.click')].every((r) => !/Theo dầu/.test(r.textContent)));
    assert.ok(await main.locator('tbody tr.click').count() < total);
    await page.locator('[data-sf="pricecodes"] [data-sf-reset]').first().click().catch(() => {});
    // bàn phím: dòng nhận Tab, Enter chọn dòng
    await page.locator('[data-sf-q]').first().fill('VC.007');
    const kr = main.locator('tbody tr.click').first(); await kr.focus(); await page.keyboard.press('Enter');
    assert.equal(await kr.getAttribute('aria-current'), 'true');
    await fside.getByRole('button', { name: 'Mở Hình thức giá' }).click();
    await page.getByRole('heading', { name: 'Hình thức giá', exact: true }).first().waitFor();

    // ── bố cục hẹp: không tràn ngang, ngăn xem chéo xếp dưới bảng chính
    for (const [name, heading] of [['Hình thức giá', 'Hình thức giá'], ['Đơn giá', 'Đơn giá']]) {
      await nav(name, heading);
      await page.locator('tbody tr.click').first().locator('td').first().click();
      for (const wd of [1366, 1093, 910, 820]) {
        await page.setViewportSize({ width: wd, height: 800 }); await page.waitForTimeout(150);
        await noOverflow(`${name} @${wd}`);
        const lay = await page.evaluate(() => { const m = document.querySelector('.xv-main').getBoundingClientRect(); const s = document.querySelector('.xv-side').getBoundingClientRect(); return { below: s.top >= m.bottom - 1, sideRight: s.left >= m.right - 1 }; });
        if (wd <= 1279) assert.ok(lay.below, `${name} @${wd}: ngăn xem chéo phải xếp dưới bảng chính`); else assert.ok(lay.sideRight, `${name} @${wd}: ngăn xem chéo bên phải`);
        const cut = await page.evaluate(() => [...document.querySelectorAll('.xv-h, .head h1, .tag')].filter((e) => e.scrollWidth > e.clientWidth + 1).length); assert.equal(cut, 0, `${name} @${wd}: chữ ở thẻ/tiêu đề bị cắt`);
        if (wd === 910) await shot(`${name === 'Đơn giá' ? 'pricecodes' : 'forms'}-910.png`);
      }
      await page.setViewportSize({ width: 1366, height: 800 });
    }

    // ── tên truy cập: nút / ô chọn có tên; hộp thoại giữ focus
    await nav('Hình thức giá');
    const unnamed = await page.evaluate(() => [...document.querySelectorAll('main button, main select, main input')].filter((e) => !(e.getAttribute('aria-label') || e.textContent.trim() || (e.labels && e.labels.length) || e.title)).length); assert.equal(unnamed, 0, 'có nút/ô chưa có tên truy cập');
    await page.getByRole('button', { name: 'Thêm hình thức' }).focus(); await page.keyboard.press('Enter');
    const d2 = page.locator('.modal', { hasText: 'Thêm hình thức giá' }); await d2.waitFor();
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => !!document.activeElement.closest('.modal')), 'focus phải ở trong hộp thoại');
    await page.keyboard.press('Escape'); await d2.waitFor({ state: 'detached' });

    // ── vai trò XEM: không thấy nút ghi ở cả hai màn, vẫn xem chéo được
    const xem = await srv.ctx.svc.auth.saveUser({ record: { username: 'xem.qn', fullName: 'Người xem', role: 'XEM', unitCode: 'HAKQN' }, user: { username: 'legacy-fixture' } });
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await page.getByLabel('Tên đăng nhập').fill('xem.qn'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mã kích hoạt').fill(xem.setupCode);
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026'); await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    await nav('Hình thức giá'); await page.locator('tbody tr.click').first().locator('td').first().click(); await page.locator('aside[aria-label^="Đơn giá theo hình thức"]').getByText('Chỉ để xem.').waitFor();
    for (const re of [/Thêm hình thức/, /^Sửa/, /^Xóa/, /Thêm đơn giá/]) assert.equal(await page.getByRole('button', { name: re }).count(), 0, `XEM không được thấy nút ${re}`);
    await nav('Đơn giá'); await page.locator('tbody tr.click').first().locator('td').first().click(); await page.locator('aside[aria-label^="Hình thức giá của đơn giá"]').getByText('Chỉ để xem.').waitFor();
    for (const re of [/Thêm đơn giá/, /^Sửa/, /^Áp dụng/, /^Xóa/, /Thêm hình thức/]) assert.equal(await page.getByRole('button', { name: re }).count(), 0, `XEM không được thấy nút ${re}`);
    await page.locator('tbody tr', { hasText: 'VC.007' }).first().getByRole('button', { name: /^Xem công thức/ }).waitFor();
    assert.deepEqual(errors, []);
  } catch (e) { if (SHOT) await shot('FAIL.png').catch(() => {}); throw e; } finally { await browser.close(); await srv.close(); }
});
