-- 003: Danh mục Hợp đồng vận chuyển (như DGVC): mỗi hợp đồng gắn đơn vị vận chuyển + thời gian hiệu lực
CREATE TABLE hop_dong (
  id                     INTEGER PRIMARY KEY,
  ma                     TEXT NOT NULL UNIQUE,
  so_hop_dong            TEXT,
  ngay_ky                TEXT,
  don_vi_van_chuyen_id   INTEGER NOT NULL REFERENCES don_vi_van_chuyen(id),
  tu_ngay                TEXT,
  den_ngay               TEXT,
  noi_ky                 TEXT,
  tieu_de_bao_cao        TEXT,
  dien_giai_cuoc         TEXT,
  trang_thai             TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (trang_thai IN ('ACTIVE','INACTIVE')),
  ghi_chu                TEXT
);
INSERT INTO hop_dong(ma, so_hop_dong, ngay_ky, don_vi_van_chuyen_id, tu_ngay, noi_ky)
  SELECT 'HD-' || ma, so_hop_dong, ngay_hop_dong, id, ngay_hop_dong, noi_ky FROM don_vi_van_chuyen WHERE so_hop_dong IS NOT NULL AND trim(so_hop_dong)<>'';
INSERT INTO schema_version(version, description) VALUES (3, 'Danh mục hợp đồng vận chuyển');
