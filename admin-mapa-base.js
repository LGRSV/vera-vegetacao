(function () {
  'use strict';

  // Alternar a base do mapa do admin entre satélite (Google) e mapa de ruas
  // (OpenStreetMap).
  //
  // O base.html já trazia toggleAdminBase(), com as duas camadas prontas, mas
  // o botão que a chama (#btn-admin-base) nunca existiu em lugar nenhum do
  // markup — a função era código morto e o admin ficava preso no satélite.
  // Aqui só se cria o botão que faltava; a troca de camada continua sendo a
  // do app.
  //
  // O botão é um controle do Leaflet, não um botão da barra de ferramentas:
  // a tela cheia deixa o #admin-map fixo cobrindo a página inteira, e um
  // botão na barra ficaria atrás dele justamente quando mais se quer trocar
  // a base.

  if (window.__veraMapaBaseAdmin) return;
  window.__veraMapaBaseAdmin = true;

  var ID_BOTAO = 'btn-admin-base';
  var ID_ESTILO = 'vera-map-base-estilo';

  function mapaAdmin() {
    return (window.adminMap && window.L && window.adminMap instanceof window.L.Map) ? window.adminMap : null;
  }

  function garantirEstilo() {
    if (document.getElementById(ID_ESTILO)) return;
    var st = document.createElement('style');
    st.id = ID_ESTILO;
    st.textContent = ''
      + '.vera-base-btn{background:#fff;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.25);'
      + 'height:40px;padding:0 11px;display:flex;align-items:center;justify-content:center;gap:5px;'
      + 'cursor:pointer;font:700 12px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
      + 'color:#173b2b;border:0;white-space:nowrap;}'
      + '.vera-base-btn:active{background:#e8f0ea;}';
    document.head.appendChild(st);
  }

  // A legenda diz para onde o clique leva, não onde se está — é a mesma
  // convenção que o toggleAdminBase() do app já usa ao reescrever o texto.
  function alternar() {
    if (typeof window.toggleAdminBase !== 'function') return;
    if (!mapaAdmin()) {
      if (typeof showToast === 'function') showToast('Carregue os pontos primeiro para o mapa abrir.', '');
      return;
    }
    window.toggleAdminBase();
  }

  function instalar() {
    var mapa = mapaAdmin();
    var el = document.getElementById('admin-map');
    if (document.getElementById(ID_BOTAO)) return true;
    if (!mapa || !el || typeof window.toggleAdminBase !== 'function') return false;

    garantirEstilo();
    var Controle = window.L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        var caixa = window.L.DomUtil.create('div', 'leaflet-bar');
        caixa.style.cssText = 'border:0;box-shadow:none;background:transparent;margin-top:6px;';
        // O mapa nasce em satélite (adminBaseMode = 'sat'), então o primeiro
        // clique leva para o OpenStreetMap.
        caixa.innerHTML = '<button type="button" id="' + ID_BOTAO + '" class="vera-base-btn"'
          + ' title="Alternar entre satélite e mapa de ruas (OpenStreetMap)"'
          + ' aria-label="Alternar base do mapa">🗺 Mapa</button>';
        window.L.DomEvent.disableClickPropagation(caixa);
        setTimeout(function () {
          var b = document.getElementById(ID_BOTAO);
          if (b) b.addEventListener('click', alternar);
        }, 0);
        return caixa;
      }
    });
    new Controle().addTo(mapa);
    return true;
  }

  var tentativa = setInterval(function () { if (instalar()) clearInterval(tentativa); }, 600);
  setTimeout(function () { clearInterval(tentativa); }, 60000);

  // Mesma guarda do botão de tela cheia: se o painel admin for remontado, o
  // controle some junto com o mapa e precisa voltar. Agrupado a cada 400 ms
  // para não pesar rodando a cada mutação.
  var agendada = null;
  new MutationObserver(function () {
    if (agendada) return;
    agendada = setTimeout(function () {
      agendada = null;
      var el = document.getElementById('admin-map');
      if (el && !document.getElementById(ID_BOTAO) && mapaAdmin()) instalar();
    }, 400);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
