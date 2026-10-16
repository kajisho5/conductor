// 模擬機器（SPEC 13 章）。実機が無い間、アプリの汎用 TCP / UDP / OSC / HTTP をこれに向けて確かめる。
// 使い方：npm run mock（-- --tcp 9001 --udp 9002 --osc 9003 --http 9004）
// iPhone / iPad から使う時は、このパソコンの IP アドレスを機器の設定に入れる。値・名前はすべて架空。
import net from 'node:net';
import dgram from 'node:dgram';
import http from 'node:http';
import os from 'node:os';

const args = process.argv.slice(2);
function opt(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : def;
}
const PORTS = { tcp: opt('tcp', 9001), udp: opt('udp', 9002), osc: opt('osc', 9003), http: opt('http', 9004) };

const time = () => new Date().toISOString().slice(11, 23);
const show = (b) => b.toString('utf8').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
const log = (kind, msg) => console.log(`${time()} [${kind}] ${msg}`);

// 状態（DEMO-MOCK の値）。TCP の命令で変わり、問い合わせで返す
const state = { pgm: '1', rec: 'OFF' };

/** 行の命令：PGM n / REC / STATUS / それ以外はそのまま返す */
function reply(line) {
  const [cmd, arg] = line.trim().split(/\s+/);
  switch ((cmd ?? '').toUpperCase()) {
    case 'PGM':
      state.pgm = arg ?? state.pgm;
      return `PGM ${state.pgm}`;
    case 'REC':
      state.rec = state.rec === 'ON' ? 'OFF' : 'ON';
      return `REC ${state.rec}`;
    case 'STATUS':
      return `PGM ${state.pgm} REC ${state.rec}`;
    case '':
      return null;
    default:
      return `OK ${line.trim()}`;
  }
}

// TCP：行ごとに返事（CR+LF）
net
  .createServer((sock) => {
    const who = `${sock.remoteAddress}:${sock.remotePort}`;
    log('TCP', `接続 ${who}`);
    let buf = '';
    sock.on('data', (d) => {
      log('TCP', `受信 ${show(d)}`);
      buf += d.toString('utf8');
      const lines = buf.split(/\r\n|\n|\r/);
      buf = lines.pop() ?? '';
      for (const l of lines) {
        const r = reply(l);
        if (r !== null) {
          sock.write(`${r}\r\n`);
          log('TCP', `送信 ${r}`);
        }
      }
    });
    sock.on('close', () => log('TCP', `切断 ${who}`));
    sock.on('error', (e) => log('TCP', `エラー ${e.message}`));
  })
  .listen(PORTS.tcp, () => log('TCP', `待ち受け ${PORTS.tcp}`));

// UDP：届いた内容に返事
const udp = dgram.createSocket('udp4');
udp.on('message', (m, r) => {
  log('UDP', `受信 ${show(m)} from ${r.address}:${r.port}`);
  const out = reply(m.toString('utf8')) ?? 'OK';
  udp.send(`${out}\r\n`, r.port, r.address);
});
udp.bind(PORTS.udp, () => log('UDP', `待ち受け ${PORTS.udp}`));

// OSC：受けたメッセージを解読して表示（OSC 1.0：int32 / float32 / string / T / F）
function decodeOsc(b) {
  let o = 0;
  const str = () => {
    let e = o;
    while (e < b.length && b[e] !== 0) e++;
    const s = b.subarray(o, e).toString('utf8');
    o = Math.ceil((e + 1) / 4) * 4;
    return s;
  };
  const address = str();
  const tags = str();
  const vals = [];
  for (const t of tags.slice(1)) {
    if (t === 'i') { vals.push(b.readInt32BE(o)); o += 4; }
    else if (t === 'f') { vals.push(Number(b.readFloatBE(o).toFixed(6))); o += 4; }
    else if (t === 's') vals.push(JSON.stringify(str()));
    else if (t === 'T') vals.push('true');
    else if (t === 'F') vals.push('false');
    else vals.push(`?${t}`);
  }
  return `${address} ${tags} ${vals.join(' ')}`.trim();
}
const osc = dgram.createSocket('udp4');
osc.on('message', (m, r) => {
  try {
    log('OSC', `${decodeOsc(m)} from ${r.address}`);
  } catch (e) {
    log('OSC', `解読できません（${m.length} バイト）：${e.message}`);
  }
});
osc.bind(PORTS.osc, () => log('OSC', `待ち受け ${PORTS.osc}`));

// HTTP：/status/NNN はそのステータス、それ以外は 200 と JSON
http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      log('HTTP', `${req.method} ${req.url}${body ? ` 本文 ${body}` : ''}`);
      const m = /^\/status\/(\d{3})/.exec(req.url ?? '');
      const code = m ? Number(m[1]) : 200;
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: code < 300, method: req.method, path: req.url, state }));
    });
  })
  .listen(PORTS.http, () => log('HTTP', `待ち受け ${PORTS.http}`));

const addrs = Object.values(os.networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => a.address);
log('MOCK', `このパソコンの IP：${addrs.join(', ') || '（見つかりません）'}`);
