# DGVC — Phần mềm Đơn giá vận chuyển dăm (bản desktop, HAK Group)

Thay cho Excel + Power Query. Electron + HTML/JS, chạy offline, dữ liệu là file JSON (không SQL), **một bộ cài cho mọi nhà máy**. Đơn vị của máy (HAK / HAKQN / ĐH / CNHAK …) được chọn ở lần mở đầu tiên.

```
main/
  electron/main.js, preload.js   vỏ cửa sổ Windows: IPC 'api', hộp thoại, in, printToPDF, khóa 1 cửa sổ
  app/AppContext.js              khởi tạo bản cài (chọn đơn vị + thư mục dữ liệu), mở kho, dựng service, đổi thư mục
  api/router.js                  MỘT cửa API cho giao diện: phiên đăng nhập, quyền theo vai trò, phong bì {ok,data,error,warnings,meta}
  engine/                        công thức nghiệp vụ (hàm thuần): làm tròn PQ, Tầng A/B/C, kỳ tính, người ký, đọc số thành chữ, truy vết 15 bước
  repo/                          JsonStore (khóa thư mục, journal 2 pha, SHA-256, ràng buộc), Journal, validate
  import/                        file Excel mẫu (templates.js), đọc Excel, tự dò tiêu đề, ghép cột, kiểm tra, xem trước → xác nhận (gán mã tuyến chung cho file trạm cân)
  services/
    AuthService.js               đăng nhập scrypt, đặt mật khẩu lần đầu, khóa 15 phút sau 5 lần sai, phiên 60 phút, quản lý user
    PeriodService.js             kỳ tính: tính / tính lại / xác nhận / khóa / mở khóa / trả nháp / hủy; chống tính trùng
    TicketService.js             sửa phiếu theo nhóm cột định danh / cốt lõi / mô tả; sửa hàng loạt cột mô tả
    RecordService.js             xóa mềm, xác nhận cảnh báo, sửa / nhập tay dòng dầu
    CatalogService.js            tuyến (thêm / sửa / ngừng) + phiên bản giá (nháp → xem trước → kích hoạt)
    MasterDataService.js         đơn vị, xe, hợp đồng (tên in chứng từ, mẫu diễn giải hóa đơn, phạm vi xe, người ký)
    SyncReminderService.js       nhắc sửa danh mục ở các nhà máy còn lại (bản cài nào cũng sửa được danh mục)
    BackupService.js             sao lưu ngày / tháng / thủ công / an toàn, chép ra USB–Google Drive, khôi phục có kiểm SHA-256
    ExchangeService.js           gói .dgvc DANH_MUC / PHIEU_CAN / KY_TINH: xuất, xem trước (mới / giống / cập nhật / xung đột), nhập
    QueryService.js              tổng quan, danh sách phiếu / dầu / kỳ, truy vết, kiểm tra dữ liệu, lịch sử, cấu hình
  reports/                       BKVC, bảng kê chi tiết, bảng tính đơn giá, diễn giải hóa đơn, file nhập hóa đơn MISA meInvoice → XLSX / CSV / PDF / HTML
resources/templates/           mẫu Excel "Hóa đơn GTGT 1 thuế suất" của MISA (file xuất ghi vào bản sao mẫu này)
renderer/                        giao diện (HTML/CSS/JS thuần, font đóng gói): app.js + views/*.js
resources/catalog/catalog.json   danh mục đi kèm bộ cài (dùng chung mọi nhà máy) — sinh bằng tools/build-catalog.js
shared/                          schema.json (20 bảng), api_spec.json, errors.js
installer/dgvc.nsi               bộ cài Windows (NSIS): cài cho user, lối tắt, gỡ cài không xóa dữ liệu
build/icon.*                     biểu tượng
tests/                           119 test (node:test) + tests/electron.smoke.js (chạy bản Electron thật)
tools/                           dev-server (chạy giao diện trên trình duyệt), compare-excel (so APP ↔ Excel), bench-year, build-catalog
```

## Lệnh
```
npm install                 # lần đầu (exceljs, adm-zip; electron, electron-builder, playwright-core để phát triển)
npm start                   # mở bản Electron
npm run dev                 # chạy giao diện trên trình duyệt: http://127.0.0.1:5178
npm test                    # toàn bộ test (test PDF / giao diện tự bỏ qua nếu máy không có Chromium)
npm run test:electron       # chạy thử bản Electron thật (Linux: cần xvfb)
npm run compare             # so sánh APP ↔ 3 file Excel gốc → docs/SO_SANH_APP_EXCEL.xlsx
npm run dist                # đóng gói Windows: dist/win-unpacked + dist/DGVC-Setup-<phiên bản>.exe (cần makensis)
```

Trên máy Windows có Node.js, có thể dùng `npm run dist:win` để electron-builder tự tạo bộ cài NSIS (có gắn biểu tượng vào file exe).
