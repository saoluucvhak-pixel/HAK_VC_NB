# DGVC 1.3.4 — Khôi phục từ file tự chọn, Sao lưu JSON, thẻ Cài đặt dễ đọc

Cơ sở: `main` tại `5ffeeea` (1.3.3). Phản hồi từ người dùng: màn **Cài đặt** đọc không rõ (thẻ "Kho lưu trữ dữ liệu" lẫn nhiều cỡ chữ, thông báo lặp), **không chọn được file để khôi phục** và **chưa có sao lưu JSON**.

## Đã làm
| Mục | Trước | Sau | Ca chứng minh |
|---|---|---|---|
| Khôi phục từ file | Chỉ khôi phục từ danh sách bản sao lưu nằm trong thư mục dữ liệu; không chọn được file ở USB / ổ khác | Nút **Khôi phục từ file…**: chọn `.zip` sao lưu hoặc `manifest.json` của thư mục dữ liệu JSON → xem thông tin (đơn vị, phiên bản dữ liệu, kiểu kho) → nhập lý do → khôi phục (tự sao lưu an toàn trước) | `tests/backup.restorefile.test.js`, `tests/ui.restorefile.e2e.test.js` |
| Bản của máy khác | Bị từ chối cứng khi mã bản cài khác | Cùng đơn vị: cho khôi phục sau khi xác nhận rõ (thay toàn bộ dữ liệu và mã bản cài — dùng khi thay máy); khác đơn vị: từ chối, nói rõ lý do | `E_OTHER_INSTALL`, test |
| Sao lưu JSON | Không có | Nút **Sao lưu JSON ra thư mục…**: bản chụp `manifest.json` + `tables/` + `snapshot-info.json` (thời điểm xuất, phiên bản dữ liệu) ra thư mục trống; kho SQLite: xuất ngược có kiểm chứng | test; khôi phục lại bằng chọn `manifest.json` |
| Kiểm tra file | — | Thư mục JSON thiếu tệp / sai SHA-256 bị chặn trước khi đụng dữ liệu; file `.json` khác tên bị từ chối kèm hướng dẫn | test |
| Thẻ "Kho lưu trữ dữ liệu" | Cỡ chữ lẫn lộn, một cảnh báo hiện hai lần, nút tắt mờ | Một cỡ chữ (14 px), một thông báo, nút tắt rõ hơn; chữ `small` toàn app 12 → 13 px | ảnh chụp, `tests/ui.restorefile.e2e.test.js` |
| Đặc tả | `data.restore` ghi `backupPath` nhưng mã đọc `file` | Sửa đặc tả; thêm `data.inspectBackup`, `data.exportJson` (ADMIN) | `tests/spec.routes.test.js` |

## Giới hạn
- Chưa kiểm trên Windows thật (hộp thoại chọn file của Windows, đường dẫn tiếng Việt). Logic chọn file đã kiểm bằng dev-server (giả lập hộp thoại).
- Khôi phục bản sao lưu SQLite vào kho JSON vẫn bị từ chối (cần "Xuất ngược ra JSON" trước) — không đổi.

## Bổ sung: thẻ SQLite thu gọn mặc định
Thẻ "Đổi cách lưu dữ liệu sang SQLite (thí điểm)" bị người dùng hiểu nhầm là chức năng sao lưu (và nút bị tắt khi thư mục dữ liệu nằm trong OneDrive). Nay nằm trong mục **Nâng cao** thu gọn, ghi rõ "không phải sao lưu, không cần dùng"; tự mở khi bản cài đã dùng SQLite. Sao lưu thật nằm ở thẻ **Sao lưu** phía trên.
