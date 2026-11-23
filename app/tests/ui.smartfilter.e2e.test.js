'use strict';
/** Giao diện: Phiếu cân + Giao nhận dầu dùng bộ lọc thông minh (tìm không dấu, kỳ/khoảng ngày, thẻ điều kiện, nhớ lần trước, đặt lại); ngày luôn đi liền nhau một hàng. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE, CONTRACT, install, rid } = require('./install');
const { QueryService } = require('../main/services/QueryService');

const CHROME = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');

test('Máy chủ: tickets.list lọc "mới nhập từ" (importedSince)', async () => {
  const { store } = await install('DH');
  const q = new QueryService(store); const all = q.tickets({}).total; assert.ok(all > 0);
  assert.equal(q.tickets({ importedSince: '2999-01-01T00:00:00.000Z' }).total, 0, 'mốc ở tương lai → không phiếu nào');
  assert.equal(q.tickets({ importedSince: '2000-01-01T00:00:00.000Z' }).total, all, 'mốc ở quá khứ → đủ phiếu');
  assert.equal(q.tickets({ importedSince: 'không-phải-ngày' }).total, all, 'mốc sai định dạng → bỏ qua, không lỗi');
  store.close();
});

test('Giao diện HAKQN: bộ lọc thông minh ở Phiếu cân và Giao nhận dầu', { skip: !CHROME && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(500); };
  const shown = async () => { const t = await page.locator('[data-sf-summary]').first().innerText(); const m = t.match(/Hiển thị ([\d.]+) \/ ([\d.]+) dòng/); assert.ok(m, `không thấy dòng kết quả: ${t}`); return { kept: Number(m[1].replace(/\./g, '')), total: Number(m[2].replace(/\./g, '')) }; };
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
    const ctx = srv.ctx; const imp = ctx.svc.import;
    const a = await imp.preview({ importType: 'PHIEU_CAN', filePath: FILE.HAKQN, user: 'k' }); await imp.confirm({ batchId: a.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'k' });
    const f = await imp.preview({ importType: 'GIAO_NHAN_DAU', contractId: CONTRACT.HAKQN, filePath: FILE.HAKQN, user: 'k' }); await imp.confirm({ batchId: f.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'k' });
    const totalTickets = ctx.svc.query.tickets({}).total; const plate = ctx.store.all('PHIEU_CAN')[0].plate_no; const expectPlate = ctx.svc.query.tickets({ q: plate }).total;

    // ── Phiếu cân
    await nav('Phiếu cân'); await page.locator('[data-sf="tickets"]').waitFor();
    assert.equal((await shown()).total, totalTickets);
    assert.equal(await page.getByRole('button', { name: 'Lọc', exact: true }).count(), 0, 'không còn nút Lọc cũ: lọc ngay khi gõ / chọn');
    // tìm theo biển số (tự lọc, không cần bấm nút)
    await page.locator('[data-sf-q]').first().fill(plate.toLowerCase());
    await page.waitForFunction((n) => { const t = document.querySelector('[data-sf-summary]'); return t && t.innerText.includes(`Hiển thị ${n}`); }, String(expectPlate).replace(/\B(?=(\d{3})+(?!\d))/g, '.'), { timeout: 15000 });
    assert.equal((await shown()).kept, expectPlate); assert.ok(expectPlate < totalTickets);
    await page.getByText(/Tìm: /).first().waitFor(); // thẻ điều kiện đang lọc
    // nhớ bộ lọc lần trước: rời màn rồi quay lại vẫn còn
    await nav('Giao nhận dầu'); await nav('Phiếu cân'); await page.locator('[data-sf="tickets"]').waitFor();
    assert.equal((await shown()).kept, expectPlate, 'quay lại vẫn đang lọc theo biển số');
    // đặt lại
    await page.locator('[data-sf-reset]').first().click();
    await page.waitForFunction((n) => document.querySelector('[data-sf-summary]').innerText.includes(`Hiển thị ${n}`), String(totalTickets), { timeout: 15000 });
    assert.equal((await shown()).kept, totalTickets);
    // chọn nhanh khoảng ngày: "7 ngày" điền Từ/Đến
    await page.getByRole('button', { name: '7 ngày' }).click(); await page.waitForTimeout(600);
    assert.notEqual(await page.locator('[data-sf-tu]').first().inputValue(), '');
    assert.notEqual(await page.locator('[data-sf-den]').first().inputValue(), '');
    await page.locator('[data-sf-reset]').first().click(); await page.waitForTimeout(500);
    // bố cục: Kỳ + Từ ngày + Đến ngày cùng một hàng ở 910 px, không tràn ngang
    await page.setViewportSize({ width: 910, height: 800 });
    const ys = await page.evaluate(() => ['[data-sf-period]', '[data-sf-tu]', '[data-sf-den]'].map((s) => Math.round(document.querySelector(s).getBoundingClientRect().top)));
    assert.ok(Math.max(...ys) - Math.min(...ys) <= 4, `Kỳ / Từ ngày / Đến ngày phải cùng một hàng: ${ys}`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, 'không tràn ngang ở 910px');
    await page.setViewportSize({ width: 1366, height: 800 });

    // ── Giao nhận dầu
    await nav('Giao nhận dầu'); await page.locator('[data-sf="fuel"]').waitFor();
    const fuelAll = ctx.svc.query.fuel({ contractId: CONTRACT.HAKQN }).total; assert.ok(fuelAll > 0);
    assert.equal((await shown()).total, fuelAll);
    const fp = ctx.svc.query.fuel({ contractId: CONTRACT.HAKQN }).items[0].plate_no; const fexp = ctx.svc.query.fuel({ contractId: CONTRACT.HAKQN }).items.filter((r) => r.plate_no.includes(fp)).length;
    await page.locator('[data-sf-q]').first().fill(fp.replace(/-/g, ' ').slice(0, 8).toLowerCase().replace(' ', '-') || fp);
    await page.waitForTimeout(800);
    const got = await shown(); assert.ok(got.kept >= 1 && got.kept <= fuelAll, `lọc dầu theo biển số: ${got.kept}/${fuelAll}`); assert.ok(fexp >= 1);
    assert.match(await page.locator('main').innerText(), new RegExp(`Xóa ${got.kept} dòng đang lọc`));
    await page.locator('[data-sf-reset]').first().click(); await page.waitForTimeout(500);
    assert.equal((await shown()).kept, fuelAll);
    assert.deepEqual(errors, [], `lỗi JS: ${errors.join(' | ')}`);
  } finally { await browser.close(); await srv.close(); }
});
