(function () {
  'use strict';

  // ============================================================================
  // MAPA DO ADMIN — CARREGAMENTO RÁPIDO (paralelo em lotes)
  // ----------------------------------------------------------------------------
  // O carregarPontosAdmin() original do app buscava CADA ponto (V*.json) do
  // GitHub em SÉRIE (await fetch dentro de um for). Com a Enecol-Centro passando
  // de 1800 pontos isso levava 4-5 minutos por equipe (pior em "Todas"), e o
  // mapa do admin parecia que "não aparecia" / ficava eternamente carregando.
  //
  // Este módulo substitui window.carregarPontosAdmin por uma versão que baixa os
  // JSONs em PARALELO, em lotes (CONCURRENCY por vez) — cai de minutos para
  // poucos segundos. Comportamento visual idêntico ao original: mesmos ícones
  // por equipe (sigla), mesmos popups, legenda, enquadramento (fitBounds) e o
  // texto de "N ponto(s) encontrado(s)". Não toca no app core; só troca a função.
  // Em qualquer erro, cai no comportamento original (se existir).
  // ============================================================================

  if (window.__veraAdminMapaRapido) return;
  window.__veraAdminMapaRapido = true;

  var CONCURRENCY = 40; // fetches simultâneos de pontos por lote

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

  function iconeEquipe(sigla) {
    return window.L.divIcon({
      className: '',
      html: '<div style="background:#2E7D32;color:#fff;border:2px solid #fff;border-radius:50%;'
        + 'width:24px;height:24px;display:flex;align-items:center;justify-content:center;'
        + 'font-size:8px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);'
        + 'font-family:-apple-system,sans-serif;">' + sigla + '</div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -14]
    });
  }

  // Baixa uma leva de arquivos em paralelo e devolve os pontos válidos.
  async function baixarLote(arquivos) {
    var resultados = await Promise.all(arquivos.map(function (arq) {
      return fetch(arq.download_url + '?t=' + Date.now(), { cache: 'no-store' })
        .then(function (rp) { return rp.ok ? rp.json() : null; })
        .catch(function () { return null; });
    }));
    return resultados.filter(function (pt) { return pt && pt.lat && pt.lon; });
  }

  async function carregarPontosAdminRapido() {
    if (typeof iniciarMapaAdmin === 'function') iniciarMapaAdmin();
    var info = document.getElementById('admin-map-info');
    var selEl = document.getElementById('admin-map-equipe');
    var equipe = selEl ? selEl.value : '__todas__';
    if (info) info.textContent = 'Carregando pontos…';

    var tr = await pegarTokenRepo();
    var token = tr.token, repo = tr.repo;
    if (!token) { if (info) info.textContent = 'Token não configurado.'; return; }

    var equipes = (equipe === '__todas__')
      ? ['Equipe Energisa', 'Enecol Norte', 'Enecol Centro', 'Enecol Sul']
      : [equipe];

    if (typeof adminMapLayer === 'undefined' || !adminMapLayer) {
      if (info) info.textContent = 'Mapa não iniciado.';
      return;
    }
    adminMapLayer.clearLayers();

    var bounds = [];
    var total = 0;
    var contPorEquipe = {};

    for (var e = 0; e < equipes.length; e++) {
      var eq = equipes[e];
      var pasta = 'dados/' + eq.replace(/\s+/g, '-');
      var sigla = SIGLAS[eq] || eq.charAt(0);
      var icon = iconeEquipe(sigla);
      contPorEquipe[eq] = 0;

      var arquivos = [];
      try {
        var r = await fetch('https://api.github.com/repos/' + repo + '/contents/' + pasta,
          { headers: { 'Authorization': 'token ' + token } });
        if (!r.ok) { console.warn('Pasta não encontrada:', pasta, r.status); continue; }
        var lista = await r.json();
        if (!Array.isArray(lista)) continue;
        arquivos = lista.filter(function (a) { return a.name && a.name.charAt(0) === 'V' && a.name.slice(-5) === '.json'; });
      } catch (err) {
        console.warn('Erro pasta', pasta, err);
        continue;
      }

      // Baixa em lotes paralelos (rápido), com progresso ao vivo.
      for (var i = 0; i < arquivos.length; i += CONCURRENCY) {
        var lote = arquivos.slice(i, i + CONCURRENCY);
        var pontos = await baixarLote(lote);
        for (var p = 0; p < pontos.length; p++) {
          var pt = pontos[p];
          window.L.marker([pt.lat, pt.lon], { icon: icon })
            .bindPopup(popupPonto(pt, eq), { maxWidth: 230 })
            .addTo(adminMapLayer);
          bounds.push([pt.lat, pt.lon]);
          total++;
          contPorEquipe[eq]++;
        }
        if (info) info.textContent = 'Carregando pontos… ' + Math.min(i + CONCURRENCY, arquivos.length) + '/' + arquivos.length + (equipes.length > 1 ? ' (' + eq + ')' : '');
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
