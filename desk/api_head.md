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
