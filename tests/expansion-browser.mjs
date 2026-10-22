// Expansion integration checks, retaining the original browser regression suite.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const base = process.argv[2] || 'http://localhost:5173';
const output = fileURLToPath(new URL('../artifacts/qa/expansion/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(); page.setDefaultTimeout(10000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
let passed = 0;
const check = async (name, fn) => { await fn(); console.log(`PASS ${name}`); passed++; };
const wait = ms => page.waitForTimeout(ms);
const state = fn => page.evaluate(fn);
try {
  // Legacy records must survive the expansion unchanged.
  await page.goto(`${base}/?e2e`);
  await state(() => { localStorage.setItem('neon-vanguard.scores.v1', JSON.stringify([{ id:'legacy',score:1234,kills:5,wave:3,time:64,date:'2026-10-21T00:00:00Z' }])); });
  await page.reload();
  await check('legacy scores preserved and locked ships cannot be selected', async () => {
    await page.getByRole('button',{name:/Hangar & service record/}).click();
    assert(await page.getByRole('button',{name:'Select VX–02 Wraith'}).isDisabled());
    assert(await page.getByRole('button',{name:'Select VX–03 Bastion'}).isDisabled());
    assert.equal(await state(()=>JSON.parse(localStorage.getItem('neon-vanguard.scores.v1'))[0].score),1234);
    await page.screenshot({path:`${output}hangar-locked.png`});
    await page.getByRole('button',{name:'Return to flight deck'}).click();
  });
  await page.getByRole('button',{name:/Launch mission/}).click();
  await page.waitForFunction(()=>window.__NEON_TEST__?.time>.1);
  await state(()=>{window.__NEON_TEST__.player.invulnerable=100;});
  await check('keyboard boost has real displacement and updates meter',async()=>{
    const x=await state(()=>window.__NEON_TEST__.player.x);
    await page.keyboard.down('d');await page.keyboard.down('Shift');await wait(150);await page.keyboard.up('Shift');await page.keyboard.up('d');
    assert((await state(()=>window.__NEON_TEST__.player.x))>x+100);
    assert((await state(()=>window.__NEON_TEST__.player.boostCooldown))>3);
    assert.match(await page.locator('.boost-meter').textContent(),/s/);
  });
  await check('hold/release E charges and fires a real piercing beam',async()=>{
    await page.keyboard.down('e');await page.waitForFunction(()=>window.__NEON_TEST__.player.charge>.5);
    assert((await state(()=>window.__NEON_TEST__.player.charge))>.4);
    await page.keyboard.up('e');
    await page.waitForFunction(()=>window.__NEON_TEST__.beams.some(b=>!b.hostile));
    assert((await state(()=>window.__NEON_TEST__.player.laserCooldown))>2);
    await page.screenshot({path:`${output}charged-beam.png`});
  });
  await check('pause settings isolate gameplay keys and preserve the running mission',async()=>{
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'Settings & audio'}).click();
    const time=await state(()=>window.__NEON_TEST__.time), x=await state(()=>window.__NEON_TEST__.player.x);
    await page.getByLabel('Master volume').fill('0.3');await page.keyboard.press('p');await page.keyboard.press('q');await page.keyboard.press('Shift');await wait(150);
    assert.equal(await state(()=>window.__NEON_TEST__.time),time);assert.equal(await state(()=>window.__NEON_TEST__.player.x),x);
    await page.getByRole('button',{name:'Back to pause menu'}).click();await page.getByRole('button',{name:/Resume mission/}).click();
    await wait(100);assert.equal(await state(()=>window.__NEON_TEST__.phase),'playing');
  });
  await check('objective completion opens a frozen refit dock with one free upgrade',async()=>{
    await state(()=>{const g=window.__NEON_TEST__;g.wave=2;g.enemies=[];g.bullets=[];g.spawnRemaining=0;g.waveSettled=false;g.objective.kind='target';g.targetKilled=true;g.credits=450;});
    await page.getByRole('heading',{name:'A moment to evolve.'}).waitFor();
    const time=await state(()=>window.__NEON_TEST__.time);
    await wait(250);assert.equal(await state(()=>window.__NEON_TEST__.time),time);
    assert.equal(await state(()=>window.__NEON_TEST__.objective.status),'complete');
    assert.equal(await page.locator('.upgrade-option').count(),6);
    const credits=await state(()=>window.__NEON_TEST__.credits);
    await page.getByRole('button',{name:'Install Overclocked core'}).click();
    assert.equal(await state(()=>window.__NEON_TEST__.credits),credits);
    assert.equal(await state(()=>window.__NEON_TEST__.upgrades.damage),1);
    assert.equal(await state(()=>window.__NEON_TEST__.voucher),false);
  });
  await check('every upgrade button changes its system and deducts correct credits',async()=>{
    const before=await state(()=>window.__NEON_TEST__.credits);
    for(const name of ['Pulse accelerator','Reinforced hull','Aegis capacitor','Seeker launcher','Vector thrusters']) await page.getByRole('button',{name:`Install ${name}`}).click();
    assert.equal(await state(()=>window.__NEON_TEST__.credits),before-340);
    assert.deepEqual(await state(()=>window.__NEON_TEST__.upgrades),{damage:1,firerate:1,hull:1,shield:1,missile:1,speed:1});
    assert.equal(await state(()=>window.__NEON_TEST__.player.maxHp),125);
    await page.screenshot({path:`${output}upgrade-dock.png`});
    await page.keyboard.press('e');await page.keyboard.press('q');await page.keyboard.press('Escape');
    assert.equal(await state(()=>window.__NEON_TEST__.phase),'upgrade');
    await page.getByRole('button',{name:'Launch wave 3'}).click();
    await page.waitForFunction(()=>window.__NEON_TEST__.wave===3 && window.__NEON_TEST__.phase==='playing');
    assert.equal(await state(()=>document.activeElement.tagName),'CANVAS');
  });
  await check('Q launches seekers; mini-boss objective and elite warnings appear',async()=>{
    await page.keyboard.press('q');await page.waitForFunction(()=>window.__NEON_TEST__.bullets.some(b=>b.kind==='missile'&&!b.hostile));
    await page.waitForFunction(()=>window.__NEON_TEST__.enemies.some(e=>e.kind==='miniboss'&&e.target));
    assert.equal(await state(()=>window.__NEON_TEST__.objective.kind),'target');
    await page.screenshot({path:`${output}mini-boss.png`});
  });
  await check('all five advanced enemy classes render and participate in combat',async()=>{
    await state(()=>{const g=window.__NEON_TEST__, template={...g.enemies[0]};g.bannerTime=0;g.bullets=[];g.spawnTimer=100;g.enemies=['interceptor','armored','sniper','kamikaze','stealth'].map((kind,i)=>({...template,id:7000+i,kind,x:g.width*(i+1)/6,originX:g.width*(i+1)/6,y:190+(i%2)*90,r:kind==='armored'?29:19,hp:500,maxHp:500,elite:false,target:false,age:kind==='stealth'?2.4:0,cooldown:.1}));});
    await wait(450);assert.equal(await state(()=>window.__NEON_TEST__.enemies.length),5);assert(await state(()=>window.__NEON_TEST__.beams.some(b=>b.hostile)));await page.screenshot({path:`${output}combat-classes.png`});
  });
  await check('storm survives to its timer, clears hazards, and reaches the next dock',async()=>{
    await state(()=>{const g=window.__NEON_TEST__;g.wave=3;g.phase='upgrade';g.enemies=[];g.continueMission();g.player.invulnerable=100;g.spawnRemaining=0;});
    await page.waitForFunction(()=>window.__NEON_TEST__.asteroids.length>=3);
    await page.screenshot({path:`${output}asteroid-storm.png`});
    await state(()=>{window.__NEON_TEST__.waveTime=23.9;});
    await page.getByRole('heading',{name:'A moment to evolve.'}).waitFor();
    assert.equal(await state(()=>window.__NEON_TEST__.asteroids.length),0);
    assert(await state(()=>window.__NEON_TEST__.achievements.includes('storm')));
    await page.getByRole('button',{name:'Launch wave 5'}).click();
  });
  await check('boss phase three, victory, and continuation preserve the same engine',async()=>{
    await page.waitForFunction(()=>window.__NEON_TEST__.enemies.some(e=>e.kind==='boss'));
    await state(()=>{const g=window.__NEON_TEST__;g.player.invulnerable=100;const b=g.enemies.find(e=>e.kind==='boss');b.hp=b.maxHp*.2;window.__engineIdentity=g;});
    await page.getByText('CRITICAL · PHASE III').waitFor();
    await wait(1000);await page.screenshot({path:`${output}boss-phase-three.png`});
    await state(()=>{window.__NEON_TEST__.enemies.find(e=>e.kind==='boss').hp=0;});
    await page.getByRole('heading',{name:'The sector is yours.'}).waitFor();
    assert(await state(()=>JSON.parse(localStorage.getItem('neon-vanguard.progress.v1')).unlocked.includes('bastion')));
    await page.screenshot({path:`${output}mission-complete.png`});
    const time=await state(()=>window.__NEON_TEST__.time);await wait(200);assert.equal(await state(()=>window.__NEON_TEST__.time),time);
    await page.getByRole('button',{name:'Refit & continue'}).click();
    await page.getByRole('button',{name:'Launch wave 6'}).click();
    assert(await state(()=>window.__NEON_TEST__===window.__engineIdentity));
    assert.equal(await state(()=>window.__NEON_TEST__.wave),6);
    assert.equal(await state(()=>window.__NEON_TEST__.continueMission()),false);
    assert.equal(await state(()=>window.__NEON_TEST__.upgrades.missile),1);
  });
  await check('both unlocks persist, all ship selections affect gameplay, and achievements render',async()=>{
    await state(()=>{window.__NEON_TEST__.kills=30;});await wait(180);
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'Return to main menu'}).click();
    await page.getByRole('button',{name:/Hangar & service record/}).click();
    assert.equal(await page.getByRole('button',{name:'Select VX–02 Wraith'}).isDisabled(),false);
    assert.equal(await page.getByRole('button',{name:'Select VX–03 Bastion'}).isDisabled(),false);
    await page.getByRole('button',{name:'Select VX–02 Wraith'}).click();
    await page.getByRole('button',{name:'Return to flight deck'}).click();await page.getByRole('button',{name:/Launch mission/}).click();
    await page.waitForFunction(()=>window.__NEON_TEST__?.ship==='wraith');assert.equal(await state(()=>window.__NEON_TEST__.player.maxHp),75);
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'Return to main menu'}).click();await page.getByRole('button',{name:/Hangar & service record/}).click();
    await page.getByRole('button',{name:'Select VX–03 Bastion'}).click();await wait(220);
    assert.equal(await state(()=>JSON.parse(localStorage.getItem('neon-vanguard.progress.v1')).selected),'bastion');
    assert((await page.locator('.achievement-grid .earned').count())>=2);
    await page.screenshot({path:`${output}hangar-unlocked.png`});
    await page.reload();await page.getByRole('button',{name:/Launch mission/}).click();
    await page.waitForFunction(()=>window.__NEON_TEST__?.ship==='bastion');
    assert.equal(await state(()=>window.__NEON_TEST__.player.maxHp),150);
    assert.equal(await state(()=>window.__NEON_TEST__.player.maxShield),65);
  });
  await check('repeated restarts have one clock and clean reset, teardown removes hooks',async()=>{
    for(let i=0;i<3;i++){await page.keyboard.press('Escape');await page.getByRole('button',{name:'Restart mission'}).click();await wait(80);assert.equal(await state(()=>window.__NEON_TEST__.wave),1);}
    const start=await state(()=>window.__NEON_TEST__.time);await wait(500);const delta=(await state(()=>window.__NEON_TEST__.time))-start;assert(delta>.35&&delta<.8);
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'Return to main menu'}).click();assert.equal(await state(()=>typeof window.__NEON_TEST__),'undefined');
    await page.keyboard.press('Space');assert.equal(await page.locator('.game-canvas').count(),0);
  });
  await check('mobile abilities, dock scrolling, ship selection, and 320px layout',async()=>{
    const mobileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
    const mobile=await mobileContext.newPage();mobile.on('pageerror',e=>errors.push(e.message));
    await mobile.goto(`${base}/?e2e`);await mobile.getByRole('button',{name:/Launch mission/}).tap();await mobile.waitForFunction(()=>!!window.__NEON_TEST__);
    await mobile.getByRole('button',{name:'Boost',exact:true}).tap();await mobile.waitForTimeout(90);assert((await mobile.evaluate(()=>window.__NEON_TEST__.player.boostCooldown))>3);
    const laser=await mobile.getByRole('button',{name:'Hold and release laser'}).boundingBox();const cdp=await mobileContext.newCDPSession(mobile);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:laser.x+laser.width/2,y:laser.y+laser.height/2,id:1}]});await mobile.waitForTimeout(650);assert((await mobile.evaluate(()=>window.__NEON_TEST__.player.charge))>.4);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await mobile.waitForFunction(()=>window.__NEON_TEST__.beams.some(b=>!b.hostile));
    await mobile.evaluate(()=>{const g=window.__NEON_TEST__;g.upgrades.missile=1;g.player.invulnerable=100;});await mobile.getByRole('button',{name:'Launch missile',exact:true}).tap();assert(await mobile.evaluate(()=>window.__NEON_TEST__.bullets.some(b=>b.kind==='missile')));
    await mobile.screenshot({path:`${output}mobile-abilities.png`});
    await mobile.evaluate(()=>{const g=window.__NEON_TEST__;g.wave=2;g.enemies=[];g.spawnRemaining=0;g.waveSettled=false;g.credits=200;});
    await mobile.getByRole('heading',{name:'A moment to evolve.'}).waitFor();
    await mobile.getByRole('button',{name:'Install Vector thrusters'}).tap();assert.equal(await mobile.evaluate(()=>window.__NEON_TEST__.upgrades.speed),1);
    await mobile.screenshot({path:`${output}mobile-dock.png`});
    await mobile.getByRole('button',{name:'Launch wave 3'}).tap();await mobile.getByRole('button',{name:'Pause game'}).tap();await mobile.getByRole('button',{name:'Return to main menu'}).tap();
    await mobile.setViewportSize({width:320,height:700});await mobile.getByRole('button',{name:/Hangar & service record/}).tap();assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await mobile.getByRole('button',{name:'Return to flight deck'}).tap();
    await mobile.getByRole('button',{name:/Launch mission/}).tap();await mobile.waitForFunction(()=>window.__NEON_TEST__?.time>.2);await mobile.screenshot({path:`${output}mobile-320.png`});
    assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await mobileContext.close();
  });
  await check('no uncaught expansion browser errors',async()=>assert.deepEqual(errors,[]));
  console.log(`\n${passed} expansion browser checks passed.`);
} catch(error) {console.error(error);await page.screenshot({path:`${output}failure.png`,fullPage:true}).catch(()=>{});process.exitCode=1;}
finally {await browser.close();}
