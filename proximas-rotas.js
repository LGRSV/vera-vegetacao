(function () {
  'use strict';

  // Aba "Próximas" — a equipe enxerga a fila de rotas dela.
  //
  // Até aqui o técnico só via o projeto ativo: ele não tinha como saber o que
  // vinha depois nem o tamanho do serviço. Esta aba lista as rotas da equipe
  // separadas em três blocos — em andamento, próximas e concluídas — com o
  // município, os alimentadores e o tamanho de cada uma (trechos e km lidos
  // do próprio arquivo de cabos que o app já usa no mapa).
  //
  // É só leitura: quem escolhe e ativa a rota continua sendo o supervisor
  // pelo painel admin. A aba não muda o projeto ativo nem conclui nada.

  if (window.__veraProximasRotas) return;
  window.__veraProximasRotas = true;

  var RAW = 'https://raw.githubusercontent.com/LGRSV/vera-vegetacao/main';
  var indice = null;
  var cacheTamanho = {};   // alimentador -> {trechos, km}
  var montada = false;
  var carregando = false;

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  async function pegarJson(caminho) {
    var r = await fetch(RAW + '/' + caminho + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(caminho + ' HTTP ' + r.status);
    return r.json();
  }

  function km(la1, lo1, la2, lo2) {
    return Math.hypot((la1 - la2) * 111.32,
                      (lo1 - lo2) * 111.32 * Math.cos(la1 * Math.PI / 180));
  }

  // tamanho da rota: soma dos trechos e da extensão dos alimentadores dela.
  // Só é buscado para as rotas que ainda vão ser feitas — as concluídas não
  // precisam e o arquivo de cabos delas pode ser grande.
  async function tamanhoDaRota(rota) {
    var trechos = 0, ext = 0, faltou = false;
    for (var i = 0; i < rota.alimentadores.length; i++) {
      var a = rota.alimentadores[i];
      var chave = rota.polo + '/' + a;
      if (!cacheTamanho[chave]) {
        try {
          var d = await pegarJson('cabos/' + rota.polo + '/' + a + '.json');
          var segs = (d.t1 || []).concat(d.t2 || []);
          var e = 0;
          for (var s = 0; s < segs.length; s++) {
            var pts = segs[s];
            for (var p = 0; p < pts.length - 1; p++) {
              e += km(pts[p][1], pts[p][0], pts[p + 1][1], pts[p + 1][0]);
            }
          }
          cacheTamanho[chave] = { trechos: segs.length, km: e };
        } catch (err) {
          cacheTamanho[chave] = null;
        }
      }
      if (cacheTamanho[chave]) {
        trechos += cacheTamanho[chave].trechos;
        ext += cacheTamanho[chave].km;
      } else {
        faltou = true;
      }
    }
    return { trechos: trechos, km: ext, incompleto: faltou };
  }

  function municipiosDaRota(rota) {
    if (!indice || !indice[rota.polo]) return [];
    var vistos = [];
    rota.alimentadores.forEach(function (a) {
      var i = indice[rota.polo][a];
      var m = i && i.municipio;
      if (m && vistos.indexOf(m) < 0) vistos.push(m);
    });
    return vistos;
  }

  function concluida(estado, id) {
    try {
      var s = estado && estado.statusRotas && estado.statusRotas[String(id)];
      if (!s) return false;
      var v = (typeof s === 'string') ? s : s.status;
      return v === 'concluido' || v === 'concluida';
    } catch (e) { return false; }
  }

  function ativaDaEquipe(estado, equipe) {
    try {
      var e = estado && estado.equipes && estado.equipes[equipe];
      return (e && e.projetoAtivo) ? String(e.projetoAtivo.rotaId) : null;
    } catch (er) { return null; }
  }

  function cartao(rota, tipo, ordem, tam) {
    var muns = municipiosDaRota(rota);
    var alims = rota.alimentadores.map(esc).join(', ');
    var etiqueta = { ativa: 'EM ANDAMENTO', proxima: ordem + 'ª DA FILA', feita: 'CONCLUÍDA' }[tipo];
    var medida = '';
    if (tam && tam.trechos) {
      medida = tam.trechos + ' trecho' + (tam.trechos === 1 ? '' : 's') +
               ' · ' + tam.km.toFixed(1).replace('.', ',') + ' km' +
               (tam.incompleto ? ' (parcial)' : '');
    } else if (tam) {
      medida = 'tamanho indisponível';
    }
    return '' +
      '<div class="vpr-card vpr-' + tipo + '">' +
        '<div class="vpr-topo">' +
          '<span class="vpr-nome">' + esc(rota.nomeProjeto || 'Sem nome') + '</span>' +
          '<span class="vpr-tag vpr-tag-' + tipo + '">' + etiqueta + '</span>' +
        '</div>' +
        (muns.length ? '<div class="vpr-mun">' + muns.map(esc).join(' · ') + '</div>' : '') +
        (medida ? '<div class="vpr-medida">' + medida + '</div>' : '') +
        '<div class="vpr-alims" title="' + alims + '">' +
          rota.alimentadores.length + ' alimentador' + (rota.alimentadores.length === 1 ? '' : 'es') +
          ' · ' + alims +
        '</div>' +
        '<div class="vpr-meta">' + esc(rota.polo) + ' · criada em ' + esc(rota.criada || '—') + '</div>' +
      '</div>';
  }

  async function desenhar() {
    var alvo = document.getElementById('proximas-lista');
    if (!alvo || carregando) return;
    carregando = true;
    alvo.innerHTML = '<div class="vpr-vazio">Carregando as rotas da equipe…</div>';

    var equipe = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
    if (!equipe) { alvo.innerHTML = '<div class="vpr-vazio">Entre com a equipe para ver a fila.</div>'; carregando = false; return; }

    var rotas, estado;
    try {
      rotas = await pegarJson('rotas.json');
      estado = await pegarJson('estado-equipes.json');
      if (!indice) { try { indice = await pegarJson('dados/indice.json'); } catch (e) { indice = null; } }
    } catch (e) {
      alvo.innerHTML = '<div class="vpr-vazio">Não deu para carregar agora. Verifique a conexão e toque de novo na aba.</div>';
      carregando = false;
      return;
    }

    var minhas = (rotas.rotas || []).filter(function (r) {
      return r && r.equipe === equipe && r.polo && Array.isArray(r.alimentadores) && r.alimentadores.length;
    });
    if (!minhas.length) {
      alvo.innerHTML = '<div class="vpr-vazio">Nenhuma rota atribuída para ' + esc(equipe) + ' no momento.</div>';
      carregando = false;
      return;
    }

    var idAtiva = ativaDaEquipe(estado, equipe);
    var ativa = null, proximas = [], feitas = [];
    minhas.forEach(function (r) {
      if (idAtiva && String(r.id) === idAtiva) ativa = r;
      else if (concluida(estado, r.id)) feitas.push(r);
      else proximas.push(r);
    });

    // tamanho só do que ainda vai ser feito
    var tamAtiva = ativa ? await tamanhoDaRota(ativa) : null;
    var tamProx = [];
    for (var i = 0; i < proximas.length; i++) tamProx.push(await tamanhoDaRota(proximas[i]));

    var h = '';
    if (ativa) {
      h += '<div class="vpr-secao">Trabalhando agora</div>' + cartao(ativa, 'ativa', 0, tamAtiva);
    }
    if (proximas.length) {
      var totalKm = tamProx.reduce(function (a, t) { return a + (t ? t.km : 0); }, 0);
      h += '<div class="vpr-secao">Próximas na fila (' + proximas.length + ' · ' +
           totalKm.toFixed(1).replace('.', ',') + ' km no total)</div>';
      proximas.forEach(function (r, i) { h += cartao(r, 'proxima', i + 1, tamProx[i]); });
    }
    if (feitas.length) {
      h += '<div class="vpr-secao">Já concluídas (' + feitas.length + ')</div>';
      feitas.forEach(function (r) { h += cartao(r, 'feita', 0, null); });
    }
    if (!ativa && !proximas.length) {
      h = '<div class="vpr-vazio">Tudo em dia. Nenhuma rota pendente para ' + esc(equipe) + '.</div>' + h;
    }
    h += '<div class="vpr-rodape">Quem libera a próxima rota é o supervisor, pelo painel. ' +
         'Esta tela é só para a equipe saber o que vem pela frente.</div>';
    alvo.innerHTML = h;
    carregando = false;
  }

  function montar() {
    if (montada) return true;
    var barra = document.getElementById('tab-records');
    var painelIrmao = document.getElementById('records-panel');
    if (!barra || !painelIrmao || !barra.parentNode) return false;

    var st = document.createElement('style');
    st.textContent =
      '#proximas-panel{padding:14px;}' +
      '.vpr-secao{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;' +
      'color:#5d6b5d;margin:16px 0 8px;}' +
      '.vpr-secao:first-child{margin-top:2px;}' +
      '.vpr-card{border:1px solid #e2e8e2;border-radius:12px;padding:12px 13px;margin-bottom:9px;background:#fff;}' +
      '.vpr-ativa{border-color:#4CAF50;background:#f4fbf5;box-shadow:0 2px 8px rgba(76,175,80,.13);}' +
      '.vpr-feita{opacity:.6;}' +
      '.vpr-topo{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;}' +
      '.vpr-nome{font-size:15px;font-weight:700;color:#1a2e1a;line-height:1.25;}' +
      '.vpr-tag{font-size:9px;font-weight:800;letter-spacing:.05em;padding:3px 7px;border-radius:20px;' +
      'white-space:nowrap;flex-shrink:0;margin-top:1px;}' +
      '.vpr-tag-ativa{background:#4CAF50;color:#fff;}' +
      '.vpr-tag-proxima{background:#eef3ee;color:#4a6b4a;border:1px solid #d3e0d3;}' +
      '.vpr-tag-feita{background:#eceff1;color:#78909c;}' +
      '.vpr-mun{font-size:12px;color:#2d5a27;font-weight:600;margin-top:3px;}' +
      '.vpr-medida{font-size:13px;color:#1a2e1a;font-weight:600;margin-top:5px;}' +
      '.vpr-alims{font-size:11px;color:#6b7a6b;margin-top:5px;font-family:"SF Mono","Courier New",monospace;' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.vpr-meta{font-size:10.5px;color:#93a093;margin-top:5px;}' +
      '.vpr-vazio{padding:22px 14px;text-align:center;color:#6b7a6b;font-size:13px;line-height:1.5;}' +
      '.vpr-rodape{margin-top:16px;padding:10px 12px;background:#f6f8f6;border-radius:10px;' +
      'font-size:11.5px;color:#6b7a6b;line-height:1.45;}';
    document.head.appendChild(st);

    var botao = document.createElement('button');
    botao.className = 'tab-btn';
    botao.id = 'tab-proximas';
    botao.setAttribute('onclick', "switchTab('proximas')");
    botao.innerHTML = '<span class="tab-icon">Próximas</span>';
    barra.parentNode.insertBefore(botao, barra.nextSibling);

    var painel = document.createElement('div');
    painel.className = 'tab-panel';
    painel.id = 'proximas-panel';
    painel.innerHTML = '<div id="proximas-lista"></div>';
    painelIrmao.parentNode.insertBefore(painel, painelIrmao.nextSibling);

    // a aba é da equipe: o Admin já tem o painel completo dele
    var ehAdmin = false;
    try { ehAdmin = (typeof currentUser !== 'undefined' && currentUser === 'Admin'); } catch (e) {}
    botao.style.display = ehAdmin ? 'none' : 'flex';

    if (typeof window.switchTab === 'function' && !window.switchTab.__veraProx) {
      var orig = window.switchTab;
      window.switchTab = function (nome) {
        var r = orig.apply(this, arguments);
        if (nome === 'proximas') desenhar();
        return r;
      };
      window.switchTab.__veraProx = true;
    }

    window.veraDesenharProximas = desenhar;   // usado pelos testes
    montada = true;
    return true;
  }

  var voltas = 0;
  var t = setInterval(function () {
    voltas++;
    if (montar() || voltas > 60) clearInterval(t);
  }, 1000);
  montar();
})();
