import { summarize, withDefaults, type Values } from '@/drivers/engine';
import type { FieldDef } from '@/drivers/types';
import { getActionDef, getFeedbackDef } from '@/drivers/registry';
import type { ActionModel, FeedbackRule, Show } from '@/model/types';

/** 動作・状態表示を一覧に出す時の文言（ドライバ定義の name と summary から作る） */

export function deviceLabel(show: Show, deviceId: string): string {
  if (deviceId === 'internal') return '内部';
  return show.devices.find((d) => d.id === deviceId)?.label ?? '（削除された機器）';
}

export function driverIdOf(show: Show, deviceId: string): string {
  if (deviceId === 'internal') return 'internal';
  return show.devices.find((d) => d.id === deviceId)?.driverId ?? '';
}

const PAGE_WORDS: Record<string, string> = { next: '次', prev: '前' };

/** 選択肢の値は表示名に置き換える（例：Roland の 22 → INPUT 3） */
function labeled(fields: FieldDef[], values: Values): Values {
  const out: Values = { ...values };
  for (const f of fields) {
    if (f.type !== 'select') continue;
    const c = f.choices?.find((x) => x.id === String(values[f.id]));
    if (c) out[f.id] = c.label;
  }
  return out;
}

export function describeAction(a: ActionModel, show: Show): { title: string; detail: string } {
  const def = getActionDef(driverIdOf(show, a.deviceId), a.definitionId);
  if (!def) return { title: a.definitionId, detail: 'この機器では使えない動作です' };
  const values = labeled(def.options, withDefaults(def.options, a.options));
  if (a.definitionId === 'internal.page' || a.definitionId === 'internal.step') {
    const key = a.definitionId === 'internal.page' ? 'page' : 'step';
    const v = String(values[key] ?? '');
    values[key] = PAGE_WORDS[v] ?? v;
  }
  return { title: def.name, detail: summarize(def.summary, values) };
}

export function describeFeedback(f: FeedbackRule, show: Show): { condition: string; effect: string } {
  const def = getFeedbackDef(driverIdOf(show, f.deviceId), f.definitionId);
  const cond = def ? summarize(def.summary, labeled(def.options, withDefaults(def.options, f.options))) || def.name : f.definitionId;
  const parts: string[] = [];
  if (f.style.backgroundColor) parts.push('背景の色');
  if (f.style.textColor) parts.push('文字の色');
  if (f.style.text !== undefined) parts.push('文字');
  if (f.style.imageId) parts.push('画像');
  return { condition: f.invert ? `${cond}（ではない時）` : cond, effect: parts.length ? `${parts.join('・')}を変える` : '変更なし' };
}

export function delayLabel(ms: number): string {
  return ms > 0 ? `${ms} ms 待ってから` : '';
}
