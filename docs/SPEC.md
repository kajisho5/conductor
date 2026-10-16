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
   - オプションタブ：ステップの進み方（手動／押すたびに次へ／式で決める）、動作からの見た目変更を許可
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

外部コントローラ（USB ボタン盤・Stream Deck 等）、Remote（ネットワーク越しのボタン盤）、Protocols（外部から操作を受ける TCP/UDP/HTTP/OSC/RossTalk/Ember+/Art-Net/Satellite API）、Modules 画面、Action Recorder、日の出・日の入り／PC のロックのきっかけ、HTTPS、利用統計。

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
- 送るコマンド：CPgI / CPvI / DCut / DAut / FtbA / MAct / CDsL / CAuS。受けるコマンド：_pin / PrgI / PrvI / TlSr / InPr / FtbS / DskS / AuxS / InCm【確認済：同ライブラリの serialize / deserialize】。DSK の AUTO（DDsA）は本体の版で中身が変わるので入れない
- 模擬機器：`npm run mock:atem`
- 【未実装・オーナー要望メモ 2026-10-17】メディアプールのスチル操作：①メディアプレーヤーに出すスチルを選ぶ ②スチルを消す ③スチル一覧（名前・空き）を変数にする ④iPhone / iPad の画像をスチルとして入れる（ATEM の解像度・形式へ変換し、ファイル転送の手順で送る。①〜③より大きい作業）。atem-connection の該当部分を参考にする。着手は未定

### 8.5 Roland の USB / Bluetooth MIDI（M5）
- Swift の `modules/conductor-midi`（CoreMIDI。kajisho5/crosspoint の crosspoint-midi を元にした）
- Roland の定義に `midiModelId`（V-160HD `00 00 00 00 02`、V-80HD `01 05 14`、VR-120HD `00 00 00 00 25`）。機器の設定「接続」で LAN / USB・Bluetooth MIDI を選ぶ
- 送る内容は LAN の命令（`DTH:…;` `RQH:…;`）を DT1 / RQ1 に置き換える。`CUT;` などの簡易制御コマンドは MIDI では使えない（「送れなかった」と理由を出す）。MIDI には ack が無いので、送信できた時点で「送れた」
- 届いた DT1 は LAN と同じ addr_XXXXXX の変数にし、定義の derive で pgm / pst / tally を作る
- CoreMIDI モジュールは同時に 1 つの機器だけ開くので、MIDI で使える機器は 1 台まで
- Bluetooth の機器は機器の画面の「Bluetooth MIDI の機器を追加」（システムのピッカー）で追加。Bluetooth の許可はその時に聞かれる

### 8.4 根拠の扱い
- 各ドライバの `evidence` に資料名・URL・確認日・状態（確認済／推測／不明）を持たせ、機器の「診断」に表示する。
- 公式アプリや他社ソフトの通信の解析・傍受はしない。

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
- デモモード：ショー `DEMO-SHOW` と架空機器 `DEMO-SW-A` などを入れて、通信せずに状態だけ動かす
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
| セグメントは名詞・iPhone で 5 以下（Segmented controls） | 設定欄の切替「ボタン／ページ／プリセット」、タブ「動作／見た目／状態表示／変数／オプション」（iPhone は「動作／見た目／状態／変数／設定」） |
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
