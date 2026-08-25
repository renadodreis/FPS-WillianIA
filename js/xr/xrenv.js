/* ================================================================
   AMBIENTE XR — módulo PURO (sem DOM, sem three).

   Mesma forma do js/mobile.js: a lógica recebe TODO o ambiente por
   parâmetro e o wrapper fino no fim é o único que lê `navigator` e
   `window`. Assim dá pra testar headset sem headset.

   DUAS PERGUNTAS, DE PROPÓSITO SEPARADAS:

     `device` — "isto é um navegador de headset?". É SÍNCRONO e decide o
       preset de CFG (alcance, sombra) ANTES do worldgen, igual ao corte
       de celular. Adivinhar depois é tela travada no boot.

     `api` — "dá pra abrir sessão WebXR?". Exige `navigator.xr` E
       contexto seguro. É quem decide se o botão de VR existe.

   Por que não é a mesma pergunta: o jeito mais comum de testar no
   aparelho é `npm start` + IP da rede local, e nesse caso `navigator.xr`
   NÃO EXISTE (WebXR só vive em contexto seguro: HTTPS ou localhost).
   Um Quest servido por http:// continua sendo um Quest — o preset de
   qualidade tem que valer, e o motivo da ausência do botão precisa dizer
   "falta contexto seguro", não sumir calado.

   `api` é POTENCIAL, não garantia: quem confirma que existe um headset
   plugado é `navigator.xr.isSessionSupported('immersive-vr')`, que é
   assíncrono e por isso mora na camada de sessão, não aqui.
   ================================================================ */

/* tokens de UA que só aparecem em navegador de headset */
export const XR_UA_RE = /oculusbrowser|quest \d|pico browser|\bwolvic\b/i;

/* `?xr=1` força ligado, `?xr=0` força desligado, sem parâmetro (ou com
   valor que não seja 0/1) devolve null. Mesmo formato do
   `mobileOverrideFrom` (js/mobile.js) e do `tierOverrideFrom`
   (js/gputier.js) — inclusive na âncora `[?&]`, que é o que impede
   `?xrole=1` de virar `?xr=1`. */
export function xrOverrideFrom(search) {
  const m = /[?&]xr=([01])(?:&|$)/i.exec(String(search || ''));
  return m ? m[1] === '1' : null;
}

/* Núcleo puro. Aceita QUALQUER lixo sem lançar: uma exceção aqui mataria
   o boot antes do primeiro frame. */
export function detectXr(env) {
  const e = env && typeof env === 'object' && !Array.isArray(env) ? env : {};
  const ua = typeof e.userAgent === 'string' ? e.userAgent : '';
  const hasXr = e.hasXr === true;          // só o booleano vale
  const secure = e.secureContext === true;
  const forced = xrOverrideFrom(e.search);

  if (forced === false) return { device: false, api: false, reason: 'forçado por ?xr=0' };

  const device = forced === true || XR_UA_RE.test(ua);
  const api = hasXr && secure;

  if (!api) {
    // a distinção importa pro suporte: um é "arruma a URL", o outro é
    // "troca de navegador"
    const reason = !secure
      ? 'WebXR exige contexto seguro (HTTPS ou localhost)'
      : 'navegador sem WebXR (navigator.xr ausente)';
    return { device, api: false, reason };
  }
  if (forced === true) return { device: true, api: true, reason: 'forçado por ?xr=1' };
  return {
    device, api: true,
    reason: device ? 'navegador de headset com WebXR' : 'WebXR disponível, mas não é um headset',
  };
}

/* ---- wrapper fino: o único lugar que toca no navegador de verdade ---- */
export function xrEnv(win = typeof window === 'undefined' ? undefined : window) {
  const nav = win && win.navigator ? win.navigator : {};
  return detectXr({
    hasXr: !!nav.xr,
    secureContext: win ? win.isSecureContext === true : false,
    userAgent: nav.userAgent || '',
    search: win && win.location ? win.location.search : '',
  });
}

/* Atalho pra quem só quer saber se aplica o preset de VR (espelha o
   `isMobileEnv()` do js/mobile.js). */
export const isXrDeviceEnv = win => xrEnv(win).device;
