'use strict';
/* Tổng quan (4.1) · Tính giá vận chuyển (4.6) + Xem chi tiết tính (4.6b) */
(function () {
  const D = window.DGVC; const { h } = D;

  const kpi = (label, value, main) => h('div', { class: `kpi ${main ? 'main' : ''}` }, h('div', { class: 'l' }, label), h('div', { class: 'v' }, value));
  const weekAgo = () => { const d = new Date(Date.now() - 6 * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const toMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const parts = String(timeStr).split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  };

  // ───────── Tổng quan ─────────
  D.views.dashboard = {
    async render(p = {}) {
      const dateFrom = h('input', { type: 'date', value: p.dateFrom || '', 'aria-label': 'Từ ngày' });
      const dateTo = h('input', { type: 'date', value: p.dateTo || '', 'aria-label': 'Đến ngày' });
      const filterBar = h('div', { class: 'filters filters-inline' },
        h('label', { class: 'field' }, h('span', {}, 'Từ ngày'), dateFrom),
        h('label', { class: 'field' }, h('span', {}, 'đến ngày'), dateTo),
        h('button', { class: 'btn primary', onclick: () => load() }, 'Xem')
      );
      filterBar.values = () => ({ dateFrom: dateFrom.value, dateTo: dateTo.value });
      const out = h('div');
      const load = async () => {
        const v = filterBar.values(); const d = await D.api('dashboard.summary', v);
        out.innerHTML = '';
        out.append(h('div', { class: 'kpis' }, kpi('Tổng chuyến', D.vn(d.kpi.trips)), kpi('Tổng khối lượng (tấn)', D.vn(d.kpi.ton, 2)), kpi('Dầu thực nhận (lít)', D.vnAuto(d.kpi.actualFuel)),
          kpi('Dầu định mức (lít)', D.vnAuto(d.kpi.standardFuel)), kpi('Chênh lệch dầu (lít)', D.vnAuto(d.kpi.fuelDiff)), kpi('Đơn giá VC bình quân', D.vn(d.kpi.avgTransportPrice), true),
          kpi('Số tuyến', D.vn(d.kpi.routes)), kpi('Phiếu chưa tính / cảnh báo', `${D.vn(d.freeTickets)} / ${D.vn(d.flaggedTickets)}`)),
        h('div', { class: 'grid g2' },
          h('div', { class: 'card flush' }, h('div', { style: { padding: '14px 18px 0' } }, h('h2', {}, 'Hợp đồng và kỳ tính')),
            D.table({ columns: [{ key: 'contractCode', label: 'Hợp đồng' }, { key: 'role', label: 'Vai trò', fmt: 'tag' }, { key: 'x', label: 'Hai bên', render: (r) => `${r.carrier} → ${r.customer}` },
              { key: 'k', label: 'Kỳ gần nhất', render: (r) => (r.lastPeriod ? r.lastPeriod.periodCode : h('span', { class: 'muted' }, 'chưa có')) },
              { key: 's', label: 'Trạng thái', render: (r) => (r.lastPeriod ? h('span', {}, D.tag(r.lastPeriod.status), ' ', r.lastPeriod.origin === 'IMPORTED' ? D.tag('IMPORTED') : '') : '') },
              { key: 'p', label: 'Đơn giá', num: true, render: (r) => (r.lastPeriod ? r.lastPeriod.prices.map((x) => D.vn(x.transportPrice)).join(' · ') : '') }],
            rows: d.contracts, onRow: (r) => (r.lastPeriod ? D.go(r.role === 'CARRIER' ? 'calc' : 'bkvc', { periodId: r.lastPeriod.periodId }) : D.go('calc', { contractId: r.contractId })) })),
          h('div', { class: 'card' }, h('h2', {}, 'Việc cần làm'), d.todo.length ? h('ul', { class: 'issues' }, d.todo.map((t) => h('li', {},
            h('span', { class: `tag ${t.kind === 'SYNC_REMINDER' ? 'info' : 'warn'}` }, { PERIOD_DRAFT: 'Kỳ nháp', NEEDS_RECALC: 'Tính lại', SYNC_REMINDER: 'Danh mục', BACKUP_OLD: 'Sao lưu' }[t.kind] || t.kind),
            h('span', { style: { flex: 1 } }, t.message),
            h('button', { class: 'btn small', onclick: () => (t.kind === 'SYNC_REMINDER' ? D.go('sync') : t.kind === 'BACKUP_OLD' ? D.go('settings', { tab: 'backup' }) : D.go('calc', { periodId: t.periodId })) }, 'Mở')))) : h('p', { class: 'muted' }, 'Không có việc tồn đọng.'))));
      };
      const page = D.page('Tổng quan', 'Dashboard', [], h('div', { class: 'card', style: { padding: '12px 18px' } }, filterBar), out);
      await load();
      return page;
    },
  };

  // ───────── Tính giá vận chuyển ─────────
  D.views.calc = {
    async render(p) {
      const carrierOpts = D.contractOptions(true);
      let period = null; let periodEx = null;
      if (p.periodId) { const g0 = await D.api('periods.get', { periodId: p.periodId }); period = g0.period; periodEx = g0.exclusions || {}; }
      // thuế suất GTGT cho chọn theo từng kỳ (thay đổi theo thời điểm) — danh sách từ CONFIG VAT_RATE_OPTIONS
      const vatOpts = String((D.state.boot.config || {}).VAT_RATE_OPTIONS || '0;0.05;0.08;0.1').split(/[;,]/).map((x) => Number(String(x).trim())).filter((x) => Number.isFinite(x)).map((x) => (x > 1 ? x / 100 : x));
      const pct = (x) => `${D.vn(x * 100, Number.isInteger(Math.round(x * 10000) / 100) ? 0 : 1)}%`;
      const f = D.form([
        { key: 'contractId', label: 'Hợp đồng (bản cài là bên vận chuyển)', type: 'select', options: carrierOpts.length ? carrierOpts : [['', '— bản cài này không là bên vận chuyển của hợp đồng nào —']] },
        { key: 'dateFrom', label: 'Từ ngày', type: 'date', required: true }, { key: 'dateTo', label: 'Đến ngày', type: 'date', required: true },
        { key: 'routeCode', label: 'Mã tuyến', type: 'select', options: D.routeOptions() }, { key: 'reportDate', label: 'Ngày lập BKVC', type: 'date' },
        { key: 'vatRate', label: 'Thuế suất GTGT', type: 'select', options: [['', 'Theo ngày cuối kỳ (mặc định)'], ...vatOpts.map((x) => [String(x), pct(x)])] },
      ], period ? { contractId: period.contract_id, dateFrom: period.date_from, dateTo: period.date_to, routeCode: period.route_filter, reportDate: period.report_date,
        vatRate: periodEx && periodEx.vatRate !== undefined && periodEx.vatRate !== null ? String(periodEx.vatRate) : '' }
        : { contractId: p.contractId || (carrierOpts[0] || [''])[0], dateFrom: p.dateFrom || weekAgo(), dateTo: p.dateTo || D.today(), routeCode: p.routeCode || '', reportDate: D.today() });
      f.className = 'filters';
      const move = h('input', { type: 'checkbox', id: 'moveDraft' });
      // dòng dầu người dùng bỏ khỏi kỳ (vd nhập trùng) — lưu theo lần tính, tính lại vẫn giữ
      const excl = new Set();
      let exclDirty = false;
      // rà soát 1.8.2: "Bỏ khỏi kỳ" / "xác nhận dầu = 0" chỉ nằm trong bộ nhớ tới khi bấm TÍNH GIÁ → rời màn thì hỏi trước
      D.leaveGuard = () => (!exclDirty ? true : D.confirm({ title: 'Bỏ lựa chọn chưa tính?', danger: true, okLabel: 'Bỏ lựa chọn',
        message: 'Bạn đã bỏ dòng dầu khỏi kỳ / xác nhận dầu = 0 nhưng chưa bấm TÍNH GIÁ để lưu. Rời màn sẽ mất các lựa chọn này.' }).then((x) => !!x));
      if (period) for (const id of (periodEx || {}).excludeReceiptIds || []) excl.add(id);
      const ovr = new Map(); // tuyến → xác nhận tính với dầu = 0
      for (const o of (periodEx || {}).overrides || []) if (o.code === 'E_NO_FUEL') ovr.set(o.routeCode, o);
      const fuelActions = (i) => {
        if (!D.writer() || !i.ref || (period && (period.status !== 'NHAP' || period.origin !== 'LOCAL'))) return null;
        const again = async () => { exclDirty = true; await preview(); };
        if (i.code === 'W_FUEL_POSSIBLE_DUPLICATE') return [
          h('button', { class: 'btn small', onclick: async () => { excl.add(i.ref); await again(); } }, 'Bỏ khỏi kỳ'),
          h('button', { class: 'btn small', onclick: async () => { const r = await D.confirm({ title: 'Không trùng', message: `Xác nhận dòng dầu ${i.ref} KHÔNG phải nhập trùng — giữ trong kỳ, không cảnh báo nữa.`, reason: true }); if (r) { await D.api('fuel.ackFlags', { receiptIds: [i.ref], note: r }); await again(); } } }, 'Không trùng')];
        if (i.code === 'E_FIXED_PRICE_HAS_FUEL' && i.params && i.params.receiptIds) return [h('button', { class: 'btn small primary', onclick: async () => {
          if (!(await D.confirm({ title: 'Bỏ dầu khỏi kỳ', message: `Tuyến ${i.ref} dùng đơn giá cố định — bỏ ${i.params.receiptIds.length} dòng dầu (${D.vnAuto(i.params.liter)} lít) khỏi kỳ này? Dòng dầu vẫn còn trong bảng kê.` }))) return;
          for (const id of i.params.receiptIds) excl.add(id); await again(); } }, `Bỏ ${i.params.receiptIds.length} dòng dầu khỏi kỳ`)];
        if (i.code === 'I_FUEL_EXCLUDED') return [h('button', { class: 'btn small', onclick: async () => { excl.delete(i.ref); await again(); } }, 'Đưa lại vào kỳ')];
        // kỳ không nhận dầu: cho tính với dầu thực nhận = 0 (xe tự lo dầu) — phải có đơn giá dầu và lý do
        const noFuel = (cur) => D.formModal({ title: `Tính với dầu = 0 — tuyến ${i.ref}`, fields: [
          { key: 'fuelPrice', label: 'Đơn giá dầu thực tế (chưa VAT, đ/lít)', type: 'number', required: true, hint: cur ? '' : `Gợi ý theo ${(i.params && i.params.suggestSource) || 'ĐG dầu danh mục'}` },
          { key: 'reason', label: 'Lý do', required: true, full: true }],
        values: cur || { fuelPrice: (i.params && i.params.suggestFuelPrice) || '', reason: 'Kỳ này không nhận dầu từ bên giao — xe tự lo nhiên liệu' },
        submit: async (v) => { ovr.set(i.ref, { code: 'E_NO_FUEL', routeCode: i.ref, fuelPrice: Number(v.fuelPrice), reason: v.reason }); await again(); } });
        if (i.code === 'E_NO_FUEL' || i.code === 'E_NO_FUEL_PRICE') return [h('button', { class: 'btn small primary', onclick: () => noFuel(ovr.get(i.ref)) }, 'Tính với dầu = 0')];
        if (i.code === 'W_OVERRIDE_NO_FUEL') return [h('button', { class: 'btn small', onclick: () => noFuel(ovr.get(i.ref)) }, 'Sửa đơn giá dầu'),
          h('button', { class: 'btn small', onclick: async () => { ovr.delete(i.ref); await again(); } }, 'Bỏ')];
        return null;
      };
      const out = h('div');
      const LVORD = { ERROR: 0, WARNING: 1, INFO: 2 }; // lỗi lên đầu danh sách kiểm tra
      const show = (res, saved) => {
        out.innerHTML = '';
        const r0 = res.results || []; const sum = (k) => r0.reduce((a, r) => a + (r[k] || 0), 0);
        out.append(h('div', { class: 'kpis' }, kpi('Số chuyến', D.vn(sum('tripCount'))), kpi('Tổng khối lượng (tấn)', D.vn(sum('totalTon'), 2)), ...(r0.some((x) => x.totalM3 != null) ? [kpi('Tổng thể tích (m³)', D.vn(r0.reduce((a, x) => a + (x.totalM3 || 0), 0), 2))] : []), kpi('Dầu thực nhận (lít)', D.vnAuto(sum('actualFuelLiter'))),
          kpi('Dầu định mức / chênh lệch', `${D.vnAuto(sum('standardFuelLiter'))} / ${D.vnAuto(sum('fuelDiffLiter'))}`), kpi('Thuế suất GTGT', res.vatRate !== undefined && res.vatRate !== null ? pct(res.vatRate) : '—'), kpi('Đơn giá vận chuyển', r0.map((r) => D.vn(r.transportPrice)).join(' · ') || '—', true)));
        out.append(h('div', { class: 'card flush' }, D.table({ columns: [
          { key: 'routeCode', label: 'Mã tuyến' }, { key: 'routeName', label: 'Tuyến' }, { key: 'tripDistanceKm', label: 'Cự ly', fmt: 'int' }, { key: 'startDate', label: 'Ngày bắt đầu', fmt: 'date' },
          { key: 'endDate', label: 'Ngày kết thúc', fmt: 'date' }, { key: 'tripCount', label: 'Số chuyến', fmt: 'int' }, { key: 'totalTon', label: r0.length && r0.every((x) => x.totalM3 != null && x.uom === 'M3') ? 'Tổng m³' : r0.some((x) => x.totalM3 != null && x.uom === 'M3') ? 'Tổng tấn / m³' : 'Tổng tấn', num: true, render: (r) => (r.totalM3 != null && r.uom === 'M3' && (r.basisM3 || r.priceMethod === 'CO_DINH') ? `${D.vn(r.totalM3, 2)} m³` : D.vn(r.totalTon, 2)) },
          { key: 'actualFuelLiter', label: 'Dầu thực nhận', fmt: 'auto' }, { key: 'standardFuelLiter', label: 'Dầu định mức', fmt: 'auto' }, { key: 'fuelDiffLiter', label: 'CL dầu', fmt: 'dec2' },
          { key: 'fuelPrice', label: 'ĐG dầu', fmt: 'dec2' }, { key: 'contractPrice', label: 'ĐG ký HĐ / cố định', num: true, render: (r) => (r.priceMethod === 'CO_DINH' ? h('span', {}, D.vn(r.contractPrice), ' ', D.tag('info', 'cố định')) : D.vn(r.contractPrice)) }, { key: 'fuelAdjustPrice', label: 'ĐG CL Diesel', fmt: 'dec2' },
          { key: 'transportPrice', label: 'Đơn giá VC', num: true, render: (r) => h('button', { class: 'btn small', title: 'Xem chi tiết tính', onclick: (e) => { e.stopPropagation(); traceDrawer(r, saved); } }, h('span', { class: 'money' }, D.vn(r.transportPrice))) }],
        rows: r0, empty: 'Chưa có kết quả — kiểm tra lỗi bên dưới' })));
        const blocked = res.blocked || [];
        const dupeFuelIssues = (res.issues || []).filter((i) => i.code === 'W_FUEL_POSSIBLE_DUPLICATE' && i.ref);
        const bulkAckBanner = dupeFuelIssues.length >= 2 ? h('div', { class: 'bulk-ack-banner' },
          h('div', {},
            h('span', { class: 'bulk-ack-title' }, `⚠️ Có ${dupeFuelIssues.length} dòng dầu nghi trùng lặp trong kỳ`),
            h('div', { class: 'small muted' }, 'Nhiều xe nhận dầu nhiều lần trong ngày hoặc trùng bản kê.')
          ),
          h('div', { class: 'btns' },
            h('button', {
              class: 'btn small',
              title: 'Bỏ tất cả dòng dầu nghi trùng khỏi kỳ này (vẫn giữ trong bảng kê)',
              onclick: async () => {
                const ok = await D.confirm({
                  title: 'Bỏ tất cả dầu nghi trùng',
                  message: `Bỏ toàn bộ ${dupeFuelIssues.length} dòng dầu nghi trùng khỏi kỳ này? Các dòng dầu vẫn được lưu trong hệ thống nhưng không tính vào kỳ.`
                });
                if (!ok) return;
                for (const iss of dupeFuelIssues) excl.add(iss.ref);
                exclDirty = true;
                await preview();
              }
            }, `Bỏ tất cả (${dupeFuelIssues.length}) khỏi kỳ`),
            h('button', {
              class: 'btn small primary',
              title: 'Xác nhận toàn bộ không trùng (xe nhận dầu nhiều lần hợp lệ)',
              onclick: async () => {
                const note = await D.confirm({
                  title: 'Xác nhận tất cả không trùng',
                  message: `Xác nhận toàn bộ ${dupeFuelIssues.length} dòng dầu KHÔNG phải nhập trùng (xe thực nhận dầu nhiều lần trong ngày).`,
                  reason: true
                });
                if (!note) return;
                const receiptIds = dupeFuelIssues.map((iss) => iss.ref);
                await D.api('fuel.ackFlags', { receiptIds, note });
                exclDirty = true;
                await preview();
              }
            }, `Xác nhận tất cả (${dupeFuelIssues.length}) không trùng`)
          )
        ) : null;

        // Phân tích bất thường tiêu hao dầu và chuyến đi (Radar Intelligence)
        const anomalies = [];
        const tickets = res.tickets || [];
        const receipts = res.receipts || [];
        const bkvc = res.bkvc || [];

        // 1. Phân tích tiêu hao dầu theo xe
        if (receipts.length && bkvc.length) {
          const fuelByPlate = new Map();
          for (const rec of receipts) {
            const pl = rec.plate_no || rec.fuel_vehicle_code;
            if (!pl) continue;
            fuelByPlate.set(pl, (fuelByPlate.get(pl) || 0) + (rec.qty_liter || 0));
          }
          for (const line of bkvc) {
            const actualFuel = fuelByPlate.get(line.plateNo) || 0;
            const resRoute = (res.results || []).find((r) => r.routeCode === line.routeCode);
            if (resRoute && resRoute.fuelNormLPerKm && resRoute.tripDistanceKm) {
              const stdFuel = line.tripCount * resRoute.tripDistanceKm * resRoute.fuelNormLPerKm;
              if (stdFuel > 0 && actualFuel > 0) {
                const diff = actualFuel - stdFuel;
                const ratio = diff / stdFuel;
                if (ratio > 0.25 && diff > 50) {
                  anomalies.push({
                    type: 'danger',
                    badge: 'ĂN DẦU BẤT THƯỜNG',
                    text: `Xe ${line.plateNo} (tuyến ${line.routeCode}): nhận ${D.vnAuto(actualFuel)} lít dầu, vượt định mức +${Math.round(ratio * 100)}% (+${D.vnAuto(diff)} lít) cho ${line.tripCount} chuyến. Cần rà soát rò rỉ / thất thoát.`
                  });
                }
              }
            }
          }
        }

        // 2. Phân tích chuyến đi quay vòng phi lý (thời gian quá ngắn)
        if (tickets.length >= 2) {
          const ticketsByPlate = new Map();
          for (const t of tickets) {
            if (!t.plate_no || !t.weigh1_date) continue;
            if (!ticketsByPlate.has(t.plate_no)) ticketsByPlate.set(t.plate_no, []);
            ticketsByPlate.get(t.plate_no).push(t);
          }
          for (const [plateNo, tList] of ticketsByPlate.entries()) {
            tList.sort((a, b) => `${a.weigh1_date} ${a.weigh1_time || ''}`.localeCompare(`${b.weigh1_date} ${b.weigh1_time || ''}`));
            for (let i = 0; i < tList.length - 1; i++) {
              const t1 = tList[i];
              const t2 = tList[i + 1];
              if (t1.weigh1_date === t2.weigh1_date && t1.weigh1_time && t2.weigh1_time) {
                const m1 = toMinutes(t1.weigh1_time);
                const m2 = toMinutes(t2.weigh1_time);
                const diffMin = m2 - m1;
                const resRoute = (res.results || []).find((r) => r.routeCode === t1.route_code);
                const km = resRoute?.tripDistanceKm || 30;
                if (diffMin > 0 && diffMin < 45 && km >= 25) {
                  anomalies.push({
                    type: 'warn',
                    badge: 'QUAY VÒNG PHI LÝ',
                    text: `Xe ${plateNo}: Chuyến phiếu ${t1.ticket_no} (${t1.weigh1_time}) và ${t2.ticket_no} (${t2.weigh1_time}) chỉ cách nhau ${diffMin} phút cho tuyến ${km} km. Nghi ngờ quay vòng phiếu khống.`
                  });
                }
              }
            }
          }
        }

        const anomalyRadar = anomalies.length ? h('div', { class: 'anomaly-radar-card' },
          h('div', { class: 'anomaly-radar-header' },
            h('h3', {}, h('span', {}, '🔍'), `Radar kiểm soát rủi ro & Thất thoát (${anomalies.length} cảnh báo)`),
            h('span', { class: 'small muted' }, 'Tự động phát hiện bất thường tiêu hao và quay vòng xe')
          ),
          h('div', { class: 'stack', style: { gap: '4px' } }, anomalies.map((a) =>
            h('div', { class: 'anomaly-item' },
              h('span', { class: `anomaly-badge ${a.type}` }, a.badge),
              h('span', { class: 'anomaly-text' }, a.text)
            )
          ))
        ) : null;

        out.append(
          anomalyRadar,
          h('div', { class: 'grid g2' },
            h('div', { class: 'card' },
              h('h2', {}, 'Kiểm tra trước khi xác nhận'),
              exclDirty && saved === null && period && period.status === 'NHAP' ? h('p', {}, D.tag('NHAP', 'Chưa lưu'), ' Đã thay đổi dầu của kỳ — bấm TÍNH GIÁ để lưu.') : null,
              bulkAckBanner,
              D.issueList([...(res.issues || []), ...blocked.slice(0, 20)].map((x, k) => [x, k]).sort((a, b) => (LVORD[a[0].level] ?? 3) - (LVORD[b[0].level] ?? 3) || a[1] - b[1]).map((x) => x[0]), fuelActions),
              blocked.length > 20 ? h('p', { class: 'small muted' }, `… và ${blocked.length - 20} dòng bị chặn khác`) : null
            ),
            statusCard(saved)
          )
        );
      };
      const statusCard = (saved) => {
        const card = h('div', { class: 'card' }, h('h2', {}, 'Trạng thái kỳ'));
        if (!saved) { card.append(h('p', { class: 'muted' }, 'Đang xem trước — chưa lưu. Bấm TÍNH GIÁ để lưu kỳ nháp.')); return card; }
        const st = saved.status; const flow = ['NHAP', 'DA_XAC_NHAN', 'DA_KHOA'];
        card.append(h('div', { class: 'row' }, h('span', { class: 'mono' }, saved.period_code), saved.origin === 'IMPORTED' ? D.tag('IMPORTED') : null),
          h('div', { class: 'status-flow', style: { margin: '10px 0' } }, flow.map((s) => h('span', { class: `s ${s === st ? 'on' : ''}` }, { NHAP: 'Nháp', DA_XAC_NHAN: 'Đã xác nhận', DA_KHOA: 'Đã khóa' }[s])), st === 'HUY' ? D.tag('HUY') : null),
          saved.needs_recalc ? h('p', {}, D.tag('NHAP', 'Cần tính lại'), ' Dữ liệu nguồn đã sửa sau lần tính.') : null,
          h('p', { class: 'small muted' }, `Lần tính ${saved.calc_version} · ${saved.calculated_by || ''} · ${D.dt(saved.calculated_at)}`));
        const act = (label, fn, o = {}) => h('button', { class: `btn ${o.primary ? 'primary' : ''} ${o.danger ? 'danger' : ''}`, onclick: fn }, label);
        const reload = async () => D.go('calc', { periodId: saved.period_id });
        const btns = [];
        if (D.writer() && saved.origin === 'LOCAL') {
          if (st === 'NHAP') btns.push(act('Xác nhận kỳ', async () => { if (await D.confirm({ title: 'Xác nhận kỳ', message: 'Sau khi xác nhận, phiếu cân và dầu của kỳ không đưa vào kỳ khác được, không sửa số liệu được.' })) { await D.api('periods.confirm', { periodId: saved.period_id, rowVersion: saved.row_version }); D.toast('Đã xác nhận kỳ', 'ok'); reload(); } }, { primary: true }),
            act('Hủy kỳ', async () => { const r = await D.confirm({ title: 'Hủy kỳ nháp', message: 'Kỳ bị hủy, phiếu và dầu được trả lại.', reason: true, danger: true }); if (r) { await D.api('periods.cancel', { periodId: saved.period_id, rowVersion: saved.row_version, reason: r }); reload(); } }, { danger: true }));
          if (st === 'DA_XAC_NHAN') btns.push(act('Khóa kỳ', async () => { if (await D.confirm({ title: 'Khóa kỳ', message: 'Kỳ đã khóa chỉ ADMIN / người có quyền mở khóa mới mở lại được.' })) { await D.api('periods.lock', { periodId: saved.period_id, rowVersion: saved.row_version }); reload(); } }, { primary: true }));
          const unlocker = D.can('ADMIN') || D.state.boot.user.canUnlock;
          if (st === 'DA_KHOA' && unlocker) btns.push(act('Mở khóa', async () => { const r = await D.confirm({ title: 'Mở khóa kỳ', message: 'Ghi lý do mở khóa.', reason: true }); if (r) { await D.api('periods.unlock', { periodId: saved.period_id, rowVersion: saved.row_version, reason: r }); reload(); } }));
          if (st === 'DA_XAC_NHAN' && unlocker) btns.push(act('Trả về nháp', async () => { const r = await D.confirm({ title: 'Trả kỳ về nháp', message: 'Kỳ về nháp để sửa / tính lại.', reason: true }); if (r) { await D.api('periods.reopen', { periodId: saved.period_id, rowVersion: saved.row_version, reason: r }); reload(); } }));
          if (['DA_XAC_NHAN', 'DA_KHOA'].includes(st)) btns.push(act('Xuất gói gửi bên thuê', async () => { const x = await D.api('exchange.exportPackage', { packageType: 'KY_TINH', periodIds: [saved.period_id] }); D.toast(`Đã xuất gói: ${x.file}`, 'ok', 8000); }));
        }
        btns.push(act('Bảng xác nhận KL', () => D.go('bkvc', { periodId: saved.period_id })), act('Chi tiết vận chuyển', () => D.go('bkct', { periodId: saved.period_id })));
        card.append(h('div', { class: 'btns' }, btns));
        return card;
      };
      const samePeriod = (v) => period && period.status === 'NHAP' && period.contract_id === v.contractId && period.date_from === v.dateFrom && period.date_to === v.dateTo;
      const params = () => { const v = { ...f.values(), moveFromDraft: move.checked, excludeReceiptIds: [...excl], overrides: [...ovr.values()] }; if (v.vatRate === '' || v.vatRate === undefined) delete v.vatRate; else v.vatRate = Number(v.vatRate); return samePeriod(v) ? { ...v, periodId: period.period_id } : v; };
      const preview = async () => { const v = params(); if (!v.contractId) { D.toast('Chọn hợp đồng', 'err'); return; } show(await D.api('periods.preview', v), null); };
      const calc = async (e) => {
        const v = params(); if (!v.contractId) { D.toast('Chọn hợp đồng', 'err'); return; }
        e.target.disabled = true;
        try {
          const r = await D.api('periods.calculate', { ...v, periodId: samePeriod(v) ? period.period_id : undefined, clientRequestId: D.rid() }, { quiet: true });
          D.toast(`Đã tính và lưu kỳ ${r.period.period_code}`, 'ok'); period = r.period; exclDirty = false; show(r, r.period);
        } catch (err) {
          if (err.code === 'DUPLICATE' && err.details && err.details.periodId) { D.toast(`${err.message}`, 'info'); exclDirty = false; D.go('calc', { periodId: err.details.periodId }); return; }
          D.toast(D.errorText(err), 'err'); if (err.details && (err.details.issues || err.details.blocked)) show({ results: [], issues: err.details.issues || [], blocked: err.details.blocked || [] }, null);
        } finally { e.target.disabled = false; }
      };
      const page = D.page('Tính giá vận chuyển', '6 · Tính giá', [],
        h('div', { class: 'card' }, h('div', { class: 'filters' }, f), h('div', { class: 'row', style: { marginTop: '10px' } }, h('label', { class: 'check', for: 'moveDraft' }, move, 'Lấy cả phiếu / dầu đang ở kỳ nháp khác (kỳ đó phải tính lại)'),
          h('span', { style: { flex: 1 } }), h('button', { class: 'btn', onclick: preview }, 'Xem trước'), D.writer() ? h('button', { class: 'btn primary', 'data-hotkey': 'primary', onclick: calc }, 'TÍNH GIÁ') : null)), out);
      if (period) {
        const g = await D.api('periods.get', { periodId: period.period_id });
        const ex = (g.exclusions && g.exclusions.receipts) || [];
        show({ vatRate: (g.exclusions || {}).vatRate, results: g.results.map(camel), issues: ex.map((r) => ({ code: 'I_FUEL_EXCLUDED', level: 'INFO', ref: r.receiptId, message: `Đã bỏ dòng dầu ${r.receiptId} (${D.dmy(r.date)}, xe ${r.plateNo}, ${D.vnAuto(r.qty)} lít) khỏi kỳ theo lựa chọn của người dùng` })), blocked: [] }, g.period);
      }
      return page;
    },
  };
  const camel = (c) => ({ calcId: c.calc_id, routeCode: c.route_code, routeName: c.route_name, tripDistanceKm: c.trip_distance_km, startDate: c.start_date, endDate: c.end_date, tripCount: c.trip_count,
    uom: c.uom, totalM3: c.total_m3 === '' || c.total_m3 === undefined ? null : c.total_m3, calcBasis: c.calc_basis || '', basisM3: c.price_method !== 'CO_DINH' && c.calc_basis === 'M3',
    totalTon: c.total_ton, actualFuelLiter: c.actual_fuel_liter, standardFuelLiter: c.standard_fuel_liter, fuelDiffLiter: c.fuel_diff_liter, fuelPrice: c.fuel_price, contractPrice: c.contract_price,
    fuelAdjustPrice: c.fuel_adjust_price, transportPrice: c.transport_price, priceMethod: c.price_method || 'THEO_DAU', trace: JSON.parse(c.trace_json || '{}'), issues: JSON.parse(c.warnings_json || '[]') });

  async function traceDrawer(r, saved) {
    let trace = r.trace;
    if (saved && !trace) { const calc = (await D.api('periods.get', { periodId: saved.period_id })).results.find((c) => c.route_code === r.routeCode); trace = JSON.parse(calc.trace_json); r.calcId = calc.calc_id; }
    const steps = (trace && trace.steps) || [];
    const p1 = steps.filter((s) => s.part === 1);
    const p2 = steps.filter((s) => s.part === 2 || !s.part);

    const renderList = (list) => h('ol', { class: 'trace' }, list.map((s) => h('li', {}, h('b', {}, s.label || s.name), h('div', { class: 'f' }, s.formula), h('div', { class: 'v' }, `${s.expr || ''} = `, h('b', {}, s.unit === '%' ? D.vn(s.value * 100, 2) : D.vnAuto(Math.round(s.value * 1e6) / 1e6)), ` ${s.unit || ''}`))));

    const content = p1.length && p2.length ? [
      h('div', { class: 'card flush', style: { padding: '12px', marginBottom: '12px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '8px' } },
        h('h3', { style: { margin: '0 0 4px', fontSize: '13.5px', color: 'var(--brand)' } }, '1. CÔNG THỨC TÍNH ĐƠN GIÁ DỰ KIẾN KÝ HỢP ĐỒNG (Cơ sở danh mục)'),
        h('p', { class: 'small muted', style: { margin: '0 0 8px' } }, 'Bóc tách chi phí cước và tiền dầu theo định mức cơ sở để xác định Đơn giá ký HĐ:'),
        renderList(p1)
      ),
      h('div', { class: 'card flush', style: { padding: '12px', marginBottom: '12px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '8px' } },
        h('h3', { style: { margin: '0 0 4px', fontSize: '13.5px', color: 'var(--brand)' } }, '2. CÔNG THỨC TÍNH GIÁ KHI THỰC HIỆN KỲ (Liên hoàn bù trừ dầu phát sinh)'),
        h('p', { class: 'small muted', style: { margin: '0 0 8px' } }, 'Tổng hợp phiếu cân + dầu thực nhận kỳ này, tính chênh lệch dầu thực tế:'),
        renderList(p2)
      ),
      h('div', { class: 'slip', style: { padding: '10px 12px', background: 'var(--row-alt)', borderRadius: '8px', border: '1px solid var(--line)', marginBottom: '10px' } },
        h('b', {}, 'MẮC XÍCH LIÊN HOÀN 2 CÔNG THỨC:'),
        h('div', { style: { fontFamily: 'var(--mono)', fontSize: '12.5px', marginTop: '3px', color: 'var(--brand)' } },
          'Đơn giá VC thực hiện = ĐG ký HĐ (từ Công thức 1) + ĐG CL Diesel (từ Công thức 2)'
        ),
        h('div', { style: { marginTop: '4px', fontSize: '13.5px' } },
          '= ', h('b', {}, D.vn(r.contractPrice)), ' + ', h('b', {}, D.vn(r.fuelAdjustPrice, 2)), ' = ',
          h('b', { class: 'money', style: { fontSize: '16px' } }, D.vn(r.transportPrice)), ` ${r.uom === 'M3' ? 'đ/m³' : 'đ/tấn'}`
        )
      )
    ] : [renderList(steps)];

    const body = h('div', {},
      h('p', { class: 'small muted', style: { marginBottom: '10px' } }, `Tuyến ${r.routeCode} · phiên bản giá ${trace && trace.priceId}`),
      ...content,
      r.calcId ? h('div', { class: 'btns', style: { margin: '10px 0' } },
        h('button', { class: 'btn', onclick: async () => { const t = await D.api('calc.tickets', { calcId: r.calcId }); D.modal({ title: `${t.total} phiếu cân cấu thành`, wide: true, body: D.table({ columns: TICKET_COLS, rows: t.items, footer: { ticket_no: `${t.total} phiếu`, net_kg: t.totals.kg } }) }); } }, 'Xem phiếu cân →'),
        h('button', { class: 'btn', onclick: async () => { const t = await D.api('calc.fuel', { calcId: r.calcId }); D.modal({ title: `${t.total} dòng dầu`, wide: true, body: D.table({ columns: FUEL_COLS, rows: t.items, footer: { receive_date: `${t.total} dòng`, qty_liter: t.totals.liters } }) }); } }, 'Xem dòng dầu →')
      ) : null,
      h('p', { class: 'small muted' }, trace && trace.priceMethod === 'CO_DINH' ? 'Đơn giá cố định: dùng nguyên đơn giá trong bảng giá; tiền tới đồng (HALF_UP).' : 'Làm tròn: ĐG ký HĐ tới nghìn, đơn giá VC tới trăm (HALF_EVEN như Power Query); tiền tới đồng (HALF_UP).')
    );
    D.modal({ title: 'Chi tiết liên hoàn 2 công thức tính giá', body, drawer: true });
  }

  const TICKET_COLS = D.TICKET_COLS = [{ key: 'ticket_no', label: 'Số phiếu' }, { key: 'weigh1_date', label: 'Ngày cân 1', fmt: 'date' }, { key: 'weigh1_time', label: 'Giờ cân 1' },
    { key: 'weigh2_date', label: 'Ngày cân 2', fmt: 'date' }, { key: 'weigh2_time', label: 'Giờ cân 2' }, { key: 'plate_no', label: 'Biển số' }, { key: 'weight1_kg', label: 'Cân 1', fmt: 'int' },
    { key: 'weight2_kg', label: 'Cân 2', fmt: 'int' }, { key: 'net_kg', label: 'KL hàng (KG)', fmt: 'int' }, { key: 'route_code', label: 'Tuyến' }, { key: 'owner_unit_code', label: 'Chủ xe' }];
  const FUEL_COLS = D.FUEL_COLS = [{ key: 'receive_date', label: 'Ngày nhận', fmt: 'date' }, { key: 'route_code', label: 'Tuyến' }, { key: 'fuel_vehicle_code', label: 'Mã xe trong file' },
    { key: 'plate_no', label: 'Biển số' }, { key: 'uom', label: 'ĐVT' }, { key: 'qty_liter', label: 'Số lít', fmt: 'auto' }, { key: 'fuel_price_excl_vat', label: 'Đơn giá (chưa VAT)', fmt: 'auto' },
    { key: 'purchase_date', label: 'Ngày mua', fmt: 'date' }, { key: 'giver_unit_code', label: 'Bên giao' }, { key: 'fuel_depot', label: 'Kho nhận dầu' }];
})();
