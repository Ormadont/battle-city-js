/* Zoomed sprite inspection: renders canvas regions at 5x and screenshots them. */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9334;
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
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('PAGE EXCEPTION: ' + JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

async function shotClip(name, clip) {
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } });
  fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64'));
  console.log('screenshot:', name);
}

(async () => {
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--mute-audio',
    `--user-data-dir=${path.join(ROOT, '.chrome-cdp-zoom')}`,
    `--remote-debugging-port=${PORT}`,
    '--window-size=980,820',
    'http://127.0.0.1:8123/'
  ], { stdio: 'ignore' });

  try {
    let list = null;
    for (let i = 0; i < 50; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        list = await res.json();
        if (list && list.some((t) => t.type === 'page')) break;
      } catch (e) {}
      await sleep(200);
    }
    if (!list) throw new Error('Chrome CDP not reachable');
    const page = list.find((t) => t.type === 'page');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
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
    for (let i = 0; i < 60; i++) {
      if (await evaluate('!!window.BC_GAME')) break;
      await sleep(200);
    }

    // Start a run and skip the intro so the base and tanks are on screen.
    await evaluate("window.BC_GAME.startGame(); window.BC_GAME.loadLevel(0); window.BC_GAME.state='playing'; window.BC_GAME.introTimer=0; window.BC_GAME.player.x=96; window.BC_GAME.player.y=352; window.BC_GAME.player.dir=0; window.BC_GAME.spawnEnemy(192, 0, {type:'power'}); true");
    await sleep(700);

    const rect = await evaluate(`(() => {
      const c = document.getElementById('game');
      const z = document.createElement('canvas');
      z.width = 480; z.height = 480;
      z.id = 'zoomoverlay';
      z.style.cssText = 'position:fixed;left:10px;top:10px;z-index:99999;background:#000;image-rendering:pixelated;';
      const zc = z.getContext('2d');
      zc.imageSmoothingEnabled = false;
      // crop 96x96 buffer pixels around the base/eagle (buffer origin: field offset 12)
      zc.drawImage(c, 12 + 176, 12 + 336, 96, 96, 0, 0, 480, 480);
      document.body.appendChild(z);
      const r = z.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    })()`);
    await sleep(200);
    await shotClip('zoom-base.png', rect);
  } finally {
    try { ws.close(); } catch (e) {}
    chrome.kill();
  }
})().catch((e) => {
  console.error('FAILED', e);
  process.exitCode = 1;
});
