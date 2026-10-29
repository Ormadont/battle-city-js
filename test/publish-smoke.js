/* Smoke test for the published folder: menu, mode picker, generated level. */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9444;
const ROOT = path.resolve(__dirname, '..');
const URL = 'http://127.0.0.1:' + (process.argv[2] || '8299') + '/';
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
async function tap(code, key, vk) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
}

(async () => {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--mute-audio',
    `--user-data-dir=${path.join(ROOT, '.chrome-publish')}`,
    `--remote-debugging-port=${PORT}`, '--window-size=980,820', URL
  ], { stdio: 'ignore' });

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
  await evaluate(`window.__errors = []; window.addEventListener('error', e => window.__errors.push(String(e.message)));`);

  const boot = await evaluate(`({
    levels: window.BC_LEVELS.length,
    hasGen: typeof (window.BCGen && window.BCGen.generate) === 'function',
    state: window.BC_GAME.state
  })`);
  console.log('BOOT', JSON.stringify(boot));

  await tap('Enter', 'Enter', 13);
  await sleep(250);
  console.log('PICKER', JSON.stringify(await evaluate('({ modePick: window.BC_GAME.modePick })')));

  await tap('ArrowDown', 'ArrowDown', 40);
  await sleep(120);
  await tap('Enter', 'Enter', 13);
  await sleep(2400);

  const randomState = await evaluate(`(() => { const g = window.BC_GAME; return {
    genOnly: !!g.genOnly, state: g.state, generated: !!g.levelGenerated,
    level: g.levelIndex + 1, name: g.levelName, enemies: g.queue.length
  }; })()`);
  console.log('RANDOM START', JSON.stringify(randomState));
  console.log('PAGE ERRORS', JSON.stringify(await evaluate('window.__errors')));

  const ok = boot.levels === 9 && boot.hasGen && boot.state === 'title' &&
    randomState.genOnly && randomState.generated && randomState.enemies >= 1;

  await send('Page.captureScreenshot', { format: 'png' }).then((r) => {
    fs.writeFileSync(path.join(ROOT, 'shots', '27-publish-random.png'), Buffer.from(r.data, 'base64'));
  });

  ws.close();
  chrome.kill();
  console.log(ok ? 'PUBLISH SMOKE OK' : 'PUBLISH SMOKE FAILED');
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error('SMOKE FAILED:', err);
  try { if (ws) ws.close(); } catch (e) {}
  process.exit(1);
});
