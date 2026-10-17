import type { Show, StreamDeckEntry, StreamDeckModelId } from './types';
import { newId } from './id';

/**
 * Stream Deck の機種（SPEC 2.5.1）。キーの数・並び・キーの絵の大きさ・製品番号は
 * StreamDeckKit（MIT、github.com/elgatosf/streamdeck-kit-ipad）の StreamDeckProduct / StreamDeckProductId / Simulator の値。
 */
export interface StreamDeckModel {
  id: StreamDeckModelId;
  /** 表示名 */
  label: string;
  /** 一覧で短く出す名前 */
  short: string;
  keys: number;
  columns: number;
  rows: number;
  /** キーの絵の一辺（px）。0 は絵なし（ペダル） */
  keyPx: number;
  /** 使わない部分の説明（無ければ ''） */
  note: string;
  /** ドライバが返す製品番号（USB の idProduct） */
  productIds: number[];
}

export const STREAM_DECK_MODELS: readonly StreamDeckModel[] = [
  { id: 'mini', label: 'Stream Deck Mini', short: 'Mini', keys: 6, columns: 3, rows: 2, keyPx: 80, note: '', productIds: [0x0063, 0x0090, 0x00b8] },
  {
    id: 'mk2',
    label: 'Stream Deck MK.2',
    short: 'MK.2',
    keys: 15,
    columns: 5,
    rows: 3,
    keyPx: 72,
    note: '',
    productIds: [0x0060, 0x006d, 0x0080, 0x00a5, 0x00b9],
  },
  { id: 'neo', label: 'Stream Deck Neo', short: 'Neo', keys: 8, columns: 4, rows: 2, keyPx: 96, note: 'タッチキーは使いません', productIds: [0x009a] },
  { id: 'plus', label: 'Stream Deck +', short: '+', keys: 8, columns: 4, rows: 2, keyPx: 120, note: 'ダイヤルは使いません', productIds: [0x0084] },
  { id: 'xl', label: 'Stream Deck XL', short: 'XL', keys: 32, columns: 8, rows: 4, keyPx: 96, note: '', productIds: [0x006c, 0x008f, 0x00ba] },
  { id: 'plusxl', label: 'Stream Deck + XL', short: '+ XL', keys: 36, columns: 9, rows: 4, keyPx: 112, note: 'ダイヤルは使いません', productIds: [0x00c6] },
  { id: 'pedal', label: 'Stream Deck Pedal', short: 'Pedal', keys: 3, columns: 3, rows: 1, keyPx: 0, note: '絵は出ません', productIds: [0x0086] },
];

export function streamDeckModel(id: StreamDeckModelId): StreamDeckModel {
  return STREAM_DECK_MODELS.find((m) => m.id === id) ?? STREAM_DECK_MODELS[1]!;
}

/** 「15 キー（5 × 3）」 */
export function modelShape(m: StreamDeckModel): string {
  return `${m.keys} キー（${m.columns} × ${m.rows}）`;
}

/** つないだ機器の機種：製品番号で決め、表に無ければキーの並びで決める */
export function modelForPanel(p: { productId?: number; keyCount: number; columns: number; rows: number }): StreamDeckModel | null {
  if (p.productId !== undefined) {
    const byId = STREAM_DECK_MODELS.find((m) => m.productIds.includes(p.productId!));
    if (byId) return byId;
  }
  const byShape = STREAM_DECK_MODELS.filter((m) => m.keys === p.keyCount && m.columns === p.columns && m.rows === p.rows);
  // 同じ形が 2 つ以上（Neo と + など）なら決められない
  return byShape.length === 1 ? byShape[0]! : null;
}

export function streamDecks(show: Show): StreamDeckEntry[] {
  return show.settings.streamDecks ?? [];
}

export function streamDeckEditPress(show: Show): boolean {
  return show.settings.streamDeckEditPress ?? true;
}

/** 新しく登録する 1 台（名前は機種名。同じ名前があれば「… 2」） */
export function newStreamDeck(show: Show, model: StreamDeckModelId, serial?: string): StreamDeckEntry {
  const base = streamDeckModel(model).label;
  const names = new Set(streamDecks(show).map((e) => e.name));
  let name = base;
  for (let n = 2; names.has(name); n++) name = `${base} ${n}`;
  return { id: newId(), name, model, ...(serial ? { serial } : {}), page: 'follow', row: 1, col: 1, brightness: 70 };
}

export function addStreamDeck(show: Show, entry: StreamDeckEntry): Show {
  return { ...show, settings: { ...show.settings, streamDecks: [...streamDecks(show), entry] } };
}

export function updateStreamDeck(show: Show, id: string, patch: Partial<Omit<StreamDeckEntry, 'id'>>): Show {
  return {
    ...show,
    settings: { ...show.settings, streamDecks: streamDecks(show).map((e) => (e.id === id ? { ...e, ...patch } : e)) },
  };
}

export function removeStreamDeck(show: Show, id: string): Show {
  return { ...show, settings: { ...show.settings, streamDecks: streamDecks(show).filter((e) => e.id !== id) } };
}

/** 機種を変えたら覚えたシリアルは消す（別の機器になるため） */
export function changeStreamDeckModel(show: Show, id: string, model: StreamDeckModelId): Show {
  return {
    ...show,
    settings: {
      ...show.settings,
      streamDecks: streamDecks(show).map((e) => {
        if (e.id !== id || e.model === model) return e;
        const { serial: _drop, ...rest } = e;
        return { ...rest, model };
      }),
    },
  };
}

export interface ConnectedPanel {
  id: string;
  serial: string;
  productId?: number;
  keyCount: number;
  columns: number;
  rows: number;
}

/**
 * つないだ機器と登録の結びつけ（SPEC 2.5.1）。
 * 1. シリアルが同じで機種も同じ登録
 * 2. 同じ機種でシリアルを覚えていない登録（並び順で先のもの）
 * 結べなかった機器は「登録していない」。learn は新しく覚えるシリアル（登録 id → シリアル）
 */
export function bindPanels(
  entries: StreamDeckEntry[],
  panels: ConnectedPanel[],
): { bound: Map<string, StreamDeckEntry>; unregistered: ConnectedPanel[]; learn: Map<string, string> } {
  const bound = new Map<string, StreamDeckEntry>();
  const learn = new Map<string, string>();
  const used = new Set<string>();
  const unregistered: ConnectedPanel[] = [];
  const pending: ConnectedPanel[] = [];
  for (const p of panels) {
    const model = modelForPanel(p);
    const hit = model && p.serial ? entries.find((e) => !used.has(e.id) && e.model === model.id && e.serial === p.serial) : undefined;
    if (hit) {
      bound.set(p.id, hit);
      used.add(hit.id);
    } else {
      pending.push(p);
    }
  }
  for (const p of pending) {
    const model = modelForPanel(p);
    const free = model ? entries.find((e) => !used.has(e.id) && e.model === model.id && !e.serial) : undefined;
    if (free) {
      bound.set(p.id, free);
      used.add(free.id);
      if (p.serial) learn.set(free.id, p.serial);
    } else {
      unregistered.push(p);
    }
  }
  return { bound, unregistered, learn };
}
