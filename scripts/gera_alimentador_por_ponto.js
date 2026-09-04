/*
 * Regenera exportacoes/alimentador-por-ponto.json.
 *
 * Rode depois de cadastrar rotas novas ou quando entrarem pontos de uma rota
 * que ainda nao estava no rotas.json:
 *
 *     node scripts/gera_alimentador_por_ponto.js exportacoes/alimentador-por-ponto.json
 *
 * O arquivo alimenta a exportacao do painel admin (admin-exportacao-rapida.js),
 * que usa a chave "<Equipe>|<id do ponto>" - os ids curtos antigos (V0001..)
 * se repetem entre equipes, entao a equipe faz parte da chave.
 */
// Gera exportacoes/alimentador-por-ponto.json: id do ponto -> "POLO|ALIMENTADOR"
// O alimentador vem da rota quando ela tem so um; senao, do cabo mais proximo.
const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');

const rotasRaw = JSON.parse(fs.readFileSync(path.join(RAIZ, 'rotas.json'), 'utf8'));
const rotasArr = Array.isArray(rotasRaw) ? rotasRaw : (rotasRaw.rotas || Object.values(rotasRaw));
const porRota = {};
for (const r of rotasArr) if (r && r.nomeProjeto) porRota[r.nomeProjeto] = { polo: r.polo || '', alims: r.alimentadores || [] };

const cache = {};
function vertices(polo, alim) {
  const k = polo + '/' + alim;
  if (cache[k] !== undefined) return cache[k];
  let v = null;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(RAIZ, 'cabos', polo, alim + '.json'), 'utf8'));
    v = [];
    for (const z of ['t1', 't2']) for (const it of (j[z] || [])) achata(it, v);
    if (!v.length) v = null;
  } catch (e) { v = null; }
  return (cache[k] = v);
}
function achata(x, out) {
  if (!Array.isArray(x)) return;
  if (typeof x[0] === 'number' && typeof x[1] === 'number') { out.push([x[0], x[1]]); return; }
  for (const y of x) achata(y, out);
}
const todos = [];
for (const polo of fs.readdirSync(path.join(RAIZ, 'cabos'))) {
  const d = path.join(RAIZ, 'cabos', polo);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d)) if (f.endsWith('.json')) todos.push([polo, f.slice(0, -5)]);
}
function d2(lat, lon, plat, plon) {
  const dx = (plon - lon) * Math.cos(lat * Math.PI / 180) * 111320, dy = (plat - lat) * 110540;
  return dx * dx + dy * dy;
}
function proximo(lat, lon, cands) {
  let m = null, md = Infinity;
  for (const [polo, alim] of cands) {
    const vs = vertices(polo, alim); if (!vs) continue;
    for (const [vlon, vlat] of vs) { const d = d2(lat, lon, vlat, vlon); if (d < md) { md = d; m = { polo, alim }; } }
  }
  return m ? { ...m, m: Math.sqrt(md) } : null;
}

const mapa = {};
const rotaFallback = {};
let semAlim = 0, distMax = 0, distSoma = 0, n = 0;
for (const eq of fs.readdirSync(path.join(RAIZ, 'dados'))) {
  const dir = path.join(RAIZ, 'dados', eq);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!/^V.*\.json$/.test(f)) continue;
    const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const meta = porRota[p.projeto];
    let polo = meta ? meta.polo : '', alim = '';
    if (meta && meta.alims.length === 1) alim = meta.alims[0];
    else if (p.lat != null && p.lon != null) {
      const r = proximo(p.lat, p.lon, meta && meta.alims.length ? meta.alims.map(a => [meta.polo, a]) : todos);
      if (r && (meta || r.m < 500)) { alim = r.alim; polo = polo || r.polo; distMax = Math.max(distMax, r.m); distSoma += r.m; n++; }
    }
    // Chave = equipe + id: os ids curtos antigos (V0001..) se repetem entre equipes.
    const chave = String(p.usuario || eq.replace(/-/g, ' ')) + '|' + p.id;
    if (alim) mapa[chave] = polo + '|' + alim; else semAlim++;
  }
}
// fallback por rota (para pontos novos, coletados depois deste arquivo)
for (const [nome, m] of Object.entries(porRota)) if (m.alims.length === 1) rotaFallback[nome] = m.polo + '|' + m.alims[0];

fs.writeFileSync(process.argv[2], JSON.stringify({ gerado: new Date().toISOString(), porPonto: mapa, porRota: rotaFallback }));
console.log('pontos mapeados:', Object.keys(mapa).length, '| sem alimentador:', semAlim);
console.log('rotas com fallback direto:', Object.keys(rotaFallback).length);
console.log('inferencia por proximidade: n=' + n, '| dist media=' + (n ? (distSoma / n).toFixed(1) : 0) + 'm', '| max=' + distMax.toFixed(1) + 'm');
