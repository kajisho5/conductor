import type { Show } from '@/model/types';
import type { DeviceStatus } from '@/stores/runtime';

/** 接続状況の要約（ツールバーのチップ「● 4/5」）。無効にした機器は数えない */
export function deviceSummary(show: Show, status: Record<string, DeviceStatus>): { ok: number; total: number } {
  const enabled = show.devices.filter((d) => d.enabled);
  return { ok: enabled.filter((d) => status[d.id] === 'connected').length, total: enabled.length };
}

export const STATUS_LABEL: Record<DeviceStatus, string> = {
  connected: '接続中',
  connecting: '接続待ち',
  reconnecting: '再接続中',
  error: 'エラー',
  disabled: '無効',
};

export const STATUS_TONE: Record<DeviceStatus, 'ok' | 'warn' | 'danger' | 'gray'> = {
  connected: 'ok',
  connecting: 'warn',
  reconnecting: 'warn',
  error: 'danger',
  disabled: 'gray',
};
