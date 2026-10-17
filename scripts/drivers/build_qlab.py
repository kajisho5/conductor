#!/usr/bin/env python3
"""QLab 5（OSC、UDP 53000）のドライバ定義（JSON）を作る（SPEC 7.1・8.12）。

OSC の組み立ては汎用 OSC と同じ。アドレスの根拠：QLab 5 公式資料「OSC Dictionary v5」。
ワークスペースの指定（/workspace/名前）は設定の「宛先」に入れる。空なら開いているすべてのワークスペースが受け取る（QLab 5 の仕様）。
手で JSON を直さず、このスクリプトを直して再生成する。
使い方：python3 scripts/drivers/build_qlab.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'src' / 'drivers' / 'defs' / 'qlab.json'
HOST = {'id': 'host', 'label': 'IP アドレス', 'type': 'text', 'placeholder': '192.168.10.70', 'pattern': '^[A-Za-z0-9.:\\-]+$', 'mono': True}
PORT = {'id': 'port', 'label': 'ポート', 'type': 'number', 'default': 53000, 'min': 1, 'max': 65535}
PREFIX = {'id': 'prefix', 'label': '宛先のワークスペース', 'type': 'text', 'default': '', 'placeholder': '/workspace/DEMO-SHOW', 'mono': True,
          'pattern': '^(/workspace/[^\\s/]+)?$',
          'help': '空ならすべてのワークスペース。1 つに絞る時は /workspace/名前（名前は空白なし・.qlab5 を付けない）'}
W = '{{config.prefix}}'


def text(id_, label, default='', placeholder=''):
    f = {'id': id_, 'label': label, 'type': 'text', 'default': default}
    if placeholder:
        f['placeholder'] = placeholder
    return f


def num(id_, label, default, lo, hi):
    return {'id': id_, 'label': label, 'type': 'number', 'default': default, 'min': lo, 'max': hi}


def sel(id_, label, pairs, default=None):
    return {'id': id_, 'label': label, 'type': 'select', 'default': default if default is not None else pairs[0][0],
            'choices': [{'id': i, 'label': l} for i, l in pairs]}


def osc(id_, name, options, address, args=(), summary=None):
    a = {'id': id_, 'name': name, 'options': list(options), 'send': {'kind': 'osc', 'address': address, 'args': [{'type': t, 'value': v} for t, v in args]}}
    if summary:
        a['summary'] = summary
    return a


CUE = text('cue', 'キュー番号', '1', '1')
ON_OFF = sel('on', '状態', [('1', 'ON'), ('0', 'OFF')])
OVERRIDES = [
    ('midiInputEnabled', 'MIDI 入力'), ('midiOutputEnabled', 'MIDI 出力'), ('mscInputEnabled', 'MSC 入力'), ('mscOutputEnabled', 'MSC 出力'),
    ('sysexInputEnabled', 'SysEx 入力'), ('sysexOutputEnabled', 'SysEx 出力'), ('oscOutputEnabled', 'OSC 出力（v4）'), ('timecodeInputEnabled', 'タイムコード入力'),
    ('timecodeOutputEnabled', 'タイムコード出力'), ('artNetEnabled', 'Art-Net（v4）'), ('dmxOutputEnabled', 'DMX 出力'),
    ('networkExternalInputEnabled', '外部ネットワーク入力'), ('networkExternalOutputEnabled', '外部ネットワーク出力'),
    ('networkLocalInputEnabled', 'ローカルネットワーク入力'), ('networkLocalOutputEnabled', 'ローカルネットワーク出力'),
]
COLOR = sel('color', '色', [('none', 'なし'), ('red', '赤'), ('orange', 'オレンジ'), ('yellow', '黄'), ('green', '緑'), ('cyan', 'シアン'), ('blue', '青'),
                           ('purple', '紫'), ('magenta', 'マゼンタ'), ('gray', 'グレー')])
CUE_METHODS = [
    ('start', 'スタート'), ('stop', '停止'), ('pause', '一時停止'), ('resume', '再開'), ('togglePause', '一時停止 / 再開'),
    ('load', '読み込み'), ('preview', 'プレビュー'), ('panic', 'パニック（フェードして止める）'), ('hardStop', 'すぐ止める'), ('reset', 'リセット'),
]
TARGET = sel('target', '対象', [('selected', '選んでいるキュー'), ('playhead', '再生ヘッドのキュー'), ('active', '再生中のキュー')])

actions = [
    # ---- ワークスペース全体
    osc('go', 'GO', [], f'{W}/go', summary='GO'),
    osc('go_cue', 'キューから GO', [CUE], f'{W}/go', [('s', '{{option.cue}}')], 'GO {{option.cue}}'),
    osc('stop', 'すべて停止', [], f'{W}/stop', summary='停止'),
    osc('pause', 'すべて一時停止', [], f'{W}/pause', summary='一時停止'),
    osc('resume', 'すべて再開', [], f'{W}/resume', summary='再開'),
    osc('panic', 'パニック', [], f'{W}/panic', summary='パニック'),
    osc('panic_in_time', 'パニック（時間を決めて）', [num('sec', '秒', 2, 0, 600)], f'{W}/panicInTime', [('f', '{{option.sec}}')], 'パニック {{option.sec}} 秒'),
    osc('hard_stop', 'すぐ止める', [], f'{W}/hardStop', summary='すぐ止める'),
    osc('reset', 'リセット', [], f'{W}/reset', summary='リセット'),
    osc('playhead', '再生ヘッドをキューへ', [CUE], f'{W}/playhead/{{{{option.cue}}}}', summary='再生ヘッド → {{option.cue}}'),
    osc('playhead_move', '再生ヘッドを前後へ', [sel('to', '向き', [('next', '次'), ('previous', '前')])], f'{W}/playhead/{{{{option.to}}}}',
        summary='再生ヘッド {{option.to}}'),
    osc('select', 'キューを選ぶ', [CUE], f'{W}/select/{{{{option.cue}}}}', summary='選ぶ {{option.cue}}'),
    osc('select_move', '選ぶキューを前後へ', [sel('to', '向き', [('next', '次'), ('previous', '前')])], f'{W}/select/{{{{option.to}}}}', summary='選ぶ {{option.to}}'),
    osc('audition_go', '試聴で GO', [CUE], f'{W}/auditionGo', [('s', '{{option.cue}}')], '試聴 {{option.cue}}'),
    osc('show_mode', 'ショーモード / 編集モード', [sel('on', 'モード', [('1', 'ショーモード'), ('0', '編集モード')])], f'{W}/showMode', [('i', '{{option.on}}')],
        'モード {{option.on}}'),
    osc('toggle_mode', 'ショーモードと編集モードを切り替え', [], f'{W}/toggleEditShowMode', summary='モード切り替え'),
    osc('connect', 'ワークスペースにつなぐ（パスコード）', [text('passcode', 'パスコード', '', '1234')], f'{W}/connect', [('s', '{{option.passcode}}')], 'パスコード'),
    # ---- キュー
    osc('cue_method', 'キューの操作', [CUE, sel('method', '操作', CUE_METHODS)], f'{W}/cue/{{{{option.cue}}}}/{{{{option.method}}}}',
        summary='{{option.cue}} {{option.method}}'),
    osc('cue_method_special', 'キューの操作（選んでいる・再生ヘッド・再生中）', [TARGET, sel('method', '操作', CUE_METHODS)],
        f'{W}/cue/{{{{option.target}}}}/{{{{option.method}}}}', summary='{{option.target}} {{option.method}}'),
    osc('cue_flagged', 'キューの旗', [CUE, sel('on', '状態', [('toggle', '切り替え'), ('1', '付ける'), ('0', '外す')])], f'{W}/cue/{{{{option.cue}}}}/flagged',
        [('s', '{{option.on}}')], '{{option.cue}} 旗 {{option.on}}'),
    osc('cue_armed', 'キューの有効 / 無効', [CUE, sel('on', '状態', [('1', '有効'), ('0', '無効')])], f'{W}/cue/{{{{option.cue}}}}/armed', [('i', '{{option.on}}')],
        '{{option.cue}} armed {{option.on}}'),
    osc('cue_prewait', 'キューのプリウェイト', [CUE, num('sec', '秒', 0, 0, 3600)], f'{W}/cue/{{{{option.cue}}}}/preWait', [('f', '{{option.sec}}')],
        '{{option.cue}} プリウェイト {{option.sec}}'),
    osc('cue_duration', 'キューの長さ', [CUE, num('sec', '秒', 5, 0, 36000)], f'{W}/cue/{{{{option.cue}}}}/duration', [('f', '{{option.sec}}')],
        '{{option.cue}} 長さ {{option.sec}}'),
    osc('cue_name', 'キューの名前', [CUE, text('name', '名前', '', 'DEMO-CUE')], f'{W}/cue/{{{{option.cue}}}}/name', [('s', '{{option.name}}')],
        '{{option.cue}} → {{option.name}}'),
    osc('cue_notes', 'キューのメモ', [CUE, text('notes', 'メモ')], f'{W}/cue/{{{{option.cue}}}}/notes', [('s', '{{option.notes}}')], '{{option.cue}} メモ'),
    osc('cue_level', 'オーディオキューの音量（マスター）', [CUE, num('db', 'dB', 0, -60, 12)], f'{W}/cue/{{{{option.cue}}}}/level/0/0', [('f', '{{option.db}}')],
        '{{option.cue}} {{option.db}} dB'),
    osc('cue_color', 'キューの色', [CUE, COLOR],
        f'{W}/cue/{{{{option.cue}}}}/colorName', [('s', '{{option.color}}')], '{{option.cue}} 色 {{option.color}}'),
    # ---- 試聴・上書き・選んでいるキュー（公開 OSS のモジュール figure53-qlab-advance（MIT）が送る OSC と同じアドレス）
    osc('live_fade_preview', 'ライブフェードのプレビュー', [ON_OFF], f'{W}/liveFadePreview', [('i', '{{option.on}}')], 'ライブフェード {{option.on}}'),
    osc('always_audition', '常に試聴', [ON_OFF], f'{W}/alwaysAudition', [('i', '{{option.on}}')], '常に試聴 {{option.on}}'),
    osc('audition_monitors', '試聴モニター', [ON_OFF], f'{W}/auditionMonitors', [('i', '{{option.on}}')], '試聴モニター {{option.on}}'),
    osc('override_window', '上書きの窓', [ON_OFF], f'{W}/overrideWindow', [('i', '{{option.on}}')], '上書きの窓 {{option.on}}'),
    osc('override', '入出力の上書き', [sel('which', '対象', OVERRIDES), ON_OFF], f'{W}/overrides/{{{{option.which}}}}', [('i', '{{option.on}}')],
        '{{option.which}} {{option.on}}'),
    osc('add_slice', '選んでいるキューにスライス', [], f'{W}/cue/selected/addSliceMarker', summary='スライス'),
    osc('audition_preview', '選んでいるキューを試聴でプレビュー', [], f'{W}/cue/selected/auditionPreview', summary='試聴プレビュー'),
    osc('continue_mode', '選んでいるキューの続け方', [sel('mode', '続け方', [('0', '続けない'), ('1', '自動で続ける'), ('2', '自動で追う')])],
        f'{W}/cue/selected/continueMode', [('i', '{{option.mode}}')], '続け方 {{option.mode}}'),
    osc('selected_color', '選んでいるキューの色', [COLOR], f'{W}/cue/selected/colorName', [('s', '{{option.color}}')], '色 {{option.color}}'),
    # ---- そのまま
    osc('message', 'OSC を送る（値なし）', [text('address', 'アドレス', '/go', '/go')], '{{option.address}}', summary='{{option.address}}'),
    osc('message_s', 'OSC を送る（文字の値）', [text('address', 'アドレス', '/go', '/go'), text('value', '値', '1')],
        '{{option.address}}', [('s', '{{option.value}}')], '{{option.address}} {{option.value}}'),
]

presets = [
    {'id': 'go', 'category': '再生', 'name': 'GO', 'text': 'GO', 'backgroundColor': '#1F9E48', 'action': {'definitionId': 'go', 'options': {}}},
    {'id': 'stop', 'category': '再生', 'name': '停止', 'text': 'STOP', 'backgroundColor': '#E0302B', 'action': {'definitionId': 'stop', 'options': {}}},
    {'id': 'panic', 'category': '再生', 'name': 'パニック', 'text': 'PANIC', 'backgroundColor': '#6E1616', 'action': {'definitionId': 'panic', 'options': {}}},
    {'id': 'pause', 'category': '再生', 'name': '一時停止', 'text': 'PAUSE', 'backgroundColor': '#F2C200', 'action': {'definitionId': 'pause', 'options': {}}},
    {'id': 'resume', 'category': '再生', 'name': '再開', 'text': 'RESUME', 'backgroundColor': '#2A2A2E', 'action': {'definitionId': 'resume', 'options': {}}},
    {'id': 'next', 'category': '再生ヘッド', 'name': '次へ', 'text': 'NEXT', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'playhead_move', 'options': {'to': 'next'}}},
    {'id': 'prev', 'category': '再生ヘッド', 'name': '前へ', 'text': 'PREV', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'playhead_move', 'options': {'to': 'previous'}}},
] + [
    {'id': f'cue{n}', 'category': 'キュー', 'name': f'キュー {n} をスタート', 'text': f'CUE\n{n}', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'cue_method', 'options': {'cue': str(n), 'method': 'start'}}} for n in range(1, 9)
]

definition = {
    'format': 1,
    'id': 'qlab',
    'name': 'QLab 5',
    'category': 'ショーコントロール',
    'version': '1.0.0',
    'minAppVersion': '0.6.0',
    'transport': 'osc',
    'configFields': [HOST, PORT, PREFIX],
    'actions': actions,
    'feedbacks': [],
    'variables': [],
    'presets': presets,
    'evidence': [
        {'title': 'QLab 5「OSC Dictionary v5」：ポート 53000、/workspace/{id}/go・stop・pause・resume・panic・panicInTime・hardStop・reset・playhead・select・auditionGo・showMode・connect、/cue/{番号}/flagged・preWait',
         'url': 'https://qlab.app/docs/v5/scripting/osc-dictionary-v5/', 'status': '確認済'},
        {'title': 'キューの操作（/cue/…/start・stop・pause・resume・togglePause・load・preview・panic・hardStop・reset、armed・duration・name・notes・level・colorName）',
         'url': 'https://qlab.app/docs/v5/scripting/osc-dictionary-v5/', 'status': '推測', 'note': '資料の取得で一部の節を読めなかった。実機で確かめる'},
        {'title': '試聴・上書き・選んでいるキューのアドレス：公開 OSS のモジュール figure53-qlab-advance（MIT）を conductor-drivers の Actions で動かした送信', 'status': '確認済'},
        {'title': '返事（UDP 53001）と状態の受け取りはまだ使っていない', 'status': '確認済'},
    ],
}

OUT.write_text(json.dumps(definition, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('wrote', OUT.relative_to(OUT.parents[3]))
