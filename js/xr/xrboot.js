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
import { criarGiroXR } from './xrturn.js';
import { criarCorpoXR } from './xrbody.js';

export function createXrBoot({ THREE, renderer, scene, camera,
  nav = typeof navigator === 'undefined' ? null : navigator,
  win = typeof window === 'undefined' ? undefined : window,
  onEnter = () => {}, onExit = () => {}, onVisibility = () => {} } = {}) {
  const env = xrEnv(win);
  const rig = createXrRig({ THREE, scene, camera });
  const session = createXrSession({ renderer, navigator: nav, onEnter, onExit, onVisibility });
  const hands = createXrHands({ renderer });
  const comfort = createXrComfort({ THREE, camera });
  /* `localStorage` não é só "pode estar cheio": em iframe com sandbox o próprio
     ACESSO à propriedade lança. Sem preferência salva o giro cai no padrão. */
  let armazem;
  try { armazem = (win && win.localStorage) || null; } catch { armazem = null; }
  /* Nenhum dos dois aloca `Object3D` — só números e matrizes. É o que permite
     nascerem aqui, no boot, sem tocar no fluxo seedado do worldgen. */
  const giro = criarGiroXR({ armazem });
  const corpo = criarCorpoXR({ THREE, camera });

  const apresentando = () => !!(renderer.xr && renderer.xr.isPresenting === true);

  /* Chamado uma vez por frame, ANTES de qualquer código mexer em câmera.
     Devolve se está em XR e deixa o grafo coerente com isso. */
  function sync() {
    const p = apresentando();
    if (p && !rig.entered) { rig.enter(); hands.anexar(rig.rig); comfort.anexar(); }
    else if (!p && rig.entered) { comfort.soltar(); hands.exit(); corpo.soltar(); rig.exit(); }
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
    headWorldPosition: alvo => rig.headWorldPosition(alvo),
    get presenting() { return apresentando(); },
    get rig() { return rig.rig; },
    mao: qual => hands.mao(qual),
    punho: qual => hands.punho(qual),
    conforto: comfort,
    giro,        // política de giro (js/xr/xrturn.js): suave, passos, preferência
    corpo,       // altura, postura e o boneco (js/xr/xrbody.js)
    get visibility() { return session.visibility; },
  };
}
