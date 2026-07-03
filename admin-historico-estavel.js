(function () {
  'use strict';

  if (window.__veraHistoricoAdminEstavel) return;
  window.__veraHistoricoAdminEstavel = true;

  var REPO = 'LGRSV/vera-vegetacao';
  var ARQUIVO_INDICE = 'backups/historico-enecol-centro.json';
  var LOTES = [];
  var CORES = ['#2467a8', '#2e8b57', '#a85524', '#6a4fa8', '#a82467', '#24a89b', '#8ba824'];

  function esc(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>'"]/g, function (caractere) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[caractere];
    });
  }

  function raw(ref, caminho) {
    return 'https://raw.githubusercontent.com/' + REPO + '/' + ref + '/' + caminho;
  }

  function normalizarLotes(indice) {
    var entrada = Array.isArray(indice) ? indice : (indice && Array.isArray(indice.lotes) ? indice.lotes : []);

    return entrada.map(function (lote) {
      var arquivos = Array.isArray(lote && lote.arquivos) ? lote.arquivos.filter(function (caminho) {
        return typeof caminho === 'string' && /\.json$/i.test(caminho);
      }) : [];

      return {
        chave: String((lote && lote.chave) || (lote && lote.data) || ''),
        titulo: String((lote && lote.titulo) || (lote && lote.data) || 'Lote sem data'),
        data: String((lote && lote.data) || ''),
        branch: String((lote && lote.branch) || ''),
        ref: String((lote && (lote.ref || lote.branch)) || ''),
        arquivos: arquivos
      };
    }).filter(function (lote) {
      return lote.chave && lote.branch && lote.ref && lote.arquivos.length;
    }).sort(function (a, b) {
      return a.data.localeCompare(b.data);
    }).map(function (lote, indiceLote) {
      lote.cor = CORES[indiceLote % CORES.length];
      return lote;
    });
  }

  async function descobrirLotes(forcar) {
    if (LOTES.length && !forcar) return LOTES;

    var resposta = await fetch(raw('main', ARQUIVO_INDICE) + '?t=' + Date.now(), { cache: 'no-store' });
    if (!resposta.ok) throw new Error('Não foi possível carregar o índice preservado (HTTP ' + resposta.status + ')');

    var indice = await resposta.json();
    var lotes = normalizarLotes(indice);
    if (!lotes.length) throw new Error('Nenhum lote preservado foi encontrado no índice');

    LOTES = lotes;
    return LOTES;
  }

  var estado = {
    carregando: false,
    carregado: false,
    registros: [],
    falhas: [],
    modo: 'todos',
    camada: null,
    mapa: null,
    painel: null,
    marcadores: {}
  };

  function chaveRegistro(registro) {
    return String(registro.lote && registro.lote.ref || '') + '|' + String(registro.caminho || '');
  }

  function coordenadasDoPonto(ponto) {
    var lat = Number(ponto && ponto.lat);
    var lon = Number(ponto && ponto.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon];

    var wkt = String((ponto && ponto.wkt) || '');
    var achado = wkt.match(/POINT\s*\(\s*([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)\s*\)/i);
    if (!achado) return null;

    lon = Number(achado[1]);
    lat = Number(achado[2]);
    return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
  }

  function dataDoPonto(ponto, lote) {
    var valor = String((ponto && ponto.data) || '');
    var achado = valor.match(/^(\d{2}\/\d{2}\/\d{4})/);
    return achado ? achado[1] : lote.titulo;
  }

  function idExibido(registro) {
    return dataDoPonto(registro.ponto, registro.lote).slice(0, 5) + ' · ' + String(registro.ponto.id || 'Sem ID');
  }

  function totalDoLote(chave) {
    return estado.registros.filter(function (registro) { return registro.lote.chave === chave; }).length;
  }

  function registrosDoModo() {
    if (estado.modo === 'todos') return estado.registros.slice();
    return estado.registros.filter(function (registro) { return registro.lote.chave === estado.modo; });
  }

  function ordenarRegistros(registros) {
    return registros.sort(function (a, b) {
      var da = String((a.ponto && a.ponto.data) || '');
      var db = String((b.ponto && b.ponto.data) || '');
      if (da !== db) return db.localeCompare(da, 'pt-BR');
      return String((b.ponto && b.ponto.id) || '').localeCompare(String((a.ponto && a.ponto.id) || ''), 'pt-BR', { numeric: true });
    });
  }

  function fotosDoRegistro(registro) {
    var ponto = registro.ponto || {};
    var fotos = Array.isArray(ponto.fotos_github) ? ponto.fotos_github.filter(Boolean) : [];

    if (!fotos.length && Array.isArray(ponto.fotos_ids)) {
      fotos = ponto.fotos_ids.filter(Boolean).map(function (id) {
        return 'fotos/Enecol-Centro/' + String(id) + '.jpg';
      });
    }

    return fotos.map(function (caminho) { return raw(registro.lote.ref, caminho); });
  }

  function campoFicha(rotulo, valor) {
    return '<div style="padding:6px 0;border-bottom:1px solid #e2ece5;">'
      + '<div style="font-size:9px;font-weight:800;letter-spacing:.04em;color:#687c70;text-transform:uppercase;">' + esc(rotulo) + '</div>'
      + '<div style="font-size:12px;line-height:1.3;color:#17372a;word-break:break-word;">' + esc(valor || '—') + '</div>'
      + '</div>';
  }

  function popup(registro) {
    var ponto = registro.ponto || {};
    var fotos = fotosDoRegistro(registro);
    var coordenadas = coordenadasDoPonto(ponto);
    var imagens = fotos.map(function (url, indice) {
      return '<a href="' + esc(url) + '" target="_blank" rel="noopener" style="display:inline-block;width:31%;margin-right:1%;margin-bottom:7px;vertical-align:top;text-decoration:none;">'
        + '<img src="' + esc(url) + '" alt="Foto ' + (indice + 1) + ' do ponto ' + esc(ponto.id || '') + '" loading="lazy" style="display:block;width:100%;height:86px;object-fit:cover;border-radius:7px;background:#edf2ef;">'
        + '<span style="display:block;margin-top:3px;font-size:9px;line-height:1.2;color:#526b5c;">Abrir foto ' + (indice + 1) + '</span></a>';
    }).join('');

    var ficha = ''
      + campoFicha('Espécie', ponto.especie)
      + campoFicha('Poste', ponto.poste)
      + campoFicha('Data e hora', ponto.data)
      + campoFicha('Área', ponto.area)
      + campoFicha('Altura', ponto.altura ? String(ponto.altura) + ' m' : '')
      + campoFicha('Acesso', ponto.acesso)
      + campoFicha('DAP', ponto.dap)
      + campoFicha('Distância BT', ponto.dtbt ? String(ponto.dtbt) + ' m' : '')
      + campoFicha('Distância MT', ponto.dtmt ? String(ponto.dtmt) + ' m' : '')
      + campoFicha('Distância AT', ponto.dtat ? String(ponto.dtat) + ' m' : '')
      + campoFicha('Equipe', ponto.usuario)
      + campoFicha('Projeto', ponto.projeto)
      + campoFicha('Coordenadas', coordenadas ? coordenadas[0].toFixed(6) + ', ' + coordenadas[1].toFixed(6) : '');

    return '<div style="min-width:250px;max-width:340px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#17372a;">'
      + '<div style="font-size:10px;font-weight:800;letter-spacing:.04em;color:' + esc(registro.lote.cor) + ';">HISTÓRICO PRESERVADO · ' + esc(registro.lote.titulo) + '</div>'
      + '<div style="margin:4px 0 9px;font-size:17px;font-weight:800;">' + esc(idExibido(registro)) + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px;margin-bottom:10px;">' + ficha + '</div>'
      + '<div style="font-size:11px;font-weight:800;margin:8px 0 5px;">Fotos do ponto (' + fotos.length + ')</div>'
      + (imagens || '<div style="font-size:11px;line-height:1.35;color:#9b4f38;">Nenhuma foto foi localizada neste registro.</div>')
      + '</div>';
  }

  function obterMapa() {
    if (window.adminMap && window.L && window.adminMap instanceof window.L.Map) return window.adminMap;
    return null;
  }

  function status(texto) {
    var campo = document.getElementById('vera-historico-admin-status');
    if (campo) campo.textContent = texto;
  }

  function removerMarcadoresLegados(mapa) {
    var remover = [];
    mapa.eachLayer(function (camada) {
      if (camada && camada.__veraPontoEnecolPadronizado && !camada.__veraHistoricoEstavel) remover.push(camada);
    });
    remover.forEach(function (camada) { mapa.removeLayer(camada); });
  }

  async function listarArquivosDoLote(lote) {
    var resultados = await Promise.allSettled(lote.arquivos.map(function (caminho) {
      var url = raw(lote.ref, caminho) + '?t=' + Date.now();
      return fetch(url, { cache: 'no-store' })
        .then(function (respostaArquivo) {
          if (!respostaArquivo.ok) throw new Error(caminho.split('/').pop() + ' · HTTP ' + respostaArquivo.status);
          return respostaArquivo.json();
        })
        .then(function (ponto) { return { lote: lote, ponto: ponto, caminho: caminho }; });
    }));

    var bons = [];
    resultados.forEach(function (resultado) {
      if (resultado.status === 'fulfilled') bons.push(resultado.value);
      else estado.falhas.push(String(resultado.reason && resultado.reason.message ? resultado.reason.message : resultado.reason || 'falha sem detalhe'));
    });
    return bons;
  }

  async function carregar(forcar) {
    if (estado.carregando) return estado.registros;
    if (estado.carregado && !forcar) return estado.registros;

    estado.carregando = true;
    estado.falhas = [];
    status('Lendo os lotes preservados…');

    try {
      await descobrirLotes(forcar);
      var grupos = await Promise.all(LOTES.map(listarArquivosDoLote));
      var todos = [].concat.apply([], grupos);
      var vistos = {};
      var unicos = [];

      todos.forEach(function (registro) {
        var chave = chaveRegistro(registro);
        if (vistos[chave]) return;
        vistos[chave] = true;
        unicos.push(registro);
      });

      estado.registros = ordenarRegistros(unicos);
      estado.carregado = true;
      return estado.registros;
    } catch (erro) {
      estado.carregado = false;
      throw erro;
    } finally {
      estado.carregando = false;
    }
  }

  function criarIcone(cor, texto) {
    return window.L.divIcon({
      className: 'vera-historico-estavel-icone',
      html: '<div style="width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:' + esc(cor) + ';border:3px solid #fff;color:#fff;font:800 12px/1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;box-shadow:0 1px 5px rgba(0,0,0,.30);">' + esc(texto) + '</div>',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -17],
      tooltipAnchor: [0, -17]
    });
  }

  function focarRegistro(registro) {
    var mapa = obterMapa();
    var marcador = estado.marcadores[chaveRegistro(registro)];
    var coordenadas = coordenadasDoPonto(registro.ponto || {});

    if (mapa && coordenadas) mapa.setView(coordenadas, Math.max(mapa.getZoom(), 16), { animate: true });
    if (marcador) marcador.openPopup();
  }

  function atualizarLista() {
    var lista = document.getElementById('vera-historico-lista');
    if (!lista) return;

    var ativos = registrosDoModo();
    if (!ativos.length) {
      lista.innerHTML = '<div style="font-size:11px;color:#64766c;">Nenhum ponto disponível neste lote.</div>';
      return;
    }

    lista.innerHTML = ativos.map(function (registro) {
      var ponto = registro.ponto || {};
      return '<button type="button" data-vera-historico-registro="' + esc(chaveRegistro(registro)) + '" '
        + 'style="display:block;width:100%;padding:8px 9px;margin:0 0 6px;text-align:left;border:1px solid #c7dfce;border-radius:8px;background:#fff;color:#17372a;font:inherit;cursor:pointer;">'
        + '<b style="display:block;font-size:11px;">' + esc(idExibido(registro)) + '</b>'
        + '<span style="display:block;margin-top:2px;font-size:10px;color:#607467;">' + esc(ponto.poste ? 'Poste ' + ponto.poste + ' · ' : '') + 'Dados e fotos</span>'
        + '</button>';
    }).join('');

    lista.querySelectorAll('[data-vera-historico-registro]').forEach(function (botao) {
      botao.addEventListener('click', function () {
        var chave = botao.getAttribute('data-vera-historico-registro');
        var registro = estado.registros.filter(function (item) { return chaveRegistro(item) === chave; })[0];
        if (registro) focarRegistro(registro);
      });
    });
  }

  async function desenhar(manterEnquadramento) {
    var mapa = obterMapa();
    if (!mapa || !window.L) return;

    try {
      await carregar(false);
      if (!estado.camada || estado.mapa !== mapa) {
        estado.mapa = mapa;
        estado.camada = window.L.layerGroup().addTo(mapa);
      }

      removerMarcadoresLegados(mapa);
      estado.camada.clearLayers();
      estado.marcadores = {};

      var ativos = registrosDoModo();
      var limites = [];
      ativos.forEach(function (registro) {
        var coordenadas = coordenadasDoPonto(registro.ponto || {});
        if (!coordenadas) {
          estado.falhas.push(String((registro.ponto && registro.ponto.id) || 'Sem ID') + ' · coordenadas inválidas');
          return;
        }

        var marcador = window.L.marker(coordenadas, {
          icon: criarIcone(registro.lote.cor, 'H'),
          title: idExibido(registro),
          riseOnHover: true,
          keyboard: true
        });

        marcador.__veraHistoricoEstavel = true;
        marcador.bindTooltip(idExibido(registro) + ' · tocar para abrir', { direction: 'top', offset: [0, -17], opacity: 0.96 });
        marcador.bindPopup(popup(registro), { maxWidth: 360, minWidth: 250, autoPanPadding: [22, 22] });
        marcador.on('click', function () { marcador.openPopup(); });
        marcador.on('keypress', function (evento) {
          if (evento && (evento.originalEvent && evento.originalEvent.key === 'Enter')) marcador.openPopup();
        });
        marcador.addTo(estado.camada);

        estado.marcadores[chaveRegistro(registro)] = marcador;
        limites.push(coordenadas);
      });

      atualizarBotoes();
      atualizarLista();

      var total = document.getElementById('vera-historico-total');
      if (total) total.textContent = estado.registros.length + ' pontos';

      var falha = estado.falhas.length ? ' · ' + estado.falhas.length + ' arquivo(s) não puderam ser lidos.' : '';
      status(ativos.length + ' ponto(s) exibido(s)' + falha + ' Toque no marcador ou na lista para abrir dados e fotos.');

      var info = document.getElementById('admin-map-info');
      if (info) info.textContent = 'Histórico Enecol Centro — ' + ativos.length + ' ponto(s) exibido(s).';

      if (!manterEnquadramento && limites.length) {
        mapa.fitBounds(window.L.latLngBounds(limites), { padding: [28, 28], maxZoom: 15 });
      }
    } catch (erro) {
      status('Falha ao carregar o histórico: ' + String(erro && erro.message ? erro.message : erro) + '. Toque em Atualizar histórico para tentar novamente.');
      console.warn('VERA: histórico admin', erro);
    }
  }

  async function atualizarHistorico() {
    estado.carregado = false;
    estado.registros = [];
    LOTES = [];
    status('Atualizando o índice e os pontos preservados…');

    try {
      await carregar(true);
      atualizarBotoes();
      await desenhar(true);
    } catch (erro) {
      status('Falha ao atualizar: ' + String(erro && erro.message ? erro.message : erro));
    }
  }

  async function rotaMaisPontos() {
    status('Carregando a rota ativa e os pontos preservados…');
    try {
      if (typeof window.visualizarRota === 'function') {
        var rotaId = '1782688959998';
        try {
          var resposta = await fetch(raw('main', 'estado-equipes.json') + '?t=' + Date.now(), { cache: 'no-store' });
          if (resposta.ok) {
            var estadoEquipes = await resposta.json();
            var equipe = estadoEquipes && estadoEquipes.equipes && estadoEquipes.equipes['Enecol Centro'];
            if (equipe && equipe.projetoAtivo && equipe.projetoAtivo.rotaId) rotaId = String(equipe.projetoAtivo.rotaId);
          }
        } catch (erroEstado) {}
        await window.visualizarRota(rotaId);
      }
      await desenhar(true);
    } catch (erro) {
      status('Não foi possível carregar rota e pontos: ' + String(erro && erro.message ? erro.message : erro));
    }
  }

  function atualizarBotoes() {
    if (!estado.painel) return;
    var wrap = document.getElementById('vera-historico-chips');
    if (!wrap) return;

    var chips = [{ chave: 'todos', rotulo: 'Todos · ' + estado.registros.length }];
    LOTES.forEach(function (lote) {
      chips.push({ chave: lote.chave, rotulo: lote.titulo + ' · ' + totalDoLote(lote.chave) });
    });

    wrap.innerHTML = chips.map(function (chip) {
      var ativo = chip.chave === estado.modo;
      return '<button type="button" data-vera-historico-lote="' + esc(chip.chave) + '" style="padding:8px 10px;'
        + 'border:1px solid ' + (ativo ? '#163d2a' : '#c7dfce') + ';border-radius:8px;'
        + 'background:' + (ativo ? '#163d2a' : '#fff') + ';color:' + (ativo ? '#fff' : '#1f4933') + ';'
        + 'font:700 11px inherit;cursor:pointer;">' + esc(chip.rotulo) + '</button>';
    }).join('');

    wrap.querySelectorAll('[data-vera-historico-lote]').forEach(function (botao) {
      botao.addEventListener('click', function () {
        estado.modo = botao.getAttribute('data-vera-historico-lote');
        atualizarBotoes();
        desenhar(false);
      });
    });
  }

  function montarPainel() {
    var mapa = obterMapa();
    var elementoMapa = document.getElementById('admin-map');
    if (!mapa || !elementoMapa) return false;

    var painel = document.getElementById('vera-historico-admin');
    if (!painel) {
      painel = document.createElement('section');
      painel.id = 'vera-historico-admin';
      elementoMapa.parentElement.insertBefore(painel, elementoMapa);
    }

    painel.style.cssText = 'margin:8px 0 12px;padding:12px;border:1px solid #c9dfce;border-radius:12px;background:#f8fbf8;';
    painel.innerHTML = '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">'
      + '<div><div style="font-size:13px;font-weight:800;color:#173b2b;">Histórico Enecol Centro</div>'
      + '<div style="font-size:11px;line-height:1.35;color:#5e7666;margin-top:3px;">Cada ponto abre uma ficha com dados técnicos e fotos preservadas.</div></div>'
      + '<b id="vera-historico-total" style="font-size:11px;color:#173b2b;white-space:nowrap;">Carregando…</b></div>'
      + '<div id="vera-historico-chips" style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px;"></div>'
      + '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:7px;">'
      + '<button type="button" id="vera-historico-atualizar" style="padding:8px 10px;border:1px solid #b9d2bf;border-radius:8px;background:#fff;color:#173b2b;font:700 11px inherit;cursor:pointer;">↻ Atualizar histórico</button>'
      + '<button type="button" id="vera-historico-rota" style="padding:8px 10px;border:1px solid #163d2a;border-radius:8px;background:#163d2a;color:#fff;font:700 11px inherit;cursor:pointer;">Rota + pontos</button>'
      + '</div>'
      + '<details style="margin-top:10px;border-top:1px solid #dbe8df;padding-top:9px;">'
      + '<summary style="font-size:11px;font-weight:800;color:#173b2b;cursor:pointer;">Abrir lista de pontos</summary>'
      + '<div id="vera-historico-lista" style="max-height:245px;overflow:auto;margin-top:8px;"></div>'
      + '</details>'
      + '<div id="vera-historico-admin-status" style="margin-top:9px;font-size:11px;line-height:1.35;color:#577062;">Preparando histórico…</div>';

    estado.painel = painel;
    var atualizar = document.getElementById('vera-historico-atualizar');
    if (atualizar) atualizar.addEventListener('click', atualizarHistorico);
    var rota = document.getElementById('vera-historico-rota');
    if (rota) rota.addEventListener('click', rotaMaisPontos);

    atualizarBotoes();
    atualizarLista();
    return true;
  }

  function removerPainelLegado() {
    var legado = document.getElementById('vera-historico-lotes');
    if (legado && legado.parentNode) legado.parentNode.removeChild(legado);
  }

  function iniciar() {
    if (!montarPainel()) {
      setTimeout(iniciar, 300);
      return;
    }
    removerPainelLegado();
    setTimeout(function () { desenhar(false); }, 350);
    setTimeout(function () { desenhar(true); }, 1200);
  }

  var observador = new MutationObserver(function () {
    removerPainelLegado();
    if (!estado.painel || !document.body.contains(estado.painel)) iniciar();
  });
  observador.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('click', function (evento) {
    var alvo = evento.target && evento.target.closest ? evento.target.closest('button') : null;
    if (!alvo || !/^atualizar$/i.test(String(alvo.textContent || '').trim())) return;
    setTimeout(function () { desenhar(true); }, 600);
  }, true);

  iniciar();
})();
