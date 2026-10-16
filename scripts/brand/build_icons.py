#!/usr/bin/env python3
"""conductor 決定版（C 案：c＋タリー）のロゴ・アプリアイコン一式を生成。

使い方:
    python3 scripts/brand/build_icons.py            # docs/brand/*.svg と assets/images/*.png を生成
    python3 scripts/brand/build_icons.py --sheet DIR # 確認用の一覧 PNG も書き出す

出力
- docs/brand/
    icon-light.svg / icon-dark.svg / icon-tinted.svg   アプリアイコン 1024（角丸なし。角丸はシステムが付ける）
    layer-background.svg / layer-ring.svg / layer-tally.svg   Icon Composer 用のレイヤー
    mark.svg / mark-white.svg / mark-mono-black.svg / mark-mono-white.svg   マーク単体（背景なし）
    wordmark.svg / wordmark-white.svg                     文字だけ
    lockup.svg / lockup-white.svg                         マーク＋文字（横並び）
- assets/images/
    icon.png（標準） / icon-dark.png / icon-tinted.png   1024×1024（Expo の ios.icon で使う）
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_brand import JP, rr, text_path  # noqa: E402

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
BRAND = os.path.join(ROOT, "docs", "brand")
ASSETS = os.path.join(ROOT, "assets", "images")

# 色（ブランド色。アプリ UI の色は PlatformColor を使い、ここの値は使わない）
INK = "#1C1C1E"           # c（標準）
PAPER_TOP = "#F7F7F9"     # 背景グラデーション（標準）
PAPER_BOTTOM = "#DADAE0"
TALLY = "#FF453A"         # タリー（PGM の赤）
WHITE = "#FFFFFF"
DARK_TOP = "#2C2C2E"      # 背景グラデーション（ダーク）
DARK_BOTTOM = "#0B0B0D"
DARK_INK = "#E5E5EA"      # c（ダーク）

# 形（1024 グリッド）
CX, CY, R = 488, 512, 268
STROKE = 132
A0, A1 = math.radians(40), math.radians(320)
TALLY_BOX = (676, 432, 160, 160, 38)


def ring_d():
    """c の形を「塗りの輪郭」で表したパス（線ではなく面。HIG：レイヤーはアウトライン化したベクター）。"""
    ro, ri, rc = R + STROKE / 2, R - STROKE / 2, STROKE / 2

    def pt(r, a):
        return CX + r * math.cos(a), CY - r * math.sin(a)

    o0, o1 = pt(ro, A0), pt(ro, A1)
    i0, i1 = pt(ri, A0), pt(ri, A1)
    return (f"M{o0[0]:.2f} {o0[1]:.2f} A{ro} {ro} 0 1 0 {o1[0]:.2f} {o1[1]:.2f} "
            f"A{rc} {rc} 0 0 0 {i1[0]:.2f} {i1[1]:.2f} "
            f"A{ri} {ri} 0 1 1 {i0[0]:.2f} {i0[1]:.2f} "
            f"A{rc} {rc} 0 0 0 {o0[0]:.2f} {o0[1]:.2f} Z")


# 前景（c＋タリー）の外接範囲の中心を 1024 の中央に合わせるずらし量（apple-hig：主要コンテンツは中央に）
CENTER_DX = 512 - ((CX - R - STROKE / 2) + (TALLY_BOX[0] + TALLY_BOX[2])) / 2   # +17
ICON_FG = f'transform="translate({CENTER_DX:.1f},0)"'


def fg(body):
    """アプリアイコン用の前景グループ（中央寄せ）。"""
    return f"<g {ICON_FG}>{body}</g>"


def ring_path(color, ox=0.0, oy=0.0, scale=1.0):
    return f'<path transform="translate({ox},{oy}) scale({scale})" d="{ring_d()}" fill="{color}"/>'


def tally(color, edge=False, ox=0.0, oy=0.0, scale=1.0):
    """タリー（赤いボタン）。光沢・縁取りなどの効果は付けない（HIG：効果はシステムに任せる）。"""
    x, y, w, h, r = TALLY_BOX
    return f'<g transform="translate({ox},{oy}) scale({scale})">' + rr(x, y, w, h, r, color) + "</g>"


def svg(w, h, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f"<title>{title}</title>{body}</svg>")


# ---------------------------------------------------------------------------
# アプリアイコン
# ---------------------------------------------------------------------------
def bg_light(gid="bg"):
    return (f'<defs><linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="{PAPER_TOP}"/><stop offset="1" stop-color="{PAPER_BOTTOM}"/></linearGradient></defs>'
            + rr(0, 0, 1024, 1024, 0, f"url(#{gid})"))


def icon_light():
    # apple-hig：1024×1024、角丸なし・不透明
    return svg(1024, 1024, bg_light() + fg(ring_path(INK) + tally(TALLY)), "conductor icon")


def bg_dark(gid="bgd"):
    return (f'<defs><linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="{DARK_TOP}"/><stop offset="1" stop-color="{DARK_BOTTOM}"/></linearGradient></defs>'
            + rr(0, 0, 1024, 1024, 0, f"url(#{gid})"))


def icon_dark():
    # apple-hig：dark はライトを基にした落ち着いた配色、フラット画像なら透過背景（システムが暗い背景を敷く）
    # 白は明るすぎないよう少し落とす（App icons：avoid excessively bright images）
    return svg(1024, 1024, fg(ring_path(DARK_INK) + tally(TALLY)), "conductor icon dark")


def icon_tinted():
    # ティント用：グレースケールのみ（Gray Gamma 相当）・不透過。色はシステムが付ける
    # apple-hig：tinted はグレースケール（色はシステムが付ける）
    return svg(1024, 1024, rr(0, 0, 1024, 1024, 0, "#000000") + fg(ring_path("#E6E6E6") + tally("#8C8C8C")), "conductor icon tinted")


def layer_background():
    return svg(1024, 1024, bg_light(), "layer background")


def layer_ring():
    return svg(1024, 1024, fg(ring_path(INK)), "layer ring")


def layer_tally():
    return svg(1024, 1024, fg(tally(TALLY)), "layer tally")


# ---------------------------------------------------------------------------
# ロゴ
# ---------------------------------------------------------------------------
# マークの外接範囲（c の太さを含む）
MX0 = CX - R - STROKE / 2          # 154
MY0 = CY - R - STROKE / 2          # 178
MX1 = TALLY_BOX[0] + TALLY_BOX[2]  # 836
MY1 = CY + R + STROKE / 2          # 846
MW, MH = MX1 - MX0, MY1 - MY0


def mark(ring_color, tally_color, edge=True, size=512):
    sc = size / MH
    w = MW * sc
    body = (f'<g transform="scale({sc}) translate({-MX0},{-MY0})">' + ring_path(ring_color) + tally(tally_color, edge) + "</g>")
    return svg(round(w), size, body, "conductor mark"), w


def wordmark(color, size=200):
    d, w = text_path("conductor", 0, size * 0.78, size)
    h = size
    return svg(round(w) + 4, round(h), f'<path d="{d}" fill="{color}"/>', "conductor wordmark"), w


def lockup(ring_color, text_color, h=200):
    sc = h / MH
    mw = MW * sc
    gap = h * 0.28
    fs = h * 0.62
    d, tw_ = text_path("conductor", mw + gap, h * 0.5 + fs * 0.36, fs)
    body = (f'<g transform="scale({sc}) translate({-MX0},{-MY0})">' + ring_path(ring_color) + tally(TALLY, ring_color == WHITE) + "</g>"
            + f'<path d="{d}" fill="{text_color}"/>')
    return svg(round(mw + gap + tw_ + 4), h, body, "conductor lockup")


# ---------------------------------------------------------------------------
# 一覧シート（確認用）
# ---------------------------------------------------------------------------
def inner(svg_text):
    return svg_text[svg_text.index("</title>") + 8:-6]


def place(svg_text, x, y, scale, uid):
    body = inner(svg_text).replace('id="bg"', f'id="bg{uid}"').replace("url(#bg)", f"url(#bg{uid})")
    return f'<g transform="translate({x},{y}) scale({scale})">{body}</g>'


def rounded(svg_text, x, y, size, uid, under=None):
    r = size * 0.2237
    s = f'<defs><clipPath id="c{uid}"><rect x="{x}" y="{y}" width="{size}" height="{size}" rx="{r:.1f}"/></clipPath></defs>'
    s += f'<g clip-path="url(#c{uid})">'
    if under:
        s += rr(x, y, size, size, 0, under)
    s += place(svg_text, x, y, size / 1024, uid) + "</g>"
    return s


def sheet():
    W, H = 1600, 1180
    s = rr(0, 0, W, H, 0, "#E6E6EA")
    s += f'<g transform="translate(60,40)">{inner(lockup(INK, INK, 72))}</g>'
    s += f'<text x="60" y="150" font-family="{JP}" font-size="16" fill="#6C6C70">ロゴ・アプリアイコン一式（C 案：c＋タリー）。docs/brand/ に SVG、assets/images/ にアプリ用 PNG。</text>'
    # アイコン 3 種
    y = 190
    s += rr(40, y, W - 80, 380, 24, "#FFFFFF")
    s += f'<text x="72" y="{y + 44}" font-family="{JP}" font-size="22" font-weight="700" fill="#1C1C1E">アプリアイコン</text>'
    items = [(icon_light(), "標準 icon.png", None), (icon_dark(), "ダーク icon-dark.png（透過）", "#121214"),
             (icon_tinted(), "ティント icon-tinted.png（グレーのみ）", None)]
    for i, (sv, lab, under) in enumerate(items):
        x = 72 + i * 380
        s += rounded(sv, x, y + 70, 240, f"i{i}", under)
        s += f'<text x="{x}" y="{y + 346}" font-family="{JP}" font-size="14" fill="#6C6C70">{lab}</text>'
    # 小さいサイズ
    sx = 1130
    s += rr(sx, y + 70, 380, 240, 20, "#0E0E10")
    for j, sz in enumerate([120, 76, 58, 40]):
        xx = sx + 24 + sum([120, 76, 58, 40][:j]) + j * 16
        s += rounded(icon_light(), xx, y + 70 + (240 - sz) / 2, sz, f"s{j}")
    s += f'<text x="{sx}" y="{y + 346}" font-family="{JP}" font-size="14" fill="#6C6C70">小さいサイズでの見え方</text>'
    # レイヤー
    y += 404
    s += rr(40, y, W - 80, 250, 24, "#FFFFFF")
    s += f'<text x="72" y="{y + 44}" font-family="{JP}" font-size="22" font-weight="700" fill="#1C1C1E">Icon Composer 用レイヤー（前景 2 枚はアウトライン化した面。背景は Icon Composer のグラデーション指定を推奨）</text>'
    for i, (sv, lab, under) in enumerate([(layer_background(), "layer-background", None), (layer_ring(), "layer-ring", "#F0F0F3"),
                                           (layer_tally(), "layer-tally", "#F0F0F3")]):
        x = 72 + i * 220
        s += rr(x, y + 64, 150, 150, 12, under or "#FFFFFF", 'stroke="#D0D0D6" stroke-width="2"')
        s += place(sv, x, y + 64, 150 / 1024, f"l{i}")
        s += f'<text x="{x}" y="{y + 236}" font-family="{JP}" font-size="13" fill="#6C6C70">{lab}.svg</text>'
    # ロゴ
    y += 274
    s += rr(40, y, W - 80, 300, 24, "#FFFFFF")
    s += f'<text x="72" y="{y + 44}" font-family="{JP}" font-size="22" font-weight="700" fill="#1C1C1E">ロゴ</text>'
    s += f'<g transform="translate(72,{y + 76})">{inner(lockup(INK, INK, 80))}</g>'
    s += rr(560, y + 64, 520, 104, 16, "#0B0B0D")
    s += f'<g transform="translate(592,{y + 76})">{inner(lockup(WHITE, WHITE, 80))}</g>'
    mk, _ = mark(INK, TALLY, True, 110)
    s += f'<g transform="translate(1140,{y + 64})">{inner(mk)}</g>'
    mk2, _ = mark("#000000", "#000000", False, 110)
    s += f'<g transform="translate(1300,{y + 64})">{inner(mk2)}</g>'
    wm, _ = wordmark(INK, 64)
    s += f'<g transform="translate(72,{y + 196})">{inner(wm)}</g>'
    s += f'<text x="560" y="{y + 230}" font-family="{JP}" font-size="14" fill="#6C6C70">lockup / lockup-white / mark / mark-mono-black / wordmark。文字は Inter Display SemiBold（SIL OFL）をパス化</text>'
    s += f'<text x="560" y="{y + 254}" font-family="{JP}" font-size="14" fill="#6C6C70">起動画面にはロゴを置かない（HIG）。アプリ内でロゴを使うのは「このアプリについて」だけ</text>'
    return svg(W, H, s, "conductor brand sheet")


def embed_srgb(path):
    """apple-hig（Color / Images）：画像にカラープロファイルを含める。sRGB を埋め込む。"""
    from PIL import Image, ImageCms  # noqa: PLC0415

    im = Image.open(path)
    im.load()
    prof = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    im.save(path, icc_profile=prof)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    print("wrote", os.path.relpath(path, ROOT))


def main():
    import cairosvg  # noqa: PLC0415

    files = {
        "icon-light.svg": icon_light(),
        "icon-dark.svg": icon_dark(),
        "icon-tinted.svg": icon_tinted(),
        "layer-background.svg": layer_background(),
        "layer-ring.svg": layer_ring(),
        "layer-tally.svg": layer_tally(),
        "mark.svg": mark(INK, TALLY)[0],
        "mark-white.svg": mark(WHITE, TALLY)[0],
        "mark-mono-black.svg": mark("#000000", "#000000", False)[0],
        "mark-mono-white.svg": mark(WHITE, WHITE, False)[0],
        "wordmark.svg": wordmark(INK)[0],
        "wordmark-white.svg": wordmark(WHITE)[0],
        "lockup.svg": lockup(INK, INK),
        "lockup-white.svg": lockup(WHITE, WHITE),
    }
    for name, text in files.items():
        write(os.path.join(BRAND, name), text)
    os.makedirs(ASSETS, exist_ok=True)
    for src, dst in [("icon-light.svg", "icon.png"), ("icon-dark.svg", "icon-dark.png"), ("icon-tinted.svg", "icon-tinted.png")]:
        out = os.path.join(ASSETS, dst)
        cairosvg.svg2png(bytestring=files[src].encode("utf-8"), write_to=out, output_width=1024, output_height=1024)
        embed_srgb(out)
        print("wrote", os.path.join("assets/images", dst))
    sh = sheet()
    write(os.path.join(BRAND, "brand-sheet.svg"), sh)
    if "--sheet" in sys.argv:
        d = sys.argv[sys.argv.index("--sheet") + 1]
        os.makedirs(d, exist_ok=True)
        cairosvg.svg2png(bytestring=sh.encode("utf-8"), write_to=os.path.join(d, "brand-sheet.png"))


if __name__ == "__main__":
    main()
