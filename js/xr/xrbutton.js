/* ================================================================
   BOTÃO DE VR — política pura + camada fina de DOM (mesma divisão do
   js/perfhud.js).

   Regra: o botão só aparece pra quem pode usar. Um "ENTRAR EM VR" morto
   no menu de quem joga no PC é ruído puro.

   A exceção veio de campo: num HEADSET servido sem contexto seguro — o
   clássico servidor local aberto pelo IP da rede — `navigator.xr`
   simplesmente não existe. Sem tratamento o botão sumiria calado e o
   jogador com o aparelho na cabeça concluiria que o jogo não tem VR.
   Nesse caso ele aparece DESABILITADO, dizendo o que fazer.
   ================================================================ */

export const XR_LABEL_ENTRAR = '🥽  ENTRAR EM VR';
export const XR_LABEL_SAIR = '🥽  SAIR DO VR';

/* Política. `supported` é a resposta (assíncrona) de
   `isSessionSupported('immersive-vr')`; `env` vem do js/xr/xrenv.js. */
export function xrButtonState({ env, supported = false, presenting = false } = {}) {
  const e = env && typeof env === 'object' && !Array.isArray(env) ? env : {};
  if (supported) {
    return {
      show: true, enabled: true,
      label: presenting ? XR_LABEL_SAIR : XR_LABEL_ENTRAR,
      reason: e.reason || '',
    };
  }
  if (e.device === true) {
    // é headset e mesmo assim não dá: o motivo é acionável, então mostra
    return {
      show: true, enabled: false,
      label: 'VR INDISPONÍVEL',
      reason: e.reason || 'sessão immersive-vr indisponível',
    };
  }
  return { show: false, enabled: false, label: XR_LABEL_ENTRAR, reason: e.reason || '' };
}

/* ---- camada fina de DOM ----
   Nasce sob demanda e some quando a política diz que não é pra estar lá.
   Estilo inline pelo mesmo motivo do perfhud: o botão não pode depender
   de outra frente mexer no style.css. */
export function createXrButton({ doc = document, parent, onClick } = {}) {
  let el = null;

  function ensure() {
    if (el) return el;
    el = doc.createElement('div');
    el.id = 'btnVR';
    el.className = 'mbtn sec';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.addEventListener('click', () => { if (!el.classList.contains('disabled')) onClick && onClick(); });
    (parent || doc.body).appendChild(el);
    return el;
  }

  function apply(state) {
    if (!state.show) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
      el = null;
      return null;
    }
    const node = ensure();
    node.textContent = state.label;
    node.title = state.reason || '';
    node.classList.toggle('disabled', !state.enabled);
    node.setAttribute('aria-disabled', state.enabled ? 'false' : 'true');
    return node;
  }

  return { apply, get el() { return el; } };
}
