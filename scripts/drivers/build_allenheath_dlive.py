#!/usr/bin/env python3
"""Allen & Heath dLive・Avantis（MIDI over TCP 51325）のドライバ定義（JSON）を作る（SPEC 7.1・8.14）。

チャンネルの種類ごとに MIDI チャンネル（基本 N ＋ ずれ）と番号（CH）が決まっている。
ミュートは 9N CH 7F/3F 9N CH 00、フェーダーは BN 63 CH BN 62 17 BN 06 LV、LV = (dB + 54) / 64 × 127。
根拠：Allen & Heath「dLive MIDI Over TCP Protocol V1.9」（公開 PDF）・「Avantis MIDI TCP/IP Protocol」（公開記事）。
手で JSON を直さず、このスクリプトを直して再生成する。
使い方：python3 scripts/drivers/build_allenheath_dlive.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'src' / 'drivers' / 'defs'
HOST = {'id': 'host', 'label': 'IP アドレス', 'type': 'text', 'placeholder': '192.168.1.70', 'pattern': '^[A-Za-z0-9.:\\-]+$', 'mono': True}
PORT = {'id': 'port', 'label': 'ポート', 'type': 'number', 'default': 51325, 'min': 1, 'max': 65535}
SYSEX = 'F0 00 00 1A 50 10 01 00'


def midich(default):
    return {'id': 'midich', 'label': 'MIDI チャンネル（範囲のいちばん下）', 'type': 'number', 'default': default, 'min': 1, 'max': 12,
            'help': '本体の Utility / Control / MIDI で決めた範囲の最初のチャンネル'}


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


def status(base, offset):
    """9N・BN など（base は 0x90 / 0xB0 / 0xC0、offset は種類のずれ）"""
    return f'{{{{config.midich|lin:1:{base + offset - 1}|hexu}}}}'


def low(offset):
    """SysEx の 0N（チャンネル − 1 ＋ ずれ）"""
    return f'{{{{config.midich|lin:1:{offset - 1}|hexu|pad2}}}}'


def ch(opt, start):
    return f'{{{{option.{opt}|lin:1:{start - 1}|hexu|pad2}}}}'


DB = num('db', 'レベル（dB、−54 で −∞）', 0, -54, 10)
LV = '{{option.db|lin:1.984375:107.15625|hexu|pad2}}'
ON_OFF = sel('on', '状態', [('7F', 'ミュートする'), ('3F', 'ミュートを外す')])
# 割り当ての ON は 40 から、OFF は 00 から（ON から 64 引く）
ASSIGN = sel('on', '状態', [('0', '割り当てる'), ('-64', '外す')])
COLOURS = [('00', '0（消灯）'), ('01', '1（赤）'), ('02', '2（緑）'), ('03', '3（黄）'), ('04', '4（青）'), ('05', '5（紫）'), ('06', '6（水色）'), ('07', '7（白）')]


def family(model_id, name, kinds, dca_count, mgrp_count, scene_max, midich_default, evidence):
    """kinds：(key, 表示名, ずれ, 最初の CH, 数, できること)"""
    actions = []
    by_key = {k[0]: k for k in kinds}
    for key, label, off, start, count, caps in kinds:
        n = num('n', f'{label}（1–{count}）', 1, 1, count)
        c = ch('n', start)
        if 'mute' in caps:
            actions.append(act(f'mute_{key}', f'{label}のミュート', [n, ON_OFF], f'{status(0x90, off)} {c} {{{{option.on}}}} {status(0x90, off)} {c} 00',
                               f'{label} {{{{option.n}}}} ミュート {{{{option.on}}}}'))
        if 'level' in caps:
            actions.append(act(f'level_{key}', f'{label}のフェーダー', [n, DB], f'{status(0xB0, off)} 63 {c} {status(0xB0, off)} 62 17 {status(0xB0, off)} 06 {LV}',
                               f'{label} {{{{option.n}}}} {{{{option.db}}}} dB'))
        if 'main' in caps:
            actions.append(act(f'main_{key}', f'{label}をメインに割り当て', [n, sel('v', '状態', [('7F', '割り当てる'), ('3F', '外す')])],
                               f'{status(0xB0, off)} 63 {c} {status(0xB0, off)} 62 18 {status(0xB0, off)} 06 {{{{option.v}}}}',
                               f'{label} {{{{option.n}}}} → メイン {{{{option.v}}}}'))
        if 'dca' in caps:
            dca = num('dca', f'DCA（1–{dca_count}）', 1, 1, dca_count)
            actions.append(act(f'dca_{key}', f'{label}を DCA に割り当て', [n, dca, ASSIGN],
                               f'{status(0xB0, off)} 63 {c} {status(0xB0, off)} 62 40 {status(0xB0, off)} 06 {{{{option.dca|lin:1:{0x40 - 1}|plus:on|hexu|pad2}}}}',
                               f'{label} {{{{option.n}}}} → DCA {{{{option.dca}}}} {{{{option.on}}}}'))
            mg = num('mg', f'ミュートグループ（1–{mgrp_count}）', 1, 1, mgrp_count)
            mg_base = 0x40 + dca_count
            actions.append(act(f'mgrp_{key}', f'{label}をミュートグループに割り当て', [n, mg, ASSIGN],
                               f'{status(0xB0, off)} 63 {c} {status(0xB0, off)} 62 40 {status(0xB0, off)} 06 {{{{option.mg|lin:1:{mg_base - 1}|plus:on|hexu|pad2}}}}',
                               f'{label} {{{{option.n}}}} → ミュートグループ {{{{option.mg}}}} {{{{option.on}}}}'))
        if 'name' in caps:
            actions.append(act(f'name_{key}', f'{label}の名前', [n, {'id': 'name', 'label': '名前（英数 8 文字まで）', 'type': 'text', 'default': 'DEMO',
                                                                   'pattern': '^[ -~]{1,8}$'}],
                               f'{SYSEX} {low(off)} 03 {c} {{{{option.name|hexstr}}}} F7', f'{label} {{{{option.n}}}} → {{{{option.name}}}}'))
            actions.append(act(f'colour_{key}', f'{label}の色', [n, sel('col', '色', COLOURS, '01')],
                               f'{SYSEX} {low(off)} 06 {c} {{{{option.col}}}} F7', f'{label} {{{{option.n}}}} 色 {{{{option.col}}}}'))
    # 送り（入力 → AUX / FX / マトリクス）：SysEx 0D。送り先の種類ごとに分ける
    ip = by_key['input']
    src = num('n', f'入力（1–{ip[4]}）', 1, 1, ip[4])
    for key in ('aux', 'saux', 'fxs', 'sfxs', 'mtx', 'smtx', 'grp', 'sgrp'):
        if key not in by_key:
            continue
        _k, label, off, start, count, _c = by_key[key]
        dst = num('d', f'{label}（1–{count}）', 1, 1, count)
        if key not in ('grp', 'sgrp'):
            actions.append(act(f'send_{key}', f'入力 → {label}の送りのレベル', [src, dst, DB],
                               f'{SYSEX} {low(0)} 0D {ch("n", 0)} {low(off)} {ch("d", start)} {LV} F7',
                               f'入力 {{{{option.n}}}} → {label} {{{{option.d}}}} {{{{option.db}}}} dB'))
        actions.append(act(f'assign_{key}', f'入力を{label}に割り当て', [src, dst, sel('v', '状態', [('7F', '割り当てる'), ('3F', '外す')])],
                           f'{SYSEX} {low(0)} 0E {ch("n", 0)} {low(off)} {ch("d", start)} {{{{option.v}}}} F7',
                           f'入力 {{{{option.n}}}} → {label} {{{{option.d}}}} {{{{option.v}}}}'))
    actions += [
        act('scene', 'シーンを呼び出す', [num('scene', f'シーン（1–{scene_max}）', 1, 1, scene_max)],
            f'{status(0xB0, 0)} 00 {{{{option.scene|lin:1:-1|r14h:1|hexu|pad2}}}} {status(0xC0, 0)} {{{{option.scene|lin:1:-1|r14l:1|hexu|pad2}}}}',
            'シーン {{option.scene}}'),
        {'id': 'command', 'name': 'MIDI を送る（16 進）',
         'options': [{'id': 'hex', 'label': 'MIDI（16 進）', 'type': 'text', 'placeholder': '90 00 7F 90 00 00', 'pattern': '^([0-9A-Fa-f]{2} ?)+$', 'mono': True}],
         'send': {'kind': 'bytes', 'data': '{{option.hex}}', 'encoding': 'hex'}, 'summary': '{{option.hex}}'},
    ]
    presets = [
        {'id': f'mute_ip{n}', 'category': 'ミュート', 'name': f'入力 {n} をミュート', 'text': f'MUTE\nCH {n}', 'backgroundColor': '#2A2A2E',
         'action': {'definitionId': 'mute_input', 'options': {'n': n, 'on': '7F'}}} for n in range(1, 17)
    ] + [
        {'id': f'unmute_ip{n}', 'category': 'ミュートを外す', 'name': f'入力 {n} のミュートを外す', 'text': f'ON\nCH {n}', 'backgroundColor': '#1F9E48',
         'action': {'definitionId': 'mute_input', 'options': {'n': n, 'on': '3F'}}} for n in range(1, 17)
    ] + [
        {'id': f'scene{n}', 'category': 'シーン', 'name': f'シーン {n}', 'text': f'SCENE\n{n}', 'backgroundColor': '#1F5FD6',
         'action': {'definitionId': 'scene', 'options': {'scene': n}}} for n in range(1, 9)
    ]
    definition = {
        'format': 1,
        'id': model_id,
        'name': name,
        'category': '音響ミキサー',
        'version': '1.0.0',
        'minAppVersion': '0.6.0',
        'transport': 'tcp',
        'configFields': [HOST, PORT, midich(midich_default)],
        'actions': actions,
        'feedbacks': [],
        'variables': [],
        'presets': presets,
        'evidence': evidence + [
            {'title': 'レベル LV = (dB + 54) / 64 × 127（資料の式。資料の表の +5 dB だけ 16 進と 10 進が食い違う）', 'status': '確認済'},
            {'title': 'DCA・ミュートグループの割り当ては NRPN 40 の値（ON は 40 から、OFF は 00 から）', 'status': '確認済'},
            {'title': '色の番号（0–7）の色名', 'status': '推測', 'note': '資料に色名が無い。本体で確かめる'},
            {'title': '受信（本体からの状態）はまだ使っていない', 'status': '確認済'},
        ],
    }
    path = OUT / f'{model_id}.json'
    path.write_text(json.dumps(definition, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('wrote', path.name, len(actions), 'actions')


ALL = ['mute', 'level', 'main', 'dca', 'name']     # 入力・グループ・FX リターン
BUS = ['mute', 'level', 'dca', 'name']             # AUX・FX センド（メインへの割り当ては無し）
OUTS = ['mute', 'level', 'name']

family('allenheath-dlive', 'Allen & Heath dLive', [
    ('input', '入力', 0, 0x00, 128, ALL),
    ('grp', 'モノグループ', 1, 0x00, 62, ALL),
    ('sgrp', 'ステレオグループ', 1, 0x40, 31, ALL),
    ('aux', 'モノ AUX', 2, 0x00, 62, BUS),
    ('saux', 'ステレオ AUX', 2, 0x40, 31, BUS),
    ('mtx', 'モノマトリクス', 3, 0x00, 62, OUTS + ['dca']),
    ('smtx', 'ステレオマトリクス', 3, 0x40, 31, OUTS + ['dca']),
    ('fxs', 'モノ FX センド', 4, 0x00, 16, BUS),
    ('sfxs', 'ステレオ FX センド', 4, 0x10, 16, BUS),
    ('fxr', 'FX リターン', 4, 0x20, 16, ALL),
    ('main', 'メイン', 4, 0x30, 6, OUTS + ['dca']),
    ('dca', 'DCA', 4, 0x36, 24, ['mute', 'level', 'name']),
    ('mg', 'ミュートグループ', 4, 0x4E, 8, ['mute']),
], 24, 8, 500, 12, [
    {'title': 'Allen & Heath「dLive MIDI Over TCP Protocol V1.9」：TCP 51325、チャンネルの種類と番号、ミュート・フェーダー・割り当て・送り・シーン・名前・色',
     'url': 'https://www.allen-heath.com/content/uploads/2023/05/dLive-MIDI-Over-TCP-Protocol-V1.9.pdf', 'status': '確認済'},
])

family('allenheath-avantis', 'Allen & Heath Avantis', [
    ('input', '入力', 0, 0x00, 96, ALL),
    ('grp', 'モノグループ', 1, 0x00, 54, ALL),
    ('sgrp', 'ステレオグループ', 1, 0x40, 27, ALL),
    ('aux', 'モノ AUX', 2, 0x00, 54, BUS),
    ('saux', 'ステレオ AUX', 2, 0x40, 27, BUS),
    ('mtx', 'モノマトリクス', 3, 0x00, 54, OUTS + ['dca']),
    ('smtx', 'ステレオマトリクス', 3, 0x40, 27, OUTS + ['dca']),
    ('fxs', 'モノ FX センド', 4, 0x00, 12, BUS),
    ('sfxs', 'ステレオ FX センド', 4, 0x10, 12, BUS),
    ('fxr', 'FX リターン', 4, 0x20, 12, ALL),
    ('main', 'メイン', 4, 0x30, 3, OUTS + ['dca']),
    ('dca', 'DCA', 4, 0x36, 16, ['mute', 'level', 'name']),
    ('mg', 'ミュートグループ', 4, 0x46, 8, ['mute']),
    ('ufxs', 'ステレオ UFX センド', 4, 0x56, 8, BUS),
    ('ufxr', 'ステレオ UFX リターン', 4, 0x5E, 8, ALL),
], 16, 8, 500, 12, [
    {'title': 'Allen & Heath「Avantis MIDI TCP/IP Protocol」（V2.0 以降）：TCP 51325、チャンネルの種類と番号、ミュート・フェーダー・割り当て・送り・シーン・名前・色',
     'url': 'https://support.allen-heath.com/hc/en-gb/articles/45146889174801-Avantis-MIDI-TCP-IP-Protocol', 'status': '確認済'},
])
