# CẬP NHẬT 25/09/2026 — XUẤT FILE HÓA ĐƠN LÊN MISA meInvoice (bản 1.0.1)

Căn cứ: mẫu Excel *Hóa đơn GTGT 1 thuế suất (mẫu ngoại tệ)* của MISA và hóa đơn thật **1C26TYY** (ĐH → HAKQN, 25/09/2026, chưa cấp số).

## 1. Phần mềm đã làm được
- **Nút "Xuất file hóa đơn MISA"** ở màn hình *Bảng xác nhận KL*, kèm ô chọn *Ngày hóa đơn*. Ở màn hình *Báo cáo* có thêm nút nhanh **HĐ MISA** cho từng kỳ. Chỉ hiện ở máy của **bên vận chuyển** (bên bán); kỳ nhận từ gói thì không có nút này.
- **File xuất ghi thẳng vào mẫu MISA của anh/chị:**
  - giữ nguyên dòng hướng dẫn 1–7 và dòng tiêu đề 9, dữ liệu bắt đầu từ dòng 10, xóa các dòng ví dụ;
  - 1 kỳ = 1 hóa đơn, mỗi xe 1 dòng hàng;
  - dòng đầu hóa đơn ghi đủ: ngày, tên người mua viết hoa, địa chỉ, MST, "Chuyển khoản", VND, tỷ giá 1, thuế suất 8, tiền thuế;
  - các dòng sau chỉ ghi số thứ tự hóa đơn và phần hàng hóa.
- **Diễn giải đúng câu trên hóa đơn thật:** *"Vận chuyển dăm gỗ từ nhà máy DG CCN Đông Phú, Xã Quế Sơn , TP Đà Nẵng đến Cảng Tiên Sa Đà Nẵng bằng xe thùng biển kiểm soát: 92H00057"*.
  - Biển số viết liền, không gạch, bằng chỗ trống mới `{BKS_LIEN}`.
  - Mẫu câu vẫn sửa được theo từng hợp đồng.
- **Tiền thuế tính như MISA:** làm tròn(tổng tiền hàng × 8%).
- **Kiểm chứng:** tính lại kỳ ĐH 18–23/09 cho ra đúng từng dòng và đúng tổng của hóa đơn thật:

| | Hóa đơn thật | APP |
|---|---:|---:|
| Đơn giá | 96.900 | 96.900 |
| Tiền hàng | 140.711.397 | 140.711.397 |
| Thuế GTGT 8% | 11.256.912 | 11.256.912 |
| Tổng thanh toán | 151.968.309 | 151.968.309 |

  Kết quả này có được với điều kiện bỏ 1 dòng dầu trùng, xem câu 1 ở mục 2.

## 2. Hai điểm CẦN ANH/CHỊ XÁC NHẬN
1. **Dòng dầu 400 lít ngày 18/09, xe 92H-00192, có 2 dòng giống hệt nhau** (GD-DH-00006 và GD-DH-00007).
   - Bỏ 1 dòng → **96.900**, khớp hóa đơn đã lập.
   - Giữ cả 2 dòng như file Excel → **88.900**.
   - Nay khi tính giá, phần mềm cảnh báo **"dòng dầu nghi nhập trùng"**. Nếu trùng thật, bỏ dòng đó khỏi kỳ; nếu không trùng, bấm *xác nhận cảnh báo* ở màn hình Giao nhận dầu.
2. **VAT lệch 1 đồng giữa bảng xác nhận và hóa đơn.**
   - Bảng xác nhận (như Excel) làm tròn VAT từng xe rồi cộng lại; MISA tính trên tổng. Ví dụ kỳ ĐH: 11.256.911 so với 11.256.912.
   - Phần mềm đang báo cảnh báo *"VAT lệch"* khi xuất file MISA.
   - **Đề nghị** đặt `VAT_ROUND_BASIS = TOTAL` (Cài đặt → Tham số tính). Khi đó bảng xác nhận tính VAT trên tổng, dồn phần lệch vào xe cuối, và khớp đúng hóa đơn.
   - Hiện phần mềm vẫn để `LINE`, tức cách của Excel.

## 3. File giao
- `bo_cai_chia_nho/`: bộ cài **DGVC-Setup-1.0.1.exe** chia 4 phần, kèm `GHEP_BO_CAI.bat` để ghép lại. SHA-256: `f12687c8…d7d934c`. Cài đè lên bản 1.0.0, dữ liệu giữ nguyên.
- `mau_hoa_don_misa/`: 2 file mẫu cho kỳ ĐH 18–23/09.
  - (A) bỏ dòng dầu trùng: khớp hóa đơn thật.
  - (B) giữ cả 2 dòng: 88.900.
- `HUONG_DAN_CAI_DAT_VA_SU_DUNG.md`: thêm bước 5b về cách nhập file vào MISA, cách làm tròn VAT và dòng dầu nghi trùng.
- Kiểm thử: 108/108 test đạt, chạy thử bản Electron đạt. File mẫu MISA đã được đóng gói vào bộ cài.
