(function () {
  'use strict';

  // Guardas contra perda de ponto e de foto.
  //
  // Vieram de uma auditoria do caminho de sincronização. Todas são ADITIVAS:
  // nenhuma apaga, reordena ou reescreve dado. O que elas fazem é impedir que
  // caminhos já existentes destruam o que ainda só existe no aparelho.
  //
  // Defeitos que endereçam, conferidos um a um no base.html:
  //   1. o app nunca pediu armazenamento persistente ao navegador
  //   2. savePoint() grava sem try/catch: quota estourada falha em silêncio
  //   3. reenviarTodos() zera fotos_github e órfã as fotos no GitHub
  //   4. clearSyncedRecords() ignora a trava que protege foto não confirmada
  //   5. clearAllRecords() apaga pendente sem dizer quantos
  //
  // Um sexto defeito NÃO é corrigido aqui e fica registrado: isSyncing é
  // setado sem try/finally (base.html:1775 e 1898). Uma exceção que escape
  // dos try/catch internos o deixa travado e toda sincronização seguinte vira
  // no-op mudo. É um `let` de topo de script — não vai para o window, e um
  // patch externo não consegue zerá-lo. O corpo do laço hoje está todo coberto
  // pelos try/catch internos, então é risco latente, não bug ativo.

  if (window.__veraSyncSegura) return;
  window.__veraSyncSegura = true;

  function toast(msg, tipo) {
    if (typeof showToast === 'function') showToast(msg, tipo || '');
    else console.warn('VERA:', msg);
  }

  // ── 1. Armazenamento persistente ──────────────────────────────────────
  // Sem isto o IndexedDB é "best-effort": o navegador pode despejá-lo sob
  // pressão de disco, e no iOS após dias sem uso. Tudo que ainda não subiu ao
  // GitHub existe em uma única cópia, ali dentro.
  function pedirPersistencia() {
    try {
      if (!navigator.storage || !navigator.storage.persist) return;
      navigator.storage.persisted().then(function (ja) {
        if (ja) { window.__veraArmazenamentoPersistente = true; return; }
        return navigator.storage.persist().then(function (ok) {
          window.__veraArmazenamentoPersistente = !!ok;
          console.info('VERA armazenamento persistente:', ok ? 'concedido' : 'negado');
        });
      }).catch(function () {});
    } catch (e) {}
  }

  // ── helpers de integridade foto↔ponto ────────────────────────────────
  function locaisReais(r) {
    if (!Array.isArray(r.photos)) return 0;
    return r.photos.filter(function (p) {
      return typeof p === 'string' && p.indexOf('data:') === 0;
    }).length;
  }
  function noGithub(r) {
    return Array.isArray(r.fotos_github) ? r.fotos_github.length : 0;
  }
  // Mesma regra da trava do pos-sync-fotos.js: só está seguro se o GitHub já
  // tem pelo menos tantas fotos quanto o aparelho ainda guarda.
  function fotosConfirmadas(r) {
    return noGithub(r) >= locaisReais(r);
  }
  // Ponto já enviado e com as fotos locais enxugadas: o GitHub é a única
  // cópia das fotos dele.
  function foiEnxugado(r) {
    return !!r.synced && locaisReais(r) === 0 && noGithub(r) > 0;
  }

  var instalado = false;
  function instalar() {
    if (instalado) return true;
    if (typeof window.savePoint !== 'function'
        || typeof window.dbGetAll !== 'function') return false;

    // ── 2. savePoint não pode falhar calado ────────────────────────────
    // O `await dbPut` do base.html não tem try/catch. Se a quota estourar, a
    // promise rejeita, clearForm() e o toast de sucesso não rodam, e o técnico
    // fica olhando o formulário parado sem uma única mensagem.
    var saveOriginal = window.savePoint;
    window.savePoint = async function () {
      try {
        return await saveOriginal.apply(this, arguments);
      } catch (e) {
        console.error('VERA savePoint falhou:', e);
        var nome = (e && e.name) || '';
        toast(/quota|QuotaExceeded/i.test(nome + ' ' + (e && e.message))
          ? 'SEM ESPAÇO no aparelho: o ponto NÃO foi salvo. Sincronize os pendentes e tente de novo.'
          : 'O ponto NÃO foi salvo (' + (nome || 'erro') + '). Não saia da tela: tente salvar de novo.',
          'error');
        throw e;
      }
    };

    // ── 3. reenviarTodos não pode orfanar foto ─────────────────────────
    // O original zera fotos_ids/fotos_github de TODOS os pontos. Para quem já
    // teve as fotos locais enxugadas, o reenvio sobe o JSON com fotos_github
    // vazio e as fotos ficam órfãs no GitHub — o oposto do que o aviso promete.
    // Aqui o reenvio pula justamente esses: o JSON deles no GitHub fica como
    // está, com as referências intactas.
    if (typeof window.reenviarTodos === 'function') {
      window.reenviarTodos = async function () {
        var todos = await window.dbGetAll('points');
        if (!todos.length) { toast('Nenhum ponto registrado.'); return; }
        var seguros = todos.filter(function (r) { return !foiEnxugado(r); });
        var pulados = todos.length - seguros.length;
        if (!seguros.length) {
          toast('Nada a reenviar: todos os ' + pulados + ' ponto(s) já estão no '
              + 'servidor com as fotos. Reenviar apagaria as fotos deles.', '');
          return;
        }
        var msg = 'Reenviar ' + seguros.length + ' ponto(s)?'
          + (pulados ? '\n\n' + pulados + ' ponto(s) ficam de fora: as fotos deles já'
              + ' estão no servidor e não existem mais neste aparelho. Reenviar'
              + ' apagaria a ligação com essas fotos.' : '');
        if (!confirm(msg)) return;
        for (var i = 0; i < seguros.length; i++) {
          var p = seguros[i];
          p.synced = false;
          p.syncedAt = null;
          // fotos_ids e fotos_github NÃO são zerados: se o upload da foto
          // falhar no reenvio, a referência antiga continua valendo.
          await window.dbPut('points', p);
        }
        if (typeof updatePendingBadge === 'function') updatePendingBadge();
        toast('Reenviando ' + seguros.length + ' ponto(s)'
              + (pulados ? ' (' + pulados + ' preservados)' : '') + '...', '');
        if (typeof window.syncPendingPoints === 'function') await window.syncPendingPoints();
      };
    }

    // ── 4. limpar enviados não pode apagar foto não confirmada ─────────
    // synced=true não significa "todas as fotos subiram": o base.html marca
    // assim quando o JSON sobe, mesmo com foto faltando. O pos-sync tem trava
    // para isso, mas clearSyncedRecords a ignorava e apagava o registro inteiro.
    if (typeof window.clearSyncedRecords === 'function') {
      var limparOriginal = window.clearSyncedRecords;
      window.clearSyncedRecords = async function () {
        var todos = await window.dbGetAll('points');
        var enviados = todos.filter(function (r) { return r.synced; });
        var podem = enviados.filter(fotosConfirmadas);
        var retidos = enviados.length - podem.length;
        if (!enviados.length) { toast('Nenhum ponto enviado para remover.'); return; }
        var msg = 'Remover ' + podem.length + ' ponto(s) já enviado(s)?'
          + (retidos ? '\n\n' + retidos + ' ficam retidos: têm foto que ainda não'
              + ' chegou ao servidor. Apagar perderia essa foto para sempre.' : '');
        if (!confirm(msg)) return;
        for (var i = 0; i < podem.length; i++) await window.dbDelete('points', podem[i].id);
        if (typeof renderRecords === 'function') renderRecords();
        if (typeof renderMapPoints === 'function') renderMapPoints();
        if (typeof updatePendingBadge === 'function') updatePendingBadge();
        toast(podem.length + ' registro(s) removido(s)'
              + (retidos ? ', ' + retidos + ' retido(s) por foto pendente' : '') + '.', 'success');
      };
    }

    // ── 5. limpar tudo tem de dizer quantos pendentes vai levar junto ──
    if (typeof window.clearAllRecords === 'function') {
      var apagarOriginal = window.clearAllRecords;
      window.clearAllRecords = async function () {
        var todos = await window.dbGetAll('points');
        var pendentes = todos.filter(function (r) { return !r.synced; }).length;
        var comFotoPresa = todos.filter(function (r) {
          return r.synced && !fotosConfirmadas(r);
        }).length;
        if (pendentes || comFotoPresa) {
          var aviso = 'ATENÇÃO — isto apaga dado que NÃO está no servidor:\n\n'
            + (pendentes ? '• ' + pendentes + ' ponto(s) nunca enviado(s)\n' : '')
            + (comFotoPresa ? '• ' + comFotoPresa + ' ponto(s) com foto que não subiu\n' : '')
            + '\nEsse material não existe em nenhum outro lugar. Sincronize antes.'
            + '\n\nApagar mesmo assim?';
          if (!confirm(aviso)) return;
        }
        return apagarOriginal.apply(this, arguments);
      };
    }

    instalado = true;
    return true;
  }

  pedirPersistencia();
  var tentativa = setInterval(function () { if (instalar()) clearInterval(tentativa); }, 500);
  setTimeout(function () { clearInterval(tentativa); }, 60000);
})();
