'use strict';
/**
 * Mã đơn giá — mô hình CHA–CON: Đơn vị → Mã đơn giá (cha) → Dòng giá theo tuyến (con).
 * Dòng giá = phiên bản giá như màn "Đơn giá" (NHÁP → Áp dụng), mặc định ĐƠN GIÁ CỐ ĐỊNH đ/tấn. Hợp đồng chọn mã ở màn Hợp đồng (hoặc nút "Gán cho hợp đồng…" ở đây).
 * Không chọn mã → giá chung / giá riêng hợp đồng chạy nguyên như cũ.
 */
(function () {
  const D = window.DGVC; const { h } = D;
  const METHOD = (r) => (r.price_method === 'CO_DINH' ? D.tag('info', 'Cố định') : h('span', { class: 'small muted' }, 'Theo giá dầu'));

  D.views.pricecodes = {
    async render(p) {
      const w = D.writer(); let sel = p.code || ''; const guard = D.latest();
      const tree = h('aside', { class: 'card pc-tree', 'aria-label': 'Đơn vị và mã đơn giá' }); const detail = h('section', { class: 'pc-detail', 'aria-live': 'polite' });
      const again = async (code) => { if (code !== undefined) sel = code; await loadTree(); await loadDetail(); };

      // ── Cha: tạo / sửa mã ──
      const codeForm = (unitCode, rec) => {
        const fields = [{ key: 'priceCode', label: 'Mã đơn giá', required: true, readonly: !!rec, hint: rec ? 'không đổi được' : 'vd DG-DH-2026 (chữ HOA, số, . _ -)' },
          { key: 'unitCode', label: 'Đơn vị', type: 'select', options: D.unitOptions().filter(([c]) => c !== D.state.boot.install.unitCode || c === (rec && rec.unit_code)), required: true, hint: 'công ty đối tác áp dụng mã giá' }, { key: 'priceName', label: 'Tên mã đơn giá', required: true, full: true, hint: 'vd "Giá cố định 2026 — Đại Hiệp"' }, { key: 'note', label: 'Ghi chú', full: true }];
        D.formModal({ title: rec ? `Sửa mã ${rec.price_code}` : 'Tạo mã đơn giá', fields, wide: false, values: rec ? { priceCode: rec.price_code, unitCode: rec.unit_code, priceName: rec.price_name, note: rec.note } : { unitCode },
          submit: async (v) => {
            const r = await D.api('pricecodes.save', rec ? { record: v, rowVersion: rec.row_version } : { create: true, record: v });
            for (const x of r.warnings || []) D.toast(x.message, 'info', 9000);
            D.toast(rec ? 'Đã lưu mã đơn giá' : `Đã tạo mã ${v.priceCode} — thêm dòng giá để áp dụng`, 'ok'); await again(v.priceCode.trim().toUpperCase());
          } });
      };

      // ── Con: thêm dòng giá cố định ──
      const lineForm = (code, line) => {
        const fields = [...(line ? [] : [{ key: 'routeCode', label: 'Tuyến', type: 'select', options: D.routeOptions(false), required: true }]),
          { key: 'fixedPrice', label: 'Đơn giá cố định / tấn (chưa VAT)', money: true, required: true, hint: 'dùng nguyên số này làm đơn giá vận chuyển — không tính dầu, không làm tròn lại' },
          { key: 'effectiveFrom', label: 'Hiệu lực từ ngày', type: 'date', required: true }, { key: 'sourceNote', label: 'Căn cứ', full: true, hint: 'vd Phụ lục HĐ số …' }];
        D.formModal({ title: line ? `Sửa dòng giá nháp ${line.price_id}` : `Thêm dòng giá cố định vào mã ${code.price_code}`, fields,
          values: line ? { fixedPrice: line.fixed_price, effectiveFrom: line.effective_from, sourceNote: line.source_note } : { effectiveFrom: D.today() },
          submit: async (v) => {
            if (line) await D.api('prices.updateDraft', { priceId: line.price_id, rowVersion: line.row_version, record: { priceMethod: 'CO_DINH', fixedPrice: v.fixedPrice, effectiveFrom: v.effectiveFrom, sourceNote: v.sourceNote } });
            else await D.api('pricecodes.addLine', { priceCode: code.price_code, record: { ...v, priceMethod: 'CO_DINH' } });
            D.toast(line ? 'Đã lưu dòng giá nháp' : 'Đã thêm dòng giá (NHÁP) — bấm "Áp dụng" để dùng', 'ok'); await again();
          } });
      };

      // ── Con: chọn đơn giá CÓ SẴN đưa vào mã ──
      const pickExisting = async (code) => {
        const d = await D.api('prices.list', { status: 'ACTIVE' }); const rows = d.items.filter((x) => !x.price_code);
        const chosen = new Set(); const date = h('input', { type: 'date', value: D.today(), 'aria-label': 'Hiệu lực từ ngày' });
        const table = D.table({ rows, empty: 'Chưa có đơn giá đang dùng', maxHeight: '50vh', columns: [
          { key: 'pick', label: '', render: (r) => h('input', { type: 'checkbox', 'aria-label': `Chọn ${r.price_id}`, onchange: (e) => (e.target.checked ? chosen.add(r.price_id) : chosen.delete(r.price_id)) }) },
          { key: 'route_code', label: 'Tuyến' }, { key: 'contract_id', label: 'Phạm vi', render: (r) => (r.contract_id ? D.tag('info', `HĐ ${r.contract_id}`) : h('span', { class: 'small muted' }, 'Giá chung')) },
          { key: 'price_method', label: 'Phương thức', render: METHOD }, { key: 'v', label: 'Đơn giá', num: true, render: (r) => D.vnAuto(r.price_method === 'CO_DINH' ? r.fixed_price : r.contractPrice) },
          { key: 'effective_from', label: 'Từ ngày', fmt: 'date' }] });
        D.modal({ title: `Chọn đơn giá có sẵn đưa vào mã ${code.price_code}`, wide: true, body: h('div', {}, h('p', { class: 'small' }, 'Tích chọn các đơn giá; app SAO CHÉP vào mã này thành dòng NHÁP (đơn giá gốc không đổi). Sau đó bấm "Áp dụng" từng dòng.'),
          h('label', { class: 'field', style: { maxWidth: '220px' } }, h('span', {}, 'Hiệu lực từ ngày'), date), table),
          actions: [{ label: 'Hủy', run: () => true }, { label: 'Đưa vào mã', primary: true, run: async () => {
            if (!chosen.size) { D.toast('Chưa chọn đơn giá nào', 'err'); return false; }
            let n = 0; for (const id of chosen) { try { await D.api('pricecodes.addLine', { priceCode: code.price_code, fromPriceId: id, record: { effectiveFrom: date.value } }); n++; } catch { /* lỗi đã hiện; làm tiếp các dòng sau */ } }
            if (n) D.toast(`Đã đưa ${n} dòng vào mã (NHÁP)`, 'ok'); await again(); return true; } }] });
      };

      // ── Gán mã cho hợp đồng ──
      const assign = async (code) => {
        const cons = (await D.api('contracts.list')).items.filter((c) => c.customer_unit_code === code.unit_code || c.carrier_unit_code === code.unit_code);
        if (!cons.length) { D.toast(`Chưa có hợp đồng nào của đơn vị ${code.unit_code}`, 'err'); return; }
        const s = h('select', { 'aria-label': 'Hợp đồng' }, cons.map((c) => h('option', { value: c.contract_id }, `${c.contract_code} — ${c.carrier_unit_code} → ${c.customer_unit_code}${c.price_code ? ` (đang dùng mã ${c.price_code})` : ''}`)));
        D.modal({ title: `Gán mã ${code.price_code} cho hợp đồng`, body: h('div', {}, h('p', { class: 'small' }, 'Từ nay các kỳ tính của hợp đồng dùng dòng giá của mã này (theo tuyến và ngày hiệu lực); tuyến mã chưa có dòng giá vẫn dùng giá cũ. Kỳ NHÁP của hợp đồng phải tính lại; kỳ đã xác nhận / khóa giữ nguyên.'), h('label', { class: 'field' }, h('span', {}, 'Hợp đồng'), s)),
          actions: [{ label: 'Hủy', run: () => true }, { label: 'Gán mã', primary: true, run: async () => {
            const c = cons.find((x) => x.contract_id === s.value);
            if (c.price_code && c.price_code !== code.price_code && !(await D.confirm({ title: 'Đổi mã đơn giá của hợp đồng', message: `Hợp đồng ${c.contract_code} đang dùng mã ${c.price_code}. Đổi sang ${code.price_code}?` }))) return false;
            await D.api('contracts.save', { record: { contractId: c.contract_id, priceCode: code.price_code }, rowVersion: c.row_version }); await D.refreshBoot();
            D.toast(`Đã gán mã ${code.price_code} cho hợp đồng ${c.contract_code}`, 'ok'); await again(); return true; } }] });
      };
      const unassign = async (code, c) => {
        if (!(await D.confirm({ title: 'Bỏ mã khỏi hợp đồng', message: `Hợp đồng ${c.contractCode} quay về giá chung / giá riêng hợp đồng như trước khi gán mã.` }))) return;
        const cur = (await D.api('contracts.list')).items.find((x) => x.contract_id === c.contractId);
        await D.api('contracts.save', { record: { contractId: c.contractId, priceCode: '' }, rowVersion: cur.row_version }); await D.refreshBoot(); D.toast('Đã bỏ mã khỏi hợp đồng', 'ok'); await again();
      };

      async function loadDetail() {
        const tok = guard.next();
        if (!sel) { detail.replaceChildren(h('div', { class: 'card' }, h('h2', {}, 'Chọn một mã đơn giá'), h('p', { class: 'muted' }, 'Bấm một mã ở cột bên trái để xem các dòng giá theo tuyến. Chưa có mã? Bấm "+ Tạo mã" ở đơn vị tương ứng.'))); return; }
        let d; try { d = await D.api('pricecodes.get', { priceCode: sel }); } catch { sel = ''; return loadDetail(); }
        if (!guard.ok(tok)) return;
        const c = d.record; const closed = c.status !== 'ACTIVE';
        const head = h('div', { class: 'card' },
          h('div', { class: 'row' }, h('h2', { class: 'grow', style: { margin: 0 } }, `${c.price_code} · ${c.price_name}`), closed ? D.tag('CLOSED', 'Đã đóng') : D.tag('ACTIVE', 'Đang dùng')),
          h('p', { class: 'small' }, `Đơn vị: ${c.unit_code} · ${c.unitName} — ${D.vn(c.lineCount)} dòng giá (${D.vn(c.activeLines)} đang áp dụng, ${D.vn(c.draftLines)} nháp)`), c.note ? h('p', { class: 'small muted' }, c.note) : null,
          h('div', { class: 'small', style: { margin: '6px 0' } }, 'Hợp đồng đang dùng mã: ', c.contracts.length ? c.contracts.map((x) => h('span', { class: 'tag info', style: { marginRight: '6px' } }, x.contractCode, w ? h('button', { class: 'btn small', 'aria-label': `Bỏ mã khỏi hợp đồng ${x.contractCode}`, title: 'Bỏ mã khỏi hợp đồng', style: { marginLeft: '6px', minHeight: '20px', padding: '0 6px' }, onclick: () => unassign(c, x) }, '✕') : null)) : h('span', { class: 'muted' }, 'chưa có')),
          w ? h('div', { class: 'btns' },
            h('button', { class: 'btn primary', disabled: closed, onclick: () => lineForm(c) }, 'Thêm dòng giá cố định'),
            h('button', { class: 'btn', disabled: closed, onclick: () => pickExisting(c) }, 'Chọn đơn giá có sẵn…'),
            h('button', { class: 'btn', disabled: closed, onclick: () => assign(c) }, 'Gán cho hợp đồng…'),
            h('button', { class: 'btn', onclick: () => codeForm(c.unit_code, c) }, 'Sửa mã'),
            h('button', { class: 'btn', onclick: async () => { if (!closed && !(await D.confirm({ title: 'Đóng mã đơn giá', message: `Mã ${c.price_code} không thêm dòng giá / không gán hợp đồng mới nữa. Hợp đồng đang dùng mã vẫn tính bình thường.` }))) return; await D.api('pricecodes.setActive', { priceCode: c.price_code, active: closed, rowVersion: c.row_version }); await again(); } }, closed ? 'Mở lại mã' : 'Đóng mã')) : null);
        const table = h('div', { class: 'card flush', style: { overflowX: 'auto' } }, D.table({ rows: d.lines, empty: 'Mã chưa có dòng giá — bấm "Thêm dòng giá cố định" hoặc "Chọn đơn giá có sẵn…"', columns: [
          { key: 'route_code', label: 'Tuyến' }, { key: 'routeName', label: 'Tên tuyến', wrap: true }, { key: 'price_method', label: 'Phương thức', render: METHOD },
          { key: 'v', label: 'Đơn giá (chưa VAT)', num: true, render: (r) => D.vnAuto(r.price_method === 'CO_DINH' ? r.fixed_price : r.contractPrice) }, { key: 'uom', label: 'ĐVT', render: (r) => (r.uom === 'M3' ? 'đ/m³' : 'đ/tấn') },
          { key: 'effective_from', label: 'Từ ngày', fmt: 'date' }, { key: 'effective_to', label: 'Đến ngày', fmt: 'date' }, { key: 'status', label: 'Trạng thái', fmt: 'tag' },
          { key: 'x', label: '', render: (r) => (w && r.status === 'DRAFT' ? h('span', { class: 'btns' },
            r.price_method === 'CO_DINH' ? h('button', { class: 'btn small', onclick: () => lineForm(c, r) }, 'Sửa') : null,
            h('button', { class: 'btn small primary', onclick: async () => { const x = await D.api('prices.activate', { priceId: r.price_id, rowVersion: r.row_version }); for (const m of x.warnings || []) D.toast(m.message, 'info', 9000); D.toast(`Đã áp dụng ${r.price_id}${x.closed.length ? ` · đóng ${x.closed.length} dòng cũ cùng mã` : ''}`, 'ok'); await again(); } }, 'Áp dụng')) : '') }] }));
        detail.replaceChildren(head, table);
      }

      async function loadTree() {
        const d = await D.api('pricecodes.list'); tree.replaceChildren();
        const me = D.state.boot.install.unitCode; const shown = d.units.filter((u) => u.unitCode !== me || u.codes.length); // công ty mình không phải đối tác để gán giá
        const withCodes = shown.filter((u) => u.codes.length); const without = shown.filter((u) => !u.codes.length);
        const unitBlock = (u) => h('div', { class: 'pc-unit' }, h('div', { class: 'row pc-unit-h' }, h('b', { class: 'grow' }, `${u.unitCode}`, h('span', { class: 'small muted', style: { fontWeight: 400 } }, ` · ${u.unitName}`)), w ? h('button', { class: 'btn small', title: `Tạo mã đơn giá cho ${u.unitCode}`, onclick: () => codeForm(u.unitCode) }, '+ Tạo mã') : null),
          u.codes.length ? u.codes.map((c) => h('button', { class: 'pc-code', 'aria-current': String(c.price_code === sel), onclick: async () => { sel = c.price_code; await loadTree(); await loadDetail(); } },
            h('span', { class: 'mono' }, c.price_code), h('span', { class: 'small muted' }, ` ${c.price_name}`), c.status !== 'ACTIVE' ? h('span', { class: 'tag mute', style: { marginLeft: '6px' } }, 'đóng') : null)) : h('p', { class: 'small muted', style: { margin: '2px 0 8px' } }, 'Chưa có mã đơn giá'));
        tree.append(h('h2', {}, 'Công ty đối tác → Mã đơn giá'), withCodes.length ? withCodes.map(unitBlock) : h('p', { class: 'small muted' }, 'Chưa có mã đơn giá nào. Chọn đơn vị bên dưới và bấm "+ Tạo mã".'),
          without.length ? h('details', { open: !withCodes.length }, h('summary', { class: 'small muted' }, `Đối tác chưa có mã (${without.length})`), without.map(unitBlock)) : null);
      }

      const page = D.page('Mã đơn giá', '5 · Đơn giá cố định theo đơn vị', [], h('p', { class: 'small muted', style: { margin: '0 0 10px' } }, 'Tổ chức cha–con: Công ty đối tác → Mã đơn giá → Dòng giá theo tuyến. Hợp đồng gán mã sẽ dùng dòng giá của mã (theo tuyến và ngày); hợp đồng không gán mã chạy như cũ.'), h('div', { class: 'pc-layout' }, tree, detail));
      await loadTree(); await loadDetail();
      return page;
    },
  };
})();
