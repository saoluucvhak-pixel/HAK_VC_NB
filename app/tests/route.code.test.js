'use strict';
/** Giá 3 tầng (đợt 2, Task 4): mã tuyến gợi ý kế tiếp + "Ngày cập nhật" của tuyến. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { install, KETOAN } = require('./install');
const { CatalogService } = require('../main/services/CatalogService');

const today = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const R = (code, over = {}) => ({ routeCode: code, routeName: `Tuyến thử ${code}`, distanceKm: 10, uom: 'TAN', ...over });
async function setup() { const ctx = await install('DH', { withData: false }); return { ...ctx, cat: new CatalogService(ctx.store) }; }
const insertRoutes = (s, codes) => s.store.transaction((tx) => { for (const c of codes) if (!tx.get('TUYEN_VC', c)) tx.insert('TUYEN_VC', { route_code: c, route_name: `Mẫu ${c}`, distance_km: 5, trip_distance_km: 10, from_place: '', to_place: '', uom: 'TAN', catalog_unit_code: s.store.unitCode, note: '', is_active: true }); }, { user: 'test' });

test('nextRouteCode: VC. + (số lớn nhất dạng VC.nnn + 1), 3 chữ số; bỏ qua mã không đúng dạng', async () => {
  const s = await setup();
  await insertRoutes(s, Array.from({ length: 16 }, (_, i) => `VC.${String(i + 1).padStart(3, '0')}`));
  const have = s.store.all('TUYEN_VC').map((r) => r.route_code).filter((c) => /^VC\.\d+$/.test(c)).map((c) => Number(c.slice(3)));
  assert.equal(s.cat.nextRouteCode().routeCode, `VC.${String(Math.max(...have) + 1).padStart(3, '0')}`);
  await insertRoutes(s, ['VC.042', 'VC.A9', 'XX.100', 'VC.7']); // chỉ VC.nnn số mới tính; VC.7 vẫn là số 7
  assert.equal(s.cat.nextRouteCode().routeCode, `VC.${String(Math.max(...have, 42) + 1).padStart(3, '0')}`);
});

test('nextRouteCode: danh mục trống → VC.001', async () => {
  const fake = { store: { all: () => [] } }; assert.equal(CatalogService.prototype.nextRouteCode.call(fake).routeCode, 'VC.001');
});

test('Tạo tuyến: mã đã có → DUPLICATE không ghi đè; hai máy cùng gợi ý một mã → máy sau bị DUPLICATE, bản trước nguyên vẹn', async () => {
  const s = await setup(); const code = s.cat.nextRouteCode().routeCode; const again = s.cat.nextRouteCode().routeCode; assert.equal(code, again);
  const a = await s.cat.saveRoute({ create: true, record: R(code, { routeName: 'Do máy A' }), user: KETOAN });
  assert.ok(a.warnings.some((w) => w.code === 'I_SYNC_REMINDER'), 'nhắc sửa giống ở các nhà máy còn lại');
  await assert.rejects(() => s.cat.saveRoute({ create: true, record: R(code, { routeName: 'Do máy B' }), user: KETOAN }), (e) => e.code === 'DUPLICATE');
  assert.equal(s.store.get('TUYEN_VC', code).route_name, 'Do máy A');
  assert.notEqual(s.cat.nextRouteCode().routeCode, code, 'sau khi tạo, gợi ý chuyển sang mã kế tiếp');
});

test('catalogDate: mặc định ngày hệ thống, điền tay được, sai định dạng → VALIDATION_FAILED; sửa tuyến cập nhật ngày', async () => {
  const s = await setup();
  const a = await s.cat.saveRoute({ create: true, record: R('VC.901'), user: KETOAN }); assert.equal(a.record.catalog_date, today());
  const b = await s.cat.saveRoute({ create: true, record: R('VC.902', { catalogDate: '2026-01-15' }), user: KETOAN }); assert.equal(b.record.catalog_date, '2026-01-15');
  await assert.rejects(() => s.cat.saveRoute({ create: true, record: R('VC.903', { catalogDate: '15/01/2026' }), user: KETOAN }), (e) => e.code === 'VALIDATION_FAILED');
  const e1 = await s.cat.saveRoute({ record: { routeCode: 'VC.902', routeName: 'Đổi tên' }, rowVersion: b.record.row_version, user: KETOAN });
  assert.equal(e1.record.catalog_date, today(), 'sửa tuyến → ngày chỉnh sửa gần nhất');
  const e2 = await s.cat.saveRoute({ record: { routeCode: 'VC.902', catalogDate: '2026-02-01' }, rowVersion: e1.record.row_version, user: KETOAN });
  assert.equal(e2.record.catalog_date, '2026-02-01', 'điền tay khi sửa');
  assert.deepEqual(e2.affectedPeriods, [], 'đổi ngày cập nhật không bắt tính lại kỳ');
});

test('Tuyến cũ (không có catalog_date) hiển thị bằng ngày của updated_at / created_at', async () => {
  const s = await setup(); await insertRoutes(s, ['VC.777']);
  const row = s.store.get('TUYEN_VC', 'VC.777'); assert.ok(!row.catalog_date);
  const item = s.cat.listRoutes({}).items.find((r) => r.route_code === 'VC.777');
  assert.equal(item.catalogDate, String(row.updated_at || row.created_at).slice(0, 10));
  const withDate = await s.cat.saveRoute({ create: true, record: R('VC.778', { catalogDate: '2026-03-03' }), user: KETOAN });
  assert.equal(s.cat.listRoutes({}).items.find((r) => r.route_code === 'VC.778').catalogDate, '2026-03-03'); void withDate;
});
