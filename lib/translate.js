'use strict';
// Traduce textos al castellano en el momento de generar los datos (GitHub Actions). Usa DeepL o la API de Anthropic, según la clave disponible.
// Cada texto se traduce una sola vez: el resultado se guarda en config/traducciones-<nombre>.json. Sin clave, los textos quedan como están.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const DEEPL = process.env.DEEPL_API_KEY || '', ANTH = process.env.ANTHROPIC_API_KEY || '';
const DIR = process.env.TR_DIR || path.join(__dirname, '..', 'config');
const sha = (t) => crypto.createHash('sha1').update(t).digest('hex').slice(0, 16);
const caches = {};
async function post(url, headers, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function deepl(batch) {
  const base = process.env.DEEPL_URL || (DEEPL.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com');
  const d = await post(base + '/v2/translate', { Authorization: 'DeepL-Auth-Key ' + DEEPL }, { text: batch, source_lang: 'EN', target_lang: 'ES' });
  return d.translations.map((x) => x.text);
}
async function claude(batch) {
  const d = await post(process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages', { 'x-api-key': ANTH, 'anthropic-version': '2023-06-01' },
    { model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: 8000, messages: [{ role: 'user', content:
      'Traduce al castellano de España cada uno de estos textos sobre astronáutica. Conserva sin traducir los nombres propios (cohetes, misiones, organizaciones), las cifras y las unidades. Responde SOLO con un array JSON de cadenas, del mismo tamaño y orden.\n\n' + JSON.stringify(batch) }] });
  const t = d.content.map((c) => c.text || '').join(''), a = JSON.parse(t.slice(t.indexOf('['), t.lastIndexOf(']') + 1));
  if (!Array.isArray(a) || a.length !== batch.length) throw new Error('respuesta inesperada');
  return a.map(String);
}
// Devuelve un array paralelo a `texts`: la traducción si existe; si no, el original.
async function tr(texts, name = 'info') {
  const file = path.join(DIR, `traducciones-${name}.json`);
  if (!caches[name]) { try { caches[name] = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { caches[name] = {}; } }
  const cache = caches[name], fn = DEEPL ? deepl : ANTH ? claude : null;
  const todo = [...new Set(texts.filter((t) => t && t.length > 2 && !(sha(t) in cache)))];
  if (!fn && todo.length) console.log('Sin DEEPL_API_KEY ni ANTHROPIC_API_KEY: hay', todo.length, 'textos sin traducir');
  for (let i = 0; fn && i < todo.length;) {
    let n = 0, len = 0;
    while (i + n < todo.length && n < 20 && len + todo[i + n].length < 8000) { len += todo[i + n].length; n++; }
    const b = todo.slice(i, i + Math.max(n, 1));
    try { (await fn(b)).forEach((es, j) => { cache[sha(b[j])] = es; }); } catch (e) { console.error('Traducción:', e.message); break; }
    i += b.length; fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file, JSON.stringify(cache));
  }
  return texts.map((t) => (t && cache[sha(t)]) || t);
}
module.exports = { tr };
