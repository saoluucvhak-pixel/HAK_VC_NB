'use strict';
/** Danh mục (config-driven CRUD) + Bảng giá + Giá dầu / kỳ điều chỉnh. */
(() => {
  const { h, fmt, api, call, table, tag } = App;
  let CFG = null;
  const cfg = async () => CFG || (CFG = await api('catalog.config'));

  /** Form sinh từ cấu hình. Trả {box, read()} */
  async function buildForm(c, values = {}) {
    const refs = {};
    for (const f of c.fields) if (f.ref) refs[f.key] = await api('catalog.options', { table: f.ref.table });
    const inputs = {}; const computed = {}; const all = {};
    let lastGroup = null;
    const box = h('div', { class: 'form-grid' }, c.fields.filter((f) => !f.readonly).flatMap((f) => {
      let inp;
      const val = values[f.key] ?? (values.id ? '' : f.default ?? '');
      if (f.type === 'select') {
        const opts = f.ref ? refs[f.key].map((o) => [o.id, o.label]) : f.options.map((o) => [o, (App.STATUS_TAG[o] || [0, o])[1]]);
        inp = h('select', { 'data-f': f.key }, h('option', { value: '' }, '—'), opts.map(([k, l]) => h('option', { value: k, selected: String(val) === String(k) }, l)));
      } else if (f.type === 'textarea') inp = h('textarea', { 'data-f': f.key }, val);
      else inp = h('input', { 'data-f': f.key, type: f.type === 'date' ? 'date' : 'text', value: val, inputmode: f.type === 'number' ? 'decimal' : null });
      if (f.computed) { inp.disabled = true; inp.value = values[f.key] !== undefined && values[f.key] !== null ? fmt.money(values[f.key]) : ''; }
      else inputs[f.key] = inp;
      computed[f.key] = f.computed ? inp : computed[f.key];
      all[f.key] = inp;
      const lbl = h('label', { class: 'field' + (f.type === 'textarea' ? ' full' : ''), }, f.label + (f.required ? ' *' : ''), inp, f.hint ? h('span', { class: 'hint' }, f.hint) : null);
      if (f.group && f.group !== lastGroup) { lastGroup = f.group; return [h('h4', { style: 'grid-column:1/-1;margin:10px 0 0;color:var(--green)' }, f.group), lbl]; }
      return [lbl];
    }));
    // Bảng giá: đơn giá áp dụng tự tính theo công thức Excel khi đổi thông số
    if (c.fields.some((f) => f.key === 'don_gia_ap_dung')) wirePriceCalc(all, computed);
    return { box, read: () => Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value])) };
  }

  const CALC_KEYS = ['phuong_thuc', 'don_gia_goc', 'gia_dau_co_so', 'gia_dau_ap_dung', 'khoang_cach_km', 'dinh_muc_dau', 'khoi_luong_binh_quan'];
  /** Gắn tính nhanh: đổi thông số → gọi price.calc → điền ô tự tính + thông báo thiếu thông số. */
  function wirePriceCalc(all, computed, out) {
    const msg = h('div', { class: 'muted', style: 'grid-column:1/-1' });
    const run = async () => {
      const o = {}; for (const k of CALC_KEYS) if (all[k]) o[k] = all[k].value;
      if (!o.don_gia_goc) { msg.textContent = ''; if (computed.don_gia_ap_dung) computed.don_gia_ap_dung.value = ''; if (computed.don_gia_dieu_chinh) computed.don_gia_dieu_chinh.value = ''; return; }
      const r = await api('price.calc', o);
      if (r && r.ok) {
        if (computed.don_gia_ap_dung) computed.don_gia_ap_dung.value = fmt.money(r.gia);
        if (computed.don_gia_dieu_chinh) computed.don_gia_dieu_chinh.value = fmt.money(r.dieu_chinh);
        msg.textContent = r.breakdown ? `= ${fmt.money(r.breakdown.basePrice)} + ROUND(${r.breakdown.distanceKm} km × ${r.breakdown.fuelNormPer100km}/100 × (${fmt.money(r.breakdown.currentFuelPrice)} − ${fmt.money(r.breakdown.baseFuelPrice)}) ÷ ${r.breakdown.avgTonPerTrip} tấn, −2 chữ số) = ${fmt.money(r.gia)}` : 'Giá cố định: đơn giá áp dụng = đơn giá gốc';
      } else { msg.textContent = r ? r.message : ''; if (computed.don_gia_ap_dung) computed.don_gia_ap_dung.value = ''; }
    };
    for (const k of CALC_KEYS) if (all[k]) { all[k].addEventListener('input', run); all[k].addEventListener('change', run); }
    if (out) out.append(msg); else Object.values(all)[0].closest('.form-grid').append(msg);
    run();
  }

  async function editDialog(table_, row, { parentId = null, onDone, onDelete = null }) {
    const c = (await cfg())[table_];
    const form = await buildForm(c, row || {});
    App.modal({ title: `${row ? 'Sửa' : 'Thêm'} ${c.label.toLowerCase()}`, body: form.box,
      actions: [...(row && onDelete ? [{ label: '🗑 Xóa', cls: 'danger', onClick: async () => { await onDelete(); } }] : []), { label: 'Hủy', primary: false }, { label: 'Lưu', onClick: async () => {
        const data = form.read();
        const r = row ? await call('catalog.update', { table: table_, id: row.id, data }, 'Đã lưu') : await call('catalog.create', { table: table_, data, parentId }, 'Đã thêm');
        if (!r) return false; onDone && onDone();
      } }] });
  }

  async function columnsFor(table_) {
    const c = (await cfg())[table_]; const refs = {};
    for (const f of c.fields) if (f.ref) refs[f.key] = new Map((await api('catalog.options', { table: f.ref.table })).map((o) => [o.id, o.label]));
    return c.columns.map((k) => {
      const f = c.fields.find((x) => x.key === k);
      if (k === 'don_vi_hien_tai') return { key: k, label: (c.extraColumns || {})[k], render: (r) => (r.don_vi_hien_tai ? r.don_vi_hien_tai : h('span', { class: 'tag red' }, 'Chưa gán đơn vị')) };
      if (!f) return { key: k, label: (c.extraColumns || {})[k] || k, num: k === 'so_chuyen' || k === 'so_phieu' };
      if (f.ref) return { key: k, label: f.label, render: (r) => refs[k].get(r[k]) || (r[k] ? `#${r[k]}` : '') };
      if (f.tag) return { key: k, label: f.label, tag: true };
      if (f.money) return { key: k, label: f.label, fmt: 'money' };
      if (f.type === 'date') return { key: k, label: f.label, fmt: 'date' };
      return { key: k, label: f.label, mono: f.mono, num: f.type === 'number' };
    });
  }

  App.register('cat', {
    async render(v, { arg }) {
      const c = (await cfg())[arg];
      const body = h('div', {}); let search = '';
      const cols = await columnsFor(arg);
      const load = async () => {
        const rows = await api('catalog.list', { table: arg, search });
        App.clear(body).append(h('div', { class: 'card' }, table({
          columns: [...cols, { key: '_a', label: '', render: (r) => h('span', { class: 'row gap-s' },
            h('button', { class: 'btn ghost sm', onclick: (e) => { e.stopPropagation(); editDialog(arg, r, { onDone: load }); } }, 'Sửa'),
            (c.children || []).length ? h('button', { class: 'btn ghost sm', onclick: (e) => { e.stopPropagation(); children(r); } }, 'Chi tiết') : null,
            h('button', { class: 'btn ghost sm', onclick: async (e) => { e.stopPropagation(); if (await App.confirmBox('Xóa', `Xóa ${r[c.displayField]}?`, 'Xóa', 'danger')) { if (await call('catalog.remove', { table: arg, id: r.id }, 'Đã xóa')) load(); } } }, 'Xóa')) }],
          rows, wrapClass: 'tall', onRow: (r) => editDialog(arg, r, { onDone: load }) }), h('p', { class: 'muted' }, `${rows.length} bản ghi`)));
      };
      async function children(parent) {
        const kids = c.children; const cc = (await cfg());
        const holder = h('div', {}); let active = kids[0];
        const draw = async () => {
          const k = cc[active]; const kcols = await columnsFor(active);
          const rows = await api('catalog.list', { table: active, parentId: parent.id });
          App.clear(holder).append(h('div', { class: 'tabs' }, kids.map((t) => h('div', { class: 'tab' + (t === active ? ' active' : ''), onclick: () => { active = t; draw(); } }, cc[t].label))),
            h('div', { class: 'row end', style: { marginBottom: '8px' } }, h('button', { class: 'btn sm', onclick: () => editDialog(active, null, { parentId: parent.id, onDone: draw }) }, '+ Thêm')),
            table({ columns: [...kcols, { key: '_a', label: '', render: (r) => h('span', { class: 'row gap-s' }, h('button', { class: 'btn ghost sm', onclick: () => editDialog(active, r, { onDone: draw }) }, 'Sửa'),
              h('button', { class: 'btn ghost sm', onclick: async () => { if (await call('catalog.remove', { table: active, id: r.id }, 'Đã xóa')) draw(); } }, 'Xóa')) }], rows }));
        };
        draw(); App.modal({ title: `${c.label}: ${parent[c.displayField]}`, wide: true, body: holder, actions: [{ label: 'Đóng', primary: false, onClick: () => load() }] });
      }
      v.append(App.pageHead(c.label, null,
        arg === 'xe' ? h('button', { class: 'btn ghost', onclick: () => App.go('import') }, '📥 Import danh mục xe') : null,
        h('input', { placeholder: 'Tìm…', onchange: (e) => { search = e.target.value.trim(); load(); } }), h('button', { class: 'btn', 'data-act': 'add', onclick: () => editDialog(arg, null, { onDone: load }) }, '+ Thêm')), body);
      await load();
    },
  });

  // ------------------------------------------------------------ Bảng giá
  App.register('prices', {
    async render(v) {
      const body = h('div', {});
      const num = (x) => Number(String(x).replace(/\./g, '').replace(',', '.'));
      const cols = await columnsFor('bang_gia_van_chuyen');
      let load;
      const delRule = async (r) => {
        const msg = r.so_phieu ? `Bảng giá ${r.ma_bang_gia} đang có ${r.so_phieu} phiếu sử dụng. Xóa sẽ gỡ giá khỏi các phiếu đó rồi tính lại ngay (về bảng giá cũ nếu có, không thì phiếu thành "chưa có giá" để bạn nhập giá đúng). Phiếu đã chốt kỳ không bị đổi.` : `Xóa bảng giá ${r.ma_bang_gia}?`;
        if (!(await App.confirmBox('Xóa bảng giá', msg, r.so_phieu ? 'Xóa và tính lại' : 'Xóa', 'danger'))) return;
        const x = await call('price.remove', { id: r.id, recalc: true }, 'Đã xóa bảng giá'); if (x) load();
      };
      load = async () => {
        const rows = await api('catalog.list', { table: 'bang_gia_van_chuyen' });
        App.clear(body).append(h('div', { class: 'card' }, table({ columns: [{ key: '_a', label: 'Xóa', render: (r) => h('button', { class: 'btn ghost sm', 'data-act': 'delprice', title: 'Xóa bảng giá', onclick: (e) => { e.stopPropagation(); delRule(r); } }, '🗑') }, ...cols], rows, wrapClass: 'tall', onRow: (r) => editDialog('bang_gia_van_chuyen', r, { onDone: load, onDelete: () => delRule(r) }),
          rowClass: (r) => (r.trang_thai === 'ACTIVE' && !r.den_ngay ? '' : 'dup') }),
        h('p', { class: 'muted' }, 'Giá cũ không bị sửa: dùng "Phiên bản giá mới" để đóng giá cũ (đến ngày X−1) và mở giá mới từ ngày X. Sau khi đổi, các phiếu bị ảnh hưởng được tính lại.')));
      };
      const newVersion = async () => {
        const tuyen = await api('catalog.options', { table: 'tuyen_van_chuyen' }); const dv = await api('catalog.options', { table: 'don_vi_van_chuyen' });
        const rules = await api('catalog.list', { table: 'bang_gia_van_chuyen' });
        const f = {}; const mk = (k, label, el, hint) => { f[k] = el; return h('label', { class: 'field' }, label, el, hint ? h('span', { class: 'hint' }, hint) : null); };
        const inp = (extra) => h('input', { inputmode: 'decimal', ...(extra || {}) });
        const body = h('div', { class: 'form-grid' },
          mk('tuyen_id', 'Tuyến *', h('select', {}, tuyen.map((t) => h('option', { value: t.id }, t.label)))),
          mk('don_vi_van_chuyen_id', 'Đơn vị (trống = mọi đơn vị)', h('select', {}, h('option', { value: '' }, '—'), dv.map((t) => h('option', { value: t.id }, t.label)))),
          mk('tu_ngay', 'Áp dụng từ ngày *', h('input', { type: 'date' })),
          mk('phuong_thuc', 'Phương thức', h('select', {}, h('option', { value: 'CO_DINH' }, 'Giá cố định'), h('option', { value: 'DIEU_CHINH_DAU' }, 'Điều chỉnh theo giá dầu'))),
          mk('don_gia_goc', 'Đơn giá gốc (đ/tấn) *', inp()), mk('vat_percent', 'VAT (%)', inp()),
          mk('gia_dau_co_so', 'Giá dầu cơ sở (đ/lít)', inp()), mk('gia_dau_ap_dung', 'Giá dầu áp dụng (đ/lít)', inp()),
          mk('khoang_cach_km', 'Khoảng cách (km, khứ hồi)', inp()), mk('dinh_muc_dau', 'Định mức dầu (L/100km)', inp()),
          mk('khoi_luong_binh_quan', 'KL bình quân (tấn/chuyến)', inp()),
          mk('don_gia_ap_dung', 'Đơn giá áp dụng (tự tính)', inp({ disabled: true })),
          mk('ghi_chu', 'Ghi chú', h('input', {})));
        // chọn tuyến/đơn vị → nạp sẵn thông số của bảng giá đang hiệu lực (chỉ cần sửa thông số thay đổi)
        const prefill = () => {
          const t = Number(f.tuyen_id.value), d = f.don_vi_van_chuyen_id.value ? Number(f.don_vi_van_chuyen_id.value) : null;
          const cur = rules.filter((r) => r.tuyen_id === t && (r.don_vi_van_chuyen_id || null) === d && r.trang_thai === 'ACTIVE' && !r.den_ngay).sort((x, y) => (y.tu_ngay > x.tu_ngay ? 1 : -1))[0];
          const set = (k, v) => { f[k].value = v === null || v === undefined ? '' : String(v).replace('.', ','); };
          if (cur) { f.phuong_thuc.value = cur.phuong_thuc; for (const k of ['don_gia_goc', 'vat_percent', 'gia_dau_co_so', 'gia_dau_ap_dung', 'khoang_cach_km', 'dinh_muc_dau', 'khoi_luong_binh_quan']) set(k, cur[k]); }
          f.don_gia_goc.dispatchEvent(new Event('input'));
        };
        f.tuyen_id.addEventListener('change', prefill); f.don_vi_van_chuyen_id.addEventListener('change', prefill);
        wirePriceCalc(f, { don_gia_ap_dung: f.don_gia_ap_dung }, body);
        prefill();
        App.modal({ title: 'Phiên bản giá mới (chỉ nhập thông số — đơn giá tự tính)', body, wide: true,
        actions: [{ label: 'Hủy', primary: false }, { label: 'Tạo', onClick: async () => {
          if (!f.tu_ngay.value || !f.don_gia_goc.value) { App.toast('Cần ngày áp dụng và đơn giá gốc', true); return false; }
          const o = { tuyen_id: Number(f.tuyen_id.value), don_vi_van_chuyen_id: f.don_vi_van_chuyen_id.value ? Number(f.don_vi_van_chuyen_id.value) : null, tu_ngay: f.tu_ngay.value, ghi_chu: f.ghi_chu.value || undefined };
          for (const k of ['phuong_thuc', 'don_gia_goc', 'vat_percent', 'gia_dau_co_so', 'gia_dau_ap_dung', 'khoang_cach_km', 'dinh_muc_dau', 'khoi_luong_binh_quan']) if (f[k].value !== '') o[k] = k === 'phuong_thuc' ? f[k].value : num(f[k].value);
          const r = await call('price.createVersion', o, 'Đã tạo bảng giá mới (đơn giá tự tính) và tính lại phiếu');
          if (!r) return false; load();
        } }] });
      };
      v.append(App.pageHead('Bảng giá', 'Theo tuyến + thời gian hiệu lực; giá riêng đơn vị ưu tiên hơn giá chung', h('button', { class: 'btn', 'data-act': 'newversion', onclick: newVersion }, '+ Phiên bản giá mới')), body);
      await load();
    },
  });

  // ------------------------------------------------------------ Giá dầu
  // ------------------------------------------------------------ Bảng tính đơn giá (như sheet "Giá dầu + Giá VC")
  App.register('pricecalc', {
    async render(v) {
      const today = new Date().toISOString().slice(0, 10);
      const f = {}; const mk = (k, label, el, hint) => { f[k] = el; return h('label', { class: 'field' }, label, el, hint ? h('span', { class: 'hint' }, hint) : null); };
      const num = (x) => Number(String(x).replace(/\./g, '').replace(',', '.'));
      const out = h('div', {});
      const params = () => ({ tu_ngay: f.tu_ngay && f.tu_ngay.value || undefined, den_ngay: f.den_ngay && f.den_ngay.value || undefined, don_vi_id: f.don_vi && f.don_vi.value ? f.don_vi.value : undefined, ngay: f.ngay.value || today, gia_dau: f.gia_dau.value ? num(f.gia_dau.value) : undefined,
        dau_tu: !f.gia_dau.value && f.dau_tu.value ? f.dau_tu.value : undefined, dau_den: !f.gia_dau.value && f.dau_den.value ? f.dau_den.value : undefined });
      const n0 = (x) => (x === undefined || x === null ? '' : fmt.money(x)); const n2 = (x) => (x === undefined || x === null ? '' : fmt.money2(x));
      const cols = [
        { key: 'ma_tuyen', label: 'Tuyến', mono: true }, { key: 'noi_xuat', label: 'Nơi xuất' }, { key: 'noi_den', label: 'Nơi đến' },
        { key: 'phuong_thuc', label: 'Phương thức', render: (r) => (r.thieu ? h('span', { class: 'muted' }, r.thieu) : r.phuong_thuc === 'DIEU_CHINH_DAU' ? 'Theo dầu' : 'Cố định') },
        { key: 'don_gia_goc', label: 'I.1 Giá cơ sở', render: (r) => n0(r.don_gia_goc), num: true },
        { key: 'gia_dau_co_so', label: 'I.2 Dầu cơ sở', render: (r) => n0(r.gia_dau_co_so), num: true },
        { key: 'km', label: 'I.3 Km', render: (r) => (r.km ?? ''), num: true },
        { key: 'tan_bq', label: 'I.4 Tấn BQ', render: (r) => (r.tan_bq ?? ''), num: true },
        { key: 'lit_chuyen', label: 'I.5 Lít/chuyến', render: (r) => n2(r.lit_chuyen), num: true },
        { key: 'gia_dau_ap_dung', label: 'I.6 Dầu áp dụng', render: (r) => n2(r.gia_dau_ap_dung), num: true },
        { key: 'chenh_dau', label: 'I.7 Chênh dầu', render: (r) => n2(r.chenh_dau), num: true },
        { key: 'cp_chenh_chuyen', label: 'II.1 CP chênh/chuyến', render: (r) => n0(r.cp_chenh_chuyen), num: true },
        { key: 'dc_tan', label: 'II.2 Điều chỉnh/tấn', render: (r) => n0(r.dc_tan), num: true },
        { key: 'dieu_chinh', label: 'II.3 Làm tròn', render: (r) => n0(r.dieu_chinh), num: true },
        { key: 'gia_moi', label: 'III.1 ĐƠN GIÁ', render: (r) => h('b', {}, n0(r.gia_moi)), num: true },
        { key: 'gia_hien_hanh', label: 'Giá hiện hành', render: (r) => n0(r.gia_hien_hanh), num: true },
        { key: 'chenh', label: 'Chênh', render: (r) => (r.gia_moi === undefined ? '' : n0(r.gia_moi - r.gia_hien_hanh)), num: true },
      ];
      const calc = async () => {
        const r = await call('price.sheet', params()); if (!r) return;
        App.clear(out).append(h('div', { class: 'card' },
          h('p', { class: 'muted' }, r.gia_dau_ap_dung !== null ? `Giá dầu áp dụng: ${fmt.money2(r.gia_dau_ap_dung)} đ/lít${r.so_ngay_gia ? ` (bình quân ${r.so_ngay_gia} ngày)` : ' (giả định)'}` : 'Đang dùng giá dầu áp dụng lưu trong từng bảng giá.'),
          table({ columns: cols, rows: r.rows, wrapClass: 'tall' }),
          h('p', { class: 'muted' }, 'Công thức: Đơn giá = I.1 + ROUND( ROUND( I.5 × (I.6 − I.2) ÷ I.4 , 0), −2 ), với I.5 = Km × Định mức ÷ 100. Thông số do bạn nhập ở "Bảng giá"; ở đây chỉ tính và xem trước.')));
      };
      const apply = async () => {
        const gd = f.gia_dau.value ? num(f.gia_dau.value) : null;
        if (!gd) { App.toast('Nhập "Giá dầu áp dụng" để tạo bảng giá mới (hoặc chọn khoảng ngày rồi bấm Tính để xem giá dầu bình quân)', true); return; }
        App.modal({ title: 'Áp dụng thành bảng giá mới', body: h('div', {}, h('p', {}, 'Tạo phiên bản bảng giá mới cho các tuyến điều chỉnh theo dầu, hiệu lực từ ngày: '), mk('ap', '', h('input', { type: 'date', value: f.ngay.value || today }))),
          actions: [{ label: 'Hủy', primary: false }, { label: 'Áp dụng', onClick: async () => {
            const r = await call('price.applySheet', { ngay_ap_dung: f.ap.value, gia_dau: gd }, 'Đã tạo bảng giá mới và tính lại phiếu'); if (!r) return false; App.toast(`Đã tạo ${r.created} bảng giá`); calc();
          } }] });
      };
      v.append(App.pageHead('Bảng tính đơn giá', 'Tính đơn giá vận chuyển theo công thức Excel từ thông số bảng giá; đổi giá dầu để xem trước',
        h('span', { class: 'row gap-s' }, h('button', { class: 'btn ghost', 'data-act': 'xlsx', onclick: () => App.exportXlsx('export.priceSheet', params()) }, '⬇ Excel (in/ký)'), h('button', { class: 'btn ghost', 'data-act': 'pdf', onclick: () => App.exportXlsx('export.priceSheetPdf', params()) }, '⬇ PDF'), h('button', { class: 'btn', 'data-act': 'apply', onclick: apply }, 'Áp dụng thành bảng giá mới'))),
      h('div', { class: 'card' }, h('div', { class: 'form-grid' },
        mk('ngay', 'Tính theo bảng giá hiệu lực ngày', h('input', { type: 'date', value: today })),
        mk('gia_dau', 'Giá dầu áp dụng (đ/lít)', h('input', { inputmode: 'decimal' }), 'Bỏ trống = dùng bình quân khoảng ngày bên dưới / giá lưu sẵn'),
        mk('don_vi', 'Bên B ký (tùy chọn)', h('select', {}, h('option', { value: '' }, '— Để trống —'), ((await api('catalog.options', { table: 'don_vi_van_chuyen' })) || []).map((o) => h('option', { value: o.id }, o.label))), 'Hiện thông tin Bên B trên bản in'),
        mk('tu_ngay', 'Kèm giá trị cước phiếu cân từ ngày (tùy chọn)', h('input', { type: 'date' })), mk('den_ngay', '… đến ngày', h('input', { type: 'date' })),
        mk('dau_tu', 'Hoặc bình quân giá dầu từ ngày', h('input', { type: 'date' })), mk('dau_den', '… đến ngày', h('input', { type: 'date' })),
        h('div', { class: 'field' }, h('button', { class: 'btn', 'data-act': 'calc', onclick: calc }, 'Tính'))), ), out);
      await calc();
    },
  });

  App.register('fuel', {
    async render(v) {
      const body = h('div', {});
      const pcols = await columnsFor('gia_dau');
      const load = async () => {
        const [prices, periods] = await Promise.all([api('catalog.list', { table: 'gia_dau' }), api('price.fuelPeriods')]);
        App.clear(body).append(
          h('div', { class: 'card' }, h('div', { class: 'row' }, h('h3', { class: 'grow' }, 'Kỳ điều chỉnh giá theo dầu'), h('button', { class: 'btn', 'data-act': 'newperiod', onclick: newPeriod }, '+ Kỳ điều chỉnh mới')),
            table({ columns: [{ key: 'ma_ky', label: 'Mã kỳ', mono: true }, { key: 'tu_ngay_tham_chieu', label: 'Tham chiếu từ', fmt: 'date' }, { key: 'den_ngay_tham_chieu', label: 'đến', fmt: 'date' }, { key: 'gia_dau_binh_quan', label: 'Giá dầu BQ', fmt: 'money2' },
              { key: 'ngay_ap_dung', label: 'Áp dụng từ', fmt: 'date' }, { key: 'trang_thai', label: 'Trạng thái', tag: true }, { key: '_a', label: '', render: (k) => h('span', { class: 'row gap-s' }, h('button', { class: 'btn ghost sm', onclick: () => preview(k) }, k.trang_thai === 'NHAP' ? 'Xem trước & duyệt' : 'Xem'), h('button', { class: 'btn ghost sm', 'data-act': 'delperiod', title: 'Xóa kỳ', onclick: async () => { if (await App.confirmBox('Xóa kỳ điều chỉnh', k.trang_thai === 'NHAP' ? `Xóa kỳ ${k.ma_ky}?` : `Xóa kỳ ${k.ma_ky}? Các bảng giá do kỳ này sinh ra sẽ được gỡ và bảng giá cũ mở lại Phiếu đang dùng các bảng giá đó (chưa chốt kỳ) sẽ được tính lại giá.`, 'Xóa và tính lại', 'danger')) { if (await call('price.removeFuelPeriod', { id: k.id, recalc: true }, 'Đã xóa kỳ')) load(); } } }, '🗑')) }], rows: periods, empty: 'Chưa có kỳ điều chỉnh' })),
          h('div', { class: 'card' }, h('div', { class: 'row' }, h('h3', { class: 'grow' }, 'Giá dầu theo ngày'), h('span', { class: 'row gap-s' }, h('button', { class: 'btn ghost', 'data-act': 'importfuel', onclick: importFuel }, '📂 Import từ file…'), h('button', { class: 'btn ghost', onclick: () => editDialog('gia_dau', null, { onDone: load }) }, '+ Thêm giá'))),
            table({ columns: [{ key: '_a', label: 'Xóa', render: (r) => h('button', { class: 'btn ghost sm', 'data-act': 'delfuel', title: 'Xóa giá dầu ghi nhầm', onclick: async (e) => { e.stopPropagation(); if (await App.confirmBox('Xóa giá dầu', `Xóa giá dầu ngày ${r.ngay}?`, 'Xóa', 'danger')) { if (await call('catalog.remove', { table: 'gia_dau', id: r.id }, 'Đã xóa')) load(); } } }, '🗑') }, ...pcols], rows: prices, onRow: (r) => editDialog('gia_dau', r, { onDone: load, onDelete: async () => { if (await App.confirmBox('Xóa giá dầu', `Xóa giá dầu ngày ${r.ngay}?`, 'Xóa', 'danger')) { if (await call('catalog.remove', { table: 'gia_dau', id: r.id }, 'Đã xóa')) load(); } } }), wrapClass: 'tall' })));
      };
      async function importFuel() {
        const f = await App.pickFile(); if (!f) return;
        const r = await call('fuel.importPreview', f); if (!r) return;
        const lbl = { NEW: 'Mới', SAME: 'Không đổi', CHANGED: 'Khác giá đã có', INVALID: 'Dòng lỗi', DUP_IN_FILE: 'Trùng trong file' };
        const cb = h('input', { type: 'checkbox' });
        App.modal({ title: `Import giá dầu — sheet "${r.sheet}"`, wide: true,
          body: h('div', {}, h('p', {}, Object.entries(r.counts).map(([k, n]) => `${lbl[k] || k}: ${n}`).join(' · ')),
            r.counts.CHANGED ? h('label', { class: 'row gap-s' }, cb, 'Ghi đè các ngày đã có nhưng khác giá') : null,
            table({ columns: [{ key: 'source_row', label: 'Dòng', num: true }, { key: 'ngay', label: 'Ngày', fmt: 'date' }, { key: 'loai_dau', label: 'Loại dầu' }, { key: 'gia', label: 'Giá', fmt: 'money2' }, { key: 'gia_cu', label: 'Giá đang có', fmt: 'money2' }, { key: 'status', label: 'Kết quả', render: (x) => lbl[x.status] || x.status }], rows: r.rows, wrapClass: 'tall' })),
          actions: [{ label: 'Hủy', primary: false }, { label: 'Ghi giá dầu', onClick: async () => { const x = await call('fuel.importCommit', { token: r.token, overwrite: cb.checked }, 'Đã import giá dầu'); if (!x) return false; App.toast(`Thêm ${x.created}, ghi đè ${x.updated}, bỏ qua ${x.skipped}`); load(); } }] });
      }
      async function preview(k) {
        const p = await call('price.previewFuel', { id: k.id }); if (!p) return;
        App.modal({ title: `Xem trước kỳ ${k.ma_ky} — giá dầu BQ ${fmt.money2(p.ky.gia_dau_binh_quan)} (${p.so_ngay_gia} ngày)`, wide: true,
          body: h('div', {}, table({ columns: [{ key: 'ma_tuyen', label: 'Tuyến', mono: true }, { key: 'gia_cu', label: 'Giá cũ', fmt: 'money' }, { key: 'gia_moi', label: 'Giá mới', fmt: 'money' },
            { key: 'b', label: 'Chi tiết tính', render: (i) => (i.skip ? h('span', { class: 'tag amber' }, i.skip) : h('span', { class: 'mono' }, `${i.breakdown.distanceKm}km × ${i.breakdown.fuelNormPer100km}L/100km = ${fmt.money2(i.breakdown.litres)}L · chênh dầu ${fmt.money2(i.breakdown.fuelDiff)} → điều chỉnh ${fmt.money(i.breakdown.adjustmentFinal)}`)) }], rows: p.items })),
          actions: [{ label: 'Đóng', primary: false }, ...(k.trang_thai === 'NHAP' ? [{ label: 'Duyệt & tạo bảng giá mới', onClick: async () => { const r = await call('price.approveFuel', { id: k.id }, 'Đã duyệt, bảng giá mới đã tạo và tính lại'); if (!r) return false; load(); } }] : [])] });
      }
      async function newPeriod() {
        const f = {}; const mk = (k, l, el) => { f[k] = el; return h('label', { class: 'field' }, l, el); };
        App.modal({ title: 'Kỳ điều chỉnh giá dầu mới', body: h('div', { class: 'form-grid' }, mk('ma_ky', 'Mã kỳ *', h('input', {})), mk('loai_dau', 'Loại dầu *', h('input', { value: 'DO 0,05S-II' })),
          mk('tu', 'Tham chiếu từ ngày *', h('input', { type: 'date' })), mk('den', 'Đến ngày *', h('input', { type: 'date' })), mk('ap', 'Áp dụng từ ngày *', h('input', { type: 'date' })), mk('cv', 'Số công văn', h('input', {}))),
        actions: [{ label: 'Hủy', primary: false }, { label: 'Tạo', onClick: async () => {
          const r = await call('price.createFuelPeriod', { ma_ky: f.ma_ky.value, loai_dau: f.loai_dau.value, tu_ngay_tham_chieu: f.tu.value, den_ngay_tham_chieu: f.den.value, ngay_ap_dung: f.ap.value, so_cong_van: f.cv.value || null }, 'Đã tạo kỳ (nháp)');
          if (!r) return false; load();
        } }] });
      }
      v.append(App.pageHead('Giá dầu & điều chỉnh giá', 'Bình quân giá dầu kỳ tham chiếu → xem trước → duyệt → sinh bảng giá mới'), body);
      await load();
    },
  });
})();
