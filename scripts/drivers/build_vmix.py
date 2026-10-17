#!/usr/bin/env python3
"""vMix（TCP API、ポート 8099）のドライバ定義（JSON）を作る（SPEC 7.1・8.11）。

通信は汎用の TCP（行区切り）。命令は `FUNCTION <関数> <クエリ>`、つながったら TALLY と ACTS を購読し、
届いた `TALLY OK 0121…` と `ACTS OK <名前> <入力> <値>` を受信の規則で変数にする。
根拠：vMix 公式ヘルプ「TCP API」「Shortcut Function Reference」「Add/Edit Activator」。
手で JSON を直さず、このスクリプトを直して再生成する。
使い方：python3 scripts/drivers/build_vmix.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'src' / 'drivers' / 'defs' / 'vmix.json'
CRLF = '\\r\\n'
TALLY_INPUTS = 40

HOST = {'id': 'host', 'label': 'IP アドレス', 'type': 'text', 'placeholder': '192.168.10.60', 'pattern': '^[A-Za-z0-9.:\\-]+$', 'mono': True}
PORT = {'id': 'port', 'label': 'ポート', 'type': 'number', 'default': 8099, 'min': 1, 'max': 65535}


def sel(id_, label, pairs, default=None):
    return {'id': id_, 'label': label, 'type': 'select', 'default': default if default is not None else pairs[0][0],
            'choices': [{'id': i, 'label': l} for i, l in pairs]}


def num(id_, label, default, lo, hi, help_=None):
    f = {'id': id_, 'label': label, 'type': 'number', 'default': default, 'min': lo, 'max': hi}
    if help_:
        f['help'] = help_
    return f


def text(id_, label, default='', placeholder='', help_=None):
    f = {'id': id_, 'label': label, 'type': 'text', 'default': default}
    if placeholder:
        f['placeholder'] = placeholder
    if help_:
        f['help'] = help_
    return f


INPUT = text('input', '入力', '1', '1', '番号・名前・キーのどれでも')
MIX = sel('mix', 'ミックス', [('0', 'メイン')] + [(str(i), f'ミックス {i + 1}') for i in range(1, 16)])
DURATION = num('duration', '時間（ミリ秒）', 1000, 0, 60000)
BUS = sel('bus', 'バス', [('M', 'マスター')] + [(b, f'バス {b}') for b in 'ABCDEFG'])
BUS_ONLY = sel('bus', 'バス', [(b, f'バス {b}') for b in 'ABCDEFG'])
OVERLAY = sel('overlay', 'オーバーレイ', [(str(i), f'オーバーレイ {i}') for i in range(1, 5)])
TRANS_NO = sel('n', 'トランジション', [(str(i), f'トランジション {i}') for i in range(1, 5)])
EFFECTS = ['Fade', 'Cut', 'Merge', 'Wipe', 'Slide', 'Fly', 'CrossZoom', 'FlyRotate', 'Cube', 'CubeZoom', 'VerticalWipe',
           'VerticalSlide', 'Zoom', 'BarnDoor', 'VerticalBarnDoor', 'CircleWipe', 'Stinger1', 'Stinger2', 'Stinger3', 'Stinger4']
STREAM = sel('stream', '配信先', [('', 'すべて'), ('0', '配信 1'), ('1', '配信 2'), ('2', '配信 3'), ('3', '配信 4'), ('4', '配信 5')])


def fn(id_, name, function, options=(), query='', summary=None):
    """`FUNCTION 関数 クエリ` を 1 行で送る動作"""
    data = f'FUNCTION {function}' + (f' {query}' if query else '')
    a = {'id': id_, 'name': name, 'options': list(options), 'send': {'kind': 'bytes', 'data': data, 'encoding': 'text', 'terminator': CRLF}}
    if summary:
        a['summary'] = summary
    return a


Q_INPUT = 'Input={{option.input|url}}'
Q_INPUT_MIX = 'Input={{option.input|url}}&Mix={{option.mix}}'
Q_VALUE = 'Value={{option.value|url}}'
Q_VALUE_INPUT = 'Input={{option.input|url}}&Value={{option.value|url}}'

actions = [
    # ---- 切り替え
    fn('preview', 'プレビューに入力', 'PreviewInput', [INPUT, MIX], Q_INPUT_MIX, 'PVW {{option.input}}'),
    fn('program', '番組に入力（そのまま切り替え）', 'ActiveInput', [INPUT, MIX], Q_INPUT_MIX, 'PGM {{option.input}}'),
    fn('cut_direct', '番組に入力（CUT、プレビューを変えない）', 'CutDirect', [INPUT], Q_INPUT, 'CUT → {{option.input}}'),
    fn('cut', 'CUT', 'Cut', [MIX], 'Mix={{option.mix}}', 'CUT'),
    fn('fade', 'AUTO（フェード）', 'Fade', [DURATION, MIX], 'Duration={{option.duration}}&Mix={{option.mix}}', 'フェード {{option.duration}}ms'),
    fn('transition_effect', 'トランジション（種類を選んで）', '{{option.effect}}', [
        sel('effect', '種類', [(e, e) for e in EFFECTS]), DURATION, text('input', '入力（空ならプレビュー）'), MIX,
    ], 'Duration={{option.duration}}&Input={{option.input|url}}&Mix={{option.mix}}', '{{option.effect}} {{option.duration}}ms'),
    fn('transition_n', 'トランジション 1〜4 のボタン', 'Transition{{option.n}}', [TRANS_NO, MIX], 'Mix={{option.mix}}', 'トランジション {{option.n}}'),
    fn('stinger', 'スティンガー', 'Stinger{{option.n}}', [sel('n', 'スティンガー', [(str(i), f'スティンガー {i}') for i in range(1, 5)]),
                                                         text('input', '入力（空ならプレビュー）'), MIX],
       'Input={{option.input|url}}&Mix={{option.mix}}', 'スティンガー {{option.n}}'),
    fn('set_transition_effect', 'トランジション 1〜4 の種類', 'SetTransitionEffect{{option.n}}', [TRANS_NO, sel('value', '種類', [(e, e) for e in EFFECTS])],
       Q_VALUE, 'トランジション {{option.n}} を {{option.value}}'),
    fn('set_transition_duration', 'トランジション 1〜4 の時間', 'SetTransitionDuration{{option.n}}', [TRANS_NO, num('value', '時間（ミリ秒）', 1000, 0, 60000)],
       Q_VALUE, 'トランジション {{option.n}} {{option.value}}ms'),
    fn('fader', 'T バー', 'SetFader', [num('value', '位置（0〜255）', 0, 0, 255)], Q_VALUE, 'T バー {{option.value}}'),
    fn('ftb', 'FTB（フェード・トゥ・ブラック）', 'FadeToBlack', [], '', 'FTB'),
    fn('quick_play', 'クイックプレイ', 'QuickPlay', [INPUT], Q_INPUT, 'クイックプレイ {{option.input}}'),
    fn('preview_next', 'プレビューを次の入力へ', 'PreviewInputNext'),
    fn('preview_prev', 'プレビューを前の入力へ', 'PreviewInputPrevious'),
    # ---- オーバーレイ
    fn('overlay', 'オーバーレイ', 'OverlayInput{{option.overlay}}{{option.how}}', [
        OVERLAY, sel('how', '操作', [('', '切り替え'), ('In', '入れる'), ('Out', '出す'), ('Off', '消す（すぐ）'), ('Zoom', 'ズーム')]), text('input', '入力（空なら今の入力）', '1'),
    ], 'Input={{option.input|url}}', 'OVL {{option.overlay}} {{option.how}} {{option.input}}'),
    fn('overlay_last', 'オーバーレイに最後の入力', 'OverlayInput{{option.overlay}}Last', [OVERLAY], '', 'OVL {{option.overlay}} 直前'),
    fn('overlay_preview', 'オーバーレイをプレビューに', 'PreviewOverlayInput{{option.overlay}}', [OVERLAY, INPUT], Q_INPUT, 'OVL {{option.overlay}} PVW {{option.input}}'),
    fn('overlay_all_off', 'オーバーレイをすべて消す', 'OverlayInputAllOff'),
    fn('multiview_overlay', 'マルチビューのレイヤー', 'MultiViewOverlay{{option.how}}', [
        INPUT, num('value', 'レイヤー', 1, 1, 10), sel('how', '操作', [('', '切り替え'), ('On', 'ON'), ('Off', 'OFF')]),
    ], Q_VALUE_INPUT, '{{option.input}} レイヤー {{option.value}} {{option.how}}'),
    fn('layer', 'レイヤーの表示', 'Layer{{option.how}}', [INPUT, num('value', 'レイヤー', 1, 1, 10), sel('how', '操作', [('OnOff', '切り替え'), ('On', 'ON'), ('Off', 'OFF')])],
       Q_VALUE_INPUT, '{{option.input}} レイヤー {{option.value}} {{option.how}}'),
    fn('set_layer', 'レイヤーに入力を入れる', 'SetLayer', [INPUT, text('value', 'レイヤー,入力', '1,2', '1,2')], Q_VALUE_INPUT, '{{option.input}} ← {{option.value}}'),
    # ---- 音声
    fn('audio', '入力の音声', 'Audio{{option.how}}', [INPUT, sel('how', '操作', [('', '切り替え'), ('On', 'ON'), ('Off', 'OFF')])], Q_INPUT, '音声 {{option.input}} {{option.how}}'),
    fn('audio_auto', '入力の音声 AUTO', 'AudioAuto{{option.how}}', [INPUT, sel('how', '操作', [('', '切り替え'), ('On', 'ON'), ('Off', 'OFF')])], Q_INPUT,
       'AUTO {{option.input}} {{option.how}}'),
    fn('audio_bus', '入力をバスへ送る', 'AudioBus{{option.how}}', [INPUT, BUS, sel('how', '操作', [('', '切り替え'), ('On', 'ON'), ('Off', 'OFF')])],
       'Input={{option.input|url}}&Value={{option.bus}}', '{{option.input}} → {{option.bus}} {{option.how}}'),
    fn('volume', '入力の音量', 'SetVolume', [INPUT, num('value', '音量（0〜100）', 100, 0, 100)], Q_VALUE_INPUT, '音量 {{option.input}} {{option.value}}'),
    fn('volume_fade', '入力の音量をフェード', 'SetVolumeFade', [INPUT, num('volume', '音量（0〜100）', 0, 0, 100), DURATION],
       'Input={{option.input|url}}&Value={{option.volume}},{{option.duration}}', '音量 {{option.input}} → {{option.volume}}'),
    fn('volume_step', '入力の音量を上げ下げ', 'SetVolume', [INPUT, text('value', '変える量（+5 / -5 など）', '+5')], Q_VALUE_INPUT, '音量 {{option.input}} {{option.value}}'),
    fn('gain', '入力のゲイン', 'SetGain', [INPUT, num('value', 'ゲイン（0〜24 dB）', 0, 0, 24)], Q_VALUE_INPUT, 'ゲイン {{option.input}} {{option.value}}'),
    fn('balance', '入力のバランス', 'SetBalance', [INPUT, num('value', 'バランス（-1〜1）', 0, -1, 1)], Q_VALUE_INPUT, 'バランス {{option.input}} {{option.value}}'),
    fn('solo', '入力のソロ', 'Solo{{option.how}}', [INPUT, sel('how', '操作', [('', '切り替え'), ('On', 'ON'), ('Off', 'OFF')])], Q_INPUT, 'ソロ {{option.input}} {{option.how}}'),
    fn('solo_all_off', 'ソロをすべて切る', 'SoloAllOff'),
    fn('master_audio', 'マスターの音声', 'MasterAudio{{option.how}}', [sel('how', '操作', [('', '切り替え'), ('On', 'ON'), ('Off', 'OFF')])], '', 'マスター {{option.how}}'),
    fn('master_volume', 'マスターの音量', 'SetMasterVolume', [num('value', '音量（0〜100）', 100, 0, 100)], Q_VALUE, 'マスター {{option.value}}'),
    fn('master_volume_fade', 'マスターの音量をフェード', 'SetMasterVolumeFade', [num('volume', '音量（0〜100）', 0, 0, 100), DURATION],
       'Value={{option.volume}},{{option.duration}}', 'マスター → {{option.volume}}'),
    fn('bus_audio', 'バスの音声', 'BusXAudio{{option.how}}', [BUS_ONLY, sel('how', '操作', [('', '切り替え'), ('On', 'ON'), ('Off', 'OFF')])],
       'Value={{option.bus}}', 'バス {{option.bus}} {{option.how}}'),
    fn('bus_volume', 'バスの音量', 'SetBus{{option.bus}}Volume', [BUS_ONLY, num('value', '音量（0〜100）', 100, 0, 100)], Q_VALUE, 'バス {{option.bus}} {{option.value}}'),
    fn('bus_send_master', 'バスをマスターへ送る', 'BusXSendToMaster{{option.how}}', [BUS_ONLY, sel('how', '操作', [('', '切り替え'), ('On', 'ON'), ('Off', 'OFF')])],
       'Value={{option.bus}}', 'バス {{option.bus}} → マスター {{option.how}}'),
    fn('headphones_volume', 'ヘッドホンの音量', 'SetHeadphonesVolume', [num('value', '音量（0〜100）', 100, 0, 100)], Q_VALUE, 'ヘッドホン {{option.value}}'),
    # ---- 出力
    fn('streaming', '配信', '{{option.how}}Streaming', [sel('how', '操作', [('StartStop', '切り替え'), ('Start', '始める'), ('Stop', '止める')]), STREAM],
       'Value={{option.stream}}', '配信 {{option.how}}'),
    fn('recording', '録画', '{{option.how}}Recording', [sel('how', '操作', [('StartStop', '切り替え'), ('Start', '始める'), ('Stop', '止める')])], '', '録画 {{option.how}}'),
    fn('external', '外部出力', '{{option.how}}External', [sel('how', '操作', [('StartStop', '切り替え'), ('Start', '始める'), ('Stop', '止める')])], '', '外部出力 {{option.how}}'),
    fn('multicorder', 'マルチコーダー', '{{option.how}}MultiCorder', [sel('how', '操作', [('StartStop', '切り替え'), ('Start', '始める'), ('Stop', '止める')])], '',
       'マルチコーダー {{option.how}}'),
    fn('srt_output', 'SRT 出力', '{{option.how}}SRTOutput', [sel('how', '操作', [('StartStop', '切り替え'), ('Start', '始める'), ('Stop', '止める')]),
                                                           sel('value', '出力', [('0', '出力 1'), ('1', '出力 2'), ('2', '出力 3'), ('3', '出力 4')])],
       Q_VALUE, 'SRT {{option.value}} {{option.how}}'),
    fn('fullscreen', 'フルスクリーン', 'Fullscreen{{option.how}}', [sel('how', '操作', [('', '切り替え'), ('On', 'ON'), ('Off', 'OFF')])], '', 'フルスクリーン {{option.how}}'),
    fn('set_output', '出力の中身', 'SetOutput{{option.output}}', [
        sel('output', '出力', [('2', '出力 2'), ('3', '出力 3'), ('4', '出力 4'), ('External2', '外部出力 2'), ('Fullscreen', 'フルスクリーン'), ('Fullscreen2', 'フルスクリーン 2')]),
        sel('value', '中身', [('Output', '番組'), ('Preview', 'プレビュー'), ('MultiView', 'マルチビュー'), ('Input', '入力（下で選ぶ）'), ('Replay', 'リプレイ')]),
        text('input', '入力（中身が入力の時）', '1'),
    ], Q_VALUE_INPUT, '出力 {{option.output}} ← {{option.value}}'),
    fn('snapshot', 'スナップショット（番組）', 'Snapshot', [text('value', '保存先（空なら既定）')], Q_VALUE, 'スナップショット'),
    fn('snapshot_input', 'スナップショット（入力）', 'SnapshotInput', [INPUT, text('value', '保存先（空なら既定）')], Q_VALUE_INPUT, 'スナップショット {{option.input}}'),
    # ---- 入力の再生
    fn('play', '再生', 'Play', [INPUT], Q_INPUT, '再生 {{option.input}}'),
    fn('pause', '一時停止', 'Pause', [INPUT], Q_INPUT, '一時停止 {{option.input}}'),
    fn('play_pause', '再生 / 一時停止', 'PlayPause', [INPUT], Q_INPUT, '再生/停止 {{option.input}}'),
    fn('restart', '最初から', 'Restart', [INPUT], Q_INPUT, '最初から {{option.input}}'),
    fn('loop', 'ループ', 'Loop{{option.how}}', [INPUT, sel('how', '操作', [('', '切り替え'), ('On', 'ON'), ('Off', 'OFF')])], Q_INPUT, 'ループ {{option.input}} {{option.how}}'),
    fn('next_item', '次の項目（リスト・写真）', 'NextItem', [INPUT], Q_INPUT, '次 {{option.input}}'),
    fn('previous_item', '前の項目（リスト・写真）', 'PreviousItem', [INPUT], Q_INPUT, '前 {{option.input}}'),
    fn('select_index', '項目を選ぶ（リスト・写真）', 'SelectIndex', [INPUT, num('value', '番号（1 から）', 1, 1, 9999)], Q_VALUE_INPUT, '{{option.input}} の {{option.value}}'),
    fn('position', '再生位置', 'SetPosition', [INPUT, num('value', '位置（ミリ秒）', 0, 0, 86400000)], Q_VALUE_INPUT, '{{option.input}} {{option.value}}ms'),
    fn('rate', '再生の速さ', 'SetRate', [INPUT, num('value', '速さ（1 が等速）', 1, 0, 10)], Q_VALUE_INPUT, '{{option.input}} ×{{option.value}}'),
    fn('mark', 'イン点・アウト点', 'Mark{{option.how}}', [INPUT, sel('how', '操作', [('In', 'イン点'), ('Out', 'アウト点'), ('Reset', '消す'), ('ResetIn', 'イン点を消す'),
                                                                                    ('ResetOut', 'アウト点を消す')])], Q_INPUT, '{{option.input}} {{option.how}}'),
    fn('auto_play', '自動再生', 'AutoPlay{{option.how}}', [INPUT, sel('how', '操作', [('On', 'ON'), ('Off', 'OFF')])], Q_INPUT, '自動再生 {{option.input}} {{option.how}}'),
    fn('list_shuffle', 'リストをシャッフル', 'ListShuffle', [INPUT], Q_INPUT, 'シャッフル {{option.input}}'),
    fn('list_add', 'リストにファイルを足す', 'ListAdd', [INPUT, text('value', 'ファイルのパス', '', 'C:\\video\\demo.mp4')], Q_VALUE_INPUT, '{{option.input}} に足す'),
    fn('list_remove_all', 'リストを空にする', 'ListRemoveAll', [INPUT], Q_INPUT, '{{option.input}} を空に'),
    # ---- 入力の見た目
    fn('zoom', 'ズーム', 'SetZoom', [INPUT, num('value', 'ズーム（1 が等倍）', 1, 0, 5)], Q_VALUE_INPUT, '{{option.input}} ズーム {{option.value}}'),
    fn('pan', 'パン（位置）', 'SetPan{{option.axis}}', [INPUT, sel('axis', '向き', [('X', '横'), ('Y', '縦')]), num('value', '位置（-2〜2）', 0, -2, 2)], Q_VALUE_INPUT,
       '{{option.input}} パン{{option.axis}} {{option.value}}'),
    fn('alpha', '透明度', 'SetAlpha', [INPUT, num('value', '不透明度（0〜255）', 255, 0, 255)], Q_VALUE_INPUT, '{{option.input}} α {{option.value}}'),
    fn('crop', 'クロップ', 'SetCrop', [INPUT, text('value', 'X1,Y1,X2,Y2（0〜1）', '0,0,1,1')], Q_VALUE_INPUT, '{{option.input}} クロップ {{option.value}}'),
    fn('effect', 'エフェクト 1〜4', 'Effect{{option.n}}{{option.how}}', [INPUT, sel('n', 'エフェクト', [(str(i), f'エフェクト {i}') for i in range(1, 5)]),
                                                                       sel('how', '操作', [('', '切り替え'), ('On', 'ON'), ('Off', 'OFF')])],
       Q_INPUT, '{{option.input}} エフェクト {{option.n}} {{option.how}}'),
    fn('colour_auto', '色補正を自動に', 'ColourCorrectionAuto', [INPUT], Q_INPUT, '色補正 自動 {{option.input}}'),
    fn('colour_reset', '色補正を戻す', 'ColourCorrectionReset', [INPUT], Q_INPUT, '色補正 戻す {{option.input}}'),
    fn('input_name', '入力の名前', 'SetInputName', [INPUT, text('value', '名前', '', 'DEMO-CAM')], Q_VALUE_INPUT, '{{option.input}} → {{option.value}}'),
    fn('reset_input', '入力をつなぎ直す', 'ResetInput', [INPUT], Q_INPUT, 'リセット {{option.input}}'),
    # ---- タイトル
    fn('set_text', 'タイトルの文字', 'SetText', [INPUT, text('name', '欄の名前', 'Headline.Text', 'Headline.Text'), text('value', '文字')],
       'Input={{option.input|url}}&SelectedName={{option.name|url}}&Value={{option.value|url}}', '{{option.input}} {{option.name}}'),
    fn('set_text_colour', 'タイトルの文字の色', 'SetTextColour', [INPUT, text('name', '欄の名前', 'Headline.Text'), text('value', '色（#RRGGBB）', '#FFFFFF')],
       'Input={{option.input|url}}&SelectedName={{option.name|url}}&Value={{option.value|url}}', '{{option.input}} {{option.name}} 色'),
    fn('set_text_visible', 'タイトルの文字の表示', 'SetTextVisible{{option.how}}', [INPUT, text('name', '欄の名前', 'Headline.Text'),
                                                                               sel('how', '操作', [('', '切り替え'), ('On', '表示'), ('Off', '隠す')])],
       'Input={{option.input|url}}&SelectedName={{option.name|url}}', '{{option.input}} {{option.name}} {{option.how}}'),
    fn('set_image', 'タイトルの画像', 'SetImage', [INPUT, text('name', '欄の名前', 'Image1.Source'), text('value', '画像のパス・URL')],
       'Input={{option.input|url}}&SelectedName={{option.name|url}}&Value={{option.value|url}}', '{{option.input}} {{option.name}} 画像'),
    fn('set_image_visible', 'タイトルの画像の表示', 'SetImageVisible{{option.how}}', [INPUT, text('name', '欄の名前', 'Image1.Source'),
                                                                                 sel('how', '操作', [('', '切り替え'), ('On', '表示'), ('Off', '隠す')])],
       'Input={{option.input|url}}&SelectedName={{option.name|url}}', '{{option.input}} {{option.name}} {{option.how}}'),
    fn('title_preset', 'タイトルのプリセット', '{{option.how}}TitlePreset', [INPUT, sel('how', '操作', [('Next', '次へ'), ('Previous', '前へ')])], Q_INPUT,
       '{{option.input}} {{option.how}}'),
    fn('select_title_preset', 'タイトルのプリセットを選ぶ', 'SelectTitlePreset', [INPUT, num('value', '番号（0 から）', 0, 0, 999)], Q_VALUE_INPUT,
       '{{option.input}} プリセット {{option.value}}'),
    fn('title_animation', 'タイトルのアニメーション', 'TitleBeginAnimation', [INPUT, sel('value', 'アニメーション', [
        ('TransitionIn', 'イン'), ('TransitionOut', 'アウト'), ('Page1', 'ページ 1'), ('Page2', 'ページ 2'), ('Continuous', '連続'),
        ('DataChangeIn', 'データ変化 イン'), ('DataChangeOut', 'データ変化 アウト')])], Q_VALUE_INPUT, '{{option.input}} {{option.value}}'),
    fn('countdown', 'カウントダウン', '{{option.how}}Countdown', [INPUT, sel('how', '操作', [('Start', '始める'), ('Stop', '止める'), ('Pause', '一時停止'),
                                                                                      ('Suspend', '中断')])],
       Q_INPUT, '{{option.input}} カウントダウン {{option.how}}'),
    fn('set_countdown', 'カウントダウンの時間', 'SetCountdown', [INPUT, text('value', '時間（hh:mm:ss）', '00:05:00')], Q_VALUE_INPUT, '{{option.input}} {{option.value}}'),
    fn('adjust_countdown', 'カウントダウンを足し引き', 'AdjustCountdown', [INPUT, num('value', '秒（マイナスで減らす）', 60, -86400, 86400)], Q_VALUE_INPUT,
       '{{option.input}} {{option.value}} 秒'),
    # ---- プレイリスト・スクリプト・その他
    fn('playlist', 'プレイリスト', '{{option.how}}', [sel('how', '操作', [('StartPlayList', '始める'), ('StopPlayList', '止める'), ('NextPlayListEntry', '次へ'),
                                                                     ('PreviousPlayListEntry', '前へ')])], '', 'プレイリスト {{option.how}}'),
    fn('select_playlist', 'プレイリストを選ぶ', 'SelectPlayList', [text('value', 'プレイリストの名前', '', 'DEMO-LIST')], Q_VALUE, 'プレイリスト {{option.value}}'),
    fn('script_start', 'スクリプトを始める', 'ScriptStart', [text('value', 'スクリプトの名前', '', 'DEMO-SCRIPT')], Q_VALUE, 'スクリプト {{option.value}}'),
    fn('script_stop', 'スクリプトを止める', 'ScriptStop', [text('value', 'スクリプトの名前', '', 'DEMO-SCRIPT')], Q_VALUE, 'スクリプト停止 {{option.value}}'),
    fn('script_stop_all', 'スクリプトをすべて止める', 'ScriptStopAll'),
    fn('dynamic_input', '動的入力を決める', 'SetDynamicInput{{option.n}}', [sel('n', '番号', [(str(i), f'動的入力 {i}') for i in range(1, 5)]), text('value', '入力', '1')],
       Q_VALUE, '動的入力 {{option.n}} = {{option.value}}'),
    fn('dynamic_value', '動的な値を決める', 'SetDynamicValue{{option.n}}', [sel('n', '番号', [(str(i), f'動的な値 {i}') for i in range(1, 5)]), text('value', '値')],
       Q_VALUE, '動的な値 {{option.n}} = {{option.value}}'),
    fn('key_press', 'ショートカットのキーを押す', 'KeyPress', [text('value', 'キー', 'F1')], Q_VALUE, 'キー {{option.value}}'),
    fn('undo', '元に戻す（入力の削除）', 'Undo'),
    # ---- リプレイ
    fn('replay_mark', 'リプレイのイン・アウト', 'Replay{{option.how}}', [sel('how', '操作', [('MarkIn', 'イン'), ('MarkOut', 'アウト'), ('MarkCancel', '取り消し'),
                                                                                   ('MarkInLive', 'イン（ライブ）'), ('MarkInRecorded', 'イン（録画）')])],
       '', 'リプレイ {{option.how}}'),
    fn('replay_mark_in_out', 'リプレイの直近を記録', 'ReplayMarkInOut{{option.how}}', [sel('how', '起点', [('', '今の再生位置'), ('Live', 'ライブ'), ('Recorded', '録画')]),
                                                                                  num('value', '長さ（秒）', 10, 1, 600)], Q_VALUE, 'リプレイ 直近 {{option.value}} 秒'),
    fn('replay_play', 'リプレイの再生', 'Replay{{option.how}}', [sel('how', '操作', [('PlayLastEvent', '最後のイベント'), ('PlaySelectedEvent', '選んだイベント'),
                                                                               ('PlayLastEventToOutput', '最後のイベントを番組へ'),
                                                                               ('PlaySelectedEventToOutput', '選んだイベントを番組へ'), ('PlayAllEvents', 'すべて'),
                                                                               ('PlayPause', '再生 / 一時停止'), ('Pause', '一時停止'), ('Play', '再生'),
                                                                               ('StopEvents', 'イベントを止める'), ('JumpToNow', '今へ')]),
                                                         sel('channel', 'チャンネル', [('Current', '今のチャンネル'), ('A', 'A'), ('B', 'B')])],
       'Channel={{option.channel}}', 'リプレイ {{option.how}}'),
    fn('replay_live', 'リプレイをライブ / 録画', 'Replay{{option.how}}', [sel('how', '操作', [('LiveToggle', '切り替え'), ('Live', 'ライブ'), ('Recorded', '録画')])], '',
       'リプレイ {{option.how}}'),
    fn('replay_speed', 'リプレイの速さ', 'ReplaySetSpeed', [num('value', '速さ（0〜1）', 0.5, 0, 1), sel('channel', 'チャンネル', [('Current', '今のチャンネル'), ('A', 'A'), ('B', 'B')])],
       'Value={{option.value}}&Channel={{option.channel}}', 'リプレイ ×{{option.value}}'),
    fn('replay_camera', 'リプレイのカメラ', 'ReplayCamera{{option.n}}', [sel('n', 'カメラ', [(str(i), f'カメラ {i}') for i in range(1, 9)])], '', 'リプレイ カメラ {{option.n}}'),
    fn('replay_select_event', 'リプレイのイベントを選ぶ', 'ReplaySelect{{option.how}}Event', [sel('how', '操作', [('Next', '次'), ('Previous', '前'), ('First', '最初'), ('Last', '最後')]),
                                                                                      sel('channel', 'チャンネル', [('Current', '今のチャンネル'), ('A', 'A'), ('B', 'B')])],
       'Channel={{option.channel}}', 'リプレイ {{option.how}}'),
    fn('replay_recording', 'リプレイの録画', 'Replay{{option.how}}Recording', [sel('how', '操作', [('StartStop', '切り替え'), ('Start', '始める'), ('Stop', '止める')])], '',
       'リプレイ録画 {{option.how}}'),
    # ---- そのまま
    {'id': 'function', 'name': '関数を送る（そのまま）', 'options': [text('fn', '関数', 'Cut', 'Cut'), text('query', 'クエリ（Input=1&Value=… の形）', '', 'Input=1')],
     'send': {'kind': 'bytes', 'data': 'FUNCTION {{option.fn}} {{option.query}}', 'encoding': 'text', 'terminator': CRLF}, 'summary': '{{option.fn}} {{option.query}}'},
    {'id': 'command', 'name': '命令を送る（1 行）', 'options': [text('cmd', '命令', 'TALLY', 'TALLY')],
     'send': {'kind': 'bytes', 'data': '{{option.cmd}}', 'encoding': 'text', 'terminator': CRLF}, 'summary': '{{option.cmd}}'},
]

# ---------------------------------------------------------------- 受信
# TALLY OK 0121… は入力ごとの 1 文字（0 なし・1 番組・2 プレビュー）
receive = [
    {'match': '^TALLY OK ' + ('\\d' * (n - 1)) + '(\\d)', 'set': [{'variable': f'tally_{n}', 'value': '$1'}]} for n in range(1, TALLY_INPUTS + 1)
] + [
    {'match': '^TALLY OK (\\d+)', 'set': [{'variable': 'tally', 'value': '$1'}]},
    # 番組・プレビューの入力（ACTS の Input / InputPreview は値が 1 の時）
    {'match': '^ACTS OK Input (\\d+) 1$', 'set': [{'variable': 'program', 'value': '$1'}]},
    {'match': '^ACTS OK InputPreview (\\d+) 1$', 'set': [{'variable': 'preview', 'value': '$1'}]},
    # 入力番号つきの出来事：act_名前_入力 = 値（例 act_InputAudio_3 = 1、act_Overlay1_2 = 1）
    {'match': '^ACTS OK (\\w+) (\\d+) ([-\\d.]+)$', 'set': [{'variable': 'act_$1_$2', 'value': '$3'}]},
    # 入力番号なしの出来事：act_名前 = 値（例 act_Recording = 1）
    {'match': '^ACTS OK (\\w+) ([-\\d.]+)$', 'set': [{'variable': 'act_$1', 'value': '$2'}]},
    {'match': '^FUNCTION (OK|ER) ?(.*)$', 'set': [{'variable': 'last_reply', 'value': '$1 $2'}]},
    {'match': '^VERSION OK (.*)$', 'set': [{'variable': 'version', 'value': '$1'}]},
]

ON_OFF_ACT = [
    ('streaming', '配信中', 'act_Streaming'),
    ('recording', '録画中', 'act_Recording'),
    ('external', '外部出力中', 'act_External'),
    ('multicorder', 'マルチコーダー中', 'act_MultiCorder'),
    ('fullscreen', 'フルスクリーン中', 'act_Fullscreen'),
    ('ftb', 'FTB 中', 'act_FadeToBlack'),
    ('master_audio', 'マスターの音声が ON', 'act_MasterAudio'),
]
INPUT_ACT = [
    ('input_playing', '入力が再生中', 'InputPlaying'),
    ('input_audio', '入力の音声が ON', 'InputAudio'),
    ('input_solo', '入力のソロが ON', 'InputSolo'),
    ('input_master_audio', '入力のマスター送りが ON', 'InputMasterAudio'),
    ('input_bus_a', '入力のバス A 送りが ON', 'InputBusAAudio'),
    ('input_bus_b', '入力のバス B 送りが ON', 'InputBusBAudio'),
]
NUM_INPUT = num('input', '入力番号', 1, 1, 1000)

feedbacks = [
    {'id': 'program_is', 'name': '番組（タリー）', 'options': [NUM_INPUT], 'compare': {'variable': 'tally_{{option.input}}', 'op': 'eq', 'value': '1'},
     'summary': '番組が {{option.input}}'},
    {'id': 'preview_is', 'name': 'プレビュー（タリー）', 'options': [NUM_INPUT], 'compare': {'variable': 'tally_{{option.input}}', 'op': 'eq', 'value': '2'},
     'summary': 'プレビューが {{option.input}}'},
    {'id': 'overlay_on', 'name': 'オーバーレイに入力が出ている', 'options': [OVERLAY, NUM_INPUT],
     'compare': {'variable': 'act_Overlay{{option.overlay}}_{{option.input}}', 'op': 'eq', 'value': '1'}, 'summary': 'OVL {{option.overlay}} に {{option.input}}'},
] + [
    {'id': i, 'name': n, 'options': [], 'compare': {'variable': v, 'op': 'eq', 'value': '1'}, 'summary': n} for i, n, v in ON_OFF_ACT
] + [
    {'id': i, 'name': n, 'options': [NUM_INPUT], 'compare': {'variable': f'act_{v}_{{{{option.input}}}}', 'op': 'eq', 'value': '1'}, 'summary': f'{n}（{{{{option.input}}}}）'}
    for i, n, v in INPUT_ACT
] + [
    {'id': 'bus_audio_on', 'name': 'バスの音声が ON', 'options': [BUS_ONLY], 'compare': {'variable': 'act_Bus{{option.bus}}Audio', 'op': 'eq', 'value': '1'},
     'summary': 'バス {{option.bus}} が ON'},
]

variables = [
    {'id': 'program', 'name': '番組の入力（番号）'},
    {'id': 'preview', 'name': 'プレビューの入力（番号）'},
    {'id': 'tally', 'name': 'タリーの並び（0 なし・1 番組・2 プレビュー）'},
    {'id': 'last_reply', 'name': '最後の返事'},
] + [{'id': v, 'name': n.replace('中', '（1 / 0）').replace('が ON', '（1 / 0）')} for _i, n, v in ON_OFF_ACT] + [
    {'id': f'tally_{n}', 'name': f'入力 {n} のタリー'} for n in range(1, 21)
] + [{'id': f'act_InputVolume_{n}', 'name': f'入力 {n} の音量'} for n in range(1, 9)] + [
    {'id': 'act_MasterVolume', 'name': 'マスターの音量'},
]

presets = []
for n in range(1, 9):
    presets.append({'id': f'pvw{n}', 'category': 'プレビュー', 'name': f'プレビュー 入力 {n}', 'text': f'PVW\n{n}', 'backgroundColor': '#2A2A2E',
                    'action': {'definitionId': 'preview', 'options': {'input': str(n), 'mix': '0'}},
                    'feedbacks': [{'definitionId': 'preview_is', 'options': {'input': n}, 'backgroundColor': '#1F9E48'},
                                  {'definitionId': 'program_is', 'options': {'input': n}, 'backgroundColor': '#E0302B'}]})
for n in range(1, 9):
    presets.append({'id': f'pgm{n}', 'category': '番組', 'name': f'番組 入力 {n}', 'text': f'PGM\n{n}', 'backgroundColor': '#2A2A2E',
                    'action': {'definitionId': 'cut_direct', 'options': {'input': str(n)}},
                    'feedbacks': [{'definitionId': 'program_is', 'options': {'input': n}, 'backgroundColor': '#E0302B'}]})
presets += [
    {'id': 'cut', 'category': 'トランジション', 'name': 'CUT', 'text': 'CUT', 'backgroundColor': '#E9E9EC', 'action': {'definitionId': 'cut', 'options': {'mix': '0'}}},
    {'id': 'fade', 'category': 'トランジション', 'name': 'フェード', 'text': 'FADE', 'backgroundColor': '#F2C200',
     'action': {'definitionId': 'fade', 'options': {'duration': 1000, 'mix': '0'}}},
    {'id': 'ftb', 'category': 'トランジション', 'name': 'FTB', 'text': 'FTB', 'backgroundColor': '#050505', 'action': {'definitionId': 'ftb', 'options': {}},
     'feedbacks': [{'definitionId': 'ftb', 'options': {}, 'backgroundColor': '#6E1616'}]},
] + [
    {'id': f'trans{n}', 'category': 'トランジション', 'name': f'トランジション {n}', 'text': f'TRANS\n{n}', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'transition_n', 'options': {'n': str(n), 'mix': '0'}}} for n in range(1, 5)
] + [
    {'id': f'ovl{n}', 'category': 'オーバーレイ', 'name': f'オーバーレイ {n}', 'text': f'OVL {n}', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'overlay', 'options': {'overlay': str(n), 'how': '', 'input': '1'}},
     'feedbacks': [{'definitionId': 'overlay_on', 'options': {'overlay': str(n), 'input': 1}, 'backgroundColor': '#E0302B'}]} for n in range(1, 5)
] + [
    {'id': 'stream', 'category': '出力', 'name': '配信', 'text': 'STREAM', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'streaming', 'options': {'how': 'StartStop', 'stream': ''}},
     'feedbacks': [{'definitionId': 'streaming', 'options': {}, 'backgroundColor': '#E0302B'}]},
    {'id': 'record', 'category': '出力', 'name': '録画', 'text': 'REC', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'recording', 'options': {'how': 'StartStop'}},
     'feedbacks': [{'definitionId': 'recording', 'options': {}, 'backgroundColor': '#E0302B'}]},
    {'id': 'external', 'category': '出力', 'name': '外部出力', 'text': 'EXT', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'external', 'options': {'how': 'StartStop'}},
     'feedbacks': [{'definitionId': 'external', 'options': {}, 'backgroundColor': '#E0302B'}]},
] + [
    {'id': f'audio{n}', 'category': '音声', 'name': f'入力 {n} の音声', 'text': f'AUDIO\n{n}', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'audio', 'options': {'input': str(n), 'how': ''}},
     'feedbacks': [{'definitionId': 'input_audio', 'options': {'input': n}, 'backgroundColor': '#1F9E48'}]} for n in range(1, 9)
]

definition = {
    'format': 1,
    'id': 'vmix',
    'name': 'vMix',
    'category': '映像スイッチャー',
    'version': '1.0.0',
    'minAppVersion': '0.6.0',
    'transport': 'tcp',
    'receiveSplit': 'line',
    'configFields': [HOST, PORT],
    'onConnect': ['SUBSCRIBE TALLY\\r\\n', 'SUBSCRIBE ACTS\\r\\n', 'TALLY\\r\\n'],
    'actions': actions,
    'feedbacks': feedbacks,
    'variables': variables,
    'receive': receive,
    'presets': presets,
    'evidence': [
        {'title': 'vMix ヘルプ「TCP API」：ポート 8099、\\r\\n 区切り、FUNCTION・TALLY・ACTS・SUBSCRIBE の形', 'url': 'https://www.vmix.com/help28/TCPAPI.html',
         'status': '確認済'},
        {'title': 'vMix ヘルプ「Shortcut Function Reference」：関数の名前と引数', 'url': 'https://www.vmix.com/help28/ShortcutFunctionReference.html', 'status': '確認済'},
        {'title': 'vMix ヘルプ「Add/Edit Activator」：出来事の名前（Input・InputPreview・InputAudio・Recording など）', 'url': 'https://www.vmix.com/help28/ActivatorsEdit.html',
         'status': '確認済'},
        {'title': '入力番号の無い出来事（Recording など）の ACTS の行の形、MultiCorder・Overlay1〜4 の出来事名', 'status': '推測',
         'note': '資料に例が無い。機器の画面の「最近のログ」で受信の行を確かめる'},
        {'title': '実機での確認', 'status': '不明', 'note': 'この定義はまだ実機で通していない'},
    ],
}

OUT.write_text(json.dumps(definition, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('wrote', OUT.relative_to(OUT.parents[3]))
