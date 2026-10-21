'use strict';
// Descarga los elementos orbitales (TLE) de los satélites de config/satelites.json y los guarda en docs/data/satelites.json.
// La web calcula la posición en el navegador a partir de ellos. Se consulta cada pocas horas y con pausa entre consultas.
const fs = require('fs'), path = require('path');
const OUT = process.env.OUT_DIR || path.join(__dirname, '..', 'docs', 'data');
const CFG = process.env.SAT_CONFIG || path.join(__dirname, '..', 'config', 'satelites.json');
const BASE = process.env.CELESTRAK_URL || 'https://celestrak.org/NORAD/elements/gp.php';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function parse(txt, cat, re) {
  const L = txt.split(/\r?\n/).map((s) => s.trimEnd()).filter(Boolean), out = [];
  for (let i = 0; i + 2 < L.length; i += 3) {
    const [n, a, b] = [L[i].trim(), L[i + 1], L[i + 2]];
    if (!/^1 /.test(a) || !/^2 /.test(b) || (re && !re.test(n))) continue;
    const y = +a.slice(18, 20), d = +a.slice(20, 32), ep = new Date(Date.UTC(y < 57 ? 2000 + y : 1900 + y, 0, 1) + (d - 1) * 864e5);
    out.push({ id: a.slice(2, 7).trim(), name: n, categoria: cat, l1: a, l2: b, epoch: ep.toISOString() });
  }
  return out;
}
(async () => {
  const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8')), map = new Map(); let ok = 0;
  for (const q of cfg.consultas) {
    try {
      const r = await fetch(`${BASE}?${q.q}&FORMAT=tle`, { headers: { 'User-Agent': 'AEE-lanzamientos/0.6' }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) { console.error(q.q, 'HTTP', r.status); continue; }
      const items = parse(await r.text(), q.categoria, q.filtro ? new RegExp(q.filtro, 'i') : null);
      items.forEach((s) => { if (!map.has(s.id)) map.set(s.id, s); }); ok++; console.log(q.q, items.length);
    } catch (e) { console.error(q.q, e.message); }
    await sleep(+process.env.SAT_GAP_MS || 3000);
  }
  if (!ok || !map.size) { console.error('Sin resultados: no se sobrescribe'); process.exitCode = 1; return; }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'satelites.json'), JSON.stringify({ updatedAt: Date.now(), items: [...map.values()] }));
  console.log(map.size, 'satélites');
})();
