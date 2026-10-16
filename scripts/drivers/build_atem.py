#!/usr/bin/env python3
"""Blackmagic ATEM（LAN）のドライバ定義（JSON）を作る（SPEC 7.1・8.3）。

コマンドの組み立てと解析はアプリ組み込みの通信手順 atem（src/drivers/atem.ts）が行い、
この定義は「どの動作・状態表示・変数・プリセットがあるか」だけを持つ。
根拠：公開 OSS「atem-connection」（MIT）。手で JSON を直さず、このスクリプトを直して再生成する。
使い方：python3 scripts/drivers/build_atem.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'src' / 'drivers' / 'defs' / 'atem.json'

INPUTS = 20
SOURCES = [{'id': '0', 'label': 'ブラック'}] + [{'id': str(n), 'label': f'入力 {n}'} for n in range(1, INPUTS + 1)] + [
    {'id': '1000', 'label': 'カラーバー'},
    {'id': '2001', 'label': 'カラー 1'},
    {'id': '2002', 'label': 'カラー 2'},
    {'id': '3010', 'label': 'メディアプレーヤー 1'},
    {'id': '3020', 'label': 'メディアプレーヤー 2'},
]
MES = [{'id': str(i), 'label': f'M/E {i + 1}'} for i in range(4)]
ME_FIELD = {'id': 'me', 'label': 'M/E', 'type': 'select', 'default': '0', 'choices': MES}
SRC_FIELD = {'id': 'input', 'label': '入力', 'type': 'select', 'default': '1', 'choices': SOURCES}

actions = [
    {'id': 'pgm', 'name': 'PGM を選ぶ', 'options': [SRC_FIELD, ME_FIELD], 'send': {'kind': 'builtin', 'name': 'atem.pgm'}, 'summary': 'PGM {{option.input}}'},
    {'id': 'pvw', 'name': 'PVW（プレビュー）を選ぶ', 'options': [SRC_FIELD, ME_FIELD], 'send': {'kind': 'builtin', 'name': 'atem.pvw'}, 'summary': 'PVW {{option.input}}'},
    {'id': 'cut', 'name': 'CUT', 'options': [ME_FIELD], 'send': {'kind': 'builtin', 'name': 'atem.cut'}, 'summary': 'CUT {{option.me}}'},
    {'id': 'auto', 'name': 'AUTO', 'options': [ME_FIELD], 'send': {'kind': 'builtin', 'name': 'atem.auto'}, 'summary': 'AUTO {{option.me}}'},
    {'id': 'ftb', 'name': 'FTB（フェード・トゥ・ブラック）', 'options': [ME_FIELD], 'send': {'kind': 'builtin', 'name': 'atem.ftb'}, 'summary': 'FTB {{option.me}}'},
    {'id': 'dsk', 'name': 'DSK を ON / OFF', 'options': [
        {'id': 'dsk', 'label': 'DSK', 'type': 'select', 'default': '1', 'choices': [{'id': '1', 'label': 'DSK 1'}, {'id': '2', 'label': 'DSK 2'}]},
        {'id': 'onAir', 'label': '状態', 'type': 'select', 'default': 'on', 'choices': [{'id': 'on', 'label': 'ON'}, {'id': 'off', 'label': 'OFF'}]},
    ], 'send': {'kind': 'builtin', 'name': 'atem.dsk'}, 'summary': '{{option.dsk}} {{option.onAir}}'},
    {'id': 'aux', 'name': 'AUX の出力を選ぶ', 'options': [
        {'id': 'aux', 'label': 'AUX 番号', 'type': 'number', 'default': 1, 'min': 1, 'max': 24},
        SRC_FIELD,
    ], 'send': {'kind': 'builtin', 'name': 'atem.aux'}, 'summary': 'AUX {{option.aux}} ← {{option.input}}'},
    {'id': 'macro', 'name': 'マクロを実行', 'options': [
        {'id': 'n', 'label': 'マクロ番号（1 から）', 'type': 'number', 'default': 1, 'min': 1, 'max': 100},
    ], 'send': {'kind': 'builtin', 'name': 'atem.macro'}, 'summary': 'マクロ {{option.n}}'},
]

feedbacks = [
    {'id': 'pgm_is', 'name': 'PGM が入力（M/E 1）', 'options': [SRC_FIELD], 'compare': {'variable': 'pgm', 'op': 'eq', 'value': '{{option.input}}'}, 'summary': 'PGM が {{option.input}}'},
    {'id': 'pvw_is', 'name': 'PVW が入力（M/E 1）', 'options': [SRC_FIELD], 'compare': {'variable': 'pvw', 'op': 'eq', 'value': '{{option.input}}'}, 'summary': 'PVW が {{option.input}}'},
    {'id': 'tally', 'name': 'タリー', 'options': [
        SRC_FIELD,
        {'id': 'state', 'label': '状態', 'type': 'select', 'default': 'PGM', 'choices': [{'id': 'PGM', 'label': 'PGM'}, {'id': 'PST', 'label': 'PVW'}]},
    ], 'compare': {'variable': 'tally_{{option.input}}', 'op': 'contains', 'value': '{{option.state}}'}, 'summary': '{{option.input}} が {{option.state}}'},
    {'id': 'ftb_on', 'name': 'FTB 中（M/E 1）', 'options': [], 'compare': {'variable': 'ftb', 'op': 'eq', 'value': 'ON'}, 'summary': 'FTB 中'},
    {'id': 'dsk_on', 'name': 'DSK が ON', 'options': [
        {'id': 'dsk', 'label': 'DSK', 'type': 'select', 'default': '1', 'choices': [{'id': '1', 'label': 'DSK 1'}, {'id': '2', 'label': 'DSK 2'}]},
    ], 'compare': {'variable': 'dsk_{{option.dsk}}', 'op': 'eq', 'value': 'ON'}, 'summary': 'DSK {{option.dsk}} が ON'},
]

variables = [
    {'id': 'model', 'name': '機種名'},
    {'id': 'pgm', 'name': 'PGM の入力（M/E 1、番号）'},
    {'id': 'pvw', 'name': 'PVW の入力（M/E 1、番号）'},
    {'id': 'ftb', 'name': 'FTB（ON / OFF）'},
] + [{'id': f'input_{n}_name', 'name': f'入力 {n} の名前'} for n in range(1, INPUTS + 1)] + [
    {'id': f'tally_{n}', 'name': f'入力 {n} のタリー'} for n in range(1, INPUTS + 1)
]

presets = []
for n in range(1, 9):
    presets.append({'id': f'pgm{n}', 'category': 'PGM', 'name': f'PGM 入力 {n}', 'text': f'PGM\n$(this:name)', 'backgroundColor': '#2A2A2E',
                    'action': {'definitionId': 'pgm', 'options': {'input': str(n), 'me': '0'}},
                    'feedbacks': [{'definitionId': 'pgm_is', 'options': {'input': str(n)}, 'backgroundColor': '#E0302B'}]})
for n in range(1, 9):
    presets.append({'id': f'pvw{n}', 'category': 'PVW', 'name': f'PVW 入力 {n}', 'text': f'PVW\n$(this:name)', 'backgroundColor': '#2A2A2E',
                    'action': {'definitionId': 'pvw', 'options': {'input': str(n), 'me': '0'}},
                    'feedbacks': [{'definitionId': 'pvw_is', 'options': {'input': str(n)}, 'backgroundColor': '#1F9E48'}]})
presets += [
    {'id': 'cut', 'category': 'トランジション', 'name': 'CUT', 'text': 'CUT', 'backgroundColor': '#E9E9EC', 'action': {'definitionId': 'cut', 'options': {'me': '0'}}},
    {'id': 'auto', 'category': 'トランジション', 'name': 'AUTO', 'text': 'AUTO', 'backgroundColor': '#F2C200', 'action': {'definitionId': 'auto', 'options': {'me': '0'}}},
    {'id': 'ftb', 'category': 'トランジション', 'name': 'FTB', 'text': 'FTB', 'backgroundColor': '#050505', 'action': {'definitionId': 'ftb', 'options': {'me': '0'}},
     'feedbacks': [{'definitionId': 'ftb_on', 'options': {}, 'backgroundColor': '#6E1616'}]},
]
# 入力名をボタンの文字に出すため、プリセットの $(this:name) は buttonFromPreset がボタン変数として入れる
for p in presets:
    if '$(this:name)' in p['text']:
        n = p['action']['options']['input']
        p['localVariables'] = [{'name': 'name', 'kind': 'value', 'value': f'$(DEVICE:input_{n}_short)'}]

definition = {
    'format': 1,
    'id': 'atem',
    'name': 'Blackmagic ATEM',
    'category': '映像スイッチャー',
    'version': '1.0.0',
    'minAppVersion': '0.5.0',
    'transport': 'udp',
    'session': 'atem',
    'configFields': [
        {'id': 'host', 'label': 'IP アドレス', 'type': 'text', 'placeholder': '192.168.10.240', 'pattern': '^[A-Za-z0-9.:\\-]+$', 'mono': True},
        {'id': 'port', 'label': 'ポート', 'type': 'number', 'default': 9910, 'min': 1, 'max': 65535},
    ],
    'actions': actions,
    'feedbacks': feedbacks,
    'variables': variables,
    'presets': presets,
    'evidence': [
        {'title': 'atem-connection（MIT、npm 3.10.3）：接続の手順・ack・CPgI / CPvI / DCut / DAut / FtbA / MAct / CDsL / CAuS、PrgI / PrvI / TlSr / InPr / FtbS / DskS / AuxS / _pin / InCm',
         'url': 'https://www.npmjs.com/package/atem-connection', 'status': '確認済', 'note': '公開 OSS の実装に合わせた。公式アプリの通信は見ていない'},
        {'title': '実機での確認', 'status': '不明', 'note': 'この定義はまだ実機で通していない。機器の画面の「最近のログ」（詳細）で送受信を確かめる'},
        {'title': 'DSK の AUTO（DDsA）は本体の版で中身が変わるので入れていない', 'status': '確認済'},
    ],
}

OUT.write_text(json.dumps(definition, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('wrote', OUT.relative_to(OUT.parents[3]))
