import { newId } from './id';
import { uniqueVariableName } from './buttonEdits';
import type { CustomVariable, ExpressionVariable, Show } from './types';

/** 自分で作る変数・式の変数（SPEC 2.1-5）の編集。純粋関数 */

export function addCustomVariable(s: Show): Show {
  const taken = s.customVariables.map((v) => v.name);
  const v: CustomVariable = { id: newId(), name: uniqueVariableName('var', taken), defaultValue: '', persist: false };
  return { ...s, customVariables: [...s.customVariables, v] };
}

export function updateCustomVariable(s: Show, id: string, patch: Partial<Omit<CustomVariable, 'id'>>): Show {
  return { ...s, customVariables: s.customVariables.map((v) => (v.id === id ? { ...v, ...patch } : v)) };
}

export function removeCustomVariable(s: Show, id: string): Show {
  return { ...s, customVariables: s.customVariables.filter((v) => v.id !== id) };
}

export function addExpressionVariable(s: Show): Show {
  const taken = s.expressionVariables.map((v) => v.name);
  const v: ExpressionVariable = { id: newId(), name: uniqueVariableName('calc', taken), expression: '' };
  return { ...s, expressionVariables: [...s.expressionVariables, v] };
}

export function updateExpressionVariable(s: Show, id: string, patch: Partial<Omit<ExpressionVariable, 'id'>>): Show {
  return { ...s, expressionVariables: s.expressionVariables.map((v) => (v.id === id ? { ...v, ...patch } : v)) };
}

export function removeExpressionVariable(s: Show, id: string): Show {
  return { ...s, expressionVariables: s.expressionVariables.filter((v) => v.id !== id) };
}

/** 再起動後も値を保持する変数だけ取り出す（state.json に書く） */
export function persistedValues(s: Show, values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of s.customVariables) if (v.persist && values[v.name] !== undefined) out[v.name] = values[v.name]!;
  return out;
}
