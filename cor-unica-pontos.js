(function () {
  'use strict';

  if (window.__veraCorUnicaPontos) return;
  window.__veraCorUnicaPontos = true;

  var VERDE = '#2e8b57';
  var AZUL_HISTORICO = '#2467a8';

  function mesmaCor(valor, hexadecimal) {
    var cor = String(valor || '').toLowerCase().replace(/\s+/g, '');
    return cor === hexadecimal || cor === 'rgb(36,103,168)' || cor === 'rgb(46,139,87)';
  }

  function ajustarMarcadores(mapa) {
    if (!mapa || !mapa._layers) return;
    Object.keys(mapa._layers).forEach(function (id) {
      var camada = mapa._layers[id];
      if (!camada || !camada.options || typeof camada.setStyle !== 'function') return;
      var preenchimento = String(camada.options.fillColor || '').toLowerCase();
      var contorno = String(camada.options.color || '').toLowerCase();
      if (preenchimento === AZUL_HISTORICO || contorno === AZUL_HISTORICO) {
        camada.setStyle({ fillColor: VERDE, color: contorno === AZUL_HISTORICO ? VERDE : camada.options.color });
      }
    });
  }

  function ajustarPopup() {
    document.querySelectorAll('[style*="2467a8"], [style*="36, 103, 168"], [style*="36,103,168"]').forEach(function (elemento) {
      elemento.style.setProperty('color', VERDE, 'important');
    });
  }

  function aplicar() {
    ajustarMarcadores(window.adminMap);
    ajustarMarcadores(window.__veraMapaCampo);
    ajustarMarcadores(window.map);
    ajustarMarcadores(window.fieldMap);
    ajustarPopup();
  }

  var observador = new MutationObserver(aplicar);
  observador.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  setInterval(aplicar, 350);
  aplicar();
})();
