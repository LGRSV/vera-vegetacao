(function () {
  'use strict';
  if (window.__veraProtegeIdsRemotos) return;
  window.__veraProtegeIdsRemotos = true;

  const fetchNativo = window.fetch.bind(window);
  const CHAVE_SESSAO = 'vera_mapa_ids_remotos_v1';
  let mapa = {};
  try { mapa = JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) || '{}') || {}; } catch (e) { mapa = {}; }

  function salvarMapa() { try { sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(mapa)); } catch (e) {} }
  function codificarCaminho(caminho) { return caminho.split('/').map(function (parte) { return encodeURIComponent(parte); }).join('/'); }
  function idRemoto(pasta, idLegado) {
    const chave = String(pasta || '') + '|' + String(idLegado || '').toUpperCase();
    if (mapa[chave]) return mapa[chave];
    const agora = new Date();
    const dois = function (valor) { return String(valor).padStart(2, '0'); };
    const carimbo = String(agora.getFullYear()) + dois(agora.getMonth() + 1) + dois(agora.getDate()) + dois(agora.getHours()) + dois(agora.getMinutes()) + dois(agora.getSeconds()) + String(agora.getMilliseconds()).padStart(3, '0');
    let aleatorio = '';
    try { const valores = new Uint32Array(1); crypto.getRandomValues(valores); aleatorio = String(valores[0] % 1000000).padStart(6, '0'); }
    catch (e) { aleatorio = String(Math.floor(Math.random() * 1000000)).padStart(6, '0'); }
    mapa[chave] = 'V' + carimbo + aleatorio;
    salvarMapa();
    return mapa[chave];
  }
  function textoDeBase64(valor) { return decodeURIComponent(Array.prototype.map.call(atob(valor), function (caractere) { return '%' + ('00' + caractere.charCodeAt(0).toString(16)).slice(-2); }).join('')); }
  function base64DeTexto(valor) { return btoa(unescape(encodeURIComponent(valor))); }
  function atualizarConteudoDoPonto(base64, idAntigo, idNovo) {
    try {
      const ponto = JSON.parse(textoDeBase64(base64));
      const numeroAntigo = idAntigo.replace(/^V/i, '');
      const numeroNovo = idNovo.replace(/^V/i, '');
      const marcadorAntigo = 'VER' + numeroAntigo + 'F';
      const marcadorNovo = 'VER' + numeroNovo + 'F';
      ponto.legacy_id = ponto.legacy_id || idAntigo;
      ponto.id = idNovo;
      ponto.remote_id = idNovo;
      if (Array.isArray(ponto.fotos_ids)) ponto.fotos_ids = ponto.fotos_ids.map(function (foto) { return String(foto).replace(marcadorAntigo, marcadorNovo); });
      if (Array.isArray(ponto.fotos_github)) ponto.fotos_github = ponto.fotos_github.map(function (foto) { return String(foto).replace(marcadorAntigo, marcadorNovo); });
      return base64DeTexto(JSON.stringify(ponto, null, 2));
    } catch (e) { return base64; }
  }
  function analisarCaminho(caminho) {
    const foto = caminho.match(/^fotos\/(.+)\/VER(\d+)F(\d+)\.(jpg|jpeg|png)$/i);
    if (foto && foto[2].length <= 6) {
      const legado = 'V' + foto[2].padStart(4, '0');
      const remoto = idRemoto(foto[1], legado);
      return { tipo: 'foto', legado: legado, remoto: remoto, novoCaminho: 'fotos/' + foto[1] + '/VER' + remoto.slice(1) + 'F' + foto[3] + '.' + foto[4] };
    }
    const ponto = caminho.match(/^dados\/(.+)\/(V\d+)\.json$/i);
    if (ponto && ponto[2].replace(/^V/i, '').length <= 6) {
      const legado = ponto[2].toUpperCase();
      const remoto = idRemoto(ponto[1], legado);
      return { tipo: 'ponto', legado: legado, remoto: remoto, novoCaminho: 'dados/' + ponto[1] + '/' + remoto + '.json' };
    }
    return null;
  }
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const metodo = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    const marcador = '/contents/';
    const indice = url.indexOf(marcador);
    if (!url || indice < 0 || !/api\.github\.com\/repos\/LGRSV\/vera-vegetacao\/contents\//i.test(url)) return fetchNativo(input, init);
    const caminho = decodeURIComponent(url.slice(indice + marcador.length).split('?')[0]);
    const regra = analisarCaminho(caminho);
    if (!regra) return fetchNativo(input, init);
    const novaUrl = url.slice(0, indice + marcador.length) + codificarCaminho(regra.novoCaminho);
    let novaInit = init;
    if (metodo === 'PUT' && regra.tipo === 'ponto' && init && init.body) {
      try {
        const carga = JSON.parse(init.body);
        if (carga && carga.content) {
          carga.content = atualizarConteudoDoPonto(carga.content, regra.legado, regra.remoto);
          novaInit = Object.assign({}, init, { body: JSON.stringify(carga) });
        }
      } catch (e) {}
    }
    return fetchNativo(novaUrl, novaInit);
  };
})();

(function () {
  'use strict';
  if (window.__veraHistoricoAdminV3) return;
  window.__veraHistoricoAdminV3 = true;

  const REPO = 'LGRSV/vera-vegetacao';
  const LOTES = [
    { chave: 'ontem', etiqueta: '30/06', titulo: '30/06/2026', branch: 'backup/enecol-centro-2026-06-30', quantidade: 23, cor: '#2467a8' },
    { chave: 'hoje', etiqueta: '01/07', titulo: '01/07/2026', branch: 'backup/enecol-centro-2026-07-01-48-pontos', quantidade: 48, cor: '#2e8b57' }
  ];
  const estado = { modo: 'todos', carregando: false, registros: [], camada: null };

  function existeMapaAdmin() { return typeof L !== 'undefined' && typeof adminMap !== 'undefined' && Boolean(document.getElementById('admin-map')); }
  function pad(n) { return String(n).padStart(4, '0'); }
  function urlRaw(lote, caminho) { return 'https://raw.githubusercontent.com/' + REPO + '/' + lote.branch + '/' + caminho; }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>'"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]; }); }
  function idExibido(r) { return r.lote.etiqueta + ' · ' + String(r.ponto.id || 'Sem ID'); }
  function status(texto) { const el = document.getElementById('vera-historico-admin-status'); if (el) el.textContent = texto; }
  function obterCamada() {
    if (!existeMapaAdmin()) return null;
    if (!estado.camada || estado.camada._map !== adminMap) estado.camada = L.layerGroup().addTo(adminMap);
    return estado.camada;
  }
  async function carregarLote(lote) {
    const tarefas = [];
    for (let n = 1; n <= lote.quantidade; n++) {
      const caminho = 'dados/Enecol-Centro/V' + pad(n) + '.json';
      tarefas.push(fetch(urlRaw(lote, caminho), { cache: 'no-store' }).then(function (res) {
        if (!res.ok) throw new Error(caminho);
        return res.json();
      }).then(function (ponto) { return { lote: lote, ponto: ponto }; }));
    }
    const retorno = await Promise.allSettled(tarefas);
    return retorno.filter(function (x) { return x.status === 'fulfilled'; }).map(function (x) { return x.value; });
  }
  async function carregar() {
    if (estado.registros.length) return estado.registros;
    if (estado.carregando) return [];
    estado.carregando = true;
    status('Carregando 23 pontos de 30/06 e 48 pontos de 01/07…');
    try {
      const partes = await Promise.all(LOTES.map(carregarLote));
      estado.registros = partes[0].concat(partes[1]);
      return estado.registros;
    } catch (e) {
      status('Não foi possível carregar o histórico. Atualize a página e tente novamente.');
      return [];
    } finally { estado.carregando = false; }
  }
  function popup(r) {
    const p = r.ponto;
    const fotos = Array.isArray(p.fotos_github) ? p.fotos_github : [];
    const imagens = fotos.map(function (caminho, i) {
      const fotoId = r.lote.titulo.replace(/\//g, '') + ' · ' + String((p.fotos_ids || [])[i] || ('Foto ' + (i + 1)));
      const url = urlRaw(r.lote, caminho);
      return '<a href="' + esc(url) + '" target="_blank" rel="noopener" style="display:inline-block;width:31%;margin-right:1%;vertical-align:top;text-decoration:none;"><img src="' + esc(url) + '" alt="' + esc(fotoId) + '" style="display:block;width:100%;height:82px;object-fit:cover;border-radius:7px;background:#eef3f0;"><span style="display:block;margin-top:3px;font-size:8px;line-height:1.2;color:#526b5c;">' + esc(fotoId) + '</span></a>';
    }).join('');
    return '<div style="min-width:240px;max-width:330px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#183b2b;"><div style="font-size:11px;font-weight:800;color:' + r.lote.cor + ';">LOTE ' + esc(r.lote.titulo) + '</div><div style="font-size:17px;font-weight:800;margin:3px 0 9px;">' + esc(idExibido(r)) + '</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;line-height:1.35;margin-bottom:9px;"><div><b>Espécie</b><br>' + esc(p.especie || '—') + '</div><div><b>Poste</b><br>' + esc(p.poste || '—') + '</div><div><b>Data</b><br>' + esc(p.data || '—') + '</div><div><b>Altura</b><br>' + esc(p.altura || '—') + ' m</div></div><div style="font-size:11px;font-weight:800;margin-bottom:5px;">Fotos (' + fotos.length + ')</div>' + (imagens || '<div style="font-size:11px;color:#64766c;">Sem fotos.</div>') + '</div>';
  }
  function ativos() { return estado.modo === 'todos' ? estado.registros.slice() : estado.registros.filter(function (r) { return r.lote.chave === estado.modo; }); }
  function marcarBotoes() {
    const painel = document.getElementById('vera-historico-admin');
    if (!painel) return;
    painel.querySelectorAll('[data-lote-vera]').forEach(function (b) {
      const ativo = b.getAttribute('data-lote-vera') === estado.modo;
      b.style.background = ativo ? '#163d2a' : '#fff';
      b.style.color = ativo ? '#fff' : '#1f4933';
      b.style.borderColor = ativo ? '#163d2a' : '#c7dfce';
    });
  }
  async function exibir(manterEnquadramento) {
    const camada = obterCamada();
    if (!camada) return;
    const registros = await carregar();
    if (!registros.length) return;
    camada.clearLayers();
    const limites = [];
    ativos().forEach(function (r) {
      const lat = Number(r.ponto.lat), lon = Number(r.ponto.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const m = L.circleMarker([lat, lon], { radius: 10, color: '#fff', weight: 3, fillColor: r.lote.cor, fillOpacity: 0.97 });
      m.bindTooltip(idExibido(r), { direction: 'top', offset: [0, -8] });
      m.bindPopup(popup(r), { maxWidth: 345 });
      m.addTo(camada);
      limites.push([lat, lon]);
    });
    if (!manterEnquadramento && limites.length && typeof adminMap.fitBounds === 'function') adminMap.fitBounds(L.latLngBounds(limites), { padding: [28, 28], maxZoom: 15 });
    const texto = estado.modo === 'todos' ? '23 de 30/06 + 48 de 01/07: 71 pontos exibidos.' : (estado.modo === 'ontem' ? '23 pontos de 30/06 exibidos.' : '48 pontos de 01/07 exibidos.');
    status(texto + (manterEnquadramento ? ' Rota e pontos exibidos juntos.' : ' Toque em um marcador para abrir ponto e fotos.'));
    const info = document.getElementById('admin-map-info');
    if (info) info.textContent = 'Histórico Enecol Centro — ' + texto;
  }
  async function obterRotaAtualEnecolCentro() {
    const padrao = '1782688959998';
    try {
      const resposta = await fetch('https://raw.githubusercontent.com/' + REPO + '/main/estado-equipes.json?t=' + Date.now(), { cache: 'no-store' });
      if (!resposta.ok) return padrao;
      const estadoEquipe = await resposta.json();
      const rotaId = estadoEquipe && estadoEquipe.equipes && estadoEquipe.equipes['Enecol Centro'] && estadoEquipe.equipes['Enecol Centro'].projetoAtivo && estadoEquipe.equipes['Enecol Centro'].projetoAtivo.rotaId;
      return rotaId ? String(rotaId) : padrao;
    } catch (e) { return padrao; }
  }
  async function mostrarRotaComPontos() {
    status('Carregando a rota ativa e os pontos marcados…');
    const rotaId = await obterRotaAtualEnecolCentro();
    if (typeof window.visualizarRota !== 'function') {
      status('A rota ainda não está disponível. Toque em Atualizar e tente novamente.');
      return;
    }
    try {
      await window.visualizarRota(rotaId);
      await exibir(true);
    } catch (e) {
      status('Não foi possível carregar a rota agora. Atualize a página e tente novamente.');
    }
  }
  function criarPainel() {
    const mapaEl = document.getElementById('admin-map');
    if (!mapaEl || document.getElementById('vera-historico-admin')) return;
    const painel = document.createElement('section');
    painel.id = 'vera-historico-admin';
    painel.style.cssText = 'margin:8px 0 12px;padding:12px;border:1px solid #c9dfce;border-radius:12px;background:#f8fbf8;';
    painel.innerHTML = '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;"><div><div style="font-size:13px;font-weight:800;color:#173b2b;">Histórico Enecol Centro</div><div style="font-size:11px;line-height:1.35;color:#5e7666;margin-top:3px;">Pontos iguais foram separados por lote e data.</div></div><b style="font-size:11px;color:#173b2b;white-space:nowrap;">71 pontos</b></div><div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px;"><button type="button" data-lote-vera="todos" style="padding:8px 10px;border:1px solid #c7dfce;border-radius:8px;font:700 11px inherit;cursor:pointer;">Todos · 71</button><button type="button" data-lote-vera="ontem" style="padding:8px 10px;border:1px solid #c7dfce;border-radius:8px;font:700 11px inherit;cursor:pointer;">30/06 · 23</button><button type="button" data-lote-vera="hoje" style="padding:8px 10px;border:1px solid #c7dfce;border-radius:8px;font:700 11px inherit;cursor:pointer;">01/07 · 48</button><button type="button" id="vera-rota-pontos" style="padding:8px 10px;border:1px solid #163d2a;border-radius:8px;background:#163d2a;color:#fff;font:700 11px inherit;cursor:pointer;">Rota + pontos</button></div><div id="vera-historico-admin-status" style="margin-top:9px;font-size:11px;line-height:1.35;color:#577062;">Carregando histórico no mapa…</div>';
    mapaEl.parentElement.insertBefore(painel, mapaEl);
    painel.querySelectorAll('[data-lote-vera]').forEach(function (b) { b.addEventListener('click', function () { estado.modo = b.getAttribute('data-lote-vera'); marcarBotoes(); exibir(false); }); });
    const botaoRota = document.getElementById('vera-rota-pontos');
    if (botaoRota) botaoRota.addEventListener('click', mostrarRotaComPontos);
    marcarBotoes();
    setTimeout(function () { exibir(false); }, 120);
  }
  function instalar() {
    if (!existeMapaAdmin()) return setTimeout(instalar, 300);
    criarPainel();
  }
  document.addEventListener('click', function (ev) {
    const b = ev.target && ev.target.closest ? ev.target.closest('button') : null;
    if (b && /^atualizar$/i.test(String(b.textContent || '').trim()) && document.getElementById('vera-historico-admin')) setTimeout(function () { exibir(false); }, 700);
  }, true);
  instalar();
})();
