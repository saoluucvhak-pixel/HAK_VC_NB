# Bộ prompt sửa lỗi DGVC 1.6.0 → 1.6.1

Rà soát ngày 19/11/2026 trên `main` @ `70eb389` (bản 1.6.0, 241/241 test đạt).

**Cách dùng:** mỗi lần giao việc cho AI (Claude Code / Codex), dán **PROMPT 0 (bối cảnh chung)** rồi dán **một** prompt việc (P1 → P7). Làm theo đúng thứ tự dưới đây. Mỗi prompt là một nhánh và một PR riêng, gộp xong mới làm prompt tiếp theo.

| Thứ tự | Prompt | Mức ưu tiên | Ước lượng |
|---|---|---|---|
| 1 | P1 — Siết đặt mật khẩu lần đầu (bảo mật) | 🔴 Cao | 0,5–1 ngày |
| 2 | P2 — Sửa 4 lỗi sao lưu / khôi phục | 🔴 Cao | 0,5–1 ngày |
| 3 | P3 — Đồng bộ quyền router ↔ api_spec | 🟡 Trung bình | 1–2 giờ |
| 4 | P4 — Chống trùng dầu khi nhận gói trao đổi | 🟡 Trung bình | 0,5 ngày |
| 5 | P5 — Một nơi duy nhất gán mã đơn giá | 🟡 Trung bình | 0,5 ngày |
| 6 | P6 — Menu nhóm + màn Hợp đồng cha–con | 🟢 Thấp/UX | 1–2 ngày |
| 7 | P7 — Phát hành 1.6.1 | — | 1–2 giờ |

---

## PROMPT 0 — Bối cảnh chung (dán đầu mọi prompt)

```text
Bạn là kỹ sư phần mềm cấp cao, làm việc trên kho mã DGVC — phần mềm desktop Electron (Node ≥ 22.12, chạy offline)
tính đơn giá vận chuyển dăm gỗ cho HAK Group. Mã nguồn chính trong thư mục app/.

KIẾN TRÚC CẦN NẮM
- Giao diện (app/renderer/**) gọi MỘT cửa: window.dgvc.api(action, payload, token) → ipcMain 'api' → Router.handle()
  (app/main/api/router.js). Router kiểm quyền theo bảng ROUTES (cột roles; null = lấy từ app/shared/api_spec.json),
  kiểm rowVersion bắt buộc, rồi gọi service trong app/main/services/**.
- Kho dữ liệu: SqliteStore (mặc định) hoặc JsonStore (bản cũ), cùng hợp đồng Storage (app/main/repo/Storage.js).
  Mọi ghi phải đi qua store.transaction((tx) => …) và ghi nhật ký tx.audit(...).
- Lược đồ bảng: app/shared/schema.json (cột, unique, index). Mã lỗi: app/shared/errors.js (AppError, businessError).
- api_spec.json có 3 bản giống hệt nhau: app/shared/api_spec.json, desk/api_spec.json, docs/api_spec.json —
  sửa một bản thì phải chép sang hai bản còn lại.
- Vai trò: ADMIN, KE_TOAN, XEM. Giao diện ẩn nút ghi bằng D.writer() / D.can(...) trong app/renderer/app.js.

QUY TẮC BẮT BUỘC
1. KHÔNG thay đổi logic tính giá / làm tròn / số liệu báo cáo (app/main/engine/**). Bộ test known-answer và
   golden phải giữ nguyên kết quả.
2. Mọi thông báo cho người dùng viết tiếng Việt có dấu, cùng giọng văn với mã hiện có.
3. Không đổi tên action API đang có; thêm action mới thì khai báo trong cả ROUTES và api_spec.json (3 bản).
4. Dữ liệu cũ phải chạy được: thêm cột mới vào schema.json kèm giá trị mặc định; bản cài cũ tự nâng cấp,
   không mất dữ liệu (cả kho SQLite lẫn JSON).
5. Viết test node:test trong app/tests/ cho từng thay đổi (đặt tên file theo mẫu <chủ đề>.test.js;
   test giao diện theo mẫu ui.*.e2e.test.js nếu cần).
6. Trước khi báo xong, chạy trong app/:  npm ci  &&  npm test  — tất cả test (cũ + mới) phải đạt.
   Báo rõ số test đạt/trượt; KHÔNG được tắt, bỏ qua hay sửa test cũ cho "xanh" trừ khi prompt cho phép rõ.
7. Giữ phong cách mã hiện có (CommonJS, 'use strict', chú thích tiếng Việt ngắn gọn ở chỗ khó).
8. Làm trên nhánh riêng, commit nhỏ, mô tả commit tiếng Việt. Không tự gộp vào main.

ĐẦU RA KHI XONG
- Danh sách file đã sửa + tóm tắt thay đổi từng file.
- Kết quả npm test (số test, số đạt).
- Các rủi ro / việc còn lại (nếu có).
```

---

## P1 — Siết "đặt mật khẩu lần đầu" (lỗ hổng chiếm tài khoản)

```text
NHIỆM VỤ: Sửa lỗ hổng chiếm tài khoản ở luồng đặt mật khẩu lần đầu, vẫn giữ trải nghiệm đơn giản cho bản cài 1 người dùng.

HIỆN TRẠNG (đã xác minh)
- app/main/api/router.js: 'auth.setFirstPassword' có roles [PUBLIC] (gọi được khi chưa đăng nhập).
- app/main/services/AuthService.js:56 setFirstPassword({ username, newPassword }) chỉ cần tài khoản đang hoạt động
  và chưa có password_hash → AI CŨNG đặt được mật khẩu cho tài khoản đó.
- AuthService.js:123 resetPassword xóa password_hash → sau khi ADMIN đặt lại, bất kỳ ai ngồi vào máy đều chiếm được tài khoản.
- app/renderer/views/gate.js:45 in công khai tên 2 tài khoản ADMIN có sẵn (lấy từ resources/catalog/catalog.json
  và data_seed/*/tables/USERS.json).

YÊU CẦU
1. Mã kích hoạt dùng một lần:
   - Thêm cột vào bảng USERS trong app/shared/schema.json: setup_code_hash (string, mặc định ''),
     setup_code_salt (string, ''), setup_code_expires_at (string ISO, '').
   - Khi ADMIN tạo tài khoản mới (saveUser, nhánh tạo) hoặc resetPassword: sinh mã 8 ký tự ngẫu nhiên
     (crypto.randomInt, bảng chữ không dễ nhầm: bỏ 0/O/1/I/L), băm scrypt như mật khẩu, hạn 24 giờ
     (cấu hình CONFIG 'SETUP_CODE_HOURS', mặc định 24). Trả mã GỐC trong kết quả API đúng một lần
     ({ setupCode, setupCodeExpiresAt }); KHÔNG lưu mã gốc, KHÔNG ghi mã vào audit/log.
   - setFirstPassword nhận thêm setupCode. Bắt buộc khớp mã + còn hạn; sai mã tính vào failed_attempts và dùng
     chung cơ chế khóa LOGIN_MAX_FAILED / LOGIN_LOCK_MINUTES như login. Đặt thành công → xóa 3 cột mã.
2. Ngoại lệ bản cài mới (để 1 người dùng tự khởi động được):
   - Nếu KHÔNG có ADMIN nào đang hoạt động có password_hash (bản cài mới tinh / dữ liệu mẫu), cho phép đặt
     mật khẩu lần đầu cho MỘT tài khoản ADMIN mà không cần mã. Ngay khi đã có 1 ADMIN có mật khẩu,
     mọi tài khoản còn lại bắt buộc dùng mã.
   - Viết rõ điều kiện này trong chú thích đầu AuthService.js.
3. Giao diện:
   - gate.js: bỏ dòng in danh sách email ADMIN có sẵn. Màn "Đặt mật khẩu lần đầu" thêm ô "Mã kích hoạt
     (do ADMIN cấp)"; ẩn ô này khi bootstrap/setup.status báo đang ở trường hợp ngoại lệ bản cài mới
     (thêm cờ firstAdminOpen vào kết quả setup.status hoặc auth.login lỗi PASSWORD_NOT_SET).
   - system.js (quản lý người dùng): sau khi tạo người dùng / Đặt lại mật khẩu, hiện hộp thoại có mã kích hoạt,
     hạn dùng, nút "Sao chép" và lời nhắc "Mã chỉ hiện một lần".
4. Cập nhật api_spec.json (3 bản): input của auth.setFirstPassword thêm setupCode (không bắt buộc ở mức spec,
   service kiểm); output của users.save / users.resetPassword thêm setupCode, setupCodeExpiresAt.
5. Tùy chọn 1 người dùng: thêm CONFIG 'SINGLE_USER_MODE' (TRUE/FALSE, mặc định FALSE). Khi TRUE và chỉ có 1
   tài khoản đang hoạt động, màn đăng nhập điền sẵn tên đăng nhập (vẫn bắt nhập mật khẩu). Chỉ ADMIN sửa được.

KHÔNG ĐƯỢC
- Bỏ yêu cầu mật khẩu, hay lưu mật khẩu / mã ở dạng đọc được.
- Làm hỏng luồng đăng nhập của dữ liệu cũ: tài khoản đã có mật khẩu đăng nhập bình thường.

TIÊU CHÍ NGHIỆM THU
- Bản cài mới: ADMIN đầu tiên đặt được mật khẩu không cần mã; tài khoản ADMIN thứ hai sau đó KHÔNG đặt được nếu thiếu mã.
- ADMIN đặt lại mật khẩu cho kế toán → gọi setFirstPassword không mã / sai mã / mã hết hạn đều bị từ chối;
  đúng mã thì thành công và mã không dùng lại được lần hai.
- Sai mã quá LOGIN_MAX_FAILED lần → tài khoản bị khóa.
- Không có mã gốc trong bảng AUDIT_LOG, trong file log, trong bản sao lưu.

TEST BẮT BUỘC: app/tests/auth.setupcode.test.js bao phủ toàn bộ tiêu chí trên (dùng tham số now của AuthService để giả lập hết hạn);
cập nhật test e2e đăng nhập lần đầu nếu cần (ghi rõ test nào bị sửa và lý do).
```

---

## P2 — Sửa 4 lỗi sao lưu / khôi phục

```text
NHIỆM VỤ: Sửa 4 lỗi trong app/main/services/BackupService.js (và chỗ gọi trong router.js) để sao lưu đủ, không thừa, khôi phục an toàn.

LỖI 1 — Bản sao lưu THÁNG có thể không bao giờ được tạo
- autoDaily() (dòng ~91) chỉ tạo bản monthly khi today.endsWith('01'). Không ai mở app vào ngày mùng 1 → tháng đó mất bản monthly.
- Sửa: tạo bản monthly khi thư mục backups/monthly CHƯA có file của THÁNG HIỆN TẠI (tiền tố _YYYYMM), bất kể ngày nào.

LỖI 2 — Hai bản sao lưu ngày cùng lúc
- router.js:205 gọi ctx.svc.backup.autoDaily() sau MỖI yêu cầu thành công, không chờ (fire-and-forget).
  Hai yêu cầu gần nhau đều thấy "hôm nay chưa có" → tạo 2 bản daily.
- Sửa: trong BackupService giữ this._autoRunning (Promise). Nếu đang chạy → trả lại đúng promise đó; xong (thành công hay lỗi)
  thì xóa. Ngoài ra lưu bộ nhớ đệm "ngày đã kiểm xong" (this._autoCheckedDay) để không readdirSync ở mọi yêu cầu.

LỖI 3 — Khôi phục kho JSON có thể làm app hỏng giữa chừng
- restore() (dòng ~208): sau this.store.close() (dòng ~219), nhánh kind === 'json' làm: giải nén → rmSync(tables) → renameSync(tmp/tables).
  Nếu lỗi ở giữa: kho không được mở lại (app hỏng đến khi khởi động lại) và có thể mất thư mục tables/.
- Sửa theo mẫu nhánh SQLite đã có:
  a) giải nén vào restore-<ts>/, KIỂM LẠI SHA-256 từng tệp theo manifest đã giải nén;
  b) renameSync(root/tables → root/tables.before-restore), copy manifest.json → manifest.json.before-restore;
  c) renameSync(tmp/tables → root/tables), chép manifest mới;
  d) thử reopen(root); lỗi → trả lại tables.before-restore + manifest cũ, reopen lại bản cũ, ném lỗi gốc;
  e) thành công → xóa *.before-restore và thư mục tạm;
  f) bọc toàn bộ trong try/finally sao cho ĐƯỜNG NÀO this.store cũng là một kho đang mở.

LỖI 4 — Bản chép ra ngoài (USB / Google Drive) không được kiểm
- _mirror() (dòng ~70) copyFileSync rồi báo ok mà không kiểm.
- Sửa: chép ra <tên>.part, đọc lại tính SHA-256, khớp với bản gốc mới rename thành tên thật; không khớp → xóa .part,
  trả { ok:false, message:'Bản chép ra … bị sai nội dung (SHA-256) — kiểm tra USB/ổ mạng' }.
- Áp dụng xoay vòng cho thư mục ngoài: giữ tối đa BACKUP_MIRROR_KEEP bản (CONFIG mới, mặc định 60; 0 = không xóa).

YÊU CẦU CHUNG
- Thêm các CONFIG mới vào dữ liệu mẫu / catalog với giá trị mặc định; bản cài cũ chưa có thì dùng mặc định.
- Giữ nguyên định dạng tên file sao lưu và nội dung backup-info.json (máy khác vẫn khôi phục được bản cũ).
- Màn Cài đặt › Sao lưu (app/renderer/views/system.js): nếu lần chép ngoài gần nhất lỗi, hiện cảnh báo màu vàng kèm message.

TIÊU CHÍ NGHIỆM THU
- Giả lập ngày 15 của tháng chưa có monthly → autoDaily tạo đủ 1 daily + 1 monthly; gọi lại cùng ngày → không tạo thêm.
- Gọi autoDaily() 5 lần song song (Promise.all) → đúng 1 file daily.
- Khôi phục JSON khi giả lập lỗi ở bước đổi tên / mở lại → dữ liệu trước khôi phục còn nguyên, store vẫn đọc/ghi được.
- Mirror vào thư mục giả lập ghi hỏng → báo lỗi, không để lại file .zip hỏng.

TEST BẮT BUỘC: app/tests/backup.fixes161.test.js (dùng tham số now của BackupService, thư mục tạm os.tmpdir()),
chạy cho CẢ kho JSON và SQLite ở các ca áp dụng. backup.lifecycle.test.js và backup.restorefile.test.js phải vẫn đạt.
```

---

## P3 — Đồng bộ quyền giữa router và api_spec

```text
NHIỆM VỤ: Loại bỏ chỗ lệch quyền giữa ROUTES (app/main/api/router.js) và api_spec.json, và thêm test chặn lệch về sau.

HIỆN TRẠNG
- router.js:118–119: 'periods.unlock' và 'periods.reopen' khai báo roles AK (ADMIN, KE_TOAN).
- api_spec.json ghi roles ['ADMIN'] cho hai action này.
- Thực tế PeriodService._transition (needUnlock) cho phép ADMIN HOẶC user.canUnlock → kế toán được cấp quyền mở khóa vẫn dùng được.
  Hành vi đúng là của router + service; tài liệu sai.

YÊU CẦU
1. Sửa api_spec.json (cả 3 bản) cho periods.unlock / periods.reopen: roles ["ADMIN","KE_TOAN"], mô tả thêm câu
   "KE_TOAN chỉ dùng được khi tài khoản có quyền mở khóa (can_unlock)".
2. Thêm test app/tests/spec.roles-sync.test.js:
   - Với MỌI action có roles khác null trong ROUTES và có trong api_spec → hai danh sách roles phải bằng nhau (không phân biệt thứ tự).
   - Mọi action trong api_spec phải có trong ROUTES và ngược lại (trừ danh sách ngoại lệ ghi rõ trong test, nếu có).
   - 3 bản api_spec.json phải giống hệt nhau (so SHA-256).
3. Test quyền: KE_TOAN không có can_unlock gọi periods.unlock → FORBIDDEN; có can_unlock → chuyển trạng thái thành công;
   XEM gọi → FORBIDDEN ở router.
4. Màn Tính giá / Kỳ tính: nút "Mở khóa" / "Mở lại" chỉ hiện khi D.can('ADMIN') || state.boot.user.canUnlock.

TIÊU CHÍ NGHIỆM THU: test mới đạt; không còn lệch nào được test phát hiện.
```

---

## P4 — Chống trùng dòng dầu khi nhận gói trao đổi

```text
NHIỆM VỤ: Ngăn một dòng giao nhận dầu bị ghi 2 lần khi cùng nội dung đã được nhập ở máy nhận (nhập tay/import) và lại đến trong gói trao đổi từ máy khác.

HIỆN TRẠNG
- Bảng GIAO_NHAN_DAU không có ràng buộc unique theo nội dung (đúng thiết kế: 2 dòng giống hệt có thể hợp lệ).
- ImportService (app/main/import/ImportService.js ~dòng 414–421) chống trùng theo khóa nội dung
  [receive_date, plate_no, qty_liter, fuel_price_excl_vat, purchase_date, giver_unit_code, route_code] + contract_id,
  ghép 1-1 (n dòng giống nhau trong kho thì chỉ coi n dòng đến là trùng).
- ExchangeService.previewPackage (app/main/services/ExchangeService.js ~dòng 242–249) so GIAO_NHAN_DAU chỉ theo receipt_id →
  dòng cùng nội dung nhưng khác receipt_id (sinh ở máy khác) được coi là NEW → ghi thêm.

YÊU CẦU
1. Tách hàm khóa nội dung dầu dùng chung (vd app/main/import/fuelKey.js: fuelContentKey(r)) và dùng ở CẢ ImportService và ExchangeService
   (không được đổi kết quả của ImportService — test hiện có phải đạt nguyên).
2. Trong previewPackage, với dòng GIAO_NHAN_DAU có action 'NEW': ghép 1-1 với các dòng ĐANG CÓ (is_deleted=false) cùng contract_id và cùng khóa nội dung
   mà KHÔNG nằm trong gói. Ghép được → đổi action thành 'CONFLICT' với kind 'POSSIBLE_DUPLICATE', default 'SKIP',
   note: "Dòng dầu ngày …, xe …, … lít đã có ở máy này (mã …) — có thể là cùng một lần giao".
   Người dùng chọn KEEP (vẫn nhập) hoặc SKIP (bỏ qua) trong màn xung đột sẵn có.
3. Nếu dòng dầu bị SKIP nhưng FUEL_DETAIL của kỳ trong gói tham chiếu receipt_id đó → không được nhập kỳ ở trạng thái thiếu dầu:
   hoặc ánh xạ receipt_id đến sang receipt_id đang có (ghi rõ trong audit), hoặc buộc người dùng chọn KEEP. Chọn một phương án,
   giải thích lý do trong mô tả PR.
4. Hiển thị loại xung đột mới trong app/renderer/views/system.js (khu Trao đổi dữ liệu), dùng cùng giao diện xung đột hiện có.

TIÊU CHÍ NGHIỆM THU
- Máy B đã nhập tay dòng dầu X; nhận gói từ máy A có cùng dòng X (receipt_id khác) → xem trước báo POSSIBLE_DUPLICATE, mặc định bỏ qua; nhập xong chỉ còn 1 dòng X.
- 2 dòng X giống hệt trong gói, máy B có 1 → chỉ 1 dòng bị đánh dấu nghi trùng, dòng còn lại NEW.
- Tổng dầu / kết quả kỳ sau khi nhập khớp với máy gửi.

TEST BẮT BUỘC: app/tests/exchange.fuel-dup.test.js; exchange.multi / exchange.supersede / ui.exchange-conflict.e2e phải vẫn đạt.
```

---

## P5 — Một nơi duy nhất gán mã đơn giá cho hợp đồng

```text
NHIỆM VỤ: Bỏ việc gán/bỏ mã đơn giá cho hợp đồng ở hai màn, chỉ để một nơi chỉnh sửa, các màn khác chỉ xem và dẫn sang.

HIỆN TRẠNG
- app/renderer/views/pricecodes.js ~dòng 60–76: "Gán mã cho hợp đồng" / "Bỏ mã" gọi contracts.save { priceCode }.
- app/renderer/views/catalog.js ~dòng 224–227: form Hợp đồng cũng gọi contracts.save, có thể sửa price_code.
- Menu có 3 màn liên quan giá cạnh nhau: Đơn giá (prices), Mã đơn giá (pricecodes), Căn cứ giá hợp đồng (basis).

YÊU CẦU
1. Nơi chỉnh sửa DUY NHẤT: màn Mã đơn giá (pricecodes).
2. Màn Hợp đồng (catalog.js): trường mã đơn giá chuyển thành chỉ đọc, hiện "Mã đơn giá: <mã> (hoặc 'Giá chung')" + nút
   "Đổi ở Mã đơn giá →" gọi D.go('pricecodes', { unitCode, priceCode }). Khi lưu form hợp đồng KHÔNG gửi priceCode
   (để không ghi đè giá trị vừa đổi ở màn khác).
3. Phía máy chủ: MasterDataService.saveContract chỉ đổi price_code khi payload CÓ khóa priceCode (hasOwnProperty), để form cũ/khác không vô tình xóa mã.
4. Đầu mỗi màn Đơn giá / Mã đơn giá / Căn cứ giá hợp đồng thêm một dòng giải thích ngắn (class small muted):
   - Đơn giá: "Bảng giá chung theo tuyến. Hợp đồng có mã đơn giá riêng thì dùng giá ở màn Mã đơn giá."
   - Mã đơn giá: "Bộ giá riêng theo đối tác; gán cho hợp đồng tại đây."
   - Căn cứ giá hợp đồng: "Chỉ xem: giá nào đang được áp cho từng hợp đồng / tuyến / ngày."
   kèm liên kết sang hai màn còn lại.
5. pricecodes nhận params { unitCode, priceCode } để mở sẵn đúng mã.

TIÊU CHÍ NGHIỆM THU
- Không còn chỗ nào ngoài pricecodes.js gửi priceCode lên contracts.save (kiểm bằng grep trong test).
- Sửa tên/ghi chú hợp đồng ở màn Hợp đồng không làm mất mã đơn giá đã gán.
TEST BẮT BUỘC: cập nhật/ thêm app/tests/ui.pricecodes.e2e.test.js và contract.edit.test.js cho 2 tiêu chí trên.
```

---

## P6 — Menu nhóm và màn Hợp đồng kiểu cha–con

```text
NHIỆM VỤ: Sắp lại điều hướng cho dễ dùng, không đổi chức năng nghiệp vụ.

HIỆN TRẠNG
- app/renderer/app.js:253 NAV là mảng phẳng 19 mục; phím tắt chỉ có ở 11 mục.
- Xe, Công ty đối tác, Người dùng nằm chung tab trong Cài đặt (system.js), tách khỏi luồng danh mục.
- Màn Hợp đồng (catalog.js) là bảng + form; xe của hợp đồng, mã giá, kỳ tính nằm ở các màn khác.

YÊU CẦU
1. NAV đổi thành cấu trúc nhóm (giữ nguyên id view để D.go(...) và test cũ vẫn chạy):
   - Tổng quan: dashboard, guide
   - Nhập liệu: tickets, fuel
   - Danh mục: units (Công ty & đối tác — tách từ Cài đặt), vehicles (Xe — tách từ Cài đặt), routes, contracts, prices, pricecodes, basis
   - Tính & chốt: calc, validation, bkvc, bkct
   - Báo cáo: reports
   - Trao đổi & đối chiếu: exchange, reconcile, sync
   - Hệ thống: audit, settings (Người dùng, Sao lưu, Lưu trữ, Cấu hình còn ở đây)
   Nhóm thu gọn/mở được, nhớ trạng thái bằng localStorage (bọc try/catch), tự mở nhóm chứa màn hiện tại.
   Phím tắt: giữ nguyên các số đang có; KHÔNG đổi số của mục cũ.
2. Tab cũ Cài đặt › Đơn vị/Xe: giữ đường dẫn D.go('settings', { tab: 'units' }) hoạt động bằng cách chuyển hướng sang view mới.
3. Màn Hợp đồng kiểu cha–con:
   - Trái: danh sách hợp đồng (lọc theo đang dùng / vai trò bên vận chuyển–bên thuê, ô tìm).
   - Phải: chi tiết hợp đồng đang chọn với các thẻ: Thông tin · Xe của hợp đồng (contracts.vehicles / setVehicles) ·
     Mã đơn giá (chỉ xem, dẫn sang pricecodes theo P5) · Kỳ tính (periods.list lọc theo hợp đồng, bấm mở màn calc).
   - Dùng lại cơ chế guard.next() như pricecodes.js để bỏ kết quả cũ khi người dùng chọn nhanh.
   - Thanh vị trí ở đầu màn: "Danh mục › Hợp đồng › <mã HĐ>".
   - Màn hẹp (< 900px): danh sách và chi tiết xếp dọc, có nút "← Danh sách".
4. Truy cập: nhóm menu dùng <button aria-expanded>, aria-current="page" ở mục đang mở; điều hướng bàn phím đầy đủ.

KHÔNG ĐƯỢC: đổi API, đổi quyền, đổi dữ liệu. Chỉ đổi giao diện.

TIÊU CHÍ NGHIỆM THU
- Mọi màn cũ vẫn mở được bằng menu và bằng D.go(id).
- ui.navigation / ui.a11y / ui.contract / ui.vehicle e2e vẫn đạt (được phép sửa selector test khi cấu trúc menu đổi — liệt kê rõ).
- Thêm app/tests/ui.nav-groups.e2e.test.js: thu gọn/mở nhóm, tự mở nhóm của màn hiện tại, phím tắt cũ còn chạy,
  màn Hợp đồng chọn HĐ → thẻ Xe/Kỳ tính hiện đúng dữ liệu.
- Chụp màn hình trước/sau (Playwright) lưu vào docs/man_hinh_1.6.1/.
```

---

## P7 — Phát hành 1.6.1 (sau khi P1–P6 đã gộp)

```text
NHIỆM VỤ: Chuẩn bị phát hành bản 1.6.1.

1. Nâng version 1.6.0 → 1.6.1 trong app/package.json và package-lock.json; cập nhật dòng "Bản hiện tại" trong README.md gốc.
2. Viết docs/PHAT_HANH_1.6.1.md theo mẫu docs/PHAT_HANH_1.6.0.md: thay đổi cho người dùng (ngôn ngữ dễ hiểu), thay đổi kỹ thuật,
   hướng dẫn nâng cấp (bản cũ tự nâng cấp, cột mới của USERS, CONFIG mới: SETUP_CODE_HOURS, BACKUP_MIRROR_KEEP, SINGLE_USER_MODE),
   lưu ý cho ADMIN: sau nâng cấp, tài khoản chưa có mật khẩu cần mã kích hoạt — vào Cài đặt › Người dùng › Đặt lại mật khẩu để lấy mã.
3. Cập nhật docs/HUONG_DAN_CAI_DAT_VA_SU_DUNG.md phần đăng nhập lần đầu, sao lưu, gán mã đơn giá, menu mới.
4. Chạy: cd app && npm ci && npm test && npm run test:electron (cần xvfb). Báo kết quả đầy đủ.
5. Danh sách kiểm tra nghiệm thu thủ công trên Windows (đưa vào cuối PHAT_HANH_1.6.1.md):
   [ ] Cài mới: đặt mật khẩu ADMIN đầu tiên không cần mã
   [ ] Tạo kế toán → nhận mã → đăng nhập lần đầu bằng mã
   [ ] Nâng cấp từ 1.6.0 giữ nguyên dữ liệu, đăng nhập được
   [ ] Sao lưu ngày + tháng tự tạo; chép USB thành công / rút USB báo lỗi rõ
   [ ] Khôi phục từ file .zip và từ manifest.json
   [ ] Nhập gói trao đổi có dòng dầu trùng → báo nghi trùng
   [ ] Menu nhóm, phím tắt, màn Hợp đồng cha–con
```
