(function () {
  'use strict';

  // O mapa do técnico centraliza na posição do GPS (primeira fixação faz
  // setView no usuário). Quando a equipe está longe da rota — ex.: técnico em
  // Porto Nacional com a rota de Paraíso carregada — a rede fica fora da tela
  // e parece que "não carregou nada", mesmo com postes e trechos no aparelho.
  //
  // Este ajuste: (1) ao terminar de carregar a rota, se o usuário estiver a
  // mais de 3 km dela (ou sem GPS ainda), enquadra a rota e desarma o pulo
  // automático do GPS; (2) adiciona o botão "Ver rota" no mapa para enquadrar
  // a rede a qualquer momento. O botão de localização continua levando ao GPS.

  if (window.__veraRotaNoMapa) return;
  window.__veraRotaNoMapa = true;

  function mapaCampo() {
    try {
      if (typeof map !== 'undefined' && map && window.L && map instanceof window.L.Map) return map;
    } catch (e) {}
    return null;
  }

  function boundsDaRota() {
    try {
      if (typeof postesLayer !== 'undefined' && postesLayer && postesLayer.getBounds) {
        const b = postesLayer.getBounds();
        if (b && b.isValid && b.isValid()) return b;
      }
    } catch (e) {}
    try {
      if (typeof cabosT1Layer !== 'undefined' && cabosT1Layer) {
        let uniao = null;
        cabosT1Layer.eachLayer(function (linha) {
          if (!linha.getBounds) return;
          const b = linha.getBounds();
          uniao = uniao ? uniao.extend(b) : window.L.latLngBounds(b.getSouthWest(), b.getNorthEast());
        });
        if (uniao && uniao.isValid()) return uniao;
      }
    } catch (e) {}
    return null;
  }

  function distanciaKm(lat1, lon1, lat2, lon2) {
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function enquadrarRota() {
    const m = mapaCampo();
    const b = boundsDaRota();
    if (!m || !b) return false;
    try { m.fitBounds(b, { padding: [26, 26], maxZoom: 15 }); } catch (e) { return false; }
    return true;
  }
  window.veraEnquadrarRota = enquadrarRota;

  function criarBotaoVerRota() {
    const m = mapaCampo();
    if (!m) return false;
    if (window.__veraBotaoVerRota && window.__veraBotaoVerRota._map === m) return true;

    const Controle = window.L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd: function () {
        const botao = window.L.DomUtil.create('button');
        botao.type = 'button';
        botao.textContent = '🗺 Ver rota';
        botao.style.cssText = 'padding:10px 13px;border:0;border-radius:12px;background:#173b2b;color:#fff;'
          + 'font:700 12px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;'
          + 'box-shadow:0 4px 14px rgba(0,0,0,.32);cursor:pointer;margin-bottom:6px;';
        window.L.DomEvent.disableClickPropagation(botao);
        botao.addEventListener('click', function () {
          if (!enquadrarRota() && typeof showToast === 'function') {
            showToast('A rota ainda está carregando…', 'warning');
          }
        });
        return botao;
      }
    });

    window.__veraBotaoVerRota = new Controle();
    window.__veraBotaoVerRota.addTo(m);
    return true;
  }

  function usuarioLongeDaRota(b) {
    try {
      if (typeof currentLat === 'undefined' || currentLat == null
        || typeof currentLon === 'undefined' || currentLon == null) return true; // sem GPS ainda
      const centro = b.getCenter();
      if (b.pad(0.15).contains([currentLat, currentLon])) return false;
      return distanciaKm(currentLat, currentLon, centro.lat, centro.lng) > 3;
    } catch (e) { return true; }
  }

  function aposCarregarRota() {
    criarBotaoVerRota();
    const b = boundsDaRota();
    const m = mapaCampo();
    if (!b || !m) return;
    if (usuarioLongeDaRota(b)) {
      // Desarma o pulo automático da primeira fixação do GPS: a rota manda.
      try { if (typeof gpsPrimeiraFixacao !== 'undefined') gpsPrimeiraFixacao = false; } catch (e) {}
      enquadrarRota();
      if (typeof showToast === 'function') {
        showToast('Rota enquadrada no mapa. Use "🗺 Ver rota" para voltar a ela quando quiser.', '');
      }
    }
  }

  function instalarGancho() {
    if (window.__veraCarregarPostesOriginal) return true;
    if (typeof window.carregarPostes !== 'function') return false;
    window.__veraCarregarPostesOriginal = window.carregarPostes;
    window.carregarPostes = async function () {
      const ret = await window.__veraCarregarPostesOriginal.apply(this, arguments);
      try { aposCarregarRota(); } catch (e) { console.warn('VERA rota no mapa:', e); }
      return ret;
    };
    return true;
  }

  const tentativa = setInterval(function () {
    if (instalarGancho()) clearInterval(tentativa);
  }, 400);
  setTimeout(function () { clearInterval(tentativa); }, 30000);
})();
