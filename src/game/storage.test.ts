import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, loadScores, loadSettings, saveScore, saveSettings } from './storage';
import type { ScoreEntry } from './storage';
const store = new Map<string, string>();
const entry = (score: number, id = String(score)): ScoreEntry => ({ id, score, wave: 2, kills: 7, time: 52.3, date: '2026-10-21T00:00:00.000Z' });
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
});
afterEach(() => vi.unstubAllGlobals());
describe('local persistence', () => {
  it('loads safe defaults when no preferences exist', () => expect(loadSettings()).toEqual(DEFAULT_SETTINGS));
  it('round-trips all settings', () => { const settings = { muted: true, music: false, volume: 0.7, reducedMotion: true, autoFire: true }; expect(saveSettings(settings)).toBe(true); expect(loadSettings()).toEqual(settings); });
  it('ignores corrupt JSON and validates stored field types', () => { store.set('neon-vanguard.settings.v1', '{corrupt'); expect(loadSettings()).toEqual(DEFAULT_SETTINGS); store.set('neon-vanguard.settings.v1', JSON.stringify({ muted: 'no', volume: 99 })); expect(loadSettings().muted).toBe(false); expect(loadSettings().volume).toBe(1); });
  it('honors system reduced-motion preference by default', () => { vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) }); expect(loadSettings().reducedMotion).toBe(true); });
  it('keeps the highest ten scores in descending order', () => { for (let i = 0; i < 15; i++) saveScore(entry(i * 100)); expect(loadScores()).toHaveLength(10); expect(loadScores()[0].score).toBe(1400); expect(loadScores()[9].score).toBe(500); });
  it('does not duplicate an id saved twice', () => { saveScore(entry(100)); saveScore(entry(100)); expect(loadScores()).toHaveLength(1); });
  it('filters malformed score entries rather than crashing', () => { store.set('neon-vanguard.scores.v1', JSON.stringify([null, {}, 'wrong', entry(-1), entry(100)])); expect(loadScores()).toEqual([entry(100)]); store.set('neon-vanguard.scores.v1', '{broken'); expect(loadScores()).toEqual([]); });
  it('continues gracefully when browser storage is blocked', () => { vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } }); expect(loadSettings()).toEqual(DEFAULT_SETTINGS); expect(loadScores()).toEqual([]); expect(saveSettings(DEFAULT_SETTINGS)).toBe(false); expect(saveScore(entry(100)).persisted).toBe(false); });
});
