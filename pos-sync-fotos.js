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
