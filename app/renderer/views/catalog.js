'use strict';
/* Danh mục tuyến (4.4) · Hợp đồng vận chuyển · Đơn giá (4.5) · Nhắc sửa danh mục ở các nhà máy còn lại (chốt 25/09/2026) */
(function () {
  const D = window.DGVC; const { h } = D;
  const syncNote = () => h('p', { class: 'small muted', style: { margin: '6px 0 0' } }, 'Bản cài nào cũng sửa được danh mục. Mỗi lần sửa, APP nhắc sửa giống ở các nhà máy còn lại — xem mục "Nhắc sửa danh mục".');

  // ───────── Tuyến ─────────
  const ROUTE_FIELDS = (isNew) => [
    { key: 'catalogDate', label: 'Ngày cập nhật', type: 'date', hint: isNew ? 'mặc định hôm nay, điền tay được' : 'ngày chỉnh sửa gần nhất (để trống / giữ nguyên = hôm nay khi có sửa)' },
    { key: 'routeCode', label: 'Mã tuyến', required: true, readonly: !isNew, hint: isNew ? 'đã gợi ý mã kế tiếp, sửa được trước khi lưu; sửa giống ở các nhà máy còn lại — không đổi được về sau' : 'không đổi được' },
    { key: 'routeName', label: 'Tên tuyến', required: true, hint: 'vd "Xã Quế Sơn - Tiên Sa"' },
    { key: 'distanceKm', label: 'Cự ly (km)', type: 'number', required: true }, { key: 'tripDistanceKm', label: 'Cự ly chuyến (km)', type: 'number', hint: 'trống = 2 × cự ly (đi + về)' },
    { key: 'uom', label: 'ĐVT tính giá', type: 'select', options: [['TAN', 'Tấn'], ['M3', 'M³']] }, { key: 'catalogUnitCode', label: 'Đơn vị trong bảng giá', type: 'select', options: D.unitOptions(true) },
    { key: 'fromPlace', label: 'Điểm đi (in diễn giải hóa đơn)', full: true, hint: 'trống = phần trước dấu " - " của tên tuyến' },
    { key: 'toPlace', label: 'Điểm đến (in diễn giải hóa đơn)', full: true, hint: 'trống = phần sau dấu " - " của tên tuyến' },
    { key: 'note', label: 'Ghi chú', full: true }, ...(isNew ? [] : [{ key: 'reason', label: 'Lý do (bắt buộc nếu sửa cự ly / ĐVT của tuyến đã dùng ở kỳ đã xác nhận)', full: true }])];
  const routeValues = (r) => ({ routeCode: r.route_code, routeName: r.route_name, distanceKm: r.distance_km, tripDistanceKm: r.trip_distance_km, uom: r.uom, catalogUnitCode: r.catalog_unit_code,
    fromPlace: r.from_place, toPlace: r.to_place, note: r.note, catalogDate: r.catalogDate || r.catalog_date || '' });
  const showReminder = (res) => { for (const w of (res && res.warnings) || []) if (w.code === 'I_SYNC_REMINDER') D.toast(w.message, 'info', 9000); };

  D.views.routes = {
    async render() {
      const inactive = h('input', { type: 'checkbox', id: 'ina' });
      const out = h('div', { class: 'card flush' });
      const sfSlot = h('div');
      let allItems = [];
      let sfState = D.sf ? D.sf.empty() : { q: '', one: {} };
      let sfInfo = { kept: 0, total: 0 };
      let sfMount = null;

      const sfCfg = {
        screenId: 'routes',
        searchPlaceholder: 'Tìm không dấu: mã tuyến, tên tuyến, điểm đi/đến…',
        qAttrs: { 'aria-label': 'Tìm tuyến vận chuyển' },
        quickFields: ['q', 'unit', 'uom'],
        advancedFields: ['q', 'unit', 'uom', 'hasPrice'],
        fields: [
          { key: 'unit', label: 'Lọc theo đơn vị', type: 'enum', options: () => D.unitOptions().map(([c, lbl]) => ({ value: c, label: lbl })), match: (r, v) => r.catalog_unit_code === v },
          { key: 'uom', label: 'Lọc theo ĐVT', type: 'enum', options: [{ value: 'TAN', label: 'Tấn' }, { value: 'M3', label: 'M³' }], match: (r, v) => r.uom === v },
          { key: 'hasPrice', label: 'Chưa có ĐG hiện hành', type: 'bool', match: (r) => !r.activePrice }
        ],
        matchQ: (r, q) => D.sf.hay([r.route_code, r.route_name, r.from_place, r.to_place, r.catalog_unit_code]).indexOf(q) >= 0,
        state: { get: () => sfState, set: (s) => { sfState = s; } },
        dataSource: () => sfInfo,
        onApply: () => draw(),
        onReset: () => draw(),
        scopeFallback: () => 'Tất cả tuyến'
      };

      const draw = () => {
        const res = D.sf ? D.sf.filterRows(allItems, sfCfg, sfState) : { rows: allItems, kept: allItems.length, total: allItems.length };
        sfInfo = { kept: res.kept, total: res.total, unsupported: res.unsupported };
        out.replaceChildren(D.table({ rows: res.rows, onRow: D.writer() ? edit : null, empty: 'Không có tuyến vận chuyển phù hợp bộ lọc', columns: [{ key: 'catalogDate', label: 'Ngày cập nhật', fmt: 'date' }, { key: 'route_code', label: 'Mã tuyến' }, { key: 'route_name', label: 'Tuyến', wrap: true }, { key: 'distance_km', label: 'Cự ly', fmt: 'auto' },
          { key: 'trip_distance_km', label: 'Cự ly chuyến', fmt: 'auto' }, { key: 'uom', label: 'ĐVT' }, { key: 'from_place', label: 'Điểm đi' }, { key: 'to_place', label: 'Điểm đến' }, { key: 'catalog_unit_code', label: 'Đơn vị' },
          { key: 'p', label: 'ĐG ký HĐ hiện hành', num: true, render: (r) => (r.activePrice ? r.activePrice.price_id : h('span', { class: 'tag warn' }, 'chưa có giá')) }, { key: 'usedInPeriods', label: 'Số kỳ đã dùng', fmt: 'int' },
          { key: 'is_active', label: 'Trạng thái', render: (r) => (r.is_active ? D.tag('ACTIVE') : D.tag('CLOSED', 'Ngừng dùng')) }] }));
      };
      const load = async () => {
        const d = await D.api('routes.list', { includeInactive: inactive.checked });
        allItems = d.items || [];
        draw();
        if (sfMount) sfMount.refresh();
      };
      const edit = (r) => D.formModal({ title: `Sửa tuyến ${r.route_code}`, fields: ROUTE_FIELDS(false), values: routeValues(r), submit: async (v) => {
        const { reason, ...record } = v; const res = await D.api('routes.save', { record, rowVersion: r.row_version, reason });
        if (res.affectedPeriods.length) D.toast(`${res.affectedPeriods.length} kỳ nháp dùng tuyến này phải tính lại`, 'info'); showReminder(res); await D.refreshBoot(); load(); } });
      const add = async () => { const next = await D.api('routes.nextCode', {}, { quiet: true }).catch(() => ({ routeCode: '' })); D.formModal({ title: 'Thêm tuyến vận chuyển', fields: ROUTE_FIELDS(true), values: { routeCode: next.routeCode, catalogDate: D.today(), uom: 'TAN', catalogUnitCode: D.state.boot.install.unitCode }, submit: async (v) => {
        const res = await D.api('routes.save', { create: true, record: v }); showReminder(res); D.toast(`Đã thêm tuyến ${res.record.route_code} — nhớ tạo đơn giá cho tuyến`, 'ok'); await D.refreshBoot(); load(); } }); };
      inactive.addEventListener('change', load);
      if (D.smartFilter) {
        sfMount = D.smartFilter.mount(sfCfg);
        sfSlot.append(sfMount.el);
      }
      const page = D.page('Danh mục tuyến', '4 · Danh mục tuyến độc lập — tham chiếu cự ly, ĐVT, điểm đi/đến cho Đơn giá và Hợp đồng', [D.writer() ? h('button', { class: 'btn primary', onclick: add }, 'Thêm tuyến') : null],
        h('div', { class: 'card' },
          sfSlot,
          h('label', { class: 'check', for: 'ina', style: { marginTop: '8px' } }, inactive, 'Hiện cả tuyến ngừng dùng'),
          syncNote()), out);
      await load();
      return page;
    },
  };

  /** Dòng giải thích + liên kết sang màn giá còn lại (DM Đơn giá · Báo cáo giá hợp đồng) — mỗi màn nói rõ vai trò của mình. */
  const PRICE_SCREENS = {
    pricecodes: ['DM Đơn giá', 'Mã đơn giá chính là phương thức tính giá (Đơn giá cố định / Đơn giá điều chỉnh theo giá dầu); mỗi phương thức có bảng Đơn giá theo tuyến. Hợp đồng chọn phương thức khi lập hợp đồng.'],
    basis: ['Báo cáo giá hợp đồng', 'Chỉ xem: giá nào đang được áp cho từng hợp đồng / tuyến / ngày.']
  };
  D.priceScreenNote = (current) => h('p', { class: 'small muted', style: { margin: '0 0 8px' } }, (PRICE_SCREENS[current] || [])[1] || '', ' Xem thêm: ',
    Object.entries(PRICE_SCREENS).filter(([v]) => v !== current).map(([v, [name]], i) => [i ? ' · ' : '', h('button', { class: 'btn small', onclick: () => D.go(v) }, name + ' →')]));

  // ───────── Căn cứ tính giá ký hợp đồng (Tầng A) ─────────
  D.views.basis = {
    async render(p) {
      const f = D.form([{ key: 'contractId', label: 'Hợp đồng', type: 'select', options: [['', '— Bảng giá chung —'], ...D.contractOptions()] },
        { key: 'asOf', label: 'Áp dụng ngày', type: 'date' }], { contractId: p.contractId || '', asOf: p.asOf || D.today() });
      f.className = 'filters';
      const out = h('div');
      const params = () => ({ contractId: f.values().contractId || '', asOf: f.values().asOf || D.today() });
      const save = (fmt) => async () => {
        const v = params(); const def = `CanCuGiaHD_${v.contractId || 'GiaChung'}_${v.asOf}.${fmt.toLowerCase()}`;
        const target = window.dgvc ? await D.pickFile({ title: `Lưu ${fmt}`, save: true, defaultPath: def }) : '';
        if (window.dgvc && !target) return;
        const r = await D.api('reports.export', { report: 'CONTRACT_BASIS', format: fmt, params: v, targetPath: target || undefined });
        D.toast(`Đã xuất ${fmt}: ${r.path}`, 'ok', 8000);
        if (window.dgvc) D.api('system.openPath', { path: r.path }, { quiet: true }).catch(() => {});
      };
      const detail = (r) => (r.fixed ? D.modal({ title: `Đơn giá cố định — ${r.routeCode} · ${r.routeName}`, body: h('ol', { class: 'trace' },
        h('li', {}, h('b', {}, 'ĐƠN GIÁ CỐ ĐỊNH (10)'), h('div', { class: 'f' }, `Bảng giá ${r.priceId} · từ ${D.dmy(r.effectiveFrom)}`), h('div', { class: 'v' }, `= ${D.vn(r.contractPrice)} đ/tấn`)),
        h('li', {}, h('b', {}, 'Hằng kỳ'), h('div', { class: 'f' }, 'Đơn giá vận chuyển = đơn giá cố định; không nhận dầu, không tính chênh lệch dầu'))) }) : D.modal({ title: `Cách tính ĐG ký HĐ — ${r.routeCode} · ${r.routeName}`, wide: true, body: h('ol', { class: 'trace' }, [
        ['Đơn giá cước (1)', 'Bảng giá ' + r.priceId, r.newPrice, 'đ/' + (r.uom === 'M3' ? 'm³' : 'tấn')],
        [r.uom === 'M3' ? 'Thể tích TB (2)' : 'KL trung bình / chuyến (2)', 'Bảng giá', r.uom === 'M3' ? r.avgVolumeM3 : r.avgLoadTon, r.uom === 'M3' ? 'm³' : 'tấn'],
        ['ĐG 1 chuyến (3) = (1) × (2)', `${D.vn(r.newPrice)} × ${D.vnAuto(r.uom === 'M3' ? r.avgVolumeM3 : r.avgLoadTon)}`, r.tripPrice, 'đ'],
        ['Dầu / chuyến (5) = Cự ly chuyến × Định mức (4)', `${D.vn(r.tripDistanceKm)} km × ${D.vn(r.fuelNormLPerKm, 1)} lít/km`, r.fuelPerTrip, 'lít'],
        ['Tiền dầu / chuyến (7) = (5) × ĐG dầu (6)', `${D.vnAuto(r.fuelPerTrip)} × ${D.vn(r.fuelPriceCatalog)}`, r.fuelCostPerTrip, 'đ'],
        ['Tỷ lệ dầu (8) = (7) / (3)', `${D.vn(r.fuelCostPerTrip)} / ${D.vn(r.tripPrice)}`, Math.round(r.fuelCostRatio * 10000) / 100, '%'],
        ['ĐGVC chưa dầu (9) = [(3) − (7)] / KL_TB', `(${D.vn(r.tripPrice)} − ${D.vn(r.fuelCostPerTrip)}) / ${D.vn(r.avgLoadTon)}`, Math.round(r.priceNoDiesel * 100) / 100, 'đ'],
        ['ĐƠN GIÁ KÝ HỢP ĐỒNG (10) = làm tròn (9) đến hàng nghìn', `${D.vn(r.priceNoDiesel, 2)} → làm tròn`, r.contractPrice, 'đ'],
      ].map(([l, e, v, u]) => h('li', {}, h('b', {}, l), h('div', { class: 'f' }, e), h('div', { class: 'v' }, `= ${D.vnAuto(v)} ${u}`)))) }));
      const load = async () => {
        const d = await D.api('reports.contractBasis', params());
        out.innerHTML = '';
        out.append(h('div', { class: 'kpis' },
          h('div', { class: 'kpi' }, h('div', { class: 'v' }, D.vn(d.rows.length)), h('div', { class: 'l' }, 'Tuyến đang có giá')),
          h('div', { class: 'kpi' }, h('div', { class: 'v' }, D.dmy(d.asOf)), h('div', { class: 'l' }, 'Áp dụng ngày')),
          h('div', { class: 'kpi main' }, h('div', { class: 'v' }, d.contract ? d.contract.code : 'Giá chung'), h('div', { class: 'l' }, d.contract ? 'Hợp đồng' : 'Bảng giá'))));
        // tuyến đơn giá cố định: các cột phần dầu ghi "—"
        const FUELCOL = new Set(['newPrice', 'l', 'tripPrice', 'fuelNormLPerKm', 'fuelPerTrip', 'fuelPriceCatalog', 'fuelCostPerTrip', 'x', 'priceNoDiesel']);
        const dash = (cols) => cols.map((c) => (FUELCOL.has(c.key) ? { ...c, fmt: undefined, num: true, render: (r) => (r.fixed ? h('span', { class: 'muted' }, '—') : c.render ? c.render(r) : D.vn(r[c.key])) } : c));
        out.append(h('div', { class: 'card flush' }, D.table({ rows: d.rows, onRow: detail, columns: dash([
          { key: 'routeCode', label: 'Mã' }, { key: 'routeName', label: 'Tuyến', wrap: true }, { key: 'tripDistanceKm', label: 'Cự ly chuyến', fmt: 'int' }, { key: 'uom', label: 'ĐVT' },
          { key: 'newPrice', label: '(1) ĐG cước', fmt: 'money' }, { key: 'l', label: '(2) KL TB', num: true, render: (r) => (r.uom === 'M3' ? `${D.vn(r.avgVolumeM3, 2)} m³` : D.vn(r.avgLoadTon)) },
          { key: 'tripPrice', label: '(3) ĐG 1 chuyến', fmt: 'money' }, { key: 'fuelNormLPerKm', label: '(4) Định mức', num: true, render: (r) => D.vn(r.fuelNormLPerKm, 1) },
          { key: 'fuelPerTrip', label: '(5) Dầu/chuyến', num: true, render: (r) => D.vn(r.fuelPerTrip, 1) }, { key: 'fuelPriceCatalog', label: '(6) ĐG dầu', fmt: 'money' },
          { key: 'fuelCostPerTrip', label: '(7) Tiền dầu', fmt: 'money' }, { key: 'x', label: '(8) Tỷ lệ', num: true, render: (r) => `${D.vn(r.fuelCostRatio * 100, 2)}%` },
          { key: 'priceNoDiesel', label: '(9) Chưa dầu', num: true, render: (r) => D.vn(r.priceNoDiesel, 2) },
          { key: 'contractPrice', label: '(10) ĐG ký HĐ', num: true, render: (r) => h('span', { class: 'money' }, D.vn(r.contractPrice)) },
          { key: 'priceId', label: 'Bảng giá', render: (r) => h('span', {}, h('span', { class: 'mono small' }, r.priceId), r.source === 'Giá riêng hợp đồng' ? [' ', D.tag('info', 'giá riêng HĐ')] : '', r.fixed ? [' ', D.tag('info', 'giá cố định')] : '') }]) })));
        out.append(h('div', {},
          h('div', { class: 'card' }, h('h2', {}, 'Cách tính'), h('ol', { class: 'trace' },
            h('li', {}, h('b', {}, '(3) ĐG 1 chuyến = (1) Đơn giá cước × (2) KL trung bình')),
            h('li', {}, h('b', {}, '(7) Tiền dầu / chuyến = Cự ly chuyến × (4) Định mức × (6) ĐG dầu chưa VAT')),
            h('li', {}, h('b', {}, '(9) ĐGVC chưa dầu = [(3) − (7)] / KL_TB')),
            h('li', {}, h('b', {}, '(10) ĐƠN GIÁ KÝ HỢP ĐỒNG = làm tròn (9) đến hàng nghìn'), h('div', { class: 'f' }, 'Ghi vào hợp đồng — chưa gồm nhiên liệu. Hằng kỳ cộng chênh lệch dầu theo dầu thực nhận.'))),
            h('p', { class: 'small muted' }, 'Bấm vào 1 tuyến để xem thay số. Muốn thử phương án giá: Xuất Excel — file có công thức, sửa ô xanh là tự tính lại.'))));
      };
      const page = D.page('Báo cáo giá hợp đồng', 'Kết xuất · Đơn giá ký hợp đồng (chưa gồm nhiên liệu) theo từng tuyến', [
        h('button', { class: 'btn', onclick: async () => { await D.api('reports.print', { report: 'CONTRACT_BASIS', params: params() }); } }, 'In'),
        h('button', { class: 'btn', onclick: save('PDF') }, 'Xuất PDF'), h('button', { class: 'btn primary', onclick: save('XLSX') }, 'Xuất Excel (có công thức)')],
      h('div', { class: 'card' }, D.priceScreenNote('basis'), h('div', { class: 'filters' }, f, h('button', { class: 'btn primary', onclick: load }, 'Xem'))), out);
      f.addEventListener('change', load);
      await load();
      return page;
    },
  };

  /** Ô nhập của dòng giá — dùng chung màn Đơn giá và màn Mã đơn giá (một định nghĩa, nhãn thống nhất). */
  D.priceFormFields = () => [{ key: 'priceMethod', label: 'Phương thức đơn giá', type: 'select', full: true, options: [['THEO_DAU', 'Theo giá dầu — ĐG ký HĐ + chênh lệch dầu thực nhận (cách cũ)'], ['CO_DINH', 'Đơn giá cố định (đ/tấn, đ/m³) — không nhận dầu, không tính chênh lệch dầu']] },
        { key: 'effectiveFrom', label: 'Hiệu lực từ ngày', type: 'date', required: true }, { key: 'contractId', label: 'Giá riêng cho hợp đồng', type: 'select', options: [['', '— giá chung —'], ...D.contractOptions()] },
        { key: 'fixedPrice', label: 'Đơn giá cố định (chưa VAT) [đ/tấn hoặc đ/m³]', money: true, hint: 'dùng nguyên số này làm đơn giá vận chuyển mọi kỳ — theo ĐVT của tuyến (Tấn hoặc M³)' },
        { key: 'newPrice', label: 'Đơn giá cước dự kiến (chưa VAT) [đ/tấn hoặc đ/m³]', money: true, required: true, hint: 'gồm dầu theo định mức; dùng tính ra ĐG dự kiến tham khảo' },
        { key: 'contractPrice', label: 'Đơn giá ký hợp đồng (chốt) [đ/tấn hoặc đ/m³]', money: true, hint: 'mặc định tự động tính theo công thức làm tròn; nếu không phù hợp thì điền thủ công' },
        { key: 'basePriceExclVat', label: 'Đơn giá tham khảo (chưa VAT)', money: true, hint: 'không dùng tính — chỉ để đối chiếu' },
        { key: 'basePriceSource', label: 'Nguồn đơn giá tham khảo', full: true, hint: 'bắt buộc khi có đơn giá tham khảo — vd: File Excel … · bảng … · cột … · ngày …' },
        { key: 'fuelPriceExclVat', label: 'ĐG dầu chưa VAT (danh mục)', money: true, required: true }, { key: 'fuelNormLPerKm', label: 'Định mức dầu (lít/km)', type: 'number', required: true, hint: '0,4 lít/km = 40 lít/100 km' },
        { key: 'avgLoadTon', label: 'KL trung bình (tấn)', type: 'number', required: true }, { key: 'avgVolumeM3', label: 'Thể tích TB (m³) — tuyến M3', type: 'number' }, { key: 'sourceNote', label: 'Căn cứ', full: true }];

  // ───────── Đơn giá (Theo dõi Cha–Con: Mã đơn giá → Đơn giá có cột Tuyến) ─────────
  D.views.prices = {
    async render(p) {
      const pcs = await D.api('pricecodes.list', {}, { quiet: true }).catch(() => ({ items: [] }));
      let activeCode = p.priceCode !== undefined ? p.priceCode : ((pcs.items || []).some((c) => c.price_code === 'PT-TD') ? 'PT-TD' : '');
      const selCode = h('select', { 'aria-label': 'Mã đơn giá (Bảng cha)' },
        h('option', { value: '', selected: !activeCode }, '— Giá chung / Giá riêng HĐ (Cách cũ) —'),
        (pcs.items || []).map((c) => h('option', { value: c.price_code, selected: c.price_code === activeCode }, `${c.price_code} · ${c.price_name} (${c.priceMethodLabel} · ${c.unit_code})`))
      );
      const sel = h('select', { 'aria-label': 'Tuyến' },
        ...D.routeOptions(false).map(([v, t]) => h('option', { value: v, selected: v === (p.routeCode || 'VC.007') }, t)),
        h('option', { value: '' }, '— Tất cả tuyến —')
      );
      const parentBar = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '8px 0' } });
      const out = h('div');
      const PF = D.priceFormFields();
      const routeNameOf = (rc) => ((D.state.boot.routes || []).find((x) => x.route_code === rc) || {}).route_name || '';

      const drawParentChips = () => {
        parentBar.replaceChildren(
          h('button', { class: `btn small${!activeCode ? ' primary' : ''}`, onclick: () => { activeCode = ''; selCode.value = ''; load(); } }, 'Bảng giá chung (Cách cũ)'),
          ...(pcs.items || []).map((c) => h('button', {
            class: `btn small${activeCode === c.price_code ? ' primary' : ''}`,
            onclick: () => { activeCode = c.price_code; selCode.value = c.price_code; sel.value = ''; load(); }
          }, `${c.price_code} (${c.lineCount} ĐG)`)),
          h('button', { class: 'btn small', style: { marginLeft: 'auto' }, onclick: () => D.go('pricecodes', { code: activeCode }) }, 'Quản lý Mã đơn giá (Cha) →')
        );
      };

      const load = async () => {
        drawParentChips();
        let rows = [];
        if (activeCode) {
          const g = await D.api('pricecodes.get', { priceCode: activeCode });
          rows = (g.lines || []).filter((r) => !sel.value || r.route_code === sel.value).map((r) => ({
            ...r,
            contractPrice: r.price_method === 'CO_DINH' ? r.fixed_price : r.contractPrice
          }));
        } else {
          const d = await D.api('prices.list', sel.value ? { routeCode: sel.value } : {});
          rows = d.items || [];
        }
        out.innerHTML = '';
        out.append(h('div', { class: 'card flush' }, D.table({ rows, onRow: (r) => (r.status === 'DRAFT' && D.writer() ? draft(r) : null), columns: [
          { key: 'price_code', label: 'Mã đơn giá (Cha)', render: (r) => (r.price_code ? D.tag('info', r.price_code) : h('span', { class: 'small muted' }, 'Giá chung')) },
          { key: 'route_code', label: 'Tuyến', render: (r) => h('b', { class: 'mono' }, r.route_code) },
          { key: 'rn', label: 'Tên tuyến', wrap: true, render: (r) => r.routeName || routeNameOf(r.route_code) },
          { key: 'price_id', label: 'Phiên bản' }, { key: 'contract_id', label: 'Hợp đồng' },
          { key: 'effective_from', label: 'Từ ngày', fmt: 'date' }, { key: 'effective_to', label: 'Đến ngày', fmt: 'date' }, { key: 'status', label: 'Trạng thái', fmt: 'tag' },
          { key: 'price_method', label: 'Phương thức', render: (r) => (r.price_method === 'CO_DINH' ? D.tag('info', 'Cố định') : h('span', { class: 'small muted' }, 'Điều chỉnh dầu')) },
          { key: 'new_price', label: 'ĐG ký HĐ dự kiến', num: true, render: (r) => (r.price_method === 'CO_DINH' ? '—' : D.vnAuto(r.new_price)) },
          { key: 'base_price_excl_vat', label: 'ĐG tham khảo', fmt: 'auto' }, { key: 'base_price_source', label: 'Nguồn tham khảo', wrap: true },
          ...[['fuel_price_excl_vat', 'ĐG dầu DM'], ['fuel_norm_l_per_km', 'ĐM (l/km)'], ['avg_load_ton', 'KL_TB']].map(([key, label]) => ({ key, label, num: true, render: (r) => (r.price_method === 'CO_DINH' ? '—' : D.vnAuto(r[key])) })),
          { key: 'contractPrice', label: 'ĐG ký HĐ / cố định', num: true, render: (r) => h('span', { class: 'money' }, D.vn(r.contractPrice)) }, { key: 'is_used', label: 'Đã dùng', fmt: 'bool' }] })));
      };
      const previewBox = h('div', { class: 'card' });
      const FUEL_KEYS = ['newPrice', 'basePriceExclVat', 'basePriceSource', 'fuelPriceExclVat', 'fuelNormLPerKm', 'avgLoadTon', 'avgVolumeM3'];
      const draftForm = (values, onSave) => {
        const f = D.form(PF, { priceMethod: 'THEO_DAU', ...values });
        // chỉ hiện ô của phương thức đang chọn
        const toggle = () => { const fixed = f.inputs.priceMethod.value === 'CO_DINH';
          for (const k of FUEL_KEYS) f.inputs[k].closest('label').style.display = fixed ? 'none' : '';
          f.inputs.fixedPrice.closest('label').style.display = fixed ? '' : 'none'; };
        f.inputs.priceMethod.addEventListener('change', toggle); toggle();
        const pv = async () => { try { const x = await D.api('prices.preview', { record: { routeCode: sel.value, ...f.values() } }, { quiet: true });
          previewBox.innerHTML = '';
          if (x.priceMethod === 'CO_DINH') {
            previewBox.append(h('h2', {}, 'Xem trước — đơn giá cố định'), h('p', {}, 'Đơn giá vận chuyển mọi kỳ = ', h('span', { class: 'money', style: { fontSize: '20px' } }, D.vn(x.contractPrice)), ' đ/tấn'),
              h('p', { class: 'small muted' }, 'Tuyến không nhận dầu: kỳ tính có dòng dầu của tuyến này sẽ báo lỗi để kiểm tra. Không dùng định mức, giá dầu, KL trung bình.'),
              x.current ? h('p', { class: 'muted' }, `Bản đang dùng ${x.current.priceId}: ${D.vn(x.current.contractPrice)}`) : '');
            return;
          }
          previewBox.append(h('h2', {}, 'Xem trước Tầng A'), h('ol', { class: 'trace' }, [['ĐG 1 chuyến', x.tripPrice], ['Tiêu hao / chuyến (lít)', x.fuelPerTrip], ['Tiền dầu / chuyến', x.fuelCostPerTrip], ['ĐGVC chưa diesel', x.priceNoDiesel]].map(([l, v]) => h('li', {}, l, ': ', h('b', { class: 'mono' }, D.vnAuto(Math.round(v * 100) / 100))))),
            h('p', {}, 'ĐG ký HĐ = ', h('span', { class: 'money', style: { fontSize: '20px' } }, D.vn(x.contractPrice)), x.current ? h('span', { class: 'muted' }, ` (bản đang dùng ${x.current.priceId}: ${D.vn(x.current.contractPrice)})`) : ''));
        } catch (e) { previewBox.innerHTML = ''; previewBox.append(h('p', { class: 'muted' }, e.message)); } };
        f.addEventListener('input', () => { clearTimeout(f._t); f._t = setTimeout(pv, 300); });
        setTimeout(pv);
        return f;
      };
      const create = () => {
        const cur = D.state.boot.routes.find((r) => r.route_code === sel.value);
        D.api('prices.list', { routeCode: sel.value }).then((d) => {
          const last = d.items.filter((x) => x.status !== 'DRAFT').pop() || {};
          const f = draftForm({ priceMethod: last.price_method || 'THEO_DAU', fixedPrice: last.fixed_price, newPrice: last.new_price || '', basePriceExclVat: last.base_price_excl_vat, basePriceSource: last.base_price_source, fuelPriceExclVat: last.fuel_price_excl_vat, fuelNormLPerKm: last.fuel_norm_l_per_km || 0.4, avgLoadTon: last.avg_load_ton, avgVolumeM3: last.avg_volume_m3, effectiveFrom: D.today() });
          D.modal({ title: `Công thức tính đơn giá mới — ${sel.value}${cur ? ` · ${cur.route_name}` : ''}`, wide: true, body: h('div', { class: 'grid g2' }, f, previewBox), actions: [{ label: 'Hủy', run: () => true },
            { label: 'Lưu bản nháp', primary: true, run: async () => { await D.api('prices.createVersion', { record: { routeCode: sel.value, ...f.values() } }); D.toast('Đã lưu bản nháp — bấm vào bản nháp để kích hoạt', 'ok'); load(); } }] });
        });
      };
      const draft = (r) => {
        const f = draftForm({ priceMethod: r.price_method || 'THEO_DAU', fixedPrice: r.fixed_price, effectiveFrom: r.effective_from, contractId: r.contract_id, basePriceExclVat: r.base_price_excl_vat, basePriceSource: r.base_price_source, newPrice: r.new_price, fuelPriceExclVat: r.fuel_price_excl_vat, fuelNormLPerKm: r.fuel_norm_l_per_km, avgLoadTon: r.avg_load_ton, avgVolumeM3: r.avg_volume_m3, sourceNote: r.source_note });
        D.modal({ title: `Bản nháp ${r.price_id}`, wide: true, body: h('div', { class: 'grid g2' }, f, previewBox), actions: [{ label: 'Lưu nháp', run: async () => { const { contractId, ...rec } = f.values(); await D.api('prices.updateDraft', { priceId: r.price_id, record: rec, rowVersion: r.row_version }); load(); } },
          { label: 'Kích hoạt', primary: true, run: async () => { if (!(await D.confirm({ title: 'Kích hoạt giá mới', message: `Áp dụng từ ${D.dmy(r.effective_from)}; bản giá trước tự đóng ngày hôm trước. Không sửa được sau khi đã dùng.` }))) return false;
            const x = await D.api('prices.activate', { priceId: r.price_id, rowVersion: r.row_version }); for (const w of x.warnings || []) D.toast(w.message, 'info', 9000); if (x.affectedPeriods.length) D.toast(`${x.affectedPeriods.length} kỳ nháp phải tính lại`, 'info'); load(); } }] });
      };
      sel.addEventListener('change', load);
      selCode.addEventListener('change', () => { activeCode = selCode.value; if (activeCode) sel.value = ''; load(); });
      const page = D.page('Đơn giá', '5 · Theo dõi Cha–Con: Mã đơn giá → Đơn giá theo tuyến', [D.writer() ? h('button', { class: 'btn primary', onclick: create }, 'Tạo công thức tính đơn giá mới') : null],
        h('div', { class: 'card' },
          D.priceScreenNote('prices'),
          parentBar,
          h('div', { class: 'filters', style: { marginTop: '8px' } },
            h('label', { class: 'field wide' }, h('span', {}, 'Mã đơn giá (Bảng cha)'), selCode),
            h('label', { class: 'field wide' }, h('span', {}, 'Tuyến'), sel)
          ),
          syncNote(),
          h('p', { class: 'small muted', style: { margin: '4px 0 0' } }, D.tag('mute', 'Cách cũ'), ' Giá chung / giá riêng hợp đồng (cách cũ) — giá theo hình thức (Đơn giá cố định / Đơn giá điều chỉnh dầu) quản lý theo bảng cha–con ở mục "Mã đơn giá". Hợp đồng không gán mã vẫn tính bằng giá ở màn này.')
        ), out);
      await load();
      return page;
    },
  };

  // ───────── Hợp đồng ─────────
  // canParties: hợp đồng chưa có kỳ tính / dòng dầu → sửa được mã HĐ và hai bên (bản 1.2.4)
  const CF = (isNew, canParties = isNew) => [
    { key: 'contractCode', label: 'Mã hợp đồng', required: true, readonly: !canParties, hint: 'vd DH-HAKQN' }, { key: 'contractNo', label: 'Số hợp đồng (tự điền)' },
    { key: 'carrierUnitCode', label: 'Bên vận chuyển', type: 'select', options: D.unitOptions(), readonly: !canParties }, { key: 'customerUnitCode', label: 'Bên thuê', type: 'select', options: D.unitOptions(), readonly: !canParties },
    { key: 'effectiveFrom', label: 'Hiệu lực từ', type: 'date', required: true }, { key: 'effectiveTo', label: 'Hiệu lực đến', type: 'date' },
    { key: 'signPlace', label: 'Nơi lập BKVC', hint: 'vd Quế Sơn Trung' }, { key: 'reportTitle', label: 'Tiêu đề BKVC' },
    { key: 'carrierPrintName', label: 'Tên bên vận chuyển in trên chứng từ', hint: 'trống = "Tên ghi trên chứng từ" của đơn vị' }, { key: 'customerPrintName', label: 'Tên bên thuê in trên chứng từ', hint: 'trống = "Tên ghi trên chứng từ" của đơn vị' },
    { key: 'serviceDesc', label: 'Mẫu diễn giải cước để viết hóa đơn', type: 'textarea', full: true, hint: 'Chỗ trống: {BKS} {DIEM_DI} {DIEM_DEN} {TUYEN} {MA_TUYEN} {TU_NGAY} {DEN_NGAY}. Trống = mẫu chung "Cước vận chuyển dăm gỗ từ {DIEM_DI} đến {DIEM_DEN} bằng xe thùng BKS : {BKS}"' },
    { key: 'note', label: 'Ghi chú', full: true }];
  const cVal = (c) => ({ contractCode: c.contract_code, contractNo: c.contract_no, carrierUnitCode: c.carrier_unit_code, customerUnitCode: c.customer_unit_code, effectiveFrom: c.effective_from, effectiveTo: c.effective_to,
    signPlace: c.sign_place, reportTitle: c.report_title, carrierPrintName: c.carrier_print_name, customerPrintName: c.customer_print_name, serviceDesc: c.service_desc, note: c.note });

  D.views.contracts = {
    // Màn Hợp đồng kiểu cha–con (1.8.x): trái = danh sách hợp đồng (lọc), phải = chi tiết hợp đồng đang chọn với các thẻ Thông tin · Xe của hợp đồng · Tuyến và đơn giá vận chuyển · Kỳ tính.
    async render(p) {
      const w = D.writer(); const guard = D.latest(); const me = D.state.boot.install.unitCode;
      let sel = p.contractId || ''; let tab = 'info'; let items = []; let drawingId = ''; let cur = null; // cur = chi tiết đang mở {id, code, f, vehTxt, snapF, snapV, setTab}: dựng 1 lần / hợp đồng, đổi thẻ chỉ ẩn/hiện (không mất chữ đang gõ)
      const fStatus = h('select', { 'aria-label': 'Trạng thái hợp đồng' }, h('option', { value: 'active' }, 'Đang dùng'), h('option', { value: 'all' }, 'Tất cả'));
      const fRole = h('select', { 'aria-label': 'Vai trò bản cài' }, h('option', { value: '' }, 'Mọi vai trò'), h('option', { value: 'CARRIER' }, 'Bên vận chuyển'), h('option', { value: 'CUSTOMER' }, 'Bên thuê'));
      const fQ = h('input', { type: 'search', placeholder: 'Tìm mã / công ty…', 'aria-label': 'Tìm hợp đồng' });
      const listBox = h('div', { class: 'ct-items' }); const detail = h('section', { class: 'ct-detail', 'aria-live': 'polite' });
      const layout = h('div', { class: 'ct-layout' }, h('aside', { class: 'card ct-list', 'aria-label': 'Danh sách hợp đồng' }, h('div', { class: 'ct-filters' }, fStatus, fRole, fQ), listBox), detail);
      const crumb = () => `Danh mục › Hợp đồng${sel ? ` › ${(items.find((x) => x.contract_id === sel) || {}).contract_code || sel}` : ''}`;
      const syncCrumb = () => { const c = page.querySelector('.crumb'); if (c) c.textContent = crumb(); layout.dataset.sel = sel ? '1' : ''; };
      const drawList = () => {
        const q = fQ.value.trim().toLowerCase();
        const rows = items.filter((c) => (fStatus.value === 'all' || c.is_active) && (!fRole.value || c.role === fRole.value) && (!q || `${c.contract_code} ${c.contract_no || ''} ${c.carrier_unit_code} ${c.customer_unit_code}`.toLowerCase().includes(q)));
        listBox.replaceChildren(...(rows.length ? rows.map((c) => h('button', { class: 'pc-code', 'aria-current': String(c.contract_id === sel), onclick: () => choose(c.contract_id) },
          h('span', { class: 'mono' }, c.contract_code), h('span', { class: 'small muted' }, ` ${c.carrier_unit_code} → ${c.customer_unit_code}${c.role === 'CUSTOMER' ? ' (bên thuê)' : ''}`), c.is_active ? null : h('span', { class: 'tag mute', style: { marginLeft: '6px' } }, 'ngừng'))) : [h('p', { class: 'small muted' }, 'Không có hợp đồng phù hợp bộ lọc.')]));
      };
      const reload = async (keep = sel) => { const d = await D.api('contracts.list'); items = d.items; if (keep && !items.some((c) => c.contract_id === keep)) sel = ''; drawList(); syncCrumb(); };
      const isDirty = () => !!cur && w && (JSON.stringify(cur.f.values()) !== cur.snapF || cur.vehTxt.value !== cur.snapV);
      const askDiscard = () => (!isDirty() ? true : D.confirm({ title: 'Bỏ thay đổi chưa lưu?', message: `Hợp đồng ${cur.code} có thay đổi chưa lưu (thông tin hoặc phạm vi xe). Bỏ các thay đổi này?`, okLabel: 'Bỏ thay đổi', danger: true }).then((x) => !!x)); // không có gì chưa lưu → trả true ngay (không đổi nhịp điều hướng)
      D.leaveGuard = askDiscard; // rời màn (menu, "Mở kỳ"…) khi còn thay đổi chưa lưu → hỏi trước
      const choose = async (id, t0) => {
        if (id !== sel && !(await askDiscard())) return;
        sel = id; if (t0) tab = t0; drawList(); syncCrumb();
        if (cur && cur.id === sel) { if (t0) cur.setTab(t0); return; } // bấm lại đúng hợp đồng đang mở: không dựng lại
        await drawDetail();
      };
      const back = async (keep) => { await D.refreshBoot(); await reload(); await drawDetail(true, keep); };
      // rà soát 1.8.2: lưu ở MỘT thẻ thì dựng lại chi tiết nhưng GIỮ phần chưa lưu của thẻ kia (vẫn tính là chưa lưu → rời màn vẫn hỏi)
      const formRaw = (f) => Object.fromEntries(Object.entries(f.inputs).map(([k, el]) => [k, el.type === 'checkbox' ? el.checked : el.value]));
      const keepOther = (which) => (!cur ? {} : which === 'info'
        ? (cur.vehTxt.value !== cur.snapV ? { veh: cur.vehTxt.value } : {})
        : (JSON.stringify(cur.f.values()) !== cur.snapF ? { form: formRaw(cur.f) } : {}));

      async function drawDetail(force = false, keep = {}) {
        if (!force && sel && drawingId === sel) return; // đang dựng đúng hợp đồng này
        const tok = guard.next(); drawingId = sel; const myId = sel;
        const c = items.find((x) => x.contract_id === sel);
        if (!c) { drawingId = ''; cur = null; detail.replaceChildren(h('div', { class: 'card' }, h('h2', {}, 'Chọn một hợp đồng'), h('p', { class: 'muted' }, 'Bấm một hợp đồng ở danh sách để xem / sửa thông tin, phạm vi xe, tuyến và đơn giá vận chuyển, các kỳ tính.'), syncNote())); return; }
        const failed = (e) => { if (drawingId === myId) drawingId = ''; throw e; };
        const [signers, veh, use, rp, fs, periods, allVeh] = await Promise.all([D.api('contracts.resolveSigners', { contractId: c.contract_id }), D.api('contracts.vehicles', { contractId: c.contract_id }), D.api('contracts.usage', { contractId: c.contract_id }),
          D.api('contracts.routePrices', { contractId: c.contract_id }, { quiet: true }).catch(() => ({ items: [] })), D.api('contracts.fuelStats', { contractId: c.contract_id }, { quiet: true }).catch(() => ({ items: [], totals: { receipts: 0, liters: 0, amount: 0 } })), D.api('periods.list', { contractId: c.contract_id }, { quiet: true }).catch(() => ({ items: [] })),
          D.api('vehicles.list', {}, { quiet: true }).catch(() => ({ items: [] }))]).catch(failed);
        const vehMap = Object.fromEntries((allVeh.items || []).map((v) => [v.plate_no, v]));
        if (!guard.ok(tok)) { if (drawingId === myId) drawingId = ''; return; } // người dùng đã chọn hợp đồng khác trong lúc chờ
        const f = D.form(CF(false, w && use.canEditParties).map((x) => (w ? x : { ...x, readonly: true })), cVal(c)); // XEM: chỉ đọc
        const usageNote = h('p', { class: 'small', style: { margin: '0 0 12px' } }, use.canEditParties
          ? [D.tag('ok', 'Chưa dùng'), ' Hợp đồng chưa có kỳ tính, chưa có dòng dầu — sửa được cả mã hợp đồng, bên vận chuyển, bên thuê; xóa được nếu nhập nhầm.']
          : [D.tag('info', 'Đã dùng'), ` Hợp đồng đã có ${use.blockers.join(', ')} — sửa được số HĐ, ngày hiệu lực, tên in, người ký, phạm vi xe; KHÔNG đổi mã / hai bên và không xóa. Nhập nhầm thì thêm hợp đồng đúng rồi bấm "Ngừng dùng".`]);
        // ── Thẻ "Tuyến và đơn giá vận chuyển": MỘT bảng tuyến + đơn giá đang áp dụng; chỉ có nút "Thêm đơn giá" ──
        const SRC_TXT = { HOP_DONG: 'Giá riêng HĐ', PHUONG_THUC: 'Theo phương thức', CHUNG: 'Giá chung cũ' };
        const priceTxt = (x) => `${x.priceMethodLabel} · ${x.contractPrice != null ? D.vn(x.contractPrice) : '—'} đ/${x.uom || 'tấn'}`;
        const refreshPrice = () => back(keepOther('price'));
        const afterChange = (r, text) => {
          D.toast(text, 'ok');
          if (r && r.affectedPeriods && r.affectedPeriods.length) D.toast(`${r.affectedPeriods.length} kỳ nháp của hợp đồng dùng tuyến này phải tính lại`, 'info', 8000);
          showReminder(r);
        };
        const removePrice = async (x) => {
          if (!(await D.confirm({ title: 'Gỡ đơn giá', message: `Gỡ đơn giá riêng của tuyến ${x.routeCode} khỏi hợp đồng ${c.contract_code}? Tuyến sẽ dùng lại đơn giá trước đó (nếu có).`, okLabel: 'Gỡ', danger: true }))) return;
          const r = await D.api('contracts.removePrice', { contractId: c.contract_id, priceId: x.priceId });
          afterChange(r, `Đã gỡ đơn giá tuyến ${x.routeCode} khỏi hợp đồng ${c.contract_code}`);
          await refreshPrice();
        };
        const addPriceModal = async () => {
          const all = (await D.api('contracts.priceChoices', { contractId: c.contract_id })).items || [];
          const withPrice = new Set(all.map((x) => x.routeCode));
          const selRoute = h('select', { 'aria-label': 'Tuyến' }, h('option', { value: '' }, '-- Chọn tuyến --'),
            ...(D.state.boot.routes || []).map((r) => h('option', { value: r.route_code }, `${r.route_code} · ${r.route_name}${withPrice.has(r.route_code) ? '' : ' (chưa có đơn giá)'}`)));
          const selPrice = h('select', { 'aria-label': 'Đơn giá' });
          const from = h('input', { type: 'date', value: D.today(), 'aria-label': 'Hiệu lực từ' });
          const hint = h('p', { class: 'small muted', style: { margin: '0 0 8px' } });
          const drawPrices = (keepId) => {
            const rc = selRoute.value; const list = all.filter((x) => !rc || x.routeCode === rc);
            selPrice.replaceChildren(h('option', { value: '' }, list.length ? '-- Chọn đơn giá --' : '-- Chưa có đơn giá đang áp dụng --'),
              ...list.map((x) => h('option', { value: x.priceId, selected: x.priceId === keepId }, `${rc ? '' : `${x.routeCode} · `}${priceTxt(x)} · hiệu lực từ ${x.effectiveFrom}${x.chosenForContract ? ' · tuyến đã có giá riêng' : ''}`)));
            if (!keepId && list.length === 1) selPrice.value = list[0].priceId;
            hint.textContent = rc && !list.length ? `Tuyến ${rc} chưa có đơn giá đang áp dụng — tạo đơn giá ở màn DM Đơn giá trước.` : (rc ? `${list.length} đơn giá đang áp dụng của tuyến ${rc}.` : 'Chưa chọn tuyến: liệt kê mọi đơn giá chọn được; chọn đơn giá thì tuyến tự điền.');
          };
          selRoute.addEventListener('change', () => drawPrices(''));
          selPrice.addEventListener('change', () => { const x = all.find((y) => y.priceId === selPrice.value); if (x) { selRoute.value = x.routeCode; drawPrices(x.priceId); } });
          drawPrices('');
          D.modal({ title: `Thêm đơn giá cho hợp đồng ${c.contract_code}`, wide: false,
            body: h('div', {},
              h('p', { class: 'small muted', style: { margin: '0 0 8px' } }, 'Chọn tuyến rồi chọn đơn giá của tuyến, hoặc chọn đơn giá trước — tuyến sẽ tự điền. Đơn giá áp dụng cho hợp đồng từ ngày hiệu lực.'),
              h('label', { class: 'field' }, h('span', {}, 'Tuyến'), selRoute),
              hint,
              h('label', { class: 'field' }, h('span', {}, 'Đơn giá'), selPrice),
              h('label', { class: 'field' }, h('span', {}, 'Hiệu lực từ'), from)),
            actions: [{ label: 'Hủy', run: () => true }, { label: 'Lưu', primary: true, run: async () => {
              if (!selPrice.value) { D.toast('Chọn đơn giá cần thêm', 'err'); return false; }
              if (!from.value) { D.toast('Nhập ngày hiệu lực', 'err'); return false; }
              const r = await D.api('contracts.addPrice', { contractId: c.contract_id, routeCode: selRoute.value, priceId: selPrice.value, effectiveFrom: from.value });
              afterChange(r, `Đã thêm đơn giá tuyến ${r.record.route_code} cho hợp đồng ${c.contract_code}`);
              setTimeout(refreshPrice);
              return true;
            } }] });
        };
        const rpCols = [
          { key: 'routeCode', label: 'Tuyến', render: (r) => h('b', { class: 'mono' }, r.routeCode) },
          { key: 'routeName', label: 'Tên tuyến', wrap: true },
          { key: 'distanceKm', label: 'Cự ly (km)', num: true, render: (r) => (r.distanceKm != null && r.distanceKm !== '' ? D.vnAuto(r.distanceKm) : '—') },
          { key: 'priceMethodLabel', label: 'Phương thức', wrap: true, render: (r) => (r.priceMethod === 'CO_DINH' ? 'Cố định' : 'Điều chỉnh dầu') },
          { key: 'contractPrice', label: 'Đơn giá', num: true, render: (r) => (r.contractPrice != null ? D.vn(r.contractPrice) : '—') },
          { key: 'uom', label: 'ĐVT', render: (r) => r.uom || 'tấn' },
          { key: 'effectiveFrom', label: 'Hiệu lực từ', fmt: 'date' },
          { key: 'source', label: 'Nguồn', wrap: true, render: (r) => (r.source === 'HOP_DONG'
            ? h('div', { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' } }, D.tag('info', SRC_TXT.HOP_DONG), w ? h('button', { class: 'btn small', onclick: () => removePrice(r) }, 'Gỡ') : null)
            : h('span', { class: 'small muted' }, SRC_TXT[r.source] || r.source)) }
        ];
        const routeBlock = h('div', {},
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' } },
            h('h3', { style: { margin: 0, fontSize: '15px' } }, 'Tuyến và đơn giá đang áp dụng của hợp đồng'),
            w ? h('button', { class: 'btn small primary', onclick: addPriceModal }, 'Thêm đơn giá') : null),
          h('div', { class: 'ct-compact ct-routes' }, D.table({ rows: rp.items, maxHeight: '45vh', columns: rpCols, empty: 'Hợp đồng chưa có tuyến / đơn giá nào. Bấm "Thêm đơn giá" để chọn tuyến và đơn giá.' })));
        // Thống kê giao nhận dầu: CHỈ ĐỌC theo tuyến (nhập dầu ở màn "Giao nhận dầu"); ẩn khi toàn tuyến cố định và chưa có dòng dầu
        const fuelBlock = (rp.items.length && rp.items.every((x) => x.priceMethod === 'CO_DINH') && !fs.items.length) ? null :
          h('div', { style: { marginTop: '16px' } }, h('h3', { style: { margin: '0 0 6px', fontSize: '15px' } }, 'Thống kê giao nhận dầu theo tuyến (chỉ xem)'),
            h('div', { class: 'ct-compact' }, D.table({ rows: [...fs.items, ...(fs.items.length ? [{ routeCode: 'Tổng', routeName: '', receipts: fs.totals.receipts, liters: fs.totals.liters, amount: fs.totals.amount, isTotal: true }] : [])], maxHeight: '35vh', empty: 'Chưa có giao nhận dầu nào gắn với hợp đồng này', columns: [
              { key: 'routeCode', label: 'Tuyến', render: (r) => h(r.isTotal ? 'b' : 'span', { class: r.isTotal ? '' : 'mono' }, r.routeCode) },
              { key: 'routeName', label: 'Tên tuyến', wrap: true },
              { key: 'receipts', label: 'Số lần nhận', fmt: 'int' },
              { key: 'liters', label: 'Tổng lít', num: true, render: (r) => D.vnAuto(r.liters) },
              { key: 'amount', label: 'Thành tiền chưa VAT', fmt: 'money' },
              { key: 'avgFuelPrice', label: 'Giá dầu bình quân', num: true, render: (r) => (r.isTotal ? (r.liters ? D.vn(Math.round(r.amount / r.liters)) : '—') : D.vn(r.avgFuelPrice)) },
              { key: 'firstDate', label: 'Từ ngày', render: (r) => r.firstDate || '' },
              { key: 'lastDate', label: 'Đến ngày', render: (r) => r.lastDate || '' }
            ] })));
        const vehTxt = h('textarea', { rows: 6, 'aria-label': 'Phạm vi xe', readonly: !w, style: { width: '100%', fontFamily: 'var(--mono)', fontSize: '.86rem', whiteSpace: 'pre', overflowX: 'auto' } });
        vehTxt.value = veh.items.map((v) => `${v.plate_no}\t${v.effective_from}\t${v.effective_to || ''}`).join('\n');
        const vehPreview = h('div', { class: 'card flush', style: { marginBottom: '10px' } });
        const drawVehPreview = () => {
          const rows = vehTxt.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
            const [plateNo = '', effectiveFrom = '', effectiveTo = ''] = l.split(/\t|\s{2,}|,/);
            return { plateNo: plateNo.trim(), effectiveFrom: effectiveFrom.trim(), effectiveTo: effectiveTo.trim() };
          });
          vehPreview.replaceChildren(D.table({
            rows,
            maxHeight: '32vh',
            empty: 'Hợp đồng chưa có xe nào',
            columns: [
              { key: 'plateNo', label: 'Biển số', render: (r) => h('b', { class: 'mono' }, r.plateNo) },
              { key: 'owner', label: 'Chủ xe / Phân loại', render: (r) => {
                const v = vehMap[r.plateNo];
                if (!v || !v.owner_unit_code) return h('span', { class: 'small muted' }, '—');
                return v.owner_unit_code === me
                  ? D.tag('ok', `Xe công ty (${v.owner_unit_code})`)
                  : D.tag('info', `Xe thuê đối tác (${v.owner_unit_code})`);
              } },
              { key: 'effectiveFrom', label: 'Hiệu lực từ', fmt: 'date' },
              { key: 'effectiveTo', label: 'Hiệu lực đến', fmt: 'date' },
              { key: 'st', label: 'Trạng thái', render: (r) => (r.effectiveTo ? D.tag('CLOSED', 'Hết hiệu lực') : D.tag('ACTIVE', 'Đang dùng')) }
            ]
          }));
        };
        vehTxt.addEventListener('input', drawVehPreview);
        drawVehPreview();
        const signer = (s) => h('div', {}, h('b', {}, s.unitName), h('div', {}, `${s.signer.title}: ${s.signer.name}`), h('div', { class: 'small muted' }, `Kế toán: ${s.accountant || '—'} · ${s.source === 'OVERRIDE' ? 'ghi đè' : 'theo thứ tự ưu tiên'}`));
        const saveContract = async () => { const r = await D.api('contracts.save', { record: { contractId: c.contract_id, ...f.values() }, rowVersion: c.row_version }); D.toast('Đã lưu hợp đồng', 'ok'); showReminder(r); await back(keepOther('info')); };
        const saveVehicles = async () => { const vehicles = vehTxt.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [plateNo, effectiveFrom, effectiveTo] = l.split(/\t|\s{2,}|,/); return { plateNo, effectiveFrom, effectiveTo }; });
          const r = await D.api('contracts.setVehicles', { contractId: c.contract_id, vehicles }); D.toast(`Thêm ${r.added} · sửa ${r.updated} · đóng ${r.closed}`, 'ok'); showReminder(r); await back(keepOther('vehicles')); };
        const del = async () => { const reason = await D.confirm({ title: 'Xóa hợp đồng', message: `Xóa hẳn hợp đồng ${c.contract_code} (${c.carrier_unit_code} → ${c.customer_unit_code})${use.vehicles ? `, kèm ${use.vehicles} dòng phạm vi xe` : ''}${use.prices ? ` và ${use.prices} phiên bản giá riêng` : ''}?`, reason: true, danger: true, okLabel: 'Xóa' });
          if (!reason) return; const r = await D.api('contracts.delete', { contractId: c.contract_id, reason }); D.toast(`Đã xóa hợp đồng ${r.contractCode}`, 'ok'); showReminder(r); sel = ''; await back(); };
        const toggle = async () => { if (c.is_active && !(await D.confirm({ title: 'Ngừng dùng hợp đồng', message: `Hợp đồng ${c.contract_code} sẽ không tính giá được nữa (danh sách chọn ghi "(ngừng dùng)"). Dữ liệu, các kỳ đã tính và báo cáo giữ nguyên; bấm "Dùng lại" bất cứ lúc nào.` }))) return;
          const r = await D.api('contracts.setActive', { contractId: c.contract_id, active: !c.is_active, rowVersion: c.row_version }); showReminder(r); await back(); };
        const panels = {
          info: () => h('div', {}, usageNote, f, h('div', { class: 'sep' }), h('h2', {}, 'Người ký (thứ tự ưu tiên HAK → HAKQN → ĐH → CNHAK)'), h('div', { class: 'grid g2' }, signer(signers.carrier), signer(signers.customer)),
            w ? h('div', { class: 'btns', style: { marginTop: '12px' } }, h('button', { class: 'btn primary', 'data-hotkey': 'primary', onclick: saveContract }, 'Lưu hợp đồng'), ...(use.canDelete ? [h('button', { class: 'btn danger', onclick: del }, 'Xóa hợp đồng…')] : []),
              h('button', { class: 'btn', onclick: toggle }, c.is_active ? 'Ngừng dùng' : 'Dùng lại')) : null),
          vehicles: () => h('div', {},
            vehPreview,
            h('p', { class: 'small muted', style: { margin: '0 0 6px' } }, 'Chỉnh sửa nhanh (mỗi dòng: biển số [tab] hiệu lực từ [tab] hiệu lực đến, trống = đang dùng; xe bỏ khỏi danh sách được đóng hiệu lực, không xóa):'),
            vehTxt,
            w ? h('div', { class: 'btns', style: { marginTop: '10px' } },
              h('button', { class: 'btn small', onclick: async () => { const s = await D.api('contracts.suggestVehicles', { contractId: c.contract_id }); const have = new Set(vehTxt.value.split('\n').map((l) => l.split('\t')[0])); vehTxt.value += s.plates.filter((x) => !have.has(x)).map((x) => `\n${x}\t${c.effective_from}\t`).join(''); drawVehPreview(); } }, 'Gợi ý xe (từ phiếu cân)'),
              h('button', { class: 'btn small', onclick: async () => {
                const vs = await D.api('vehicles.list');
                const have = new Set(vehTxt.value.split('\n').map((l) => l.split('\t')[0].trim()).filter(Boolean));
                const allActive = (vs.items || []).filter((x) => x.is_active && !have.has(x.plate_no));
                const picked = new Set();
                const ownerSel = h('select', { 'aria-label': 'Lọc chủ xe' },
                  h('option', { value: '' }, 'Tất cả (Xe của công ty + Xe thuê của đối tác)'),
                  ...D.unitOptions().map(([code, lbl]) => h('option', { value: code }, code === me ? `Xe của công ty (${lbl})` : `Xe thuê đối tác (${lbl})`))
                );
                const tblWrap = h('div');
                const drawPickTbl = () => {
                  const rows = ownerSel.value ? allActive.filter((x) => x.owner_unit_code === ownerSel.value) : allActive;
                  tblWrap.replaceChildren(D.table({ rows, empty: 'Không còn xe nào phù hợp chưa thêm vào hợp đồng', maxHeight: '42vh', columns: [
                    { key: 'pick', label: '', render: (r) => h('input', { type: 'checkbox', checked: picked.has(r.plate_no), onchange: (e) => (e.target.checked ? picked.add(r.plate_no) : picked.delete(r.plate_no)) }) },
                    { key: 'plate_no', label: 'Biển số', render: (r) => h('b', { class: 'mono' }, r.plate_no) },
                    { key: 'owner_unit_code', label: 'Chủ xe (Đơn vị)' },
                    { key: 'payload_ton', label: 'Trọng tải (tấn)', num: true, render: (r) => (r.payload_ton != null ? D.vnAuto(r.payload_ton) : '—') },
                    { key: 'volume_m3', label: 'Thể tích (m³)', num: true, render: (r) => (r.volume_m3 != null ? D.vnAuto(r.volume_m3) : '—') },
                    { key: 'kind', label: 'Phân loại', render: (r) => (r.owner_unit_code === me ? D.tag('ok', 'Xe của công ty') : D.tag('info', `Xe thuê đối tác (${r.owner_unit_code})`)) },
                    { key: 'fuel_code', label: 'Mã xe dầu' }
                  ] }));
                };
                ownerSel.addEventListener('change', drawPickTbl);
                drawPickTbl();
                D.modal({ title: `Chọn xe cho hợp đồng ${c.contract_code} (Xe công ty & Xe thuê đối tác)`, wide: true, body: h('div', {},
                  h('p', { class: 'small muted', style: { margin: '0 0 8px' } }, 'Xe trong hợp đồng gồm xe của công ty và xe thuê của đối tác mình thuê (vận chuyển thuê qua lại). Tích chọn xe để đưa vào hợp đồng:'),
                  h('label', { class: 'field', style: { marginBottom: '10px' } }, h('span', {}, 'Lọc theo nguồn xe / chủ xe'), ownerSel),
                  tblWrap),
                  actions: [{ label: 'Hủy', run: () => true }, { label: 'Đưa vào hợp đồng', primary: true, run: () => {
                    if (picked.size) {
                      const prefix = vehTxt.value.trim() ? '\n' : '';
                      vehTxt.value = vehTxt.value.trimEnd() + prefix + [...picked].map((p) => `${p}\t${c.effective_from}\t`).join('\n');
                      drawVehPreview();
                    }
                    return true;
                  } }] });
              } }, 'Chọn từ danh mục xe…'),
              h('button', { class: 'btn primary', 'data-hotkey': 'primary', onclick: saveVehicles }, 'Lưu phạm vi xe')) : null),
          price: () => h('div', {}, routeBlock, fuelBlock),
          periods: () => h('div', {},
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' } },
              h('div', {},
                h('h3', { style: { margin: '0 0 4px', fontSize: '15px' } }, `Danh sách kỳ vận chuyển của hợp đồng ${c.contract_code}`),
                h('p', { class: 'small muted', style: { margin: 0 } }, 'Mỗi lần tính giá là 1 kỳ vận chuyển của hợp đồng. Mở hợp đồng thấy đầy đủ các kỳ vận chuyển, số chuyến, sản lượng tấn, đơn giá và thành tiền.')
              ),
              w && c.carrier_unit_code === me ? h('button', { class: 'btn small primary', onclick: () => D.go('calc', { contractId: c.contract_id }) }, '+ Tính kỳ vận chuyển mới') : null
            ),
            D.table({ rows: periods.items, empty: 'Hợp đồng chưa có kỳ vận chuyển nào', columns: [
              { key: 'period_code', label: 'Mã kỳ vận chuyển', render: (r) => h('b', { class: 'mono' }, r.period_code) },
              { key: 'date_from', label: 'Từ ngày', fmt: 'date' },
              { key: 'date_to', label: 'Đến ngày', fmt: 'date' },
              { key: 'routes', label: 'Tuyến', render: (r) => (r.routes && r.routes.length ? r.routes.map((x) => x.routeCode).join(', ') : (r.route_filter || 'Tất cả')) },
              { key: 'trips', label: 'Chuyến', fmt: 'int' },
              { key: 'ton', label: 'Khối lượng (tấn)', fmt: 'dec2' },
              { key: 'pr', label: 'Đơn giá VC', num: true, render: (r) => (r.routes && r.routes.length ? r.routes.map((x) => D.vn(x.transportPrice)).join(' · ') : '—') },
              { key: 'totalInclVat', label: 'Tổng thanh toán', fmt: 'money' },
              { key: 'status', label: 'Trạng thái', fmt: 'tag' },
              { key: 'x', label: '', render: (r) => h('div', { class: 'btns' },
                h('button', { class: 'btn small', onclick: () => D.go('calc', { periodId: r.period_id }) }, 'Mở kỳ'),
                h('button', { class: 'btn small', onclick: () => D.go('bkvc', { periodId: r.period_id }) }, 'BKVC')) }
            ] })),
        };
        const TABS = [['info', 'Thông tin'], ['vehicles', 'Xe của hợp đồng'], ['price', 'Tuyến và đơn giá vận chuyển'], ['periods', `Kỳ tính (${periods.items.length})`]];
        const tabBtns = {}; const panelEls = {};
        const setTab = (k, focus = false) => { tab = k; for (const [key, b] of Object.entries(tabBtns)) { const on = key === k; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; panelEls[key].hidden = !on; } if (focus) tabBtns[k].focus(); };
        const keyNav = (e) => { const ks = TABS.map(([k]) => k); const i = ks.indexOf(tab); const to = { ArrowRight: ks[(i + 1) % ks.length], ArrowLeft: ks[(i - 1 + ks.length) % ks.length], Home: ks[0], End: ks[ks.length - 1] }[e.key]; if (to) { e.preventDefault(); setTab(to, true); } };
        for (const [k, label] of TABS) {
          tabBtns[k] = h('button', { role: 'tab', id: `ct-tab-${k}`, 'aria-controls': `ct-panel-${k}`, onclick: () => setTab(k), onkeydown: keyNav }, label);
          panelEls[k] = h('div', { role: 'tabpanel', id: `ct-panel-${k}`, 'aria-labelledby': `ct-tab-${k}`, style: { marginTop: '10px' } }, panels[k]());
        }
        const tabsEl = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Chi tiết hợp đồng' }, TABS.map(([k]) => tabBtns[k]));
        const kpiStrip = h('div', { class: 'kpis', style: { margin: '10px 0 12px' } },
          h('div', { class: 'kpi', style: { cursor: 'pointer' }, onclick: () => setTab('vehicles') }, h('div', { class: 'v' }, D.vn(c.vehicles)), h('div', { class: 'l' }, 'Xe của hợp đồng')),
          h('div', { class: 'kpi', style: { cursor: 'pointer' }, onclick: () => setTab('price') }, h('div', { class: 'v' }, D.vn(rp.items.length)), h('div', { class: 'l' }, 'Tuyến có đơn giá')),
          h('div', { class: 'kpi', style: { cursor: 'pointer' }, onclick: () => setTab('periods') }, h('div', { class: 'v' }, D.vn(periods.items.length)), h('div', { class: 'l' }, 'Kỳ tính'))
        );
        detail.replaceChildren(h('div', { class: 'card' },
          h('div', { class: 'row' }, h('button', { class: 'btn small ct-back', onclick: async () => { if (!(await askDiscard())) return; sel = ''; cur = null; drawList(); syncCrumb(); drawDetail(true); } }, '← Danh sách'),
            h('h2', { class: 'grow', style: { margin: 0 } }, `Hợp đồng ${c.contract_code}`), c.is_active ? D.tag('ACTIVE') : D.tag('CLOSED', 'Ngừng')),
          h('p', { class: 'small muted', style: { margin: '4px 0 0' } }, `${c.carrier_unit_code} → ${c.customer_unit_code} · hiệu lực từ ${c.effective_from}${c.effective_to ? ` đến ${c.effective_to}` : ''}`),
          kpiStrip,
          tabsEl, ...TABS.map(([k]) => panelEls[k])));
        setTab(TABS.some(([k]) => k === tab) ? tab : 'info');
        cur = { id: c.contract_id, code: c.contract_code, f, vehTxt, snapF: JSON.stringify(f.values()), snapV: vehTxt.value, setTab };
        // đặt lại phần chưa lưu của thẻ kia SAU khi chụp mốc → vẫn là "chưa lưu"
        if (keep.veh !== undefined) vehTxt.value = keep.veh;
        if (keep.form) for (const [k, v] of Object.entries(keep.form)) { const el = f.inputs[k]; if (!el || el.readOnly || el.disabled) continue; if (el.type === 'checkbox') el.checked = v; else el.value = v; }
        drawingId = '';
      }

      const add = () => D.formModal({ title: 'Thêm hợp đồng vận chuyển', fields: CF(true, true), wide: true, values: { carrierUnitCode: me, effectiveFrom: D.today() },
        submit: async (v) => { const r = await D.api('contracts.save', { create: true, record: v }); showReminder(r); await D.refreshBoot(); await reload(); if (r.record && r.record.contract_id) setTimeout(() => choose(r.record.contract_id, 'info')); } }); // đóng hộp thoại ngay, dựng chi tiết sau (không giữ hộp mở trong lúc tải 6 API)
      for (const el of [fStatus, fRole]) el.addEventListener('change', drawList); fQ.addEventListener('input', drawList);
      const page = D.page('Hợp đồng vận chuyển', crumb(), [w ? h('button', { class: 'btn primary', onclick: add }, 'Thêm hợp đồng') : null], layout);
      await reload(sel); if (sel && !items.some((x) => x.contract_id === sel)) sel = ''; syncCrumb(); await drawDetail();
      return page;
    },
  };

  // ───────── Nhắc sửa danh mục ở các nhà máy còn lại ─────────
  D.views.sync = {
    async render(p) {
      const showAll = h('input', { type: 'checkbox', id: 'all', checked: !!p.all }); const out = h('div');
      const load = async () => {
        const d = await D.api('sync.list', { status: showAll.checked ? '' : 'OPEN' });
        out.innerHTML = '';
        const units = Object.entries(d.pendingByUnit);
        out.append(h('div', { class: 'kpis' }, units.length ? units.map(([u, n]) => h('div', { class: 'kpi' }, h('div', { class: 'l' }, `Nhà máy ${u}`), h('div', { class: 'v' }, `${n} thay đổi chờ`),
          D.writer() ? h('div', { class: 'btns', style: { marginTop: '6px' } }, h('button', { class: 'btn small primary', onclick: async () => { const x = await D.api('exchange.exportPackage', { packageType: 'DANH_MUC', targetUnitCode: u }); D.toast(`Đã xuất gói danh mục cho ${u}: ${x.file} (đánh dấu ${x.remindersMarked} thay đổi)`, 'ok', 9000); load(); D.render(); } }, 'Xuất gói danh mục'),
            h('button', { class: 'btn small', onclick: async () => { const note = await D.confirm({ title: `Đã sửa tay ở ${u}?`, message: `Đánh dấu nhà máy ${u} đã sửa giống tất cả thay đổi đang chờ.`, reason: true }); if (note) { await D.api('sync.markDone', { unitCode: u, note }); load(); D.render(); } } }, 'Đã sửa tay')) : null))
          : h('div', { class: 'kpi' }, h('div', { class: 'l' }, 'Tất cả nhà máy'), h('div', { class: 'v' }, 'Đã đồng bộ'))),
        h('div', { class: 'card flush' }, D.table({ rows: d.items, columns: [{ key: 'createdAt', label: 'Lúc', fmt: 'datetime' }, { key: 'createdBy', label: 'Người sửa' }, { key: 'summary', label: 'Thay đổi', wrap: true },
          { key: 'p', label: 'Chờ sửa ở', render: (r) => r.pendingUnits.map((u) => h('span', { class: 'tag warn', style: { marginRight: '4px' } }, u)) },
          { key: 'd', label: 'Đã sửa ở', render: (r) => Object.entries(r.done).map(([u, x]) => h('span', { class: 'tag ok', title: `${x.how === 'PACKAGE' ? 'gói' : 'sửa tay'} · ${x.note || ''}`, style: { marginRight: '4px' } }, u)) },
          { key: 'status', label: 'Trạng thái', fmt: 'tag' }], empty: 'Không có thay đổi danh mục nào đang chờ các nhà máy khác' })));
      };
      showAll.addEventListener('change', load);
      const page = D.page('Nhắc sửa danh mục', 'Sửa danh mục ở 1 nhà máy → nhớ sửa giống ở các nhà máy còn lại', [],
        h('div', { class: 'card' }, h('p', { style: { margin: 0 } }, 'Gửi gói danh mục (.dgvc) cho nhà máy chưa sửa — bên kia vào "Trao đổi dữ liệu → Nhập gói". Hoặc nếu bên kia đã sửa tay thì bấm "Đã sửa tay".'),
          h('label', { class: 'check', for: 'all', style: { marginTop: '8px' } }, showAll, 'Hiện cả thay đổi đã xong')), out);
      await load();
      return page;
    },
  };
})();
