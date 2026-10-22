import type { SoundKind } from './engine';
import type { Settings } from './storage';

// No downloaded assets: every effect and musical voice is synthesized locally.
export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private settings: Settings | null = null;
  private active = false;
  private step = 0;
  private nextNote = 0;
  private lastShot = 0;
  private voices = 0;
  private lastEffect: Partial<Record<SoundKind, number>> = {};
  unlock() {
    try {
      if (!this.context) {
        this.context = new AudioContext(); this.master = this.context.createGain(); this.master.connect(this.context.destination);
        this.musicGain = this.context.createGain(); this.musicGain.connect(this.master);
      }
      void this.context.resume().catch(() => {});
      if (this.settings) this.configure(this.settings);
    } catch { /* Play remains available when audio is blocked or unsupported. */ }
  }
  configure(settings: Settings) {
    this.settings = settings;
    if (this.context && this.master) this.master.gain.setTargetAtTime(settings.muted ? 0 : settings.volume * 0.45, this.context.currentTime, 0.03);
    this.syncMusic();
  }
  setActive(active: boolean) { this.active = active; this.syncMusic(); }
  private tone(frequency: number, endFrequency: number, duration: number, type: OscillatorType, volume: number, when?: number, music = false) {
    if (!this.context || !this.master || this.voices >= 48) return;
    const c = this.context, start = when ?? c.currentTime;
    const oscillator = c.createOscillator(), gain = c.createGain(); this.voices++;
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(volume, start + 0.009); gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain); gain.connect(music && this.musicGain ? this.musicGain : this.master); oscillator.start(start); oscillator.stop(start + duration + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.voices = Math.max(0, this.voices - 1); };
  }
  play(kind: SoundKind) {
    if (!this.context || this.settings?.muted) return;
    const now = this.context.currentTime;
    if (now - (this.lastEffect[kind] ?? -1) < (kind === 'hit' ? 0.06 : kind === 'explosion' ? 0.05 : 0.025)) return;
    this.lastEffect[kind] = now;
    if (kind === 'shot') { if (this.context.currentTime - this.lastShot < 0.055) return; this.lastShot = this.context.currentTime; this.tone(1100, 260, 0.09, 'triangle', 0.14); }
    else if (kind === 'hit') this.tone(230, 80, 0.045, 'square', 0.035);
    else if (kind === 'explosion') { this.tone(85, 23, 0.38, 'sawtooth', 0.3); this.tone(190, 35, 0.17, 'triangle', 0.15); }
    else if (kind === 'hurt') this.tone(160, 40, 0.23, 'sawtooth', 0.2);
    else if (kind === 'pickup') { this.tone(523, 784, 0.13, 'sine', 0.28); this.tone(784, 1046, 0.22, 'sine', 0.22, this.context.currentTime + 0.1); }
    else if (kind === 'boss') { this.tone(110, 55, 0.9, 'sawtooth', 0.16); this.tone(113, 58, 0.9, 'triangle', 0.2); }
    else if (kind === 'boost') { this.tone(90, 850, 0.26, 'sawtooth', 0.12); this.tone(330, 110, 0.32, 'triangle', 0.16); }
    else if (kind === 'missile') this.tone(100, 480, 0.28, 'sawtooth', 0.12);
    else if (kind === 'laser') { this.tone(1600, 130, 0.35, 'sawtooth', 0.13); this.tone(75, 35, 0.3, 'sine', 0.2); }
    else if (kind === 'shieldHit') this.tone(680, 320, 0.13, 'sine', 0.16);
    else if (kind === 'critical') this.tone(1350, 780, 0.1, 'triangle', 0.1);
    else if (kind === 'upgrade' || kind === 'combo' || kind === 'achievement' || kind === 'victory') {
      const notes = kind === 'victory' ? [261.63, 329.63, 392, 523.25, 783.99] : kind === 'combo' ? [660, 880] : [440, 554.37, 659.25];
      notes.forEach((note, i) => this.tone(note, note, 0.3, 'sine', 0.16, this.context!.currentTime + i * 0.1));
      if (kind === 'victory') this.tone(65, 25, 1, 'sawtooth', 0.24);
    }
    else this.tone(330, 660, 0.35, 'sine', 0.16);
  }
  private syncMusic() {
    const enabled = this.active && this.settings?.music && !this.settings?.muted && this.context;
    if (this.context && this.musicGain) this.musicGain.gain.setTargetAtTime(enabled ? 1 : 0, this.context.currentTime, 0.08);
    if (!enabled) { if (this.timer) clearInterval(this.timer); this.timer = null; return; }
    if (this.timer || !this.context) return;
    this.nextNote = this.context.currentTime + 0.08;
    const sequence = [220, 329.63, 440, 523.25, 220, 329.63, 392, 293.66, 174.61, 261.63, 349.23, 440, 196, 293.66, 392, 493.88];
    this.timer = setInterval(() => {
      if (!this.context) return;
      if (this.nextNote < this.context.currentTime) this.nextNote = this.context.currentTime + 0.03;
      while (this.nextNote < this.context.currentTime + 0.15) {
        const note = sequence[this.step % sequence.length];
        this.tone(note, note, 0.42, 'sine', 0.075, this.nextNote, true);
        if (this.step % 4 === 0) this.tone(note / 4, note / 4, 0.9, 'triangle', 0.12, this.nextNote, true);
        this.step++; this.nextNote += 0.225;
      }
    }, 70);
  }
  destroy() { if (this.timer) clearInterval(this.timer); this.timer = null; void this.context?.close().catch(() => {}); this.context = null; this.master = null; this.musicGain = null; }
}
