/* ================================================================
   PRESET DE QUALIDADE DA SESSÃO XR.

   O PROBLEMA, medido em sessão imersiva: 806 draw calls e 2,03 M
   triângulos em estéreo, contra tetos de 180 e 500 k. O headset tem que
   desenhar DUAS vezes por frame, a 72 Hz, num Snapdragon — e o mesmo
   quadro que o desktop entrega folgado não cabe.

   O QUE ESTE MÓDULO NÃO FAZ, e é o mais importante:

   1. **Não corta conteúdo do jogo.** Tudo aqui é aplicado ao ENTRAR na
      sessão e DESFEITO ao sair. Preset que vaza para o desktop é
      regressão de PC, e a versão de PC não pode regredir.

   2. **Não encosta em nada que alimente o `Math.random` seedado.**
      GRASS_TOTAL, GRASS_CHUNKS, TREE_COUNT, ROCK_COUNT, FLOWER_COUNT,
      TERRAIN_SEGS e ENEMY_COUNT são tetos de laços que sorteiam posição:
      mexer neles põe quem está de headset num mundo DIFERENTE do dos
      outros jogadores da mesma partida (js/config.js documenta cada um).

   3. **Não rala grama nem encurta alcance de visão.** Grama mais rala é
      wallhack contra quem está deitado no mato, e há teste travando isso
      (test/render-quality.test.js). Vantagem de quem usa headset não é
      otimização, é defeito de projeto.

   O QUE SOBRA, e de onde vem cada número (censo por subtração,
   `npm run vr:censo`, mono, pose de spawn):

     frame sem sombra ....... 198 draw calls · 0,65 M tris
     custo das 4 cascatas ... +42 draw calls · +0,16 M tris   ← 17,5%

   A sombra é a maior fatia configurável, e as duas cascatas distantes são
   as que menos aparecem e mais custam: cobrem a maior área com a mesma
   resolução de mapa. Desligá-las é o corte com melhor razão entre o que
   se ganha e o que se perde — e o CSM já nasce com as luzes criadas, então
   dá para religar na saída sem reconstruir nada.

   O framebuffer da sessão é o outro botão: `setFramebufferScaleFactor` é
   o equivalente XR do `setPixelRatio`, que em XR vira no-op com aviso.
   ================================================================ */

/* Política pura: dado o alvo, quais botões e em que valor. Separada da
   aplicação para dar pra testar sem three, sem sessão e sem headset. */
export function planoDeQualidade({ cascatas = 4, agressivo = false } = {}) {
  const n = Math.max(0, Math.floor(cascatas));
  return {
    /* As DISTANTES saem: no CSM as cascatas vão da mais próxima para a mais
       longe, e as últimas cobrem a maior área com o mesmo tamanho de mapa —
       muito custo, pouca sombra visível. Duas próximas seguram a sombra que
       o jogador realmente enxerga em volta dele. */
    cascatasLigadas: n <= 2 ? n : (agressivo ? 1 : 2),
    maxFar: agressivo ? 60 : 90,
    /* 0,9 corta ~19% dos pixels e é imperceptível; abaixo disso o texto do
       HUD começa a sofrer, e legibilidade é requisito de loja. */
    framebuffer: agressivo ? 0.8 : 0.9,
    /* Foveação alta borra a periferia inteira (o three nasce em 1.0, o
       máximo, e foi assim que o jogo rodou até agora). 0,2 mantém o centro
       nítido; no modo agressivo 0,4 ainda é bem melhor que o padrão. */
    foveacao: agressivo ? 0.4 : 0.2,
  };
}

export function createXrQuality({ renderer, getCsm = () => null, CFG = null }) {
  let salvo = null;
  let fbAplicado = 1;   // espelho local: o three não expõe getter dessa escala
  /* PREGUIÇOSO de propósito: o CSM do jogo nasce depois desta fábrica, e
     receber o objeto pronto cairia na zona morta do `const`. */
  const oCsm = () => (typeof getCsm === 'function' ? getCsm() : null);

  function aplicar(opts = {}) {
    if (salvo) return salvo;                      // já dentro: não empilha
    const csm = oCsm();
    const luzes = (csm && csm.lights) || [];
    salvo = {
      castShadow: luzes.map(l => l.castShadow),
      maxFar: csm ? csm.maxFar : null,
      csmMaxFarCfg: CFG ? CFG.CSM_MAX_FAR : null,
      /* NÃO EXISTE getter de escala de framebuffer no three r185 — só o
         setter. Guardar "o que eu mesmo apliquei" é a única leitura honesta;
         perguntar ao renderer devolvia `undefined` e caía num literal, o que
         fazia a asserção do teste passar sempre. Um valor que não pode falhar
         não é uma verificação, é enfeite. */
      framebuffer: fbAplicado,
      foveacao: renderer.xr.getFoveation ? renderer.xr.getFoveation() : null,
    };
    const p = planoDeQualidade({ cascatas: luzes.length, ...opts });
    for (let i = 0; i < luzes.length; i++) luzes[i].castShadow = i < p.cascatasLigadas;
    if (csm) csm.maxFar = p.maxFar;
    if (CFG) CFG.CSM_MAX_FAR = p.maxFar;          // quem recalcula lê daqui
    if (renderer.xr.setFramebufferScaleFactor) {
      renderer.xr.setFramebufferScaleFactor(p.framebuffer);
      fbAplicado = p.framebuffer;
    }
    if (renderer.xr.setFoveation) renderer.xr.setFoveation(p.foveacao);
    return { ...p, aplicado: true };
  }

  /* RESTAURAR NÃO É OPCIONAL. Sair da sessão e continuar jogando no monitor
     com duas cascatas desligadas é regressão de PC introduzida por VR. */
  function restaurar() {
    if (!salvo) return false;
    const csm = oCsm();
    const luzes = (csm && csm.lights) || [];
    for (let i = 0; i < luzes.length; i++) {
      if (salvo.castShadow[i] !== undefined) luzes[i].castShadow = salvo.castShadow[i];
    }
    if (csm && salvo.maxFar !== null) csm.maxFar = salvo.maxFar;
    if (CFG && salvo.csmMaxFarCfg !== null) CFG.CSM_MAX_FAR = salvo.csmMaxFarCfg;
    if (renderer.xr.setFramebufferScaleFactor) {
      renderer.xr.setFramebufferScaleFactor(salvo.framebuffer);
      fbAplicado = salvo.framebuffer;
    }
    if (renderer.xr.setFoveation && salvo.foveacao !== null) renderer.xr.setFoveation(salvo.foveacao);
    salvo = null;
    return true;
  }

  return { aplicar, restaurar, get dentro() { return !!salvo; } };
}
