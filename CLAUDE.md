# conductor

iPhone / iPad 単体（PC・サーバー不要）で動く「ボタン盤＋自動化」アプリ。LAN（必要なら USB / Bluetooth MIDI）で現場の映像・音響機器を直接操作する。
kajisho5/crosspoint とは完全に別アプリ（コードの流用は可、依存はしない）。

## 進め方（厳守）
1. 詳細設計書 `docs/SPEC.md`
2. SVG デザイン `docs/design/`（`scripts/design/build_svgs.py` から生成。SVG を手で直接いじらず、スクリプトを直して再生成する）
3. 1 と 2 を出したら止めてオーナーの確認を待つ。承認前に実装コードを書かない
4. 実装後はマイルストーンごとに テスト / 型チェック / expo-doctor を通してコミット → push → TestFlight

現在の段階：**SPEC・デザイン承認済み。M1〜M5 実装済み**。ドライバ定義の配信は kajisho5/conductor-drivers（公開モジュールを Actions で自動変換、SPEC 7.1）。実機（Roland・ATEM）での確認はまだ。TestFlight はオーナーの指示で「アプリを作り込んでから」。画面は Companion の管理画面（左ボタン盤＋右設定欄）の考え方。iPhone Duo も対象（外側 compact／内側 regular）。

## 決まっていること（オーナー合意）
- 作る：ボタン（ページ・ボタン編集・プリセット）／本番画面／機器／トリガー／変数（自分で作る・式・内部・機器）／画像／設定（書き出し・読み込み、ログ、グリッド、スリープ防止）
- 作らない：Remote、Protocols（外部から操作される API）、Modules 画面、Action Recorder、日の出/日の入りイベント、HTTPS、利用統計
- 物理ボタン盤の代わりに iPhone / iPad の画面そのものにボタンを並べる。加えて iPad（M1 以降・USB-C）では Stream Deck のキーにもボタンを出す（2026-10-17 オーナー指示・承認済、SPEC 2.5。`modules/conductor-panel` ＋ `src/engine/panel.ts`。実機未確認）
- ボタンを押したことが一目で分かる表現にする（押下中・送信成功・失敗の区別）
- ドライバは JSON の定義として GitHub / Cloudflare から更新できるようにする。コード（JS・Swift）は配らない（SPEC 7.1）

## 技術
- Expo（Development Build）＋ React Native ＋ TypeScript strict ＋ NativeWind。WebView・素の HTML で UI を作らない
- ネイティブが要る所（CoreMIDI / Bluetooth MIDI / 生 TCP・UDP 等）は Expo Modules API（Swift）。crosspoint の `modules/crosspoint-midi` を参考にしてよい
- 色は PlatformColor の semantic system color（hex ハードコード禁止。ボタンの背景色などユーザーが選ぶ「コンテンツの色」は例外）
- タブは expo-router Native Tabs。iPad（regular 幅）は `sidebarAdaptable` のサイドバー＋ボタン盤＋設定欄、iPhone（compact 幅）はタブバー＋シート。判定はサイズクラスで行い、機種や向きで分岐しない
- Apple HIG 準拠（apple-hig skill の数値：タップ 44pt、文字 最小 11pt / 既定 17pt、コントラスト 4.5:1 など）
- iOS 制約前提：前面にいる間だけ動作（常駐サーバーにしない）、ローカルネットワーク許可、画面スリープ防止

## 通信仕様の根拠
- 公開資料・公開 OSS・オーナー実機での観測に加え、公式アプリや他社ソフトの通信の解析結果も使ってよい（2026-10-17 オーナー指示。例：kajisho5/cutline の観測データ）。定義の evidence には出典を「〇〇の通信の観測」と書き、表示文字列に他社の製品名・ロゴは出さない
- Companion のモジュール等の公開 OSS はライセンスを守って仕様の参考にしてよい
- 根拠のない値は【推測】【不明】と明記し、診断画面とログで実機確認できるようにする

## 名前・素材
- Bitfocus / Companion / Elgato の名前・ロゴ・画像を UI・ストア・コードの表示文字列に使わない。各メーカーのロゴも使わない
- 例外：「Stream Deck」の名前だけは UI に使う（2026-10-17 オーナー指示。対応機器の名前として。ロゴ・製品画像は使わない）
- UI 用語は docs/SPEC.md の用語表に従う（ボタン / 本番 / 機器 / トリガー / 変数 / 画像 / 設定）
- サンプル・テスト・モックに実在の社名・人名・会場名を使わない（`DEMO-SW-A`、`DEMO-MIXER` 等）

## コード規約
- 省略コード禁止（`// 略` 等を書かない）、指示外の仕様変更禁止
- 秘密情報は GitHub Secrets のみ。リポジトリに鍵・証明書を置かない
- 配布は kajisho5/runway・kajisho5/hangar の共通 TestFlight 基盤を使う
- 実機が無い間はモック（TCP モックサーバー＋デモモード）で開発・テストできるようにする

## コマンド
- `npm test` / `npm run typecheck` / `npm run doctor`
- `npm run mock` — 模擬機器（TCP 9001・UDP 9002・OSC 9003・HTTP 9004）。iPhone/iPad の機器設定にこのパソコンの IP を入れて確かめる
- `npm run mock:roland` — Roland V シリーズ風（TCP 8023、`-- --model v160hd|v80hd|vr120hd --password 0000`）
- `npm run mock:atem` — ATEM 風（UDP 9910）
- `npm run mock:osee` — OSEE GoStream 風（TCP 19010）
- `python3 scripts/drivers/build_roland.py` / `build_atem.py` / `build_osee.py` / `build_bmd.py` / `build_visca.py` / `build_obs.py` / `build_mixers.py` / `build_vmix.py` / `build_qlab.py` / `build_allenheath.py` / `build_allenheath_dlive.py` / `build_allenheath_qu.py` / `build_panasonic.py` — 定義 JSON を作り直す（JSON を手で直さない。build_roland.py は ../conductor-drivers の builtin/ を読む）
- `npx tsx scripts/drivers/extract_osee_menu.mts ../osee_control_software` — cutline のメニュー定義を scripts/drivers/data/osee_menu.json に書き出す（その後 build_osee.py）
- `python3 scripts/licenses/build_licenses.py` — ライセンス一覧（依存を変えたら作り直す）
- `node scripts/drivers/bundle_remote.mjs ../conductor-drivers` — 配信の定義をアプリに同梱し直す（src/drivers/remote-bundle/。手で直さない）
- バージョンや app.config.ts を変えたら `npx expo prebuild --platform ios --no-install`（tests/config.test.ts が食い違いを検出）
- Linux では Swift（`modules/*/ios`）をコンパイルできない。CI の macOS ジョブ（シミュレータビルド）で確認する

## 返答
- 日本語で短く、結論から
