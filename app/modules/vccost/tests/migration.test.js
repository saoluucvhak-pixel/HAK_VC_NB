'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { migrate, currentVersion } = require('../src/database/migrator');

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

test('migration chạy được (v1→v2), idempotent, có đủ bảng & index', () => {
  const db = freshDb();
  const r1 = migrate(db);
  assert.equal(r1.to, 4);
  const cols = db.prepare('PRAGMA table_info(don_vi_van_chuyen)').all().map((c) => c.name);
  for (const c of ['dai_dien', 'ke_toan', 'so_hop_dong', 'ngay_hop_dong', 'so_tai_khoan', 'ten_in_bao_cao', 'noi_ky']) assert.ok(cols.includes(c), `thiếu cột ${c}`);
  const r2 = migrate(db);
  assert.equal(r2.applied.length, 0);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((x) => x.name);
  for (const t of ['phieu_can', 'xe', 'xe_don_vi_lich_su', 'don_vi_van_chuyen', 'dia_diem', 'tuyen_van_chuyen', 'bang_gia_van_chuyen',
    'gia_dau', 'ky_dieu_chinh_gia_dau', 'dot_van_chuyen', 'import_batch', 'import_batch_row', 'chot_ky', 'chot_ky_snapshot',
    'doi_chieu_batch', 'doi_chieu_dong_b', 'doi_chieu_ket_qua', 'canh_bao', 'audit_log', 'backup_log', 'settings']) {
    assert.ok(tables.includes(t), `thiếu bảng ${t}`);
  }
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='phieu_can'").all().map((x) => x.name);
  for (const i of ['ix_phieu_so_phieu', 'ix_phieu_bien_so', 'ix_phieu_ngay', 'ix_phieu_dvvc', 'ix_phieu_tuyen', 'ix_phieu_noi_xuat', 'ix_phieu_dot', 'ix_phieu_batch', 'ux_phieu_business_key']) {
    assert.ok(idx.includes(i), `thiếu index ${i}`);
  }
});

test('khóa chống trùng ở tầng DB + cột sinh tự động kl tấn', () => {
  const db = freshDb(); migrate(db);
  const ins = db.prepare(`INSERT INTO phieu_can(so_phieu, ngay_gio_can_1, kl_hang_kg, business_key, strong_key, fingerprint)
                          VALUES (?, '2026-10-01T08:00:00', 20090, ?, 'x', 'f')`);
  ins.run('0123', '0123|QUẾ SƠN');
  assert.throws(() => ins.run('0123', '0123|QUẾ SƠN'), /UNIQUE/);
  const row = db.prepare('SELECT so_phieu, kl_hang_tan, ngay_can FROM phieu_can').get();
  assert.equal(row.so_phieu, '0123');      // giữ số 0 đầu
  assert.equal(row.kl_hang_tan, 20.09);
  assert.equal(row.ngay_can, '2026-10-01');
});

test('trigger chặn sửa tài chính phiếu đã chốt', () => {
  const db = freshDb(); migrate(db);
  db.exec(`INSERT INTO phieu_can(so_phieu, kl_hang_kg, don_gia, business_key, strong_key, fingerprint, chot_ky_id)
           VALUES ('1', 20000, 116700000, 'k', 's', 'f', 1)`);
  assert.throws(() => db.exec("UPDATE phieu_can SET don_gia = 1 WHERE so_phieu='1'"), /đã chốt/);
  db.exec("UPDATE phieu_can SET chot_ky_id = NULL WHERE so_phieu='1'");   // mở khóa
  db.exec("UPDATE phieu_can SET don_gia = 1 WHERE so_phieu='1'");         // giờ sửa được
  assert.equal(db.prepare("SELECT don_gia FROM phieu_can").get().don_gia, 1);
});

test('migration lỗi thì rollback, không làm hỏng DB', () => {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  fs.copyFileSync(path.join(__dirname, '..', 'src', 'database', 'migrations', '001_init.sql'), path.join(dir, '001_init.sql'));
  fs.writeFileSync(path.join(dir, '002_bad.sql'), "ALTER TABLE xe ADD COLUMN mau_xe TEXT; SELECT * FROM bang_khong_ton_tai;");
  const db = freshDb();
  assert.throws(() => migrate(db, { dir }), /rollback/);
  assert.equal(currentVersion(db), 1);
  const cols = db.prepare("PRAGMA table_info(xe)").all().map((c) => c.name);
  assert.ok(!cols.includes('mau_xe'));
});
