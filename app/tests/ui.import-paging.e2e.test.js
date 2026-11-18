'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { start } = require('../tools/dev-server');
const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

test('Import hơn 5.000 dòng: thấy lỗi cuối lô, phân trang và giữ dòng bỏ qua khi lọc', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 120000 }, async () => {
  const { chromium } = require('playwright-core');
  const server = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  try {
    await page.goto(server.url);
    await page.waitForFunction(() => window.DGVC && window.DGVC.importWizard);
    await page.evaluate(async () => {
      const D = window.DGVC;
      const rows = Array.from({ length: 5202 }, (_, index) => ({
        rowNo: index + 2, status: index === 5201 ? 'ERROR' : 'OK', issues: [],
        normalized: { ticket_no: `PC${index}`, weigh1_date: '2026-09-20', plate_no: '92H-00057', net_kg: 1000, route_code: 'VC.007' }
      }));
      D.api = async (action, input) => {
        if (action === 'import.preview') return { batchId: 'large', summary: { total: rows.length, ok: 5201, error: 1, warning: 0, duplicate: 0 }, mapping: {}, fileName: 'large.xlsx' };
        if (action === 'import.previewRows') return { rows: rows.slice((input.page - 1) * input.pageSize, input.page * input.pageSize), total: rows.length };
        if (action === 'import.confirm') { window.confirmedImport = input; return { inserted: 5200, duplicates: 0 }; }
        if (action === 'import.cancel') return {};
        throw new Error(action);
      };
      await D.importWizard({ importType: 'PHIEU_CAN', filePath: 'large.xlsx' });
    });
    const modal = page.locator('.modal');
    await modal.getByRole('checkbox', { name: 'Bỏ dòng 2', exact: true }).check();
    await modal.getByRole('button', { name: 'Sau ›', exact: true }).click();
    await modal.getByRole('button', { name: '‹ Trước', exact: true }).click();
    assert.equal(await modal.getByRole('checkbox', { name: 'Bỏ dòng 2', exact: true }).isChecked(), true);
    await page.getByLabel('Trạng thái dòng nhập').selectOption('ERROR');
    assert.equal(await modal.getByRole('checkbox', { name: 'Bỏ dòng 5203', exact: true }).isChecked(), true);
    assert.equal(await modal.getByRole('checkbox', { name: 'Bỏ dòng 5203', exact: true }).isDisabled(), true);
    await modal.getByRole('button', { name: 'Xác nhận import 5200 dòng', exact: true }).click();
    const result = await page.evaluate(() => window.confirmedImport);
    assert.deepEqual(result.skipRowNos.sort((a, b) => a - b), [2, 5203]);
  } finally { await browser.close(); await server.close(); }
});
