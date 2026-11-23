'use strict';
/* Đối chiếu dữ liệu (với đối tác) — thẻ "Kiểm tra nội bộ" · thẻ "Đối chiếu 3 tiêu chí" (chọn file Excel / .json / .dgvc, lưu thành đợt, tải file mẫu) · thẻ "Các đợt đã nạp" */
(function () {
  const D = window.DGVC; const { h } = D;
  const SEV = { high: 'err', mid: 'warn', low: 'mute' };
  const CMP = { KHOP: 'ok', LECH: 'err', KHAC_SO_PHIEU: 'warn', THIEU_BEN_MINH: 'err', THIEU_BEN_KIA: 'warn' };
  const MATCH_TAG = {
    MATCH: 'ok',
    DIFF_WEIGHT: 'warn',
    DIFF_FUEL: 'warn',
    DIFF_BOTH: 'err',
    MISSING_MINE: 'err',
    MISSING_THEIRS: 'warn'
  };

  const kpi = (label, value, sub, cls = '') => h('div', { class: `kpi ${cls}` }, h('div', { class: 'v' }, value), h('div', { class: 'l' }, label), sub ? h('div', { class: 'small muted' }, sub) : null);

  const saveXlsx = async (kind, params, base) => {
    const target = window.dgvc ? await D.pickFile({ title: 'Lưu Excel đối chiếu', save: true, defaultPath: `${base}.xlsx` }) : '';
    if (window.dgvc && !target) return;
    const r = await D.api('reconcile.export', { kind, params, targetPath: target || undefined });
    D.toast(`Đã xuất Excel: ${r.path}`, 'ok', 8000);
    if (window.dgvc) D.api('system.openPath', { path: r.path }, { quiet: true }).catch(() => {});
  };

  /** Tải file Excel mẫu cho file ĐỐI TÁC: phiếu cân (NL_VC) hoặc dầu (NL_GIAONHANDAU, không cần chọn hợp đồng). */
  const downloadTemplate = async (importType) => {
    const def = importType === 'PHIEU_CAN' ? 'Mau_Doi_Chieu_PhieuCan.xlsx' : 'Mau_Doi_Chieu_Dau.xlsx';
    const target = window.dgvc ? await D.pickFile({ title: 'Lưu file Excel mẫu', save: true, defaultPath: def, filters: [{ name: 'Excel', extensions: ['xlsx'] }] }) : '';
    if (window.dgvc && !target) return;
    const r = await D.api('import.template', { importType, partner: true, targetPath: target || undefined });
    D.toast(`Đã tạo file mẫu: ${r.path} — nhập từ dòng ${r.firstDataRow} sheet ${r.sheet}`, 'ok', 9000);
    if (window.dgvc) D.api('system.openPath', { path: r.path }, { quiet: true }).catch(() => {});
  };

  D.partnerTemplate = downloadTemplate; // dùng lại ở màn Báo cáo thuê vận chuyển

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

  // ───────── Tab 2: đối chiếu 3 tiêu chuẩn toàn diện (Phiếu cân, Dầu nhận, Đơn giá & Thành tiền) ─────────
  async function compareTab(body, p) {
    let file = p.filePath || '';
    let selectedBatchId = p.batchId || '';

    // Lấy danh sách đợt thuê vận chuyển đã nạp
    const batchesRes = await D.api('subcontract.list', {}).catch(() => []);
    const batches = Array.isArray(batchesRes) ? batchesRes : [];
    const batchOpts = [
      ['', '— Chọn đợt đã lưu (thẻ "Các đợt đã nạp") —'],
      ...batches.map((b) => [b.batchId, `${b.batchName} (${b.partnerName || 'Đơn vị thuê'}) · Kỳ ${b.periodCode || '—'} · ${D.vn(b.summary ? b.summary.totalTon : 0)} tấn`])
    ];

    const cons = (D.state.boot && D.state.boot.contracts) || [];
    const asCarrier = cons.filter((c) => c.role === 'CARRIER').map((c) => [c.contract_id, `Bên thuê mình (${c.customer_unit_code}) · HĐ ${c.contract_code}`]);
    const asCustomer = cons.filter((c) => c.role === 'CUSTOMER').map((c) => [c.contract_id, `Bên mình thuê (${c.carrier_unit_code}) · HĐ ${c.contract_code}`]);

    const periodsRes = await D.api('periods.list', {}).catch(() => ({ items: [] }));
    const periods = periodsRes.items || [];
    const periodOpts = [
      ['', '— Kỳ tính công ty (tự động theo đợt) —'],
      ...periods.map((pr) => [pr.period_id, `${pr.period_code} · ${pr.contract_code || pr.contract_id} (${D.dmy(pr.date_from)} → ${D.dmy(pr.date_to)})`])
    ];

    const f = D.form([
      { key: 'batchId', label: '1. Chọn đợt đối tác đã lưu', type: 'select', options: batchOpts },
      { key: 'periodId', label: '2. Hoặc gán Kỳ tính công ty', type: 'select', options: periodOpts },
      { key: 'rentUnitPrice', label: 'Đơn giá thuê (đ/tấn)', type: 'number', placeholder: 'Tự nạp theo đợt' },
      { key: 'fuelUnitPrice', label: 'Đơn giá dầu cấp (đ/lít)', type: 'number', placeholder: 'Tự nạp theo đợt' },
      { key: 'dateFrom', label: 'Từ ngày (để trống = theo file)', type: 'date' },
      { key: 'dateTo', label: 'Đến ngày', type: 'date' }
    ], {
      batchId: selectedBatchId,
      periodId: p.periodId || '',
      rentUnitPrice: '',
      fuelUnitPrice: '',
      dateFrom: '',
      dateTo: ''
    });
    f.className = 'filters';

    const fileLbl = h('span', { class: 'mono small' }, file || (selectedBatchId ? `Đợt: ${selectedBatchId}` : 'Chưa chọn file'));
    const deductFuelCheck = h('input', { type: 'checkbox', checked: true, id: 'rcDeductFuel' });
    const allPlatesCheck = h('input', { type: 'checkbox', id: 'rcAllPlates' });
    const out = h('div');

    // Tự động điền khi chọn batchId
    const onBatchChange = () => {
      const bId = f.inputs.batchId.value;
      selectedBatchId = bId;
      if (bId) {
        const found = batches.find((b) => b.batchId === bId);
        if (found) {
          file = found.filePath;
          fileLbl.textContent = `${found.batchName} (${found.fileName})`;
          if (found.periodId) {
            const pSel = f.inputs.periodId;
            if (pSel) pSel.value = found.periodId;
          }
          if (found.rentUnitPrice) {
            const rInp = f.inputs.rentUnitPrice;
            if (rInp) rInp.value = found.rentUnitPrice;
          }
          if (found.fuelUnitPrice) {
            const fuInp = f.inputs.fuelUnitPrice;
            if (fuInp) fuInp.value = found.fuelUnitPrice;
          }
          if (found.deductFuel != null) {
            deductFuelCheck.checked = Boolean(found.deductFuel);
          }
        }
      }
    };

    const batchSelectEl = f.inputs.batchId;
    if (batchSelectEl) batchSelectEl.addEventListener('change', () => { onBatchChange(); if (selectedBatchId) run(); });
    if (selectedBatchId) setTimeout(onBatchChange, 50);

    const params = () => {
      const vals = f.values();
      return {
        filePath: file,
        batchId: vals.batchId || undefined,
        periodId: vals.periodId || undefined,
        rentUnitPrice: vals.rentUnitPrice ? Number(vals.rentUnitPrice) : undefined,
        fuelUnitPrice: vals.fuelUnitPrice ? Number(vals.fuelUnitPrice) : undefined,
        deductFuel: deductFuelCheck.checked,
        dateFrom: vals.dateFrom || undefined,
        dateTo: vals.dateTo || undefined,
        allPlates: allPlatesCheck.checked
      };
    };

    const run = async () => {
      const curParams = params();
      if (!curParams.filePath && !curParams.batchId) {
        D.toast('Vui lòng chọn Đợt thuê đã nạp hoặc chọn file cần đối chiếu', 'warn');
        return;
      }

      const d = await D.api('reconcile.compare', curParams);
      out.innerHTML = '';

      const S = d.summary;
      const T = d.totals;
      const F = d.fuelCompare;

      // Header tổng quan đợt đối chiếu
      const batchTitle = d.batch ? `${d.batch.batchName} · Đơn vị: ${d.batch.partnerName || 'Đối tác'}` : `${d.source.fileName} (${d.source.sourceText})`;
      out.append(
        h('div', { class: 'card', style: { borderLeft: '4px solid var(--pri, #0284c7)' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            h('div', {},
              h('h2', { style: { margin: '0 0 4px 0' } }, `BẢNG ĐỐI CHIẾU THUÊ VẬN CHUYỂN TOÀN DIỆN`),
              h('div', { class: 'small' },
                h('b', {}, batchTitle),
                d.period ? ` · Gán vào kỳ tính công ty: ${d.period.periodCode}` : '',
                ` · Từ ${D.dmy(d.dateFrom)} đến ${D.dmy(d.dateTo)} · Số xe: ${new Set([...d.plates, ...((F.byPlate || []).map((x) => x.plateNo))]).size} xe`
              )
            ),
            h('div', { class: 'btns' },
              h('button', {
                class: 'btn primary small',
                onclick: () => saveXlsx('COMPARE', curParams, `DoiChieu_3TieuChuan_${D.today()}`)
              }, 'Tải Excel đối chiếu đầy đủ')
            )
          )
        )
      );

      if (d.source.unreadable && d.source.unreadable.length) {
        out.append(h('div', { class: 'card err-card', role: 'alert' }, h('b', {}, `${D.vn(d.source.unreadable.length)} dòng trong file không đọc được (đã bỏ qua): `),
          d.source.unreadable.slice(0, 8).map((x) => `dòng ${x.rowNo}${x.ticketNo ? ` (phiếu ${x.ticketNo})` : ''}: ${x.note}`).join(' · '), d.source.unreadable.length > 8 ? ' …' : ''));
      }
      if (!F.hasTheirFuel) out.append(h('div', { class: 'card small' }, h('b', {}, 'Chưa có dầu của đối tác để so. '), 'Dầu đọc từ mẫu Excel dầu (nút "Tải file mẫu Excel — dầu"), file .json hoặc gói .dgvc có dòng giao nhận dầu.'));

      // KPI tổng kết phiếu cân và dầu
      out.append(h('div', { class: 'kpis', style: { marginTop: '10px' } },
        kpi('Khớp', D.vn(S.KHOP.count), `${D.vn(S.KHOP.mineKg)} kg`, 'main'),
        kpi('Lệch số liệu', D.vn(S.LECH.count), `chênh ${D.vn(S.LECH.theirKg - S.LECH.mineKg)} kg`, S.LECH.count ? 'bad' : ''),
        kpi('Khác số phiếu', D.vn(S.KHAC_SO_PHIEU.count), 'cùng xe, ngày, KL'),
        kpi('Bên mình chưa có', D.vn(S.THIEU_BEN_MINH.count), `${D.vn(S.THIEU_BEN_MINH.theirKg)} kg`, S.THIEU_BEN_MINH.count ? 'bad' : ''),
        kpi('Bên kia không có', D.vn(S.THIEU_BEN_KIA.count), `${D.vn(S.THIEU_BEN_KIA.mineKg)} kg`)
      ));

      // KPI tổng kết 3 tiêu chuẩn
      out.append(
        h('div', { class: 'kpis', style: { marginTop: '8px' } },
          kpi('Khối lượng chuẩn (File)', `${D.vn(T.theirTon)} tấn`, `${D.vn(T.theirTrips)} chuyến · Trạm cân: ${D.vn(T.mineTon)} tấn`, T.diffTon ? 'bad' : 'main'),
          kpi('Dầu thực nhận (File)', `${D.vnAuto(F.totals.theirLiter)} L`, `Cây xăng cấp: ${D.vnAuto(F.totals.mineLiter)} L`, (F.totals.theirLiter !== F.totals.mineLiter) ? 'bad' : ''),
          kpi('Thành tiền cước thuê', `${D.vn(T.theirRentAmount)} đ`, `@ ${D.vn(T.rentUnitPrice)} đ/tấn`),
          kpi('Tiền dầu cấp bù trừ', `${D.vn(T.theirFuelAmount)} đ`, `@ ${D.vn(T.fuelUnitPrice)} đ/lít · trừ vào cước`),
          kpi('Thực trả cho bên thuê', `${D.vn(T.theirPayable)} đ`, 'Số tiền thanh toán cuối cùng', 'main'),
          T.customerRevenue != null ? kpi('Lợi nhuận cước cty', `${D.vn(T.profitMargin)} đ`, `Doanh thu khách: ${D.vn(T.customerRevenue)} đ`, T.profitMargin >= 0 ? 'good' : 'bad') : null
        )
      );

      // ─────────────────── KHỐI CHÍNH: BẢNG ĐỐI CHIẾU 3 TIÊU CHUẨN THEO TỪNG XE ───────────────────
      out.append(
        h('div', { class: 'card flush', style: { marginTop: '16px' } },
          h('div', { class: 'card-h row' },
            h('h2', { class: 'grow' }, 'Bảng đối chiếu đồng bộ 3 tiêu chuẩn từng xe'),
            h('span', { class: 'small muted' }, '① Khối lượng phiếu cân · ② Dầu nhận · ③ Đơn giá & Thực trả')
          ),
          D.table({
            rows: d.byPlate,
            columns: [
              { key: 'plateNo', label: 'Biển số xe', render: (r) => h('b', { class: 'mono' }, r.plateNo) },
              // Tiêu chí 1: Phiếu cân
              { key: 'theirTrips', label: 'Chuyến (File)', fmt: 'int' },
              { key: 'theirTon', label: 'Tấn (File)', num: true, render: (r) => D.vn(r.theirTon, 2) },
              { key: 'diffKg', label: 'Chênh KG', num: true, render: (r) => h('span', { class: r.diffKg ? 'b err-text' : 'muted' }, r.diffKg ? `${D.vn(r.diffKg)} kg` : '0 kg') },
              // Tiêu chí 2: Dầu nhận
              { key: 'theirFuelRows', label: 'Lần dầu', fmt: 'int' },
              { key: 'theirFuelLiter', label: 'Lít dầu (File)', num: true, render: (r) => D.vnAuto(r.theirFuelLiter) },
              { key: 'diffFuelLiter', label: 'Chênh Lít', num: true, render: (r) => h('span', { class: r.diffFuelLiter ? 'b err-text' : 'muted' }, r.diffFuelLiter ? `${D.vnAuto(r.diffFuelLiter)} L` : '0 L') },
              // Tiêu chí 3: Đơn giá & Thành tiền
              { key: 'rentUnitPrice', label: 'Đơn giá thuê', num: true, render: (r) => (r.rentUnitPrice ? D.vn(r.rentUnitPrice) : '—') },
              { key: 'theirRentAmount', label: 'Tiền cước (VNĐ)', num: true, render: (r) => D.vn(r.theirRentAmount) },
              { key: 'theirFuelAmount', label: 'Trừ tiền dầu (VNĐ)', num: true, render: (r) => (r.theirDeductFuel ? D.vn(r.theirDeductFuel) : '—') },
              { key: 'theirPayable', label: 'Thực trả bên thuê', num: true, render: (r) => h('b', { style: { color: 'var(--pri, #0284c7)' } }, D.vn(r.theirPayable)) },
              // Trạng thái đối chiếu
              { key: 'matchText', label: 'Tình trạng', render: (r) => h('span', { class: `tag ${MATCH_TAG[r.matchStatus] || 'mute'}` }, r.matchText) }
            ],
            footer: {
              plateNo: 'TỔNG CỘNG',
              theirTrips: T.theirTrips,
              theirTon: D.vn(T.theirTon, 2),
              diffKg: `${D.vn(T.diffKg)} kg`,
              theirFuelRows: F.totals.theirRows,
              theirFuelLiter: D.vnAuto(F.totals.theirLiter),
              diffFuelLiter: `${D.vnAuto(F.totals.theirLiter - F.totals.mineLiter)} L`,
              rentUnitPrice: '',
              theirRentAmount: D.vn(T.theirRentAmount),
              theirFuelAmount: D.vn(T.theirFuelAmount),
              theirPayable: D.vn(T.theirPayable),
              matchText: ''
            }
          })
        )
      );

      // Thẻ chi tiết phiếu cân & chi tiết dầu nhận
      const detailsTabs = h('div', { class: 'tabs', style: { marginTop: '20px' } });
      const detailsContent = h('div');
      let curDetail = 'tickets';

      const renderDetails = () => {
        detailsContent.innerHTML = '';
        if (curDetail === 'tickets') {
          const onlyBad = h('input', { type: 'checkbox', checked: true });
          const tblDiv = h('div');
          const drawTickets = () => {
            const rows = onlyBad.checked ? d.rows.filter((r) => r.kind !== 'KHOP') : d.rows;
            tblDiv.innerHTML = '';
            tblDiv.append(
              D.table({
                rows,
                maxHeight: '45vh',
                empty: onlyBad.checked ? '✔ Không có phiếu nào lệch' : 'Không có phiếu',
                columns: [
                  { key: 'kindText', label: 'Kết quả', render: (r) => h('span', { class: `tag ${CMP[r.kind]}` }, r.kindText) },
                  { key: 'date', label: 'Ngày cân 1', fmt: 'date' },
                  { key: 'plateNo', label: 'Biển số' },
                  { key: 'ticketNo', label: 'Số phiếu bên mình' },
                  { key: 'theirTicketNo', label: 'Số phiếu bên kia' },
                  { key: 'mineKg', label: 'KG bên mình', fmt: 'int' },
                  { key: 'theirKg', label: 'KG bên kia', fmt: 'int' },
                  { key: 'diffKg', label: 'Chênh KG', fmt: 'int' },
                  { key: 'fields', label: 'Chi tiết lệch', wrap: true }
                ]
              })
            );
          };
          drawTickets();
          onlyBad.addEventListener('change', drawTickets);
          detailsContent.append(
            h('div', { class: 'card flush' },
              h('div', { class: 'card-h row' },
                h('h2', { class: 'grow' }, 'Chi tiết từng phiếu cân'),
                h('label', { class: 'check' }, onlyBad, 'Chỉ hiện phiếu lệch')
              ),
              tblDiv
            )
          );
        } else {
          detailsContent.append(
            h('div', { class: 'card flush' },
              h('div', { class: 'card-h' }, h('h2', {}, 'Chi tiết từng lần giao nhận dầu')),
              D.table({
                rows: F.rows,
                maxHeight: '45vh',
                empty: 'Không có dữ liệu giao nhận dầu',
                columns: [
                  { key: 'kindText', label: 'Kết quả', render: (r) => h('span', { class: `tag ${CMP[r.kind]}` }, r.kindText) },
                  { key: 'date', label: 'Ngày nhận dầu', fmt: 'date' },
                  { key: 'plateNo', label: 'Biển số' },
                  { key: 'mineLiter', label: 'Lít bên mình', num: true, render: (r) => (r.mineLiter != null ? D.vnAuto(r.mineLiter) : '—') },
                  { key: 'theirLiter', label: 'Lít bên kia', num: true, render: (r) => (r.theirLiter != null ? D.vnAuto(r.theirLiter) : '—') },
                  { key: 'diffLiter', label: 'Chênh lít', num: true, render: (r) => D.vnAuto(r.diffLiter) },
                  { key: 'fields', label: 'Ghi chú', wrap: true }
                ]
              })
            )
          );
        }
      };

      const tBtns = [['tickets', 'Chi tiết phiếu cân'], ['fuel', 'Chi tiết dầu nhận']].map(([k, lbl]) =>
        h('button', {
          role: 'tab',
          'aria-selected': String(curDetail === k),
          onclick: () => {
            curDetail = k;
            tBtns.forEach((b, idx) => b.setAttribute('aria-selected', String(idx === (k === 'tickets' ? 0 : 1))));
            renderDetails();
          }
        }, lbl)
      );
      detailsTabs.append(...tBtns);
      renderDetails();

      out.append(detailsTabs, detailsContent);
    };

    const pick = async () => {
      const fp = await D.pickFile({
        title: 'Chọn file JSON, gói DGVC hoặc Excel của đơn vị kia',
        filters: [{ name: 'File đối chiếu', extensions: ['json', 'dgvc', 'xlsx', 'xlsm', 'xls'] }]
      });
      if (!fp) return;
      file = fp;
      selectedBatchId = ''; // chọn file mới thì bỏ đợt đang chọn (đợt có ưu tiên hơn file khi đối chiếu)
      const bSel = f.inputs.batchId; if (bSel) bSel.value = '';
      fileLbl.textContent = fp;
      await run();
    };

    const saveBtn = D.writer() ? h('button', { class: 'btn', title: 'Lưu bản sao file của đối tác thành đợt để đối chiếu lại sau — không vào kỳ', onclick: () => {
      if (!file || selectedBatchId) { D.toast('Chọn một file của đối tác (Excel, .json, .dgvc) rồi mới lưu thành đợt', 'warn'); return; }
      D.partnerBatch.saveDialog({ filePath: file, onSaved: (b) => D.go('reconcile', { tab: 'compare', batchId: b.batchId }) });
    } }, 'Lưu thành đợt…') : null;
    body.append(
      h('div', { class: 'card' },
        h('h2', { style: { marginTop: 0 } }, 'Chọn file của đối tác để đối chiếu'),
        h('p', { class: 'small muted' }, 'Phiếu cân: Excel mẫu phiếu cân, .json hoặc gói .dgvc. ', h('b', {}, 'Dầu: dùng mẫu Excel dầu / .json / .dgvc'), ' (file Excel có thể có một hoặc cả hai sheet NL_VC và NL_GIAONHANDAU). Đợt đã lưu chỉ là bản sao phục vụ đối chiếu, không vào kỳ.'),
        h('div', { class: 'row', style: { gap: '10px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' } },
          h('button', { class: 'btn primary', onclick: pick }, 'Chọn file…'),
          D.writer() ? h('button', { class: 'btn', title: 'Tải file Excel mẫu phiếu cân (sheet NL_VC) để gửi / nhận với đối tác', onclick: () => downloadTemplate('PHIEU_CAN') }, 'Tải file mẫu Excel — phiếu cân') : null,
          D.writer() ? h('button', { class: 'btn', title: 'Tải file Excel mẫu dầu (sheet NL_GIAONHANDAU) — chỉ cần Ngày nhận dầu, Biển số xe, Số lượng (lít)', onclick: () => downloadTemplate('GIAO_NHAN_DAU') }, 'Tải file mẫu Excel — dầu') : null,
          fileLbl
        ),
        f,
        h('div', { class: 'btns', style: { marginTop: '12px' } },
          h('label', { class: 'check' }, deductFuelCheck, 'Khấu trừ tiền dầu vào cước'),
          h('label', { class: 'check' }, allPlatesCheck, 'So cả xe ngoài danh sách'),
          h('button', { class: 'btn', onclick: run }, 'Đối chiếu lại'),
          saveBtn
        )
      ),
      out
    );

    if (file || selectedBatchId) await run();
  }

  // ───────── Tab 3: các đợt đã nạp ─────────
  async function batchesTab(body) {
    const holder = h('div');
    const draw = async () => { holder.innerHTML = ''; holder.append(await D.partnerBatch.listCard({ onCompare: (r) => D.go('reconcile', { tab: 'compare', batchId: r.batchId }), onChanged: () => D.go('reconcile', { tab: 'batches' }) })); };
    body.append(h('div', { class: 'card' }, h('p', { style: { marginTop: 0 } }, 'Đợt là ', h('b', {}, 'bản sao dữ liệu của đối tác'), ' (phiếu cân, dầu) lưu lại để đối chiếu nhiều lần. Đợt ', h('b', {}, 'không vào kỳ'), ' và không đổi số tiền của kỳ nào; xóa đợt chỉ xóa bản sao.'),
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: () => D.go('reconcile', { tab: 'compare' }) }, 'Chọn file đối tác để đối chiếu / lưu thành đợt'))), holder);
    await draw();
  }

  D.views.reconcile = {
    async render(p = {}) {
      const tab = ['audit', 'compare', 'batches'].includes(p.tab) ? p.tab : 'audit';
      const body = h('div');
      const tabs = h('div', { class: 'tabs', role: 'tablist' }, [
        ['audit', 'Kiểm tra nội bộ'],
        ['compare', 'Đối chiếu 3 tiêu chí'],
        ['batches', 'Các đợt đã nạp']
      ].map(([k, t]) => h('button', { role: 'tab', 'aria-selected': String(tab === k), onclick: () => D.go('reconcile', { tab: k }) }, t)));

      if (tab === 'audit') await auditTab(body);
      else if (tab === 'batches') await batchesTab(body);
      else await compareTab(body, p);

      return D.page('Đối chiếu dữ liệu', 'Đối chiếu với đối tác: kiểm tra nội bộ · 3 tiêu chí (phiếu cân · dầu nhận · đơn giá & thực trả) · các đợt đã nạp', [], tabs, body);
    }
  };
})();
