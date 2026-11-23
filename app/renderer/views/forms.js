'use strict';
/**
 * Danh mục › Hình thức giá (màn chính–phụ).
 * - Chính: bảng hình thức giá (ngày cập nhật · mã hình thức · công thức tính giá · hiệu lực · số đơn giá). Thêm / sửa / xóa CHỈ ở đây (ADMIN, KẾ TOÁN).
 * - Phụ (bấm một dòng): "Đơn giá theo hình thức này" — CHỈ XEM, kèm hướng dẫn: thêm / sửa / xóa đơn giá ở Danh mục › Đơn giá.
 * Công thức chỉ là mô tả (hiển thị); cách tính do phần mềm cố định theo mã hình thức.
 */
(function () {
  const D = window.DGVC; const { h } = D;
  const METHODS = [['CO_DINH', 'Đơn giá cố định (CO_DINH)'], ['THEO_DAU', 'Đơn giá điều chỉnh theo giá dầu (THEO_DAU)']];
  const uomText = (u) => (u === 'M3' ? 'đ/m³' : 'đ/tấn');
  const validity = (r) => h('div', {}, h('span', {}, `từ ${D.dmy(r.catalogDate)}`), ' → ', r.effectiveTo ? h('span', {}, D.dmy(r.effectiveTo)) : h('b', {}, 'đang hiệu lực'));
  const lineValidity = (r) => (r.status === 'DRAFT' ? 'Chưa áp dụng' : `${D.dmy(r.effectiveFrom)} → ${r.effectiveTo ? D.dmy(r.effectiveTo) : 'đang hiệu lực'}`);

  /** Bảng bấm được bằng chuột và bàn phím (Tab / Enter / Space) — dùng chung cho các màn chính–phụ. */
  D.clickableRows = (tableEl, rows, keyOf, selected, onPick) => {
    const trs = [...tableEl.querySelectorAll('tbody tr')];
    rows.forEach((r, i) => {
      const tr = trs[i]; if (!tr) return;
      tr.classList.add('click'); tr.tabIndex = 0; tr.title = 'Bấm để xem chi tiết';
      if (keyOf(r) === selected) { tr.classList.add('sel'); tr.setAttribute('aria-current', 'true'); }
      tr.addEventListener('click', (e) => { if (e.target.closest('button, a, input, select, textarea')) return; onPick(r); });
      tr.addEventListener('keydown', (e) => { if (e.target !== tr) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(r); } });
    });
  };

  D.views.forms = {
    async render(p) {
      const w = D.writer(); const guard = D.latest();
      let items = []; let sel = (p && p.formId) || ''; let showClosed = true;
      const closedBox = h('input', { type: 'checkbox', id: 'hf-closed', checked: true });
      const mainCard = h('section', { class: 'card flush xv-main xv-tbl', 'aria-label': 'Danh mục hình thức giá' });
      const side = h('aside', { class: 'card xv-side', 'aria-label': 'Đơn giá theo hình thức này (chỉ xem)', 'aria-live': 'polite' });

      const guide = () => h('div', { class: 'xv-guide', role: 'note' },
        h('b', {}, 'Chỉ để xem. '), 'Thêm / sửa / xóa đơn giá ở ', h('b', {}, 'Danh mục › Đơn giá'), '.',
        h('div', { style: { marginTop: '6px' } }, h('button', { class: 'btn small', 'aria-label': 'Mở màn Đơn giá', onclick: () => D.go('pricecodes') }, 'Mở Đơn giá')));

      const loadList = async () => {
        const tok = guard.next();
        const d = await D.api('forms.list', { includeClosed: showClosed });
        if (!guard.ok(tok)) return;
        items = d.items || [];
        if (sel && !items.some((x) => x.formId === sel)) sel = '';
        drawMain();
      };

      const saved = async (r, msg) => { for (const x of r.warnings || []) D.toast(x.message, 'info', 9000); if (msg) D.toast(msg, 'ok', 8000); await loadList(); await drawSide(); };

      const addForm = () => {
        const latest = (m) => items.filter((x) => x.methodCode === m && x.status === 'ACTIVE').sort((a, b) => (a.catalogDate < b.catalogDate ? 1 : -1))[0];
        const fields = [
          { key: 'methodCode', label: 'Mã hình thức', type: 'select', options: METHODS, required: true, hint: 'chọn từ danh sách hệ thống' },
          { key: 'catalogDate', label: 'Ngày cập nhật (hiệu lực từ ngày)', type: 'date', required: true, hint: 'phải sau ngày của dòng đang hiệu lực; dòng cũ cùng mã tự hết hiệu lực' },
          { key: 'formName', label: 'Tên hình thức giá', full: true },
          { key: 'formulaText', label: 'Công thức tính giá (mô tả)', type: 'textarea', rows: 4, full: true, hint: 'Chỉ mô tả — không đổi cách tính của phần mềm' },
          { key: 'note', label: 'Ghi chú', full: true }
        ];
        const first = latest('CO_DINH') || {};
        const f = D.form(fields, { methodCode: 'CO_DINH', catalogDate: D.today(), formName: first.formName || '', formulaText: first.formulaText || '' });
        let touched = { formName: false, formulaText: false };
        f.inputs.formName.addEventListener('input', () => { touched.formName = true; });
        f.inputs.formulaText.addEventListener('input', () => { touched.formulaText = true; });
        f.inputs.methodCode.addEventListener('change', () => { const l = latest(f.inputs.methodCode.value) || {}; if (!touched.formName) f.inputs.formName.value = l.formName || ''; if (!touched.formulaText) f.inputs.formulaText.value = l.formulaText || ''; });
        D.modal({
          title: 'Thêm hình thức giá', wide: true, body: f,
          actions: [{ label: 'Hủy', run: () => true }, { label: 'Lưu', primary: true, run: async () => {
            const v = f.values(); const miss = fields.filter((x) => x.required && !v[x.key]).map((x) => x.label);
            if (miss.length) { D.toast(`Chưa nhập: ${miss.join(', ')}`, 'err'); return false; }
            const r = await D.api('forms.save', { create: true, record: v });
            const when = D.dmy(r.record.catalogDate);
            const tail = (r.closed || []).length ? ` Dòng cũ ${r.closed.join(', ')} đã hết hiệu lực (đến ${D.dmy(addDay(r.record.catalogDate, -1))}).` : ' Chưa có dòng cũ cùng mã.';
            sel = r.record.formId;
            await saved(r, `Đã thêm hình thức ${r.record.formId} (hiệu lực từ ${when}).${tail}`);
            return true;
          } }]
        });
      };
      const addDay = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

      const editForm = (r) => D.formModal({
        title: `Sửa hình thức ${r.formId}`, wide: true,
        fields: [
          { key: 'methodLabel', label: 'Mã hình thức', readonly: true, hint: 'không đổi được — thêm dòng mới cho mã khác' },
          { key: 'catalogDate', label: 'Ngày cập nhật', type: 'date', readonly: true, hint: 'không đổi được — muốn đổi ngày thì thêm dòng mới' },
          { key: 'formName', label: 'Tên hình thức giá', required: true, full: true },
          { key: 'formulaText', label: 'Công thức tính giá (mô tả)', type: 'textarea', rows: 4, full: true, hint: 'Chỉ mô tả — không đổi cách tính của phần mềm' },
          { key: 'note', label: 'Ghi chú', full: true }
        ],
        values: { methodLabel: `${r.methodLabel} (${r.methodCode})`, catalogDate: r.catalogDate, formName: r.formName, formulaText: r.formulaText, note: r.note },
        submit: async (v) => { const x = await D.api('forms.save', { record: { formId: r.formId, formName: v.formName, formulaText: v.formulaText, note: v.note }, rowVersion: r.rowVersion }); sel = r.formId; await saved(x, `Đã lưu hình thức ${r.formId}`); }
      });

      const removeForm = async (r) => {
        const ok = await D.confirm({ title: `Xóa hình thức ${r.formId}`, message: `Xóa hình thức "${r.formName}" (${r.methodLabel}, từ ${D.dmy(r.catalogDate)})?\nChỉ xóa được dòng mới nhất của mã và chưa có đơn giá nào dùng.`, okLabel: 'Xóa', danger: true });
        if (!ok) return;
        try {
          const x = await D.api('forms.remove', { formId: r.formId }, { quiet: true });
          if (sel === r.formId) sel = '';
          await saved(x, `Đã xóa hình thức ${r.formId}${(x.reopened || []).length ? ` — dòng ${x.reopened.join(', ')} hiệu lực trở lại` : ''}`);
        } catch (e) { D.toast(e.message, 'err', 14000); }
      };

      const pick = async (r) => { sel = r.formId; drawMain(); await drawSide(); };

      function drawMain() {
        const rows = items;
        const table = D.table({
          rows, empty: 'Chưa có hình thức giá nào',
          columns: [
            { key: 'catalogDate', label: 'Ngày cập nhật', render: (r) => D.dmy(r.catalogDate) },
            { key: 'methodCode', label: 'Mã hình thức', render: (r) => h('div', {}, h('b', {}, r.methodLabel), h('div', { class: 'small muted mono' }, r.methodCode), r.formName && r.formName !== r.methodLabel ? h('div', { class: 'small' }, r.formName) : null) },
            { key: 'formulaText', label: 'Công thức tính giá', render: (r) => h('div', { class: 'xv-formula' }, r.formulaText || '—') },
            { key: 'eff', label: 'Hiệu lực', render: (r) => h('div', {}, validity(r), h('div', { style: { marginTop: '3px' } }, r.status === 'ACTIVE' ? D.tag('ok', 'Đang dùng') : D.tag('mute', 'Hết hiệu lực'))) },
            { key: 'cnt', label: 'Đơn giá', num: true, render: (r) => h('div', {}, h('b', {}, D.vn(r.priceLineCount)), h('div', { class: 'small muted' }, `${D.vn(r.activeLineCount)} đang dùng`)) },
            ...(w ? [{ key: 'x', label: 'Thao tác', render: (r) => h('span', { class: 'btns' },
              h('button', { class: 'btn small', 'aria-label': `Sửa hình thức ${r.formId}`, onclick: () => editForm(r) }, 'Sửa'),
              h('button', { class: 'btn small danger', 'aria-label': `Xóa hình thức ${r.formId}`, onclick: () => removeForm(r) }, 'Xóa')) }] : [])
          ]
        });
        D.clickableRows(table, rows, (r) => r.formId, sel, pick);
        mainCard.replaceChildren(
          h('div', { class: 'xv-bar' },
            h('span', { class: 'small muted grow' }, 'Bấm một dòng để xem đơn giá theo hình thức đó (ngăn bên cạnh, chỉ xem).'),
            h('label', { class: 'check', for: 'hf-closed' }, closedBox, 'Hiện cả dòng đã hết hiệu lực')),
          table);
      }

      async function drawSide() {
        const tok = guard.next();
        if (!sel) {
          side.replaceChildren(h('h2', { class: 'xv-h' }, 'Đơn giá theo hình thức này'), guide(), h('p', { class: 'muted', style: { margin: '10px 0 0' } }, 'Chọn một dòng ở bảng hình thức giá để xem các đơn giá dùng hình thức đó.'));
          return;
        }
        let d;
        try { d = await D.api('forms.get', { formId: sel }, { quiet: true }); } catch { sel = ''; drawMain(); return drawSide(); }
        if (!guard.ok(tok)) return;
        const r = d.record;
        const table = D.table({
          rows: d.lines || [], empty: 'Chưa có đơn giá nào dùng hình thức này',
          columns: [
            { key: 'updateDate', label: 'Ngày cập nhật', render: (x) => D.dmy(x.updateDate) },
            { key: 'priceId', label: 'Mã đơn giá', render: (x) => h('span', { class: 'mono' }, x.priceId) },
            { key: 'routeCode', label: 'Tuyến', render: (x) => h('div', {}, h('b', { class: 'mono' }, x.routeCode), h('div', { class: 'small muted' }, x.routeName)) },
            { key: 'price', label: 'Đơn giá', num: true, render: (x) => (x.price == null ? '—' : h('span', {}, h('span', { class: 'money' }, D.vn(x.price)), h('div', { class: 'small muted' }, uomText(x.uom)))) },
            { key: 'eff', label: 'Hiệu lực', render: (x) => lineValidity(x) },
            { key: 'status', label: 'Trạng thái', render: (x) => D.tag(x.status) }
          ]
        });
        side.replaceChildren(
          h('h2', { class: 'xv-h' }, 'Đơn giá theo hình thức này'),
          h('p', { class: 'small', style: { margin: '0 0 8px' } }, h('b', {}, r.methodLabel), ` · ${r.formId} · từ ${D.dmy(r.catalogDate)} — ${D.vn(r.priceLineCount)} đơn giá (${D.vn(r.activeLineCount)} đang dùng)`),
          guide(),
          h('div', { class: 'xv-tbl xv-tbl-side', style: { marginTop: '10px' } }, table));
      }

      closedBox.addEventListener('change', () => { showClosed = closedBox.checked; loadList(); });
      const page = D.page('Hình thức giá', 'Danh mục › Hình thức giá — mã hình thức, công thức mô tả và hiệu lực; đơn giá nằm ở Danh mục › Đơn giá',
        [w ? h('button', { class: 'btn primary', onclick: addForm }, 'Thêm hình thức') : null],
        h('div', { class: 'xv-layout' }, mainCard, side));
      await loadList();
      await drawSide();
      return page;
    }
  };
})();
