#!/usr/bin/env python3
"""Allen & Heath Qu シリーズ（Qu-16 / 24 / 32 / Pac / SB、MIDI over TCP 51325）のドライバ定義（JSON）を作る（SPEC 7.1・8.16）。

ミュートは 9N CH 7F/3F 9N CH 00、フェーダーは NRPN 17、送りは NRPN 20、パンは NRPN 16、割り当ては NRPN 5C / 40。
根拠：Allen & Heath「Qu MIDI Protocol V1.9」（公開 PDF）。手で JSON を直さず、このスクリプトを直して再生成する。
使い方：python3 scripts/drivers/build_allenheath_qu.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'src' / 'drivers' / 'defs' / 'allenheath-qu.json'
HOST = {'id': 'host', 'label': 'IP アドレス', 'type': 'text', 'placeholder': '192.168.1.60', 'pattern': '^[A-Za-z0-9.:\\-]+$', 'mono': True}
PORT = {'id': 'port', 'label': 'ポート', 'type': 'number', 'default': 51325, 'min': 1, 'max': 65535}
MIDICH = {'id': 'midich', 'label': 'MIDI チャンネル', 'type': 'number', 'default': 1, 'min': 1, 'max': 15, 'help': '本体の Setup / Control / MIDI のチャンネル'}

NOTE = '{{config.midich|lin:1:143|hexu}}'
CC = '{{config.midich|lin:1:175|hexu}}'
PC = '{{config.midich|lin:1:191|hexu}}'
NOTE2 = '{{config.midich|lin:1:144|hexu}}'   # N+1（DAW・カスタムレイヤー）
CC2 = '{{config.midich|lin:1:176|hexu}}'


def num(id_, label, default, lo, hi, help_=None):
    f = {'id': id_, 'label': label, 'type': 'number', 'default': default, 'min': lo, 'max': hi}
    if help_:
        f['help'] = help_
    return f


def sel(id_, label, pairs, default=None):
    return {'id': id_, 'label': label, 'type': 'select', 'default': default if default is not None else pairs[0][0],
            'choices': [{'id': i, 'label': l} for i, l in pairs]}


def act(id_, name, options, data, summary=None):
    a = {'id': id_, 'name': name, 'options': list(options), 'send': {'kind': 'bytes', 'data': data, 'encoding': 'hex'}}
    if summary:
        a['summary'] = summary
    return a


# チャンネルの番号（CH）
STRIPS = [
    ('ip', '入力', 32, 0x20),
    ('st', 'ステレオ入力', 3, 0x40),
    ('fxr', 'FX リターン', 4, 0x08),
    ('fxs', 'FX センド', 4, 0x00),
    ('mix', 'ミックス（1–4 モノ・5–7 は 5-6 / 7-8 / 9-10）', 7, 0x60),
    ('grp', 'グループ（1-2 / 3-4 / 5-6 / 7-8）', 4, 0x68),
    ('mtx', 'マトリクス（1-2 / 3-4）', 2, 0x6C),
    ('dca', 'DCA', 4, 0x10),
    ('mg', 'ミュートグループ', 4, 0x50),
]
LEVELS = sel('va', 'レベル', [('7F', '+10 dB'), ('72', '+5 dB'), ('62', '0 dB'), ('4F', '−5 dB'), ('3F', '−10 dB'), ('36', '−15 dB'), ('2F', '−20 dB'),
                             ('27', '−25 dB'), ('1F', '−30 dB'), ('17', '−35 dB'), ('10', '−40 dB'), ('0C', '−45 dB'), ('00', '−∞')], '62')
RAW = num('v', '値（0–127。0 dB = 98）', 98, 0, 127)
SENDS = [('00', 'Mix 1'), ('01', 'Mix 2'), ('02', 'Mix 3'), ('03', 'Mix 4'), ('04', 'Mix 5-6'), ('05', 'Mix 7-8'), ('06', 'Mix 9-10'),
         ('08', 'Grp 1-2'), ('09', 'Grp 3-4'), ('0A', 'Grp 5-6'), ('0B', 'Grp 7-8'), ('0C', 'MTX 1-2'), ('0D', 'MTX 3-4'),
         ('10', 'FX 1'), ('11', 'FX 2'), ('12', 'FX 3'), ('13', 'FX 4')]
PAN_TO = [('07', 'LR'), ('04', 'Mix 5-6'), ('05', 'Mix 7-8'), ('06', 'Mix 9-10'), ('08', 'Grp 1-2'), ('09', 'Grp 3-4'), ('0A', 'Grp 5-6'), ('0B', 'Grp 7-8'),
          ('0C', 'MTX 1-2'), ('0D', 'MTX 3-4')]
GROUP4 = num('g', 'グループ（1–4）', 1, 1, 4)


def ch(key, start):
    return f'{{{{option.n|lin:1:{start - 1}|hexu|pad2}}}}'


actions = []
for key, label, count, start in STRIPS:
    n = num('n', f'{label}（1–{count}）', 1, 1, count)
    c = ch(key, start)
    actions.append(act(f'mute_{key}', f'{label}のミュート', [n, sel('on', '状態', [('7F', 'ミュートする'), ('3F', 'ミュートを外す')])],
                       f'{NOTE} {c} {{{{option.on}}}} {NOTE} {c} 00', f'{label} {{{{option.n}}}} {{{{option.on}}}}'))
    if key in ('dca', 'mg'):
        continue
    actions.append(act(f'fader_{key}', f'{label}のフェーダー', [n, LEVELS], f'{CC} 63 {c} {CC} 62 17 {CC} 06 {{{{option.va}}}} {CC} 26 07',
                       f'{label} {{{{option.n}}}} {{{{option.va}}}}'))
    actions.append(act(f'fader_{key}_raw', f'{label}のフェーダー（数値）', [n, RAW], f'{CC} 63 {c} {CC} 62 17 {CC} 06 {{{{option.v|hexu|pad2}}}} {CC} 26 07',
                       f'{label} {{{{option.n}}}} = {{{{option.v}}}}'))
    if key in ('ip', 'st', 'fxr'):
        actions.append(act(f'send_{key}', f'{label}の送りのレベル', [n, sel('to', '送り先', SENDS), LEVELS],
                           f'{CC} 63 {c} {CC} 62 20 {CC} 06 {{{{option.va}}}} {CC} 26 {{{{option.to}}}}', f'{label} {{{{option.n}}}} → {{{{option.to}}}}'))
        actions.append(act(f'pan_{key}', f'{label}のパン', [n, sel('to', '対象', PAN_TO), num('pan', 'パン（0 左 – 37 中央 – 74 右）', 37, 0, 74)],
                           f'{CC} 63 {c} {CC} 62 16 {CC} 06 {{{{option.pan|hexu|pad2}}}} {CC} 26 {{{{option.to}}}}', f'{label} {{{{option.n}}}} パン {{{{option.pan}}}}'))
    if key in ('ip', 'st', 'fxr', 'mix', 'grp', 'mtx', 'fxs'):
        actions.append(act(f'mg_{key}', f'{label}をミュートグループに割り当て', [n, GROUP4, sel('on', '状態', [('63', '割り当てる'), ('-1', '外す')])],
                           f'{CC} 63 {c} {CC} 62 5C {CC} 06 {{{{option.g|plus:on|hexu|pad2}}}} {CC} 26 07', f'{label} {{{{option.n}}}} → MG {{{{option.g}}}}'))
        actions.append(act(f'dca_{key}', f'{label}を DCA に割り当て', [n, GROUP4, sel('on', '状態', [('63', '割り当てる'), ('-1', '外す')])],
                           f'{CC} 63 {c} {CC} 62 40 {CC} 06 {{{{option.g|plus:on|hexu|pad2}}}} {CC} 26 07', f'{label} {{{{option.n}}}} → DCA {{{{option.g}}}}'))

actions += [
    act('scene', 'シーンを呼び出す', [num('scene', 'シーン（1–100）', 1, 1, 100)], f'{CC} 00 00 {CC} 20 00 {PC} {{{{option.scene|lin:1:-1|hexu|pad2}}}}',
        'シーン {{option.scene}}'),
    act('strip_key', 'カスタムレイヤーのキー', [sel('k', 'キー', [('0', 'Mute'), ('32', 'Sel'), ('64', 'PAFL')]), num('n', 'ストリップ（1–32）', 1, 1, 32)],
        f'{NOTE2} {{{{option.n|lin:1:-1|plus:k|hexu|pad2}}}} 7F {NOTE2} {{{{option.n|lin:1:-1|plus:k|hexu|pad2}}}} 00', 'ストリップ {{option.n}}'),
    act('strip_fader', 'カスタムレイヤーのフェーダー', [num('n', 'ストリップ（1–32）', 1, 1, 32), num('v', '値（0–127）', 98, 0, 127)],
        f'{CC2} {{{{option.n|lin:1:-1|hexu|pad2}}}} {{{{option.v|hexu|pad2}}}}', 'ストリップ {{option.n}} = {{option.v}}'),
    act('mmc', 'MMC（レコーダー）', [sel('tc', '操作', [('01', '停止'), ('02', '再生'), ('09', '一時停止'), ('06', '録音'), ('04', '早送り'), ('05', '巻き戻し')])],
        'F0 7F 7F 06 {{option.tc}} F7', 'MMC {{option.tc}}'),
    act('daw_bank', 'DAW のバンク', [sel('k', '向き', [('7E', '上'), ('7F', '下')])], f'{NOTE2} {{{{option.k}}}} 7F {NOTE2} {{{{option.k}}}} 00', 'バンク {{option.k}}'),
    {'id': 'command', 'name': 'MIDI を送る（16 進）',
     'options': [{'id': 'hex', 'label': 'MIDI（16 進）', 'type': 'text', 'placeholder': '90 20 7F 90 20 00', 'pattern': '^([0-9A-Fa-f]{2} ?)+$', 'mono': True}],
     'send': {'kind': 'bytes', 'data': '{{option.hex}}', 'encoding': 'hex'}, 'summary': '{{option.hex}}'},
]

presets = [
    {'id': f'mute_ip{n}', 'category': 'ミュート', 'name': f'入力 {n} をミュート', 'text': f'MUTE\nCH {n}', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'mute_ip', 'options': {'n': n, 'on': '7F'}}} for n in range(1, 17)
] + [
    {'id': f'scene{n}', 'category': 'シーン', 'name': f'シーン {n}', 'text': f'SCENE\n{n}', 'backgroundColor': '#1F5FD6',
     'action': {'definitionId': 'scene', 'options': {'scene': n}}} for n in range(1, 9)
]

definition = {
    'format': 1,
    'id': 'allenheath-qu',
    'name': 'Allen & Heath Qu シリーズ',
    'category': '音響ミキサー',
    'version': '1.0.0',
    'minAppVersion': '0.6.0',
    'transport': 'tcp',
    'configFields': [HOST, PORT, MIDICH],
    'actions': actions,
    'feedbacks': [],
    'variables': [],
    'presets': presets,
    'evidence': [
        {'title': 'Allen & Heath「Qu MIDI Protocol V1.9」：TCP 51325、チャンネル番号の表、ミュート、NRPN 17 / 20 / 16 / 5C / 40、シーン、カスタムレイヤー、MMC',
         'url': 'https://www.allen-heath.com/content/uploads/2023/06/Qu_MIDI_Protocol_V1.9.pdf', 'status': '確認済'},
        {'title': 'TCP の MIDI の接続は同時に 1 つだけ', 'status': '確認済'},
        {'title': '受信（本体からの状態）はまだ使っていない', 'status': '確認済'},
    ],
}

OUT.write_text(json.dumps(definition, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('wrote', OUT.name, len(actions), 'actions')
