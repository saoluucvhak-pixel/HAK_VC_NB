'use strict';
/* DGVC — Nhập dữ liệu thuê vận chuyển: nạp file JSON/DGVC từng đợt của đơn vị khác và gán vào kỳ tính công ty */
(function () {
  const D = window.DGVC; const { h } = D;
  const kpi = (label, value, sub, cls = '') => h('div', { class: `kpi ${cls}` }, h('div', { class: 'v' }, value), h('div', { class: 'l' }, label), sub ? h('div', { class: 'small muted' }, sub) : null);

  D.views.subcontract = {
    async render(params = {}) {
      const tab = params.tab || 'import';
      const body = h('div');
      const tabs = h('div', { class: 'tabs', role: 'tablist' }, [
        ['import', 'Nạp đợt mới'],
        ['list', 'Danh sách các đợt đã nạp']
      ].map(([k, t]) => h('button', { role: 'tab', 'aria-selected': String(tab === k), onclick: () => D.go('subcontract', { tab: k }) }, t)));

      if (tab === 'import') await renderImportTab(body);
      else await renderListTab(body);

      return D.page('Nhập dữ liệu thuê vận chuyển', 'Nạp file JSON của từng đợt thuê vận chuyển gửi về · Gán vào kỳ tính công ty · Đối chiếu sản lượng & dầu', [], tabs, body);
    }
  };

  async function renderImportTab(body) {
    let filePath = '';
    let previewData = null;
    const fileLbl = h('span', { class: 'mono small' }, 'Chưa chọn file');

    // Lấy danh sách kỳ tính của công ty
    const periodsRes = await D.api('periods.list', {}).catch(() => ({ items: [] }));
    const periods = periodsRes.items || [];
    const periodOpts = [
      ['', '— Chọn kỳ vận chuyển công ty đang chạy cho đối tác —'],
      ...periods.map((p) => [p.period_id, `${p.period_code} · ${p.contract_code || p.contract_id} (${D.dmy(p.date_from)} → ${D.dmy(p.date_to)}) [${p.status}]`])
    ];

    const f = D.form([
      { key: 'periodId', label: 'Gán vào Kỳ vận chuyển của công ty', type: 'select', options: periodOpts, required: true },
      { key: 'partnerName', label: 'Tên đơn vị thuê vận chuyển (đối tác gửi file)', type: 'text', placeholder: 'Ví dụ: CÔNG TY VẬN TẢI TUẤN HƯNG' },
      { key: 'batchName', label: 'Tên đợt nạp / Ghi chú đợt', type: 'text', placeholder: 'Ví dụ: Đợt 1 - Chạy tuyến VC.007 từ 18/09 - 23/09' },
      { key: 'rentUnitPrice', label: 'Đơn giá thuê (VNĐ / tấn)', type: 'number', placeholder: 'Ví dụ: 155000' },
      { key: 'fuelUnitPrice', label: 'Đơn giá dầu cấp (VNĐ / lít)', type: 'number', placeholder: 'Ví dụ: 19500' }
    ], {
      periodId: '',
      partnerName: '',
      batchName: '',
      rentUnitPrice: '',
      fuelUnitPrice: ''
    });

    const deductFuelCheck = h('input', { type: 'checkbox', checked: true, id: 'scDeductFuel' });
    const previewBox = h('div');

    const pick = async () => {
      const fp = await D.pickFile({
        title: 'Chọn file JSON hoặc gói DGVC đợt thuê vận chuyển',
        filters: [{ name: 'File dữ liệu đợt', extensions: ['json', 'dgvc', 'xlsx', 'xlsm', 'xls'] }]
      });
      if (!fp) return;
      filePath = fp;
      fileLbl.textContent = fp;
      await doPreview();
    };

    const doPreview = async () => {
      if (!filePath) {
        D.toast('Chọn file đợt trước khi xem trước', 'warn');
        return;
      }
      try {
        previewData = await D.api('subcontract.preview', { filePath });
        const s = previewData.summary;
        previewBox.innerHTML = '';
        previewBox.append(
          h('div', { class: 'kpis', style: { marginTop: '14px' } },
            kpi('Số phiếu cân', D.vn(s.ticketCount), `${D.vn(s.totalTon)} tấn hàng`, 'main'),
            kpi('Số xe tham gia', D.vn(s.plateCount), s.plates.slice(0, 3).join(', ') + (s.plates.length > 3 ? '…' : '')),
            kpi('Giao nhận dầu', D.vn(s.fuelCount), `${D.vnAuto(s.totalFuelLiter)} lít dầu`),
            kpi('Khoảng ngày', `${D.dmy(s.dateFrom)} → ${D.dmy(s.dateTo)}`, 'theo ngày cân/dầu trong file')
          )
        );
        if (previewData.partnerSuggested) {
          const partInp = f.querySelector('input[name="partnerName"]');
          if (partInp && !partInp.value) partInp.value = previewData.partnerSuggested;
        }
      } catch (err) {
        previewBox.innerHTML = '';
        previewBox.append(h('div', { class: 'card err-card', style: { marginTop: '10px' } }, h('b', {}, 'Lỗi đọc file: '), err.message));
      }
    };

    const doImport = async () => {
      if (!filePath) {
        D.toast('Vui lòng chọn file đợt cần nạp', 'warn');
        return;
      }
      const vals = f.values();
      if (!vals.periodId) {
        D.toast('Vui lòng chọn Kỳ vận chuyển công ty để gán đợt này vào', 'warn');
        return;
      }

      const payload = {
        filePath,
        periodId: vals.periodId,
        partnerName: vals.partnerName,
        batchName: vals.batchName,
        rentUnitPrice: Number(vals.rentUnitPrice) || 0,
        fuelUnitPrice: Number(vals.fuelUnitPrice) || 0,
        deductFuel: deductFuelCheck.checked
      };

      const res = await D.api('subcontract.importBatch', payload);
      D.toast(`Đã nạp thành công đợt ${res.batchName} (${res.batchId})!`, 'ok', 6000);
      D.modal({
        title: 'Đã nạp dữ liệu đợt thuê vận chuyển',
        body: h('div', {},
          h('p', {}, `Đợt `, h('b', {}, res.batchName), ` đã được nạp thành công và gán vào kỳ `, h('b', {}, res.periodCode), `.`),
          h('p', {}, `Tổng cộng: `, h('b', {}, `${D.vn(res.summary.ticketCount)} phiếu cân (${D.vn(res.summary.totalTon)} tấn)`), ` và `, h('b', {}, `${D.vn(res.summary.fuelCount)} dòng dầu (${D.vnAuto(res.summary.totalFuelLiter)} L)`), `.`),
          h('p', {}, 'Bạn có muốn chuyển sang màn hình Đối chiếu 3 tiêu chuẩn ngay bây giờ không?')
        ),
        actions: [
          { label: 'Xem danh sách đợt', run: () => { D.go('subcontract', { tab: 'list' }); return true; } },
          { label: 'Đối chiếu ngay', primary: true, run: () => { D.go('reconcile', { tab: 'compare', batchId: res.batchId }); return true; } }
        ]
      });
    };

    body.append(
      h('div', { class: 'card' },
        h('h2', { style: { marginTop: 0 } }, '1. Chọn file dữ liệu đợt thuê vận chuyển gửi về'),
        h('p', { class: 'small muted' }, 'Chấp nhận file JSON (.json), gói trao đổi (.dgvc), hoặc file Excel phiếu cân (.xlsx) do đơn vị thuê gửi.'),
        h('div', { class: 'row', style: { gap: '10px', alignItems: 'center', marginBottom: '16px' } },
          h('button', { class: 'btn primary', onclick: pick }, 'Chọn file đợt…'),
          fileLbl
        ),
        previewBox
      ),
      h('div', { class: 'card', style: { marginTop: '14px' } },
        h('h2', { style: { marginTop: 0 } }, '2. Thông tin gán kỳ & thỏa thuận cước thuê'),
        f,
        h('div', { style: { marginTop: '12px' } },
          h('label', { class: 'check' }, deductFuelCheck, 'Khấu trừ tiền dầu cấp vào cước thanh toán cho bên thuê')
        ),
        h('div', { class: 'btns', style: { marginTop: '16px' } },
          h('button', { class: 'btn primary', onclick: doImport }, 'Lưu đợt nạp vào hệ thống'),
          h('button', { class: 'btn', onclick: () => D.go('subcontract', { tab: 'list' }) }, 'Xem danh sách đợt đã nạp')
        )
      )
    );
  }

  async function renderListTab(body) {
    const listRes = await D.api('subcontract.list', {}).catch(() => []);
    const batches = Array.isArray(listRes) ? listRes : [];

    const out = h('div');

    const drawTable = () => {
      out.innerHTML = '';
      if (!batches.length) {
        out.append(h('div', { class: 'card empty-card' }, 'Chưa có đợt thuê vận chuyển nào được nạp. Nhấn tab "Nạp đợt mới" để nạp file JSON.'));
        return;
      }

      out.append(
        h('div', { class: 'card flush' },
          h('div', { class: 'card-h row' },
            h('h2', { class: 'grow' }, `Danh sách đợt thuê vận chuyển đã nạp (${batches.length})`),
            h('button', { class: 'btn small primary', onclick: () => D.go('subcontract', { tab: 'import' }) }, '+ Nạp đợt mới')
          ),
          D.table({
            rows: batches,
            empty: 'Không có đợt nào',
            columns: [
              { key: 'batchName', label: 'Tên đợt', render: (r) => h('b', {}, r.batchName) },
              { key: 'partnerName', label: 'Đơn vị thuê', render: (r) => r.partnerName || '—' },
              { key: 'periodCode', label: 'Kỳ vận chuyển gán kèm', render: (r) => (r.periodCode ? h('span', { class: 'mono b' }, r.periodCode) : h('span', { class: 'muted' }, 'Chưa gán')) },
              { key: 'summary', label: 'Sản lượng phiếu cân', render: (r) => `${D.vn(r.summary.ticketCount)} phiếu · ${D.vn(r.summary.totalTon)} tấn (${r.summary.plateCount} xe)` },
              { key: 'fuel', label: 'Dầu nhận', render: (r) => `${D.vn(r.summary.fuelCount)} lần · ${D.vnAuto(r.summary.totalFuelLiter)} L` },
              { key: 'rentUnitPrice', label: 'Đơn giá thuê', render: (r) => (r.rentUnitPrice ? `${D.vn(r.rentUnitPrice)} đ/tấn` : '—') },
              { key: 'createdAt', label: 'Ngày nạp', fmt: 'date' },
              {
                key: 'actions', label: 'Thao tác', render: (r) => h('div', { class: 'btns' },
                  h('button', {
                    class: 'btn small primary',
                    title: 'Đối chiếu 3 tiêu chuẩn (Phiếu cân, Dầu nhận, Đơn giá & Thành tiền)',
                    onclick: () => D.go('reconcile', { tab: 'compare', batchId: r.batchId })
                  }, 'Đối chiếu 3 tiêu chuẩn'),
                  h('button', {
                    class: 'btn small err',
                    title: 'Xóa đợt này',
                    onclick: async () => {
                      if (!confirm(`Xóa đợt "${r.batchName}"?`)) return;
                      await D.api('subcontract.delete', { batchId: r.batchId });
                      D.toast(`Đã xóa đợt ${r.batchName}`, 'ok');
                      D.go('subcontract', { tab: 'list' });
                    }
                  }, 'Xóa')
                )
              }
            ]
          })
        )
      );
    };

    drawTable();
    body.append(out);
  }
})();
