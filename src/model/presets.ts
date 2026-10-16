import type { DriverDefinition, PresetDef } from '@/drivers/types';
import { newButton } from './defaults';
import { newId } from './id';
import type { ButtonModel, Device } from './types';

/** プリセット（ドライバ定義の presets）からボタンを作る（SPEC 2.1-1 プリセットタブ） */
export function buttonFromPreset(device: Device, preset: PresetDef): ButtonModel {
  const b = newButton({
    name: `${device.label} ${preset.name}`,
    localVariables: (preset.localVariables ?? []).map((v) => ({
      id: newId(),
      ...v,
      value: v.value.replace(/\$\(DEVICE:/g, `$(${device.label}:`),
    })),
    style: { text: preset.text, backgroundColor: preset.backgroundColor ?? '#2A2A2E' },
    feedbacks: (preset.feedbacks ?? []).map((f) => ({
      id: newId(),
      deviceId: device.id,
      definitionId: f.definitionId,
      options: { ...f.options },
      invert: false,
      style: { backgroundColor: f.backgroundColor },
      enabled: true,
    })),
  });
  b.steps[0]!.press.actions = [
    {
      id: newId(),
      deviceId: device.id,
      definitionId: preset.action.definitionId,
      options: { ...preset.action.options },
      delayMs: 0,
      enabled: true,
    },
  ];
  return b;
}

/** プリセットを持つ機器 */
export function devicesWithPresets(
  devices: Device[],
  getDef: (id: string) => DriverDefinition | undefined,
): { device: Device; def: DriverDefinition }[] {
  return devices.flatMap((device) => {
    const def = getDef(device.driverId);
    return def && (def.presets?.length ?? 0) > 0 ? [{ device, def }] : [];
  });
}
