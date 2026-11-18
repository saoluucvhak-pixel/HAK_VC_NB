'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { start } = require('../tools/dev-server');
const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

test('Điều hướng chậm: không bấm được hành động màn cũ; phản hồi cũ không thay màn mới', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 120000 }, async () => {
  const { chromium } = require('playwright-core');
  const server = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  try {
    await page.goto(server.url);
    await page.getByText('Bước 1 — Thư mục dữ liệu', { exact: true }).waitFor();
    await page.evaluate(async () => {
      const D = window.DGVC;
      D.state.boot = { install: { unitCode: 'DH' }, user: { username: 'test', role: 'ADMIN' } };
      D.state.params = {};
      window.oldActionClicks = 0;
      window.renderCounts = { A: 0, B: 0, C: 0 };
      for (const name of ['A', 'B', 'C']) D.views[`test${name}`] = {
        render: async () => { window.renderCounts[name]++; return D.page(`Màn ${name}`, '', [D.h('button', { onclick: () => window.oldActionClicks++ }, `Hành động ${name}`)]); }
      };
      D.api = async () => ({ total: 0, problems: 0 });
      D.state.view = 'testA';
      await D.render();
    });
    await page.getByRole('heading', { name: 'Màn A', exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('button', { name: 'Hành động A', exact: true }).click();
    assert.equal(await page.evaluate(() => window.oldActionClicks), 1);
    await page.evaluate(() => {
      const D = window.DGVC;
      window.oldActionClicks = 0;
      let pause = true;
      D.api = async (action) => {
        if (action === 'sync.list' && pause) {
          pause = false;
          await new Promise((resolve) => { window.resumeNavigation = resolve; });
        }
        return { total: 0, problems: 0 };
      };
      D.state.view = 'testB';
      window.pendingNavigation = D.render();
    });
    await page.getByRole('button', { name: 'Hành động A', exact: true }).click({ timeout: 1500 }).catch(() => {});
    assert.equal(await page.evaluate(() => window.oldActionClicks), 0, 'Hành động màn cũ phải bị chặn khi đang đổi màn');
    await page.evaluate(async () => {
      const D = window.DGVC;
      D.state.view = 'testC';
      await D.render();
      window.resumeNavigation();
      await window.pendingNavigation;
    });
    assert.equal(await page.getByRole('heading', { name: 'Màn C', exact: true }).count(), 1);
    assert.equal(await page.getByRole('heading', { name: 'Màn B', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.renderCounts.C), 1, 'Phản hồi điều hướng cũ không được dựng lại màn C');
    assert.equal(await page.locator('main').evaluate((element) => element.inert), false);
  } finally { await browser.close(); await server.close(); }
});
