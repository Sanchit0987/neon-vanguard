// Real Chromium smoke tests. Start `npm run dev` first; optional URL argument.
// ?e2e exposes a fixture hook ONLY in Vite development mode. Production has no hook.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const base = process.argv[2] || 'http://localhost:5173';
const output = fileURLToPath(new URL('../artifacts/qa/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(10000);
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
const read = expression => page.evaluate(expression);
const wait = ms => page.waitForTimeout(ms);
try {
  await page.goto(`${base}/?e2e`);
  await check('main menu, original Canvas artwork, no overflow', async () => {
    await page.getByRole('heading', { name: /THE VOID/ }).waitFor();
    await wait(350);
    assert.equal(await page.locator('.hero-canvas').count(), 1);
    assert(await read(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${output}desktop-menu.png`, fullPage: true });
  });
  await check('field manual opens, controls and all power-ups documented', async () => {
    await page.getByRole('button', { name: /How to play/ }).click();
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.locator('.power-guide > div').count(), 4);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
  });
  await check('settings persist across reload', async () => {
    await page.getByRole('button', { name: /Settings/ }).click();
    await page.getByText('Auto-fire', { exact: true }).click();
    await page.getByText('Audio enabled', { exact: true }).click();
    await page.getByRole('button', { name: 'Back to flight deck' }).click();
    await page.reload();
    assert.equal(await read(() => JSON.parse(localStorage.getItem('neon-vanguard.settings.v1')).autoFire), true);
    await page.getByRole('button', { name: /Settings/ }).click();
    assert.equal(await page.getByLabel('Auto-fire').isChecked(), true);
    await page.getByText('Auto-fire', { exact: true }).click();
    await page.getByRole('button', { name: 'Back to flight deck' }).click();
  });
  await check('launch creates active game loop and progressing timer', async () => {
    await page.getByRole('button', { name: /Launch mission/ }).click();
    await page.locator('.game-canvas').waitFor();
    await page.waitForFunction(() => window.__NEON_TEST__?.time > 0.15);
    assert.equal(await read(() => window.__NEON_TEST__.phase), 'playing');
  });
  await check('WASD / arrow movement and no browser scrolling', async () => {
    const x = await read(() => window.__NEON_TEST__.player.x);
    await page.keyboard.down('d'); await wait(220); await page.keyboard.up('d');
    assert((await read(() => window.__NEON_TEST__.player.x)) > x + 40);
    const y = await read(() => window.__NEON_TEST__.player.y);
    await page.keyboard.down('ArrowUp'); await wait(220); await page.keyboard.up('ArrowUp');
    assert((await read(() => window.__NEON_TEST__.player.y)) < y - 40);
    assert.equal(await read(() => window.scrollY), 0);
  });
  await check('Space and mouse both fire actual moving projectiles', async () => {
    await page.keyboard.down('Space'); await wait(150); await page.keyboard.up('Space');
    assert(await read(() => window.__NEON_TEST__.bullets.some(b => !b.hostile)));
    const arena = await page.locator('.game-canvas').boundingBox();
    await page.mouse.move(arena.x + arena.width * 0.8, arena.y + arena.height * 0.2);
    await page.mouse.down(); await wait(200); await page.mouse.up();
    assert(await read(() => window.__NEON_TEST__.bullets.some(b => !b.hostile && b.vx > 50)));
  });
  await check('pause freezes simulation; resume restores keyboard focus', async () => {
    await page.getByRole('button', { name: 'Pause game' }).click();
    await page.getByRole('heading', { name: 'Take a breath, pilot.' }).waitFor();
    const time = await read(() => window.__NEON_TEST__.time);
    await wait(300); assert.equal(await read(() => window.__NEON_TEST__.time), time);
    await page.screenshot({ path: `${output}pause.png` });
    await page.getByRole('button', { name: /Resume mission/ }).click();
    await wait(80);
    await read(() => { window.__NEON_TEST__.bullets = []; });
    await page.keyboard.down('Space'); await wait(130); await page.keyboard.up('Space');
    assert(await read(() => window.__NEON_TEST__.bullets.some(b => !b.hostile)));
  });
  await check('P shortcut resumes cleanly and window blur auto-pauses', async () => {
    await page.keyboard.press('p');
    await page.getByRole('heading', { name: 'Take a breath, pilot.' }).waitFor();
    await page.keyboard.press('p'); await wait(100);
    assert.equal(await read(() => window.__NEON_TEST__.phase), 'playing');
    assert.equal(await read(() => document.activeElement?.tagName), 'CANVAS');
    await read(() => window.dispatchEvent(new Event('blur')));
    await page.getByRole('heading', { name: 'Take a breath, pilot.' }).waitFor();
    await page.keyboard.press('Escape'); await wait(100);
    assert.equal(await read(() => window.__NEON_TEST__.phase), 'playing');
  });
  await check('restart clears mission statistics and restores hull', async () => {
    await read(() => { window.__NEON_TEST__.score = 9123; window.__NEON_TEST__.player.hp = 30; });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Restart mission' }).click();
    assert.equal(await read(() => window.__NEON_TEST__.score), 0);
    assert.equal(await read(() => window.__NEON_TEST__.player.hp), 100);
  });
  await check('live collisions damage hull and pickups apply upgrades', async () => {
    await read(() => {
      const g = window.__NEON_TEST__, p = g.player; p.invulnerable = 0; p.shieldHp = 0; p.shieldDelay = 4;
      g.bullets.push({ id: 9999, x: p.x, y: p.y - 16, px: p.x, py: p.y - 16, vx: 0, vy: 180, r: 5, damage: 17, hostile: true, life: 3, color: '#ff747e' });
    });
    await page.waitForFunction(() => window.__NEON_TEST__.player.hp === 83);
    await read(() => { const g = window.__NEON_TEST__; g.pickups.push({ id: 10000, x: g.player.x, y: g.player.y, kind: 'multi', r: 17, age: 0 }); });
    await page.locator('.power-chip.multi').waitFor();
    assert((await read(() => window.__NEON_TEST__.player.multi)) > 10);
  });
  await check('boss wave, health bar, enemy fire, and phase two', async () => {
    await read(() => { const g = window.__NEON_TEST__; g.wave = 4; g.enemies = []; g.phase = 'upgrade'; g.continueMission(); g.player.invulnerable = 100; });
    await page.waitForFunction(() => window.__NEON_TEST__.enemies.some(e => e.kind === 'boss'), { timeout: 8000 });
    await page.locator('.boss-hud').waitFor();
    await wait(2100);
    assert(await read(() => window.__NEON_TEST__.bullets.some(b => b.hostile)));
    await read(() => { const b = window.__NEON_TEST__.enemies.find(e => e.kind === 'boss'); b.hp = b.maxHp * 0.4; });
    await page.getByText('ENRAGED · PHASE II').waitFor();
    await page.screenshot({ path: `${output}desktop-boss.png` });
  });
  await check('three lost lives trigger game over and one saved high score', async () => {
    await read(() => { const g = window.__NEON_TEST__; g.score = 4210; g.kills = 19; for (let i = 0; i < 3; i++) { g.player.invulnerable = 0; g.player.shield = 0; g.player.shieldHp = 0; g.damagePlayer(100); } });
    await page.getByRole('heading', { name: 'A signal. Then silence.' }).waitFor();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('neon-vanguard.scores.v1') || '[]').length === 1);
    assert.equal(await read(() => JSON.parse(localStorage.getItem('neon-vanguard.scores.v1'))[0].score), 4210);
    await page.screenshot({ path: `${output}game-over.png` });
  });
  await check('play again starts clean; returning home cleans up the engine', async () => {
    await page.getByRole('button', { name: 'Play again' }).click();
    assert.equal(await read(() => window.__NEON_TEST__.wave), 1);
    assert.equal(await read(() => window.__NEON_TEST__.player.lives), 3);
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Return to main menu' }).click();
    assert.equal(await read(() => typeof window.__NEON_TEST__), 'undefined');
    assert.equal(await read(() => document.body.style.overflow), '');
    await page.getByRole('button', { name: /^High scores/ }).click();
    await page.getByRole('cell', { name: '4,210', exact: true }).waitFor();
    await page.reload();
    assert.equal(await read(() => JSON.parse(localStorage.getItem('neon-vanguard.scores.v1')).length), 1);
  });
  await check('mobile portrait layout and real multi-touch move/fire', async () => {
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const mobile = await mobileContext.newPage(); mobile.on('pageerror', e => errors.push(e.message));
    await mobile.goto(`${base}/?e2e`); await mobile.getByRole('button', { name: /Launch mission/ }).waitFor();
    assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await mobile.screenshot({ path: `${output}mobile-menu.png`, fullPage: true });
    await mobile.getByRole('button', { name: /Launch mission/ }).tap();
    await mobile.locator('.joystick').waitFor(); await mobile.waitForTimeout(100);
    const x = await mobile.evaluate(() => window.__NEON_TEST__.player.x);
    const stick = await mobile.locator('.joystick').boundingBox(), fire = await mobile.locator('.fire-button').boundingBox();
    const cdp = await mobileContext.newCDPSession(mobile);
    const touches = [{ x: stick.x + stick.width / 2 + 31, y: stick.y + stick.height / 2, id: 1 }, { x: fire.x + fire.width / 2, y: fire.y + fire.height / 2, id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches });
    await mobile.waitForTimeout(300);
    assert((await mobile.evaluate(() => window.__NEON_TEST__.player.x)) > x + 35);
    assert(await mobile.evaluate(() => window.__NEON_TEST__.bullets.some(b => !b.hostile)));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const stoppedX = await mobile.evaluate(() => window.__NEON_TEST__.player.x);
    await mobile.waitForTimeout(150); assert.equal(await mobile.evaluate(() => window.__NEON_TEST__.player.x), stoppedX);
    assert.equal(await mobile.evaluate(() => window.scrollY), 0);
    await mobile.screenshot({ path: `${output}mobile-game.png` });
    await mobile.getByRole('button', { name: 'Pause game' }).tap();
    await mobile.getByRole('heading', { name: 'Take a breath, pilot.' }).waitFor();
    await mobile.getByRole('button', { name: /Resume mission/ }).tap();
    await mobile.setViewportSize({ width: 844, height: 390 }); await mobile.waitForTimeout(200);
    assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await mobile.screenshot({ path: `${output}mobile-landscape.png` });
    await mobileContext.close();
  });
  await check('no uncaught browser errors', async () => assert.deepEqual(errors, []));
  console.log(`\n${passed} browser checks passed. Screenshots: artifacts/qa/`);
} catch (error) {
  console.error(error);
  await page.screenshot({ path: `${output}failure.png`, fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally { await browser.close(); }
