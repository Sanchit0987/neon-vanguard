import { describe, expect, it, vi, afterEach } from 'vitest';
import { GameEngine, emptyInput } from './engine';
import type { Enemy, Bullet, Input } from './engine';
import { SHIPS, UPGRADES, bossPhase, bossName } from './catalog';
import { advanceProgress, freshProgress, loadProgress, saveProgress, selectShip } from './progression';
const step = (g: GameEngine, seconds: number, input: Input = emptyInput()) => { for (let i = 0; i < Math.round(seconds * 120); i++) g.update(1 / 120, input); };
function game(wave = 1) { const g = new GameEngine(1120, 800, () => 0.5); g.start(); if (wave !== 1) { g.wave = wave - 1; g.phase = 'upgrade'; g.continueMission(); } return g; }
function enemy(kind: Enemy['kind'], more: Partial<Enemy> = {}): Enemy { return { id: 777, kind, x: 560, y: 250, originX: 560, r: 20, hp: 1000, maxHp: 1000, age: 0, cooldown: 0, phase: 0, flash: 0, volley: 0, ...more }; }
function shot(more: Partial<Bullet> = {}): Bullet { return { id: 999, x: 560, y: 300, px: 560, py: 300, vx: 0, vy: -820, r: 3, damage: 100, hostile: false, life: 5, color: '#fff', ...more }; }
afterEach(() => vi.unstubAllGlobals());

describe('integration invariants', () => {
  it('single-tap firing happens immediately and cannot duplicate during its cooldown', () => { const g=game();expect(g.fireOnce()).toBe(true);expect(g.fireOnce()).toBe(false);expect(g.bullets).toHaveLength(1);g.pause();expect(g.fireOnce()).toBe(false); });
  it('instant boost reads keyboard and touch movement directions', () => {const g=game(), input=emptyInput();input.touch={x:1,y:0};expect(g.boostFromInput(input)).toBe(true);expect(g.player.boostX).toBe(1);expect(g.player.boostY).toBe(0);});
  it('resizing preserves a telegraphed beam endpoint and origin', () => {const g=game();g.beams=[{id:2,x:100,y:100,angle:Math.PI/4,length:400,width:12,life:.2,warning:1,hostile:true,damage:20,hit:false}];const old=g.beams[0],x=old.x+Math.cos(old.angle)*old.length,y=old.y+Math.sin(old.angle)*old.length;g.resize(560,800);const b=g.beams[0];expect(b.x).toBe(50);expect(b.y).toBe(100);expect(b.x+Math.cos(b.angle)*b.length).toBeCloseTo(x*.5);expect(b.y+Math.sin(b.angle)*b.length).toBeCloseTo(y);});
  it('advances through fifteen waves with one boss per sector and no duplicate rewards', () => {
    const g=game();const bosses=new Set<number>();let docks=0;
    for(let i=0;i<40000&&g.wavesCleared<15;i++) {
      g.player.invulnerable=100;
      for(const e of g.enemies){if(e.kind==='boss')bosses.add(g.wave);e.hp=0;}
      if(g.phase==='upgrade'){docks++;g.buyUpgrade('damage');g.continueMission();}
      else if(g.phase==='victory')g.continueMission();
      g.update(1/60,emptyInput());g.drainEvents();
    }
    expect(g.wavesCleared).toBe(15);expect([...bosses]).toEqual([5,10,15]);expect(g.bosses).toBe(3);expect(docks).toBeGreaterThan(6);expect(g.achievements).toContain('veteran');expect(new Set(g.enemies.map(e=>e.id)).size).toBe(g.enemies.length);
  });
  it('late-wave firing keeps projectiles, beams, particles, and texts bounded', () => {
    const g=game(25),input=emptyInput();g.upgrades.missile=5;g.upgrades.firerate=5;input.fire=true;input.missile=true;
    for(let i=0;i<7200;i++){g.player.invulnerable=100;g.player.multi=1;g.player.rapid=1;for(const e of g.enemies)e.hp=e.maxHp*.2;g.update(1/120,input);g.drainEvents();}
    expect(g.bullets.length).toBeLessThanOrEqual(550);expect(g.particles.length).toBeLessThanOrEqual(500);expect(g.beams.length).toBeLessThanOrEqual(25);expect(g.texts.length).toBeLessThanOrEqual(24);expect(g.time).toBeCloseTo(60);
  });
});

describe('advanced weapons and defensive systems', () => {
  it('boost moves rapidly, grants invulnerability, and respects its cooldown', () => {
    const g = game(), x = g.player.x; g.player.invulnerable = 0;
    expect(g.boost(1, 0)).toBe(true); g.damagePlayer(999); expect(g.player.hp).toBe(100); step(g, 0.15); expect(g.player.x - x).toBeGreaterThan(150); expect(g.boost()).toBe(false);
    step(g, 4.1); expect(g.boost()).toBe(true);
  });
  it('held boost cannot retrigger until released', () => { const g = game(), input = emptyInput(); input.boost = true; step(g, 4.3, input); expect(g.player.boostCooldown).toBe(0); input.boost = false; step(g, 0.02, input); input.boost = true; step(g, 0.02, input); expect(g.player.boostCooldown).toBeGreaterThan(3); });
  it('shield absorbs damage before hull and recharges only after its delay', () => {
    const g = game(); g.player.invulnerable = 0; g.damagePlayer(20); expect(g.player.shieldHp).toBe(15); expect(g.player.hp).toBe(100);
    step(g, 0.5); g.player.invulnerable = 0; g.damagePlayer(30); expect(g.player.shieldHp).toBe(0); expect(g.player.hp).toBe(85);
    step(g, 1); expect(g.player.shieldHp).toBe(0); g.enemies = []; g.spawnTimer = 100; step(g, 3.5); expect(g.player.shieldHp).toBeGreaterThan(0);
  });
  it('charged beams pierce multiple enemies and count as one accurate shot', () => {
    const g = game(), input = emptyInput(); g.spawnTimer = 100;
    g.enemies = [enemy('armored', { y: 250, cooldown: 100, hp: 150 }), enemy('armored', { id: 778, y: 380, cooldown: 100, hp: 150 })];
    input.charge = true; step(g, 1.15, input); expect(g.player.charge).toBe(1); expect(g.beams).toHaveLength(0);
    input.charge = false; step(g, 0.02, input); expect(g.beams).toHaveLength(1); expect(g.beams[0].width).toBe(16); expect(g.shotsFired).toBe(1); expect(g.shotsHit).toBe(1); expect(g.enemies.every(e => e.hp < 150)).toBe(true);
  });
  it('too-short charge does not fire and pausing cancels a held charge', () => { const g = game(), input = emptyInput(); input.charge = true; step(g, 0.1, input); input.charge = false; step(g, 0.02, input); expect(g.beams).toHaveLength(0); input.charge = true; step(g, 0.8, input); g.pause(); expect(g.player.charge).toBe(0); g.resume(); input.charge = false; step(g, 0.02, input); expect(g.beams).toHaveLength(0); });
  it('missiles require a launcher, steer toward targets, and have a firing cooldown', () => {
    const g = game(); expect(g.launchMissile()).toBe(false); g.upgrades.missile = 1; g.enemies = [enemy('scout', { x: 800, originX: 800, cooldown: 100 })];
    expect(g.launchMissile()).toBe(true); const missile = g.bullets[0]; expect(missile.kind).toBe('missile'); const vx = missile.vx; step(g, 0.2); expect(missile.vx).toBeGreaterThan(vx + 10); expect(g.launchMissile()).toBe(false);
  });
  it('critical projectiles carry double damage and award visible hit feedback', () => {
    const g = new GameEngine(1120, 800, () => 0); g.start(); const input = emptyInput(); input.fire = true; g.enemies = [enemy('scout', { y: g.player.y - 80, cooldown: 100 })]; step(g, 0.07, input);
    expect(g.enemies[0].hp).toBe(954); expect(g.texts.some(t => t.text.includes('CRITICAL'))).toBe(true); expect(g.snapshot().accuracy).toBe(100);
  });
  it('armor resists pulse damage but not missile warheads', () => { const pulse = game(), missile = game(); for (const g of [pulse, missile]) g.enemies = [enemy('armored')]; pulse.bullets = [shot()]; missile.bullets = [shot({ kind: 'missile', turnTime: 0 })]; step(pulse, .08); step(missile, .08); expect(pulse.enemies[0].hp).toBe(930); expect(missile.enemies[0].hp).toBe(900); });
  it('tracks kill chains and bonus points without duplicating destroyed enemies', () => { const g = game(); g.spawnTimer = 100; for (let i = 0; i < 10; i++) { g.enemies.push(enemy('scout', { id: i, hp: 0, cooldown: 100 })); step(g,.01); } expect(g.kills).toBe(10); expect(g.highestCombo).toBe(10); expect(g.achievements).toContain('ace'); expect(g.score).toBeGreaterThan(1000); const kills = g.kills; step(g,.02); expect(g.kills).toBe(kills); step(g,3.2); expect(g.combo).toBe(0); });
});

describe('enemy behaviors, fair telegraphs, and missions', () => {
  it('fast interceptors descend more quickly than scouts', () => { const a = game(), b = game(); a.enemies = [enemy('interceptor')]; b.enemies = [enemy('scout')]; step(a,.4); step(b,.4); expect(a.enemies[0].y).toBeGreaterThan(b.enemies[0].y); });
  it('armored enemies fire missiles, fighters fire spreads', () => { const a = game(), b = game(); a.enemies = [enemy('armored')]; b.enemies = [enemy('fighter')]; step(a,.01); step(b,.01); expect(a.bullets[0].kind).toBe('missile'); expect(b.bullets).toHaveLength(3); });
  it('snipers telegraph a locked beam for one second before dealing damage', () => {
    const g = game(); g.player.invulnerable = 0; g.player.shieldHp = 0; g.player.shieldDelay = 10; g.enemies = [enemy('sniper')];
    step(g,.4); expect(g.beams[0].warning).toBeGreaterThan(.5); expect(g.player.hp).toBe(100);
    step(g,.8); expect(g.player.hp).toBe(74); expect(g.beams[0].hit).toBe(true);
  });
  it('snipers eventually exit so ordinary waves cannot deadlock', () => { const g = game(); g.enemies = [enemy('sniper', { age: 16.1, cooldown: 100 })]; g.spawnTimer = 100; g.player.invulnerable = 100; step(g,5); expect(g.enemies).toHaveLength(0); });
  it('kamikaze drones lock a trajectory instead of tracking forever', () => { const g = game(); g.enemies = [enemy('kamikaze')]; step(g,1.15); const e = g.enemies[0], angle = e.aimAngle; g.player.x = 50; step(g,.25); expect(e.aimAngle).toBe(angle); expect(g.bullets).toHaveLength(0); });
  it('stealth enemies remain faintly visible and cannot fire while cloaked', () => { const g = game(); g.spawnTimer = 100; g.enemies = [enemy('stealth')]; step(g,.3); expect(g.enemies[0].cloaked).toBe(true); expect(g.bullets).toHaveLength(0); step(g,2); expect(g.enemies[0].cloaked).toBe(false); expect(g.bullets.length).toBeGreaterThan(0); });
  it('wave two spawns a marked elite and wave three a marked mini-boss', () => { const a = game(2), b = game(3); step(a,1.4); step(b,1.4); expect(a.enemies[0]).toMatchObject({ kind: 'armored', target: true, elite: true }); expect(b.enemies[0]).toMatchObject({ kind: 'miniboss', target: true }); });
  it('asteroid storm lasts 24 seconds even with all escorts resolved', () => { const g = game(4); g.spawnRemaining = 0; g.player.invulnerable = 100; step(g,10); expect(g.objective.kind).toBe('storm'); expect(g.asteroids.length).toBeGreaterThan(5); expect(g.waveSettled).toBe(false); step(g,17.3); expect(g.phase).toBe('upgrade'); expect(g.objective.status).toBe('complete'); expect(g.achievements).toContain('storm'); expect(g.asteroids).toHaveLength(0); });
  it('bosses on waves 5, 10 and 15 have distinct variants and correct objectives', () => { const names = new Set(); for (const wave of [5,10,15]) { const g = game(wave); step(g,1.4); expect(g.enemies).toHaveLength(1); expect(g.enemies[0].kind).toBe('boss'); expect(g.objective.kind).toBe('boss'); names.add(bossName(wave)); } expect(names.size).toBe(3); });
  it('boss health drives all three phases, including beams and seekers', () => { expect(bossPhase(100,100)).toBe(1); expect(bossPhase(50,100)).toBe(2); expect(bossPhase(20,100)).toBe(3); const g = game(5); step(g,1.4); const b = g.enemies[0]; b.hp = b.maxHp*.2; b.y=115; b.lastPhase=3; b.volley=3; b.cooldown=0; step(g,.01); expect(g.beams.some(beam=>beam.hostile)).toBe(true); b.cooldown=0; step(g,.01); expect(g.bullets.some(shot=>shot.kind==='missile' && shot.hostile)).toBe(true); });
  it('victory freezes simulation, then refits and continues once without duplicate enemies', () => {
    const g = game(5); step(g,1.4); g.enemies[0].hp=0; step(g,3.3); expect(g.phase).toBe('victory'); expect(g.objective.status).toBe('complete'); expect(g.wavesCleared).toBe(5);
    const snapshot=JSON.stringify(g.snapshot()); step(g,30); expect(JSON.stringify(g.snapshot())).toBe(snapshot);
    expect(g.continueMission()).toBe(true); expect(g.phase).toBe('upgrade'); expect(g.continueMission()).toBe(true); expect(g.wave).toBe(6); expect(g.continueMission()).toBe(false); expect(g.wave).toBe(6); expect(g.enemies).toHaveLength(0);
  });
  it('missing a boss time bonus still permits mission completion', () => { const g=game(5); step(g,1.4); g.waveTime=91;g.enemies[0].hp=0; step(g,3.3); expect(g.phase).toBe('victory'); expect(g.objective.status).toBe('missed'); });
});

describe('meaningful upgrades and persistent ship progression', () => {
  it('energy, credits, and upgrade drops all have real effects', () => { const g=game(); for(let i=0;i<9;i++)g.collect('energy'); expect(g.weaponLevel).toBe(2);expect(g.energy).toBe(8);g.collect('credit');expect(g.credits).toBe(15);expect(g.earnedCredits).toBe(15);g.collect('upgrade');expect(g.weaponLevel).toBe(3); });
  it('a refit grants one free choice, then enforces prices, maximums, and phase', () => {
    const g=game();expect(g.buyUpgrade('damage')).toBe(false);g.phase='upgrade';g.voucher=true;
    expect(g.buyUpgrade('damage')).toBe(true);expect(g.credits).toBe(0);expect(g.voucher).toBe(false);expect(g.buyUpgrade('missile')).toBe(false);
    g.credits=1000;for(let i=0;i<4;i++)expect(g.buyUpgrade('damage')).toBe(true);expect(g.buyUpgrade('damage')).toBe(false);expect(g.upgrades.damage).toBe(5);expect(g.credits).toBe(720);
  });
  it('all six upgrade choices modify their corresponding systems', () => {
    const g=game();g.phase='upgrade';g.credits=1000;const damage=g.damage, boost=g.boostDuration;
    for(const u of UPGRADES) expect(g.buyUpgrade(u.id)).toBe(true);
    expect(g.damage).toBeGreaterThan(damage);expect(g.upgrades.firerate).toBe(1);expect(g.player.maxHp).toBe(125);expect(g.player.maxShield).toBe(60);expect(g.upgrades.missile).toBe(1);expect(g.boostDuration).toBeLessThan(boost);
  });
  it('ship frames have different hull, shields, speed and damage; restart resets run upgrades', () => {
    const g=game(); for(const ship of ['vanguard','wraith','bastion'] as const){g.start(ship);expect(g.player.hp).toBe(SHIPS[ship].hp);expect(g.player.maxShield).toBe(SHIPS[ship].shield);expect(g.damage).toBe(SHIPS[ship].damage);}
    g.upgrades.damage=3;g.start();expect(g.ship).toBe('bastion');expect(g.upgrades.damage).toBe(0);
  });
  it('unlocks Wraith after 30 kills and Bastion after a boss, idempotently', () => {
    const g=game();g.kills=30;g.bosses=1;g.earnedCredits=200;g.wavesCleared=5;g.achievements=['hunter'];const first=advanceProgress(freshProgress(),'run-a',g.snapshot());const again=advanceProgress(first,'run-a',g.snapshot());
    expect(again).toEqual(first);expect(first.unlocked).toEqual(['vanguard','wraith','bastion']);expect(first.totalKills).toBe(30);expect(first.totalCredits).toBe(200);expect(first.achievements).toContain('hunter');
    g.kills=32;expect(advanceProgress(first,'run-a',g.snapshot()).totalKills).toBe(32);
  });
  it('cannot select a locked ship and selection persists after reload', () => {
    const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)});
    const p=freshProgress();expect(selectShip(p,'bastion').selected).toBe('vanguard');p.totalKills=30;p.unlocked.push('wraith');const selected=selectShip(p,'wraith');expect(saveProgress(selected)).toBe(true);expect(loadProgress().selected).toBe('wraith');
  });
  it('recovers from corrupt/blocked progression storage without touching legacy keys', () => { vi.stubGlobal('localStorage',{getItem:()=>'{bad',setItem:()=>{throw new Error('blocked');}});expect(loadProgress()).toEqual(freshProgress());expect(saveProgress(freshProgress())).toBe(false); });
  it('rejects forged field types and deduplicates saved achievements', () => {vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({totalKills:'lots',bosses:-3,selected:'bastion',unlocked:['bastion'],achievements:['hunter','hunter','invalid']})});expect(loadProgress()).toMatchObject({totalKills:0,bosses:0,selected:'vanguard',unlocked:['vanguard'],achievements:['hunter']});});
});
