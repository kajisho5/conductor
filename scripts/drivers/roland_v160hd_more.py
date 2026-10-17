"""V-160HD の動作を増やす（オーナー指示 2026-10-17「Companion よりできることが少ない」）。build_roland.py から読む。

材料は 2 つ：
1. kajisho5/conductor-drivers の builtin/m-roland-v160hd.json（公開 OSS のモジュール roland-v160hd（MIT）を Actions で動かして
   送った内容から作った定義。選択肢で値が決まる動作だけ使う。送る内容は検証済み＝モジュールと同じ）
2. Roland 公式の V-160HD Remote Control Guide（アドレスマップ）から手で書く動作：2 バイトの値（PinP の位置・大きさ等）、
   WIPE の向き。公式資料では値は 16 進、2 バイトの値は 14 ビット（負の数は 16384 + 値）を上位・下位 7 ビットに分けて
   アドレス順に送る。モジュールはここを 10 進で送っているので、資料に合わせて直す【確認済：資料。実機は未確認】
   カメラ（PTZ）の 02 41 xx は資料に無く、モジュールの送る内容から写す【推測】
"""
import json
import re
from pathlib import Path

# モジュールの動作 id → 日本語の名前（入れるものだけ。無い id は入れない）
NAMES = {
    'input_assign': '入力の割り当て',
    'output_assign': '出力の割り当て',
    'aux_linked_pgm_mode': 'AUX の PGM 連動のしかた',
    'aux_linked': 'AUX を PGM に連動',
    'aux_assign': 'AUX の割り当て',
    'aux_mute': 'AUX のミュート',
    'pnpkey_enable': 'PinP / KEY のオン・オフ',
    'pnpkey_fade': 'PinP / KEY のフェード',
    'pnpkey_busselect': 'PinP / KEY を出すバス',
    'pnpkey_setsource': 'PinP / KEY のソース',
    'pnpkey_settype': 'PinP / KEY の種類',
    'pnpkey_shape': 'PinP の形',
    'pnpkey_borderColor': 'PinP の枠の色',
    'pnpkey_borderWidth': 'PinP の枠の太さ',
    'pnpkey_chromaColor': 'クロマキーの色',
    'dsk_busselect': 'DSK を出すバス',
    'set_dsk_key_source': 'DSK のキーのソース',
    'set_dsk_fill_source': 'DSK のフィルのソース',
    'set_dsk_type': 'DSK のキーの種類',
    'set_transition_time': 'トランジションの時間',
    'set_transition_type': 'トランジションの種類（MIX / WIPE）',
    'set_mix_type': 'MIX の種類',
    'set_wipe_type': 'WIPE の種類',
    'press_and_release_switch': 'パネルのボタンを押して離す',
    'press_switch': 'パネルのボタンを押す（離さない）',
    'release_switch': 'パネルのボタンを離す',
    'save_memory_trigger': 'シーンメモリーに保存',
    'initialize_memory_trigger': 'シーンメモリーを初期化',
    'freezeSwitchOn': 'フリーズ オン',
    'freezeSwitchOff': 'フリーズ オフ',
    'freezeSwitchType': 'フリーズの種類',
    'freezeSwitchSelectEnableDisable': '入力ごとのフリーズの対象',
}

LABELS = {
    'Aux': 'AUX', 'Bus': 'バス', 'Border Color': '枠の色', 'Border Width': '枠の太さ（0–14）', 'Color': '色', 'DSK': 'DSK',
    'Enable/Disable': 'オン・オフ', 'Input': '入力', 'Input Channel': '入力', 'Input Type': '入力の種類', 'Key Type': 'キーの種類',
    'Memory': 'メモリー', 'Mix Type': 'MIX の種類', 'Mode': 'しかた', 'Mute/Unmute': 'ミュート', 'On/Off': 'オン・オフ',
    'Output': '出力', 'PnP/Key': 'PinP / KEY', 'Shape': '形', 'Source': 'ソース', 'Switch': 'ボタン', 'Transition Time': '時間（秒）',
    'Transition Type': '対象', 'Type': '種類', 'Wipe Type': 'WIPE の種類',
}

PINP = [{'id': f'{0x1B + i:02X}', 'label': f'PinP & KEY {i + 1}'} for i in range(4)]
CAMERAS = [{'id': f'{0x41 + i:02X}', 'label': f'カメラ {i + 1}'} for i in range(16)]
TERM = '\\n'


def strip_term(data):
    """モジュールは 1 命令ごとに LF を 2 つ付ける。アプリは terminator で LF を 1 つ付けるので外す"""
    return re.sub(r'(\\n|\\r)+$', '', data)


def converted(drivers_dir):
    path = Path(drivers_dir) / 'builtin' / 'm-roland-v160hd.json'
    src = json.loads(path.read_text(encoding='utf-8'))
    out = []
    for a in src['actions']:
        if a['id'] not in NAMES:
            continue
        b = {
            'id': f"x_{a['id']}",
            'name': NAMES[a['id']],
            'options': [dict(o, label=LABELS.get(o['label'], o['label'])) for o in a['options']],
            'send': dict(a['send'], data=strip_term(a['send']['data']), terminator=TERM),
        }
        if a.get('more'):
            b['more'] = [dict(m, data=strip_term(m['data']), terminator=TERM) for m in a['more']]
        if a.get('maps'):
            b['maps'] = a['maps']
        out.append(b)
    missing = sorted(set(NAMES) - {a['id'] for a in src['actions']})
    return out, src['source'], missing


def two_byte(id_, name, offset, label, lo, hi, default, scale, step):
    """PinP & KEY の 2 バイトの値（値 × scale を 14 ビットにして上位・下位 7 ビット）"""
    return {
        'id': id_, 'name': name,
        'options': [
            {'id': 'pinp', 'label': 'PinP / KEY', 'type': 'select', 'default': '1B', 'choices': PINP},
            {'id': 'v', 'label': label, 'type': 'number', 'default': default, 'min': lo, 'max': hi,
             **({'help': '0.1 きざみで入れられます'} if step < 1 else {})},
        ],
        'send': {'kind': 'bytes', 'data': f'DTH:00{{{{option.pinp}}}}{offset},{{{{option.v|r14h:{scale}|hexu|pad2}}}}{{{{option.v|r14l:{scale}|hexu|pad2}}}};',
                 'encoding': 'text', 'terminator': TERM},
        'summary': f'{name} {{{{option.v}}}}',
    }


def manual():
    acts = [
        two_byte('x_pinp_position_h', 'PinP の位置（横）', '04', '位置（%）', -100, 100, 0, 10, 0.1),
        two_byte('x_pinp_position_v', 'PinP の位置（縦）', '06', '位置（%）', -100, 100, 0, 10, 0.1),
        two_byte('x_pinp_size', 'PinP の大きさ', '08', '大きさ（%）', 0, 100, 50, 10, 0.1),
        two_byte('x_pinp_cropping_h', 'PinP の切り取り（横）', '0A', '切り取り（%）', 0, 100, 0, 10, 0.1),
        two_byte('x_pinp_cropping_v', 'PinP の切り取り（縦）', '0C', '切り取り（%）', 0, 100, 0, 10, 0.1),
        two_byte('x_pinp_view_h', 'PinP の中の位置（横）', '11', '位置（%）', -50, 50, 0, 10, 0.1),
        two_byte('x_pinp_view_v', 'PinP の中の位置（縦）', '13', '位置（%）', -50, 50, 0, 10, 0.1),
        two_byte('x_pinp_view_zoom', 'PinP の中のズーム', '15', 'ズーム（%）', 100, 400, 100, 1, 1),
        two_byte('x_key_level', 'キーのレベル', '17', 'レベル（0–255）', 0, 255, 0, 1, 1),
        two_byte('x_key_gain', 'キーのゲイン', '19', 'ゲイン（0–255）', 0, 255, 0, 1, 1),
        two_byte('x_key_mix_level', 'キーのミックスレベル', '1B', 'レベル（0–255）', 0, 255, 255, 1, 1),
        two_byte('x_chroma_hue_fine', 'クロマキーの色相（細かく）', '1F', '色相（0–360）', 0, 360, 0, 1, 1),
        two_byte('x_chroma_sat_width', 'クロマキーの彩度の幅', '21', '幅（-128–127）', -128, 127, 0, 1, 1),
        two_byte('x_chroma_sat_fine', 'クロマキーの彩度（細かく）', '23', '彩度（0–255）', 0, 255, 0, 1, 1),
        two_byte('x_border_red', 'PinP の枠の色（赤）', '25', '赤（0–255）', 0, 255, 255, 1, 1),
        two_byte('x_border_green', 'PinP の枠の色（緑）', '27', '緑（0–255）', 0, 255, 255, 1, 1),
        two_byte('x_border_blue', 'PinP の枠の色（青）', '29', '青（0–255）', 0, 255, 255, 1, 1),
        two_byte('x_chroma_value_width', 'クロマキーの明るさの幅', '2B', '幅（-128–127）', -128, 127, 0, 1, 1),
        two_byte('x_chroma_value_fine', 'クロマキーの明るさ（細かく）', '2D', '明るさ（0–255）', 0, 255, 0, 1, 1),
        {
            'id': 'x_chroma_hue_width', 'name': 'クロマキーの色相の幅',
            'options': [
                {'id': 'pinp', 'label': 'PinP / KEY', 'type': 'select', 'default': '1B', 'choices': PINP},
                {'id': 'v', 'label': '幅（-30–30）', 'type': 'number', 'default': 0, 'min': -30, 'max': 30},
            ],
            # 1 バイトの符号付き（7 ビットの 2 の補数。資料：62H–00H–1EH）
            'send': {'kind': 'bytes', 'data': 'DTH:00{{option.pinp}}1E,{{option.v|s7|hexu|pad2}};', 'encoding': 'text', 'terminator': TERM},
            'summary': 'クロマキーの色相の幅 {{option.v}}',
        },
        {
            'id': 'x_chroma_despill', 'name': 'クロマキーのデスピル',
            'options': [
                {'id': 'pinp', 'label': 'PinP / KEY', 'type': 'select', 'default': '1B', 'choices': PINP},
                {'id': 'on', 'label': 'デスピル', 'type': 'select', 'default': '01', 'choices': [{'id': '00', 'label': 'OFF'}, {'id': '01', 'label': 'ON'}]},
            ],
            'send': {'kind': 'bytes', 'data': 'DTH:00{{option.pinp}}2F,{{option.on}};', 'encoding': 'text', 'terminator': TERM},
        },
        {
            'id': 'x_wipe_direction', 'name': 'WIPE の向き',
            'options': [{'id': 'dir', 'label': '向き', 'type': 'select', 'default': '00',
                         'choices': [{'id': '00', 'label': 'NORMAL'}, {'id': '01', 'label': 'REVERSE'}, {'id': '02', 'label': 'ROUND TRIP'}]}],
            'send': {'kind': 'bytes', 'data': 'DTH:001803,{{option.dir}};', 'encoding': 'text', 'terminator': TERM},
        },
    ]

    def cam(id_, name, sub, extra=None, value=None):
        opts = [{'id': 'cam', 'label': 'カメラ', 'type': 'select', 'default': '41', 'choices': CAMERAS}]
        if extra:
            opts.append(extra)
        data = f"DTH:02{{{{option.cam}}}}{sub},{value if value is not None else '{{option.v}}'};"
        return {'id': id_, 'name': name, 'options': opts, 'send': {'kind': 'bytes', 'data': data, 'encoding': 'text', 'terminator': TERM}}

    sel = lambda label, default, choices: {'id': 'v', 'label': label, 'type': 'select', 'default': default,
                                           'choices': [{'id': i, 'label': l} for i, l in choices]}
    acts += [
        cam('x_cam_preset', 'カメラのプリセットを呼び出す', '21',
            sel('プリセット', '00', [('7F', 'なし')] + [(f'{i:02X}', str(i + 1)) for i in range(10)])),
        cam('x_cam_pan_left', 'カメラ パン 左', '22', value='7F'),
        cam('x_cam_pan_right', 'カメラ パン 右', '22', value='01'),
        cam('x_cam_pan_stop', 'カメラ パン 止める', '22', value='00'),
        cam('x_cam_tilt_up', 'カメラ チルト 上', '23', value='01'),
        cam('x_cam_tilt_down', 'カメラ チルト 下', '23', value='7F'),
        cam('x_cam_tilt_stop', 'カメラ チルト 止める', '23', value='00'),
        {**cam('x_cam_pt_speed', 'カメラ パン・チルトの速さ', '24',
               {'id': 'v', 'label': '速さ（0–24）', 'type': 'number', 'default': 10, 'min': 0, 'max': 24},
               value='{{option.v|hexu|pad2}}')},
        cam('x_cam_zoom_in_fast', 'カメラ ズームイン（速く）', '25', value='02'),
        cam('x_cam_zoom_in_slow', 'カメラ ズームイン（ゆっくり）', '25', value='01'),
        cam('x_cam_zoom_out_fast', 'カメラ ズームアウト（速く）', '25', value='7E'),
        cam('x_cam_zoom_out_slow', 'カメラ ズームアウト（ゆっくり）', '25', value='7F'),
        cam('x_cam_zoom_stop', 'カメラ ズーム 止める', '25', value='00'),
        cam('x_cam_focus', 'カメラ フォーカス', '26', sel('フォーカス', '7F', [('7F', '近く'), ('00', '止める'), ('01', '遠く')])),
        cam('x_cam_af_on', 'カメラ オートフォーカス オン', '27', value='01'),
        cam('x_cam_af_off', 'カメラ オートフォーカス オフ', '27', value='00'),
        cam('x_cam_exposure', 'カメラ 露出', '28', sel('露出', '00', [('00', 'マニュアル'), ('01', 'オート')])),
        cam('x_cam_tally', 'カメラのタリーにする入力', '29',
            sel('入力', '00', [(f'{i:02X}', f'HDMI {i + 1}') for i in range(8)] + [(f'{i + 8:02X}', f'SDI {i + 1}') for i in range(8)])),
    ]
    return acts


def evidence(source):
    return [
        {'title': 'Roland V-160HD Remote Control Guide のアドレスマップ（PinP & KEY 00 1B–1E xx、WIPE の向き 00 18 03、2 バイトの値の形）',
         'url': 'https://static.roland.com/assets/media/pdf/V-160HD_Control_eng06_W.pdf', 'status': '確認済',
         'note': '2 バイトの値は 14 ビット（負の数は 16384 + 値）を上位・下位 7 ビットにしてアドレス順に送る。実機は未確認'},
        {'title': f"公開 OSS のモジュール {source['module']} {source['version']}（{source['license']}）から自動変換した動作（id が x_ で始まるもの）",
         'url': str(source.get('repository', '')).replace('git+', '').replace('.git', ''), 'status': '推測',
         'note': f"送る内容だけ。作者：{', '.join(source.get('maintainers') or [])}。カメラ（02 41 xx）は資料に無くモジュールから写した"},
    ]
