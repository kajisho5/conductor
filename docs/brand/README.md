# conductor ロゴ・アプリアイコン

決定：**C 案「c＋タリー」**（頭文字 c の開いた所に PGM の赤いボタン）。案の比較は `concepts.svg`、一式の一覧は `brand-sheet.svg`。

生成：`python3 scripts/brand/build_icons.py`（SVG と PNG を書き出す）。手で直接編集しない。

| ファイル | 用途 |
|---|---|
| `icon-light.svg` → `assets/images/icon.png` | アプリアイコン（標準）1024×1024、角丸なし・不透明 |
| `icon-dark.svg` → `assets/images/icon-dark.png` | ダーク外観（透過背景。HIG） |
| `icon-tinted.svg` → `assets/images/icon-tinted.png` | ティント（グレースケール・透過。HIG） |
| `layer-background.svg` / `layer-ring.svg` / `layer-tally.svg` | Icon Composer 用レイヤー（背景＋前景 2 枚） |
| `mark.svg` / `mark-white.svg` / `mark-mono-black.svg` / `mark-mono-white.svg` | マーク単体 |
| `wordmark.svg` / `wordmark-white.svg` | 文字だけ |
| `lockup.svg` / `lockup-white.svg` | マーク＋文字 |

- 色：c は `#1C1C1E`（ダーク・ティントでは白）、背景 `#F7F7F9`→`#DADAE0`、タリー `#FF453A`。これはブランド用で、アプリ UI の色はシステム色（PlatformColor）を使う
- 文字：Inter Display SemiBold（SIL Open Font License 1.1）をパスに変換。フォント自体は同梱しない
- HIG に合わせて、起動画面にはロゴを置かない。アプリ内でロゴを出すのは「このアプリについて」だけ
- Expo では実装時に `app.json` の `ios.icon` に `{ light: icon.png, dark: icon-dark.png, tinted: icon-tinted.png }` を指定する（SDK のドキュメントで書式を確認してから）
