(function () {
  'use strict';

  // Painel VERA — duas visões do mesmo arquivo exportacoes/painel.json.
  //
  //  • Equipe de campo: aba "Painel" com o resumo (rotas, km mapeados,
  //    concluídas, em andamento) e a lista por município, cada rota com o km
  //    mapeado, a barra de avanço e o status em cor + texto.
  //  • Admin: bloco "Indicadores" no topo do painel administrativo, com
  //    filtros (município, período, equipe, status), a produtividade em km
  //    por mês (mensal / acumulado) e as árvores cadastradas por dia.
  //
  // É só leitura. O json é gerado pelo workflow a cada sincronização; esta
  // tela não grava nada e não muda rota nenhuma.

  if (window.__veraPainel) return;
  window.__veraPainel = true;

  var RAW = 'https://raw.githubusercontent.com/LGRSV/vera-vegetacao/main';
  var dados = null;
  var carregando = null;
  var filtroCampo = 'todas';
  var modoKm = 'mensal';
  var filtros = { municipio: '', periodo: 'tudo', equipe: '', status: '' };

  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var STATUS = {
    concluida: { txt: 'Concluída',    ico: '✓', cls: 'ok' },
    andamento: { txt: 'Em andamento', ico: '●', cls: 'and' },
    pausada:   { txt: 'Parada',       ico: '‖', cls: 'pau' },
    fila:      { txt: 'Na fila',      ico: '○', cls: 'fila' }
  };

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function num(v, casas) {
    return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 0 });
  }
  function dataBR(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p[2] + '/' + p[1];
  }
  function mesRotulo(chave) {
    var p = chave.split('-');
    return MESES[Number(p[1]) - 1] + '/' + p[0].slice(2);
  }

  // rota na fila que já tem ponto coletado: o técnico começou e a rota ativa
  // mudou sem conclusão. Aparece à parte para ninguém achar que está zerada.
  function statusDe(r) {
    if (r.status === 'fila' && r.pontos > 0) return 'pausada';
    return r.status;
  }

  async function carregar(forcar) {
    if (dados && !forcar) return dados;
    if (carregando) return carregando;
    carregando = (async function () {
      var r = await fetch(RAW + '/exportacoes/painel.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('painel.json HTTP ' + r.status);
      dados = await r.json();
      return dados;
    })();
    try { return await carregando; } finally { carregando = null; }
  }

  function equipeLogada() {
    try { return (typeof currentUser !== 'undefined' && currentUser) ? String(currentUser) : ''; } catch (e) { return ''; }
  }

  // ═══════════════════════ ESTILO ═══════════════════════
  function estilo() {
    if (document.getElementById('vpn-estilo')) return;
    var st = document.createElement('style');
    st.id = 'vpn-estilo';
    st.textContent = [
      ':root{--vpn-ok:#2e7d32;--vpn-ok-bg:#e8f5e9;--vpn-and:#b86e00;--vpn-and-bg:#fff3e0;--vpn-pau:#6d5d2e;--vpn-pau-bg:#f5f0e1;',
      '--vpn-fila:#6b7a6b;--vpn-fila-bg:#eef1ee;--vpn-ink:#1a2e1a;--vpn-ink2:#4a5d4a;--vpn-mut:#7d8c7d;--vpn-line:#e3e9e3;',
      '--vpn-bar:#2d5a27;--vpn-bar2:#4CAF50;--vpn-track:#e6ede6;}',
      '#painel-panel{padding:14px 14px 28px;}',
      '.vpn-cab{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:2px 0 12px;}',
      '.vpn-tit{font-size:17px;font-weight:800;color:var(--vpn-ink);letter-spacing:-.01em;}',
      '.vpn-sub{font-size:11px;color:var(--vpn-mut);}',
      '.vpn-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}',
      '@media(min-width:720px){.vpn-tiles{grid-template-columns:repeat(4,minmax(0,1fr));}}',
      '.vpn-tile{background:#fff;border:1px solid var(--vpn-line);border-radius:12px;padding:11px 12px;}',
      '.vpn-tile-rot{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--vpn-mut);display:flex;align-items:center;gap:5px;}',
      '.vpn-tile-num{font-size:24px;font-weight:800;color:var(--vpn-ink);margin-top:3px;font-variant-numeric:tabular-nums;line-height:1.1;}',
      '.vpn-tile-num small{font-size:13px;font-weight:600;color:var(--vpn-ink2);}',
      '.vpn-tile-det{font-size:11px;color:var(--vpn-ink2);margin-top:2px;}',
      '.vpn-dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex-shrink:0;}',
      '.vpn-geral{background:#fff;border:1px solid var(--vpn-line);border-radius:12px;padding:11px 12px;margin-top:8px;}',
      '.vpn-geral-l{display:flex;justify-content:space-between;font-size:12px;color:var(--vpn-ink2);margin-bottom:6px;}',
      '.vpn-geral-l b{color:var(--vpn-ink);}',
      '.vpn-trilho{height:8px;background:var(--vpn-track);border-radius:4px;overflow:hidden;display:flex;gap:2px;}',
      '.vpn-trilho i{display:block;height:100%;}',
      '.vpn-chips{display:flex;gap:6px;overflow-x:auto;margin:16px 0 0;padding-bottom:2px;-webkit-overflow-scrolling:touch;}',
      '.vpn-chip{flex-shrink:0;border:1px solid var(--vpn-line);background:#fff;color:var(--vpn-ink2);font:inherit;font-size:12px;font-weight:600;',
      'padding:7px 12px;border-radius:18px;cursor:pointer;min-height:34px;}',
      '.vpn-chip.on{background:var(--vpn-ink);border-color:var(--vpn-ink);color:#fff;}',
      '.vpn-st{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:3px 8px;border-radius:12px;white-space:nowrap;flex-shrink:0;}',
      '.vpn-st.ok{background:var(--vpn-ok-bg);color:var(--vpn-ok);}',
      '.vpn-st.and{background:var(--vpn-and-bg);color:var(--vpn-and);}',
      '.vpn-st.pau{background:var(--vpn-pau-bg);color:var(--vpn-pau);}',
      '.vpn-st.fila{background:var(--vpn-fila-bg);color:var(--vpn-fila);}',
      '.vpn-prog{height:6px;background:var(--vpn-track);border-radius:3px;overflow:hidden;}',
      '.vpn-prog i{display:block;height:100%;border-radius:3px;}',
      '.vpn-prog .ok{background:var(--vpn-bar2);} .vpn-prog .and{background:#e8a020;} .vpn-prog .pau{background:#b3a472;} .vpn-prog .fila{background:#b9c4b9;}',
      '.vpn-vazio{padding:22px 12px;text-align:center;color:var(--vpn-mut);font-size:13px;}',
      '.vpn-erro{padding:16px 12px;background:#fdecea;color:#8a2c20;border-radius:10px;font-size:12.5px;}',
      '.vpn-rod{margin-top:14px;font-size:11px;color:var(--vpn-mut);text-align:center;}',
      // admin
      '#vpn-admin{background:#fff;border-radius:12px;margin:12px 12px 14px;border:1px solid var(--vpn-line);padding:14px;}',
      '.vpn-a-tit{font-size:14px;font-weight:800;color:var(--vpn-ink);}',
      '.vpn-a-sub{font-size:11px;color:var(--vpn-mut);margin-top:1px;}',
      '.vpn-filtros{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0;}',
      '@media(min-width:720px){.vpn-filtros{grid-template-columns:repeat(4,minmax(0,1fr));}}',
      '.vpn-filtros label{display:block;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--vpn-mut);margin-bottom:3px;}',
      '.vpn-filtros select{width:100%;font:inherit;font-size:12.5px;padding:7px 8px;border:1px solid var(--vpn-line);border-radius:8px;background:#fff;color:var(--vpn-ink);min-height:36px;}',
      '.vpn-graf{border:1px solid var(--vpn-line);border-radius:12px;padding:12px 12px 6px;margin-top:10px;position:relative;}',
      '.vpn-graf-cab{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;}',
      '.vpn-graf-tit{font-size:13px;font-weight:700;color:var(--vpn-ink);}',
      '.vpn-graf-sub{font-size:11px;color:var(--vpn-mut);margin-top:1px;}',
      '.vpn-seg{display:inline-flex;background:var(--vpn-track);border-radius:9px;padding:3px;}',
      '.vpn-seg button{border:none;background:none;font:inherit;font-size:12px;font-weight:700;color:var(--vpn-ink2);padding:6px 12px;border-radius:7px;cursor:pointer;min-height:30px;}',
      '.vpn-seg button.on{background:#fff;color:var(--vpn-ink);box-shadow:0 1px 3px rgba(0,0,0,.12);}',
      '.vpn-svg{display:block;width:100%;overflow:visible;margin-top:6px;}',
      '.vpn-svg text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}',
      '.vpn-tip{position:absolute;pointer-events:none;background:#1a2e1a;color:#fff;font-size:11.5px;line-height:1.4;padding:7px 9px;border-radius:8px;',
      'box-shadow:0 6px 18px rgba(0,0,0,.22);opacity:0;transition:opacity .12s;white-space:nowrap;z-index:5;}',
      '.vpn-tip b{font-size:13px;}',
      '.vpn-tip.on{opacity:1;}',
      '.vpn-tabela{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;}',
      '.vpn-tabela th{text-align:left;font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--vpn-mut);font-weight:700;padding:6px 4px;border-bottom:1px solid var(--vpn-line);}',
      '.vpn-tabela td{padding:6px 4px;border-bottom:1px solid #f0f3f0;color:var(--vpn-ink);font-variant-numeric:tabular-nums;}',
      '.vpn-tabela td.n,.vpn-tabela th.n{text-align:right;}',
      '.vpn-mais{border:none;background:none;font:inherit;font-size:12px;font-weight:600;color:var(--vpn-bar);padding:8px 0 2px;cursor:pointer;}',
      // grade de municípios: uma caixa por município (km + status)
      '.vpn-quadro{border:2px solid var(--vpn-ink);border-radius:14px;padding:12px;background:#fff;margin-top:12px;}',
      '.vpn-quadro-cab{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px;}',
      '.vpn-quadro-tit{font-size:14px;font-weight:800;color:var(--vpn-ink);}',
      '.vpn-resumo{display:flex;flex-wrap:wrap;gap:6px;}',
      '.vpn-rs{display:inline-flex;align-items:baseline;gap:4px;font-size:11px;color:var(--vpn-ink2);',
      'background:var(--vpn-track);border-radius:8px;padding:4px 9px;white-space:nowrap;}',
      '.vpn-rs b{font-size:13.5px;font-weight:800;color:var(--vpn-ink);font-variant-numeric:tabular-nums;}',
      '.vpn-rs.ok b{color:var(--vpn-ok);} .vpn-rs.and b{color:var(--vpn-and);}',
      '.vpn-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:8px;}',
      '.vpn-cx{border:2px solid var(--vpn-ink);border-radius:10px;padding:9px 10px 10px;background:#fff;display:flex;flex-direction:column;gap:3px;min-width:0;}',
      '.vpn-cx.st-and{border-color:#e8a020;background:#fffaf0;}',
      '.vpn-cx.st-fila,.vpn-cx.st-pau{border-color:#c5cfc5;}',
      '.vpn-cx-nome{font-size:12px;font-weight:700;color:var(--vpn-ink2);line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.vpn-cx-km{font-size:22px;font-weight:800;color:var(--vpn-ink);line-height:1.1;font-variant-numeric:tabular-nums;}',
      '.vpn-cx-km small{font-size:12px;font-weight:600;color:var(--vpn-ink2);}',
      '.vpn-cx-de{font-size:10.5px;color:var(--vpn-mut);}',
      '.vpn-cx .vpn-st{align-self:flex-start;margin-top:3px;font-size:10.5px;padding:2px 7px;}',
      '.vpn-cx .vpn-prog{height:4px;margin-top:5px;}',
      '.vpn-nota{font-size:11px;color:var(--vpn-mut);margin-top:9px;line-height:1.4;}',
      // versão escura, para a capa (tela de login)
      '.vpn-escuro.vpn-quadro{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:16px;',
      'box-shadow:0 24px 70px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.08);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);}',
      '.vpn-escuro .vpn-quadro-tit{color:#fff;font-size:15px;}',
      '.vpn-escuro .vpn-rs{background:rgba(255,255,255,.08);color:#bcd8b6;}',
      '.vpn-escuro .vpn-rs b{color:#fff;}',
      '.vpn-escuro .vpn-rs.ok b{color:#9fe89a;} .vpn-escuro .vpn-rs.and b{color:#f5c567;}',
      '.vpn-escuro .vpn-cx{background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.28);}',
      '.vpn-escuro .vpn-cx.st-and{border-color:#f0b43c;background:rgba(240,180,60,.10);}',
      '.vpn-escuro .vpn-cx.st-fila,.vpn-escuro .vpn-cx.st-pau{border-color:rgba(255,255,255,.14);}',
      '.vpn-escuro .vpn-cx-nome{color:#bcd8b6;}',
      '.vpn-escuro .vpn-cx-km{color:#fff;}',
      '.vpn-escuro .vpn-cx-km small{color:#cfe6ca;}',
      '.vpn-escuro .vpn-cx-de,.vpn-escuro .vpn-nota{color:rgba(207,230,202,.7);}',
      '.vpn-escuro .vpn-st.ok{background:rgba(111,206,106,.18);color:#9fe89a;}',
      '.vpn-escuro .vpn-st.and{background:rgba(240,180,60,.18);color:#f5c567;}',
      '.vpn-escuro .vpn-st.pau{background:rgba(216,201,143,.16);color:#e3d6a3;}',
      '.vpn-escuro .vpn-st.fila{background:rgba(255,255,255,.08);color:#b9c8b6;}',
      '.vpn-escuro .vpn-prog{background:rgba(255,255,255,.12);}',
      '.vpn-escuro .vpn-prog .ok{background:#6fce6a;}',
      // Capa: no celular o cartao de login vem primeiro e o quadro desce; no
      // computador os dois ficam lado a lado, com o cartao fixo enquanto a
      // lista de municipios rola. Antes o quadro empurrava o login para fora
      // da tela e a grade cortava uma fileira no meio.
      '#login-screen{flex-direction:column;align-items:center;justify-content:flex-start!important;',
      'gap:20px;padding:26px 18px 40px;}',
      '#login-screen .login-card{flex-shrink:0;order:1;}',
      '#vpn-capa{width:100%;max-width:880px;order:2;}',
      '#vpn-capa .vpn-grade{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));}',
      '@media(min-width:1040px){',
      '#login-screen{flex-direction:row;align-items:flex-start;justify-content:center!important;gap:28px;padding:40px 28px;}',
      // cartao centrado na altura do quadro; se a lista passar da tela, ele
      // gruda no topo em vez de sumir na rolagem
      '#login-screen .login-card{align-self:center;position:sticky;top:40px;order:0;}',
      '#vpn-capa{flex:1 1 auto;max-width:1040px;min-width:0;order:0;}',
      '#vpn-capa .vpn-grade{grid-template-columns:repeat(auto-fill,minmax(168px,1fr));}}'
    ].join('');
    document.head.appendChild(st);
  }

  function selo(st) {
    var s = STATUS[st] || STATUS.fila;
    return '<span class="vpn-st ' + s.cls + '"><span aria-hidden="true">' + s.ico + '</span>' + s.txt + '</span>';
  }

  // ═══════════════════════ VISÃO DE CAMPO ═══════════════════════
  function resumo(rotas) {
    var r = { rotas: rotas.length, km: 0, kmTotal: 0, concl: 0, and: 0, fila: 0, pau: 0, kmConcl: 0, kmAnd: 0 };
    rotas.forEach(function (x) {
      var st = statusDe(x);
      r.km += x.km_mapeado || 0;
      r.kmTotal += x.km || 0;
      if (st === 'concluida') { r.concl++; r.kmConcl += x.km_mapeado || 0; }
      else if (st === 'andamento') { r.and++; r.kmAnd += x.km_mapeado || 0; }
      else if (st === 'pausada') r.pau++;
      else r.fila++;
    });
    return r;
  }

  var ORDEM = { andamento: 0, pausada: 1, fila: 2, concluida: 3 };

  function porMunicipio(rotas) {
    var m = {};
    rotas.forEach(function (r) {
      var k = r.municipio || r.nome;
      (m[k] = m[k] || { nome: k, rotas: [] }).rotas.push(r);
    });
    return Object.keys(m).map(function (k) {
      var g = m[k];
      g.km = 0; g.kmTotal = 0; g.ultimo = '';
      g.status = 'concluida';
      g.rotas.forEach(function (r) {
        g.km += r.km_mapeado || 0; g.kmTotal += r.km || 0;
        if ((r.ate || '') > g.ultimo) g.ultimo = r.ate || '';
        if (ORDEM[statusDe(r)] < ORDEM[g.status]) g.status = statusDe(r);
      });
      g.rotas.sort(function (a, b) { return ORDEM[statusDe(a)] - ORDEM[statusDe(b)] || (b.ate || '').localeCompare(a.ate || ''); });
      return g;
    }).sort(function (a, b) {
      return ORDEM[a.status] - ORDEM[b.status] || b.ultimo.localeCompare(a.ultimo) || a.nome.localeCompare(b.nome);
    });
  }

  function caixa(g) {
    var cls = (STATUS[g.status] || STATUS.fila).cls;
    var pct = g.kmTotal ? Math.min(1, g.km / g.kmTotal) : 0;
    var arv = 0;
    g.rotas.forEach(function (r) { arv += r.pontos || 0; });
    var det = [];
    if (g.km + 0.05 < g.kmTotal) det.push('de ' + num(g.kmTotal, 1) + ' km');
    det.push(arv ? num(arv) + ' árvores' : 'sem coleta');
    if (g.rotas.length > 1) det.push(g.rotas.length + ' rotas');
    return '<div class="vpn-cx st-' + cls + '" title="' + esc(g.nome) + '">' +
      '<div class="vpn-cx-nome">' + esc(g.nome) + '</div>' +
      '<div class="vpn-cx-km">' + num(g.km, g.km >= 100 ? 0 : 1) + ' <small>km</small></div>' +
      '<div class="vpn-cx-de">' + det.join(' · ') + '</div>' +
      selo(g.status) +
      '<div class="vpn-prog" role="img" aria-label="' + Math.round(pct * 100) + '% mapeado"><i class="' + cls + '" style="width:' + (pct * 100).toFixed(1) + '%"></i></div>' +
    '</div>';
  }

  // o quadro do desenho: um contorno com uma caixa por município
  function quadro(rotas, titulo, escuro) {
    var grupos = porMunicipio(rotas);
    var r = resumo(rotas);
    var pausadas = grupos.some(function (g) { return g.status === 'pausada'; });
    return '<div class="vpn-quadro' + (escuro ? ' vpn-escuro' : '') + '">' +
      '<div class="vpn-quadro-cab"><span class="vpn-quadro-tit">' + esc(titulo) + '</span>' +
      '<span class="vpn-resumo">' +
        '<span class="vpn-rs"><b>' + num(r.km, 1) + '</b> km mapeados</span>' +
        '<span class="vpn-rs ok"><b>' + r.concl + '</b> concluída' + (r.concl === 1 ? '' : 's') + '</span>' +
        '<span class="vpn-rs and"><b>' + r.and + '</b> em andamento</span>' +
        '<span class="vpn-rs"><b>' + (r.fila + r.pau) + '</b> na fila</span>' +
      '</span></div>' +
      (grupos.length ? '<div class="vpn-grade">' + grupos.map(caixa).join('') + '</div>'
                     : '<div class="vpn-vazio">Nenhum município neste filtro.</div>') +
      (pausadas ? '<div class="vpn-nota">‖ Parada: a coleta começou, mas a rota saiu da vez sem ser concluída.</div>' : '') +
    '</div>';
  }

  function tiles(r) {
    return '<div class="vpn-tiles">' +
      '<div class="vpn-tile"><div class="vpn-tile-rot">Rotas</div>' +
        '<div class="vpn-tile-num">' + r.rotas + '</div>' +
        '<div class="vpn-tile-det">' + (r.fila + r.pau) + ' na fila' + (r.pau ? ' (' + r.pau + ' parada' + (r.pau > 1 ? 's' : '') + ')' : '') + '</div></div>' +
      '<div class="vpn-tile"><div class="vpn-tile-rot">Km mapeados</div>' +
        '<div class="vpn-tile-num">' + num(r.km, 1) + ' <small>km</small></div>' +
        '<div class="vpn-tile-det">de ' + num(r.kmTotal, 1) + ' km de rede</div></div>' +
      '<div class="vpn-tile"><div class="vpn-tile-rot"><span class="vpn-dot" style="background:var(--vpn-bar2)"></span>Concluídas</div>' +
        '<div class="vpn-tile-num">' + r.concl + '</div>' +
        '<div class="vpn-tile-det">' + num(r.kmConcl, 1) + ' km</div></div>' +
      '<div class="vpn-tile"><div class="vpn-tile-rot"><span class="vpn-dot" style="background:#e8a020"></span>Em andamento</div>' +
        '<div class="vpn-tile-num">' + r.and + '</div>' +
        '<div class="vpn-tile-det">' + num(r.kmAnd, 1) + ' km até agora</div></div>' +
    '</div>';
  }

  function barraGeral(r) {
    var pct = r.kmTotal ? r.km / r.kmTotal : 0;
    var pc = r.kmTotal ? r.kmConcl / r.kmTotal : 0;
    var po = Math.max(0, pct - pc);
    return '<div class="vpn-geral">' +
      '<div class="vpn-geral-l"><span>Rede mapeada</span><span><b>' + Math.round(pct * 100) + '%</b> de ' + num(r.kmTotal, 1) + ' km</span></div>' +
      '<div class="vpn-trilho" role="img" aria-label="' + Math.round(pct * 100) + '% da rede mapeada">' +
        '<i style="width:' + (pc * 100).toFixed(1) + '%;background:var(--vpn-bar2);border-radius:4px 0 0 4px"></i>' +
        (po > 0.002 ? '<i style="width:' + (po * 100).toFixed(1) + '%;background:#e8a020"></i>' : '') +
      '</div></div>';
  }

  function chips(r) {
    var ops = [['todas', 'Todas', r.rotas], ['andamento', 'Andamento', r.and + r.pau], ['fila', 'Fila', r.fila], ['concluida', 'Concluídas', r.concl]];
    return '<div class="vpn-chips" role="tablist">' + ops.map(function (o) {
      return '<button class="vpn-chip' + (filtroCampo === o[0] ? ' on' : '') + '" data-f="' + o[0] + '">' + o[1] + ' · ' + o[2] + '</button>';
    }).join('') + '</div>';
  }

  async function desenharCampo() {
    var alvo = document.getElementById('painel-conteudo');
    if (!alvo) return;
    if (!dados) alvo.innerHTML = '<div class="vpn-vazio">Carregando painel…</div>';
    try { await carregar(); } catch (e) {
      alvo.innerHTML = '<div class="vpn-erro">Não foi possível carregar o painel agora. ' +
        'Verifique a internet e abra a aba de novo.<br><small>' + esc(e.message) + '</small></div>';
      return;
    }
    var eq = equipeLogada();
    var rotas = dados.rotas.filter(function (r) { return !eq || r.equipe === eq; });
    if (!rotas.length) rotas = dados.rotas.slice();
    var r = resumo(rotas);

    var lista = rotas.filter(function (x) {
      var st = statusDe(x);
      if (filtroCampo === 'todas') return true;
      if (filtroCampo === 'andamento') return st === 'andamento' || st === 'pausada';
      return st === filtroCampo;
    });
    var g = new Date(dados.gerado);

    alvo.innerHTML =
      '<div class="vpn-cab"><span class="vpn-tit">Painel da equipe</span>' +
      '<span class="vpn-sub">' + esc(eq || 'Todas as equipes') + '</span></div>' +
      tiles(r) + barraGeral(r) + chips(r) +
      quadro(lista, 'Municípios', false) +
      '<div class="vpn-rod">Atualizado em ' + g.toLocaleDateString('pt-BR') + ' às ' +
        g.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</div>';

    alvo.querySelectorAll('.vpn-chip').forEach(function (b) {
      b.addEventListener('click', function () { filtroCampo = b.getAttribute('data-f'); desenharCampo(); });
    });
  }

  // ═══════════════════════ VISÃO ADMIN ═══════════════════════
  function hojeISO() {
    var g = dados && dados.gerado ? new Date(dados.gerado) : new Date();
    return g.toISOString().slice(0, 10);
  }
  function somaDias(iso, n) {
    var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function intervalo() {
    var p = filtros.periodo, hoje = hojeISO();
    if (p === '7') return [somaDias(hoje, -6), hoje];
    if (p === '30') return [somaDias(hoje, -29), hoje];
    if (/^\d{4}-\d{2}$/.test(p)) return [p + '-01', p + '-31'];
    return ['0000', '9999'];
  }

  function rotasFiltradas() {
    return dados.rotas.filter(function (r) {
      if (filtros.municipio && r.municipio !== filtros.municipio) return false;
      if (filtros.equipe && r.equipe !== filtros.equipe) return false;
      if (filtros.status) {
        var st = statusDe(r);
        if (filtros.status === 'andamento' ? (st !== 'andamento' && st !== 'pausada') : st !== filtros.status) return false;
      }
      return true;
    });
  }

  // Cada dia de coleta leva a fatia do km mapeado da rota proporcional às
  // árvores cadastradas naquele dia. É a única forma de ter km por mês sem
  // inventar número: o km só existe por rota, o que tem data é o ponto.
  function serieDiaria(rotas, semPeriodo) {
    var porRota = {};
    rotas.forEach(function (r) { porRota[r.nome] = r; });
    var ini = intervalo();
    var dias = {};
    dados.diario.forEach(function (d) {
      var r = porRota[d.rota];
      if (!r) return;
      if (filtros.equipe && d.equipe !== filtros.equipe) return;
      if (!semPeriodo && (d.dia < ini[0] || d.dia > ini[1])) return;
      var x = dias[d.dia] = dias[d.dia] || { dia: d.dia, arvores: 0, km: 0, rotas: {} };
      x.arvores += d.arvores;
      x.km += r.pontos ? (r.km_mapeado || 0) * d.arvores / r.pontos : 0;
      x.rotas[r.municipio || r.nome] = (x.rotas[r.municipio || r.nome] || 0) + d.arvores;
    });
    return dias;
  }

  function opcoes(lista, atual, todas) {
    return '<option value="">' + todas + '</option>' + lista.map(function (v) {
      return '<option value="' + esc(v) + '"' + (v === atual ? ' selected' : '') + '>' + esc(v) + '</option>';
    }).join('');
  }

  function filtrosHTML() {
    var muns = [], eqs = [], meses = {};
    dados.rotas.forEach(function (r) {
      if (r.municipio && muns.indexOf(r.municipio) < 0) muns.push(r.municipio);
      if (r.equipe && eqs.indexOf(r.equipe) < 0) eqs.push(r.equipe);
    });
    dados.diario.forEach(function (d) { meses[d.dia.slice(0, 7)] = 1; });
    muns.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
    var per = [['tudo', 'Todo o período'], ['30', 'Últimos 30 dias'], ['7', 'Últimos 7 dias']]
      .concat(Object.keys(meses).sort().reverse().map(function (m) { return [m, mesRotulo(m)]; }));
    return '<div class="vpn-filtros">' +
      '<div><label for="vpn-f-mun">Município</label><select id="vpn-f-mun" data-k="municipio">' + opcoes(muns, filtros.municipio, 'Todos') + '</select></div>' +
      '<div><label for="vpn-f-per">Período</label><select id="vpn-f-per" data-k="periodo">' + per.map(function (p) {
        return '<option value="' + p[0] + '"' + (filtros.periodo === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
      }).join('') + '</select></div>' +
      '<div><label for="vpn-f-eq">Equipe</label><select id="vpn-f-eq" data-k="equipe">' + opcoes(eqs, filtros.equipe, 'Todas') + '</select></div>' +
      '<div><label for="vpn-f-st">Status</label><select id="vpn-f-st" data-k="status">' +
        '<option value="">Todos</option>' +
        [['concluida', 'Concluída'], ['andamento', 'Em andamento'], ['fila', 'Na fila']].map(function (o) {
          return '<option value="' + o[0] + '"' + (filtros.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('') + '</select></div>' +
    '</div>';
  }

  // ---- gráfico de barras em SVG (um só eixo, uma só série) ----
  // itens: [{rot, val, dica, destaque}]  opts: {alt, fmt, rotulosX, rotularTodos}
  function barras(caixa, itens, opts) {
    var W = Math.max(260, caixa.clientWidth || 600), H = opts.alt || 200;
    var m = { t: 18, r: 8, b: 24, l: 38 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var max = 0;
    itens.forEach(function (i) { if (i.val > max) max = i.val; });
    var passo = escalaBonita(max || 1);
    var topo = Math.ceil((max || 1) / passo) * passo;
    var n = itens.length || 1;
    var banda = iw / n;
    var larg = Math.max(2, Math.min(24, banda * 0.72));
    var y = function (v) { return m.t + ih - (v / topo) * ih; };

    var s = '<svg class="vpn-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.aria || '') + '">';
    for (var g = 0; g <= topo + 1e-9; g += passo) {
      var gy = y(g);
      s += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + gy + '" y2="' + gy + '" stroke="' + (g === 0 ? '#c9d3c9' : '#edf1ed') + '" stroke-width="1"/>';
      s += '<text x="' + (m.l - 6) + '" y="' + (gy + 3.5) + '" text-anchor="end" font-size="10" fill="#7d8c7d">' + opts.fmtEixo(g) + '</text>';
    }
    itens.forEach(function (it, k) {
      var cx = m.l + banda * k + banda / 2;
      var x0 = cx - larg / 2;
      if (it.val > 0) {
        var y0 = y(it.val), h = m.t + ih - y0, r = Math.min(4, larg / 2, h);
        // cantos arredondados só na ponta do dado; a base fica reta no eixo
        s += '<path d="M' + x0 + ',' + (m.t + ih) + 'V' + (y0 + r) + 'Q' + x0 + ',' + y0 + ' ' + (x0 + r) + ',' + y0 +
             'H' + (x0 + larg - r) + 'Q' + (x0 + larg) + ',' + y0 + ' ' + (x0 + larg) + ',' + (y0 + r) + 'V' + (m.t + ih) + 'Z" fill="' +
             (it.destaque ? '#2d5a27' : '#4CAF50') + '"/>';
        if (opts.rotularTodos || it.destaque) {
          s += '<text x="' + cx + '" y="' + (y0 - 5) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="#1a2e1a">' + opts.fmt(it.val) + '</text>';
        }
      }
      if (it.rot) s += '<text x="' + cx + '" y="' + (H - 7) + '" text-anchor="' + (it.ancora || 'middle') + '" font-size="10" fill="#4a5d4a">' + esc(it.rot) + '</text>';
      // alvo de toque maior que a barra
      s += '<rect class="vpn-hit" data-k="' + k + '" x="' + (m.l + banda * k) + '" y="' + m.t + '" width="' + banda + '" height="' + ih + '" fill="transparent"/>';
    });
    s += '</svg>';
    caixa.innerHTML = s + '<div class="vpn-tip"></div>';

    var tip = caixa.querySelector('.vpn-tip');
    var svg = caixa.querySelector('svg');
    function mostrar(ev, k) {
      var it = itens[k];
      tip.innerHTML = it.dica;
      tip.classList.add('on');
      var cx = m.l + banda * k + banda / 2;
      var tw = tip.offsetWidth, th = tip.offsetHeight;
      var left = Math.max(0, Math.min(W - tw, cx - tw / 2));
      var top = Math.max(0, y(it.val) - th - 10);
      tip.style.left = left + 'px'; tip.style.top = top + 'px';
    }
    svg.querySelectorAll('.vpn-hit').forEach(function (h) {
      var k = Number(h.getAttribute('data-k'));
      h.addEventListener('mouseenter', function (e) { mostrar(e, k); });
      h.addEventListener('touchstart', function (e) { mostrar(e, k); }, { passive: true });
      h.addEventListener('mouseleave', function () { tip.classList.remove('on'); });
    });
  }

  function escalaBonita(max) {
    var bruto = max / 4;
    var p = Math.pow(10, Math.floor(Math.log10(bruto)));
    var f = bruto / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }

  function desenharGraficos() {
    var raiz = document.getElementById('vpn-admin');
    if (!raiz || !dados) return;
    var rotas = rotasFiltradas();
    var dias = serieDiaria(rotas);
    var chaves = Object.keys(dias).sort();

    // KPIs do recorte
    var totArv = 0, totKm = 0;
    chaves.forEach(function (k) { totArv += dias[k].arvores; totKm += dias[k].km; });
    var r = resumo(rotas);
    document.getElementById('vpn-a-kpis').innerHTML = '<div class="vpn-tiles">' +
      '<div class="vpn-tile"><div class="vpn-tile-rot">Km mapeados</div><div class="vpn-tile-num">' + num(totKm, 1) + ' <small>km</small></div>' +
        '<div class="vpn-tile-det">no período filtrado</div></div>' +
      '<div class="vpn-tile"><div class="vpn-tile-rot">Árvores</div><div class="vpn-tile-num">' + num(totArv) + '</div>' +
        '<div class="vpn-tile-det">' + chaves.length + ' dia' + (chaves.length === 1 ? '' : 's') + ' de coleta</div></div>' +
      '<div class="vpn-tile"><div class="vpn-tile-rot">Média por dia</div><div class="vpn-tile-num">' + num(chaves.length ? totArv / chaves.length : 0) + '</div>' +
        '<div class="vpn-tile-det">árvores · ' + num(chaves.length ? totKm / chaves.length : 0, 1) + ' km</div></div>' +
      '<div class="vpn-tile"><div class="vpn-tile-rot">Rotas</div><div class="vpn-tile-num">' + r.concl + ' <small>de ' + r.rotas + '</small></div>' +
        '<div class="vpn-tile-det">concluídas · ' + r.and + ' em andamento' + (r.pau ? ' · ' + r.pau + ' parada' + (r.pau > 1 ? 's' : '') : '') + '</div></div>' +
    '</div>';

    document.getElementById('vpn-a-mun').innerHTML = quadro(rotas, 'Municípios · situação atual', false);

    // ---- 1) km por mês ----
    var meses = {};
    chaves.forEach(function (k) { var m = k.slice(0, 7); meses[m] = (meses[m] || 0) + dias[k].km; });
    var mk = Object.keys(meses).sort();
    // o acumulado parte do que já tinha sido mapeado antes do período
    // escolhido, senão "últimos 30 dias" pareceria começar do zero
    var acum = 0, iniP = intervalo()[0], todos = serieDiaria(rotas, true);
    Object.keys(todos).forEach(function (k) { if (k < iniP) acum += todos[k].km; });
    var itensMes = mk.map(function (m, i) {
      var v = meses[m];
      acum += v;
      var val = modoKm === 'acumulado' ? acum : v;
      return {
        rot: mesRotulo(m), val: val, destaque: i === mk.length - 1,
        dica: '<b>' + num(val, 1) + ' km</b><br>' + mesRotulo(m) +
              (modoKm === 'acumulado' ? '<br>+' + num(v, 1) + ' km no mês' : '')
      };
    });
    document.getElementById('vpn-g1-sub').textContent = modoKm === 'acumulado'
      ? 'Total de rede mapeada até o fim de cada mês'
      : 'Rede mapeada em cada mês';
    var c1 = document.getElementById('vpn-g1');
    if (!itensMes.length) c1.innerHTML = '<div class="vpn-vazio">Sem coleta neste recorte.</div>';
    else barras(c1, itensMes, {
      alt: 190, rotularTodos: itensMes.length <= 8,
      fmt: function (v) { return num(v, v >= 100 ? 0 : 1); },
      fmtEixo: function (v) { return num(v); },
      aria: 'Quilômetros mapeados por mês'
    });

    // ---- 2) árvores por dia (dias sem coleta entram como zero) ----
    var c2 = document.getElementById('vpn-g2');
    if (!chaves.length) { c2.innerHTML = '<div class="vpn-vazio">Sem coleta neste recorte.</div>'; document.getElementById('vpn-g2-tab').innerHTML = ''; return; }
    var ini = intervalo();
    var d0 = ini[0] > chaves[0] ? ini[0] : chaves[0];
    var d1 = chaves[chaves.length - 1];
    if (filtros.periodo !== 'tudo' && ini[1] < '9999') d1 = ini[1] < hojeISO() ? ini[1] : hojeISO();
    if (/^\d{4}-\d{2}$/.test(filtros.periodo)) { d0 = filtros.periodo + '-01'; }
    var serie = [];
    for (var d = d0; d <= d1; d = somaDias(d, 1)) {
      if (/^\d{4}-\d{2}$/.test(filtros.periodo) && d.slice(0, 7) !== filtros.periodo) break;
      serie.push(dias[d] || { dia: d, arvores: 0, km: 0, rotas: {} });
    }
    var maxI = 0;
    serie.forEach(function (x, i) { if (x.arvores > serie[maxI].arvores) maxI = i; });
    var cada = serie.length > 45 ? 'mes' : serie.length > 14 ? 7 : 1;
    var itensDia = serie.map(function (x, i) {
      var rot = '';
      if (cada === 'mes') { if (x.dia.slice(8) === '01' || i === 0) rot = x.dia.slice(8) === '01' ? mesRotulo(x.dia.slice(0, 7)) : ''; }
      else if (i % cada === 0) rot = dataBR(x.dia);
      var onde = Object.keys(x.rotas).map(function (k) { return esc(k) + ': ' + x.rotas[k]; }).join('<br>');
      var sem = new Date(x.dia + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' });
      return {
        rot: rot, ancora: cada === 'mes' ? 'start' : 'middle', val: x.arvores, destaque: i === maxI && x.arvores > 0,
        dica: '<b>' + num(x.arvores) + ' árvore' + (x.arvores === 1 ? '' : 's') + '</b><br>' + sem + ' ' + dataBR(x.dia) +
              (onde ? '<br><span style="opacity:.8">' + onde + '</span>' : '<br><span style="opacity:.8">sem coleta</span>')
      };
    });
    barras(c2, itensDia, {
      alt: 200, rotularTodos: false,
      fmt: function (v) { return num(v); },
      fmtEixo: function (v) { return num(v); },
      aria: 'Árvores cadastradas por dia'
    });
    var dm = serie[maxI];
    document.getElementById('vpn-g2-sub').textContent = serie.length + ' dias · maior dia ' + dataBR(dm.dia) + ' com ' + num(dm.arvores) + ' árvores';

    // tabela: mesma informação em texto, para quem não lê o gráfico
    var linhas = serie.filter(function (x) { return x.arvores; }).slice().reverse();
    var mostrar = raiz.getAttribute('data-tab') === 'toda' ? linhas.length : Math.min(7, linhas.length);
    document.getElementById('vpn-g2-tab').innerHTML =
      '<table class="vpn-tabela"><thead><tr><th>Dia</th><th>Município</th><th class="n">Árvores</th><th class="n">Km</th></tr></thead><tbody>' +
      linhas.slice(0, mostrar).map(function (x) {
        return '<tr><td>' + dataBR(x.dia) + '</td><td>' + esc(Object.keys(x.rotas).join(', ')) + '</td><td class="n">' + num(x.arvores) + '</td><td class="n">' + num(x.km, 1) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      (linhas.length > 7 ? '<button class="vpn-mais" id="vpn-mais">' + (mostrar < linhas.length ? 'Ver todos os ' + linhas.length + ' dias' : 'Mostrar só os últimos 7') + '</button>' : '');
    var bm = document.getElementById('vpn-mais');
    if (bm) bm.addEventListener('click', function () {
      raiz.setAttribute('data-tab', raiz.getAttribute('data-tab') === 'toda' ? '' : 'toda');
      desenharGraficos();
    });
  }

  async function desenharAdmin() {
    var painel = document.getElementById('admin-panel');
    if (!painel) return;
    var raiz = document.getElementById('vpn-admin');
    if (!raiz) {
      raiz = document.createElement('div');
      raiz.id = 'vpn-admin';
      var cab = painel.querySelector('.admin-header');
      if (cab && cab.nextSibling) painel.insertBefore(raiz, cab.nextSibling); else painel.insertBefore(raiz, painel.firstChild);
    }
    if (!dados) raiz.innerHTML = '<div class="vpn-vazio">Carregando indicadores…</div>';
    try { await carregar(); } catch (e) {
      raiz.innerHTML = '<div class="vpn-erro">Não foi possível carregar os indicadores. <small>' + esc(e.message) + '</small></div>';
      return;
    }
    var g = new Date(dados.gerado);
    raiz.innerHTML =
      '<div class="vpn-a-tit">Indicadores de produtividade</div>' +
      '<div class="vpn-a-sub">Dados até ' + g.toLocaleDateString('pt-BR') + ' ' + g.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</div>' +
      filtrosHTML() +
      '<div id="vpn-a-kpis"></div>' +
      '<div id="vpn-a-mun"></div>' +
      '<div class="vpn-graf">' +
        '<div class="vpn-graf-cab"><div><div class="vpn-graf-tit">Produtividade · km por mês</div><div class="vpn-graf-sub" id="vpn-g1-sub"></div></div>' +
        '<div class="vpn-seg" role="tablist"><button data-m="mensal" class="' + (modoKm === 'mensal' ? 'on' : '') + '">Mensal</button>' +
        '<button data-m="acumulado" class="' + (modoKm === 'acumulado' ? 'on' : '') + '">Acumulado</button></div></div>' +
        '<div id="vpn-g1" style="position:relative"></div>' +
      '</div>' +
      '<div class="vpn-graf">' +
        '<div class="vpn-graf-cab"><div><div class="vpn-graf-tit">Árvores cadastradas por dia</div><div class="vpn-graf-sub" id="vpn-g2-sub"></div></div></div>' +
        '<div id="vpn-g2" style="position:relative"></div>' +
        '<div id="vpn-g2-tab"></div>' +
      '</div>';

    raiz.querySelectorAll('.vpn-filtros select').forEach(function (s) {
      s.addEventListener('change', function () { filtros[s.getAttribute('data-k')] = s.value; desenharGraficos(); });
    });
    raiz.querySelectorAll('.vpn-seg button').forEach(function (b) {
      b.addEventListener('click', function () {
        modoKm = b.getAttribute('data-m');
        raiz.querySelectorAll('.vpn-seg button').forEach(function (o) { o.classList.toggle('on', o === b); });
        desenharGraficos();
      });
    });
    desenharGraficos();
  }

  // ═══════════════════════ CAPA ═══════════════════════
  // Na tela de login, antes de entrar: o mesmo quadro, no visual escuro da capa.
  async function desenharCapa() {
    var tela = document.getElementById('login-screen');
    var cartao = tela && tela.querySelector('.login-card');
    if (!cartao) return false;
    estilo();
    var alvo = document.getElementById('vpn-capa');
    if (!alvo) {
      alvo = document.createElement('div');
      alvo.id = 'vpn-capa';
      tela.insertBefore(alvo, cartao);
    }
    try { await carregar(); } catch (e) {
      alvo.style.display = 'none';   // sem internet a capa continua só com o login
      return true;
    }
    alvo.style.display = '';
    alvo.innerHTML = quadro(dados.rotas, 'Andamento das rotas', true);
    return true;
  }

  // ═══════════════════════ MONTAGEM ═══════════════════════
  var montada = false;
  function montar() {
    if (montada) return true;
    var primeira = document.getElementById('tab-map');
    var irmao = document.getElementById('records-panel');
    if (!primeira || !irmao || !primeira.parentNode) return false;
    estilo();

    var botao = document.createElement('button');
    botao.className = 'tab-btn';
    botao.id = 'tab-painel';
    botao.setAttribute('onclick', "switchTab('painel')");
    botao.innerHTML = '<span class="tab-icon">Painel</span>';
    primeira.parentNode.insertBefore(botao, primeira);

    var painel = document.createElement('div');
    painel.className = 'tab-panel';
    painel.id = 'painel-panel';
    painel.innerHTML = '<div id="painel-conteudo"></div>';
    irmao.parentNode.insertBefore(painel, irmao);

    ajustarBotao();

    if (typeof window.switchTab === 'function' && !window.switchTab.__veraPainel) {
      var orig = window.switchTab;
      window.switchTab = function (nome) {
        var r = orig.apply(this, arguments);
        if (nome === 'painel') desenharCampo();
        if (nome === 'admin') desenharAdmin();
        return r;
      };
      window.switchTab.__veraPainel = true;
    }

    var tRedim;
    window.addEventListener('resize', function () {
      clearTimeout(tRedim);
      tRedim = setTimeout(function () {
        var a = document.getElementById('admin-panel');
        if (a && a.classList.contains('active')) desenharGraficos();
      }, 150);
    });

    window.veraPainel = { campo: desenharCampo, admin: desenharAdmin, capa: desenharCapa, recarregar: function () { dados = null; } };
    montada = true;
    return true;
  }

  // a aba é da equipe: o Admin tem os indicadores no painel dele. O login
  // acontece depois da montagem, então a visibilidade é revista por um tempo.
  function ajustarBotao() {
    var b = document.getElementById('tab-painel');
    if (b) b.style.display = equipeLogada() === 'Admin' ? 'none' : 'flex';
  }

  var capaFeita = false;
  var voltas = 0;
  var t = setInterval(function () {
    voltas++;
    if (!capaFeita && document.getElementById('login-screen')) { capaFeita = true; desenharCapa(); }
    if (montar()) ajustarBotao();
    if (voltas > 120) clearInterval(t);
  }, 1000);
  montar();
})();
