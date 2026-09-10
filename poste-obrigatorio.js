(function () {
  'use strict';

  // Poste de Referência obrigatório para a equipe de campo.
  //
  // Em Rio dos Bois e Dois Irmãos, 76 de 78 pontos vieram sem número de poste:
  // todo o resto do formulário preenchido, só o toque em "Buscar poste mais
  // próximo" pulado. O número do poste é o que amarra o ponto à base da
  // Energisa no relatório — sem ele o registro perde metade do valor.
  //
  // O Admin continua sem a trava: ele não coleta em campo, e travar o painel
  // de administração por causa de um campo de coleta não faria sentido.

  var ID_BOX = 'poste-selecionado-box';

  function ehAdmin() {
    return (typeof currentUser !== 'undefined' && currentUser === 'Admin');
  }

  // A verdade sobre "tem poste escolhido" está no DOM, não numa variável: o
  // `posteSelecionado` do app é um `let` de topo de script, que não vai para o
  // window e por isso um patch externo não consegue ler. A classe "ativo" é
  // posta por selecionarPoste() e tirada por clearForm(), e só por elas.
  function temPoste() {
    var box = document.getElementById(ID_BOX);
    return !!(box && box.classList.contains('ativo'));
  }

  function haPostesParaEscolher() {
    try {
      return typeof postesCarregados !== 'undefined'
        && postesCarregados && Object.keys(postesCarregados).length > 0;
    } catch (e) { return false; }
  }

  function marcarFalta() {
    var box = document.getElementById(ID_BOX);
    if (!box) return;
    box.classList.add('vera-poste-faltando');
    if (box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function limparFalta() {
    var box = document.getElementById(ID_BOX);
    if (box) box.classList.remove('vera-poste-faltando');
  }

  var CSS = [
    '.vera-poste-faltando{',
    '  border:2px solid #c62828!important;',
    '  box-shadow:0 0 0 3px rgba(198,40,40,.15)!important;',
    '  animation:veraPosteTreme .35s ease-in-out 2;',
    '}',
    '@keyframes veraPosteTreme{',
    '  0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}',
    '}',
    '.vera-poste-obrig{color:#c62828;font-weight:700;}'
  ].join('\n');

  function injetarEstilos() {
    if (document.getElementById('vera-poste-obrigatorio-css')) return;
    var st = document.createElement('style');
    st.id = 'vera-poste-obrigatorio-css';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  // O rótulo "Poste de Referência" é o único do formulário que pedia um dado
  // obrigatório sem o asterisco que "Espécie *" já usava.
  function marcarRotulo() {
    var box = document.getElementById(ID_BOX);
    var sel = box && box.parentNode;                 // .poste-selector
    var rotulo = sel && sel.previousElementSibling;  // <label class="field-label">
    if (!rotulo || rotulo.querySelector('.vera-poste-obrig')) return;
    if (!/Poste/i.test(rotulo.textContent || '')) return;
    var ast = document.createElement('span');
    ast.className = 'vera-poste-obrig';
    ast.textContent = ' *';
    rotulo.appendChild(ast);
  }

  var instalado = false;
  function instalar() {
    if (instalado) return true;
    if (typeof window.savePoint !== 'function') return false;

    var originalSave = window.savePoint;
    window.savePoint = function () {
      if (!ehAdmin() && !temPoste()) {
        marcarFalta();
        if (typeof showToast === 'function') {
          showToast(haPostesParaEscolher()
            ? 'Selecione o poste de referência antes de registrar. Toque em "Buscar poste mais próximo".'
            : 'Nenhum poste carregado para esta rota. Sem o poste não dá para registrar — avise a supervisão.',
            'error');
        }
        return;
      }
      limparFalta();
      return originalSave.apply(this, arguments);
    };

    // Escolheu o poste: some a marcação vermelha na hora, sem esperar o salvar.
    if (typeof window.selecionarPoste === 'function') {
      var originalSel = window.selecionarPoste;
      window.selecionarPoste = function () {
        var r = originalSel.apply(this, arguments);
        limparFalta();
        return r;
      };
    }

    injetarEstilos();
    marcarRotulo();
    instalado = true;
    return true;
  }

  var tentativa = setInterval(function () { if (instalar()) clearInterval(tentativa); }, 500);
  setTimeout(function () { clearInterval(tentativa); }, 60000);

  // O formulário só existe depois que a aba "Novo Ponto" é montada; o rótulo
  // é remarcado ao entrar nela (marcarRotulo é idempotente).
  var hookTab = setInterval(function () {
    if (typeof window.switchTab !== 'function' || window.__veraPosteTabHook) return;
    window.__veraPosteTabHook = true;
    clearInterval(hookTab);
    var orig = window.switchTab;
    window.switchTab = function (nome) {
      var r = orig.apply(this, arguments);
      if (nome === 'form') { injetarEstilos(); setTimeout(marcarRotulo, 60); }
      return r;
    };
  }, 500);
  setTimeout(function () { clearInterval(hookTab); }, 60000);
})();
