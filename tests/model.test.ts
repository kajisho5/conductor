import { cellKey, clampGrid, columnBlocks, fitCellRect, fitCellSize, inGrid, parseKey } from '@/model/grid';
import { demoShow, newShow } from '@/model/defaults';
import { sizeClassFor } from '@/hooks/useSizeClass';

describe('grid', () => {
  it('キーの往復', () => {
    expect(parseKey(cellKey(3, 7))).toEqual({ row: 3, col: 7 });
  });
  it('大きさは 4–12 列 × 2–8 行に収める', () => {
    expect(clampGrid(2, 1)).toEqual({ columns: 4, rows: 2 });
    expect(clampGrid(20, 20)).toEqual({ columns: 12, rows: 8 });
    expect(clampGrid(8.4, 4)).toEqual({ columns: 8, rows: 4 });
  });
  it('列ブロックは 4 列ずつ', () => {
    expect(columnBlocks(8).map((b) => b.label)).toEqual(['1–4 列', '5–8 列']);
    expect(columnBlocks(10).map((b) => [b.start, b.end])).toEqual([
      [0, 4],
      [4, 8],
      [8, 10],
    ]);
  });
  it('ボタンは 44pt を下回らない', () => {
    expect(fitCellSize(100, 100, 12, 8, 8)).toBe(44);
    expect(fitCellSize(700, 400, 8, 4, 8)).toBe(80);
    expect(fitCellRect(1000, 600, 8, 4, 12)).toEqual({ w: 114, h: 141 });
  });
  it('範囲判定', () => {
    expect(inGrid({ row: 3, col: 7 }, 8, 4)).toBe(true);
    expect(inGrid({ row: 4, col: 0 }, 8, 4)).toBe(false);
  });
});

describe('サイズクラス（iPhone Duo を含む）', () => {
  it('幅と高さで決める', () => {
    expect(sizeClassFor(393, 852)).toBe('compact'); // iPhone 縦
    expect(sizeClassFor(852, 393)).toBe('compact'); // iPhone 横
    expect(sizeClassFor(1024, 768)).toBe('regular'); // iPad
    expect(sizeClassFor(507, 1024)).toBe('compact'); // iPad の狭い Split View
    expect(sizeClassFor(744, 1133)).toBe('regular'); // iPad mini 縦
  });
});

describe('既定値とデモ', () => {
  it('新しいショーは 8×4・1 ページ', () => {
    const s = newShow('X');
    expect(s.grid).toEqual({ columns: 8, rows: 4 });
    expect(s.pages).toHaveLength(1);
    expect(s.settings.lockOnShowMode).toBe('ask');
    expect(s.settings.showModeSwipe).toBe(false);
  });
  it('デモに実在の社名を使わない（DEMO- で始まる）', () => {
    const s = demoShow();
    for (const d of s.devices) expect(d.label.startsWith('DEMO-')).toBe(true);
    expect(s.pages.map((p) => p.number)).toEqual([1, 2, 3]);
  });
});
