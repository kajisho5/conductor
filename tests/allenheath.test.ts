/**
 * Allen & Heath SQ（MIDI over TCP）。バイト列が公式「SQ MIDI Protocol」の例と同じになるか。
 */
import { getActionDef, getDefinition } from '@/drivers/registry';
import { buildPayload, withDefaults } from '@/drivers/engine';

const def = getDefinition('allenheath-sq')!;
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');
function send(actionId: string, o: Record<string, string | number> = {}, midich = 1) {
  const a = getActionDef('allenheath-sq', actionId)!;
  const p = buildPayload(def, a, { ...withDefaults(a.options, {}), ...o }, { ...withDefaults(def.configFields, {}), midich });
  if (p.kind !== 'bytes') throw new Error('bytes ではない');
  return hex(p.bytes);
}

describe('Allen & Heath SQ', () => {
  it('ミュート（資料の例：入力 1・LR・ミュートグループ 4）', () => {
    expect(send('mute_input', { n: 1, on: '01' })).toBe('B0 63 00 B0 62 00 B0 06 00 B0 26 01');
    expect(send('mute_lr_toggle')).toBe('B0 63 00 B0 62 44 B0 60 00');
    expect(send('mute_mgrp', { n: 4, on: '00' })).toBe('B0 63 04 B0 62 03 B0 06 00 B0 26 00');
    expect(send('mute_dca_toggle', { n: 8 }, 2)).toBe('B1 63 02 B1 62 07 B1 60 00');
  });

  it('レベルの番号（資料の例）', () => {
    expect(send('level_ip_lr', { ip: 40, v: '15196' })).toBe('B0 63 40 B0 62 27 B0 06 76 B0 26 5C');
    expect(send('level_ip_aux', { ip: 40, aux: 5, v: '0' }).slice(0, 17)).toBe('B0 63 44 B0 62 1C');
    expect(send('level_grp_aux', { grp: 4, aux: 8, v: '0' }).slice(0, 17)).toBe('B0 63 45 B0 62 2F');
    expect(send('level_ip_fx', { ip: 36, fxs: 3, v: '0' }).slice(0, 17)).toBe('B0 63 4D B0 62 22');
    expect(send('level_ip_aux', { ip: 6, aux: 1, v: '0' }).slice(0, 17)).toBe('B0 63 41 B0 62 00');
    expect(send('level_ip_aux', { ip: 48, aux: 1, v: '0' }).slice(0, 17)).toBe('B0 63 44 B0 62 78');
    expect(send('level_dca_master', { dca: 1, v: '12544' })).toBe('B0 63 4F B0 62 20 B0 06 62 B0 26 00');
    expect(send('level_lr_master_step', { step: '61' })).toBe('B0 63 4F B0 62 00 B0 61 00');
  });

  it('パン（資料の例と、左・中央・右の値）', () => {
    expect(send('pan_ip_lr', { ip: 1, pan: -100 })).toBe('B0 63 50 B0 62 00 B0 06 00 B0 26 00');
    expect(send('pan_ip_aux', { ip: 24, aux: 5, pan: 0 })).toBe('B0 63 52 B0 62 5C B0 06 3F B0 26 7F');
    expect(send('pan_lr_mtx', { mtx: 3, pan: 100 })).toBe('B0 63 5E B0 62 26 B0 06 7F B0 26 7F');
  });

  it('シーン・ソフトキー・割り当て', () => {
    expect(send('scene', { scene: 7 })).toBe('B0 00 00 C0 06');
    expect(send('scene', { scene: 129 })).toBe('B0 00 01 C0 00');
    expect(send('softkey_press', { key: 1 })).toBe('90 30 7F');
    expect(send('softkey_release', { key: 1 })).toBe('80 30 00');
    expect(send('assign_ip_aux', { ip: 48, aux: 12, on: '01' }).slice(0, 17)).toBe('B0 63 65 B0 62 03');
    expect(send('assign_ip_grp', { ip: 2, grp: 1, on: '01' }).slice(0, 17)).toBe('B0 63 67 B0 62 00');
  });

  it('どの動作も既定値で送れる', () => {
    for (const a of def.actions) {
      if (a.id === 'command') continue;
      expect(send(a.id)).toMatch(/^[89BC][0-9A-F]( [0-9A-F]{2})+$/);
    }
  });
});
