# PROJECT SPEC — Hệ thống quản lý chi phí vận chuyển offline

## Mục tiêu
IMPORT → KIỂM SOÁT → TÍNH GIÁ → THEO DÕI XE → ĐỐI CHIẾU → PHÂN TÍCH → BÁO CÁO → TRUY VẾT, chạy hoàn toàn offline trên Windows, thay cho file Excel "Tổng hợp chi phí VC" theo từng đợt tàu.

## Phạm vi
| Có | Không (giai đoạn này) |
|---|---|
| Phiếu cân, danh mục, bảng giá, giá dầu, tính chi phí, tổng hợp, timeline xe, đối chiếu, dashboard, cảnh báo, chốt kỳ, audit, backup, xuất Excel | Nhiều người dùng đồng thời qua mạng, phân quyền chi tiết, đồng bộ đám mây, kết nối trực tiếp phần mềm trạm cân |

## Người dùng
Kế toán / nhân viên điều độ vận tải của HAK Group — 1 máy, 1 người dùng tại một thời điểm (cột `user_name` trong audit để sẵn cho mở rộng).

## Kiến trúc
Electron (main: DB + services + file; renderer: UI; preload: IPC an toàn) · SQLite (better-sqlite3) · SheetJS (đọc) · ExcelJS (ghi) · decimal.js · Tabulator · Chart.js · electron-builder (Portable + NSIS). Toàn bộ thư viện đóng gói cục bộ.

## Tài liệu liên quan
PHAN_TICH_THIET_KE_A-H · DATABASE_SCHEMA · BUSINESS_RULES · IMPORT_SPEC · PRICE_ENGINE_SPEC · RECONCILIATION_SPEC · UI_SPEC · TEST_PLAN · EXCEL_VS_APP_VALIDATION · TODO_ROADMAP · CHANGELOG.

## Tiêu chí hoàn thành
20 tiêu chí ở MASTER_PROMPT mục XLI; theo dõi trạng thái tại TODO_ROADMAP.
