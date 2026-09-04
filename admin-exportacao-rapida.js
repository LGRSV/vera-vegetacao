/*
 * VERA - Exportacao do painel admin (rapida e completa)
 *
 * Problema que isto corrige:
 *   A exportacao original listava dados/<Equipe> pela API do GitHub e baixava
 *   um arquivo por vez. Isso quebrava de tres formas:
 *     1. a API de conteudo corta a listagem em 1000 arquivos - a Enecol Centro
 *        ja passa de 3400, entao os pontos mais novos simplesmente sumiam;
 *     2. eram milhares de requisicoes em serie (minutos, e travava no celular);
 *     3. exigia token; em aparelho sem token configurado caia no limite de
 *        60 req/hora e falhava calada.
 *
 * Como passou a funcionar:
 *   Le a exportacao consolidada que o proprio app mantem em exportacoes/<equipe>.csv
 *   pelo raw.githubusercontent.com - uma requisicao por equipe, sem consumir cota
 *   da API e sem limite de 1000. Em cima disso:
 *     - remove as copias geradas pelo reenvio em massa (mesma coordenada e mesmo
 *       horario de coleta), mantendo a que tem as fotos;
 *     - acrescenta Polo / Tipo / Alimentador a partir de
 *       exportacoes/alimentador-por-ponto.json (com fallback pela rota).
 */
(function () {
  'use strict';

  var REPO = 'LGRSV/vera-vegetacao';
  var RAW  = 'https://raw.githubusercontent.com/' + REPO + '/main/';

  // Pastas que existem de fato em dados/ (os demais nomes eram chutes do codigo antigo)
  var EQUIPES = ['Enecol Centro', 'Equipe Energisa', 'Enecol Sul', 'Equipe 01 — Norte'];

  var registros = [];   // pontos ja tratados, prontos para exportar
  var alimCache = null;

  function slug(nome) {
    return String(nome)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function info(texto) {
    var el = document.getElementById('export-info');
    if (el) el.textContent = texto;
  }

  // ---- CSV -----------------------------------------------------------------

  function parseCSV(texto) {
    var linhas = [], campo = '', linha = [], aspas = false;
    texto = texto.replace(/^﻿/, '');
    for (var i = 0; i < texto.length; i++) {
      var c = texto[i];
      if (aspas) {
        if (c === '"') {
          if (texto[i + 1] === '"') { campo += '"'; i++; }
          else aspas = false;
        } else campo += c;
      } else if (c === '"') aspas = true;
      else if (c === ',') { linha.push(campo); campo = ''; }
      else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
      else if (c !== '\r') campo += c;
    }
    if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
    return linhas;
  }

  function escCSV(v) {
    var s = (v === undefined || v === null) ? '' : String(v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // ---- carga ---------------------------------------------------------------

  async function lerAlimentadores() {
    if (alimCache) return alimCache;
    try {
      var r = await fetch(RAW + 'exportacoes/alimentador-por-ponto.json?t=' + Date.now(), { cache: 'no-store' });
      alimCache = r.ok ? await r.json() : { porPonto: {}, porRota: {} };
    } catch (e) {
      alimCache = { porPonto: {}, porRota: {} };
    }
    if (!alimCache.porPonto) alimCache.porPonto = {};
    if (!alimCache.porRota)  alimCache.porRota  = {};
    return alimCache;
  }

  async function lerEquipe(equipe) {
    var r;
    try {
      r = await fetch(RAW + 'exportacoes/' + slug(equipe) + '.csv?t=' + Date.now(), { cache: 'no-store' });
    } catch (e) { return []; }
    if (!r.ok) return [];                       // 404 = equipe ainda sem pontos

    var linhas = parseCSV(await r.text());
    if (linhas.length < 2) return [];
    var cab = linhas[0].map(function (h) { return h.trim(); });
    var idx = {};
    cab.forEach(function (h, i) { idx[h] = i; });

    var saida = [];
    for (var i = 1; i < linhas.length; i++) {
      var l = linhas[i];
      if (!l || l.length < 3) continue;
      function v(nome) { return idx[nome] === undefined ? '' : (l[idx[nome]] || ''); }
      saida.push({
        id:      v('Ponto'),
        rota:    v('Projeto'),
        equipe:  v('Equipe') || equipe,
        data:    v('Data/hora'),
        especie: v('Espécie'),
        poste:   v('Poste'),
        area:    v('Área'),
        altura:  v('Altura (m)'),
        dap:     v('DAP (cm)'),
        acesso:  v('Acesso'),
        dtbt:    v('Dist. BT (cm)'),
        dtmt:    v('Dist. MT (cm)'),
        dtat:    v('Dist. AT (cm)'),
        lat:     v('Latitude'),
        lon:     v('Longitude'),
        fotos:   parseInt(v('Qtd fotos'), 10) || 0,
        foto1:   v('Foto (link)')
      });
    }
    return saida;
  }

  // Reenvio em massa duplicou pontos: mesma coordenada + mesmo horario de coleta.
  // Os campos tecnicos sao identicos; o que muda e que a copia veio sem foto.
  function removerDuplicados(lista) {
    var grupos = {};
    lista.forEach(function (p) {
      var k = p.lat + '|' + p.lon + '|' + p.data;
      (grupos[k] = grupos[k] || []).push(p);
    });
    var unicos = [], removidos = 0;
    Object.keys(grupos).forEach(function (k) {
      var g = grupos[k];
      g.sort(function (a, b) {
        return (b.fotos - a.fotos) || String(a.id).localeCompare(String(b.id));
      });
      unicos.push(g[0]);
      removidos += g.length - 1;
    });
    unicos.sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); });
    return { pontos: unicos, removidos: removidos };
  }

  function aplicarAlimentador(lista, mapa) {
    lista.forEach(function (p) {
      var v = mapa.porPonto[p.equipe + '|' + p.id] || mapa.porRota[p.rota] || '';
      var partes = v ? v.split('|') : ['', ''];
      p.polo = partes[0] || '';
      p.alimentador = partes[1] || '';
      p.tipo = p.alimentador ? p.alimentador.slice(0, 4) : '';
    });
  }

  // ---- fluxo do painel -----------------------------------------------------

  async function carregar() {
    var sel = document.getElementById('export-equipe');
    var escolha = sel ? sel.value : '';
    if (!escolha) { registros = []; info(''); return; }

    info('Carregando…');
    var alvos = escolha === '__todas__' ? EQUIPES : [escolha];

    var mapa = await lerAlimentadores();
    var todos = [];
    for (var i = 0; i < alvos.length; i++) {
      var pts = await lerEquipe(alvos[i]);
      todos = todos.concat(pts);
      info('Carregando… ' + todos.length + ' ponto(s)');
    }

    var r = removerDuplicados(todos);
    aplicarAlimentador(r.pontos, mapa);
    registros = r.pontos;
    window.dadosEquipeCarregados = registros;   // compatibilidade com o codigo antigo

    if (!registros.length) {
      info('Nenhum ponto encontrado para esta equipe.');
    } else {
      info(registros.length + ' ponto(s) prontos para exportar'
           + (r.removidos ? ' (' + r.removidos + ' duplicados de reenvio removidos)' : '') + '.');
    }
  }

  // Padrao da planilha em uso: AL (alimentador) logo depois do ID e mes/ano no fim.
  var COLUNAS = ['WKT', 'ID', 'AL', 'DATA', 'POSTE', 'ESPECIE', 'LATITUDE', 'LONGITUDE',
    'ALTURA(M)', 'DT BT(cm)', 'DT MT(cm)', 'DT AT(cm)', 'DAP (cm)', 'Area',
    'Acesso LV', 'IDs_Fotos', 'mês', 'ano'];

  // Nomes dos arquivos de foto do ponto, todos numa coluna so.
  function idsFotos(p) {
    var n = p.fotos || 0;
    if (!n) return '';
    var base = 'VER' + String(p.id).replace(/^V/, '') + 'F';
    var out = [];
    for (var i = 1; i <= n; i++) out.push(base + i + '.jpg');
    return out.join(' | ');
  }

  function mesAno(p) {
    var m = String(p.data || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? [String(Number(m[2])), m[3]] : ['', ''];
  }

  function montarCSV() {
    var linhas = [COLUNAS.join(';')];
    registros.forEach(function (p) {
      var wkt = (p.lat && p.lon)
        ? ('POINT (' + Number(p.lon).toFixed(6) + ' ' + Number(p.lat).toFixed(6) + ')') : '';
      var ma = mesAno(p);
      linhas.push([
        wkt, p.id, p.alimentador, p.data, p.poste || 'NÃO INFORMADO', p.especie,
        p.lat, p.lon, p.altura, p.dtbt, p.dtmt, p.dtat, p.dap, p.area,
        p.acesso, idsFotos(p), ma[0], ma[1]
      ].map(escCSV).join(';'));
    });
    return '\ufeff' + linhas.join('\r\n') + '\r\n';
  }

  function xml(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function montarKML(nome) {
    var k = '<?xml version="1.0" encoding="UTF-8"?>\n';
    k += '<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n';
    k += '<name>' + xml('VERA - ' + nome) + '</name>\n';
    k += '<Style id="vera"><IconStyle><color>ff4CAF50</color><scale>1.1</scale></IconStyle></Style>\n';
    registros.forEach(function (p) {
      if (!p.lat || !p.lon) return;
      k += '<Placemark>\n<name>' + xml(p.especie || p.id) + '</name>\n<styleUrl>#vera</styleUrl>\n';
      k += '<description><![CDATA['
        + 'Rota: ' + (p.rota || '-') + '<br>'
        + 'Alimentador: ' + (p.alimentador || '-') + '<br>'
        + 'Poste: ' + (p.poste || 'NÃO INFORMADO') + '<br>'
        + 'Espécie: ' + (p.especie || '-') + '<br>'
        + 'Altura: ' + (p.altura || '-') + ' m<br>'
        + 'DAP: ' + (p.dap || '-') + ' cm<br>'
        + 'Data: ' + (p.data || '-')
        + ']]></description>\n';
      k += '<Point><coordinates>' + p.lon + ',' + p.lat + ',0</coordinates></Point>\n</Placemark>\n';
    });
    return k + '</Document>\n</kml>';
  }

  function exportar(formato) {
    if (!registros.length) {
      if (typeof showToast === 'function') showToast('Selecione uma equipe com dados primeiro.', 'error');
      return;
    }
    var sel = document.getElementById('export-equipe');
    var escolha = sel ? sel.value : '';
    var nome = escolha === '__todas__' ? 'todas' : escolha;
    var base = 'VERA_' + slug(nome) + '_' + new Date().toISOString().slice(0, 10);

    if (formato === 'kml') baixarArquivo(base + '.kml', montarKML(nome), 'application/vnd.google-earth.kml+xml');
    else baixarArquivo(base + '.csv', montarCSV(), 'text/csv');
  }

  // ---- instalacao ----------------------------------------------------------

  function ajustarSelect() {
    var sel = document.getElementById('export-equipe');
    if (!sel || sel.dataset.veraOk) return;
    sel.innerHTML = '<option value="">Selecione a equipe...</option>'
      + EQUIPES.map(function (e) { return '<option>' + e + '</option>'; }).join('')
      + '<option value="__todas__">Todas as equipes</option>';
    sel.dataset.veraOk = '1';
  }

  function instalar() {
    window.carregarDadosEquipe = carregar;
    window.exportarDadosAdmin  = exportar;
    ajustarSelect();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', instalar);
  else instalar();
  // o painel admin so e montado depois do login, entao reforça o ajuste
  setTimeout(instalar, 1500);
  setTimeout(instalar, 5000);
})();
