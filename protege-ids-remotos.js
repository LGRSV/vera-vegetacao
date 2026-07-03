(function () {
  'use strict';

  if (window.__veraProtegeIdsRemotos) return;
  window.__veraProtegeIdsRemotos = true;

  const fetchNativo = window.fetch.bind(window);
  const CHAVE_SESSAO = 'vera_mapa_ids_remotos_v2';
  let mapa = {};

  try {
    // localStorage: o mapeamento legado->remoto persiste entre sessões,
    // evitando que reenvios criem IDs (e pontos) duplicados no servidor.
    mapa = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || '{}') || {};
    // migrar mapeamentos da sessão atual, se existirem
    const antigo = JSON.parse(sessionStorage.getItem('vera_mapa_ids_remotos_v1') || '{}') || {};
    Object.keys(antigo).forEach(function (k) { if (!mapa[k]) mapa[k] = antigo[k]; });
  } catch (e) {
    mapa = {};
  }

  function salvarMapa() {
    try { localStorage.setItem(CHAVE_SESSAO, JSON.stringify(mapa)); } catch (e) {}
  }

  function codificarCaminho(caminho) {
    return caminho.split('/').map(function (parte) { return encodeURIComponent(parte); }).join('/');
  }

  function idRemoto(pasta, idLegado) {
    const chave = String(pasta || '') + '|' + String(idLegado || '').toUpperCase();
    if (mapa[chave]) return mapa[chave];

    const agora = new Date();
    const dois = function (valor) { return String(valor).padStart(2, '0'); };
    const carimbo = String(agora.getFullYear()) + dois(agora.getMonth() + 1) + dois(agora.getDate())
      + dois(agora.getHours()) + dois(agora.getMinutes()) + dois(agora.getSeconds())
      + String(agora.getMilliseconds()).padStart(3, '0');

    let aleatorio = '';
    try {
      const valores = new Uint32Array(1);
      crypto.getRandomValues(valores);
      aleatorio = String(valores[0] % 1000000).padStart(6, '0');
    } catch (e) {
      aleatorio = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    }

    mapa[chave] = 'V' + carimbo + aleatorio;
    salvarMapa();
    return mapa[chave];
  }

  function textoDeBase64(valor) {
    return decodeURIComponent(Array.prototype.map.call(atob(valor), function (caractere) {
      return '%' + ('00' + caractere.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
  }

  function base64DeTexto(valor) {
    return btoa(unescape(encodeURIComponent(valor)));
  }

  function atualizarConteudoDoPonto(base64, idAntigo, idNovo) {
    try {
      const ponto = JSON.parse(textoDeBase64(base64));
      const numeroAntigo = idAntigo.replace(/^V/i, '');
      const numeroNovo = idNovo.replace(/^V/i, '');
      const marcadorAntigo = 'VER' + numeroAntigo + 'F';
      const marcadorNovo = 'VER' + numeroNovo + 'F';

      ponto.legacy_id = ponto.legacy_id || idAntigo;
      ponto.id = idNovo;
      ponto.remote_id = idNovo;

      if (Array.isArray(ponto.fotos_ids)) {
        ponto.fotos_ids = ponto.fotos_ids.map(function (foto) {
          return String(foto).replace(marcadorAntigo, marcadorNovo);
        });
      }
      if (Array.isArray(ponto.fotos_github)) {
        ponto.fotos_github = ponto.fotos_github.map(function (foto) {
          return String(foto).replace(marcadorAntigo, marcadorNovo);
        });
      }

      return base64DeTexto(JSON.stringify(ponto, null, 2));
    } catch (e) {
      return base64;
    }
  }

  function analisarCaminho(caminho) {
    const foto = caminho.match(/^fotos\/(.+)\/VER(\d+)F(\d+)\.(jpg|jpeg|png)$/i);
    if (foto && foto[2].length <= 6) {
      const legado = 'V' + foto[2].padStart(4, '0');
      const remoto = idRemoto(foto[1], legado);
      return {
        tipo: 'foto',
        pasta: foto[1],
        legado: legado,
        remoto: remoto,
        novoCaminho: 'fotos/' + foto[1] + '/VER' + remoto.slice(1) + 'F' + foto[3] + '.' + foto[4]
      };
    }

    const ponto = caminho.match(/^dados\/(.+)\/(V\d+)\.json$/i);
    if (ponto && ponto[2].replace(/^V/i, '').length <= 6) {
      const legado = ponto[2].toUpperCase();
      const remoto = idRemoto(ponto[1], legado);
      return {
        tipo: 'ponto',
        pasta: ponto[1],
        legado: legado,
        remoto: remoto,
        novoCaminho: 'dados/' + ponto[1] + '/' + remoto + '.json'
      };
    }

    return null;
  }

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const metodo = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    const marcador = '/contents/';
    const indice = url.indexOf(marcador);

    if (!url || indice < 0 || !/api\.github\.com\/repos\/LGRSV\/vera-vegetacao\/contents\//i.test(url)) {
      return fetchNativo(input, init);
    }

    const caminho = decodeURIComponent(url.slice(indice + marcador.length).split('?')[0]);
    const regra = analisarCaminho(caminho);
    if (!regra) return fetchNativo(input, init);

    const novaUrl = url.slice(0, indice + marcador.length) + codificarCaminho(regra.novoCaminho);
    let novaInit = init;

    if (metodo === 'PUT' && init && init.body) {
      try {
        const carga = JSON.parse(init.body);
        if (regra.tipo === 'ponto' && carga && carga.content) {
          carga.content = atualizarConteudoDoPonto(carga.content, regra.legado, regra.remoto);
        }
        // Se o arquivo já existe no destino, incluir o sha para SOBRESCREVER
        // (sem isso o GitHub retorna 422 e o reenvio falharia)
        if (carga && !carga.sha) {
          try {
            const cab = (init && init.headers) || {};
            const consulta = await fetchNativo(novaUrl.split('?')[0] + '?t=' + Date.now(), { headers: cab, cache: 'no-store' });
            if (consulta.ok) {
              const existente = await consulta.json();
              if (existente && existente.sha) carga.sha = existente.sha;
            }
          } catch (eSha) {}
        }
        novaInit = Object.assign({}, init, { body: JSON.stringify(carga) });
      } catch (e) {}
    }

    return fetchNativo(novaUrl, novaInit);
  };
})();

(function carregarRecursosDeMapa() {
  if (window.__veraCarregouMapaCompartilhado) return;
  window.__veraCarregouMapaCompartilhado = true;

  function carregar(arquivo, proximo) {
    const script = document.createElement('script');
    script.src = arquivo + '?t=' + Date.now();
    script.async = false;
    script.onerror = function () { console.warn('VERA: não foi possível carregar ' + arquivo + '.'); };
    if (typeof proximo === 'function') script.onload = proximo;
    (document.head || document.documentElement).appendChild(script);
  }

  carregar('contexto-mapa-compartilhado.js', function () {
    carregar('mapa-pontos-compartilhados.js');
  });
})();
