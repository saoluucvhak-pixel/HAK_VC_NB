# DGVC 1.3.1 — Ghi chú phát hành và ma trận nghiệm thu

Cơ sở: `main` tại `f5c39fd` (1.3.0) + nhánh `codex/release-1.3.1`. Môi trường kiểm: Linux x64, Node 22.23.4, Electron 45.3.3 (Node 24.22.3, SQLite 3.54.1), Chromium của Playwright. **Không có máy Windows** trong môi trường phát triển.

## Chế độ kho được hỗ trợ chính thức
- **JSON: được hỗ trợ chính thức (mặc định).**
- **SQLite: thí điểm** (Cài đặt → Dữ liệu & sao lưu, ADMIN). Đạt kiểm thử tự động trên Linux/Electron (xem bên dưới) nhưng **chưa xác minh trên Windows thật** (cài đè, đường dẫn tiếng Việt, ổ D:, diệt virus, OneDrive). Không khuyến nghị dùng cho nhà máy khi chưa chạy `docs/THI_DIEM_SQLITE_WINDOWS.md`.

## Lỗi đã sửa trong 1.3.1 (xác nhận bằng tái hiện)
| # | Mức | Lỗi | Vị trí (trước khi sửa) | Tái hiện → thực tế / kỳ vọng | Nguyên nhân | Ca chứng minh |
|---|---|---|---|---|---|---|
| 1 | Cao (sai tiền) | **Bấm đúp "Xác nhận import" dầu nhân đôi dữ liệu**: hai yêu cầu cùng `clientRequestId` chạy đồng thời đều ghi | `ImportService.js` `confirm` (chỉ kiểm `done` sau khi xong); tương tự `PeriodService.calculate`, `RecordService.saveFuelRows`, `TicketService.bulkUpdateDescriptive` | Xem trước dầu 16 dòng → 2 `confirm` đồng thời cùng id → **32 dòng dầu** (kỳ vọng 16) | Không gộp yêu cầu đang chạy | `tests/concurrency.idempotent.test.js` (3 ca; đỏ trên mã cũ, xanh sau sửa). Thêm `main/services/idempotent.js`, khóa lô `E_BATCH_BUSY` |
| 2 | Trung bình | Màn **Phiếu cân** chỉ nạp tối đa 5.000 phiếu, không báo bị cắt; "Xóa N phiếu đang lọc" chỉ áp lên dòng đang hiện | `renderer/views/data.js` (`pageSize: 5000`), `QueryService.js` | Kho > 5.000 phiếu: danh sách thiếu phiếu; xóa hàng loạt bỏ sót phần còn lại | Giới hạn cứng, không phân trang | `tests/ui.paging.e2e.test.js` (API 5.277 phiếu + giao diện 500/trang, đỏ trên mã cũ). Thêm `idsOnly` cho thao tác hàng loạt |
| 3 | Thấp | Báo cáo **Phiếu cân** cắt cứng 1.000 dòng; **Lịch sử thao tác** cắt 1.000 | `renderer/views/reports.js:150`, `system.js:176` | Báo cáo > 1.000 dòng chỉ xem được 1.000 | `slice(0, 1000)` | Phân trang 500 / 200 dòng, dòng tổng + Excel là toàn bộ (kiểm 3.077 dòng: tổng kg dòng = tổng kg bản ghi; Excel 3.082 dòng) |
| 4 | Thấp | Phản hồi tải về sai thứ tự có thể ghi đè bộ lọc mới (Phiếu cân, báo cáo phiếu cân, lịch sử) | các hàm `load` | Đổi bộ lọc nhanh → kết quả cũ hiện sau | Không kiểm lần tải mới nhất | `D.latest()` trong `renderer/app.js`; dùng ở 3 màn |
| 5 | Thấp | Biển số gõ tay `92h - 00057` bị từ chối | `MasterDataService.saveVehicle/renameVehicle` | Thêm xe với khoảng trắng quanh dấu gạch | Chỉ `trim` | `tests/vehicle.edit.test.js` |
| 6 | Kiểm thử | 2 test giao diện chập chờn làm CI đỏ ngẫu nhiên | `ui.e2e.test.js`, `ui.ticket-update.e2e.test.js` | CI `test` đỏ 1 lần | Đếm / đọc trước khi danh sách nạp lại xong | Sửa chờ đúng điều kiện; chạy 6 lần liền xanh; CI nay in tên test đỏ |
| 7 | Tài liệu | README lỗi thời (1.2.5, "151 test", "lưu JSON") | `README.md`, `app/README.md` | — | — | Viết lại theo 1.3.x |

## Tính đúng — ca có kết quả độc lập biết trước
`tests/calc.knownanswer.test.js` (tính tay theo `docs/CALCULATION_RULES.md`, chạy cả JSON và SQLite): tuyến VC.007, 6 phiếu (2 ngoài kỳ, 1 qua đêm tính theo ngày cân 1), dầu 40 L@29.000 + 20 L@30.000 + (−5 L bù trừ): ĐG_HĐ 115.000 → ĐG VC **192.000**; BKVC 3 xe 6.810.816 + 3.210.240 + 2.880.000 = **12.901.056**, VAT 8% **1.032.084**, tổng **13.933.140** — khớp.

## Ma trận nghiệm thu
| Hạng mục | Kết quả thực tế | Trạng thái |
|---|---|---|
| `npm test` (JSON) | 212/212 đạt, 0 bỏ qua | Đạt |
| `DGVC_STORAGE=sqlite npm test` | 211 đạt, 1 bỏ qua (test định dạng tệp JSON cũ — chỉ áp dụng kho JSON) | Đạt (1 skip có lý do) |
| `npm run verify:seed` | "TẤT CẢ KHỚP EXCEL" | Đạt |
| `tools/compare-excel.js` | 8.702 phép so · 8.344 khớp · 358 khác (đều được giải thích) · 0 chưa giải thích | Đạt |
| `npm run test:electron` (JSON + SQLite trong Electron 45) | `ELECTRON OK` + `ELECTRON SQLITE OK` | Đạt (Linux/xvfb) |
| CI (test, test-sqlite, electron, quality, audit) | xem PR | Theo PR |
| Di chuyển JSON→SQLite, dry-run, kill -9 8 thời điểm, hết dung lượng, vòng tròn JSON→SQLite→JSON | `tests/storage.migrate*.test.js` | Đạt (Linux) |
| Sao lưu/khôi phục SQLite, khôi phục sao lưu JSON cũ vào SQLite, `.dgvc` hai chiều cùng `contentSha256` | `tests/storage.appcontext.test.js` | Đạt (Linux) |
| Báo cáo > 1.000 dòng: tổng khớp chi tiết, Excel đủ dòng | thăm dò 3.077 phiếu | Đạt |
| Quyền ADMIN / KE_TOAN / XEM theo vai trò | rà soát 1.2.9 (ma trận 25 action × 3 vai trò) + test router; không chạy lại ma trận đầy đủ ở 1.3.1 | Đạt (1.2.9) / Chưa chạy lại |
| Kiểm tra nhập liệu (biển số, âm, 0, trắng, ngày sai, số "1,5") qua API | thăm dò ~25 ca: đều báo lỗi đúng trường; 1 cải thiện (biển số) | Đạt |
| Dữ liệu lớn | 3.000–5.200 phiếu giả (phân trang, báo cáo, xóa hàng loạt); bench 26/52/156 tuần ở 1.2.9 (mở 108/194/603 ms) | Đạt (không chạy lại bench ở 1.3.1) |
| Màn hình nhỏ / bàn phím / hộp thoại, bộ lọc thông minh toàn diện, so sánh trực quan file Excel/PDF nhiều trang | không rà soát lại toàn bộ trong lượt này (chỉ phần phân trang/chạy đua bộ lọc) | **Chưa xác minh** |
| Cài mới / cài đè / gỡ cài bộ cài Windows, mở lại offline trên Windows | không có Windows | **Chưa xác minh** |
| SQLite trên Windows thật | không có Windows | **Chưa xác minh** |
| Ký số bộ cài | không ký (không có chứng chỉ) | Không ký |

## Nâng cấp
Cài đè lên bản cũ; dữ liệu giữ nguyên. Sao lưu thủ công trước. Kho vẫn là JSON. Muốn thử SQLite: `docs/THI_DIEM_SQLITE_WINDOWS.md`.

## Phát hành GitHub Release — trạng thái và bước còn chờ
- Phiên làm việc dựng bộ cài **không có quyền tạo tag / Release** (đẩy tag bị 403; API Release trả "Creating, editing, or deleting releases is not permitted for this session type"). Vì vậy Release **chưa được tạo từ phiên này**.
- Đã thêm workflow `.github/workflows/release.yml` (chạy thủ công, `workflow_dispatch`) trên máy **Windows** của GitHub Actions: dựng bộ cài → cài mới (đường dẫn có dấu cách) → chạy thử luồng chính trên mã đã cài → cài đè → gỡ cài (kiểm giữ thư mục dữ liệu) → thử SQLite trong Electron → SHA-256 → (tùy chọn `publish`) tạo Release `v<phiên bản>` kèm bộ cài + checksum. **Workflow này chưa được chạy** (không có Windows/quyền kích hoạt trong phiên này); kết quả đầu tiên sẽ là bằng chứng Windows đầu tiên.
- Cách phát hành: vào Actions → "Release (Windows)" → Run workflow → chọn `publish` (hoặc tạo Release thủ công từ tệp bộ cài đã gửi).
- Bộ cài `.nsi` đã thêm `/SD IDOK` cho hai hộp thoại để cài / gỡ im lặng (`/S`) không bị treo.
