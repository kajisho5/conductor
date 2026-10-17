#!/usr/bin/env python3
"""OSEE GoStream シリーズ（LAN・TCP 19010）のドライバ定義（JSON）を作る（SPEC 7.1・8.5）。

枠と CRC の付け方・受信の解析はアプリ組み込みの通信手順 osee（src/drivers/osee.ts）が行う。
この定義は、動作ごとに送る JSON（{"id":…,"type":"set","value":[…]}、1 行に 1 つ）と、状態表示・変数・プリセットを持つ。
根拠：公開 OSS「companion-module-osee-gostream-series」（MIT）と、オーナーの別アプリ kajisho5/osee_control_software（cutline）の
controller/commands.ts・config/sourceIds.ts・config/deviceProfiles.ts。値の形は【推測】を含む。
手で JSON を直さず、このスクリプトを直して再生成する。
使い方：python3 scripts/drivers/build_osee.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'src' / 'drivers' / 'defs' / 'osee-gostream.json'

# 入力の番号（cutline の sourceIds.ts。機種で名前が違うものは括弧で併記）
SOURCES = [('0', 'ブラック')] + [(str(n), f'入力 {n}') for n in range(1, 9)] + [
    ('4001', 'AUX 1（Duet 8 ISO は入力 5、Omni はプレーヤー 1）'),
    ('4002', 'AUX 2（Duet 8 ISO は入力 6、Omni はプレーヤー 2）'),
    ('4003', 'AUX 3（Duet 8 ISO は入力 7）'),
    ('4004', 'AUX 4（Duet 8 ISO は入力 8）'),
    ('3010', 'メディア 1（Omni は GFX 1）'),
    ('3020', 'メディア 2（Omni は GFX 2）'),
    ('5001', 'マルチソース（M/SRC）'),
    ('1000', 'カラーバー'),
    ('2001', 'カラー 1'),
    ('2002', 'カラー 2'),
]
SOURCE_NAMES = {i: l.split('（')[0] for i, l in SOURCES}
AUDIO = [(str(n), f'入力 {n}') for n in range(1, 9)] + [
    ('4001', 'AUX 1'), ('4002', 'AUX 2'), ('4003', 'AUX 3'), ('4004', 'AUX 4'),
    ('1301', 'マイク 1'), ('1302', 'マイク 2'), ('1303', 'マイク 3'), ('1304', 'マイク 4'),
]


def choices(pairs):
    return [{'id': i, 'label': l} for i, l in pairs]


def sel(id_, label, pairs, default=None):
    return {'id': id_, 'label': label, 'type': 'select', 'default': default if default is not None else pairs[0][0], 'choices': choices(pairs)}


def num(id_, label, default, lo, hi, help_=None):
    f = {'id': id_, 'label': label, 'type': 'number', 'default': default, 'min': lo, 'max': hi}
    if help_:
        f['help'] = help_
    return f


def cmd(id_, value=None):
    """送る JSON（テンプレートの文字）。value は JSON の中身の文字（{{option.x}} を含んでよい）"""
    if value is None:
        return f'{{"id":"{id_}","type":"set"}}'
    return f'{{"id":"{id_}","type":"set","value":[{value}]}}'


def action(id_, name, options, *lines, summary=None):
    a = {'id': id_, 'name': name, 'options': options, 'send': {'kind': 'bytes', 'data': '\\n'.join(lines), 'encoding': 'text'}}
    if summary:
        a['summary'] = summary
    return a


SRC = sel('src', '入力', SOURCES, '1')
ON_OFF_BOOL = sel('on', '状態', [('true', 'ON'), ('false', 'OFF')])
ON_OFF_NUM = sel('on', '状態', [('1', 'ON'), ('0', 'OFF')])
KEY = sel('i', 'キー', [(str(i), f'KEY {i + 1}') for i in range(4)], '0')
DSK = sel('i', 'DSK', [(str(i), f'DSK {i + 1}') for i in range(2)], '0')
PLAYER = sel('p', 'プレーヤー', [('0', 'プレーヤー 1'), ('1', 'プレーヤー 2')], '0')

actions = [
    action('pgm', 'PGM を選ぶ', [SRC], cmd('pgmIndex', '{{option.src}}'), summary='PGM {{option.src}}'),
    action('pvw', 'PVW（プレビュー）を選ぶ', [SRC], cmd('pvwIndex', '{{option.src}}'), summary='PVW {{option.src}}'),
    action('cut', 'CUT', [], cmd('cutTransition'), summary='CUT'),
    action('auto', 'AUTO', [], cmd('autoTransition'), summary='AUTO'),
    action('ftb', 'FTB（フェード・トゥ・ブラック）', [], cmd('ftb'), summary='FTB'),
    action('transition_style', 'トランジションの種類', [sel('style', '種類', [('"Mix"', 'MIX'), ('"Dip"', 'DIP'), ('"Wipe"', 'WIPE')])],
           cmd('transitionStyle', '{{option.style}}')),
    action('transition_rate', 'トランジションの時間',
           [sel('kind', '種類', [('transitionMixRate', 'MIX'), ('transitionDipRate', 'DIP'), ('transitionWipeRate', 'WIPE')]),
            num('sec', '時間（秒）', 1, 0.5, 8, '0.5〜8 秒')],
           '{"id":"{{option.kind}}","type":"set","value":[{{option.sec}}]}'),
    action('prev_trans', 'プレビュートランジション（PREV TRANS）', [ON_OFF_NUM], cmd('previewTransition', '{{option.on}}')),
    action('ftb_rate', 'FTB の時間', [num('sec', '時間（秒）', 1, 0, 8, '0〜8 秒')], cmd('ftbRate', '{{option.sec}}')),
    action('ftb_afv', 'FTB で音も絞る（AFV）', [ON_OFF_NUM], cmd('ftbAfv', '{{option.on}}')),
    action('key_next', 'KEY を次のトランジションに入れる', [KEY, ON_OFF_BOOL], cmd('keyEnable', '{{option.i}},{{option.on}}')),
    action('key_on_air', 'KEY を ON AIR', [KEY, ON_OFF_BOOL], cmd('keyOnAir', '{{option.i}},{{option.on}}'), summary='KEY {{option.i}} {{option.on}}'),
    action('dsk_next', 'DSK を次のトランジションに入れる', [DSK, ON_OFF_NUM], cmd('dskEnable', '{{option.i}},{{option.on}}')),
    action('dsk_on_air', 'DSK を ON AIR', [DSK, ON_OFF_NUM], cmd('dskOnAir', '{{option.i}},{{option.on}}'), summary='DSK {{option.i}} {{option.on}}'),
    action('multisource', 'マルチソースを使う', [ON_OFF_NUM], cmd('multiSourceEnable', '{{option.on}}')),
    action('audio_state', '音声の ON / AFV / OFF', [sel('src', '音声', AUDIO, '1'), sel('state', '状態', [('1', 'ON'), ('2', 'AFV'), ('0', 'OFF')])],
           cmd('audioMixerEnable', '{{option.src}},{{option.state}}')),
    action('audio_fader', '音声のフェーダー', [sel('src', '音声', AUDIO, '1'), num('db', 'レベル（dB）', 0, -75, 10, '-75〜+10 dB（0.5 dB きざみ）')],
           cmd('audioMixerFader', '{{option.src}},{{option.db}}')),
    action('record_start', '収録を始める', [sel('iso', '収録', [('0', 'PGM'), ('1', 'ISO（Duet 8 ISO・Omni）')])], cmd('recordStart', '{{option.iso}}')),
    action('record_stop', '収録を止める', [], cmd('recordStop')),
    action('live', '配信', [ON_OFF_NUM], cmd('live', '{{option.on}}'), summary='配信 {{option.on}}'),
    action('stream_dest', '配信先を使う', [sel('i', '配信先', [('0', '配信先 1'), ('1', '配信先 2'), ('2', '配信先 3')]), ON_OFF_NUM],
           cmd('liveStreamOutputEnable', '{{option.i}},{{option.on}}')),
    action('macro_run', 'マクロを実行', [num('i', 'マクロ番号（1–32）', 1, 1, 32)], cmd('macroRunStart', '{{option.i|lin:1:-1}}'),
           summary='マクロ {{option.i}}'),
    action('macro_stop', 'マクロを止める', [], cmd('macroRunStop')),
    action('macro_loop', 'マクロを繰り返す', [ON_OFF_NUM], cmd('macroRunLoop', '{{option.on}}')),
    action('macro_record_stop', 'マクロの記録を終える', [], cmd('macroRecordStop')),
    action('play_prev', 'プレーヤー 前へ', [PLAYER], cmd('playPrev', '{{option.p}}')),
    action('play_next', 'プレーヤー 次へ', [PLAYER], cmd('playNext', '{{option.p}}')),
    action('play_pause', 'プレーヤー 再生 / 一時停止', [PLAYER, sel('on', '状態', [('1', '再生'), ('0', '一時停止')])],
           cmd('playPause', '{{option.p}},{{option.on}}')),
    action('still_to_player', 'スチルをメディアに出す', [PLAYER, num('n', 'スチル番号（1–32）', 1, 1, 32)],
           cmd('mediaPlayer', '{{option.p}},"Still",{{option.n|lin:1:-1}}')),
    action('grab_still', 'スチルを撮る（Omni 12 ISO）', [], cmd('grabStill', '')),
    action('ptz_select', 'PTZ カメラを選ぶ（Omni 12 ISO）', [num('cam', 'カメラ番号（1–）', 1, 1, 8)], cmd('ptzSelect', '{{option.cam|lin:1:-1}}')),
    action('ptz_preset', 'PTZ プリセットを呼び出す（Omni 12 ISO）', [num('i', 'プリセット番号（1–）', 1, 1, 255)], cmd('ptzPresetRun', '{{option.i|lin:1:-1}}')),
    action('ptz_move', 'PTZ を動かす（Omni 12 ISO）',
           [sel('dir', '向き', [('0,9', '上'), ('0,-9', '下'), ('-9,0', '左'), ('9,0', '右'), ('0,0', '止める')])],
           cmd('ptzPanTilt', '{{option.dir}}')),
    action('ptz_home', 'PTZ をホームへ（Omni 12 ISO）', [], cmd('ptzPanTiltHome')),
    action('ptz_zoom', 'PTZ ズーム（Omni 12 ISO）', [sel('dir', '向き', [('1', 'ズームイン（T）'), ('0', 'ズームアウト（W）')])], cmd('ptzZoomStart', '{{option.dir}}')),
    action('ptz_zoom_stop', 'PTZ ズームを止める（Omni 12 ISO）', [], cmd('ptzZoomStop')),
    {
        'id': 'command', 'name': '命令を送る（JSON）',
        'options': [
            {'id': 'id', 'label': '命令の id', 'type': 'text', 'placeholder': 'pgmIndex', 'pattern': '^[A-Za-z0-9_]+$', 'mono': True},
            sel('type', '種類', [('set', 'set（変える）'), ('get', 'get（問い合わせる）')]),
            {'id': 'value', 'label': '値（JSON の並び。空なら無し）', 'type': 'text', 'placeholder': '1,true', 'mono': True,
             'help': '文字は "" で囲む。例：0,"Still",3'},
        ],
        'send': {'kind': 'bytes', 'data': '{"id":"{{option.id}}","type":"{{option.type}}","value":[{{option.value}}]}', 'encoding': 'text'},
        'summary': '{{option.id}} {{option.value}}',
    },
]

feedbacks = [
    {'id': 'pgm_is', 'name': 'PGM が入力', 'options': [SRC], 'compare': {'variable': 'pgmIndex', 'op': 'eq', 'value': '{{option.src}}'},
     'summary': 'PGM が {{option.src}}'},
    {'id': 'pvw_is', 'name': 'PVW が入力', 'options': [SRC], 'compare': {'variable': 'pvwIndex', 'op': 'eq', 'value': '{{option.src}}'},
     'summary': 'PVW が {{option.src}}'},
    {'id': 'key_on_air', 'name': 'KEY が ON AIR', 'options': [KEY], 'compare': {'variable': 'keyOnAir_{{option.i}}', 'op': 'eq', 'value': '1'}},
    {'id': 'dsk_on_air', 'name': 'DSK が ON AIR', 'options': [DSK], 'compare': {'variable': 'dskOnAir_{{option.i}}', 'op': 'eq', 'value': '1'}},
    {'id': 'prev_trans', 'name': 'PREV TRANS が ON', 'options': [], 'compare': {'variable': 'previewTransition', 'op': 'eq', 'value': '1'}},
    {'id': 'ftb_on', 'name': 'FTB 中', 'options': [], 'compare': {'variable': 'ftbStatus', 'op': 'neq', 'value': '0'}},
    {'id': 'recording', 'name': '収録中', 'options': [], 'compare': {'variable': 'recordStatus', 'op': 'neq', 'value': '0'}},
    {'id': 'live', 'name': '配信中', 'options': [], 'compare': {'variable': 'live', 'op': 'eq', 'value': '1'}},
    {'id': 'audio_on', 'name': '音声が ON', 'options': [sel('src', '音声', AUDIO, '1')],
     'compare': {'variable': 'audioMixerEnable_{{option.src}}', 'op': 'eq', 'value': '1'}},
]

variables = [
    {'id': 'pgmIndex', 'name': 'PGM の入力番号'},
    {'id': 'pvwIndex', 'name': 'PVW の入力番号'},
    {'id': 'pgm', 'name': 'PGM の入力名'},
    {'id': 'pvw', 'name': 'PVW の入力名'},
    {'id': 'transitionStyle', 'name': 'トランジションの種類'},
    {'id': 'recordStatus', 'name': '収録の状態'},
    {'id': 'recordDuration', 'name': '収録の時間'},
    {'id': 'live', 'name': '配信の状態'},
    {'id': 'deviceType', 'name': '機種の番号（10 = Duet 8 ISO、20 = Omni 12 ISO）'},
    {'id': 'deviceName', 'name': '本体の名前'},
    {'id': 'version', 'name': 'ファームウェアの版'},
]

derive = [
    {'variable': 'pgm', 'from': 'pgmIndex', 'map': SOURCE_NAMES, 'default': '?'},
    {'variable': 'pvw', 'from': 'pvwIndex', 'map': SOURCE_NAMES, 'default': '?'},
]

presets = []
for n in range(1, 9):
    presets.append({'id': f'pgm{n}', 'category': 'PGM', 'name': f'PGM 入力 {n}', 'text': f'PGM\nIN {n}', 'backgroundColor': '#2A2A2E',
                    'action': {'definitionId': 'pgm', 'options': {'src': str(n)}},
                    'feedbacks': [{'definitionId': 'pgm_is', 'options': {'src': str(n)}, 'backgroundColor': '#E0302B'}]})
for n in range(1, 9):
    presets.append({'id': f'pvw{n}', 'category': 'PVW', 'name': f'PVW 入力 {n}', 'text': f'PVW\nIN {n}', 'backgroundColor': '#2A2A2E',
                    'action': {'definitionId': 'pvw', 'options': {'src': str(n)}},
                    'feedbacks': [{'definitionId': 'pvw_is', 'options': {'src': str(n)}, 'backgroundColor': '#1F9E48'}]})
presets += [
    {'id': 'cut', 'category': 'トランジション', 'name': 'CUT', 'text': 'CUT', 'backgroundColor': '#E9E9EC', 'action': {'definitionId': 'cut', 'options': {}}},
    {'id': 'auto', 'category': 'トランジション', 'name': 'AUTO', 'text': 'AUTO', 'backgroundColor': '#F2C200', 'action': {'definitionId': 'auto', 'options': {}}},
    {'id': 'ftb', 'category': 'トランジション', 'name': 'FTB', 'text': 'FTB', 'backgroundColor': '#2A2A2E', 'action': {'definitionId': 'ftb', 'options': {}},
     'feedbacks': [{'definitionId': 'ftb_on', 'options': {}, 'backgroundColor': '#E0302B'}]},
    {'id': 'rec', 'category': '収録・配信', 'name': '収録を始める', 'text': 'REC', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'record_start', 'options': {'iso': '0'}},
     'feedbacks': [{'definitionId': 'recording', 'options': {}, 'backgroundColor': '#E0302B'}]},
    {'id': 'rec_stop', 'category': '収録・配信', 'name': '収録を止める', 'text': 'REC\nSTOP', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'record_stop', 'options': {}}},
]

definition = {
    'format': 1,
    'id': 'osee-gostream',
    'name': 'OSEE GoStream シリーズ（Deck / Duet / Duet 8 ISO / Omni 12 ISO）',
    'category': '映像スイッチャー',
    'version': '1.0.0',
    'minAppVersion': '0.6.0',
    'transport': 'tcp',
    'session': 'osee',
    'configFields': [
        {'id': 'host', 'label': 'IP アドレス', 'type': 'text', 'placeholder': '192.168.1.215', 'pattern': '^[A-Za-z0-9.:\\-]+$', 'mono': True},
        {'id': 'port', 'label': 'ポート', 'type': 'number', 'default': 19010, 'min': 1, 'max': 65535},
    ],
    'actions': actions,
    'feedbacks': feedbacks,
    'variables': variables,
    'derive': derive,
    'presets': presets,
    'evidence': [
        {'title': '枠（先頭 EB A6・種別・長さ・JSON・CRC-16/MODBUS）とポート 19010', 'status': '確認済',
         'note': '公開 OSS のモジュール osee-gostream-series（MIT）を conductor-drivers の Actions で動かして記録した送信と一致',
         'url': 'https://github.com/bitfocus/companion-module-osee-gostream-series'},
        {'title': '命令の id と値の形（pgmIndex・cutTransition・keyOnAir など）', 'status': '推測',
         'note': 'オーナーの別アプリ kajisho5/osee_control_software（同じ OSS と各機種の説明書が根拠。Duet 8 ISO の実機で使用）の実装から写した。'
                 'KEY は true / false、DSK は 1 / 0（cutline と同じ）。機器の画面の「最近のログ」（詳細）で送受信を確かめる'},
        {'title': 'PTZ・スチルを撮る は Omni 12 ISO のみ。FTB は Duet 8 ISO ではファームウェア 2.1.0 以降', 'status': '推測',
         'note': 'cutline の deviceProfiles と説明書'},
    ],
}

OUT.write_text(json.dumps(definition, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('wrote', OUT.relative_to(OUT.parents[3]), len(actions), 'actions')
