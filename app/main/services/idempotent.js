'use strict';
/**
 * Chống thao tác lặp CHẠY ĐỒNG THỜI (bấm đúp, hai cửa sổ, gửi lại khi yêu cầu đầu còn đang ghi):
 * cùng clientRequestId đang chạy → trả CHÙNG MỘT kết quả (không chạy lần hai). Kết quả đã xong vẫn do bảng `done` của dịch vụ giữ (kho SQLite: bền qua khởi động lại).
 * Lỗi rà soát 1.3.0: trước đây chỉ kiểm `done` SAU khi xong → hai yêu cầu cùng id gửi gần như cùng lúc đều chạy → nhập dầu bị nhân đôi.
 */
function idempotentMethod(obj, name) {
  const orig = obj[name].bind(obj); const inflight = new Map();
  obj[name] = (args = {}) => {
    const id = args && args.clientRequestId;
    if (!id) return orig(args);
    if (obj.done.has(id)) return Promise.resolve(obj.done.get(id));
    if (inflight.has(id)) return inflight.get(id);
    const p = Promise.resolve().then(() => orig(args)).finally(() => inflight.delete(id));
    inflight.set(id, p);
    return p;
  };
}
module.exports = { idempotentMethod };
