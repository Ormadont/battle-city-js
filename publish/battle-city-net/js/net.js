/*
 * Battle City — сетевой слой браузера.
 * BCNet связывается с локальным server.js по WebSocket и обменивается
 * сообщениями с сервером второго игрока. BCUI — панель ввода IP.
 */
(function () {
  'use strict';

  var handlers = { welcome: [], peer: [], relay: [], socket: [] };
  var retryTimer = null;

  var Net = {
    available: location.protocol === 'http:' || location.protocol === 'https:',
    ws: null,
    ready: false,
    serverId: '',
    ips: [],
    port: 0,
    lastIp: '',
    peer: {
      state: 'idle',      // idle | connecting | linked | error | unavailable
      peerIp: '',
      mutual: false,
      peerWantsMe: false,
      isHost: false,
      message: ''
    },

    on: function (kind, fn) {
      if (handlers[kind]) handlers[kind].push(fn);
      return this;
    },

    emit: function (kind, data) {
      (handlers[kind] || []).forEach(function (fn) {
        try { fn(data); } catch (e) {}
      });
    },

    open: function () {
      if (!this.available || this.ws) return;
      var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
      var ws;
      try {
        ws = new WebSocket(proto + location.host + '/ws');
      } catch (e) {
        this.peer.state = 'error';
        this.peer.message = 'НЕ УДАЛОСЬ ОТКРЫТЬ СОЕДИНЕНИЕ';
        this.emit('peer', this.peer);
        return;
      }
      this.ws = ws;
      var self = this;

      ws.addEventListener('open', function () {
        self.ready = true;
        self.emit('socket', { ready: true });
      });

      ws.addEventListener('message', function (ev) {
        var m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (!m || !m.t) return;

        if (m.t === 'welcome') {
          self.serverId = m.id || '';
          self.ips = Array.isArray(m.ips) ? m.ips.slice() : [];
          self.port = m.port || (location.port ? parseInt(location.port, 10) : 80);
          self.emit('welcome', m);
          return;
        }

        if (m.t === 'peer') {
          var p = self.peer;
          if (m.state) p.state = m.state;
          if (m.state !== 'error') p.message = '';
          if (typeof m.peerIp === 'string') p.peerIp = m.peerIp;
          if (typeof m.mutual === 'boolean') p.mutual = m.mutual;
          if (typeof m.peerWantsMe === 'boolean') p.peerWantsMe = m.peerWantsMe;
          if (typeof m.isHost === 'boolean') p.isHost = m.isHost;
          if (m.message) p.message = m.message;
          if (m.state === 'idle') {
            p.mutual = false;
            p.peerWantsMe = false;
            p.peerIp = '';
            p.isHost = false;
          }
          self.emit('peer', p);
          return;
        }

        if (m.t === 'relay') {
          self.emit('relay', m.data);
        }
      });

      ws.addEventListener('close', function () {
        self.ws = null;
        self.ready = false;
        if (self.peer.state === 'linked' || self.peer.state === 'connecting') {
          self.peer.state = 'offline';
          self.peer.mutual = false;
        }
        self.emit('socket', { ready: false });
        self.emit('peer', self.peer);
        if (self.available) {
          clearTimeout(retryTimer);
          retryTimer = setTimeout(function () { Net.open(); }, 1200);
        }
      });

      ws.addEventListener('error', function () {
        // Закрытие придёт следом; статус обновится там.
      });
    },

    connect: function (rawIp) {
      var ip = String(rawIp || '').trim();
      if (!ip) {
        this.peer.state = 'error';
        this.peer.message = 'ВВЕДИТЕ IP ВТОРОГО ИГРОКА';
        this.emit('peer', this.peer);
        return false;
      }
      if (!this.ready || !this.ws) {
        this.peer.state = 'error';
        this.peer.message = 'СЕТЕВОЙ СЕРВЕР НЕ ЗАПУЩЕН';
        this.emit('peer', this.peer);
        return false;
      }
      this.lastIp = ip;
      this.peer.state = 'connecting';
      this.peer.message = '';
      this.emit('peer', this.peer);
      this.ws.send(JSON.stringify({ t: 'connect', ip: ip }));
      return true;
    },

    disconnect: function () {
      if (this.ws && this.ready) {
        this.ws.send(JSON.stringify({ t: 'disconnect' }));
      }
      this.peer.state = 'idle';
      this.peer.peerIp = '';
      this.peer.mutual = false;
      this.peer.peerWantsMe = false;
      this.emit('peer', this.peer);
    },

    send: function (data) {
      if (!this.ready || !this.ws || this.peer.state !== 'linked') return false;
      this.ws.send(JSON.stringify({ t: 'relay', data: data }));
      return true;
    },

    isConnected: function () {
      return this.peer.state === 'linked';
    },

    isMutual: function () {
      return this.peer.state === 'linked' && this.peer.mutual;
    }
  };

  // ------------------------------------------------------------------
  //  Панель ввода IP
  // ------------------------------------------------------------------

  var UI = {
    el: null,
    statusEl: null,
    ownEl: null,
    ipEl: null,
    connectBtn: null,
    startBtn: null,
    backBtn: null,
    helpEl: null,
    open: false,
    waiting: false,

    init: function () {
      this.el = document.getElementById('net-panel');
      if (!this.el) return;
      this.statusEl = document.getElementById('net-status');
      this.ownEl = document.getElementById('net-own');
      this.ipEl = document.getElementById('net-ip');
      this.connectBtn = document.getElementById('net-connect');
      this.startBtn = document.getElementById('net-start');
      this.backBtn = document.getElementById('net-back');
      this.helpEl = document.getElementById('net-help');

      var self = this;
      this.connectBtn.addEventListener('click', function () {
        if (Net.peer.state === 'linked' || Net.peer.state === 'connecting') {
          self.setWaiting(false);
          Net.disconnect();
        } else {
          var ip = self.ipEl.value.trim();
          try { localStorage.setItem('bc_peer_ip', ip); } catch (e) {}
          Net.connect(ip);
        }
        self.refresh();
      });

      this.startBtn.addEventListener('click', function () {
        var game = window.BC_GAME;
        if (!game) return;
        BCAudio.ensure();
        if (Net.peer.isHost) game.startNetHost();
        else game.requestNetStart();
        self.refresh();
      });

      this.backBtn.addEventListener('click', function () {
        if (window.BC_GAME) window.BC_GAME.closeNetSetup();
      });

      this.ipEl.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          try { localStorage.setItem('bc_peer_ip', self.ipEl.value.trim()); } catch (err) {}
          Net.connect(self.ipEl.value);
          self.refresh();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          if (window.BC_GAME) window.BC_GAME.closeNetSetup();
        }
      });

      this.ipEl.addEventListener('input', function () { self.refresh(); });

      Net.on('peer', function () {
        if (Net.peer.state !== 'linked') self.waiting = false;
        self.refresh();
      });
      Net.on('welcome', function () { self.refresh(); });
      Net.on('socket', function () { self.refresh(); });
    },

    openPanel: function () {
      if (!this.el) return;
      if (Net.available) Net.open();
      this.waiting = false;
      var saved = '';
      try { saved = localStorage.getItem('bc_peer_ip') || ''; } catch (e) {}
      if (!this.ipEl.value && saved) this.ipEl.value = saved;
      this.el.classList.remove('hidden');
      this.open = true;
      this.refresh();
      setTimeout(function () {
        try { UI.ipEl.focus(); UI.ipEl.select(); } catch (e) {}
      }, 40);
    },

    closePanel: function () {
      if (!this.el) return;
      this.el.classList.add('hidden');
      this.open = false;
      this.waiting = false;
      try { this.ipEl.blur(); } catch (e) {}
    },

    setWaiting: function (v) {
      this.waiting = !!v;
      this.refresh();
    },

    ownIps: function () {
      if (!Net.available) return '';
      var ips = Net.ips.length ? Net.ips : ['127.0.0.1'];
      return ips.join('  ·  ') + (Net.port ? ':' + Net.port : '');
    },

    refresh: function () {
      if (!this.el) return;
      var p = Net.peer;
      var kind = 'idle';
      var text = 'ВВЕДИТЕ IP ВТОРОГО ИГРОКА';
      var startVisible = false;
      var connectText = 'ПОДКЛЮЧИТЬСЯ';
      var ipDisabled = false;

      if (!Net.available) {
        kind = 'err';
        text = 'ОТКРОЙТЕ ИГРУ ЧЕРЕЗ server.js: node server.js → http://ВАШ_IP:8080/';
        ipDisabled = true;
      } else if (p.state === 'linked') {
        connectText = 'ОТКЛЮЧИТЬСЯ';
        if (p.mutual) {
          kind = 'ok';
          text = 'ПОДКЛЮЧЕНО: ' + p.peerIp + (p.isHost ? '  ·  ВЫ — ХОЗЯИН' : '  ·  ВЫ — ГОСТЬ');
          startVisible = true;
        } else if (p.peerWantsMe) {
          kind = 'warn';
          text = 'СОПЕРНИК ' + (p.peerIp || '') + ' ЖДЁТ ВАШ IP — ВВЕДИТЕ ЕГО';
        } else {
          kind = 'warn';
          text = 'СОПЕРНИК НАЙДЕН (' + (p.peerIp || '') + '). ПОПРОСИТЕ ЕГО ВВЕСТИ ВАШ IP';
        }
      } else if (p.state === 'connecting') {
        kind = 'warn';
        text = 'ПОДКЛЮЧЕНИЕ' + (p.peerIp ? ' К ' + p.peerIp : '') + '…';
        connectText = 'ОТМЕНИТЬ';
      } else if (p.state === 'error') {
        kind = 'err';
        text = p.message || 'ОШИБКА СОЕДИНЕНИЯ';
      } else if (p.state === 'offline') {
        kind = 'err';
        text = 'ЛОКАЛЬНЫЙ СЕРВЕР НЕ ОТВЕЧАЕТ. ЗАПУСТИТЕ node server.js';
      } else {
        kind = 'idle';
        text = 'ВВЕДИТЕ IP ВТОРОГО ИГРОКА';
      }

      if (this.waiting && p.state === 'linked') {
        kind = 'warn';
        text = 'ОЖИДАНИЕ ХОЗЯИНА…';
        startVisible = false;
        connectText = 'ОТМЕНА';
      }

      this.statusEl.textContent = text;
      this.statusEl.setAttribute('data-kind', kind);
      this.ownEl.textContent = Net.available ? 'ВАШ IP: ' + this.ownIps() : 'СЕТЬ НЕДОСТУПНА';
      this.connectBtn.textContent = connectText;
      this.connectBtn.disabled = ipDisabled;
      this.ipEl.disabled = ipDisabled || this.waiting;
      this.startBtn.textContent = 'НАЧАТЬ БОЙ';
      this.startBtn.disabled = this.waiting;
      this.startBtn.classList.toggle('hidden', !startVisible);
      if (this.helpEl) this.helpEl.classList.toggle('hidden', !Net.available);
    }
  };

  window.BCNet = Net;
  window.BCUI = UI;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { UI.init(); });
  } else {
    UI.init();
  }

  if (Net.available) Net.open();
  else {
    Net.peer.state = 'unavailable';
    Net.peer.message = 'ОТКРОЙТЕ ИГРУ ЧЕРЕЗ server.js';
  }
})();
