(function () {
  'use strict';

  if (window.__veraAdminLoteAtual) return;
  window.__veraAdminLoteAtual = true;

  var REPO = 'LGRSV/vera-vegetacao';
  var EQUIPE = 'Enecol Centro';
  var estado = { carregando: false, registros: [], camada: null, mapa: null, painel: null, dataLote: '' };

  function esc(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>'"]/g, function (caractere) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[caractere];
    });
  }

  function raw(caminho) {
    return 'https://raw.githubusercontent.com/' + REPO + '/main/' + caminho;
  }

  function dataDia(ponto) {
    var valor = String((ponto && ponto.data) || '');
    var encontrado = valor.match(/^(\d{2}\/\d{2}\/\d{4})/);
    return encontrado ? encontrado[1] : '';
  }

  function valorData(dia) {
    var partes = String(dia || '').split('/');
    if (partes.length !== 3) return 0;
    return Number(partes[2] + partes[1] + partes[0]) || 0;
  }

  function obterMapa() {
    if (window.adminMap && window.L && window.adminMap instanceof window.L.Map) return window.adminMap;
    return null;
  }

  function status(texto) {
    var campo = document.getElementById('vera-lote-atual-status');
    if (campo) campo.textContent = texto;
  }

  function fotos(ponto) {
    var caminhos = Array.isArray(ponto && ponto.fotos_github) ? ponto.fotos_github.filter(Boolean) : [];
    return caminhos.map(raw);
  }

  function popup(registro) {
    var ponto = registro.ponto || {};
    var imagens = fotos(ponto).map(function (url, indice) {
      return '<a href="' + esc(url) + '" target="_blank" rel="noopener" style="display:inline-block;width:31%;margin-right:1%;margin-bottom:7px;vertical-align:top;text-decoration:none;">'
        + '<img src="' + esc(url) + '" alt="Foto ' + (indice + 1) + '" style="display:block;width:100%;height:82px;object-fit:cover;border-radius:7px;background:#edf2ef;">'
        + '<span style="display:block;margin-top:3px;font-size:9px;line-height:1.2;color:#526b5c;">Foto ' + (indice + 1) + '</span></a>';
    }).join('');

    return '<div style="min-width:235px;max-width:335px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#17372a;">'
      + '<div style="font-size:11px;font-weight:800;letter-spacing:.04em;color:#7b4db3;">LOTE SINCRONIZADO · ' + esc(estado.dataLote || 'Atual') + '</div>'
      + '<div style="margin:4px 0 9px;font-size:17px;font-weight:800;">' + esc(ponto.id || 'Sem ID') + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:11px;line-height:1.35;margin-bottom:9px;">'
      + '<div><b>Espécie</b><br>' + esc(ponto.especie || '—') + '</div>'
      + '<div><b>Poste</b><br>' + esc(ponto.poste || '—') + '</div>'
      + '<div><b>Data</b><br>' + esc(ponto.data || '—') + '</div>'
      + '<div><b>Área</b><br>' + esc(ponto.area || '—') + '</div>'
      + '<div><b>Altura</b><br>' + esc(ponto.altura || '—') + ' m</div>'
      + '<div><b>Acesso</b><br>' + esc(ponto.acesso || '—') + '</div>'
      + '</div>'
      + '<div style="font-size:11px;font-weight:800;margin-bottom:5px;">Fotos (' + fotos(ponto).length + ')</div>'
      + (imagens || '<div style="font-size:11px;color:#64766c;">Nenhuma foto sincronizada neste ponto.</div>')
      + '</div>';
  }

  async function carregar(forcar) {
    if (estado.carregando) return estado.registros;
    if (estado.registros.length && !forcar) return estado.registros;

    estado.carregando = true;
    status('Consultando os pontos sincronizados no repositório…');

    try {
      var indiceUrl = 'https://api.github.com/repos/' + REPO + '/contents/dados/Enecol-Centro?ref=main&t=' + Date.now();
      var resposta = await fetch(indiceUrl, { cache: 'no-store', headers: { 'Accept': 'application/vnd.github+json' } });
      if (!resposta.ok) throw new Error('índice HTTP ' + resposta.status);
      var arquivos = await resposta.json();
      if (!Array.isArray(arquivos)) throw new Error('índice inválido');

      var tarefas = arquivos.filter(function (arquivo) {
        return arquivo && arquivo.type === 'file' && /\.json$/i.test(arquivo.name || '');
      }).map(function (arquivo) {
        var url = arquivo.download_url || raw(arquivo.path);
        return fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' })
          .then(function (res) { return res.ok ? res.json() : null; })
          .then(function (ponto) {
            if (!ponto || String(ponto.usuario || '').trim() !== EQUIPE) return null;
            var dia = dataDia(ponto);
            return dia ? { ponto: ponto, dia: dia, caminho: arquivo.path } : null;
          });
      });

      var resultados = await Promise.allSettled(tarefas);
      var todos = resultados.filter(function (item) { return item.status === 'fulfilled' && item.value; }).map(function (item) { return item.value; });
      var ultimaData = todos.reduce(function (maior, registro) {
        return valorData(registro.dia) > valorData(maior) ? registro.dia : maior;
      }, '');

      estado.dataLote = ultimaData;
      estado.registros = todos.filter(function (registro) { return registro.dia === ultimaData; }).sort(function (a, b) {
        return String((a.ponto && a.ponto.id) || '').localeCompare(String((b.ponto && b.ponto.id) || ''), 'pt-BR', { numeric: true });
      });
      return estado.registros;
    } finally {
      estado.carregando = false;
    }
  }

  async function desenhar(ajustarMapa) {
    var mapa = obterMapa();
    if (!mapa || !window.L) return;

    try {
      var registros = await carregar(false);
      if (!estado.camada || estado.mapa !== mapa) {
        estado.mapa = mapa;
        estado.camada = window.L.layerGroup().addTo(mapa);
      }
      estado.camada.clearLayers();

      var limites = [];
      registros.forEach(function (registro) {
        var ponto = registro.ponto || {};
        var lat = Number(ponto.lat);
        var lon = Number(ponto.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

        var marcador = window.L.marker([lat, lon], {
          icon: window.L.divIcon({
            className: 'vera-lote-atual-icone',
            html: '<div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#7b4db3;border:3px solid #fff;color:#fff;font:800 12px/1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;box-shadow:0 1px 5px rgba(0,0,0,.30);">A</div>',
            iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -15], tooltipAnchor: [0, -15]
          }),
          title: (registro.dia || 'Atual') + ' · ' + String(ponto.id || 'Sem ID'),
          riseOnHover: true
        });
        marcador.bindTooltip((registro.dia || 'Atual').slice(0, 5) + ' · ' + String(ponto.id || 'Sem ID'), { direction: 'top', offset: [0, -15], opacity: 0.96 });
        marcador.bindPopup(popup(registro), { maxWidth: 345 });
        marcador.addTo(estado.camada);
        limites.push([lat, lon]);
      });

      var numero = document.getElementById('vera-lote-atual-total');
      if (numero) numero.textContent = registros.length + ' pontos';
      status((estado.dataLote || 'Lote atual') + ' · ' + registros.length + ' ponto(s) sincronizado(s). Marcadores roxos no mapa.');

      if (ajustarMapa && limites.length) mapa.fitBounds(window.L.latLngBounds(limites), { padding: [28, 28], maxZoom: 15 });
    } catch (erro) {
      status('Falha ao consultar o lote atual: ' + String(erro && erro.message ? erro.message : erro));
      console.warn('VERA: lote atual admin', erro);
    }
  }

  async function atualizar() {
    estado.registros = [];
    estado.dataLote = '';
    status('Atualizando o lote sincronizado…');
    await desenhar(true);
  }

  function montar() {
    var mapa = obterMapa();
    var elementoMapa = document.getElementById('admin-map');
    if (!mapa || !elementoMapa) return false;
    if (document.getElementById('vera-lote-atual-admin')) return true;

    var painel = document.createElement('section');
    painel.id = 'vera-lote-atual-admin';
    painel.style.cssText = 'margin:8px 0 12px;padding:12px;border:1px solid #d9ccea;border-radius:12px;background:#fbf9fe;';
    painel.innerHTML = '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">'
      + '<div><div style="font-size:13px;font-weight:800;color:#4b287c;">Lote atual sincronizado — Enecol Centro</div>'
      + '<div style="font-size:11px;line-height:1.35;color:#705d85;margin-top:3px;">Exibe a data mais recente existente no repositório, independente dos lotes históricos preservados.</div></div>'
      + '<b id="vera-lote-atual-total" style="font-size:11px;color:#4b287c;white-space:nowrap;">Carregando…</b></div>'
      + '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px;">'
      + '<button type="button" id="vera-lote-atual-exibir" style="padding:8px 10px;border:1px solid #7b4db3;border-radius:8px;background:#7b4db3;color:#fff;font:700 11px inherit;cursor:pointer;">Exibir lote atual</button>'
      + '<button type="button" id="vera-lote-atual-atualizar" style="padding:8px 10px;border:1px solid #d5c6e7;border-radius:8px;background:#fff;color:#4b287c;font:700 11px inherit;cursor:pointer;">↻ Atualizar lote</button>'
      + '</div><div id="vera-lote-atual-status" style="margin-top:9px;font-size:11px;line-height:1.35;color:#705d85;">Preparando o lote sincronizado…</div>';

    var historico = document.getElementById('vera-historico-admin');
    if (historico && historico.parentNode) historico.insertAdjacentElement('afterend', painel);
    else elementoMapa.parentElement.insertBefore(painel, elementoMapa);
    estado.painel = painel;

    document.getElementById('vera-lote-atual-exibir').addEventListener('click', function () { desenhar(true); });
    document.getElementById('vera-lote-atual-atualizar').addEventListener('click', atualizar);
    setTimeout(function () { desenhar(false); }, 550);
    return true;
  }

  function iniciar() {
    if (!montar()) setTimeout(iniciar, 300);
  }

  iniciar();
})();
