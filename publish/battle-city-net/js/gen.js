/*
 * Battle City — генератор случайных уровней.
 * Поле делится на макро-сетку 13 x 13 (клетка 2 x 2 тайла = 32 px).
 * Открытые макро-клетки всегда образуют связную область, поэтому
 * карта гарантированно проходима: от точек появления врагов можно
 * добраться до игроков и до подступов к базе.
 */
(function () {
  'use strict';

  var COLS = 26;
  var ROWS = 26;
  var MACRO = 13;

  var T = { EMPTY: 0, BRICK: 1, STEEL: 2, WATER: 3, TREE: 4, ICE: 5 };

  var LIMITS = {
    ENEMIES_MIN: 1,
    ENEMIES_MAX: 30,
    MAX_ACTIVE_MIN: 2,
    MAX_ACTIVE_MAX: 8,
    BONUS_MAX: 8,
    TILE_MIN: 0,
    TILE_MAX: 5,
    TYPES: ['basic', 'fast', 'power', 'armor']
  };

  var NAMES = [
    'ТУМАННЫЙ ФОРТ',
    'НОЧНАЯ ГАВАНЬ',
    'СТАЛЬНОЙ ЛАБИРИНТ',
    'ЛЕДЯНОЙ ПЕРЕВАЛ',
    'ОГНЕННЫЙ РУБЕЖ',
    'ЗАБЫТЫЙ АРСЕНАЛ',
    'ГЛУХАЯ ЦИТАДЕЛЬ',
    'ПЕСЧАНАЯ БУРЯ',
    'ХОЛОДНЫЙ КОРИДОР',
    'ПОСЛЕДНИЙ ФОРПОСТ'
  ];

  // Обязательно открытые макро-клетки: 3 точки спавна врагов,
  // 2 площадки игроков и подступ к базе (12..13, 22..23).
  var REQUIRED = [[0, 0], [6, 0], [12, 0], [4, 12], [8, 12], [6, 11]];

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function makeRng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  function randInt(rng, a, b) {
    return a + Math.floor(rng() * (b - a + 1));
  }

  function blank() {
    var map = [];
    for (var y = 0; y < ROWS; y++) {
      var row = [];
      for (var x = 0; x < COLS; x++) row.push(0);
      map.push(row);
    }
    return map;
  }

  function fillMacro(map, mx, my, value) {
    for (var j = 0; j < 2; j++) {
      for (var i = 0; i < 2; i++) {
        map[my * 2 + j][mx * 2 + i] = value;
      }
    }
  }

  function paramsFor(n) {
    var enemies = clamp(20 + (n - 1) * 2, LIMITS.ENEMIES_MIN, LIMITS.ENEMIES_MAX);
    var maxActive = clamp(4 + Math.floor((n - 1) / 2), 4, 7);
    var openShare = Math.max(0.52, 0.72 - (n - 1) * 0.025);
    return {
      enemies: enemies,
      maxActive: maxActive,
      openTarget: Math.round(MACRO * MACRO * openShare)
    };
  }

  function makeQueue(rng, n, count) {
    var weights = {
      basic: Math.max(1, 12 - n),
      fast: 4,
      power: 4 + Math.floor(n / 2),
      armor: n >= 3 ? 2 + Math.floor((n - 1) * 0.9) : 0
    };
    var types = LIMITS.TYPES;
    var total = 0;
    for (var i = 0; i < types.length; i++) total += weights[types[i]];

    var queue = [];
    for (var k = 0; k < count; k++) {
      var roll = rng() * total;
      var picked = types[0];
      for (var j = 0; j < types.length; j++) {
        if (weights[types[j]] <= 0) continue;
        if (roll < weights[types[j]]) { picked = types[j]; break; }
        roll -= weights[types[j]];
      }
      queue.push(picked);
    }
    // Слабые противники идут первыми — сложность растёт внутри уровня.
    var rank = { basic: 0, fast: 1, power: 2, armor: 3 };
    queue.sort(function (a, b) { return rank[a] - rank[b]; });
    return queue;
  }

  function makeBonus(count) {
    var list = [];
    for (var i = 1; i <= 5; i++) {
      var idx = clamp(Math.floor(count * i / 6), 0, count - 1);
      if (list.indexOf(idx) < 0) list.push(idx);
    }
    return list;
  }

  function generate(n, seed) {
    n = Math.max(1, Math.floor(n || 1));
    var rng = makeRng(seed === undefined
      ? ((Date.now() ^ (n * 2654435761)) >>> 0)
      : seed);
    var params = paramsFor(n);

    var openMap = {};
    var openList = [];
    var requiredMap = {};

    function key(x, y) { return x + ',' + y; }
    function addOpen(x, y) {
      var k = key(x, y);
      if (x < 0 || y < 0 || x >= MACRO || y >= MACRO || openMap[k]) return false;
      openMap[k] = 1;
      openList.push([x, y]);
      return true;
    }

    for (var r = 0; r < REQUIRED.length; r++) {
      addOpen(REQUIRED[r][0], REQUIRED[r][1]);
      requiredMap[key(REQUIRED[r][0], REQUIRED[r][1])] = 1;
    }

    // Гарантированные коридоры от каждой обязательной точки к базе.
    var hub = REQUIRED[REQUIRED.length - 1];
    for (var p = 0; p < REQUIRED.length - 1; p++) {
      var from = REQUIRED[p];
      var x = from[0];
      var y = from[1];
      // Макро-клетка базы (6,12) целиком занята базой, поэтому коридоры
      // от нижних площадок игроков идут сначала вверх, а уже потом вбок.
      var horizontalFirst = from[1] > hub[1] ? false : rng() < 0.5;
      var stepX = function () {
        while (x !== hub[0]) {
          x += x < hub[0] ? 1 : -1;
          addOpen(x, y);
        }
      };
      var stepY = function () {
        while (y !== hub[1]) {
          y += y < hub[1] ? 1 : -1;
          addOpen(x, y);
        }
      };
      if (horizontalFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    }

    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    var guard = 0;
    while (openList.length < params.openTarget && guard++ < 4000) {
      var cell = openList[randInt(rng, 0, openList.length - 1)];
      var order = dirs.slice();
      for (var d = order.length - 1; d > 0; d--) {
        var j = randInt(rng, 0, d);
        var tmp = order[d];
        order[d] = order[j];
        order[j] = tmp;
      }
      for (var o = 0; o < order.length; o++) {
        if (addOpen(cell[0] + order[o][0], cell[1] + order[o][1])) break;
      }
    }

    var map = blank();
    var hard = Math.min(1, (n - 1) / 14);

    for (var my = 0; my < MACRO; my++) {
      for (var mx = 0; mx < MACRO; mx++) {
        var k = key(mx, my);
        if (openMap[k]) {
          var floor = T.EMPTY;
          if (!requiredMap[k]) {
            var fr = rng();
            if (fr < 0.09) floor = T.TREE;
            else if (fr < 0.21) floor = T.ICE;
          }
          if (floor !== T.EMPTY) fillMacro(map, mx, my, floor);
        } else {
          var wb = 1;
          var ws = 0.10 + hard * 0.85;
          var ww = 0.03 + hard * 0.42;
          var roll = rng() * (wb + ws + ww);
          var solid = roll < wb ? T.BRICK : (roll < wb + ws ? T.STEEL : T.WATER);
          fillMacro(map, mx, my, solid);
        }
      }
    }

    var queue = makeQueue(rng, n, params.enemies);

    return {
      name: NAMES[randInt(rng, 0, NAMES.length - 1)],
      map: map,
      maxActive: params.maxActive,
      bonus: makeBonus(queue.length),
      enemies: queue,
      generated: true,
      number: n
    };
  }

  window.BCGen = {
    generate: generate,
    limits: LIMITS,
    macro: MACRO,
    required: REQUIRED.slice()
  };
})();
