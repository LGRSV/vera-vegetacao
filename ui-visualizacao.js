(function () {
  'use strict';

  const STORAGE_KEY = 'vera_admin_visualizacao_minimizada';
  const STYLE_ID = 'vera-ui-visualizacao-style';
  const BUTTON_ID = 'vera-admin-map-minimize';

  function obterElementosMapa() {
    return {
      container: document.getElementById('admin-map-container'),
      info: document.getElementById('admin-map-info')
    };
  }

  function inserirEstilos() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#admin-map-container.vera-visualizacao-minimizada,',
      '#admin-map-info.vera-visualizacao-minimizada { display:none !important; }',
      '.vera-admin-map-toggle {',
      '  padding:4px 10px;',
      '  border:1px solid var(--border);',
      '  border-radius:6px;',
      '  background:var(--white);',
      '  color:var(--green-deep);',
      '  cursor:pointer;',
      '  font:600 11px inherit;',
      '}',
      '.vera-admin-map-toggle:hover { background:var(--off-white); }',
      '#update-banner { display:none !important; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function painelEstaMinimizado() {
    const elementos = obterElementosMapa();
    return Boolean(elementos.container && elementos.container.classList.contains('vera-visualizacao-minimizada'));
  }

  function atualizarBotao(minimizado) {
    const botao = document.getElementById(BUTTON_ID);
    if (!botao) return;

    botao.textContent = minimizado ? 'Exibir mapa' : 'Minimizar';
    botao.setAttribute('aria-expanded', String(!minimizado));
    botao.title = minimizado ? 'Exibir a visualização do mapa' : 'Minimizar a visualização do mapa';
  }

  function ajustarTamanhoDoMapa() {
    setTimeout(function () {
      if (window.adminMap && typeof window.adminMap.invalidateSize === 'function') {
        window.adminMap.invalidateSize();
      }
    }, 120);
  }

  function definirVisualizacaoMinimizada(minimizado, salvar) {
    inserirEstilos();

    const elementos = obterElementosMapa();
    if (!elementos.container) return;

    elementos.container.classList.toggle('vera-visualizacao-minimizada', Boolean(minimizado));
    if (elementos.info) elementos.info.classList.toggle('vera-visualizacao-minimizada', Boolean(minimizado));
    atualizarBotao(Boolean(minimizado));

    if (salvar !== false) {
      try {
        localStorage.setItem(STORAGE_KEY, minimizado ? '1' : '0');
      } catch (erro) {}
    }

    if (!minimizado) ajustarTamanhoDoMapa();
  }

  function alternarVisualizacao() {
    definirVisualizacaoMinimizada(!painelEstaMinimizado());
  }

  function instalarControleDeVisualizacao() {
    inserirEstilos();

    const elementos = obterElementosMapa();
    const seletorEquipe = document.getElementById('admin-map-equipe');
    const barraAcoes = seletorEquipe && seletorEquipe.parentElement;

    if (!elementos.container || !barraAcoes) return false;

    let botao = document.getElementById(BUTTON_ID);
    if (!botao) {
      botao = document.createElement('button');
      botao.id = BUTTON_ID;
      botao.type = 'button';
      botao.className = 'vera-admin-map-toggle';
      botao.addEventListener('click', alternarVisualizacao);
      barraAcoes.appendChild(botao);
    }

    let minimizado = false;
    try {
      minimizado = localStorage.getItem(STORAGE_KEY) === '1';
    } catch (erro) {}
    definirVisualizacaoMinimizada(minimizado, false);
    return true;
  }

  function ocultarAvisoDeAtualizacao() {
    const banner = document.getElementById('update-banner');
    if (!banner) return;

    if (!banner.hidden) banner.hidden = true;
    if (banner.getAttribute('aria-hidden') !== 'true') banner.setAttribute('aria-hidden', 'true');
    if (banner.style.display !== 'none') banner.style.setProperty('display', 'none', 'important');
    banner.classList.remove('show', 'visible', 'active');
  }

  function integrarVisualizacaoDeRota() {
    if (window.__veraVisualizarRotaComMinimizar) return;
    if (typeof window.visualizarRota !== 'function') return;

    const visualizarRotaOriginal = window.visualizarRota;
    window.visualizarRota = async function () {
      definirVisualizacaoMinimizada(false);
      return visualizarRotaOriginal.apply(this, arguments);
    };
    window.__veraVisualizarRotaComMinimizar = true;
  }

  function iniciar() {
    ocultarAvisoDeAtualizacao();
    instalarControleDeVisualizacao();
    integrarVisualizacaoDeRota();

    const observador = new MutationObserver(function () {
      ocultarAvisoDeAtualizacao();
    });
    observador.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
  }

  window.alternarVisualizacaoRota = alternarVisualizacao;
  window.definirVisualizacaoRotaMinimizada = definirVisualizacaoMinimizada;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  } else {
    iniciar();
  }
})();
