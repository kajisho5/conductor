#!/usr/bin/env python3
"""conductor UI デザイン SVG ジェネレーター。

使い方:
    python3 scripts/design/build_svgs.py            # docs/design/*.svg を生成
    python3 scripts/design/build_svgs.py --png DIR  # 確認用 PNG も DIR に書き出す（cairosvg が必要）

SVG は手で直接編集しない。ここ（と svgkit.py）を直して再生成する。
表示色は iOS ダークモードの semantic system color の値。実装では PlatformColor 名で参照する。
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import svgkit as k  # noqa: E402
from svgkit import (  # noqa: E402
    B, C, CIR, CANVAS_TEXT, CANVAS_TEXT2, FONT, G, L, PREVIEW_FONT, R, T,
    chip, circle_btn, device_pill, glist, icon, lum, segmented, status_dot, switch, tw,
)

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "design"))

IW, IH = 1366, 1024      # iPad Pro 12.9" 横（pt）
PW, PH = 393, 852        # iPhone 6.1"（pt）
SB = 280                 # サイドバー幅
GX1 = 946                # ボタン盤エリアの右端（= 設定欄の左端）
INS_W = IW - GX1         # 設定欄の幅 420


# ---------------------------------------------------------------------------
# 追加アイコン
# ---------------------------------------------------------------------------
def icon2(name, x, y, s=22, color=None, sw=1.9):
    color = color or C["label"]
    st = f'fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"'
    if name == "dollar":
        p = f'<path d="M12 2.5 V21.5 M16.5 6.5 C15.5 5 14 4.5 12 4.5 C9 4.5 7.5 6 7.5 8 C7.5 12.5 16.5 10.5 16.5 15.5 C16.5 17.8 14.6 19.5 12 19.5 C9.8 19.5 8.2 18.7 7.2 17" {st}/>'
    elif name == "showplay":
        p = f'<rect x="2.5" y="4.5" width="19" height="15" rx="3" {st}/><path d="M10 9 L15 12 L10 15 Z" fill="{color}"/>'
    elif name == "stop":
        p = f'<rect x="6" y="6" width="12" height="12" rx="2" fill="{color}"/>'
    elif name == "drag":
        p = "".join(f'<circle cx="{cx}" cy="{cy}" r="1.6" fill="{color}"/>' for cx in (9, 15) for cy in (6, 12, 18))
    elif name == "doc":
        p = f'<path d="M6 2.5 H14 L19 7.5 V21.5 H6 Z M14 2.5 V7.5 H19" {st}/><path d="M9 12 H16 M9 15.5 H16" {st}/>'
    elif name == "export":
        p = f'<path d="M12 3 V15 M7.5 7.5 L12 3 L16.5 7.5 M5 12 V20 H19 V12" {st}/>'
    elif name == "import":
        p = f'<path d="M12 3 V15 M7.5 10.5 L12 15 L16.5 10.5 M5 12 V20 H19 V12" {st}/>'
    elif name == "info":
        p = f'<circle cx="12" cy="12" r="9" {st}/><path d="M12 11 V17" {st}/><circle cx="12" cy="7.5" r="1.3" fill="{color}"/>'
    elif name == "hand":
        p = f'<path d="M8 13 V5.5 C8 4.7 8.7 4 9.5 4 C10.3 4 11 4.7 11 5.5 V11 M11 10 V3.5 C11 2.7 11.7 2 12.5 2 C13.3 2 14 2.7 14 3.5 V11 M14 10 V4.5 C14 3.7 14.7 3 15.5 3 C16.3 3 17 3.7 17 4.5 V12 M17 9 C17 8.2 17.7 7.5 18.5 7.5 C19.3 7.5 20 8.2 20 9 V14 C20 18.4 17 22 12.5 22 C9.5 22 7.8 20.5 6.5 18.5 L3.8 14 C3.3 13.2 3.6 12.2 4.4 11.8 C5.2 11.4 6.1 11.7 6.6 12.4 L8 14.5" {st}/>'
    else:
        return _base_icon(name, x, y, s, color, sw)
    return G(p, x, y, s / 24)


_base_icon = k.icon
k.icon = lambda name, x, y, s=22, color=None, sw=1.9: icon2(name, x, y, s, color, sw)  # svgkit 内部（glist 等）でも追加アイコンを使う


# ---------------------------------------------------------------------------
# ボタン（押下表現を含む）
# ---------------------------------------------------------------------------
def tile(x, y, w, h, main="", sub=None, bg=None, state=None, steps=None, r=12, fs=None, var=False, hold=None):
    """ボタン 1 つ。
    state: None / 'selected'（編集で選択）/ 'empty' / 'empty-run' / 'offline'
           'pressing'（押している）/ 'sent'（送れた）/ 'failed'（送れなかった）
    hold: 0..1 長押し判定の進み具合
    """
    if state in ("empty", "empty-run", "selected", "offline", None):
        out = k.button(x, y, w, h, main, sub, bg, state, steps, r, fs, var)
    elif state == "pressing":
        s = 0.94
        nw, nh = w * s, h * s
        nx, ny = x + (w - nw) / 2, y + (h - nh) / 2
        out = k.button(nx, ny, nw, nh, main, sub, bg, None, steps, r - 1, (fs or None) and fs * s, var)
        out += R(nx, ny, nw, nh, "rgba(255,255,255,0.18)", r=r - 1)
        out += R(nx + 1.5, ny + 1.5, nw - 3, nh - 3, "none", r=r - 2, stroke="#FFFFFF", sw=3)
    elif state == "sent":
        out = k.button(x, y, w, h, main, sub, bg, None, steps, r, fs, var)
        out += R(x - 6, y - 6, w + 12, h + 12, "none", r=r + 6, stroke="rgba(255,255,255,0.55)", sw=3)
        out += R(x - 12, y - 12, w + 24, h + 24, "none", r=r + 12, stroke="rgba(255,255,255,0.22)", sw=2)
    elif state == "failed":
        out = k.button(x, y, w, h, main, sub, bg, None, steps, r, fs, var)
        out += R(x + 1.5, y + 1.5, w - 3, h - 3, "none", r=r - 1, stroke=C["orange"], sw=3)
        s = max(16, min(w, h) * 0.16)
        out += icon("warn", x + w - s - 7, y + 7, s, C["orange"])
    else:
        raise ValueError(state)
    if hold is not None:
        # 枠を時計回りに埋める（上辺中央から）
        per = 2 * (w + h)
        L_ = per * hold
        out += (f'<rect x="{x + 1.5:.1f}" y="{y + 1.5:.1f}" width="{w - 3:.1f}" height="{h - 3:.1f}" rx="{r - 1}" '
                f'fill="none" stroke="#FFFFFF" stroke-width="3" stroke-dasharray="{L_:.1f} {per:.1f}" '
                f'stroke-dashoffset="{-(w / 2):.1f}"/>')
    return out


SRC = ["CAM 1", "CAM 2", "CAM 3", "CAM 4", "PC 1", "PC 2", "VTR", "STILL"]


def page_spec():
    """ページ 1「本番」8×4。"""
    g = [[None] * 8 for _ in range(4)]
    for c, s in enumerate(SRC):
        g[0][c] = dict(main=s, sub="PGM", bg=B["red"] if s == "CAM 2" else B["neutral"])
        g[1][c] = dict(main=s, sub="PST", bg=B["green"] if s == "CAM 3" else B["neutral"])
    g[2][0] = dict(main="CUT", bg=B["white"])
    g[2][1] = dict(main="AUTO", sub="MIX", bg=B["yellow"], steps=(2, 0))
    g[2][2] = dict(main="FTB", bg=B["black"])
    g[2][3] = dict(main="DSK 1", sub="ON", bg=B["blue"])
    g[2][6] = dict(main="OPENING", sub="マクロ", bg=B["purple"])
    g[2][7] = dict(main="→ VTR", sub="ページ", bg=B["dark"])
    g[3][0] = dict(main="MIC 1", sub="ON", bg=B["teal"])
    g[3][1] = dict(main="MIC 2", sub="OFF", bg=B["neutral"])
    g[3][2] = dict(main="BGM", sub="FADE", bg=B["orange"], steps=(3, 1))
    g[3][6] = dict(main="CAM 2", sub="現在の PGM", bg=B["dark"], var=True)
    g[3][7] = dict(main="00:12:34", sub="REC", bg=B["red"], state="offline", var=True)
    return g


def grid(x0, y0, cw, ch, gap, mode="edit", selected=None, overrides=None, fs=None, r=10, cols=8, col0=0):
    g = page_spec()
    overrides = overrides or {}
    out = ""
    for rr in range(4):
        for cc in range(cols):
            c = cc + col0
            x = x0 + cc * (cw + gap)
            y = y0 + rr * (ch + gap)
            spec = g[rr][c]
            if spec is None:
                out += tile(x, y, cw, ch, state="empty" if mode == "edit" else "empty-run", r=r)
                continue
            kw = dict(spec)
            if selected == (rr, c):
                kw["state"] = "selected"
            if (rr, c) in overrides:
                kw.update(overrides[(rr, c)])
            out += tile(x, y, cw, ch, r=r, fs=fs, **kw)
    return out


# ---------------------------------------------------------------------------
# 共通部品
# ---------------------------------------------------------------------------
def pill_btn(x, y, label, ic=None, color=None, h=32, fill=None, size=15):
    color = color or C["blue"]
    w = tw(label, size) + 28 + (22 if ic else 0)
    o = R(x, y, w, h, fill or C["fill3"], r=h / 2)
    tx = x + 14
    if ic:
        o += icon2(ic, tx, y + h / 2 - 8, 16, color, 2)
        tx += 22
    o += T(tx, y + h / 2 + size * 0.36, label, size, 600, color)
    return o, w


def prominent(x_right, y, label, ic=None, h=34):
    """ツールバー後縁の主要ボタン（.prominent）。右端 x を指定。"""
    w = tw(label, 16) + 32 + (22 if ic else 0)
    x = x_right - w
    o = R(x, y, w, h, C["blue"], r=h / 2)
    tx = x + 16
    if ic:
        o += icon2(ic, tx, y + h / 2 - 8, 16, "#FFFFFF", 2)
        tx += 22
    o += T(tx, y + h / 2 + 6, label, 16, 600, "#FFFFFF")
    return o, w


def field(x, y, w, text, h=40, placeholder=False, mono=False, fill=None):
    return R(x, y, w, h, fill or C["bg3"], r=10) + T(x + 14, y + h / 2 + 6, text, 17, 400, C["label3"] if placeholder else C["label"], mono=mono)


def sec_label(x, y, text):
    return T(x + 16, y, text, 13, 600, C["label2"])


def popup(x, y, w, text, h=32):
    """ポップアップボタン（値＋上下矢印）。"""
    o = R(x, y, w, h, C["fill3"], r=8)
    o += T(x + 12, y + h / 2 + 5.5, text, 15, 500, C["label"])
    o += icon("chev-d", x + w - 22, y + h / 2 - 6, 12, C["label2"], 2.4)
    return o


def page_bar(cx, y, sel=0, pages=("本番", "VTR", "音声"), h=36):
    items = [f"{i + 1}  {p}" for i, p in enumerate(pages)]
    widths = [tw(t, 15) + 32 for t in items]
    total = sum(widths) + 8 * (len(items) - 1) + 2 * (h + 8)
    x = cx - total / 2
    out = circle_btn(x + h / 2, y + h / 2, "chev-l", h / 2, isz=16)
    x += h + 8
    for i, (t, wd) in enumerate(zip(items, widths)):
        out += R(x, y, wd, h, C["blue"] if i == sel else C["fill3"], r=h / 2)
        out += T(x + wd / 2, y + h / 2 + 5.5, t, 15, 600 if i == sel else 500, C["label"], "middle")
        x += wd + 8
    out += circle_btn(x + h / 2, y + h / 2, "chev-r", h / 2, isz=16)
    return out


def sidebar(sel, h=IH):
    s = R(0, 0, SB, h, C["bg2"])
    s += icon("sidebar", 20, 34, 24, C["blue"])
    items = [
        ("buttons", "grid", "ボタン", None, None, None),
        ("show", "showplay", "本番", None, None, None),
        ("devices", "cable", "機器", "4/5", "warn", None),
        ("triggers", "bolt", "トリガー", None, None, None),
        ("variables", "dollar", "変数", None, None, None),
        ("images", "photo", "画像", None, None, None),
        ("settings", "gear", "設定", None, None, None),
    ]
    y = 76
    for key, ic, lab, right, dot, badge in items:
        on = key == sel
        if on:
            s += R(10, y, SB - 20, 44, C["blue"], r=10)
        s += icon2(ic, 22, y + 11, 22, C["label"] if on else C["blue"])
        s += T(58, y + 28, lab, 17, 600 if on else 400)
        rx = SB - 26
        if badge:
            s += R(rx - 22, y + 12, 22, 20, C["fill"], r=10) + T(rx - 11, y + 27, badge, 13, 600, anchor="middle")
            rx -= 30
        if right:
            s += T(rx, y + 28, right, 15, 400, C["label"] if on else C["label2"], "end")
            rx -= tw(right, 15) + 8
        if dot:
            s += status_dot(rx - 4, y + 22, dot, 4.5)
        y += 44
    return s


def ipad_frame_common(content):
    return content + k.ipad_status() + k.home_indicator(IW, IH, 320)


def ipad_doc(fn, title, note, notes=None):
    M = 60
    extra = 0 if not notes else 30 + 24 * len(notes)
    W = IW + M * 2
    H = IH + M * 2 + 60 + extra
    body = k.frame(fn(), IW, IH, 18, M, M + 60, title, note)
    if notes:
        for i, n in enumerate(notes):
            body += T(M, M + 60 + IH + 44 + i * 24, n, 15, 400, CANVAS_TEXT)
    return k.doc(W, H, body, title)


# ---------------------------------------------------------------------------
# iPad: ボタン画面（中央：盤、右：設定欄）
# ---------------------------------------------------------------------------
def buttons_center(selected=(0, 1)):
    s = sidebar("buttons")
    s += L(SB, 0, SB, IH, C["sep"], 0.7)
    s += T(SB + 20, 50, "ボタン", 17, 600) + T(SB + 20, 68, "DEMO-SHOW", 12, 400, C["label2"])
    cx = 590
    s += circle_btn(cx - 108, 50, "chev-l", 22, isz=16)
    s += R(cx - 82, 28, 164, 44, C["fill3"], r=22)
    s += T(cx - 6, 55, "1  本番", 15, 600, anchor="middle") + icon("chev-d", cx + 28, 44, 12, C["label2"], 2.6)
    s += circle_btn(cx + 108, 50, "chev-r", 22, isz=16)
    c, w = chip(GX1 - 20 - 96 - 10 - 64, 36, "4/5", "warn", h=28, size=13)
    s += c
    o, w = prominent(GX1 - 20, 33, "本番", "showplay")
    s += o
    s += grid(SB + 20, 116, 71, 71, 8, selected=selected, fs=13)
    y = 116 + 4 * 71 + 3 * 8 + 18
    x = SB + 20
    for lab, ic in [("コピー", "dup"), ("移動", "drag"), ("入れ替え", "redo"), ("削除", "trash")]:
        o, w = pill_btn(x, y, lab, ic, h=44)
        s += o
        x += w + 10
    return s


def inspector_head(tab=0, btn=None, title="PGM CAM 2", pos="ページ 1 · 1行目 2列目"):
    btn = btn or dict(main="CAM 2", sub="PGM", bg=B["red"])
    s = R(GX1, 0, INS_W, IH, C["bg2"]) + L(GX1, 0, GX1, IH, C["sep"], 0.7)
    ix = GX1 + 20
    iw = INS_W - 40
    s += segmented(ix, 34, iw, ["ボタン", "ページ", "プリセット"], tab)
    if tab != 0:
        return s, ix, iw, 88
    s += tile(ix, 88, 92, 92, r=12, fs=17, **btn)
    tx = ix + 108
    s += T(tx, 104, pos, 13, 400, C["label2"])
    s += T(tx, 128, title, 17, 600)
    o, w = pill_btn(tx, 138, "テスト", "play", h=44)
    s += o
    s += circle_btn(tx + w + 30, 160, "ellipsis", 22, color=C["blue"], isz=18)
    s += R(ix, 196, iw, 44, C["fill3"], r=10) + T(ix + 14, 224, "メモ", 15, 400, C["label3"])
    return s, ix, iw, 256


def ins_tabs(ix, iw, y, sel):
    return segmented(ix, y, iw, ["動作", "見た目", "状態表示", "変数", "オプション"], sel, 32, 12)


def steps_row(ix, y):
    c1, w1 = chip(ix, y, "ステップ 1", None, h=30, size=13, fill=C["blue"], bold=True)
    c2, w2 = chip(ix + w1 + 8, y, "ステップ 2", None, h=30, size=13, fill=C["bg4"])
    return c1 + c2 + circle_btn(ix + w1 + w2 + 31, y + 15, "plus", 15, color=C["blue"], isz=13)


def action_expanded(x, y, w, dev, name, fields):
    """展開した動作の行（Companion と同じく行の中で値を入れる）。"""
    h = 64 + 44 * len(fields)
    o = R(x, y, w, h, C["bg3"], r=12)
    pv, pw = device_pill(x + 16, y + 14, dev)
    o += pv + T(x + 24 + pw, y + 30, name, 16, 600)
    o += icon("chev-d", x + w - 66, y + 18, 12, C["label2"], 2.6)
    o += icon("handle", x + w - 36, y + 14, 20, C["label3"], 2)
    o += L(x + 16, y + 50, x + w, y + 50, C["sep"], 0.7)
    yy = y + 58
    for lab, val, kind in fields:
        o += T(x + 16, yy + 24, lab, 15, 400, C["label2"])
        if kind == "popup":
            o += popup(x + w - 16 - 170, yy + 6, 170, val)
        elif kind == "field":
            o += R(x + w - 16 - 120, yy + 6, 120, 32, C["fill3"], r=8) + T(x + w - 28, yy + 27, val, 15, 500, anchor="end", mono=True)
        elif kind == "switch":
            o += switch(x + w - 16 - 51, yy + 6, val)
        yy += 44
    return o, h


def ipad_buttons_action():
    s = buttons_center()
    ins, ix, iw, y = inspector_head(0)
    s += ins + ins_tabs(ix, iw, y, 0)
    y += 48
    s += steps_row(ix, y)
    y += 44
    s += sec_label(ix, y + 12, "押した時")
    s += T(ix + iw - 16, y + 12, "順番に実行", 13, 500, C["blue"], "end")
    y += 22
    o, h = action_expanded(ix, y, iw, "DEMO-SW-A", "PGM を切り替え", [("入力", "SDI 2", "popup"), ("この前に待つ", "0 ms", "field")])
    s += o
    y += h + 8
    g, y = glist(ix, y, iw, [{"rows": [
        {"pill": "DEMO-MIXER", "t": "OSC を送信", "s": "/demo/ch/2/on  1", "smono": True, "h": 60, "handle": True},
        {"t": "＋ 動作を追加", "tc": C["blue"]},
    ]}], sec_gap=18, card=C["bg3"])
    s += g
    s += sec_label(ix, y + 12, "離した時")
    g, y = glist(ix, y + 22, iw, [{"rows": [{"t": "＋ 動作を追加", "tc": C["blue"]}]}], sec_gap=14, card=C["bg3"])
    s += g
    o, w = pill_btn(ix, y, "長押しの動作を追加", "plus")
    s += o
    # 動作を追加のポップオーバー（「＋ 動作を追加」から）
    px, py, pw_, ph_ = GX1 - 320, 590, 340, 410
    tip = 731 - py
    s += R(px + 2, py + 6, pw_, ph_, "rgba(0,0,0,0.35)", r=14)
    s += R(px, py, pw_, ph_, C["bg3"], r=14, stroke="rgba(255,255,255,0.08)", sw=1)
    s += f'<path d="M{px + pw_} {py + tip - 12} L{px + pw_ + 12} {py + tip} L{px + pw_} {py + tip + 12} Z" fill="{C["bg3"]}"/>'
    s += R(px + 12, py + 12, pw_ - 24, 34, C["fill3"], r=9) + icon("search", px + 22, py + 20, 17, C["label2"]) + T(px + 46, py + 35, "動作を検索", 16, 400, C["label2"])
    rows = [("最近使った", None), ("DEMO-SW-A: PGM を切り替え", "dev"), ("DEMO-SW-A（Roland V-160HD）", None),
            ("PST を切り替え", "a"), ("CUT", "a"), ("AUTO", "a"), ("AUX を切り替え", "a"), ("DSK のオン／オフ", "a"),
            ("内部", None), ("ページを移動", "a"), ("他のボタンを押す", "a"), ("変数に値を入れる", "a")]
    yy = py + 60
    for t, kind in rows:
        if kind is None:
            s += T(px + 16, yy + 16, t, 12, 600, C["label2"])
            yy += 26
        else:
            s += T(px + 16, yy + 20, t, 16, 400)
            yy += 30
    return ipad_frame_common(s)


def color_row(ix, iw, y, title, cols, sel):
    o = sec_label(ix, y + 14, title)
    o += R(ix, y + 22, iw, 52, C["bg3"], r=10)
    for i, col in enumerate(cols):
        cx = ix + 26 + i * 44
        cy = y + 48
        o += CIR(cx, cy, 14, fill=col, stroke="rgba(255,255,255,0.18)", sw=1)
        if i == sel:
            o += CIR(cx, cy, 18.5, fill="none", stroke=C["label"], sw=2.5)
    o += CIR(ix + iw - 26, y + 48, 14, fill=C["fill3"]) + icon("plus", ix + iw - 34, y + 40, 16, C["blue"], 2.2)
    return o


def ipad_buttons_style():
    s = buttons_center()
    ins, ix, iw, y = inspector_head(0)
    s += ins + ins_tabs(ix, iw, y, 1)
    y += 48
    s += sec_label(ix, y + 14, "ボタン名")
    s += field(ix, y + 22, iw, "PGM CAM 2")
    y += 76
    s += sec_label(ix, y + 14, "表示する文字")
    s += R(ix, y + 22, iw, 66, C["bg3"], r=10) + T(ix + 14, y + 48, "PGM", 17, 400) + T(ix + 14, y + 74, "CAM 2", 17, 400)
    s += R(ix + iw - 98, y + 50, 86, 28, C["fill3"], r=14) + T(ix + iw - 55, y + 69, "$ 変数", 13, 600, C["blue"], "middle")
    y += 102
    g, y = glist(ix, y, iw, [{"rows": [
        {"t": "文字の大きさ", "seg": (["自動", "小", "中", "大"], 0, 176)},
        {"t": "横の揃え", "seg": (["左", "中", "右"], 1, 132)},
        {"t": "縦の揃え", "seg": (["上", "中", "下"], 1, 132)},
    ]}], sec_gap=16, card=C["bg3"])
    s += g
    s += color_row(ix, iw, y, "文字の色", ["#FFFFFF", "#000000", "#F2C200", "#E0302B", "#1F9E48", "#1F5FD6", "#8E8E93"], 0)
    y += 90
    s += color_row(ix, iw, y, "背景の色", [B["red"], B["green"], B["blue"], B["yellow"], B["orange"], B["purple"], B["neutral"]], 0)
    y += 90
    g, y = glist(ix, y, iw, [{"rows": [
        {"t": "画像", "r": "なし", "chev": True},
        {"t": "上部の帯（位置表示）", "r": "全体の設定", "chev": True},
    ]}], sec_gap=0, card=C["bg3"])
    s += g
    return ipad_frame_common(s)


def fb_card(x, y, w, dev, cond, eff, prev, offline=False):
    o = R(x, y, w, 96, C["bg3"], r=12)
    pv, pw = device_pill(x + 16, y + 14, dev)
    o += pv + T(x + 24 + pw, y + 29, cond, 15, 600)
    o += T(x + 16, y + 58, "→ " + eff, 15, 400, C["label2"])
    o += T(x + 16, y + 80, "右端をドラッグで優先順を変更", 11, 400, C["label3"])
    o += tile(x + w - 16 - 56, y + 20, 56, 56, r=9, fs=12, state="offline" if offline else None, **prev)
    return o


def ipad_buttons_feedback():
    s = buttons_center()
    ins, ix, iw, y = inspector_head(0)
    s += ins + ins_tabs(ix, iw, y, 2)
    y += 48
    s += T(ix + 16, y + 14, "機器の状態で見た目を変えます。上ほど優先。", 13, 400, C["label2"])
    y += 28
    s += fb_card(ix, y, iw, "DEMO-SW-A", "PGM 入力 が SDI 2", "背景を赤に", dict(main="CAM 2", sub="PGM", bg=B["red"]))
    y += 106
    s += fb_card(ix, y, iw, "DEMO-SW-A", "PST 入力 が SDI 2", "背景を緑に", dict(main="CAM 2", sub="PGM", bg=B["green"]))
    y += 106
    s += fb_card(ix, y, iw, "内部", "DEMO-SW-A が未接続", "暗くして ⚠ を表示", dict(main="CAM 2", sub="PGM", bg=B["neutral"]), offline=True)
    y += 106
    g, y = glist(ix, y, iw, [{"rows": [{"t": "＋ 状態表示を追加", "tc": C["blue"]}]}], sec_gap=14, card=C["bg3"])
    s += g
    s += T(ix + 16, y + 6, "条件は 機器の状態 / 変数の比較 / 式 から選べます", 12, 400, C["label3"])
    return ipad_frame_common(s)


def ipad_buttons_pages():
    s = buttons_center(selected=None)
    ins, ix, iw, y = inspector_head(1)
    s += ins
    s += T(ix + 16, y + 14, "左右スワイプで複製・削除。右端をドラッグで並べ替え", 13, 400, C["label2"])
    y += 28
    pages = [("1", "本番", "20 ボタン", True), ("2", "VTR", "9 ボタン", False), ("3", "音声", "14 ボタン", False), ("4", "照明", "6 ボタン", False), ("5", "予備", "0 ボタン", False)]
    s += R(ix, y, iw, 60 * len(pages), C["bg3"], r=12)
    for i, (n, name, cnt, cur) in enumerate(pages):
        ry = y + i * 60
        s += icon("handle", ix + 14, ry + 20, 20, C["label3"], 2)
        s += R(ix + 46, ry + 17, 26, 26, C["blue"] if cur else C["fill"], r=7) + T(ix + 59, ry + 35, n, 14, 700, anchor="middle")
        s += T(ix + 86, ry + 28, name, 17, 600 if cur else 400)
        s += T(ix + 86, ry + 48, cnt, 13, 400, C["label2"])
        if cur:
            s += T(ix + iw - 44, ry + 35, "表示中", 13, 500, C["label2"], "end")
        s += icon("ellipsis", ix + iw - 34, ry + 20, 20, C["blue"])
        if i < len(pages) - 1:
            s += L(ix + 86, ry + 60, ix + iw, ry + 60, C["sep"], 0.7)
    y += 60 * len(pages) + 14
    g, y = glist(ix, y, iw, [{"rows": [{"t": "＋ ページを追加", "tc": C["blue"]}]}], sec_gap=24, card=C["bg3"])
    s += g
    s += sec_label(ix, y, "このページ")
    g, y = glist(ix, y + 10, iw, [{"rows": [
        {"t": "名前", "r": "本番", "rc": C["label"]},
        {"t": "書き出す", "chev": True},
        {"t": "ページを複製", "chev": True},
        {"t": "ページを空にする", "tc": C["red"]},
        {"t": "ページを削除", "tc": C["red"]},
    ]}], sec_gap=0, card=C["bg3"])
    s += g
    return ipad_frame_common(s)


def ipad_buttons_presets():
    s = buttons_center(selected=None)
    ins, ix, iw, y = inspector_head(2)
    s += ins
    s += sec_label(ix, y + 14, "機器")
    s += popup(ix, y + 22, iw, "DEMO-SW-A（Roland V-160HD）", 36)
    y += 74
    s += T(ix + 16, y + 6, "ボタンを長押しして、空きマスへドラッグ", 13, 400, C["label2"])
    y += 24
    cats = [
        ("PGM（入力を選ぶ）", [dict(main=f"SDI {i}", sub="PGM", bg=B["neutral"]) for i in range(1, 6)]),
        ("PST（入力を選ぶ）", [dict(main=f"SDI {i}", sub="PST", bg=B["neutral"]) for i in range(1, 6)]),
        ("トランジション", [dict(main="CUT", bg=B["white"]), dict(main="AUTO", bg=B["yellow"]), dict(main="FTB", bg=B["black"])]),
        ("DSK / PinP", [dict(main="DSK 1", sub="ON/OFF", bg=B["blue"]), dict(main="PinP 1", sub="ON/OFF", bg=B["neutral"])]),
        ("表示（変数）", [dict(main="SDI 2", sub="現在の PGM", bg=B["dark"], var=True)]),
    ]
    for title, btns in cats:
        s += R(ix, y, iw, 106, C["bg3"], r=12)
        s += T(ix + 16, y + 24, title, 15, 600)
        s += icon("chev-d", ix + iw - 30, y + 12, 12, C["label2"], 2.6)
        for i, bt in enumerate(btns):
            s += tile(ix + 16 + i * 74, y + 36, 64, 58, r=9, fs=12, **bt)
        y += 116
    # ドラッグ中の表現
    dx, dy = SB + 20 + 4 * 79, 116 + 2 * 79
    s += R(dx - 3, dy - 3, 77, 77, "rgba(10,132,255,0.15)", r=12, stroke=C["blue"], sw=3, dash="6 5")
    s += tile(dx + 22, dy + 26, 71, 71, r=10, fs=13, main="SDI 3", sub="PGM", bg=B["neutral"])
    s += icon2("hand", dx + 70, dy + 74, 30, C["label"], 1.8)
    s += T(SB + 20, 720, "ドラッグ中：置き先のマスが青い点線で光る", 13, 400, C["label3"])
    return ipad_frame_common(s)


# ---------------------------------------------------------------------------
# iPad: 本番
# ---------------------------------------------------------------------------
def ipad_show():
    s = ""
    s += R(24, 34, 30, 30, C["blue"], r=8) + T(39, 55, "1", 16, 700, anchor="middle") + T(64, 56, "本番", 22, 700)
    s += T(IW / 2, 58, "19:42:08", 24, 600, mono=True, anchor="middle")
    c, w = chip(IW - 24 - 140 - 12 - 120, 34, "機器 4/5", "warn", h=32, size=14)
    s += c
    s += R(IW - 24 - 140, 33, 140, 34, C["fill3"], r=17) + icon("lock", IW - 24 - 126, 41, 17, C["label"]) + T(IW - 24 - 102, 56, "ロック中", 15, 600)
    ov = {
        (1, 2): dict(state="pressing"),     # PST CAM 3 を押している
        (2, 1): dict(state="sent"),         # AUTO 送れた
        (2, 6): dict(hold=0.62),            # OPENING 長押し判定中
        (3, 1): dict(state="failed"),       # MIC 2 送れなかった
    }
    s += grid(24, 82, 154, 196, 12, mode="run", overrides=ov, fs=26, r=14)
    s += R(24, 900, IW - 48, 76, "rgba(118,118,128,0.10)", r=14)
    s += page_bar(IW / 2, 920, sel=0, pages=("本番", "VTR", "音声", "照明"))
    s += T(44, 944, "← スワイプでページ →", 12, 500, C["label3"])
    s += T(IW - 24, 990, "ロック解除・編集に戻る：右上を 1.5 秒長押し", 12, 400, C["label3"], "end")
    return ipad_frame_common(s)


# ---------------------------------------------------------------------------
# iPad: 機器 / トリガー / 変数 / 画像 / 設定
# ---------------------------------------------------------------------------
LX, LW = SB, 390
DX = SB + LW


def list_column(title, rows, plus=True, search="検索", footer=None, sel_index=0, h=72):
    s = L(SB, 0, SB, IH, C["sep"], 0.7)
    s += T(LX + 20, 118, title, 34, 700)
    if plus:
        s += circle_btn(LX + LW - 40, 50, "plus", 22, color=C["blue"], isz=18)
    s += R(LX + 16, 134, LW - 32, 36, C["fill3"], r=10) + icon("search", LX + 26, 143, 18, C["label2"]) + T(LX + 50, 158, search, 17, 400, C["label2"])
    y = 188
    cw = LW - 32
    s += R(LX + 16, y, cw, h * len(rows), C["bg2"], r=12)
    for i, rw in enumerate(rows):
        ry = y + i * h
        sel = i == sel_index
        if sel:
            s += R(LX + 16, ry, cw, h, C["blue"], r=12 if i in (0, len(rows) - 1) else 0)
        lx = LX + 32
        if rw.get("dot"):
            s += status_dot(lx + 6, ry + 26, rw["dot"], 5.5)
            lx += 22
        if rw.get("icon"):
            nm, bg = rw["icon"]
            s += R(lx, ry + 22, 28, 28, bg, r=7) + icon2(nm, lx + 5, ry + 27, 18, "#FFFFFF", 2)
            lx += 40
        s += T(lx, ry + 31, rw["t"], 17, 600)
        s += T(lx, ry + 54, rw["s"], 13, 400, C["label"] if sel else C["label2"])
        if rw.get("r"):
            s += T(LX + 16 + cw - 16, ry + 31, rw["r"], 13, 600, C["label"] if sel else rw.get("rc", C["label2"]), "end")
        if rw.get("sw") is not None:
            s += switch(LX + 16 + cw - 16 - 51, ry + 20, rw["sw"])
        if i < len(rows) - 1 and not sel and (i + 1) != sel_index:
            s += L(lx, ry + h, LX + 16 + cw, ry + h, C["sep"], 0.7)
    y += h * len(rows) + 24
    for j, f in enumerate(footer or []):
        s += T(LX + 22, y + j * 20, f, 13, 400, C["label2"])
    s += L(DX, 0, DX, IH, C["sep"], 0.7)
    return s


def ipad_devices():
    s = sidebar("devices")
    s += list_column("機器", [
        {"dot": "ok", "t": "DEMO-SW-A", "s": "Roland V-160HD · LAN", "r": "接続中", "rc": C["green"]},
        {"dot": "ok", "t": "DEMO-SW-B", "s": "Roland V-80HD · LAN", "r": "接続中", "rc": C["green"]},
        {"dot": "ok", "t": "DEMO-ATEM", "s": "Blackmagic ATEM · LAN", "r": "接続中", "rc": C["green"]},
        {"dot": "ok", "t": "DEMO-MIXER", "s": "汎用 OSC · UDP", "r": "送信可", "rc": C["green"]},
        {"dot": "warn", "t": "DEMO-REC", "s": "汎用 TCP · LAN", "r": "再接続中", "rc": C["orange"]},
        {"dot": "off", "t": "DEMO-HTTP", "s": "汎用 HTTP", "r": "無効"},
    ], footer=["ローカルネットワーク：許可済み", "この iPad：192.168.10.5"])
    dw = IW - DX
    s += T(DX + dw / 2, 50, "DEMO-SW-A", 17, 600, anchor="middle")
    s += circle_btn(IW - 40, 50, "ellipsis", 22, color=C["blue"], isz=18)
    cx0 = DX + 24
    cw = dw - 48
    s += R(cx0, 84, cw, 92, C["bg2"], r=12)
    s += status_dot(cx0 + 24, 114, "ok", 7) + T(cx0 + 40, 122, "接続中", 22, 700)
    s += T(cx0 + 24, 156, "応答 4 ms · 最終受信 0.2 秒前", 13, 400, C["label2"])
    g, y = glist(cx0, 196, cw, [
        {"header": "基本", "rows": [
            {"t": "名前", "r": "DEMO-SW-A", "rc": C["label"]},
            {"t": "有効", "sw": True},
            {"t": "機種（ドライバ）", "r": "Roland V-160HD · v1.0", "chev": True},
        ]},
        {"header": "接続", "rows": [
            {"t": "IP アドレス", "r": "192.168.10.20", "rmono": True, "rc": C["label"]},
            {"t": "ポート", "r": "8023", "rmono": True, "rc": C["label"]},
            {"t": "ネットワークパスワード", "r": "••••", "rc": C["label"]},
            {"t": "状態の問い合わせ間隔", "r": "250 ms", "chev": True},
        ], "footer": ["本体の MENU > LAN CONTROL で設定したパスワード（4 桁）", "値を変えると自動で接続し直します"]},
        {"header": "この機器の値（変数）", "rows": [
            {"t": "$(DEMO-SW-A:pgm)", "tmono": True, "r": "SDI 2", "rmono": True, "rc": C["label"]},
            {"t": "$(DEMO-SW-A:pst)", "tmono": True, "r": "SDI 3", "rmono": True, "rc": C["label"]},
            {"t": "すべての値を見る（105）", "tc": C["blue"], "chev": True},
        ]},
    ], sec_gap=20)
    s += g
    # ⋯ メニュー（開いた状態）
    mx, my = IW - 250, 76
    s += R(mx + 2, my + 6, 226, 236, "rgba(0,0,0,0.35)", r=14) + R(mx, my, 226, 236, C["bg3"], r=14, stroke="rgba(255,255,255,0.08)", sw=1)
    for i, (t, ic, red) in enumerate([("変数を見る", "dollar", False), ("ログを見る", "list", False), ("診断", "info", False),
                                       ("複製", "dup", False), ("機器を削除", "trash", True)]):
        yy = my + i * 46 + (4 if i == 4 else 0)
        if i == 4:
            s += L(mx, yy - 2, mx + 226, yy - 2, C["sep"], 4)
        col = C["red"] if red else C["label"]
        s += T(mx + 16, yy + 30, t, 17, 400, col) + icon2(ic, mx + 226 - 38, yy + 12, 20, col, 1.9)
    return ipad_frame_common(s)


def ipad_triggers():
    s = sidebar("triggers")
    s += list_column("トリガー", [
        {"icon": ("clock", C["orange"]), "t": "本番開始", "s": "時刻 · 毎日 19:00:00", "sw": True},
        {"icon": ("bolt", C["purple"]), "t": "VTR で音声切替", "s": "変数が変わった時", "sw": True},
        {"icon": ("power", C["green"]), "t": "起動時の準備", "s": "アプリ起動時", "sw": True},
        {"icon": ("warn", C["red"]), "t": "REC 切断の警告", "s": "機器が切れた時", "sw": False},
    ], footer=["アプリが前面にある間だけ動きます（iOS の制約）"], sel_index=1)
    dw = IW - DX
    s += T(DX + dw / 2, 50, "VTR で音声切替", 17, 600, anchor="middle")
    o, w = prominent(IW - 24, 33, "テスト", "play")
    s += o
    cx0 = DX + 24
    cw = dw - 48
    s += sec_label(cx0, 102, "名前")
    s += field(cx0, 110, cw, "VTR で音声切替", fill=C["bg2"])
    s += R(cx0, 160, cw, 44, C["bg2"], r=10) + T(cx0 + 14, 188, "メモ", 15, 400, C["label3"])
    s += segmented(cx0, 220, cw, ["きっかけ", "条件", "動作", "トリガー変数"], 0, 32, 13)
    s += T(cx0 + 16, 278, "どれか 1 つが起きたら実行", 13, 400, C["label2"])
    g, y = glist(cx0, 290, cw, [
        {"rows": [
            {"icon": ("dollar", C["purple"]), "t": "変数が変わった時", "s": "$(DEMO-SW-A:pgm)", "smono": True, "h": 60, "chev": True},
            {"icon": ("power", C["green"]), "t": "機器が接続した時", "s": "DEMO-SW-A", "h": 60, "chev": True},
            {"t": "＋ きっかけを追加", "tc": C["blue"]},
        ]},
    ], sec_gap=20)
    s += g
    s += T(cx0 + 16, y + 4, "選べるきっかけ", 13, 600, C["label2"])
    kinds = ["ボタンを押した／離した", "条件が真／偽になった", "変数が変わった", "一定間隔", "時刻（毎日・曜日）", "アプリ起動時", "機器が接続した／切れた"]
    for i, t in enumerate(kinds):
        c, ww = chip(cx0 + 16 + (i % 3) * 196, y + 18 + (i // 3) * 38, t, None, h=30, size=13)
        s += c
    return ipad_frame_common(s)


def ipad_variables():
    s = sidebar("variables")
    s += L(SB, 0, SB, IH, C["sep"], 0.7)
    x0 = SB + 24
    w = IW - SB - 48
    s += T(x0, 118, "変数", 34, 700)
    s += segmented(x0, 140, 520, ["自分で作る", "式", "内部", "機器"], 3)
    s += popup(x0 + 536, 140, 240, "DEMO-SW-A", 32)
    s += R(IW - 24 - 260, 138, 260, 36, C["fill3"], r=10) + icon("search", IW - 274, 147, 18, C["label2"]) + T(IW - 250, 162, "絞り込み", 17, 400, C["label2"])
    y = 194
    rows = [("$(DEMO-SW-A:pgm)", "PGM 入力", "SDI 2"), ("$(DEMO-SW-A:pst)", "PST 入力", "SDI 3"),
            ("$(DEMO-SW-A:aux1)", "AUX 1 の入力", "HDMI 1"), ("$(DEMO-SW-A:aux1_mute)", "AUX 1 ミュート", "Off"),
            ("$(DEMO-SW-A:trans_type)", "トランジションの種類", "MIX"), ("$(DEMO-SW-A:trans_time)", "トランジション時間", "1.0"),
            ("$(DEMO-SW-A:dsk1)", "DSK 1", "On"), ("$(DEMO-SW-A:connected)", "接続しているか", "true")]
    s += R(x0, y, w, 40 + 56 * len(rows), C["bg2"], r=12)
    for name, cx in [("変数", x0 + 20), ("内容", x0 + 420), ("現在値", x0 + 700)]:
        s += T(cx, y + 26, name, 13, 600, C["label2"])
    s += L(x0, y + 40, x0 + w, y + 40, C["sep"], 0.7)
    for i, (v, d, val) in enumerate(rows):
        ry = y + 40 + i * 56
        s += T(x0 + 20, ry + 34, v, 15, 500, C["teal"], mono=True)
        s += T(x0 + 420, ry + 34, d, 15, 400)
        s += R(x0 + 700, ry + 14, tw(val, 15, True) + 20, 28, C["fill3"], r=7) + T(x0 + 710, ry + 33, val, 15, 600, mono=True)
        s += icon("dup", x0 + w - 44, ry + 18, 20, C["blue"])
        if i < len(rows) - 1:
            s += L(x0 + 20, ry + 56, x0 + w, ry + 56, C["sep"], 0.7)
    y += 40 + 56 * len(rows) + 28
    s += T(x0 + 16, y, "ボタンの文字や動作の値に $(機器名:変数名) と書くと現在値に置き換わります。右のアイコンでコピー。", 13, 400, C["label2"])
    s += T(x0 + 16, y + 22, "書式：自分で作る $(custom:名前) / 式 $(expression:名前) / 内部 $(internal:名前) / ボタン変数 $(this:名前)", 13, 400, C["label2"])
    return ipad_frame_common(s)


def ipad_images():
    s = sidebar("images")
    s += L(SB, 0, SB, IH, C["sep"], 0.7)
    x0 = SB + 24
    s += T(x0, 118, "画像", 34, 700)
    s += circle_btn(GX1 - 40, 50, "plus", 22, color=C["blue"], isz=18)
    names = [("logo-white", B["dark"]), ("cam-icon", B["blue"]), ("mic-icon", B["teal"]), ("rec-dot", B["red"]),
             ("arrow-next", B["neutral"]), ("demo-bg", B["purple"])]
    for i, (n, col) in enumerate(names):
        x = x0 + (i % 4) * 160
        y = 150 + (i // 4) * 190
        s += R(x, y, 144, 144, C["bg2"], r=12, stroke=C["blue"] if i == 1 else None, sw=3)
        s += R(x + 22, y + 22, 100, 100, col, r=10)
        s += icon2(["photo", "showplay", "wave", "stop", "chev-r", "photo"][i], x + 52, y + 52, 40, "#FFFFFF", 2)
        s += T(x + 72, y + 166, n, 13, 500, anchor="middle")
    s += R(GX1, 0, INS_W, IH, C["bg2"]) + L(GX1, 0, GX1, IH, C["sep"], 0.7)
    ix = GX1 + 20
    iw = INS_W - 40
    s += R(ix + 90, 70, 200, 200, B["blue"], r=16) + icon2("showplay", ix + 150, 130, 80, "#FFFFFF", 1.6)
    g, y = glist(ix, 300, iw, [{"rows": [
        {"t": "名前", "r": "cam-icon", "rc": C["label"]},
        {"t": "大きさ", "r": "512 × 512"},
        {"t": "使っているボタン", "r": "6 個", "chev": True},
    ]}, {"rows": [{"t": "画像を置き換え", "tc": C["blue"]}, {"t": "画像を削除", "tc": C["red"]}]}], sec_gap=20, card=C["bg3"])
    s += g
    return ipad_frame_common(s)


def ipad_settings():
    s = sidebar("settings")
    s += L(SB, 0, SB, IH, C["sep"], 0.7)
    x0 = SB + 24
    s += T(x0, 118, "設定", 34, 700)
    col_w = (IW - SB - 72) / 2
    g, y = glist(x0, 140, col_w, [
        {"header": "ショー", "rows": [
            {"icon": ("doc", B["blue"]), "t": "現在のショー", "r": "DEMO-SHOW", "chev": True},
            {"icon": ("export", B["indigo"]), "t": "書き出す", "chev": True},
            {"icon": ("import", B["indigo"]), "t": "読み込む", "chev": True},
        ]},
        {"header": "ボタン", "rows": [
            {"icon": ("grid", B["neutral"]), "t": "グリッドの大きさ", "r": "8 × 4", "chev": True},
            {"icon": ("text", B["neutral"]), "t": "上部の帯を表示", "sw": False},
            {"icon": ("warn", B["orange"]), "t": "状態アイコンを表示", "sw": True},
        ]},
        {"header": "本番", "rows": [
            {"icon": ("lock", B["neutral"]), "t": "本番に入る時のロック", "r": "毎回聞く", "chev": True},
            {"icon": ("hand", B["neutral"]), "t": "ロック解除の長押し", "r": "1.5 秒", "chev": True},
            {"icon": ("grid", B["neutral"]), "t": "ボタンの上でもスワイプで切替", "sw": False},
            {"icon": ("wave", B["teal"]), "t": "押した時の振動", "sw": True},
            {"icon": ("sun", B["orange"]), "t": "画面スリープ防止", "r": "本番中だけ", "chev": True},
        ]},
    ], sec_gap=24)
    s += g
    g, y = glist(x0 + col_w + 24, 140, col_w, [
        {"header": "記録", "rows": [
            {"icon": ("list", B["neutral"]), "t": "ログ", "r": "警告 1", "rc": C["orange"], "chev": True},
        ]},
        {"header": "このアプリについて", "rows": [
            {"icon": ("info", B["neutral"]), "t": "バージョン", "r": "1.0 (1)"},
            {"icon": ("doc", B["neutral"]), "t": "オープンソースのライセンス", "chev": True},
        ]},
    ], sec_gap=24)
    s += g
    # ログのプレビュー
    lx = x0 + col_w + 24
    s += sec_label(lx, y + 4, "最近のログ")
    s += R(lx, y + 14, col_w, 230, C["bg2"], r=12)
    logs = [("19:42:01", "情報", "DEMO-SW-A に接続しました", C["label2"]),
            ("19:41:58", "警告", "DEMO-REC：応答なし。再接続します", C["orange"]),
            ("19:41:40", "情報", "ページ 1「本番」を表示", C["label2"]),
            ("19:41:12", "エラー", "DEMO-REC：接続できません（タイムアウト）", C["red"])]
    for i, (t, lv, msg, col) in enumerate(logs):
        yy = y + 30 + i * 52
        s += T(lx + 16, yy + 18, t, 13, 500, C["label2"], mono=True)
        s += T(lx + 100, yy + 18, lv, 13, 700, col)
        s += T(lx + 16, yy + 40, msg, 14, 400)
    return ipad_frame_common(s)


# ---------------------------------------------------------------------------
# iPhone
# ---------------------------------------------------------------------------
def tabbar(sel, w=PW, h=PH):
    tabs = [("grid", "ボタン"), ("cable", "機器"), ("bolt", "トリガー"), ("dollar", "変数"), ("gear", "設定")]
    x0, x1 = 20, w - 20
    y0 = h - 34 - 62
    out = R(x0, y0, x1 - x0, 62, "rgba(44,44,46,0.94)", r=31, stroke="rgba(255,255,255,0.10)", sw=1)
    tw_ = (x1 - x0 - 8) / len(tabs)
    for i, (ic, lab) in enumerate(tabs):
        cx = x0 + 4 + tw_ * i + tw_ / 2
        if i == sel:
            out += R(cx - tw_ / 2 + 2, y0 + 4, tw_ - 4, 54, "rgba(255,255,255,0.10)", r=27)
        col = C["blue"] if i == sel else C["label"]
        out += icon2(ic, cx - 12, y0 + 9, 24, col, 2)
        out += T(cx, y0 + 50, lab, 10, 600, col, "middle")
    return out


def phone_grid(y0=150, overrides=None, mode="edit", selected=None):
    return grid(18, y0, 82, 82, 10, mode=mode, selected=selected, overrides=overrides, fs=15, r=10, cols=4)


def iphone_buttons():
    s = k.iphone_status()
    s += T(16, 82, "ボタン", 17, 600)
    s += R(PW / 2 - 58, 62, 116, 32, C["fill3"], r=16) + T(PW / 2 - 8, 83, "1  本番", 15, 600, anchor="middle") + icon("chev-d", PW / 2 + 28, 72, 12, C["label2"], 2.6)
    o, w = prominent(PW - 16, 61, "本番", "showplay")
    s += o
    c, w = chip(16, 106, "機器 4/5", "warn", h=26, size=12)
    s += c
    s += phone_grid(150, selected=(0, 1))
    s += segmented(PW / 2 - 90, 536, 180, ["1–4 列", "5–8 列"], 0, 28, 12)
    s += T(PW / 2, 584, "左右スワイプで 5–8 列へ", 11, 400, C["label3"], "middle")
    s += tabbar(0)
    s += k.home_indicator(PW, PH)
    return s


def sheet_base(title="ボタンを編集"):
    s = k.iphone_status()
    s += phone_grid(150, selected=(0, 1))
    s += R(0, 0, PW, PH, "rgba(0,0,0,0.45)")
    top = 64
    s += f'<path d="M0 {top + 38} Q0 {top} 38 {top} H{PW - 38} Q{PW} {top} {PW} {top + 38} V{PH} H0 Z" fill="{C["bg2"]}"/>'
    s += R(PW / 2 - 18, top + 6, 36, 5, C["label3"], r=2.5)
    s += T(20, top + 44, "キャンセル", 17, 400, C["blue"])
    s += T(PW / 2, top + 44, title, 17, 600, anchor="middle")
    s += R(PW - 20 - 64, top + 24, 64, 32, C["blue"], r=16) + T(PW - 52, top + 45, "完了", 16, 600, anchor="middle")
    y = top + 72
    s += tile(16, y, 76, 76, "CAM 2", "PGM", B["red"], r=10, fs=15)
    s += T(106, y + 18, "ページ 1 · 1行目 2列目", 12, 400, C["label2"])
    s += T(106, y + 40, "PGM CAM 2", 17, 600)
    o, w = pill_btn(106, y + 50, "テスト", "play", h=28)
    s += o
    s += circle_btn(106 + w + 22, y + 64, "ellipsis", 14, color=C["blue"], isz=14)
    return s, y + 92


def iphone_edit_action():
    s, y = sheet_base()
    s += segmented(16, y, PW - 32, ["動作", "見た目", "状態", "変数", "設定"], 0, 32, 12)
    y += 46
    s += steps_row(16, y)
    g, y = glist(16, y + 42, PW - 32, [
        {"header": "押した時", "header_r": "順番に実行 ▾", "rows": [
            {"pill": "DEMO-SW-A", "t": "PGM を切り替え", "s": "入力: SDI 2", "h": 60, "handle": True},
            {"pill": "DEMO-MIXER", "t": "OSC を送信", "s": "/demo/ch/2/on 1", "smono": True, "h": 60, "handle": True},
            {"t": "＋ 動作を追加", "tc": C["blue"]},
        ]},
        {"header": "離した時", "rows": [{"t": "＋ 動作を追加", "tc": C["blue"]}]},
    ], sec_gap=16, card=C["bg3"])
    s += g
    o, w = pill_btn(16, y - 2, "長押しの動作を追加", "plus")
    s += o
    s += k.home_indicator(PW, PH)
    return s


def iphone_edit_style():
    s, y = sheet_base()
    s += segmented(16, y, PW - 32, ["動作", "見た目", "状態", "変数", "設定"], 1, 32, 12)
    y += 46
    s += sec_label(16, y + 14, "ボタン名")
    s += field(16, y + 22, PW - 32, "PGM CAM 2")
    y += 72
    s += sec_label(16, y + 14, "表示する文字")
    s += R(16, y + 22, PW - 32, 66, C["bg3"], r=10) + T(30, y + 48, "PGM", 17, 400) + T(30, y + 74, "CAM 2", 17, 400)
    s += R(PW - 16 - 98, y + 50, 86, 28, C["fill3"], r=14) + T(PW - 16 - 55, y + 69, "$ 変数", 13, 600, C["blue"], "middle")
    y += 100
    g, y = glist(16, y, PW - 32, [{"rows": [
        {"t": "大きさ", "seg": (["自動", "小", "中", "大"], 0, 176)},
        {"t": "揃え", "r": "中央", "chev": True},
    ]}], sec_gap=12, card=C["bg3"])
    s += g
    s += color_row(16, PW - 32, y, "文字の色", ["#FFFFFF", "#000000", "#F2C200", "#E0302B", "#1F9E48", "#1F5FD6"], 0)
    y += 86
    s += color_row(16, PW - 32, y, "背景の色", [B["red"], B["green"], B["blue"], B["yellow"], B["orange"], B["neutral"]], 0)
    s += k.home_indicator(PW, PH)
    return s


def iphone_edit_feedback():
    s, y = sheet_base()
    s += segmented(16, y, PW - 32, ["動作", "見た目", "状態", "変数", "設定"], 2, 32, 12)
    y += 46
    s += T(32, y + 12, "機器の状態で見た目を変えます。上ほど優先。", 13, 400, C["label2"])
    y += 24
    s += fb_card(16, y, PW - 32, "DEMO-SW-A", "PGM が SDI 2", "背景を赤に", dict(main="CAM 2", sub="PGM", bg=B["red"]))
    y += 106
    s += fb_card(16, y, PW - 32, "DEMO-SW-A", "PST が SDI 2", "背景を緑に", dict(main="CAM 2", sub="PGM", bg=B["green"]))
    y += 106
    g, y = glist(16, y, PW - 32, [{"rows": [{"t": "＋ 状態表示を追加", "tc": C["blue"]}]}], sec_gap=0, card=C["bg3"])
    s += g
    s += k.home_indicator(PW, PH)
    return s


def iphone_show():
    s = k.iphone_status()
    s += R(16, 64, 26, 26, C["blue"], r=7) + T(29, 83, "1", 14, 700, anchor="middle") + T(50, 84, "本番", 18, 700)
    s += T(PW / 2 + 40, 84, "19:42:08", 17, 600, mono=True, anchor="middle")
    s += R(PW - 16 - 40, 60, 40, 32, C["fill3"], r=16) + icon("lock", PW - 16 - 29, 67, 18, C["label"])
    ov = {(1, 2): dict(state="pressing"), (2, 1): dict(state="sent"), (3, 1): dict(state="failed")}
    s += grid(14, 108, 85, 132, 8, mode="run", overrides=ov, fs=17, r=12, cols=4)
    s += R(10, 664, PW - 20, 112, "rgba(118,118,128,0.10)", r=16)
    s += segmented(PW / 2 - 90, 674, 180, ["1–4 列", "5–8 列"], 0, 28, 12)
    s += page_bar(PW / 2, 712, sel=0, pages=("本番", "VTR", "音声"), h=32)
    s += T(PW / 2, 766, "← この帯を左右スワイプで切替 →", 11, 500, C["label3"], "middle")
    s += T(PW / 2, 800, "ボタンの上ではスワイプしない（誤操作防止）", 11, 400, C["label3"], "middle")
    s += k.home_indicator(PW, PH)
    return s


def iphone_lock_ask():
    s = iphone_buttons()
    s += R(0, 0, PW, PH, "rgba(0,0,0,0.45)")
    x, w = 8, PW - 16
    y0 = PH - 34 - 8 - 60 - 8 - 3 * 57 - 76
    s += R(x, y0, w, 76 + 3 * 57 - 57, "rgba(44,44,46,0.97)", r=14)
    s += T(PW / 2, y0 + 28, "ロックしますか？", 13, 600, C["label2"], "middle")
    s += T(PW / 2, y0 + 50, "ロック中はボタンとページ切替だけ操作できます。", 12, 400, C["label2"], "middle")
    s += T(PW / 2, y0 + 67, "解除は右上を 1.5 秒長押し。", 12, 400, C["label2"], "middle")
    yy = y0 + 76
    for i, t in enumerate(["ロックして本番へ", "ロックせずに本番へ"]):
        s += L(x, yy, x + w, yy, C["sep"], 0.7)
        s += T(PW / 2, yy + 36, t, 20, 600 if i == 0 else 400, C["blue"], "middle")
        yy += 57
    yc = yy + 8
    s += R(x, yc, w, 57, "rgba(44,44,46,0.97)", r=14) + T(PW / 2, yc + 36, "キャンセル", 20, 600, C["blue"], "middle")
    return s


def iphone_list(title, tab, rows, footer=None, plus=True):
    s = k.iphone_status()
    if plus:
        s += circle_btn(PW - 38, 76, "plus", 22, color=C["blue"], isz=18)
    s += T(16, 140, title, 34, 700)
    s += R(16, 156, PW - 32, 36, C["fill3"], r=10) + icon("search", 26, 165, 18, C["label2"]) + T(50, 180, "検索", 17, 400, C["label2"])
    g, y = glist(16, 210, PW - 32, [{"rows": rows, "footer": footer}])
    s += g
    s += tabbar(tab)
    s += k.home_indicator(PW, PH)
    return s


def iphone_devices():
    return iphone_list("機器", 1, [
        {"dot": "ok", "t": "DEMO-SW-A", "s": "Roland V-160HD · LAN", "h": 64, "r": "接続中", "rc": C["green"], "chev": True},
        {"dot": "ok", "t": "DEMO-ATEM", "s": "Blackmagic ATEM · LAN", "h": 64, "r": "接続中", "rc": C["green"], "chev": True},
        {"dot": "ok", "t": "DEMO-MIXER", "s": "汎用 OSC · UDP", "h": 64, "r": "送信可", "rc": C["green"], "chev": True},
        {"dot": "warn", "t": "DEMO-REC", "s": "汎用 TCP · LAN", "h": 64, "r": "再接続中", "rc": C["orange"], "chev": True},
        {"dot": "off", "t": "DEMO-HTTP", "s": "汎用 HTTP", "h": 64, "r": "無効", "chev": True},
    ], ["ローカルネットワーク：許可済み"])


def iphone_devices_empty():
    s = k.iphone_status()
    s += circle_btn(PW - 38, 76, "plus", 22, color=C["blue"], isz=18)
    s += T(16, 140, "機器", 34, 700)
    s += icon2("cable", PW / 2 - 28, 300, 56, C["label3"], 1.6)
    s += T(PW / 2, 400, "機器がありません", 22, 700, anchor="middle")
    s += T(PW / 2, 432, "スイッチャーやミキサーを追加すると、", 15, 400, C["label2"], "middle")
    s += T(PW / 2, 454, "ボタンから操作できます。", 15, 400, C["label2"], "middle")
    o, w = prominent(PW / 2 + 70, 480, "機器を追加", "plus", h=44)
    s += o
    s += tabbar(1)
    s += k.home_indicator(PW, PH)
    return s


def iphone_triggers():
    return iphone_list("トリガー", 2, [
        {"icon": ("clock", C["orange"]), "t": "本番開始", "s": "毎日 19:00:00", "h": 64, "sw": True},
        {"icon": ("bolt", C["purple"]), "t": "VTR で音声切替", "s": "変数が変わった時", "h": 64, "sw": True},
        {"icon": ("power", C["green"]), "t": "起動時の準備", "s": "アプリ起動時", "h": 64, "sw": True},
        {"icon": ("warn", C["red"]), "t": "REC 切断の警告", "s": "機器が切れた時", "h": 64, "sw": False},
    ], ["アプリが前面にある間だけ動きます"])


def iphone_variables():
    s = k.iphone_status()
    s += circle_btn(PW - 38, 76, "plus", 22, color=C["blue"], isz=18)
    s += T(16, 140, "変数", 34, 700)
    s += segmented(16, 158, PW - 32, ["自分で作る", "式", "内部", "機器"], 3, 32, 12)
    s += popup(16, 200, PW - 32, "DEMO-SW-A", 34)
    g, y = glist(16, 250, PW - 32, [{"rows": [
        {"t": "$(DEMO-SW-A:pgm)", "tmono": True, "s": "PGM 入力", "h": 56, "r": "SDI 2", "rmono": True, "rc": C["label"]},
        {"t": "$(DEMO-SW-A:pst)", "tmono": True, "s": "PST 入力", "h": 56, "r": "SDI 3", "rmono": True, "rc": C["label"]},
        {"t": "$(DEMO-SW-A:aux1)", "tmono": True, "s": "AUX 1 の入力", "h": 56, "r": "HDMI 1", "rmono": True, "rc": C["label"]},
        {"t": "$(DEMO-SW-A:dsk1)", "tmono": True, "s": "DSK 1", "h": 56, "r": "On", "rmono": True, "rc": C["label"]},
    ], "footer": "長押しでコピー"}])
    g = g.replace(f'font-family="{k.MONO}" font-size="17" font-weight="400" fill="#FFFFFF"', f'font-family="{k.MONO}" font-size="15" font-weight="500" fill="{C["teal"]}"')
    s += g
    s += tabbar(3)
    s += k.home_indicator(PW, PH)
    return s


def iphone_settings():
    s = k.iphone_status()
    s += T(16, 140, "設定", 34, 700)
    g, y = glist(16, 160, PW - 32, [
        {"rows": [
            {"icon": ("doc", B["blue"]), "t": "現在のショー", "r": "DEMO-SHOW", "chev": True},
            {"icon": ("export", B["indigo"]), "t": "書き出し・読み込み", "chev": True},
        ]},
        {"rows": [
            {"icon": ("photo", B["purple"]), "t": "画像", "r": "6", "chev": True},
            {"icon": ("list", B["neutral"]), "t": "ログ", "r": "警告 1", "rc": C["orange"], "chev": True},
        ]},
        {"header": "本番", "rows": [
            {"icon": ("lock", B["neutral"]), "t": "本番のロック", "r": "毎回聞く", "chev": True},
            {"icon": ("wave", B["teal"]), "t": "押した時の振動", "sw": True},
            {"icon": ("sun", B["orange"]), "t": "スリープ防止", "r": "本番中", "chev": True},
        ]},
        {"rows": [{"icon": ("grid", B["neutral"]), "t": "グリッドの大きさ", "r": "8 × 4", "chev": True}]},
    ], sec_gap=22)
    s += g
    s += tabbar(4)
    s += k.home_indicator(PW, PH)
    return s


def phones_doc(items, title):
    M = 56
    W = M + sum(w + M for _, w, _, _ in items)
    H = max(h for _, _, h, _ in items) + M * 2 + 90
    body = T(M, 52, title, 26, 700, CANVAS_TEXT)
    x = M
    for fn, w, h, cap in items:
        body += k.frame(fn(), w, h, 55, x, M + 90, cap, None)
        x += w + M
    return k.doc(W, H, body, title)


# ---------------------------------------------------------------------------
# 部品・押下表現
# ---------------------------------------------------------------------------
def tokens():
    W, H = 1500, 1380
    s = T(48, 70, "conductor 部品と押下表現", 30, 700, CANVAS_TEXT)
    s += T(48, 100, "表示色は iOS ダークモード。実装は PlatformColor（systemBackground / secondarySystemBackground / label / secondaryLabel / systemBlue …）で参照し、ライト・コントラスト増にも追従。", 14, 400, CANVAS_TEXT2)
    s += T(48, 122, "ボタンの文字色・背景色だけはユーザーが選ぶコンテンツ色（固定値で保存）。", 14, 400, CANVAS_TEXT2)
    # 押下表現
    y = 160
    s += T(48, y, "ボタンを押した時（本番画面）", 18, 700, CANVAS_TEXT)
    y += 14
    s += R(48, y, 1404, 330, C["bg"], r=14)
    seq = [
        (dict(main="CAM 3", sub="PST", bg=B["neutral"]), "① 通常", "—"),
        (dict(main="CAM 3", sub="PST", bg=B["neutral"], state="pressing"), "② 押している", "94% に縮小＋白枠＋明るく／振動（中）"),
        (dict(main="CAM 3", sub="PST", bg=B["green"], state="sent"), "③ 送れた", "白い枠が外へ広がって消える 0.25 秒"),
        (dict(main="CAM 3", sub="PST", bg=B["green"]), "④ 状態表示が反映", "機器から PST=CAM 3 が返って緑に"),
        (dict(main="MIC 2", sub="OFF", bg=B["neutral"], state="failed"), "⑤ 送れなかった", "橙の枠＋⚠＋左右に揺れる／振動（エラー）"),
        (dict(main="OPENING", sub="マクロ", bg=B["purple"], hold=0.6), "⑥ 長押し判定中", "枠が時計回りに埋まる、成立で振動（強）"),
    ]
    for i, (kw, lab, desc) in enumerate(seq):
        x = 48 + 34 + i * 228
        s += tile(x + 24, y + 40, 130, 130, r=14, fs=24, **kw)
        s += T(x + 89, y + 214, lab, 15, 700, C["label"], "middle")
        words = desc.split("／")
        for j, wd in enumerate(words):
            s += T(x + 89, y + 240 + j * 20, wd, 12, 400, C["label2"], "middle")
    s += T(48 + 20, y + 312, "「視差効果を減らす」がオンの時は、縮小・揺れ・広がりをやめて枠の色だけで表す。", 13, 400, C["label3"])
    y += 360
    s += T(48, y, "編集画面でのボタンの状態", 18, 700, CANVAS_TEXT)
    y += 14
    s += R(48, y, 690, 220, C["bg"], r=14)
    st = [
        (dict(main="CAM 1", sub="PGM", bg=B["neutral"]), "通常"),
        (dict(main="CAM 2", sub="PGM", bg=B["red"], state="selected"), "選択中"),
        (dict(main="REC", sub="00:12:34", bg=B["red"], state="offline"), "機器が未接続"),
        (dict(state="empty"), "空きマス"),
    ]
    for i, (kw, lab) in enumerate(st):
        x = 48 + 40 + i * 160
        s += tile(x + 10, y + 36, 100, 100, r=12, fs=17, **kw)
        s += T(x + 60, y + 176, lab, 13, 500, C["label2"], "middle")
    s += T(770, y - 14, "ボタン色（ユーザーが選ぶ）", 18, 700, CANVAS_TEXT)
    s += R(770, y, 682, 220, "#FFFFFF", r=14)
    for i, (kk, v) in enumerate(B.items()):
        x = 790 + (i % 7) * 94
        yy = y + 20 + (i // 7) * 100
        s += R(x, yy, 80, 64, v, r=10, stroke="rgba(0,0,0,0.2)", sw=1)
        s += T(x + 40, yy + 38, kk, 12, 700, "#000000" if lum(v) > 0.55 else "#FFFFFF", "middle")
        s += T(x + 40, yy + 82, v, 10, 400, CANVAS_TEXT2, "middle", mono=True)
    y += 260
    s += T(48, y, "アイコン（実装は SF Symbols）", 18, 700, CANVAS_TEXT)
    y += 14
    s += R(48, y, 1404, 170, C["bg"], r=14)
    ic = [("grid", "square.grid.2x2"), ("showplay", "play.rectangle"), ("cable", "cable.connector"), ("bolt", "bolt"),
          ("dollar", "dollarsign"), ("photo", "photo.on.rectangle"), ("gear", "gearshape"), ("play", "play.fill"),
          ("stop", "stop.fill"), ("dup", "plus.square.on.square"), ("trash", "trash"), ("lock", "lock.fill"),
          ("handle", "line.3.horizontal"), ("warn", "exclamationmark.triangle.fill"), ("doc", "doc"), ("export", "square.and.arrow.up"),
          ("import", "square.and.arrow.down"), ("list", "list.bullet.rectangle"), ("hand", "hand.raised"), ("info", "info.circle")]
    for i, (nm, sf) in enumerate(ic):
        x = 48 + 30 + (i % 10) * 138
        yy = y + 22 + (i // 10) * 74
        s += icon2(nm, x + 46, yy, 26, C["orange"] if nm == "warn" else C["label"], 2)
        s += T(x + 59, yy + 46, sf, 10, 400, C["label2"], "middle", mono=True)
    y += 210
    s += T(48, y, "寸法", 18, 700, CANVAS_TEXT)
    y += 14
    s += R(48, y, 1404, 200, "#FFFFFF", r=14)
    dims = [
        "iPad：サイドバー 280pt ／ ボタン盤 71pt 角・間隔 8pt（8 列 × 4 行）／ 設定欄 420pt ／ 本番 154 × 196pt・間隔 12pt",
        "iPhone：ボタン盤 82pt 角・間隔 10pt（4 列ずつ）／ 本番 85 × 132pt ／ タブバー 5 つ（ボタン・機器・トリガー・変数・設定）",
        "タップ領域は最小 44 × 44pt。文字は最小 11pt、本文 17pt（Dynamic Type）。細いウェイトは使わない",
        "ボタン角丸 10–14pt。ボタン内の文字は 自動 = 短辺 × 0.17（最小 12pt）",
        "主要アクションは各画面 1 つ（［本番］［完了］［テスト］）をツールバー後縁に .prominent で置く",
    ]
    for i, d in enumerate(dims):
        s += T(72, y + 36 + i * 32, "・" + d, 15, 400, CANVAS_TEXT)
    return k.doc(W, H, s, "conductor tokens")


FILES = {
    "00-parts.svg": tokens,
    "01-ipad-button-action.svg": lambda: ipad_doc(ipad_buttons_action, "iPad / ボタン：動作",
                                                  "左サイドバー・中央ボタン盤・右設定欄。「＋ 動作を追加」を押すと動作の一覧（ポップオーバー）が出て、選んだ動作は行の中で値を入れる"),
    "02-ipad-button-style.svg": lambda: ipad_doc(ipad_buttons_style, "iPad / ボタン：見た目",
                                                 "ボタン名・表示する文字（変数可）・大きさ・揃え・文字の色・背景の色・画像"),
    "03-ipad-button-feedback.svg": lambda: ipad_doc(ipad_buttons_feedback, "iPad / ボタン：状態表示",
                                                    "機器の状態や変数で見た目を変える。上ほど優先"),
    "04-ipad-pages.svg": lambda: ipad_doc(ipad_buttons_pages, "iPad / ボタン：ページ", "ページの追加・並べ替え・名前・複製・削除"),
    "05-ipad-presets.svg": lambda: ipad_doc(ipad_buttons_presets, "iPad / ボタン：プリセット",
                                            "機器ごとのできあいのボタン。長押しで空きマスへドラッグ"),
    "06-ipad-show.svg": lambda: ipad_doc(ipad_show, "iPad / 本番",
                                         "ボタンだけを大きく表示。ロック中はボタンとページ切替だけ。ページ切替は下の帯（ボタンの上ではスワイプしない）",
                                         ["図の中の押下表現：PST CAM 3＝押している／AUTO＝送れた／OPENING＝長押し判定中／MIC 2＝送れなかった／REC＝機器が未接続"]),
    "07-ipad-devices.svg": lambda: ipad_doc(ipad_devices, "iPad / 機器", "一覧 → 選んだ機器の設定。⋯ から 変数・ログ・診断・複製・削除"),
    "08-ipad-triggers.svg": lambda: ipad_doc(ipad_triggers, "iPad / トリガー", "きっかけ（どれか）→ 条件（すべて）→ 動作"),
    "09-ipad-variables.svg": lambda: ipad_doc(ipad_variables, "iPad / 変数", "自分で作る・式・内部・機器 を切り替え"),
    "10-ipad-images.svg": lambda: ipad_doc(ipad_images, "iPad / 画像", "ボタンで使う画像の一覧と詳細"),
    "11-ipad-settings.svg": lambda: ipad_doc(ipad_settings, "iPad / 設定", "ショー・書き出し/読み込み・ボタン・本番・ログ"),
    "20-iphone-buttons.svg": lambda: phones_doc([
        (iphone_buttons, PW, PH, "ボタン（盤）"),
        (iphone_edit_action, PW, PH, "ボタンを編集：動作"),
        (iphone_edit_style, PW, PH, "ボタンを編集：見た目"),
        (iphone_edit_feedback, PW, PH, "ボタンを編集：状態表示"),
    ], "iPhone / ボタン"),
    "21-iphone-show-devices.svg": lambda: phones_doc([
        (iphone_lock_ask, PW, PH, "本番に入る時（ロック確認）"),
        (iphone_show, PW, PH, "本番"),
        (iphone_devices, PW, PH, "機器"),
        (iphone_triggers, PW, PH, "トリガー"),
    ], "iPhone / 本番・機器・トリガー"),
    "22-iphone-variables-settings.svg": lambda: phones_doc([
        (iphone_variables, PW, PH, "変数"),
        (iphone_settings, PW, PH, "設定"),
        (iphone_devices_empty, PW, PH, "空の状態（機器がまだ無い）"),
    ], "iPhone / 変数・設定・空の状態"),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith(".svg"):
            os.remove(os.path.join(OUT, f))
    png_dir = None
    if "--png" in sys.argv:
        png_dir = sys.argv[sys.argv.index("--png") + 1]
        os.makedirs(png_dir, exist_ok=True)
    for name, fn in FILES.items():
        svg = fn()
        path = os.path.join(OUT, name)
        with open(path, "w", encoding="utf-8") as f:
            f.write(svg)
        print("wrote", path)
        if png_dir:
            import cairosvg  # noqa: PLC0415
            cairosvg.svg2png(bytestring=svg.replace(FONT, PREVIEW_FONT).encode("utf-8"),
                             write_to=os.path.join(png_dir, name.replace(".svg", ".png")))


if __name__ == "__main__":
    main()
