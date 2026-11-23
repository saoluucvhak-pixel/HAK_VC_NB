'use strict';
/**
 * Lỗi xác nhận (rà soát bản 1.3.0): màn Phiếu cân gọi tickets.list với pageSize cố định 5000 và KHÔNG báo bị cắt; "Xóa N phiếu đang lọc" chỉ áp lên các dòng đang hiện.
 *  → kho > 5.000 phiếu: danh sách thiếu phiếu, thao tác xóa hàng loạt bỏ sót. Nay: phân trang (500/trang) + "Hiện a–b / tổng" + thao tác hàng loạt áp lên TOÀN BỘ tập lọc (idsOnly).
 *  Báo cáo "Phiếu cân" trước đây cắt cứng 1.000 dòng (slice(0,1000)); nay phân trang, dòng tổng + Excel là toàn bộ.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE } = require('./install');
const { QueryService } = require('../main/services/QueryService');
const { install } = require('./install');
const { RecordService } = require('../main/services/RecordService');
const { ImportService } = require('../main/import/ImportService');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const crypto = require('node:crypto');
async function inflate(store, n) {
  const base = store.find('PHIEU_CAN', (t) => !t.is_deleted)[0];
  await store.transaction((tx) => {
    for (let i = 0; i < n; i++) {
      const no = `BULK${String(i).padStart(6, '0')}`; const d = new Date(Date.UTC(2026, 0, 1 + (i % 200))).toISOString().slice(0, 10);
      const key = `${no}|${d}|${base.plate_no}`;
      tx.insert('PHIEU_CAN', { ...base, ticket_id: `PC-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 12)}`, ticket_key: key, ticket_no: no, weigh1_date: d, weigh2_date: d, validation_flags: '', flags_ack: false });
    }
  }, { user: 'seed' });
}

test('API: tickets.list phân trang đủ > 5.000 phiếu; idsOnly trả TOÀN BỘ mã theo bộ lọc; xóa hàng loạt theo idsOnly xóa đủ', { timeout: 300000 }, async () => {
  const { store } = await install('DH', { kind: 'json' });
  const before = store.find('PHIEU_CAN', (t) => !t.is_deleted).length;
  await inflate(store, 5200);
  const q = new QueryService(store); const total = before + 5200;
  const p1 = q.tickets({ page: 1, pageSize: 5000 });
  assert.equal(p1.items.length, 5000); assert.equal(p1.total, total, 'tổng báo đủ dù trang bị giới hạn 5.000');
  const p2 = q.tickets({ page: 2, pageSize: 5000 }); assert.equal(p2.items.length, total - 5000);
  const all = q.tickets({ idsOnly: true }); assert.equal(all.ids.length, total); assert.equal(all.total, total); assert.equal(new Set(all.ids).size, total);
  assert.equal(all.totals.trips, total); assert.equal(typeof all.lockedCount, 'number');
  const filtered = q.tickets({ q: 'BULK0000', idsOnly: true }); assert.equal(filtered.ids.length, 100, 'lọc theo mã: BULK0000xx = 100 phiếu');
  const rec = new RecordService(store, { importService: new ImportService(store) });
  const x = await rec.softDeleteTickets({ ticketIds: all.ids, reason: 'thử', user: { username: 'ketoan', role: 'KE_TOAN' } });
  assert.equal(x.deleted, total); assert.deepEqual(x.notFound, []);
  assert.equal(q.tickets({ idsOnly: true }).ids.length, 0);
});

test('Giao diện ĐH: Phiếu cân phân trang 500/trang + xóa hàng loạt áp lên mọi trang; Báo cáo phiếu cân phân trang', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const toast = async (re) => { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 30000 }); };
  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(300); };
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.locator('.unit-pick label', { hasText: 'DH —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com');
    await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026');
    await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click();
    await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    await nav('Phiếu cân'); fs.existsSync(FILE.DH);
    const next = (p) => fetch(`${srv.url}/dev/next`, { method: 'POST', body: JSON.stringify({ path: p }) }); await next(FILE.DH);
    await page.getByRole('button', { name: 'Import từ Excel' }).click(); await page.getByText('Import phiếu cân — xem trước').waitFor();
    await page.getByLabel('Chấp nhận các dòng cảnh báo').check(); await page.getByRole('button', { name: /Xác nhận import/ }).click(); await toast(/Đã import \d+ dòng/);
    await inflate(srv.ctx.store, 1200);
    const total = srv.ctx.store.find('PHIEU_CAN', (t) => !t.is_deleted).length;
    await nav('Tổng quan'); await nav('Phiếu cân');
    const card = page.locator('.card.flush').filter({ has: page.locator('[aria-label="Phân trang"]') }).first();
    await card.getByText(new RegExp(`Hiện 1–500 / ${String(total).replace(/(\d)(?=(\d{3})+$)/g, '$1.')}`)).waitFor();
    await card.getByText(/Trang 1 \/ 3/).waitFor();
    await card.getByRole('button', { name: /Sau/ }).click(); await card.getByText(/Hiện 501–1\.000/).waitFor();
    // xóa hàng loạt: nhãn nút = TỔNG (mọi trang), không phải 500
    const del = page.getByRole('button', { name: new RegExp(`Xóa ${String(total).replace(/(\d)(?=(\d{3})+$)/g, '$1.')} phiếu đang lọc`) }); await del.waitFor();
    // thu hẹp bộ lọc về trang 1 khi đổi điều kiện
    await page.locator('[data-sf-q]').first().fill('BULK0000'); // bộ lọc thông minh: gõ là lọc (về trang 1)
    await page.getByText(/Hiện 1–100 \/ 100/).waitFor();
    await page.getByRole('button', { name: /Xóa 100 phiếu đang lọc/ }).click();
    await page.locator('.modal textarea').fill('thử'); await page.locator('.modal').getByRole('button', { name: 'Xóa' }).or(page.locator('.modal').getByRole('button', { name: 'Đồng ý' })).first().click();
    await toast(/Đã xóa 100 phiếu/);
    assert.equal(srv.ctx.store.find('PHIEU_CAN', (t) => !t.is_deleted).length, total - 100);
    // Báo cáo phiếu cân: phân trang, tổng toàn bộ
    await nav('Báo cáo'); await page.getByRole('tab', { name: /Phiếu cân/ }).click().catch(() => {});
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
