'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../main/engine');
const { fixture, loadDataFolder } = require('./helpers');

test('Đọc số thành chữ khớp bộ tham chiếu (23 trường hợp) và khớp chữ trên ô BKVC!A25 của Excel', () => {
  for (const [n, want] of fixture('words_vectors.json')) assert.equal(E.numberToVietnameseWords(n), want, String(n));
  assert.equal(E.numberToVietnameseWords(1255799581, { suffix: 'đồng y' }),
    'Một tỷ, hai trăm năm mươi lăm triệu, bảy trăm chín mươi chín ngàn, năm trăm tám mươi mốt đồng y');
});

test('Người ký theo thứ tự HAK → HAKQN → ĐH → CNHAK', () => {
  const { rows } = loadDataFolder('HAKQN');
  const cfg = E.buildConfig(rows.CONFIG);
  const s = (id) => E.resolveSigners(rows.HOP_DONG.find((c) => c.contract_id === id), rows.DON_VI, cfg);
  const qs = s('HD-HAKQN-QS');
  assert.equal(qs.carrier.signer.name, 'VÕ VĂN PHỤNG');      // HAKQN
  assert.equal(qs.customer.signer.name, 'VÕ THỊ NHƯ NGỌC'); // CN Quế Sơn
  assert.equal(qs.carrier.accountant, 'TRẦN THỊ HẸN');
  const dh = s('HD-DH-HAKQN');
  assert.equal(dh.customer.signer.name, 'VÕ VĂN PHỤNG');     // HAKQN đứng trước ĐH
  assert.equal(dh.carrier.signer.name, 'VÕ THỊ NHƯ NGỌC');
  const hak = s('HD-HAK-HAKQN');
  assert.equal(hak.carrier.signer.name, 'VÕ VĂN PHỤNG');     // HAK đứng trước HAKQN
  assert.equal(hak.customer.signer.title, 'Phó Giám đốc');
});

test('Cấu hình sai bị từ chối ngay, không tính với tham số hỏng', () => {
  assert.throws(() => E.buildConfig([{ config_key: 'ROUND_PRICE_MODE', config_value: 'CEIL' }]), /không hợp lệ/);
  assert.throws(() => E.buildConfig([{ config_key: 'VAT_RATE', config_value: 'tám' }]), /không phải số/);
  assert.equal(E.buildConfig([]).roundFinalDigits, -2);
});

test('Mọi mã kiểm tra Engine dùng đều có trong api_spec.json cùng mức (không lệch giữa giao diện và Engine)', () => {
  const spec = require('../shared/api_spec.json');
  const lv = new Map(spec.issues.map((i) => [i.code, i.level]));
  for (const [code, [level]] of Object.entries(E.ISSUE)) assert.equal(lv.get(code), level, code);
});
