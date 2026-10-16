import type { ActionModel, FeedbackRule, OptionValue, Show } from '@/model/types';

/** 動作・状態表示を一覧に出す時の文言（M1：デモドライバと内部動作） */

function v(o: OptionValue | undefined): string {
  if (o === undefined) return '';
  if (typeof o === 'object') return `式 ${o.expression}`;
  return String(o);
}

export function deviceLabel(show: Show, deviceId: string): string {
  if (deviceId === 'internal') return '内部';
  return show.devices.find((d) => d.id === deviceId)?.label ?? '（削除された機器）';
}

export function describeAction(a: ActionModel): { title: string; detail: string } {
  const o = a.options;
  switch (a.definitionId) {
    case 'demo.set':
      return { title: '値を設定', detail: `${v(o.key)} = ${v(o.value)}` };
    case 'demo.swap':
      return { title: '値を入れ替え', detail: `${v(o.a)} ⇄ ${v(o.b)}` };
    case 'demo.toggle':
      return { title: 'ON / OFF を切り替え', detail: v(o.key) };
    case 'internal.page': {
      const p = o.page;
      const detail = p === 'next' ? '次のページ' : p === 'prev' ? '前のページ' : `ページ ${v(p)}`;
      return { title: 'ページを移動', detail };
    }
    default:
      return { title: a.definitionId, detail: '' };
  }
}

export function describeFeedback(f: FeedbackRule): { condition: string; effect: string } {
  const o = f.options;
  const cond = f.definitionId === 'demo.equals' ? `${v(o.key)} が ${v(o.value)}` : f.definitionId;
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
