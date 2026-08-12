(function () {
  'use strict';

  // ==========================================================================
  // MAPA DO ADMIN — SINCRONIZACAO AO VIVO
  // --------------------------------------------------------------------------
  // Mostra TUDO: os pontos ja concluidos e os que a equipe esta enviando agora.
  //
  // Fonte: exportacoes/<equipe>.csv, que o proprio app REGERA a cada ponto
  // enviado ("VERA: exportacoes CSV atualizadas"). Uma unica requisicao por
  // equipe traz todos os pontos com coordenada, rota, especie, data, poste e
  // quantidade de fotos.
  //
  // Por que assim (e nao pela API do GitHub):
  //  - raw.githubusercontent NAO consome cota de API. A API sem token permite
  //    so 60 chamadas/hora por IP — sincronizar de minuto em minuto estouraria
  //    a cota e o mapa ficaria vazio no meio do expediente.
  //  - Um CSV por equipe substitui milhares de downloads de JSON individuais.
  //  - Sem o teto de 1000 arquivos da API de "contents", que era o que escondia
  //    justamente os pontos mais recentes.
  //
  // Cache em localStorage: ao abrir, desenha na hora o que ja tinha e so entao
  // busca as novidades — nunca fica em branco, nem sem internet.
  // Atualiza sozinho a cada 90s enquanto o painel estiver aberto.
  // ==========================================================================

  if (window.__veraAdminMapaSync) return;
  window.__veraAdminMapaSync = true;

  var RAW = 'https://raw.githubusercontent.com/LGRSV/vera-vegetacao/main/';
  var INTERVALO = 90000;
  var CACHE_KEY = 'vera_admin_pontos_v2';

  // Equipes do seletor + a que so existe nos dados historicos.
  var EQUIPES = ['Equipe Energisa', 'Enecol Norte', 'Enecol Centro', 'Enecol Sul'];
  var EXTRAS = ['Equipe 01 — Norte'];

  var CORES = {
    'Rota Guaraí': '#16a34a', 'Rota SE Colinas': '#16a34a', 'Rota Colméia': '#16a34a',
    'SE Paraíso I': '#f59e0b', 'Rota Paraíso SE 2': '#f59e0b',
    'Porto Nacional': '#3b82f6'
  };
  var COR_PADRAO = '#16a34a';

  var cache = {};        // { equipe: { id: [lat,lon,rota,especie,data,poste,nfotos] } }
  var camadas = {};      // id -> marcador desenhado
  var sincronizando = false;
  var timer = null;

  function slug(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function pastaFotos(eq) { return String(eq || '').replace(/\s+/g, '-'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function info(t) { var el = document.getElementById('admin-map-info'); if (el) el.textContent = t; }
  function agora() {
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function carregarCache() {
    try { var s = localStorage.getItem(CACHE_KEY); if (s) cache = JSON.parse(s) || {}; }
    catch (e) { cache = {}; }
  }
  function salvarCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
  }

  // Parser de CSV que respeita aspas (o campo Data/hora tem virgula dentro).
  function parseCSV(texto) {
    var linhas = [], campo = '', linha = [], dentro = false;
    if (texto.charCodeAt(0) === 0xFEFF) texto = texto.slice(1);
    for (var i = 0; i < texto.length; i++) {
      var c = texto[i];
      if (dentro) {
        if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else dentro = false; }
        else campo += c;
      } else if (c === '"') dentro = true;
      else if (c === ',') { linha.push(campo); campo = ''; }
      else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
      else if (c !== '\r') campo += c;
    }
    if (campo.length || linha.length) { linha.push(campo); linhas.push(linha); }
    if (!linhas.length) return [];
    var cab = linhas[0], out = [];
    for (var j = 1; j < linhas.length; j++) {
      if (linhas[j].length < 2) continue;
      var o = {};
      for (var k = 0; k < cab.length; k++) o[cab[k]] = linhas[j][k];
      out.push(o);
    }
    return out;
  }

  // Uma requisicao por equipe. null = falhou (mantem o cache).
  async function baixarEquipe(eq) {
    try {
      var r = await fetch(RAW + 'exportacoes/' + slug(eq) + '.csv?t=' + Date.now(), { cache: 'no-store' });
      if (r.status === 404) return {};        // equipe sem pontos ainda
      if (!r.ok) return null;
      var linhas = parseCSV(await r.text());
      var mapa = {};
      for (var i = 0; i < linhas.length; i++) {
        var L = linhas[i];
        var lat = parseFloat(L['Latitude']), lon = parseFloat(L['Longitude']);
        if (!isFinite(lat) || !isFinite(lon)) continue;
        mapa[L['Ponto']] = [lat, lon, L['Projeto'] || '', L['Espécie'] || '',
                            L['Data/hora'] || '', L['Poste'] || '', parseInt(L['Qtd fotos'], 10) || 0];
      }
      return mapa;
    } catch (e) { return null; }
  }

  function popup(eq, id, d) {
    var h = '<div style="font-family:inherit;min-width:170px;max-width:240px;font-size:12px;line-height:1.6">'
      + '<b style="color:#2E7D32">' + esc(d[3] || 'Sem espécie') + '</b><br>'
      + 'Rota: ' + esc(d[2] || '-') + '<br>Ponto: ' + esc(id)
      + '<br>Data: ' + esc(d[4] || '-') + '<br>Poste: ' + esc(d[5] || '-');
    var nf = d[6] || 0;
    if (nf > 0) {
      var base = RAW + 'fotos/' + pastaFotos(eq) + '/VER' + String(id).slice(1) + 'F';
      h += '<div style="font-size:11px;font-weight:700;margin:6px 0 3px">Fotos (' + nf + ')</div>'
        + '<div style="display:flex;gap:4px;flex-wrap:wrap">';
      for (var n = 1; n <= nf; n++) {
        var u = base + n + '.jpg';
        h += '<a href="' + u + '" target="_blank" rel="noopener" style="flex:0 0 auto;line-height:0">'
          + '<img src="' + u + '" style="width:66px;height:66px;object-fit:cover;border-radius:5px;background:#eee"'
          + ' onerror="this.parentNode.style.display=\'none\'"></a>';
      }
      h += '</div>';
    }
    return h + '</div>';
  }

  function desenhar(eq, id, d) {
    // Chave = equipe + id: os IDs curtos antigos (V0001..V0006) se repetem em
    // equipes diferentes apontando para pontos DIFERENTES. Chavear so pelo id
    // faria o mapa esconder os pontos das outras equipes.
    var chave = eq + '|' + id;
    if (camadas[chave] || !window.L) return false;
    if (typeof adminMapLayer === 'undefined' || !adminMapLayer) return false;
    var m = window.L.circleMarker([d[0], d[1]], {
      radius: 5, fillColor: CORES[d[2]] || COR_PADRAO, color: '#ffffff', weight: 1, fillOpacity: 0.9
    }).bindPopup(popup(eq, id, d), { maxWidth: 250 });
    m.addTo(adminMapLayer);
    camadas[chave] = m;
    return true;
  }

  function equipesSelecionadas() {
    var sel = document.getElementById('admin-map-equipe');
    var v = sel ? sel.value : '__todas__';
    return v === '__todas__' ? EQUIPES.concat(EXTRAS) : [v];
  }

  function legenda() {
    var el = document.getElementById('admin-map-legend');
    if (!el) return;
    var cont = {};
    equipesSelecionadas().forEach(function (eq) {
      var pts = cache[eq] || {};
      Object.keys(pts).forEach(function (id) {
        var p = pts[id][2] || '(sem rota)'; cont[p] = (cont[p] || 0) + 1;
      });
    });
    var itens = Object.keys(cont).sort(function (a, b) { return cont[b] - cont[a]; }).map(function (k) {
      return '<span style="display:flex;align-items:center;gap:4px;">'
        + '<span style="width:12px;height:12px;border-radius:50%;background:' + (CORES[k] || COR_PADRAO) + ';border:1px solid #fff"></span>'
        + esc(k) + ' (' + cont[k] + ')</span>';
    });
    el.innerHTML = itens.length ? itens.join('') : '<span>Nenhum ponto carregado</span>';
  }

  function totalCache() {
    var n = 0;
    equipesSelecionadas().forEach(function (eq) { n += Object.keys(cache[eq] || {}).length; });
    return n;
  }

  function redesenharTudo() {
    if (typeof adminMapLayer === 'undefined' || !adminMapLayer) return 0;
    adminMapLayer.clearLayers();
    camadas = {};
    try { if (window._adminRedeLayer && window._adminRedeLayer.clearLayers) window._adminRedeLayer.clearLayers(); } catch (e) {}
    var n = 0, bounds = [];
    equipesSelecionadas().forEach(function (eq) {
      var pts = cache[eq] || {};
      Object.keys(pts).forEach(function (id) {
        if (desenhar(eq, id, pts[id])) { n++; bounds.push([pts[id][0], pts[id][1]]); }
      });
    });
    if (bounds.length && typeof adminMap !== 'undefined' && adminMap) {
      adminMap.fitBounds(window.L.latLngBounds(bounds), { padding: [30, 30] });
    }
    legenda();
    return n;
  }

  async function sincronizar(silencioso) {
    if (sincronizando) return;
    sincronizando = true;
    try {
      if (typeof iniciarMapaAdmin === 'function') iniciarMapaAdmin();
      if (typeof adminMapLayer === 'undefined' || !adminMapLayer) { sincronizando = false; return; }
      var eqs = equipesSelecionadas();
      if (!silencioso) info('Sincronizando com o servidor…');
      var novos = 0, falhou = false;
      for (var i = 0; i < eqs.length; i++) {
        var eq = eqs[i];
        var mapa = await baixarEquipe(eq);
        if (mapa === null) { falhou = true; continue; }
        cache[eq] = mapa;
        for (var id in mapa) if (desenhar(eq, id, mapa[id])) novos++;
      }
      salvarCache();
      legenda();
      var t = totalCache();
      if (falhou && !t) info('Não foi possível falar com o servidor. Toque em Atualizar para tentar de novo.');
      else if (falhou) info(t + ' ponto(s) — sem conexão agora, mostrando o último sincronizado.');
      else info(t + ' ponto(s)' + (novos ? ' · +' + novos + ' novo(s)' : '') + ' · atualizado às ' + agora());
      if (novos && typeof adminMap !== 'undefined' && adminMap && adminMap.invalidateSize) {
        setTimeout(function () { adminMap.invalidateSize(); }, 200);
      }
    } catch (e) {
      console.warn('VERA admin-mapa-sync:', e);
      info(totalCache() + ' ponto(s) — falha ao sincronizar, mostrando o último carregado.');
    }
    sincronizando = false;
  }

  function mapaVisivel() {
    var el = document.getElementById('admin-map');
    return !!(el && el.offsetParent !== null);
  }

  async function abrir() {
    carregarCache();
    if (typeof iniciarMapaAdmin === 'function') iniciarMapaAdmin();
    var n = redesenharTudo();
    if (n) info(n + ' ponto(s) do último acesso · buscando novidades…');
    await sincronizar(!!n);
  }

  function instalar() {
    window.carregarPontosAdmin = function () {
      camadas = {};
      return abrir().catch(function (e) { console.warn('VERA admin-mapa-sync:', e); });
    };
    return true;
  }

  var t1 = setInterval(function () {
    if (typeof window.carregarPontosAdmin === 'function' || typeof iniciarMapaAdmin === 'function') {
      instalar(); clearInterval(t1);
    }
  }, 400);
  setTimeout(function () { clearInterval(t1); instalar(); }, 20000);

  var t2 = setInterval(function () {
    if (typeof adminMap !== 'undefined' && adminMap && typeof adminMapLayer !== 'undefined' && adminMapLayer && window.L) {
      clearInterval(t2);
      abrir();
      if (!timer) timer = setInterval(function () { if (mapaVisivel()) sincronizar(true); }, INTERVALO);
    }
  }, 800);
  setTimeout(function () { clearInterval(t2); }, 120000);
})();
