(function () {
  'use strict';

  if (window.__veraAdminHistoricoLotes) return;
  window.__veraAdminHistoricoLotes = true;

  var REPO = 'LGRSV/vera-vegetacao';
  var LOTES = [
    {
      chave: 'ontem',
      titulo: '30/06/2026 · 23 pontos',
      etiqueta: '30/06',
      quantidade: 23,
      branch: 'backup/enecol-centro-2026-06-30',
      cor: '#2467a8'
    },
    {
      chave: 'hoje',
      titulo: '01/07/2026 · 48 pontos',
      etiqueta: '01/07',
      quantidade: 48,
      branch: 'backup/enecol-centro-2026-07-01-48-pontos',
      cor: '#2f8f41'
    }
  ];

  var estado = {
    carregado: false,
    carregando: false,
    registros: [],
    modo: 'todos',
    camada: null,
    painel: null
  };

  function escapar(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>'"]/g, function (caractere) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[caractere];
    });
  }

  function pad(numero) {
    return String(numero).padStart(4, '0');
  }

  function raw(lote, caminho) {
    return 'https://raw.githubusercontent.com/' + REPO + '/' + lote.branch + '/' + caminho;
  }

  function dataReferencia(lote, ponto) {
    var data = String((ponto && ponto.data) || '');
    var achado = data.match(/^(\d{2}\/\d{2}\/\d{4})/);
    return achado ? achado[1] : lote.titulo.slice(0, 10);
  }

  function idExibido(lote, ponto) {
    return dataReferencia(lote, ponto).slice(0, 5) + ' · ' + String(ponto.id || 'Sem ID');
  }

  function fotoIdExibido(lote, ponto, indice) {
    return dataReferencia(lote, ponto).replace(/\//g, '') + ' · ' + String((ponto.fotos_ids || [])[indice] || ('Foto ' + (indice + 1)));
  }

  function garantirCamada() {
    if (!window.L || !window.adminMap) return null;
    if (!estado.camada || estado.camada._map !== window.adminMap) {
      estado.camada = window.L.layerGroup().addTo(window.adminMap);
    }
    return estado.camada;
  }

  function htmlPopup(registro) {
    var ponto = registro.ponto;
    var fotos = Array.isArray(ponto.fotos_github) ? ponto.fotos_github : [];
    var imagens = fotos.map(function (caminho, indice) {
      var url = raw(registro.lote, caminho);
      return '<a href="' + escapar(url) + '" target="_blank" rel="noopener" style="display:inline-block;width:31%;margin:0 1% 8px 0;vertical-align:top;text-decoration:none;">'
        + '<img src="' + escapar(url) + '" alt="' + escapar(fotoIdExibido(registro.lote, ponto, indice)) + '" style="display:block;width:100%;height:88px;object-fit:cover;border-radius:7px;background:#edf2ef;">'
        + '<small style="display:block;margin-top:3px;color:#50685b;font-size:9px;line-height:1.2;">' + escapar(fotoIdExibido(registro.lote, ponto, indice)) + '</small>'
        + '</a>';
    }).join('');

    return '<div style="min-width:240px;max-width:320px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#17372a;">'
      + '<div style="font-size:11px;font-weight:800;color:' + registro.lote.cor + ';letter-spacing:.04em;">LOTE PRESERVADO · ' + escapar(registro.lote.titulo) + '</div>'
      + '<div style="margin:4px 0 9px;font-size:17px;font-weight:800;">' + escapar(idExibido(registro.lote, ponto)) + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:11px;line-height:1.35;margin-bottom:9px;">'
      + '<div><b>Espécie</b><br>' + escapar(ponto.especie || '—') + '</div>'
      + '<div><b>Poste</b><br>' + escapar(ponto.poste || '—') + '</div>'
      + '<div><b>Data</b><br>' + escapar(ponto.data || '—') + '</div>'
      + '<div><b>Área</b><br>' + escapar(ponto.area || '—') + '</div>'
      + '<div><b>Altura</b><br>' + escapar(ponto.altura || '—') + ' m</div>'
      + '<div><b>Acesso</b><br>' + escapar(ponto.acesso || '—') + '</div>'
      + '</div>'
      + '<div style="font-size:11px;font-weight:800;margin:3px 0 5px;">Fotos (' + fotos.length + ')</div>'
      + (imagens || '<div style="font-size:11px;color:#66786e;">Sem fotos registradas neste ponto.</div>')
      + '</div>';
  }

  function atualizarResumo(texto) {
    var status = document.getElementById('vera-historico-status');
    if (status) status.textContent = texto;
  }

  function atualizarBotoes() {
    if (!estado.painel) return;
    estado.painel.querySelectorAll('[data-vera-lote]').forEach(function (botao) {
      var ativo = botao.getAttribute('data-vera-lote') === estado.modo;
      botao.style.background = ativo ? '#183d2b' : '#fff';
      botao.style.color = ativo ? '#fff' : '#234536';
      botao.style.borderColor = ativo ? '#183d2b' : '#cfe0d4';
    });
  }

  function registrosDoModo() {
    if (estado.modo === 'todos') return estado.registros.slice();
    return estado.registros.filter(function (registro) { return registro.lote.chave === estado.modo; });
  }

  function mostrarNoMapa() {
    var camada = garantirCamada();
    if (!camada) {
      atualizarResumo('Abra a aba Admin e toque em Atualizar para inicializar o mapa.');
      return;
    }

    if (!estado.carregado) {
      atualizarResumo('Carregando os lotes preservados…');
      carregarDados().then(mostrarNoMapa);
      return;
    }

    var registros = registrosDoModo();
    camada.clearLayers();

    if (window.adminMapLayer && typeof window.adminMapLayer.clearLayers === 'function') {
      window.adminMapLayer.clearLayers();
    }

    var limites = [];
    registros.forEach(function (registro) {
      var ponto = registro.ponto;
      var lat = Number(ponto.lat);
      var lon = Number(ponto.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      var marcador = window.L.circleMarker([lat, lon], {
        radius: 10,
        color: '#fff',
        weight: 3,
        fillColor: registro.lote.cor,
        fillOpacity: 0.96
      });
      marcador.bindTooltip(idExibido(registro.lote, ponto), {
        direction: 'top',
        offset: [0, -6],
        opacity: 0.95
      });
      marcador.bindPopup(htmlPopup(registro), { maxWidth: 340 });
      marcador.addTo(camada);
      limites.push([lat, lon]);
    });

    if (limites.length && window.adminMap && typeof window.adminMap.fitBounds === 'function') {
      window.adminMap.fitBounds(window.L.latLngBounds(limites), { padding: [26, 26], maxZoom: 15 });
    }

    var titulo = estado.modo === 'todos' ? '23 de 30/06 + 48 de 01/07' : (estado.modo === 'ontem' ? '23 pontos de 30/06' : '48 pontos de 01/07');
    atualizarResumo(titulo + ' exibidos no mapa. Toque em um marcador para ver ponto, fotos e IDs com data.');

    var info = document.getElementById('admin-map-info');
    if (info) info.textContent = 'Histórico Enecol Centro — ' + titulo + '.';
  }

  async function carregarLote(lote) {
    var promessas = [];
    for (var indice = 1; indice <= lote.quantidade; indice++) {
      (function (numero) {
        var caminho = 'dados/Enecol-Centro/V' + pad(numero) + '.json';
        promessas.push(fetch(raw(lote, caminho), { cache: 'no-store' })
          .then(function (resposta) {
            if (!resposta.ok) throw new Error(caminho + ' · HTTP ' + resposta.status);
            return resposta.json();
          })
          .then(function (ponto) { return { lote: lote, ponto: ponto }; }));
      })(indice);
    }

    var resultados = await Promise.allSettled(promessas);
    return resultados.filter(function (resultado) { return resultado.status === 'fulfilled'; })
      .map(function (resultado) { return resultado.value; });
  }

  async function carregarDados() {
    if (estado.carregado) return estado.registros;
    if (estado.carregando) return new Promise(function (resolve) {
      var espera = setInterval(function () {
        if (!estado.carregando) {
          clearInterval(espera);
          resolve(estado.registros);
        }
      }, 100);
    });

    estado.carregando = true;
    atualizarResumo('Carregando 23 pontos de 30/06 e 48 pontos de 01/07…');
    try {
      var grupos = await Promise.all(LOTES.map(carregarLote));
      estado.registros = grupos[0].concat(grupos[1]);
      estado.carregado = true;
      return estado.registros;
    } catch (erro) {
      atualizarResumo('Não foi possível carregar um dos lotes agora. Atualize a página e tente novamente.');
      throw erro;
    } finally {
      estado.carregando = false;
    }
  }

  function criarPainel() {
    var mapa = document.getElementById('admin-map');
    if (!mapa || document.getElementById('vera-historico-lotes')) return;

    var painel = document.createElement('section');
    painel.id = 'vera-historico-lotes';
    painel.style.cssText = 'margin:10px 0 12px;padding:12px;border:1px solid #c8ddcc;border-radius:12px;background:#f8fbf8;';
    painel.innerHTML = ''
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">'
      + '<div><div style="font-size:13px;font-weight:800;color:#183d2b;">Histórico preservado — Enecol Centro</div>'
      + '<div style="margin-top:3px;font-size:11px;line-height:1.35;color:#5b7463;">Os lotes são independentes: mesmo ID local, registros diferentes por data.</div></div>'
      + '<div style="font-size:11px;font-weight:800;color:#183d2b;white-space:nowrap;">71 pontos</div></div>'
      + '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px;">'
      + '<button type="button" data-vera-lote="todos" style="padding:8px 10px;border:1px solid #cfe0d4;border-radius:8px;font:700 11px inherit;cursor:pointer;">Todos · 71</button>'
      + '<button type="button" data-vera-lote="ontem" style="padding:8px 10px;border:1px solid #cfe0d4;border-radius:8px;font:700 11px inherit;cursor:pointer;">30/06 · 23</button>'
      + '<button type="button" data-vera-lote="hoje" style="padding:8px 10px;border:1px solid #cfe0d4;border-radius:8px;font:700 11px inherit;cursor:pointer;">01/07 · 48</button>'
      + '</div>'
      + '<div id="vera-historico-status" style="margin-top:9px;font-size:11px;line-height:1.35;color:#577062;">Selecione um lote para carregar no mapa.</div>';

    var container = mapa.parentElement;
    container.insertBefore(painel, mapa);
    estado.painel = painel;

    painel.querySelectorAll('[data-vera-lote]').forEach(function (botao) {
      botao.addEventListener('click', function () {
        estado.modo = botao.getAttribute('data-vera-lote');
        atualizarBotoes();
        mostrarNoMapa();
      });
    });

    atualizarBotoes();
  }

  function instalar() {
    if (!document.getElementById('admin-map') || !window.L || !window.adminMap) {
      setTimeout(instalar, 350);
      return;
    }
    criarPainel();
  }

  document.addEventListener('click', function (evento) {
    var alvo = evento.target && evento.target.closest ? evento.target.closest('button') : null;
    if (!alvo || !estado.painel) return;
    if (!/^atualizar$/i.test(String(alvo.textContent || '').trim())) return;
    setTimeout(function () {
      if (estado.modo !== 'atual' && estado.carregado) mostrarNoMapa();
    }, 700);
  }, true);

  instalar();
})();
