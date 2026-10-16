import { fromBase64, parseHex, printable, toBase64, toHex, unescapeText, utf8Decode, utf8Encode } from '@/drivers/bytes';
import { decodeOscMessage, encodeOscMessage } from '@/drivers/osc';
import { buildPayload, checkFeedback, compare, PayloadError, ReceiveParser, renderTemplate, withDefaults } from '@/drivers/engine';
import { DefinitionError, getActionDef, getDefinition, getFeedbackDef, listDefinitions, validateDefinition } from '@/drivers/registry';

const def = (id: string) => getDefinition(id)!;

describe('バイト列', () => {
  it('UTF-8 と Base64 の往復', () => {
    const s = 'CAM 1 カメラ🎥';
    expect(utf8Decode(utf8Encode(s))).toBe(s);
    const b = utf8Encode(s);
    expect(fromBase64(toBase64(b))).toEqual(b);
    expect(toBase64(Uint8Array.from([0, 1, 2, 3]))).toBe('AAECAw==');
  });
  it('エスケープ \\r \\n \\t \\\\ \\xNN', () => {
    expect(Array.from(unescapeText('A\\r\\n\\t\\\\\\x02'))).toEqual([65, 13, 10, 9, 92, 2]);
    expect(Array.from(unescapeText('\\q'))).toEqual([92, 113]);
  });
  it('16 進', () => {
    expect(Array.from(parseHex('02 41, 0x0d'))).toEqual([2, 0x41, 13]);
    expect(() => parseHex('0G')).toThrow('16 進');
    expect(() => parseHex('123')).toThrow('2 文字ずつ');
    expect(toHex(Uint8Array.from([2, 255]))).toBe('02 FF');
  });
  it('ログ用の表示', () => {
    expect(printable(utf8Encode('OK\r\n\x02'))).toBe('OK\\r\\n\\x02');
  });
});

describe('OSC 1.0', () => {
  it('アドレス・型・値を 4 バイト境界で並べる', () => {
    const b = encodeOscMessage('/a', [{ type: 'i', value: 1 }]);
    // "/a\0\0" ",i\0\0" 00 00 00 01
    expect(Array.from(b)).toEqual([47, 97, 0, 0, 44, 105, 0, 0, 0, 0, 0, 1]);
  });
  it('往復（int・float・string・T・F）', () => {
    const b = encodeOscMessage('/demo/ch/1', [
      { type: 'i', value: -5 },
      { type: 'f', value: 0.5 },
      { type: 's', value: 'abcd' },
      { type: 'T' },
      { type: 'F' },
    ]);
    expect(b.length % 4).toBe(0);
    expect(decodeOscMessage(b)).toEqual({ address: '/demo/ch/1', args: [-5, 0.5, 'abcd', true, false] });
  });
  it('/ で始まらないアドレスはエラー', () => {
    expect(() => encodeOscMessage('demo', [])).toThrow('/ で始め');
  });
});

describe('テンプレートと送信内容', () => {
  it('{{option.x}} {{config.x}}', () => {
    expect(renderTemplate('{{option.a}}-{{ config.b }}-{{option.none}}', { option: { a: 1 }, config: { b: 'x' } })).toBe('1-x-');
  });
  it('TCP：文字＋改行', () => {
    const d = def('generic-tcp');
    const p = buildPayload(d, getActionDef('generic-tcp', 'send')!, { data: 'PLAY' }, withDefaults(d.configFields, {}));
    expect(p.kind === 'bytes' && utf8Decode(p.bytes)).toBe('PLAY\r\n');
  });
  it('TCP：16 進（改行は付けない）', () => {
    const d = def('generic-tcp');
    const p = buildPayload(d, getActionDef('generic-tcp', 'send_hex')!, { data: '02 41' }, withDefaults(d.configFields, {}));
    expect(p.kind === 'bytes' && Array.from(p.bytes)).toEqual([2, 0x41]);
  });
  it('空の送信・不正な 16 進は PayloadError', () => {
    const d = def('generic-udp');
    const cfg = withDefaults(d.configFields, {});
    expect(() => buildPayload(d, getActionDef('generic-udp', 'send')!, { data: '' }, cfg)).toThrow(PayloadError);
    expect(() => buildPayload(d, getActionDef('generic-udp', 'send_hex')!, { data: 'ZZ' }, cfg)).toThrow(PayloadError);
  });
  it('OSC：型なしは値を付けない', () => {
    const d = def('generic-osc');
    const p = buildPayload(d, getActionDef('generic-osc', 'send')!, { address: '/go', type: 'none', value: '' }, {});
    expect(p.kind === 'bytes' && decodeOscMessage(p.bytes)).toEqual({ address: '/go', args: [] });
    const p2 = buildPayload(
      d,
      getActionDef('generic-osc', 'send2')!,
      { address: '/f', type1: 'i', value1: '3', type2: 'f', value2: '0.25' },
      {},
    );
    expect(p2.kind === 'bytes' && decodeOscMessage(p2.bytes).args).toEqual([3, 0.25]);
  });
  it('HTTP：URL・方式・本文', () => {
    const d = def('generic-http');
    const a = getActionDef('generic-http', 'request')!;
    const get = buildPayload(d, a, withDefaults(a.options, { path: 'api/play', body: 'x' }), { baseUrl: 'http://10.0.0.5:8080/' });
    expect(get).toEqual({ kind: 'http', method: 'GET', url: 'http://10.0.0.5:8080/api/play', headers: {}, body: undefined });
    const post = buildPayload(d, a, withDefaults(a.options, { method: 'POST', path: '/x', body: '{"a":1}' }), { baseUrl: 'http://h' });
    expect(post).toMatchObject({ method: 'POST', body: '{"a":1}', headers: { 'Content-Type': 'application/json' } });
    expect(() => buildPayload(d, a, {}, { baseUrl: '' })).toThrow('URL の先頭');
  });
});

describe('受信と状態表示', () => {
  it('行がまたがっても 1 行ずつ変数へ', () => {
    const p = new ReceiveParser(def('generic-tcp'));
    expect(p.feed(utf8Encode('HEL')).updates).toEqual({});
    const r = p.feed(utf8Encode('LO\r\nWOR'));
    expect(r.updates).toEqual({ last_received: 'HELLO' });
    expect(p.feed(utf8Encode('LD\n')).updates).toEqual({ last_received: 'WORLD' });
  });
  it('UDP は受け取った塊ごと', () => {
    const p = new ReceiveParser(def('generic-udp'));
    expect(p.feed(utf8Encode('A\r\n')).updates).toEqual({ last_received: 'A' });
  });
  it('比べ方', () => {
    expect(compare('eq', '1.0', '1')).toBe(true);
    expect(compare('eq', 'a', 'a')).toBe(true);
    expect(compare('neq', 'a', 'b')).toBe(true);
    expect(compare('contains', 'PLAYING', 'PLAY')).toBe(true);
    expect(compare('contains', 'x', '')).toBe(false);
    expect(compare('gt', '10', '9')).toBe(true);
    expect(compare('gt', 'b', 'a')).toBe(false);
    expect(compare('lte', '3', '3')).toBe(true);
  });
  it('定義の状態表示', () => {
    const fb = getFeedbackDef('generic-tcp', 'received')!;
    expect(checkFeedback(fb, { op: 'contains', value: 'OK' }, { last_received: 'OK 1' })).toBe(true);
    expect(checkFeedback(fb, { op: 'eq', value: 'OK' }, undefined)).toBe(false);
    const demo = getFeedbackDef('demo', 'demo.equals')!;
    expect(checkFeedback(demo, { key: 'pgm', value: 'CAM 1' }, { pgm: 'CAM 1' })).toBe(true);
    const st = getFeedbackDef('generic-http', 'status')!;
    expect(checkFeedback(st, withDefaults(st.options, {}), { last_status: '200' })).toBe(true);
  });
});

describe('定義の確認', () => {
  it('同梱の定義はすべて通る', () => {
    const ids = listDefinitions().map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining(['generic-tcp', 'generic-udp', 'generic-osc', 'generic-http', 'demo']));
    for (const d of listDefinitions()) expect(() => validateDefinition(d)).not.toThrow();
  });
  it('形のおかしい定義・未知の送信形式は通さない', () => {
    const base = JSON.parse(JSON.stringify(def('generic-tcp')));
    expect(() => validateDefinition({ ...base, format: 2 })).toThrow(DefinitionError);
    expect(() => validateDefinition({ ...base, id: 'Bad ID' })).toThrow(DefinitionError);
    expect(() => validateDefinition({ ...base, transport: 'ftp' })).toThrow(DefinitionError);
    const badSend = JSON.parse(JSON.stringify(base));
    badSend.actions[0].send = { kind: 'script', code: 'x' };
    expect(() => validateDefinition(badSend)).toThrow(DefinitionError);
    const badRe = JSON.parse(JSON.stringify(base));
    badRe.receive = [{ match: '(', set: [] }];
    expect(() => validateDefinition(badRe)).toThrow('正規表現');
    const dup = JSON.parse(JSON.stringify(base));
    dup.actions.push(dup.actions[0]);
    expect(() => validateDefinition(dup)).toThrow('重複');
  });
});
