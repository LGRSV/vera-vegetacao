(function () {
  'use strict';
  if (window.__veraHistoricoCompletoBootstrap) return;
  window.__veraHistoricoCompletoBootstrap = true;

  var script = document.createElement('script');
  script.src = 'historico-completo.js?t=' + Date.now();
  script.async = false;
  document.head.appendChild(script);
})();
