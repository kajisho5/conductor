/** ボタン盤の位置（row/col は 0 始まり） */
export interface Cell {
  row: number;
  col: number;
}

export function cellKey(row: number, col: number): string {
  return `${row}/${col}`;
}

export function parseKey(key: string): Cell {
  const [r, c] = key.split('/');
  return { row: Number(r), col: Number(c) };
}

/** グリッドの大きさの許容範囲（SPEC 2.1：4–12 列 × 2–8 行） */
export const GRID_LIMITS = {
  minColumns: 4,
  maxColumns: 12,
  minRows: 2,
  maxRows: 8,
} as const;

export function clampGrid(columns: number, rows: number): { columns: number; rows: number } {
  return {
    columns: Math.min(GRID_LIMITS.maxColumns, Math.max(GRID_LIMITS.minColumns, Math.round(columns))),
    rows: Math.min(GRID_LIMITS.maxRows, Math.max(GRID_LIMITS.minRows, Math.round(rows))),
  };
}

/** iPhone 縦（compact）で一度に見せる列数（SPEC 3.2：4 列ずつ） */
export const COMPACT_COLUMNS = 4;

/** 列ブロック（1–4 列 / 5–8 列 …）の一覧。最後のブロックが 4 未満でもそのまま */
export function columnBlocks(columns: number, size = COMPACT_COLUMNS): { start: number; end: number; label: string }[] {
  const blocks: { start: number; end: number; label: string }[] = [];
  for (let start = 0; start < columns; start += size) {
    const end = Math.min(columns, start + size);
    blocks.push({ start, end, label: `${start + 1}–${end} 列` });
  }
  return blocks;
}

/** 表示幅に収まるボタンの一辺（正方形）。最小 44pt（HIG）を下回る場合は 44 */
export function fitCellSize(width: number, height: number, columns: number, rows: number, gap: number): number {
  const w = (width - gap * (columns - 1)) / columns;
  const h = (height - gap * (rows - 1)) / rows;
  return Math.max(44, Math.floor(Math.min(w, h)));
}

/** 本番用：縦横それぞれに伸ばす（正方形にしない） */
export function fitCellRect(width: number, height: number, columns: number, rows: number, gap: number): { w: number; h: number } {
  return {
    w: Math.max(44, Math.floor((width - gap * (columns - 1)) / columns)),
    h: Math.max(44, Math.floor((height - gap * (rows - 1)) / rows)),
  };
}

export function inGrid(cell: Cell, columns: number, rows: number): boolean {
  return cell.row >= 0 && cell.col >= 0 && cell.row < rows && cell.col < columns;
}
