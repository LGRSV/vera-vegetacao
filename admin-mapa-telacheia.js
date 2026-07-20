(function () {
  'use strict';

  // Botao de tela cheia no mapa do admin.
  // Expansao via CSS fixo (funciona inclusive no iPhone, onde requestFullscreen
  // de elementos nao existe) + invalidateSize para o Leaflet redesenhar.
  if (window.__veraMapaTelaCheia) return;
  window.__veraMapaTelaCheia = true;

  var ID_ESTILO = 'vera-map-fs-estilo';
  var CLASSE = 'vera-map-fs';

  function garantirEstilo() {
    if (document.getElementById(ID_ESTILO)) return;
    var st = document.createElement('style');
    st.id = ID_ESTILO;
    st.textContent = ''
      + '#admin-map.' + CLASSE + '{position:fixed!important;inset:0!important;width:100vw!important;'
      + 'height:100vh!important;height:100dvh!important;z-index:99990!important;border-radius:0!important;'
      + 'padding-top:env(safe-area-inset-top)!important;padding-bottom:env(safe-area-inset-bottom)!important;}'
      + 'body.' + CLASSE + '-aberto{overflow:hidden!important;}'
      + '.vera-fs-btn{background:#fff;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.25);'
      + 'width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;'
      + 'font-size:19px;color:#173b2b;border:0;}'
      + '.vera-fs-btn:active{background:#e8f0ea;}';
    document.head.appendChild(st);
  }

  function mapaAdmin() {
    return (window.adminMap && window.L && window.adminMap instanceof window.L.Map) ? window.adminMap : null;
  }

  function alternar() {
    var el = document.getElementById('admin-map');
    var mapa = mapaAdmin();
    if (!el) return;
    var aberto = el.classList.toggle(CLASSE);
    document.body.classList.toggle(CLASSE + '-aberto', aberto);
    var botao = document.getElementById('vera-fs-botao');
    if (botao) {
      botao.textContent = aberto ? '✕' : '⛶';
      botao.title = aberto ? 'Sair da tela cheia' : 'Mapa em tela cheia';
    }
    // Leaflet precisa recalcular o tamanho depois que o container muda.
    if (mapa) setTimeout(function () { try { mapa.invalidateSize(); } catch (e) {} }, 260);
  }

  function sairComEsc(ev) {
    if (ev.key !== 'Escape') return;
    var el = document.getElementById('admin-map');
    if (el && el.classList.contains(CLASSE)) alternar();
  }

  function instalar() {
    var mapa = mapaAdmin();
    var el = document.getElementById('admin-map');
    if (!mapa || !el || document.getElementById('vera-fs-botao')) return !!document.getElementById('vera-fs-botao');

    garantirEstilo();
    var Controle = window.L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        var caixa = window.L.DomUtil.create('div', 'leaflet-bar');
        caixa.style.cssText = 'border:0;box-shadow:none;background:transparent;';
        caixa.innerHTML = '<button type="button" id="vera-fs-botao" class="vera-fs-btn" title="Mapa em tela cheia" aria-label="Mapa em tela cheia">⛶</button>';
        window.L.DomEvent.disableClickPropagation(caixa);
        setTimeout(function () {
          var b = document.getElementById('vera-fs-botao');
          if (b) b.addEventListener('click', alternar);
        }, 0);
        return caixa;
      }
    });
    new Controle().addTo(mapa);
    document.addEventListener('keydown', sairComEsc);
    return true;
  }

  var tentativa = setInterval(function () { if (instalar()) clearInterval(tentativa); }, 600);
  setTimeout(function () { clearInterval(tentativa); }, 60000);

  // Se o admin for reaberto/recriado, reinstala o botao. Agrupado a cada
  // 400ms: rodar em toda mutacao de DOM pesava no aparelho do tecnico.
  var mutacaoAgendada = null;
  new MutationObserver(function () {
    if (mutacaoAgendada) return;
    mutacaoAgendada = setTimeout(function () {
      mutacaoAgendada = null;
      var el = document.getElementById('admin-map');
      if (el && !document.getElementById('vera-fs-botao') && mapaAdmin()) instalar();
    }, 400);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
