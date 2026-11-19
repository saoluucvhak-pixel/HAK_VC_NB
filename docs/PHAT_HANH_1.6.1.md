# DGVC 1.6.1

Bản sửa lỗi bảo mật và an toàn dữ liệu (P1–P4). Không đổi logic tính giá, làm tròn, số liệu báo cáo.

## Thay đổi cho người dùng
- **Đặt mật khẩu lần đầu cần mã kích hoạt** do ADMIN cấp (8 ký tự, dùng một lần, hạn 24 giờ). Trước đây bất kỳ ai ngồi vào máy cũng đặt được mật khẩu cho tài khoản chưa có mật khẩu. ADMIN đầu tiên của bản cài mới vẫn tự khởi động được không cần mã. Màn đăng nhập không còn in sẵn email ADMIN.
- **Sao lưu**: bản hằng tháng luôn được tạo (không còn phụ thuộc mở app đúng ngày mùng 1); không còn sinh 2 bản hằng ngày cùng lúc; bản chép ra USB/Google Drive được kiểm SHA-256, có cảnh báo khi lỗi và xoay vòng giữ tối đa 60 bản.
- **Khôi phục** (kho JSON): lỗi giữa chừng không còn làm hỏng app — dữ liệu trước khôi phục được trả lại.
- **Nhận gói trao đổi**: dòng giao nhận dầu trùng nội dung với dòng đã nhập ở máy nhận được báo **"nghi trùng"**, mặc định bỏ qua; kỳ trong gói dùng dòng đã có nên số liệu vẫn khớp máy gửi.
- Cài đặt › Người dùng: **Lưu** có khóa lạc quan (hai ADMIN sửa cùng lúc → người sau nhận thông báo xung đột).

## Thay đổi kỹ thuật
- `USERS` thêm `setup_code_hash / setup_code_salt / setup_code_expires_at` (cộng thêm, rỗng); `auth.setFirstPassword` nhận `setupCode`; `users.save` / `users.resetPassword` trả `setupCode`, `setupCodeExpiresAt` đúng một lần (chỉ lưu băm scrypt, không vào audit/log). `setup.status` thêm `firstAdminOpen`, `singleUserName`.
- CONFIG mới (dùng mặc định nếu thiếu, tự thêm vào bản cài cũ khi mở): `SETUP_CODE_HOURS` (24), `SINGLE_USER_MODE` (FALSE), `BACKUP_MIRROR_KEEP` (60).
- `BackupService`: monthly theo tháng, `autoDaily` dùng chung một lượt chạy, khôi phục JSON qua `*.before-restore`, mirror qua `.part` + SHA-256.
- `periods.unlock` / `periods.reopen`: đặc tả API sửa thành ADMIN + KE_TOAN (cần `can_unlock`) cho khớp hành vi thật; thêm test chặn lệch quyền router ↔ đặc tả.
- Gói trao đổi: loại xung đột `POSSIBLE_DUPLICATE` cho dòng dầu; `fuelContentKey` dùng chung với import Excel; audit `FUEL_DUP_REMAP`.

## Hướng dẫn nâng cấp
Chạy bộ cài mới đè lên bản cũ; dữ liệu giữ nguyên, cột/cấu hình mới tự thêm.

### Sau khi nâng cấp (dành cho ADMIN)
- **Tài khoản chưa có mật khẩu** (trừ ADMIN đầu tiên của bản cài mới) **phải được ADMIN bấm "Đặt lại mật khẩu"** (Cài đặt › Người dùng) để nhận **mã kích hoạt**, rồi gửi mã cho người dùng; người dùng nhập mã ở màn "Đặt mật khẩu lần đầu".
- Tài khoản đã có mật khẩu đăng nhập bình thường, không cần làm gì.

## Không thuộc bản này (chuyển sang 1.7.0)
Gán mã đơn giá một nơi duy nhất (P5), menu nhóm và màn Hợp đồng cha–con (P6), toàn bộ "Giá 3 tầng".

## Kiểm thử trước phát hành (tự động, trên nhánh tích hợp)
`npm test` (JSON): 267/267; `DGVC_STORAGE=sqlite npm test`: 266 đạt, 0 lỗi, 1 bỏ qua (có sẵn); `npm run test:electron`: OK.

## Danh sách nghiệm thu thủ công trên Windows (chưa kiểm)
- [ ] Cài mới: đặt mật khẩu ADMIN đầu tiên không cần mã
- [ ] Tạo kế toán → nhận mã → đăng nhập lần đầu bằng mã; sai mã 5 lần → khóa
- [ ] Nâng cấp từ 1.6.0 giữ nguyên dữ liệu, đăng nhập được; tài khoản chưa có mật khẩu → Đặt lại mật khẩu → nhận mã
- [ ] Sao lưu ngày + tháng tự tạo; chép USB thành công / rút USB báo lỗi rõ (cảnh báo vàng)
- [ ] Khôi phục từ file .zip và từ manifest.json
- [ ] Nhập gói trao đổi có dòng dầu trùng → báo nghi trùng, mặc định bỏ qua
