'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');
const { AppContext } = require('../main/app/AppContext');

const home = process.env.DGVC_TEST_HOME;
assert.ok(home && process.env.DGVC_EXECUTABLE, 'Cần kho thử và đường dẫn chương trình đã cài');
const configFile = path.join(home, 'userData', 'dgvc-config.json');
const financialTables = ['PHIEU_CAN', 'GIAO_NHAN_DAU', 'KY_TINH', 'CALC_RUN', 'TRANSPORT_DETAIL', 'FUEL_DETAIL', 'TRANSPORT_CALCULATION', 'BKVC_LINE'];
const snapshot = (store) => {
  const tables = store.snapshot().tables;
  return Object.fromEntries(financialTables.map((name) => [name, tables[name]]));
};

(async () => {
  const ctx = new AppContext({ configFile });
  ctx.open();
  await ctx.migrated;
  const before = snapshot(ctx.store);
  assert.ok(before.PHIEU_CAN.length && before.GIAO_NHAN_DAU.length && before.KY_TINH.length, 'Kho cũ phải có dữ liệu nghiệp vụ');
  assert.ok(before.KY_TINH.some((period) => period.status === 'DA_KHOA'), 'Kho cũ phải có kỳ đã khóa');
  const user = { username: 'acceptance', role: 'ADMIN' };
  const backup = await ctx.svc.backup.backup({ kind: 'manual', note: 'truoc-nang-cap-windows', user });
  ctx.close();

  const app = await electron.launch({ executablePath: process.env.DGVC_EXECUTABLE, args: ['--no-sandbox'],
    env: { ...process.env, DGVC_USER_DATA: path.join(home, 'userData'), DGVC_DOCUMENTS: path.join(home, 'Documents') } });
  try {
    const window = await app.firstWindow();
    window.setDefaultTimeout(30000);
    await window.getByLabel('Tên đăng nhập').fill('saoluucvhak@gmail.com');
    await window.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026');
    await window.getByRole('button', { name: 'Vào phần mềm' }).click();
    await window.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    await window.getByRole('button', { name: 'Bảng xác nhận KL' }).first().click();
    await window.locator('.money', { hasText: '139.421.905' }).waitFor();
    const output = path.join(home, 'BKVC-sau-nang-cap.xlsx');
    await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, output);
    await window.getByRole('button', { name: 'Xuất Excel', exact: true }).first().click();
    await window.locator('.toast', { hasText: 'Đã xuất' }).first().waitFor();
    assert.ok(fs.statSync(output).size > 1000);
  } finally { await app.close(); }

  ctx.open();
  await ctx.migrated;
  assert.deepEqual(snapshot(ctx.store), before, 'Cài đè và mở lại phải giữ nguyên toàn bộ dữ liệu tính tiền');
  const restored = await ctx.svc.backup.restore({ file: backup.file, reason: 'nghiem-thu-windows', user });
  ctx.replaceStore(restored.store);
  assert.deepEqual(snapshot(ctx.store), before, 'Khôi phục phải giữ nguyên dữ liệu tính tiền');
  ctx.close();
  console.log(`WINDOWS UPGRADE OK — ${before.PHIEU_CAN.length} phiếu, ${before.GIAO_NHAN_DAU.length} dòng dầu, tổng BKVC 139.421.905 đ; Excel, backup/restore khớp`);
})().catch((error) => { console.error(error); process.exit(1); });
