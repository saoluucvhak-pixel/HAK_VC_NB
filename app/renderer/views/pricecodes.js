'use strict';
/**
 * Mã đơn giá — mô hình CHA–CON: Đơn vị → Mã đơn giá (cha) → Dòng giá theo tuyến (con).
 * Dòng giá = phiên bản giá như màn "Đơn giá" (NHÁP → Áp dụng), mặc định ĐƠN GIÁ CỐ ĐỊNH đ/tấn. Hợp đồng chọn mã ở màn Hợp đồng (hoặc nút "Gán cho hợp đồng…" ở đây).
 * Không chọn mã → giá chung / giá riêng hợp đồng chạy nguyên như cũ.
 */
(function () {
  const D = window.DGVC; const { h } = D;
  const METHOD_LABEL = { CO_DINH: 'Đơn giá cố định', THEO_DAU: 'Đơn giá theo giá dầu' };
  const METHOD = (r) => (r.price_method === 'CO_DINH' ? D.tag('info', 'Cố định') : h('span', { class: 'small muted' }, 'Theo giá dầu'));
  const routeOf = (code) => D.state.boot.routes.find((r) => r.route_code === code);

  D.views.pricecodes = {
    async render(p) {
      const w = D.writer(); let sel = p.code || ''; const guard = D.latest();
      const tree = h('aside', { class: 'card pc-tree', 'aria-label': 'Đơn vị và mã đơn giá' }); const detail = h('section', { class: 'pc-detail', 'aria-live': 'polite' });
      const again = async (code) => { if (code !== undefined) sel = code; await loadTree(); await loadDetail(); };

      // ── Cha: tạo / sửa mã. Hình thức giá = 2 thẻ radio (Tab/mũi tên/Enter); khóa khi mã đã có dòng giá hoặc hợp đồng ──
      const METHOD_HINT = { CO_DINH: 'Mỗi tuyến một đơn giá đ/tấn, dùng nguyên số — không tính dầu.', THEO_DAU: 'Đơn giá ký hợp đồng + chênh lệch dầu thực nhận (cách tính hiện có).' };
      const methodCards = (value, locked) => {
        const name = `pc-method-${Math.random().toString(36).slice(2, 7)}`;
        const cards = Object.entries(METHOD_LABEL).map(([m, label]) => h('label', { class: 'pc-card' }, h('input', { type: 'radio', name, value: m, checked: m === value, disabled: locked }), h('b', {}, label), h('span', { class: 'small muted' }, METHOD_HINT[m])));
        const group = h('div', { class: 'pc-cards', role: 'radiogroup', 'aria-label': 'Hình thức giá' }, cards);
        group.value = () => (group.querySelector('input:checked') || {}).value || value;
        return group;
      };
      const codeForm = (method, rec) => {
        const locked = !!rec && (rec.lineCount > 0 || rec.contracts.length > 0);
        const cards = methodCards(rec ? rec.priceMethod : method, locked);
        const fields = [{ key: 'priceCode', label: 'Mã đơn giá', required: true, readonly: !!rec, hint: rec ? 'không đổi được' : 'vd DG-DH-2026 (chữ HOA, số, . _ -)' },
          { key: 'unitCode', label: 'Đơn vị', type: 'select', options: D.unitOptions().filter(([c]) => c !== D.state.boot.install.unitCode || c === (rec && rec.unit_code)), required: true, hint: 'công ty đối tác áp dụng mã giá' },
          { key: 'priceName', label: 'Tên mã đơn giá', required: true, full: true }, { key: 'note', label: 'Ghi chú', full: true }];
        const f = D.form(fields, rec ? { priceCode: rec.price_code, unitCode: rec.unit_code, priceName: rec.price_name, note: rec.note } : {});
        D.modal({ title: rec ? `Sửa mã ${rec.price_code}` : 'Tạo mã đơn giá', body: h('div', {}, h('p', { class: 'small muted', style: { margin: '0 0 6px' } }, locked ? 'Hình thức giá không đổi được khi mã đã có dòng giá hoặc đã gán hợp đồng.' : 'Chọn hình thức giá:'), cards, f),
          actions: [{ label: 'Hủy', run: () => true }, { label: 'Lưu', primary: true, run: async () => {
            const v = { ...f.values(), priceMethod: cards.value() }; const miss = fields.filter((x) => x.required && (v[x.key] === '' || v[x.key] === null)).map((x) => x.label);
            if (miss.length) { D.toast(`Chưa nhập: ${miss.join(', ')}`, 'err'); return false; }
            const r = await D.api('pricecodes.save', rec ? { record: v, rowVersion: rec.row_version } : { create: true, record: v });
            for (const x of r.warnings || []) D.toast(x.message, 'info', 9000);
            D.toast(rec ? 'Đã lưu mã đơn giá' : `Đã tạo mã ${v.priceCode} — thêm dòng giá để áp dụng`, 'ok'); await again(v.priceCode.trim().toUpperCase()); return true;
          } }] });
      };

      // ── Con: thêm / sửa dòng giá (theo hình thức của mã). Cự ly chỉ hiển thị — lưu một chỗ ở Danh mục tuyến ──
      const lineForm = (code, line) => {
        const method = code.priceMethod; const all = Object.fromEntries(D.priceFormFields().map((f) => [f.key, f]));
        const date = { ...all.effectiveFrom, label: 'Ngày cập nhật (hiệu lực từ ngày)', hint: 'bản mới nhất không sau ngày tính có hiệu lực; bản cũ tự đóng. Không điền lùi vào khoảng đã có kỳ tính' };
        const kmField = { key: 'distanceKm', label: 'Cự ly chuyến (km) — lấy từ Danh mục tuyến', readonly: true, hint: 'chỉ hiển thị; sửa ở Danh mục tuyến' };
        const priceFields = method === 'CO_DINH'
          ? [{ ...all.fixedPrice, required: true, hint: 'dùng nguyên số này làm đơn giá vận chuyển — không tính dầu, không làm tròn lại' }]
          : [{ ...all.newPrice, label: 'Đơn giá ký hợp đồng / tấn (chưa VAT)', hint: 'gồm dầu theo định mức' }, { ...all.fuelPriceExclVat }, { ...all.fuelNormLPerKm }, { ...all.avgLoadTon }, { ...all.avgVolumeM3 }];
        const fields = [...(line ? [] : [{ key: 'routeCode', label: 'Tuyến', type: 'select', options: D.routeOptions(false), required: true }]), kmField, ...priceFields, date, { ...all.sourceNote }];
        const km = (rc) => { const r = routeOf(rc); return r ? D.vnAuto(r.trip_distance_km) : ''; };
        const first = line ? line.route_code : (D.routeOptions(false)[0] || [''])[0];
        const f = D.form(fields, line ? { distanceKm: km(line.route_code), fixedPrice: line.fixed_price, newPrice: line.new_price, fuelPriceExclVat: line.fuel_price_excl_vat, fuelNormLPerKm: line.fuel_norm_l_per_km, avgLoadTon: line.avg_load_ton, avgVolumeM3: line.avg_volume_m3, effectiveFrom: line.effective_from, sourceNote: line.source_note } : { distanceKm: km(first), effectiveFrom: D.today() });
        if (f.inputs.routeCode) f.inputs.routeCode.addEventListener('change', () => { f.inputs.distanceKm.value = km(f.inputs.routeCode.value); });
        // cảnh báo sớm (trước khi lưu): thiếu định mức / giá dầu, tuyến M3 + giá cố định, cự ly tuyến không hợp lệ — dùng prices.preview, không lưu gì
        const warn = h('div', { class: 'small', role: 'status', 'aria-live': 'polite', style: { marginTop: '8px' } });
        const check = async () => {
          const v = f.values(); const rc = line ? line.route_code : v.routeCode; const r = routeOf(rc); const msgs = [];
          if (r && !(r.trip_distance_km > 0)) msgs.push(`Cự ly chuyến của tuyến ${rc} chưa hợp lệ — sửa ở Danh mục tuyến trước khi áp dụng`);
          try { const x = await D.api('prices.preview', { record: { ...v, routeCode: rc, priceCode: code.price_code, priceMethod: method } }, { quiet: true });
            warn.className = 'small'; warn.replaceChildren(...msgs.map((m) => h('div', { class: 'warn-line' }, '⚠ ' + m)), h('div', { class: 'muted' }, `Xem trước: ${method === 'CO_DINH' ? 'đơn giá cố định' : 'ĐG ký HĐ tính ra'} = `, h('b', { class: 'money' }, D.vn(x.contractPrice)), ' đ/tấn'));
          } catch (e) { const errs = (e.details && e.details.errors) || [e.message]; warn.replaceChildren(...msgs.concat(errs).map((m) => h('div', { class: 'warn-line' }, '⚠ ' + m))); }
        };
        f.addEventListener('input', () => { clearTimeout(f._t); f._t = setTimeout(check, 300); }); f.addEventListener('change', () => { clearTimeout(f._t); f._t = setTimeout(check, 100); });
        D.modal({ title: line ? `Sửa dòng giá nháp ${line.price_id}` : `Thêm dòng giá ${method === 'CO_DINH' ? 'cố định' : 'theo giá dầu'} vào mã ${code.price_code}`, body: h('div', {}, f, warn), wide: method !== 'CO_DINH',
          actions: [{ label: 'Hủy', run: () => true }, { label: 'Lưu', primary: true, run: async () => {
            const { distanceKm, ...v } = f.values(); const miss = fields.filter((x) => x.required && x.key !== 'distanceKm' && (v[x.key] === '' || v[x.key] === null)).map((x) => x.label);
            if (miss.length) { D.toast(`Chưa nhập: ${miss.join(', ')}`, 'err'); return false; }
            if (line) await D.api('prices.updateDraft', { priceId: line.price_id, rowVersion: line.row_version, record: { ...v, priceMethod: method } });
            else await D.api('pricecodes.addLine', { priceCode: code.price_code, record: { ...v, priceMethod: method } });
            D.toast(line ? 'Đã lưu dòng giá nháp' : 'Đã thêm dòng giá (NHÁP) — bấm "Áp dụng" để dùng', 'ok'); await again(); return true;
          } }] });
      };

      // ── Con: chọn đơn giá CÓ SẴN đưa vào mã ──
      const pickExisting = async (code) => {
        const d = await D.api('prices.list', { status: 'ACTIVE' }); const rows = d.items.filter((x) => !x.price_code && (x.price_method || 'THEO_DAU') === code.priceMethod);
        const chosen = new Set(); const date = h('input', { type: 'date', value: D.today(), 'aria-label': 'Hiệu lực từ ngày' });
        const table = D.table({ rows, empty: `Chưa có ${METHOD_LABEL[code.priceMethod].toLowerCase()} đang dùng để chọn`, maxHeight: '50vh', columns: [
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
          h('p', { class: 'small' }, `${METHOD_LABEL[c.priceMethod]} · Đơn vị: ${c.unit_code} · ${c.unitName} — ${D.vn(c.lineCount)} dòng giá (${D.vn(c.activeLines)} đang áp dụng, ${D.vn(c.draftLines)} nháp)`), c.note ? h('p', { class: 'small muted' }, c.note) : null,
          h('div', { class: 'small', style: { margin: '6px 0' } }, 'Hợp đồng đang dùng mã: ', c.contracts.length ? c.contracts.map((x) => h('span', { class: 'tag info', style: { marginRight: '6px' } }, x.contractCode, w ? h('button', { class: 'btn small', 'aria-label': `Bỏ mã khỏi hợp đồng ${x.contractCode}`, title: 'Bỏ mã khỏi hợp đồng', style: { marginLeft: '6px', minHeight: '20px', padding: '0 6px' }, onclick: () => unassign(c, x) }, '✕') : null)) : h('span', { class: 'muted' }, 'chưa có')),
          w ? h('div', { class: 'btns' },
            h('button', { class: 'btn primary', disabled: closed, onclick: () => lineForm(c) }, c.priceMethod === 'CO_DINH' ? 'Thêm dòng giá cố định' : 'Thêm dòng giá theo giá dầu'),
            h('button', { class: 'btn', disabled: closed, onclick: () => pickExisting(c) }, 'Chọn đơn giá có sẵn…'),
            h('button', { class: 'btn', disabled: closed, onclick: () => assign(c) }, 'Gán cho hợp đồng…'),
            h('button', { class: 'btn', onclick: () => codeForm(c.priceMethod, c) }, 'Sửa mã'),
            h('button', { class: 'btn', onclick: async () => { if (!closed && !(await D.confirm({ title: 'Đóng mã đơn giá', message: `Mã ${c.price_code} không thêm dòng giá / không gán hợp đồng mới nữa. Hợp đồng đang dùng mã vẫn tính bình thường.` }))) return; await D.api('pricecodes.setActive', { priceCode: c.price_code, active: closed, rowVersion: c.row_version }); await again(); } }, closed ? 'Mở lại mã' : 'Đóng mã')) : null);
        const table = h('div', { class: 'card flush', style: { overflowX: 'auto' } }, D.table({ rows: d.lines, empty: 'Mã chưa có dòng giá — bấm "Thêm dòng giá …" hoặc "Chọn đơn giá có sẵn…"', columns: [
          { key: 'route_code', label: 'Tuyến' }, { key: 'routeName', label: 'Tên tuyến', wrap: true }, { key: 'km', label: 'Cự ly (km)', num: true, render: (r) => { const t = routeOf(r.route_code); return t ? D.vnAuto(t.trip_distance_km) : ''; } },
          ...(c.priceMethod === 'CO_DINH' ? [{ key: 'fixed_price', label: 'Đơn giá cố định', num: true, render: (r) => D.vnAuto(r.fixed_price) }]
            : [{ key: 'new_price', label: 'ĐG ký HĐ', num: true, render: (r) => D.vnAuto(r.new_price) }, { key: 'fuel_price_excl_vat', label: 'ĐG dầu', num: true, render: (r) => D.vnAuto(r.fuel_price_excl_vat) },
              { key: 'fuel_norm_l_per_km', label: 'ĐM (l/km)', num: true, render: (r) => D.vnAuto(r.fuel_norm_l_per_km) }, { key: 'avg_load_ton', label: 'KL_TB', num: true, render: (r) => D.vnAuto(r.avg_load_ton) }]),
          { key: 'uom', label: 'ĐVT', render: (r) => (r.uom === 'M3' ? 'đ/m³' : 'đ/tấn') },
          { key: 'effective_from', label: 'Ngày cập nhật', fmt: 'date' }, { key: 'effective_to', label: 'Đến ngày', fmt: 'date' }, { key: 'status', label: 'Trạng thái', fmt: 'tag' },
          { key: 'x', label: '', render: (r) => (w && r.status === 'DRAFT' ? h('span', { class: 'btns' },
            h('button', { class: 'btn small', onclick: () => lineForm(c, r) }, 'Sửa'),
            h('button', { class: 'btn small primary', onclick: async () => { const x = await D.api('prices.activate', { priceId: r.price_id, rowVersion: r.row_version }); for (const m of x.warnings || []) D.toast(m.message, 'info', 9000); D.toast(`Đã áp dụng ${r.price_id}${x.closed.length ? ` · đóng ${x.closed.length} dòng cũ cùng mã` : ''}`, 'ok'); await again(); } }, 'Áp dụng')) : '') }] }));
        detail.replaceChildren(head, table);
      }

      async function loadTree() {
        const d = await D.api('pricecodes.list'); tree.replaceChildren();
        const group = (g) => h('div', { class: 'pc-unit' }, h('div', { class: 'row pc-unit-h' }, h('h3', { class: 'grow', style: { margin: 0, fontSize: '15px' } }, g.label),
            w ? h('button', { class: 'btn small', title: `Tạo mã ${g.label.toLowerCase()}`, onclick: () => codeForm(g.method) }, `+ Mã ${g.label.charAt(0).toLowerCase()}${g.label.slice(1)}`) : null),
          g.codes.length ? g.codes.map((c) => h('button', { class: 'pc-code', 'aria-current': String(c.price_code === sel), onclick: async () => { sel = c.price_code; await loadTree(); await loadDetail(); } },
            h('span', { class: 'mono' }, c.price_code), h('span', { class: 'small muted' }, ` ${c.price_name} · ${c.unit_code}`), c.status !== 'ACTIVE' ? h('span', { class: 'tag mute', style: { marginLeft: '6px' } }, 'đóng') : null)) : h('p', { class: 'small muted', style: { margin: '4px 0 10px' } }, 'Chưa có mã.'));
        tree.append(h('h2', {}, 'Hình thức giá → Mã đơn giá'), d.total ? null : h('p', { class: 'small muted' }, 'Chưa có mã đơn giá nào. Chọn hình thức giá bên dưới và bấm "+ Mã …".'), d.methods.map(group));
              }

      const page = D.page('Mã đơn giá', '5 · Hình thức giá → Mã đơn giá → Dòng giá theo tuyến', [], h('p', { class: 'small muted', style: { margin: '0 0 10px' } }, 'Ba tầng: Hình thức giá (cố định / theo giá dầu) → Mã đơn giá (của một công ty đối tác) → Dòng giá theo tuyến. Hợp đồng gán mã sẽ dùng dòng giá của mã (theo tuyến và ngày); hợp đồng không gán mã chạy như cũ.'), h('div', { class: 'pc-layout' }, tree, detail));
      await loadTree(); await loadDetail();
      return page;
    },
  };
})();
