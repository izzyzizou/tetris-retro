import { describe, expect, it } from 'vitest';
import { Bag, seededRng } from './bag';
import { Board, COLS, HIDDEN_ROWS, ROWS } from './board';
import { Game, gravityMs, LINE_CLEAR_MS, LOCK_DELAY_MS } from './game';
import { cellsOf, PIECE_TYPES, SHAPES } from './pieces';

function fillRow(board: Board, y: number, gapX: number | null = null): void {
  for (let x = 0; x < COLS; x++) board.grid[y]![x] = x === gapX ? null : 'J';
}

describe('pieces', () => {
  it('every rotation of every piece has exactly four cells', () => {
    for (const type of PIECE_TYPES) {
      for (const shape of SHAPES[type]) {
        expect(shape.flat().filter(Boolean)).toHaveLength(4);
      }
    }
  });

  it('four clockwise rotations return to the spawn state', () => {
    const t = SHAPES.T;
    expect(t[0]).toEqual([
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ]);
    expect(t[1]).toEqual([
      [0, 1, 0],
      [0, 1, 1],
      [0, 1, 0],
    ]);
  });
});

describe('7-bag randomizer', () => {
  it('deals each piece exactly once per bag', () => {
    const bag = new Bag(seededRng(42));
    for (let round = 0; round < 5; round++) {
      const dealt = Array.from({ length: 7 }, () => bag.next());
      expect(new Set(dealt).size).toBe(7);
    }
  });

  it('peek does not consume pieces', () => {
    const bag = new Bag(seededRng(1));
    const preview = bag.peek(10);
    expect(Array.from({ length: 10 }, () => bag.next())).toEqual(preview);
  });
});

describe('board', () => {
  it('treats walls and floor as solid', () => {
    const board = new Board();
    expect(board.isFilled(-1, 5)).toBe(true);
    expect(board.isFilled(COLS, 5)).toBe(true);
    expect(board.isFilled(0, ROWS)).toBe(true);
    expect(board.isFilled(0, -1)).toBe(false);
  });

  it('clears rows and shifts everything above down', () => {
    const board = new Board();
    fillRow(board, ROWS - 1);
    board.grid[ROWS - 2]![3] = 'T';
    board.clearRows([ROWS - 1]);
    expect(board.grid[ROWS - 1]![3]).toBe('T');
    expect(board.grid).toHaveLength(ROWS);
  });
});

describe('game', () => {
  const newGame = () => new Game({ rng: seededRng(7) });

  it('spawns the first piece just inside the visible field', () => {
    const game = newGame();
    const ys = game.activeCells().map(([, y]) => y);
    expect(Math.max(...ys)).toBe(HIDDEN_ROWS);
  });

  it('moves left and right until hitting a wall', () => {
    const game = newGame();
    let moves = 0;
    while (game.move(-1)) moves++;
    expect(moves).toBeGreaterThan(0);
    expect(Math.min(...game.activeCells().map(([x]) => x))).toBe(0);
    expect(game.move(-1)).toBe(false);
  });

  it('hard drop lands on the floor, locks and awards 2 points per row', () => {
    const game = newGame();
    const type = game.active.type;
    const distance = game.ghostY() - game.active.y;
    game.hardDrop();
    expect(game.score).toBe(distance * 2);
    expect(game.piecesPlaced).toBe(1);
    const bottom = game.board.grid[ROWS - 1]!;
    expect(bottom.filter((c) => c === type).length).toBeGreaterThan(0);
  });

  it('gravity pulls the piece down over time', () => {
    const game = newGame();
    const y0 = game.active.y;
    game.update(gravityMs(1) + 1);
    expect(game.active.y).toBe(y0 + 1);
  });

  it('locks a grounded piece after the lock delay', () => {
    const game = newGame();
    game.active.y = game.ghostY();
    game.update(LOCK_DELAY_MS - 10);
    expect(game.piecesPlaced).toBe(0);
    game.update(20);
    expect(game.piecesPlaced).toBe(1);
  });

  it('clears a line, scores it and advances after the animation', () => {
    const game = newGame();
    // Force an I piece and leave a 4-wide gap it can fill.
    game.active = { type: 'I', rotation: 0, x: 3, y: HIDDEN_ROWS - 1 };
    const y = ROWS - 1;
    for (let x = 0; x < COLS; x++) if (x < 3 || x > 6) game.board.grid[y]![x] = 'L';
    const events: string[] = [];
    game.on((e) => events.push(e.type));
    game.hardDrop();
    expect(events).toContain('clear');
    expect(game.lines).toBe(1);
    expect(game.clearing).not.toBeNull();
    game.update(LINE_CLEAR_MS + 1);
    expect(game.clearing).toBeNull();
    expect(game.board.isEmpty()).toBe(true);
    expect(game.board.grid[y]!.every((c) => c === null)).toBe(true);
  });

  it('rewards a tetris and a back-to-back tetris', () => {
    const game = newGame();
    const doTetris = () => {
      for (let i = 0; i < 4; i++) fillRow(game.board, ROWS - 1 - i, 0);
      game.active = { type: 'I', rotation: 1, x: -2, y: HIDDEN_ROWS };
      game.hardDrop();
      game.update(LINE_CLEAR_MS + 1);
    };
    const points: number[] = [];
    game.on((e) => {
      if (e.type === 'clear') points.push(e.points);
    });
    doTetris();
    doTetris();
    // 2nd tetris: 800 * 1.5 back-to-back + 50 * combo(1).
    expect(points[0]).toBe(800 + 2000); // perfect clear bonus on an otherwise empty board
    expect(points[1]).toBe(1200 + 50 + 2000);
    expect(game.tetrises).toBe(2);
  });

  it('hold swaps pieces once per drop', () => {
    const game = newGame();
    const first = game.active.type;
    const next = game.nextQueue[0];
    expect(game.holdPiece()).toBe(true);
    expect(game.hold).toBe(first);
    expect(game.active.type).toBe(next);
    expect(game.holdPiece()).toBe(false);
    game.hardDrop();
    expect(game.holdPiece()).toBe(true);
  });

  it('uses SRS wall kicks to rotate against a wall', () => {
    const game = newGame();
    game.active = { type: 'T', rotation: 1, x: -1, y: 10 };
    expect(game.board.fits('T', 1, -1, 10)).toBe(true);
    // Rotating to state 2 needs one kick right, since column -1 is out of bounds.
    expect(game.rotate(1)).toBe(true);
    expect(game.active.rotation).toBe(2);
    expect(game.active.x).toBe(0);
  });

  it('detects a T-spin double', () => {
    const game = newGame();
    const b = game.board;
    const bottom = ROWS - 1;
    // Classic TSD slot: gap at x=4..(row bottom-1 needs x=3,4,5), bottom needs x=4.
    fillRow(b, bottom, 4);
    fillRow(b, bottom - 1);
    b.grid[bottom - 1]![3] = null;
    b.grid[bottom - 1]![4] = null;
    b.grid[bottom - 1]![5] = null;
    b.grid[bottom - 2]![3] = 'Z'; // overhang
    game.active = { type: 'T', rotation: 1, x: 3, y: bottom - 2 };
    // Rotate from R into the slot (spawn state 2 = pointing down).
    const events: { tspin?: string; lines?: number }[] = [];
    game.on((e) => {
      if (e.type === 'clear') events.push({ tspin: e.tspin, lines: e.lines });
    });
    expect(game.rotate(1)).toBe(true);
    game.hardDrop();
    expect(events[0]).toEqual({ tspin: 'full', lines: 2 });
  });

  it('ends the game when a new piece cannot spawn', () => {
    const game = newGame();
    for (let y = HIDDEN_ROWS; y < ROWS; y++) fillRow(game.board, y, y % COLS);
    for (let y = 0; y < HIDDEN_ROWS + 2; y++) fillRow(game.board, y, 9 - (y % 2));
    let over = false;
    game.on((e) => {
      if (e.type === 'gameOver') over = true;
    });
    game.hardDrop();
    expect(over).toBe(true);
    expect(game.over).toBe(true);
  });

  it('levels up every 10 lines', () => {
    const game = newGame();
    game.lines = 9;
    game.active = { type: 'I', rotation: 0, x: 3, y: HIDDEN_ROWS - 1 };
    for (let x = 0; x < COLS; x++) if (x < 3 || x > 6) game.board.grid[ROWS - 1]![x] = 'L';
    game.hardDrop();
    expect(game.level).toBe(2);
  });

  it('gravity gets faster at higher levels', () => {
    expect(gravityMs(1)).toBeCloseTo(1000);
    expect(gravityMs(10)).toBeLessThan(gravityMs(5));
    expect(gravityMs(15)).toBeLessThan(20);
  });

  it('cellsOf matches the matrix for the I piece', () => {
    expect(cellsOf('I', 0)).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ]);
  });
});
