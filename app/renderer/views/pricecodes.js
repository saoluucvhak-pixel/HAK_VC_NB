'use strict';
/**
 * Danh mục › Đơn giá (màn chính–phụ). Danh mục phẳng `prices.catalog`: mỗi dòng = một đơn giá của một tuyến, kèm Hình thức giá.
 * - Chính: thêm đơn giá (chọn Hình thức giá từ danh mục → mở form cố định / theo giá dầu như trước), sửa nháp, áp dụng, xem công thức. Dòng đã áp dụng / đã dùng không sửa tại chỗ — thêm bản mới (ngày cập nhật = ngày hiệu lực).
 * - Phụ (bấm một dòng): "Hình thức giá của đơn giá này" — CHỈ XEM; thêm / sửa / xóa hình thức ở Danh mục › Hình thức giá.
 * Mã PT-CD / PT-TD (hai mã hình thức mặc định ở phía máy chủ) vẫn là cửa ghi dòng giá — giao diện chỉ đổi lối vào, không đổi logic tính giá.
 */
(function () {
  const D = window.DGVC; const { h } = D;
  const lineMethod = (r) => (r.price_method === 'CO_DINH' ? 'CO_DINH' : 'THEO_DAU');
  const METHOD_LABEL = { CO_DINH: 'Đơn giá cố định', THEO_DAU: 'Đơn giá điều chỉnh theo giá dầu' };
  const CODE_OF = { CO_DINH: 'PT-CD', THEO_DAU: 'PT-TD' };
  const STATUS_OPTS = [{ value: 'DRAFT', label: 'Nháp' }, { value: 'ACTIVE', label: 'Đang dùng' }, { value: 'CLOSED', label: 'Đã đóng' }];
  const routeOf = (code) => (D.state.boot.routes || []).find((r) => r.route_code === code);
  const uomText = (u) => (u === 'M3' ? 'đ/m³' : 'đ/tấn');
  const range = (from, to) => `${D.dmy(from)} → ${to ? D.dmy(to) : 'đang hiệu lực'}`;
  /** Cột Hiệu lực của dòng đơn giá: ngày bắt đầu chính là cột Ngày cập nhật nên chỉ ghi ngày kết thúc. */
  const until = (r) => (r.status === 'DRAFT' ? 'chưa áp dụng' : r.effectiveTo ? `đến ${D.dmy(r.effectiveTo)}` : 'đang hiệu lực');

  D.views.pricecodes = {
    async render(p) {
      p = p || {};
      const w = D.writer(); const guard = D.latest();
      let rows = []; let forms = []; let raw = new Map(); let sel = p.priceId || '';
      const startMethod = p.methodCode || (p.code === 'PT-CD' ? 'CO_DINH' : p.code === 'PT-TD' ? 'THEO_DAU' : '');
      let sfState = D.sf.normalize({ one: startMethod ? { method: startMethod } : {} });
      let sfInfo = { kept: 0, total: 0 }; let sfMount = null;
      const mainCard = h('section', { class: 'card flush xv-main xv-tbl pcl', 'aria-label': 'Danh mục đơn giá' });
      const side = h('aside', { class: 'card xv-side', 'aria-label': 'Hình thức giá của đơn giá này (chỉ xem)', 'aria-live': 'polite' });
      const filterCard = h('div', { class: 'card' });
      const again = async () => { await load(); };

      // ── Con: Thêm / sửa đơn giá theo tuyến (Thiết lập công thức tính giá ký hợp đồng) ──
      const lineForm = (code, line, onSaved) => {
        const method = line ? lineMethod(line) : code.priceMethod;
        const all = Object.fromEntries(D.priceFormFields().map((f) => [f.key, f]));
        const date = { ...all.effectiveFrom, label: 'Ngày cập nhật (hiệu lực từ ngày)', hint: 'bản mới nhất không sau ngày tính có hiệu lực; bản cũ tự đóng' };
        const kmField = { key: 'distanceKm', label: method === 'CO_DINH' ? 'Cự ly chuyến (km) — lấy từ Danh mục tuyến' : '(3) CU_LY — Cự ly chuyến khứ hồi (km), lấy từ Danh mục tuyến', readonly: true, hint: 'chỉ hiển thị; sửa ở Danh mục tuyến' };
        // Thứ tự: đầu vào công thức → ĐG dự kiến (tự tính, chỉ đọc) → ĐG tham khảo (nhập tay) → so sánh → ĐG ký HĐ (nhập tay, mặc định = ĐG dự kiến)
        let contractTouched = line ? Boolean(line.isManualContractPrice || (line.contract_price && line.contract_price !== line.formulaContractPrice)) : false;
        let estimate = null;

        const priceFields = method === 'CO_DINH'
          ? [{ ...all.fixedPrice, required: true, hint: 'dùng nguyên số này làm đơn giá vận chuyển — không tính dầu, không làm tròn lại' }]
          : [
            { ...all.newPrice, label: '(1) DG_CUOC — Đơn giá cước dự kiến (chưa VAT)', hint: 'đầu vào của công thức; gồm dầu định mức' },
            { ...all.avgLoadTon, label: '(2) KL_TB — KL trung bình / chuyến (tấn)', hint: 'đầu vào của công thức; trên 100 tấn sẽ hỏi lại' },
            { ...all.avgVolumeM3, label: '(2) Thể tích TB / chuyến (m³) — chỉ tuyến tính theo m³', hint: 'tuyến tính theo m³ thì nhập số này thay cho KL_TB; trên 500 m³ sẽ hỏi lại' },
            kmField,
            { ...all.fuelNormLPerKm, label: '(4) DINH_MUC — Định mức dầu (lít/km)', hint: '0,4 lít/km = 40 lít/100 km; trên 10 lít/km sẽ hỏi lại' },
            { ...all.fuelPriceExclVat, label: '(5) DG_DAU — ĐG dầu chưa VAT (đ/lít)', hint: 'đầu vào của công thức' },
            { key: 'estimatePrice', label: '(6) Đơn giá dự kiến ký hợp đồng (tự tính theo công thức)', readonly: true, money: true, hint: 'tự tính khi nhập (1)–(5), đã làm tròn — không nhập tay' },
            { ...all.basePriceExclVat, label: 'Đơn giá tham khảo (chưa VAT) — nhập tay', hint: 'chỉ để so sánh với (1) DG_CUOC, không dùng để tính' },
            { ...all.basePriceSource, label: 'Nguồn đơn giá tham khảo', hint: 'bắt buộc khi có đơn giá tham khảo' },
            { ...all.contractPrice, label: '(7) Đơn giá ký hợp đồng (nhập tay)', hint: 'ban đầu bằng (6); sửa tay nếu chốt giá khác' }
          ];
        const routeUom = (rc) => ((routeOf(rc) || {}).uom === 'M3' ? 'M3' : 'TAN');
        const uomName = (u) => (u === 'M3' ? 'm³' : 'Tấn');
        const legacyLine = !!(line && !line.calc_basis); // dòng cũ chưa có ĐVT riêng: giữ trống khi lưu trừ khi người dùng chủ động chọn
        const uomField = { key: 'calcBasis', label: 'ĐVT tính giá', type: 'select', options: [...(legacyLine ? [['', 'Theo cách cũ (giữ nguyên)']] : []), ['TAN', 'Tấn'], ['M3', 'm³']], hint: 'Mặc định theo tuyến. Chọn khác nếu dòng đơn giá này tính theo đơn vị khác.' };
        const fields = [
          ...(line ? [] : [{ key: 'routeCode', label: 'Tuyến (từ Danh mục tuyến)', type: 'select', options: D.routeOptions(false), required: true }]),
          uomField,
          ...(method === 'CO_DINH' ? [kmField] : []),
          ...priceFields,
          date,
          { ...all.sourceNote }
        ];
        const km = (rc) => { const r = routeOf(rc); return r ? D.vnAuto(r.trip_distance_km) : ''; };
        const first = line ? line.route_code : (D.routeOptions(false)[0] || [''])[0];

        const fMono = h('div', { style: { fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--brand)', margin: '4px 0', wordBreak: 'break-all' } },
          method === 'CO_DINH' ? 'ĐG ký HĐ = DG_CO_DINH (đ/tấn trọn gói, không bù trừ dầu)' : '(6) ĐG dự kiến = ROUND( ( ((1) × (2)) − ((3) × (4) × (5)) ) / (2), −3 )');
        const fVar = h('span', {}, 'Biến: DG_CO_DINH (đơn giá cố định đ/tấn áp dụng cho tuyến).');
        // Mẫu công thức tính chuẩn (Tương tự HAK_LUONG_OFFLINE formula-master/ctWizardPanel)
        const formulaBanner = h('div', { class: 'hint', style: { margin: '0 0 10px', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--card)' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' } },
            h('b', {}, method === 'CO_DINH' ? 'Mẫu công thức: Đơn giá cố định' : 'CÔNG THỨC 1: TÍNH ĐƠN GIÁ DỰ KIẾN KÝ HỢP ĐỒNG'),
            h('span', { class: 'tag ' + (method === 'CO_DINH' ? 'info' : 'warn') }, method === 'CO_DINH' ? 'CỐ ĐỊNH' : 'ĐIỀU CHỈNH DẦU')
          ),
          fMono,
          method === 'CO_DINH' ? null : h('div', { class: 'small', style: { margin: '2px 0 4px' } }, '(1) DG_CUOC = đơn giá cước · (2) KL_TB = KL trung bình · (3) CU_LY = cự ly khứ hồi · (4) DINH_MUC = định mức dầu · (5) DG_DAU = giá dầu → ô nhập bên dưới đánh số tương ứng; (7) là đơn giá ký hợp đồng chốt.'),
          h('div', { class: 'small muted', style: { marginTop: '4px' } },
            method === 'CO_DINH'
              ? fVar
              : 'Chuỗi liên hoàn 2 công thức: (1) Tính Đơn giá dự kiến tham khảo → Chốt ĐG ký HĐ (tự tính hoặc điền tay). (2) Khi thực hiện kỳ: ĐG VC thực hiện = ĐG ký HĐ (từ CT1) + ĐG CL Diesel (từ CT2 bù trừ dầu).'
          )
        );

        const routeRef = h('div', { class: 'small muted', style: { margin: '0 0 8px', padding: '8px 10px', background: 'var(--row-alt)', borderRadius: '8px', border: '1px solid var(--line)' } });
        const drawRouteRef = (rc) => {
          const r = routeOf(rc);
          routeRef.textContent = r
            ? `Tham chiếu Tuyến (${r.route_code}): ${r.route_name} · ${r.from_place || '—'} → ${r.to_place || '—'} · Cự ly 1 chiều: ${D.vnAuto(r.distance_km)} km · Cự ly chuyến: ${D.vnAuto(r.trip_distance_km)} km`
            : 'Chọn tuyến từ Danh mục tuyến để lấy cự ly và ĐVT.';
        };
        drawRouteRef(first);
        const initCp = line ? (line.contract_price || line.contractPrice || '') : '';
        const f = D.form(fields, line ? { calcBasis: line.calc_basis || '', distanceKm: km(line.route_code), fixedPrice: line.fixed_price, newPrice: line.new_price, fuelPriceExclVat: line.fuel_price_excl_vat, fuelNormLPerKm: line.fuel_norm_l_per_km, avgLoadTon: line.avg_load_ton, avgVolumeM3: line.avg_volume_m3, contractPrice: initCp, basePriceExclVat: line.base_price_excl_vat, basePriceSource: line.base_price_source, effectiveFrom: line.effective_from, sourceNote: line.source_note } : { calcBasis: routeUom(first), distanceKm: km(first), effectiveFrom: D.today() });
        let uomTouched = !!line; // người dùng đã tự chọn ĐVT (hoặc đang sửa dòng có sẵn) → đổi tuyến không ghi đè
        const curRoute = () => (line ? line.route_code : (f.inputs.routeCode ? f.inputs.routeCode.value : first));
        const setLabel = (k, text, req) => { const sp = f.inputs[k] && f.inputs[k].closest('label').firstChild; if (sp) sp.textContent = text + (req ? ' *' : ''); };
        const setHint = (k, text) => { const hn = f.inputs[k] && f.inputs[k].closest('label').querySelector('.hint'); if (hn) hn.textContent = text; };
        // ĐVT đang có hiệu lực của dòng: ô chọn; dòng cũ để trống = cách cũ (cố định theo tuyến, theo giá dầu theo tấn)
        const effUom = () => (f.inputs.calcBasis.value || (method === 'CO_DINH' ? routeUom(curRoute()) : 'TAN'));
        const relabel = () => {
          const m = effUom() === 'M3'; const ul = m ? 'đ/m³' : 'đ/tấn';
          setHint('calcBasis', f.inputs.calcBasis.value === '' ? 'Dòng cũ: giữ nguyên cách tính hiện tại. Chọn Tấn hoặc m³ nếu muốn áp ĐVT riêng cho dòng này.' : `Mặc định theo tuyến (${uomName(routeUom(curRoute()))}). Chọn khác nếu dòng đơn giá này tính theo đơn vị khác.`);
          if (method === 'CO_DINH') {
            setLabel('fixedPrice', `Đơn giá cố định (chưa VAT) [${ul}]`, true);
            fMono.textContent = `ĐG ký HĐ = DG_CO_DINH (${ul} trọn gói, không bù trừ dầu)`; fVar.textContent = `Biến: DG_CO_DINH (đơn giá cố định ${ul} áp dụng cho tuyến).`;
            return;
          }
          setLabel('newPrice', `(1) DG_CUOC — Đơn giá cước dự kiến (chưa VAT) [${ul}]`, true);
          const needVol = f.inputs.calcBasis.value === 'M3' || (f.inputs.calcBasis.value === '' && routeUom(curRoute()) === 'M3'); // dòng cũ trên tuyến m³: Thể tích TB vẫn bắt buộc như trước
          setLabel('avgLoadTon', `(2) KL_TB — KL trung bình / chuyến (tấn)${f.inputs.calcBasis.value === 'M3' ? ' — không bắt buộc khi tính theo m³' : ''}`, f.inputs.calcBasis.value !== 'M3');
          setLabel('avgVolumeM3', needVol ? '(2) Thể tích TB / chuyến (m³)' : '(2) Thể tích TB / chuyến (m³) — chỉ tuyến tính theo m³', needVol);
          setHint('avgVolumeM3', `${m ? 'tính theo m³ thì nhập số này thay cho KL_TB' : 'tuyến tính theo m³ thì nhập số này thay cho KL_TB'}; trên 500 m³ sẽ hỏi lại`);
          fMono.textContent = m ? '(6) ĐG dự kiến = ROUND( ( ((1) × (2)) − ((3) × (4) × (5)) ) / (2), −3 ), (2) = Thể tích TB (m³)' : '(6) ĐG dự kiến = ROUND( ( ((1) × (2)) − ((3) × (4) × (5)) ) / (2), −3 )';
        };
        f.inputs.calcBasis.addEventListener('change', () => { uomTouched = true; relabel(); });
        if (f.inputs.routeCode) f.inputs.routeCode.addEventListener('change', () => { const rc = f.inputs.routeCode.value; f.inputs.distanceKm.value = km(rc); drawRouteRef(rc); if (!uomTouched) f.inputs.calcBasis.value = routeUom(rc); relabel(); });
        relabel();
        const warn = h('div', { class: 'small', role: 'status', 'aria-live': 'polite', style: { marginTop: '8px' } });
        const cmp = h('div', { class: 'slip', role: 'status', 'aria-live': 'polite', style: { padding: '8px 10px', margin: '0 0 10px', border: '1px solid var(--line)', borderRadius: '8px', background: 'var(--card)', display: 'none', gridColumn: '1 / -1' } });
        const resetBtn = h('button', { type: 'button', class: 'btn small', style: { display: 'none', marginTop: '4px' }, onclick: () => { contractTouched = false; syncContract(); resetBtn.style.display = 'none'; } }, 'Dùng lại ĐG dự kiến');
        const money = (k) => (f.inputs[k] ? D.parseVn(f.inputs[k].value, true) : '');
        const syncContract = () => {
          if (method === 'CO_DINH' || !f.inputs.contractPrice) return;
          if (!contractTouched && estimate != null) f.inputs.contractPrice.value = D.vnAuto(estimate);
        };
        const drawCmp = () => {
          if (method === 'CO_DINH' || !f.inputs.basePriceExclVat) return;
          const ref = money('basePriceExclVat');
          const cuoc = money('newPrice'); // đơn giá tham khảo so với (1) DG_CUOC (không phải với (6))
          if (!(ref > 0) || !(cuoc > 0)) { cmp.style.display = 'none'; return; }
          const diff = ref - cuoc; const pct = diff / cuoc * 100;
          const word = diff === 0 ? 'bằng' : diff > 0 ? 'cao hơn' : 'thấp hơn';
          cmp.style.display = 'block';
          cmp.replaceChildren(h('b', {}, 'So sánh: '), `đơn giá tham khảo ${D.vn(ref)} đ ${word} (1) DG_CUOC ${D.vn(cuoc)} đ`,
            ...(diff === 0 ? ['.'] : [': chênh ', h('b', { class: 'money' }, `${diff > 0 ? '+' : '−'}${D.vn(Math.abs(diff))} đ`), ` (${diff > 0 ? '+' : '−'}${D.vn(Math.abs(pct), 2)}%).`]));
        };
        const check = async () => {
          const v = f.values(); const rc = line ? line.route_code : v.routeCode; const r = routeOf(rc); const msgs = [];
          if (r && !(r.trip_distance_km > 0)) msgs.push(`Cự ly chuyến của tuyến ${rc} chưa hợp lệ — sửa ở Danh mục tuyến trước khi áp dụng`);
          try {
            // ĐG dự kiến luôn tính từ công thức của engine (không gửi ĐG ký HĐ nhập tay, không gửi ĐG tham khảo)
            const { contractPrice, basePriceExclVat, basePriceSource, estimatePrice, ...rest } = v;
            const x = await D.api('prices.preview', { record: { ...rest, routeCode: rc, priceCode: code.price_code, priceMethod: method, ...(legacyLine && rest.calcBasis === '' ? { legacyBasis: true } : {}) } }, { quiet: true });
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
                  h('div', {}, '5. ĐG chưa dầu: ', h('b', {}, D.vn(x.priceNoDiesel, 2)), effUom() === 'M3' ? ' đ/m³' : ' đ/tấn'),
                  h('div', {}, '6. ĐG dự kiến ký hợp đồng (làm tròn): ', h('b', { class: 'money' }, D.vn(estimate)), effUom() === 'M3' ? ' đ/m³' : ' đ/tấn')
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
        if (f.inputs.newPrice) f.inputs.newPrice.addEventListener('input', drawCmp);
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
              const m3 = v.calcBasis === 'M3'; const needVol = method !== 'CO_DINH' && (m3 || (v.calcBasis === '' && routeUom(curRoute()) === 'M3'));
              const need = (x) => (x.key === 'avgLoadTon' ? !m3 : x.key === 'avgVolumeM3' ? needVol : x.required);
              const miss = fields.filter((x) => need(x) && x.key !== 'distanceKm' && (v[x.key] === '' || v[x.key] === null)).map((x) => x.label);
              if (miss.length) { D.toast(`Chưa nhập: ${miss.join(', ')}`, 'err'); return false; }
              // số thập phân vượt ngưỡng hợp lý thường do gõ / dán nhầm dấu chấm-phẩy (vd 0.400 hiểu thành 400): hỏi lại trước khi lưu
              const odd = method === 'CO_DINH' ? [] : [['fuelNormLPerKm', 10, 'Định mức dầu', 'lít/km', 0.05], ['avgLoadTon', 100, 'KL_TB', 'tấn', 1], ['avgVolumeM3', 500, 'Thể tích TB', 'm³', 1]].filter(([k, max, , , min]) => Number(v[k]) > max || (Number(v[k]) > 0 && Number(v[k]) < min)).map(([k, max, name, u, min]) => `${name} = ${D.vnExact(v[k])} ${u} (${Number(v[k]) > max ? `lớn hơn ${max}` : `nhỏ hơn ${D.vnExact(min)}`})`);
              if (odd.length && !(await D.confirm({ title: 'Kiểm tra dấu chấm / phẩy', okLabel: 'Vẫn lưu', message: `${odd.join('\n')}\nKiểm tra dấu chấm/phẩy: dấu phẩy (,) là thập phân, dấu chấm (.) là ngăn cách nghìn — vd định mức 0,4 (không phải 0.400 hay 400). Vẫn lưu số này?` }))) return false;
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
                  : (r.calc_basis === 'M3' ? 'ĐG dự kiến (tham khảo) = ROUND( ((DG_CUOC × TT_TB) − (CU_LY × DINH_MUC × DG_DAU)) / TT_TB, −3 ), TT_TB = Thể tích TB (m³)' : 'ĐG dự kiến (tham khảo) = ROUND( ((DG_CUOC × KL_TB) − (CU_LY × DINH_MUC × DG_DAU)) / KL_TB, −3 )')
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

      // ── Chọn Hình thức giá từ danh mục rồi mở đúng form cố định / theo giá dầu ──
      const pickForm = () => {
        const act = forms.filter((f) => f.status === 'ACTIVE');
        if (!act.length) { D.toast('Danh mục Hình thức giá chưa có dòng đang hiệu lực — thêm ở Danh mục › Hình thức giá', 'err'); return; }
        const select = h('select', { 'aria-label': 'Hình thức giá' }, act.map((f) => h('option', { value: f.formId }, `${f.methodLabel} — ${f.formName} (từ ${D.dmy(f.catalogDate)})`)));
        const formula = h('div', { class: 'xv-formula xv-box', role: 'status', 'aria-live': 'polite' });
        const draw = () => { const f = act.find((x) => x.formId === select.value); formula.replaceChildren(h('b', {}, 'Công thức tính giá: '), f ? (f.formulaText || '—') : ''); };
        select.addEventListener('change', draw); draw();
        D.modal({
          title: 'Thêm đơn giá — chọn Hình thức giá',
          body: h('div', {},
            h('p', { class: 'small muted', style: { margin: '0 0 8px' } }, 'Hình thức giá lấy từ Danh mục › Hình thức giá. Chọn xong, nhập tuyến và số liệu ở bước tiếp theo.'),
            h('label', { class: 'field' }, h('span', {}, 'Hình thức giá *'), select), formula),
          actions: [{ label: 'Hủy', run: () => true }, { label: 'Tiếp tục', primary: true, run: () => {
            const f = act.find((x) => x.formId === select.value); if (!f) return false;
            setTimeout(() => lineForm({ price_code: CODE_OF[f.methodCode], priceMethod: f.methodCode }, null, again), 0);
            return true;
          } }]
        });
      };

      const legacyOf = (r) => raw.get(r.priceId) || ({ price_id: r.priceId, price_method: r.methodCode, route_code: r.routeCode, routeName: r.routeName, uom: r.uom, fixed_price: r.fixedPrice, contractPrice: r.contractPrice, new_price: r.newPrice,
        avg_load_ton: r.avgLoadTon, avg_volume_m3: r.avgVolumeM3, fuel_norm_l_per_km: r.fuelNormLPerKm, fuel_price_excl_vat: r.fuelPriceExclVat, row_version: r.rowVersion });
      const codeOf = (r) => ({ price_code: (raw.get(r.priceId) || {}).price_code || CODE_OF[r.methodCode], priceMethod: r.methodCode });
      const priceCell = (r) => {
        const v = r.price; const isCd = r.methodCode === 'CO_DINH';
        const rl = raw.get(r.priceId); const manual = !isCd && rl && (rl.isManualContractPrice || (rl.contract_price && rl.contract_price !== rl.formulaContractPrice));
        if (v == null) return '—';
        return h('span', {}, h('span', { class: 'money' }, D.vn(v)), h('div', { class: 'small muted' }, uomText(r.uom)),
          manual ? h('span', { class: 'tag warn', style: { display: 'block', width: 'fit-content', marginLeft: 'auto', fontSize: '10px' } }, 'Thủ công') : null);
      };

      // ── Ngăn phụ CHỈ XEM: Hình thức giá của đơn giá đang chọn ──
      const guide = () => h('div', { class: 'xv-guide', role: 'note' },
        h('b', {}, 'Chỉ để xem. '), 'Thêm / sửa / xóa hình thức ở ', h('b', {}, 'Danh mục › Hình thức giá'), '.',
        h('div', { style: { marginTop: '6px' } }, h('button', { class: 'btn small', onclick: () => D.go('forms', { formId: (rows.find((x) => x.priceId === sel) || {}).formId || '' }) }, 'Mở Hình thức giá')));
      const drawSide = () => {
        const r = rows.find((x) => x.priceId === sel);
        if (!r) { side.replaceChildren(h('h2', { class: 'xv-h' }, 'Hình thức giá của đơn giá này'), guide(), h('p', { class: 'muted', style: { margin: '10px 0 0' } }, 'Chọn một dòng ở bảng đơn giá để xem hình thức giá của nó.')); return; }
        const f = forms.find((x) => x.formId === r.formId);
        const kv = (k, v) => h('div', { class: 'xv-kv' }, h('div', { class: 'small muted' }, k), h('div', {}, v));
        side.replaceChildren(
          h('h2', { class: 'xv-h' }, 'Hình thức giá của đơn giá này'),
          h('p', { class: 'small', style: { margin: '0 0 8px' } }, `Đơn giá ${r.priceId} · tuyến ${r.routeCode}`),
          guide(),
          h('div', { style: { marginTop: '10px' } },
            kv('Mã hình thức', h('span', {}, h('b', {}, r.methodLabel), ' ', h('span', { class: 'mono small muted' }, r.methodCode))),
            kv('Tên hình thức', r.formName || '—'),
            kv('Ngày cập nhật', f ? D.dmy(f.catalogDate) : '—'),
            kv('Hiệu lực', f ? range(f.catalogDate, f.effectiveTo) : '—'),
            kv('Công thức tính giá', h('div', { class: 'xv-formula' }, r.formulaText || '—')),
            ...(() => { const x = raw.get(r.priceId); if (!x || r.methodCode === 'CO_DINH' || !(Number(x.base_price_excl_vat) > 0) || !(Number(x.new_price) > 0)) return [];
              const d = Number(x.base_price_excl_vat) - Number(x.new_price); const pc = d / Number(x.new_price) * 100; const sg = d > 0 ? '+' : d < 0 ? '−' : '';
              return [kv('Đơn giá tham khảo', `${D.vn(x.base_price_excl_vat)} đ`), kv('Chênh lệch (tham khảo − DG_CUOC)', `${sg}${D.vn(Math.abs(d))} đ (${sg}${D.vn(Math.abs(pc), 2)}%)`)]; })()));
      };

      const pick = (r) => { sel = r.priceId; drawMain(); drawSide(); D.revealSide(side); };

      function drawMain() {
        const res = D.sf.filterRows(rows, sfCfg, sfState);
        sfInfo = { kept: res.kept, total: res.total, unsupported: res.unsupported };
        const list = res.rows;
        const table = D.table({
          rows: list, empty: rows.length ? 'Không có đơn giá phù hợp bộ lọc' : 'Chưa có đơn giá nào — bấm "Thêm đơn giá"',
          columns: [
            { key: 'updateDate', label: 'Ngày cập nhật', render: (r) => h('span', { class: 'nw' }, D.dmy(r.updateDate)) },
            { key: 'priceId', label: 'Mã đơn giá', render: (r) => h('div', {}, h('b', { class: 'mono' }, r.priceId), r.contractId && !r.priceCode ? h('div', { class: 'small muted' }, 'giá riêng HĐ') : null) },
            { key: 'routeCode', label: 'Tuyến', render: (r) => h('div', {}, h('b', { class: 'mono' }, r.routeCode), h('div', { class: 'small muted' }, r.routeName)) },
            { key: 'method', label: 'Hình thức giá', render: (r) => (r.methodCode === 'CO_DINH' ? D.tag('info', 'Cố định') : D.tag('mute', 'Theo dầu')) },
            { key: 'km', label: 'Cự ly chuyến', title: 'km, đi và về', num: true, render: (r) => { const t = routeOf(r.routeCode); return t ? D.vnAuto(t.trip_distance_km) : ''; } },
            { key: 'price', label: 'ĐG ký HĐ', num: true, render: priceCell },
            { key: 'refPrice', label: 'Đơn giá tham khảo', num: true, render: (r) => { const x = raw.get(r.priceId); return x && r.methodCode !== 'CO_DINH' && Number(x.base_price_excl_vat) > 0 ? D.vn(x.base_price_excl_vat) : '—'; } },
            { key: 'refDiff', label: 'Chênh lệch (tham khảo − DG_CUOC)', num: true, render: (r) => {
              const x = raw.get(r.priceId); if (!x || r.methodCode === 'CO_DINH' || !(Number(x.base_price_excl_vat) > 0) || !(Number(x.new_price) > 0)) return '—';
              const d = Number(x.base_price_excl_vat) - Number(x.new_price); const pc = d / Number(x.new_price) * 100; const sg = d > 0 ? '+' : d < 0 ? '−' : '';
              return h('span', {}, h('div', {}, `${sg}${D.vn(Math.abs(d))} đ`), h('div', { class: 'small muted' }, `(${sg}${D.vn(Math.abs(pc), 2)}%)`)); } },
            { key: 'eff', label: 'Hiệu lực', render: (r) => until(r) },
            { key: 'status', label: 'Trạng thái', render: (r) => D.tag(r.status) },
            { key: 'x', label: 'Thao tác', render: (r) => { const rl = raw.get(r.priceId); return h('span', { class: 'btns' },
              h('button', { class: 'btn small', 'aria-label': `Xem công thức ${r.priceId}`, title: 'Xem chi tiết cách tính', onclick: () => viewFormula(legacyOf(r)) }, 'Xem'),
              w && rl && r.status === 'DRAFT' ? [
                h('button', { class: 'btn small', 'aria-label': `Sửa ${r.priceId}`, onclick: () => lineForm(codeOf(r), rl, again) }, 'Sửa'),
                h('button', { class: 'btn small primary', 'aria-label': `Áp dụng ${r.priceId}`, onclick: async () => {
                  const x = await D.api('prices.activate', { priceId: r.priceId, rowVersion: r.rowVersion });
                  for (const m of x.warnings || []) D.toast(m.message, 'info', 9000);
                  D.toast(`Đã áp dụng ${r.priceId}`, 'ok');
                  await again();
                } }, 'Áp dụng')
              ] : null,
              w && !r.contractId && !r.isUsed && (r.status === 'DRAFT' || r.status === 'ACTIVE')
                ? h('button', { class: 'btn small danger', 'aria-label': `Xóa ${r.priceId}`, title: 'Xóa đơn giá (nháp xóa hẳn; đã áp dụng nhưng chưa dùng thì đóng dòng)', onclick: async () => {
                  const ok = await D.confirm({ title: 'Xóa đơn giá', danger: true, message: r.status === 'DRAFT' ? `Xóa bản nháp ${r.priceId}?` : `Xóa đơn giá ${r.priceId} (tuyến ${r.routeCode})? Dòng sẽ không còn hiệu lực; bản trước (nếu có) được mở lại. Chỉ xóa được khi chưa dùng ở kỳ tính nào.` });
                  if (!ok) return;
                  const x = await D.api('prices.remove', { priceId: r.priceId });
                  for (const m of x.warnings || []) D.toast(m.message, 'info', 9000);
                  D.toast(`Đã xóa ${r.priceId}${(x.reopened || []).length ? ` — mở lại ${x.reopened.join(', ')}` : ''}`, 'ok');
                  await again();
                } }, 'Xóa') : null); } }
          ]
        });
        D.clickableRows(table, list, (r) => r.priceId, sel, pick);
        mainCard.replaceChildren(h('div', { class: 'xv-bar' }, h('span', { class: 'small muted grow' }, 'Bấm một dòng để xem hình thức giá của đơn giá đó (ngăn bên cạnh, chỉ xem). Dòng đã áp dụng hoặc đã dùng không sửa tại chỗ — thêm đơn giá mới (ngày cập nhật sau).')), table);
        if (sfMount) sfMount.refresh();
      }

      const sfCfg = {
        screenId: 'pricecodes', searchPlaceholder: 'Tìm không dấu: mã đơn giá, mã tuyến, tên tuyến…', qAttrs: { 'aria-label': 'Tìm đơn giá theo mã hoặc tuyến' },
        quickFields: ['q', 'method', 'route', 'status'], advancedFields: ['q', 'method', 'route', 'status'],
        fields: [
          { key: 'method', label: 'Hình thức giá', type: 'enum', options: () => (forms.length ? [...new Map(forms.map((f) => [f.methodCode, f.methodLabel]))] : Object.entries(METHOD_LABEL)).map(([value, label]) => ({ value, label })), match: (r, v) => r.methodCode === v },
          { key: 'route', label: 'Tuyến', type: 'enum', options: () => D.routeOptions(false).map(([value, label]) => ({ value, label })), match: (r, v) => r.routeCode === v },
          { key: 'status', label: 'Trạng thái', type: 'enum', options: STATUS_OPTS, match: (r, v) => r.status === v }
        ],
        matchQ: (r, q) => D.sf.hay([r.priceId, r.routeCode, r.routeName, r.methodLabel]).indexOf(q) >= 0,
        state: { get: () => sfState, set: (s) => { sfState = s; } },
        dataSource: () => sfInfo, onApply: () => drawMain(), onReset: () => drawMain(), scopeFallback: () => 'Tất cả đơn giá'
      };

      async function loadRaw() {
        const cl = await D.api('pricecodes.list', {}, { quiet: true }).catch(() => ({ items: [] }));
        const codes = (cl.items || []).filter((c) => c.price_code === 'PT-CD' || c.price_code === 'PT-TD' || c.lineCount > 0);
        const got = await Promise.all(codes.map((c) => D.api('pricecodes.get', { priceCode: c.price_code }, { quiet: true }).catch(() => ({ lines: [] }))));
        const m = new Map(); for (const g of got) for (const l of g.lines || []) m.set(l.price_id, l); return m;
      }
      async function load() {
        const tok = guard.next();
        const [cat, fl, rawMap] = await Promise.all([D.api('prices.catalog', {}), D.api('forms.list', { includeClosed: true }), loadRaw()]);
        if (!guard.ok(tok)) return;
        rows = cat.items || []; forms = fl.items || []; raw = rawMap;
        if (sel && !rows.some((x) => x.priceId === sel)) sel = '';
        drawMain(); drawSide();
      }

      sfMount = D.sf ? D.smartFilter.mount(sfCfg) : null;
      if (sfMount) filterCard.append(sfMount.el);
      const page = D.page('Đơn giá', 'Danh mục › Đơn giá — mã đơn giá theo tuyến và hình thức giá; thêm / sửa / áp dụng ở đây, hình thức giá xem ở ngăn bên cạnh',
        [w ? h('button', { class: 'btn primary', onclick: pickForm }, 'Thêm đơn giá') : null],
        D.priceScreenNote('pricecodes'), filterCard, h('div', { class: 'xv-layout' }, mainCard, side));
      await load();
      return page;
    },
  };
})();
