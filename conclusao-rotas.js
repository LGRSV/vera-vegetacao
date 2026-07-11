(function () {
  'use strict';

  // Conclusão de rota de campo pela equipe técnica + status no painel admin.
  // Estados possíveis por projeto (rota):
  //   nao_iniciado  → a equipe ainda não entrou nesta rota
  //   em_andamento  → a equipe tem esta rota como projeto ativo (estado-equipes.js)
  //   concluido     → o técnico marcou a rota como concluída (registrado aqui)
  // "concluido" é a única informação gravada por este módulo; os demais estados
  // são derivados do projeto ativo mantido por estado-equipes.js.

  const ARQUIVO_ESTADO = 'estado-equipes.json';

  function base64Utf8(texto) {
    return btoa(unescape(encodeURIComponent(texto)));
  }

  function textoBase64Utf8(base64) {
    const binario = atob(String(base64 || '').replace(/\s/g, ''));
    let escapado = '';
    for (let i = 0; i < binario.length; i++) {
      escapado += '%' + ('00' + binario.charCodeAt(i).toString(16)).slice(-2);
    }
    return decodeURIComponent(escapado);
  }

  function normalizarEstado(valor) {
    const estado = valor && typeof valor === 'object' ? valor : {};
    if (!estado.equipes || typeof estado.equipes !== 'object') estado.equipes = {};
    if (!estado.statusRotas || typeof estado.statusRotas !== 'object') estado.statusRotas = {};
    return estado;
  }

  // Reutiliza a mesma credencial/repo já resolvida por estado-equipes.js — evita
  // duplicar a lógica (e o token de servidor) num segundo arquivo.
  async function obterCredenciais() {
    if (window.VERA_ESTADO_EQUIPE && typeof window.VERA_ESTADO_EQUIPE.obterCredenciais === 'function') {
      try { return await window.VERA_ESTADO_EQUIPE.obterCredenciais(); } catch (e) {}
    }
    let cfg = null;
    try {
      if (typeof carregarConfigGlobal === 'function') cfg = await carregarConfigGlobal();
    } catch (erro) {}

    let repo = (cfg && cfg.repo) || '';
    let token = (cfg && cfg.token) || '';
    try {
      if (!repo && typeof getConfig === 'function') repo = await getConfig('github_repo');
      if (!token && typeof getConfig === 'function') token = await getConfig('github_token');
    } catch (erro) {}
    if (!repo) repo = (typeof GH_REPO !== 'undefined' && GH_REPO) ? GH_REPO : 'LGRSV/vera-vegetacao';
    return { repo, token };
  }

  function urlConteudo(repo) {
    return 'https://api.github.com/repos/' + repo + '/contents/' + ARQUIVO_ESTADO;
  }

  async function lerEstadoPublico() {
    const credenciais = await obterCredenciais();
    const url = 'https://raw.githubusercontent.com/' + credenciais.repo + '/main/' + ARQUIVO_ESTADO + '?t=' + Date.now();
    try {
      const resposta = await fetch(url, { cache: 'no-store' });
      if (resposta.status === 404) return normalizarEstado({});
      if (!resposta.ok) throw new Error('Estado das equipes indisponível (' + resposta.status + ').');
      return normalizarEstado(await resposta.json());
    } catch (erro) {
      console.warn('VERA conclusão de rotas (leitura):', erro);
      return normalizarEstado({});
    }
  }

  async function lerEstadoParaGravar(repo, token) {
    const resposta = await fetch(urlConteudo(repo), {
      headers: token ? { 'Authorization': 'token ' + token } : {}
    });

    if (resposta.status === 404) return { estado: normalizarEstado({}), sha: null };
    if (!resposta.ok) throw new Error('Não foi possível consultar o estado das rotas (' + resposta.status + ').');

    const arquivo = await resposta.json();
    let estado = {};
    try {
      estado = JSON.parse(textoBase64Utf8(arquivo.content));
    } catch (erro) {
      throw new Error('O arquivo de estado das equipes está inválido.');
    }
    return { estado: normalizarEstado(estado), sha: arquivo.sha };
  }

  // Aplica `mutacao(statusRotas)` sobre o estado, preservando as demais chaves
  // (inclusive `equipes`, gravado por estado-equipes.js), com retentativa em 409.
  async function atualizarStatusRotas(mensagem, mutacao) {
    const credenciais = await obterCredenciais();
    if (!credenciais.token) {
      if (typeof showToast === 'function') {
        showToast('Não foi possível registrar o status: token do servidor indisponível.', 'error');
      }
      return false;
    }

    for (let tentativa = 0; tentativa < 4; tentativa++) {
      try {
        if (tentativa > 0) {
          await new Promise(function(res) { setTimeout(res, 600 * tentativa); });
        }
        const leitura = await lerEstadoParaGravar(credenciais.repo, credenciais.token);
        const estado = leitura.estado;

        mutacao(estado.statusRotas);
        estado.updatedAt = new Date().toISOString();

        const corpo = {
          message: mensagem,
          content: base64Utf8(JSON.stringify(estado, null, 2))
        };
        if (leitura.sha) corpo.sha = leitura.sha;

        const resposta = await fetch(urlConteudo(credenciais.repo), {
          method: 'PUT',
          headers: {
            'Authorization': 'token ' + credenciais.token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(corpo)
        });

        if (resposta.ok) return true;
        if (resposta.status === 409) continue; // conflito de SHA — relê e tenta de novo

        const detalhe = await resposta.json().catch(function () { return {}; });
        throw new Error(detalhe.message || 'Erro ao gravar o status da rota (' + resposta.status + ').');
      } catch (erro) {
        console.warn('VERA conclusão de rotas (tentativa ' + (tentativa + 1) + '):', erro);
        if (tentativa === 3 && typeof showToast === 'function') {
          showToast('Não foi possível salvar o status da rota. Verifique a conexão e tente novamente.', 'error');
        }
      }
    }
    return false;
  }

  const rotasConcluidasLocais = {}; // cache leve por rotaId para refletir a UI sem reler

  async function concluirRotaAtual() {
    if (typeof rotaAtribuida === 'undefined' || !rotaAtribuida) {
      if (typeof showToast === 'function') showToast('Nenhuma rota ativa para concluir.', 'warning');
      return;
    }
    const rota = rotaAtribuida;
    const nome = (rota.nomeProjeto || 'esta rota');
    if (!window.confirm('Concluir a rota de campo "' + nome + '"?\nO supervisor verá esta rota como concluída no painel.')) {
      return;
    }

    const botao = document.getElementById('btn-concluir-rota');
    if (botao) { botao.disabled = true; botao.textContent = '⏳ Registrando conclusão...'; }

    const ok = await atualizarStatusRotas(
      'VERA: concluir rota ' + (rota.nomeProjeto || rota.id) + ' (' + (typeof currentUser !== 'undefined' ? currentUser : '') + ')',
      function (statusRotas) {
        statusRotas[String(rota.id)] = {
          status: 'concluido',
          equipe: typeof currentUser !== 'undefined' ? currentUser : '',
          nomeProjeto: rota.nomeProjeto || '',
          concluidoEm: new Date().toISOString(),
          concluidoPor: typeof currentUser !== 'undefined' ? currentUser : ''
        };
      }
    );

    if (ok) {
      rotasConcluidasLocais[String(rota.id)] = true;
      if (typeof showToast === 'function') showToast('Rota concluída! O supervisor foi notificado no painel.', 'success');
    }
    atualizarBotaoTecnico();
  }

  // Conclusão feita pelo supervisor, direto no painel admin.
  async function concluirRotaPeloAdmin(rota) {
    return atualizarStatusRotas(
      'VERA: concluir rota ' + (rota.nomeProjeto || rota.id) + ' (Admin)',
      function (statusRotas) {
        statusRotas[String(rota.id)] = {
          status: 'concluido',
          equipe: rota.equipe || '',
          nomeProjeto: rota.nomeProjeto || '',
          concluidoEm: new Date().toISOString(),
          concluidoPor: 'Admin'
        };
      }
    );
  }

  // Ao (re)entrar numa rota, ela deixa de estar concluída — volta a "em andamento".
  async function reabrirRota(rotaId) {
    if (!rotaId) return;
    delete rotasConcluidasLocais[String(rotaId)];
    await atualizarStatusRotas(
      'VERA: reabrir rota ' + rotaId,
      function (statusRotas) { delete statusRotas[String(rotaId)]; }
    );
  }

  // ── UI do técnico (config-panel) ──────────────────────────────────────────

  function ehAdmin() {
    return typeof currentUser !== 'undefined' && typeof ADMIN_USER !== 'undefined' && currentUser === ADMIN_USER;
  }

  function garantirSecaoTecnico() {
    let secao = document.getElementById('secao-concluir-rota');
    if (secao) return secao;
    const painel = document.getElementById('config-panel');
    if (!painel) return null;

    secao = document.createElement('div');
    secao.className = 'config-section';
    secao.id = 'secao-concluir-rota';
    secao.style.display = 'none';
    secao.innerHTML =
      '<div class="config-title">Rota de campo</div>' +
      '<p id="concluir-rota-descricao" style="font-size:12px;color:var(--text-muted);line-height:1.45;margin-bottom:10px;">' +
      'Ao terminar todos os registros desta rota, marque-a como concluída para o supervisor.</p>' +
      '<button id="btn-concluir-rota" class="btn-sync-now" style="background:var(--green-mid,#2d5a27);">Concluir rota de campo</button>';
    painel.insertBefore(secao, painel.firstChild ? painel.firstChild.nextSibling : null);

    const botao = secao.querySelector('#btn-concluir-rota');
    if (botao) botao.addEventListener('click', concluirRotaAtual);
    return secao;
  }

  async function atualizarBotaoTecnico() {
    const secao = garantirSecaoTecnico();
    if (!secao) return;

    const temRota = typeof rotaAtribuida !== 'undefined' && !!rotaAtribuida;
    if (ehAdmin() || !temRota) {
      secao.style.display = 'none';
      return;
    }
    secao.style.display = 'block';

    const rotaId = String(rotaAtribuida.id);
    const botao = document.getElementById('btn-concluir-rota');
    const descricao = document.getElementById('concluir-rota-descricao');

    let concluida = !!rotasConcluidasLocais[rotaId];
    if (!concluida) {
      try {
        const estado = await lerEstadoPublico();
        const meta = estado.statusRotas[rotaId];
        concluida = !!(meta && meta.status === 'concluido');
        if (concluida) rotasConcluidasLocais[rotaId] = true;
      } catch (e) {}
    }

    if (!botao) return;
    if (concluida) {
      botao.disabled = true;
      botao.textContent = '✓ Rota concluída';
      botao.style.background = 'var(--muted,#5a7a55)';
      if (descricao) descricao.textContent = 'Esta rota foi marcada como concluída. Reentrar na rota volta o status para "em andamento".';
    } else {
      botao.disabled = false;
      botao.textContent = 'Concluir rota de campo';
      botao.style.background = 'var(--green-mid,#2d5a27)';
      if (descricao) descricao.textContent = 'Ao terminar todos os registros desta rota, marque-a como concluída para o supervisor.';
    }
  }

  // ── Status no painel admin ────────────────────────────────────────────────

  const ROTULOS = {
    concluido:    { texto: 'Concluído',    classe: 'concluido' },
    em_andamento: { texto: 'Em andamento', classe: 'andamento' },
    nao_iniciado: { texto: 'Não iniciado', classe: 'nao-iniciado' }
  };

  function statusDaRota(estado, rota) {
    const meta = estado.statusRotas[String(rota.id)];
    if (meta && meta.status === 'concluido') return 'concluido';
    const equipe = estado.equipes[rota.equipe];
    const ativo = equipe && equipe.projetoAtivo;
    if (ativo && String(ativo.rotaId) === String(rota.id)) return 'em_andamento';
    return 'nao_iniciado';
  }

  // O painel admin lista os cards em `#rotas-lista` a partir de
  // [...rotasData.rotas].reverse(); mapeamos o card i para essa mesma ordem.
  async function aplicarStatusNoAdmin() {
    const lista = document.getElementById('rotas-lista');
    if (!lista) return;
    const cards = lista.querySelectorAll('.rota-card');
    if (!cards.length) return;

    const rotas = (typeof rotasData !== 'undefined' && rotasData && Array.isArray(rotasData.rotas))
      ? rotasData.rotas.slice().reverse() : [];
    if (!rotas.length) return;

    let estado;
    try {
      estado = await lerEstadoPublico();
    } catch (e) {
      estado = normalizarEstado({});
    }

    cards.forEach(function (card, i) {
      const rota = rotas[i];
      if (!rota) return;
      const alvo = card.querySelector('.rota-equipe') || card;
      let badge = alvo.querySelector('.rota-status-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'rota-status-badge';
        alvo.appendChild(badge);
      }
      const chave = statusDaRota(estado, rota);
      const rotulo = ROTULOS[chave] || ROTULOS.nao_iniciado;
      badge.textContent = rotulo.texto;
      badge.className = 'rota-status-badge ' + rotulo.classe;

      // Admin também pode concluir (ou reabrir) a rota direto do card.
      let acao = alvo.querySelector('.rota-status-acao');
      if (!acao) {
        acao = document.createElement('button');
        acao.type = 'button';
        acao.className = 'rota-status-acao';
        alvo.appendChild(acao);
      }
      const concluida = chave === 'concluido';
      acao.textContent = concluida ? 'Reabrir' : '✓ Concluir';
      acao.title = concluida ? 'Voltar esta rota para andamento' : 'Marcar esta rota como concluída';
      acao.onclick = async function (ev) {
        ev.stopPropagation(); ev.preventDefault();
        const nome = rota.nomeProjeto || ('rota ' + rota.id);
        const pergunta = concluida
          ? 'Reabrir "' + nome + '"? Ela volta a aparecer como pendente/em andamento.'
          : 'Marcar "' + nome + '" como concluída?';
        if (!window.confirm(pergunta)) return;
        acao.disabled = true; acao.textContent = '⏳';
        try {
          if (concluida) { await reabrirRota(rota.id); }
          else { await concluirRotaPeloAdmin(rota); }
        } catch (e) { console.warn('VERA conclusão admin:', e); }
        acao.disabled = false;
        try { await aplicarStatusNoAdmin(); } catch (e) {}
      };
    });
  }

  // Estilos injetados em runtime (o app real é montado via document.write, então
  // os patches de CSS do loader não o alcançam — injetamos direto no <head>).
  function injetarEstilos() {
    if (document.getElementById('vera-conclusao-estilos')) return;
    const st = document.createElement('style');
    st.id = 'vera-conclusao-estilos';
    st.textContent =
      '.rota-status-badge{display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;' +
      'font-size:10px;font-weight:800;letter-spacing:.02em;vertical-align:middle;white-space:nowrap;}' +
      '.rota-status-badge.nao-iniciado{background:#eceff1;color:#5a7a55;border:1px solid #d5dbd2;}' +
      '.rota-status-badge.andamento{background:#fef3dc;color:#8a5a00;border:1px solid #e8a020;}' +
      '.rota-status-badge.concluido{background:#e6f4ea;color:#1e7a34;border:1px solid #4CAF50;}' +
      '.rota-status-acao{display:inline-block;margin-left:6px;padding:3px 9px;border-radius:999px;' +
      'font-size:10px;font-weight:800;cursor:pointer;vertical-align:middle;white-space:nowrap;' +
      'background:#173b2b;color:#fff;border:1px solid #173b2b;}' +
      '.rota-status-acao:disabled{opacity:.55;cursor:default;}';
    (document.head || document.documentElement).appendChild(st);
  }

  // ── Ganchos nas funções globais do app ────────────────────────────────────

  function instalarGanchos() {
    if (typeof renderRotasAdmin === 'function' && !window.__veraRenderRotasAdminOriginal) {
      window.__veraRenderRotasAdminOriginal = renderRotasAdmin;
      window.renderRotasAdmin = async function () {
        const ret = await window.__veraRenderRotasAdminOriginal.apply(this, arguments);
        try { await aplicarStatusNoAdmin(); } catch (e) { console.warn('VERA status admin:', e); }
        return ret;
      };
    }

    if (typeof usarRotaAtribuida === 'function' && !window.__veraUsarRotaConclusaoOriginal) {
      window.__veraUsarRotaConclusaoOriginal = usarRotaAtribuida;
      window.usarRotaAtribuida = async function () {
        const rota = (typeof rotaAtribuida !== 'undefined') ? rotaAtribuida : null;
        const ret = await window.__veraUsarRotaConclusaoOriginal.apply(this, arguments);
        if (rota && rota.id) { try { await reabrirRota(rota.id); } catch (e) {} }
        return ret;
      };
    }

    if (typeof confirmarAlimentadores === 'function' && !window.__veraConfirmarConclusaoOriginal) {
      window.__veraConfirmarConclusaoOriginal = confirmarAlimentadores;
      window.confirmarAlimentadores = async function () {
        const ret = await window.__veraConfirmarConclusaoOriginal.apply(this, arguments);
        try { atualizarBotaoTecnico(); } catch (e) {}
        return ret;
      };
    }

    if (typeof switchTab === 'function' && !window.__veraSwitchTabConclusaoOriginal) {
      window.__veraSwitchTabConclusaoOriginal = switchTab;
      window.switchTab = function (name) {
        const ret = window.__veraSwitchTabConclusaoOriginal.apply(this, arguments);
        if (name === 'config') { try { atualizarBotaoTecnico(); } catch (e) {} }
        return ret;
      };
    }
  }

  injetarEstilos();
  instalarGanchos();

  window.VERA_CONCLUSAO_ROTAS = {
    concluir: concluirRotaAtual,
    aplicarStatusNoAdmin: aplicarStatusNoAdmin
  };
})();
