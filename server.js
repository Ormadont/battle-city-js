/*
 * Battle City — LAN-сервер для сетевой игры на двоих.
 *
 * Запуск:   node server.js            (порт 8080)
 *           node server.js --port 8081
 *
 * Сервер раздаёт игру, принимает подключение страницы по /ws
 * и соединяется с сервером второго игрока по /peer.
 * Внешних зависимостей нет: WebSocket реализован вручную,
 * исходящее соединение — через встроенный WebSocket Node.js.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const ROOT = __dirname;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const argList = process.argv.slice(2);
let argPort = '';
for (let argIndex = 0; argIndex < argList.length; argIndex++) {
  const a = argList[argIndex];
  if (a.startsWith('--port=')) argPort = a.slice('--port='.length);
  else if (a === '--port' && argList[argIndex + 1]) {
    argPort = argList[argIndex + 1];
    argIndex++;
  }
}
const PORT = parseInt(process.env.PORT || argPort || '8080', 10);

const SERVER_ID = crypto.randomBytes(6).toString('hex');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

function localAddresses() {
  const list = ['127.0.0.1', 'localhost'];
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach((name) => {
    (ifaces[name] || []).forEach((info) => {
      if (info && info.family === 'IPv4' && !info.internal) list.push(info.address);
    });
    // IPv6 может пригодиться для диагностики, но в игре ввод IPv4.
  });
  const host = os.hostname();
  if (host) list.push(host.toLowerCase());
  return list.filter((v, i, a) => a.indexOf(v) === i);
}
const LOCAL_ADDRESSES = localAddresses();
const LAN_ADDRESSES = LOCAL_ADDRESSES.filter((a) => a !== '127.0.0.1' && a !== 'localhost');

// ------------------------------------------------------------------
//  Минимальный WebSocket-сервер
// ------------------------------------------------------------------

function wsAccept(key) {
  return crypto.createHash('sha1').update(key + GUID).digest('base64');
}

function makeFrame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, payload]);
}

function createConn(socket) {
  const conn = {
    socket: socket,
    alive: true,
    closed: false,
    buffer: Buffer.alloc(0),
    fragments: [],
    fragOpcode: 0,
    onmessage: null,
    onclose: null,
    send: null,
    close: null
  };

  conn.sendFrame = function (opcode, payload) {
    if (conn.closed) return;
    try { socket.write(makeFrame(opcode, payload)); } catch (e) { conn.close(1011); }
  };
  conn.send = function (text) {
    conn.sendFrame(0x1, Buffer.from(String(text), 'utf8'));
  };
  conn.close = function (code, reason) {
    if (conn.closed) return;
    conn.closed = true;
    try {
      const payload = Buffer.alloc(2);
      payload.writeUInt16BE(code || 1000, 0);
      socket.write(makeFrame(0x8, payload));
    } catch (e) {}
    try { socket.end(); } catch (e) {}
    if (conn.onclose) conn.onclose();
  };

  function deliver(payload) {
    const text = payload.toString('utf8');
    if (conn.onmessage) conn.onmessage(text);
  }

  function parse() {
    while (!conn.closed) {
      const buf = conn.buffer;
      if (buf.length < 2) return;
      const b0 = buf[0];
      const b1 = buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;

      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        const hi = buf.readUInt32BE(2);
        const lo = buf.readUInt32BE(6);
        len = hi * 4294967296 + lo;
        offset = 10;
      }
      if (len > 4 * 1024 * 1024) { conn.close(1009); return; }

      let mask = null;
      if (masked) {
        if (buf.length < offset + 4) return;
        mask = buf.subarray(offset, offset + 4);
        offset += 4;
      }
      if (buf.length < offset + len) return;

      const payload = Buffer.from(buf.subarray(offset, offset + len));
      if (mask) {
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      conn.buffer = buf.subarray(offset + len);

      if (opcode === 0x8) { conn.close(1000); return; }
      if (opcode === 0x9) { conn.sendFrame(0xA, payload); continue; }
      if (opcode === 0xA) { conn.alive = true; continue; }
      if (opcode === 0x0) {
        conn.fragments.push(payload);
        if (fin) {
          deliver(Buffer.concat(conn.fragments));
          conn.fragments = [];
          conn.fragOpcode = 0;
        }
        continue;
      }
      if (opcode === 0x1 || opcode === 0x2) {
        if (fin) deliver(payload);
        else {
          conn.fragments = [payload];
          conn.fragOpcode = opcode;
        }
      }
    }
  }

  socket.on('data', (chunk) => {
    conn.buffer = Buffer.concat([conn.buffer, chunk]);
    parse();
  });
  socket.on('error', () => { conn.closed = true; if (conn.onclose) conn.onclose(); });
  socket.on('close', () => {
    if (!conn.closed) {
      conn.closed = true;
      if (conn.onclose) conn.onclose();
    }
  });

  return conn;
}

const heartbeat = setInterval(() => {
  connectingSockets.forEach((conn) => {
    if (!conn.alive) { conn.close(1001); return; }
    conn.alive = false;
    conn.sendFrame(0x9, Buffer.alloc(0));
  });
}, 20000);
heartbeat.unref();

// ------------------------------------------------------------------
//  Состояние ретранслятора
// ------------------------------------------------------------------

const pages = new Set();       // WebSocket-соединения страниц
let localWant = null;          // IP, который ввёл пользователь на этой машине
let primary = null;            // активное соединение с сервером второго игрока
let connecting = null;         // исходящее соединение в процессе установки
let connectTimer = null;
const connectingSockets = new Set();

function ipv4(address) {
  if (!address) return '';
  return String(address).replace(/^::ffff:/, '');
}

function parseTarget(raw) {
  if (!raw) return null;
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/^wss?:\/\//, '').replace(/\/.*$/, '').replace(/\s+/g, '');
  const m = s.match(/^([a-z0-9.\-]+)(?::(\d{1,5}))?$/);
  if (!m) return null;
  const port = m[2] ? parseInt(m[2], 10) : PORT;
  if (!(port > 0 && port < 65536)) return null;
  return { host: m[1], port: port };
}

function matchesLocal(host) {
  if (!host) return false;
  const h = String(host).toLowerCase();
  return LOCAL_ADDRESSES.indexOf(h) >= 0;
}

function peerWantsMe(link) {
  if (!link || !link.peerWant) return false;
  return matchesLocal(link.peerWant);
}

function linkStatus() {
  if (!primary || !primary.ready) return null;
  return {
    state: 'linked',
    peerIp: primary.peerAddr,
    peerId: primary.peerId,
    mutual: !!(localWant && peerWantsMe(primary)),
    peerWantsMe: peerWantsMe(primary),
    isHost: SERVER_ID < primary.peerId,
    serverId: SERVER_ID
  };
}

function broadcastStatus(extra) {
  const st = linkStatus();
  const payload = st ? Object.assign({ t: 'peer' }, st) : Object.assign({ t: 'peer', state: 'idle' }, extra || {});
  const text = JSON.stringify(payload);
  pages.forEach((p) => p.send(text));
}

function sendStatus(conn) {
  const st = linkStatus();
  conn.send(JSON.stringify(st ? Object.assign({ t: 'peer' }, st) : { t: 'peer', state: 'idle' }));
}

function normalizeHost(host) {
  return String(host || '').toLowerCase();
}

function linkSend(link, data) {
  if (link && link.ready && !link.conn.closed) {
    try { link.conn.send(JSON.stringify(data)); } catch (e) {}
  }
}

function makeLink(conn, incoming, peerAddr) {
  const link = {
    conn: conn,
    incoming: !!incoming,
    peerAddr: ipv4(peerAddr),
    peerId: '',
    peerWant: null,
    ready: false
  };
  conn.onmessage = (text) => {
    let m = null;
    try { m = JSON.parse(text); } catch (e) { return; }
    if (!m || !m.t) return;

    if (m.t === 'hello') {
      if (link.ready) return;
      link.peerId = String(m.id || '');
      link.peerWant = m.want ? normalizeHost(String(m.want).replace(/:\d+$/, '')) : null;
      if (!link.peerId) { conn.close(1008); return; }

      if (primary && !primary.conn.closed && primary.peerId !== link.peerId) {
        // Уже есть связь с другим игроком.
        linkSend(link, { t: 'bye', reason: 'busy' });
        setTimeout(() => conn.close(1000), 20);
        return;
      }

      // Оба игрока могут одновременно подключиться друг к другу.
      // Если канал уже есть, оставляем соединение, инициированное
      // меньшим serverId. Если канала нет — принимаем это соединение.
      // Сравниваем именно инициатора канала (для входящего это peerId,
      // для исходящего — наш SERVER_ID), иначе стороны могут выбрать
      // разные каналы и закрыть оба.
      let keepNew = true;
      if (primary && !primary.conn.closed && primary !== link) {
        const linkInit = incoming ? link.peerId : SERVER_ID;
        const primInit = primary.incoming ? primary.peerId : SERVER_ID;
        keepNew = linkInit < primInit;
      }
      if (!keepNew) {
        linkSend(link, { t: 'bye', reason: 'duplicate' });
        setTimeout(() => conn.close(1000), 20);
        return;
      }

      link.ready = true;
      if (primary && primary !== link && !primary.conn.closed) {
        const old = primary;
        primary = link;
        old.conn.onclose = null;
        try { old.conn.close(1000); } catch (e) {}
      } else {
        primary = link;
      }

      linkSend(link, { t: 'want', ip: localWant });
      broadcastStatus();
      return;
    }

    if (m.t === 'want') {
      link.peerWant = m.ip ? normalizeHost(String(m.ip).replace(/:\d+$/, '')) : null;
      if (primary === link) broadcastStatus();
      return;
    }

    if (m.t === 'relay') {
      if (!link.ready) return;
      const out = JSON.stringify({ t: 'relay', data: m.data });
      pages.forEach((p) => p.send(out));
      return;
    }

    if (m.t === 'bye') {
      conn.close(1000);
    }
  };

  conn.onclose = () => {
    if (primary === link) {
      primary = null;
      broadcastStatus();
    }
  };

  try {
    conn.send(JSON.stringify({ t: 'hello', id: SERVER_ID, want: localWant, port: PORT }));
  } catch (e) {}

  return link;
}

function closePrimary() {
  if (primary) {
    const link = primary;
    primary = null;
    try { link.conn.close(1000); } catch (e) {}
  }
  if (connecting) {
    try { connecting.close(); } catch (e) {}
    connecting = null;
  }
  if (connectTimer) {
    clearTimeout(connectTimer);
    connectTimer = null;
  }
}

function connectTo(raw) {
  const target = parseTarget(raw);
  if (!target) {
    broadcastStatus({ state: 'error', message: 'НЕВЕРНЫЙ IP' });
    return;
  }
  if (target.port === PORT && matchesLocal(target.host)) {
    broadcastStatus({ state: 'error', message: 'ЭТО ВАШ СОБСТВЕННЫЙ IP' });
    return;
  }

  // Если канал с этим игроком уже открыт (он подключился первым),
  // не разрываем его: достаточно сообщить, что мы тоже выбрали его IP.
  if (primary && primary.ready && !primary.conn.closed &&
      normalizeHost(primary.peerAddr) === target.host) {
    localWant = target.host;
    linkSend(primary, { t: 'want', ip: localWant });
    broadcastStatus();
    return;
  }

  closePrimary();
  localWant = target.host;

  const url = 'ws://' + target.host + ':' + target.port + '/peer';
  let socket = null;
  try {
    socket = new WebSocket(url);
  } catch (e) {
    broadcastStatus({ state: 'error', message: 'НЕ УДАЛОСЬ НАЧАТЬ ПОДКЛЮЧЕНИЕ' });
    return;
  }

  connectTimer = setTimeout(() => {
    if (connecting === socket) {
      connecting = null;
      try { socket.close(); } catch (e) {}
      broadcastStatus({ state: 'error', message: 'НЕТ ОТВЕТА ОТ ' + target.host });
    }
  }, 5000);

  socket.addEventListener('open', () => {
    if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
    const wasConnecting = connecting;
    connecting = null;
    if (wasConnecting && wasConnecting !== socket) {
      try { socket.close(); } catch (e) {}
      return;
    }
    const conn = {
      closed: false,
      send: (text) => {
        if (conn.closed) return;
        try { socket.send(text); } catch (e) {}
      },
      close: (code) => {
        if (conn.closed) return;
        conn.closed = true;
        try { socket.close(code || 1000, ''); } catch (e) {}
        if (conn.onclose) conn.onclose();
      }
    };
    conn.onclose = null;
    const link = makeLink(conn, false, target.host);
    socket.addEventListener('message', (ev) => {
      const text = typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8');
      if (conn.onmessage) conn.onmessage(text);
    });
    socket.addEventListener('close', () => {
      if (!conn.closed) {
        conn.closed = true;
        if (conn.onclose) conn.onclose();
      }
    });
    socket.addEventListener('error', () => {
      if (!link.ready) {
        broadcastStatus({ state: 'error', message: 'ОШИБКА СОЕДИНЕНИЯ С ' + target.host });
      }
    });
  });

  socket.addEventListener('error', () => {
    if (connecting === socket) {
      connecting = null;
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      broadcastStatus({ state: 'error', message: 'НЕ УДАЛОСЬ ПОДКЛЮЧИТЬСЯ К ' + target.host + ':' + target.port });
    }
  });

  socket.addEventListener('close', () => {
    if (connecting === socket) {
      connecting = null;
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
    }
  });

  connecting = socket;
  broadcastStatus({ state: 'connecting', peerIp: target.host });
}

// ------------------------------------------------------------------
//  HTTP + upgrade
// ------------------------------------------------------------------

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch (e) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';

  const file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Не найдено: ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
});

server.on('upgrade', (req, socket) => {
  const urlPath = (req.url || '').split('?')[0];
  if (urlPath !== '/ws' && urlPath !== '/peer') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + wsAccept(key) + '\r\n\r\n'
  );
  socket.setNoDelay(true);

  const conn = createConn(socket);
  connectingSockets.add(conn);
  conn.onclose = null;
  const origClose = conn.close;
  conn.close = (code, reason) => {
    origClose(code, reason);
    connectingSockets.delete(conn);
  };
  const origOnClose = socket.listeners('close');
  socket.on('close', () => connectingSockets.delete(conn));

  if (urlPath === '/ws') {
    pages.add(conn);
    conn.send(JSON.stringify({
      t: 'welcome',
      id: SERVER_ID,
      ips: LAN_ADDRESSES,
      allIps: LOCAL_ADDRESSES,
      port: PORT
    }));
    sendStatus(conn);

    conn.onmessage = (text) => {
      let m = null;
      try { m = JSON.parse(text); } catch (e) { return; }
      if (!m || !m.t) return;
      if (m.t === 'connect') {
        connectTo(m.ip);
      } else if (m.t === 'disconnect') {
        localWant = null;
        closePrimary();
        broadcastStatus();
      } else if (m.t === 'relay') {
        if (primary && primary.ready) {
          linkSend(primary, { t: 'relay', data: m.data });
        }
      }
    };
    conn.onclose = () => {
      pages.delete(conn);
      connectingSockets.delete(conn);
      if (pages.size === 0) {
        // Страница закрыта — освобождаем канал для второго игрока.
        localWant = null;
        closePrimary();
      }
    };
    return;
  }

  // /peer — соединение от сервера второго игрока.
  const addr = ipv4(socket.remoteAddress || '');
  makeLink(conn, true, addr);
});

server.on('connection', (socket) => {
  socket.setNoDelay(true);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error('Порт ' + PORT + ' уже занят. Запустите с другим портом: node server.js --port 8081');
  } else {
    console.error('Ошибка сервера:', err && err.message);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  BATTLE CITY — сервер сетевой игры');
  console.log('  ---------------------------------');
  console.log('  Порт: ' + PORT);
  LAN_ADDRESSES.forEach((ip) => {
    console.log('  Откройте на этом компьютере: http://' + ip + ':' + PORT + '/');
  });
  if (!LAN_ADDRESSES.length) {
    console.log('  Локальная сеть не обнаружена, используйте http://127.0.0.1:' + PORT + '/');
  }
  console.log('');
  console.log('  На обоих компьютерах запустите этот файл,');
  console.log('  откройте страницу и выберите «2 ИГРОКА — СЕТЬ»,');
  console.log('  затем введите IP второго компьютера.');
  console.log('');
});
