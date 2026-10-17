#!/usr/bin/env python3
"""ProPresenter 7（HTTP の API、v1）のドライバ定義（JSON）を作る（SPEC 7.1・8.18）。

ProPresenter の「ネットワーク」設定で API を有効にし、そのポート（既定 50001）を URL の先頭に入れる。
根拠：ProPresenter API 1.0 の OpenAPI（swagger.json。npm の @alxpark/propresenter-mcp（MIT）に同梱されたものを読んだ）。
手で JSON を直さず、このスクリプトを直して再生成する。
使い方：python3 scripts/drivers/build_propresenter.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'src' / 'drivers' / 'defs' / 'propresenter.json'
BASE = {'id': 'baseUrl', 'label': 'URL の先頭', 'type': 'text', 'default': 'http://192.168.0.10:50001', 'placeholder': 'http://192.168.0.10:50001',
        'pattern': '^https?://.+', 'mono': True, 'help': 'ProPresenter の設定 > ネットワーク で API を有効にし、そのポートを入れる'}


def text(id_, label, default='', placeholder='', pattern=None):
    f = {'id': id_, 'label': label, 'type': 'text', 'default': default}
    if placeholder:
        f['placeholder'] = placeholder
    if pattern:
        f['pattern'] = pattern
    return f


def num(id_, label, default, lo, hi):
    return {'id': id_, 'label': label, 'type': 'number', 'default': default, 'min': lo, 'max': hi}


def sel(id_, label, pairs, default=None):
    return {'id': id_, 'label': label, 'type': 'select', 'default': default if default is not None else pairs[0][0],
            'choices': [{'id': i, 'label': l} for i, l in pairs]}


def get(id_, name, options, path, summary=None):
    a = {'id': id_, 'name': name, 'options': list(options), 'send': {'kind': 'http', 'method': 'GET', 'path': path}}
    if summary:
        a['summary'] = summary
    return a


def body(id_, name, options, method, path, data, summary=None):
    a = {'id': id_, 'name': name, 'options': list(options),
         'send': {'kind': 'http', 'method': method, 'path': path, 'contentType': 'application/json', 'body': data}}
    if summary:
        a['summary'] = summary
    return a


ID = text('id', '名前・番号・UUID', '1', '1')
INDEX = num('index', 'キューの番号（0 から）', 0, 0, 9999)
SAFE = '^[^"\\\\]*$'
WHICH = sel('which', '対象', [('active', '再生中'), ('focused', '選んでいる')])
WHICH_PL = sel('which', '対象', [('active', '再生中'), ('focused', '選んでいる'), ('id', '名前・番号で指定（下の欄）')])

actions = [
    # ---- スライド
    get('next', '次へ（スライド・項目）', [], '/v1/trigger/next', '次へ'),
    get('previous', '前へ（スライド・項目）', [], '/v1/trigger/previous', '前へ'),
    get('pres_next', 'プレゼンテーションの次のキュー', [WHICH], '/v1/presentation/{{option.which}}/next/trigger', '{{option.which}} 次'),
    get('pres_previous', 'プレゼンテーションの前のキュー', [WHICH], '/v1/presentation/{{option.which}}/previous/trigger', '{{option.which}} 前'),
    get('pres_retrigger', 'プレゼンテーションを最初から', [WHICH], '/v1/presentation/{{option.which}}/trigger', '{{option.which}} 最初から'),
    get('pres_index', 'プレゼンテーションのキューを指定', [WHICH, INDEX], '/v1/presentation/{{option.which}}/{{option.index}}/trigger',
        '{{option.which}} キュー {{option.index}}'),
    get('pres_group', 'プレゼンテーションのグループ', [WHICH, text('group', 'グループの名前・番号・UUID', 'Chorus', 'Chorus')],
        '/v1/presentation/{{option.which}}/group/{{option.group|url}}/trigger', 'グループ {{option.group}}'),
    get('pres_uuid', 'プレゼンテーションを指定して出す', [text('uuid', 'プレゼンテーション（UUID・名前）', '', 'DEMO-PRESENTATION'), INDEX],
        '/v1/presentation/{{option.uuid|url}}/{{option.index}}/trigger', '{{option.uuid}} {{option.index}}'),
    get('library_trigger', 'ライブラリのプレゼンテーション', [text('lib', 'ライブラリ', '', 'DEMO-LIBRARY'), text('pres', 'プレゼンテーション', '', 'DEMO-SONG'), INDEX],
        '/v1/library/{{option.lib|url}}/{{option.pres|url}}/{{option.index}}/trigger', '{{option.lib}} / {{option.pres}}'),
    get('pres_focus', 'プレゼンテーションを選ぶ', [sel('to', '対象', [('next', '次'), ('previous', '前'), ('active', '再生中')])], '/v1/presentation/{{option.to}}/focus',
        '選ぶ {{option.to}}'),
    get('pres_timeline', 'タイムライン', [WHICH, sel('op', '操作', [('play', '再生'), ('pause', '一時停止'), ('rewind', '巻き戻し')])],
        '/v1/presentation/{{option.which}}/timeline/{{option.op}}', 'タイムライン {{option.op}}'),
    # ---- プレイリスト
    get('playlist_next', 'プレイリストの次の項目', [], '/v1/playlist/focused/next/trigger', 'プレイリスト 次'),
    get('playlist_previous', 'プレイリストの前の項目', [], '/v1/playlist/focused/previous/trigger', 'プレイリスト 前'),
    get('playlist_index', 'プレイリストの項目を指定', [text('pl', 'プレイリスト（名前・番号・UUID）', '', 'DEMO-PLAYLIST'), INDEX],
        '/v1/playlist/{{option.pl|url}}/{{option.index}}/trigger', '{{option.pl}} の {{option.index}}'),
    get('playlist_focus', 'プレイリストを選ぶ', [sel('to', '対象', [('next', '次'), ('previous', '前')])], '/v1/playlist/{{option.to}}/focus', 'プレイリスト {{option.to}}'),
    # ---- 消す
    get('clear_layer', 'レイヤーを消す', [sel('layer', 'レイヤー', [('slide', 'スライド'), ('media', 'メディア'), ('video_input', 'ビデオ入力'), ('audio', '音声'),
                                                             ('props', 'プロップ'), ('messages', 'メッセージ'), ('announcements', 'アナウンス')])],
        '/v1/clear/layer/{{option.layer}}', '消す {{option.layer}}'),
    get('clear_group', 'クリアグループ', [ID], '/v1/clear/group/{{option.id|url}}/trigger', 'クリアグループ {{option.id}}'),
    # ---- メディア・音声・ビデオ入力
    get('media_next', 'メディアの次', [], '/v1/trigger/media/next', 'メディア 次'),
    get('media_previous', 'メディアの前', [], '/v1/trigger/media/previous', 'メディア 前'),
    get('media_item', 'メディアの項目', [text('pl', 'メディアのプレイリスト', '', 'DEMO-MEDIA'), text('item', '項目（名前・番号・UUID）', '1', '1')],
        '/v1/media/playlist/{{option.pl|url}}/{{option.item|url}}/trigger', 'メディア {{option.pl}} / {{option.item}}'),
    get('audio_next', '音声の次', [], '/v1/trigger/audio/next', '音声 次'),
    get('audio_previous', '音声の前', [], '/v1/trigger/audio/previous', '音声 前'),
    get('audio_item', '音声の項目', [text('pl', '音声のプレイリスト', '', 'DEMO-AUDIO'), text('item', '項目（名前・番号・UUID）', '1', '1')],
        '/v1/audio/playlist/{{option.pl|url}}/{{option.item|url}}/trigger', '音声 {{option.pl}} / {{option.item}}'),
    get('video_input', 'ビデオ入力', [ID], '/v1/video_inputs/{{option.id|url}}/trigger', 'ビデオ入力 {{option.id}}'),
    get('transport_play', '再生（レイヤー）', [sel('layer', 'レイヤー', [('presentation', 'プレゼンテーション'), ('announcement', 'アナウンス'), ('audio', '音声')])],
        '/v1/transport/{{option.layer}}/play', '再生 {{option.layer}}'),
    get('transport_pause', '一時停止（レイヤー）', [sel('layer', 'レイヤー', [('presentation', 'プレゼンテーション'), ('announcement', 'アナウンス'), ('audio', '音声')])],
        '/v1/transport/{{option.layer}}/pause', '一時停止 {{option.layer}}'),
    get('transport_end', '最後へ（レイヤー）', [sel('layer', 'レイヤー', [('presentation', 'プレゼンテーション'), ('announcement', 'アナウンス'), ('audio', '音声')])],
        '/v1/transport/{{option.layer}}/go_to_end', '最後へ {{option.layer}}'),
    body('transport_time', '再生位置（レイヤー）', [sel('layer', 'レイヤー', [('presentation', 'プレゼンテーション'), ('announcement', 'アナウンス'), ('audio', '音声')]),
                                               num('sec', '秒', 0, 0, 86400)], 'PUT', '/v1/transport/{{option.layer}}/time', '{{option.sec}}',
         '{{option.layer}} {{option.sec}} 秒'),
    # ---- アナウンス
    get('ann_next', 'アナウンスの次', [], '/v1/announcement/active/next/trigger', 'アナウンス 次'),
    get('ann_previous', 'アナウンスの前', [], '/v1/announcement/active/previous/trigger', 'アナウンス 前'),
    get('ann_index', 'アナウンスのキューを指定', [INDEX], '/v1/announcement/active/{{option.index}}/trigger', 'アナウンス {{option.index}}'),
    get('ann_timeline', 'アナウンスのタイムライン', [sel('op', '操作', [('play', '再生'), ('pause', '一時停止'), ('rewind', '巻き戻し')])],
        '/v1/announcement/active/timeline/{{option.op}}', 'アナウンス {{option.op}}'),
    # ---- マクロ・ルック・プロップ・メッセージ
    get('macro', 'マクロ', [ID], '/v1/macro/{{option.id|url}}/trigger', 'マクロ {{option.id}}'),
    get('look', 'ルック', [ID], '/v1/look/{{option.id|url}}/trigger', 'ルック {{option.id}}'),
    get('prop', 'プロップを出す', [ID], '/v1/prop/{{option.id|url}}/trigger', 'プロップ {{option.id}}'),
    get('prop_clear', 'プロップを消す', [ID], '/v1/prop/{{option.id|url}}/clear', 'プロップを消す {{option.id}}'),
    body('message', 'メッセージを出す', [ID], 'POST', '/v1/message/{{option.id|url}}/trigger', '[]', 'メッセージ {{option.id}}'),
    body('message_text', 'メッセージを出す（文字を入れて）', [ID, text('token', '差し込みの名前', 'Name', 'Name', SAFE), text('text', '文字', '', '', SAFE)], 'POST',
         '/v1/message/{{option.id|url}}/trigger', '[{"name":"{{option.token}}","text":{"text":"{{option.text}}"}}]', 'メッセージ {{option.id}}'),
    get('message_clear', 'メッセージを消す', [ID], '/v1/message/{{option.id|url}}/clear', 'メッセージを消す {{option.id}}'),
    # ---- ステージ・タイマー・画面・収録
    body('stage_message', 'ステージにメッセージ', [text('text', '文字', '', '', SAFE)], 'PUT', '/v1/stage/message', '"{{option.text}}"', 'ステージ {{option.text}}'),
    {'id': 'stage_message_clear', 'name': 'ステージのメッセージを消す', 'options': [],
     'send': {'kind': 'http', 'method': 'DELETE', 'path': '/v1/stage/message'}, 'summary': 'ステージを消す'},
    get('timer', 'タイマー', [ID, sel('op', '操作', [('start', '始める'), ('stop', '止める'), ('reset', 'リセット')])], '/v1/timer/{{option.id|url}}/{{option.op}}',
        'タイマー {{option.id}} {{option.op}}'),
    get('timers_all', 'すべてのタイマー', [sel('op', '操作', [('start', '始める'), ('stop', '止める'), ('reset', 'リセット')])], '/v1/timers/{{option.op}}',
        'タイマー すべて {{option.op}}'),
    body('audience_screens', '観客用の画面', [sel('on', '状態', [('true', 'ON'), ('false', 'OFF')])], 'PUT', '/v1/status/audience_screens', '{{option.on}}',
         '観客用 {{option.on}}'),
    body('stage_screens', 'ステージの画面', [sel('on', '状態', [('true', 'ON'), ('false', 'OFF')])], 'PUT', '/v1/status/stage_screens', '{{option.on}}',
         'ステージ {{option.on}}'),
    get('capture', '収録・配信（キャプチャ）', [sel('op', '操作', [('start', '始める'), ('stop', '止める')])], '/v1/capture/{{option.op}}', 'キャプチャ {{option.op}}'),
    get('find_mouse', 'マウスの場所を表示', [], '/v1/find_my_mouse'),
    {'id': 'request', 'name': 'リクエストを送る（そのまま）',
     'options': [sel('method', '方式', [('GET', 'GET'), ('PUT', 'PUT'), ('POST', 'POST'), ('DELETE', 'DELETE')]), text('path', 'パス', '/v1/trigger/next', '/v1/trigger/next'),
                 {'id': 'body', 'label': '本文（JSON）', 'type': 'textarea', 'mono': True}],
     'send': {'kind': 'http', 'method': '{{option.method}}', 'path': '{{option.path}}', 'contentType': 'application/json', 'body': '{{option.body}}'},
     'summary': '{{option.method}} {{option.path}}'},
]

presets = [
    {'id': 'next', 'category': 'スライド', 'name': '次へ', 'text': 'NEXT', 'backgroundColor': '#1F9E48', 'action': {'definitionId': 'next', 'options': {}}},
    {'id': 'prev', 'category': 'スライド', 'name': '前へ', 'text': 'PREV', 'backgroundColor': '#2A2A2E', 'action': {'definitionId': 'previous', 'options': {}}},
] + [
    {'id': f'clear_{k}', 'category': '消す', 'name': f'{l}を消す', 'text': f'CLEAR\n{t}', 'backgroundColor': '#6E1616',
     'action': {'definitionId': 'clear_layer', 'options': {'layer': k}}}
    for k, l, t in [('slide', 'スライド', 'SLIDE'), ('media', 'メディア', 'MEDIA'), ('audio', '音声', 'AUDIO'), ('props', 'プロップ', 'PROPS'), ('messages', 'メッセージ', 'MSG')]
]

definition = {
    'format': 1,
    'id': 'propresenter',
    'name': 'ProPresenter 7',
    'category': 'プレゼンテーション',
    'version': '1.0.0',
    'minAppVersion': '0.6.0',
    'transport': 'http',
    'configFields': [BASE],
    'actions': actions,
    'feedbacks': [],
    'variables': [],
    'httpResponse': {'status': 'last_status', 'body': 'last_reply'},
    'presets': presets,
    'evidence': [
        {'title': 'ProPresenter API 1.0（OpenAPI）：/v1/trigger・presentation・playlist・clear・media・audio・video_inputs・transport・announcement・macro・look・prop・message・stage・timer・status・capture、既定ポート 50001',
         'url': 'https://openapi.propresenter.com/', 'status': '確認済',
         'note': 'npm の @alxpark/propresenter-mcp（MIT）1.0.1 に同梱された swagger.json で読んだ'},
        {'title': '状態（今のスライドなど）の受け取りはまだ', 'status': '確認済'},
    ],
}

OUT.write_text(json.dumps(definition, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('wrote', OUT.name, len(actions), 'actions')
