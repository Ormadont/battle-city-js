/*
 * E2E: два компьютера (два сервера + два headless Chrome).
 * Проверяет пункт меню, ввод IP, взаимный статус, запуск кооператива,
 * синхронизацию P1/P2, паузу и потерю связи.
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT_A = 8180;
const PORT_B = 8181;
const CDP_A = 9411;
const CDP_B = 9412;
const RUN = Date.now();

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail === undefined ? '' : '  ' + JSON.stringify(detail)));
}

function freePorts() {
  return true;
}

async function waitHttp(port) {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) return;
    } catch (e) {}
    await sleep(150);
  }
  throw new Error('HTTP ' + port + ' not ready');
}

function startServer(port) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port=' + port], {
    cwd: ROOT,
    stdio: 'ignore'
  });
  return p;
}

function startChrome(url, cdpPort, profile) {
  fs.rmSync(profile, { recursive: true, force: true });
  return spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--mute-audio',
    '--window-size=980,820',
    '--user-data-dir=' + profile,
    '--remote-debugging-port=' + cdpPort,
    url
  ], { stdio: 'ignore' });
}

function makeClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();
  const client = {
    ws,
    errors: [],
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    async evaluate(expression) {
      const r = await client.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      if (r.exceptionDetails) {
        throw new Error('PAGE EXCEPTION: ' + JSON.stringify(r.exceptionDetails));
      }
      return r.result.value;
    },
    async shot(name) {
      const r = await client.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64'));
      console.log('screenshot:', name);
    },
    async tap(code, key, vk) {
      await client.send('Input.dispatchKeyEvent', {
        type: 'keyDown', code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk
      });
      await client.send('Input.dispatchKeyEvent', {
        type: 'keyUp', code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk
      });
    },
    async hold(code, key, vk, ms) {
      await client.send('Input.dispatchKeyEvent', {
        type: 'keyDown', code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk
      });
      await sleep(ms);
      await client.send('Input.dispatchKeyEvent', {
        type: 'keyUp', code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk
      });
    },
    async click(selector) {
      const pt = await client.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
      if (!pt) throw new Error('No element ' + selector);
      await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
      await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    },
    async type(text) {
      await client.send('Input.insertText', { text });
    },
    waitOpen() {
      return new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true });
        ws.addEventListener('error', reject, { once: true });
      });
    },
    close() {
      try { ws.close(); } catch (e) {}
    }
  };
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    }
  });
  return client;
}

async function connectChrome(cdpPort) {
  let page = null;
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      const list = await res.json();
      page = list.find((t) => t.type === 'page');
      if (page) break;
    } catch (e) {}
    await sleep(150);
  }
  if (!page) throw new Error('CDP ' + cdpPort + ' not reachable');
  const client = makeClient(page.webSocketDebuggerUrl);
  await client.waitOpen();
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  return client;
}

async function waitFor(client, expr, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await client.evaluate(expr)) return true;
    } catch (e) {}
    await sleep(120);
  }
  return false;
}

function gameStateScript() {
  return `(() => {
    const g = window.BC_GAME;
    const n = window.BCNet;
    return {
      state: g.state,
      mode: g.mode,
      role: g.netRole,
      multi: g.multi,
      synced: g.netSynced,
      lives: g.lives,
      lives2: g.lives2,
      star: g.star,
      star2: g.star2,
      score: g.score,
      level: g.levelIndex + 1,
      player: g.player ? { x: Math.round(g.player.x), y: Math.round(g.player.y) } : null,
      player2: g.player2 ? { x: Math.round(g.player2.x), y: Math.round(g.player2.y) } : null,
      tanks: g.tanks.map(t => ({ team: t.team, pi: t.playerIndex, x: Math.round(t.x), y: Math.round(t.y), type: t.type })),
      bullets: g.bullets.map(b => ({ x: Math.round(b.x), y: Math.round(b.y), team: b.team, ownerPi: b.owner ? b.owner.playerIndex : 0 })),
      net: {
        state: n.peer.state,
        mutual: n.peer.mutual,
        isHost: n.peer.isHost,
        peerIp: n.peer.peerIp,
        available: n.available,
        serverId: n.serverId
      },
      panel: !document.getElementById('net-panel').classList.contains('hidden'),
      statusText: document.getElementById('net-status').textContent,
      statusKind: document.getElementById('net-status').getAttribute('data-kind'),
      startVisible: !document.getElementById('net-start').classList.contains('hidden'),
      menuStatus: g.netStatus()
    };
  })()`;
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  freePorts();

  const servers = [startServer(PORT_A), startServer(PORT_B)];
  const profiles = [
    path.join(ROOT, '.chrome-net-a-' + RUN),
    path.join(ROOT, '.chrome-net-b-' + RUN)
  ];
  const chromes = [];
  let A = null;
  let B = null;

  try {
    await waitHttp(PORT_A);
    await waitHttp(PORT_B);

    chromes.push(startChrome(`http://127.0.0.1:${PORT_A}/`, CDP_A, profiles[0]));
    chromes.push(startChrome(`http://127.0.0.1:${PORT_B}/`, CDP_B, profiles[1]));
    A = await connectChrome(CDP_A);
    B = await connectChrome(CDP_B);

    const readyExpr = '!!window.BC_GAME && !!window.BCNet && BCNet.ready';
    check('A: игра и сокет загрузились', await waitFor(A, readyExpr), null);
    check('B: игра и сокет загрузились', await waitFor(B, readyExpr), null);
    await A.evaluate('window.__errors=[];window.addEventListener("error",e=>window.__errors.push(String(e.message)))');
    await B.evaluate('window.__errors=[];window.addEventListener("error",e=>window.__errors.push(String(e.message)))');

    const startA = await A.evaluate(gameStateScript());
    const startB = await B.evaluate(gameStateScript());
    check('A: стартует в меню', startA.state === 'title' && !startA.panel, startA.state);
    check('B: стартует в меню', startB.state === 'title' && !startB.panel, startB.state);
    check('A: сеть доступна', startA.net.available === true, startA.net);
    check('B: сеть доступна', startB.net.available === true, startB.net);

    // Пункт меню «2 ИГРОКА — СЕТЬ» + ввод IP (реальные клавиши/клики)
    await A.tap('ArrowDown', 'ArrowDown', 40);
    await A.tap('Enter', 'Enter', 13);
    await B.tap('ArrowDown', 'ArrowDown', 40);
    await B.tap('Enter', 'Enter', 13);
    await sleep(300);
    const panelA = await A.evaluate(gameStateScript());
    const panelB = await B.evaluate(gameStateScript());
    check('A: пункт меню открыл ввод IP', panelA.panel, panelA.panel);
    check('B: пункт меню открыл ввод IP', panelB.panel, panelB.panel);

    await A.click('#net-ip');
    await A.type('127.0.0.1:' + PORT_B);
    await A.click('#net-connect');
    await B.click('#net-ip');
    await B.type('127.0.0.1:' + PORT_A);
    await B.click('#net-connect');

    const mutualA = await waitFor(A, 'BCNet.isMutual()', 15000);
    const mutualB = await waitFor(B, 'BCNet.isMutual()', 15000);
    const linkedA = await A.evaluate(gameStateScript());
    const linkedB = await B.evaluate(gameStateScript());
    check('A: взаимное подключение', mutualA && linkedA.net.mutual, linkedA.net);
    check('B: взаимное подключение', mutualB && linkedB.net.mutual, linkedB.net);
    check('A: статус «ПОДКЛЮЧЕНО» в панели', linkedA.statusKind === 'ok' && /ПОДКЛЮЧЕНО/.test(linkedA.statusText), linkedA.statusText);
    check('B: статус «ПОДКЛЮЧЕНО» в панели', linkedB.statusKind === 'ok' && /ПОДКЛЮЧЕНО/.test(linkedB.statusText), linkedB.statusText);
    check('A: роль хозяина/гостя определена', typeof linkedA.net.isHost === 'boolean', linkedA.net.isHost);
    check('B: роли противоположны', linkedA.net.isHost !== linkedB.net.isHost, [linkedA.net.isHost, linkedB.net.isHost]);
    await A.shot('20-net-connected-a.png');
    await B.shot('20-net-connected-b.png');

    // Возврат в меню: статус соединения виден прямо в меню у обоих
    await A.click('#net-back');
    await B.click('#net-back');
    await sleep(350);
    const menuA = await A.evaluate(gameStateScript());
    const menuB = await B.evaluate(gameStateScript());
    check('A: статус связи виден в меню', menuA.menuStatus.kind === 'ok' && /ПОДКЛЮЧЕНО/.test(menuA.menuStatus.text), menuA.menuStatus);
    check('B: статус связи виден в меню', menuB.menuStatus.kind === 'ok' && /ПОДКЛЮЧЕНО/.test(menuB.menuStatus.text), menuB.menuStatus);
    await A.shot('21-net-menu-status-a.png');
    await B.shot('21-net-menu-status-b.png');

    // Снова открыть панель (выбран второй пункт) и начать бой
    await A.tap('Enter', 'Enter', 13);
    await B.tap('Enter', 'Enter', 13);
    await sleep(300);
    const reopenedA = await A.evaluate(gameStateScript());
    const reopenedB = await B.evaluate(gameStateScript());
    check('A: панель открывается повторно', reopenedA.panel, reopenedA.panel);
    check('B: панель открывается повторно', reopenedB.panel, reopenedB.panel);
    check('A: кнопка «НАЧАТЬ БОЙ» доступна', reopenedA.startVisible, reopenedA.startVisible);
    check('B: кнопка «НАЧАТЬ БОЙ» доступна', reopenedB.startVisible, reopenedB.startVisible);

    const host = linkedA.net.isHost ? A : B;
    const guest = linkedA.net.isHost ? B : A;
    const hostName = linkedA.net.isHost ? 'A' : 'B';
    const guestName = hostName === 'A' ? 'B' : 'A';
    console.log('HOST =', hostName, ' GUEST =', guestName);

    await host.click('#net-start');
    const startedHost = await waitFor(host, 'BC_GAME.mode==="net" && BC_GAME.state!=="title"', 8000);
    const startedGuest = await waitFor(guest, 'BC_GAME.mode==="net" && BC_GAME.netSynced===true', 8000);
    const hostStart = await host.evaluate(gameStateScript());
    const guestStart = await guest.evaluate(gameStateScript());
    check('хозяин: кооператив запущен', startedHost && hostStart.multi && hostStart.role === 'host', { state: hostStart.state, multi: hostStart.multi, role: hostStart.role });
    check('гость: получил старт и снапшот', startedGuest && guestStart.role === 'guest' && guestStart.synced, { state: guestStart.state, role: guestStart.role, synced: guestStart.synced });
    check('хозяин: два танка игроков', hostStart.tanks.filter(t => t.team === 'player').length >= 2, hostStart.tanks);
    check('гость: видит два танка игроков', guestStart.tanks.filter(t => t.team === 'player').length >= 2, guestStart.tanks);

    await sleep(2600);
    const hostPlay = await host.evaluate(gameStateScript());
    const guestPlay = await guest.evaluate(gameStateScript());
    check('хозяин: уровень начался', hostPlay.state === 'playing', hostPlay.state);
    check('гость: уровень начался', guestPlay.state === 'playing', guestPlay.state);
    check('гость: карта синхронизирована', await guest.evaluate('!!(BC_GAME.map && BC_GAME.map.length===26 && BC_GAME.base && BC_GAME.base.alive)'), null);
    await host.shot('22-net-game-host.png');
    await guest.shot('23-net-game-guest.png');

    // P2 управляется гостем: движение и огонь
    const p2Before = await host.evaluate('BC_GAME.player2 ? Math.round(BC_GAME.player2.x) : null');
    await guest.hold('ArrowRight', 'ArrowRight', 39, 550);
    await sleep(250);
    const p2After = await host.evaluate('BC_GAME.player2 ? Math.round(BC_GAME.player2.x) : null');
    check('движение гостя двигает P2 на хосте', p2Before !== null && p2After !== null && p2After > p2Before, { before: p2Before, after: p2After });

    await guest.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
    let hostBullet = null;
    let guestBullet = null;
    for (let i = 0; i < 30; i++) {
      await sleep(60);
      hostBullet = await host.evaluate(`(() => {
        const g = window.BC_GAME;
        const b = g.bullets.find(x => x.owner && x.owner.playerIndex === 2);
        return b ? { x: Math.round(b.x), y: Math.round(b.y) } : null;
      })()`);
      if (hostBullet) break;
    }
    for (let i = 0; i < 20; i++) {
      guestBullet = await guest.evaluate('BC_GAME.bullets.length ? { x: Math.round(BC_GAME.bullets[0].x), y: Math.round(BC_GAME.bullets[0].y) } : null');
      if (guestBullet) break;
      await sleep(60);
    }
    await guest.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
    check('огонь гостя создаёт пулю P2 у хозяина', !!hostBullet, hostBullet);
    check('гость видит пулю в снапшоте', !!guestBullet, guestBullet);

    // Хозяин двигает P1 — гость видит изменение
    const p1GuestBefore = await guest.evaluate('(() => { const t=BC_GAME.tanks.find(t=>t.team==="player"&&t.playerIndex===1); return t?Math.round(t.x):null; })()');
    await host.hold('ArrowLeft', 'ArrowLeft', 37, 550);
    await sleep(300);
    const p1GuestAfter = await guest.evaluate('(() => { const t=BC_GAME.tanks.find(t=>t.team==="player"&&t.playerIndex===1); return t?Math.round(t.x):null; })()');
    check('гость видит движение P1 хозяина', p1GuestBefore !== null && p1GuestAfter !== null && p1GuestAfter < p1GuestBefore, { before: p1GuestBefore, after: p1GuestAfter });

    // Пауза хозяина видна гостю
    await host.tap('KeyP', 'p', 80);
    const pausedHost = await waitFor(host, 'BC_GAME.state==="paused"', 4000);
    const pausedGuest = await waitFor(guest, 'BC_GAME.state==="paused"', 4000);
    check('пауза хозяина', pausedHost, await host.evaluate('BC_GAME.state'));
    check('гость видит паузу', pausedGuest, await guest.evaluate('BC_GAME.state'));
    await guest.shot('24-net-pause-guest.png');
    await host.tap('KeyP', 'p', 80);
    const resumed = await waitFor(host, 'BC_GAME.state==="playing"', 4000);
    const guestResumed = await waitFor(guest, 'BC_GAME.state==="playing"', 4000);
    check('продолжение после паузы', resumed && guestResumed, { host: await host.evaluate('BC_GAME.state'), guest: await guest.evaluate('BC_GAME.state') });

    // Потеря связи: гость отключается
    await guest.evaluate('BCNet.disconnect()');
    const lostHost = await waitFor(host, 'BC_GAME.state==="netLost"', 8000);
    const lostGuest = await waitFor(guest, 'BC_GAME.state==="netLost"', 8000);
    check('хозяин: связь потеряна, показан экран', lostHost, await host.evaluate('BC_GAME.state'));
    check('гость: связь потеряна, показан экран', lostGuest, await guest.evaluate('BC_GAME.state'));
    await host.shot('25-net-lost-host.png');
    await guest.shot('25-net-lost-guest.png');

    await host.tap('Enter', 'Enter', 13);
    await guest.tap('Enter', 'Enter', 13);
    await sleep(400);
    const endHost = await host.evaluate(gameStateScript());
    const endGuest = await guest.evaluate(gameStateScript());
    check('возврат в меню после потери связи', endHost.state === 'title' && endGuest.state === 'title', { host: endHost.state, guest: endGuest.state });

    const errA = await A.evaluate('window.__errors');
    const errB = await B.evaluate('window.__errors');
    check('A: нет ошибок страницы', Array.isArray(errA) && errA.length === 0, errA);
    check('B: нет ошибок страницы', Array.isArray(errB) && errB.length === 0, errB);

    const failed = results.filter((r) => !r.ok).length;
    console.log('SUMMARY', JSON.stringify({ total: results.length, failed }));
    process.exitCode = failed ? 1 : 0;
  } finally {
    try { if (A) A.close(); } catch (e) {}
    try { if (B) B.close(); } catch (e) {}
    chromes.forEach((c) => { try { c.kill(); } catch (e) {} });
    servers.forEach((s) => { try { s.kill(); } catch (e) {} });
    await sleep(300);
    profiles.forEach((p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {} });
  }
})().catch((err) => {
  console.error('TEST FAILED:', err && err.stack || err);
  process.exit(1);
});
