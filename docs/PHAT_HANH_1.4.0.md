# DGVC 1.4.0 — SQLite là kho chính; JSON là sao lưu phụ gửi máy khác

Cơ sở: `main` tại `4b203ba` (1.3.4). Yêu cầu: máy luôn làm việc trên SQLite và tự sao lưu; JSON chỉ là sao lưu phụ để gửi máy khác; khôi phục được từ cả bản SQL lẫn bản JSON.

| Mục | Hành vi 1.4.0 | Ca chứng minh |
|---|---|---|
| Bản cài mới | Tạo kho **SQLite** (`dgvc.sqlite`), cấu hình `storage=sqlite`. Thư mục đồng bộ / ổ mạng (OneDrive…) → tạm dùng JSON và nhắc chuyển thư mục | `tests/storage.default.test.js` |
| Bản cài cũ (JSON) | **Tự nâng cấp** lúc mở app lần đầu: sao lưu trước → dựng → đối chiếu (số dòng, dấu vân tay từng bảng, bộ đếm, tổng từng kỳ đã chốt) → đổi tên → đổi cấu hình; kho JSON cũ giữ nguyên làm dự phòng. Lỗi → vẫn JSON, báo người dùng, không thử lại ở cùng phiên bản app | `autoUpgradeStorage`, test (lỗi giả lập, thư mục đồng bộ, thành công) |
| Tự sao lưu | Hằng ngày (30 bản) / hằng tháng (24) / an toàn trước khi khôi phục; bản SQL là `.zip` chứa `dgvc.db` (ảnh chụp nhất quán) | `tests/app.e2e.test.js`, `storage.appcontext.test.js` |
| Sao lưu phụ JSON | Một file `.zip` (`manifest.json` + `tables/` + `snapshot-info.json` + `backup-info.json`) để gửi máy khác; nút **Sao lưu JSON gửi máy khác…** | `exportJsonShare`, `tests/ui.restorefile.e2e.test.js` |
| Khôi phục | **Khôi phục từ file…** nhận bản SQL (`.zip`) và bản JSON (`.zip` / `manifest.json`); vào kho SQLite qua trình di chuyển có kiểm chứng; máy khác cùng đơn vị cần xác nhận | test: JSON → máy SQLite khác khớp dấu vân tay; SQL → khôi phục |
| Giao diện | Thẻ **Kho dữ liệu**: "SQLite (kho chính)" hoặc "JSON (kho cũ) — Cần nâng cấp"; mục "Nâng cao" chứa chạy thử / quay lại JSON / xuất ngược | `tests/ui.storage.e2e.test.js` |

## Giới hạn / chưa xác minh
- Tự nâng cấp và SQLite chưa được kiểm trên **từng máy Windows của nhà máy** (đường dẫn tiếng Việt, ổ D:, diệt virus); đã kiểm trên Linux/Electron và theo ghi chú 1.3.3 trên Windows với dữ liệu mẫu.
- Thư mục dữ liệu trong OneDrive / Google Drive / ổ mạng: không dùng SQLite được → giữ JSON + nhắc chuyển thư mục.
- `archive\<năm>` chưa nằm trong sao lưu hằng ngày (ghi nhận từ trước, chưa sửa).
