/**
 * ドライバ定義（SPEC 7・7.1）。定義は JSON のデータで、コードを含まない。
 * アプリに組み込んだ汎用エンジン（src/drivers/engine.ts）が、この定義どおりに送信内容を組み立て、受信を解析する。
 * 文字列のテンプレートは `{{option.名前}}` `{{config.名前}}` を置き換える。$(…) の変数は実行時に先に解決する。
 */

export type Transport = 'tcp' | 'udp' | 'osc' | 'http' | 'demo' | 'internal';

export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'boolean';

export interface FieldDef {
  id: string;
  label: string;
  type: FieldType;
  default?: string | number | boolean;
  choices?: { id: string; label: string }[];
  placeholder?: string;
  /** 入力のヒント（一覧の下に小さく出す） */
  help?: string;
  min?: number;
  max?: number;
  /** text の時、この正規表現に合わないと保存できない */
  pattern?: string;
  /** text の時、等幅で表示（コマンド・アドレスなど） */
  mono?: boolean;
}

/** 送る内容のテンプレート */
export type SendTemplate =
  | { kind: 'bytes'; data: string; encoding: 'text' | 'hex'; terminator?: string }
  | { kind: 'osc'; address: string; args: { type: string; value: string }[] }
  | { kind: 'http'; method: string; path: string; headers?: Record<string, string>; body?: string; contentType?: string }
  /** デモ・内部の動作（アプリに組み込みの処理を名前で呼ぶ） */
  | { kind: 'builtin'; name: string };

export interface ActionDef {
  id: string;
  name: string;
  options: FieldDef[];
  send: SendTemplate;
  /** 一覧に出す要約（テンプレート） */
  summary?: string;
}

export type CompareOp = 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte';

export interface FeedbackDef {
  id: string;
  name: string;
  options: FieldDef[];
  /** 機器の変数（テンプレート可）と値（テンプレート可）を比べる */
  compare: { variable: string; op: CompareOp | '{{option.op}}'; value: string };
  summary?: string;
}

export interface VariableDef {
  id: string;
  name: string;
}

/** 受信の解析：区切った 1 件ごとに match（正規表現）を試し、set で変数へ入れる（$0 全体、$1… グループ） */
export interface ReceiveRule {
  match: string;
  flags?: string;
  set: { variable: string; value: string }[];
}

export interface PresetDef {
  id: string;
  category: string;
  name: string;
  text: string;
  backgroundColor?: string;
  action: { definitionId: string; options: Record<string, string | number | boolean> };
}

export interface Evidence {
  title: string;
  url?: string;
  status: '確認済' | '推測' | '不明';
  note?: string;
}

export interface DriverDefinition {
  /** 定義の形式（将来の変更に備える） */
  format: 1;
  id: string;
  name: string;
  /** 一覧での分類（汎用・映像スイッチャーなど） */
  category: string;
  version: string;
  /** この定義を使えるアプリの最低バージョン */
  minAppVersion: string;
  transport: Transport;
  configFields: FieldDef[];
  actions: ActionDef[];
  feedbacks: FeedbackDef[];
  variables: VariableDef[];
  /** 受信の区切り方（tcp/udp）。line = 改行ごと、message = 受け取った塊ごと */
  receiveSplit?: 'line' | 'message';
  receive?: ReceiveRule[];
  /** HTTP の応答を入れる変数（status / body） */
  httpResponse?: { status?: string; body?: string };
  presets?: PresetDef[];
  evidence: Evidence[];
}
