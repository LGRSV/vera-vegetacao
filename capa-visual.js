(function () {
  'use strict';

  // Nova capa (tela de login) — visual moderno com gradiente e card de vidro,
  // coerente com a tela de carregamento (index.html). O app real é montado via
  // document.write, então os patches de markup do loader não o alcançam:
  // injetamos os estilos e o emblema em runtime.

  const MARCA_SVG =
    '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M25 7C15 10 9 19 10 31c0 1 .4 2 .9 3C22 33 31 26 35 16c1.6-4 1.4-7 .6-10-3.8 1-7.4 1.6-11.2 1z" fill="#6fce6a" fill-opacity=".22"/>' +
    '<path d="M11 34C13 22 19 13 30 9" stroke="#9fe89a" stroke-width="2.2" stroke-linecap="round"/>' +
    '<g stroke="#7fdb79" stroke-width="1.6" stroke-linecap="round"><path d="M22.5 15.5l6-4.5"/><path d="M16.5 24l6-5"/><path d="M12 33l5-6.5"/></g>' +
    '<g fill="#c8f7c0"><circle cx="30" cy="9" r="2.6"/><circle cx="22.5" cy="15.5" r="2"/><circle cx="16.5" cy="24" r="2"/><circle cx="12" cy="33" r="2.4"/></g>' +
    '</svg>';

  const CSS = [
    '#login-screen{',
    '  background:#0d1a12!important;',
    '  background:radial-gradient(120% 80% at 50% -10%,rgba(76,175,80,.28),transparent 60%),',
    '    radial-gradient(90% 60% at 50% 120%,rgba(45,90,39,.35),transparent 60%),',
    '    linear-gradient(160deg,#14261a 0%,#0d1a12 55%,#0a140e 100%)!important;',
    '}',
    '.login-card{',
    '  background:rgba(255,255,255,.06)!important;',
    '  border:1px solid rgba(255,255,255,.12)!important;',
    '  border-radius:24px!important;',
    '  box-shadow:0 24px 70px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08)!important;',
    '  backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);',
    '  padding:34px 28px!important;',
    '}',
    '.login-card .login-icon{',
    '  width:74px!important;height:74px!important;padding:0!important;border-radius:20px!important;',
    '  background:linear-gradient(150deg,#2f6d33,#173d1e)!important;',
    '  box-shadow:0 10px 26px rgba(20,50,25,.55),inset 0 1px 0 rgba(255,255,255,.18)!important;',
    '  font-size:0!important;letter-spacing:0!important;color:transparent!important;margin:0 auto 18px!important;',
    '}',
    '.login-card .login-icon svg{width:40px;height:40px;display:block;}',
    '.login-card .login-title{color:#fff!important;font-size:26px!important;font-weight:800!important;letter-spacing:.14em!important;}',
    '.login-card .login-subtitle{color:#a8d5a2!important;}',
    '#login-screen .field-label{color:#bcd8b6!important;}',
    '#login-screen .field-input{',
    '  background:rgba(255,255,255,.94)!important;',
    '  border:1.5px solid rgba(255,255,255,.22)!important;color:#14261a!important;',
    '}',
    '#login-screen .field-input:focus{border-color:#6fce6a!important;background:#fff!important;box-shadow:0 0 0 3px rgba(111,206,106,.25)!important;}',
    '#login-screen .btn-primary{',
    '  background:linear-gradient(135deg,#4CAF50,#2d5a27)!important;',
    '  border-radius:12px!important;padding:14px!important;font-weight:700!important;',
    '  box-shadow:0 10px 24px rgba(76,175,80,.32)!important;',
    '}',
    '#login-screen .btn-primary:hover{filter:brightness(1.07);}',
    '#login-screen .btn-primary:active{transform:scale(.985);}',
    // chip de versão logo abaixo do subtítulo
    '#login-screen .login-subtitle + div{color:rgba(168,213,162,.55)!important;}'
  ].join('\n');

  function injetarEstilos() {
    if (document.getElementById('vera-capa-estilos')) return;
    const st = document.createElement('style');
    st.id = 'vera-capa-estilos';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function aplicarEmblema() {
    const icon = document.querySelector('#login-screen .login-icon');
    if (icon && !icon.querySelector('svg')) {
      icon.textContent = '';
      icon.innerHTML = MARCA_SVG;
    }
  }

  function aplicar() {
    injetarEstilos();
    aplicarEmblema();
  }

  aplicar();
  // A tela de login pode ser (re)montada após o boot; tenta de novo por segurança.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aplicar);
  }
  setTimeout(aplicar, 300);
  setTimeout(aplicar, 1200);
})();
