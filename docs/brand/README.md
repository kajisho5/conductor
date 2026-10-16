# conductor ロゴ・アプリアイコン

決定：**C 案「c＋タリー」**（頭文字 c の開いた所に PGM の赤いボタン）。案の比較は `concepts.svg`、一式の一覧は `brand-sheet.svg`。

生成：`python3 scripts/brand/build_icons.py`（SVG と PNG を書き出す）。手で直接編集しない。

| ファイル | 用途 |
|---|---|
| `icon-light.svg` → `assets/images/icon.png` | アプリアイコン（標準）1024×1024、角丸なし・不透明 |
| `icon-dark.svg` → `assets/images/icon-dark.png` | ダーク外観（標準を元に暗い背景。不透過） |
| `icon-tinted.svg` → `assets/images/icon-tinted.png` | ティント（グレースケールのみ・不透過） |
| `layer-ring.svg` / `layer-tally.svg` | Icon Composer 用の前景レイヤー（アウトライン化した面、縁のぼかし・効果なし） |
| `layer-background.svg` | 参考用。背景は Icon Composer のグラデーション指定（`#F7F7F9`→`#DADAE0`）で作る |
| `mark.svg` / `mark-white.svg` / `mark-mono-black.svg` / `mark-mono-white.svg` | マーク単体 |
| `wordmark.svg` / `wordmark-white.svg` | 文字だけ |
| `lockup.svg` / `lockup-white.svg` | マーク＋文字 |

- 色：c は `#1C1C1E`（ダーク・ティントでは白）、背景 `#F7F7F9`→`#DADAE0`、タリー `#FF453A`。これはブランド用で、アプリ UI の色はシステム色（PlatformColor）を使う
- 文字：Inter Display SemiBold（SIL Open Font License 1.1）をパスに変換。フォント自体は同梱しない
- HIG に合わせて、起動画面にはロゴを置かない。アプリ内でロゴを出すのは「このアプリについて」だけ
- Expo では実装時に `app.json` の `ios.icon` に `{ light: icon.png, dark: icon-dark.png, tinted: icon-tinted.png }` を指定する（SDK のドキュメントで書式を確認してから）

## HIG（App icons, 2026-06-08 改訂版）との対応

| HIG の指針 | この一式 |
|---|---|
| 正方形・マスクなしのレイヤー（角丸はシステム） | 1024×1024 の正方形、角丸なし |
| 前景はくっきりした縁、ベクターでアウトライン化、文字もアウトライン化 | c は線ではなく塗りの輪郭パス、文字はパス化 |
| 光沢・影・ベベル・ぼかしはシステムに任せる | 効果なし（以前付けていたタリーの白い縁は削除） |
| 背景は単色かグラデーション、Icon Composer で指定できる | 縦グラデーション 2 色 |
| シンプル、少ない形、主要な内容は中央 | 形は c とボタンの 2 つ、中央寄せ |
| 文字は必要な時だけ（頭文字は可） | 頭文字 c だけ |
| 外観（標準・ダーク・クリア・ティント）で特徴を変えない | 全外観で c＋赤ボタンの形は同じ。クリアはシステムが生成 |
| ダークは標準を元に、落ち着いた配色、色付き背景はコントラストが出やすい | 暗いグレーのグラデーション背景＋白い c＋赤ボタン |

- 最終的には Icon Composer（Mac アプリ）でレイヤーを読み込み `.icon` を作るのが推奨（Expo SDK 54 以降は `ios.icon` に `.icon` を指定可）。Mac が無い間は PNG 3 枚（`ios.icon` の `light` / `dark` / `tinted`）で出す。Expo の要件：正方形・角丸なし・透過ピクセルなし
