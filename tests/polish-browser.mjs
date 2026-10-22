// Targeted post-expansion input/lifecycle regression checks in real Chrome.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const base = process.argv[2] || 'http://localhost:5173';
const output = fileURLToPath(new URL('../artifacts/qa/polish/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
const errors = []; let passed = 0;
const check = async (name, fn) => { await fn(); console.log(`PASS ${name}`); passed++; };
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', error => errors.push(error.message));
page.setDefaultTimeout(10000);
try {
  await page.goto(`${base}/?e2e`); await page.getByRole('button', { name: /Launch mission/ }).click();
  await page.waitForFunction(() => window.__NEON_TEST__?.time > .1);
  await page.evaluate(() => { const g = window.__NEON_TEST__; g.spawnTimer = 100; g.player.invulnerable = 100; });
  await check('rapid same-turn pause toggles keep React and the live engine synchronized', async () => {
    await page.evaluate(() => { for (let i=0;i<2;i++) window.dispatchEvent(new KeyboardEvent('keydown', { code:'KeyP', bubbles:true })); });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__NEON_TEST__.phase), 'playing');
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.keyboard.press('p'); await page.getByRole('heading', { name:'Take a breath, pilot.' }).waitFor();
    await page.keyboard.press('p'); await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__NEON_TEST__.phase), 'playing');
  });
  await check('held Escape cannot dismiss the pause menu through repeat events', async () => {
    await page.keyboard.down('Escape'); await page.getByRole('heading', { name:'Take a breath, pilot.' }).waitFor();
    const time = await page.evaluate(() => window.__NEON_TEST__.time);
    for (let i=0;i<3;i++) await page.keyboard.down('Escape');
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.__NEON_TEST__.phase), 'paused');
    assert.equal(await page.evaluate(() => window.__NEON_TEST__.time), time);
    await page.keyboard.up('Escape'); await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__NEON_TEST__.phase === 'playing');
  });
  await check('duplicate blur signals only pause once, with no stuck movement on resume', async () => {
    await page.keyboard.down('d'); await page.waitForTimeout(70);
    await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('blur')); });
    await page.getByRole('heading', { name:'Take a breath, pilot.' }).waitFor(); await page.keyboard.up('d');
    await page.getByRole('button', { name:/Resume mission/ }).click(); await page.waitForTimeout(70);
    const x = await page.evaluate(() => window.__NEON_TEST__.player.x); await page.waitForTimeout(180);
    assert.equal(await page.evaluate(() => window.__NEON_TEST__.player.x), x);
  });
  const mobileContext = await browser.newContext({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true, deviceScaleFactor:2 });
  const mobile = await mobileContext.newPage(); mobile.on('pageerror', e => errors.push(e.message));
  await mobile.goto(`${base}/?e2e`); await mobile.getByRole('button', { name:/Launch mission/ }).tap();
  await mobile.waitForFunction(() => window.__NEON_TEST__?.time > .1);
  await mobile.evaluate(() => { window.__NEON_TEST__.spawnTimer = 100; window.__NEON_TEST__.player.invulnerable = 100; });
  const cdp = await mobileContext.newCDPSession(mobile);
  const laser = mobile.getByRole('button', { name:'Hold and release laser' });
  const box = await laser.boundingBox();
  const touch = { x:box.x+box.width/2, y:box.y+box.height/2, id:1 };
  await check('touch buttons show locked, ready, and live cooldown states', async () => {
    assert.equal(await mobile.locator('#ability-missile-status').textContent(), 'LOCKED');
    await mobile.getByRole('button', { name:'Launch missile', exact:true }).tap();
    await mobile.getByRole('status').filter({hasText:/SEEKER LOCKED/}).waitFor();
    await mobile.getByRole('button', { name:'Boost', exact:true }).tap();
    await mobile.locator('.ability-button.boost[data-state="cooldown"]').waitFor();
    assert.match(await mobile.locator('#ability-boost-status').textContent(), /s$/);
    await mobile.evaluate(() => { window.__NEON_TEST__.upgrades.missile = 1; });
    await mobile.locator('.ability-button.missile[data-state="ready"]').waitFor();
  });
  await check('canceled charge never fires a laser or spends its cooldown', async () => {
    await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[touch]});
    await mobile.waitForFunction(() => window.__NEON_TEST__.player.charge > .45);
    await mobile.locator('.ability-button.charge[data-state="charging"]').waitFor();
    await cdp.send('Input.dispatchTouchEvent', {type:'touchCancel',touchPoints:[]});
    await mobile.waitForTimeout(150);
    assert.equal(await mobile.evaluate(() => window.__NEON_TEST__.player.charge),0);
    assert.equal(await mobile.evaluate(() => window.__NEON_TEST__.player.laserCooldown),0);
    assert.equal(await mobile.evaluate(() => window.__NEON_TEST__.beams.filter(b=>!b.hostile).length),0);
  });
  await check('lifting a second finger does not release the first finger’s charge', async () => {
    await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[touch]});
    await mobile.waitForFunction(() => window.__NEON_TEST__.player.charge > .2);
    await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[touch,{...touch,x:touch.x+3,id:2}]});
    // CDP's partial touchEnd identifies the contact being lifted, not those retained.
    await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[{...touch,x:touch.x+3,id:2}]});
    await mobile.waitForFunction(() => window.__NEON_TEST__.player.charge > .65);
    assert.equal(await mobile.evaluate(() => window.__NEON_TEST__.player.laserCooldown),0);
    await mobile.screenshot({path:`${output}touch-charge-feedback.png`});
    await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
    await mobile.waitForFunction(() => window.__NEON_TEST__.player.laserCooldown > 2);
    await mobile.locator('.ability-button.charge[data-state="cooldown"]').waitFor();
  });
  await check('paused touch gestures are cleared, and canceled ownership never drifts on resume', async () => {
    const stick=await mobile.locator('.joystick').boundingBox();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:stick.x+stick.width/2+25,y:stick.y+stick.height/2,id:1}]});
    await mobile.waitForTimeout(100); await mobile.evaluate(()=>window.dispatchEvent(new Event('blur')));
    await mobile.getByRole('heading',{name:'Take a breath, pilot.'}).waitFor();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await mobile.getByRole('button',{name:/Resume mission/}).tap(); await mobile.waitForTimeout(100);
    const x=await mobile.evaluate(()=>window.__NEON_TEST__.player.x);await mobile.waitForTimeout(200);
    assert.equal(await mobile.evaluate(()=>window.__NEON_TEST__.player.x),x);
    assert.equal(await mobile.locator('.joystick-knob').evaluate(e=>e.style.transform),'translate(0px, 0px)');
    await mobile.setViewportSize({width:844,height:390});await mobile.waitForTimeout(150);
    for (const button of await mobile.locator('.ability-button').all()) {
      const b=await button.boundingBox(); assert(b.x>=0 && b.y>=0 && b.x+b.width<=844 && b.y+b.height<=390);
    }
    await mobile.screenshot({path:`${output}landscape-cooldowns.png`});
  });
  await mobileContext.close();
  await check('no uncaught browser errors in the polish suite', async()=>assert.deepEqual(errors,[]));
  console.log(`\n${passed} polish browser checks passed.`);
} catch(error) {console.error(error);await page.screenshot({path:`${output}failure.png`}).catch(()=>{});process.exitCode=1;}
finally {await browser.close();}
