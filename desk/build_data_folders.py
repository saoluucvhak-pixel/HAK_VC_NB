"""Dựng thư mục dữ liệu mẫu cho 3 bản cài desktop (mỗi đơn vị vận chuyển 1 bản) — định dạng JSON theo DATA_STORAGE_DESIGN.md."""
import json, hashlib, os, shutil, datetime as dt
exec(open('build_seed_base.py').read())          # tạo `rows` (toàn bộ dữ liệu đọc từ 3 file Excel) — chưa chia bản cài
from schema import TABLES, columns, PARTITION

SCHEMA_VERSION = 1
OUT = '/home/claude/desk/data_seed'

# ID ổn định cho phiếu cân: PC- + SHA1(ticket_key)[:12]
old2new = {}
for t in rows['PHIEU_CAN']:
    new = 'PC-' + hashlib.sha1(t['ticket_key'].encode()).hexdigest()[:12]
    old2new[t['ticket_id']] = new; t['ticket_id'] = new
assert len({t['ticket_id'] for t in rows['PHIEU_CAN']}) == len(rows['PHIEU_CAN'])

cfg = [
    ('SCHEMA_VERSION', '1', 'NUM', 'phiên bản cấu trúc dữ liệu'),
    ('ROUND_CONTRACT_DIGITS', '-3', 'NUM', 'ĐG_HĐ làm tròn hàng nghìn'),
    ('ROUND_FINAL_DIGITS', '-2', 'NUM', 'Đơn giá VC làm tròn hàng trăm (QR_DGVC (2))'),
    ('ROUND_PRICE_MODE', 'HALF_EVEN', 'TEXT', 'HALF_EVEN = khớp Power Query; HALF_UP = như ROUND Excel (Q10)'),
    ('PQ_INT64_CAST', 'TRUE', 'BOOL', 'mô phỏng ép Int64 của PQ khi đọc danh mục & đơn giá dầu'),
    ('FLOOR_TRANSPORT_PRICE_AT_ZERO', 'TRUE', 'BOOL', 'Đơn giá VC < 0 → 0'),
    ('ROUND_MONEY_DIGITS', '0', 'NUM', 'tiền làm tròn đến đồng (đã chốt)'),
    ('ROUND_MONEY_MODE', 'HALF_UP', 'TEXT', ''),
    ('VAT_RATE', '0.08', 'NUM', 'Thuế suất GTGT mặc định (khi không có lịch VAT_RATE_SCHEDULE); từng kỳ chọn được ở màn hình Tính giá'),
    ('FUEL_PRICE_METHOD', 'AVERAGE', 'TEXT', 'trung bình cộng (đã chốt)'),
    ('PERIOD_DATE_FIELD', 'WEIGH1_DATE', 'TEXT', 'lọc phiếu theo Ngày cân 1 (Q5)'),
    ('PRICE_VERSION_DATE', 'PERIOD_END', 'TEXT', 'chọn phiên bản giá hiệu lực tại ngày cuối kỳ (Q13)'),
    ('NO_FUEL_POLICY', 'BLOCK_WITH_OVERRIDE', 'TEXT', 'không có dầu → chặn, override có log (Q6)'),
    ('MULTI_FUEL_GROUP_POLICY', 'BLOCK', 'TEXT', 'dầu nhiều Đơn vị/ĐVT trong 1 tuyến → chặn (Q7)'),
    ('BKVC_GROUP_BY', 'PLATE_ROUTE', 'TEXT', '1 dòng / xe / tuyến (Q9)'),
    ('BKVC_SORT', 'PLATE', 'TEXT', ''),
    ('PLATE_REGEX', r'^\d{2}[A-Z]{1,2}-\d{4,5}$', 'TEXT', 'kiểm tra biển số phiếu cân'),
    ('TICKET_KEY_FIELDS', 'ticket_no,weigh1_date,plate_no', 'TEXT', 'khóa chống trùng phiếu (Q16)'),
    ('KG_CHECK_TOLERANCE', '0', 'NUM', '|net − (cân2 − cân1)| cho phép'),
    ('SIGNER_PRIMARY_JSON', '{"name":"VÕ VĂN PHỤNG","title":"Giám đốc"}', 'JSON', 'ký cho bên có sign_priority nhỏ hơn'),
    ('SIGNER_SECONDARY_JSON', '{"name":"VÕ THỊ NHƯ NGỌC","title":"Phó Giám đốc"}', 'JSON', 'ký cho bên còn lại'),
    ('SIGN_WITH_ACCOUNTANT', 'TRUE', 'BOOL', 'BKVC có ô Kế toán 2 bên (DON_VI.accountant_name)'),
    ('AMOUNT_WORDS_THOUSAND', 'ngàn', 'TEXT', 'từ dùng cho hàng nghìn khi đọc số (như file Excel)'),
    ('AMOUNT_WORDS_SUFFIX', 'đồng y ./.', 'TEXT', 'hậu tố số tiền bằng chữ'),
    ('SYNC_TARGET_UNITS', 'HAK;HAKQN;DH;CNHAK', 'TEXT', 'các nhà máy có bản cài — sửa danh mục ở 1 nơi thì nhắc sửa các nơi còn lại'),
    ('INVOICE_DESC_TEMPLATE', 'Vận chuyển dăm gỗ từ {DIEM_DI} đến {DIEM_DEN} bằng xe thùng biển kiểm soát: {BKS_LIEN}', 'TEXT', 'diễn giải cước để viết hóa đơn (dùng khi hợp đồng chưa có mẫu riêng) — theo hóa đơn MISA thật 25/09/2026'),
    ('INVOICE_PAYMENT_METHOD', 'Chuyển khoản', 'TEXT', 'hình thức thanh toán ghi trên file nhập hóa đơn MISA'),
    ('VAT_RATE_OPTIONS', '0;0.05;0.08;0.1', 'TEXT', 'Các thuế suất GTGT cho chọn khi tính kỳ (ngăn cách ;) — 0%, 5%, 8%, 10%'),
    ('VAT_RATE_SCHEDULE', '', 'TEXT', 'Lịch thuế suất GTGT theo thời điểm, vd 2026-01-01=0.08;2027-01-01=0.10 — kỳ tính mặc định lấy thuế suất có hiệu lực tại ngày cuối kỳ; trống = VAT_RATE'),
    ('VAT_ROUND_BASIS', 'LINE', 'TEXT', 'LINE = VAT làm tròn từng dòng rồi cộng (như hiện tại); TOTAL = VAT tính trên tổng tiền hàng như phần mềm hóa đơn MISA, chênh lệch dồn vào dòng cuối'),
    ('BACKUP_DAILY_KEEP', '30', 'NUM', 'số bản sao lưu ngày giữ lại'),
    ('BACKUP_MONTHLY_KEEP', '24', 'NUM', 'số bản sao lưu tháng giữ lại'),
    ('LOGIN_MAX_FAILED', '5', 'NUM', 'sai mật khẩu tối đa trước khi khóa'),
    ('LOGIN_LOCK_MINUTES', '15', 'NUM', ''),
    ('SESSION_IDLE_MINUTES', '60', 'NUM', 'không thao tác quá thời gian này → đăng xuất'),
    ('CATALOG_MASTER_UNIT', '', 'TEXT', 'KHÔNG DÙNG (chốt 25/09/2026): bản cài nào cũng sửa được danh mục và xuất gói DANH_MUC; APP nhắc sửa các nhà máy còn lại (SYNC_TARGET_UNITS)'),
    ('DATA_FOLDER_DEFAULT', '%USERPROFILE%\\Documents\\DGVC_DATA', 'TEXT', 'thư mục dữ liệu mặc định; đổi được (vd D:\\DGVC_DATA) bằng data.changeFolder'),
    ('BACKUP_MIRROR_ENABLED', 'TRUE', 'BOOL', 'sao lưu ra thư mục ngoài (USB / Google Drive for Desktop) sau mỗi bản sao lưu'),
    ('BACKUP_MIRROR_FOLDER', '', 'TEXT', 'thư mục ngoài — chọn khi cài đặt; trống hoặc không truy cập được → cảnh báo, không chặn làm việc'),
]
for k, v, t, ds in cfg:
    rows['CONFIG'].append(dict(config_key=k, config_value=v, value_type=t, description=ds, updated_at=NOW, updated_by=BY))

INSTALLS = [  # (mã bản cài, đơn vị, HĐ là bên VC, HĐ là bên thuê (chỉ xem), file dầu)
    ('HAKQN', 'HAKQN', ['HD-HAKQN-QS'], ['HD-DH-HAKQN', 'HD-HAK-HAKQN'], 'QS'),
    ('DH', 'DH', ['HD-DH-HAKQN'], [], 'DH'),
    ('HAK', 'HAK', ['HD-HAK-HAKQN'], [], 'DN'),
]
CATALOG = ['DON_VI', 'XE', 'TUYEN_VC', 'PRICE_HISTORY', 'CONFIG']

def sha256_file(p):
    h = hashlib.sha256(); h.update(open(p, 'rb').read()); return h.hexdigest()

def write_json_atomic(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1); f.flush(); os.fsync(f.fileno())
    os.replace(tmp, path)

if os.path.exists(OUT): shutil.rmtree(OUT)
report = {}
for inst, unit, carrier_cids, customer_cids, fuelsrc in INSTALLS:
    base = f'{OUT}/{inst}'
    install_id = 'INS-' + hashlib.sha1(f'seed-{inst}'.encode()).hexdigest()[:10].upper()
    data = {t[0]: [] for t in TABLES}
    for n in CATALOG: data[n] = [dict(r) for r in rows[n]]
    cids = carrier_cids + customer_cids
    data['HOP_DONG'] = [dict(r) for r in rows['HOP_DONG'] if r['contract_id'] in cids]
    data['HOP_DONG_XE'] = [dict(r) for r in rows['HOP_DONG_XE'] if r['contract_id'] in cids]
    plates = {r['plate_no'] for r in data['HOP_DONG_XE']}
    data['PHIEU_CAN'] = [dict(r) for r in rows['PHIEU_CAN'] if r['plate_no'] in plates]
    fuel_contract = carrier_cids[0]
    seq = 0; data['GIAO_NHAN_DAU'] = []
    for r in rows['GIAO_NHAN_DAU']:
        if r['contract_id'] != fuel_contract: continue
        seq += 1; r = dict(r); r['receipt_id'] = f'GD-{inst}-{seq:05d}'; data['GIAO_NHAN_DAU'].append(r)
    data['IMPORT_BATCH'] = [dict(b) for b in rows['IMPORT_BATCH'] if b['import_type'] == 'PHIEU_CAN' or b['contract_id'] == fuel_contract]
    for b in data['IMPORT_BATCH']:
        b['file_sha256'] = ''
        if b['import_type'] == 'PHIEU_CAN':
            b['total_rows'] = b['ok_rows'] = len(data['PHIEU_CAN'])
            b['warning_rows'] = sum(1 for t in data['PHIEU_CAN'] if t['validation_flags'])
            if inst != 'HAKQN':
                b['file_name'] = {'DH': 'Dongiavanchuyen_24.09_DH.xlsx', 'HAK': 'Dongiavanchuyen_24.09_ĐN.xlsx'}[inst]
    for c in data['HOP_DONG']:
        c['note'] = f"Bên vận chuyển {c['carrier_unit_code']} → bên thuê {c['customer_unit_code']}. Số HĐ, ngày hiệu lực: người dùng tự điền (dữ liệu mẫu)."  # trung tính: giống nhau ở mọi bản cài (tránh xung đột giả khi trao đổi gói)
    for em, nm in (('saoluucvhak@gmail.com', 'saoluucvhak@gmail.com'), ('phuthuy.apple@gmail.com', 'THUYSUZU')):
        data['USERS'].append(dict(username=em, full_name=nm, unit_code='', role='ADMIN', can_unlock=True, password_hash='', password_salt='',
                                  password_algo='', must_change_password=True, failed_attempts=0, locked_until='', is_active=True, last_login_at='', **audit()))
    # kiểm tra đủ cột
    for t in TABLES:
        cols = [c[0] for c in columns(t)]
        for r in data[t[0]]:
            missing = [c for c in cols if c not in r]; extra = [k for k in r if k not in cols]
            assert not missing and not extra, (inst, t[0], missing, extra)
            for c in columns(t):
                if c[2] and r[c[0]] in ('', None) and c[1] != 'BOOL': raise AssertionError((inst, t[0], c[0], 'required'))
    # ghi file
    files = {}
    for t in TABLES:
        name = t[0]; cols = [c[0] for c in columns(t)]
        part = PARTITION.get(name)
        buckets = {}
        if part:
            for r in data[name]: buckets.setdefault(str(r[part[1]])[:4], []).append(r)
        else:
            buckets[None] = data[name]
        for key, rs in buckets.items():
            rel = f'tables/{name}.json' if key is None else f'tables/{name}/{key}.json'
            write_json_atomic(f'{base}/{rel}', dict(table=name, partition=key, schemaVersion=SCHEMA_VERSION, columns=cols, rows=rs))
            files[rel] = dict(sha256=sha256_file(f'{base}/{rel}'), rows=len(rs))
    for d in ('journal', 'backups/daily', 'backups/manual', 'exports', 'logs'):
        os.makedirs(f'{base}/{d}', exist_ok=True)
    manifest = dict(app='DGVC', schemaVersion=SCHEMA_VERSION, installId=install_id, installCode=inst, unitCode=unit,
                    createdAt=NOW, dataVersion=1, lastBackupAt=None,
                    sequences=dict(GD=seq, KY=0, TC=0, CR=0, IB=len(data['IMPORT_BATCH']), EX=0, AL=0),
                    files=files)
    write_json_atomic(f'{base}/manifest.json', manifest)
    report[inst] = {k: v['rows'] for k, v in files.items() if v['rows']}
for k, v in report.items(): print(k, v)
