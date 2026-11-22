'use strict';
/*
 * DGVC — Các đợt dữ liệu của ĐỐI TÁC (trước đây màn "Nhập dữ liệu thuê VC").
 * Đã GỘP vào màn "Đối chiếu dữ liệu" (renderer/views/reconcile.js): ô chọn file + nút "Lưu thành đợt" nằm ở thẻ "Đối chiếu 3 tiêu chí",
 * danh sách / xem / xóa đợt nằm ở thẻ "Các đợt đã nạp". File này chỉ giữ:
 *  - D.partnerBatch.saveDialog(...)  hộp thoại lưu một file đối tác thành đợt (có chống trùng: hỏi xác nhận khi file / phiếu đã nạp);
 *  - D.partnerBatch.listCard(...)    bảng các đợt đã nạp (đối chiếu / xóa);
 *  - D.views.subcontract             bí danh: id màn cũ mở sang Đối chiếu dữ liệu (D.go('subcontract') đã được app.js chuyển hướng).
 * Đợt chỉ là BẢN SAO dữ liệu đối tác phục vụ đối chiếu — không vào kỳ, không đổi số tiền của kỳ nào.
 */
(function () {
  const D = window.DGVC; const { h } = D;
  const kpi = (label, value, sub, cls = '') => h('div', { class: `kpi ${cls}` }, h('div', { class: 'v' }, value), h('div', { class: 'l' }, label), sub ? h('div', { class: 'small muted' }, sub) : null);

  D.partnerBatch = {
    /** Lưu file đối tác (Excel / .json / .dgvc) thành đợt. onSaved(batch) chạy sau khi lưu xong. */
    async saveDialog({ filePath, onSaved }) {
      if (!filePath) { D.toast('Chọn file của đối tác trước khi lưu thành đợt', 'warn'); return; }
      let pv;
      try { pv = await D.api('subcontract.preview', { filePath }, { quiet: true }); } catch (err) { D.toast(`Không đọc được file: ${err.message}`, 'err', 9000); return; }
      const s = pv.summary;
      const periodsRes = await D.api('periods.list', {}).catch(() => ({ items: [] }));
      const periodOpts = [['', '— Không gán kỳ (chỉ để đối chiếu) —'], ...(periodsRes.items || []).map((p) => [p.period_id, `${p.period_code} · ${p.contract_code || p.contract_id} (${D.dmy(p.date_from)} → ${D.dmy(p.date_to)}) [${p.status}]`])];
      const f = D.form([
        { key: 'partnerName', label: 'Tên đơn vị đối tác (gửi file)', type: 'text', placeholder: 'Ví dụ: CÔNG TY VẬN TẢI TUẤN HƯNG' },
        { key: 'batchName', label: 'Tên đợt / ghi chú', type: 'text', placeholder: 'Ví dụ: Đợt 1 - tuyến VC.007 từ 18/09 - 23/09' },
        { key: 'periodId', label: 'Kỳ tính công ty liên quan (tùy chọn)', type: 'select', options: periodOpts, full: true },
        { key: 'rentUnitPrice', label: 'Đơn giá thuê (đ/tấn)', type: 'number', placeholder: 'Ví dụ: 155000' },
        { key: 'fuelUnitPrice', label: 'Đơn giá dầu cấp (đ/lít)', type: 'number', placeholder: 'Ví dụ: 19500' },
        { key: 'deductFuel', label: 'Khấu trừ tiền dầu cấp vào cước thanh toán', type: 'check', full: true },
      ], { partnerName: pv.partnerSuggested || '', batchName: '', periodId: '', rentUnitPrice: '', fuelUnitPrice: '', deductFuel: true });
      const warn = [];
      if (pv.duplicates && pv.duplicates.length) warn.push(h('div', { class: 'card err-card', role: 'alert' }, h('b', {}, 'Lưu ý: '), pv.duplicates[0].reason === 'SAME_FILE' ? `file này đã nạp ở đợt "${pv.duplicates[0].batchName}" (${pv.duplicates[0].batchId}).` : `toàn bộ phiếu / dầu trùng với đợt đã nạp "${pv.duplicates[0].batchName}" (${pv.duplicates[0].batchId}).`, ' Lưu lại sẽ hỏi xác nhận.'));
      if (pv.unreadable && pv.unreadable.length) warn.push(h('div', { class: 'card small' }, h('b', {}, `${D.vn(pv.unreadable.length)} dòng Excel không đọc được (bỏ qua): `), pv.unreadable.slice(0, 5).map((x) => `${x.sheet} dòng ${x.rowNo}: ${x.note}`).join(' · '), pv.unreadable.length > 5 ? ' …' : ''));
      const save = async (confirmDuplicate) => {
        const v = f.values();
        return D.api('subcontract.importBatch', { filePath, periodId: v.periodId || undefined, partnerName: v.partnerName, batchName: v.batchName, rentUnitPrice: Number(v.rentUnitPrice) || 0,
          fuelUnitPrice: Number(v.fuelUnitPrice) || 0, deductFuel: !!v.deductFuel, confirmDuplicate: !!confirmDuplicate, clientRequestId: D.rid() }, { quiet: true });
      };
      D.modal({
        title: 'Lưu thành đợt để đối chiếu lại',
        wide: true,
        body: h('div', {},
          h('p', { class: 'small muted' }, 'Đợt chỉ là bản sao dữ liệu của đối tác phục vụ đối chiếu — KHÔNG vào kỳ và không đổi số tiền của kỳ nào. Lưu để lần sau chọn lại, không phải chọn file.'),
          h('div', { class: 'kpis' }, kpi('Phiếu cân', D.vn(s.ticketCount), `${D.vn(s.totalTon)} tấn`, 'main'), kpi('Dầu', D.vn(s.fuelCount), `${D.vnAuto(s.totalFuelLiter)} lít`), kpi('Số xe', D.vn(s.plateCount)), kpi('Khoảng ngày', `${D.dmy(s.dateFrom)} → ${D.dmy(s.dateTo)}`)),
          ...warn, f),
        actions: [{ label: 'Hủy', run: () => true }, { label: 'Lưu đợt', primary: true, run: async () => {
          let res;
          try { res = await save(false); } catch (err) {
            if (!(err.details && err.details.code === 'E_BATCH_DUPLICATE')) { D.toast(err.message, 'err', 9000); return false; }
            const yes = await D.confirm({ title: 'File đã nạp trước đó', message: `${err.message}\n\nVẫn nạp thêm một đợt nữa?`, okLabel: 'Vẫn nạp thêm' });
            if (!yes) return false;
            try { res = await save(true); } catch (e2) { D.toast(e2.message, 'err', 9000); return false; }
          }
          D.toast(`Đã lưu đợt ${res.batchName} (${res.batchId})`, 'ok', 6000);
          if (onSaved) onSaved(res);
          return true;
        } }],
      });
    },

    /** Bảng các đợt đã nạp: Đối chiếu / Xóa (nút ghi chỉ hiện với ADMIN, KE_TOAN). */
    async listCard({ onCompare, onChanged }) {
      const listRes = await D.api('subcontract.list', {}).catch(() => []);
      const batches = Array.isArray(listRes) ? listRes : [];
      if (!batches.length) return h('div', { class: 'card empty-card' }, 'Chưa có đợt nào được lưu. Ở thẻ "Đối chiếu 3 tiêu chí": chọn file của đối tác, bấm "Lưu thành đợt" để dùng lại.');
      return h('div', { class: 'card flush' },
        h('div', { class: 'card-h row' }, h('h2', { class: 'grow' }, `Các đợt dữ liệu đối tác đã nạp (${batches.length})`), h('span', { class: 'small muted' }, 'Đợt chỉ là bản sao để đối chiếu — không vào kỳ')),
        D.table({
          rows: batches,
          empty: 'Không có đợt nào',
          columns: [
            { key: 'batchName', label: 'Tên đợt', render: (r) => h('b', {}, r.batchName) },
            { key: 'partnerName', label: 'Đơn vị đối tác', render: (r) => r.partnerName || '—' },
            { key: 'periodCode', label: 'Kỳ liên quan', render: (r) => (r.periodCode ? h('span', { class: 'mono b' }, r.periodCode) : h('span', { class: 'muted' }, 'Không gán')) },
            { key: 'summary', label: 'Phiếu cân', render: (r) => `${D.vn(r.summary.ticketCount)} phiếu · ${D.vn(r.summary.totalTon)} tấn (${r.summary.plateCount} xe)` },
            { key: 'fuel', label: 'Dầu nhận', render: (r) => `${D.vn(r.summary.fuelCount)} lần · ${D.vnAuto(r.summary.totalFuelLiter)} L` },
            { key: 'rentUnitPrice', label: 'Đơn giá thuê', render: (r) => (r.rentUnitPrice ? `${D.vn(r.rentUnitPrice)} đ/tấn` : '—') },
            { key: 'createdAt', label: 'Ngày nạp', fmt: 'date' },
            { key: 'actions', label: 'Thao tác', render: (r) => h('div', { class: 'btns' },
              h('button', { class: 'btn small primary', title: 'Đối chiếu 3 tiêu chí (phiếu cân, dầu nhận, đơn giá & thành tiền)', onclick: () => onCompare(r) }, 'Đối chiếu'),
              D.writer() ? h('button', { class: 'btn small err', title: 'Xóa đợt này (chỉ xóa bản sao, không đụng dữ liệu của kỳ)', onclick: async () => {
                if (!(await D.confirm({ title: 'Xóa đợt', message: `Xóa đợt "${r.batchName}"? Chỉ xóa bản sao dùng để đối chiếu.`, okLabel: 'Xóa đợt', danger: true }))) return;
                await D.api('subcontract.delete', { batchId: r.batchId });
                D.toast(`Đã xóa đợt ${r.batchName}`, 'ok');
                if (onChanged) onChanged();
              } }, 'Xóa') : null) },
          ],
        }));
    },
  };

  // Bí danh: id màn cũ 'subcontract' — app.js (D.go) đã chuyển sang Đối chiếu dữ liệu; đây chỉ là dự phòng nếu có nơi gán thẳng state.view.
  D.views.subcontract = { async render(params = {}) { setTimeout(() => D.go('reconcile', { ...params, tab: params.tab === 'list' ? 'batches' : 'compare' })); return h('div'); } };
})();
