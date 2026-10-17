import demoDef from './defs/demo.json';
import tcpDef from './defs/generic-tcp.json';
import udpDef from './defs/generic-udp.json';
import oscDef from './defs/generic-osc.json';
import httpDef from './defs/generic-http.json';
import rolandV160hd from './defs/roland-v160hd.json';
import rolandV80hd from './defs/roland-v80hd.json';
import rolandVr120hd from './defs/roland-vr120hd.json';
import atemDef from './defs/atem.json';
import oseeDef from './defs/osee-gostream.json';
import hyperdeckDef from './defs/bmd-hyperdeck.json';
import videohubDef from './defs/bmd-videohub.json';
import viscaDef from './defs/visca-ip.json';
import obsDef from './defs/obs-studio.json';
import x32Def from './defs/behringer-x32.json';
import wingDef from './defs/behringer-wing.json';
import vmixDef from './defs/vmix.json';
import qlabDef from './defs/qlab.json';
import sqDef from './defs/allenheath-sq.json';
import dliveDef from './defs/allenheath-dlive.json';
import avantisDef from './defs/allenheath-avantis.json';
import panasonicDef from './defs/panasonic-ptz.json';
import type { ActionDef, DriverDefinition, FeedbackDef, FieldDef } from './types';

/**
 * 使えるドライバ定義の一覧（SPEC 7.1）。アプリ同梱の定義と、配信（kajisho5/conductor-drivers）から取ってきた定義。
 * 取ってきた定義も同じ validateDefinition を通してから registerDefinition で足す（src/drivers/remote.ts）。
 */

export class DefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DefinitionError';
  }
}

const FIELD_TYPES = new Set(['text', 'textarea', 'number', 'select', 'boolean']);
const TRANSPORTS = new Set(['tcp', 'udp', 'osc', 'http', 'ws', 'demo', 'internal']);
const SESSIONS = new Set(['roland-lan', 'atem', 'osee', 'bmd-text', 'visca-ip', 'obs-ws']);
const SEND_KINDS = new Set(['bytes', 'osc', 'http', 'builtin']);

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkFields(where: string, fields: unknown): void {
  if (!Array.isArray(fields)) throw new DefinitionError(`${where}：項目の一覧がありません`);
  const ids = new Set<string>();
  for (const f of fields) {
    if (!isObj(f) || typeof f.id !== 'string' || typeof f.label !== 'string' || !FIELD_TYPES.has(String(f.type))) {
      throw new DefinitionError(`${where}：項目の形が正しくありません`);
    }
    if (ids.has(f.id)) throw new DefinitionError(`${where}：項目 ${f.id} が重複しています`);
    ids.add(f.id);
    if (f.type === 'select' && (!Array.isArray(f.choices) || f.choices.length === 0)) {
      throw new DefinitionError(`${where}：選択肢 ${f.id} に choices がありません`);
    }
    if (typeof f.pattern === 'string') {
      try {
        new RegExp(f.pattern);
      } catch {
        throw new DefinitionError(`${where}：${f.id} の pattern が正規表現ではありません`);
      }
    }
  }
}

/** 形の確認。コード（関数）・未知の送信形式は通さない */
export function validateDefinition(raw: unknown): DriverDefinition {
  if (!isObj(raw)) throw new DefinitionError('定義が空です');
  if (raw.format !== 1) throw new DefinitionError(`対応していない定義の形式です（format: ${String(raw.format)}）`);
  for (const k of ['id', 'name', 'category', 'version', 'minAppVersion'] as const) {
    if (typeof raw[k] !== 'string' || raw[k] === '') throw new DefinitionError(`定義に ${k} がありません`);
  }
  if (!/^[a-z0-9][a-z0-9_.-]*$/.test(String(raw.id))) throw new DefinitionError(`定義の id が正しくありません：${String(raw.id)}`);
  if (!TRANSPORTS.has(String(raw.transport))) throw new DefinitionError(`通信方式が不明です：${String(raw.transport)}`);
  if (raw.session !== undefined && !SESSIONS.has(String(raw.session)))
    throw new DefinitionError(`通信手順が不明です：${String(raw.session)}`);
  checkFields(`${String(raw.id)} の設定`, raw.configFields);
  if (!Array.isArray(raw.actions) || !Array.isArray(raw.feedbacks) || !Array.isArray(raw.variables) || !Array.isArray(raw.evidence)) {
    throw new DefinitionError(`${String(raw.id)}：actions / feedbacks / variables / evidence のどれかがありません`);
  }
  const actionIds = new Set<string>();
  for (const a of raw.actions as unknown[]) {
    if (!isObj(a) || typeof a.id !== 'string' || typeof a.name !== 'string' || !isObj(a.send) || !SEND_KINDS.has(String(a.send.kind))) {
      throw new DefinitionError(`${String(raw.id)}：動作の形が正しくありません`);
    }
    if (actionIds.has(a.id)) throw new DefinitionError(`${String(raw.id)}：動作 ${a.id} が重複しています`);
    actionIds.add(a.id);
    checkFields(`${String(raw.id)} の動作 ${a.id}`, a.options);
    if (a.more !== undefined) {
      if (!Array.isArray(a.more) || a.more.some((m) => !isObj(m) || !SEND_KINDS.has(String(m.kind))))
        throw new DefinitionError(`${String(raw.id)}：動作 ${a.id} の more の形が正しくありません`);
    }
    if (a.maps !== undefined) {
      if (!isObj(a.maps)) throw new DefinitionError(`${String(raw.id)}：動作 ${a.id} の maps の形が正しくありません`);
      for (const m of Object.values(a.maps)) {
        if (!isObj(m) || Object.values(m).some((v) => typeof v !== 'string'))
          throw new DefinitionError(`${String(raw.id)}：動作 ${a.id} の maps の形が正しくありません`);
      }
    }
  }
  for (const f of raw.feedbacks as unknown[]) {
    if (!isObj(f) || typeof f.id !== 'string' || !isObj(f.compare))
      throw new DefinitionError(`${String(raw.id)}：状態表示の形が正しくありません`);
    checkFields(`${String(raw.id)} の状態表示 ${f.id}`, f.options);
  }
  for (const r of (raw.receive ?? []) as unknown[]) {
    if (!isObj(r) || typeof r.match !== 'string') throw new DefinitionError(`${String(raw.id)}：受信の規則の形が正しくありません`);
    try {
      new RegExp(r.match, typeof r.flags === 'string' ? r.flags : undefined);
    } catch {
      throw new DefinitionError(`${String(raw.id)}：受信の規則 ${r.match} が正規表現ではありません`);
    }
  }
  return raw as unknown as DriverDefinition;
}

/** 内部の動作（SPEC 6 章「内部動作」のうち M2 で使えるもの） */
export const INTERNAL_DEFINITION: DriverDefinition = {
  format: 1,
  id: 'internal',
  name: '内部',
  category: '内部',
  version: '1.0.0',
  minAppVersion: '0.1.0',
  transport: 'internal',
  configFields: [],
  actions: [
    {
      id: 'internal.page',
      name: 'ページを移動',
      options: [
        {
          id: 'page',
          label: '移動先',
          type: 'text',
          default: 'next',
          placeholder: 'ページ番号、next、prev',
          help: '番号のほか next（次）・prev（前）',
        },
      ],
      send: { kind: 'builtin', name: 'internal.page' },
      summary: 'ページ {{option.page}}',
    },
    {
      id: 'internal.step',
      name: 'このボタンのステップを変える',
      options: [
        { id: 'step', label: 'ステップ', type: 'text', default: 'next', placeholder: 'ステップ番号、next', help: '番号のほか next（次）' },
      ],
      send: { kind: 'builtin', name: 'internal.step' },
      summary: 'ステップ {{option.step}}',
    },
    {
      id: 'internal.lock',
      name: '本番のロック',
      options: [
        {
          id: 'lock',
          label: '操作',
          type: 'select',
          default: 'lock',
          choices: [
            { id: 'lock', label: 'ロックする' },
            { id: 'unlock', label: 'ロックを解除' },
          ],
        },
      ],
      send: { kind: 'builtin', name: 'internal.lock' },
      summary: '{{option.lock}}',
    },
    {
      id: 'internal.log',
      name: 'ログに書く',
      options: [{ id: 'text', label: '文字', type: 'text', help: '$(…) の変数が使えます' }],
      send: { kind: 'builtin', name: 'internal.log' },
      summary: '{{option.text}}',
    },
    {
      id: 'internal.setVar',
      name: '自分で作る変数に値を入れる',
      options: [
        { id: 'name', label: '変数の名前', type: 'text', placeholder: 'count', mono: true },
        {
          id: 'mode',
          label: '入れ方',
          type: 'select',
          default: 'value',
          choices: [
            { id: 'value', label: '値' },
            { id: 'expression', label: '式' },
          ],
        },
        { id: 'value', label: '値・式', type: 'text', mono: true, help: '式の例：$(custom:count) + 1' },
      ],
      send: { kind: 'builtin', name: 'internal.setVar' },
      summary: '{{option.name}} ← {{option.value}}',
    },
    {
      id: 'internal.press',
      name: '別のボタンを押す',
      options: [
        { id: 'page', label: 'ページ番号', type: 'number', default: 1, min: 1 },
        { id: 'row', label: '行', type: 'number', default: 1, min: 1 },
        { id: 'col', label: '列', type: 'number', default: 1, min: 1 },
        {
          id: 'how',
          label: '押し方',
          type: 'select',
          default: 'click',
          choices: [
            { id: 'click', label: '押して離す' },
            { id: 'press', label: '押すだけ' },
            { id: 'release', label: '離すだけ' },
          ],
        },
      ],
      send: { kind: 'builtin', name: 'internal.press' },
      summary: 'ページ {{option.page}}・{{option.row}} 行 {{option.col}} 列',
    },
    {
      id: 'internal.trigger',
      name: 'トリガーを操作',
      options: [
        { id: 'name', label: 'トリガーの名前', type: 'text' },
        {
          id: 'op',
          label: '操作',
          type: 'select',
          default: 'run',
          choices: [
            { id: 'run', label: '実行' },
            { id: 'enable', label: '有効' },
            { id: 'disable', label: '無効' },
          ],
        },
      ],
      send: { kind: 'builtin', name: 'internal.trigger' },
      summary: '{{option.name}}',
    },
    {
      id: 'internal.wait',
      name: '待つ',
      options: [{ id: 'ms', label: '待つ時間（ms）', type: 'number', default: 1000, min: 0, max: 600000 }],
      send: { kind: 'builtin', name: 'internal.wait' },
      summary: '{{option.ms}} ms',
    },
  ],
  feedbacks: [
    {
      id: 'internal.variable',
      name: '変数を比べる',
      options: [
        { id: 'variable', label: '変数', type: 'text', placeholder: '$(custom:count)', mono: true },
        {
          id: 'op',
          label: '比べ方',
          type: 'select',
          default: 'eq',
          choices: [
            { id: 'eq', label: '＝' },
            { id: 'neq', label: '≠' },
            { id: 'gt', label: '＞' },
            { id: 'lt', label: '＜' },
            { id: 'gte', label: '≧' },
            { id: 'lte', label: '≦' },
            { id: 'contains', label: '含む' },
          ],
        },
        { id: 'value', label: '値', type: 'text', mono: true },
      ],
      compare: { variable: '', op: 'eq', value: '' },
      summary: '{{option.variable}} {{option.op}} {{option.value}}',
    },
    {
      id: 'internal.expression',
      name: '式が成り立つ',
      options: [{ id: 'expr', label: '式', type: 'textarea', placeholder: '$(custom:count) >= 3', mono: true }],
      compare: { variable: '', op: 'eq', value: '' },
      summary: '{{option.expr}}',
    },
  ],
  variables: [],
  evidence: [],
};

const BUNDLED: DriverDefinition[] = [rolandV160hd, rolandV80hd, rolandVr120hd, atemDef, oseeDef, hyperdeckDef, videohubDef, viscaDef, panasonicDef, obsDef, vmixDef, qlabDef, x32Def, wingDef, sqDef, dliveDef, avantisDef, tcpDef, udpDef, oscDef, httpDef, demoDef].map((d) =>
  validateDefinition(d),
);

const byId = new Map<string, DriverDefinition>(BUNDLED.map((d) => [d.id, d]));
const bundledIds = new Set(BUNDLED.map((d) => d.id));

/** アプリ同梱の定義（機器を追加する画面の上に出す） */
export function listDefinitions(): DriverDefinition[] {
  return BUNDLED;
}

export function isBundled(id: string): boolean {
  return bundledIds.has(id);
}

/** 配信から取ってきた定義を足す（同梱の定義は上書きしない） */
export function registerDefinition(def: DriverDefinition): void {
  if (bundledIds.has(def.id)) return;
  byId.set(def.id, def);
}

export function isRegistered(id: string): boolean {
  return byId.has(id);
}

export function getDefinition(id: string): DriverDefinition | undefined {
  if (id === 'internal') return INTERNAL_DEFINITION;
  return byId.get(id);
}

export function getActionDef(driverId: string, actionId: string): ActionDef | undefined {
  return getDefinition(driverId)?.actions.find((a) => a.id === actionId);
}

export function getFeedbackDef(driverId: string, feedbackId: string): FeedbackDef | undefined {
  return getDefinition(driverId)?.feedbacks.find((f) => f.id === feedbackId);
}

/** 既定値で埋めたオプション */
export function defaultOptions(fields: FieldDef[]): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const f of fields) out[f.id] = f.default ?? (f.type === 'boolean' ? false : f.type === 'number' ? 0 : '');
  return out;
}
