// Blackmagic ATEM 風の模擬機器（UDP 9910）。値・名前はすべて架空。
// 使い方：npm run mock:atem（-- --port 9910）
// 手順は公開 OSS atem-connection（MIT）に合わせた最小限：HELLO → セッション → 状態の送信 → InCm、コマンドに ack、変化を通知
import dgram from 'node:dgram';

const args = process.argv.slice(2);
const i = args.indexOf('--port');
const PORT = i >= 0 ? Number(args[i + 1]) : 9910;
const INPUTS = 8;
const state = { pgm: 1, pvw: 2, ftb: false };

const sock = dgram.createSocket('udp4');
const clients = new Map(); // "addr:port" → { session, nextId, lastAck }
const time = () => new Date().toISOString().slice(11, 23);
const log = (m) => console.log(`${time()} [ATEM] ${m}`);

function header(flags, length, session, ackId, packetId) {
  const b = Buffer.alloc(12);
  b.writeUInt16BE((flags << 11) | length, 0);
  b.writeUInt16BE(session, 2);
  b.writeUInt16BE(ackId, 4);
  b.writeUInt16BE(packetId, 10);
  return b;
}
function cmd(name, body) {
  const b = Buffer.alloc(8 + body.length);
  b.writeUInt16BE(b.length, 0);
  b.write(name, 4, 4, 'ascii');
  body.copy(b, 8);
  return b;
}
function strBuf(s, len) {
  const b = Buffer.alloc(len);
  b.write(s, 0, len, 'ascii');
  return b;
}
function stateCommands() {
  const prg = Buffer.alloc(4);
  prg.writeUInt16BE(state.pgm, 2);
  const prv = Buffer.alloc(8);
  prv.writeUInt16BE(state.pvw, 2);
  const tl = Buffer.alloc(2 + INPUTS * 3);
  tl.writeUInt16BE(INPUTS, 0);
  for (let n = 1; n <= INPUTS; n++) {
    tl.writeUInt16BE(n, 2 + (n - 1) * 3);
    tl.writeUInt8((n === state.pgm ? 1 : 0) | (n === state.pvw ? 2 : 0), 4 + (n - 1) * 3);
  }
  const ftb = Buffer.from([0, state.ftb ? 1 : 0, 0, 0]);
  return [cmd('PrgI', prg), cmd('PrvI', prv), cmd('TlSr', tl), cmd('FtbS', ftb)];
}
function send(addr, port, flags, payload, ackId = 0) {
  const c = clients.get(`${addr}:${port}`);
  if (!c) return;
  const id = flags & 0x01 ? (c.nextId = (c.nextId + 1) % 32768) : 0;
  const p = Buffer.concat([header(flags, 12 + payload.length, c.session, ackId, id), payload]);
  sock.send(p, port, addr);
}

sock.on('message', (msg, r) => {
  const key = `${r.address}:${r.port}`;
  const flags = msg.readUInt8(0) >> 3;
  if (flags & 0x02) {
    // HELLO
    clients.set(key, { session: 0x8000 + Math.floor(Math.random() * 0x7fff), nextId: 0 });
    log(`接続 ${key}`);
    const c = clients.get(key);
    sock.send(header(0x02, 12, c.session, 0, 0), r.port, r.address);
    setTimeout(() => {
      const names = [];
      for (let n = 1; n <= INPUTS; n++) {
        const b = Buffer.alloc(36);
        b.writeUInt16BE(n, 0);
        strBuf(`Camera ${n}`, 20).copy(b, 2);
        strBuf(`CAM${n}`, 4).copy(b, 22);
        names.push(cmd('InPr', b));
      }
      send(r.address, r.port, 0x01, Buffer.concat([cmd('_pin', Buffer.concat([strBuf('DEMO ATEM', 40), Buffer.alloc(4)])), ...names]));
      send(r.address, r.port, 0x01, Buffer.concat([...stateCommands(), cmd('InCm', Buffer.from([1, 0, 0, 0]))]));
    }, 50);
    return;
  }
  const c = clients.get(key);
  if (!c) return;
  if (flags & 0x01 && msg.length > 12) {
    const packetId = msg.readUInt16BE(10);
    let o = 12;
    while (o + 8 <= msg.length) {
      const len = msg.readUInt16BE(o);
      const name = msg.toString('ascii', o + 4, o + 8);
      const body = msg.subarray(o + 8, o + len);
      log(`受信 ${name} ${body.toString('hex')}`);
      if (name === 'CPgI') state.pgm = body.readUInt16BE(2);
      if (name === 'CPvI') state.pvw = body.readUInt16BE(2);
      if (name === 'DCut' || name === 'DAut') [state.pgm, state.pvw] = [state.pvw, state.pgm];
      if (name === 'FtbA') state.ftb = !state.ftb;
      o += Math.max(8, len);
    }
    send(r.address, r.port, 0x10, Buffer.alloc(0), packetId);
    send(r.address, r.port, 0x01, Buffer.concat(stateCommands()));
  }
});

// 何も無くても 1 秒ごとに知らせる（受け側の無通信検出用）
setInterval(() => {
  for (const key of clients.keys()) {
    const [addr, port] = key.split(':');
    send(addr, Number(port), 0x01, Buffer.alloc(0));
  }
}, 1000);

sock.bind(PORT, () => log(`待ち受け UDP ${PORT}`));
