-- 002: thông tin phục vụ in Bảng kê / biên bản đối chiếu của đơn vị vận chuyển (Bên B)
ALTER TABLE don_vi_van_chuyen ADD COLUMN ten_in_bao_cao   TEXT;   -- tên in trên chứng từ (nếu khác tên danh mục)
ALTER TABLE don_vi_van_chuyen ADD COLUMN dai_dien         TEXT;   -- người đại diện ký
ALTER TABLE don_vi_van_chuyen ADD COLUMN xung_ho          TEXT;   -- Ông / Bà
ALTER TABLE don_vi_van_chuyen ADD COLUMN chuc_vu          TEXT;   -- Giám đốc...
ALTER TABLE don_vi_van_chuyen ADD COLUMN ke_toan          TEXT;   -- kế toán ký xác nhận
ALTER TABLE don_vi_van_chuyen ADD COLUMN email            TEXT;
ALTER TABLE don_vi_van_chuyen ADD COLUMN ngan_hang        TEXT;
ALTER TABLE don_vi_van_chuyen ADD COLUMN so_tai_khoan     TEXT;
ALTER TABLE don_vi_van_chuyen ADD COLUMN so_hop_dong      TEXT;
ALTER TABLE don_vi_van_chuyen ADD COLUMN ngay_hop_dong    TEXT;
ALTER TABLE don_vi_van_chuyen ADD COLUMN noi_ky           TEXT;   -- địa danh ghi trên chứng từ
INSERT INTO schema_version(version, description) VALUES (2, 'Thông tin báo cáo đơn vị vận chuyển');
