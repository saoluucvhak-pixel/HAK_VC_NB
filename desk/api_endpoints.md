Quyền: **A** = ADMIN, **K** = KE_TOAN, **X** = XEM, **—** = chưa đăng nhập. 🔒 = ghi dữ liệu (1 giao dịch journal, có audit).

| Nhóm | Số action |
|---|---|
| Khởi tạo | 2 |
| Đăng nhập | 5 |
| Hệ thống | 6 |
| Danh mục | 10 |
| Đơn giá | 5 |
| Hợp đồng | 5 |
| Phiếu cân | 5 |
| Giao nhận dầu | 5 |
| Import | 5 |
| Tính giá | 12 |
| Kiểm tra dữ liệu | 1 |
| Báo cáo | 6 |
| Quản trị | 6 |
| Dữ liệu | 4 |
| Trao đổi | 4 |
| **Tổng** | **81** |

### 4.1. Khởi tạo

| Action | Mô tả | Quyền | Ghi | Audit |
|---|---|---|---|---|
| `setup.status` | Lần mở đầu: đã có thư mục dữ liệu chưa, bản cài của đơn vị nào, còn user chưa đặt mật khẩu không | — |  |  |
| `setup.init` | Tạo thư mục dữ liệu mới (chọn đơn vị của bản cài, ADMIN đầu tiên) hoặc mở thư mục có sẵn / nhận gói DANH_MUC ban đầu | — | 🔒 USERS, CONFIG, DON_VI, XE, TUYEN_VC, PRICE_HISTORY | SETUP |

### 4.2. Đăng nhập

| Action | Mô tả | Quyền | Ghi | Audit |
|---|---|---|---|---|
| `auth.login` | Đăng nhập tài khoản nội bộ → sessionToken (giữ trong bộ nhớ main process) | — | 🔒 USERS | LOGIN |
| `auth.setFirstPassword` | User chưa có mật khẩu (dữ liệu mẫu / ADMIN vừa tạo) đặt mật khẩu lần đầu | — | 🔒 USERS | SET_PASSWORD |
| `auth.changePassword` | Đổi mật khẩu | A/K/X | 🔒 USERS | CHANGE_PASSWORD |
| `auth.logout` | Đăng xuất (hủy session) | A/K/X |  | LOGOUT |
| `auth.me` | Người dùng hiện tại, quyền, đơn vị bản cài | A/K/X |  |  |

### 4.3. Hệ thống

| Action | Mô tả | Quyền | Ghi | Audit |
|---|---|---|---|---|
| `meta.bootstrap` | Tải khi mở APP: danh mục, enum, cấu hình hiển thị, mã lỗi, thông tin bản cài | A/K/X |  |  |
| `system.health` | Kiểm tra toàn vẹn: manifest, SHA-256 từng file, journal dở dang, dung lượng, lần sao lưu gần nhất | A |  |  |
| `dialog.openFile` | Hộp thoại chọn file (Excel / gói .dgvc) | A/K/X |  |  |
| `dialog.openFolder` | Hộp thoại chọn thư mục | — |  |  |
| `dialog.saveFile` | Hộp thoại chọn nơi lưu file xuất | A/K/X |  |  |
| `system.openPath` | Mở file / thư mục bằng Windows Explorer (sau khi xuất file) | A/K/X |  |  |

### 4.4. Danh mục

| Action | Mô tả | Quyền | Ghi | Audit |
|---|---|---|---|---|
| `units.list` | Danh sách đơn vị | A/K/X |  |  |
| `units.save` | Thêm / sửa đơn vị | A | 🔒 DON_VI | CREATE/UPDATE |
| `units.setActive` | Ngừng / dùng lại đơn vị (không xóa cứng) | A | 🔒 DON_VI | SET_ACTIVE |
| `vehicles.list` | Danh sách xe | A/K/X |  |  |
| `vehicles.save` | Thêm / sửa xe | A/K | 🔒 XE | CREATE/UPDATE |
| `vehicles.setActive` | Ngừng / dùng lại xe (không xóa cứng) | A/K | 🔒 XE | SET_ACTIVE |
| `routes.list` | Danh sách tuyến | A/K/X |  |  |
| `routes.save` | Thêm / sửa tuyến | A/K | 🔒 TUYEN_VC | CREATE/UPDATE |
| `routes.setActive` | Ngừng / dùng lại tuyến (không xóa cứng) | A/K | 🔒 TUYEN_VC | SET_ACTIVE |
| `vehicles.resolvePlate` | Chuẩn hóa mã xe bất kỳ (`DH_92H00192`, `92H00195`) → biển số chuẩn | A/K/X |  |  |

### 4.5. Đơn giá

| Action | Mô tả | Quyền | Ghi | Audit |
|---|---|---|---|---|
| `prices.list` | Lịch sử phiên bản giá theo tuyến (+ hợp đồng) | A/K/X |  |  |
| `prices.preview` | Tính Tầng A (ĐG 1 chuyến → ĐG_HĐ) cho 1 bộ tham số, không lưu — dùng khi nhập giá mới | A/K/X |  |  |
| `prices.createVersion` | Tạo phiên bản giá mới (DRAFT); phiên bản cũ không bị sửa | A/K | 🔒 PRICE_HISTORY | PRICE_CREATE |
| `prices.updateDraft` | Sửa phiên bản DRAFT (cấm khi ACTIVE đã dùng) | A/K | 🔒 PRICE_HISTORY | PRICE_UPDATE |
| `prices.activate` | Kích hoạt DRAFT → ACTIVE; tự đóng phiên bản trước (effective_to = ngày mới − 1) | A/K | 🔒 PRICE_HISTORY | PRICE_ACTIVATE |

### 4.6. Hợp đồng

| Action | Mô tả | Quyền | Ghi | Audit |
|---|---|---|---|---|
| `contracts.list` | Danh sách hợp đồng (KE_TOAN chỉ thấy HĐ đơn vị mình là bên VC hoặc bên thuê) | A/K/X |  |  |
| `contracts.save` | Tạo / sửa hợp đồng: số HĐ, ngày hiệu lực, bên thuê, bên VC (người dùng tự điền) | A/K | 🔒 HOP_DONG | CREATE/UPDATE |
| `contracts.setVehicles` | Ghi phạm vi xe (danh sách + hiệu lực) | A/K | 🔒 HOP_DONG_XE | CONTRACT_VEHICLES |
| `contracts.suggestVehicles` | Gợi ý phạm vi xe = xe bên VC + xe của các HĐ mà bên VC là bên thuê | A/K |  |  |
| `contracts.resolveSigners` | Người ký 2 bên theo sign_priority (hoặc giá trị ghi đè) | A/K/X |  |  |

### 4.7. Phiếu cân

| Action | Mô tả | Quyền | Ghi | Audit |
|---|---|---|---|---|
| `tickets.list` | Tra cứu phiếu cân | A/K/X |  |  |
| `tickets.get` | Chi tiết 1 phiếu + các kỳ đã dùng + audit | A/K/X |  |  |
| `tickets.update` | Sửa phiếu — cấm nếu đang ở kỳ DA_XAC_NHAN/DA_KHOA; kỳ NHAP → needs_recalc | A/K | 🔒 PHIEU_CAN, KY_TINH | UPDATE |
| `tickets.softDelete` | Xóa mềm (cấm nếu đang dùng ở kỳ chưa hủy) | A/K | 🔒 PHIEU_CAN | DELETE |
| `tickets.ackFlags` | Xác nhận cảnh báo (giữ nguyên dữ liệu) | A/K | 🔒 PHIEU_CAN | ACK_FLAGS |

### 4.8. Giao nhận dầu

| Action | Mô tả | Quyền | Ghi | Audit |
|---|---|---|---|---|
| `fuel.list` | Bảng kê dầu theo hợp đồng | A/K/X |  |  |
| `fuel.saveRows` | Nhập tay nhiều dòng dầu cho 1 hợp đồng (validate như import) | A/K | 🔒 GIAO_NHAN_DAU | CREATE |
| `fuel.update` | Sửa 1 dòng dầu (luật như tickets.update) | A/K | 🔒 GIAO_NHAN_DAU, KY_TINH | UPDATE |
| `fuel.softDelete` | Xóa mềm dòng dầu | A/K | 🔒 GIAO_NHAN_DAU | DELETE |
| `fuel.ackFlags` | Xác nhận cảnh báo dòng dầu (vd nghi trùng nhưng không trùng) | A/K | 🔒 GIAO_NHAN_DAU | ACK_FLAGS |

### 4.9. Import

| Action | Mô tả | Quyền | Ghi | Audit |
|---|---|---|---|---|
| `import.preview` | Bước 1: main process đọc file Excel/CSV theo đường dẫn → gợi ý mapping, kiểm tra từng dòng, giữ dữ liệu tạm trong bộ nhớ theo batchId. KHÔNG ghi dữ liệu | A/K | 🔒 IMPORT_BATCH | IMPORT_PREVIEW |
| `import.previewRows` | Xem trang tiếp theo / lọc dòng lỗi của lô đang preview | A/K |  |  |
| `import.confirm` | Bước 2: kiểm tra lại (dữ liệu có thể đã đổi) → ghi 1 giao dịch | A/K | 🔒 PHIEU_CAN, GIAO_NHAN_DAU, IMPORT_BATCH | IMPORT_CONFIRM |
| `import.cancel` | Hủy lô PREVIEW | A/K | 🔒 IMPORT_BATCH | IMPORT_CANCEL |
| `import.list` | Lịch sử import | A/K/X |  |  |

### 4.10. Tính giá

| Action | Mô tả | Quyền | Ghi | Audit |
|---|---|---|---|---|
| `periods.list` | Danh sách kỳ | A/K/X |  |  |
| `periods.preview` | Chọn HĐ + Từ–Đến ngày (+ tuyến) → ứng viên phiếu/dầu, lỗi, cảnh báo, kết quả dự tính. KHÔNG ghi | A/K |  |  |
| `periods.calculate` | TÍNH GIÁ: tạo kỳ (nếu chưa có) hoặc tính lại; ghi kết quả + chi tiết + BKVC trong 1 CALC_RUN | A/K | 🔒 CALC_RUN, KY_TINH, TRANSPORT_CALCULATION, TRANSPORT_DETAIL, FUEL_DETAIL, BKVC_LINE | CALC/RECALC |
| `periods.get` | Chi tiết kỳ: kết quả hiện hành, BKVC, lịch sử các lần tính | A/K/X |  |  |
| `periods.confirm` | Xác nhận kỳ: NHAP → DA_XAC_NHAN; usage_state = CONFIRMED; PRICE_HISTORY.is_used = TRUE | A/K | 🔒 KY_TINH, TRANSPORT_DETAIL, FUEL_DETAIL, CALC_RUN, PRICE_HISTORY | CONFIRM |
| `periods.lock` | Khóa kỳ: DA_XAC_NHAN → DA_KHOA; usage_state = LOCKED | A/K | 🔒 KY_TINH, TRANSPORT_DETAIL, FUEL_DETAIL, CALC_RUN | LOCK |
| `periods.unlock` | Mở khóa: DA_KHOA → DA_XAC_NHAN (cần can_unlock + lý do) | A | 🔒 KY_TINH, TRANSPORT_DETAIL, FUEL_DETAIL, CALC_RUN | UNLOCK |
| `periods.reopen` | Trả về nháp để sửa/tính lại: DA_XAC_NHAN → NHAP (cần can_unlock + lý do) | A | 🔒 KY_TINH, TRANSPORT_DETAIL, FUEL_DETAIL, CALC_RUN | REOPEN |
| `periods.cancel` | Hủy kỳ nháp: NHAP → HUY; usage_state = RELEASED | A/K | 🔒 KY_TINH, TRANSPORT_DETAIL, FUEL_DETAIL, CALC_RUN | CANCEL |
| `calc.trace` | XEM CHI TIẾT TÍNH: chuỗi công thức từng bước + link nguồn | A/K/X |  |  |
| `calc.tickets` | Phiếu cân cấu thành 1 dòng kết quả | A/K/X |  |  |
| `calc.fuel` | Dòng dầu cấu thành 1 dòng kết quả | A/K/X |  |  |

### 4.11. Kiểm tra dữ liệu

| Action | Mô tả | Quyền | Ghi | Audit |
|---|---|---|---|---|
| `validation.run` | Màn hình KIỂM TRA DỮ LIỆU: quét lỗi theo phạm vi | A/K/X |  |  |

### 4.12. Báo cáo

| Action | Mô tả | Quyền | Ghi | Audit |
|---|---|---|---|---|
| `reports.bkvc` | Dữ liệu Bảng xác nhận KL (đã làm tròn, bằng chữ, người ký) | A/K/X |  |  |
| `reports.bkct` | Bảng kê chi tiết phiếu cân của kỳ (16 cột gốc) | A/K/X |  |  |
| `reports.pricing` | Bảng tính đơn giá VC của kỳ (17 cột như QR_DGVC (2)) | A/K/X |  |  |
| `reports.export` | Xuất file ra đường dẫn đã chọn (XLSX: exceljs; PDF: in HTML báo cáo bằng printToPDF; CSV: UTF-8 BOM) | A/K/X |  | EXPORT |
| `reports.print` | In trực tiếp BKVC / BKCT (hộp thoại in của Windows) | A/K/X |  | PRINT |
| `dashboard.summary` | Dashboard | A/K/X |  |  |

### 4.13. Quản trị

| Action | Mô tả | Quyền | Ghi | Audit |
|---|---|---|---|---|
| `audit.list` | Lịch sử thao tác | A/K/X |  |  |
| `users.resetPassword` | ADMIN xóa mật khẩu của user → user tự đặt lại khi đăng nhập (must_change_password) | A | 🔒 USERS | RESET_PASSWORD |
| `users.list` | Danh sách người dùng | A |  |  |
| `users.save` | Thêm / sửa người dùng, gán đơn vị, quyền (mật khẩu KHÔNG đi qua API này) | A | 🔒 USERS | USER_SAVE |
| `config.list` | Tham số cấu hình | A/K/X |  |  |
| `config.save` | Sửa tham số (làm tròn, VAT, người ký…) — áp dụng cho kỳ tính SAU; kỳ cũ giữ snapshot | A | 🔒 CONFIG | CONFIG_UPDATE |

### 4.14. Dữ liệu

| Action | Mô tả | Quyền | Ghi | Audit |
|---|---|---|---|---|
| `data.backupNow` | Sao lưu ngay toàn bộ thư mục dữ liệu thành 1 file .zip (backups/manual) | A/K |  | BACKUP |
| `data.listBackups` | Danh sách bản sao lưu (ngày / tháng / thủ công) | A |  |  |
| `data.restore` | Khôi phục từ 1 bản sao lưu: tự sao lưu hiện trạng trước, thay thư mục tables/, mở lại APP | A |  | RESTORE |
| `data.changeFolder` | Chuyển thư mục dữ liệu sang vị trí khác (copy + kiểm SHA-256 + đổi cấu hình) | A |  | CHANGE_FOLDER |

### 4.15. Trao đổi

| Action | Mô tả | Quyền | Ghi | Audit |
|---|---|---|---|---|
| `exchange.exportPackage` | Xuất gói .dgvc (JSON nén + SHA-256): DANH_MUC (đơn vị, xe, tuyến, giá, HĐ liên quan), PHIEU_CAN (theo khoảng ngày / xe), KY_TINH (kỳ đã xác nhận/khóa + chi tiết + BKVC) | A/K | 🔒 EXCHANGE_LOG | EXPORT_PACKAGE |
| `exchange.previewPackage` | Đọc gói, kiểm SHA-256 + schemaVersion, so với dữ liệu hiện có → mới / cập nhật / giống / xung đột. KHÔNG ghi | A/K | 🔒 EXCHANGE_LOG | IMPORT_PACKAGE_PREVIEW |
| `exchange.importPackage` | Nhập gói theo quy tắc gộp (§ Trao đổi); kỳ nhận về là IMPORTED — chỉ xem | A/K | 🔒 DON_VI, XE, TUYEN_VC, PRICE_HISTORY, HOP_DONG, HOP_DONG_XE, PHIEU_CAN, KY_TINH, TRANSPORT_CALCULATION, TRANSPORT_DETAIL, FUEL_DETAIL, BKVC_LINE, GIAO_NHAN_DAU, EXCHANGE_LOG | IMPORT_PACKAGE |
| `exchange.list` | Lịch sử gói đã xuất / nhập | A/K/X |  |  |


## 5. Chi tiết từng action

#### `setup.status`

Lần mở đầu: đã có thư mục dữ liệu chưa, bản cài của đơn vị nào, còn user chưa đặt mật khẩu không. Quyền: (chưa đăng nhập).

Không tham số.

- **Trả về:** `{initialized, dataFolder, installId, installCode, unitCode, schemaVersion, usersNeedPassword:[username]}`

#### `setup.init`

Tạo thư mục dữ liệu mới (chọn đơn vị của bản cài, ADMIN đầu tiên) hoặc mở thư mục có sẵn / nhận gói DANH_MUC ban đầu. Quyền: (chưa đăng nhập).

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `mode` | enum(NEW/OPEN_EXISTING) | ✔ |  |
| `dataFolder` | string | ✔ | đường dẫn đã chọn bằng dialog.openFolder |
| `unitCode` | string |  | bắt buộc khi NEW |
| `admin` | object |  | {username, fullName, password} khi NEW |
| `catalogPackagePath` | string |  | gói DANH_MUC để nạp danh mục ban đầu |

- **Trả về:** `{manifest}`
- **Lỗi:** `VALIDATION_FAILED`, `STORAGE_ERROR`, `INTEGRITY_ERROR`, `DATA_LOCKED`
- **Ghi:** USERS, CONFIG, DON_VI, XE, TUYEN_VC, PRICE_HISTORY · AUDIT `SETUP`

#### `auth.login`

Đăng nhập tài khoản nội bộ → sessionToken (giữ trong bộ nhớ main process). Quyền: (chưa đăng nhập).

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `username` | string | ✔ |  |
| `password` | string | ✔ |  |

- **Trả về:** `{sessionToken, user:{username, fullName, role, unitCode, canUnlock}, mustChangePassword}`
- **Lỗi:** `AUTH_FAILED`, `ACCOUNT_LOCKED`, `PASSWORD_NOT_SET`
- **Đọc:** USERS
- **Ghi:** USERS · AUDIT `LOGIN`

#### `auth.setFirstPassword`

User chưa có mật khẩu (dữ liệu mẫu / ADMIN vừa tạo) đặt mật khẩu lần đầu. Quyền: (chưa đăng nhập).

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `username` | string | ✔ |  |
| `newPassword` | string | ✔ | ≥ 8 ký tự, có chữ và số |

- **Trả về:** `{ok}`
- **Lỗi:** `VALIDATION_FAILED`, `BUSINESS_RULE:E_PASSWORD_ALREADY_SET`
- **Đọc:** USERS
- **Ghi:** USERS · AUDIT `SET_PASSWORD`

#### `auth.changePassword`

Đổi mật khẩu. Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `oldPassword` | string | ✔ |  |
| `newPassword` | string | ✔ |  |

- **Trả về:** `{ok}`
- **Lỗi:** `AUTH_FAILED`, `VALIDATION_FAILED`
- **Đọc:** USERS
- **Ghi:** USERS · AUDIT `CHANGE_PASSWORD`

#### `auth.logout`

Đăng xuất (hủy session). Quyền: ADMIN, KE_TOAN, XEM.

Không tham số.

- **Trả về:** `{ok}`

#### `auth.me`

Người dùng hiện tại, quyền, đơn vị bản cài. Quyền: ADMIN, KE_TOAN, XEM.

Không tham số.

- **Trả về:** `{username, fullName, role, unitCode, canUnlock, installUnitCode, permissions: [action]}`
- **Lỗi:** `SESSION_EXPIRED`
- **Đọc:** USERS

#### `meta.bootstrap`

Tải khi mở APP: danh mục, enum, cấu hình hiển thị, mã lỗi, thông tin bản cài. Quyền: ADMIN, KE_TOAN, XEM.

Không tham số.

- **Trả về:** `{install:{installId, installCode, unitCode, dataFolder}, units, vehicles, routes, activePrices, contracts (vai trò: CARRIER|CUSTOMER), config, enums, errorCodes, dataVersion}`
- **Đọc:** DON_VI, XE, TUYEN_VC, PRICE_HISTORY, HOP_DONG, HOP_DONG_XE, CONFIG

#### `system.health`

Kiểm tra toàn vẹn: manifest, SHA-256 từng file, journal dở dang, dung lượng, lần sao lưu gần nhất. Quyền: ADMIN.

Không tham số.

- **Trả về:** `{schemaVersion, files:[{path, rows, sizeBytes, sha256Ok}], pendingJournal, lastBackupAt, freeDiskBytes}`
- **Lỗi:** `INTEGRITY_ERROR`

#### `dialog.openFile`

Hộp thoại chọn file (Excel / gói .dgvc). Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `filters` | array<{name, extensions}> |  |  |

- **Trả về:** `{path|null}`

#### `dialog.openFolder`

Hộp thoại chọn thư mục. Quyền: (chưa đăng nhập).

Không tham số.

- **Trả về:** `{path|null}`

#### `dialog.saveFile`

Hộp thoại chọn nơi lưu file xuất. Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `defaultName` | string | ✔ |  |
| `filters` | array |  |  |

- **Trả về:** `{path|null}`

#### `system.openPath`

Mở file / thư mục bằng Windows Explorer (sau khi xuất file). Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `path` | string | ✔ |  |

- **Trả về:** `{ok}`

#### `units.list`

Danh sách đơn vị. Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `q` | string |  | tìm kiếm |
| `includeInactive` | boolean |  |  |
| `page` | integer |  | mặc định 1 |
| `pageSize` | integer |  | mặc định 100, tối đa 1000 |
| `sort` | string |  | vd `weigh1_date:desc` |

- **Trả về:** `{items:[…], total}`
- **Đọc:** DON_VI

#### `units.save`

Thêm / sửa đơn vị. Quyền: ADMIN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `record` | object | ✔ | bản ghi DON_VI (camelCase) |
| `rowVersion` | integer |  | bắt buộc khi sửa |

- **Trả về:** `{record}`
- **Lỗi:** `VALIDATION_FAILED`, `DUPLICATE`, `CONFLICT_VERSION`
- **Đọc:** DON_VI
- **Ghi:** DON_VI · AUDIT `CREATE/UPDATE`

#### `units.setActive`

Ngừng / dùng lại đơn vị (không xóa cứng). Quyền: ADMIN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `unitCode` | string | ✔ |  |
| `active` | boolean | ✔ |  |
| `rowVersion` | integer | ✔ | row_version đang có ở client — sai → CONFLICT_VERSION |

- **Trả về:** `{record}`
- **Lỗi:** `NOT_FOUND`, `CONFLICT_VERSION`, `BUSINESS_RULE:E_IN_USE`
- **Đọc:** DON_VI
- **Ghi:** DON_VI · AUDIT `SET_ACTIVE`

#### `vehicles.list`

Danh sách xe. Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `q` | string |  | tìm kiếm |
| `includeInactive` | boolean |  |  |
| `page` | integer |  | mặc định 1 |
| `pageSize` | integer |  | mặc định 100, tối đa 1000 |
| `sort` | string |  | vd `weigh1_date:desc` |

- **Trả về:** `{items:[…], total}`
- **Đọc:** XE

#### `vehicles.save`

Thêm / sửa xe. Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `record` | object | ✔ | bản ghi XE (camelCase) |
| `rowVersion` | integer |  | bắt buộc khi sửa |

- **Trả về:** `{record}`
- **Lỗi:** `VALIDATION_FAILED`, `DUPLICATE`, `CONFLICT_VERSION`
- **Đọc:** XE
- **Ghi:** XE · AUDIT `CREATE/UPDATE`

#### `vehicles.setActive`

Ngừng / dùng lại xe (không xóa cứng). Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `plateNo` | string | ✔ |  |
| `active` | boolean | ✔ |  |
| `rowVersion` | integer | ✔ | row_version đang có ở client — sai → CONFLICT_VERSION |

- **Trả về:** `{record}`
- **Lỗi:** `NOT_FOUND`, `CONFLICT_VERSION`, `BUSINESS_RULE:E_IN_USE`
- **Đọc:** XE
- **Ghi:** XE · AUDIT `SET_ACTIVE`

#### `routes.list`

Danh sách tuyến. Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `q` | string |  | tìm kiếm |
| `includeInactive` | boolean |  |  |
| `page` | integer |  | mặc định 1 |
| `pageSize` | integer |  | mặc định 100, tối đa 1000 |
| `sort` | string |  | vd `weigh1_date:desc` |

- **Trả về:** `{items:[…], total}`
- **Đọc:** TUYEN_VC

#### `routes.save`

Thêm / sửa tuyến. Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `record` | object | ✔ | bản ghi TUYEN_VC (camelCase) |
| `rowVersion` | integer |  | bắt buộc khi sửa |

- **Trả về:** `{record}`
- **Lỗi:** `VALIDATION_FAILED`, `DUPLICATE`, `CONFLICT_VERSION`
- **Đọc:** TUYEN_VC
- **Ghi:** TUYEN_VC · AUDIT `CREATE/UPDATE`

#### `routes.setActive`

Ngừng / dùng lại tuyến (không xóa cứng). Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `routeCode` | string | ✔ |  |
| `active` | boolean | ✔ |  |
| `rowVersion` | integer | ✔ | row_version đang có ở client — sai → CONFLICT_VERSION |

- **Trả về:** `{record}`
- **Lỗi:** `NOT_FOUND`, `CONFLICT_VERSION`, `BUSINESS_RULE:E_IN_USE`
- **Đọc:** TUYEN_VC
- **Ghi:** TUYEN_VC · AUDIT `SET_ACTIVE`

#### `vehicles.resolvePlate`

Chuẩn hóa mã xe bất kỳ (`DH_92H00192`, `92H00195`) → biển số chuẩn. Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `codes` | array<string> | ✔ |  |

- **Trả về:** `{results:[{input, plateNo|null, ownerUnitCode}]}`
- **Đọc:** XE

#### `prices.list`

Lịch sử phiên bản giá theo tuyến (+ hợp đồng). Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `routeCode` | string |  |  |
| `contractId` | string |  | trống = giá chung |
| `status` | enum(DRAFT/ACTIVE/CLOSED) |  |  |

- **Trả về:** `{items:[PRICE_HISTORY + contractPrice tính sẵn]}`
- **Đọc:** PRICE_HISTORY

#### `prices.preview`

Tính Tầng A (ĐG 1 chuyến → ĐG_HĐ) cho 1 bộ tham số, không lưu — dùng khi nhập giá mới. Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `record` | object | ✔ | tham số giá + tuyến |

- **Trả về:** `{tripPrice, fuelPerTrip, fuelCostPerTrip, fuelCostRatio, priceNoDiesel, contractPrice, trace}`
- **Lỗi:** `VALIDATION_FAILED`
- **Đọc:** TUYEN_VC, CONFIG

#### `prices.createVersion`

Tạo phiên bản giá mới (DRAFT); phiên bản cũ không bị sửa. Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `record` | object | ✔ | routeCode, contractId?, effectiveFrom, newPrice, fuelPriceExclVat, fuelNormLPerKm, avgLoadTon, avgVolumeM3, basePriceExclVat, sourceNote |

- **Trả về:** `{record, contractPrice}`
- **Lỗi:** `VALIDATION_FAILED`, `BUSINESS_RULE:E_PRICE_DATE_OVERLAP`
- **Đọc:** PRICE_HISTORY
- **Ghi:** PRICE_HISTORY · AUDIT `PRICE_CREATE`

#### `prices.updateDraft`

Sửa phiên bản DRAFT (cấm khi ACTIVE đã dùng). Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `priceId` | string | ✔ |  |
| `record` | object | ✔ |  |
| `rowVersion` | integer | ✔ | row_version đang có ở client — sai → CONFLICT_VERSION |

- **Trả về:** `{record}`
- **Lỗi:** `BUSINESS_RULE:E_PRICE_USED`, `CONFLICT_VERSION`
- **Đọc:** PRICE_HISTORY
- **Ghi:** PRICE_HISTORY · AUDIT `PRICE_UPDATE`

#### `prices.activate`

Kích hoạt DRAFT → ACTIVE; tự đóng phiên bản trước (effective_to = ngày mới − 1). Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `priceId` | string | ✔ |  |
| `rowVersion` | integer | ✔ | row_version đang có ở client — sai → CONFLICT_VERSION |

- **Trả về:** `{activated, closed}`
- **Lỗi:** `BUSINESS_RULE:E_PRICE_DATE_OVERLAP`
- **Đọc:** PRICE_HISTORY
- **Ghi:** PRICE_HISTORY · AUDIT `PRICE_ACTIVATE`

#### `contracts.list`

Danh sách hợp đồng (KE_TOAN chỉ thấy HĐ đơn vị mình là bên VC hoặc bên thuê). Quyền: ADMIN, KE_TOAN, XEM. Phạm vi: unit_code ∈ {carrier, customer}; ADMIN: tất cả.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `includeInactive` | boolean |  |  |

- **Trả về:** `{items:[HOP_DONG + signers đã xác định + vehicleCount]}`
- **Đọc:** HOP_DONG, HOP_DONG_XE, DON_VI

#### `contracts.save`

Tạo / sửa hợp đồng: số HĐ, ngày hiệu lực, bên thuê, bên VC (người dùng tự điền). Quyền: ADMIN, KE_TOAN. Phạm vi: chỉ HĐ mà đơn vị bản cài là bên VC.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `record` | object | ✔ |  |
| `rowVersion` | integer |  | khi sửa |

- **Trả về:** `{record}`
- **Lỗi:** `VALIDATION_FAILED`, `DUPLICATE`, `BUSINESS_RULE:E_SAME_PARTY`, `BUSINESS_RULE:E_NOT_CARRIER`
- **Đọc:** HOP_DONG, DON_VI
- **Ghi:** HOP_DONG · AUDIT `CREATE/UPDATE`

#### `contracts.setVehicles`

Ghi phạm vi xe (danh sách + hiệu lực). Quyền: ADMIN, KE_TOAN. Phạm vi: như contracts.save.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `contractId` | string | ✔ |  |
| `vehicles` | array<{plateNo, effectiveFrom, effectiveTo?}> | ✔ |  |

- **Trả về:** `{items}`
- **Lỗi:** `VALIDATION_FAILED`, `NOT_FOUND`
- **Đọc:** HOP_DONG_XE, XE
- **Ghi:** HOP_DONG_XE · AUDIT `CONTRACT_VEHICLES`

#### `contracts.suggestVehicles`

Gợi ý phạm vi xe = xe bên VC + xe của các HĐ mà bên VC là bên thuê. Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `contractId` | string | ✔ |  |

- **Trả về:** `{plates:[{plateNo, ownerUnitCode, reason}]}`
- **Đọc:** XE, HOP_DONG, HOP_DONG_XE

#### `contracts.resolveSigners`

Người ký 2 bên theo sign_priority (hoặc giá trị ghi đè). Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `contractId` | string | ✔ |  |

- **Trả về:** `{carrier:{unit, signer:{name,title}, accountant}, customer:{…}, source: RULE|OVERRIDE}`
- **Đọc:** HOP_DONG, DON_VI, CONFIG

#### `tickets.list`

Tra cứu phiếu cân. Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `dateFrom` | date |  |  |
| `dateTo` | date |  |  |
| `routeCode` | string |  |  |
| `plateNo` | string |  |  |
| `ownerUnitCode` | string |  |  |
| `contractId` | string |  | kèm trạng thái sử dụng theo HĐ này |
| `usage` | enum(CHUA_TINH/DA_DUA_VAO_KY/DA_XAC_NHAN/DA_KHOA) |  | cần contractId |
| `hasFlags` | boolean |  |  |
| `q` | string |  | số phiếu / biển số |
| `page` | integer |  | mặc định 1 |
| `pageSize` | integer |  | mặc định 100, tối đa 1000 |
| `sort` | string |  | vd `weigh1_date:desc` |

- **Trả về:** `{items:[PHIEU_CAN + usageByContract:[{contractCode, periodCode, state}]], total, sums:{trips, kg}}`
- **Đọc:** PHIEU_CAN, TRANSPORT_DETAIL, KY_TINH

#### `tickets.get`

Chi tiết 1 phiếu + các kỳ đã dùng + audit. Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `ticketId` | string | ✔ |  |

- **Trả về:** `{record, usages, raw, audit}`
- **Lỗi:** `NOT_FOUND`
- **Đọc:** PHIEU_CAN, TRANSPORT_DETAIL, AUDIT_LOG

#### `tickets.update`

Sửa phiếu — cấm nếu đang ở kỳ DA_XAC_NHAN/DA_KHOA; kỳ NHAP → needs_recalc. Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `ticketId` | string | ✔ |  |
| `changes` | object | ✔ |  |
| `rowVersion` | integer | ✔ | row_version đang có ở client — sai → CONFLICT_VERSION |

- **Trả về:** `{record, affectedPeriods}`
- **Lỗi:** `CONFLICT_VERSION`, `BUSINESS_RULE:E_TICKET_LOCKED`, `VALIDATION_FAILED`, `DUPLICATE`
- **Đọc:** PHIEU_CAN, TRANSPORT_DETAIL
- **Ghi:** PHIEU_CAN, KY_TINH · AUDIT `UPDATE`

#### `tickets.softDelete`

Xóa mềm (cấm nếu đang dùng ở kỳ chưa hủy). Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `ticketId` | string | ✔ |  |
| `reason` | string | ✔ |  |
| `rowVersion` | integer | ✔ | row_version đang có ở client — sai → CONFLICT_VERSION |

- **Trả về:** `{record}`
- **Lỗi:** `BUSINESS_RULE:E_IN_USE`
- **Đọc:** PHIEU_CAN, TRANSPORT_DETAIL
- **Ghi:** PHIEU_CAN · AUDIT `DELETE`

#### `tickets.ackFlags`

Xác nhận cảnh báo (giữ nguyên dữ liệu). Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `ticketIds` | array<string> | ✔ |  |
| `note` | string | ✔ |  |

- **Trả về:** `{updated}`
- **Đọc:** PHIEU_CAN
- **Ghi:** PHIEU_CAN · AUDIT `ACK_FLAGS`

#### `fuel.list`

Bảng kê dầu theo hợp đồng. Quyền: ADMIN, KE_TOAN, XEM. Phạm vi: hợp đồng của đơn vị bản cài (bên VC hoặc bên thuê).

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `contractId` | string | ✔ |  |
| `dateFrom` | date |  |  |
| `dateTo` | date |  |  |
| `plateNo` | string |  |  |
| `usage` | enum(CHUA_TINH/DA_DUA_VAO_KY/DA_XAC_NHAN/DA_KHOA) |  |  |
| `hasFlags` | boolean |  |  |
| `page` | integer |  | mặc định 1 |
| `pageSize` | integer |  | mặc định 100, tối đa 1000 |
| `sort` | string |  | vd `weigh1_date:desc` |

- **Trả về:** `{items, total, sums:{liters, avgPrice}}`
- **Đọc:** GIAO_NHAN_DAU, FUEL_DETAIL

#### `fuel.saveRows`

Nhập tay nhiều dòng dầu cho 1 hợp đồng (validate như import). Quyền: ADMIN, KE_TOAN. Phạm vi: như contracts.save.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `contractId` | string | ✔ |  |
| `rows` | array<object> | ✔ |  |

- **Trả về:** `{saved, rowResults}`
- **Lỗi:** `VALIDATION_FAILED`, `BUSINESS_RULE:E_NOT_CARRIER`
- **Đọc:** GIAO_NHAN_DAU, XE
- **Ghi:** GIAO_NHAN_DAU · AUDIT `CREATE`

#### `fuel.update`

Sửa 1 dòng dầu (luật như tickets.update). Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `receiptId` | string | ✔ |  |
| `changes` | object | ✔ |  |
| `rowVersion` | integer | ✔ | row_version đang có ở client — sai → CONFLICT_VERSION |

- **Trả về:** `{record, affectedPeriods}`
- **Lỗi:** `CONFLICT_VERSION`, `BUSINESS_RULE:E_FUEL_LOCKED`
- **Đọc:** GIAO_NHAN_DAU, FUEL_DETAIL
- **Ghi:** GIAO_NHAN_DAU, KY_TINH · AUDIT `UPDATE`

#### `fuel.softDelete`

Xóa mềm dòng dầu. Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `receiptId` | string | ✔ |  |
| `reason` | string | ✔ |  |
| `rowVersion` | integer | ✔ | row_version đang có ở client — sai → CONFLICT_VERSION |

- **Trả về:** `{record}`
- **Lỗi:** `BUSINESS_RULE:E_IN_USE`
- **Đọc:** GIAO_NHAN_DAU, FUEL_DETAIL
- **Ghi:** GIAO_NHAN_DAU · AUDIT `DELETE`

#### `fuel.ackFlags`

Xác nhận cảnh báo dòng dầu (vd nghi trùng nhưng không trùng). Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `receiptIds` | array<string> | ✔ |  |
| `note` | string | ✔ |  |

- **Trả về:** `{updated}`
- **Đọc:** GIAO_NHAN_DAU
- **Ghi:** GIAO_NHAN_DAU · AUDIT `ACK_FLAGS`

#### `import.preview`

Bước 1: main process đọc file Excel/CSV theo đường dẫn → gợi ý mapping, kiểm tra từng dòng, giữ dữ liệu tạm trong bộ nhớ theo batchId. KHÔNG ghi dữ liệu. Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `importType` | enum(PHIEU_CAN/GIAO_NHAN_DAU) | ✔ |  |
| `contractId` | string |  | bắt buộc với GIAO_NHAN_DAU; HĐ bên VC = đơn vị bản cài |
| `filePath` | string | ✔ | từ dialog.openFile |
| `sheetName` | string |  | trống = sheet đầu / tự dò sheet có header phù hợp |
| `headerRow` | integer |  | trống = tự dò |
| `mapping` | object |  | trống = tự gợi ý; gửi lại để preview với mapping mới |

- **Trả về:** `{batchId, fileSha256, sameFileImportedBefore, sheets, mapping, summary:{total, ok, warning, error, duplicate}, rows:[{rowNo, status, flags:[code], normalized}] (trang đầu), page}`
- **Lỗi:** `VALIDATION_FAILED`, `BUSINESS_RULE:E_MAPPING_REQUIRED`, `BUSINESS_RULE:E_NOT_CARRIER`, `STORAGE_ERROR`
- **Đọc:** PHIEU_CAN, GIAO_NHAN_DAU, XE, TUYEN_VC, DON_VI, IMPORT_BATCH
- **Ghi:** IMPORT_BATCH · AUDIT `IMPORT_PREVIEW`

#### `import.previewRows`

Xem trang tiếp theo / lọc dòng lỗi của lô đang preview. Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `batchId` | string | ✔ |  |
| `status` | enum(OK/WARNING/ERROR) |  |  |
| `page` | integer |  | mặc định 1 |
| `pageSize` | integer |  | mặc định 100, tối đa 1000 |
| `sort` | string |  | vd `weigh1_date:desc` |

- **Trả về:** `{rows, total}`
- **Lỗi:** `NOT_FOUND`

#### `import.confirm`

Bước 2: kiểm tra lại (dữ liệu có thể đã đổi) → ghi 1 giao dịch. Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `batchId` | string | ✔ |  |
| `skipRowNos` | array<integer> |  | dòng người dùng bỏ |
| `acceptWarnings` | boolean | ✔ |  |
| `clientRequestId` | string | ✔ | chống bấm 2 lần |

- **Trả về:** `{inserted, skipped, errors, batch}`
- **Lỗi:** `BUSINESS_RULE:E_PREVIEW_STALE`, `BUSINESS_RULE:E_IMPORT_HAS_ERRORS`, `DUPLICATE`, `STORAGE_ERROR`
- **Đọc:** PHIEU_CAN, GIAO_NHAN_DAU, XE
- **Ghi:** PHIEU_CAN, GIAO_NHAN_DAU, IMPORT_BATCH · AUDIT `IMPORT_CONFIRM`

#### `import.cancel`

Hủy lô PREVIEW. Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `batchId` | string | ✔ |  |

- **Trả về:** `{batch}`
- **Đọc:** IMPORT_BATCH
- **Ghi:** IMPORT_BATCH · AUDIT `IMPORT_CANCEL`

#### `import.list`

Lịch sử import. Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `importType` | string |  |  |
| `page` | integer |  | mặc định 1 |
| `pageSize` | integer |  | mặc định 100, tối đa 1000 |
| `sort` | string |  | vd `weigh1_date:desc` |

- **Trả về:** `{items, total}`
- **Đọc:** IMPORT_BATCH

#### `periods.list`

Danh sách kỳ. Quyền: ADMIN, KE_TOAN, XEM. Phạm vi: hợp đồng của đơn vị bản cài (bên VC hoặc bên thuê).

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `contractId` | string |  |  |
| `status` | enum(NHAP/DA_XAC_NHAN/DA_KHOA/HUY) |  |  |
| `dateFrom` | date |  |  |
| `dateTo` | date |  |  |
| `page` | integer |  | mặc định 1 |
| `pageSize` | integer |  | mặc định 100, tối đa 1000 |
| `sort` | string |  | vd `weigh1_date:desc` |

- **Trả về:** `{items:[KY_TINH + tóm tắt kết quả], total}`
- **Đọc:** KY_TINH, TRANSPORT_CALCULATION

#### `periods.preview`

Chọn HĐ + Từ–Đến ngày (+ tuyến) → ứng viên phiếu/dầu, lỗi, cảnh báo, kết quả dự tính. KHÔNG ghi. Quyền: ADMIN, KE_TOAN. Phạm vi: chỉ HĐ mà đơn vị bản cài là bên VC.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `contractId` | string | ✔ |  |
| `dateFrom` | date | ✔ |  |
| `dateTo` | date | ✔ |  |
| `routeCode` | string |  |  |
| `periodId` | string |  | khi tính lại kỳ đã có |

- **Trả về:** `{candidates:{tickets:[…], fuel:[…]}, blocked:[{ticketId, code, periodCode}], issues:[{code, level, message, refs}], results:[…như calculate…], canCalculate}`
- **Lỗi:** `BUSINESS_RULE:E_NOT_CARRIER`, `BUSINESS_RULE:E_CONTRACT_INACTIVE`
- **Đọc:** PHIEU_CAN, GIAO_NHAN_DAU, HOP_DONG, HOP_DONG_XE, PRICE_HISTORY, TUYEN_VC, TRANSPORT_DETAIL, FUEL_DETAIL, KY_TINH, CONFIG

#### `periods.calculate`

TÍNH GIÁ: tạo kỳ (nếu chưa có) hoặc tính lại; ghi kết quả + chi tiết + BKVC trong 1 CALC_RUN. Quyền: ADMIN, KE_TOAN. Phạm vi: như periods.preview.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `contractId` | string | ✔ |  |
| `dateFrom` | date | ✔ |  |
| `dateTo` | date | ✔ |  |
| `routeCode` | string |  |  |
| `periodId` | string |  | tính lại |
| `excludeTicketIds` | array<string> |  | bỏ khỏi kỳ |
| `excludeReceiptIds` | array<string> |  |  |
| `moveFromDraft` | boolean |  | cho phép lấy phiếu đang ở kỳ NHAP khác (BL-34) |
| `overrides` | array<{code, routeCode, reason}> |  | vd E_NO_FUEL cho phép dầu = 0 (cần lý do) |
| `reportDate` | date |  | ngày ký BKVC |
| `clientRequestId` | string | ✔ | chống bấm 2 lần |

- **Trả về:** `{period, runId, results:[TRANSPORT_CALCULATION], bkvc:{lines, totals}, issues}`
- **Lỗi:** `BUSINESS_RULE:E_TICKET_USED_IN_PERIOD`, `BUSINESS_RULE:E_PERIOD_STATUS`, `BUSINESS_RULE:E_CALC_BLOCKED`, `BUSINESS_RULE:E_READONLY_IMPORTED`, `STORAGE_ERROR`, `CONFLICT_VERSION`
- **Đọc:** PHIEU_CAN, GIAO_NHAN_DAU, HOP_DONG, HOP_DONG_XE, PRICE_HISTORY, TUYEN_VC, TRANSPORT_DETAIL, FUEL_DETAIL, KY_TINH, CONFIG
- **Ghi:** CALC_RUN, KY_TINH, TRANSPORT_CALCULATION, TRANSPORT_DETAIL, FUEL_DETAIL, BKVC_LINE · AUDIT `CALC/RECALC`

#### `periods.get`

Chi tiết kỳ: kết quả hiện hành, BKVC, lịch sử các lần tính. Quyền: ADMIN, KE_TOAN, XEM. Phạm vi: hợp đồng của đơn vị bản cài (bên VC hoặc bên thuê).

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `periodId` | string | ✔ |  |
| `include` | array<enum(results/bkvc/runs/issues)> |  |  |

- **Trả về:** `{period, results, bkvc, runs, issues}`
- **Lỗi:** `NOT_FOUND`
- **Đọc:** KY_TINH, TRANSPORT_CALCULATION, BKVC_LINE, CALC_RUN

#### `periods.confirm`

Xác nhận kỳ: NHAP → DA_XAC_NHAN; usage_state = CONFIRMED; PRICE_HISTORY.is_used = TRUE. Quyền: ADMIN, KE_TOAN. Phạm vi: bên VC của HĐ.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `periodId` | string | ✔ |  |
| `rowVersion` | integer | ✔ | row_version đang có ở client — sai → CONFLICT_VERSION |

- **Trả về:** `{period}`
- **Lỗi:** `BUSINESS_RULE:E_PERIOD_STATUS`, `CONFLICT_VERSION`, `FORBIDDEN`, `BUSINESS_RULE:E_NEEDS_RECALC`
- **Đọc:** KY_TINH
- **Ghi:** KY_TINH, TRANSPORT_DETAIL, FUEL_DETAIL, CALC_RUN, PRICE_HISTORY · AUDIT `CONFIRM`

#### `periods.lock`

Khóa kỳ: DA_XAC_NHAN → DA_KHOA; usage_state = LOCKED. Quyền: ADMIN, KE_TOAN. Phạm vi: bên VC của HĐ.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `periodId` | string | ✔ |  |
| `rowVersion` | integer | ✔ | row_version đang có ở client — sai → CONFLICT_VERSION |

- **Trả về:** `{period}`
- **Lỗi:** `BUSINESS_RULE:E_PERIOD_STATUS`, `CONFLICT_VERSION`, `FORBIDDEN`
- **Đọc:** KY_TINH
- **Ghi:** KY_TINH, TRANSPORT_DETAIL, FUEL_DETAIL, CALC_RUN · AUDIT `LOCK`

#### `periods.unlock`

Mở khóa: DA_KHOA → DA_XAC_NHAN (cần can_unlock + lý do). Quyền: ADMIN. Phạm vi: bên VC của HĐ; hoặc user can_unlock.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `periodId` | string | ✔ |  |
| `rowVersion` | integer | ✔ | row_version đang có ở client — sai → CONFLICT_VERSION |
| `reason` | string | ✔ | bắt buộc |

- **Trả về:** `{period}`
- **Lỗi:** `BUSINESS_RULE:E_PERIOD_STATUS`, `CONFLICT_VERSION`, `FORBIDDEN`
- **Đọc:** KY_TINH
- **Ghi:** KY_TINH, TRANSPORT_DETAIL, FUEL_DETAIL, CALC_RUN · AUDIT `UNLOCK`

#### `periods.reopen`

Trả về nháp để sửa/tính lại: DA_XAC_NHAN → NHAP (cần can_unlock + lý do). Quyền: ADMIN. Phạm vi: bên VC của HĐ; hoặc user can_unlock.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `periodId` | string | ✔ |  |
| `rowVersion` | integer | ✔ | row_version đang có ở client — sai → CONFLICT_VERSION |
| `reason` | string | ✔ |  |

- **Trả về:** `{period}`
- **Lỗi:** `BUSINESS_RULE:E_PERIOD_STATUS`, `CONFLICT_VERSION`, `FORBIDDEN`
- **Đọc:** KY_TINH
- **Ghi:** KY_TINH, TRANSPORT_DETAIL, FUEL_DETAIL, CALC_RUN · AUDIT `REOPEN`

#### `periods.cancel`

Hủy kỳ nháp: NHAP → HUY; usage_state = RELEASED. Quyền: ADMIN, KE_TOAN. Phạm vi: bên VC của HĐ.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `periodId` | string | ✔ |  |
| `rowVersion` | integer | ✔ | row_version đang có ở client — sai → CONFLICT_VERSION |
| `reason` | string | ✔ |  |

- **Trả về:** `{period}`
- **Lỗi:** `BUSINESS_RULE:E_PERIOD_STATUS`, `CONFLICT_VERSION`, `FORBIDDEN`
- **Đọc:** KY_TINH
- **Ghi:** KY_TINH, TRANSPORT_DETAIL, FUEL_DETAIL, CALC_RUN · AUDIT `CANCEL`

#### `calc.trace`

XEM CHI TIẾT TÍNH: chuỗi công thức từng bước + link nguồn. Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `calcId` | string | ✔ |  |

- **Trả về:** `{trace (xem §6), priceVersion, config}`
- **Lỗi:** `NOT_FOUND`
- **Đọc:** TRANSPORT_CALCULATION, PRICE_HISTORY

#### `calc.tickets`

Phiếu cân cấu thành 1 dòng kết quả. Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `calcId` | string | ✔ |  |
| `plateNo` | string |  |  |
| `page` | integer |  | mặc định 1 |
| `pageSize` | integer |  | mặc định 100, tối đa 1000 |
| `sort` | string |  | vd `weigh1_date:desc` |

- **Trả về:** `{items:[TRANSPORT_DETAIL ⨝ PHIEU_CAN], total, sums}`
- **Lỗi:** `NOT_FOUND`
- **Đọc:** TRANSPORT_DETAIL, PHIEU_CAN

#### `calc.fuel`

Dòng dầu cấu thành 1 dòng kết quả. Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `calcId` | string | ✔ |  |

- **Trả về:** `{items, sums}`
- **Lỗi:** `NOT_FOUND`
- **Đọc:** FUEL_DETAIL, GIAO_NHAN_DAU

#### `validation.run`

Màn hình KIỂM TRA DỮ LIỆU: quét lỗi theo phạm vi. Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `contractId` | string |  |  |
| `dateFrom` | date |  |  |
| `dateTo` | date |  |  |
| `codes` | array<string> |  | lọc mã lỗi |
| `includeAcked` | boolean |  |  |

- **Trả về:** `{summary:[{code, level, count}], issues:[{code, level, message, entity, entityId, fields, suggestedFix}]}`
- **Đọc:** PHIEU_CAN, GIAO_NHAN_DAU, TUYEN_VC, PRICE_HISTORY, XE, HOP_DONG_XE

#### `reports.bkvc`

Dữ liệu Bảng xác nhận KL (đã làm tròn, bằng chữ, người ký). Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `periodId` | string | ✔ |  |

- **Trả về:** `{header:{title, carrier:{name,address,taxCode}, customer:{…}, periodText, reportDate, place, contractNo}, lines, totals:{trips, kg, ton, amount, vat, total}, amountInWords, signers}`
- **Lỗi:** `NOT_FOUND`
- **Đọc:** BKVC_LINE, KY_TINH, HOP_DONG, DON_VI, CONFIG

#### `reports.bkct`

Bảng kê chi tiết phiếu cân của kỳ (16 cột gốc). Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `periodId` | string | ✔ |  |
| `plateNo` | string |  |  |
| `q` | string |  |  |
| `page` | integer |  | mặc định 1 |
| `pageSize` | integer |  | mặc định 100, tối đa 1000 |
| `sort` | string |  | vd `weigh1_date:desc` |

- **Trả về:** `{items, total, sums}`
- **Lỗi:** `NOT_FOUND`
- **Đọc:** TRANSPORT_DETAIL, PHIEU_CAN

#### `reports.pricing`

Bảng tính đơn giá VC của kỳ (17 cột như QR_DGVC (2)). Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `periodId` | string | ✔ |  |

- **Trả về:** `{columns, rows}`
- **Lỗi:** `NOT_FOUND`
- **Đọc:** TRANSPORT_CALCULATION

#### `reports.export`

Xuất file ra đường dẫn đã chọn (XLSX: exceljs; PDF: in HTML báo cáo bằng printToPDF; CSV: UTF-8 BOM). Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `report` | enum(BKVC/BKCT/PRICING/TICKETS/FUEL) | ✔ |  |
| `format` | enum(XLSX/CSV/PDF) | ✔ |  |
| `params` | object | ✔ | như API báo cáo tương ứng |
| `targetPath` | string | ✔ | từ dialog.saveFile |

- **Trả về:** `{path, sizeBytes}`
- **Lỗi:** `NOT_FOUND`, `STORAGE_ERROR`

#### `reports.print`

In trực tiếp BKVC / BKCT (hộp thoại in của Windows). Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `report` | enum(BKVC/BKCT/PRICING) | ✔ |  |
| `params` | object | ✔ |  |

- **Trả về:** `{printed}`

#### `dashboard.summary`

Dashboard. Quyền: ADMIN, KE_TOAN, XEM. Phạm vi: hợp đồng của đơn vị bản cài (bên VC hoặc bên thuê).

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `dateFrom` | date | ✔ |  |
| `dateTo` | date | ✔ |  |
| `routeCode` | string |  |  |
| `contractId` | string |  |  |
| `ownerUnitCode` | string |  |  |

- **Trả về:** `{trips, kg, ton, actualFuel, standardFuel, fuelDiff, avgTransportPrice (bình quân gia quyền theo tấn), routeCount, unassignedTickets, flaggedTickets}`
- **Đọc:** PHIEU_CAN, TRANSPORT_CALCULATION, KY_TINH

#### `audit.list`

Lịch sử thao tác. Quyền: ADMIN, KE_TOAN, XEM. Phạm vi: KE_TOAN/XEM: thao tác trên HĐ mình được xem.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `entity` | string |  |  |
| `entityId` | string |  |  |
| `userEmail` | string |  |  |
| `action` | string |  |  |
| `dateFrom` | date |  |  |
| `dateTo` | date |  |  |
| `page` | integer |  | mặc định 1 |
| `pageSize` | integer |  | mặc định 100, tối đa 1000 |
| `sort` | string |  | vd `weigh1_date:desc` |

- **Trả về:** `{items, total}`
- **Đọc:** AUDIT_LOG

#### `users.resetPassword`

ADMIN xóa mật khẩu của user → user tự đặt lại khi đăng nhập (must_change_password). Quyền: ADMIN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `username` | string | ✔ |  |
| `reason` | string | ✔ |  |

- **Trả về:** `{ok}`
- **Lỗi:** `NOT_FOUND`, `BUSINESS_RULE:E_LAST_ADMIN`
- **Đọc:** USERS
- **Ghi:** USERS · AUDIT `RESET_PASSWORD`

#### `users.list`

Danh sách người dùng. Quyền: ADMIN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `unitCode` | string |  |  |

- **Trả về:** `{items}`
- **Đọc:** USERS

#### `users.save`

Thêm / sửa người dùng, gán đơn vị, quyền (mật khẩu KHÔNG đi qua API này). Quyền: ADMIN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `record` | object | ✔ |  |
| `rowVersion` | integer |  |  |

- **Trả về:** `{record}`
- **Lỗi:** `VALIDATION_FAILED`, `DUPLICATE`, `BUSINESS_RULE:E_LAST_ADMIN`
- **Đọc:** USERS
- **Ghi:** USERS · AUDIT `USER_SAVE`

#### `config.list`

Tham số cấu hình. Quyền: ADMIN, KE_TOAN, XEM.

Không tham số.

- **Trả về:** `{items}`
- **Đọc:** CONFIG

#### `config.save`

Sửa tham số (làm tròn, VAT, người ký…) — áp dụng cho kỳ tính SAU; kỳ cũ giữ snapshot. Quyền: ADMIN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `key` | string | ✔ |  |
| `value` | string | ✔ |  |
| `reason` | string | ✔ |  |

- **Trả về:** `{item}`
- **Lỗi:** `VALIDATION_FAILED`
- **Đọc:** CONFIG
- **Ghi:** CONFIG · AUDIT `CONFIG_UPDATE`

#### `data.backupNow`

Sao lưu ngay toàn bộ thư mục dữ liệu thành 1 file .zip (backups/manual). Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `note` | string |  |  |

- **Trả về:** `{path, sizeBytes, sha256}`
- **Lỗi:** `STORAGE_ERROR`

#### `data.listBackups`

Danh sách bản sao lưu (ngày / tháng / thủ công). Quyền: ADMIN.

Không tham số.

- **Trả về:** `{items:[{path, kind, createdAt, sizeBytes, dataVersion}]}`

#### `data.restore`

Khôi phục từ 1 bản sao lưu: tự sao lưu hiện trạng trước, thay thư mục tables/, mở lại APP. Quyền: ADMIN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `backupPath` | string | ✔ |  |
| `reason` | string | ✔ |  |

- **Trả về:** `{restoredDataVersion, safetyBackupPath}`
- **Lỗi:** `INTEGRITY_ERROR`, `STORAGE_ERROR`

#### `data.changeFolder`

Chuyển thư mục dữ liệu sang vị trí khác (copy + kiểm SHA-256 + đổi cấu hình). Quyền: ADMIN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `newFolder` | string | ✔ |  |

- **Trả về:** `{dataFolder}`
- **Lỗi:** `STORAGE_ERROR`, `DATA_LOCKED`

#### `exchange.exportPackage`

Xuất gói .dgvc (JSON nén + SHA-256): DANH_MUC (đơn vị, xe, tuyến, giá, HĐ liên quan), PHIEU_CAN (theo khoảng ngày / xe), KY_TINH (kỳ đã xác nhận/khóa + chi tiết + BKVC). Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `packageType` | enum(DANH_MUC/PHIEU_CAN/KY_TINH) | ✔ |  |
| `targetUnitCode` | string |  | đơn vị nhận |
| `periodIds` | array<string> |  | với KY_TINH — chỉ kỳ DA_XAC_NHAN/DA_KHOA |
| `dateFrom` | date |  |  |
| `dateTo` | date |  |  |
| `plates` | array<string> |  | với PHIEU_CAN |
| `targetPath` | string | ✔ | từ dialog.saveFile |

- **Trả về:** `{path, packageSha256, counts}`
- **Lỗi:** `BUSINESS_RULE:E_PERIOD_STATUS`, `STORAGE_ERROR`
- **Đọc:** DON_VI, XE, TUYEN_VC, PRICE_HISTORY, HOP_DONG, HOP_DONG_XE, PHIEU_CAN, KY_TINH, TRANSPORT_CALCULATION, TRANSPORT_DETAIL, FUEL_DETAIL, BKVC_LINE, GIAO_NHAN_DAU
- **Ghi:** EXCHANGE_LOG · AUDIT `EXPORT_PACKAGE`

#### `exchange.previewPackage`

Đọc gói, kiểm SHA-256 + schemaVersion, so với dữ liệu hiện có → mới / cập nhật / giống / xung đột. KHÔNG ghi. Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `filePath` | string | ✔ |  |

- **Trả về:** `{exchangeId, header:{packageType, sourceUnitCode, sourceInstallId, createdAt, schemaVersion}, counts, conflicts:[{table, id, field, local, incoming}]}`
- **Lỗi:** `INTEGRITY_ERROR`, `BUSINESS_RULE:E_PACKAGE_SCHEMA`, `BUSINESS_RULE:E_PACKAGE_OWN`
- **Đọc:** DON_VI, XE, TUYEN_VC, PRICE_HISTORY, HOP_DONG, HOP_DONG_XE, PHIEU_CAN, KY_TINH
- **Ghi:** EXCHANGE_LOG · AUDIT `IMPORT_PACKAGE_PREVIEW`

#### `exchange.importPackage`

Nhập gói theo quy tắc gộp (§ Trao đổi); kỳ nhận về là IMPORTED — chỉ xem. Quyền: ADMIN, KE_TOAN.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `exchangeId` | string | ✔ |  |
| `resolve` | array<{table, id, choice: LOCAL/INCOMING}> |  | cách xử lý từng xung đột |
| `clientRequestId` | string | ✔ |  |

- **Trả về:** `{counts, exchange}`
- **Lỗi:** `BUSINESS_RULE:E_PREVIEW_STALE`, `BUSINESS_RULE:E_CONFLICT_UNRESOLVED`, `STORAGE_ERROR`
- **Đọc:** DON_VI, XE, TUYEN_VC, PRICE_HISTORY, HOP_DONG, HOP_DONG_XE, PHIEU_CAN, KY_TINH
- **Ghi:** DON_VI, XE, TUYEN_VC, PRICE_HISTORY, HOP_DONG, HOP_DONG_XE, PHIEU_CAN, KY_TINH, TRANSPORT_CALCULATION, TRANSPORT_DETAIL, FUEL_DETAIL, BKVC_LINE, GIAO_NHAN_DAU, EXCHANGE_LOG · AUDIT `IMPORT_PACKAGE`

#### `exchange.list`

Lịch sử gói đã xuất / nhập. Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `page` | integer |  | mặc định 1 |
| `pageSize` | integer |  | mặc định 100, tối đa 1000 |
| `sort` | string |  | vd `weigh1_date:desc` |

- **Trả về:** `{items, total}`
- **Đọc:** EXCHANGE_LOG
