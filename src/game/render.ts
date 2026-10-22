import { GameEngine, clamp } from './engine';
import type { Enemy, PowerKind } from './engine';
import { SHIPS, bossPhase } from './catalog';
import type { ShipId } from './catalog';

type Star = { x: number; y: number; size: number; speed: number; brightness: number };
export const powerColors: Record<PowerKind, string> = { rapid: '#ffe19b', multi: '#c4a0ff', shield: '#82c6ff', health: '#92ffd1', energy: '#80e7ee', credit: '#e7cc8a', upgrade: '#ffb7f2' };
export const powerGlyphs: Record<PowerKind, string> = { rapid: 'ϟ', multi: '⋔', shield: '◇', health: '+', energy: '·', credit: '¢', upgrade: '✧' };
function path(ctx: CanvasRenderingContext2D, points: number[][], fill: string | CanvasGradient, stroke?: string) {
  ctx.beginPath(); points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
export function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, angle: number, time: number, ghost = false, ship: ShipId = 'vanguard') {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle + Math.PI / 2); ctx.scale(scale, scale); ctx.globalAlpha = ghost ? 0.45 : 1;
  // Flame gradients and independent twin nacelles are original procedural artwork.
  if (ship === 'wraith') ctx.scale(0.76, 1.18);
  if (ship === 'bastion') {
    path(ctx, [[-38,-17],[-23,-24],[-17,28],[-35,32]], '#29384a', '#d6ba8e');
    path(ctx, [[38,-17],[23,-24],[17,28],[35,32]], '#29384a', '#d6ba8e');
    for (const s of [-1, 1]) { ctx.fillStyle = '#ebca89'; ctx.fillRect(s * 30 - 2, -18, 4, 27); }
  }
  for (const side of [-1, 1]) {
    const flicker = 1 + Math.sin(time * 31 + side) * 0.15;
    const flame = ctx.createLinearGradient(0, 17, 0, 68); flame.addColorStop(0, '#d8fff1'); flame.addColorStop(0.22, '#68ffd8'); flame.addColorStop(1, '#37c4ae00');
    path(ctx, [[side * 14 - 4, 19], [side * 14, 60 * flicker], [side * 14 + 4, 19]], flame);
    ctx.shadowColor = '#7dffe1'; ctx.shadowBlur = 14;
    ctx.fillStyle = '#c2ffeb'; ctx.fillRect(side * 14 - 3, 17, 6, 5); ctx.shadowBlur = 0;
  }
  ctx.lineWidth = 0.6;
  path(ctx, [[0, -37], [-9, -13], [-29, 18], [-31, 29], [-11, 20], [0, 29], [11, 20], [31, 29], [29, 18], [9, -13]], '#121e2b', '#7790a0');
  path(ctx, [[-9, -9], [-28, 23], [-14, 17], [-6, 4]], '#4d6675', '#93acba');
  path(ctx, [[9, -9], [28, 23], [14, 17], [6, 4]], '#344f60', '#87a6b4');
  path(ctx, [[0, -37], [-8, -10], [-7, 21], [0, 27], [7, 21], [8, -10]], '#7493a2', '#c2d7db');
  path(ctx, [[0, -34], [-2, -9], [0, 18], [5, 20], [5, -8]], '#a0b6bb');
  path(ctx, [[0, -19], [-4, -6], [-3, 6], [3, 6], [4, -6]], '#082e35', '#a1ffe4');
  ctx.shadowBlur = 9; ctx.shadowColor = '#7affe0';
  path(ctx, [[0, -17], [-2.5, -5], [-2, 2], [2, 2], [2.5, -5]], '#89f7d6'); ctx.shadowBlur = 0;
  for (const side of [-1, 1]) {
    path(ctx, [[side * 12, 4], [side * 17, 0], [side * 18, 21], [side * 11, 21]], '#263e4f', '#657c89');
    ctx.fillStyle = '#9affe0'; ctx.fillRect(side * 23 - 1, 15, 2, 8);
    ctx.strokeStyle = '#b7c4c5'; ctx.beginPath(); ctx.moveTo(side * 22, 6); ctx.lineTo(side * 22, -3); ctx.stroke();
  }
  ctx.restore();
}
function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, time: number) {
  ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.kind === 'kamikaze' ? (e.aimAngle ?? Math.PI / 2) + Math.PI / 2 : Math.PI);
  const boss = e.kind === 'boss', phase = bossPhase(e.hp, e.maxHp);
  const palette = { scout: '#db8397', fighter: '#f9917f', weaver: '#b493ed', interceptor: '#ffdda1', armored: '#e5b180', sniper: '#f99bcc', kamikaze: '#ff8b74', stealth: '#82a3eb', miniboss: '#dab183', boss: phase === 3 ? '#ff8b64' : phase === 2 ? '#c7a2ff' : '#e6a0ad' };
  const color = e.flash > 0 ? '#ffffff' : palette[e.kind];
  ctx.globalAlpha = e.cloaked ? 0.24 : 1;
  ctx.scale(boss ? 2.5 : e.kind === 'miniboss' ? 1.5 : 0.85, boss ? 2.5 : e.kind === 'miniboss' ? 1.5 : 0.85); ctx.lineWidth = 1;
  if (boss || e.kind === 'miniboss') {
    const spread = phase === 3 ? 15 : phase === 2 ? 8 : 0;
    const variant = e.variant ?? 0;
    for (const side of [-1, 1]) {
      path(ctx, [[side*(25+spread),-20],[side*(40+spread+variant*4),-8],[side*(38+spread),24],[side*21,32],[side*16,12]], '#342e43', color);
      for (let i = 0; i < 3; i++) { ctx.fillStyle = color; ctx.fillRect(side*(28+spread)-2, i*8-3, 4, 3); }
    }
    if (variant === 1) { ctx.strokeStyle = color; ctx.beginPath(); ctx.ellipse(0, 0, 42, 28, 0, 0, Math.PI*2); ctx.stroke(); }
    if (variant === 2) path(ctx, [[0,-49],[-16,-26],[0,-7],[16,-26]], '#4d3544', color);
  }
  if (e.kind === 'interceptor') ctx.scale(0.65, 1.25);
  if (e.kind === 'armored') { path(ctx, [[-37,-15],[-23,-34],[23,-34],[37,-15],[32,30],[-32,30]], '#4b3942', color); }
  if (e.kind === 'sniper') {
    for (const side of [-1, 1]) path(ctx, [[side*7,-48],[side*12,-43],[side*14,14],[side*6,18]], '#392746', color);
  }
  if (e.kind === 'kamikaze') ctx.scale(0.65, 0.65);
  if (e.kind === 'stealth') path(ctx, [[0,-37],[-40,20],[-9,9],[0,27],[9,9],[40,20]], '#162a45', color);
  path(ctx, [[0, -30], [-10, -10], [-32, -21], [-26, 18], [-12, 13], [-7, 25], [7, 25], [12, 13], [26, 18], [32, -21], [10, -10]], '#2d1d34', color);
  path(ctx, [[0, -24], [-7, -4], [-5, 17], [5, 17], [7, -4]], '#6a415c', color);
  path(ctx, [[-28, -17], [-23, 11], [-16, 7], [-17, -7]], '#67445c');
  path(ctx, [[28, -17], [23, 11], [16, 7], [17, -7]], '#67445c');
  ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.fillStyle = color; ctx.fillRect(-3, -12, 6, 12);
  ctx.fillStyle = '#ffbfb6'; for (const side of [-1, 1]) ctx.fillRect(side * 20 - 2, 12, 4, 7 + Math.sin(time * 24) * 3);
  ctx.restore();
  if (e.elite) { ctx.save(); ctx.strokeStyle = '#edce8a'; ctx.setLineDash([5,5]); ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 12, time * 0.2, time * 0.2 + Math.PI * 2); ctx.stroke(); ctx.restore(); }
  if (e.kind === 'kamikaze' && e.age < 1.1) { ctx.strokeStyle = '#ff8b7444'; ctx.setLineDash([5,6]); ctx.beginPath(); ctx.moveTo(e.x,e.y); ctx.lineTo(e.x+Math.cos(e.aimAngle??0)*170,e.y+Math.sin(e.aimAngle??0)*170);ctx.stroke();ctx.setLineDash([]); }
  if (!boss && e.hp < e.maxHp) { ctx.fillStyle = '#ffffff15'; ctx.fillRect(e.x - 19, e.y - 35, 38, 3); ctx.fillStyle = '#f993a5'; ctx.fillRect(e.x - 19, e.y - 35, 38 * e.hp / e.maxHp, 3); }
}

export class Renderer {
  private stars: Star[];
  private background: HTMLCanvasElement | null = null;
  private bw = 0; private bh = 0;
  constructor(private ctx: CanvasRenderingContext2D) {
    let seed = 83;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    this.stars = Array.from({ length: 155 }, () => ({ x: random(), y: random(), size: 0.4 + random() * 1.3, speed: 0.004 + random() * 0.014, brightness: 0.15 + random() * 0.65 }));
  }
  private space(w: number, h: number, time: number, moving: boolean) {
    const c = this.ctx;
    if (w !== this.bw || h !== this.bh || !this.background) {
      this.bw = w; this.bh = h; this.background = document.createElement('canvas'); this.background.width = Math.ceil(w); this.background.height = Math.ceil(h);
      const b = this.background.getContext('2d')!;
      b.fillStyle = '#080d18'; b.fillRect(0, 0, w, h);
      for (const [x, y, r, color] of [[0.72, 0.35, 0.7, '#183b403c'], [0.2, 0.4, 0.6, '#25205140'], [0.8, 1, 0.6, '#164b4538']] as const) {
        const g = b.createRadialGradient(w * x, h * y, 0, w * x, h * y, Math.max(w, h) * r); g.addColorStop(0, color); g.addColorStop(1, '#080d1800'); b.fillStyle = g; b.fillRect(0, 0, w, h);
      }
      b.strokeStyle = '#ffffff03'; b.lineWidth = 1;
      for (let x = 0; x < w; x += 80) { b.beginPath(); b.moveTo(x, 0); b.lineTo(x, h); b.stroke(); }
      for (let y = 0; y < h; y += 80) { b.beginPath(); b.moveTo(0, y); b.lineTo(w, y); b.stroke(); }
      // Cached planet, atmosphere and nebula filaments: no per-frame texture allocation.
      const px = w * 0.79, py = h * 0.29, pr = Math.min(w, h) * 0.16;
      const atmosphere = b.createRadialGradient(px, py, pr * 0.88, px, py, pr * 1.2); atmosphere.addColorStop(0, '#86bdb723'); atmosphere.addColorStop(1, '#31556700');
      b.fillStyle = atmosphere; b.beginPath(); b.arc(px, py, pr * 1.2, 0, Math.PI * 2); b.fill();
      const planet = b.createRadialGradient(px - pr * 0.55, py - pr * 0.5, 0, px, py, pr); planet.addColorStop(0, '#253e47'); planet.addColorStop(0.48, '#132631'); planet.addColorStop(1, '#080f1b');
      b.fillStyle = planet; b.beginPath(); b.arc(px, py, pr, 0, Math.PI * 2); b.fill();
      b.strokeStyle = '#8abbba18'; b.beginPath(); b.ellipse(px, py, pr * 1.65, pr * 0.34, -0.4, 0, Math.PI * 2); b.stroke();
      for (let i = 0; i < 16; i++) { b.strokeStyle = `rgba(126,118,192,${0.008 + i * 0.0007})`; b.lineWidth = 9; b.beginPath(); b.ellipse(w * 0.22, h * 0.7, w * (0.2 + i * 0.012), h * 0.21, -0.7, 0, Math.PI); b.stroke(); }
    }
    c.drawImage(this.background, 0, 0, w, h);
    for (const s of this.stars) {
      const y = (s.y + (moving ? time * s.speed : time * s.speed * 0.15)) % 1 * h;
      c.globalAlpha = s.brightness * (0.8 + Math.sin(time * 1.5 + s.x * 50) * 0.2); c.fillStyle = '#d6e4f3'; c.fillRect(s.x * w, y, s.size, moving ? s.size * 1.7 : s.size);
      if (s.size > 1.55) { c.globalAlpha *= 0.3; c.fillRect(s.x * w - 3, y + 0.4, 7, 0.5); c.fillRect(s.x * w + 0.4, y - 3, 0.5, 7); }
    }
    c.globalAlpha = 1;
  }
  draw(game: GameEngine, time: number, reducedMotion: boolean) {
    const c = this.ctx, w = game.width, h = game.height;
    this.space(w, h, reducedMotion ? 0 : game.time, !reducedMotion);
    if (game.wave % 3 === 0) {
      c.save(); c.translate(w * 0.21, h * 0.34); c.rotate(reducedMotion ? 0 : game.time * 0.045);
      for (let i = 0; i < 4; i++) { c.strokeStyle = `rgba(148,123,221,${0.12 - i * 0.022})`; c.lineWidth = 2; c.beginPath(); c.ellipse(0, 0, 28 + i * 14, 17 + i * 8, i * 0.24, 0, Math.PI * 1.7); c.stroke(); } c.restore();
    }
    c.save();
    if (!reducedMotion && game.shake > 0) c.translate(Math.sin(time * 80) * game.shake, Math.cos(time * 91) * game.shake * 0.6);
    for (const rock of game.asteroids) {
      c.save(); c.translate(rock.x, rock.y); c.rotate(rock.angle); c.lineWidth = 1.5;
      const vertices = Array.from({ length: 10 }, (_, i) => { const a = i / 10 * Math.PI * 2, r = rock.r * (0.8 + Math.sin(i * 3.5 + rock.seed) * 0.2); return [Math.cos(a) * r, Math.sin(a) * r]; });
      c.shadowColor = '#e7a777'; c.shadowBlur = game.objective.kind === 'storm' ? 12 : 0;
      path(c, vertices, '#262b39', game.objective.kind === 'storm' ? '#ac8168' : '#596170'); c.shadowBlur = 0;
      c.strokeStyle = '#dca47866'; c.beginPath(); c.moveTo(-rock.r * 0.5, -rock.r * 0.3); c.lineTo(2, 3); c.lineTo(rock.r * 0.3, rock.r * 0.7); c.stroke();
      c.fillStyle = '#161e2b'; c.beginPath(); c.ellipse(-rock.r * 0.2, -rock.r * 0.2, rock.r * 0.23, rock.r * 0.18, 1, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#ffffff0e'; c.beginPath(); c.moveTo(0, rock.r * 0.3); c.lineTo(rock.r * 0.5, rock.r * 0.2); c.stroke(); c.restore();
    }
    for (const pickup of game.pickups) {
      c.save(); c.translate(pickup.x, pickup.y); const color = powerColors[pickup.kind];
      if (pickup.kind === 'energy' || pickup.kind === 'credit') c.scale(0.55, 0.55);
      c.globalAlpha = pickup.age > 10 ? 0.5 + Math.sin(time * 10) * 0.5 : 1; c.shadowColor = color; c.shadowBlur = 14;
      c.rotate(Math.PI / 4); c.fillStyle = '#101c2e'; c.strokeStyle = color; c.lineWidth = 1.5; c.fillRect(-14, -14, 28, 28); c.strokeRect(-14, -14, 28, 28); c.rotate(-Math.PI / 4);
      c.shadowBlur = 0; c.font = 'bold 24px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(powerGlyphs[pickup.kind], 0, 0); c.restore();
    }
    for (const e of game.enemies) drawEnemy(c, e, game.time);
    for (const b of game.bullets) {
      c.strokeStyle = b.color; c.fillStyle = '#ffffff'; c.lineWidth = b.kind === 'missile' ? 5 : b.hostile ? b.r * 1.4 : 3; c.lineCap = 'round'; c.shadowBlur = 10; c.shadowColor = b.color;
      c.beginPath(); c.moveTo(b.x, b.y); const speed = Math.hypot(b.vx, b.vy); c.lineTo(b.x - b.vx / speed * (b.hostile ? 7 : 19), b.y - b.vy / speed * (b.hostile ? 7 : 19)); c.stroke();
    }
    c.shadowBlur = 0;
    for (const beam of game.beams) {
      c.save(); c.strokeStyle = beam.hostile ? '#ff91b1' : '#bbfff0'; c.shadowColor = c.strokeStyle;
      c.globalAlpha = beam.warning > 0 ? 0.25 + (1 - beam.warning) * 0.4 : 0.85;
      c.lineWidth = beam.warning > 0 ? 1.5 : beam.width; c.shadowBlur = beam.warning > 0 ? 0 : 18;
      if (beam.warning > 0) c.setLineDash([10, 10]);
      c.beginPath(); c.moveTo(beam.x, beam.y); c.lineTo(beam.x + Math.cos(beam.angle) * beam.length, beam.y + Math.sin(beam.angle) * beam.length); c.stroke();
      if (beam.warning <= 0) { c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke(); }
      c.restore();
    }
    const p = game.player;
    if (game.phase !== 'over') {
      drawShip(c, p.x, p.y, 1, p.angle, game.time, p.invulnerable > 0 && Math.floor(game.time * 12) % 2 === 0, game.ship);
      if (p.shieldHit > 0 || p.charge > 0 || p.boostTime > 0) {
        c.strokeStyle = p.shieldHit > 0 ? '#8fcfff' : '#b0f5db'; c.lineWidth = 2; c.shadowColor = c.strokeStyle; c.shadowBlur = 14;
        c.beginPath(); c.arc(p.x, p.y, p.shieldHit > 0 ? 38 + (0.4 - p.shieldHit) * 35 : 31, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (p.charge || 1)); c.stroke(); c.shadowBlur = 0;
      }
      if (p.shield > 0) { c.strokeStyle = '#8fcfff'; c.fillStyle = '#71c1ff0b'; c.lineWidth = 1.5; c.shadowColor = '#8fcfff'; c.shadowBlur = 18; c.beginPath(); c.arc(p.x, p.y, 37 + Math.sin(game.time * 5) * 2, 0, Math.PI * 2); c.fill(); c.stroke(); c.shadowBlur = 0; }
    }
    for (const particle of game.particles) {
      c.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1); c.fillStyle = particle.color;
      if (particle.ring) { c.strokeStyle = particle.color; c.lineWidth = 2; c.beginPath(); c.arc(particle.x, particle.y, (1 - particle.life / particle.maxLife) * particle.size * 2, 0, Math.PI * 2); c.stroke(); }
      else if (particle.debris) { c.save(); c.translate(particle.x, particle.y); c.rotate(particle.life * 5); path(c, [[0,-particle.size*2],[-particle.size,particle.size],[particle.size,particle.size]], '#718895', particle.color); c.restore(); }
      else c.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    c.globalAlpha = 1; c.restore();
    const cssWidth = c.canvas.clientWidth || w, uiScale = w / cssWidth;
    for (const text of game.texts) { c.globalAlpha = Math.min(1, text.life * 2); c.font = `bold ${11 * uiScale}px monospace`; c.textAlign = 'center'; c.fillStyle = text.color; c.fillText(text.text, text.x, text.y); }
    c.globalAlpha = 1; c.textAlign = 'left';
    if (p.damageFlash > 0) { c.fillStyle = `rgba(255,79,92,${p.damageFlash * 0.16})`; c.fillRect(0,0,w,h); }
    // Screen-space radar remains legible in very wide/short mobile arenas.
    c.save(); c.scale(uiScale, uiScale);
    const rw = cssWidth < 600 ? 76 : 110, rh = cssWidth < 600 ? 48 : 70, rx = cssWidth - rw - 14, ry = 14;
    c.fillStyle = '#091322bb'; c.fillRect(rx, ry, rw, rh); c.strokeStyle = '#a4d0c132'; c.lineWidth = 1; c.strokeRect(rx, ry, rw, rh);
    c.strokeStyle = '#a4d0c110'; c.beginPath(); c.moveTo(rx+rw/2,ry); c.lineTo(rx+rw/2,ry+rh);c.moveTo(rx,ry+rh/2);c.lineTo(rx+rw,ry+rh/2);c.stroke();
    for (const e of game.enemies) { c.fillStyle = e.kind === 'boss' || e.elite ? '#ffd599' : e.cloaked ? '#7795bb' : '#ef91a7'; c.fillRect(rx+clamp(e.x/w,0,1)*rw-2,ry+clamp(e.y/h,0,1)*rh-2,e.elite?4:3,e.elite?4:3); }
    for (const a of game.asteroids) { c.fillStyle = '#778694'; c.fillRect(rx+clamp(a.x/w,0,1)*rw,ry+clamp(a.y/h,0,1)*rh,2,2); }
    c.fillStyle = '#b0f5db';c.fillRect(rx+p.x/w*rw-2,ry+p.y/h*rh-2,4,4);c.font='7px monospace';c.fillStyle='#7b9e9f';c.fillText('RADAR // LIVE',rx,ry+rh+11); c.restore();
  }
  hero(w: number, h: number, time: number, reducedMotion: boolean, ship: ShipId = 'vanguard') {
    const c = this.ctx; this.space(w, h, reducedMotion ? 0 : time, false);
    const x = w * 0.54, y = h * 0.47, r = Math.min(w, h) * 0.38;
    c.save(); c.translate(x, y); c.rotate(-0.35); c.strokeStyle = '#a8fbe016'; c.lineWidth = 1;
    for (const m of [0.7, 1, 1.35]) { c.beginPath(); c.ellipse(0, 0, r * m, r * m * 0.62, 0, 0, Math.PI * 2); c.stroke(); }
    c.strokeStyle = '#a8fbe04d'; c.beginPath(); c.ellipse(0, 0, r, r * 0.62, 0, -0.5, 0.2); c.stroke();
    c.fillStyle = '#9fffdc'; c.beginPath(); c.arc(r * 0.98, r * 0.12, 3, 0, Math.PI * 2); c.fill(); c.restore();
    const glow = c.createRadialGradient(x, y, 0, x, y, r); glow.addColorStop(0, '#5cdeb01a'); glow.addColorStop(1, '#5cdeb000'); c.fillStyle = glow; c.fillRect(0, 0, w, h);
    drawShip(c, x, y + (reducedMotion ? 0 : Math.sin(time * 0.7) * 8), Math.min(w, h) / 127, -Math.PI / 2 + 0.48, reducedMotion ? 0 : time, false, ship);
    c.font = '10px monospace'; c.fillStyle = '#7d96a0'; c.fillText(SHIPS[ship].name.toUpperCase(), w * 0.13, h * 0.83);
    c.strokeStyle = '#9cc8bc38'; c.beginPath(); c.moveTo(w * 0.13, h * 0.79); c.lineTo(w * 0.31, h * 0.79); c.lineTo(w * 0.4, h * 0.65); c.stroke();
    c.fillStyle = '#8ed6c1'; c.font = '9px monospace'; c.fillText('SYSTEMS NOMINAL', w * 0.63, h * 0.2);
  }
}
