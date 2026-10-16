import type { Device, OptionValue } from '@/model/types';
import type { DeviceStatus } from '@/stores/runtime';

/**
 * デモ用ドライバ（M1）。通信はせず、状態値だけを変える。
 * 実機ドライバ（汎用 TCP/UDP/OSC/HTTP・Roland・ATEM）は M2 以降で同じ形の関数群として足す（SPEC 7 章）。
 */

export type SendResult = { ok: true } | { ok: false; reason: string };

export interface DriverContext {
  get: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
}

function str(v: OptionValue | undefined): string {
  if (v === undefined) return '';
  if (typeof v === 'object') return v.expression;
  return String(v);
}

/** 機器の設定から接続状態を決める（デモ：config.behavior） */
export function demoStatus(device: Device): DeviceStatus {
  if (!device.enabled) return 'disabled';
  const b = str(device.config.behavior);
  if (b === 'reconnecting') return 'reconnecting';
  if (b === 'error') return 'error';
  return 'connected';
}

export function runDemoAction(definitionId: string, options: Record<string, OptionValue>, ctx: DriverContext): SendResult {
  switch (definitionId) {
    case 'demo.set': {
      const key = str(options.key);
      if (!key) return { ok: false, reason: '項目が指定されていません' };
      ctx.set(key, str(options.value));
      return { ok: true };
    }
    case 'demo.swap': {
      const a = str(options.a);
      const b = str(options.b);
      const va = ctx.get(a) ?? '';
      const vb = ctx.get(b) ?? '';
      ctx.set(a, vb);
      ctx.set(b, va);
      return { ok: true };
    }
    case 'demo.toggle': {
      const key = str(options.key);
      ctx.set(key, ctx.get(key) === 'ON' ? 'OFF' : 'ON');
      return { ok: true };
    }
    default:
      return { ok: false, reason: `この機器では使えない動作です（${definitionId}）` };
  }
}

/** 状態表示「値が等しい」（demo.equals） */
export function checkDemoFeedback(definitionId: string, options: Record<string, OptionValue>, ctx: DriverContext): boolean {
  if (definitionId !== 'demo.equals') return false;
  return (ctx.get(str(options.key)) ?? '') === str(options.value);
}
