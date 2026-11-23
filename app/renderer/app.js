'use strict';
/* DGVC — lõi giao diện: gọi API, trạng thái, các thành phần dùng chung (bảng khai báo, form khai báo, modal, drawer, thông báo).
   Mọi dữ liệu đi qua 1 cửa: api(action, payload) → window.dgvc.api (Electron) hoặc POST /api (chạy thử trên trình duyệt). */
(function () {
  const D = (window.DGVC = window.DGVC || { views: {} });
  // append(null/false) của DOM in ra chữ "null" — bỏ qua các giá trị rỗng cho gọn code giao diện
  for (const proto of [Element.prototype, DocumentFragment.prototype]) {
    const orig = proto.append;
    proto.append = function (...kids) { return orig.apply(this, kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false)); };
  }
  const state = (D.state = { token: '', boot: null, view: 'dashboard', params: {} });

  // ───────── gọi API ─────────
  async function raw(action, payload) {
    if (window.dgvc && window.dgvc.api) return window.dgvc.api(action, payload || {}, state.token);
    const r = await fetch('/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, payload: payload || {}, token: state.token }) });
    return r.json();
  }
  // bản 1.2.5: dải báo "đang xem năm lưu trữ (chỉ xem)" — server trả meta.archiveMounted sau mỗi lệnh
  let archBanner = null;
  D.archiveBanner = (years) => {
    const ys = (years || []).slice().sort();
    if (!ys.length) { if (archBanner) { archBanner.remove(); archBanner = null; } return; }
    if (!archBanner) { archBanner = h('div', { class: 'archive-banner', role: 'status' }); document.body.append(archBanner); }
    if (archBanner.dataset.y === ys.join(',')) return;
    archBanner.dataset.y = ys.join(',');
    archBanner.innerHTML = '';
    archBanner.append(h('span', {}, `Đang xem dữ liệu năm lưu trữ ${ys.join(', ')} — chỉ xem, không sửa được. `),
      h('button', { class: 'btn small', onclick: async () => { if (D.canLeave && !(await D.canLeave())) return; await D.api('archive.unmount', {}); D.render && D.render(); } }, 'Thôi xem'));
  };
  D.api = async function api(action, payload, { quiet = false } = {}) {
    let res;
    try { res = await raw(action, payload); } catch (err) { throw ipcFailure(err, quiet); }
    if (!res || typeof res !== 'object' || typeof res.ok !== 'boolean') throw ipcFailure(new Error('phản hồi không hợp lệ'), quiet);
    if (res && res.meta && Array.isArray(res.meta.archiveMounted)) D.archiveBanner(res.meta.archiveMounted);
    if (!res.ok) {
      const e = Object.assign(new Error(res.error.message), res.error);
      if (e.code === 'SESSION_EXPIRED' && action !== 'auth.me') { state.token = ''; D.toast(e.message, 'err'); D.go('login'); }
      if (!quiet) D.toast(errorText(e), 'err');
      throw e;
    }
    for (const w of res.warnings || []) D.toast(w.message, w.level === 'WARNING' ? 'err' : 'info', 7000);
    return res.data;
  };
  // không liên lạc được với phần xử lý dữ liệu (IPC / mạng thử nghiệm hỏng): báo rõ thay vì im lặng
  function ipcFailure(err, quiet) {
    const e = Object.assign(new Error(`Không liên lạc được với phần xử lý dữ liệu (${(err && err.message) || err}). Thử tải lại phần mềm (Ctrl+R); nếu lỗi lặp lại, báo ADMIN kèm file nhật ký.`), { code: 'IPC_FAILED' });
    if (!quiet) D.toast(e.message, 'err', 9000);
    return e;
  }
  function errorText(e) {
    const d = e.details || {};
    const extra = Array.isArray(d.errors) ? '' : d.issues ? ` — ${d.issues.slice(0, 3).map((i) => i.message).join('; ')}` : '';
    return `${e.message}${extra}`;
  }
  D.errorText = errorText;
  // lỗi JavaScript ngoài ý muốn (trước đây im lặng, nút bấm không phản ứng): ghi về nhật ký + báo người dùng, tối đa 1 lần / 5 giây
  let lastCrashToast = 0;
  const clientFault = (what, err) => {
    const text = (err && (err.stack || err.message)) || String(err);
    try { if (window.dgvc && window.dgvc.logError) window.dgvc.logError(`${what}: ${text}`); } catch { /* không ghi được thì thôi */ }
    console.error(what, err);
    const now = Date.now();
    if (now - lastCrashToast > 5000 && D.toast) { lastCrashToast = now; D.toast(`Có lỗi không mong muốn: ${(err && err.message) || err}. Thử lại hoặc tải lại phần mềm (Ctrl+R); nếu lặp lại, báo ADMIN.`, 'err', 9000); }
  };
  window.addEventListener('error', (e) => { if (e.error || e.message) clientFault('error', e.error || e.message); });
  window.addEventListener('unhandledrejection', (e) => { const r = e.reason; if (r && typeof r.code === 'string') return; /* lỗi từ D.api: đã có thông báo riêng */ clientFault('unhandledrejection', r); });
  D.rid = () => `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // ───────── DOM + định dạng ─────────
  const h = (D.h = function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k === 'html') el.innerHTML = v;
      else if (k === 'onclick' && tag === 'button') { // rà soát 1.8.2: nút có xử lý bất đồng bộ → khóa tới khi xong (chống bấm đúp gửi 2 lệnh)
        el.addEventListener('click', (e) => {
          if (el.dataset.busy) { e.preventDefault(); e.stopImmediatePropagation(); return; }
          const was = el.disabled; // đọc TRƯỚC khi chạy handler: nhiều handler tự khóa nút (e.target.disabled = true) rồi tự mở lại trong finally
          const r = v(e);
          if (r && typeof r.then === 'function') { el.dataset.busy = '1'; el.disabled = true; el.setAttribute('aria-busy', 'true');
            Promise.resolve(r).catch(() => {}).finally(() => { delete el.dataset.busy; el.removeAttribute('aria-busy'); if (el.isConnected) el.disabled = was; }); }
        });
      }
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
  });
  const vnFmt = {};
  D.vn = (x, d = 0) => { // theo HAK_ACCOUNTING_REPORT_STANDARD: Intl vi-VN, dấu trừ '-', số lẻ cố định d
    if (x === '' || x === null || x === undefined || Number.isNaN(Number(x))) return '';
    return (vnFmt[d] = vnFmt[d] || new Intl.NumberFormat('vi-VN', { useGrouping: true, minimumFractionDigits: d, maximumFractionDigits: d })).format(Number(x));
  };
  D.vnAuto = (x) => (Number.isInteger(Number(x)) ? D.vn(x) : D.vn(x, 2));
  D.dmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
  D.dt = (s) => {
    if (!s) return '';
    if (/Z$/.test(s)) { const d = new Date(s); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; }
    return `${D.dmy(s.slice(0, 10))} ${s.slice(11, 16)}`; // giờ đã kèm múi giờ máy (+07:00)
  };
  const STATUS = { NHAP: ['Nháp', 'warn'], DA_XAC_NHAN: ['Đã xác nhận', 'ok'], DA_KHOA: ['Đã khóa', 'ok'], HUY: ['Đã hủy', 'mute'], DRAFT: ['Nháp', 'warn'],
    ACTIVE: ['Đang dùng', 'ok'], CLOSED: ['Đã đóng', 'mute'], OPEN: ['Chờ sửa', 'warn'], DONE: ['Đã xong', 'ok'], CONFIRMED: ['Đã xác nhận', 'ok'], LOCKED: ['Đã khóa', 'ok'],
    CARRIER: ['Bên vận chuyển', 'ok'], info: ['', 'info'], warn: ['', 'warn'], ok: ['', 'ok'], err: ['', 'err'], CUSTOMER: ['Bên thuê', 'info'], OTHER: ['Khác', 'mute'], IMPORTED: ['Nhận từ gói', 'info'], LOCAL: ['Tại bản cài', 'mute'] };
  D.tag = (code, text) => { const s = STATUS[code] || [code, 'mute']; return h('span', { class: `tag ${s[1]}` }, text || s[0]); };
  // ───────── giao diện sáng / tối & bảng màu (HAK Enterprise Design System: Luxury / Xanh ngọc / Trung tính / Vàng champagne) ─────────
  const THEMES = [['auto', 'Tự động'], ['light', 'Sáng'], ['dark', 'Tối']];
  const SKINS = [['luxe', 'Luxury · HAK Enterprise'], ['classic', 'Xanh ngọc'], ['neutral', 'Trung tính'], ['champagne', 'Vàng champagne']];
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  D.themePref = () => { try { const v = localStorage.getItem('dgvc.theme'); return THEMES.some(([k]) => k === v) ? v : 'auto'; } catch { return 'auto'; } };
  D.skinPref = () => { try { const v = localStorage.getItem('dgvc.skin'); return SKINS.some(([k]) => k === v) ? v : 'luxe'; } catch { return 'luxe'; } };
  D.applyTheme = () => {
    const p = D.themePref();
    document.documentElement.dataset.theme = p === 'auto' ? (mq && mq.matches ? 'dark' : 'light') : p;
    document.documentElement.dataset.skin = D.skinPref();
  };
  D.cycleTheme = () => { const i = THEMES.findIndex(([k]) => k === D.themePref()); try { localStorage.setItem('dgvc.theme', THEMES[(i + 1) % THEMES.length][0]); } catch { /* không lưu được */ } D.applyTheme(); };
  D.setSkin = (k) => { if (!SKINS.some(([x]) => x === k)) return; try { localStorage.setItem('dgvc.skin', k); } catch { /* không lưu được */ } D.applyTheme(); };
  D.cycleSkin = () => { const i = SKINS.findIndex(([k]) => k === D.skinPref()); try { localStorage.setItem('dgvc.skin', SKINS[(i + 1) % SKINS.length][0]); } catch { /* không lưu được */ } D.applyTheme(); };
  if (mq && mq.addEventListener) mq.addEventListener('change', D.applyTheme);
  D.applyTheme();
  D.today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  D.can = (...roles) => state.boot && roles.includes(state.boot.user.role);
  D.writer = () => D.can('ADMIN', 'KE_TOAN');

  // ───────── thông báo ─────────
  D.toast = (msg, kind = 'info', ms = 4000) => {
    let box = document.querySelector('.toasts'); if (!box) { box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
    if ([...box.children].some((c) => c.textContent === String(msg))) return; // cùng nội dung đang hiện (vd nhắc sửa giống nhà máy khác bị gọi 2 lần) → không hiện lặp
    const t = h('div', { class: `toast ${kind}` }, msg); box.append(t); setTimeout(() => t.remove(), ms);
    while (box.children.length > 3) box.firstChild.remove(); // tối đa 3 thông báo, không che nút
  };

  // ───────── modal, drawer, hộp xác nhận ─────────
  D.modal = ({ title, body, actions = [], wide = false, drawer = false, onClose }) => {
    const opener = document.activeElement; // trả focus về nơi mở hộp thoại khi đóng
    const close = () => { ov.remove(); document.removeEventListener('keydown', esc); document.removeEventListener('keydown', trap); if (opener && opener.isConnected && opener.focus) opener.focus(); if (onClose) onClose(); };
    // Tab / Shift+Tab xoay vòng TRONG hộp (aria-modal): không rò focus ra nền
    const trap = (e) => {
      if (e.key !== 'Tab' || !ov.isConnected || ov !== [...document.querySelectorAll('.overlay')].pop()) return;
      const f = [...box.querySelectorAll('button, [href], input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) { e.preventDefault(); return; }
      const a = document.activeElement; const i = f.indexOf(a);
      if (e.shiftKey && (i <= 0 || !box.contains(a))) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (i === f.length - 1 || !box.contains(a))) { e.preventDefault(); f[0].focus(); }
    };
    // đang nhập dở (đã gõ / chọn gì đó) → không đóng khi bấm ra ngoài; Esc thì hỏi lại để khỏi mất dữ liệu
    let dirty = false; let downOnOv = false;
    const askClose = () => { if (!dirty || window.confirm('Đóng cửa sổ? Dữ liệu đang nhập chưa lưu sẽ mất.')) close(); };
    const esc = (e) => { if (e.key === 'Escape' && ov.isConnected && ov === [...document.querySelectorAll('.overlay')].pop()) askClose(); };
    const box = h('div', { class: drawer ? 'drawer' : 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: wide ? { width: 'min(1100px, 96vw)' } : null },
      h('div', { class: 'row' }, h('h2', { style: { flex: 1, margin: 0 } }, title), h('button', { class: 'btn small', 'aria-label': 'Đóng', onclick: () => askClose() }, '✕')),
      h('div', { class: 'sep' }), body,
      actions.length ? h('div', { class: 'foot' }, actions.map((a) => h('button', { class: `btn ${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''}`, onclick: async (e) => {
        e.target.disabled = true; try { const r = await a.run(); if (r !== false) close(); } catch (err) { /* đã báo */ } finally { e.target.disabled = false; }
      } }, a.label))) : null);
    box.addEventListener('input', () => { dirty = true; }); box.addEventListener('change', () => { dirty = true; });
    // chỉ đóng khi BẤM HẲN vào nền tối (nhấn và nhả chuột đều ở nền) và chưa nhập gì — kéo bôi đen chữ ra ngoài khung không đóng
    const ov = h('div', { class: `overlay ${drawer ? 'drawer-ov' : ''}`, onmousedown: (e) => { downOnOv = e.target === ov; },
      onclick: (e) => { if (e.target === ov && downOnOv && !dirty) close(); downOnOv = false; } }, box);
    document.body.append(ov); document.addEventListener('keydown', esc); document.addEventListener('keydown', trap);
    const first = box.querySelector('input, select, textarea') || box.querySelector('.foot button.primary, .foot button, button'); if (first) first.focus();
    return { close, box };
  };
  D.confirm = ({ title, message, okLabel = 'Đồng ý', reason = false, danger = false }) => new Promise((resolve) => {
    const inp = reason ? h('textarea', { rows: 3, 'aria-label': 'Lý do' }) : null;
    let done = false;
    D.modal({ title, body: h('div', {}, h('p', { style: { whiteSpace: 'pre-line' } }, message), reason ? h('label', { class: 'field' }, h('span', {}, 'Lý do (bắt buộc)'), inp) : null),
      actions: [{ label: 'Hủy', run: () => { done = true; resolve(null); } }, { label: okLabel, primary: !danger, danger, run: () => {
        if (reason && !inp.value.trim()) { D.toast('Phải nhập lý do', 'err'); return false; }
        done = true; resolve(reason ? inp.value.trim() : true); return true;
      } }], onClose: () => { if (!done) resolve(null); } });
  });

  // ───────── form khai báo ─────────
  /** fields: [{key, label, type: text|number|date|select|textarea|check, options:[[v,t]], required, hint, full, readonly}] */
  /** Tiền (đ): "150.000" / "150 000" / "150000" → 150000; "150,5" → 150,5; chữ lạ → NaN (để máy chủ báo lỗi, không đoán). Rỗng → ''. */
  D.parseMoney = (v) => {
    const s = String(v ?? '').trim().replace(/\s/g, ''); if (!s) return '';
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
    if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.')); // 1.234,5
    if (/^\d+([.,]\d+)?$/.test(s)) return Number(s.replace(',', '.'));
    return NaN;
  };
  /** Màn hẹp (< 1280 px): ngăn xem chéo nằm DƯỚI bảng — sau khi chọn dòng thì cuộn tới ngăn để người dùng thấy ngay. */
  D.revealSide = (el) => { try { if (el && window.innerWidth < 1280 && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch { /* không cuộn được thì bỏ qua */ } };
  /** Ô chọn công ty từ Danh mục công ty & đối tác để điền nhanh vào ô tên (vd tên in trên chứng từ); vẫn sửa tay được. */
  const unitPicker = (inp) => {
    const units = (state.boot && state.boot.units) || [];
    const nameOf = (u) => u.doc_display_name || u.unit_name;
    const sel = h('select', { class: 'unit-pick-sel', 'aria-label': 'Chọn công ty từ danh mục' }, h('option', { value: '' }, '— hoặc chọn công ty từ danh mục —'), units.map((u) => h('option', { value: u.unit_code }, `${u.unit_code} · ${nameOf(u)}`)));
    sel.addEventListener('change', () => { const u = units.find((x) => x.unit_code === sel.value); if (u) { inp.value = nameOf(u); inp.dispatchEvent(new Event('input', { bubbles: true })); } sel.value = ''; });
    return sel;
  };
  /** Số hiển thị kiểu vi-VN, KHÔNG làm tròn (tối đa 6 số lẻ): 150000 → "150.000"; 0,4 → "0,4"; dùng cho ô nhập số của form. */
  const exactFmt = new Intl.NumberFormat('vi-VN', { useGrouping: true, minimumFractionDigits: 0, maximumFractionDigits: 6 });
  D.vnExact = (x) => (x === '' || x === null || x === undefined || Number.isNaN(Number(x)) ? '' : exactFmt.format(Number(x)));
  /** Đọc số kiểu vi-VN trong ô form: ',' là thập phân, '.' là ngăn nghìn khi đúng nhóm 3 chữ số (150.000), còn lại '.' là thập phân (0.4). Rỗng → ''; chữ lạ → NaN. */
  D.parseVn = (v, money = false) => {
    const s = String(v ?? '').trim().replace(/\s/g, ''); if (!s) return '';
    if (money && /^\d{1,3}(,\d{3})+$/.test(s)) return Number(s.replace(/,/g, '')); // ô tiền: ',' + đúng 3 chữ số = ngăn nghìn (150,000 → 150000), như D.parseMoney cũ; thập phân khi rõ ràng (1,5)
    if (/^\d+(\.\d{3})*(,\d+)?$/.test(s) && /^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
    if (/^\d+\.\d+$/.test(s)) return Number(s);
    return NaN;
  };
  /** Định dạng số đang gõ: nghìn '.', thập phân ','. Ô tiền: '.' luôn là ngăn nghìn. Ô số thập phân: '.' cuối nhóm không đủ 3 chữ số = dấu thập phân (gõ 0.4 → 0,4). */
  D.liveNumber = (s, decimal) => {
    s = String(s).replace(/[^\d.,]/g, ''); let ip; let fp = null;
    if (!decimal && /^\d{1,3}(,\d{3}){2,}$/.test(s)) s = s.replace(/,/g, ''); // ô tiền: dán 1,234,567 (kiểu en-US) = 1.234.567, không phải 1,234567
    const ci = s.indexOf(',');
    if (ci >= 0) { ip = s.slice(0, ci).replace(/\./g, ''); fp = s.slice(ci + 1).replace(/[.,]/g, ''); }
    else if (decimal && s.includes('.')) { const parts = s.split('.'); const last = parts[parts.length - 1]; if (parts.length === 2 && last.length !== 3) { ip = parts[0]; fp = last; } else ip = parts.join(''); }
    else ip = s.replace(/\./g, '');
    ip = ip.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    if (fp !== null && ip === '') ip = '0';
    return fp === null ? ip : `${ip},${fp}`;
  };
  const attachLiveNumber = (inp, decimal) => { inp.addEventListener('blur', () => { const n = D.parseVn(inp.value, !decimal); if (typeof n === 'number' && Number.isFinite(n)) inp.value = D.vnExact(n); }); inp.addEventListener('input', () => {
    const before = inp.value; const caret = inp.selectionStart == null ? before.length : inp.selectionStart;
    const sig = (before.slice(0, caret).match(/[\d,]/g) || []).length; const next = D.liveNumber(before, decimal);
    if (next === before) return;
    inp.value = next; let n = 0; let pos = next.length; if (caret >= before.length) pos = next.length; /* đang gõ ở cuối ô: con trỏ luôn ở cuối (gõ 0.4 → 0,4) */ else if (sig === 0) pos = 0; else for (let i = 0; i < next.length; i++) { if (/[\d,]/.test(next[i])) n++; if (n === sig) { pos = i + 1; break; } }
    try { inp.setSelectionRange(pos, pos); } catch { /* ô không hỗ trợ đặt con trỏ */ }
  }); };
  D.form = (fields, values = {}) => {
    const inputs = {};
    const el = h('div', { class: 'form' }, fields.map((f) => {
      let inp;
      if (f.type === 'select') inp = h('select', { disabled: f.readonly }, (typeof f.options === 'function' ? f.options() : f.options).map(([v, t]) => h('option', { value: v, selected: String(values[f.key] ?? '') === String(v) }, t)));
      else if (f.type === 'textarea') { inp = h('textarea', { rows: f.rows || 3, readonly: f.readonly }); inp.value = values[f.key] ?? ''; }
      else if (f.type === 'check') { inp = h('input', { type: 'checkbox', checked: !!values[f.key], disabled: f.readonly }); return h('label', { class: `check ${f.full ? 'field full' : ''}` }, inp, f.label); }
      else if (f.money || f.decimal) {
        inp = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', value: values[f.key] === '' || values[f.key] === undefined || values[f.key] === null ? '' : D.vnExact(values[f.key]), readonly: f.readonly, placeholder: f.placeholder || (f.money ? 'vd 150.000' : 'vd 12,5') });
        if (!f.readonly) attachLiveNumber(inp, !!f.decimal);
      }
      else inp = h('input', { type: f.type || 'text', value: values[f.key] ?? '', step: f.step || (f.type === 'number' ? 'any' : null), readonly: f.readonly, placeholder: f.placeholder || '' });
      inputs[f.key] = inp;
      return h('label', { class: `field ${f.full ? 'full' : ''}` }, h('span', {}, f.label + (f.required ? ' *' : '')), inp, f.unitPick && !f.readonly ? unitPicker(inp) : null, f.hint ? h('span', { class: 'hint' }, f.hint) : null);
    }).map((node, i) => { const f = fields[i]; if (f.type === 'check') inputs[f.key] = node.querySelector('input'); return node; }));
    el.values = () => Object.fromEntries(fields.map((f) => {
      const i = inputs[f.key]; if (f.type === 'check') return [f.key, i.checked];
      const v = i.value; if (f.money || f.decimal) return [f.key, D.parseVn(v, !!f.money)]; if (f.type === 'number') return [f.key, v === '' ? '' : Number(v)]; return [f.key, v];
    }));
    el.inputs = inputs;
    return el;
  };
  D.formModal = ({ title, fields, values, submit, wide }) => {
    const f = D.form(fields, values);
    D.modal({ title, body: f, wide, actions: [{ label: 'Hủy', run: () => true }, { label: 'Lưu', primary: true, run: async () => {
      const v = f.values(); const miss = fields.filter((x) => x.required && (v[x.key] === '' || v[x.key] === null)).map((x) => x.label);
      if (miss.length) { D.toast(`Chưa nhập: ${miss.join(', ')}`, 'err'); return false; }
      await submit(v); return true;
    } }] });
  };

  // ───────── bảng khai báo ─────────
  /** columns: [{key, label, fmt: int|money|dec1|dec2|date|datetime|tag, num, render(row), width}] */
  /** Chống phản hồi về sai thứ tự: mỗi lần tải gọi next() lấy số thứ tự; chỉ phản hồi của lần tải MỚI NHẤT (ok(số)) mới được vẽ — kết quả cũ không ghi đè bộ lọc mới. */
  D.latest = () => { let n = 0; return { next: () => ++n, ok: (t) => t === n }; };
  /** Thanh phân trang: "Hiện a–b / tổng" + Trước / Sau. goto(trang) do màn hình xử lý. */
  D.pager = ({ total, page, pageSize, goto }) => {
    const pages = Math.max(1, Math.ceil(total / pageSize)); const a = total ? (page - 1) * pageSize + 1 : 0; const b = Math.min(total, page * pageSize);
    return h('div', { class: 'row', style: { padding: '8px 14px', borderTop: '1px solid var(--line)', gap: '10px', alignItems: 'center' }, role: 'navigation', 'aria-label': 'Phân trang' },
      h('span', { class: 'small muted grow' }, `Hiện ${D.vn(a)}–${D.vn(b)} / ${D.vn(total)}`),
      pages > 1 ? h('button', { class: 'btn small', disabled: page <= 1, onclick: () => goto(page - 1) }, '‹ Trước') : null,
      pages > 1 ? h('span', { class: 'small' }, `Trang ${D.vn(page)} / ${D.vn(pages)}`) : null,
      pages > 1 ? h('button', { class: 'btn small', disabled: page >= pages, onclick: () => goto(page + 1) }, 'Sau ›') : null);
  };
  D.table = ({ columns, rows, footer, onRow, empty = 'Chưa có dữ liệu', maxHeight }) => {
    let sortKey = null; let asc = true;
    const body = h('tbody');
    const cell = (c, r) => {
      if (c.render) return c.render(r);
      const v = r[c.key];
      switch (c.fmt) {
        case 'int': case 'money': return D.vn(v); case 'dec1': return D.vn(v, 1); case 'dec2': return D.vn(v, 2); case 'auto': return D.vnAuto(v);
        case 'date': return D.dmy(v); case 'datetime': return D.dt(v); case 'tag': return v ? D.tag(v) : ''; case 'bool': return v ? '✔' : '';
        default: return v ?? '';
      }
    };
    const isNum = (c) => c.num || ['int', 'money', 'dec1', 'dec2', 'auto'].includes(c.fmt);
    const draw = () => {
      body.innerHTML = '';
      let rs = rows.slice();
      if (sortKey) rs.sort((a, b) => { const x = a[sortKey]; const y = b[sortKey]; return (x > y ? 1 : x < y ? -1 : 0) * (asc ? 1 : -1); });
      if (!rs.length) body.append(h('tr', {}, h('td', { colspan: columns.length, class: 'empty' }, empty)));
      for (const r of rs) {
        const tr = h('tr', { class: onRow ? 'click' : '', onclick: onRow ? () => onRow(r) : null }, columns.map((c) => h('td', { class: `${isNum(c) ? 'num' : ''} ${c.wrap ? 'wrap' : ''}` }, cell(c, r))));
        if (onRow) { tr.tabIndex = 0; tr.addEventListener('keydown', (e) => { if (e.target !== tr) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRow(r); } }); } // dòng bấm được cũng dùng được bằng bàn phím
        body.append(tr);
      }
    };
    const head = h('thead', {}, h('tr', {}, columns.map((c) => h('th', { class: `${isNum(c) ? 'num' : ''} ${c.render ? '' : 'sortable'}`, style: c.width ? { width: c.width } : null,
      onclick: c.render ? null : () => { asc = sortKey === c.key ? !asc : true; sortKey = c.key; draw(); } }, c.label))));
    const foot = footer ? h('tfoot', {}, h('tr', {}, columns.map((c) => h('td', { class: isNum(c) ? 'num' : '' }, footer[c.key] === undefined ? '' : (typeof footer[c.key] === 'number' ? (c.fmt === 'dec2' ? D.vn(footer[c.key], 2) : D.vnAuto(footer[c.key])) : footer[c.key]))))) : null;
    draw();
    return h('div', { class: 'tbl-wrap', style: maxHeight ? { maxHeight } : null }, h('table', { class: 't' }, head, body, foot));
  };

  const LV = { ERROR: ['err', 'Lỗi'], WARNING: ['warn', 'Cảnh báo'], INFO: ['info', 'Thông tin'] };
  D.issueList = (issues, actions) => (issues && issues.length ? h('ul', { class: 'issues' }, issues.map((i) => { const l = LV[i.level] || LV.INFO; const a = actions ? actions(i) : null; return h('li', {},
    h('span', { class: `tag ${l[0]}` }, l[1]), h('span', {}, i.message, a && a.length ? h('span', { class: 'btns', style: { marginTop: '6px' } }, a) : null), h('span', { class: 'mono small muted' }, i.code)); })) : h('p', { class: 'muted' }, 'Không có lỗi / cảnh báo.'));

  /** Chọn file qua hộp thoại Windows (Electron). Chạy thử trên trình duyệt: nhập đường dẫn. */
  D.pickFile = async ({ title = 'Chọn file', filters, save = false, defaultPath = '' } = {}) => {
    const r = await D.api(save ? 'dialog.saveFile' : 'dialog.openFile', { title, filters, defaultPath }, { quiet: true }).catch(() => ({ canceled: true }));
    if (r && r.path) return r.path;
    if (window.dgvc) return null;
    const p = window.prompt(`${title} — nhập đường dẫn đầy đủ:`, defaultPath); return p || null;
  };
  D.pickFolder = async (title = 'Chọn thư mục') => {
    const r = await D.api('dialog.openFolder', { title }, { quiet: true }).catch(() => ({ canceled: true }));
    if (r && r.path) return r.path; if (window.dgvc) return null;
    return window.prompt(`${title} — nhập đường dẫn:`) || null;
  };

  // ───────── điều hướng ─────────
  const NAV = [
    ['dashboard', '1', 'Tổng quan'], ['guide', '', 'Hướng dẫn & quy trình'], ['tickets', '2', 'Phiếu cân'], ['routes', '4', 'Danh mục tuyến'], ['contracts', '', 'Hợp đồng vận chuyển'],
    ['forms', '', 'Hình thức giá'], ['pricecodes', '5', 'Đơn giá'], ['basis', '', 'Báo cáo giá hợp đồng'], ['fuel', '3', 'Giao nhận dầu'], ['calc', '6', 'Tính giá vận chuyển'], ['bkvc', '7', 'Bảng xác nhận KL'], ['bkct', '8', 'Chi tiết vận chuyển'], ['validation', '', 'Kiểm tra dữ liệu'],
    ['reports', '9', 'Báo cáo'], ['rentreport', '', 'Báo cáo thuê vận chuyển'], ['exchange', '', 'Trao đổi dữ liệu'], ['reconcile', '', 'Đối chiếu dữ liệu'], ['sync', '', 'Nhắc sửa danh mục'], ['audit', '10', 'Lịch sử thao tác'], ['settings', '11', 'Cài đặt'],
    ['units', '', 'Công ty & đối tác'], ['vehicles', '', 'Xe vận chuyển'],
  ];
  // Menu nhóm: id màn và số phím tắt giữ nguyên. Thứ tự theo luồng làm việc: Danh mục → Nhập liệu (Phiếu cân, Giao nhận dầu) → Tính & chốt → Kết xuất → Đối tác.
  // Nhóm "Đối tác" = MỘT cổng Trao đổi dữ liệu (nhập / xuất / lịch sử gói .dgvc, .json) + Đối chiếu dữ liệu (kiểm tra nội bộ, 3 tiêu chí, các đợt đã nạp) + Nhắc sửa danh mục.
  // Màn cũ 'subcontract' (Nhập dữ liệu thuê VC) và 'export_partner' (Xuất dữ liệu VC gửi đối tác) đã gộp vào hai màn trên — vẫn gọi được qua D.go (bí danh, xem VIEW_ALIAS).
  const NAV_GROUPS = [['start', 'Bắt đầu', ['dashboard', 'guide']], ['master', 'Danh mục', ['units', 'vehicles', 'routes', 'contracts', 'forms', 'pricecodes']], ['input', 'Nhập liệu', ['tickets', 'fuel']],
    ['calc', 'Tính & chốt', ['calc', 'validation', 'bkvc', 'bkct']], ['out', 'Kết xuất', ['reports', 'basis']], ['xchg', 'Đối tác', ['rentreport', 'exchange', 'reconcile', 'sync']], ['sys', 'Hệ thống', ['audit', 'settings']]];
  /** Bí danh màn cũ → [màn mới, tham số]: D.go('subcontract') / D.go('export_partner') (phím tắt, liên kết, test cũ) vẫn mở đúng chỗ trong màn gộp. */
  const VIEW_ALIAS = {
    subcontract: (p) => ['reconcile', { ...p, tab: p.tab === 'list' ? 'batches' : 'compare' }],
    export_partner: (p) => ['exchange', { ...p, tab: p.tab === 'history' ? 'history' : 'export', kind: p.tab === 'tickets' ? 'PHIEU_CAN' : 'KY_TINH' }],
  };
  const navClosedGet = () => { try { const o = JSON.parse(localStorage.getItem('dgvc.navClosed') || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
  const navClosedSet = (o) => { try { localStorage.setItem('dgvc.navClosed', JSON.stringify(o)); } catch { /* không có localStorage: vẫn dùng được, chỉ không nhớ */ } };

  // D.leaveGuard: màn đang mở có thể đặt hàm () => true | Promise<bool> — rời màn khi còn thay đổi chưa lưu thì hỏi trước (vd Hợp đồng).
  // Không hỏi khi về đăng nhập / khởi tạo (hết phiên, đăng xuất). Mỗi lần chuyển màn thật thì gỡ guard; màn mới tự đặt lại nếu cần.
  D.leaveGuard = null;
  /** Hỏi guard của màn đang mở (nếu có) — dùng trước các thao tác dựng lại màn hiện tại không qua D.go (vd "Thôi xem" năm lưu trữ). */
  D.canLeave = async () => { const g = D.leaveGuard; if (!g) return true; const ok = await g(); if (ok) D.leaveGuard = null; return !!ok; };
  D.go = (view, params = {}) => {
    if (view === 'prices') view = 'pricecodes';
    if (VIEW_ALIAS[view]) [view, params] = VIEW_ALIAS[view](params || {});
    const g = D.leaveGuard; const go = () => { D.leaveGuard = null; state.view = view; state.params = params; render(); };
    // về đăng nhập / khởi tạo (hết phiên, đăng xuất): gỡ mọi hộp thoại còn mở — trước đây lớp phủ nằm đè lên màn đăng nhập (rà soát 1.8.2)
    if (['login', 'setup'].includes(view)) for (const ov of document.querySelectorAll('.overlay')) ov.remove();
    if (!g || ['login', 'setup'].includes(view)) { go(); return; }
    const ok = g(); if (ok === true) { go(); return; }
    Promise.resolve(ok).then((yes) => { if (yes) go(); });
  };

  /**
   * Bộ lọc dùng chung (mọi màn có nút Lọc / Xem): Enter trong ô gõ = bấm Lọc; hiện "N điều kiện đang lọc" + nút "Xóa lọc" (đưa về giá trị mặc định rồi lọc lại).
   * Gắn sau khi màn hình dựng xong — không cần sửa từng màn; mặc định = giá trị lúc dựng.
   */
  D.enhanceFilters = (root) => {
    for (const apply of root.querySelectorAll('.filters button.btn.primary')) {
      if (!/^(Lọc|Xem)$/.test(apply.textContent.trim()) || apply.dataset.enh) continue; apply.dataset.enh = '1';
      const bar = apply.closest('.filters') && apply.closest('.filters').parentElement; if (!bar) continue;
      const fields = [...bar.querySelectorAll('.filters input:not([type=hidden]):not([type=button]), .filters select')];
      if (!fields.length) continue;
      const val = (el) => (el.type === 'checkbox' ? String(el.checked) : el.value);
      const dflt = new Map(fields.map((el) => [el, val(el)]));
      const badge = h('span', { class: 'small muted', 'aria-live': 'polite' });
      const clear = h('button', { class: 'btn', type: 'button', onclick: () => {
        for (const [el, v] of dflt) { if (el.type === 'checkbox') el.checked = v === 'true'; else el.value = v; }
        refresh(); apply.click(); } }, 'Xóa lọc');
      const refresh = () => { const n = fields.filter((el) => val(el) !== dflt.get(el)).length; badge.textContent = n ? `${n} điều kiện đang lọc` : ''; clear.hidden = !n; };
      apply.after(clear, badge); refresh();
      bar.addEventListener('input', refresh); bar.addEventListener('change', refresh); apply.addEventListener('click', () => setTimeout(refresh, 0));
      bar.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.target.matches('.filters input:not([type=checkbox]):not([type=button])')) { e.preventDefault(); apply.click(); } });
    }
  };

  const renderGuard = D.latest();
  async function render() {
    const token = renderGuard.next();
    const view = state.view;
    const params = state.params;
    const root = document.getElementById('root');
    const previousMain = root.querySelector('main');
    if (previousMain) { previousMain.inert = true; previousMain.setAttribute('aria-busy', 'true'); }
    if (['setup', 'login'].includes(view)) {
      root.innerHTML = '';
      const page = await D.views[view].render(params);
      if (renderGuard.ok(token)) root.append(page);
      return;
    }
    if (!state.boot) { D.go('login'); return; }
    const b = state.boot; const main = h('main', { class: 'main', id: 'main', 'aria-busy': 'true' });
    const sync = await D.api('sync.list', {}, { quiet: true }).catch(() => ({ total: 0 }));
    if (!renderGuard.ok(token)) return;
    const rc = await D.api('reconcile.audit', {}, { quiet: true }).catch(() => ({ problems: 0 }));
    if (!renderGuard.ok(token)) return;
    const side = h('aside', { class: 'side' },
      h('div', { class: 'brand' }, h('div', { class: 'logo', 'aria-hidden': 'true' }, 'VC'), h('div', {}, 'Đơn giá vận chuyển', h('div', { class: 'sub' }, 'dăm gỗ · HAK Group'))),
      h('div', { class: 'install' }, h('b', {}, `Bản cài · ${b.install.unitCode}`), b.install.unitName),
      h('nav', { 'aria-label': 'Menu chính' }, h('ul', { class: 'nav' }, NAV_GROUPS.map(([gid, glabel, items]) => {
        const closed = navClosedGet(); const open = !closed[gid] || items.includes(view); // tự mở nhóm chứa màn hiện tại
        const ul = h('ul', { class: 'nav-items', id: `nav-g-${gid}` }, items.map((v) => { const [, n, tt] = NAV.find(([x]) => x === v); return h('li', {}, h('button', { 'aria-current': view === v ? 'page' : null, onclick: () => D.go(v), title: tt },
          h('span', { class: 'n' }, n), h('span', { class: 'nav-txt' }, tt), v === 'sync' && sync.total ? h('span', { class: 'badge', 'aria-label': `${sync.total} nhắc` }, sync.total) : null, v === 'reconcile' && rc.problems ? h('span', { class: 'badge', 'aria-label': `${rc.problems} vấn đề cần xử lý` }, rc.problems) : null)); }));
        ul.hidden = !open;
        const head = h('button', { class: 'nav-group-h', 'aria-expanded': String(open), 'aria-controls': `nav-g-${gid}`, onclick: () => {
          const now = ul.hidden; ul.hidden = !now; head.setAttribute('aria-expanded', String(now)); const o = navClosedGet(); if (now) delete o[gid]; else o[gid] = true; navClosedSet(o); } }, h('span', { class: 'chev', 'aria-hidden': 'true' }, '▾'), glabel);
        return h('li', { class: 'nav-group' }, head, ul);
      }))),
      h('div', { class: 'me' }, h('div', {}, b.user.fullName || b.user.username), h('div', {}, `${b.user.role} · dữ liệu: `, h('span', { class: 'mono' }, b.install.dataFolder)),
        h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' } },
          h('button', { class: 'theme-btn', 'aria-label': 'Đổi giao diện sáng/tối', onclick: (e) => { D.cycleTheme(); e.currentTarget.textContent = `Giao diện: ${THEMES.find(([k]) => k === D.themePref())[1]}`; } }, `Giao diện: ${THEMES.find(([k]) => k === D.themePref())[1]}`),
          h('button', { onclick: async () => { await D.api('auth.logout', {}, { quiet: true }).catch(() => {}); state.token = ''; state.boot = null; D.go('login'); } }, 'Đăng xuất')),
        h('label', { class: 'skin-pick' }, h('span', {}, 'Bảng màu'),
          h('select', { class: 'skin-select', 'aria-label': 'Bảng màu giao diện', onchange: (e) => { D.setSkin(e.currentTarget.value); } }, SKINS.map(([k, n]) => h('option', { value: k, selected: k === D.skinPref() }, n))))));
    root.innerHTML = ''; root.append(h('div', { class: 'app' }, side, main));
    const v = D.views[view];
    try {
      const page = await v.render(params);
      if (!renderGuard.ok(token)) return;
      main.append(page);
      D.enhanceFilters(main);
    } catch (error) {
      if (!renderGuard.ok(token)) return;
      main.append(h('div', { class: 'card' }, h('h2', {}, 'Không mở được màn hình'), h('p', {}, error.message)));
    } finally { main.removeAttribute('aria-busy'); }
  }
  D.render = render;
  D.refreshBoot = async () => { state.boot = await D.api('meta.bootstrap'); const n = state.boot && state.boot.storageNotice; if (n && n.message && state.shownStorageNotice !== n.message) { state.shownStorageNotice = n.message; D.toast(n.message, n.level === 'warn' ? 'err' : 'ok', 14000); } };
  D.page = (title, crumb, actions, ...content) => h('div', {}, h('div', { class: 'crumb' }, crumb || ''), h('div', { class: 'head' }, h('h1', { class: 'grow' }, title), h('div', { class: 'btns' }, actions || [])), ...content);
  D.contractOptions = (onlyCarrier = false) => state.boot.contracts.filter((c) => !onlyCarrier || c.role === 'CARRIER').sort((a, b) => (b.is_active === false ? 0 : 1) - (a.is_active === false ? 0 : 1))
    .map((c) => [c.contract_id, `${c.contract_code} · ${c.carrier_unit_code} → ${c.customer_unit_code}${c.role === 'CARRIER' ? '' : ' (bên thuê)'}${c.is_active === false ? ' (ngừng dùng)' : ''}`]);
  D.routeOptions = (blank = true) => [...(blank ? [['', 'Tất cả tuyến']] : []), ...state.boot.routes.map((r) => [r.route_code, `${r.route_code} · ${r.route_name}`])];
  D.unitOptions = (blank = false) => [...(blank ? [['', '—']] : []), ...state.boot.units.map((u) => [u.unit_code, `${u.unit_code} · ${u.unit_name}`])];
  D.priceCodeOptions = (blank = true) => [
    ...(blank ? [['', '— Giá chung (không dùng mã) —']] : []),
    ...((state.boot && state.boot.priceCodes) || []).map((c) => [c.price_code, `${c.price_code} · ${c.price_name} (${c.price_method === 'CO_DINH' ? 'Cố định' : 'Theo dầu'})`])
  ];

  // ───────── HAK Smart Filter adapter (HAK_SMART_FILTER) ─────────
  D.sf = window.HAKCore && window.HAKCore.sf;
  if (window.HAKUI && window.HAKUI.smartFilter && D.sf) {
    const sfH = (tag, attrs, kids) => {
      const e = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs || {})) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'text') e.textContent = String(v);
        else if (k === 'class') e.className = String(v);
        else if (k === 'style') { if (typeof v === 'string') e.style.cssText = v; else Object.assign(e.style, v); }
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : String(v));
      }
      for (const c of (Array.isArray(kids) ? kids : kids != null ? [kids] : [])) {
        if (c !== null && c !== undefined && c !== false) e.append(typeof c === 'string' ? document.createTextNode(c) : c);
      }
      return e;
    };
    D.smartFilter = window.HAKUI.smartFilter.create({
      h: sfH,
      btn: (label, kind, onclick, title) => sfH('button', { type: 'button', class: `btn small${kind === 'primary' || kind === 'pri' ? ' primary' : kind === 'ghost' ? ' sf-ghost' : ''}`, title: title || '', onclick }, [label]),
      dateField: (iso, attrs) => sfH('input', Object.assign({ type: 'date', value: iso || '' }, attrs || {})),
      dateIso: (inp) => (inp && inp.value) || '',
      dateSet: (inp, iso) => { inp.value = iso || ''; },
      toast: (msg) => D.toast(msg, 'info'),
      askText: (title, label, opts, cb) => {
        const inp = h('input', { type: 'text', value: (opts && opts.value) || '', 'aria-label': label });
        D.modal({
          title,
          body: h('label', { class: 'field' }, h('span', {}, label), inp),
          actions: [
            { label: 'Hủy', run: () => true },
            { label: 'Lưu', primary: true, run: () => { const v = inp.value.trim(); if (!v) { D.toast('Chưa nhập tên', 'err'); return false; } cb(v); return true; } }
          ]
        });
        setTimeout(() => inp.focus(), 50);
      },
      storage: () => { try { return window.localStorage; } catch { return null; } }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey && e.key === 'Enter')) return;
    // rà soát 1.8.2: trước đây bấm nút [data-hotkey=primary] ĐẦU TIÊN của cả trang — kể cả nút đang ẩn (thẻ khác) hoặc nằm dưới hộp thoại đang mở.
    const usable = (b) => b && !b.disabled && b.offsetParent !== null;
    const top = [...document.querySelectorAll('.overlay')].pop();
    let b = null;
    if (top) { // có hộp thoại: chỉ nút chính CỦA hộp trên cùng (hộp xác nhận nguy hiểm không có nút chính → không làm gì)
      b = [...top.querySelectorAll('[data-hotkey="primary"], .foot button.primary')].find(usable) || null;
    } else {
      const cands = [...document.querySelectorAll('[data-hotkey="primary"]')].filter(usable);
      // ưu tiên nút cùng thẻ / khung / form với ô đang gõ; không đoán được thì chỉ bấm khi trên màn có đúng MỘT nút chính đang hiện
      const a = document.activeElement;
      b = (a && cands.find((x) => { const n = x.closest('[role=tabpanel], .card, form'); return n && n.contains(a); })) || (cands.length === 1 ? cands[0] : null);
    }
    if (b) { e.preventDefault(); b.click(); }
  });

  window.addEventListener('DOMContentLoaded', async () => {
    const st = await D.api('setup.status', {}, { quiet: true }).catch((e) => ({ error: e }));
    D.state.setup = st;
    D.go(st.initialized ? 'login' : 'setup');
  });
})();
