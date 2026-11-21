'use strict';
/**
 * Mã đơn giá & Phương thức đơn giá — Mô hình CHA–CON:
 * - Cha: Mã đơn giá / Phương thức đơn giá (PT-CD: Đơn giá cố định, PT-TD: Đơn giá điều chỉnh dầu, hoặc mã tự tạo).
 *   Click vào phương thức nào thì ra danh sách Đơn giá tương ứng.
 * - Con: 1 Phương thức có nhiều đơn giá, 1 đơn giá áp dụng cho 1 tuyến (chọn mã tuyến từ Danh mục tuyến).
 */
(function () {
  const D = window.DGVC; const { h } = D;
  const METHOD_LABEL = { CO_DINH: 'Đơn giá cố định', THEO_DAU: 'Đơn giá điều chỉnh dầu' };
  const lineMethod = (r) => (r.price_method === 'CO_DINH' ? 'CO_DINH' : 'THEO_DAU');
  const METHOD = (r) => (r.price_method === 'CO_DINH' ? D.tag('info', 'Cố định') : h('span', { class: 'small muted' }, 'Điều chỉnh dầu'));
  const routeOf = (code) => (D.state.boot.routes || []).find((r) => r.route_code === code);

  D.views.pricecodes = {
    async render(p) {
      const w = D.writer(); let sel = p.code || p.priceCode || ''; const guard = D.latest();
      const tree = h('aside', { class: 'card pc-tree', 'aria-label': 'Phương thức và mã đơn giá' });
      const detail = h('section', { class: 'pc-detail', 'aria-live': 'polite' });
      const again = async (code) => { if (code !== undefined) sel = code; await loadTree(); await loadDetail(); };

      // ── Cha: tạo / sửa mã phương thức đơn giá ──
      const METHOD_HINT = { CO_DINH: 'Mỗi tuyến một đơn giá đ/tấn cố định, dùng nguyên số — không tính dầu.', THEO_DAU: 'Đơn giá điều chỉnh dầu: đơn giá ký hợp đồng + chênh lệch giá dầu thực tế.' };
      const methodCards = (value, locked) => {
        const name = `pc-method-${Math.random().toString(36).slice(2, 7)}`;
        const cards = Object.entries(METHOD_LABEL).map(([m, label]) => h('label', { class: 'pc-card' },
          h('input', { type: 'radio', name, value: m, checked: m === value, disabled: locked }),
          h('b', {}, label),
          h('span', { class: 'small muted' }, METHOD_HINT[m])
        ));
        const group = h('div', { class: 'pc-cards', role: 'radiogroup', 'aria-label': 'Phương thức đơn giá' }, cards);
        group.value = () => (group.querySelector('input:checked') || {}).value || value;
        return group;
      };

      const codeForm = (method, rec, onSaved, defUnit) => {
        const locked = !!rec && (rec.lineCount > 0 || rec.contracts.length > 0);
        const mixed = !!rec && rec.priceMethod === 'HON_HOP';
        const cards = methodCards(rec ? rec.priceMethod : (method || 'CO_DINH'), locked);
        const installUnit = (D.state.boot.install || {}).unitCode || '';
        const fields = [
          { key: 'priceCode', label: 'Mã đơn giá', required: true, readonly: !!rec, hint: rec ? 'không đổi được' : 'vd PT-CD, PT-TD, DG-2026 (chữ HOA, số, . _ -)' },
          { key: 'unitCode', label: 'Đơn vị', type: 'select', options: D.unitOptions(), required: false, hint: 'áp dụng chung hoặc cho đối tác cụ thể' },
          { key: 'priceName', label: 'Tên mã đơn giá / Phương thức', required: true, full: true },
          { key: 'note', label: 'Ghi chú', full: true }
        ];
        const f = D.form(fields, rec ? { priceCode: rec.price_code, unitCode: rec.unit_code, priceName: rec.price_name, note: rec.note } : { unitCode: defUnit || installUnit || '' });
        D.modal({
          title: rec ? `Sửa mã ${rec.price_code}` : 'Tạo mã đơn giá',
          body: h('div', {},
            h('p', { class: 'small muted', style: { margin: '0 0 6px' } }, mixed ? 'Mã này có cả dòng cố định và điều chỉnh dầu (tạo ở bản cũ) — hãy tách thành 2 mã.' : locked ? 'Phương thức đơn giá không đổi được khi mã đã có dòng giá hoặc đã gán hợp đồng.' : 'Chọn phương thức đơn giá:'),
            cards,
            f
          ),
          actions: [
            { label: 'Hủy', run: () => true },
            { label: 'Lưu', primary: true, run: async () => {
              const v = { ...f.values(), ...(mixed ? {} : { priceMethod: cards.value() }) };
              const miss = fields.filter((x) => x.required && (v[x.key] === '' || v[x.key] === null)).map((x) => x.label);
              if (miss.length) { D.toast(`Chưa nhập: ${miss.join(', ')}`, 'err'); return false; }
              const r = await D.api('pricecodes.save', rec ? { record: v, rowVersion: rec.row_version } : { create: true, record: v });
              for (const x of r.warnings || []) D.toast(x.message, 'info', 9000);
              D.toast(rec ? 'Đã lưu mã đơn giá' : `Đã tạo mã ${v.priceCode} — thêm dòng giá để áp dụng`, 'ok');
              if (onSaved) await onSaved(v.priceCode.trim().toUpperCase());
              else await again(v.priceCode.trim().toUpperCase());
              return true;
            } }
          ]
        });
      };
      D.codeForm = codeForm;

      // ── Con: Thêm / sửa đơn giá theo tuyến ──
      const lineForm = (code, line, onSaved) => {
        const method = line ? lineMethod(line) : code.priceMethod;
        const all = Object.fromEntries(D.priceFormFields().map((f) => [f.key, f]));
        const date = { ...all.effectiveFrom, label: 'Ngày cập nhật (hiệu lực từ ngày)', hint: 'bản mới nhất không sau ngày tính có hiệu lực; bản cũ tự đóng' };
        const kmField = { key: 'distanceKm', label: 'Cự ly chuyến (km) — lấy từ Danh mục tuyến', readonly: true, hint: 'chỉ hiển thị; sửa ở Danh mục tuyến' };
        const priceFields = method === 'CO_DINH'
          ? [{ ...all.fixedPrice, required: true, hint: 'dùng nguyên số này làm đơn giá vận chuyển — không tính dầu, không làm tròn lại' }]
          : [
            { ...all.newPrice, label: 'Đơn giá ký hợp đồng dự kiến / tấn (chưa VAT)', hint: 'đơn giá dự kiến ghi trong danh mục, gồm dầu theo định mức' },
            { ...all.fuelPriceExclVat },
            { ...all.fuelNormLPerKm },
            { ...all.avgLoadTon },
            { ...all.avgVolumeM3 }
          ];
        const fields = [
          ...(line ? [] : [{ key: 'routeCode', label: 'Tuyến (từ Danh mục tuyến)', type: 'select', options: D.routeOptions(false), required: true }]),
          kmField,
          ...priceFields,
          date,
          { ...all.sourceNote }
        ];
        const km = (rc) => { const r = routeOf(rc); return r ? D.vnAuto(r.trip_distance_km) : ''; };
        const first = line ? line.route_code : (D.routeOptions(false)[0] || [''])[0];
        const routeRef = h('div', { class: 'small muted', style: { margin: '0 0 8px', padding: '8px 10px', background: 'var(--row-alt)', borderRadius: '8px', border: '1px solid var(--line)' } });
        const drawRouteRef = (rc) => {
          const r = routeOf(rc);
          routeRef.textContent = r
            ? `Tham chiếu Danh mục tuyến (${r.route_code}): ${r.route_name} · ${r.from_place || '—'} → ${r.to_place || '—'} · Cự ly 1 chiều: ${D.vnAuto(r.distance_km)} km · Cự ly chuyến: ${D.vnAuto(r.trip_distance_km)} km · ĐVT: ${r.uom === 'M3' ? 'M³' : 'Tấn'}`
            : 'Chọn tuyến từ Danh mục tuyến để lấy cự ly và ĐVT.';
        };
        drawRouteRef(first);
        const f = D.form(fields, line ? { distanceKm: km(line.route_code), fixedPrice: line.fixed_price, newPrice: line.new_price, fuelPriceExclVat: line.fuel_price_excl_vat, fuelNormLPerKm: line.fuel_norm_l_per_km, avgLoadTon: line.avg_load_ton, avgVolumeM3: line.avg_volume_m3, effectiveFrom: line.effective_from, sourceNote: line.source_note } : { distanceKm: km(first), effectiveFrom: D.today() });
        if (f.inputs.routeCode) f.inputs.routeCode.addEventListener('change', () => { const rc = f.inputs.routeCode.value; f.inputs.distanceKm.value = km(rc); drawRouteRef(rc); });

        const warn = h('div', { class: 'small', role: 'status', 'aria-live': 'polite', style: { marginTop: '8px' } });
        const check = async () => {
          const v = f.values(); const rc = line ? line.route_code : v.routeCode; const r = routeOf(rc); const msgs = [];
          if (r && !(r.trip_distance_km > 0)) msgs.push(`Cự ly chuyến của tuyến ${rc} chưa hợp lệ — sửa ở Danh mục tuyến trước khi áp dụng`);
          try {
            const x = await D.api('prices.preview', { record: { ...v, routeCode: rc, priceCode: code.price_code, priceMethod: method } }, { quiet: true });
            warn.className = 'small'; warn.replaceChildren(...msgs.map((m) => h('div', { class: 'warn-line' }, '⚠ ' + m)), h('div', { class: 'muted' }, `Xem trước: ${method === 'CO_DINH' ? 'đơn giá cố định' : 'ĐG ký HĐ tính ra'} = `, h('b', { class: 'money' }, D.vn(x.contractPrice)), ' đ/tấn'));
          } catch (e) {
            const errs = (e.details && e.details.errors) || [e.message];
            warn.replaceChildren(...msgs.concat(errs).map((m) => h('div', { class: 'warn-line' }, '⚠ ' + m)));
          }
        };
        f.addEventListener('input', () => { clearTimeout(f._t); f._t = setTimeout(check, 300); });
        f.addEventListener('change', () => { clearTimeout(f._t); f._t = setTimeout(check, 100); });

        D.modal({
          title: line ? `Sửa dòng giá nháp ${line.price_id}` : `Thêm dòng giá ${method === 'CO_DINH' ? 'cố định' : 'điều chỉnh dầu'} vào mã ${code.price_code}`,
          body: h('div', {}, routeRef, f, warn),
          wide: method !== 'CO_DINH',
          actions: [
            { label: 'Hủy', run: () => true },
            { label: 'Lưu', primary: true, run: async () => {
              const { distanceKm, ...v } = f.values();
              const miss = fields.filter((x) => x.required && x.key !== 'distanceKm' && (v[x.key] === '' || v[x.key] === null)).map((x) => x.label);
              if (miss.length) { D.toast(`Chưa nhập: ${miss.join(', ')}`, 'err'); return false; }
              if (line) await D.api('prices.updateDraft', { priceId: line.price_id, rowVersion: line.row_version, record: { ...v, priceMethod: method } });
              else await D.api('pricecodes.addLine', { priceCode: code.price_code, record: { ...v, priceMethod: method } });
              D.toast(line ? 'Đã lưu dòng giá nháp' : 'Đã thêm dòng giá (NHÁP) — bấm "Áp dụng" để dùng', 'ok');
              if (onSaved) await onSaved();
              else await again();
              return true;
            } }
          ]
        });
      };
      D.lineForm = lineForm;

      // ── Con: chọn đơn giá CÓ SẴN đưa vào mã ──
      const pickExisting = async (code, onSaved) => {
        const d = await D.api('prices.list', { status: 'ACTIVE' });
        const rows = (d.items || []).filter((x) => !x.price_code && (x.price_method || 'THEO_DAU') === code.priceMethod);
        const chosen = new Set(); const date = h('input', { type: 'date', value: D.today(), 'aria-label': 'Hiệu lực từ ngày' });
        const table = D.table({ rows, empty: `Chưa có ${METHOD_LABEL[code.priceMethod].toLowerCase()} đang dùng để chọn`, maxHeight: '50vh', columns: [
          { key: 'pick', label: '', render: (r) => h('input', { type: 'checkbox', 'aria-label': `Chọn ${r.price_id}`, onchange: (e) => (e.target.checked ? chosen.add(r.price_id) : chosen.delete(r.price_id)) }) },
          { key: 'route_code', label: 'Tuyến' },
          { key: 'contract_id', label: 'Phạm vi', render: (r) => (r.contract_id ? D.tag('info', `HĐ ${r.contract_id}`) : h('span', { class: 'small muted' }, 'Giá chung')) },
          { key: 'price_method', label: 'Phương thức', render: METHOD },
          { key: 'v', label: 'Đơn giá', num: true, render: (r) => D.vnAuto(r.price_method === 'CO_DINH' ? r.fixed_price : r.contractPrice) },
          { key: 'effective_from', label: 'Từ ngày', fmt: 'date' }
        ] });
        D.modal({
          title: `Chọn đơn giá có sẵn đưa vào mã ${code.price_code}`,
          wide: true,
          body: h('div', {},
            h('p', { class: 'small' }, 'Tích chọn các đơn giá; app SAO CHÉP vào mã này thành dòng NHÁP (đơn giá gốc không đổi). Sau đó bấm "Áp dụng" từng dòng.'),
            h('label', { class: 'field', style: { maxWidth: '220px' } }, h('span', {}, 'Hiệu lực từ ngày'), date),
            table
          ),
          actions: [
            { label: 'Hủy', run: () => true },
            { label: 'Đưa vào mã', primary: true, run: async () => {
              if (!chosen.size) { D.toast('Chưa chọn đơn giá nào', 'err'); return false; }
              let n = 0;
              for (const id of chosen) {
                try { await D.api('pricecodes.addLine', { priceCode: code.price_code, fromPriceId: id, record: { effectiveFrom: date.value } }); n++; }
                catch { /* ignore individual error */ }
              }
              if (n) D.toast(`Đã đưa ${n} dòng vào mã (NHÁP)`, 'ok');
              if (onSaved) await onSaved();
              else await again();
              return true;
            } }
          ]
        });
      };
      D.pickExisting = pickExisting;

      // ── Gán mã cho hợp đồng ──
      const assign = async (code) => {
        const cons = (await D.api('contracts.list')).items.filter((c) => !code.unit_code || c.customer_unit_code === code.unit_code || c.carrier_unit_code === code.unit_code);
        if (!cons.length) { D.toast(`Chưa có hợp đồng nào phù hợp`, 'err'); return; }
        const s = h('select', { 'aria-label': 'Hợp đồng' }, cons.map((c) => h('option', { value: c.contract_id }, `${c.contract_code} — ${c.carrier_unit_code} → ${c.customer_unit_code}${c.price_code ? ` (đang dùng mã ${c.price_code})` : ''}`)));
        D.modal({
          title: `Gán mã ${code.price_code} cho hợp đồng`,
          body: h('div', {}, h('p', { class: 'small' }, 'Từ nay các kỳ tính của hợp đồng dùng dòng giá của mã này (theo tuyến và ngày hiệu lực); tuyến mã chưa có dòng giá vẫn dùng giá cũ.'), h('label', { class: 'field' }, h('span', {}, 'Hợp đồng'), s)),
          actions: [
            { label: 'Hủy', run: () => true },
            { label: 'Gán mã', primary: true, run: async () => {
              const c = cons.find((x) => x.contract_id === s.value);
              if (c.price_code && c.price_code !== code.price_code && !(await D.confirm({ title: 'Đổi mã đơn giá của hợp đồng', message: `Hợp đồng ${c.contract_code} đang dùng mã ${c.price_code}. Đổi sang ${code.price_code}?` }))) return false;
              await D.api('contracts.save', { record: { contractId: c.contract_id, priceCode: code.price_code }, rowVersion: c.row_version });
              await D.refreshBoot();
              D.toast(`Đã gán mã ${code.price_code} cho hợp đồng ${c.contract_code}`, 'ok');
              await again();
              return true;
            } }
          ]
        });
      };
      const unassign = async (code, c) => {
        if (!(await D.confirm({ title: 'Bỏ mã khỏi hợp đồng', message: `Hợp đồng ${c.contractCode} quay về giá chung / giá riêng hợp đồng như trước khi gán mã.` }))) return;
        const cur = (await D.api('contracts.list')).items.find((x) => x.contract_id === c.contractId);
        await D.api('contracts.save', { record: { contractId: c.contractId, priceCode: '' }, rowVersion: cur.row_version });
        await D.refreshBoot();
        D.toast('Đã bỏ mã khỏi hợp đồng', 'ok');
        await again();
      };

      // ── Bảng Detail: Danh sách đơn giá theo tuyến của Phương thức đang chọn ──
      async function loadDetail() {
        const tok = guard.next();
        if (!sel) {
          detail.replaceChildren(h('div', { class: 'card' }, h('h2', {}, 'Chọn một phương thức / mã đơn giá'), h('p', { class: 'muted' }, 'Bấm vào một dòng bên trái để xem các đơn giá theo tuyến tương ứng.')));
          return;
        }
        let d;
        try { d = await D.api('pricecodes.get', { priceCode: sel }); }
        catch { sel = ''; return loadDetail(); }
        if (!guard.ok(tok)) return;

        const c = d.record; const closed = c.status !== 'ACTIVE'; const mixed = c.priceMethod === 'HON_HOP'; const noEdit = closed || mixed;

        const head = h('div', { class: 'card' },
          h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'center' } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h('h2', { style: { margin: 0 } }, `${c.price_code} · ${c.price_name}`),
              c.priceMethod === 'CO_DINH' ? D.tag('info', 'Đơn giá cố định') : c.priceMethod === 'HON_HOP' ? D.tag('warn', 'Hỗn hợp') : D.tag('mute', 'Đơn giá điều chỉnh dầu'),
              closed ? D.tag('CLOSED', 'Đã đóng') : D.tag('ACTIVE', 'Đang dùng')
            ),
            w ? h('div', { class: 'btns', style: { margin: 0 } },
              h('button', { class: 'btn primary', disabled: noEdit, title: mixed ? c.methodWarning : '', onclick: () => lineForm(c) }, c.priceMethod === 'CO_DINH' ? 'Thêm dòng giá cố định' : 'Thêm dòng giá điều chỉnh dầu'),
              h('button', { class: 'btn', disabled: noEdit, title: mixed ? c.methodWarning : '', onclick: () => pickExisting(c) }, 'Chọn đơn giá có sẵn…'),
              h('button', { class: 'btn', disabled: closed, onclick: () => assign(c) }, 'Gán cho hợp đồng…'),
              h('button', { class: 'btn', onclick: () => codeForm(c.priceMethod, c) }, 'Sửa mã'),
              h('button', { class: 'btn', onclick: async () => {
                if (!closed && !(await D.confirm({ title: 'Đóng mã đơn giá', message: `Mã ${c.price_code} không thêm dòng giá / không gán hợp đồng mới nữa.` }))) return;
                await D.api('pricecodes.setActive', { priceCode: c.price_code, active: closed, rowVersion: c.row_version });
                await again();
              } }, closed ? 'Mở lại mã' : 'Đóng mã')
            ) : null
          ),
          h('p', { class: 'small muted', style: { margin: '8px 0 0' } },
            `${METHOD_LABEL[c.priceMethod] || c.priceMethodLabel} · ${D.vn(c.lineCount)} đơn giá tuyến (${D.vn(c.activeLines)} đang áp dụng, ${D.vn(c.draftLines)} nháp)${c.note ? ` — Ghi chú: ${c.note}` : ''}`
          ),
          mixed ? h('p', { class: 'warn-line', role: 'alert' }, '⚠ ' + c.methodWarning) : null,
          c.contracts && c.contracts.length ? h('div', { class: 'small', style: { margin: '6px 0 0' } },
            'Hợp đồng đang dùng mã: ',
            c.contracts.map((x) => h('span', { class: 'tag info', style: { marginRight: '6px' } },
              x.contractCode,
              w ? h('button', { class: 'btn small', 'aria-label': `Bỏ mã khỏi hợp đồng ${x.contractCode}`, title: 'Bỏ mã khỏi hợp đồng', style: { marginLeft: '6px', minHeight: '20px', padding: '0 6px' }, onclick: () => unassign(c, x) }, '✕') : null
            ))
          ) : null
        );

        const childTableBox = h('div', { style: { overflowX: 'auto' } });
        const lines = d.lines || [];
        childTableBox.replaceChildren(D.table({
          rows: lines,
          empty: `Phương thức ${c.price_name} chưa có đơn giá theo tuyến — bấm "${c.priceMethod === 'CO_DINH' ? 'Thêm dòng giá cố định' : 'Thêm dòng giá điều chỉnh dầu'}" để tạo đơn giá chọn mã tuyến`,
          columns: [
            { key: 'route_code', label: 'Tuyến', render: (r) => h('b', { class: 'mono' }, r.route_code) },
            { key: 'routeName', label: 'Tên tuyến', wrap: true },
            { key: 'km', label: 'Cự ly (km)', num: true, render: (r) => { const t = routeOf(r.route_code); return t ? D.vnAuto(t.trip_distance_km) : ''; } },
            ...(c.priceMethod === 'CO_DINH' || lines.some((r) => lineMethod(r) === 'CO_DINH') ? [
              { key: 'fixed_price', label: 'Đơn giá cố định', num: true, render: (r) => (lineMethod(r) === 'CO_DINH' ? D.vnAuto(r.fixed_price) : '—') }
            ] : []),
            ...(c.priceMethod === 'THEO_DAU' || lines.some((r) => lineMethod(r) === 'THEO_DAU') ? [
              { key: 'new_price', label: 'ĐG ký HĐ dự kiến', num: true, render: (r) => (lineMethod(r) === 'THEO_DAU' ? D.vnAuto(r.new_price) : '—') },
              { key: 'fuel_price_excl_vat', label: 'ĐG dầu', num: true, render: (r) => (lineMethod(r) === 'THEO_DAU' ? D.vnAuto(r.fuel_price_excl_vat) : '—') },
              { key: 'fuel_norm_l_per_km', label: 'ĐM (l/km)', num: true, render: (r) => (lineMethod(r) === 'THEO_DAU' ? D.vnAuto(r.fuel_norm_l_per_km) : '—') },
              { key: 'avg_load_ton', label: 'KL_TB', num: true, render: (r) => (lineMethod(r) === 'THEO_DAU' ? D.vnAuto(r.avg_load_ton) : '—') },
              { key: 'contractPrice', label: 'ĐG tính ra', num: true, render: (r) => (lineMethod(r) === 'THEO_DAU' && r.contractPrice != null ? h('span', { class: 'money' }, D.vn(r.contractPrice)) : '—') }
            ] : []),
            { key: 'uom', label: 'ĐVT', render: (r) => (r.uom === 'M3' ? 'đ/m³' : 'đ/tấn') },
            { key: 'effective_from', label: 'Ngày hiệu lực', fmt: 'date' },
            { key: 'status', label: 'Trạng thái', fmt: 'tag' },
            { key: 'x', label: '', render: (r) => (w && r.status === 'DRAFT' ? h('span', { class: 'btns' },
              h('button', { class: 'btn small', disabled: mixed, title: mixed ? c.methodWarning : '', onclick: () => lineForm(c, r) }, 'Sửa'),
              h('button', { class: 'btn small primary', disabled: mixed, title: mixed ? c.methodWarning : '', onclick: async () => {
                const x = await D.api('prices.activate', { priceId: r.price_id, rowVersion: r.row_version });
                for (const m of x.warnings || []) D.toast(m.message, 'info', 9000);
                D.toast(`Đã áp dụng ${r.price_id}`, 'ok');
                await again();
              } }, 'Áp dụng')
            ) : '') }
          ]
        }));

        const table = h('div', { class: 'card' },
          h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } },
            h('h2', { style: { margin: 0 } }, `Danh sách đơn giá theo tuyến (1 Mã đơn giá có nhiều đơn giá — 1 Đơn giá có 1 Tuyến)`),
            w ? h('button', { class: 'btn small primary', onclick: () => lineForm(c) }, c.priceMethod === 'CO_DINH' ? '+ Tạo đơn giá cố định' : '+ Tạo đơn giá điều chỉnh dầu') : null
          ),
          childTableBox
        );
        detail.replaceChildren(head, table);
      }

      // ── Bảng Master: Danh mục Phương thức đơn giá / Mã đơn giá ──
      async function loadTree() {
        const d = await D.api('pricecodes.list');
        tree.replaceChildren();

        // Tự động chọn mã đầu tiên nếu chưa chọn
        if (!sel && d.items && d.items.length) {
          sel = d.items[0].price_code;
        }

        const renderCodeItem = (c) => h('button', {
          class: 'pc-code',
          'aria-current': String(c.price_code === sel),
          style: {
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '9px 12px',
            marginBottom: '4px',
            borderRadius: '8px'
          },
          onclick: async () => { sel = c.price_code; await loadTree(); await loadDetail(); }
        },
          h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'center' } },
            h('b', { class: 'mono' }, c.price_code),
            c.priceMethod === 'CO_DINH' ? D.tag('info', 'Cố định') : D.tag('mute', 'Theo dầu')
          ),
          h('div', { class: 'small', style: { fontWeight: c.price_code === sel ? '600' : 'normal', marginTop: '2px' } }, c.price_name),
          h('div', { class: 'small muted', style: { marginTop: '2px' } }, `${D.vn(c.lineCount)} đơn giá tuyến · ${D.vn(c.activeLines)} đang dùng`)
        );

        // Hiển thị theo 2 nhóm phương thức chuẩn (Cố định & Điều chỉnh dầu)
        const groups = (d.methods || []).map((g) => h('div', { class: 'pc-unit' },
          h('div', { class: 'row pc-unit-h', style: { justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' } },
            h('h3', { style: { margin: 0, fontSize: '14px' } }, g.label),
            w && g.method !== 'HON_HOP' ? h('button', {
              class: 'btn small',
              title: `Tạo mã ${g.label.toLowerCase()}`,
              onclick: () => codeForm(g.method)
            }, `+ Mã ${g.label.toLowerCase()}`) : null
          ),
          g.codes && g.codes.length ? g.codes.map(renderCodeItem) : h('p', { class: 'small muted', style: { margin: '4px 0 8px' } }, 'Chưa có mã.')
        ));

        tree.append(
          h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
            h('h2', { style: { margin: 0, fontSize: '16px' } }, 'Mã đơn giá (1 HĐ có 1 Mã)'),
            w ? h('button', { class: 'btn small primary', onclick: () => codeForm('CO_DINH') }, '+ Tạo mã') : null
          ),
          d.total ? null : h('p', { class: 'small muted' }, 'Chưa có mã đơn giá nào. Chọn phương thức đơn giá bên dưới và bấm "+ Mã …".'),
          ...groups
        );
      }

      const page = D.page(
        'DM Đơn giá',
        '5 · Quy tắc 3 cấp: 1 Hợp đồng có 1 Mã đơn giá → 1 Mã đơn giá có nhiều Đơn giá → 1 Đơn giá có 1 Tuyến',
        [],
        D.priceScreenNote('pricecodes'),
        h('p', { class: 'small muted', style: { margin: '0 0 10px' } }, 'Cấu trúc 3 cấp chuẩn: 1 Hợp đồng có 1 Mã đơn giá · 1 Mã đơn giá có nhiều Đơn giá · 1 Đơn giá áp dụng cho 1 Tuyến.'),
        h('div', { class: 'pc-layout' }, tree, detail)
      );

      await loadTree();
      await loadDetail();
      return page;
    },
  };
})();
