# DATABASE SCHEMA (v1)

SQL nguồn: `src/database/migrations/001_init.sql` — đã chạy & test (`tests/migration.test.js`).

## Quy ước
- Ngày `TEXT 'YYYY-MM-DD'`; ngày giờ `TEXT 'YYYY-MM-DDTHH:MM:SS'` (giờ địa phương).
- **Tiền & đơn giá: INTEGER × 1000** (`settings.money_scale = 1000`). VD 116.700 đ/tấn lưu `116700000`; 297.219.869,04 lưu `297219869040`. SUM trong SQL luôn chính xác.
- KL: `kl_hang_kg NUMERIC`; `kl_hang_tan` là cột sinh (`kg/1000`).
- Số phiếu, biển số: TEXT (không mất số 0 đầu).
- Không xóa cứng: `trang_thai` (ACTIVE/INACTIVE/VOID) + `audit_log`.

## Bảng
| Bảng | Mục đích | Khóa/ràng buộc chính |
|---|---|---|
| schema_version | Phiên bản schema | version PK |
| settings | Cấu hình (làm tròn, khóa trùng, ngưỡng thời gian, backup) | key PK |
| don_vi_van_chuyen | Đơn vị VC (ma, ten, MST, địa chỉ, liên hệ, `nhom_bao_cao`) | ma UNIQUE |
| xe | Xe (`bien_so_chuan` UNIQUE, `bien_so_hien_thi`, loại, tải trọng) | |
| xe_don_vi_lich_su | Xe → đơn vị theo `tu_ngay`/`den_ngay` | CHECK tu ≤ den |
| v_xe_hien_tai (view) | Xe + đơn vị đang hiệu lực hôm nay | |
| dia_diem / dia_diem_alias | Nhà máy, cảng… + tên gọi khác trong file nguồn | ma UNIQUE / alias UNIQUE |
| tuyen_van_chuyen | Nơi xuất → nơi đến, km | 1 tuyến ACTIVE / cặp địa điểm |
| gia_dau | Giá dầu theo ngày + loại dầu | (ngay, loai_dau) UNIQUE |
| ky_dieu_chinh_gia_dau | Kỳ tham chiếu giá dầu, giá BQ, ngày áp dụng, công văn | ma_ky UNIQUE |
| bang_gia_van_chuyen | Bảng giá: tuyến, (đơn vị), (loại hàng), hiệu lực, phương thức, đơn giá gốc/điều chỉnh/áp dụng, đơn vị tính, VAT%, tham số dầu, `cong_thuc` JSON | ma UNIQUE, CHECK hiệu lực |
| dot_van_chuyen | Đợt/tàu: tên tàu, voyage, từ–đến, khách hàng, nơi giao, KL giám định, MO/KHOA | ma_dot UNIQUE |
| import_batch | Mỗi lần import: file, hash, sheet, header, mapping, đếm mới/trùng/xung đột/lỗi/cập nhật | |
| import_batch_row | Mọi dòng của mỗi batch: phân loại, hành động, phiếu liên quan, dữ liệu cũ/mới, lỗi | |
| phieu_can | Phiếu cân + kết quả tính giá (xem dưới) | business_key UNIQUE (ACTIVE) |
| chot_ky / chot_ky_snapshot | Chốt kỳ/đợt + ảnh chụp tài chính từng phiếu | (chot_ky_id, phieu_can_id) UNIQUE |
| doi_chieu_batch / doi_chieu_dong_b / doi_chieu_ket_qua | Đối chiếu nguồn B | |
| canh_bao | Trung tâm cảnh báo | 1 cảnh báo mở / (loại, entity, id) |
| audit_log | Nhật ký thao tác (ts, action, entity, entity_id, old, new, note) | |
| backup_log | Lịch sử backup | |

## phieu_can — các cột
Nhóm nguồn: `so_phieu, ngay_gio_can_1, ngay_gio_can_2, ngay_can (sinh), bien_so_goc, bien_so, bien_so_chuan, can_lan_1, can_lan_2, kl_hang_kg, kl_hang_tan (sinh), noi_xuat_goc, cong_ty_vc_nguon, source_row, import_batch_id`.
Nhóm xác định: `xe_id, noi_xuat_id, noi_den_id, noi_xuat, noi_den, loai_hang, tuyen_id, don_vi_van_chuyen_id, dot_van_chuyen_id, xe_tra_ve`.
Nhóm tính giá: `bang_gia_id (price_rule_id), don_vi_tinh, don_gia, tien_truoc_vat, ty_le_vat, tien_vat, tong_tien, trang_thai_tinh_gia`.
Nhóm kiểm soát: `business_key, strong_key, fingerprint, trang_thai_doi_chieu, chot_ky_id, trang_thai, ghi_chu, created_at, updated_at`.

## Index
`so_phieu` · `(bien_so_chuan, ngay_gio_can_1)` · `ngay_gio_can_1` · `ngay_can` · `(don_vi_van_chuyen_id, ngay_can)` · `tuyen_id` · `(noi_xuat_id, ngay_can)` · `dot_van_chuyen_id` · `import_batch_id` · `trang_thai_tinh_gia` · UNIQUE `business_key WHERE trang_thai='ACTIVE'`.

## Trigger
`trg_phieu_locked_no_update`: chặn UPDATE cột tài chính khi `chot_ky_id` khác NULL (mở khóa = đặt `chot_ky_id` NULL qua ClosingService, có audit).

## Migration
- `migrator.js`: chạy các file `NNN_*.sql` chưa áp dụng theo thứ tự, mỗi file 1 transaction, file phải tự `INSERT INTO schema_version`. Lỗi → rollback, DB giữ nguyên phiên bản cũ.
- Trước khi migrate DB đã có dữ liệu → backup `PRE_MIGRATION`.
- Cấm "xóa DB tạo lại". Thay đổi schema = thêm file `002_…sql`, `003_…sql`.
