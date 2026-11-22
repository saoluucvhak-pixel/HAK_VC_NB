'use strict';
/** desk/schema.py (nguồn tài liệu/DB mẫu) phải có đủ mọi cột của app/shared/schema.json — tránh tài liệu lệch khỏi mã (rà soát M4). */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const SCHEMA = require('../shared/schema.json');

test('schema.py có đủ cột của schema.json', { skip: (() => { try { execFileSync('python3', ['--version']); return false; } catch { return 'không có python3'; } })() }, () => {
  const py = `import json,sys\nsys.path.insert(0,${JSON.stringify(path.join(__dirname, '..', '..', 'desk'))})\nimport schema\nprint(json.dumps({t[0]:[c[0] for c in schema.columns(t)] for t in schema.TABLES}))`;
  const cols = JSON.parse(execFileSync('python3', ['-I', '-c', py.replace('import json,sys', 'import json,sys')], { encoding: 'utf8' }));
  const missing = [];
  for (const [name, t] of Object.entries(SCHEMA.tables)) for (const c of t.columns) if (!(cols[name] || []).includes(c.name)) missing.push(`${name}.${c.name}`);
  assert.deepEqual(missing, []);
});
