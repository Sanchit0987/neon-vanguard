import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { GameEngine, emptyInput, clamp } from '../game/engine';
import type { Snapshot } from '../game/engine';
import { Renderer } from '../game/render';
import type { Settings } from '../game/storage';
import type { AudioManager } from '../game/audio';
import type { ShipId } from '../game/catalog';

interface Props { paused: boolean; settings: Settings; audio: AudioManager; onSnapshot: (s: Snapshot) => void; onPause: (paused?: boolean) => void; onMute: () => void; onReady: () => void; ship: ShipId; controller: { current: GameEngine | null }; inputBlocked: boolean; status: Snapshot | null }
type Ability = 'boost' | 'missile' | 'charge';
const controlKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space', 'Escape', 'KeyP', 'KeyM', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE']);
export default function GameCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const inputRef = useRef(emptyInput());
  const latest = useRef(props); latest.current = props;
  const stickPointer = useRef<number | null>(null), firePointer = useRef<number | null>(null);
  const abilityPointers = useRef<Record<Ability, number | null>>({ boost: null, missile: null, charge: null });
  const knob = useRef<HTMLSpanElement>(null);
  const clearInput = () => {
    inputRef.current = emptyInput(); stickPointer.current = null; firePointer.current = null;
    abilityPointers.current = { boost: null, missile: null, charge: null };
    engineRef.current?.cancelActions();
    if (knob.current) knob.current.style.transform = 'translate(0px, 0px)';
  };
  useEffect(() => { if (props.paused || props.inputBlocked) clearInput(); }, [props.paused, props.inputBlocked]);
  useEffect(() => {
    const engine = engineRef.current;
    if (props.paused) { engine?.pause(); inputRef.current = emptyInput(); }
    else { engine?.resume(); if (engine) canvasRef.current?.focus({ preventScroll: true }); }
    if (engine) props.onSnapshot(engine.snapshot());
  }, [props.paused]); // Callbacks are read from latest in the long-lived loop.
  useEffect(() => {
    const canvas = canvasRef.current!, context = canvas.getContext('2d', { alpha: false });
    if (!context) { latest.current.onReady(); return; }
    const game = new GameEngine(); engineRef.current = game; latest.current.controller.current = game;
    const renderer = new Renderer(context);
    let frame = 0, lastTime = 0, lastHud = 0, previousPhase = game.phase, ready = false;
    const resize = () => {
      const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
      const ratio = rect.width / rect.height, width = Math.max(480, 800 * ratio), height = width / ratio;
      game.resize(width, height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
      context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize(); game.start(latest.current.ship);
    if (latest.current.paused) game.pause();
    // Opt-in, development-only test harness; never present in a production build.
    const testing = import.meta.env.DEV && new URLSearchParams(location.search).has('e2e');
    if (testing) (window as unknown as { __NEON_TEST__: GameEngine }).__NEON_TEST__ = game;
    latest.current.onSnapshot(game.snapshot()); canvas.focus({ preventScroll: true });
    const animate = (now: number) => {
      const delta = lastTime ? (now - lastTime) / 1000 : 0; lastTime = now;
      const current = latest.current, input = inputRef.current;
      const effectiveInput = current.settings.autoFire ? { ...input, fire: true } : input;
      if (!current.inputBlocked) game.update(delta, effectiveInput);
      if (game.phase !== previousPhase) {
        if (game.phase !== 'playing') clearInput();
        else canvas.focus({ preventScroll: true });
      }
      for (const event of game.drainEvents()) current.audio.play(event.kind);
      renderer.draw(game, now / 1000, current.settings.reducedMotion);
      if (!ready) { ready = true; current.onReady(); }
      if (now - lastHud >= 80 || game.phase !== previousPhase) { current.onSnapshot(game.snapshot()); lastHud = now; }
      previousPhase = game.phase;
      frame = requestAnimationFrame(animate);
    };
    const keydown = (event: KeyboardEvent) => {
      if (!controlKeys.has(event.code)) return;
      if (latest.current.inputBlocked || !['playing', 'paused'].includes(game.phase)) return;
      if (event.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
      if (event.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName) && event.code === 'Space') return;
      event.preventDefault();
      if (!event.repeat && (event.code === 'Escape' || event.code === 'KeyP')) { clearInput(); latest.current.onPause(game.phase === 'playing'); return; }
      if (!event.repeat && event.code === 'KeyM') { latest.current.onMute(); return; }
      if (game.phase === 'playing' && !latest.current.paused) {
        inputRef.current.keys.add(event.code);
        // Discrete activation on down prevents very short taps falling between RAFs.
        if (!event.repeat && event.code === 'KeyQ') { if (!game.launchMissile() && !game.upgrades.missile) game.notify('SEEKER LOCKED // INSTALL A LAUNCHER AT THE REFIT DOCK'); }
        if (!event.repeat && event.code.startsWith('Shift')) game.boostFromInput(inputRef.current);
        if (!event.repeat && event.code === 'Space') game.fireOnce(inputRef.current.aim);
      }
    };
    const keyup = (event: KeyboardEvent) => { inputRef.current.keys.delete(event.code); };
    const aim = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      const rect = canvas.getBoundingClientRect(); inputRef.current.aim = { x: (event.clientX - rect.left) / rect.width * game.width, y: (event.clientY - rect.top) / rect.height * game.height };
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || event.pointerType === 'touch' || game.phase !== 'playing' || latest.current.inputBlocked) return;
      event.preventDefault(); canvas.focus({ preventScroll: true }); aim(event); inputRef.current.fire = true; game.fireOnce(inputRef.current.aim); canvas.setPointerCapture(event.pointerId); latest.current.audio.unlock();
    };
    const up = (event: PointerEvent) => { if (event.pointerType !== 'touch') inputRef.current.fire = false; };
    const leave = () => { if (!inputRef.current.fire) inputRef.current.aim = null; };
    const suspend = () => { clearInput(); if (game.phase === 'playing') { game.pause(); latest.current.onPause(true); } };
    const visibility = () => { if (document.hidden) suspend(); lastTime = 0; };
    const noMenu = (event: Event) => event.preventDefault();
    window.addEventListener('keydown', keydown, { passive: false }); window.addEventListener('keyup', keyup);
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); window.addEventListener('blur', suspend);
    document.addEventListener('visibilitychange', visibility);
    canvas.addEventListener('pointermove', aim); canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointerleave', leave); canvas.addEventListener('contextmenu', noMenu);
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); clearInput(); engineRef.current = null; latest.current.controller.current = null;
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('blur', suspend);
      document.removeEventListener('visibilitychange', visibility);
      canvas.removeEventListener('pointermove', aim); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointerleave', leave); canvas.removeEventListener('contextmenu', noMenu);
      if (testing) delete (window as unknown as { __NEON_TEST__?: GameEngine }).__NEON_TEST__;
    };
  }, []);
  const updateStick = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    let x = (event.clientX - rect.left - rect.width / 2) / 37, y = (event.clientY - rect.top - rect.height / 2) / 37;
    const distance = Math.hypot(x, y); if (distance > 1) { x /= distance; y /= distance; }
    inputRef.current.touch = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
    if (knob.current) knob.current.style.transform = `translate(${x * 29}px, ${y * 29}px)`;
  };
  const resetStick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (stickPointer.current !== event.pointerId) return;
    stickPointer.current = null; inputRef.current.touch = { x: 0, y: 0 }; if (knob.current) knob.current.style.transform = 'translate(0px, 0px)';
  };
  const resetFire = (event: ReactPointerEvent<HTMLButtonElement>) => { if (firePointer.current === event.pointerId) { firePointer.current = null; inputRef.current.touchFire = false; } };
  const abilityDown = (kind: Ability, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault(); if (engineRef.current?.phase !== 'playing' || latest.current.inputBlocked || latest.current.paused || abilityPointers.current[kind] !== null) return;
    abilityPointers.current[kind] = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId); inputRef.current[kind] = true; latest.current.audio.unlock();
    if (kind === 'boost') engineRef.current.boostFromInput(inputRef.current);
    if (kind === 'missile' && !engineRef.current.launchMissile() && !engineRef.current.upgrades.missile) engineRef.current.notify('SEEKER LOCKED // INSTALL A LAUNCHER AT THE REFIT DOCK');
  };
  const abilityUp = (kind: Ability, event: ReactPointerEvent<HTMLButtonElement>, canceled = false) => {
    if (abilityPointers.current[kind] !== event.pointerId) return;
    abilityPointers.current[kind] = null; inputRef.current[kind] = false;
    // Browser gesture cancellation is not an intentional laser release. Capture
    // loss after a normal pointerup is ignored because its owner was cleared.
    if (kind === 'charge' && canceled) engineRef.current?.cancelCharge();
  };
  const abilityStatus = (kind: Ability) => {
    const s = props.status;
    if (kind === 'missile' && !s?.missileLevel) return { label: 'LOCKED', state: 'locked', progress: 0 };
    if (kind === 'charge' && (s?.charge ?? 0) > 0) return { label: `${Math.round(s!.charge * 100)}%`, state: 'charging', progress: s!.charge };
    const cooldown = kind === 'boost' ? s?.boostSeconds ?? 0 : kind === 'missile' ? s?.missileCooldown ?? 0 : s?.laserCooldown ?? 0;
    const progress = kind === 'boost' ? s?.boost ?? 1 : 1 - cooldown / (kind === 'missile' ? 2.5 : 2.4);
    return { label: cooldown > 0 ? `${cooldown.toFixed(1)}s` : kind === 'charge' ? 'HOLD' : 'READY', state: cooldown > 0 ? 'cooldown' : 'ready', progress };
  };
  return <>
    <canvas ref={canvasRef} tabIndex={0} className="game-canvas" aria-label="Space shooter arena. WASD or arrows move, mouse or Space fires, Shift boosts, Q launches missiles, hold and release E for a laser, Escape pauses." />
    <div className="touch-controls">
      <div className="joystick" aria-label="Drag to move" onPointerDown={e => { if (stickPointer.current !== null || engineRef.current?.phase !== 'playing' || latest.current.inputBlocked || latest.current.paused) return; stickPointer.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); updateStick(e); }} onPointerMove={e => { if (stickPointer.current === e.pointerId) updateStick(e); }} onPointerUp={resetStick} onPointerCancel={resetStick} onLostPointerCapture={resetStick}>
        <span className="joystick-axis" /><span ref={knob} className="joystick-knob" /><span className="touch-label">MOVE</span>
      </div>
      <div className="touch-abilities">{(['boost', 'missile', 'charge'] as const).map(kind => {
        const status = abilityStatus(kind);
        return <button key={kind} className={`ability-button ${kind}`} data-state={status.state} aria-label={kind === 'charge' ? 'Hold and release laser' : kind === 'boost' ? 'Boost' : 'Launch missile'} aria-describedby={`ability-${kind}-status`} onPointerDown={e => abilityDown(kind, e)} onPointerUp={e => abilityUp(kind, e)} onPointerCancel={e => abilityUp(kind, e, true)} onLostPointerCapture={e => abilityUp(kind, e, true)}>{kind === 'boost' ? '»' : kind === 'charge' ? 'ϟ' : '⌁'}<span>{kind === 'charge' ? 'LASER' : kind.toUpperCase()}</span><small id={`ability-${kind}-status`}>{status.label}</small><i aria-hidden="true" style={{ width: `${clamp(status.progress, 0, 1) * 100}%` }}/></button>;
      })}</div>
      <button className="fire-button" aria-label="Hold to fire" onPointerDown={e => { e.preventDefault(); if (firePointer.current !== null || engineRef.current?.phase !== 'playing' || latest.current.inputBlocked || latest.current.paused) return; firePointer.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); inputRef.current.touchFire = true; engineRef.current.fireOnce(); latest.current.audio.unlock(); }} onPointerUp={resetFire} onPointerCancel={resetFire} onLostPointerCapture={resetFire}>⌖<span>FIRE</span></button>
    </div>
  </>;
}

export function HeroCanvas({ reducedMotion, ship = 'vanguard' }: { reducedMotion: boolean; ship?: ShipId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!, context = canvas.getContext('2d', { alpha: false }); if (!context) return;
    const renderer = new Renderer(context); let frame = 0, width = 0, height = 0;
    const resize = () => { const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2); width = rect.width; height = rect.height; canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); context.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    const render = (now: number) => { renderer.hero(width, height, now / 1000, reducedMotion, ship); frame = requestAnimationFrame(render); }; frame = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [reducedMotion, ship]);
  return <canvas className="hero-canvas" ref={ref} aria-label="Original VX-01 interceptor floating in deep space" />;
}
