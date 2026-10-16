'use strict';
/* Bảng xác nhận KL (4.7) · Chi tiết vận chuyển (4.8) · Báo cáo (4.9) — xem trước A4 + in + xuất XLSX / PDF / CSV */
(function () {
  const D = window.DGVC; const { h } = D;

  async function periodPicker(p, onPick) {
    const list = (await D.api('periods.list', {})).items.filter((x) => x.status !== 'HUY');
    const sel = h('select', { 'aria-label': 'Kỳ' }, list.length ? list.map((x) => h('option', { value: x.period_id, selected: x.period_id === p.periodId }, `${x.period_code} · ${({ NHAP: 'nháp', DA_XAC_NHAN: 'đã xác nhận', DA_KHOA: 'đã khóa' })[x.status]}${x.origin === 'IMPORTED' ? ' · nhận từ gói' : ''}`)) : [h('option', { value: '' }, '— chưa có kỳ —')]);
    sel.addEventListener('change', () => onPick(sel.value));
    return { sel, first: p.periodId || (list[0] && list[0].period_id) || '' };
  }
  const exportBtns = (report, getParams, formats = ['XLSX', 'PDF', 'CSV']) => formats.map((fmt) => h('button', { class: `btn ${fmt === 'XLSX' ? 'primary' : ''}`, onclick: async () => {
    const params = getParams(); if (!params.periodId) return;
    const def = `${report}_${params.periodId}.${fmt.toLowerCase()}`;
    const target = window.dgvc ? await D.pickFile({ title: `Lưu ${fmt}`, save: true, defaultPath: def }) : '';
    if (window.dgvc && !target) return;
    const r = await D.api('reports.export', { report, format: fmt, params, targetPath: target || undefined });
    D.toast(`Đã xuất ${fmt}: ${r.path}`, 'ok', 8000);
    if (window.dgvc) D.api('system.openPath', { path: r.path }, { quiet: true }).catch(() => {});
  } }, `Xuất ${fmt === 'XLSX' ? 'Excel' : fmt}`));
  /** File Excel theo mẫu MISA meInvoice "Hóa đơn GTGT 1 thuế suất" — tải lên phần mềm hóa đơn điện tử (chỉ bên vận chuyển). */
  const exportMisa = async (periodId, invoiceDate) => {
    const def = `HoaDon_MISA_${periodId}.xlsx`;
    const target = window.dgvc ? await D.pickFile({ title: 'Lưu file nhập hóa đơn MISA', save: true, defaultPath: def }) : '';
    if (window.dgvc && !target) return;
    const r = await D.api('reports.export', { report: 'MISA', format: 'XLSX', params: { periodId, invoiceDate }, targetPath: target || undefined });
    D.toast(`Đã xuất file hóa đơn MISA: ${r.path}`, 'ok', 8000);
    if (window.dgvc) D.api('system.openPath', { path: r.path }, { quiet: true }).catch(() => {});
  };
  const misaBox = (pid, d) => {
    const date = h('input', { type: 'date', value: d.header.reportDate || '', 'aria-label': 'Ngày hóa đơn' });
    return h('div', {}, h('div', { class: 'sep' }), h('h2', {}, 'File hóa đơn MISA'),
      h('p', { class: 'small muted' }, 'Excel đúng mẫu "Hóa đơn GTGT 1 thuế suất" của MISA meInvoice: 1 kỳ = 1 hóa đơn, mỗi xe 1 dòng. Tiền thuế = làm tròn(tổng tiền hàng × thuế suất) như MISA.'),
      h('label', { class: 'field' }, h('span', {}, 'Ngày hóa đơn'), date),
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: () => exportMisa(pid, date.value) }, 'Xuất file hóa đơn MISA')));
  };
  const printBtn = (report, getParams) => h('button', { class: 'btn', onclick: async () => { const params = getParams(); if (params.periodId) await D.api('reports.print', { report, params }); } }, 'In');

  D.views.bkvc = {
    async render(p) {
      const frame = h('iframe', { class: 'preview', title: 'Xem trước chứng từ in' }); const side = h('div');
      let pid = ''; let doc = p.doc || 'BKVC';
      const DOCS = [['BKVC', 'Bảng xác nhận khối lượng'], ['PRICING_SHEET', 'Bảng tính đơn giá'], ['FUEL_HANDOVER', 'Biên bản giao nhận dầu']];
      const tabs = h('div', { class: 'tabs', role: 'tablist' });
      const show = async (k) => {
        doc = k; tabs.innerHTML = '';
        tabs.append(...DOCS.map(([key, t]) => h('button', { role: 'tab', 'aria-selected': String(key === doc), onclick: () => show(key) }, t)));
        if (!pid) return;
        try { frame.srcdoc = (await D.api('reports.html', { report: doc, params: { periodId: pid } }, { quiet: true })).html; }
        catch (e) { frame.srcdoc = `<p style="font-family:sans-serif;padding:24px;color:#6b7a8c">${D.errorText(e)}</p>`; }
      };
      const docCard = () => h('div', {}, h('div', { class: 'sep' }), h('h2', {}, 'Chứng từ kèm theo'),
        ...DOCS.slice(1).map(([key, t]) => h('div', { style: { marginBottom: '10px' } }, h('div', { class: 'b', style: { fontWeight: 600, marginBottom: '4px' } }, t),
          h('div', { class: 'btns' }, h('button', { class: 'btn small', onclick: () => show(key) }, 'Xem'), h('button', { class: 'btn small', onclick: async () => { await D.api('reports.print', { report: key, params: { periodId: pid } }); } }, 'In'),
            ...exportBtns(key, () => ({ periodId: pid }), ['PDF', 'XLSX']).map((b) => { b.classList.add('small'); b.classList.remove('primary'); return b; })))),
        h('p', { class: 'small muted' }, 'Bảng tính đơn giá: 20 chỉ tiêu đánh số, có công thức và thay số. Biên bản giao nhận dầu: chi tiết từng lần nhận, tổng hợp theo xe, kết luận — mỗi bên giao 1 biên bản.'));
      const load = async (id) => {
        pid = id; if (!pid) return;
        const d = await D.api('reports.bkvc', { periodId: pid });
        await show(doc);
        side.innerHTML = '';
        side.append(h('div', { class: 'card' }, h('h2', {}, 'Thiết lập in'), h('p', {}, h('span', { class: 'mono' }, d.header.periodCode), ' ', D.tag(d.header.status), d.header.origin === 'IMPORTED' ? ' ' : '', d.header.origin === 'IMPORTED' ? D.tag('IMPORTED') : ''),
          h('p', { class: 'small' }, `${d.lines.length} xe · ${D.vn(d.totals.trips)} chuyến · ${D.vn(d.totals.ton, 2)} tấn`), h('p', {}, 'Tổng thanh toán: ', h('span', { class: 'money' }, D.vn(d.totals.total))),
          h('p', { class: 'small' }, h('i', {}, d.amountInWords)),
          h('div', { class: 'sep' }), h('div', { class: 'small' }, h('b', {}, d.signers.carrier.unitName), h('div', {}, `${d.signers.carrier.signer.title}: ${d.signers.carrier.signer.name}`),
            h('b', {}, d.signers.customer.unitName), h('div', {}, `${d.signers.customer.signer.title}: ${d.signers.customer.signer.name}`), h('div', { class: 'muted' }, 'Người ký theo thứ tự ưu tiên đã thống nhất; tên in sửa được trong Hợp đồng.')),
          h('div', { class: 'sep' }), h('div', { class: 'btns' }, printBtn('BKVC', () => ({ periodId: pid })), exportBtns('BKVC', () => ({ periodId: pid }))),
          h('div', { class: 'sep' }), h('h2', {}, 'Diễn giải để viết hóa đơn'), h('p', { class: 'small muted' }, `${d.invoiceLines.length} dòng (1 dòng / xe) — cùng số tấn, đơn giá, thành tiền, VAT với bảng trên.`),
          h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => D.modal({ title: 'Diễn giải cước để viết hóa đơn', wide: true, body: D.table({ rows: d.invoiceLines, columns: [{ key: 'seq', label: 'STT', fmt: 'int' }, { key: 'description', label: 'Diễn giải', wrap: true },
            { key: 'uom', label: 'ĐVT' }, { key: 'qty', label: 'Số lượng', fmt: 'dec2' }, { key: 'unit_price', label: 'Đơn giá', fmt: 'money' }, { key: 'amount', label: 'Thành tiền', fmt: 'money' }, { key: 'vat', label: 'Thuế GTGT', fmt: 'money' }, { key: 'total', label: 'Tổng', fmt: 'money' }],
            footer: { description: 'TỔNG CỘNG', amount: d.totals.amount, vat: d.totals.vat, total: d.totals.total } }) }) }, 'Xem'), exportBtns('INVOICE', () => ({ periodId: pid }))),
          docCard(), d.header.canInvoice ? misaBox(pid, d) : ''));
      };
      const pk = await periodPicker(p, load);
      const page = D.page('Bảng xác nhận KL & chứng từ in', '7 · BKVC · Bảng tính đơn giá · Biên bản giao nhận dầu', [h('label', { class: 'field wide' }, h('span', {}, 'Kỳ'), pk.sel)], h('div', { class: 'grid', style: { gridTemplateColumns: '1fr 340px' } }, h('div', { class: 'card' }, tabs, frame), side));
      await load(pk.first);
      return page;
    },
  };

  D.views.bkct = {
    async render(p) {
      const plate = h('input', { placeholder: 'biển số', 'aria-label': 'Biển số' }); const q = h('input', { placeholder: 'số phiếu', 'aria-label': 'Số phiếu' });
      const out = h('div', { class: 'card flush' }); let pid = '';
      const load = async (id) => {
        if (id !== undefined) pid = id; if (!pid) return;
        const d = await D.api('reports.bkct', { periodId: pid, plateNo: plate.value.trim().toUpperCase(), q: q.value.trim() });
        out.innerHTML = '';
        out.append(D.table({ rows: d.rows, columns: d.columns.map((c) => ({ key: c.key, label: c.header, fmt: c.fmt === 'text' ? undefined : c.fmt })), footer: { stt: `${d.totals.trips}`, ticket_no: 'TỔNG CỘNG', net_kg: d.totals.kg } }));
      };
      const pk = await periodPicker(p, load);
      const page = D.page('Chi tiết vận chuyển', '8 · Bảng kê chi tiết phiếu cân của kỳ', [printBtn('BKCT', () => ({ periodId: pid })), ...exportBtns('BKCT', () => ({ periodId: pid }))],
        h('div', { class: 'card' }, h('div', { class: 'filters' }, h('label', { class: 'field wide' }, h('span', {}, 'Kỳ'), pk.sel), h('label', { class: 'field' }, h('span', {}, 'Biển số'), plate), h('label', { class: 'field' }, h('span', {}, 'Số phiếu'), q), h('button', { class: 'btn primary', onclick: () => load() }, 'Lọc'))), out);
      await load(pk.first);
      return page;
    },
  };

  /** Lưu file báo cáo theo khoảng ngày (Excel / PDF / CSV). */
  const saveRange = (report, getParams, fmt, base) => async () => {
    const v = getParams(); const def = `${base}${v.plateNo ? `_${v.plateNo}` : ''}_${[v.dateFrom, v.dateTo].filter(Boolean).join('_') || 'TatCa'}.${fmt.toLowerCase()}`;
    const target = window.dgvc ? await D.pickFile({ title: `Lưu ${fmt}`, save: true, defaultPath: def }) : '';
    if (window.dgvc && !target) return;
    const r = await D.api('reports.export', { report, format: fmt, params: v, targetPath: target || undefined });
    D.toast(`Đã xuất ${fmt}: ${r.path}`, 'ok', 8000);
    if (window.dgvc) D.api('system.openPath', { path: r.path }, { quiet: true }).catch(() => {});
  };
  const rangeBtns = (report, getParams, base) => [h('button', { class: 'btn primary', onclick: saveRange(report, getParams, 'XLSX', base) }, 'Tải Excel'),
    h('button', { class: 'btn', onclick: saveRange(report, getParams, 'PDF', base) }, 'Xuất PDF'), h('button', { class: 'btn', onclick: async () => { await D.api('reports.print', { report, params: getParams() }); } }, 'In')];
  // mặc định 30 ngày gần nhất
  const monthStart = () => { const d = new Date(); d.setDate(d.getDate() - 30); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const colsOf = (d, extra = {}) => d.columns.map((c) => ({ key: c.key, label: c.header, fmt: { int: 'int', money: 'money', dec2: 'dec2', dec1: 'dec1', date: 'date' }[c.fmt], wrap: ['route_name', 'transport_unit_name', 'g1', 'g2'].includes(c.key), ...(extra[c.key] || {}) }));

  // Tổng hợp khối lượng vận chuyển theo khách hàng / nhóm xe / xe / tuyến / tháng …
  async function volumeTab(body) {
    const dims = [['CUSTOMER', 'Khách hàng (bên thuê)'], ['OWNER', 'Nhóm xe (chủ xe)'], ['PLATE', 'Xe'], ['ROUTE', 'Tuyến'], ['CONTRACT', 'Hợp đồng'], ['TRANSPORT_UNIT', 'Đơn vị VC trên phiếu'],
      ['TICKET_CUSTOMER', 'Khách hàng ghi trên phiếu'], ['ORIGIN', 'Nguồn gốc'], ['MONTH', 'Tháng'], ['DAY', 'Ngày']];
    const f = D.form([{ key: 'dateFrom', label: 'Từ ngày', type: 'date' }, { key: 'dateTo', label: 'Đến ngày', type: 'date' },
      { key: 'routeCode', label: 'Tuyến', type: 'select', options: D.routeOptions() },
      { key: 'groupBy', label: 'Tổng hợp theo', type: 'select', options: dims }, { key: 'groupBy2', label: 'Chi tiết theo', type: 'select', options: [['', '— không —'], ...dims] }],
    { dateFrom: monthStart(), dateTo: D.today(), groupBy: 'CUSTOMER', groupBy2: 'OWNER' });
    f.className = 'filters';
    const out = h('div');
    const params = () => { const v = f.values(); if (v.groupBy2 === v.groupBy) v.groupBy2 = ''; return v; };
    const load = async () => {
      const d = await D.api('reports.volume', params()); const T = d.totalsRow;
      out.innerHTML = '';
      out.append(h('div', { class: 'kpis' }, [['Số chuyến', D.vn(T.trips)], ['Số xe', D.vn(T.vehicles)], ['Khối lượng (tấn)', D.vn(T.ton, 2)], ['Nhóm', D.vn(d.rows.filter((r) => !r._b && r.g1).length)]]
        .map(([l, v], i) => h('div', { class: `kpi ${i === 2 ? 'main' : ''}` }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l)))));
      const bar = (r) => h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' } },
        h('div', { style: { width: '90px', height: '8px', background: 'var(--brand-soft)', borderRadius: '0 4px 4px 0' } }, h('div', { style: { width: `${Math.min(100, r.share)}%`, height: '100%', background: r._b ? 'var(--brand-dark)' : 'var(--brand)', borderRadius: '0 4px 4px 0' } })),
        h('span', { class: 'mono' }, `${D.vn(r.share, 2)}%`));
      const rows = d.rows.map((r) => ({ ...r, stt: r._b ? '' : r.stt }));
      out.append(h('div', { class: 'card flush' }, D.table({ rows, columns: colsOf(d, { share: { render: bar, num: true }, g1: { render: (r) => (r._b ? h('b', {}, r.g1) : r.g1) }, trips: { render: (r) => (r._b ? h('b', {}, D.vn(r.trips)) : D.vn(r.trips)), num: true } }),
        footer: { g1: 'TỔNG CỘNG', trips: T.trips, vehicles: T.vehicles, kg: T.kg, ton: T.ton, share: 100 }, empty: 'Không có phiếu cân trong khoảng ngày' })));
    };
    f.addEventListener('change', load);
    body.append(h('div', { class: 'card' }, h('div', { class: 'filters' }, f, h('button', { class: 'btn primary', onclick: load }, 'Xem'), h('span', { style: { flex: 1 } }), ...rangeBtns('VOLUME', params, 'TongHopKhoiLuong'))), out);
    await load();
  }

  // Danh sách phiếu cân theo ngày → Excel
  async function ticketTab(body) {
    const f = D.form([{ key: 'dateFrom', label: 'Từ ngày', type: 'date' }, { key: 'dateTo', label: 'Đến ngày', type: 'date' }, { key: 'routeCode', label: 'Tuyến', type: 'select', options: D.routeOptions() },
      { key: 'ownerUnitCode', label: 'Nhóm xe (chủ xe)', type: 'select', options: D.unitOptions(true) }, { key: 'plateNo', label: 'Biển số', type: 'text' }], { dateFrom: monthStart(), dateTo: D.today() });
    f.className = 'filters'; const out = h('div');
    const params = () => { const v = f.values(); v.plateNo = (v.plateNo || '').trim().toUpperCase(); return v; };
    const load = async () => {
      const d = await D.api('reports.tickets', params()); out.innerHTML = '';
      out.append(h('div', { class: 'card flush' }, D.table({ rows: d.rows.slice(0, 1000), maxHeight: '60vh', columns: colsOf(d).filter((c) => !['weigh2_time', 'weight1_kg', 'weight2_kg', 'origin', 'customer', 'weigh_type'].includes(c.key)),
        footer: d.totalsRow, empty: 'Không có phiếu cân' })), d.rows.length > 1000 ? h('p', { class: 'small muted' }, `Hiện 1.000 / ${D.vn(d.rows.length)} phiếu — tải Excel để xem đủ.`) : null);
    };
    f.addEventListener('change', load);
    body.append(h('div', { class: 'card' }, h('div', { class: 'filters' }, f, h('button', { class: 'btn primary', onclick: load }, 'Xem'), h('span', { style: { flex: 1 } }), ...rangeBtns('TICKETS', params, 'PhieuCan'))), out);
    await load();
  }

  // Bảng kê giao nhận dầu theo ngày → Excel
  async function fuelTab(body) {
    const f = D.form([{ key: 'dateFrom', label: 'Từ ngày', type: 'date' }, { key: 'dateTo', label: 'Đến ngày', type: 'date' }, { key: 'contractId', label: 'Hợp đồng', type: 'select', options: [['', 'Tất cả'], ...D.contractOptions()] },
      { key: 'giverUnitCode', label: 'Bên giao', type: 'select', options: D.unitOptions(true) }, { key: 'plateNo', label: 'Biển số', type: 'text' }], { dateFrom: monthStart(), dateTo: D.today() });
    f.className = 'filters'; const out = h('div');
    const params = () => { const v = f.values(); v.plateNo = (v.plateNo || '').trim().toUpperCase(); return v; };
    const load = async () => {
      const d = await D.api('reports.fuel', params()); out.innerHTML = '';
      out.append(h('div', { class: 'kpis' }, [['Lần nhận', D.vn(d.rows.length)], ['Số lít', D.vnAuto(d.totalsRow.qty_liter)], ['Thành tiền chưa VAT', D.vn(d.totalsRow.amount)], ['ĐG dầu bình quân', D.vn(d.avgPrice, 2)]]
        .map(([l, v], i) => h('div', { class: `kpi ${i === 1 ? 'main' : ''}` }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l)))));
      out.append(h('div', { class: 'card flush' }, D.table({ rows: d.rows, maxHeight: '60vh', columns: colsOf(d, { note: { render: (r) => (r.note ? D.tag('warn', r.note) : '') } }), footer: d.totalsRow, empty: 'Không có dòng dầu' })));
    };
    f.addEventListener('change', load);
    body.append(h('div', { class: 'card' }, h('div', { class: 'filters' }, f, h('button', { class: 'btn primary', onclick: load }, 'Xem'), h('span', { style: { flex: 1 } }), ...rangeBtns('FUEL_LIST', params, 'GiaoNhanDau'))), out);
    await load();
  }

  // Chốt đồng hồ km của xe (vd đầu năm, cuối năm) — không cần nhập hằng ngày
  async function odoEditor(p, reload) {
    if (!p.plateNo) { D.toast('Chọn xe trước', 'warn'); return; }
    const cur = await D.api('vehicleKm.list', { plateNo: p.plateNo });
    const box = h('tbody');
    const atSel = (v) => h('select', {}, h('option', { value: 'DAU_NGAY', selected: v === 'DAU_NGAY' }, 'Đầu ngày (trước các chuyến)'), h('option', { value: 'CUOI_NGAY', selected: v !== 'DAU_NGAY' }, 'Cuối ngày (sau các chuyến)'));
    const lines = [];
    const addLine = (r = {}) => {
      const l = { date: h('input', { type: 'date', value: r.date || '' }), odo: h('input', { type: 'number', min: '0', step: 'any', value: r.odometer ?? '', style: { width: '130px' }, placeholder: 'số đồng hồ' }),
        at: atSel(r.readAt || ''), note: h('input', { type: 'text', value: r.note || '', style: { width: '200px' } }), orig: r.date || '' };
      // gợi ý: ngày 01 của tháng → đầu ngày; ngày khác → cuối ngày
      l.date.addEventListener('change', () => { if (!r.date) l.at.value = l.date.value.endsWith('-01') ? 'DAU_NGAY' : 'CUOI_NGAY'; });
      const tr = h('tr', {}, h('td', {}, l.date), h('td', {}, l.odo), h('td', {}, l.at), h('td', {}, l.note),
        h('td', {}, h('button', { class: 'btn small', title: 'Xóa lần chốt này', onclick: () => { l.odo.value = ''; l.removed = true; tr.style.opacity = '.35'; } }, 'Xóa')));
      lines.push(l); box.append(tr);
    };
    cur.items.forEach(addLine);
    if (!cur.items.length) { const y = (p.dateFrom || D.today()).slice(0, 4); addLine({ date: `${y}-01-01`, readAt: 'DAU_NGAY' }); addLine({ date: `${y}-12-31`, readAt: 'CUOI_NGAY' }); }
    const warn = h('div', { class: 'small', style: { color: 'var(--red-dark)', marginTop: '8px' } }, cur.warnings.map((w) => h('div', {}, '⚠ ', w.message)));
    D.modal({ title: `Chốt đồng hồ km — xe ${p.plateNo}`, wide: true,
      body: h('div', {}, h('p', { class: 'small muted', style: { marginTop: 0 } }, 'Không cần nhập hằng ngày: chỉ cần chốt số đồng hồ km ở vài thời điểm (vd sáng 01/01 và tối 31/12, hoặc cuối mỗi tháng). Giữa 2 lần chốt liền nhau, phần mềm lấy km đồng hồ = số sau − số trước, so với km theo tuyến (Σ cự ly đi + về của các chuyến trong khoảng đó) → chênh lệch.'),
        h('div', { class: 'tbl-wrap', style: { maxHeight: '50vh' } }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Ngày chốt', 'Số đồng hồ km', 'Lúc chốt', 'Ghi chú', ''].map((x) => h('th', {}, x)))), box)),
        h('div', { class: 'btns', style: { marginTop: '8px' } }, h('button', { class: 'btn small', onclick: () => addLine({}) }, '+ Thêm lần chốt')), warn),
      actions: [{ label: 'Hủy', run: () => true }, { label: 'Lưu', primary: true, run: async () => {
        const rows = []; const seen = new Set();
        for (const l of lines) {
          if (l.orig && l.orig !== l.date.value) rows.push({ date: l.orig, odometer: '' }); // đổi ngày chốt = xóa ngày cũ
          if (!l.date.value) { if (l.odo.value !== '') { D.toast('Có lần chốt chưa chọn ngày', 'err'); return false; } continue; }
          if (seen.has(l.date.value)) { D.toast(`Trùng ngày chốt ${D.dmy(l.date.value)}`, 'err'); return false; } seen.add(l.date.value);
          if (l.odo.value === '' && !l.orig) continue;
          rows.push({ date: l.date.value, odometer: l.odo.value, readAt: l.at.value, note: l.note.value });
        }
        const r = await D.api('vehicleKm.save', { plateNo: p.plateNo, rows });
        D.toast(`Đã lưu chốt đồng hồ: thêm ${r.added} · sửa ${r.updated} · xóa ${r.deleted}`, 'ok', 7000); await reload(); return true; } }] });
  }

  // Nhật trình vận chuyển 1 xe theo tháng / quý / năm
  async function vehicleLogTab(body, p) {
    const veh = (await D.api('vehicles.list', {})).items;
    const now = new Date(); const y0 = now.getFullYear(); const m0 = now.getMonth() + 1;
    const f = D.form([{ key: 'plateNo', label: 'Xe', type: 'select', options: veh.map((x) => [x.plate_no, `${x.plate_no} · ${x.owner_unit_code}${x.is_active ? '' : ' (ngừng)'}`]) },
      { key: 'kind', label: 'Theo', type: 'select', options: [['MONTH', 'Tháng'], ['QUARTER', 'Quý'], ['YEAR', 'Năm'], ['RANGE', 'Khoảng ngày']] },
      { key: 'year', label: 'Năm', type: 'number' }, { key: 'month', label: 'Tháng', type: 'select', options: Array.from({ length: 12 }, (_, i) => [String(i + 1), `Tháng ${i + 1}`]) },
      { key: 'quarter', label: 'Quý', type: 'select', options: [['1', 'Quý 1'], ['2', 'Quý 2'], ['3', 'Quý 3'], ['4', 'Quý 4']] },
      { key: 'dateFrom', label: 'Từ ngày', type: 'date' }, { key: 'dateTo', label: 'Đến ngày', type: 'date' }],
    { plateNo: p.plateNo || (veh.find((x) => x.is_active) || veh[0] || {}).plate_no, kind: 'MONTH', year: y0, month: String(m0), quarter: String(Math.ceil(m0 / 3)), dateFrom: monthStart(), dateTo: D.today() });
    f.className = 'filters'; const out = h('div');
    const pad = (n) => String(n).padStart(2, '0');
    const last = (y, m) => new Date(y, m, 0).getDate();
    const params = () => {
      const v = f.values(); const y = Number(v.year) || y0;
      if (v.kind === 'MONTH') { const m = Number(v.month); return { plateNo: v.plateNo, dateFrom: `${y}-${pad(m)}-01`, dateTo: `${y}-${pad(m)}-${last(y, m)}`, label: `Tháng ${pad(m)}/${y}` }; }
      if (v.kind === 'QUARTER') { const q = Number(v.quarter); const a = q * 3 - 2; return { plateNo: v.plateNo, dateFrom: `${y}-${pad(a)}-01`, dateTo: `${y}-${pad(a + 2)}-${last(y, a + 2)}`, label: `Quý ${q}/${y}` }; }
      if (v.kind === 'YEAR') return { plateNo: v.plateNo, dateFrom: `${y}-01-01`, dateTo: `${y}-12-31`, label: `Năm ${y}` };
      return { plateNo: v.plateNo, dateFrom: v.dateFrom, dateTo: v.dateTo, label: '' };
    };
    const show = () => { const k = f.values().kind; const vis = { year: k !== 'RANGE', month: k === 'MONTH', quarter: k === 'QUARTER', dateFrom: k === 'RANGE', dateTo: k === 'RANGE' };
      for (const [key, on] of Object.entries(vis)) f.inputs[key].closest('label').style.display = on ? '' : 'none'; };
    const load = async () => {
      show(); const d = await D.api('reports.vehicleLog', params()); const S = d.summary; out.innerHTML = '';
      out.append(h('div', { class: 'kpis' }, [['Số chuyến', D.vn(S.trips)], ['Km theo tuyến', D.vn(S.km)], ['KL hàng (tấn)', D.vn(S.ton, 2)], ['Dầu nhận (lít)', D.vnAuto(S.fuel)],
        ['Dầu định mức (lít)', D.vnAuto(S.norm)], ['Lít / 100 km (theo tuyến)', S.per100 === null ? '—' : D.vn(S.per100, 2)]]
        .map(([l, v], i) => h('div', { class: `kpi ${i === 1 ? 'main' : ''}` }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l)))));
      out.append(h('div', { class: 'card flush' }, h('div', { class: 'card-h' }, h('h2', {}, d.title), h('div', { class: 'small muted' }, d.subtitle)),
        D.table({ rows: d.rows.map((r) => ({ ...r })), maxHeight: '60vh', empty: 'Xe không có chuyến / dầu trong kỳ',
          columns: colsOf(d, { route: { render: (r) => (r._b ? h('b', {}, r.route) : h('span', { style: { whiteSpace: 'nowrap' } }, r.route)) }, ticket_nos: { wrap: true, render: (r) => h('span', { class: 'small', style: { display: 'inline-block', minWidth: '220px' } }, r.ticket_nos) }, owner: { render: (r) => h('span', { style: { whiteSpace: 'nowrap' } }, r.owner) }, odo: { render: (r) => h('span', { class: 'nowrap small' }, r.odo) }, depot: { wrap: true } }), footer: d.totalsRow })));
      const O = d.odo;
      if (O.segments.length) {
        const T = O.total;
        out.append(h('div', { class: 'kpis' }, [['Km đồng hồ', D.vnAuto(T.odoKm), `${T.fromText} → ${T.toText}`], ['Km theo tuyến (cùng khoảng)', D.vn(T.routeKm), `${D.vn(T.trips)} chuyến`],
          ['Chênh lệch (đồng hồ − tuyến)', `${T.diffKm > 0 ? '+' : ''}${D.vnAuto(T.diffKm)} km`, T.diffPct === null ? '' : `${T.diffPct > 0 ? '+' : ''}${D.vn(T.diffPct, 1)}%`], ['Lít / 100 km (đồng hồ)', T.per100 === null ? '—' : D.vn(T.per100, 2), `dầu nhận ${D.vnAuto(T.fuel)} lít`]]
          .map(([l, v, sub], i) => h('div', { class: `kpi ${i === 2 && Math.abs(T.diffPct || 0) > 10 ? 'bad' : ''}` }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l), sub ? h('div', { class: 'small muted' }, sub) : null))));
        const x = d.extraTables[0];
        out.append(h('div', { class: 'card flush' }, h('div', { class: 'card-h' }, h('h2', {}, x.title)),
          D.table({ rows: O.segments, columns: x.columns.map((c) => ({ key: c.key, label: c.header, fmt: { int: 'int', dec1: 'dec1', dec2: 'dec2' }[c.fmt],
            ...(c.key === 'diffKm' ? { render: (r) => h('b', { style: { color: Math.abs(r.diffPct || 0) > 10 ? 'var(--red-dark)' : '' } }, `${r.diffKm > 0 ? '+' : ''}${D.vnAuto(r.diffKm)}`), num: true } : {}),
            ...(c.key === 'warn' ? { render: (r) => (r.warn ? h('span', { class: 'tag err' }, r.warn) : '') } : {}) })), footer: x.totalsRow || undefined })));
      } else {
        out.append(h('div', { class: 'card small muted' }, O.readings.length === 1 ? 'Mới có 1 lần chốt đồng hồ trong kỳ — cần ít nhất 2 lần chốt (vd đầu năm và cuối năm) để tính km đồng hồ và chênh lệch.'
          : 'Chưa chốt đồng hồ km cho xe trong kỳ này. Bấm "Chốt đồng hồ km…" và nhập số đồng hồ đầu kỳ, cuối kỳ để đối chiếu km thực tế với km theo tuyến.'));
      }
    };
    f.addEventListener('change', load);
    body.append(h('div', { class: 'card' }, h('div', { class: 'filters' }, f, h('button', { class: 'btn primary', onclick: load }, 'Xem'), h('span', { style: { flex: 1 } }),
      D.writer() ? h('button', { class: 'btn', onclick: () => odoEditor(params(), load) }, 'Chốt đồng hồ km…') : null, ...rangeBtns('VEHICLE_LOG', params, 'NhatTrinh')),
      h('p', { class: 'small muted', style: { margin: '8px 0 0' } }, 'Cự ly = 1 chiều theo danh mục tuyến; Km theo tuyến = cự ly chuyến (đi + về) × số chuyến; Chốt đồng hồ km: chỉ cần chốt đầu / cuối kỳ (nút Chốt đồng hồ km) → bảng đối chiếu km đồng hồ với km theo tuyến; Dầu nhận = bảng kê dầu của xe trong ngày (dòng bù trừ âm được trừ); Dầu định mức = số km × định mức lít/km; Chủ hàng = bên thuê của hợp đồng.')), out);
    await load();
  }

  D.views.reports = {
    async render(p) {
      const tab = p.tab || 'periods';
      const TABS = [['periods', 'Kỳ tính'], ['volume', 'Tổng hợp khối lượng'], ['vehicle', 'Nhật trình xe'], ['tickets', 'Phiếu cân'], ['fuel', 'Giao nhận dầu']];
      const tabs = h('div', { class: 'tabs', role: 'tablist' }, TABS.map(([k, t]) => h('button', { role: 'tab', 'aria-selected': String(tab === k), onclick: () => D.go('reports', { tab: k }) }, t)));
      if (tab !== 'periods') {
        const body = h('div');
        const page = D.page('Báo cáo', `9 · ${TABS.find((x) => x[0] === tab)[1]}`, [], tabs, body);
        await ({ volume: volumeTab, vehicle: vehicleLogTab, tickets: ticketTab, fuel: fuelTab }[tab])(body, p);
        return page;
      }
      const f = D.form([{ key: 'contractId', label: 'Hợp đồng', type: 'select', options: [['', 'Tất cả'], ...D.contractOptions()] }, { key: 'status', label: 'Trạng thái', type: 'select', options: [['', 'Tất cả'], ['NHAP', 'Nháp'], ['DA_XAC_NHAN', 'Đã xác nhận'], ['DA_KHOA', 'Đã khóa']] },
        { key: 'dateFrom', label: 'Từ ngày', type: 'date' }, { key: 'dateTo', label: 'Đến ngày', type: 'date' }], {});
      f.className = 'filters';
      const out = h('div', { class: 'card flush' });
      const load = async () => {
        const d = await D.api('periods.list', f.values());
        out.innerHTML = '';
        out.append(D.table({ rows: d.items.filter((x) => x.status !== 'HUY'), columns: [{ key: 'period_code', label: 'Kỳ' }, { key: 'status', label: 'Trạng thái', fmt: 'tag' }, { key: 'origin', label: 'Nguồn', fmt: 'tag' },
          { key: 'date_from', label: 'Từ', fmt: 'date' }, { key: 'date_to', label: 'Đến', fmt: 'date' }, { key: 'r', label: 'Đơn giá VC', num: true, render: (r) => r.routes.map((x) => `${x.routeCode}: ${D.vn(x.transportPrice)}`).join(' · ') },
          { key: 'trips', label: 'Chuyến', fmt: 'int' }, { key: 'ton', label: 'Tấn', fmt: 'dec2' }, { key: 'totalInclVat', label: 'Tổng thanh toán', fmt: 'money' },
          { key: 'x', label: 'Xuất', render: (r) => h('div', { class: 'btns' }, ['BKVC', 'PRICING_SHEET', 'FUEL_HANDOVER', 'BKCT', 'PRICING', 'INVOICE', ...(r.role === 'CARRIER' && r.origin !== 'IMPORTED' ? ['MISA'] : [])].map((rep) => h('button', { class: 'btn small', onclick: async (e) => { e.stopPropagation(); const x = await D.api('reports.export', { report: rep, format: 'XLSX', params: { periodId: r.period_id } }); D.toast(`Đã xuất ${x.path}`, 'ok', 8000); } },
            { BKVC: 'BKVC', PRICING_SHEET: 'Bảng tính ĐG', FUEL_HANDOVER: 'BB giao nhận dầu', BKCT: 'Bảng kê', PRICING: 'ĐG 17 cột', INVOICE: 'Diễn giải HĐ', MISA: 'HĐ MISA' }[rep]))) }],
        onRow: (r) => D.go(r.role === 'CARRIER' ? 'calc' : 'bkvc', { periodId: r.period_id }) }));
      };
      const page = D.page('Báo cáo', '9 · Danh sách kỳ và xuất báo cáo', [], tabs, h('div', { class: 'card' }, h('div', { class: 'filters' }, f, h('button', { class: 'btn primary', onclick: load }, 'Lọc'))), out);
      await load();
      return page;
    },
  };
})();
