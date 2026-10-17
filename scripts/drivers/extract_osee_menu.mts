/**
 * kajisho5/osee_control_software（cutline）のメニューの定義（src/ui/menu/pages.ts）から、
 * conductor の OSEE 定義に使う項目を JSON に書き出す（scripts/drivers/data/osee_menu.json）。
 * cutline の項目は、公式ソフトの画面定義（QML）・説明書・Companion モジュールを根拠にしている（cutline の docs/OFFICIAL_SOFTWARE_PARITY.md）。
 * 使い方：npx tsx scripts/drivers/extract_osee_menu.mts ../osee_control_software
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(process.argv[2] ?? '../osee_control_software');
const load = (p: string) => import(pathToFileURL(path.join(root, p)).href);

const { PAGES } = await load('src/ui/menu/pages.ts');
const { createInitialState } = await load('src/store/initialState.ts');
const { DEVICE_PROFILES } = await load('src/config/deviceProfiles.ts');
const { sourceLong } = await load('src/config/sourceIds.ts');

type Text = string | { ja: string; en: string };
const ja = (t: Text | undefined) => (t === undefined ? undefined : typeof t === 'string' ? t : t.ja);

const MODELS = ['OMNI_12_ISO', 'DUET_8_ISO', 'DECK_PLUS', 'DUET', 'DECK'] as const;

function ctxFor(model: string, index: unknown) {
  const state = createInitialState(model);
  const p = DEVICE_PROFILES[model];
  return {
    model,
    state,
    index,
    sources: (ids: number[]) => ids.map((id) => ({ value: id, label: sourceLong(id, undefined, model) })),
    deviceIds: () => [],
    deviceStrings: () => [],
    profile: p,
  };
}

function optionsFor(f: any, model: string, index: unknown) {
  const c = ctxFor(model, index);
  const st = c.state;
  if (Array.isArray(f.options)) return f.options;
  if (f.options === 'sources') return c.sources(st.device.inputList);
  if (f.options === 'fillSources') return c.sources(st.device.inputList);
  if (f.options === 'audioSources') return c.sources(st.device.audioSources);
  if (typeof f.options === 'function') return f.options(c);
  return [];
}

const out: any[] = [];
for (const page of PAGES) {
  for (const sec of page.sections) {
    for (const f of sec.fields) {
      if (f.compound) continue; // 本体の今の値を読み直して全部送る項目は、ボタン 1 つの動作にできない
      // どの機種で出るか（ページ・節・項目の models と show）
      const models = MODELS.filter((m) => {
        if (page.models && !page.models.includes(m)) return false;
        if (sec.models && !sec.models.includes(m)) return false;
        if (f.models && !f.models.includes(m)) return false;
        return true;
      });
      if (models.length === 0) continue;
      const m0 = models[0]!;
      const indexKind = page.indexer?.kind;
      let indexValues: unknown[] = [];
      if (page.indexer) {
        const st = createInitialState(m0);
        indexValues =
          indexKind === 'audio' ? st.device.audioSources : Array.from({ length: Math.max(1, page.indexer.count(st)) }, (_, i) => i);
      }
      if (typeof f.show === 'function') {
        try {
          if (!models.some((m) => f.show(ctxFor(m, indexValues[0])))) continue;
        } catch {
          // 本体の値に頼る表示条件は、出す側に倒す
        }
      }
      const item: any = {
        page: page.id,
        pageTitle: ja(page.title),
        section: ja(sec.title),
        label: ja(f.label),
        id: f.id,
        kind: f.kind,
        idx: !!f.idx && !!page.indexer,
        indexKind: f.idx ? indexKind : undefined,
        indexValues: f.idx ? indexValues.map((v) => ({ value: v, label: indexKind === 'audio' ? sourceLong(Number(v), undefined, m0) : page.indexer.label(Number(v)) })) : undefined,
        prefix: f.prefix,
        suffix: f.suffix,
        unverified: !!f.unverified,
        restarts: !!f.restarts,
        models,
        hint: ja(f.hint),
      };
      if (f.kind === 'number') Object.assign(item, { min: f.min, max: f.max, step: f.step, unit: f.unit, decimals: f.decimals, scale: f.scale });
      if (f.kind === 'toggle') Object.assign(item, { on: f.on ?? 1, off: f.off ?? 0 });
      if (f.kind === 'text') Object.assign(item, { maxLength: f.maxLength, secret: !!f.secret });
      if (f.kind === 'action') Object.assign(item, { value: f.value ?? [], confirm: ja(f.confirm) });
      if (f.kind === 'select') {
        const seen = new Map<string, any>();
        for (const m of models) {
          let opts: any[] = [];
          try {
            opts = optionsFor(f, m, indexValues[0]);
          } catch {
            opts = [];
          }
          for (const o of opts) if (!seen.has(JSON.stringify(o.value))) seen.set(JSON.stringify(o.value), { value: o.value, label: ja(o.label) });
        }
        item.options = [...seen.values()];
        if (item.options.length === 0) continue;
      }
      out.push(item);
    }
  }
}

const dest = path.join(path.dirname(new URL(import.meta.url).pathname), 'data', 'osee_menu.json');
writeFileSync(dest, JSON.stringify({ source: 'kajisho5/osee_control_software src/ui/menu/pages.ts', items: out }, null, 1) + '\n');
console.log('wrote', dest, out.length, 'items');
