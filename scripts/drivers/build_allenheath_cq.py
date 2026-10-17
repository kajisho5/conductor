#!/usr/bin/env python3
"""Allen & Heath CQ-12T / CQ-18T / CQ-20B（MIDI over TCP 51325）のドライバ定義（JSON）を作る（SPEC 7.1・8.17）。

SQ と同じ NRPN（B0 63 MSB B0 62 LSB …）。MIDI チャンネルは 1 固定。
根拠：Allen & Heath「CQ MIDI Protocol V1.2.0 issue 4」（公開 PDF）。手で JSON を直さず、このスクリプトを直して再生成する。
使い方：python3 scripts/drivers/build_allenheath_cq.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'src' / 'drivers' / 'defs' / 'allenheath-cq.json'
HOST = {'id': 'host', 'label': 'IP アドレス', 'type': 'text', 'placeholder': '192.168.1.50', 'pattern': '^[A-Za-z0-9.:\\-]+$', 'mono': True}
PORT = {'id': 'port', 'label': 'ポート', 'type': 'number', 'default': 51325, 'min': 1, 'max': 65535}


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


def p(msb, lsb):
    return msb * 128 + lsb


def addr(expr):
    return f'B0 63 {{{{{expr}|r14h:1|hexu|pad2}}}} B0 62 {{{{{expr}|r14l:1|hexu|pad2}}}}'


def by_choice(opt):
    """選択肢の id（14 ビットの通し番号）そのもの"""
    return f'option.{opt}'


VALUE = 'B0 06 {{option.v|r14h:1|hexu|pad2}} B0 26 {{option.v|r14l:1|hexu|pad2}}'
LEVELS = sel('v', 'レベル', [('16320', '+10 dB'), ('14784', '+5 dB'), ('12544', '0 dB'), ('10048', '−5 dB'), ('7936', '−10 dB'), ('5952', '−20 dB'),
                            ('1984', '−40 dB'), ('0', '−∞')], '12544')
RAW = num('v', '値（0–16383。0 dB = 12544）', 12544, 0, 16383)
STEP = sel('step', '向き', [('60', '上げる'), ('61', '下げる')])
MUTE_ON = sel('on', '状態', [('01', 'ミュートする'), ('00', 'ミュートを外す')])

# ミュートの対象（選択肢の id は 14 ビットの通し番号）
MUTE_TARGETS = [(str(p(0, n - 1)), f'入力 {n}') for n in range(1, 17)] + [
    (str(p(0, 0x18)), 'ステレオ 1'), (str(p(0, 0x1A)), 'ステレオ 2'), (str(p(0, 0x1C)), 'USB'), (str(p(0, 0x1E)), 'Bluetooth'),
    (str(p(0, 0x44)), 'メイン LR'),
] + [(str(p(0, 0x45 + i)), f'出力 {i + 1}') for i in range(6)] + [(str(p(0, 0x51 + i)), f'FX {i + 1}') for i in range(4)] + [
    (str(p(2, i)), f'DCA {i + 1}') for i in range(4)] + [(str(p(4, i)), f'ミュートグループ {i + 1}') for i in range(4)]
# 入力（送り元）の通し番号（LR へのレベルの番号）
SOURCES = [(str(p(0x40, n - 1)), f'入力 {n}') for n in range(1, 17)] + [
    (str(p(0x40, 0x18)), 'ステレオ 1'), (str(p(0x40, 0x1A)), 'ステレオ 2'), (str(p(0x40, 0x1C)), 'USB'), (str(p(0x40, 0x1E)), 'Bluetooth')]
FX_RETURNS = [(str(p(0x40, 0x3C + i)), f'FX {i + 1}') for i in range(4)]
MASTERS = [(str(p(0x4F, 0)), 'メイン LR')] + [(str(p(0x4F, 1 + i)), f'出力 {i + 1}') for i in range(6)] + [
    (str(p(0x4F, 0x0D + i)), f'FX {i + 1}') for i in range(4)] + [(str(p(0x4F, 0x20 + i)), f'DCA {i + 1}') for i in range(4)]
IP = num('ip', '入力（1–16）', 1, 1, 16)
OUTN = num('out', '出力（1–6）', 1, 1, 6)
FXN = num('fx', 'FX（1–4）', 1, 1, 4)

actions = [
    act('mute', 'ミュート', [sel('t', '対象', MUTE_TARGETS), MUTE_ON], f'{addr(by_choice("t"))} B0 06 00 B0 26 {{{{option.on}}}}', '{{option.t}} {{option.on}}'),
    act('mute_toggle', 'ミュートを切り替え', [sel('t', '対象', MUTE_TARGETS)], f'{addr(by_choice("t"))} B0 60 00', '{{option.t}} 切り替え'),
    act('level_lr', '入力 → メイン LR のレベル', [sel('t', '入力', SOURCES), LEVELS], f'{addr(by_choice("t"))} {VALUE}', '{{option.t}} → LR'),
    act('level_lr_raw', '入力 → メイン LR のレベル（数値）', [sel('t', '入力', SOURCES), RAW], f'{addr(by_choice("t"))} {VALUE}'),
    act('level_lr_step', '入力 → メイン LR のレベルを上げ下げ', [sel('t', '入力', SOURCES), STEP], f'{addr(by_choice("t"))} B0 {{{{option.step}}}} 00'),
    act('level_fxr_lr', 'FX リターン → メイン LR のレベル', [sel('t', 'FX', FX_RETURNS), LEVELS], f'{addr(by_choice("t"))} {VALUE}'),
    act('level_out', '入力 → 出力のレベル', [IP, OUTN, LEVELS], f'{addr("option.ip|lin:12:" + str(p(0x40, 0x44) - 13) + "|plus:out")} {VALUE}',
        '入力 {{option.ip}} → 出力 {{option.out}}'),
    act('level_fx', '入力 → FX センドのレベル', [IP, FXN, LEVELS], f'{addr("option.ip|lin:4:" + str(p(0x4C, 0x14) - 5) + "|plus:fx")} {VALUE}',
        '入力 {{option.ip}} → FX {{option.fx}}'),
    act('master', 'マスターのレベル', [sel('t', '対象', MASTERS), LEVELS], f'{addr(by_choice("t"))} {VALUE}', '{{option.t}} マスター'),
    act('master_raw', 'マスターのレベル（数値）', [sel('t', '対象', MASTERS), RAW], f'{addr(by_choice("t"))} {VALUE}'),
    act('master_step', 'マスターのレベルを上げ下げ', [sel('t', '対象', MASTERS), STEP], f'{addr(by_choice("t"))} B0 {{{{option.step}}}} 00'),
    act('pan_lr', '入力 → メイン LR のパン', [IP, num('pan', 'パン（−100 左 – 0 中央 – 100 右）', 0, -100, 100)],
        f'{addr("option.ip|lin:1:" + str(p(0x50, 0) - 1))} B0 06 {{{{option.pan|lin:81.915:8191.5|r14h:1|hexu|pad2}}}} B0 26 {{{{option.pan|lin:81.915:8191.5|r14l:1|hexu|pad2}}}}',
        '入力 {{option.ip}} パン {{option.pan}}'),
    act('scene', 'シーンを呼び出す', [num('scene', 'シーン（1–100）', 1, 1, 100)], 'B0 00 00 C0 {{option.scene|lin:1:-1|hexu|pad2}}', 'シーン {{option.scene}}'),
    act('softkey', 'ソフトキーを押して離す', [num('key', 'ソフトキー（1–8）', 1, 1, 8)], '90 {{option.key|lin:1:47|hexu|pad2}} 7F 80 {{option.key|lin:1:47|hexu|pad2}} 00',
        'ソフトキー {{option.key}}'),
    {'id': 'command', 'name': 'MIDI を送る（16 進）',
     'options': [{'id': 'hex', 'label': 'MIDI（16 進）', 'type': 'text', 'placeholder': 'B0 63 00 B0 62 00 B0 60 00', 'pattern': '^([0-9A-Fa-f]{2} ?)+$', 'mono': True}],
     'send': {'kind': 'bytes', 'data': '{{option.hex}}', 'encoding': 'hex'}, 'summary': '{{option.hex}}'},
]

presets = [
    {'id': f'mute{n}', 'category': 'ミュート', 'name': f'入力 {n} のミュート', 'text': f'MUTE\nCH {n}', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'mute_toggle', 'options': {'t': str(p(0, n - 1))}}} for n in range(1, 17)
] + [
    {'id': f'scene{n}', 'category': 'シーン', 'name': f'シーン {n}', 'text': f'SCENE\n{n}', 'backgroundColor': '#1F5FD6',
     'action': {'definitionId': 'scene', 'options': {'scene': n}}} for n in range(1, 9)
]

definition = {
    'format': 1,
    'id': 'allenheath-cq',
    'name': 'Allen & Heath CQ シリーズ',
    'category': '音響ミキサー',
    'version': '1.0.0',
    'minAppVersion': '0.6.0',
    'transport': 'tcp',
    'configFields': [HOST, PORT],
    'actions': actions,
    'feedbacks': [],
    'variables': [],
    'presets': presets,
    'evidence': [
        {'title': 'Allen & Heath「CQ MIDI Protocol V1.2.0 issue 4」：TCP 51325・チャンネル 1、ミュート・レベル・パンの番号、シーン、ソフトキー',
         'url': 'https://www.rentex.com/wp-content/uploads/2025/03/CQ_MIDI_Protocol_V1_2_0_iss4.pdf', 'status': '確認済',
         'note': 'メーカーの PDF の写し（販売店のサイト）。パンの中央は資料どおり 40 00'},
        {'title': '受信（本体からの状態）はまだ使っていない', 'status': '確認済'},
    ],
}

OUT.write_text(json.dumps(definition, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('wrote', OUT.name, len(actions), 'actions')
