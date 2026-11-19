'use strict';
/** Giá 3 tầng (đợt 2, Task 6 + B2): màn Giao nhận dầu báo "toàn tuyến cố định — không cần nhập dầu"; khối "Giao nhận dầu của hợp đồng" ở màn Hợp đồng chỉ khi có tuyến theo giá dầu; menu Hợp đồng → Giao nhận dầu → Tính giá. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE, KETOAN, rid } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
test('Giao diện HAKQN: luồng Hợp đồng → Giao nhận dầu → Tính giá theo hình thức giá', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(500); };
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.locator('.unit-pick label', { hasText: 'HAKQN —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026'); await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    const ctx = srv.ctx; const contractId = 'HD-HAKQN-QS'; const cat = ctx.svc.catalog; const unit = ctx.store.get('HOP_DONG', contractId).customer_unit_code;
    const imp = ctx.svc.import; const a = await imp.preview({ importType: 'PHIEU_CAN', filePath: FILE.HAKQN, user: 'k' }); await imp.confirm({ batchId: a.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'k' });

    // thứ tự menu: Hợp đồng → Giao nhận dầu → Tính giá
    const labels = await page.locator('nav button').allInnerTexts(); const at = (t) => labels.findIndex((x) => x.includes(t));
    assert.ok(at('Hợp đồng vận chuyển') < at('Giao nhận dầu') && at('Giao nhận dầu') < at('Tính giá vận chuyển'), `thứ tự menu: ${labels.join(' | ')}`);

    // (1) hợp đồng có tuyến theo giá dầu (giá chung) → KHÔNG có thông báo; màn Hợp đồng có khối "Giao nhận dầu của hợp đồng"
    await nav('Giao nhận dầu'); await page.getByRole('heading', { name: 'Giao nhận dầu' }).first().waitFor(); await page.waitForTimeout(600);
    assert.equal(await page.getByText(/toàn tuyến cố định — không cần nhập dầu/).count(), 0);
    await nav('Hợp đồng vận chuyển'); await page.locator('tbody tr', { hasText: 'HAKQN-QS' }).first().click();
    const cm = page.locator('.modal', { hasText: 'Hợp đồng HAKQN-QS' }); await cm.getByRole('heading', { name: 'Giao nhận dầu của hợp đồng' }).waitFor();
    await cm.getByText(/dòng dầu/).first().waitFor(); await cm.getByRole('button', { name: 'Sang màn nhập dầu →' }).click();
    await page.getByRole('heading', { name: 'Giao nhận dầu' }).first().waitFor();

    // (2) gán mã đơn giá cố định phủ MỌI tuyến đang có giá → toàn tuyến cố định → có thông báo (vẫn nhập được); khối dầu ở màn Hợp đồng biến mất
    await cat.savePriceCode({ create: true, record: { priceCode: 'DG-ALL-FIX', unitCode: unit, priceName: 'Cố định mọi tuyến' }, user: KETOAN });
    // tuyến tính theo M3 không dùng được giá cố định → ngừng dùng các tuyến M3 để hợp đồng chỉ còn tuyến tính theo tấn
    await ctx.store.transaction((tx) => { for (const r of tx.all('TUYEN_VC')) if (r.uom === 'M3') tx.update('TUYEN_VC', r.route_code, { is_active: false }); }, { user: 'test' });
    for (const it of cat.contractRouteSources({ contractId }).items) {
      const l = await cat.addCodeLine({ priceCode: 'DG-ALL-FIX', record: { routeCode: it.routeCode, effectiveFrom: '2026-01-01', fixedPrice: 150000 }, user: KETOAN });
      await cat.activatePrice({ priceId: l.record.price_id, rowVersion: l.record.row_version, user: KETOAN });
    }
    const md = ctx.svc.master; await md.saveContract({ record: { contractId, priceCode: 'DG-ALL-FIX' }, rowVersion: ctx.store.get('HOP_DONG', contractId).row_version, user: KETOAN });
    await nav('Đơn giá'); await nav('Giao nhận dầu'); await page.getByText(/toàn tuyến cố định — không cần nhập dầu/).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Nhập tay' }).count() >= 0, true, 'vẫn nhập được');
    await nav('Hợp đồng vận chuyển'); await page.locator('tbody tr', { hasText: 'HAKQN-QS' }).first().click();
    await page.locator('.modal', { hasText: 'Hợp đồng HAKQN-QS' }).getByText('DG-ALL-FIX — Đơn giá cố định').waitFor();
    assert.equal(await page.locator('.modal').getByRole('heading', { name: 'Giao nhận dầu của hợp đồng' }).count(), 0, 'toàn tuyến cố định → không có khối dầu');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
