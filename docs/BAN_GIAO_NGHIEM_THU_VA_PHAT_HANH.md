# BÀN GIAO: nghiệm thu và phát hành bộ cài DGVC (sau đợt "đơn giá đơn giản")

Viết ngày 22/11/2026 cho agent kế tiếp. Đọc hết file này trước khi làm. Ngôn ngữ làm việc: tiếng Việt, ngắn gọn, nêu rõ phần nào đã kiểm và phần nào chưa.

## 0. Quy tắc bất biến (chủ sản phẩm đặt ra)
1. KHÔNG đổi công thức / kết quả tính giá (`app/main/engine/*`). Dữ liệu cũ phải tự chạy, số tiền giữ từng đồng.
2. Test phải xanh trên cả JSON và SQLite, và `npm run test:electron`. Luôn chạy test UI với biến `CHROMIUM_PATH=/opt/pw-browsers/chromium` (thiếu biến này nhiều test UI bị bỏ qua lặng lẽ và CI sẽ đỏ khi chạy thật).
3. Giữ nhãn: "Đơn giá ký hợp đồng" / "ĐG ký HĐ" / "Đơn giá dự kiến ký hợp đồng"; không dùng "Đơn giá hợp đồng", "ĐG HĐ".
4. KHÔNG tự gộp PR, KHÔNG tạo tag / Release khi chủ sản phẩm chưa yêu cầu rõ trong lượt chat đó. Mỗi hành động ra ngoài (gộp, phát hành, xóa) cần lệnh rõ của chủ sản phẩm.
5. KHÔNG force-push, không viết lại lịch sử. KHÔNG chạy `desk/sync_spec.py` (đường dẫn cứng `/home/claude`, làm mất action `subcontract.*`). Khi thêm action API: sửa tay 3 bản `app/shared/api_spec.json`, `desk/api_spec.json`, `docs/api_spec.json` (phải `cmp` giống hệt) + `docs/API_DESIGN.md`.
6. Không tự xóa được nhánh trên GitHub (lỗi 403 với nhánh `codex/*`); chỉ báo chủ sản phẩm tự xóa.
7. Khi một quyết định nằm ngoài thiết kế hoặc ảnh hưởng số tiền: hỏi chủ sản phẩm, đừng tự quyết.
8. Commit/PR: kết thúc commit bằng 2 dòng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` và `Claude-Session: https://claude.ai/code/session_0183nzUyRRwbXo3giY7bAhJL`; kết thúc mô tả PR bằng `🤖 Generated with [Claude Code](https://claude.com/claude-code)` + link session. Công cụ GitHub là `mcp__github__*` (nạp bằng ToolSearch); không có `gh`/hub.

## 1. Hiện trạng
- Repo: `saoluucvhak-pixel/HAK_VC_NB`, thư mục làm việc `/home/user/HAK_VC_NB` (mã app ở `app/`).
- `main` = bản phát hành **1.9.1** (đã có [Release v1.9.1](https://github.com/saoluucvhak-pixel/HAK_VC_NB/releases/tag/v1.9.1), CI 5/5 xanh, workflow "Release (Windows)" đạt). Thẻ cũ `v1.9.0` trỏ commit cũ, chưa có Release, ĐỪNG đụng.
- Nhánh tích hợp **`codex/don-gia-don-gian`** (HEAD ≥ `9fe360f` + commit sửa test `ui.partner`), đã đẩy lên GitHub, **CHƯA có PR**. Dựng từ `main` 1.9.1, gộp công việc của 4 agent. Các nhánh worktree `worktree-agent-*` chỉ là nháp cục bộ, bỏ qua.
- Kết quả kiểm trên nhánh tích hợp (máy Linux của phiên): JSON 378 test 375 pass 0 fail 3 bỏ qua; SQLite 378 test 374 pass 0 fail 4 bỏ qua; `test:electron` OK. 3 test bị bỏ qua là test cần mở cửa sổ Electron (không chạy được ở môi trường phiên). Agent rà soát độc lập (D): không có P0; so số tiền kỳ tính DH 88.900 và HAKQN 178.000 giữa `main` 1.9.1 và nhánh: giống từng byte.

## 2. Nhánh tích hợp đã đổi gì (theo yêu cầu của chủ sản phẩm)
1. **Màn "DM Đơn giá"** (`app/renderer/views/pricecodes.js`): Mã đơn giá = Phương thức tính giá. Chỉ 2 dòng có sẵn: PT-CD (cố định), PT-TD (điều chỉnh theo giá dầu); bỏ tạo/sửa/đóng mã, bỏ "Gán cho hợp đồng", bỏ "Chọn đơn giá có sẵn". Một bảng "Đơn giá theo tuyến" duy nhất cho mỗi phương thức. Mã tự tạo ở bản cũ (nếu còn) vẫn hiện để dữ liệu không mất.
2. **Form dòng giá theo giá dầu**: ĐG dự kiến ký HĐ tự tính (chỉ đọc, từ `prices.preview`) → ĐG tham khảo nhập tay (+ nguồn bắt buộc) → so sánh chênh lệch (đ và %) → ĐG ký HĐ nhập tay, mặc định hiển thị = ĐG dự kiến; lưu `contract_price` rỗng nếu bằng dự kiến (tiếp tục tự tính), khác thì lưu số tay.
3. **Màn Hợp đồng** (`app/renderer/views/catalog.js`): tab "Mã đơn giá" → "Tuyến và đơn giá vận chuyển": một bảng tuyến + đơn giá đang áp dụng; nút duy nhất "Thêm đơn giá" (chọn tuyến → chọn đơn giá, hoặc chọn đơn giá → tuyến tự điền; hiệu lực mặc định hôm nay); "Gỡ" dòng giá riêng. Bỏ gán/đổi/bỏ mã, bỏ nhập dầu; thống kê giao nhận dầu theo tuyến chỉ đọc. Chọn đơn giá cho hợp đồng = tạo dòng giá RIÊNG của hợp đồng sao chép từ đơn giá chọn (cơ chế "giá riêng hợp đồng" có sẵn; engine ưu tiên giá riêng). LƯU Ý cho chủ sản phẩm: sửa đơn giá gốc về sau KHÔNG tự đổi dòng đã chọn cho hợp đồng.
4. **API mới** (`CatalogService`, `router.js`): `contracts.routePrices`, `contracts.priceChoices`, `contracts.addPrice`, `contracts.removePrice`, `contracts.fuelStats` (không xóa API cũ).
5. **Luồng đối tác**: gói PHIEU_CAN xuất kèm dầu (sửa lọc cột `receive_date`) và nhập gói không kỳ xử lý dầu (khóa `fuelContentKey`, nghi trùng, đổi mã khi trùng `receipt_id` khác nội dung); chuẩn hóa dầu dùng chung `app/main/import/partnerNorm.js`; nạp đợt thuê VC chống trùng (SHA-256, khóa phiếu, `clientRequestId`, ghi tạm rồi đổi tên); đọc Excel dầu + mẫu Excel dầu cho đối tác; nút "Tải file mẫu Excel" ở màn đối chiếu; "Lịch sử đã xuất" hiển thị đúng; "Nhập gói" nhận cả `.json`; Hướng dẫn có bảng "đối tác gửi gì → vào đâu".
6. **Gộp menu**: nhóm "Nhập liệu" (Phiếu cân, Giao nhận dầu); nhóm "Đối tác" (id `xchg`: Trao đổi dữ liệu, Đối chiếu dữ liệu, Nhắc sửa danh mục). "Trao đổi dữ liệu" = tab Nhập gói / Xuất gói (gồm cả xuất gửi đối tác) / Lịch sử. "Đối chiếu dữ liệu" = tab Kiểm tra nội bộ / Đối chiếu 3 tiêu chí / Các đợt đã nạp. Bí danh `D.go('subcontract'|'export_partner'|'exchange')` vẫn mở đúng màn; phím tắt số 1..11 giữ nguyên.
7. Test bổ sung chính: `contract.prices.simple`, `price.manual-contract`, `partner.flow`, `ui.partner.e2e`, `ui.contract-prices.e2e`; nhiều test UI cũ đã cập nhật phần thao tác.

## 3. Việc còn lại, theo thứ tự (làm lần lượt, báo cáo sau mỗi bước)
### Bước 1 — chuẩn bị PR (không cần hỏi, chưa gộp)
1. `cd /home/user/HAK_VC_NB && git fetch origin && git checkout codex/don-gia-don-gian && git merge origin/main` (nếu `main` có thêm commit). Chạy lại toàn bộ test: `cd app && CHROMIUM_PATH=/opt/pw-browsers/chromium npm test`, `DGVC_STORAGE=sqlite CHROMIUM_PATH=/opt/pw-browsers/chromium npm test`, `npm run test:electron`. Phải 0 fail.
2. Xử lý các phát hiện P2 của agent rà soát độc lập (đã sửa chỗ chập chờn của `ui.partner.e2e`); còn lại cần quyết:
   - **Mất nút ngừng/bật mã đơn giá tự tạo** (`pricecodes.setActive` không còn chỗ gọi trong giao diện; API còn). HỎI chủ sản phẩm: bỏ hẳn hay trả lại nút cho mã tự tạo cũ. Trong lúc chờ: ghi vào mô tả PR.
   - Mã chết nhỏ: nút "Tạo công thức tính đơn giá mới" trong `D.views.prices` (`catalog.js` ~dòng 264) gần như không tới được; có thể xóa nếu không làm đổi hành vi.
   - Nhánh cảnh báo `W_CONTRACT_PRICE_NOT_PREFERRED` (hợp đồng đang dùng mã tự tạo có dòng cho tuyến) chưa tái hiện được bằng test: viết 1 test service nếu có thời gian.
3. Tạo PR vào `main` từ `codex/don-gia-don-gian`. Kiểm mẫu PR của repo (không có thì tự viết), nêu rõ: (a) 3 việc chủ sản phẩm yêu cầu; (b) API `contracts.*` mới; (c) gộp menu + bí danh; (d) hành vi "chọn đơn giá cho hợp đồng = sao chép dòng giá riêng, sửa gốc không tự đổi"; (e) bỏ tạo mã/gán mã/nhập dầu ở hợp đồng là CÓ CHỦ Ý; (f) hai thay đổi nhỏ ở báo cáo đối chiếu (`deductFuel` theo đợt khi API không gửi; `.dgvc/.json` đọc trực tiếp được chuẩn hóa như đường đợt); (g) phần chưa kiểm (xem mục 4). Đăng ký theo dõi PR (`subscribe_pr_activity`). Chờ CI 5/5 xanh. Nếu CI đỏ: tìm nguyên nhân gốc, sửa, không bỏ/ẩn test.
4. Báo chủ sản phẩm link PR và bảng "đã kiểm / chưa kiểm". DỪNG chờ lệnh.

### Bước 2 — nghiệm thu bởi chủ sản phẩm (con người)
Chủ sản phẩm tự thử trên Windows thật bằng bộ cài dựng ở Bước 3a (artifact): xem danh sách kiểm ở mục 4. Agent kế tiếp KHÔNG tự coi là nghiệm thu xong khi chưa nghe chủ sản phẩm nói.

### Bước 3 — phát hành (CHỈ khi chủ sản phẩm nói rõ "gộp" / "phát hành")
a. (Có thể làm sớm, không tạo Release) Chạy thử dựng bộ cài trên Windows: workflow "Release (Windows)" (`release.yml`), `ref: codex/don-gia-don-gian` hoặc `main` sau khi gộp, input `publish=false`. Workflow tự chờ CI đúng commit đạt, dựng bộ cài, thử cài mới / cài đè / gỡ cài, tính SHA-256, tải artifact. Với nhánh chưa gộp, bước "chờ CI" cần CI của đúng commit nhánh đã chạy xong.
b. Khi chủ sản phẩm yêu cầu gộp: gộp PR (kiểu merge, `expectedHeadSha` đúng), đợi CI `main` xanh.
c. Nâng phiên bản lên **1.9.2** (thẻ `v1.9.1` đã có nên KHÔNG dùng lại số cũ) trong PR riêng nhỏ: `app/package.json` (dòng 4), `app/package-lock.json` (dòng 3 và 9), `app/installer/dgvc.nsi` (`!define VERSION`), `README.md` ("Bản hiện tại" và tiêu đề "Nâng cấp từ bản cũ"), thêm `docs/PHAT_HANH_1.9.2.md` (workflow dùng file này làm nội dung Release: tóm tắt thay đổi mục 2, lưu ý nâng cấp, phần chưa kiểm, bộ cài chưa ký số). Chạy lại test, đợi CI xanh, gộp khi được phép.
d. Khi chủ sản phẩm yêu cầu phát hành: chạy workflow "Release (Windows)" trên `main` với `publish=true`, theo dõi từng bước (chờ CI, dựng bộ cài 1.3.2 để thử nâng cấp, kiểm SQLite trong Electron, `npm run dist`, SHA-256, "Nghiệm thu bộ cài Windows thực tế", tạo Release). Dùng `list_workflow_jobs` để xem bước.
e. Kiểm sau phát hành: `list_releases` thấy `v1.9.2`, có file `DGVC-Setup-1.9.2.exe` và `.exe.sha256`; nếu có thể tải artifact thì đối chiếu SHA-256. Báo chủ sản phẩm link Release.

## 4. Phần CHƯA kiểm — phải nói thẳng với chủ sản phẩm
- Chưa thử trên Windows thật với dữ liệu thật của nhà máy (chỉ có dữ liệu mẫu và runner Windows của GitHub). Danh sách chủ sản phẩm nên tự thử: cài mới; cài đè từ 1.8.3 / 1.9.1 (xem tự tạo bản sao lưu an toàn `truoc-chuyen-pt-td` khi nâng từ bản chưa có mã mặc định); mở dữ liệu thật, đối chiếu số tiền một kỳ cũ với bản cũ; thêm đơn giá ở DM Đơn giá (cố định và theo giá dầu: ĐG dự kiến, tham khảo, ký HĐ); thêm/gỡ đơn giá ở màn Hợp đồng; nhập gói đối tác có dầu; nhập Excel phiếu cân và dầu của đối tác bằng mẫu tải về; in và xuất Excel/PDF nhiều trang; hộp thoại chọn/lưu file thật của Electron (xuất `.json`).
- 3 test Electron cần mở cửa sổ không chạy được ở môi trường phiên (chạy ở CI/Windows).
- Chưa thử Excel thật của đối tác ngoài các file sinh từ mẫu.
- Bộ cài chưa ký số (Windows có thể cảnh báo).
- Chưa làm (chủ sản phẩm chưa duyệt): "nhóm 4" — ký số gói sao lưu/gói trao đổi, giới hạn đường dẫn/dung lượng ghi, chống CSV injection. Ô "Mã kích hoạt" lúc bản cài mới: chủ sản phẩm bảo giữ nguyên.
- Ở 910px: bảng thống kê dầu ở màn Hợp đồng cuộn ngang trong khung của nó; thanh thẻ cắt chữ "Kỳ tính" (có từ trước). Điểm xếp dọc của màn Hợp đồng nâng từ 899 lên 999px (hỏi chủ sản phẩm nếu muốn đổi lại).

## 5. Mẹo vận hành đã học
- Các công cụ test UI cần `CHROMIUM_PATH=/opt/pw-browsers/chromium`; worktree mới không có `app/node_modules` (symlink tạm tới `/home/user/HAK_VC_NB/app/node_modules`, không commit).
- CI chạy các test bằng `xvfb-run`; CI đòi `# skipped 0` (trên runner có Chromium/Poppler); trên môi trường phiên có vài test bỏ qua do Electron.
- Khi sửa test cũ chỉ cập nhật phần thao tác giao diện đã đổi theo yêu cầu, tuyệt đối không bỏ/làm yếu ý kiểm nghiệp vụ.
- Thông báo "worker restarted" / giới hạn sử dụng: tiếp tục từ chỗ dừng bằng `SendMessage` tới agent đã có (nếu còn) hoặc kiểm trạng thái git rồi làm tiếp.
- Báo cáo: nêu số test (tổng/pass/fail/bỏ qua) trên JSON và SQLite, phần chưa kiểm, và đừng nói "xong" khi chưa có bằng chứng.
