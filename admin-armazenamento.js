(function () {
  'use strict';

  // Painel de acompanhamento de armazenamento da base (repositorio VERA).
  // Mostra quanto as fotos e os dados estao ocupando e avisa quando a base
  // esta crescendo demais, para o admin ir acompanhando.
  if (window.__veraArmazenamento) return;
  window.__veraArmazenamento = true;

  var REPO = 'LGRSV/vera-vegetacao';
  var LIMITE_PADRAO_MB = 1024;            // orcamento de referencia (1 GB, limite recomendado do GitHub)
  var CHAVE_LIMITE = 'vera_armazenamento_limite_mb';
  var estado = { carregando: false, painel: null, dados: null };

  function esc(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>'"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c];
    });
  }

  function limiteMB() {
    var v = 0;
    try { v = parseFloat(localStorage.getItem(CHAVE_LIMITE) || ''); } catch (e) {}
    return v && v > 0 ? v : LIMITE_PADRAO_MB;
  }

  function mb(bytes) { return bytes / 1048576; }

  function fmtMB(bytes) {
    var v = mb(bytes);
    if (v >= 100) return v.toFixed(0) + ' MB';
    if (v >= 10) return v.toFixed(1) + ' MB';
    if (v >= 1) return v.toFixed(2) + ' MB';
    return (bytes / 1024).toFixed(0) + ' KB';
  }

  function status(texto) {
    var campo = document.getElementById('vera-armazenamento-status');
    if (campo) campo.textContent = texto;
  }

  // Nivel de alerta em funcao do quanto da base foi usado.
  function nivel(pct) {
    if (pct >= 85) return { chave: 'critico', cor: '#b3261e', fundo: '#fdecea', rotulo: 'Crítico', dica: 'Base quase no limite. Mantenha apenas 1 foto por ponto e arquive lotes antigos.' };
    if (pct >= 60) return { chave: 'atencao', cor: '#9a6a12', fundo: '#fdf6e3', rotulo: 'Atenção', dica: 'A base está crescendo. Fique de olho nas fotos por ponto.' };
    return { chave: 'ok', cor: '#1f7a43', fundo: '#eef7f0', rotulo: 'Tranquilo', dica: 'Espaço sob controle.' };
  }

  function agrupar(blobs) {
    function soma(pref) {
      var n = 0, bytes = 0;
      for (var i = 0; i < blobs.length; i++) {
        if (blobs[i].path.indexOf(pref) === 0) { n++; bytes += blobs[i].size || 0; }
      }
      return { n: n, bytes: bytes };
    }
    var enecol = soma('fotos/Enecol-Centro/');
    var energisa = soma('fotos/Equipe-Energisa/');
    var fotos = soma('fotos/');
    var dados = soma('dados/');
    var total = { n: blobs.length, bytes: blobs.reduce(function (t, b) { return t + (b.size || 0); }, 0) };
    var outros = { n: total.n - fotos.n - dados.n, bytes: total.bytes - fotos.bytes - dados.bytes };
    // pontos e fotos por ponto na Enecol Centro
    var pontos = {};
    for (var j = 0; j < blobs.length; j++) {
      var p = blobs[j].path;
      if (p.indexOf('fotos/Enecol-Centro/') !== 0) continue;
      var m = p.split('/').pop().match(/^(VER\d+)/i);
      if (m) pontos[m[1]] = true;
    }
    enecol.pontos = Object.keys(pontos).length;
    return { total: total, fotos: fotos, enecol: enecol, energisa: energisa, dados: dados, outros: outros };
  }

  async function viaArvore() {
    var url = 'https://api.github.com/repos/' + REPO + '/git/trees/main?recursive=1&t=' + Date.now();
    var r = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error('GitHub árvore HTTP ' + r.status);
    var d = await r.json();
    var blobs = (Array.isArray(d.tree) ? d.tree : []).filter(function (x) { return x && x.type === 'blob'; });
    if (!blobs.length) throw new Error('árvore vazia');
    var g = agrupar(blobs);
    g.truncado = !!d.truncated;
    g.fonte = 'árvore';
    return g;
  }

  // Fallback quando a arvore falha (ex.: limite de requisicoes): so o tamanho total do repo.
  async function viaResumo() {
    var r = await fetch('https://api.github.com/repos/' + REPO + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('GitHub repo HTTP ' + r.status);
    var d = await r.json();
    var bytes = (Number(d.size) || 0) * 1024; // API devolve em KB
    return { total: { n: null, bytes: bytes }, fotos: null, enecol: null, energisa: null, dados: null, outros: null, fonte: 'resumo' };
  }

  async function coletar() {
    try { return await viaArvore(); }
    catch (e1) {
      try { var r = await viaResumo(); r.aviso = 'Detalhamento indisponível (' + (e1.message || e1) + ') — mostrando só o total.'; return r; }
      catch (e2) { throw new Error(String(e1.message || e1) + ' · ' + String(e2.message || e2)); }
    }
  }

  function linha(rotulo, item, cor) {
    if (!item) return '';
    var det = item.n != null ? item.n + (item.pontos != null ? ' fotos · ' + item.pontos + ' pontos' : ' arq') : '';
    return '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:5px 0;border-bottom:1px solid #e6efe8;">'
      + '<span style="font-size:11px;color:#3f5647;"><b style="color:' + (cor || '#173b2b') + ';">■</b> ' + esc(rotulo) + (det ? ' <span style="color:#7c9184;">· ' + esc(det) + '</span>' : '') + '</span>'
      + '<b style="font-size:11px;color:#173b2b;white-space:nowrap;">' + esc(fmtMB(item.bytes)) + '</b></div>';
  }

  function render() {
    var painel = estado.painel;
    if (!painel) return;
    var d = estado.dados;
    var total = document.getElementById('vera-armazenamento-total');
    var corpo = document.getElementById('vera-armazenamento-corpo');
    if (!d) { if (total) total.textContent = 'Carregando…'; return; }

    var lim = limiteMB();
    var usadoMB = mb(d.total.bytes);
    var pct = Math.min(100, (usadoMB / lim) * 100);
    var nv = nivel(pct);

    if (total) total.textContent = fmtMB(d.total.bytes);

    var barra = '<div style="margin:10px 0 4px;height:12px;border-radius:7px;background:#e6efe8;overflow:hidden;">'
      + '<div style="height:100%;width:' + pct.toFixed(1) + '%;background:' + nv.cor + ';transition:width .4s;"></div></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:10px;color:#6a8175;">'
      + '<span>' + usadoMB.toFixed(1) + ' MB de ' + lim + ' MB</span><span>' + pct.toFixed(1) + '%</span></div>';

    var selo = '<span style="display:inline-block;padding:3px 8px;border-radius:20px;font-size:10px;font-weight:800;color:' + nv.cor + ';background:' + nv.fundo + ';">' + esc(nv.rotulo) + '</span>';

    var detalhe = '';
    if (d.fonte === 'árvore') {
      detalhe = '<div style="margin-top:10px;">'
        + linha('Fotos · Enecol Centro', d.enecol, '#2e8b57')
        + linha('Fotos · Equipe Energisa', d.energisa, '#a85524')
        + linha('Dados dos pontos (JSON)', d.dados, '#2467a8')
        + linha('Outros arquivos', d.outros, '#8a8f98')
        + '</div>';
      if (d.enecol && d.enecol.pontos) {
        var mediaEnecol = (d.enecol.n / d.enecol.pontos);
        detalhe += '<div style="margin-top:8px;font-size:10px;color:#6a8175;">Enecol Centro: ' + mediaEnecol.toFixed(1) + ' foto(s) por ponto em média.'
          + (mediaEnecol > 1.2 ? ' Reduzir para 1 por ponto liberaria espaço.' : '') + '</div>';
      }
    } else if (d.aviso) {
      detalhe = '<div style="margin-top:10px;font-size:10px;color:#9a6a12;">' + esc(d.aviso) + '</div>';
    }

    corpo.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-top:2px;">' + selo
      + '<span style="font-size:11px;color:#3f5647;">' + esc(nv.dica) + '</span></div>'
      + barra + detalhe;
  }

  async function atualizar() {
    if (estado.carregando) return;
    estado.carregando = true;
    status('Consultando o tamanho da base no GitHub…');
    try {
      estado.dados = await coletar();
      render();
      var quando = new Date();
      var hh = ('0' + quando.getHours()).slice(-2) + ':' + ('0' + quando.getMinutes()).slice(-2);
      status('Atualizado às ' + hh + (estado.dados.truncado ? ' · lista muito grande, valores aproximados.' : '.'));
    } catch (e) {
      status('Não foi possível medir a base: ' + String(e && e.message ? e.message : e) + '. Toque em Atualizar para tentar de novo.');
    } finally {
      estado.carregando = false;
    }
  }

  function editarLimite() {
    var atual = limiteMB();
    var resp = window.prompt('Limite de referência da base, em MB (a barra fica cheia neste valor):', String(atual));
    if (resp == null) return;
    var v = parseFloat(String(resp).replace(',', '.'));
    if (!v || v <= 0) { alert('Informe um número de MB maior que zero.'); return; }
    try { localStorage.setItem(CHAVE_LIMITE, String(v)); } catch (e) {}
    render();
  }

  function montarPainel() {
    var elementoMapa = document.getElementById('admin-map');
    if (!elementoMapa) return false;

    var painel = document.getElementById('vera-armazenamento');
    if (!painel) {
      painel = document.createElement('section');
      painel.id = 'vera-armazenamento';
      // Fica acima do painel de historico (ou do mapa, se ele ainda nao existir).
      var historico = document.getElementById('vera-historico-completo');
      var ancora = historico || elementoMapa;
      ancora.parentElement.insertBefore(painel, ancora);
    }

    painel.style.cssText = 'margin:8px 0 12px;padding:12px;border:1px solid #c9dfce;border-radius:12px;background:#f8fbf8;';
    painel.innerHTML = '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">'
      + '<div><div style="font-size:13px;font-weight:800;color:#173b2b;">Armazenamento da base</div>'
      + '<div style="font-size:11px;line-height:1.35;color:#5e7666;margin-top:3px;">Acompanhe o quanto as fotos e os dados ocupam no repositório.</div></div>'
      + '<b id="vera-armazenamento-total" style="font-size:16px;color:#173b2b;white-space:nowrap;">Carregando…</b></div>'
      + '<div id="vera-armazenamento-corpo"></div>'
      + '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:11px;">'
      + '<button type="button" id="vera-armazenamento-atualizar" style="padding:8px 10px;border:1px solid #b9d2bf;border-radius:8px;background:#fff;color:#173b2b;font:700 11px inherit;cursor:pointer;">↻ Atualizar</button>'
      + '<button type="button" id="vera-armazenamento-limite" style="padding:8px 10px;border:1px solid #b9d2bf;border-radius:8px;background:#fff;color:#173b2b;font:700 11px inherit;cursor:pointer;">Ajustar limite</button></div>'
      + '<div id="vera-armazenamento-status" style="margin-top:9px;font-size:11px;line-height:1.35;color:#577062;">Preparando…</div>';

    estado.painel = painel;
    document.getElementById('vera-armazenamento-atualizar').addEventListener('click', atualizar);
    document.getElementById('vera-armazenamento-limite').addEventListener('click', editarLimite);
    render();
    return true;
  }

  function iniciar() {
    if (!montarPainel()) { setTimeout(iniciar, 300); return; }
    if (!estado.dados) atualizar();
  }

  new MutationObserver(function () {
    if (!estado.painel || !document.body.contains(estado.painel)) iniciar();
  }).observe(document.documentElement, { childList: true, subtree: true });

  iniciar();
})();
