import { cellKey } from './grid';
import { newId } from './id';
import type { ActionModel, ButtonModel, ButtonStyle, Device, FeedbackRule, Page, Show, ShowSettings, Step } from './types';

export const DEFAULT_GRID = { columns: 8, rows: 4 } as const;

export const DEFAULT_SETTINGS: ShowSettings = {
  showTopBar: false,
  showStatusIcons: true,
  lockOnShowMode: 'ask',
  unlockHoldMs: 1500,
  haptics: true,
  keepAwake: 'showModeOnly',
  showModeSwipe: false,
};

export const DEFAULT_STYLE: ButtonStyle = {
  text: '',
  textSize: 'auto',
  alignH: 'center',
  alignV: 'center',
  textColor: 'auto',
  backgroundColor: '#2A2A2E',
  showTopBar: 'inherit',
};

export function emptyStep(): Step {
  return {
    id: newId(),
    press: { mode: 'sequential', actions: [] },
    release: { mode: 'sequential', actions: [] },
    holds: [],
  };
}

export function newButton(partial?: Partial<Omit<ButtonModel, 'style'>> & { style?: Partial<ButtonStyle> }): ButtonModel {
  return {
    id: newId(),
    name: partial?.name ?? '',
    notes: partial?.notes ?? '',
    style: { ...DEFAULT_STYLE, ...(partial?.style ?? {}) },
    steps: partial?.steps ?? [emptyStep()],
    feedbacks: partial?.feedbacks ?? [],
    localVariables: partial?.localVariables ?? [],
    options: partial?.options ?? { stepProgression: 'auto', allowStyleChangeByActions: true },
  };
}

export function newPage(number: number, name: string): Page {
  return { id: newId(), number, name, buttons: {} };
}

export function newShow(name: string): Show {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    grid: { ...DEFAULT_GRID },
    pages: [newPage(1, 'ページ 1')],
    devices: [],
    triggers: [],
    customVariables: [],
    expressionVariables: [],
    images: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/* ---------------------------------------------------------------------------
 * デモショー（DEMO-SHOW）。実機なしで画面と押下表現を確かめるためのもの。
 * 機器・名前はすべて架空（CLAUDE.md）。機器は demo ドライバで、通信はしない。
 * ------------------------------------------------------------------------- */

const COLORS = {
  neutral: '#2A2A2E',
  dark: '#151517',
  black: '#050505',
  white: '#E9E9EC',
  red: '#E0302B',
  green: '#1F9E48',
  blue: '#1F5FD6',
  yellow: '#F2C200',
  orange: '#E07800',
  purple: '#7A3FD0',
  teal: '#0F8A9E',
  indigo: '#3F3FB8',
  maroon: '#6E1616',
} as const;

function act(deviceId: string, definitionId: string, options: ActionModel['options'], delayMs = 0): ActionModel {
  return { id: newId(), deviceId, definitionId, options, delayMs, enabled: true };
}

function fbEquals(deviceId: string, key: string, value: string, backgroundColor: string): FeedbackRule {
  return {
    id: newId(),
    deviceId,
    definitionId: 'demo.equals',
    options: { key, value },
    invert: false,
    style: { backgroundColor },
    enabled: true,
  };
}

function stepWith(press: ActionModel[]): Step {
  return { id: newId(), press: { mode: 'sequential', actions: press }, release: { mode: 'sequential', actions: [] }, holds: [] };
}

function demoButton(name: string, text: string, bg: string, press: ActionModel[], feedbacks: FeedbackRule[] = []): ButtonModel {
  return newButton({ name, style: { text, backgroundColor: bg }, steps: [stepWith(press)], feedbacks });
}

export const DEMO_DEVICE_IDS = {
  sw: 'demo-sw-a',
  atem: 'demo-atem',
  mixer: 'demo-mixer',
  rec: 'demo-rec',
  http: 'demo-http',
} as const;

export function demoDevices(): Device[] {
  return [
    {
      id: DEMO_DEVICE_IDS.sw,
      label: 'DEMO-SW-A',
      driverId: 'demo',
      driverVersion: '1.0',
      enabled: true,
      config: { model: 'デモ（映像スイッチャー）', behavior: 'ok' },
    },
    {
      id: DEMO_DEVICE_IDS.atem,
      label: 'DEMO-ATEM',
      driverId: 'demo',
      driverVersion: '1.0',
      enabled: true,
      config: { model: 'デモ（映像スイッチャー）', behavior: 'ok' },
    },
    {
      id: DEMO_DEVICE_IDS.mixer,
      label: 'DEMO-MIXER',
      driverId: 'demo',
      driverVersion: '1.0',
      enabled: true,
      config: { model: 'デモ（音声ミキサー）', behavior: 'ok' },
    },
    {
      id: DEMO_DEVICE_IDS.rec,
      label: 'DEMO-REC',
      driverId: 'demo',
      driverVersion: '1.0',
      enabled: true,
      config: { model: 'デモ（レコーダー）', behavior: 'reconnecting' },
    },
    {
      id: DEMO_DEVICE_IDS.http,
      label: 'DEMO-HTTP',
      driverId: 'demo',
      driverVersion: '1.0',
      enabled: false,
      config: { model: 'デモ（HTTP）', behavior: 'ok' },
    },
  ];
}

const SOURCES = ['CAM 1', 'CAM 2', 'CAM 3', 'CAM 4', 'PC 1', 'PC 2', 'VTR', 'STILL'] as const;

export function demoShow(): Show {
  const show = newShow('DEMO-SHOW');
  show.devices = demoDevices();
  const sw = DEMO_DEVICE_IDS.sw;
  const mixer = DEMO_DEVICE_IDS.mixer;
  const rec = DEMO_DEVICE_IDS.rec;

  const p1 = newPage(1, '本番');
  SOURCES.forEach((src, col) => {
    p1.buttons[cellKey(0, col)] = demoButton(
      `PGM ${src}`,
      `PGM\n${src}`,
      COLORS.neutral,
      [act(sw, 'demo.set', { key: 'pgm', value: src })],
      [fbEquals(sw, 'pgm', src, COLORS.red)],
    );
    p1.buttons[cellKey(1, col)] = demoButton(
      `PST ${src}`,
      `PST\n${src}`,
      COLORS.neutral,
      [act(sw, 'demo.set', { key: 'pst', value: src })],
      [fbEquals(sw, 'pst', src, COLORS.green)],
    );
  });
  p1.buttons[cellKey(2, 0)] = demoButton('CUT', 'CUT', COLORS.white, [act(sw, 'demo.swap', { a: 'pgm', b: 'pst' })]);
  p1.buttons[cellKey(2, 1)] = demoButton('AUTO', 'MIX\nAUTO', COLORS.yellow, [act(sw, 'demo.swap', { a: 'pgm', b: 'pst' }, 300)]);
  p1.buttons[cellKey(2, 2)] = demoButton(
    'FTB',
    'FTB',
    COLORS.black,
    [act(sw, 'demo.toggle', { key: 'ftb' })],
    [fbEquals(sw, 'ftb', 'ON', COLORS.maroon)],
  );
  p1.buttons[cellKey(2, 3)] = demoButton(
    'DSK 1',
    'DSK 1',
    COLORS.neutral,
    [act(sw, 'demo.toggle', { key: 'dsk1' })],
    [fbEquals(sw, 'dsk1', 'ON', COLORS.blue)],
  );
  p1.buttons[cellKey(2, 6)] = demoButton('OPENING 一式', 'マクロ\nOPENING', COLORS.purple, [
    act(sw, 'demo.set', { key: 'pst', value: 'CAM 1' }),
    act(sw, 'demo.swap', { a: 'pgm', b: 'pst' }, 200),
    act(mixer, 'demo.set', { key: 'mic1', value: 'ON' }, 0),
  ]);
  p1.buttons[cellKey(2, 7)] = demoButton('VTR ページへ', 'ページ\n→ VTR', COLORS.dark, [act('internal', 'internal.page', { page: 2 })]);
  p1.buttons[cellKey(3, 0)] = demoButton(
    'MIC 1',
    'MIC 1',
    COLORS.neutral,
    [act(mixer, 'demo.toggle', { key: 'mic1' })],
    [fbEquals(mixer, 'mic1', 'ON', COLORS.teal)],
  );
  p1.buttons[cellKey(3, 1)] = demoButton(
    'MIC 2',
    'MIC 2',
    COLORS.neutral,
    [act(mixer, 'demo.toggle', { key: 'mic2' })],
    [fbEquals(mixer, 'mic2', 'ON', COLORS.teal)],
  );
  p1.buttons[cellKey(3, 2)] = demoButton(
    'BGM',
    'BGM',
    COLORS.neutral,
    [act(mixer, 'demo.toggle', { key: 'bgm' })],
    [fbEquals(mixer, 'bgm', 'ON', COLORS.orange)],
  );
  p1.buttons[cellKey(3, 7)] = demoButton('REC', 'REC', COLORS.red, [act(rec, 'demo.toggle', { key: 'rec' })]);

  const p2 = newPage(2, 'VTR');
  p2.buttons[cellKey(0, 0)] = demoButton('本番ページへ', 'ページ\n→ 本番', COLORS.dark, [act('internal', 'internal.page', { page: 1 })]);
  ['VTR 1', 'VTR 2', 'VTR 3', 'VTR 4'].forEach((v, i) => {
    p2.buttons[cellKey(1, i)] = demoButton(
      v,
      v,
      COLORS.indigo,
      [act(sw, 'demo.set', { key: 'vtr', value: v })],
      [fbEquals(sw, 'vtr', v, COLORS.red)],
    );
  });

  const p3 = newPage(3, '音声');
  p3.buttons[cellKey(0, 0)] = demoButton('本番ページへ', 'ページ\n→ 本番', COLORS.dark, [act('internal', 'internal.page', { page: 1 })]);

  show.pages = [p1, p2, p3];
  return show;
}
