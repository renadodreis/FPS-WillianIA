/* ================================================================
   FACHADA XR — o único ponto que o game.js precisa conhecer.

   Junta as três peças (ambiente, sessão, rig) e resolve a pergunta que
   o loop faz uma vez por frame: "estou apresentando?". A resposta vem do
   PRÓPRIO `renderer.xr.isPresenting`, e não de um espelho local, porque
   a sessão pode acabar por fora — o jogador tira o headset, aperta o
   botão do sistema, a bateria acaba. `sync()` reconcilia o grafo com
   esse fato em vez de confiar em callback.

   NADA AQUI ALOCA NO BOOT. `xrEnv` é leitura pura, a sessão nasce vazia
   e o rig é preguiçoso — porque durante o worldgen o `Math.random` é o
   fluxo seedado (game.js:201) e cada `Object3D` gasta 4 números dele no
   UUID. Um Group criado cedo demais move o mundo de todo mundo.
   ================================================================ */
import { xrEnv } from './xrenv.js';
import { createXrRig } from './xrrig.js';
import { createXrSession } from './xrsession.js';
import { createXrHands } from './xrhands.js';
import { createXrComfort } from './xrcomfort.js';
import { createXrQuality } from './xrquality.js';
import { criarGiroXR } from './xrturn.js';
import { criarCorpoXR } from './xrbody.js';

export function createXrBoot({ THREE, renderer, scene, camera, getCsm = () => null, CFG = null,
  nav = typeof navigator === 'undefined' ? null : navigator,
  win = typeof window === 'undefined' ? undefined : window,
  onEnter = () => {}, onExit = () => {}, onVisibility = () => {} } = {}) {
  const env = xrEnv(win);
  const rig = createXrRig({ THREE, scene, camera, renderer });
  const session = createXrSession({ renderer, navigator: nav, onEnter, onExit, onVisibility });
  const hands = createXrHands({ renderer });
  const comfort = createXrComfort({ THREE, camera });
  const quality = createXrQuality({ renderer, getCsm, CFG });
  /* `localStorage` não é só "pode estar cheio": em iframe com sandbox o próprio
     ACESSO à propriedade lança. Sem preferência salva o giro cai no padrão. */
  let armazem;
  try { armazem = (win && win.localStorage) || null; } catch { armazem = null; }
  /* Nenhum dos dois aloca `Object3D` — só números e matrizes. É o que permite
     nascerem aqui, no boot, sem tocar no fluxo seedado do worldgen. */
  const giro = criarGiroXR({ armazem });
  const corpo = criarCorpoXR({ THREE, camera });

  const apresentando = () => !!(renderer.xr && renderer.xr.isPresenting === true);

  /* RESET DE REFERENCIAL. O sistema dispara `reset` no espaço de referência
     quando o jogador recentra a vista ou quando o piso é redefinido: a ORIGEM
     muda, o jogador não anda. Sem escutar isso, a mudança de origem chega ao
     rig disfarçada de passo físico gigante e teleporta o jogador no mundo pela
     própria distância dele até o centro. O ouvinte é preso uma vez por sessão e
     morre com ela. */
  let espacoOuvido = null;
  let resets = 0;   // QA: quantos resets de referencial chegaram
  function ouvirReset() {
    const esp = renderer.xr.getReferenceSpace && renderer.xr.getReferenceSpace();
    if (!esp || esp === espacoOuvido || typeof esp.addEventListener !== 'function') return;
    espacoOuvido = esp;
    esp.addEventListener('reset', () => { resets++; rig.rebasear(); });
  }

  /* Chamado uma vez por frame, ANTES de qualquer código mexer em câmera.
     Devolve se está em XR e deixa o grafo coerente com isso. */
  function sync() {
    const p = apresentando();
    if (p && !rig.entered) { rig.enter(); hands.anexar(rig.rig); comfort.anexar(); quality.aplicar(); }
    /* A POSE DA CABEÇA VIRA A DESTE FRAME AQUI, no ponto que o cabeçalho já
       prometia ("ANTES de qualquer código mexer em câmera"). O three só
       escreve `camera.position` lá dentro de `render()`, no FIM do tick — sem
       isto, tudo que lê a cabeça durante o frame (o rig, o corpo, o alcance de
       interação, a mira, o HUD) trabalha com a pose do frame anterior. O
       `place()` também chama, porque ele roda tarde no tick e não pode
       depender de quem passou antes; a chamada é idempotente (ver
       js/xr/xrrig.js).
       Por frame, e não só ao entrar: no primeiro frame da sessão o espaço de
       referência ainda pode não existir, e o three troca o espaço quando o jogo
       pede outro tipo. A função sai na primeira linha quando já está ouvindo. */
    /* E O PASSO FÍSICO É MEDIDO AQUI, PELO MESMO MOTIVO E NO MESMO LUGAR.
       Ele morava dentro do `place()`, que mora dentro do `applyFpsCamera`, que
       DOIS estados do jogo tiram do caminho do tick (painel de pausa aberto,
       cinemática da cidade). Nesses dois o corpo do jogador parava de
       acompanhar a cabeça — colisor 0,0000 m para 1,0000 m de caminhada, 1,02 m
       de separação sem cortina nenhuma — e ao voltar o metro inteiro chegava
       como UM salto, era descartado como recentrar, e o mundo deslizava 1 m num
       frame. Medir é obrigação de FRAME; posicionar continua sendo decisão do
       jogo, e continua em `place()`. Ver o cabeçalho de `rastrear` em
       js/xr/xrrig.js. */
    if (p) { rig.atualizarPose(); rig.rastrear(); ouvirReset(); }
    /* `quality.restaurar()` PRIMEIRO, e a ordem importa menos que o fato de ele
       estar aqui: esta linha já foi escrita uma vez e sumiu quando outro wiring
       reescreveu o mesmo `else if`. O sintoma era mudo — o jogador tirava o
       headset e seguia no monitor com duas cascatas de sombra apagadas e o
       alcance da sombra em 90 m, para sempre. Regressão de PC nascida de VR. */
    else if (!p && rig.entered) { espacoOuvido = null; quality.restaurar(); comfort.soltar(); hands.exit(); corpo.soltar(); rig.exit(); }
    return p;
  }

  return {
    env, sync,
    isSupported: () => session.isSupported(),
    /* `hands.criar()` ANTES de pedir a sessão: o three só associa entrada a
       controle se os objetos já existirem quando o `inputsourceschange` chegar
       (ver js/xr/xrhands.js). Criado depois, o controle nunca recebe pose. */
    enter: () => { hands.criar(); return session.enter(); },
    exit: () => session.exit(),
    place: (x, y, z, yaw) => rig.place(x, y, z, yaw),
    /* passo físico do jogador que o jogo ainda não absorveu (ver js/xr/xrrig.js):
       drenar isto na posição do jogador põe o colisor debaixo da CABEÇA. */
    consumirPasso: alvo => rig.consumirPasso(alvo),
    devolverPasso: (dx, dz) => rig.devolverPasso(dx, dz),
    /* Separação cabeça↔corpo que o mundo RECUSOU, em metros. É o que o
       escurecimento de intrusão consome (js/xr/xrcomfort.js): a parede segura
       o colisor, e este número diz quanto a cabeça já entrou no sólido. */
    get foraDoCorpo() { return rig.foraDoCorpoM; },
    /* A SEPARAÇÃO GEOMÉTRICA cabeça↔corpo, que é OUTRA coisa: `foraDoCorpo` é
       o que o mundo recusou, esta é onde a cabeça está. QA e diagnóstico —
       `js/interact.js` continua lendo `foraDoCorpo`, cuja semântica não muda. */
    get separacao() { return rig.separacaoM; },
    /* Passo físico que o guarda de `PASSO_HUMANO_MAX` jogou fora. Zero em
       operação sadia; diferente de zero é frame não rastreado (ver xrrig.js). */
    get saltoDescartado() { return rig.saltoDescartadoM; },
    rebasear: () => rig.rebasear(),
    headWorldPosition: alvo => rig.headWorldPosition(alvo),
    get presenting() { return apresentando(); },
    get rig() { return rig.rig; },
    mao: qual => hands.mao(qual),
    punho: qual => hands.punho(qual),
    conforto: comfort,
    qualidade: quality,
    giro,        // política de giro (js/xr/xrturn.js): suave, passos, preferência
    corpo,       // altura, postura e o boneco (js/xr/xrbody.js)
    get visibility() { return session.visibility; },
    get resetsRecebidos() { return resets; },
  };
}
