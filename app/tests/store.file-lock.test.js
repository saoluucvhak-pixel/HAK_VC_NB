'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeAtomic } = require('../main/repo/Journal');
const { JsonStore } = require('../main/repo/JsonStore');

test('Ghi nguyên tử: khóa tệp tạm thời được thử lại; lỗi bền không xóa bản gốc', (t) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-file-lock-')), 'value.json');
  fs.writeFileSync(file, 'old');
  const rename = fs.renameSync;
  let attempts = 0;
  const mocked = t.mock.method(fs, 'renameSync', (from, to) => {
    attempts++;
    if (attempts <= 2) throw Object.assign(new Error('sharing violation'), { code: 'EPERM' });
    return rename(from, to);
  });
  writeAtomic(file, 'new');
  assert.equal(attempts, 3);
  assert.equal(fs.readFileSync(file, 'utf8'), 'new');
  attempts = 0;
  mocked.mock.mockImplementation(() => { attempts++; throw Object.assign(new Error('locked'), { code: 'EBUSY' }); });
  assert.throws(() => writeAtomic(file, 'incomplete'), { code: 'EBUSY' });
  assert.equal(attempts, 9, 'Phải dừng sau số lần thử hữu hạn');
  assert.equal(fs.readFileSync(file, 'utf8'), 'new', 'Không xóa tệp đích khi thử lại');
  attempts = 0;
  mocked.mock.mockImplementation(() => { attempts++; throw Object.assign(new Error('missing'), { code: 'ENOENT' }); });
  assert.throws(() => writeAtomic(file, 'bad'), { code: 'ENOENT' });
  assert.equal(attempts, 1, 'Lỗi ngoài nhóm khóa tệp phải trả ngay');
});

test('Giao dịch JSON ghi dở chặn ghi tiếp và compact; mở lại phục hồi rồi ghi được', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-journal-recovery-'));
  JsonStore.create(root, { installCode: 'DH', unitCode: 'DH' });
  const store = new JsonStore(root, { fault: (point) => {
    if (point === 'afterFirstSwap') throw Object.assign(new Error('locked after swap'), { code: 'EPERM' });
  } }).open();
  try {
    await assert.rejects(store.transaction((tx) => tx.audit('TEST', 'DATA', 'first', null, { value: 1 })), (error) => error.details.code === 'E_RECOVERY_REQUIRED');
    const journals = fs.readdirSync(path.join(root, 'journal'));
    await assert.rejects(store.transaction((tx) => tx.audit('TEST', 'DATA', 'second', null, { value: 2 })), (error) => error.details.code === 'E_RECOVERY_REQUIRED');
    await assert.rejects(store.compact(), (error) => error.details.code === 'E_RECOVERY_REQUIRED');
    assert.deepEqual(fs.readdirSync(path.join(root, 'journal')), journals);
  } finally { store.close(); }
  const reopened = new JsonStore(root).open();
  try {
    assert.equal(reopened.all('AUDIT_LOG')[0].entity_id, 'first');
    assert.equal(reopened.dataVersion, 1);
    await reopened.transaction((tx) => tx.audit('TEST', 'DATA', 'second', null, { value: 2 }));
    assert.equal(reopened.dataVersion, 2);
    assert.equal(reopened.all('AUDIT_LOG').length, 2);
  } finally { reopened.close(); }
});
