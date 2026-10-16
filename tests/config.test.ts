/**
 * コミットした ios/ が app.config.ts と食い違っていないか（CI の macOS ジョブより先に気づくため）。
 * 食い違ったら：npx expo prebuild --platform ios --no-install
 */
import fs from 'node:fs';
import path from 'node:path';
import config from '../app.config';
import pkg from '../package.json';

const plist = fs.readFileSync(path.join(__dirname, '..', 'ios', 'conductor', 'Info.plist'), 'utf8');

function plistString(key: string): string | undefined {
  const m = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(plist);
  return m?.[1];
}

describe('ios/ と app.config.ts', () => {
  it('バージョン', () => {
    expect(plistString('CFBundleShortVersionString')).toBe(config.version);
    expect(pkg.version).toBe(config.version);
  });
  it('ローカルネットワークの説明文', () => {
    expect(plistString('NSLocalNetworkUsageDescription')).toBe(config.ios?.infoPlist?.NSLocalNetworkUsageDescription);
  });
  it('.conductor を開ける', () => {
    expect(plist).toContain('com.seventhwell.conductor.show');
  });
});
