// Pruebas del motor de puntuación: extrae computeScore/winGame de index.html y las ejecuta.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

// Aislar solo el motor (sin DOM): desde "const PTS" hasta antes de "// ---------- Persistencia"
const engine = script.slice(script.indexOf('const PTS'), script.indexOf('// ---------- Persistencia'));
eval(engine);

const cfgGold = { setsToWin: 2, goldenPoint: true, tiebreak: true };
const cfgAdv = { setsToWin: 2, goldenPoint: false, tiebreak: true };
const cfgNoTb = { setsToWin: 2, goldenPoint: true, tiebreak: false };

let fails = 0;
function check(name, cond) {
  if (!cond) { fails++; console.log('FAIL: ' + name); }
  else console.log('ok:   ' + name);
}

// Helpers: generar puntos
const rep = (c, n) => Array(n).fill(c);

// 1. Juego simple: A gana 4 puntos seguidos -> 1-0 en juegos
let s = computeScore(cfgGold, rep('A', 4));
check('4 puntos seguidos ganan el juego', s.games.a === 1 && s.games.b === 0 && s.pts.a === 0);

// 2. Etiquetas 0/15/30/40
s = computeScore(cfgGold, ['A', 'A', 'A']);
check('3 puntos = 40', pointLabel(s, 'a') === '40' && pointLabel(s, 'b') === '0');

// 3. Punto de oro: 40-40 y el siguiente punto gana
s = computeScore(cfgGold, ['A','A','A','B','B','B']);
check('40-40 marca punto de oro', s.isGoldenPoint === true);
s = computeScore(cfgGold, ['A','A','A','B','B','B','B']);
check('punto de oro: B gana el juego', s.games.b === 1 && s.pts.a === 0 && s.pts.b === 0);

// 4. Ventaja: 40-40 -> AD -> vuelve a deuce -> AD -> juego
s = computeScore(cfgAdv, ['A','A','A','B','B','B','A']);
check('ventaja A', pointLabel(s, 'a') === 'AD');
s = computeScore(cfgAdv, ['A','A','A','B','B','B','A','B']);
check('vuelve a deuce', pointLabel(s, 'a') === '40' && pointLabel(s, 'b') === '40');
s = computeScore(cfgAdv, ['A','A','A','B','B','B','A','A']);
check('ventaja + punto = juego', s.games.a === 1);

// 5. Set: 6 juegos con diferencia de 2
let pts = [];
for (let g = 0; g < 6; g++) pts.push(...rep('A', 4));
s = computeScore(cfgGold, pts);
check('6-0 cierra el set', s.sets.length === 1 && s.sets[0].a === 6 && s.setsWon.a === 1 && s.games.a === 0);

// 6. 5-5 -> 7-5 cierra el set
pts = [];
for (let g = 0; g < 5; g++) { pts.push(...rep('A', 4)); pts.push(...rep('B', 4)); }
pts.push(...rep('A', 4)); // 6-5
s = computeScore(cfgGold, pts);
check('6-5 NO cierra el set', s.sets.length === 0 && s.games.a === 6 && s.games.b === 5);
pts.push(...rep('A', 4)); // 7-5
s = computeScore(cfgGold, pts);
check('7-5 cierra el set', s.sets.length === 1 && s.sets[0].a === 7 && s.sets[0].b === 5);

// 7. 6-6 -> tie-break, a 7 con diferencia de 2
pts = [];
for (let g = 0; g < 6; g++) { pts.push(...rep('A', 4)); pts.push(...rep('B', 4)); }
s = computeScore(cfgGold, pts);
check('6-6 entra en tie-break', s.inTiebreak === true);
let tb = pts.concat(rep('A', 6), rep('B', 6)); // 6-6 en el TB
s = computeScore(cfgGold, tb);
check('tie-break 6-6 sigue', s.inTiebreak && s.pts.a === 6 && s.pts.b === 6);
tb = pts.concat(rep('A', 7));
s = computeScore(cfgGold, tb);
check('tie-break 7-0 cierra set 7-6', s.sets.length === 1 && s.sets[0].a === 7 && s.sets[0].b === 6 && !s.inTiebreak);
tb = pts.concat(rep('A', 6), rep('B', 6), 'A', 'A'); // 8-6
s = computeScore(cfgGold, tb);
check('tie-break 8-6 cierra el set', s.sets.length === 1 && s.setsWon.a === 1);

// 8. Sin tie-break: 6-6 sigue hasta diferencia de 2
pts = [];
for (let g = 0; g < 6; g++) { pts.push(...rep('A', 4)); pts.push(...rep('B', 4)); }
s = computeScore(cfgNoTb, pts);
check('sin TB: 6-6 no entra en tie-break', s.inTiebreak === false);
pts.push(...rep('A', 4)); // 7-6
s = computeScore(cfgNoTb, pts);
check('sin TB: 7-6 no cierra', s.sets.length === 0);
pts.push(...rep('A', 4)); // 8-6
s = computeScore(cfgNoTb, pts);
check('sin TB: 8-6 cierra el set', s.sets.length === 1 && s.sets[0].a === 8);

// 9. Partido completo: A gana 2 sets -> winner, puntos extra ignorados
pts = [];
for (let g = 0; g < 12; g++) pts.push(...rep('A', 4)); // 6-0 6-0
s = computeScore(cfgGold, pts);
check('2 sets = partido ganado', s.winner === 'a' && s.setsWon.a === 2);
s = computeScore(cfgGold, pts.concat(['B']));
check('puntos tras el final se ignoran', s.winner === 'a' && s.pts.b === 0);

// 10. Un solo set (setsToWin=1)
const cfg1 = { setsToWin: 1, goldenPoint: true, tiebreak: true };
pts = [];
for (let g = 0; g < 6; g++) pts.push(...rep('A', 4));
s = computeScore(cfg1, pts);
check('a 1 set: ganar el set gana el partido', s.winner === 'a');

// 11. Deshacer = quitar último punto (reproducibilidad)
pts = rep('A', 4).concat(['B', 'B']);
s = computeScore(cfgGold, pts.slice(0, -1));
check('deshacer reproduce estado anterior', s.games.a === 1 && s.pts.b === 1);

// 12. Saque alterna por juego
s = computeScore(cfgGold, []);
check('saca A al inicio', s.server === 'a');
s = computeScore(cfgGold, rep('A', 4));
check('tras 1 juego saca B', s.server === 'b');

// 13. Súper tie-break a 11 como tercer set (1-1 en sets)
const cfgStb = { setsToWin: 2, goldenPoint: true, tiebreak: true, superTb: true };
pts = [];
for (let g = 0; g < 6; g++) pts.push(...rep('A', 4)); // set 1: A 6-0
for (let g = 0; g < 6; g++) pts.push(...rep('B', 4)); // set 2: B 6-0
s = computeScore(cfgStb, pts);
check('1-1 en sets entra en súper TB', s.inTiebreak === true && s.inSuperTb === true);
s = computeScore(cfgStb, pts.concat(rep('A', 11)));
check('STB 11-0 gana el partido', s.winner === 'a' && s.sets.length === 3 && s.sets[2].a === 11 && s.sets[2].stb === true);
s = computeScore(cfgStb, pts.concat(rep('A', 10), rep('B', 10), 'A'));
check('STB 11-10 no cierra (dif. de 2)', !s.winner && s.pts.a === 11 && s.inSuperTb);
s = computeScore(cfgStb, pts.concat(rep('A', 10), rep('B', 10), 'A', 'A'));
check('STB 12-10 cierra el partido', s.winner === 'a' && s.sets[2].a === 12 && s.sets[2].b === 10);
s = computeScore(cfgGold, pts);
check('sin STB el tercer set es normal', s.inTiebreak === false && s.inSuperTb === false);
s = computeScore(cfgStb, pts.concat(rep('B', 8)));
check('deshacer dentro del STB reproduce bien', s.inSuperTb && s.pts.b === 8 && s.pts.a === 0);

console.log(fails ? `\n${fails} pruebas fallaron` : '\nTodas las pruebas pasaron ✔');
process.exit(fails ? 1 : 0);
