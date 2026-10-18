# TEST PLAN

Chạy: `npm test` (node:test). Kiểm chứng Excel: `npm run validate -- "<file.xlsx>"`.

## 1. Đã có (24 test PASS)
| Nhóm (MASTER_PROMPT XXXV) | Test | File |
|---|---|---|
| kg → tấn, tính tiền, VAT (không hard-code 8%) | `kg → tấn, thành tiền, VAT lấy từ bảng giá` | engine.test.js |
| đơn giá theo chuyến | `đơn giá theo chuyến` | engine.test.js |
| bảng giá theo ngày, giá đổi giữa kỳ | `bảng giá theo ngày & giá thay đổi giữa kỳ` | engine.test.js |
| nhiều bảng giá cùng hiệu lực / không có giá | `NO_PRICE … MULTIPLE_PRICE` | engine.test.js |
| ưu tiên giá riêng đơn vị; giá ngừng | 2 test | engine.test.js |
| giá dầu thay đổi (tăng/giảm), khớp Excel | 2 test | engine.test.js |
| làm tròn kiểu Excel; GROUP vs TICKET | 2 test | engine.test.js |
| xe chưa xác định; xe đổi đơn vị theo thời gian | 2 test | engine.test.js |
| KL/nơi xuất không hợp lệ | 1 test | engine.test.js |
| chốt kỳ (engine trả snapshot) | `phiếu đã chốt…` | engine.test.js |
| duplicate phiếu; import cùng file 2 lần; trùng trong file | 2 test | engine.test.js |
| timeline xe & cảnh báo thời gian | 1 test | engine.test.js |
| chuẩn hóa biển số; đọc ngày giờ; dò header | 3 test | engine.test.js |
| migration chạy/idempotent/rollback; khóa trùng DB; trigger chốt & mở khóa | 4 test | migration.test.js |

## 2. Kiểm chứng với Excel mẫu (Phase 12) — ✅ đã chạy
`docs/EXCEL_VS_APP_VALIDATION.md`: giá dầu 9/9 chỉ tiêu, 3 sheet tổng hợp × 6 chỉ tiêu, từng xe 109/109, tổng HHH/HAK/nơi xuất 10/10 → **khớp 100%**.

## 3. Sẽ bổ sung theo phase
| Phase | Test |
|---|---|
| 4 Import | .xls và .csv; ngày + giờ 2 cột; header dòng bất kỳ; file 200k dòng < 30s; rollback khi lỗi giữa chừng; hoàn tác batch; batch có phiếu đã chốt không hoàn tác được |
| 5 Phiếu cân | sửa phiếu ghi audit; chuyển đợt; KEY_CONFLICT → Giữ/Cập nhật/Bỏ qua |
| 6 Giá | kỳ điều chỉnh sinh bảng giá đúng hiệu lực; đóng den_ngay bảng cũ; cảnh báo chồng lấn; giá đã chốt không đổi |
| 7 Engine + DB | tính lại hàng loạt chỉ phiếu chưa chốt; gán xe chưa xác định → tính lại |
| 9 Đối chiếu | khớp theo số phiếu; theo biển số+ngày+KL; lệch KL; lệch giá; lệch tiền; lệch VAT; thiếu A; thiếu B; trùng; nhiều cột lệch cùng lúc |
| 11 | chốt kỳ snapshot; mở khóa (lý do, audit), chốt lại; backup/restore; retention |
| 13–14 | smoke test bản Portable & Setup trên Windows 10/11 không Internet |

## UI e2e (v0.3.0)
`npm run test:ui` — dev server + Chromium: nạp dữ liệu mẫu → import danh mục xe → import 2.035 phiếu → duyệt 20 màn hình, chụp vào `docs/screenshots/`, thất bại nếu có lỗi console/pageerror. Kết quả: 2.035 phiếu, 0 lỗi.

## Đối chiếu (v0.4.0)
`tests/reconciliation.test.js`: matchRows (khớp, lệch nhiều cột, thiếu A/B, trùng B, khớp biển số+ngày+KL, nhiều ứng viên) và end-to-end: bảng kê HAK dựng từ hệ thống + 4 lỗi cài sẵn → 104 khớp, 1 lệch KL, 1 lệch đơn giá, 1 thiếu bên A, 1 thiếu bên B; bảng kê HAK vẫn 416.454.167 đ (đối chiếu không sửa phiếu).
