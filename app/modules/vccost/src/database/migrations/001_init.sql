-- =====================================================================
-- Migration v1 — Khởi tạo CSDL Quản lý chi phí vận chuyển (offline, SQLite)
-- Quy ước:
--   * Ngày: TEXT 'YYYY-MM-DD'; Ngày giờ: TEXT 'YYYY-MM-DDTHH:MM:SS' (giờ địa phương)
--   * TIỀN & ĐƠN GIÁ: INTEGER theo đơn vị 1/1000 đồng (MONEY_SCALE = 1000) để SUM trong SQL
--     luôn chính xác (không dùng REAL cho tiền). Hiển thị = giá trị / 1000.
--   * Khối lượng: kl_hang_kg NUMERIC (kg từ phiếu cân); tấn = kg / 1000 (cột sinh tự động).
--   * Không xóa cứng dữ liệu nghiệp vụ: dùng trang_thai / deleted_at + audit_log.
-- =====================================================================
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
  version      INTEGER PRIMARY KEY,
  description  TEXT NOT NULL,
  applied_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now','localtime'))
);

CREATE TABLE settings (
  key          TEXT PRIMARY KEY,
  value_json   TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now','localtime'))
);

-- ---------------------------------------------------------------- DANH MỤC
CREATE TABLE don_vi_van_chuyen (
  id             INTEGER PRIMARY KEY,
  ma             TEXT NOT NULL UNIQUE,
  ten            TEXT NOT NULL,
  ma_so_thue     TEXT,
  dia_chi        TEXT,
  nguoi_lien_he  TEXT,
  dien_thoai     TEXT,
  nhom_bao_cao   TEXT,               -- gom nhóm báo cáo/thanh toán (VD: HAK_GROUP gồm HAK, QC, ĐH)
  trang_thai     TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (trang_thai IN ('ACTIVE','INACTIVE')),
  ghi_chu        TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now','localtime')),
  updated_at     TEXT
);

CREATE TABLE xe (
  id                INTEGER PRIMARY KEY,
  bien_so_chuan     TEXT NOT NULL UNIQUE,      -- '43H01021'
  bien_so_hien_thi  TEXT NOT NULL,             -- '43H-01021'
  loai_xe           TEXT,
  tai_trong         NUMERIC,
  trang_thai        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (trang_thai IN ('ACTIVE','INACTIVE')),
  ghi_chu           TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now','localtime')),
  updated_at        TEXT
);

-- Lịch sử xe thuộc đơn vị nào (xe có thể đổi đơn vị theo thời gian)
CREATE TABLE xe_don_vi_lich_su (
  id                    INTEGER PRIMARY KEY,
  xe_id                 INTEGER NOT NULL REFERENCES xe(id),
  don_vi_van_chuyen_id  INTEGER NOT NULL REFERENCES don_vi_van_chuyen(id),
  tu_ngay               TEXT,                  -- NULL = từ trước tới nay
  den_ngay              TEXT,                  -- NULL = còn hiệu lực
  ghi_chu               TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now','localtime')),
  CHECK (den_ngay IS NULL OR tu_ngay IS NULL OR tu_ngay <= den_ngay)
);
CREATE INDEX ix_xedv_xe ON xe_don_vi_lich_su(xe_id, tu_ngay);

CREATE VIEW v_xe_hien_tai AS
SELECT x.*, h.don_vi_van_chuyen_id, h.tu_ngay, h.den_ngay
FROM xe x
LEFT JOIN xe_don_vi_lich_su h ON h.xe_id = x.id
 AND (h.tu_ngay IS NULL OR h.tu_ngay <= date('now','localtime'))
 AND (h.den_ngay IS NULL OR h.den_ngay >= date('now','localtime'));

CREATE TABLE dia_diem (
  id          INTEGER PRIMARY KEY,
  ma          TEXT NOT NULL UNIQUE,
  ten         TEXT NOT NULL,
  loai        TEXT NOT NULL DEFAULT 'KHAC' CHECK (loai IN ('NHA_MAY','CANG','KHO','KHAC')),
  dia_chi     TEXT,
  trang_thai  TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (trang_thai IN ('ACTIVE','INACTIVE')),
  ghi_chu     TEXT
);

-- Tên gọi khác của địa điểm trong file nguồn ("Đại Hiệp", "NM Đại Hiệp"...) — đã bỏ dấu, chữ thường
CREATE TABLE dia_diem_alias (
  id            INTEGER PRIMARY KEY,
  dia_diem_id   INTEGER NOT NULL REFERENCES dia_diem(id),
  alias         TEXT NOT NULL,
  alias_folded  TEXT NOT NULL UNIQUE
);

CREATE TABLE tuyen_van_chuyen (
  id              INTEGER PRIMARY KEY,
  ma_tuyen        TEXT NOT NULL UNIQUE,
  noi_xuat_id     INTEGER NOT NULL REFERENCES dia_diem(id),
  noi_den_id      INTEGER NOT NULL REFERENCES dia_diem(id),
  khoang_cach_km  NUMERIC,
  mo_ta           TEXT,
  trang_thai      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (trang_thai IN ('ACTIVE','INACTIVE'))
);
CREATE UNIQUE INDEX ux_tuyen_active ON tuyen_van_chuyen(noi_xuat_id, noi_den_id) WHERE trang_thai = 'ACTIVE';

-- ---------------------------------------------------------------- GIÁ DẦU & BẢNG GIÁ
CREATE TABLE gia_dau (
  id          INTEGER PRIMARY KEY,
  ngay        TEXT NOT NULL,
  loai_dau    TEXT NOT NULL,             -- 'DO 0,05S-II'
  gia         INTEGER NOT NULL,          -- x1000 đồng/lít
  nguon       TEXT,                      -- Petrolimex, công văn...
  ghi_chu     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now','localtime')),
  UNIQUE (ngay, loai_dau)
);

-- Kỳ điều chỉnh: lấy giá dầu bình quân [tu_ngay_tham_chieu, den_ngay_tham_chieu] → áp dụng từ ngay_ap_dung
CREATE TABLE ky_dieu_chinh_gia_dau (
  id                    INTEGER PRIMARY KEY,
  ma_ky                 TEXT NOT NULL UNIQUE,
  loai_dau              TEXT NOT NULL,
  tu_ngay_tham_chieu    TEXT NOT NULL,
  den_ngay_tham_chieu   TEXT NOT NULL,
  gia_dau_binh_quan     INTEGER,         -- x1000
  ngay_ap_dung          TEXT NOT NULL,
  so_cong_van           TEXT,
  trang_thai            TEXT NOT NULL DEFAULT 'NHAP' CHECK (trang_thai IN ('NHAP','DA_DUYET','HUY')),
  ghi_chu               TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now','localtime'))
);

CREATE TABLE bang_gia_van_chuyen (
  id                    INTEGER PRIMARY KEY,
  ma_bang_gia           TEXT NOT NULL UNIQUE,
  tuyen_id              INTEGER NOT NULL REFERENCES tuyen_van_chuyen(id),
  don_vi_van_chuyen_id  INTEGER REFERENCES don_vi_van_chuyen(id),   -- NULL = áp dụng mọi đơn vị
  loai_hang             TEXT,                                       -- NULL = mọi loại hàng
  tu_ngay               TEXT NOT NULL,
  den_ngay              TEXT,
  phuong_thuc           TEXT NOT NULL DEFAULT 'CO_DINH' CHECK (phuong_thuc IN ('CO_DINH','DIEU_CHINH_DAU')),
  don_gia_goc           INTEGER NOT NULL,       -- x1000
  don_gia_dieu_chinh    INTEGER NOT NULL DEFAULT 0,
  don_gia_ap_dung       INTEGER NOT NULL,
  don_vi_tinh           TEXT NOT NULL CHECK (don_vi_tinh IN ('DONG_TAN','DONG_CHUYEN')),
  vat_percent           NUMERIC NOT NULL,
  gia_dau_co_so         INTEGER,
  gia_dau_ap_dung       INTEGER,
  dinh_muc_dau          NUMERIC,                -- lít/100km
  khoi_luong_binh_quan  NUMERIC,                -- tấn/chuyến
  khoang_cach_km        NUMERIC,                -- km tính dầu (snapshot tại thời điểm lập giá)
  quy_tac_lam_tron_json TEXT,
  cong_thuc             TEXT,                   -- JSON breakdown từng bước (truy vết "tại sao giá này")
  ky_dieu_chinh_id      INTEGER REFERENCES ky_dieu_chinh_gia_dau(id),
  bang_gia_goc_id       INTEGER REFERENCES bang_gia_van_chuyen(id),
  trang_thai            TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (trang_thai IN ('NHAP','ACTIVE','INACTIVE')),
  ghi_chu               TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now','localtime')),
  CHECK (den_ngay IS NULL OR tu_ngay <= den_ngay)
);
CREATE INDEX ix_bg_lookup ON bang_gia_van_chuyen(tuyen_id, tu_ngay, den_ngay);

-- ---------------------------------------------------------------- ĐỢT / TÀU
CREATE TABLE dot_van_chuyen (
  id                    INTEGER PRIMARY KEY,
  ma_dot                TEXT NOT NULL UNIQUE,
  ten_tau               TEXT,
  voyage                TEXT,
  tu_ngay               TEXT,
  den_ngay              TEXT,
  khach_hang            TEXT,
  noi_giao_id           INTEGER REFERENCES dia_diem(id),
  khoi_luong_giam_dinh  NUMERIC,     -- KL giám định (tấn) — Excel: "KL GĐ"
  trang_thai            TEXT NOT NULL DEFAULT 'MO' CHECK (trang_thai IN ('MO','KHOA')),
  ghi_chu               TEXT
);

-- ---------------------------------------------------------------- IMPORT
CREATE TABLE import_batch (
  id              INTEGER PRIMARY KEY,
  loai            TEXT NOT NULL DEFAULT 'PHIEU_CAN' CHECK (loai IN ('PHIEU_CAN','DANH_MUC_XE','DOI_CHIEU')),
  file_name       TEXT NOT NULL,
  file_hash       TEXT NOT NULL,
  sheet_name      TEXT,
  header_row      INTEGER,
  mapping_json    TEXT,
  import_time     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now','localtime')),
  total_rows      INTEGER NOT NULL DEFAULT 0,
  inserted_rows   INTEGER NOT NULL DEFAULT 0,
  duplicate_rows  INTEGER NOT NULL DEFAULT 0,
  conflict_rows   INTEGER NOT NULL DEFAULT 0,
  error_rows      INTEGER NOT NULL DEFAULT 0,
  updated_rows    INTEGER NOT NULL DEFAULT 0,
  dot_van_chuyen_id INTEGER REFERENCES dot_van_chuyen(id),
  trang_thai      TEXT NOT NULL DEFAULT 'COMMITTED' CHECK (trang_thai IN ('COMMITTED','UNDONE')),
  user_note       TEXT
);
CREATE INDEX ix_batch_hash ON import_batch(file_hash);

-- ---------------------------------------------------------------- PHIẾU CÂN
CREATE TABLE phieu_can (
  id                    INTEGER PRIMARY KEY,
  so_phieu              TEXT NOT NULL,              -- TEXT để không mất số 0 đầu
  ngay_gio_can_1        TEXT,
  ngay_gio_can_2        TEXT,
  ngay_can              TEXT GENERATED ALWAYS AS (substr(ngay_gio_can_1,1,10)) STORED,
  bien_so_goc           TEXT,                       -- y nguyên nguồn
  bien_so               TEXT,                       -- hiển thị chuẩn
  bien_so_chuan         TEXT,                       -- khóa so khớp
  xe_id                 INTEGER REFERENCES xe(id),
  can_lan_1             NUMERIC,
  can_lan_2             NUMERIC,
  kl_hang_kg            NUMERIC,
  kl_hang_tan           NUMERIC GENERATED ALWAYS AS (kl_hang_kg / 1000.0) STORED,
  noi_xuat_goc          TEXT,
  noi_xuat_id           INTEGER REFERENCES dia_diem(id),
  noi_den_id            INTEGER REFERENCES dia_diem(id),
  noi_xuat              TEXT,                       -- tên địa điểm chuẩn (denormalize để lọc nhanh)
  noi_den               TEXT,
  loai_hang             TEXT,
  cong_ty_vc_nguon      TEXT,                       -- cột công ty trong file nguồn (chỉ đối chiếu)
  tuyen_id              INTEGER REFERENCES tuyen_van_chuyen(id),
  don_vi_van_chuyen_id  INTEGER REFERENCES don_vi_van_chuyen(id),
  dot_van_chuyen_id     INTEGER REFERENCES dot_van_chuyen(id),
  bang_gia_id           INTEGER REFERENCES bang_gia_van_chuyen(id),   -- = price_rule_id
  don_vi_tinh           TEXT,
  don_gia               INTEGER,                    -- x1000
  tien_truoc_vat        INTEGER,                    -- x1000
  ty_le_vat             NUMERIC,
  tien_vat              INTEGER,                    -- x1000
  tong_tien             INTEGER,                    -- x1000
  trang_thai_tinh_gia   TEXT NOT NULL DEFAULT 'CHUA_TINH',  -- OK/NO_PRICE/MULTIPLE_PRICE/UNKNOWN_VEHICLE/...
  trang_thai_doi_chieu  TEXT NOT NULL DEFAULT 'CHUA_DOI_CHIEU',
  xe_tra_ve             INTEGER NOT NULL DEFAULT 0 CHECK (xe_tra_ve IN (0,1)),  -- xe xuống cảng nhưng trả về (BR-DOT-05)
  business_key          TEXT NOT NULL,              -- so_phieu|noi_xuat
  strong_key            TEXT NOT NULL,
  fingerprint           TEXT NOT NULL,
  import_batch_id       INTEGER REFERENCES import_batch(id),
  source_row            INTEGER,
  chot_ky_id            INTEGER,                    -- != NULL → đã chốt, không tính lại
  trang_thai            TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (trang_thai IN ('ACTIVE','VOID')),
  ghi_chu               TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now','localtime')),
  updated_at            TEXT
);
CREATE UNIQUE INDEX ux_phieu_business_key ON phieu_can(business_key) WHERE trang_thai = 'ACTIVE';
CREATE INDEX ix_phieu_so_phieu   ON phieu_can(so_phieu);
CREATE INDEX ix_phieu_bien_so    ON phieu_can(bien_so_chuan, ngay_gio_can_1);
CREATE INDEX ix_phieu_ngay       ON phieu_can(ngay_gio_can_1);
CREATE INDEX ix_phieu_ngay_can   ON phieu_can(ngay_can);
CREATE INDEX ix_phieu_dvvc       ON phieu_can(don_vi_van_chuyen_id, ngay_can);
CREATE INDEX ix_phieu_tuyen      ON phieu_can(tuyen_id);
CREATE INDEX ix_phieu_noi_xuat   ON phieu_can(noi_xuat_id, ngay_can);
CREATE INDEX ix_phieu_dot        ON phieu_can(dot_van_chuyen_id);
CREATE INDEX ix_phieu_batch      ON phieu_can(import_batch_id);
CREATE INDEX ix_phieu_tt_gia     ON phieu_can(trang_thai_tinh_gia);

-- Dòng chi tiết của mỗi lần import: biết chính xác batch đã thêm/bỏ qua/cập nhật phiếu nào
CREATE TABLE import_batch_row (
  id            INTEGER PRIMARY KEY,
  batch_id      INTEGER NOT NULL REFERENCES import_batch(id),
  source_row    INTEGER,
  phan_loai     TEXT NOT NULL CHECK (phan_loai IN ('NEW','EXACT_DUPLICATE','KEY_CONFLICT','IN_FILE_DUPLICATE','ERROR')),
  hanh_dong     TEXT NOT NULL CHECK (hanh_dong IN ('INSERT','SKIP','UPDATE','KEEP_OLD','IGNORE','PENDING_REVIEW')),
  phieu_can_id  INTEGER REFERENCES phieu_can(id),
  old_json      TEXT,
  raw_json      TEXT NOT NULL,
  diffs_json    TEXT,
  errors_json   TEXT
);
CREATE INDEX ix_batchrow_batch ON import_batch_row(batch_id);

-- ---------------------------------------------------------------- CHỐT KỲ
CREATE TABLE chot_ky (
  id              INTEGER PRIMARY KEY,
  ma              TEXT NOT NULL UNIQUE,
  loai            TEXT NOT NULL CHECK (loai IN ('DOT','KY')),
  dot_van_chuyen_id INTEGER REFERENCES dot_van_chuyen(id),
  tu_ngay         TEXT,
  den_ngay        TEXT,
  don_vi_van_chuyen_id INTEGER REFERENCES don_vi_van_chuyen(id),
  trang_thai      TEXT NOT NULL CHECK (trang_thai IN ('DA_CHOT','DA_MO_KHOA')),
  so_phieu        INTEGER, tong_kg NUMERIC, tien_truoc_vat INTEGER, tien_vat INTEGER, tong_tien INTEGER,
  chot_luc        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now','localtime')),
  mo_khoa_luc     TEXT,
  ly_do_mo_khoa   TEXT,
  ghi_chu         TEXT
);

CREATE TABLE chot_ky_snapshot (
  id                    INTEGER PRIMARY KEY,
  chot_ky_id            INTEGER NOT NULL REFERENCES chot_ky(id),
  phieu_can_id          INTEGER NOT NULL REFERENCES phieu_can(id),
  kl_hang_kg            NUMERIC NOT NULL,
  don_gia               INTEGER, ty_le_vat NUMERIC,
  tien_truoc_vat        INTEGER, tien_vat INTEGER, tong_tien INTEGER,
  bang_gia_id           INTEGER, don_vi_van_chuyen_id INTEGER, tuyen_id INTEGER,
  snapshot_json         TEXT NOT NULL,
  UNIQUE (chot_ky_id, phieu_can_id)
);

-- ---------------------------------------------------------------- ĐỐI CHIẾU
CREATE TABLE doi_chieu_batch (
  id                    INTEGER PRIMARY KEY,
  ten                   TEXT NOT NULL,
  loai_chung_tu         TEXT,             -- BANG_KE / DE_NGHI_TT / HOA_DON
  don_vi_van_chuyen_id  INTEGER REFERENCES don_vi_van_chuyen(id),
  dot_van_chuyen_id     INTEGER REFERENCES dot_van_chuyen(id),
  tu_ngay               TEXT, den_ngay TEXT,
  import_batch_id       INTEGER REFERENCES import_batch(id),
  tham_so_json          TEXT,             -- dung sai KL/tiền, khóa ưu tiên...
  trang_thai            TEXT NOT NULL DEFAULT 'NHAP' CHECK (trang_thai IN ('NHAP','DA_CHAY','DA_DUYET')),
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now','localtime'))
);

CREATE TABLE doi_chieu_dong_b (            -- dữ liệu nguồn B (đối tác)
  id              INTEGER PRIMARY KEY,
  batch_id        INTEGER NOT NULL REFERENCES doi_chieu_batch(id),
  source_row      INTEGER,
  so_phieu        TEXT, bien_so_goc TEXT, bien_so_chuan TEXT, ngay TEXT,
  kl_hang_kg      NUMERIC, don_gia INTEGER, tien_truoc_vat INTEGER, tien_vat INTEGER, tong_tien INTEGER,
  raw_json        TEXT NOT NULL
);
CREATE INDEX ix_dcb_batch ON doi_chieu_dong_b(batch_id, so_phieu);

CREATE TABLE doi_chieu_ket_qua (
  id              INTEGER PRIMARY KEY,
  batch_id        INTEGER NOT NULL REFERENCES doi_chieu_batch(id),
  phieu_can_id    INTEGER REFERENCES phieu_can(id),
  dong_b_id       INTEGER REFERENCES doi_chieu_dong_b(id),
  khoa_khop       TEXT,                   -- SO_PHIEU / BIEN_SO_NGAY_KL
  ket_qua         TEXT NOT NULL CHECK (ket_qua IN ('KHOP','THIEU_BEN_A','THIEU_BEN_B','LECH_KHOI_LUONG','LECH_DON_GIA','LECH_TIEN','LECH_VAT','TRUNG_DU_LIEU','CAN_KIEM_TRA')),
  chenh_lech_json TEXT,                   -- [{cot, he_thong, doi_tac, chenh}]
  xu_ly           TEXT NOT NULL DEFAULT 'CHUA_XU_LY' CHECK (xu_ly IN ('CHUA_XU_LY','CHAP_NHAN_A','CHAP_NHAN_B','DIEU_CHINH','BO_QUA')),
  ghi_chu         TEXT,
  updated_at      TEXT
);
CREATE INDEX ix_dckq_batch ON doi_chieu_ket_qua(batch_id, ket_qua);

-- ---------------------------------------------------------------- CẢNH BÁO / AUDIT / BACKUP
CREATE TABLE canh_bao (
  id           INTEGER PRIMARY KEY,
  loai         TEXT NOT NULL,     -- DUPLICATE_TICKET, UNKNOWN_VEHICLE, NO_PRICE, TIME_ANOMALY ...
  muc_do       TEXT NOT NULL CHECK (muc_do IN ('THAP','TRUNG_BINH','CAO')),
  entity       TEXT NOT NULL,
  entity_id    INTEGER,
  du_lieu_json TEXT,
  nguyen_nhan  TEXT NOT NULL,
  cach_xu_ly   TEXT,
  trang_thai   TEXT NOT NULL DEFAULT 'MOI' CHECK (trang_thai IN ('MOI','DANG_XU_LY','DA_XU_LY','BO_QUA')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now','localtime')),
  resolved_at  TEXT,
  ghi_chu      TEXT
);
CREATE UNIQUE INDEX ux_canh_bao_open ON canh_bao(loai, entity, entity_id) WHERE trang_thai IN ('MOI','DANG_XU_LY');
CREATE INDEX ix_canh_bao_tt ON canh_bao(trang_thai, loai);

CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY,
  ts         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now','localtime')),
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  INTEGER,
  old_value  TEXT,
  new_value  TEXT,
  note       TEXT,
  user_name  TEXT
);
CREATE INDEX ix_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX ix_audit_ts ON audit_log(ts);

CREATE TABLE backup_log (
  id         INTEGER PRIMARY KEY,
  ts         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now','localtime')),
  kind       TEXT NOT NULL CHECK (kind IN ('AUTO','MANUAL','PRE_RESTORE','PRE_MIGRATION')),
  file_path  TEXT NOT NULL,
  size_bytes INTEGER,
  sha256     TEXT,
  note       TEXT
);

-- Chặn sửa tài chính trên phiếu đã chốt ở tầng DB (phòng thủ 2 lớp: service + trigger)
CREATE TRIGGER trg_phieu_locked_no_update
BEFORE UPDATE OF kl_hang_kg, don_gia, tien_truoc_vat, ty_le_vat, tien_vat, tong_tien, bang_gia_id, don_vi_van_chuyen_id, tuyen_id ON phieu_can
WHEN OLD.chot_ky_id IS NOT NULL AND NEW.chot_ky_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Phiếu đã chốt — phải MỞ KHÓA kỳ trước khi sửa dữ liệu tài chính');
END;

INSERT INTO settings(key, value_json) VALUES
 ('money_scale', '1000'),
 ('rounding', '{"level":"STATEMENT","statement":{"lineAmount":{"digits":0,"mode":"HALF_UP"},"vat":{"digits":0,"mode":"HALF_UP"}}}'),
 ('duplicate_key', '"SO_PHIEU_NOI_XUAT"'),
 ('time_anomaly', '{"minGapMinutes":30,"maxWeighDurationMinutes":240,"minWeighDurationMinutes":1}'),
 ('backup', '{"auto":"DAILY","keepDaily":30,"keepMonthly":12}');

INSERT INTO schema_version(version, description) VALUES (1, 'Khởi tạo CSDL');
