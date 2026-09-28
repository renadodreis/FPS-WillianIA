/* ================================================================
   CONSTANTES AJUSTÁVEIS — mexa aqui para calibrar qualidade/perf
   ================================================================ */
export const CFG = {
  // Grama
  GRASS_TOTAL:      170000,  // total aproximado de lâminas no patch
  GRASS_CHUNKS:     13,      // grade NxN de chunks ao redor do player
  GRASS_CHUNK_SIZE: 10,      // metros por chunk (raio do patch = N/2 * tamanho)
  GRASS_HEIGHT:     0.95,    // altura média da lâmina
  WIND_STRENGTH:    0.55,
  // Mundo
  WORLD_SIZE:       1100,    // lado do terreno (m)
  TERRAIN_SEGS:     220,     // segmentos do PlaneGeometry
  VIEW_DIST:        420,     // far do fog / culling
  TREE_COUNT:       380,
  ROCK_COUNT:       240,
  FLOWER_COUNT:     2600,
  // Grama — LOD de LÂMINA (só segmentos de geometria; ver js/grass.js:41-49).
  // Chunks além deste anel usam a lâmina de 2 segmentos em vez de 4. NÃO tira
  // lâmina, não muda altura nem alcance — logo não é vetor de wallhack.
  GRASS_LOD_RING:   4,       // = default histórico do js/grass.js
  // Sombra
  SHADOW_MAP_SIZE:  1024,    // por cascata (4 cascatas CSM)
  CSM_MAX_FAR:      160,
  // Inimigos
  ENEMY_COUNT:      12,
  // Render
  MAX_PIXEL_RATIO:  2,
  BLOOM_STRENGTH:   0.28,
  BLOOM_RADIUS:     0.35,
  BLOOM_THRESHOLD:  1.0,
  // Compressão do glare do céu: satura em 1/k. BASE mantém o dia como sempre
  // foi; MAX entra quando o halo de Mie cresce (golden hour, chuva) e evita
  // que o horizonte inteiro passe do limiar do bloom e vire borrão branco.
  GLARE_BASE:       0.55,
  GLARE_MAX:        0.85,   // teto 1,18: céu só floresce acima de 6,67 (era 2,22)
  MIE_BASE:         0.0008,
  MIE_HALO_SPAN:    0.007,   // mie extra do golden hour: 0,0008 -> 0,0078
  EXPOSURE:         0.58,
};

/* ================================================================
   CORTE DE CELULAR — overrides de CFG pro alvo de 60 FPS em gama média
   (Adreno 6xx / Mali-G57). Aplicado por quem detecta o dispositivo
   (js/mobile.js), ANTES de qualquer consumidor ler CFG.

   O QUE NÃO PODE ENTRAR AQUI, e por quê:

   1. NADA que alimente o PRNG SEEDADO do worldgen. A ordem de consumo do
      `Math.random` seedado é contrato (ver CLAUDE.md): a contagem de
      chamadas define o layout do mundo, e bots/servidor reconstroem o
      mesmo mundo do mesmo seed. Ficam FORA, provadamente:
        TREE_COUNT / ROCK_COUNT / FLOWER_COUNT — cada um é o teto de um
          laço que sorteia posição (game.js:632, 851, 891);
        GRASS_TOTAL / GRASS_CHUNKS — entram em PER_CHUNK (js/grass.js:22)
          e no número de chunks, e o `legacyConsume` (js/grass.js:184-198)
          existe justamente pra REPRODUZIR essa contagem de chamadas;
        TERRAIN_SEGS — o worldgen filtra posições por heightAt, que lê a
          grade; mudar a resolução muda quais sorteios passam (o A/B em
          game.js:93-99 já avisa: "mundo diverge do canônico");
        ENEMY_COUNT — cada inimigo consome rand no respawn inicial
          (js/enemies.js:203-208, 224).
      Cortar qualquer um deles deixaria o celular num mundo DIFERENTE do
      dos outros jogadores da mesma partida.

   2. NADA que reduza grama, alcance de visão ou névoa como OPÇÃO DO
      JOGADOR. Grama mais rala é wallhack contra quem está deitado no
      mato (trava em test/render-quality.test.js:199-215). Isto aqui é
      perfil de HARDWARE, não configuração exposta — e o único corte de
      grama é o LOD de lâmina, que mantém todas as lâminas de pé.
   ================================================================ */
export const MOBILE_CFG = {
  // Câmera/fog. É DESVANTAGEM pra quem joga no celular (vê menos longe),
  // nunca vantagem: a névoa fecha em VIEW_DIST*0.5 = 150 m.
  //
  // 300 e não 200. A medição de 2026-08-08 (docs/2026-08-08-mobile-validacao.md)
  // comparou os dois no viewport REAL de celular: draw calls e triângulos não
  // se movem além do ruído. Cortar até 200 não pagava nada e custava 50 m de
  // alcance — com sniper e DMR validados no servidor bem acima disso, era
  // desvantagem competitiva comprada de graça. A paisagem 2,16:1 alarga o
  // frustum mais do que a profundidade corta; quem economiza aqui paga em
  // visão sem ganhar frame.
  VIEW_DIST:        300,
  // Sombra: no preset `mobile` do js/gputier.js ela nasce DESLIGADA. Estes
  // dois valem pra quem religar sombra na mão no menu.
  SHADOW_MAP_SIZE:  512,     // 4 cascatas: 4×512² em vez de 4×1024² de banda
  CSM_MAX_FAR:      90,
  // Grama: só troca a lâmina de 4 pra 2 segmentos mais perto do jogador.
  // Mesma quantidade, mesma altura, mesmo alcance (js/grass.js:41-49).
  GRASS_LOD_RING:   1,
};

/* Piso da escala adaptativa no celular. O piso de desktop (0.75, em
   js/adaptivequality.js:17) não dá folga suficiente numa GPU móvel: quando
   o frame estoura, 0.75 ainda é caro demais e a escala fica presa no chão
   sem resolver. Só a constante — quem passa isso pro scaler é a fiação. */
export const MOBILE_RES_FLOOR = 0.5;

/* PEDIDOS DE FIAÇÃO — números que hoje são constantes locais de outros
   arquivos (não dá pra sobrepor via CFG). Exportados aqui pra ficarem no
   mesmo lugar; quem os liga é o dono de cada arquivo:
     game.js:2380  `PHYSICS_MAX_STEPS = 3` → com frame lento o passo fixo
       dispara até 3 substeps, multiplicando CPU exatamente quando ela já
       estourou (espiral da morte). No celular, 2 corta a espiral.
     js/grass.js:289 `REBUILD_BUDGET = 6` → chunks re-preenchidos por
       frame. Baixar troca engasgo por refill mais lento; o conteúdo de
       cada chunk é determinístico por (cx,cz) via mulberry32 local
       (js/grass.js:10-19), então QUANDO ele é preenchido não muda um byte. */
export const MOBILE_PHYSICS_MAX_STEPS = 2;
export const MOBILE_GRASS_REBUILD_BUDGET = 3;

/* Aplica os overrides no CFG. Idempotente; devolve o que foi aplicado pra
   quem chamou registrar no console. */
export function applyMobileCfg(cfg = CFG, overrides = MOBILE_CFG) {
  Object.assign(cfg, overrides);
  return { ...overrides };
}

/* ===== configurações (localStorage) ===== */
// `res` é o TETO de resolução; `autores` deixa a máquina descer dele quando a
// GPU não dá conta e voltar quando sobra folga (ver js/adaptivequality.js).
// `aa` = SMAA. São TRÊS passes em resolução cheia (bordas, pesos, mistura),
// o item mais caro do pós — e o único que não tinha botão.
/* CONTROLES DE TOQUE (só o celular lê; o desktop nunca encosta nestas chaves).
   Fonte única dos padrões — js/touchcontrols.js normaliza a partir daqui.
   docs/mobile/referencia-mira-toque.md §6:
   · touchLook      — multiplicador da sensibilidade do olhar (1 = 0,0032 rad/px)
   · touchRatioY    — vertical ÷ horizontal; 0,6 é o do Lyra (pitch = yaw × 0,6)
   · touchAds       — multiplicador SOBRE a razão das tangentes, só na mira
   · touchFireLook  — quanto o dedo no ATIRAR gira a câmera (0 desliga)
   · touchAssist    — assistência de mira (ligada: é o padrão de todo AAA de toque)
   · touchAutoFire  — tiro automático: DESLIGADO até o dono decidir (§6 P0-3)
   · touchFireLeft  — segundo ATIRAR à esquerda
   · touchLookAccel — aceleração do olhar pela velocidade do dedo (0 = LINEAR,
                      o padrão da régua M3e; 1 = curva cheia, ganho 1→2 entre
                      0,05 e 0,2 m/s — js/touchcontrols.js, LOOK_ACCEL)
   · touchStick     — curso do analógico, multiplicador dos 58 px de CSS */
export const TOUCH_DEFAULTS = Object.freeze({
  touchLook: 1, touchRatioY: 0.6, touchAds: 1, touchFireLook: 1,
  touchAssist: 1, touchAutoFire: 0, touchFireLeft: 0,
  touchLookAccel: 0, touchStick: 1,
});
export const SETTINGS = Object.assign({ vol: 0.5, res: 1.5, shadow: 1, bloom: 1, ping: 1, autores: 1, aa: 1,
  ...TOUCH_DEFAULTS },
  (() => { try { return JSON.parse(localStorage.getItem('callofai_cfg') || '{}'); } catch (e) { return {}; } })());
/* GRAVAR É MELHOR ESFORÇO, NUNCA CONDIÇÃO PARA JOGAR. Safari em aba privada
   (versões antigas), cota cheia e iframe com sandbox fazem `setItem` — ou o
   próprio acesso a `localStorage` — LANÇAR. Sem o `try`, o primeiro boot (que
   grava o preset do auto-tier) morria com `QuotaExceededError` e o jogo nunca
   subia (laudo `7515734`, A6/C9). O ajuste continua valendo na memória
   (`SETTINGS`); só não sobrevive ao recarregar. Devolve se gravou. Em Node
   puro (o processo dos bots importa este módulo, sem DOM) também só devolve
   `false`: nada aqui pode tocar `localStorage` fora de `try` ou de função. */
export function persistSettings() {
  try { localStorage.setItem('callofai_cfg', JSON.stringify(SETTINGS)); return true; }
  catch (e) { return false; }
}
