#!/usr/bin/env python3
"""Roland V シリーズ（LAN）のドライバ定義（JSON）を作る（SPEC 7.1・8.2）。

定義はデータだけ。アドレス・値の対応は各機種の Remote Control Guide と kajisho5/crosspoint のプロファイル
（core/profiles/*.ts。根拠は crosspoint SPEC 9 章）から写したもの。手で JSON を直さず、このスクリプトを直して再生成する。
使い方：python3 scripts/drivers/build_roland.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'src' / 'drivers' / 'defs'

GUIDE_SUPPORT = {
    'title': 'Roland Support「V-160HD LAN and RS-232 Control Tips」（TCP 8023、LF 終端、stx 省略、パスワード）',
    'url': 'https://support.roland.com/hc/en-us/articles/7816887053083-V-160HD-LAN-and-RS-232-Control-Tips',
    'status': '確認済',
}
SIMPLE = {
    'title': 'Roland「LAN/RS-232 簡易制御コマンド」Ver.02（CUT; ATO; MCREX など。V-160HD 3.5+ / V-80HD 1.3+ / VR-120HD 2.2+）',
    'url': 'https://static.roland.com/assets/media/pdf/LAN_RS-232_Basic_Control_Commands_eng02_W.pdf',
    'status': '確認済',
}
CROSSPOINT = {
    'title': 'kajisho5/crosspoint の LAN 実装（認証の手順・受信の区切り・ack）',
    'status': '確認済',
    'note': '認証文字列「Enter password:」「Welcome to 機種名.」は V-160HD で確認。他機種は同じと推測',
}

TALLY_MAP = {'00': 'OFF', '01': 'PGM', '02': 'PST', '03': 'PGM+PST'}

MODELS = [
    {
        'id': 'roland-v160hd',
        'name': 'Roland V-160HD',
        'inputs': 20,
        'encode': lambda n: 0x1F + n,
        'pgm': '002100',
        'pst': '002101',
        'tally_base': 0x0C0020,  # 0C0000 の 32 番目から XPT 1–10
        'tally_inputs': 10,
        'tally_size': '00002A',
        'tally_subscribe': True,
        'password_len': 4,
        'midi': '00 00 00 00 02',
        'cut': 'DTH:0B001E,01;DTH:0B001E,00;',
        'auto': 'DTH:0B001F,01;DTH:0B001F,00;',
        'cut_note': 'CUT / AUTO は 0B001E / 0B001F に 01 → 00（押して離す）',
        'memories': 30,
        'macro': True,
        'guide': {
            'title': 'Roland V-160HD Remote Control Guide（LAN・アドレスマップ）',
            'url': 'https://static.roland.com/assets/media/pdf/V-160HD_Control_eng06_W.pdf',
            'status': '確認済',
        },
    },
    {
        'id': 'roland-v80hd',
        'name': 'Roland V-80HD',
        'inputs': 16,
        'encode': lambda n: 0x28 + n,
        'pgm': '001500',
        'pst': '001501',
        'tally_base': 0x0C0029,  # 0C0000 の 0x28+n（XPT 1–8。crosspoint の tallyBlockSize 49 = 0x31）
        'tally_inputs': 8,
        'tally_size': '000031',
        'tally_subscribe': False,
        'password_len': 8,
        'midi': '01 05 14',
        'cut': 'CUT;',
        'auto': 'ATO;',
        'cut_note': 'CUT / AUTO は簡易制御コマンド（本体 Ver.1.3 以降）',
        'memories': 30,
        'macro': False,
        'guide': {
            'title': 'Roland V-80HD Remote Control Guide Version 1.03',
            'url': 'https://static.roland.com/assets/media/pdf/V-80HD_Control_eng01_W.pdf',
            'status': '確認済',
        },
    },
    {
        'id': 'roland-vr120hd',
        'name': 'Roland VR-120HD',
        'inputs': 8,
        'encode': lambda n: 0x1C + n,
        'pgm': '001B00',
        'pst': '001B01',
        'tally_base': 0x0C001D,  # 0C0000 の 0x1C+n
        'tally_inputs': 8,
        'tally_size': '000025',
        'tally_subscribe': False,
        'password_len': 4,
        'midi': '00 00 00 00 25',
        'cut': 'CUT;',
        'auto': 'ATO;',
        'cut_note': 'CUT / AUTO は簡易制御コマンド（本体 Ver.2.2 以降）',
        'memories': 30,
        'macro': False,
        'guide': {
            'title': 'Roland VR-120HD Remote Control Guide',
            'status': '推測',
            'note': 'アドレスは crosspoint のプロファイルから。実機で確認する',
        },
    },
]


def hex2(n):
    return f'{n:02X}'


def hex6(n):
    return f'{n:06X}'


def build(m):
    inputs = [{'id': hex2(m['encode'](n)), 'label': f'INPUT {n}'} for n in range(1, m['inputs'] + 1)]
    input_nums = [{'id': str(n), 'label': f'INPUT {n}'} for n in range(1, m['inputs'] + 1)]
    tally_nums = [{'id': str(n), 'label': f'INPUT {n}'} for n in range(1, m['tally_inputs'] + 1)]
    value_to_input = {hex2(m['encode'](n)): str(n) for n in range(1, m['inputs'] + 1)}

    actions = [
        {
            'id': 'pgm', 'name': 'PGM を選ぶ',
            'options': [{'id': 'input', 'label': '入力', 'type': 'select', 'default': inputs[0]['id'], 'choices': inputs}],
            'send': {'kind': 'bytes', 'data': f"DTH:{m['pgm']},{{{{option.input}}}};", 'encoding': 'text', 'terminator': '\\n'},
            'summary': 'PGM {{option.input}}',
        },
        {
            'id': 'pst', 'name': 'PST（プレビュー）を選ぶ',
            'options': [{'id': 'input', 'label': '入力', 'type': 'select', 'default': inputs[0]['id'], 'choices': inputs}],
            'send': {'kind': 'bytes', 'data': f"DTH:{m['pst']},{{{{option.input}}}};", 'encoding': 'text', 'terminator': '\\n'},
            'summary': 'PST {{option.input}}',
        },
        {'id': 'cut', 'name': 'CUT', 'options': [], 'send': {'kind': 'bytes', 'data': m['cut'], 'encoding': 'text', 'terminator': '\\n'}, 'summary': 'CUT'},
        {'id': 'auto', 'name': 'AUTO', 'options': [], 'send': {'kind': 'bytes', 'data': m['auto'], 'encoding': 'text', 'terminator': '\\n'}, 'summary': 'AUTO'},
        {
            'id': 'memory', 'name': 'シーンメモリーを呼び出す',
            'options': [{'id': 'n', 'label': 'メモリー', 'type': 'select', 'default': '00',
                         'choices': [{'id': hex2(i), 'label': f'MEMORY {i + 1}'} for i in range(m['memories'])]}],
            'send': {'kind': 'bytes', 'data': 'DTH:0A0000,{{option.n}};', 'encoding': 'text', 'terminator': '\\n'},
            'summary': 'メモリー {{option.n}}',
        },
    ]
    if m['macro']:
        actions.append({
            'id': 'macro', 'name': 'マクロを実行',
            'options': [{'id': 'n', 'label': 'マクロ番号（1–100）', 'type': 'number', 'default': 1, 'min': 1, 'max': 100}],
            'send': {'kind': 'bytes', 'data': 'MCREX:MACRO{{option.n}};', 'encoding': 'text', 'terminator': '\\n'},
            'summary': 'マクロ {{option.n}}',
        })
    actions += [
        {
            'id': 'dth', 'name': 'アドレスに書く（DTH）',
            'options': [
                {'id': 'addr', 'label': 'アドレス（16 進 6 桁）', 'type': 'text', 'placeholder': '002100', 'pattern': '^[0-9A-Fa-f]{6}$', 'mono': True},
                {'id': 'value', 'label': '値（16 進 2 桁ずつ）', 'type': 'text', 'placeholder': '20', 'pattern': '^([0-9A-Fa-f]{2})+$', 'mono': True},
            ],
            'send': {'kind': 'bytes', 'data': 'DTH:{{option.addr}},{{option.value}};', 'encoding': 'text', 'terminator': '\\n'},
            'summary': 'DTH {{option.addr}} = {{option.value}}',
        },
        {
            'id': 'command', 'name': '命令を送る（簡易制御コマンド）',
            'options': [{'id': 'cmd', 'label': '命令', 'type': 'text', 'placeholder': 'SEQNX;', 'help': '末尾の ; まで入れてください', 'mono': True}],
            'send': {'kind': 'bytes', 'data': '{{option.cmd}}', 'encoding': 'text', 'terminator': '\\n'},
            'summary': '{{option.cmd}}',
        },
    ]

    feedbacks = [
        {
            'id': 'pgm_is', 'name': 'PGM が入力',
            'options': [{'id': 'input', 'label': '入力', 'type': 'select', 'default': '1', 'choices': input_nums}],
            'compare': {'variable': 'pgm', 'op': 'eq', 'value': '{{option.input}}'},
            'summary': 'PGM が INPUT {{option.input}}',
        },
        {
            'id': 'pst_is', 'name': 'PST が入力',
            'options': [{'id': 'input', 'label': '入力', 'type': 'select', 'default': '1', 'choices': input_nums}],
            'compare': {'variable': 'pst', 'op': 'eq', 'value': '{{option.input}}'},
            'summary': 'PST が INPUT {{option.input}}',
        },
        {
            'id': 'tally', 'name': 'タリー',
            'options': [
                {'id': 'input', 'label': '入力', 'type': 'select', 'default': '1', 'choices': tally_nums},
                {'id': 'state', 'label': '状態', 'type': 'select', 'default': 'PGM', 'choices': [{'id': 'PGM', 'label': 'PGM'}, {'id': 'PST', 'label': 'PST'}]},
            ],
            'compare': {'variable': 'tally_{{option.input}}', 'op': 'contains', 'value': '{{option.state}}'},
            'summary': 'INPUT {{option.input}} が {{option.state}}',
        },
    ]

    derive = [
        {'variable': 'pgm', 'from': f"addr_{m['pgm']}", 'map': value_to_input, 'default': '?'},
        {'variable': 'pst', 'from': f"addr_{m['pst']}", 'map': value_to_input, 'default': '?'},
    ]
    for n in range(1, m['tally_inputs'] + 1):
        derive.append({'variable': f'tally_{n}', 'from': f"addr_{hex6(m['tally_base'] + n - 1)}", 'map': TALLY_MAP, 'default': 'OFF'})

    on_connect = ['VER;']
    if m['tally_subscribe']:
        on_connect.append('DTH:0C0100,01;')  # TALLY SEND ACTIVE（crosspoint SPEC 3-5）
    on_connect += [f"RQH:{m['pgm']},000002;", f"RQH:0C0000,{m['tally_size']};"]
    poll = [{'data': f"RQH:{m['pgm']},000002;", 'intervalMs': 1000}]
    if not m['tally_subscribe']:
        poll.append({'data': f"RQH:0C0000,{m['tally_size']};", 'intervalMs': 500})

    presets = []
    for n in range(1, min(m['inputs'], 8) + 1):
        presets.append({'id': f'pgm{n}', 'category': 'PGM', 'name': f'PGM INPUT {n}', 'text': f'PGM\nIN {n}', 'backgroundColor': '#2A2A2E',
                        'action': {'definitionId': 'pgm', 'options': {'input': hex2(m['encode'](n))}},
                        'feedbacks': [{'definitionId': 'pgm_is', 'options': {'input': str(n)}, 'backgroundColor': '#E0302B'}]})
    for n in range(1, min(m['inputs'], 8) + 1):
        presets.append({'id': f'pst{n}', 'category': 'PST', 'name': f'PST INPUT {n}', 'text': f'PST\nIN {n}', 'backgroundColor': '#2A2A2E',
                        'action': {'definitionId': 'pst', 'options': {'input': hex2(m['encode'](n))}},
                        'feedbacks': [{'definitionId': 'pst_is', 'options': {'input': str(n)}, 'backgroundColor': '#1F9E48'}]})
    presets.append({'id': 'cut', 'category': 'トランジション', 'name': 'CUT', 'text': 'CUT', 'backgroundColor': '#E9E9EC', 'action': {'definitionId': 'cut', 'options': {}}})
    presets.append({'id': 'auto', 'category': 'トランジション', 'name': 'AUTO', 'text': 'AUTO', 'backgroundColor': '#F2C200', 'action': {'definitionId': 'auto', 'options': {}}})

    evidence = [m['guide'], GUIDE_SUPPORT, SIMPLE, CROSSPOINT,
                {'title': '実機での確認', 'status': '不明', 'note': 'この定義はまだ実機で通していない。機器の画面の「最近のログ」（詳細）で送受信を確かめる'},
                {'title': m['cut_note'], 'status': '確認済' if m['id'] == 'roland-v160hd' else '推測'},
                {'title': 'タリーの並び・値（0C0000 から）', 'status': '確認済' if m['id'] == 'roland-v160hd' else '推測',
                 'note': '自発通知の有無は機種で違う。通知が無い機種は 0.5 秒ごとに問い合わせる'}]

    return {
        'format': 1,
        'id': m['id'],
        'name': m['name'],
        'category': '映像スイッチャー',
        'version': '1.0.0',
        'minAppVersion': '0.3.0',
        'transport': 'tcp',
        'session': 'roland-lan',
        'midiModelId': m['midi'],
        'configFields': [
            {'id': 'link', 'label': '接続', 'type': 'select', 'default': 'lan',
             'choices': [{'id': 'lan', 'label': 'LAN'}, {'id': 'midi', 'label': 'USB / BT MIDI'}],
             'help': 'USB・Bluetooth MIDI では DTH の命令だけ使えます（CUT; などの簡易制御コマンドは LAN だけ）'},
            {'id': 'midiName', 'label': 'MIDI の機器名（空なら機種名で探す）', 'type': 'text', 'placeholder': 'MIDI のとき'},
            {'id': 'host', 'label': 'IP アドレス', 'type': 'text', 'placeholder': '192.168.0.10', 'pattern': '^[A-Za-z0-9.:\\-]+$', 'mono': True},
            {'id': 'port', 'label': 'ポート', 'type': 'number', 'default': 8023, 'min': 1, 'max': 65535},
            {'id': 'password', 'label': f"パスワード（{m['password_len']} 桁）", 'type': 'text',
             'help': '本体の LAN CONTROL で決めた NETWORK PASSWORD', 'mono': True},
        ],
        'actions': actions,
        'feedbacks': feedbacks,
        'variables': [
            {'id': 'pgm', 'name': 'PGM の入力番号'},
            {'id': 'pst', 'name': 'PST の入力番号'},
            {'id': 'model', 'name': '機種名'},
            {'id': 'version', 'name': '本体のバージョン'},
            {'id': 'last_reply', 'name': '最後の応答（簡易制御コマンド）'},
        ] + [{'id': f'tally_{n}', 'name': f'INPUT {n} のタリー'} for n in range(1, m['tally_inputs'] + 1)],
        'onConnect': on_connect,
        'poll': poll,
        'derive': derive,
        'presets': presets,
        'evidence': evidence + [{'title': f"SysEx 機種 ID {m['midi']}（USB / Bluetooth MIDI）", 'status': '確認済' if m['id'] != 'roland-vr120hd' else '推測',
                                 'note': '各機種の Remote Control Guide と crosspoint のプロファイル'}],
    }


for m in MODELS:
    path = OUT / f"{m['id']}.json"
    path.write_text(json.dumps(build(m), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('wrote', path.relative_to(OUT.parents[2]))
