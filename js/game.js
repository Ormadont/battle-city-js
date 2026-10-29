/*
 * Battle City — танковая аркада на чистом JavaScript.
 * Рендер — Canvas 2D, звук — WebAudio, без внешних библиотек и ассетов.
 */
(function () {
  'use strict';

  // ================================================================
  //  Константы
  // ================================================================

  var CELL = 16;
  var COLS = 26;
  var ROWS = 26;
  var FIELD_W = COLS * CELL;   // 416
  var FIELD_H = ROWS * CELL;   // 416

  var OFF_X = 12;
  var OFF_Y = 12;
  var CANVAS_W = 560;
  var CANVAS_H = 440;

  var PANEL_X = 440;
  var PANEL_Y = 12;
  var PANEL_W = 108;
  var PANEL_H = 416;

  var T = { EMPTY: 0, BRICK: 1, STEEL: 2, WATER: 3, TREE: 4, ICE: 5, BASE: 6 };
  var DIR = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 };
  var DIR_VEC = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  var PLAYER_SPAWN = { x: 8 * CELL, y: 24 * CELL };
  var PLAYER2_SPAWN = { x: 16 * CELL, y: 24 * CELL };
  var BASE_RECT = { x: 12 * CELL, y: 24 * CELL, w: 32, h: 32 };
  var SPAWN_POINTS = [
    { x: 0, y: 0 },
    { x: 12 * CELL, y: 0 },
    { x: 24 * CELL, y: 0 }
  ];

  var FORT_CELLS = [
    [11, 23], [12, 23], [13, 23], [14, 23],
    [11, 24], [11, 25], [14, 24], [14, 25]
  ];

  var ENEMY_STATS = {
    basic: { speed: 62, hp: 1, bulletSpeed: 255, fireDelay: [0.75, 1.9], score: 100 },
    fast:  { speed: 112, hp: 1, bulletSpeed: 300, fireDelay: [0.65, 1.5], score: 200 },
    power: { speed: 66, hp: 1, bulletSpeed: 460, fireDelay: [0.55, 1.35], score: 300 },
    armor: { speed: 64, hp: 4, bulletSpeed: 300, fireDelay: [0.8, 1.8], score: 400 }
  };

  var POWER_TYPES = ['star', 'grenade', 'helmet', 'shovel', 'clock', 'life'];

  // ================================================================
  //  Утилиты
  // ================================================================

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function pad(num, len) {
    var s = String(Math.max(0, Math.floor(num)));
    while (s.length < len) s = '0' + s;
    return s;
  }
  function loadHigh() {
    try { return parseInt(localStorage.getItem('bc_hi') || '0', 10) || 0; } catch (e) { return 0; }
  }
  function setFont(size, weight) {
    view.font = (weight || 'bold') + ' ' + size + 'px "Courier New", Courier, monospace';
  }
  function textCentered(text, x, y, size, color, weight, shadow) {
    view.textAlign = 'center';
    view.textBaseline = 'alphabetic';
    setFont(size, weight);
    if (shadow) {
      view.fillStyle = shadow;
      view.fillText(text, x + 2, y + 2);
    }
    view.fillStyle = color;
    view.fillText(text, x, y);
  }

  // ================================================================
  //  Canvas
  // ================================================================

  var canvas = document.getElementById('game');
  var view = canvas.getContext('2d');
  view.imageSmoothingEnabled = false;

  // ================================================================
  //  Палитры
  // ================================================================

  var PAL = {
    player: { body: '#e8c020', light: '#ffe86a', dark: '#8f6f00', track: '#4a3a00', trackLight: '#a58a1c' },
    player2: { body: '#46c86a', light: '#b4f2b8', dark: '#1d6b34', track: '#103a1c', trackLight: '#3f8a52' },
    basic:  { body: '#b7bcc4', light: '#eef1f6', dark: '#62676d', track: '#3a3d42', trackLight: '#7c8188' },
    fast:   { body: '#d7dcf0', light: '#ffffff', dark: '#7a82a8', track: '#3f4258', trackLight: '#8a93b8' },
    power:  { body: '#a9b878', light: '#e0eaa8', dark: '#5f6b3a', track: '#333b1e', trackLight: '#7a874c' },
    armor4: { body: '#5eb85a', light: '#a8f0a0', dark: '#2f6b2c', track: '#1e3a1c', trackLight: '#3f7c3c' },
    armor3: { body: '#d8c14a', light: '#fff0a0', dark: '#8a7620', track: '#3a3210', trackLight: '#8a7a30' },
    armor2: { body: '#d08a3a', light: '#ffc880', dark: '#7a4a18', track: '#3a2410', trackLight: '#8a5c2c' },
    armor1: { body: '#b7bcc4', light: '#eef1f6', dark: '#62676d', track: '#3a3d42', trackLight: '#7c8188' }
  };

  function enemyPalette(tank) {
    if (tank.type === 'armor') return PAL['armor' + clamp(tank.hp, 1, 4)];
    return PAL[tank.type] || PAL.basic;
  }

  // ================================================================
  //  Ввод
  // ================================================================

  var DIR_CODES = {
    ArrowUp: DIR.UP, KeyW: DIR.UP,
    ArrowRight: DIR.RIGHT, KeyD: DIR.RIGHT,
    ArrowDown: DIR.DOWN, KeyS: DIR.DOWN,
    ArrowLeft: DIR.LEFT, KeyA: DIR.LEFT
  };

  var PREVENT = {
    ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1,
    Space: 1, Enter: 1, KeyP: 1, KeyM: 1, KeyW: 1, KeyA: 1,
    KeyS: 1, KeyD: 1, KeyJ: 1, KeyZ: 1, Escape: 1
  };

  var Input = {
    keys: {},
    justPressed: {},
    order: [],
    isDown: function (code) { return !!this.keys[code]; },
    wasPressed: function (code) { return !!this.justPressed[code]; },
    press: function (code) {
      if (!this.keys[code]) {
        this.justPressed[code] = true;
        if (DIR_CODES[code] !== undefined) {
          this.order = this.order.filter(function (c) { return c !== code; });
          this.order.push(code);
        }
      }
      this.keys[code] = true;
      BCAudio.ensure();
    },
    release: function (code) {
      this.keys[code] = false;
      this.order = this.order.filter(function (c) { return c !== code; });
    },
    currentDir: function () {
      for (var i = this.order.length - 1; i >= 0; i--) {
        var code = this.order[i];
        if (this.keys[code]) return DIR_CODES[code];
      }
      return -1;
    },
    endFrame: function () { this.justPressed = {}; },
    clear: function () { this.keys = {}; this.order = []; }
  };

  window.addEventListener('keydown', function (e) {
    if (PREVENT[e.code]) e.preventDefault();
    if (!e.repeat) Input.press(e.code);
    else BCAudio.ensure();
  });
  window.addEventListener('keyup', function (e) {
    Input.release(e.code);
  });
  window.addEventListener('blur', function () {
    Input.clear();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && window.BC_GAME) window.BC_GAME.autoPause();
  });

  var touchButtons = document.querySelectorAll('#touch-controls .tbtn');
  Array.prototype.forEach.call(touchButtons, function (btn) {
    var code = btn.getAttribute('data-key');
    if (!code) return;
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (btn.setPointerCapture) {
        try { btn.setPointerCapture(e.pointerId); } catch (err) {}
      }
      Input.press(code);
    });
    var release = function (e) {
      if (e) e.preventDefault();
      Input.release(code);
    };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', function (e) {
      if (e.buttons) release(e);
    });
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });

  canvas.addEventListener('pointerdown', function (e) {
    BCAudio.ensure();
    if (!window.BC_GAME) return;
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * CANVAS_W / (rect.width || CANVAS_W);
    var y = (e.clientY - rect.top) * CANVAS_H / (rect.height || CANVAS_H);
    window.BC_GAME.pointerDown(x, y);
  });

  // ================================================================
  //  Отрисовка спрайтов и рельефа
  // ================================================================

  function drawTankSprite(context, x, y, dir, pal, tread) {
    var cx = x + 16;
    var cy = y + 16;
    context.save();
    context.translate(cx, cy);
    context.rotate(dir * Math.PI / 2);

    // гусеницы
    context.fillStyle = pal.track;
    context.fillRect(-16, -14, 7, 28);
    context.fillRect(9, -14, 7, 28);

    var off = Math.floor(tread) % 4;
    context.fillStyle = pal.trackLight;
    for (var i = 0; i < 7; i++) {
      var yy = -14 + ((i * 4 + off) % 28);
      context.fillRect(-16, yy, 7, 2);
      context.fillRect(9, yy, 7, 2);
    }

    // корпус
    context.fillStyle = pal.dark;
    context.fillRect(-8, -13, 16, 26);
    context.fillStyle = pal.body;
    context.fillRect(-7, -12, 14, 24);
    context.fillStyle = pal.light;
    context.fillRect(-6, -11, 2, 20);

    // башня
    context.fillStyle = pal.dark;
    context.fillRect(-6, -8, 12, 16);
    context.fillStyle = pal.body;
    context.fillRect(-5, -7, 10, 14);

    // ствол
    context.fillStyle = pal.dark;
    context.fillRect(-2, -16, 4, 10);
    context.fillStyle = pal.light;
    context.fillRect(-1, -16, 1, 9);

    // люк
    context.fillStyle = pal.light;
    context.fillRect(-3, -4, 6, 5);
    context.fillStyle = pal.dark;
    context.fillRect(-2, -3, 4, 3);

    context.restore();
  }

  function drawMiniTank(context, x, y, pal) {
    context.fillStyle = pal.track;
    context.fillRect(x, y + 2, 3, 9);
    context.fillRect(x + 10, y + 2, 3, 9);
    context.fillStyle = pal.body;
    context.fillRect(x + 3, y + 4, 7, 6);
    context.fillRect(x + 5, y, 3, 5);
    context.fillStyle = pal.light;
    context.fillRect(x + 6, y + 1, 1, 3);
  }

  function drawStarShape(context, cx, cy, r, color) {
    context.save();
    context.translate(cx, cy);
    context.beginPath();
    for (var i = 0; i < 10; i++) {
      var rad = (i % 2 === 0) ? r : r * 0.45;
      var a = -Math.PI / 2 + i * Math.PI / 5;
      var px = Math.cos(a) * rad;
      var py = Math.sin(a) * rad;
      if (i === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fillStyle = color;
    context.fill();
    context.restore();
  }

  function drawBrick(context, x, y) {
    context.fillStyle = '#4a2212';
    context.fillRect(x, y, 16, 16);
    context.fillStyle = '#b1532c';
    context.fillRect(x, y, 7, 7);
    context.fillRect(x + 9, y, 7, 7);
    context.fillRect(x + 1, y + 9, 7, 7);
    context.fillRect(x + 9, y + 9, 7, 7);
    context.fillStyle = '#d97a4a';
    context.fillRect(x, y, 7, 1);
    context.fillRect(x + 9, y, 7, 1);
    context.fillRect(x + 1, y + 9, 7, 1);
    context.fillRect(x + 9, y + 9, 7, 1);
  }

  function drawSteel(context, x, y) {
    context.fillStyle = '#39424a';
    context.fillRect(x, y, 16, 16);
    context.fillStyle = '#c7d2d8';
    context.fillRect(x + 1, y + 1, 14, 13);
    context.fillStyle = '#f2f7fa';
    context.fillRect(x + 2, y + 2, 12, 3);
    context.fillStyle = '#8b979f';
    context.fillRect(x + 2, y + 11, 12, 2);
    context.fillStyle = '#5c676f';
    context.fillRect(x + 13, y + 2, 2, 11);
  }

  function drawWater(context, x, y, time) {
    context.fillStyle = '#0f3a6b';
    context.fillRect(x, y, 16, 16);
    context.fillStyle = '#1d5c98';
    var dy = Math.round(Math.sin(time * 2.4 + x * 0.25 + y * 0.5) * 2);
    context.fillRect(x, y + 5 + dy, 16, 4);
    context.fillStyle = '#5fb0e8';
    var dy2 = Math.round(Math.sin(time * 2.4 + x * 0.25 + y * 0.5 + 1.6) * 2);
    context.fillRect(x + 3, y + 3 + dy2, 9, 2);
    context.fillStyle = '#2f7ab8';
    context.fillRect(x + 1, y + 13 - dy, 11, 2);
  }

  function drawIce(context, x, y) {
    context.fillStyle = '#7fb0c9';
    context.fillRect(x, y, 16, 16);
    context.fillStyle = '#cfe9f5';
    context.fillRect(x + 1, y + 1, 14, 14);
    context.fillStyle = '#eaf8ff';
    context.fillRect(x + 3, y + 4, 5, 1);
    context.fillRect(x + 9, y + 9, 4, 1);
    context.fillRect(x + 3, y + 12, 3, 1);
    context.fillStyle = '#a3cddf';
    context.fillRect(x + 10, y + 2, 2, 2);
  }

  function drawTreeOverlay(context, x, y) {
    context.fillStyle = '#163d16';
    context.fillRect(x, y, 16, 16);
    context.fillStyle = '#256b25';
    context.fillRect(x + 1, y + 2, 10, 9);
    context.fillRect(x + 7, y + 4, 8, 9);
    context.fillStyle = '#348a32';
    context.fillRect(x + 3, y + 1, 6, 6);
    context.fillRect(x + 9, y + 7, 5, 6);
    context.fillStyle = '#46a544';
    context.fillRect(x + 4, y + 3, 3, 3);
    context.fillRect(x + 10, y + 9, 2, 2);
  }

  function drawEagle(context, x, y, alive, time) {
    context.fillStyle = '#0a0a0a';
    context.fillRect(x, y, 32, 32);

    if (!alive) {
      context.fillStyle = '#37393d';
      context.fillRect(x + 4, y + 22, 24, 8);
      context.fillRect(x + 8, y + 16, 7, 8);
      context.fillRect(x + 18, y + 18, 6, 6);
      context.fillStyle = '#5e6167';
      context.fillRect(x + 6, y + 20, 4, 3);
      context.fillRect(x + 20, y + 15, 4, 3);
      context.fillStyle = '#7a2015';
      context.fillRect(x + 14, y + 24, 4, 3);
      var f = Math.floor(time * 8) % 3;
      context.fillStyle = f === 0 ? '#ff9a2a' : (f === 1 ? '#ffd84a' : '#c93a12');
      context.fillRect(x + 13, y + 18 - f * 2, 4, 5);
      return;
    }

    // расправленные крылья
    context.fillStyle = '#e8e8ea';
    context.fillRect(x + 1, y + 12, 11, 4);
    context.fillRect(x + 2, y + 15, 9, 4);
    context.fillRect(x + 4, y + 9, 8, 4);
    context.fillRect(x + 20, y + 12, 11, 4);
    context.fillRect(x + 21, y + 15, 9, 4);
    context.fillRect(x + 20, y + 9, 8, 4);

    // тело
    context.fillRect(x + 12, y + 9, 8, 13);

    // голова
    context.fillRect(x + 13, y + 4, 6, 6);

    // клюв и лапы
    context.fillStyle = '#e2b23a';
    context.fillRect(x + 19, y + 6, 3, 2);
    context.fillRect(x + 21, y + 8, 2, 1);
    context.fillRect(x + 10, y + 24, 4, 2);
    context.fillRect(x + 18, y + 24, 4, 2);

    // хвост
    context.fillStyle = '#b9bdc4';
    context.fillRect(x + 12, y + 22, 8, 2);
    context.fillRect(x + 11, y + 24, 3, 2);
    context.fillRect(x + 15, y + 24, 2, 2);
    context.fillRect(x + 18, y + 24, 3, 2);

    // тени на крыльях
    context.fillStyle = '#9aa0a8';
    context.fillRect(x + 2, y + 17, 7, 2);
    context.fillRect(x + 23, y + 17, 7, 2);
    context.fillRect(x + 5, y + 11, 5, 1);
    context.fillRect(x + 22, y + 11, 5, 1);

    // глаз
    context.fillStyle = '#111111';
    context.fillRect(x + 16, y + 6, 2, 2);

    // постамент
    context.fillStyle = '#4a3a10';
    context.fillRect(x + 10, y + 27, 12, 2);
  }

  function drawShield(context, tank, time) {
    var cx = tank.x + 16;
    var cy = tank.y + 16;
    var a = 0.55 + 0.35 * Math.sin(time * 10);
    context.save();
    context.strokeStyle = 'rgba(150,225,255,' + a.toFixed(3) + ')';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(cx, cy, 21, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = 'rgba(215,245,255,' + Math.min(1, a + 0.2).toFixed(3) + ')';
    for (var i = 0; i < 4; i++) {
      var ang = time * 4 + i * Math.PI / 2;
      context.fillRect(Math.round(cx + Math.cos(ang) * 21) - 2, Math.round(cy + Math.sin(ang) * 21) - 2, 4, 4);
    }
    context.restore();
  }

  function drawSpawnStar(context, x, y, timer, time) {
    var progress = clamp(1 - timer / 1.05, 0, 1);
    var outer = 6 + 9 * progress;
    var inner = 2.5 + 2 * progress;
    context.save();
    context.translate(x + 16, y + 16);
    context.rotate(time * 7);
    context.beginPath();
    var spikes = 4;
    for (var i = 0; i < spikes * 2; i++) {
      var rad = (i % 2 === 0) ? outer : inner;
      var ang = i * Math.PI / spikes;
      var px = Math.cos(ang) * rad;
      var py = Math.sin(ang) * rad;
      if (i === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fillStyle = (Math.floor(time * 14) % 2 === 0) ? '#ffffff' : '#8fe6ff';
    context.fill();
    context.restore();
  }

  function drawPowerUpIcon(context, pu, time) {
    var x = pu.x;
    var y = pu.y;
    var pulse = 0.5 + 0.5 * Math.sin(time * 5 + pu.phase);
    var cx = x + 16;
    var cy = y + 16;

    context.fillStyle = '#101014';
    context.fillRect(x, y, 32, 32);
    context.strokeStyle = 'rgba(255,226,110,' + (0.35 + 0.5 * pulse).toFixed(3) + ')';
    context.lineWidth = 2;
    context.strokeRect(x + 1, y + 1, 30, 30);
    context.strokeStyle = 'rgba(255,255,255,0.12)';
    context.lineWidth = 1;
    context.strokeRect(x + 4, y + 4, 24, 24);

    if (pu.type === 'star') {
      drawStarShape(context, cx, cy, 12, '#ffd84a');
      drawStarShape(context, cx, cy, 5, '#fff6c0');
    } else if (pu.type === 'helmet') {
      context.fillStyle = '#cfe3ef';
      context.beginPath();
      context.arc(cx, cy + 2, 10, Math.PI, 0);
      context.fill();
      context.fillRect(cx - 10, cy + 2, 20, 4);
      context.fillStyle = '#74838f';
      context.fillRect(cx - 11, cy + 6, 22, 3);
      context.fillStyle = '#ffffff';
      context.fillRect(cx - 6, cy - 7, 4, 7);
    } else if (pu.type === 'grenade') {
      context.fillStyle = '#39463a';
      context.beginPath();
      context.arc(cx, cy + 3, 9, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#6f8266';
      context.fillRect(cx - 3, cy - 10, 6, 4);
      context.strokeStyle = '#d0a040';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(cx + 2, cy - 9);
      context.quadraticCurveTo(cx + 10, cy - 12, cx + 7, cy - 4);
      context.stroke();
      context.fillStyle = '#ffd84a';
      context.fillRect(cx + 6, cy - 6, 3, 3);
    } else if (pu.type === 'clock') {
      context.fillStyle = '#e8eef2';
      context.beginPath();
      context.arc(cx, cy, 10, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#4a5a68';
      context.lineWidth = 2;
      context.stroke();
      context.strokeStyle = '#28323a';
      context.beginPath();
      context.moveTo(cx, cy);
      context.lineTo(cx, cy - 6);
      context.moveTo(cx, cy);
      context.lineTo(cx + 5, cy + 2);
      context.stroke();
    } else if (pu.type === 'shovel') {
      context.fillStyle = '#a87a3c';
      context.fillRect(cx - 2, cy - 12, 4, 13);
      context.fillStyle = '#8a6a2a';
      context.fillRect(cx - 6, cy - 12, 12, 3);
      context.fillStyle = '#c8d2d8';
      context.beginPath();
      context.moveTo(cx - 7, cy + 1);
      context.lineTo(cx + 7, cy + 1);
      context.lineTo(cx + 4, cy + 11);
      context.lineTo(cx - 4, cy + 11);
      context.closePath();
      context.fill();
      context.fillStyle = '#7a868e';
      context.fillRect(cx - 1, cy + 3, 2, 6);
    } else if (pu.type === 'life') {
      drawTankSprite(context, cx - 16, cy - 16, DIR.UP, PAL.player, time * 6);
    }
  }

  function drawTankEntity(context, game, tank) {
    if (tank.dead) return;
    var pal = tank.team === 'player'
      ? (tank.playerIndex === 2 ? PAL.player2 : PAL.player)
      : enemyPalette(tank);
    drawTankSprite(context, tank.x, tank.y, tank.dir, pal, tank.tread);

    if (tank.bonus && Math.floor(game.time * 10) % 2 === 0) {
      context.fillStyle = 'rgba(255,255,255,0.22)';
      context.fillRect(tank.x + 3, tank.y + 3, 26, 26);
    }
    if (tank.hitFlash > 0) {
      context.fillStyle = 'rgba(255,255,255,' + Math.min(0.8, tank.hitFlash * 6).toFixed(3) + ')';
      context.fillRect(tank.x + 2, tank.y + 2, 28, 28);
    }
    if (tank.shield > 0) drawShield(context, tank, game.time);
    if (tank.team === 'enemy' && game.freezeTimer > 0) {
      context.fillStyle = 'rgba(120,205,255,0.32)';
      context.fillRect(tank.x + 2, tank.y + 2, 28, 28);
    }
  }

  // ================================================================
  //  Танк
  // ================================================================

  function Tank(game, x, y, team, type) {
    this.game = game;
    this.id = game.nextTankId++;
    this.playerIndex = 0;
    this.x = x;
    this.y = y;
    this.w = 32;
    this.h = 32;
    this.team = team;
    this.type = type || 'basic';
    this.dir = team === 'player' ? DIR.UP : DIR.DOWN;
    this.dead = false;
    this.moving = false;
    this.blocked = false;
    this.tread = 0;
    this.fireCooldown = 0;
    this.fireTimer = rand(0.6, 1.6);
    this.aiTimer = rand(0.2, 0.9);
    this.shield = 0;
    this.hitFlash = 0;
    this.bonus = false;
    this.hp = 1;
    this.maxHp = 1;
    this.speed = 0;
    this.bulletSpeed = 280;
    this.maxBullets = 1;
    this.power = 1;
    this.scoreValue = 100;
    this.fireDelay = [0.8, 1.8];

    if (team === 'player') {
      this.applyStar();
    } else {
      var st = ENEMY_STATS[this.type] || ENEMY_STATS.basic;
      this.speed = st.speed;
      this.bulletSpeed = st.bulletSpeed;
      this.hp = st.hp;
      this.maxHp = st.hp;
      this.scoreValue = st.score;
      this.fireDelay = st.fireDelay;
    }
  }

  Tank.prototype.applyStar = function () {
    var s = this.playerIndex === 2 ? this.game.star2 : this.game.star;
    this.speed = 100 + s * 6;
    this.bulletSpeed = s >= 1 ? 350 : 280;
    this.maxBullets = s >= 2 ? 2 : 1;
    this.power = s >= 3 ? 3 : 1;
  };

  Tank.prototype.collidesAt = function (nx, ny) {
    if (nx < 0 || ny < 0 || nx + this.w > FIELD_W || ny + this.h > FIELD_H) return true;

    var x0 = Math.floor(nx / CELL);
    var x1 = Math.floor((nx + this.w - 0.01) / CELL);
    var y0 = Math.floor(ny / CELL);
    var y1 = Math.floor((ny + this.h - 0.01) / CELL);

    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        var t = this.game.map[cy][cx];
        if (t === T.BRICK || t === T.STEEL || t === T.WATER || t === T.BASE) return true;
      }
    }

    for (var i = 0; i < this.game.tanks.length; i++) {
      var o = this.game.tanks[i];
      if (o === this || o.dead) continue;
      if (nx < o.x + o.w && nx + this.w > o.x && ny < o.y + o.h && ny + this.h > o.y) return true;
    }
    return false;
  };

  Tank.prototype.tryMove = function (dt, dir) {
    if (this.dead || dir < 0) { this.moving = false; return; }

    if (dir !== this.dir) {
      this.dir = dir;
      if (dir === DIR.LEFT || dir === DIR.RIGHT) {
        var sy = Math.round(this.y / CELL) * CELL;
        if (!this.collidesAt(this.x, sy)) this.y = sy;
      } else {
        var sx = Math.round(this.x / CELL) * CELL;
        if (!this.collidesAt(sx, this.y)) this.x = sx;
      }
    }

    var speed = this.speed;
    if (this.game.tileUnder(this.x + 16, this.y + 16) === T.ICE) speed *= 1.28;

    var dist = speed * dt;
    var vec = DIR_VEC[dir];
    var steps = Math.max(1, Math.ceil(dist / 3));
    var step = dist / steps;

    this.moving = false;
    this.blocked = false;

    for (var i = 0; i < steps; i++) {
      var nx = this.x + vec[0] * step;
      var ny = this.y + vec[1] * step;
      if (this.collidesAt(nx, ny)) {
        this.blocked = true;
        break;
      }
      this.x = nx;
      this.y = ny;
      this.moving = true;
    }

    if (this.moving) this.tread += dist * 0.18;
  };

  Tank.prototype.fire = function () {
    if (this.dead || this.fireCooldown > 0) return false;
    var g = this.game;
    var mine = 0;
    for (var i = 0; i < g.bullets.length; i++) {
      if (g.bullets[i].owner === this && !g.bullets[i].dead) mine++;
    }
    if (mine >= this.maxBullets) return false;

    g.bullets.push(new Bullet(g, this, this.dir, this.bulletSpeed, this.power));
    this.fireCooldown = this.team === 'player' ? 0.18 : 0.3;
    g.sfx(this.team === 'player' ? 'shoot' : 'enemyShoot');
    return true;
  };

  Tank.prototype.pickDirection = function () {
    var g = this.game;
    var target;
    var nearest = g.nearestPlayer(this.x + 16, this.y + 16);
    if (Math.random() < 0.6 || !nearest) {
      target = { x: BASE_RECT.x + 16, y: BASE_RECT.y + 16 };
    } else {
      target = { x: nearest.x + 16, y: nearest.y + 16 };
    }

    var dx = target.x - (this.x + 16);
    var dy = target.y - (this.y + 16);
    var opts = [];

    if (Math.abs(dx) > 4) {
      opts.push(dx > 0 ? DIR.RIGHT : DIR.LEFT);
      opts.push(dx > 0 ? DIR.RIGHT : DIR.LEFT);
    }
    if (Math.abs(dy) > 4) {
      opts.push(dy > 0 ? DIR.DOWN : DIR.UP);
      opts.push(dy > 0 ? DIR.DOWN : DIR.UP);
    }
    opts.push(randInt(0, 3));

    var filtered = [];
    for (var i = 0; i < opts.length; i++) {
      if (opts[i] !== this.dir) filtered.push(opts[i]);
    }
    if (!filtered.length) filtered = opts;
    this.dir = choice(filtered);
  };

  Tank.prototype.shouldFire = function () {
    var g = this.game;
    if (g.freezeTimer > 0) return false;
    var tx = this.x + 16;
    var ty = this.y + 16;
    var players = g.alivePlayers();

    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var px = p.x + 16;
      var py = p.y + 16;
      if (this.dir === DIR.UP && Math.abs(tx - px) < 14 && py < ty) return true;
      if (this.dir === DIR.DOWN && Math.abs(tx - px) < 14 && py > ty) return true;
      if (this.dir === DIR.LEFT && Math.abs(ty - py) < 14 && px < tx) return true;
      if (this.dir === DIR.RIGHT && Math.abs(ty - py) < 14 && px > tx) return true;
    }

    if (g.base.alive) {
      var bx = BASE_RECT.x + 16;
      var by = BASE_RECT.y + 16;
      if (this.dir === DIR.UP && Math.abs(tx - bx) < 16 && by < ty) return true;
      if (this.dir === DIR.DOWN && Math.abs(tx - bx) < 16 && by > ty) return true;
      if (this.dir === DIR.LEFT && Math.abs(ty - by) < 16 && bx < tx) return true;
      if (this.dir === DIR.RIGHT && Math.abs(ty - by) < 16 && bx > tx) return true;
    }
    return Math.random() < 0.4;
  };

  Tank.prototype.updateEnemy = function (dt) {
    var g = this.game;

    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.shield > 0) this.shield -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    if (g.freezeTimer > 0) {
      this.moving = false;
      return;
    }

    this.aiTimer -= dt;
    if (this.aiTimer <= 0 || this.blocked) {
      this.pickDirection();
      this.aiTimer = rand(0.45, 1.5);
    }
    this.tryMove(dt, this.dir);

    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = rand(this.fireDelay[0], this.fireDelay[1]);
      if (this.shouldFire()) this.fire();
    }
  };

  // ================================================================
  //  Пуля
  // ================================================================

  function Bullet(game, owner, dir, speed, power) {
    this.game = game;
    this.owner = owner;
    this.team = owner.team;
    this.dir = dir;
    this.speed = speed;
    this.power = power || 1;
    this.w = 8;
    this.h = 8;
    this.dead = false;

    var vec = DIR_VEC[dir];
    this.x = owner.x + 16 + vec[0] * 16 - 4;
    this.y = owner.y + 16 + vec[1] * 16 - 4;
  }

  Bullet.prototype.update = function (dt) {
    if (this.dead) return;
    var vec = DIR_VEC[this.dir];
    var remaining = this.speed * dt;

    while (remaining > 0 && !this.dead) {
      var step = Math.min(4, remaining);
      remaining -= step;
      this.x += vec[0] * step;
      this.y += vec[1] * step;

      if (this.x < -8 || this.y < -8 || this.x > FIELD_W + 8 || this.y > FIELD_H + 8) {
        this.dead = true;
        this.game.spark(this.x + 4, this.y + 4);
        break;
      }
      if (this.checkTiles()) break;
      if (this.checkBase()) break;
      if (this.checkTanks()) break;
    }
  };

  Bullet.prototype.checkTiles = function () {
    var g = this.game;
    var x0 = Math.floor(this.x / CELL);
    var x1 = Math.floor((this.x + this.w - 0.01) / CELL);
    var y0 = Math.floor(this.y / CELL);
    var y1 = Math.floor((this.y + this.h - 0.01) / CELL);

    for (var cy = y0; cy <= y1; cy++) {
      if (cy < 0 || cy >= ROWS) continue;
      for (var cx = x0; cx <= x1; cx++) {
        if (cx < 0 || cx >= COLS) continue;
        var t = g.map[cy][cx];
        if (t === T.BRICK) {
          g.map[cy][cx] = T.EMPTY;
          this.dead = true;
          g.sfx('brick');
          g.spark(this.x + 4, this.y + 4);
          return true;
        }
        if (t === T.STEEL) {
          this.dead = true;
          if (this.power >= 3) {
            g.map[cy][cx] = T.EMPTY;
            g.sfx('brick');
            g.spark(this.x + 4, this.y + 4);
          } else {
            g.sfx('steel');
            g.spark(this.x + 4, this.y + 4);
          }
          return true;
        }
      }
    }
    return false;
  };

  Bullet.prototype.checkBase = function () {
    var g = this.game;
    if (g.base && g.base.alive && overlaps(this, g.base)) {
      this.dead = true;
      g.destroyBase();
      return true;
    }
    return false;
  };

  Bullet.prototype.checkTanks = function () {
    var g = this.game;
    for (var i = 0; i < g.tanks.length; i++) {
      var t = g.tanks[i];
      if (t.team === this.team || t.dead) continue;
      if (overlaps(this, t)) {
        this.dead = true;
        g.hitTank(t, this);
        return true;
      }
    }
    return false;
  };

  // ================================================================
  //  Эффекты
  // ================================================================

  function Explosion(game, x, y, size) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.size = size || 1;
    this.t = 0;
    this.dur = this.size >= 2 ? 0.7 : 0.35;

    var palettes = this.size >= 2
      ? ['#fff3b0', '#ffc93a', '#ff7a1a', '#d03412', '#ffffff']
      : ['#ffe680', '#ffb02e', '#ffffff'];
    var count = this.size >= 2 ? 22 : 8;

    this.parts = [];
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = rand(20, this.size >= 2 ? 160 : 70);
      this.parts.push({
        x: 0,
        y: 0,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.2, this.dur),
        color: choice(palettes),
        s: Math.random() < 0.35 ? 4 : 2
      });
    }
  }

  Explosion.prototype.update = function (dt) {
    this.t += dt;
    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
    var alive = [];
    for (var j = 0; j < this.parts.length; j++) {
      if (this.parts[j].life > 0) alive.push(this.parts[j]);
    }
    this.parts = alive;
  };

  Explosion.prototype.draw = function (context) {
    var a = clamp(1 - this.t / this.dur, 0, 1);
    context.save();
    context.globalAlpha = a;
    context.fillStyle = '#fff6cf';
    context.fillRect(Math.round(this.x - 4), Math.round(this.y - 4), 8, 8);
    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      context.fillStyle = p.color;
      context.fillRect(Math.round(this.x + p.x), Math.round(this.y + p.y), p.s, p.s);
    }
    if (this.size >= 2 && this.t < 0.28) {
      context.globalAlpha = (1 - this.t / 0.28) * 0.8;
      context.strokeStyle = '#ffd75e';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(this.x, this.y, this.t * 130 + 6, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  };

  function FloatText(x, y, text, color) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color || '#ffe66a';
    this.t = 0;
    this.dur = 0.9;
  }

  FloatText.prototype.update = function (dt) { this.t += dt; };

  FloatText.prototype.draw = function (context) {
    var a = clamp(1 - this.t / this.dur, 0, 1);
    context.save();
    context.globalAlpha = a;
    context.fillStyle = this.color;
    setFont(9, 'bold');
    context.textAlign = 'center';
    context.fillText(this.text, this.x, this.y - this.t * 16);
    context.restore();
  };

  // ================================================================
  //  Игра
  // ================================================================

  function Game() {
    this.state = 'title';
    this.time = 0;
    this.levelIndex = 0;
    this.levelName = '';
    this.map = null;
    this.base = null;
    this.player = null;
    this.player2 = null;
    this.nextTankId = 1;

    this.tanks = [];
    this.bullets = [];
    this.powerups = [];
    this.explosions = [];
    this.texts = [];
    this.pendingSpawns = [];
    this.queue = [];

    this.lives = 3;
    this.lives2 = 3;
    this.score = 0;
    this.star = 0;
    this.star2 = 0;
    this.highScore = loadHigh();

    this.freezeTimer = 0;
    this.fortTimer = 0;
    this.spawnTimer = 1;
    this.respawnTimer = 0;
    this.respawnTimer2 = 0;
    this.clearDelay = 0;
    this.introTimer = 0;
    this.endTimer = 0;
    this.endReason = '';
    this.maxActive = 4;

    this.shake = 0;
    this.mutedMsg = 0;
    this.pausedFrom = 'playing';

    // Меню и сеть
    this.menuIndex = 0;
    this.modePick = false;
    this.modeIndex = 0;
    this.genOnly = false;
    this.levelGenerated = false;
    this.mode = 'solo';
    this.multi = false;
    this.netRole = '';
    this.netOpen = false;
    this.netStarted = false;
    this.netSynced = false;
    this.netLost = false;
    this.remoteDir = -1;
    this.remoteFire = false;
    this.snapTimer = 0;
    this.netMapKey = '';
    this.netRemain = 0;
    this.netFx = [];
    this.netSfx = [];
    this.netInputTimer = 0;
    this.netLastInput = '';
  }

  Game.prototype.autoPause = function () {
    if (this.mode === 'net' && this.netRole === 'guest') return;
    if (this.state === 'playing' || this.state === 'intro') {
      this.pausedFrom = this.state;
      this.state = 'paused';
    }
  };

  Game.prototype.menuItems = function () {
    return ['1 ИГРОК', '2 ИГРОКА — СЕТЬ'];
  };

  Game.prototype.menuRects = function () {
    var rects = [];
    for (var i = 0; i < this.menuItems().length; i++) {
      rects.push({ x: 150, y: 286 + i * 34, w: 260, h: 28 });
    }
    return rects;
  };

  Game.prototype.pointerDown = function (x, y) {
    if (this.netOpen) return;
    if (this.state === 'title') {
      if (this.modePick) {
        var modeRects = this.modeRects();
        for (var m = 0; m < modeRects.length; m++) {
          var mr = modeRects[m];
          if (x >= mr.x && x <= mr.x + mr.w && y >= mr.y && y <= mr.y + mr.h) {
            this.modeIndex = m;
            this.startSoloGame(m === 1);
            return;
          }
        }
        this.closeModePick();
        return;
      }
      var rects = this.menuRects();
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
          this.menuIndex = i;
          this.activateMenu();
          return;
        }
      }
      return;
    }
    if (this.state === 'gameOver' || this.state === 'victory' || this.state === 'netLost') {
      this.toMenu();
    }
  };

  Game.prototype.activateMenu = function () {
    BCAudio.ensure();
    if (this.menuIndex === 0) this.openModePick();
    else this.openNetSetup();
  };

  Game.prototype.modeOptions = function () {
    return ['ОБЫЧНЫЕ УРОВНИ', 'ТОЛЬКО СЛУЧАЙНЫЕ'];
  };

  Game.prototype.modeRects = function () {
    return [
      { x: 150, y: 218, w: 260, h: 42 },
      { x: 150, y: 268, w: 260, h: 42 }
    ];
  };

  Game.prototype.openModePick = function () {
    this.modePick = true;
    this.modeIndex = 0;
    Input.clear();
    BCAudio.ensure();
  };

  Game.prototype.closeModePick = function () {
    this.modePick = false;
    Input.clear();
  };

  Game.prototype.startSoloGame = function (genOnly) {
    if (window.BCNet && BCNet.isConnected()) BCNet.disconnect();
    this.modePick = false;
    this.genOnly = !!genOnly;
    this.mode = 'solo';
    this.netRole = '';
    this.netStarted = false;
    this.netLost = false;
    this.netSynced = false;
    this.multi = false;
    BCAudio.start();
    this.startGame();
  };

  Game.prototype.openNetSetup = function () {
    if (!window.BCUI || !window.BCNet) return;
    this.netOpen = true;
    Input.clear();
    BCAudio.ensure();
    BCUI.openPanel();
  };

  Game.prototype.closeNetSetup = function () {
    this.netOpen = false;
    if (window.BCUI) BCUI.closePanel();
    Input.clear();
  };

  Game.prototype.startGame = function () {
    this.multi = false;
    this.player2 = null;
    this.lives2 = 3;
    this.star2 = 0;
    this.score = 0;
    this.lives = 3;
    this.star = 0;
    this.levelIndex = 0;
    this.loadLevel(0);
    BCAudio.start();
  };

  // ------------------------------------------------------------------
  //  Сеть: меню, запуск, обмен состоянием
  // ------------------------------------------------------------------

  Game.prototype.netStatus = function () {
    if (!window.BCNet || !BCNet.available) {
      return { text: 'СЕТЬ: ЗАПУСТИТЕ node server.js', kind: 'off' };
    }
    var p = BCNet.peer;
    if (p.state === 'linked') {
      if (p.mutual) {
        return {
          text: 'СЕТЬ: ПОДКЛЮЧЕНО · ' + p.peerIp + (p.isHost ? ' · ВЫ ХОЗЯИН' : ' · ВЫ ГОСТЬ'),
          kind: 'ok'
        };
      }
      if (p.peerWantsMe) return { text: 'СЕТЬ: СОПЕРНИК ЖДЁТ ВАШ IP', kind: 'warn' };
      return { text: 'СЕТЬ: СОПЕРНИК ' + p.peerIp + ' — ВВЕДИТЕ ЕГО IP', kind: 'warn' };
    }
    if (p.state === 'connecting') return { text: 'СЕТЬ: ПОДКЛЮЧЕНИЕ…', kind: 'warn' };
    if (p.state === 'error') return { text: 'СЕТЬ: ' + (p.message || 'ОШИБКА'), kind: 'err' };
    if (p.state === 'offline' || p.state === 'unavailable') {
      return { text: 'СЕТЬ: ЛОКАЛЬНЫЙ СЕРВЕР НЕ ОТВЕЧАЕТ', kind: 'err' };
    }
    return { text: 'СЕТЬ: НЕ ПОДКЛЮЧЕНО', kind: 'off' };
  };

  Game.prototype.alivePlayers = function () {
    var list = [];
    if (this.player && !this.player.dead) list.push(this.player);
    if (this.player2 && !this.player2.dead) list.push(this.player2);
    return list;
  };

  Game.prototype.nearestPlayer = function (x, y) {
    var best = null;
    var bestD = Infinity;
    for (var i = 0; i < this.tanks.length; i++) {
      var t = this.tanks[i];
      if (t.team !== 'player' || t.dead) continue;
      var dx = t.x + 16 - x;
      var dy = t.y + 16 - y;
      var d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  };

  Game.prototype.sfx = function (name) {
    if (this.mode === 'net' && this.netRole === 'host' && this.netStarted) {
      this.netSfx.push(name);
    }
    if (BCAudio[name]) BCAudio[name]();
  };

  Game.prototype.startNetHost = function () {
    if (!window.BCNet || !BCNet.isMutual()) return;
    if (!BCNet.peer.isHost) { this.requestNetStart(); return; }
    this.beginNetGame('host');
    BCNet.send({ t: 'start' });
    this.snapTimer = 0;
    this.sendNetState(true);
    BCAudio.start();
  };

  Game.prototype.requestNetStart = function () {
    if (!window.BCNet || !BCNet.isMutual()) return;
    if (BCNet.peer.isHost) { this.startNetHost(); return; }
    BCNet.send({ t: 'startReq' });
    if (window.BCUI) BCUI.setWaiting(true);
  };

  Game.prototype.beginNetGame = function (role) {
    this.mode = 'net';
    this.netRole = role;
    this.netStarted = true;
    this.netLost = false;
    this.netOpen = false;
    this.genOnly = false;
    if (window.BCUI) BCUI.closePanel();
    this.multi = true;
    this.score = 0;
    this.lives = 3;
    this.lives2 = 3;
    this.star = 0;
    this.star2 = 0;
    this.levelIndex = 0;
    this.remoteDir = -1;
    this.remoteFire = false;
    this.netMapKey = '';
    this.netFx = [];
    this.netSfx = [];
    this.netLastInput = '';
    this.netInputTimer = 0;
    Input.clear();

    if (role === 'host') {
      this.netSynced = true;
      this.loadLevel(0);
    } else {
      this.netSynced = false;
      this.levelName = '';
      this.map = [];
      for (var y = 0; y < ROWS; y++) {
        var row = [];
        for (var x = 0; x < COLS; x++) row.push(T.EMPTY);
        this.map.push(row);
      }
      this.base = { x: BASE_RECT.x, y: BASE_RECT.y, w: 32, h: 32, alive: true };
      this.tanks = [];
      this.bullets = [];
      this.powerups = [];
      this.explosions = [];
      this.texts = [];
      this.pendingSpawns = [];
      this.queue = [];
      this.player = null;
      this.player2 = null;
      this.state = 'intro';
      this.introTimer = 1.9;
      this.endTimer = 0;
      this.endReason = '';
      this.freezeTimer = 0;
      this.fortTimer = 0;
    }
  };

  Game.prototype.onNetRelay = function (data) {
    if (!data || typeof data !== 'object') return;
    if (data.t === 'start') {
      if (this.netRole !== 'host') {
        this.beginNetGame('guest');
        BCAudio.start();
      }
    } else if (data.t === 'startReq') {
      if (this.netRole !== 'guest' && window.BCNet && BCNet.peer.isHost) this.startNetHost();
    } else if (data.t === 'state') {
      if (this.netRole === 'guest') this.applyNetSnapshot(data.s);
    } else if (data.t === 'input') {
      if (this.netRole === 'host' && this.netStarted) {
        this.remoteDir = typeof data.dir === 'number' ? data.dir : -1;
        this.remoteFire = !!data.fire;
      }
    } else if (data.t === 'quit') {
      if (this.netRole === 'guest' && this.netStarted) this.toMenu(true);
    }
  };

  Game.prototype.netLinkLost = function () {
    if (!this.netStarted || this.netLost) return;
    this.netLost = true;
    this.netStarted = false;
    this.remoteDir = -1;
    this.remoteFire = false;
    this.state = 'netLost';
    this.netSfx = [];
    this.netFx = [];
  };

  Game.prototype.toMenu = function (silent) {
    if (!silent && this.mode === 'net' && this.netStarted && this.netRole === 'host' &&
        window.BCNet && BCNet.isConnected()) {
      BCNet.send({ t: 'quit' });
    }
    this.mode = 'solo';
    this.netRole = '';
    this.netStarted = false;
    this.netLost = false;
    this.netSynced = false;
    this.multi = false;
    this.player = null;
    this.player2 = null;
    this.tanks = [];
    this.bullets = [];
    this.powerups = [];
    this.explosions = [];
    this.texts = [];
    this.pendingSpawns = [];
    this.map = null;
    this.base = null;
    this.state = 'title';
    this.menuIndex = 0;
    this.modePick = false;
    this.modeIndex = 0;
    this.genOnly = false;
    this.netOpen = false;
    if (window.BCUI) BCUI.closePanel();
    Input.clear();
  };

  Game.prototype.sendNetState = function () {
    if (!window.BCNet || !BCNet.isConnected()) return;
    if (this.netRole !== 'host' || !this.netStarted) return;

    var flat = [];
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) flat.push(this.map ? this.map[y][x] : 0);
    }
    var mapKey = flat.join('');
    var s = {
      st: this.state,
      lvl: this.levelIndex,
      name: this.levelName,
      gen: this.levelGenerated ? 1 : 0,
      score: this.score,
      lives: this.lives,
      lives2: this.lives2,
      star: this.star,
      star2: this.star2,
      base: !!(this.base && this.base.alive),
      remain: this.remainingEnemies(),
      intro: +this.introTimer.toFixed(2),
      end: +this.endTimer.toFixed(2),
      reason: this.endReason,
      freeze: +this.freezeTimer.toFixed(2),
      fort: +this.fortTimer.toFixed(2),
      tanks: [],
      bullets: [],
      pu: [],
      pending: []
    };

    if (mapKey !== this.netMapKey) {
      s.map = flat;
      this.netMapKey = mapKey;
    }

    for (var i = 0; i < this.tanks.length; i++) {
      var t = this.tanks[i];
      if (t.dead) continue;
      s.tanks.push({
        id: t.id,
        x: Math.round(t.x),
        y: Math.round(t.y),
        dir: t.dir,
        team: t.team,
        type: t.type,
        pi: t.playerIndex || 0,
        hp: t.hp,
        shield: +(+t.shield).toFixed(2),
        bonus: !!t.bonus,
        tr: +t.tread.toFixed(1)
      });
    }
    for (var b = 0; b < this.bullets.length; b++) {
      var bl = this.bullets[b];
      if (bl.dead) continue;
      s.bullets.push({ x: Math.round(bl.x), y: Math.round(bl.y), dir: bl.dir });
    }
    for (var p = 0; p < this.powerups.length; p++) {
      var pu = this.powerups[p];
      if (pu.dead) continue;
      s.pu.push({ x: pu.x, y: pu.y, type: pu.type, timer: +pu.timer.toFixed(1), phase: +pu.phase.toFixed(2) });
    }
    for (var q = 0; q < this.pendingSpawns.length; q++) {
      var sp = this.pendingSpawns[q];
      s.pending.push({ x: sp.x, y: sp.y, timer: +sp.timer.toFixed(2) });
    }

    var fx = [];
    for (var e = 0; e < this.explosions.length; e++) {
      var ex = this.explosions[e];
      if (!ex.netSent) {
        ex.netSent = true;
        fx.push([Math.round(ex.x), Math.round(ex.y), ex.size]);
      }
    }
    if (fx.length) s.fx = fx;
    if (this.netSfx.length) {
      s.sfx = this.netSfx.slice(0, 24);
      this.netSfx = [];
    }

    BCNet.send({ t: 'state', s: s });
  };

  Game.prototype.applyNetSnapshot = function (s) {
    if (!s) return;
    if (s.map) {
      this.map = [];
      for (var y = 0; y < ROWS; y++) {
        this.map.push(s.map.slice(y * COLS, y * COLS + COLS));
      }
      this.base = { x: BASE_RECT.x, y: BASE_RECT.y, w: 32, h: 32, alive: true };
    }
    if (this.base) this.base.alive = !!s.base;

    this.levelIndex = s.lvl | 0;
    this.levelName = s.name || '';
    this.levelGenerated = !!s.gen;
    this.score = s.score | 0;
    this.lives = s.lives | 0;
    this.lives2 = s.lives2 | 0;
    this.star = s.star | 0;
    this.star2 = s.star2 | 0;
    this.netRemain = s.remain | 0;
    this.freezeTimer = s.freeze || 0;
    this.fortTimer = s.fort || 0;
    this.introTimer = s.intro || 0;
    this.endTimer = s.end || 0;
    this.endReason = s.reason || '';

    var prev = this.state;
    this.state = s.st || 'intro';

    var old = {};
    for (var i = 0; i < this.tanks.length; i++) old[this.tanks[i].id] = this.tanks[i];
    var list = [];
    var data = s.tanks || [];
    for (var k = 0; k < data.length; k++) {
      var d = data[k];
      var tank = old[d.id];
      if (!tank) {
        tank = {
          id: d.id, x: d.x, y: d.y, tx: d.x, ty: d.y,
          dir: d.dir, team: d.team, type: d.type, playerIndex: d.pi || 0,
          w: 32, h: 32, hp: d.hp, shield: 0, bonus: false,
          tread: d.tr || 0, hitFlash: 0, dead: false
        };
      }
      tank.tx = d.x;
      tank.ty = d.y;
      tank.dir = d.dir;
      tank.team = d.team;
      tank.type = d.type;
      tank.playerIndex = d.pi || 0;
      tank.hp = d.hp;
      tank.shield = d.shield || 0;
      tank.bonus = !!d.bonus;
      tank.tread = d.tr || 0;
      list.push(tank);
    }
    this.tanks = list;

    this.bullets = [];
    var bullets = s.bullets || [];
    for (var j = 0; j < bullets.length; j++) {
      this.bullets.push({ x: bullets[j].x, y: bullets[j].y, w: 8, h: 8, dir: bullets[j].dir || 0, dead: false });
    }

    this.powerups = [];
    var pus = s.pu || [];
    for (var m = 0; m < pus.length; m++) {
      this.powerups.push({
        x: pus[m].x, y: pus[m].y, w: 32, h: 32,
        type: pus[m].type, timer: pus[m].timer, phase: pus[m].phase || 0, dead: false
      });
    }

    this.pendingSpawns = [];
    var pend = s.pending || [];
    for (var n = 0; n < pend.length; n++) {
      this.pendingSpawns.push({ x: pend[n].x, y: pend[n].y, timer: pend[n].timer });
    }

    if (s.fx) {
      for (var f = 0; f < s.fx.length; f++) {
        this.explosions.push(new Explosion(this, s.fx[f][0], s.fx[f][1], s.fx[f][2]));
      }
    }
    if (s.sfx) {
      for (var a = 0; a < s.sfx.length; a++) {
        if (BCAudio[s.sfx[a]]) BCAudio[s.sfx[a]]();
      }
    }

    if (this.state !== prev) {
      if (this.state === 'gameOver') BCAudio.gameover();
      else if (this.state === 'victory') BCAudio.victory();
      else if (this.state === 'levelClear') this.shake = 0.2;
    }
    this.netSynced = true;
  };

  Game.prototype.updateNetGuest = function (dt) {
    this.updateEffects(dt);
    var k = Math.min(1, dt * 20);
    for (var i = 0; i < this.tanks.length; i++) {
      var t = this.tanks[i];
      if (t.tx !== undefined) {
        t.x += (t.tx - t.x) * k;
        t.y += (t.ty - t.y) * k;
      }
    }
    for (var p = 0; p < this.powerups.length; p++) this.powerups[p].phase += dt;
    if (this.state === 'playing') this.sendGuestInput(dt);
  };

  Game.prototype.sendGuestInput = function (dt) {
    if (!window.BCNet || !BCNet.isConnected()) return;
    this.netInputTimer -= dt;
    var dir = Input.currentDir();
    var fire = Input.isDown('Space') || Input.isDown('KeyJ') || Input.isDown('KeyZ');
    var sig = dir + '|' + fire;
    if (sig !== this.netLastInput || this.netInputTimer <= 0) {
      this.netLastInput = sig;
      this.netInputTimer = 0.08;
      BCNet.send({ t: 'input', dir: dir, fire: fire });
    }
  };

  Game.prototype.levelData = function (idx) {
    if (!this.genOnly && idx < BC_LEVELS.length) return BC_LEVELS[idx];
    if (window.BCGen) return BCGen.generate(idx + 1);
    return BC_LEVELS[Math.min(idx, BC_LEVELS.length - 1)];
  };

  Game.prototype.loadLevel = function (idx) {
    var data = this.levelData(idx);
    this.levelIndex = idx;
    this.levelGenerated = !!data.generated;
    this.levelName = data.name;
    this.maxActive = data.maxActive || 4;

    this.map = [];
    for (var y = 0; y < ROWS; y++) this.map.push(data.map[y].slice());

    // Служебные зоны всегда свободны
    this.clearRect(0, 0, 2, 2);
    this.clearRect(12, 0, 2, 2);
    this.clearRect(24, 0, 2, 2);
    this.clearRect(7, 23, 4, 3);   // площадка игрока 1
    this.clearRect(15, 23, 4, 3);  // площадка игрока 2
    this.clearRect(11, 23, 4, 3);  // площадка базы

    // Основание
    for (var by = 0; by < 2; by++) {
      for (var bx = 0; bx < 2; bx++) this.map[24 + by][12 + bx] = T.BASE;
    }
    this.setFort(T.BRICK);
    this.base = { x: BASE_RECT.x, y: BASE_RECT.y, w: 32, h: 32, alive: true };

    this.tanks = [];
    this.bullets = [];
    this.powerups = [];
    this.explosions = [];
    this.texts = [];
    this.pendingSpawns = [];
    this.player = null;
    this.player2 = null;

    var bonusIdx = data.bonus || [];
    this.queue = data.enemies.map(function (type, i) {
      return { type: type, bonus: bonusIdx.indexOf(i) >= 0 };
    });

    this.freezeTimer = 0;
    this.fortTimer = 0;
    this.spawnTimer = 0.6;
    this.respawnTimer = 0;
    this.respawnTimer2 = 0;
    this.clearDelay = 0;
    this.introTimer = 1.9;
    this.endTimer = 0;
    this.endReason = '';
    this.shake = 0;
    this.state = 'intro';

    this.spawnPlayer(true, 1);
    if (this.multi) this.spawnPlayer(true, 2);
  };

  Game.prototype.clearRect = function (cx, cy, w, h) {
    for (var y = cy; y < cy + h; y++) {
      for (var x = cx; x < cx + w; x++) {
        if (this.map[y] && this.map[y][x] !== undefined) this.map[y][x] = T.EMPTY;
      }
    }
  };

  Game.prototype.setFort = function (type) {
    for (var i = 0; i < FORT_CELLS.length; i++) {
      var c = FORT_CELLS[i];
      if (this.map[c[1]][c[0]] !== T.BASE) this.map[c[1]][c[0]] = type;
    }
  };

  Game.prototype.tileUnder = function (x, y) {
    var cx = Math.floor(x / CELL);
    var cy = Math.floor(y / CELL);
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return T.EMPTY;
    return this.map[cy][cx];
  };

  Game.prototype.rectBlocked = function (x, y, w, h) {
    var x0 = Math.floor(x / CELL);
    var x1 = Math.floor((x + w - 0.01) / CELL);
    var y0 = Math.floor(y / CELL);
    var y1 = Math.floor((y + h - 0.01) / CELL);
    for (var cy = y0; cy <= y1; cy++) {
      if (cy < 0 || cy >= ROWS) continue;
      for (var cx = x0; cx <= x1; cx++) {
        if (cx < 0 || cx >= COLS) continue;
        var t = this.map[cy][cx];
        if (t === T.BRICK || t === T.STEEL || t === T.WATER || t === T.BASE) return true;
      }
    }
    return false;
  };

  Game.prototype.spawnAreaFree = function (x, y) {
    if (this.rectBlocked(x, y, 32, 32)) return false;
    var r = { x: x, y: y, w: 32, h: 32 };
    for (var i = 0; i < this.tanks.length; i++) {
      var t = this.tanks[i];
      if (!t.dead && overlaps(r, t)) return false;
    }
    return true;
  };

  Game.prototype.spawnPlayer = function (initial, index) {
    var idx = index || 1;
    var spawn = idx === 2 ? PLAYER2_SPAWN : PLAYER_SPAWN;
    if (!this.spawnAreaFree(spawn.x, spawn.y)) return false;
    var p = new Tank(this, spawn.x, spawn.y, 'player', 'player');
    p.playerIndex = idx;
    p.dir = DIR.UP;
    p.shield = initial ? 3.2 : 2.6;
    p.applyStar();
    this.tanks.push(p);
    if (idx === 2) this.player2 = p;
    else this.player = p;
    this.sfx('spawn');
    return true;
  };

  Game.prototype.spawnEnemy = function (x, y, data) {
    var tank = new Tank(this, x, y, 'enemy', data.type);
    tank.bonus = !!data.bonus;
    tank.dir = DIR.DOWN;
    tank.shield = 1.4;
    tank.aiTimer = rand(0.3, 0.9);
    tank.fireTimer = rand(0.8, 1.8);
    this.tanks.push(tank);
    this.sfx('spawn');
  };

  Game.prototype.updateSpawning = function (dt) {
    var alive = 0;
    for (var i = 0; i < this.tanks.length; i++) {
      if (this.tanks[i].team === 'enemy' && !this.tanks[i].dead) alive++;
    }
    if (!this.queue.length) return;
    if (alive + this.pendingSpawns.length >= this.maxActive) return;

    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;

    var freePoints = [];
    for (var j = 0; j < SPAWN_POINTS.length; j++) {
      var pt = SPAWN_POINTS[j];
      var taken = false;
      for (var k = 0; k < this.pendingSpawns.length; k++) {
        if (this.pendingSpawns[k].x === pt.x && this.pendingSpawns[k].y === pt.y) { taken = true; break; }
      }
      if (!taken && this.spawnAreaFree(pt.x, pt.y)) freePoints.push(pt);
    }
    if (!freePoints.length) return;

    var point = choice(freePoints);
    var enemyData = this.queue.shift();
    this.pendingSpawns.push({ x: point.x, y: point.y, timer: 1.05, enemy: enemyData });
    this.spawnTimer = rand(0.7, 1.5);
    this.sfx('spawn');
  };

  Game.prototype.updatePendingSpawns = function (dt) {
    for (var i = this.pendingSpawns.length - 1; i >= 0; i--) {
      var s = this.pendingSpawns[i];
      s.timer -= dt;
      if (s.timer > 0) continue;
      if (this.spawnAreaFree(s.x, s.y)) {
        this.pendingSpawns.splice(i, 1);
        this.spawnEnemy(s.x, s.y, s.enemy);
      } else {
        s.timer = 0.35;
      }
    }
  };

  Game.prototype.remainingEnemies = function () {
    var n = this.queue.length + this.pendingSpawns.length;
    for (var i = 0; i < this.tanks.length; i++) {
      if (this.tanks[i].team === 'enemy' && !this.tanks[i].dead) n++;
    }
    return n;
  };

  Game.prototype.shouldClearLevel = function () {
    if (this.queue.length) return false;
    if (this.pendingSpawns.length) return false;
    for (var i = 0; i < this.tanks.length; i++) {
      if (this.tanks[i].team === 'enemy' && !this.tanks[i].dead) return false;
    }
    return true;
  };

  Game.prototype.completeLevel = function () {
    this.state = 'levelClear';
    this.clearDelay = 2.2;
    this.saveHigh();
    this.sfx('levelClear');
  };

  Game.prototype.hitTank = function (tank, bullet) {
    if (tank.shield > 0) {
      this.spark(bullet.x + 4, bullet.y + 4);
      return;
    }
    if (tank.team === 'player') {
      this.killPlayer(tank);
      return;
    }
    tank.hp--;
    tank.hitFlash = 0.14;
    if (tank.hp <= 0) {
      this.killEnemy(tank, false);
    } else {
      this.sfx('steel');
      this.spark(bullet.x + 4, bullet.y + 4);
    }
  };

  Game.prototype.killPlayer = function (tank) {
    var p = tank || this.player;
    if (!p || p.dead) return;
    if (p.shield > 0) return;

    var idx = p.playerIndex === 2 ? 2 : 1;
    p.dead = true;
    if (idx === 2) this.player2 = null;
    else this.player = null;
    this.tanks = this.tanks.filter(function (t) { return t !== p; });
    this.explosions.push(new Explosion(this, p.x + 16, p.y + 16, 2));
    this.shake = 0.7;
    this.sfx('explodeBig');

    if (idx === 2) {
      this.star2 = 0;
      this.lives2--;
      if (this.lives2 > 0) this.respawnTimer2 = 1.6;
    } else {
      this.star = 0;
      this.lives--;
      if (this.lives > 0) this.respawnTimer = 1.6;
    }

    if (this.lives <= 0 && (!this.multi || this.lives2 <= 0)) {
      this.state = 'ending';
      this.endReason = 'lives';
      this.endTimer = 1.9;
    }
  };

  Game.prototype.killEnemy = function (tank, quiet) {
    if (tank.dead) return;
    tank.dead = true;
    this.explosions.push(new Explosion(this, tank.x + 16, tank.y + 16, 2));
    this.shake = Math.max(this.shake, 0.32);
    if (!quiet) this.sfx('explodeBig');
    this.addScore(tank.scoreValue, tank.x + 16, tank.y + 8);
    if (tank.bonus) this.dropPowerUp(tank.x + 16, tank.y + 16);
  };

  Game.prototype.destroyBase = function () {
    if (!this.base || !this.base.alive) return;
    this.base.alive = false;
    this.explosions.push(new Explosion(this, BASE_RECT.x + 16, BASE_RECT.y + 16, 2.4));
    this.explosions.push(new Explosion(this, BASE_RECT.x + 4, BASE_RECT.y + 6, 1.4));
    this.explosions.push(new Explosion(this, BASE_RECT.x + 26, BASE_RECT.y + 10, 1.4));
    this.shake = 1;
    this.sfx('explodeBig');
    this.state = 'ending';
    this.endReason = 'base';
    this.endTimer = 2.4;
  };

  Game.prototype.finishGameOver = function () {
    this.state = 'gameOver';
    this.saveHigh();
    BCAudio.gameover();
  };

  Game.prototype.addScore = function (points, x, y) {
    this.score += points;
    if (this.score > this.highScore) this.highScore = this.score;
    if (points > 0 && x !== undefined && y !== undefined) {
      this.texts.push(new FloatText(x, y, '+' + points));
    }
  };

  Game.prototype.saveHigh = function () {
    try { localStorage.setItem('bc_hi', String(this.highScore)); } catch (e) {}
  };

  Game.prototype.spark = function (x, y) {
    this.explosions.push(new Explosion(this, x, y, 0.6));
  };

  Game.prototype.dropPowerUp = function (x, y) {
    var offsets = [
      [0, 0], [0, -16], [16, 0], [-16, 0], [0, 16],
      [32, 0], [-32, 0], [0, -32], [0, 32], [16, -16], [-16, -16]
    ];
    var px = null;
    var py = null;
    for (var i = 0; i < offsets.length; i++) {
      var nx = clamp(Math.round((x + offsets[i][0]) / CELL) * CELL, 0, FIELD_W - 32);
      var ny = clamp(Math.round((y + offsets[i][1]) / CELL) * CELL, 0, FIELD_H - 32);
      if (!this.rectBlocked(nx, ny, 32, 32)) {
        px = nx;
        py = ny;
        break;
      }
    }
    if (px === null) {
      px = PLAYER_SPAWN.x + 32;
      py = PLAYER_SPAWN.y - 32;
    }
    this.powerups.push({
      x: px,
      y: py,
      w: 32,
      h: 32,
      type: choice(POWER_TYPES),
      timer: 16,
      phase: Math.random() * 6,
      dead: false
    });
  };

  Game.prototype.collectPowerUp = function (pu, collector) {
    if (pu.dead) return;
    pu.dead = true;
    var who = collector || this.player;
    var idx = who && who.playerIndex === 2 ? 2 : 1;
    this.addScore(500, pu.x + 16, pu.y);
    this.sfx('powerup');

    if (pu.type === 'star') {
      if (idx === 2) {
        this.star2 = Math.min(3, this.star2 + 1);
        if (this.player2) this.player2.applyStar();
      } else {
        this.star = Math.min(3, this.star + 1);
        if (this.player) this.player.applyStar();
      }
    } else if (pu.type === 'helmet') {
      if (who) who.shield = Math.max(who.shield, 12);
    } else if (pu.type === 'grenade') {
      var list = [];
      for (var i = 0; i < this.tanks.length; i++) {
        if (this.tanks[i].team === 'enemy' && !this.tanks[i].dead) list.push(this.tanks[i]);
      }
      for (var j = 0; j < list.length; j++) this.killEnemy(list[j], true);
      if (list.length) this.sfx('explodeBig');
      this.shake = 0.8;
    } else if (pu.type === 'clock') {
      this.freezeTimer = 8;
    } else if (pu.type === 'shovel') {
      this.fortTimer = 16;
      this.setFort(T.STEEL);
    } else if (pu.type === 'life') {
      if (idx === 2) this.lives2++;
      else this.lives++;
      this.sfx('extraLife');
    }
  };

  Game.prototype.updatePowerUps = function (dt) {
    var players = this.alivePlayers();
    for (var i = 0; i < this.powerups.length; i++) {
      var pu = this.powerups[i];
      pu.timer -= dt;
      pu.phase += dt;
      if (pu.timer <= 0) pu.dead = true;
      if (pu.dead) continue;
      for (var p = 0; p < players.length; p++) {
        var pl = players[p];
        if (pl && !pl.dead && overlaps(pl, pu)) {
          this.collectPowerUp(pu, pl);
          break;
        }
      }
    }
    this.powerups = this.powerups.filter(function (p) { return !p.dead; });
  };

  Game.prototype.updateEffects = function (dt) {
    for (var i = 0; i < this.explosions.length; i++) this.explosions[i].update(dt);
    this.explosions = this.explosions.filter(function (e) { return e.t < e.dur; });
    for (var j = 0; j < this.texts.length; j++) this.texts[j].update(dt);
    this.texts = this.texts.filter(function (t) { return t.t < t.dur; });
  };

  Game.prototype.collideBullets = function () {
    for (var i = 0; i < this.bullets.length; i++) {
      var a = this.bullets[i];
      if (a.dead) continue;
      for (var j = i + 1; j < this.bullets.length; j++) {
        var b = this.bullets[j];
        if (b.dead || b.team === a.team) continue;
        if (overlaps(a, b)) {
          a.dead = true;
          b.dead = true;
          this.spark((a.x + b.x) / 2 + 4, (a.y + b.y) / 2 + 4);
          this.sfx('steel');
          break;
        }
      }
    }
  };

  Game.prototype.updatePlaying = function (dt) {
    var i;

    if (this.freezeTimer > 0) this.freezeTimer = Math.max(0, this.freezeTimer - dt);
    if (this.fortTimer > 0) {
      this.fortTimer -= dt;
      if (this.fortTimer <= 0) {
        this.fortTimer = 0;
        this.setFort(T.BRICK);
      }
    }

    // Игрок 1
    if (this.player && !this.player.dead) {
      var p = this.player;
      if (p.fireCooldown > 0) p.fireCooldown -= dt;
      if (p.shield > 0) p.shield -= dt;
      if (p.hitFlash > 0) p.hitFlash -= dt;

      var dir = Input.currentDir();
      if (dir >= 0) p.tryMove(dt, dir);
      else {
        p.moving = false;
        p.blocked = false;
      }
      if (Input.isDown('Space') || Input.isDown('KeyJ') || Input.isDown('KeyZ')) p.fire();
    } else if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        if (!this.spawnPlayer(false, 1)) this.respawnTimer = 0.35;
      }
    }

    // Игрок 2 — в сетевом кооперативе, управление приходит от гостя
    if (this.multi) {
      var p2 = this.player2;
      if (p2 && !p2.dead) {
        if (p2.fireCooldown > 0) p2.fireCooldown -= dt;
        if (p2.shield > 0) p2.shield -= dt;
        if (p2.hitFlash > 0) p2.hitFlash -= dt;

        if (this.remoteDir >= 0) p2.tryMove(dt, this.remoteDir);
        else {
          p2.moving = false;
          p2.blocked = false;
        }
        if (this.remoteFire) p2.fire();
      } else if (this.respawnTimer2 > 0) {
        this.respawnTimer2 -= dt;
        if (this.respawnTimer2 <= 0) {
          if (!this.spawnPlayer(false, 2)) this.respawnTimer2 = 0.35;
        }
      }
    }

    // Враги
    for (i = 0; i < this.tanks.length; i++) {
      var t = this.tanks[i];
      if (t.team === 'enemy' && !t.dead) t.updateEnemy(dt);
    }

    // Пули
    for (i = 0; i < this.bullets.length; i++) this.bullets[i].update(dt);
    this.collideBullets();
    this.bullets = this.bullets.filter(function (b) { return !b.dead; });

    // Чистка танков
    this.tanks = this.tanks.filter(function (tank) { return !tank.dead; });

    // Бонусы и эффекты
    this.updatePowerUps(dt);
    this.updateEffects(dt);

    // Спавн
    this.updateSpawning(dt);
    this.updatePendingSpawns(dt);

    // Проверка зачистки
    if (this.shouldClearLevel()) {
      this.clearDelay += dt;
      if (this.clearDelay > 1.0) this.completeLevel();
    } else {
      this.clearDelay = 0;
    }
  };

  Game.prototype.update = function (dt) {
    this.time += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.2);
    if (this.mutedMsg > 0) this.mutedMsg -= dt;

    if (Input.wasPressed('KeyM')) {
      BCAudio.toggleMute();
      this.mutedMsg = 1.6;
    }

    // Сетевой режим: гость только рисует снапшоты, хозяин рассылает их.
    if (this.mode === 'net' && this.netStarted) {
      if (this.netRole === 'guest') {
        this.updateNetGuest(dt);
        if ((this.state === 'gameOver' || this.state === 'victory' || this.state === 'netLost') &&
            (Input.wasPressed('Enter') || Input.wasPressed('Space') || Input.wasPressed('Escape'))) {
          this.toMenu(true);
        }
        return;
      }
      this.snapTimer -= dt;
      if (this.snapTimer <= 0) {
        this.snapTimer = 1 / 30;
        this.sendNetState();
      }
    }

    switch (this.state) {
      case 'title':
        if (!this.netOpen) {
          if (this.modePick) {
            var modes = this.modeOptions().length;
            if (Input.wasPressed('ArrowUp') || Input.wasPressed('KeyW')) {
              this.modeIndex = (this.modeIndex + modes - 1) % modes;
              BCAudio.ensure();
            }
            if (Input.wasPressed('ArrowDown') || Input.wasPressed('KeyS')) {
              this.modeIndex = (this.modeIndex + 1) % modes;
              BCAudio.ensure();
            }
            if (Input.wasPressed('Enter') || Input.wasPressed('Space')) {
              this.startSoloGame(this.modeIndex === 1);
            } else if (Input.wasPressed('Escape')) {
              this.closeModePick();
            }
            break;
          }
          var count = this.menuItems().length;
          if (Input.wasPressed('ArrowUp') || Input.wasPressed('KeyW')) {
            this.menuIndex = (this.menuIndex + count - 1) % count;
            BCAudio.ensure();
          }
          if (Input.wasPressed('ArrowDown') || Input.wasPressed('KeyS')) {
            this.menuIndex = (this.menuIndex + 1) % count;
            BCAudio.ensure();
          }
          if (Input.wasPressed('Enter') || Input.wasPressed('Space')) {
            this.activateMenu();
          }
        } else if (Input.wasPressed('Escape')) {
          this.closeNetSetup();
        }
        break;

      case 'intro':
        this.updateEffects(dt);
        this.introTimer -= dt;
        if (this.introTimer <= 0) {
          this.state = 'playing';
          this.spawnTimer = 0.4;
        }
        break;

      case 'playing':
        if (Input.wasPressed('KeyP') || Input.wasPressed('Escape')) {
          this.pausedFrom = 'playing';
          this.state = 'paused';
          BCAudio.pause();
          break;
        }
        this.updatePlaying(dt);
        break;

      case 'paused':
        if (Input.wasPressed('KeyP') || Input.wasPressed('Escape') || Input.wasPressed('Enter')) {
          this.state = this.pausedFrom;
          BCAudio.pause();
        }
        break;

      case 'levelClear':
        this.updateEffects(dt);
        this.clearDelay -= dt;
        if (this.clearDelay <= 0) {
          // После последнего готового уровня начинаются случайные.
          this.loadLevel(this.levelIndex + 1);
        }
        break;

      case 'ending':
        this.updateEffects(dt);
        this.endTimer -= dt;
        if (this.endTimer <= 0) this.finishGameOver();
        break;

      case 'gameOver':
      case 'victory':
        if (Input.wasPressed('Enter') || Input.wasPressed('Space') || Input.wasPressed('Escape')) {
          this.toMenu();
        }
        break;

      case 'netLost':
        if (Input.wasPressed('Enter') || Input.wasPressed('Space') || Input.wasPressed('Escape')) {
          this.toMenu();
        }
        break;
    }
  };

  // ================================================================
  //  Рендер
  // ================================================================

  Game.prototype.render = function () {
    view.save();
    view.fillStyle = '#000000';
    view.fillRect(0, 0, CANVAS_W, CANVAS_H);

    if (this.shake > 0) {
      view.translate(rand(-1, 1) * this.shake * 2.5, rand(-1, 1) * this.shake * 2.5);
    }

    if (this.state === 'title') {
      this.drawTitle();
    } else {
      this.drawField();
      this.drawHUD();
      this.drawOverlays();
    }

    if (this.mutedMsg > 0) {
      view.fillStyle = 'rgba(0,0,0,0.78)';
      view.fillRect(CANVAS_W / 2 - 62, CANVAS_H - 40, 124, 20);
      view.strokeStyle = '#4a4c55';
      view.strokeRect(CANVAS_W / 2 - 62, CANVAS_H - 40, 124, 20);
      textCentered(BCAudio.muted ? 'ЗВУК ВЫКЛЮЧЕН' : 'ЗВУК ВКЛЮЧЁН', CANVAS_W / 2, CANVAS_H - 26, 9, '#ffd84a');
    }

    view.restore();
  };

  Game.prototype.drawField = function () {
    var x, y, i, t, time = this.time;

    view.save();
    view.translate(OFF_X, OFF_Y);
    view.beginPath();
    view.rect(0, 0, FIELD_W, FIELD_H);
    view.clip();

    view.fillStyle = '#070707';
    view.fillRect(0, 0, FIELD_W, FIELD_H);

    // Рельеф
    for (y = 0; y < ROWS; y++) {
      for (x = 0; x < COLS; x++) {
        t = this.map[y][x];
        if (t === T.BRICK) drawBrick(view, x * CELL, y * CELL);
        else if (t === T.STEEL) drawSteel(view, x * CELL, y * CELL);
        else if (t === T.WATER) drawWater(view, x * CELL, y * CELL, time);
        else if (t === T.ICE) drawIce(view, x * CELL, y * CELL);
        else if (t === T.TREE) {
          view.fillStyle = '#0b1e0b';
          view.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
      }
    }

    if (this.base) drawEagle(view, this.base.x, this.base.y, this.base.alive, time);

    // Бонусы
    for (i = 0; i < this.powerups.length; i++) {
      var pu = this.powerups[i];
      if (pu.timer < 3 && Math.floor(time * 8) % 2 === 0) continue;
      drawPowerUpIcon(view, pu, time);
    }

    // Танки
    for (i = 0; i < this.tanks.length; i++) drawTankEntity(view, this, this.tanks[i]);

    // Звёзды спавна
    for (i = 0; i < this.pendingSpawns.length; i++) {
      var sp = this.pendingSpawns[i];
      drawSpawnStar(view, sp.x, sp.y, sp.timer, time);
    }

    // Деревья поверх техники
    for (y = 0; y < ROWS; y++) {
      for (x = 0; x < COLS; x++) {
        if (this.map[y][x] === T.TREE) drawTreeOverlay(view, x * CELL, y * CELL);
      }
    }

    // Пули
    for (i = 0; i < this.bullets.length; i++) {
      var b = this.bullets[i];
      if (b.dead) continue;
      view.fillStyle = 'rgba(255,214,90,0.20)';
      view.fillRect(Math.round(b.x) - 2, Math.round(b.y) - 2, 12, 12);
      view.fillStyle = '#fff6c8';
      view.fillRect(Math.round(b.x) + 1, Math.round(b.y) + 1, 6, 6);
      view.fillStyle = '#ffd23a';
      view.fillRect(Math.round(b.x) + 2, Math.round(b.y) + 2, 4, 4);
    }

    // Взрывы и всплывающий счёт
    for (i = 0; i < this.explosions.length; i++) this.explosions[i].draw(view);
    for (i = 0; i < this.texts.length; i++) this.texts[i].draw(view);

    view.restore();

    // Рамка поля
    view.strokeStyle = '#4b4d57';
    view.lineWidth = 2;
    view.strokeRect(OFF_X - 2, OFF_Y - 2, FIELD_W + 4, FIELD_H + 4);
    view.strokeStyle = '#1c1d22';
    view.strokeRect(OFF_X - 4, OFF_Y - 4, FIELD_W + 8, FIELD_H + 8);
  };

  Game.prototype.drawHUD = function () {
    var x = PANEL_X;
    var y = PANEL_Y;
    var w = PANEL_W;
    var h = PANEL_H;

    view.fillStyle = '#141519';
    view.fillRect(x, y, w, h);
    view.strokeStyle = '#42444d';
    view.lineWidth = 2;
    view.strokeRect(x + 1, y + 1, w - 2, h - 2);
    view.strokeStyle = '#23252b';
    view.lineWidth = 1;
    view.strokeRect(x + 5, y + 5, w - 10, h - 10);

    view.textAlign = 'center';
    view.textBaseline = 'alphabetic';

    view.fillStyle = '#8f95a0';
    setFont(8);
    view.fillText('ВРАГИ', x + w / 2, y + 18);

    var remaining = (this.mode === 'net' && this.netRole === 'guest')
      ? this.netRemain : this.remainingEnemies();
    for (var i = 0; i < 20 && i < remaining; i++) {
      var col = i % 2;
      var row = Math.floor(i / 2);
      drawMiniTank(view, x + 36 + col * 22, y + 28 + row * 16, PAL.basic);
    }

    view.strokeStyle = '#2c2e36';
    view.beginPath();
    view.moveTo(x + 10, y + 190);
    view.lineTo(x + w - 10, y + 190);
    view.stroke();

    view.fillStyle = '#8f95a0';
    setFont(8);
    view.fillText('УРОВЕНЬ', x + w / 2, y + 206);
    view.fillStyle = '#ffd84a';
    setFont(24);
    view.fillText(String(this.levelIndex + 1), x + w / 2, y + 230);

    view.fillStyle = '#8f95a0';
    setFont(8);
    view.fillText('ЖИЗНИ', x + w / 2, y + 250);

    var j;
    if (this.multi) {
      drawMiniTank(view, x + 20, y + 256, PAL.player);
      view.textAlign = 'left';
      view.fillStyle = '#e9edf2';
      setFont(10);
      view.fillText('P1 × ' + Math.max(0, this.lives - 1), x + 40, y + 267);

      drawMiniTank(view, x + 20, y + 274, PAL.player2);
      view.fillStyle = '#b4f2b8';
      view.fillText('P2 × ' + Math.max(0, this.lives2 - 1), x + 40, y + 285);
      view.textAlign = 'center';

      view.fillStyle = '#8f95a0';
      setFont(8);
      view.fillText('СЧЁТ', x + w / 2, y + 299);
      view.fillStyle = '#e9edf2';
      setFont(12);
      view.fillText(pad(this.score, 6), x + w / 2, y + 314);

      view.textAlign = 'left';
      setFont(7);
      view.fillStyle = '#e8c020';
      view.fillText('P1', x + 18, y + 331);
      view.fillStyle = '#46c86a';
      view.fillText('P2', x + 18, y + 345);
      for (j = 0; j < 3; j++) {
        drawStarShape(view, x + 44 + j * 16, y + 328, 5, j < this.star ? '#ffd84a' : '#3a3d46');
        drawStarShape(view, x + 44 + j * 16, y + 342, 5, j < this.star2 ? '#46c86a' : '#3a3d46');
      }
      view.textAlign = 'center';

      view.strokeStyle = '#2c2e36';
      view.beginPath();
      view.moveTo(x + 10, y + 354);
      view.lineTo(x + w - 10, y + 354);
      view.stroke();

      view.fillStyle = '#6f7580';
      setFont(7.5);
      view.fillText('P — ПАУЗА', x + w / 2, y + 370);
      view.fillStyle = BCAudio.muted ? '#ff6b5a' : '#6f7580';
      view.fillText(BCAudio.muted ? 'ЗВУК ВЫКЛ' : 'M — ЗВУК', x + w / 2, y + 384);
      view.fillStyle = '#4e535c';
      view.fillText('СЕТЬ · КООП', x + w / 2, y + 402);
      return;
    }

    var spare = Math.max(0, this.lives - 1);
    drawMiniTank(view, x + 26, y + 258, PAL.player);
    view.textAlign = 'left';
    view.fillStyle = '#e9edf2';
    setFont(12);
    view.fillText('× ' + spare, x + 47, y + 271);
    view.textAlign = 'center';

    view.fillStyle = '#8f95a0';
    setFont(8);
    view.fillText('СЧЁТ', x + w / 2, y + 294);
    view.fillStyle = '#e9edf2';
    setFont(12);
    view.fillText(pad(this.score, 6), x + w / 2, y + 310);

    for (i = 0; i < 3; i++) {
      drawStarShape(view, x + 35 + i * 19, y + 328, 6, i < this.star ? '#ffd84a' : '#3a3d46');
    }

    view.strokeStyle = '#2c2e36';
    view.beginPath();
    view.moveTo(x + 10, y + 342);
    view.lineTo(x + w - 10, y + 342);
    view.stroke();

    view.fillStyle = '#6f7580';
    setFont(7.5);
    view.fillText('P — ПАУЗА', x + w / 2, y + 360);
    view.fillStyle = BCAudio.muted ? '#ff6b5a' : '#6f7580';
    view.fillText(BCAudio.muted ? 'ЗВУК ВЫКЛ' : 'M — ЗВУК', x + w / 2, y + 374);
    view.fillStyle = '#4e535c';
    view.fillText(this.levelGenerated ? 'БЕСКОНЕЧНО' : BC_LEVELS.length + ' УРОВНЕЙ', x + w / 2, y + 398);
  };

  Game.prototype.dimField = function (alpha) {
    view.fillStyle = 'rgba(0,0,0,' + alpha + ')';
    view.fillRect(OFF_X, OFF_Y, FIELD_W, FIELD_H);
  };

  Game.prototype.overlayPanel = function (cy, height) {
    var w = 350;
    var x = OFF_X + (FIELD_W - w) / 2;
    var y = cy - height / 2;
    view.fillStyle = 'rgba(6,7,10,0.90)';
    view.fillRect(x, y, w, height);
    view.strokeStyle = '#4b4d57';
    view.lineWidth = 2;
    view.strokeRect(x + 1, y + 1, w - 2, height - 2);
    view.strokeStyle = '#23252b';
    view.lineWidth = 1;
    view.strokeRect(x + 5, y + 5, w - 10, height - 10);
  };

  Game.prototype.drawOverlays = function () {
    var cx = OFF_X + FIELD_W / 2;
    var cy = OFF_Y + FIELD_H / 2;
    var pulse = 0.55 + 0.45 * Math.abs(Math.sin(this.time * 2.6));

    if (this.mode === 'net' && this.netRole === 'guest' && !this.netSynced) {
      this.dimField(0.7);
      this.overlayPanel(cy, 92);
      textCentered('СИНХРОНИЗАЦИЯ…', cx, cy - 2, 18, '#7dd8ff', 'bold', '#062a3a');
      view.globalAlpha = pulse;
      textCentered('СОЕДИНЕНИЕ С ХОЗЯИНОМ', cx, cy + 26, 9, '#9aa3ad');
      view.globalAlpha = 1;
      return;
    }

    if (this.state === 'intro') {
      this.dimField(0.55);
      this.overlayPanel(cy, 128);
      var introTitle = (this.levelGenerated ? 'СЛУЧАЙНЫЙ УРОВЕНЬ ' : 'УРОВЕНЬ ') + (this.levelIndex + 1);
      textCentered(introTitle, cx, cy - 18, this.levelGenerated ? 20 : 28, '#ffd84a', 'bold', '#2a1f00');
      textCentered(this.levelName, cx, cy + 10, 12, '#e9edf2');
      view.globalAlpha = pulse;
      textCentered('ПРИГОТОВЬТЕСЬ…', cx, cy + 44, 11, '#9aa3ad');
      view.globalAlpha = 1;
    } else if (this.state === 'paused') {
      this.dimField(0.68);
      this.overlayPanel(cy, 112);
      textCentered('ПАУЗА', cx, cy - 6, 32, '#ffd84a', 'bold', '#2a1f00');
      var pauseHint = this.mode === 'net'
        ? (this.netRole === 'host' ? 'P — ПРОДОЛЖИТЬ' : 'ОЖИДАНИЕ ХОЗЯИНА')
        : 'P — ПРОДОЛЖИТЬ';
      textCentered(pauseHint, cx, cy + 30, 10, '#c9ced6');
    } else if (this.state === 'levelClear') {
      var campaignDone = !this.genOnly && this.levelIndex + 1 >= BC_LEVELS.length;
      this.dimField(0.55);
      this.overlayPanel(cy, campaignDone ? 128 : 104);
      textCentered('УРОВЕНЬ ПРОЙДЕН!', cx, cy - (campaignDone ? 20 : 8), 22, '#7dff8a', 'bold', '#123a14');
      textCentered('СЧЁТ  ' + pad(this.score, 6), cx, cy + (campaignDone ? 10 : 24), 12, '#e9edf2');
      if (campaignDone) {
        textCentered('ДАЛЬШЕ — СЛУЧАЙНЫЕ УРОВНИ', cx, cy + 36, 9, '#ffd84a');
      }
    } else if (this.state === 'gameOver') {
      this.dimField(0.72);
      this.overlayPanel(cy, 184);
      textCentered('ИГРА ОКОНЧЕНА', cx, cy - 24, 26, '#ff6b4a', 'bold', '#3a0f00');
      textCentered(this.endReason === 'base' ? 'БАЗА УНИЧТОЖЕНА' : 'ТАНКИ ЗАКОНЧИЛИСЬ', cx, cy + 6, 10, '#c9ced6');
      textCentered('СЧЁТ  ' + pad(this.score, 6), cx, cy + 34, 11, '#e9edf2');
      view.globalAlpha = pulse;
      textCentered('ENTER — В МЕНЮ', cx, cy + 68, 12, '#ffd84a');
      view.globalAlpha = 1;
    } else if (this.state === 'victory') {
      this.dimField(0.75);
      this.overlayPanel(cy, 206);
      textCentered('ПОБЕДА!', cx, cy - 34, 38, '#ffd84a', 'bold', '#3a2a00');
      textCentered('ВСЕ ' + BC_LEVELS.length + ' УРОВНЯ ПРОЙДЕНЫ', cx, cy + 2, 12, '#e9edf2');
      textCentered('СЧЁТ  ' + pad(this.score, 6), cx, cy + 32, 12, '#c9ced6');
      textCentered('РЕКОРД  ' + pad(this.highScore, 6), cx, cy + 52, 10, '#8f95a0');
      view.globalAlpha = pulse;
      textCentered('ENTER — В МЕНЮ', cx, cy + 86, 12, '#ffd84a');
      view.globalAlpha = 1;
    } else if (this.state === 'netLost') {
      this.dimField(0.78);
      this.overlayPanel(cy, 148);
      textCentered('СВЯЗЬ ПОТЕРЯНА', cx, cy - 16, 22, '#ff6b4a', 'bold', '#3a0f00');
      textCentered('СОПЕРНИК ОТКЛЮЧИЛСЯ', cx, cy + 14, 10, '#c9ced6');
      view.globalAlpha = pulse;
      textCentered('ENTER — В МЕНЮ', cx, cy + 48, 12, '#ffd84a');
      view.globalAlpha = 1;
    }
  };

  Game.prototype.drawModePick = function (t) {
    view.fillStyle = 'rgba(3,4,7,0.82)';
    view.fillRect(0, 0, CANVAS_W, CANVAS_H);

    var x = 120;
    var y = 146;
    var w = 320;
    var h = 210;
    view.fillStyle = 'rgba(12,13,17,0.98)';
    view.fillRect(x, y, w, h);
    view.strokeStyle = '#4b4d57';
    view.lineWidth = 2;
    view.strokeRect(x + 1, y + 1, w - 2, h - 2);
    view.strokeStyle = '#23252b';
    view.lineWidth = 1;
    view.strokeRect(x + 5, y + 5, w - 10, h - 10);

    textCentered('НОВАЯ ИГРА', 280, 181, 20, '#ffd84a', 'bold', '#2a1f00');
    textCentered('ВЫБЕРИТЕ РЕЖИМ', 280, 200, 9, '#9aa0aa');

    var options = this.modeOptions();
    var descs = [
      BC_LEVELS.length + ' УРОВНЕЙ, ЗАТЕМ СЛУЧАЙНЫЕ',
      'ВСЕ УРОВНИ СЛУЧАЙНЫЕ'
    ];
    var rects = this.modeRects();
    for (var i = 0; i < options.length; i++) {
      var r = rects[i];
      var active = i === this.modeIndex;
      view.fillStyle = active ? 'rgba(255,216,74,0.13)' : 'rgba(255,255,255,0.03)';
      view.fillRect(r.x, r.y, r.w, r.h);
      view.strokeStyle = active ? '#ffd84a' : '#2f3139';
      view.lineWidth = active ? 2 : 1;
      view.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      if (active) {
        view.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(t * 4));
        textCentered('▶', r.x + 18, r.y + 19, 13, '#ffd84a');
        view.globalAlpha = 1;
      }
      textCentered(options[i], r.x + r.w / 2, r.y + 18, 13, active ? '#ffe66a' : '#b9bec7', 'bold');
      textCentered(descs[i], r.x + r.w / 2, r.y + 33, 7.5, active ? '#cfae4a' : '#7d828c');
    }

    textCentered('ENTER — СТАРТ     ESC — НАЗАД', 280, 336, 9, '#7d828c');
  };

  Game.prototype.drawTitle = function () {
    var t = this.time;

    var grad = view.createLinearGradient(0, 0, 0, CANVAS_H);
    grad.addColorStop(0, '#111217');
    grad.addColorStop(0.6, '#0a0a0d');
    grad.addColorStop(1, '#050506');
    view.fillStyle = grad;
    view.fillRect(0, 0, CANVAS_W, CANVAS_H);

    view.strokeStyle = 'rgba(255,255,255,0.03)';
    view.lineWidth = 1;
    for (var gx = 0; gx < CANVAS_W; gx += 28) {
      view.beginPath();
      view.moveTo(gx, 0);
      view.lineTo(gx, CANVAS_H);
      view.stroke();
    }
    for (var gy = 0; gy < CANVAS_H; gy += 28) {
      view.beginPath();
      view.moveTo(0, gy);
      view.lineTo(CANVAS_W, gy);
      view.stroke();
    }

    view.strokeStyle = '#34363e';
    view.lineWidth = 3;
    view.strokeRect(8, 8, CANVAS_W - 16, CANVAS_H - 16);
    view.strokeStyle = '#1d1e23';
    view.lineWidth = 1;
    view.strokeRect(13, 13, CANVAS_W - 26, CANVAS_H - 26);

    textCentered('BATTLE', 281, 103, 46, '#8a6400', 'bold');
    textCentered('BATTLE', 278, 100, 46, '#ffd84a', 'bold');
    textCentered('CITY', 281, 148, 46, '#8a6400', 'bold');
    textCentered('CITY', 278, 145, 46, '#ffd84a', 'bold');

    view.fillStyle = '#5e4a12';
    view.fillRect(150, 158, 260, 3);

    textCentered('ТАНКОВАЯ БИТВА · DENDY STYLE', 280, 180, 10, '#9aa0aa');

    var bob = Math.sin(t * 2) * 2;
    drawTankSprite(view, 118, 206 + bob, DIR.UP, PAL.player, t * 8);
    drawTankSprite(view, 410, 206, DIR.DOWN, PAL.basic, t * 7);
    drawTankSprite(view, 160, 218, DIR.UP, PAL.fast, t * 5);
    drawTankSprite(view, 368, 218, DIR.DOWN, PAL.power, t * 6);

    drawStarShape(view, 280, 216, 9, '#3d3210');
    drawStarShape(view, 280, 216, 5, '#8a6c1a');

    textCentered('РЕКОРД  ' + pad(this.highScore, 6), 280, 254, 10, '#cfd3da');

    var items = this.menuItems();
    var rects = this.menuRects();
    for (var mi = 0; mi < items.length; mi++) {
      var r = rects[mi];
      var active = mi === this.menuIndex;
      view.fillStyle = active ? 'rgba(255,216,74,0.13)' : 'rgba(255,255,255,0.03)';
      view.fillRect(r.x, r.y, r.w, r.h);
      view.strokeStyle = active ? '#ffd84a' : '#2f3139';
      view.lineWidth = active ? 2 : 1;
      view.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      if (active) {
        view.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(t * 4));
        textCentered('▶', r.x + 18, r.y + 20, 14, '#ffd84a');
        view.globalAlpha = 1;
      }
      textCentered(items[mi], r.x + r.w / 2, r.y + 20, 14, active ? '#ffe66a' : '#b9bec7', 'bold');
    }

    // Статус соединения — виден в меню у обоих игроков
    var st = this.netStatus();
    var colors = { ok: '#7dff8a', warn: '#ffc84a', err: '#ff6b5a', off: '#6f7580' };
    view.fillStyle = st.kind === 'ok' ? 'rgba(40,120,60,0.18)' : 'rgba(255,255,255,0.03)';
    view.fillRect(72, 358, 416, 26);
    view.strokeStyle = st.kind === 'ok' ? '#2f7a3f' : '#2f3139';
    view.lineWidth = 1;
    view.strokeRect(72.5, 358.5, 415, 25);
    if (st.kind === 'ok') {
      view.fillStyle = Math.floor(t * 2) % 2 === 0 ? '#7dff8a' : '#2f7a3f';
      view.fillRect(84, 368, 6, 6);
    }
    textCentered(st.text, 280, 377, 9, colors[st.kind] || '#9aa0aa', 'bold');

    textCentered('↑ ↓ — ВЫБОР     ENTER — ОК     M — ЗВУК', 280, 402, 9, '#7d828c');
    view.fillStyle = '#33363d';
    view.fillRect(150, 412, 260, 1);
    textCentered('ЧИСТЫЙ JAVASCRIPT · CANVAS 2D · ' + BC_LEVELS.length + ' УРОВНЕЙ + ∞', 280, 426, 7, '#4b4f57');

    if (this.modePick) this.drawModePick(t);
  };

  // ================================================================
  //  Запуск
  // ================================================================

  var game = new Game();
  window.BC_GAME = game;

  if (window.BCNet) {
    BCNet.on('relay', function (data) { game.onNetRelay(data); });
    BCNet.on('peer', function () {
      if (game.netStarted && !BCNet.isConnected()) game.netLinkLost();
    });
  }

  // Параметр ?level=N — быстрый старт с нужного уровня (отладка).
  try {
    var qp = new URLSearchParams(window.location.search);
    var startLevel = parseInt(qp.get('level'), 10);
    if (!isNaN(startLevel) && startLevel >= 1 && startLevel <= BC_LEVELS.length) {
      game.score = 0;
      game.lives = 3;
      game.star = 0;
      game.loadLevel(startLevel - 1);
    }
  } catch (err) {}

  var last = performance.now();
  function frame(now) {
    var dt = (now - last) / 1000;
    last = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);

    game.update(dt);
    game.render();
    Input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
