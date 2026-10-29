/* Headless Chrome driver for automated Battle City checks. */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws;
let nextId = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (r.exceptionDetails) {
    throw new Error('PAGE EXCEPTION: ' + JSON.stringify(r.exceptionDetails));
  }
  return r.result.value;
}

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64'));
  console.log('screenshot:', name);
}

async function keyDown(code, key, vk) {
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown', code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk
  });
}
async function keyUp(code, key, vk) {
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp', code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk
  });
}
async function tap(code, key, vk) {
  await keyDown(code, key, vk);
  await keyUp(code, key, vk);
}
async function hold(code, key, vk, ms) {
  await keyDown(code, key, vk);
  await sleep(ms);
  await keyUp(code, key, vk);
}

function stateSummary() {
  return evaluate(`(() => {
    const g = window.BC_GAME;
    return {
      state: g.state,
      level: g.levelIndex + 1,
      name: g.levelName,
      score: g.score,
      lives: g.lives,
      star: g.star,
      player: g.player ? { x: Math.round(g.player.x), y: Math.round(g.player.y), shield: +g.player.shield.toFixed(1) } : null,
      tanks: g.tanks.map(t => ({ team: t.team, type: t.type, x: Math.round(t.x), y: Math.round(t.y), hp: t.hp })),
      enemiesLeft: g.remainingEnemies(),
      bullets: g.bullets.length,
      powerups: g.powerups.map(p => p.type),
      baseAlive: !!(g.base && g.base.alive),
      intro: +g.introTimer.toFixed(2),
      time: +g.time.toFixed(1),
      genOnly: !!g.genOnly,
      generated: !!g.levelGenerated,
      modePick: !!g.modePick,
      modeIndex: g.modeIndex
    };
  })()`);
}

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const ok = await evaluate('!!window.BC_GAME');
      if (ok) return;
    } catch (e) {}
    await sleep(200);
  }
  throw new Error('Game did not boot');
}

async function consoleErrors() {
  try {
    // Enable a hook that records future console errors
    return await evaluate('window.__errors ? window.__errors.slice(0,10) : []');
  } catch (e) {
    return ['unknown'];
  }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });

  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--mute-audio',
    `--user-data-dir=${path.join(ROOT, '.chrome-cdp')}`,
    `--remote-debugging-port=${PORT}`,
    '--window-size=980,820',
    'http://127.0.0.1:8123/'
  ], { stdio: 'ignore' });

  let list = null;
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      list = await res.json();
      if (list && list.some(t => t.type === 'page')) break;
    } catch (e) {}
    await sleep(200);
  }
  if (!list) throw new Error('Chrome CDP not reachable');

  const page = list.find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    }
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await waitReady();
  await evaluate(`window.__errors = []; window.addEventListener('error', e => window.__errors.push(String(e.message)));`);

  console.log('TITLE STATE', await stateSummary());
  await sleep(400);
  await shot('01-title.png');

  // Enter on the title opens the mode picker; Escape must close it.
  await tap('Enter', 'Enter', 13);
  await sleep(250);
  const pickOpen = await evaluate('(() => { const g=window.BC_GAME; return { modePick: g.modePick, state: g.state, modeIndex: g.modeIndex }; })()');
  console.log('MODE PICK OPEN', JSON.stringify(pickOpen));
  await shot('01b-mode-pick.png');

  await tap('Escape', 'Escape', 27);
  await sleep(200);
  const pickClosed = await evaluate('(() => { const g=window.BC_GAME; return { modePick: g.modePick, state: g.state }; })()');
  console.log('MODE PICK CLOSED', JSON.stringify(pickClosed));

  // Start the normal campaign: title -> picker -> «ОБЫЧНЫЕ УРОВНИ».
  await tap('Enter', 'Enter', 13);
  await sleep(200);
  await tap('Enter', 'Enter', 13);
  await sleep(3200);
  console.log('AFTER ENTER', await stateSummary());
  await shot('02-level1-start.png');

  // Move up and shoot
  await hold('ArrowUp', 'ArrowUp', 38, 700);
  await sleep(120);
  console.log('AFTER UP', await stateSummary());
  await shot('03-level1-move.png');

  await keyDown('Space', ' ', 32);
  await sleep(900);
  await keyUp('Space', ' ', 32);
  await sleep(250);
  console.log('AFTER FIRE', await stateSummary());
  await shot('04-level1-fire.png');

  // Let AI act
  await sleep(2500);
  console.log('AI RUNNING', await stateSummary());
  await shot('05-level1-ai.png');

  // Pause / resume
  await tap('KeyP', 'p', 80);
  await sleep(250);
  console.log('PAUSED', await stateSummary());
  await shot('06-pause.png');
  await tap('KeyP', 'p', 80);
  await sleep(250);

  // Directly show each remaining fixed level (engine still executes normally).
  for (const lvl of [1, 2, 3, 4, 5, 6, 7, 8]) {
    await evaluate(`(() => { const g=window.BC_GAME; g.genOnly=false; g.startGame(); g.loadLevel(${lvl}); g.state='playing'; g.introTimer=0; g.spawnTimer=0.1; return g.levelIndex; })()`);
    await sleep(1800);
    console.log('LEVEL PREVIEW', await stateSummary());
    await shot(`level-${lvl + 1}.png`);
  }

  // Level 10 must be procedurally generated even in the normal campaign.
  const genPreview = await evaluate(`(() => { const g=window.BC_GAME; g.genOnly=false; g.startGame(); g.loadLevel(9); g.state='playing'; g.introTimer=0; g.spawnTimer=0.1; return { level: g.levelIndex+1, name: g.levelName, generated: !!g.levelGenerated, enemies: g.queue.length, maxActive: g.maxActive }; })()`);
  await sleep(1800);
  console.log('LEVEL 10 PREVIEW', JSON.stringify(genPreview));
  await shot('level-10-generated.png');

  // Campaign progression: clear every level through the real state machine.
  await evaluate(`(() => { const g=window.BC_GAME; g.genOnly=false; g.startGame(); g.state='playing'; g.introTimer=0; return true; })()`);
  const progression = [];
  for (let stage = 1; stage <= 10; stage++) {
    const info = await evaluate(`(() => {
      const g = window.BC_GAME;
      g.queue = [];
      g.pendingSpawns = [];
      for (const t of g.tanks) if (t.team === 'enemy') t.dead = true;
      g.tanks = g.tanks.filter(t => !t.dead);
      if (g.state === 'playing') g.update(1.1);       // clearDelay -> levelClear
      if (g.state === 'levelClear') g.update(2.3);    // -> intro of the next level
      if (g.state === 'intro') g.update(2.0);         // -> playing
      return {
        level: g.levelIndex + 1,
        name: g.levelName,
        state: g.state,
        generated: !!g.levelGenerated,
        enemies: g.queue.length,
        maxActive: g.maxActive
      };
    })()`);
    progression.push(info);
    if (info.level === 10) {
      await sleep(150);
      await shot('11-endless-generated.png');
    }
  }
  const finalState = await stateSummary();
  console.log('CAMPAIGN', JSON.stringify(progression), 'FINAL', JSON.stringify(finalState));

  const fixedNames = progression.slice(0, 8).map(p => p.level);
  const endless = progression.slice(8);
  const campaignOk = fixedNames.join(',') === '2,3,4,5,6,7,8,9' &&
    progression.slice(0, 8).every(p => p.state === 'playing' && !p.generated && p.enemies >= 1) &&
    endless.length === 2 &&
    endless.every(p => p.state === 'playing' && p.generated && p.enemies >= 1) &&
    finalState.level === 11 && finalState.generated === true && finalState.genOnly === false;
  console.log('CAMPAIGN CHECK', JSON.stringify({ ok: campaignOk, fixedNames, endlessLevels: endless.map(p => p.level) }));
  if (!campaignOk) throw new Error('Campaign progression is wrong');

  // Random-only mode: title -> picker -> ArrowDown -> Enter.
  await evaluate('window.BC_GAME.toMenu()');
  await sleep(300);
  await tap('Enter', 'Enter', 13);
  await sleep(200);
  await tap('ArrowDown', 'ArrowDown', 40);
  await sleep(150);
  const pickRandom = await evaluate('(() => { const g=window.BC_GAME; return { modePick: g.modePick, modeIndex: g.modeIndex }; })()');
  await tap('Enter', 'Enter', 13);
  await sleep(2300);
  const randomMode = await evaluate(`(() => {
    const g = window.BC_GAME;
    return {
      genOnly: !!g.genOnly,
      modePick: !!g.modePick,
      state: g.state,
      level: g.levelIndex + 1,
      name: g.levelName,
      generated: !!g.levelGenerated,
      enemies: g.queue.length,
      maxActive: g.maxActive,
      mapSum: g.map.reduce((sum, row) => sum + row.reduce((a, b) => a + b, 0), 0)
    };
  })()`);
  console.log('RANDOM MODE', JSON.stringify({ pickRandom, randomMode }));
  if (!(randomMode.genOnly && randomMode.generated && randomMode.enemies >= 1 && randomMode.state === 'playing')) {
    throw new Error('Random-only mode did not start a generated level');
  }
  await shot('18-random-mode.png');
  await evaluate('window.BC_GAME.toMenu()');
  await sleep(300);

  // Game over via base destruction
  await evaluate(`(() => { const g=window.BC_GAME; g.startGame(); g.loadLevel(0); g.state='playing'; g.introTimer=0; g.destroyBase(); return g.state; })()`);
  await sleep(2800);
  console.log('BASE DESTROYED', await stateSummary());
  await shot('12-gameover-base.png');

  // Game over via losing all lives
  await evaluate(`(() => { const g=window.BC_GAME; g.startGame(); g.loadLevel(0); g.state='playing'; g.introTimer=0; g.lives=1; g.player.shield=0; g.killPlayer(); return g.state; })()`);
  await sleep(2200);
  console.log('LIVES OUT', await stateSummary());
  await shot('13-gameover-lives.png');

  // Power-up logic checks
  const powerChecks = await evaluate(`(() => {
    const g = window.BC_GAME;
    g.startGame(); g.loadLevel(0); g.state='playing'; g.introTimer=0;
    const out = {};

    // star
    g.star = 0;
    g.collectPowerUp({x: g.player.x, y: g.player.y, type:'star', dead:false});
    out.star = g.star;
    out.playerSpeedAfterStar = g.player.speed;
    out.maxBulletsAfterStar = g.player.maxBullets;

    // helmet
    g.player.shield = 0;
    g.collectPowerUp({x: g.player.x, y: g.player.y, type:'helmet', dead:false});
    out.helmetShield = +g.player.shield.toFixed(1);

    // clock
    g.collectPowerUp({x: g.player.x, y: g.player.y, type:'clock', dead:false});
    out.freeze = g.freezeTimer;

    // shovel
    g.collectPowerUp({x: g.player.x, y: g.player.y, type:'shovel', dead:false});
    out.fortSteel = g.map[23][11];
    out.fortTimer = g.fortTimer;

    // life
    const livesBefore = g.lives;
    g.collectPowerUp({x: g.player.x, y: g.player.y, type:'life', dead:false});
    out.lifeAdded = g.lives - livesBefore;

    // grenade
    g.spawnEnemy(0, 0, {type:'basic'});
    g.spawnEnemy(192, 0, {type:'fast'});
    const before = g.tanks.filter(t => t.team === 'enemy' && !t.dead).length;
    g.collectPowerUp({x: g.player.x, y: g.player.y, type:'grenade', dead:false});
    out.grenadeBefore = before;
    out.grenadeAfter = g.tanks.filter(t => t.team === 'enemy' && !t.dead).length;
    out.score = g.score;
    return out;
  })()`);
  console.log('POWERUPS', JSON.stringify(powerChecks));

  // Bonus enemy drop must be reachable and collectible by driving onto it
  const pickupCheck = await evaluate(`(() => {
    const g = window.BC_GAME;
    g.startGame(); g.loadLevel(0); g.state='playing'; g.introTimer=0;
    g.queue = []; g.pendingSpawns = []; g.powerups = [];
    g.tanks = g.tanks.filter(t => t.team === 'player');
    for (let y = 14; y < 24; y++) for (let x = 6; x < 20; x++) g.map[y][x] = 0;
    g.spawnEnemy(128, 320, {type:'basic', bonus:true});
    const e = g.tanks.find(t => t.team === 'enemy');
    e.shield = 0;
    g.killEnemy(e);
    const pu = g.powerups[0];
    const drop = pu ? { x: pu.x, y: pu.y, type: pu.type, w: pu.w, h: pu.h } : null;
    const dropFree = pu ? !g.rectBlocked(pu.x, pu.y, 32, 32) : null;
    const scoreBefore = g.score;
    g.player.x = 128; g.player.y = 384; g.player.dir = 0;
    let steps = 0;
    for (; steps < 180 && g.powerups.length; steps++) {
      g.player.tryMove(1/60, 0);
      g.updatePowerUps(1/60);
    }
    return {
      dropped: !!pu,
      drop: drop,
      dropFree: dropFree,
      pickupSteps: steps,
      remaining: g.powerups.length,
      scoreGain: g.score - scoreBefore,
      playerY: Math.round(g.player.y)
    };
  })()`);
  console.log('POWERUP PICKUP', JSON.stringify(pickupCheck));

  // End-to-end: drop a bonus with a dead enemy, then drive over it with real keys
  const keyDrop = await evaluate(`(() => {
    const g = window.BC_GAME;
    g.startGame(); g.loadLevel(0); g.state='playing'; g.introTimer=0;
    g.queue=[{type:'basic'}]; g.spawnTimer=999; g.pendingSpawns=[]; g.powerups=[];
    g.tanks = g.tanks.filter(t => t.team==='player');
    for (let y=14; y<23; y++) for (let x=6; x<20; x++) g.map[y][x]=0;
    g.spawnEnemy(128, 320, {type:'basic', bonus:true});
    const e = g.tanks.find(t => t.team==='enemy');
    e.shield = 0;
    g.killEnemy(e);
    g.player.x = 128; g.player.y = 384; g.player.dir = 0; g.player.shield = 2;
    return { powerups: g.powerups.map(p => ({x:p.x, y:p.y, type:p.type, w:p.w, h:p.h})), score: g.score };
  })()`);
  console.log('POWERUP DROP E2E', JSON.stringify(keyDrop));
  await sleep(200);
  await shot('16-powerup-drop.png');

  await hold('ArrowUp', 'ArrowUp', 38, 750);
  await sleep(200);
  const keyPickup = await evaluate(`(() => {
    const g = window.BC_GAME;
    return {
      remaining: g.powerups.length,
      score: g.score,
      playerY: Math.round(g.player.y),
      star: g.star,
      lives: g.lives,
      shield: g.player ? +g.player.shield.toFixed(1) : null,
      freeze: +g.freezeTimer.toFixed(1),
      fort: +g.fortTimer.toFixed(1)
    };
  })()`);
  console.log('POWERUP KEY PICKUP', JSON.stringify(keyPickup));
  await shot('17-powerup-taken.png');

  // Collision / destruction check: shoot a brick at close range
  const brickCheck = await evaluate(`(() => {
    const g = window.BC_GAME;
    g.startGame(); g.loadLevel(0); g.state='playing'; g.introTimer=0;
    // clear a lane above player and place a brick
    for (let y = 18; y < 24; y++) for (let x = 7; x < 12; x++) g.map[y][x] = 0;
    g.map[20][8] = 1; g.map[20][9] = 1;
    g.player.x = 128; g.player.y = 352; g.player.dir = 0; g.player.shield = 0;
    g.player.fire();
    for (let i = 0; i < 40; i++) {
      for (const b of g.bullets) b.update(1/60);
      g.bullets = g.bullets.filter(b => !b.dead);
    }
    return { cell1: g.map[20][8], cell2: g.map[20][9], bullets: g.bullets.length };
  })()`);
  console.log('BRICK CHECK', JSON.stringify(brickCheck));

  // Enemy AI movement check
  await evaluate(`(() => { const g=window.BC_GAME; g.startGame(); g.loadLevel(0); g.state='playing'; g.introTimer=0; g.queue=[]; g.spawnEnemy(192,0,{type:'basic'}); g.spawnEnemy(0,0,{type:'fast'}); return true; })()`);
  const beforeAI = await evaluate('window.BC_GAME.tanks.map(t=>({x:Math.round(t.x),y:Math.round(t.y)}))');
  await sleep(2500);
  const afterAI = await evaluate('window.BC_GAME.tanks.map(t=>({x:Math.round(t.x),y:Math.round(t.y)}))');
  console.log('AI MOVEMENT', JSON.stringify({ before: beforeAI, after: afterAI }));

  // Intro auto-transition (no input)
  const introCheck = await evaluate(`(() => {
    const g = window.BC_GAME;
    g.startGame(); g.loadLevel(0);
    const s1 = g.state;
    g.update(2);
    return { before: s1, after: g.state, timer: +g.introTimer.toFixed(2) };
  })()`);
  console.log('INTRO AUTO', JSON.stringify(introCheck));

  // Full combat loop: player bullet kills a basic enemy
  const combat = await evaluate(`(() => {
    const g = window.BC_GAME;
    g.startGame(); g.loadLevel(0); g.state='playing'; g.introTimer=0;
    g.queue = []; g.pendingSpawns = [];
    g.tanks = g.tanks.filter(t => t.team === 'player');
    for (let y = 4; y < 10; y++) for (let x = 10; x < 16; x++) g.map[y][x] = 0;
    g.spawnEnemy(192, 64, {type:'basic'});
    const e = g.tanks.find(t => t.team === 'enemy');
    e.shield = 0;
    g.player.x = 192; g.player.y = 160; g.player.dir = 0;
    g.player.shield = 0; g.player.fireCooldown = 0;
    g.player.fire();
    for (let i = 0; i < 90; i++) {
      for (const b of g.bullets) b.update(1/60);
      g.bullets = g.bullets.filter(b => !b.dead);
      g.tanks = g.tanks.filter(t => !t.dead);
    }
    return {
      enemiesLeft: g.tanks.filter(t => t.team === 'enemy').length,
      score: g.score,
      explosions: g.explosions.length,
      powerups: g.powerups.length
    };
  })()`);
  console.log('COMBAT', JSON.stringify(combat));

  // Armor enemy needs four hits
  const armorCheck = await evaluate(`(() => {
    const g = window.BC_GAME;
    g.startGame(); g.loadLevel(0); g.state='playing'; g.introTimer=0;
    g.tanks = g.tanks.filter(t => t.team === 'player');
    g.spawnEnemy(192, 64, {type:'armor'});
    const e = g.tanks.find(t => t.team === 'enemy');
    e.shield = 0;
    const fake = {x: e.x + 16, y: e.y + 16};
    g.hitTank(e, fake); g.hitTank(e, fake); g.hitTank(e, fake);
    const hp3 = e.hp;
    const dead3 = e.dead;
    g.hitTank(e, fake);
    return { hpAfter3: hp3, deadAfter3: dead3, deadAfter4: e.dead, score: g.score };
  })()`);
  console.log('ARMOR', JSON.stringify(armorCheck));

  // Player death -> respawn with lives decremented
  const respawnCheck = await evaluate(`(() => {
    const g = window.BC_GAME;
    g.startGame(); g.loadLevel(0); g.state='playing'; g.introTimer=0;
    g.lives = 3;
    g.player.shield = 0;
    g.killPlayer();
    const afterDeath = { lives: g.lives, player: !!g.player, timer: +g.respawnTimer.toFixed(1) };
    g.updatePlaying(2.0);
    return { afterDeath, afterRespawn: { lives: g.lives, player: !!g.player, x: g.player && g.player.x } };
  })()`);
  console.log('RESPAWN', JSON.stringify(respawnCheck));

  // Bullet vs bullet cancellation
  const bulletClash = await evaluate(`(() => {
    const g = window.BC_GAME;
    g.startGame(); g.loadLevel(0); g.state='playing'; g.introTimer=0;
    // clean open lane so only the two bullets can meet
    for (let y = 12; y < 25; y++) for (let x = 7; x < 9; x++) g.map[y][x] = 0;
    g.bullets = [];
    g.tanks = g.tanks.filter(t => t.team === 'player' && !t.dead);
    g.player.x = 128; g.player.y = 384; g.player.dir = 0;
    g.player.shield = 0; g.player.fireCooldown = 0;
    g.player.fire();
    const pb = g.bullets[0];
    const TankCtor = g.player.constructor;
    const dummy = new TankCtor(g, 128, 128, 'enemy', 'basic');
    dummy.shield = 0;
    dummy.dir = 2;
    g.tanks.push(dummy);
    dummy.fire();
    const eb = g.bullets.find(b => b.team === 'enemy');
    let metAt = null;
    for (let i = 0; i < 60; i++) {
      if (pb) pb.update(1/60);
      if (eb) eb.update(1/60);
      g.collideBullets();
      if (pb && eb && pb.dead && eb.dead) { metAt = Math.round(pb.y); break; }
      if (pb && pb.dead) break;
    }
    return { hadPlayerBullet: !!pb, hadEnemyBullet: !!eb, playerBulletDead: pb ? pb.dead : null, enemyBulletDead: eb ? eb.dead : null, metAt: metAt };
  })()`);
  console.log('BULLET CLASH', JSON.stringify(bulletClash));

  // Water blocks tanks; ice boosts speed
  const terrainCheck = await evaluate(`(() => {
    const g = window.BC_GAME;
    g.startGame(); g.loadLevel(1); g.state='playing'; g.introTimer=0;
    const t = g.player;
    t.x = 64; t.y = 48; t.dir = 0;
    const water = t.collidesAt(97, 48);

    g.startGame(); g.loadLevel(0); g.state='playing'; g.introTimer=0;
    const p = g.player;
    p.y = 384; p.dir = 0;
    p.x = 128; g.map[25][9] = 0;
    p.tryMove(0.1, 1);
    const normal = p.x - 128;
    p.x = 128; p.y = 384; p.dir = 0; p.fireCooldown = 0;
    g.map[25][9] = 5;
    p.tryMove(0.1, 1);
    const onIce = p.x - 128;
    return { waterBlocked: water, normalMove: +normal.toFixed(2), iceMove: +onIce.toFixed(2) };
  })()`);
  console.log('TERRAIN', JSON.stringify(terrainCheck));

  // Power-up expiration
  const expiryCheck = await evaluate(`(() => {
    const g = window.BC_GAME;
    g.powerups = [{ x: 64, y: 64, type: 'star', timer: 0.2, phase: 0, dead: false }];
    g.updatePowerUps(0.3);
    return { count: g.powerups.length };
  })()`);
  console.log('POWERUP EXPIRY', JSON.stringify(expiryCheck));

  // Co-op: P2 spawn, separate lives/stars, respawn, game over when both out
  const coopCheck = await evaluate(`(() => {
    const g = window.BC_GAME;
    g.startGame();
    g.multi = true;
    g.loadLevel(0);
    g.state='playing'; g.introTimer=0; g.queue=[]; g.pendingSpawns=[];
    const out = {};
    out.p2Spawn = g.player2 ? {x: g.player2.x, y: g.player2.y, pi: g.player2.playerIndex} : null;
    out.lives2 = g.lives2;
    out.twoPlayers = g.tanks.filter(t => t.team === 'player').length;

    g.player.shield = 0; g.player2.shield = 0;
    g.collectPowerUp({x:g.player2.x, y:g.player2.y, type:'star', dead:false}, g.player2);
    out.star2 = g.star2; out.star1 = g.star;
    out.speed1 = g.player.speed; out.speed2 = g.player2.speed;
    g.collectPowerUp({x:g.player2.x, y:g.player2.y, type:'helmet', dead:false}, g.player2);
    out.shield2 = g.player2.shield;
    const l2 = g.lives2;
    g.collectPowerUp({x:g.player2.x, y:g.player2.y, type:'life', dead:false}, g.player2);
    out.life2 = g.lives2 - l2;

    g.star2 = 0; g.player2.applyStar();
    g.powerups = [{x: g.player2.x, y: g.player2.y, w:32, h:32, type:'star', timer:5, phase:0, dead:false}];
    g.updatePowerUps(1/60);
    out.pickupStar2 = g.star2;
    out.powerupsLeft = g.powerups.length;

    g.spawnEnemy(256, 300, {type:'basic'});
    out.nearestIsP2 = g.nearestPlayer(256, 316) === g.player2;

    g.player.shield = 0; g.player2.shield = 0;
    g.killPlayer(g.player);
    out.afterP1 = { state: g.state, lives: g.lives, lives2: g.lives2, p1: !!g.player, p2: !!g.player2 };
    g.killPlayer(g.player2);
    out.afterP2 = { state: g.state, lives: g.lives, lives2: g.lives2 };
    g.updatePlaying(2.0);
    out.respawned = { p1: !!g.player, p2: !!g.player2, x1: g.player && g.player.x, x2: g.player2 && g.player2.x };

    g.state='playing'; g.lives=1; g.lives2=1;
    if (!g.player) g.spawnPlayer(false, 1);
    if (!g.player2) g.spawnPlayer(false, 2);
    g.player.shield=0; g.player2.shield=0;
    g.killPlayer(g.player);
    const afterFirst = g.state;
    g.killPlayer(g.player2);
    out.final = { afterFirst: afterFirst, state: g.state, reason: g.endReason };
    return out;
  })()`);
  console.log('COOP', JSON.stringify(coopCheck));

  console.log('PAGE ERRORS', JSON.stringify(await consoleErrors()));

  ws.close();
  chrome.kill();
  process.exit(0);
})().catch((err) => {
  console.error('TEST FAILED:', err);
  try { if (ws) ws.close(); } catch (e) {}
  process.exit(1);
});
