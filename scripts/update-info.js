'use strict';
// Descarga TODAS las agencias y configuraciones de lanzador de Launch Library 2 (paginando) y las guarda en docs/data.
// Respeta el límite anónimo (15 peticiones/hora): espera entre peticiones y, ante un 429, espera el tiempo indicado.
const fs = require('fs'), path = require('path');
const { agencyEU, codes } = require('../lib/classify');
const { tr } = require('../lib/translate');
const MANUAL = process.env.MANUAL_FILE || path.join(__dirname, '..', 'config', 'manual.json');
const LL2 = process.env.LL2_BASE || 'https://ll.thespacedevs.com/2.2.0';
const KEY = process.env.LL2_API_KEY || '';
const OUT = process.env.OUT_DIR || path.join(__dirname, '..', 'docs', 'data');
const GAP = (process.env.INFO_GAP_SECONDS ? +process.env.INFO_GAP_SECONDS : KEY ? 1 : 480) * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (x) => (x == null || x === '' ? null : isFinite(+x) ? +x : null);

async function get(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': 'AEE-lanzamientos/0.4', Accept: 'application/json', ...(KEY ? { Authorization: 'Token ' + KEY } : {}) }, signal: AbortSignal.timeout(30000) });
    if (r.status === 429) {
      const m = /(\d+)\s*seconds/.exec(await r.text().catch(() => ''));
      const wait = Math.min((+r.headers.get('retry-after') || +(m && m[1]) || 900) + 30, 1800);
      console.log('429: espero', wait, 's'); await sleep(wait * 1000); continue;
    }
    if (!r.ok) throw new Error('HTTP ' + r.status + ' en ' + url);
    return r.json();
  }
  throw new Error('Límite de la API: demasiados 429 seguidos');
}
async function all(first) {
  const out = []; let url = first, n = 0;
  while (url) { if (n++) await sleep(GAP); const d = await get(url); out.push(...(d.results || [])); url = d.next && d.next.replace(/^http:\/\/(?!localhost)/, 'https://'); console.log(out.length, '/', d.count); }
  return out;
}
const agency = (a) => ({ id: a.id, name: a.name, abbrev: a.abbrev || '', type: (a.type && a.type.name) || a.type || 'Unknown', country: codes(a), founded: a.founding_year || null, administrator: (a.administrator || '').replace(/^Administrator:\s*/i, ''), description: a.description || '',
  launchers: a.launchers || '', spacecraft: a.spacecraft || '', total: num(a.total_launch_count), ok: num(a.successful_launches), fail: num(a.failed_launches), pending: num(a.pending_launches),
  logo: a.logo_url || '', info: a.info_url || '', wiki: a.wiki_url || '', eu: agencyEU(a) });
const config = (c) => ({ id: c.id, name: c.name, fullName: c.full_name || c.name, variant: c.variant || '', family: c.family || '', active: !!c.active, reusable: !!c.reusable, description: c.description || '',
  manufacturer: c.manufacturer ? { id: c.manufacturer.id, name: c.manufacturer.name, country: codes(c.manufacturer) } : null,
  length: num(c.length), diameter: num(c.diameter), stages: c.min_stage != null ? (c.min_stage === c.max_stage ? String(c.min_stage) : `${c.min_stage} a ${c.max_stage}`) : null,
  mass: num(c.launch_mass), thrust: num(c.to_thrust), leo: num(c.leo_capacity), gto: num(c.gto_capacity), maiden: c.maiden_flight || null,
  total: num(c.total_launch_count), ok: num(c.successful_launches), fail: num(c.failed_launches), pending: num(c.pending_launches),
  img: c.image_url || '', info: c.info_url || '', wiki: c.wiki_url || '', eu: agencyEU(c.manufacturer) });
function write(file, items) {
  if (items.length < 10) throw new Error(file + ': respuesta sospechosamente corta (' + items.length + '), no se sobrescribe');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, file), JSON.stringify({ updatedAt: Date.now(), source: 'Launch Library 2 (The Space Devs)', items }));
  console.log(file, items.length, 'elementos,', items.filter((x) => x.eu).length, 'europeos');
}
const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
async function translated(items) { const d = await tr(items.map((i) => i.description), 'info'); items.forEach((i, k) => { i.description = d[k]; }); return items; }
// Las entradas manuales se añaden si no existen (por nombre o alias) y, si existen, sustituyen su descripción y enlaces.
function mergeManual(items) {
  let man = []; try { man = JSON.parse(fs.readFileSync(MANUAL, 'utf8')).agencias || []; } catch {}
  for (const m of man) {
    const keys = [m.name, ...(m.alias || [])].map(norm), hit = items.find((i) => keys.includes(norm(i.name)));
    const e = { description: m.description || '', info: m.info || '', wiki: m.wiki || '', founded: m.founded || null, operator: !!m.operator };
    if (hit) { for (const k of ['description', 'info', 'wiki', 'founded']) if (e[k]) hit[k] = e[k]; if (e.operator) hit.operator = true; hit.manual = true; continue; }
    const c = { id: 'm-' + norm(m.name), name: m.name, abbrev: m.abbrev || '', type: m.type || 'Unknown', country: m.country || [], administrator: '', launchers: m.launchers || '', spacecraft: m.spacecraft || '',
      total: null, ok: null, fail: null, pending: null, logo: '', manual: true, ...e };
    c.eu = c.country.some((x) => /^(AUT|BEL|BGR|HRV|CYP|CZE|DNK|EST|FIN|FRA|DEU|GRC|HUN|IRL|ITA|LVA|LTU|LUX|MLT|NLD|NOR|POL|PRT|ROU|SVK|SVN|ESP|SWE|CHE|GBR|ISL|EUR|EU)$/.test(x));
    items.push(c);
  }
  return items;
}
(async () => {
  try {
    write('agencias.json', mergeManual(await translated((await all(`${LL2}/agencies/?mode=detailed&limit=100&ordering=name`)).map(agency))));
    await sleep(GAP);
    write('cohetes.json', await translated((await all(`${LL2}/config/launcher/?limit=100&ordering=name`)).map(config)));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
})();
