'use strict';
// ---------- Criterio "europeo" (editable) ----------
// ESA (miembros y asociados) + Estados miembros de la UE + Reino Unido, Suiza, Noruega, Islandia. 'EUR'/'EU' = códigos multinacionales.
const EU_COUNTRIES = new Set('AUT BEL BGR HRV CYP CZE DNK EST FIN FRA DEU GRC HUN IRL ITA LVA LTU LUX MLT NLD NOR POL PRT ROU SVK SVN ESP SWE CHE GBR ISL EUR EU'.split(' '));
const EU_AGENCY_RE = /european space agency|\besa\b|arianespace|eumetsat|\bcnes\b|\bdlr\b|\binta\b/i;
const EU_VEHICLE_RE = /ariane|vega|spectrum|rfa one|miura|themis/i;
const EU_PAYLOAD_RE = /\b(esa|copernicus|sentinel|galileo|eumetsat|meteosat|cnes|dlr|inta|hispasat|spainsat|proba)\b/i;
const NEWS_RE = /launch|rocket|ariane|vega|spectrum|isar|rfa|orbex|pld|miura|themis|arianespace|avio|starship|falcon|new glenn|vulcan|booster/i;
const NEWS_EU_RE = /europe|esa\b|ariane|vega|arianespace|isar|rfa|orbex|pld|miura|avio|kourou|andøya|sutherland/i;

const codes = (ag) => {                                   // tolera 2.2.0 (country_code) y 2.3.0 (country[])
  const v = ag && (ag.country_code ?? ag.country); if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => x.alpha_3_code || x.country_code || x).filter(Boolean);
  if (typeof v === 'object') return [v.alpha_3_code || v.country_code].filter(Boolean);
  return String(v).split(/[,\s]+/).filter(Boolean);
};
const agencyEU = (ag) => !!ag && (codes(ag).some((c) => EU_COUNTRIES.has(String(c).toUpperCase())) || EU_AGENCY_RE.test(`${ag.name || ''} ${ag.abbrev || ''}`));

function classify(l, overrides) {
  const why = [];
  const p = l.launch_service_provider, cfgR = l.rocket && l.rocket.configuration, m = l.mission || {};
  let vehEU = false, payEU = false;
  if (agencyEU(p)) { vehEU = true; why.push(`lanzador: operador ${p.name}`); }
  else if (cfgR && EU_VEHICLE_RE.test(`${cfgR.name} ${cfgR.family || ''}`)) { vehEU = true; why.push(`lanzador: cohete ${cfgR.name}`); }
  const ag = (m.agencies || []).filter(agencyEU);
  if (ag.length) { payEU = true; why.push(`carga: ${ag.map((a) => a.name).join(', ')}`); }
  const pl = (l.payloads || m.payloads || []).filter((x) => agencyEU(x.operator) || agencyEU(x.manufacturer));
  if (pl.length) { payEU = true; why.push(`carga: payload ${pl.map((x) => x.name).join(', ')}`); }
  if (!payEU && EU_PAYLOAD_RE.test(`${l.name} ${m.name || ''} ${m.description || ''}`)) { payEU = true; why.push('carga: coincidencia de texto (heurística)'); }
  const o = overrides[l.id];
  if (o) { if ('vehEU' in o) vehEU = !!o.vehEU; if ('payEU' in o) payEU = !!o.payEU; why.push('corregido manualmente (overrides.json)'); }
  return { vehEU, payEU, euReason: why };
}

const urls = (a) => (Array.isArray(a) ? a : []).map((x) => (typeof x === 'string' ? { url: x } : { url: x.url, title: x.title || x.source || '' })).filter((x) => /^https:\/\//.test(x.url || '')).slice(0, 4);

const num = (x) => (Number.isFinite(parseFloat(x)) ? parseFloat(x) : null);

function normalize(l, overrides) {
  const rc = (l.rocket && l.rocket.configuration) || {}, m = l.mission || {}, pad = l.pad || {}, p = l.launch_service_provider || {};
  return {
    id: l.id, name: l.name, date: l.net || l.window_start, status: (l.status && (l.status.abbrev || l.status.name)) || '',
    vehicle: rc.full_name || rc.name || '', provider: p.name || '', providerCountry: codes(p).join(','),
    payload: m.name || '', missionType: m.type || '', orbit: (m.orbit && m.orbit.name) || '', description: m.description || '',
    pad: pad.name || '', location: (pad.location && pad.location.name) || '', webcastLive: !!l.webcast_live,
    lat: num(pad.latitude), lon: num(pad.longitude),
    webcasts: urls(l.vidURLs || l.vid_urls), links: urls(l.infoURLs || l.info_urls),
    image: typeof l.image === 'string' ? l.image : (l.image && l.image.image_url) || '',
    ...classify(l, overrides),
  };
}

module.exports = { classify, normalize, NEWS_RE, NEWS_EU_RE, EU_COUNTRIES, agencyEU, codes };
