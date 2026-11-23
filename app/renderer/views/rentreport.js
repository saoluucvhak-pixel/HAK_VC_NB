'use strict';
/* Báo cáo thuê vận chuyển — công ty thuê đơn vị khác vận chuyển mà không tự làm dịch vụ: tổng hợp số liệu nhận về của các đợt đã nạp
 * (số chuyến, tấn, dầu, tiền thuê = tấn × đơn giá thuê, dầu trừ, thực trả). Không tạo kỳ tính giá. Số liệu khớp từng đồng với Đối chiếu 3 tiêu chí. */
(function () {
  const D = window.DGVC; const { h } = D;
  const pad2 = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const addDay = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return isoOf(new Date(y, m - 1, d + n)); };
  const recentMonths = () => { const now = new Date(); const out = []; for (let i = 0; i < 24; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push({ value: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`, label: `Tháng ${d.getMonth() + 1}/${d.getFullYear()}` }); } return out; };
  const sfLoad = (id) => { try { const s = JSON.parse(window.localStorage.getItem(`dgvc.sf.last.${id}`) || 'null'); return s && typeof s === 'object' ? D.sf.normalize(s) : null; } catch { return null; } };
  const sfKeep = (id, s) => { try { window.localStorage.setItem(`dgvc.sf.last.${id}`, JSON.stringify(s)); } catch { /* không lưu được thì bỏ qua */ } };
  const range = (r) => (r.dateFrom || r.dateTo ? `${D.dmy(r.dateFrom) || '…'} – ${D.dmy(r.dateTo) || '…'}` : '—');

  /** Nút chọn nhanh khoảng ngày dữ liệu. */
  const quickButtons = (setRange) => {
    const b = (label, fn, title) => h('button', { type: 'button', class: 'btn small sf-ghost', title: title || '', onclick: fn }, label);
    const monthEnd = (y, m) => isoOf(new Date(y, m, 0));
    return [
      b('Tháng này', () => { const n = new Date(); setRange(`${n.getFullYear()}-${pad2(n.getMonth() + 1)}-01`, monthEnd(n.getFullYear(), n.getMonth() + 1)); }),
      b('Tháng trước', () => { const n = new Date(); const y = n.getMonth() ? n.getFullYear() : n.getFullYear() - 1; const m = n.getMonth() || 12; setRange(`${y}-${pad2(m)}-01`, monthEnd(y, m)); }),
      b('30 ngày', () => setRange(addDay(isoOf(new Date()), -29), isoOf(new Date())), '30 ngày gần nhất, tính cả hôm nay'),
    ];
  };

  /** Hộp thoại sửa đơn giá thuê / giá dầu / trừ dầu của một đợt (lý do bắt buộc). onDone() chạy sau khi lưu. */
  const editTerms = (r, onDone) => {
    const fields = [
      { key: 'rentUnitPrice', label: 'Đơn giá thuê (đ/tấn)', money: true, required: true, hint: 'Nhập kiểu Việt, vd 155.000' },
      { key: 'fuelUnitPrice', label: 'Giá dầu (đ/lít)', money: true, required: true, hint: 'Dùng để trừ tiền dầu vào tiền thuê' },
      { key: 'deductFuel', label: 'Trừ tiền dầu vào tiền thuê', type: 'check', full: true },
      { key: 'reason', label: 'Lý do sửa', type: 'textarea', required: true, full: true },
    ];
    const f = D.form(fields, { rentUnitPrice: r.rentUnitPrice, fuelUnitPrice: r.fuelUnitPrice, deductFuel: r.deductFuel, reason: '' });
    D.modal({ title: `Sửa đơn giá thuê / giá dầu — ${r.batchName}`, body: h('div', {}, h('p', { class: 'small muted' }, `${r.partnerName || 'Đơn vị vận chuyển'} · chỉ đổi đơn giá, không đổi phiếu cân / dầu của đợt. Ghi vào nhật ký kèm lý do.`), f),
      actions: [{ label: 'Hủy', run: () => true }, { label: 'Lưu', primary: true, run: async () => {
        const v = f.values();
        if (!String(v.reason).trim()) { D.toast('Phải nhập lý do sửa', 'err'); return false; }
        for (const [k, lab] of [['rentUnitPrice', 'Đơn giá thuê'], ['fuelUnitPrice', 'Giá dầu']]) if (v[k] === '' || Number.isNaN(v[k])) { D.toast(`${lab} không hợp lệ — nhập số, vd 155.000`, 'err'); return false; }
        await D.api('subcontract.updateTerms', { batchId: r.batchId, rentUnitPrice: v.rentUnitPrice, fuelUnitPrice: v.fuelUnitPrice, deductFuel: v.deductFuel, reason: String(v.reason).trim(), rowVersion: r.rowVersion });
        D.toast('Đã lưu đơn giá mới', 'ok'); await onDone(); return true;
      } }] });
  };

  D.views.rentreport = {
    async render() {
      const go = (v, p) => () => D.go(v, p);
      const guide = h('div', { class: 'card', role: 'region', 'aria-label': 'Hướng dẫn 3 bước' }, h('h2', {}, 'Làm thế nào: 3 bước'),
        h('ol', { class: 'rr-steps' },
          h('li', {}, h('b', {}, 'Nhận dữ liệu do đơn vị vận chuyển gửi theo mẫu (phiếu cân, dầu)'), ' → Trao đổi dữ liệu › Nhập gói, hoặc nạp file mẫu ở Đối chiếu dữ liệu › Đối chiếu 3 tiêu chí.'),
          h('li', {}, h('b', {}, 'Đối chiếu với kỳ của bạn'), ' nếu cùng kỳ vận chuyển → Đối chiếu dữ liệu.'),
          h('li', {}, h('b', {}, 'Công ty thuê vận chuyển mà không tự làm dịch vụ'), ': xem tổng hợp tiền thuê ở bảng bên dưới — không cần tạo kỳ tính giá.')),
        h('div', { class: 'rr-nav' },
          h('button', { class: 'btn primary', onclick: go('exchange', { tab: 'import' }) }, 'Trao đổi dữ liệu › Nhập gói'),
          h('button', { class: 'btn', onclick: go('reconcile', { tab: 'compare' }) }, 'Đối chiếu dữ liệu'),
          h('button', { class: 'btn', onclick: go('reconcile', { tab: 'batches' }) }, 'Các đợt đã nạp'),
          D.writer() ? h('button', { class: 'btn', title: 'Tải file Excel mẫu phiếu cân để gửi / nhận với đơn vị vận chuyển', onclick: () => D.partnerTemplate('PHIEU_CAN') }, 'Tải file mẫu Excel — phiếu cân') : null,
          D.writer() ? h('button', { class: 'btn', title: 'Tải file Excel mẫu dầu', onclick: () => D.partnerTemplate('GIAO_NHAN_DAU') }, 'Tải file mẫu Excel — dầu') : null));

      // ───────── bộ lọc thông minh ─────────
      let sfState = sfLoad('rentreport') || D.sf.empty();
      const toServer = (s) => ({ dateFrom: s.tu || '', dateTo: s.den || '', q: s.q || '', partnerName: (s.one || {}).partner || '' });
      let sfInfo = { kept: 0, total: 0 }; let sfMount = null; let partners = []; let selected = ''; const guard = D.latest();
      const sfCfg = {
        screenId: 'rentreport', searchPlaceholder: '🔍 Tìm đơn vị / tên đợt…', qAttrs: { 'aria-label': 'Tìm đợt theo đơn vị vận chuyển hoặc tên đợt' },
        quickFields: ['q', 'period', 'partner'], advancedFields: ['q', 'period', 'partner'],
        periods: recentMonths, periodNoneLabel: 'Tháng: tất cả',
        fields: [{ key: 'partner', label: 'Đơn vị vận chuyển', type: 'enum', options: () => partners.map((x) => ({ value: x, label: x })) }],
        state: { get: () => sfState, set: (s) => { sfState = s; sfKeep('rentreport', s); } },
        dataSource: () => sfInfo, onApply: () => { selected = ''; load(); }, onReset: () => {}, scopeFallback: () => 'Tất cả đợt',
        actions: () => quickButtons((tu, den) => { sfState = D.sf.setDates(sfState, tu, den); sfKeep('rentreport', sfState); selected = ''; load(); if (sfMount) sfMount.refresh(); }),
      };

      const out = h('div', {}); const detail = h('div', { 'aria-live': 'polite' }); let rep = null;
      const saveXlsx = async () => {
        const stamp = new Date().toISOString().slice(0, 10);
        const target = window.dgvc ? await D.pickFile({ title: 'Lưu Excel báo cáo thuê vận chuyển', save: true, defaultPath: `BaoCaoThueVanChuyen_${stamp}.xlsx`, filters: [{ name: 'Excel', extensions: ['xlsx'] }] }) : '';
        if (window.dgvc && !target) return;
        const r = await D.api('subcontract.reportExport', { params: toServer(sfState), targetPath: target || undefined });
        D.toast(`Đã xuất Excel: ${r.path}`, 'ok', 8000);
        if (window.dgvc) D.api('system.openPath', { path: r.path }, { quiet: true }).catch(() => {});
      };

      const drawDetail = async () => {
        detail.innerHTML = '';
        if (!selected) return;
        const d = await D.api('subcontract.reportDetail', { batchId: selected }).catch(() => null);
        if (!d) { selected = ''; return; }
        const b = d.batch;
        const cols = [{ key: 'plateNo', label: 'Biển số' }, { key: 'ticketCount', label: 'Số chuyến', fmt: 'int' }, { key: 'ton', label: 'Tổng tấn', fmt: 'dec2' }, { key: 'fuelLiter', label: 'Dầu nhận (lít)', fmt: 'dec2' },
          { key: 'rentAmount', label: 'Tiền thuê', fmt: 'int' }, { key: 'deductFuelAmount', label: 'Dầu trừ', fmt: 'int' }, { key: 'payable', label: 'Thực trả', fmt: 'int' }];
        const T = d.totals;
        detail.append(h('div', { class: 'card flush rr-detail', role: 'region', 'aria-label': `Chi tiết đợt ${b.batchName}` },
          h('div', { class: 'card-h row' }, h('h2', { class: 'grow' }, `Chi tiết theo xe — ${b.batchName}`),
            h('button', { class: 'btn small', title: 'Mở Đối chiếu dữ liệu với đợt này (so phiếu cân, dầu, đơn giá với bên mình)', onclick: () => D.go('reconcile', { tab: 'compare', batchId: b.batchId }) }, 'Đối chiếu'),
            D.writer() ? h('button', { class: 'btn small primary', onclick: () => editTerms(b, async () => { await load(); }) }, 'Sửa đơn giá thuê / giá dầu') : null,
            h('button', { class: 'btn small', onclick: () => { selected = ''; load(); } }, 'Đóng')),
          h('div', { class: 'rr-terms small' },
            h('span', {}, h('b', {}, b.partnerName || 'Chưa ghi tên đơn vị')), h('span', {}, `Dữ liệu ${range(b)}`), h('span', {}, `Đơn giá thuê ${D.vn(b.rentUnitPrice)} đ/tấn`), h('span', {}, `Giá dầu ${D.vnAuto(b.fuelUnitPrice)} đ/lít`),
            h('span', {}, b.deductFuel ? 'Có trừ tiền dầu' : 'Không trừ tiền dầu'), b.periodCode ? h('span', {}, `Gắn kỳ ${b.periodCode}`) : null),
          D.table({ columns: cols, rows: d.byPlate, empty: 'Đợt này chưa có phiếu cân nào trong khoảng ngày', footer: { plateNo: 'TỔNG CỘNG', ticketCount: T.ticketCount, ton: T.totalTon, fuelLiter: T.fuelLiter, rentAmount: T.rentAmount, deductFuelAmount: T.deductFuelAmount, payable: T.payable } }),
          d.fuelOnly.length ? h('p', { class: 'small rr-note' }, h('span', { class: 'tag warn' }, 'Lưu ý'), ` Xe chỉ có dầu, không có chuyến nào trong đợt (vẫn cấn trừ dầu, giống Đối chiếu 3 tiêu chí): ${d.fuelOnly.map((o) => `${o.plateNo} ${D.vnAuto(o.fuelLiter)} lít`).join('; ')}.`) : null,
          d.byDate.length ? h('details', { class: 'rr-bydate' }, h('summary', {}, `Theo ngày (${d.byDate.length} ngày)`),
            D.table({ columns: [{ key: 'date', label: 'Ngày', fmt: 'date' }, { key: 'ticketCount', label: 'Số chuyến', fmt: 'int' }, { key: 'ton', label: 'Tổng tấn', fmt: 'dec2' }, { key: 'fuelLiter', label: 'Dầu nhận (lít)', fmt: 'dec2' }], rows: d.byDate, maxHeight: '260px' })) : null));
        const el = detail.firstChild; if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
      };

      const load = async () => {
        const tok = guard.next();
        const r = await D.api('subcontract.report', toServer(sfState));
        if (!guard.ok(tok)) return;
        rep = r; partners = r.partners; sfInfo = { kept: r.rows.length, total: r.totalBatches };
        out.innerHTML = '';
        if (!r.totalBatches) { // chưa nạp đợt nào: hướng dẫn nạp đợt
          out.append(h('div', { class: 'card empty-card' }, 'Chưa có đợt dữ liệu nào từ đơn vị vận chuyển. Làm bước 1 ở trên: nhận gói hoặc nạp file mẫu, rồi bấm "Lưu thành đợt" ở Đối chiếu 3 tiêu chí.'));
          detail.innerHTML = ''; return;
        }
        const T = r.totals;
        const cols = [
          { key: 'partnerName', label: 'Đơn vị vận chuyển', wrap: true, render: (x) => x.partnerName || '—' },
          { key: 'batchName', label: 'Tên đợt', wrap: true, render: (x) => h('span', {}, h('b', { 'data-batch': x.batchId }, x.batchName), h('span', { class: 'rr-psub small muted' }, x.partnerName || '—')) },
          { key: 'dateFrom', label: 'Khoảng ngày dữ liệu', render: (x) => range(x) },
          { key: 'ticketCount', label: 'Số chuyến', fmt: 'int' }, { key: 'plateCount', label: 'Số xe', fmt: 'int' }, { key: 'totalTon', label: 'Tổng tấn', fmt: 'dec2' },
          { key: 'fuelLiter', label: 'Dầu nhận (lít)', fmt: 'dec2' }, { key: 'rentUnitPrice', label: 'Đơn giá thuê (đ/tấn)', fmt: 'int' },
          { key: 'rentAmount', label: 'Tiền thuê', fmt: 'int' }, { key: 'deductFuelAmount', label: 'Dầu trừ', fmt: 'int' }, { key: 'payable', label: 'Thực trả', fmt: 'int' }];
        const tbl = D.table({ columns: cols, rows: r.rows, onRow: (x) => { selected = x.batchId; mark(); drawDetail(); }, empty: 'Không có đợt nào khớp bộ lọc — bấm "Đặt lại" để xem tất cả',
          footer: { partnerName: 'TỔNG CỘNG', batchName: `${D.vn(T.batchCount)} đợt`, ticketCount: T.ticketCount, totalTon: T.totalTon, fuelLiter: T.fuelLiter, rentAmount: T.rentAmount, deductFuelAmount: T.deductFuelAmount, payable: T.payable } });
        const mark = () => { for (const tr of tbl.querySelectorAll('tbody tr')) { const m = tr.querySelector('[data-batch]'); tr.classList.toggle('sel', !!m && m.dataset.batch === selected); } };
        out.append(h('div', { class: 'card flush rr-main' },
          h('div', { class: 'card-h row' }, h('h2', { class: 'grow' }, `Tổng hợp tiền thuê theo đợt (${D.vn(r.rows.length)}${r.rows.length !== r.totalBatches ? ` / ${D.vn(r.totalBatches)}` : ''})`),
            h('span', { class: 'small muted' }, 'Bấm vào một đợt để xem chi tiết theo xe'),
            h('button', { class: 'btn small', title: 'Xuất bảng đang hiển thị ra Excel (tổng hợp theo đợt, theo đơn vị, chi tiết theo xe)', onclick: saveXlsx }, 'Xuất Excel')), tbl));
        mark();
        if (r.rows.length && r.byPartner.length) {
          out.append(h('div', { class: 'card flush rr-byp' }, h('div', { class: 'card-h row' }, h('h2', { class: 'grow' }, 'Tổng theo đơn vị vận chuyển')),
            D.table({ columns: [{ key: 'partnerName', label: 'Đơn vị vận chuyển', wrap: true, render: (x) => x.partnerName || '—' }, { key: 'batchCount', label: 'Số đợt', fmt: 'int' }, { key: 'ticketCount', label: 'Số chuyến', fmt: 'int' },
              { key: 'totalTon', label: 'Tổng tấn', fmt: 'dec2' }, { key: 'fuelLiter', label: 'Dầu nhận (lít)', fmt: 'dec2' }, { key: 'rentAmount', label: 'Tiền thuê', fmt: 'int' }, { key: 'deductFuelAmount', label: 'Dầu trừ', fmt: 'int' }, { key: 'payable', label: 'Thực trả', fmt: 'int' }],
            rows: r.byPartner, footer: { partnerName: 'TỔNG CỘNG', batchCount: T.batchCount, ticketCount: T.ticketCount, totalTon: T.totalTon, fuelLiter: T.fuelLiter, rentAmount: T.rentAmount, deductFuelAmount: T.deductFuelAmount, payable: T.payable } })));
        }
        if (selected && !r.rows.some((x) => x.batchId === selected)) selected = '';
        await drawDetail();
        if (sfMount) sfMount.refresh();
      };

      const filterCard = h('div', { class: 'card rr-filter' }, (sfMount = D.smartFilter.mount(sfCfg)).el);
      const page = D.page('Báo cáo thuê vận chuyển', 'Đối tác · công ty thuê đơn vị khác vận chuyển', [], guide, filterCard, out, detail);
      await load();
      return page;
    },
  };
})();
