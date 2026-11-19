# Giá 3 tầng (Hình thức → Mã đơn giá → Dòng giá theo tuyến) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Tổ chức màn hình/quy trình giá theo 3 tầng, không đổi cách tính giá.
**Architecture:** Thêm cột `price_method` vào `MA_DON_GIA` (mặc định CO_DINH); dòng giá vẫn là `PRICE_HISTORY` có `price_code`; `main/engine` không đổi (selectPriceVersion không lọc theo hình thức). UI dựng lại `renderer/views/pricecodes.js`; nhãn "Đơn giá ký hợp đồng".
**Tech Stack:** Node 22+, Electron, JSON/SQLite store (`syncSchema` cộng thêm cột), node:test, Playwright (dev-server e2e).
**Spec:** `docs/superpowers/specs/2026-11-19-gia-ba-tang-design.md`

## Global Constraints
- Không sửa `app/main/engine/*`; test cũ (241) phải chạy y nguyên trên JSON và SQLite (`DGVC_STORAGE=sqlite npm test`).
- Cột mới: `DEFAULT ''`/cộng thêm, schema.json là nguồn; spec API: sửa `desk/api_spec.py` rồi sinh lại 3 bản `api_spec.json` + `docs/API_DESIGN.md` (test `tests/spec.routes.test.js`).
- Nhãn giao diện: "Đơn giá ký hợp đồng" (viết tắt "ĐG ký HĐ"); không đổi tên cột dữ liệu/mẫu in BKVC.
- Tiếng Việt, lỗi nghiệp vụ nêu rõ; không dùng dữ liệu nhà máy thật trong test.
- Mỗi đợt: JSON + SQLite + `npm run test:electron` xanh rồi mới PR (nhánh `codex/…`).

## Review Focus
- Mã 1.5.0 cũ (không có `price_method`) phải đọc ra CO_DINH, kể cả SQLite đã có DB sẵn.
- Thêm dòng THEO_DAU vào mã CO_DINH (hoặc ngược lại) phải bị từ chối rõ ràng.
- Điền lùi ngày hiệu lực ≤ bản đang dùng phải báo `E_PRICE_DATE_OVERLAP` (đã có) — thêm test cho mã.
- Hai máy cùng sinh mã tuyến kế tiếp trùng: cảnh báo khi lưu, không ghi đè.
- Hợp đồng gán mã CO_DINH nhưng tuyến có phiếu dầu: giữ `E_FIXED_PRICE_HAS_FUEL`.

---
## ĐỢT 1

### Task 1: Hình thức ở mã đơn giá (dữ liệu + dịch vụ)
**Files:** Modify `app/shared/schema.json` (MA_DON_GIA thêm `price_method` ENUM CO_DINH|THEO_DAU, required false), `app/main/services/CatalogService.js` (`savePriceCode`, `_codeView`, `listPriceCodes`, `addCodeLine`, `_validatePrice`), `app/desk/api_spec.py` + sinh lại spec; Test `app/tests/pricecode.method.test.js`.
**Interfaces:**
- Produces: `savePriceCode({record:{priceCode,unitCode,priceName,priceMethod,note}})` (priceMethod mặc định CO_DINH; không đổi được khi mã đã có dòng/hợp đồng); `_codeView(c).priceMethod` (rỗng → 'CO_DINH'); `listPriceCodes()` thêm `methods:[{method:'CO_DINH'|'THEO_DAU', label, codes:[codeView]}]` (giữ `units`,`items`); `addCodeLine` ép `price_method = hình thức của mã`, record trái hình thức → `AppError VALIDATION_FAILED`.
- [ ] Viết test (thất bại): (a) tạo mã không truyền hình thức → `priceMethod === 'CO_DINH'`; (b) tạo mã THEO_DAU rồi `addCodeLine` với `priceMethod:'CO_DINH'` → ném VALIDATION_FAILED; (c) mã THEO_DAU thêm dòng đủ tham số (newPrice, fuelPriceExclVat, fuelNormLPerKm, avgLoadTon) → `activate` → kỳ tính hợp đồng gán mã cho **cùng `transportAmount`** như kỳ tính bằng giá chung cùng tham số (dùng `install('DH')`, so hai lần tính trên cùng dữ liệu); (d) đổi hình thức sau khi có dòng → lỗi; (e) lưu/đọc lại trên cả 2 kho.
- [ ] Chạy: `node --test tests/pricecode.method.test.js` → FAIL.
- [ ] Cài đặt theo signature trên; `syncSchema` tự thêm cột; mã cũ rỗng đọc là CO_DINH.
- [ ] Chạy test mới + `tests/pricecode.test.js tests/price.fixed.test.js tests/spec.routes.test.js` (JSON và `DGVC_STORAGE=sqlite`) → PASS. Commit.

### Task 2: Màn Hình thức → Mã → Dòng + nhãn "ĐG ký HĐ"
**Files:** Modify `app/renderer/views/pricecodes.js`, `app/renderer/views/catalog.js` (tách `PF` fields dùng chung), `app/renderer/views/work.js`, `app/renderer/styles.css`; Test `app/tests/ui.pricecodes.e2e.test.js` (+ `ui.price-fixed.e2e.test.js` nếu nhãn đổi).
**Interfaces:** Consumes `pricecodes.list().methods`, `pricecodes.save`, `pricecodes.addLine`.
- Cây trái: 2 nhóm "Đơn giá cố định" / "Đơn giá theo giá dầu" → mã (kèm công ty đối tác); tạo mã bằng 2 thẻ chọn hình thức rồi công ty/mã/tên.
- Form dòng: mã CO_DINH → Tuyến, Cự ly (chỉ hiển thị từ tuyến), Đơn giá cố định, Ngày cập nhật (mặc định hôm nay, điền tay được); mã THEO_DAU → thêm **Đơn giá ký hợp đồng**, giá dầu, định mức, tải trọng (cùng ô như form giá hiện có).
- Đổi nhãn "ĐG HĐ"/"Đơn giá hợp đồng" → "ĐG ký HĐ"/"Đơn giá ký hợp đồng" ở mọi file renderer (không đụng mẫu in).
- [ ] Sửa e2e: tạo mã Cố định rồi mã Theo giá dầu; thêm dòng; áp dụng; gán hợp đồng; khẳng định thấy "Đơn giá ký hợp đồng" và KHÔNG còn chữ "Đơn giá hợp đồng"/"ĐG HĐ" trên các màn giá. Chạy → FAIL.
- [ ] Cài đặt UI; chạy `node --test tests/ui.pricecodes.e2e.test.js tests/ui.price-fixed.e2e.test.js` → PASS. Kiểm bằng ảnh chụp 1366/910 px (không tràn). Commit.

### Task 3: Chốt đợt 1
**Files:** Modify `docs/HUONG_DAN_CAI_DAT_VA_SU_DUNG.md`, `docs/UI_DESIGN.md`, tạo `docs/PHAT_HANH_1.7.0.md`, nâng `app/package.json`,`package-lock.json`,`installer/dgvc.nsi`,`README.md` → 1.7.0; Test `tests/pricecode.method.test.js` (thêm ca overlap).
- [ ] Thêm test: mã có dòng ACTIVE từ 2026-01-01, tạo dòng mới `effectiveFrom ≤` → `E_PRICE_DATE_OVERLAP`; dòng mới sau ngày → áp dụng thì bản cũ đóng `effective_to`.
- [ ] Chạy `npm test`, `DGVC_STORAGE=sqlite npm test`, `npm run test:electron` → xanh. Ghi chú: các nhà máy nâng cấp cùng đợt (gói trao đổi có cột mới). Commit, PR, CI 5/5, gộp, build `npm run dist`, kiểm asar, tách file, gửi.

---
## ĐỢT 2

### Task 4: Mã tuyến gợi ý + Ngày cập nhật của tuyến
**Files:** Modify `schema.json` (TUYEN_VC thêm `catalog_date` TEXT), `CatalogService.js` (`nextRouteCode()`, `saveRoute` nhận `catalogDate`, cảnh báo trùng), `router.js` + `api_spec.py` (`routes.nextCode`), `renderer/views/catalog.js` (form tuyến, cột "Ngày cập nhật"); Test `tests/route.code.test.js`.
**Interfaces:** Produces `nextRouteCode(): {routeCode:string}` = `VC.` + (số lớn nhất dạng `VC.nnn` + 1, 3 chữ số); `saveRoute({create:true,record:{routeCode,…,catalogDate}})` — `catalogDate` mặc định ngày hệ thống (yyyy-MM-dd), sửa được; mã đã có → `DUPLICATE`.
- [ ] Test: danh mục có VC.001..VC.016 → `nextRouteCode().routeCode === 'VC.017'`; tạo mã đã có → DUPLICATE; `catalogDate` mặc định = hôm nay, điền tay được; tuyến cũ (không có ngày) hiển thị bằng `updated_at`. Chạy FAIL → cài đặt → PASS (JSON+SQLite). Commit.

### Task 5: Hợp đồng liệt kê tuyến và nguồn giá
**Files:** Modify `CatalogService.js` (`contractRouteSources({contractId})`), `router.js`,`api_spec.py` (`contracts.routeSources`), `renderer/views/catalog.js` (màn Hợp đồng); Test `tests/contract.routes.test.js`.
**Interfaces:** Produces `contractRouteSources({contractId}) → {items:[{routeCode,routeName,source:'CODE'|'CONTRACT'|'GENERAL',priceCode,priceMethod,priceId}]}` theo đúng thứ tự ưu tiên của `selectPriceVersion` (tại ngày hôm nay).
- [ ] Test: hợp đồng gán mã CO_DINH có VC.007; tuyến VC.009 không có trong mã → VC.007 `source:'CODE'`, VC.009 `source:'GENERAL'`; hợp đồng không gán mã → toàn `GENERAL`/`CONTRACT`. FAIL → cài đặt (chỉ đọc, không đổi tính giá) → PASS. UI: cột "Nguồn giá" kèm nhãn. Commit.

### Task 6: Giao nhận dầu → Tính giá theo hợp đồng
**Files:** Modify `renderer/views/work.js`, `renderer/app.js` (thứ tự menu), `renderer/views/guide.js`; Test `tests/ui.fuel-flow.e2e.test.js`.
- Màn Giao nhận dầu: nếu hợp đồng đang chọn không còn tuyến theo giá dầu (theo `contracts.routeSources`) → hiện thông báo "toàn tuyến cố định — không cần nhập dầu" (vẫn nhập được); menu theo thứ tự Hợp đồng → Giao nhận dầu → Tính giá.
- [ ] Test e2e: hợp đồng toàn cố định thấy thông báo; hợp đồng có tuyến theo giá dầu không thấy. FAIL → cài → PASS. Commit.

### Task 7: Chốt đợt 2
- [ ] Docs, `PHAT_HANH_1.8.0.md`, nâng 1.8.0; chạy đủ 3 bộ test; PR, CI, gộp, build, gửi. Báo rõ phần chưa kiểm trên Windows thật; đề nghị chạy workflow "Release (Windows)".
