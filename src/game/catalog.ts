// Expansion data stays separate from the existing simulation and render loop.
// All tuning is in logical pixels/seconds; no paid power or external assets.
export type ShipId = 'vanguard' | 'wraith' | 'bastion';
export const SHIPS = {
  vanguard: { name: 'VX–01 Vanguard', role: 'Balanced interceptor', hp: 100, shield: 35, speed: 345, damage: 23, fireRate: 1, boostCooldown: 4, color: '#b0f5db', requirement: 'Available from first launch' },
  wraith: { name: 'VX–02 Wraith', role: 'Agile strike craft', hp: 75, shield: 25, speed: 425, damage: 19, fireRate: 1.18, boostCooldown: 2.8, color: '#9edbff', requirement: 'Eliminate 30 enemies across your runs' },
  bastion: { name: 'VX–03 Bastion', role: 'Heavy assault fighter', hp: 150, shield: 65, speed: 280, damage: 32, fireRate: 0.86, boostCooldown: 5, color: '#e7c291', requirement: 'Defeat your first major boss' },
} as const;
export type UpgradeId = 'damage' | 'firerate' | 'hull' | 'shield' | 'missile' | 'speed';
export const UPGRADES: { id: UpgradeId; name: string; detail: string; glyph: string; cost: number }[] = [
  { id: 'damage', name: 'Overclocked core', detail: '+20% pulse, missile and beam damage.', glyph: '✧', cost: 70 },
  { id: 'firerate', name: 'Pulse accelerator', detail: '+15% fire rate. Stacks up to a safe firing cap.', glyph: 'ϟ', cost: 70 },
  { id: 'hull', name: 'Reinforced hull', detail: '+25 maximum hull and repair 50 integrity.', glyph: '+', cost: 60 },
  { id: 'shield', name: 'Aegis capacitor', detail: '+25 shield capacity, full recharge, faster regeneration.', glyph: '◇', cost: 65 },
  { id: 'missile', name: 'Seeker launcher', detail: 'Unlock Q: homing missiles. Further levels add damage and salvo size.', glyph: '⌁', cost: 85 },
  { id: 'speed', name: 'Vector thrusters', detail: '+10% movement speed and 12% shorter boost cooldown.', glyph: '»', cost: 60 },
];
export const ACHIEVEMENTS: Record<string, { name: string; detail: string }> = {
  firstBlood: { name: 'First contact', detail: 'Eliminate your first hostile.' },
  ace: { name: 'Ace pilot', detail: 'Reach a 10-kill chain in one run.' },
  hunter: { name: 'Dreadnought hunter', detail: 'Defeat a major boss.' },
  storm: { name: 'Storm rider', detail: 'Survive an asteroid storm.' },
  veteran: { name: 'Beyond the frontier', detail: 'Complete wave 10.' },
  collector: { name: 'Salvage specialist', detail: 'Collect 250 credits in one run.' },
};
export const bossPhase = (hp: number, maxHp: number) => hp > maxHp * 0.65 ? 1 : hp > maxHp * 0.3 ? 2 : 3;
export const bossName = (wave: number) => ['DREADNOUGHT', 'ECLIPSE CARRIER', 'VOID SOVEREIGN'][Math.floor(wave / 5 - 1) % 3] ?? 'DREADNOUGHT';
