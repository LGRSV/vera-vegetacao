(function () {
  'use strict';

  // Ajustes de interface (valem para admin e tecnico):
  // 1) Trava o zoom da PAGINA: duplo toque e pinca nao dao mais zoom na
  //    interface (o mapa continua com zoom proprio normal).
  // 2) Conserta elementos vazando da tela: barra de status respeitando o
  //    recorte do iPhone, botoes dos cards quebrando linha, sem rolagem
  //    horizontal acidental.
  if (window.__veraUiAjustes) return;
  window.__veraUiAjustes = true;

  function travarZoomDaPagina() {
    // Viewport: sem escala pelo usuario (efetivo no app instalado/standalone).
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      (document.head || document.documentElement).appendChild(meta);
    }
    meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');

    // Pinca do Safari iOS fora do mapa.
    ['gesturestart', 'gesturechange'].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        if (e.target && e.target.closest && e.target.closest('.leaflet-container')) return;
        e.preventDefault();
      }, { passive: false });
    });

    // Duplo toque rapido (fallback alem do touch-action) — nunca em cima de
    // botao/campo/link nem do mapa, para nao engolir toques legitimos.
    var ultimoToque = 0;
    document.addEventListener('touchend', function (e) {
      var t = e.target;
      if (t && t.closest && t.closest('button, a, input, select, textarea, label, [onclick], .leaflet-container')) return;
      var agora = Date.now();
      if (agora - ultimoToque < 320) e.preventDefault();
      ultimoToque = agora;
    }, { passive: false });
  }

  function injetarEstilos() {
    if (document.getElementById('vera-ui-ajustes')) return;
    var st = document.createElement('style');
    st.id = 'vera-ui-ajustes';
    st.textContent = [
      /* duplo toque nao vira zoom (mapa fica de fora, gerencia o proprio toque) */
      'html,body{touch-action:manipulation;-webkit-text-size-adjust:100%;}',
      '.leaflet-container{touch-action:none;}',
      /* nada vaza pro lado */
      'html,body{overflow-x:hidden;max-width:100%;}',
      'img,video,canvas{max-width:100%;}',
      /* barra de status respeita o recorte (notch/relogio) do iPhone */
      '#status-bar{padding-top:calc(env(safe-area-inset-top,0px) + 6px)!important;}',
      /* cards de projeto: botoes quebram linha em vez de sair da tela */
      '.rota-card{overflow:hidden;}',
      '.rota-card-header{flex-wrap:wrap;gap:6px;}',
      '.rota-acoes{flex-wrap:wrap;justify-content:flex-end;row-gap:6px;}',
      '.rota-equipe{overflow-wrap:anywhere;}',
      '.rota-alims{max-width:100%;}',
      /* blocos de config/painel nunca mais largos que a tela */
      '.config-section,.config-panel,#config-panel{max-width:100vw;box-sizing:border-box;}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(st);
  }

  function aplicar() { travarZoomDaPagina(); injetarEstilos(); }

  aplicar();
  // O app real e montado via document.write depois do loader — garante a
  // reaplicacao quando o <head> for recriado. Agrupa as rajadas de mutacao
  // (pan/zoom do mapa dispara milhares) numa verificacao a cada 400ms.
  var mutacaoAgendada = null;
  new MutationObserver(function () {
    if (mutacaoAgendada) return;
    mutacaoAgendada = setTimeout(function () {
      mutacaoAgendada = null;
      if (!document.getElementById('vera-ui-ajustes')) aplicar();
    }, 400);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();

(function () {
  'use strict';

  // Atualizacao forcada: alguns celulares (PWA instalado) seguram o
  // index.html antigo em cache e ficam presos numa versao velha do app,
  // mesmo com os patches sendo baixados frescos. Este verificador — que
  // TODAS as versoes do app baixam a cada abertura — compara a versao
  // rodando (APP_VERSION) com a do servidor (version.json). Diferente?
  // Na tela de login atualiza sozinho; dentro do app mostra uma faixa
  // "toque para atualizar" (nao interrompe quem esta preenchendo ponto).
  if (window.__veraForcaAtualizacao) return;
  window.__veraForcaAtualizacao = true;

  // DESATIVADO a pedido: a faixa "Nova versão X disponível — toque para
  // atualizar" virava uma faixa fantasma / recarregava sozinho, porque o
  // index.html (bootstrap) roda uma versão fixa e o version.json fica em outra,
  // então a divergência nunca some. Além disso este verificador é REDUNDANTE:
  // o próprio bootstrap já desregistra o Service Worker, limpa o cache e busca
  // o app fresco a cada abertura — não há como ficar preso em versão velha.
  // Mantemos os "Ajustes de interface" (IIFE acima) ativos; só o verificador
  // de versão foi desligado. Reative removendo este return se voltar a ser útil.
  return;

  var URL_VERSAO = 'https://lgrsv.github.io/vera-vegetacao/version.json';

  function versaoRodando() {
    try { return (typeof APP_VERSION !== 'undefined') ? String(APP_VERSION) : ''; } catch (e) { return ''; }
  }

  function recarregarComVersaoNova(versao) {
    try { sessionStorage.setItem('vera_auto_atualizou', versao); } catch (e) {}
    var base = location.origin + location.pathname;
    location.replace(base + '?atualizar=' + Date.now());
  }

  function emTelaDeLogin() {
    var tela = document.getElementById('login-screen');
    return !!(tela && tela.style.display !== 'none' && tela.offsetParent !== null);
  }

  function mostrarFaixa(versao) {
    if (document.getElementById('vera-faixa-atualizar')) return;
    var faixa = document.createElement('button');
    faixa.type = 'button';
    faixa.id = 'vera-faixa-atualizar';
    faixa.textContent = 'Nova versão ' + versao + ' disponível — toque para atualizar';
    faixa.style.cssText = 'position:fixed;left:10px;right:10px;bottom:calc(env(safe-area-inset-bottom,0px) + 78px);'
      + 'z-index:100001;padding:13px 14px;border:0;border-radius:12px;background:#e8a020;color:#1a2e1a;'
      + 'font:700 13px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;'
      + 'box-shadow:0 6px 20px rgba(0,0,0,.35);cursor:pointer;text-align:center;';
    faixa.addEventListener('click', function () { recarregarComVersaoNova(versao); });
    document.body.appendChild(faixa);
  }

  // Reinicio automatico e seguro: os pontos ficam no banco do aparelho e a
  // sessao da equipe se restaura sozinha depois do reload. So NAO reinicia
  // sozinho com o formulario de novo ponto aberto ou um modal de confirmacao
  // na tela — nesses casos fica a faixa de um toque.
  function podeReiniciarSozinho() {
    if (emTelaDeLogin()) return true;
    var abaFormulario = document.getElementById('tab-form');
    if (abaFormulario && abaFormulario.classList && abaFormulario.classList.contains('active')) return false;
    if (document.getElementById('vera-modal-confirmacao') || document.getElementById('vera-modal-trocar-equipe')) return false;
    return true;
  }

  function verificar() {
    var rodando = versaoRodando();
    if (!rodando) return;
    fetch(URL_VERSAO + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) {
        if (!v || !v.version) return;
        var nova = String(v.version);
        if (nova === rodando) return;
        var jaTentou = '';
        try { jaTentou = sessionStorage.getItem('vera_auto_atualizou') || ''; } catch (e) {}
        if (jaTentou !== nova && podeReiniciarSozinho()) {
          if (typeof showToast === 'function') showToast('Atualizando o VERA para a versão ' + nova + '…', '');
          setTimeout(function () { recarregarComVersaoNova(nova); }, 1200);
          return;
        }
        mostrarFaixa(nova);
      })
      .catch(function () {});
  }

  setTimeout(verificar, 5000);
  setInterval(verificar, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') setTimeout(verificar, 2000);
  });
})();
