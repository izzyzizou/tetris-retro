# Tetris Retro

A neon-soaked, synthwave-flavoured Tetris for the browser — built with **TypeScript**, **Vite** and the **Canvas 2D** / **Web Audio** APIs. No game engine, no image or audio assets: every block sprite is drawn in code and all music and sound effects are synthesised live as 8-bit chiptune.

## Features

**Gameplay (modern guideline rules)**
- Super Rotation System (SRS) with full wall-kick tables for I and JLSTZ pieces
- 7-bag randomizer, 5-piece next queue, hold piece
- Ghost piece and a drop-guide column
- Lock delay (500 ms) with move-reset (max 15), so you can slide pieces into place
- Tunable DAS / ARR for crisp, responsive horizontal movement
- Guideline gravity curve across 20 levels; pick a start level from 1–15
- Scoring for singles through Tetrises, T-spins (full & mini), back-to-back bonus, combos and perfect clears
- Top-5 local high-score table

**Look & feel**
- Bevelled pixel-art blocks, glowing active piece that brightens as lock delay runs out
- Line-clear flash and centre-out dissolve animation, particle bursts, hard-drop trails, screen shake
- Arcade popups (`TETRIS!`, `T-SPIN DOUBLE`, `3 COMBO`, `BACK-TO-BACK`…) and a count-up score
- Synthwave sun, scrolling horizon grid and a CRT scanline/vignette overlay
- Board pulses red when the stack gets dangerously high
- Chiptune rendition of *Korobeiniki* that speeds up with the level
- Responsive layout with on-screen touch controls on phones and tablets
- Auto-pauses when the tab loses focus

## Controls

| Action | Keys |
| --- | --- |
| Move | ← → (or A / D) |
| Soft drop | ↓ (or S) |
| Hard drop | Space |
| Rotate clockwise | ↑ / X / W |
| Rotate counter-clockwise | Z / Ctrl |
| Hold | C / Shift |
| Pause | P / Esc |
| Toggle sound | M |
| Start / confirm | Enter |

On touch devices, use the on-screen pad below the board.

## Getting started

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev        # start the dev server
npm test           # run the unit tests (Vitest)
npm run build      # type-check and build to dist/
npm run preview    # serve the production build
```

The production build uses relative asset paths, so `dist/` can be hosted from any static host or sub-path (e.g. GitHub Pages).

## Project structure

```
src/
├── main.ts            # App controller: screens, HUD, wiring game events to FX & audio
├── style.css          # Retro/synthwave styling, CRT overlay, responsive layout
├── game/              # Pure, framework-free game logic (fully unit-tested)
│   ├── pieces.ts      # Tetromino shapes, rotations, SRS kick tables, colours
│   ├── bag.ts         # 7-bag randomizer (+ seeded RNG for tests)
│   ├── board.ts       # Playfield grid, collision, line clearing
│   ├── game.ts        # Game state machine: gravity, lock delay, scoring, hold, T-spins
│   └── game.test.ts
└── engine/            # Browser-facing layers
    ├── renderer.ts    # Canvas rendering, sprite cache, particles, popups, shake
    ├── input.ts       # Keyboard/touch input with DAS/ARR
    ├── audio.ts       # Web Audio chiptune music and sound effects
    └── storage.ts     # High scores & settings in localStorage
```
