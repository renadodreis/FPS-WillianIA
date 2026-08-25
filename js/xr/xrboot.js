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

export function createXrBoot({ THREE, renderer, scene, camera,
  nav = typeof navigator === 'undefined' ? null : navigator,
  win = typeof window === 'undefined' ? undefined : window,
  onEnter = () => {}, onExit = () => {}, onVisibility = () => {} } = {}) {
  const env = xrEnv(win);
  const rig = createXrRig({ THREE, scene, camera });
  const session = createXrSession({ renderer, navigator: nav, onEnter, onExit, onVisibility });

  const apresentando = () => !!(renderer.xr && renderer.xr.isPresenting === true);

  /* Chamado uma vez por frame, ANTES de qualquer código mexer em câmera.
     Devolve se está em XR e deixa o grafo coerente com isso. */
  function sync() {
    const p = apresentando();
    if (p && !rig.entered) rig.enter();
    else if (!p && rig.entered) rig.exit();
    return p;
  }

  return {
    env, sync,
    isSupported: () => session.isSupported(),
    enter: () => session.enter(),
    exit: () => session.exit(),
    place: (x, y, z, yaw) => rig.place(x, y, z, yaw),
    headWorldPosition: alvo => rig.headWorldPosition(alvo),
    get presenting() { return apresentando(); },
    get rig() { return rig.rig; },
    get visibility() { return session.visibility; },
  };
}
