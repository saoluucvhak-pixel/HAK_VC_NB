'use strict';
const dmyOf = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');
/**
 * calculatePeriod — tính 1 kỳ của 1 hợp đồng (hàm thuần: nhận dữ liệu đã đọc, trả kết quả; Service lo đọc/ghi).
 *
 * Quy trình (APP_FLOW §5, BUSINESS_LOGIC §4):
 *  1. Kiểm tra hợp đồng: bản cài phải là bên vận chuyển; hợp đồng còn hiệu lực trong kỳ.
 *  2. Chọn phiếu cân: xe thuộc phạm vi hợp đồng (theo hiệu lực tại Ngày cân 1), ngày theo PERIOD_DATE_FIELD, đúng tuyến (nếu lọc).
 *     Loại phiếu đã dùng ở kỳ ĐÃ XÁC NHẬN / ĐÃ KHÓA của CÙNG hợp đồng (chống tính trùng); phiếu ở kỳ NHÁP khác chỉ lấy khi moveFromDraft.
 *  3. Chọn dầu: TOÀN BỘ bảng kê của hợp đồng cho tuyến (không lọc ngày — đã chốt), trừ dòng bị loại / đã dùng.
 *  4. Mỗi tuyến: chọn phiên bản giá → Tầng A → gom phiếu, gom dầu → Tầng B → trace.
 *  5. BKVC: gom theo xe (+ tuyến) → Tầng C.
 */
const F = require('./formulas');
const { issue } = require('./issues');
const { buildFormulaTrace } = require('./trace');
const { numberToVietnameseWords } = require('./words');

const USED = new Set(['CONFIRMED', 'LOCKED']);
const inRange = (d, from, to) => d >= from && d <= to;
const effectiveAt = (row, d) => row.effective_from <= d && (!row.effective_to || row.effective_to >= d);

function selectPriceVersion(prices, routeCode, contractId, dateFrom, dateTo, cfg) {
  const usable = prices.filter((p) => p.route_code === routeCode && p.status !== 'DRAFT');
  const pick = (d) => {
    const own = usable.filter((p) => p.contract_id === contractId && effectiveAt(p, d));
    const gen = usable.filter((p) => !p.contract_id && effectiveAt(p, d));
    const list = own.length ? own : gen;
    return list.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0] || null;
  };
  const date = cfg.priceVersionDate === 'PERIOD_START' ? dateFrom : dateTo;
  const main = pick(date);
  const other = pick(cfg.priceVersionDate === 'PERIOD_START' ? dateTo : dateFrom);
  if (!main) return { issue: issue('E_PRICE_NOT_FOUND', { routeCode, date }) };
  if (other && other.price_id !== main.price_id) {
    return { issue: issue('E_PRICE_VERSION_SPLIT', { routeCode, priceA: other.price_id, priceB: main.price_id }) };
  }
  return { price: main };
}

function validatePriceAndRoute(route, price) {
  const out = [];
  const rc = route.route_code;
  if (!(route.trip_distance_km > 0)) out.push(issue('E_DISTANCE_INVALID', { routeCode: rc, value: route.trip_distance_km }));
  if (price.fuel_norm_l_per_km === null || price.fuel_norm_l_per_km === undefined || price.fuel_norm_l_per_km === '') {
    out.push(issue('E_FUEL_NORM_MISSING', { routeCode: rc, priceId: price.price_id }));
  } else if (!(price.fuel_norm_l_per_km > 0)) out.push(issue('E_FUEL_NORM_INVALID', { routeCode: rc, value: price.fuel_norm_l_per_km }));
  if (!(price.new_price >= 0)) out.push(issue('E_PRICE_NEGATIVE', { what: `Đơn giá mới tuyến ${rc}`, value: price.new_price }));
  if (!(price.fuel_price_excl_vat > 0)) out.push(issue('E_PRICE_NEGATIVE', { what: `ĐG dầu chưa VAT (danh mục) tuyến ${rc}`, value: price.fuel_price_excl_vat }));
  if (!(price.avg_load_ton > 0)) out.push(issue('E_AVG_LOAD_INVALID', { routeCode: rc, what: 'KL_TB', value: price.avg_load_ton }));
  if (route.uom === 'M3' && !(price.avg_volume_m3 > 0)) out.push(issue('E_AVG_LOAD_INVALID', { routeCode: rc, what: 'Thể tích TB', value: price.avg_volume_m3 }));
  return out;
}

/** Kiểm phiên bản giá CỐ ĐỊNH: chỉ cần đơn giá cố định > 0 (không cần định mức, giá dầu, KL_TB). */
function validateFixedPrice(route, price) {
  const v = Number(price.fixed_price);
  return price.fixed_price === '' || price.fixed_price === null || price.fixed_price === undefined || !(v > 0)
    ? [issue('E_PRICE_NEGATIVE', { what: `Đơn giá cố định tuyến ${route.route_code} (${price.price_id})`, value: price.fixed_price === '' || price.fixed_price == null ? 'trống' : price.fixed_price })] : [];
}
const vnDec = (x) => { const [i, f] = (Math.round(x * 100) / 100).toFixed(2).split('.'); return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${f === '00' ? '' : `,${f}`}`; };
const vnInt = (x) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Trạng thái sử dụng của phiếu/dầu trong các kỳ KHÁC của cùng hợp đồng. */
function usageIndex(detailRows, contractId, currentPeriodId, idField) {
  const idx = new Map();
  for (const d of detailRows || []) {
    if (d.contract_id !== contractId || !d.is_current || d.period_id === currentPeriodId) continue;
    if (d.usage_state === 'RELEASED') continue;
    const prev = idx.get(d[idField]);
    if (!prev || USED.has(d.usage_state)) idx.set(d[idField], d);
  }
  return idx;
}

/**
 * Kiểm tra phạm vi (không đổi kết quả tính, chỉ cảnh báo để không "lọt" phiếu):
 *  - W_VEHICLE_PARTIAL_CONTRACT: xe thuộc hợp đồng nhưng có phiếu trong kỳ nằm ngoài thời gian hiệu lực của xe (xe đổi hợp đồng giữa kỳ).
 *  - W_TICKET_NO_CONTRACT: phiếu trong kỳ của xe không thuộc BẤT KỲ hợp đồng nào mà đơn vị bản cài là bên vận chuyển
 *    (chỉ chạy khi truyền allContracts).
 */
function scopeChecks({ tickets, cv, allContracts, contractVehicles, installUnitCode, inRange, dateOf, p }) {
  const out = [];
  const live = tickets.filter((t) => !t.is_deleted && inRange(dateOf(t), p.dateFrom, p.dateTo) && (!p.routeCode || t.route_code === p.routeCode));
  const plates = new Set(cv.map((v) => v.plate_no));
  const partial = new Map();
  for (const t of live) {
    if (!plates.has(t.plate_no) || cv.some((v) => v.plate_no === t.plate_no && effectiveAt(v, t.weigh1_date))) continue;
    const g = partial.get(t.plate_no) || { count: 0, kg: 0 }; g.count += 1; g.kg += t.net_kg; partial.set(t.plate_no, g);
  }
  for (const [plateNo, g] of [...partial].sort()) {
    const range = cv.filter((v) => v.plate_no === plateNo).map((v) => `${v.effective_from} → ${v.effective_to || '…'}`).join('; ');
    out.push(issue('W_VEHICLE_PARTIAL_CONTRACT', { plateNo, count: g.count, kg: g.kg, range }));
  }
  if (allContracts && installUnitCode) {
    const mine = new Set(allContracts.filter((c) => c.carrier_unit_code === installUnitCode && c.is_active).map((c) => c.contract_id));
    const mcv = contractVehicles.filter((v) => mine.has(v.contract_id));
    const orphan = live.filter((t) => !mcv.some((v) => v.plate_no === t.plate_no && effectiveAt(v, t.weigh1_date)));
    if (orphan.length) {
      out.push(issue('W_TICKET_NO_CONTRACT', { count: orphan.length, kg: orphan.reduce((a, t) => a + t.net_kg, 0),
        plates: [...new Set(orphan.map((t) => t.plate_no))].sort().join(', '), unitCode: installUnitCode }));
    }
  }
  return out;
}

function calculatePeriod(input) {
  const { contract, contractVehicles = [], units = [], routes = [], prices = [], tickets = [], receipts = [],
          ticketUsages = [], fuelUsages = [], periods = [], installUnitCode, cfg } = input;
  const p = { excludeTicketIds: [], excludeReceiptIds: [], overrides: [], moveFromDraft: false,
    ...Object.fromEntries(Object.entries(input.params || {}).filter(([, v]) => v !== undefined && v !== null)) }; // tham số bỏ trống → giữ mặc định
  const issues = []; const blocked = []; const affectedPeriods = new Set();
  const periodCode = new Map(periods.map((x) => [x.period_id, x.period_code]));
  const chosen = []; const fuelAll = []; const results = [];

  // 1. Hợp đồng
  if (!(p.dateFrom && p.dateTo && p.dateFrom <= p.dateTo)) issues.push(issue('E_DATE_INVALID', { detail: `khoảng ngày kỳ tính ${p.dateFrom} – ${p.dateTo}` }));
  if (installUnitCode && contract.carrier_unit_code !== installUnitCode) {
    issues.push(issue('E_NOT_CARRIER', { installUnit: installUnitCode, contractCode: contract.contract_code }));
  }
  if (!contract.is_active || !(contract.effective_from <= p.dateFrom) || (contract.effective_to && contract.effective_to < p.dateTo)) {
    issues.push(issue('E_CONTRACT_INACTIVE', { contractCode: contract.contract_code, dateFrom: p.dateFrom, dateTo: p.dateTo }));
  }
  if (issues.some((i) => i.level === 'ERROR')) return finish();

  // 2. Phiếu cân ứng viên
  const cv = contractVehicles.filter((v) => v.contract_id === contract.contract_id);
  const inContract = (plate, d) => cv.some((v) => v.plate_no === plate && effectiveAt(v, d));
  const coverageChecks = () => issues.push(...scopeChecks({ tickets, cv, allContracts: input.allContracts, contractVehicles, installUnitCode, inRange, dateOf, p }));
  const exclT = new Set(p.excludeTicketIds);
  const tUse = usageIndex(ticketUsages, contract.contract_id, p.periodId, 'ticket_id');
  const dateOf = (t) => (input.cfg.periodDateField === 'WEIGH2_DATE' ? t.weigh2_date : t.weigh1_date);
  const routeByCode = new Map(routes.map((r) => [r.route_code, r]));
  let overnight = 0;
  for (const t of tickets) {
    if (t.is_deleted || !inRange(dateOf(t), p.dateFrom, p.dateTo) || !inContract(t.plate_no, t.weigh1_date)) continue;
    if (!t.route_code) { issues.push(issue('E_ROUTE_MISSING', { ticketNo: t.ticket_no, plateNo: t.plate_no }, t.ticket_id)); continue; }
    if (p.routeCode && t.route_code !== p.routeCode) continue;
    if (!routeByCode.has(t.route_code)) { issues.push(issue('E_ROUTE_NOT_FOUND', { routeCode: t.route_code }, t.ticket_id)); continue; }
    if (exclT.has(t.ticket_id)) continue;
    const u = tUse.get(t.ticket_id);
    if (u && USED.has(u.usage_state)) {
      blocked.push({ kind: 'ticket', id: t.ticket_id, ...issue('E_TICKET_USED_IN_PERIOD', { periodCode: periodCode.get(u.period_id) || u.period_id, ticketNo: t.ticket_no }) });
      continue;
    }
    if (u && u.usage_state === 'DRAFT') {
      if (!p.moveFromDraft) { issues.push(issue('W_TICKET_IN_DRAFT_PERIOD', { ticketNo: t.ticket_no, periodCode: periodCode.get(u.period_id) || u.period_id }, t.ticket_id)); continue; }
      affectedPeriods.add(u.period_id);
    }
    if (t.weigh1_date !== t.weigh2_date) overnight += 1;
    if (t.weight1_kg != null && t.weight2_kg != null && Math.abs(t.net_kg - Math.abs(t.weight2_kg - t.weight1_kg)) > input.cfg.kgCheckTolerance) {
      issues.push(issue('W_KG_MISMATCH', { ticketNo: t.ticket_no, netKg: t.net_kg, diffKg: Math.abs(t.weight2_kg - t.weight1_kg) }, t.ticket_id));
    }
    chosen.push(t);
  }
  if (overnight) issues.push(issue('W_OVERNIGHT', { count: overnight }));
  coverageChecks();
  if (!chosen.length && !issues.some((i) => i.level === 'ERROR')) issues.push(issue('E_NO_TICKETS', {}));

  // 3. Dầu ứng viên (tính hết bảng kê của hợp đồng)
  const exclR = new Set(p.excludeReceiptIds);
  const fUse = usageIndex(fuelUsages, contract.contract_id, p.periodId, 'receipt_id');
  const usedEarlier = new Map();
  // dòng nghi trùng: chỉ cảnh báo khi trong kỳ còn ≥ 2 dòng giống nhau (cùng ngày, xe, số lít) — bỏ 1 dòng thì dòng còn lại hết cảnh báo
  const dupKey = (r) => `${r.receive_date}|${r.plate_no || r.fuel_vehicle_code}|${r.qty_liter}`;
  const dupCount = new Map();
  for (const r of receipts) {
    if (r.is_deleted || r.contract_id !== contract.contract_id || exclR.has(r.receipt_id) || (p.routeCode && r.route_code !== p.routeCode)) continue;
    dupCount.set(dupKey(r), (dupCount.get(dupKey(r)) || 0) + 1);
  }
  for (const r of receipts) {
    if (r.is_deleted || r.contract_id !== contract.contract_id) continue;
    if (p.routeCode && r.route_code !== p.routeCode) continue;
    if (exclR.has(r.receipt_id)) { issues.push(issue('I_FUEL_EXCLUDED', { receiptId: r.receipt_id, date: dmyOf(r.receive_date), plateNo: r.plate_no || r.fuel_vehicle_code, qty: r.qty_liter }, r.receipt_id)); continue; }
    const u = fUse.get(r.receipt_id);
    if (u && USED.has(u.usage_state)) {
      // dầu nhận TRƯỚC kỳ và đã tính ở kỳ đã xác nhận = lịch sử bình thường của bảng kê → gộp 1 dòng thông tin, không liệt kê từng dòng
      if (r.receive_date < p.dateFrom) { const k = periodCode.get(u.period_id) || u.period_id; usedEarlier.set(k, (usedEarlier.get(k) || 0) + 1); continue; }
      blocked.push({ kind: 'fuel', id: r.receipt_id, ...issue('E_FUEL_USED_IN_PERIOD', { periodCode: periodCode.get(u.period_id) || u.period_id }) });
      continue;
    }
    if (u && u.usage_state === 'DRAFT') {
      if (!p.moveFromDraft) { issues.push(issue('W_FUEL_IN_DRAFT_PERIOD', { receiptId: r.receipt_id, periodCode: periodCode.get(u.period_id) || u.period_id }, r.receipt_id)); continue; }
      affectedPeriods.add(u.period_id);
    }
    if (/W_POSSIBLE_DUPLICATE/.test(r.validation_flags || '') && !r.flags_ack && dupCount.get(dupKey(r)) > 1) {
      issues.push(issue('W_FUEL_POSSIBLE_DUPLICATE', { receiptId: r.receipt_id, date: dmyOf(r.receive_date), plateNo: r.plate_no || r.fuel_vehicle_code, qty: r.qty_liter }, r.receipt_id));
    }
    if (r.fuel_price_excl_vat < 0 || r.qty_liter === 0 || (r.qty_liter > 0 && !(r.fuel_price_excl_vat > 0))) issues.push(issue('E_PRICE_NEGATIVE', { what: `Dòng dầu ${r.receipt_id}`, value: r.qty_liter === 0 ? '0 lít' : r.fuel_price_excl_vat }, r.receipt_id));
    if (r.qty_liter < 0) issues.push(issue('I_FUEL_OFFSET', { receiptId: r.receipt_id, date: dmyOf(r.receive_date), plateNo: r.plate_no || r.fuel_vehicle_code, qty: r.qty_liter }, r.receipt_id));
    if (r.receive_date < p.dateFrom) issues.push(issue('W_BEFORE_PERIOD', { receiptId: r.receipt_id, date: dmyOf(r.receive_date) }, r.receipt_id));
    if (r.receive_date > p.dateTo) issues.push(issue('W_AFTER_PERIOD', { receiptId: r.receipt_id, date: dmyOf(r.receive_date) }, r.receipt_id));
    if (!r.plate_no || !cv.some((v) => v.plate_no === r.plate_no)) issues.push(issue('W_VEHICLE_OUT_OF_CONTRACT', { receiptId: r.receipt_id, plateNo: r.plate_no || r.fuel_vehicle_code }, r.receipt_id));
    fuelAll.push(r);
  }

  if (usedEarlier.size) {
    const codes = [...usedEarlier.keys()].sort();
    issues.push(issue('I_FUEL_USED_EARLIER', { count: [...usedEarlier.values()].reduce((a, b) => a + b, 0), periods: codes.length,
      last: codes[codes.length - 1] }));
  }

  // 4. Từng tuyến
  const byRoute = new Map();
  for (const t of chosen) { if (!byRoute.has(t.route_code)) byRoute.set(t.route_code, []); byRoute.get(t.route_code).push(t); }
  for (const [routeCode, ts] of [...byRoute.entries()].sort()) {
    const route = routeByCode.get(routeCode);
    const rIssues = [];
    const sel = selectPriceVersion(prices, routeCode, contract.contract_id, p.dateFrom, p.dateTo, input.cfg);
    const fixed = !sel.issue && F.isFixedPrice(sel.price);
    if (sel.issue) rIssues.push(sel.issue);
    else rIssues.push(...(fixed ? validateFixedPrice(route, sel.price) : validatePriceAndRoute(route, sel.price)));
    const fs = fuelAll.filter((r) => r.route_code === routeCode);
    const groups = fixed ? [] : F.aggregateFuel(fs, input.cfg);
    const ov = p.overrides.find((o) => o.code === 'E_NO_FUEL' && o.routeCode === routeCode);
    let fuel;
    if (fixed) {
      // đơn giá cố định: tuyến không nhận dầu (chốt 07/10/2026) — có dòng dầu là nhập nhầm tuyến → chặn, chỉ rõ để loại / sửa
      if (fs.length) rIssues.push(issue('E_FIXED_PRICE_HAS_FUEL', { routeCode, priceId: sel.price.price_id, count: fs.length,
        liter: Math.round(fs.reduce((a, r) => a + r.qty_liter, 0) * 100) / 100, literText: vnDec(fs.reduce((a, r) => a + r.qty_liter, 0)),
        dates: [...new Set(fs.map((r) => r.receive_date))].sort().slice(0, 5).map(dmyOf).join(', ') + (new Set(fs.map((r) => r.receive_date)).size > 5 ? '…' : ''), receiptIds: fs.map((r) => r.receipt_id) }, routeCode));
      fuel = { giverUnitCode: null, uom: null, lineCount: 0, actualFuelLiter: 0, fuelPrice: null, fuelStartDate: null, fuelEndDate: null, fuelImportDate: null };
    } else if (groups.length > 1) rIssues.push(issue('E_MULTI_FUEL_GROUP', { routeCode, groups: groups.map((g) => `${g.giverUnitCode}/${g.uom}`).join(', ') }));
    else if (groups.length === 1) {
      fuel = groups[0];
      if (fuel.fuelPrice === null) { rIssues.push(issue('E_FUEL_OFFSET_NO_PRICE', { routeCode }, routeCode)); fuel = null; }
      else if (fuel.actualFuelLiter <= 0) rIssues.push(issue('W_FUEL_TOTAL_NONPOSITIVE', { routeCode, liter: Math.round(fuel.actualFuelLiter * 100) / 100 }, routeCode));
    }
    else if (ov && input.cfg.noFuelPolicy === 'BLOCK_WITH_OVERRIDE') {
      if (!(ov.fuelPrice > 0)) rIssues.push(issue('E_NO_FUEL_PRICE', { routeCode }));
      else {
        fuel = { giverUnitCode: null, uom: 'LÍT', lineCount: 0, actualFuelLiter: 0, fuelPrice: ov.fuelPrice, fuelStartDate: null, fuelEndDate: null, fuelImportDate: null };
        rIssues.push(issue('W_OVERRIDE_NO_FUEL', { routeCode, reason: ov.reason || '', fuelPrice: String(Math.round(ov.fuelPrice)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') }, routeCode));
      }
    } else {
      // gợi ý đơn giá dầu khi tính với dầu = 0: đơn giá dòng dầu gần nhất của hợp đồng, không có thì ĐG dầu danh mục
      const last = receipts.filter((r) => !r.is_deleted && r.contract_id === contract.contract_id && r.fuel_price_excl_vat > 0).sort((a, b) => (a.receive_date < b.receive_date ? 1 : -1))[0];
      const suggest = last ? last.fuel_price_excl_vat : (sel.price ? sel.price.fuel_price_excl_vat : 0);
      rIssues.push(issue('E_NO_FUEL', { routeCode, suggestFuelPrice: suggest, suggestSource: last ? `dòng dầu ${dmyOf(last.receive_date)}` : 'ĐG dầu danh mục' }, routeCode));
    }
    const trips = F.aggregateTrips(ts);
    if (!(trips.totalKg > 0)) rIssues.push(issue('E_TOTAL_KG_ZERO', { routeCode }));
    const fuelPlates = new Set(fs.map((r) => r.plate_no));
    if (!fixed) for (const pl of [...new Set(ts.map((t) => t.plate_no))].sort()) if (!fuelPlates.has(pl)) rIssues.push(issue('W_VEHICLE_NO_FUEL', { plateNo: pl }, pl));

    const base = { routeCode, routeName: route.route_name, uom: route.uom, ticketIds: ts.map((t) => t.ticket_id), receiptIds: fs.map((r) => r.receipt_id), ...trips };
    if (rIssues.some((i) => i.level === 'ERROR')) {
      results.push({ ...base, resultStatus: 'ERROR', issues: rIssues });
      issues.push(...rIssues);
      continue;
    }
    const A = F.computeContractPrice(route, sel.price, input.cfg);
    const r = { ...base, priceId: sel.price.price_id, ...A,
      fuelGiverUnit: fuel.giverUnitCode, fuelUom: fuel.uom, fuelLineCount: fuel.lineCount, actualFuelLiter: fuel.actualFuelLiter,
      fuelStartDate: fuel.fuelStartDate, fuelEndDate: fuel.fuelEndDate, fuelPrice: fuel.fuelPrice, fuelImportDate: fuel.fuelImportDate };
    if (fixed) {
      r.standardFuelLiter = 0; r.fuelDiffLiter = 0; r.fuelAdjustPrice = 0;
      r.transportPriceRaw = A.fixedPrice; r.transportPriceFloored = false; r.transportPrice = A.fixedPrice;
      rIssues.push(issue('I_FIXED_PRICE', { routeCode, priceId: sel.price.price_id, price: vnInt(A.fixedPrice) }, routeCode));
      r.resultStatus = rIssues.some((i) => i.level === 'WARNING') ? 'WARNING' : 'OK';
      r.issues = rIssues;
      r.trace = buildFormulaTrace(r, input.cfg);
      results.push(r);
      issues.push(...rIssues);
      continue;
    }
    r.standardFuelLiter = F.calculateStandardFuel({ tripDistanceKm: A.tripDistanceKm, tripCount: r.tripCount, fuelNormLPerKm: A.fuelNormLPerKm });
    r.fuelDiffLiter = F.calculateFuelDifference(r);
    r.fuelAdjustPrice = F.calculateFuelAdjustment(r);
    const tp = F.calculateTransportPrice(r, input.cfg);
    r.transportPriceRaw = tp.raw; r.transportPriceFloored = tp.floored; r.transportPrice = tp.value;
    if (r.fuelDiffLiter < 0) rIssues.push(issue('W_NEGATIVE_FUEL_DIFF', { routeCode, value: Math.round(r.fuelDiffLiter * 100) / 100 }));
    if (tp.floored) rIssues.push(issue('W_FLOORED_ZERO', { routeCode, value: tp.raw }));
    r.resultStatus = rIssues.some((i) => i.level === 'WARNING') ? 'WARNING' : 'OK';
    r.issues = rIssues;
    r.trace = buildFormulaTrace(r, input.cfg);
    results.push(r);
    issues.push(...rIssues);
  }
  // tuyến đơn giá cố định không nhận dầu: các cảnh báo từng dòng dầu của tuyến đó (trước/sau kỳ, nghi trùng, bù trừ…) không còn ý nghĩa —
  // đã gom vào 1 lỗi E_FIXED_PRICE_HAS_FUEL của tuyến
  const fixedFuel = new Set(results.flatMap((r) => r.issues.filter((i) => i.code === 'E_FIXED_PRICE_HAS_FUEL').flatMap((i) => i.params.receiptIds)));
  if (fixedFuel.size) {
    const noise = new Set(['W_BEFORE_PERIOD', 'W_AFTER_PERIOD', 'W_FUEL_POSSIBLE_DUPLICATE', 'W_VEHICLE_OUT_OF_CONTRACT', 'I_FUEL_OFFSET', 'E_PRICE_NEGATIVE']);
    for (let i = issues.length - 1; i >= 0; i--) if (noise.has(issues[i].code) && fixedFuel.has(issues[i].ref)) issues.splice(i, 1);
  }
  return finish();

  function finish() {
    const ok = results.filter((r) => r.resultStatus !== 'ERROR');
    const bkvc = buildConfirmation(ok, chosen, units, input.cfg);
    return {
      canCalculate: !issues.some((i) => i.level === 'ERROR') && ok.length > 0,
      results, issues, blocked, affectedPeriods: [...affectedPeriods],
      tickets: chosen.map((t) => t.ticket_id), receipts: fuelAll.map((r) => r.receipt_id), bkvc,
    };
  }
}

/** Tầng C — BKVC: 1 dòng / xe (/ tuyến), đơn giá = đơn giá VC của tuyến; tổng = cộng các dòng đã làm tròn. */
function buildConfirmation(results, tickets, units, cfg) {
  const priceOf = new Map(results.map((r) => [r.routeCode, r.transportPrice]));
  const by = new Map();
  for (const t of tickets) {
    if (!priceOf.has(t.route_code)) continue;
    const k = cfg.bkvcGroupBy === 'PLATE' ? t.plate_no : `${t.plate_no}|${t.route_code}`;
    if (!by.has(k)) by.set(k, { plateNo: t.plate_no, routeCode: t.route_code, ownerUnitCode: t.owner_unit_code, tripCount: 0, kg: 0 });
    const b = by.get(k); b.tripCount += 1; b.kg += t.net_kg;
  }
  let lines = [...by.values()];
  lines.sort(cfg.bkvcSort === 'TRIPS_DESC' ? (a, b) => b.tripCount - a.tripCount || (a.plateNo < b.plateNo ? -1 : 1)
                                          : (a, b) => (a.plateNo < b.plateNo ? -1 : a.plateNo > b.plateNo ? 1 : (a.routeCode < b.routeCode ? -1 : 1)));
  lines = lines.map((b, i) => {
    const unitPrice = priceOf.get(b.routeCode);
    const c = F.calculateConfirmationLine({ kg: b.kg, unitPrice, vatRate: cfg.vatRate }, cfg);
    return { seq: i + 1, ...b, ton: c.ton, unitPrice, amount: c.amount, vatRate: cfg.vatRate, vat: c.vat, amountInclVat: c.amountInclVat };
  });
  // VAT_ROUND_BASIS = TOTAL: VAT = làm tròn(tổng tiền hàng × thuế suất) như phần mềm hóa đơn (MISA); chênh với tổng VAT từng dòng dồn vào dòng cuối
  if (cfg.vatRoundBasis === 'TOTAL' && lines.length) {
    const sumAmt = lines.reduce((a, l) => a + l.amount, 0);
    const vatTotal = F.calculateInvoiceVat(sumAmt, cfg.vatRate, cfg);
    const diff = vatTotal - lines.reduce((a, l) => a + l.vat, 0);
    if (diff) { const last = lines[lines.length - 1]; last.vat += diff; last.amountInclVat += diff; last.vatAdjust = diff; }
  }
  const totals = lines.reduce((s, l) => ({ trips: s.trips + l.tripCount, kg: s.kg + l.kg, amount: s.amount + l.amount, vat: s.vat + l.vat, total: s.total + l.amountInclVat }),
    { trips: 0, kg: 0, amount: 0, vat: 0, total: 0 });
  totals.ton = totals.kg / 1000;
  const amountInWords = lines.length ? numberToVietnameseWords(totals.total, { thousand: cfg.amountWordsThousand, suffix: cfg.amountWordsSuffix }) : '';
  return { lines, totals, amountInWords };
}

module.exports = { calculatePeriod, selectPriceVersion, validatePriceAndRoute, validateFixedPrice, buildConfirmation };
