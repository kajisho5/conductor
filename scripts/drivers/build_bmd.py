#!/usr/bin/env python3
"""Blackmagic の文字の手順の機器（HyperDeck・Videohub）のドライバ定義（JSON）を作る（SPEC 7.1・8.7）。

受信の解析はアプリ組み込みの通信手順 bmd-text（src/drivers/bmdText.ts）が行う（ブロック → 変数）。
根拠：Blackmagic 公式の HyperDeck Ethernet Protocol・Videohub Ethernet Protocol（開発者資料、公開）。
手で JSON を直さず、このスクリプトを直して再生成する。
使い方：python3 scripts/drivers/build_bmd.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'src' / 'drivers' / 'defs'
LF = '\\n'
HOST = {'id': 'host', 'label': 'IP アドレス', 'type': 'text', 'placeholder': '192.168.10.50', 'pattern': '^[A-Za-z0-9.:\\-]+$', 'mono': True}


def port(n):
    return {'id': 'port', 'label': 'ポート', 'type': 'number', 'default': n, 'min': 1, 'max': 65535}


def sel(id_, label, pairs, default=None):
    return {'id': id_, 'label': label, 'type': 'select', 'default': default if default is not None else pairs[0][0],
            'choices': [{'id': i, 'label': l} for i, l in pairs]}


def num(id_, label, default, lo, hi, help_=None):
    f = {'id': id_, 'label': label, 'type': 'number', 'default': default, 'min': lo, 'max': hi}
    if help_:
        f['help'] = help_
    return f


def text(id_, label, placeholder, pattern=None):
    f = {'id': id_, 'label': label, 'type': 'text', 'placeholder': placeholder}
    if pattern:
        f['pattern'] = pattern
    return f


def act(id_, name, options, data, summary=None):
    a = {'id': id_, 'name': name, 'options': options, 'send': {'kind': 'bytes', 'data': data, 'encoding': 'text', 'terminator': LF}}
    if summary:
        a['summary'] = summary
    return a


TC = '^[+-]?\\d{2}:\\d{2}:\\d{2}[:;]\\d{2}$'

# ---------------------------------------------------------------- HyperDeck（TCP 9993）
hyperdeck_actions = [
    act('play', '再生', [], 'play'),
    act('play_speed', '速さを決めて再生', [num('speed', '速さ（%）', 100, -5000, 5000, '100 が等速。マイナスで逆再生')], 'play: speed: {{option.speed}}',
        summary='再生 {{option.speed}}%'),
    act('play_loop', 'ループ再生', [sel('on', 'ループ', [('true', 'ON'), ('false', 'OFF')])], 'play: loop: {{option.on}}'),
    act('play_single', '1 クリップだけ再生', [sel('on', '1 クリップだけ', [('true', 'ON'), ('false', 'OFF')])], 'play: single clip: {{option.on}}'),
    act('stop', '停止', [], 'stop'),
    act('record', '収録', [], 'record'),
    act('record_name', '名前を付けて収録', [text('name', 'ファイル名', 'DEMO-CLIP')], 'record: name: {{option.name}}'),
    act('preview', 'プレビュー（入力を表示）', [sel('on', 'プレビュー', [('true', 'ON'), ('false', 'OFF')])], 'preview: enable: {{option.on}}'),
    act('goto_clip', 'クリップへ移動', [num('clip', 'クリップ番号', 1, 1, 9999)], 'goto: clip id: {{option.clip}}', summary='クリップ {{option.clip}}'),
    act('goto_clip_rel', '前後のクリップへ', [sel('dir', '向き', [('+1', '次'), ('-1', '前')])], 'goto: clip id: {{option.dir}}'),
    act('goto_clip_edge', 'クリップの最初・最後へ', [sel('pos', '位置', [('start', '最初'), ('end', '最後')])], 'goto: clip: {{option.pos}}'),
    act('goto_timeline', 'タイムラインの最初・最後へ', [sel('pos', '位置', [('start', '最初'), ('end', '最後')])], 'goto: timeline: {{option.pos}}'),
    act('goto_tc', 'タイムコードへ移動', [text('tc', 'タイムコード（00:00:10:00、+ / - で前後）', '00:00:10:00', TC)], 'goto: timecode: {{option.tc}}'),
    act('jog', 'ジョグ', [text('tc', '動かす量（+00:00:01:00）', '+00:00:01:00', TC)], 'jog: timecode: {{option.tc}}'),
    act('shuttle', 'シャトル', [num('speed', '速さ（%）', 200, -5000, 5000)], 'shuttle: speed: {{option.speed}}'),
    act('slot', 'スロットを選ぶ', [num('slot', 'スロット番号', 1, 1, 8)], 'slot select: slot id: {{option.slot}}'),
    act('playrange_clip', '再生範囲をクリップに', [num('clip', 'クリップ番号', 1, 1, 9999)], 'playrange set: clip id: {{option.clip}}'),
    act('playrange_clear', '再生範囲を消す', [], 'playrange clear'),
    act('stop_mode', '止めた時の表示', [sel('mode', '表示', [('lastframe', '最後のフレーム'), ('nextframe', '次のフレーム'), ('black', '黒')])],
        'play option: stop mode: {{option.mode}}'),
    act('remote', 'リモート操作', [sel('on', 'リモート', [('true', '有効'), ('false', '無効')])], 'remote: enable: {{option.on}}'),
    act('clips_refresh', 'クリップの一覧を取り直す', [], 'clips get'),
    act('command', '命令を送る', [text('cmd', '命令', 'transport info')], '{{option.cmd}}', summary='{{option.cmd}}'),
]
STATUS = [('play', '再生中'), ('record', '収録中'), ('stopped', '停止中'), ('preview', 'プレビュー'), ('shuttle', 'シャトル'), ('jog', 'ジョグ')]
hyperdeck = {
    'format': 1,
    'id': 'bmd-hyperdeck',
    'name': 'Blackmagic HyperDeck',
    'category': 'レコーダー',
    'version': '1.0.0',
    'minAppVersion': '0.6.0',
    'transport': 'tcp',
    'session': 'bmd-text',
    'configFields': [HOST, port(9993)],
    'actions': hyperdeck_actions,
    'feedbacks': [
        {'id': 'status', 'name': '状態', 'options': [sel('status', '状態', STATUS)],
         'compare': {'variable': 'transport_info_status', 'op': 'eq', 'value': '{{option.status}}'}, 'summary': '{{option.status}}'},
        {'id': 'clip', 'name': 'クリップ', 'options': [num('clip', 'クリップ番号', 1, 1, 9999)],
         'compare': {'variable': 'transport_info_clip_id', 'op': 'eq', 'value': '{{option.clip}}'}},
        {'id': 'loop', 'name': 'ループ再生が ON', 'options': [], 'compare': {'variable': 'transport_info_loop', 'op': 'eq', 'value': 'true'}},
    ],
    'variables': [
        {'id': 'transport_info_status', 'name': '状態（play / record / stopped など）'},
        {'id': 'transport_info_clip_id', 'name': 'クリップ番号'},
        {'id': 'transport_info_timecode', 'name': 'タイムコード'},
        {'id': 'transport_info_display_timecode', 'name': '表示のタイムコード'},
        {'id': 'transport_info_speed', 'name': '速さ（%）'},
        {'id': 'transport_info_slot_id', 'name': 'スロット'},
        {'id': 'transport_info_loop', 'name': 'ループ'},
        {'id': 'slot_info_recording_time', 'name': '残りの収録時間（秒）'},
        {'id': 'connection_info_model', 'name': '機種'},
        {'id': 'last_reply', 'name': '最後の返事'},
    ],
    'onConnect': ['notify: transport: true', 'notify: slot: true', 'notify: remote: true', 'transport info', 'slot info'],
    'poll': [{'data': 'transport info', 'intervalMs': 5000}],
    'presets': [
        {'id': 'play', 'category': '再生', 'name': '再生', 'text': '▶︎ PLAY', 'backgroundColor': '#2A2A2E', 'action': {'definitionId': 'play', 'options': {}},
         'feedbacks': [{'definitionId': 'status', 'options': {'status': 'play'}, 'backgroundColor': '#1F9E48'}]},
        {'id': 'stop', 'category': '再生', 'name': '停止', 'text': '■ STOP', 'backgroundColor': '#2A2A2E', 'action': {'definitionId': 'stop', 'options': {}},
         'feedbacks': [{'definitionId': 'status', 'options': {'status': 'stopped'}, 'backgroundColor': '#8E8E93'}]},
        {'id': 'rec', 'category': '収録', 'name': '収録', 'text': '● REC', 'backgroundColor': '#2A2A2E', 'action': {'definitionId': 'record', 'options': {}},
         'feedbacks': [{'definitionId': 'status', 'options': {'status': 'record'}, 'backgroundColor': '#E0302B'}]},
        {'id': 'prev', 'category': 'クリップ', 'name': '前のクリップ', 'text': '⏮ PREV', 'backgroundColor': '#2A2A2E',
         'action': {'definitionId': 'goto_clip_rel', 'options': {'dir': '-1'}}},
        {'id': 'next', 'category': 'クリップ', 'name': '次のクリップ', 'text': 'NEXT ⏭', 'backgroundColor': '#2A2A2E',
         'action': {'definitionId': 'goto_clip_rel', 'options': {'dir': '+1'}}},
    ],
    'evidence': [
        {'title': 'Blackmagic HyperDeck Ethernet Protocol（TCP 9993、命令・返事 200 ok・通知 5xx）',
         'url': 'https://documents.blackmagicdesign.com/DeveloperManuals/HyperDeckEthernetProtocol.pdf', 'status': '確認済',
         'note': '実機では未確認。機器の画面の「最近のログ」（詳細）で確かめる'},
    ],
}

# ---------------------------------------------------------------- Videohub（TCP 9990、番号は 0 始まり → 画面は 1 始まり）
OUT_N = num('out', '出力（1 始まり）', 1, 1, 288)
IN_N = num('in', '入力（1 始まり）', 1, 1, 288)
videohub_actions = [
    act('route', '出力に入力をつなぐ', [OUT_N, IN_N], f'VIDEO OUTPUT ROUTING:{LF}{{{{option.out|lin:1:-1}}}} {{{{option.in|lin:1:-1}}}}{LF}',
        summary='出力 {{option.out}} ← 入力 {{option.in}}'),
    act('route_monitor', 'モニター出力に入力をつなぐ', [OUT_N, IN_N],
        f'VIDEO MONITORING OUTPUT ROUTING:{LF}{{{{option.out|lin:1:-1}}}} {{{{option.in|lin:1:-1}}}}{LF}'),
    act('lock', '出力のロック', [OUT_N, sel('lock', 'ロック', [('O', 'ロックする'), ('U', '外す'), ('F', '他の人のロックを外す')])],
        f'VIDEO OUTPUT LOCKS:{LF}{{{{option.out|lin:1:-1}}}} {{{{option.lock}}}}{LF}'),
    act('input_label', '入力の名前を変える', [IN_N, text('name', '名前', 'CAM 1')], f'INPUT LABELS:{LF}{{{{option.in|lin:1:-1}}}} {{{{option.name}}}}{LF}'),
    act('output_label', '出力の名前を変える', [OUT_N, text('name', '名前', 'PGM')], f'OUTPUT LABELS:{LF}{{{{option.out|lin:1:-1}}}} {{{{option.name}}}}{LF}'),
    act('serial_route', 'シリアルポートをつなぐ', [num('out', 'ポート（1 始まり）', 1, 1, 288), num('in', 'つなぐ先（1 始まり）', 1, 1, 288)],
        f'SERIAL PORT ROUTING:{LF}{{{{option.out|lin:1:-1}}}} {{{{option.in|lin:1:-1}}}}{LF}'),
    act('ping', '応答を確かめる（PING）', [], f'PING:{LF}'),
    act('command', '命令を送る（ブロック）', [text('cmd', '命令（\\n で改行）', 'VIDEO OUTPUT ROUTING:\\n0 1\\n')], '{{option.cmd}}'),
]
videohub = {
    'format': 1,
    'id': 'bmd-videohub',
    'name': 'Blackmagic Videohub',
    'category': 'ルーター',
    'version': '1.0.0',
    'minAppVersion': '0.6.0',
    'transport': 'tcp',
    'session': 'bmd-text',
    'configFields': [HOST, port(9990)],
    'actions': videohub_actions,
    'feedbacks': [
        {'id': 'routed', 'name': '出力に入力がつながっている', 'options': [OUT_N, IN_N],
         'compare': {'variable': 'video_output_routing_{{option.out|lin:1:-1}}', 'op': 'eq', 'value': '{{option.in|lin:1:-1}}'},
         'summary': '出力 {{option.out}} ← 入力 {{option.in}}'},
        {'id': 'locked', 'name': '出力がロック中', 'options': [OUT_N],
         'compare': {'variable': 'video_output_locks_{{option.out|lin:1:-1}}', 'op': 'neq', 'value': 'U'}},
    ],
    'variables': [
        {'id': 'video_output_routing_0', 'name': '出力 1 の入力（0 始まり。出力ごとに _番号）'},
        {'id': 'input_labels_0', 'name': '入力 1 の名前（入力ごとに _番号）'},
        {'id': 'output_labels_0', 'name': '出力 1 の名前（出力ごとに _番号）'},
        {'id': 'videohub_device_model_name', 'name': '機種'},
        {'id': 'last_reply', 'name': '最後の返事（ACK / NAK）'},
    ],
    'poll': [{'data': f'PING:{LF}{LF}', 'intervalMs': 10000}],
    'presets': [
        {'id': f'r{o}_{i}', 'category': f'出力 {o}', 'name': f'出力 {o} ← 入力 {i}', 'text': f'OUT {o}\nIN {i}', 'backgroundColor': '#2A2A2E',
         'action': {'definitionId': 'route', 'options': {'out': o, 'in': i}},
         'feedbacks': [{'definitionId': 'routed', 'options': {'out': o, 'in': i}, 'backgroundColor': '#1F5FD6'}]}
        for o in range(1, 3) for i in range(1, 9)
    ],
    'evidence': [
        {'title': 'Blackmagic Videohub Ethernet Protocol（TCP 9990、ブロックと空行、番号は 0 始まり、ACK / NAK）',
         'url': 'https://documents.blackmagicdesign.com/DeveloperManuals/VideohubEthernetProtocol.pdf', 'status': '確認済',
         'note': '画面の番号は 1 始まりで、送る時に 1 引く。実機では未確認'},
    ],
}

for d in (hyperdeck, videohub):
    p = OUT / f"{d['id']}.json"
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('wrote', p.relative_to(OUT.parents[2]), len(d['actions']), 'actions')
