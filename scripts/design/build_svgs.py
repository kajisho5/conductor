#!/usr/bin/env python3
"""conductor UI デザイン SVG ジェネレーター。

使い方:
    python3 scripts/design/build_svgs.py            # docs/design/*.svg を生成
    python3 scripts/design/build_svgs.py --png DIR  # 確認用 PNG も DIR に書き出す（cairosvg が必要）

SVG は手で直接編集しない。ここを直して再生成する。
色は iOS ダークモードの semantic system color の値（デザイン表示用）。実装では PlatformColor 名で参照する。
"""
from __future__ import annotations

import html
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "docs", "design"))

FONT = "-apple-system, 'SF Pro Text', 'Hiragino Sans', 'Noto Sans CJK JP', 'Noto Sans JP', sans-serif"
MONO = "'SF Mono', Menlo, 'Noto Sans Mono', monospace"
PREVIEW_FONT = "'Noto Sans CJK JP'"

# ---------------------------------------------------------------------------
# iOS semantic system colors（Dark appearance の値。実装では PlatformColor 名で参照）
# ---------------------------------------------------------------------------
C = {
    "bg": "#000000",            # systemBackground
    "bg2": "#1C1C1E",           # secondarySystemBackground
    "bg3": "#2C2C2E",           # tertiarySystemBackground
    "bg4": "#3A3A3C",           # systemGray4 相当（セグメント選択・押下）
    "seg": "#636366",           # systemGray2（セグメント選択面）
    "label": "#FFFFFF",         # label
    "label2": "rgba(235,235,245,0.6)",   # secondaryLabel
    "label3": "rgba(235,235,245,0.3)",   # tertiaryLabel
    "label4": "rgba(235,235,245,0.16)",  # quaternaryLabel
    "sep": "rgba(84,84,88,0.65)",        # separator
    "fill": "rgba(120,120,128,0.36)",    # systemFill
    "fill2": "rgba(120,120,128,0.32)",   # secondarySystemFill
    "fill3": "rgba(118,118,128,0.24)",   # tertiarySystemFill
    "fill4": "rgba(118,118,128,0.18)",   # quaternarySystemFill
    "blue": "#0A84FF",
    "green": "#30D158",
    "red": "#FF453A",
    "orange": "#FF9F0A",
    "yellow": "#FFD60A",
    "purple": "#BF5AF2",
    "teal": "#40C8E0",
    "indigo": "#5E5CE6",
    "gray": "#8E8E93",
    "pink": "#FF375F",
}

PLATFORM_NAMES = [
    ("bg", "systemBackground"), ("bg2", "secondarySystemBackground"), ("bg3", "tertiarySystemBackground"),
    ("label", "label"), ("label2", "secondaryLabel"), ("label3", "tertiaryLabel"), ("label4", "quaternaryLabel"),
    ("sep", "separator"), ("fill", "systemFill"), ("fill3", "tertiarySystemFill"),
    ("blue", "systemBlue"), ("green", "systemGreen"), ("red", "systemRed"), ("orange", "systemOrange"),
    ("yellow", "systemYellow"), ("purple", "systemPurple"), ("teal", "systemTeal"), ("indigo", "systemIndigo"),
    ("gray", "systemGray"),
]

# ボタン用のコンテンツ色（ユーザーが選ぶ色。システム色ではないので固定値で保存する）
B = {
    "neutral": "#2A2A2E",
    "dark": "#151517",
    "black": "#050505",
    "white": "#E9E9EC",
    "red": "#E0302B",
    "green": "#1F9E48",
    "blue": "#1F5FD6",
    "yellow": "#F2C200",
    "orange": "#E07800",
    "purple": "#7A3FD0",
    "teal": "#0F8A9E",
    "indigo": "#3F3FB8",
    "maroon": "#6E1616",
}

CANVAS = "#E6E6EA"
CANVAS_TEXT = "#1C1C1E"
CANVAS_TEXT2 = "#6C6C70"


# ---------------------------------------------------------------------------
# 基本描画
# ---------------------------------------------------------------------------
def esc(s: str) -> str:
    return html.escape(str(s), quote=True)


def tw(s: str, size: float, mono: bool = False) -> float:
    """テキスト幅の概算（レイアウト用）。"""
    w = 0.0
    for ch in str(s):
        o = ord(ch)
        if mono:
            w += size * (1.0 if o > 0x2E80 else 0.6)
        elif o > 0x2E80:
            w += size * 1.0
        elif ch in "il.,:;|!'·":
            w += size * 0.28
        elif ch == " ":
            w += size * 0.28
        elif ch.isupper() or ch in "MW@%":
            w += size * 0.66
        else:
            w += size * 0.56
    return w


def R(x, y, w, h, fill="none", r=0, stroke=None, sw=1.0, dash=None, op=None, extra=""):
    a = f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}"'
    if r:
        a += f' rx="{r}" ry="{r}"'
    a += f' fill="{fill}"'
    if stroke:
        a += f' stroke="{stroke}" stroke-width="{sw}"'
    if dash:
        a += f' stroke-dasharray="{dash}"'
    if op is not None:
        a += f' opacity="{op}"'
    return a + f"{extra}/>"


def CIR(cx, cy, r, fill="none", stroke=None, sw=1.0):
    a = f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r}" fill="{fill}"'
    if stroke:
        a += f' stroke="{stroke}" stroke-width="{sw}"'
    return a + "/>"


def L(x1, y1, x2, y2, stroke, sw=1.0, dash=None):
    a = f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="{stroke}" stroke-width="{sw}"'
    if dash:
        a += f' stroke-dasharray="{dash}"'
    return a + "/>"


def T(x, y, s, size=17, w=400, fill=None, anchor="start", mono=False, ls=None, op=None):
    fill = fill or C["label"]
    if mono and any(ord(ch) > 0x2E80 for ch in str(s)):
        mono = False  # 等幅フォントに和文が無いので和文を含む行は本文フォント
    fam = MONO if mono else FONT
    a = (f'<text x="{x:.2f}" y="{y:.2f}" font-family="{fam}" font-size="{size}" font-weight="{w}" '
         f'fill="{fill}" text-anchor="{anchor}"')
    if ls is not None:
        a += f' letter-spacing="{ls}"'
    if op is not None:
        a += f' opacity="{op}"'
    return a + f">{esc(s)}</text>"


def G(content: str, tx=0.0, ty=0.0, scale=None) -> str:
    t = f"translate({tx:.2f},{ty:.2f})"
    if scale:
        t += f" scale({scale})"
    return f'<g transform="{t}">{content}</g>'


# ---------------------------------------------------------------------------
# アイコン（24 グリッドの線画。実装では SF Symbols の対応名を使う）
# ---------------------------------------------------------------------------
ICON_SF = {
    "grid": "square.grid.2x2", "bolt": "bolt", "braces": "curlybraces", "network": "network",
    "slider": "slider.horizontal.3", "list": "list.bullet.rectangle", "archive": "archivebox",
    "gear": "gearshape", "chev-l": "chevron.left", "chev-r": "chevron.right", "chev-d": "chevron.down",
    "plus": "plus", "lock": "lock.fill", "unlock": "lock.open", "ellipsis": "ellipsis",
    "trash": "trash", "dup": "plus.square.on.square", "clock": "clock", "warn": "exclamationmark.triangle.fill",
    "check": "checkmark", "sidebar": "sidebar.left", "search": "magnifyingglass", "handle": "line.3.horizontal",
    "undo": "arrow.uturn.backward", "redo": "arrow.uturn.forward", "power": "power", "xmark": "xmark",
    "play": "play.fill", "photo": "photo", "wave": "waveform", "cable": "cable.connector",
    "antenna": "antenna.radiowaves.left.and.right", "text": "textformat", "paint": "paintpalette",
    "eye": "eye", "sun": "sun.max", "pages": "rectangle.stack", "wifi": "wifi",
}


def _gear_path() -> str:
    pts = []
    teeth = 8
    for i in range(teeth * 4):
        ang = (i / (teeth * 4)) * 2 * math.pi - math.pi / 2
        r = 9.6 if (i % 4) in (1, 2) else 7.4
        pts.append((12 + r * math.cos(ang), 12 + r * math.sin(ang)))
    d = "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in pts) + " Z"
    return d


def icon(name: str, x: float, y: float, s: float = 22, color: str | None = None, sw: float = 1.9) -> str:
    """(x, y) は左上。s は一辺。"""
    color = color or C["label"]
    st = f'fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"'
    fl = f'fill="{color}"'
    p = ""
    if name == "grid":
        p = "".join(f'<rect x="{a}" y="{b}" width="7.5" height="7.5" rx="2" {st}/>' for a in (3.5, 13) for b in (3.5, 13))
    elif name == "bolt":
        p = f'<path d="M13.5 2.5 L5 13.5 H11.5 L10.5 21.5 L19 10.5 H12.5 Z" {st}/>'
    elif name == "braces":
        p = (f'<path d="M8 3.5 C5.5 3.5 6 5.5 6 8 C6 10 5.5 11.5 3.5 12 C5.5 12.5 6 14 6 16 C6 18.5 5.5 20.5 8 20.5" {st}/>'
             f'<path d="M16 3.5 C18.5 3.5 18 5.5 18 8 C18 10 18.5 11.5 20.5 12 C18.5 12.5 18 14 18 16 C18 18.5 18.5 20.5 16 20.5" {st}/>'
             f'<path d="M10 9.5 L14 14.5 M14 9.5 L10 14.5" {st}/>')
    elif name == "network":
        p = (f'<rect x="9" y="2.5" width="6" height="5" rx="1.2" {st}/>'
             f'<rect x="2.5" y="16.5" width="6" height="5" rx="1.2" {st}/>'
             f'<rect x="15.5" y="16.5" width="6" height="5" rx="1.2" {st}/>'
             f'<path d="M12 7.5 V12 M5.5 16.5 V12 H18.5 V16.5" {st}/>')
    elif name == "slider":
        p = (f'<path d="M3 6 H21 M3 12 H21 M3 18 H21" {st}/>'
             f'<circle cx="8" cy="6" r="2.4" fill="{C["bg2"]}" stroke="{color}" stroke-width="{sw}"/>'
             f'<circle cx="16" cy="12" r="2.4" fill="{C["bg2"]}" stroke="{color}" stroke-width="{sw}"/>'
             f'<circle cx="10" cy="18" r="2.4" fill="{C["bg2"]}" stroke="{color}" stroke-width="{sw}"/>')
    elif name == "list":
        p = (f'<rect x="2.5" y="3.5" width="19" height="17" rx="3" {st}/>'
             f'<path d="M7 8.5 H7.1 M10 8.5 H17 M7 12 H7.1 M10 12 H17 M7 15.5 H7.1 M10 15.5 H17" {st}/>')
    elif name == "archive":
        p = (f'<rect x="2.5" y="4" width="19" height="5" rx="1.2" {st}/>'
             f'<path d="M4 9 V19 C4 19.6 4.4 20 5 20 H19 C19.6 20 20 19.6 20 19 V9 M9.5 12.5 H14.5" {st}/>')
    elif name == "gear":
        p = f'<path d="{_gear_path()}" {st}/><circle cx="12" cy="12" r="3" {st}/>'
    elif name == "chev-l":
        p = f'<path d="M15 4.5 L7.5 12 L15 19.5" {st}/>'
    elif name == "chev-r":
        p = f'<path d="M9 4.5 L16.5 12 L9 19.5" {st}/>'
    elif name == "chev-d":
        p = f'<path d="M5 9 L12 16 L19 9" {st}/>'
    elif name == "plus":
        p = f'<path d="M12 4 V20 M4 12 H20" {st}/>'
    elif name == "lock":
        p = (f'<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.2" {fl}/>'
             f'<path d="M7.5 10.5 V7.5 C7.5 4.8 9.5 3 12 3 C14.5 3 16.5 4.8 16.5 7.5 V10.5" {st}/>')
    elif name == "unlock":
        p = (f'<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.2" {st}/>'
             f'<path d="M7.5 10.5 V7.5 C7.5 4.8 9.5 3 12 3 C14 3 15.6 4.1 16.2 5.8" {st}/>')
    elif name == "ellipsis":
        p = "".join(f'<circle cx="{cx}" cy="12" r="1.8" {fl}/>' for cx in (5.5, 12, 18.5))
    elif name == "trash":
        p = (f'<path d="M3.5 6 H20.5 M9 6 V3.5 H15 V6 M5.5 6 L6.5 20.5 H17.5 L18.5 6 M10 10 V17 M14 10 V17" {st}/>')
    elif name == "dup":
        p = (f'<rect x="8" y="8" width="13" height="13" rx="2.5" {st}/>'
             f'<path d="M16 8 V5.5 C16 4.1 14.9 3 13.5 3 H5.5 C4.1 3 3 4.1 3 5.5 V13.5 C3 14.9 4.1 16 5.5 16 H8 M14.5 11.5 V17.5 M11.5 14.5 H17.5" {st}/>')
    elif name == "clock":
        p = f'<circle cx="12" cy="12" r="9" {st}/><path d="M12 6.5 V12 L15.5 14" {st}/>'
    elif name == "warn":
        p = (f'<path d="M12 2.5 L22.5 20.5 H1.5 Z" {fl} stroke="{color}" stroke-width="1.5" stroke-linejoin="round"/>'
             f'<path d="M12 9 V14" stroke="#000" stroke-width="2.2" stroke-linecap="round"/>'
             f'<circle cx="12" cy="17.3" r="1.3" fill="#000"/>')
    elif name == "check":
        p = f'<path d="M4.5 12.5 L9.5 17.5 L19.5 6.5" {st}/>'
    elif name == "sidebar":
        p = (f'<rect x="2.5" y="4" width="19" height="16" rx="3" {st}/>'
             f'<path d="M9 4 V20 M5 8 H6.5 M5 11 H6.5 M5 14 H6.5" {st}/>')
    elif name == "search":
        p = f'<circle cx="10.5" cy="10.5" r="6.5" {st}/><path d="M15.5 15.5 L21 21" {st}/>'
    elif name == "handle":
        p = f'<path d="M4 7 H20 M4 12 H20 M4 17 H20" {st}/>'
    elif name == "undo":
        p = f'<path d="M9 5 L4 10 L9 15 M4 10 H14.5 C17.5 10 20 12.5 20 15.5 C20 18.5 17.5 20 14.5 20 H11" {st}/>'
    elif name == "redo":
        p = f'<path d="M15 5 L20 10 L15 15 M20 10 H9.5 C6.5 10 4 12.5 4 15.5 C4 18.5 6.5 20 9.5 20 H13" {st}/>'
    elif name == "power":
        p = f'<path d="M12 3 V11 M7 5.8 C4.6 7.4 3.5 9.6 3.5 12.3 C3.5 17 7.3 20.8 12 20.8 C16.7 20.8 20.5 17 20.5 12.3 C20.5 9.6 19.4 7.4 17 5.8" {st}/>'
    elif name == "xmark":
        p = f'<path d="M6 6 L18 18 M18 6 L6 18" {st}/>'
    elif name == "play":
        p = f'<path d="M7 4.5 L19.5 12 L7 19.5 Z" {fl}/>'
    elif name == "photo":
        p = (f'<rect x="2.5" y="4.5" width="19" height="15" rx="2.5" {st}/>'
             f'<circle cx="8.5" cy="9.5" r="1.8" {st}/><path d="M3 17 L9 12 L13 15.5 L16 13 L21 17" {st}/>')
    elif name == "wave":
        p = f'<path d="M3 12 H5 M7 8 V16 M10 5 V19 M13 9 V15 M16 6 V18 M19 10 V14 M21 12 H21.5" {st}/>'
    elif name == "cable":
        p = (f'<rect x="7" y="2.5" width="10" height="8" rx="1.5" {st}/>'
             f'<path d="M9.5 2.5 V5 M14.5 2.5 V5 M12 10.5 V15 C12 18 10 20.5 7 21" {st}/>')
    elif name == "antenna":
        p = (f'<circle cx="12" cy="11" r="2" {fl}/><path d="M12 13 V21" {st}/>'
             f'<path d="M7.8 6.8 C5.5 9.1 5.5 12.9 7.8 15.2 M16.2 6.8 C18.5 9.1 18.5 12.9 16.2 15.2 M4.8 3.8 C0.9 7.7 0.9 14.3 4.8 18.2 M19.2 3.8 C23.1 7.7 23.1 14.3 19.2 18.2" {st}/>')
    elif name == "text":
        p = f'<path d="M3 6 V4 H13 V6 M8 4 V20 M6 20 H10 M14 11 V10 H21 V11 M17.5 10 V20 M16 20 H19" {st}/>'
    elif name == "paint":
        p = (f'<path d="M12 3 C6.5 3 3 7 3 11.5 C3 16 6.5 20 11 20 C12.5 20 13 19 12.5 17.8 C12 16.5 12.8 15.5 14 15.5 H16.5 C19 15.5 21 13.7 21 11 C21 6.5 17 3 12 3 Z" {st}/>'
             f'<circle cx="7.5" cy="11" r="1.3" {fl}/><circle cx="10" cy="7" r="1.3" {fl}/><circle cx="15" cy="7" r="1.3" {fl}/>')
    elif name == "eye":
        p = (f'<path d="M2 12 C4.5 7 8 4.8 12 4.8 C16 4.8 19.5 7 22 12 C19.5 17 16 19.2 12 19.2 C8 19.2 4.5 17 2 12 Z" {st}/>'
             f'<circle cx="12" cy="12" r="3.3" {st}/>')
    elif name == "sun":
        rays = "".join(
            f'M{12 + 6.5 * math.cos(a):.2f} {12 + 6.5 * math.sin(a):.2f} L{12 + 9.5 * math.cos(a):.2f} {12 + 9.5 * math.sin(a):.2f} '
            for a in [i * math.pi / 4 for i in range(8)])
        p = f'<circle cx="12" cy="12" r="4" {st}/><path d="{rays}" {st}/>'
    elif name == "pages":
        p = (f'<rect x="3" y="7" width="15" height="13" rx="2.5" {st}/>'
             f'<path d="M6.5 4 H18.5 C19.9 4 21 5.1 21 6.5 V16" {st}/>')
    elif name == "wifi":
        p = (f'<path d="M2.5 9 C7.8 4 16.2 4 21.5 9 M5.8 12.5 C9.3 9.3 14.7 9.3 18.2 12.5 M9 16 C10.7 14.5 13.3 14.5 15 16" {st}/>'
             f'<circle cx="12" cy="19" r="1.5" {fl}/>')
    else:
        raise ValueError(name)
    return G(p, x, y, s / 24)


# ---------------------------------------------------------------------------
# 部品
# ---------------------------------------------------------------------------
def status_dot(cx, cy, state, r=4.5):
    col = {"ok": C["green"], "warn": C["orange"], "off": C["gray"], "err": C["red"]}[state]
    if state == "warn":
        return CIR(cx, cy, r, fill="none", stroke=col, sw=2) + f'<path d="M{cx} {cy - r} A{r} {r} 0 0 1 {cx} {cy + r} Z" fill="{col}"/>'
    if state == "off":
        return CIR(cx, cy, r - 0.8, fill="none", stroke=col, sw=1.6)
    return CIR(cx, cy, r, fill=col)


def chip(x, y, text, state=None, h=28, size=13, fill=None, color=None, mono=False, bold=False):
    """左上 (x, y)。幅を返す。"""
    pad = 12
    dotw = 14 if state else 0
    w = pad * 2 + dotw + tw(text, size, mono)
    out = R(x, y, w, h, fill or C["fill3"], r=h / 2)
    if state:
        out += status_dot(x + pad + 4, y + h / 2, state)
    out += T(x + pad + dotw, y + h / 2 + size * 0.36, text, size, 600 if bold else 500, color or C["label"], mono=mono)
    return out, w


def segmented(x, y, w, labels, sel, h=32, size=13):
    n = len(labels)
    sw = w / n
    out = R(x, y, w, h, C["fill3"], r=9)
    out += R(x + 2 + sel * sw, y + 2, sw - 4, h - 4, C["seg"], r=7)
    for i, lab in enumerate(labels):
        if i not in (sel, sel - 1) and i > 0:
            out += L(x + i * sw, y + 8, x + i * sw, y + h - 8, C["sep"], 1)
        out += T(x + i * sw + sw / 2, y + h / 2 + size * 0.36, lab, size, 600 if i == sel else 500, C["label"], "middle")
    return out


def switch(x, y, on=True):
    """左上 (x, y)、51×31。"""
    out = R(x, y, 51, 31, C["green"] if on else C["fill"], r=15.5)
    out += CIR(x + (35.5 if on else 15.5), y + 15.5, 13.5, fill="#FFFFFF")
    return out


def circle_btn(cx, cy, name, r=18, color=None, fill=None, isz=18):
    return CIR(cx, cy, r, fill=fill or C["fill3"]) + icon(name, cx - isz / 2, cy - isz / 2, isz, color or C["label"], 2.1)


def device_pill(x, y, text, h=20):
    mono = all(ord(ch) < 128 for ch in text)
    w = tw(text, 11, mono) * 1.06 + 14
    return R(x, y, w, h, C["fill3"], r=6) + T(x + 7, y + h / 2 + 4, text, 11, 500, C["label2"], mono=mono), w


def lum(hexcol: str) -> float:
    hexcol = hexcol.lstrip("#")
    r, g, b = (int(hexcol[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def button(x, y, w, h, main="", sub=None, bg=None, state=None, steps=None, r=12, fs=None, var=False):
    """ボード上のボタン。
    state: None / 'pressed' / 'selected' / 'offline' / 'empty' / 'empty-edit' / 'empty-run'
    steps: (総数, 現在 index)
    var: True なら main は変数の現在値（等幅で表示）
    """
    out = ""
    if state in ("empty", "empty-run"):
        return R(x, y, w, h, C["fill4"] if state == "empty" else "rgba(118,118,128,0.10)", r=r)
    if state == "empty-edit":
        out += R(x + 0.75, y + 0.75, w - 1.5, h - 1.5, "none", r=r, stroke=C["label3"], sw=1.5, dash="5 5")
        s = min(w, h) * 0.22
        out += icon("plus", x + w / 2 - s / 2, y + h / 2 - s / 2, s, C["label3"], 2.2)
        return out
    bg = bg or B["neutral"]
    fg = "#000000" if lum(bg) > 0.55 else "#FFFFFF"
    fg2 = "rgba(0,0,0,0.62)" if fg == "#000000" else "rgba(255,255,255,0.68)"
    bx, by, bw, bh = x, y, w, h
    if state == "pressed":
        bx, by, bw, bh = x + 3, y + 3, w - 6, h - 6
    if state == "selected":
        out += R(x - 5, y - 5, w + 10, h + 10, "none", r=r + 5, stroke=C["blue"], sw=3)
    out += R(bx, by, bw, bh, bg, r=r if state != "pressed" else r - 2)
    if bg in (B["black"], B["dark"]):
        out += R(bx + 0.5, by + 0.5, bw - 1, bh - 1, "none", r=r, stroke="rgba(255,255,255,0.14)", sw=1)
    if state == "pressed":
        out += R(bx, by, bw, bh, "rgba(255,255,255,0.18)", r=r - 2)
        out += R(bx + 1.5, by + 1.5, bw - 3, bh - 3, "none", r=r - 3, stroke="#FFFFFF", sw=3)
    unit = min(w, h * 1.05)
    fs = fs or max(12, round(unit * 0.17))
    subfs = max(11, round(unit * 0.105))
    lines = main.split("\n") if main else []
    total = len(lines) * fs * 1.12 + (subfs * 1.3 if sub else 0)
    ty = y + h / 2 - total / 2 + (subfs * 1.3 if sub else 0) + fs * 0.86
    if sub:
        out += T(x + w / 2, ty - fs * 0.86 - subfs * 0.35, sub, subfs, 600, fg2, "middle", mono=False, ls=0.3)
    for i, ln in enumerate(lines):
        out += T(x + w / 2, ty + i * fs * 1.12, ln, fs, 700 if not var else 600, fg, "middle", mono=var)
    if steps:
        n, cur = steps
        dw = 6
        gap = 5
        sx = x + w / 2 - (n * dw + (n - 1) * gap) / 2
        for i in range(n):
            out += CIR(sx + i * (dw + gap) + dw / 2, y + h - 11, dw / 2, fill=fg if i == cur else ("rgba(0,0,0,0.3)" if fg == "#000000" else "rgba(255,255,255,0.35)"))
    if state == "offline":
        out += R(x, y, w, h, "rgba(0,0,0,0.55)", r=r)
        s = max(16, unit * 0.16)
        out += icon("warn", x + w - s - 7, y + 7, s, C["orange"])
    return out


def ipad_status(w=1366):
    out = T(20, 17, "9:41", 14, 600)
    out += T(62, 17, "10月16日(金)", 14, 600)
    out += icon("wifi", w - 92, 4, 17, C["label"], 2)
    out += T(w - 66, 17, "100%", 13, 600)
    out += R(w - 32, 6, 22, 11, "none", r=3, stroke=C["label2"], sw=1) + R(w - 30, 8, 18, 7, C["label"], r=1.5)
    return out


def iphone_status(w=393):
    out = T(52, 37, "9:41", 17, 600, anchor="middle")
    out += R(w / 2 - 63, 11, 126, 37, "#000000", r=18.5)
    bx = w - 112
    for i, hh in enumerate((4, 6.5, 9, 11.5)):
        out += R(bx + i * 5, 32 - hh, 3, hh, C["label"], r=1)
    out += icon("wifi", w - 86, 19, 17, C["label"], 2)
    out += R(w - 62, 22, 26, 12, "none", r=3.5, stroke=C["label2"], sw=1) + R(w - 60, 24, 22, 8, C["label"], r=2)
    return out


def home_indicator(w, h, bw=140):
    return R(w / 2 - bw / 2, h - 13, bw, 5, C["label"], r=2.5)


def frame(content, w, h, r, ox, oy, title=None, note=None):
    cid = f"clip{ox}_{oy}"
    out = f'<defs><clipPath id="{cid}"><rect x="0" y="0" width="{w}" height="{h}" rx="{r}" ry="{r}"/></clipPath></defs>'
    inner = f'<g clip-path="url(#{cid})">{R(0, 0, w, h, C["bg"])}{content}</g>'
    inner += R(-1, -1, w + 2, h + 2, "none", r=r + 1, stroke="#3A3A3C", sw=2)
    out += G(inner, ox, oy)
    if title:
        out += T(ox, oy - 34, title, 22, 700, CANVAS_TEXT)
    if note:
        out += T(ox, oy - 12, note, 14, 400, CANVAS_TEXT2)
    return out


def doc(w, h, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f"<title>{esc(title)}</title>"
            f'{R(0, 0, w, h, CANVAS)}{body}</svg>')


# ---------------------------------------------------------------------------
# グループ化リスト（iOS inset grouped）
# ---------------------------------------------------------------------------
def glist(x, y, w, sections, sec_gap=28, card=None):
    """sections: [{header, header_r, rows:[row], footer}]
    row: {t, s, r, rc, rmono, icon:(name,bg), chev, sw, pill, h, tc, center, seg:(labels,sel,w), var, handle, sel}
    戻り値: (svg, 次の y)
    """
    out = ""
    for sec in sections:
        if sec.get("header"):
            out += T(x + 16, y + 18, sec["header"], 13, 600, C["label2"])
            if sec.get("header_r"):
                hr = sec["header_r"]
                if hr.endswith(" ▾"):
                    out += icon("chev-d", x + w - 16 - 11, y + 8, 11, C["blue"], 2.6)
                    out += T(x + w - 16 - 15, y + 18, hr[:-2], 13, 500, C["blue"], "end")
                else:
                    out += T(x + w - 16, y + 18, hr, 13, 500, C["blue"], "end")
            y += 28
        rows = sec["rows"]
        heights = [rw.get("h", 52 if rw.get("s") else 44) for rw in rows]
        total = sum(heights)
        out += R(x, y, w, total, card or C["bg2"], r=12)
        cy = y
        for i, (rw, rh) in enumerate(zip(rows, heights)):
            if rw.get("sel"):
                out += R(x, cy, w, rh, C["blue"], r=12 if len(rows) == 1 else 0)
            lx = x + 16
            if rw.get("icon"):
                nm, ibg = rw["icon"]
                out += R(lx, cy + rh / 2 - 14, 28, 28, ibg, r=7) + icon(nm, lx + 5, cy + rh / 2 - 9, 18, "#FFFFFF", 2)
                lx += 40
            if rw.get("dot"):
                out += status_dot(lx + 5, cy + rh / 2, rw["dot"], 5)
                lx += 20
            if rw.get("pill"):
                pv, pw = device_pill(lx, cy + (11 if rw.get("s") else rh / 2 - 10), rw["pill"])
                out += pv
                tx = lx + pw + 8
            else:
                tx = lx
            tc = rw.get("tc", C["label"])
            if rw.get("center"):
                out += T(x + w / 2, cy + rh / 2 + 6, rw["t"], 17, 400, tc, "middle")
            elif rw.get("s"):
                out += T(tx, cy + 22 if not rw.get("pill") else cy + 26, rw["t"], 16 if rw.get("pill") else 17, 400, tc,
                         mono=rw.get("tmono", False))
                out += T(lx, cy + rh - 13, rw["s"], 13, 400, C["label2"], mono=rw.get("smono", False))
            else:
                out += T(tx, cy + rh / 2 + 6, rw["t"], 17, 400, tc, mono=rw.get("tmono", False))
            rx = x + w - 16
            if rw.get("handle"):
                out += icon("handle", rx - 20, cy + rh / 2 - 10, 20, C["label3"], 2)
                rx -= 30
            if rw.get("chev"):
                out += icon("chev-r", rx - 12, cy + rh / 2 - 7, 14, C["label3"], 2.4)
                rx -= 22
            if rw.get("check"):
                out += icon("check", rx - 18, cy + rh / 2 - 9, 18, C["blue"], 2.6)
                rx -= 26
            if rw.get("sw") is not None:
                out += switch(rx - 51, cy + rh / 2 - 15.5, rw["sw"])
                rx -= 61
            if rw.get("seg"):
                labs, sel, sgw = rw["seg"]
                out += segmented(rx - sgw, cy + rh / 2 - 14, sgw, labs, sel, 28, 13)
                rx -= sgw + 8
            if rw.get("r"):
                out += T(rx, cy + rh / 2 + 6, rw["r"], 17, 400, rw.get("rc", C["label2"]), "end", mono=rw.get("rmono", False))
            if i < len(rows) - 1:
                sx = lx if not rw.get("icon") else x + 56
                out += L(sx, cy + rh, x + w, cy + rh, C["sep"], 0.7)
            cy += rh
        y = cy
        if sec.get("footer"):
            fl = sec["footer"] if isinstance(sec["footer"], list) else [sec["footer"]]
            for j, f in enumerate(fl):
                out += T(x + 16, y + 20 + j * 17, f, 12, 400, C["label2"])
            y += 12 + 17 * len(fl)
        y += sec_gap
    return out, y


# ---------------------------------------------------------------------------
# ボードの中身（ページ 2「本番」8×6）
# ---------------------------------------------------------------------------
SRC = ["CAM 1", "CAM 2", "CAM 3", "CAM 4", "PC 1", "PC 2", "VTR", "STILL"]


def board_page():
    """[row][col] = dict(button kwargs) or None"""
    g = [[None] * 8 for _ in range(6)]
    for c, s in enumerate(SRC):
        g[0][c] = dict(main=s, sub="PGM", bg=B["red"] if s == "CAM 2" else B["neutral"])
        g[1][c] = dict(main=s, sub="PST", bg=B["green"] if s == "CAM 3" else B["neutral"])
    g[2] = [
        dict(main="CUT", bg=B["white"]),
        dict(main="AUTO", sub="MIX 1.0s", bg=B["yellow"], steps=(2, 0)),
        dict(main="FTB", bg=B["black"]),
        dict(main="DSK 1", sub="ON", bg=B["blue"]),
        dict(main="PinP 1", sub="OFF", bg=B["neutral"]),
        dict(main="PinP 2", sub="OFF", bg=B["neutral"]),
        dict(main="SPLIT", sub="OFF", bg=B["neutral"]),
        dict(main="1.0s", sub="TIME", bg=B["dark"], var=True),
    ]
    g[3] = [
        dict(main="MIC 1", sub="ON", bg=B["teal"]),
        dict(main="MIC 2", sub="OFF", bg=B["neutral"]),
        dict(main="BGM", sub="FADE", bg=B["orange"], steps=(3, 1)),
        dict(main="PC 音声", sub="OFF", bg=B["neutral"]),
        dict(main="全ミュート", bg=B["maroon"]),
        None,
        None,
        dict(main="00:12:34", sub="REC", bg=B["red"], state="offline", var=True),
    ]
    g[4] = [
        dict(main="OPENING\n一式", sub="マクロ", bg=B["purple"]),
        dict(main="VTR\n再生", bg=B["indigo"]),
        dict(main="本番\nSTART", bg=B["indigo"]),
        dict(main="休憩\nSTILL", bg=B["indigo"]),
        None,
        None,
        dict(main="→ VTR", sub="ページ", bg=B["dark"]),
        dict(main="→ 音声", sub="ページ", bg=B["dark"]),
    ]
    g[5] = [
        dict(main="CAM 2", sub="現在の PGM", bg=B["dark"], var=True),
        dict(main="CAM 3", sub="現在の PST", bg=B["dark"], var=True),
        dict(main="IN 5", sub="ATEM PGM", bg=B["dark"], var=True),
        None, None, None, None, None,
    ]
    return g


def draw_grid(x0, y0, cw, ch, gap, cols=8, rows=6, mode="run", col_offset=0, ncols=None,
              selected=None, pressed=None, r=12, fs=None, clip_rows=None):
    g = board_page()
    out = ""
    ncols = ncols or cols
    for rr in range(rows if clip_rows is None else clip_rows):
        for cc in range(ncols):
            c = cc + col_offset
            x = x0 + cc * (cw + gap)
            y = y0 + rr * (ch + gap)
            spec = g[rr][c] if rr < 6 and c < 8 else None
            if spec is None:
                out += button(x, y, cw, ch, state="empty-edit" if mode == "edit" else "empty-run", r=r)
                continue
            kw = dict(spec)
            if selected == (rr, c):
                kw["state"] = "selected"
            if pressed == (rr, c):
                kw["state"] = "pressed"
            out += button(x, y, cw, ch, r=r, fs=fs, **kw)
    return out


def page_bar(cx, y, sel=1, pages=("OPENING", "本番", "VTR", "音声"), h=36):
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


# ---------------------------------------------------------------------------
# iPad サイドバー
# ---------------------------------------------------------------------------
def sidebar(selected="page2", h=1024, w=320):
    out = R(0, 0, w, h, C["bg2"])
    out += T(20, 64, "DEMO-SHOW", 22, 700)
    out += icon("chev-d", 20 + tw("DEMO-SHOW", 22) * 1.12 + 10, 50, 16, C["label2"], 2.4)
    out += T(20, 86, "ショーファイル · 自動保存 19:41", 13, 400, C["label2"])
    out += icon("sidebar", w - 44, 38, 24, C["blue"])

    def item(y, ic, label, key, right=None, rc=None, dot=None, badge=None, chev=False):
        o = ""
        sel = key == selected
        if sel:
            o += R(10, y, w - 20, 44, C["blue"], r=10)
        col = C["label"] if sel else C["blue"]
        o += icon(ic, 22, y + 11, 22, C["label"] if sel else col)
        o += T(58, y + 28, label, 17, 600 if sel else 400, C["label"])
        rx = w - 26
        if chev:
            o += icon("chev-d", rx - 12, y + 16, 13, C["label3"], 2.4)
            rx -= 22
        if badge:
            bw = max(22, tw(badge, 13) + 12)
            o += R(rx - bw, y + 12, bw, 20, C["fill"], r=10) + T(rx - bw / 2, y + 27, badge, 13, 600, C["label"], "middle")
        if right:
            o += T(rx, y + 28, right, 15, 400, rc or (C["label"] if sel else C["label2"]), "end")
            rx -= tw(right, 15) + 8
        if dot:
            o += status_dot(rx - 4, y + 22, dot, 4.5)
        return o

    def section(y, label):
        return T(22, y + 22, label, 13, 600, C["label2"])

    def page(y, n, name, key):
        o = ""
        sel = key == selected
        if sel:
            o += R(10, y, w - 20, 40, C["blue"], r=10)
        o += R(58, y + 9, 22, 22, C["fill"] if not sel else "rgba(255,255,255,0.25)", r=6)
        o += T(69, y + 25, str(n), 13, 700, C["label"], "middle")
        o += T(92, y + 26, name, 16, 600 if sel else 400, C["label"])
        return o

    y = 112
    out += section(y, "ボード")
    out += item(144, "grid", "ボード", "board", chev=True)
    for i, (n, nm) in enumerate([(1, "OPENING"), (2, "本番"), (3, "VTR"), (4, "音声")]):
        out += page(188 + i * 40, n, nm, f"page{n}")
    out += icon("plus", 61, 358, 16, C["blue"], 2.4) + T(92, 371, "ページを追加", 15, 400, C["blue"])
    out += section(396, "自動化")
    out += item(428, "bolt", "オートメーション", "auto", badge="3")
    out += item(472, "braces", "変数", "vars")
    out += section(524, "接続")
    out += item(556, "network", "機器", "devices", right="4/5", dot="warn")
    out += item(600, "slider", "外部コントローラ", "surfaces", right="なし")
    out += section(652, "システム")
    out += item(684, "list", "ログ", "log", right="警告 1", rc=C["orange"])
    out += item(728, "archive", "バックアップ", "backup")
    out += item(772, "gear", "設定", "settings")
    # 下部の状況カード
    cy = h - 120
    out += R(12, cy, w - 24, 92, C["bg3"], r=12)
    out += T(28, cy + 26, "いまの状態", 13, 600, C["label2"])
    out += status_dot(33, cy + 48, "ok") + T(46, cy + 53, "接続 4", 15, 500)
    out += status_dot(123, cy + 48, "warn") + T(136, cy + 53, "再接続中 1", 15, 500)
    out += icon("sun", 26, cy + 62, 15, C["label2"], 1.8) + T(46, cy + 75, "画面スリープ防止 オン", 13, 400, C["label2"])
    return out


# ---------------------------------------------------------------------------
# 画面: iPad
# ---------------------------------------------------------------------------
IW, IH = 1366, 1024


def ipad_board_run():
    s = ""
    s += sidebar("page2")
    mx = 320
    s += L(mx, 0, mx, IH, C["sep"], 0.7)
    # ツールバー
    s += circle_btn(mx + 42, 50, "chev-l", 18, isz=16) + circle_btn(mx + 86, 50, "chev-r", 18, isz=16)
    s += T(mx + 120, 47, "本番", 17, 600) + T(mx + 120, 65, "ページ 2 / 4 · 8×6", 12, 400, C["label2"])
    s += segmented(1082, 34, 168, ["運用", "編集"], 0)
    s += circle_btn(1286, 50, "unlock", 18, isz=17) + circle_btn(1330, 50, "ellipsis", 18, isz=18)
    # 機器ステータス
    x = mx + 24
    for name, st in [("DEMO-SW-A", "ok"), ("DEMO-SW-B", "ok"), ("DEMO-ATEM", "ok"), ("DEMO-MIXER", "ok"), ("DEMO-REC 再接続中", "warn")]:
        c, w = chip(x, 84, name, st)
        s += c
        x += w + 8
    s += T(1342, 104, "19:42:08", 15, 500, C["label2"], "end", mono=True)
    # グリッド
    s += draw_grid(mx + 24, 128, 114, 114, 12, pressed=(2, 0))
    s += page_bar(mx + 523, 900)
    s += T(mx + 523, 962, "左右スワイプでもページを切り替え", 12, 400, C["label3"], "middle")
    s += home_indicator(IW, IH, 320)
    s += ipad_status()
    return s


def ipad_board_edit():
    s = ""
    gw = 966
    # ツールバー
    s += icon("sidebar", 22, 38, 24, C["blue"])
    s += icon("undo", 70, 39, 22, C["blue"]) + icon("redo", 108, 39, 22, C["label3"])
    s += T(gw / 2, 47, "本番 を編集", 17, 600, anchor="middle") + T(gw / 2, 65, "ページ 2 / 4", 12, 400, C["label2"], "middle")
    s += segmented(gw - 290, 34, 168, ["運用", "編集"], 1)
    s += R(gw - 108, 33, 84, 34, C["blue"], r=17) + T(gw - 66, 55, "完了", 16, 600, anchor="middle")
    # ヒントとグリッド設定
    s += T(24, 103, "タップで選択 · 長押しでドラッグ移動 · 空きマスの ＋ で追加", 13, 400, C["label2"])
    c, w = chip(gw - 24 - 150, 86, "グリッド 8×6", None)
    s += c
    s += icon("chev-d", gw - 24 - 150 + w - 4, 94, 12, C["label2"], 2.4)
    s += draw_grid(24, 128, 104, 104, 12, mode="edit", selected=(2, 1))
    s += page_bar(gw / 2, 860)
    s += T(gw / 2, 922, "ページ名を長押しで 名前変更 / 並べ替え / 複製 / 削除", 12, 400, C["label3"], "middle")
    # インスペクタ
    ix = gw
    s += R(ix, 0, IW - ix, IH, C["bg2"]) + L(ix, 0, ix, IH, C["sep"], 0.7)
    s += T(ix + 20, 47, "ボタン", 17, 600) + T(ix + 20, 65, "ページ 2 · 3行目 2列目", 12, 400, C["label2"])
    s += circle_btn(IW - 80, 50, "dup", 18, color=C["blue"], isz=17) + circle_btn(IW - 36, 50, "ellipsis", 18, color=C["blue"])
    cx = ix + (IW - ix) / 2
    s += button(cx - 56, 92, 112, 112, "AUTO", "MIX 1.0s", B["yellow"], steps=(2, 0))
    s += icon("play", cx - 52, 220, 12, C["blue"]) + T(cx - 36, 231, "タップで試し押し（機器に送信）", 12, 500, C["blue"])
    s += segmented(ix + 20, 248, IW - ix - 40, ["スタイル", "動作", "状態表示"], 1)
    # ステップ
    y = 300
    s += T(ix + 36, y + 14, "ステップ", 13, 600, C["label2"])
    y += 24
    c1, w1 = chip(ix + 20, y, "1  MIX", None, h=32, size=14, fill=C["blue"], bold=True)
    c2, w2 = chip(ix + 28 + w1, y, "2  WIPE", None, h=32, size=14, fill=C["bg4"])
    s += c1 + c2 + circle_btn(ix + 36 + w1 + w2 + 16, y + 16, "plus", 16, color=C["blue"], isz=14)
    y += 44
    g, y = glist(ix + 20, y, IW - ix - 40, [
        {"rows": [{"t": "押すたびに次のステップへ", "sw": True}], "footer": "最後のステップの次は 1 に戻る"},
        {"header": "押した時", "header_r": "順番に実行 ▾", "rows": [
            {"pill": "DEMO-SW-A", "t": "トランジション設定", "s": "種類 MIX · 時間 1.0 秒", "h": 60, "handle": True},
            {"pill": "DEMO-SW-A", "t": "AUTO を実行", "s": "トランジションを開始", "h": 60, "handle": True},
            {"pill": "待つ", "t": "1.5 秒", "s": "前の操作のあとに待機", "h": 60, "handle": True},
            {"pill": "DEMO-MIXER", "t": "OSC を送信", "s": "/demo/ch/1/on  1", "smono": True, "h": 60, "handle": True},
            {"t": "＋ 操作を追加", "tc": C["blue"]},
        ]},
        {"header": "離した時", "rows": [{"t": "操作なし", "tc": C["label3"], "r": "＋ 追加", "rc": C["blue"]}]},
        {"header": "長押し（0.8 秒以上）", "rows": [{"t": "＋ 操作を追加", "tc": C["blue"]}]},
    ], sec_gap=20, card=C["bg3"])
    s += g
    s += home_indicator(IW, IH, 320)
    s += ipad_status()
    return s


def ipad_board_show():
    s = ""
    s += R(24, 34, 30, 30, C["blue"], r=8) + T(39, 55, "2", 16, 700, anchor="middle")
    s += T(64, 56, "本番", 22, 700)
    s += T(IW / 2, 58, "19:42:08", 24, 600, mono=True, anchor="middle")
    c, w = chip(IW - 24 - 132 - 12 - 132, 34, "機器 4/5", "warn", h=32, size=14)
    s += c
    s += R(IW - 24 - 132, 34, 132, 32, C["fill3"], r=16) + icon("lock", IW - 24 - 120, 41, 17, C["label"]) + T(IW - 24 - 98, 55, "ロック中", 14, 600)
    s += draw_grid(24, 82, 154, 132, 12, r=14, fs=24, pressed=None)
    s += page_bar(IW / 2, 948)
    s += T(IW - 24, 1000, "ロック解除: 右上を長押し", 12, 400, C["label3"], "end")
    s += home_indicator(IW, IH, 320)
    s += ipad_status()
    return s


def ipad_devices():
    s = ""
    s += sidebar("devices")
    # 一覧カラム
    lx, lw = 320, 390
    s += L(lx, 0, lx, IH, C["sep"], 0.7)
    s += T(lx + 20, 118, "機器", 34, 700)
    s += circle_btn(lx + lw - 36, 50, "plus", 18, color=C["blue"], isz=16)
    s += R(lx + 16, 134, lw - 32, 36, C["fill3"], r=10) + icon("search", lx + 26, 143, 18, C["label2"]) + T(lx + 50, 158, "検索", 17, 400, C["label2"])
    rows = [
        ("DEMO-SW-A", "Roland V-160HD · LAN", "接続中", "ok", True),
        ("DEMO-SW-B", "Roland V-80HD · USB", "接続中", "ok", False),
        ("DEMO-ATEM", "Blackmagic ATEM · LAN", "接続中", "ok", False),
        ("DEMO-MIXER", "汎用 OSC · UDP", "送信のみ", "ok", False),
        ("DEMO-REC", "汎用 TCP · LAN", "再接続中", "warn", False),
        ("DEMO-HTTP", "汎用 HTTP", "無効", "off", False),
    ]
    y = 188
    cw = lw - 32
    s += R(lx + 16, y, cw, 72 * len(rows), C["bg2"], r=12)
    for i, (n, sub, stt, st, sel) in enumerate(rows):
        ry = y + i * 72
        if sel:
            s += f'<path d="M{lx + 16} {ry + 12} Q{lx + 16} {ry} {lx + 28} {ry} H{lx + 16 + cw - 12} Q{lx + 16 + cw} {ry} {lx + 16 + cw} {ry + 12} V{ry + 72} H{lx + 16} Z" fill="{C["blue"]}"/>'
        s += status_dot(lx + 38, ry + 26, st, 5.5)
        s += T(lx + 54, ry + 31, n, 17, 600)
        s += T(lx + 54, ry + 54, sub, 13, 400, C["label"] if sel else C["label2"])
        col = {"ok": C["green"], "warn": C["orange"], "off": C["label2"]}[st]
        s += T(lx + 16 + cw - 16, ry + 31, stt, 13, 600, C["label"] if sel else col, "end")
        if i < len(rows) - 1 and not sel:
            s += L(lx + 54, ry + 72, lx + 16 + cw, ry + 72, C["sep"], 0.7)
    y += 72 * len(rows) + 22
    s += icon("check", lx + 22, y - 4, 16, C["green"], 2.6) + T(lx + 44, y + 9, "ローカルネットワーク: 許可済み", 13, 400, C["label2"])
    s += T(lx + 22, y + 32, "この iPad: 192.168.10.5 · Wi‑Fi DEMO-NET", 13, 400, C["label2"])
    # 詳細
    dx = lx + lw
    dw = IW - dx
    s += L(dx, 0, dx, IH, C["sep"], 0.7)
    s += T(dx + dw / 2, 50, "DEMO-SW-A", 17, 600, anchor="middle")
    s += T(IW - 24, 56, "診断", 17, 400, C["blue"], "end")
    cx0 = dx + 24
    cwid = dw - 48
    s += R(cx0, 84, cwid, 108, C["bg2"], r=12)
    s += status_dot(cx0 + 24, 118, "ok", 7) + T(cx0 + 40, 126, "接続中", 22, 700)
    s += R(cx0 + cwid - 112, 102, 96, 34, C["fill3"], r=17) + T(cx0 + cwid - 64, 124, "再接続", 15, 600, C["blue"], "middle")
    for i, (k, v) in enumerate([("応答", "4 ms"), ("最終受信", "0.2 秒前"), ("接続時間", "01:12:44")]):
        s += T(cx0 + 24 + i * 200, 160, k, 12, 500, C["label2"]) + T(cx0 + 24 + i * 200, 182, v, 17, 600, mono=True)
    g, y = glist(cx0, 214, cwid, [
        {"header": "接続設定", "rows": [
            {"t": "種類", "r": "Roland V-160HD", "chev": True},
            {"t": "名前", "r": "DEMO-SW-A", "rc": C["label"]},
            {"t": "接続方式", "seg": (["LAN", "USB", "Bluetooth"], 0, 270)},
            {"t": "IP アドレス", "r": "192.168.10.20", "rmono": True, "rc": C["label"]},
            {"t": "ポート", "r": "8023", "rmono": True, "rc": C["label"]},
            {"t": "切れたら自動で再接続", "sw": True},
        ], "footer": "値の根拠と実機での確認結果は「診断」で見られます"},
        {"header": "読み取っている状態", "header_r": "変数一覧", "rows": [
            {"t": "PGM 入力", "s": "{DEMO-SW-A.pgm}", "smono": True, "r": "SDI 2", "rmono": True, "rc": C["label"]},
            {"t": "PST 入力", "s": "{DEMO-SW-A.pst}", "smono": True, "r": "SDI 3", "rmono": True, "rc": C["label"]},
            {"t": "トランジション時間", "s": "{DEMO-SW-A.trans_time}", "smono": True, "r": "1.0s", "rmono": True, "rc": C["label"]},
        ]},
        {"rows": [{"t": "この機器を使っているボタン", "r": "14 個", "chev": True}]},
        {"rows": [{"t": "機器を削除", "tc": C["red"], "center": True}]},
    ], sec_gap=22)
    s += g
    s += home_indicator(IW, IH, 320)
    s += ipad_status()
    return s


def ipad_automation():
    s = ""
    s += sidebar("auto")
    lx, lw = 320, 390
    s += L(lx, 0, lx, IH, C["sep"], 0.7)
    s += T(lx + 20, 118, "オートメーション", 34, 700)
    s += circle_btn(lx + lw - 36, 50, "plus", 18, color=C["blue"], isz=16)
    items = [
        ("clock", C["orange"], "本番 START を実行", "時刻 · 毎日 19:00:00", True, False),
        ("bolt", C["purple"], "PGM が VTR になったら", "状態の変化 · DEMO-SW-A", True, True),
        ("power", C["green"], "起動したとき", "アプリ起動 · 全機器に接続", True, False),
        ("warn", C["red"], "DEMO-REC が切れたら", "接続の変化 · ログに警告", False, False),
    ]
    y = 140
    cw = lw - 32
    s += R(lx + 16, y, cw, 72 * len(items), C["bg2"], r=12)
    for i, (ic, col, t, sub, on, sel) in enumerate(items):
        ry = y + i * 72
        if sel:
            s += R(lx + 16, ry, cw, 72, C["blue"])
        s += R(lx + 30, ry + 22, 28, 28, col, r=7) + icon(ic, lx + 35, ry + 27, 18, "#FFFFFF" if ic != "warn" else "#FFFFFF", 2)
        s += T(lx + 70, ry + 31, t, 16, 600) + T(lx + 70, ry + 53, sub, 13, 400, C["label"] if sel else C["label2"])
        s += switch(lx + 16 + cw - 16 - 51, ry + 20, on)
        if i < len(items) - 1 and not sel:
            s += L(lx + 70, ry + 72, lx + 16 + cw, ry + 72, C["sep"], 0.7)
    s += T(lx + 22, y + 72 * len(items) + 26, "アプリが前面にある間だけ動きます（iOS の制約）", 12, 400, C["label2"])
    dx = lx + lw
    dw = IW - dx
    s += L(dx, 0, dx, IH, C["sep"], 0.7)
    s += T(dx + dw / 2, 50, "PGM が VTR になったら", 17, 600, anchor="middle")
    s += R(IW - 24 - 104, 33, 104, 34, C["fill3"], r=17) + icon("play", IW - 24 - 92, 43, 14, C["blue"]) + T(IW - 24 - 72, 55, "テスト", 15, 600, C["blue"])
    cx0 = dx + 24
    cwid = dw - 48
    g, y = glist(cx0, 86, cwid, [
        {"header": "きっかけ", "rows": [
            {"t": "種類", "r": "状態の変化", "chev": True},
            {"t": "機器", "r": "DEMO-SW-A", "chev": True},
            {"t": "項目", "r": "PGM 入力", "chev": True},
        ]},
        {"header": "条件（すべて満たすとき）", "rows": [
            {"t": "{DEMO-SW-A.pgm}  が  VTR", "tmono": True, "chev": True},
            {"t": "{DEMO-SW-A.connected}  が  はい", "tmono": True, "chev": True},
            {"t": "＋ 条件を追加", "tc": C["blue"]},
        ]},
        {"header": "動作", "header_r": "順番に実行 ▾", "rows": [
            {"pill": "DEMO-MIXER", "t": "OSC を送信", "s": "VTR 音声を ON  ·  /demo/ch/7/on 1", "h": 60, "handle": True},
            {"pill": "DEMO-MIXER", "t": "OSC を送信", "s": "MIC 1 を下げる  ·  /demo/ch/1/fader 0.0", "h": 60, "handle": True},
            {"pill": "ボード", "t": "ページを移動", "s": "3  VTR", "h": 60, "handle": True},
            {"t": "＋ 操作を追加", "tc": C["blue"]},
        ]},
        {"rows": [{"t": "同じきっかけの連続発火を防ぐ", "r": "1.0 秒", "chev": True}],
         "footer": "条件が成り立った瞬間に 1 回だけ実行します"},
    ], sec_gap=22)
    s += g
    s += home_indicator(IW, IH, 320)
    s += ipad_status()
    return s


def ipad_variables():
    s = ""
    s += sidebar("vars")
    mx = 320
    s += L(mx, 0, mx, IH, C["sep"], 0.7)
    s += T(mx + 24, 118, "変数", 34, 700)
    s += circle_btn(IW - 36, 50, "plus", 18, color=C["blue"], isz=16)
    s += segmented(mx + 24, 140, 320, ["機器の変数", "自分で作る変数"], 0)
    s += R(IW - 24 - 300, 138, 300, 36, C["fill3"], r=10) + icon("search", IW - 314, 147, 18, C["label2"]) + T(IW - 290, 162, "変数を検索", 17, 400, C["label2"])
    cols = [("変数", mx + 44), ("内容", mx + 404), ("現在値", mx + 640), ("使用", IW - 60)]
    y = 202
    s += R(mx + 24, y, IW - mx - 48, 40 + 52 * 9, C["bg2"], r=12)
    for name, cx in cols:
        s += T(cx, y + 26, name, 13, 600, C["label2"], "end" if name == "使用" else "start")
    s += L(mx + 24, y + 40, IW - 24, y + 40, C["sep"], 0.7)
    data = [
        ("{DEMO-SW-A.pgm}", "PGM 入力", "SDI 2", "6", None),
        ("{DEMO-SW-A.pst}", "PST 入力", "SDI 3", "4", None),
        ("{DEMO-SW-A.trans_time}", "トランジション時間", "1.0s", "2", None),
        ("{DEMO-SW-A.connected}", "接続しているか", "はい", "1", None),
        ("{DEMO-ATEM.pgm}", "PGM 入力", "IN 5", "1", None),
        ("{DEMO-REC.timecode}", "録画時間", "00:12:34", "1", "古い値（再接続中）"),
        ("{app.time}", "現在時刻", "19:42:08", "2", None),
        ("{app.page}", "表示中のページ", "2", "0", None),
        ("{my.part}", "自分で作る変数", "第2部", "3", None),
    ]
    for i, (v, d, val, use, warn) in enumerate(data):
        ry = y + 40 + i * 52
        s += T(cols[0][1], ry + 32, v, 15, 500, C["teal"], mono=True)
        s += T(cols[1][1], ry + 32, d, 15, 400)
        s += T(cols[2][1], ry + 32, val, 15, 600, C["orange"] if warn else C["label"], mono=True)
        if warn:
            s += T(cols[2][1] + tw(val, 15, True) + 10, ry + 31, warn, 12, 500, C["orange"])
        s += T(cols[3][1], ry + 32, use, 15, 400, C["label2"], "end")
        if i < len(data) - 1:
            s += L(mx + 44, ry + 52, IW - 24, ry + 52, C["sep"], 0.7)
    y = y + 40 + 52 * len(data) + 26
    s += T(mx + 40, y, "ボタンの文字に {機器名.変数名} と書くと、現在値に置き換わります（例: PGM {DEMO-SW-A.pgm} → PGM SDI 2）", 13, 400, C["label2"])
    s += T(mx + 40, y + 20, "値の書式は {DEMO-REC.timecode|hh:mm:ss} のように | の後ろで指定", 13, 400, C["label2"])
    s += home_indicator(IW, IH, 320)
    s += ipad_status()
    return s


# ---------------------------------------------------------------------------
# 画面: iPhone
# ---------------------------------------------------------------------------
PW, PH = 393, 852


def tabbar(sel, w=PW, h=PH):
    tabs = [("grid", "ボード"), ("network", "機器"), ("bolt", "自動化"), ("braces", "変数"), ("gear", "設定")]
    x0, x1 = 20, w - 20
    y0 = h - 34 - 62
    out = R(x0, y0, x1 - x0, 62, "rgba(44,44,46,0.94)", r=31, stroke="rgba(255,255,255,0.10)", sw=1)
    tw_ = (x1 - x0 - 8) / len(tabs)
    for i, (ic, lab) in enumerate(tabs):
        cx = x0 + 4 + tw_ * i + tw_ / 2
        if i == sel:
            out += R(cx - tw_ / 2 + 2, y0 + 4, tw_ - 4, 54, "rgba(255,255,255,0.10)", r=27)
        col = C["blue"] if i == sel else C["label"]
        out += icon(ic, cx - 12, y0 + 9, 24, col, 2)
        out += T(cx, y0 + 50, lab, 10, 600, col, "middle")
    return out


def iphone_board(dim=False):
    s = iphone_status()
    s += circle_btn(36, 76, "unlock", 18, isz=16)
    s += T(PW / 2 - 8, 82, "本番", 17, 600, anchor="middle") + icon("chev-d", PW / 2 + 12, 70, 14, C["label2"], 2.6)
    s += T(PW - 20, 82, "編集", 17, 400, C["blue"], "end")
    x = 16
    for name, st in [("DEMO-SW-A", "ok"), ("DEMO-ATEM", "ok"), ("DEMO-REC", "warn"), ("DEMO-MIXER", "ok")]:
        c, w = chip(x, 104, name, st, h=26, size=12)
        s += c
        x += w + 6
    s += draw_grid(18, 144, 82, 82, 10, cols=8, rows=6, ncols=4, col_offset=0, fs=15)
    s += segmented(PW / 2 - 90, 700, 180, ["1–4 列", "5–8 列"], 0, 28, 12)
    s += T(PW / 2, 744, "左右スワイプで 5–8 列へ", 11, 400, C["label3"], "middle")
    s += tabbar(0)
    s += home_indicator(PW, PH)
    return s


def iphone_pages():
    s = iphone_board()
    s += R(0, 0, PW, PH, "rgba(0,0,0,0.45)")
    top = 392
    s += f'<path d="M0 {top + 38} Q0 {top} 38 {top} H{PW - 38} Q{PW} {top} {PW} {top + 38} V{PH} H0 Z" fill="{C["bg2"]}"/>'
    s += R(PW / 2 - 18, top + 6, 36, 5, C["label3"], r=2.5)
    s += T(20, top + 44, "編集", 17, 400, C["blue"])
    s += T(PW / 2, top + 44, "ページ", 17, 600, anchor="middle")
    s += circle_btn(PW - 36, top + 38, "xmark", 15, color=C["label2"], isz=12)
    pages = [("OPENING", 12), ("本番", 31), ("VTR", 9), ("音声", 14)]
    y = top + 68
    s += R(16, y, PW - 32, 64 * 4, C["bg3"], r=12)
    pal = [B["red"], B["green"], B["neutral"], B["yellow"], B["indigo"], B["teal"], B["purple"], B["orange"]]
    for i, (nm, cnt) in enumerate(pages):
        ry = y + i * 64
        # ミニサムネイル（8×6）
        for rr in range(6):
            for cc in range(8):
                k = (rr * 8 + cc + i * 7) % 11
                col = pal[(rr + cc + i) % len(pal)] if (k < 7 or i == 1) and not (i == 1 and (rr, cc) in [(3, 5), (3, 6), (4, 4), (4, 5)]) else "rgba(118,118,128,0.25)"
                if i == 1:
                    spec = board_page()[rr][cc]
                    col = spec["bg"] if spec else "rgba(118,118,128,0.25)"
                s += R(32 + cc * 5.5, ry + 15 + rr * 5.5, 4.5, 4.5, col, r=1)
        s += T(92, ry + 28, f"{i + 1}  {nm}", 17, 600 if i == 1 else 400)
        s += T(92, ry + 48, f"{cnt} ボタン · 8×6", 13, 400, C["label2"])
        if i == 1:
            s += icon("check", PW - 50, ry + 23, 18, C["blue"], 2.6)
        if i < 3:
            s += L(92, ry + 64, PW - 16, ry + 64, C["sep"], 0.7)
    y += 64 * 4 + 12
    s += R(16, y, PW - 32, 44, C["bg3"], r=12) + icon("plus", 32, y + 14, 16, C["blue"], 2.4) + T(58, y + 28, "ページを追加", 17, 400, C["blue"])
    s += T(PW / 2, y + 72, "ボード上で左右スワイプしても切り替わります", 12, 400, C["label2"], "middle")
    s += home_indicator(PW, PH)
    return s


IPL_W, IPL_H = 852, 393


def iphone_board_landscape():
    s = ""
    s += T(70, 36, "本番", 17, 600) + icon("chev-d", 112, 24, 14, C["label2"], 2.6)
    x = 150
    for name, st in [("SW-A", "ok"), ("ATEM", "ok"), ("REC", "warn")]:
        c, w = chip(x, 16, name, st, h=26, size=12)
        s += c
        x += w + 6
    s += circle_btn(IPL_W - 120, 29, "unlock", 16, isz=15) + T(IPL_W - 70, 35, "編集", 17, 400, C["blue"], "end")
    s += draw_grid(70, 54, 82, 72, 8, cols=8, rows=6, fs=15, clip_rows=5)
    s += R(0, IPL_H - 40, IPL_W, 40, "rgba(0,0,0,0.0)")
    s += home_indicator(IPL_W, IPL_H, 180)
    return s


def iphone_edit_header(title="ボタンを編集"):
    s = iphone_status()
    s += T(20, 82, "キャンセル", 17, 400, C["blue"])
    s += T(PW / 2, 82, title, 17, 600, anchor="middle")
    s += R(PW - 20 - 64, 62, 64, 32, C["blue"], r=16) + T(PW - 52, 83, "完了", 16, 600, anchor="middle")
    return s


def iphone_edit_style():
    s = R(0, 0, PW, PH, C["bg"]) + iphone_edit_header()
    s += button(PW / 2 - 50, 108, 100, 100, "SDI 2", "PGM", B["red"], var=True, fs=22)
    s += T(PW / 2, 232, "タップで試し押し", 12, 500, C["blue"], "middle")
    s += segmented(16, 246, PW - 32, ["スタイル", "動作", "状態表示"], 0)
    y = 294
    s += T(32, y + 12, "文字", 13, 600, C["label2"])
    y += 22
    s += R(16, y, PW - 32, 92, C["bg2"], r=12)
    s += T(32, y + 30, "PGM", 17, 400) + T(32, y + 54, "{DEMO-SW-A.pgm}", 17, 500, C["teal"], mono=True)
    s += R(PW - 16 - 112, y + 54, 100, 30, C["fill3"], r=15) + T(PW - 16 - 62, y + 74, "{ } 変数", 14, 600, C["blue"], "middle")
    y += 92 + 12
    g, y = glist(16, y, PW - 32, [
        {"rows": [
            {"t": "大きさ", "seg": (["自動", "小", "中", "大"], 0, 180)},
            {"t": "位置", "seg": (["上", "中央", "下"], 1, 150)},
        ]},
    ], sec_gap=18)
    s += g
    s += T(32, y + 12, "背景色", 13, 600, C["label2"])
    y += 22
    s += R(16, y, PW - 32, 104, C["bg2"], r=12)
    sw = [B["red"], B["green"], B["blue"], B["yellow"], B["orange"], B["purple"], B["teal"], B["indigo"], B["neutral"], B["dark"], B["white"], B["maroon"]]
    for i, col in enumerate(sw):
        cx = 44 + (i % 6) * 58
        cy = y + 28 + (i // 6) * 48
        s += CIR(cx, cy, 16, fill=col, stroke="rgba(255,255,255,0.15)", sw=1)
        if i == 0:
            s += CIR(cx, cy, 20.5, fill="none", stroke=C["label"], sw=2.5)
    y += 104 + 18
    g, y = glist(16, y, PW - 32, [
        {"rows": [
            {"t": "文字色", "r": "自動（背景で白/黒）", "chev": True},
            {"t": "画像", "r": "なし", "chev": True},
        ]},
    ], sec_gap=0)
    s += g
    s += home_indicator(PW, PH)
    return s


def iphone_edit_action():
    s = R(0, 0, PW, PH, C["bg"]) + iphone_edit_header()
    s += button(PW / 2 - 50, 108, 100, 100, "AUTO", "MIX 1.0s", B["yellow"], steps=(2, 0), fs=22)
    s += T(PW / 2, 232, "タップで試し押し", 12, 500, C["blue"], "middle")
    s += segmented(16, 246, PW - 32, ["スタイル", "動作", "状態表示"], 1)
    y = 292
    c1, w1 = chip(16, y, "1  MIX", None, h=30, size=14, fill=C["blue"], bold=True)
    c2, w2 = chip(24 + w1, y, "2  WIPE", None, h=30, size=14)
    s += c1 + c2 + circle_btn(32 + w1 + w2 + 15, y + 15, "plus", 15, color=C["blue"], isz=13)
    s += T(PW - 20, y + 20, "ステップ", 13, 600, C["label2"], "end")
    y += 44
    g, y = glist(16, y, PW - 32, [
        {"header": "押した時", "header_r": "順番に実行 ▾", "rows": [
            {"pill": "DEMO-SW-A", "t": "トランジション設定", "s": "MIX · 1.0 秒", "h": 60, "handle": True},
            {"pill": "DEMO-SW-A", "t": "AUTO を実行", "s": "トランジションを開始", "h": 60, "handle": True},
            {"pill": "待つ", "t": "1.5 秒", "s": "前の操作のあとに待機", "h": 60, "handle": True},
            {"t": "＋ 操作を追加", "tc": C["blue"]},
        ]},
        {"header": "離した時", "rows": [{"t": "操作なし", "tc": C["label3"], "r": "＋ 追加", "rc": C["blue"]}]},
        {"header": "長押し（0.8 秒以上）", "rows": [{"t": "＋ 操作を追加", "tc": C["blue"]}]},
    ], sec_gap=16)
    s += g
    s += home_indicator(PW, PH)
    return s


def iphone_edit_feedback():
    s = R(0, 0, PW, PH, C["bg"]) + iphone_edit_header()
    s += button(PW / 2 - 50, 108, 100, 100, "CAM 1", "PGM", B["neutral"], fs=22)
    s += T(PW / 2, 232, "いまの見た目（どれにも当てはまらない）", 12, 500, C["label2"], "middle")
    s += segmented(16, 246, PW - 32, ["スタイル", "動作", "状態表示"], 2)
    y = 294
    s += T(32, y + 12, "機器の状態でボタンの見た目を変えます。上ほど優先。", 13, 400, C["label2"])
    y += 26
    cards = [
        ("DEMO-SW-A", "PGM 入力 が CAM 1", "背景を赤に", B["red"], "PGM", True),
        ("DEMO-SW-A", "PST 入力 が CAM 1", "背景を緑に", B["green"], "PST", False),
        ("DEMO-SW-A", "接続が切れている", "暗くして ⚠ を表示", B["neutral"], "", False),
    ]
    for i, (dev, cond, eff, col, sub, hit) in enumerate(cards):
        ch = 96
        s += R(16, y, PW - 32, ch, C["bg2"], r=12)
        pv, pw = device_pill(32, y + 14, dev)
        s += pv + T(40 + pw, y + 29, cond, 15, 600)
        s += T(32, y + 58, "→ " + eff, 15, 400, C["label2"])
        s += T(32, y + 80, "ドラッグで優先順を変更", 11, 400, C["label3"])
        mini = button(PW - 16 - 16 - 56, y + 20, 56, 56, "CAM 1", sub or None, col, r=9, fs=12,
                      state="offline" if i == 2 else None)
        s += mini
        y += ch + 10
    s += R(16, y, PW - 32, 44, C["bg2"], r=12) + icon("plus", 32, y + 14, 16, C["blue"], 2.4) + T(58, y + 28, "状態表示を追加", 17, 400, C["blue"])
    y += 44 + 14
    s += T(32, y + 12, "よく使う組み合わせ", 13, 600, C["label2"])
    y += 22
    x = 16
    for lab in ("PGM/PST タリー", "ON/OFF", "接続状態"):
        c, w = chip(x, y, lab, None, h=32, size=14, color=C["blue"])
        s += c
        x += w + 8
    s += home_indicator(PW, PH)
    return s


def iphone_devices():
    s = iphone_status()
    s += circle_btn(PW - 36, 76, "plus", 18, color=C["blue"], isz=16)
    s += T(16, 140, "機器", 34, 700)
    s += R(16, 156, PW - 32, 36, C["fill3"], r=10) + icon("search", 26, 165, 18, C["label2"]) + T(50, 180, "検索", 17, 400, C["label2"])
    g, y = glist(16, 210, PW - 32, [
        {"rows": [
            {"dot": "ok", "t": "DEMO-SW-A", "s": "Roland V-160HD · LAN", "h": 64, "r": "接続中", "rc": C["green"], "chev": True},
            {"dot": "ok", "t": "DEMO-SW-B", "s": "Roland V-80HD · USB", "h": 64, "r": "接続中", "rc": C["green"], "chev": True},
            {"dot": "ok", "t": "DEMO-ATEM", "s": "Blackmagic ATEM · LAN", "h": 64, "r": "接続中", "rc": C["green"], "chev": True},
            {"dot": "warn", "t": "DEMO-REC", "s": "汎用 TCP · LAN", "h": 64, "r": "再接続中", "rc": C["orange"], "chev": True},
            {"dot": "off", "t": "DEMO-HTTP", "s": "汎用 HTTP", "h": 64, "r": "無効", "chev": True},
        ], "footer": ["ローカルネットワーク: 許可済み", "この iPhone: 192.168.10.6 · Wi‑Fi DEMO-NET"]},
    ])
    s += g
    s += tabbar(1)
    s += home_indicator(PW, PH)
    return s


def iphone_add_device():
    s = iphone_devices()
    s += R(0, 0, PW, PH, "rgba(0,0,0,0.45)")
    top = 62
    s += f'<path d="M0 {top + 38} Q0 {top} 38 {top} H{PW - 38} Q{PW} {top} {PW} {top + 38} V{PH} H0 Z" fill="{C["bg2"]}"/>'
    s += R(PW / 2 - 18, top + 6, 36, 5, C["label3"], r=2.5)
    s += T(20, top + 44, "キャンセル", 17, 400, C["blue"])
    s += T(PW / 2, top + 44, "機器を追加", 17, 600, anchor="middle")
    s += R(16, top + 64, PW - 32, 36, C["fill3"], r=10) + icon("search", 26, top + 73, 18, C["label2"]) + T(50, top + 88, "機種名で検索", 17, 400, C["label2"])
    y = top + 116
    # bg3 を使うためにカード色を差し替えた glist を使う
    secs = [
        {"header": "映像スイッチャー", "rows": [
            {"icon": ("slider", B["blue"]), "t": "Roland V-160HD", "s": "LAN / USB / Bluetooth", "h": 56, "chev": True},
            {"icon": ("slider", B["blue"]), "t": "Roland V-80HD", "s": "LAN / USB / Bluetooth", "h": 56, "chev": True},
            {"icon": ("slider", B["blue"]), "t": "Roland VR-120HD", "s": "LAN / USB", "h": 56, "chev": True},
            {"icon": ("slider", B["indigo"]), "t": "Blackmagic ATEM", "s": "LAN", "h": 56, "chev": True},
        ]},
        {"header": "汎用", "rows": [
            {"icon": ("network", "#48484A"), "t": "TCP", "chev": True},
            {"icon": ("antenna", "#48484A"), "t": "UDP", "chev": True},
            {"icon": ("wave", "#48484A"), "t": "OSC", "chev": True},
            {"icon": ("cable", "#48484A"), "t": "HTTP", "chev": True},
        ], "footer": "対応機器は順次追加。仕様の根拠は各機器の「診断」に記載"},
    ]
    g, y = glist(16, y, PW - 32, secs, sec_gap=18)
    g = g.replace(f'fill="{C["bg2"]}"', f'fill="{C["bg3"]}"')
    s += g
    s += home_indicator(PW, PH)
    return s


def iphone_settings():
    s = iphone_status()
    s += T(16, 140, "設定", 34, 700)
    g, y = glist(16, 160, PW - 32, [
        {"rows": [
            {"icon": ("pages", B["blue"]), "t": "ショーファイル", "r": "DEMO-SHOW", "chev": True},
            {"icon": ("archive", B["indigo"]), "t": "バックアップと読み込み", "chev": True},
        ]},
        {"header": "本番中", "rows": [
            {"icon": ("sun", B["orange"]), "t": "画面スリープ防止", "sw": True},
            {"icon": ("lock", B["neutral"]), "t": "ロック（長押しで解除）", "sw": False},
            {"icon": ("wave", B["teal"]), "t": "押した時の振動", "sw": True},
        ]},
        {"header": "接続", "rows": [
            {"icon": ("slider", B["purple"]), "t": "外部コントローラ", "r": "なし", "chev": True},
            {"icon": ("list", B["neutral"]), "t": "ログ", "r": "警告 1", "rc": C["orange"], "chev": True},
        ]},
        {"rows": [
            {"icon": ("grid", B["neutral"]), "t": "グリッドの既定サイズ", "r": "8×6", "chev": True},
            {"icon": ("text", B["neutral"]), "t": "このアプリについて", "chev": True},
        ]},
    ], sec_gap=22)
    s += g
    s += tabbar(4)
    s += home_indicator(PW, PH)
    return s


def iphone_automation():
    s = iphone_status()
    s += circle_btn(PW - 36, 76, "plus", 18, color=C["blue"], isz=16)
    s += T(16, 140, "自動化", 34, 700)
    g, y = glist(16, 162, PW - 32, [
        {"rows": [
            {"icon": ("clock", C["orange"]), "t": "本番 START を実行", "s": "毎日 19:00:00", "h": 64, "sw": True},
            {"icon": ("bolt", C["purple"]), "t": "PGM が VTR になったら", "s": "状態の変化 · DEMO-SW-A", "h": 64, "sw": True},
            {"icon": ("power", C["green"]), "t": "起動したとき", "s": "全機器に接続", "h": 64, "sw": True},
            {"icon": ("warn", C["red"]), "t": "DEMO-REC が切れたら", "s": "ログに警告", "h": 64, "sw": False},
        ], "footer": ["アプリが前面にある間だけ動きます（iOS の制約）"]},
    ])
    s += g
    s += tabbar(2)
    s += home_indicator(PW, PH)
    return s


def iphone_variables():
    s = iphone_status()
    s += circle_btn(PW - 36, 76, "plus", 18, color=C["blue"], isz=16)
    s += T(16, 140, "変数", 34, 700)
    s += segmented(16, 158, PW - 32, ["機器の変数", "自分で作る変数"], 0)
    g, y = glist(16, 206, PW - 32, [
        {"header": "DEMO-SW-A", "rows": [
            {"t": "{DEMO-SW-A.pgm}", "tmono": True, "s": "PGM 入力", "h": 56, "r": "SDI 2", "rmono": True, "rc": C["label"]},
            {"t": "{DEMO-SW-A.pst}", "tmono": True, "s": "PST 入力", "h": 56, "r": "SDI 3", "rmono": True, "rc": C["label"]},
            {"t": "{DEMO-SW-A.trans_time}", "tmono": True, "s": "トランジション時間", "h": 56, "r": "1.0s", "rmono": True, "rc": C["label"]},
        ]},
        {"header": "DEMO-REC", "rows": [
            {"t": "{DEMO-REC.timecode}", "tmono": True, "s": "録画時間 · 古い値（再接続中）", "h": 56, "r": "00:12:34", "rmono": True, "rc": C["orange"]},
        ]},
        {"header": "アプリ", "rows": [
            {"t": "{app.time}", "tmono": True, "s": "現在時刻", "h": 56, "r": "19:42:08", "rmono": True, "rc": C["label"]},
        ], "footer": "長押しでコピー → ボタンの文字に貼り付け"},
    ], sec_gap=18)
    g = g.replace(f'font-family="{MONO}" font-size="17" font-weight="400" fill="#FFFFFF"', f'font-family="{MONO}" font-size="15" font-weight="500" fill="{C["teal"]}"')
    s += g
    s += tabbar(3)
    s += home_indicator(PW, PH)
    return s


# ---------------------------------------------------------------------------
# デザイントークン一覧
# ---------------------------------------------------------------------------
def tokens():
    W, H = 1500, 1720
    s = T(48, 70, "conductor デザイントークン / 部品", 30, 700, CANVAS_TEXT)
    s += T(48, 100, "表示色は iOS ダークモードの値。実装はすべて PlatformColor のシステム名で参照（ライト/ダーク/コントラスト増に自動追従）。ボタン色だけはユーザーが選ぶコンテンツ色として固定値で保存。", 14, 400, CANVAS_TEXT2)
    # システム色
    y = 140
    s += T(48, y, "システム色（PlatformColor）", 18, 700, CANVAS_TEXT)
    y += 16
    for i, (k, nm) in enumerate(PLATFORM_NAMES):
        x = 48 + (i % 5) * 282
        yy = y + (i // 5) * 86
        s += R(x, yy, 270, 74, "#FFFFFF", r=10)
        s += R(x + 10, yy + 10, 54, 54, "#000000", r=8) + R(x + 10, yy + 10, 54, 54, C[k], r=8, stroke="rgba(0,0,0,0.15)", sw=1)
        s += T(x + 74, yy + 32, nm, 13, 600, CANVAS_TEXT, mono=True)
        s += T(x + 74, yy + 52, C[k], 11, 400, CANVAS_TEXT2, mono=True)
    y += 4 * 86 + 30
    s += T(48, y, "ボタン色（コンテンツ色・ユーザーが選択）", 18, 700, CANVAS_TEXT)
    y += 16
    for i, (k, v) in enumerate(B.items()):
        x = 48 + i * 108
        s += R(x, y, 96, 96, v, r=12, stroke="rgba(0,0,0,0.2)", sw=1)
        s += T(x + 48, y + 54, k, 13, 700, "#000000" if lum(v) > 0.55 else "#FFFFFF", "middle")
        s += T(x + 48, y + 116, v, 11, 400, CANVAS_TEXT2, "middle", mono=True)
    y += 150
    # 文字
    s += T(48, y, "文字（Dynamic Type。最小 11pt / 本文 17pt / 細いウェイト不使用）", 18, 700, CANVAS_TEXT)
    y += 14
    s += R(48, y, 690, 300, C["bg"], r=14)
    rows = [("Large Title 34 Bold", 34, 700, "機器"), ("Title 2 22 Bold", 22, 700, "DEMO-SHOW"),
            ("Headline 17 Semibold", 17, 600, "本番 を編集"), ("Body 17 Regular", 17, 400, "切れたら自動で再接続"),
            ("Subhead 15", 15, 400, "ページ 2 / 4 · 8×6"), ("Footnote 13", 13, 400, "ローカルネットワーク: 許可済み"),
            ("Caption 2 11", 11, 400, "左右スワイプで 5–8 列へ"), ("Mono 15（変数・数値）", 15, 500, "{DEMO-SW-A.pgm} 19:42:08")]
    for i, (lab, sz, wt, ex) in enumerate(rows):
        yy = y + 36 + i * 34
        s += T(68, yy, lab, 12, 500, C["label2"], mono=True)
        s += T(300, yy, ex, sz if sz < 30 else 30, wt, C["teal"] if "Mono" in lab else C["label"], mono="Mono" in lab)
    # ボタンの状態
    bx0 = 770
    s += T(bx0, y - 14, "ボタンの状態", 18, 700, CANVAS_TEXT)
    s += R(bx0, y, 682, 300, C["bg"], r=14)
    st = [
        (dict(main="CAM 1", sub="PGM", bg=B["neutral"]), "通常"),
        (dict(main="CAM 2", sub="PGM", bg=B["red"]), "状態表示: PGM"),
        (dict(main="CAM 3", sub="PST", bg=B["green"]), "状態表示: PST"),
        (dict(main="CUT", bg=B["white"], state="pressed"), "押している"),
        (dict(main="BGM", sub="FADE", bg=B["orange"], steps=(3, 1)), "ステップ 2/3"),
        (dict(main="00:12:34", sub="REC", bg=B["red"], state="offline", var=True), "機器が未接続"),
        (dict(main="AUTO", sub="MIX 1.0s", bg=B["yellow"], state="selected"), "編集で選択中"),
        (dict(state="empty-edit"), "空き（編集）"),
    ]
    for i, (kw, lab) in enumerate(st):
        x = bx0 + 26 + (i % 4) * 164
        yy = y + 24 + (i // 4) * 140
        s += button(x + 20, yy + 8, 96, 96, **kw)
        s += T(x + 68, yy + 128, lab, 12, 500, C["label2"], "middle")
    y += 340
    # アイコン
    s += T(48, y, "アイコン（実装は SF Symbols。下は対応表）", 18, 700, CANVAS_TEXT)
    y += 14
    s += R(48, y, 1404, 320, C["bg"], r=14)
    names = ["grid", "bolt", "braces", "network", "slider", "list", "archive", "gear", "chev-l", "chev-r", "chev-d", "plus",
             "lock", "unlock", "ellipsis", "trash", "dup", "clock", "warn", "check", "sidebar", "search", "handle", "undo",
             "redo", "power", "xmark", "play", "photo", "wave", "cable", "antenna", "text", "paint", "eye", "sun", "pages", "wifi"]
    for i, nm in enumerate(names):
        x = 68 + (i % 10) * 138
        yy = y + 20 + (i // 10) * 76
        s += icon(nm, x + 46, yy, 26, C["label"] if nm != "warn" else C["orange"], 2)
        s += T(x + 59, yy + 46, ICON_SF[nm], 9.5, 400, C["label2"], "middle", mono=True)
    y += 360
    # 寸法
    s += T(48, y, "寸法", 18, 700, CANVAS_TEXT)
    y += 14
    s += R(48, y, 1404, 250, "#FFFFFF", r=14)
    dims = [
        "タップ領域: 最小 44×44pt（ボード上のボタンは iPhone 縦 82pt / iPad 横 114pt / 本番表示 154×132pt）",
        "ボタン角丸: 12pt（本番表示 14pt）／ボタン間隔: iPad 12pt・iPhone 10pt／画面左右マージン: iPad 24pt・iPhone 16–18pt",
        "ボタン文字: 自動サイズ = 短辺 × 0.17（最小 12pt）、上の小見出し = 短辺 × 0.105（最小 11pt）、2 行まで",
        "グリッド: 既定 8 列 × 6 行（ページごとに 4–12 列 × 3–8 行で変更可）",
        "iPad: サイドバー 320pt ／ 編集時インスペクタ 400pt ／ 一覧カラム 390pt",
        "iPhone 縦: 4 列ずつ表示（1–4 列 / 5–8 列を左右スワイプ）。iPhone 横: 8 列全部、行は縦スクロール",
        "タブバー（iPhone）: 浮いたカプセル 62pt。ボード / 機器 / 自動化 / 変数 / 設定",
        "状態ドット: 接続中=塗り緑、再接続中=半分塗り橙、無効=輪郭灰。色だけに頼らず形も変える",
    ]
    for i, d in enumerate(dims):
        s += T(72, y + 34 + i * 27, "・" + d, 14, 400, CANVAS_TEXT)
    return doc(W, H, s, "conductor tokens")


# ---------------------------------------------------------------------------
# 出力
# ---------------------------------------------------------------------------
def ipad_doc(fn, title, note):
    M = 60
    W = IW + M * 2
    H = IH + M * 2 + 60
    body = frame(fn(), IW, IH, 18, M, M + 60, title, note)
    return doc(W, H, body, title)


def phones_doc(items, title):
    """items: [(fn, w, h, caption)]"""
    M = 56
    W = M + sum(w + M for _, w, _, _ in items)
    H = max(h for _, _, h, _ in items) + M * 2 + 90
    body = T(M, 52, title, 26, 700, CANVAS_TEXT)
    x = M
    for fn, w, h, cap in items:
        body += frame(fn(), w, h, 55 if h > 500 else 40, x, M + 90, cap, None)
        x += w + M
    return doc(W, H, body, title)


FILES = {
    "00-tokens.svg": lambda: tokens(),
    "01-ipad-board.svg": lambda: ipad_doc(ipad_board_run, "iPad 横 / ボード（運用）",
                                          "左サイドバー = メニュー。ボード配下にページ一覧。上に機器の接続状況、下でページ切替"),
    "02-ipad-button-edit.svg": lambda: ipad_doc(ipad_board_edit, "iPad 横 / ボタン編集（編集モード）",
                                                "サイドバーを畳んでボード＋右インスペクタ。スタイル / 動作 / 状態表示 の 3 タブ"),
    "03-ipad-show.svg": lambda: ipad_doc(ipad_board_show, "iPad 横 / 本番表示（ロック中）",
                                         "メニューを隠してボタン最大化。誤操作防止ロック、時計、接続状況だけ表示"),
    "04-ipad-devices.svg": lambda: ipad_doc(ipad_devices, "iPad 横 / 機器の接続設定",
                                            "サイドバー → 機器一覧 → 詳細 の 3 カラム。接続状態・設定・読み取り中の状態"),
    "05-ipad-automation.svg": lambda: ipad_doc(ipad_automation, "iPad 横 / オートメーション",
                                               "きっかけ（時刻・状態の変化・起動・接続の変化）→ 条件 → 動作"),
    "06-ipad-variables.svg": lambda: ipad_doc(ipad_variables, "iPad 横 / 変数",
                                              "機器から読んだ値の一覧。ボタンの文字に {機器名.変数名} で埋め込む"),
    "10-iphone-board-pages.svg": lambda: phones_doc([
        (iphone_board, PW, PH, "ボード（縦）"),
        (iphone_pages, PW, PH, "ページ切替（シート）"),
        (iphone_board_landscape, IPL_W, IPL_H, "ボード（横・8 列表示）"),
    ], "iPhone / ボードとページ切替"),
    "11-iphone-button-edit.svg": lambda: phones_doc([
        (iphone_edit_style, PW, PH, "ボタン編集: スタイル"),
        (iphone_edit_action, PW, PH, "ボタン編集: 動作"),
        (iphone_edit_feedback, PW, PH, "ボタン編集: 状態表示"),
    ], "iPhone / ボタン編集"),
    "12-iphone-devices-settings.svg": lambda: phones_doc([
        (iphone_devices, PW, PH, "機器"),
        (iphone_add_device, PW, PH, "機器を追加"),
        (iphone_settings, PW, PH, "設定"),
    ], "iPhone / 機器・設定"),
    "13-iphone-automation-variables.svg": lambda: phones_doc([
        (iphone_automation, PW, PH, "自動化"),
        (iphone_variables, PW, PH, "変数"),
    ], "iPhone / 自動化・変数"),
}


def main():
    os.makedirs(OUT, exist_ok=True)
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
            prev = svg.replace(FONT, PREVIEW_FONT)
            cairosvg.svg2png(bytestring=prev.encode("utf-8"), write_to=os.path.join(png_dir, name.replace(".svg", ".png")))


if __name__ == "__main__":
    main()
