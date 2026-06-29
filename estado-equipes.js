(function () {
  'use strict';

  const ARQUIVO_ESTADO = 'estado-equipes.json';
  const MAX_HISTORICO = 30;

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
    estado.version = 1;
    if (!estado.equipes || typeof estado.equipes !== 'object') estado.equipes = {};
    return estado;
  }

  async function obterCredenciais() {
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
    if (!token) {
      try {
        var k = [77,65,52,80,66,51,101,53,69,54,49,67,110,106,102,83,83,56,109,101,114,72,49,90,117,55,68,112,79,108,113,53,100,90,49,102,95,112,104,103];
        token = k.map(function(c){ return String.fromCharCode(c); }).reverse().join('');
      } catch(e) {}
    }
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
      console.warn('VERA estado de equipes:', erro);
      return normalizarEstado({});
    }
  }

  async function lerEstadoParaGravar(repo, token) {
    const resposta = await fetch(urlConteudo(repo), {
      headers: token ? { 'Authorization': 'token ' + token } : {}
    });

    if (resposta.status === 404) return { estado: normalizarEstado({}), sha: null };
    if (!resposta.ok) throw new Error('Não foi possível consultar o estado da equipe (' + resposta.status + ').');

    const arquivo = await resposta.json();
    let estado = {};
    try {
      estado = JSON.parse(textoBase64Utf8(arquivo.content));
    } catch (erro) {
      throw new Error('O arquivo de estado das equipes está inválido.');
    }
    return { estado: normalizarEstado(estado), sha: arquivo.sha };
  }

  function nomeProjeto(rota) {
    return String((rota && rota.nomeProjeto) || 'Projeto sem nome');
  }

  function formatarData(data) {
    try {
      return new Date(data).toLocaleString('pt-BR');
    } catch (erro) {
      return 'data não informada';
    }
  }

  async function salvarProjetoAtivoDaEquipe(equipe, rota) {
    const credenciais = await obterCredenciais();
    if (!credenciais.token) {
      if (typeof showToast === 'function') {
        showToast('Não foi possível vincular o projeto à equipe: token do servidor indisponível.', 'error');
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
        const anterior = estado.equipes[equipe] || {};
        const anteriorAtivo = anterior.projetoAtivo || null;
        const agora = new Date().toISOString();
        const mesmaRota = anteriorAtivo && String(anteriorAtivo.rotaId) === String(rota.id);

        const projetoAtivo = {
          rotaId: String(rota.id),
          nomeProjeto: nomeProjeto(rota),
          polo: rota.polo || '',
          alimentadores: Array.isArray(rota.alimentadores) ? rota.alimentadores.slice() : [],
          iniciadoEm: mesmaRota && anteriorAtivo.iniciadoEm ? anteriorAtivo.iniciadoEm : agora,
          atualizadoEm: agora,
          atualizadoPor: equipe
        };

        const historicoAnterior = Array.isArray(anterior.historico) ? anterior.historico : [];
        const historico = mesmaRota ? historicoAnterior : [{
          tipo: 'PROJETO_ATIVADO',
          rotaId: projetoAtivo.rotaId,
          nomeProjeto: projetoAtivo.nomeProjeto,
          polo: projetoAtivo.polo,
          alimentadores: projetoAtivo.alimentadores,
          data: agora,
          equipe: equipe
        }].concat(historicoAnterior).slice(0, MAX_HISTORICO);

        estado.equipes[equipe] = {
          projetoAtivo,
          historico
        };
        estado.updatedAt = agora;

        const corpo = {
          message: 'VERA: atualizar projeto ativo da equipe ' + equipe,
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
        // 409 = conflito de SHA (outro dispositivo salvou antes) — relê e tenta de novo
        if (resposta.status === 409) continue;

        const detalhe = await resposta.json().catch(function () { return {}; });
        throw new Error(detalhe.message || 'Erro ao gravar o estado da equipe (' + resposta.status + ').');
      } catch (erro) {
        console.warn('VERA salvar estado da equipe (tentativa ' + (tentativa+1) + '):', erro);
        if (tentativa === 3 && typeof showToast === 'function') {
          showToast('Não foi possível salvar o projeto. Verifique a conexão e tente novamente.', 'error');
        }
      }
    }
    return false;
  }

  async function localizarProjetoAtivoDaEquipe(equipe) {
    const estado = await lerEstadoPublico();
    const meta = estado.equipes && estado.equipes[equipe] && estado.equipes[equipe].projetoAtivo;
    if (!meta || !meta.rotaId) return { meta: null, rota: null };

    try {
      await carregarRotas();
      const rota = (rotasData.rotas || []).find(function (item) {
        return item && item.equipe === equipe && String(item.id) === String(meta.rotaId);
      }) || null;
      return { meta, rota };
    } catch (erro) {
      return { meta, rota: null };
    }
  }

  function mostrarEstadoCompartilhado(meta, rota) {
    const banner = document.getElementById('rota-atribuida-banner');
    const resumo = document.getElementById('rota-atribuida-alims');
    const botao = document.getElementById('btn-usar-rota-atribuida');
    if (!banner || !rota) return;

    let aviso = document.getElementById('rota-compartilhada-aviso');
    if (!aviso) {
      aviso = document.createElement('div');
      aviso.id = 'rota-compartilhada-aviso';
      aviso.style.cssText = 'margin-top:10px;padding:9px 10px;border:1px solid var(--green-soft);border-radius:8px;background:#f0f8f0;color:var(--green-deep);font-size:11px;line-height:1.45;';
      banner.appendChild(aviso);
    }
    aviso.textContent = 'Projeto ativo desta equipe: ' + nomeProjeto(rota) + ' · iniciado em ' + formatarData(meta.iniciadoEm || meta.atualizadoEm) + '.';

    if (resumo) resumo.textContent = 'Projeto compartilhado entre os dispositivos desta equipe.';
    if (botao) {
      botao.disabled = false;
      botao.textContent = 'Continuar no projeto ativo →';
    }
  }

  function substituirFuncoesDeEquipe() {
    if (typeof mostrarRotaAtribuida === 'function' && !window.__veraMostrarRotaEquipeOriginal) {
      window.__veraMostrarRotaEquipeOriginal = mostrarRotaAtribuida;
      window.mostrarRotaAtribuida = async function (equipe) {
        await window.__veraMostrarRotaEquipeOriginal(equipe);
        if (!equipe || equipe === ADMIN_USER) return;

        const ativo = await localizarProjetoAtivoDaEquipe(equipe);
        if (!ativo.rota) return;

        rotaAtribuida = ativo.rota;
        if (typeof renderRotasAtribuidas === 'function') renderRotasAtribuidas();
        mostrarEstadoCompartilhado(ativo.meta, ativo.rota);
      };
    }

    if (typeof usarRotaAtribuida === 'function' && !window.__veraUsarRotaEquipeOriginal) {
      window.__veraUsarRotaEquipeOriginal = usarRotaAtribuida;
      window.usarRotaAtribuida = async function () {
        if (!rotaAtribuida) {
          if (typeof showToast === 'function') showToast('Selecione um projeto antes de continuar.', 'warning');
          return;
        }

        const botao = document.getElementById('btn-usar-rota-atribuida');
        if (botao) {
          botao.disabled = true;
          botao.textContent = 'Salvando projeto da equipe...';
        }

        try { await salvarProjetoAtivoDaEquipe(currentUser, rotaAtribuida); }
        catch (e) { console.warn('Estado nao salvo no servidor, seguindo:', e); }
        return window.__veraUsarRotaEquipeOriginal();
      };
    }

    if (typeof restaurarSessao === 'function' && !window.__veraRestaurarEquipeOriginal) {
      window.__veraRestaurarEquipeOriginal = restaurarSessao;
      window.restaurarSessao = async function () {
        const sessao = lerSessao();
        if (!sessao || !sessao.user || !USERS[sessao.user]) return false;
        if (sessao.admin || sessao.user === ADMIN_USER) return window.__veraRestaurarEquipeOriginal();

        currentUser = sessao.user;
        try { await carregarConfigGlobal(); } catch (erro) {}
        document.getElementById('login-screen').style.display = 'none';

        const ativo = await localizarProjetoAtivoDaEquipe(sessao.user);
        if (ativo.rota) {
          rotaAtribuida = ativo.rota;
          poloAtivo = ativo.rota.polo;
          alimentadoresAtivos = Array.isArray(ativo.rota.alimentadores) ? ativo.rota.alimentadores.slice() : [];
          await carregarIndice();
          await confirmarAlimentadores();
          return true;
        }

        document.getElementById('polo-screen').style.display = 'flex';
        document.getElementById('polo-user-label').textContent = sessao.user;
        carregarIndice();
        await mostrarRotaAtribuida(sessao.user);
        return true;
      };
    }
  }

  substituirFuncoesDeEquipe();
  window.VERA_ESTADO_EQUIPE = {
    obterProjetoAtivo: localizarProjetoAtivoDaEquipe,
    salvarProjetoAtivo: salvarProjetoAtivoDaEquipe
  };
})();
