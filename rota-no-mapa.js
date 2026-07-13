(function () {
  'use strict';

  // O mapa do técnico centraliza na posição do GPS. Quando a equipe está
  // longe da rota — ex.: técnico em Porto Nacional com a rota de Paraíso —
  // a rede fica fora da tela e parece que "não carregou nada", mesmo com os
  // postes e trechos no aparelho.
  //
  // Versão determinística: um laço de 2s observa o mapa. Assim que a rota
  // ativa tem postes desenhados, enquadra a rede UMA vez por rota se o
  // usuário estiver a mais de 3 km dela (ou sem GPS), desarmando o pulo
  // automático da primeira fixação do GPS. O botão "Ver rota" fica fixo no
  // mapa desde que ele existe, para enquadrar a rede a qualquer momento.
  // (Sem gancho em carregarPostes: numa conexão lenta a captura da chamada
  // podia falhar e o enquadramento não acontecia.)

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

  function usuarioLongeDaRota(b) {
    try {
      if (typeof currentLat === 'undefined' || currentLat == null
        || typeof currentLon === 'undefined' || currentLon == null) return true; // sem GPS ainda
      const centro = b.getCenter();
      if (b.pad(0.15).contains([currentLat, currentLon])) return false;
      return distanciaKm(currentLat, currentLon, centro.lat, centro.lng) > 3;
    } catch (e) { return true; }
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
    if (!m) return;
    if (window.__veraBotaoVerRota && window.__veraBotaoVerRota._map === m) return;

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
  }

  let chaveEnquadrada = '';

  function laco() {
    criarBotaoVerRota();
    const m = mapaCampo();
    if (!m) return;

    let alims = [];
    try { alims = (typeof alimentadoresAtivos !== 'undefined' && alimentadoresAtivos) || []; } catch (e) {}
    const chave = alims.join(',');
    if (!chave || chave === chaveEnquadrada) return;

    let temPostes = false;
    try { temPostes = typeof postesLayer !== 'undefined' && postesLayer && postesLayer.getLayers().length > 0; } catch (e) {}
    if (!temPostes) return;

    const b = boundsDaRota();
    if (!b) return;

    chaveEnquadrada = chave; // uma vez por rota
    if (usuarioLongeDaRota(b)) {
      try { if (typeof gpsPrimeiraFixacao !== 'undefined') gpsPrimeiraFixacao = false; } catch (e) {}
      enquadrarRota();
      if (typeof showToast === 'function') {
        showToast('Rota enquadrada no mapa. Use "🗺 Ver rota" para voltar a ela quando quiser.', '');
      }
    }
  }

  setInterval(laco, 2000);

  // ——— Rede completa: retenta circuitos que falharam de baixar ───────────
  // O app carrega os circuitos um a um; quando um download falha (rede móvel
  // oscilou), ele pula o circuito e nunca mais tenta — e só um pedaço do
  // consolidado aparece plotado. Aqui: quando a carga para com circuito
  // faltando (sem postes ou sem cabos em cache), chama carregarPostes() de
  // novo — o app usa o cache do que já veio e refaz só o que faltou —
  // repetindo até a rede inteira estar no mapa (limite de 6 rodadas).

  let ultimoProgresso = { qtd: -1, quando: 0 };
  let tentativasRedeCompleta = 0;
  let chaveRotaRetentativa = '';
  let recarregandoRede = false;

  function circuitosFaltando() {
    try {
      const alims = (typeof alimentadoresAtivos !== 'undefined' && alimentadoresAtivos) || [];
      if (!alims.length || typeof chaveCircuito !== 'function') return [];
      return alims.filter(function (circ) {
        const chave = chaveCircuito(circ);
        const temPostes = typeof postesCarregados !== 'undefined' && postesCarregados && postesCarregados[chave];
        const temCabos = typeof cabosCarregados !== 'undefined' && cabosCarregados && cabosCarregados[chave];
        return !temPostes || !temCabos;
      });
    } catch (e) { return []; }
  }

  function cargaParada() {
    let qtd = 0;
    try {
      qtd = Object.keys((typeof postesVisiveisPorCircuito !== 'undefined' && postesVisiveisPorCircuito) || {}).length;
    } catch (e) {}
    const agora = Date.now();
    if (qtd !== ultimoProgresso.qtd) {
      ultimoProgresso = { qtd: qtd, quando: agora };
      return false; // ainda está progredindo
    }
    return (agora - ultimoProgresso.quando) > 20000;
  }

  async function completarRede() {
    if (recarregandoRede || !navigator.onLine || !mapaCampo()) return;

    let alims = [];
    try { alims = (typeof alimentadoresAtivos !== 'undefined' && alimentadoresAtivos) || []; } catch (e) {}
    const chaveRota = alims.join(',');
    if (!chaveRota) return;
    if (chaveRota !== chaveRotaRetentativa) {
      chaveRotaRetentativa = chaveRota;
      tentativasRedeCompleta = 0;
    }

    const faltam = circuitosFaltando();
    if (!faltam.length || tentativasRedeCompleta >= 6 || !cargaParada()) return;

    tentativasRedeCompleta++;
    recarregandoRede = true;
    try {
      if (typeof showToast === 'function') {
        showToast('Completando o desenho da rota — faltam ' + faltam.length + ' circuito(s)…', '');
      }
      if (typeof window.carregarPostes === 'function') await window.carregarPostes();
      if (!circuitosFaltando().length && typeof showToast === 'function') {
        showToast('Rota completa no mapa: todos os circuitos desenhados.', 'success');
      }
    } catch (e) {
      console.warn('VERA completar rede:', e);
    } finally {
      recarregandoRede = false;
    }
  }

  setInterval(completarRede, 25000);
})();
