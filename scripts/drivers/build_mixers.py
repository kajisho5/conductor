#!/usr/bin/env python3
"""デジタルミキサー（OSC）のドライバ定義（JSON）を作る（SPEC 7.1・8.10）。Behringer / Midas X32・M32 と Behringer WING。

OSC の組み立ては汎用 OSC と同じ（OSC 1.0）。アドレスの根拠：
- X32 / M32：Patrick-Gilles Maillot「Unofficial X32/M32 OSC Remote Protocol」（公開資料。UDP 10023）
- WING：Patrick-Gilles Maillot「WING Remote Protocols」（公開資料。UDP 2223）【推測を含む】
手で JSON を直さず、このスクリプトを直して再生成する。
使い方：python3 scripts/drivers/build_mixers.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'src' / 'drivers' / 'defs'
HOST = {'id': 'host', 'label': 'IP アドレス', 'type': 'text', 'placeholder': '192.168.0.64', 'pattern': '^[A-Za-z0-9.:\\-]+$', 'mono': True}


def port(n):
    return {'id': 'port', 'label': 'ポート', 'type': 'number', 'default': n, 'min': 1, 'max': 65535}


def num(id_, label, default, lo, hi, help_=None):
    f = {'id': id_, 'label': label, 'type': 'number', 'default': default, 'min': lo, 'max': hi}
    if help_:
        f['help'] = help_
    return f


def sel(id_, label, pairs, default=None):
    return {'id': id_, 'label': label, 'type': 'select', 'default': default if default is not None else pairs[0][0],
            'choices': [{'id': i, 'label': l} for i, l in pairs]}


def osc(id_, name, options, address, args, summary=None):
    a = {'id': id_, 'name': name, 'options': options, 'send': {'kind': 'osc', 'address': address, 'args': [{'type': t, 'value': v} for t, v in args]}}
    if summary:
        a['summary'] = summary
    return a


# ---------------------------------------------------------------- X32 / M32（on は 1 = 音が出る、0 = ミュート）
MUTE = sel('mute', 'ミュート', [('0', 'ミュートする'), ('1', 'ミュートを外す')])
LEVEL = num('level', 'レベル（0.0–1.0）', 0.75, 0, 1, '0.75 がおよそ 0 dB')
x32_actions = [
    osc('ch_mute', 'チャンネルのミュート', [num('ch', 'チャンネル（1–32）', 1, 1, 32), MUTE], '/ch/{{option.ch|pad2}}/mix/on', [('i', '{{option.mute}}')],
        'CH {{option.ch}} on={{option.mute}}'),
    osc('ch_fader', 'チャンネルのフェーダー', [num('ch', 'チャンネル（1–32）', 1, 1, 32), LEVEL], '/ch/{{option.ch|pad2}}/mix/fader', [('f', '{{option.level}}')]),
    osc('aux_mute', 'AUX IN のミュート', [num('ch', 'AUX IN（1–8）', 1, 1, 8), MUTE], '/auxin/{{option.ch|pad2}}/mix/on', [('i', '{{option.mute}}')]),
    osc('fxrtn_mute', 'FX リターンのミュート', [num('ch', 'FX リターン（1–8）', 1, 1, 8), MUTE], '/fxrtn/{{option.ch|pad2}}/mix/on', [('i', '{{option.mute}}')]),
    osc('bus_mute', 'バスのミュート', [num('bus', 'バス（1–16）', 1, 1, 16), MUTE], '/bus/{{option.bus|pad2}}/mix/on', [('i', '{{option.mute}}')]),
    osc('bus_fader', 'バスのフェーダー', [num('bus', 'バス（1–16）', 1, 1, 16), LEVEL], '/bus/{{option.bus|pad2}}/mix/fader', [('f', '{{option.level}}')]),
    osc('mtx_mute', 'マトリクスのミュート', [num('mtx', 'マトリクス（1–6）', 1, 1, 6), MUTE], '/mtx/{{option.mtx|pad2}}/mix/on', [('i', '{{option.mute}}')]),
    osc('main_mute', 'メイン LR のミュート', [MUTE], '/main/st/mix/on', [('i', '{{option.mute}}')]),
    osc('main_fader', 'メイン LR のフェーダー', [LEVEL], '/main/st/mix/fader', [('f', '{{option.level}}')]),
    osc('mono_mute', 'メイン M/C のミュート', [MUTE], '/main/m/mix/on', [('i', '{{option.mute}}')]),
    osc('dca_mute', 'DCA のミュート', [num('dca', 'DCA（1–8）', 1, 1, 8), MUTE], '/dca/{{option.dca}}/on', [('i', '{{option.mute}}')]),
    osc('dca_fader', 'DCA のフェーダー', [num('dca', 'DCA（1–8）', 1, 1, 8), LEVEL], '/dca/{{option.dca}}/fader', [('f', '{{option.level}}')]),
    osc('mute_group', 'ミュートグループ', [num('grp', 'グループ（1–6）', 1, 1, 6), sel('on', '状態', [('1', 'ON（ミュート）'), ('0', 'OFF')])],
        '/config/mute/{{option.grp}}', [('i', '{{option.on}}')]),
    osc('scene', 'シーンを呼び出す', [num('n', 'シーン番号（0–99）', 0, 0, 99)], '/-action/goscene', [('i', '{{option.n}}')], 'シーン {{option.n}}'),
    osc('snippet', 'スニペットを呼び出す', [num('n', 'スニペット番号（0–99）', 0, 0, 99)], '/-action/gosnippet', [('i', '{{option.n}}')]),
    osc('cue', 'キューを呼び出す', [num('n', 'キュー番号（0–99）', 0, 0, 99)], '/-action/gocue', [('i', '{{option.n}}')]),
    osc('ch_name', 'チャンネルの名前', [num('ch', 'チャンネル（1–32）', 1, 1, 32), {'id': 'name', 'label': '名前（12 文字まで）', 'type': 'text', 'placeholder': 'DEMO MC'}],
        '/ch/{{option.ch|pad2}}/config/name', [('s', '{{option.name}}')]),
    osc('send', 'メッセージを送る', [{'id': 'address', 'label': 'アドレス', 'type': 'text', 'placeholder': '/ch/01/mix/on', 'pattern': '^/.*', 'mono': True},
                                    sel('type', '値の型', [('i', '整数'), ('f', '小数'), ('s', '文字')]),
                                    {'id': 'value', 'label': '値', 'type': 'text', 'mono': True}],
        '{{option.address}}', [('{{option.type}}', '{{option.value}}')], '{{option.address}} {{option.value}}'),
]
x32 = {
    'format': 1, 'id': 'behringer-x32', 'name': 'Behringer / Midas X32・M32', 'category': 'ミキサー', 'version': '1.0.0', 'minAppVersion': '0.6.0',
    'transport': 'osc', 'configFields': [HOST, port(10023)], 'actions': x32_actions, 'feedbacks': [], 'variables': [],
    'presets': [
        {'id': f'ch{n}', 'category': 'チャンネル', 'name': f'CH {n} ミュート', 'text': f'CH {n}\nMUTE', 'backgroundColor': '#E0302B',
         'action': {'definitionId': 'ch_mute', 'options': {'ch': n, 'mute': '0'}}} for n in range(1, 9)
    ],
    'evidence': [
        {'title': 'Unofficial X32/M32 OSC Remote Protocol（Patrick-Gilles Maillot、公開資料。UDP 10023、/ch/NN/mix/on など）',
         'status': '推測',
         'note': 'メーカー公式ではない公開資料。ミュートは on=0。フェーダーは 0.0–1.0（0.75 ≒ 0 dB）。実機で確かめる'},
    ],
}

# ---------------------------------------------------------------- WING（mute は 1 = ミュート、フェーダーは dB）
WMUTE = sel('mute', 'ミュート', [('1', 'ミュートする'), ('0', 'ミュートを外す')])
DB = num('db', 'レベル（dB、-144–10）', 0, -144, 10)
wing_actions = [
    osc('ch_mute', 'チャンネルのミュート', [num('ch', 'チャンネル（1–40）', 1, 1, 40), WMUTE], '/ch/{{option.ch}}/mute', [('i', '{{option.mute}}')],
        'CH {{option.ch}} mute={{option.mute}}'),
    osc('ch_fader', 'チャンネルのフェーダー', [num('ch', 'チャンネル（1–40）', 1, 1, 40), DB], '/ch/{{option.ch}}/fdr', [('f', '{{option.db}}')]),
    osc('aux_mute', 'AUX のミュート', [num('ch', 'AUX（1–8）', 1, 1, 8), WMUTE], '/aux/{{option.ch}}/mute', [('i', '{{option.mute}}')]),
    osc('bus_mute', 'バスのミュート', [num('bus', 'バス（1–16）', 1, 1, 16), WMUTE], '/bus/{{option.bus}}/mute', [('i', '{{option.mute}}')]),
    osc('bus_fader', 'バスのフェーダー', [num('bus', 'バス（1–16）', 1, 1, 16), DB], '/bus/{{option.bus}}/fdr', [('f', '{{option.db}}')]),
    osc('main_mute', 'メインのミュート', [num('m', 'メイン（1–4）', 1, 1, 4), WMUTE], '/main/{{option.m}}/mute', [('i', '{{option.mute}}')]),
    osc('main_fader', 'メインのフェーダー', [num('m', 'メイン（1–4）', 1, 1, 4), DB], '/main/{{option.m}}/fdr', [('f', '{{option.db}}')]),
    osc('mtx_mute', 'マトリクスのミュート', [num('mtx', 'マトリクス（1–8）', 1, 1, 8), WMUTE], '/mtx/{{option.mtx}}/mute', [('i', '{{option.mute}}')]),
    osc('dca_mute', 'DCA のミュート', [num('dca', 'DCA（1–16）', 1, 1, 16), WMUTE], '/dca/{{option.dca}}/mute', [('i', '{{option.mute}}')]),
    osc('dca_fader', 'DCA のフェーダー', [num('dca', 'DCA（1–16）', 1, 1, 16), DB], '/dca/{{option.dca}}/fdr', [('f', '{{option.db}}')]),
    osc('mgrp', 'ミュートグループ', [num('grp', 'グループ（1–8）', 1, 1, 8), WMUTE], '/mgrp/{{option.grp}}/mute', [('i', '{{option.mute}}')]),
    osc('send', 'メッセージを送る', [{'id': 'address', 'label': 'アドレス', 'type': 'text', 'placeholder': '/ch/1/mute', 'pattern': '^/.*', 'mono': True},
                                    sel('type', '値の型', [('i', '整数'), ('f', '小数'), ('s', '文字')]),
                                    {'id': 'value', 'label': '値', 'type': 'text', 'mono': True}],
        '{{option.address}}', [('{{option.type}}', '{{option.value}}')], '{{option.address}} {{option.value}}'),
]
wing = {
    'format': 1, 'id': 'behringer-wing', 'name': 'Behringer WING', 'category': 'ミキサー', 'version': '1.0.0', 'minAppVersion': '0.6.0',
    'transport': 'osc', 'configFields': [HOST, port(2223)], 'actions': wing_actions, 'feedbacks': [], 'variables': [],
    'presets': [
        {'id': f'ch{n}', 'category': 'チャンネル', 'name': f'CH {n} ミュート', 'text': f'CH {n}\nMUTE', 'backgroundColor': '#E0302B',
         'action': {'definitionId': 'ch_mute', 'options': {'ch': n, 'mute': '1'}}} for n in range(1, 9)
    ],
    'evidence': [
        {'title': 'WING Remote Protocols（Patrick-Gilles Maillot、公開資料。OSC は UDP 2223）', 'status': '推測',
         'note': 'メーカー公式ではない公開資料。mute は 1 = ミュート、fdr は dB。実機で確かめる'},
    ],
}

for d in (x32, wing):
    p = OUT / f"{d['id']}.json"
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('wrote', p.name, len(d['actions']), 'actions')
