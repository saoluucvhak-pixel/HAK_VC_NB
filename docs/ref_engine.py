"""Bộ tính tham chiếu (Python) — dùng để sinh ví dụ API và làm "đáp án" đối chiếu khi lập trình Engine JS ở Bước 10.
Thực hiện đúng CALCULATION_RULES v5 trên dữ liệu seed."""
import json
from decimal import Decimal, ROUND_HALF_EVEN, ROUND_HALF_UP

MODES = {'HALF_EVEN': ROUND_HALF_EVEN, 'HALF_UP': ROUND_HALF_UP}
def rnd(x, digits, mode):
    return float(Decimal(repr(x)).quantize(Decimal(1).scaleb(-digits), MODES[mode]))
def i64(x): return rnd(x, 0, 'HALF_EVEN')

def cfg_of(rows):
    c = {r['config_key']: r['config_value'] for r in rows['CONFIG']}
    return dict(roundContract=int(c['ROUND_CONTRACT_DIGITS']), roundFinal=int(c['ROUND_FINAL_DIGITS']), priceMode=c['ROUND_PRICE_MODE'],
                int64=c['PQ_INT64_CAST'] == 'TRUE', floorZero=c['FLOOR_TRANSPORT_PRICE_AT_ZERO'] == 'TRUE',
                roundMoney=int(c['ROUND_MONEY_DIGITS']), moneyMode=c['ROUND_MONEY_MODE'], vat=float(c['VAT_RATE']),
                fuelMethod=c['FUEL_PRICE_METHOD'], primary=json.loads(c['SIGNER_PRIMARY_JSON']), secondary=json.loads(c['SIGNER_SECONDARY_JSON']))

# ---------------- Tầng A
def contract_price(route, price, cfg):
    cast = i64 if cfg['int64'] else (lambda v: v)
    new_price, kl, fuel_cat = cast(price['new_price']), cast(price['avg_load_ton']), cast(price['fuel_price_excl_vat'])
    trip_km = cast(route['trip_distance_km']); norm = price['fuel_norm_l_per_km']
    trip_price = new_price * (price['avg_volume_m3'] if route['uom'] == 'M3' else kl)
    fuel_per_trip = trip_km * norm
    fuel_cost = fuel_cat * fuel_per_trip
    no_diesel = (trip_price - fuel_cost) / kl
    return dict(new_price=new_price, avg_load_ton=kl, fuel_price_catalog=fuel_cat, trip_distance_km=trip_km, fuel_norm_l_per_km=norm,
                trip_price=trip_price, fuel_per_trip=fuel_per_trip, fuel_cost_per_trip=fuel_cost, fuel_cost_ratio=fuel_cost / trip_price,
                price_no_diesel=no_diesel)

def round_digits(x, digits, mode):  # digits theo quy ước Excel/PQ: -3 = hàng nghìn
    return float(Decimal(repr(x)).quantize(Decimal(1).scaleb(-digits), MODES[mode]))

# ---------------- Tầng B
def calculate(rows, contract_id, date_from, date_to, route_code):
    cfg = cfg_of(rows)
    route = next(r for r in rows['TUYEN_VC'] if r['route_code'] == route_code)
    price = next(p for p in rows['PRICE_HISTORY'] if p['route_code'] == route_code and p['status'] == 'ACTIVE'
                 and p['effective_from'] <= date_to and (not p['effective_to'] or p['effective_to'] >= date_to) and not p['contract_id'])
    A = contract_price(route, price, cfg)
    A['contract_price'] = round_digits(A['price_no_diesel'], cfg['roundContract'], cfg['priceMode'])
    plates = {x['plate_no'] for x in rows['HOP_DONG_XE'] if x['contract_id'] == contract_id}
    T = [t for t in rows['PHIEU_CAN'] if t['plate_no'] in plates and t['route_code'] == route_code
         and date_from <= t['weigh1_date'] <= date_to and not t['is_deleted']]
    F = [f for f in rows['GIAO_NHAN_DAU'] if f['contract_id'] == contract_id and f['route_code'] == route_code and not f['is_deleted']]
    n = len(T); kg = sum(t['net_kg'] for t in T); ton = kg / 1000
    groups = {(f['giver_unit_code'], f['uom']) for f in F}
    issues = []
    if len(groups) > 1: issues.append(dict(code='E_MULTI_FUEL_GROUP', level='ERROR'))
    if not F: issues.append(dict(code='E_NO_FUEL', level='ERROR'))
    actual = sum(f['qty_liter'] for f in F)
    fprice = sum((i64(f['fuel_price_excl_vat']) if cfg['int64'] else f['fuel_price_excl_vat']) for f in F) / len(F)
    std = A['trip_distance_km'] * n * A['fuel_norm_l_per_km']
    diff = std - actual
    adj = diff * fprice / ton
    raw = A['contract_price'] + adj
    final = 0.0 if (cfg['floorZero'] and raw < 0) else round_digits(raw, cfg['roundFinal'], cfg['priceMode'])
    for f in F:
        if f['receive_date'] < date_from: issues.append(dict(code='W_BEFORE_PERIOD', level='WARNING', ref=f['receipt_id']))
        if f['receive_date'] > date_to: issues.append(dict(code='W_AFTER_PERIOD', level='WARNING', ref=f['receipt_id']))
    fuel_plates = {f['plate_no'] for f in F}
    for p in sorted({t['plate_no'] for t in T} - fuel_plates): issues.append(dict(code='W_VEHICLE_NO_FUEL', level='WARNING', ref=p))
    if diff < 0: issues.append(dict(code='W_NEGATIVE_FUEL_DIFF', level='INFO'))
    res = dict(contract_id=contract_id, route_code=route_code, route_name=route['route_name'], uom=route['uom'], price_id=price['price_id'],
               **{k: A[k] for k in ('trip_distance_km', 'new_price', 'avg_load_ton', 'fuel_price_catalog', 'fuel_norm_l_per_km')},
               avg_volume_m3=price['avg_volume_m3'],
               start_date=min(t['weigh1_date'] for t in T), end_date=max(t['weigh2_date'] for t in T), trip_count=n, total_kg=kg, total_ton=ton,
               fuel_giver_unit=next(iter(groups))[0], fuel_uom=next(iter(groups))[1], fuel_line_count=len(F), actual_fuel_liter=actual,
               fuel_start_date=min(f['receive_date'] for f in F), fuel_end_date=max(f['receive_date'] for f in F), fuel_price=fprice,
               fuel_import_date=max(f['purchase_date'] for f in F),
               **{k: A[k] for k in ('trip_price', 'fuel_per_trip', 'fuel_cost_per_trip', 'fuel_cost_ratio', 'price_no_diesel', 'contract_price')},
               standard_fuel_liter=std, fuel_diff_liter=diff, fuel_adjust_price=adj, transport_price_raw=raw, transport_price=final,
               result_status='ERROR' if any(i['level'] == 'ERROR' for i in issues) else ('WARNING' if any(i['level'] == 'WARNING' for i in issues) else 'OK'))
    res['trace'] = trace(res, cfg)
    return res, T, F, issues, cfg

def vn(x, d=0):
    s = f"{x:,.{d}f}".replace(',', '§').replace('.', ',').replace('§', '.')
    return s

def trace(r, cfg):
    M3 = r['uom'] == 'M3'
    steps = [
        dict(key='trip_price', label='ĐG 1 chuyến', formula=f"Đơn giá mới × {'Thể tích TB' if M3 else 'KL_TB'}",
             expr=f"{vn(r['new_price'])} × {vn(r['avg_volume_m3'] if M3 else r['avg_load_ton'], 2 if M3 else 0)}", value=r['trip_price'], unit='đ/chuyến'),
        dict(key='fuel_per_trip', label='Tiêu hao NL/chuyến', formula='Cự ly chuyến × Định mức (lít/km)',
             expr=f"{vn(r['trip_distance_km'])} × {vn(r['fuel_norm_l_per_km'], 1)}", value=r['fuel_per_trip'], unit='lít'),
        dict(key='fuel_cost_per_trip', label='Tiền dầu/chuyến', formula='ĐG dầu chưa VAT (danh mục) × Tiêu hao NL/chuyến',
             expr=f"{vn(r['fuel_price_catalog'])} × {vn(r['fuel_per_trip'], 1)}", value=r['fuel_cost_per_trip'], unit='đ'),
        dict(key='fuel_cost_ratio', label='Tỷ lệ tiêu hao dầu', formula='Tiền dầu / ĐG 1 chuyến',
             expr=f"{vn(r['fuel_cost_per_trip'])} / {vn(r['trip_price'])}", value=r['fuel_cost_ratio'], unit='%'),
        dict(key='price_no_diesel', label='ĐGVC chưa diesel', formula='(ĐG 1 chuyến − Tiền dầu) / KL_TB',
             expr=f"({vn(r['trip_price'])} − {vn(r['fuel_cost_per_trip'])}) / {vn(r['avg_load_ton'])}", value=r['price_no_diesel'], unit='đ/tấn'),
        dict(key='contract_price', label='ĐG HĐ', formula=f"ROUND(ĐGVC chưa diesel; {cfg['roundContract']}) [{cfg['priceMode']}]",
             expr=f"ROUND({vn(r['price_no_diesel'], 2)}; {cfg['roundContract']})", value=r['contract_price'], unit='đ/tấn'),
        dict(key='trip_count', label='Số chuyến', formula='số phiếu cân', expr=f"{r['trip_count']} phiếu", value=r['trip_count'], unit='chuyến',
             drill='calc.tickets'),
        dict(key='total_ton', label='Tổng khối lượng', formula='Σ KL hàng (KG) / 1000', expr=f"{vn(r['total_kg'])} / 1000", value=r['total_ton'], unit='tấn',
             drill='calc.tickets'),
        dict(key='actual_fuel_liter', label='Dầu thực nhận', formula='Σ số lượng bảng kê dầu của hợp đồng',
             expr=f"Σ {r['fuel_line_count']} dòng ({r['fuel_start_date']} → {r['fuel_end_date']})", value=r['actual_fuel_liter'], unit='lít', drill='calc.fuel'),
        dict(key='fuel_price', label='Đơn giá dầu', formula='Trung bình cộng đơn giá các dòng (chưa VAT)', expr=f"TB({r['fuel_line_count']} dòng)",
             value=r['fuel_price'], unit='đ/lít', drill='calc.fuel'),
        dict(key='standard_fuel_liter', label='Dầu định mức', formula='Cự ly chuyến × Số chuyến × Định mức',
             expr=f"{vn(r['trip_distance_km'])} × {r['trip_count']} × {vn(r['fuel_norm_l_per_km'], 1)}", value=r['standard_fuel_liter'], unit='lít'),
        dict(key='fuel_diff_liter', label='Chênh lệch dầu', formula='Dầu định mức − Dầu thực nhận',
             expr=f"{vn(r['standard_fuel_liter'], 2)} − {vn(r['actual_fuel_liter'], 2)}", value=r['fuel_diff_liter'], unit='lít'),
        dict(key='fuel_adjust_price', label='ĐG CL Diesel', formula='Chênh lệch × Đơn giá dầu / Tổng tấn',
             expr=f"{vn(r['fuel_diff_liter'], 2)} × {vn(r['fuel_price'], 2)} / {vn(r['total_ton'], 2)}", value=r['fuel_adjust_price'], unit='đ/tấn'),
        dict(key='transport_price_raw', label='ĐG VC trước làm tròn', formula='ĐG HĐ + ĐG CL Diesel',
             expr=f"{vn(r['contract_price'])} + {vn(r['fuel_adjust_price'], 2)}", value=r['transport_price_raw'], unit='đ/tấn'),
        dict(key='transport_price', label='Đơn giá vận chuyển', formula=f"< 0 → 0; ngược lại ROUND(…; {cfg['roundFinal']}) [{cfg['priceMode']}]",
             expr=f"ROUND({vn(r['transport_price_raw'], 2)}; {cfg['roundFinal']})", value=r['transport_price'], unit='đ/tấn'),
    ]
    return dict(version=1, routeCode=r['route_code'], priceId=r['price_id'], steps=steps)

# ---------------- Tầng C
def bkvc(rows, res, T, cfg, contract_id):
    by = {}
    for t in T:
        b = by.setdefault(t['plate_no'], dict(plate_no=t['plate_no'], owner_unit_code=t['owner_unit_code'], trip_count=0, kg=0))
        b['trip_count'] += 1; b['kg'] += t['net_kg']
    lines = []
    for i, p in enumerate(sorted(by), 1):
        b = by[p]; ton = b['kg'] / 1000
        amount = round_digits(ton * res['transport_price'], cfg['roundMoney'], cfg['moneyMode'])
        vat = round_digits(amount * cfg['vat'], cfg['roundMoney'], cfg['moneyMode'])
        lines.append(dict(seq=i, **b, ton=ton, unit_price=res['transport_price'], amount=amount, vat_rate=cfg['vat'], vat=vat, amount_incl_vat=amount + vat,
                          route_code=res['route_code']))
    tot = dict(trips=sum(l['trip_count'] for l in lines), kg=sum(l['kg'] for l in lines), ton=sum(l['kg'] for l in lines) / 1000,
               amount=sum(l['amount'] for l in lines), vat=sum(l['vat'] for l in lines), total=sum(l['amount_incl_vat'] for l in lines))
    return lines, tot

DIG = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']
def _three(n, full):
    h, t, u = n // 100, n // 10 % 10, n % 10
    w = []
    if full or h: w += [DIG[h], 'trăm']
    if t == 0 and u and (full or h): w.append('lẻ')
    elif t == 1: w.append('mười')
    elif t > 1: w += [DIG[t], 'mươi']
    if u:
        w.append('mốt' if (u == 1 and t > 1) else 'lăm' if (u == 5 and t >= 1) else DIG[u])
    return w
def number_to_vn_words(n, thousand='ngàn', suffix='đồng'):
    n = int(n)
    if n == 0: return f'Không {suffix}'
    names = ['', thousand, 'triệu', 'tỷ', f'{thousand} tỷ', 'triệu tỷ']
    groups = []
    while n: groups.append(n % 1000); n //= 1000
    out = []
    for idx in range(len(groups) - 1, -1, -1):
        if groups[idx] == 0: continue
        w = _three(groups[idx], idx != len(groups) - 1)
        out.append(' '.join(w + ([names[idx]] if names[idx] else [])))
    s = ', '.join(out) + f' {suffix}'
    return s[0].upper() + s[1:]

def signers(rows, contract_id, cfg):
    c = next(x for x in rows['HOP_DONG'] if x['contract_id'] == contract_id)
    U = {u['unit_code']: u for u in rows['DON_VI']}
    car, cus = U[c['carrier_unit_code']], U[c['customer_unit_code']]
    hi = car if car['sign_priority'] < cus['sign_priority'] else cus
    mk = lambda u: dict(unitCode=u['unit_code'], unitName=u['unit_name'].upper(), signer=cfg['primary'] if u is hi else cfg['secondary'],
                        accountant=u['accountant_name'] or None)
    return dict(carrier=mk(car), customer=mk(cus), source='RULE')
