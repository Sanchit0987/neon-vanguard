export interface Settings { muted: boolean; music: boolean; volume: number; reducedMotion: boolean; autoFire: boolean }
export interface ScoreEntry { id: string; score: number; kills: number; wave: number; time: number; date: string; highestCombo?: number; accuracy?: number; wavesCleared?: number }
export const DEFAULT_SETTINGS: Settings = { muted: false, music: true, volume: 0.45, reducedMotion: false, autoFire: false };
const SETTINGS_KEY = 'neon-vanguard.settings.v1';
const SCORES_KEY = 'neon-vanguard.scores.v1';
export function loadSettings(): Settings {
  try {
    const data = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (!data || typeof data !== 'object') return { ...DEFAULT_SETTINGS };
    return { muted: typeof data.muted === 'boolean' ? data.muted : false, music: typeof data.music === 'boolean' ? data.music : true, volume: typeof data.volume === 'number' && Number.isFinite(data.volume) ? Math.max(0, Math.min(1, data.volume)) : 0.45, reducedMotion: typeof data.reducedMotion === 'boolean' ? data.reducedMotion : window.matchMedia('(prefers-reduced-motion: reduce)').matches, autoFire: typeof data.autoFire === 'boolean' ? data.autoFire : false };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(settings: Settings) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true; } catch { return false; } }
export function loadScores(): ScoreEntry[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(SCORES_KEY) || '[]');
    if (!Array.isArray(data)) return [];
    return data.filter((e): e is ScoreEntry => e && typeof e.id === 'string' && typeof e.date === 'string' && ['score', 'kills', 'wave', 'time'].every(key => typeof e[key] === 'number' && Number.isFinite(e[key]) && e[key] >= 0)).sort((a, b) => b.score - a.score).slice(0, 10);
  } catch { return []; }
}
export function saveScore(entry: ScoreEntry) {
  const scores = [...loadScores().filter(s => s.id !== entry.id), entry].sort((a, b) => b.score - a.score || b.wave - a.wave).slice(0, 10);
  try { localStorage.setItem(SCORES_KEY, JSON.stringify(scores)); return { scores, persisted: true }; } catch { return { scores, persisted: false }; }
}
