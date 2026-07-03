(function () {
  'use strict';

  if (window.__veraHistoricoCompleto) return;
  window.__veraHistoricoCompleto = true;

  var REPO = 'LGRSV/vera-vegetacao';
  var PASTA = 'dados/Enecol-Centro/';
  var CORES = ['#2467a8', '#2e8b57', '#a85524', '#6a4fa8', '#a82467', '#24a89b', '#8ba824'];
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

  function esc(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>'"]/g, function (caractere) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[caractere];
    });
  }

  function raw(caminho) {
    return 'https://raw.githubusercontent.com/' + REPO + '/main/' + caminho;
  }

  function status(texto) {
    var campo = document.getElementById('vera-historico-completo-status');
    if (campo) campo.textContent = texto;
  }

  function obterMapa() {
    if (window.adminMap && window.L && window.adminMap instanceof window.L.Map) return window.adminMap;
    return null;
  }

  function chaveRegistro(registro) {
    return String(registro.caminho || registro.ponto && registro.ponto.id || '');
  }

  function coordenadasDoPonto(ponto) {
    var lat = Number(ponto && ponto.lat);
    var lon = Number(ponto && ponto.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon];

    var wkt = String(ponto && ponto.wkt || '');
    var achado = wkt.match(/POINT\s*\(\s*([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)\s*\)/i);
    if (!achado) return null;
    lon = Number(achado[1]);
    lat = Number(achado[2]);
    return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
  }

  function dataDoPonto(ponto) {
    var valor = String(ponto && ponto.data || '');
    var achado = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (!achado) return { chave: 'sem-data', titulo: 'Sem data', ordem: '00000000' };
    return { chave: achado[1] + '-' + achado[2], titulo: achado[1] + '/' + achado[2] + '/' + achado[3], ordem: achado[3] + achado[2] + achado[1] };
  }

  function idExibido(registro) {
    var data = dataDoPonto(registro.ponto).titulo;
    return data.slice(0, 5) + ' · ' + String(registro.ponto && registro.ponto.id || 'Sem ID');
  }

  function fotosDoRegistro(registro) {
    var ponto = registro.ponto || {};
    var fotos = Array.isArray(ponto.fotos_github) ? ponto.fotos_github.filter(Boolean) : [];
    if (!fotos.length && Array.isArray(ponto.fotos_ids)) {
      fotos = ponto.fotos_ids.filter(Boolean).map(function (id) {
        return 'fotos/Enecol-Centro/' + String(id) + '.jpg';
      });
    }
    return fotos.map(raw);
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
      + '<div style="font-size:10px;font-weight:800;letter-spacing:.04em;color:' + esc(registro.cor) + ';">HISTÓRICO PRESERVADO · ' + esc(dataDoPonto(ponto).titulo) + '</div>'
      + '<div style="margin:4px 0 9px;font-size:17px;font-weight:800;">' + esc(idExibido(registro)) + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px;margin-bottom:10px;">' + ficha + '</div>'
      + '<div style="font-size:11px;font-weight:800;margin:8px 0 5px;">Fotos do ponto (' + fotos.length + ')</div>'
      + (imagens || '<div style="font-size:11px;line-height:1.35;color:#9b4f38;">Nenhuma foto foi localizada neste registro.</div>')
      + '</div>';
  }

  async function caminhosViaCdn() {
    var url = 'https://data.jsdelivr.com/v1/package/gh/' + REPO + '@main/flat?t=' + Date.now();
    var resposta = await fetch(url, { cache: 'no-store' });
    if (!resposta.ok) throw new Error('Índice público HTTP ' + resposta.status);
    var pacote = await resposta.json();
    var arquivos = Array.isArray(pacote && pacote.files) ? pacote.files : [];
    return arquivos.map(function (arquivo) { return String(arquivo && arquivo.name || '').replace(/^\//, ''); })
      .filter(function (caminho) { return caminho.indexOf(PASTA) === 0 && /\.json$/i.test(caminho); })
      .sort(function (a, b) { return a.localeCompare(b, 'pt-BR', { numeric: true }); });
  }

  async function caminhosViaGitHub() {
    var url = 'https://api.github.com/repos/' + REPO + '/contents/' + PASTA + '?ref=main&t=' + Date.now();
    var resposta = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
    if (!resposta.ok) throw new Error('GitHub HTTP ' + resposta.status);
    var arquivos = await resposta.json();
    return (Array.isArray(arquivos) ? arquivos : []).map(function (arquivo) { return String(arquivo && arquivo.path || ''); })
      .filter(function (caminho) { return caminho.indexOf(PASTA) === 0 && /\.json$/i.test(caminho); })
      .sort(function (a, b) { return a.localeCompare(b, 'pt-BR', { numeric: true }); });
  }

  async function caminhosFallback() {
    var resposta = await fetch(raw('backups/historico-enecol-centro.json') + '?t=' + Date.now(), { cache: 'no-store' });
    if (!resposta.ok) throw new Error('Backup estático HTTP ' + resposta.status);
    var indice = await resposta.json();
    var lotes = Array.isArray(indice && indice.lotes) ? indice.lotes : [];
    return lotes.reduce(function (todos, lote) {
      return todos.concat(Array.isArray(lote && lote.arquivos) ? lote.arquivos : []);
    }, []);
  }

  async function descobrirCaminhos() {
    var falhas = [];
    try {
      var cdn = await caminhosViaCdn();
      if (cdn.length) return cdn;
      falhas.push('índice público sem arquivos');
    } catch (erroCdn) { falhas.push(String(erroCdn.message || erroCdn)); }

    try {
      var api = await caminhosViaGitHub();
      if (api.length) return api;
      falhas.push('GitHub sem arquivos');
    } catch (erroApi) { falhas.push(String(erroApi.message || erroApi)); }

    try { return await caminhosFallback(); }
    catch (erroFallback) { throw new Error('Não foi possível listar o histórico (' + falhas.join(' · ') + ' · ' + String(erroFallback.message || erroFallback) + ')'); }
  }

  async function emLotes(itens, tamanho, tarefa) {
    var saida = [];
    for (var inicio = 0; inicio < itens.length; inicio += tamanho) {
      var grupo = itens.slice(inicio, inicio + tamanho);
      var resultado = await Promise.allSettled(grupo.map(tarefa));
      resultado.forEach(function (item) { saida.push(item); });
    }
    return saida;
  }

  async function carregar(forcar) {
    if (estado.carregando) return estado.registros;
    if (estado.carregado && !forcar) return estado.registros;

    estado.carregando = true;
    estado.falhas = [];
    status('Localizando todos os pontos preservados…');

    try {
      var caminhos = await descobrirCaminhos();
      status('Carregando ' + caminhos.length + ' ponto(s) preservado(s)…');
      var resultados = await emLotes(caminhos, 12, function (caminho) {
        return fetch(raw(caminho) + '?t=' + Date.now(), { cache: 'no-store' })
          .then(function (resposta) {
            if (!resposta.ok) throw new Error(caminho.split('/').pop() + ' · HTTP ' + resposta.status);
            return resposta.json();
          })
          .then(function (ponto) { return { caminho: caminho, ponto: ponto }; });
      });

      var vistos = {};
      var registros = [];
      resultados.forEach(function (resultado) {
        if (resultado.status !== 'fulfilled') {
          estado.falhas.push(String(resultado.reason && resultado.reason.message ? resultado.reason.message : resultado.reason || 'falha sem detalhe'));
          return;
        }
        var registro = resultado.value;
        var chave = chaveRegistro(registro);
        if (vistos[chave]) return;
        vistos[chave] = true;
        registros.push(registro);
      });

      registros.sort(function (a, b) {
        var da = String(a.ponto && a.ponto.data || '');
        var db = String(b.ponto && b.ponto.data || '');
        return db.localeCompare(da, 'pt-BR', { numeric: true });
      });

      var datas = {};
      registros.forEach(function (registro) { datas[dataDoPonto(registro.ponto).chave] = true; });
      Object.keys(datas).sort().forEach(function (chave, indice) { datas[chave] = CORES[indice % CORES.length]; });
      registros.forEach(function (registro) { registro.cor = datas[dataDoPonto(registro.ponto).chave] || CORES[0]; });

      estado.registros = registros;
      estado.carregado = true;
      return registros;
    } finally {
      estado.carregando = false;
    }
  }

  function registrosDoModo() {
    if (estado.modo === 'todos') return estado.registros.slice();
    return estado.registros.filter(function (registro) { return dataDoPonto(registro.ponto).chave === estado.modo; });
  }

  function siglaEquipe(usuario) {
    var SIGLAS = { 'Equipe Energisa': 'ENE', 'Enecol Norte': 'N', 'Enecol Centro': 'C', 'Enecol Sul': 'S' };
    return SIGLAS[usuario] || (usuario ? usuario.charAt(0).toUpperCase() : 'C');
  }

  function criarIcone(cor, sigla) {
    return window.L.divIcon({
      className: 'vera-historico-completo-icone',
      html: '<div style="width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:' + esc(cor) + ';border:3px solid #fff;color:#fff;font:800 12px/1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;box-shadow:0 1px 5px rgba(0,0,0,.30);">' + esc(sigla || 'C') + '</div>',
      iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -17], tooltipAnchor: [0, -17]
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
    var lista = document.getElementById('vera-historico-completo-lista');
    if (!lista) return;
    var ativos = registrosDoModo();
    lista.innerHTML = ativos.map(function (registro) {
      var ponto = registro.ponto || {};
      return '<button type="button" data-vera-historico-registro="' + esc(chaveRegistro(registro)) + '" style="display:block;width:100%;padding:8px 9px;margin:0 0 6px;text-align:left;border:1px solid #c7dfce;border-radius:8px;background:#fff;color:#17372a;font:inherit;cursor:pointer;">'
        + '<b style="display:block;font-size:11px;">' + esc(idExibido(registro)) + '</b>'
        + '<span style="display:block;margin-top:2px;font-size:10px;color:#607467;">' + esc(ponto.poste ? 'Poste ' + ponto.poste + ' · ' : '') + 'Dados e fotos</span></button>';
    }).join('') || '<div style="font-size:11px;color:#64766c;">Nenhum ponto disponível neste filtro.</div>';

    lista.querySelectorAll('[data-vera-historico-registro]').forEach(function (botao) {
      botao.addEventListener('click', function () {
        var chave = botao.getAttribute('data-vera-historico-registro');
        var registro = estado.registros.filter(function (item) { return chaveRegistro(item) === chave; })[0];
        if (registro) focarRegistro(registro);
      });
    });
  }

  function atualizarBotoes() {
    var wrap = document.getElementById('vera-historico-completo-chips');
    if (!wrap) return;
    var contagens = {};
    estado.registros.forEach(function (registro) {
      var data = dataDoPonto(registro.ponto);
      contagens[data.chave] = { titulo: data.titulo, total: (contagens[data.chave] && contagens[data.chave].total || 0) + 1 };
    });
    var chips = [{ chave: 'todos', rotulo: 'Todos · ' + estado.registros.length }];
    Object.keys(contagens).sort().forEach(function (chave) { chips.push({ chave: chave, rotulo: contagens[chave].titulo + ' · ' + contagens[chave].total }); });

    wrap.innerHTML = chips.map(function (chip) {
      var ativo = chip.chave === estado.modo;
      return '<button type="button" data-vera-historico-lote="' + esc(chip.chave) + '" style="padding:8px 10px;border:1px solid ' + (ativo ? '#163d2a' : '#c7dfce') + ';border-radius:8px;background:' + (ativo ? '#163d2a' : '#fff') + ';color:' + (ativo ? '#fff' : '#1f4933') + ';font:700 11px inherit;cursor:pointer;">' + esc(chip.rotulo) + '</button>';
    }).join('');

    wrap.querySelectorAll('[data-vera-historico-lote]').forEach(function (botao) {
      botao.addEventListener('click', function () {
        estado.modo = botao.getAttribute('data-vera-historico-lote');
        atualizarBotoes();
        desenhar(false);
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
      estado.camada.clearLayers();
      estado.marcadores = {};

      var ativos = registrosDoModo();
      var limites = [];
      ativos.forEach(function (registro) {
        var coordenadas = coordenadasDoPonto(registro.ponto || {});
        if (!coordenadas) { estado.falhas.push(String(registro.ponto && registro.ponto.id || 'Sem ID') + ' · coordenadas inválidas'); return; }
        var marcador = window.L.marker(coordenadas, { icon: criarIcone(registro.cor, siglaEquipe((registro.ponto || {}).usuario)), title: idExibido(registro), riseOnHover: true });
        marcador.bindTooltip(idExibido(registro) + ' · tocar para abrir', { direction: 'top', offset: [0, -17], opacity: 0.96 });
        marcador.bindPopup(popup(registro), { maxWidth: 360, minWidth: 250, autoPanPadding: [22, 22] });
        marcador.on('click', function () { marcador.openPopup(); });
        marcador.addTo(estado.camada);
        estado.marcadores[chaveRegistro(registro)] = marcador;
        limites.push(coordenadas);
      });

      atualizarBotoes();
      atualizarLista();
      var total = document.getElementById('vera-historico-completo-total');
      if (total) total.textContent = estado.registros.length + ' pontos';
      var aviso = estado.falhas.length ? ' · ' + estado.falhas.length + ' arquivo(s) não puderam ser lidos.' : '';
      status(ativos.length + ' ponto(s) exibido(s)' + aviso + ' Toque no marcador ou na lista para abrir dados e fotos.');
      if (!manterEnquadramento && limites.length) mapa.fitBounds(window.L.latLngBounds(limites), { padding: [28, 28], maxZoom: 15 });
    } catch (erro) {
      status('Falha ao carregar o histórico: ' + String(erro && erro.message ? erro.message : erro) + '. Toque em Atualizar histórico para tentar novamente.');
      console.warn('VERA: histórico completo', erro);
    }
  }

  async function atualizarHistorico() {
    estado.carregado = false;
    estado.registros = [];
    estado.falhas = [];
    status('Atualizando todos os pontos preservados…');
    await desenhar(true);
  }

  function montarPainel() {
    var mapa = obterMapa();
    var elementoMapa = document.getElementById('admin-map');
    if (!mapa || !elementoMapa) return false;

    var anterior = document.getElementById('vera-historico-admin');
    if (anterior && anterior.parentNode) anterior.parentNode.removeChild(anterior);
    var painel = document.getElementById('vera-historico-completo');
    if (!painel) {
      painel = document.createElement('section');
      painel.id = 'vera-historico-completo';
      elementoMapa.parentElement.insertBefore(painel, elementoMapa);
    }

    painel.style.cssText = 'margin:8px 0 12px;padding:12px;border:1px solid #c9dfce;border-radius:12px;background:#f8fbf8;';
    painel.innerHTML = '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;"><div><div style="font-size:13px;font-weight:800;color:#173b2b;">Histórico Enecol Centro</div><div style="font-size:11px;line-height:1.35;color:#5e7666;margin-top:3px;">Base completa preservada. Cada ponto abre dados técnicos e fotos.</div></div><b id="vera-historico-completo-total" style="font-size:11px;color:#173b2b;white-space:nowrap;">Carregando…</b></div>'
      + '<div id="vera-historico-completo-chips" style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px;"></div>'
      + '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:7px;"><button type="button" id="vera-historico-completo-atualizar" style="padding:8px 10px;border:1px solid #b9d2bf;border-radius:8px;background:#fff;color:#173b2b;font:700 11px inherit;cursor:pointer;">↻ Atualizar histórico</button></div>'
      + '<details style="margin-top:10px;border-top:1px solid #dbe8df;padding-top:9px;"><summary style="font-size:11px;font-weight:800;color:#173b2b;cursor:pointer;">Abrir lista de pontos</summary><div id="vera-historico-completo-lista" style="max-height:245px;overflow:auto;margin-top:8px;"></div></details>'
      + '<div id="vera-historico-completo-status" style="margin-top:9px;font-size:11px;line-height:1.35;color:#577062;">Preparando histórico…</div>';

    estado.painel = painel;
    document.getElementById('vera-historico-completo-atualizar').addEventListener('click', atualizarHistorico);
    return true;
  }

  function iniciar() {
    if (!montarPainel()) { setTimeout(iniciar, 300); return; }
    setTimeout(function () { desenhar(false); }, 350);
  }

  new MutationObserver(function () {
    if (!estado.painel || !document.body.contains(estado.painel)) iniciar();
  }).observe(document.documentElement, { childList: true, subtree: true });

  iniciar();
})();
