(function () {
  'use strict';

  if (window.__veraContextoMapaCompartilhado) return;
  window.__veraContextoMapaCompartilhado = true;

  const nomes = ['currentUser', 'ADMIN_USER', 'rotaAtribuida', 'map', 'adminMap'];
  const VERDE_ENECOL = '#2e8b57';

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

  function inserirEstiloMarcador() {
    if (document.getElementById('vera-marker-enecol-style')) return;

    const estilo = document.createElement('style');
    estilo.id = 'vera-marker-enecol-style';
    estilo.textContent = ''
      + '.vera-marker-enecol{background:transparent!important;border:0!important;}'
      + '.vera-marker-enecol__inner{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-sizing:border-box;background:' + VERDE_ENECOL + ';border:3px solid #fff;color:#fff;font:800 14px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-shadow:0 1px 5px rgba(0,0,0,.28);}'
      + '.vera-marker-enecol__inner:after{content:"";position:absolute;width:20px;height:20px;border-radius:50%;border:1px solid rgba(255,255,255,.22);pointer-events:none;}';
    (document.head || document.documentElement).appendChild(estilo);
  }

  function criarIconeEnecol() {
    return window.L.divIcon({
      className: 'vera-marker-enecol',
      html: '<div class="vera-marker-enecol__inner">C</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -15],
      tooltipAnchor: [0, -15]
    });
  }

  function ehPontoCompartilhado(opcoes) {
    if (!opcoes) return false;
    const preenchimento = String(opcoes.fillColor || '').toLowerCase();
    const contorno = String(opcoes.color || '').toLowerCase();
    const raio = Number(opcoes.radius || 0);
    const peso = Number(opcoes.weight || 0);

    const estiloAdmin = raio === 10 && peso === 3 && contorno === '#fff';
    const estiloTecnico = raio === 8 && peso === 2.5 && contorno === '#fff';
    const coresDoHistorico = ['#2467a8', '#2e8b57', '#7b4db3'];

    return (estiloAdmin || estiloTecnico) && coresDoHistorico.indexOf(preenchimento) >= 0;
  }

  function instalarPadraoMarcador() {
    if (!window.L || !window.L.circleMarker || window.__veraMarcadorEnecolInstalado) return false;

    inserirEstiloMarcador();
    window.__veraMarcadorEnecolInstalado = true;
    const circleMarkerOriginal = window.L.circleMarker;

    window.L.circleMarker = function (latlng, opcoes) {
      if (ehPontoCompartilhado(opcoes)) {
        const marcador = window.L.marker(latlng, {
          icon: criarIconeEnecol(),
          interactive: opcoes.interactive !== false,
          keyboard: opcoes.keyboard !== false,
          zIndexOffset: Number(opcoes.zIndexOffset || 0)
        });
        marcador.__veraPontoEnecolPadronizado = true;
        return marcador;
      }
      return circleMarkerOriginal.apply(this, arguments);
    };

    window.criarMarcadorEnecolPadrao = function (latlng, opcoes) {
      return window.L.marker(latlng, Object.assign({ icon: criarIconeEnecol() }, opcoes || {}));
    };

    return true;
  }

  function iniciarPadronizacao() {
    if (instalarPadraoMarcador()) return;
    const tentativa = setInterval(function () {
      if (instalarPadraoMarcador()) clearInterval(tentativa);
    }, 50);
    setTimeout(function () { clearInterval(tentativa); }, 5000);
  }

  espelhar();
  iniciarPadronizacao();

  const intervalo = setInterval(espelhar, 300);
  setTimeout(function () { clearInterval(intervalo); }, 120000);
})();
