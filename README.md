# DGVC — Đơn giá vận chuyển dăm (HAK Group)

Ứng dụng desktop (Electron, chạy offline, lưu dữ liệu JSON) thay quy trình Excel + Power Query tính đơn giá vận chuyển dăm gỗ cho các nhà máy HAK Group. Bản hiện tại: **1.2.5**.

## Thư mục
- `app/` — mã nguồn ứng dụng (`main/` xử lý, `renderer/` giao diện, `shared/` cấu trúc dữ liệu, `data_seed/` dữ liệu mẫu, `tests/` kiểm thử, `installer/` kịch bản bộ cài NSIS).
- `desk/` — đặc tả gốc (`api_spec.py`, `schema.py`); sửa xong chạy `python3 sync_spec.py`.
- `docs/` — hướng dẫn sử dụng, quy tắc tính, mô hình dữ liệu, ảnh màn hình, mẫu chứng từ, mẫu import.

## Build (Windows, cần Node.js ≥ 20 và NSIS)
```
cd app
npm install
npm test        # 151 bài kiểm tra phải đạt
npm start       # chạy thử
npm run dist    # tạo dist/DGVC-Setup-<phiên bản>.exe
```
