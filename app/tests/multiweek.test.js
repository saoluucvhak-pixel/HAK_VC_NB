'use strict';
/**
 * Bước 13 — nhiều kỳ liên tiếp trên dữ liệu thật: nhân tuần 18–23/09/2026 thành 4 tuần (tools/bench-year.js),
 * mỗi tuần import file → tính → xác nhận → khóa. Bảng kê dầu "tính hết" nhưng dầu của tuần trước đã tính → tự bỏ qua,
 * chỉ báo 1 dòng thông tin (không liệt kê lại hàng trăm dòng cũ mỗi kỳ).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('4 tuần liên tiếp: tuần nào cũng 326 chuyến, 178.000 đ/tấn, không chặn nhầm, dầu cũ gộp 1 dòng', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc13-weeks-'));
  execFileSync(process.execPath, [path.join(__dirname, '../tools/bench-year.js'), '4', dir], { stdio: 'pipe' });
  const { summary, rows } = JSON.parse(fs.readFileSync(path.join(dir, 'bench-year.json'), 'utf8'));
  assert.equal(summary.weeks, 4); assert.equal(summary.periods, 4);
  assert.equal(summary.tickets, 4 * 326); assert.equal(summary.details, 4 * 326);
  assert.deepEqual(summary.prices, [178000]); assert.equal(summary.allTrips326, true);
  assert.equal(summary.maxBlocked, 0, 'không có dòng nào bị chặn trong kỳ mới');
  assert.deepEqual(rows.map((r) => r.fuelEarlier), [0, 18, 36, 54], 'dầu các tuần trước: bỏ qua, đếm đúng');
});
