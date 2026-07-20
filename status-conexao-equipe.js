(function () {
  'use strict';

  // Ajustes pedidos pelo supervisor (13/07):
  // 1) O aviso do topo volta a mostrar a conexao (Online/Offline) e, quando
  //    houver, a quantidade de pontos pendentes deste aparelho. As mensagens
  //    de sincronizacao aparecem na hora e o status normal retorna sozinho.
  // 2) "Trocar equipe" com confirmacao propria do app: o window.confirm()
  //    nao abre em alguns iPhones com o app instalado (PWA standalone) e o
  //    toque morria sem resposta. Agora a confirmacao e um modal do app.

  if (window.__veraStatusConexaoEquipe) return;
  window.__veraStatusConexaoEquipe = true;

  var FRASE_SEM_PENDENTES = 'Nenhum ponto pendente neste aparelho.';
  var textoDoStatus = '';
  var timerReversao = null;

  var contagemEmVoo = null;

  function contarPendentes() {
    if (typeof window.dbGetAll !== 'function') return Promise.resolve(0);
    // Reaproveita a leitura em andamento: o banco inteiro de pontos (com as
    // fotos base64 dos pendentes) era relido a cada chamada simultanea.
    if (contagemEmVoo) return contagemEmVoo;
    contagemEmVoo = window.dbGetAll('points').then(function (todos) {
      contagemEmVoo = null;
      return (Array.isArray(todos) ? todos : []).filter(function (p) { return !p.synced; }).length;
    }).catch(function () { contagemEmVoo = null; return 0; });
    return contagemEmVoo;
  }

  function textoConexao() {
    return contarPendentes().then(function (pendentes) {
      if (navigator.onLine) {
        return pendentes > 0
          ? 'Online — ' + pendentes + ' ponto(s) pendente(s) neste aparelho'
          : 'Online';
      }
      return pendentes > 0
        ? 'Offline — ' + pendentes + ' ponto(s) guardado(s) neste aparelho'
        : 'Offline — dados salvos no celular';
    });
  }

  function mostrarStatusConexao() {
    var campo = document.getElementById('status-text');
    if (!campo) return;
    textoConexao().then(function (texto) {
      textoDoStatus = texto;
      if (campo.textContent !== texto) campo.textContent = texto;
    });
  }

  function agendarReversao(ms) {
    if (timerReversao) clearTimeout(timerReversao);
    timerReversao = setTimeout(mostrarStatusConexao, ms);
  }

  function vigiarStatus() {
    var campo = document.getElementById('status-text');
    if (!campo) return false;
    if (campo.__veraVigiado) return true;
    campo.__veraVigiado = true;

    new MutationObserver(function () {
      var atual = campo.textContent || '';
      if (atual === textoDoStatus) return; // fomos nos que escrevemos
      if (atual === FRASE_SEM_PENDENTES) { mostrarStatusConexao(); return; }
      // Mensagem transitoria de sincronizacao: mostra e devolve o status.
      agendarReversao(6000);
    }).observe(campo, { childList: true, characterData: true, subtree: true });

    mostrarStatusConexao();
    return true;
  }

  // ——— Trocar equipe sem depender do window.confirm ———

  function fecharModalTroca() {
    var fundo = document.getElementById('vera-modal-trocar-equipe');
    if (fundo) fundo.remove();
  }

  function abrirModalTroca(pendentes) {
    fecharModalTroca();
    var aviso = pendentes > 0
      ? '<div style="margin:10px 0 16px;padding:10px 12px;border-radius:10px;background:#fdecea;color:#8f261d;font-size:13px;line-height:1.5;"><b>ATENÇÃO:</b> ' + pendentes + ' ponto(s) deste aparelho ainda não foram enviados. Sincronize antes de trocar para os dados não se misturarem com a próxima equipe.</div>'
      : '<div style="margin:10px 0 16px;color:#5a7a55;font-size:13px;line-height:1.5;">Você voltará para a tela de login para entrar com outra equipe.</div>';

    var fundo = document.createElement('div');
    fundo.id = 'vera-modal-trocar-equipe';
    fundo.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(10,20,14,.55);display:flex;align-items:center;justify-content:center;padding:22px;';
    fundo.innerHTML = '<div style="width:min(100%,340px);background:#fff;border-radius:16px;padding:22px 20px;box-shadow:0 18px 48px rgba(0,0,0,.35);font-family:inherit;color:#1a2e1a;">'
      + '<div style="font-size:17px;font-weight:800;">Trocar de equipe?</div>'
      + aviso
      + '<div style="display:flex;gap:10px;">'
      + '<button type="button" id="vera-troca-cancelar" style="flex:1;padding:12px;border:1.5px solid #c9dfce;border-radius:10px;background:#fff;color:#1a2e1a;font:700 13px inherit;cursor:pointer;">Continuar aqui</button>'
      + '<button type="button" id="vera-troca-confirmar" style="flex:1;padding:12px;border:0;border-radius:10px;background:#1a2e1a;color:#fff;font:700 13px inherit;cursor:pointer;">Trocar equipe</button>'
      + '</div></div>';

    document.body.appendChild(fundo);
    fundo.addEventListener('click', function (ev) { if (ev.target === fundo) fecharModalTroca(); });
    document.getElementById('vera-troca-cancelar').addEventListener('click', fecharModalTroca);
    document.getElementById('vera-troca-confirmar').addEventListener('click', function () {
      fecharModalTroca();
      if (typeof window.doLogout === 'function') window.doLogout();
    });
  }

  function substituirTrocarEquipe() {
    if (window.__veraTrocarEquipeOriginal) return true;
    if (typeof window.trocarEquipe !== 'function') return false;
    window.__veraTrocarEquipeOriginal = window.trocarEquipe;
    window.trocarEquipe = function () {
      contarPendentes().then(abrirModalTroca);
    };
    return true;
  }

  function injetarEstilos() {
    if (document.getElementById('vera-status-equipe-estilos')) return;
    var st = document.createElement('style');
    st.id = 'vera-status-equipe-estilos';
    // Garante o botao "Trocar equipe" sempre visivel em telas estreitas.
    st.textContent = '.header-right{flex-wrap:wrap;justify-content:flex-end;row-gap:6px;}';
    (document.head || document.documentElement).appendChild(st);
  }

  addEventListener('online', function () { setTimeout(mostrarStatusConexao, 1200); });
  addEventListener('offline', function () { setTimeout(mostrarStatusConexao, 150); });

  var tentativa = setInterval(function () {
    injetarEstilos();
    var a = vigiarStatus();
    var b = substituirTrocarEquipe();
    if (a && b) clearInterval(tentativa);
  }, 500);
  setTimeout(function () { clearInterval(tentativa); }, 30000);
})();
