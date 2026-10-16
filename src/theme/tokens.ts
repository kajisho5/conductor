import { Platform, PlatformColor, type ColorValue, type TextStyle } from 'react-native';

/**
 * 色・寸法・文字のトークン（SPEC 15.5）。
 * 色は iOS の semantic system color を PlatformColor で参照し、値をハードコードしない。
 * 第 2 引数はテスト環境・iOS 以外での表示用フォールバック（デザインのダーク値）で、iOS では使われない。
 * UI コードは必ずこの `color` を経由する。例外はボタンの文字色・背景色（ユーザーが選ぶ内容の色）と、下の onTint / scrim。
 */
function sys(name: string, fallback: string): ColorValue {
  return Platform.OS === 'ios' ? PlatformColor(name) : fallback;
}

export const color = {
  bg: sys('systemBackground', '#000000'),
  group: sys('secondarySystemBackground', '#1C1C1E'),
  card: sys('tertiarySystemBackground', '#2C2C2E'),
  /** 一覧画面（insetGrouped）の背景と、その上のカード */
  groupedBg: sys('systemGroupedBackground', '#000000'),
  groupedCard: sys('secondarySystemGroupedBackground', '#1C1C1E'),
  fill: sys('tertiarySystemFill', '#3A3A3C'),
  fill2: sys('systemGray4', '#3A3A3C'),
  fill4: sys('quaternarySystemFill', '#2A2A2C'),
  sep: sys('separator', '#38383A'),
  label: sys('label', '#FFFFFF'),
  label2: sys('secondaryLabel', '#EBEBF599'),
  label3: sys('tertiaryLabel', '#EBEBF54D'),
  accent: sys('systemBlue', '#0A84FF'),
  ok: sys('systemGreen', '#30D158'),
  warn: sys('systemOrange', '#FF9F0A'),
  danger: sys('systemRed', '#FF453A'),
  gray: sys('systemGray', '#8E8E93'),
  /** 色付き塗り（アクセント等）の上の文字。UIKit のボタン既定と同じ白（PlatformColor は 'white' を解決しないため固定値） */
  onTint: '#FFFFFF' as ColorValue,
  /** 下地を暗くするスクリム（固定の黒） */
  scrim: '#000000' as ColorValue,
} as const;

export type ColorToken = keyof typeof color;

/** 最小タップ領域（HIG：44×44pt） */
export const MIN_TAP = 44;

export const radius = {
  button: 12,
  showButton: 14,
  card: 12,
  field: 10,
  pill: 999,
} as const;

/** ボタン盤の寸法（docs/design 00-parts の「寸法」） */
export const board = {
  gapRegular: 8,
  gapCompact: 10,
  gapShow: 12,
  sideRegular: 20,
  sideCompact: 16,
} as const;

export const font = {
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
} as const;

/** Dynamic Type の既定サイズ（Large）に合わせたテキストスタイル */
export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700' } satisfies TextStyle,
  title2: { fontSize: 22, fontWeight: '700' } satisfies TextStyle,
  headline: { fontSize: 17, fontWeight: '600' } satisfies TextStyle,
  body: { fontSize: 17, fontWeight: '400' } satisfies TextStyle,
  callout: { fontSize: 16, fontWeight: '400' } satisfies TextStyle,
  subhead: { fontSize: 15, fontWeight: '400' } satisfies TextStyle,
  footnote: { fontSize: 13, fontWeight: '400' } satisfies TextStyle,
  caption: { fontSize: 12, fontWeight: '400' } satisfies TextStyle,
  caption2: { fontSize: 11, fontWeight: '400' } satisfies TextStyle,
} as const;

/** ボタン色の候補（ユーザーが選ぶ内容の色。docs/design 00-parts「ボタン色」） */
export const BUTTON_COLORS = [
  '#2A2A2E',
  '#151517',
  '#050505',
  '#E9E9EC',
  '#E0302B',
  '#1F9E48',
  '#1F5FD6',
  '#F2C200',
  '#E07800',
  '#7A3FD0',
  '#0F8A9E',
  '#3F3FB8',
  '#6E1616',
] as const;

export const TEXT_COLORS = ['#FFFFFF', '#000000', '#F2C200', '#E0302B', '#1F9E48', '#1F5FD6', '#8E8E93'] as const;

/** ボタン背景の明るさ（0..1）。文字色「自動」の判定に使う */
export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length < 6) return 0;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
