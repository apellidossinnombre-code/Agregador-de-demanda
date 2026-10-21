'use strict';
// Resumen de 2-3 frases por lanzamiento, escrito automáticamente a partir de los datos del lanzamiento y de Wikipedia.
// Con ANTHROPIC_API_KEY lo redacta Claude usando SOLO esos datos; sin clave, se compone con una plantilla (sin inventar nada).
// config/resumenes-manual.json (id o nombre del lanzamiento → texto) tiene prioridad sobre el automático.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { tr } = require('./translate');
const CACHE = process.env.RESUMEN_CACHE || path.join(__dirname, '..', 'config', 'resumenes-cache.json');
const MANUAL = process.env.RESUMEN_MANUAL || path.join(__dirname, '..', 'config', 'resumenes-manual.json');
const WIKI = process.env.WIKI_BASE || 'https://{lang}.wikipedia.org';
const MAX = +process.env.RESUMEN_MAX || 6; // resúmenes nuevos por ejecución
const ANTH = process.env.ANTHROPIC_API_KEY || '';
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const J = async (u, o = {}) => {
  const r = await fetch(u, { ...o, headers: { 'User-Agent': 'AEE-lanzamientos/0.5', Accept: 'application/json', ...(o.headers || {}) }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
};
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const first = (t, n) => ((t || '').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+(\s|$)/g) || [t || '']).slice(0, n).join('').trim();
// Busca el artículo en Wikipedia (es, luego en) y comprueba que el título tenga que ver con la búsqueda.
async function wiki(q) {
  if (!q || norm(q).length < 3) return null;
  const k = norm(q).split(' ')[0];
  for (const lang of ['es', 'en']) {
    try {
      const base = WIKI.replace('{lang}', lang);
      const s = await J(`${base}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json`);
      const t = s.query && s.query.search && s.query.search[0] && s.query.search[0].title;
      if (!t || (!norm(t).includes(k) && !norm(q).includes(norm(t)))) continue;
      const p = await J(`${base}/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, '_'))}`);
      if (p.extract && p.type !== 'disambiguation') return { title: p.title, extract: p.extract, lang, url: (p.content_urls && p.content_urls.desktop && p.content_urls.desktop.page) || '' };
    } catch (e) { console.log('[resumen] Wikipedia', lang, q, e.message); }
  }
  return null;
}
const PROMPT = 'Eres redactor de la web de lanzamientos espaciales de la Agencia Espacial Española. Con SOLO los datos de abajo, escribe un resumen de 2 o 3 frases (máximo 500 caracteres) en castellano de España, con tono cercano y claro para el público general: qué cohete es, qué lleva o qué hace la misión y, si los datos lo indican, su relación con España o Europa. No inventes datos, cifras, fechas ni nombres que no estén en los datos; si algo no consta, no lo menciones. Sin comillas, viñetas ni emojis. Responde solo con el texto.\n\nDATOS:\n';
async function plantilla(l, wl, wm) {
  const a = [`${l.vehicle}${l.provider ? ', de ' + l.provider + ',' : ''} ${l.payload ? 'lleva ' + l.payload : 'despega'}${l.orbit ? ' a ' + l.orbit : ''}${l.location ? ' desde ' + l.location : ''}.`];
  const extra = [first(l.description, 1), wm && first(wm.extract, 1), wl && first(wl.extract, 1)].filter(Boolean);
  const t = await tr(extra.slice(0, 2), 'resumenes');
  const corta = (s, n) => {
  if (s.length <= n) return s;
  const c = s.slice(0, n), m = c.match(/^[\s\S]*[.!?](?=\s|$)/);
  return m && m[0].length > 80 ? m[0] : c.replace(/\s+\S*$/, '') + '…';
};
// en plantilla:
return corta(a.concat(t).join(' '), 460);
}
async function redactar(l, wl, wm) {
  if (ANTH) {
    try {
      const facts = { nombre: l.name, lanzador: l.vehicle, proveedor: l.provider, carga: l.payload, tipoMision: l.missionType, orbita: l.orbit, base: l.location || l.pad, descripcion: l.description, relacionEuropea: l.euReason, wikipediaLanzador: wl && wl.extract, wikipediaMision: wm && wm.extract };
      const d = await J(process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': ANTH, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: 400, messages: [{ role: 'user', content: PROMPT + JSON.stringify(facts) }] }) });
      const t = d.content.map((c) => c.text || '').join('').trim();
      if (t && t.length < 700) return t;
    } catch (e) { console.log('[resumen] Claude:', e.message); }
  }
  return plantilla(l, wl, wm);
}
async function attachResumen(list) {
  const cache = rd(CACHE, {}), man = rd(MANUAL, {}); let n = 0, dirty = false;
  for (const l of list) {
    const m = man[l.id] || man[l.name];
    if (m) { l.resumen = m; l.resumenAuto = false; continue; }
    const key = crypto.createHash('sha1').update([l.vehicle, l.payload, l.provider, l.orbit, l.location, l.description].join('|')).digest('hex').slice(0, 12);
    let c = cache[l.id];
    if (!(c && c.key === key) && n < MAX) {
      n++;
      try {
        const wl = await wiki(l.vehicle), wm = await wiki(l.payload);
        const text = await redactar(l, wl, wm);
        if (text) { c = cache[l.id] = { key, text, fuentes: ['https://thespacedevs.com/llapi', wl && wl.url, wm && wm.url].filter(Boolean), at: Date.now() }; dirty = true; }
      } catch (e) { console.log('[resumen]', l.id, e.message); }
    }
    if (c && c.text) { l.resumen = c.text; l.resumenAuto = true; l.resumenFuentes = c.fuentes; }
  }
  const ids = new Set(list.map((l) => l.id));
  for (const k of Object.keys(cache)) if (!ids.has(k) && Object.keys(cache).length > 300) { delete cache[k]; dirty = true; }
  if (dirty) fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
  console.log('resúmenes:', list.filter((l) => l.resumen).length + '/' + list.length, '(nuevos', n + ')');
}
module.exports = { attachResumen };
