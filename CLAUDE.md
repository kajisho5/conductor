# conductor

iPhone / iPad 単体（PC・サーバー不要）で動く「ボタン盤＋自動化」アプリ。LAN（必要なら USB / Bluetooth MIDI）で現場の映像・音響機器を直接操作する。
kajisho5/crosspoint とは完全に別アプリ（コードの流用は可、依存はしない）。

## 進め方（厳守）
1. 詳細設計書 `docs/SPEC.md`
2. SVG デザイン `docs/design/`（`scripts/design/build_svgs.py` から生成。SVG を手で直接いじらず、スクリプトを直して再生成する）
3. 1 と 2 を出したら止めてオーナーの確認を待つ。承認前に実装コードを書かない
4. 実装後はマイルストーンごとに テスト / 型チェック / expo-doctor を通してコミット → push → TestFlight

現在の段階：**Step 1・2 提出済み、オーナー承認待ち**。画面の考え方は Companion の管理画面（左ボタン盤＋右設定欄）に合わせることでオーナーと合意済み。

## 決まっていること（オーナー合意）
- 作る：ボタン（ページ・ボタン編集・プリセット）／本番画面／機器／トリガー／変数（自分で作る・式・内部・機器）／画像／設定（書き出し・読み込み、ログ、グリッド、スリープ防止）
- 作らない：外部コントローラ（USB ボタン盤）、Remote、Protocols（外部から操作される API）、Modules 画面、Action Recorder、日の出/日の入りイベント、HTTPS、利用統計
- 物理ボタン盤の代わりに iPhone / iPad の画面そのものにボタンを並べる
- ボタンを押したことが一目で分かる表現にする（押下中・送信成功・失敗の区別）

## 技術
- Expo（Development Build）＋ React Native ＋ TypeScript strict ＋ NativeWind。WebView・素の HTML で UI を作らない
- ネイティブが要る所（CoreMIDI / Bluetooth MIDI / 生 TCP・UDP 等）は Expo Modules API（Swift）。crosspoint の `modules/crosspoint-midi` を参考にしてよい
- 色は PlatformColor の semantic system color（hex ハードコード禁止。ボタンの背景色などユーザーが選ぶ「コンテンツの色」は例外）
- タブは expo-router Native Tabs。iPad（regular 幅）は `sidebarAdaptable` のサイドバー＋ボタン盤＋設定欄、iPhone（compact 幅）はタブバー＋シート。判定はサイズクラスで行い、機種や向きで分岐しない
- Apple HIG 準拠（apple-hig skill の数値：タップ 44pt、文字 最小 11pt / 既定 17pt、コントラスト 4.5:1 など）
- iOS 制約前提：前面にいる間だけ動作（常駐サーバーにしない）、ローカルネットワーク許可、画面スリープ防止

## 通信仕様の根拠
- 公開資料・公開 OSS・オーナー実機での観測だけ。公式アプリや他社ソフトの通信の解析・逆コンパイル・傍受はしない
- Companion のモジュール等の公開 OSS はライセンスを守って仕様の参考にしてよい
- 根拠のない値は【推測】【不明】と明記し、診断画面とログで実機確認できるようにする

## 名前・素材
- Bitfocus / Companion / Elgato / Stream Deck の名前・ロゴ・画像を UI・ストア・コードの表示文字列に使わない。各メーカーのロゴも使わない
- UI 用語は docs/SPEC.md の用語表に従う（ボタン / 本番 / 機器 / トリガー / 変数 / 画像 / 設定）
- サンプル・テスト・モックに実在の社名・人名・会場名を使わない（`DEMO-SW-A`、`DEMO-MIXER` 等）

## コード規約
- 省略コード禁止（`// 略` 等を書かない）、指示外の仕様変更禁止
- 秘密情報は GitHub Secrets のみ。リポジトリに鍵・証明書を置かない
- 配布は kajisho5/runway・kajisho5/hangar の共通 TestFlight 基盤を使う
- 実機が無い間はモック（TCP モックサーバー＋デモモード）で開発・テストできるようにする

## 返答
- 日本語で短く、結論から
