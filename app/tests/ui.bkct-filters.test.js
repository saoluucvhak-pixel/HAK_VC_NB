'use strict';

const test = require('node:test');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright-core');
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');

test('BKCT dùng bộ lọc đã áp dụng cho bảng, In, CSV, PDF và Excel', { skip: !executablePath && 'không có Chromium' }, async () => {
  const browser = await chromium.launch({ executablePath });
  try {
    const page = await browser.newPage();
    await page.evaluate(() => {
      const h = (tag, attrs = {}, ...children) => {
        const el = document.createElement(tag);
        for (const [key, value] of Object.entries(attrs)) {
          if (key === 'onclick') el.onclick = value;
          else if (value !== false) el.setAttribute(key, value);
        }
        el.append(...children.flat());
        return el;
      };
      window.calls = [];
      window.DGVC = {
        h,
        views: {},
        toast() {},
        table: () => h('table'),
        page: (_title, _subtitle, ...parts) => h('main', {}, ...parts),
        async api(action, params) {
          window.calls.push({ action, params });
          if (action === 'periods.list') return { items: [{ period_id: 'KY-DEMO', period_code: 'KY-DEMO', status: 'NHAP' }] };
          if (action === 'reports.bkct') return { rows: [], columns: [], totals: { trips: 0, kg: 0 } };
          return { path: 'fixture-out' };
        }
      };
    });
    await page.addScriptTag({ path: path.resolve(__dirname, '../renderer/views/reports.js') });
    await page.evaluate(async () => document.body.append(await window.DGVC.views.bkct.render({})));
    await page.getByLabel('Biển số').fill('XX-DEMO');
    await page.getByLabel('Số phiếu').fill('TEST-01');
    await page.getByRole('button', { name: 'Lọc', exact: true }).click();
    const clickOutputs = async () => {
      for (const name of ['In', 'Xuất CSV', 'Xuất PDF', 'Xuất Excel']) {
        await page.getByRole('button', { name, exact: true }).click();
      }
    };
    const outputParams = () => page.evaluate(() => window.calls
      .filter((call) => ['reports.print', 'reports.export'].includes(call.action))
      .map((call) => call.params.params));
    const query = () => page.evaluate(() => window.calls.findLast((call) => call.action === 'reports.bkct').params);
    const filtered = { periodId: 'KY-DEMO', plateNo: 'XX-DEMO', q: 'TEST-01' };
    assert.deepEqual(await query(), filtered);
    await page.getByLabel('Biển số').fill('');
    await page.getByLabel('Số phiếu').fill('');
    await clickOutputs();
    assert.deepEqual(await outputParams(), Array(4).fill(filtered));

    await page.getByRole('button', { name: 'Lọc', exact: true }).click();
    const unfiltered = { periodId: 'KY-DEMO', plateNo: '', q: '' };
    assert.deepEqual(await query(), unfiltered);
    await clickOutputs();
    assert.deepEqual(await outputParams(), [...Array(4).fill(filtered), ...Array(4).fill(unfiltered)]);
  } finally {
    await browser.close();
  }
});
