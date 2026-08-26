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

  /* O GIRO PIVOTA NA CABEÇA. Este teste já afirmou o contrário — "o giro do
     rig gira a cabeça em torno do próprio rig" — e o número passava porque a
     conta estava certa para o pivô errado. No aparelho isso é a queixa nº 1 do
     dono: com a cabeça 0,71 m fora do centro do espaço de jogo, um passo de
     45° TELEPORTAVA a vista 55,4 cm de lado (medido em sessão imersiva, ver
     test/xr-turn.test.js). Girar tem que girar, não deslizar. */
  it('girar o rig NÃO desloca a cabeça: o pivô é ela', () => {
    xr.enter();
    camera.position.set(0.71, 1.7, -1);  // jogador fora do centro do cômodo
    xr.place(0, 0, 0, 0);                // primeiro frame: fixa a base
    const antes = xr.headWorldPosition(new THREE.Vector3());
    for (const yaw of [Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 3]) {
      xr.place(0, 0, 0, yaw);
      const agora = xr.headWorldPosition(new THREE.Vector3());
      assert.ok(Math.hypot(agora.x - antes.x, agora.z - antes.z) < 1e-6,
        `girando ${(yaw * 180 / Math.PI).toFixed(0)}° a cabeça andou ` +
        `${Math.hypot(agora.x - antes.x, agora.z - antes.z).toFixed(3)} m de lado`);
      assert.equal(+agora.y.toFixed(6), +antes.y.toFixed(6));
    }
  });

  /* E o passo FÍSICO não pode sumir na conta do pivô: se a cabeça é fixada no
     ponto pedido todo frame, andar pelo cômodo deixa de mover o jogador — o
     jogo passaria a arrastar a cabeça de volta, que é a coisa proibida. */
  it('andar pelo cômodo move a cabeça, e o passo fica disponível pro jogo', () => {
    xr.enter();
    camera.position.set(0, 1.7, 0);
    xr.place(50, 0, -20, 0);
    const antes = xr.headWorldPosition(new THREE.Vector3());
    camera.position.set(0.8, 1.7, -0.6);   // passo físico de 1 m
    xr.place(50, 0, -20, 0);
    const agora = xr.headWorldPosition(new THREE.Vector3());
    assert.equal(+(agora.x - antes.x).toFixed(3), 0.8, 'o passo físico sumiu');
    assert.equal(+(agora.z - antes.z).toFixed(3), -0.6);
    /* limite alto de propósito: aqui se testa o MECANISMO de acumular e
       drenar. O teto por frame tem teste próprio logo abaixo. */
    const passo = xr.consumirPasso(null, 99);
    assert.equal(+passo.x.toFixed(3), 0.8, 'o jogo não recebeu o passo pra absorver');
    assert.equal(+passo.z.toFixed(3), -0.6);
    assert.equal(+xr.consumirPasso(null, 99).x.toFixed(3), 0, 'drenar duas vezes conta duas vezes');
    /* Absorvido pelo jogo, o mesmo passo entra na posição de jogo e sai do
       acumulado: a cabeça não pode pular na troca. */
    xr.place(50.8, 0, -20.6, 0);
    const depois = xr.headWorldPosition(new THREE.Vector3());
    assert.equal(+(depois.x - agora.x).toFixed(3), 0, 'a cabeça pulou ao absorver o passo');
    assert.equal(+(depois.z - agora.z).toFixed(3), 0);
  });

  /* O TETO POR FRAME, e por que ele existe. A colisão do jogo empurra para
     fora do volume mas não varre o caminho: um salto grande aparece do outro
     lado da parede e é empurrado pelo lado errado. Medido antes do teto: 3,000 m
     atravessando direção que o próprio jogo reportava bloqueada. Os saltos vêm
     de três lugares — glitch de tracking, `recenter()` (que muda a ORIGEM e não
     é andar) e o acumulado de quando o jogo não estava drenando. */
  it('o passo de um frame tem TETO, e o excedente ESCOA — não é jogado fora', () => {
    /* A primeira versão deste teste cobrava que o excedente fosse DESCARTADO, e
       essa era a decisão errada: a cabeça do jogador vai para `(x,z) + passo`,
       então tirar do acumulado o que o jogo não absorveu arrasta a VISTA de
       volta. Medido com o descarte no lugar: morto, um passo físico de 0,80 m
       movia a cabeça 0,000 m — o mundo congelava. O teto protege o COLISOR de
       teleportar; o acumulado protege a CABEÇA de ser puxada. São duas coisas. */
    xr.enter();
    camera.position.set(0, 1.7, 0);
    xr.place(0, 0, 0, 0);
    camera.position.set(3, 1.7, 0);          // salto de 3 m: tracking, não caminhada
    xr.place(0, 0, 0, 0);
    const p = xr.consumirPasso();
    assert.ok(Math.hypot(p.x, p.z) <= 0.1501,
      `um salto de 3 m entregou ${Math.hypot(p.x, p.z).toFixed(3)} m ao jogo num frame: o colisor teleporta`);
    let total = Math.hypot(p.x, p.z), voltas = 1;
    for (; voltas < 60; voltas++) {
      const q = xr.consumirPasso();
      const m = Math.hypot(q.x, q.z);
      if (m < 1e-6) break;
      assert.ok(m <= 0.1501, `a volta ${voltas} entregou ${m.toFixed(3)} m — o teto vale sempre`);
      total += m;
    }
    assert.ok(total > 1.5,
      `o acumulado escoou só ${total.toFixed(2)} m: o excedente foi descartado e a vista seria arrastada`);
    assert.ok(voltas > 8, `escoou em ${voltas} frames — rápido demais para não ser um pulo`);
  });

  it('o acumulado NÃO é cortado — cortá-lo teleporta a vista', () => {
    /* A terceira versão errada deste trecho cortava o acumulado num teto de
       2 m, e a medição achou a fórmula do estrago: acumulado de X metros dava
       X − 2,15 de SALTO DE VISTA (5 m → 2,85 m). O acumulado é a posição da
       cabeça em relação ao colisor: mexer nele move o mundo debaixo do
       jogador. Quem tem teto é a entrega ao colisor, não a memória da cabeça. */
    xr.enter();
    camera.position.set(0, 1.7, 0);
    xr.place(0, 0, 0, 0);
    const cabeca0 = xr.headWorldPosition(new THREE.Vector3());
    camera.position.set(5, 1.7, 0);          // 5 m: erro de rastreio absurdo
    xr.place(0, 0, 0, 0);
    const cabeca1 = xr.headWorldPosition(new THREE.Vector3());
    assert.equal(+(cabeca1.x - cabeca0.x).toFixed(3), 5,
      'a cabeça não acompanhou o movimento físico');
    xr.consumirPasso();                       // o jogo absorve o que cabe num frame
    xr.place(0, 0, 0, 0);                     // e o rig é recolocado no MESMO ponto
    const cabeca2 = xr.headWorldPosition(new THREE.Vector3());
    const salto = Math.abs(cabeca2.x - cabeca1.x);
    assert.ok(salto <= 0.1501,
      `a vista saltou ${salto.toFixed(3)} m ao drenar: o acumulado foi cortado`);
  });

  it('o acumulado ESCOA inteiro, por mais fundo que esteja', () => {
    xr.enter();
    camera.position.set(0, 1.7, 0);
    xr.place(0, 0, 0, 0);
    camera.position.set(5, 1.7, 0);
    xr.place(0, 0, 0, 0);
    let total = 0, voltas = 0;
    for (; voltas < 200; voltas++) {
      const p = xr.consumirPasso();
      const m = Math.hypot(p.x, p.z);
      if (m < 1e-6) break;
      assert.ok(m <= 0.1501, `a volta ${voltas} entregou ${m.toFixed(3)} m ao colisor`);
      total += m;
    }
    assert.ok(Math.abs(total - 5) < 0.01,
      `escoaram ${total.toFixed(2)} m de 5: o excedente foi jogado fora em vez de entregue`);
  });

  it('REBASEAR (recentrar) não gera passo nenhum', () => {
    /* Recentrar muda o REFERENCIAL, não move ninguém. Sem rebasear, a mudança
       de origem chega ao rig como passo físico gigante e o jogador é
       teleportado pela própria distância dele até o centro — medido em sessão:
       0,78 m fora do centro davam 0,7778 m de deslocamento no mundo. */
    xr.enter();
    camera.position.set(0.8, 1.7, -0.6);
    xr.place(10, 0, 20, 0);
    xr.consumirPasso();
    xr.rebasear();
    camera.position.set(0, 1.7, 0);          // o reset levou a cabeça pro centro
    xr.place(10, 0, 20, 0);
    const p = xr.consumirPasso();
    assert.equal(+Math.hypot(p.x, p.z).toFixed(4), 0,
      `recentrar gerou ${Math.hypot(p.x, p.z).toFixed(3)} m de passo — o jogador seria movido no mundo`);
  });

  it('o teto preserva a DIREÇÃO do passo, não só o tamanho', () => {
    xr.enter();
    camera.position.set(0, 1.7, 0);
    xr.place(0, 0, 0, 0);
    camera.position.set(0, 1.7, -2);         // salto reto pra frente
    xr.place(0, 0, 0, 0);
    const p = xr.consumirPasso();
    assert.equal(+p.x.toFixed(3), 0, 'o corte torceu o passo pro lado');
    assert.ok(p.z < 0, 'o corte inverteu o sentido do passo');
  });

  it('passo de gente cabe folgado no teto', () => {
    xr.enter();
    camera.position.set(0, 1.7, 0);
    xr.place(0, 0, 0, 0);
    camera.position.set(0.02, 1.7, 0.01);    // ~2 cm: um frame andando depressa a 72 Hz
    xr.place(0, 0, 0, 0);
    const p = xr.consumirPasso();
    assert.equal(+p.x.toFixed(3), 0.02, 'o teto cortou um passo humano normal');
    assert.equal(+p.z.toFixed(3), 0.01);
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
