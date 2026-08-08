/* ================================================================
   DETECÇÃO DE DISPOSITIVO MÓVEL — módulo PURO (sem DOM, sem three).

   Por que existe: o preset de qualidade e os controles do celular
   precisam ser escolhidos ANTES do primeiro frame (renderer, pós,
   sombra). Adivinhar depois é tela travada no boot.

   A lógica recebe TODO o ambiente por parâmetro (mesmo padrão do
   js/gputier.js, que recebe `gl` e `search`): assim ela é testável sem
   navegador. Quem lê `navigator`/`window` de verdade é só o wrapper
   `mobileEnv()` no fim do arquivo.

   Ordem das regras, da mais confiável pra menos:
     1. `?mobile=1` / `?mobile=0` vence TUDO. QA e suporte precisam
        reproduzir o modo celular num desktop e escapar de uma detecção
        errada sem esperar release.
     2. iPadOS >= 13 MENTE no user-agent: diz "Macintosh". O par
        (platform `MacIntel` + `maxTouchPoints > 1`) é a única pista que
        sobrou — sem ela todo iPad entra como desktop.
     3. token conhecido no user-agent.
     4. toque + ponteiro grosso + tela pequena (Android de fabricante
        obscuro, com UA que não diz nada).
     5. nada disso => desktop.

   REGRA QUE NÃO PODE CAIR: touch NÃO é sinônimo de celular. Notebook
   Windows com tela de toque tem `maxTouchPoints = 10` e GPU dedicada —
   classificar por toque puro entregaria controles de toque e preset
   cortado pra quem não precisa. Por isso a regra 4 exige as TRÊS peças.
   ================================================================ */

/* tokens de UA que só aparecem em aparelho móvel de verdade */
export const MOBILE_UA_RE = /android|iphone|ipad|ipod|windows phone|iemobile|blackberry|opera mini/i;

/* Limites em CSS px do MENOR lado da tela (o menor lado não muda quando o
   aparelho gira, então a classificação é estável em paisagem e retrato). */
export const TABLET_MIN_SIDE = 600;   // >= isto, com UA móvel, é tablet
export const COARSE_MAX_SIDE = 900;   // acima disto, toque+ponteiro grosso é all-in-one/notebook

const num = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/* menor lado conhecido; 0 = tela desconhecida (não dá pra decidir por tamanho) */
function minSide(w, h) {
  const a = num(w), b = num(h);
  if (a && b) return Math.min(a, b);
  return a || b;
}

/* tela desconhecida cai em `phone`: é o layout mais apertado, e apertado
   demais só incomoda — largo demais corta HUD fora da tela */
const kindBySize = side => (side >= TABLET_MIN_SIDE ? 'tablet' : 'phone');

/* `?mobile=1` força ligado, `?mobile=0` força desligado, sem parâmetro (ou
   com valor que não seja 0/1) devolve null. Mesmo formato do
   `tierOverrideFrom` do js/gputier.js. */
export function mobileOverrideFrom(search) {
  const m = /[?&]mobile=([01])(?:&|$)/i.exec(String(search || ''));
  return m ? m[1] === '1' : null;
}

/* Núcleo puro. Aceita QUALQUER lixo (localStorage/UA corrompido, campos
   ausentes, `undefined`) sem lançar: uma exceção aqui mataria o boot.
   `search` é opcional — passando, o override de query manda. */
export function detectMobile(env) {
  const e = env && typeof env === 'object' && !Array.isArray(env) ? env : {};

  const forced = mobileOverrideFrom(e.search);
  const ua = typeof e.userAgent === 'string' ? e.userAgent : '';
  const platform = typeof e.platform === 'string' ? e.platform : '';
  const touch = num(e.maxTouchPoints);
  const side = minSide(e.screenW, e.screenH);
  const coarse = e.matchesCoarse === true; // só o booleano vale: 'sim' não é sinal

  if (forced === false) return { mobile: false, kind: 'desktop', reason: 'forçado por ?mobile=0' };
  if (forced === true) {
    return { mobile: true, kind: kindBySize(side), reason: 'forçado por ?mobile=1' };
  }

  // iPadOS moderno: o UA é idêntico ao de um Mac; o toque é o que denuncia
  if (platform === 'MacIntel' && touch > 1) {
    return { mobile: true, kind: 'tablet',
      reason: 'iPadOS moderno (platform MacIntel com toque; o UA mente e diz "Macintosh")' };
  }

  if (MOBILE_UA_RE.test(ua)) {
    if (/ipad/i.test(ua)) return { mobile: true, kind: 'tablet', reason: 'UA de tablet (iPad)' };
    if (/iphone|ipod/i.test(ua)) return { mobile: true, kind: 'phone', reason: 'UA de celular (iPhone/iPod)' };
    return { mobile: true, kind: kindBySize(side), reason: 'UA de dispositivo móvel' };
  }

  /* Android genérico sem token no UA. As TRÊS peças são obrigatórias: notebook
     com tela de toque tem as duas primeiras e é desktop. */
  if (touch > 0 && coarse && side > 0 && side < COARSE_MAX_SIDE) {
    return { mobile: true, kind: kindBySize(side),
      reason: `toque + ponteiro grosso + menor lado da tela em ${side} px` };
  }

  return { mobile: false, kind: 'desktop',
    reason: touch > 0 ? 'tem toque, mas tela/ponteiro de desktop (notebook touchscreen)'
      : 'sem sinal de dispositivo móvel' };
}

/* ---- wrapper fino: o ÚNICO ponto que lê o ambiente real ----
   `nav`/`win` são injetáveis pra teste. Sem eles usa o global; sem global
   (node, worker) responde desktop em vez de lançar. */
/* navegador antigo sem matchMedia, ou implementação que explode: não é motivo
   pra derrubar o boot — o UA já cobre a maioria dos aparelhos */
function coarsePointer(w) {
  try {
    return typeof w.matchMedia === 'function' && !!w.matchMedia('(pointer: coarse)').matches;
  } catch { return false; }
}

export function mobileEnv(nav, win) {
  const n = nav || (typeof navigator !== 'undefined' ? navigator : null) || {};
  const w = win || (typeof window !== 'undefined' ? window : null) || {};
  const screen = w.screen || {};
  return detectMobile({
    userAgent: n.userAgent,
    maxTouchPoints: n.maxTouchPoints,
    platform: n.platform,
    screenW: screen.width,
    screenH: screen.height,
    matchesCoarse: coarsePointer(w),
    search: (w.location && w.location.search) || '',
  });
}

/* só o booleano, pra quem não precisa do motivo */
export function isMobileEnv(nav, win) {
  return mobileEnv(nav, win).mobile;
}
