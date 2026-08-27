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
  /* CAMINHAR, não teleportar. O rig ignora delta maior que 35 cm num frame,
     porque isso não é passo humano — é recentrar, redefinição de piso ou falha
     de rastreio. Os casos abaixo andam em etapas de gente. */
  function andar(cam, place, x, z, etapa = 0.05) {
    const x0 = cam.position.x, z0 = cam.position.z;
    const n = Math.max(1, Math.ceil(Math.hypot(x - x0, z - z0) / etapa));
    for (let i = 1; i <= n; i++) {
      cam.position.x = x0 + (x - x0) * (i / n);
      cam.position.z = z0 + (z - z0) * (i / n);
      place();
    }
  }

  it('andar pelo cômodo move a cabeça, e o passo fica disponível pro jogo', () => {
    xr.enter();
    camera.position.set(0, 1.7, 0);
    xr.place(50, 0, -20, 0);
    const antes = xr.headWorldPosition(new THREE.Vector3());
    andar(camera, () => xr.place(50, 0, -20, 0), 0.8, -0.6);   // passo físico de 1 m, caminhado
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
    andar(camera, () => xr.place(0, 0, 0, 0), 3, 0);   // 3 m caminhados
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
    andar(camera, () => xr.place(0, 0, 0, 0), 5, 0);   // 5 m caminhados
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
    andar(camera, () => xr.place(0, 0, 0, 0), 5, 0);
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

  it('salto grande demais para ser humano NÃO vira passo', () => {
    /* A 72 Hz, andar depressa cobre ~2 cm por frame; 35 cm seriam 25 m/s.
       Delta assim é recentrar, piso redefinido ou rastreio perdido — nos três
       casos a resposta é aceitar a pose e não mover ninguém. Este limiar existe
       porque a ORDEM em que o runtime entrega a pose nova e o evento `reset`
       não é garantida, e a versão anterior apostou na ordem errada: a pose
       chega primeiro, o passo espúrio nasce, e a carência de frames chega
       tarde. Um limiar físico não precisa saber a ordem. */
    xr.enter();
    camera.position.set(0, 1.7, 0);
    xr.place(0, 0, 0, 0);
    xr.consumirPasso();
    camera.position.set(0.78, 1.7, 0);       // recentrar: a origem pulou
    xr.place(0, 0, 0, 0);
    const p = xr.consumirPasso();
    assert.equal(+Math.hypot(p.x, p.z).toFixed(4), 0,
      `um salto de 0,78 m num frame virou ${Math.hypot(p.x, p.z).toFixed(3)} m de passo — ` +
      'é assim que recentrar teleportava o jogador pela própria distância ao centro');
  });

  it('e a caminhada logo depois do salto continua funcionando', () => {
    xr.enter();
    camera.position.set(0, 1.7, 0);
    xr.place(0, 0, 0, 0);
    camera.position.set(2, 1.7, 0);          // salto ignorado
    xr.place(0, 0, 0, 0);
    xr.consumirPasso();
    andar(camera, () => xr.place(0, 0, 0, 0), 2.3, 0);   // 30 cm caminhados a partir dali
    let total = 0;
    for (let i = 0; i < 40; i++) {
      const q = xr.consumirPasso();
      const m = Math.hypot(q.x, q.z);
      if (m < 1e-6) break;
      total += m;
    }
    assert.ok(Math.abs(total - 0.3) < 0.01,
      `depois de um salto ignorado, 30 cm caminhados renderam ${total.toFixed(3)} m`);
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
    andar(camera, () => xr.place(0, 0, 0, 0), 0, -2);   // 2 m caminhados reto pra frente
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

/* ================================================================
   A POSE QUE O RIG LÊ É A DESTE FRAME — não a do frame anterior.

   O defeito que sobreviveu a três correções, medido em sessão imersiva:
   um salto de pose acima do limiar de passo humano deslocava a VISTA por
   um frame inteiro, do tamanho do salto (0,7778 m recentrando a 0,55/−0,55;
   1,0000 m num salto de 1 m), com o jogador parado no lugar.

   A CAUSA é a ordem do three (r185), lida no fonte:

     onAnimationFrame  → escreve as sub-câmeras de OLHO com a pose de AGORA
                       → chama o callback do jogo (o tick)
     tick              → `place()` lia `camera.position`
     render()          → só ALI chama `xr.updateCamera(camera)`, que é quem
                         escreve `camera.position` (three.module.js:17637)

   Logo `camera.position` dentro do tick é a pose que o `render()` do frame
   PASSADO deixou. O rig era posto no lugar de uma cabeça que já saiu de lá.

   COMO ESTE BLOCO MEDE, e por que o dublê é legítimo aqui: ele encena a
   ORDEM acima com as três funções cujo contrato eu li no fonte do three —
   nada mais. E encena também a pegadinha que o atalho óbvio esconde: a
   matriz de `xr.getCamera()` é a do OLHO ESQUERDO, enquanto a câmera do
   jogo recebe a câmera de UNIÃO, no meio dos olhos (`setProjectionFromUnion`).
   Quem trocar a fonte por `getCamera().matrix` conserta o atraso e planta
   meia distância interpupilar de desvio lateral no mundo — e este bloco
   falha por isso também.

   A prova de PRODUTO é `test/xr-body.test.js`, em sessão imersiva de
   verdade, medindo a vista. Aqui é a mecânica, exata e barata.
   ================================================================ */
describe('a pose é a DESTE frame, e não a do anterior', () => {
  const IPD = 0.063;   // Quest 3: a diferença medida entre olho e união foi IPD/2

  /* Encena um frame de XR na ordem do three. `alvo` é onde o jogo manda a
     cabeça ficar; `pose()` é o headset entregando a pose do frame; `vista()`
     é o que o `render()` vai compor — rig DESTE frame × pose DESTE frame. */
  function runtimeXR() {
    const poseCabeca = new THREE.Matrix4();      // união (o que updateCamera escreve)
    const olhoEsq = new THREE.Vector3(-IPD / 2, 0, 0);
    const arrayCam = {
      matrix: new THREE.Matrix4(),               // three copia a do olho 0 pra cá
      cameras: [{ matrix: new THREE.Matrix4() }, { matrix: new THREE.Matrix4() }],
    };
    const renderer = {
      xr: {
        isPresenting: true,
        getCamera: () => arrayCam,
        /* O que o three faz: escreve na câmera do jogo a pose da câmera de
           UNIÃO. (No three isso passa por `parent.matrixWorld⁻¹ ×
           cameraXR.matrixWorld`, onde o pai cancela — daí a forma direta.) */
        updateCamera: cam => {
          poseCabeca.decompose(cam.position, cam.quaternion, cam.scale);
        },
      },
    };
    let entregue = false;
    return {
      renderer,
      /* passo 1 do frame: o runtime entrega a pose nova */
      pose(x, z) {
        poseCabeca.makeTranslation(x, 1.7, z);
        arrayCam.cameras[0].matrix.makeTranslation(x + olhoEsq.x, 1.7, z);
        arrayCam.cameras[1].matrix.makeTranslation(x - olhoEsq.x, 1.7, z);
        arrayCam.matrix.copy(arrayCam.cameras[0].matrix);
        entregue = true;
      },
      /* passo 3 do frame: o render compõe, e só então escreve a câmera do jogo */
      vista(rig) {
        assert.ok(entregue, 'o teste compôs um frame sem o runtime ter entregue pose');
        rig.updateMatrixWorld(true);
        const m = new THREE.Matrix4().multiplyMatrices(rig.matrixWorld, poseCabeca);
        const v = new THREE.Vector3().setFromMatrixPosition(m);
        renderer.xr.updateCamera(camera);   // é aqui que camera.position é escrita
        return v;
      },
    };
  }

  let rt, xrr;
  beforeEach(() => {
    rt = runtimeXR();
    xrr = createXrRig({ THREE, scene, camera, renderer: rt.renderer });
    xrr.enter();
  });

  /* um frame inteiro: pose nova → tick (place) → render */
  const frame = (px, pz, alvo) => {
    rt.pose(px, pz);
    xrr.place(alvo[0], 0, alvo[1], alvo[2] || 0);
    return rt.vista(xrr.rig);
  };

  it('a cabeça cai EXATAMENTE onde o rig foi mandado pôr, todo frame', () => {
    /* Sem isto o erro é de um frame de movimento: pequeno andando, do tamanho
       do salto quando o jogador recentra. */
    const alvo = [50, -20];
    frame(0, 0, alvo);                       // primeiro frame: fixa a base
    for (let i = 1; i <= 30; i++) {
      const v = frame(0.02 * i, -0.01 * i, alvo);
      const passo = xrr.passoPendente;
      assert.ok(Math.abs(v.x - (alvo[0] + passo.x)) < 1e-9 &&
                Math.abs(v.z - (alvo[1] + passo.z)) < 1e-9,
        `frame ${i}: a vista caiu em (${v.x.toFixed(4)}, ${v.z.toFixed(4)}) e o rig foi ` +
        `mandado pôr a cabeça em (${(alvo[0] + passo.x).toFixed(4)}, ` +
        `${(alvo[1] + passo.z).toFixed(4)}) — o rig usou a pose de outro frame`);
    }
  });

  it('salto de pose acima do limiar NÃO desloca a vista (nem por um frame)', () => {
    /* O SINTOMA QUE SOBROU DEPOIS DE TRÊS CORREÇÕES. Acima de 0,35 m o delta é
       recusado como passo — e estava certo. Só que o rig daquele frame tinha
       sido calculado com a pose VELHA, então a vista aparecia deslocada do
       tamanho inteiro do salto por um frame. Medido em sessão: 1,0000 m. */
    const alvo = [0, 0];
    frame(0, 0, alvo);
    const antes = frame(0, 0, alvo);
    const durante = frame(1.0, 0, alvo);     // 1 m num frame: recentrar, não caminhada
    const depois = frame(1.0, 0, alvo);
    const salto = Math.hypot(durante.x - antes.x, durante.z - antes.z);
    assert.ok(salto < 1e-9,
      `a vista pulou ${salto.toFixed(4)} m no frame do salto de pose`);
    assert.ok(Math.hypot(depois.x - antes.x, depois.z - antes.z) < 1e-9,
      'e ainda voltou no frame seguinte — o tranco de ida e volta do relato');
    const p = xrr.consumirPasso();
    assert.equal(+Math.hypot(p.x, p.z).toFixed(6), 0,
      'e o salto não pode virar passo: o colisor atravessaria parede');
  });

  it('recentrar a 0,78 m do centro não move a vista', () => {
    /* O caso do validador, com os números dele: 0,55/−0,55 do centro davam
       0,7778 m de deslocamento da vista por um frame. */
    const alvo = [10, 20];
    frame(0, 0, alvo);
    for (let i = 1; i <= 22; i++) frame(0.025 * i, -0.025 * i, alvo);
    const antes = frame(0.55, -0.55, alvo);
    xrr.rebasear();                          // o evento `reset` do espaço de referência
    const durante = frame(0, 0, alvo);       // a origem foi pro centro; ninguém andou
    const salto = Math.hypot(durante.x - antes.x, durante.z - antes.z);
    assert.ok(salto < 1e-9,
      `recentrar a ${Math.hypot(0.55, 0.55).toFixed(4)} m do centro deslocou a vista ` +
      `${salto.toFixed(4)} m — é o tranco de um frame, do tamanho da distância ao centro`);
  });

  it('a caminhada continua chegando ao colisor pelo passo acumulado', () => {
    /* Cerca contra o conserto preguiçoso: fixar a cabeça no alvo todo frame
       zeraria os saltos acima E faria andar pelo cômodo não mover ninguém. */
    const alvo = [0, 0];
    frame(0, 0, alvo);
    for (let i = 1; i <= 20; i++) frame(0.03 * i, 0, alvo);
    let total = 0;
    for (let i = 0; i < 40; i++) {
      const p = xrr.consumirPasso();
      const m = Math.hypot(p.x, p.z);
      if (m < 1e-9) break;
      total += m;
    }
    assert.ok(Math.abs(total - 0.6) < 1e-6,
      `0,60 m caminhados renderam ${total.toFixed(4)} m de passo pro jogo`);
  });

  it('sem renderer o módulo continua lendo camera.position (testes de unidade)', () => {
    const solto = createXrRig({ THREE, scene, camera });
    solto.enter();
    camera.position.set(0, 1.7, 0);
    solto.place(0, 0, 0, 0);
    camera.position.set(0.02, 1.7, 0);
    solto.place(0, 0, 0, 0);
    assert.equal(+solto.consumirPasso().x.toFixed(3), 0.02);
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
