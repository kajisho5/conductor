#!/usr/bin/env python3
"""Resolume Arena / Avenue（OSC、UDP 7000）のドライバ定義（JSON）を作る（SPEC 7.1・8.20）。

アドレスと値の形は公開 OSS のモジュール resolume-arena（MIT、3.13.0-beta.4）の src/arena-api/osc.ts・src/actions/osc-transport を読んで写した
（モジュールは本体とつながらないと送らないため、conductor-drivers の自動変換では 2 個しか取れなかった）。
「押す」系（クリップ・列・消す・タップなど）はモジュールと同じく 1 を送ってから 0 を送る。
ポート 7000 は Resolume 公式の OSC の説明（https://resolume.com/support/en/osc）。
手で JSON を直さず、このスクリプトを直して再生成する。
使い方：python3 scripts/drivers/build_resolume.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'src' / 'drivers' / 'defs' / 'resolume.json'
HOST = {'id': 'host', 'label': 'IP アドレス', 'type': 'text', 'placeholder': '192.168.0.80', 'pattern': '^[A-Za-z0-9.:\\-]+$', 'mono': True}
PORT = {'id': 'port', 'label': 'ポート（Resolume の設定 > OSC の入力）', 'type': 'number', 'default': 7000, 'min': 1, 'max': 65535}


def num(id_, label, default, lo, hi, help_=None):
    f = {'id': id_, 'label': label, 'type': 'number', 'default': default, 'min': lo, 'max': hi}
    if help_:
        f['help'] = help_
    return f


def sel(id_, label, pairs, default=None):
    return {'id': id_, 'label': label, 'type': 'select', 'default': default if default is not None else pairs[0][0],
            'choices': [{'id': i, 'label': l} for i, l in pairs]}


def osc(address, t, v):
    return {'kind': 'osc', 'address': address, 'args': [{'type': t, 'value': v}]}


def trigger(id_, name, options, address, summary=None):
    """1 を送ってすぐ 0 を送る（ボタンを押して離す）"""
    a = {'id': id_, 'name': name, 'options': list(options), 'send': osc(address, 'i', '1'), 'more': [osc(address, 'i', '0')]}
    if summary:
        a['summary'] = summary
    return a


def setv(id_, name, options, address, t, v, summary=None):
    a = {'id': id_, 'name': name, 'options': list(options), 'send': osc(address, t, v)}
    if summary:
        a['summary'] = summary
    return a


LAYER = num('layer', 'レイヤー', 1, 1, 100)
COLUMN = num('column', '列（クリップ）', 1, 1, 1000)
GROUP = num('group', 'レイヤーグループ', 1, 1, 50)
DECK = num('deck', 'デッキ', 1, 1, 100)
LEVEL = num('value', '値（0.0–1.0）', 1, 0, 1)
NORM = num('value', '値（0.0–1.0）', 0.5, 0, 1)
ONOFF = sel('on', '状態', [('1', 'ON'), ('0', 'OFF')])
DIRECTION = sel('dir', '向き', [('2', '前へ再生'), ('1', '一時停止'), ('0', '後ろへ再生')])

actions = [
    # ---- クリップ・列
    trigger('clip_connect', 'クリップを出す', [LAYER, COLUMN], '/composition/layers/{{option.layer}}/clips/{{option.column}}/connect',
            'レイヤー {{option.layer}} クリップ {{option.column}}'),
    setv('clip_select', 'クリップを選ぶ', [LAYER, COLUMN], '/composition/layers/{{option.layer}}/clips/{{option.column}}/select', 'i', '1',
         '選ぶ {{option.layer}}-{{option.column}}'),
    trigger('column_connect', '列を出す', [COLUMN], '/composition/columns/{{option.column}}/connect', '列 {{option.column}}'),
    setv('column_select', '列を選ぶ', [COLUMN], '/composition/columns/{{option.column}}/select', 'i', '1', '列を選ぶ {{option.column}}'),
    trigger('next_column', '次の列', [], '/composition/connectnextcolumn', '次の列'),
    trigger('prev_column', '前の列', [], '/composition/connectprevcolumn', '前の列'),
    trigger('layer_next_clip', 'レイヤーの次のクリップ', [LAYER], '/composition/layers/{{option.layer}}/connectnextclip', 'レイヤー {{option.layer}} 次'),
    trigger('layer_prev_clip', 'レイヤーの前のクリップ', [LAYER], '/composition/layers/{{option.layer}}/connectprevclip', 'レイヤー {{option.layer}} 前'),
    # ---- 消す
    trigger('layer_clear', 'レイヤーを消す', [LAYER], '/composition/layers/{{option.layer}}/clear', 'レイヤー {{option.layer}} を消す'),
    trigger('clear_all', 'すべて消す', [], '/composition/disconnectall', 'すべて消す'),
    trigger('group_clear', 'レイヤーグループを消す', [GROUP], '/composition/groups/{{option.group}}/disconnectlayers', 'グループ {{option.group}} を消す'),
    # ---- レイヤー
    setv('layer_opacity', 'レイヤーの不透明度', [LAYER, LEVEL], '/composition/layers/{{option.layer}}/video/opacity', 'f', '{{option.value}}',
         'レイヤー {{option.layer}} 不透明度 {{option.value}}'),
    setv('layer_volume', 'レイヤーの音量', [LAYER, LEVEL], '/composition/layers/{{option.layer}}/audio/volume', 'f', '{{option.value}}',
         'レイヤー {{option.layer}} 音量 {{option.value}}'),
    setv('layer_master', 'レイヤーのマスター', [LAYER, LEVEL], '/composition/layers/{{option.layer}}/master', 'f', '{{option.value}}',
         'レイヤー {{option.layer}} マスター {{option.value}}'),
    setv('layer_bypass', 'レイヤーのバイパス', [LAYER, ONOFF], '/composition/layers/{{option.layer}}/bypassed', 'i', '{{option.on}}',
         'レイヤー {{option.layer}} バイパス {{option.on}}'),
    setv('layer_bypass_toggle', 'レイヤーのバイパスを切り替え', [LAYER], '/composition/layers/{{option.layer}}/bypassed', 's', '!',
         'レイヤー {{option.layer}} バイパス切り替え'),
    setv('layer_solo', 'レイヤーのソロ', [LAYER, ONOFF], '/composition/layers/{{option.layer}}/solo', 'i', '{{option.on}}',
         'レイヤー {{option.layer}} ソロ {{option.on}}'),
    setv('layer_solo_toggle', 'レイヤーのソロを切り替え', [LAYER], '/composition/layers/{{option.layer}}/solo', 's', '!', 'レイヤー {{option.layer}} ソロ切り替え'),
    setv('layer_select', 'レイヤーを選ぶ', [LAYER], '/composition/layers/{{option.layer}}/select', 'i', '1', 'レイヤー {{option.layer}} を選ぶ'),
    setv('layer_transition', 'レイヤーのトランジションの長さ', [LAYER, NORM], '/composition/layers/{{option.layer}}/transition/duration', 'f', '{{option.value}}',
         'レイヤー {{option.layer}} トランジション {{option.value}}'),
    setv('layer_speed', 'レイヤーの速さ', [LAYER, NORM], '/composition/layers/{{option.layer}}/speed', 'f', '{{option.value}}',
         'レイヤー {{option.layer}} 速さ {{option.value}}'),
    setv('layer_direction', 'レイヤーの再生の向き', [LAYER, DIRECTION], '/composition/layers/{{option.layer}}/direction', 'i', '{{option.dir}}',
         'レイヤー {{option.layer}} 向き {{option.dir}}'),
    # ---- クリップの再生
    setv('clip_direction', 'クリップの再生 / 一時停止', [LAYER, COLUMN, DIRECTION],
         '/composition/layers/{{option.layer}}/clips/{{option.column}}/transport/position/behaviour/direction', 'i', '{{option.dir}}',
         'クリップ {{option.layer}}-{{option.column}} {{option.dir}}'),
    setv('clip_position', 'クリップの再生位置', [LAYER, COLUMN, num('value', '位置（0.0 最初 – 1.0 最後）', 0, 0, 1)],
         '/composition/layers/{{option.layer}}/clips/{{option.column}}/transport/position', 'f', '{{option.value}}',
         'クリップ {{option.layer}}-{{option.column}} 位置 {{option.value}}'),
    setv('clip_restart', 'クリップを最初から', [LAYER, COLUMN], '/composition/layers/{{option.layer}}/clips/{{option.column}}/transport/position', 'f', '0',
         'クリップ {{option.layer}}-{{option.column}} 最初から'),
    setv('clip_opacity', 'クリップの不透明度', [LAYER, COLUMN, LEVEL], '/composition/layers/{{option.layer}}/clips/{{option.column}}/video/opacity', 'f',
         '{{option.value}}', 'クリップ {{option.layer}}-{{option.column}} 不透明度 {{option.value}}'),
    setv('clip_volume', 'クリップの音量', [LAYER, COLUMN, LEVEL], '/composition/layers/{{option.layer}}/clips/{{option.column}}/audio/volume', 'f',
         '{{option.value}}', 'クリップ {{option.layer}}-{{option.column}} 音量 {{option.value}}'),
    setv('clip_speed', 'クリップの速さ', [LAYER, COLUMN, NORM],
         '/composition/layers/{{option.layer}}/clips/{{option.column}}/transport/position/behaviour/speed', 'f', '{{option.value}}',
         'クリップ {{option.layer}}-{{option.column}} 速さ {{option.value}}'),
    # ---- レイヤーグループ
    trigger('group_column', 'レイヤーグループの列を出す', [GROUP, COLUMN], '/composition/groups/{{option.group}}/columns/{{option.column}}/connect',
            'グループ {{option.group}} 列 {{option.column}}'),
    setv('group_bypass', 'レイヤーグループのバイパス', [GROUP, ONOFF], '/composition/groups/{{option.group}}/bypassed', 'i', '{{option.on}}',
         'グループ {{option.group}} バイパス {{option.on}}'),
    setv('group_solo', 'レイヤーグループのソロ', [GROUP, ONOFF], '/composition/groups/{{option.group}}/solo', 'i', '{{option.on}}',
         'グループ {{option.group}} ソロ {{option.on}}'),
    setv('group_select', 'レイヤーグループを選ぶ', [GROUP], '/composition/groups/{{option.group}}/select', 'i', '1', 'グループ {{option.group}} を選ぶ'),
    setv('group_opacity', 'レイヤーグループの不透明度', [GROUP, LEVEL], '/composition/groups/{{option.group}}/video/opacity', 'f', '{{option.value}}',
         'グループ {{option.group}} 不透明度 {{option.value}}'),
    setv('group_volume', 'レイヤーグループの音量', [GROUP, LEVEL], '/composition/groups/{{option.group}}/audio/volume', 'f', '{{option.value}}',
         'グループ {{option.group}} 音量 {{option.value}}'),
    setv('group_master', 'レイヤーグループのマスター', [GROUP, LEVEL], '/composition/groups/{{option.group}}/master', 'f', '{{option.value}}',
         'グループ {{option.group}} マスター {{option.value}}'),
    setv('group_speed', 'レイヤーグループの速さ', [GROUP, NORM], '/composition/groups/{{option.group}}/speed', 'f', '{{option.value}}',
         'グループ {{option.group}} 速さ {{option.value}}'),
    setv('group_direction', 'レイヤーグループの再生の向き', [GROUP, DIRECTION], '/composition/groups/{{option.group}}/direction', 'i', '{{option.dir}}',
         'グループ {{option.group}} 向き {{option.dir}}'),
    # ---- コンポジション全体
    setv('comp_opacity', '全体の不透明度', [LEVEL], '/composition/video/opacity', 'f', '{{option.value}}', '全体 不透明度 {{option.value}}'),
    setv('comp_volume', '全体の音量', [LEVEL], '/composition/audio/volume', 'f', '{{option.value}}', '全体 音量 {{option.value}}'),
    setv('comp_master', '全体のマスター', [LEVEL], '/composition/master', 'f', '{{option.value}}', '全体 マスター {{option.value}}'),
    setv('comp_speed', '全体の速さ', [NORM], '/composition/speed', 'f', '{{option.value}}', '全体 速さ {{option.value}}'),
    setv('comp_direction', '全体の再生の向き', [DIRECTION], '/composition/direction', 'i', '{{option.dir}}', '全体 向き {{option.dir}}'),
    setv('tempo', 'テンポ（BPM）', [num('bpm', 'BPM', 120, 20, 500)], '/composition/tempocontroller/tempo', 'f', '{{option.bpm}}', 'テンポ {{option.bpm}}'),
    trigger('tempo_tap', 'テンポをタップ', [], '/composition/tempocontroller/tempotap', 'タップ'),
    trigger('tempo_resync', 'テンポを合わせ直す', [], '/composition/tempocontroller/resync', 'リシンク'),
    # ---- デッキ
    setv('deck_select', 'デッキを選ぶ', [DECK], '/composition/decks/{{option.deck}}/select', 'i', '1', 'デッキ {{option.deck}}'),
    trigger('next_deck', '次のデッキ', [], '/composition/selectnextdeck', '次のデッキ'),
    trigger('prev_deck', '前のデッキ', [], '/composition/selectprevdeck', '前のデッキ'),
    # ---- そのまま
    setv('osc_f', 'OSC を送る（数）', [{'id': 'address', 'label': 'アドレス', 'type': 'text', 'default': '/composition/master', 'mono': True},
                                    num('value', '値', 1, -100000, 100000)], '{{option.address}}', 'f', '{{option.value}}', '{{option.address}} {{option.value}}'),
    setv('osc_i', 'OSC を送る（整数）', [{'id': 'address', 'label': 'アドレス', 'type': 'text', 'default': '/composition/layers/1/clear', 'mono': True},
                                     num('value', '値', 1, -100000, 100000)], '{{option.address}}', 'i', '{{option.value}}', '{{option.address}} {{option.value}}'),
]

presets = [
    {'id': f'col{n}', 'category': '列', 'name': f'列 {n}', 'text': f'COLUMN\n{n}', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'column_connect', 'options': {'column': n}}} for n in range(1, 9)
] + [
    {'id': f'clear{n}', 'category': '消す', 'name': f'レイヤー {n} を消す', 'text': f'CLEAR\nL{n}', 'backgroundColor': '#6E1616',
     'action': {'definitionId': 'layer_clear', 'options': {'layer': n}}} for n in range(1, 5)
] + [
    {'id': 'clearall', 'category': '消す', 'name': 'すべて消す', 'text': 'CLEAR\nALL', 'backgroundColor': '#6E1616', 'action': {'definitionId': 'clear_all', 'options': {}}},
    {'id': 'next', 'category': '列', 'name': '次の列', 'text': 'NEXT', 'backgroundColor': '#1F9E48', 'action': {'definitionId': 'next_column', 'options': {}}},
    {'id': 'prev', 'category': '列', 'name': '前の列', 'text': 'PREV', 'backgroundColor': '#2A2A2E', 'action': {'definitionId': 'prev_column', 'options': {}}},
    {'id': 'tap', 'category': 'テンポ', 'name': 'タップ', 'text': 'TAP', 'backgroundColor': '#F2C200', 'action': {'definitionId': 'tempo_tap', 'options': {}}},
]

definition = {
    'format': 1,
    'id': 'resolume',
    'name': 'Resolume Arena / Avenue',
    'category': 'メディアサーバー',
    'version': '1.0.0',
    'minAppVersion': '0.6.0',
    'transport': 'osc',
    'configFields': [HOST, PORT],
    'actions': actions,
    'feedbacks': [],
    'variables': [],
    'presets': presets,
    'evidence': [
        {'title': 'OSC のアドレスと値の形（connect / clear は 1 → 0、バイパス・ソロの切り替えは文字 "!"、向きは 0 後ろ・1 停止・2 前）',
         'status': '確認済', 'note': '公開 OSS のモジュール resolume-arena（MIT、3.13.0-beta.4）の src/arena-api/osc.ts と src/actions/osc-transport を読んだ'},
        {'title': 'OSC の入力ポート 7000（既定）', 'url': 'https://resolume.com/support/en/osc', 'status': '確認済'},
        {'title': '状態（今のクリップなど）の受け取りはまだ', 'status': '確認済'},
    ],
}

OUT.write_text(json.dumps(definition, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('wrote', OUT.name, len(actions), 'actions')
