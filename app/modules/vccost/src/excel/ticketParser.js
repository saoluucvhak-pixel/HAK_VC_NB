'use strict';
/**
 * Chuyển các dòng của sheet (sau header) thành phiếu cân đã chuẩn hóa + lỗi validate từng dòng.
 * KHÔNG ghi DB. Dừng đọc ở dòng "Tổng cộng" hoặc khi gặp N dòng trống liên tiếp.
 */
const { parseDateTime } = require('../utils/datetime');
const { normalizePlate, displayPlate, isValidPlate } = require('../utils/plate');
const { fold } = require('./columnMapping');

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? n : NaN;
};

function parseTickets(aoa, headerRow, mapping, { maxBlankRun = 50 } = {}) {
  // Cột KL ghi "(tấn)" / "(t)" → đổi sang kg
  const klHead = mapping.kl_hang_kg === undefined ? '' : fold((aoa[headerRow] || [])[mapping.kl_hang_kg]);
  const klIsTon = /\((tan|t)\)|\btan\b/.test(klHead) && !/\bkg\b/.test(klHead);
  const get = (row, f) => (mapping[f] === undefined ? undefined : row[mapping[f]]);
  const out = [];
  let blank = 0;
  for (let r = headerRow + 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const first = fold(row.find((c) => c !== null && c !== undefined && c !== '') ?? '');
    if (first.startsWith('tong cong')) break;
    const soPhieu = get(row, 'so_phieu');
    const hasData = ['bien_so', 'kl_hang_kg', 'ngay_gio_can_1', 'can_lan_1', 'can_lan_2'].some((f) => { const v = get(row, f); return v !== null && v !== undefined && v !== ''; });
    const noSoPhieu = soPhieu === null || soPhieu === undefined || soPhieu === '';
    if (noSoPhieu && !hasData) {
      if (row.every((c) => c === null || c === undefined || c === '')) { if (++blank >= maxBlankRun) break; }
      continue;
    }
    blank = 0;
    const errors = [];
    const t1 = parseDateTime(get(row, 'ngay_gio_can_1'));
    const t2 = parseDateTime(get(row, 'ngay_gio_can_2'));
    const c1 = num(get(row, 'can_lan_1'));
    const c2 = num(get(row, 'can_lan_2'));
    let kg = num(get(row, 'kl_hang_kg'));
    if (klIsTon && kg !== null && !isNaN(kg)) kg = Math.round(kg * 1000 * 1000) / 1000;
    const bsGoc = get(row, 'bien_so');
    if (noSoPhieu) errors.push('Thiếu số phiếu');
    if (!t1) errors.push('INVALID_TIME: ngày giờ cân 1 không đọc được');
    if (t1 && t2 && t2 < t1) errors.push('INVALID_TIME: cân 2 trước cân 1');
    if (!bsGoc) errors.push('Thiếu biển số');
    else if (!isValidPlate(bsGoc)) errors.push('Biển số không đúng định dạng');
    if (kg === null && c1 !== null && c2 !== null) kg = Math.abs(c2 - c1);
    if (kg === null || isNaN(kg) || kg <= 0) errors.push('INVALID_WEIGHT: KL hàng không hợp lệ');
    if (c1 !== null && c2 !== null && !isNaN(c1) && !isNaN(c2) && kg !== null && Math.abs(Math.abs(c2 - c1) - kg) > 0.5) {
      errors.push(`INVALID_WEIGHT: |cân2 - cân1| = ${Math.abs(c2 - c1)} ≠ KL hàng ${kg}`);
    }
    out.push({
      source_row: r + 1,
      so_phieu: noSoPhieu ? '' : String(soPhieu).trim(),
      ngay_gio_can_1: t1, ngay_gio_can_2: t2,
      bien_so_goc: bsGoc == null ? null : String(bsGoc),
      bien_so: bsGoc == null ? null : displayPlate(bsGoc),
      bien_so_chuan: normalizePlate(bsGoc),
      can_lan_1: c1, can_lan_2: c2, kl_hang_kg: kg,
      noi_xuat: get(row, 'noi_xuat') == null ? null : String(get(row, 'noi_xuat')).trim(),
      noi_den: get(row, 'noi_den') == null ? null : String(get(row, 'noi_den')).trim(),
      cong_ty_vc_nguon: get(row, 'cong_ty_vc') ?? null, // chỉ để đối chiếu, KHÔNG dùng để gán đơn vị
      errors,
    });
  }
  return out;
}

module.exports = { parseTickets };
