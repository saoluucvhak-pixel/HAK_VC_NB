'use strict';
/* DGVC — Xuất dữ liệu vận chuyển gửi đối tác: gói JSON / .dgvc cho bên thuê hoặc khách hàng */
(function () {
  const D = window.DGVC; const { h } = D;

  D.views.export_partner = {
    async render(params = {}) {
      const tab = params.tab || 'period';
      const body = h('div');
      const tabs = h('div', { class: 'tabs', role: 'tablist' }, [
        ['period', 'Xuất theo Kỳ tính đã chốt'],
        ['tickets', 'Xuất theo Khoảng ngày phiếu cân'],
        ['history', 'Lịch sử đã xuất']
      ].map(([k, t]) => h('button', { role: 'tab', 'aria-selected': String(tab === k), onclick: () => D.go('export_partner', { tab: k }) }, t)));

      if (tab === 'period') await renderPeriodExport(body);
      else if (tab === 'tickets') await renderTicketsExport(body);
      else await renderHistory(body);

      return D.page('Xuất dữ liệu vận chuyển gửi đối tác', 'Kết xuất kỳ tính đã xác nhận / khóa hoặc phiếu cân thành gói JSON / .dgvc gửi đối tác', [], tabs, body);
    }
  };

  async function renderPeriodExport(body) {
    const boot = D.state.boot || {};
    const periodsRes = await D.api('periods.list', {}).catch(() => ({ items: [] }));
    const allPeriods = periodsRes.items || [];
    // Chỉ cho phép xuất kỳ đã xác nhận hoặc đã khóa
    const exportablePeriods = allPeriods.filter((p) => ['DA_XAC_NHAN', 'DA_KHOA'].includes(p.status));

    const pOpts = [
      ['', '— Chọn kỳ tính đã xác nhận / đã khóa —'],
      ...exportablePeriods.map((p) => [p.period_id, `${p.period_code} · HĐ ${p.contract_code || p.contract_id} (${D.dmy(p.date_from)} → ${D.dmy(p.date_to)}) [${p.status}]`])
    ];

    const f = D.form([
      { key: 'periodId', label: 'Kỳ tính gửi đối tác', type: 'select', options: pOpts, required: true },
      { key: 'format', label: 'Định dạng gói xuất', type: 'select', options: [['dgvc', 'Gói nén chuẩn DGVC (.dgvc)'], ['json', 'File dữ liệu JSON (.json)']] }
    ], {
      periodId: '',
      format: 'dgvc'
    });

    const doExport = async () => {
      const v = f.values();
      if (!v.periodId) {
        D.toast('Vui lòng chọn kỳ tính cần xuất', 'warn');
        return;
      }
      const selPeriod = exportablePeriods.find((p) => p.period_id === v.periodId);
      const ext = v.format === 'json' ? 'json' : 'dgvc';
      const defaultName = `GOI_KY_TINH_${selPeriod ? selPeriod.period_code : v.periodId}.${ext}`;

      const target = window.dgvc ? await D.pickFile({
        title: 'Lưu file dữ liệu gửi đối tác',
        save: true,
        defaultPath: defaultName,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
      }) : '';

      if (window.dgvc && !target) return;

      const res = await D.api('exchange.exportPackage', {
        packageType: 'KY_TINH',
        periodIds: [v.periodId],
        targetPath: target || undefined
      });

      D.toast(`Đã xuất gói thành công: ${res.file}`, 'ok', 8000);
      if (window.dgvc) D.api('system.openPath', { path: res.file }, { quiet: true }).catch(() => {});
      D.go('export_partner', { tab: 'history' });
    };

    body.append(
      h('div', { class: 'card' },
        h('h2', { style: { marginTop: 0 } }, 'Xuất kỳ tính vận chuyển đã chốt gửi khách hàng / đối tác'),
        h('p', { class: 'small muted' }, 'Gói xuất chứa toàn bộ kết quả tính cước, bảng kê sản lượng, phiếu cân và lượng dầu thực tế được gắn với kỳ. Đối tác chỉ cần nạp vào app để đối chiếu hoặc lưu trữ.'),
        f,
        h('div', { class: 'btns', style: { marginTop: '16px' } },
          h('button', { class: 'btn primary', onclick: doExport }, 'Xuất dữ liệu gửi đối tác'),
          h('button', { class: 'btn', onclick: () => D.go('export_partner', { tab: 'history' }) }, 'Xem lịch sử xuất')
        )
      )
    );
  }

  async function renderTicketsExport(body) {
    const f = D.form([
      { key: 'dateFrom', label: 'Từ ngày', type: 'date', required: true },
      { key: 'dateTo', label: 'Đến ngày', type: 'date', required: true },
      { key: 'plates', label: 'Biển số xe (phân cách bằng dấu phẩy, bỏ trống = mọi xe)', type: 'text', placeholder: 'Ví dụ: 92C-112.34, 43C-098.21' },
      { key: 'format', label: 'Định dạng gói xuất', type: 'select', options: [['dgvc', 'Gói nén chuẩn DGVC (.dgvc)'], ['json', 'File dữ liệu JSON (.json)']] }
    ], {
      dateFrom: '',
      dateTo: '',
      plates: '',
      format: 'dgvc'
    });

    const doExport = async () => {
      const v = f.values();
      if (!v.dateFrom || !v.dateTo) {
        D.toast('Vui lòng chọn khoảng ngày cần xuất', 'warn');
        return;
      }
      const platesArr = v.plates ? v.plates.split(',').map((p) => p.trim()).filter(Boolean) : [];
      const ext = v.format === 'json' ? 'json' : 'dgvc';
      const defaultName = `GOI_PHIEU_CAN_${v.dateFrom}_${v.dateTo}.${ext}`;

      const target = window.dgvc ? await D.pickFile({
        title: 'Lưu file dữ liệu phiếu cân gửi đối tác',
        save: true,
        defaultPath: defaultName,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
      }) : '';

      if (window.dgvc && !target) return;

      const res = await D.api('exchange.exportPackage', {
        packageType: 'PHIEU_CAN',
        dateFrom: v.dateFrom,
        dateTo: v.dateTo,
        plates: platesArr,
        targetPath: target || undefined
      });

      D.toast(`Đã xuất gói phiếu cân thành công: ${res.file}`, 'ok', 8000);
      if (window.dgvc) D.api('system.openPath', { path: res.file }, { quiet: true }).catch(() => {});
      D.go('export_partner', { tab: 'history' });
    };

    body.append(
      h('div', { class: 'card' },
        h('h2', { style: { marginTop: 0 } }, 'Xuất dữ liệu phiếu cân & dầu theo khoảng ngày'),
        h('p', { class: 'small muted' }, 'Xuất các phiếu cân và dòng giao nhận dầu thực tế phát sinh trong khoảng thời gian để gửi đối tác kiểm tra trước khi lập kỳ.'),
        f,
        h('div', { class: 'btns', style: { marginTop: '16px' } },
          h('button', { class: 'btn primary', onclick: doExport }, 'Xuất phiếu cân gửi đối tác'),
          h('button', { class: 'btn', onclick: () => D.go('export_partner', { tab: 'history' }) }, 'Xem lịch sử xuất')
        )
      )
    );
  }

  async function renderHistory(body) {
    const listRes = await D.api('exchange.list', {}).catch(() => ({ exports: [] }));
    const exports = (listRes.exports || []).filter((x) => x.direction === 'EXPORT');

    const out = h('div');
    if (!exports.length) {
      out.append(h('div', { class: 'card empty-card' }, 'Chưa có lịch sử xuất dữ liệu nào.'));
    } else {
      out.append(
        h('div', { class: 'card flush' },
          h('div', { class: 'card-h' }, h('h2', {}, `Lịch sử xuất dữ liệu gửi đối tác (${exports.length})`)),
          D.table({
            rows: exports,
            columns: [
              { key: 'package_type', label: 'Loại gói', render: (r) => h('span', { class: 'tag main' }, r.package_type) },
              { key: 'file_name', label: 'Tên file', render: (r) => h('b', { class: 'mono' }, r.file_name) },
              { key: 'target_unit_code', label: 'Đơn vị nhận', render: (r) => r.target_unit_code || 'Tất cả' },
              { key: 'created_at', label: 'Ngày xuất', fmt: 'date' },
              { key: 'created_by', label: 'Người xuất' },
              { key: 'status', label: 'Trạng thái', render: (r) => h('span', { class: 'tag ok' }, r.status) }
            ]
          })
        )
      );
    }
    body.append(out);
  }
})();
