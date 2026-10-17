#!/usr/bin/env python3
"""Allen & Heath SQ5 / SQ6 / SQ7（MIDI over TCP 51325）のドライバ定義（JSON）を作る（SPEC 7.1・8.13）。

命令は NRPN（BN 63 MSB BN 62 LSB …）。N は設定の MIDI チャンネル。パラメーター番号は 14 ビットの通し番号として計算する
（例：入力 n → AUX m のレベル = 40 44 から (n−1)×12 + (m−1)）。
根拠：Allen & Heath「SQ MIDI Protocol Issue 5」（公開 PDF）。手で JSON を直さず、このスクリプトを直して再生成する。
使い方：python3 scripts/drivers/build_allenheath.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'src' / 'drivers' / 'defs' / 'allenheath-sq.json'
HOST = {'id': 'host', 'label': 'IP アドレス', 'type': 'text', 'placeholder': '192.168.1.20', 'pattern': '^[A-Za-z0-9.:\\-]+$', 'mono': True}
PORT = {'id': 'port', 'label': 'ポート', 'type': 'number', 'default': 51325, 'min': 1, 'max': 65535}
MIDICH = {'id': 'midich', 'label': 'MIDI チャンネル', 'type': 'number', 'default': 1, 'min': 1, 'max': 16, 'help': '本体の「MIDI」設定のチャンネル'}

# 状態バイト（B0 + チャンネル − 1 など）
CC = '{{config.midich|lin:1:175|hexu}}'
PC = '{{config.midich|lin:1:191|hexu}}'
NOTE_ON = '{{config.midich|lin:1:143|hexu}}'
NOTE_OFF = '{{config.midich|lin:1:127|hexu}}'


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


def addr(expr):
    """14 ビットの通し番号（テンプレートの式）→ BN 63 MSB BN 62 LSB"""
    return f'{CC} 63 {{{{{expr}|r14h:1|hexu|pad2}}}} {CC} 62 {{{{{expr}|r14l:1|hexu|pad2}}}}'


def one(opt, base):
    """option.opt（1 から）を base からの通し番号に"""
    return f'option.{opt}|lin:1:{base - 1}'


def two(opt_a, stride, opt_b, base):
    """option.a（1 から）× stride ＋ option.b（1 から）を base からの通し番号に"""
    return f'option.{opt_a}|lin:{stride}:{base - stride - 1}|plus:{opt_b}'


def p(msb, lsb):
    return msb * 128 + lsb


VALUE = f'{CC} 06 {{{{option.v|r14h:1|hexu|pad2}}}} {CC} 26 {{{{option.v|r14l:1|hexu|pad2}}}}'
LEVELS = {
    'id': 'v', 'label': 'レベル', 'type': 'select', 'default': '15196',
    'help': '本体の「NRPN のフェーダーの法則」に合わせて選ぶ（資料にある値だけ）',
    'choices': [{'id': i, 'label': l} for i, l in [
        ('15196', '0 dB（リニア）'), ('13702', '−12 dB（リニア）'), ('12745', '−20 dB（リニア）'), ('12247', '−24 dB（リニア）'),
        ('12544', '0 dB（オーディオ）'), ('7552', '−12 dB（オーディオ）'), ('5952', '−20 dB（オーディオ）'), ('5184', '−24 dB（オーディオ）'),
        ('0', '−∞')]],
}
RAW = num('v', '値（0–16383）', 15196, 0, 16383, 'NRPN の 14 ビットの値。リニアで 0 dB = 15196')
STEP = sel('step', '向き', [('60', '+1 dB'), ('61', '−1 dB')])
PAN = num('pan', 'パン（−100 左 〜 0 中央 〜 100 右）', 0, -100, 100)
PAN_VALUE = f'{CC} 06 {{{{option.pan|lin:81.915:8191.4|r14h:1|hexu|pad2}}}} {CC} 26 {{{{option.pan|lin:81.915:8191.4|r14l:1|hexu|pad2}}}}'
MUTE_ON = sel('on', '状態', [('01', 'ミュートする'), ('00', 'ミュートを外す')])

# ミュートの対象（名前・ID・数・最初の番号）
MUTES = [
    ('input', '入力', 48, p(0x00, 0x00)),
    ('group', 'グループ', 12, p(0x00, 0x30)),
    ('fxrtn', 'FX リターン', 8, p(0x00, 0x3C)),
    ('aux', 'AUX', 12, p(0x00, 0x45)),
    ('fxsend', 'FX センド', 4, p(0x00, 0x51)),
    ('mtx', 'マトリクス', 3, p(0x00, 0x55)),
    ('dca', 'DCA', 8, p(0x02, 0x00)),
    ('mgrp', 'ミュートグループ', 8, p(0x04, 0x00)),
]

actions = []
for key, label, count, base in MUTES:
    n = num('n', f'{label}（1–{count}）', 1, 1, count)
    actions.append(act(f'mute_{key}', f'{label}のミュート', [n, MUTE_ON], f'{addr(one("n", base))} {CC} 06 00 {CC} 26 {{{{option.on}}}}',
                       f'{label} {{{{option.n}}}} ミュート {{{{option.on}}}}'))
    actions.append(act(f'mute_{key}_toggle', f'{label}のミュートを切り替え', [n], f'{addr(one("n", base))} {CC} 60 00', f'{label} {{{{option.n}}}} ミュート切り替え'))
actions += [
    act('mute_lr', 'LR のミュート', [MUTE_ON], f'{CC} 63 00 {CC} 62 44 {CC} 06 00 {CC} 26 {{{{option.on}}}}', 'LR ミュート {{option.on}}'),
    act('mute_lr_toggle', 'LR のミュートを切り替え', [], f'{CC} 63 00 {CC} 62 44 {CC} 60 00', 'LR ミュート切り替え'),
]

# レベル・パン（14 ビットの通し番号の式、名前、オプション）
IP = num('ip', '入力（1–48）', 1, 1, 48)
GRP = num('grp', 'グループ（1–12）', 1, 1, 12)
GRP11 = num('grp', 'グループ（1–11）', 1, 1, 11)
FXR = num('fxr', 'FX リターン（1–8）', 1, 1, 8)
AUX = num('aux', 'AUX（1–12）', 1, 1, 12)
FXS = num('fxs', 'FX センド（1–4）', 1, 1, 4)
MTX = num('mtx', 'マトリクス（1–3）', 1, 1, 3)
DCA = num('dca', 'DCA（1–8）', 1, 1, 8)

LEVEL_TARGETS = [
    ('ip_lr', '入力 → LR', [IP], one('ip', p(0x40, 0x00)), '入力 {{option.ip}} → LR'),
    ('ip_aux', '入力 → AUX', [IP, AUX], two('ip', 12, 'aux', p(0x40, 0x44)), '入力 {{option.ip}} → AUX {{option.aux}}'),
    ('ip_fx', '入力 → FX センド', [IP, FXS], two('ip', 4, 'fxs', p(0x4C, 0x14)), '入力 {{option.ip}} → FX {{option.fxs}}'),
    ('grp_lr', 'グループ → LR', [GRP], one('grp', p(0x40, 0x30)), 'グループ {{option.grp}} → LR'),
    ('grp_aux', 'グループ → AUX', [GRP11, AUX], two('grp', 12, 'aux', p(0x45, 0x04)), 'グループ {{option.grp}} → AUX {{option.aux}}'),
    ('fxr_lr', 'FX リターン → LR', [FXR], one('fxr', p(0x40, 0x3C)), 'FX リターン {{option.fxr}} → LR'),
    ('fxr_aux', 'FX リターン → AUX', [FXR, AUX], two('fxr', 12, 'aux', p(0x46, 0x14)), 'FX リターン {{option.fxr}} → AUX {{option.aux}}'),
    ('lr_mtx', 'LR → マトリクス', [MTX], one('mtx', p(0x4E, 0x24)), 'LR → MTX {{option.mtx}}'),
    ('aux_mtx', 'AUX → マトリクス', [AUX, MTX], two('aux', 3, 'mtx', p(0x4E, 0x27)), 'AUX {{option.aux}} → MTX {{option.mtx}}'),
    ('grp_mtx', 'グループ → マトリクス', [GRP, MTX], two('grp', 3, 'mtx', p(0x4E, 0x4B)), 'グループ {{option.grp}} → MTX {{option.mtx}}'),
    ('lr_master', 'LR のマスター', [], None, 'LR マスター'),
    ('aux_master', 'AUX のマスター', [AUX], one('aux', p(0x4F, 0x01)), 'AUX {{option.aux}} マスター'),
    ('fxs_master', 'FX センドのマスター', [FXS], one('fxs', p(0x4F, 0x0D)), 'FX {{option.fxs}} マスター'),
    ('mtx_master', 'マトリクスのマスター', [MTX], one('mtx', p(0x4F, 0x11)), 'MTX {{option.mtx}} マスター'),
    ('dca_master', 'DCA のマスター', [DCA], one('dca', p(0x4F, 0x20)), 'DCA {{option.dca}}'),
]
PAN_OFFSET = 0x10 * 128  # パン・バランスはレベルの MSB ＋ 10

for key, label, opts, expr, summary in LEVEL_TARGETS:
    a = f'{CC} 63 4F {CC} 62 00' if expr is None else addr(expr)
    actions.append(act(f'level_{key}', f'{label} のレベル', opts + [LEVELS], f'{a} {VALUE}', f'{summary} {{{{option.v}}}}'))
    actions.append(act(f'level_{key}_raw', f'{label} のレベル（数値）', opts + [RAW], f'{a} {VALUE}', f'{summary} = {{{{option.v}}}}'))
    actions.append(act(f'level_{key}_step', f'{label} のレベルを ±1 dB', opts + [STEP], f'{a} {CC} {{{{option.step}}}} 00', f'{summary} {{{{option.step}}}}'))
    if key == 'dca_master':
        continue
    if expr is None:
        pa = f'{CC} 63 5F {CC} 62 00'
    else:
        pa = addr(f'{expr}|lin:1:{PAN_OFFSET}')
    actions.append(act(f'pan_{key}', f'{label} のパン・バランス', opts + [PAN], f'{pa} {PAN_VALUE}', f'{summary} パン {{{{option.pan}}}}'))

actions += [
    act('scene', 'シーンを呼び出す', [num('scene', 'シーン（1–300）', 1, 1, 300)],
        f'{CC} 00 {{{{option.scene|lin:1:-1|r14h:1|hexu|pad2}}}} {PC} {{{{option.scene|lin:1:-1|r14l:1|hexu|pad2}}}}', 'シーン {{option.scene}}'),
    act('softkey', 'ソフトキーを押して離す', [num('key', 'ソフトキー（1–16）', 1, 1, 16)],
        f'{NOTE_ON} {{{{option.key|lin:1:47|hexu|pad2}}}} 7F {NOTE_OFF} {{{{option.key|lin:1:47|hexu|pad2}}}} 00', 'ソフトキー {{option.key}}'),
    act('softkey_press', 'ソフトキーを押す', [num('key', 'ソフトキー（1–16）', 1, 1, 16)], f'{NOTE_ON} {{{{option.key|lin:1:47|hexu|pad2}}}} 7F', 'ソフトキー {{option.key}} 押す'),
    act('softkey_release', 'ソフトキーを離す', [num('key', 'ソフトキー（1–16）', 1, 1, 16)], f'{NOTE_OFF} {{{{option.key|lin:1:47|hexu|pad2}}}} 00', 'ソフトキー {{option.key}} 離す'),
    {'id': 'command', 'name': 'MIDI を送る（16 進）',
     'options': [{'id': 'hex', 'label': 'MIDI（16 進）', 'type': 'text', 'placeholder': 'B0 63 00 B0 62 00 B0 60 00', 'pattern': '^([0-9A-Fa-f]{2} ?)+$', 'mono': True}],
     'send': {'kind': 'bytes', 'data': '{{option.hex}}', 'encoding': 'hex'}, 'summary': '{{option.hex}}'},
]

# 入力の割り当て（MSB 60 から。LR は 60 00 + (n−1)、AUX は 60 44 から (n−1)×12 + (m−1)、グループは 66 74 から (n−1)×12 + (g−1)）
actions[-1:-1] = [
    act('assign_ip_lr', '入力を LR に割り当て', [IP, sel('on', '状態', [('01', '割り当てる'), ('00', '外す')])],
        f'{addr(one("ip", p(0x60, 0x00)))} {CC} 06 00 {CC} 26 {{{{option.on}}}}', '入力 {{option.ip}} → LR {{option.on}}'),
    act('assign_ip_aux', '入力を AUX に割り当て', [IP, AUX, sel('on', '状態', [('01', '割り当てる'), ('00', '外す')])],
        f'{addr(two("ip", 12, "aux", p(0x60, 0x44)))} {CC} 06 00 {CC} 26 {{{{option.on}}}}', '入力 {{option.ip}} → AUX {{option.aux}} {{option.on}}'),
    act('assign_ip_grp', '入力をグループに割り当て', [IP, GRP, sel('on', '状態', [('01', '割り当てる'), ('00', '外す')])],
        f'{addr(two("ip", 12, "grp", p(0x66, 0x74)))} {CC} 06 00 {CC} 26 {{{{option.on}}}}', '入力 {{option.ip}} → グループ {{option.grp}} {{option.on}}'),
]

presets = [
    {'id': f'mute_ip{n}', 'category': 'ミュート', 'name': f'入力 {n} のミュート', 'text': f'MUTE\nCH {n}', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'mute_input_toggle', 'options': {'n': n}}} for n in range(1, 17)
] + [
    {'id': 'mute_lr', 'category': 'ミュート', 'name': 'LR のミュート', 'text': 'MUTE\nLR', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'mute_lr_toggle', 'options': {}}},
] + [
    {'id': f'mgrp{n}', 'category': 'ミュートグループ', 'name': f'ミュートグループ {n}', 'text': f'MGRP\n{n}', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'mute_mgrp_toggle', 'options': {'n': n}}} for n in range(1, 9)
] + [
    {'id': f'scene{n}', 'category': 'シーン', 'name': f'シーン {n}', 'text': f'SCENE\n{n}', 'backgroundColor': '#1F5FD6',
     'action': {'definitionId': 'scene', 'options': {'scene': n}}} for n in range(1, 9)
]

definition = {
    'format': 1,
    'id': 'allenheath-sq',
    'name': 'Allen & Heath SQ5 / SQ6 / SQ7',
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
        {'title': 'Allen & Heath「SQ MIDI Protocol Issue 5」：TCP 51325、NRPN のミュート・レベル・パン・割り当て、シーン呼び出し（BN 00 BK CN PG）、ソフトキー（9N / 8N、1 番が 30）',
         'url': 'https://www.allen-heath.com/content/uploads/2023/11/SQ-MIDI-Protocol-Issue5.pdf', 'status': '確認済',
         'note': 'パラメーター番号は表の最初の番号と増え方から計算（資料の例：入力 40 → AUX 5 = 44 1C、入力 36 → FX 3 = 4D 22 と一致）'},
        {'title': 'レベルの値は資料に載っている点（0 / −12 / −20 / −24 dB）だけを選べる。ほかは「数値」の動作で 14 ビットの値を直接送る', 'status': '確認済'},
        {'title': '入力 → グループの割り当ては表の最初の番号（66 74）からの推定', 'status': '推測'},
        {'title': '受信（本体からの状態）はまだ使っていない', 'status': '確認済'},
    ],
}

OUT.write_text(json.dumps(definition, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('wrote', OUT.name, len(actions), 'actions')
