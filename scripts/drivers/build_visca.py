#!/usr/bin/env python3
"""VISCA over IP の PTZ カメラのドライバ定義（JSON）を作る（SPEC 7.1・8.8）。

頭（種別・長さ・通し番号）はアプリ組み込みの通信手順 visca-ip（src/drivers/visca.ts）が付ける。
根拠：Sony の VISCA コマンド一覧（ILME-FR7 VISCA command list、公開）。命令の中身はメーカー共通の VISCA【他社のカメラは推測】。
手で JSON を直さず、このスクリプトを直して再生成する。
使い方：python3 scripts/drivers/build_visca.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'src' / 'drivers' / 'defs' / 'visca-ip.json'


def sel(id_, label, pairs, default=None):
    return {'id': id_, 'label': label, 'type': 'select', 'default': default if default is not None else pairs[0][0],
            'choices': [{'id': i, 'label': l} for i, l in pairs]}


def num(id_, label, default, lo, hi, help_=None):
    f = {'id': id_, 'label': label, 'type': 'number', 'default': default, 'min': lo, 'max': hi}
    if help_:
        f['help'] = help_
    return f


def act(id_, name, options, data, summary=None):
    a = {'id': id_, 'name': name, 'options': options, 'send': {'kind': 'bytes', 'data': data, 'encoding': 'hex'}}
    if summary:
        a['summary'] = summary
    return a



# 値の表（Sony の VISCA 一覧。左が画面、右が p q の 2 桁）
IRIS = [('19', 'F2.0'), ('18', 'F2.2'), ('17', 'F2.4'), ('16', 'F2.6'), ('15', 'F2.8'), ('14', 'F3.1'), ('13', 'F3.4'), ('12', 'F3.7'), ('11', 'F4.0'),
        ('10', 'F4.4'), ('0F', 'F4.8'), ('0E', 'F5.2'), ('0D', 'F5.6'), ('0C', 'F6.2'), ('0B', 'F6.8'), ('0A', 'F7.3'), ('09', 'F8.0'), ('08', 'F8.7'),
        ('07', 'F9.6'), ('06', 'F10'), ('05', 'F11'), ('00', '閉じる')]
GAIN = [(f'{i:02X}', f'{(i - 1) * 3} dB') for i in range(1, 18)]
SHUTTER = [('06', '1/1'), ('07', '2/3'), ('08', '1/2'), ('09', '1/3'), ('0A', '1/4'), ('0B', '1/6'), ('0C', '1/8'), ('0D', '1/10'), ('0E', '1/15'), ('0F', '1/20'),
           ('10', '1/30'), ('11', '1/50'), ('12', '1/60'), ('13', '1/90'), ('14', '1/100'), ('15', '1/125'), ('16', '1/180'), ('17', '1/250'), ('18', '1/350'),
           ('19', '1/500'), ('1A', '1/725'), ('1B', '1/1000'), ('1C', '1/1500'), ('1D', '1/2000'), ('1E', '1/3000'), ('1F', '1/4000'), ('20', '1/6000'),
           ('21', '1/10000')]


def nibbles(code):
    """2 桁の 16 進 → VISCA の 0p 0q"""
    return f'0{code[0]} 0{code[1]}'

PAN = num('pan', 'パンの速さ（1–24）', 8, 1, 24)
TILT = num('tilt', 'チルトの速さ（1–20）', 8, 1, 20)
SPEED = '{{option.pan|hexu|pad2}} {{option.tilt|hexu|pad2}}'
DIRS = [
    ('up', '上', '03 01'), ('down', '下', '03 02'), ('left', '左', '01 03'), ('right', '右', '02 03'),
    ('upleft', '左上', '01 01'), ('upright', '右上', '02 01'), ('downleft', '左下', '01 02'), ('downright', '右下', '02 02'),
]
ZSPEED = num('speed', '速さ（0–7）', 4, 0, 7, '0 がいちばん遅い')
PRESET = num('n', 'プリセット番号（1–64）', 1, 1, 64)

actions = [
    act('move', 'パン・チルト', [sel('dir', '向き', [(c, l) for c, l, _ in DIRS]), PAN, TILT],
        '81 01 06 01 ' + SPEED + ' {{option.dir|map}} FF', summary='パン・チルト {{option.dir}}'),
    act('stop', 'パン・チルトを止める', [], '81 01 06 01 01 01 03 03 FF'),
    act('home', 'ホームへ', [], '81 01 06 04 FF'),
    act('zoom_in', 'ズームイン', [ZSPEED], '81 01 04 07 2{{option.speed}} FF'),
    act('zoom_out', 'ズームアウト', [ZSPEED], '81 01 04 07 3{{option.speed}} FF'),
    act('zoom_stop', 'ズームを止める', [], '81 01 04 07 00 FF'),
    act('focus_far', 'フォーカス 遠く', [ZSPEED], '81 01 04 08 2{{option.speed}} FF'),
    act('focus_near', 'フォーカス 近く', [ZSPEED], '81 01 04 08 3{{option.speed}} FF'),
    act('focus_stop', 'フォーカスを止める', [], '81 01 04 08 00 FF'),
    act('focus_auto', 'オートフォーカス', [], '81 01 04 38 02 FF'),
    act('focus_manual', 'マニュアルフォーカス', [], '81 01 04 38 03 FF'),
    act('preset_recall', 'プリセットを呼び出す', [PRESET], '81 01 04 3F 02 {{option.n|lin:1:-1|hexu|pad2}} FF', summary='プリセット {{option.n}}'),
    act('preset_set', 'プリセットに記憶', [PRESET], '81 01 04 3F 01 {{option.n|lin:1:-1|hexu|pad2}} FF'),
    act('preset_reset', 'プリセットを消す', [PRESET], '81 01 04 3F 00 {{option.n|lin:1:-1|hexu|pad2}} FF'),
    act('power_on', '電源を入れる', [], '81 01 04 00 02 FF'),
    act('power_off', 'スタンバイ', [], '81 01 04 00 03 FF'),
    # ---- 画づくり（中身は Sony の VISCA 一覧。公開 OSS のモジュール sony-visca（MIT）の送信とも一致）
    act('slow_mode', 'パン・チルトのスローモード', [sel('v', '状態', [('02', 'ON'), ('03', 'OFF')])], '81 01 06 44 {{option.v}} FF', 'スロー {{option.v}}'),
    act('zoom_mode', 'ズームの方式', [sel('v', '方式', [('02', 'デジタル'), ('03', '光学のみ'), ('04', 'クリアイメージズーム')])], '81 01 04 06 {{option.v}} FF'),
    act('focus_one_push', 'ワンプッシュ AF', [], '81 01 04 18 01 FF'),
    act('exposure_mode', '露出の方式', [sel('v', '方式', [('00', 'フルオート'), ('03', 'マニュアル'), ('0A', 'シャッター優先'), ('0B', 'アイリス優先'), ('0E', 'ゲイン優先')])],
        '81 01 04 39 {{option.v}} FF', '露出 {{option.v}}'),
    act('iris_step', 'アイリスを開く / 絞る', [sel('v', '向き', [('02', '開く'), ('03', '絞る')])], '81 01 04 0B {{option.v}} FF'),
    act('iris_set', 'アイリスを決める', [sel('v', 'F 値', IRIS)], '81 01 04 4B 00 00 {{option.v|map}} FF', 'アイリス {{option.v}}'),
    act('gain_step', 'ゲインを上げる / 下げる', [sel('v', '向き', [('02', '上げる'), ('03', '下げる')])], '81 01 04 0C {{option.v}} FF'),
    act('gain_set', 'ゲインを決める', [sel('v', 'ゲイン', GAIN)], '81 01 04 4C 00 00 {{option.v|map}} FF', 'ゲイン {{option.v}}'),
    act('shutter_step', 'シャッターを速く / 遅く', [sel('v', '向き', [('02', '速く'), ('03', '遅く')])], '81 01 04 0A {{option.v}} FF'),
    act('shutter_set', 'シャッターを決める', [sel('v', 'シャッター', SHUTTER)], '81 01 04 4A 00 00 {{option.v|map}} FF', 'シャッター {{option.v}}'),
    act('bright_step', '明るさを上げる / 下げる', [sel('v', '向き', [('02', '上げる'), ('03', '下げる')])], '81 01 04 0D {{option.v}} FF'),
    act('bright_set', '明るさを決める', [sel('v', '明るさ', [(f'{i:02X}', str(i)) for i in range(0, 42)], '01')], '81 01 04 4D 00 00 {{option.v|map}} FF',
        '明るさ {{option.v}}'),
    act('expcomp', '露出補正', [sel('v', '状態', [('02', 'ON'), ('03', 'OFF')])], '81 01 04 3E {{option.v}} FF'),
    act('expcomp_step', '露出補正を上げる / 下げる', [sel('v', '操作', [('02', '＋'), ('03', '−'), ('00', 'リセット')])], '81 01 04 0E {{option.v}} FF'),
    act('expcomp_set', '露出補正の値', [sel('v', '値', [(f'{i:02X}', f'{i - 7:+d}' if i != 7 else '0') for i in range(14, -1, -1)], '07')],
        '81 01 04 4E 00 00 {{option.v|map}} FF', '露出補正 {{option.v}}'),
    act('aperture_step', 'アパーチャー（輪郭）', [sel('v', '操作', [('02', '＋'), ('03', '−'), ('00', 'リセット')])], '81 01 04 02 {{option.v}} FF'),
    act('wdr', 'ワイドダイナミックレンジ', [sel('v', '強さ', [('00', 'OFF'), ('01', '弱'), ('02', '中'), ('03', '強')])], '81 01 7E 04 00 {{option.v}} FF'),
    act('nr', 'ノイズリダクション', [sel('v', '強さ', [('00', 'OFF'), ('01', '1（弱）'), ('02', '2'), ('03', '3（標準）'), ('04', '4'), ('05', '5（強）')])],
        '81 01 04 53 {{option.v}} FF'),
    act('backlight', '逆光補正', [sel('v', '状態', [('02', 'ON'), ('03', 'OFF')])], '81 01 04 33 {{option.v}} FF'),
    act('spotlight', 'スポットライト補正', [sel('v', '状態', [('02', 'ON'), ('03', 'OFF')])], '81 01 04 3A {{option.v}} FF'),
    act('wb_mode', 'ホワイトバランス', [sel('v', '方式', [('00', 'オート'), ('01', '屋内'), ('02', '屋外'), ('03', 'ワンプッシュ'), ('04', 'ATW'), ('05', 'マニュアル')])],
        '81 01 04 35 {{option.v}} FF', 'WB {{option.v}}'),
    act('wb_one_push', 'ワンプッシュ WB を実行', [], '81 01 04 10 05 FF'),
    act('wb_offset', 'ホワイトバランスのオフセット', [sel('v', '操作', [('02', '赤寄り'), ('03', '青寄り'), ('00', 'リセット')])], '81 01 7E 01 2E 00 {{option.v}} FF'),
    act('menu', 'メニュー', [sel('v', '操作', [('06 06 10', '表示 / 戻る'), ('7E 01 02 00 01', '決定')])], '81 01 {{option.v}} FF'),
    act('latency', '映像の遅れ', [sel('v', 'モード', [('03', '標準'), ('02', '低遅延（デジタルズーム無効）')])], '81 01 7E 01 5A {{option.v}} FF'),
    {'id': 'command', 'name': '命令を送る（16 進）',
     'options': [{'id': 'hex', 'label': 'VISCA の命令（16 進）', 'type': 'text', 'placeholder': '81 01 06 04 FF', 'pattern': '^8[0-9A-Fa-f]( ?[0-9A-Fa-f]{2})* ?[Ff][Ff]$', 'mono': True}],
     'send': {'kind': 'bytes', 'data': '{{option.hex}}', 'encoding': 'hex'}, 'summary': '{{option.hex}}'},
]
actions[0]['maps'] = {'dir': {c: v for c, _, v in DIRS}}
for a in actions:
    if '{{option.v|map}}' in a['send']['data']:
        a['maps'] = {'v': {c['id']: nibbles(c['id']) for c in a['options'][0]['choices']}}

presets = [
    {'id': f'move_{c}', 'category': 'パン・チルト', 'name': l, 'text': l, 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'move', 'options': {'dir': c, 'pan': 8, 'tilt': 8}}}
    for c, l, _ in DIRS[:4]
] + [
    {'id': 'stop', 'category': 'パン・チルト', 'name': '止める', 'text': 'STOP', 'backgroundColor': '#2A2A2E', 'action': {'definitionId': 'stop', 'options': {}}},
    {'id': 'home', 'category': 'パン・チルト', 'name': 'ホーム', 'text': 'HOME', 'backgroundColor': '#2A2A2E', 'action': {'definitionId': 'home', 'options': {}}},
] + [
    {'id': f'p{n}', 'category': 'プリセット', 'name': f'プリセット {n}', 'text': f'PRESET\n{n}', 'backgroundColor': '#1F5FD6',
     'action': {'definitionId': 'preset_recall', 'options': {'n': n}}}
    for n in range(1, 9)
]

definition = {
    'format': 1,
    'id': 'visca-ip',
    'name': 'PTZ カメラ（VISCA over IP）',
    'category': 'カメラ',
    'version': '1.1.0',
    'minAppVersion': '0.6.0',
    'transport': 'udp',
    'session': 'visca-ip',
    'configFields': [
        {'id': 'host', 'label': 'IP アドレス', 'type': 'text', 'placeholder': '192.168.0.100', 'pattern': '^[A-Za-z0-9.:\\-]+$', 'mono': True},
        {'id': 'port', 'label': 'ポート', 'type': 'number', 'default': 52381, 'min': 1, 'max': 65535},
        {'id': 'framing', 'label': '頭（ヘッダー）', 'type': 'select', 'default': 'sony',
         'choices': [{'id': 'sony', 'label': '付ける（Sony 形式・52381）'}, {'id': 'raw', 'label': '付けない（VISCA だけ）'}],
         'help': '頭を付けないカメラはポートも機種の説明書の番号にします'},
    ],
    'actions': actions,
    'feedbacks': [],
    'variables': [{'id': 'last_reply', 'name': '最後の返事（ack / done / error）'}],
    'presets': presets,
    'evidence': [
        {'title': 'Sony VISCA コマンド一覧（VISCA over IP の頭・UDP 52381・RESET、パン・チルト・ズーム・フォーカス・プリセット）',
         'url': 'https://www.sony.jp/ls-camera/download/pdf/FR7/ILME-FR7_VISCA_command_list.pdf', 'status': '確認済',
         'note': '画づくりの命令は公開 OSS のモジュール sony-visca（MIT）を conductor-drivers の Actions で動かした送信とも一致。Sony 以外のカメラ（BirdDog・PTZOptics など）は同じ VISCA を使うものが多いが【推測】。実機で確かめる'},
    ],
}
OUT.write_text(json.dumps(definition, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('wrote', OUT.name, len(actions), 'actions')
