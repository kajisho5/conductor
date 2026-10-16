// Roland V シリーズ風の模擬機器（LAN、TCP 8023）。値はすべて架空。
// 使い方：npm run mock:roland（-- --model v160hd|v80hd|vr120hd --port 8023 --password 0000）
// 手順：接続 → "Enter password:" → パスワード+LF → "Welcome to {機種}." → DTH / RQH / VER / 簡易制御コマンド
// ack は V-160HD・VR-120HD が 0x06、V-80HD が "ACK;"（kajisho5/crosspoint の観測・ガイドに合わせる）
import net from 'node:net';

const args = process.argv.slice(2);
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const MODELS = {
  v160hd: { name: 'V-160HD', pgm: 0x002100, base: 0x1f, inputs: 20, tally: (n) => 32 + n - 1, tallySize: 42, ack: '\x06', pw: 4 },
  v80hd: { name: 'V-80HD', pgm: 0x001500, base: 0x28, inputs: 16, tally: (n) => 0x28 + n, tallySize: 49, ack: '\x02ACK;', pw: 8 },
  vr120hd: { name: 'VR-120HD', pgm: 0x001b00, base: 0x1c, inputs: 8, tally: (n) => 0x1c + n, tallySize: 37, ack: '\x06', pw: 4 },
};
const model = MODELS[String(arg('model', 'v160hd')).toLowerCase().replace(/[^a-z0-9]/g, '')] ?? MODELS.v160hd;
const PORT = Number(arg('port', 8023));
const PASSWORD = String(arg('password', '0'.repeat(model.pw)));

const mem = new Map(); // アドレス → 1 バイト
mem.set(model.pgm, model.base + 1);
mem.set(model.pgm + 1, model.base + 2);

const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const hex6 = (n) => n.toString(16).toUpperCase().padStart(6, '0');
const time = () => new Date().toISOString().slice(11, 23);
const log = (m) => console.log(`${time()} [${model.name}] ${m}`);

function tallyBytes() {
  const b = new Array(model.tallySize).fill(0);
  const pgm = (mem.get(model.pgm) ?? 0) - model.base;
  const pst = (mem.get(model.pgm + 1) ?? 0) - model.base;
  for (let n = 1; n <= model.inputs; n++) {
    const i = model.tally(n);
    if (i >= b.length) continue;
    b[i] = (n === pgm ? 1 : 0) | (n === pst ? 2 : 0);
  }
  return b;
}

const clients = new Set();
function broadcast(text) {
  for (const c of clients) if (c.authed) c.write(text);
}

net
  .createServer((sock) => {
    log(`接続 ${sock.remoteAddress}`);
    sock.authed = false;
    clients.add(sock);
    sock.write('Enter password:');
    let buf = '';
    sock.on('data', (d) => {
      buf += d.toString('latin1');
      const parts = buf.split('\n');
      buf = parts.pop() ?? '';
      for (const raw of parts) {
        const line = raw.replace(/[\x02\r]/g, '').trim();
        if (!line) continue;
        if (!sock.authed) {
          if (line === PASSWORD) {
            sock.authed = true;
            sock.write(`Welcome to ${model.name}.`);
            log('認証 OK');
          } else {
            log(`パスワード違い：${line}`);
            sock.end();
          }
          continue;
        }
        for (const cmd of line.split(';').map((x) => x.trim()).filter(Boolean)) handle(sock, cmd);
      }
    });
    sock.on('close', () => {
      clients.delete(sock);
      log('切断');
    });
    sock.on('error', () => undefined);
  })
  .listen(PORT, () => log(`待ち受け ${PORT}（パスワード ${PASSWORD}）`));

function handle(sock, cmd) {
  log(`受信 ${cmd}`);
  let m;
  if (cmd === 'VER') return sock.write(`VER:${model.name},1.00;\n`);
  if ((m = /^DTH:([0-9A-F]{6}),([0-9A-F]+)$/i.exec(cmd))) {
    let a = parseInt(m[1], 16);
    for (let i = 0; i < m[2].length; i += 2) mem.set(a++, parseInt(m[2].slice(i, i + 2), 16));
    sock.write(model.ack);
    // 自発通知：PGM/PST の変化を全員へ（V-160HD 風）
    if (parseInt(m[1], 16) === model.pgm || parseInt(m[1], 16) === model.pgm + 1) {
      broadcast(`DTH:${m[1].toUpperCase()},${m[2].toUpperCase()};\n`);
      broadcast(`DTH:0C0000,${tallyBytes().map(hex2).join('')};\n`);
    }
    return;
  }
  if ((m = /^RQH:([0-9A-F]{6}),([0-9A-F]{6})$/i.exec(cmd))) {
    const a = parseInt(m[1], 16);
    const n = parseInt(m[2], 16);
    if (a === 0x0c0000) return sock.write(`DTH:0C0000,${tallyBytes().slice(0, n).map(hex2).join('')};\n`);
    let out = '';
    for (let i = 0; i < n; i++) out += hex2(mem.get(a + i) ?? 0);
    return sock.write(`DTH:${hex6(a)},${out};\n`);
  }
  if (cmd === 'CUT' || cmd === 'ATO') {
    const p = mem.get(model.pgm);
    mem.set(model.pgm, mem.get(model.pgm + 1));
    mem.set(model.pgm + 1, p);
    sock.write(model.ack);
    broadcast(`DTH:${hex6(model.pgm)},${hex2(mem.get(model.pgm))}${hex2(mem.get(model.pgm + 1))};\n`);
    return;
  }
  if (/^(MCREX|MEM|SEQ)/.test(cmd)) return sock.write(model.ack);
  sock.write('ERR:0;\n');
}
