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

      O preset MEXE na grama — e a distinção é exatamente a que o
      `js/config.js` já faz. O que ele troca é o `GRASS_LOD_RING`: o anel a
      partir do qual a LÂMINA passa a ter 2 segmentos de altura em vez de 4.
      Nenhuma lâmina sai do mapa, nenhuma encolhe, o tapete não encurta —
      some a subdivisão intermediária de uma geometria que, àquela distância,
      é sub-pixel. Quantidade, altura e alcance são medidos com e sem o preset
      em test/xr-quality.test.js, dentro da mesma sessão.

   4. **Não inventa condutor.** Tudo aqui é escrito em objetos que o jogo já
      lê por frame (as luzes do CSM, o `CFG`). Nenhum consumidor precisa de
      fiação nova — que é como nasce o andaime-que-vira-produto.

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
    /* ---- GRAMA: LOD DE LÂMINA, e NADA ALÉM DISSO ------------------------
       Anel (distância de Chebyshev em chunks de 10 m) a partir do qual a
       lâmina troca a geometria de 4 para 2 segmentos de altura. Base, meio e
       ponta caem nos MESMOS pontos; some a subdivisão intermediária, que a
       essa distância é sub-pixel (js/grass.js). É por isso que isto NÃO é o
       vetor de wallhack que o resto do arquivo recusa: a contagem de lâminas,
       a altura sorteada e o raio do tapete não são tocados — e há caso
       medindo os três em test/xr-quality.test.js.

       1, e não um número inventado: é o mesmo anel que o perfil de CELULAR
       (js/config.js, MOBILE_CFG.GRASS_LOD_RING) já leva a hardware real. O
       desktop usa 4.

       Quanto paga, medido em sessão immersive-vr (IWER), mundo congelado com
       `MP.setTimeScale(0)`, sombra desligada, GLB do Guardião carregado, seed
       424242, spread 0 nas 9 amostras, A/B DENTRO da mesma sessão (comparar
       absoluto entre execuções é o erro que já produziu o "não atribuído
       −1144" nesta frente). Triângulos ESTÉREO da grama, por subtração:

         pose      anel 4 (desktop)   anel 1 (preset)      Δ
         spawn        964 800            699 480       −265 320  (−27,5%)
         cidade       546 720            402 000       −144 720  (−26,5%)
         castelo      868 320            619 080       −249 240  (−28,7%)

       ZERO, e o número veio da MEDIÇÃO, não do gosto. A distribuição que
       fechava a pose de CASTELO era 0-1 completa / 2 reduzida / 3+ mínima;
       medida a pose de SPAWN — que é pior, com 78 chunks no frustum contra 70
       e o dobro de chunks no primeiro anel — ela estourava o teto em 11 833
       triângulos por olho. O anel completo teve que descer de 1 para 0.

       É o degrau CERTO para ceder, e por isso: a lâmina de 2 segmentos guarda
       base, MEIO e ponta exatamente sobre a curva (desvio máximo de 1,1 cm em
       y=0,25 e y=0,75), enquanto a de 1 segmento perde o meio. Ceder o limiar
       4→2 custa quase nada; ceder o 2→1 é o que se quis proteger, e ele fica
       onde estava, no anel 3 (~25 m).

       Negativo nunca — aí deixaria de ser LOD por distância e a grama que o
       jogador encosta a mão perderia detalhe. */
    anelGrama: 0,
    /* ---- SEGUNDO ANEL: onde entra a lâmina MÍNIMA (1 segmento, 2 tris) ----
       Um anel só não bastava. Com dois degraus (4 e 2 segmentos) o PISO da
       grama na pose de castelo é 281 400 triângulos por olho, e o orçamento
       que sobra depois do resto do mundo é 197 547: não existia distribuição
       que coubesse — a conta dava 2,8 triângulos por lâmina e o degrau mais
       barato custava 4.

       Com o terceiro degrau a distribuição existe: anel 0 completo, anéis 1-2
       reduzidos, do anel 3 (~25 m) para fora no mínimo. Este 2 é o maior
       (isto é, o mais conservador) que ainda cabe em 500 k na PIOR pose
       medida — spawn, 78 chunks no frustum. Com 3 a pior pose estoura.

       Por que 25 m é seguro para a lâmina reta: a flecha da curvinha
       `z = y²·0,18` é 4,5 cm no meio da lâmina; a 25 m, com o frustum do
       Quest 3, isso é fração de pixel. E o que esconde alguém deitado àquela
       distância é a DENSIDADE de lâminas, não a curvatura de cada uma — está
       medido em pixel contra um alvo do tamanho de um corpo deitado. */
    anelGramaMinima: agressivo ? 1 : 2,
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
      /* O QUE ESTAVA VALENDO, não o padrão de desktop: num celular o
         `applyMobileCfg` já deixou 1 aqui antes de a grama nascer, e devolver
         4 na saída PIORARIA o quadro de quem ficou no celular. */
      grassLodRingCfg: CFG ? CFG.GRASS_LOD_RING : null,
      /* O segundo anel NÃO MORA no js/config.js: fora da sessão ele não
         existe, e é a AUSÊNCIA dele que faz o desktop não ter degrau mínimo.
         Por isso restaurar precisa saber se a chave existia — reescrevê-la
         com `undefined` deixaria um campo fantasma no CFG para sempre. */
      grassLodFarTinha: CFG ? Object.prototype.hasOwnProperty.call(CFG, 'GRASS_LOD_RING_FAR') : false,
      grassLodFarCfg: CFG ? CFG.GRASS_LOD_RING_FAR : undefined,
    };
    const p = planoDeQualidade({ cascatas: luzes.length, ...opts });
    for (let i = 0; i < luzes.length; i++) luzes[i].castShadow = i < p.cascatasLigadas;
    if (csm) csm.maxFar = p.maxFar;
    if (CFG) CFG.CSM_MAX_FAR = p.maxFar;          // quem recalcula lê daqui
    /* GRAMA: sem fiação nova. `js/grass.js` relê `CFG.GRASS_LOD_RING` a cada
       `atualizarLods()`, que roda dentro do `Grass.update()` que o game.js já
       chama uma vez por frame — o mesmo canal do CSM_MAX_FAR logo acima.
       Preset de sessão que precisa de condutor novo é como nasce o
       andaime-que-vira-produto; aqui não há condutor nenhum a inventar. */
    if (CFG) {
      CFG.GRASS_LOD_RING = p.anelGrama;
      CFG.GRASS_LOD_RING_FAR = p.anelGramaMinima;
    }
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
    /* O vazamento da grama é o mais silencioso dos três: o monitor ficaria com
       a lâmina de 2 segmentos a partir do primeiro anel PARA SEMPRE, e nada no
       console diria nada. Há caso saindo da sessão de verdade (`XR.exit()`)
       e lendo o LOD de cada chunk depois. */
    if (CFG && salvo.grassLodRingCfg !== null) CFG.GRASS_LOD_RING = salvo.grassLodRingCfg;
    if (CFG) {
      if (salvo.grassLodFarTinha) CFG.GRASS_LOD_RING_FAR = salvo.grassLodFarCfg;
      else delete CFG.GRASS_LOD_RING_FAR;   // volta a NÃO EXISTIR, que é o desktop
    }
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
