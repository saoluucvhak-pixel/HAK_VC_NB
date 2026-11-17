'use strict';
/**
 * Nhà máy tạo kho theo loại. Hiện chỉ có 'json'; loại khác (vd 'sqlite') đăng ký thêm ở đây khi triển khai (giai đoạn 1 của kế hoạch lưu trữ).
 * Chọn loại cho test / công cụ: biến môi trường DGVC_STORAGE (mặc định 'json'). Ứng dụng thật luôn dùng 'json' cho tới khi có quyết định chuyển.
 */
const { JsonStore } = require('./JsonStore');
const KINDS = { json: { Store: JsonStore, create: (root, info) => JsonStore.create(root, info) } };
const kindOf = (kind) => kind || process.env.DGVC_STORAGE || 'json';
function storageKinds() { return Object.keys(KINDS); }
function storeClass(kind) { const k = KINDS[kindOf(kind)]; if (!k) throw new Error(`Loại kho chưa hỗ trợ: ${kindOf(kind)}`); return k.Store; }
/** Tạo thư mục dữ liệu rỗng cho 1 bản cài. */
function createStorage(root, info, kind) { const k = KINDS[kindOf(kind)]; if (!k) throw new Error(`Loại kho chưa hỗ trợ: ${kindOf(kind)}`); return k.create(root, info); }
/** Tạo đối tượng kho (chưa mở). */
function newStore(root, opts, kind) { const C = storeClass(kind); return new C(root, opts); }
module.exports = { storageKinds, storeClass, createStorage, newStore };
