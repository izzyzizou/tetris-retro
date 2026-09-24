export interface ScoreEntry {
  score: number;
  lines: number;
  level: number;
  date: string;
}

const KEY = 'tetris-retro:scores:v1';
const MAX_ENTRIES = 5;

/** localStorage can throw (private mode, blocked storage) — never let that break the game. */
export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ScoreEntry[]).slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

/** Inserts the entry and returns its rank (0-based), or -1 if it didn't place. */
export function saveScore(entry: ScoreEntry): { scores: ScoreEntry[]; rank: number } {
  const scores = loadScores();
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const top = scores.slice(0, MAX_ENTRIES);
  const rank = top.indexOf(entry);
  try {
    localStorage.setItem(KEY, JSON.stringify(top));
  } catch {
    // ignore
  }
  return { scores: top, rank };
}

export function loadSetting(key: string): string | null {
  try {
    return localStorage.getItem(`tetris-retro:${key}`);
  } catch {
    return null;
  }
}

export function saveSetting(key: string, value: string): void {
  try {
    localStorage.setItem(`tetris-retro:${key}`, value);
  } catch {
    // ignore
  }
}
