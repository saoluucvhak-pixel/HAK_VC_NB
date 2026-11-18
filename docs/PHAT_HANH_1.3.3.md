# DGVC 1.3.3 — sửa lỗi nhập liệu và nghiệm thu Windows

Ngày kiểm tra 18/11/2026. Nâng từ 1.3.2 (`23452ed`). Node 24.21.0 và Electron 45.3.3 trên Windows x64; CI dùng Node 22 trên Linux.

## Thay đổi

- Xem trước import tải đủ mọi dòng, hiển thị 200 dòng/trang và lọc theo trạng thái. Lựa chọn bỏ dòng được giữ qua các trang và bộ lọc, dòng lỗi cuối lô vẫn được bỏ đúng khi xác nhận. Ca hồi quy dùng 5.202 dòng.
- Sửa lỗi Windows/OneDrive khóa tệp tạm thời gây EPERM khi đổi tên journal. Các bước rename/unlink trong journal thử lại hữu hạn với EPERM/EACCES/EBUSY, tối đa 9 lần, tổng khoảng nghỉ 1,8 giây. Tệp đích được giữ khi thử lại thất bại.
- Nếu giao dịch JSON ghi dở, app chặn ghi tiếp và compact, báo cần đóng/mở lại để phục hồi journal. Kiểm thử xác nhận mở lại hoàn tất giao dịch và ghi tiếp được, SHA-256 hợp lệ.
- Sửa thao tác màn cũ khi điều hướng chậm: màn đang rời được chặn tương tác, có trạng thái bận; kết quả điều hướng cũ được bỏ qua. Hồi quy xác định đã đỏ trên mã cũ và xanh sau sửa, xử lý nguyên nhân ca Nhật trình xe mở nhầm import.
- Giữ nguyên byte các tệp dữ liệu mẫu khi checkout trên Windows để tránh sai SHA-256 do đổi xuống dòng.
- Workflow phát hành chờ CI của đúng commit đạt ở test, test-sqlite, electron và quality, rồi bắt buộc kiểm SQLite/Electron và nghiệm thu bộ cài đạt. Chạy trực tiếp DGVC.exe đã cài, kiểm nâng cấp từ bản 1.3.2 có dữ liệu và kỳ đã khóa. Workflow vẫn chạy thủ công.

## Kết quả kiểm chứng

| Hạng mục | Bằng chứng | Kết quả |
|---|---|---|
| JSON trên CI | Bộ 219 ca, 0 fail, 0 skip | Đạt |
| SQLite trên CI | 218 ca đạt, 1 skip cho định dạng JSON cũ | Đạt |
| Electron, chất lượng mã, audit thư viện chạy trong app | CI 5 job đạt tại b4fe53f | Đạt |
| JSON trên Windows, có Chromium/Poppler | 219/219 đạt, 0 fail, 0 skip trên mã cuối | Đạt |
| Điều hướng chậm và Nhật trình xe | 2/2 ca Windows trên JSON và cấu hình SQLite, API được trì hoãn có kiểm soát | Đạt |
| Hồi quy khóa tệp và mất điện | 17/17 ca Windows, gồm 7 thời điểm mất điện và 2 ca mới | Đạt |
| Hợp đồng kho, chuyển đổi và sao lưu SQLite trên Windows sau sửa journal | 26/26 ca | Đạt |
| Giao diện/PDF trên SQLite Windows | 31/31 ca, 0 skip | Đạt |
| Dữ liệu mẫu so với Excel | verify:seed khớp toàn bộ | Đạt |
| Đối chiếu workbook tham chiếu | 8.702 phép so, 8.344 khớp, 358 khác có giải thích, 0 chưa giải thích | Đạt |
| Chạy DGVC.exe đóng gói trong thư mục OneDrive có tiếng Việt | Nhập 77 phiếu, 16 dòng dầu, tính giá, PDF và khóa kỳ | Đạt |
| Cài mới và cài đè 1.3.2 → 1.3.3 trên Windows | tests/windows-installer.ps1, kho thử riêng có tiếng Việt/dấu cách, gọi trực tiếp exe đã cài | Đạt cục bộ ở chế độ cách ly |
| Bảo toàn số liệu sau nâng cấp | 77 phiếu, 16 dòng dầu, kỳ DA_KHOA; đối chiếu toàn bộ dòng của 8 bảng tài chính | Đạt |
| BKVC, Excel, sao lưu/khôi phục sau nâng cấp | Tổng 139.421.905 đồng, dữ liệu tài chính trước/sau khớp | Đạt |
| Gỡ cài đặt | SHA-256 các tệp dữ liệu nghiệp vụ, cấu hình và báo cáo giữ nguyên | Đạt |
| Nguồn và gói app.asar | 81 tệp main/renderer/shared/resources khớp từng byte | Đạt |

CI của mã nghiệp vụ tại [run 44254655238](https://github.com/saoluucvhak-pixel/HAK_VC_NB/actions/runs/44254655238). Lượt nghiệm thu cục bộ dùng tùy chọn nội bộ /ACCEPTANCE để giữ nguyên registry và lối tắt của bản 1.2.12 hiện có. Workflow Release (Windows) trên runner mới kiểm cả cài/gỡ ở chế độ thông thường trước khi tạo Release.

Lượt phát hành 44252827312 đã được chủ động hủy khi CI main phát hiện lỗi điều hướng ở ca Nhật trình xe. Đợt này đã sửa nguyên nhân, thêm hồi quy và thêm cổng CI trước khi phát hành lại.

## Lưu trữ và nâng cấp

JSON tiếp tục là kho mặc định được hỗ trợ chính thức. SQLite giữ chế độ thí điểm qua Cài đặt → Dữ liệu & sao lưu cho ADMIN, có chạy thử, chuyển kho, xuất JSON và đường lui theo điều kiện hiện có. Đã kiểm dữ liệu mẫu trên Windows; cần đối chiếu kho vận hành của từng nhà máy trước khi đưa SQLite vào sử dụng tại nhà máy.

Sao lưu bằng chức năng Sao lưu ngay, đóng DGVC rồi chạy bộ cài mới. Lần mở lại tiếp tục dùng thư mục dữ liệu đã cấu hình. Nếu app báo E_RECOVERY_REQUIRED sau lỗi ghi, đóng và mở lại để journal phục hồi trước khi tiếp tục. Khi vẫn báo lỗi, giữ thư mục hiện trạng và dùng bản sao lưu đã kiểm chứng.

## Bộ cài

Bộ cài Windows x64 DGVC-Setup-1.3.3.exe chưa ký số. SHA-256 của đúng tệp phát hành nằm trong tệp .exe.sha256 đi kèm trên GitHub Release. Bản dựng của workflow được nghiệm thu ngay trong cùng lượt chạy trước bước tải lên Release.

Phần cứng máy in và trình đọc màn hình NVDA chưa được kiểm chứng trong đợt này.
