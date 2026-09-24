import { COLS, HIDDEN_ROWS, VISIBLE_ROWS } from '../game/board';
import type { Game } from '../game/game';
import { cellsOf, PIECE_COLORS, type PieceType } from '../game/pieces';

export const CELL = 32;
const BOARD_W = COLS * CELL;
const BOARD_H = VISIBLE_ROWS * CELL;
const FONT = '"Press Start 2P", ui-monospace, monospace';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface FloatText {
  text: string;
  color: string;
  y: number;
  life: number;
  maxLife: number;
  size: number;
}

interface Trail {
  cells: [number, number][];
  distance: number;
  color: string;
  life: number;
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) =>
    Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Pre-rendered bevelled 8-bit style block sprites, one per colour & pixel size. */
class BlockSprites {
  private cache = new Map<string, HTMLCanvasElement>();

  get(color: string, size: number): HTMLCanvasElement {
    const px = Math.max(4, Math.round(size));
    const key = `${color}@${px}`;
    let sprite = this.cache.get(key);
    if (!sprite) {
      sprite = this.draw(color, px);
      this.cache.set(key, sprite);
    }
    return sprite;
  }

  private draw(color: string, s: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d')!;
    const b = Math.max(2, Math.round(s * 0.14)); // bevel thickness
    const u = Math.max(1, Math.round(s / 16)); // "pixel" unit

    g.fillStyle = shade(color, -0.55);
    g.fillRect(0, 0, s, s);

    // Bevel: light top/left, dark bottom/right.
    g.fillStyle = shade(color, 0.45);
    g.fillRect(u, u, s - 2 * u, b);
    g.fillRect(u, u, b, s - 2 * u);
    g.fillStyle = shade(color, -0.35);
    g.fillRect(u, s - u - b, s - 2 * u, b);
    g.fillRect(s - u - b, u, b, s - 2 * u);

    // Face with a soft vertical gradient.
    const grad = g.createLinearGradient(0, u + b, 0, s - u - b);
    grad.addColorStop(0, shade(color, 0.12));
    grad.addColorStop(1, shade(color, -0.12));
    g.fillStyle = grad;
    g.fillRect(u + b, u + b, s - 2 * (u + b), s - 2 * (u + b));

    // Pixel shine.
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(u + b, u + b, u * 2, u * 2);
    g.fillRect(u + b + u * 2, u + b, u * 2, u);
    return c;
  }
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly holdCtx: CanvasRenderingContext2D;
  private readonly nextCtx: CanvasRenderingContext2D;
  private readonly sprites = new BlockSprites();
  private scale = 1;

  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private trails: Trail[] = [];
  private shakeAmount = 0;
  private flash = 0;

  constructor(
    private readonly boardCanvas: HTMLCanvasElement,
    private readonly holdCanvas: HTMLCanvasElement,
    private readonly nextCanvas: HTMLCanvasElement,
  ) {
    this.ctx = boardCanvas.getContext('2d')!;
    this.holdCtx = holdCanvas.getContext('2d')!;
    this.nextCtx = nextCanvas.getContext('2d')!;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(boardCanvas);
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.boardCanvas.getBoundingClientRect();
    const cssW = rect.width || BOARD_W;
    this.scale = (cssW / BOARD_W) * dpr;
    this.boardCanvas.width = Math.round(BOARD_W * this.scale);
    this.boardCanvas.height = Math.round(BOARD_H * this.scale);
    for (const canvas of [this.holdCanvas, this.nextCanvas]) {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.round((r.width || 120) * dpr);
      canvas.height = Math.round((r.height || 120) * dpr);
    }
  }

  // ---- Effects API -------------------------------------------------------------

  shake(amount: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  flashScreen(amount = 1): void {
    this.flash = Math.max(this.flash, amount);
  }

  popText(text: string, color = '#fff', size = 18): void {
    // Stack new texts below any still-visible ones.
    const last = this.texts.at(-1);
    let y = last ? last.y + last.size / 2 + size / 2 + 16 : BOARD_H * 0.36;
    if (y > BOARD_H * 0.72) y = BOARD_H * 0.36;
    this.texts.push({ text, color, y, life: 1300, maxLife: 1300, size });
  }

  burstRows(game: Game, rows: number[]): void {
    for (const row of rows) {
      const cells = game.board.grid[row]!;
      const sy = (row - HIDDEN_ROWS) * CELL + CELL / 2;
      cells.forEach((cell, x) => {
        const color = cell ? PIECE_COLORS[cell] : '#ffffff';
        for (let i = 0; i < 4; i++) {
          this.particles.push({
            x: x * CELL + CELL / 2,
            y: sy,
            vx: (Math.random() - 0.5) * 0.9 + (x - 4.5) * 0.04,
            vy: -Math.random() * 0.7 - 0.15,
            life: 700 + Math.random() * 500,
            maxLife: 1200,
            color,
            size: 3 + Math.random() * 5,
          });
        }
      });
    }
  }

  dropTrail(cells: [number, number][], distance: number, piece: PieceType): void {
    if (distance <= 0) return;
    const color = PIECE_COLORS[piece];
    this.trails.push({ cells, distance, color, life: 1 });
    for (const [x, y] of cells) {
      for (let i = 0; i < 2; i++) {
        this.particles.push({
          x: x * CELL + Math.random() * CELL,
          y: (y - HIDDEN_ROWS + 1) * CELL,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -Math.random() * 0.25,
          life: 350,
          maxLife: 350,
          color,
          size: 2 + Math.random() * 3,
        });
      }
    }
  }

  // ---- Frame -------------------------------------------------------------------

  render(game: Game, dtMs: number, showActive = true): void {
    this.step(dtMs);
    this.drawBoard(game, showActive);
    this.drawHold(game);
    this.drawNext(game);
  }

  private step(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt * 0.3;
      p.y += p.vy * dt * 0.3;
      p.vy += 0.0025 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) t.life -= dt;
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const t of this.trails) t.life -= dt / 220;
    this.trails = this.trails.filter((t) => t.life > 0);
    this.shakeAmount *= Math.pow(0.88, dt / 16.67);
    if (this.shakeAmount < 0.1) this.shakeAmount = 0;
    this.flash = Math.max(0, this.flash - dt / 300);
  }

  private drawBoard(game: Game, showActive: boolean): void {
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.clearRect(0, 0, BOARD_W, BOARD_H);

    if (this.shakeAmount > 0) {
      ctx.translate(
        (Math.random() - 0.5) * this.shakeAmount,
        (Math.random() - 0.5) * this.shakeAmount * 0.6 + this.shakeAmount * 0.3,
      );
    }

    const live = showActive && !game.over && !game.clearing;
    this.drawBackground(game, live);
    this.drawStack(game);

    if (live) {
      this.drawGhost(game);
      this.drawTrails();
      this.drawActive(game);
    } else {
      this.drawTrails();
    }

    this.drawParticles();
    this.drawTexts();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.35})`;
      ctx.fillRect(-20, -20, BOARD_W + 40, BOARD_H + 40);
    }
  }

  private drawBackground(game: Game, live: boolean): void {
    const ctx = this.ctx;
    const bg = ctx.createLinearGradient(0, 0, 0, BOARD_H);
    bg.addColorStop(0, '#0b0620');
    bg.addColorStop(1, '#170a33');
    ctx.fillStyle = bg;
    ctx.fillRect(-20, -20, BOARD_W + 40, BOARD_H + 40);

    // Drop guide: faint column under the active piece.
    if (live) {
      const xs = game.activeCells().map(([x]) => x);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const guide = ctx.createLinearGradient(0, 0, 0, BOARD_H);
      guide.addColorStop(0, 'rgba(120, 90, 255, 0)');
      guide.addColorStop(1, 'rgba(120, 90, 255, 0.10)');
      ctx.fillStyle = guide;
      ctx.fillRect(minX * CELL, 0, (maxX - minX + 1) * CELL, BOARD_H);
    }

    ctx.strokeStyle = 'rgba(140, 110, 255, 0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) {
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, BOARD_H);
    }
    for (let y = 1; y < VISIBLE_ROWS; y++) {
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(BOARD_W, y * CELL + 0.5);
    }
    ctx.stroke();

    // Tiny dots on grid intersections for that arcade-cabinet look.
    ctx.fillStyle = 'rgba(170, 150, 255, 0.18)';
    for (let x = 1; x < COLS; x++) {
      for (let y = 1; y < VISIBLE_ROWS; y++) ctx.fillRect(x * CELL - 1, y * CELL - 1, 2, 2);
    }
  }

  private drawStack(game: Game): void {
    const ctx = this.ctx;
    const clearing = new Set(game.clearing?.rows ?? []);
    const p = game.clearProgress ?? 0;
    const dim = game.over ? 0.35 : 1;

    game.board.grid.forEach((row, y) => {
      if (y < HIDDEN_ROWS) return;
      const sy = (y - HIDDEN_ROWS) * CELL;
      if (clearing.has(y)) {
        this.drawClearingRow(row, sy, p);
        return;
      }
      row.forEach((cell, x) => {
        if (!cell) return;
        ctx.globalAlpha = dim;
        this.drawBlock(ctx, x * CELL, sy, CELL, PIECE_COLORS[cell]);
        ctx.globalAlpha = 1;
      });
    });
  }

  private drawClearingRow(row: readonly (PieceType | null)[], sy: number, p: number): void {
    const ctx = this.ctx;
    // Flash the whole row, then dissolve cells from the centre outward.
    const pulse = 0.5 + 0.5 * Math.sin(p * Math.PI * 6);
    row.forEach((cell, x) => {
      const dist = Math.abs(x - (COLS - 1) / 2) / (COLS / 2);
      const start = 0.2 + dist * 0.45;
      const k = Math.min(1, Math.max(0, (p - start) / 0.3));
      const size = CELL * (1 - k);
      if (size <= 0.5) return;
      const off = (CELL - size) / 2;
      if (cell) this.drawBlock(ctx, x * CELL + off, sy + off, size, PIECE_COLORS[cell]);
      ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.5 * pulse * (1 - k)})`;
      ctx.fillRect(x * CELL + off, sy + off, size, size);
    });
    // Glow line through the row.
    ctx.fillStyle = `rgba(255,255,255,${0.25 * (1 - p)})`;
    ctx.fillRect(0, sy - 3, BOARD_W, CELL + 6);
  }

  private drawGhost(game: Game): void {
    const ctx = this.ctx;
    const gy = game.ghostY();
    if (gy === game.active.y) return;
    const color = PIECE_COLORS[game.active.type];
    for (const [x, y] of game.activeCells(gy)) {
      if (y < HIDDEN_ROWS) continue;
      const sx = x * CELL;
      const sy = (y - HIDDEN_ROWS) * CELL;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.12;
      ctx.fillRect(sx + 2, sy + 2, CELL - 4, CELL - 4);
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(sx + 3, sy + 3, CELL - 6, CELL - 6);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  private drawActive(game: Game): void {
    const ctx = this.ctx;
    const color = PIECE_COLORS[game.active.type];
    const lock = game.lockProgress;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    for (const [x, y] of game.activeCells()) {
      if (y < HIDDEN_ROWS) continue;
      this.drawBlock(ctx, x * CELL, (y - HIDDEN_ROWS) * CELL, CELL, color);
    }
    ctx.restore();
    // Brighten as the lock delay runs out, so the player can feel it coming.
    if (lock > 0) {
      ctx.fillStyle = `rgba(255,255,255,${lock * 0.35})`;
      for (const [x, y] of game.activeCells()) {
        if (y < HIDDEN_ROWS) continue;
        ctx.fillRect(x * CELL, (y - HIDDEN_ROWS) * CELL, CELL, CELL);
      }
    }
  }

  private drawTrails(): void {
    const ctx = this.ctx;
    for (const t of this.trails) {
      const columns = new Map<number, number>();
      for (const [x, y] of t.cells) columns.set(x, Math.min(columns.get(x) ?? Infinity, y));
      for (const [x, top] of columns) {
        const bottom = (top - HIDDEN_ROWS) * CELL;
        const topY = bottom - t.distance * CELL;
        const grad = ctx.createLinearGradient(0, topY, 0, bottom);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, t.color);
        ctx.globalAlpha = t.life * 0.45;
        ctx.fillStyle = grad;
        ctx.fillRect(x * CELL + 4, topY, CELL - 8, bottom - topY);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      const s = p.size;
      ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
    }
    ctx.restore();
  }

  private drawTexts(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const age = 1 - t.life / t.maxLife;
      const pop = age < 0.12 ? 0.6 + (age / 0.12) * 0.55 : age < 0.2 ? 1.15 - (age - 0.12) * 1.9 : 1;
      const alpha = age > 0.75 ? 1 - (age - 0.75) / 0.25 : 1;
      const y = t.y - age * 40;
      ctx.globalAlpha = alpha;
      ctx.font = `${Math.round(t.size * pop)}px ${FONT}`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#12051f';
      ctx.strokeText(t.text, BOARD_W / 2, y);
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, BOARD_W / 2, y);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  // ---- Side panels ---------------------------------------------------------------

  private drawHold(game: Game): void {
    const ctx = this.holdCtx;
    const { width, height } = this.holdCanvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!game.hold) return;
    ctx.globalAlpha = game.canHold ? 1 : 0.3;
    this.drawPreview(ctx, game.hold, width / 2, height / 2, Math.min(width, height) / 4.6);
    ctx.globalAlpha = 1;
  }

  private drawNext(game: Game): void {
    const ctx = this.nextCtx;
    const { width, height } = this.nextCanvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const queue = game.nextQueue;
    const big = Math.min(width / 4.6, height / 14);
    const small = big * 0.72;
    let y = big * 1.6;
    queue.forEach((type, i) => {
      const cell = i === 0 ? big : small;
      ctx.globalAlpha = i === 0 ? 1 : 0.85 - i * 0.08;
      this.drawPreview(ctx, type, width / 2, y, cell);
      y += i === 0 ? big * 2.9 : small * 2.9;
    });
    ctx.globalAlpha = 1;
  }

  private drawPreview(
    ctx: CanvasRenderingContext2D,
    type: PieceType,
    cx: number,
    cy: number,
    cell: number,
  ): void {
    const cells = cellsOf(type, 0);
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const w = Math.max(...xs) - Math.min(...xs) + 1;
    const h = Math.max(...ys) - Math.min(...ys) + 1;
    const ox = cx - (w * cell) / 2 - Math.min(...xs) * cell;
    const oy = cy - (h * cell) / 2 - Math.min(...ys) * cell;
    for (const [x, y] of cells) {
      this.drawBlock(ctx, Math.round(ox + x * cell), Math.round(oy + y * cell), cell, PIECE_COLORS[type]);
    }
  }

  private drawBlock(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    color: string,
  ): void {
    const scale = ctx.getTransform().a;
    ctx.drawImage(this.sprites.get(color, size * scale), x, y, size, size);
  }
}
