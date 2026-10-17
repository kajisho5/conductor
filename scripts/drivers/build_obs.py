#!/usr/bin/env python3
"""OBS Studio（obs-websocket 5.x）のドライバ定義（JSON）を作る（SPEC 7.1・8.9）。

接続・認証・op 6 への包み方・受信の解析はアプリ組み込みの通信手順 obs-ws（src/drivers/obs.ts）が行う。
根拠：obs-websocket の公開仕様（protocol.md、Requests の名前と引数）。
手で JSON を直さず、このスクリプトを直して再生成する。
使い方：python3 scripts/drivers/build_obs.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'src' / 'drivers' / 'defs' / 'obs-studio.json'


def sel(id_, label, pairs, default=None):
    return {'id': id_, 'label': label, 'type': 'select', 'default': default if default is not None else pairs[0][0],
            'choices': [{'id': i, 'label': l} for i, l in pairs]}


def text(id_, label, placeholder):
    return {'id': id_, 'label': label, 'type': 'text', 'placeholder': placeholder, 'help': '「"」と「\\」は使えません'}


def num(id_, label, default, lo, hi):
    return {'id': id_, 'label': label, 'type': 'number', 'default': default, 'min': lo, 'max': hi}


def req(id_, name, options, request_type, data=None, summary=None):
    body = f'{{"requestType":"{request_type}"' + (f',"requestData":{{{data}}}' if data else '') + '}'
    a = {'id': id_, 'name': name, 'options': options, 'send': {'kind': 'bytes', 'data': body, 'encoding': 'text'}}
    if summary:
        a['summary'] = summary
    return a


SCENE = text('scene', 'シーン名', 'DEMO SCENE')
INPUT = text('input', 'ソース（入力）名', 'DEMO MIC')
ONOFF = sel('on', '状態', [('true', 'ON'), ('false', 'OFF')])

actions = [
    req('program_scene', 'シーンを切り替える（番組）', [SCENE], 'SetCurrentProgramScene', '"sceneName":"{{option.scene}}"', 'シーン {{option.scene}}'),
    req('preview_scene', 'プレビューのシーンを選ぶ（スタジオモード）', [SCENE], 'SetCurrentPreviewScene', '"sceneName":"{{option.scene}}"'),
    req('transition', 'トランジション（スタジオモード）', [], 'TriggerStudioModeTransition'),
    req('studio_mode', 'スタジオモード', [ONOFF], 'SetStudioModeEnabled', '"studioModeEnabled":{{option.on}}'),
    req('stream_start', '配信を始める', [], 'StartStream'),
    req('stream_stop', '配信を止める', [], 'StopStream'),
    req('stream_toggle', '配信を始める / 止める', [], 'ToggleStream'),
    req('record_start', '録画を始める', [], 'StartRecord'),
    req('record_stop', '録画を止める', [], 'StopRecord'),
    req('record_toggle', '録画を始める / 止める', [], 'ToggleRecord'),
    req('record_pause', '録画を一時停止', [], 'PauseRecord'),
    req('record_resume', '録画を再開', [], 'ResumeRecord'),
    req('replay_start', 'リプレイバッファを始める', [], 'StartReplayBuffer'),
    req('replay_stop', 'リプレイバッファを止める', [], 'StopReplayBuffer'),
    req('replay_save', 'リプレイを保存', [], 'SaveReplayBuffer'),
    req('virtualcam_start', '仮想カメラを始める', [], 'StartVirtualCam'),
    req('virtualcam_stop', '仮想カメラを止める', [], 'StopVirtualCam'),
    req('mute', 'ソースのミュート', [INPUT, ONOFF], 'SetInputMute', '"inputName":"{{option.input}}","inputMuted":{{option.on}}'),
    req('mute_toggle', 'ソースのミュートを切り替える', [INPUT], 'ToggleInputMute', '"inputName":"{{option.input}}"'),
    req('volume', 'ソースの音量', [INPUT, num('db', '音量（dB）', 0, -100, 26)], 'SetInputVolume', '"inputName":"{{option.input}}","inputVolumeDb":{{option.db}}'),
    req('scene_transition', 'トランジションの種類', [text('name', 'トランジション名', 'フェード')], 'SetCurrentSceneTransition', '"transitionName":"{{option.name}}"'),
    req('transition_duration', 'トランジションの時間', [num('ms', '時間（ミリ秒）', 300, 50, 20000)], 'SetCurrentSceneTransitionDuration',
        '"transitionDuration":{{option.ms}}'),
    req('item_enabled', 'シーンのソースを表示 / 非表示', [SCENE, num('item', 'ソースの番号（sceneItemId）', 1, 1, 100000), ONOFF], 'SetSceneItemEnabled',
        '"sceneName":"{{option.scene}}","sceneItemId":{{option.item}},"sceneItemEnabled":{{option.on}}'),
    req('media', 'メディアソースの操作', [INPUT, sel('act', '操作', [
        ('OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY', '再生'), ('OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE', '一時停止'),
        ('OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP', '停止'), ('OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART', '最初から'),
        ('OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT', '次'), ('OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PREVIOUS', '前')])],
        'TriggerMediaInputAction', '"inputName":"{{option.input}}","mediaAction":"{{option.act}}"'),
    req('hotkey', 'ホットキーを押す', [text('name', 'ホットキー名', 'OBSBasic.StartStreaming')], 'TriggerHotkeyByName', '"hotkeyName":"{{option.name}}"'),
    req('screenshot_save', 'スクリーンショットを保存', [text('source', 'ソース名', 'DEMO SCENE'), text('path', '保存先（OBS の PC のパス）', 'C:/demo/shot.png')],
        'SaveSourceScreenshot', '"sourceName":"{{option.source}}","imageFormat":"png","imageFilePath":"{{option.path}}"'),
    {'id': 'request', 'name': 'リクエストを送る（JSON）',
     'options': [{'id': 'json', 'label': 'リクエスト', 'type': 'text', 'placeholder': '{"requestType":"GetVersion"}', 'mono': True}],
     'send': {'kind': 'bytes', 'data': '{{option.json}}', 'encoding': 'text'}, 'summary': '{{option.json}}'},
]

feedbacks = [
    {'id': 'program', 'name': '番組のシーン', 'options': [SCENE], 'compare': {'variable': 'program_scene', 'op': 'eq', 'value': '{{option.scene}}'},
     'summary': '番組が {{option.scene}}'},
    {'id': 'preview', 'name': 'プレビューのシーン', 'options': [SCENE], 'compare': {'variable': 'preview_scene', 'op': 'eq', 'value': '{{option.scene}}'}},
    {'id': 'streaming', 'name': '配信中', 'options': [], 'compare': {'variable': 'streaming', 'op': 'eq', 'value': '1'}},
    {'id': 'recording', 'name': '録画中', 'options': [], 'compare': {'variable': 'recording', 'op': 'eq', 'value': '1'}},
    {'id': 'paused', 'name': '録画を一時停止中', 'options': [], 'compare': {'variable': 'record_paused', 'op': 'eq', 'value': '1'}},
    {'id': 'muted', 'name': 'ソースがミュート中', 'options': [INPUT], 'compare': {'variable': 'mute_{{option.input}}', 'op': 'eq', 'value': '1'}},
    {'id': 'studio', 'name': 'スタジオモード', 'options': [], 'compare': {'variable': 'studio_mode', 'op': 'eq', 'value': '1'}},
]

definition = {
    'format': 1,
    'id': 'obs-studio',
    'name': 'OBS Studio（obs-websocket 5）',
    'category': '配信ソフト',
    'version': '1.0.0',
    'minAppVersion': '0.6.0',
    'transport': 'ws',
    'wsPath': '',
    'session': 'obs-ws',
    'configFields': [
        {'id': 'host', 'label': 'IP アドレス（OBS の PC）', 'type': 'text', 'placeholder': '192.168.0.20', 'pattern': '^[A-Za-z0-9.:\\-]+$', 'mono': True},
        {'id': 'port', 'label': 'ポート', 'type': 'number', 'default': 4455, 'min': 1, 'max': 65535},
        {'id': 'password', 'label': 'パスワード（OBS の「WebSocket サーバー設定」）', 'type': 'text', 'mono': True},
    ],
    'actions': actions,
    'feedbacks': feedbacks,
    'variables': [
        {'id': 'program_scene', 'name': '番組のシーン'},
        {'id': 'preview_scene', 'name': 'プレビューのシーン'},
        {'id': 'streaming', 'name': '配信中（1 / 0）'},
        {'id': 'recording', 'name': '録画中（1 / 0）'},
        {'id': 'record_timecode', 'name': '録画の時間'},
        {'id': 'stream_timecode', 'name': '配信の時間'},
        {'id': 'studio_mode', 'name': 'スタジオモード（1 / 0）'},
        {'id': 'transition', 'name': 'トランジション'},
        {'id': 'last_reply', 'name': '最後の返事'},
    ],
    'poll': [{'data': '', 'intervalMs': 0}],
    'presets': [
        {'id': 'stream', 'category': '配信・録画', 'name': '配信', 'text': 'STREAM', 'backgroundColor': '#2A2A2E',
         'action': {'definitionId': 'stream_toggle', 'options': {}},
         'feedbacks': [{'definitionId': 'streaming', 'options': {}, 'backgroundColor': '#E0302B'}]},
        {'id': 'record', 'category': '配信・録画', 'name': '録画', 'text': 'REC', 'backgroundColor': '#2A2A2E',
         'action': {'definitionId': 'record_toggle', 'options': {}},
         'feedbacks': [{'definitionId': 'recording', 'options': {}, 'backgroundColor': '#E0302B'}]},
        {'id': 'transition', 'category': 'シーン', 'name': 'トランジション', 'text': 'TRANS', 'backgroundColor': '#F2C200',
         'action': {'definitionId': 'transition', 'options': {}}},
    ],
    'evidence': [
        {'title': 'obs-websocket 5.x の公開仕様（Hello・Identify・認証・Request・Event、ポート 4455）',
         'url': 'https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md', 'status': '確認済',
         'note': 'シーン名などは OBS 側の名前をそのまま入れる。実機では未確認'},
    ],
}
del definition['poll']
OUT.write_text(json.dumps(definition, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('wrote', OUT.name, len(actions), 'actions')
