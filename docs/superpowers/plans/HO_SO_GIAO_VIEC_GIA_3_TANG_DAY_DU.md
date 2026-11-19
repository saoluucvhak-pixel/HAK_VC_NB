# DGVC — Giá 3 tầng: BỘ HỒ SƠ GIAO VIỆC ĐẦY ĐỦ

Gồm 3 phần: (1) prompt giao việc, (2) thiết kế đã duyệt, (3) kế hoạch triển khai + bổ sung B1–B9. Quyết định của chủ sản phẩm: **giữ nguyên tiêu đề cột mẫu in/Excel/PDF**, chỉ đổi nhãn trên màn hình.


---

# PHẦN 1 — PROMPT GIAO VIỆC

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
4. Thuật ngữ giao diện: **"Đơn giá ký hợp đồng"** (viết tắt "ĐG ký HĐ"), không dùng "đơn giá hợp đồng"/"ĐG HĐ". Không đổi tên cột dữ liệu, không đổi mẫu in BKVC.
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


---

# PHẦN 2 — THIẾT KẾ (ĐÃ DUYỆT)

# Thiết kế: quy trình giá 3 tầng (Hình thức giá → Mã đơn giá → Dòng giá theo tuyến)

Trạng thái: CHỜ NGƯỜI DÙNG DUYỆT. Thông tin người dùng đưa là tham khảo; người xây tự quyết bố cục.

## Ý định
Đơn vị cung cấp vận chuyển cần quy trình giá rõ ràng, một thông tin nhập một nơi, không ảnh hưởng cách tính giá đang chạy.

## Quy trình (người dùng chốt)
1. **Danh mục tuyến**: Ngày cập nhật · Mã tuyến · Tên tuyến · Cự ly (+ĐVT, điểm đi/đến như hiện có).
2. **Hình thức đơn giá** (hệ thống, 2 giá trị): Đơn giá cố định / Đơn giá theo giá dầu.
3. **Mã đơn giá** (con của hình thức; thuộc công ty đối tác), mỗi dòng là một tuyến:
   - Cố định: Mã tuyến, Tên tuyến, Cự ly (hiển thị), **Đơn giá cố định**.
   - Theo giá dầu: Mã tuyến, Tên tuyến, Cự ly (hiển thị), **Đơn giá ký hợp đồng**, giá dầu, định mức tiêu hao, tải trọng… như app đang tính.
4. **Hợp đồng vận chuyển**: đối tác, **một mã đơn giá** (hình thức suy ra từ mã), danh sách tuyến lấy từ mã (nhiều tuyến), xe, hiệu lực.
5. **Giao nhận dầu diezel** (bảng con của hợp đồng) — chỉ khi có tuyến theo giá dầu.
6. **Bảng tính đơn giá theo giá dầu** — màn Tính giá hiện có.

## Quyết định thiết kế (đề xuất của người xây — chờ duyệt)
- Thuật ngữ: **"Đơn giá ký hợp đồng"** (ĐG ký HĐ), không gọi "đơn giá hợp đồng". Đổi nhãn giao diện, không đổi tên cột dữ liệu, không đổi mẫu in BKVC.
- **Cự ly lưu một chỗ ở tuyến** (bộ tính giá đang đọc từ tuyến); dòng giá chỉ hiển thị. Không cho nhập cự ly thứ hai.
- **Định mức/hệ số nằm ở dòng giá theo giá dầu** (như app đang tính). Không chuyển định mức sang tuyến.
- Hình thức lưu ở mã (`MA_DON_GIA.price_method`, mặc định CO_DINH cho mã 1.5.0); dòng thừa hưởng; không đổi hình thức khi mã đã có dòng.
- **Mã tuyến tự gợi ý** (kế tiếp, vd VC.0xx) nhưng sửa được trước khi lưu, cảnh báo trùng; mã cũ giữ nguyên; vẫn nhắc "sửa giống ở các nhà máy còn lại" (mã trùng giữa máy là rủi ro, và file phiếu cân/dầu mang sẵn mã tuyến).
- **Ngày cập nhật**: mặc định lấy ngày hệ thống, người dùng được điền tay. Với dòng giá, đây là **ngày hiệu lực**: với cùng tuyến trong cùng mã, bản có ngày cập nhật **mới nhất (không sau ngày tính)** có hiệu lực; bản cũ tự đóng. Không cho điền lùi ngày vào khoảng đã có kỳ xác nhận/khóa (chốt chặn). Với danh mục tuyến, ngày là ngày chỉnh sửa gần nhất để theo dõi (không phân phiên bản tuyến).
- Hợp đồng hiển thị từng tuyến kèm nguồn giá: "theo mã DG-xxx (cố định/theo giá dầu)" hoặc "dùng giá chung (cách cũ)". Tuyến ngoài mã vẫn dùng giá chung như cũ.
- Giữ chốt chặn: dầu nhập cho tuyến cố định, thiếu định mức, giá âm, cự ly không hợp lệ — đưa cảnh báo lên sớm khi tạo dòng.
- Gói trao đổi: mã đơn giá có thêm cột → các nhà máy nâng cấp cùng đợt (ghi trong ghi chú phát hành).
- Bảo vệ tính giá: không đổi `main/engine`; kỳ đã xác nhận/khóa giữ số; dòng giá đã dùng không sửa trực tiếp (tạo phiên bản mới); test golden trước/sau phải bằng từng đồng; mã theo giá dầu phải ra đúng số như tuyến giá dầu thường cùng dữ liệu.
- Giá chung / giá riêng hợp đồng (cách cũ) giữ nguyên, gắn nhãn "cách cũ"; không tự chuyển dữ liệu cũ sang mã (làm riêng nếu người dùng muốn).

## Làm theo 2 đợt (mỗi đợt chạy đủ JSON + SQLite + Electron)
- Đợt 1: màn Hình thức → Mã → Dòng; cột hình thức; ngày cập nhật/hiệu lực; nhãn thuật ngữ.
- Đợt 2: mã tuyến gợi ý; màn Hợp đồng liệt kê tuyến + nguồn giá; sắp lại thứ tự Giao nhận dầu → Tính giá.

## Không làm
Sửa công thức; thêm/xóa hình thức giá; tự chuyển giá cũ; đổi mẫu in.


---

# PHẦN 3 — KẾ HOẠCH TRIỂN KHAI (gồm B1–B9)

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

---
## BỔ SUNG SAU RÀ SOÁT LẦN 2 (bắt buộc làm, gắn vào task tương ứng)

| # | Thiếu | Gắn vào | Việc cần làm + bằng chứng |
|---|-------|---------|---------------------------|
| B1 | Form **Hợp đồng** chưa nêu: chọn mã đơn giá phải lọc theo **đối tác** của hợp đồng và hiện **hình thức** của mã (người dùng yêu cầu "tên đối tác, mã tuyến, hình thức"). | Task 5 | Ô "Mã đơn giá" chỉ liệt kê mã ACTIVE của đối tác đó (hoặc mã chung), kèm nhãn hình thức; test e2e: đối tác A không thấy mã của đối tác B. |
| B2 | "Cập nhật thông tin dầu giao nhận **là bảng con của hợp đồng**" mới chỉ ẩn/hiện thông báo. | Task 6 | Trong màn Hợp đồng thêm tab/khối "Giao nhận dầu của hợp đồng" (xem số dòng, kỳ, nút sang màn nhập), chỉ hiện khi hợp đồng có tuyến THEO_DAU. Kiểm cả nhập từ Excel lẫn nhập tay đều gắn đúng hợp đồng. |
| B3 | Màn **Đơn giá cũ** chưa có nhãn "cách cũ". | Task 2 | Thêm dòng chú thích + nhãn trên màn Đơn giá: "Giá chung/giá riêng hợp đồng (cách cũ) — giá theo hình thức quản lý ở Mã đơn giá". Không đổi hành vi. |
| B4 | **Gói trao đổi** giữa nhà máy: cột mới chưa có test. | Task 1 | Test `exchange`: xuất gói có mã THEO_DAU → nhập vào bản cài khác (JSON và SQLite) đọc lại đúng hình thức; gói cũ (mã không có `price_method`) nhập vào bản mới → CO_DINH, không lỗi. |
| B5 | **Nâng cấp SQLite có DB sẵn** chưa có test riêng. | Task 1 | Test: dựng DB SQLite theo schema cũ (MA_DON_GIA không có `price_method`, có 1 mã + dòng cố định) → mở bằng code mới → `syncSchema` thêm cột, fingerprint khớp, mã đọc ra CO_DINH, kỳ cũ tính lại ra cùng số. |
| B6 | **Báo cáo/xuất Excel/PDF** có thể chứa chữ "Đơn giá hợp đồng"/"ĐG HĐ"; kế hoạch chưa quyết. | Task 2 | Rà `renderer/` và `main/reports/`: nhãn trên **màn hình** đổi; **tiêu đề cột mẫu in/Excel/PDF đã chốt thì GIỮ NGUYÊN** (chủ sản phẩm đã quyết 19/11/2026); liệt kê chỗ giữ nguyên vào PR để đối chiếu. |
| B7 | **Phân quyền & a11y** của màn mới. | Task 2 | Vai trò XEM không thấy nút tạo/sửa/áp dụng; hai thẻ chọn hình thức là radio (bàn phím Tab/mũi tên/Enter, có tên truy cập, focus nhìn thấy); test e2e bàn phím + vai trò XEM. |
| B8 | **Cảnh báo sớm** và **nhắc sửa giống nhà máy khác** chưa thành việc cụ thể. | Task 2, 4 | Form dòng giá báo ngay (trước khi lưu) lỗi thiếu định mức/giá dầu, tuyến tính M3 + giá cố định, cự ly tuyến không hợp lệ (dùng `previewPrice`); tạo mã đơn giá/mã tuyến phát `remindTx` như các danh mục khác (test có cảnh báo trả về). |
| B9 | Phát hành Windows thật. | Task 3, 7 | Sau CI xanh và gộp, chủ sản phẩm chạy workflow "Release (Windows)" (cài mới/cài đè/gỡ trên Windows thật); ghi kết quả vào ghi chú phát hành. Không tự tạo Release. |
