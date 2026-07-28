(function () {
  'use strict';

  // ============================================================================
  // MAPA DO ADMIN — CARREGAMENTO COMPLETO E RÁPIDO
  // ----------------------------------------------------------------------------
  // Dois problemas do carregarPontosAdmin() original:
  //  (1) LISTAGEM: usava a API de "contents", que LIMITA diretório a 1000
  //      arquivos. A Enecol-Centro passou de 1800 pontos → os ~800 mais
  //      recentes (ordenados por nome/timestamp = os de HOJE, Guaraí) ficavam
  //      FORA da listagem e o admin não os via.
  //  (2) VELOCIDADE: baixava cada ponto em SÉRIE (await dentro de for) → minutos.
  //
  // Correção:
  //  - LISTAGEM via Git Trees API (git/trees/<sha-da-pasta>) — devolve TODOS os
  //    arquivos, sem o teto de 1000.
  //  - DOWNLOAD dos JSONs em PARALELO, em lotes (CONCURRENCY por vez) — segundos.
  //  - Token é OPCIONAL (repositório é público): usa se houver, senão segue sem.
  //
  // Comportamento visual idêntico ao original (ícones por equipe, popups,
  // legenda, enquadramento). Não toca no app core. Em erro, loga e não quebra.
  // ============================================================================

  if (window.__veraAdminMapaRapido) return;
  window.__veraAdminMapaRapido = true;

  var CONCURRENCY = 40; // downloads simultâneos de pontos por lote

  var SIGLAS = {
    'Equipe Energisa': 'ENE',
    'Enecol Norte': 'N',
    'Enecol Centro': 'C',
    'Enecol Sul': 'S'
  };

  function repoBase() {
    return (typeof GH_REPO !== 'undefined' && GH_REPO) ? GH_REPO : 'LGRSV/vera-vegetacao';
  }

  async function pegarTokenRepo() {
    var cfg = null;
    if (typeof carregarConfigGlobal === 'function') {
      try { cfg = await carregarConfigGlobal(); } catch (e) { cfg = null; }
    }
    var token = (cfg && cfg.token) || null;
    if (!token && typeof getConfig === 'function') {
      try { token = await getConfig('github_token'); } catch (e) { token = null; }
    }
    var repo = (cfg && cfg.repo) || repoBase();
    return { token: token, repo: repo };
  }

  function rawBaseDe(repo) {
    return (typeof GITHUB_RAW !== 'undefined' && GITHUB_RAW)
      ? GITHUB_RAW
      : 'https://raw.githubusercontent.com/' + repo + '/main';
  }

  // Lista os SHAs das pastas dentro de dados/ (poucos itens → sem teto).
  async function pegarShasPastas(repo, headers) {
    try {
      var r = await fetch('https://api.github.com/repos/' + repo + '/contents/dados', { headers: headers });
      if (!r.ok) return {};
      var arr = await r.json();
      var map = {};
      if (Array.isArray(arr)) arr.forEach(function (x) { if (x.type === 'dir') map[x.name] = x.sha; });
      return map;
    } catch (e) { return {}; }
  }

  // Lista TODOS os V*.json de uma pasta via Git Trees API (sem teto de 1000).
  async function listarPontosDaPasta(repo, headers, sha) {
    try {
      var r = await fetch('https://api.github.com/repos/' + repo + '/git/trees/' + sha, { headers: headers });
      if (!r.ok) return [];
      var d = await r.json();
      var tree = (d && d.tree) || [];
      return tree.filter(function (t) {
        return t.path && t.path.charAt(0) === 'V' && t.path.slice(-5) === '.json';
      }).map(function (t) { return t.path; });
    } catch (e) { return []; }
  }

  function popupPonto(pt, eq) {
    var fotos = (pt.fotos_ids && pt.fotos_ids.length > 0)
      ? pt.fotos_ids.join(', ')
      : (pt.fotos_count > 0 ? pt.fotos_count + ' foto(s)' : 'Sem fotos');
    return '<div style="font-family:inherit;min-width:170px;">'
      + '<div style="font-weight:700;font-size:13px;color:#2E7D32;">' + (pt.especie || 'Sem espécie') + '</div>'
      + '<div style="font-size:10px;color:#666;margin:2px 0 5px;">' + eq + '</div>'
      + '<div style="font-size:11px;line-height:1.7;">'
      + '<b>Ponto:</b> ' + pt.id + '<br>'
      + '<b>Projeto:</b> ' + (pt.projeto || '-') + '<br>'
      + '<b>Poste:</b> ' + (pt.poste || '-') + '<br>'
      + '<b>Data:</b> ' + (pt.data || '-') + '<br>'
      + '<b>Altura:</b> ' + (pt.altura || '-') + ' m<br>'
      + '<b>Fotos:</b> ' + fotos
      + '</div></div>';
  }

  // Renderer de CANVAS compartilhado: desenha milhares de "pontinhos verdes"
  // (circleMarker) numa única tela, em vez de criar 1 elemento HTML (divIcon)
  // por ponto. Com +1800 pontos, os divIcon travavam/não apareciam no celular;
  // o canvas mostra tudo instantaneamente. É o mesmo tipo de marcador (leve,
  // vetorial) que o mapa do técnico usa.
  var _rendererCanvas = null;
  function rendererCanvas() {
    if (_rendererCanvas) return _rendererCanvas;
    if (window.L && typeof window.L.canvas === 'function') {
      _rendererCanvas = window.L.canvas({ padding: 0.5 });
    }
    return _rendererCanvas; // pode ser null → circleMarker usa o renderer padrão (SVG)
  }

  async function carregarPontosAdminRapido() {
    if (typeof iniciarMapaAdmin === 'function') iniciarMapaAdmin();
    var info = document.getElementById('admin-map-info');
    var selEl = document.getElementById('admin-map-equipe');
    var equipe = selEl ? selEl.value : '__todas__';
    if (info) info.textContent = 'Carregando pontos…';

    var tr = await pegarTokenRepo();
    var token = tr.token, repo = tr.repo;
    var headers = token ? { 'Authorization': 'token ' + token } : {};
    var rawBase = rawBaseDe(repo);

    var equipes = (equipe === '__todas__')
      ? ['Equipe Energisa', 'Enecol Norte', 'Enecol Centro', 'Enecol Sul']
      : [equipe];

    if (typeof adminMapLayer === 'undefined' || !adminMapLayer) {
      if (info) info.textContent = 'Mapa não iniciado.';
      return;
    }

    var shas = await pegarShasPastas(repo, headers);
    var rc = rendererCanvas();

    adminMapLayer.clearLayers();
    var bounds = [];
    var total = 0;
    var contPorEquipe = {};

    for (var e = 0; e < equipes.length; e++) {
      var eq = equipes[e];
      var folder = eq.replace(/\s+/g, '-');
      contPorEquipe[eq] = 0;

      var sha = shas[folder];
      if (!sha) { continue; } // pasta inexistente para esta equipe

      var nomes = await listarPontosDaPasta(repo, headers, sha);
      if (!nomes.length) continue;

      for (var i = 0; i < nomes.length; i += CONCURRENCY) {
        var lote = nomes.slice(i, i + CONCURRENCY);
        var pontos = await Promise.all(lote.map(function (nome) {
          return fetch(rawBase + '/dados/' + folder + '/' + nome + '?t=' + Date.now(), { cache: 'no-store' })
            .then(function (rp) { return rp.ok ? rp.json() : null; })
            .catch(function () { return null; });
        }));
        for (var p = 0; p < pontos.length; p++) {
          var pt = pontos[p];
          if (!pt || !pt.lat || !pt.lon) continue;
          var opts = { radius: 6, fillColor: '#2E7D32', color: '#ffffff', weight: 2, fillOpacity: 0.9 };
          if (rc) opts.renderer = rc;
          window.L.circleMarker([pt.lat, pt.lon], opts)
            .bindPopup(popupPonto(pt, eq), { maxWidth: 230 })
            .addTo(adminMapLayer);
          bounds.push([pt.lat, pt.lon]);
          total++;
          contPorEquipe[eq]++;
        }
        if (info) info.textContent = 'Carregando pontos… ' + Math.min(i + CONCURRENCY, nomes.length) + '/' + nomes.length + (equipes.length > 1 ? ' (' + eq + ')' : '');
      }
    }

    if (bounds.length > 0 && typeof adminMap !== 'undefined' && adminMap) {
      adminMap.fitBounds(window.L.latLngBounds(bounds), { padding: [30, 30] });
    }

    var legEl = document.getElementById('admin-map-legend');
    if (legEl) {
      var itens = Object.keys(contPorEquipe).filter(function (k) { return contPorEquipe[k] > 0; }).map(function (k) {
        return '<span style="display:flex;align-items:center;gap:4px;">'
          + '<span style="background:#2E7D32;color:#fff;border-radius:50%;width:16px;height:16px;'
          + 'display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:700;">'
          + (SIGLAS[k] || k.charAt(0)) + '</span>' + k + ' (' + contPorEquipe[k] + ')</span>';
      });
      legEl.innerHTML = itens.length ? itens.join('') : '<span>Nenhum ponto encontrado</span>';
    }

    if (info) {
      info.textContent = total > 0
        ? total + ' ponto(s) encontrado(s). Toque para ver detalhes.'
        : 'Nenhum ponto registrado ainda.';
    }

    setTimeout(function () { if (typeof adminMap !== 'undefined' && adminMap) adminMap.invalidateSize(); }, 200);
  }

  // Troca a função do app assim que ela existir (garante que o app já carregou).
  function instalar() {
    if (typeof window.carregarPontosAdmin === 'function' && !window.__veraAdminMapaRapidoOn) {
      window.__veraAdminMapaRapidoOn = true;
      window.carregarPontosAdmin = function () {
        return carregarPontosAdminRapido().catch(function (e) {
          console.warn('VERA admin-mapa-rapido:', e);
        });
      };
      return true;
    }
    return window.__veraAdminMapaRapidoOn === true;
  }

  var tentativa = setInterval(function () { if (instalar()) clearInterval(tentativa); }, 500);
  setTimeout(function () { clearInterval(tentativa); }, 60000);
})();
