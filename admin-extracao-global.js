/*
 * VERA - Painel "Extracao global" na aba Admin
 *
 * Junta num lugar so o que antes exigia varias idas ao repositorio:
 *   - CSV global de todas as equipes, ja no padrao da planilha (com a coluna AL);
 *   - CSV de uma rota especifica;
 *   - fotos ja armazenadas no servidor, por rota, em .zip - divididas em partes
 *     para nao estourar a memoria do celular.
 *
 * Tudo pelo raw.githubusercontent.com: nao consome cota da API, nao esbarra no
 * limite de 1000 arquivos por pasta e funciona em aparelho sem token. O .zip e
 * montado pelo proprio modulo, sem biblioteca de CDN.
 *
 * O download antigo ("Baixar fotos de todas as equipes") disparava um download
 * por foto - 2500 downloads soltos - e listava pela API, entao parava em 1000.
 */
(function () {
  'use strict';

  var REPO = 'LGRSV/vera-vegetacao';
  var RAW  = 'https://raw.githubusercontent.com/' + REPO + '/main/';

  var EQUIPES = ['Enecol Centro', 'Equipe Energisa', 'Enecol Sul', 'Equipe 01 — Norte'];
  var FOTOS_POR_PARTE = 300;      // ~18 MB por arquivo
  var SIMULTANEAS = 6;            // downloads em paralelo

  var base = null;                // pontos ja carregados e tratados
  var ocupado = false;

  // ---- utilitarios ---------------------------------------------------------

  function slug(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function nomeArquivo(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function escCSV(v) {
    var s = (v === undefined || v === null) ? '' : String(v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function estado(txt) {
    var el = document.getElementById('vg-status');
    if (el) el.textContent = txt;
  }

  function parseCSV(texto) {
    var linhas = [], campo = '', linha = [], aspas = false;
    texto = texto.replace(/^﻿/, '');
    for (var i = 0; i < texto.length; i++) {
      var c = texto[i];
      if (aspas) {
        if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
        else campo += c;
      }
      else if (c === '"') aspas = true;
      else if (c === ',') { linha.push(campo); campo = ''; }
      else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
      else if (c !== '\r') campo += c;
    }
    if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
    return linhas;
  }

  function baixar(nome, conteudo, tipo) {
    var blob = (conteudo instanceof Blob) ? conteudo : new Blob([conteudo], { type: tipo + ';charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  // ---- carga da base -------------------------------------------------------

  async function lerEquipe(equipe) {
    var r;
    try { r = await fetch(RAW + 'exportacoes/' + slug(equipe) + '.csv?t=' + Date.now(), { cache: 'no-store' }); }
    catch (e) { return []; }
    if (!r.ok) return [];

    var linhas = parseCSV(await r.text());
    if (linhas.length < 2) return [];
    var idx = {};
    linhas[0].forEach(function (h, i) { idx[h.trim()] = i; });

    var out = [];
    for (var i = 1; i < linhas.length; i++) {
      var l = linhas[i];
      if (!l || l.length < 3) continue;
      var v = function (n) { return idx[n] === undefined ? '' : (l[idx[n]] || ''); };
      out.push({
        id: v('Ponto'), rota: v('Projeto'), equipe: v('Equipe') || equipe,
        data: v('Data/hora'), especie: v('Espécie'), poste: v('Poste'), area: v('Área'),
        altura: v('Altura (m)'), dap: v('DAP (cm)'), acesso: v('Acesso'),
        dtbt: v('Dist. BT (cm)'), dtmt: v('Dist. MT (cm)'), dtat: v('Dist. AT (cm)'),
        lat: v('Latitude'), lon: v('Longitude'),
        fotos: parseInt(v('Qtd fotos'), 10) || 0
      });
    }
    return out;
  }

  // Mesma regra da exportacao: o reenvio em massa criou copias com a mesma
  // coordenada e o mesmo horario; a copia veio sem foto, entao fica a original.
  function tirarDuplicados(lista) {
    var g = {};
    lista.forEach(function (p) { var k = p.lat + '|' + p.lon + '|' + p.data; (g[k] = g[k] || []).push(p); });
    var out = [], removidos = 0;
    Object.keys(g).forEach(function (k) {
      g[k].sort(function (a, b) { return (b.fotos - a.fotos) || String(a.id).localeCompare(String(b.id)); });
      out.push(g[k][0]); removidos += g[k].length - 1;
    });
    out.sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); });
    return { pontos: out, removidos: removidos };
  }

  async function carregarBase() {
    if (base) return base;
    estado('Carregando base…');

    var mapa = { porPonto: {}, porRota: {} };
    try {
      var rm = await fetch(RAW + 'exportacoes/alimentador-por-ponto.json?t=' + Date.now(), { cache: 'no-store' });
      if (rm.ok) {
        var j = await rm.json();
        mapa.porPonto = j.porPonto || {};
        mapa.porRota  = j.porRota  || {};
      }
    } catch (e) {}

    var todos = [];
    for (var i = 0; i < EQUIPES.length; i++) {
      todos = todos.concat(await lerEquipe(EQUIPES[i]));
      estado('Carregando base… ' + todos.length + ' registro(s)');
    }

    // Os 6 registros da Equipe Energisa e os 2 avulsos das outras equipes sao
    // testes antigos, sem rota: ficam de fora da extracao.
    todos = todos.filter(function (p) { return String(p.rota || '').trim(); });

    var r = tirarDuplicados(todos);
    r.pontos.forEach(function (p) {
      var v = mapa.porPonto[p.equipe + '|' + p.id] || mapa.porRota[p.rota] || '';
      p.alimentador = v ? (v.split('|')[1] || '') : '';
    });

    base = { pontos: r.pontos, removidos: r.removidos };
    return base;
  }

  // ---- CSV -----------------------------------------------------------------

  var COLUNAS = ['WKT', 'ID', 'AL', 'DATA', 'POSTE', 'ESPECIE', 'LATITUDE', 'LONGITUDE',
    'ALTURA(M)', 'DT BT(cm)', 'DT MT(cm)', 'DT AT(cm)', 'DAP (cm)', 'Area',
    'Acesso LV', 'IDs_Fotos', 'mês', 'ano'];

  function nomesFotos(p) {
    var out = [];
    for (var i = 1; i <= (p.fotos || 0); i++) out.push('VER' + String(p.id).replace(/^V/, '') + 'F' + i + '.jpg');
    return out;
  }

  function montarCSV(pontos) {
    var linhas = [COLUNAS.join(';')];
    pontos.forEach(function (p) {
      var m = String(p.data || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
      var wkt = (p.lat && p.lon)
        ? 'POINT (' + Number(p.lon).toFixed(6) + ' ' + Number(p.lat).toFixed(6) + ')' : '';
      linhas.push([
        wkt, p.id, p.alimentador, p.data, p.poste || 'NÃO INFORMADO', p.especie,
        p.lat, p.lon, p.altura, p.dtbt, p.dtmt, p.dtat, p.dap, p.area, p.acesso,
        nomesFotos(p).join(' | '), m ? String(Number(m[2])) : '', m ? m[3] : ''
      ].map(escCSV).join(';'));
    });
    return '﻿' + linhas.join('\r\n') + '\r\n';
  }

  var hoje = function () { return new Date().toISOString().slice(0, 10); };

  async function csvGlobal() {
    if (ocupado) return;
    ocupado = true;
    try {
      var b = await carregarBase();
      baixar('VERA-TODOS-os-pontos_' + hoje() + '.csv', montarCSV(b.pontos), 'text/csv');
      estado(b.pontos.length + ' ponto(s) exportados'
        + (b.removidos ? ' — ' + b.removidos + ' duplicados de reenvio removidos' : '') + '.');
    } catch (e) {
      estado('Falhou: ' + (e && e.message ? e.message : e));
    } finally { ocupado = false; }
  }

  async function csvDaRota() {
    if (ocupado) return;
    var rota = document.getElementById('vg-rota').value;
    if (!rota) { estado('Escolha uma rota.'); return; }
    ocupado = true;
    try {
      var b = await carregarBase();
      var pts = b.pontos.filter(function (p) { return p.rota === rota; });
      baixar('VERA-' + nomeArquivo(rota) + '_' + hoje() + '.csv', montarCSV(pts), 'text/csv');
      estado(pts.length + ' ponto(s) de ' + rota + '.');
    } catch (e) {
      estado('Falhou: ' + (e && e.message ? e.message : e));
    } finally { ocupado = false; }
  }

  // ---- fotos ---------------------------------------------------------------

  // ZIP montado aqui mesmo, sem biblioteca externa: foto ja e JPEG comprimido,
  // entao os arquivos entram sem compressao (metodo "store"). Evita depender de
  // CDN, que costuma ser bloqueado na rede da concessionaria.
  var TABELA_CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function dosData(d) {
    var hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2);
    var data = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { hora: hora & 0xFFFF, data: data & 0xFFFF };
  }

  // arquivos: [{ nome, bytes: Uint8Array }]
  function montarZip(arquivos) {
    var enc = new TextEncoder();
    var agora = dosData(new Date());
    var partes = [], central = [], deslocamento = 0;

    arquivos.forEach(function (a) {
      var nome = enc.encode(a.nome);
      var crc = crc32(a.bytes);
      var tam = a.bytes.length;

      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034B50, true);
      lh.setUint16(4, 20, true);          // versao necessaria
      lh.setUint16(6, 0x0800, true);      // nome em UTF-8
      lh.setUint16(8, 0, true);           // metodo: store
      lh.setUint16(10, agora.hora, true);
      lh.setUint16(12, agora.data, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, tam, true);
      lh.setUint32(22, tam, true);
      lh.setUint16(26, nome.length, true);
      partes.push(new Uint8Array(lh.buffer), nome, a.bytes);

      var cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014B50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, agora.hora, true);
      cd.setUint16(14, agora.data, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, tam, true);
      cd.setUint32(24, tam, true);
      cd.setUint16(28, nome.length, true);
      cd.setUint32(42, deslocamento, true);
      central.push(new Uint8Array(cd.buffer), nome);

      deslocamento += 30 + nome.length + tam;
    });

    var inicioCentral = deslocamento;
    var tamCentral = central.reduce(function (a, b) { return a + b.length; }, 0);
    var fim = new DataView(new ArrayBuffer(22));
    fim.setUint32(0, 0x06054B50, true);
    fim.setUint16(8, arquivos.length, true);
    fim.setUint16(10, arquivos.length, true);
    fim.setUint32(12, tamCentral, true);
    fim.setUint32(16, inicioCentral, true);

    return new Blob(partes.concat(central, [new Uint8Array(fim.buffer)]), { type: 'application/zip' });
  }

  // lista de {url, nome, pasta} de uma rota
  function fotosDaRota(pontos) {
    var itens = [];
    pontos.forEach(function (p) {
      var d = String(p.data || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
      var dia = d ? (d[3] + '-' + d[2] + '-' + d[1]) : 'sem-data';
      nomesFotos(p).forEach(function (nome) {
        itens.push({
          nome: nome, pasta: dia,
          url: RAW + 'fotos/' + String(p.equipe).replace(/\s+/g, '-') + '/' + nome
        });
      });
    });
    return itens;
  }

  async function baixarLote(arquivos, itens, aoAndar) {
    var i = 0, falhas = 0, prontos = 0;
    async function trabalhador() {
      while (i < itens.length) {
        var it = itens[i++];
        try {
          var r = await fetch(it.url + '?t=' + Date.now(), { cache: 'no-store' });
          if (r.ok) {
            arquivos.push({ nome: it.pasta + '/' + it.nome, bytes: new Uint8Array(await r.arrayBuffer()) });
          } else falhas++;
        } catch (e) { falhas++; }
        aoAndar(++prontos);
      }
    }
    var eq = [];
    for (var k = 0; k < SIMULTANEAS; k++) eq.push(trabalhador());
    await Promise.all(eq);
    return falhas;
  }

  async function fotosDaRotaZip() {
    if (ocupado) return;
    var rota = document.getElementById('vg-rota').value;
    if (!rota) { estado('Escolha uma rota.'); return; }
    ocupado = true;
    try {
      var b = await carregarBase();
      var pts = b.pontos.filter(function (p) { return p.rota === rota; });
      var itens = fotosDaRota(pts);
      if (!itens.length) { estado('Esta rota não tem foto no servidor.'); return; }

      var partes = Math.ceil(itens.length / FOTOS_POR_PARTE);
      var falhasTotal = 0;

      for (var parte = 0; parte < partes; parte++) {
        var fatia = itens.slice(parte * FOTOS_POR_PARTE, (parte + 1) * FOTOS_POR_PARTE);
        var arquivos = [];
        var rotulo = 'parte' + (parte + 1) + 'de' + partes;

        /* jshint loopfunc:true */
        falhasTotal += await baixarLote(arquivos, fatia, (function (p, tot) {
          return function (n) {
            estado('Fotos de ' + rota + ' — ' + rotulo + ': ' + n + '/' + tot
              + ' (' + (p * FOTOS_POR_PARTE + n) + ' de ' + itens.length + ')');
          };
        })(parte, fatia.length));

        estado('Montando ' + rotulo + '…');
        arquivos.sort(function (a, b) { return a.nome.localeCompare(b.nome); });
        baixar('Fotos-' + nomeArquivo(rota) + '-' + rotulo + '.zip', montarZip(arquivos));
        await new Promise(function (r) { setTimeout(r, 1200); });   // deixa o navegador salvar
      }

      estado(itens.length + ' foto(s) de ' + rota + ' em ' + partes + ' arquivo(s)'
        + (falhasTotal ? ' — ' + falhasTotal + ' não vieram do servidor' : '') + '.');
    } catch (e) {
      estado('Falhou: ' + (e && e.message ? e.message : e));
    } finally { ocupado = false; }
  }

  async function linksDaRota() {
    if (ocupado) return;
    var rota = document.getElementById('vg-rota').value;
    if (!rota) { estado('Escolha uma rota.'); return; }
    ocupado = true;
    try {
      var b = await carregarBase();
      var itens = fotosDaRota(b.pontos.filter(function (p) { return p.rota === rota; }));
      var linhas = ['ARQUIVO;DIA;LINK'].concat(itens.map(function (i) {
        return [i.nome, i.pasta, i.url].map(escCSV).join(';');
      }));
      baixar('Links-fotos-' + nomeArquivo(rota) + '.csv', '﻿' + linhas.join('\r\n') + '\r\n', 'text/csv');
      estado(itens.length + ' link(s) — use num gerenciador de downloads se preferir.');
    } catch (e) {
      estado('Falhou: ' + (e && e.message ? e.message : e));
    } finally { ocupado = false; }
  }

  // ---- painel --------------------------------------------------------------

  async function preencherRotas() {
    var sel = document.getElementById('vg-rota');
    if (!sel) return;
    var b = await carregarBase();
    var porRota = {};
    b.pontos.forEach(function (p) {
      var r = porRota[p.rota] = porRota[p.rota] || { n: 0, f: 0 };
      r.n++; r.f += (p.fotos || 0);
    });
    var nomes = Object.keys(porRota).sort();
    sel.innerHTML = '<option value="">Selecione a rota…</option>' + nomes.map(function (r) {
      return '<option value="' + r.replace(/"/g, '&quot;') + '">' + r
        + ' — ' + porRota[r].n + ' pts / ' + porRota[r].f + ' fotos</option>';
    }).join('');
    estado(b.pontos.length + ' ponto(s) no servidor, em ' + nomes.length + ' rota(s)'
      + (b.removidos ? ' — ' + b.removidos + ' duplicados de reenvio ignorados' : '') + '.');
  }

  var HTML =
    '<div class="rota-form" id="vera-extracao-global" style="margin-top:18px;">' +
      '<div class="rota-form-title">Extração global</div>' +
      '<p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">' +
        'Tudo direto do servidor, já sem os duplicados de reenvio e com a coluna AL preenchida.' +
      '</p>' +
      '<button class="btn-export" id="vg-csv-global" style="width:100%;justify-content:center;margin-bottom:12px;">' +
        'Baixar CSV global (todas as equipes)</button>' +
      '<label class="field-label">Rota</label>' +
      '<select class="field-input" id="vg-rota" style="margin-bottom:10px;">' +
        '<option value="">Carregando rotas…</option></select>' +
      '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
        '<button class="btn-export" id="vg-csv-rota" style="flex:1;justify-content:center;">CSV da rota</button>' +
        '<button class="btn-export" id="vg-fotos-rota" style="flex:1;justify-content:center;background:var(--green-mid);">Fotos da rota (.zip)</button>' +
      '</div>' +
      '<button class="btn-export" id="vg-links-rota" style="width:100%;justify-content:center;background:#5C6BC0;">' +
        'Baixar só a lista de links das fotos</button>' +
      '<div id="vg-status" style="font-size:12px;color:var(--text-muted);margin-top:10px;min-height:16px;"></div>' +
      '<p style="font-size:10px;color:var(--text-muted);margin-top:6px;">' +
        'As fotos saem em partes de ' + FOTOS_POR_PARTE + ' para não pesar no celular. ' +
        'Cada arquivo abre em pastas por dia de coleta.</p>' +
    '</div>';

  function instalar() {
    if (document.getElementById('vera-extracao-global')) return;
    // ancora: o bloco de exportacao que ja existe na aba admin
    var ancora = document.getElementById('export-equipe');
    ancora = ancora && ancora.closest ? ancora.closest('.rota-form') : null;
    if (!ancora || !ancora.parentNode) return;

    ancora.insertAdjacentHTML('afterend', HTML);
    document.getElementById('vg-csv-global').onclick  = csvGlobal;
    document.getElementById('vg-csv-rota').onclick    = csvDaRota;
    document.getElementById('vg-fotos-rota').onclick  = fotosDaRotaZip;
    document.getElementById('vg-links-rota').onclick  = linksDaRota;
    preencherRotas().catch(function (e) { estado('Não consegui listar as rotas: ' + e.message); });
  }

  // o painel admin so existe depois do login, entao tenta algumas vezes
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', instalar);
  else instalar();
  var tentativas = 0;
  var timer = setInterval(function () {
    instalar();
    if (document.getElementById('vera-extracao-global') || ++tentativas > 60) clearInterval(timer);
  }, 1000);
})();
