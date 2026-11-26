'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');
const lock = require('../package-lock.json');

test('Phiên bản ứng dụng, lockfile, bộ cài và README đồng bộ', () => {
  const root = path.join(__dirname, '..', '..');
  const installer = fs.readFileSync(path.join(root, 'app', 'installer', 'dgvc.nsi'), 'utf8');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.equal(lock.version, pkg.version, 'Phiên bản gốc trong lockfile');
  assert.equal(lock.packages[''].version, pkg.version, 'Phiên bản package trong lockfile');
  assert.equal(installer.match(/^!define VERSION "([^"]+)"/m)?.[1], pkg.version, 'Phiên bản NSIS');
  assert.equal(readme.match(/Bản hiện tại: \*\*([^*]+)\*\*/)?.[1], pkg.version, 'Phiên bản ghi ở README');
});
