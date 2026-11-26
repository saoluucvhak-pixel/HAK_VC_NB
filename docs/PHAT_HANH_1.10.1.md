# DGVC 1.10.1

Bản sửa lỗi Windows x64 cho **Cài đặt → Mẫu nhập Excel**.

- Mẫu nhập yêu cầu chọn kiểu số khi khối lượng dạng chữ có thể được hiểu theo hai cách. Ví dụ, với `17.470 t` theo kiểu Anh / Mỹ, khối lượng đúng là 17.470 kg.
- Mẫu nhập báo lỗi khi chữ số được nhóm sai, ví dụ `1,2,3 kg`.
- Bộ kiểm thử tự động đối chiếu nguồn đặc tả API với ba bản JSON và kiểm tra phiên bản ứng dụng, lockfile, README và NSIS trước khi gộp.

Có thể cài đè lên phiên bản cũ. Sao lưu dữ liệu trước khi nâng cấp trong **Cài đặt → Dữ liệu & sao lưu**.

Bộ cài chưa ký số. Đối chiếu SHA-256 với tệp `DGVC-Setup-1.10.1.exe.sha256` đi kèm.
