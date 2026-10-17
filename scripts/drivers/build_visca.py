#!/usr/bin/env python3
"""VISCA over IP の PTZ カメラのドライバ定義（JSON）を作る（SPEC 7.1・8.8）。

頭（種別・長さ・通し番号）はアプリ組み込みの通信手順 visca-ip（src/drivers/visca.ts）が付ける。
根拠：Sony の VISCA コマンド一覧（ILME-FR7 VISCA command list、公開）。命令の中身はメーカー共通の VISCA【他社のカメラは推測】。
手で JSON を直さず、このスクリプトを直して再生成する。
使い方：python3 scripts/drivers/build_visca.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'src' / 'drivers' / 'defs' / 'visca-ip.json'


def sel(id_, label, pairs, default=None):
    return {'id': id_, 'label': label, 'type': 'select', 'default': default if default is not None else pairs[0][0],
            'choices': [{'id': i, 'label': l} for i, l in pairs]}


def num(id_, label, default, lo, hi, help_=None):
    f = {'id': id_, 'label': label, 'type': 'number', 'default': default, 'min': lo, 'max': hi}
    if help_:
        f['help'] = help_
    return f


def act(id_, name, options, data, summary=None):
    a = {'id': id_, 'name': name, 'options': options, 'send': {'kind': 'bytes', 'data': data, 'encoding': 'hex'}}
    if summary:
        a['summary'] = summary
    return a


PAN = num('pan', 'パンの速さ（1–24）', 8, 1, 24)
TILT = num('tilt', 'チルトの速さ（1–20）', 8, 1, 20)
SPEED = '{{option.pan|hexu|pad2}} {{option.tilt|hexu|pad2}}'
DIRS = [
    ('up', '上', '03 01'), ('down', '下', '03 02'), ('left', '左', '01 03'), ('right', '右', '02 03'),
    ('upleft', '左上', '01 01'), ('upright', '右上', '02 01'), ('downleft', '左下', '01 02'), ('downright', '右下', '02 02'),
]
ZSPEED = num('speed', '速さ（0–7）', 4, 0, 7, '0 がいちばん遅い')
PRESET = num('n', 'プリセット番号（1–64）', 1, 1, 64)

actions = [
    act('move', 'パン・チルト', [sel('dir', '向き', [(c, l) for c, l, _ in DIRS]), PAN, TILT],
        '81 01 06 01 ' + SPEED + ' {{option.dir|map}} FF', summary='パン・チルト {{option.dir}}'),
    act('stop', 'パン・チルトを止める', [], '81 01 06 01 01 01 03 03 FF'),
    act('home', 'ホームへ', [], '81 01 06 04 FF'),
    act('zoom_in', 'ズームイン', [ZSPEED], '81 01 04 07 2{{option.speed}} FF'),
    act('zoom_out', 'ズームアウト', [ZSPEED], '81 01 04 07 3{{option.speed}} FF'),
    act('zoom_stop', 'ズームを止める', [], '81 01 04 07 00 FF'),
    act('focus_far', 'フォーカス 遠く', [ZSPEED], '81 01 04 08 2{{option.speed}} FF'),
    act('focus_near', 'フォーカス 近く', [ZSPEED], '81 01 04 08 3{{option.speed}} FF'),
    act('focus_stop', 'フォーカスを止める', [], '81 01 04 08 00 FF'),
    act('focus_auto', 'オートフォーカス', [], '81 01 04 38 02 FF'),
    act('focus_manual', 'マニュアルフォーカス', [], '81 01 04 38 03 FF'),
    act('preset_recall', 'プリセットを呼び出す', [PRESET], '81 01 04 3F 02 {{option.n|lin:1:-1|hexu|pad2}} FF', summary='プリセット {{option.n}}'),
    act('preset_set', 'プリセットに記憶', [PRESET], '81 01 04 3F 01 {{option.n|lin:1:-1|hexu|pad2}} FF'),
    act('preset_reset', 'プリセットを消す', [PRESET], '81 01 04 3F 00 {{option.n|lin:1:-1|hexu|pad2}} FF'),
    act('power_on', '電源を入れる', [], '81 01 04 00 02 FF'),
    act('power_off', 'スタンバイ', [], '81 01 04 00 03 FF'),
    {'id': 'command', 'name': '命令を送る（16 進）',
     'options': [{'id': 'hex', 'label': 'VISCA の命令（16 進）', 'type': 'text', 'placeholder': '81 01 06 04 FF', 'pattern': '^8[0-9A-Fa-f]( ?[0-9A-Fa-f]{2})* ?[Ff][Ff]$', 'mono': True}],
     'send': {'kind': 'bytes', 'data': '{{option.hex}}', 'encoding': 'hex'}, 'summary': '{{option.hex}}'},
]
actions[0]['maps'] = {'dir': {c: v for c, _, v in DIRS}}

presets = [
    {'id': f'move_{c}', 'category': 'パン・チルト', 'name': l, 'text': l, 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'move', 'options': {'dir': c, 'pan': 8, 'tilt': 8}}}
    for c, l, _ in DIRS[:4]
] + [
    {'id': 'stop', 'category': 'パン・チルト', 'name': '止める', 'text': 'STOP', 'backgroundColor': '#2A2A2E', 'action': {'definitionId': 'stop', 'options': {}}},
    {'id': 'home', 'category': 'パン・チルト', 'name': 'ホーム', 'text': 'HOME', 'backgroundColor': '#2A2A2E', 'action': {'definitionId': 'home', 'options': {}}},
] + [
    {'id': f'p{n}', 'category': 'プリセット', 'name': f'プリセット {n}', 'text': f'PRESET\n{n}', 'backgroundColor': '#1F5FD6',
     'action': {'definitionId': 'preset_recall', 'options': {'n': n}}}
    for n in range(1, 9)
]

definition = {
    'format': 1,
    'id': 'visca-ip',
    'name': 'PTZ カメラ（VISCA over IP）',
    'category': 'カメラ',
    'version': '1.0.0',
    'minAppVersion': '0.6.0',
    'transport': 'udp',
    'session': 'visca-ip',
    'configFields': [
        {'id': 'host', 'label': 'IP アドレス', 'type': 'text', 'placeholder': '192.168.0.100', 'pattern': '^[A-Za-z0-9.:\\-]+$', 'mono': True},
        {'id': 'port', 'label': 'ポート', 'type': 'number', 'default': 52381, 'min': 1, 'max': 65535},
        {'id': 'framing', 'label': '頭（ヘッダー）', 'type': 'select', 'default': 'sony',
         'choices': [{'id': 'sony', 'label': '付ける（Sony 形式・52381）'}, {'id': 'raw', 'label': '付けない（VISCA だけ）'}],
         'help': '頭を付けないカメラはポートも機種の説明書の番号にします'},
    ],
    'actions': actions,
    'feedbacks': [],
    'variables': [{'id': 'last_reply', 'name': '最後の返事（ack / done / error）'}],
    'presets': presets,
    'evidence': [
        {'title': 'Sony VISCA コマンド一覧（VISCA over IP の頭・UDP 52381・RESET、パン・チルト・ズーム・フォーカス・プリセット）',
         'url': 'https://www.sony.jp/ls-camera/download/pdf/FR7/ILME-FR7_VISCA_command_list.pdf', 'status': '確認済',
         'note': 'Sony 以外のカメラ（BirdDog・PTZOptics など）は同じ VISCA を使うものが多いが【推測】。実機で確かめる'},
    ],
}
OUT.write_text(json.dumps(definition, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('wrote', OUT.name, len(actions), 'actions')
