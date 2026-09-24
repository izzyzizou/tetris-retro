/**
 * Chiptune audio synthesised on the fly with the Web Audio API —
 * no audio files needed. Square/triangle/noise voices like an 8-bit console.
 */

// Korobeiniki (traditional Russian folk song), as [midi note | null (rest), beats].
type Note = readonly [number | null, number];

const E5 = 76, B4 = 71, C5 = 72, D5 = 74, A4 = 69, F5 = 77, A5 = 81, G5 = 79, Gs4 = 68, Gs5 = 80;

const MELODY_A: Note[] = [
  [E5, 1], [B4, 0.5], [C5, 0.5], [D5, 1], [C5, 0.5], [B4, 0.5],
  [A4, 1], [A4, 0.5], [C5, 0.5], [E5, 1], [D5, 0.5], [C5, 0.5],
  [B4, 1.5], [C5, 0.5], [D5, 1], [E5, 1],
  [C5, 1], [A4, 1], [A4, 1], [null, 1],
  [null, 0.5], [D5, 1], [F5, 0.5], [A5, 1], [G5, 0.5], [F5, 0.5],
  [E5, 1.5], [C5, 0.5], [E5, 1], [D5, 0.5], [C5, 0.5],
  [B4, 1], [B4, 0.5], [C5, 0.5], [D5, 1], [E5, 1],
  [C5, 1], [A4, 1], [A4, 1], [null, 1],
];

const MELODY_B: Note[] = [
  [E5, 2], [C5, 2], [D5, 2], [B4, 2],
  [C5, 2], [A4, 2], [Gs4, 2], [B4, 1], [null, 1],
  [E5, 2], [C5, 2], [D5, 2], [B4, 2],
  [C5, 1], [E5, 1], [A5, 2], [Gs5, 3], [null, 1],
];

// One bass root per bar (4 beats), played as bouncing octave eighth notes.
const BASS_A = [40, 45, 40, 45, 38, 36, 40, 45];
const BASS_B = [45, 40, 45, 40, 45, 40, 45, 40];

const MELODY: Note[] = [...MELODY_A, ...MELODY_A, ...MELODY_B];
const BASS: number[] = [...BASS_A, ...BASS_A, ...BASS_B];
const LOOP_BEATS = MELODY.reduce((sum, [, b]) => sum + b, 0);

const midiToHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;

  muted = false;
  private musicOn = false;
  private tempo = 1;
  private schedulerId: number | undefined;
  private melodyIndex = 0;
  private melodyTime = 0;
  private bassBeat = 0;
  private bassTime = 0;

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 0.5;
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.22;
      this.musicBus.connect(this.master);
      this.noise = this.makeNoise(ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.6, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  // ---- Music ---------------------------------------------------------------

  startMusic(): void {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.melodyIndex = 0;
    this.bassBeat = 0;
    this.melodyTime = this.bassTime = this.ctx.currentTime + 0.1;
    this.schedulerId = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic(): void {
    this.musicOn = false;
    window.clearInterval(this.schedulerId);
  }

  pauseMusic(paused: boolean): void {
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(paused ? 0 : 0.22, this.ctx.currentTime, 0.05);
  }

  /** Music speeds up gently as the level rises. */
  setLevel(level: number): void {
    this.tempo = 1 + Math.min(level - 1, 14) * 0.035;
  }

  private get beat(): number {
    return 60 / (132 * this.tempo);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicOn) return;
    const horizon = ctx.currentTime + 0.15;
    // Resync if the tab was throttled and we fell far behind.
    if (this.melodyTime < ctx.currentTime - 0.5) {
      this.melodyTime = this.bassTime = ctx.currentTime + 0.05;
    }
    while (this.melodyTime < horizon) {
      const [note, beats] = MELODY[this.melodyIndex]!;
      const dur = beats * this.beat;
      if (note !== null) this.tone(note, this.melodyTime, dur * 0.9, 'square', 0.28, this.musicBus);
      this.melodyTime += dur;
      this.melodyIndex = (this.melodyIndex + 1) % MELODY.length;
    }
    while (this.bassTime < horizon) {
      const bar = Math.floor(this.bassBeat / 4) % BASS.length;
      const eighth = Math.round((this.bassBeat % 4) * 2);
      const root = BASS[bar]!;
      const note = eighth % 2 === 0 ? root : root + 12;
      this.tone(note, this.bassTime, this.beat * 0.45, 'triangle', 0.5, this.musicBus);
      this.bassTime += this.beat / 2;
      this.bassBeat = (this.bassBeat + 0.5) % LOOP_BEATS;
    }
  }

  // ---- Sound effects ---------------------------------------------------------

  move(): void {
    this.blip(220, 0.03, 'square', 0.12);
  }

  rotate(): void {
    this.sweep(440, 660, 0.05, 'square', 0.12);
  }

  softDrop(): void {
    this.blip(110, 0.015, 'triangle', 0.1);
  }

  hold(): void {
    this.sweep(330, 520, 0.08, 'triangle', 0.25);
  }

  lock(): void {
    this.blip(90, 0.06, 'square', 0.18);
  }

  hardDrop(): void {
    this.sweep(300, 60, 0.12, 'square', 0.3);
    this.noiseBurst(0.1, 0.35, 1200);
  }

  clear(lines: number, special: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const base = special ? [72, 76, 79, 84, 88] : [64, 67, 71, 76];
    const count = special ? base.length : Math.min(base.length, lines + 1);
    for (let i = 0; i < count; i++) {
      this.tone(base[i]!, t + i * 0.055, 0.12, 'square', 0.3, this.sfxBus);
    }
    this.noiseBurst(0.25, 0.15, 4000);
  }

  levelUp(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    [72, 76, 79, 84, 79, 84].forEach((n, i) =>
      this.tone(n, t + i * 0.07, 0.1, 'square', 0.3, this.sfxBus),
    );
  }

  gameOver(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    [67, 63, 60, 55, 48].forEach((n, i) =>
      this.tone(n, t + i * 0.18, 0.22, 'square', 0.3, this.sfxBus),
    );
  }

  select(): void {
    this.sweep(520, 1040, 0.09, 'square', 0.2);
  }

  // ---- Primitives ------------------------------------------------------------

  private tone(
    midi: number,
    at: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    bus: GainNode,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = midiToHz(midi);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(vol, at + 0.005);
    gain.gain.setValueAtTime(vol, at + dur * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(gain).connect(bus);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private blip(freq: number, dur: number, type: OscillatorType, vol: number): void {
    this.sweep(freq, freq, dur, type, vol);
  }

  private sweep(from: number, to: number, dur: number, type: OscillatorType, vol: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noiseBurst(dur: number, vol: number, cutoff: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur);
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}
