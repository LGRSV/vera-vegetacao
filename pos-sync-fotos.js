(function () {
  'use strict';

  // Depois que a sincronizacao termina, o GitHub ja e o arquivo definitivo
  // (fotos + JSON do ponto). Este modulo entao REMOVE as fotos LOCAIS dos
  // pontos JA ENVIADOS: o ponto continua no mapa (o marcador vem de lat/lon,
  // nao da foto) e o tablet para de carregar centenas de imagens base64 que
  // estouravam o armazenamento e deixavam o app travado na hora de coletar.
  //
  // TRAVA ANTI-PERDA (critico): o app marca synced=true quando o JSON do
  // ponto sobe, MESMO que alguma foto tenha falhado no upload. Por isso este
  // modulo so apaga fotos locais quando o GitHub ja tem pelo menos a mesma
  // quantidade (fotos_github >= fotos locais). Se qualquer foto ainda nao foi
  // confirmada no GitHub, mantemos TODAS as locais para reenvio. Ponto
  // pendente/nao enviado NUNCA e tocado.
  if (window.__veraPosSyncFotos) return;
  window.__veraPosSyncFotos = true;

  async function enxugarFotosSincronizadas() {
    if (typeof dbGetAll !== 'function' || typeof dbPut !== 'function') return 0;
    var todos;
    try { todos = await dbGetAll('points'); } catch (e) { return 0; }
    if (!Array.isArray(todos)) return 0;

    var enxugados = 0;
    for (var i = 0; i < todos.length; i++) {
      var r = todos[i];
      // So mexe em ponto JA ENVIADO.
      if (!r || !r.synced) continue;
      // Nada a remover se ja esta sem foto local.
      if (!Array.isArray(r.photos) || r.photos.length === 0) continue;

      // ===== TRAVA ANTI-PERDA DE DADOS =====
      // ATENCAO: o app marca synced=true quando o JSON do ponto sobe, MESMO
      // que alguma FOTO tenha falhado no upload (fotos_github guarda so as
      // que realmente chegaram ao GitHub). Portanto NUNCA confie so em
      // synced para apagar foto local. So removemos as fotos locais quando o
      // GitHub JA TEM pelo menos a mesma quantidade que existe no aparelho.
      // Se ainda ha foto nao confirmada, mantemos TODAS para reenvio.
      var confirmadasNoGithub = Array.isArray(r.fotos_github) ? r.fotos_github.length : 0;
      var locaisReais = r.photos.filter(function (p) {
        return typeof p === 'string' && p.indexOf('data:') === 0;
      }).length;
      if (confirmadasNoGithub < locaisReais) continue; // foto pendente → nao apaga nada

      // Guarda a contagem original (p/ CSV/relatorio) antes de descartar.
      if (typeof r.fotos_count !== 'number') r.fotos_count = r.photos.length;
      // Seguro remover: tudo que estava local ja esta no GitHub.
      r.photos = [];
      r.fotosEnxugadasEm = new Date().toISOString();
      try { await dbPut('points', r); enxugados++; } catch (e) {}
    }
    return enxugados;
  }

  function instalar() {
    if (typeof window.syncPendingPoints !== 'function' || window.__veraPosSyncHooked) {
      return window.__veraPosSyncHooked === true;
    }
    var original = window.syncPendingPoints;
    window.__veraPosSyncHooked = true;
    window.syncPendingPoints = async function () {
      var saida = await original.apply(this, arguments);
      try {
        var n = await enxugarFotosSincronizadas();
        if (n > 0 && typeof showToast === 'function') {
          showToast(n + ' ponto(s) enviados aliviados: fotos locais removidas (seguem no GitHub). App mais leve.', 'success');
        }
      } catch (e) { console.warn('VERA pos-sync fotos:', e); }
      return saida;
    };
    return true;
  }

  var tentativa = setInterval(function () { if (instalar()) clearInterval(tentativa); }, 500);
  setTimeout(function () { clearInterval(tentativa); }, 30000);

  // Retroativo: pontos ja enviados antes desta versao tem as fotos locais
  // removidas assim que o banco fica pronto — libera espaco e destrava o app
  // sem esperar uma nova sincronizacao. Roda uma unica vez.
  var jaRodou = false;
  function limpezaRetroativa() {
    if (jaRodou || typeof dbGetAll !== 'function' || typeof dbPut !== 'function') return;
    jaRodou = true;
    enxugarFotosSincronizadas().then(function (n) {
      if (n > 0 && typeof showToast === 'function') {
        showToast('Armazenamento liberado: fotos locais de ' + n + ' ponto(s) ja enviados foram removidas. App mais leve.', 'success');
      }
    }).catch(function () { jaRodou = false; });
  }
  var tentaLimpeza = setInterval(function () {
    if (typeof dbGetAll === 'function' && typeof dbPut === 'function') {
      clearInterval(tentaLimpeza);
      limpezaRetroativa();
    }
  }, 500);
  setTimeout(function () { clearInterval(tentaLimpeza); }, 30000);
})();


/* =========================================================================
   Filtro do TECNICO — mostra so os pontos da ROTA ATIVA, tanto no MAPA quanto
   na LISTA de Registros (contador e badge tambem).
   (Empacotado aqui pra nao reescrever o index.html; e independente do resto.)
   Ao trocar de rota, o tecnico deixa de ver pontos de rotas antigas — so a
   rota em que esta trabalhando (ex.: Guarai). NAO apaga nada (so filtra a
   exibicao), NAO afeta o Admin (usa o mapa/painel admin, que le do GitHub) nem
   a sincronizacao. Em qualquer erro, cai no comportamento original (mostra tudo).
   ========================================================================= */
(function () {
  'use strict';
  if (window.__veraFiltroTecnico) return;
  window.__veraFiltroTecnico = true;

  function rotaAtiva() {
    return (typeof rotaAtribuida !== 'undefined' && rotaAtribuida && rotaAtribuida.nomeProjeto) ? rotaAtribuida.nomeProjeto : null;
  }
  function ehAdmin() {
    return (typeof currentUser !== 'undefined' && currentUser === 'Admin');
  }
  function txt(v) { return (v == null ? '' : String(v)); }

  function popup(r) {
    return '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;min-width:150px">'
      + '<div style="font-weight:700;color:#1a2e1a;margin-bottom:4px">' + txt(r.especie || 'Sem especie') + '</div>'
      + '<div style="font-size:12px;color:#5a7a55">Poste: ' + txt(r.poste || '—') + '</div>'
      + '<div style="font-size:12px;color:#5a7a55">Altura: ' + txt(r.altura || '—') + 'm</div>'
      + '<div style="font-size:11px;margin-top:4px;color:' + (r.synced ? '#2d5a27' : '#e8a020') + ';font-weight:600">'
      + (r.synced ? ' Enviado' : '⏳ Pendente') + '</div>'
      + ((r.photos && r.photos[0]) ? '<img src="' + r.photos[0] + '" style="width:100%;border-radius:6px;margin-top:8px">' : '')
      + '</div>';
  }

  // ---- MAPA ----
  function wrapMapa() {
    if (typeof window.renderMapPoints !== 'function' || window.__rmpWrap) return;
    window.__rmpWrap = true;
    var original = window.renderMapPoints;
    window.renderMapPoints = async function () {
      try {
        var camada = (typeof pointsLayer !== 'undefined') ? pointsLayer : null;
        var ativa = rotaAtiva();
        if (!camada || ehAdmin() || !ativa) return original.apply(this, arguments);
        camada.clearLayers();
        var records = await dbGetAll('points');
        records.forEach(function (r) {
          if (!r.lat || !r.lon) return;
          if (r.projeto !== ativa) return; // esconde pontos de OUTRAS rotas
          var marker = L.circleMarker([r.lat, r.lon], { radius: 8, fillColor: '#4CAF50', color: '#1a2e1a', weight: 2, fillOpacity: 0.85 });
          marker.bindPopup(popup(r));
          camada.addLayer(marker);
        });
      } catch (e) {
        console.warn('VERA filtro-mapa:', e);
        try { return original.apply(this, arguments); } catch (_) {}
      }
    };
    try { window.renderMapPoints(); } catch (e) {}
  }

  // ---- LISTA DE REGISTROS ----
  function wrapLista() {
    if (typeof window.renderRecords !== 'function' || window.__rrWrap) return;
    window.__rrWrap = true;
    var original = window.renderRecords;
    window.renderRecords = async function () {
      try {
        var ativa = rotaAtiva();
        var listEl = document.getElementById('records-list');
        var countEl = document.getElementById('records-count');
        if (ehAdmin() || !ativa || !listEl) return original.apply(this, arguments);
        var all = await dbGetAll('points');
        var records = all.filter(function (r) { return r && r.projeto === ativa; });
        var pending = records.filter(function (r) { return !r.synced; }).length;
        if (countEl) countEl.textContent = records.length + ' ponto(s) — ' + pending + ' pendente(s)';
        if (records.length === 0) {
          listEl.innerHTML = '<div class="empty-state"><div class="empty-icon"></div><p>Nenhum ponto de ' + txt(ativa) + ' ainda.<br>Va em "Novo Ponto" para comecar.</p></div>';
          return;
        }
        listEl.innerHTML = records.slice().reverse().map(function (r) {
          return '<div class="record-card ' + (r.synced ? 'synced' : 'pending') + '">'
            + '<div>'
            + '<div class="record-id">' + txt(r.id) + ' · ' + txt(r.usuario) + '</div>'
            + '<div class="record-species">' + txt(r.especie || '—') + '</div>'
            + '<div class="record-meta">'
            + (r.poste ? '<span class="meta-tag"> ' + txt(r.poste) + '</span>' : '')
            + (r.altura ? '<span class="meta-tag">↕ ' + txt(r.altura) + 'm</span>' : '')
            + (r.dap ? '<span class="meta-tag">⊙ ' + txt(r.dap) + 'cm</span>' : '')
            + '<span class="' + (r.synced ? 'synced-tag' : 'sync-tag') + '">' + (r.synced ? ' Enviado' : '⏳ Pendente') + '</span>'
            + '</div>'
            + '<div style="font-size:10px;color:var(--text-muted);margin-top:5px">' + txt(r.data) + '</div>'
            + '</div>'
            + '<div>'
            + ((r.photos && r.photos[0]) ? '<img class="record-thumb" src="' + r.photos[0] + '">' : '<div class="record-no-photo"></div>')
            + '</div>'
            + '</div>';
        }).join('');
      } catch (e) {
        console.warn('VERA filtro-lista:', e);
        try { return original.apply(this, arguments); } catch (_) {}
      }
    };
    try { window.renderRecords(); } catch (e) {}
  }

  // ---- CONTADOR "Status de Sincronizacao" (stat-total / stat-pending / pending-info) ----
  function wrapStatus() {
    if (typeof window.updatePendingBadge !== 'function' || window.__upbWrap) return;
    window.__upbWrap = true;
    var original = window.updatePendingBadge;
    window.updatePendingBadge = async function () {
      try {
        var ativa = rotaAtiva();
        if (ehAdmin() || !ativa) return original.apply(this, arguments);
        var all = (await dbGetAll('points')).filter(function (r) { return r && r.projeto === ativa; });
        var pending = all.filter(function (r) { return !r.synced; });
        var info = document.getElementById('pending-info');
        if (info) {
          if (pending.length > 0) { info.style.display = 'block'; info.textContent = pending.length + ' pendente' + (pending.length > 1 ? 's' : ''); }
          else { info.style.display = 'none'; }
        }
        var st = document.getElementById('stat-total'); if (st) st.textContent = all.length;
        var sp = document.getElementById('stat-pending'); if (sp) sp.textContent = pending.length;
      } catch (e) {
        console.warn('VERA filtro-status:', e);
        try { return original.apply(this, arguments); } catch (_) {}
      }
    };
    try { window.updatePendingBadge(); } catch (e) {}
  }

  var timer = setInterval(function () {
    wrapMapa();
    wrapLista();
    wrapStatus();
    if (window.__rmpWrap && window.__rrWrap && window.__upbWrap) clearInterval(timer);
  }, 400);
  setTimeout(function () { clearInterval(timer); }, 30000);
})();
