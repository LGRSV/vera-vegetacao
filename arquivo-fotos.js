(function () {
  'use strict';

  // Arquivo de pontos e fotos — dentro da aba Registros.
  //
  // A aba Registros mostra só o que está no banco local do aparelho
  // (dbGetAll('points')), então o técnico não enxerga nada do que já foi
  // arquivado: rota concluída, ponto feito por outro aparelho, ou serviço de
  // antes de o celular ser formatado.
  //
  // Isto acrescenta um seletor no topo da aba: "Neste aparelho" (o que já
  // existia) e "Arquivo" (tudo que está no repositório).
  //
  // CUSTO DE ESPAÇO: nenhum. As fotos já estão no repositório e são servidas
  // pelo CDN do GitHub. O único arquivo novo é o manifesto de 3 KB, que existe
  // porque o raw.githubusercontent não lista diretório — sem ele o app não teria
  // como saber quais projetos existem. Os índices por projeto são os
  // exportacoes/projetos/<slug>/pontos.csv que o app já gera (4 a 212 KB cada).
  //
  // CUSTO DE DADOS no celular: só o que ele abrir. As miniaturas usam
  // loading="lazy" e a lista é paginada, então rolar a tela busca algumas
  // dezenas de fotos de ~56 KB, não as 7.245.
  //
  // Os ids das fotos são derivados do id do ponto ("VER" + id sem o V + "F" +
  // número), regra conferida em 2.676 pontos sem uma única divergência. As 806
  // fotos de Porto Nacional que nunca subiram simplesmente não aparecem: o
  // onerror remove a miniatura em vez de deixar um quadro quebrado.

  if (window.__veraArquivoFotos) return;
  window.__veraArquivoFotos = true;

  var RAW = 'https://raw.githubusercontent.com/LGRSV/vera-vegetacao/main';
  var PAGINA = 60;

  var manifesto = null;
  var projetoAberto = null;     // {…, linhas:[…]}
  var mostrando = 0;
  var montado = false;

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>'"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c];
    });
  }

  async function pegar(caminho, comoTexto) {
    var r = await fetch(RAW + '/' + caminho + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(caminho + ' HTTP ' + r.status);
    return comoTexto ? r.text() : r.json();
  }

  // CSV do app: aspas duplas com escape por duplicação
  function lerCsv(txt) {
    var linhas = [], campo = '', linha = [], dentro = false;
    for (var i = 0; i < txt.length; i++) {
      var c = txt[i];
      if (dentro) {
        if (c === '"') { if (txt[i+1] === '"') { campo += '"'; i++; } else dentro = false; }
        else campo += c;
      } else if (c === '"') dentro = true;
      else if (c === ',') { linha.push(campo); campo = ''; }
      else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
      else if (c !== '\r') campo += c;
    }
    if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
    if (!linhas.length) return [];
    var cab = linhas.shift();
    return linhas.filter(function (l) { return l.length > 1; }).map(function (l) {
      var o = {};
      cab.forEach(function (k, j) { o[k] = l[j]; });
      return o;
    });
  }

  function urlFoto(idPonto, pasta, n) {
    return RAW + '/fotos/' + pasta + '/VER' + String(idPonto).slice(1) + 'F' + n + '.jpg';
  }

  // O onerror precisa estar no atributo, preso pelo parser. Anexando depois de
  // inserir o HTML havia corrida: a imagem que falha antes do addEventListener
  // nunca dispara o handler e o quadro quebrado fica na tela (27 casos em Porto
  // Nacional, onde faltam as fotos que nunca subiram).
  window.veraFotoFalhou = function (im) {
    im.style.display = 'none';
    if (im.parentNode && im.parentNode.classList) im.parentNode.classList.add('sem-foto');
  };

  function alvo() { return document.getElementById('vera-arq-conteudo'); }

  // ── nível 1: projetos ──────────────────────────────────────────────────
  async function verProjetos() {
    projetoAberto = null;
    var el = alvo(); if (!el) return;
    el.innerHTML = '<div class="vaq-vazio">Carregando o arquivo…</div>';
    try {
      if (!manifesto) manifesto = await pegar('exportacoes/indice-arquivo.json');
    } catch (e) {
      el.innerHTML = '<div class="vaq-vazio">Não deu para carregar o arquivo agora.<br>Verifique a conexão e toque de novo.</div>';
      return;
    }
    var eu = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
    var lista = manifesto.projetos.filter(function (p) {
      return !eu || eu === 'Admin' || p.equipe === eu;
    });
    if (!lista.length) { el.innerHTML = '<div class="vaq-vazio">Nenhum projeto arquivado para esta equipe.</div>'; return; }

    var h = '<div class="vaq-resumo">' + manifesto.total_pontos.toLocaleString('pt-BR') +
            ' pontos e ' + manifesto.total_fotos.toLocaleString('pt-BR') +
            ' fotos guardados. As fotos são baixadas só quando você abre.</div>';
    lista.forEach(function (p) {
      h += '<button type="button" class="vaq-proj" data-slug="' + esc(p.slug) + '">' +
             '<span class="vaq-proj-nome">' + esc(p.nome) + '</span>' +
             '<span class="vaq-proj-num">' + p.pontos + ' pontos · ' + p.fotos + ' fotos' +
               (p.fotos_ausentes ? ' <em>· ' + p.fotos_ausentes + ' não enviadas</em>' : '') + '</span>' +
             '<span class="vaq-proj-meta">' + esc(p.de || '') + ' — ' + esc(p.ate || '') +
               (p.especie_top ? ' · ' + esc(p.especie_top) : '') + '</span>' +
           '</button>';
    });
    el.innerHTML = h;
    el.querySelectorAll('.vaq-proj').forEach(function (b) {
      b.onclick = function () { verPontos(b.getAttribute('data-slug')); };
    });
  }

  // ── nível 2: pontos do projeto ─────────────────────────────────────────
  async function verPontos(slug) {
    var p = manifesto.projetos.filter(function (x) { return x.slug === slug; })[0];
    if (!p) return;
    var el = alvo(); if (!el) return;
    el.innerHTML = '<div class="vaq-vazio">Carregando ' + esc(p.nome) + '…</div>';
    try {
      var txt = await pegar('exportacoes/projetos/' + slug + '/pontos.csv', true);
      projetoAberto = Object.assign({}, p, { linhas: lerCsv(txt) });
    } catch (e) {
      el.innerHTML = '<div class="vaq-vazio">Não deu para carregar este projeto.</div>';
      return;
    }
    mostrando = 0;
    desenharPontos();
  }

  function desenharPontos() {
    var el = alvo(); if (!el || !projetoAberto) return;
    var p = projetoAberto;
    var fim = Math.min(p.linhas.length, mostrando + PAGINA);
    if (!mostrando) {
      el.innerHTML =
        '<button type="button" class="vaq-voltar" id="vaq-voltar">← Todos os projetos</button>' +
        '<div class="vaq-cab"><b>' + esc(p.nome) + '</b><span>' + p.pontos + ' pontos · ' + p.fotos + ' fotos</span></div>' +
        '<div class="vaq-grade" id="vaq-grade"></div>' +
        '<div id="vaq-mais"></div>';
      el.querySelector('#vaq-voltar').onclick = verProjetos;
    }
    var grade = el.querySelector('#vaq-grade');
    var h = '';
    for (var i = mostrando; i < fim; i++) {
      var r = p.linhas[i];
      var id = r['Ponto'];
      h += '<button type="button" class="vaq-cel" data-i="' + i + '">' +
             '<img loading="lazy" onerror="veraFotoFalhou(this)" src="' + esc(urlFoto(id, p.pasta_fotos, 1)) + '" alt="">' +
             '<span class="vaq-cel-esp">' + esc(r['Espécie'] || '—') + '</span>' +
             '<span class="vaq-cel-poste">' + esc(r['Poste'] || '') + '</span>' +
           '</button>';
    }
    grade.insertAdjacentHTML('beforeend', h);
    grade.querySelectorAll('.vaq-cel img').forEach(function (im) {
      if (im.complete && im.naturalWidth === 0) window.veraFotoFalhou(im);
    });
    grade.querySelectorAll('.vaq-cel').forEach(function (b) {
      if (b.__ok) return; b.__ok = 1;
      b.onclick = function () { verPonto(+b.getAttribute('data-i')); };
    });
    mostrando = fim;
    var mais = el.querySelector('#vaq-mais');
    mais.innerHTML = (mostrando < p.linhas.length)
      ? '<button type="button" class="vaq-mais" id="vaq-mais-btn">Carregar mais ' +
        Math.min(PAGINA, p.linhas.length - mostrando) + ' (de ' + p.linhas.length + ')</button>' : '';
    var bm = el.querySelector('#vaq-mais-btn');
    if (bm) bm.onclick = desenharPontos;
  }

  // ── nível 3: o ponto ───────────────────────────────────────────────────
  function verPonto(i) {
    var el = alvo(); if (!el || !projetoAberto) return;
    var p = projetoAberto, r = p.linhas[i];
    var qtd = parseInt(r['Qtd fotos'] || '0', 10) || 0;
    var fotos = '';
    for (var n = 1; n <= qtd; n++) {
      fotos += '<img class="vaq-foto" loading="lazy" onerror="veraFotoFalhou(this)" src="' +
               esc(urlFoto(r['Ponto'], p.pasta_fotos, n)) + '" alt="Foto ' + n + '">';
    }
    var campos = [['Espécie', r['Espécie']], ['Poste', r['Poste']], ['Data', r['Data/hora']],
                  ['Altura', r['Altura (m)'] ? r['Altura (m)'] + ' m' : ''], ['DAP', r['DAP (cm)'] ? r['DAP (cm)'] + ' cm' : ''],
                  ['Dist. BT', r['Dist. BT (cm)'] ? r['Dist. BT (cm)'] + ' cm' : ''],
                  ['Dist. MT', r['Dist. MT (cm)'] ? r['Dist. MT (cm)'] + ' cm' : ''],
                  ['Acesso', r['Acesso']], ['Área', r['Área']],
                  ['Coordenada', (r['Latitude'] || '') + ', ' + (r['Longitude'] || '')]];
    el.innerHTML =
      '<button type="button" class="vaq-voltar" id="vaq-volta2">← ' + esc(p.nome) + '</button>' +
      '<div class="vaq-cab"><b>' + esc(r['Espécie'] || 'Sem espécie') + '</b><span>' + esc(r['Ponto']) + '</span></div>' +
      '<div class="vaq-fotos">' + (fotos || '<div class="vaq-vazio">Sem foto neste ponto.</div>') + '</div>' +
      '<div class="vaq-campos">' + campos.filter(function (c) { return c[1]; }).map(function (c) {
        return '<div><span>' + c[0] + '</span><b>' + esc(c[1]) + '</b></div>'; }).join('') + '</div>';
    el.querySelector('#vaq-volta2').onclick = function () { mostrando = 0; desenharPontos(); };
    el.querySelectorAll('.vaq-foto').forEach(function (im) {
      if (im.complete && im.naturalWidth === 0) window.veraFotoFalhou(im);
    });
    var pan = document.getElementById('records-panel');
    if (pan) pan.scrollTop = 0;
  }

  // ── seletor no topo da aba Registros ───────────────────────────────────
  function montar() {
    if (montado) return true;
    var pan = document.getElementById('records-panel');
    if (!pan) return false;

    var st = document.createElement('style');
    st.textContent =
      '#vera-arq-sel{display:flex;gap:6px;margin:0 0 12px;background:#eef2ee;padding:4px;border-radius:10px;}' +
      '#vera-arq-sel button{flex:1;padding:9px 6px;border:none;border-radius:7px;background:none;cursor:pointer;' +
      'font-family:inherit;font-size:13px;font-weight:600;color:#5d6b5d;}' +
      '#vera-arq-sel button.on{background:#fff;color:#1a2e1a;box-shadow:0 1px 3px rgba(0,0,0,.12);}' +
      '.vaq-resumo{font-size:12px;color:#6b7a6b;line-height:1.5;margin-bottom:12px;padding:10px 12px;' +
      'background:#f6f8f6;border-radius:9px;}' +
      '.vaq-proj{display:block;width:100%;text-align:left;border:1px solid #e2e8e2;border-radius:11px;' +
      'padding:12px 13px;margin-bottom:8px;background:#fff;cursor:pointer;font-family:inherit;}' +
      '.vaq-proj-nome{display:block;font-size:14.5px;font-weight:700;color:#1a2e1a;}' +
      '.vaq-proj-num{display:block;font-size:12.5px;color:#2d5a27;font-weight:600;margin-top:3px;}' +
      '.vaq-proj-num em{color:#b26a00;font-style:normal;}' +
      '.vaq-proj-meta{display:block;font-size:11px;color:#93a093;margin-top:3px;}' +
      '.vaq-voltar{border:none;background:none;color:#2d5a27;font-weight:600;font-size:13px;cursor:pointer;' +
      'padding:2px 0 10px;font-family:inherit;}' +
      '.vaq-cab{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:10px;}' +
      '.vaq-cab b{font-size:15px;color:#1a2e1a;}' +
      '.vaq-cab span{font-size:11.5px;color:#6b7a6b;font-family:"SF Mono","Courier New",monospace;}' +
      '.vaq-grade{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;}' +
      '.vaq-cel{position:relative;border:none;padding:0;background:#e9eee9;border-radius:9px;overflow:hidden;' +
      'aspect-ratio:3/4;cursor:pointer;font-family:inherit;}' +
      '.vaq-cel img{width:100%;height:100%;object-fit:cover;display:block;}' +
      '.vaq-cel.sem-foto::after{content:"sem foto";position:absolute;inset:0;display:flex;align-items:center;' +
      'justify-content:center;font-size:10px;color:#9aa79a;}' +
      '.vaq-cel-esp{position:absolute;left:0;right:0;bottom:0;padding:12px 6px 4px;font-size:10.5px;' +
      'font-weight:700;color:#fff;text-align:left;background:linear-gradient(transparent,rgba(0,0,0,.72));' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.vaq-cel-poste{position:absolute;top:5px;right:5px;font-size:9px;color:#fff;background:rgba(0,0,0,.5);' +
      'padding:2px 5px;border-radius:4px;}' +
      '.vaq-mais{width:100%;margin-top:10px;padding:11px;border:1px solid #d3e0d3;border-radius:9px;' +
      'background:#fff;color:#2d5a27;font-weight:600;font-size:13px;cursor:pointer;font-family:inherit;}' +
      '.vaq-fotos{display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:14px;}' +
      '.vaq-foto{width:100%;border-radius:10px;display:block;background:#e9eee9;}' +
      '.vaq-campos{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#e2e8e2;border-radius:9px;overflow:hidden;}' +
      '.vaq-campos>div{background:#fff;padding:9px 11px;}' +
      '.vaq-campos span{display:block;font-size:10px;color:#93a093;text-transform:uppercase;letter-spacing:.04em;}' +
      '.vaq-campos b{font-size:13px;color:#1a2e1a;}' +
      '.vaq-vazio{padding:24px 14px;text-align:center;color:#6b7a6b;font-size:13px;line-height:1.5;}';
    document.head.appendChild(st);

    var sel = document.createElement('div');
    sel.id = 'vera-arq-sel';
    sel.innerHTML = '<button type="button" id="vaq-b-local" class="on">Neste aparelho</button>' +
                    '<button type="button" id="vaq-b-arq">Arquivo</button>';
    pan.insertBefore(sel, pan.firstChild);

    var caixa = document.createElement('div');
    caixa.id = 'vera-arq-conteudo';
    caixa.style.display = 'none';
    sel.parentNode.insertBefore(caixa, sel.nextSibling);

    // tudo que já existia na aba fica num invólucro, para alternar sem apagar nada
    var locais = [];
    for (var i = 0; i < pan.children.length; i++) {
      var c = pan.children[i];
      if (c !== sel && c !== caixa) locais.push(c);
    }
    function trocar(arquivo) {
      locais.forEach(function (c) { c.style.display = arquivo ? 'none' : ''; });
      caixa.style.display = arquivo ? '' : 'none';
      document.getElementById('vaq-b-local').classList.toggle('on', !arquivo);
      document.getElementById('vaq-b-arq').classList.toggle('on', arquivo);
      if (arquivo && !caixa.innerHTML) verProjetos();
    }
    document.getElementById('vaq-b-local').onclick = function () { trocar(false); };
    document.getElementById('vaq-b-arq').onclick   = function () { trocar(true); };

    window.veraAbrirArquivo = function () { trocar(true); };
    montado = true;
    return true;
  }

  var voltas = 0;
  var t = setInterval(function () { voltas++; if (montar() || voltas > 60) clearInterval(t); }, 1000);
  montar();
})();
