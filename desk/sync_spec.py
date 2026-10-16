"""Đồng bộ api_spec.py → desk/api_spec.json, app/shared/api_spec.json, docs/api_spec.json (giữ nguyên version/transport/envelope)."""
import json, importlib, sys
sys.path.insert(0, '/home/claude/desk'); import api_spec as S
for p in ['/home/claude/desk/api_spec.json', '/home/claude/app/shared/api_spec.json', '/home/claude/docs/api_spec.json']:
    d = json.load(open(p))
    d['actions'] = S.EP
    d['errors'] = [dict(code=c, level=h, meaning=m) for c, h, m in S.ERRORS] if len(S.ERRORS[0]) == 3 else d['errors']
    d['issues'] = [dict(code=c, level=l, message=m, usedIn=u) for c, l, m, u in S.ISSUES]
    json.dump(d, open(p, 'w'), ensure_ascii=False, indent=1)
    print(p, len(d['actions']), len(d['issues']))
