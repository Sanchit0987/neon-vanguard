import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import GameCanvas, { HeroCanvas } from './components/GameCanvas';
import { AudioManager } from './game/audio';
import { formatTime } from './game/engine';
import type { Snapshot } from './game/engine';
import { loadScores, loadSettings, saveScore, saveSettings } from './game/storage';
import type { ScoreEntry, Settings } from './game/storage';
import type { GameEngine } from './game/engine';
import { SHIPS } from './game/catalog';
import type { ShipId, UpgradeId } from './game/catalog';
import { loadProgress, saveProgress, advanceProgress, selectShip } from './game/progression';
import { SystemsHUD, ObjectiveHUD, UpgradeDock, Hangar, RunDetails, ScoreCounter } from './components/ExpansionUI';

type IconName = 'ship' | 'arrow' | 'sound' | 'mute' | 'settings' | 'trophy' | 'pause' | 'play' | 'close' | 'target' | 'bolt' | 'shield' | 'heart' | 'clock' | 'orbit';
function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    ship: <><path d="m12 2 9 19-9-5-9 5 9-19Z"/><path d="M12 2v14m-4 5 4-3 4 3"/></>,
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6"/></>,
    sound: <><path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
    mute: <><path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="m16 9 6 6m0-6-6 6"/></>,
    settings: <><path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3H9Z"/><circle cx="12" cy="12" r="3"/></>,
    trophy: <><path d="M7 3h10v6a5 5 0 0 1-10 0V3Zm5 11v6m-5 1h10M7 5H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4"/></>,
    pause: <><path d="M8 5v14M16 5v14" strokeWidth="3"/></>,
    play: <path d="m8 4 12 8-12 8V4Z"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    target: <><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/></>,
    bolt: <path d="m13 2-9 12h7l-1 8 10-13h-7l0-7Z"/>,
    shield: <><path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5l8-3Z"/><path d="m8 11 3 3 5-6"/></>,
    heart: <path d="M12 21 3 12C-3 5 6-1 12 6c6-7 15-1 9 6l-9 9Z"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
    orbit: <><circle cx="12" cy="12" r="6"/><ellipse cx="12" cy="12" rx="12" ry="4" transform="rotate(-35 12 12)"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>{paths[name]}</svg>;
}
function Modal({ children, title, eyebrow, onClose, className = '' }: { children: ReactNode; title: string; eyebrow: string; onClose?: () => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null), closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = ref.current!;
    (element.querySelector('button') as HTMLElement | null)?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.code === 'Escape' && closeRef.current) { event.preventDefault(); event.stopImmediatePropagation(); if (!event.repeat) closeRef.current(); }
      if (event.code === 'Tab') {
        const focusable = Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex="0"]'));
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(<div className="modal-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) onClose?.(); }}>
    <div ref={ref} className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      {onClose && <button className="icon-button modal-close" onClick={onClose} aria-label="Close dialog"><Icon name="close"/></button>}
      <p className="eyebrow text-mint">{eyebrow}</p><h2 id="modal-title">{title}</h2>{children}
    </div>
  </div>, document.body);
}
function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="setting-row"><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)}/><span className={`toggle ${checked ? 'on' : ''}`} aria-hidden="true"><span/></span></label>;
}
const scoreText = (n: number) => Math.floor(n).toLocaleString('en-US', { minimumIntegerDigits: 6, useGrouping: false });

export default function App() {
  const [screen, setScreen] = useState<'menu' | 'game'>('menu');
  const [dialog, setDialog] = useState<'how' | 'settings' | 'scores' | 'hangar' | null>(null);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [scores, setScores] = useState<ScoreEntry[]>(loadScores);
  const [profile, setProfile] = useState(loadProgress);
  const profileRef = useRef(profile), controller = useRef<GameEngine | null>(null);
  const [paused, setPaused] = useState(false), [session, setSession] = useState(0), [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Snapshot | null>(null), [stored, setStored] = useState(true);
  const [audio] = useState(() => new AudioManager());
  const runId = useRef(''), savedRun = useRef('');
  const isOver = screen === 'game' && stats?.phase === 'over';
  const best = scores[0]?.score ?? 0;
  useEffect(() => { audio.configure(settings); setStored(saveSettings(settings)); }, [settings, audio]);
  useEffect(() => { audio.setActive(screen === 'game' && !paused && stats?.phase === 'playing' && !dialog); }, [screen, paused, stats?.phase, dialog, audio]);
  useEffect(() => () => audio.destroy(), [audio]);
  useEffect(() => {
    if (!stats || (!isOver && stats.phase !== 'victory')) return;
    const key = `${runId.current}:${stats.wave}:${stats.phase}`;
    if (savedRun.current === key) return;
    savedRun.current = key;
    const result = saveScore({ id: runId.current, score: stats.score, kills: stats.kills, wave: stats.wave, time: stats.time, date: new Date().toISOString(), highestCombo: stats.highestCombo, accuracy: stats.accuracy, wavesCleared: stats.wavesCleared });
    setScores(result.scores); setStored(result.persisted);
  }, [isOver, stats]);
  useEffect(() => {
    if (!stats) return;
    const previous = profileRef.current, next = advanceProgress(previous, runId.current, stats);
    const newShip = next.unlocked.find(id => !previous.unlocked.includes(id));
    if (newShip) { controller.current?.notify(`NEW SHIP UNLOCKED // ${SHIPS[newShip].name.toUpperCase()}`); audio.play('achievement'); }
    profileRef.current = next; setProfile(next); if (!saveProgress(next)) setStored(false);
    // Save only at meaningful progression changes, not every render frame.
  }, [stats?.kills, stats?.earnedCredits, stats?.bosses, stats?.wavesCleared, stats?.phase, audio]);
  const start = () => {
    audio.unlock(); setDialog(null); setStats(null); setLoading(true); setPaused(false); setScreen('game'); setSession(s => s + 1); runId.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  };
  const home = () => { setScreen('menu'); setDialog(null); setPaused(false); setStats(null); setLoading(false); };
  const onSnapshot = useCallback((snapshot: Snapshot) => setStats(snapshot), []);
  const onReady = useCallback(() => setLoading(false), []);
  const mute = useCallback(() => { audio.unlock(); setSettings(s => ({ ...s, muted: !s.muted })); }, [audio]);
  const togglePause = useCallback((requested?: boolean) => {
    // Use the live controller, not the throttled HUD snapshot: Escape may arrive
    // immediately after restart, before React has published the new run's stats.
    const game = controller.current;
    if (!dialog && game && (game.phase === 'playing' || game.phase === 'paused')) {
      const pause = requested ?? game.phase === 'playing';
      if (pause) game.pause(); else game.resume();
      setPaused(pause); setStats(game.snapshot()); audio.unlock();
    }
  }, [dialog, audio]);
  const resume = () => togglePause(false);
  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => { audio.unlock(); setSettings(s => ({ ...s, [key]: value })); };
  const chooseShip = (ship: ShipId) => { const next = selectShip(profileRef.current, ship); profileRef.current = next; setProfile(next); setStored(saveProgress(next)); audio.unlock(); audio.play('upgrade'); };
  const buyUpgrade = (id: UpgradeId) => { if (controller.current?.buyUpgrade(id)) setStats(controller.current.snapshot()); };
  const continueMission = () => { if (controller.current?.continueMission()) { setPaused(false); setStats(controller.current.snapshot()); audio.unlock(); } };
  return <div className={`app-shell ${screen === 'game' ? 'in-game' : ''}`}>
    <header className="site-header">
      <button className="brand" onClick={screen === 'menu' ? home : undefined} aria-label="Neon Vanguard flight deck"><span className="brand-emblem"><Icon name="ship" size={25}/></span><span>NEON<span className="brand-light">VANGUARD</span><small>DEEP SPACE OPERATIONS</small></span></button>
      <nav className="main-nav" aria-label="Main navigation">
        {screen === 'menu' ? <><span className="nav-active">Flight deck</span><button onClick={() => setDialog('scores')}>High scores <Icon name="trophy" size={14}/></button><button onClick={() => setDialog('settings')}>Settings <Icon name="settings" size={14}/></button></> : <span className="mission-status"><i/> MISSION IN PROGRESS</span>}
      </nav>
      <div className="header-right"><span className="online-status"><i/> SYSTEMS ONLINE</span><button className="icon-button" onClick={mute} aria-label={settings.muted ? 'Unmute audio' : 'Mute audio'} title="Toggle audio (M)"><Icon name={settings.muted ? 'mute' : 'sound'} size={18}/></button></div>
    </header>
    {screen === 'menu' ? <main className="menu-main">
      <div className="section-heading"><span><span className="tiny-square"/> FLIGHT DECK <span className="subtle">/ SOLO OPERATIONS</span></span><span className="subtle">EST. 2186 <span className="divider-dot">·</span> SECTOR 07</span></div>
      <section className="hero-panel">
        <div className="hero-art"><HeroCanvas reducedMotion={settings.reducedMotion} ship={profile.selected}/><div className="hero-art-vignette"/><span className="coordinate coord-top">X: 084.26 <span>Y: 197.03</span></span><span className="coordinate coord-bottom">DEEP FIELD // UNCHARTED</span></div>
        <div className="hero-copy"><div className="mode-badge"><span className="status-dot"/> ENDLESS ARCADE <span className="badge-divider"/> SINGLE PLAYER</div>
          <h1>THE VOID<br/>IS <span>CALLING.</span></h1>
          <p>One ship. Infinite odds.<br/>Carve your path through the stars.</p>
          <div className="hero-actions"><button className="primary-button" onClick={start}><Icon name="play" size={17}/> Launch mission <Icon name="arrow" size={18}/></button><button className="secondary-button" onClick={() => setDialog('how')}>How to play <span>↗</span></button></div>
          <div className="hero-footnote"><span className="keycap">W A S D</span><span>to fly</span><span className="control-separator"/><span className="mouse-mini"/><span>to aim & fire</span></div>
        </div>
        <div className="hero-index"><span>01</span> / ∞</div>
      </section>
      <div className="deck-grid">
        <section className="deck-card loadout-card"><div className="card-heading"><span className="eyebrow">YOUR INTERCEPTOR</span><span className="tag">READY</span></div><div className="loadout-title"><span className="ship-badge"><Icon name="ship" size={34}/></span><div><h3>{SHIPS[profile.selected].name}</h3><p>{SHIPS[profile.selected].role}</p></div></div><div className="ship-stats"><div><span>AGILITY</span><i><b style={{ width: `${SHIPS[profile.selected].speed / 5}%` }}/></i></div><div><span>FIREPOWER</span><i><b style={{ width: `${SHIPS[profile.selected].damage * 2.5}%` }}/></i></div><div><span>ARMOR</span><i><b style={{ width: `${SHIPS[profile.selected].hp / 1.8}%` }}/></i></div></div><button className="text-button" onClick={() => setDialog('hangar')}>Hangar & service record <Icon name="arrow" size={14}/></button></section>
        <section className="deck-card record-card"><div className="card-heading"><span className="eyebrow">PERSONAL BEST</span><Icon name="trophy" size={17}/></div><div className="best-score">{scoreText(best)}<span>PTS</span></div><p>{scores.length ? `Wave ${scores[0].wave} reached · ${formatTime(scores[0].time)} survived` : 'Your next mission could be legendary.'}</p><button className="text-button" onClick={() => setDialog('scores')}>View high scores <Icon name="arrow" size={15}/></button></section>
        <section className="deck-card briefing-card"><div className="card-heading"><span className="eyebrow">MISSION BRIEFING</span><Icon name="orbit" size={18}/></div><h3>Survive. Adapt. Overcome.</h3><p>Hunt commanders. Refit. Ride the storm.<br className="desktop-only"/> Every fifth wave, a flagship awaits.</p><div className="briefing-tags"><span><i className="mint-dot"/> TACTICAL UPGRADES</span><span><i className="orange-dot"/> MULTIPHASE BOSSES</span></div></section>
      </div>
      <div className="preflight"><span className="eyebrow"><Icon name="shield" size={15}/> PRE-FLIGHT CHECK</span><span><i/> Weapons armed</span><span><i/> Shields calibrated</span><span><i/> Pilot… that's you.</span><span className="preflight-end">ALL SYSTEMS GO <Icon name="arrow" size={14}/></span></div>
    </main> : <main className="game-main">
      <div className="mission-topline"><span className="eyebrow"><span className="tiny-square"/> LIVE OPERATION <span className="subtle">/ SECTOR {String(stats?.wave ?? 1).padStart(2, '0')}</span></span><div className="flex items-center gap-3"><span className="timer"><Icon name="clock" size={14}/><span data-testid="timer">{formatTime(stats?.time ?? 0)}</span></span><button className="pause-button" onClick={() => togglePause()} disabled={stats?.phase !== 'playing'} aria-label="Pause game"><Icon name="pause" size={16}/><span>Pause</span><kbd>ESC</kbd></button></div></div>
      <div className="hud">
        <div className="health-hud"><div className="hud-label"><span>HULL INTEGRITY</span><strong data-testid="health">{Math.ceil(stats?.hp ?? SHIPS[profile.selected].hp)}<small> / {stats?.maxHp ?? SHIPS[profile.selected].hp}</small></strong></div><div className={`health-track ${(stats?.hp ?? 100) < (stats?.maxHp ?? 100) * 0.3 ? 'critical' : ''}`}><div style={{ width: `${(stats?.hp ?? 100) / (stats?.maxHp ?? 100) * 100}%` }}/></div><div className="lives"><span>{[0, 1, 2].map(i => <Icon key={i} name="ship" size={13} className={i < (stats?.lives ?? 3) ? '' : 'lost-life'}/>)}</span><small data-testid="lives">{stats?.lives ?? 3} LIVES REMAINING</small></div></div>
        <div className="hud-stat main-score"><span>SCORE</span><ScoreCounter value={stats?.score ?? 0} reducedMotion={settings.reducedMotion}/></div><div className="hud-stat"><span>WAVE</span><strong data-testid="wave">{String(stats?.wave ?? 1).padStart(2, '0')}<small> / ∞</small></strong></div><div className="hud-stat kills-stat"><span>ELIMINATIONS</span><strong data-testid="kills">{String(stats?.kills ?? 0).padStart(2, '0')}</strong></div>
      </div>
      {stats && <SystemsHUD stats={stats}/>}
      <div className={`arena-frame ${stats && stats.hp < stats.maxHp * 0.3 ? 'hull-critical' : ''}`}>
        <GameCanvas key={session} paused={paused} settings={settings} audio={audio} onSnapshot={onSnapshot} onPause={togglePause} onMute={mute} onReady={onReady} ship={profile.selected} controller={controller} inputBlocked={dialog !== null} status={stats}/>
        {stats && <ObjectiveHUD stats={stats}/>}
        <div className="arena-corner top-left"/><div className="arena-corner top-right"/><div className="arena-corner bottom-left"/><div className="arena-corner bottom-right"/>
        {loading && <div className="loading-overlay" role="status"><span className="loading-ring"/>INITIALIZING FLIGHT SYSTEMS</div>}
        {stats?.boss && <div className={`boss-hud boss-phase-${stats.boss.phase}`}><div><span>⚠ {stats.boss.name}</span><small>{stats.boss.phase === 3 ? 'CRITICAL · PHASE III' : stats.boss.phase === 2 ? 'ENRAGED · PHASE II' : 'CAPITAL CLASS · PHASE I'}</small></div><div className="boss-track"><i style={{ width: `${stats.boss.hp / stats.boss.maxHp * 100}%` }}/></div></div>}
        {stats && stats.bannerTime > 0 && !paused && !isOver && <div className={`wave-banner ${stats.banner.includes('DREADNOUGHT') ? 'danger' : ''}`}><span>{stats.banner === 'SECTOR CLEAR' ? 'THREAT NEUTRALIZED' : 'NEON VANGUARD // OPERATIONS'}</span><strong>{stats.banner}</strong><small>{stats.banner.includes('DREADNOUGHT') ? 'Keep moving. Watch the firing patterns.' : stats.banner === 'SECTOR CLEAR' ? 'Next wave approaching' : 'Stay sharp, pilot.'}</small></div>}
        {stats && stats.combo >= 2 && <div className="combo">×{Math.min(4, 1 + Math.floor(stats.combo / 5))}<span>{stats.combo} KILL CHAIN</span></div>}
        {stats && stats.notificationTime > 0 && <div className="combat-notice" role="status" key={stats.notification}>{stats.notification}</div>}
        <div className="active-powers">{stats && (Object.entries(stats.powers) as ['rapid' | 'multi' | 'shield', number][]).filter(([, value]) => value > 0).map(([kind, value]) => <div className={`power-chip ${kind}`} key={kind}><Icon name={kind === 'rapid' ? 'bolt' : kind === 'multi' ? 'target' : 'shield'} size={15}/><span>{kind === 'rapid' ? 'RAPID FIRE' : kind === 'multi' ? 'MULTI-SHOT' : 'SHIELD'}</span><b>{Math.ceil(value)}s</b></div>)}</div>
      </div>
      <div className="game-bottom"><span><i className="status-dot"/> {paused ? 'FLIGHT SYSTEMS ON STANDBY' : isOver ? 'SIGNAL LOST' : 'TELEMETRY CONNECTED'}</span><span className="desktop-controls"><kbd>WASD</kbd> Move <span>·</span> <kbd>MOUSE</kbd> Aim & fire <span>·</span> <kbd>SPACE</kbd> Shoot</span><span>{stats?.kills ?? 0} KILLS <span className="subtle">/</span> {stats?.remaining ?? 8} HOSTILES</span></div>
    </main>}
    <footer className="site-footer"><span>NEON VANGUARD <span className="subtle">© 2186</span></span><span className="footer-message">Built for the brave. Lost to the stars.</span><span><i/> LOCAL FLIGHT LOG <span className="subtle">v1.0</span></span></footer>
    {dialog === 'hangar' && <Modal title="Choose your edge." eyebrow="HANGAR // SERVICE RECORD" onClose={() => setDialog(null)} className="hangar-modal"><Hangar profile={profile} onSelect={chooseShip}/><p className="storage-note">{stored ? 'Flight progression saved on this browser.' : 'Storage unavailable. Progress is retained for this session only.'}</p><button className="primary-button full-width" onClick={() => setDialog(null)}>Return to flight deck</button></Modal>}
    {screen === 'game' && stats?.phase === 'upgrade' && !dialog && <Modal title="A moment to evolve." eyebrow={`REFIT DOCK // WAVE ${stats.wave} CLEARED`} className="upgrade-modal"><UpgradeDock stats={stats} onBuy={buyUpgrade} onContinue={continueMission}/><button className="quiet-button full-width" onClick={home}>Return to main menu</button></Modal>}
    {screen === 'game' && stats?.phase === 'victory' && !dialog && <Modal title="The sector is yours." eyebrow="MISSION COMPLETE // FLAGSHIP DESTROYED" className="victory-modal"><div className="victory-emblem">✧</div><p className="modal-intro">A new frontier opens. Your ship, upgrades, and salvage will carry into the next sector.</p><div className="final-score"><span>SECTOR SCORE</span><strong>{scoreText(stats.score)}</strong></div><RunDetails stats={stats}/><p className="storage-note">{stats.objective.status === 'complete' ? 'Timed objective complete. Bonus points awarded.' : 'Flagship defeated. The time bonus was missed, but the mission continues.'}</p><div className="modal-actions"><button className="primary-button full-width" onClick={continueMission}>Refit & continue</button><button className="secondary-button full-width" onClick={home}>Return to main menu</button></div></Modal>}
    {dialog === 'how' && <Modal title="Pilot's field manual" eyebrow="FLIGHT ACADEMY // 01" onClose={() => setDialog(null)}><p className="modal-intro">Keep moving. Make every shot count. Come back in one piece.</p><div className="manual-controls"><div><span><kbd>W</kbd><br/><kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd></span><div><strong>Navigate the void</strong><p>WASD or arrow keys to move. Drag the left joystick on touch screens.</p></div></div><div><span><Icon name="target" size={31}/></span><div><strong>Aim. Fire. Repeat.</strong><p>Move the mouse to aim; hold click or Space to shoot. Touch pilots: hold FIRE to shoot upward.</p></div></div><div><span><kbd>ESC</kbd></span><div><strong>Take a breather</strong><p>Escape or P pauses the mission. M toggles audio. Switching tabs automatically pauses.</p></div></div></div><div className="power-guide"><div><b className="rapid">ϟ</b><strong>Rapid fire</strong><small>12 seconds</small></div><div><b className="multi">⋔</b><strong>Multi-shot</strong><small>12 seconds</small></div><div><b className="shield">◇</b><strong>Shield</strong><small>8 seconds</small></div><div><b className="health">+</b><strong>Repair</strong><small>+40 hull</small></div></div><div className="advanced-controls"><p><kbd>SHIFT</kbd><span><strong>Vector boost</strong>Dash in your movement direction. Briefly invincible; wait for the meter to refill.</span></p><p><kbd>E</kbd><span><strong>Charge beam</strong>Hold to charge, release to pierce enemies. Minimum charge 25%; cooldown 2.4s.</span></p><p><kbd>Q</kbd><span><strong>Seeker missiles</strong>Unlock the launcher at a refit dock. Homing salvos recharge every 2.5s.</span></p></div><p className="manual-tip"><Icon name="bolt" size={18}/> Chain kills within 3 seconds to multiply scores. Collect cyan energy to level your weapon, gold credits to buy upgrades, and pink cores for instant levels. Docks open after even waves and boss victories, with one free upgrade. Marked elites cannot escape. Every fifth wave brings a three-phase flagship; beat it in 90 seconds for a bonus. Touch pilots have BOOST, MISSILE and hold/release LASER buttons. Red dashed lines telegraph incoming beams: boost out of their path.</p><button className="primary-button full-width" onClick={start}>Ready for launch <Icon name="arrow" size={18}/></button></Modal>}
    {dialog === 'settings' && <Modal title="Flight preferences" eyebrow="SYSTEM CONFIGURATION" onClose={() => setDialog(null)}><p className="modal-intro">Make the cockpit your own. Changes save automatically.</p><Toggle label="Audio enabled" description="Procedural weapons, explosions, and alerts" checked={!settings.muted} onChange={v => updateSetting('muted', !v)}/><Toggle label="Background music" description="An original, synthesized deep-space sequence" checked={settings.music} onChange={v => updateSetting('music', v)}/><label className="volume-row"><span>Master volume <b>{Math.round(settings.volume * 100)}%</b></span><input aria-label="Master volume" type="range" min="0" max="1" step="0.01" value={settings.volume} onChange={e => updateSetting('volume', Number(e.target.value))}/></label><Toggle label="Reduced motion" description="Disable camera shake and background star travel" checked={settings.reducedMotion} onChange={v => updateSetting('reducedMotion', v)}/><Toggle label="Auto-fire" description="Always fire while flying. Just focus on movement." checked={settings.autoFire} onChange={v => updateSetting('autoFire', v)}/><p className="storage-note">{stored ? 'Preferences stored on this browser.' : 'Browser storage is unavailable. Changes last for this session only.'}</p><button className="secondary-button full-width" onClick={() => setDialog(null)}>{screen === 'game' ? 'Back to pause menu' : 'Back to flight deck'}</button></Modal>}
    {dialog === 'scores' && <Modal title="The flight log" eyebrow="LOCAL HIGH SCORES" onClose={() => setDialog(null)} className="scores-modal"><p className="modal-intro">Your ten best runs. Every point earned in the void.</p>{scores.length ? <div className="score-table-wrap"><table className="score-table"><thead><tr><th>RANK</th><th>SCORE</th><th>WAVE</th><th>TIME</th><th>DATE</th></tr></thead><tbody>{scores.map((entry, i) => <tr key={entry.id}><td><span className={i === 0 ? 'rank-first' : ''}>{String(i + 1).padStart(2, '0')}</span></td><td>{entry.score.toLocaleString()}</td><td>{entry.wave}</td><td>{formatTime(entry.time)}</td><td>{new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td></tr>)}</tbody></table></div> : <div className="empty-log"><Icon name="trophy" size={40}/><h3>History starts with you.</h3><p>Complete your first mission to leave a mark.</p></div>}<p className="storage-note">Saved on this device. No account, no network, just you.</p><button className="primary-button full-width" onClick={start}>Make your mark <Icon name="arrow" size={18}/></button></Modal>}
    {screen === 'game' && paused && !isOver && !dialog && <Modal title="Take a breath, pilot." eyebrow="MISSION PAUSED" onClose={resume}><p className="modal-intro">The stars can wait. Your mission is right where you left it.</p><div className="pause-stats"><div><span>WAVE</span><b>{String(stats?.wave ?? 1).padStart(2, '0')}</b></div><div><span>SCORE</span><b>{(stats?.score ?? 0).toLocaleString()}</b></div><div><span>SURVIVED</span><b>{formatTime(stats?.time ?? 0)}</b></div></div><div className="modal-actions"><button className="primary-button full-width" onClick={resume}><Icon name="play" size={17}/> Resume mission <kbd>ESC</kbd></button><button className="secondary-button full-width" onClick={start}>Restart mission</button><button className="secondary-button full-width" onClick={() => setDialog('settings')}>Settings & audio</button><button className="quiet-button" onClick={home}>Return to main menu</button></div></Modal>}
    {isOver && stats && <Modal title="A signal. Then silence." eyebrow="MISSION COMPLETE // SIGNAL LOST" className="gameover-modal"><p className="modal-intro">You held the line. The void will remember.</p><div className="final-score"><span>FINAL SCORE</span><strong>{scoreText(stats.score)}</strong>{scores[0]?.id === runId.current && stats.score > 0 && <span className="new-best"><Icon name="trophy" size={13}/> NEW PERSONAL BEST</span>}</div><div className="pause-stats"><div><span>ELIMINATIONS</span><b>{stats.kills}</b></div><div><span>WAVE REACHED</span><b>{String(stats.wave).padStart(2, '0')}</b></div><div><span>SURVIVED</span><b>{formatTime(stats.time)}</b></div></div><RunDetails stats={stats}/><p className="storage-note">{stored ? 'Flight data saved to your local high scores.' : 'Local storage unavailable. This run could not be saved.'}</p><div className="modal-actions"><button className="primary-button full-width" onClick={start}>Play again <Icon name="arrow" size={18}/></button><button className="secondary-button full-width" onClick={home}>Main menu</button></div></Modal>}
  </div>;
}
