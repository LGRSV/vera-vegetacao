(function () {
  'use strict';

  // Ajustes do painel admin:
  // 1) Contagem real de pontos nos cards de projeto — o app conta o banco
  //    LOCAL do aparelho (no aparelho do admin da sempre 0); aqui buscamos a
  //    contagem verdadeira nas exportacoes geradas no GitHub.
  // 2) Duplo clique/toque no mapa do admin nao da mais zoom.
  if (window.__veraAdminAjustes) return;
  window.__veraAdminAjustes = true;

  var RAW = 'https://raw.githubusercontent.com/LGRSV/vera-vegetacao/main/';
  var cache = { quando: 0, porProjeto: {}, porEquipe: {} };

  function slug(nome) {
    return String(nome || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  }

  async function contarCsv(url) {
    var r = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    var texto = await r.text();
    var linhas = texto.split('\n').filter(function (l) { return l.trim(); });
    return Math.max(0, linhas.length - 1); // menos o cabecalho
  }

  async function contagemDoProjeto(rota) {
    var agora = Date.now();
    if (agora - cache.quando > 60000) { cache = { quando: agora, porProjeto: {}, porEquipe: {} }; }

    var sp = slug(rota.nomeProjeto);
    if (sp && cache.porProjeto[sp] == null) {
      cache.porProjeto[sp] = await contarCsv(RAW + 'exportacoes/projetos/' + sp + '/pontos.csv').catch(function () { return null; });
    }
    if (sp && cache.porProjeto[sp] != null) return { n: cache.porProjeto[sp], escopo: 'projeto' };

    var se = slug(rota.equipe);
    if (se && cache.porEquipe[se] == null) {
      cache.porEquipe[se] = await contarCsv(RAW + 'exportacoes/' + se + '.csv').catch(function () { return null; });
    }
    if (se && cache.porEquipe[se] != null) return { n: cache.porEquipe[se], escopo: 'equipe' };
    return null;
  }

  async function corrigirContagens() {
    var lista = document.getElementById('rotas-lista');
    if (!lista) return;
    var cards = lista.querySelectorAll('.rota-card');
    if (!cards.length) return;
    var rotas = (typeof rotasData !== 'undefined' && rotasData && Array.isArray(rotasData.rotas))
      ? rotasData.rotas.slice().reverse() : [];
    if (!rotas.length) return;

    for (var i = 0; i < cards.length; i++) {
      var rota = rotas[i];
      var alvo = cards[i].querySelector('.rota-pontos');
      if (!rota || !alvo) continue;
      try {
        var c = await contagemDoProjeto(rota);
        if (c == null) continue;
        alvo.textContent = c.n + ' ponto(s) sincronizado(s)' +
          (c.escopo === 'equipe' ? ' por esta equipe' : ' neste projeto');
      } catch (e) {}
    }
  }

  function desligarZoomDuploClique() {
    var mapa = (window.adminMap && window.L && window.adminMap instanceof window.L.Map) ? window.adminMap : null;
    if (!mapa || !mapa.doubleClickZoom) return false;
    try { mapa.doubleClickZoom.disable(); } catch (e) {}
    return true;
  }

  function instalarGancho() {
    if (typeof window.renderRotasAdmin !== 'function' || window.__veraContagemHooked) {
      return window.__veraContagemHooked === true;
    }
    var original = window.renderRotasAdmin;
    window.__veraContagemHooked = true;
    window.renderRotasAdmin = async function () {
      var ret = await original.apply(this, arguments);
      try { await corrigirContagens(); } catch (e) { console.warn('VERA contagem:', e); }
      return ret;
    };
    return true;
  }

  var tentativa = setInterval(function () {
    var a = instalarGancho();
    var b = desligarZoomDuploClique();
    if (a && b) clearInterval(tentativa);
  }, 700);
  setTimeout(function () { clearInterval(tentativa); }, 60000);

  // Corrige tambem o que ja estiver na tela (primeira carga).
  setTimeout(function () { corrigirContagens().catch(function () {}); }, 2500);

  // Mapa e recriado ao navegar entre abas — garante o ajuste de zoom sempre.
  // Agrupado: rodar em TODA mutacao de DOM pesava no aparelho do tecnico.
  var mutacaoAgendada = null;
  new MutationObserver(function () {
    if (mutacaoAgendada) return;
    mutacaoAgendada = setTimeout(function () {
      mutacaoAgendada = null;
      desligarZoomDuploClique();
    }, 400);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
