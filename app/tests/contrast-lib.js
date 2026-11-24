'use strict';
/**
 * Bộ đo tương phản dùng chung (không phải test): quét MỌI phần tử có chữ trên trang đang mở, ứng viên dưới ngưỡng được kiểm lại
 * bằng ĐIỂM ẢNH THẬT (ẩn chữ, chụp vùng chữ, đo với màu chữ) vì nền chuyển sắc / bán trong suốt làm công thức tính sai.
 * Dùng bởi ui.contrast-scan.e2e.test.js.
 */
const SKINS = ['luxe', 'classic', 'neutral', 'champagne'];
const STYLE = '*,*::before,*::after{animation:none!important;transition:none!important}[data-cv],[data-cv]::placeholder{color:transparent!important;text-shadow:none!important;-webkit-text-fill-color:transparent!important}';

const SCAN = () => {
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const chain = (el) => { const c = []; for (let e = el; e; e = e.parentElement) c.unshift(e); return c; };
  const backgrounds = (el) => {
    let cands = [{ r: 255, g: 255, b: 255, a: 1 }];
    for (const e of chain(el)) {
      const cs = getComputedStyle(e); const bc = parse(cs.backgroundColor); let ls = [];
      if (cs.backgroundImage && cs.backgroundImage !== 'none') ls = (cs.backgroundImage.match(/rgba?\([^)]+\)/g) || []).map(parse).filter(Boolean);
      else if (bc && bc.a > 0) ls = [bc];
      if (ls.length) cands = cands.flatMap((c) => ls.map((l) => over(l, c)));
    }
    return cands;
  };
  const label = (el) => { const id = el.id ? `#${el.id}` : ''; const cls = (el.className && el.className.toString().trim().split(/\s+/).slice(0, 2).join('.')) || ''; return `${el.tagName.toLowerCase()}${id}${cls ? `.${cls}` : ''}`; };
  const all = [...document.querySelectorAll('body *')]; const out = [];
  all.forEach((el, idx) => {
    if (['SCRIPT', 'STYLE', 'SVG', 'PATH', 'OPTION'].includes(el.tagName.toUpperCase())) return;
    let text = ''; for (const n of el.childNodes) if (n.nodeType === 3) text += n.textContent; text = text.trim();
    const isField = el.matches('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea');
    const ph = isField && !el.value && el.placeholder ? el.placeholder : '';
    const sel = el.tagName === 'SELECT' ? (el.selectedOptions[0] ? el.selectedOptions[0].textContent.trim() : '') : '';
    const sample = text || ph || sel || (isField && el.value) || ''; if (!sample) return;
    const cs = getComputedStyle(el);
    if (!el.getClientRects().length || cs.visibility === 'hidden' || el.closest('[hidden],[inert]')) return;
    const topOverlay = [...document.querySelectorAll('.overlay')].pop(); if (topOverlay && !topOverlay.contains(el) && !el.closest('.toasts')) return; // chữ nằm dưới lớp phủ của hộp thoại đang mở: người dùng không thấy / không thao tác được
    if (el.disabled || el.closest(':disabled,[aria-disabled=true]')) return; // chữ của điều khiển vô hiệu hóa được miễn (WCAG 1.4.3)
    let op = 1; for (const e of chain(el)) op *= Number(getComputedStyle(e).opacity); if (op === 0) return;
    const fgStr = ph ? getComputedStyle(el, '::placeholder').color : cs.color; const fg = parse(fgStr); if (!fg) return;
    const worst = Math.min(...backgrounds(el).map((bg) => { const f = over({ ...fg, a: fg.a * op }, bg); return ratio(f, bg); }));
    const px = parseFloat(cs.fontSize); const large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700); const need = large ? 3 : 4.5;
    if (worst < need) out.push({ idx, ph: !!ph, fg: fgStr, op, el: label(el), text: sample.slice(0, 40), calc: Number(worst.toFixed(2)), need });
  });
  return out;
};

const VERIFY_PREP = ([idx, ph]) => {
  const el = document.querySelectorAll('body *')[idx]; if (!el) return null;
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
  let rects = [];
  if (ph || el.matches('input,textarea,select')) {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); const pl = parseFloat(cs.paddingLeft); const pr = parseFloat(cs.paddingRight); const pt = parseFloat(cs.paddingTop); const pb = parseFloat(cs.paddingBottom);
    rects = [{ x: r.x + pl + 1, y: r.y + pt + 1, width: Math.max(4, r.width - pl - pr - 2), height: Math.max(4, r.height - pt - pb - 2) }];
  } else { for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { const rg = document.createRange(); rg.selectNodeContents(n); for (const r of rg.getClientRects()) if (r.width > 1 && r.height > 1) rects.push({ x: r.x, y: r.y, width: r.width, height: r.height }); } }
  if (!rects.length) return null;
  el.setAttribute('data-cv', '1'); return rects[0];
};
const PIXEL = ([b64, fg, op]) => new Promise((resolve) => {
  const img = new Image(); img.onload = () => {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data;
    const m = fg.match(/rgba?\(([^)]+)\)/); const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); const fa = (p.length > 3 ? p[3] : 1) * op;
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = (r, gg, bb) => 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(bb);
    let worst = 99; const step = Math.max(1, Math.floor(d.length / 4 / 1500));
    for (let i = 0; i < d.length; i += 4 * step) {
      const r = d[i]; const gg = d[i + 1]; const bb = d[i + 2]; const a = L(p[0] * fa + r * (1 - fa), p[1] * fa + gg * (1 - fa), p[2] * fa + bb * (1 - fa)); const b = L(r, gg, bb);
      const ra = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); if (ra < worst) worst = ra;
    }
    resolve(worst);
  }; img.src = `data:image/png;base64,${b64}`;
});


/** Đo trang đang mở. Trả về danh sách chuỗi mô tả chữ dưới ngưỡng (rỗng = đạt). Tắt hiệu ứng trước (fade làm độ mờ chưa về 1 → đo sai). */
async function measure(page, tag, vp = { width: 1366, height: 768 }) {
  if (!(await page.evaluate(() => !!document.querySelector('style[data-cv-style]')))) await page.addStyleTag({ content: STYLE }).then((h) => h.evaluate((e) => e.setAttribute('data-cv-style', '1')));
  const cands = await page.evaluate(`(${SCAN.toString()})()`); const fails = [];
  for (const c of cands.slice(0, 60)) {
    const r = await page.evaluate(`(${VERIFY_PREP.toString()})(${JSON.stringify([c.idx, c.ph])})`); if (!r) continue;
    const x = Math.max(0, Math.floor(r.x)); const y = Math.max(0, Math.floor(r.y));
    const png = await page.screenshot({ clip: { x, y, width: Math.max(2, Math.min(Math.ceil(r.width), vp.width - x)), height: Math.max(2, Math.min(Math.ceil(r.height), vp.height - y)) } }).catch(() => null);
    await page.evaluate((i) => { const el = document.querySelectorAll('body *')[i]; if (el) el.removeAttribute('data-cv'); }, c.idx);
    if (!png) continue;
    const truth = await page.evaluate(`(${PIXEL.toString()})(${JSON.stringify([png.toString('base64'), c.fg, c.op])})`);
    if (truth < c.need) fails.push(`${tag} · ${c.el} “${c.text}” = ${truth.toFixed(2)} (cần ${c.need})`);
  }
  return fails;
}
module.exports = { SKINS, measure };
