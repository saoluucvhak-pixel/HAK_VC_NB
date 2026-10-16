"""Dựng file DB mẫu (Google Sheets) từ schema.py + dữ liệu thật của 3 file Excel."""
import re, json, base64, zlib, uuid, hashlib, datetime as dt
from decimal import Decimal, ROUND_HALF_EVEN
import openpyxl
from schema import TABLES, columns

SRC = {'QS': '/home/claude/src.xlsx', 'DH': '/home/claude/dh.xlsx', 'DN': '/home/claude/dn.xlsx'}
NOW = '2026-09-24T22:10:00+07:00'
BY = 'seed@import'
def audit(): return {'created_at': NOW, 'created_by': BY, 'updated_at': '', 'updated_by': '', 'row_version': 1}
def d(x): return x.strftime('%Y-%m-%d') if isinstance(x, (dt.date, dt.datetime)) else (x or '')
def plate_key(s): return re.sub(r'[^0-9A-Z]', '', re.sub(r'^[A-Z]{2}_', '', str(s).strip().upper()))

rows = {t[0]: [] for t in TABLES}

# ---------------- DON_VI
units = [  # từ màn hình Danh mục công ty (24/09/2026)
    dict(unit_code='HAK', unit_name='Công ty TNHH Hoàng Anh Khôi', short_name='HAK', unit_type='CONG_TY',
         name_aliases='CÔNG TY TNHH HOÀNG ANH KHÔI', tax_code='0401447476',
         address='Thửa đất số 1182, tờ bản đồ số 38, Thôn Thạch Nham Tây, Xã Bà Nà, TP. Đà Nẵng, Việt Nam',
         legal_rep_name='Võ Văn Phụng', legal_rep_salutation='Ông', legal_rep_title='Giám đốc', factory_name='Nhà máy Hoàng Anh Khôi',
         email='hak.dn.ng@gmail.com', phone='0911749449', doc_display_name='CÔNG TY TNHH HOÀNG ANH KHÔI', sign_priority=1,
         accountant_name='', fuel_prefix='DN'),
    dict(unit_code='HAKQN', unit_name='Công ty TNHH Hoàng Anh Khôi Quảng Nam', short_name='HAKQN', unit_type='CONG_TY',
         name_aliases='CÔNG TY TNHH HOÀNG ANH KHÔI QUẢNG NAM', tax_code='4000956057',
         address='Cụm Công nghiệp Quế Cường, Xã Quế Sơn Trung, TP. Đà Nẵng, Việt Nam',
         legal_rep_name='Võ Thị Như Ngọc', legal_rep_salutation='Bà', legal_rep_title='Phó Giám đốc', factory_name='Nhà máy Quế Cường',
         email='hoangangkhoiqn2019@gmail.com', phone='0914404449', doc_display_name='Công ty TNHH Hoàng Anh Khôi Quảng Nam', sign_priority=2,
         accountant_name='TRẦN THỊ HẸN', fuel_prefix='QC'),
    dict(unit_code='DH', unit_name='Công ty TNHH SX-TM-DV Đại Hiệp', short_name='Đại Hiệp', unit_type='CONG_TY',
         name_aliases='Công ty TNHH SX TM DV Đại Hiệp;CÔNG TY TNHH SX TM DV ĐẠI HIỆP;Công ty TNHH SXTMDV Đại Hiệp', tax_code='4000858740',
         address='Thôn Phú Quý, Xã Đại Lộc, TP. Đà Nẵng, Việt Nam',
         legal_rep_name='Võ Thị Như Ngọc', legal_rep_salutation='Bà', legal_rep_title='Phó Giám đốc', factory_name='Nhà máy Đại Hiệp',
         email='daihiepct2017@gmail.com', phone='02353.762678', doc_display_name='Công ty TNHH SXTMDV Đại Hiệp', sign_priority=3,
         accountant_name='', fuel_prefix='DH'),
    dict(unit_code='CNHAK', unit_name='Chi Nhánh Công ty TNHH Hoàng Anh Khôi', short_name='CN Quế Sơn', unit_type='CHI_NHANH',
         name_aliases='CN CÔNG TY TNHH HOÀNG ANH KHÔI;CNHAK;CHI NHÁNH CÔNG TY TNHH HOÀNG ANH KHÔI', tax_code='0401447476-001',
         address='Cụm Công nghiệp Đông Phú, Xã Quế Sơn, TP. Đà Nẵng, Việt Nam',
         legal_rep_name='Võ Thị Như Ngọc', legal_rep_salutation='Bà', legal_rep_title='Phó Giám đốc', factory_name='Nhà máy Quế Sơn',
         email='chinhanhqueson@gmail.com', phone='0911749449', doc_display_name='CN Công ty TNHH Hoàng Anh Khôi', sign_priority=4,
         accountant_name='DƯƠNG THỊ THANH NGA', fuel_prefix=''),
    dict(unit_code='HHH', unit_name='Công ty Hùng Hoàng Hoa', short_name='HHH', unit_type='CONG_TY', name_aliases='CÔNG TY HÙNG HOÀNG HOA',
         tax_code='', address='', legal_rep_name='', legal_rep_salutation='', legal_rep_title='', factory_name='', email='', phone='',
         doc_display_name='', sign_priority=90, accountant_name='', fuel_prefix=''),
]
for u in units:
    rows['DON_VI'].append(dict(**u, is_active=True, note=('đơn vị ngoài, xuất hiện trong bảng giá (Đơn vị VC = HHH); cần bổ sung thông tin' if u['unit_code']=='HHH' else 'từ Danh mục công ty 24/09/2026; kế toán: tự điền (HAKQN, CNHAK lấy từ BKVC file QS)'), **audit()))
name2unit = {}
for u in units:
    for nm in [u['unit_name']] + u['name_aliases'].split(';'):
        name2unit[nm.strip().upper()] = u['unit_code']

# ---------------- TUYEN_VC + PRICE_HISTORY (từ TBL_DATA nhúng)
m = open('/home/claude/Section1.m').read()
cat = json.loads(zlib.decompress(base64.b64decode(re.findall(r'Binary.FromText\("([^"]+)"', m)[0]), -15))
# điểm đi / điểm đến in diễn giải hóa đơn — chép đúng câu trên hóa đơn thật (MISA meInvoice, ĐH → HAKQN, 25/09/2026)
PLACES = {'VC.007': ('nhà máy DG CCN Đông Phú, Xã Quế Sơn , TP Đà Nẵng', 'Cảng Tiên Sa Đà Nẵng')}
for r in cat:
    ud, ma, ten, cl, clc, dvt, dg, gkm, dgm, dvvc, dgd, dm, kl, tt = r
    rows['TUYEN_VC'].append(dict(route_code=ma, route_name=re.sub(r'\s+', ' ', ten).strip(), distance_km=float(cl), trip_distance_km=float(clc), from_place=PLACES.get(ma, ('', ''))[0], to_place=PLACES.get(ma, ('', ''))[1],
                                 uom='M3' if dvt.upper() == 'M3' else 'TAN', catalog_unit_code=dvvc, is_active=True,
                                 note='' if ten == re.sub(r'\s+', ' ', ten) else f'tên gốc: "{ten}"', **audit()))
    dd, mm, yy = ud.split('/')
    rows['PRICE_HISTORY'].append(dict(price_id=f'PR-{ma}-v1', route_code=ma, contract_id='', version_no=1,
        effective_from=f'{yy}-{mm}-{dd}', effective_to='', base_price_excl_vat=float(dg), base_price_source=f'File Excel Dongiavanchuyen_24.09 · bảng TBL_DATA · cột "Đơn Giá (chưa VAT)" · ngày cập nhật {ud}', price_per_km=float(gkm),
        new_price=float(dgm), fuel_price_excl_vat=float(dgd), fuel_norm_l_per_km=float(dm), avg_load_ton=float(kl),
        avg_volume_m3=float(tt), status='ACTIVE', is_used=False, source_note='TBL_DATA nhúng trong Power Query (giá trị text gốc)', **audit()))

# ---------------- PHIEU_CAN (file QS: đủ 326 phiếu; file ĐH/ĐN là tập con — kiểm chứng)
def read_vc(path):
    ws = openpyxl.load_workbook(path, data_only=True)['NL_VC']
    hdr = [str(ws.cell(1, c).value).replace('\n', '').strip() for c in range(1, 17)]
    out = []
    for r in range(2, ws.max_row + 1):
        v = [ws.cell(r, c).value for c in range(1, 17)]
        if v[14] is None: continue
        out.append(dict(zip(hdr, v)))
    return out, hdr

tickets = {}
batch_vc = 'IB-PHIEUCAN-QS-20260924'
vc, hdr = read_vc(SRC['QS'])
for x in vc:
    tno = str(x['Số phiếu']).removesuffix('.0'); w1 = d(x['Ngày cân 1']); plate = x['Biển số 1'].strip()
    key = f'{tno}|{w1}|{plate}'
    assert key not in tickets
    tid = f'PC-{tno}-{w1.replace("-", "")}'
    uname = (x['Đơn vị VC'] or '').strip()
    raw = {k: (d(v) if isinstance(v, dt.datetime) else v) for k, v in x.items()}
    tickets[key] = dict(ticket_id=tid, ticket_key=key, ticket_no=tno, row_no=str(x['Stt']), weigh1_date=w1, weigh1_time=x['Giờ cân 1'],
        weigh2_date=d(x['Ngày cân 2']), weigh2_time=x['Giờ cân 2'], plate_no=plate, weight1_kg=x['Cân lần 1'], weight2_kg=x['Cân lần 2'],
        net_kg=x['KL hàng (KG)'], origin=x['Nguồn gốc'] or '', customer=x['Khách hàng'] or '', ldd=x['LDĐ'] or '', weigh_type=x['Kiểu cân'] or '',
        route_code=x['Mã cự ly VC'], transport_unit_name=uname, owner_unit_code=name2unit[uname.upper()],
        validation_flags=('W_OVERNIGHT' if x['Ngày cân 1'] != x['Ngày cân 2'] else ''), flags_ack=False, flags_ack_note='', import_batch_id=batch_vc,
        raw_row_json=json.dumps(raw, ensure_ascii=False), is_deleted=False, **audit())
rows['PHIEU_CAN'] = list(tickets.values())
for f in ('DH', 'DN'):  # kiểm chứng tập con
    sub, _ = read_vc(SRC[f])
    for x in sub:
        key = f"{str(x['Số phiếu']).removesuffix('.0')}|{d(x['Ngày cân 1'])}|{x['Biển số 1'].strip()}"
        assert key in tickets and float(tickets[key]['net_kg']) == float(x['KL hàng (KG)']), key

# ---------------- XE
plates = {}
for t in rows['PHIEU_CAN']:
    plates.setdefault(t['plate_no'], t['owner_unit_code'])
prefix = {u['unit_code']: u['fuel_prefix'] for u in units}
for p, u in sorted(plates.items()):
    rows['XE'].append(dict(plate_no=p, plate_key=plate_key(p), owner_unit_code=u, fuel_code=f"{prefix[u]}_{plate_key(p)}",
                           is_active=True, note='', **audit()))
pk2plate = {plate_key(p): p for p in plates}

# ---------------- HOP_DONG + HOP_DONG_XE
contracts = [
    ('HD-HAKQN-QS', 'HAKQN-QS', 'CNHAK', 'HAKQN', 'QS',
[], [], sorted(plates)),
    ('HD-DH-HAKQN', 'DH-HAKQN', 'HAKQN', 'DH', 'DH', [], [], sorted(p for p, u in plates.items() if u == 'DH')),
    ('HD-HAK-HAKQN', 'HAK-HAKQN', 'HAKQN', 'HAK', 'DN', [], [], sorted(p for p, u in plates.items() if u == 'HAK')),
]
# mẫu diễn giải cước để viết hóa đơn: để trống → dùng mẫu chung (CONFIG INVOICE_DESC_TEMPLATE) theo điểm đi / điểm đến của tuyến.
# (Câu BKVC!C37 của file QS "từ NM Đông Phú đến NM Bà Nà" là câu cũ — hóa đơn thật MISA 25/09/2026 ghi Đông Phú → Cảng Tiên Sa.)
DESC = {}
for cid, code, cus, car, src, cs, ks, pl in contracts:
    rows['HOP_DONG'].append(dict(contract_id=cid, contract_code=code, contract_no='', customer_unit_code=cus, carrier_unit_code=car,
        effective_from='2026-09-01', effective_to='', report_title='BẢNG XÁC NHẬN KHỐI LƯỢNG VẬN CHUYỂN DĂM',
        service_desc=DESC.get(cid, ''), carrier_print_name='', customer_print_name='', sign_place='Quế Sơn Trung', customer_signers_json=json.dumps(cs, ensure_ascii=False),
        carrier_signers_json=json.dumps(ks, ensure_ascii=False), is_active=True,
        note='DỮ LIỆU MẪU ĐỂ TEST — số HĐ, ngày hiệu lực người dùng tự điền khi tạo danh mục hợp đồng thật; người ký theo sign_priority', **audit()))
    for p in pl:
        rows['HOP_DONG_XE'].append(dict(id=f'HX-{code}-{plate_key(p)}', contract_id=cid, plate_no=p, effective_from='2026-09-01', effective_to='', **audit()))

# ---------------- GIAO_NHAN_DAU (3 bảng kê)
giver = {'CNHAK': 'CNHAK', 'HAKQN': 'HAKQN'}
for f, cid in (('QS', 'HD-HAKQN-QS'), ('DH', 'HD-DH-HAKQN'), ('DN', 'HD-HAK-HAKQN')):
    ws = openpyxl.load_workbook(SRC[f], data_only=True)['NL_GIAONHANDAU']
    hdr = [ws.cell(2, c).value for c in range(1, 9)]
    bid = f'IB-DAU-{f}-20260924'
    n = 0; seen = {}
    for r in range(3, ws.max_row + 1):
        v = [ws.cell(r, c).value for c in range(1, 9)]
        if all(x is None for x in v): continue
        x = dict(zip(hdr, v)); n += 1
        pk = plate_key(x['Biển số xe']); plate = pk2plate.get(pk, '')
        flags = [] if plate else ['E_VEHICLE_NOT_FOUND']
        if not re.match(r'^[A-Z]{2}_', str(x['Biển số xe'])) and '-' not in str(x['Biển số xe']): flags.append('W_PLATE_FORMAT')
        dk = (d(x['Ngày nhận dầu']), pk, x['Số lượng (lít)'])
        if dk in seen: flags.append('W_POSSIBLE_DUPLICATE')
        seen[dk] = 1
        if x['Ngày nhận dầu'] < dt.datetime(2026, 9, 18): flags.append('W_BEFORE_PERIOD')
        raw = {k: (d(val) if isinstance(val, dt.datetime) else val) for k, val in x.items()}
        rows['GIAO_NHAN_DAU'].append(dict(receipt_id=f'GD-{f}-{n:03d}', contract_id=cid, receive_date=d(x['Ngày nhận dầu']),
            route_code=x['Mã cự ly VC'], fuel_vehicle_code=str(x['Biển số xe']).strip(), plate_no=plate, owner_unit_code=plates.get(plate, ''),
            uom=x['ĐVT'], qty_liter=float(x['Số lượng (lít)']), fuel_price_excl_vat=float(x['Đơn giá dầu']),
            purchase_date=d(x['Ngày mua dầu']), giver_unit_code=giver[x['Đơn vị']], validation_flags=';'.join(flags), flags_ack=False, flags_ack_note='',
            import_batch_id=bid, raw_row_json=json.dumps(raw, ensure_ascii=False), is_deleted=False, **audit()))
    # mark duplicates on first row too
    rows['IMPORT_BATCH'].append(dict(batch_id=bid, import_type='GIAO_NHAN_DAU', contract_id=cid,
        file_name={'QS': 'Dongiavanchuyen_24.09 QS-TS( XUẤT QS).xlsx', 'DH': 'Dongiavanchuyen_24.09_DH.xlsx', 'DN': 'Dongiavanchuyen_24.09_ĐN.xlsx'}[f],
        sheet_name='NL_GIAONHANDAU', header_json=json.dumps(hdr, ensure_ascii=False), mapping_json='', total_rows=n,
        ok_rows=n, warning_rows=0, error_rows=0, duplicate_rows=0, status='CONFIRMED', confirmed_at=NOW, confirmed_by=BY, **audit()))
# first occurrence of duplicate pairs also flagged
from collections import Counter
cnt = Counter((r['contract_id'], r['receive_date'], plate_key(r['fuel_vehicle_code']), r['qty_liter']) for r in rows['GIAO_NHAN_DAU'])
for r in rows['GIAO_NHAN_DAU']:
    if cnt[(r['contract_id'], r['receive_date'], plate_key(r['fuel_vehicle_code']), r['qty_liter'])] > 1 and 'W_POSSIBLE_DUPLICATE' not in r['validation_flags']:
        r['validation_flags'] = ';'.join(filter(None, [r['validation_flags'], 'W_POSSIBLE_DUPLICATE']))
# người dùng xác nhận 24/09/2026: 2 dòng 18/09 xe 92H-00192 400 lít KHÔNG trùng
for r in rows['GIAO_NHAN_DAU']:
    if 'W_POSSIBLE_DUPLICATE' in r['validation_flags']:
        r['flags_ack'] = True; r['flags_ack_note'] = 'Đã kiểm tra: không trùng (xác nhận 24/09/2026)'
for b in rows['IMPORT_BATCH']:
    b['warning_rows'] = sum(1 for r in rows['GIAO_NHAN_DAU'] if r['import_batch_id'] == b['batch_id'] and r['validation_flags'])
    b['ok_rows'] = b['total_rows'] - b['warning_rows']
rows['IMPORT_BATCH'].insert(0, dict(batch_id=batch_vc, import_type='PHIEU_CAN', contract_id='', file_name='Dongiavanchuyen_24.09 QS-TS( XUẤT QS).xlsx',
    sheet_name='NL_VC', header_json=json.dumps(hdr and [h for h in read_vc(SRC['QS'])[1]], ensure_ascii=False), mapping_json='',
    total_rows=len(rows['PHIEU_CAN']), ok_rows=len(rows['PHIEU_CAN']), warning_rows=sum(1 for t in rows['PHIEU_CAN'] if t['validation_flags']),
    error_rows=0, duplicate_rows=0, status='CONFIRMED', confirmed_at=NOW, confirmed_by=BY, **audit()))

