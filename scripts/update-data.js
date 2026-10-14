'use strict';
// Lo ejecuta GitHub Actions. Consulta LL2 (1 petición) y Spaceflight News API (1 petición) y escribe docs/data/*.json.
// Si una API falla (p. ej. 429), NO se toca el archivo anterior: la web sigue mostrando los últimos datos buenos.
const fs = require('fs'), path = require('path');
const { normalize, NEWS_RE, NEWS_EU_RE } = require('../lib/classify');
const LL2 = process.env.LL2_BASE || 'https://ll.thespacedevs.com/2.2.0';
const SNAPI = process.env.SNAPI_BASE || 'https://api.spaceflightnewsapi.net/v4';
const KEY = process.env.LL2_API_KEY || '';
const OUT = process.env.OUT_DIR || path.join(__dirname, '..', 'docs', 'data');
const OVR = path.join(__dirname, '..', 'config', 'overrides.json');
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

async function getJson(url, headers = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': 'AEE-lanzamientos/0.3', Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error('HTTP ' + r.status + (r.status === 429 ? ' (límite de la API)' : ''));
  return r.json();
}
// Escribe solo si hay cambios, o como "latido" si el archivo tiene más de 55 min (evita commits inútiles).
function write(file, obj, itemsKey) {
  const f = path.join(OUT, file), prev = read(f, {});
  const same = JSON.stringify(prev[itemsKey]) === JSON.stringify(obj[itemsKey]);
  if (same && prev.updatedAt && Date.now() - prev.updatedAt < 55 * 60e3) return console.log(file, 'sin cambios');
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(f, JSON.stringify(obj, null, 1)); console.log(file, 'actualizado');
}

(async () => {
  try {
    const d = await getJson(`${LL2}/launches/upcoming/?limit=100&mode=detailed&hide_recent_previous=true`, KEY ? { Authorization: 'Token ' + KEY } : {});
    const ov = read(OVR, {});
    const all = (d.results || []).map((l) => normalize(l, ov));
    write('launches.json', { updatedAt: Date.now(), launches: all.filter((l) => l.vehEU || l.payEU) }, 'launches');
  } catch (e) { console.error('[LL2]', e.message); }
  try {
    const d = await getJson(`${SNAPI}/articles/?limit=50&ordering=-published_at`);
    const all = (d.results || []).map((a) => ({ id: a.id, title: a.title, url: a.url, image: a.image_url, site: a.news_site, summary: a.summary, publishedAt: a.published_at, eu: NEWS_EU_RE.test(a.title + ' ' + a.summary) }));
    const f = all.filter((a) => NEWS_RE.test(a.title + ' ' + a.summary));
    write('news.json', { updatedAt: Date.now(), news: (f.length >= 3 ? f : all).slice(0, 12) }, 'news');
  } catch (e) { console.error('[SNAPI]', e.message); }
})();
