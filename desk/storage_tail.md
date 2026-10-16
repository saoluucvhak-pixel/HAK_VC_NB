
**5 cột audit chung**: `created_at` (✔), `created_by` (username, ✔), `updated_at`, `updated_by`, `row_version` (✔, +1 mỗi lần sửa — chống 2 cửa sổ cùng sửa một bản ghi).

---

## 11. Dữ liệu mẫu (`data_seed.zip`) và kiểm chứng

| Thư mục | Đơn vị bản cài | Hợp đồng | Phiếu cân | Dòng dầu |
|---|---|---|---|---|
| `HAKQN\` | HAKQN | HAKQN-QS (**bên VC**), DH-HAKQN và HAK-HAKQN (bên thuê, chỉ xem) | 326 (17 xe) | 18 (bảng kê CNHAK → HAKQN) |
| `DH\` | Đại Hiệp | DH-HAKQN (**bên VC**) | 77 (5 xe) | 16 (bảng kê HAKQN → ĐH) |
| `HAK\` | HAK | HAK-HAKQN (**bên VC**) | 100 (5 xe) | 13 (bảng kê HAKQN → HAK) |

Cả 3 thư mục có đủ danh mục (5 đơn vị, 17 xe, 12 tuyến, 12 phiên bản giá, 29 tham số) và 2 ADMIN chưa đặt mật khẩu.

**Kiểm chứng**: mở từng thư mục qua `manifest.json` (kiểm SHA-256 từng file) → chạy bộ tính tham chiếu cho hợp đồng mà bản cài là bên VC, kỳ 18–23/09/2026, VC.007:

| Bản cài | Chuyến | Dầu thực nhận | Đơn giá VC | Tổng BKVC (đến đồng) | Excel |
|---|---|---|---|---|---|
| HAKQN | 326 | 5.853 | **178.000** | 1.181.061.043 | 178.000 ✅ |
| ĐH | 77 | 5.734,69 | **88.900** | 139.421.905 | 88.900 ✅ |
| HAK | 100 | 5.088,35 | **125.600** | 253.713.305 | 125.600 ✅ |

`ticket_id` của 77 phiếu ở bản ĐH trùng khớp 77 phiếu xe ĐH ở bản HAKQN → gộp gói không tạo trùng.

---

## 12. Thay đổi so với bản Google Sheets

| Bản Google Sheets / PostgreSQL | Bản desktop |
|---|---|
| 1 file Google Sheets, mỗi bảng 1 sheet | thư mục JSON, mỗi bảng 1 file (bảng lớn 1 file / năm) + manifest SHA-256 |
| LockService + CALC_RUN để rollback thủ công | hàng đợi ghi + journal 2 pha → tự hoàn tác / làm tiếp khi mở lại |
| CacheService | toàn bộ dữ liệu năm hiện tại nằm trong bộ nhớ |
| Đăng nhập Google (email) | tài khoản nội bộ, mật khẩu băm scrypt |
| Nhiều người cùng 1 file | mỗi đơn vị 1 bản cài; trao đổi bằng gói `.dgvc` |
| Sao lưu: phiên bản Google Drive | zip ngày / tháng / thủ công, khôi phục trong APP, tùy chọn sao lưu ra thư mục ngoài |
| `schema_postgres.sql` | **bỏ** (không dùng SQL) |
| SYS_LOG (sheet) | file `logs\app-YYYY-MM-DD.log` |

---

## 13. Cần anh/chị xác nhận

| # | Nội dung | Đề xuất mặc định |
|---|---|---|
| S1 | Bản cài nào làm **gốc danh mục** (xuất gói DANH_MUC khi đổi giá, thêm xe, thêm tuyến) | HAKQN |
| S2 | Thư mục dữ liệu mặc định | `Documents\DGVC_DATA` trên máy; cho đổi sang ổ D: |
| S3 | Có bật **sao lưu ra thư mục ngoài** (USB / Google Drive for Desktop) không | bật nếu máy có Google Drive for Desktop |
