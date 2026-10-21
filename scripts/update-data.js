'use strict';
// Lo ejecuta GitHub Actions. Consulta LL2 (1 petición) y Spaceflight News API (1 petición) y escribe docs/data/*.json.
// Si una API falla (p. ej. 429), NO se toca el archivo anterior: la web sigue mostrando los últimos datos buenos.
const fs = require('fs'), path = require('path');
const { normalize, NEWS_RE, NEWS_EU_RE } = require('../lib/classify');
const { tr } = require('../lib/translate');
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

// ---- Avisos: feed RSS con los lanzamientos europeos que entran en la ventana de ALERT_DAYS días ----
const DAYS = +process.env.ALERT_DAYS || 15;
const [OWNER, REPO] = (process.env.GITHUB_REPOSITORY || '').split('/');
const SITE = process.env.SITE_URL || (OWNER ? `https://${OWNER.toLowerCase()}.github.io/${REPO}/` : '');
const X = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
function alerts(eu) {
  const sf = path.join(OUT, 'avisos-estado.json'), ff = path.join(OUT, 'avisos.xml');
  const st = read(sf, { items: [] }), seen = new Set(st.items.map((i) => i.id)), now = Date.now();
  let added = 0;
  for (const l of eu.slice().sort((a, b) => Date.parse(b.date) - Date.parse(a.date))) {
    const t = Date.parse(l.date);
    if (!t || t < now || t - now > DAYS * 864e5 || l.status === 'TBD' || seen.has(l.id)) continue;
    const when = new Date(t).toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
    const link = SITE ? `${SITE}#/lanzamiento/${encodeURIComponent(l.id)}` : '';
    st.items.unshift({ id: l.id, pubDate: new Date(now).toUTCString(), link, title: `Lanzamiento europeo en menos de ${DAYS} días: ${l.name}`,
      html: `<p><b>${X(l.name)}</b></p><p>Fecha: ${X(when)}<br>Lanzador: ${X(l.vehicle)}<br>Carga: ${X(l.payload)}<br>Base: ${X(l.location || l.pad)}</p>${link ? `<p><a href="${X(link)}">Ver detalles</a></p>` : ''}` });
    added++;
  }
  if (!added && fs.existsSync(ff)) return console.log('avisos sin cambios');
  st.items = st.items.slice(0, 30);
  const items = st.items.map((i) => `<item><title>${X(i.title)}</title>${i.link ? `<link>${X(i.link)}</link>` : ''}<guid isPermaLink="false">${X(i.id)}</guid><pubDate>${i.pubDate}</pubDate><description><![CDATA[${i.html}]]></description></item>`).join('\n');
  const feed = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Avisos de lanzamientos europeos</title><link>${X(SITE || 'https://example.com/')}</link><description>Lanzamientos europeos a menos de ${DAYS} días</description><language>es</language>\n${items}\n</channel></rss>\n`;
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(sf, JSON.stringify(st, null, 1)); fs.writeFileSync(ff, feed);
  console.log('avisos:', added, 'nuevos');
}

(async () => {
  try {
    const d = await getJson(`${LL2}/${/\/2\.[3-9]/.test(LL2) ? 'launches' : 'launch'}/upcoming/?limit=100&mode=detailed&hide_recent_previous=true`, KEY ? { Authorization: 'Token ' + KEY } : {});
    const ov = read(OVR, {});
    const all = (d.results || []).map((l) => normalize(l, ov));
    const eu = all.filter((l) => l.vehEU || l.payEU);
    (await tr(eu.map((l) => l.description), 'lanzamientos')).forEach((t, i) => { eu[i].description = t; });
    const tl = [...new Set(eu.flatMap((l) => l.timeline.map((t) => t.d)))], tlt = await tr(tl, 'lanzamientos'), tm = new Map(tl.map((x, i) => [x, tlt[i]]));
    eu.forEach((l) => l.timeline.forEach((t) => { t.d = tm.get(t.d) || t.d; }));
    try { await require('../lib/resumen').attachResumen(eu); } catch (e) { console.error('[resumen]', e.message); }
    write('launches.json', { updatedAt: Date.now(), launches: eu }, 'launches');
    alerts(eu);
  } catch (e) {
    console.error('[LL2]', e.message);
    // Si nunca ha habido datos válidos, la ejecución sale en rojo para que el fallo sea visible.
    if (!read(path.join(OUT, 'launches.json'), {}).updatedAt) process.exitCode = 1;
  }
  try {
    const d = await getJson(`${SNAPI}/articles/?limit=50&ordering=-published_at`);
    const all = (d.results || []).map((a) => ({ id: a.id, title: a.title, url: a.url, image: a.image_url, site: a.news_site, summary: a.summary, publishedAt: a.published_at, eu: NEWS_EU_RE.test(a.title + ' ' + a.summary) }));
    const f = all.filter((a) => NEWS_RE.test(a.title + ' ' + a.summary));
    const ns = (f.length >= 3 ? f : all).slice(0, 30);
    const [tt, ts] = [await tr(ns.map((n) => n.title), 'noticias'), await tr(ns.map((n) => n.summary), 'noticias')];
    ns.forEach((n, i) => { n.title = tt[i]; n.summary = ts[i]; });
    write('news.json', { updatedAt: Date.now(), news: ns }, 'news');
  } catch (e) { console.error('[SNAPI]', e.message); }
})();
