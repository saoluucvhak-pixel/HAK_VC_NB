
### 10.1. Danh mục

#### `DON_VI` — Đơn vị / công ty (bên thuê, bên vận chuyển, chủ xe, bên giao dầu)

PK `unit_code` · + 5 cột audit chung · file: `tables/DON_VI.json` · mẫu: HAKQN **5** · ĐH **5** · HAK **5**

| Cột | Kiểu | Bắt buộc | Ràng buộc / ghi chú | Nguồn Excel |
|---|---|---|---|---|
| `unit_code` | text | ✔ | PK. vd CNHAK, HAKQN, HAK, DH |  |
| `unit_name` | text | ✔ | tên pháp lý đầy đủ | Danh mục công ty |
| `short_name` | text | ✔ | tên viết tắt: HAK, HAKQN, Đại Hiệp, CN Quế Sơn | Danh mục công ty |
| `unit_type` | một trong: CONG_TY / CHI_NHANH | ✔ |  | Danh mục công ty[Loại] |
| `name_aliases` | text |  | các cách viết khác (vd trong cột `Đơn vị VC` phiếu cân), phân cách `;` — dùng khi import | TBL_VC[Đơn vị VC] |
| `tax_code` | text |  | MST | Danh mục công ty |
| `address` | text |  | in trên báo cáo | Danh mục công ty |
| `legal_rep_name` | text |  | người đại diện theo danh mục công ty (tham khảo; người ký BKVC theo quy tắc BL-66) | Danh mục công ty |
| `legal_rep_salutation` | một trong: Ông / Bà |  |  | Danh mục công ty[Xưng hô] |
| `legal_rep_title` | text |  |  | Danh mục công ty[Chức vụ] |
| `factory_name` | text |  | Nhà máy (ủy thác) | Danh mục công ty |
| `email` | text |  |  | Danh mục công ty |
| `phone` | text |  |  | Danh mục công ty |
| `doc_display_name` | text |  | tên ghi trên chứng từ xuất hàng | Danh mục công ty |
| `sign_priority` | số nguyên | ✔ | thứ tự ký: 1 HAK, 2 HAKQN, 3 ĐH, 4 CNHAK (đơn vị ngoài tập đoàn: 90+) — bên số nhỏ hơn ký bằng người ký chính | chỉ đạo 24/09/2026 |
| `accountant_name` | text |  | kế toán ký BKVC phía đơn vị này — người dùng tự điền | BKVC!D32, I33 |
| `fuel_prefix` | text |  | tiền tố mã xe trong bảng kê dầu: DN / DH / QC | TBL_GIAONHANDAU[Biển số xe] |
| `is_active` | true/false | ✔ |  |  |
| `note` | text |  |  |  |

#### `XE` — Xe vận chuyển

PK `plate_no` · UNIQUE `plate_key` · + 5 cột audit chung · file: `tables/XE.json` · mẫu: HAKQN **17** · ĐH **17** · HAK **17**

| Cột | Kiểu | Bắt buộc | Ràng buộc / ghi chú | Nguồn Excel |
|---|---|---|---|---|
| `plate_no` | text | ✔ | PK. dạng chuẩn `43H-01080` | TBL_VC[Biển số 1] |
| `plate_key` | text | ✔ | UNIQUE. bỏ gạch/khoảng trắng, in hoa: `43H01080` — khóa quy đổi mã xe dầu |  |
| `owner_unit_code` | text | ✔ | FK DON_VI — công ty sở hữu xe |  |
| `fuel_code` | text |  | mã xe dùng trong sổ xuất dầu: `DN_43H01080` | Sheet3[Mã thống kê] |
| `is_active` | true/false | ✔ |  |  |
| `note` | text |  |  |  |

#### `TUYEN_VC` — Tuyến vận chuyển (phần định danh của TBL_DATA)

PK `route_code` · + 5 cột audit chung · file: `tables/TUYEN_VC.json` · mẫu: HAKQN **12** · ĐH **12** · HAK **12**

| Cột | Kiểu | Bắt buộc | Ràng buộc / ghi chú | Nguồn Excel |
|---|---|---|---|---|
| `route_code` | text | ✔ | PK. `VC.007` | TBL_DATA[Mã quãng đường] |
| `route_name` | text | ✔ |  | TBL_DATA[Tuyến] |
| `distance_km` | số | ✔ | > 0, một chiều | TBL_DATA[Cự ly] |
| `trip_distance_km` | số | ✔ | > 0, khứ hồi — dùng trong mọi công thức | TBL_DATA[Cự ly/chuyến] |
| `uom` | một trong: TAN / M3 | ✔ | chuẩn hóa từ `Tấn`/`M3` | TBL_DATA[Đơn vị tính] |
| `catalog_unit_code` | text |  | FK DON_VI — đơn vị VC ghi trong bảng giá gốc: HAK = Công ty TNHH Hoàng Anh Khôi, HHH = Công ty Hùng Hoàng Hoa (tham khảo, không dùng tính) | TBL_DATA[Đơn vị VC] |
| `is_active` | true/false | ✔ | ngừng sử dụng thay cho xóa |  |
| `note` | text |  |  |  |

#### `PRICE_HISTORY` — Phiên bản đơn giá theo tuyến (phần giá của TBL_DATA) — không ghi đè

PK `price_id` · UNIQUE `route_code + contract_id + effective_from` · + 5 cột audit chung · file: `tables/PRICE_HISTORY.json` · mẫu: HAKQN **12** · ĐH **12** · HAK **12**

| Cột | Kiểu | Bắt buộc | Ràng buộc / ghi chú | Nguồn Excel |
|---|---|---|---|---|
| `price_id` | text | ✔ | PK |  |
| `route_code` | text | ✔ | FK TUYEN_VC | TBL_DATA[Mã quãng đường] |
| `contract_id` | text |  | FK HOP_DONG. Trống = giá chung mọi hợp đồng; có giá trị = giá riêng của hợp đồng (BL-64) |  |
| `version_no` | số nguyên | ✔ | 1, 2, 3… theo tuyến (+hợp đồng) |  |
| `effective_from` | ngày | ✔ |  | TBL_DATA[Ngày cập nhật] |
| `effective_to` | ngày |  | tự đóng = ngày hiệu lực bản mới − 1 |  |
| `base_price_excl_vat` | số | ✔ | tham khảo | TBL_DATA[Đơn Giá (chưa VAT)] |
| `price_per_km` | số |  | tham khảo, không dùng tính | TBL_DATA[Giá/km] |
| `new_price` | số | ✔ | >= 0 — dùng tính ĐG 1 chuyến | TBL_DATA[Đơn giá mới] |
| `fuel_price_excl_vat` | số | ✔ | > 0 — giá dầu cơ sở | TBL_DATA[ĐG dầu chưa VAT] |
| `fuel_norm_l_per_km` | số | ✔ | > 0 — lít/km (0,4 = 40 l/100km) | TBL_DATA[ĐM dầu_100km] |
| `avg_load_ton` | số | ✔ | > 0 | TBL_DATA[KL_TB] |
| `avg_volume_m3` | số |  | > 0 nếu tuyến M3 | TBL_DATA[Thể tích TB] |
| `status` | một trong: DRAFT / ACTIVE / CLOSED | ✔ |  |  |
| `is_used` | true/false | ✔ | TRUE khi đã có kỳ dùng → cấm sửa/xóa (BL-02) |  |
| `source_note` | text |  | nguồn/căn cứ đổi giá |  |

#### `HOP_DONG` — Hợp đồng vận chuyển 2 bên (bên vận chuyển lập tính toán)

PK `contract_id` · UNIQUE `contract_code` · + 5 cột audit chung · file: `tables/HOP_DONG.json` · mẫu: HAKQN **3** · ĐH **1** · HAK **1**

| Cột | Kiểu | Bắt buộc | Ràng buộc / ghi chú | Nguồn Excel |
|---|---|---|---|---|
| `contract_id` | text | ✔ | PK |  |
| `contract_code` | text | ✔ | UNIQUE. mã ngắn: `HAKQN-QS`, `DH-HAKQN` |  |
| `contract_no` | text |  | số HĐVC — **người dùng tự điền**, APP không tự sinh | CAN[Số HĐVC] |
| `customer_unit_code` | text | ✔ | FK DON_VI — bên thuê |  |
| `carrier_unit_code` | text | ✔ | FK DON_VI — bên vận chuyển; ≠ bên thuê |  |
| `effective_from` | ngày | ✔ | người dùng tự điền khi tạo hợp đồng |  |
| `effective_to` | ngày |  | người dùng tự điền; trống = chưa hết hạn |  |
| `report_title` | text |  | tiêu đề BKVC, mặc định `BẢNG XÁC NHẬN KHỐI LƯỢNG VẬN CHUYỂN DĂM` | BKVC!A4 |
| `service_desc` | text |  | diễn giải cước (điểm đi – điểm đến) | BKVC!C37 |
| `sign_place` | text |  | vd `Quế Sơn Trung` | BKVC!G26 |
| `customer_signers_json` | JSON |  | trống = tự xác định theo quy tắc ký (BL-66); có giá trị = ghi đè [{title, name}] | BKVC!G27:J33 |
| `carrier_signers_json` | JSON |  | như trên, cho bên vận chuyển | BKVC!A27:E33 |
| `is_active` | true/false | ✔ | bật/tắt |  |
| `note` | text |  |  |  |

#### `HOP_DONG_XE` — Phạm vi xe của hợp đồng

PK `id` · UNIQUE `contract_id + plate_no + effective_from` · + 5 cột audit chung · file: `tables/HOP_DONG_XE.json` · mẫu: HAKQN **27** · ĐH **5** · HAK **5**

| Cột | Kiểu | Bắt buộc | Ràng buộc / ghi chú | Nguồn Excel |
|---|---|---|---|---|
| `id` | text | ✔ | PK |  |
| `contract_id` | text | ✔ | FK HOP_DONG |  |
| `plate_no` | text | ✔ | FK XE |  |
| `effective_from` | ngày | ✔ |  |  |
| `effective_to` | ngày |  |  |  |


### 10.2. Đầu vào

#### `PHIEU_CAN` — Phiếu cân — 1 dòng = 1 chuyến; dùng chung cho mọi hợp đồng

PK `ticket_id` · UNIQUE `ticket_key` · + 5 cột audit chung · file: `tables/PHIEU_CAN/<năm>.json` (theo năm `weigh1_date`) · mẫu: HAKQN **326** · ĐH **77** · HAK **100**

| Cột | Kiểu | Bắt buộc | Ràng buộc / ghi chú | Nguồn Excel |
|---|---|---|---|---|
| `ticket_id` | text | ✔ | PK = `PC-` + 12 ký tự đầu SHA-1(ticket_key) → giống nhau ở mọi bản cài (gộp gói dữ liệu không trùng) |  |
| `ticket_key` | text | ✔ | UNIQUE chống trùng = ticket_no/weigh1_date/plate_no (Q16) |  |
| `ticket_no` | text | ✔ | lưu text | TBL_VC[Số\n phiếu] |
| `row_no` | text |  |  | TBL_VC[Stt] |
| `weigh1_date` | ngày | ✔ |  | TBL_VC[Ngày cân 1] |
| `weigh1_time` | giờ |  |  | TBL_VC[Giờ cân 1] |
| `weigh2_date` | ngày | ✔ | >= weigh1_date | TBL_VC[Ngày cân 2] |
| `weigh2_time` | giờ |  |  | TBL_VC[Giờ cân 2] |
| `plate_no` | text | ✔ | FK XE (dạng chuẩn) | TBL_VC[Biển số 1] |
| `weight1_kg` | số |  |  | TBL_VC[Cân lần 1] |
| `weight2_kg` | số |  |  | TBL_VC[Cân lần 2] |
| `net_kg` | số | ✔ | > 0 | TBL_VC[KL hàng (KG)] |
| `origin` | text |  |  | TBL_VC[Nguồn gốc] |
| `customer` | text |  |  | TBL_VC[Khách hàng] |
| `ldd` | text |  |  | TBL_VC[LDĐ] |
| `weigh_type` | text |  |  | TBL_VC[Kiểu cân] |
| `route_code` | text | ✔ | FK TUYEN_VC | TBL_VC[Mã cự ly VC] |
| `transport_unit_name` | text |  | giữ nguyên gốc | TBL_VC[Đơn vị VC] |
| `owner_unit_code` | text |  | FK DON_VI — quy đổi từ tên hoặc từ XE |  |
| `validation_flags` | text |  | mã lỗi/cảnh báo, phân cách `;` |  |
| `flags_ack` | true/false |  | TRUE = người dùng đã kiểm tra cảnh báo và xác nhận giữ nguyên |  |
| `flags_ack_note` | text |  | lý do / người xác nhận |  |
| `import_batch_id` | text |  | FK IMPORT_BATCH |  |
| `raw_row_json` | JSON |  | nguyên dòng gốc — không mất dữ liệu |  |
| `is_deleted` | true/false | ✔ | xóa mềm; cấm nếu đang dùng ở kỳ |  |

#### `GIAO_NHAN_DAU` — Bảng kê giao nhận dầu — mỗi dòng thuộc bảng kê của 1 hợp đồng

PK `receipt_id` · + 5 cột audit chung · file: `tables/GIAO_NHAN_DAU/<năm>.json` (theo năm `receive_date`) · mẫu: HAKQN **18** · ĐH **16** · HAK **13**

| Cột | Kiểu | Bắt buộc | Ràng buộc / ghi chú | Nguồn Excel |
|---|---|---|---|---|
| `receipt_id` | text | ✔ | PK = `GD-<mã bản cài>-<số tăng>` → không đụng ID của bản cài khác |  |
| `contract_id` | text | ✔ | FK HOP_DONG — bảng kê của hợp đồng nào |  |
| `receive_date` | ngày | ✔ |  | TBL_GIAONHANDAU[Ngày nhận dầu] |
| `route_code` | text | ✔ | FK TUYEN_VC | TBL_GIAONHANDAU[Mã cự ly VC] |
| `fuel_vehicle_code` | text | ✔ | nguyên gốc: `DH_92H00192`, `92H-00192`, `92H00195` | TBL_GIAONHANDAU[Biển số xe] |
| `plate_no` | text |  | FK XE — quy đổi (bỏ tiền tố XX_, bỏ gạch → plate_key) |  |
| `owner_unit_code` | text |  | FK DON_VI — qua XE, để truy vết |  |
| `uom` | text | ✔ | `LÍT` | TBL_GIAONHANDAU[ĐVT] |
| `qty_liter` | số | ✔ | > 0 | TBL_GIAONHANDAU[Số lượng (lít)] |
| `fuel_price_excl_vat` | số | ✔ | > 0, chưa VAT (Q2) | TBL_GIAONHANDAU[Đơn giá dầu] |
| `purchase_date` | ngày |  |  | TBL_GIAONHANDAU[Ngày mua dầu] |
| `giver_unit_code` | text | ✔ | FK DON_VI — cột `Đơn vị` (CNHAK / HAKQN) | TBL_GIAONHANDAU[Đơn vị] |
| `validation_flags` | text |  |  |  |
| `flags_ack` | true/false |  | TRUE = người dùng đã kiểm tra cảnh báo và xác nhận giữ nguyên |  |
| `flags_ack_note` | text |  | lý do / người xác nhận |  |
| `import_batch_id` | text |  | FK IMPORT_BATCH |  |
| `raw_row_json` | JSON |  |  |  |
| `is_deleted` | true/false | ✔ |  |  |

#### `IMPORT_BATCH` — Lô import (preview → xác nhận)

PK `batch_id` · + 5 cột audit chung · file: `tables/IMPORT_BATCH.json` · mẫu: HAKQN **2** · ĐH **2** · HAK **2**

| Cột | Kiểu | Bắt buộc | Ràng buộc / ghi chú | Nguồn Excel |
|---|---|---|---|---|
| `batch_id` | text | ✔ | PK |  |
| `import_type` | một trong: PHIEU_CAN / GIAO_NHAN_DAU / PRICE | ✔ |  |  |
| `contract_id` | text |  | bắt buộc khi import dầu |  |
| `file_name` | text | ✔ |  |  |
| `file_sha256` | text |  | dấu kiểm file nguồn — cảnh báo khi import lại cùng file |  |
| `sheet_name` | text |  |  |  |
| `header_json` | JSON |  | header gốc |  |
| `mapping_json` | JSON |  | cột gốc → cột DB |  |
| `total_rows` | số nguyên | ✔ |  |  |
| `ok_rows` | số nguyên | ✔ |  |  |
| `warning_rows` | số nguyên | ✔ |  |  |
| `error_rows` | số nguyên | ✔ |  |  |
| `duplicate_rows` | số nguyên | ✔ |  |  |
| `status` | một trong: PREVIEW / CONFIRMED / CANCELLED | ✔ |  |  |
| `confirmed_at` | ngày giờ |  |  |  |
| `confirmed_by` | text |  |  |  |


### 10.3. Kết quả

#### `KY_TINH` — Kỳ tính của 1 hợp đồng

PK `period_id` · UNIQUE `period_code` · + 5 cột audit chung · file: `tables/KY_TINH.json` · mẫu: HAKQN **0** · ĐH **0** · HAK **0**

| Cột | Kiểu | Bắt buộc | Ràng buộc / ghi chú | Nguồn Excel |
|---|---|---|---|---|
| `period_id` | text | ✔ | PK = `KY-<mã bản cài>-<số tăng>` |  |
| `period_code` | text | ✔ | UNIQUE. `HAKQN-QS/20260918-20260923` |  |
| `contract_id` | text | ✔ | FK HOP_DONG |  |
| `date_from` | ngày | ✔ |  | BKVC!A5 |
| `date_to` | ngày | ✔ | >= date_from | BKVC!A5 |
| `route_filter` | text |  | trống = mọi tuyến |  |
| `status` | một trong: NHAP / DA_XAC_NHAN / DA_KHOA / HUY | ✔ |  |  |
| `calc_version` | số nguyên | ✔ | số lần tính |  |
| `current_run_id` | text |  | FK CALC_RUN của lần tính hiện hành |  |
| `config_snapshot_json` | JSON |  | làm tròn, VAT, phương pháp… tại lúc tính (BL-37) |  |
| `needs_recalc` | true/false | ✔ | TRUE khi dữ liệu nguồn bị sửa sau khi tính |  |
| `report_date` | ngày |  | ngày ký trên BKVC | BKVC!G26 |
| `calculated_at` | ngày giờ |  |  |  |
| `calculated_by` | text |  |  |  |
| `confirmed_at` | ngày giờ |  |  |  |
| `confirmed_by` | text |  |  |  |
| `locked_at` | ngày giờ |  |  |  |
| `locked_by` | text |  |  |  |
| `origin` | một trong: LOCAL / IMPORTED | ✔ | IMPORTED = kỳ nhận từ gói của bên vận chuyển khác — chỉ xem, không sửa |  |
| `origin_install_id` | text |  | bản cài đã lập kỳ |  |
| `package_sha256` | text |  | dấu kiểm của gói khi nhập |  |
| `note` | text |  |  |  |

#### `TRANSPORT_CALCULATION` — Kết quả tính 1 tuyến trong 1 kỳ (thay QR_DGVC4) — lưu cả số trung gian + snapshot

PK `calc_id` · file: `tables/TRANSPORT_CALCULATION.json` · mẫu: HAKQN **0** · ĐH **0** · HAK **0**

| Cột | Kiểu | Bắt buộc | Ràng buộc / ghi chú | Nguồn Excel |
|---|---|---|---|---|
| `calc_id` | text | ✔ | PK |  |
| `period_id` | text | ✔ | FK KY_TINH |  |
| `run_id` | text | ✔ | FK CALC_RUN |  |
| `calc_version` | số nguyên | ✔ |  |  |
| `is_current` | true/false | ✔ | chỉ 1 dòng current / (period, route) |  |
| `contract_id` | text | ✔ |  |  |
| `route_code` | text | ✔ |  | QR_DGVC[Mã tuyến] |
| `route_name` | text | ✔ | snapshot | QR_DGVC[Tuyến] |
| `uom` | text | ✔ | snapshot |  |
| `price_id` | text | ✔ | phiên bản giá đã dùng |  |
| `trip_distance_km` | số | ✔ | snapshot | QR_DGVC[Cự ly tuyến] |
| `new_price` | số | ✔ | snapshot (sau ép Int64 nếu bật) |  |
| `avg_load_ton` | số | ✔ | snapshot |  |
| `avg_volume_m3` | số |  | snapshot |  |
| `fuel_price_catalog` | số | ✔ | snapshot giá dầu cơ sở |  |
| `fuel_norm_l_per_km` | số | ✔ | snapshot | QR_DGVC[Định mức dầu Diezel] |
| `start_date` | ngày | ✔ | min(weigh1_date) | QR_DGVC[Ngày bắt đầu] |
| `end_date` | ngày | ✔ | max(weigh2_date) | QR_DGVC[Ngày kết thúc] |
| `trip_count` | số nguyên | ✔ |  | QR_DGVC[Số chuyến] |
| `total_kg` | số | ✔ |  |  |
| `total_ton` | số | ✔ |  | QR_DGVC[Tổng KL (Tấn)] |
| `fuel_giver_unit` | text |  |  |  |
| `fuel_uom` | text |  |  |  |
| `fuel_line_count` | số nguyên | ✔ |  |  |
| `actual_fuel_liter` | số |  |  | QR_DGVC[Dầu Diezel thực nhận] |
| `fuel_start_date` | ngày |  |  |  |
| `fuel_end_date` | ngày |  |  |  |
| `fuel_price` | số |  | TB cộng | QR_DGVC[Đơn giá dầu] |
| `fuel_import_date` | ngày |  | max(purchase_date) | QR_DGVC[Ngày nhập dầu] |
| `trip_price` | số | ✔ | ĐG 1 chuyến | QR_DATA[ĐG 1 Chuyến] |
| `fuel_per_trip` | số | ✔ |  | QR_DATA[Tiêu hao NL chuyến] |
| `fuel_cost_per_trip` | số | ✔ |  | QR_DATA[Tiền dầu] |
| `fuel_cost_ratio` | số | ✔ |  | QR_DATA[Tỷ lệ tiêu hao dầu] |
| `price_no_diesel` | số | ✔ |  | QR_DATA[ĐGVC_NODIEZEL] |
| `contract_price` | số | ✔ | ĐG_HĐ | QR_DGVC[Đơn giá theo hợp đồng…] |
| `standard_fuel_liter` | số | ✔ |  | QR_DGVC[Nhiên liệu … theo định mức (lít)] |
| `fuel_diff_liter` | số |  |  | QR_DGVC[CL Tiêu hao Diezel ] |
| `fuel_adjust_price` | số |  | ĐG CL Diesel | QR_DGVC[Đơn giá CL Diezel] |
| `transport_price_raw` | số |  | trước làm tròn |  |
| `transport_price` | số |  |  | QR_DGVC[Đơn giá vận chuyển] |
| `result_status` | một trong: OK / WARNING / ERROR | ✔ |  |  |
| `warnings_json` | JSON |  |  |  |
| `trace_json` | JSON | ✔ | chuỗi XEM CHI TIẾT TÍNH |  |
| `created_at` | ngày giờ | ✔ |  |  |
| `created_by` | text | ✔ |  |  |

#### `TRANSPORT_DETAIL` — Phiếu cân cấu thành 1 kết quả; cũng là bảng chống tính trùng theo hợp đồng

PK `id` · UNIQUE `contract_id + ticket_id WHERE is_current AND usage_state IN (CONFIRMED,LOCKED)` · file: `tables/TRANSPORT_DETAIL/<năm>.json` (theo năm `weigh1_date`) · mẫu: HAKQN **0** · ĐH **0** · HAK **0**

| Cột | Kiểu | Bắt buộc | Ràng buộc / ghi chú | Nguồn Excel |
|---|---|---|---|---|
| `id` | text | ✔ | PK |  |
| `calc_id` | text | ✔ | FK |  |
| `period_id` | text | ✔ | FK |  |
| `contract_id` | text | ✔ | denormalize để kiểm trùng nhanh |  |
| `ticket_id` | text | ✔ | FK PHIEU_CAN |  |
| `ticket_key` | text | ✔ | snapshot |  |
| `plate_no` | text | ✔ | snapshot — nguồn BKVC |  |
| `weigh1_date` | ngày | ✔ | snapshot |  |
| `net_kg` | số | ✔ | snapshot |  |
| `is_current` | true/false | ✔ |  |  |
| `usage_state` | một trong: DRAFT / CONFIRMED / LOCKED / RELEASED | ✔ | đồng bộ theo trạng thái kỳ |  |
| `created_at` | ngày giờ | ✔ |  |  |

#### `FUEL_DETAIL` — Dòng dầu cấu thành 1 kết quả

PK `id` · UNIQUE `contract_id + receipt_id WHERE is_current AND usage_state IN (CONFIRMED,LOCKED)` · file: `tables/FUEL_DETAIL/<năm>.json` (theo năm `created_at`) · mẫu: HAKQN **0** · ĐH **0** · HAK **0**

| Cột | Kiểu | Bắt buộc | Ràng buộc / ghi chú | Nguồn Excel |
|---|---|---|---|---|
| `id` | text | ✔ | PK |  |
| `calc_id` | text | ✔ | FK |  |
| `period_id` | text | ✔ | FK |  |
| `contract_id` | text | ✔ |  |  |
| `receipt_id` | text | ✔ | FK GIAO_NHAN_DAU |  |
| `qty_liter` | số | ✔ | snapshot |  |
| `fuel_price_excl_vat` | số | ✔ | snapshot |  |
| `is_current` | true/false | ✔ |  |  |
| `usage_state` | một trong: DRAFT / CONFIRMED / LOCKED / RELEASED | ✔ |  |  |
| `created_at` | ngày giờ | ✔ |  |  |

#### `BKVC_LINE` — Dòng bảng xác nhận khối lượng (1 dòng / xe / tuyến)

PK `id` · file: `tables/BKVC_LINE.json` · mẫu: HAKQN **0** · ĐH **0** · HAK **0**

| Cột | Kiểu | Bắt buộc | Ràng buộc / ghi chú | Nguồn Excel |
|---|---|---|---|---|
| `id` | text | ✔ | PK |  |
| `period_id` | text | ✔ | FK |  |
| `calc_id` | text | ✔ | FK — lấy đơn giá |  |
| `contract_id` | text | ✔ |  |  |
| `route_code` | text | ✔ |  |  |
| `seq` | số nguyên | ✔ | STT | BKVC[STT] |
| `plate_no` | text | ✔ |  | BKVC[Biển số xe] |
| `owner_unit_code` | text |  |  |  |
| `trip_count` | số nguyên | ✔ |  | BKVC[Số chuyến] |
| `kg` | số | ✔ |  | BKVC[Khối lượng (KG)] |
| `ton` | số | ✔ | kg/1000 | BKVC[Khối lượng (Tấn)] |
| `unit_price` | số | ✔ |  | BKVC[Đơn giá] |
| `amount` | số | ✔ | ROUND(ton×giá, 0) | BKVC[Thành tiền] |
| `vat_rate` | số | ✔ | 0.08 |  |
| `vat` | số | ✔ | ROUND(amount×vat_rate, 0) | BKVC[VAT (8%)] |
| `amount_incl_vat` | số | ✔ |  | BKVC[Thành tiền] |
| `note` | text |  |  | BKVC[Ghi chú] |
| `is_current` | true/false | ✔ |  |  |
| `created_at` | ngày giờ | ✔ |  |  |

#### `CALC_RUN` — Mỗi lần tính / xác nhận / khóa — nhật ký

PK `run_id` · file: `tables/CALC_RUN.json` · mẫu: HAKQN **0** · ĐH **0** · HAK **0**

| Cột | Kiểu | Bắt buộc | Ràng buộc / ghi chú | Nguồn Excel |
|---|---|---|---|---|
| `run_id` | text | ✔ | PK |  |
| `period_id` | text | ✔ | FK |  |
| `action` | một trong: CALC / RECALC / CONFIRM / LOCK / UNLOCK / CANCEL | ✔ |  |  |
| `status` | một trong: RUNNING / DONE / FAILED / ROLLED_BACK | ✔ |  |  |
| `started_at` | ngày giờ | ✔ |  |  |
| `finished_at` | ngày giờ |  |  |  |
| `username` | text | ✔ |  |  |
| `journal_id` | text |  | giao dịch ghi file (journal) tương ứng |  |
| `summary_json` | JSON |  | số dòng ghi mỗi bảng, thời gian chạy |  |
| `error_message` | text |  |  |  |


### 10.4. Hệ thống

#### `USERS` — Tài khoản nội bộ của bản cài

PK `username` · + 5 cột audit chung · file: `tables/USERS.json` · mẫu: HAKQN **2** · ĐH **2** · HAK **2**

| Cột | Kiểu | Bắt buộc | Ràng buộc / ghi chú | Nguồn Excel |
|---|---|---|---|---|
| `username` | text | ✔ | PK — tên đăng nhập (có thể là email), không phân biệt hoa thường |  |
| `full_name` | text | ✔ |  |  |
| `unit_code` | text |  | FK DON_VI — mặc định = đơn vị của bản cài; trống = ADMIN |  |
| `role` | một trong: ADMIN / KE_TOAN / XEM | ✔ |  |  |
| `can_unlock` | true/false | ✔ |  |  |
| `password_hash` | text |  | scrypt (Node crypto), base64 — không lưu mật khẩu gốc; trống = chưa đặt → bắt đặt khi đăng nhập lần đầu |  |
| `password_salt` | text |  | 16 byte ngẫu nhiên, base64 |  |
| `password_algo` | text |  | `scrypt:N=16384,r=8,p=1` |  |
| `must_change_password` | true/false | ✔ | TRUE khi ADMIN vừa tạo / đặt lại mật khẩu |  |
| `failed_attempts` | số nguyên | ✔ | sai 5 lần liên tiếp → khóa 15 phút |  |
| `locked_until` | ngày giờ |  |  |  |
| `is_active` | true/false | ✔ |  |  |
| `last_login_at` | ngày giờ |  |  |  |

#### `AUDIT_LOG` — Lịch sử thao tác — chỉ ghi thêm, không sửa/xóa

PK `log_id` · file: `tables/AUDIT_LOG/<năm>.json` (theo năm `ts`) · mẫu: HAKQN **0** · ĐH **0** · HAK **0**

| Cột | Kiểu | Bắt buộc | Ràng buộc / ghi chú | Nguồn Excel |
|---|---|---|---|---|
| `log_id` | text | ✔ | PK |  |
| `ts` | ngày giờ | ✔ |  |  |
| `username` | text | ✔ |  |  |
| `action` | text | ✔ | LOGIN/CREATE/UPDATE/DELETE/IMPORT/CALC/RECALC/CONFIRM/LOCK/UNLOCK/OVERRIDE/EXPORT_PACKAGE/IMPORT_PACKAGE/BACKUP/RESTORE… |  |
| `entity` | text | ✔ | tên sheet |  |
| `entity_id` | text | ✔ |  |  |
| `before_json` | JSON |  |  |  |
| `after_json` | JSON |  |  |  |
| `reason` | text |  | bắt buộc với UNLOCK / OVERRIDE |  |
| `run_id` | text |  |  |  |
| `device_info` | text |  | tên máy + user Windows + phiên bản APP |  |

#### `CONFIG` — Tham số nghiệp vụ dùng chung (làm tròn, VAT, người ký…) — phát hành từ máy gốc qua gói danh mục

PK `config_key` · file: `tables/CONFIG.json` · mẫu: HAKQN **29** · ĐH **29** · HAK **29**

| Cột | Kiểu | Bắt buộc | Ràng buộc / ghi chú | Nguồn Excel |
|---|---|---|---|---|
| `config_key` | text | ✔ | PK |  |
| `config_value` | text | ✔ |  |  |
| `value_type` | một trong: TEXT / NUM / BOOL / JSON | ✔ |  |  |
| `description` | text |  |  |  |
| `updated_at` | ngày giờ |  |  |  |
| `updated_by` | text |  |  |  |

#### `EXCHANGE_LOG` — Gói dữ liệu đã xuất / nhập giữa các bản cài

PK `exchange_id` · file: `tables/EXCHANGE_LOG.json` · mẫu: HAKQN **0** · ĐH **0** · HAK **0**

| Cột | Kiểu | Bắt buộc | Ràng buộc / ghi chú | Nguồn Excel |
|---|---|---|---|---|
| `exchange_id` | text | ✔ | PK |  |
| `direction` | một trong: EXPORT / IMPORT | ✔ |  |  |
| `package_type` | một trong: DANH_MUC / PHIEU_CAN / KY_TINH | ✔ |  |  |
| `file_name` | text | ✔ |  |  |
| `package_sha256` | text | ✔ |  |  |
| `source_install_id` | text | ✔ |  |  |
| `source_unit_code` | text | ✔ |  |  |
| `target_unit_code` | text |  |  |  |
| `counts_json` | JSON | ✔ | số dòng từng bảng: mới / cập nhật / bỏ qua / xung đột |  |
| `status` | một trong: PREVIEW / DONE / REJECTED | ✔ |  |  |
| `message` | text |  |  |  |
| `created_at` | ngày giờ | ✔ |  |  |
| `created_by` | text | ✔ |  |  |
