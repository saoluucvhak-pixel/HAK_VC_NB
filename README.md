# DGVC — Đơn giá vận chuyển dăm (HAK Group)

Ứng dụng desktop (Electron, chạy offline) thay quy trình Excel + Power Query tính đơn giá vận chuyển dăm gỗ cho các nhà máy HAK Group. Một bộ cài dùng cho mọi nhà máy (chọn đơn vị lúc khởi tạo). Bản hiện tại: **1.10.0**.

- **Kho dữ liệu:** **SQLite là kho chính mặc định** (bản cài cũ tự nâng cấp từ JSON, có sao lưu + đối chiếu, giữ kho JSON cũ làm dự phòng). **JSON** chỉ là sao lưu phụ để gửi máy khác; khôi phục được từ cả bản SQL lẫn bản JSON. Chi tiết: `docs/PHAT_HANH_1.5.0.md`.
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

### Cấu hình mẫu phiếu cân của nhà cung cấp

Vào **Cài đặt → Mẫu nhập Excel**, tạo mẫu và chọn file để xác định sheet, dòng tiêu đề và cột cần đọc. Nếu tiêu đề chia thành hai tầng, chọn dòng dưới và dùng tên ghép hai tầng khi các tên ở dòng dưới bị trùng. Ghép tối thiểu biển số, ngày giờ cân và khối lượng hàng hoặc cả hai lần cân. Khi file thiếu mã tuyến, chọn tuyến chung lúc nhập. Nếu file thiếu số phiếu, phần mềm sinh mã từ biển số, thời điểm và số liệu cân. Hai dòng có cùng dữ liệu định danh sẽ được kiểm tra như phiếu trùng.

Chọn **Đọc thử** để xem số phiếu, tổng kg, cảnh báo theo dòng Excel và mức chênh với tổng công bố. Đơn vị được lấy từ hậu tố ô cân, cột đơn vị, tiêu đề cột rồi đơn vị dự phòng. Dùng **Lưu mẫu → Đặt mặc định** để áp dụng cho file mới. Mẫu lưu tên, dòng tiêu đề, cách ghép cột và đơn vị dự phòng. File mẫu và file gốc nằm trên máy người dùng.

Khi file đổi tiêu đề hoặc đơn vị, mở **Đổi cách đọc** để chọn mẫu khác, chỉnh ghép cột cho file hiện tại hoặc chọn **Tự nhận diện**. Để xem lại cách đọc đã dùng, mở **Phiếu cân → Lịch sử nhập → Xem cấu hình**. Chức năng **Đọc lại file gốc** yêu cầu đúng file của đợt cũ. [Ảnh nghiệm thu trên Chromium](docs/man_hinh_giao_dien_moi/38-mau-nhap-excel.png)

## Đóng gói và chạy trên Windows x64
```
cd app
npm run dist:win:dir       # đóng gói thư mục chạy ngay: dist/win-unpacked/DGVC.exe (không cần cài)
npm run dist:win:portable  # đóng gói file duy nhất chạy ngay: dist/DGVC <phiên bản>.exe
npm run dist               # đóng gói bộ cài NSIS: electron-builder (dir) + makensis → dist/DGVC-Setup-<phiên bản>.exe
```
> **Lưu ý PowerShell trên Windows:** Nếu gặp lỗi `npm.ps1 cannot be loaded because running scripts is disabled`, hãy dùng lệnh `npm.cmd` thay cho `npm`, hoặc chạy PowerShell quyền user:
> `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

### Chạy trực tiếp tại trạm cân (không cần cài đặt)
Trên các máy tính trạm cân bị hạn chế quyền Administrator, có thể sao chép trực tiếp thư mục `dist/win-unpacked/` và chạy ngay tệp `DGVC.exe`. Dữ liệu sẽ lưu tại `Documents\DGVC_DATA` của tài khoản đang đăng nhập.

## Nâng cấp từ bản cũ (1.8.3 → 1.10.0)
- **Bảo mật:** Lưu trạng thái máy (`machine-state.json`) ở thư mục cấu hình máy cục bộ để chống triệt để lỗ hổng mở lại ngoại lệ "ADMIN đầu tiên" khi khôi phục các bản sao lưu cũ.
- **Hiệu năng:** Tự động chuyển sang chế độ xuất luồng (streaming `WorkbookWriter`) khi xuất báo cáo danh sách phiếu cân lớn (>2.000 dòng), giải phóng RAM tức thì cho các máy trạm cân 4GB RAM.
- Cài đè bản mới: bộ cài chỉ thay tệp chương trình; dữ liệu nằm ở thư mục dữ liệu của người dùng (mặc định `Documents\DGVC_DATA`), gỡ cài đặt **không** xóa dữ liệu. Sao lưu thủ công trước khi nâng cấp (Cài đặt → Dữ liệu & sao lưu → Sao lưu ngay). App tự thêm tham số cấu hình mới và dọn lô import xem trước bỏ dở khi mở.
