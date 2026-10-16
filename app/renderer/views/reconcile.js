'use strict';
/* Đối chiếu dữ liệu — kiểm tra phiếu cân chưa tính vào kỳ (về muộn, lọt khe…) · đối chiếu phiếu cân với đơn vị khác (gói .dgvc / Excel) */
(function () {
  const D = window.DGVC; const { h } = D;
  const SEV = { high: 'err', mid: 'warn', low: 'mute' };
  const CMP = { KHOP: 'ok', LECH: 'err', KHAC_SO_PHIEU: 'warn', THIEU_BEN_MINH: 'err', THIEU_BEN_KIA: 'warn' };
  const kpi = (label, value, sub, cls = '') => h('div', { class: `kpi ${cls}` }, h('div', { class: 'v' }, value), h('div', { class: 'l' }, label), sub ? h('div', { class: 'small muted' }, sub) : null);
  const saveXlsx = async (kind, params, base) => {
    const target = window.dgvc ? await D.pickFile({ title: 'Lưu Excel', save: true, defaultPath: `${base}.xlsx` }) : '';
    if (window.dgvc && !target) return;
    const r = await D.api('reconcile.export', { kind, params, targetPath: target || undefined });
    D.toast(`Đã xuất Excel: ${r.path}`, 'ok', 8000);
    if (window.dgvc) D.api('system.openPath', { path: r.path }, { quiet: true }).catch(() => {});
  };

  // ───────── Tab 1: kiểm tra nội bộ ─────────
  async function auditTab(body) {
    const f = D.form([{ key: 'dateFrom', label: 'Phiếu cân từ ngày', type: 'date' }, { key: 'dateTo', label: 'đến ngày', type: 'date' }], {});
    f.className = 'filters';
    const wait = h('input', { type: 'checkbox', id: 'rcWait' });
    const out = h('div');
    const params = () => ({ ...f.values(), includeWaiting: wait.checked });
    const load = async () => {
      const d = await D.api('reconcile.audit', params());
      out.innerHTML = '';
      const S = d.summary;
      out.append(h('div', { class: 'kpis' },
        kpi('Về muộn', D.vn(S.LATE.count), `${D.vn(S.LATE.kg)} kg · ngày thuộc kỳ đã chốt`, S.LATE.count ? 'bad' : ''),
        kpi('Lọt khe', D.vn(S.GAP.count), `${D.vn(S.GAP.kg)} kg · không kỳ nào phủ`, S.GAP.count ? 'bad' : ''),
        kpi('Kỳ nháp chưa tính lại', D.vn(S.DRAFT.count), `${D.vn(S.DRAFT.kg)} kg`),
        kpi('Xe 2 hợp đồng cùng bên thuê', D.vn(d.overlaps.filter((o) => o.sameCustomer).length), 'nguy cơ tính 2 lần', d.overlaps.some((o) => o.sameCustomer) ? 'bad' : '')));
      if (!d.problems) out.append(h('div', { class: 'card ok-card' }, h('b', {}, '✔ Không có phiếu cân nào bị sót. '), 'Mọi phiếu cân của xe thuộc hợp đồng bản cài này vận chuyển đều đã nằm trong kỳ, hoặc đang chờ kỳ sau.'));
      const act = (r) => {
        if (r.kind === 'LATE') return h('button', { class: 'btn small', title: 'Mở kỳ → Trả về nháp → Tính lại → Xác nhận → gửi lại gói cho bên thuê', onclick: () => D.go('calc', { periodId: r.periodId }) }, 'Mở kỳ để tính lại');
        if (r.kind === 'DRAFT') return h('button', { class: 'btn small', onclick: () => D.go('calc', { periodId: r.periodId }) }, 'Tính lại kỳ nháp');
        if (r.kind === 'GAP') return h('button', { class: 'btn small', onclick: () => D.go('calc', { contractId: r.contractId, dateFrom: r.date, dateTo: r.date, routeCode: r.routeCode }) }, 'Lập kỳ cho ngày này');
        return '';
      };
      out.append(h('div', { class: 'card flush' }, h('div', { class: 'card-h' }, h('h2', {}, `Phiếu cân chưa tính vào kỳ (${D.vn(d.rows.length)})`)),
        D.table({ rows: d.rows, maxHeight: '58vh', empty: 'Không có phiếu cân nào chưa tính',
          columns: [{ key: 'kindText', label: 'Tình trạng', render: (r) => h('span', { class: `tag ${SEV[r.severity]}` }, r.kindText) }, { key: 'ticketNo', label: 'Số phiếu' }, { key: 'date', label: 'Ngày cân 1', fmt: 'date' },
            { key: 'plateNo', label: 'Biển số' }, { key: 'routeCode', label: 'Tuyến' }, { key: 'netKg', label: 'KL hàng (KG)', fmt: 'int' }, { key: 'owner', label: 'Chủ xe' }, { key: 'contractCode', label: 'Hợp đồng' },
            { key: 'periodCode', label: 'Kỳ', render: (r) => (r.periodCode ? h('span', {}, h('span', { class: 'mono' }, r.periodCode), ' ', h('span', { class: 'small muted' }, r.periodStatusText)) : '') },
            { key: 'x', label: '', render: act }],
          footer: d.rows.length ? { kindText: 'TỔNG CỘNG', ticketNo: `${d.rows.length} phiếu`, netKg: d.rows.reduce((a, r) => a + (r.netKg || 0), 0) } : null })));
      if (d.overlaps.length) {
        out.append(h('div', { class: 'card flush' }, h('div', { class: 'card-h' }, h('h2', {}, `Xe nằm trong 2 hợp đồng cùng lúc (${d.overlaps.length})`)),
          D.table({ rows: d.overlaps, columns: [{ key: 'plateNo', label: 'Biển số' }, { key: 'contractA', label: 'Hợp đồng A' }, { key: 'rangeA', label: 'Hiệu lực A' }, { key: 'contractB', label: 'Hợp đồng B' },
            { key: 'rangeB', label: 'Hiệu lực B' }, { key: 'overlap', label: 'Chồng nhau' },
            { key: 's', label: '', render: (o) => h('span', { class: `tag ${o.sameCustomer ? 'err' : 'warn'}` }, o.sameCustomer ? 'Cùng bên thuê — nguy cơ tính 2 lần' : 'Khác bên thuê — kiểm tra lại') }] }),
          h('p', { class: 'small muted', style: { padding: '0 14px 12px' } }, 'Sửa ở Hợp đồng vận chuyển → Xe của hợp đồng: đặt "Hiệu lực đến" cho hợp đồng cũ trước ngày xe chuyển sang hợp đồng mới.')));
      }
    };
    body.append(h('div', { class: 'card' },
      h('p', { style: { marginTop: 0 } }, 'Tìm phiếu cân của xe thuộc hợp đồng bản cài này vận chuyển mà ', h('b', {}, 'chưa được tính ở kỳ nào'), '. Thường gặp: phiếu cân của xe A, B gửi về sau khi đã chốt kỳ và gửi bảng kê cho bên thuê.'),
      h('ul', { class: 'small', style: { margin: '0 0 10px 18px', padding: 0 } },
        h('li', {}, h('b', {}, 'Về muộn'), ': ngày cân thuộc kỳ đã xác nhận / đã khóa → mở kỳ, Trả về nháp, Tính lại, Xác nhận, rồi xuất lại gói kỳ tính. Bên thuê nhập gói mới sẽ thay bản cũ.'),
        h('li', {}, h('b', {}, 'Lọt khe'), ': ngày cân không thuộc kỳ nào nhưng đã qua kỳ đã chốt gần nhất → lập kỳ bổ sung hoặc lùi Từ ngày của kỳ sau.'),
        h('li', {}, h('b', {}, 'Chờ kỳ sau'), ': phiếu sau kỳ đã chốt gần nhất — bình thường.')),
      f, h('div', { class: 'btns', style: { marginTop: '10px' } }, h('label', { class: 'check' }, wait, 'Hiện cả phiếu chờ kỳ sau'),
        h('button', { class: 'btn primary', onclick: load }, 'Kiểm tra'), h('button', { class: 'btn', onclick: () => saveXlsx('AUDIT', params(), `KiemTraPhieuChuaTinh_${D.today()}`) }, 'Tải Excel'))), out);
    await load();
  }

  // ───────── Tab 2: đối chiếu với đơn vị khác ─────────
  async function compareTab(body, p) {
    let file = p.filePath || '';
    const fileLbl = h('span', { class: 'mono small' }, file || 'Chưa chọn file');
    const f = D.form([{ key: 'dateFrom', label: 'Từ ngày (bỏ trống = theo file)', type: 'date' }, { key: 'dateTo', label: 'Đến ngày', type: 'date' }], {});
    f.className = 'filters';
    const all = h('input', { type: 'checkbox', id: 'rcAll' });
    const out = h('div');
    const params = () => ({ filePath: file, ...f.values(), allPlates: all.checked });
    const run = async () => {
      if (!file) { D.toast('Chọn gói .dgvc hoặc file Excel phiếu cân của đơn vị kia', 'warn'); return; }
      const d = await D.api('reconcile.compare', params());
      out.innerHTML = '';
      const S = d.summary; const T = d.totals;
      out.append(h('div', { class: 'card' }, h('b', {}, d.source.fileName), ' — ', d.source.sourceText, ` · ${D.vn(d.source.rows)} phiếu · so từ ${D.dmy(d.dateFrom)} đến ${D.dmy(d.dateTo)} · `,
        d.allPlates ? 'mọi xe' : `${d.plates.length} xe có trong file`,
        d.source.unreadable.length ? h('div', { class: 'small', style: { color: 'var(--warn, #b45309)', marginTop: '6px' } }, `${d.source.unreadable.length} dòng không đọc được: `, d.source.unreadable.slice(0, 5).map((x) => `dòng ${x.rowNo} (${x.note})`).join('; ')) : null,
        d.source.duplicates.length ? h('div', { class: 'small', style: { marginTop: '6px' } }, `${d.source.duplicates.length} phiếu lặp trong file bên kia (chỉ tính 1 lần).`) : null));
      out.append(h('div', { class: 'kpis' },
        kpi('Khớp', D.vn(S.KHOP.count), `${D.vn(S.KHOP.mineKg)} kg`, 'main'),
        kpi('Lệch số liệu', D.vn(S.LECH.count), `chênh ${D.vn(S.LECH.theirKg - S.LECH.mineKg)} kg`, S.LECH.count ? 'bad' : ''),
        kpi('Khác số phiếu', D.vn(S.KHAC_SO_PHIEU.count), 'cùng xe, ngày, KL'),
        kpi('Bên mình chưa có', D.vn(S.THIEU_BEN_MINH.count), `${D.vn(S.THIEU_BEN_MINH.theirKg)} kg`, S.THIEU_BEN_MINH.count ? 'bad' : ''),
        kpi('Bên kia không có', D.vn(S.THIEU_BEN_KIA.count), `${D.vn(S.THIEU_BEN_KIA.mineKg)} kg`)));
      out.append(h('div', { class: 'card flush' }, h('div', { class: 'card-h' }, h('h2', {}, 'Theo xe')),
        D.table({ rows: d.byPlate, columns: [{ key: 'plateNo', label: 'Biển số' }, { key: 'mineTrips', label: 'Chuyến bên mình', fmt: 'int' }, { key: 'theirTrips', label: 'Chuyến bên kia', fmt: 'int' },
          { key: 'diffTrips', label: 'Chênh chuyến', fmt: 'int' }, { key: 'mineKg', label: 'KG bên mình', fmt: 'int' }, { key: 'theirKg', label: 'KG bên kia', fmt: 'int' },
          { key: 'diffKg', label: 'Chênh KG', render: (r) => h('span', { class: r.diffKg ? 'b' : 'muted' }, D.vn(r.diffKg)), num: true },
          { key: 'issues', label: 'Kết quả', render: (r) => h('span', { class: `tag ${r.issues ? 'warn' : 'ok'}` }, r.issues ? `${r.issues} dòng lệch` : 'Khớp') }],
        footer: { plateNo: 'TỔNG CỘNG', mineTrips: T.mineTrips, theirTrips: T.theirTrips, diffTrips: T.theirTrips - T.mineTrips, mineKg: T.mineKg, theirKg: T.theirKg, diffKg: T.theirKg - T.mineKg } })));
      const onlyBad = h('input', { type: 'checkbox', checked: true });
      const tbl = h('div');
      const draw = () => {
        const rows = onlyBad.checked ? d.rows.filter((r) => r.kind !== 'KHOP') : d.rows;
        tbl.innerHTML = '';
        tbl.append(D.table({ rows, maxHeight: '55vh', empty: onlyBad.checked ? '✔ Không có phiếu nào lệch' : 'Không có phiếu',
          columns: [{ key: 'kindText', label: 'Kết quả', render: (r) => h('span', { class: `tag ${CMP[r.kind]}` }, r.kindText) }, { key: 'date', label: 'Ngày cân 1', fmt: 'date' }, { key: 'time', label: 'Giờ' },
            { key: 'plateNo', label: 'Biển số' }, { key: 'ticketNo', label: 'Số phiếu bên mình' }, { key: 'theirTicketNo', label: 'Số phiếu bên kia' },
            { key: 'mineKg', label: 'KG bên mình', fmt: 'int' }, { key: 'theirKg', label: 'KG bên kia', fmt: 'int' }, { key: 'diffKg', label: 'Chênh', fmt: 'int' },
            { key: 'fields', label: 'Chi tiết lệch', wrap: true }, { key: 'periodCode', label: 'Kỳ bên mình', render: (r) => (r.periodCode ? h('span', {}, h('span', { class: 'mono' }, r.periodCode), ' ', h('span', { class: 'small muted' }, r.periodStatus)) : '') }] }));
      };
      draw(); onlyBad.addEventListener('change', draw);
      out.append(h('div', { class: 'card flush' }, h('div', { class: 'card-h row' }, h('h2', { class: 'grow' }, 'Chi tiết từng phiếu'), h('label', { class: 'check' }, onlyBad, 'Chỉ hiện phiếu lệch')), tbl));
      if (S.THIEU_BEN_MINH.count) {
        out.append(h('div', { class: 'card' }, h('b', {}, `Có ${S.THIEU_BEN_MINH.count} phiếu bên mình chưa có. `),
          /\.dgvc$/i.test(file) ? h('span', {}, 'Nhập gói này ở ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); D.go('exchange', { tab: 'import' }); } }, 'Trao đổi dữ liệu → Nhập gói'), ' — phiếu đã có không bị nhân đôi.')
            : h('span', {}, 'Nhập file này ở ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); D.go('tickets'); } }, 'Phiếu cân → Import'), ' — phiếu đã có tự bỏ qua, phiếu thuộc kỳ đã chốt sẽ được cảnh báo "về muộn".')));
      }
    };
    const pick = async () => {
      const fp = await D.pickFile({ title: 'Chọn file của đơn vị kia', filters: [{ name: 'Gói DGVC hoặc Excel', extensions: ['dgvc', 'xlsx', 'xlsm', 'xls'] }] });
      if (!fp) return; file = fp; fileLbl.textContent = fp; await run();
    };
    body.append(h('div', { class: 'card' },
      h('p', { style: { marginTop: 0 } }, 'So phiếu cân của ', h('b', {}, 'đơn vị khác'), ' (xe A, B, trạm cân của bên thuê…) với phiếu cân bên mình theo ', h('b', {}, 'số phiếu + ngày cân 1 + biển số'),
        '. Nhận gói ', h('span', { class: 'mono' }, '.dgvc'), ' (Phiếu cân hoặc Kỳ tính) hoặc file Excel phiếu cân. Chỉ so sánh, không ghi gì vào dữ liệu.'),
      h('div', { class: 'row', style: { gap: '10px', alignItems: 'center', marginBottom: '10px' } }, h('button', { class: 'btn primary', onclick: pick }, 'Chọn file…'), fileLbl),
      f, h('div', { class: 'btns', style: { marginTop: '10px' } }, h('label', { class: 'check' }, all, 'So cả xe không có trong file'),
        h('button', { class: 'btn', onclick: run }, 'Đối chiếu lại'), h('button', { class: 'btn', onclick: () => (file ? saveXlsx('COMPARE', params(), `DoiChieuPhieuCan_${D.today()}`) : D.toast('Chọn file trước', 'warn')) }, 'Tải Excel'))), out);
    if (file) await run();
  }

  D.views.reconcile = {
    async render(p) {
      const tab = p.tab || 'audit'; const body = h('div');
      const tabs = h('div', { class: 'tabs', role: 'tablist' }, [['audit', 'Phiếu cân chưa tính vào kỳ'], ['compare', 'Đối chiếu với đơn vị khác']]
        .map(([k, t]) => h('button', { role: 'tab', 'aria-selected': String(tab === k), onclick: () => D.go('reconcile', { tab: k }) }, t)));
      if (tab === 'audit') await auditTab(body); else await compareTab(body, p);
      return D.page('Đối chiếu dữ liệu', 'Kiểm tra phiếu cân bị sót · so với dữ liệu đơn vị khác', [], tabs, body);
    },
  };
})();
