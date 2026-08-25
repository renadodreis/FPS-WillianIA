/* ================================================================
   RIG DE CÂMERA XR.

   Em XR o jogo NÃO move a câmera: quem escreve `camera.position` e
   `camera.quaternion` todo frame é o three
   (`WebXRManager.updateUserCamera`), calculando a pose da cabeça
   RELATIVA AO PAI da câmera. Daí o grafo:

       scene > xrRig (o JOGO move) > camera (o HEADSET move)

   O rig mora nos PÉS do jogador, não nos olhos. A referência espacial é
   `local-floor`: a origem é o chão, e a altura do olho vem do headset.
   É isso que faz agachar virar agachar de verdade — e é por isso que
   `place()` recebe a cota do TERRENO, nunca a altura da câmera.

   POR QUE O RIG NASCE PREGUIÇOSO: durante o boot o `Math.random` global
   vira um mulberry32 seedado (game.js:201) e cada `Object3D` gasta 4
   números desse fluxo só no UUID. A ordem de consumo é contrato — o
   servidor e os bots reconstroem o mesmo mundo da mesma seed. Um Group
   criado no boot deslocaria o mundo de todo mundo. Montar o controlador
   não cria nada; quem cria é `enter()`, que só acontece com o jogador
   apertando o botão, muito depois do worldgen.
   ================================================================ */

export function createXrRig({ THREE, scene, camera }) {
  let rig = null;
  let paiAnterior = null;
  let poseSalva = null;
  let dentro = false;

  /* transform LOCAL da câmera antes de entrar: em XR ele é sobrescrito
     todo frame, então sem cópia não há como devolver o desktop intacto */
  function salvarPose() {
    poseSalva = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      scale: camera.scale.clone(),
    };
  }

  function enter() {
    if (dentro) return rig;
    if (!rig) {
      rig = new THREE.Group();
      rig.name = 'xrRig';
      scene.add(rig);
    }
    paiAnterior = camera.parent;
    salvarPose();
    rig.add(camera);
    /* zera o local: a pose de desktop (altura do olho, giro do mouse) já
       está descrita pelo rig, e deixá-la aqui somaria duas vezes */
    camera.position.set(0, 0, 0);
    camera.quaternion.identity();
    camera.scale.set(1, 1, 1);
    dentro = true;
    return rig;
  }

  function exit() {
    if (!dentro) return;
    if (paiAnterior) paiAnterior.add(camera);
    else if (camera.parent) camera.parent.remove(camera);
    if (poseSalva) {
      camera.position.copy(poseSalva.position);
      camera.quaternion.copy(poseSalva.quaternion);
      camera.scale.copy(poseSalva.scale);
    }
    dentro = false;
  }

  /* `y` é a cota do CHÃO sob o jogador; `yaw` é o giro artificial (snap
     turn), somado ao giro real da cabeça pelo próprio headset. */
  function place(x, y, z, yaw) {
    if (!dentro || !rig) return; // fora do XR não existe rig — e criar um custaria rand
    rig.position.set(x, y, z);
    rig.rotation.y = yaw;
  }

  /* A leitura que todo código de jogo deveria usar no lugar de
     `camera.position`: com pai, a posição local não é a do mundo. */
  function headWorldPosition(target) {
    return camera.getWorldPosition(target);
  }

  return {
    enter, exit, place, headWorldPosition,
    get rig() { return rig; },
    get entered() { return dentro; },
  };
}
