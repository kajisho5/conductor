#!/usr/bin/env python3
"""Blackmagic ATEM（LAN）のドライバ定義（JSON）を作る（SPEC 7.1・8.3）。

コマンドの組み立てと解析はアプリ組み込みの通信手順 atem（src/drivers/atem.ts）が行い、
この定義は「どの動作・状態表示・変数・プリセットがあるか」だけを持つ。
根拠：公開 OSS「atem-connection」（MIT）。手で JSON を直さず、このスクリプトを直して再生成する。
使い方：python3 scripts/drivers/build_atem.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'src' / 'drivers' / 'defs' / 'atem.json'

INPUTS = 20
SOURCES = [{'id': '0', 'label': 'ブラック'}] + [{'id': str(n), 'label': f'入力 {n}'} for n in range(1, INPUTS + 1)] + [
    {'id': '1000', 'label': 'カラーバー'},
    {'id': '2001', 'label': 'カラー 1'},
    {'id': '2002', 'label': 'カラー 2'},
    {'id': '3010', 'label': 'メディアプレーヤー 1'},
    {'id': '3020', 'label': 'メディアプレーヤー 2'},
]
MES = [{'id': str(i), 'label': f'M/E {i + 1}'} for i in range(4)]
ME_FIELD = {'id': 'me', 'label': 'M/E', 'type': 'select', 'default': '0', 'choices': MES}
SRC_FIELD = {'id': 'input', 'label': '入力', 'type': 'select', 'default': '1', 'choices': SOURCES}

actions = [
    {'id': 'pgm', 'name': 'PGM を選ぶ', 'options': [SRC_FIELD, ME_FIELD], 'send': {'kind': 'builtin', 'name': 'atem.pgm'}, 'summary': 'PGM {{option.input}}'},
    {'id': 'pvw', 'name': 'PVW（プレビュー）を選ぶ', 'options': [SRC_FIELD, ME_FIELD], 'send': {'kind': 'builtin', 'name': 'atem.pvw'}, 'summary': 'PVW {{option.input}}'},
    {'id': 'cut', 'name': 'CUT', 'options': [ME_FIELD], 'send': {'kind': 'builtin', 'name': 'atem.cut'}, 'summary': 'CUT {{option.me}}'},
    {'id': 'auto', 'name': 'AUTO', 'options': [ME_FIELD], 'send': {'kind': 'builtin', 'name': 'atem.auto'}, 'summary': 'AUTO {{option.me}}'},
    {'id': 'ftb', 'name': 'FTB（フェード・トゥ・ブラック）', 'options': [ME_FIELD], 'send': {'kind': 'builtin', 'name': 'atem.ftb'}, 'summary': 'FTB {{option.me}}'},
    {'id': 'dsk', 'name': 'DSK を ON / OFF', 'options': [
        {'id': 'dsk', 'label': 'DSK', 'type': 'select', 'default': '1', 'choices': [{'id': '1', 'label': 'DSK 1'}, {'id': '2', 'label': 'DSK 2'}]},
        {'id': 'onAir', 'label': '状態', 'type': 'select', 'default': 'on', 'choices': [{'id': 'on', 'label': 'ON'}, {'id': 'off', 'label': 'OFF'}, {'id': 'toggle', 'label': '切り替え'}]},
    ], 'send': {'kind': 'builtin', 'name': 'atem.dsk'}, 'summary': '{{option.dsk}} {{option.onAir}}'},
    {'id': 'aux', 'name': 'AUX の出力を選ぶ', 'options': [
        {'id': 'aux', 'label': 'AUX 番号', 'type': 'number', 'default': 1, 'min': 1, 'max': 24},
        SRC_FIELD,
    ], 'send': {'kind': 'builtin', 'name': 'atem.aux'}, 'summary': 'AUX {{option.aux}} ← {{option.input}}'},
    {'id': 'macro', 'name': 'マクロを実行', 'options': [
        {'id': 'n', 'label': 'マクロ番号（1 から）', 'type': 'number', 'default': 1, 'min': 1, 'max': 100},
    ], 'send': {'kind': 'builtin', 'name': 'atem.macro'}, 'summary': 'マクロ {{option.n}}'},
]
ON_OFF_TOGGLE = {'id': 'on', 'label': '状態', 'type': 'select', 'default': 'toggle', 'choices': [
    {'id': 'on', 'label': 'ON'}, {'id': 'off', 'label': 'OFF'}, {'id': 'toggle', 'label': '切り替え'}]}
ON_OFF = {'id': 'on', 'label': '状態', 'type': 'select', 'default': 'on', 'choices': [{'id': 'on', 'label': 'ON'}, {'id': 'off', 'label': 'OFF'}]}
KEY_FIELD = {'id': 'key', 'label': 'キー', 'type': 'select', 'default': '1', 'choices': [{'id': str(k), 'label': f'キー {k}'} for k in range(1, 5)]}
DSK_FIELD = {'id': 'dsk', 'label': 'DSK', 'type': 'select', 'default': '1', 'choices': [{'id': '1', 'label': 'DSK 1'}, {'id': '2', 'label': 'DSK 2'}]}
RATE_FIELD = {'id': 'rate', 'label': '時間（フレーム）', 'type': 'number', 'default': 25, 'min': 1, 'max': 250}
MP_FIELD = {'id': 'mp', 'label': 'メディアプレーヤー', 'type': 'select', 'default': '1', 'choices': [{'id': str(k), 'label': f'プレーヤー {k}'} for k in range(1, 5)]}
STYLES = [{'id': '0', 'label': 'MIX'}, {'id': '1', 'label': 'DIP'}, {'id': '2', 'label': 'WIPE'}, {'id': '3', 'label': 'DVE'}, {'id': '4', 'label': 'STING'}]
AUDIO_INPUTS = [{'id': str(n), 'label': f'入力 {n}'} for n in range(1, INPUTS + 1)] + [
    {'id': '1001', 'label': 'XLR'}, {'id': '1101', 'label': 'AES/EBU'}, {'id': '1201', 'label': 'RCA'},
    {'id': '1301', 'label': 'マイク 1'}, {'id': '1302', 'label': 'マイク 2'},
    {'id': '2001', 'label': 'MADI 1'}, {'id': '2002', 'label': 'MADI 2'},
]
AUDIO_FIELD = {'id': 'input', 'label': '音声の入力', 'type': 'select', 'default': '1', 'choices': AUDIO_INPUTS}
MV_LAYOUTS = [
    {'id': '0', 'label': '標準'}, {'id': '1', 'label': '左上が小'}, {'id': '2', 'label': '右上が小'}, {'id': '3', 'label': 'PGM が下'},
    {'id': '4', 'label': '左下が小'}, {'id': '5', 'label': 'PGM が右'}, {'id': '8', 'label': '右下が小'}, {'id': '10', 'label': 'PGM が左'},
    {'id': '12', 'label': 'PGM が上'},
]


def builtin(id_, name, options, bname, summary):
    return {'id': id_, 'name': name, 'options': options, 'send': {'kind': 'builtin', 'name': bname}, 'summary': summary}


actions += [
    # トランジション
    builtin('tbar', 'T バーの位置', [{'id': 'position', 'label': '位置（%）', 'type': 'number', 'default': 50, 'min': 0, 'max': 100}, ME_FIELD], 'atem.tbar', 'T バー {{option.position}}%'),
    builtin('prev_trans', 'PREV TRANS（トランジションのプレビュー）', [ON_OFF_TOGGLE, ME_FIELD], 'atem.prevTrans', 'PREV TRANS {{option.on}}'),
    builtin('trans_style', 'トランジションの種類', [{'id': 'style', 'label': '種類', 'type': 'select', 'default': '0', 'choices': STYLES}, ME_FIELD], 'atem.transStyle', '種類 {{option.style}}'),
    builtin('trans_selection', '次のトランジション（BKGD・キー）', [
        {'id': 'bg', 'label': 'BKGD', 'type': 'boolean', 'default': True},
        {'id': 'key1', 'label': 'キー 1', 'type': 'boolean', 'default': False},
        {'id': 'key2', 'label': 'キー 2', 'type': 'boolean', 'default': False},
        {'id': 'key3', 'label': 'キー 3', 'type': 'boolean', 'default': False},
        {'id': 'key4', 'label': 'キー 4', 'type': 'boolean', 'default': False},
        ME_FIELD,
    ], 'atem.transSelection', '次のトランジション'),
    builtin('trans_rate', 'トランジションの時間', [
        {'id': 'style', 'label': '種類', 'type': 'select', 'default': 'mix', 'choices': [{'id': 'mix', 'label': 'MIX'}, {'id': 'dip', 'label': 'DIP'}, {'id': 'wipe', 'label': 'WIPE'}]},
        RATE_FIELD, ME_FIELD,
    ], 'atem.transRate', '{{option.style}} {{option.rate}} フレーム'),
    builtin('ftb_rate', 'FTB の時間', [RATE_FIELD, ME_FIELD], 'atem.ftbRate', 'FTB {{option.rate}} フレーム'),
    # 上流キー
    builtin('usk_on_air', 'キー（USK）を ON AIR', [KEY_FIELD, ON_OFF_TOGGLE, ME_FIELD], 'atem.uskOnAir', 'キー {{option.key}} {{option.on}}'),
    builtin('usk_fill', 'キー（USK）のフィル', [KEY_FIELD, SRC_FIELD, ME_FIELD], 'atem.uskFill', 'キー {{option.key}} フィル {{option.input}}'),
    builtin('usk_cut', 'キー（USK）のキー信号', [KEY_FIELD, SRC_FIELD, ME_FIELD], 'atem.uskCut', 'キー {{option.key}} キー信号 {{option.input}}'),
    builtin('usk_type', 'キー（USK）の種類', [KEY_FIELD, {'id': 'type', 'label': '種類', 'type': 'select', 'default': '0', 'choices': [
        {'id': '0', 'label': 'ルマ'}, {'id': '1', 'label': 'クロマ'}, {'id': '2', 'label': 'パターン'}, {'id': '3', 'label': 'DVE'}]}, ME_FIELD], 'atem.uskType', 'キー {{option.key}} 種類 {{option.type}}'),
    # DSK
    builtin('dsk_auto', 'DSK の AUTO', [DSK_FIELD], 'atem.dskAuto', 'DSK {{option.dsk}} AUTO'),
    builtin('dsk_tie', 'DSK の TIE', [DSK_FIELD, ON_OFF_TOGGLE], 'atem.dskTie', 'DSK {{option.dsk}} TIE {{option.on}}'),
    builtin('dsk_rate', 'DSK の時間', [DSK_FIELD, RATE_FIELD], 'atem.dskRate', 'DSK {{option.dsk}} {{option.rate}} フレーム'),
    builtin('dsk_fill', 'DSK のフィル', [DSK_FIELD, SRC_FIELD], 'atem.dskFill', 'DSK {{option.dsk}} フィル {{option.input}}'),
    builtin('dsk_cut', 'DSK のキー信号', [DSK_FIELD, SRC_FIELD], 'atem.dskCut', 'DSK {{option.dsk}} キー信号 {{option.input}}'),
    # マクロ
    builtin('macro_stop', 'マクロを止める', [], 'atem.macroStop', 'マクロ停止'),
    builtin('macro_continue', 'マクロを続ける（待ちの後）', [], 'atem.macroContinue', 'マクロ続行'),
    builtin('macro_loop', 'マクロのループ', [ON_OFF_TOGGLE], 'atem.macroLoop', 'マクロのループ {{option.on}}'),
    # メディア
    builtin('mp_source', 'メディアプレーヤーの素材', [MP_FIELD,
        {'id': 'kind', 'label': '素材', 'type': 'select', 'default': 'still', 'choices': [{'id': 'still', 'label': 'スチル'}, {'id': 'clip', 'label': 'クリップ'}]},
        {'id': 'n', 'label': '番号（1 から）', 'type': 'number', 'default': 1, 'min': 1, 'max': 64},
    ], 'atem.mpSource', 'プレーヤー {{option.mp}} {{option.kind}} {{option.n}}'),
    builtin('mp_play', 'クリップの再生', [MP_FIELD, ON_OFF_TOGGLE], 'atem.mpPlay', 'プレーヤー {{option.mp}} 再生 {{option.on}}'),
    builtin('mp_loop', 'クリップのループ', [MP_FIELD, ON_OFF], 'atem.mpLoop', 'プレーヤー {{option.mp}} ループ {{option.on}}'),
    builtin('mp_begin', 'クリップの最初へ', [MP_FIELD], 'atem.mpBegin', 'プレーヤー {{option.mp}} 最初へ'),
    builtin('capture_still', 'スチルを取り込む（PGM）', [], 'atem.captureStill', 'スチル取り込み'),
    builtin('clear_still', 'スチルを消す', [{'id': 'n', 'label': '番号（1 から）', 'type': 'number', 'default': 1, 'min': 1, 'max': 64}], 'atem.clearStill', 'スチル {{option.n}} を消す'),
    # SuperSource
    builtin('ssrc_box', 'SuperSource の箱', [
        {'id': 'box', 'label': '箱', 'type': 'select', 'default': '1', 'choices': [{'id': str(k), 'label': f'箱 {k}'} for k in range(1, 5)]},
        SRC_FIELD, ON_OFF_TOGGLE,
        {'id': 'ssrc', 'label': 'SuperSource', 'type': 'select', 'default': '1', 'choices': [{'id': '1', 'label': 'SuperSource 1'}, {'id': '2', 'label': 'SuperSource 2'}]},
    ], 'atem.ssrcBox', '箱 {{option.box}} ← {{option.input}}'),
    # マルチビュー
    builtin('mv_source', 'マルチビューの窓', [
        {'id': 'mv', 'label': 'マルチビュー', 'type': 'number', 'default': 1, 'min': 1, 'max': 4},
        {'id': 'window', 'label': '窓（1 から）', 'type': 'number', 'default': 3, 'min': 1, 'max': 16},
        SRC_FIELD,
    ], 'atem.mvSource', 'MV {{option.mv}} 窓 {{option.window}} ← {{option.input}}'),
    builtin('mv_layout', 'マルチビューの配置', [
        {'id': 'mv', 'label': 'マルチビュー', 'type': 'number', 'default': 1, 'min': 1, 'max': 4},
        {'id': 'layout', 'label': '配置', 'type': 'select', 'default': '0', 'choices': MV_LAYOUTS},
    ], 'atem.mvLayout', 'MV {{option.mv}} 配置 {{option.layout}}'),
    # 収録・配信
    builtin('record', '収録', [ON_OFF_TOGGLE], 'atem.record', '収録 {{option.on}}'),
    builtin('stream', '配信', [ON_OFF_TOGGLE], 'atem.stream', '配信 {{option.on}}'),
    # 音声
    builtin('audio_mix', '音声の ON / OFF / AFV', [AUDIO_FIELD, {'id': 'mode', 'label': '状態', 'type': 'select', 'default': 'on', 'choices': [
        {'id': 'on', 'label': 'ON'}, {'id': 'off', 'label': 'OFF'}, {'id': 'afv', 'label': 'AFV'}]}], 'atem.audioMix', '音声 {{option.input}} {{option.mode}}'),
    builtin('audio_gain', '音声のフェーダー', [AUDIO_FIELD, {'id': 'db', 'label': 'dB', 'type': 'number', 'default': 0, 'min': -100, 'max': 10}], 'atem.audioGain', '音声 {{option.input}} {{option.db}} dB'),
    builtin('master_gain', 'マスターのフェーダー', [{'id': 'db', 'label': 'dB', 'type': 'number', 'default': 0, 'min': -100, 'max': 10}], 'atem.masterGain', 'マスター {{option.db}} dB'),
    # 入力・本体
    builtin('input_name', '入力の名前を変える', [
        SRC_FIELD,
        {'id': 'long', 'label': '名前（20 バイトまで）', 'type': 'text', 'default': ''},
        {'id': 'short', 'label': '短い名前（4 文字まで）', 'type': 'text', 'default': ''},
    ], 'atem.inputName', '{{option.input}} → {{option.long}} / {{option.short}}'),
    builtin('save_startup', '今の状態を起動時の状態に保存', [], 'atem.saveStartup', '起動時の状態を保存'),
    builtin('clear_startup', '起動時の状態を消す', [], 'atem.clearStartup', '起動時の状態を消す'),
]


feedbacks = [
    {'id': 'pgm_is', 'name': 'PGM が入力（M/E 1）', 'options': [SRC_FIELD], 'compare': {'variable': 'pgm', 'op': 'eq', 'value': '{{option.input}}'}, 'summary': 'PGM が {{option.input}}'},
    {'id': 'pvw_is', 'name': 'PVW が入力（M/E 1）', 'options': [SRC_FIELD], 'compare': {'variable': 'pvw', 'op': 'eq', 'value': '{{option.input}}'}, 'summary': 'PVW が {{option.input}}'},
    {'id': 'tally', 'name': 'タリー', 'options': [
        SRC_FIELD,
        {'id': 'state', 'label': '状態', 'type': 'select', 'default': 'PGM', 'choices': [{'id': 'PGM', 'label': 'PGM'}, {'id': 'PST', 'label': 'PVW'}]},
    ], 'compare': {'variable': 'tally_{{option.input}}', 'op': 'contains', 'value': '{{option.state}}'}, 'summary': '{{option.input}} が {{option.state}}'},
    {'id': 'ftb_on', 'name': 'FTB 中（M/E 1）', 'options': [], 'compare': {'variable': 'ftb', 'op': 'eq', 'value': 'ON'}, 'summary': 'FTB 中'},
    {'id': 'dsk_on', 'name': 'DSK が ON', 'options': [
        {'id': 'dsk', 'label': 'DSK', 'type': 'select', 'default': '1', 'choices': [{'id': '1', 'label': 'DSK 1'}, {'id': '2', 'label': 'DSK 2'}]},
    ], 'compare': {'variable': 'dsk_{{option.dsk}}', 'op': 'eq', 'value': 'ON'}, 'summary': 'DSK {{option.dsk}} が ON'},
]
feedbacks += [
    {'id': 'usk_on', 'name': 'キー（USK）が ON AIR（M/E 1）', 'options': [KEY_FIELD], 'compare': {'variable': 'usk_{{option.key}}', 'op': 'eq', 'value': 'ON'}, 'summary': 'キー {{option.key}} が ON AIR'},
    {'id': 'prev_trans_on', 'name': 'PREV TRANS 中（M/E 1）', 'options': [], 'compare': {'variable': 'prev_trans', 'op': 'eq', 'value': 'ON'}, 'summary': 'PREV TRANS 中'},
    {'id': 'in_transition', 'name': 'トランジション中（M/E 1）', 'options': [], 'compare': {'variable': 'in_transition', 'op': 'eq', 'value': 'ON'}, 'summary': 'トランジション中'},
    {'id': 'trans_style_is', 'name': '次のトランジションの種類（M/E 1）', 'options': [{'id': 'style', 'label': '種類', 'type': 'select', 'default': 'MIX', 'choices': [
        {'id': x['label'], 'label': x['label']} for x in STYLES]}], 'compare': {'variable': 'trans_next_style', 'op': 'eq', 'value': '{{option.style}}'}, 'summary': '種類が {{option.style}}'},
    {'id': 'dsk_tie_on', 'name': 'DSK の TIE が ON', 'options': [DSK_FIELD], 'compare': {'variable': 'dsk_{{option.dsk}}_tie', 'op': 'eq', 'value': 'ON'}, 'summary': 'DSK {{option.dsk}} TIE'},
    {'id': 'aux_is', 'name': 'AUX の出力が入力', 'options': [{'id': 'aux', 'label': 'AUX 番号', 'type': 'number', 'default': 1, 'min': 1, 'max': 24}, SRC_FIELD],
     'compare': {'variable': 'aux_{{option.aux}}', 'op': 'eq', 'value': '{{option.input}}'}, 'summary': 'AUX {{option.aux}} が {{option.input}}'},
    {'id': 'macro_running', 'name': 'マクロ実行中', 'options': [], 'compare': {'variable': 'macro_running', 'op': 'eq', 'value': 'ON'}, 'summary': 'マクロ実行中'},
    {'id': 'macro_is', 'name': 'このマクロを実行中', 'options': [{'id': 'n', 'label': 'マクロ番号（1 から）', 'type': 'number', 'default': 1, 'min': 1, 'max': 100}],
     'compare': {'variable': 'macro_running_index', 'op': 'eq', 'value': '{{option.n}}'}, 'summary': 'マクロ {{option.n}} 実行中'},
    {'id': 'mp_playing', 'name': 'クリップ再生中', 'options': [MP_FIELD], 'compare': {'variable': 'mp_{{option.mp}}_playing', 'op': 'eq', 'value': 'ON'}, 'summary': 'プレーヤー {{option.mp}} 再生中'},
    {'id': 'recording', 'name': '収録中', 'options': [], 'compare': {'variable': 'recording', 'op': 'eq', 'value': 'ON'}, 'summary': '収録中'},
    {'id': 'streaming', 'name': '配信中', 'options': [], 'compare': {'variable': 'streaming', 'op': 'eq', 'value': 'ON'}, 'summary': '配信中'},
    {'id': 'audio_is', 'name': '音声の状態', 'options': [AUDIO_FIELD, {'id': 'mode', 'label': '状態', 'type': 'select', 'default': 'ON', 'choices': [
        {'id': 'ON', 'label': 'ON'}, {'id': 'OFF', 'label': 'OFF'}, {'id': 'AFV', 'label': 'AFV'}]}],
     'compare': {'variable': 'audio_{{option.input}}', 'op': 'eq', 'value': '{{option.mode}}'}, 'summary': '音声 {{option.input}} が {{option.mode}}'},
    {'id': 'ssrc_box_is', 'name': 'SuperSource の箱が入力', 'options': [
        {'id': 'box', 'label': '箱', 'type': 'select', 'default': '1', 'choices': [{'id': str(k), 'label': f'箱 {k}'} for k in range(1, 5)]}, SRC_FIELD],
     'compare': {'variable': 'ssrc_box_{{option.box}}_source', 'op': 'eq', 'value': '{{option.input}}'}, 'summary': '箱 {{option.box}} が {{option.input}}'},
]


variables = [
    {'id': 'model', 'name': '機種名'},
    {'id': 'pgm', 'name': 'PGM の入力（M/E 1、番号）'},
    {'id': 'pvw', 'name': 'PVW の入力（M/E 1、番号）'},
    {'id': 'ftb', 'name': 'FTB（ON / OFF）'},
    {'id': 'protocol_version', 'name': '通信の版'},
    {'id': 'trans_style', 'name': '今のトランジションの種類（M/E 1）'},
    {'id': 'trans_next_style', 'name': '次のトランジションの種類（M/E 1）'},
    {'id': 'prev_trans', 'name': 'PREV TRANS（ON / OFF）'},
    {'id': 'in_transition', 'name': 'トランジション中（ON / OFF）'},
    {'id': 'tbar', 'name': 'T バーの位置（%）'},
    {'id': 'mix_rate', 'name': 'MIX の時間（フレーム）'},
    {'id': 'ftb_rate', 'name': 'FTB の時間（フレーム）'},
    {'id': 'macro_running', 'name': 'マクロ実行中（ON / OFF）'},
    {'id': 'macro_running_index', 'name': '実行中のマクロ番号'},
    {'id': 'macro_loop', 'name': 'マクロのループ（ON / OFF）'},
    {'id': 'recording', 'name': '収録（ON / OFF）'},
    {'id': 'streaming', 'name': '配信（ON / 接続中 / 停止中 / OFF）'},
] + [{'id': f'usk_{k}', 'name': f'キー {k}（M/E 1、ON / OFF）'} for k in range(1, 5)] + [
    {'id': f'dsk_{k}{x}', 'name': f'DSK {k}{n}'} for k in (1, 2) for x, n in (('', '（ON / OFF）'), ('_tie', ' の TIE'), ('_rate', ' の時間'))
] + [{'id': f'aux_{k}', 'name': f'AUX {k} の入力'} for k in range(1, 7)] + [
    {'id': f'mp_{k}{x}', 'name': f'プレーヤー {k}{n}'} for k in (1, 2) for x, n in (('_source', ' の素材'), ('_playing', ' の再生'))
] + [{'id': f'input_{n}_name', 'name': f'入力 {n} の名前'} for n in range(1, INPUTS + 1)] + [
    {'id': f'tally_{n}', 'name': f'入力 {n} のタリー'} for n in range(1, INPUTS + 1)
]

presets = []
for n in range(1, 9):
    presets.append({'id': f'pgm{n}', 'category': 'PGM', 'name': f'PGM 入力 {n}', 'text': f'PGM\n$(this:name)', 'backgroundColor': '#2A2A2E',
                    'action': {'definitionId': 'pgm', 'options': {'input': str(n), 'me': '0'}},
                    'feedbacks': [{'definitionId': 'pgm_is', 'options': {'input': str(n)}, 'backgroundColor': '#E0302B'}]})
for n in range(1, 9):
    presets.append({'id': f'pvw{n}', 'category': 'PVW', 'name': f'PVW 入力 {n}', 'text': f'PVW\n$(this:name)', 'backgroundColor': '#2A2A2E',
                    'action': {'definitionId': 'pvw', 'options': {'input': str(n), 'me': '0'}},
                    'feedbacks': [{'definitionId': 'pvw_is', 'options': {'input': str(n)}, 'backgroundColor': '#1F9E48'}]})
presets += [
    {'id': 'cut', 'category': 'トランジション', 'name': 'CUT', 'text': 'CUT', 'backgroundColor': '#E9E9EC', 'action': {'definitionId': 'cut', 'options': {'me': '0'}}},
    {'id': 'auto', 'category': 'トランジション', 'name': 'AUTO', 'text': 'AUTO', 'backgroundColor': '#F2C200', 'action': {'definitionId': 'auto', 'options': {'me': '0'}}},
    {'id': 'ftb', 'category': 'トランジション', 'name': 'FTB', 'text': 'FTB', 'backgroundColor': '#050505', 'action': {'definitionId': 'ftb', 'options': {'me': '0'}},
     'feedbacks': [{'definitionId': 'ftb_on', 'options': {}, 'backgroundColor': '#6E1616'}]},
]
presets += [
    {'id': f'usk{k}', 'category': 'キー', 'name': f'キー {k} ON AIR', 'text': f'KEY {k}\nON AIR', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'usk_on_air', 'options': {'key': str(k), 'on': 'toggle', 'me': '0'}},
     'feedbacks': [{'definitionId': 'usk_on', 'options': {'key': str(k)}, 'backgroundColor': '#E0302B'}]} for k in range(1, 5)
] + [
    {'id': f'dsk{k}', 'category': 'キー', 'name': f'DSK {k} ON AIR', 'text': f'DSK {k}\nON AIR', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'dsk', 'options': {'dsk': str(k), 'onAir': 'toggle'}},
     'feedbacks': [{'definitionId': 'dsk_on', 'options': {'dsk': str(k)}, 'backgroundColor': '#E0302B'}]} for k in (1, 2)
] + [
    {'id': f'dsk{k}auto', 'category': 'キー', 'name': f'DSK {k} AUTO', 'text': f'DSK {k}\nAUTO', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'dsk_auto', 'options': {'dsk': str(k)}},
     'feedbacks': [{'definitionId': 'dsk_on', 'options': {'dsk': str(k)}, 'backgroundColor': '#E0302B'}]} for k in (1, 2)
] + [
    {'id': f'style{x["id"]}', 'category': 'トランジション', 'name': f'種類 {x["label"]}', 'text': x['label'], 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'trans_style', 'options': {'style': x['id'], 'me': '0'}},
     'feedbacks': [{'definitionId': 'trans_style_is', 'options': {'style': x['label']}, 'backgroundColor': '#F2C200'}]} for x in STYLES
] + [
    {'id': 'prevtrans', 'category': 'トランジション', 'name': 'PREV TRANS', 'text': 'PREV\nTRANS', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'prev_trans', 'options': {'on': 'toggle', 'me': '0'}},
     'feedbacks': [{'definitionId': 'prev_trans_on', 'options': {}, 'backgroundColor': '#E0302B'}]},
    {'id': 'record', 'category': '収録・配信', 'name': '収録', 'text': 'REC', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'record', 'options': {'on': 'toggle'}},
     'feedbacks': [{'definitionId': 'recording', 'options': {}, 'backgroundColor': '#E0302B'}]},
    {'id': 'stream', 'category': '収録・配信', 'name': '配信', 'text': 'ON AIR', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'stream', 'options': {'on': 'toggle'}},
     'feedbacks': [{'definitionId': 'streaming', 'options': {}, 'backgroundColor': '#E0302B'}]},
] + [
    {'id': f'macro{n}', 'category': 'マクロ', 'name': f'マクロ {n}', 'text': f'MACRO\n{n}', 'backgroundColor': '#2A2A2E',
     'action': {'definitionId': 'macro', 'options': {'n': n}},
     'feedbacks': [{'definitionId': 'macro_is', 'options': {'n': n}, 'backgroundColor': '#F2C200'}]} for n in range(1, 9)
]
# 入力名をボタンの文字に出すため、プリセットの $(this:name) は buttonFromPreset がボタン変数として入れる
for p in presets:
    if '$(this:name)' in p['text']:
        n = p['action']['options']['input']
        p['localVariables'] = [{'name': 'name', 'kind': 'value', 'value': f'$(DEVICE:input_{n}_short)'}]

definition = {
    'format': 1,
    'id': 'atem',
    'name': 'Blackmagic ATEM',
    'category': '映像スイッチャー',
    'version': '1.1.0',
    'minAppVersion': '0.5.0',
    'transport': 'udp',
    'session': 'atem',
    'configFields': [
        {'id': 'host', 'label': 'IP アドレス', 'type': 'text', 'placeholder': '192.168.10.240', 'pattern': '^[A-Za-z0-9.:\\-]+$', 'mono': True},
        {'id': 'port', 'label': 'ポート', 'type': 'number', 'default': 9910, 'min': 1, 'max': 65535},
    ],
    'actions': actions,
    'feedbacks': feedbacks,
    'variables': variables,
    'presets': presets,
    'evidence': [
        {'title': 'atem-connection（MIT、npm 3.10.3）：接続の手順・ack・各コマンドの serialize / deserialize（CPgI / CPvI / DCut / DAut / FtbA / FtbC / CTPs / CTPr / CTTp / CTMx / CTDp / CTWp / CKOn / CKeF / CKeC / CKTp / CDsL / DDsA / CDsT / CDsR / CDsF / CDsC / CAuS / MAct / MRCP / MPSS / SCPS / Capt / CSTL / CSBP / CMvI / CMvP / CInL / RcTM / StrR / CAMI / CAMM / CFSP / CFMP / SRsv / SRcl、受信 PrgI / PrvI / TlSr / InPr / FtbS / FtbP / TrSS / TrPr / TrPs / TMxP / KeOn / KeBP / DskS / DskP / AuxS / MRPr / MPCE / RCPS / RTMS / StRS / MvIn / SSBP / AMIP / FASP / _ver / _pin / InCm）',
         'url': 'https://www.npmjs.com/package/atem-connection', 'status': '確認済', 'note': '公開 OSS の実装に合わせた。公式アプリの通信は見ていない'},
        {'title': '実機での確認', 'status': '不明', 'note': 'この定義はまだ実機で通していない。機器の画面の「最近のログ」（詳細）で送受信を確かめる'},
        {'title': 'DSK の AUTO（DDsA）と SuperSource の箱（CSBP）は本体の版（_ver）で中身の並びを変える', 'status': '確認済'},
        {'title': 'Fairlight 音声（CFSP）は、本体から届いた音源 ID（FASP）を入力ごとに覚えて使う。届いていない入力は従来の音声（CAMI）で送る', 'status': '推測', 'note': '機種による違いは実機で確かめる'},
    ],
}

OUT.write_text(json.dumps(definition, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('wrote', OUT.relative_to(OUT.parents[3]))
