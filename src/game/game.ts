import { Bag, type Rng } from './bag';
import { Board, HIDDEN_ROWS } from './board';
import { cellsOf, kicksFor, type PieceType, type Rotation } from './pieces';

export const LOCK_DELAY_MS = 500;
export const MAX_LOCK_RESETS = 15;
export const LINE_CLEAR_MS = 380;
export const NEXT_QUEUE_SIZE = 5;
export const MAX_LEVEL = 20;

export type TSpin = 'none' | 'mini' | 'full';

export interface ActivePiece {
  type: PieceType;
  rotation: Rotation;
  x: number;
  y: number;
}

export type GameEvent =
  | { type: 'move' }
  | { type: 'rotate' }
  | { type: 'softDrop' }
  | { type: 'hardDrop'; distance: number; cells: [number, number][]; piece: PieceType }
  | { type: 'lock'; piece: PieceType; cells: [number, number][] }
  | { type: 'hold' }
  | {
      type: 'clear';
      rows: number[];
      lines: number;
      tspin: TSpin;
      backToBack: boolean;
      combo: number;
      points: number;
      perfectClear: boolean;
    }
  | { type: 'tspin'; tspin: TSpin; points: number }
  | { type: 'levelUp'; level: number }
  | { type: 'gameOver' };

export type GameListener = (event: GameEvent) => void;

export interface GameOptions {
  startLevel?: number;
  rng?: Rng;
}

const LINE_SCORES = [0, 100, 300, 500, 800];
const TSPIN_SCORES = [400, 800, 1200, 1600];
const TSPIN_MINI_SCORES = [100, 200, 400];
const PERFECT_CLEAR_SCORES = [0, 800, 1200, 1800, 2000];

/** Seconds per row from the Tetris guideline gravity curve, in milliseconds. */
export function gravityMs(level: number): number {
  const l = Math.min(level, MAX_LEVEL);
  return Math.pow(0.8 - (l - 1) * 0.007, l - 1) * 1000;
}

export class Game {
  readonly board = new Board();
  readonly startLevel: number;
  active!: ActivePiece;
  hold: PieceType | null = null;
  canHold = true;

  score = 0;
  lines = 0;
  level: number;
  combo = -1;
  backToBack = false;
  piecesPlaced = 0;
  tetrises = 0;
  elapsedMs = 0;

  over = false;
  paused = false;
  softDropping = false;
  /** Rows currently being cleared (animation in progress) or null. */
  clearing: { rows: number[]; remaining: number } | null = null;

  private readonly bag: Bag;
  private gravityAcc = 0;
  private lockTimer = 0;
  private lockResets = 0;
  private lowestY = 0;
  private lastMoveWasRotation = false;
  private lastKickIndex = 0;
  private listeners: GameListener[] = [];

  constructor(options: GameOptions = {}) {
    this.startLevel = Math.max(1, Math.min(MAX_LEVEL, options.startLevel ?? 1));
    this.level = this.startLevel;
    this.bag = new Bag(options.rng);
    this.spawn(this.bag.next());
  }

  on(listener: GameListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  get nextQueue(): PieceType[] {
    return this.bag.peek(NEXT_QUEUE_SIZE);
  }

  /** Clear animation progress from 0 to 1, or null when not clearing. */
  get clearProgress(): number | null {
    return this.clearing ? 1 - this.clearing.remaining / LINE_CLEAR_MS : null;
  }

  get lockProgress(): number {
    return this.isGrounded() ? Math.min(1, this.lockTimer / LOCK_DELAY_MS) : 0;
  }

  get acceptsInput(): boolean {
    return !this.over && !this.paused && !this.clearing;
  }

  ghostY(): number {
    const { type, rotation, x } = this.active;
    let y = this.active.y;
    while (this.board.fits(type, rotation, x, y + 1)) y++;
    return y;
  }

  activeCells(y = this.active.y): [number, number][] {
    const { type, rotation, x } = this.active;
    return cellsOf(type, rotation).map(([cx, cy]) => [x + cx, y + cy]);
  }

  // ---- Player actions ----------------------------------------------------

  move(dx: -1 | 1): boolean {
    if (!this.acceptsInput) return false;
    const { type, rotation, x, y } = this.active;
    if (!this.board.fits(type, rotation, x + dx, y)) return false;
    this.active.x += dx;
    this.lastMoveWasRotation = false;
    this.afterManipulation();
    this.emit({ type: 'move' });
    return true;
  }

  rotate(dir: 1 | -1): boolean {
    if (!this.acceptsInput) return false;
    const { type, rotation, x, y } = this.active;
    const to = ((rotation + dir + 4) % 4) as Rotation;
    const kicks = kicksFor(type, rotation, to);
    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i]!;
      if (this.board.fits(type, to, x + kx, y + ky)) {
        this.active.rotation = to;
        this.active.x += kx;
        this.active.y += ky;
        this.lastMoveWasRotation = true;
        this.lastKickIndex = i;
        this.afterManipulation();
        this.emit({ type: 'rotate' });
        return true;
      }
    }
    return false;
  }

  hardDrop(): void {
    if (!this.acceptsInput) return;
    const target = this.ghostY();
    const distance = target - this.active.y;
    if (distance > 0) this.lastMoveWasRotation = false;
    const cells = this.activeCells(target);
    this.active.y = target;
    this.score += distance * 2;
    this.emit({ type: 'hardDrop', distance, cells, piece: this.active.type });
    this.lock();
  }

  holdPiece(): boolean {
    if (!this.acceptsInput || !this.canHold) return false;
    const current = this.active.type;
    const swapped = this.hold;
    this.hold = current;
    this.spawn(swapped ?? this.bag.next());
    this.canHold = false;
    this.emit({ type: 'hold' });
    return true;
  }

  setSoftDrop(active: boolean): void {
    this.softDropping = active;
  }

  togglePause(): void {
    if (!this.over) this.paused = !this.paused;
  }

  // ---- Simulation ----------------------------------------------------------

  update(dtMs: number): void {
    if (this.over || this.paused) return;
    this.elapsedMs += dtMs;

    if (this.clearing) {
      this.clearing.remaining -= dtMs;
      if (this.clearing.remaining <= 0) this.finishClear();
      return;
    }

    const normal = gravityMs(this.level);
    const interval = this.softDropping ? Math.max(normal / 20, 1000 / 60) : normal;
    this.gravityAcc += dtMs;

    while (this.gravityAcc >= interval) {
      if (!this.stepDown()) {
        this.gravityAcc = 0;
        break;
      }
      this.gravityAcc -= interval;
      if (this.softDropping) {
        this.score += 1;
        this.emit({ type: 'softDrop' });
      }
    }

    if (this.isGrounded()) {
      this.lockTimer += dtMs;
      if (this.lockTimer >= LOCK_DELAY_MS) this.lock();
    } else {
      this.lockTimer = 0;
    }
  }

  // ---- Internals -----------------------------------------------------------

  private stepDown(): boolean {
    const { type, rotation, x, y } = this.active;
    if (!this.board.fits(type, rotation, x, y + 1)) return false;
    this.active.y++;
    this.lastMoveWasRotation = false;
    if (this.active.y > this.lowestY) {
      this.lowestY = this.active.y;
      this.lockResets = 0;
      this.lockTimer = 0;
    }
    return true;
  }

  private isGrounded(): boolean {
    const { type, rotation, x, y } = this.active;
    return !this.board.fits(type, rotation, x, y + 1);
  }

  /** Move-reset lock delay, limited so pieces can't be stalled forever. */
  private afterManipulation(): void {
    if (this.isGrounded() && this.lockResets < MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  private spawn(type: PieceType): void {
    const x = type === 'O' ? 4 : 3;
    const y = HIDDEN_ROWS - 2;
    this.active = { type, rotation: 0, x, y };
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lastMoveWasRotation = false;
    this.lastKickIndex = 0;

    if (!this.board.fits(type, 0, x, y)) {
      this.endGame();
      return;
    }
    // Guideline: drop one row immediately if there's room so the piece is visible.
    if (this.board.fits(type, 0, x, y + 1)) this.active.y++;
    this.lowestY = this.active.y;
  }

  private detectTSpin(): TSpin {
    const { type, rotation, x, y } = this.active;
    if (type !== 'T' || !this.lastMoveWasRotation) return 'none';
    const filled = (dx: number, dy: number) => this.board.isFilled(x + dx, y + dy);
    const tl = filled(0, 0);
    const tr = filled(2, 0);
    const bl = filled(0, 2);
    const br = filled(2, 2);
    if ([tl, tr, bl, br].filter(Boolean).length < 3) return 'none';
    const front: Record<Rotation, [boolean, boolean]> = {
      0: [tl, tr],
      1: [tr, br],
      2: [bl, br],
      3: [tl, bl],
    };
    const [f1, f2] = front[rotation];
    return (f1 && f2) || this.lastKickIndex === 4 ? 'full' : 'mini';
  }

  private lock(): void {
    const { type, rotation, x, y } = this.active;
    const tspin = this.detectTSpin();
    const cells = this.activeCells();
    this.board.place(type, rotation, x, y);
    this.piecesPlaced++;
    this.emit({ type: 'lock', piece: type, cells });

    // Lock out: the whole piece came to rest above the visible field.
    if (cells.every(([, cy]) => cy < HIDDEN_ROWS)) {
      this.endGame();
      return;
    }

    const rows = this.board.fullRows();
    this.applyScore(rows, tspin);

    if (rows.length > 0) {
      this.clearing = { rows, remaining: LINE_CLEAR_MS };
    } else {
      this.spawnNext();
    }
  }

  private applyScore(rows: number[], tspin: TSpin): void {
    const n = rows.length;
    if (n === 0) {
      this.combo = -1;
      if (tspin !== 'none') {
        const points = (tspin === 'full' ? TSPIN_SCORES[0]! : TSPIN_MINI_SCORES[0]!) * this.level;
        this.score += points;
        this.emit({ type: 'tspin', tspin, points });
      }
      return;
    }

    let base: number;
    if (tspin === 'full') base = TSPIN_SCORES[n] ?? 0;
    else if (tspin === 'mini') base = TSPIN_MINI_SCORES[n] ?? TSPIN_SCORES[n] ?? 0;
    else base = LINE_SCORES[n] ?? 0;

    const difficult = n === 4 || tspin !== 'none';
    const backToBack = difficult && this.backToBack;
    if (backToBack) base *= 1.5;
    this.backToBack = difficult;

    this.combo++;
    const comboBonus = this.combo > 0 ? 50 * this.combo * this.level : 0;

    const doomed = new Set(rows);
    const perfectClear = this.board.grid.every(
      (row, ry) => doomed.has(ry) || row.every((c) => c === null),
    );
    const pcBonus = perfectClear ? (PERFECT_CLEAR_SCORES[n] ?? 0) * this.level : 0;

    const points = Math.floor(base * this.level) + comboBonus + pcBonus;
    this.score += points;
    if (n === 4) this.tetrises++;

    this.emit({
      type: 'clear',
      rows,
      lines: n,
      tspin,
      backToBack,
      combo: this.combo,
      points,
      perfectClear,
    });

    this.lines += n;
    const newLevel = Math.min(MAX_LEVEL, Math.max(this.startLevel, Math.floor(this.lines / 10) + 1));
    if (newLevel > this.level) {
      this.level = newLevel;
      this.emit({ type: 'levelUp', level: newLevel });
    }
  }

  private finishClear(): void {
    if (!this.clearing) return;
    this.board.clearRows(this.clearing.rows);
    this.clearing = null;
    this.spawnNext();
  }

  private spawnNext(): void {
    this.canHold = true;
    this.spawn(this.bag.next());
  }

  private endGame(): void {
    if (this.over) return;
    this.over = true;
    this.emit({ type: 'gameOver' });
  }

  private emit(event: GameEvent): void {
    for (const l of this.listeners) l(event);
  }
}
