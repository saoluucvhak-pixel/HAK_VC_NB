# DGVC 1.6.1

> Bản nháp theo bộ prompt sửa lỗi 1.6.1 — sẽ bổ sung đầy đủ ở P7. Hiện có phần của P1 (mã kích hoạt) và khóa lạc quan khi sửa người dùng.

## Thay đổi (P1)
- **Đặt mật khẩu lần đầu cần mã kích hoạt dùng một lần** (8 ký tự, hạn mặc định 24 giờ — `SETUP_CODE_HOURS`) do ADMIN cấp khi tạo người dùng hoặc "Đặt lại mật khẩu". Mã chỉ hiện một lần; hệ thống chỉ lưu bản băm.
- Sai mã quá `LOGIN_MAX_FAILED` lần → khóa tài khoản `LOGIN_LOCK_MINUTES` phút.
- Ngoại lệ bản cài mới: ADMIN đầu tiên đặt mật khẩu không cần mã.
- Màn đăng nhập không còn in sẵn email ADMIN. Tùy chọn `SINGLE_USER_MODE` điền sẵn tên đăng nhập khi chỉ có 1 tài khoản.
- Cài đặt › Người dùng: nút **Lưu** có khóa lạc quan — nếu người khác vừa sửa cùng tài khoản, người lưu sau nhận thông báo xung đột và phải mở lại để lấy bản mới.
- Cột mới `USERS.setup_code_hash / setup_code_salt / setup_code_expires_at` (cộng thêm, bản cũ tự nâng cấp).

## Sau khi nâng cấp
- **Tài khoản chưa có mật khẩu** (trừ ADMIN đầu tiên của bản cài mới) **phải được ADMIN bấm "Đặt lại mật khẩu"** (Cài đặt › Người dùng) để nhận **mã kích hoạt**, rồi gửi mã cho người dùng; người dùng nhập mã ở màn "Đặt mật khẩu lần đầu".
- Bản cài cũ chưa có hai dòng cấu hình mới `SETUP_CODE_HOURS`, `SINGLE_USER_MODE` thì dùng mặc định (24 giờ; chế độ 1 người dùng tắt).
