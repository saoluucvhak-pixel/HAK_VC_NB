# BÁO CÁO KIỂM THỬ VÀ ĐỀ XUẤT NÂNG CẤP HỆ THỐNG DGVC (v1.8.2)

> **Dự án:** DGVC — Phần mềm Đơn giá vận chuyển dăm gỗ (HAK Group)  
> **Kho nguồn:** [https://github.com/saoluucvhak-pixel/HAK_VC_NB](https://github.com/saoluucvhak-pixel/HAK_VC_NB)  
> **Thư mục lưu trữ:** `D:\PROJECT_IT\VCNB_OFFLINE`  
> **Thời điểm thực hiện:** 20/11/2026  
> **Môi trường chạy:** Node.js v24.21.0, npm 11.19.0, Windows x64, Google Chrome 142.x  
> **Tài liệu chuyên sâu về lỗi & Prompt xử lý:** Xem tại [PROMPT_LOI_VA_HUONG_XU_LY.md](file:///d:/PROJECT_IT/VCNB_OFFLINE/PROMPT_LOI_VA_HUONG_XU_LY.md)  

---

## 1. TỔNG QUAN TẢI VÀ THIẾT LẬP MÃ NGUỒN

- **Mã nguồn:** Đã tải toàn bộ mã nguồn từ nhánh `main` (commit `f06a755`) về thư mục dự án `D:\PROJECT_IT\VCNB_OFFLINE`.
- **Cấu trúc thư mục:**
  - `app/`: Mã nguồn ứng dụng (Electron main, renderer thuần HTML/CSS/JS, engine tính toán, storage repo, router/service, bộ test).
  - `desk/`: Đặc tả API và schema (`api_spec.py`, `schema.py`).
  - `docs/`: Toàn bộ tài liệu nghiệp vụ, quy tắc tính toán, hướng dẫn cài đặt và thiết kế kỹ thuật.
- **Cài đặt thư viện:** Chạy `npm ci` trong thư mục `app/` thành công (348 packages).
- **Kiểm tra an ninh thư viện:** `npm audit --omit=dev` đạt **0 lỗ hổng (0 vulnerabilities)** trong các gói production (`adm-zip`, `exceljs`).

---

## 2. KẾT QUẢ KIỂM THỬ TOÀN DIỆN (TEST CODE)

### 2.1. Đối chiếu số liệu gốc (Verify Seed vs Excel)
Lệnh chạy: `node tools/verify-seed.js`
- **HAKQN** (HĐ `HD-HAKQN-QS`, kỳ 18–23/09/2026, VC.007): **100% KHỚP**
  - Số chuyến: 326 (APP: 326 | Excel: 326)
  - Tổng KL: 6.143,68 tấn (APP: 6143.68 | Excel: 6143.68)
  - Đơn giá vận chuyển: 178.000 đ (APP: 178000 | Excel: 178000)
  - Tổng thành tiền BKVC: 1.181.061.043 đ (khớp từng đồng)
- **ĐH** (HĐ `HD-DH-HAKQN`, kỳ 18–23/09/2026, VC.007): **100% KHỚP**
  - Số chuyến: 77 (APP: 77 | Excel: 77)
  - Đơn giá vận chuyển: 88.900 đ (APP: 88900 | Excel: 88900)
  - Tổng thành tiền BKVC: 139.421.905 đ (khớp từng đồng)
- **HAK** (HĐ `HD-HAK-HAKQN`, kỳ 18–23/09/2026, VC.007): **100% KHỚP**
  - Số chuyến: 100 (APP: 100 | Excel: 100)
  - Đơn giá vận chuyển: 125.600 đ (APP: 125600 | Excel: 125600)
  - Tổng thành tiền BKVC: 253.713.305 đ (khớp từng đồng)
- **Kết luận:** **TẤT CẢ KHỚP EXCEL 100%**, logic tính toán của Engine (`app/main/engine/`) bảo toàn chính xác logic Power Query và Excel của tập đoàn HAK.

---

### 2.2. Kiểm thử tự động (Unit & Integration Tests)
Lệnh chạy: `node --test tests/*.test.js`
- **Tổng số test:** 317 tests
- **Đạt (Pass):** 286 tests
- **Thất bại (Fail):** 0 tests
- **Bỏ qua (Skipped):** 31 tests (các bài test E2E giao diện Playwright do máy chủ hiện hành chạy terminal không có sẵn môi trường Chromium độc lập).
- **Thời gian chạy:** 62.9 giây.

Các luồng kiểm thử quan trọng đã vượt qua:
1. **Engine công thức nghiệp vụ:** Làm tròn PQ, ép Int64, 3 tầng tính giá (A/B/C), đơn giá dầu bình quân, đọc tiền thành chữ tiếng Việt.
2. **Kho lưu trữ kép (Storage Parity & Durability):**
   - Đạt trọn vẹn cả trên **JsonStore** và **SqliteStore**.
   - Kiểm tra chịu lỗi tắt đột ngột (SIGKILL / mất điện) trong lúc đang ghi giao dịch: dữ liệu phục hồi nguyên vẹn, không dở dang.
   - Khóa lạc quan `rowVersion`, chống xung đột cập nhật đồng thời (`CONFLICT_VERSION`).
3. **Phân quyền và bảo mật tài khoản (Auth & Setup Code):**
   - Khóa 15 phút sau 5 lần sai pass.
   - ADMIN đầu tiên và mã kích hoạt cho tài khoản mới.
   - Chặn tuyệt đối xóa hoặc hạ vai trò của `ADMIN cuối cùng` (`E_LAST_ADMIN`).
4. **Quy trình kỳ tính & Quản lý phiếu cân:**
   - Tính kỳ, khóa kỳ, hủy kỳ, phân trang >5.000 phiếu.
   - Sửa phiếu cân, cập nhật lô import, chống trùng lặp dữ liệu phiếu và dầu.
5. **Sao lưu & Khôi phục (Backup & Restore):**
   - Sao lưu định kỳ hằng ngày, sao lưu tháng, sao lưu ra USB/ổ ngoài.
   - Kiểm tra hash SHA-256 chống file hỏng. Khôi phục an toàn có backup dự phòng trước khi khôi phục.

---

### 2.3. Kiểm thử trên chế độ SQLite (`DGVC_STORAGE=sqlite`)
Lệnh chạy: `$env:DGVC_STORAGE="sqlite"; node --test tests/storage.*.test.js tests/formulas.test.js`
- **Tổng số test:** 48 tests
- **Đạt:** 48 tests
- **Thất bại:** 0 tests
- **Kết quả:** Quá trình chuyển đổi (migration), đối chiếu dữ liệu (parity) và xuất ngược (export JSON) từ SQLite hoạt động hoàn hảo.

---

## 3. ĐÁNH GIÁ CHẤT LƯỢNG MÃ NGUỒN

### Điểm mạnh:
1. **Kiến trúc rõ ràng, chuẩn mực:**
   - Tách biệt rõ giữa Engine nghiệp vụ thuần túy (`app/main/engine/`) và tầng IO/Database (`app/main/repo/`).
   - Router thống nhất một cửa (`app/main/api/router.js`) với cơ chế phân quyền RBAC và kiểm tra phiên chặt chẽ.
2. **Tính toán chính xác tuyệt đối:**
   - Xử lý được các sai số dấu phẩy động của JavaScript bằng cách mô phỏng chính xác hành vi của Power Query.
3. **Hệ thống Test Coverage cực kỳ dày dặn:**
   - Hơn 300 test case bao phủ từ unit test, integration test, stress test cho đến test khôi phục lỗi thảm họa (crash recovery).
4. **Khả năng hoạt động Offline độc lập:**
   - Phù hợp với đặc thù các trạm cân dăm gỗ, vùng sâu vùng xa mạng yếu hoặc không có internet.

### Các điểm cần lưu ý / Rủi ro tiềm ẩn:
1. **Rủi ro khôi phục backup cũ mở lại "ADMIN đầu tiên":**
   - Theo ghi chú phát hành 1.8.2: Nếu ADMIN khôi phục bản sao lưu từ trước thời điểm đặt mật khẩu, cờ ngoại lệ có thể mở lại.
2. **Khả năng hiển thị UI trên các kích thước màn hình đặc thù tại trạm cân:**
   - Màn hình trạm cân thường có độ phân giải thấp (1366x768 hoặc 1024x768). Cần đảm bảo giao diện luôn co giãn mượt mà.
3. **Quản lý danh mục giữa nhiều nhà máy:**
   - Hiện cơ chế đồng bộ danh mục giữa các nhà máy dựa trên việc xuất/nhập gói trao đổi `.dgvc`. Việc này phụ thuộc thao tác người dùng (USB/Zalo/Email).

---

## 4. ĐỀ XUẤT HƯỚNG SỬA VÀ NÂNG CẤP CODE (LỘ TRÌNH 1.9.0 - 2.0.0)

Dưới đây là các đề xuất cụ thể để hoàn thiện và nâng cấp phần mềm:

### Hướng 1: Tối ưu bảo mật và Thiết lập hệ thống (Ưu tiên Cao)
- [ ] **Lưu cờ `FIRST_ADMIN_DONE` ngoài DB:**
  - Lưu cờ `firstAdminDone: true` trong tệp cấu hình máy cục bộ (`config.json` của ứng dụng ngoài thư mục DB). Khi khôi phục bất kỳ bản backup cũ nào, app vẫn nhận diện máy đã từng có quản trị viên, không cho phép kích hoạt lại ngoại lệ "ADMIN đầu tiên".
- [ ] **Khóa ứng dụng tự động khi không sử dụng (Auto-lock Screen):**
  - Bổ sung cấu hình tự động khóa màn hình làm việc sau 15–30 phút không có thao tác chuột/bàn phím để bảo vệ dữ liệu trạm cân khi nhân viên rời vị trí.

### Hướng 2: Tối ưu hiệu năng và CSDL SQLite (Ưu tiên Cao)
- [ ] **Chính thức bật chế độ WAL (Write-Ahead Logging) cho SQLite:**
  - Tối ưu truy vấn đọc/ghi đồng thời trên SQLite bằng PRAGMA `journal_mode = WAL`, tăng tốc độ nạp dữ liệu kỳ tính lên 3x–5x khi số lượng phiếu cân lên đến hàng chục nghìn dòng.
- [ ] **Phân trang ảo hóa (Virtual Scrolling) cho danh sách phiếu cân:**
  - Bổ sung virtual scroll ở renderer để cuộn mượt mà hàng nghìn phiếu cân mà không tốn nhiều RAM/DOM.

### Hướng 3: Nâng cấp trải nghiệm người dùng & Trạm cân (Ưu tiên Vừa)
- [ ] **Tự động nhận diện cấu trúc file trạm cân thông minh:**
  - Mở rộng bộ phân tích Excel/CSV để tự nhận diện thêm các định dạng phiếu cân từ các phần mềm cân điện tử phổ biến khác (AutoScale, Mettler Toledo, Keli...).
- [ ] **Nhật ký thao tác trực quan (Visual Audit Log):**
  - Mở rộng màn hình Lịch sử để người dùng có thể xem so sánh "Trước" và "Sau" khi sửa phiếu cân trực quan trên bảng màu (diff viewer).

### Hướng 4: Cơ chế chia sẻ & Đồng bộ hóa nội bộ (Ưu tiên Lâu dài)
- [ ] **Tích hợp kênh đồng bộ mạng LAN / Folder Sync:**
  - Thêm tính năng tự động phát hiện gói `.dgvc` mới trong thư mục mạng LAN dùng chung của nhà máy (Shared Folder) và thông báo cho người dùng một click để "Nhận dữ liệu mới" thay vì phải chọn file thủ công.
- [ ] **Đóng gói bộ cài tự động trên Windows (CI/CD Windows Release):**
  - Thiết lập GitHub Actions runner Windows để tự động build file setup `DGVC-Setup-x.x.x.exe` có chữ ký và kiểm tra asar tự động mỗi khi tạo Release tag.

---

## 5. HƯỚNG DẪN BẮT ĐẦU SỬ DỤNG VÀ PHÁT TRIỂN TIẾP

Để mở ứng dụng kiểm tra trực quan trên máy:
```powershell
# Chạy ứng dụng Desktop (Electron)
cd app
npm start

# Hoặc chạy thử nghiệm trên trình duyệt
npm run dev
# Mở trình duyệt tại: http://127.0.0.1:5178
```

Để đóng gói bộ cài Windows:
```powershell
cd app
npm run dist:win
```
File cài đặt sẽ được tạo tại `app/dist/DGVC-Setup-1.8.2.exe`.
