// Pure, deterministic simulation: React owns menus; this module owns gameplay.
// Units are logical Canvas pixels and seconds. Rendering never mutates simulation.
import { SHIPS, UPGRADES, ACHIEVEMENTS, bossPhase, bossName } from './catalog';
import type { ShipId, UpgradeId } from './catalog';
export type Phase = 'ready' | 'playing' | 'paused' | 'over' | 'upgrade' | 'victory';
export type PowerKind = 'rapid' | 'multi' | 'shield' | 'health' | 'energy' | 'credit' | 'upgrade';
export type EnemyKind = 'scout' | 'fighter' | 'weaver' | 'interceptor' | 'armored' | 'sniper' | 'kamikaze' | 'stealth' | 'miniboss' | 'boss';
export type SoundKind = 'shot' | 'hit' | 'explosion' | 'pickup' | 'hurt' | 'boss' | 'wave' | 'boost' | 'missile' | 'laser' | 'critical' | 'combo' | 'upgrade' | 'achievement' | 'victory' | 'shieldHit';
export interface Vec { x: number; y: number }
export interface Input { keys: Set<string>; aim: Vec | null; fire: boolean; touch: Vec; touchFire: boolean; boost?: boolean; missile?: boolean; charge?: boolean }
export interface Player extends Vec { r: number; hp: number; maxHp: number; lives: number; angle: number; invulnerable: number; cooldown: number; rapid: number; multi: number; shield: number; shieldHp: number; maxShield: number; shieldDelay: number; shieldHit: number; boostTime: number; boostCooldown: number; boostX: number; boostY: number; charge: number; laserCooldown: number; missileCooldown: number; damageFlash: number }
export interface Bullet extends Vec { id: number; px: number; py: number; vx: number; vy: number; r: number; damage: number; hostile: boolean; life: number; color: string; kind?: 'pulse' | 'missile'; critical?: boolean; turnTime?: number }
export interface Enemy extends Vec { id: number; kind: EnemyKind; r: number; hp: number; maxHp: number; age: number; cooldown: number; phase: number; originX: number; flash: number; volley: number; elite?: boolean; target?: boolean; aimAngle?: number; charge?: number; cloaked?: boolean; variant?: number; lastPhase?: number }
export interface Asteroid extends Vec { id: number; r: number; hp: number; vx: number; vy: number; angle: number; spin: number; seed: number }
export interface Pickup extends Vec { id: number; kind: PowerKind; age: number; r: number }
export interface Particle extends Vec { vx: number; vy: number; life: number; maxLife: number; size: number; color: string; ring?: boolean; debris?: boolean }
export interface Beam extends Vec { id: number; angle: number; length: number; width: number; life: number; hostile: boolean; warning: number; damage: number; hit: boolean }
export interface CombatText extends Vec { text: string; color: string; life: number }
export interface Objective { kind: 'survive' | 'target' | 'storm' | 'boss'; title: string; detail: string; duration: number; status: 'active' | 'complete' | 'missed'; bonus: number }
export interface GameEvent { kind: SoundKind }
export interface Snapshot { phase: Phase; hp: number; lives: number; score: number; kills: number; time: number; wave: number; remaining: number; combo: number; boss: { hp: number; maxHp: number; phase: number; name: string } | null; powers: { rapid: number; multi: number; shield: number }; banner: string; bannerTime: number;
  maxHp: number; shieldHp: number; maxShield: number; boost: number; boostSeconds: number; weaponLevel: number; missileLevel: number; missileCooldown: number; charge: number; laserCooldown: number; highestCombo: number; accuracy: number; credits: number; earnedCredits: number; energy: number; bosses: number; wavesCleared: number; waveProgress: number; objective: Objective; objectiveTime: number; notification: string; notificationTime: number; achievements: string[]; upgrades: Record<UpgradeId, number>; voucher: boolean; ship: ShipId }
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const emptyInput = (): Input => ({ keys: new Set(), aim: null, fire: false, touch: { x: 0, y: 0 }, touchFire: false });
export function circles(a: Vec & { r: number }, b: Vec & { r: number }) { return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= (a.r + b.r) ** 2; }
// Swept segment/circle collision prevents fast projectiles tunneling through ships.
export function segmentHits(ax: number, ay: number, bx: number, by: number, c: Vec, radius: number) {
  if (c.x < Math.min(ax, bx) - radius || c.x > Math.max(ax, bx) + radius || c.y < Math.min(ay, by) - radius || c.y > Math.max(ay, by) + radius) return false;
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((c.x - ax) * dx + (c.y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return (ax + dx * t - c.x) ** 2 + (ay + dy * t - c.y) ** 2 <= radius ** 2;
}
// Earliest contact along a swept projectile, independent of entity array order.
// Asteroids are real cover: compare their entry time with ships and the pilot.
export function segmentEntry(ax: number, ay: number, bx: number, by: number, c: Vec, radius: number): number | null {
  if (!segmentHits(ax, ay, bx, by, c, radius)) return null;
  const dx = bx - ax, dy = by - ay, ox = ax - c.x, oy = ay - c.y;
  const start = ox * ox + oy * oy - radius * radius;
  if (start <= 0) return 0;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return null;
  const projection = ox * dx + oy * dy;
  return clamp((-projection - Math.sqrt(Math.max(0, projection * projection - lengthSquared * start))) / lengthSquared, 0, 1);
}
export function formatTime(seconds: number) { return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`; }

export class GameEngine {
  width: number; height: number;
  phase: Phase = 'ready';
  player!: Player;
  enemies: Enemy[] = []; bullets: Bullet[] = []; asteroids: Asteroid[] = []; pickups: Pickup[] = []; particles: Particle[] = [];
  events: GameEvent[] = [];
  score = 0; kills = 0; time = 0; wave = 0; combo = 0; comboTime = 0;
  spawnRemaining = 0; spawnTimer = 0; intermission = 0; asteroidTimer = 8;
  banner = ''; bannerTime = 0; shake = 0; bossWave = false;
  ship: ShipId = 'vanguard';
  upgrades: Record<UpgradeId, number> = { damage: 0, firerate: 0, hull: 0, shield: 0, missile: 0, speed: 0 };
  beams: Beam[] = []; texts: CombatText[] = [];
  highestCombo = 0; shotsFired = 0; shotsHit = 0; credits = 0; earnedCredits = 0; energy = 0; weaponLevel = 1; bosses = 0; wavesCleared = 0;
  achievements: string[] = []; notification = ''; notificationTime = 0;
  waveTime = 0; waveTotal = 0; targetKilled = false; waveSettled = false; voucher = false;
  objective: Objective = { kind: 'survive', title: 'Survive the wave', detail: 'Clear incoming hostiles.', duration: 0, status: 'active', bonus: 100 };
  private boostHeld = false; private charging = false; private trailTimer = 0;
  private nextId = 1;
  constructor(width = 1120, height = 800, private rng: () => number = Math.random) {
    this.width = width; this.height = height; this.resetPlayer();
  }
  private resetPlayer() {
    const ship = SHIPS[this.ship];
    this.player = { x: this.width / 2, y: this.height * 0.82, r: 14, hp: ship.hp, maxHp: ship.hp, lives: 3, angle: -Math.PI / 2, invulnerable: 2, cooldown: 0, rapid: 0, multi: 0, shield: 0, shieldHp: ship.shield, maxShield: ship.shield, shieldDelay: 0, shieldHit: 0, boostTime: 0, boostCooldown: 0, boostX: 0, boostY: -1, charge: 0, laserCooldown: 0, missileCooldown: 0, damageFlash: 0 };
  }
  resize(width: number, height: number) {
    const sx = width / this.width, sy = height / this.height;
    for (const entity of [this.player, ...this.enemies, ...this.asteroids, ...this.pickups]) { entity.x *= sx; entity.y *= sy; }
    for (const enemy of this.enemies) enemy.originX *= sx;
    for (const bullet of this.bullets) { bullet.x *= sx; bullet.px *= sx; bullet.y *= sy; bullet.py *= sy; }
    for (const beam of this.beams) {
      beam.x *= sx; beam.y *= sy;
      const dx = Math.cos(beam.angle) * sx, dy = Math.sin(beam.angle) * sy;
      beam.angle = Math.atan2(dy, dx); beam.length *= Math.hypot(dx, dy);
    }
    for (const visual of [...this.particles, ...this.texts]) { visual.x *= sx; visual.y *= sy; }
    this.width = width; this.height = height;
  }
  start(ship: ShipId = this.ship) {
    this.ship = ship; this.upgrades = { damage: 0, firerate: 0, hull: 0, shield: 0, missile: 0, speed: 0 };
    this.beams = []; this.texts = []; this.highestCombo = 0; this.shotsFired = 0; this.shotsHit = 0; this.credits = 0; this.earnedCredits = 0; this.energy = 0; this.weaponLevel = 1; this.bosses = 0; this.wavesCleared = 0;
    this.achievements = []; this.notification = ''; this.notificationTime = 0; this.boostHeld = false; this.charging = false; this.trailTimer = 0; this.voucher = false;
    this.resetPlayer(); this.enemies = []; this.bullets = []; this.asteroids = []; this.pickups = []; this.particles = []; this.events = [];
    this.score = 0; this.kills = 0; this.time = 0; this.wave = 0; this.combo = 0; this.comboTime = 0; this.nextId = 1;
    this.asteroidTimer = 7; this.shake = 0; this.intermission = 0; this.phase = 'playing'; this.beginWave();
  }
  pause() { if (this.phase === 'playing') { this.phase = 'paused'; this.cancelActions(); } }
  resume() { if (this.phase === 'paused') this.phase = 'playing'; }
  cancelCharge() { this.player.charge = 0; this.charging = false; }
  cancelActions() { this.cancelCharge(); this.boostHeld = false; }
  private beginWave() {
    this.wave++; this.bossWave = this.wave % 5 === 0; this.intermission = 0; this.waveTime = 0; this.targetKilled = false; this.waveSettled = false;
    const kind = this.bossWave ? 'boss' : this.wave % 5 === 4 ? 'storm' : this.wave % 5 === 2 || this.wave % 5 === 3 ? 'target' : 'survive';
    this.objective = { kind, title: kind === 'boss' ? 'Break the flagship' : kind === 'storm' ? 'Ride the asteroid storm' : kind === 'target' ? 'Eliminate the marked commander' : 'Survive the wave', detail: kind === 'boss' ? 'Defeat the boss in 90s for a 1,000-point bonus.' : kind === 'storm' ? 'Survive 24 seconds and clear the escort ships.' : kind === 'target' ? 'Destroy the gold-marked elite before leaving the sector.' : 'Destroy hostiles and survive the incoming formation.', duration: kind === 'boss' ? 90 : kind === 'storm' ? 24 : 0, status: 'active', bonus: kind === 'boss' ? 1000 : kind === 'target' ? 350 : kind === 'storm' ? 400 : 100 };
    this.banner = this.bossWave ? `${bossName(this.wave)} INBOUND` : kind === 'storm' ? 'ASTEROID STORM' : `WAVE ${String(this.wave).padStart(2, '0')}`;
    this.bannerTime = 2.8; this.spawnTimer = 1.3;
    this.spawnRemaining = this.bossWave ? 1 : Math.min(6 + this.wave * 2, 36); this.waveTotal = this.spawnRemaining;
    this.asteroidTimer = kind === 'storm' ? 0.5 : 7;
    this.events.push({ kind: this.bossWave ? 'boss' : 'wave' });
  }
  private spawnEnemy() {
    const boss = this.bossWave && this.spawnRemaining === 1;
    const target = this.objective.kind === 'target' && this.spawnRemaining === this.waveTotal;
    const roster: EnemyKind[] = this.wave === 1 ? ['scout', 'interceptor', 'kamikaze'] : this.wave === 2 ? ['fighter', 'interceptor', 'armored', 'sniper', 'kamikaze'] : ['scout', 'fighter', 'weaver', 'interceptor', 'armored', 'sniper', 'kamikaze', 'stealth'];
    const kind: EnemyKind = boss ? 'boss' : target ? this.wave % 5 === 3 ? 'miniboss' : 'armored' : roster[Math.floor(this.rng() * roster.length)];
    const elite = target || (!boss && this.wave > 5 && this.rng() < 0.12);
    const x = boss ? this.width / 2 : 55 + this.rng() * (this.width - 110);
    const baseHp = { scout: 24, fighter: 44, weaver: 35, interceptor: 21, armored: 125, sniper: 48, kamikaze: 18, stealth: 38, miniboss: 230, boss: 650 }[kind];
    const hp = (boss ? 650 + this.wave * 85 : baseHp + this.wave * (kind === 'armored' ? 7 : 3)) * (elite ? 1.5 : 1);
    this.enemies.push({ id: this.nextId++, kind, x, y: boss ? -100 : -45, originX: x, r: boss ? 68 : kind === 'miniboss' ? 40 : kind === 'armored' ? 29 : kind === 'fighter' ? 23 : kind === 'kamikaze' ? 14 : 19, hp, maxHp: hp, age: 0, cooldown: boss ? 2 : 1.3 + this.rng() * 1.4, phase: this.rng() * Math.PI * 2, flash: 0, volley: 0, elite, target, variant: Math.floor(this.wave / 5 - 1) % 3, lastPhase: 1 });
    if (elite) this.notify(kind === 'miniboss' ? 'MINI-BOSS // WARDEN INBOUND' : 'ELITE COMMANDER DETECTED');
  }
  private bullet(x: number, y: number, angle: number, speed: number, hostile: boolean, color = '#ff747e', damage = 14, radius = 5, kind: 'pulse' | 'missile' = 'pulse') {
    if (this.bullets.length >= 550) return;
    const critical = !hostile && this.rng() < 0.12;
    if (!hostile) this.shotsFired++;
    this.bullets.push({ id: this.nextId++, x, y, px: x, py: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: hostile ? radius : kind === 'missile' ? 5 : 3, damage: critical ? damage * 2 : damage, hostile, life: 5, color: hostile ? color : critical ? '#ffe5a6' : kind === 'missile' ? '#93caff' : '#97ffe5', kind, critical, turnTime: kind === 'missile' ? hostile ? 1.5 : 5 : 0 });
  }
  private shoot() {
    const p = this.player;
    const angles = p.multi > 0 ? [-0.17, 0, 0.17] : [0];
    for (const offset of angles) this.bullet(p.x + Math.cos(p.angle) * 28, p.y + Math.sin(p.angle) * 28, p.angle + offset, 820, false, '', this.damage);
    p.cooldown = Math.max(0.045, (p.rapid > 0 ? 0.078 : 0.19) / (SHIPS[this.ship].fireRate * (1 + this.upgrades.firerate * 0.15))); this.events.push({ kind: 'shot' });
  }
  get damage() { return SHIPS[this.ship].damage * (1 + this.upgrades.damage * 0.2 + (this.weaponLevel - 1) * 0.1); }
  get boostDuration() { return SHIPS[this.ship].boostCooldown * Math.pow(0.88, this.upgrades.speed); }
  notify(text: string) { this.notification = text; this.notificationTime = 3.5; }
  private award(id: string) {
    if (this.achievements.includes(id)) return;
    this.achievements.push(id); this.notify(`ACHIEVEMENT // ${ACHIEVEMENTS[id].name.toUpperCase()}`); this.events.push({ kind: 'achievement' });
  }
  private floating(text: string, x: number, y: number, color = '#b0f5db') {
    if (this.texts.length >= 24) this.texts.shift();
    this.texts.push({ text, x, y, color, life: 1.1 });
  }
  fireOnce(aim: Vec | null = null) {
    if (this.phase !== 'playing' || this.player.cooldown > 0) return false;
    this.player.angle = aim ? Math.atan2(aim.y - this.player.y, aim.x - this.player.x) : -Math.PI / 2;
    this.shoot(); return true;
  }
  boostFromInput(input: Input) {
    const k = input.keys;
    const dx = Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft')) + input.touch.x;
    const dy = Number(k.has('KeyS') || k.has('ArrowDown')) - Number(k.has('KeyW') || k.has('ArrowUp')) + input.touch.y;
    return this.boost(dx || dy ? dx : Math.cos(this.player.angle), dx || dy ? dy : Math.sin(this.player.angle));
  }
  boost(dx = 0, dy = -1) {
    const p = this.player;
    if (this.phase !== 'playing' || p.boostCooldown > 0) return false;
    const length = Math.hypot(dx, dy) || 1;
    p.boostX = dx / length; p.boostY = dy / length; p.boostTime = 0.22; p.boostCooldown = this.boostDuration;
    p.invulnerable = Math.max(p.invulnerable, 0.36); this.events.push({ kind: 'boost' }); this.burst(p.x, p.y, '#b0f5db', 18); return true;
  }
  launchMissile() {
    const p = this.player;
    if (this.phase !== 'playing' || this.upgrades.missile === 0 || p.missileCooldown > 0) return false;
    const count = Math.min(3, this.upgrades.missile);
    for (let i = 0; i < count; i++) this.bullet(p.x, p.y - 20, p.angle + (i - (count - 1) / 2) * 0.2, 330, false, '', this.damage * (2.5 + this.upgrades.missile * 0.3), 5, 'missile');
    p.missileCooldown = 2.5; this.events.push({ kind: 'missile' }); return true;
  }
  private laser() {
    const p = this.player;
    if (p.charge < 0.25) { p.charge = 0; return; }
    this.shotsFired++;
    this.beams.push({ id: this.nextId++, x: p.x, y: p.y, angle: p.angle, length: Math.hypot(this.width, this.height), width: 7 + p.charge * 9, life: 0.22, hostile: false, warning: 0, damage: this.damage * (2 + p.charge * 4), hit: false });
    p.charge = 0; p.laserCooldown = 2.4; this.shake = 4; this.events.push({ kind: 'laser' });
  }
  private enemyBeam(enemy: Enemy, angle: number) {
    if (this.beams.length >= 24) return;
    this.beams.push({ id: this.nextId++, x: enemy.x, y: enemy.y + 20, angle, length: Math.hypot(this.width, this.height), width: 12, warning: 1.05, life: 0.24, hostile: true, damage: 26, hit: false });
  }
  buyUpgrade(id: UpgradeId) {
    if (this.phase !== 'upgrade') return false;
    const option = UPGRADES.find(u => u.id === id);
    if (!option || this.upgrades[id] >= 5 || (!this.voucher && this.credits < option.cost)) return false;
    if (this.voucher) this.voucher = false; else this.credits -= option.cost;
    this.upgrades[id]++;
    const p = this.player;
    if (id === 'hull') { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 50); }
    if (id === 'shield') { p.maxShield += 25; p.shieldHp = p.maxShield; }
    this.notify(`UPGRADE INSTALLED // ${option.name.toUpperCase()}`); this.events.push({ kind: 'upgrade' }); return true;
  }
  continueMission() {
    if (this.phase === 'victory') { this.phase = 'upgrade'; this.voucher = true; return true; }
    if (this.phase !== 'upgrade') return false;
    this.voucher = false; this.cancelActions(); this.phase = 'playing'; this.player.invulnerable = Math.max(2, this.player.invulnerable); this.beginWave(); return true;
  }
  private settleWave() {
    if (this.waveSettled) return;
    this.waveSettled = true; this.wavesCleared = this.wave;
    for (const pickup of this.pickups) this.collect(pickup.kind);
    this.pickups = []; this.bullets = []; this.beams = []; this.asteroids = []; this.cancelActions();
    const success = this.objective.kind === 'boss' ? this.waveTime <= 90 : this.objective.kind === 'target' ? this.targetKilled : true;
    this.objective.status = success ? 'complete' : 'missed';
    this.score += this.wave * 100 + (success ? this.objective.bonus : 0);
    if (success) { this.credits += 35; this.earnedCredits += 35; }
    if (this.objective.kind === 'storm') this.award('storm');
    if (this.wave >= 10) this.award('veteran');
    this.notify(success ? `OBJECTIVE COMPLETE // +${this.objective.bonus} PTS` : 'FLAGSHIP DEFEATED // TIME BONUS MISSED');
  }
  burst(x: number, y: number, color: string, count = 18, strength = 1) {
    for (let i = 0; i < count && this.particles.length < 500; i++) {
      const a = this.rng() * Math.PI * 2, s = (30 + this.rng() * 160) * strength, life = 0.3 + this.rng() * 0.6;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, maxLife: life, size: 1 + this.rng() * 4, color, debris: count > 10 && i % 4 === 0 });
    }
    if (count > 10 && this.particles.length < 500) this.particles.push({ x, y, vx: 0, vy: 0, life: 0.45, maxLife: 0.45, size: 35 * strength, color, ring: true });
  }
  damagePlayer(damage: number) {
    const p = this.player;
    if (this.phase !== 'playing' || p.invulnerable > 0) return;
    if (p.shield > 0) { this.burst(p.x, p.y, '#73bfff', 7); p.shieldHit = 0.4; p.invulnerable = 0.2; this.events.push({ kind: 'shieldHit' }); return; }
    p.shieldDelay = 4;
    if (p.shieldHp > 0) {
      const absorbed = Math.min(p.shieldHp, damage); p.shieldHp -= absorbed; damage -= absorbed; p.shieldHit = 0.4;
      this.burst(p.x, p.y, '#73bfff', 7); this.events.push({ kind: 'shieldHit' });
      if (damage === 0) { p.invulnerable = 0.25; return; }
    }
    p.hp = Math.max(0, p.hp - damage); p.invulnerable = 0.8; this.shake = 7; this.combo = 0;
    p.damageFlash = 0.35; this.burst(p.x, p.y, '#ff8975', 10); this.events.push({ kind: 'hurt' });
    if (p.hp > 0 && p.hp < p.maxHp * 0.3) this.notify('HULL CRITICAL // BOOST TO SAFETY');
    if (p.hp === 0) {
      this.burst(p.x, p.y, '#97ffe5', 42, 1.8); p.lives--; this.events.push({ kind: 'explosion' });
      if (p.lives <= 0) { this.phase = 'over'; this.cancelActions(); return; }
      p.hp = p.maxHp; p.shieldHp = p.maxShield; p.x = this.width / 2; p.y = this.height * 0.82; p.invulnerable = 3;
      this.beams = []; p.boostTime = 0; this.cancelActions();
      p.rapid = 0; p.multi = 0; this.bullets = this.bullets.filter(b => !b.hostile);
      this.banner = 'BACK IN THE FIGHT'; this.bannerTime = 2;
    }
  }
  collect(kind: PowerKind) {
    if (kind === 'energy') {
      this.energy += 12;
      if (this.energy >= 100) { this.energy -= 100; this.weaponLevel = Math.min(10, this.weaponLevel + 1); this.notify(`WEAPON CORE // LEVEL ${this.weaponLevel}`); this.events.push({ kind: 'upgrade' }); }
      this.player.shieldHp = Math.min(this.player.maxShield, this.player.shieldHp + 4); return;
    }
    if (kind === 'credit') { this.credits += 15; this.earnedCredits += 15; this.floating('+15 CR', this.player.x, this.player.y - 25, '#ffe19b'); if (this.earnedCredits >= 250) this.award('collector'); return; }
    if (kind === 'upgrade') { this.weaponLevel = Math.min(10, this.weaponLevel + 1); this.notify(`WEAPON CORE // LEVEL ${this.weaponLevel}`); this.events.push({ kind: 'upgrade' }); return; }
    if (kind === 'health') this.player.hp = Math.min(this.player.maxHp, this.player.hp + 40);
    else this.player[kind] = Math.min(24, this.player[kind] + (kind === 'shield' ? 8 : 12));
    this.notify(`${kind === 'multi' ? 'MULTI-SHOT' : kind === 'rapid' ? 'RAPID FIRE' : kind === 'shield' ? 'SHIELD OVERCHARGE' : 'HULL REPAIRED'} ONLINE`);
    this.score += 50; this.events.push({ kind: 'pickup' }); this.burst(this.player.x, this.player.y, '#a0ffe3', 16);
  }
  private killEnemy(enemy: Enemy) {
    this.kills++; this.combo++; this.comboTime = 3; this.highestCombo = Math.max(this.highestCombo, this.combo);
    const points = (enemy.kind === 'boss' ? 2000 : enemy.kind === 'miniboss' ? 750 : enemy.elite ? 400 : enemy.kind === 'scout' ? 100 : 175) * Math.min(4, 1 + Math.floor(this.combo / 5));
    this.score += points; this.floating(`+${points}`, enemy.x, enemy.y);
    if (enemy.target) this.targetKilled = true;
    if (this.kills === 1) this.award('firstBlood');
    if (this.combo === 10) this.award('ace');
    if (this.combo % 5 === 0) { this.score += this.combo * 10; this.notify(`${this.combo} KILL STREAK // +${this.combo * 10} BONUS`); this.events.push({ kind: 'combo' }); }
    if (this.pickups.length < 80) { this.pickups.push({ id: this.nextId++, x: enemy.x - 12, y: Math.max(60, enemy.y), kind: 'energy', age: 0, r: 10 }); this.pickups.push({ id: this.nextId++, x: enemy.x + 12, y: Math.max(60, enemy.y), kind: 'credit', age: 0, r: 10 }); }
    if (enemy.elite) this.pickups.push({ id: this.nextId++, x: enemy.x, y: enemy.y, kind: 'upgrade', age: 0, r: 17 });
    this.burst(enemy.x, enemy.y, enemy.kind === 'boss' ? '#ffb66e' : '#ff7d86', enemy.kind === 'boss' ? 90 : 23, enemy.kind === 'boss' ? 3 : 1);
    this.shake = enemy.kind === 'boss' ? 14 : 3; this.events.push({ kind: 'explosion' });
    // Guaranteed drops prevent unlucky runs from hiding the power-up system.
    if (this.kills % 4 === 0 || this.rng() < 0.16 || enemy.kind === 'boss') {
      const kinds: PowerKind[] = ['rapid', 'multi', 'shield', 'health'];
      const kind = this.player.hp < 45 ? 'health' : kinds[Math.floor(this.rng() * kinds.length)];
      this.pickups.push({ id: this.nextId++, x: enemy.x, y: Math.max(70, enemy.y), kind, age: 0, r: 17 });
    }
    if (enemy.kind === 'boss') {
      this.bosses++; this.award('hunter'); this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25); this.bullets = this.bullets.filter(b => !b.hostile); this.beams = [];
      this.events.push({ kind: 'victory' }); this.banner = 'FLAGSHIP DESTROYED'; this.bannerTime = 2.8;
      for (const side of [-1, 1]) this.burst(enemy.x + side * 50, enemy.y, '#b9edff', 35, 2.5);
    }
  }
  // Split long frames into <= 1/120s physics steps; cap suspended-tab catch-up.
  update(delta: number, input: Input) {
    if (this.phase !== 'playing' || !Number.isFinite(delta) || delta <= 0) return;
    let remaining = Math.min(delta, 0.1);
    while (remaining > 0.000001 && this.phase === 'playing') { const dt = Math.min(remaining, 1 / 120); this.step(dt, input); remaining -= dt; }
  }
  private step(dt: number, input: Input) {
    this.time += dt; if (!this.waveSettled) this.waveTime += dt;
    this.bannerTime = Math.max(0, this.bannerTime - dt); this.notificationTime = Math.max(0, this.notificationTime - dt); this.shake = Math.max(0, this.shake - dt * 22);
    this.comboTime -= dt; if (this.comboTime <= 0) this.combo = 0;
    const p = this.player;
    p.invulnerable = Math.max(0, p.invulnerable - dt); p.cooldown = Math.max(0, p.cooldown - dt);
    p.rapid = Math.max(0, p.rapid - dt); p.multi = Math.max(0, p.multi - dt); p.shield = Math.max(0, p.shield - dt);
    p.boostCooldown = Math.max(0, p.boostCooldown - dt); p.boostTime = Math.max(0, p.boostTime - dt); p.laserCooldown = Math.max(0, p.laserCooldown - dt); p.missileCooldown = Math.max(0, p.missileCooldown - dt);
    p.shieldDelay = Math.max(0, p.shieldDelay - dt); p.shieldHit = Math.max(0, p.shieldHit - dt); p.damageFlash = Math.max(0, p.damageFlash - dt);
    if (p.shieldDelay === 0) p.shieldHp = Math.min(p.maxShield, p.shieldHp + (4 + this.upgrades.shield * 2) * dt);
    const keys = input.keys;
    let dx = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + input.touch.x;
    let dy = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')) + input.touch.y;
    const magnitude = Math.hypot(dx, dy); if (magnitude > 1) { dx /= magnitude; dy /= magnitude; }
    const boosting = !!input.boost || keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (boosting && !this.boostHeld) this.boost(magnitude > 0 ? dx : Math.cos(p.angle), magnitude > 0 ? dy : Math.sin(p.angle));
    this.boostHeld = boosting;
    const moveSpeed = SHIPS[this.ship].speed * (1 + this.upgrades.speed * 0.1);
    p.x = clamp(p.x + (p.boostTime > 0 ? p.boostX * 1100 : dx * moveSpeed) * dt, 25, this.width - 25); p.y = clamp(p.y + (p.boostTime > 0 ? p.boostY * 1100 : dy * moveSpeed) * dt, 28, this.height - 28);
    p.angle = input.aim && !input.touchFire ? Math.atan2(input.aim.y - p.y, input.aim.x - p.x) : -Math.PI / 2;
    if ((input.fire || keys.has('Space') || input.touchFire) && p.cooldown <= 0) this.shoot();
    if (input.missile || keys.has('KeyQ')) this.launchMissile();
    const charge = !!input.charge || keys.has('KeyE');
    if (charge && p.laserCooldown <= 0) { p.charge = Math.min(1, p.charge + dt / 1.1); this.charging = true; }
    if (!charge && this.charging) { this.laser(); this.charging = false; }
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = 0.035;
      if (p.boostTime > 0 || p.hp < p.maxHp * 0.3) this.burst(p.x, p.y + 20, p.boostTime > 0 ? '#b0f5db' : '#d18e79', 2, 0.3);
      for (const missile of this.bullets) if (missile.kind === 'missile') this.burst(missile.x, missile.y, missile.hostile ? '#ff987a' : '#90caff', 1, 0.25);
    }

    if (this.spawnRemaining > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) { this.spawnEnemy(); this.spawnRemaining--; this.spawnTimer = Math.max(0.33, 1.25 - this.wave * 0.055); }
    } else if (this.enemies.length === 0 && (this.objective.kind !== 'storm' || this.waveTime >= this.objective.duration)) {
      if (!this.waveSettled) { this.settleWave(); this.intermission = 3.1; this.banner = 'SECTOR CLEAR'; this.bannerTime = 2.2; }
      this.intermission -= dt;
      if (this.intermission <= 0) {
        if (this.bossWave) { this.phase = 'victory'; this.cancelActions(); return; }
        if (this.wave % 2 === 0) { this.phase = 'upgrade'; this.voucher = true; this.cancelActions(); return; }
        this.beginWave();
      }
    }
    this.asteroidTimer -= dt;
    if (this.asteroidTimer <= 0 && !this.bossWave && !this.waveSettled && this.asteroids.length < 28) {
      const r = 19 + this.rng() * 24;
      this.asteroids.push({ id: this.nextId++, x: 40 + this.rng() * (this.width - 80), y: -60, r, hp: r * 2.2, vx: (this.rng() - 0.5) * 42, vy: 65 + this.wave * 3, angle: 0, spin: this.rng() - 0.5, seed: this.rng() * 10 });
      this.asteroidTimer = this.objective.kind === 'storm' && this.waveTime < 24 ? 0.4 : Math.max(2.6, 8 - this.wave * 0.3);
    }

    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.age += dt; enemy.flash = Math.max(0, enemy.flash - dt); enemy.cooldown -= dt;
      const boss = enemy.kind === 'boss', mini = enemy.kind === 'miniboss';
      enemy.cloaked = enemy.kind === 'stealth' && enemy.age % 4 < 2.2;
      if (boss && bossPhase(enemy.hp, enemy.maxHp) !== enemy.lastPhase) {
        enemy.lastPhase = bossPhase(enemy.hp, enemy.maxHp); this.burst(enemy.x, enemy.y, '#ffbc9e', 40, 1.8); this.shake = 9;
        this.notify(`FLAGSHIP PHASE ${enemy.lastPhase} // PATTERN SHIFT`); enemy.cooldown = 1.2;
      }
      if (boss) {
        enemy.y += (115 - enemy.y) * Math.min(dt * 1.2, 1);
        enemy.x = this.width / 2 + Math.sin(enemy.age * 0.55) * this.width * 0.27;
      } else if (mini || enemy.target || enemy.kind === 'sniper') {
        const holdY = mini ? 150 : enemy.kind === 'sniper' ? 110 : 185;
        if (enemy.kind === 'sniper' && enemy.age > 16 && !enemy.target) enemy.y += 155 * dt;
        else enemy.y += (holdY - enemy.y) * dt * 1.3;
        enemy.x = clamp(enemy.originX + Math.sin(enemy.age * 0.75) * 55, 40, this.width - 40);
      } else if (enemy.kind === 'kamikaze') {
        if (enemy.age < 1.1) { enemy.y += 90 * dt; enemy.aimAngle = Math.atan2(p.y - enemy.y, p.x - enemy.x); }
        else { const a = enemy.aimAngle ?? Math.PI / 2; enemy.x += Math.cos(a) * 285 * dt; enemy.y += Math.sin(a) * 285 * dt; }
      } else if (enemy.kind === 'interceptor') {
        enemy.y += (130 + Math.min(this.wave * 3, 80)) * dt;
        enemy.x = clamp(enemy.originX + Math.sin(enemy.age * 3.2) * 105, 25, this.width - 25);
      } else {
        const speed = enemy.kind === 'scout' ? 77 : enemy.kind === 'weaver' ? 63 : enemy.kind === 'armored' ? 32 : enemy.kind === 'stealth' ? enemy.cloaked ? 95 : 40 : 48;
        const sweep = enemy.kind === 'weaver' ? 85 : enemy.kind === 'armored' ? 12 : enemy.kind === 'stealth' ? 110 : 28;
        const frequency = enemy.kind === 'weaver' ? 2.4 : enemy.kind === 'stealth' ? 1.7 : 1.1;
        enemy.y += speed * (1 + this.wave * 0.035) * dt;
        enemy.x = clamp(enemy.originX + Math.sin(enemy.age * frequency + enemy.phase) * sweep, 28, this.width - 28);
      }
      if (enemy.y > 28 && enemy.cooldown <= 0) {
        const aim = Math.atan2(p.y - enemy.y, p.x - enemy.x), speed = Math.min(370, 155 + this.wave * 11);
        if (boss || mini) {
          const phase = bossPhase(enemy.hp, enemy.maxHp), enraged = phase >= 2;
          const pattern = (enemy.volley + (enemy.variant ?? 0)) % (phase === 3 ? 5 : 3);
          if (pattern === 0) {
            const count = mini ? 8 : enraged ? 18 : 12;
            for (let i = 0; i < count; i++) this.bullet(enemy.x, enemy.y + 25, Math.PI * 2 * i / count + enemy.age * 0.4, speed * 0.82, true, '#c397ff', 17, 6);
          } else if (pattern === 1) {
            for (let i = -2; i <= 2; i++) { this.bullet(enemy.x - 43, enemy.y + 25, aim + i * 0.15, speed * 1.1, true); this.bullet(enemy.x + 43, enemy.y + 25, aim + i * 0.15, speed * 1.1, true); }
          } else if (pattern === 2) {
            for (let i = -3; i <= 3; i++) this.bullet(enemy.x, enemy.y + 45, Math.PI / 2 + i * 0.22 + Math.sin(enemy.age) * 0.2, speed, true, '#ffb66e', 20, 7);
          } else if (pattern === 3) this.enemyBeam(enemy, aim);
          else for (const side of [-1, 1]) this.bullet(enemy.x + side * 38, enemy.y + 30, aim + side * 0.3, speed * 0.9, true, '#ffbe88', 22, 7, 'missile');
          enemy.volley++; enemy.cooldown = mini ? 1.7 : phase === 3 ? 0.85 : enraged ? 1 : 1.3;
        } else if (enemy.kind !== 'kamikaze' && !enemy.cloaked) {
          if (enemy.kind === 'sniper') this.enemyBeam(enemy, aim);
          else if (enemy.kind === 'armored') this.bullet(enemy.x, enemy.y + 20, aim, speed * 0.8, true, '#ffb585', 20, 6, 'missile');
          else {
            // Higher waves lead lateral movement, but never retarget shots in flight.
            const lead = this.wave > 5 ? Math.atan2(p.y + dy * 60 - enemy.y, p.x + dx * 60 - enemy.x) : aim;
            this.bullet(enemy.x, enemy.y + 16, lead, speed, true);
            if (enemy.kind === 'fighter' || enemy.elite) for (const offset of [-0.19, 0.19]) this.bullet(enemy.x, enemy.y + 16, lead + offset, speed, true);
          }
          enemy.cooldown = enemy.kind === 'sniper' ? 3.5 : Math.max(0.9, 2.5 - this.wave * 0.055) + this.rng() * 0.6;
        }
      }
      if (enemy.hp > 0 && circles(p, enemy)) { this.damagePlayer(boss ? 40 : 30); if (!boss && !mini && !enemy.target && p.boostTime <= 0) enemy.hp = 0; }
    }
    if (this.player.lives <= 0) return;
    for (const rock of this.asteroids) { rock.x += rock.vx * dt; rock.y += rock.vy * dt; rock.angle += rock.spin * dt; if (circles(p, rock)) this.damagePlayer(28); }

    for (const b of this.bullets) {
      if (b.life <= 0) continue;
      if (b.kind === 'missile' && (b.turnTime ?? 0) > 0) {
        b.turnTime = (b.turnTime ?? 0) - dt;
        const target = b.hostile ? p : this.enemies.filter(e => e.hp > 0 && e.y > 0 && !e.cloaked).reduce<Enemy | null>((best, e) => !best || Math.hypot(e.x - b.x, e.y - b.y) < Math.hypot(best.x - b.x, best.y - b.y) ? e : best, null);
        if (target) {
          const angle = Math.atan2(b.vy, b.vx), desired = Math.atan2(target.y - b.y, target.x - b.x), turn = Math.atan2(Math.sin(desired - angle), Math.cos(desired - angle));
          const a = angle + clamp(turn, -(b.hostile ? 1.1 : 3.5) * dt, (b.hostile ? 1.1 : 3.5) * dt), speed = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(a) * speed; b.vy = Math.sin(a) * speed;
        }
      }
      b.px = b.x; b.py = b.y; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let nearest = Infinity;
      let struck: { kind: 'rock'; body: Asteroid } | { kind: 'enemy'; body: Enemy } | { kind: 'player' } | null = null;
      for (const rock of this.asteroids) {
        if (rock.hp <= 0) continue;
        const t = segmentEntry(b.px, b.py, b.x, b.y, rock, rock.r + b.r);
        if (t !== null && t < nearest) { nearest = t; struck = { kind: 'rock', body: rock }; }
      }
      if (b.hostile) {
        const t = segmentEntry(b.px, b.py, b.x, b.y, p, p.r + b.r);
        if (t !== null && t < nearest) { nearest = t; struck = { kind: 'player' }; }
      } else {
        for (const enemy of this.enemies) {
          if (enemy.hp <= 0) continue;
          const t = segmentEntry(b.px, b.py, b.x, b.y, enemy, enemy.r + b.r);
          if (t !== null && t < nearest) { nearest = t; struck = { kind: 'enemy', body: enemy }; }
        }
      }
      if (struck) {
        b.x = b.px + (b.x - b.px) * nearest; b.y = b.py + (b.y - b.py) * nearest; b.life = 0;
        if (struck.kind === 'player') this.damagePlayer(b.damage);
        else if (struck.kind === 'rock') { struck.body.hp -= b.damage; this.burst(b.x, b.y, '#adacbd', 4); }
        else {
          const enemy = struck.body;
          enemy.hp -= b.damage * (enemy.kind === 'armored' && b.kind !== 'missile' ? 0.7 : 1); enemy.flash = 0.09; this.shotsHit++;
          if (b.critical) { this.floating('CRITICAL ×2', enemy.x, enemy.y - 30, '#ffe19b'); this.events.push({ kind: 'critical' }); }
          this.burst(b.x, b.y, b.kind === 'missile' ? '#93caff' : '#b3fff0', b.kind === 'missile' ? 16 : 3); this.events.push({ kind: 'hit' });
        }
      }
      if (p.lives <= 0) break;
    }
    if (this.player.lives <= 0) return;
    for (const beam of this.beams) {
      if (beam.life <= 0) continue;
      if (beam.warning > 0) { beam.warning = Math.max(0, beam.warning - dt); continue; }
      beam.life -= dt;
      if (beam.hit) continue;
      const endX = beam.x + Math.cos(beam.angle) * beam.length, endY = beam.y + Math.sin(beam.angle) * beam.length;
      if (beam.hostile) {
        // A visible active beam remains dangerous until its first contact, not
        // merely for the first physics tick after the warning disappears.
        if (segmentHits(beam.x, beam.y, endX, endY, p, p.r + beam.width / 2)) { this.damagePlayer(beam.damage); beam.hit = true; }
      } else {
        let hits = 0;
        for (const enemy of this.enemies) if (enemy.hp > 0 && segmentHits(beam.x, beam.y, endX, endY, enemy, enemy.r + beam.width / 2)) { enemy.hp -= beam.damage; enemy.flash = 0.15; hits++; this.burst(enemy.x, enemy.y, '#b0f5db', 8); }
        for (const rock of this.asteroids) if (segmentHits(beam.x, beam.y, endX, endY, rock, rock.r + beam.width / 2)) rock.hp -= beam.damage;
        if (hits > 0) this.shotsHit++;
        beam.hit = true;
      }
      if (p.lives <= 0) break;
    }
    this.beams = this.beams.filter(b => b.life > 0);
    if (this.player.lives <= 0) return;
    for (const enemy of this.enemies) if (enemy.hp <= 0) this.killEnemy(enemy);
    this.enemies = this.enemies.filter(e => e.hp > 0 && (e.target || (e.y < this.height + 70 && e.x > -80 && e.x < this.width + 80)));
    for (const rock of this.asteroids) if (rock.hp <= 0) { this.burst(rock.x, rock.y, '#a7acc9', 25); this.score += 25; }
    this.asteroids = this.asteroids.filter(a => a.hp > 0 && a.y < this.height + 65);
    this.bullets = this.bullets.filter(b => b.life > 0 && b.x > -80 && b.x < this.width + 80 && b.y > -100 && b.y < this.height + 100);
    for (const pickup of this.pickups) {
      pickup.age += dt; pickup.y += (pickup.kind === 'credit' || pickup.kind === 'energy' ? 85 : 60) * dt;
      // Modest pickup magnet: rewarding, but the pilot still has to approach.
      const distance = Math.hypot(p.x - pickup.x, p.y - pickup.y);
      if (distance < (pickup.kind === 'energy' || pickup.kind === 'credit' ? 180 : 115)) { pickup.x += (p.x - pickup.x) * dt * 4; pickup.y += (p.y - pickup.y) * dt * 4; }
      if (circles(p, pickup)) { this.collect(pickup.kind); pickup.age = 99; }
    }
    this.pickups = this.pickups.filter(pickup => pickup.age < 14 && pickup.y < this.height + 30);
    for (const particle of this.particles) { particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vx *= 1 - dt * 2; particle.vy *= 1 - dt * 2; particle.life -= dt; }
    this.particles = this.particles.filter(particle => particle.life > 0);
    for (const text of this.texts) { text.y -= 24 * dt; text.life -= dt; }
    this.texts = this.texts.filter(text => text.life > 0);
  }
  drainEvents() { const events = this.events; this.events = []; return events; }
  snapshot(): Snapshot {
    const boss = this.enemies.find(e => e.kind === 'boss');
    const p = this.player;
    return { phase: this.phase, hp: p.hp, lives: p.lives, score: this.score, kills: this.kills, time: this.time, wave: this.wave, remaining: this.spawnRemaining + this.enemies.length, combo: this.combo, boss: boss ? { hp: Math.max(0, boss.hp), maxHp: boss.maxHp, phase: bossPhase(boss.hp, boss.maxHp), name: bossName(this.wave) } : null, powers: { rapid: p.rapid, multi: p.multi, shield: p.shield }, banner: this.banner, bannerTime: this.bannerTime,
      maxHp: p.maxHp, shieldHp: p.shieldHp, maxShield: p.maxShield, boost: 1 - p.boostCooldown / this.boostDuration, boostSeconds: p.boostCooldown, weaponLevel: this.weaponLevel, missileLevel: this.upgrades.missile, missileCooldown: p.missileCooldown, charge: p.charge, laserCooldown: p.laserCooldown, highestCombo: this.highestCombo, accuracy: this.shotsFired ? Math.min(100, Math.round(this.shotsHit / this.shotsFired * 100)) : 0, credits: this.credits, earnedCredits: this.earnedCredits, energy: this.energy, bosses: this.bosses, wavesCleared: this.wavesCleared, waveProgress: this.waveSettled ? 1 : clamp(1 - (this.spawnRemaining + this.enemies.length) / (this.waveTotal || 1), 0, 1), objective: { ...this.objective }, objectiveTime: Math.max(0, this.objective.duration - this.waveTime), notification: this.notification, notificationTime: this.notificationTime, achievements: [...this.achievements], upgrades: { ...this.upgrades }, voucher: this.voucher, ship: this.ship };
  }
}
