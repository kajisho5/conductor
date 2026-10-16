#!/usr/bin/env python3
"""conductor デザイン用の描画部品（build_svgs.py から使う）。

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


