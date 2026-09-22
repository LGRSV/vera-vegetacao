(function () {
  'use strict';

  // Guardas contra perda de ponto e de foto.
  //
  // Vieram de uma auditoria do caminho de sincronização. Todas são ADITIVAS:
  // nenhuma apaga, reordena ou reescreve dado. O que elas fazem é impedir que
  // caminhos já existentes destruam o que ainda só existe no aparelho.
  //
  // Defeitos que endereçam, conferidos um a um no base.html:
  //   1. dbPut sobrescreve ponto por colisão de id local — o pior deles
  //   2. dbPut pode nunca resolver: tem tx.onerror e não tem tx.onabort
  //   3. o app nunca pediu armazenamento persistente ao navegador
  //   4. savePoint() grava sem try/catch: quota estourada falha em silêncio
  //   5. reenviarTodos() zera fotos_github e órfã as fotos no GitHub
  //   6. clearSyncedRecords() ignora a trava que protege foto não confirmada
  //   7. clearAllRecords() apaga pendente sem dizer quantos
  //
  // Nota da revisão: clearSyncedRecords e clearAllRecords NÃO TÊM CHAMADOR
  // hoje — só se chega nelas pelo console. As guardas 6 e 7 ficam porque são
  // baratas e a função pode ganhar botão amanhã, mas não são a proteção
  // principal. E o botão "Sincronizar agora" não roda syncPendingPoints: o
  // hotfix-fotos.js o intercepta (linha 319) e roda forcarSincronizacaoOnline,
  // que também dispara sozinho no evento online, a cada visibilitychange e
  // 1,8 s depois de cada carga. Esse caminho já barra o ponto enxugado pelo
  // precisaReenviar (hotfix-fotos.js:144, `locais > remotas`), conferido.
  //
  // Um sexto defeito NÃO é corrigido aqui e fica registrado: isSyncing é
  // setado sem try/finally (base.html:1775 e 1898). Uma exceção que escape
  // dos try/catch internos o deixa travado e toda sincronização seguinte vira
  // no-op mudo. É um `let` de topo de script — não vai para o window, e um
  // patch externo não consegue zerá-lo. O corpo do laço hoje está todo coberto
  // pelos try/catch internos, então é risco latente, não bug ativo.

  if (window.__veraSyncSegura) return;
  window.__veraSyncSegura = true;

  // O window.confirm() não abre em iPhone com o app instalado (PWA standalone)
  // e o toque morre sem resposta — o repositório já registrou isso em
  // conclusao-rotas.js:40. O confirmarNoApp de lá resolve, mas é função de
  // módulo, não vai para o window. Então aqui vai o mesmo recurso, próprio.
  function confirmar(mensagem, textoBotao) {
    return new Promise(function (resolver) {
      var anterior = document.getElementById('vera-confirma-sync');
      if (anterior) {
        // Fechar sem resolver deixaria quem estava esperando pendurado.
        if (anterior.__veraResolver) { try { anterior.__veraResolver(false); } catch (e) {} }
        anterior.remove();
      }
      var fundo = document.createElement('div');
      fundo.id = 'vera-confirma-sync';
      fundo.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(10,20,14,.55);'
        + 'display:flex;align-items:center;justify-content:center;padding:22px;';
      var cartao = document.createElement('div');
      cartao.style.cssText = 'width:min(100%,360px);background:#fff;border-radius:16px;padding:22px 20px;'
        + 'box-shadow:0 18px 48px rgba(0,0,0,.35);font-family:inherit;color:#1a2e1a;';
      var texto = document.createElement('div');
      texto.style.cssText = 'font-size:14px;line-height:1.55;white-space:pre-line;';
      texto.textContent = mensagem;                 // textContent: mensagem é dado, não markup
      var linha = document.createElement('div');
      linha.style.cssText = 'display:flex;gap:10px;margin-top:18px;';
      var nao = document.createElement('button');
      nao.type = 'button'; nao.textContent = 'Cancelar';
      nao.style.cssText = 'flex:1;padding:12px;border:1.5px solid #c9dfce;border-radius:10px;'
        + 'background:#fff;color:#1a2e1a;font:700 13px inherit;cursor:pointer;';
      var sim = document.createElement('button');
      sim.type = 'button'; sim.textContent = textoBotao || 'Confirmar';
      sim.style.cssText = 'flex:1;padding:12px;border:0;border-radius:10px;background:#1a2e1a;'
        + 'color:#fff;font:700 13px inherit;cursor:pointer;';
      fundo.__veraResolver = resolver;
      function fechar(r) { fundo.__veraResolver = null; fundo.remove(); resolver(r); }
      nao.addEventListener('click', function () { fechar(false); });
      sim.addEventListener('click', function () { fechar(true); });
      fundo.addEventListener('click', function (ev) { if (ev.target === fundo) fechar(false); });
      linha.appendChild(nao); linha.appendChild(sim);
      cartao.appendChild(texto); cartao.appendChild(linha); fundo.appendChild(cartao);
      document.body.appendChild(fundo);
    });
  }

  function toast(msg, tipo) {
    // showToast escreve direto em #toast (base.html:2596). Se o app ainda não
    // montou, estoura — e justamente as mensagens de falha de carga cairiam aqui.
    try {
      if (typeof showToast === 'function' && document.getElementById('toast')) {
        showToast(msg, tipo || '');
        return;
      }
    } catch (e) {}
    console.warn('VERA:', msg);
  }

  // ── 1. Armazenamento persistente ──────────────────────────────────────
  // Sem isto o IndexedDB é "best-effort": o navegador pode despejá-lo sob
  // pressão de disco, e no iOS após dias sem uso. Tudo que ainda não subiu ao
  // GitHub existe em uma única cópia, ali dentro.
  function pedirPersistencia() {
    try {
      if (!navigator.storage || !navigator.storage.persist) {
        window.__veraArmazenamentoPersistente = false;
        avisarArmazenamentoFragil();       // iOS cai aqui
        return;
      }
      navigator.storage.persisted().then(function (ja) {
        if (ja) { window.__veraArmazenamentoPersistente = true; return; }
        return navigator.storage.persist().then(function (ok) {
          window.__veraArmazenamentoPersistente = !!ok;
          console.info('VERA armazenamento persistente:', ok ? 'concedido' : 'negado');
          if (!ok) avisarArmazenamentoFragil();
        });
      }).catch(function () {});
    } catch (e) {}
  }

  // No iOS a API nem existe, e é justamente lá que o despejo mais acontece.
  // Sem aviso o técnico nunca saberia que o que ele coletou está numa única
  // cópia que o sistema pode recolher.
  function avisarArmazenamentoFragil() {
    if (window.__veraAvisouArmazenamento) return;
    window.__veraAvisouArmazenamento = true;
    // Espera o técnico passar do login: o aviso aparecendo na tela de senha
    // não é lido por ninguém.
    var esperas = 0;
    var t = setInterval(function () {
      esperas++;
      var login = document.getElementById('login-screen');
      var dentro = login && (login.style.display === 'none' || !login.offsetParent);
      if (dentro || esperas > 120) {
        clearInterval(t);
        setTimeout(function () {
          toast('Este aparelho não garante o armazenamento do app. Sincronize '
              + 'sempre que pegar sinal — não acumule pontos sem enviar.', 'warning');
        }, 4000);
      }
    }, 1000);
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

  // ── dbPut: colisão de id e gravação que nunca resolve ────────────────
  // (a) base.html:2446 cunha o id do ponto como 'V' + (total local + 1), e o
  //     store usa keyPath 'id' com put(), que é upsert. Se o total encolher,
  //     o próximo ponto reusa um id existente e SOBRESCREVE a coleta antiga
  //     sem erro nenhum. Já queimou em produção: dados/Equipe-Energisa/V0001
  //     carregou quatro coletas diferentes ao longo do tempo.
  //     protege-ids-remotos.js estancou isso no lado do GitHub; no IndexedDB
  //     do aparelho continuava aberto.
  // (b) dbPut (base.html:1532) tem tx.onerror e não tem tx.onabort. Uma
  //     transação abortada sem erro que borbulhe deixa a promise pendente
  //     para sempre — e try/catch não pega promise pendente, a tela só congela.
  var LIMITE_MS = 20000;
  function idNovo() {
    var d = new Date(), p = function (n, c) { return String(n).padStart(c || 2, '0'); };
    return 'V' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
      + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
      + p(d.getMilliseconds(), 3) + p(Math.floor(Math.random() * 1000000), 6);
  }
  // Duas coletas diferentes, ou a mesma sendo atualizada? O carimbo de coleta
  // mais a coordenada identificam a coleta; o resto do registro muda a cada
  // sincronização (synced, syncedAt, fotos_*) e não serve de critério.
  function mesmaColeta(a, b) {
    return String(a.data || '') === String(b.data || '')
      && String(a.lat || '') === String(b.lat || '')
      && String(a.lon || '') === String(b.lon || '');
  }
  function blindarDbPut() {
    if (typeof window.dbPut !== 'function' || window.__veraDbPutBlindado) return;
    window.__veraDbPutBlindado = true;
    var original = window.dbPut;
    window.dbPut = async function (store, data) {
      if (store === 'points' && data && data.id && typeof window.dbGet === 'function') {
        try {
          var existente = await window.dbGet('points', data.id);
          var colide = !!(existente && existente.id && !mesmaColeta(existente, data));
          existente = null;          // registro pode ter centenas de KB de foto
          if (colide) {
            var antigo = data.id;
            data.id = idNovo();   // muta o objeto do chamador: as gravações
                                  // seguintes dele já usam o id novo
            console.warn('VERA: id ' + antigo + ' ja estava em uso por outra '
              + 'coleta; este ponto passou a ser ' + data.id);
            // O toast é um elemento único: savePoint mostra "Ponto <id> salvo!"
            // logo depois do put (base.html:2472) e apagaria este aviso. Pior,
            // aquele texto traz o id ANTIGO, porque savePoint capturou `const
            // id` em 2446, antes desta renomeação. Então este aviso vem depois,
            // e corrige o número que o técnico acabou de ler.
            (function (novo) {
              setTimeout(function () {
                toast('O número ' + antigo + ' já era de outra coleta. Este ponto '
                    + 'foi salvo como ' + novo + ' — a coleta anterior foi preservada.',
                    'warning');
              }, 1600);
            })(data.id);
          }
        } catch (e) {
          // dbGet resolve `undefined` quando não acha (base.html:1548); só
          // rejeita em erro de transação. Seguimos gravando — falhar aqui
          // custaria a coleta —, mas não em silêncio.
          console.warn('VERA: nao deu para conferir colisao de id em ' + data.id, e);
        }
      }
      var estourou = false, marcador = null;
      var relogio = new Promise(function (_, rej) {
        marcador = setTimeout(function () { estourou = true; rej(new Error('VERA_DBPUT_TIMEOUT')); }, LIMITE_MS);
      });
      try {
        return await Promise.race([original.call(this, store, data), relogio]);
      } catch (e) {
        if (estourou) {
          console.error('VERA: dbPut nao confirmou em ' + (LIMITE_MS / 1000) + 's', store, data && data.id);
          // O timeout desiste de esperar, mas NÃO aborta a transação: ela pode
          // ter entrado depois. Dizer "não salvou" sem conferir faria o técnico
          // registrar de novo e duplicar. Então confere antes de falar.
          if (store === 'points' && data && data.id) confirmarDepois(data.id);
        }
        throw e;
      } finally {
        if (marcador) clearTimeout(marcador);
      }
    };
  }

  // Instalador próprio: a guarda de gravação só precisa de dbPut e dbGet.
  // Amarrá-la às pré-condições das outras guardas faria com que um refactor
  // em savePoint derrubasse a proteção contra sobrescrita de ponto, que é a
  // mais importante do arquivo.
  var relogioDbPut = setInterval(function () {
    if (typeof window.dbPut === 'function' && typeof window.dbGet === 'function') {
      blindarDbPut();
      clearInterval(relogioDbPut);
    }
  }, 200);
  setTimeout(function () {
    clearInterval(relogioDbPut);
    if (!window.__veraDbPutBlindado) {
      console.error('VERA: guarda de gravacao NAO instalada');
      toast('A proteção de gravação não carregou. Recarregue o app antes de coletar.', 'error');
    }
  }, 60000);

  // Depois de um timeout, volta a olhar o banco por alguns segundos: se o
  // registro entrou, desmente o alarme em vez de deixar o técnico achando que
  // perdeu o ponto.
  function confirmarDepois(id) {
    var tentativas = 0;
    var t = setInterval(async function () {
      tentativas++;
      try {
        var r = await window.dbGet('points', id);
        if (r && r.id) {
          clearInterval(t);
          toast('O ponto ' + id + ' entrou, sim — a gravação só demorou. '
              + 'NÃO registre de novo.', 'success');
          return;
        }
      } catch (e) {}
      if (tentativas >= 10) {
        clearInterval(t);
        toast('O ponto NÃO entrou no aparelho. Registre de novo.', 'error');
      }
    }, 1500);
  }

  var instalado = false;
  function instalar() {
    if (instalado) return true;
    if (typeof window.savePoint !== 'function'
        || typeof window.dbGetAll !== 'function'
        || typeof window.dbPut !== 'function'
        || typeof window.dbDelete !== 'function') return false;

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
        var texto = ((e && e.name) || '') + ' ' + ((e && e.message) || '');
        // A mensagem não afirma perda: a exceção pode vir de DEPOIS da
        // gravação (render, badge, troca de aba). Em vez de adivinhar, manda
        // o técnico conferir na aba Registros antes de registrar de novo —
        // dizer "não foi salvo" quando foi seria convite a duplicar o ponto.
        if (/quota|QuotaExceeded/i.test(texto)) {
          toast('SEM ESPAÇO no aparelho: o ponto NÃO foi salvo. Sincronize os '
              + 'pendentes para liberar espaço e tente de novo.', 'error');
        } else if (/VERA_DBPUT_TIMEOUT/.test(texto)) {
          toast('A gravação não confirmou. NÃO registre de novo ainda: confira '
              + 'na aba Registros se o ponto entrou.', 'error');
        } else {
          toast('Erro ao salvar (' + ((e && e.name) || 'erro') + '). Confira na '
              + 'aba Registros se o ponto entrou antes de registrar de novo.', 'error');
        }
        // Não repassa a rejeição: nenhum chamador a trata, e repassar só
        // produziria unhandled rejection no console.
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
        // O app NÃO consulta o GitHub aqui: fotos_github é lembrança de uma
        // resposta antiga, não inventário do servidor. Por isso a mensagem não
        // afirma que as fotos estão lá — diz só o que o aparelho sabe.
        if (!seguros.length) {
          toast('Nada a reenviar: os ' + pulados + ' ponto(s) enviados já não têm '
              + 'as fotos neste aparelho. Reenviar apagaria a ligação com elas.', '');
          return;
        }
        var msg = 'Reenviar ' + seguros.length + ' ponto(s)?'
          + (pulados ? '\n\n' + pulados + ' ponto(s) ficam de fora: as fotos deles não'
              + ' existem mais neste aparelho, e reenviar apagaria a ligação com'
              + ' elas no servidor.\n\nOs dados desses pontos (espécie, poste, DAP,'
              + ' alturas) também NÃO são reenviados. Se precisar restaurá-los no'
              + ' servidor, fale com a supervisão.' : '');
        if (!(await confirmar(msg, 'Reenviar'))) return;
        var falhas = 0;
        for (var i = 0; i < seguros.length; i++) {
          var p = seguros[i];
          p.synced = false;
          p.syncedAt = null;
          // fotos_ids e fotos_github não são zerados aqui. ATENÇÃO ao alcance
          // disso: syncPendingPoints RECALCULA os dois do zero a cada envio
          // (base.html:1874 no JSON que sobe, 1886 no registro local), então
          // não zerar só protege quando o PUT do JSON falha inteiro e o
          // registro não chega a ser tocado. Não é garantia contra foto que
          // falha no meio de um reenvio bem-sucedido — para isso o que vale é
          // o skip dos enxugados, logo acima.
          // Sem try/catch aqui, uma gravação que falhasse abortava o laço
          // inteiro: parte dos pontos marcada, parte não, e nenhum aviso.
          try { await window.dbPut('points', p); } catch (e) { falhas++; }
        }
        if (typeof updatePendingBadge === 'function') updatePendingBadge();
        toast('Reenviando ' + (seguros.length - falhas) + ' ponto(s)'
              + (pulados ? ' (' + pulados + ' preservados)' : '')
              + (falhas ? ' — ' + falhas + ' não puderam ser marcados' : '') + '...',
              falhas ? 'warning' : '');
        if (typeof window.syncPendingPoints === 'function') await window.syncPendingPoints();
      };
    }

    // ── 4. limpar enviados não pode apagar foto não confirmada ─────────
    // synced=true não significa "todas as fotos subiram": o base.html marca
    // assim quando o JSON sobe, mesmo com foto faltando. O pos-sync tem trava
    // para isso, mas clearSyncedRecords a ignorava e apagava o registro inteiro.
    if (typeof window.clearSyncedRecords === 'function') {
      window.clearSyncedRecords = async function () {
        var todos = await window.dbGetAll('points');
        var enviados = todos.filter(function (r) { return r.synced; });
        var podem = enviados.filter(fotosConfirmadas);
        var retidos = enviados.length - podem.length;
        if (!enviados.length) { toast('Nenhum ponto enviado para remover.'); return; }
        if (!podem.length) {
          toast('Nada a remover: os ' + retidos + ' ponto(s) enviado(s) têm foto que '
              + 'ainda não chegou ao servidor.', '');
          return;
        }
        var msg = 'Remover ' + podem.length + ' ponto(s) já enviado(s)?'
          + (retidos ? '\n\n' + retidos + (retidos > 1 ? ' ficam retidos' : ' fica retido')
              + ': tem foto que ainda não chegou ao servidor. Apagar perderia'
              + ' essa foto para sempre.' : '');
        if (!(await confirmar(msg, 'Remover'))) return;
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
      window.clearAllRecords = async function () {
        var todos = await window.dbGetAll('points');
        var pendentes = todos.filter(function (r) { return !r.synced; }).length;
        var comFotoPresa = todos.filter(function (r) {
          return r.synced && !fotosConfirmadas(r);
        }).length;
        // Um diálogo só. Delegar ao original somaria o confirm() dele ao
        // aviso daqui, e dois diálogos seguidos treinam o dedo a bater OK.
        var aviso = (pendentes || comFotoPresa)
          ? 'ATENÇÃO — isto apaga dado que NÃO está no servidor:\n\n'
            + (pendentes ? '• ' + pendentes + ' ponto(s) nunca enviado(s)\n' : '')
            + (comFotoPresa ? '• ' + comFotoPresa + ' ponto(s) com foto que não subiu\n' : '')
            + '\nEsse material não existe em nenhum outro lugar. Sincronize antes.'
          : 'Apagar todos os ' + todos.length + ' registro(s) deste aparelho?';
        if (!(await confirmar(aviso, 'Apagar tudo'))) return;
        for (var i = 0; i < todos.length; i++) await window.dbDelete('points', todos[i].id);
        if (typeof renderRecords === 'function') renderRecords();
        if (typeof renderMapPoints === 'function') renderMapPoints();
        if (typeof updatePendingBadge === 'function') updatePendingBadge();
        toast('Todos os registros removidos.', 'warning');
      };
    }

    instalado = true;
    return true;
  }

  pedirPersistencia();
  var tentativa = setInterval(function () { if (instalar()) clearInterval(tentativa); }, 500);
  setTimeout(function () {
    clearInterval(tentativa);
    // Desistir calado deixaria o app exatamente como antes da correção sem
    // ninguém saber. Se não instalou em 60 s, avisa.
    if (!instalado) {
      console.error('VERA: guardas de sincronizacao NAO instaladas');
      toast('As proteções de gravação não carregaram. Recarregue o app antes '
          + 'de coletar.', 'error');
    }
  }, 60000);
})();
