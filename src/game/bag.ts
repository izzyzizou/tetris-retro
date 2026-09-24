import { PIECE_TYPES, type PieceType } from './pieces';

export type Rng = () => number;

/** 7-bag randomizer: every piece appears exactly once per bag of seven. */
export class Bag {
  private queue: PieceType[] = [];

  constructor(private readonly rng: Rng = Math.random) {}

  next(): PieceType {
    this.ensure(1);
    return this.queue.shift()!;
  }

  peek(count: number): PieceType[] {
    this.ensure(count);
    return this.queue.slice(0, count);
  }

  private ensure(count: number): void {
    while (this.queue.length < count) this.queue.push(...this.shuffled());
  }

  private shuffled(): PieceType[] {
    const bag = [...PIECE_TYPES];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [bag[i], bag[j]] = [bag[j]!, bag[i]!];
    }
    return bag;
  }
}

/** Small deterministic PRNG (mulberry32), handy for tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
