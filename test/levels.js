/*
 * Проверка уровней Battle City.
 * 1. Все готовые уровни в пределах допустимых параметров.
 * 2. Каждый следующий готовый уровень сложнее предыдущего.
 * 3. Каждый уровень проходим: точки спавна врагов, игроки и подступ
 *    к базе связаны проходимыми для танка 32x32 маршрутами.
 * 4. Случайные уровни всегда валидны и проходимы, противников >= 1.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const COLS = 26;
const ROWS = 26;

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail === undefined ? '' : '  ' + JSON.stringify(detail)));
}

const sandbox = { window: {}, Math: Math, Date: Date };
vm.createContext(sandbox);
for (const file of ['js/levels.js', 'js/gen.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
}

const LEVELS = sandbox.window.BC_LEVELS;
const GEN = sandbox.window.BCGen;
const LIMITS = GEN.limits;
const TYPES = LIMITS.TYPES;

const ENEMY_WEIGHT = { basic: 1, fast: 2, power: 3, armor: 4 };
const BLOCKING = { 2: true, 3: true, 6: true }; // сталь, вода и база непроходимы

const PLAYER_SPAWNS = [[8, 24], [16, 24]];
const ENEMY_SPAWNS = [[0, 0], [12, 0], [24, 0]];
const BASE_WINDOWS = [[12, 22], [10, 22], [14, 22], [11, 22], [13, 22]];

function normalize(src) {
  const map = src.map((row) => row.slice());
  const clear = (cx, cy, w, h) => {
    for (let y = cy; y < cy + h; y++) {
      for (let x = cx; x < cx + w; x++) {
        if (map[y] && map[y][x] !== undefined) map[y][x] = 0;
      }
    }
  };
  clear(0, 0, 2, 2);
  clear(12, 0, 2, 2);
  clear(24, 0, 2, 2);
  clear(7, 23, 4, 3);
  clear(15, 23, 4, 3);
  clear(11, 23, 4, 3);
  for (let by = 0; by < 2; by++) {
    for (let bx = 0; bx < 2; bx++) map[24 + by][12 + bx] = 6;
  }
  const fort = [[11, 23], [12, 23], [13, 23], [14, 23], [11, 24], [11, 25], [14, 24], [14, 25]];
  for (const [x, y] of fort) {
    if (map[y][x] !== 6) map[y][x] = 1;
  }
  return map;
}

function passable(tile) {
  return !BLOCKING[tile];
}

function fits(map, x, y) {
  if (x < 0 || y < 0 || x > COLS - 2 || y > ROWS - 2) return false;
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      if (!passable(map[y + dy][x + dx])) return false;
    }
  }
  return true;
}

function reachable(map, startX, startY) {
  const seen = new Set([startX + ',' + startY]);
  const queue = [[startX, startY]];
  while (queue.length) {
    const [x, y] = queue.pop();
    const moves = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of moves) {
      const nx = x + dx;
      const ny = y + dy;
      const key = nx + ',' + ny;
      if (seen.has(key)) continue;
      if (!fits(map, nx, ny)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

function validateLevel(label, data) {
  const problems = [];
  const fail = (text) => problems.push(text);

  if (typeof data.name !== 'string' || !data.name) fail('name missing');
  if (!Array.isArray(data.enemies)) {
    fail('enemies is not an array');
  } else {
    if (data.enemies.length < LIMITS.ENEMIES_MIN) fail('enemies < ' + LIMITS.ENEMIES_MIN);
    if (data.enemies.length > LIMITS.ENEMIES_MAX) fail('enemies > ' + LIMITS.ENEMIES_MAX);
    for (const type of data.enemies) {
      if (TYPES.indexOf(type) < 0) fail('unknown enemy type ' + type);
    }
  }

  if (!Number.isInteger(data.maxActive)) fail('maxActive is not integer');
  else if (data.maxActive < LIMITS.MAX_ACTIVE_MIN || data.maxActive > LIMITS.MAX_ACTIVE_MAX) {
    fail('maxActive out of range ' + data.maxActive);
  }

  if (!Array.isArray(data.bonus)) {
    fail('bonus is not an array');
  } else {
    if (data.bonus.length > LIMITS.BONUS_MAX) fail('too many bonuses');
    const seen = new Set();
    const count = data.enemies.length;
    for (const index of data.bonus) {
      if (!Number.isInteger(index) || index < 0 || index >= count) fail('bonus index out of range ' + index);
      if (seen.has(index)) fail('duplicate bonus index ' + index);
      seen.add(index);
    }
  }

  if (!Array.isArray(data.map) || data.map.length !== ROWS) {
    fail('map size mismatch');
    return { problems, stats: null };
  }
  for (let y = 0; y < ROWS; y++) {
    const row = data.map[y];
    if (!Array.isArray(row) || row.length !== COLS) {
      fail('map row ' + y + ' size mismatch');
      return { problems, stats: null };
    }
    for (let x = 0; x < COLS; x++) {
      const tile = row[x];
      if (!Number.isInteger(tile) || tile < LIMITS.TILE_MIN || tile > LIMITS.TILE_MAX) {
        fail('invalid tile ' + tile + ' at ' + x + ',' + y);
      }
    }
  }

  const map = normalize(data.map);

  for (const [x, y] of ENEMY_SPAWNS) {
    if (!fits(map, x, y)) fail('enemy spawn blocked at ' + x + ',' + y);
  }
  for (const [x, y] of PLAYER_SPAWNS) {
    if (!fits(map, x, y)) fail('player spawn blocked at ' + x + ',' + y);
  }

  const fromPlayer = reachable(map, PLAYER_SPAWNS[0][0], PLAYER_SPAWNS[0][1]);
  for (const [x, y] of ENEMY_SPAWNS) {
    if (!fromPlayer.has(x + ',' + y)) fail('enemy spawn ' + x + ',' + y + ' unreachable');
  }
  if (!fromPlayer.has(PLAYER_SPAWNS[1][0] + ',' + PLAYER_SPAWNS[1][1])) {
    fail('second player spawn unreachable');
  }
  let baseReachable = false;
  for (const [x, y] of BASE_WINDOWS) {
    if (fits(map, x, y) && fromPlayer.has(x + ',' + y)) baseReachable = true;
  }
  if (!baseReachable) fail('base approach unreachable');

  const stats = {
    enemies: data.enemies.length,
    maxActive: data.maxActive,
    strength: data.enemies.reduce((sum, type) => sum + (ENEMY_WEIGHT[type] || 0), 0),
    blocked: map.reduce((sum, row) => sum + row.filter((t) => !passable(t)).length, 0)
  };
  return { problems, stats };
}

// --------------------------------------------------------------------
//  Готовые уровни
// --------------------------------------------------------------------
check('готовых уровней 9', LEVELS.length === 9, LEVELS.length);

const fixedStats = [];
for (let i = 0; i < LEVELS.length; i++) {
  const { problems, stats } = validateLevel(LEVELS[i].name, LEVELS[i]);
  fixedStats.push(stats);
  check('уровень ' + (i + 1) + ' «' + LEVELS[i].name + '» валиден и проходим', problems.length === 0, problems);
  check('уровень ' + (i + 1) + ': противников >= 1', LEVELS[i].enemies.length >= 1, LEVELS[i].enemies.length);
  check(
    'уровень ' + (i + 1) + ': параметры в пределах',
    stats && stats.enemies <= LIMITS.ENEMIES_MAX && stats.maxActive <= LIMITS.MAX_ACTIVE_MAX,
    stats
  );
}

for (let i = 1; i < fixedStats.length; i++) {
  const prev = fixedStats[i - 1];
  const cur = fixedStats[i];
  const harder = cur.strength > prev.strength;
  const noLess = cur.enemies >= prev.enemies && cur.maxActive >= prev.maxActive;
  check('уровень ' + (i + 1) + ' сложнее уровня ' + i, !!(harder && noLess), { prev, cur });
}

// --------------------------------------------------------------------
//  Случайные уровни
// --------------------------------------------------------------------
check('генератор доступен', !!(GEN && typeof GEN.generate === 'function'), null);
check('лимит противников допускает хотя бы одного', LIMITS.ENEMIES_MIN >= 1, LIMITS.ENEMIES_MIN);

let generatedFailures = 0;
let generatedTotal = 0;
let minEnemies = Infinity;
let maxEnemies = 0;
const generatedStats = [];

for (let n = 1; n <= 30; n++) {
  const statsForN = [];
  for (let seed = 1; seed <= 10; seed++) {
    generatedTotal++;
    const data = GEN.generate(n, n * 1000 + seed);
    const { problems, stats } = validateLevel('gen ' + n, data);
    if (problems.length) {
      generatedFailures++;
      if (generatedFailures <= 5) console.log('  gen n=' + n + ' seed=' + seed + ': ' + problems.join('; '));
    }
    minEnemies = Math.min(minEnemies, data.enemies.length);
    maxEnemies = Math.max(maxEnemies, data.enemies.length);
    statsForN.push(stats);
  }
  generatedStats.push(statsForN);
}

check('случайные уровни валидны и проходимы', generatedFailures === 0, { total: generatedTotal, failed: generatedFailures });
check('случайные уровни: противников >= 1', minEnemies >= LIMITS.ENEMIES_MIN, { minEnemies, maxEnemies });
check('случайные уровни: противников <= ' + LIMITS.ENEMIES_MAX, maxEnemies <= LIMITS.ENEMIES_MAX, maxEnemies);

let countsRise = true;
let activeRise = true;
const countByN = [];
for (const statsForN of generatedStats) {
  const enemies = Math.min(...statsForN.map((s) => s.enemies));
  const active = Math.min(...statsForN.map((s) => s.maxActive));
  countByN.push(enemies);
  if (countByN.length > 1) {
    if (enemies < countByN[countByN.length - 2]) countsRise = false;
    if (active < Math.min(...generatedStats[countByN.length - 2].map((s) => s.maxActive))) activeRise = false;
  }
}
check('сложность случайных уровней не падает', countsRise && activeRise, countByN);

const signatures = new Set();
for (let seed = 1; seed <= 20; seed++) {
  const data = GEN.generate(7, 777000 + seed);
  signatures.add(JSON.stringify(data.map));
}
check('случайные уровни различаются', signatures.size >= 18, signatures.size + '/20');

const failed = results.filter((r) => !r.ok).length;
console.log('SUMMARY', JSON.stringify({ total: results.length, failed }));
process.exitCode = failed ? 1 : 0;
