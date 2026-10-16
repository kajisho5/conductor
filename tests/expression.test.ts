import { evalExpression, ExpressionError, parse, secondsToTimecode, timecodeToSeconds, toText, variablesOf } from '@/expression';

const vars: Record<string, string> = { 'custom:count': '3', 'custom:name': 'cam', 'DEMO-SW-A:pgm': 'CAM 2', 'custom:empty': '' };
const look = (s: string, n: string) => vars[`${s}:${n}`];
const ev = (src: string) => evalExpression(src, look);

describe('式', () => {
  it.each([
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['10 / 4', 2.5],
    ['10 % 4', 2],
    ['-2 * 3', -6],
    ['!true', false],
    ['1 < 2 && 2 < 3', true],
    ['1 > 2 || 2 > 3', false],
    ['3 == "3"', true],
    ['"a" + 1', 'a1'],
    ['$(custom:count) + 1', 4],
    ['$(custom:count) >= 3 ? "多" : "少"', '多'],
    ['concat($(custom:name), "-", 1)', 'cam-1'],
    ['includes($(DEMO-SW-A:pgm), "2")', true],
    ['toUpper($(custom:name))', 'CAM'],
    ['round(3.14159, 2)', 3.14],
    ['max(1, 5, 3) - min(4, 2)', 3],
    ['floor(2.7) + ceil(2.1) + abs(-1)', 6],
    ['secondsToTimecode(3725)', '01:02:05'],
    ['timecodeToSeconds("00:01:30")', 90],
    ["'a\\'b'", "a'b"],
  ])('%s', (src, want) => {
    expect(ev(src)).toEqual(want);
  });
  it('エラー', () => {
    expect(() => ev('1 +')).toThrow(ExpressionError);
    expect(() => ev('1 / 0')).toThrow('0 で割れません');
    expect(() => ev('$(custom:nope)')).toThrow('変数がありません');
    expect(() => ev('eval(1)')).toThrow('知らない名前');
    expect(() => ev('1 2')).toThrow('余分');
    expect(() => ev('')).toThrow('空');
    expect(() => ev('"abc')).toThrow('引用符');
    expect(() => ev('1 @ 2')).toThrow('使えない記号');
  });
  it('変数の一覧・表示', () => {
    expect(variablesOf(parse('$(a:b) + max($(c:d), 1)'))).toEqual([
      { scope: 'a', name: 'b' },
      { scope: 'c', name: 'd' },
    ]);
    expect(toText(0.1 + 0.2)).toBe('0.3');
    expect(secondsToTimecode(-61)).toBe('-00:01:01');
    expect(Number.isNaN(timecodeToSeconds('x:1'))).toBe(true);
  });
});
