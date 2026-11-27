'use strict';
/**
 * Hợp đồng `Storage` — những gì MỌI loại kho (JsonStore hiện nay, SqliteStore sau này) phải cung cấp. Dịch vụ, router và công cụ
 * chỉ được dùng các thành viên liệt kê ở đây (không chạm `.data`, `.pk`, `.manifest`, `.mounted`…). Có test chung: tests/storage.contract.test.js.
 *
 * Đọc:      get(table, id) · all(table) · find(table, pred)
 * Ghi:      transaction(async (tx) => …, { user, device })  — tuần tự, tất cả-hoặc-không; tx: insert / update(…, { expectedRowVersion }) / remove /
 *           removeMany / restoreRows / get / all / nextId / audit / setManifest
 * Định danh: unitCode · installCode · installId · dataVersion · loginSettings · archives · archivedThrough · root (vị trí lưu)
 * Vòng đời: open() · close() · compact() · needsCompaction · queue (Promise hàng đợi ghi)
 * Chống bấm hai lần: requestMap(ns) → Map-like {has, get, set} (JSON: RAM; SQLite: bền qua bảng _request)
 * Lớp phủ năm lưu trữ (chỉ đọc): mountedYears() · isYearMounted(y) · hasMounted · mountRows(y, {bảng: [dòng]}) · unmountYear(y) · isMountedRow(t, id)
 * Bản chụp:  snapshot() · fingerprint() · stats() (số tệp / số dòng từng bảng cho kiểm tra sức khỏe)
 *             — cùng định nghĩa `canon` cho mọi kho, dùng để so kho JSON ↔ SQLite
 */
const STORAGE_MEMBERS = {
  methods: ['requestMap', 'get', 'all', 'find', 'transaction', 'open', 'close', 'compact', 'mountedYears', 'isYearMounted', 'mountRows', 'unmountYear', 'isMountedRow', 'snapshot', 'fingerprint', 'stats'],
  getters: ['unitCode', 'installCode', 'installId', 'storageKind', 'schemaVersion', 'dataVersion', 'loginSettings', 'archives', 'archivedThrough', 'needsCompaction', 'hasMounted'],
  fields: ['root', 'queue'],
};
const TX_METHODS = ['insert', 'update', 'remove', 'removeMany', 'restoreRows', 'get', 'all', 'nextId', 'audit', 'setManifest'];

/** Trả danh sách thành viên còn thiếu (rỗng = đạt hợp đồng). */
function missingMembers(store) {
  const miss = [];
  for (const m of STORAGE_MEMBERS.methods) if (typeof store[m] !== 'function') miss.push(m);
  for (const g of STORAGE_MEMBERS.getters) if (!(g in store)) miss.push(g);
  for (const f of STORAGE_MEMBERS.fields) if (!(f in store)) miss.push(f);
  return miss;
}
module.exports = { STORAGE_MEMBERS, TX_METHODS, missingMembers };
