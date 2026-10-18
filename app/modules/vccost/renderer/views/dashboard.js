'use strict';
/** Dashboard + Báo cáo tổng hợp (theo xe/đơn vị/nơi xuất/ngày/đợt) + Bảng kê thanh toán. */
(() => {
  const { h, fmt, api, call, table, tag } = App;

  const kpi = (label, value, unit, { warn = false, onClick = null } = {}) =>
    h('div', { class: 'kpi' + (warn ? ' warn' : '') + (onClick ? ' click' : ''), onclick: onClick }, h('small', {}, label), h('b', {}, value), unit ? h('span', { class: 'u' }, ' ' + unit) : null);

  function bars(rows, valueKey, labelKey, f) {
    const max = Math.max(1, ...rows.map((r) => Number(r[valueKey]) || 0));
    return h('div', { class: 'bars' }, rows.map((r) => h('div', { class: 'bar' }, h('span', {}, r[labelKey]),
      h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: `${(Number(r[valueKey]) / max) * 100}%` } })), h('span', { class: 'num' }, f(r[valueKey])))));
  }
  function columns(rows, valueKey, labelKey, f) {
    const max = Math.max(1, ...rows.map((r) => Number(r[valueKey]) || 0));
    return h('div', {}, h('div', { class: 'cols' }, rows.map((r) => h('div', { class: 'c', title: `${fmt.date(r[labelKey])}: ${f(r[valueKey])}`, style: { height: `${Math.max(2, (Number(r[valueKey]) / max) * 100)}%` } }))),
      h('div', { class: 'collabels' }, rows.map((r) => h('span', {}, String(r[labelKey]).slice(8, 10)))));
  }

  /** Kỳ chọn nhanh cho Dashboard: tháng/quý/năm + các kỳ đã chốt. */
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function presets() {
    const n = new Date(), y = n.getFullYear(), m = n.getMonth(), q = Math.floor(m / 3);
    return [
      ['thang_nay', 'Tháng này', { tu_ngay: iso(new Date(y, m, 1)), den_ngay: iso(new Date(y, m + 1, 0)) }],
      ['thang_truoc', 'Tháng trước', { tu_ngay: iso(new Date(y, m - 1, 1)), den_ngay: iso(new Date(y, m, 0)) }],
      ['quy_nay', 'Quý này', { tu_ngay: iso(new Date(y, q * 3, 1)), den_ngay: iso(new Date(y, q * 3 + 3, 0)) }],
      ['nam_nay', 'Năm nay', { tu_ngay: `${y}-01-01`, den_ngay: `${y}-12-31` }],
    ];
  }

  App.register('dashboard', {
    async render(v) {
      const body = h('div', {});
      const locks = (await api('lock.list')) || [];
      const P = presets();
      const sel = h('select', { onchange: (e) => {
        const val = e.target.value; const F = App.state.filter;
        if (val === '') return;
        F.dot_id = ''; F.don_vi_id = ''; F.tu_ngay = ''; F.den_ngay = '';
        if (val === 'all') { /* không lọc */ } else if (val.startsWith('ck:')) {
          const k = locks.find((x) => String(x.id) === val.slice(3));
          if (k.loai === 'DOT') F.dot_id = String(k.dot_van_chuyen_id); else { F.tu_ngay = k.tu_ngay; F.den_ngay = k.den_ngay; }
          if (k.don_vi_van_chuyen_id) F.don_vi_id = String(k.don_vi_van_chuyen_id);
        } else Object.assign(F, P.find((x) => x[0] === val)[2]);
        App.reload();
      } }, h('option', { value: '' }, '— Chọn kỳ nhanh —'), h('option', { value: 'all' }, 'Tất cả thời gian'),
        h('optgroup', { label: 'Theo lịch' }, P.map((x) => h('option', { value: x[0] }, x[1]))),
        locks.length ? h('optgroup', { label: 'Kỳ đã chốt' }, locks.filter((k) => k.trang_thai === 'DA_CHOT').map((k) => h('option', { value: `ck:${k.id}` },
          `${k.ma} · ${k.loai === 'DOT' ? `Đợt ${k.ma_dot}` : `${fmt.date(k.tu_ngay)} – ${fmt.date(k.den_ngay)}`}${k.don_vi ? ` · ${k.don_vi}` : ''}`))) : null);
      const load = async () => {
        const d = await api('reports.dashboard', App.cleanFilter(App.state.filter));
        App.clear(body);
        const k = d.kpi, cu = k.chua_tinh;
        const F = App.state.filter;
        body.append(
          h('p', { class: 'muted', style: { marginTop: 0 } }, `Số liệu chính chỉ gồm phiếu ĐÃ TÍNH GIÁ (khớp Bảng kê) — ${fmt.int(k.so_chuyen)} phiếu${k.da_chot ? `, trong đó ${fmt.int(k.da_chot)} đã chốt kỳ` : ''}.`),
          h('div', { class: 'grid g6', style: { marginBottom: '14px' } },
            kpi('Số chuyến', fmt.int(k.so_chuyen)), kpi('Khối lượng', fmt.tan(k.tong_kg / 1000), 'tấn'), kpi('Số xe', fmt.int(k.so_xe)),
            kpi('Chi phí trước VAT', fmt.money(k.tien_truoc_vat), 'đ'), kpi('VAT', fmt.money(k.tien_vat), 'đ'), kpi('Tổng cộng (tham khảo)', fmt.money(k.tong_tien), 'đ')),
          h('div', { class: 'card', style: cu.so_chuyen ? { borderLeft: '4px solid var(--amber)' } : null },
            h('h3', {}, `Phiếu chưa tính giá — ${fmt.int(cu.so_chuyen)} phiếu · ${fmt.tan(cu.tong_kg / 1000)} tấn`),
            cu.so_chuyen ? h('div', {}, table({ columns: [
              { key: 'trang_thai', label: 'Lý do', render: (r) => (r.trang_thai === 'THIEU_DU_LIEU_GIA' ? h('span', { class: 'tag amber' }, 'Thiếu dữ liệu giá / đơn vị') : App.tag(r.trang_thai)) },
              { key: 'so_chuyen', label: 'Số phiếu', fmt: 'int' }, { key: 'tong_kg', label: 'KL (tấn)', render: (r) => fmt.tan(r.tong_kg / 1000), num: true }],
            rows: cu.theo_trang_thai, onRow: (r) => App.go('tickets', { chua_tinh_gia: true, ...(r.trang_thai !== 'THIEU_DU_LIEU_GIA' ? { trang_thai_tinh_gia: r.trang_thai } : {}) }) }),
            h('p', { class: 'muted small' }, 'Bấm một dòng để xem danh sách phiếu cần xử lý. Phiếu chưa tính giá không nằm trong số liệu ở trên và chặn chốt kỳ.'))
              : h('p', { class: 'muted' }, '✓ Mọi phiếu trong bộ lọc đều đã tính giá.')),
          h('div', { class: 'grid g4', style: { marginBottom: '14px' } },
            kpi('Cần đối chiếu', fmt.int(k.can_doi_chieu), 'phiếu'),
            kpi('Phiếu đã chốt kỳ', fmt.int(k.da_chot || 0), 'phiếu', { onClick: () => App.go('lock') })),
          d.giamDinh && d.giamDinh.kl_giam_dinh_tan !== null ? h('div', { class: 'grid g3', style: { marginBottom: '14px' } }, kpi('KL cân (tấn)', fmt.tan(k.tong_kg / 1000)), kpi('KL giám định (tấn)', fmt.tan(d.giamDinh.kl_giam_dinh_tan)),
            kpi('Chênh giám định − cân', fmt.tan(d.giamDinh.chenh_giam_dinh_tan), `tấn (${d.giamDinh.chenh_giam_dinh_pct}%) — chỉ để đối chiếu, cước tính theo KL cân`)) : "",
          h('div', { class: 'grid g2' },
            h('div', { class: 'card' }, h('h3', {}, 'Khối lượng theo ngày (tấn)'), columns(d.byDate, 'tong_tan', 'label', fmt.tan)),
            h('div', { class: 'card' }, h('h3', {}, 'Khối lượng theo nơi xuất (tấn)'), bars(d.byOrigin, 'tong_tan', 'label', fmt.tan)),
            h('div', { class: 'card' }, h('h3', {}, 'Chi phí theo đơn vị vận chuyển (đ, tham khảo)'), bars(d.byCarrier, 'tong_tien', 'label', fmt.money)),
            h('div', { class: 'card' }, h('h3', {}, 'Top xe nhiều chuyến'), table({ columns: [{ key: 'label', label: 'Biển số', mono: true }, { key: 'so_chuyen', label: 'Chuyến', fmt: 'int' }, { key: 'tong_kg', label: 'KL (tấn)', render: (r) => fmt.tan(r.tong_kg / 1000), num: true }], rows: d.topTrips }))));
      };
      v.append(App.pageHead('Dashboard', 'Tổng quan chi phí vận chuyển theo kỳ / bộ lọc', h('label', { class: 'field' }, 'Kỳ thể hiện', sel)), await App.filterBar(load), body);
      await load();
    },
  });

  // ------------------------------------------------------------ báo cáo
  const RP = {
    vehicle: { title: 'Báo cáo theo xe', ch: 'reports.byVehicle', first: 'Biển số', click: (r) => App.go('vehicle', { bien_so: r.label }) },
    carrier: { title: 'Báo cáo theo đơn vị vận chuyển', ch: 'reports.byCarrier', first: 'Đơn vị', click: (r) => r.k && App.go('tickets', { don_vi_id: r.k }) },
    origin: { title: 'Báo cáo theo nơi xuất', ch: 'reports.byOrigin', first: 'Nơi xuất', click: (r) => r.k && App.go('tickets', { noi_xuat_id: r.k }) },
    date: { title: 'Báo cáo theo thời gian (ngày)', ch: 'reports.byDate', first: 'Ngày', click: (r) => App.go('tickets', { tu_ngay: r.k, den_ngay: r.k }), fmtLabel: fmt.date },
    dot: { title: 'Báo cáo theo đợt / tàu', ch: 'reports.byDot', first: 'Đợt', click: (r) => r.k && App.go('tickets', { dot_id: r.k }) },
  };
  App.register('rp', {
    async render(v, { arg }) {
      const def = RP[arg];
      const body = h('div', {});
      const load = async () => {
        const f = App.cleanFilter(App.state.filter);
        const rows = await api(def.ch, f);
        const tot = rows.reduce((a, r) => ({ so_chuyen: a.so_chuyen + r.so_chuyen, tong_kg: a.tong_kg + r.tong_kg, tong_tan: a.tong_tan + r.tong_tan, tien_truoc_vat: a.tien_truoc_vat + r.tien_truoc_vat, tien_vat: a.tien_vat + r.tien_vat, tong_tien: a.tong_tien + r.tong_tien, chua_tinh_gia: a.chua_tinh_gia + r.chua_tinh_gia }),
          { so_chuyen: 0, tong_kg: 0, tong_tan: 0, tien_truoc_vat: 0, tien_vat: 0, tong_tien: 0, chua_tinh_gia: 0 });
        const chua = tot.chua_tinh_gia;
        App.clear(body).append(h('div', { class: 'card' },
          h('p', { class: 'muted', style: { marginTop: 0 } }, 'Số tiền theo dòng là phân bổ chưa làm tròn (tham khảo). Số thanh toán chính thức xem ở "Bảng kê thanh toán".'),
          chua ? h('p', { class: 'tag amber', style: { cursor: 'pointer' }, onclick: () => App.go('tickets', { chua_tinh_gia: '1' }) }, `⚠ ${chua} chuyến chưa tính được giá — chưa nằm trong số tiền (bấm để xem)`) : null,
          table({
            columns: [
              { key: 'label', label: def.first, mono: true, fmt: def.fmtLabel },
              ...(arg === 'vehicle' ? [{ key: 'don_vi', label: 'Đơn vị' }] : []),
              { key: 'so_chuyen', label: 'Chuyến', fmt: 'int' }, ...(arg !== 'vehicle' ? [{ key: 'so_xe', label: 'Xe', fmt: 'int' }] : []),
              { key: 'tong_tan', label: 'KL cân (tấn)', fmt: 'tan' }, ...(arg === 'dot' ? [{ key: 'kl_giam_dinh_tan', label: 'KL giám định (tấn)', fmt: 'tan' }, { key: 'chenh_giam_dinh_tan', label: 'Chênh (GĐ − cân)', fmt: 'tan' }, { key: 'chenh_giam_dinh_pct', label: '%', num: true, fmt: (x) => (x === null || x === undefined ? '' : `${Number(x).toLocaleString('vi-VN')}%`) }] : []), { key: 'don_gia', label: 'Đơn giá', num: true, fmt: (x) => (x || []).map(fmt.money).join(' / ') },
              { key: 'tien_truoc_vat', label: 'Trước VAT', fmt: 'money' }, { key: 'tien_vat', label: 'VAT', fmt: 'money' }, { key: 'tong_tien', label: 'Tổng', fmt: 'money' },
            ], rows, totals: { ...tot, label: null }, onRow: def.click, wrapClass: 'tall',
          })));
      };
      v.append(App.pageHead(def.title, 'Bấm một dòng để xem chi tiết', h('span', { class: 'row gap-s' }, h('button', { class: 'btn ghost', 'data-act': 'xlsx', onclick: () => App.exportXlsx('export.report', { kind: arg, filter: App.cleanFilter(App.state.filter) }) }, '⬇ Excel (in/ký)'), h('button', { class: 'btn ghost', 'data-act': 'pdf', onclick: () => App.exportXlsx('export.reportPdf', { kind: arg, filter: App.cleanFilter(App.state.filter) }) }, '⬇ PDF'))),
        await App.filterBar(load), body);
      await load();
    },
  });

  // ------------------------------------------------------------ biểu mẫu in/ký 2 bên
  App.register('forms', {
    async render(v) {
      const body = h('div', {});
      const load = async () => {
        const f = App.cleanFilter(App.state.filter);
        const pv = await api('forms.preview', { filter: f }); if (!pv) return;
        const btns = (x, p) => h('span', { class: 'row gap-s' }, h('button', { class: 'btn', 'data-act': `${p}-xlsx`, onclick: () => App.exportXlsx(`export.${x}`, { filter: f }) }, '⬇ Excel (in/ký)'), h('button', { class: 'btn ghost', 'data-act': `${p}-pdf`, onclick: () => App.exportXlsx(`export.${x}Pdf`, { filter: f }) }, '⬇ PDF'));
        App.clear(body).append(
          h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('h3', {}, '1. Tổng hợp xuất hàng theo tàu — 2 bên ký'), h('div', { class: 'muted' }, `${pv.period} · mỗi đơn vị × nơi xuất một bảng (số xe, chuyến, KG, tấn, đơn giá, thành tiền, VAT, tổng) kèm bằng chữ và chữ ký Bên A / Bên B`)), btns('tauSummary', 'tau')),
            table({ columns: [{ key: 'don_vi', label: 'Đơn vị (Bên B)' }, { key: 'noi_xuat', label: 'Nơi xuất' }, { key: 'xe', label: 'Xe', fmt: 'int' }, { key: 'so_chuyen', label: 'Chuyến', fmt: 'int' }, { key: 'kg', label: 'KG', fmt: 'int' }, { key: 'tong', label: 'Tổng tiền (gồm VAT)', fmt: 'money' }], rows: pv.tau, empty: 'Chưa có phiếu đã tính giá theo bộ lọc' })),
          h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('h3', {}, '2. Chi tiết vận chuyển — từng xe, từng chuyến'), h('div', { class: 'muted' }, 'Số phiếu, giờ cân 1/2, cân lần 1/2, KL (KG, tấn), nơi xuất/đến, đơn giá, thành tiền; cộng theo từng xe; mỗi đơn vị một bảng có chữ ký 2 bên')), btns('detail', 'detail')),
            table({ columns: [{ key: 'don_vi', label: 'Đơn vị (Bên B)' }, { key: 'xe', label: 'Xe', fmt: 'int' }, { key: 'so_chuyen', label: 'Chuyến', fmt: 'int' }, { key: 'kg', label: 'KG', fmt: 'int' }, { key: 'chuaTinh', label: 'Chưa tính giá', fmt: 'int' }], rows: pv.detail, empty: 'Chưa có phiếu theo bộ lọc' })),
          h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('h3', {}, '3. Bảng tính đơn giá vận chuyển'), h('div', { class: 'muted' }, 'Từng tuyến, từng bước tính theo giá dầu; chọn giá dầu và bên ký ở màn "Bảng tính đơn giá"')), h('button', { class: 'btn', onclick: () => App.go('pricecalc') }, 'Mở Bảng tính đơn giá →'))));
      };
      v.append(App.pageHead('Biểu mẫu in ký 2 bên', 'Excel chuẩn in A4 + PDF · Times New Roman · có KG · chữ ký Bên A / Bên B'), await App.filterBar(load, { fields: ['tu_ngay', 'den_ngay', 'dot_id', 'don_vi_id', 'noi_xuat_id', 'bien_so'] }), body);
      await load();
    },
  });

  // ------------------------------------------------------------ bảng kê
  App.register('statements', {
    async render(v) {
      const body = h('div', {});
      const load = async () => {
        const f = App.cleanFilter(App.state.filter);
        App.clear(body);
        if (!f.don_vi_id) {
          const sts = await api('reports.statements', f);
          body.append(h('div', { class: 'card' }, h('h3', {}, 'Tổng hợp bảng kê theo từng đơn vị (hóa đơn xuất riêng)'),
            table({
              columns: [{ key: 'don_vi', label: 'Đơn vị', render: (s) => s.don_vi.ma, mono: true }, { key: 'so_chuyen', label: 'Chuyến', fmt: 'int' }, { key: 'tong_tan', label: 'KL (tấn)', fmt: 'tan' },
                { key: 'tien_truoc_vat', label: 'Thành tiền', fmt: 'money' }, { key: 'tien_vat', label: 'VAT', fmt: 'money' }, { key: 'tong_tien', label: 'Tổng thanh toán', fmt: 'money' }],
              rows: sts, onRow: (s) => { App.state.filter.don_vi_id = String(s.don_vi.id); App.reload(); },
            }), (() => { const n = sts.reduce((a, s) => a + (s.so_chuyen_chua_tinh_gia || 0), 0); return n ? h('p', { class: 'tag amber' }, `⚠ ${n} chuyến chưa tính được giá — chưa nằm trong bảng kê`) : null; })(),
            h('p', { class: 'muted' }, 'Chọn đơn vị ở bộ lọc (hoặc bấm một dòng) để xem bảng kê chi tiết, xuất Excel/PDF để in và ký.')));
          return;
        }
        const st = await api('reports.statement', f);
        // Lô đối chiếu khối lượng 2 bên (tùy chọn): lọc theo đơn vị đang xem
        const batches = (await api('recon.batches')).filter((b) => !b.don_vi_van_chuyen_id || String(b.don_vi_van_chuyen_id) === String(f.don_vi_id));
        if (!batches.some((b) => String(b.id) === String(App.state.reconBatch))) App.state.reconBatch = '';
        const rid = App.state.reconBatch || null;
        const wr = rid ? await api('recon.weight', { batchId: rid }) : null;
        const KET = { KHOP: ['green', 'Khớp'], LECH: ['red', 'Lệch'], CHI_BEN_A: ['amber', 'Chỉ Bên A có'], CHI_BEN_B: ['amber', 'Chỉ Bên B có'] };
        const reconSel = h('select', { 'data-f': 'recon-batch', onchange: (e) => { App.state.reconBatch = e.target.value; load(); } }, h('option', { value: '' }, '— Không kèm đối chiếu —'),
          batches.map((b) => h('option', { value: b.id, selected: String(b.id) === String(rid) }, `#${b.id} ${b.ten}${b.don_vi ? ` (${b.don_vi})` : ''}`)));
        body.append(h('div', { class: 'card stmt' },
          h('div', { class: 'row' }, h('div', { class: 'grow' }, h('h3', { style: { fontSize: '17px' } }, `BẢNG KÊ — ${st.don_vi.ten || st.don_vi.ma}`), h('div', { class: 'muted' }, `MST: ${st.don_vi.ma_so_thue || '—'} · ${st.so_chuyen} chuyến · ${st.so_xe} xe · ${fmt.tan(st.tong_tan)} tấn`)),
            h('span', { class: 'row gap-s' }, h('button', { class: 'btn', 'data-act': 'xlsx', onclick: () => App.exportXlsx('export.statement', { filter: f, reconBatchId: rid }) }, '⬇ Excel (in/ký)'), h('button', { class: 'btn ghost', 'data-act': 'pdf', onclick: () => App.exportXlsx('export.statementPdf', { filter: f, reconBatchId: rid }) }, '⬇ PDF'))),
          st.so_chuyen_chua_tinh_gia ? h('p', { class: 'tag red' }, `${st.so_chuyen_chua_tinh_gia} chuyến chưa tính được giá — không có trong bảng kê`) : null,
          table({
            columns: [{ key: 'tuyen', label: 'Tuyến' }, { key: 'so_xe', label: 'Xe', fmt: 'int' }, { key: 'so_chuyen', label: 'Chuyến', fmt: 'int' }, { key: 'tong_tan', label: 'KL (tấn)', fmt: 'tan' },
              { key: 'don_gia', label: 'Đơn giá', fmt: 'money' }, { key: 'vat_percent', label: 'VAT', fmt: 'pct', num: true }, { key: 'thanh_tien', label: 'Thành tiền', fmt: 'money' }],
            rows: st.lines, totals: { so_chuyen: st.so_chuyen, tong_tan: st.tong_tan, thanh_tien: st.tien_truoc_vat },
          }),
          h('div', { style: { marginTop: '10px', textAlign: 'right' } },
            st.vatLines.map((x) => h('div', {}, `VAT ${x.vat_percent}% trên ${fmt.money(x.thanh_tien)}: `, h('b', { class: 'mono' }, fmt.money(x.tien_vat)))),
            h('div', { class: 'big' }, 'Tổng thanh toán: ', h('b', {}, fmt.money(st.tong_tien) + ' đ')))),
        h('div', { class: 'card', 'data-f': 'weight-recon' }, h('div', { class: 'row' }, h('h3', { class: 'grow' }, 'Đối chiếu khối lượng 2 bên (Bên A cân ↔ Bên B đối tác)'), h('label', { class: 'field', style: 'min-width:280px' }, 'Lô đối chiếu', reconSel)),
          wr ? [h('p', { class: 'muted' }, `${wr.rows.length} xe: `, h('b', {}, `${wr.counts.KHOP} khớp`), ` · ${wr.counts.LECH} lệch · ${wr.counts.CHI_BEN_A} chỉ Bên A · ${wr.counts.CHI_BEN_B} chỉ Bên B — chênh (B − A) ${fmt.money(wr.tot.chenh_kg)} kg. Phần này được in kèm khi xuất Excel/PDF.`),
            table({ columns: [{ key: 'bien_so', label: 'Biển số', mono: true }, { key: 'a_chuyen', label: 'A chuyến', fmt: 'int' }, { key: 'a_kg', label: 'A KL (kg)', fmt: 'money' }, { key: 'b_chuyen', label: 'B chuyến', fmt: 'int' }, { key: 'b_kg', label: 'B KL (kg)', fmt: 'money' },
              { key: 'chenh_kg', label: 'Chênh B−A (kg)', fmt: 'money' }, { key: 'chenh_pct', label: '%', num: true, fmt: 'pct' }, { key: 'ket_luan', label: 'Kết luận', render: (r) => h('span', { class: `tag ${KET[r.ket_luan][0]}` }, KET[r.ket_luan][1]) }],
              rows: wr.rows, totals: { a_chuyen: wr.tot.a_chuyen, a_kg: wr.tot.a_kg, b_chuyen: wr.tot.b_chuyen, b_kg: wr.tot.b_kg, chenh_kg: wr.tot.chenh_kg } })]
            : h('p', { class: 'muted' }, batches.length ? 'Chọn một lô đối chiếu để xem và in kèm đối chiếu khối lượng 2 bên.' : 'Chưa có lô đối chiếu cho đơn vị này. Vào menu Đối chiếu, nạp file của đối tác để chạy.')),
        h('div', { class: 'card' }, h('h3', {}, 'Chi tiết theo xe (phân bổ chưa làm tròn — tham khảo)'),
          table({ columns: [{ key: 'bien_so', label: 'Biển số', mono: true, render: (r) => h('a', { style: { cursor: 'pointer', color: 'var(--green)' }, onclick: () => App.go('vehicle', { bien_so: r.bien_so }) }, r.bien_so) },
            { key: 'so_chuyen', label: 'Chuyến', fmt: 'int' }, { key: 'tong_tan', label: 'KL (tấn)', fmt: 'tan' }, { key: 'don_gia', label: 'Đơn giá', num: true, fmt: (x) => (typeof x === 'number' ? fmt.money(x) : x) },
            { key: 'thanh_tien', label: 'Thành tiền', fmt: 'money' }, { key: 'tien_vat', label: 'VAT', fmt: 'money' }, { key: 'tong_tien', label: 'Tổng', fmt: 'money' }], rows: st.vehicles })));
      };
      v.append(App.pageHead('Bảng kê thanh toán', 'Làm tròn theo bảng kê · hóa đơn xuất riêng từng đơn vị'), await App.filterBar(load, { fields: ['tu_ngay', 'den_ngay', 'dot_id', 'don_vi_id', 'noi_xuat_id', 'tuyen_id', 'bien_so'] }), body);
      await load();
    },
  });
})();
