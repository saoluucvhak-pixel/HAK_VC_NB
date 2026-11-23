'use strict';
/**
 * DM Đơn giá — Mô hình CHA–CON đơn giản:
 * - Cha: Mã đơn giá CHÍNH LÀ Phương thức tính giá. Chỉ có sẵn 2 dòng: PT-CD (Đơn giá cố định), PT-TD (Đơn giá điều chỉnh theo giá dầu).
 *   Không tạo/sửa/đóng mã ở đây (mã tự tạo ở bản cũ nếu còn thì vẫn liệt kê để dữ liệu không mất).
 * - Con: MỘT bảng "Đơn giá theo tuyến" của phương thức đang chọn (mỗi đơn giá 1 tuyến). Gán mã cho hợp đồng làm ở màn Hợp đồng.
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

      // ── Con: Thêm / sửa đơn giá theo tuyến (Thiết lập công thức tính giá ký hợp đồng) ──
      const lineForm = (code, line, onSaved) => {
        const method = line ? lineMethod(line) : code.priceMethod;
        const all = Object.fromEntries(D.priceFormFields().map((f) => [f.key, f]));
        const date = { ...all.effectiveFrom, label: 'Ngày cập nhật (hiệu lực từ ngày)', hint: 'bản mới nhất không sau ngày tính có hiệu lực; bản cũ tự đóng' };
        const kmField = { key: 'distanceKm', label: 'Cự ly chuyến (km) — lấy từ Danh mục tuyến', readonly: true, hint: 'chỉ hiển thị; sửa ở Danh mục tuyến' };
        // Thứ tự: đầu vào công thức → ĐG dự kiến (tự tính, chỉ đọc) → ĐG tham khảo (nhập tay) → so sánh → ĐG ký HĐ (nhập tay, mặc định = ĐG dự kiến)
        let contractTouched = line ? Boolean(line.isManualContractPrice || (line.contract_price && line.contract_price !== line.formulaContractPrice)) : false;
        let estimate = null;

        const priceFields = method === 'CO_DINH'
          ? [{ ...all.fixedPrice, required: true, hint: 'dùng nguyên số này làm đơn giá vận chuyển — không tính dầu, không làm tròn lại' }]
          : [
            { ...all.newPrice, label: 'Đơn giá cước dự kiến (chưa VAT)', hint: 'đầu vào của công thức; gồm dầu định mức' },
            { ...all.fuelPriceExclVat },
            { ...all.fuelNormLPerKm },
            { ...all.avgLoadTon },
            { ...all.avgVolumeM3 },
            { key: 'estimatePrice', label: 'Đơn giá dự kiến ký hợp đồng (tự tính)', readonly: true, money: true, hint: 'tự tính khi nhập, đã làm tròn theo công thức — không nhập tay' },
            { ...all.basePriceExclVat, label: 'Đơn giá tham khảo (chưa VAT) — nhập tay', hint: 'chỉ để so sánh với ĐG dự kiến, không dùng để tính' },
            { ...all.basePriceSource, label: 'Nguồn đơn giá tham khảo', hint: 'bắt buộc khi có đơn giá tham khảo' },
            { ...all.contractPrice, label: 'Đơn giá ký hợp đồng (nhập tay)', hint: 'ban đầu bằng ĐG dự kiến; sửa tay nếu chốt giá khác' }
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

        // Mẫu công thức tính chuẩn (Tương tự HAK_LUONG_OFFLINE formula-master/ctWizardPanel)
        const formulaBanner = h('div', { class: 'hint', style: { margin: '0 0 10px', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--card)' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' } },
            h('b', {}, method === 'CO_DINH' ? 'Mẫu công thức: Đơn giá cố định' : 'CÔNG THỨC 1: TÍNH ĐƠN GIÁ DỰ KIẾN KÝ HỢP ĐỒNG'),
            h('span', { class: 'tag ' + (method === 'CO_DINH' ? 'info' : 'warn') }, method === 'CO_DINH' ? 'CỐ ĐỊNH' : 'ĐIỀU CHỈNH DẦU')
          ),
          h('div', { style: { fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--brand)', margin: '4px 0', wordBreak: 'break-all' } },
            method === 'CO_DINH'
              ? 'ĐG ký HĐ = DG_CO_DINH (đ/tấn trọn gói, không bù trừ dầu)'
              : 'ĐG dự kiến (tham khảo) = ROUND( ((DG_CUOC × KL_TB) − (CU_LY × DINH_MUC × DG_DAU)) / KL_TB, −3 )'
          ),
          h('div', { class: 'small muted', style: { marginTop: '4px' } },
            method === 'CO_DINH'
              ? 'Biến: DG_CO_DINH (đơn giá cố định đ/tấn áp dụng cho tuyến).'
              : 'Chuỗi liên hoàn 2 công thức: (1) Tính Đơn giá dự kiến tham khảo → Chốt ĐG ký HĐ (tự tính hoặc điền tay). (2) Khi thực hiện kỳ: ĐG VC thực hiện = ĐG ký HĐ (từ CT1) + ĐG CL Diesel (từ CT2 bù trừ dầu).'
          )
        );

        const routeRef = h('div', { class: 'small muted', style: { margin: '0 0 8px', padding: '8px 10px', background: 'var(--row-alt)', borderRadius: '8px', border: '1px solid var(--line)' } });
        const drawRouteRef = (rc) => {
          const r = routeOf(rc);
          routeRef.textContent = r
            ? `Tham chiếu Tuyến (${r.route_code}): ${r.route_name} · ${r.from_place || '—'} → ${r.to_place || '—'} · Cự ly 1 chiều: ${D.vnAuto(r.distance_km)} km · Cự ly chuyến: ${D.vnAuto(r.trip_distance_km)} km · ĐVT: ${r.uom === 'M3' ? 'M³' : 'Tấn'}`
            : 'Chọn tuyến từ Danh mục tuyến để lấy cự ly và ĐVT.';
        };
        drawRouteRef(first);
        const initCp = line ? (line.contract_price || line.contractPrice || '') : '';
        const f = D.form(fields, line ? { distanceKm: km(line.route_code), fixedPrice: line.fixed_price, newPrice: line.new_price, fuelPriceExclVat: line.fuel_price_excl_vat, fuelNormLPerKm: line.fuel_norm_l_per_km, avgLoadTon: line.avg_load_ton, avgVolumeM3: line.avg_volume_m3, contractPrice: initCp, basePriceExclVat: line.base_price_excl_vat, basePriceSource: line.base_price_source, effectiveFrom: line.effective_from, sourceNote: line.source_note } : { distanceKm: km(first), effectiveFrom: D.today() });
        if (f.inputs.routeCode) f.inputs.routeCode.addEventListener('change', () => { const rc = f.inputs.routeCode.value; f.inputs.distanceKm.value = km(rc); drawRouteRef(rc); });
        const warn = h('div', { class: 'small', role: 'status', 'aria-live': 'polite', style: { marginTop: '8px' } });
        const cmp = h('div', { class: 'slip', role: 'status', 'aria-live': 'polite', style: { padding: '8px 10px', margin: '0 0 10px', border: '1px solid var(--line)', borderRadius: '8px', background: 'var(--card)', display: 'none', gridColumn: '1 / -1' } });
        const resetBtn = h('button', { type: 'button', class: 'btn small', style: { display: 'none', marginTop: '4px' }, onclick: () => { contractTouched = false; syncContract(); resetBtn.style.display = 'none'; } }, 'Dùng lại ĐG dự kiến');
        const money = (k) => (f.inputs[k] ? D.parseMoney(f.inputs[k].value) : '');
        const syncContract = () => {
          if (method === 'CO_DINH' || !f.inputs.contractPrice) return;
          if (!contractTouched && estimate != null) f.inputs.contractPrice.value = D.vnAuto(estimate);
        };
        const drawCmp = () => {
          if (method === 'CO_DINH' || !f.inputs.basePriceExclVat) return;
          const ref = money('basePriceExclVat');
          if (!(ref > 0) || estimate == null) { cmp.style.display = 'none'; return; }
          const diff = estimate - ref; const pct = diff / ref * 100;
          const word = diff === 0 ? 'bằng' : diff > 0 ? 'cao hơn' : 'thấp hơn';
          cmp.style.display = 'block';
          cmp.replaceChildren(h('b', {}, 'So sánh: '), `ĐG dự kiến ký hợp đồng ${D.vn(estimate)} đ ${word} đơn giá tham khảo ${D.vn(ref)} đ`,
            ...(diff === 0 ? ['.'] : [': chênh ', h('b', { class: 'money' }, `${diff > 0 ? '+' : '−'}${D.vn(Math.abs(diff))} đ`), ` (${diff > 0 ? '+' : '−'}${D.vn(Math.abs(pct), 2)}% so với tham khảo).`]));
        };
        const check = async () => {
          const v = f.values(); const rc = line ? line.route_code : v.routeCode; const r = routeOf(rc); const msgs = [];
          if (r && !(r.trip_distance_km > 0)) msgs.push(`Cự ly chuyến của tuyến ${rc} chưa hợp lệ — sửa ở Danh mục tuyến trước khi áp dụng`);
          try {
            // ĐG dự kiến luôn tính từ công thức của engine (không gửi ĐG ký HĐ nhập tay, không gửi ĐG tham khảo)
            const { contractPrice, basePriceExclVat, basePriceSource, estimatePrice, ...rest } = v;
            const x = await D.api('prices.preview', { record: { ...rest, routeCode: rc, priceCode: code.price_code, priceMethod: method } }, { quiet: true });
            warn.className = 'small';
            if (method === 'CO_DINH') {
              warn.replaceChildren(...msgs.map((m) => h('div', { class: 'warn-line' }, '⚠ ' + m)), h('div', { class: 'muted', style: { marginTop: '4px' } }, 'Xem trước: đơn giá cố định = ', h('b', { class: 'money' }, D.vn(x.contractPrice)), ' đ (không tính dầu)'));
              return;
            }
            estimate = x.formulaContractPrice;
            f.inputs.estimatePrice.value = D.vnAuto(estimate);
            syncContract(); drawCmp();
            warn.replaceChildren(...msgs.map((m) => h('div', { class: 'warn-line' }, '⚠ ' + m)),
              h('div', { class: 'slip', style: { padding: '8px 10px', background: 'var(--card)', borderRadius: '6px', border: '1px solid var(--line)', margin: '6px 0' } },
                h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '4px 12px', fontSize: '12.5px' } },
                  h('div', {}, '1. Tiền cước chuyến: ', h('b', {}, D.vn(x.tripPrice)), ' đ'),
                  h('div', {}, '2. Lượng dầu/chuyến: ', h('b', {}, D.vn(x.fuelPerTrip, 1)), ' lít'),
                  h('div', {}, '3. Tiền dầu/chuyến: ', h('b', {}, D.vn(x.fuelCostPerTrip)), ' đ'),
                  h('div', {}, '4. Tỷ lệ tiền dầu: ', h('b', {}, D.vn(x.fuelCostRatio * 100, 2)), '%'),
                  h('div', {}, '5. ĐG chưa dầu: ', h('b', {}, D.vn(x.priceNoDiesel, 2)), ' đ/tấn'),
                  h('div', {}, '6. ĐG dự kiến ký hợp đồng (làm tròn): ', h('b', { class: 'money' }, D.vn(estimate)), ' đ/tấn')
                )
              ));
          } catch (e) {
            estimate = null; if (f.inputs.estimatePrice) f.inputs.estimatePrice.value = ''; drawCmp();
            const errs = (e.details && e.details.errors) || [e.message];
            warn.replaceChildren(...msgs.concat(errs).map((m) => h('div', { class: 'warn-line' }, '⚠ ' + m)));
          }
        };
        if (f.inputs.contractPrice) {
          f.inputs.contractPrice.addEventListener('input', () => { contractTouched = true; resetBtn.style.display = ''; });
          f.inputs.contractPrice.closest('label').append(resetBtn);
          if (contractTouched) resetBtn.style.display = '';
        }
        if (f.inputs.basePriceSource) f.inputs.basePriceSource.closest('label').after(cmp);
        f.addEventListener('input', () => { clearTimeout(f._t); f._t = setTimeout(check, 300); });
        f.addEventListener('change', () => { clearTimeout(f._t); f._t = setTimeout(check, 100); });
        setTimeout(check, 0);

        D.modal({
          title: line ? `Sửa công thức tính đơn giá ${line.price_id}` : `Thêm đơn giá ${method === 'CO_DINH' ? 'cố định' : 'điều chỉnh theo giá dầu'} — ${code.price_code}`,
          body: h('div', {}, formulaBanner, routeRef, f, warn),
          wide: true,
          actions: [
            { label: 'Hủy', run: () => true },
            { label: 'Lưu', primary: true, run: async () => {
              const { distanceKm, estimatePrice, ...v } = f.values();
              // ĐG ký HĐ trùng đúng ĐG dự kiến → để trống (engine tự tính theo công thức); khác → lưu số nhập tay
              if (method !== 'CO_DINH' && estimate != null && Number(v.contractPrice) === Number(estimate)) v.contractPrice = '';
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

      // ── Xem chi tiết công thức tính của 1 dòng giá đã tạo ──
      const viewFormula = (r) => {
        const isCd = lineMethod(r) === 'CO_DINH';
        const t = routeOf(r.route_code);
        const cp = isCd ? r.fixed_price : r.contractPrice;
        const isManual = r.isManualContractPrice || (r.contract_price && r.contract_price !== r.formulaContractPrice);
        D.modal({
          title: `Công thức tính đơn giá — Tuyến ${r.route_code} (${r.routeName || (t && t.route_name) || ''})`,
          body: h('div', {},
            h('div', { class: 'hint', style: { marginBottom: '12px', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--line)' } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
                h('b', {}, isCd ? 'Phương thức: Đơn giá cố định' : 'Phương thức: Đơn giá điều chỉnh dầu (Chuẩn HAK Group)'),
                h('span', { class: 'tag ' + (isCd ? 'info' : 'warn') }, isCd ? 'CỐ ĐỊNH' : 'ĐIỀU CHỈNH DẦU')
              ),
              h('div', { style: { fontFamily: 'var(--mono)', marginTop: '4px', color: 'var(--brand)' } },
                isCd
                  ? `ĐG ký HĐ = DG_CO_DINH (${r.uom === 'M3' ? 'đ/m³' : 'đ/tấn'} trọn gói, không tính dầu)`
                  : 'ĐG dự kiến (tham khảo) = ROUND( ((DG_CUOC × KL_TB) − (CU_LY × DINH_MUC × DG_DAU)) / KL_TB, −3 )'
              )
            ),
            isCd ? h('div', { class: 'card flush', style: { padding: '14px' } },
              h('p', {}, 'Đơn giá vận chuyển cố định: ', h('b', { class: 'money', style: { fontSize: '18px' } }, D.vn(cp)), ` ${r.uom === 'M3' ? 'đ/m³' : 'đ/tấn'}`),
              h('p', { class: 'small muted', style: { margin: 0 } }, r.uom === 'M3' ? 'Tuyến tính theo m³ (quy đổi từ Thể tích thùng trong Danh sách xe), hằng kỳ không giao nhận dầu và không tính chênh lệch dầu.' : 'Tuyến chạy theo đơn giá trọn gói, hằng kỳ không giao nhận dầu và không tính chênh lệch dầu.')
            ) : h('ol', { class: 'trace' },
              h('li', {}, h('b', {}, '(1) Đơn giá cước dự kiến (DG_CUOC)'), h('div', { class: 'v' }, `= ${D.vn(r.new_price)} ${r.uom === 'M3' ? 'đ/m³' : 'đ/tấn'}`)),
              h('li', {}, h('b', {}, `(2) ${r.uom === 'M3' ? 'Thể tích bình quân / chuyến' : 'Trọng tải bình quân / chuyến (KL_TB)'}`), h('div', { class: 'v' }, `= ${D.vn(r.uom === 'M3' ? (r.avg_volume_m3 || r.avg_load_ton) : r.avg_load_ton)} ${r.uom === 'M3' ? 'm³' : 'tấn'}`)),
              h('li', {}, h('b', {}, '(3) Cự ly chuyến khứ hồi (CU_LY)'), h('div', { class: 'v' }, `= ${t ? D.vnAuto(t.trip_distance_km) : '—'} km`)),
              h('li', {}, h('b', {}, '(4) Định mức tiêu hao dầu (DINH_MUC)'), h('div', { class: 'v' }, `= ${D.vn(r.fuel_norm_l_per_km, 1)} lít/km`)),
              h('li', {}, h('b', {}, '(5) Đơn giá dầu Diesel chưa VAT (DG_DAU)'), h('div', { class: 'v' }, `= ${D.vn(r.fuel_price_excl_vat)} đ/lít`)),
              h('li', {}, h('b', {}, '(6) Đơn giá dự kiến theo công thức làm tròn (tham khảo)'), h('div', { class: 'v' }, `= ${D.vn(r.formulaContractPrice || r.contractPrice)} ${r.uom === 'M3' ? 'đ/m³' : 'đ/tấn'}`)),
              h('li', {}, h('b', {}, '(7) ĐƠN GIÁ KÝ HỢP ĐỒNG CHỐT ÁP DỤNG'), h('div', { class: 'v' }, `= `, h('b', { class: 'money', style: { fontSize: '18px' } }, D.vn(cp)), ` ${r.uom === 'M3' ? 'đ/m³' : 'đ/tấn'}`, isManual ? ' (Điền thủ công)' : ' (Tự động theo công thức)'))
            )
          )
        });
      };
      D.viewFormula = viewFormula;

      // ── Con: chọn đơn giá CÓ SẴN đưa vào mã ──
      const pickExisting = async (code, onSaved) => {
        const d = await D.api('prices.list', { status: 'ACTIVE' });
        const dc = await D.api('prices.list', { status: 'ACTIVE', priceCode: code.priceMethod === 'CO_DINH' ? 'PT-CD' : 'PT-TD' });
        d.items = [...(d.items || []), ...(dc.items || []).filter((x) => x.price_code !== code.price_code && !(d.items || []).some((y) => y.price_id === x.price_id))];
        // 1.9.0: giá chung cũ đã nằm trong mã mặc định PT-TD/PT-CD → vẫn là "đơn giá có sẵn" để sao chép sang mã khác
        const rows = (d.items || []).filter((x) => (!x.price_code || ((x.price_code === 'PT-TD' || x.price_code === 'PT-CD') && !x.contract_id && x.price_code !== code.price_code)) && (x.price_method || 'THEO_DAU') === code.priceMethod);
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


      const STD = ['PT-CD', 'PT-TD'];
      const unitPrice = (r) => (lineMethod(r) === 'CO_DINH' ? r.fixed_price : r.contractPrice);

      // ── Con: MỘT bảng Đơn giá theo tuyến của phương thức đang chọn ──
      async function loadDetail() {
        const tok = guard.next();
        if (!sel) { detail.replaceChildren(h('div', { class: 'card' }, h('p', { class: 'muted', style: { margin: 0 } }, 'Chọn một phương thức bên trái để xem đơn giá theo tuyến.'))); return; }
        let d;
        try { d = await D.api('pricecodes.get', { priceCode: sel }); }
        catch { sel = ''; return loadDetail(); }
        if (!guard.ok(tok)) return;
        const c = d.record; const closed = c.status !== 'ACTIVE'; const mixed = c.priceMethod === 'HON_HOP'; const noEdit = closed || mixed;
        const lines = d.lines || [];
        const isCd = c.priceMethod === 'CO_DINH';
        const table = D.table({
          rows: lines,
          empty: `${c.price_name} chưa có đơn giá nào — bấm "Thêm đơn giá" để thêm theo tuyến.`,
          columns: [
            { key: 'route_code', label: 'Tuyến', render: (r) => h('b', { class: 'mono' }, r.route_code) },
            { key: 'routeName', label: 'Tên tuyến', wrap: true },
            { key: 'km', label: 'Cự ly chuyến', title: 'km, đi và về', num: true, render: (r) => { const t = routeOf(r.route_code); return t ? D.vnAuto(t.trip_distance_km) : ''; } },
            { key: 'price', label: isCd ? 'Đơn giá' : 'ĐG ký HĐ', num: true, render: (r) => {
              const v = unitPrice(r); if (v == null || v === '') return '—';
              const manual = lineMethod(r) !== 'CO_DINH' && (r.isManualContractPrice || (r.contract_price && r.contract_price !== r.formulaContractPrice));
              return h('span', {}, h('span', { class: 'money' }, D.vn(v)), manual ? h('span', { class: 'tag warn', style: { display: 'block', width: 'fit-content', marginLeft: 'auto', fontSize: '10px' } }, 'Thủ công') : null);
            } },
            { key: 'uom', label: 'ĐVT', render: (r) => (r.uom === 'M3' ? 'đ/m³' : 'đ/tấn') },
            { key: 'effective_from', label: 'Ngày hiệu lực', fmt: 'date' },
            { key: 'status', label: 'Trạng thái', fmt: 'tag' },
            { key: 'x', label: 'Thao tác', render: (r) => h('span', { class: 'btns' },
              h('button', { class: 'btn small', title: 'Xem chi tiết cách tính', onclick: () => viewFormula(r) }, 'Xem'),
              w && r.status === 'DRAFT' ? [
                h('button', { class: 'btn small', disabled: mixed, title: mixed ? c.methodWarning : '', onclick: () => lineForm(c, r) }, 'Sửa'),
                h('button', { class: 'btn small primary', disabled: mixed, title: mixed ? c.methodWarning : '', onclick: async () => {
                  const x = await D.api('prices.activate', { priceId: r.price_id, rowVersion: r.row_version });
                  for (const m of x.warnings || []) D.toast(m.message, 'info', 9000);
                  D.toast(`Đã áp dụng ${r.price_id}`, 'ok');
                  await again();
                } }, 'Áp dụng')
              ] : null
            ) }
          ]
        });
        detail.replaceChildren(h('div', { class: 'card' },
          h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' } },
            h('h2', { style: { margin: 0 } }, 'Đơn giá theo tuyến'),
            w ? h('button', { class: 'btn small primary', disabled: noEdit, title: mixed ? c.methodWarning : '', onclick: () => lineForm(c) }, 'Thêm đơn giá') : null
          ),
          h('p', { class: 'small muted', style: { margin: '0 0 8px' } }, `${c.price_code} · ${c.price_name} — ${D.vn(c.lineCount)} đơn giá (${D.vn(c.activeLines)} đang áp dụng, ${D.vn(c.draftLines)} nháp). Mỗi đơn giá áp dụng cho 1 tuyến.${c.note ? ` Ghi chú: ${c.note}` : ''}`),
          mixed ? h('p', { class: 'warn-line', role: 'alert' }, '⚠ ' + c.methodWarning) : null,
          h('div', { style: { overflowX: 'auto' } }, table)
        ));
      }

      // ── Cha: 2 phương thức có sẵn (+ mã cũ nếu còn) ──
      async function loadTree() {
        const d = await D.api('pricecodes.list');
        const items = [...(d.items || [])].sort((a, b) => (STD.indexOf(a.price_code) < 0 ? 9 : STD.indexOf(a.price_code)) - (STD.indexOf(b.price_code) < 0 ? 9 : STD.indexOf(b.price_code)) || a.price_code.localeCompare(b.price_code, 'vi', { numeric: true }));
        if (!sel && items.length) sel = (items.find((x) => x.price_code === 'PT-TD') || items[0]).price_code;
        const legacy = items.filter((x) => !STD.includes(x.price_code));
        tree.replaceChildren(
          h('h2', { style: { margin: '0 0 10px', fontSize: '16px' } }, 'Phương thức tính giá'),
          ...items.map((c) => h('button', { class: 'pc-code', 'aria-current': String(c.price_code === sel), onclick: async () => { sel = c.price_code; await loadTree(); await loadDetail(); } },
            h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'center' } }, h('b', { class: 'mono' }, c.price_code), c.priceMethod === 'CO_DINH' ? D.tag('info', 'Cố định') : c.priceMethod === 'HON_HOP' ? D.tag('warn', 'Hỗn hợp') : D.tag('mute', 'Theo dầu')),
            h('div', { class: 'small', style: { marginTop: '2px' } }, STD.includes(c.price_code) ? (c.priceMethod === 'CO_DINH' ? 'Đơn giá cố định' : 'Đơn giá điều chỉnh theo giá dầu') : c.price_name),
            h('div', { class: 'small muted', style: { marginTop: '2px' } }, `${D.vn(c.lineCount)} đơn giá · ${D.vn(c.activeLines)} đang dùng`)
          )),
          ...(legacy.length ? [h('p', { class: 'small muted', style: { margin: '8px 0 0' } }, `Có ${legacy.length} mã tự tạo ở bản cũ (${legacy.map((x) => x.price_code).join(', ')}) — vẫn xem và dùng được, không tạo thêm mã mới.`)] : [])
        );
      }

      const page = D.page(
        'DM Đơn giá',
        'Mã đơn giá chính là phương thức tính giá → mỗi phương thức có bảng đơn giá theo tuyến',
        [],
        D.priceScreenNote('pricecodes'),
        h('div', { class: 'pc-layout' }, tree, detail)
      );

      await loadTree();
      await loadDetail();
      return page;
    },
  };
})();
