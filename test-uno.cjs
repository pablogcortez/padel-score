// Verifica que el porteo C del motor (contador-uno.ino) sea fiel al motor JS de
// la app: reimplementa la lógica C literalmente y la compara con computeScore
// sobre miles de secuencias aleatorias de puntos.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const engine = script.slice(script.indexOf('const PTS'), script.indexOf('// ---------- Persistencia'));
eval(engine);

// --- Traducción literal de la lógica de contador-uno.ino ---
function calcularC(cfg, puntos) {
  const s = {
    setsA: 0, setsB: 0, setHistA: [], setHistB: [], nSets: 0,
    gamesA: 0, gamesB: 0, ptsA: 0, ptsB: 0,
    tiebreak: false, superTb: false, puntoOro: false, ganador: 0,
  };
  const PUNTO_ORO = cfg.goldenPoint ? 1 : 0;
  const CON_TIEBREAK = cfg.tiebreak ? 1 : 0;
  const SUPER_TB = cfg.superTb ? 1 : 0;
  const SETS_PARA_GANAR = cfg.setsToWin;

  function ganaJuego(a, fueTb) {
    if (s.superTb) {
      s.setHistA[s.nSets] = s.ptsA; s.setHistB[s.nSets] = s.ptsB; s.nSets++;
      if (a) s.setsA++; else s.setsB++;
      s.ptsA = s.ptsB = 0;
      s.tiebreak = s.superTb = false;
      s.ganador = a ? 'A' : 'B';
      return;
    }
    if (a) s.gamesA++; else s.gamesB++;
    s.ptsA = s.ptsB = 0;
    const gw = a ? s.gamesA : s.gamesB;
    const gl = a ? s.gamesB : s.gamesA;
    let setOver = false;
    if (fueTb) { setOver = true; s.tiebreak = false; }
    else if (gw >= 6 && gw - gl >= 2) setOver = true;
    else if (CON_TIEBREAK && gw === 6 && gl === 6) s.tiebreak = true;
    if (setOver) {
      s.setHistA[s.nSets] = s.gamesA; s.setHistB[s.nSets] = s.gamesB; s.nSets++;
      if (a) s.setsA++; else s.setsB++;
      s.gamesA = s.gamesB = 0;
      if ((a ? s.setsA : s.setsB) >= SETS_PARA_GANAR) s.ganador = a ? 'A' : 'B';
      else if (SUPER_TB && SETS_PARA_GANAR === 2 && s.setsA === 1 && s.setsB === 1) {
        s.tiebreak = s.superTb = true;
      }
    }
  }

  for (let i = 0; i < puntos.length && !s.ganador; i++) {
    const a = puntos[i] === 'A';
    const get = k => a ? s['pts' + k[0]] : s['pts' + k[1]];
    const set = (k, v) => { if (a) s['pts' + k[0]] = v; else s['pts' + k[1]] = v; };
    // pw = puntos del que gana el punto, pl = del otro
    const pw = () => a ? s.ptsA : s.ptsB;
    const pl = () => a ? s.ptsB : s.ptsA;
    const setPw = v => { if (a) s.ptsA = v; else s.ptsB = v; };
    const setPl = v => { if (a) s.ptsB = v; else s.ptsA = v; };

    if (s.tiebreak) {
      setPw(pw() + 1);
      const objetivo = s.superTb ? 11 : 7;
      if (pw() >= objetivo && pw() - pl() >= 2) ganaJuego(a, true);
      continue;
    }
    if (pw() === 3 && pl() === 3) {
      if (PUNTO_ORO) ganaJuego(a, false);
      else setPw(4);
    } else if (pw() === 4) ganaJuego(a, false);
    else if (pl() === 4) setPl(3);
    else if (pw() === 3) ganaJuego(a, false);
    else setPw(pw() + 1);
  }
  s.puntoOro = !s.ganador && !s.tiebreak && !!PUNTO_ORO && s.ptsA === 3 && s.ptsB === 3;
  return s;
}

// --- Fuzzing: comparar ambos motores en cada punto de partidos aleatorios ---
let rngState = 12345;
function rng() { // determinístico para reproducibilidad
  rngState = (rngState * 1103515245 + 12345) & 0x7FFFFFFF;
  return rngState / 0x7FFFFFFF;
}

let comparaciones = 0, fallos = 0;
const configs = [];
for (const goldenPoint of [true, false])
  for (const tiebreak of [true, false])
    for (const superTb of [true, false])
      for (const setsToWin of [1, 2])
        configs.push({ goldenPoint, tiebreak, superTb, setsToWin });

for (const cfg of configs) {
  for (let m = 0; m < 80; m++) {
    const pts = [];
    for (let p = 0; p < 600; p++) {
      pts.push(rng() < 0.5 ? 'A' : 'B');
      const js = computeScore(cfg, pts);
      const c = calcularC(cfg, pts);
      comparaciones++;
      const ok =
        c.setsA === js.setsWon.a && c.setsB === js.setsWon.b &&
        c.gamesA === js.games.a && c.gamesB === js.games.b &&
        c.ptsA === js.pts.a && c.ptsB === js.pts.b &&
        c.tiebreak === js.inTiebreak && c.superTb === js.inSuperTb &&
        c.puntoOro === js.isGoldenPoint &&
        (c.ganador || null) === (js.winner ? js.winner.toUpperCase() : null) &&
        c.nSets === js.sets.length &&
        js.sets.every((set, i) => c.setHistA[i] === set.a && c.setHistB[i] === set.b);
      if (!ok) {
        fallos++;
        if (fallos <= 3) {
          console.log('DIFERENCIA con cfg', JSON.stringify(cfg), 'tras', pts.length, 'puntos');
          console.log('  C :', JSON.stringify(c));
          console.log('  JS:', JSON.stringify({ setsWon: js.setsWon, games: js.games, pts: js.pts, tb: js.inTiebreak, stb: js.inSuperTb, win: js.winner, sets: js.sets }));
        }
      }
      if (js.winner) break;
    }
  }
}

console.log(`${comparaciones} estados comparados en ${configs.length} configuraciones`);
console.log(fallos ? `${fallos} DIFERENCIAS — el porteo NO es fiel` : 'Porteo fiel: los dos motores coinciden en todo ✔');
process.exit(fallos ? 1 : 0);
