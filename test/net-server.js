/* Проверка сетевого сервера: два экземпляра, рукопожатие, статус, релей. */
'use strict';

const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, info) {
  results.push({ name, ok, info });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' ' + JSON.stringify(info) : ''));
}

function startServer(port) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port=' + port], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  p.stdout.on('data', () => {});
  p.stderr.on('data', (d) => process.stderr.write('[srv' + port + '] ' + d));
  return p;
}

async function waitHttp(port) {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/');
      if (res.ok) return true;
    } catch (e) {}
    await sleep(100);
  }
  return false;
}

function openPage(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
    const api = {
      ws,
      messages: [],
      welcome: null,
      want(status) {
        return new Promise((res, rej) => {
          const t0 = Date.now();
          const tick = () => {
            const m = api.messages.find((x) => x.t === 'peer' && status(x));
            if (m) return res(m);
            if (Date.now() - t0 > 5000) return rej(new Error('timeout waiting status'));
            setTimeout(tick, 25);
          };
          tick();
        });
      },
      send(obj) { ws.send(JSON.stringify(obj)); },
      relay(data) { ws.send(JSON.stringify({ t: 'relay', data })); }
    };
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      api.messages.push(m);
      if (m.t === 'welcome') { api.welcome = m; resolve(api); }
    });
    ws.addEventListener('error', reject);
    setTimeout(() => reject(new Error('page connect timeout')), 5000);
  });
}

(async () => {
  const s1 = startServer(8080);
  const s2 = startServer(8081);
  let a, b;
  try {
    check('server 8080 http', await waitHttp(8080));
    check('server 8081 http', await waitHttp(8081));

    a = await openPage(8080);
    b = await openPage(8081);
    check('welcome has id/ips/port', !!(a.welcome.id && a.welcome.port === 8080 && Array.isArray(a.welcome.ips)), a.welcome);
    check('welcome port B', b.welcome.port === 8081);

    // Сначала подключается только A: статус linked, но не mutual.
    a.send({ t: 'connect', ip: '127.0.0.1:8081' });
    const linkedA = await a.want((m) => m.state === 'linked');
    await sleep(200);
    check('A sees link before B chose', linkedA.state === 'linked' && linkedA.mutual === false, linkedA);
    check('B got incoming status linked', !!(b.messages.find((m) => m.t === 'peer' && m.state === 'linked')));

    // Теперь B вводит IP A: канал не должен пересоздаваться, mutual становится true.
    b.send({ t: 'connect', ip: '127.0.0.1:8080' });
    const mutualA = await a.want((m) => m.state === 'linked' && m.mutual === true);
    const mutualB = await b.want((m) => m.state === 'linked' && m.mutual === true);
    check('A mutual connected', mutualA.mutual === true, mutualA);
    check('B mutual connected', mutualB.mutual === true, mutualB);
    check('host role opposite', mutualA.isHost !== mutualB.isHost, { a: mutualA.isHost, b: mutualB.isHost });
    check('peers see each other IP', mutualA.peerIp === '127.0.0.1' && mutualB.peerIp === '127.0.0.1', {
      a: mutualA.peerIp, b: mutualB.peerIp
    });

    // Релей в обе стороны.
    a.relay({ t: 'hello', n: 1 });
    b.relay({ t: 'hello', n: 2 });
    await sleep(300);
    check('relay A -> B', !!b.messages.find((m) => m.t === 'relay' && m.data && m.data.n === 1));
    check('relay B -> A', !!a.messages.find((m) => m.t === 'relay' && m.data && m.data.n === 2));

    // Повторный connect на тот же IP не должен рвать канал.
    a.send({ t: 'connect', ip: '127.0.0.1:8081' });
    await sleep(400);
    const stillA = a.messages.filter((m) => m.t === 'peer').slice(-1)[0];
    const stillB = b.messages.filter((m) => m.t === 'peer').slice(-1)[0];
    check('reconnect same IP keeps link', stillA.state === 'linked' && stillA.mutual === true, stillA);
    check('peer still linked', stillB.state === 'linked' && stillB.mutual === true, stillB);

    // Отключение.
    a.send({ t: 'disconnect' });
    const idleB = await b.want((m) => m.state === 'idle');
    check('B sees idle after A disconnect', idleB.state === 'idle', idleB);

    // Одновременное подключение с обеих сторон: должен остаться один канал.
    a.send({ t: 'connect', ip: '127.0.0.1:8081' });
    b.send({ t: 'connect', ip: '127.0.0.1:8080' });
    const againA = await a.want((m) => m.state === 'linked' && m.mutual === true);
    const againB = await b.want((m) => m.state === 'linked' && m.mutual === true);
    await sleep(700);
    a.relay({ t: 'hello', n: 3 });
    await sleep(300);
    check('simultaneous connect mutual', againA.mutual === true && againB.mutual === true);
    check('single link survives relay', !!b.messages.find((m) => m.t === 'relay' && m.data && m.data.n === 3));
    check('roles stable', againA.isHost !== againB.isHost, { a: againA.isHost, b: againB.isHost });
  } finally {
    try { if (a) a.ws.close(); } catch (e) {}
    try { if (b) b.ws.close(); } catch (e) {}
    s1.kill();
    s2.kill();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log('\nSUMMARY', JSON.stringify({ total: results.length, failed: failed }));
  process.exitCode = failed ? 1 : 0;
})().catch((e) => {
  console.error('FAILED', e);
  process.exitCode = 1;
});
