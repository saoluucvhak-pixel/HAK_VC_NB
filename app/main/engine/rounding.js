'use strict';
/**
 * Làm tròn thập phân CHÍNH XÁC trên biểu diễn thập phân ngắn nhất của số (String(x)),
 * tương đương Python Decimal(repr(x)).quantize(...) — tránh lỗi số thực kiểu 0.1 + 0.2.
 *
 * digits theo quy ước Excel / Power Query:  2 = 2 chữ số lẻ, 0 = số nguyên, -2 = hàng trăm, -3 = hàng nghìn.
 * mode:
 *   HALF_EVEN — mặc định của Power Query Number.Round / Int64.From (làm tròn "ngân hàng")
 *   HALF_UP   — như hàm ROUND của Excel (điểm giữa làm tròn xa số 0)
 */

const MODES = new Set(['HALF_EVEN', 'HALF_UP']);

/** Tách số hữu hạn thành { neg, coef (BigInt ≥ 0), exp } với |x| = coef × 10^exp. */
function toDecimal(x) {
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new TypeError(`Giá trị không phải số hữu hạn: ${x}`);
  }
  let s = String(x);
  let neg = false;
  if (s[0] === '-') { neg = true; s = s.slice(1); }
  let exp = 0;
  const e = s.indexOf('e');
  if (e >= 0) { exp = parseInt(s.slice(e + 1), 10); s = s.slice(0, e); }
  const dot = s.indexOf('.');
  if (dot >= 0) { exp -= s.length - dot - 1; s = s.slice(0, dot) + s.slice(dot + 1); }
  return { neg, coef: BigInt(s), exp };
}

function roundDigits(x, digits = 0, mode = 'HALF_EVEN') {
  if (!Number.isInteger(digits)) throw new TypeError('digits phải là số nguyên');
  if (!MODES.has(mode)) throw new RangeError(`Chế độ làm tròn không hỗ trợ: ${mode}`);
  const { neg, coef, exp } = toDecimal(x);
  if (coef === 0n) return 0;
  const shift = exp + digits;            // x × 10^digits = coef × 10^shift
  let q;
  if (shift >= 0) {
    q = coef * 10n ** BigInt(shift);     // đã chính xác, không cần làm tròn
  } else {
    const div = 10n ** BigInt(-shift);
    q = coef / div;
    const rem2 = (coef % div) * 2n;
    if (rem2 > div) q += 1n;
    else if (rem2 === div) {             // đúng điểm giữa
      if (mode === 'HALF_UP' || (q % 2n === 1n)) q += 1n;
    }
  }
  const v = Number(`${q}e${-digits}`);   // chuỗi → double gần nhất
  return neg ? -v : v;
}

/** Mô phỏng ép kiểu Int64.Type của Power Query (Int64.From, mặc định HALF_EVEN). */
function int64PQ(x) {
  return roundDigits(x, 0, 'HALF_EVEN');
}

module.exports = { roundDigits, int64PQ, toDecimal };
