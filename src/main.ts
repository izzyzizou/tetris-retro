import './style.css';
import { Audio } from './engine/audio';
import { Input, type Action } from './engine/input';
import { Renderer } from './engine/renderer';
import { loadScores, loadSetting, saveScore, saveSetting, type ScoreEntry } from './engine/storage';
import { HIDDEN_ROWS } from './game/board';
import { Game, MAX_LEVEL, type GameEvent, type TSpin } from './game/game';

type Screen = 'title' | 'countdown' | 'playing' | 'over';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const els = {
  board: $<HTMLCanvasElement>('board'),
  hold: $<HTMLCanvasElement>('hold'),
  next: $<HTMLCanvasElement>('next'),
  frame: $('board-frame'),
  overlay: $('overlay'),
  score: $('score'),
  hiscore: $('hiscore'),
  level: $('level'),
  lines: $('lines'),
  levelProgress: $('level-progress'),
  mute: $<HTMLButtonElement>('mute-btn'),
  touch: $('touch-controls'),
};

const MAX_START_LEVEL = 15;
const CLEAR_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS!'];
const CLEAR_COLORS = ['#fff', '#2de2ff', '#3ee07f', '#ffd23f', '#ff4fd8'];

class App {
  private readonly audio = new Audio();
  private readonly renderer = new Renderer(els.board, els.hold, els.next);
  private readonly input: Input;
  game = new Game();
  private screen: Screen = 'title';
  private startLevel = clamp(Number(loadSetting('startLevel')) || 1, 1, MAX_START_LEVEL);
  private shownScore = 0;
  private lastFrame = performance.now();
  private countdown = 0;
  private resultsShown = false;
  private unsubscribe: () => void = () => {};

  constructor() {
    this.input = new Input({
      press: (a) => this.onPress(a),
      release: (a) => this.onRelease(a),
      shift: (dir) => {
        if (this.screen === 'playing' && this.game.move(dir)) this.audio.move();
      },
    });
    this.input.bindTouchButtons(els.touch);

    if (loadSetting('muted') === '1') this.toggleMute();
    els.mute.addEventListener('click', () => {
      this.audio.unlock();
      this.toggleMute();
      els.mute.blur();
    });
    els.overlay.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.onPress('confirm');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen === 'playing' && !this.game.paused) this.togglePause();
    });

    this.showTitle();
    this.updateHud(true);
    requestAnimationFrame(this.frame);

    // Handy for debugging from the console during development.
    if (import.meta.env.DEV) Object.assign(window, { app: this });
  }

  // ---- Main loop -----------------------------------------------------------

  private frame = (now: number): void => {
    // Clamp dt so a background tab doesn't cause a huge simulation jump.
    const dt = Math.min(now - this.lastFrame, 100);
    this.lastFrame = now;

    if (this.screen === 'countdown') this.tickCountdown(dt);
    if (this.screen === 'playing') {
      this.input.update(dt);
      this.game.update(dt);
    }

    this.renderer.render(this.game, dt, this.screen !== 'title');
    this.updateHud(false, dt);
    requestAnimationFrame(this.frame);
  };

  // ---- Input -----------------------------------------------------------------

  private onPress(action: Action): void {
    this.audio.unlock();

    if (action === 'mute') {
      this.toggleMute();
      return;
    }

    switch (this.screen) {
      case 'title':
        if (action === 'left' || action === 'right') this.changeStartLevel(action === 'left' ? -1 : 1);
        else if (action === 'confirm') this.startCountdown();
        return;
      case 'over':
        // Ignore input until the results are on screen, so a mashed key can't skip them.
        if (action === 'confirm' && this.resultsShown) this.showTitle();
        return;
      case 'countdown':
        return;
      case 'playing':
        break;
    }

    const game = this.game;
    if (action === 'pause' || (action === 'confirm' && game.paused)) {
      this.togglePause();
      return;
    }
    if (game.paused) return;

    switch (action) {
      case 'left':
        if (game.move(-1)) this.audio.move();
        break;
      case 'right':
        if (game.move(1)) this.audio.move();
        break;
      case 'rotateCW':
        game.rotate(1);
        break;
      case 'rotateCCW':
        game.rotate(-1);
        break;
      case 'softDrop':
        game.setSoftDrop(true);
        break;
      case 'hardDrop':
        game.hardDrop();
        break;
      case 'hold':
        game.holdPiece();
        break;
      default:
        break;
    }
  }

  private onRelease(action: Action): void {
    if (action === 'softDrop') this.game.setSoftDrop(false);
  }

  // ---- Screens ---------------------------------------------------------------

  private showTitle(): void {
    this.screen = 'title';
    this.audio.stopMusic();
    this.renderTitle();
  }

  private renderTitle(): void {
    this.setOverlay(`
      <h3>RETRO<br/>EDITION</h3>
      <div class="level-select">
        <button type="button" data-lv="-1" aria-label="Lower start level">◀</button>
        <span class="lv">LEVEL ${this.startLevel}</span>
        <button type="button" data-lv="1" aria-label="Raise start level">▶</button>
      </div>
      <p class="blink">PRESS ENTER<br/>OR TAP TO START</p>
      <p>CLEAR LINES. STACK TETRISES.<br/>CHAIN COMBOS & T-SPINS.</p>
    `);
    els.overlay.querySelectorAll<HTMLButtonElement>('[data-lv]').forEach((btn) =>
      btn.addEventListener('click', () => {
        this.audio.unlock();
        this.changeStartLevel(Number(btn.dataset.lv));
      }),
    );
  }

  private changeStartLevel(delta: number): void {
    const next = clamp(this.startLevel + delta, 1, MAX_START_LEVEL);
    if (next === this.startLevel) return;
    this.startLevel = next;
    saveSetting('startLevel', String(next));
    this.audio.move();
    this.renderTitle();
  }

  private startCountdown(): void {
    this.unsubscribe();
    this.game = new Game({ startLevel: this.startLevel });
    this.unsubscribe = this.game.on((e) => this.onGameEvent(e));
    this.shownScore = 0;
    this.updateHud(true);
    this.screen = 'countdown';
    this.countdown = 3000;
    this.audio.select();
    this.showCount(3);
  }

  private tickCountdown(dt: number): void {
    const before = Math.ceil(this.countdown / 1000);
    this.countdown -= dt * 1.6;
    const after = Math.ceil(this.countdown / 1000);
    if (this.countdown <= 0) {
      this.screen = 'playing';
      this.hideOverlay();
      this.renderer.popText('GO!', '#3ee07f', 30);
      this.audio.select();
      this.audio.setLevel(this.game.level);
      this.audio.startMusic();
      this.audio.pauseMusic(false);
    } else if (after !== before) {
      this.showCount(after);
    }
  }

  private showCount(n: number): void {
    this.audio.move();
    els.overlay.className = 'overlay countdown';
    els.overlay.innerHTML = `<div class="big-count">${n}</div>`;
  }

  private togglePause(): void {
    this.game.togglePause();
    this.audio.pauseMusic(this.game.paused);
    this.game.setSoftDrop(false);
    if (this.game.paused) {
      this.setOverlay(`
        <h3>PAUSED</h3>
        <p class="blink">PRESS P OR TAP<br/>TO RESUME</p>
      `);
    } else {
      this.hideOverlay();
    }
  }

  private gameOver(): void {
    this.screen = 'over';
    this.resultsShown = false;
    this.audio.stopMusic();
    this.audio.gameOver();
    this.renderer.shake(14);
    const entry: ScoreEntry = {
      score: this.game.score,
      lines: this.game.lines,
      level: this.game.level,
      date: new Date().toISOString(),
    };
    const { scores, rank } = saveScore(entry);
    bestCache = null;
    const rows = scores
      .map(
        (s, i) =>
          `<tr class="${i === rank ? 'me' : ''}"><td>${i + 1}.</td><td>${s.score.toLocaleString()}</td><td>L${s.level}</td></tr>`,
      )
      .join('');

    // Let the lock/shake play out before covering the board.
    window.setTimeout(() => {
      this.setOverlay(`
        <h3${rank === 0 ? ' class="gold"' : ''}>${rank === 0 ? 'NEW HIGH<br/>SCORE!' : 'GAME<br/>OVER'}</h3>
        <div class="final-score">${this.game.score.toLocaleString()}</div>
        <p>LINES ${this.game.lines} · LEVEL ${this.game.level} · TETRISES ${this.game.tetrises}</p>
        <table class="score-table">${rows}</table>
        <p class="blink">PRESS ENTER</p>
      `);
      this.updateHud(true);
      this.resultsShown = true;
    }, 900);
  }

  private setOverlay(html: string): void {
    els.overlay.className = 'overlay';
    els.overlay.innerHTML = html;
  }

  private hideOverlay(): void {
    els.overlay.className = 'overlay hidden';
  }

  private toggleMute(): void {
    const muted = this.audio.toggleMute();
    els.mute.classList.toggle('muted', muted);
    saveSetting('muted', muted ? '1' : '0');
  }

  // ---- Game feedback -----------------------------------------------------------

  private onGameEvent(e: GameEvent): void {
    const r = this.renderer;
    switch (e.type) {
      case 'rotate':
        this.audio.rotate();
        break;
      case 'softDrop':
        this.audio.softDrop();
        break;
      case 'hold':
        this.audio.hold();
        break;
      case 'hardDrop':
        r.dropTrail(e.cells, e.distance, e.piece);
        r.shake(Math.min(3 + e.distance * 0.35, 8));
        this.audio.hardDrop();
        break;
      case 'lock':
        this.audio.lock();
        break;
      case 'clear': {
        const special = e.lines === 4 || e.tspin !== 'none' || e.perfectClear;
        r.burstRows(this.game, e.rows);
        r.shake(e.lines * 2.5 + (special ? 6 : 0));
        if (special) r.flashScreen(e.lines === 4 ? 1 : 0.6);
        this.audio.clear(e.lines, special);

        if (e.backToBack) r.popText('BACK-TO-BACK', '#ff9f1c', 11);
        const name = e.tspin !== 'none' ? tspinName(e.tspin, e.lines) : CLEAR_NAMES[e.lines]!;
        r.popText(name, e.tspin !== 'none' ? '#b76bff' : CLEAR_COLORS[e.lines]!, e.lines === 4 ? 24 : 16);
        if (e.combo > 0) r.popText(`${e.combo} COMBO`, '#2de2ff', 12);
        if (e.perfectClear) r.popText('PERFECT CLEAR', '#ffd23f', 14);
        r.popText(`+${e.points.toLocaleString()}`, '#ffffff', 11);
        break;
      }
      case 'tspin':
        r.popText(tspinName(e.tspin, 0), '#b76bff', 14);
        this.audio.rotate();
        break;
      case 'levelUp':
        r.popText(`LEVEL ${e.level}`, '#ffd23f', 20);
        r.flashScreen(0.5);
        this.audio.levelUp();
        this.audio.setLevel(e.level);
        bump(els.level);
        break;
      case 'gameOver':
        this.gameOver();
        break;
      case 'move':
        break;
    }
  }

  // ---- HUD -----------------------------------------------------------------

  private updateHud(force: boolean, dt = 16): void {
    const g = this.game;
    if (force) this.shownScore = g.score;
    else if (this.shownScore !== g.score) {
      // Arcade-style count-up.
      const diff = g.score - this.shownScore;
      this.shownScore += Math.ceil(diff * Math.min(1, dt * 0.012));
      if (this.shownScore > g.score) this.shownScore = g.score;
    }

    const best = Math.max(loadBest(), g.score);
    setText(els.score, this.shownScore.toLocaleString());
    setText(els.hiscore, best.toLocaleString());
    setText(els.level, String(g.level));
    setText(els.lines, String(g.lines));
    const progress = g.level >= MAX_LEVEL ? 100 : (g.lines % 10) * 10;
    els.levelProgress.style.width = `${progress}%`;

    const danger =
      this.screen === 'playing' &&
      g.board.grid.slice(0, HIDDEN_ROWS + 4).some((row) => row.some((c) => c !== null));
    els.frame.classList.toggle('danger', danger);
  }
}

let bestCache: number | null = null;
function loadBest(): number {
  bestCache ??= loadScores()[0]?.score ?? 0;
  return bestCache;
}

function tspinName(tspin: TSpin, lines: number): string {
  const prefix = tspin === 'mini' ? 'MINI T-SPIN' : 'T-SPIN';
  return lines === 0 ? prefix : `${prefix} ${CLEAR_NAMES[lines]!.replace('!', '')}`;
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function bump(el: HTMLElement): void {
  el.classList.remove('bump');
  void el.offsetWidth; // restart the animation
  el.classList.add('bump');
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Wait for the pixel font so canvas text renders with it from the first frame.
void document.fonts.ready.finally(() => new App());
