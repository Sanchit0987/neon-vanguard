import { describe, expect, it } from 'vitest';
import { GameEngine, emptyInput, segmentHits, circles, formatTime } from './engine';
import type { Bullet, Enemy, Input } from './engine';
const advance = (g: GameEngine, seconds: number, input: Input = emptyInput(), fps = 60) => { for (let i = 0; i < Math.round(seconds * fps); i++) g.update(1 / fps, input); };
function setup() { const game = new GameEngine(1120, 800, () => 0.5); game.start(); return game; }
function enemy(overrides: Partial<Enemy> = {}): Enemy { return { id: 900, kind: 'scout', x: 500, y: 350, r: 19, hp: 20, maxHp: 20, age: 0, cooldown: 10, phase: 0, originX: 500, flash: 0, volley: 0, ...overrides }; }
function bullet(overrides: Partial<Bullet> = {}): Bullet { return { id: 800, x: 500, y: 390, px: 500, py: 390, vx: 0, vy: -820, r: 3, damage: 23, hostile: false, life: 4, color: '#fff', ...overrides }; }

describe('flight controls and timing', () => {
  it('starts with a healthy ship, three lives and wave one', () => { const g = setup(); expect(g.snapshot()).toMatchObject({ hp: 100, lives: 3, wave: 1, kills: 0, score: 0, phase: 'playing' }); });
  it('moves at equal speed for 30/60/144 Hz and normalizes diagonal input', () => {
    const x = [];
    for (const fps of [30, 60, 144]) { const g = setup(), input = emptyInput(); input.keys.add('KeyD'); advance(g, 0.5, input, fps); x.push(g.player.x); }
    expect(x[0]).toBeCloseTo(x[1], 6); expect(x[1]).toBeCloseTo(x[2], 6);
    const g = setup(), origin = { x: g.player.x, y: g.player.y }, input = emptyInput(); input.keys.add('KeyD'); input.keys.add('KeyW'); advance(g, 0.5, input);
    expect(Math.hypot(g.player.x - origin.x, g.player.y - origin.y)).toBeCloseTo(172.5, 4);
  });
  it('clamps the ship to the arena and accepts touch input', () => { const g = setup(), input = emptyInput(); input.touch = { x: -1, y: 1 }; advance(g, 4, input); expect(g.player.x).toBe(25); expect(g.player.y).toBe(772); });
  it('freezes every gameplay timer and entity while paused, then resumes', () => {
    const g = setup(); advance(g, 2); g.collect('shield'); g.pause(); const state = JSON.stringify(g.snapshot()), x = g.enemies[0].x; advance(g, 10);
    expect(JSON.stringify(g.snapshot())).toBe(state); expect(g.enemies[0].x).toBe(x); g.resume(); advance(g, 1); expect(g.time).toBeCloseTo(3, 3);
  });
  it('resets all state after restart, including upgrades and particles', () => { const g = setup(); advance(g, 4); g.score = 234; g.collect('multi'); g.damagePlayer(80); g.start(); expect(g.snapshot()).toMatchObject({ score: 0, kills: 0, time: 0, hp: 100, lives: 3, wave: 1 }); expect(g.bullets).toHaveLength(0); expect(g.enemies).toHaveLength(0); expect(g.player.multi).toBe(0); expect(g.particles).toHaveLength(0); });
  it('caps long-frame catch-up and ignores invalid deltas', () => { const g = setup(); g.update(30, emptyInput()); expect(g.time).toBeCloseTo(0.1); g.update(NaN, emptyInput()); g.update(-1, emptyInput()); expect(g.time).toBeCloseTo(0.1); });
  it('resizes positions proportionally', () => { const g = setup(); g.resize(560, 400); expect(g.player.x).toBe(280); expect(g.player.y).toBeCloseTo(328); });
});

describe('weapons, collisions and survival', () => {
  it('fires with Space and aims toward the mouse', () => { const g = setup(), input = emptyInput(); input.keys.add('Space'); input.aim = { x: g.player.x + 200, y: g.player.y }; g.update(1 / 60, input); expect(g.bullets).toHaveLength(1); expect(g.bullets[0].vx).toBeGreaterThan(800); expect(g.bullets[0].vy).toBeCloseTo(0); });
  it('uses swept collision for fast projectiles', () => { expect(segmentHits(0, 0, 100, 0, { x: 50, y: 2 }, 3)).toBe(true); expect(segmentHits(0, 0, 100, 0, { x: 50, y: 9 }, 3)).toBe(false); expect(segmentHits(0, 0, 0, 0, { x: 0, y: 0 }, 1)).toBe(true); expect(circles({ x: 0, y: 0, r: 5 }, { x: 9, y: 0, r: 5 })).toBe(true); });
  it('kills one enemy, awards score and never counts the same kill twice', () => { const g = setup(); g.enemies.push(enemy()); g.bullets.push(bullet()); advance(g, 0.15); expect(g.kills).toBe(1); expect(g.score).toBe(100); advance(g, 0.1); expect(g.kills).toBe(1); expect(g.enemies).toHaveLength(0); });
  it('enemy shots damage unshielded hull with brief invulnerability', () => { const g = setup(); g.player.invulnerable = 0; g.player.shieldHp = 0; g.player.shieldDelay = 4; g.bullets.push(bullet({ x: g.player.x, y: g.player.y - 10, vy: 200, hostile: true, damage: 17 })); g.update(1 / 60, emptyInput()); expect(g.player.hp).toBe(83); g.damagePlayer(50); expect(g.player.hp).toBe(83); });
  it('respawns on life loss, then enters game over on the third loss', () => { const g = setup(); for (let i = 0; i < 3; i++) { g.player.invulnerable = 0; g.player.shieldHp = 0; g.damagePlayer(100); } expect(g.player.lives).toBe(0); expect(g.phase).toBe('over'); const time = g.time; advance(g, 3); expect(g.time).toBe(time); });
  it('shield blocks damage and health packs clamp at maximum health', () => { const g = setup(); g.player.invulnerable = 0; g.collect('shield'); g.damagePlayer(100); expect(g.player.hp).toBe(100); g.player.hp = 80; g.collect('health'); expect(g.player.hp).toBe(100); });
  it('rapid fire increases cadence and multi-shot creates three projectiles', () => { const normal = setup(), rapid = setup(), input = emptyInput(); input.fire = true; rapid.collect('rapid'); advance(normal, 0.4, input); advance(rapid, 0.4, input); expect(rapid.bullets.length).toBeGreaterThan(normal.bullets.length); const multi = setup(); multi.collect('multi'); multi.update(1 / 60, input); expect(multi.bullets).toHaveLength(3); });
  it('collects pickups on contact and expires timed power-ups', () => { const g = setup(); g.pickups.push({ id: 100, x: g.player.x, y: g.player.y, r: 17, age: 0, kind: 'multi' }); g.update(1 / 60, emptyInput()); expect(g.player.multi).toBeGreaterThan(11); expect(g.pickups).toHaveLength(0); advance(g, 13); expect(g.player.multi).toBe(0); });
  it('destroys asteroids and cleans up projectiles outside the world', () => { const g = setup(); g.asteroids.push({ id: 2, x: 500, y: 350, r: 25, hp: 20, vx: 0, vy: 0, angle: 0, spin: 0, seed: 1 }); g.bullets.push(bullet()); advance(g, 0.1); expect(g.asteroids).toHaveLength(0); expect(g.score).toBe(25); g.bullets.push(bullet({ x: -200 })); g.update(0.02, emptyInput()); expect(g.bullets).toHaveLength(0); });
});

describe('progression and bosses', () => {
  it('spawns enemies that move and fire back', () => { const g = setup(); advance(g, 4); expect(g.enemies.length).toBeGreaterThan(0); expect(g.enemies[0].y).toBeGreaterThan(0); expect(g.bullets.some(b => b.hostile)).toBe(true); });
  it('increments waves only after all spawns and enemies are resolved', () => { const g = setup(); g.spawnRemaining = 0; g.enemies = []; advance(g, 3.3); expect(g.wave).toBe(2); expect(g.spawnRemaining).toBe(10); });
  it('spawns a boss every fifth wave with three distinct opening attack patterns', () => {
    const g = setup(); g.wave = 4; g.phase = 'upgrade'; g.continueMission(); advance(g, 1.5); const boss = g.enemies.find(e => e.kind === 'boss'); expect(boss).toBeDefined(); expect(g.wave).toBe(5);
    boss!.y = 115; boss!.cooldown = 0; g.bullets = []; g.update(1 / 60, emptyInput()); expect(g.bullets).toHaveLength(12); expect(g.bullets.every(b => b.color === '#c397ff')).toBe(true);
    boss!.cooldown = 0; g.bullets = []; g.update(1 / 60, emptyInput()); expect(g.bullets).toHaveLength(10);
    boss!.cooldown = 0; g.bullets = []; g.update(1 / 60, emptyInput()); expect(g.bullets).toHaveLength(7); expect(g.bullets.every(b => b.color === '#ffb66e')).toBe(true);
    boss!.hp = boss!.maxHp * 0.4; expect(g.snapshot().boss?.phase).toBe(2);
  });
  it('boss death awards a bonus, clears hostile projectiles, repairs hull and drops salvage', () => { const g = setup(); g.player.hp = 60; g.enemies.push(enemy({ kind: 'boss', hp: 0 })); g.bullets.push(bullet({ hostile: true, x: 100 })); g.update(1 / 60, emptyInput()); expect(g.score).toBeGreaterThanOrEqual(2000); expect(g.player.hp).toBe(85); expect(g.bullets.some(b => b.hostile)).toBe(false); expect(g.pickups.length).toBe(3); expect(g.pickups.map(p => p.kind)).toContain('energy'); });
  it('bounds projectiles and particles during an extended session', () => { const g = setup(), input = emptyInput(); input.fire = true; for (let i = 0; i < 3600; i++) { if (g.phase === 'upgrade' || g.phase === 'victory') g.continueMission(); g.player.invulnerable = 10; g.update(1 / 60, input); g.drainEvents(); } expect(g.bullets.length).toBeLessThanOrEqual(550); expect(g.particles.length).toBeLessThanOrEqual(500); expect(g.time).toBeGreaterThan(59.8); });
  it('formats survival times', () => { expect(formatTime(9)).toBe('00:09'); expect(formatTime(125)).toBe('02:05'); });
});
