(function () {
  'use strict';

  const ID_PAINEL = 'team-device-sync-panel';
  const ID_STATUS = 'team-device-sync-status';
  const ID_BOTAO = 'team-device-sync-button';

  function eEquipeDeCampo() {
    return Boolean(currentUser && typeof ADMIN_USER !== 'undefined' && currentUser !== ADMIN_USER);
  }

  function nomeProjeto(rota, meta) {
    return String((rota && rota.nomeProjeto) || (meta && meta.nomeProjeto) || 'Projeto sem nome');
  }

  function formatarData(data) {
    if (!data) return 'horário não informado';
    const valor = new Date(data);
    return Number.isNaN(valor.getTime()) ? 'horário não informado' : valor.toLocaleString('pt-BR');
  }

  function obterPainel() {
    return document.getElementById(ID_PAINEL);
  }

  function definirStatus(texto, tipo) {
    const status = document.getElementById(ID_STATUS);
    if (!status) return;
    status.textContent = texto;
    status.style.color = tipo === 'erro' ? 'var(--danger)' : (tipo === 'ok' ? 'var(--green-mid)' : 'var(--text-muted)');
  }

  function definirBotao(texto, bloqueado) {
    const botao = document.getElementById(ID_BOTAO);
    if (!botao) return;
    botao.textContent = texto;
    botao.disabled = Boolean(bloqueado);
    botao.style.opacity = bloqueado ? '0.65' : '1';
    botao.style.cursor = bloqueado ? 'wait' : 'pointer';
  }

  function instalarPainelSincronizacao() {
    const painelRegistros = document.getElementById('records-panel');
    if (!painelRegistros || obterPainel()) return;

    const painel = document.createElement('section');
    painel.id = ID_PAINEL;
    painel.style.cssText = 'display:none;margin:0 0 14px;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--off-white);';

    const titulo = document.createElement('div');
    titulo.textContent = 'Sincronização entre dispositivos';
    titulo.style.cssText = 'font-size:12px;font-weight:800;color:var(--green-deep);margin-bottom:4px;';

    const descricao = document.createElement('div');
    descricao.textContent = 'Atualiza o projeto ativo desta equipe para continuar a mesma rota em outro computador ou celular.';
    descricao.style.cssText = 'font-size:11px;line-height:1.4;color:var(--text-muted);margin-bottom:10px;';

    const botao = document.createElement('button');
    botao.id = ID_BOTAO;
    botao.type = 'button';
    botao.textContent = 'Atualizar sincronização de dispositivos';
    botao.style.cssText = 'width:100%;padding:11px 12px;border:0;border-radius:8px;background:var(--green-mid);color:#fff;font:700 12px inherit;cursor:pointer;';
    botao.addEventListener('click', sincronizarDispositivosDaEquipe);

    const status = document.createElement('div');
    status.id = ID_STATUS;
    status.style.cssText = 'margin-top:8px;font-size:11px;line-height:1.4;color:var(--text-muted);';

    painel.appendChild(titulo);
    painel.appendChild(descricao);
    painel.appendChild(botao);
    painel.appendChild(status);

    const cabecalho = painelRegistros.querySelector('.records-header');
    if (cabecalho && cabecalho.parentNode) cabecalho.insertAdjacentElement('afterend', painel);
    else painelRegistros.insertBefore(painel, painelRegistros.firstChild);
  }

  async function atualizarResumoDoServidor() {
    instalarPainelSincronizacao();
    const painel = obterPainel();
    if (!painel) return;

    if (!eEquipeDeCampo()) {
      painel.style.display = 'none';
      return;
    }

    painel.style.display = 'block';
    definirBotao('Atualizar sincronização de dispositivos', false);
    definirStatus('Consultando o projeto ativo da equipe…', '');

    try {
      if (!window.VERA_ESTADO_EQUIPE || typeof window.VERA_ESTADO_EQUIPE.obterProjetoAtivo !== 'function') {
        throw new Error('Recurso de sincronização ainda não carregado.');
      }
      const remoto = await window.VERA_ESTADO_EQUIPE.obterProjetoAtivo(currentUser);
      if (remoto && remoto.rota) {
        definirStatus('No servidor: ' + nomeProjeto(remoto.rota, remoto.meta) + ' · iniciado em ' + formatarData(remoto.meta && (remoto.meta.iniciadoEm || remoto.meta.atualizadoEm)) + '.', 'ok');
      } else if (rotaAtribuida) {
        definirStatus('Este aparelho está no projeto ' + nomeProjeto(rotaAtribuida) + '. Toque em atualizar para disponibilizá-lo para a equipe.', '');
      } else {
        definirStatus('Nenhum projeto ativo foi encontrado para esta equipe.', '');
      }
    } catch (erro) {
      definirStatus('Não foi possível consultar a sincronização agora.', 'erro');
    }
  }

  async function aplicarProjetoRemoto(remoto) {
    rotaAtribuida = remoto.rota;
    poloAtivo = remoto.rota.polo;
    alimentadoresAtivos = Array.isArray(remoto.rota.alimentadores) ? remoto.rota.alimentadores.slice() : [];

    if (typeof salvarSessao === 'function') salvarSessao();
    await carregarIndice();
    await confirmarAlimentadores();
    if (typeof switchTab === 'function') switchTab('records');
  }

  async function sincronizarDispositivosDaEquipe() {
    if (!eEquipeDeCampo()) return;

    instalarPainelSincronizacao();
    definirBotao('Atualizando sincronização…', true);
    definirStatus('Comparando este aparelho com o projeto salvo pela equipe…', '');

    try {
      if (!window.VERA_ESTADO_EQUIPE || typeof window.VERA_ESTADO_EQUIPE.obterProjetoAtivo !== 'function') {
        throw new Error('Recurso de sincronização indisponível.');
      }

      const remoto = await window.VERA_ESTADO_EQUIPE.obterProjetoAtivo(currentUser);
      const local = rotaAtribuida || null;

      if (remoto && remoto.rota) {
        const mesmaRota = local && String(local.id) === String(remoto.rota.id);
        if (!mesmaRota) {
          await aplicarProjetoRemoto(remoto);
          definirStatus('Projeto carregado do servidor: ' + nomeProjeto(remoto.rota, remoto.meta) + '.', 'ok');
          if (typeof showToast === 'function') showToast('Projeto da equipe atualizado neste dispositivo.', 'success');
        } else {
          if (typeof salvarSessao === 'function') salvarSessao();
          definirStatus('Este dispositivo já está atualizado no projeto ' + nomeProjeto(remoto.rota, remoto.meta) + '.', 'ok');
          if (typeof showToast === 'function') showToast('Dispositivos já estão sincronizados.', 'success');
        }
      } else if (local) {
        if (!window.VERA_ESTADO_EQUIPE || typeof window.VERA_ESTADO_EQUIPE.salvarProjetoAtivo !== 'function') {
          throw new Error('Não foi possível publicar o projeto da equipe.');
        }
        const salvo = await window.VERA_ESTADO_EQUIPE.salvarProjetoAtivo(currentUser, local);
        if (!salvo) throw new Error('Não foi possível salvar o projeto atual no servidor.');
        if (typeof salvarSessao === 'function') salvarSessao();
        definirStatus('Projeto disponibilizado para os dispositivos da equipe: ' + nomeProjeto(local) + '.', 'ok');
        if (typeof showToast === 'function') showToast('Projeto sincronizado para a equipe.', 'success');
      } else {
        definirStatus('Nenhum projeto está aberto neste dispositivo ou salvo para esta equipe.', 'erro');
      }
    } catch (erro) {
      console.warn('VERA sincronização de dispositivos:', erro);
      definirStatus('Não foi possível concluir a sincronização. Verifique a internet e tente novamente.', 'erro');
      if (typeof showToast === 'function') showToast('Falha na sincronização de dispositivos.', 'error');
    } finally {
      definirBotao('Atualizar sincronização de dispositivos', false);
    }
  }

  function integrarComRegistros() {
    instalarPainelSincronizacao();

    if (typeof switchTab === 'function' && !window.__veraSwitchTabSincronizacaoOriginal) {
      window.__veraSwitchTabSincronizacaoOriginal = switchTab;
      window.switchTab = function (nome) {
        const retorno = window.__veraSwitchTabSincronizacaoOriginal.apply(this, arguments);
        if (nome === 'records') setTimeout(atualizarResumoDoServidor, 0);
        return retorno;
      };
    }

    setTimeout(atualizarResumoDoServidor, 250);
  }

  window.sincronizarDispositivosDaEquipe = sincronizarDispositivosDaEquipe;
  integrarComRegistros();
})();
