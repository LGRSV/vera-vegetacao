(function () {
  'use strict';

  if (window.__veraHotfixFotos) return;
  window.__veraHotfixFotos = true;

  const fetchOriginal = window.fetch.bind(window);
  const fotosPorPonto = new Map();
  let sincronizandoForcado = false;

  function caminhoGithub(input) {
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const marcador = '/contents/';
    const indice = url.indexOf(marcador);
    if (indice < 0) return '';
    return decodeURIComponent(url.slice(indice + marcador.length).split('?')[0]);
  }

  function metodoDaRequisicao(input, init) {
    return String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
  }

  function pontoDaFoto(caminho) {
    const nome = caminho.split('/').pop() || '';
    const achado = nome.match(/^VER(\d+)F\d+\.(?:jpg|jpeg|png)$/i);
    return achado ? 'V' + achado[1].padStart(4, '0') : '';
  }

  function pontoDoJson(caminho) {
    const nome = caminho.split('/').pop() || '';
    const achado = nome.match(/^(V\d+)\.json$/i);
    return achado ? achado[1].toUpperCase() : '';
  }

  function registrarFoto(ponto, caminho, ok, detalhe) {
    if (!ponto) return;
    const estado = fotosPorPonto.get(ponto) || new Map();
    estado.set(caminho, { ok: Boolean(ok), detalhe: detalhe || '' });
    fotosPorPonto.set(ponto, estado);
  }

  function falhaPendente(ponto) {
    const estado = fotosPorPonto.get(ponto);
    if (!estado) return '';
    for (const item of estado.values()) {
      if (!item.ok) return item.detalhe || 'não foi possível enviar uma das fotos';
    }
    return '';
  }

  function avisar(texto, tipo) {
    const status = document.getElementById('status-text');
    if (status) status.textContent = texto;
    if (typeof window.showToast === 'function') window.showToast(texto, tipo || '');
  }

  function b64Texto(texto) {
    return btoa(unescape(encodeURIComponent(texto)));
  }

  async function detalheHttp(resposta) {
    let detalhe = '';
    try {
      const corpo = await resposta.clone().json();
      detalhe = corpo && (corpo.message || corpo.error) ? String(corpo.message || corpo.error) : '';
    } catch (e) {}
    return 'HTTP ' + resposta.status + (detalhe ? ' — ' + detalhe : '');
  }

  async function putGithub(repo, token, caminho, conteudoBase64, mensagem) {
    const url = 'https://api.github.com/repos/' + repo + '/contents/' + caminho;
    let sha = null;

    try {
      const consulta = await fetchOriginal(url, {
        headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github+json' }
      });
      if (consulta.ok) {
        const atual = await consulta.json();
        sha = atual.sha || null;
      }
    } catch (e) {}

    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      const corpo = { message: mensagem, content: conteudoBase64 };
      if (sha) corpo.sha = sha;

      let resposta;
      try {
        resposta = await fetchOriginal(url, {
          method: 'PUT',
          headers: {
            'Authorization': 'token ' + token,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(corpo)
        });
      } catch (erroRede) {
        if (tentativa === 3) throw new Error('falha de conexão');
        await new Promise(function (ok) { setTimeout(ok, 900 * tentativa); });
        continue;
      }

      if (resposta.ok) return;

      if (resposta.status === 409 && tentativa < 3) {
        try {
          const novaConsulta = await fetchOriginal(url, {
            headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github+json' }
          });
          if (novaConsulta.ok) {
            const atual = await novaConsulta.json();
            sha = atual.sha || null;
          }
        } catch (e) {}
        await new Promise(function (ok) { setTimeout(ok, 900 * tentativa); });
        continue;
      }

      throw new Error(await detalheHttp(resposta));
    }
  }

  async function obterConfiguracao() {
    let cfg = null;
    try {
      if (typeof window.carregarConfigGlobal === 'function') cfg = await window.carregarConfigGlobal();
    } catch (e) {}

    let token = cfg && cfg.token;
    let repo = cfg && cfg.repo;

    try {
      if (!token && typeof window.getConfig === 'function') token = await window.getConfig('github_token');
      if (!repo && typeof window.getConfig === 'function') repo = await window.getConfig('github_repo');
    } catch (e) {}

    return {
      token: token || '',
      repo: repo || 'LGRSV/vera-vegetacao'
    };
  }

  function precisaReenviar(ponto) {
    if (!ponto || !ponto.synced) return true;
    const locais = Array.isArray(ponto.photos) ? ponto.photos.length : 0;
    const remotas = Array.isArray(ponto.fotos_github) ? ponto.fotos_github.length : 0;
    return locais > remotas;
  }

  async function sincronizarPontoForcado(ponto, repo, token) {
    const pasta = String(ponto.usuario || 'Equipe sem nome').replace(/\s+/g, '-');
    const fotos = Array.isArray(ponto.photos) ? ponto.photos : [];
    const fotosGithub = [];
    const fotosIds = [];
    const numero = String(ponto.id || '').replace(/[^0-9]/g, '').padStart(4, '0');

    for (let i = 0; i < fotos.length; i++) {
      const original = fotos[i];
      if (!original || !String(original).startsWith('data:')) {
        throw new Error('foto ' + (i + 1) + ' não está disponível no aparelho');
      }

      avisar('Reenviando foto ' + (i + 1) + '/' + fotos.length + ' do ponto ' + ponto.id + '...', '');
      const comprimida = typeof window.comprimirFoto === 'function'
        ? await window.comprimirFoto(original, 640)
        : original;
      const base64 = String(comprimida).split(',')[1];
      if (!base64) throw new Error('não foi possível preparar a foto ' + (i + 1));

      const fotoId = 'VER' + numero + 'F' + (i + 1);
      const fotoPath = 'fotos/' + pasta + '/' + fotoId + '.jpg';
      await putGithub(repo, token, fotoPath, base64, 'VERA: foto ' + fotoId);
      fotosGithub.push(fotoPath);
      fotosIds.push(fotoId);
    }

    avisar('Salvando ponto ' + ponto.id + '...', '');
    const pontoServidor = Object.assign({}, ponto, {
      photos: undefined,
      synced: true,
      syncedAt: new Date().toISOString(),
      fotos_count: fotos.length,
      fotos_ids: fotosIds,
      fotos_github: fotosGithub
    });
    const jsonPath = 'dados/' + pasta + '/' + ponto.id + '.json';
    await putGithub(
      repo,
      token,
      jsonPath,
      b64Texto(JSON.stringify(pontoServidor, null, 2)),
      'VERA: ponto ' + ponto.id + ' — ' + (ponto.especie || 'sem espécie')
    );

    ponto.synced = true;
    ponto.syncedAt = new Date().toISOString();
    ponto.fotos_ids = fotosIds;
    ponto.fotos_github = fotosGithub;
    if (typeof window.dbPut === 'function') await window.dbPut('points', ponto);
  }

  async function forcarSincronizacaoOnline() {
    if (sincronizandoForcado) return;
    if (!navigator.onLine) {
      avisar('Sem conexão. Os pontos continuam guardados neste aparelho.', 'warning');
      return;
    }
    if (typeof window.dbGetAll !== 'function' || typeof window.dbPut !== 'function') {
      setTimeout(forcarSincronizacaoOnline, 1500);
      return;
    }

    sincronizandoForcado = true;
    try {
      const config = await obterConfiguracao();
      if (!config.token) {
        avisar('Token de sincronização não encontrado neste aparelho. Abra Config e salve o token.', 'error');
        return;
      }

      const todos = await window.dbGetAll('points');
      const pendentes = todos.filter(precisaReenviar);
      if (!pendentes.length) {
        avisar('Nenhum ponto pendente neste aparelho.', '');
        return;
      }

      let enviados = 0;
      const falhas = [];
      for (const ponto of pendentes) {
        try {
          await sincronizarPontoForcado(ponto, config.repo, config.token);
          enviados++;
        } catch (erro) {
          const mensagem = 'Ponto ' + (ponto.id || '?') + ': ' + (erro && erro.message ? erro.message : 'erro ao reenviar');
          falhas.push(mensagem);
          window.__veraUltimoErroFoto = mensagem;
          console.warn('VERA reenvio forçado:', mensagem, erro);
        }
      }

      if (typeof window.renderRecords === 'function') window.renderRecords();
      if (typeof window.updatePendingBadge === 'function') window.updatePendingBadge();

      if (falhas.length) {
        avisar((enviados ? enviados + ' ponto(s) enviado(s). ' : '') + falhas[0], 'error');
      } else {
        avisar(enviados + ' ponto(s) enviado(s) com sucesso.', 'success');
      }
    } catch (erroGeral) {
      avisar('Falha na sincronização: ' + (erroGeral && erroGeral.message ? erroGeral.message : 'erro inesperado'), 'error');
    } finally {
      sincronizandoForcado = false;
    }
  }

  const comprimirOriginal = window.comprimirFoto;
  if (typeof comprimirOriginal === 'function') {
    window.comprimirFoto = async function (dataUrl, maxPx) {
      const limiteSeguro = Math.min(Number(maxPx) || 640, 640);
      return comprimirOriginal(dataUrl, limiteSeguro);
    };
  }

  window.fetch = async function (input, init) {
    const metodo = metodoDaRequisicao(input, init);
    const caminho = caminhoGithub(input);
    const envioFoto = metodo === 'PUT' && /^fotos\/.+\.(?:jpg|jpeg|png)$/i.test(caminho);
    const envioPonto = metodo === 'PUT' && /^dados\/.+\.json$/i.test(caminho);

    if (envioPonto) {
      const ponto = pontoDoJson(caminho);
      const erroFoto = falhaPendente(ponto);
      if (erroFoto) {
        const mensagem = 'Ponto ' + ponto + ' mantido pendente: ' + erroFoto + '.';
        window.__veraUltimoErroFoto = mensagem;
        const status = document.getElementById('status-text');
        if (status) status.textContent = mensagem;
        return new Response(JSON.stringify({ message: mensagem }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    try {
      const resposta = await fetchOriginal(input, init);
      if (envioFoto) {
        registrarFoto(
          pontoDaFoto(caminho),
          caminho,
          resposta.ok,
          resposta.ok ? '' : ('foto recusada pelo servidor (HTTP ' + resposta.status + ')')
        );
      }
      return resposta;
    } catch (erro) {
      if (envioFoto) {
        registrarFoto(pontoDaFoto(caminho), caminho, false, 'falha de conexão ao enviar a foto');
      }
      throw erro;
    }
  };

  const toastOriginal = window.showToast;
  if (typeof toastOriginal === 'function') {
    window.showToast = function (mensagem, tipo) {
      if (tipo === 'error' && mensagem === 'Erro ao enviar. Verifique a conexão e tente novamente.' && window.__veraUltimoErroFoto) {
        mensagem = window.__veraUltimoErroFoto;
      }
      return toastOriginal(mensagem, tipo);
    };
  }

  window.forcarSincronizacaoOnline = forcarSincronizacaoOnline;

  document.addEventListener('click', function (evento) {
    const botao = evento.target && evento.target.closest ? evento.target.closest('.btn-sync-now') : null;
    if (!botao || !/sincronizar agora/i.test(botao.textContent || '')) return;
    evento.preventDefault();
    evento.stopImmediatePropagation();
    forcarSincronizacaoOnline();
  }, true);

  window.addEventListener('online', function () { setTimeout(forcarSincronizacaoOnline, 600); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') setTimeout(forcarSincronizacaoOnline, 800);
  });
  setTimeout(forcarSincronizacaoOnline, 1800);
})();
