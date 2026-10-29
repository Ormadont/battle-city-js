/*
 * Battle City — данные уровней.
 * Поле 26 x 26 клеток по 16 px (416 x 416).
 * Все препятствия строятся по чётным координатам,
 * чтобы проходы были шириной минимум в 2 клетки (танк 32 px).
 */
(function () {
  'use strict';

  var COLS = 26;
  var ROWS = 26;

  var B = 1;     // кирпич
  var S = 2;     // сталь
  var W = 3;     // вода
  var TREE = 4;  // деревья
  var ICE = 5;   // лёд

  function blank() {
    var map = [];
    for (var y = 0; y < ROWS; y++) {
      var row = [];
      for (var x = 0; x < COLS; x++) row.push(0);
      map.push(row);
    }
    return map;
  }

  function rect(g, x, y, w, h, v) {
    for (var j = 0; j < h; j++) {
      for (var i = 0; i < w; i++) {
        var cx = x + i;
        var cy = y + j;
        if (cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS) g[cy][cx] = v;
      }
    }
  }

  // ------------------------------------------------------------------
  // Уровень 1. «Зелёный город» — классическая открытая планировка.
  // ------------------------------------------------------------------
  function level1() {
    var g = blank();

    rect(g, 4, 2, 4, 2, B);
    rect(g, 12, 2, 2, 2, S);
    rect(g, 18, 2, 4, 2, B);

    rect(g, 2, 6, 2, 2, B);
    rect(g, 8, 6, 4, 2, B);
    rect(g, 14, 6, 4, 2, B);
    rect(g, 22, 6, 2, 2, B);
    rect(g, 12, 6, 2, 2, TREE);

    rect(g, 4, 8, 2, 2, S);
    rect(g, 20, 8, 2, 2, S);
    rect(g, 10, 8, 6, 2, B);
    rect(g, 10, 10, 6, 2, TREE);

    rect(g, 2, 12, 4, 2, B);
    rect(g, 12, 12, 2, 2, S);
    rect(g, 20, 12, 4, 2, B);

    rect(g, 8, 14, 2, 2, B);
    rect(g, 16, 14, 2, 2, B);
    rect(g, 10, 14, 4, 2, TREE);

    rect(g, 2, 16, 6, 2, S);
    rect(g, 18, 16, 6, 2, B);

    rect(g, 4, 18, 2, 2, B);
    rect(g, 20, 18, 2, 2, B);
    rect(g, 10, 18, 2, 2, S);
    rect(g, 14, 18, 2, 2, S);

    rect(g, 6, 20, 2, 2, B);
    rect(g, 18, 20, 2, 2, B);

    return g;
  }

  // ------------------------------------------------------------------
  // Уровень 2. «Переправа» — река с мостами и островами.
  // ------------------------------------------------------------------
  function level2() {
    var g = blank();

    // Два канала реки
    rect(g, 6, 2, 2, 14, W);
    rect(g, 18, 2, 2, 14, W);

    // Мосты
    rect(g, 6, 6, 2, 2, 0);
    rect(g, 18, 6, 2, 2, 0);
    rect(g, 6, 12, 2, 2, 0);
    rect(g, 18, 12, 2, 2, 0);

    // Береговые укрепления
    rect(g, 2, 2, 2, 2, B);
    rect(g, 22, 2, 2, 2, B);
    rect(g, 10, 2, 6, 2, TREE);

    rect(g, 10, 4, 2, 2, B);
    rect(g, 14, 4, 2, 2, B);
    rect(g, 12, 4, 2, 2, S);

    rect(g, 2, 8, 2, 4, S);
    rect(g, 22, 8, 2, 4, S);

    rect(g, 10, 8, 2, 2, B);
    rect(g, 14, 8, 2, 2, B);
    rect(g, 12, 8, 2, 2, TREE);

    rect(g, 10, 10, 2, 4, B);
    rect(g, 14, 10, 2, 4, B);
    rect(g, 12, 10, 2, 2, TREE);

    rect(g, 2, 14, 2, 2, B);
    rect(g, 22, 14, 2, 2, B);

    rect(g, 2, 16, 4, 2, B);
    rect(g, 20, 16, 4, 2, B);
    rect(g, 12, 16, 2, 2, S);

    rect(g, 8, 18, 2, 2, TREE);
    rect(g, 16, 18, 2, 2, TREE);

    rect(g, 12, 18, 2, 4, B);

    rect(g, 4, 20, 2, 2, B);
    rect(g, 20, 20, 2, 2, B);

    return g;
  }

  // ------------------------------------------------------------------
  // Уровень 3. «Стальная крепость» — коридоры, балки, деревья.
  // ------------------------------------------------------------------
  function level3() {
    var g = blank();

    // Стальные колонны
    rect(g, 4, 4, 2, 8, S);
    rect(g, 20, 4, 2, 8, S);

    // Верхняя роща
    rect(g, 10, 2, 6, 2, TREE);

    rect(g, 8, 6, 2, 2, B);
    rect(g, 16, 6, 2, 2, B);
    rect(g, 10, 6, 6, 2, B);

    // Поперечная балка
    rect(g, 8, 10, 10, 2, S);

    // Деревья вдоль флангов
    rect(g, 6, 12, 2, 6, TREE);
    rect(g, 18, 12, 2, 6, TREE);

    // Внутренняя цитадель
    rect(g, 10, 13, 2, 2, B);
    rect(g, 14, 13, 2, 2, B);
    rect(g, 12, 13, 2, 2, S);

    rect(g, 2, 16, 4, 2, B);
    rect(g, 20, 16, 4, 2, B);

    // Нижняя балка
    rect(g, 10, 18, 6, 2, S);

    rect(g, 4, 20, 2, 2, B);
    rect(g, 20, 20, 2, 2, B);
    rect(g, 12, 20, 2, 2, TREE);

    return g;
  }

  // ------------------------------------------------------------------
  // Уровень 4. «Ледяной рубеж» — лёд, пруд, эшелонированная оборона.
  // ------------------------------------------------------------------
  function level4() {
    var g = blank();

    rect(g, 2, 2, 4, 2, B);
    rect(g, 20, 2, 4, 2, B);
    rect(g, 12, 2, 2, 2, S);

    rect(g, 6, 4, 4, 2, ICE);
    rect(g, 16, 4, 4, 2, ICE);

    rect(g, 10, 6, 6, 2, B);

    rect(g, 12, 8, 2, 2, ICE);
    rect(g, 2, 8, 2, 2, S);
    rect(g, 22, 8, 2, 2, S);
    rect(g, 6, 8, 2, 2, TREE);
    rect(g, 18, 8, 2, 2, TREE);

    rect(g, 8, 10, 10, 2, ICE);

    rect(g, 2, 12, 4, 4, ICE);
    rect(g, 20, 12, 4, 4, ICE);

    rect(g, 8, 14, 10, 2, W);

    rect(g, 10, 16, 6, 2, B);
    rect(g, 2, 18, 2, 2, B);
    rect(g, 22, 18, 2, 2, B);
    rect(g, 6, 18, 2, 2, TREE);
    rect(g, 18, 18, 2, 2, TREE);

    rect(g, 4, 20, 4, 2, ICE);
    rect(g, 18, 20, 4, 2, ICE);
    rect(g, 12, 20, 2, 2, TREE);

    return g;
  }

  // ------------------------------------------------------------------
  // Уровень 5. «Ночная гавань» — река, мосты-проходы, береговые укрытия.
  // ------------------------------------------------------------------
  function level5() {
    var g = blank();

    rect(g, 2, 2, 4, 2, B);
    rect(g, 20, 2, 4, 2, B);
    rect(g, 8, 2, 2, 2, S);
    rect(g, 16, 2, 2, 2, S);

    rect(g, 4, 4, 2, 2, B);
    rect(g, 20, 4, 2, 2, B);
    rect(g, 12, 4, 2, 4, B);

    rect(g, 2, 6, 2, 2, B);
    rect(g, 22, 6, 2, 2, B);
    rect(g, 8, 6, 4, 2, B);
    rect(g, 14, 6, 4, 2, B);

    // Река с тремя проходами
    rect(g, 2, 10, 22, 2, W);
    rect(g, 6, 10, 2, 2, 0);
    rect(g, 12, 10, 2, 2, 0);
    rect(g, 18, 10, 2, 2, 0);

    rect(g, 2, 14, 2, 2, B);
    rect(g, 22, 14, 2, 2, B);
    rect(g, 6, 14, 2, 2, B);
    rect(g, 8, 14, 10, 2, B);
    rect(g, 12, 14, 2, 2, S);
    rect(g, 18, 14, 2, 2, B);

    rect(g, 4, 18, 2, 2, B);
    rect(g, 20, 18, 2, 2, B);
    rect(g, 8, 18, 4, 2, TREE);
    rect(g, 14, 18, 4, 2, TREE);

    rect(g, 10, 20, 2, 2, S);
    rect(g, 14, 20, 2, 2, S);

    return g;
  }

  // ------------------------------------------------------------------
  // Уровень 6. «Каменный лабиринт» — стальные коридоры и тупики.
  // ------------------------------------------------------------------
  function level6() {
    var g = blank();

    rect(g, 6, 2, 2, 6, S);
    rect(g, 18, 2, 2, 6, S);
    rect(g, 10, 2, 6, 2, B);

    rect(g, 2, 6, 2, 2, B);
    rect(g, 22, 6, 2, 2, B);

    rect(g, 10, 8, 6, 2, B);

    rect(g, 2, 10, 2, 6, B);
    rect(g, 22, 10, 2, 6, B);
    rect(g, 6, 10, 4, 2, S);
    rect(g, 16, 10, 4, 2, S);

    rect(g, 10, 12, 6, 2, B);
    rect(g, 12, 14, 2, 4, S);
    rect(g, 8, 14, 2, 2, B);
    rect(g, 16, 14, 2, 2, B);

    rect(g, 8, 16, 2, 2, B);
    rect(g, 16, 16, 2, 2, B);

    rect(g, 2, 18, 6, 2, B);
    rect(g, 18, 18, 6, 2, B);

    rect(g, 10, 20, 6, 2, B);

    return g;
  }

  // ------------------------------------------------------------------
  // Уровень 7. «Двойная река» — два канала со смещёнными переходами.
  // ------------------------------------------------------------------
  function level7() {
    var g = blank();

    rect(g, 2, 2, 4, 2, B);
    rect(g, 20, 2, 4, 2, B);
    rect(g, 10, 2, 6, 2, S);

    // Верхний канал
    rect(g, 2, 6, 22, 2, W);
    rect(g, 6, 6, 2, 2, 0);
    rect(g, 12, 6, 2, 2, 0);
    rect(g, 18, 6, 2, 2, 0);

    rect(g, 4, 10, 4, 2, B);
    rect(g, 18, 10, 4, 2, B);
    rect(g, 10, 10, 6, 2, TREE);

    rect(g, 8, 12, 2, 2, S);
    rect(g, 16, 12, 2, 2, S);

    // Нижний канал
    rect(g, 2, 16, 22, 2, W);
    rect(g, 4, 16, 2, 2, 0);
    rect(g, 12, 16, 2, 2, 0);
    rect(g, 20, 16, 2, 2, 0);

    rect(g, 2, 20, 4, 2, B);
    rect(g, 20, 20, 4, 2, B);
    rect(g, 8, 20, 2, 2, TREE);
    rect(g, 16, 20, 2, 2, TREE);

    return g;
  }

  // ------------------------------------------------------------------
  // Уровень 8. «Зимний форт» — лёд, пруд, эшелонированные заслоны.
  // ------------------------------------------------------------------
  function level8() {
    var g = blank();

    rect(g, 2, 2, 6, 2, B);
    rect(g, 18, 2, 6, 2, B);
    rect(g, 12, 2, 2, 2, S);

    rect(g, 6, 4, 4, 2, ICE);
    rect(g, 16, 4, 4, 2, ICE);

    rect(g, 10, 6, 6, 2, B);

    rect(g, 2, 8, 2, 2, S);
    rect(g, 22, 8, 2, 2, S);
    rect(g, 6, 8, 2, 2, TREE);
    rect(g, 18, 8, 2, 2, TREE);

    rect(g, 10, 10, 6, 2, ICE);

    rect(g, 2, 12, 4, 4, ICE);
    rect(g, 20, 12, 4, 4, ICE);
    rect(g, 8, 12, 2, 2, S);
    rect(g, 16, 12, 2, 2, S);

    rect(g, 8, 14, 10, 2, W);

    rect(g, 10, 16, 6, 2, B);

    rect(g, 2, 18, 2, 2, B);
    rect(g, 22, 18, 2, 2, B);
    rect(g, 6, 18, 2, 2, B);
    rect(g, 18, 18, 2, 2, B);

    rect(g, 4, 20, 4, 2, ICE);
    rect(g, 18, 20, 4, 2, ICE);
    rect(g, 12, 20, 2, 2, TREE);

    return g;
  }

  // ------------------------------------------------------------------
  // Уровень 9. «Последний рубеж» — плотная оборона, река и сталь.
  // ------------------------------------------------------------------
  function level9() {
    var g = blank();

    rect(g, 2, 2, 2, 6, S);
    rect(g, 22, 2, 2, 6, S);
    rect(g, 6, 2, 2, 2, B);
    rect(g, 18, 2, 2, 2, B);
    rect(g, 10, 2, 6, 2, B);

    rect(g, 8, 6, 10, 2, B);

    rect(g, 2, 10, 6, 2, S);
    rect(g, 18, 10, 6, 2, S);
    rect(g, 10, 10, 6, 2, W);

    rect(g, 4, 12, 2, 6, B);
    rect(g, 20, 12, 2, 6, B);
    rect(g, 8, 12, 10, 2, TREE);

    rect(g, 12, 14, 2, 2, S);

    rect(g, 6, 16, 2, 2, B);
    rect(g, 18, 16, 2, 2, B);

    rect(g, 8, 18, 10, 2, B);

    rect(g, 2, 20, 4, 2, S);
    rect(g, 20, 20, 4, 2, S);
    rect(g, 10, 20, 2, 2, TREE);
    rect(g, 14, 20, 2, 2, TREE);

    return g;
  }

  var BONUS_INDEXES = [2, 6, 10, 14, 17];
  var BONUS_5 = [3, 8, 13, 17, 21];
  var BONUS_6 = [3, 8, 13, 18, 23];
  var BONUS_7 = [3, 8, 14, 19, 25];
  var BONUS_8 = [4, 10, 15, 21, 27];
  var BONUS_9 = [4, 10, 16, 22, 28];

  window.BC_LEVELS = [
    {
      name: 'ЗЕЛЁНЫЙ ГОРОД',
      map: level1(),
      maxActive: 4,
      bonus: BONUS_INDEXES,
      enemies: [
        'basic', 'basic', 'fast', 'basic', 'power',
        'basic', 'basic', 'fast', 'basic', 'power',
        'basic', 'fast', 'basic', 'power', 'fast',
        'basic', 'basic', 'fast', 'basic', 'basic'
      ]
    },
    {
      name: 'ПЕРЕПРАВА',
      map: level2(),
      maxActive: 4,
      bonus: BONUS_INDEXES,
      enemies: [
        'basic', 'fast', 'basic', 'power', 'fast',
        'basic', 'armor', 'fast', 'power', 'basic',
        'fast', 'basic', 'power', 'fast', 'armor',
        'basic', 'fast', 'power', 'basic', 'fast'
      ]
    },
    {
      name: 'СТАЛЬНАЯ КРЕПОСТЬ',
      map: level3(),
      maxActive: 5,
      bonus: BONUS_INDEXES,
      enemies: [
        'basic', 'fast', 'power', 'armor', 'basic',
        'fast', 'power', 'armor', 'fast', 'basic',
        'power', 'armor', 'fast', 'basic', 'power',
        'fast', 'armor', 'basic', 'fast', 'basic'
      ]
    },
    {
      name: 'ЛЕДЯНОЙ РУБЕЖ',
      map: level4(),
      maxActive: 5,
      bonus: BONUS_INDEXES,
      enemies: [
        'fast', 'armor', 'basic', 'power', 'armor',
        'fast', 'power', 'armor', 'basic', 'fast',
        'armor', 'power', 'fast', 'armor', 'basic',
        'fast', 'power', 'armor', 'fast', 'basic'
      ]
    },
    {
      name: 'НОЧНАЯ ГАВАНЬ',
      map: level5(),
      maxActive: 5,
      bonus: BONUS_5,
      enemies: [
        'basic', 'basic', 'fast', 'basic', 'power',
        'fast', 'armor', 'fast', 'power', 'basic',
        'armor', 'fast', 'power', 'fast', 'armor',
        'basic', 'power', 'armor', 'fast', 'power',
        'armor', 'armor'
      ]
    },
    {
      name: 'КАМЕННЫЙ ЛАБИРИНТ',
      map: level6(),
      maxActive: 6,
      bonus: BONUS_6,
      enemies: [
        'basic', 'basic', 'fast', 'basic', 'power',
        'fast', 'armor', 'fast', 'power', 'basic',
        'armor', 'fast', 'power', 'fast', 'armor',
        'power', 'armor', 'fast', 'power', 'armor',
        'power', 'armor', 'armor', 'armor'
      ]
    },
    {
      name: 'ДВОЙНАЯ РЕКА',
      map: level7(),
      maxActive: 6,
      bonus: BONUS_7,
      enemies: [
        'basic', 'fast', 'basic', 'power', 'fast',
        'armor', 'fast', 'power', 'basic', 'fast',
        'armor', 'power', 'fast', 'armor', 'power',
        'fast', 'armor', 'power', 'fast', 'armor',
        'power', 'armor', 'armor', 'power', 'armor',
        'armor'
      ]
    },
    {
      name: 'ЗИМНИЙ ФОРТ',
      map: level8(),
      maxActive: 6,
      bonus: BONUS_8,
      enemies: [
        'basic', 'fast', 'basic', 'power', 'fast',
        'armor', 'fast', 'power', 'basic', 'fast',
        'armor', 'power', 'fast', 'armor', 'power',
        'fast', 'armor', 'power', 'fast', 'armor',
        'power', 'armor', 'armor', 'power', 'armor',
        'power', 'armor', 'armor'
      ]
    },
    {
      name: 'ПОСЛЕДНИЙ РУБЕЖ',
      map: level9(),
      maxActive: 7,
      bonus: BONUS_9,
      enemies: [
        'basic', 'fast', 'basic', 'power', 'fast',
        'armor', 'fast', 'power', 'fast', 'armor',
        'power', 'fast', 'armor', 'power', 'fast',
        'armor', 'power', 'fast', 'armor', 'power',
        'fast', 'armor', 'power', 'armor', 'armor',
        'power', 'armor', 'power', 'armor', 'armor'
      ]
    }
  ];
})();
