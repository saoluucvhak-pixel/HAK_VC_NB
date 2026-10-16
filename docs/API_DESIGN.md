# API_DESIGN.md — Thiết kế API nội bộ (Bước 8 — bản DESKTOP)

> **Thay thế** bản Google Apps Script. Phần mềm Electron chạy offline: giao diện (renderer) gọi nghiệp vụ (main process) qua **IPC** của Electron — không có máy chủ, không có mạng.
> Kèm theo: `api_spec.json` (81 action, máy đọc được), `api_examples/` (request/response mẫu sinh từ dữ liệu thật bằng bộ tính tham chiếu, gồm cả **gói trao đổi .dgvc thật**), `ref_engine.py` (đáp án cho Engine JS ở Bước 10).
> Spec đã kiểm chéo với `DATA_STORAGE_DESIGN.md`: mọi bảng đọc/ghi đều tồn tại, mọi mã lỗi đều có định nghĩa, mọi action ghi dữ liệu đều đi qua giao dịch journal.

---

## 1. Cách gọi

```
Renderer (giao diện)                    Preload                           Main process
────────────────────                    ───────                           ─────────────────────────────────────────────
const r = await window.dgvc.api(     →  contextBridge.exposeInMainWorld →  ipcMain.handle('api', (e, {action, payload}))
  'periods.calculate', {...})           ('dgvc', { api: (a, p) =>            1. requestId, đo thời gian
                                          ipcRenderer.invoke('api',           2. Phiên đăng nhập của cửa sổ này → user   → SESSION_EXPIRED
                                          {action: a, payload: p}) })         3. Router: action → service (danh sách trắng theo api_spec.json)
                                                                              4. Quyền theo vai trò + phạm vi hợp đồng     → FORBIDDEN / E_NOT_CARRIER
                                                                              5. Kiểm tra payload theo spec              → VALIDATION_FAILED
                                                                              6. Chống bấm 2 lần (clientRequestId, 10 phút)
                                                                              7. Service → Engine / Repository (hàng đợi ghi + journal)
                                                                              8. AUDIT_LOG (action ghi), logs\ (lỗi, > 3 s)
                                                                              9. Trả envelope
```

- **Một cổng duy nhất** `api(action, payload)`; renderer không có quyền đọc/ghi file hay chạy Node — chỉ gọi được các action trong danh sách.
- Phiên đăng nhập gắn với cửa sổ (`webContents.id`) và giữ trong bộ nhớ main process — renderer không cầm mật khẩu hay token lâu dài.
- Hộp thoại chọn file / thư mục / nơi lưu mở từ main process (`dialog.*`), renderer chỉ nhận lại đường dẫn.

## 2. Envelope

```json
{ "ok": true,  "data": { … }, "error": null, "warnings": [ {"code":"W_BEFORE_PERIOD","message":"…","ref":"GD-DH-00004"} ],
  "meta": { "requestId": "req-7f3a", "durationMs": 180, "dataVersion": 12 } }

{ "ok": false, "data": null, "error": { "code": "BUSINESS_RULE", "message": "…", "details": { "code": "E_TICKET_USED_IN_PERIOD", "items": [ … ] } },
  "warnings": [], "meta": { … } }
```

| Quy ước | |
|---|---|
| Tên trường | payload camelCase; bản ghi trả về trong `record` / `items` giữ tên cột dữ liệu `snake_case` |
| Ngày | chuỗi `yyyy-MM-dd`; ngày giờ ISO `+07:00` |
| Số | JSON number, API không làm tròn — Engine làm tròn theo CONFIG; giao diện định dạng `1.234,56` |
| Phân trang | `page`, `pageSize` (≤ 1000), `sort` |
| Sửa bản ghi | bắt buộc `rowVersion` (2 cửa sổ / 2 người cùng sửa → `CONFLICT_VERSION`) |
| Chống bấm 2 lần | `clientRequestId` bắt buộc với `periods.calculate`, `import.confirm`, `exchange.importPackage` |
| `dataVersion` | số tăng sau mỗi giao dịch ghi (lấy từ manifest) — giao diện biết khi nào tải lại danh mục |

## 3. Đăng nhập và phân quyền

| | |
|---|---|
| Lần mở đầu | `setup.status` → chưa có dữ liệu: `setup.init` (tạo mới: chọn đơn vị bản cài + ADMIN đầu tiên; hoặc mở thư mục có sẵn / nạp gói DANH_MUC) |
| Đăng nhập | `auth.login` → `PASSWORD_NOT_SET` thì `auth.setFirstPassword`; sai 5 lần → `ACCOUNT_LOCKED` 15 phút; 60 phút không thao tác → `SESSION_EXPIRED` |
| Vai trò | `ADMIN` tất cả trong bản cài + quản lý user, cấu hình, sao lưu/khôi phục, mở khóa kỳ · `KE_TOAN` nhập liệu, tính, xác nhận, khóa, xuất/nhập gói · `XEM` chỉ đọc · cờ `can_unlock` |
| **Phạm vi hợp đồng** | Mọi thao tác **ghi** trên hợp đồng (bảng kê dầu, kỳ tính, xác nhận, khóa) chỉ khi `carrier_unit_code` = **đơn vị của bản cài** — kể cả ADMIN. Hợp đồng mà đơn vị bản cài là bên thuê: chỉ xem, nhận kỳ qua `exchange.importPackage` (`origin = IMPORTED`) |

Các action đánh dấu quyền **(chưa đăng nhập)** chỉ gồm: `setup.status`, `setup.init` (chỉ khi chưa khởi tạo), `auth.login`, `auth.setFirstPassword`, `dialog.openFolder`.

## 4. Danh sách action
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
| `tickets.previewBulkDescriptive` | Xem trước sửa hàng loạt 1 cột mô tả (LDĐ, nguồn gốc, khách hàng, kiểu cân, đơn vị VC): số phiếu, phiếu ở kỳ đã xác nhận/khóa | A/K |  |  |
| `tickets.bulkUpdateDescriptive` | Sửa hàng loạt cột mô tả — bắt buộc lý do; phiếu ở kỳ đã khóa cần quyền mở khóa; audit từng phiếu + 1 dòng BULK_UPDATE; không làm kỳ phải tính lại | A/K | 🔒 PHIEU_CAN | UPDATE, BULK_UPDATE |
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
| `reports.bkct` | Bảng kê chi tiết phiếu cân của kỳ (15 cột: bỏ cột Khách hàng — trống trong dữ liệu gốc) | A/K/X |  |  |
| `reports.pricing` | Bảng tính đơn giá VC của kỳ (17 cột như QR_DGVC (2)) | A/K/X |  |  |
| `reports.invoice` | Diễn giải cước để VIẾT HÓA ĐƠN: 1 dòng / xe (diễn giải, ĐVT Tấn, số lượng, đơn giá, thành tiền, VAT, tổng — cùng số BKVC). Mẫu câu: HOP_DONG.service_desc → CONFIG INVOICE_DESC_TEMPLATE; chỗ trống {BKS} {TUYEN} {MA_TUYEN} {TU_NGAY} {DEN_NGAY} | A/K/X |  |  |
| `reports.misa` | Dữ liệu hóa đơn theo mẫu MISA meInvoice "Hóa đơn GTGT 1 thuế suất" (1 kỳ = 1 hóa đơn, mỗi xe 1 dòng). Chỉ bên vận chuyển | A/K/X |  |  |
| `reports.export` | Xuất file (report = BKVC / BKCT / PRICING / INVOICE / **MISA** — MISA chỉ XLSX) ra đường dẫn đã chọn (XLSX: exceljs; PDF: in HTML báo cáo bằng printToPDF; CSV: UTF-8 BOM) | A/K/X |  | EXPORT |
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
| `record` | object | ✔ | bản ghi TUYEN_VC (camelCase): routeCode, routeName, distanceKm, tripDistanceKm (trống = 2 × cự ly), uom TAN/M3, fromPlace, toPlace (điểm đi/đến — in diễn giải hóa đơn), note |
| `create` | boolean |  | true = thêm tuyến mới (mã trùng → DUPLICATE); false = sửa (mã không có → NOT_FOUND) |
| `rowVersion` | integer |  | bắt buộc khi sửa |
| `reason` | string |  | bắt buộc khi sửa cự ly / ĐVT của tuyến đã dùng ở kỳ đã xác nhận/khóa |

Luật sửa (chốt 25/09/2026 — tuyến sửa được, bổ sung được): mã tuyến không đổi; tên, điểm đi/đến, ghi chú luôn sửa được; cự ly / cự ly chuyến / ĐVT: kỳ NHÁP dùng tuyến → `needs_recalc`; kỳ ĐÃ XÁC NHẬN/KHÓA → cần ADMIN hoặc quyền mở khóa + lý do (kết quả đã lưu không đổi). Bản cài không phải gốc danh mục → cảnh báo `W_NOT_CATALOG_MASTER`.

- **Trả về:** `{record, created, affectedPeriods, warnings}`
- **Lỗi:** `VALIDATION_FAILED`, `DUPLICATE`, `NOT_FOUND`, `CONFLICT_VERSION`, `FORBIDDEN`, `BUSINESS_RULE:E_ROUTE_IN_CONFIRMED`
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

- **Trả về:** `{activated, closed, affectedPeriods}` — kỳ nháp dùng giá cũ có ngày ≥ ngày hiệu lực mới → `needs_recalc`
- **Lỗi:** `BUSINESS_RULE:E_PRICE_DATE_OVERLAP`, `BUSINESS_RULE:E_PRICE_USED` (kỳ đã xác nhận/khóa dùng giá cũ có ngày ≥ ngày hiệu lực mới)
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
| `overrides` | array<{code, routeCode, reason, fuelPrice?}> |  | vd E_NO_FUEL cho phép dầu = 0 (cần lý do + fuelPrice chưa VAT) |
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

Bảng kê chi tiết phiếu cân của kỳ (15 cột; từ bản 1.1.3 bỏ cột Khách hàng). Quyền: ADMIN, KE_TOAN, XEM.

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

##
### Bổ sung Bước 15 (25/09/2026) — bộ cài dùng cho mọi nhà máy

| Action | Mô tả | Quyền |
|---|---|---|
| `setup.units` | Đơn vị chọn được khi khởi tạo — MỘT bộ cài cho mọi nhà máy (HAK, HAKQN, ĐH, CNHAK …); mỗi đơn vị kèm hợp đồng mà đơn vị là 1 bên | chưa đăng nhập |
| `setup.init` | thêm `mode`: `NEW` (tạo dữ liệu cho `unitCode`) / `ATTACH` (dùng thư mục dữ liệu có sẵn); `catalogPackagePath` (gói DANH_MUC mới nhất), `mirrorFolder` (USB / Google Drive) | chưa đăng nhập |
| `sync.list` | Nhắc sửa danh mục ở các nhà máy còn lại: thay đổi đang chờ + số thay đổi chờ theo nhà máy | A/K/X |
| `sync.markDone` | Đánh dấu nhà máy đã sửa giống (sửa tay, có ghi chú) | A/K |
| `contracts.setActive`, `contracts.vehicles` | Ngừng / dùng lại hợp đồng; xem phạm vi xe | A/K · A/K/X |
| `reports.html` | Trang A4 của báo cáo để xem trước | A/K/X |

**Không còn "bản gốc danh mục"** (thay cho CATALOG_MASTER_UNIT = HAKQN): bản cài nào cũng sửa được danh mục (`routes.*`, `prices.*`, `units.*`, `vehicles.*`, `contracts.*`) và xuất gói `DANH_MUC`. Mỗi lần sửa → 1 dòng `SYNC_REMINDER` cho các nhà máy trong `CONFIG.SYNC_TARGET_UNITS` (mặc định `HAK;HAKQN;DH;CNHAK`) trừ bản cài đang sửa; kết quả trả về có cảnh báo `I_SYNC_REMINDER`. Xuất gói `DANH_MUC` cho nhà máy X → tự đánh dấu X đã nhận. Nhận gói: bản đến mới hơn → cập nhật; hai bên cùng sửa → xung đột, người dùng chọn giữ / lấy.

## `exchange.list`

Lịch sử gói đã xuất / nhập. Quyền: ADMIN, KE_TOAN, XEM.

| Tham số | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `page` | integer |  | mặc định 1 |
| `pageSize` | integer |  | mặc định 100, tối đa 1000 |
| `sort` | string |  | vd `weigh1_date:desc` |

- **Trả về:** `{items, total}`
- **Đọc:** EXCHANGE_LOG

### Bổ sung 25/09/2026 — file nhập hóa đơn MISA meInvoice
- `reports.misa({periodId | periodIds[], invoiceDate?})` → `{invoices:[{no, periodCode, date 'dd/MM/yyyy', buyer{name, address, taxCode, email}, payment, currency 'VND', rate 1, vatPct, vat, lines[{description, uom, qty, unitPrice, amount}], totals{amount, vat, total}, bkvc{vat, total}}], warnings}`. Kỳ nhận từ gói hoặc bản cài không phải bên vận chuyển → `FORBIDDEN`.
- `reports.export({report:'MISA', format:'XLSX', params})` ghi vào bản sao mẫu `resources/templates/MISA_HoaDon_GTGT_1ThueSuat.xlsx`: giữ dòng hướng dẫn 1–7 và tiêu đề dòng 9, dữ liệu từ dòng 10. Dòng đầu mỗi hóa đơn: A–M đủ (người mua, HTTT, loại tiền, tỷ giá, thuế suất, tiền thuế); các dòng sau chỉ A + N–S. Trả thêm `warnings`.
- Tiền thuế = `calculateInvoiceVat(tổng tiền hàng, thuế suất)` = làm tròn đồng trên tổng (cách MISA tính). Khác tổng VAT của BKVC → `W_INVOICE_VAT_DIFF`. Kỳ còn nháp → `W_INVOICE_DRAFT_PERIOD`.
- Chỗ trống mới trong mẫu diễn giải: `{BKS_LIEN}` = biển số bỏ dấu gạch (92H00057, như hóa đơn thật).
- `CONFIG.VAT_ROUND_BASIS` = `LINE` (mặc định: VAT làm tròn từng dòng BKVC, như Excel) | `TOTAL` (VAT tính trên tổng, chênh lệch dồn vào dòng cuối — BKVC khớp hóa đơn MISA). `CONFIG.INVOICE_PAYMENT_METHOD` = `Chuyển khoản`.
- Mã kiểm tra mới khi tính kỳ: `W_FUEL_POSSIBLE_DUPLICATE` (`ref` = receipt_id) — chỉ khi trong kỳ còn ≥ 2 dòng giống nhau chưa xác nhận; `I_FUEL_EXCLUDED` — dòng người dùng đã bỏ khỏi kỳ.
- `periods.calculate` / `periods.preview` với `periodId`: không truyền `excludeReceiptIds` / `excludeTicketIds` → dùng danh sách của lần tính hiện hành (lưu trong `CALC_RUN.summary_json`); truyền `[]` để đưa lại tất cả. `periods.get` trả thêm `exclusions {excludeTicketIds, excludeReceiptIds, receipts[]}`.

## 6. Luồng gọi API cho các nghiệp vụ chính

**6.1. Cài đặt lần đầu** — `setup.status` → `dialog.openFolder` → `setup.init(NEW, unitCode, admin)` hoặc `setup.init(OPEN_EXISTING)` / nạp gói DANH_MUC → `auth.login`.

**6.2. Import phiếu cân từ file Excel trạm cân**
```
dialog.openFile → import.preview(PHIEU_CAN, filePath) → (sửa mapping → import.preview lại) → import.previewRows (xem dòng lỗi)
  → import.confirm(batchId, skipRowNos, acceptWarnings, clientRequestId)
```

**6.3. Bảng kê dầu của hợp đồng** — như 6.2 với `GIAO_NHAN_DAU` + `contractId`, hoặc `fuel.saveRows`; dòng nghi trùng đã kiểm tra → `fuel.ackFlags`.

**6.4. Lập kỳ, tính giá, in, khóa**
```
periods.preview(contractId, dateFrom, dateTo, routeCode) → periods.calculate(…, clientRequestId)
  → calc.tickets / calc.fuel / calc.trace (XEM CHI TIẾT TÍNH)
  → reports.bkvc → reports.print hoặc dialog.saveFile + reports.export(BKVC, PDF)
  → periods.confirm → periods.lock
```

**6.5. Gửi kỳ cho bên thuê** (vd ĐH → HAKQN)
```
Bản ĐH:    periods.confirm → dialog.saveFile → exchange.exportPackage(KY_TINH, periodIds, targetUnitCode=HAKQN)  → gửi file .dgvc (USB / Zalo / email)
Bản HAKQN: dialog.openFile → exchange.previewPackage(filePath) → exchange.importPackage(exchangeId) → periods.get / reports.bkvc (chỉ xem, in lại được)
```

**6.6. Đồng bộ danh mục** — bản gốc (HAKQN): `exchange.exportPackage(DANH_MUC)` → bản khác: `exchange.previewPackage` → chọn xử lý xung đột → `exchange.importPackage`.

**6.7. Sửa dữ liệu sau khi tính** — `tickets.update` / `fuel.update` trả `affectedPeriods`; kỳ `NHAP` → `needs_recalc` (xác nhận bị chặn `E_NEEDS_RECALC` đến khi tính lại). Kỳ đã xác nhận/khóa phải `periods.reopen` / `periods.unlock` trước (ADMIN hoặc `can_unlock`, có lý do); nếu kỳ đã gửi đi → xuất lại gói KY_TINH (`calc_version` mới thay bản cũ ở bên nhận).

**6.8. Sao lưu, khôi phục** — tự động hằng ngày; `data.backupNow`; `data.listBackups` → `data.restore(backupPath, reason)`.

## 7. "XEM CHI TIẾT TÍNH" (`calc.trace`)

`trace_json.steps[]`: `key`, `label`, `formula`, `expr` (thay số), `value`, `unit`, `drill` (`calc.tickets` / `calc.fuel`). Ví dụ thật — HAKQN-QS, VC.007, 18–23/09/2026:

| # | Bước | Công thức | Thay số | Kết quả |
|---|---|---|---|---|
| 1 | ĐG 1 chuyến | Đơn giá mới × KL_TB | 165.000 × 18 | 2.970.000 đ/chuyến |
| 2 | Tiêu hao NL/chuyến | Cự ly chuyến × Định mức (lít/km) | 144 × 0,4 | 57,60 lít |
| 3 | Tiền dầu/chuyến | ĐG dầu chưa VAT (danh mục) × Tiêu hao NL/chuyến | 15.500 × 57,6 | 892.800 đ |
| 4 | Tỷ lệ tiêu hao dầu | Tiền dầu / ĐG 1 chuyến | 892.800 / 2.970.000 | 30,06 % |
| 5 | ĐGVC chưa diesel | (ĐG 1 chuyến − Tiền dầu) / KL_TB | (2.970.000 − 892.800) / 18 | 115.400 đ/tấn |
| 6 | ĐG HĐ | ROUND(ĐGVC chưa diesel; -3) [HALF_EVEN] | ROUND(115.400,00; -3) | 115.000 đ/tấn |
| 7 | Số chuyến | số phiếu cân | 326 phiếu | 326 chuyến |
| 8 | Tổng khối lượng | Σ KL hàng (KG) / 1000 | 6.143.680 / 1000 | 6.143,68 tấn |
| 9 | Dầu thực nhận | Σ số lượng bảng kê dầu của hợp đồng | Σ 18 dòng (2026-09-20 → 2026-09-23) | 5.853 lít |
| 10 | Đơn giá dầu | Trung bình cộng đơn giá các dòng (chưa VAT) | TB(18 dòng) | 29.940 đ/lít |
| 11 | Dầu định mức | Cự ly chuyến × Số chuyến × Định mức | 144 × 326 × 0,4 | 18.777,60 lít |
| 12 | Chênh lệch dầu | Dầu định mức − Dầu thực nhận | 18.777,60 − 5.853,00 | 12.924,60 lít |
| 13 | ĐG CL Diesel | Chênh lệch × Đơn giá dầu / Tổng tấn | 12.924,60 × 29.940,00 / 6.143,68 | 62.985,46 đ/tấn |
| 14 | ĐG VC trước làm tròn | ĐG HĐ + ĐG CL Diesel | 115.000 + 62.985,46 | 177.985,46 đ/tấn |
| 15 | Đơn giá vận chuyển | < 0 → 0; ngược lại ROUND(…; -2) [HALF_EVEN] | ROUND(177.985,46; -2) | 178.000 đ/tấn |

## 8. Mã lỗi

### 8.1. `error.code`

| Mã | Ý nghĩa |
|---|---|
| `SESSION_EXPIRED` | Chưa đăng nhập / hết phiên (không thao tác quá SESSION_IDLE_MINUTES) |
| `AUTH_FAILED` | Sai tên đăng nhập hoặc mật khẩu |
| `ACCOUNT_LOCKED` | Sai mật khẩu quá LOGIN_MAX_FAILED lần — khóa LOGIN_LOCK_MINUTES phút |
| `PASSWORD_NOT_SET` | Tài khoản chưa có mật khẩu → auth.setFirstPassword |
| `FORBIDDEN` | Không có quyền với action / hợp đồng này |
| `NOT_FOUND` | Không tìm thấy bản ghi |
| `VALIDATION_FAILED` | Dữ liệu vào sai kiểu / thiếu trường; details = [{field, code, message}] |
| `DUPLICATE` | Trùng khóa duy nhất (ticket_key, contract_code, …) |
| `CONFLICT_VERSION` | Bản ghi đã đổi kể từ lúc mở (row_version khác) — tải lại |
| `DATA_LOCKED` | Thư mục dữ liệu đang được mở bởi APP khác (file khóa .lock) — đóng APP kia hoặc xác nhận khóa cũ đã chết |
| `STORAGE_ERROR` | Lỗi đọc/ghi file (đầy ổ, không có quyền, file đang bị chương trình khác giữ) — giao dịch đã hoàn tác |
| `INTEGRITY_ERROR` | File dữ liệu không khớp SHA-256 trong manifest / JSON hỏng — đề nghị khôi phục bản sao lưu |
| `BUSINESS_RULE` | Vi phạm luật nghiệp vụ; details.code = mã E_… bên dưới |
| `INTERNAL` | Lỗi chương trình — đã ghi logs/, trả requestId để tra |

### 8.2. Mã kiểm tra dữ liệu (`details.code`, `issues[].code`, `validation_flags`)

`ERROR` chặn; `WARNING` hiển thị, xác nhận được (`ackFlags`); `INFO` thông tin. (*n) = 10 lỗi bắt buộc của yêu cầu §23.

| Mã | Mức | Nội dung hiển thị | Dùng ở |
|---|---|---|---|
| `E_TICKET_DUPLICATE` | ERROR | (*1) Phiếu cân trùng (ticket_key đã tồn tại / trùng trong file) | import, tickets.update |
| `E_ROUTE_MISSING` | ERROR | (*2) Không có mã tuyến | import, validation |
| `E_ROUTE_NOT_FOUND` | ERROR | (*3) Mã tuyến không tồn tại | import, validation, periods |
| `E_PRICE_NOT_FOUND` | ERROR | (*4) Không có đơn giá (không có phiên bản giá hiệu lực) | periods |
| `E_FUEL_NORM_MISSING` | ERROR | (*5) Không có định mức dầu | prices, periods |
| `E_NO_FUEL` | ERROR | (*6) Không có dầu thực nhận cho tuyến trong bảng kê của hợp đồng (override được, cần lý do) | periods |
| `E_TOTAL_KG_ZERO` | ERROR | (*7) Tổng KL = 0 | periods |
| `E_PRICE_NEGATIVE` | ERROR | (*8) Đơn giá âm | prices, fuel |
| `E_DISTANCE_INVALID` | ERROR | (*9) Cự ly ≤ 0 | routes, periods |
| `E_FUEL_NORM_INVALID` | ERROR | (*10) Định mức dầu ≤ 0 | prices, periods |
| `E_KG_INVALID` | ERROR | KL hàng ≤ 0 | import |
| `E_DATE_INVALID` | ERROR | Ngày sai / Ngày cân 2 < Ngày cân 1 | import |
| `E_PLATE_FORMAT` | ERROR | Biển số phiếu cân sai định dạng | import |
| `E_VEHICLE_NOT_FOUND` | ERROR | Mã xe (phiếu/dầu) không quy đổi được về xe trong danh mục | import, fuel |
| `E_TICKET_USED_IN_PERIOD` | ERROR | Phiếu cân này đã được sử dụng trong kỳ tính [Mã kỳ]. Không thể đưa vào kỳ mới. | periods |
| `E_FUEL_USED_IN_PERIOD` | ERROR | Dòng dầu này đã được sử dụng trong kỳ tính [Mã kỳ]. Không thể đưa vào kỳ mới. | periods |
| `E_MULTI_FUEL_GROUP` | ERROR | Tuyến có dầu từ nhiều Đơn vị giao / ĐVT (Excel sẽ nhân dòng) | periods |
| `E_PRICE_VERSION_SPLIT` | ERROR | Kỳ cắt ngang 2 phiên bản giá — tách kỳ | periods |
| `E_PRICE_DATE_OVERLAP` | ERROR | Ngày hiệu lực giá trùng / trước phiên bản đang ACTIVE | prices |
| `E_PRICE_USED` | ERROR | Phiên bản giá đã dùng trong kỳ — không sửa, hãy tạo phiên bản mới | prices |
| `E_NOT_CARRIER` | ERROR | Đơn vị của bạn không phải bên vận chuyển của hợp đồng | contracts, periods, fuel |
| `E_CONTRACT_INACTIVE` | ERROR | Hợp đồng ngừng / hết hiệu lực trong kỳ | periods |
| `E_SAME_PARTY` | ERROR | Bên thuê trùng bên vận chuyển | contracts |
| `E_PERIOD_STATUS` | ERROR | Thao tác không hợp lệ với trạng thái kỳ hiện tại | periods.* |
| `E_NEEDS_RECALC` | ERROR | Dữ liệu nguồn đã sửa sau lần tính — tính lại trước khi xác nhận | periods.confirm |
| `E_CALC_BLOCKED` | ERROR | Còn lỗi chặn — xem issues | periods.calculate |
| `E_TICKET_LOCKED` | ERROR | Phiếu nằm trong kỳ đã xác nhận/khóa — không sửa được | tickets.update |
| `E_FUEL_LOCKED` | ERROR | Dòng dầu nằm trong kỳ đã xác nhận/khóa | fuel.update |
| `E_IN_USE` | ERROR | Đang được dùng — chỉ ngừng sử dụng, không xóa | setActive, softDelete |
| `E_PREVIEW_STALE` | ERROR | Dữ liệu đã đổi kể từ lúc preview — preview lại | import.confirm |
| `E_IMPORT_HAS_ERRORS` | ERROR | Còn dòng lỗi chưa bỏ | import.confirm |
| `E_MAPPING_REQUIRED` | ERROR | Chưa map đủ cột bắt buộc | import.preview |
| `E_LAST_ADMIN` | ERROR | Không thể bỏ quyền ADMIN cuối cùng | users.save |
| `E_PASSWORD_ALREADY_SET` | ERROR | Tài khoản đã có mật khẩu — dùng đổi mật khẩu | auth.setFirstPassword |
| `E_READONLY_IMPORTED` | ERROR | Kỳ nhận từ gói của bản cài khác — chỉ xem, không tính lại/sửa | periods.* |
| `E_PACKAGE_SCHEMA` | ERROR | Gói tạo từ phiên bản dữ liệu khác, không nhập được — cập nhật APP | exchange |
| `E_PACKAGE_OWN` | ERROR | Gói do chính bản cài này xuất | exchange |
| `E_CONFLICT_UNRESOLVED` | ERROR | Còn xung đột chưa chọn cách xử lý | exchange.importPackage |
| `E_AVG_LOAD_INVALID` | ERROR | KL_TB (hoặc Thể tích TB với tuyến M3) phải > 0 | prices, periods |
| `E_NO_FUEL_PRICE` | ERROR | Cho phép dầu = 0 (override E_NO_FUEL) phải kèm đơn giá dầu chưa VAT để tính chênh lệch | periods.calculate |
| `E_NO_TICKETS` | ERROR | Không có phiếu cân nào của hợp đồng trong kỳ | periods |
| `W_OVERRIDE_NO_FUEL` | WARNING | Tính với dầu thực nhận = 0 theo xác nhận của người dùng (có lý do) | periods |
| `W_FUEL_IN_DRAFT_PERIOD` | WARNING | Dòng dầu đang ở kỳ nháp khác | periods |
| `W_KG_MISMATCH` | WARNING | KL hàng ≠ Cân lần 2 − Cân lần 1 | import |
| `W_OVERNIGHT` | WARNING | Phiếu cân qua đêm (ngày cân 2 ≠ ngày cân 1) | import |
| `W_BEFORE_PERIOD` | WARNING | Ngày nhận dầu trước Từ ngày của kỳ (vẫn tính — "tính hết bảng kê") | periods |
| `W_AFTER_PERIOD` | WARNING | Ngày nhận dầu sau Đến ngày của kỳ (vẫn tính) | periods |
| `W_POSSIBLE_DUPLICATE` | WARNING | Dòng dầu nghi trùng (cùng ngày, xe, số lít) | import, fuel |
| `W_PLATE_FORMAT` | WARNING | Mã xe dầu viết khác chuẩn (đã quy đổi) | import |
| `W_VEHICLE_NO_FUEL` | WARNING | Xe có chạy trong kỳ nhưng không có dòng dầu | periods |
| `W_VEHICLE_OUT_OF_CONTRACT` | WARNING | Dòng dầu của xe không thuộc phạm vi hợp đồng | periods |
| `W_TICKET_IN_DRAFT_PERIOD` | WARNING | Phiếu đang ở kỳ nháp khác (BL-34) | periods |
| `W_VEHICLE_PARTIAL_CONTRACT` | WARNING | Xe thuộc hợp đồng nhưng có phiếu trong kỳ ngoài thời gian hiệu lực của xe (đổi hợp đồng giữa kỳ) — phiếu đó không tính | periods |
| `W_TICKET_NO_CONTRACT` | WARNING | Phiếu trong kỳ của xe không thuộc hợp đồng nào mà đơn vị bản cài là bên vận chuyển — chưa được tính ở đâu | periods |
| `I_FUEL_USED_EARLIER` | INFO | Dầu nhận trước kỳ đã tính ở kỳ đã xác nhận — bỏ qua, gộp 1 dòng (không liệt kê lại lịch sử bảng kê) | periods |
| `E_TICKET_LOCKED` | ERROR | Sửa cột cốt lõi của phiếu đang ở kỳ đã xác nhận/khóa | tickets |
| `E_TICKET_IDENTITY` | ERROR | Sửa số phiếu / ngày cân 1 / biển số (định danh) | tickets |
| `W_NEGATIVE_FUEL_DIFF` | INFO | Chênh lệch dầu âm — đơn giá bị trừ | periods |
| `W_FLOORED_ZERO` | WARNING | Đơn giá VC âm → đưa về 0 | periods |
| `W_SAME_FILE_IMPORTED` | WARNING | File này (cùng SHA-256) đã từng import | import.preview |
| `W_BACKUP_OLD` | WARNING | Chưa sao lưu quá 7 ngày | meta.bootstrap |

## 9. Ví dụ (`api_examples/`)

| File | Nội dung | Số chính |
|---|---|---|
| `periods.calculate.HAKQN-QS.json` | Tính kỳ bản HAKQN | 326 chuyến · 5.853 l · **178.000** · 1.181.061.043 đ · 5 × `W_VEHICLE_NO_FUEL` |
| `periods.calculate.DH-HAKQN.json` | Tính kỳ bản ĐH | 77 · 5.734,69 l · **88.900** · 139.421.905 đ |
| `periods.calculate.HAK-HAKQN.json` | Tính kỳ bản HAK | 100 · 5.088,35 l · **125.600** · 253.713.305 đ |
| `calc.trace.json` | Chi tiết tính HAKQN-QS | bảng §7 |
| `reports.bkvc.*.json` | Dữ liệu in BKVC: dòng theo xe, tổng đến đồng, bằng chữ, 2 bên + MST + địa chỉ, người ký theo thứ tự ký | |
| `import.preview.fuel.json` | Preview bảng kê dầu ĐH | cảnh báo `W_BEFORE_PERIOD`, `W_PLATE_FORMAT`, dòng nghi trùng |
| `error.E_TICKET_USED_IN_PERIOD.json` | Chọn lại phiếu đã dùng | đúng câu chữ yêu cầu §14 |
| `auth.login.first-time.json` | Đăng nhập lần đầu | `PASSWORD_NOT_SET` |
| `DH-HAKQN_20260918-20260923.dgvc` | **Gói KY_TINH thật** ĐH xuất cho HAKQN (gzip JSON, 12,6 KB) | |
| `exchange.previewPackage.json` | HAKQN xem trước gói trên | 77 phiếu đã có (bỏ qua), 16 dầu + 1 kỳ + 77 chi tiết + 5 dòng BKVC mới, 0 xung đột |

## 10. Hiệu năng (dữ liệu trong bộ nhớ)

| Action | Ước tính |
|---|---|
| `meta.bootstrap` | < 50 ms |
| `import.preview` 1.000 dòng Excel | 1–2 s (đọc file bằng exceljs) |
| `periods.preview` / `calculate` (~330 phiếu) | tính < 100 ms; ghi giao dịch 0,2–0,5 s |
| `reports.export` PDF | 1–2 s |
| `exchange.exportPackage` / `importPackage` | < 1 s |
| `data.backupNow` | 1–3 s (nén ~50 MB) |

## Bổ sung bản 1.1.4 — Đối chiếu dữ liệu (chỉ đọc)
| Action | Mô tả | Vai trò |
|---|---|---|
| `reconcile.audit` | `{dateFrom?, dateTo?, includeWaiting?}` → phiếu cân chưa tính vào kỳ: `LATE` (về muộn) · `GAP` (lọt khe) · `DRAFT` · `EXCLUDED` · `WAITING`; kèm `overlaps` (xe ở 2 hợp đồng cùng lúc), `problems` (số nhắc trên menu) | A/K/X |
| `reconcile.compare` | `{filePath, dateFrom?, dateTo?, allPlates?}` — gói `.dgvc` có phiếu cân hoặc Excel phiếu cân → `KHOP · LECH · KHAC_SO_PHIEU · THIEU_BEN_MINH · THIEU_BEN_KIA`, `byPlate`, `totals` | A/K/X |
| `reconcile.export` | `{kind: AUDIT\|COMPARE, params, targetPath}` → Excel nhiều sheet; ghi AUDIT_LOG `EXPORT` | A/K/X |

Mã kiểm tra mới: `W_TICKET_LATE` (import phiếu cân có ngày thuộc kỳ đã xác nhận / đã khóa).

## Bổ sung bản 1.1.5 — Nhận gói kỳ tính từ nhiều máy
`exchange.previewPackage` thêm tham số `ticketsOnly` (chỉ nhập phiếu cân trong gói) và kết quả `ticketsInPackage`, `remapped`. Kỳ cùng hợp đồng + mã kỳ từ máy khác → `CONFLICT` (changes: Lần tính, Đơn giá, Số chuyến, Tổng thanh toán); `REPLACE` chỉ khi cùng máy gửi. Từ chối: bản cài là bên vận chuyển · phiếu cân / dòng dầu đã ở kỳ khác. Mã trùng khác kỳ → đổi mã `<mã>@<đơn vị>.<4 ký tự mã máy>`.


## Bổ sung bản 1.1.7 — Sửa danh mục xe
| Action | Mô tả | Vai trò |
|---|---|---|
| `vehicles.usage` | `{plateNo}` → xe đang dùng ở đâu: `tickets, fuelRows, fuelInPeriod, periodLines, contracts, blockers, canRename` | A/K/X |
| `vehicles.rename` | `{plateNo, newPlateNo, rowVersion, reason}` — sửa biển số nhập nhầm khi xe chưa có phiếu cân / chưa vào kỳ: tạo xe đúng, chuyển HOP_DONG_XE + dòng dầu, xóa xe sai; AUDIT `RENAME` | A/K |
| `vehicles.delete` | `{plateNo, reason}` — xóa xe chưa dùng ở đâu; AUDIT `DELETE` | A/K |


## Bổ sung bản 1.1.8 — Cập nhật / xóa / khôi phục phiếu cân
- `import.preview` (PHIEU_CAN): dòng trạng thái mới **UPDATE** — phiếu đã có, khác số liệu cân (`W_TICKET_UPDATE`, chỉ so cột có trong file), hoặc phiếu đã xóa (`W_TICKET_RESTORE`). Phiếu ở kỳ đã xác nhận/khóa → ERROR. `summary.update`; `import.confirm` trả `updated, restored, recalcPeriods` (cần `acceptWarnings`).
- `tickets.softDeleteMany {ticketIds, reason}` → `{deleted, skipped, affectedPeriods}`; `tickets.restore {ticketId}`; `tickets.list usage=DELETED`.


## Bổ sung bản 1.2.0 — Nhật trình xe
`reports.vehicleLog {plateNo, dateFrom, dateTo, label}` → `{title, subtitle, columns, rows[{stt, date, route, distance_km, trips, km, ton, fuel, norm, owner, ticket_nos, _b?}], totalsRow, summary{trips, km, ton, fuel, norm, per100, days}}`. Xuất: `reports.export / reports.print` với `report = VEHICLE_LOG`.


## Bổ sung bản 1.2.1 — Kho nhận dầu, km xe theo ngày
- GIAO_NHAN_DAU thêm cột `fuel_depot` (kho nhận dầu; import cột "Kho nhận dầu"; `fuel.update` sửa được cả khi dòng dầu ở kỳ đã chốt nếu chỉ đổi cột này).
- Bảng mới **XE_KM** (`km_id`, `plate_no`, `km_date`, `odo_start`, `odo_end`, `km`, `note`; duy nhất theo xe + ngày).
- `vehicleKm.list {plateNo, dateFrom?, dateTo?}` → `{items, total, warnings}`; `vehicleKm.save {plateNo, rows[{date, odoStart, odoEnd, km, note}]}` → `{added, updated, deleted, warnings}`.
- `reports.vehicleLog` thêm cột `km_decl`, `odo`, `depot`; summary `kmDecl, kmDays, kmMissingDays, per100Decl`.
- Lưu ý: các nhà máy nên cài cùng bản 1.2.1 khi trao đổi gói kỳ tính (dòng dầu có thêm cột kho).


## Sửa ở bản 1.2.2 — Chốt đồng hồ km thay cho khai báo km hằng ngày
- XE_KM thêm `odometer` (số đồng hồ lúc chốt), `read_at` (DAU_NGAY | CUOI_NGAY); `odo_start / odo_end / km` của 1.2.1 không dùng nữa (dòng cũ đọc `odo_end` làm số chốt).
- `vehicleKm.save {plateNo, rows[{date, odometer, readAt, note}]}` — để trống số đồng hồ = xóa lần chốt.
- `reports.vehicleLog` trả `odo {readings, segments[{fromText, toText, odoStart, odoEnd, odoKm, trips, routeKm, diffKm, diffPct, fuel, per100}], total}` và `extraTables` (bảng đối chiếu in kèm Excel / PDF).

## Bổ sung bản 1.2.3 — Đơn giá cố định
- `prices.createVersion / updateDraft / preview` nhận thêm `record.priceMethod` (`THEO_DAU` | `CO_DINH`) và `record.fixedPrice` (đ/tấn). `CO_DINH` chỉ bắt buộc `fixedPrice > 0`; các ô theo giá dầu ghi 0. `prices.preview` trả thêm `priceMethod`.
- `periods.preview / calculate`: mỗi kết quả tuyến có `priceMethod`; tuyến cố định có `fixedPrice`, `transportPrice = fixedPrice`, trace 4 bước (`fixedPrice, tripCount, totalTon, transportPrice`).
- Mã kiểm tra mới: `E_FIXED_PRICE_HAS_FUEL` (params `receiptIds, count, liter` — màn hình có nút bỏ các dòng dầu khỏi kỳ), `I_FIXED_PRICE`, `W_FUEL_FIXED_ROUTE` (import dầu).
- `reports.pricingSheet` — tuyến cố định có `priceMethod: 'CO_DINH'` và 4 chỉ tiêu; `reports.contractBasis` — dòng có `fixed: true`.

## Bổ sung bản 1.2.4 — Sửa / xóa hợp đồng
- `contracts.usage {contractId}` → `{periods, fuelRows, importBatches, prices, vehicles, blockers[], canEditParties, canDelete}`.
- `contracts.delete {contractId, reason}` → `{deleted, contractCode, vehicleRows, priceRows, warnings}` — chỉ khi `canDelete`.
- `contracts.save` (sửa): đổi `contractCode / carrierUnitCode / customerUnitCode` chỉ khi `canEditParties`, ngược lại `VALIDATION_FAILED` nêu rõ đã có gì.
- Giao diện dùng `contracts.setActive` cho nút Ngừng dùng / Dùng lại.

## Bổ sung bản 1.2.5 — Lưu gọn, lưu trữ theo năm
- `archive.years`, `archive.preview {year}` (trả `checks` — danh sách cảnh báo), `archive.archive {year, reason}`, `archive.mount {year}`, `archive.unmount {year?}`, `archive.reopen {year, reason}`, `archive.restoreFile {file}` (ADMIN, trừ mount / unmount).
- Mọi lệnh có `dateFrom / dateTo / periodId` (kể cả trong `params`) chạm năm lưu trữ → server tự `mount` trước khi chạy. Phản hồi có `meta.archiveMounted` (năm đang xem) để giao diện hiện dải báo.
- Mã lỗi mới `E_YEAR_ARCHIVED` (import và tầng lưu trữ, `BUSINESS_RULE`).
- `tickets.get` trả thêm `raw` (dữ liệu gốc trong file, đã ghép tên cột).

