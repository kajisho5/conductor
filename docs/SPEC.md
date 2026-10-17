# conductor 詳細設計書 v1

> 状態：オーナー確認待ち（Step 1）。画面デザインは `docs/design/`（Step 2）。
> 表記：【確認済】公開資料・公開 OSS で確認した値／【推測】根拠が弱い値（実機で確認する）／【不明】未確認。

---

## 0. 目的と前提

- iPhone / iPad だけで動く「ボタン盤＋自動化」アプリ。サーバー PC や Companion 本体は使わない。
- 画面の考え方は Bitfocus Companion の管理画面に合わせる（左にボタン盤、右に選んだボタンの設定欄。ボタンには押した時／離した時の動作、見た目、状態表示）。名前・ロゴ・画像は使わない。
- 物理ボタン盤（USB）の代わりに、iPhone / iPad の画面そのものにボタンを並べて押す。
- Apple HIG に従う（タップ 44pt 以上、文字 最小 11pt・本文 17pt、システム色、SF Symbols、Dynamic Type、ダーク/ライト両対応）。
- iOS の制約：アプリが前面にある間だけ動く。裏で常駐しない。

## 1. 用語

| 画面上の言葉 | 意味 | Companion で近いもの |
|---|---|---|
| ショー | 1 現場ぶんの設定一式（ページ・ボタン・機器・トリガー・変数・画像） | 設定ファイル |
| ページ | ボタンの面。番号と名前を持つ | Page |
| ボタン | 1 マス。ステップ・動作・見た目・状態表示を持つ | Button |
| 動作 | 機器に送る操作 1 つ（または内部操作） | Action |
| ステップ | 押すたびに切り替わる動作のセット | Step |
| 状態表示 | 機器の状態に応じて見た目を変える条件 | Feedback |
| 機器 | 接続先 1 台。機種ごとの通信プログラム（ドライバ）で動く | Connection |
| ドライバ | 機種ごとの通信プログラム。アプリに組み込み | Module |
| プリセット | ドライバが用意するできあいのボタン | Preset |
| トリガー | きっかけ→条件→動作 の自動実行 | Trigger |
| 変数 | 自分で作る変数／式の変数／内部の値／機器の値 | Variables |
| 本番 | ボタンだけを大きく表示して押す画面（ロック付き） | Web Buttons |

## 2. 要件

### 2.1 機能（作るもの）

1. **ボタン**
   - ページの追加・名前変更・並べ替え・複製・削除
   - グリッドの大きさ：既定 8 列 × 4 行（設定で 4–12 列 × 2–8 行）
   - ボタンのコピー・移動・入れ替え・削除、ページを空にする（長押しメニューでも可）
   - ボタン編集：テスト（押す／離すを実際に送る）・停止（実行中の動作を中止）・メモ
   - 動作タブ：ステップ（追加・削除・複製・並べ替え）、各ステップに「押した時」「離した時」「長押し（時間ごと、複数可）」の動作リスト。動作ごとに待ち時間、リスト単位で「順番に実行／同時に実行」
   - 見た目タブ：ボタン名、表示する文字（変数埋め込み可・改行可）、文字の大きさ（自動／小／中／大／数値）、横・縦の揃え、文字の色、背景の色、画像、ボタン上部の帯（ページ/位置表示）の表示
   - 状態表示タブ：条件（機器の状態 or 式）→ 上書きする見た目（背景色・文字色・文字・画像）。上から順に評価し、成り立ったものを重ねる
   - 変数タブ：そのボタンだけで使う変数（ボタン変数）
   - その他タブ：ステップの進み方（手動／押すたびに次へ／式で決める）、動作からの見た目変更を許可
   - プリセットタブ：機器ごと・分類ごとのプリセット一覧。iPad はドラッグで空きマスへ、iPhone は選んでから空きマスをタップ
2. **本番**
   - ボタンだけを最大化表示。上に ページ名・時計・接続状況・ロック、下にページ切替
   - ロック：本番に入る時に「ロックしますか？」と聞く（3.4）。ロック中はページ切替とボタン操作のみ可能。解除は右上を 1.5 秒長押し
   - スワイプとボタン押下の取り違え防止（3.5）
   - 画面スリープ防止（本番中は常に、それ以外は設定）
3. **機器**
   - 一覧（名前・機種・状態：接続中／接続待ち／再接続中／エラー／無効）、有効/無効スイッチ
   - 追加（機種を検索して選ぶ）・編集（ドライバごとの設定項目：IP・ポート・パスワード等）・削除・複製
   - 機器ごとのメニュー：変数を見る／ログを見る／診断
   - 診断：送受信の生データ、応答時間、最後のエラー、仕様の根拠（資料名・URL・確認状況）
4. **トリガー**
   - 一覧（名前・有効スイッチ・きっかけの要約）、追加・複製・削除・並べ替え・書き出し
   - 編集：名前、メモ、テスト実行、タブ「きっかけ／条件／動作／トリガー変数」
   - きっかけ（どれか起きたら）：どれかのボタンを押した／離した、条件が真になった／偽になった、変数が変わった、一定間隔、時刻（毎日・曜日指定）、アプリ起動時、機器が接続した／切れた
   - 条件（すべて満たす時だけ）：機器の状態・変数の比較・式
5. **変数**
   - 自分で作る変数：名前・初期値・現在値・「再起動後も値を保持」
   - 式の変数：式から計算される読み取り専用の値
   - 内部：時刻・日付・ページ番号・機器の接続状態・アプリ情報など
   - 機器ごとの値：ドライバが公開する値（PGM 入力など）
   - 書式：`$(機器名:変数名)`、自分で作る変数は `$(custom:名前)`、式の変数は `$(expression:名前)`、内部は `$(internal:名前)`、ボタン変数は `$(this:名前)`
6. **画像**：写真・ファイルから取り込み、名前を付けて一覧管理。ボタンの見た目・状態表示で使う
7. **設定**
   - ショー：新規・切替・複製・名前変更・削除
   - 書き出し・読み込み：ショー全体／ページ単位／トリガー単位（`.conductor` ファイル、共有シート）
   - ログ：レベル（エラー／警告／情報／詳細）で絞り込み、書き出し
   - ボタン：グリッドの大きさ、上部の帯の表示、状態アイコンの表示
   - 本番：自動ロック、ロック解除の長押し時間、触覚、スリープ防止
   - このアプリについて、使っているオープンソースのライセンス表示

### 2.2 作らないもの（オーナー判断）

~~外部コントローラ（Stream Deck・Stream Deck 等）~~ → 2026-10-17 オーナー指示で iPad の Stream Deck だけ作る（2.5）。Remote（ネットワーク越しのボタン盤）、Protocols（外部から操作を受ける TCP/UDP/HTTP/OSC/RossTalk/Ember+/Art-Net/Satellite API）、Modules 画面、Action Recorder、日の出・日の入り／PC のロックのきっかけ、HTTPS、利用統計。

### 2.5 Stream Deck（iPad・オーナー指示 2026-10-17、承認済・実装 0.6.0）

- **何をするか**：USB-C でつないだボタン盤（メーカー製の物理キー）のキーに、iPad のボタンの一部をそのまま出す。キーを押すと、そのボタンを押したのと同じ動き（押した時・離した時・長押し・ステップ）。デザイン `docs/design/12-ipad-stream-deck.svg`
- **文字・色・画像**：キー専用の編集画面は作らない。いつものボタン編集（見た目タブ）で文字・色・画像を変えると、すぐキーにも出る（オーナー要望「ボタンの文字もアプリから編集」）。変数入りの文字・状態表示・押下表現（押している／送れた／送れなかった）もキーに同じく出す
- **どのボタンを出すか**：設定「表示するページ」＝ iPad と同じ（既定・本番でページを変えるとキーも変わる）／決まったページ。「表示する範囲」＝ 盤の何行目何列目からキーの数だけ（例 5 × 3 なら左上 5 列 3 行）。範囲の外は出さない
- **いつ動くか**：本番画面で押せる。「編集中も押せる」がオンならボタン画面でも押せる（既定オン）。アプリが前面にある間だけ（11 章）
- **使える端末**：M1 以降のチップで USB-C の iPad、iPadOS 16 以降【確認済：メーカーの開発者資料 docs.elgato.com/ipad/getting-started】。それ以外の iPad と iPhone では設定に出さない
- **準備（利用者）**：メーカーの接続アプリ（App Store）を入れ、iPad の「設定」でドライバをオンにする【確認済：同資料】。アプリは入っているかを URL スキーム `elgato-device-driver://` で確かめ、無ければ App Store を開く行を出す
- **対象のキー**：キーだけ（第 1 段階）。ダイヤル・タッチ帯・タッチキーは対象外（後で）。キー数は機種から自動
- **実装**：Expo Modules API の Swift モジュール `modules/conductor-panel`。メーカー公開の StreamDeckKit（MIT）【確認済：github.com/elgatosf/streamdeck-kit-ipad】は Swift Package で CocoaPods に入れにくいので、ドライバとやりとりする定義のヘッダ（StreamDeckDriverShared.h、MIT の表示を残して `PanelDriverShared.h`）だけを入れ、IOKit で直接つなぐ（手順は StreamDeckKit と同じ：`IOServiceNameMatching("StreamDeckDriver")` → `IOServiceOpen` → ドライバの版（major 1）→ 機器情報・キー数 → キー押下の購読）。キーの絵は UIKit で描く（背景色・画像・文字・押下の枠・未接続の暗さ）。機器の向きは capabilities の transform をかけ、JPEG（または BMP）で送る。JS へはキーの押下・離しのイベント、JS からはキーごとの表示内容（文字・色・画像の場所・状態）を送る。変わったキーだけ送る
- **制御（`src/engine/panel.ts`）**：押下表現は 押している（白枠）／送れた（0.35 秒の薄い枠）／送れなかった（橙枠と ⚠、次に送れるまで）。押したキーは離すまで同じボタンを持つ（途中でページが変わっても離す）。アプリが裏に回る・盤を外すと押したままのボタンを離す。時計の変数を使うボタンがある時だけ 1 秒ごとに描き直す
- **設定の保存**：2.5.1 の登録（`settings.streamDecks`・`settings.streamDeckEditPress`）。最初の版の `settings.usbPanel` は配布前に廃止したので引き継がない
- **権限**：アプリに「Communicates with Drivers」（`com.apple.developer.driverkit.communicates-with-drivers`）を付ける。Apple Developer の App ID でこの機能を有効にする作業がオーナー側で要る【推測：TestFlight 配布の署名に必要】。`LSApplicationQueriesSchemes` に `elgato-device-driver`
- **表示の名前**：UI では「Stream Deck」と書く（2026-10-17 オーナー指示で名前は解禁。ロゴ・製品画像は使わない）。接続アプリは「メーカーの接続アプリ」。ライセンス画面には StreamDeckKit（MIT）を載せる。ストア審査で他社商標の扱い（App Review Guidelines 5.2.1）を指摘される可能性あり【推測】→ 説明文は「Stream Deck に対応」のような対応表記にとどめる
- **不明・要確認**：実機（ボタン盤・M1 iPad）での動作は未確認【不明】。ドライバの版が 1 以外なら「対応していません」と出してつながない。他社アプリでの利用条件はメーカー資料に書かれていない【不明】（リポジトリは MIT）

#### 2.5.1 Stream Deck の登録（機種を選ぶ・オーナー指示 2026-10-17、承認済・実装 0.6.0）

- **何をするか**：設定 > Stream Deck で「どの機種を使うか」を登録する。登録した機種でキーの数・並び（列 × 行）が決まり、その形で iPad のボタンの範囲を出す。つなぐ前から範囲を決められ、図で確かめられる。デザイン `docs/design/12-ipad-stream-deck.svg`・`13-ipad-stream-deck-add.svg`
- **機種の一覧**（キーの数・並び・キーの絵の大きさは StreamDeckKit（MIT）の機種表【確認済：github.com/elgatosf/streamdeck-kit-ipad の StreamDeckProduct・Simulator の値】。実機は未確認）

| 機種（表示名） | キー | 並び | キーの絵 | 対象外（後で） | 同じ扱いの機種 |
|---|---|---|---|---|---|
| Stream Deck Mini | 6 | 3 × 2 | 80px | — | Mini（2022）・Mini モジュール |
| Stream Deck MK.2 | 15 | 5 × 3 | 72px | — | 初代・2019・Scissor Keys・MK.2 モジュール |
| Stream Deck Neo | 8 | 4 × 2 | 96px | タッチキー 2・情報表示 | — |
| Stream Deck + | 8 | 4 × 2 | 120px | ダイヤル 4・タッチ帯 | — |
| Stream Deck XL | 32 | 8 × 4 | 96px | — | XL（2022）・XL モジュール |
| Stream Deck + XL | 36 | 9 × 4 | 112px | ダイヤル 6・タッチ帯 | — |
| Stream Deck Pedal | 3 | 3 × 1 | 絵なし | — | — |

- **登録の項目**（1 台ごと）：名前（既定は機種名、例「Stream Deck MK.2」。2 台目以降は「… 2」）／機種／表示するページ（iPad と同じ・決まったページ）／表示する範囲（何行目・何列目から）／明るさ。「編集中も押せる」は全体で 1 つ
- **つないだ時の対応**：ドライバが返す製品番号（productID）から機種を決め、同じ機種で登録したものに結びつける（初めてつないだ時にシリアル番号を覚え、次からはシリアルで結ぶ）。同じ機種を 2 台登録している時は、シリアルを覚えていない方に先に結ぶ
- **登録していない機種をつないだ時**：一覧の上に「登録していない Stream Deck がつながっています（Stream Deck XL）」と［登録］を出す。押すと機種が入った状態で追加する。登録するまでキーには何も出さない（黒）
- **登録した機種と違う形の時**（例：MK.2 で登録して Mini をつないだ）：結びつけず、上と同じ「登録していない」扱い
- **ペダル**：絵は送らない（押す・離すだけ）。範囲は 3 × 1
- **一覧の表示**：各行に 名前・機種（キー数）・状態（接続中＝緑の点／つながっていません＝灰）。行を押すとその台の設定（regular 幅は右側、compact 幅は次の画面）。左にスワイプで削除（確認あり）。台の設定の一番下にも［この Stream Deck を削除］（スワイプの代わり、HIG Accessibility）。名前は行を押して変える。機種を変えると覚えたシリアルは消す
- **実装**：機種の表と結びつけ `src/model/streamDeck.ts`、制御 `src/engine/panel.ts`、画面 `src/components/streamdeck/StreamDeckSettings.tsx`・`app/(tabs)/settings/stream-deck*.tsx`。ネイティブは productId とシリアルを JS へ渡す
- **台の設定画面の図**：iPad のボタン盤に範囲の青い枠、その下に機種の形のキー（押下表現も同じ）。範囲の行・列を変えると枠が動く
- **保存**：ショーの設定 `settings.streamDecks: { id, name, model, serial?, page, row, col, brightness }[]` と `settings.streamDeckEditPress`
- **不明・要確認**：ドライバが iPad で Pedal・Neo・+ XL に対応しているか【不明】（StreamDeckKit の機種表には入っている）。Stream Deck Studio などこの表に無い機種は対象外【推測：StreamDeckKit の表に無いため】

### 2.3 非機能

- ボタンを押してから送信まで 30ms 以内（UI スレッドで描画、送信はネイティブ）【目標】
- 機器 20 台・ページ 99・ボタン 1 ページ 96 まで扱える【目標】
- 編集は自動保存（明示的な保存ボタンなし。HIG の File management に従う）。保存失敗はアラートで通知
- 文字の拡大（Dynamic Type）200% で設定画面が崩れない。ボタン盤のボタン内の文字は見た目タブの大きさに従う
- VoiceOver：ボタンは「ボタン名＋状態表示の結果」を読み上げる
- ダーク/ライト/コントラストを上げる 全部で確認する

## 3. 画面構成

### 3.1 iPad（regular 幅）

`NativeTabs` に `sidebarAdaptable` を付け、iPadOS のサイドバーにする【確認済：Expo SDK 58 の Native Tabs ドキュメントに `sidebarAdaptable`（iOS 18 以上、iPhone では無効）】。サイドバー項目：

| 項目 | SF Symbol | 中身 |
|---|---|---|
| ボタン | `square.grid.2x2.fill` | 中央にボタン盤、右に設定欄（ボタン編集／ページ／プリセット） |
| 本番 | `play.rectangle` | 本番画面（全画面） |
| 機器 | `cable.connector` | 一覧＋右に編集／追加 |
| トリガー | `bolt.fill` | 一覧＋右に編集 |
| 変数 | `dollarsign` | 上で 4 種類を切替（自分で作る／式／内部／機器） |
| 画像 | `photo.on.rectangle` | 一覧＋右に詳細 |
| 設定 | `gearshape.fill` | 設定のリスト（ログ・書き出し/読み込みを含む） |

- サイドバーの中に入れ子の項目（Companion の Variables 配下）を作れるかは【不明】（ドキュメントに記載なし）。入れ子にせず、変数画面の中のセグメントで切り替える。
- 接続状況は「ボタン」画面のツールバーに要約チップ（例：`● 4/5`）を出す。タップで機器画面へ。
- ボタン画面のツールバー右端に `.prominent` の［本番］ボタン（HIG：主要アクションは 1 つ、後縁）。

### 3.2 iPhone（compact 幅）

タブバー 5 つ：ボタン／機器／トリガー／変数／設定（HIG：タブは最小限、5 以下）。
- ボタン：ボタン盤（横 4 列ずつ表示。5–8 列目は横スワイプ）。ボタンをタップで「ボタンを編集」シート（large detent）。中身は iPad の設定欄と同じ。ページ・プリセットはツールバーのメニューから。
- 本番：ボタン画面のツールバーの［本番］から全画面で開く（タブにしない）。
- 画像：設定 > 画像。

### 3.3 編集と本番の違い

| | ボタン画面（編集） | 本番画面 |
|---|---|---|
| ボタンをタップ | 選択して設定欄に表示（動作は送らない） | 動作を実行 |
| 動作を試す | 設定欄の［テスト］ | — |
| 長押し | コピー／移動／削除のメニュー | 「長押し」の動作 |
| ロック | なし | 入る時に聞く（右上長押しで解除） |
| スワイプ | ボタンの上でも可（タップは選択なので誤動作しない） | ボタンの上では無効（3.5） |

### 3.4 本番に入る時のロック確認

- ［本番］を押すと確認ダイアログ（HIG：取り消し可能な選択はアラートでなくダイアログ／アクションシート）
  - タイトル「ロックしますか？」、説明「ロック中はボタンとページ切替だけ操作できます。解除は右上を 1.5 秒長押し。」
  - ボタン：［ロックして本番へ］（既定）／［ロックせずに本番へ］／［キャンセル］
  - 「次から聞かない」は設定 > 本番 > ロック（毎回聞く／いつもロック／ロックしない）で変える
- iPad はポップオーバー（［本番］ボタンから）、iPhone はアクションシート

### 3.5 スワイプとボタン押下の取り違え防止（本番）

- 本番では **ボタンの上で始まったタッチは常にボタン操作**として扱い、スワイプで列・ページを切り替えない。ボタンは指が触れた瞬間に動作を送る（遅延を入れない）
- 列（iPhone 縦の 1–4 / 5–8）とページの切り替えは、下のバー（セグメント・ページのピル）をタップするか、**ボタンの無い下部の帯（高さ 64pt 以上）**を左右にスワイプして行う
- 指がボタンから外へ 10pt 以上ずれてから離した場合は「離した時」の動作だけを実行する（押した時は既に送っているため）。押下表現も通常どおり
- 設定 > 本番 >「ボタンの上でもスワイプで切替」（既定オフ）をオンにした場合だけ、押下判定を 80ms 遅らせ、その間に 10pt 以上動いたらスワイプとして扱い動作を送らない【推測：80ms・10pt は実機で調整】
- 編集画面（ボタン画面）のボタン盤ではタップは選択だけなので、ボタンの上でもスワイプで列・ページを切り替えてよい

## 4. ボタンを押した時の見え方（押下表現）

「押した」「送れた」「送れなかった」を区別して見せる。

| 状態 | 見た目 | 触覚 | 時間 |
|---|---|---|---|
| 押している | 全体を 94% に縮小、白 18% を重ねる、内側に白 3pt の枠 | `impactOccurred(.medium)` | 指が離れるまで |
| 送れた | 白 3pt の枠が外へ広がって消える | なし | 250ms |
| 送れなかった | 橙 3pt の枠＋右上に ⚠、ボタンを左右に 2 回揺らす | `notificationOccurred(.error)` | 800ms、⚠ は再送成功まで残す |
| 実行中（待ち時間を含む動作の途中） | 下端に進行バー | なし | 動作が終わるまで |
| 長押し判定中 | 枠が時計回りに埋まる | 判定成立で `.heavy` | 長押し時間 |
| 機器未接続 | 55% 暗くして右上に ⚠ | — | 接続まで |

- 「視差効果を減らす」が ON のときは縮小・揺れ・広がりをやめ、枠の色の変化だけにする（HIG Motion / Accessibility）。
- 「送れた」は、TCP は書き込み完了、UDP/OSC は送信完了、HTTP は 2xx、Roland は `ack` 受信【確認済：Remote Control Guide の応答 `DTH:a,b; ack`】、ATEM は送信完了で判定。
- 状態表示（PGM で赤など）は押下表現とは別に、機器から状態が返ってきた時点で変わる。

## 5. データ構造（TypeScript）

```ts
// 保存単位：ショー
export interface Show {
  schemaVersion: 1;
  id: string;                 // UUID
  name: string;
  createdAt: string;          // ISO 8601
  updatedAt: string;
  grid: { columns: number; rows: number };  // 既定 8×4
  pages: Page[];
  devices: Device[];
  triggers: Trigger[];
  customVariables: CustomVariable[];
  expressionVariables: ExpressionVariable[];
  images: ImageAsset[];
  settings: ShowSettings;
}

export interface Page {
  id: string;
  number: number;             // 1 始まり、表示順
  name: string;
  buttons: Record<string, ButtonModel>;   // key = "row/col"（0 始まり）
}

export interface ButtonModel {
  id: string;
  name: string;               // ボタン名
  notes: string;
  style: ButtonStyle;
  steps: Step[];              // 1 つ以上
  feedbacks: FeedbackRule[];  // 上から順に評価
  localVariables: LocalVariable[];
  options: {
    stepProgression: 'manual' | 'auto' | 'expression';
    stepExpression?: string;  // 'expression' の時、結果をステップ番号に
    allowStyleChangeByActions: boolean;
  };
}

export interface ButtonStyle {
  text: string;               // 変数埋め込み可、\n で改行
  textSize: 'auto' | 'small' | 'medium' | 'large' | number;
  alignH: 'leading' | 'center' | 'trailing';
  alignV: 'top' | 'center' | 'bottom';
  textColor: string;          // '#RRGGBB'（ユーザー選択のコンテンツ色）
  backgroundColor: string;    // '#RRGGBB'
  imageId?: string;
  showTopBar: 'inherit' | 'show' | 'hide';
}

export interface Step {
  id: string;
  name?: string;
  press: ActionList;
  release: ActionList;
  holds: HoldGroup[];         // 長押し（時間ごと）
}

export interface HoldGroup { id: string; durationMs: number; repeat: boolean; actions: ActionList }

export interface ActionList { mode: 'sequential' | 'concurrent'; actions: ActionModel[] }

export interface ActionModel {
  id: string;
  deviceId: string | 'internal';
  definitionId: string;       // ドライバ内の動作 ID（例 'pgm.select'）
  options: Record<string, OptionValue>;   // 値に変数・式を使える
  delayMs: number;            // この動作の前の待ち
  enabled: boolean;
}

export type OptionValue = string | number | boolean | { expression: string };

export interface FeedbackRule {
  id: string;
  deviceId: string | 'internal';
  definitionId: string;       // 例 'tally.pgm'
  options: Record<string, OptionValue>;
  invert: boolean;
  style: Partial<Pick<ButtonStyle, 'text' | 'textColor' | 'backgroundColor' | 'imageId'>>;
  enabled: boolean;
}

export interface LocalVariable { id: string; name: string; kind: 'value' | 'expression'; value: string }

export interface Device {
  id: string;
  label: string;              // 変数名にも使う（英数字・-・_）
  driverId: string;           // 例 'roland-v160hd'
  driverVersion: string;
  enabled: boolean;
  config: Record<string, OptionValue>;   // ドライバの設定項目
}

export interface Trigger {
  id: string;
  name: string;
  notes: string;
  enabled: boolean;
  events: TriggerEvent[];     // どれか起きたら
  conditions: FeedbackRule[]; // すべて真の時だけ（style は使わない）
  actions: ActionList;
  localVariables: LocalVariable[];
}

export type TriggerEvent =
  | { type: 'buttonPress' | 'buttonRelease' }
  | { type: 'conditionTrue' | 'conditionFalse' }
  | { type: 'variableChanged'; variable: string }
  | { type: 'interval'; seconds: number }
  | { type: 'timeOfDay'; time: string; weekdays: number[] }  // 'HH:mm:ss'、0=日
  | { type: 'appStart' }
  | { type: 'deviceConnected' | 'deviceDisconnected'; deviceId: string };

export interface CustomVariable { id: string; name: string; defaultValue: string; persist: boolean }
export interface ExpressionVariable { id: string; name: string; expression: string }
export interface ImageAsset { id: string; name: string; file: string; width: number; height: number }

export interface ShowSettings {
  showTopBar: boolean;
  showStatusIcons: boolean;
  lockOnShowMode: 'ask' | 'always' | 'never';   // 既定 'ask'
  showModeSwipe: boolean;     // 本番でボタンの上からもスワイプで切替（既定 false）
  unlockHoldMs: number;       // 既定 1500
  haptics: boolean;
  keepAwake: 'showModeOnly' | 'always';
}
```

ランタイムだけの状態（保存しない）：機器の接続状態、変数の現在値（`persist` のものは別ファイルに保存）、ボタンの現在ステップ、実行中の動作、ログ。

## 6. 実行エンジン

- **押す**：本番画面でタッチ開始 → 現在ステップの `press` を実行 → 長押し判定タイマー開始。指を離す → `release` を実行。長押しは `durationMs` を超えたグループの動作を実行（`repeat` なら間隔で繰り返し）。長押しが成立した場合も `release` は実行する（Companion と同じ。オーナー決定）。
- **ステップ**：`auto` は `release` 実行後に次のステップへ（最後の次は 1 に戻る）。`manual` は内部動作「ステップを進める／指定」で変更。
- **順番に実行**：前の動作の送信完了（4 章の「送れた」）を待ってから、次の動作の `delayMs` を待つ。**同時に実行**：全動作を一斉に開始し、各 `delayMs` 後に送る。
- **停止**：ボタンの実行中の待ち・残りの動作をキャンセル。
- **状態表示**：機器の状態・変数が変わったら、そのボタンに関係するルールだけ評価し直す（依存関係を登録して差分更新）。
- **変数の解決**：文字列中の `$(...)` を現在値に置き換える。未定義は `$NA`【推測：表示文字列は決め】と表示し、ログに警告。
- **式**：独自のパーサー（`eval` 不使用）。四則・比較・論理・三項・文字列連結、関数 `round floor ceil abs min max concat includes toUpper toLower secondsToTimecode timecodeToSeconds`。
- **内部動作**（`deviceId: 'internal'`）：ページ移動（番号／次／前）、ボタンを押す／離す（他ボタン）、ステップ変更、自分で作る変数に値を設定、待つ、トリガーの有効/無効、ログに書く、本番ロック/解除。

## 7. 機器ドライバの仕組み

```ts
export interface DriverManifest {
  id: string;                 // 'roland-v160hd'
  name: string;               // 'Roland V-160HD'（文字のみ。ロゴなし）
  version: string;
  transport: 'tcp' | 'udp' | 'http' | 'midi';
  configFields: ConfigField[];          // 設定画面を自動生成
  actions: ActionDefinition[];          // 動作の一覧（名前・オプション）
  feedbacks: FeedbackDefinition[];      // 状態表示の一覧
  variables: VariableDefinition[];      // 公開する値
  presets: PresetDefinition[];          // プリセット（分類つき）
  evidence: Evidence[];                 // 通信仕様の根拠（資料名・URL・確認状況）
}

export interface DriverInstance {
  connect(config: Record<string, OptionValue>): Promise<void>;
  disconnect(): Promise<void>;
  runAction(definitionId: string, options: Record<string, ResolvedValue>): Promise<SendResult>;
  checkFeedback(definitionId: string, options: Record<string, ResolvedValue>): boolean;
  readonly status: DeviceStatus;        // 'connected' | 'connecting' | 'reconnecting' | 'error' | 'disabled'
  onStateChange(listener: (changed: string[]) => void): () => void;
  getVariables(): Record<string, string>;
}
```

- 1 機器 1 インスタンス。ドライバ同士は依存しない。
- 通信は Swift の Expo Module（`modules/conductor-net`）で Network.framework（`NWConnection`）を使い、TCP・UDP を扱う。TS 側はバイト列の組み立てと解析だけ。HTTP は `fetch`。MIDI（USB/Bluetooth）は後のマイルストーンで `modules/conductor-midi`（CoreMIDI）。
- 再接続：切断後 1, 2, 4, 8 秒…最大 30 秒間隔で再試行。アプリが裏に回ったら全接続を閉じ、前面に戻ったら再接続（iOS 制約）。

### 7.1 ドライバ定義の配信と更新（オーナー決定 2026-10-17）

- ドライバは「定義（JSON のデータ）」と「アプリに組み込んだ汎用エンジン」に分ける。定義に入れるのは、送る文字列・バイト列のテンプレート、応答の解析パターン、動作・状態表示・変数・プリセットの一覧、設定項目、根拠（`evidence`）だけ。**コード（JS・Swift）は入れない**
- 定義は kajisho5 の GitHub リポジトリで管理し、Cloudflare（R2 または Pages）から配る。アプリは起動時と「機器」画面で更新を確かめ、取り込む
- 各定義に `id`・`version`・`minAppVersion`・ハッシュ（または署名）を持たせる。検証に通らない定義・`minAppVersion` を満たさない定義は使わない。取得できない時は前回取り込んだ版、それも無ければアプリに同梱の版で動く（オフラインの現場でも動く）
- 表現しきれない複雑なバイナリプロトコル（ATEM など）はアプリに組み込みのまま、アプリの更新で直す
- JS バンドル全体の差し替え（expo-updates 等）は使わない
- 根拠：App Review Guidelines 2.5.2（機能を追加・変更するコードのダウンロード・実行を禁止）https://developer.apple.com/app-store/review/guidelines/ 。定義は実行するコードではなくデータとして扱う【推測：審査での扱いは提出時に確認】
- 入れる時期：M2（汎用エンジンと同時）で同梱の定義を JSON 化、配信と更新は M3 以降
- 定義で使える項目（M3 時点）：`configFields` `actions`（送信形式 bytes / osc / http / builtin）`feedbacks`（比べ方 eq neq contains gt lt gte lte bits）`variables` `receive`（正規表現で変数へ）`derive`（変数から変数を対応表で作る）`onConnect`（接続直後に送る）`poll`（定期的な問い合わせ）`presets`（状態表示つき）`evidence`
- 定義では表せない手順（認証・区切り・ack 待ち）は、アプリに組み込んだ「通信手順」を `session` の名前で選ぶ。M3 は `roland-lan` だけ（`src/drivers/sessions.ts`）
- 定義は `scripts/drivers/` のスクリプトから生成する（手で JSON を直さない）
- 【実装 2026-10-17】配信は公開リポ kajisho5/conductor-drivers（GitHub の raw）から（オーナー判断で Cloudflare は使わない）。`index.json`（一覧）を機器を追加する画面で読み、機器を選んだ時に `defs/<id>.json` を取ってきて Documents/drivers/ に保存する。起動時は保存した定義を読む（通信しない）。設定「機器の定義」で新しい版を確かめる（`src/drivers/remote.ts`）。配信の定義は全部アプリにも同梱する（`src/drivers/remote-bundle/`、オーナー指示 2026-10-17）ので、通信できなくても全部使える。同梱より新しい版が配信にあれば取ってくる
- 動作は `send` の後に `more`（続けて送るもの）を持てる（UDP の 2 通目以降・HTTP の 2 つ目以降）
- 通信方式 `ws`（WebSocket）：`ws://host:port` ＋ 定義の `wsPath` に iOS 標準の WebSocket でつなぎ、送る中身が文字なら文字のフレーム、そうでなければバイナリで送る。受け取ったものは受信の規則にかける
- 配信の定義は、公開 OSS のモジュール（MIT など）を GitHub Actions の使い捨て環境で動かし、動作ごとに送った内容を記録して自動で作る（conductor-drivers の tools/）。記録の差からテンプレートを作り、全部の実行を描き直して一致した動作だけを入れる。状態表示・変数は入れない（受信の解析がプログラムのため）。すべて【推測】扱い（実機未確認）
- テンプレートのフィルタ：`|map`（動作の `maps` で選んだ値ごとの中身）`|padN` `|lin:a:b`（a×値＋b）`|hexu` `|hexl` `|hexstr` `|u8` `|u16be` `|u16le` `|i16be` `|u32be` `|u32le` `|f32be` `|r14h:k` `|r14l:k`（Roland の 2 バイトの値：round(値×k) を 14 ビットの 2 の補数にした上位・下位 7 ビット）`|s7`（Roland の 1 バイトの符号付き値）。変換側（tools/render.mjs）と同じ規則
- 組み込みの定義がある機種（V-160HD など）も変換し、conductor-drivers の `builtin/` に出す。アプリの scripts/drivers/build_roland.py が、そのうち選択肢で値が決まる動作を組み込みの定義へ足す（V-160HD：`scripts/drivers/roland_v160hd_more.py`、id は `x_` で始まる）。2 バイトの値（PinP の位置・大きさなど）は公式のアドレスマップから手で書く（モジュールは 10 進で送っていて資料と違うため）。元のソフトの名前（Bitfocus など）の機器は変換・同梱・一覧から除く

## 8. 対応機器と通信仕様（優先順）

| 順 | 機器 | 理由 |
|---|---|---|
| 1 | 汎用 TCP / UDP / OSC / HTTP | エンジン全体の確認に使え、モックで試しやすい |
| 2 | Roland V-160HD / V-80HD / VR-120HD（LAN） | オーナーの主要機材。crosspoint の実機観測が使える |
| 3 | Blackmagic ATEM（LAN） | 状態が機器から送られてくるので状態表示が作りやすい |
| 4 | Roland の USB / Bluetooth MIDI（SysEx） | ネイティブ実装が要るため最後 |

### 8.1 汎用
- TCP：ホスト・ポート・送信文字列（エスケープ `\r \n \xNN`）・改行コード。受信は行ごとに変数 `last_received` へ
- UDP：同上（受信ポート任意）
- OSC：OSC 1.0 のメッセージ（型 `i f s` と真偽）を UDP で送る。仕様は opensoundcontrol.org の OSC 1.0【確認済：公開仕様】
- HTTP：GET / POST / PUT、ヘッダ、本文、応答のステータスと本文を変数へ

### 8.2 Roland V-160HD（LAN）
- 【2026-10-17 オーナー指示「Companion よりできることが少ない」】動作を 8 → 80 に増やした：入力・出力・AUX の割り当て、PinP & KEY（オン・オフ、フェード、バス、ソース、種類、位置・大きさ・切り取り・中の位置とズーム、形、枠の色・太さ、キー／クロマキーの各値）、DSK、トランジション（時間・種類・MIX・WIPE の種類と向き）、パネルのボタン（押す・離す）、シーンメモリーの保存・初期化、フリーズ、カメラ（PTZ・プリセット・フォーカス・露出・タリー）。根拠：公式 Remote Control Guide のアドレスマップ【確認済：資料】、カメラの 02 41 xx は公開 OSS のモジュールから【推測】。すべて実機は未確認
- 接続：TCP **8023**、Telnet 形式【確認済：V-160HD Remote Control Guide「TCP port number 8023」】
- 書き込み `DTH:アドレス,値;`、読み出し `RQH:アドレス,サイズ;` → 応答 `DTH:アドレス,値;`。成功時 `ack`、エラー `ERR:n;`（0 構文 / 4 無効 / 5 範囲外）【確認済：同ガイド】
- LAN では stx を省略可、チェックサム不要、改行は LF【確認済：Roland サポート記事「V-160HD LAN and RS-232 Control Tips」】
- パスワード：本体 MENU > LAN CONTROL > NETWORK PASSWORD で 4 桁。送り方は接続時に 1 回／毎コマンド前など機器設定次第【確認済：同記事】→ 実際の手順は crosspoint の実機観測に合わせる【実装前に確認】
- 押しっぱなし型のボタンは、値 00 を送って離す必要がある【確認済：同記事】
- PGM 選択 アドレス `002100`、PST `002101`、値 = 0x1F + 入力番号（INPUT 1 = `20`）【確認済：資料。kajisho5/crosspoint のプロファイル。実機は未確認】。V-80HD は `001500`・0x28 + n、VR-120HD は `001B00`・0x1C + n【推測：crosspoint のプロファイル】
- タリー：`0C0000` から（読み取り専用）。V-160HD は 32 番目から XPT 1–10、値 0 OFF / 1 PGM / 2 PVW / 3 両方。`DTH:0C0100,01;` で変化を自発通知【確認済：crosspoint の実装】。V-80HD・VR-120HD は通知の有無が【不明】なので 0.5 秒ごとに問い合わせる
- CUT / AUTO：V-160HD は `0B001E` / `0B001F` に 01 → 00。V-80HD・VR-120HD は簡易制御コマンド `CUT;` `ATO;`【確認済：資料「LAN/RS-232 簡易制御コマンド」Ver.02】
- 認証：接続 → `Enter password:` → パスワード＋LF → `Welcome to 機種名.`。3 秒案内が無ければ `VER;` を送って応答を見る。受信は `;` `\n` 0x06 で区切る（ack は 0x06 か `ACK`）【確認済：crosspoint の実装と模擬機器】
- 「送れた」は ack を受けた時、`ERR:n` は「送れなかった」（理由つき）。1.5 秒 ack が無ければ「送れなかった」。命令の間は 20ms 以上あける
- 模擬機器：`npm run mock:roland`（`--model v160hd|v80hd|vr120hd --password 0000`）
- 状態の変化を機器が自分から知らせる記載はない【確認済：ガイドの「機器から送られるコマンド」はエラーとフロー制御だけ】→ 状態は定期問い合わせ（既定 250ms、設定可）
- V-80HD / VR-120HD は同じ方式と見込むが、アドレス表は機種ごとに確認【推測】

### 8.3 Blackmagic ATEM
- 公開 OSS `atem-connection`（MIT）を仕様の参考にする【確認済：npm のライセンス表示 MIT】。状態が変わると機器からパケットが来る（ライブラリの `stateChanged`）【確認済：同 README】
- UDP ポート 9910【確認済：atem-connection 3.10.3 のソース】
- Node 依存のライブラリなので、そのままは使わず、TS で必要な部分（接続手順・PGM/PST・CUT/AUTO・タリー・DSK・マクロ）を書き直す。ライセンス表記を設定 > ライセンスに入れる
- 実装（M5）：通信手順 `atem`（`src/drivers/atem.ts`）。HELLO → NewSessionId に ack → AckRequest のパケットのコマンドを解析して ack → `InCm` で「接続中」。送信は AckRequest、ack が来なければ 200ms ごとに 3 回まで送り直し、来なければ「送れなかった」。5 秒何も届かなければ接続し直す【確認済：atem-connection の atemSocketChild。実機は未確認】
- 送るコマンド：CPgI / CPvI / DCut / DAut / FtbA / MAct / CDsL / CAuS【確認済：同ライブラリの serialize / deserialize】
- 追加（2026-10-17 オーナー指示「Companion にある機器は同等に」）：動作 43。T バー（CTPs）・PREV TRANS（CTPr）・トランジションの種類と次の対象（CTTp）・時間（CTMx / CTDp / CTWp）・FTB の時間（FtbC）、上流キーの ON AIR・フィル・キー信号・種類（CKOn / CKeF / CKeC / CKTp）、DSK の AUTO・TIE・時間・フィル・キー信号（DDsA / CDsT / CDsR / CDsF / CDsC）、マクロの停止・続行・ループ（MAct / MRCP）、メディアプレーヤーの素材・再生・ループ・頭出し（MPSS / SCPS）、スチルの取り込み・消去（Capt / CSTL）、SuperSource の箱（CSBP）、マルチビューの窓・配置（CMvI / CMvP）、入力名（CInL）、収録・配信（RcTM / StrR）、音声の ON / OFF / AFV・フェーダー・マスター（CAMI / CAMM、Fairlight は CFSP / CFMP）、起動時の状態の保存・消去（SRsv / SRcl）。ON / OFF の動作は「切り替え」を選べる（今の変数で決める）
- 受けるコマンド：_pin / _ver / PrgI / PrvI / TlSr / InPr / FtbS / FtbP / TrSS / TrPr / TrPs / TMxP / KeOn / KeBP / DskS / DskP / AuxS / MRPr / MPCE / RCPS / RTMS / StRS / MvIn / SSBP / AMIP / FASP / InCm
- 版で並びが変わるもの（DDsA・CSBP）は `_ver` で切り替える。Fairlight の音源 ID は本体から届いた FASP を入力ごとに覚えて使う（届いていない入力は CAMI）【推測：実機で確かめる】
- 模擬機器：`npm run mock:atem`
- 【一部実装・オーナー要望メモ 2026-10-17】メディアプールのスチル操作：①メディアプレーヤーに出すスチルを選ぶ（実装済）②スチルを消す（実装済）③スチル一覧（名前・空き）を変数にする ④iPhone / iPad の画像をスチルとして入れる（ATEM の解像度・形式へ変換し、ファイル転送の手順で送る。①〜③より大きい作業）。atem-connection の該当部分を参考にする。着手は未定

### 8.5 Roland の USB / Bluetooth MIDI（M5）
- Swift の `modules/conductor-midi`（CoreMIDI。kajisho5/crosspoint の crosspoint-midi を元にした）
- Roland の定義に `midiModelId`（V-160HD `00 00 00 00 02`、V-80HD `01 05 14`、VR-120HD `00 00 00 00 25`）。機器の設定「接続」で LAN / USB・Bluetooth MIDI を選ぶ
- 送る内容は LAN の命令（`DTH:…;` `RQH:…;`）を DT1 / RQ1 に置き換える。`CUT;` などの簡易制御コマンドは MIDI では使えない（「送れなかった」と理由を出す）。MIDI には ack が無いので、送信できた時点で「送れた」
- 届いた DT1 は LAN と同じ addr_XXXXXX の変数にし、定義の derive で pgm / pst / tally を作る
- CoreMIDI モジュールは同時に 1 つの機器だけ開くので、MIDI で使える機器は 1 台まで
- Bluetooth の機器は機器の画面の「Bluetooth MIDI の機器を追加」（システムのピッカー）で追加。Bluetooth の許可はその時に聞かれる

### 8.6 OSEE GoStream シリーズ（LAN・オーナー指示 2026-10-17）
- 対象：Deck / Deck Plus / Duet / Duet 8 ISO / Omni 12 ISO（1 つの定義 `osee-gostream`。機種で違う入力名は選択肢に併記）
- 接続：TCP **19010**。枠は 先頭 EB A6・種別 00（JSON）・長さ（2 バイト LE、JSON＋CRC）・JSON・CRC-16/MODBUS（2 バイト LE）【確認済：公開 OSS のモジュール osee-gostream-series（MIT）を conductor-drivers の Actions で動かした送信と一致】
- 命令：`{"id":"pgmIndex","type":"set","value":[1]}` の形。返事・通知は type が res / pus。命令の id と値の形はオーナーの別アプリ kajisho5/osee_control_software（cutline。同じ OSS と各機種の説明書が根拠、Duet 8 ISO の実機で使用）から写した【推測：conductor では実機未確認】
- 通信手順 `osee`（`src/drivers/osee.ts`）：定義の動作は JSON を 1 行に 1 つ書き、手順が枠と CRC を付ける。つながったら機種・入力・PGM/PVW・KEY/DSK・収録・配信などを問い合わせる。受信は変数にする（番号つきの値は `id_番号`。例 `keyOnAir_0`、真偽は 1 / 0）。10 秒静かなら `version` を問い合わせ、16 秒何も届かなければつなぎ直す（cutline と同じ）
- 動作 231（2026-10-17 にメニューの項目を追加。オーナー指示で公式ソフトの解析結果も使う）：cutline のメニュー定義（`src/ui/menu/pages.ts`。公式 PC ソフトの画面定義の解析・説明書・Companion モジュールが根拠）から、スイッチャー・マルチソース・キー・DSK・オートスイッチング・音声・プレーヤー・収録・配信・入出力などの項目を `scripts/drivers/extract_osee_menu.mts`（`npx tsx`）で `scripts/drivers/data/osee_menu.json` に書き出し、`build_osee.py` が動作にする（本体の今の値を読み直して全部送る項目は除く。値の形が実機で未確認のものは名前に【未確認】）。以下は最初の 37：PGM / PVW、CUT / AUTO / FTB、トランジションの種類と時間、PREV TRANS、FTB の時間・AFV、KEY・DSK（次のトランジション・ON AIR）、マルチソース、音声（ON / AFV / OFF・フェーダー）、収録・配信・配信先、マクロ、プレーヤー、スチル、PTZ（Omni）、命令を送る（JSON）
- 状態表示：PGM / PVW が入力、KEY / DSK が ON AIR、PREV TRANS、FTB 中、収録中、配信中、音声が ON。変数：`pgm` `pvw`（入力名）ほか
- 模擬機器：`npm run mock:osee`（TCP 19010）
- 定義は `scripts/drivers/build_osee.py` から作る

### 8.7 Blackmagic HyperDeck / Videohub（LAN・オーナー指示 2026-10-17）
- 接続：HyperDeck TCP **9993**、Videohub TCP **9990**。文字の命令を改行で送り、返事・通知は空行で区切られた塊【確認済：Blackmagic 公式の HyperDeck Ethernet Protocol・Videohub Ethernet Protocol】
- 通信手順 `bmd-text`（`src/drivers/bmdText.ts`）：塊の見出し（先頭の 3 桁の番号は除く）を変数名の頭にし、`項目: 値` は `見出し_項目`、`番号 値` は `見出し_番号` にする。最後の返事は `last_reply`
- HyperDeck 動作 22（再生・速さ・ループ・停止・収録・プレビュー・クリップ／タイムコード移動・ジョグ・シャトル・スロット・再生範囲など）。つながったら通知を有効にし、transport info を定期に問い合わせる
- Videohub 動作 8（出力・モニター出力への入力の割り当て・ロック・入出力の名前・シリアルなど。番号は画面では 1 から、送るときは 0 から）。PING で生存確認
- 定義は `scripts/drivers/build_bmd.py` から作る

### 8.8 PTZ カメラ（VISCA over IP・オーナー指示 2026-10-17）
- 接続：UDP **52381**。Sony 方式は 8 バイトの見出し（種別 01 00 / 01 10・長さ・通し番号）を付ける。見出しなしの機種向けに設定 `framing` で raw を選べる【確認済：Sony の VISCA over IP 命令一覧（FR7）】
- 通信手順 `visca-ip`（`src/drivers/visca.ts`）：つながったら通し番号をリセットし、送るたびに番号を進める
- 動作 42：パン・チルト・ホーム・スローモード・ズーム（方式）・フォーカス（AF / MF / ワンプッシュ）・プリセット呼び出し／記憶／消去・電源、露出（方式・アイリス・ゲイン・シャッター・明るさ・露出補正）・アパーチャー・WDR・NR・逆光／スポットライト補正・ホワイトバランス（方式・ワンプッシュ・オフセット）・メニュー・低遅延・16 進の命令
- 定義は `scripts/drivers/build_visca.py` から作る

### 8.9 OBS Studio（obs-websocket 5・オーナー指示 2026-10-17）
- 接続：WebSocket **4455**。Hello → Identify（パスワードがあれば SHA-256 の認証文字列）→ Identified の後に Request（op 6）【確認済：obs-websocket の公開仕様 protocol.md】
- 通信手順 `obs-ws`（`src/drivers/obs.ts`）：定義の動作は `{"requestType":…,"requestData":{…}}` を 1 行に 1 つ書き、手順が op 6 と requestId を付ける。出来事・返事から `program_scene` `preview_scene` `streaming` `recording` `studio_mode` `mute_<入力名>` などの変数を作る
- 動作 27：シーン切り替え（番組 / プレビュー）、トランジション（実行・種類・時間）、配信・録画・一時停止・リプレイバッファ・仮想カメラ、スタジオモード、ミュート・音量、ソースの表示、メディアソース、ホットキー、スクリーンショット、リクエストを送る。状態表示 7
- 定義は `scripts/drivers/build_obs.py` から作る

### 8.10 Behringer X32 / M32・WING（OSC・オーナー指示 2026-10-17）
- 接続：X32 / M32 は UDP **10023**、WING は UDP **2223** の OSC【推測：公開されている有志の資料に基づく。メーカーの一次資料は未確認のため、診断画面とログで実機確認する】
- 動作：X32 18（チャンネル・AUX IN・FX リターン・バス・マトリクス・メイン・DCA のミュート／フェーダー、ミュートグループ、シーン・スニペット・キュー呼び出し、名前）、WING 12（同様のミュート／フェーダーとミュートグループ）
- 定義は `scripts/drivers/build_mixers.py` から作る

### 8.11 vMix（TCP API・オーナー指示 2026-10-17）
- 接続：TCP **8099**、`\r\n` 区切り。命令は `FUNCTION <関数> <クエリ>`（クエリは URL エンコード）。つながったら `SUBSCRIBE TALLY`・`SUBSCRIBE ACTS`・`TALLY` を送る【確認済：vMix ヘルプ「TCP API」「Shortcut Function Reference」「Add/Edit Activator」】
- 通信は汎用の TCP（専用の手順なし）。受信の規則で `TALLY OK 0121…` を `tally_<入力>`（0 / 1 番組 / 2 プレビュー）、`ACTS OK <名前> <入力> <値>` を `act_<名前>_<入力>`、入力番号の無い出来事を `act_<名前>` にする。`program` `preview` は Input / InputPreview が 1 の時の入力【推測：入力番号の無い出来事の行の形は資料に例が無い】
- このため受信の規則の変数名に `$1…` を使えるようにし、テンプレートに `|url`（URL エンコード）を足した
- 動作 102（切り替え・トランジション・オーバーレイ・レイヤー・音声・バス・出力・再生・見た目・タイトル・カウントダウン・プレイリスト・スクリプト・リプレイ・関数をそのまま）、状態表示 17、プリセット 38
- 定義は `scripts/drivers/build_vmix.py` から作る

### 8.12 QLab 5（OSC・オーナー指示 2026-10-17）
- 接続：UDP **53000** の OSC。設定「宛先のワークスペース」が空なら開いているすべてのワークスペースが受け取る（QLab 5 の仕様）。絞る時は `/workspace/名前`【確認済：QLab 5「OSC Dictionary v5」】
- 動作 38：GO・停止・一時停止・再開・パニック・リセット、再生ヘッド・選択の移動、試聴、ショーモード、パスコード、キューごとの操作（スタート・停止・読み込み・プレビューなど）と旗・有効・時間・名前・メモ・音量・色、試聴・上書き・続け方、OSC をそのまま【キューごとの一部は推測】
- 返事（UDP 53001）はまだ受け取らない（状態表示なし）
- 定義は `scripts/drivers/build_qlab.py` から作る

### 8.13 Allen & Heath SQ5 / SQ6 / SQ7（MIDI over TCP・オーナー指示 2026-10-17）
- 接続：TCP **51325**。NRPN（`BN 63 MSB BN 62 LSB BN 06 VC BN 26 VF`、切り替えは `BN 60 00`）。N は設定の MIDI チャンネル【確認済：Allen & Heath「SQ MIDI Protocol Issue 5」】
- パラメーター番号は表の最初の番号と増え方から 14 ビットの通し番号で計算する（資料の例と一致することをテストで確認）。そのためテンプレートに `|plus:名前`（同じ範囲の別の値を足す）を足した
- 動作 85：ミュート（入力・グループ・FX リターン・LR・AUX・FX センド・マトリクス・DCA・ミュートグループ、ON / OFF / 切り替え）、レベル（入力 → LR / AUX / FX、グループ → LR / AUX、FX リターン → LR / AUX、→ マトリクス、各マスター、DCA。資料にある dB の点・14 ビットの数値・±1 dB）、パン・バランス、割り当て（入力 → LR / AUX / グループ）、シーン、ソフトキー、MIDI をそのまま
- レベルの dB は資料に載っている点（0 / −12 / −20 / −24 dB）だけ。受信（状態表示）はまだ
- 定義は `scripts/drivers/build_allenheath.py` から作る

### 8.14 Allen & Heath dLive・Avantis（MIDI over TCP・オーナー指示 2026-10-17）
- 接続：TCP **51325**。チャンネルの種類ごとに MIDI チャンネル（基本 N ＋ 0〜4）と番号が決まっている。ミュートは `9N CH 7F/3F 9N CH 00`、フェーダーは `BN 63 CH BN 62 17 BN 06 LV`（LV = (dB + 54) / 64 × 127）【確認済：「dLive MIDI Over TCP Protocol V1.9」「Avantis MIDI TCP/IP Protocol」】
- 動作：dLive 91・Avantis 104（種類ごとのミュート・フェーダー・メイン割り当て・DCA / ミュートグループ割り当て・名前・色、入力 → AUX / FX / マトリクスの送りのレベル、入力 → グループ / AUX などの割り当て、シーン 1–500、MIDI をそのまま）
- 受信（状態表示）はまだ。色名は資料に無いので【推測】
- 定義は `scripts/drivers/build_allenheath_dlive.py` から作る

### 8.15 Panasonic リモートカメラ AW-HE / AW-UE（HTTP・オーナー指示 2026-10-17）
- 接続：HTTP の GET `/cgi-bin/aw_ptz?cmd=%23…&res=1`（雲台）・`/cgi-bin/aw_cam?cmd=…&res=1`（カメラ）【確認済：「HD Integrated Camera Interface Specifications V1.07E」】
- 動作 45：8 方向のパン・チルト（速さ 1–49）、止める・ホーム・位置、ズーム / フォーカス（速さ・位置・AF・ワンタッチ AF）、アイリス、ゲイン、シャッター、ペデスタル、ND、AWB / ABB、カラーバー、シーン、プリセット（呼び出し・記憶・内容・速さ・時間）、電源、タリー、設置の向き、SD 収録、命令をそのまま
- ゲイン・ペデスタル・タリー・プリセットの内容と動き方・SD 収録は公開 OSS のモジュールの送信で補った。シャッター・ND・シーンの番号は機種で違う【推測】
- 定義は `scripts/drivers/build_panasonic.py` から作る

### 8.16 Allen & Heath Qu シリーズ（MIDI over TCP・オーナー指示 2026-10-17）
- 接続：TCP **51325**（同時に 1 接続）。ミュートは `9N CH 7F/3F 9N CH 00`、フェーダー NRPN 17、送り NRPN 20、パン NRPN 16、ミュートグループ / DCA 割り当て NRPN 5C / 40、シーン `BN 00 00 BN 20 00 CN SS`【確認済：「Qu MIDI Protocol V1.9」】
- 動作 49（入力・ステレオ・FX・ミックス・グループ・マトリクス・DCA・ミュートグループのミュート、フェーダー（資料の dB 表・数値）、送り、パン、割り当て、シーン、カスタムレイヤー、MMC、MIDI をそのまま）
- 定義は `scripts/drivers/build_allenheath_qu.py` から作る

### 8.17 Allen & Heath CQ シリーズ（MIDI over TCP・オーナー指示 2026-10-17）
- 接続：TCP **51325**、MIDI チャンネル 1 固定。SQ と同じ NRPN【確認済：「CQ MIDI Protocol V1.2.0 issue 4」】
- 動作 15（ミュート・切り替え、入力 → LR / 出力 / FX のレベル、FX リターン、マスター、パン、シーン、ソフトキー、MIDI をそのまま。対象は選択肢で選ぶ）
- 定義は `scripts/drivers/build_allenheath_cq.py` から作る

### 8.4 根拠の扱い
- 各ドライバの `evidence` に資料名・URL・確認日・状態（確認済／推測／不明）を持たせ、機器の「診断」に表示する。
- 公式アプリや他社ソフトの通信の解析結果も根拠に使ってよい（2026-10-17 オーナー指示）。evidence の note に「〇〇の通信の観測」と出典を書く。

## 9. 保存・書き出し・読み込み

- 保存先：アプリの Documents 配下 `shows/<showId>/show.json`、画像は `shows/<showId>/images/<imageId>.png`、保持する変数値は `shows/<showId>/state.json`
- 変更から 500ms 後に自動保存（連続変更はまとめる）。書き込みは一時ファイル→置き換えで壊れないようにする
- 書き出し：`.conductor`（zip：`show.json`＋画像）を共有シートで。ページ単位・トリガー単位も同じ形式で中身を絞る
- 読み込み：ファイルを開く／共有から受け取る → 内容の一覧（ページ数・機器・トリガー）を見せて「新しいショーとして」か「今のショーに追加」を選ぶ
- `schemaVersion` で将来の形式変更に対応（読み込み時に変換）

## 10. 状態管理

- `zustand`：`useShowStore`（保存するショー）、`useRuntimeStore`（機器状態・変数値・実行中・ログ）
- 保存するデータの変更は必ず store のアクション経由。Undo は `immer` のパッチ履歴で 50 手まで（3 本指スワイプ／シェイクはシステム標準のまま）
- 機器状態・変数の変化はドライバ → イベント → `useRuntimeStore` → 関係するボタンだけ再描画（ボタンごとに selector で購読）

## 11. iOS の制約への対応

- 前面にいる間だけ接続・トリガーが動く。設定・トリガー画面に「アプリが前面にある間だけ動きます」と明記
- ローカルネットワーク許可：最初の機器を追加した時に要求。`NSLocalNetworkUsageDescription`「LAN 上の映像・音響機器と通信するために使います。」
- 画面スリープ防止：`expo-keep-awake`
- 触覚：`expo-haptics`

## 12. ディレクトリ構成

```
conductor/
├─ app/                         # expo-router
│  ├─ _layout.tsx               # NativeTabs（iPad は sidebarAdaptable）
│  ├─ (tabs)/buttons/index.tsx  # ボタン（iPad：盤＋設定欄 / iPhone：盤）
│  ├─ (tabs)/buttons/edit.tsx   # iPhone のボタン編集シート
│  ├─ (tabs)/devices/…          # 機器 一覧・編集・追加
│  ├─ (tabs)/triggers/…         # トリガー
│  ├─ (tabs)/variables/…        # 変数
│  ├─ (tabs)/images/…           # 画像（iPhone は設定から）
│  ├─ (tabs)/settings/…         # 設定・ログ・書き出し
│  └─ show.tsx                  # 本番（全画面モーダル）
├─ src/
│  ├─ components/               # ButtonTile, ButtonGrid, ActionRow, StyleEditor …
│  ├─ engine/                   # 実行・ステップ・長押し・トリガー・状態表示
│  ├─ expression/               # 式パーサーと評価
│  ├─ variables/                # 変数解決
│  ├─ drivers/
│  │  ├─ types.ts
│  │  ├─ generic-tcp/ generic-udp/ generic-osc/ generic-http/
│  │  ├─ roland-v/              # V-160HD / V-80HD / VR-120HD
│  │  └─ atem/
│  ├─ storage/                  # 保存・書き出し・読み込み・変換
│  ├─ stores/                   # zustand
│  └─ theme/                    # PlatformColor の名前、ボタン色の候補
├─ modules/
│  ├─ conductor-net/            # Swift：TCP/UDP（Network.framework）
│  └─ conductor-midi/           # Swift：CoreMIDI（M5）
├─ mock/                        # モック機器サーバー（Node）：TCP/UDP/OSC/HTTP/Roland 風
├─ tests/                       # jest：エンジン・式・変数・ドライバの組み立て/解析
├─ docs/SPEC.md, docs/design/
└─ scripts/design/build_svgs.py # デザイン SVG の生成
```

## 13. モックとテスト

- `mock/`：Node 製の模擬機器。汎用 TCP エコー、UDP/OSC 受信表示、HTTP、Roland 風（`DTH/RQH` に `ack`・タリー状態を返す。値は架空）
- デモモード：ショー `DEMO-SHOW` と架空機器 `DEMO-SW-A` などを入れて、通信せずに状態だけ動かす（テスト・開発用。アプリの初回起動では入れず、空のショー「ショー 1」から始める。2026-10-17 オーナー指示）
- 単体テスト：式、変数解決、ステップ／長押し／順番・同時実行、状態表示の評価、Roland・OSC のバイト列組み立て、保存形式の変換
- マイルストーンごとに `tsc --noEmit`・`jest`・`expo-doctor` を通してからコミット

## 14. 受け入れ条件

1. iPad 横・縦、iPhone 縦・横で、デザインの画面がすべて表示・操作できる
2. ボタンを作り、見た目（名前・文字・文字色・背景色・揃え・画像）を変えると盤と本番に即反映される
3. 本番でボタンを押すと、押下表現（押している／送れた／送れなかった）が 4 章どおりに出る
4. 汎用 TCP で、押した時・離した時・長押し・ステップ・順番/同時・待ち時間がモック機器のログで確認できる
5. 状態表示：モック機器の状態変化で 500ms 以内にボタンの色が変わる
6. トリガー：時刻・一定間隔・変数変化・機器切断で動作が実行される
7. 書き出したファイルを別端末で読み込み、同じ表示・動作になる
8. アプリを裏に回して戻すと、機器が自動で再接続される
9. VoiceOver・Dynamic Type 200%・ダーク/ライトで設定画面が使える
10. Roland V-80HD 実機で PGM 切替・タリー表示ができる（M3）
11. 本番に入る時にロック確認が出る。本番で下部の帯を左右スワイプしても、ボタンの動作は送られない

## 15. マイルストーン

| M | 内容 | 完了の印 |
|---|---|---|
| M1 | 土台：Expo 構成、NativeTabs（iPad サイドバー）、ショーの保存、ボタン盤と見た目編集、本番画面（押下表現・ロック）、デモモード | TestFlight で触れる |
| M2 | 動作エンジン（ステップ・長押し・順番/同時）、汎用 TCP/UDP/OSC/HTTP、`conductor-net`、モック、ログ | 受け入れ 4 |
| M3 | Roland V シリーズ（LAN）：動作・状態表示・変数・プリセット・診断 | 受け入れ 10 |
| M4 | トリガー、変数（自分で作る・式・内部・ボタン変数）、画像、書き出し/読み込み | 受け入れ 6, 7 |
| M5 | ATEM ドライバ、Roland USB/Bluetooth MIDI | 実機確認 |

各 M：テスト／型チェック／expo-doctor → コミット → push → kajisho5/runway・hangar の共通基盤で TestFlight。

## 15.5 apple-hig skill による照合（画面・メニュー）

`anthropic-skills:apple-hig` の必須チェックリストと各節で `docs/design/` を照合した結果。実装もこの表に従う。

| 項目（skill の節） | 決め事 |
|---|---|
| タップ領域 44×44pt（必須チェックリスト／Buttons） | 自作の丸ボタン・ピル・チップ・色見本は見た目が小さくても当たり判定を 44pt にする（`hitSlop`）。ツールバーの丸ボタン・盤の下の操作ボタンは見た目も 44pt |
| 文字 最小 11pt・本文 17pt・Dynamic Type 200%（Typography） | 設定欄・一覧はテキストスタイル（Body 17 / Footnote 13 / Caption 2 11）。ボタン盤のボタン内の文字だけは見た目タブの大きさに従う（内容なので） |
| 色はシステム色、hex 禁止（Color） | UI は PlatformColor。ボタンの文字色・背景色だけはユーザーが選ぶ内容の色 |
| タブバー：ナビゲーション専用・最小限・ラベル 1 語・SF Symbols は塗り（Tab bars） | iPhone 5 タブ（ボタン／機器／トリガー／変数／設定）、記号は `.fill` 版（`square.grid.2x2.fill` `cable.connector` `bolt.fill` `dollarsign` `gearshape.fill`）。本番はタブにせず［本番］ボタンから |
| バッジは重要情報だけ（Tab bars） | サイドバー・タブにバッジを付けない（トリガー件数のバッジは削除） |
| ツールバー：主要アクション 1 つ・後縁・`.prominent`（Toolbars） | ボタン画面＝［本番］、編集シート＝［完了］、トリガー＝［テスト］ |
| 使えない機能はボタンを置かない（判断の原則） | ［停止］は動作の実行中だけ出す。接続していない機器の動作は一覧に出すが、実行時に「送れなかった」表現 |
| セグメントは名詞・iPhone で 5 以下（Segmented controls） | 設定欄の切替「ボタン／ページ／プリセット」、タブ「動作／見た目／状態表示／変数／その他」（iPad・iPhone で同じ。「設定」タブと紛れないよう 2026-10-17 に変更） |
| スイッチはリスト行の中だけ（Toggles） | 有効/無効・振動などはすべて一覧の行 |
| シート：Cancel と Done を併置、グラバー、large（Sheets） | iPhone のボタン編集シートは［キャンセル］［完了］、large デテント |
| ポップオーバー：矢印が呼び出し元を指す（Popovers） | 「＋ 動作を追加」の一覧、［本番］のロック確認（iPad） |
| アクションシート：Cancel は最下部（Action sheets） | 本番のロック確認（iPhone） |
| 破壊的操作（Alerts／Menus） | 「ページを空にする」「ページを削除」「機器を削除」は赤字で、⋯ メニューや一覧の最下部に分けて置く。取り消し（Undo）で戻せる |
| 長押しメニューの項目はメイン UI にも置く（Context menus） | 盤の長押し（コピー／移動／入れ替え／削除）と同じ操作を盤の下にも置く |
| 説明文で画面を肥大化させない（Offering help） | 常設の説明文・凡例は置かない。初回だけ TipKit のヒント（「ボタンを押すと右側で設定できます」） |
| 空の画面には次の手順（Writing） | 機器・トリガー・ページが空なら、説明 1〜2 行＋［機器を追加］などの主要ボタン |
| 文言：能動態・ボタンは動詞・「we」を使わない（Writing） | 「機器を追加」「テスト」「ロックして本番へ」など。エラーは直し方を書く（例「IP アドレスを確認してください」） |
| 許可要求は必要になった時（Privacy） | ローカルネットワーク許可は最初の機器を追加した時 |
| 起動画面にロゴ・文字なし（Launching） | 起動画面は最初の画面と同じ背景色だけ |
| ハプティクスはシステムパターン・無くても使える（Playing haptics） | 4 章の振動は `UIImpactFeedbackGenerator` / `UINotificationFeedbackGenerator`、設定でオフにできる |
| 視差効果を減らす（Motion／Accessibility） | 4 章どおり、縮小・揺れ・広がりをやめて枠の色だけ |
| アプリ独自の外観設定を作らない（Dark Mode） | ライト/ダークはシステムに従う。ダークの値で描いたデザインは表示例 |
| サイズクラスで分岐（Layout） | iPad でも Split View で幅が狭いときは iPhone と同じ構成になる |

## 16. 決定事項（オーナー回答 2026-10-17）

1. 長押しが成立しても「離した時」の動作は実行する（Companion と同じ）
2. 本番に入る時に「ロックしますか？」と聞く（3.4）
3. iPhone 縦は 4 列ずつ表示。スワイプ中に誤ってボタンが押されないようにする（3.5）
4. ドライバは JSON の定義として GitHub / Cloudflare から更新できるようにする。コードは配らない（7.1）
5. iPhone Duo にも対応する：外側画面は compact、内側画面は regular の構成。どのポーズでも同じ機能（HIG Designing for iPhone Duo）

## 参考資料

- Roland「V-160HD Remote Control Guide」（TCP 8023・コマンド形式）：https://shop.ccisolutions.com/StoreFront/jsp/pdf/RND-V-160HD_remoteControlGuide.pdf
- Roland サポート「V-160HD LAN and RS-232 Control Tips」：https://support.roland.com/hc/en-us/articles/7816887053083-V-160HD-LAN-and-RS-232-Control-Tips
- atem-connection（MIT）：https://npmjs.com/package/atem-connection
- Expo Native Tabs（`sidebarAdaptable`）：https://docs.expo.dev/versions/latest/sdk/router/native-tabs/
- Companion ユーザーガイド（画面構成の参考）：https://companion.free/user-guide/v4.3/category/configuration-gui
- Apple Human Interface Guidelines：https://developer.apple.com/design/human-interface-guidelines
