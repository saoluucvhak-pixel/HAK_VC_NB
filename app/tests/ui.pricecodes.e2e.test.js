'use strict';
/** Giao diện: màn "Mã đơn giá" (cha–con): tạo mã → thêm dòng giá cố định → áp dụng → gán hợp đồng (cả từ màn Hợp đồng) → kỳ tính dùng giá cố định; màn Đơn giá cũ không đổi. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE, KETOAN, rid } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

test('Giao diện HAKQN: Mã đơn giá — tạo mã, thêm dòng cố định, áp dụng, gán hợp đồng; chọn đơn giá có sẵn; hợp đồng chọn mã', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const toast = async (re) => { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 30000 }); };
  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(500); };
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
    const ctx = srv.ctx; const contractId = 'HD-HAKQN-QS'; const ct = () => ctx.store.get('HOP_DONG', contractId); const unit = ct().customer_unit_code;
    const imp = ctx.svc.import; const a = await imp.preview({ importType: 'PHIEU_CAN', filePath: FILE.HAKQN, user: 'k' }); await imp.confirm({ batchId: a.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'k' });

    // màn Đơn giá CŨ vẫn như cũ (không lẫn dòng của mã)
    await nav('Đơn giá'); await page.getByRole('heading', { name: 'Đơn giá' }).first().waitFor();
    // màn Mã đơn giá
    await nav('Mã đơn giá'); await page.getByRole('heading', { name: 'Mã đơn giá' }).first().waitFor();
    const tree = page.locator('.pc-tree'); await tree.getByText('Chưa có mã đơn giá nào').waitFor();
    await tree.getByRole('heading', { name: 'Đơn giá cố định' }).waitFor(); await tree.getByRole('heading', { name: 'Đơn giá theo giá dầu' }).waitFor();
    await tree.getByRole('button', { name: '+ Mã đơn giá cố định' }).click();
    const m = page.locator('.modal', { hasText: 'Tạo mã đơn giá' }); await m.getByLabel(/Đơn vị/).selectOption(unit);
    // B7: hai thẻ hình thức là radio — đã chọn sẵn thẻ cố định; bàn phím (mũi tên) đổi thẻ; có tên truy cập
    const rCD = m.getByRole('radio', { name: /Đơn giá cố định/ }); const rTD = m.getByRole('radio', { name: /Đơn giá theo giá dầu/ });
    assert.equal(await rCD.isChecked(), true); await rCD.focus(); await page.keyboard.press('ArrowDown'); assert.equal(await rTD.isChecked(), true);
    await page.keyboard.press('ArrowUp'); assert.equal(await rCD.isChecked(), true);
    await m.getByLabel(/Mã đơn giá/).fill('DG-UI-01'); await m.getByLabel(/Tên mã đơn giá/).fill('Giá cố định thử UI'); await m.getByRole('button', { name: 'Lưu' }).click(); await toast(/Đã tạo mã DG-UI-01/);
    await page.locator('.pc-tree').getByRole('button', { name: /DG-UI-01/ }).waitFor();
    // thêm dòng giá cố định
    await page.locator('.pc-detail').getByRole('button', { name: 'Thêm dòng giá cố định' }).click();
    const lm = page.locator('.modal', { hasText: 'Thêm dòng giá cố định vào mã DG-UI-01' });
    await lm.getByRole('combobox', { name: /^Tuyến/ }).selectOption('VC.007'); await lm.getByLabel(/Đơn giá cố định/).fill('150.000'); // gõ dấu chấm ngăn cách nghìn kiểu Việt
    await lm.getByLabel(/Ngày cập nhật/).fill('2026-01-01'); await lm.getByRole('button', { name: 'Lưu' }).click();
    await toast(/Đã thêm dòng giá/); const row = page.locator('.pc-detail tbody tr', { hasText: 'VC.007' }); await row.getByText('Nháp').waitFor();
    await row.getByRole('button', { name: 'Áp dụng' }).click(); await toast(/Đã áp dụng/); await page.locator('.pc-detail tbody tr', { hasText: 'VC.007' }).getByText('Đang dùng').waitFor();
    // gán cho hợp đồng từ màn Mã đơn giá
    await page.locator('.pc-detail').getByRole('button', { name: 'Gán cho hợp đồng…' }).click();
    const am = page.locator('.modal', { hasText: 'Gán mã DG-UI-01 cho hợp đồng' }); await am.getByLabel('Hợp đồng').selectOption(contractId); await am.getByRole('button', { name: 'Gán mã' }).click(); await toast(/Đã gán mã DG-UI-01/);
    assert.equal(ct().price_code, 'DG-UI-01'); await page.locator('.pc-detail').getByText(/HAKQN-QS/).first().waitFor();
    // kỳ tính dùng giá cố định của mã (tuyến cố định không nhận dầu → không có dầu trong kỳ)
    const k = await ctx.svc.periods.calculate({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24', clientRequestId: rid(), user: KETOAN });
    assert.equal(k.results[0].transportPrice, 150000); assert.equal(k.results[0].priceMethod, 'CO_DINH');
    const otherUnit = ctx.store.all('DON_VI').find((u) => u.unit_code !== unit && u.unit_code !== ct().carrier_unit_code && u.unit_code !== ctx.store.unitCode);
    await ctx.svc.catalog.savePriceCode({ create: true, record: { priceCode: 'DG-KHAC-DT', unitCode: otherUnit.unit_code, priceName: 'Mã đối tác khác' }, user: KETOAN });
    // P5/Task 5/B1: màn Hợp đồng chỉ XEM mã đơn giá + nguồn giá từng tuyến; không còn ô sửa mã; lưu hợp đồng không đụng mã; đổi/bỏ mã ở Mã đơn giá
    const pickCt = async (tabName) => { await nav('Hợp đồng vận chuyển'); await page.locator('.ct-items button', { hasText: 'HAKQN-QS' }).first().click(); const d = page.locator('.ct-detail', { hasText: 'Hợp đồng HAKQN-QS' }); await d.waitFor(); if (tabName) await d.getByRole('tab', { name: tabName }).click(); return d; };
    let cm = await pickCt('Mã đơn giá'); // 1.8.x: màn Hợp đồng cha–con, thẻ Mã đơn giá (chỉ xem)
    assert.equal(await cm.getByLabel('Mã đơn giá áp dụng').count(), 0, 'không còn ô chọn mã ở màn Hợp đồng');
    await cm.getByText('DG-UI-01 — Đơn giá cố định').waitFor();
    await cm.locator('tr', { hasText: 'VC.007' }).getByText(/theo mã DG-UI-01 \(đơn giá cố định\)/).waitFor();
    await cm.locator('tr', { hasText: 'VC.009' }).getByText(/dùng giá chung \(cách cũ\)/).waitFor();
    await cm.getByText(/Mã đơn giá của đối tác/).waitFor(); assert.equal(await cm.getByText('DG-KHAC-DT').count(), 0, 'không thấy mã của đối tác khác');
    await cm.getByRole('tab', { name: 'Thông tin' }).click(); await cm.getByLabel('Ghi chú').fill('sửa ghi chú — không đụng mã giá'); await cm.getByRole('button', { name: 'Lưu hợp đồng' }).click(); await toast(/Đã lưu hợp đồng/);
    assert.equal(ct().price_code, 'DG-UI-01', 'lưu hợp đồng không làm mất mã đơn giá');
    cm = await pickCt('Mã đơn giá'); await cm.getByRole('button', { name: 'Đổi ở Mã đơn giá →' }).click();
    await page.locator('.pc-detail').getByText(/DG-UI-01/).first().waitFor();
    await page.locator('.pc-detail').getByRole('button', { name: /Bỏ mã khỏi hợp đồng HAKQN-QS/ }).click(); await page.locator('.modal').getByRole('button', { name: 'Đồng ý' }).click(); await toast(/Đã bỏ mã khỏi hợp đồng/);
    assert.equal(ct().price_code || '', '');
    // mã THEO GIÁ DẦU: tạo bằng thẻ thứ hai, dòng giá có "Đơn giá ký hợp đồng", giá dầu, định mức, tải trọng; cự ly chỉ hiển thị
    await nav('Mã đơn giá'); await page.locator('.pc-tree').getByRole('button', { name: '+ Mã đơn giá theo giá dầu' }).click();
    const m2 = page.locator('.modal', { hasText: 'Tạo mã đơn giá' }); assert.equal(await m2.getByRole('radio', { name: /Đơn giá theo giá dầu/ }).isChecked(), true); await m2.getByLabel(/Đơn vị/).selectOption(unit);
    await m2.getByLabel(/Mã đơn giá/).fill('DG-UI-02'); await m2.getByLabel(/Tên mã đơn giá/).fill('Giá theo dầu thử UI'); await m2.getByRole('button', { name: 'Lưu' }).click(); await toast(/Đã tạo mã DG-UI-02/);
    await page.locator('.pc-detail').getByRole('button', { name: 'Thêm dòng giá cố định' }).waitFor({ state: 'detached' });
    await page.locator('.pc-detail').getByRole('button', { name: 'Thêm dòng giá theo giá dầu' }).click();
    const tm = page.locator('.modal', { hasText: 'Thêm dòng giá theo giá dầu vào mã DG-UI-02' });
    await tm.getByRole('combobox', { name: /^Tuyến/ }).selectOption('VC.007'); assert.equal(await tm.getByLabel(/Cự ly chuyến/).inputValue(), '144'); assert.equal(await tm.getByLabel(/Cự ly chuyến/).getAttribute('readonly') !== null, true);
    // B8: cảnh báo sớm, trước khi lưu — chưa nhập đơn giá/định mức → báo ngay
    await tm.getByLabel(/ĐG dầu chưa VAT/).fill('15.500'); await tm.locator('[role=status]').getByText(/phải > 0/).first().waitFor();
    await tm.getByLabel(/Đơn giá ký hợp đồng/).fill('165.000'); await tm.getByLabel(/Định mức dầu/).fill('0.4'); await tm.getByLabel(/KL trung bình/).fill('18');
    await tm.getByLabel(/Ngày cập nhật/).fill('2026-01-01'); await tm.locator('[role=status]').getByText(/Xem trước/).waitFor(); await tm.getByRole('button', { name: 'Lưu' }).click(); await toast(/Đã thêm dòng giá/);
    await page.locator('.pc-detail tbody tr', { hasText: 'VC.007' }).getByRole('button', { name: 'Áp dụng' }).click(); await toast(/Đã áp dụng/);
    // chọn đơn giá CÓ SẴN đưa vào mã (mã theo giá dầu chỉ liệt kê giá theo giá dầu)
    await nav('Mã đơn giá'); await page.locator('.pc-tree').getByRole('button', { name: /DG-UI-02/ }).click();
    await page.locator('.pc-detail').getByRole('button', { name: 'Chọn đơn giá có sẵn…' }).click();
    const pm = page.locator('.modal', { hasText: 'Chọn đơn giá có sẵn đưa vào mã DG-UI-02' }); await pm.locator('input[type=checkbox]').first().check(); await pm.locator('input[type=date]').fill('2027-01-01'); await pm.getByRole('button', { name: 'Đưa vào mã' }).click();
    await toast(/Đã đưa 1 dòng vào mã/);
    // B3: màn Đơn giá cũ có nhãn "cách cũ"
    await nav('Đơn giá'); await page.locator('main').getByText('Cách cũ').first().waitFor();
    // thuật ngữ: "Đơn giá ký hợp đồng"; không còn "Đơn giá hợp đồng" / "ĐG HĐ" ở các màn giá
    for (const label of ['Đơn giá', 'Mã đơn giá', 'Căn cứ giá hợp đồng']) {
      await nav(label); await page.waitForTimeout(400);
      const txt = await page.locator('main').innerText(); assert.ok(!/Đơn giá hợp đồng|ĐG HĐ/.test(txt), `màn ${label} còn nhãn cũ`);
    }
    await nav('Mã đơn giá'); await page.locator('.pc-tree').getByRole('button', { name: /DG-UI-02/ }).click(); await page.locator('.pc-detail').getByText(/ĐG ký HĐ|Đơn giá ký hợp đồng/).first().waitFor();
    for (const w of [1366, 910]) { await page.setViewportSize({ width: w, height: 800 }); const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); assert.ok(over <= 1, `tràn ngang ${over}px ở ${w}px`); if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, `pricecodes-${w}.png`) }); }
    // mã cũ lẫn 2 loại dòng (tạo ở bản cũ): nhóm "Hỗn hợp", cảnh báo, chặn thêm/sửa/áp dụng; bảng chọn cột theo từng dòng
    const L = (id, route, method) => ({ price_id: id, route_code: route, contract_id: '', price_code: 'DG-CU-HON', version_no: 1, effective_from: '2026-01-01', effective_to: '', status: 'DRAFT', is_used: false, price_method: method,
      fixed_price: method === 'CO_DINH' ? 150000 : '', new_price: method === 'CO_DINH' ? 0 : 165000, fuel_price_excl_vat: method === 'CO_DINH' ? 0 : 15500, fuel_norm_l_per_km: method === 'CO_DINH' ? 0 : 0.4, avg_load_ton: method === 'CO_DINH' ? 0 : 18, base_price_excl_vat: '', base_price_source: '', price_per_km: '', avg_volume_m3: '', source_note: '' });
    await ctx.store.transaction((tx) => { tx.insert('MA_DON_GIA', { price_code: 'DG-CU-HON', unit_code: unit, price_name: 'Mã cũ lẫn', status: 'ACTIVE', note: '' }); tx.insert('PRICE_HISTORY', L('PR-VC.007-DG-CU-HON-v1', 'VC.007', 'CO_DINH')); tx.insert('PRICE_HISTORY', L('PR-VC.002-DG-CU-HON-v1', 'VC.002', 'THEO_DAU')); }, { user: 'test' });
    await nav('Mã đơn giá'); await page.locator('.pc-tree').getByRole('heading', { name: /Hỗn hợp/ }).waitFor();
    await page.locator('.pc-tree').getByRole('button', { name: /DG-CU-HON/ }).click();
    await page.locator('.pc-detail').getByText(/tách thành 2 mã/).first().waitFor();
    assert.equal(await page.locator('.pc-detail').getByRole('button', { name: /Thêm dòng giá/ }).isDisabled(), true);
    assert.equal(await page.locator('.pc-detail tbody tr', { hasText: 'VC.007' }).getByRole('button', { name: 'Sửa' }).isDisabled(), true);
    assert.equal(await page.locator('.pc-detail tbody tr', { hasText: 'VC.002' }).getByRole('button', { name: 'Áp dụng' }).isDisabled(), true);
    await page.locator('.pc-detail').getByRole('columnheader', { name: /Đơn giá cố định/ }).waitFor(); await page.locator('.pc-detail').getByRole('columnheader', { name: /ĐG ký HĐ dự kiến/ }).waitFor();
    // B7: vai trò XEM không thấy nút tạo/sửa/áp dụng/gán
    const xem = await page.evaluate(() => window.DGVC.api('users.save', { record: { username: 'xem.qn', fullName: 'Người xem', role: 'XEM', unitCode: 'HAKQN' } })); // 1.6.1: nhận mã kích hoạt một lần
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await page.getByLabel('Tên đăng nhập').fill('xem.qn'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mã kích hoạt').fill(xem.setupCode);
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026'); await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    await nav('Mã đơn giá'); await page.locator('.pc-tree').getByRole('button', { name: /DG-UI-02/ }).click(); await page.locator('.pc-detail').getByText(/DG-UI-02/).first().waitFor();
    for (const name of [/^\+ Mã/, /Thêm dòng giá/, /Chọn đơn giá có sẵn/, /Gán cho hợp đồng/, /Sửa mã/, /Đóng mã/, /^Áp dụng$/]) assert.equal(await page.getByRole('button', { name }).count(), 0, `XEM không được thấy nút ${name}`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
