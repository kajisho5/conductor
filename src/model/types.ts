/**
 * 保存データの型（SPEC 5 章）。値の意味は SPEC を正とする。
 */

export type OptionValue = string | number | boolean | { expression: string };

export interface ButtonStyle {
  /** 表示する文字。変数埋め込み可、\n で改行 */
  text: string;
  textSize: 'auto' | 'small' | 'medium' | 'large' | number;
  alignH: 'leading' | 'center' | 'trailing';
  alignV: 'top' | 'center' | 'bottom';
  /** '#RRGGBB' または 'auto'（背景の明るさで白/黒） */
  textColor: string;
  /** '#RRGGBB'（ユーザーが選ぶ内容の色） */
  backgroundColor: string;
  imageId?: string;
  showTopBar: 'inherit' | 'show' | 'hide';
}

export interface ActionModel {
  id: string;
  deviceId: string | 'internal';
  definitionId: string;
  options: Record<string, OptionValue>;
  delayMs: number;
  enabled: boolean;
}

export interface ActionList {
  mode: 'sequential' | 'concurrent';
  actions: ActionModel[];
}

export interface HoldGroup {
  id: string;
  durationMs: number;
  repeat: boolean;
  actions: ActionList;
}

export interface Step {
  id: string;
  name?: string;
  press: ActionList;
  release: ActionList;
  holds: HoldGroup[];
}

export interface FeedbackRule {
  id: string;
  deviceId: string | 'internal';
  definitionId: string;
  options: Record<string, OptionValue>;
  invert: boolean;
  style: Partial<Pick<ButtonStyle, 'text' | 'textColor' | 'backgroundColor' | 'imageId'>>;
  enabled: boolean;
}

export interface LocalVariable {
  id: string;
  name: string;
  kind: 'value' | 'expression';
  value: string;
}

export interface ButtonModel {
  id: string;
  /** ボタン名（一覧などで見分ける名前） */
  name: string;
  notes: string;
  style: ButtonStyle;
  steps: Step[];
  feedbacks: FeedbackRule[];
  localVariables: LocalVariable[];
  options: {
    stepProgression: 'manual' | 'auto' | 'expression';
    stepExpression?: string;
    allowStyleChangeByActions: boolean;
  };
}

export interface Page {
  id: string;
  /** 1 始まり、表示順 */
  number: number;
  name: string;
  /** key = "row/col"（0 始まり） */
  buttons: Record<string, ButtonModel>;
}

export interface Device {
  id: string;
  /** 変数名にも使う（英数字・-・_） */
  label: string;
  driverId: string;
  driverVersion: string;
  enabled: boolean;
  config: Record<string, OptionValue>;
}

export type TriggerEvent =
  | { type: 'buttonPress' | 'buttonRelease' }
  | { type: 'conditionTrue' | 'conditionFalse' }
  | { type: 'variableChanged'; variable: string }
  | { type: 'interval'; seconds: number }
  | { type: 'timeOfDay'; time: string; weekdays: number[] }
  | { type: 'appStart' }
  | { type: 'deviceConnected' | 'deviceDisconnected'; deviceId: string };

export interface Trigger {
  id: string;
  name: string;
  notes: string;
  enabled: boolean;
  events: TriggerEvent[];
  conditions: FeedbackRule[];
  actions: ActionList;
  localVariables: LocalVariable[];
}

export interface CustomVariable {
  id: string;
  name: string;
  defaultValue: string;
  persist: boolean;
}

export interface ExpressionVariable {
  id: string;
  name: string;
  expression: string;
}

export interface ImageAsset {
  id: string;
  name: string;
  file: string;
  width: number;
  height: number;
}

export interface ShowSettings {
  showTopBar: boolean;
  showStatusIcons: boolean;
  /** 本番に入る時のロック（SPEC 3.4） */
  lockOnShowMode: 'ask' | 'always' | 'never';
  unlockHoldMs: number;
  haptics: boolean;
  keepAwake: 'showModeOnly' | 'always';
  /** 本番でボタンの上からもスワイプで切替（SPEC 3.5、既定 false） */
  showModeSwipe: boolean;
  /** USB ボタン盤（SPEC 2.5、iPad のみ）。無ければ既定（src/engine/panel.ts の DEFAULT_USB_PANEL） */
  usbPanel?: UsbPanelSettings;
}

/** USB ボタン盤の設定（SPEC 2.5） */
export interface UsbPanelSettings {
  /** 'follow' = iPad と同じページ、数字 = 決まったページ */
  page: 'follow' | number;
  /** 盤の何行目・何列目から出すか（1 始まり） */
  row: number;
  col: number;
  /** 明るさ 0–100 */
  brightness: number;
  /** ボタン画面（編集中）でもキーで押せる */
  editPress: boolean;
}

export interface Show {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  grid: { columns: number; rows: number };
  pages: Page[];
  devices: Device[];
  triggers: Trigger[];
  customVariables: CustomVariable[];
  expressionVariables: ExpressionVariable[];
  images: ImageAsset[];
  settings: ShowSettings;
}
