(function () {
  'use strict';

  // Depois que a sincronizacao termina, o GitHub ja e o arquivo definitivo
  // (fotos + JSON do ponto). Este modulo entao enxuga o registro LOCAL para
  // 1 foto por ponto: o ponto continua marcado no mapa com uma foto, e o
  // aparelho para de acumular as 3 fotos em base64 que estouravam o
  // armazenamento do tablet.
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
      // So mexe em ponto ja enviado (as 3 fotos estao seguras no GitHub).
      if (!r || !r.synced) continue;
      if (!Array.isArray(r.photos) || r.photos.length <= 1) continue;
      r.photos = [r.photos[0]];
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
          showToast(n + ' ponto(s) enxugado(s): fotos locais reduzidas a 1 por ponto (as 3 seguem no GitHub).', 'success');
        }
      } catch (e) { console.warn('VERA pos-sync fotos:', e); }
      return saida;
    };
    return true;
  }

  var tentativa = setInterval(function () { if (instalar()) clearInterval(tentativa); }, 500);
  setTimeout(function () { clearInterval(tentativa); }, 30000);

  // Retroativo: pontos sincronizados antes desta versao sao enxugados na
  // primeira abertura, liberando espaco imediatamente.
  setTimeout(function () {
    enxugarFotosSincronizadas().then(function (n) {
      if (n > 0 && typeof showToast === 'function') {
        showToast('Armazenamento liberado: ' + n + ' ponto(s) agora com 1 foto local.', 'success');
      }
    }).catch(function () {});
  }, 6000);
})();
