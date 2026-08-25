/* ================================================================
   QA — RIG DE CÂMERA XR (js/xr/xrrig.js).

   Em XR quem escreve `camera.position`/`quaternion` é o three, não o
   jogo: `WebXRManager.updateUserCamera` calcula a pose da cabeça
   RELATIVA AO PAI da câmera e sobrescreve o transform local todo frame.
   Logo o grafo tem que ser:

       scene > xrRig (o JOGO move) > camera (o HEADSET move)

   O rig fica nos PÉS do jogador, não nos olhos: em `local-floor` a
   origem da referência é o chão, e a altura vem do headset — é assim que
   agachar vira agachar de verdade.

   A ARMADILHA QUE ESTE TESTE EXISTE PRA TRAVAR: `Math.random` é
   substituído por um mulberry32 SEEDADO durante o boot (game.js:201), e
   todo `Object3D` novo gasta 4 números desse fluxo no próprio UUID. Um
   `new THREE.Group()` criado durante o worldgen desloca o mundo inteiro
   e quebra a reconstrução que servidor e bots fazem a partir da mesma
   seed. Por isso o rig NASCE PREGUIÇOSO: montar o controlador não pode
   consumir nada; só entrar em XR — que acontece muito depois do
   worldgen — cria o Group.
   ================================================================ */
'use strict';
const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

let THREE, createXrRig;
before(async () => {
  THREE = await import('three');
  ({ createXrRig } = await import('../js/xr/xrrig.js'));
});

let scene, camera, xr;
beforeEach(() => {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, 1, 0.08, 1000);
  camera.position.set(10, 1.7, -4);
  camera.rotation.set(0, Math.PI / 3, 0);
  scene.add(camera);
  xr = createXrRig({ THREE, scene, camera });
});

/* conta consumo do fluxo seedado sem depender de ordem global */
function contandoRandom(fn) {
  const original = Math.random;
  let n = 0;
  Math.random = () => { n++; return original(); };
  try { fn(); } finally { Math.random = original; }
  return n;
}

describe('rig preguiçoso (contrato do rand seedado)', () => {
  it('montar o controlador não consome Math.random', () => {
    const n = contandoRandom(() => createXrRig({ THREE, scene, camera }));
    assert.equal(n, 0, 'criar o rig no boot deslocaria o mundo seedado');
  });

  it('montar o controlador não mexe na cena', () => {
    const antes = scene.children.length;
    createXrRig({ THREE, scene, camera });
    assert.equal(scene.children.length, antes);
  });

  it('entrar em XR é o que cria o Group (e aí sim consome)', () => {
    const n = contandoRandom(() => xr.enter());
    assert.ok(n > 0, 'o Group tem UUID; se não consumiu, não foi criado');
    assert.ok(xr.rig, 'o rig passa a existir');
    assert.equal(xr.rig.parent, scene);
  });
});

describe('adoção e devolução da câmera', () => {
  it('entrar põe a câmera dentro do rig', () => {
    xr.enter();
    assert.equal(camera.parent, xr.rig);
    assert.equal(xr.entered, true);
  });

  it('entrar zera o transform local da câmera', () => {
    // o three escreve a pose da cabeça exatamente aí no frame seguinte;
    // deixar resto do transform de desktop soma duas vezes a altura do olho
    xr.enter();
    assert.deepEqual(camera.position.toArray(), [0, 0, 0]);
    assert.equal(camera.quaternion.equals(new THREE.Quaternion()), true);
  });

  it('sair devolve a câmera ao pai original', () => {
    xr.enter();
    xr.exit();
    assert.equal(camera.parent, scene);
    assert.equal(xr.entered, false);
  });

  it('sair devolve o transform local que a câmera tinha antes', () => {
    xr.enter();
    // simula o que o three faz todo frame em XR
    camera.position.set(0.3, 1.72, 0.1);
    camera.quaternion.setFromEuler(new THREE.Euler(0.2, 1.1, 0));
    xr.exit();
    assert.deepEqual(camera.position.toArray().map(v => +v.toFixed(4)), [10, 1.7, -4]);
    assert.equal(+camera.rotation.y.toFixed(4), +(Math.PI / 3).toFixed(4));
  });

  it('entrar duas vezes não duplica o rig nem perde o pai original', () => {
    xr.enter();
    const primeiro = xr.rig;
    xr.enter();
    assert.equal(xr.rig, primeiro);
    assert.equal(scene.children.filter(o => o === primeiro).length, 1);
    xr.exit();
    assert.equal(camera.parent, scene);
  });

  it('sair sem ter entrado não faz nada', () => {
    xr.exit();
    assert.equal(camera.parent, scene);
    assert.equal(xr.entered, false);
  });
});

describe('o jogo move o rig, o headset move a cabeça', () => {
  it('posicionar o rig leva a cabeça junto, em mundo', () => {
    xr.enter();
    camera.position.set(0, 1.7, 0); // pose da cabeça que o three escreveria
    xr.place(120, 8, -60, 0);
    const mundo = xr.headWorldPosition(new THREE.Vector3());
    assert.deepEqual(mundo.toArray().map(v => +v.toFixed(3)), [120, 9.7, -60]);
  });

  it('o giro do rig gira a cabeça em torno do próprio rig', () => {
    xr.enter();
    camera.position.set(0, 1.7, -1); // cabeça 1 m à frente do centro do rig
    xr.place(0, 0, 0, Math.PI / 2);  // 90° pra esquerda
    const mundo = xr.headWorldPosition(new THREE.Vector3());
    assert.equal(+mundo.x.toFixed(3), -1, 'o que estava à frente vai pro lado');
    assert.equal(+mundo.z.toFixed(3) + 0, 0); // `+ 0` só normaliza o -0 do seno
  });

  it('o rig fica nos PÉS: a altura do olho vem só da pose da cabeça', () => {
    xr.enter();
    camera.position.set(0, 1.62, 0);
    xr.place(0, 30, 0, 0);
    assert.equal(+xr.headWorldPosition(new THREE.Vector3()).y.toFixed(3), 31.62);
    assert.equal(xr.rig.position.y, 30, 'o rig NÃO sobe pra altura do olho');
  });

  it('posicionar antes de entrar não cria rig nenhum', () => {
    const n = contandoRandom(() => xr.place(5, 0, 5, 0));
    assert.equal(n, 0);
    assert.equal(xr.rig, null);
  });
});

describe('posição de mundo da cabeça', () => {
  it('funciona fora do XR, com a câmera solta na cena', () => {
    const mundo = xr.headWorldPosition(new THREE.Vector3());
    assert.deepEqual(mundo.toArray().map(v => +v.toFixed(3)), [10, 1.7, -4]);
  });

  it('não é a mesma coisa que camera.position depois de entrar', () => {
    xr.enter();
    camera.position.set(0, 1.7, 0);
    xr.place(200, 0, 0, 0);
    assert.notEqual(camera.position.x, xr.headWorldPosition(new THREE.Vector3()).x);
  });
});
