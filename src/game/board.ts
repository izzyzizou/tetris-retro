import { cellsOf, type PieceType, type Rotation } from './pieces';

export const COLS = 10;
export const VISIBLE_ROWS = 20;
/** Extra rows above the visible field where pieces spawn. */
export const HIDDEN_ROWS = 2;
export const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

export type Cell = PieceType | null;

export class Board {
  readonly grid: Cell[][];

  constructor() {
    this.grid = Array.from({ length: ROWS }, () => emptyRow());
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < COLS && y >= 0 && y < ROWS;
  }

  /** Walls and floor count as filled. */
  isFilled(x: number, y: number): boolean {
    if (x < 0 || x >= COLS || y >= ROWS) return true;
    if (y < 0) return false;
    return this.grid[y]![x] !== null;
  }

  fits(type: PieceType, rotation: Rotation, px: number, py: number): boolean {
    return cellsOf(type, rotation).every(([cx, cy]) => !this.isFilled(px + cx, py + cy));
  }

  place(type: PieceType, rotation: Rotation, px: number, py: number): void {
    for (const [cx, cy] of cellsOf(type, rotation)) {
      const x = px + cx;
      const y = py + cy;
      if (this.inBounds(x, y)) this.grid[y]![x] = type;
    }
  }

  fullRows(): number[] {
    const rows: number[] = [];
    this.grid.forEach((row, y) => {
      if (row.every((c) => c !== null)) rows.push(y);
    });
    return rows;
  }

  clearRows(rows: readonly number[]): void {
    const doomed = new Set(rows);
    const kept = this.grid.filter((_, y) => !doomed.has(y));
    const fresh = Array.from({ length: rows.length }, () => emptyRow());
    this.grid.splice(0, this.grid.length, ...fresh, ...kept);
  }

  isEmpty(): boolean {
    return this.grid.every((row) => row.every((c) => c === null));
  }
}

function emptyRow(): Cell[] {
  return Array.from({ length: COLS }, () => null);
}
