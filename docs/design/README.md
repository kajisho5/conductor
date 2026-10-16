# conductor 画面デザイン v1（確認待ち）

`python3 scripts/design/build_svgs.py` で生成（部品は `scripts/design/svgkit.py`）。SVG は直接編集しない。
設計の中身は `docs/SPEC.md`。表示はダークモードの値で描いているが、実装はシステム色なのでライトにも追従する。

| ファイル | 内容 |
|---|---|
| `00-parts.svg` | 押下表現（押している／送れた／状態反映／送れなかった／長押し判定）、編集時の状態、ボタン色、アイコン（SF Symbols 名）、寸法 |
| `01-ipad-button-action.svg` | iPad ボタン画面：動作タブ、「＋ 動作を追加」の一覧 |
| `02-ipad-button-style.svg` | 見た目タブ：ボタン名・文字・大きさ・揃え・文字色・背景色・画像 |
| `03-ipad-button-feedback.svg` | 状態表示タブ |
| `04-ipad-pages.svg` | ページタブ |
| `05-ipad-presets.svg` | プリセットタブ（空きマスへドラッグ） |
| `06-ipad-show.svg` | 本番画面（ロック中、押下表現の実例） |
| `07-ipad-devices.svg` | 機器：一覧＋設定、⋯ メニュー |
| `08-ipad-triggers.svg` | トリガー：きっかけ／条件／動作 |
| `09-ipad-variables.svg` | 変数：自分で作る／式／内部／機器 |
| `10-ipad-images.svg` | 画像 |
| `11-ipad-settings.svg` | 設定・ログ |
| `20-iphone-buttons.svg` | iPhone：ボタン盤、ボタンを編集（動作・見た目・状態表示） |
| `21-iphone-show-devices.svg` | iPhone：本番・機器・トリガー |
| `22-iphone-variables-settings.svg` | iPhone：変数・設定 |

機器名・ショー名・アドレスはすべて架空（DEMO-SW-A、DEMO-SHOW、/demo/… など）。
