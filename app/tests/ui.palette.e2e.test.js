'use strict';
/** Bảng màu: ô chọn 4 bảng (Luxury · HAK Enterprise / Xanh ngọc / Trung tính / Vàng champagne), nhớ theo máy, nhãn không bị cắt, tương phản chữ/nền đạt WCAG AA. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');

const CHROME = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');
const SKINS = [['luxe', 'Luxury · HAK Enterprise'], ['classic', 'Xanh ngọc'], ['neutral', 'Trung tính'], ['champagne', 'Vàng champagne']];

/** Đo tương phản trong trình duyệt: gộp (composite) màu nền bán trong suốt của các lớp tổ tiên; nền chuyển sắc thì thử từng điểm màu (lấy trường hợp xấu nhất). */
const MEASURE = () => {
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const layers = (el) => { const chain = []; for (let e = el; e; e = e.parentElement) chain.unshift(e); return chain; };
  const backgrounds = (el) => {
    let cands = [{ r: 255, g: 255, b: 255, a: 1 }];
    for (const e of layers(el)) {
      const cs = getComputedStyle(e); const bc = parse(cs.backgroundColor); let ls = [];
      if (cs.backgroundImage && cs.backgroundImage !== 'none') ls = (cs.backgroundImage.match(/rgba?\([^)]+\)/g) || []).map(parse).filter(Boolean);
      else if (bc && bc.a > 0) ls = [bc];
      if (ls.length) cands = cands.flatMap((c) => ls.map((l) => over(l, c)));
    }
    return cands;
  };
  return (el) => {
    const cs = getComputedStyle(el); let fg = parse(cs.color); const op = Number(cs.opacity);
    const worst = backgrounds(el).map((bg) => { const f = over({ ...fg, a: fg.a * op }, bg); return ratio(f, bg); });
    return Math.min(...worst);
  };
};

async function relogin(page) {
  await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com'); await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026');
  await page.getByRole('button', { name: /Đăng nhập|Vào phần mềm/ }).click(); await page.getByLabel('Bảng màu giao diện').waitFor();
}

async function login(page, srv) {
  await page.goto(srv.url);
  await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
  await page.getByRole('button', { name: 'Tiếp' }).click();
  await page.locator('.unit-pick label', { hasText: 'HAKQN —' }).click();
  await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click();
  await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
  await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
  await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026'); await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
  await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
}

// Các cặp chữ/nền cần đạt >= 4.5:1 (chữ thường). [nhãn, bộ chọn]
const PAIRS = [
  ['thanh bên: mục thường', '.nav li button:not([aria-current])'],
  ['thanh bên: mục đang chọn', '.nav li button[aria-current="page"]'],
  ['thanh bên: nhãn nhóm', '.nav-group-h'],
  ['thanh bên: khối bản cài', '.install'],
  ['thanh bên: người dùng', '.side .me'],
  ['thanh bên: ô chọn bảng màu', '.skin-select'],
  ['thanh bên: nhãn "Bảng màu"', '.skin-pick > span'],
  ['thẻ: tiêu đề', '.card h2'],
  ['thẻ: chữ', '.card p, .card td, .card li'],
  ['nút phụ', '.btn:not(.primary):not(.pri):not(.danger):not([disabled])'],
  ['nút chính', '.btn.primary, .btn.pri'],
  ['bảng: đầu cột', 'table.t thead th'],
  ['bảng: ô dữ liệu', 'table.t tbody td'],
  ['thẻ trạng thái ok', '.tag.ok'], ['thẻ trạng thái warn', '.tag.warn'], ['thẻ trạng thái info', '.tag.info'], ['thẻ trạng thái mute', '.tag.mute'], ['thẻ trạng thái err', '.tag.err'],
  ['ô nhập', 'input:not([type=checkbox]):not([type=radio]):not([type=hidden])'],
  ['hộp thoại: tiêu đề', '.modal h2'], ['hộp thoại: nhãn ô', '.modal label'], ['hộp thoại: ô nhập', '.modal input:not([type=checkbox]):not([type=radio]):not([type=hidden])'],
  ['hộp thoại: nút chính', '.modal .foot .primary'],
  ['thông báo (toast) mặc định', '.toast.info'], ['thông báo ok', '.toast.ok'], ['thông báo lỗi', '.toast.err'],
];

test('Bảng màu: chọn từng bảng, lưu theo máy, nhãn đủ, không lỗi JS', { skip: !CHROME && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  try {
    await login(page, srv);
    const sel = page.getByLabel('Bảng màu giao diện');
    assert.equal(await sel.count(), 1);
    assert.equal(await page.locator('.skin-btn').count(), 0, 'nút chuyển tuần tự cũ đã được thay bằng ô chọn');
    assert.equal(await page.locator('.skin-pick > span').innerText(), 'Bảng màu');
    // mặc định luxe; đủ 4 mục đúng nhãn
    assert.equal(await page.evaluate(() => document.documentElement.dataset.skin), 'luxe');
    assert.deepEqual(await sel.locator('option').allInnerTexts(), SKINS.map((s) => s[1]));
    // ô chọn rộng đúng chân menu và chữ không bị cắt
    const box = await page.evaluate(() => { const s = document.querySelector('.skin-select'), side = document.querySelector('.side'); const cs = getComputedStyle(s); const w = s.getBoundingClientRect().width; const need = Math.max(...[...s.options].map((o) => { const c = document.createElement('span'); c.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.font}`; c.textContent = o.textContent; document.body.append(c); const x = c.getBoundingClientRect().width; c.remove(); return x; })) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 24; return { w, side: side.clientWidth, sw: s.scrollWidth, cw: s.clientWidth, need }; });
    assert.ok(box.w >= box.side - 40, `ô chọn phải rộng gần hết chân menu (${box.w}/${box.side})`);
    assert.ok(box.sw <= box.cw, 'chữ trong ô chọn bị cắt');
    assert.ok(box.need <= box.w, `nhãn dài nhất cần ${box.need}px nhưng ô chỉ rộng ${box.w}px`);

    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => { localStorage.setItem('dgvc.theme', t); window.DGVC.applyTheme(); }, theme);
      for (const [k, label] of SKINS) {
        await sel.selectOption(k);
        assert.equal(await page.evaluate(() => document.documentElement.dataset.skin), k, `chọn ${label}`);
        assert.equal(await page.evaluate(() => localStorage.getItem('dgvc.skin')), k);
        assert.equal(await page.evaluate(() => document.querySelector('.skin-select').selectedOptions[0].textContent), label);
        assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
      }
    }
    // lưu qua tải lại trang
    await page.evaluate(() => localStorage.setItem('dgvc.theme', 'auto'));
    await sel.selectOption('champagne');
    await page.reload(); await page.getByLabel('Tên đăng nhập').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.skin), 'champagne', 'bảng màu được áp ngay từ màn đăng nhập');
    await relogin(page);
    assert.equal(await page.getByLabel('Bảng màu giao diện').inputValue(), 'champagne');
    // khóa cũ 'luxe' / 'classic' đã lưu vẫn hợp lệ; giá trị lạ về luxe
    for (const k of ['luxe', 'classic']) {
      await page.evaluate((v) => localStorage.setItem('dgvc.skin', v), k); await page.reload(); await page.getByLabel('Tên đăng nhập').waitFor(); await relogin(page);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.skin), k);
      assert.equal(await page.getByLabel('Bảng màu giao diện').inputValue(), k);
    }
    await page.evaluate(() => localStorage.setItem('dgvc.skin', 'khong-co')); await page.reload(); await page.getByLabel('Tên đăng nhập').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.skin), 'luxe');
    await relogin(page);
    // nút Sáng/Tối/Tự động vẫn còn
    assert.equal(await page.locator('.theme-btn').count(), 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});

test('Bảng màu: tương phản chữ/nền >= 4.5:1 ở 4 bảng x sáng/tối', { skip: !CHROME && 'không có Chromium', timeout: 600000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const fails = []; const seen = new Set(); const table = [];
  const measure = async (tag) => {
    const res = await page.evaluate(([pairs, fnSrc]) => {
      const D = window.DGVC; const probe = D.h('div', { class: 'card', id: 'tag-probe' }, ['ok', 'warn', 'info', 'mute', 'err'].map((k) => D.tag(k, `Thẻ ${k}`))); document.querySelector('.main').prepend(probe);
      const m = (0, eval)(`(${fnSrc})`)(); const out = [];
      for (const [label, selector] of pairs) {
        const els = [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length && (e.textContent.trim() || e.value || e.placeholder)).slice(0, 12);
        if (!els.length) continue;
        const rs = els.map((e) => { const cs = getComputedStyle(e); if (e.matches('input,select') && !e.value && e.placeholder) return null; return m(e); }).filter((x) => x !== null);
        if (rs.length) out.push([label, Math.min(...rs)]);
      }
      probe.remove(); return out;
    }, [PAIRS, MEASURE.toString()]);
    for (const [label, r] of res) { seen.add(label); table.push(`${tag}\t${label}\t${r.toFixed(2)}`); if (r < 4.5 && !fails.some((f) => f.startsWith(`${tag} · ${label}:`))) fails.push(`${tag} · ${label}: ${r.toFixed(2)}`); }
  };
  try {
    await login(page, srv);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => { localStorage.setItem('dgvc.theme', t); window.DGVC.applyTheme(); }, theme);
      for (const [k] of SKINS) {
        await page.evaluate((s) => { localStorage.setItem('dgvc.skin', s); window.DGVC.applyTheme(); }, k);
        const tag = `${k}/${theme}`;
        for (const nav of ['Tổng quan', 'Phiếu cân', 'DM Đơn giá']) { await page.locator('nav button', { hasText: nav }).first().click(); await page.waitForTimeout(500); await measure(tag); }
        // hộp thoại + thông báo
        await page.evaluate(() => { const D = window.DGVC; const b = D.h('div', {}, D.h('label', {}, 'Tên mẫu', D.h('input', { value: 'Giá trị mẫu' })), D.h('p', {}, 'Nội dung hộp thoại mẫu.')); D.modal({ title: 'Hộp thoại mẫu', body: b, actions: [{ label: 'Đóng', run: () => true }, { label: 'Lưu', primary: true, run: () => true }] }); D.toast('Thông báo mặc định', 'info', 60000); D.toast('Đã lưu xong', 'ok', 60000); D.toast('Có lỗi mẫu', 'err', 60000); });
        await page.waitForTimeout(200); await measure(tag);
        await page.evaluate(() => { document.querySelectorAll('.overlay,.toast').forEach((e) => e.remove()); });
      }
    }
    fs.writeFileSync(path.join(srv.home, 'contrast.tsv'), table.join('\n'));
    if (process.env.PALETTE_TABLE) fs.writeFileSync(process.env.PALETTE_TABLE, table.join('\n'));
    for (const [label] of PAIRS) assert.ok(seen.has(label), `không đo được cặp: ${label}`);
    assert.deepEqual(fails, [], `Cặp chữ/nền dưới 4.5:1:\n${fails.join('\n')}`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
