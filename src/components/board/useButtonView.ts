import { useEffect, useMemo, useState } from 'react';
import { resolveStyle } from '@/engine/executor';
import type { ButtonModel, ButtonStyle, Show } from '@/model/types';
import { useRuntimeStore } from '@/stores/runtime';
import { resolveText, usesClock } from '@/variables/resolve';

/** 1 秒ごとの時計（$(internal:time) を使うボタンだけ） */
export function useNow(enabled: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return undefined;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [enabled]);
  return now;
}

export interface ButtonView {
  style: ButtonStyle;
  text: string;
  offline: boolean;
  stepCount: number;
  stepIndex: number;
}

/** 状態表示・変数・接続状態を反映した、今の見た目 */
export function useButtonView(button: ButtonModel | undefined, show: Show): ButtonView | null {
  const values = useRuntimeStore((s) => s.deviceValues);
  const status = useRuntimeStore((s) => s.deviceStatus);
  const pageNumber = useRuntimeStore((s) => s.pageNumber);
  const stepIndex = useRuntimeStore((s) => (button ? (s.stepIndex[button.id] ?? 0) : 0));
  const clock = !!button && (usesClock(button.style.text) || button.feedbacks.some((f) => usesClock(f.style.text ?? '')));
  const now = useNow(clock);
  return useMemo(() => {
    if (!button) return null;
    const { style, offline } = resolveStyle(button, show, values, status);
    const text = resolveText(style.text, { show, values, pageNumber, now, button });
    return { style, text, offline, stepCount: button.steps.length, stepIndex: Math.min(stepIndex, button.steps.length - 1) };
  }, [button, show, values, status, pageNumber, stepIndex, now]);
}
