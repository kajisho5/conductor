/**
 * 配信の定義（kajisho5/conductor-drivers）をアプリに同梱する（現場で通信できなくても全部使えるように）。
 *   node scripts/drivers/bundle_remote.mjs [conductor-drivers のフォルダ]
 * 出力：src/drivers/remote-bundle/index.json（一覧）・defs.json（id → 定義）。手で直さない。
 * 新しい版は起動後に配信から取り直せる（src/drivers/remote.ts）。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] ?? path.join(HERE, '../../../conductor-drivers'));
const out = path.join(HERE, '../../src/drivers/remote-bundle');

const index = JSON.parse(readFileSync(path.join(root, 'index.json'), 'utf8'));
const defs = {};
for (const f of readdirSync(path.join(root, 'defs')).filter((x) => x.endsWith('.json')).sort()) {
  const d = JSON.parse(readFileSync(path.join(root, 'defs', f), 'utf8'));
  defs[d.id] = d;
}
const drivers = index.drivers.filter((e) => defs[e.id]).map(({ bytes: _bytes, ...e }) => e);
writeFileSync(path.join(out, 'index.json'), `${JSON.stringify({ format: 1, generatedAt: index.generatedAt, drivers })}\n`);
writeFileSync(path.join(out, 'defs.json'), `${JSON.stringify(defs)}\n`);
// 出典（ライセンスの表示に使う）。製品名を出さないよう、モジュールの id・版・ライセンス・作者だけ
const credits = Object.values(defs)
  .map((d) => d.source)
  .filter(Boolean)
  .map((s) => ({ module: s.module, version: s.version, license: s.license, authors: (s.maintainers ?? []).join(', ') }))
  .sort((a, b) => a.module.localeCompare(b.module));
writeFileSync(path.join(out, 'credits.json'), `${JSON.stringify(credits)}\n`);
console.log(`bundled ${drivers.length} definitions (${Math.round(JSON.stringify(defs).length / 1024)} KB)`);
