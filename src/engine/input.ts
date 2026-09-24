export type Action =
  | 'left'
  | 'right'
  | 'softDrop'
  | 'hardDrop'
  | 'rotateCW'
  | 'rotateCCW'
  | 'hold'
  | 'pause'
  | 'mute'
  | 'confirm';

const KEYMAP: Record<string, Action> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowDown: 'softDrop',
  KeyS: 'softDrop',
  Space: 'hardDrop',
  ArrowUp: 'rotateCW',
  KeyX: 'rotateCW',
  KeyW: 'rotateCW',
  KeyZ: 'rotateCCW',
  ControlLeft: 'rotateCCW',
  ControlRight: 'rotateCCW',
  KeyC: 'hold',
  ShiftLeft: 'hold',
  ShiftRight: 'hold',
  KeyP: 'pause',
  Escape: 'pause',
  KeyM: 'mute',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
};

export interface InputHandlers {
  press(action: Action): void;
  release?(action: Action): void;
  /** Called for auto-repeated horizontal shifts (DAS/ARR). */
  shift(dir: -1 | 1): void;
}

/**
 * Keyboard + touch input with guideline-style Delayed Auto Shift:
 * the first press moves immediately, holding moves again after DAS ms,
 * then every ARR ms. The most recently pressed direction wins.
 */
export class Input {
  das = 150;
  arr = 33;

  private held = new Set<Action>();
  private dirStack: (-1 | 1)[] = [];
  private dasTimer = 0;
  private arrTimer = 0;

  constructor(private readonly handlers: InputHandlers) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.releaseAll);
  }

  /** Bind on-screen buttons that carry a `data-action` attribute. */
  bindTouchButtons(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-action]').forEach((el) => {
      const action = el.dataset.action as Action;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add('pressed');
        this.down(action);
      });
      const up = (e: PointerEvent) => {
        e.preventDefault();
        el.classList.remove('pressed');
        this.up(action);
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  update(dtMs: number): void {
    const dir = this.dirStack.at(-1);
    if (dir === undefined) return;
    this.dasTimer += dtMs;
    if (this.dasTimer < this.das) return;
    this.arrTimer += dtMs;
    // ARR of 0 would mean "instant"; cap iterations to the board width.
    let steps = 0;
    while (this.arrTimer >= this.arr && steps < 10) {
      this.arrTimer -= this.arr;
      this.handlers.shift(dir);
      steps++;
    }
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const action = KEYMAP[e.code];
    if (!action) return;
    e.preventDefault();
    if (e.repeat) return;
    this.down(action);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const action = KEYMAP[e.code];
    if (!action) return;
    e.preventDefault();
    this.up(action);
  };

  private down(action: Action): void {
    if (this.held.has(action)) return;
    this.held.add(action);
    if (action === 'left' || action === 'right') {
      const dir = action === 'left' ? -1 : 1;
      this.dirStack = this.dirStack.filter((d) => d !== dir);
      this.dirStack.push(dir);
      this.dasTimer = 0;
      this.arrTimer = 0;
    }
    this.handlers.press(action);
  }

  private up(action: Action): void {
    if (!this.held.delete(action)) return;
    if (action === 'left' || action === 'right') {
      const dir = action === 'left' ? -1 : 1;
      this.dirStack = this.dirStack.filter((d) => d !== dir);
      this.dasTimer = 0;
      this.arrTimer = 0;
    }
    this.handlers.release?.(action);
  }

  private releaseAll = (): void => {
    for (const action of [...this.held]) this.up(action);
  };
}
