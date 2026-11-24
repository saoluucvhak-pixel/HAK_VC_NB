'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { assertSafeOpenPath, ALLOWED_EXTENSIONS } = require('../main/app/openPathPolicy');
const { Router } = require('../main/api/router');

test('assertSafeOpenPath policy rules', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-openpath-test-'));

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Tạo các file kiểm thử
  const allowedFile = path.join(tmpDir, 'report.xlsx');
  const allowedCsv = path.join(tmpDir, 'data.csv');
  const allowedPdf = path.join(tmpDir, 'doc.pdf');
  const subDir = path.join(tmpDir, 'subfolder');
  const forbiddenExe = path.join(tmpDir, 'malicious.exe');
  const forbiddenBat = path.join(tmpDir, 'script.bat');
  const forbiddenHtml = path.join(tmpDir, 'page.html');

  fs.writeFileSync(allowedFile, 'dummy excel content');
  fs.writeFileSync(allowedCsv, 'dummy csv content');
  fs.writeFileSync(allowedPdf, 'dummy pdf content');
  fs.mkdirSync(subDir);
  fs.writeFileSync(forbiddenExe, 'dummy exe');
  fs.writeFileSync(forbiddenBat, 'echo 1');
  fs.writeFileSync(forbiddenHtml, '<html></html>');

  // Cho phép thư mục và các định dạng tài liệu trong danh sách
  assert.equal(assertSafeOpenPath(allowedFile), path.resolve(allowedFile));
  assert.equal(assertSafeOpenPath(allowedCsv), path.resolve(allowedCsv));
  assert.equal(assertSafeOpenPath(allowedPdf), path.resolve(allowedPdf));
  assert.equal(assertSafeOpenPath(subDir), path.resolve(subDir));

  // Chặn các định dạng nguy hiểm
  assert.throws(() => assertSafeOpenPath(forbiddenExe), (err) => err.code === 'FORBIDDEN');
  assert.throws(() => assertSafeOpenPath(forbiddenBat), (err) => err.code === 'FORBIDDEN');
  assert.throws(() => assertSafeOpenPath(forbiddenHtml), (err) => err.code === 'FORBIDDEN');

  // Chặn đường dẫn không tồn tại
  assert.throws(() => assertSafeOpenPath(path.join(tmpDir, 'non_existent.xlsx')), (err) => err.code === 'NOT_FOUND');

  // Chặn tham số không hợp lệ
  assert.throws(() => assertSafeOpenPath(''), (err) => err.code === 'VALIDATION_FAILED');
  assert.throws(() => assertSafeOpenPath(null), (err) => err.code === 'VALIDATION_FAILED');
  assert.throws(() => assertSafeOpenPath('path\0withnull'), (err) => err.code === 'VALIDATION_FAILED');
});

test('Router system.openPath integrates policy check with host mock', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-openpath-router-'));
  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const validXlsx = path.join(tmpDir, 'valid.xlsx');
  const dangerExe = path.join(tmpDir, 'danger.exe');
  fs.writeFileSync(validXlsx, 'content');
  fs.writeFileSync(dangerExe, 'content');

  let hostOpenCalls = 0;
  const mockHost = {
    openPath: async (p) => {
      hostOpenCalls++;
      return { ok: true, path: p.path };
    }
  };

  const mockCtx = {
    store: { dataVersion: 1, mountedYears: () => [] },
    svc: {
      auth: {
        check: (token) => {
          if (token === 'ADMIN_TOKEN') return { user: { role: 'ADMIN', username: 'admin' } };
          throw new Error('AUTH_FAILED');
        }
      },
      backup: {
        autoDaily: async () => {}
      }
    }
  };
  const router = new Router(mockCtx, { host: mockHost, log: () => {} });

  // Gọi hợp lệ với vai trò ADMIN (AKX)
  const successRes = await router.handle('system.openPath', { path: validXlsx }, 'ADMIN_TOKEN');
  assert.equal(successRes.ok, true);
  assert.equal(hostOpenCalls, 1);

  // Gọi với file .exe -> Router phải chặn trước khi tới host, không tăng hostOpenCalls
  const failRes = await router.handle('system.openPath', { path: dangerExe }, 'ADMIN_TOKEN');
  assert.equal(failRes.ok, false);
  assert.equal(failRes.error.code, 'FORBIDDEN');
  assert.equal(hostOpenCalls, 1);
});
