# TODO / ROADMAP

## Cần người dùng trả lời trước Phase 3
Q1–Q10 ✅ đã chốt đủ (07/10/2026) — chi tiết: `PHAN_TICH_THIET_KE_A-H.md` mục A.8.

## Tiêu chí hoàn thành (MASTER_PROMPT XLI)
| # | Tiêu chí | Trạng thái |
|---|---|---|
| 1 | Import được file phiếu cân | ✅ wizard 4 bước, test UI e2e |
| 2 | Không sinh duplicate khi import lại | 🟡 logic + ràng buộc DB xong, đã kiểm trên file mẫu |
| 3 | Xác định được xe | 🟡 engine xong |
| 4 | Xác định được đơn vị VC | 🟡 engine xong (lịch sử theo ngày) |
| 5 | Xác định được tuyến | 🟡 engine xong |
| 6 | Tra đúng bảng giá theo thời gian | 🟡 engine xong |
| 7 | Tính đúng chi phí từng phiếu | 🟡 engine xong, khớp Excel |
| 8 | Tổng hợp đúng theo xe | 🟡 khớp Excel 109/109 xe |
| 9 | Tổng hợp đúng theo đơn vị | 🟡 khớp Excel |
| 10 | Lịch sử từng xe theo thời gian | 🟡 timeline engine xong |
| 11–12 | Đối chiếu, chỉ ra chính xác sai lệch | ✅ cấp phiếu (cấp xe: chưa) |
| 13 | Xuất Excel | ✅ phiếu, theo xe/đơn vị/nơi xuất, bảng kê, timeline |
| 14 | Dashboard | ✅ (biểu đồ CSS đơn giản) |
| 15 | Audit log | ✅ |
| 16 | Backup/restore | ✅ |
| 17 | Kiểm thử khớp file Excel mẫu | ✅ |
| 18 | Chạy offline | ✅ font/thư viện đóng gói sẵn, CSP chặn mạng |
| 19–20 | Windows Portable / Setup | ⏳ |

## Phase tiếp theo (đề xuất thứ tự)
1. Phase 3 — Danh mục (config-driven CRUD) + import danh mục xe từ sheet "Số xe" + seed từ `data/seed/sample-v47.json` sau khi chốt Q2–Q4.
2. Phase 4–5 — Import phiếu cân end-to-end (wizard, preview, transaction, batch, Cần kiểm tra, hoàn tác).
3. Phase 6–7 — Màn hình bảng giá/giá dầu; lưu kết quả engine vào DB; tính lại hàng loạt.
4. Phase 8, 10 — Báo cáo + timeline + dashboard.
5. Phase 9 — Đối chiếu.
6. Phase 11 — Chốt kỳ, audit, backup.
7. Phase 13–14 — Build Windows (cần máy Windows hoặc CI Windows để build & smoke test native module better-sqlite3).

## Ý tưởng sau
- Đọc trực tiếp file xuất từ phần mềm trạm cân theo lịch.
- Mẫu in bảng kê thanh toán theo đơn vị VC.
- Phân quyền người nhập / người duyệt (luồng Nháp → Duyệt).
