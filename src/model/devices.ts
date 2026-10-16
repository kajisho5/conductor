import { defaultOptions } from '@/drivers/registry';
import type { DriverDefinition } from '@/drivers/types';
import { newId } from './id';
import type { Device, Show } from './types';

/** 機器名の規則（変数名 $(機器名:…) に使うため。SPEC 5 章） */
export const DEVICE_LABEL_PATTERN = /^[A-Za-z0-9_-]+$/;

export function labelError(label: string, devices: Device[], selfId?: string): string | null {
  if (label.trim() === '') return '名前を入れてください';
  if (!DEVICE_LABEL_PATTERN.test(label)) return '英数字・-・_ だけ使えます（変数名に使うため）';
  if (label === 'internal' || label === 'custom' || label === 'expression' || label === 'this') return 'この名前は予約されています';
  if (devices.some((d) => d.id !== selfId && d.label.toLowerCase() === label.toLowerCase())) return '同じ名前の機器があります';
  return null;
}

const PREFIX: Record<string, string> = {
  'generic-tcp': 'TCP',
  'generic-udp': 'UDP',
  'generic-osc': 'OSC',
  'generic-http': 'HTTP',
  demo: 'DEMO',
  'roland-v160hd': 'V160HD',
  'roland-v80hd': 'V80HD',
  'roland-vr120hd': 'VR120HD',
};

/** 重ならない名前（TCP-1, TCP-2 …） */
export function uniqueLabel(base: string, devices: Device[]): string {
  const taken = new Set(devices.map((d) => d.label.toLowerCase()));
  for (let n = 1; ; n++) {
    const label = `${base}-${n}`;
    if (!taken.has(label.toLowerCase())) return label;
  }
}

export function newDevice(def: DriverDefinition, devices: Device[]): Device {
  const base = PREFIX[def.id] ?? def.id.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  return {
    id: newId(),
    label: uniqueLabel(base || 'DEVICE', devices),
    driverId: def.id,
    driverVersion: def.version,
    enabled: true,
    config: defaultOptions(def.configFields),
  };
}

export function duplicateDevice(src: Device, devices: Device[]): Device {
  const base = src.label.replace(/-\d+$/, '') || 'DEVICE';
  return { ...src, id: newId(), label: uniqueLabel(base, devices), config: { ...src.config } };
}

/** 機器を使っているボタンの数（削除の確認に出す） */
export function usageCount(show: Show, deviceId: string): number {
  let n = 0;
  for (const p of show.pages) {
    for (const b of Object.values(p.buttons)) {
      const uses =
        b.feedbacks.some((f) => f.deviceId === deviceId) ||
        b.steps.some(
          (s) =>
            s.press.actions.some((a) => a.deviceId === deviceId) ||
            s.release.actions.some((a) => a.deviceId === deviceId) ||
            s.holds.some((h) => h.actions.actions.some((a) => a.deviceId === deviceId)),
        );
      if (uses) n++;
    }
  }
  return n;
}
