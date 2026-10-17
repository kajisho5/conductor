import { Directory, File, Paths } from 'expo-file-system';
import Constants from 'expo-constants';
import { create } from 'zustand';
import { getDefinition, isBundled, isRegistered, registerDefinition, validateDefinition } from './registry';
import type { DriverDefinition } from './types';

/**
 * 配信されるドライバ定義（SPEC 7.1）。公開リポ kajisho5/conductor-drivers の JSON を読む。プログラムは取ってこない。
 * - アプリに同梱した版（src/drivers/remote-bundle/、scripts/drivers/bundle_remote.mjs で作る）があるので、通信できなくても全部使える
 * - index.json：定義の一覧（機器を追加する画面に出す）。通信できれば新しい一覧に取り替える
 * - defs/<id>.json：機器ごとの定義。同梱の版より新しければ取ってきて Documents/drivers/defs/ に残す
 */

export const DRIVERS_BASE_URL = 'https://raw.githubusercontent.com/kajisho5/conductor-drivers/main';

export interface CatalogEntry {
  id: string;
  name: string;
  category: string;
  transport: string;
  version: string;
  minAppVersion: string;
  /** 送れる動作の数 */
  actions: number;
  /** 元のモジュールの動作の数 */
  allActions?: number;
}

export class RemoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RemoteError';
  }
}

function driversDir(): Directory {
  return new Directory(Paths.document, 'drivers');
}
function defsDir(): Directory {
  return new Directory(Paths.document, 'drivers', 'defs');
}
function indexFile(): File {
  return new File(Paths.document, 'drivers', 'index.json');
}
function defFile(id: string): File {
  return new File(Paths.document, 'drivers', 'defs', `${id}.json`);
}

export function appVersion(): string {
  return String(Constants.expoConfig?.version ?? '0.0.0');
}

/** a >= b（x.y.z を数で比べる） */
export function versionAtLeast(a: string, b: string): boolean {
  const pa = a.split('.').map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

/** 一覧の形を確かめる。おかしな行は捨てる */
/** 名前・素材の決まりで UI に出さない名前 */
const BLOCKED_NAMES = /bitfocus|companion|elgato/i;

export function parseCatalog(raw: unknown): CatalogEntry[] {
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== 1) throw new RemoteError('定義の一覧の形式が違います');
  const list = (raw as { drivers?: unknown }).drivers;
  if (!Array.isArray(list)) throw new RemoteError('定義の一覧が空です');
  const out: CatalogEntry[] = [];
  for (const e of list) {
    if (typeof e !== 'object' || e === null) continue;
    const x = e as Record<string, unknown>;
    if (typeof x.id !== 'string' || !/^[a-z0-9][a-z0-9_.-]*$/.test(x.id) || typeof x.name !== 'string') continue;
    if (isBundled(x.id)) continue;
    // UI に出せない名前（CLAUDE.md の名前の決まり）の機器は一覧に出さない
    if (BLOCKED_NAMES.test(`${x.id} ${x.name} ${typeof x.category === 'string' ? x.category : ''}`)) continue;
    out.push({
      id: x.id,
      name: x.name,
      category: typeof x.category === 'string' && x.category ? x.category : 'その他',
      transport: typeof x.transport === 'string' ? x.transport : '',
      version: typeof x.version === 'string' ? x.version : '0.0.0',
      minAppVersion: typeof x.minAppVersion === 'string' ? x.minAppVersion : '0.0.0',
      actions: typeof x.actions === 'number' ? x.actions : 0,
      allActions: typeof x.allActions === 'number' ? x.allActions : undefined,
    });
  }
  return out;
}

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
let fetcher: Fetcher = (url) => fetch(url, { cache: 'no-store' } as RequestInit);

/** テスト用 */
export function setFetcherForTesting(f: Fetcher | null): void {
  fetcher = f ?? ((url) => fetch(url, { cache: 'no-store' } as RequestInit));
}

async function getJson(url: string): Promise<unknown> {
  let res;
  try {
    res = await fetcher(url);
  } catch (e) {
    throw new RemoteError(`通信できません（${e instanceof Error ? e.message : String(e)}）`);
  }
  if (!res.ok) throw new RemoteError(`取得できません（HTTP ${res.status}）`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new RemoteError('中身が JSON ではありません');
  }
}

function ensureDir(): void {
  const d = defsDir();
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
}

/* ---------- 同梱の版 ---------- */

let bundledIndexCache: CatalogEntry[] | null = null;
let bundledDefsCache: Record<string, unknown> | null = null;

/** 同梱の一覧（小さいので起動時に読む） */
export function bundledCatalog(): CatalogEntry[] {
  if (!bundledIndexCache) {
    try {
      bundledIndexCache = parseCatalog(require('./remote-bundle/index.json'));
    } catch {
      bundledIndexCache = [];
    }
  }
  return bundledIndexCache;
}

/** 同梱の定義（大きいので使う時に初めて読む） */
export function bundledDefinition(id: string): DriverDefinition | null {
  if (!bundledDefsCache) {
    try {
      bundledDefsCache = require('./remote-bundle/defs.json') as Record<string, unknown>;
    } catch {
      bundledDefsCache = {};
    }
  }
  const raw = bundledDefsCache[id];
  if (!raw) return null;
  try {
    const def = validateDefinition(raw);
    return versionAtLeast(appVersion(), def.minAppVersion) ? def : null;
  } catch {
    return null;
  }
}

/** 一覧を合わせる（配信の版を優先し、同梱にしか無いものも残す） */
export function mergeCatalog(remote: CatalogEntry[], bundled: CatalogEntry[]): CatalogEntry[] {
  const byId = new Map(bundled.map((e) => [e.id, e]));
  for (const e of remote) byId.set(e.id, e);
  return [...byId.values()];
}

/* ---------- 一覧の状態（機器を追加する画面で使う） ---------- */

interface CatalogState {
  entries: CatalogEntry[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
  fetchedAt?: string;
  /** 取ってきている最中の定義 */
  downloading: Record<string, boolean>;
}

export const useCatalogStore = create<CatalogState>(() => ({ entries: bundledCatalog(), status: 'idle', downloading: {} }));

/** 保存してある一覧と定義を読む（起動時に 1 回。通信しない） */
export function loadCached(): void {
  try {
    const f = indexFile();
    if (f.exists) {
      const raw = JSON.parse(f.textSync()) as { fetchedAt?: string };
      useCatalogStore.setState({ entries: mergeCatalog(parseCatalog(raw), bundledCatalog()), status: 'ready', fetchedAt: raw.fetchedAt });
    }
  } catch {
    // 壊れた一覧は使わない（次に取り直す）
  }
  const d = defsDir();
  if (!d.exists) return;
  for (const entry of d.list()) {
    if (!(entry instanceof File) || !entry.name.endsWith('.json')) continue;
    try {
      const def = validateDefinition(JSON.parse(entry.textSync()));
      if (!versionAtLeast(appVersion(), def.minAppVersion)) continue;
      // アプリの更新で同梱の版の方が新しくなっていれば、保存してある古い版は使わない
      const bundled = bundledCatalog().find((e) => e.id === def.id);
      if (bundled && bundled.version !== def.version && versionAtLeast(bundled.version, def.version)) continue;
      registerDefinition(def);
    } catch {
      // 読めない定義は飛ばす
    }
  }
}

/** 一覧を取り直す */
export async function refreshCatalog(): Promise<CatalogEntry[]> {
  useCatalogStore.setState({ status: 'loading', error: undefined });
  try {
    const raw = await getJson(`${DRIVERS_BASE_URL}/index.json`);
    const entries = mergeCatalog(parseCatalog(raw), bundledCatalog());
    const fetchedAt = new Date().toISOString();
    if (!driversDir().exists) driversDir().create({ intermediates: true, idempotent: true });
    indexFile().write(JSON.stringify({ ...(raw as object), fetchedAt }));
    useCatalogStore.setState({ entries, status: 'ready', fetchedAt });
    return entries;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    useCatalogStore.setState((s) => ({ status: s.entries.length > 0 ? 'ready' : 'error', error: msg }));
    throw e;
  }
}

/**
 * 機器の定義を使えるようにする（すでにあればそのまま）。
 * 同梱の版が一覧の版と同じなら通信しない。新しい版があれば取ってきて保存し、取れなければ同梱の版を使う。
 */
export async function ensureDefinition(id: string, { force = false }: { force?: boolean } = {}): Promise<DriverDefinition> {
  if (!force && isRegistered(id)) {
    const d = getDefinition(id);
    if (d) return d;
  }
  const bundled = bundledDefinition(id);
  const entry = useCatalogStore.getState().entries.find((e) => e.id === id);
  if (bundled && !force && (!entry || entry.version === bundled.version)) {
    registerDefinition(bundled);
    return bundled;
  }
  useCatalogStore.setState((s) => ({ downloading: { ...s.downloading, [id]: true } }));
  try {
    let raw: unknown;
    try {
      raw = await getJson(`${DRIVERS_BASE_URL}/defs/${encodeURIComponent(id)}.json`);
    } catch (e) {
      if (bundled) {
        registerDefinition(bundled);
        return bundled;
      }
      throw e;
    }
    let def: DriverDefinition;
    try {
      def = validateDefinition(raw);
    } catch (e) {
      throw new RemoteError(`定義が正しくありません（${e instanceof Error ? e.message : String(e)}）`);
    }
    if (def.id !== id) throw new RemoteError('定義の id が一覧と違います');
    if (!versionAtLeast(appVersion(), def.minAppVersion))
      throw new RemoteError(`この定義はアプリ ${def.minAppVersion} 以降が必要です（今は ${appVersion()}）`);
    ensureDir();
    defFile(id).write(JSON.stringify(def));
    registerDefinition(def);
    return def;
  } finally {
    useCatalogStore.setState((s) => {
      const next = { ...s.downloading };
      delete next[id];
      return { downloading: next };
    });
  }
}

/** 保存してある定義のうち、一覧の版が新しいものを取り直す。戻り値は更新した数 */
export async function updateInstalled(): Promise<{ updated: number; failed: number }> {
  const entries = await refreshCatalog();
  const byId = new Map(entries.map((e) => [e.id, e]));
  let updated = 0;
  let failed = 0;
  const d = defsDir();
  if (!d.exists) return { updated, failed };
  for (const entry of d.list()) {
    if (!(entry instanceof File) || !entry.name.endsWith('.json')) continue;
    const id = entry.name.replace(/\.json$/, '');
    const e = byId.get(id);
    if (!e) continue;
    let current = '';
    try {
      current = String((JSON.parse(entry.textSync()) as { version?: unknown }).version ?? '');
    } catch {
      current = '';
    }
    if (current === e.version) continue;
    try {
      await ensureDefinition(id, { force: true });
      updated++;
    } catch {
      failed++;
    }
  }
  return { updated, failed };
}

/** ショーの機器で、定義がまだ手元に無いものを取ってくる（読み込んだショーなど） */
export async function fetchMissing(driverIds: string[]): Promise<number> {
  let n = 0;
  for (const id of new Set(driverIds)) {
    if (isRegistered(id) || id === 'internal') continue;
    try {
      await ensureDefinition(id);
      n++;
    } catch {
      // 通信できない時は機器の画面に「見つかりません」と出る
    }
  }
  return n;
}
