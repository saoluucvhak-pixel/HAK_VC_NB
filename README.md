# DGVC — Đơn giá vận chuyển dăm (HAK Group)

Ứng dụng desktop (Electron, chạy offline) thay quy trình Excel + Power Query tính đơn giá vận chuyển dăm gỗ cho các nhà máy HAK Group. Một bộ cài dùng cho mọi nhà máy (chọn đơn vị lúc khởi tạo). Bản hiện tại: **1.3.3**.

- **Kho dữ liệu:** mặc định **JSON** (được hỗ trợ chính thức). **SQLite** là chế độ *thí điểm* (Cài đặt → Dữ liệu & sao lưu, chỉ ADMIN; có chạy thử, đường lui). Chưa xác minh trên máy Windows thật — xem `docs/THI_DIEM_SQLITE_WINDOWS.md` và `docs/PHAT_HANH_1.3.3.md`.
- **Môi trường:** Node.js ≥ 22.12 (CI dùng Node 22), Electron 45, electron-builder 26, NSIS cho bộ cài Windows x64.

## Thư mục
- `app/` — mã nguồn: `main/` (xử lý, kho dữ liệu, dịch vụ, báo cáo), `renderer/` (giao diện), `shared/` (schema, đặc tả API), `tests/`, `tools/`, `installer/` (NSIS). Chi tiết cấu trúc ở `app/README.md`.
- `desk/` — đặc tả nguồn (`api_spec.py`, `schema.py`). Sửa `api_spec.py` rồi đồng bộ 3 bản `api_spec.json` (`app/shared`, `desk`, `docs`) và bảng trong `docs/API_DESIGN.md`; test `tests/spec.routes.test.js` bắt lệch giữa đặc tả và router.
- `docs/` — hướng dẫn sử dụng, quy tắc tính, mô hình dữ liệu, thiết kế lưu trữ, tài liệu thí điểm SQLite, ghi chú phát hành.

## Phát triển và kiểm thử
```
cd app
npm ci
npm test                      # toàn bộ test (cần Chromium cho test giao diện/PDF: CHROMIUM_PATH hoặc /opt/pw-browsers/chromium)
DGVC_STORAGE=sqlite npm test  # cùng bộ test trên kho SQLite (chỉ dev/CI)
npm run test:electron         # bản Electron thật + kiểm SQLite trong Electron (Linux: xvfb-run)
npm run verify:seed           # đối chiếu dữ liệu mẫu với Excel gốc
npm run compare               # so APP ↔ Excel (nên chỉ định đường dẫn ra ngoài repo: node tools/compare-excel.js <file.xlsx>)
npm start | npm run dev       # chạy Electron | giao diện trên trình duyệt
```
CI (`.github/workflows/ci.yml`): `test` (cài Chromium + poppler, yêu cầu 0 test bị bỏ qua), `test-sqlite`, `electron`, `quality`, `audit`.

## Đóng gói Windows x64
```
cd app
npm run dist     # electron-builder (dir) + makensis → dist/DGVC-Setup-<phiên bản>.exe
```
`npm run dist:win` chỉ chạy được trên máy Windows có Node.js. Phiên bản nằm ở `app/package.json`, `app/package-lock.json`, `app/installer/dgvc.nsi` (phải khớp nhau).

## Nâng cấp từ bản cũ
Cài đè bản mới: bộ cài chỉ thay tệp chương trình; dữ liệu nằm ở thư mục dữ liệu của người dùng (mặc định `Documents\DGVC_DATA`), gỡ cài đặt **không** xóa dữ liệu. Sao lưu thủ công trước khi nâng cấp (Cài đặt → Dữ liệu & sao lưu → Sao lưu ngay). App tự thêm tham số cấu hình mới và dọn lô import xem trước bỏ dở khi mở.
