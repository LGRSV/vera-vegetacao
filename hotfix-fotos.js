(function () {
  'use strict';

  if (window.__veraHotfixFotos) return;
  window.__veraHotfixFotos = true;

  const fetchOriginal = window.fetch.bind(window);
  const fotosPorPonto = new Map();

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
        const ponto = pontoDaFoto(caminho);
        registrarFoto(
          ponto,
          caminho,
          resposta.ok,
          resposta.ok ? '' : ('foto recusada pelo servidor (HTTP ' + resposta.status + ')')
        );
      }
      return resposta;
    } catch (erro) {
      if (envioFoto) {
        registrarFoto(
          pontoDaFoto(caminho),
          caminho,
          false,
          'falha de conexão ao enviar a foto'
        );
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
})();
