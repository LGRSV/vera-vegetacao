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
        arquivos: arquivos
      };
    }).filter(function (lote) {
      return lote.chave && lote.branch && lote.arquivos.length;
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
    painel: null
  };

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
    return fotos.map(function (caminho) { return raw(registro.lote.branch, caminho); });
  }

  function popup(registro) {
    var ponto = registro.ponto || {};
    var fotos = fotosDoRegistro(registro);
    var imagens = fotos.map(function (url, indice) {
      return '<a href="' + esc(url) + '" target="_blank" rel="noopener" style="display:inline-block;width:31%;margin-right:1%;margin-bottom:7px;vertical-align:top;text-decoration:none;">'
        + '<img src="' + esc(url) + '" alt="Foto ' + (indice + 1) + '" style="display:block;width:100%;height:82px;object-fit:cover;border-radius:7px;background:#edf2ef;">'
        + '<span style="display:block;margin-top:3px;font-size:9px;line-height:1.2;color:#526b5c;">Foto ' + (indice + 1) + '</span></a>';
    }).join('');

    return '<div style="min-width:235px;max-width:335px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#17372a;">'
      + '<div style="font-size:11px;font-weight:800;letter-spacing:.04em;color:' + esc(registro.lote.cor) + ';">HISTÓRICO PRESERVADO · ' + esc(registro.lote.titulo) + '</div>'
      + '<div style="margin:4px 0 9px;font-size:17px;font-weight:800;">' + esc(idExibido(registro)) + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:11px;line-height:1.35;margin-bottom:9px;">'
      + '<div><b>Espécie</b><br>' + esc(ponto.especie || '—') + '</div>'
      + '<div><b>Poste</b><br>' + esc(ponto.poste || '—') + '</div>'
      + '<div><b>Data</b><br>' + esc(ponto.data || '—') + '</div>'
      + '<div><b>Área</b><br>' + esc(ponto.area || '—') + '</div>'
      + '<div><b>Altura</b><br>' + esc(ponto.altura || '—') + ' m</div>'
      + '<div><b>Acesso</b><br>' + esc(ponto.acesso || '—') + '</div>'
      + '</div>'
      + '<div style="font-size:11px;font-weight:800;margin-bottom:5px;">Fotos (' + fotos.length + ')</div>'
      + (imagens || '<div style="font-size:11px;color:#64766c;">Nenhuma foto preservada neste ponto.</div>')
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
      var url = raw(lote.branch, caminho) + '?t=' + Date.now();
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
        var chave = registro.lote.branch + '/' + String(registro.caminho || '');
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
      html: '<div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:' + esc(cor) + ';border:3px solid #fff;color:#fff;font:800 12px/1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;box-shadow:0 1px 5px rgba(0,0,0,.30);">' + esc(texto) + '</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -15],
      tooltipAnchor: [0, -15]
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

      var ativos = registrosDoModo();
      var limites = [];
      ativos.forEach(function (registro) {
        var ponto = registro.ponto || {};
        var lat = Number(ponto.lat);
        var lon = Number(ponto.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

        var marcador = window.L.marker([lat, lon], {
          icon: criarIcone(registro.lote.cor, 'H'),
          title: idExibido(registro),
          riseOnHover: true
        });
        marcador.__veraHistoricoEstavel = true;
        marcador.bindTooltip(idExibido(registro), { direction: 'top', offset: [0, -15], opacity: 0.96 });
        marcador.bindPopup(popup(registro), { maxWidth: 345 });
        marcador.addTo(estado.camada);
        limites.push([lat, lon]);
      });

      atualizarBotoes();
      var total = document.getElementById('vera-historico-total');
      if (total) total.textContent = estado.registros.length + ' pontos';

      var falha = estado.falhas.length ? ' · ' + estado.falhas.length + ' arquivo(s) não puderam ser lidos.' : '';
      status(ativos.length + ' ponto(s) exibido(s)' + falha + ' Toque em um marcador para abrir dados e fotos.');

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
      + '<div style="font-size:11px;line-height:1.35;color:#5e7666;margin-top:3px;">Lotes independentes, lidos diretamente dos backups. IDs repetidos não se sobrepõem.</div></div>'
      + '<b id="vera-historico-total" style="font-size:11px;color:#173b2b;white-space:nowrap;">Carregando…</b></div>'
      + '<div id="vera-historico-chips" style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px;"></div>'
      + '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:7px;">'
      + '<button type="button" id="vera-historico-atualizar" style="padding:8px 10px;border:1px solid #b9d2bf;border-radius:8px;background:#fff;color:#173b2b;font:700 11px inherit;cursor:pointer;">↻ Atualizar histórico</button>'
      + '<button type="button" id="vera-historico-rota" style="padding:8px 10px;border:1px solid #163d2a;border-radius:8px;background:#163d2a;color:#fff;font:700 11px inherit;cursor:pointer;">Rota + pontos</button>'
      + '</div><div id="vera-historico-admin-status" style="margin-top:9px;font-size:11px;line-height:1.35;color:#577062;">Preparando histórico…</div>';

    estado.painel = painel;
    var atualizar = document.getElementById('vera-historico-atualizar');
    if (atualizar) atualizar.addEventListener('click', atualizarHistorico);
    var rota = document.getElementById('vera-historico-rota');
    if (rota) rota.addEventListener('click', rotaMaisPontos);

    atualizarBotoes();
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
