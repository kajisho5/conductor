# conductor ロゴ・アプリアイコン

決定：**C 案「c＋タリー」**（頭文字 c の開いた所に PGM の赤いボタン）。案の比較は `concepts.svg`、一式の一覧は `brand-sheet.svg`。

生成：`python3 scripts/brand/build_icons.py`（SVG と PNG を書き出す）。手で直接編集しない。

| ファイル | 用途 |
|---|---|
| `icon-light.svg` → `assets/images/icon.png` | アプリアイコン（標準）1024×1024、角丸なし・不透明 |
| `icon-dark.svg` → `assets/images/icon-dark.png` | ダーク外観（透過背景。c は `#E5E5EA`、タリーは赤のまま） |
| `icon-tinted.svg` → `assets/images/icon-tinted.png` | ティント（グレースケールのみ） |
| `layer-ring.svg` / `layer-tally.svg` | Icon Composer 用の前景レイヤー（アウトライン化した面、縁のぼかし・効果なし） |
| `layer-background.svg` | 参考用。背景は Icon Composer のグラデーション指定（`#F7F7F9`→`#DADAE0`）で作る |
| `mark.svg` / `mark-white.svg` / `mark-mono-black.svg` / `mark-mono-white.svg` | マーク単体 |
| `wordmark.svg` / `wordmark-white.svg` | 文字だけ |
| `lockup.svg` / `lockup-white.svg` | マーク＋文字 |

- 色：c は `#1C1C1E`（ダークは `#E5E5EA`、ティントは `#E6E6E6`）、背景 `#F7F7F9`→`#DADAE0`、タリー `#FF453A`。これはブランド用で、アプリ UI の色はシステム色（PlatformColor）を使う
- 文字：Inter Display SemiBold（SIL Open Font License 1.1）をパスに変換。フォント自体は同梱しない
- HIG に合わせて、起動画面にはロゴを置かない。アプリ内でロゴを出すのは「このアプリについて」だけ
- Expo では実装時に `app.json` の `ios.icon` に `{ light: icon.png, dark: icon-dark.png, tinted: icon-tinted.png }` を指定する（SDK のドキュメントで書式を確認してから）

## apple-hig skill による照合（App icons／Color／Images／Dark Mode／SF Symbols）

| skill の指針 | この一式 | 判定 |
|---|---|---|
| アプリアイコン：1024×1024、角丸なし・不透明 | `icon.png` 1024×1024、角丸なし、全ピクセル不透明 | OK |
| 外観変種：dark はライトを基にした落ち着いた配色、フラット画像なら透過背景 | `icon-dark.png` 背景透過、c は真っ白でなく `#E5E5EA` | OK |
| 外観変種：tinted はグレースケール | `icon-tinted.png` グレーのみ | OK |
| コア要素は全変種で同じ／用意しない変種はシステムが自動生成 | 全変種で c＋ボタンの形と位置は同じ。clear はシステム生成に任せる | OK |
| シンプルに。単一の概念を最小の形で、背景は単色かグラデーション | 形は c とボタンの 2 つ、背景は 2 色の縦グラデーション | OK |
| レイヤーで作る：前景は輪郭のはっきりした塗り形状、ベクター優先 | 前景 2 枚（c・ボタン）を塗りのアウトラインパスの SVG で用意 | OK |
| マスク済みの形を渡さない。主要コンテンツは中央に | 正方形のまま。前景の外接範囲の中心を (512, 512) に合わせた（x を +17 移動） | OK（今回修正） |
| ハイライト・影・ベベル・ブラーを自前で描かない | 効果なし（タリーの白い縁を削除済み） | OK |
| テキストはブランドや体験に必須な場合のみ | 頭文字 c を形として使うだけ。単語は入れない | OK（原文：頭文字は認識の助けになる） |
| UI の複製・写真・Apple ハードウェアの複製は使わない | 使っていない | OK |
| SF Symbols をアプリアイコン・ロゴに使わない | 使っていない（c は Inter Display の字形ではなく自作の円弧） | OK |
| 対応色空間 sRGB / Gray Gamma 2.2 / Display P3、画像にカラープロファイルを含める | PNG 3 枚に sRGB の ICC プロファイルを埋め込み | OK（今回修正） |
| レイヤー（Icon Composer）推奨 | Icon Composer は Mac 専用で使えないため、PNG 方式（Expo `ios.icon` の `light`/`dark`/`tinted`）。レイヤー SVG は将来用に保持 | 代替 |

### 確認が要る点
- Expo のドキュメントは PNG アイコンに「透過ピクセル不可」と書いている。一方 apple-hig skill（App icons）は dark を透過背景にする。**skill に従って dark は透過**にした。EAS Build で dark が弾かれた場合は、`bg_dark()`（`#2C2C2E`→`#0B0B0D`）を敷いた不透明版に切り替える（`scripts/brand/build_icons.py` の `icon_dark`）
- 出典：https://developer.apple.com/design/human-interface-guidelines/app-icons ／ https://docs.expo.dev/guides/app-icons/
