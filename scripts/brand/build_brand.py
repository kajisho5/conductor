#!/usr/bin/env python3
"""conductor ロゴ・アプリアイコン案の生成。

使い方:
    python3 scripts/brand/build_brand.py --png DIR   # docs/brand/concepts.svg（＋確認用 PNG）
文字はフォントに依存しないよう、Inter Display（SIL OFL）の字形をパスに変換して埋め込む。
"""
from __future__ import annotations

import math
import os
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(ROOT, "docs", "brand")
FONT_PATH = "/usr/share/fonts/opentype/inter/InterDisplay-SemiBold.otf"
JP = "'Noto Sans CJK JP', 'Hiragino Sans', sans-serif"


def text_path(text: str, x: float, y: float, size: float, font=FONT_PATH, tracking=0.0):
    """文字列をパスに変換。(x, y) はベースライン左端。戻り値 (d, 幅)。"""
    f = TTFont(font)
    gs = f.getGlyphSet()
    cmap = f.getBestCmap()
    upm = f["head"].unitsPerEm
    sc = size / upm
    pen = SVGPathPen(gs)
    cx = 0.0
    for ch in text:
        gname = cmap[ord(ch)]
        tp = TransformPen(pen, (sc, 0, 0, -sc, x + cx, y))
        gs[gname].draw(tp)
        cx += gs[gname].width * sc + tracking
    return pen.getCommands(), cx - tracking


def rr(x, y, w, h, r, fill, extra=""):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" {extra}/>'


# ---------------------------------------------------------------------------
# 3 案（いずれも 1024×1024、角丸なし・不透明。角丸はシステムが付ける）
# ---------------------------------------------------------------------------
def concept_a(dark=False):
    """A：タクト＋ボタン。指揮棒の先が光ったボタンに触れる。"""
    bg = ('<linearGradient id="a_bg" x1="0" y1="0" x2="0" y2="1">'
          + ('<stop offset="0" stop-color="#1A1A1E"/><stop offset="1" stop-color="#0B0B0D"/>' if dark else
             '<stop offset="0" stop-color="#2B2F6B"/><stop offset="1" stop-color="#14163A"/>')
          + '</linearGradient>')
    s = f"<defs>{bg}</defs>" + rr(0, 0, 1024, 1024, 0, "url(#a_bg)")
    # 2×2 のボタン（左下）
    cells = [(232, 452, "#FFFFFF", 0.16), (452, 452, "#FFFFFF", 0.16), (232, 672, "#FFFFFF", 0.16), (452, 672, "#FF453A", 1.0)]
    for x, y, col, op in cells:
        s += rr(x, y, 188, 188, 40, col, f'opacity="{op}"')
    # 光ったボタンの輪
    s += rr(436, 656, 220, 220, 54, "none", 'stroke="#FFFFFF" stroke-width="14" opacity="0.9"')
    # タクト（右上の持ち手から左下へ）
    s += '<line x1="812" y1="196" x2="560" y2="684" stroke="#FFFFFF" stroke-width="30" stroke-linecap="round"/>'
    s += '<circle cx="826" cy="170" r="52" fill="#FFFFFF"/>'
    return s


def concept_b(dark=False):
    """B：拍子の軌跡。指揮の 4 拍子を 1 本の線で。"""
    bg = ('<linearGradient id="b_bg" x1="0" y1="0" x2="1" y2="1">'
          + ('<stop offset="0" stop-color="#18181B"/><stop offset="1" stop-color="#050506"/>' if dark else
             '<stop offset="0" stop-color="#0A84FF"/><stop offset="1" stop-color="#5E5CE6"/>')
          + '</linearGradient>')
    s = f"<defs>{bg}</defs>" + rr(0, 0, 1024, 1024, 0, "url(#b_bg)")
    # 4 拍子（下→左→右→上）を 1 本の線で
    d = ("M512 214 C512 380 512 560 512 700 "
         "C512 772 470 790 420 742 C370 694 300 610 264 560 "
         "C240 526 270 506 318 528 C440 584 620 624 778 602 "
         "C826 595 830 552 790 536 C700 500 600 430 548 330")
    line = "#FFFFFF" if not dark else "#7D7AFF"
    s += f'<path d="{d}" fill="none" stroke="{line}" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>'
    s += f'<circle cx="512" cy="214" r="60" fill="{line}"/>'
    s += '<circle cx="512" cy="700" r="40" fill="#FF453A"/>'
    return s


def concept_c(dark=False):
    """C：c とタリー。太い c の開いた所に赤く光るボタン。"""
    bg = ('<linearGradient id="c_bg" x1="0" y1="0" x2="0" y2="1">'
          + ('<stop offset="0" stop-color="#1C1C1E"/><stop offset="1" stop-color="#000000"/>' if dark else
             '<stop offset="0" stop-color="#F7F7F9"/><stop offset="1" stop-color="#DADAE0"/>')
          + '</linearGradient>')
    s = f"<defs>{bg}</defs>" + rr(0, 0, 1024, 1024, 0, "url(#c_bg)")
    cx, cy, r = 488, 512, 268
    a0, a1 = math.radians(40), math.radians(320)
    x0, y0 = cx + r * math.cos(a0), cy - r * math.sin(a0)
    x1, y1 = cx + r * math.cos(a1), cy - r * math.sin(a1)
    ring = "#FFFFFF" if dark else "#1C1C1E"
    s += (f'<path d="M{x0:.1f} {y0:.1f} A{r} {r} 0 1 0 {x1:.1f} {y1:.1f}" fill="none" stroke="{ring}" '
          f'stroke-width="132" stroke-linecap="round"/>')
    s += rr(676, 432, 160, 160, 38, "#FF453A")
    s += rr(676, 432, 160, 160, 38, "none", 'stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="10"')
    return s


CONCEPTS = [
    ("A", "タクト＋ボタン", "指揮棒の先が赤く光ったボタンに触れる。何をするアプリか一目で分かる", concept_a),
    ("B", "拍子の軌跡", "指揮の 4 拍子を 1 本の線で描く。抽象的で他と被りにくい", concept_b),
    ("C", "c＋タリー", "頭文字 c の開いた所に PGM の赤ボタン。小さくても形が崩れない", concept_c),
]


def icon_use(fn, x, y, size, dark=False, mask=True, cid=""):
    """アイコンをプレビュー用に配置（角丸マスクはプレビュー表示のためだけ）。"""
    sc = size / 1024
    inner = fn(dark)
    for g in ("a_bg", "b_bg", "c_bg"):
        inner = inner.replace(f'id="{g}"', f'id="{g}{cid}"').replace(f"url(#{g})", f"url(#{g}{cid})")
    r = size * 0.2237
    clip = f'<clipPath id="m{cid}"><rect x="{x}" y="{y}" width="{size}" height="{size}" rx="{r:.1f}"/></clipPath>' if mask else ""
    g = f'<g transform="translate({x},{y}) scale({sc})">{inner}</g>'
    if mask:
        g = f'<defs>{clip}</defs><g clip-path="url(#m{cid})">{g}</g>'
    return g


def tinted(fn, x, y, size, cid):
    """tinted（グレースケール）の見え方の目安。"""
    return (f'<defs><filter id="gs{cid}"><feColorMatrix type="saturate" values="0"/></filter></defs>'
            f'<g filter="url(#gs{cid})">{icon_use(fn, x, y, size, True, True, cid + "t")}</g>')


def concepts_sheet():
    W, H = 1700, 1460
    s = f'<rect width="{W}" height="{H}" fill="#E6E6EA"/>'
    d, w = text_path("conductor", 60, 92, 54)
    s += f'<path d="{d}" fill="#1C1C1E"/>'
    s += f'<text x="{60 + w + 24}" y="90" font-family="{JP}" font-size="28" font-weight="700" fill="#1C1C1E">ロゴ・アプリアイコン案</text>'
    s += f'<text x="60" y="130" font-family="{JP}" font-size="16" fill="#6C6C70">各案：アプリアイコン（標準／ダーク。ティントは決定後にダークから作る）、ホーム画面の大きさ、設定画面の大きさ、ロゴ（マーク＋文字）。文字は Inter Display（OFL）をパス化。</text>'
    y = 170
    for i, (key, name, desc, fn) in enumerate(CONCEPTS):
        rowh = 400
        s += rr(40, y, W - 80, rowh, 24, "#FFFFFF")
        s += f'<text x="72" y="{y + 54}" font-family="{JP}" font-size="30" font-weight="700" fill="#1C1C1E">{key}　{name}</text>'
        s += f'<text x="72" y="{y + 88}" font-family="{JP}" font-size="16" fill="#6C6C70">{desc}</text>'
        # 大きいアイコン：標準・ダーク・ティント
        for j, (lab, mode) in enumerate([("標準", "light"), ("ダーク", "dark")]):
            x = 72 + j * 250
            if mode == "tint":
                s += tinted(fn, x, y + 116, 220, f"{key}{j}")
            else:
                s += icon_use(fn, x, y + 116, 220, mode == "dark", True, f"{key}{j}")
            s += f'<text x="{x + 110}" y="{y + 372}" font-family="{JP}" font-size="15" fill="#6C6C70" text-anchor="middle">{lab}</text>'
        # 小さいサイズ（ホーム 60pt・設定 29pt 相当）を黒い壁紙の上で
        bx = 830
        s += rr(bx, y + 116, 300, 220, 20, "#101014")
        s += icon_use(fn, bx + 40, y + 156, 120, False, True, f"{key}h")
        s += f'<text x="{bx + 100}" y="{y + 300}" font-family="{JP}" font-size="14" fill="#FFFFFF" text-anchor="middle">conductor</text>'
        s += icon_use(fn, bx + 200, y + 186, 58, False, True, f"{key}s")
        s += f'<text x="{bx + 229}" y="{y + 270}" font-family="{JP}" font-size="12" fill="#AAAAAA" text-anchor="middle">小</text>'
        # ロゴ（マーク＋文字）
        lx = 1170
        s += rr(lx, y + 116, 470, 100, 16, "#FFFFFF", 'stroke="#E0E0E5" stroke-width="2"')
        s += icon_use(fn, lx + 20, y + 130, 72, False, True, f"{key}l")
        d, w = text_path("conductor", lx + 108, y + 184, 46)
        s += f'<path d="{d}" fill="#1C1C1E"/>'
        s += rr(lx, y + 236, 470, 100, 16, "#0B0B0D")
        s += icon_use(fn, lx + 20, y + 250, 72, True, True, f"{key}k")
        d, w = text_path("conductor", lx + 108, y + 304, 46)
        s += f'<path d="{d}" fill="#FFFFFF"/>'
        y += rowh + 24
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><title>conductor logo concepts</title>{s}</svg>'


def main():
    os.makedirs(OUT, exist_ok=True)
    svg = concepts_sheet()
    p = os.path.join(OUT, "concepts.svg")
    with open(p, "w", encoding="utf-8") as f:
        f.write(svg)
    print("wrote", p)
    if "--png" in sys.argv:
        import cairosvg  # noqa: PLC0415
        d = sys.argv[sys.argv.index("--png") + 1]
        os.makedirs(d, exist_ok=True)
        cairosvg.svg2png(bytestring=svg.encode("utf-8"), write_to=os.path.join(d, "concepts.png"))


if __name__ == "__main__":
    main()
