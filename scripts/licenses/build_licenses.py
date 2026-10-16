#!/usr/bin/env python3
"""設定 > このアプリについて > ライセンス に出す一覧を作る（SPEC 2.1-7）。
package.json の dependencies（アプリに入るもの）と、仕様の参考にした公開 OSS を並べる。
使い方：python3 scripts/licenses/build_licenses.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
pkg = json.loads((ROOT / 'package.json').read_text())
out = []
for name in sorted(pkg['dependencies']):
    p = ROOT / 'node_modules' / name / 'package.json'
    if not p.exists():
        continue
    d = json.loads(p.read_text())
    lic = d.get('license') or (d.get('licenses') or [{}])[0].get('type') or '不明'
    out.append({'name': name, 'version': d.get('version', ''), 'license': lic, 'use': 'アプリに入っている'})
# 仕様の参考にしたもの（コードは入れていない）
out.append({'name': 'atem-connection', 'version': '3.10.3', 'license': 'MIT', 'use': 'ATEM の通信手順の参考（コードは入れていない）'})
(ROOT / 'src' / 'licenses.json').write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(len(out), 'entries')
