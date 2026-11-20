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
      const inactive = h('input', { type: 'checkbox', id: 'ina' }); const out = h('div', { class: 'card flush' });
      const load = async () => {
        const d = await D.api('routes.list', { includeInactive: inactive.checked });
        out.innerHTML = '';
        out.append(D.table({ rows: d.items, onRow: D.writer() ? edit : null, columns: [{ key: 'catalogDate', label: 'Ngày cập nhật', fmt: 'date' }, { key: 'route_code', label: 'Mã tuyến' }, { key: 'route_name', label: 'Tuyến', wrap: true }, { key: 'distance_km', label: 'Cự ly', fmt: 'auto' },
          { key: 'trip_distance_km', label: 'Cự ly chuyến', fmt: 'auto' }, { key: 'uom', label: 'ĐVT' }, { key: 'from_place', label: 'Điểm đi' }, { key: 'to_place', label: 'Điểm đến' }, { key: 'catalog_unit_code', label: 'Đơn vị' },
          { key: 'p', label: 'ĐG ký HĐ hiện hành', num: true, render: (r) => (r.activePrice ? r.activePrice.price_id : h('span', { class: 'tag warn' }, 'chưa có giá')) }, { key: 'usedInPeriods', label: 'Số kỳ đã dùng', fmt: 'int' },
          { key: 'is_active', label: 'Trạng thái', render: (r) => (r.is_active ? D.tag('ACTIVE') : D.tag('CLOSED', 'Ngừng dùng')) }] }));
      };
      const edit = (r) => D.formModal({ title: `Sửa tuyến ${r.route_code}`, fields: ROUTE_FIELDS(false), values: routeValues(r), submit: async (v) => {
        const { reason, ...record } = v; const res = await D.api('routes.save', { record, rowVersion: r.row_version, reason });
        if (res.affectedPeriods.length) D.toast(`${res.affectedPeriods.length} kỳ nháp dùng tuyến này phải tính lại`, 'info'); showReminder(res); await D.refreshBoot(); load(); } });
      const add = async () => { const next = await D.api('routes.nextCode', {}, { quiet: true }).catch(() => ({ routeCode: '' })); D.formModal({ title: 'Thêm tuyến vận chuyển', fields: ROUTE_FIELDS(true), values: { routeCode: next.routeCode, catalogDate: D.today(), uom: 'TAN', catalogUnitCode: D.state.boot.install.unitCode }, submit: async (v) => {
        const res = await D.api('routes.save', { create: true, record: v }); showReminder(res); D.toast(`Đã thêm tuyến ${res.record.route_code} — nhớ tạo đơn giá cho tuyến`, 'ok'); await D.refreshBoot(); load(); } }); };
      inactive.addEventListener('change', load);
      const page = D.page('Danh mục tuyến', '4 · Tuyến vận chuyển — sửa được, bổ sung được', [D.writer() ? h('button', { class: 'btn primary', onclick: add }, 'Thêm tuyến') : null],
        h('div', { class: 'card' }, h('label', { class: 'check', for: 'ina' }, inactive, 'Hiện cả tuyến ngừng dùng'), syncNote()), out);
      await load();
      return page;
    },
  };

  /** Dòng giải thích + liên kết sang 2 màn giá còn lại (Đơn giá · Mã đơn giá · Căn cứ giá hợp đồng) — mỗi màn nói rõ vai trò của mình. */
  const PRICE_SCREENS = { prices: ['Đơn giá', 'Bảng giá chung theo tuyến. Hợp đồng có mã đơn giá riêng thì dùng giá ở màn Mã đơn giá.'], pricecodes: ['Mã đơn giá', 'Bộ giá riêng theo đối tác; gán cho hợp đồng tại đây.'], basis: ['Căn cứ giá hợp đồng', 'Chỉ xem: giá nào đang được áp cho từng hợp đồng / tuyến / ngày.'] };
  D.priceScreenNote = (current) => h('p', { class: 'small muted', style: { margin: '0 0 8px' } }, PRICE_SCREENS[current][1], ' Xem thêm: ',
    Object.entries(PRICE_SCREENS).filter(([v]) => v !== current).map(([v, [name]], i) => [i ? ' · ' : '', h('button', { class: 'btn small', onclick: () => D.go(v) }, name)]));

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
        ['ĐƠN GIÁ HỢP ĐỒNG (10) = làm tròn (9) đến hàng nghìn', `${D.vn(r.priceNoDiesel, 2)} → làm tròn`, r.contractPrice, 'đ'],
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
            h('li', {}, h('b', {}, '(10) ĐƠN GIÁ HỢP ĐỒNG = làm tròn (9) đến hàng nghìn'), h('div', { class: 'f' }, 'Ghi vào hợp đồng — chưa gồm nhiên liệu. Hằng kỳ cộng chênh lệch dầu theo dầu thực nhận.'))),
            h('p', { class: 'small muted' }, 'Bấm vào 1 tuyến để xem thay số. Muốn thử phương án giá: Xuất Excel — file có công thức, sửa ô xanh là tự tính lại.'))));
      };
      const page = D.page('Căn cứ tính giá ký hợp đồng', '5 · Đơn giá ký hợp đồng (chưa gồm nhiên liệu) theo từng tuyến', [
        h('button', { class: 'btn', onclick: async () => { await D.api('reports.print', { report: 'CONTRACT_BASIS', params: params() }); } }, 'In'),
        h('button', { class: 'btn', onclick: save('PDF') }, 'Xuất PDF'), h('button', { class: 'btn primary', onclick: save('XLSX') }, 'Xuất Excel (có công thức)')],
      h('div', { class: 'card' }, D.priceScreenNote('basis'), h('div', { class: 'filters' }, f, h('button', { class: 'btn primary', onclick: load }, 'Xem'))), out);
      f.addEventListener('change', load);
      await load();
      return page;
    },
  };

  /** Ô nhập của dòng giá — dùng chung màn Đơn giá và màn Mã đơn giá (một định nghĩa, nhãn thống nhất). */
  D.priceFormFields = () => [{ key: 'priceMethod', label: 'Phương thức đơn giá', type: 'select', full: true, options: [['THEO_DAU', 'Theo giá dầu — ĐG ký HĐ + chênh lệch dầu thực nhận (cách cũ)'], ['CO_DINH', 'Đơn giá cố định (đ/tấn) — không nhận dầu, không tính chênh lệch dầu']] },
        { key: 'effectiveFrom', label: 'Hiệu lực từ ngày', type: 'date', required: true }, { key: 'contractId', label: 'Giá riêng cho hợp đồng', type: 'select', options: [['', '— giá chung —'], ...D.contractOptions()] },
        { key: 'fixedPrice', label: 'Đơn giá cố định / tấn (chưa VAT)', money: true, hint: 'dùng nguyên số này làm đơn giá vận chuyển mọi kỳ — không làm tròn lại' },
        { key: 'newPrice', label: 'Đơn giá ký hợp đồng dự kiến / tấn (chưa VAT) — dùng tính', money: true, required: true, hint: 'gồm dầu theo định mức; = cột "Đơn giá mới" của Excel' },
        { key: 'basePriceExclVat', label: 'Đơn giá tham khảo (chưa VAT)', money: true, hint: 'không dùng tính — chỉ để đối chiếu' },
        { key: 'basePriceSource', label: 'Nguồn đơn giá tham khảo', full: true, hint: 'bắt buộc khi có đơn giá tham khảo — vd: File Excel … · bảng … · cột … · ngày …' },
        { key: 'fuelPriceExclVat', label: 'ĐG dầu chưa VAT (danh mục)', money: true, required: true }, { key: 'fuelNormLPerKm', label: 'Định mức dầu (lít/km)', type: 'number', required: true, hint: '0,4 lít/km = 40 lít/100 km' },
        { key: 'avgLoadTon', label: 'KL trung bình (tấn)', type: 'number', required: true }, { key: 'avgVolumeM3', label: 'Thể tích TB (m³) — tuyến M3', type: 'number' }, { key: 'sourceNote', label: 'Căn cứ', full: true }];

  // ───────── Đơn giá ─────────
  D.views.prices = {
    async render(p) {
      const sel = h('select', { 'aria-label': 'Tuyến' }, D.routeOptions(false).map(([v, t]) => h('option', { value: v, selected: v === (p.routeCode || 'VC.007') }, t)));
      const out = h('div');
      const PF = D.priceFormFields();
      const load = async () => {
        const d = await D.api('prices.list', { routeCode: sel.value });
        out.innerHTML = '';
        out.append(h('div', { class: 'card flush' }, D.table({ rows: d.items, onRow: (r) => (r.status === 'DRAFT' && D.writer() ? draft(r) : null), columns: [{ key: 'price_id', label: 'Phiên bản' }, { key: 'contract_id', label: 'Hợp đồng' },
          { key: 'effective_from', label: 'Từ ngày', fmt: 'date' }, { key: 'effective_to', label: 'Đến ngày', fmt: 'date' }, { key: 'status', label: 'Trạng thái', fmt: 'tag' },
          { key: 'price_method', label: 'Phương thức', render: (r) => (r.price_method === 'CO_DINH' ? D.tag('info', 'Cố định') : h('span', { class: 'small muted' }, 'Theo giá dầu')) },
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
          D.modal({ title: `Phiên bản giá mới — ${sel.value}${cur ? ` · ${cur.route_name}` : ''}`, wide: true, body: h('div', { class: 'grid g2' }, f, previewBox), actions: [{ label: 'Hủy', run: () => true },
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
      const page = D.page('Đơn giá', '5 · Phiên bản đơn giá theo tuyến', [D.writer() ? h('button', { class: 'btn primary', onclick: create }, 'Tạo phiên bản giá mới') : null],
        h('div', { class: 'card' }, D.priceScreenNote('prices'), h('label', { class: 'field wide' }, h('span', {}, 'Tuyến'), sel), syncNote(), h('p', { class: 'small muted', style: { margin: '4px 0 0' } }, D.tag('mute', 'Cách cũ'), ' Giá chung / giá riêng hợp đồng (cách cũ) — giá theo hình thức (cố định / theo giá dầu) quản lý ở mục "Mã đơn giá". Hợp đồng không gán mã vẫn tính bằng giá ở màn này; không đổi hành vi.')), out);
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
    signPlace: c.sign_place, reportTitle: c.report_title, carrierPrintName: c.carrier_print_name, customerPrintName: c.customer_print_name, serviceDesc: c.service_desc, note: c.note }); // KHÔNG có priceCode: mã đơn giá chỉ sửa ở màn Mã đơn giá

  D.views.contracts = {
    // Màn Hợp đồng kiểu cha–con (1.8.x): trái = danh sách hợp đồng (lọc), phải = chi tiết hợp đồng đang chọn với các thẻ Thông tin · Xe của hợp đồng · Mã đơn giá · Kỳ tính.
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
      D.leaveGuard = askDiscard; // rời màn (menu, nút "Đổi ở Mã đơn giá →", "Mở kỳ"…) khi còn thay đổi chưa lưu → hỏi trước
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
        if (!c) { drawingId = ''; cur = null; detail.replaceChildren(h('div', { class: 'card' }, h('h2', {}, 'Chọn một hợp đồng'), h('p', { class: 'muted' }, 'Bấm một hợp đồng ở danh sách để xem / sửa thông tin, phạm vi xe, mã đơn giá và các kỳ tính.'), syncNote())); return; }
        const failed = (e) => { if (drawingId === myId) drawingId = ''; throw e; };
        const [signers, veh, use, rs, periods] = await Promise.all([D.api('contracts.resolveSigners', { contractId: c.contract_id }), D.api('contracts.vehicles', { contractId: c.contract_id }), D.api('contracts.usage', { contractId: c.contract_id }),
          D.api('contracts.routeSources', { contractId: c.contract_id }, { quiet: true }).catch(() => ({ items: [] })), D.api('periods.list', { contractId: c.contract_id }, { quiet: true }).catch(() => ({ items: [] }))]).catch(failed);
        const partner = c.carrier_unit_code === me ? c.customer_unit_code : c.carrier_unit_code;
        const pcs = await D.api('pricecodes.list', { unitCode: partner }, { quiet: true }).catch(() => ({ items: [] }));
        if (!guard.ok(tok)) { if (drawingId === myId) drawingId = ''; return; } // người dùng đã chọn hợp đồng khác trong lúc chờ
        const f = D.form(CF(false, w && use.canEditParties).map((x) => (w ? x : { ...x, readonly: true })), cVal(c)); // XEM: chỉ đọc
        const usageNote = h('p', { class: 'small', style: { margin: '0 0 12px' } }, use.canEditParties
          ? [D.tag('ok', 'Chưa dùng'), ' Hợp đồng chưa có kỳ tính, chưa có dòng dầu — sửa được cả mã hợp đồng, bên vận chuyển, bên thuê; xóa được nếu nhập nhầm.']
          : [D.tag('info', 'Đã dùng'), ` Hợp đồng đã có ${use.blockers.join(', ')} — sửa được số HĐ, ngày hiệu lực, tên in, người ký, phạm vi xe; KHÔNG đổi mã / hai bên và không xóa. Nhập nhầm thì thêm hợp đồng đúng rồi bấm "Ngừng dùng".`]);
        const METHOD_TXT = { CO_DINH: 'đơn giá cố định', THEO_DAU: 'theo giá dầu' };
        const myCode = (pcs.items || []).find((x) => x.price_code === c.price_code);
        const rsBox = h('div'); const priceBlock = h('div', {}, h('p', {}, 'Mã đơn giá: ', c.price_code ? h('b', {}, `${c.price_code}${myCode ? ` — ${myCode.priceMethodLabel}` : ''}`) : h('b', {}, 'Giá chung (cách cũ)'), ' ',
          h('button', { class: 'btn small', onclick: () => D.go('pricecodes', { unitCode: partner, code: c.price_code || '' }) }, 'Đổi ở Mã đơn giá →')),
        h('p', { class: 'small muted', style: { margin: '0 0 6px' } }, `Mã đơn giá của đối tác ${partner}: `, (pcs.items || []).filter((x) => x.status === 'ACTIVE').length ? pcs.items.filter((x) => x.status === 'ACTIVE').map((x) => h('span', { class: 'tag info', style: { marginRight: '6px' } }, `${x.price_code} · ${x.priceMethodLabel}`)) : 'chưa có'),
        rsBox);
        // Nguồn giá: mặc định chỉ TUYẾN CỦA HỢP ĐỒNG (có phiếu cân của xe trong hợp đồng / có dòng giá của mã / giá riêng); nút xem cả tuyến khác
        let rsAll = false;
        const rsCols = [{ key: 'routeCode', label: 'Mã tuyến' }, { key: 'routeName', label: 'Tên tuyến', wrap: true },
          { key: 'source', label: 'Nguồn giá', render: (r) => (r.source === 'CODE' ? D.tag('info', `theo mã ${r.priceCode} (${METHOD_TXT[r.priceMethod]})`) : r.source === 'CONTRACT' ? h('span', { class: 'small' }, 'giá riêng hợp đồng (cách cũ)') : h('span', { class: 'small muted' }, 'dùng giá chung (cách cũ)')) },
          { key: 'priceMethod', label: 'Hình thức', render: (r) => (r.priceMethod === 'CO_DINH' ? 'Cố định' : 'Theo giá dầu') }];
        rsCols.splice(2, 0, { key: 'inUse', label: 'Có phiếu cân', render: (r) => (r.inUse ? 'Có' : '—') });
        function drawRs() {
          const others = rs.items.filter((x) => !x.inContract).length;
          rsBox.replaceChildren(D.table({ rows: rsAll ? rs.items : rs.items.filter((x) => x.inContract), maxHeight: '40vh', columns: rsCols,
            empty: 'Hợp đồng chưa có tuyến (chưa có phiếu cân của xe trong hợp đồng, chưa có dòng giá của mã / giá riêng hợp đồng)' }),
          others ? h('button', { class: 'btn small', style: { marginTop: '6px' }, onclick: () => { rsAll = !rsAll; drawRs(); } }, rsAll ? 'Chỉ tuyến của hợp đồng' : `Xem cả ${others} tuyến khác (nếu sau này chạy)`) : null);
        }
        // "Giao nhận dầu" là bảng con của hợp đồng — chỉ hiện khi hợp đồng còn tuyến theo giá dầu
        drawRs();
        const fuelBlock = rs.allFixed !== true ? // ẩn khi MỌI tuyến của hợp đồng là giá cố định
          h('div', { class: 'card', style: { margin: '12px 0' } }, h('h2', {}, 'Giao nhận dầu của hợp đồng'),
          h('p', { class: 'small' }, `${D.vn(use.fuelRows)} dòng dầu · ${D.vn(use.periods)} kỳ tính. Dầu nhập tay hoặc import từ Excel đều gắn đúng hợp đồng này; chỉ dùng cho các tuyến theo giá dầu.`),
          h('button', { class: 'btn small', onclick: () => D.go('fuel', { contractId: c.contract_id }) }, 'Sang màn nhập dầu →')) : null;
        const vehTxt = h('textarea', { rows: 8, 'aria-label': 'Phạm vi xe', readonly: !w }); vehTxt.value = veh.items.map((v) => `${v.plate_no}\t${v.effective_from}\t${v.effective_to || ''}`).join('\n');
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
          vehicles: () => h('div', {}, h('p', { class: 'small muted' }, 'Mỗi dòng: biển số [tab] hiệu lực từ [tab] hiệu lực đến (trống = đang dùng). Xe bỏ khỏi danh sách được đóng hiệu lực, không xóa.'), vehTxt,
            w ? h('div', { class: 'btns', style: { marginTop: '8px' } }, h('button', { class: 'btn small', onclick: async () => { const s = await D.api('contracts.suggestVehicles', { contractId: c.contract_id }); const have = new Set(vehTxt.value.split('\n').map((l) => l.split('\t')[0])); vehTxt.value += s.plates.filter((x) => !have.has(x)).map((x) => `\n${x}\t${c.effective_from}\t`).join(''); } }, 'Gợi ý xe'),
              h('button', { class: 'btn primary', 'data-hotkey': 'primary', onclick: saveVehicles }, 'Lưu phạm vi xe')) : null),
          price: () => h('div', {}, priceBlock, fuelBlock),
          periods: () => D.table({ rows: periods.items, empty: 'Hợp đồng chưa có kỳ tính', columns: [{ key: 'period_code', label: 'Mã kỳ' }, { key: 'date_from', label: 'Từ ngày', fmt: 'date' }, { key: 'date_to', label: 'Đến ngày', fmt: 'date' }, { key: 'status', label: 'Trạng thái', fmt: 'tag' },
            { key: 'x', label: '', render: (r) => h('button', { class: 'btn small', onclick: () => D.go('calc', { periodId: r.period_id }) }, 'Mở kỳ') }] }),
        };
        const TABS = [['info', 'Thông tin'], ['vehicles', 'Xe của hợp đồng'], ['price', 'Mã đơn giá'], ['periods', `Kỳ tính (${periods.items.length})`]];
        const tabBtns = {}; const panelEls = {};
        const setTab = (k, focus = false) => { tab = k; for (const [key, b] of Object.entries(tabBtns)) { const on = key === k; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; panelEls[key].hidden = !on; } if (focus) tabBtns[k].focus(); };
        const keyNav = (e) => { const ks = TABS.map(([k]) => k); const i = ks.indexOf(tab); const to = { ArrowRight: ks[(i + 1) % ks.length], ArrowLeft: ks[(i - 1 + ks.length) % ks.length], Home: ks[0], End: ks[ks.length - 1] }[e.key]; if (to) { e.preventDefault(); setTab(to, true); } };
        for (const [k, label] of TABS) {
          tabBtns[k] = h('button', { role: 'tab', id: `ct-tab-${k}`, 'aria-controls': `ct-panel-${k}`, onclick: () => setTab(k), onkeydown: keyNav }, label);
          panelEls[k] = h('div', { role: 'tabpanel', id: `ct-panel-${k}`, 'aria-labelledby': `ct-tab-${k}`, style: { marginTop: '10px' } }, panels[k]());
        }
        const tabsEl = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Chi tiết hợp đồng' }, TABS.map(([k]) => tabBtns[k]));
        detail.replaceChildren(h('div', { class: 'card' },
          h('div', { class: 'row' }, h('button', { class: 'btn small ct-back', onclick: async () => { if (!(await askDiscard())) return; sel = ''; cur = null; drawList(); syncCrumb(); drawDetail(true); } }, '← Danh sách'),
            h('h2', { class: 'grow', style: { margin: 0 } }, `Hợp đồng ${c.contract_code}`), c.is_active ? D.tag('ACTIVE') : D.tag('CLOSED', 'Ngừng')),
          h('p', { class: 'small muted' }, `${c.carrier_unit_code} → ${c.customer_unit_code} · hiệu lực từ ${c.effective_from}${c.effective_to ? ` đến ${c.effective_to}` : ''} · ${D.vn(c.vehicles)} xe`),
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
