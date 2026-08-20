(function () {
  'use strict';

  // Rotação do mapa do técnico.
  //
  // O Leaflet 1.9 não gira o mapa. A abordagem aqui é cirúrgica: em vez de
  // girar o container (o que quebraria os controles e a conta de coordenada
  // de ponteiro), inserimos um wrapper ENTRE o container e o map-pane e
  // giramos só esse wrapper. Assim:
  //
  //   #map (container, NÃO gira)
  //     └── .vera-rot (gira)  ← wrapper novo
  //           └── .leaflet-map-pane (tiles, postes, cabos, popups)
  //     └── .leaflet-control-container (NÃO gira: zoom fica em pé)
  //
  // Os botões flutuantes (GPS, ＋, pílula de GPS) são irmãos do #map dentro
  // do #map-panel, então já ficam de fora da rotação sem precisar de nada.
  //
  // O que precisa de compensação, e por quê:
  //
  //   1. Arraste — o Leaflet soma o delta de tela direto na posição do
  //      map-pane. Com o pane girado, arrastar para a direita andaria na
  //      diagonal. Corrigido girando o delta por -θ.
  //   2. mouseEventToContainerPoint — usado por zoom na roda e duplo clique
  //      para ancorar no cursor. Corrigido desgirando o ponto em torno do
  //      centro do container.
  //   3. Tiles — o Leaflet carrega tiles só para o retângulo não girado; os
  //      cantos ficariam vazios. Corrigido expandindo o pedido até a
  //      diagonal.
  //   4. Renderers SVG — mesma coisa dos tiles: o padding precisa cobrir a
  //      diagonal, senão poste em canto some ao girar.
  //   5. Popups — ficam dentro do map-pane e girariam junto. Compensados por
  //      CSS em torno da ponta (bottom center), que é onde ancoram no poste.
  //
  // NÃO mexe em clique de poste: o hit-test de SVG é do próprio navegador e
  // já respeita o transform. E o app não tem map.on('click'), então não há
  // marcação por coordenada de mapa para desalinhar.
  //
  // Tudo é no-op enquanto o ângulo for 0, e nada disso alcança o mapa do
  // admin: cada patch confere se o alvo é o mapa do técnico girado.

  if (window.__veraMapaRotacao) return;
  window.__veraMapaRotacao = true;

  var L = null;
  var mapa = null;         // instância Leaflet do mapa do técnico
  var wrapper = null;      // div que gira
  var angulo = 0;          // graus, sentido horário
  var seguindoBussola = false;
  var botao = null;
  var agulha = null;
  var patchesAplicados = false;

  function rad(g) { return g * Math.PI / 180; }

  function mapaCampo() {
    try {
      if (typeof map !== 'undefined' && map && window.L && map instanceof window.L.Map) return map;
    } catch (e) {}
    return null;
  }

  // ── desgira um ponto (dx,dy) medido a partir do centro ──
  function desgirar(dx, dy) {
    var a = rad(-angulo), c = Math.cos(a), s = Math.sin(a);
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  }

  // ── patches no Leaflet, aplicados uma única vez ──
  function aplicarPatches() {
    if (patchesAplicados || !L) return;
    patchesAplicados = true;

    // 1. arraste: gira o delta de tela para o espaço não girado.
    //    O Leaflet calcula offset = clientPos - _startPoint. Reescrevendo
    //    _startPoint a cada movimento, o offset já sai desgirado sem
    //    precisar forjar um evento (que quebraria o preventDefault).
    var onMove = L.Draggable.prototype._onMove;
    L.Draggable.prototype._onMove = function (e) {
      if (angulo && mapa && this._element === mapa._mapPane && this._startPoint &&
          !(e.touches && e.touches.length > 1)) {
        if (!this.__veraOrigem) this.__veraOrigem = this._startPoint.clone();
        var t = (e.touches && e.touches.length === 1) ? e.touches[0] : e;
        var d = desgirar(t.clientX - this.__veraOrigem.x, t.clientY - this.__veraOrigem.y);
        this._startPoint.x = t.clientX - d.x;
        this._startPoint.y = t.clientY - d.y;
        // O Leaflet divide o deslocamento por _parentScale, que ele mede pela
        // caixa delimitadora do pai. Com o wrapper girado essa caixa cresce
        // (a 40° num 430x760 dá 1,90 x 1,13) e o arraste sairia encurtado.
        // Não há escala de verdade aqui, então zeramos o fator.
        this._parentScale = L.point(1, 1);
      }
      return onMove.call(this, e);
    };
    var onDown = L.Draggable.prototype._onDown;
    L.Draggable.prototype._onDown = function (e) {
      this.__veraOrigem = null;
      return onDown.call(this, e);
    };
    var onUp = L.Draggable.prototype._onUp;
    L.Draggable.prototype._onUp = function (e) {
      this.__veraOrigem = null;
      return onUp.call(this, e);
    };

    // 2. ponto do ponteiro dentro do container
    var mepc = L.Map.prototype.mouseEventToContainerPoint;
    L.Map.prototype.mouseEventToContainerPoint = function (e) {
      var p = mepc.call(this, e);
      if (!angulo || this !== mapa) return p;
      var c = this._container;
      var cx = c.offsetWidth / 2, cy = c.offsetHeight / 2;
      var d = desgirar(p.x - cx, p.y - cy);
      return new L.Point(d.x + cx, d.y + cy);
    };

    // 3. tiles até a diagonal
    var tiled = L.GridLayer.prototype._getTiledPixelBounds;
    L.GridLayer.prototype._getTiledPixelBounds = function (centro) {
      var b = tiled.call(this, centro);
      if (!angulo || !mapa || this._map !== mapa) return b;
      var s = this._map.getSize();
      var diag = Math.sqrt(s.x * s.x + s.y * s.y);
      var ex = (diag - s.x) / 2, ey = (diag - s.y) / 2;
      return new L.Bounds(b.min.subtract([ex, ey]), b.max.add([ex, ey]));
    };
  }

  // ── padding dos renderers: precisa cobrir a diagonal ──
  function ajustarRenderers(ligado) {
    if (!mapa || !L) return;
    var s;
    try { s = mapa.getSize(); } catch (e) { return; }
    if (!s || !s.x || !s.y) return;
    var diag = Math.sqrt(s.x * s.x + s.y * s.y);
    // o eixo mais curto é o que estoura primeiro
    var necessario = Math.max((diag - s.x) / 2 / s.x, (diag - s.y) / 2 / s.y);
    var alvo = ligado ? Math.ceil((necessario + 0.05) * 20) / 20 : null;

    var vistos = [];
    function trata(r) {
      if (!r || !(r instanceof L.Renderer) || vistos.indexOf(r) >= 0) return;
      vistos.push(r);
      if (ligado) {
        if (r.__veraPadding == null) r.__veraPadding = r.options.padding;
        if (r.options.padding < alvo) r.options.padding = alvo;
      } else if (r.__veraPadding != null) {
        r.options.padding = r.__veraPadding;
        r.__veraPadding = null;
      }
      try { if (r._update) r._update(); } catch (e) {}
    }
    try { mapa.eachLayer(function (l) { trata(l); }); } catch (e) {}
    trata(mapa._renderer);
    ['postesRenderer', 'caboRendererT1', 'caboRendererT2'].forEach(function (n) {
      try { if (window[n]) trata(window[n]); } catch (e) {}
    });
  }

  // ── monta o wrapper que gira ──
  function montar() {
    var m = mapaCampo();
    if (!m || !m._container || !m._mapPane) return false;
    if (wrapper && wrapper.parentNode === m._container) return true;

    L = window.L;
    mapa = m;
    wrapper = document.createElement('div');
    wrapper.className = 'vera-rot';
    m._mapPane.parentNode.insertBefore(wrapper, m._mapPane);
    wrapper.appendChild(m._mapPane);
    aplicarPatches();
    return true;
  }

  function aplicarAngulo() {
    if (!wrapper) return;
    wrapper.style.transform = angulo ? 'rotate(' + angulo + 'deg)' : '';
    document.documentElement.style.setProperty('--vera-contra-rot', (-angulo) + 'deg');
    if (botao) botao.classList.toggle('girado', !!angulo || seguindoBussola);
    if (agulha) agulha.style.transform = 'rotate(' + (-angulo) + 'deg)';
  }

  function girar(g, forcarRedraw) {
    var antes = angulo;
    angulo = ((g % 360) + 360) % 360;
    if (angulo > 180) angulo -= 360;
    aplicarAngulo();
    if (!antes !== !angulo || forcarRedraw) {
      ajustarRenderers(!!angulo);
      try { if (mapa && mapa._resetView) mapa._resetView(mapa.getCenter(), mapa.getZoom(), true); } catch (e) {}
    }
  }

  // ── seguir a bússola do aparelho ──
  var timerBussola = null;
  function alternarBussola(ligar) {
    seguindoBussola = ligar;
    if (timerBussola) { clearInterval(timerBussola); timerBussola = null; }
    if (!ligar) { aplicarAngulo(); return; }
    try { if (typeof iniciarBussola === 'function') iniciarBussola(); } catch (e) {}
    timerBussola = setInterval(function () {
      if (!seguindoBussola) return;
      var h = null;
      try { if (typeof bussolaHeading === 'number') h = bussolaHeading; } catch (e) {}
      if (h == null || !isFinite(h)) return;
      // para o que está à frente ficar em cima, o mapa gira ao contrário
      var novo = -h;
      var dif = Math.abs(((novo - angulo + 540) % 360) - 180);
      if (dif >= 2) girar(novo);
    }, 300);
    aplicarAngulo();
  }

  // ── gesto de dois dedos ──
  function ligarGesto() {
    if (!mapa || !mapa._container || mapa._container.__veraGesto) return;
    var alvo = mapa._container;
    alvo.__veraGesto = true;
    var base = null, anguloBase = 0;

    function anguloDosDedos(t) {
      return Math.atan2(t[1].clientY - t[0].clientY, t[1].clientX - t[0].clientX) * 180 / Math.PI;
    }
    alvo.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) { base = anguloDosDedos(e.touches); anguloBase = angulo; }
    }, { passive: true });
    alvo.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 2 || base == null) return;
      var d = anguloDosDedos(e.touches) - base;
      if (Math.abs(d) < 8 && !seguindoBussola && angulo === anguloBase) return; // ignora tremida
      if (seguindoBussola) alternarBussola(false);
      girar(anguloBase + d);
    }, { passive: true });
    alvo.addEventListener('touchend', function (e) {
      if (e.touches.length < 2) base = null;
    }, { passive: true });
  }

  // ── botão bússola, ao lado dos outros FABs ──
  function montarBotao() {
    var painel = document.getElementById('map-panel');
    if (!painel || document.getElementById('vera-btn-bussola')) return;

    var css = document.createElement('style');
    css.textContent =
      '.vera-rot{width:100%;height:100%;transform-origin:50% 50%;will-change:transform;}' +
      '#vera-btn-bussola{position:absolute;bottom:82px;right:14px;z-index:801;width:44px;height:44px;' +
      'border-radius:50%;border:1px solid rgba(0,0,0,.12);background:#fff;color:#1a2e1a;cursor:pointer;' +
      'display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.22);' +
      'font-family:inherit;padding:0;touch-action:none;}' +
      '#vera-btn-bussola.girado{background:#2d5a27;color:#fff;}' +
      '#vera-btn-bussola.bussola{background:#e8a020;color:#fff;}' +
      '#vera-agulha{font-size:19px;line-height:1;transition:transform .12s linear;pointer-events:none;}' +
      '#vera-dica-rot{position:absolute;bottom:134px;right:14px;z-index:801;background:rgba(26,46,26,.92);' +
      'color:#fff;font-size:11px;padding:5px 9px;border-radius:8px;max-width:190px;line-height:1.35;' +
      'box-shadow:0 3px 10px rgba(0,0,0,.25);display:none;}' +
      // popup fica em pé: compensa em torno da ponta, que é onde ancora
      '.leaflet-popup-content-wrapper,.leaflet-popup-tip-container{' +
      'transform:rotate(var(--vera-contra-rot,0deg));transform-origin:50% 100%;}';
    document.head.appendChild(css);

    botao = document.createElement('button');
    botao.id = 'vera-btn-bussola';
    botao.title = 'Girar o mapa — toque para voltar ao norte, segure para seguir a bússola';
    botao.innerHTML = '<span id="vera-agulha">🧭</span>';
    painel.appendChild(botao);
    agulha = document.getElementById('vera-agulha');

    var dica = document.createElement('div');
    dica.id = 'vera-dica-rot';
    painel.appendChild(dica);
    function avisar(txt) {
      dica.textContent = txt;
      dica.style.display = 'block';
      clearTimeout(dica.__t);
      dica.__t = setTimeout(function () { dica.style.display = 'none'; }, 2600);
    }

    // arrastar sobre o botão gira; toque simples volta ao norte;
    // toque longo liga/desliga o seguir-bússola.
    var arrastando = false, moveu = false, xIni = 0, angIni = 0, timerLongo = null;

    function inicio(x) {
      arrastando = true; moveu = false; xIni = x; angIni = angulo;
      timerLongo = setTimeout(function () {
        if (moveu) return;
        arrastando = false;
        alternarBussola(!seguindoBussola);
        botao.classList.toggle('bussola', seguindoBussola);
        avisar(seguindoBussola
          ? 'Mapa seguindo a bússola do aparelho.'
          : 'Bússola desligada. O mapa parou de girar sozinho.');
      }, 550);
    }
    function move(x) {
      if (!arrastando) return;
      var d = x - xIni;
      if (Math.abs(d) < 4) return;
      moveu = true;
      clearTimeout(timerLongo);
      if (seguindoBussola) { alternarBussola(false); botao.classList.remove('bussola'); }
      girar(angIni + d * 1.2);
    }
    function fim() {
      clearTimeout(timerLongo);
      if (!arrastando) return;
      arrastando = false;
      if (moveu) return;
      if (angulo) { girar(0); avisar('Mapa de volta ao norte.'); }
      else avisar('Arraste este botão para girar. Segure para seguir a bússola.');
    }

    botao.addEventListener('mousedown', function (e) { e.preventDefault(); inicio(e.clientX); });
    window.addEventListener('mousemove', function (e) { move(e.clientX); });
    window.addEventListener('mouseup', fim);
    botao.addEventListener('touchstart', function (e) { inicio(e.touches[0].clientX); }, { passive: true });
    botao.addEventListener('touchmove', function (e) { move(e.touches[0].clientX); }, { passive: true });
    botao.addEventListener('touchend', fim);

    window.veraGirarMapa = girar;           // usado pelos testes
    window.veraAnguloMapa = function () { return angulo; };
  }

  var timerMontagem = null;

  function tentar() {
    if (!montar()) return false;
    montarBotao();
    ligarGesto();
    aplicarAngulo();
    // montou: nenhum timer nosso fica rodando no aparelho dele.
    if (timerMontagem) { clearInterval(timerMontagem); timerMontagem = null; }
    return true;
  }

  // O mapa do técnico só nasce quando ele abre a aba Mapa, e isso pode
  // demorar o quanto ele quiser. Em vez de deixar um timer eterno (que foi
  // justamente o que a 2.6.38 tirou daqui por causa de bateria), a montagem
  // fica pendurada na troca de aba, com um punhado de tentativas no começo
  // só para o caso de a aba já estar aberta no carregamento.
  function pendurarNaAba() {
    if (typeof window.switchTab !== 'function' || window.switchTab.__veraRot) return false;
    var orig = window.switchTab;
    window.switchTab = function (nome) {
      var r = orig.apply(this, arguments);
      if (nome === 'map') setTimeout(tentar, 300);
      return r;
    };
    window.switchTab.__veraRot = true;
    return true;
  }

  if (!tentar()) {
    var voltas = 0;
    timerMontagem = setInterval(function () {
      voltas++;
      pendurarNaAba();
      if (tentar() || voltas > 40) {   // ~50 s procurando o switchTab
        if (timerMontagem) { clearInterval(timerMontagem); timerMontagem = null; }
      }
    }, 1200);
  }
  pendurarNaAba();
})();
