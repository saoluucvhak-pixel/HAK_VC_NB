'use strict';
/** desk/schema.py (nguồn tài liệu/DB mẫu) phải có đủ mọi cột của app/shared/schema.json — tránh tài liệu lệch khỏi mã (rà soát M4). */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const SCHEMA = require('../shared/schema.json');

// Lệnh Python 3 khả dụng trên MỌI hệ điều hành: python3 (Linux / macOS), python (Windows cài từ python.org), py -3 (trình khởi chạy của Windows).
// Trước đây gọi cứng "python3" nên trên Windows test luôn bị bỏ qua dù đã cài Python.
function findPython() {
  for (const [cmd, ...pre] of [['python3'], ['python'], ['py', '-3']]) {
    try { if (execFileSync(cmd, [...pre, '-c', 'import sys;print(sys.version_info[0])'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === '3') return [cmd, ...pre]; } catch { /* thử lệnh kế */ }
  }
  return null;
}
const PY = findPython();

test('schema.py có đủ cột của schema.json', { skip: !PY && 'không tìm thấy Python 3 (python3 / python / py -3)' }, () => {
  const py = `import json,sys\nsys.path.insert(0,${JSON.stringify(path.join(__dirname, '..', '..', 'desk'))})\nimport schema\nprint(json.dumps({t[0]:[c[0] for c in schema.columns(t)] for t in schema.TABLES}))`;
  const [cmd, ...pre] = PY;
  const cols = JSON.parse(execFileSync(cmd, [...pre, '-I', '-c', py], { encoding: 'utf8' }));
  const missing = [];
  for (const [name, t] of Object.entries(SCHEMA.tables)) for (const c of t.columns) if (!(cols[name] || []).includes(c.name)) missing.push(`${name}.${c.name}`);
  assert.deepEqual(missing, []);
});
