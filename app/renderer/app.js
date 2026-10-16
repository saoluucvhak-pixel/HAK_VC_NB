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
      h('button', { class: 'btn small', onclick: async () => { await D.api('archive.unmount', {}); D.render && D.render(); } }, 'Thôi xem'));
  };
  D.api = async function api(action, payload, { quiet = false } = {}) {
    const res = await raw(action, payload);
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
  function errorText(e) {
    const d = e.details || {};
    const extra = Array.isArray(d.errors) ? '' : d.issues ? ` — ${d.issues.slice(0, 3).map((i) => i.message).join('; ')}` : '';
    return `${e.message}${extra}`;
  }
  D.errorText = errorText;
  D.rid = () => `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // ───────── DOM + định dạng ─────────
  const h = (D.h = function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
  });
  D.vn = (x, d = 0) => {
    if (x === '' || x === null || x === undefined || Number.isNaN(Number(x))) return '';
    const n = Number(x); const neg = n < 0; const [i, f] = Math.abs(n).toFixed(d).split('.');
    return (neg ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f ? `,${f}` : '');
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
  D.today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  D.can = (...roles) => state.boot && roles.includes(state.boot.user.role);
  D.writer = () => D.can('ADMIN', 'KE_TOAN');

  // ───────── thông báo ─────────
  D.toast = (msg, kind = 'info', ms = 4000) => {
    let box = document.querySelector('.toasts'); if (!box) { box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
    const t = h('div', { class: `toast ${kind}` }, msg); box.append(t); setTimeout(() => t.remove(), ms);
    while (box.children.length > 3) box.firstChild.remove(); // tối đa 3 thông báo, không che nút
  };

  // ───────── modal, drawer, hộp xác nhận ─────────
  D.modal = ({ title, body, actions = [], wide = false, drawer = false, onClose }) => {
    const close = () => { ov.remove(); document.removeEventListener('keydown', esc); if (onClose) onClose(); };
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
    document.body.append(ov); document.addEventListener('keydown', esc);
    const first = box.querySelector('input, select, textarea'); if (first) first.focus();
    return { close, box };
  };
  D.confirm = ({ title, message, okLabel = 'Đồng ý', reason = false, danger = false }) => new Promise((resolve) => {
    const inp = reason ? h('textarea', { rows: 3, 'aria-label': 'Lý do' }) : null;
    let done = false;
    D.modal({ title, body: h('div', {}, h('p', {}, message), reason ? h('label', { class: 'field' }, h('span', {}, 'Lý do (bắt buộc)'), inp) : null),
      actions: [{ label: 'Hủy', run: () => { done = true; resolve(null); } }, { label: okLabel, primary: !danger, danger, run: () => {
        if (reason && !inp.value.trim()) { D.toast('Phải nhập lý do', 'err'); return false; }
        done = true; resolve(reason ? inp.value.trim() : true); return true;
      } }], onClose: () => { if (!done) resolve(null); } });
  });

  // ───────── form khai báo ─────────
  /** fields: [{key, label, type: text|number|date|select|textarea|check, options:[[v,t]], required, hint, full, readonly}] */
  D.form = (fields, values = {}) => {
    const inputs = {};
    const el = h('div', { class: 'form' }, fields.map((f) => {
      let inp;
      if (f.type === 'select') inp = h('select', { disabled: f.readonly }, (typeof f.options === 'function' ? f.options() : f.options).map(([v, t]) => h('option', { value: v, selected: String(values[f.key] ?? '') === String(v) }, t)));
      else if (f.type === 'textarea') { inp = h('textarea', { rows: f.rows || 3, readonly: f.readonly }); inp.value = values[f.key] ?? ''; }
      else if (f.type === 'check') { inp = h('input', { type: 'checkbox', checked: !!values[f.key], disabled: f.readonly }); return h('label', { class: `check ${f.full ? 'field full' : ''}` }, inp, f.label); }
      else inp = h('input', { type: f.type || 'text', value: values[f.key] ?? '', step: f.step || (f.type === 'number' ? 'any' : null), readonly: f.readonly, placeholder: f.placeholder || '' });
      inputs[f.key] = inp;
      return h('label', { class: `field ${f.full ? 'full' : ''}` }, h('span', {}, f.label + (f.required ? ' *' : '')), inp, f.hint ? h('span', { class: 'hint' }, f.hint) : null);
    }).map((node, i) => { const f = fields[i]; if (f.type === 'check') inputs[f.key] = node.querySelector('input'); return node; }));
    el.values = () => Object.fromEntries(fields.map((f) => {
      const i = inputs[f.key]; if (f.type === 'check') return [f.key, i.checked];
      const v = i.value; if (f.type === 'number') return [f.key, v === '' ? '' : Number(v)]; return [f.key, v];
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
      for (const r of rs) body.append(h('tr', { class: onRow ? 'click' : '', onclick: onRow ? () => onRow(r) : null }, columns.map((c) => h('td', { class: `${isNum(c) ? 'num' : ''} ${c.wrap ? 'wrap' : ''}` }, cell(c, r)))));
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
    ['dashboard', '1', 'Tổng quan'], ['tickets', '2', 'Phiếu cân'], ['fuel', '3', 'Giao nhận dầu'], ['routes', '4', 'Danh mục tuyến'], ['contracts', '', 'Hợp đồng vận chuyển'],
    ['prices', '5', 'Đơn giá'], ['basis', '', 'Căn cứ giá hợp đồng'], ['calc', '6', 'Tính giá vận chuyển'], ['bkvc', '7', 'Bảng xác nhận KL'], ['bkct', '8', 'Chi tiết vận chuyển'], ['validation', '', 'Kiểm tra dữ liệu'],
    ['reports', '9', 'Báo cáo'], ['exchange', '', 'Trao đổi dữ liệu'], ['reconcile', '', 'Đối chiếu dữ liệu'], ['sync', '', 'Nhắc sửa danh mục'], ['audit', '10', 'Lịch sử thao tác'], ['settings', '11', 'Cài đặt'],
  ];
  D.go = (view, params = {}) => { state.view = view; state.params = params; render(); };

  async function render() {
    const root = document.getElementById('root');
    if (['setup', 'login'].includes(state.view)) { root.innerHTML = ''; root.append(await D.views[state.view].render(state.params)); return; }
    if (!state.boot) { D.go('login'); return; }
    const b = state.boot; const main = h('main', { class: 'main', id: 'main' });
    const sync = await D.api('sync.list', {}, { quiet: true }).catch(() => ({ total: 0 }));
    const rc = await D.api('reconcile.audit', {}, { quiet: true }).catch(() => ({ problems: 0 }));
    const side = h('aside', { class: 'side' },
      h('div', { class: 'brand' }, h('div', { class: 'logo', 'aria-hidden': 'true' }, 'VC'), h('div', {}, 'Đơn giá vận chuyển', h('div', { class: 'sub' }, 'dăm gỗ · HAK Group'))),
      h('div', { class: 'install' }, h('b', {}, `Bản cài · ${b.install.unitCode}`), b.install.unitName),
      h('nav', { 'aria-label': 'Menu chính' }, h('ul', { class: 'nav' }, NAV.filter(([v]) => v !== 'audit' || true).map(([v, n, t]) => h('li', {}, h('button', { 'aria-current': state.view === v ? 'page' : null, onclick: () => D.go(v) },
        h('span', { class: 'n' }, n), t, v === 'sync' && sync.total ? h('span', { class: 'badge', 'aria-label': `${sync.total} nhắc` }, sync.total) : null, v === 'reconcile' && rc.problems ? h('span', { class: 'badge', 'aria-label': `${rc.problems} vấn đề cần xử lý` }, rc.problems) : null))))),
      h('div', { class: 'me' }, h('div', {}, b.user.fullName || b.user.username), h('div', {}, `${b.user.role} · dữ liệu: `, h('span', { class: 'mono' }, b.install.dataFolder)),
        h('button', { onclick: async () => { await D.api('auth.logout', {}, { quiet: true }).catch(() => {}); state.token = ''; state.boot = null; D.go('login'); } }, 'Đăng xuất')));
    root.innerHTML = ''; root.append(h('div', { class: 'app' }, side, main));
    const v = D.views[state.view];
    try { main.append(await v.render(state.params)); } catch (e) { main.append(h('div', { class: 'card' }, h('h2', {}, 'Không mở được màn hình'), h('p', {}, e.message))); }
  }
  D.render = render;
  D.refreshBoot = async () => { state.boot = await D.api('meta.bootstrap'); };
  D.page = (title, crumb, actions, ...content) => h('div', {}, h('div', { class: 'crumb' }, crumb || ''), h('div', { class: 'head' }, h('h1', { class: 'grow' }, title), h('div', { class: 'btns' }, actions || [])), ...content);
  D.contractOptions = (onlyCarrier = false) => state.boot.contracts.filter((c) => !onlyCarrier || c.role === 'CARRIER').sort((a, b) => (b.is_active === false ? 0 : 1) - (a.is_active === false ? 0 : 1))
    .map((c) => [c.contract_id, `${c.contract_code} · ${c.carrier_unit_code} → ${c.customer_unit_code}${c.role === 'CARRIER' ? '' : ' (bên thuê)'}${c.is_active === false ? ' (ngừng dùng)' : ''}`]);
  D.routeOptions = (blank = true) => [...(blank ? [['', 'Tất cả tuyến']] : []), ...state.boot.routes.map((r) => [r.route_code, `${r.route_code} · ${r.route_name}`])];
  D.unitOptions = (blank = false) => [...(blank ? [['', '—']] : []), ...state.boot.units.map((u) => [u.unit_code, `${u.unit_code} · ${u.unit_name}`])];

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') { const b = document.querySelector('[data-hotkey="primary"]'); if (b) { e.preventDefault(); b.click(); } }
  });

  window.addEventListener('DOMContentLoaded', async () => {
    const st = await D.api('setup.status', {}, { quiet: true }).catch((e) => ({ error: e }));
    D.state.setup = st;
    D.go(st.initialized ? 'login' : 'setup');
  });
})();
