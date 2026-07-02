(function () {
  'use strict';

  if (window.__veraContextoMapaCompartilhado) return;
  window.__veraContextoMapaCompartilhado = true;

  const nomes = ['currentUser', 'ADMIN_USER', 'rotaAtribuida', 'map', 'adminMap'];

  function lerGlobal(nome) {
    try {
      return window.eval('(typeof ' + nome + ' !== "undefined") ? ' + nome + ' : undefined');
    } catch (erro) {
      return undefined;
    }
  }

  function espelhar() {
    nomes.forEach(function (nome) {
      const valor = lerGlobal(nome);
      if (typeof valor !== 'undefined') window[nome] = valor;
    });
  }

  espelhar();
  const intervalo = setInterval(espelhar, 300);
  setTimeout(function () { clearInterval(intervalo); }, 120000);
})();
