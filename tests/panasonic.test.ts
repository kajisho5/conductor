/**
 * Panasonic リモートカメラ（HTTP の CGI）。URL が公式資料の形になるか。
 */
import { getActionDef, getDefinition } from '@/drivers/registry';
import { buildPayload, withDefaults } from '@/drivers/engine';

const def = getDefinition('panasonic-ptz')!;
function url(actionId: string, o: Record<string, string | number> = {}) {
  const a = getActionDef('panasonic-ptz', actionId)!;
  const p = buildPayload(def, a, { ...withDefaults(a.options, {}), ...o }, withDefaults(def.configFields, {}));
  if (p.kind !== 'http') throw new Error('http ではない');
  return p.url;
}

describe('Panasonic リモートカメラ', () => {
  it('雲台の命令（資料の例）', () => {
    expect(url('move_upleft', { speed: 49 })).toBe('http://192.168.0.10/cgi-bin/aw_ptz?cmd=%23PTS0199&res=1');
    expect(url('move_right', { speed: 25 })).toBe('http://192.168.0.10/cgi-bin/aw_ptz?cmd=%23PTS7550&res=1');
    expect(url('stop')).toBe('http://192.168.0.10/cgi-bin/aw_ptz?cmd=%23PTS5050&res=1');
    expect(url('home')).toBe('http://192.168.0.10/cgi-bin/aw_ptz?cmd=%23APC80008000&res=1');
    expect(url('zoom_position', { v: 4095 })).toContain('cmd=%23AXZFFF&');
    expect(url('preset_recall', { n: 1 })).toContain('cmd=%23R00&');
    expect(url('preset_save', { n: 100 })).toContain('cmd=%23M99&');
    expect(url('preset_speed', { v: '999' })).toContain('cmd=%23UPVS999&');
    expect(url('preset_speed', { v: '275' })).toContain('cmd=%23UPVS275&');
  });

  it('カメラの命令', () => {
    expect(url('gain_set', { v: '14' })).toContain('/cgi-bin/aw_cam?cmd=OGU:14&res=1');
    expect(url('pedestal_set', { v: 0 })).toContain('cmd=OTP:096&');
    expect(url('pedestal_set', { v: 150 })).toContain('cmd=OTP:12C&');
    expect(url('awb')).toContain('cmd=OWS&res=0');
  });

  it('どの動作も既定値で URL になる', () => {
    for (const a of def.actions) expect(url(a.id)).toMatch(/^http:\/\/192\.168\.0\.10\/cgi-bin\/\w+\?[^\s{}]+$/);
  });
});
