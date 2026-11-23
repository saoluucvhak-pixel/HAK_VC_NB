'use strict';
/** Màn Hợp đồng — thẻ "Tuyến và đơn giá vận chuyển": thêm đơn giá bằng CHỌN TUYẾN TRƯỚC và bằng CHỌN ĐƠN GIÁ TRƯỚC (tuyến tự điền), thấy dòng trong bảng, gỡ dòng,
 *  vai trò XEM không thấy "Thêm đơn giá"/"Gỡ", không còn nút gán/đổi/bỏ mã, thống kê dầu chỉ đọc (không nút nhập dầu), không tràn ngang ở 1366 và 910 px. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE, KETOAN, rid } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
test('Giao diện HAKQN: Hợp đồng — Tuyến và đơn giá vận chuyển (thêm theo tuyến / theo đơn giá, gỡ, vai trò XEM, thống kê dầu chỉ đọc, bố cục)', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const toast = async (re) => { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 30000 }); };
  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(500); };
  const openTab = async () => {
    await nav('Hợp đồng vận chuyển'); await page.locator('.ct-items button', { hasText: 'HAKQN-QS' }).first().click();
    const d = page.locator('.ct-detail', { hasText: 'Hợp đồng HAKQN-QS' }); await d.waitFor();
    await d.getByRole('tab', { name: 'Tuyến và đơn giá vận chuyển' }).click(); await d.locator('#ct-panel-price').getByRole('heading', { name: 'Tuyến và đơn giá đang áp dụng của hợp đồng' }).waitFor();
    return d.locator('#ct-panel-price');
  };
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.locator('.unit-pick label', { hasText: 'HAKQN —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026'); await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    const ctx = srv.ctx; const contractId = 'HD-HAKQN-QS'; const cat = ctx.svc.catalog;
    const imp = ctx.svc.import; const a = await imp.preview({ importType: 'PHIEU_CAN', filePath: FILE.HAKQN, user: 'k' }); await imp.confirm({ batchId: a.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'k' });
    // nguồn để chọn: đơn giá cố định (PT-CD) cho VC.007, đang áp dụng
    const cd = await cat.addCodeLine({ priceCode: 'PT-CD', record: { routeCode: 'VC.007', fixedPrice: 95500, effectiveFrom: '2026-01-01' }, user: KETOAN });
    await cat.activatePrice({ priceId: cd.record.price_id, rowVersion: cd.record.row_version, user: KETOAN });
    await ctx.svc.records.saveFuelRows({ contractId, acceptWarnings: true, clientRequestId: rid(), user: KETOAN,
      rows: [{ receive_date: '2026-09-19', route_code: 'VC.007', fuel_vehicle_code: 'DH_92H00192', uom: 'LÍT', qty_liter: 40, fuel_price_excl_vat: 29000, giver_unit_code: 'DH' }] }).catch(() => null);

    let panel = await openTab();
    assert.match(await page.locator('[role=tab][aria-selected=true]').innerText(), /Tuyến và đơn giá vận chuyển/);
    assert.equal(await page.getByRole('tab', { name: 'Mã đơn giá' }).count(), 0, 'không còn thẻ "Mã đơn giá"');
    await panel.locator('table').first().locator('tbody tr').first().waitFor();
    // không còn nút / lời nhắc gán – đổi – bỏ mã
    for (const name of [/Gán/, /Đổi mã/, /Bỏ gán|Bỏ mã/, /Tạo mã đơn giá/, /Chọn đơn giá có sẵn/, /Đổi ở DM Đơn giá/, /Xem cả \d+ tuyến khác/, /Sang màn nhập dầu/]) assert.equal(await page.getByRole('button', { name }).count(), 0, `không còn nút ${name}`);
    assert.ok(!/gán mã|Gán mã|Mã đơn giá áp dụng/.test(await panel.innerText()), 'không còn chữ gán mã');

    // (1) CHỌN TUYẾN TRƯỚC: VC.007 → ô Đơn giá chỉ còn đơn giá của VC.007 → chọn đơn giá cố định → Lưu
    await panel.getByRole('button', { name: 'Thêm đơn giá' }).click();
    let m = page.locator('.modal', { hasText: 'Thêm đơn giá cho hợp đồng' });
    await m.getByLabel('Tuyến', { exact: true }).selectOption('VC.007');
    const opts = await m.getByLabel('Đơn giá', { exact: true }).locator('option').allInnerTexts();
    assert.ok(opts.length >= 3, `VC.007 có ≥ 2 đơn giá (PT-CD, PT-TD): ${opts.join(' | ')}`);
    assert.ok(opts.slice(1).every((t) => !/VC\.\d+ ·/.test(t)), 'đã chọn tuyến → không lặp mã tuyến trong từng đơn giá');
    assert.ok(opts.some((t) => /Đơn giá cố định · 95\.500/.test(t)) && opts.some((t) => /điều chỉnh/.test(t)), `hiện phương thức + đơn giá + ngày: ${opts.join(' | ')}`);
    const cdVal = await m.getByLabel('Đơn giá', { exact: true }).locator('option', { hasText: 'Đơn giá cố định' }).first().getAttribute('value');
    await m.getByLabel('Đơn giá', { exact: true }).selectOption(cdVal);
    assert.equal(await m.getByLabel('Hiệu lực từ').inputValue(), await page.evaluate(() => window.DGVC.today()), 'mặc định hôm nay');
    assert.equal(await m.getByText(/Mã đơn giá|Hình thức/).count(), 0, 'hộp thoại không có chọn mã / hình thức');
    await m.getByLabel('Hiệu lực từ').fill('2026-09-01'); await m.getByRole('button', { name: 'Lưu' }).click();
    await toast(/Đã thêm đơn giá tuyến VC\.007/);
    panel = await openTab();
    const r7 = panel.locator('tbody tr', { hasText: 'VC.007' }).first();
    await r7.getByText('Giá riêng HĐ').waitFor(); await r7.getByText('Cố định').first().waitFor(); await r7.getByText('95.500').waitFor(); await r7.getByText('2026-09-01').or(r7.getByText('01/09/2026')).waitFor();
    assert.equal(ctx.store.find('PRICE_HISTORY', (p) => p.contract_id === contractId && p.route_code === 'VC.007' && !p.price_code && p.status === 'ACTIVE').length, 1);

    // (2) CHỌN ĐƠN GIÁ TRƯỚC: chưa chọn tuyến, chọn một đơn giá theo giá dầu của tuyến khác → ô Tuyến tự điền
    const other = await page.evaluate(async (id) => { const r = await window.DGVC.api('contracts.priceChoices', { contractId: id }); return r.items.find((x) => x.routeCode !== 'VC.007' && x.priceMethod === 'THEO_DAU' && !x.chosenForContract); }, contractId);
    assert.ok(other, 'có đơn giá theo giá dầu của tuyến khác');
    await panel.getByRole('button', { name: 'Thêm đơn giá' }).click(); m = page.locator('.modal', { hasText: 'Thêm đơn giá cho hợp đồng' });
    assert.equal(await m.getByLabel('Tuyến', { exact: true }).inputValue(), '', 'chưa chọn tuyến');
    const all = await m.getByLabel('Đơn giá', { exact: true }).locator('option').count(); assert.ok(all > 3, 'chưa chọn tuyến → liệt kê mọi đơn giá chọn được');
    await m.getByLabel('Đơn giá', { exact: true }).selectOption(other.priceId);
    assert.equal(await m.getByLabel('Tuyến', { exact: true }).inputValue(), other.routeCode, 'chọn đơn giá → tuyến tự điền');
    await m.getByRole('button', { name: 'Lưu' }).click(); await toast(new RegExp(`Đã thêm đơn giá tuyến ${other.routeCode.replace('.', '\\.')}`));
    panel = await openTab();
    const ro = panel.locator('tbody tr', { hasText: other.routeCode }).first(); await ro.getByText('Giá riêng HĐ').waitFor(); await ro.getByText('Điều chỉnh dầu').first().waitFor();

    // thiếu đơn giá → báo, hộp thoại còn nguyên
    await panel.getByRole('button', { name: 'Thêm đơn giá' }).click(); m = page.locator('.modal', { hasText: 'Thêm đơn giá cho hợp đồng' });
    await m.getByRole('button', { name: 'Lưu' }).click(); await toast(/Chọn đơn giá cần thêm/); await m.waitFor(); await m.getByRole('button', { name: 'Hủy' }).click();

    // (3) GỠ dòng giá riêng vừa thêm (tuyến khác VC.007)
    await ro.getByRole('button', { name: 'Gỡ' }).click(); await page.locator('.modal', { hasText: 'Gỡ đơn giá' }).getByRole('button', { name: 'Gỡ' }).click();
    await toast(/Đã gỡ đơn giá tuyến/);
    panel = await openTab();
    assert.equal(await panel.locator('tbody tr', { hasText: other.routeCode }).filter({ hasText: 'Giá riêng HĐ' }).count(), 0, 'dòng đã gỡ');
    const rest = ctx.store.find('PRICE_HISTORY', (p) => p.contract_id === contractId && p.route_code === other.routeCode && !p.price_code);
    assert.equal(rest.filter((p) => !(p.status === 'CLOSED' && p.effective_to && p.effective_to < p.effective_from)).length, 0, 'không còn dòng giá riêng hiệu lực');
    assert.equal(rest.length, 1, 'dòng đã gỡ được giữ ở dạng đóng (để gói trao đổi mang trạng thái gỡ sang nhà máy khác)');
    await panel.locator('tbody tr', { hasText: 'VC.007' }).first().getByRole('button', { name: 'Gỡ' }).waitFor(); // dòng VC.007 còn, gỡ được

    // thống kê dầu CHỈ ĐỌC
    const fs0 = ctx.store.find('GIAO_NHAN_DAU', (r) => r.contract_id === contractId && !r.is_deleted);
    await panel.getByRole('heading', { name: /Thống kê giao nhận dầu theo tuyến/ }).waitFor();
    if (fs0.length) { const fr = panel.locator('tbody tr', { hasText: 'Tổng' }); await fr.waitFor(); await fr.getByText('40').first().waitFor(); }
    for (const th of ['Tuyến', 'Số lần nhận', 'Tổng lít', 'Thành tiền chưa VAT', 'Giá dầu bình quân', 'Từ ngày', 'Đến ngày']) await panel.locator('th', { hasText: th }).first().waitFor();
    assert.equal(await panel.getByRole('button', { name: /nhập dầu|Nhập tay|Import|Giao nhận dầu/i }).count(), 0, 'không có nút nhập dầu');
    assert.equal(await panel.locator('input, textarea').count(), 0, 'thẻ không có ô nhập liệu');

    // bố cục: không tràn ngang ở 1366 và 910
    for (const w of [1366, 910]) {
      await page.setViewportSize({ width: w, height: 800 }); await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove())); await page.waitForTimeout(200);
      if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, `contract-prices-${w}.png`), fullPage: true });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); assert.ok(over <= 1, `tràn ngang ${over}px ở ${w}px`);
      const tbl = await page.evaluate(() => [...document.querySelectorAll('#ct-panel-price table')].map((t) => t.parentElement.scrollWidth - t.parentElement.clientWidth)); if (w >= 1366) assert.ok(tbl.every((x) => x <= 1), `bảng phải cuộn ngang ${tbl} ở ${w}px`);
    }
    await page.setViewportSize({ width: 1366, height: 800 });

    // lưu hợp đồng (sửa ghi chú) không làm mất mã đơn giá có sẵn của hợp đồng; thẻ Thông tin không còn ô chọn mã đơn giá
    const codeBefore = ctx.store.get('HOP_DONG', contractId).price_code || '';
    const d0 = page.locator('.ct-detail', { hasText: 'Hợp đồng HAKQN-QS' }); await d0.getByRole('tab', { name: 'Thông tin' }).click();
    assert.equal(await d0.locator('label.field').filter({ has: page.locator('span:text-is("Mã đơn giá")') }).count(), 0, 'không còn ô Mã đơn giá trong form hợp đồng');
    await d0.locator('label.field').filter({ has: page.locator('span:text-is("Ghi chú")') }).locator('textarea, input').first().fill('sửa ghi chú'); await d0.getByRole('button', { name: 'Lưu hợp đồng' }).click(); await toast(/Đã lưu hợp đồng/);
    assert.equal(ctx.store.get('HOP_DONG', contractId).price_code || '', codeBefore, 'lưu hợp đồng không đổi mã đơn giá');

    // vai trò XEM: không thấy "Thêm đơn giá" / "Gỡ"
    const xem = await page.evaluate(() => window.DGVC.api('users.save', { record: { username: 'xem.qn', fullName: 'Người xem', role: 'XEM', unitCode: 'HAKQN' } }));
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await page.getByLabel('Tên đăng nhập').fill('xem.qn'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mã kích hoạt').fill(xem.setupCode);
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026'); await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    panel = await openTab(); await panel.locator('tbody tr', { hasText: 'VC.007' }).first().waitFor();
    for (const name of [/Thêm đơn giá/, /^Gỡ$/]) assert.equal(await page.getByRole('button', { name }).count(), 0, `XEM không được thấy nút ${name}`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
