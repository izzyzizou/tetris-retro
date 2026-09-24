export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

/** 0 = spawn, 1 = R (clockwise), 2 = 180, 3 = L (counter-clockwise). */
export type Rotation = 0 | 1 | 2 | 3;

export type Matrix = readonly (readonly number[])[];

export const PIECE_TYPES: readonly PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

/** Spawn-state shapes in their SRS bounding boxes. */
const BASE_SHAPES: Record<PieceType, Matrix> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

function rotateCW(m: Matrix): Matrix {
  const n = m.length;
  return m.map((_, r) => m.map((_, c) => m[n - 1 - c]![r]!));
}

function buildRotations(base: Matrix): readonly Matrix[] {
  const states: Matrix[] = [base];
  for (let i = 1; i < 4; i++) states.push(rotateCW(states[i - 1]!));
  return states;
}

export const SHAPES: Record<PieceType, readonly Matrix[]> = Object.fromEntries(
  PIECE_TYPES.map((t) => [t, buildRotations(BASE_SHAPES[t])]),
) as Record<PieceType, readonly Matrix[]>;

export function shapeOf(type: PieceType, rotation: Rotation): Matrix {
  return SHAPES[type][rotation]!;
}

/** Cells as [x, y] offsets inside the bounding box. */
export function cellsOf(type: PieceType, rotation: Rotation): readonly [number, number][] {
  const out: [number, number][] = [];
  shapeOf(type, rotation).forEach((row, y) =>
    row.forEach((v, x) => {
      if (v) out.push([x, y]);
    }),
  );
  return out;
}

type Kick = readonly [number, number];

// SRS wall-kick data. Offsets are (x, y) with y pointing UP, as in the guideline tables.
const JLSTZ_KICKS: Record<string, readonly Kick[]> = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

const I_KICKS: Record<string, readonly Kick[]> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

const NO_KICKS: readonly Kick[] = [[0, 0]];

/** Kick candidates converted to screen space (y pointing DOWN). */
export function kicksFor(type: PieceType, from: Rotation, to: Rotation): readonly Kick[] {
  if (type === 'O') return NO_KICKS;
  const table = type === 'I' ? I_KICKS : JLSTZ_KICKS;
  return (table[`${from}>${to}`] ?? NO_KICKS).map(([x, y]) => [x, -y] as const);
}

/** Classic neon palette, one colour per tetromino. */
export const PIECE_COLORS: Record<PieceType, string> = {
  I: '#2de2ff',
  O: '#ffd23f',
  T: '#b76bff',
  S: '#3ee07f',
  Z: '#ff4d6d',
  J: '#4a7dff',
  L: '#ff9f1c',
};
