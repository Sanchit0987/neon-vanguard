// Regression cases found during the post-expansion polish pass.
import { describe, expect, it } from 'vitest';
import { GameEngine, emptyInput } from './engine';
import type { Asteroid, Bullet, Enemy } from './engine';
const tick = (g: GameEngine) => g.update(1 / 120, emptyInput());
function game() { const g = new GameEngine(1120, 800, () => 0.5); g.start(); g.spawnTimer = 100; g.player.invulnerable = 0; g.player.shieldHp = 0; g.player.shieldDelay = 10; return g; }
const enemy = (id: number, y: number): Enemy => ({ id, x: 560, y, originX: 560, kind: 'scout', hp: 100, maxHp: 100, r: 12, age: 0, cooldown: 100, phase: 0, flash: 0, volley: 0 });
const rock = (y: number): Asteroid => ({ id: 99, x: 560, y, r: 12, hp: 100, vx: 0, vy: 0, angle: 0, spin: 0, seed: 1 });
const bullet = (hostile = false): Bullet => ({ id: 50, x: 560, y: 400, px: 560, py: 400, vx: 0, vy: hostile ? 12000 : -12000, r: 3, damage: 20, hostile, life: 2, color: '#fff' });

describe('collision ordering and active hazards', () => {
  it('a pulse hits the nearest ship, not the first ship in the array', () => {
    const g = game(), far = enemy(1, 320), near = enemy(2, 380); g.enemies = [far, near]; g.bullets = [bullet()]; tick(g);
    expect(near.hp).toBe(80); expect(far.hp).toBe(100); expect(g.shotsHit).toBe(1);
  });
  it('an asteroid blocks a player shot before a ship behind it', () => {
    const g = game(), target = enemy(1, 320), cover = rock(380); g.enemies = [target]; g.asteroids = [cover]; g.bullets = [bullet()]; tick(g);
    expect(cover.hp).toBe(80); expect(target.hp).toBe(100); expect(g.shotsHit).toBe(0);
  });
  it('an asteroid protects the player from an incoming shot behind it', () => {
    const g = game(), cover = rock(435); g.player.y = 480; g.asteroids = [cover]; g.bullets = [bullet(true)]; tick(g);
    expect(cover.hp).toBe(80); expect(g.player.hp).toBe(100);
  });
  it('a beam still damages a player who enters it after its activation frame', () => {
    const g = game(); g.player.x = 610;
    g.beams = [{ id: 1, x: 560, y: 100, angle: Math.PI / 2, length: 800, width: 12, warning: 0, life: .24, hostile: true, damage: 26, hit: false }];
    tick(g); expect(g.player.hp).toBe(100); g.player.x = 560; tick(g); expect(g.player.hp).toBe(74);
    g.player.invulnerable = 0; tick(g); expect(g.player.hp).toBe(74); // One hit per beam.
  });
  it('an expired beam cannot deal a late invisible hit', () => {
    const g = game(); g.beams = [{ id: 1, x: 560, y: 100, angle: Math.PI / 2, length: 800, width: 12, warning: 0, life: 0, hostile: true, damage: 26, hit: false }]; tick(g);
    expect(g.player.hp).toBe(100); expect(g.beams).toHaveLength(0);
  });
  it('a destroyed enemy cannot fire one last volley during cleanup', () => {
    const g = game(), e = enemy(1, 300); e.hp = 0; e.cooldown = 0; g.enemies = [e]; tick(g);
    expect(g.bullets.filter(b => b.hostile)).toHaveLength(0); expect(g.kills).toBe(1);
  });
});
