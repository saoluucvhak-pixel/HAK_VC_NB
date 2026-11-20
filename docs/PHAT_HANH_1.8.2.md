# DGVC 1.8.2

Bản sửa lỗi sau đợt rà soát toàn bộ `main` 1.8.1 bằng agent `dgvc-reviewer` (`.claude/agents/dgvc-reviewer.md`). **Không đổi cách tính giá** (`app/main/engine/*`), các kỳ đã tính giữ nguyên số. Không có cột dữ liệu mới.

## 🔴 Lỗi nghiêm trọng đã sửa
- **Lách mã kích hoạt để chiếm quyền ADMIN.** Trước đây, nếu ADMIN duy nhất có mật khẩu bị đặt lại mật khẩu, ngừng dùng hoặc hạ vai trò, thì mọi tài khoản ADMIN chưa có mật khẩu đặt được mật khẩu mà không cần mã. Nay ngoại lệ "ADMIN đầu tiên" chỉ dùng cho bản cài **mới tinh**, tức là chưa tài khoản nào từng có mật khẩu, từng đăng nhập hay được cấp mã. Tài khoản đã được cấp mã thì luôn phải nhập mã. Ngoài ra không được đặt lại mật khẩu, ngừng dùng hay hạ vai trò **ADMIN cuối cùng còn đăng nhập được** (`E_LAST_ADMIN`).
- **Ctrl+Enter bấm nhầm nút.** Trước đây phím này bấm nút chính đầu tiên trên trang, kể cả nút đang ẩn hoặc nút nằm dưới hộp thoại. Nay:
  - Có hộp thoại đang mở: chỉ bấm nút chính của hộp trên cùng.
  - Không có hộp thoại: chỉ bấm nút đang hiện, cùng thẻ hoặc cùng khung với ô đang gõ.
  - Thẻ "Xe của hợp đồng" có phím tắt riêng là "Lưu phạm vi xe".
- **Màn Hợp đồng: lưu thẻ này làm mất phần chưa lưu ở thẻ kia.** Nay lưu Thông tin vẫn giữ phạm vi xe đang sửa, và ngược lại. Phần đó vẫn tính là chưa lưu, nên rời màn vẫn được hỏi.

## 🟠 Lỗi mức vừa đã sửa
- **Thêm người dùng trùng tên** trước đây ghi đè tài khoản cũ. Nay báo `DUPLICATE`. Sửa tài khoản đã có thì luôn bắt buộc gửi `rowVersion` (`users.save` có thêm cờ `create`).
- **Đặt lại mật khẩu** nay hỏi xác nhận trước, và cảnh báo riêng khi đó là tài khoản đang đăng nhập.
- **Khôi phục sao lưu bị lỗi** không còn để app trỏ vào kho đã đóng. Kho cũ được mở lại cho cả app, phiên đăng nhập giữ nguyên. Với kho SQLite, mọi bước sau khi đóng kho đều trả lại bản cũ nếu lỗi.
- **Đổi thư mục dữ liệu**:
  - Từ chối thư mục mới nằm trong thư mục cũ (hoặc chứa thư mục cũ).
  - Nếu chép lỗi thì dọn phần chép dở, giữ nguyên cấu hình, mở lại kho cũ và ghi nhật ký `CHANGE_FOLDER_FAILED`.
- **Nhận lại gói trao đổi** sau khi đã chọn "Bỏ qua" dòng dầu nghi trùng không còn làm nhân đôi dòng dầu. App nhớ ánh xạ đã chọn và dùng lại cho gói thay kỳ.
- **Hết phiên khi đang mở hộp thoại**: app gỡ hộp thoại, đăng nhập lại được ngay.
- **Nút "Thôi xem"** trên dải báo năm lưu trữ nay hỏi trước nếu màn đang có thay đổi chưa lưu.
- **Nút hiện ra khớp quyền**:
  - Kế toán không còn thấy nút sửa Công ty và đối tác (chỉ ADMIN có quyền).
  - Vai trò Chỉ xem không còn thấy "Sao lưu ngay" và "Chọn gói…".

## 🟡 Lỗi nhỏ đã sửa
- `prices.createVersion` không còn tạo được dòng giá trái hình thức của mã.
- Thư mục sao lưu ngoài (USB/Drive) xoay vòng **theo từng loại**: bản thủ công không tự xóa; bản tháng giữ theo `BACKUP_MONTHLY_KEEP`.
- Gói trao đổi:
  - Chữ ký xem trước gồm cả dòng dầu có sẵn được ghép.
  - Kiểm lại chữ ký sau bước sao lưu an toàn.
  - Bấm "Nhập" hai lần thì dùng chung một kết quả.
  - Đặc tả `exchange.importPackage` nay khớp với code (`previewId`, `decisions`).
- Vai trò Chỉ xem: form Hợp đồng và ô phạm vi xe chỉ đọc.
- Màn Tính giá hỏi trước khi rời màn nếu còn lựa chọn "bỏ dòng dầu / dầu = 0" chưa bấm TÍNH GIÁ.
- Nút có xử lý bất đồng bộ được khóa cho tới khi xong (chống bấm đúp gửi hai lệnh).

## Kiểm thử
- Test mới:
  - `auth.fixes182`
  - `storage.fixes182` (kho JSON và SQLite)
  - `catalog.fixes182`
  - `exchange.fuel-dup` (thêm 2 ca)
  - `ui.fixes182.e2e`
  - `ui.roles182.e2e`
  - `ui.buttons182.e2e` (lần rà thứ hai: lớp chống bấm đúp bản đầu khóa vĩnh viễn nút Lưu của hộp thoại và nút TÍNH GIÁ; đã sửa)
- Mọi test mới đều **trượt trên code 1.8.1** và đạt sau khi sửa.
- Test cũ phải sửa: `backup.fixes161` (xoay vòng thư mục ngoài nay theo loại; ví dụ cũ dùng bản thủ công nên đổi sang bản safety).

## Rà lại lần hai (agent `dgvc-reviewer`)
- 🔴 **Đã sửa:** lớp chống bấm đúp ở bản đầu đọc trạng thái `disabled` SAU khi handler chạy, nên khóa vĩnh viễn những nút tự khóa / mở lại (nút Lưu của hộp thoại, TÍNH GIÁ, Khởi tạo bản cài). Nay trạng thái được đọc TRƯỚC khi handler chạy.
- 🟡 **Đã sửa:**
  - `users.save` không gửi `create` vẫn bắt buộc `rowVersion` khi sửa tài khoản đã có.
  - Đổi thư mục: nếu chép xong mà mở kho ở chỗ mới bị lỗi thì trả cấu hình về thư mục cũ và mở lại kho cũ.
  - Thư mục ngoài giữ bản tháng đúng theo `BACKUP_MONTHLY_KEEP`.
- **Còn lại, rủi ro thấp:** ADMIN cố ý khôi phục một bản sao lưu chụp **trước khi** có ai đặt mật khẩu thì ngoại lệ "ADMIN đầu tiên" mở lại. Chỉ ADMIN làm được, và phiên ADMIN vẫn được giữ. Đề xuất cho bản sau: lưu cờ `FIRST_ADMIN_DONE` ngoài kho dữ liệu (trong tệp cấu hình máy).

## Lưu ý nâng cấp
- Không có cột hay bảng mới. Bản cài cũ chỉ cần cài đè.
- Bản cài đang dùng (đã có người đăng nhập) không còn ngoại lệ "ADMIN đầu tiên". Tài khoản chưa có mật khẩu phải được ADMIN cấp mã kích hoạt.
- Chưa kiểm trên Windows thật: cần chạy workflow **Release (Windows)** và nghiệm thu như ghi chú 1.6.1.
