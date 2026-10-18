'use strict';
/**
 * Tiền tệ & làm tròn — KHÔNG dùng float trực tiếp cho tiền.
 * Mọi phép tính tiền đi qua Decimal (decimal.js), làm tròn theo cấu hình.
 *
 * Quy ước làm tròn giống Excel ROUND(): nửa lên, xa số 0 (ROUND_HALF_UP của decimal.js).
 * digits:  0 -> làm tròn đến đồng;  -2 -> làm tròn đến trăm đồng;  null -> KHÔNG làm tròn.
 */
const Decimal = require('decimal.js');

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

const MODES = {
  HALF_UP: Decimal.ROUND_HALF_UP, // = Excel ROUND
  DOWN: Decimal.ROUND_DOWN,       // = Excel ROUNDDOWN / TRUNC
  UP: Decimal.ROUND_UP,           // = Excel ROUNDUP
};

const D = (v) => new Decimal(v === null || v === undefined || v === '' ? 0 : v);

/** Làm tròn kiểu Excel ROUND(x, digits). digits có thể âm. null = giữ nguyên. */
function round(value, digits, mode = 'HALF_UP') {
  const x = D(value);
  if (digits === null || digits === undefined) return x;
  const m = MODES[mode];
  if (m === undefined) throw new Error(`Chế độ làm tròn không hợp lệ: ${mode}`);
  if (digits >= 0) return x.toDecimalPlaces(digits, m);
  const f = new Decimal(10).pow(-digits);
  return x.div(f).toDecimalPlaces(0, m).mul(f);
}

/** Áp 1 quy tắc làm tròn dạng {digits, mode} (hoặc null). */
function applyRule(value, rule) {
  if (!rule) return D(value);
  return round(value, rule.digits, rule.mode || 'HALF_UP');
}

const sum = (arr) => arr.reduce((a, b) => a.plus(D(b)), new Decimal(0));

module.exports = { Decimal, D, round, applyRule, sum };
