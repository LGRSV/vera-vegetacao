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

  function carregarCorUnica() {
    if (window.__veraCorUnicaPontos || document.querySelector('script[data-vera-cor-unica]')) return;
    const script = document.createElement('script');
    script.src = 'cor-unica-pontos.js?t=' + Date.now();
    script.async = true;
    script.setAttribute('data-vera-cor-unica', '1');
    (document.head || document.documentElement).appendChild(script);
  }

  espelhar();
  const intervalo = setInterval(espelhar, 300);
  setTimeout(function () { clearInterval(intervalo); }, 120000);
  setTimeout(carregarCorUnica, 800);
})();
