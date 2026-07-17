(function () {
  'use strict';

  // Depois que a sincronizacao termina, o GitHub ja e o arquivo definitivo
  // (fotos + JSON do ponto). Este modulo entao REMOVE as fotos LOCAIS dos
  // pontos JA ENVIADOS: o ponto continua no mapa (o marcador vem de lat/lon,
  // nao da foto) e o tablet para de carregar centenas de imagens base64 que
  // estouravam o armazenamento e deixavam o app travado na hora de coletar.
  //
  // Regra de seguranca: so mexe em ponto com r.synced === true (fotos ja
  // seguras no GitHub). Ponto pendente/nao enviado NUNCA e tocado — as fotos
  // dele sao a unica copia e precisam subir primeiro.
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
      // So mexe em ponto JA ENVIADO (fotos seguras no GitHub).
      if (!r || !r.synced) continue;
      // Nada a remover se ja esta sem foto local.
      if (!Array.isArray(r.photos) || r.photos.length === 0) continue;
      // Guarda a contagem original (p/ CSV/relatorio) antes de descartar.
      if (typeof r.fotos_count !== 'number') r.fotos_count = r.photos.length;
      // Remove TODAS as fotos locais: deixa so o ponto. Alivio maximo de
      // memoria e armazenamento no tablet, sem apagar nada do GitHub.
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
