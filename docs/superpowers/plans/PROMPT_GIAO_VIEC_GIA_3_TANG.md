# Prompt giao việc: triển khai "Giá 3 tầng" cho DGVC

Bạn là kỹ sư tiếp nhận việc trong repo `saoluucvhak-pixel/HAK_VC_NB` (app desktop **DGVC**: Electron, chạy offline, giao diện tiếng Việt, dùng cho **đơn vị cung cấp vận chuyển** của HAK Group). Hãy trả lời và viết commit/PR bằng tiếng Việt, **ngắn gọn, đúng trọng điểm**.

## 1. Việc cần làm
Triển khai đúng kế hoạch đã được chủ sản phẩm duyệt:
- Thiết kế (đã duyệt): `docs/superpowers/specs/2026-11-19-gia-ba-tang-design.md`
- Kế hoạch từng bước (7 việc, 2 đợt): `docs/superpowers/plans/2026-11-19-gia-ba-tang.md`

Đọc cả hai file trước khi viết dòng code nào — **kể cả mục "BỔ SUNG SAU RÀ SOÁT LẦN 2" (B1–B9) ở cuối kế hoạch, đó là yêu cầu bắt buộc**. Làm đúng thứ tự Task 1 → 7, theo TDD (viết test thất bại trước), mỗi task một commit.

## 2. Nhánh làm việc
- Lấy nhánh `codex/gia-ba-tang-design` (đang chứa thiết kế và kế hoạch), tạo nhánh làm việc mới `codex/gia-ba-tang-dot1` từ đó cho đợt 1 (và `codex/gia-ba-tang-dot2` cho đợt 2).
- Chỉ đẩy lên nhánh `codex/*`. **Không đẩy vào `main`, không force-push, không tạo tag/Release.**

## 3. Nguyên tắc bắt buộc (đừng phá)
1. **Không đổi cách tính giá.** Không sửa `app/main/engine/*`. Hợp đồng không gán mã đơn giá, giá chung, giá riêng hợp đồng, kỳ đã xác nhận/khóa phải ra **đúng từng đồng như trước**.
2. 241 test hiện có phải xanh **không sửa** (trừ test giao diện bị ảnh hưởng bởi đổi nhãn/bố cục, nêu rõ trong PR).
3. Mỗi nơi chỉ nhập một lần: cự ly lưu **một chỗ ở Danh mục tuyến**; dòng giá chỉ hiển thị. Định mức/hệ số nằm ở dòng giá theo giá dầu.
4. **Giữ nguyên tiêu đề cột mẫu in/Excel/PDF** (chủ sản phẩm đã quyết). Thuật ngữ giao diện: **"Đơn giá ký hợp đồng"** (viết tắt "ĐG ký HĐ"), không dùng "đơn giá hợp đồng"/"ĐG HĐ". Không đổi tên cột dữ liệu, không đổi mẫu in BKVC.
5. Hình thức giá chỉ có 2 giá trị hệ thống: `CO_DINH` (đơn giá cố định) và `THEO_DAU` (theo giá dầu). Không làm màn thêm/sửa/xóa hình thức.
6. Dữ liệu cũ tự đúng: mã đơn giá 1.5.0 (cột hình thức rỗng) đọc ra `CO_DINH`. Thêm cột theo kiểu cộng thêm (`DEFAULT ''`), SQLite dùng `syncSchema`.
7. Không dùng dữ liệu nhà máy thật trong test (chỉ dữ liệu mẫu/thư mục tạm).

## 4. Kiến thức dự án cần biết
- Kho dữ liệu: `JsonStore` và `SqliteStore` (mặc định SQLite). **Mọi test phải xanh trên cả hai**: `npm test` và `DGVC_STORAGE=sqlite npm test`.
- `app/shared/schema.json` là nguồn schema. API: sửa `app/desk/api_spec.py` rồi sinh lại 3 bản giống hệt `app/shared/api_spec.json`, `app/desk/api_spec.json`, `docs/api_spec.json` (`json.dumps(indent=1, ensure_ascii=False)`) và bảng trong `docs/API_DESIGN.md`; test `tests/spec.routes.test.js` kiểm đồng bộ.
- Bộ chọn giá: `app/main/engine/period.js` → `selectPriceVersion` (ưu tiên: dòng của mã gán cho hợp đồng > giá riêng hợp đồng > giá chung). Nó không lọc theo hình thức, nên mã THEO_DAU chạy được mà không sửa engine.
- Đã có sẵn (đừng làm lại): chặn điền lùi ngày hiệu lực (`E_PRICE_DATE_OVERLAP`), `E_FIXED_PRICE_HAS_FUEL`, parse tiền kiểu Việt `150.000` (`D.parseMoney`, `moneyOrEmpty`), toast không chặn chuột.
- Mã chính: `app/main/services/CatalogService.js`, `app/renderer/views/pricecodes.js`, `catalog.js`, `work.js`, `app/main/api/router.js`.
- Gói trao đổi giữa nhà máy có cột mới → ghi rõ trong ghi chú phát hành: các nhà máy phải nâng cấp cùng đợt.

## 5. Chạy test
```bash
cd app
npm test                       # JSON
DGVC_STORAGE=sqlite npm test   # SQLite
npm run test:electron          # smoke + sqlite main + autoupgrade (cần xvfb)
```
Test giao diện cần Chromium tại `/opt/pw-browsers/chromium` và `pdftotext`; chạy lẻ: `node --no-warnings --test tests/<tên>.test.js`. Kiểm giao diện bằng ảnh chụp ở 1366/910 px: không tràn, không lỗi JS.

## 6. Khi xong mỗi đợt
1. Chạy đủ 3 bộ test trên, dán số liệu thật (đạt/tổng) vào PR.
2. Cập nhật tài liệu và nâng phiên bản (đợt 1 → 1.7.0, đợt 2 → 1.8.0) ở: `app/package.json`, `app/package-lock.json` (dòng `version` đầu), `app/installer/dgvc.nsi` (`!define VERSION`), `README.md`, thêm `docs/PHAT_HANH_<phiên bản>.md`.
3. Tạo PR vào `main` (thân PR bằng tiếng Việt: nội dung, kiểm thử, phần **chưa kiểm** như Windows thật/máy in), chờ CI 5 job xanh.
4. **Dừng ở đó và báo cáo.** Chủ sản phẩm sẽ duyệt rồi mới gộp/build/phát hành. Không tự gộp.

## 7. Báo cáo
Cuối mỗi đợt báo ngắn: đã làm gì, số test đạt, lỗi tìm thấy/sửa, phần chưa xác minh. Gặp quyết định ngoài thiết kế → nêu đề xuất kèm lý do và hỏi chủ sản phẩm, đừng tự quyết.
