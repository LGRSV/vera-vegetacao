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
  // reaplicacao quando o <head> for recriado.
  new MutationObserver(function () {
    if (!document.getElementById('vera-ui-ajustes')) aplicar();
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
