"""Đồng bộ hoặc kiểm tra ba bản JSON của đặc tả API Electron."""
import argparse
import json
from pathlib import Path

import api_spec as source

ROOT = Path(__file__).resolve().parent.parent
PATHS = (ROOT / "app/shared/api_spec.json", ROOT / "desk/api_spec.json", ROOT / "docs/api_spec.json")


def preserve_order(current, entries, key):
    """Giữ thứ tự đang công bố và thêm mục mới theo thứ tự trong nguồn."""
    by_key = {entry[key]: entry for entry in entries}
    if len(by_key) != len(entries):
        raise ValueError(f"Trùng {key} trong nguồn đặc tả")
    order = dict.fromkeys([entry[key] for entry in current] + list(by_key))
    return [by_key[name] for name in order if name in by_key]


def build_spec(current):
    sections = {
        "actions": ("action", source.EP),
        "errors": ("code", [dict(code=c, level=l, meaning=m) for c, l, m in source.ERRORS]),
        "issues": ("code", [dict(code=c, level=l, message=m, usedIn=u) for c, l, m, u in source.ISSUES]),
    }
    return {
        **current,
        **{name: preserve_order(current[name], entries, key) for name, (key, entries) in sections.items()},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Báo bản JSON lệch nguồn và trả mã lỗi")
    args = parser.parse_args()
    current = json.loads(PATHS[0].read_text(encoding="utf-8"))
    rendered = json.dumps(build_spec(current), ensure_ascii=False, indent=1)
    if args.check:
        expected = json.loads(rendered)
        stale = [
            path.relative_to(ROOT).as_posix()
            for path in PATHS
            if not path.exists() or json.loads(path.read_text(encoding="utf-8")) != expected
        ]
        if stale:
            parser.exit(1, "Đặc tả API lệch nguồn: " + ", ".join(stale) + ". Chạy python3 desk/sync_spec.py.\n")
    else:
        for path in PATHS:
            with path.open("w", encoding="utf-8", newline="\n") as output:
                output.write(rendered)


if __name__ == "__main__":
    main()
