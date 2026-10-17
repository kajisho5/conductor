#!/usr/bin/env python3
"""Panasonic のリモートカメラ（AW-HE / AW-UE シリーズ、HTTP の CGI）のドライバ定義（JSON）を作る（SPEC 7.1・8.15）。

命令は GET /cgi-bin/aw_ptz?cmd=%23…&res=1（雲台）と /cgi-bin/aw_cam?cmd=…&res=1（カメラ）。
根拠：Panasonic「HD Integrated Camera Interface Specifications V1.07E」（公開 PDF）。
ゲイン・シャッター・ペデスタル・タリー・プリセットの方式など資料の抜けは、公開 OSS のモジュール panasonic-ptz（MIT）が送った URL で補う。
手で JSON を直さず、このスクリプトを直して再生成する。
使い方：python3 scripts/drivers/build_panasonic.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'src' / 'drivers' / 'defs' / 'panasonic-ptz.json'
BASE = {'id': 'baseUrl', 'label': 'URL の先頭', 'type': 'text', 'default': 'http://192.168.0.10', 'placeholder': 'http://192.168.0.10', 'pattern': '^https?://.+',
        'mono': True}


def num(id_, label, default, lo, hi, help_=None):
    f = {'id': id_, 'label': label, 'type': 'number', 'default': default, 'min': lo, 'max': hi}
    if help_:
        f['help'] = help_
    return f


def sel(id_, label, pairs, default=None):
    return {'id': id_, 'label': label, 'type': 'select', 'default': default if default is not None else pairs[0][0],
            'choices': [{'id': i, 'label': l} for i, l in pairs]}


def ptz(id_, name, options, cmd, summary=None):
    a = {'id': id_, 'name': name, 'options': list(options), 'send': {'kind': 'http', 'method': 'GET', 'path': f'/cgi-bin/aw_ptz?cmd=%23{cmd}&res=1'}}
    if summary:
        a['summary'] = summary
    return a


def cam(id_, name, options, cmd, summary=None, res=1):
    a = {'id': id_, 'name': name, 'options': list(options), 'send': {'kind': 'http', 'method': 'GET', 'path': f'/cgi-bin/aw_cam?cmd={cmd}&res={res}'}}
    if summary:
        a['summary'] = summary
    return a


SPEED = num('speed', '速さ（1–49）', 25, 1, 49, '49 がいちばん速い')
PLUS = '{{option.speed|lin:1:50|pad2}}'
MINUS = '{{option.speed|lin:-1:50|pad2}}'
DIRS = [
    ('left', '左', MINUS, '50'), ('right', '右', PLUS, '50'), ('up', '上', '50', PLUS), ('down', '下', '50', MINUS),
    ('upleft', '左上', MINUS, PLUS), ('upright', '右上', PLUS, PLUS), ('downleft', '左下', MINUS, MINUS), ('downright', '右下', PLUS, MINUS),
]
PRESET = num('n', 'プリセット番号（1–100）', 1, 1, 100)
PRESET_CODE = '{{option.n|lin:1:-1|pad2}}'

actions = [ptz(f'move_{k}', f'パン・チルト {l}', [SPEED], f'PTS{p}{t}', f'{l} {{{{option.speed}}}}') for k, l, p, t in DIRS]
actions += [
    ptz('stop', 'パン・チルトを止める', [], 'PTS5050'),
    ptz('home', 'ホームへ', [], 'APC80008000'),
    ptz('position', 'パン・チルトの位置', [num('pan', 'パン（16 進 4 桁の 10 進。32768 が中央）', 32768, 0, 65535), num('tilt', 'チルト（32768 が水平）', 32768, 0, 65535)],
        'APC{{option.pan|hexu|pad4}}{{option.tilt|hexu|pad4}}', 'パン {{option.pan}} チルト {{option.tilt}}'),
    ptz('zoom_in', 'ズームイン', [SPEED], f'Z{PLUS}'),
    ptz('zoom_out', 'ズームアウト', [SPEED], f'Z{MINUS}'),
    ptz('zoom_stop', 'ズームを止める', [], 'Z50'),
    ptz('zoom_position', 'ズームの位置', [num('v', '位置（1365 ワイド – 4095 テレ）', 1365, 1365, 4095)], 'AXZ{{option.v|hexu}}', 'ズーム {{option.v}}'),
    ptz('focus_far', 'フォーカス 遠く', [SPEED], f'F{PLUS}'),
    ptz('focus_near', 'フォーカス 近く', [SPEED], f'F{MINUS}'),
    ptz('focus_stop', 'フォーカスを止める', [], 'F50'),
    ptz('focus_position', 'フォーカスの位置', [num('v', '位置（1365 近く – 4095 遠く）', 2730, 1365, 4095)], 'AXF{{option.v|hexu}}', 'フォーカス {{option.v}}'),
    ptz('focus_mode', 'フォーカスの方式', [sel('v', '方式', [('1', 'オート'), ('0', 'マニュアル')])], 'D1{{option.v}}', 'AF {{option.v}}'),
    cam('focus_one_touch', 'ワンタッチ AF', [], 'OSE:69:1'),
    ptz('iris_mode', 'アイリスの方式', [sel('v', '方式', [('1', 'オート'), ('0', 'マニュアル')])], 'D3{{option.v}}', 'オートアイリス {{option.v}}'),
    ptz('iris_level', 'アイリス（1–99）', [num('v', 'アイリス（1 閉 – 99 開）', 50, 1, 99)], 'I{{option.v|pad2}}', 'アイリス {{option.v}}'),
    ptz('iris_set', 'アイリスの位置', [num('v', '位置（1365 閉 – 4095 開）', 2730, 1365, 4095)], 'AXI{{option.v|hexu}}', 'アイリス {{option.v}}'),
    cam('gain_set', 'ゲイン', [sel('v', 'ゲイン', [('80', 'オート')] + [(f'{i + 8:02X}', f'{i} dB') for i in range(0, 43)], '08')], 'OGU:{{option.v}}', 'ゲイン {{option.v}}'),
    cam('shutter_set', 'シャッター', [sel('v', 'シャッター', [('0', 'OFF'), ('2', '1/60'), ('3', '1/100'), ('4', '1/120'), ('5', '1/250'), ('6', '1/500'),
                                                         ('7', '1/1000'), ('8', '1/2000'), ('9', '1/4000'), ('A', '1/10000'), ('B', 'シンクロスキャン'),
                                                         ('C', 'ELC'), ('D', '1/24'), ('E', '1/25'), ('F', '1/30')])], 'OSH:{{option.v}}', 'シャッター {{option.v}}'),
    cam('pedestal_set', 'ペデスタル', [num('v', 'ペデスタル（−150 – 150）', 0, -150, 150)], 'OTP:{{option.v|lin:1:150|hexu|pad3}}', 'ペデスタル {{option.v}}'),
    cam('nd_set', 'ND フィルター', [sel('v', 'ND', [('0', 'スルー'), ('1', '1/4'), ('2', '1/16'), ('3', '1/64'), ('8', 'オート（対応機種）')])], 'OFT:{{option.v}}', 'ND {{option.v}}'),
    cam('awb', 'オートホワイトバランスを実行', [], 'OWS', res=0),
    cam('abb', 'オートブラックバランスを実行', [], 'OAS', res=0),
    cam('color_bar', 'カラーバー', [sel('v', '表示', [('1', 'カラーバー'), ('0', 'カメラ')])], 'DCB:{{option.v}}', 'カラーバー {{option.v}}'),
    cam('scene', 'シーンファイル', [sel('v', 'シーン', [(str(i), f'シーン {i}') for i in range(1, 10)])], 'XSF:{{option.v}}', 'シーン {{option.v}}'),
    ptz('preset_recall', 'プリセットを呼び出す', [PRESET], f'R{PRESET_CODE}', 'プリセット {{option.n}}'),
    ptz('preset_save', 'プリセットに記憶', [PRESET], f'M{PRESET_CODE}', 'プリセット {{option.n}} に記憶'),
    cam('preset_mode', 'プリセットで戻す内容', [sel('v', '内容', [('0', 'A：PTZ・アイリス・WB / 色'), ('1', 'B：PTZ・アイリス'), ('2', 'C：PTZ だけ')])],
        'OSE:71:{{option.v}}', 'プリセットの内容 {{option.v}}'),
    ptz('preset_speed', 'プリセットへ動く速さ', [sel('v', '速さ', [(str(min(999, 250 + 25 * i)), f'{i}' + ('（速い）' if i == 30 else '（遅い）' if i == 1 else '')) for i in range(30, 0, -1)])], 'UPVS{{option.v}}', 'プリセットの速さ {{option.v}}'),
    ptz('preset_time', 'プリセットへ動く時間', [num('v', '秒（1–99）', 3, 1, 99)], 'UPVS0{{option.v|pad2}}', 'プリセットの時間 {{option.v}} 秒'),
    cam('preset_speed_mode', 'プリセットの動き方', [sel('v', '方式', [('0', '速さで決める'), ('1', '時間で決める')])], 'OSJ:29:{{option.v}}'),
    ptz('power', '電源', [sel('v', '状態', [('1', '入れる'), ('0', 'スタンバイ')])], 'O{{option.v}}', '電源 {{option.v}}'),
    cam('tally_red', '赤タリー', [sel('v', '状態', [('1', 'ON'), ('0', 'OFF')])], 'TLR:{{option.v}}', '赤タリー {{option.v}}'),
    cam('tally_green', '緑タリー', [sel('v', '状態', [('1', 'ON'), ('0', 'OFF')])], 'TLG:{{option.v}}', '緑タリー {{option.v}}'),
    ptz('install', '設置の向き', [sel('v', '向き', [('0', '据え置き'), ('1', '吊り下げ')])], 'INS{{option.v}}'),
    {'id': 'sd_record', 'name': 'SD カードの収録', 'options': [sel('v', '操作', [('start', '始める'), ('end', '止める')])],
     'send': {'kind': 'http', 'method': 'GET', 'path': '/cgi-bin/sdctrl?save={{option.v}}'}, 'summary': 'SD {{option.v}}'},
    {'id': 'command_ptz', 'name': '雲台の命令を送る', 'options': [{'id': 'cmd', 'label': '命令（# の後ろ）', 'type': 'text', 'default': 'PTS5050', 'mono': True}],
     'send': {'kind': 'http', 'method': 'GET', 'path': '/cgi-bin/aw_ptz?cmd=%23{{option.cmd|url}}&res=1'}, 'summary': '#{{option.cmd}}'},
    {'id': 'command_cam', 'name': 'カメラの命令を送る', 'options': [{'id': 'cmd', 'label': '命令', 'type': 'text', 'default': 'OGU:08', 'mono': True}],
     'send': {'kind': 'http', 'method': 'GET', 'path': '/cgi-bin/aw_cam?cmd={{option.cmd|url}}&res=1'}, 'summary': '{{option.cmd}}'},
]

presets = [
    {'id': f'move_{k}', 'category': 'パン・チルト', 'name': l, 'text': l, 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': f'move_{k}', 'options': {'speed': 25}}} for k, l, _p, _t in DIRS[:4]
] + [
    {'id': 'stop', 'category': 'パン・チルト', 'name': '止める', 'text': 'STOP', 'backgroundColor': '#2A2A2E', 'action': {'definitionId': 'stop', 'options': {}}},
    {'id': 'home', 'category': 'パン・チルト', 'name': 'ホーム', 'text': 'HOME', 'backgroundColor': '#2A2A2E', 'action': {'definitionId': 'home', 'options': {}}},
] + [
    {'id': f'p{n}', 'category': 'プリセット', 'name': f'プリセット {n}', 'text': f'PRESET\n{n}', 'backgroundColor': '#1F5FD6',
     'action': {'definitionId': 'preset_recall', 'options': {'n': n}}} for n in range(1, 9)
] + [
    {'id': 'tally_on', 'category': 'タリー', 'name': '赤タリー ON', 'text': 'TALLY\nON', 'backgroundColor': '#E0302B',
     'action': {'definitionId': 'tally_red', 'options': {'v': '1'}}},
    {'id': 'tally_off', 'category': 'タリー', 'name': '赤タリー OFF', 'text': 'TALLY\nOFF', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'tally_red', 'options': {'v': '0'}}},
]

definition = {
    'format': 1,
    'id': 'panasonic-ptz',
    'name': 'Panasonic リモートカメラ（AW-HE / AW-UE）',
    'category': 'カメラ',
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
        {'title': 'Panasonic「HD Integrated Camera Interface Specifications V1.07E」：aw_ptz / aw_cam の URL、#PTS・#APC・#Z・#AXZ・#F・#AXF・#D1・#I・#AXI・#D3・#M・#R・#UPVS・#O・#INS、OSE:69:1・ORS・OSH・OFT・DCB・XSF・OWS・OAS',
         'url': 'https://ap.connect.panasonic.com/sites/default/files/media/document/2019-02/HDIntegratedCamera_InterfaceSpecifications-V1.07E.pdf', 'status': '確認済'},
        {'title': 'ゲイン（OGU）・ペデスタル（OTP）・プリセットの内容（OSE:71）・動き方（OSJ:29）・タリー（TLR / TLG）・SD 収録：公開 OSS のモジュール panasonic-ptz（MIT）を conductor-drivers の Actions で動かした送信',
         'status': '確認済'},
        {'title': 'シャッター・ND・シーンの番号は機種と映像の形式で変わる', 'status': '推測', 'note': '機種の説明書で確かめる'},
    ],
}

OUT.write_text(json.dumps(definition, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('wrote', OUT.name, len(actions), 'actions')
