"""Sinh các artboard .dc.html cho canvas thiết kế giao diện — số liệu thật từ ui_data.json."""
import json, os, datetime as dt
D = json.load(open('/home/claude/desk/ui_data.json'))
ROOT = '/tmp/claude-0/-home-claude/f20c89a3-ed79-5a4d-8318-094f284f1d84/scratchpad/canvas'
os.makedirs(f'{ROOT}/project', exist_ok=True)

def vn(x, d=0):
    s = f"{x:,.{d}f}"; return s.replace(',', '§').replace('.', ',').replace('§', '.')
def dmy(s): y, m, d = s[:10].split('-'); return f'{d}/{m}/{y}'
def esc(s): return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

C = dict(side='#141F19', sideA='#24352A', accent='#D99A4E', green='#3E7057', greenD='#2F5A45', bg='#F1EFE9', card='#FFFFFF', text='#1C1C1A',
         mute='#5F5D54', line='#E4E0D6', head='#141F19', red='#B4453B')
FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&amp;family=IBM+Plex+Mono:wght@400;500;600&amp;display=swap" rel="stylesheet">'
MONO = "font-family: 'IBM Plex Mono', ui-monospace, monospace"

ICONS = {
 'dash': '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
 'scale': '<path d="M12 3v18M5 7h14M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z"/>',
 'fuel': '<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M3 21h13M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3"/><path d="M7 7h5"/>',
 'route': '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8"/>',
 'contract': '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
 'price': '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
 'calc': '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h2M14 11h2M8 15h2M14 15h2M8 19h2M14 19h2"/>',
 'check': '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
 'list': '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
 'shield': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
 'report': '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
 'swap': '<path d="M17 3l4 4-4 4M21 7H9M7 21l-4-4 4-4M3 17h12"/>',
 'history': '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
 'gear': '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
 'eye': '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
 'lock': '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
 'print': '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
 'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
 'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
 'alert': '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
 'x': '<path d="M18 6 6 18M6 6l12 12"/>',
 'user': '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 'db': '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
 'calendar': '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
 'chev': '<path d="M9 18l6-6-6-6"/>',
 'arrowl': '<path d="M19 12H5M12 19l-7-7 7-7"/>',
}
def ic(name, size=18, color='currentColor', sw=1.8):
    return f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICONS[name]}</svg>'

def page(title, body, w, h, script_extra=''):
    return f'''<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
{FONTS}
<style>
body{{margin:0;font-family:'Be Vietnam Pro',system-ui,sans-serif;color:{C['text']};background:{C['bg']}}}
a{{color:{C['greenD']}}}a:hover{{color:{C['side']}}}
</style>
</helmet>
{body}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
renderVals() {{ return {{ yes: true }}; }}
}}
</script>
</body>
</html>
'''

def tag(text, kind='green'):
    k = dict(green=('#E3EEE7', '#2F5A45'), orange=('#F7EAD9', '#7A4E15'), red=('#F5E1DE', '#8E342B'), blue=('#E4E9F2', '#33466B'), gray=('#ECEAE3', '#4A4840'))[kind]
    return f'<span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; background: {k[0]}; color: {k[1]}; font-size: 12px; font-weight: 600; white-space: nowrap">{text}</span>'

def btn(text, kind='primary', icon=None):
    st = {'primary': f'background: {C["green"]}; color: #FFFFFF; border: 1px solid {C["green"]}',
          'ghost': f'background: #FFFFFF; color: {C["text"]}; border: 1px solid #CFCAbd'.replace('CFCAbd', 'CFCABD'),
          'dark': f'background: {C["side"]}; color: #FFFFFF; border: 1px solid {C["side"]}',
          'danger': f'background: #FFFFFF; color: {C["red"]}; border: 1px solid #E3B8B2'}[kind]
    i = ic(icon, 16) if icon else ''
    return f'<button type="button" style="display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px; border-radius: 8px; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; {st}">{i}{text}</button>'

def field(label, value, w=None, mono=False, icon=None):
    ws = f'width: {w}px;' if w else 'flex-grow: 1;'
    mf = MONO + ';' if mono else ''
    i = f'<span style="color: {C["mute"]}; display: flex">{ic(icon, 16)}</span>' if icon else ''
    fid = 'f' + str(abs(hash(label + str(value))) % 10**8)
    return f'''<div style="display: flex; flex-direction: column; gap: 6px; {ws}">
<label for="{fid}" style="font-size: 12px; font-weight: 600; color: {C['mute']}; text-transform: uppercase; letter-spacing: 0.04em">{label}</label>
<div style="display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border: 1px solid #D6D1C4; border-radius: 8px; background: #FFFFFF">{i}<input id="{fid}" value="{esc(value)}" style="border: 0; outline: none; background: transparent; font-family: inherit; font-size: 14px; color: {C['text']}; width: 100%; {mf}"></div>
</div>'''

def card(inner, pad=20, extra=''):
    return f'<div style="background: #FFFFFF; border-radius: 12px; box-shadow: 0 1px 2px rgba(20,31,25,0.06), 0 4px 16px rgba(20,31,25,0.05); padding: {pad}px; {extra}">{inner}</div>'

def table(cols, rows, aligns=None, widths=None, mono_cols=(), foot=None, font=13):
    aligns = aligns or ['left'] * len(cols)
    th = ''.join(f'<th style="text-align: {aligns[i]}; padding: 10px 12px; font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; white-space: nowrap;{f" width: {widths[i]};" if widths and widths[i] else ""}">{c}</th>' for i, c in enumerate(cols))
    trs = []
    for ri, r in enumerate(rows):
        bg = '#FFFFFF' if ri % 2 == 0 else '#FAF8F3'
        tds = ''.join(f'<td style="text-align: {aligns[i]}; padding: 9px 12px; border-bottom: 1px solid {C["line"]}; white-space: nowrap;{(" " + MONO + ";") if i in mono_cols else ""}">{v}</td>' for i, v in enumerate(r))
        trs.append(f'<tr style="background: {bg}">{tds}</tr>')
    tf = ''
    if foot:
        tf = '<tfoot><tr style="background: #F3EFE4; font-weight: 700">' + ''.join(f'<td style="text-align: {aligns[i]}; padding: 10px 12px;{(" " + MONO + ";") if i in mono_cols else ""}">{v}</td>' for i, v in enumerate(foot)) + '</tr></tfoot>'
    return f'<table style="width: 100%; border-collapse: collapse; font-size: {font}px"><thead><tr style="background: {C["head"]}; color: #FFFFFF">{th}</tr></thead><tbody>{"".join(trs)}</tbody>{tf}</table>'

MENU = [('dash', '1. Dashboard', 'Dashboard'), ('scale', '2. Phiếu cân', None), ('fuel', '3. Giao nhận dầu', None), ('route', '4. Danh mục tuyến', None),
        ('contract', 'Hợp đồng vận chuyển', None), ('price', '5. Đơn giá', None), ('calc', '6. Tính giá vận chuyển', 'Main'),
        ('check', '7. Bảng xác nhận khối lượng', 'BKVC'), ('list', '8. Chi tiết vận chuyển', None), ('shield', 'Kiểm tra dữ liệu', None),
        ('report', '9. Báo cáo', None), ('swap', 'Trao đổi dữ liệu', 'Exchange'), ('history', '10. Lịch sử thao tác', None), ('gear', '11. Cài đặt', None)]

def sidebar(active, unit='HAKQN', user='phuthuy.apple@gmail.com', role='ADMIN', h=900):
    items = []
    for icn, label, target in MENU:
        act = (label == active)
        st = f'background: {C["sideA"]}; color: #FFFFFF; box-shadow: inset 3px 0 0 {C["accent"]}' if act else 'color: #C9D1CB'
        inner = f'{ic(icn, 17)}<span>{label}</span>'
        common = f'display: flex; align-items: center; gap: 12px; height: 38px; padding: 0 14px; border-radius: 8px; font-size: 13.5px; text-decoration: none; {st}'
        items.append(f'<a href="{target}.dc.html" style="{common}">{inner}</a>' if target else f'<a href="#" style="{common}">{inner}</a>')
        if label in ('Hợp đồng vận chuyển',):
            pass
    unit_name = {'HAKQN': 'Công ty TNHH Hoàng Anh Khôi Quảng Nam', 'DH': 'Công ty TNHH SX-TM-DV Đại Hiệp', 'HAK': 'Công ty TNHH Hoàng Anh Khôi'}[unit]
    return f'''<nav aria-label="Menu chính" style="width: 248px; height: {h}px; box-sizing: border-box; background: {C['side']}; display: flex; flex-direction: column; padding: 20px 12px; gap: 16px; flex-shrink: 0">
<div style="display: flex; align-items: center; gap: 10px; padding: 0 6px">
<div style="width: 38px; height: 38px; border-radius: 10px; background: {C['accent']}; color: {C['side']}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px">VC</div>
<div style="display: flex; flex-direction: column"><span style="color: #FFFFFF; font-weight: 700; font-size: 15px">Đơn giá vận chuyển</span><span style="color: #9DA8A0; font-size: 12px">Dăm gỗ · bản offline</span></div>
</div>
<div style="margin: 0 6px; padding: 10px 12px; border-radius: 10px; background: {C['sideA']}; display: flex; flex-direction: column; gap: 2px">
<span style="color: {C['accent']}; font-size: 11px; font-weight: 700; letter-spacing: 0.06em">BẢN CÀI · {unit}</span>
<span style="color: #DDE3DE; font-size: 12px; line-height: 1.35">{unit_name}</span>
</div>
<div style="display: flex; flex-direction: column; gap: 2px">{''.join(items)}</div>
<div style="margin-top: auto; display: flex; align-items: center; gap: 10px; padding: 10px 8px; border-top: 1px solid #2A3A30">
<div style="width: 32px; height: 32px; border-radius: 50%; background: #2F4437; color: #FFFFFF; display: flex; align-items: center; justify-content: center">{ic('user', 16)}</div>
<div style="display: flex; flex-direction: column; min-width: 0"><span style="color: #FFFFFF; font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 170px">{user}</span><span style="color: #9DA8A0; font-size: 11.5px">{role} · sao lưu 23:00 hôm nay</span></div>
</div>
</nav>'''

def shell(active, title, crumbs, content, actions='', unit='HAKQN', user='phuthuy.apple@gmail.com', role='ADMIN', overlay='', h=900):
    cr = ' <span style="color: #A8A396">/</span> '.join(f'<span>{c}</span>' for c in crumbs)
    return f'''<div style="width: 1440px; height: {h}px; display: flex; background: {C['bg']}; position: relative; overflow: hidden">
{sidebar(active, unit, user, role, h)}
<main style="flex-grow: 1; display: flex; flex-direction: column; min-width: 0; padding: 22px 28px; gap: 18px; box-sizing: border-box; height: {h}px; overflow: hidden">
<header style="display: flex; align-items: flex-end; justify-content: space-between; gap: 16px">
<div style="display: flex; flex-direction: column; gap: 4px"><div style="font-size: 12.5px; color: {C['mute']}">{cr}</div><h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.01em">{title}</h1></div>
<div style="display: flex; gap: 10px; align-items: center">{actions}</div>
</header>
{content}
</main>
{overlay}
</div>'''

def stat(label, value, unit='', sub='', accent=False):
    col = C['greenD'] if accent else C['text']
    return card(f'''<div style="display: flex; flex-direction: column; gap: 6px">
<span style="font-size: 12px; font-weight: 600; color: {C['mute']}; text-transform: uppercase; letter-spacing: 0.04em">{label}</span>
<div style="display: flex; align-items: baseline; gap: 6px"><span style="font-size: 26px; font-weight: 700; color: {col}; {MONO}">{value}</span><span style="font-size: 13px; color: {C['mute']}">{unit}</span></div>
<span style="font-size: 12.5px; color: {C['mute']}">{sub}</span></div>''', 16)

boards = {}
QS = D['qs']; R = QS['res']

# ------------------------------------------------------------------ 6. TÍNH GIÁ (Main)
filters = card(f'''<div style="display: flex; gap: 14px; align-items: flex-end">
{field('Hợp đồng (bên vận chuyển)', 'HAKQN-QS · HAKQN → CN Quế Sơn', 330, icon='contract')}
{field('Từ ngày', '18/09/2026', 150, True, 'calendar')}
{field('Đến ngày', '23/09/2026', 150, True, 'calendar')}
{field('Mã tuyến', 'VC.007 · Xã Quế Sơn - Tiên Sa', None, icon='route')}
<div style="display: flex; gap: 8px">{btn('Xem trước', 'ghost', 'eye')}{btn('TÍNH GIÁ', 'primary', 'calc')}</div>
</div>''', 16)
kpis = f'''<div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px">
{stat('Số chuyến', '326', 'chuyến', '17 xe · 3 chủ xe')}
{stat('Tổng khối lượng', vn(R['total_ton'], 2), 'tấn', vn(R['total_kg']) + ' kg')}
{stat('Dầu thực nhận', vn(R['actual_fuel_liter']), 'lít', '18 dòng bảng kê · 20–23/09')}
{stat('Dầu định mức', vn(R['standard_fuel_liter'], 1), 'lít', 'chênh lệch +' + vn(R['fuel_diff_liter'], 1) + ' lít')}
{stat('Đơn giá vận chuyển', vn(R['transport_price']), 'đ/tấn', 'ĐG HĐ 115.000 + CL dầu 62.985,46', True)}
</div>'''
cols = ['STT', 'Mã tuyến', 'Tuyến', 'Cự ly', 'Bắt đầu', 'Kết thúc', 'Chuyến', 'Tổng tấn', 'Dầu nhận', 'Dầu ĐM', 'CL dầu', 'ĐG dầu', 'ĐG HĐ', 'ĐG CL Diesel', 'Đơn giá VC']
row = ['1', 'VC.007', 'Xã Quế Sơn - Tiên Sa', '144', '18/09', '23/09', '326', vn(R['total_ton'], 2), vn(R['actual_fuel_liter']), vn(R['standard_fuel_liter'], 1),
       vn(R['fuel_diff_liter'], 1), vn(R['fuel_price']), vn(R['contract_price']), vn(R['fuel_adjust_price'], 2),
       f'<a href="Trace.dc.html" style="font-weight: 700; color: {C["greenD"]}; text-decoration: none; border-bottom: 1px dashed {C["green"]}">{vn(R["transport_price"])}</a>']
res_table = card(f'''<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
<div style="display: flex; align-items: center; gap: 10px"><h2 style="margin: 0; font-size: 16px; font-weight: 700">Kết quả tính — kỳ HAKQN-QS/20260918-20260923</h2>{tag('Nháp · lần tính 1', 'orange')}</div>
<div style="display: flex; gap: 8px">{btn('Xem chi tiết tính', 'ghost', 'eye')}{btn('Xem phiếu cân (326)', 'ghost', 'list')}</div></div>
{table(cols, [row], aligns=['center', 'left', 'left', 'right', 'center', 'center', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right'], mono_cols=(1, 3, 6, 7, 8, 9, 10, 11, 12, 13, 14), font=12.5)}
<p style="margin: 10px 0 0; font-size: 12.5px; color: {C['mute']}">Bấm vào dòng để xem 326 phiếu cân cấu thành · bấm vào <b>Đơn giá VC</b> để xem 15 bước tính.</p>''', 18)
issues = card(f'''<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px"><span style="color: #7A4E15; display: flex">{ic('alert', 18)}</span><h2 style="margin: 0; font-size: 15px; font-weight: 700">Kiểm tra trước khi xác nhận</h2>{tag('0 lỗi chặn', 'green')}{tag('5 cảnh báo', 'orange')}</div>
<div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px">
<div style="display: flex; gap: 10px; align-items: center">{tag('W_VEHICLE_NO_FUEL', 'orange')}<span>5 xe có chạy nhưng không có dòng dầu: <span style="{MONO}">43H-01098, 92H-00057, 92H-00133, 92H-00141, 92H-00844</span></span></div>
<div style="display: flex; gap: 10px; align-items: center">{tag('W_OVERNIGHT', 'blue')}<span>6 phiếu cân qua đêm (ngày cân 2 = ngày cân 1 + 1) — tính theo Ngày cân 1</span></div>
<div style="display: flex; gap: 10px; align-items: center">{tag('OK', 'green')}<span>Phiên bản giá VC.007 v1 (hiệu lực 10/07/2025) · định mức 0,4 lít/km · KL_TB 18 tấn</span></div>
</div>''', 18)
side_actions = card(f'''<div style="display: flex; flex-direction: column; gap: 12px">
<h2 style="margin: 0; font-size: 15px; font-weight: 700">Trạng thái kỳ</h2>
<div style="display: flex; align-items: center; gap: 6px; font-size: 12.5px">
{tag('Nháp', 'orange')}<span style="color: #A8A396">→</span>{tag('Đã xác nhận', 'gray')}<span style="color: #A8A396">→</span>{tag('Đã khóa', 'gray')}</div>
<p style="margin: 0; font-size: 12.5px; color: {C['mute']}; line-height: 1.5">Xác nhận xong, 326 phiếu cân không vào được kỳ khác của hợp đồng này. Khóa sau khi hai bên ký BKVC.</p>
<div style="display: flex; gap: 8px">{btn('Xác nhận kỳ', 'primary', 'check')}{btn('Khóa', 'ghost', 'lock')}</div>
<div style="display: flex; gap: 8px">{btn('In BKVC', 'dark', 'print')}{btn('Xuất gói gửi bên thuê', 'ghost', 'upload')}</div>
</div>''', 18, 'width: 400px; flex-shrink: 0')
main_content = f'''{filters}{kpis}{res_table}<div style="display: flex; gap: 14px; align-items: stretch"><div style="flex-grow: 1">{issues}</div>{side_actions}</div>'''
boards['Main.dc.html'] = page('Tính giá vận chuyển', shell('6. Tính giá vận chuyển', 'Tính giá vận chuyển', ['Nghiệp vụ', 'Tính giá vận chuyển'], main_content,
    btn('Lịch sử kỳ', 'ghost', 'history')), 1440, 900)

# ------------------------------------------------------------------ Trace drawer
steps = QS['trace']
def fv(s):
    v = s['value']
    if s['unit'] == '%': return vn(v * 100, 2) + ' %'
    d = 0 if abs(v - round(v)) < 1e-9 else 2
    return vn(v, d) + ' ' + s['unit']
groups = [('A. Đơn giá hợp đồng (danh mục giá v1)', steps[:6]), ('B. Số liệu kỳ', steps[6:10]), ('C. Chênh lệch dầu và đơn giá cuối', steps[10:])]
gh = []
n = 0
for gt, ss in groups:
    rows_h = []
    for s in ss:
        n += 1
        final = s['key'] in ('transport_price',)
        drill = f'<a href="#" style="font-size: 12px; font-weight: 600; text-decoration: none">Xem nguồn →</a>' if s.get('drill') else ''
        bg = '#EEF4F0' if final else '#FFFFFF'
        rows_h.append(f'''<div style="display: grid; grid-template-columns: 28px 1fr auto; gap: 12px; padding: 10px 12px; border-radius: 8px; background: {bg}; border: 1px solid {C['line']}">
<span style="width: 24px; height: 24px; border-radius: 50%; background: {C['side'] if final else '#ECEAE3'}; color: {'#FFFFFF' if final else C['mute']}; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center">{n}</span>
<div style="display: flex; flex-direction: column; gap: 3px; min-width: 0"><span style="font-size: 13.5px; font-weight: 600">{esc(s['label'])}</span><span style="font-size: 12px; color: {C['mute']}">{esc(s['formula'])}</span><span style="font-size: 12.5px; {MONO}; color: #33466B">{esc(s['expr'])}</span></div>
<div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px"><span style="font-size: {16 if final else 14}px; font-weight: 700; {MONO}; color: {C['greenD'] if final else C['text']}; white-space: nowrap">{fv(s)}</span>{drill}</div>
</div>''')
    gh.append(f'<div style="display: flex; flex-direction: column; gap: 8px"><h3 style="margin: 6px 0 0; font-size: 12px; font-weight: 700; color: {C["mute"]}; text-transform: uppercase; letter-spacing: 0.05em">{gt}</h3>{"".join(rows_h)}</div>')
drawer = f'''<div style="position: absolute; inset: 0; background: rgba(20,31,25,0.45); display: flex; justify-content: flex-end">
<aside aria-label="Chi tiết tính" style="width: 620px; height: 1240px; box-sizing: border-box; background: {C['bg']}; display: flex; flex-direction: column; box-shadow: -8px 0 32px rgba(0,0,0,0.18)">
<div style="padding: 20px 24px; background: #FFFFFF; border-bottom: 1px solid {C['line']}; display: flex; justify-content: space-between; align-items: flex-start">
<div style="display: flex; flex-direction: column; gap: 4px"><span style="font-size: 12px; color: {C['mute']}; font-weight: 600; letter-spacing: 0.04em">XEM CHI TIẾT TÍNH</span>
<h2 style="margin: 0; font-size: 20px; font-weight: 700">VC.007 · Xã Quế Sơn - Tiên Sa</h2>
<span style="font-size: 13px; color: {C['mute']}">Kỳ 18/09 – 23/09/2026 · HĐ HAKQN-QS · 326 chuyến · 6.143,68 tấn</span></div>
<a href="Main.dc.html" aria-label="Đóng" style="width: 36px; height: 36px; border-radius: 8px; border: 1px solid {C['line']}; display: flex; align-items: center; justify-content: center; color: {C['text']}; background: #FFFFFF">{ic('x', 18)}</a></div>
<div style="padding: 16px 24px; display: flex; flex-direction: column; gap: 12px; overflow: hidden; flex-grow: 1">{''.join(gh)}</div>
<div style="padding: 14px 24px; background: #FFFFFF; border-top: 1px solid {C['line']}; display: flex; justify-content: space-between; align-items: center">
<span style="font-size: 12.5px; color: {C['mute']}">Làm tròn: ĐG HĐ −3, đơn giá VC −2 (HALF_EVEN, như Power Query)</span>
<div style="display: flex; gap: 8px">{btn('Xuất Excel', 'ghost', 'download')}{btn('In', 'dark', 'print')}</div></div>
</aside></div>'''
boards['Trace.dc.html'] = page('Xem chi tiết tính', shell('6. Tính giá vận chuyển', 'Tính giá vận chuyển', ['Nghiệp vụ', 'Tính giá vận chuyển'], main_content, btn('Lịch sử kỳ', 'ghost', 'history'), overlay=drawer, h=1240), 1440, 1240)

# ------------------------------------------------------------------ 7. BKVC
L = QS['lines']; TOT = QS['tot']; SG = QS['sign']
brow = [[str(l['seq']), l['plate_no'], str(l['trip_count']), vn(l['kg']), vn(l['ton'], 2), vn(l['unit_price']), vn(l['amount']), vn(l['vat']), vn(l['amount_incl_vat']), ''] for l in L]
bfoot = ['', 'TỔNG CỘNG', str(TOT['trips']), vn(TOT['kg']), vn(TOT['ton'], 2), '', vn(TOT['amount']), vn(TOT['vat']), vn(TOT['total']), '']
paper = f'''<div style="width: 860px; background: #FFFFFF; box-shadow: 0 2px 12px rgba(0,0,0,0.12); padding: 30px 36px; box-sizing: border-box; font-size: 11px; display: flex; flex-direction: column; gap: 10px">
<div style="display: flex; justify-content: space-between"><div style="display: flex; flex-direction: column; gap: 2px"><b style="font-size: 12px">CÔNG TY TNHH HOÀNG ANH KHÔI QUẢNG NAM</b><span>Cụm Công nghiệp Quế Cường, Xã Quế Sơn Trung, TP. Đà Nẵng</span><span>MST: 4000956057</span></div>
<div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px; color: {C['mute']}"><span>Hợp đồng số: [SỐ HỢP ĐỒNG]</span><span>Kỳ: HAKQN-QS/20260918-20260923</span></div></div>
<div style="text-align: center; display: flex; flex-direction: column; gap: 3px; margin: 6px 0"><b style="font-size: 16px">BẢNG XÁC NHẬN KHỐI LƯỢNG VẬN CHUYỂN DĂM</b><i>( Vận chuyển từ ngày 18/09/2026 đến ngày 23/09/2026 )</i></div>
{table(['STT', 'Biển số xe', 'Số chuyến', 'Khối lượng (KG)', 'Khối lượng (Tấn)', 'Đơn giá', 'Thành tiền', 'VAT (8%)', 'Thành tiền', 'Ghi chú'], brow,
       aligns=['center', 'left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'left'], mono_cols=(1, 2, 3, 4, 5, 6, 7, 8), foot=bfoot, font=10.5)}
<div style="font-style: italic">Bằng chữ: {esc(QS['words'])}</div>
<div style="text-align: right; font-style: italic">Quế Sơn Trung, ngày 24 tháng 09 năm 2026</div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; text-align: center; margin-top: 4px">
<div style="display: flex; flex-direction: column; gap: 4px"><b>CÔNG TY TNHH HOÀNG ANH KHÔI QUẢNG NAM</b><div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr))"><span>Giám đốc</span><span>Kế toán</span></div><div style="height: 44px"></div><div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); font-weight: 700"><span>VÕ VĂN PHỤNG</span><span>TRẦN THỊ HẸN</span></div></div>
<div style="display: flex; flex-direction: column; gap: 4px"><b>CHI NHÁNH CÔNG TY TNHH HOÀNG ANH KHÔI</b><div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr))"><span>Phó Giám đốc</span><span>Kế toán</span></div><div style="height: 44px"></div><div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); font-weight: 700"><span>VÕ THỊ NHƯ NGỌC</span><span>DƯƠNG THỊ THANH NGA</span></div></div>
</div></div>'''
bk_side = card(f'''<div style="display: flex; flex-direction: column; gap: 14px">
<h2 style="margin: 0; font-size: 15px; font-weight: 700">Thiết lập in</h2>
{field('Kỳ tính', 'HAKQN-QS/20260918-20260923', None, True)}
{field('Ngày ký', '24/09/2026', None, True, 'calendar')}
{field('Số hợp đồng', '[tự điền]', None)}
<div style="display: flex; flex-direction: column; gap: 6px; font-size: 13px"><span style="font-size: 12px; font-weight: 600; color: {C['mute']}; text-transform: uppercase; letter-spacing: 0.04em">Người ký (theo thứ tự đơn vị)</span>
<span>HAKQN · <b>Võ Văn Phụng</b> – Giám đốc</span><span>CN Quế Sơn · <b>Võ Thị Như Ngọc</b> – Phó Giám đốc</span></div>
<div style="padding: 10px 12px; border-radius: 8px; background: #F3EFE4; font-size: 12.5px; line-height: 1.5">Tiền làm tròn đến đồng từng dòng · VAT 8% · tổng = cộng các dòng. So với file Excel: VAT và tổng lệch 0,2 đồng.</div>
<div style="display: flex; flex-direction: column; gap: 8px">{btn('In', 'dark', 'print')}{btn('Xuất PDF', 'primary', 'download')}{btn('Xuất Excel', 'ghost', 'download')}</div>
</div>''', 18, 'width: 330px; flex-shrink: 0; align-self: flex-start')
bk_content = f'<div style="display: flex; gap: 20px; overflow: hidden; flex-grow: 1"><div style="flex-grow: 1; display: flex; justify-content: center; overflow: hidden; padding: 4px 0">{paper}</div>{bk_side}</div>'
boards['BKVC.dc.html'] = page('Bảng xác nhận khối lượng', shell('7. Bảng xác nhận khối lượng', 'Bảng xác nhận khối lượng', ['Nghiệp vụ', 'Bảng xác nhận khối lượng'], bk_content,
    tag('Kỳ đã xác nhận', 'green'), h=1060), 1440, 1060)

# ------------------------------------------------------------------ 1. Dashboard
dash_f = card(f'''<div style="display: flex; gap: 14px; align-items: flex-end">{field('Từ ngày', '18/09/2026', 160, True, 'calendar')}{field('Đến ngày', '23/09/2026', 160, True, 'calendar')}{field('Mã tuyến', 'Tất cả', 220, icon='route')}{field('Đơn vị vận chuyển / hợp đồng', 'Tất cả hợp đồng của HAKQN', None, icon='contract')}{btn('Lọc', 'primary')}</div>''', 16)
dg = f'''<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px">
{stat('Tổng số chuyến', '326', 'chuyến', '17 xe · 18–23/09/2026')}
{stat('Tổng khối lượng', '6.143,68', 'tấn', '6.143.680 kg')}
{stat('Dầu thực nhận', '5.853', 'lít', 'bảng kê CN Quế Sơn → HAKQN')}
{stat('Dầu định mức', '18.777,6', 'lít', '144 km × 326 × 0,4')}
{stat('Chênh lệch dầu', '+12.924,6', 'lít', 'thiếu so với định mức → bù vào giá')}
{stat('Đơn giá VC bình quân', '178.000', 'đ/tấn', 'bình quân gia quyền theo tấn', True)}
{stat('Số tuyến', '1', 'tuyến', 'VC.007')}
{stat('Phiếu chưa tính / lỗi', '0 / 0', '', '6 phiếu có cảnh báo qua đêm')}
</div>'''
ctr = table(['Hợp đồng', 'Vai trò bản cài', 'Kỳ gần nhất', 'Chuyến', 'Tấn', 'Đơn giá VC', 'Trạng thái'],
    [['HAKQN-QS', 'Bên vận chuyển', '18–23/09/2026', '326', '6.143,68', '178.000', tag('Nháp', 'orange')],
     ['DH-HAKQN', 'Bên thuê (chỉ xem)', '18–23/09/2026', '77', '1.452,13', '88.900', tag('Đã nhận gói', 'blue')],
     ['HAK-HAKQN', 'Bên thuê (chỉ xem)', '—', '—', '—', '—', tag('Chưa nhận gói', 'gray')]],
    aligns=['left', 'left', 'left', 'right', 'right', 'right', 'left'], mono_cols=(0, 3, 4, 5))
dash_c = f'''{dash_f}{dg}<div style="display: flex; gap: 14px">
{card('<h2 style="margin: 0 0 12px; font-size: 15px; font-weight: 700">Hợp đồng và kỳ tính</h2>' + ctr, 18, 'flex-grow: 1')}
{card(f"""<div style="display: flex; flex-direction: column; gap: 10px; font-size: 13px"><h2 style="margin: 0; font-size: 15px; font-weight: 700">Việc cần làm</h2>
<div style="display: flex; gap: 8px; align-items: flex-start"><span style="color: #7A4E15; display: flex">{ic('alert', 16)}</span><span>Kỳ HAKQN-QS 18–23/09 đang <b>nháp</b> — xác nhận để in BKVC</span></div>
<div style="display: flex; gap: 8px; align-items: flex-start"><span style="color: #33466B; display: flex">{ic('swap', 16)}</span><span>Chưa nhận gói kỳ tính của <b>HAK</b> (HĐ HAK-HAKQN)</span></div>
<div style="display: flex; gap: 8px; align-items: flex-start"><span style="color: {C['greenD']}; display: flex">{ic('db', 16)}</span><span>Sao lưu gần nhất 23:00 · đã chép sang thư mục ngoài</span></div></div>""", 18, 'width: 400px; flex-shrink: 0')}</div>'''
boards['Dashboard.dc.html'] = page('Dashboard', shell('1. Dashboard', 'Tổng quan', ['Tổng quan'], dash_c, btn('Tính giá kỳ mới', 'primary', 'calc')), 1440, 900)

# ------------------------------------------------------------------ Import (bản ĐH)
fuel = D['dh']['fuel']
irows = []
for i, f in enumerate(fuel, 1):
    flags = [x for x in f['validation_flags'].split(';') if x]
    if not flags: st = tag('OK', 'green')
    elif f['flags_ack']: st = tag('Đã xác nhận không trùng', 'blue')
    else: st = tag({'W_BEFORE_PERIOD': 'Nhận trước kỳ', 'W_PLATE_FORMAT': 'Mã xe khác chuẩn', 'W_POSSIBLE_DUPLICATE': 'Nghi trùng'}[flags[0]], 'orange')
    raw = f['fuel_vehicle_code']
    raws = raw.replace(' ', '␣') if raw.startswith(' ') else raw
    irows.append([str(i + 2), dmy(f['receive_date']), raws, f['plate_no'], vn(f['qty_liter'], 2), vn(f['fuel_price_excl_vat']), dmy(f['purchase_date']), 'HAKQN', st])
SRCPATH = 'D:\\DGVC\\nhan\\Dongiavanchuyen_24.09_DH.xlsx'
F_SRC = field('File nguồn', SRCPATH, None, icon='upload')
imp_top = card(f'''<div style="display: flex; gap: 14px; align-items: flex-end">
{F_SRC}
{field('Sheet', 'NL_GIAONHANDAU', 200)}
{field('Hợp đồng (bảng kê của)', 'DH-HAKQN · ĐH → HAKQN', 260, icon='contract')}
{btn('Chọn file khác', 'ghost')}</div>''', 16)
mapping = card(f'''<h2 style="margin: 0 0 12px; font-size: 15px; font-weight: 700">Ghép cột (tự nhận)</h2>
<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; font-size: 12.5px">
{''.join(f'<div style="display: flex; justify-content: space-between; padding: 8px 10px; border: 1px solid {C["line"]}; border-radius: 8px"><span>{a}</span><span style="{MONO}; color: {C["greenD"]}">{b}</span></div>' for a, b in [('Ngày nhận dầu', 'receive_date'), ('Mã cự ly VC', 'route_code'), ('Biển số xe', 'fuel_vehicle_code'), ('ĐVT', 'uom'), ('Số lượng (lít)', 'qty_liter'), ('Đơn giá dầu', 'fuel_price_excl_vat'), ('Ngày mua dầu', 'purchase_date'), ('Đơn vị', 'giver_unit_code')])}
</div>''', 16)
summ = f'''<div style="display: flex; gap: 10px; align-items: center">{tag('16 dòng', 'gray')}{tag('11 hợp lệ', 'green')}{tag('3 cảnh báo', 'orange')}{tag('2 đã xác nhận', 'blue')}{tag('0 lỗi', 'green')}
<span style="font-size: 12.5px; color: {C['mute']}; margin-left: 8px">Tổng 5.734,69 lít · ␣ = dấu cách thừa đầu mã xe (đã tự bỏ)</span></div>'''
imp_tbl = card(f'''<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px"><h2 style="margin: 0; font-size: 15px; font-weight: 700">Xem trước dữ liệu</h2>{summ}</div>
{table(['Dòng', 'Ngày nhận', 'Mã xe trong file', 'Biển số quy đổi', 'Số lít', 'Đơn giá (chưa VAT)', 'Ngày mua', 'Bên giao', 'Kiểm tra'], irows,
       aligns=['center', 'left', 'left', 'left', 'right', 'right', 'left', 'left', 'left'], mono_cols=(2, 3, 4, 5), font=12)}''', 16, 'overflow: hidden')
imp_c = f'''{imp_top}{mapping}{imp_tbl}'''
boards['Import.dc.html'] = page('Import bảng kê dầu', shell('3. Giao nhận dầu', 'Import bảng kê giao nhận dầu', ['Giao nhận dầu', 'Import từ Excel'], imp_c,
    btn('Hủy', 'ghost') + btn('Xác nhận import 16 dòng', 'primary', 'check'), unit='DH', user='ketoan.dh', role='KẾ TOÁN', h=1180), 1440, 1180)

# ------------------------------------------------------------------ Trao đổi (HAKQN nhận gói ĐH)
EX = D['exchange']; cnt = EX['counts']
names = dict(HOP_DONG='Hợp đồng', HOP_DONG_XE='Xe của hợp đồng', PHIEU_CAN='Phiếu cân', GIAO_NHAN_DAU='Dòng dầu (bảng kê ĐH)', KY_TINH='Kỳ tính',
             TRANSPORT_CALCULATION='Kết quả tính', TRANSPORT_DETAIL='Chi tiết phiếu của kỳ', FUEL_DETAIL='Chi tiết dầu của kỳ', BKVC_LINE='Dòng bảng xác nhận')
erows = [[names[k], str(v['new']), str(v['same']), str(v['conflict']), (tag('Thêm mới', 'green') if v['new'] else tag('Đã có — bỏ qua', 'gray'))] for k, v in cnt.items()]
ex_head = card(f'''<div style="display: flex; gap: 24px; align-items: center">
<div style="width: 56px; height: 56px; border-radius: 12px; background: #E4E9F2; color: #33466B; display: flex; align-items: center; justify-content: center">{ic('swap', 26)}</div>
<div style="display: flex; flex-direction: column; gap: 4px; flex-grow: 1"><span style="font-size: 12px; font-weight: 600; color: {C['mute']}; letter-spacing: 0.04em">GÓI KỲ TÍNH · .dgvc</span>
<span style="font-size: 17px; font-weight: 700">DH-HAKQN_20260918-20260923.dgvc</span>
<span style="font-size: 13px; color: {C['mute']}">Từ bản cài <b>Đại Hiệp</b> ({EX['header']['sourceInstallId']}) · lập bởi ketoan.dh · 24/09/2026 23:00 · 12,6 KB</span></div>
<div style="display: flex; flex-direction: column; gap: 6px; align-items: flex-end">{tag('Toàn vẹn SHA-256: khớp', 'green')}{tag('Bản cài này là BÊN THUÊ', 'blue')}</div></div>''', 18)
ex_sum = f'''<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px">
{stat('Kỳ', 'DH-HAKQN', '', '18/09 – 23/09/2026 · đã xác nhận')}
{stat('Số chuyến / tấn', '77', 'chuyến', '1.452,13 tấn')}
{stat('Đơn giá vận chuyển', '88.900', 'đ/tấn', 'chênh lệch dầu −1.299,49 lít', True)}
{stat('Tổng thanh toán', '139.421.905', 'đ', 'đã gồm VAT 8%')}</div>'''
ex_tbl = card(f'''<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px"><h2 style="margin: 0; font-size: 15px; font-weight: 700">So với dữ liệu hiện có</h2>{tag('0 xung đột', 'green')}</div>
{table(['Dữ liệu', 'Mới', 'Đã có (giống)', 'Xung đột', 'Xử lý'], erows, aligns=['left', 'right', 'right', 'right', 'left'], mono_cols=(1, 2, 3))}
<p style="margin: 12px 0 0; font-size: 12.5px; color: {C['mute']}">77 phiếu cân của xe ĐH đã có sẵn ở bản HAKQN với cùng mã phiếu → không tạo trùng. Kỳ nhập về ở chế độ <b>chỉ xem</b>, in lại BKVC được.</p>''', 18)
ex_c = f'{ex_head}{ex_sum}{ex_tbl}'
boards['Exchange.dc.html'] = page('Nhận gói kỳ tính', shell('Trao đổi dữ liệu', 'Nhận gói kỳ tính từ bên vận chuyển', ['Trao đổi dữ liệu', 'Nhập gói'], ex_c,
    btn('Hủy', 'ghost') + btn('Nhập gói', 'primary', 'download')), 1440, 900)

# ------------------------------------------------------------------ Login
login = f'''<div style="width: 1440px; height: 900px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); background: {C['bg']}">
<div style="background: {C['side']}; padding: 64px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between">
<div style="display: flex; align-items: center; gap: 12px"><div style="width: 44px; height: 44px; border-radius: 12px; background: {C['accent']}; color: {C['side']}; display: flex; align-items: center; justify-content: center; font-weight: 700">VC</div><span style="color: #FFFFFF; font-weight: 700; font-size: 18px">Đơn giá vận chuyển dăm</span></div>
<div style="display: flex; flex-direction: column; gap: 16px"><h1 style="margin: 0; color: #FFFFFF; font-size: 40px; line-height: 1.15; font-weight: 700">Phiếu cân → dầu → định mức<br>→ đơn giá → bảng xác nhận.</h1>
<p style="margin: 0; color: #B9C3BC; font-size: 16px; line-height: 1.6; max-width: 480px">Chạy offline trên máy. Mọi đơn giá đều xem lại được từng bước tính, từng phiếu cân và từng dòng dầu.</p></div>
<div style="display: flex; flex-direction: column; gap: 4px; color: #9DA8A0; font-size: 13px"><span>Bản cài: <b style="color: {C['accent']}">HAKQN</b> · Công ty TNHH Hoàng Anh Khôi Quảng Nam</span><span style="{MONO}">Dữ liệu: C:\\Users\\ketoan\\Documents\\DGVC_DATA · phiên bản 1.0.0</span></div></div>
<div style="display: flex; align-items: center; justify-content: center">
{card(f"""<form style="width: 400px; display: flex; flex-direction: column; gap: 18px">
<div style="display: flex; flex-direction: column; gap: 6px"><h2 style="margin: 0; font-size: 24px; font-weight: 700">Đăng nhập</h2><span style="font-size: 14px; color: {C['mute']}">Tài khoản nội bộ của bản cài này</span></div>
{field('Tên đăng nhập', 'phuthuy.apple@gmail.com', None, icon='user')}
{field('Mật khẩu', '••••••••••', None, icon='lock')}
<div style="padding: 10px 12px; border-radius: 8px; background: #F7EAD9; color: #7A4E15; font-size: 13px; line-height: 1.45">Tài khoản chưa có mật khẩu — đặt mật khẩu lần đầu (tối thiểu 8 ký tự, có chữ và số).</div>
<button type="submit" style="height: 44px; border-radius: 8px; border: 0; background: {C['green']}; color: #FFFFFF; font-family: inherit; font-size: 15px; font-weight: 700; cursor: pointer">Đặt mật khẩu và đăng nhập</button>
<span style="font-size: 12.5px; color: {C['mute']}; text-align: center">Quên mật khẩu? Liên hệ ADMIN của đơn vị để đặt lại.</span>
</form>""", 36)}</div></div>'''
boards['Login.dc.html'] = page('Đăng nhập', login, 1440, 900)

# ------------------------------------------------------------------ write
for name, html in boards.items():
    open(f'{ROOT}/project/{name}', 'w').write(html)
order = ['Login.dc.html', 'Dashboard.dc.html', 'Main.dc.html', 'Trace.dc.html', 'BKVC.dc.html', 'Import.dc.html', 'Exchange.dc.html']
titles = {'Login.dc.html': 'Đăng nhập (lần đầu)', 'Dashboard.dc.html': '1. Dashboard', 'Main.dc.html': '6. Tính giá vận chuyển',
          'Trace.dc.html': 'Xem chi tiết tính', 'BKVC.dc.html': '7. Bảng xác nhận khối lượng', 'Import.dc.html': '3. Import bảng kê dầu (bản ĐH)',
          'Exchange.dc.html': 'Trao đổi: nhận gói kỳ tính (bản HAKQN)'}
H = {'Trace.dc.html': 1240, 'BKVC.dc.html': 1060, 'Import.dc.html': 1180}
rows_layout = [['Login.dc.html', 'Dashboard.dc.html', 'Main.dc.html'], ['Trace.dc.html', 'BKVC.dc.html'], ['Import.dc.html', 'Exchange.dc.html']]
pos = {}; y = 0
for r in rows_layout:
    for col, n in enumerate(r):
        pos[n] = dict(x=col * (1440 + 80), y=y, w=1440, h=H.get(n, 900), title=titles[n])
    y += max(H.get(n, 900) for n in r) + 120
canvas = {"v": 3, "createdOnFiles": {"v": 1, "at": dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')},
          "title": "Giao diện phần mềm Đơn giá vận chuyển dăm", "launch": {"view": "canvas"}, "pages": [],
          "boards": pos, "order": order,
          "notes": {"flow": {"x": 0, "y": -300, "text": "Phần mềm Đơn giá vận chuyển dăm — màn hình chính (số liệu thật kỳ 18–23/09/2026)", "kind": "title1", "maxW": 4480}},
          "designSystems": []}
json.dump(canvas, open(f'{ROOT}/project/canvas.json', 'w'), ensure_ascii=False, indent=1)
print('written', list(boards), ROOT)
