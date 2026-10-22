import { useEffect, useRef, useState } from 'react';
import { ACHIEVEMENTS, SHIPS, UPGRADES } from '../game/catalog';
import type { ShipId, UpgradeId } from '../game/catalog';
import type { Snapshot } from '../game/engine';
import type { Progression } from '../game/progression';
import { formatTime } from '../game/engine';

export function ScoreCounter({ value, reducedMotion }: { value: number; reducedMotion: boolean }) {
  const [display, setDisplay] = useState(value), current = useRef(value);
  useEffect(() => {
    if (reducedMotion || value <= current.current) { current.current = value; setDisplay(value); return; }
    const from = current.current, start = performance.now(); let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 240); current.current = Math.round(from + (value - from) * (1 - (1 - t) ** 3)); setDisplay(current.current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [value, reducedMotion]);
  return <strong data-testid="score">{display.toString().padStart(6, '0')}</strong>;
}
export function SystemsHUD({ stats }: { stats: Snapshot }) {
  return <>
    <div className="systems-strip">
      <div className="system-meter"><span>SHIELD <b>{Math.ceil(stats.shieldHp)} / {stats.maxShield}</b></span><i><em style={{ width: `${stats.shieldHp / stats.maxShield * 100}%` }}/></i></div>
      <div className="system-meter boost-meter"><span>BOOST <kbd>SHIFT</kbd><b>{stats.boostSeconds <= 0 ? 'READY' : `${stats.boostSeconds.toFixed(1)}s`}</b></span><i><em style={{ width: `${stats.boost * 100}%` }}/></i></div>
      <div className="weapon-status"><span>CORE <b>LV.{stats.weaponLevel}</b></span><span>SEEKER <kbd>Q</kbd><b>{stats.missileLevel ? stats.missileCooldown > 0 ? `${stats.missileCooldown.toFixed(1)}s` : 'READY' : 'LOCKED'}</b></span><span>BEAM <kbd>E</kbd><b>{stats.charge > 0 ? `${Math.round(stats.charge * 100)}%` : stats.laserCooldown > 0 ? `${stats.laserCooldown.toFixed(1)}s` : 'HOLD'}</b></span></div>
      <div className="salvage-counter"><strong>{stats.credits} CR</strong><small>{stats.energy} / 100 ENERGY</small></div>
    </div>
    <div className="wave-progress" aria-label={`Wave ${Math.round(stats.waveProgress * 100)} percent complete`}><i style={{ width: `${stats.waveProgress * 100}%` }}/></div>
  </>;
}
export function ObjectiveHUD({ stats }: { stats: Snapshot }) {
  return <div className={`objective-hud ${stats.objective.status}`}><span>{stats.objective.status === 'complete' ? '✓ OBJECTIVE COMPLETE' : stats.objective.status === 'missed' ? 'TIME BONUS MISSED' : 'MISSION OBJECTIVE'}{stats.objective.duration > 0 && <b>{formatTime(stats.objectiveTime)}</b>}</span><strong>{stats.objective.title}</strong><small>{stats.objective.detail}</small></div>;
}
export function UpgradeDock({ stats, onBuy, onContinue }: { stats: Snapshot; onBuy: (id: UpgradeId) => void; onContinue: () => void }) {
  return <>
    <p className="modal-intro">The sector is secure. Refit before the next jump. Upgrades last for this run.</p>
    <div className="dock-balance"><span>{stats.voucher ? 'ONE COMPLIMENTARY UPGRADE' : 'SPEND SALVAGED CREDITS'}</span><strong>{stats.credits} CR</strong></div>
    <div className="upgrade-grid">{UPGRADES.map(option => {
      const level = stats.upgrades[option.id], affordable = stats.voucher || stats.credits >= option.cost;
      return <button key={option.id} className="upgrade-option" onClick={() => onBuy(option.id)} disabled={level >= 5 || !affordable} aria-label={`Install ${option.name}`}><span className="upgrade-icon">{option.glyph}</span><span><strong>{option.name}</strong><small>{option.detail}</small><em>LV {level} / 5 <b>{level >= 5 ? 'MAXED' : stats.voucher ? 'FREE' : `${option.cost} CR`}</b></em></span></button>;
    })}</div>
    {stats.notificationTime > 0 && stats.notification.startsWith('UPGRADE') && <p className="dock-installed" role="status">✓ {stats.notification}</p>}
    <button className="primary-button full-width" onClick={onContinue}>Launch wave {stats.wave + 1} <span>→</span></button>
    <p className="storage-note">Core levels: +10% weapon damage each. Credits are earned through salvage and completed objectives. Unspent credits stay with this run.</p>
  </>;
}
export function Hangar({ profile, onSelect }: { profile: Progression; onSelect: (ship: ShipId) => void }) {
  return <><p className="modal-intro">Three frames. Three ways to survive. Unlocks and your selected ship are saved across sessions.</p><div className="hangar-ships">{(Object.entries(SHIPS) as [ShipId, typeof SHIPS[ShipId]][]).map(([id, ship]) => {
    const unlocked = profile.unlocked.includes(id), selected = profile.selected === id;
    return <button key={id} className={`hangar-ship ${selected ? 'selected' : ''}`} disabled={!unlocked} aria-label={`Select ${ship.name}`} aria-pressed={selected} onClick={() => onSelect(id)}><span className={`hangar-glyph ${id}`} style={{ color: ship.color }}>⟁</span><span><strong>{ship.name}</strong><small>{ship.role}</small><em>{ship.hp} HULL · {ship.shield} SHIELD · {ship.speed} SPEED</em><small>{unlocked ? selected ? '✓ ACTIVE FRAME' : 'SELECT FRAME' : ship.requirement}</small></span></button>;
  })}</div><div className="profile-summary"><span>{profile.totalKills} ELIMINATIONS</span><span>{profile.bosses} FLAGSHIPS DOWN</span><span>{profile.totalCredits} LIFETIME CREDITS</span></div><h3 className="achievement-heading">Service record <span>{profile.achievements.length} / {Object.keys(ACHIEVEMENTS).length}</span></h3><div className="achievement-grid">{Object.entries(ACHIEVEMENTS).map(([id, achievement]) => <div key={id} className={profile.achievements.includes(id) ? 'earned' : ''}><b>{profile.achievements.includes(id) ? '✧' : '◇'}</b><span><strong>{achievement.name}</strong><small>{achievement.detail}</small></span></div>)}</div></>;
}
export function RunDetails({ stats }: { stats: Snapshot }) {
  return <div className="run-details"><div><span>HIGHEST CHAIN</span><b>{stats.highestCombo}</b></div><div><span>WAVES CLEARED</span><b>{stats.wavesCleared}</b></div><div><span>ACCURACY</span><b>{stats.accuracy}%</b></div><div><span>CREDITS FOUND</span><b>{stats.earnedCredits}</b></div></div>;
}
