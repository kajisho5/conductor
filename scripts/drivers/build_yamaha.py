#!/usr/bin/env python3
"""Yamaha のデジタルミキサーのドライバ定義（JSON）を 2 つ作る（SPEC 7.1・8.19）。

- yamaha-rcp：CL / QL / TF / DM3 / DM7 / RIVAGE PM の RCP（TCP 49280、`set MIXER:Current/<パス> X Y 値` を 1 行）。X・Y は 0 から
- yamaha-osc：DM3 / RIVAGE PM の公式 OSC（UDP 49900、`/yosc:req/set/MIXER:Current/<パス>/X/Y 値`）。X・Y は 1 から
パラメーターの名前と値の範囲は Yamaha の公式資料「DM3 OSC Specifications V1.00」「RIVAGE PM OSC Specifications V1.02」。
RCP の 1 行の形は公開 OSS のモジュール yamaha-rcp（MIT）を conductor-drivers の Actions で動かした送信（Label・Scene など）で確認した。
手で JSON を直さず、このスクリプトを直して再生成する。
使い方：python3 scripts/drivers/build_yamaha.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'src' / 'drivers' / 'defs'
HOST = {'id': 'host', 'label': 'IP アドレス', 'type': 'text', 'placeholder': '192.168.0.128', 'pattern': '^[A-Za-z0-9.:\\-]+$', 'mono': True}


def num(id_, label, default, lo, hi, help_=None):
    f = {'id': id_, 'label': label, 'type': 'number', 'default': default, 'min': lo, 'max': hi}
    if help_:
        f['help'] = help_
    return f


def sel(id_, label, pairs, default=None):
    return {'id': id_, 'label': label, 'type': 'select', 'default': default if default is not None else pairs[0][0],
            'choices': [{'id': i, 'label': l} for i, l in pairs]}


# チャンネルの種類（パスの頭、表示名、最大の数）
STRIPS = [
    ('InCh', '入力チャンネル', 288),
    ('StInCh', 'ステレオ入力', 32),
    ('FxRtnCh', 'FX リターン', 32),
    ('Mix', 'MIX', 72),
    ('Mtrx', 'MATRIX', 36),
    ('St', 'ステレオ（ST）', 2),
    ('Mono', 'モノ（C）', 1),
    ('DCA', 'DCA', 24),
]
SOURCES = ['InCh', 'StInCh', 'FxRtnCh']
LEVEL = num('db', 'レベル（dB、−138 で −∞、+10 まで）', 0, -138, 10, '資料の値は dB × 100（−∞ は −32768）')
ON = sel('on', '状態', [('1', 'ON（音が出る）'), ('0', 'OFF（ミュート）')])
PAN = num('pan', 'パン（−63 左 – 0 中央 – 63 右）', 0, -63, 63)
COLORS = [(c, c) for c in ['Blue', 'Orange', 'Yellow', 'Purple', 'Cyan', 'Magenta', 'Red', 'Green', 'Off']]
# dB × 100 で送る。−∞（−32768）は別の動作（〜を −∞）にする
DB100 = '{{option.db|lin:100:0}}'


def rcp_line(path, x, y, val):
    return f'set MIXER:Current/{path} {x} {y} {val}'


def osc_addr(path, x, y):
    return f'/yosc:req/set/MIXER:Current/{path}/{x}/{y}'


def build(kind):
    actions = []

    def add(id_, name, options, path, xexpr, yexpr, val, osc_type, summary):
        if kind == 'rcp':
            data = rcp_line(path, xexpr[0], yexpr[0], val)
            actions.append({'id': id_, 'name': name, 'options': options,
                            'send': {'kind': 'bytes', 'data': data, 'encoding': 'text', 'terminator': '\\n'}, 'summary': summary})
        else:
            v = val.strip('"')
            actions.append({'id': id_, 'name': name, 'options': options,
                            'send': {'kind': 'osc', 'address': osc_addr(path, xexpr[1], yexpr[1]), 'args': [{'type': osc_type, 'value': v}]},
                            'summary': summary})

    Y0 = ('0', '1')
    for key, label, count in STRIPS:
        n = num('n', f'{label}（1–{count}）', 1, 1, count)
        X = ('{{option.n|lin:1:-1}}', '{{option.n}}')
        add(f'{key}_on', f'{label}の ON / OFF', [n, ON], f'{key}/Fader/On', X, Y0, '{{option.on}}', 'i', f'{label} {{{{option.n}}}} ON={{{{option.on}}}}')
        add(f'{key}_level', f'{label}のフェーダー', [n, LEVEL], f'{key}/Fader/Level', X, Y0, DB100, 'i', f'{label} {{{{option.n}}}} {{{{option.db}}}} dB')
        add(f'{key}_off', f'{label}のフェーダーを −∞', [n], f'{key}/Fader/Level', X, Y0, '-32768', 'i', f'{label} {{{{option.n}}}} −∞')
        if key != 'Mono':
            add(f'{key}_name', f'{label}の名前', [n, {'id': 'name', 'label': '名前（8 文字まで）', 'type': 'text', 'default': 'DEMO', 'pattern': '^[^"\\\\]{0,8}$'}],
                f'{key}/Label/Name', X, Y0, '"{{option.name}}"', 's', f'{label} {{{{option.n}}}} → {{{{option.name}}}}')
            add(f'{key}_color', f'{label}の色', [n, sel('color', '色', COLORS)], f'{key}/Label/Color', X, Y0, '"{{option.color}}"', 's',
                f'{label} {{{{option.n}}}} 色 {{{{option.color}}}}')
        if key in SOURCES:
            add(f'{key}_tost_on', f'{label}をステレオへ送る', [n, sel('on', '状態', [('1', '送る'), ('0', '送らない')])], f'{key}/ToSt/On', X, Y0,
                '{{option.on}}', 'i', f'{label} {{{{option.n}}}} → ST {{{{option.on}}}}')
            add(f'{key}_tost_pan', f'{label}のパン（ステレオ）', [n, PAN], f'{key}/ToSt/Pan', X, Y0, '{{option.pan}}', 'i', f'{label} {{{{option.n}}}} パン {{{{option.pan}}}}')
            mix = num('mix', 'MIX（1–72）', 1, 1, 72)
            XM = ('{{option.mix|lin:1:-1}}', '{{option.mix}}')
            add(f'{key}_tomix_level', f'{label} → MIX のレベル', [n, mix, LEVEL], f'{key}/ToMix/Level', X, XM, DB100, 'i',
                f'{label} {{{{option.n}}}} → MIX {{{{option.mix}}}} {{{{option.db}}}} dB')
            add(f'{key}_tomix_on', f'{label} → MIX の ON / OFF', [n, mix, ON], f'{key}/ToMix/On', X, XM, '{{option.on}}', 'i',
                f'{label} {{{{option.n}}}} → MIX {{{{option.mix}}}} ON={{{{option.on}}}}')
            add(f'{key}_tomix_pan', f'{label} → MIX のパン', [n, mix, PAN], f'{key}/ToMix/Pan', X, XM, '{{option.pan}}', 'i',
                f'{label} {{{{option.n}}}} → MIX {{{{option.mix}}}} パン {{{{option.pan}}}}')
            mt = num('mtx', 'MATRIX（1–36）', 1, 1, 36)
            XT = ('{{option.mtx|lin:1:-1}}', '{{option.mtx}}')
            add(f'{key}_tomtrx_level', f'{label} → MATRIX のレベル', [n, mt, LEVEL], f'{key}/ToMtrx/Level', X, XT, DB100, 'i',
                f'{label} {{{{option.n}}}} → MTX {{{{option.mtx}}}} {{{{option.db}}}} dB')
            add(f'{key}_tomtrx_on', f'{label} → MATRIX の ON / OFF', [n, mt, ON], f'{key}/ToMtrx/On', X, XT, '{{option.on}}', 'i',
                f'{label} {{{{option.n}}}} → MTX {{{{option.mtx}}}} ON={{{{option.on}}}}')
        if key == 'Mix':
            mt = num('mtx', 'MATRIX（1–36）', 1, 1, 36)
            XT = ('{{option.mtx|lin:1:-1}}', '{{option.mtx}}')
            add('Mix_tomtrx_level', 'MIX → MATRIX のレベル', [n, mt, LEVEL], 'Mix/ToMtrx/Level', X, XT, DB100, 'i',
                'MIX {{option.n}} → MTX {{option.mtx}} {{option.db}} dB')
            add('Mix_tomtrx_on', 'MIX → MATRIX の ON / OFF', [n, mt, ON], 'Mix/ToMtrx/On', X, XT, '{{option.on}}', 'i',
                'MIX {{option.n}} → MTX {{option.mtx}} ON={{option.on}}')
            add('Mix_tost_on', 'MIX をステレオへ送る', [n, sel('on', '状態', [('1', '送る'), ('0', '送らない')])], 'Mix/ToSt/On', X, Y0, '{{option.on}}', 'i',
                'MIX {{option.n}} → ST {{option.on}}')
    if kind == 'rcp':
        mg = num('n', 'ミュートグループ（1–12）', 1, 1, 12)
        actions += [
            {'id': 'mute_master', 'name': 'ミュートグループ（CL / QL / TF）', 'options': [mg, sel('on', '状態', [('1', 'ミュートする'), ('0', '外す')])],
             'send': {'kind': 'bytes', 'data': 'set MIXER:Current/MuteMaster/On {{option.n|lin:1:-1}} 0 {{option.on}}', 'encoding': 'text', 'terminator': '\\n'},
             'summary': 'ミュートグループ {{option.n}} {{option.on}}'},
            {'id': 'mute_grp', 'name': 'ミュートグループ（DM3 / DM7 / RIVAGE PM）', 'options': [mg, sel('on', '状態', [('1', 'ミュートする'), ('0', '外す')])],
             'send': {'kind': 'bytes', 'data': 'set MIXER:Current/MuteGrpCtrl/On {{option.n|lin:1:-1}} 0 {{option.on}}', 'encoding': 'text', 'terminator': '\\n'},
             'summary': 'ミュートグループ {{option.n}} {{option.on}}'},
            {'id': 'scene_recall', 'name': 'シーンを呼び出す', 'options': [num('scene', 'シーン番号', 1, 0, 999)],
             'send': {'kind': 'bytes', 'data': 'ssrecall_ex MIXER:Lib/Scene {{option.scene}}', 'encoding': 'text', 'terminator': '\\n'}, 'summary': 'シーン {{option.scene}}'},
            {'id': 'scene_store', 'name': 'シーンに保存', 'options': [num('scene', 'シーン番号', 1, 0, 999)],
             'send': {'kind': 'bytes', 'data': 'ssupdate_ex MIXER:Lib/Scene {{option.scene}}', 'encoding': 'text', 'terminator': '\\n'}, 'summary': 'シーン {{option.scene}} に保存'},
            {'id': 'scene_next', 'name': '次のシーン', 'options': [],
             'send': {'kind': 'bytes', 'data': 'event MIXER:Lib/Scene/RecallInc', 'encoding': 'text', 'terminator': '\\n'}},
            {'id': 'scene_prev', 'name': '前のシーン', 'options': [],
             'send': {'kind': 'bytes', 'data': 'event MIXER:Lib/Scene/RecallDec', 'encoding': 'text', 'terminator': '\\n'}},
            {'id': 'command', 'name': '命令を送る（1 行）', 'options': [{'id': 'cmd', 'label': '命令', 'type': 'text', 'default': 'devinfo productname', 'mono': True}],
             'send': {'kind': 'bytes', 'data': '{{option.cmd}}', 'encoding': 'text', 'terminator': '\\n'}, 'summary': '{{option.cmd}}'},
        ]
    else:
        mg = num('n', 'ミュートグループ（1–12）', 1, 1, 12)
        actions += [
            {'id': 'mute_grp', 'name': 'ミュートグループ', 'options': [mg, sel('on', '状態', [('1', 'ミュートする'), ('0', '外す')])],
             'send': {'kind': 'osc', 'address': '/yosc:req/set/MIXER:Current/MuteGrpCtrl/On/{{option.n}}/1', 'args': [{'type': 'i', 'value': '{{option.on}}'}]},
             'summary': 'ミュートグループ {{option.n}} {{option.on}}'},
            {'id': 'scene_recall', 'name': 'シーンを呼び出す', 'options': [sel('bank', 'バンク', [('scene_a', 'A'), ('scene_b', 'B')]), num('scene', 'シーン（0–99）', 0, 0, 99)],
             'send': {'kind': 'osc', 'address': '/yosc:req/ssrecall_ex', 'args': [{'type': 's', 'value': '{{option.bank}}'}, {'type': 'i', 'value': '{{option.scene}}'}]},
             'summary': 'シーン {{option.bank}} {{option.scene}}'},
            {'id': 'head_amp', 'name': 'ヘッドアンプのゲイン（本体の入力）', 'options': [num('n', '入力（1–16）', 1, 1, 16), num('gain', 'ゲイン（0–64 dB）', 0, 0, 64)],
             'send': {'kind': 'osc', 'address': '/yosc:req/set/IO:Current/InCh/HAGain/{{option.n}}/1', 'args': [{'type': 'i', 'value': '{{option.gain}}'}]},
             'summary': 'HA {{option.n}} {{option.gain}} dB'},
            {'id': 'phantom', 'name': 'ファンタム電源（本体の入力）', 'options': [num('n', '入力（1–16）', 1, 1, 16), sel('on', '状態', [('1', 'ON'), ('0', 'OFF')])],
             'send': {'kind': 'osc', 'address': '/yosc:req/set/IO:Current/InCh/48VOn/{{option.n}}/1', 'args': [{'type': 'i', 'value': '{{option.on}}'}]},
             'summary': '+48V {{option.n}} {{option.on}}'},
        ]
    return actions


def presets(kind):
    out = [
        {'id': f'on{n}', 'category': 'ON / OFF', 'name': f'入力 {n} を OFF', 'text': f'CH {n}\nOFF', 'backgroundColor': '#2A2A2E',
         'action': {'definitionId': 'InCh_on', 'options': {'n': n, 'on': '0'}}} for n in range(1, 17)
    ] + [
        {'id': f'onon{n}', 'category': 'ON / OFF', 'name': f'入力 {n} を ON', 'text': f'CH {n}\nON', 'backgroundColor': '#1F9E48',
         'action': {'definitionId': 'InCh_on', 'options': {'n': n, 'on': '1'}}} for n in range(1, 17)
    ]
    return out


RCP = {
    'format': 1,
    'id': 'yamaha-rcp',
    'name': 'Yamaha デジタルミキサー（CL / QL / TF / DM3 / DM7 / RIVAGE PM、RCP）',
    'category': '音響ミキサー',
    'version': '1.0.0',
    'minAppVersion': '0.6.0',
    'transport': 'tcp',
    'configFields': [HOST, {'id': 'port', 'label': 'ポート', 'type': 'number', 'default': 49280, 'min': 1, 'max': 65535}],
    'receive': [
        {'match': '^ERROR (.*)$', 'set': [{'variable': 'last_error', 'value': '$1'}]},
    ],
    'actions': build('rcp'),
    'feedbacks': [],
    'variables': [{'id': 'last_error', 'name': '最後のエラー'}],
    'presets': presets('rcp'),
    'evidence': [
        {'title': 'パラメーターの名前と範囲：Yamaha「DM3 OSC Specifications V1.00」（InCh / StInCh / FxRtnCh / Mix / St / Mtrx / Fx の Fader・ToSt・ToMix・ToMtrx・Label、MuteGrpCtrl、dB × 100・−∞ は −32768）',
         'url': 'https://fi.yamaha.com/files/download/other_assets/2/2063222/DM3_osc_specs_v100_en.pdf', 'status': '確認済'},
        {'title': 'RCP の 1 行（set MIXER:Current/… X Y 値、X・Y は 0 から、ssrecall_ex MIXER:Lib/Scene、event MIXER:Lib/Scene/RecallInc）・ポート 49280',
         'status': '確認済', 'note': '公開 OSS のモジュール yamaha-rcp（MIT）を conductor-drivers の Actions で動かした送信'},
        {'title': '機種ごとのチャンネル数・DCA（DCA/Fader）・Mono・MuteMaster の有無', 'status': '推測', 'note': '機種の資料で確かめる。無いパスは本体が ERROR を返す（変数 last_error）'},
    ],
}

OSC = {
    'format': 1,
    'id': 'yamaha-osc',
    'name': 'Yamaha DM3 / RIVAGE PM（OSC）',
    'category': '音響ミキサー',
    'version': '1.0.0',
    'minAppVersion': '0.6.0',
    'transport': 'osc',
    'configFields': [HOST, {'id': 'port', 'label': 'ポート', 'type': 'number', 'default': 49900, 'min': 1, 'max': 65535}],
    'actions': build('osc'),
    'feedbacks': [],
    'variables': [],
    'presets': presets('osc'),
    'evidence': [
        {'title': 'Yamaha「DM3 OSC Specifications V1.00」：UDP 49900、/yosc:req/set/MIXER:Current/<パス>/X/Y、値の範囲、ssrecall_ex、IO:Current/InCh/HAGain・48VOn',
         'url': 'https://fi.yamaha.com/files/download/other_assets/2/2063222/DM3_osc_specs_v100_en.pdf', 'status': '確認済'},
        {'title': 'Yamaha「RIVAGE PM OSC Specifications V1.02」', 'url': 'https://it.yamaha.com/files/download/other_assets/5/1407565/RIVAGE_PM_osc_specs_v102_en.pdf',
         'status': '確認済', 'note': 'チャンネル数は機種で違う'},
    ],
}

for d in (RCP, OSC):
    path = OUT / f'{d["id"]}.json'
    path.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('wrote', path.name, len(d['actions']), 'actions')
