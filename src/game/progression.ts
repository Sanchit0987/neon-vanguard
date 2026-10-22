import { ACHIEVEMENTS, SHIPS } from './catalog';
import type { ShipId } from './catalog';
import type { Snapshot } from './engine';

// A new versioned key: existing settings and high scores are left untouched.
const KEY = 'neon-vanguard.progress.v1';
export interface Progression {
  totalKills: number; totalCredits: number; bosses: number; bestWave: number; bestScore: number;
  unlocked: ShipId[]; selected: ShipId; achievements: string[];
  checkpoint: { run: string; kills: number; credits: number; bosses: number };
}
export function freshProgress(): Progression { return { totalKills: 0, totalCredits: 0, bosses: 0, bestWave: 0, bestScore: 0, unlocked: ['vanguard'], selected: 'vanguard', achievements: [], checkpoint: { run: '', kills: 0, credits: 0, bosses: 0 } }; }
const number = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
export function loadProgress(): Progression {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!data || typeof data !== 'object') return freshProgress();
    const p = freshProgress();
    p.totalKills = number(data.totalKills); p.totalCredits = number(data.totalCredits); p.bosses = number(data.bosses); p.bestWave = number(data.bestWave); p.bestScore = number(data.bestScore);
    if (p.totalKills >= 30) p.unlocked.push('wraith'); if (p.bosses >= 1) p.unlocked.push('bastion');
    p.selected = p.unlocked.includes(data.selected) ? data.selected : 'vanguard';
    p.achievements = Array.isArray(data.achievements) ? [...new Set<string>(data.achievements.filter((id: unknown) => typeof id === 'string' && Object.hasOwn(ACHIEVEMENTS, id)))] : [];
    if (data.checkpoint && typeof data.checkpoint.run === 'string') p.checkpoint = { run: data.checkpoint.run, kills: number(data.checkpoint.kills), credits: number(data.checkpoint.credits), bosses: number(data.checkpoint.bosses) };
    return p;
  } catch { return freshProgress(); }
}
export function saveProgress(p: Progression) { try { localStorage.setItem(KEY, JSON.stringify(p)); return true; } catch { return false; } }
// Cumulative checkpoint deltas make repeated React effects and wave-boundary saves idempotent.
export function advanceProgress(previous: Progression, run: string, stats: Snapshot) {
  const old = previous.checkpoint.run === run ? previous.checkpoint : { kills: 0, credits: 0, bosses: 0 };
  const next: Progression = { ...previous,
    totalKills: previous.totalKills + Math.max(0, stats.kills - old.kills),
    totalCredits: previous.totalCredits + Math.max(0, stats.earnedCredits - old.credits),
    bosses: previous.bosses + Math.max(0, stats.bosses - old.bosses),
    bestWave: Math.max(previous.bestWave, stats.wavesCleared), bestScore: Math.max(previous.bestScore, stats.score),
    achievements: [...new Set([...previous.achievements, ...stats.achievements])],
    unlocked: [...previous.unlocked], checkpoint: { run, kills: stats.kills, credits: stats.earnedCredits, bosses: stats.bosses },
  };
  if (next.totalKills >= 30 && !next.unlocked.includes('wraith')) next.unlocked.push('wraith');
  if (next.bosses >= 1 && !next.unlocked.includes('bastion')) next.unlocked.push('bastion');
  return next;
}
export function selectShip(progress: Progression, ship: ShipId): Progression {
  return Object.hasOwn(SHIPS, ship) && progress.unlocked.includes(ship) ? { ...progress, selected: ship } : progress;
}
