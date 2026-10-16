'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { roundDigits, int64PQ } = require('../main/engine');
const { fixture } = require('./helpers');

test('Làm tròn khớp Python Decimal trên 5.160 trường hợp (6 mức × 2 chế độ × 430 giá trị)', () => {
  const cases = fixture('rounding_vectors.json');
  const bad = [];
  for (const [x, d, m, want] of cases) {
    const got = roundDigits(x, d, m);
    if (!Object.is(got, want) && !(got === 0 && want === 0)) bad.push({ x, d, m, want, got });
  }
  assert.equal(bad.length, 0, `Sai ${bad.length} trường hợp, vd ${JSON.stringify(bad.slice(0, 5))}`);
});

test('HALF_EVEN (Power Query) khác HALF_UP (Excel ROUND) đúng ở điểm giữa', () => {
  assert.equal(roundDigits(115500, -3, 'HALF_EVEN'), 116000);
  assert.equal(roundDigits(116500, -3, 'HALF_EVEN'), 116000);
  assert.equal(roundDigits(116500, -3, 'HALF_UP'), 117000);
  assert.equal(roundDigits(-2.5, 0, 'HALF_EVEN'), -2);
  assert.equal(roundDigits(-2.5, 0, 'HALF_UP'), -3);
});

test('Không bị lỗi số thực: 2.675 → 2.68 (dữ liệu thập phân đúng như nhập)', () => {
  assert.equal(roundDigits(2.675, 2, 'HALF_UP'), 2.68);
  assert.equal(roundDigits(1.005, 2, 'HALF_UP'), 1.01);
});

test('int64PQ mô phỏng Int64.Type của Power Query', () => {
  assert.equal(int64PQ(91666.66667), 91667);
  assert.equal(int64PQ(194791.6667), 194792);
  assert.equal(int64PQ(2.5), 2);
  assert.equal(int64PQ(3.5), 4);
});

test('Giá trị đầu vào sai bị từ chối rõ ràng', () => {
  assert.throws(() => roundDigits(NaN, 0), TypeError);
  assert.throws(() => roundDigits(1, 0.5), TypeError);
  assert.throws(() => roundDigits(1, 0, 'CEIL'), RangeError);
});
