'use strict';
/**
 * Khung giao diện: router, helper DOM, định dạng, modal, bảng, gọi API.
 * Mọi màn hình đăng ký bằng App.register(id, { title, render(container, params) }).
 * Giao diện KHÔNG tự tính tiền: chỉ hiển thị số do backend trả về.
 */
const App = (() => {
  const views = {};
  let current = null;
  let info = null;
  const state = { filter: { tu_ngay: '', den_ngay: '', dot_id: '', noi_xuat_id: '', tuyen_id: '', don_vi_id: '' } };

  // ---------------------------------------------------------------- DOM
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    if (tag === 'input' && attrs && (attrs.type === 'number' || attrs.inputmode === 'decimal' || attrs['data-num'])) bindNum(e);
    return e;
  }
  // ---------------------------------------------------------------- ô nhập số kiểu Việt Nam: 1.234.567,89 (tự ngăn cách hàng nghìn khi gõ)
  const VALUE = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const rawToVN = (raw) => {
    const s = String(raw ?? '').trim(); if (s === '') return '';
    const neg = s.startsWith('-'); const [i, d] = s.replace(/[^0-9.]/g, '').split('.');
    const g = (i || '').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + (g || (d !== undefined ? '0' : '')) + (d !== undefined ? ',' + d : '');
  };
  const vnToRaw = (txt) => { const s = String(txt ?? '').trim(); if (!s) return ''; const neg = s.startsWith('-'); const r = s.replace(/[^0-9,]/g, '').replace(',', '.'); return r === '' && !neg ? '' : (neg ? '-' : '') + r; };
  function bindNum(inp) {
    if (inp._numBound) return; inp._numBound = true;
    if (inp.type === 'number') inp.type = 'text';
    inp.setAttribute('inputmode', 'decimal'); inp.style.textAlign = 'right';
    const initial = VALUE.get.call(inp);
    Object.defineProperty(inp, 'value', { configurable: true,
      get() { return vnToRaw(VALUE.get.call(inp)); },
      set(v) { VALUE.set.call(inp, v === null || v === undefined ? '' : rawToVN(v)); } });
    VALUE.set.call(inp, rawToVN(initial));
    inp.addEventListener('input', () => {
      const t = VALUE.get.call(inp); const pos = inp.selectionStart ?? t.length;
      const digitsBefore = t.slice(0, pos).replace(/[^0-9,]/g, '').length;
      let clean = t.replace(/[^0-9,\-]/g, ''); const k = clean.indexOf(','); if (k >= 0) clean = clean.slice(0, k + 1) + clean.slice(k + 1).replace(/,/g, '');
      const neg = clean.startsWith('-'); clean = clean.replace(/-/g, '');
      const [i, d] = clean.split(','); const g = (i || '').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      const out = (neg ? '-' : '') + g + (d !== undefined ? ',' + d : '');
      VALUE.set.call(inp, out);
      let n = 0, c = 0; for (; c < out.length && n < digitsBefore; c++) if (/[0-9,]/.test(out[c])) n++;
      try { inp.setSelectionRange(c, c); } catch (e) { /* bỏ qua */ }
    });
  }
  const clear = (e) => { while (e.firstChild) e.removeChild(e.firstChild); return e; };

  // ---------------------------------------------------------------- định dạng
  const nf = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
  const fmt = {
    int: (v) => (v === null || v === undefined || v === '' ? '' : nf.format(Math.round(Number(v)))),
    money: (v) => (v === null || v === undefined || v === '' ? '' : nf.format(Math.round(Number(v)))),
    money2: (v) => (v === null || v === undefined ? '' : Number(v).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })),
    kg: (v) => (v === null || v === undefined ? '' : nf.format(Number(v))),
    tan: (v) => (v === null || v === undefined ? '' : Number(v).toLocaleString('vi-VN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })),
    pct: (v) => (v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + '%'),
    date: (v) => (v ? `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : ''),
    dt: (v) => (v ? `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)} ${String(v).slice(11, 16)}` : ''),
    dts: (v) => (v ? `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)} ${String(v).slice(11, 19)}` : ''),
    min: (v) => {
      if (v === null || v === undefined) return '';
      const a = Math.abs(Math.round(v)); const hh = Math.floor(a / 60); const mm = a % 60;
      return `${v < 0 ? '−' : ''}${hh ? hh + 'g ' : ''}${mm}p`;
    },
  };

  const STATUS_TAG = {
    OK: ['green', 'Đã tính giá'], CHUA_TINH: ['gray', 'Chưa tính'], NO_PRICE: ['red', 'Chưa có đơn giá'], MULTIPLE_PRICE: ['red', 'Xung đột bảng giá'],
    UNKNOWN_VEHICLE: ['red', 'Xe chưa xác định'], UNKNOWN_CARRIER: ['red', 'Chưa có đơn vị VC'], AMBIGUOUS_VEHICLE: ['red', 'Xe thuộc >1 đơn vị'],
    UNKNOWN_LOCATION: ['red', 'Nơi xuất/tuyến chưa rõ'], INVALID_WEIGHT: ['red', 'KL không hợp lệ'], INVALID_TIME: ['red', 'Thời gian lỗi'], NO_VAT_RATE: ['red', 'Thiếu VAT'],
    LOCKED: ['purple', 'Đã chốt'], ACTIVE: ['green', 'Đang dùng'], INACTIVE: ['gray', 'Ngừng'], NHAP: ['amber', 'Nháp'], MO: ['green', 'Đang mở'], KHOA: ['purple', 'Đã khóa'],
    NEW: ['green', 'Mới'], EXACT_DUPLICATE: ['gray', 'Trùng hoàn toàn'], KEY_CONFLICT: ['amber', 'Trùng khóa – khác dữ liệu'], IN_FILE_DUPLICATE: ['gray', 'Trùng trong file'], ERROR: ['red', 'Lỗi'],
    CHUA_DOI_CHIEU: ['gray', 'Chưa đối chiếu'], KHOP: ['green', 'Khớp'], LECH: ['red', 'Lệch'],
    MOI: ['red', 'Mới'], DANG_XU_LY: ['amber', 'Đang xử lý'], DA_XU_LY: ['green', 'Đã xử lý'], BO_QUA: ['gray', 'Bỏ qua'],
    CAO: ['red', 'Cao'], TRUNG_BINH: ['amber', 'Trung bình'], THAP: ['gray', 'Thấp'], DA_DUYET: ['green', 'Đã duyệt'], HUY: ['gray', 'Hủy'],
    NHA_MAY: ['blue', 'Nhà máy'], CANG: ['blue', 'Cảng'], KHO: ['blue', 'Kho'], KHAC: ['gray', 'Khác'],
    CO_DINH: ['gray', 'Cố định'], DIEU_CHINH_DAU: ['amber', 'Điều chỉnh theo dầu'], DONG_TAN: ['gray', 'đ/tấn'], DONG_CHUYEN: ['gray', 'đ/chuyến'],
  };
  const tag = (code, label) => { const [c, t] = STATUS_TAG[code] || ['gray', code]; return h('span', { class: `tag ${c}` }, label || t); };

  // ---------------------------------------------------------------- API
  async function api(channel, args) {
    let r;
    if (window.vcApi) r = await window.vcApi.invoke(channel, args || {});
    else {
      const res = await fetch(`/api/${channel}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
      r = await res.json();
    }
    if (!r.ok) { const e = new Error(r.error || 'Lỗi không xác định'); e.type = r.type; throw e; }
    return r.data;
  }
  /** Gọi API, lỗi → toast, trả null. */
  async function call(channel, args, okMsg) {
    try { const d = await api(channel, args); if (okMsg) toast(okMsg); return d; } catch (e) { toast(e.message, true); return null; }
  }

  /** Chọn file: Electron → đường dẫn; trình duyệt (dev/test) → base64. Trả {filePath} | {base64,fileName} | null */
  function pickFile(accept = '.xlsx,.xls,.csv') {
    if (window.vcApi && window.vcApi.isElectron) return window.vcApi.openFile({}).then((p) => (p ? { filePath: p } : null));
    return new Promise((resolve) => {
      const inp = h('input', { type: 'file', accept, style: { display: 'none' } });
      inp.addEventListener('change', () => {
        const f = inp.files[0]; if (!f) return resolve(null);
        const rd = new FileReader();
        rd.onload = () => resolve({ base64: String(rd.result).split(',')[1], fileName: f.name });
        rd.readAsDataURL(f);
      });
      document.body.append(inp); inp.click(); setTimeout(() => inp.remove(), 60000);
    });
  }

  async function saveExport(r) {
    if (!r) return;
    if (r.path && window.vcApi) {
      const dst = await window.vcApi.saveExport({ path: r.path, fileName: r.fileName });
      if (dst) { toast(`Đã lưu: ${dst}`); window.vcApi.showItem(dst); } else toast(`Đã xuất vào: ${r.path}`);
    } else if (r.base64) {
      const mime = /\.pdf$/i.test(r.fileName) ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const a = h('a', { href: `data:${mime};base64,${r.base64}`, download: r.fileName });
      document.body.append(a); a.click(); a.remove(); toast(`Đã xuất ${r.fileName}`);
    } else if (r.path) toast(`Đã xuất: ${r.path}`);
  }
  async function exportXlsx(channel, args) { const r = await call(channel, args); if (r) await saveExport(r); }

  // ---------------------------------------------------------------- toast & modal
  function toast(msg, err = false) {
    const t = h('div', { class: 'toast' + (err ? ' err' : '') }, msg);
    document.getElementById('toasts').append(t);
    setTimeout(() => t.remove(), err ? 7000 : 3500);
  }
  /** Modal: chỉ đóng khi bấm đúng lớp nền (e.target === overlay) hoặc nút Đóng. */
  function modal({ title, body, actions = [], wide = false, onClose = null }) {
    const close = () => { ov.remove(); if (onClose) onClose(); };
    const box = h('div', { class: 'modal' + (wide ? ' wide' : '') }, h('h2', {}, title), body,
      h('div', { class: 'actions' }, actions.map((a) => h('button', {
        class: 'btn ' + (a.cls || (a.primary === false ? 'ghost' : '')), disabled: a.disabled,
        onclick: async () => { const keep = a.onClick ? await a.onClick(close) : undefined; if (!a.keepOpen && keep !== false) close(); },
      }, a.label))));
    const ov = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === ov) ov._down = true; }, onmouseup: (e) => { if (e.target === ov && ov._down) close(); ov._down = false; } }, box);
    document.body.append(ov);
    return { close, box };
  }
  const confirmBox = (title, text, okLabel = 'Đồng ý', cls = '') => new Promise((res) => {
    modal({ title, body: h('p', {}, text), actions: [{ label: 'Hủy', primary: false, onClick: () => res(false) }, { label: okLabel, cls, onClick: () => res(true) }], onClose: () => res(false) });
  });
  const promptBox = (title, label, dflt = '') => new Promise((res) => {
    const inp = h('input', { value: dflt, style: { width: '100%' } });
    modal({ title, body: h('label', { class: 'field' }, label, inp), actions: [{ label: 'Hủy', primary: false, onClick: () => res(null) }, { label: 'Đồng ý', onClick: () => { if (!inp.value.trim()) { toast('Cần nhập nội dung', true); return false; } res(inp.value.trim()); } }], onClose: () => res(null) });
    setTimeout(() => inp.focus(), 30);
  });

  // ---------------------------------------------------------------- bảng
  /**
   * table({columns:[{key,label,fmt,cls,render,sort}], rows, totals, onRow, rowClass, sort:{key,dir}, onSort})
   * fmt: 'money'|'int'|'kg'|'tan'|'date'|'dt'|'pct'|'min' | function
   */
  function table({ columns, rows, totals = null, onRow = null, rowClass = null, sort = null, onSort = null, empty = 'Không có dữ liệu', wrapClass = '' }) {
    const num = (c) => ['money', 'money2', 'int', 'kg', 'tan', 'min', 'pct'].includes(c.fmt) || c.num;
    const dat = (c) => ['date', 'dt', 'dts'].includes(c.fmt) || c.date;
    const thead = h('thead', {}, h('tr', {}, columns.map((c) => h('th', {
      class: (num(c) ? 'r ' : dat(c) ? 'c ' : '') + (c.sort && onSort ? 'sortable' : ''),
      onclick: c.sort && onSort ? () => onSort(c.sort === true ? c.key : c.sort) : null,
    }, c.label, sort && (sort.key === (c.sort === true ? c.key : c.sort)) ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : ''))));
    const cell = (c, r) => {
      if (c.render) { const v = c.render(r); return h('td', { class: (num(c) ? 'num ' : dat(c) ? 'ctr ' : '') + (c.cls || '') }, v); }
      let v = r[c.key];
      if (typeof c.fmt === 'function') v = c.fmt(v, r); else if (c.fmt && fmt[c.fmt]) v = fmt[c.fmt](v);
      if (c.tag) return h('td', {}, v === null || v === undefined || v === '' ? '' : tag(r[c.key]));
      return h('td', { class: (num(c) ? 'num ' : dat(c) ? 'ctr ' : '') + (c.mono ? 'mono ' : '') + (c.cls || '') }, v === null || v === undefined ? '' : v);
    };
    const tbody = h('tbody', {}, rows.length ? rows.map((r) => h('tr', { class: rowClass ? rowClass(r) : '', onclick: onRow ? () => onRow(r) : null, style: onRow ? { cursor: 'pointer' } : null }, columns.map((c) => cell(c, r))))
      : h('tr', {}, h('td', { colspan: columns.length, class: 'empty' }, empty)));
    const tfoot = totals ? h('tfoot', {}, h('tr', {}, columns.map((c, i) => {
      const v = totals[c.key]; let t = '';
      if (v !== undefined && v !== null) t = typeof c.fmt === 'function' ? c.fmt(v, totals) : (c.fmt && fmt[c.fmt] ? fmt[c.fmt](v) : v);
      return h('td', { class: num(c) ? 'num' : dat(c) ? 'ctr' : '' }, i === 0 && (v === undefined || v === null) ? 'Tổng cộng' : t);
    }))) : null;
    return h('div', { class: 'tbl-wrap ' + wrapClass }, h('table', { class: 't' }, thead, tbody, tfoot));
  }

  // ---------------------------------------------------------------- filter dùng chung
  async function filterBar(onChange, { fields = ['tu_ngay', 'den_ngay', 'dot_id', 'noi_xuat_id', 'don_vi_id'], filter = state.filter } = {}) {
    const [dots, nx, dv, tuyen] = await Promise.all([
      api('catalog.options', { table: 'dot_van_chuyen' }), api('catalog.options', { table: 'dia_diem' }),
      api('catalog.options', { table: 'don_vi_van_chuyen' }), api('catalog.options', { table: 'tuyen_van_chuyen' }),
    ]);
    const sel = (key, label, opts) => h('label', { class: 'field' }, label, h('select', { onchange: (e) => { filter[key] = e.target.value; onChange(); } },
      h('option', { value: '' }, 'Tất cả'), opts.map((o) => h('option', { value: o.id, selected: String(filter[key]) === String(o.id) }, o.label))));
    const dateF = (key, label) => h('label', { class: 'field' }, label, h('input', { type: 'date', value: filter[key] || '', onchange: (e) => { filter[key] = e.target.value; onChange(); } }));
    const textF = (key, label, ph) => h('label', { class: 'field' }, label, h('input', { type: 'text', placeholder: ph || '', value: filter[key] || '', style: { width: '130px' },
      onchange: (e) => { filter[key] = e.target.value.trim(); onChange(); } }));
    const map = { bien_so: () => textF('bien_so', 'Biển số', '43H-01021'), tu_ngay: () => dateF('tu_ngay', 'Từ ngày'), den_ngay: () => dateF('den_ngay', 'Đến ngày'), dot_id: () => sel('dot_id', 'Đợt/Tàu', dots),
      noi_xuat_id: () => sel('noi_xuat_id', 'Nơi xuất', nx.filter((x) => true)), tuyen_id: () => sel('tuyen_id', 'Tuyến', tuyen), don_vi_id: () => sel('don_vi_id', 'Đơn vị vận chuyển', dv) };
    // Bộ lọc đang bật ở trang khác (VD Tuyến, Biển số) vẫn phải hiện ra để không lọc ngầm
    const hidden = Object.keys(filter).filter((k) => filter[k] !== '' && filter[k] != null && !fields.includes(k) && map[k]);
    return h('div', { class: 'card filters' }, [...fields, ...hidden].map((f) => map[f]()),
      h('button', { class: 'btn ghost sm', onclick: () => { Object.keys(filter).forEach((k) => (filter[k] = '')); onChange(true); } }, 'Xóa lọc'));
  }
  const cleanFilter = (f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v !== null && v !== undefined));

  // ---------------------------------------------------------------- điều hướng
  const NAV = [
    ['TỔNG QUAN', [['dashboard', '📊', 'Dashboard']]],
    ['VẬN CHUYỂN', [['tickets', '🧾', 'Phiếu cân'], ['import', '📥', 'Import phiếu cân'], ['review', '🔍', 'Cần kiểm tra', 'pending'], ['vehicle', '🚛', 'Chi tiết theo xe']]],
    ['CHI PHÍ', [['statements', '📄', 'Bảng kê thanh toán'], ['lock', '🔒', 'Chốt kỳ'], ['prices', '💲', 'Bảng giá'], ['pricecalc', '🧮', 'Bảng tính đơn giá'], ['fuel', '⛽', 'Giá dầu']]],
    ['ĐỐI CHIẾU', [['reconcile', '⚖️', 'Đối chiếu']]],
    ['DANH MỤC', [['cat:xe', '🚛', 'Xe'], ['cat:don_vi_van_chuyen', '🏢', 'Đơn vị vận chuyển'], ['cat:hop_dong', '📑', 'Hợp đồng vận chuyển'], ['cat:dia_diem', '📍', 'Địa điểm'], ['cat:tuyen_van_chuyen', '🛣', 'Tuyến'], ['cat:dot_van_chuyen', '🚢', 'Đợt / Tàu']]],
    ['BÁO CÁO', [['forms', '🖨', 'Biểu mẫu in ký 2 bên'], ['rp:vehicle', '📋', 'Theo xe'], ['rp:carrier', '📋', 'Theo đơn vị'], ['rp:origin', '📋', 'Theo nơi xuất'], ['rp:date', '📋', 'Theo thời gian'], ['rp:dot', '📋', 'Theo tàu']]],
    ['HỆ THỐNG', [['alerts', '🔔', 'Trung tâm cảnh báo', 'alerts'], ['batches', '🕘', 'Lịch sử import'], ['audit', '📜', 'Audit log'], ['backup', '💾', 'Backup'], ['settings', '⚙️', 'Cài đặt']]],
  ];
  function renderNav() {
    const sb = clear(document.getElementById('sidebar'));
    sb.append(h('div', { class: 'brand' }, h('i', {}, '🚚'), h('div', {}, h('b', {}, 'VC Cost'), h('small', {}, 'Chi phí vận chuyển · Offline'))));
    for (const [group, items] of NAV) {
      sb.append(h('div', { class: 'nav-group' }, group));
      for (const [id, ic, label, bk] of items) {
        const n = bk && info ? (bk === 'pending' ? info.pendingReviews : info.alertsOpen) : 0;
        sb.append(h('div', { class: 'nav-item' + (current === id ? ' active' : ''), 'data-nav': id, onclick: () => go(id) },
          h('span', { class: 'ic' }, ic), label, n ? h('span', { class: 'badge' + (bk === 'alerts' ? ' red' : '') }, n) : null));
      }
    }
    sb.append(h('div', { class: 'foot' }, info ? `v${info.version} · ${info.counts.phieu} phiếu · ${info.counts.xe} xe` : ''));
  }
  async function refreshInfo() { try { info = await api('app.info'); } catch (e) { /* bỏ qua */ } renderNav(); }

  function register(id, def) { views[id] = def; }
  function resolve(id) {
    if (views[id]) return [views[id], {}];
    const [kind, arg] = id.split(':');
    if (views[kind]) return [views[kind], { arg }];
    return [null, {}];
  }
  async function go(id, params = {}) {
    current = id; renderNav();
    const [v, p] = resolve(id);
    const view = clear(document.getElementById('view'));
    if (!v) { view.append(h('div', { class: 'empty' }, `Chưa có màn hình "${id}"`)); return; }
    view.append(h('div', { class: 'empty' }, 'Đang tải…'));
    try { clear(view); await v.render(view, { ...p, ...params }); } catch (e) { clear(view); view.append(h('div', { class: 'card' }, h('h3', {}, 'Lỗi hiển thị'), h('pre', { class: 'json' }, e.stack || e.message))); }
    document.getElementById('main').scrollTop = 0;
    refreshInfo();
  }
  const reload = () => go(current);
  const pageHead = (title, subtitle, ...actions) => h('div', { class: 'row', style: { marginBottom: '12px' } }, h('div', { class: 'grow' }, h('h1', {}, title), subtitle ? h('p', { class: 'sub', style: { margin: 0 } }, subtitle) : null), ...actions);

  async function start() { await refreshInfo(); await go('dashboard'); }

  return { h, clear, bindNum, fmt, tag, api, call, pickFile, saveExport, exportXlsx, toast, modal, confirmBox, promptBox, table, filterBar, cleanFilter, register, go, reload, start, refreshInfo, state, pageHead, STATUS_TAG, get info() { return info; } };
})();
