#!/usr/bin/env node
'use strict';
/**
 * Công cụ dòng lệnh chuyển kho dữ liệu (giai đoạn 2 — dành cho thí điểm có kiểm soát; ứng dụng CHƯA có nút trên giao diện).
 *   node tools/migrate-storage.js <thư mục dữ liệu>                      → CHẠY THỬ (dry-run): dựng DB tạm + kiểm chứng, không đổi gì
 *   node tools/migrate-storage.js <thư mục dữ liệu> --apply              → di chuyển thật (đóng ứng dụng trước!): sao lưu an toàn + dựng + kiểm chứng + đổi tên.
 *                                                                          Sau đó đặt "storage": "sqlite" trong dgvc-config.json (hoặc dùng AppContext.migrateStorage)
 *   node tools/migrate-storage.js <thư mục dữ liệu> --export-json <thư mục đích trống>   → xuất ngược SQLite → JSON (đường lui khi đã có giao dịch mới)
 * Kho JSON nguồn không bị sửa hay xóa. Luôn chạy trên BẢN SAO dữ liệu trước khi đụng dữ liệu thật.
 */
const { migrateJsonToSqlite, exportSqliteToJson } = require('../main/repo/migrate/migrate');
const args = process.argv.slice(2); const root = args[0];
if (!root) { console.error('Cách dùng: node tools/migrate-storage.js <thư mục dữ liệu> [--apply | --export-json <đích>]'); process.exit(2); }
(async () => {
  const i = args.indexOf('--export-json');
  if (i >= 0) { const r = await exportSqliteToJson({ root, dest: args[i + 1] }); console.log(JSON.stringify(r, null, 1)); return; }
  const r = await migrateJsonToSqlite({ root, dryRun: !args.includes('--apply'), log: (m) => console.error(`• ${m}`) });
  console.log(JSON.stringify({ verified: r.verified, dryRun: r.dryRun, dbPath: r.dbPath, safetyBackup: r.safetyBackup, sourceUnchanged: r.report.sourceUnchanged, rows: r.report.verification.rows }, null, 1));
  if (r.dryRun) console.error('Chạy thử đạt. Thêm --apply để di chuyển thật.');
})().catch((e) => { console.error(`LỖI ${e.code || ''}: ${e.message}`); process.exit(1); });
