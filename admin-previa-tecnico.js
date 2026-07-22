(function () {
  'use strict';

  // Prévia "como o técnico" no painel admin: cada card de rota ganha o botão
  // "👁 Ver como técnico", que desenha no mapa do admin exatamente o que o
  // aplicativo de campo mostra — os trechos do KML consolidado (azul) e os
  // postes que passam no cruzamento (a até 18 m de um cabo, por alimentador).
  // Serve para o supervisor conferir uma rota ANTES de liberá-la à equipe.

  if (window.__veraPreviaTecnico) return;
  window.__veraPreviaTecnico = true;

  const DIST_M = 18;
  const GRAU = 0.00025;

  function distPontoSegmentoM(lat, lon, s) {
    const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 111320;
    const x = lon * kx, y = lat * ky;
    const x1 = s[1] * kx, y1 = s[0] * ky, x2 = s[3] * kx, y2 = s[2] * ky;
    const dx = x2 - x1, dy = y2 - y1;
    if (!dx && !dy) return Math.hypot(x - x1, y - y1);
    let t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
  }

  function montarGrade(segs) {
    const grade = new Map();
    const alc = DIST_M / 100000;
    segs.forEach(function (s) {
      const la0 = Math.min(s[0], s[2]) - alc, la1 = Math.max(s[0], s[2]) + alc;
      const lo0 = Math.min(s[1], s[3]) - alc, lo1 = Math.max(s[1], s[3]) + alc;
      for (let r = Math.floor(la0 / GRAU); r <= Math.floor(la1 / GRAU); r++) {
        for (let c = Math.floor(lo0 / GRAU); c <= Math.floor(lo1 / GRAU); c++) {
          const k = r + ':' + c;
          if (!grade.has(k)) grade.set(k, []);
          grade.get(k).push(s);
        }
      }
    });
    return grade;
  }

  function posteNaRede(p, grade) {
    const lat = Number(p.lat), lon = Number(p.lon);
    if (!isFinite(lat) || !isFinite(lon)) return false;
    const alc = Math.max(1, Math.ceil((DIST_M / 111320) / GRAU));
    const li = Math.floor(lat / GRAU), co = Math.floor(lon / GRAU);
    for (let i = li - alc; i <= li + alc; i++) {
      for (let j = co - alc; j <= co + alc; j++) {
        const cand = grade.get(i + ':' + j);
        if (!cand) continue;
        for (let n = 0; n < cand.length; n++) {
          if (distPontoSegmentoM(lat, lon, cand[n]) <= DIST_M) return true;
        }
      }
    }
    return false;
  }

  window.veraPreviaTecnico = async function (id) {
    if (typeof carregarRotas !== 'function') return;
    await carregarRotas();
    const rota = (rotasData.rotas || []).find(function (r) { return String(r.id) === String(id); });
    if (!rota) return;

    if (typeof iniciarMapaAdmin === 'function') iniciarMapaAdmin();
    if (typeof adminMapLayer !== 'undefined' && adminMapLayer) adminMapLayer.clearLayers();
    const info = document.getElementById('admin-map-info');
    if (info) info.textContent = '👁 Prévia como o técnico: carregando ' + (rota.nomeProjeto || id) + '…';

    const base = (typeof GITHUB_RAW !== 'undefined' && GITHUB_RAW)
      ? GITHUB_RAW : 'https://raw.githubusercontent.com/LGRSV/vera-vegetacao/main';
    let totTrechos = 0, totPostes = 0;
    const bounds = [];

    for (const alim of (rota.alimentadores || [])) {
      try {
        const [cab, postes] = await Promise.all([
          fetch(base + '/cabos/' + rota.polo + '/' + alim + '.json?t=' + Date.now(), { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; }),
          fetch(base + '/dados/' + rota.polo + '/' + alim + '.json?t=' + Date.now(), { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
        ]);
        if (!cab) continue;

        const linhas = (cab.t1 || []).concat(cab.t2 || []);
        const segs = [];
        linhas.forEach(function (l) {
          if (!Array.isArray(l)) return;
          for (let i = 1; i < l.length; i++) segs.push([l[i - 1][1], l[i - 1][0], l[i][1], l[i][0]]);
          const pts = l.map(function (c) { return [c[1], c[0]]; });
          window.L.polyline(pts, { color: '#1565C0', weight: 2, opacity: 0.85, interactive: false }).addTo(adminMapLayer);
          pts.forEach(function (p) { bounds.push(p); });
        });
        totTrechos += segs.length;

        const grade = montarGrade(segs);
        (Array.isArray(postes) ? postes : []).forEach(function (p) {
          if (!posteNaRede(p, grade)) return;
          window.L.circleMarker([Number(p.lat), Number(p.lon)], {
            radius: 6, fillColor: '#1565C0', color: '#fff', weight: 2, fillOpacity: 0.9
          }).bindTooltip('Poste ' + p.id + ' · ' + alim).addTo(adminMapLayer);
          totPostes++;
        });
      } catch (e) { console.warn('VERA prévia técnico:', alim, e); }
    }

    if (bounds.length && typeof adminMap !== 'undefined' && adminMap) {
      adminMap.fitBounds(window.L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 16 });
    }
    if (info) {
      info.textContent = '👁 Prévia como o técnico — ' + (rota.nomeProjeto || 'rota') + ': '
        + totTrechos + ' trecho(s) + ' + totPostes + ' poste(s). É exatamente isto que a equipe vê em campo.';
    }
    setTimeout(function () { if (typeof adminMap !== 'undefined' && adminMap) adminMap.invalidateSize(); }, 200);
    const el = document.getElementById('admin-map');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  function adicionarBotoes() {
    const lista = document.getElementById('rotas-lista');
    if (!lista) return;
    const cards = lista.querySelectorAll('.rota-card');
    if (!cards.length) return;
    const rotas = (typeof rotasData !== 'undefined' && rotasData && Array.isArray(rotasData.rotas))
      ? rotasData.rotas.slice().reverse() : [];
    cards.forEach(function (card, i) {
      const rota = rotas[i];
      if (!rota || card.querySelector('.vera-btn-previa')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vera-btn-previa';
      btn.textContent = '👁 Ver como técnico';
      btn.style.cssText = 'background:#173b2b;border:1px solid #173b2b;color:#fff;cursor:pointer;'
        + 'border-radius:7px;padding:5px 10px;font-size:11px;font-weight:700;font-family:inherit;margin-left:6px;';
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation(); ev.preventDefault();
        window.veraPreviaTecnico(rota.id);
      });
      (card.querySelector('.rota-acoes') || card).appendChild(btn);
    });
  }

  function instalar() {
    if (typeof window.renderRotasAdmin === 'function' && !window.__veraRenderPreviaHook) {
      window.__veraRenderPreviaHook = true;
      const original = window.renderRotasAdmin;
      window.renderRotasAdmin = async function () {
        const r = await original.apply(this, arguments);
        try { adicionarBotoes(); } catch (e) {}
        return r;
      };
    }
    adicionarBotoes();
  }

  const tentativa = setInterval(instalar, 700);
  setTimeout(function () { clearInterval(tentativa); }, 60000);
})();
