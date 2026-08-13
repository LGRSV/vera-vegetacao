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

  function ehAdminCampo() {
    try { return typeof currentUser !== 'undefined' && typeof ADMIN_USER !== 'undefined' && currentUser === ADMIN_USER; }
    catch (e) { return false; }
  }

  // Foco do técnico de campo: apenas ver a rede consolidada da SE Paraíso I
  // (trechos + postes) e marcar. Esconde o painel de filtros "Visualização"
  // — o técnico não deve poder ocultar/filtrar camadas por engano. (Admin
  // mantém os controles.) O mapa continua enquadrando a rota sozinho.
  function esconderFiltrosDoTecnico() {
    if (ehAdminCampo()) return;
    if (document.getElementById('vera-oculta-filtros-tecnico')) return;
    const st = document.createElement('style');
    st.id = 'vera-oculta-filtros-tecnico';
    st.textContent = '#camadas-control{display:none!important;}';
    (document.head || document.documentElement).appendChild(st);
  }

  let chaveEnquadrada = '';

  // Ao entrar numa rota, garante a visão da REDE (trechos + postes sobre a
  // rede) em vez de "Postes fora da rede" — filtro avançado que, ligado por
  // engano, esconde a malha e mostra os postes longe do cabo. Só corrige uma
  // vez por rota; depois o técnico é livre para alternar as camadas.
  function garantirVisualizacaoDaRede() {
    try {
      if (typeof camadas === 'undefined' || !camadas) return;
      let mudou = false;
      if (camadas.livres) { camadas.livres = false; mudou = true; }
      if (!camadas.t1) { camadas.t1 = true; mudou = true; }
      if (!camadas.postes) { camadas.postes = true; mudou = true; }
      if (!mudou) return;
      if (typeof atualizarBotoesCamadas === 'function') atualizarBotoesCamadas();
      if (typeof sincronizarVisibilidadeCamadas === 'function') sincronizarVisibilidadeCamadas();
      // redesenha os postes com o filtro correto (usa o cache — não rebaixa nada)
      if (typeof window.carregarPostes === 'function') window.carregarPostes();
    } catch (e) { console.warn('VERA visao da rede:', e); }
  }

  function laco() {
    esconderFiltrosDoTecnico();
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
    garantirVisualizacaoDaRede(); // começa sempre mostrando a rede, não "postes fora da rede"
    if (usuarioLongeDaRota(b)) {
      try { if (typeof gpsPrimeiraFixacao !== 'undefined') gpsPrimeiraFixacao = false; } catch (e) {}
      enquadrarRota();
    }
    // Repinta o canvas (postes/cabos podem ficar "no mapa" mas sem pintar no
    // iOS ate um movimento). Empurroes escalonados garantem que apareca.
    [200, 1200, 3000, 6000].forEach(function (ms) { setTimeout(forcarRepaint, ms); });
  }

  // Força o Leaflet a repintar as camadas de canvas (postes e cabos). No
  // Safari/iOS a camada as vezes fica adicionada mas sem desenhar ate o mapa
  // se mover; um invalidateSize + micro-pan dispara o redraw sem mudar a vista.
  function forcarRepaint() {
    const m = mapaCampo();
    if (!m) return;
    try {
      m.invalidateSize({ animate: false });
      m.panBy([1, 0], { animate: false });
      m.panBy([-1, 0], { animate: false });
    } catch (e) {}
    // Garantia extra: redesenha diretamente os canvas de postes e cabos.
    try {
      const renderers = [];
      if (typeof postesRenderer !== 'undefined' && postesRenderer) renderers.push(postesRenderer);
      if (typeof caboRendererT1 !== 'undefined' && caboRendererT1) renderers.push(caboRendererT1);
      if (typeof caboRendererT2 !== 'undefined' && caboRendererT2) renderers.push(caboRendererT2);
      renderers.forEach(function (r) {
        try { if (typeof r._redraw === 'function') r._redraw(); else if (typeof r._update === 'function') r._update(); } catch (e) {}
      });
    } catch (e) {}
  }
  window.veraForcarRepaint = forcarRepaint;

  // ——— Desenho em SVG em vez de canvas ───────────────────────────────────
  // O app desenha postes e cabos com L.canvas. Em vários aparelhos (iOS e
  // Android) o canvas fica SEM PINTAR: a camada existe e o poste ate abre o
  // popup ao toque (a camada de toque usa o renderer padrao, que e SVG), mas
  // o desenho azul nao aparece — nem ao mover/dar zoom no mapa. Trocamos os
  // renderizadores de postes e cabos para L.svg (DOM, pinta sempre) por meio
  // de criarPaineisMapa, que e onde eles sao criados, e forcamos um
  // re-render se a rota ja tinha sido desenhada em canvas.
  (function usarSVG() {
    if (typeof window.criarPaineisMapa !== 'function' || !window.L) { setTimeout(usarSVG, 400); return; }
    if (window.__veraRenderSVG) return;
    window.__veraRenderSVG = true;
    const original = window.criarPaineisMapa;
    window.criarPaineisMapa = function () {
      original.apply(this, arguments);
      try {
        if (typeof map === 'undefined' || !map) return;
        postesRenderer = window.L.svg({ pane: 'postesPane', padding: 0.5 });
        caboRendererT1 = window.L.svg({ pane: 'cabosT1Pane', padding: 0.5 });
        caboRendererT2 = caboRendererT1;
      } catch (e) { console.warn('VERA render SVG:', e); }
    };
    // Se a rota já foi desenhada (em canvas) antes desta troca, redesenha.
    setTimeout(function () {
      try {
        const temAlims = typeof alimentadoresAtivos !== 'undefined' && alimentadoresAtivos && alimentadoresAtivos.length;
        if (temAlims && typeof window.carregarPostes === 'function') window.carregarPostes();
      } catch (e) {}
    }, 400);
  })();

  // Após cada (re)carga de postes, força a repintura — cobre os circuitos que
  // chegam mais tarde em rede lenta e o caso iOS de camada sem desenhar.
  (function engancharRepaint() {
    if (typeof window.carregarPostes !== 'function') { setTimeout(engancharRepaint, 500); return; }
    if (window.__veraCarregarPostesRepaint) return;
    window.__veraCarregarPostesRepaint = true;
    const original = window.carregarPostes;
    window.carregarPostes = async function () {
      const r = await original.apply(this, arguments);
      [100, 800, 2000].forEach(function (ms) { setTimeout(forcarRepaint, ms); });
      return r;
    };
  })();

  // (o agendamento fica no fim do arquivo: um unico timer para as 3 rotinas)

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

  // (chamado pelo timer unico do fim do arquivo, a cada ~25 s)

  // ——— Remove o filtro "Postes fora da rede" ─────────────────────────────
  // Esse botao inverte a visao: mostra os postes LONGE do cabo e esconde a
  // malha da rota — dando a impressao de que "o mapa esta por cima dos
  // postes". A pedido do supervisor: escondemos o botao e travamos o filtro
  // em desligado, para o app SEMPRE mostrar a rede (trechos + postes sobre a
  // rede), que e o que serve para marcar.
  let livresRedesenhado = false;
  function travarFiltroForaDaRede() {
    if (!document.getElementById('vera-oculta-filtro-livres')) {
      const st = document.createElement('style');
      st.id = 'vera-oculta-filtro-livres';
      st.textContent = '#cam-livres{display:none!important;}';
      (document.head || document.documentElement).appendChild(st);
    }
    try {
      if (typeof camadas === 'undefined' || !camadas || !camadas.livres) return;
      camadas.livres = false; // trava desligado
      if (typeof atualizarBotoesCamadas === 'function') atualizarBotoesCamadas();
      if (typeof sincronizarVisibilidadeCamadas === 'function') sincronizarVisibilidadeCamadas();
      if (!livresRedesenhado && !recarregandoRede && typeof window.carregarPostes === 'function') {
        livresRedesenhado = true; // redesenha os postes certos uma unica vez
        window.carregarPostes();
      }
    } catch (e) { console.warn('VERA travar filtro:', e); }
  }
  travarFiltroForaDaRede();

  // ——— Um unico timer, com ritmo adaptativo ──────────────────────────────
  // Antes eram tres setInterval perpetuos (1,5 s / 2 s / 25 s): ~33 mil
  // execucoes num turno de 8 h, todas mexendo no DOM — a mesma familia de
  // problema que travava o app no campo. Agora e um so timer:
  //   · 2 s enquanto a rota carrega/estabiliza (enquadrar, completar rede);
  //   · 15 s depois de estavel, so vigiando (filtro travado, rota intacta);
  //   · volta na hora para o ritmo rapido quando a equipe entra numa rota
  //     (gancho em confirmarAlimentadores), sem esperar o proximo tique.
  const RAPIDO = 2000, LENTO = 15000, PERIODO_COMPLETAR = 25000;
  let timerTique = null, proximoCompletar = 0, forcarRapidoAte = 0;

  function estaEstavel() {
    try {
      const alims = (typeof alimentadoresAtivos !== 'undefined' && alimentadoresAtivos) || [];
      if (!alims.length) return true;                       // sem rota: nada a fazer
      if (alims.join(',') !== chaveEnquadrada) return false; // rota nova: acelera
      if (circuitosFaltando().length) return false;          // ainda baixando
      return true;
    } catch (e) { return false; }
  }

  async function tique() {
    try {
      esconderFiltrosDoTecnico();
      travarFiltroForaDaRede();
      laco();
      if (Date.now() >= proximoCompletar) {
        proximoCompletar = Date.now() + PERIODO_COMPLETAR;
        await completarRede();
      }
    } catch (e) { console.warn('VERA tique:', e); }
    agendar();
  }

  function agendar() {
    if (timerTique) clearTimeout(timerTique);
    const rapido = Date.now() < forcarRapidoAte || !estaEstavel();
    timerTique = setTimeout(tique, rapido ? RAPIDO : LENTO);
  }

  function acelerar(ms) {            // volta ao ritmo rapido por um periodo
    forcarRapidoAte = Date.now() + (ms || 60000);
    agendar();
  }

  // Entrar numa rota reacelera na hora (nao espera o tique lento).
  (function engancharEntrada() {
    if (typeof window.confirmarAlimentadores !== 'function') { setTimeout(engancharEntrada, 500); return; }
    if (window.__veraTiqueEntradaHook) return;
    window.__veraTiqueEntradaHook = true;
    const original = window.confirmarAlimentadores;
    window.confirmarAlimentadores = async function () {
      const r = await original.apply(this, arguments);
      try { acelerar(90000); } catch (e) {}
      return r;
    };
  })();

  agendar();

  // ——— Complementa o cruzamento com o KML (trechos "vazados") ─────────────
  // O app so mostra postes a ate 8 m de um cabo do KML; postes um pouco fora
  // do tracado sumiam, deixando buracos nos trechos. Aumentamos o alcance do
  // cruzamento para ~18 m (ainda menos que meia quadra, nao pula pra rua
  // vizinha), reescrevendo as funcoes que fazem o casamento poste<->cabo, e
  // reconstruimos os indices ja criados com 8 m.
  window.__veraDistCabo = 18;

  function veraIndiceCabos(cabos) {
    const grade = new Map();
    const alcanceGraus = window.__veraDistCabo / 100000;
    let totalSegmentos = 0;
    const incluir = function (a, b, tipo) {
      if (!Array.isArray(a) || !Array.isArray(b)) return;
      if (!numeroNoIntervalo(a[0], -180, 180) || !numeroNoIntervalo(a[1], -90, 90)
        || !numeroNoIntervalo(b[0], -180, 180) || !numeroNoIntervalo(b[1], -90, 90)) return;
      const lon1 = Number(a[0]), lat1 = Number(a[1]), lon2 = Number(b[0]), lat2 = Number(b[1]);
      const seg = { lat1: lat1, lon1: lon1, lat2: lat2, lon2: lon2, tipo: tipo };
      const laMin = Math.min(lat1, lat2) - alcanceGraus, laMax = Math.max(lat1, lat2) + alcanceGraus;
      const loMin = Math.min(lon1, lon2) - alcanceGraus, loMax = Math.max(lon1, lon2) + alcanceGraus;
      const li = Math.floor(laMin / GRADE_CABOS_GRAUS), lf = Math.floor(laMax / GRADE_CABOS_GRAUS);
      const ci = Math.floor(loMin / GRADE_CABOS_GRAUS), cf = Math.floor(loMax / GRADE_CABOS_GRAUS);
      for (let l = li; l <= lf; l++) for (let c = ci; c <= cf; c++) {
        const k = l + ':' + c; if (!grade.has(k)) grade.set(k, []); grade.get(k).push(seg);
      }
      totalSegmentos++;
    };
    ['t1', 't2'].forEach(function (t) {
      (cabos[t] || []).forEach(function (linha) {
        if (Array.isArray(linha)) for (let i = 1; i < linha.length; i++) incluir(linha[i - 1], linha[i], t);
      });
    });
    return { grade: grade, totalSegmentos: totalSegmentos };
  }

  function veraTemCabeamento(poste, indice) {
    if (!indice || !indice.grade || !validarPoste(poste)) return false;
    const lat = Number(poste.lat), lon = Number(poste.lon), D = window.__veraDistCabo;
    const li = Math.floor(lat / GRADE_CABOS_GRAUS), co = Math.floor(lon / GRADE_CABOS_GRAUS);
    const alc = Math.max(1, Math.ceil((D / 111320) / GRADE_CABOS_GRAUS));
    for (let i = li - alc; i <= li + alc; i++) for (let j = co - alc; j <= co + alc; j++) {
      const cand = indice.grade.get(i + ':' + j);
      if (!cand) continue;
      for (let n = 0; n < cand.length; n++) if (distanciaPontoSegmentoMetros(lat, lon, cand[n]) <= D) return true;
    }
    return false;
  }

  (function complementarCruzamento() {
    if (typeof window.criarIndiceCabos !== 'function' || typeof window.posteTemCabeamento !== 'function'
      || typeof GRADE_CABOS_GRAUS === 'undefined') { setTimeout(complementarCruzamento, 500); return; }
    if (window.__veraCruzamentoComplementado) return;
    window.__veraCruzamentoComplementado = true;
    window.criarIndiceCabos = veraIndiceCabos;
    window.posteTemCabeamento = veraTemCabeamento;
    setTimeout(function () {
      try {
        if (typeof indicesCabos !== 'undefined' && indicesCabos && typeof cabosCarregados !== 'undefined') {
          Object.keys(indicesCabos).forEach(function (k) { if (cabosCarregados[k]) indicesCabos[k] = veraIndiceCabos(cabosCarregados[k]); });
        }
        const temAlims = typeof alimentadoresAtivos !== 'undefined' && alimentadoresAtivos && alimentadoresAtivos.length;
        if (temAlims && typeof window.carregarPostes === 'function') window.carregarPostes();
      } catch (e) { console.warn('VERA complementar cruzamento:', e); }
    }, 900);
  })();
})();
