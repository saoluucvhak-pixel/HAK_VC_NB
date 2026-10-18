# RECONCILIATION SPEC — Đối chiếu chi phí vận chuyển

## 1. Nguồn
- **A — Hệ thống**: phiếu cân đã tính giá (lọc theo đơn vị VC, đợt/tàu, khoảng ngày, nơi xuất).
- **B — Đối tác**: bảng kê / đề nghị thanh toán / bảng chi phí do đơn vị VC gửi (Excel). Import qua cùng engine dò header + mapping (thêm các trường: đơn giá, thành tiền, VAT, tổng tiền, ngày). Có thể là cấp **phiếu** hoặc cấp **xe** (tổng theo biển số).

## 2. Thứ tự khớp
1. **Số phiếu** (+ nơi xuất nếu B có) — khóa mạnh nhất.
2. Nếu B không có số phiếu: **Biển số chuẩn + Ngày + KL** (dung sai KL cấu hình, mặc định 0 kg); nhiều ứng viên → chọn theo giờ gần nhất, nếu vẫn ngang → `CAN_KIEM_TRA`.
3. Đối chiếu cấp xe (B chỉ có tổng theo xe): so số chuyến, tổng KG, đơn giá, thành tiền, VAT, tổng theo biển số (giống 3 sheet tổng hợp của Excel).

## 3. Kết quả (mỗi cặp/dòng lẻ)
| Kết quả | Điều kiện |
|---|---|
| KHOP | mọi cột trong dung sai |
| THIEU_BEN_A | B có, hệ thống không có |
| THIEU_BEN_B | hệ thống có, B không có |
| LECH_KHOI_LUONG | \|KL_A − KL_B\| > dung sai KL |
| LECH_DON_GIA | đơn giá khác |
| LECH_TIEN | thành tiền lệch > dung sai tiền (mặc định 1 đồng) |
| LECH_VAT | VAT lệch > dung sai |
| TRUNG_DU_LIEU | 1 dòng B khớp nhiều phiếu A hoặc ngược lại / B có 2 dòng cùng số phiếu |
| CAN_KIEM_TRA | khớp không chắc chắn |

Một cặp có thể lệch nhiều cột → `ket_qua` = lỗi nghiêm trọng nhất (KL > Đơn giá > Tiền > VAT), **`chenh_lech_json` liệt kê đủ mọi cột lệch**:
```json
[{"cot":"kl_hang_kg","he_thong":20090,"doi_tac":20100,"chenh":-10},
 {"cot":"tien_truoc_vat","he_thong":2344503,"doi_tac":2345670,"chenh":-1167}]
```

## 4. Màn hình
- Import đối chiếu (chọn đơn vị/đợt + file B → mapping → preview → chạy).
- Kết quả: thẻ đếm theo loại; bảng có cột song song **KL hệ thống | KL đối tác | Chênh KL | Đơn giá HT | Đơn giá ĐT | Chênh | Tiền HT | Tiền ĐT | Chênh | VAT…**; ô lệch tô màu; lọc theo loại.
- Sai lệch: chỉ dòng không khớp, kèm xử lý: Chấp nhận A / Chấp nhận B / Điều chỉnh / Bỏ qua + ghi chú (audit).
- Xuất Excel: Bảng đối chiếu, Bảng sai lệch.

## 5. Ràng buộc
- Đối chiếu không sửa phiếu cân; điều chỉnh phải qua sửa phiếu (có log) hoặc mở khóa kỳ.
- Dòng không khớp sinh cảnh báo `UNMATCHED_RECONCILIATION`.
- Kết quả gắn `trang_thai_doi_chieu` cho phiếu A (KHOP / LECH / CHUA_DOI_CHIEU).
