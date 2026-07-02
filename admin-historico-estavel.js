(function () {
  'use strict';

  if (window.__veraHistoricoAdminEstavel) return;
  window.__veraHistoricoAdminEstavel = true;

  var REPO = 'LGRSV/vera-vegetacao';
  var LOTES = [
    { chave: '30-06', titulo: '30/06/2026', branch: 'backup/enecol-centro-2026-06-30', cor: '#2467a8' },
    { chave: '01-07', titulo: '01/07/2026', branch: 'backup/enecol-centro-2026-07-01-48-pontos', cor: '#2e8b57' }
  ];

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

  function esc(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>'"]/g, function (caractere) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[caractere];
    });
  }

  function raw(ref, caminho) {
    return 'https://raw.githubusercontent.com/' + REPO + '/' + ref + '/' + caminho;
  }

  function api(ref) {
    return 'https://api.github.com/repos/' + REPO + '/contents/dados/Enecol-Centro?ref=' + encodeURIComponent(ref) + '&t=' + Date.now();
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
    var resposta = await fetch(api(lote.branch), {
      cache: 'no-store',
      headers: { 'Accept': 'application/vnd.github+json' }
    });
    if (!resposta.ok) throw new Error(lote.titulo + ' · índice HTTP ' + resposta.status);

    var itens = await resposta.json();
    if (!Array.isArray(itens)) throw new Error(lote.titulo + ' · índice inválido');

    var arquivos = itens.filter(function (item) {
      return item && item.type === 'file' && /\.json$/i.test(item.name || '');
    }).sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { numeric: true });
    });

    var resultados = await Promise.allSettled(arquivos.map(function (arquivo) {
      var url = arquivo.download_url || raw(lote.branch, arquivo.path);
      return fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' })
        .then(function (respostaArquivo) {
          if (!respostaArquivo.ok) throw new Error(arquivo.name + ' · HTTP ' + respostaArquivo.status);
          return respostaArquivo.json();
        })
        .then(function (ponto) {
          return { lote: lote, ponto: ponto, caminho: arquivo.path };
        });
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
    status('Lendo os lotes preservados diretamente dos backups…');

    try {
      var grupos = await Promise.all(LOTES.map(listarArquivosDoLote));
      estado.registros = ordenarRegistros([].concat.apply([], grupos));
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

      if (!manterEnquadramento && limites.length) {
        mapa.fitBounds(window.L.latLngBounds(limites), { padding: [28, 28], maxZoom: 15 });
      }

      var total = document.getElementById('vera-historico-total');
      if (total) total.textContent = estado.registros.length + ' pontos';
      var falha = estado.falhas.length ? ' · ' + estado.falhas.length + ' arquivo(s) não puderam ser lidos.' : '';
      status(ativos.length + ' ponto(s) exibido(s)' + falha + ' Toque em um marcador para abrir dados e fotos.');

      var info = document.getElementById('admin-map-info');
      if (info) info.textContent = 'Histórico Enecol Centro — ' + ativos.length + ' ponto(s) exibido(s).';
    } catch (erro) {
      status('Falha ao carregar o histórico: ' + String(erro && erro.message ? erro.message : erro) + '. Toque em Atualizar histórico para tentar novamente.');
      console.warn('VERA: histórico admin', erro);
    }
  }

  async function atualizarHistorico() {
    estado.carregado = false;
    estado.registros = [];
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
    estado.painel.querySelectorAll('[data-vera-historico-lote]').forEach(function (botao) {
      var ativo = botao.getAttribute('data-vera-historico-lote') === estado.modo;
      botao.style.background = ativo ? '#163d2a' : '#fff';
      botao.style.color = ativo ? '#fff' : '#1f4933';
      botao.style.borderColor = ativo ? '#163d2a' : '#c7dfce';
    });

    var todos = estado.painel.querySelector('[data-vera-historico-lote="todos"]');
    var primeiro = estado.painel.querySelector('[data-vera-historico-lote="30-06"]');
    var segundo = estado.painel.querySelector('[data-vera-historico-lote="01-07"]');
    if (todos) todos.textContent = 'Todos · ' + estado.registros.length;
    if (primeiro) primeiro.textContent = '30/06 · ' + totalDoLote('30-06');
    if (segundo) segundo.textContent = '01/07 · ' + totalDoLote('01-07');
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
      + '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px;">'
      + '<button type="button" data-vera-historico-lote="todos" style="padding:8px 10px;border:1px solid #c7dfce;border-radius:8px;font:700 11px inherit;cursor:pointer;">Todos</button>'
      + '<button type="button" data-vera-historico-lote="30-06" style="padding:8px 10px;border:1px solid #c7dfce;border-radius:8px;font:700 11px inherit;cursor:pointer;">30/06</button>'
      + '<button type="button" data-vera-historico-lote="01-07" style="padding:8px 10px;border:1px solid #c7dfce;border-radius:8px;font:700 11px inherit;cursor:pointer;">01/07</button>'
      + '<button type="button" id="vera-historico-atualizar" style="padding:8px 10px;border:1px solid #b9d2bf;border-radius:8px;background:#fff;color:#173b2b;font:700 11px inherit;cursor:pointer;">↻ Atualizar histórico</button>'
      + '<button type="button" id="vera-historico-rota" style="padding:8px 10px;border:1px solid #163d2a;border-radius:8px;background:#163d2a;color:#fff;font:700 11px inherit;cursor:pointer;">Rota + pontos</button>'
      + '</div><div id="vera-historico-admin-status" style="margin-top:9px;font-size:11px;line-height:1.35;color:#577062;">Preparando histórico…</div>';

    estado.painel = painel;

    painel.querySelectorAll('[data-vera-historico-lote]').forEach(function (botao) {
      botao.addEventListener('click', function () {
        estado.modo = botao.getAttribute('data-vera-historico-lote');
        atualizarBotoes();
        desenhar(false);
      });
    });
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
