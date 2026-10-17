// OSEE GoStream 風の模擬機器（TCP 19010）。値・名前はすべて架空（機種は DEMO-SW-A）。
// 使い方：npm run mock:osee（-- --port 19010）
// 枠：EB A6・00・長さ（LE）・JSON・CRC-16/MODBUS（LE）。get には res で今の値、set には pus で変わった値を返す
import net from 'node:net';

const args = process.argv.slice(2);
const i = args.indexOf('--port');
const PORT = i >= 0 ? Number(args[i + 1]) : 19010;
const time = () => new Date().toISOString().slice(11, 23);
const log = (m) => console.log(`${time()} [OSEE] ${m}`);

const state = {
  deviceType: [10],
  deviceName: ['DEMO-SW-A'],
  version: ['2.1.0'],
  inputList: [1, 2, 3, 4, 4001, 4002, 4003, 4004, 3010, 3020, 5001],
  keyCount: [1],
  dskCount: [2],
  playCount: [2],
  pgmIndex: [1],
  pvwIndex: [2],
  previewTransition: [0],
  transitionStyle: ['Mix'],
  ftbStatus: [0],
  recordStatus: [0],
  live: [0],
};
const indexed = { keyOnAir: {}, keyEnable: {}, dskOnAir: {}, dskEnable: {}, audioMixerEnable: {}, liveStreamOutputEnable: {} };

function crc16(b) {
  let c = 0xffff;
  for (const x of b) {
    c ^= x;
    for (let j = 0; j < 8; j++) c = c & 1 ? (c >>> 1) ^ 0xa001 : c >>> 1;
  }
  return c & 0xffff;
}
function frame(obj) {
  const json = Buffer.from(JSON.stringify(obj));
  const h = Buffer.from([0xeb, 0xa6, 0x00, 0, 0]);
  h.writeUInt16LE(json.length + 2, 3);
  const body = Buffer.concat([h, json]);
  const c = Buffer.alloc(2);
  c.writeUInt16LE(crc16(body), 0);
  return Buffer.concat([body, c]);
}

net
  .createServer((s) => {
    log(`接続 ${s.remoteAddress}`);
    let buf = Buffer.alloc(0);
    const reply = (obj) => s.write(frame(obj));
    s.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 7) {
        if (buf[0] !== 0xeb || buf[1] !== 0xa6) {
          buf = buf.subarray(1);
          continue;
        }
        const len = buf.readUInt16LE(3);
        if (buf.length < 5 + len) break;
        const body = buf.subarray(0, 5 + len - 2);
        const ok = buf.readUInt16LE(5 + len - 2) === crc16(body);
        const json = buf.subarray(5, 5 + len - 2).toString();
        buf = buf.subarray(5 + len);
        if (!ok) {
          log(`CRC が違う ${json}`);
          continue;
        }
        const cmd = JSON.parse(json);
        log(`受信 ${json}`);
        const v = cmd.value ?? [];
        if (cmd.type === 'get') {
          if (indexed[cmd.id]) reply({ id: cmd.id, type: 'res', value: [v[0] ?? 0, indexed[cmd.id][v[0] ?? 0] ?? 0] });
          else reply({ id: cmd.id, type: 'res', value: state[cmd.id] ?? [] });
          continue;
        }
        if (cmd.id === 'cutTransition' || cmd.id === 'autoTransition') {
          [state.pgmIndex, state.pvwIndex] = [state.pvwIndex, state.pgmIndex];
          reply({ id: 'pgmIndex', type: 'pus', value: state.pgmIndex });
          reply({ id: 'pvwIndex', type: 'pus', value: state.pvwIndex });
        } else if (cmd.id === 'ftb') {
          state.ftbStatus = [state.ftbStatus[0] ? 0 : 1];
          reply({ id: 'ftbStatus', type: 'pus', value: state.ftbStatus });
        } else if (cmd.id === 'recordStart' || cmd.id === 'recordStop') {
          state.recordStatus = [cmd.id === 'recordStart' ? 1 : 0];
          reply({ id: 'recordStatus', type: 'pus', value: state.recordStatus });
        } else if (indexed[cmd.id] && v.length >= 2) {
          indexed[cmd.id][v[0]] = v[1];
          reply({ id: cmd.id, type: 'pus', value: v });
        } else if (v.length) {
          state[cmd.id] = v;
          reply({ id: cmd.id, type: 'pus', value: v });
        }
      }
    });
    s.on('error', () => undefined);
    s.on('close', () => log('切断'));
  })
  .listen(PORT, () => log(`TCP ${PORT} で待っています（機種 DEMO-SW-A）`));
