(function () {
  'use strict';

  if (window.__veraMapaPontosCompartilhados) return;
  window.__veraMapaPontosCompartilhados = true;

  const REPO = 'LGRSV/vera-vegetacao';
  const PASTA_DADOS = 'dados';
  const SNAPSHOTS_ENECOL_CENTRO = [
    { chave: '30-06', rotulo: '30/06/2026', etiqueta: '30/06', branch: 'backup/enecol-centro-2026-06-30', quantidade: 23, cor: '#2467a8' },
    { chave: '01-07', rotulo: '01/07/2026', etiqueta: '01/07', branch: 'backup/enecol-centro-2026-07-01-48-pontos', quantidade: 48, cor: '#2e8b57' }
  ];

  const estado = {
    admin: { registros: [], carregando: false, camada: null, modo: 'todos' },
    tecnico: { chave: '', registros: [], carregando: false, camada: null, controle: null, mapa: null, ativo: true }
  };

  function esc(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>'"]/g, function (caractere) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[caractere];
    });
  }

  function pad(valor) {
    return String(valor).padStart(4, '0');
  }

  function pastaEquipe(equipe) {
    return String(equipe || '').trim().replace(/\s+/g, '-');
  }

  function raw(ref, caminho) {
    return 'https://raw.githubusercontent.com/' + REPO + '/' + ref + '/' + caminho;
  }

  function dataDoPonto(ponto) {
    const valor = String((ponto && ponto.data) || '');
    const achado = valor.match(/^(\d{2}\/\d{2}\/\d{4})/);
    return achado ? achado[1] : '';
  }

  function chavePonto(ponto) {
    return [ponto && ponto.data, ponto && ponto.poste, ponto && ponto.lat, ponto && ponto.lon].map(function (item) {
      return String(item == null ? '' : item);
    }).join('|');
  }

  function lotePorData(data) {
    if (String(data || '').indexOf('30/06/2026') === 0) return SNAPSHOTS_ENECOL_CENTRO[0];
    if (String(data || '').indexOf('01/07/2026') === 0) return SNAPSHOTS_ENECOL_CENTRO[1];
    return { chave: 'atual', rotulo: data || 'Atual', etiqueta: data ? data.slice(0, 5) : 'Atual', branch: 'main', quantidade: 0, cor: '#7b4db3' };
  }

  function idExibido(registro) {
    const etiqueta = (registro.lote && registro.lote.etiqueta) || dataDoPonto(registro.ponto).slice(0, 5) || 'Atual';
    return etiqueta + ' · ' + String(registro.ponto && registro.ponto.id ? registro.ponto.id : 'Sem ID');
  }

  function imagensDoRegistro(registro) {
    const ponto = registro.ponto || {};
    if (Array.isArray(ponto.photos) && ponto.photos.length) return ponto.photos.filter(Boolean);
    const fotosGithub = Array.isArray(ponto.fotos_github) ? ponto.fotos_github : [];
    const ref = (registro.lote && registro.lote.branch) || 'main';
    return fotosGithub.map(function (caminho) { return raw(ref, caminho); });
  }

  function popupDoRegistro(registro) {
    const ponto = registro.ponto || {};
    const fotos = imagensDoRegistro(registro);
    const imagens = fotos.map(function (url, indice) {
      const fotoId = (registro.lote && registro.lote.rotulo ? registro.lote.rotulo.replace(/\//g, '') : 'ATUAL') + ' · Foto ' + (indice + 1);
      return '<a href="' + esc(url) + '" target="_blank" rel="noopener" style="display:inline-block;width:31%;margin-right:1%;vertical-align:top;text-decoration:none;">'
        + '<img src="' + esc(url) + '" alt="' + esc(fotoId) + '" style="display:block;width:100%;height:82px;object-fit:cover;border-radius:7px;background:#eef3f0;">'
        + '<span style="display:block;margin-top:3px;font-size:8px;line-height:1.2;color:#526b5c;">' + esc(fotoId) + '</span></a>';
    }).join('');

    return '<div style="min-width:235px;max-width:330px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#183b2b;">'
      + '<div style="font-size:11px;font-weight:800;color:' + esc((registro.lote && registro.lote.cor) || '#2e8b57') + ';">REGISTRO · ' + esc((registro.lote && registro.lote.rotulo) || dataDoPonto(ponto) || 'Atual') + '</div>'
      + '<div style="font-size:17px;font-weight:800;margin:3px 0 9px;">' + esc(idExibido(registro)) + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;line-height:1.35;margin-bottom:9px;">'
      + '<div><b>Espécie</b><br>' + esc(ponto.especie || '—') + '</div>'
      + '<div><b>Poste</b><br>' + esc(ponto.poste || '—') + '</div>'
      + '<div><b>Data</b><br>' + esc(ponto.data || '—') + '</div>'
      + '<div><b>Altura</b><br>' + esc(ponto.altura || '—') + ' m</div>'
      + '</div>'
      + '<div style="font-size:11px;font-weight:800;margin-bottom:5px;">Fotos (' + fotos.length + ')</div>'
      + (imagens || '<div style="font-size:11px;color:#64766c;">Nenhuma foto disponível neste ponto.</div>')
      + '</div>';
  }

  function capturarMapasCriados() {
    if (!window.L || !window.L.map || window.__veraLeafletMapCapturado) return;
    window.__veraLeafletMapCapturado = true;
    const criarMapaOriginal = window.L.map;
    window.L.map = function () {
      const mapa = criarMapaOriginal.apply(this, arguments);
      const alvo = arguments[0];
      const elemento = typeof alvo === 'string' ? document.getElementById(alvo) : alvo;
      const id = elemento && elemento.id;
      if (id === 'map') window.__veraMapaCampo = mapa;
      if (id === 'admin-map') window.adminMap = mapa;
      return mapa;
    };
  }

  function mapaAdmin() {
    if (window.adminMap && window.L && window.adminMap instanceof window.L.Map) return window.adminMap;
    return null;
  }

  function mapaTecnico() {
    if (window.__veraMapaCampo && window.L && window.__veraMapaCampo instanceof window.L.Map) return window.__veraMapaCampo;
    if (window.map && window.L && window.map instanceof window.L.Map) return window.map;
    if (window.fieldMap && window.L && window.fieldMap instanceof window.L.Map) return window.fieldMap;
    return null;
  }

  async function carregarSnapshot(lote) {
    const tarefas = [];
    for (let numero = 1; numero <= lote.quantidade; numero++) {
      const caminho = 'dados/Enecol-Centro/V' + pad(numero) + '.json';
      tarefas.push(fetch(raw(lote.branch, caminho), { cache: 'no-store' })
        .then(function (resposta) {
          if (!resposta.ok) throw new Error(caminho + ' · HTTP ' + resposta.status);
          return resposta.json();
        })
        .then(function (ponto) { return { ponto: ponto, lote: lote, origem: 'snapshot' }; }));
    }
    const resultado = await Promise.allSettled(tarefas);
    return resultado.filter(function (item) { return item.status === 'fulfilled'; }).map(function (item) { return item.value; });
  }

  async function carregarHistoricoAdmin() {
    if (estado.admin.registros.length) return estado.admin.registros;
    if (estado.admin.carregando) return [];
    estado.admin.carregando = true;
    try {
      const grupos = await Promise.all(SNAPSHOTS_ENECOL_CENTRO.map(carregarSnapshot));
      estado.admin.registros = grupos[0].concat(grupos[1]);
      return estado.admin.registros;
    } finally {
      estado.admin.carregando = false;
    }
  }

  async function listarRegistrosAtuaisDaEquipe(equipe, projeto) {
    const pasta = pastaEquipe(equipe);
    if (!pasta) return [];

    try {
      const url = 'https://api.github.com/repos/' + REPO + '/contents/' + PASTA_DADOS + '/' + encodeURIComponent(pasta) + '?ref=main&t=' + Date.now();
      const resposta = await fetch(url, { cache: 'no-store' });
      if (!resposta.ok) return [];
      const arquivos = await resposta.json();
      if (!Array.isArray(arquivos)) return [];

      const tarefas = arquivos.filter(function (arquivo) {
        return arquivo && arquivo.type === 'file' && /\.json$/i.test(arquivo.name || '');
      }).map(function (arquivo) {
        const urlArquivo = arquivo.download_url || raw('main', arquivo.path);
        return fetch(urlArquivo, { cache: 'no-store' })
          .then(function (res) { return res.ok ? res.json() : null; })
          .then(function (ponto) {
            if (!ponto) return null;
            if (String(ponto.usuario || '').trim() !== String(equipe || '').trim()) return null;
            if (projeto && String(ponto.projeto || '').trim() !== String(projeto).trim()) return null;
            return { ponto: ponto, lote: lotePorData(dataDoPonto(ponto)), origem: 'main' };
          });
      });

      const resultado = await Promise.allSettled(tarefas);
      return resultado.filter(function (item) { return item.status === 'fulfilled' && item.value; }).map(function (item) { return item.value; });
    } catch (erro) {
      console.warn('VERA: não foi possível carregar pontos da equipe', erro);
      return [];
    }
  }

  async function listarRegistrosLocais(equipe, projeto) {
    if (typeof window.dbGetAll !== 'function') return [];
    try {
      const pontos = await window.dbGetAll('points');
      return (Array.isArray(pontos) ? pontos : []).filter(function (ponto) {
        if (String(ponto.usuario || '').trim() !== String(equipe || '').trim()) return false;
        return !projeto || String(ponto.projeto || '').trim() === String(projeto).trim();
      }).map(function (ponto) {
        return { ponto: ponto, lote: lotePorData(dataDoPonto(ponto)), origem: 'local' };
      });
    } catch (erro) {
      return [];
    }
  }

  function consolidarRegistros(registros) {
    const vistos = new Map();
    registros.forEach(function (registro) {
      const chave = chavePonto(registro.ponto);
      const existente = vistos.get(chave);
      if (!existente || registro.origem === 'local' || (registro.origem === 'main' && existente.origem === 'snapshot')) {
        vistos.set(chave, registro);
      }
    });
    return Array.from(vistos.values());
  }

  function registrosAdminAtivos() {
    if (estado.admin.modo === 'todos') return estado.admin.registros.slice();
    return estado.admin.registros.filter(function (registro) { return registro.lote.chave === estado.admin.modo; });
  }

  function atualizarBotoesAdmin() {
    const painel = document.getElementById('vera-historico-admin');
    if (!painel) return;
    painel.querySelectorAll('[data-lote-vera]').forEach(function (botao) {
      const ativo = botao.getAttribute('data-lote-vera') === estado.admin.modo;
      botao.style.background = ativo ? '#163d2a' : '#fff';
      botao.style.color = ativo ? '#fff' : '#1f4933';
      botao.style.borderColor = ativo ? '#163d2a' : '#c7dfce';
    });
  }

  function statusAdmin(texto) {
    const campo = document.getElementById('vera-historico-admin-status');
    if (campo) campo.textContent = texto;
  }

  async function desenharPontosAdmin(manterEnquadramento) {
    const mapa = mapaAdmin();
    if (!mapa || !window.L) return;
    const registros = await carregarHistoricoAdmin();
    if (!registros.length) {
      statusAdmin('Não foi possível carregar os pontos preservados agora.');
      return;
    }

    if (!estado.admin.camada || estado.admin.camada._map !== mapa) {
      estado.admin.camada = window.L.layerGroup().addTo(mapa);
    }
    estado.admin.camada.clearLayers();

    const limites = [];
    registrosAdminAtivos().forEach(function (registro) {
      const lat = Number(registro.ponto.lat);
      const lon = Number(registro.ponto.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const marcador = window.L.circleMarker([lat, lon], {
        radius: 10, color: '#fff', weight: 3,
        fillColor: registro.lote.cor, fillOpacity: 0.97
      });
      marcador.bindTooltip(idExibido(registro), { direction: 'top', offset: [0, -8] });
      marcador.bindPopup(popupDoRegistro(registro), { maxWidth: 345 });
      marcador.addTo(estado.admin.camada);
      limites.push([lat, lon]);
    });

    if (!manterEnquadramento && limites.length) {
      mapa.fitBounds(window.L.latLngBounds(limites), { padding: [28, 28], maxZoom: 15 });
    }

    const texto = estado.admin.modo === 'todos'
      ? '23 de 30/06 + 48 de 01/07: 71 pontos exibidos.'
      : (estado.admin.modo === '30-06' ? '23 pontos de 30/06 exibidos.' : '48 pontos de 01/07 exibidos.');
    statusAdmin(texto + (manterEnquadramento ? ' Rota e pontos exibidos juntos.' : ' Toque em um marcador para abrir ponto e fotos.'));
    const info = document.getElementById('admin-map-info');
    if (info) info.textContent = 'Histórico Enecol Centro — ' + texto;
  }

  async function rotaAtivaEnecolCentro() {
    const padrao = '1782688959998';
    try {
      const resposta = await fetch(raw('main', 'estado-equipes.json') + '?t=' + Date.now(), { cache: 'no-store' });
      if (!resposta.ok) return padrao;
      const estadoEquipes = await resposta.json();
      const rota = estadoEquipes && estadoEquipes.equipes && estadoEquipes.equipes['Enecol Centro'] && estadoEquipes.equipes['Enecol Centro'].projetoAtivo;
      return rota && rota.rotaId ? String(rota.rotaId) : padrao;
    } catch (erro) {
      return padrao;
    }
  }

  async function mostrarRotaAdminComPontos() {
    statusAdmin('Carregando a rota ativa e os pontos marcados…');
    try {
      const rotaId = await rotaAtivaEnecolCentro();
      if (typeof window.visualizarRota !== 'function') throw new Error('visualizarRota indisponível');
      await window.visualizarRota(rotaId);
      await desenharPontosAdmin(true);
    } catch (erro) {
      statusAdmin('Não foi possível carregar a rota agora. Atualize a página e tente novamente.');
    }
  }

  function criarPainelAdmin() {
    const mapa = mapaAdmin();
    const elementoMapa = document.getElementById('admin-map');
    if (!mapa || !elementoMapa || document.getElementById('vera-historico-admin')) return;

    const painel = document.createElement('section');
    painel.id = 'vera-historico-admin';
    painel.style.cssText = 'margin:8px 0 12px;padding:12px;border:1px solid #c9dfce;border-radius:12px;background:#f8fbf8;';
    painel.innerHTML = '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">'
      + '<div><div style="font-size:13px;font-weight:800;color:#173b2b;">Histórico Enecol Centro</div><div style="font-size:11px;line-height:1.35;color:#5e7666;margin-top:3px;">Pontos iguais foram separados por lote e data.</div></div>'
      + '<b style="font-size:11px;color:#173b2b;white-space:nowrap;">71 pontos</b></div>'
      + '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px;">'
      + '<button type="button" data-lote-vera="todos" style="padding:8px 10px;border:1px solid #c7dfce;border-radius:8px;font:700 11px inherit;cursor:pointer;">Todos · 71</button>'
      + '<button type="button" data-lote-vera="30-06" style="padding:8px 10px;border:1px solid #c7dfce;border-radius:8px;font:700 11px inherit;cursor:pointer;">30/06 · 23</button>'
      + '<button type="button" data-lote-vera="01-07" style="padding:8px 10px;border:1px solid #c7dfce;border-radius:8px;font:700 11px inherit;cursor:pointer;">01/07 · 48</button>'
      + '<button type="button" id="vera-rota-pontos" style="padding:8px 10px;border:1px solid #163d2a;border-radius:8px;background:#163d2a;color:#fff;font:700 11px inherit;cursor:pointer;">Rota + pontos</button>'
      + '</div><div id="vera-historico-admin-status" style="margin-top:9px;font-size:11px;line-height:1.35;color:#577062;">Carregando histórico no mapa…</div>';

    elementoMapa.parentElement.insertBefore(painel, elementoMapa);
    painel.querySelectorAll('[data-lote-vera]').forEach(function (botao) {
      botao.addEventListener('click', function () {
        estado.admin.modo = botao.getAttribute('data-lote-vera');
        atualizarBotoesAdmin();
        desenharPontosAdmin(false);
      });
    });
    const botaoRota = document.getElementById('vera-rota-pontos');
    if (botaoRota) botaoRota.addEventListener('click', mostrarRotaAdminComPontos);

    atualizarBotoesAdmin();
    setTimeout(function () { desenharPontosAdmin(false); }, 120);
  }

  function usuarioTecnico() {
    const usuario = String(window.currentUser || '');
    const admin = String(window.ADMIN_USER || '');
    return usuario && usuario !== admin ? usuario : '';
  }

  function projetoTecnico() {
    return window.rotaAtribuida && window.rotaAtribuida.nomeProjeto ? String(window.rotaAtribuida.nomeProjeto) : '';
  }

  async function carregarPontosTecnico() {
    const equipe = usuarioTecnico();
    const projeto = projetoTecnico();
    if (!equipe || !projeto) return [];

    const chave = equipe + '|' + projeto;
    if (estado.tecnico.chave === chave && estado.tecnico.registros.length) return estado.tecnico.registros;
    if (estado.tecnico.carregando) return estado.tecnico.registros;

    estado.tecnico.carregando = true;
    try {
      const tarefas = [listarRegistrosLocais(equipe, projeto), listarRegistrosAtuaisDaEquipe(equipe, projeto)];
      if (equipe === 'Enecol Centro' && projeto === 'Rota Teste Porto Nacional') {
        tarefas.push(carregarSnapshot(SNAPSHOTS_ENECOL_CENTRO[0]), carregarSnapshot(SNAPSHOTS_ENECOL_CENTRO[1]));
      }
      const conjuntos = await Promise.all(tarefas);
      estado.tecnico.chave = chave;
      estado.tecnico.registros = consolidarRegistros([].concat.apply([], conjuntos));
      return estado.tecnico.registros;
    } catch (erro) {
      console.warn('VERA: falha ao carregar pontos para técnico', erro);
      return estado.tecnico.registros;
    } finally {
      estado.tecnico.carregando = false;
    }
  }

  function atualizarTextoControleTecnico(texto) {
    const el = document.getElementById('vera-tecnico-pontos-info');
    if (el) el.textContent = texto;
  }

  async function desenharPontosTecnico() {
    const mapa = mapaTecnico();
    const equipe = usuarioTecnico();
    const projeto = projetoTecnico();
    if (!mapa || !equipe || !projeto || !window.L) return;

    if (estado.tecnico.mapa !== mapa) {
      estado.tecnico.mapa = mapa;
      estado.tecnico.camada = window.L.layerGroup().addTo(mapa);
      estado.tecnico.controle = null;
    }
    if (!estado.tecnico.camada) estado.tecnico.camada = window.L.layerGroup().addTo(mapa);

    atualizarTextoControleTecnico('Atualizando pontos…');
    const registros = await carregarPontosTecnico();
    estado.tecnico.camada.clearLayers();

    if (estado.tecnico.ativo) {
      registros.forEach(function (registro) {
        const lat = Number(registro.ponto.lat);
        const lon = Number(registro.ponto.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        const marcador = window.L.circleMarker([lat, lon], {
          radius: 8, color: '#fff', weight: 2.5,
          fillColor: (registro.lote && registro.lote.cor) || '#7b4db3',
          fillOpacity: 0.96
        });
        marcador.bindTooltip(idExibido(registro), { direction: 'top', offset: [0, -6] });
        marcador.bindPopup(popupDoRegistro(registro), { maxWidth: 345 });
        marcador.addTo(estado.tecnico.camada);
      });
    }

    atualizarTextoControleTecnico((estado.tecnico.ativo ? registros.length + ' ponto(s) marcado(s)' : 'Pontos ocultos') + ' · toque em um ponto para ver fotos');
  }

  function criarControleTecnico() {
    const mapa = mapaTecnico();
    const equipe = usuarioTecnico();
    const projeto = projetoTecnico();
    if (!mapa || !equipe || !projeto || !window.L || estado.tecnico.controle) return;

    const Controle = window.L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        const caixa = window.L.DomUtil.create('div', 'leaflet-bar');
        caixa.style.cssText = 'background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.22);min-width:152px;';
        caixa.innerHTML = '<button type="button" id="vera-tecnico-pontos-toggle" style="display:block;width:100%;padding:9px 10px;border:0;border-bottom:1px solid #d6e2d8;background:#173b2b;color:#fff;font:700 11px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;cursor:pointer;">📍 Pontos registrados</button>'
          + '<button type="button" id="vera-tecnico-pontos-refresh" style="display:block;width:100%;padding:8px 10px;border:0;background:#fff;color:#173b2b;font:700 10px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;cursor:pointer;">↻ Atualizar pontos</button>'
          + '<div id="vera-tecnico-pontos-info" style="padding:7px 9px;background:#f7faf8;color:#587063;font:10px/1.3 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">Carregando pontos…</div>';
        window.L.DomEvent.disableClickPropagation(caixa);
        window.L.DomEvent.disableScrollPropagation(caixa);
        return caixa;
      }
    });

    estado.tecnico.controle = new Controle();
    estado.tecnico.controle.addTo(mapa);

    setTimeout(function () {
      const alternar = document.getElementById('vera-tecnico-pontos-toggle');
      const atualizar = document.getElementById('vera-tecnico-pontos-refresh');
      if (alternar) alternar.addEventListener('click', function () {
        estado.tecnico.ativo = !estado.tecnico.ativo;
        alternar.textContent = estado.tecnico.ativo ? '📍 Pontos registrados' : '◯ Pontos ocultos';
        desenharPontosTecnico();
      });
      if (atualizar) atualizar.addEventListener('click', function () {
        estado.tecnico.chave = '';
        estado.tecnico.registros = [];
        desenharPontosTecnico();
      });
      desenharPontosTecnico();
    }, 0);
  }

  function instalarMapas() {
    capturarMapasCriados();
    criarPainelAdmin();
    criarControleTecnico();
  }

  function integrarNavegacao() {
    if (typeof window.switchTab === 'function' && !window.__veraSwitchTabPontosCompartilhados) {
      const original = window.switchTab;
      window.__veraSwitchTabPontosCompartilhados = true;
      window.switchTab = function () {
        const resultado = original.apply(this, arguments);
        const aba = arguments[0];
        if (aba === 'map') setTimeout(function () { criarControleTecnico(); desenharPontosTecnico(); }, 250);
        if (aba === 'admin') setTimeout(criarPainelAdmin, 250);
        return resultado;
      };
    }

    if (typeof window.confirmarAlimentadores === 'function' && !window.__veraConfirmarPontosCompartilhados) {
      const original = window.confirmarAlimentadores;
      window.__veraConfirmarPontosCompartilhados = true;
      window.confirmarAlimentadores = async function () {
        const resultado = await original.apply(this, arguments);
        setTimeout(function () { criarControleTecnico(); desenharPontosTecnico(); }, 400);
        return resultado;
      };
    }
  }

  const tentativa = setInterval(function () {
    instalarMapas();
    integrarNavegacao();
  }, 500);
  setTimeout(function () { clearInterval(tentativa); }, 30000);
})();
