# HAK VC — DGVC + VC Cost trong một ứng dụng (HAK Group)

Ứng dụng desktop (Electron, chạy offline, lưu dữ liệu JSON) thay quy trình Excel + Power Query tính đơn giá vận chuyển dăm gỗ cho các nhà máy HAK Group. Bản hiện tại: **1.2.5**.

## Ứng dụng gộp (HAK VC)
Một app Electron, một cửa sổ, thanh tab chuyển giữa 2 phân hệ:
- **DGVC** — đơn giá vận chuyển dăm (mã ở `app/main`, `app/renderer`; dữ liệu JSON như cũ).
- **VC Cost** — quản lý · tính · đối chiếu chi phí vận chuyển (mã ở `app/modules/vccost`; dữ liệu SQLite như cũ, nguồn là repo HAK_VC_HHH v0.6.17).

Mỗi phân hệ chạy trong `WebContentsView` riêng (preload, IPC `api` / `vc:*` và CSS tách biệt), khởi tạo lười khi bấm tab lần đầu. Dữ liệu cũ của 2 app vẫn dùng nguyên: DGVC ở thư mục đã chọn, VC Cost ở `%APPDATA%/VCCost` (hoặc `VCCost-data` cạnh .exe bản portable).
Vỏ chung: `app/main/electron/suite.js`. Chạy riêng một phân hệ để debug: `HAK_MODULE=dgvc` hoặc `HAK_MODULE=vccost`.

```
cd app && npm install
npm run test:all     # 151 test DGVC + 64 test VC Cost
npm start
```
Lưu ý: `better-sqlite3` là module native — bộ cài Windows phải build trên Windows (hoặc có prebuilt cho Electron 38).

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
