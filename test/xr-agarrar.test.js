/* ================================================================
   QA — D3: PEGAR É COM A EMPUNHADURA, E PERTO (js/xr/xrinteract.js).

   O critério é literal: "o **grip** pega; raio de agarre direto entre **5 e
   10 cm** da mão; se houver agarre à distância, ele é um verbo separado e
   explícito. **Reprova:** pegar no gatilho, ou 'pegar' que é na verdade um
   comando de proximidade do corpo."

   Antes desta rodada o gesto era o GATILHO da mão de apoio, e a decisão de
   "está perto" era do corpo — a mão não entrava na conta em momento nenhum.
   Reprovava nos dois pontos ao mesmo tempo.

   POR QUE ESTE ARQUIVO NÃO É DE BROWSER. O que se mede aqui é GEOMETRIA:
   distância da mão à casca do alvo, DIREÇÃO do puxão, tempo de retenção do
   grip. Isso precisa de número exato e de frames cravados, não de uma sessão
   com 72 Hz variável — o efeito no mundo (baú abrindo, granada saindo) é
   medido em test/xr-verbos.test.js, dentro de sessão imersiva de verdade.
   O three aqui é o de node_modules, o mesmo do jogo.

   O QUE NÃO PODE ACONTECER, e cada um tem teste: pegar no gatilho; o agarre
   direto responder longe da mão; o agarre à distância disparar sem gesto
   nenhum (aí ele não seria "separado e explícito", seria o comando de
   proximidade que a régua reprova); o puxão valer para qualquer lado (medir
   módulo em vez de direção já deixou passar movimento invertido nesta base); e
   o alcance de GAMEPLAY crescer um centímetro que seja — isso é vetor de
   trapaça, não conforto.
   ================================================================ */
'use strict';
const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

let THREE, createXrInteract, RAIO_AGARRE, CASCA, FLICK_VEL, HOLD_LONGE;
before(async () => {
  THREE = await import('three');
  ({ createXrInteract, RAIO_AGARRE, CASCA, FLICK_VEL, HOLD_LONGE } =
    await import('../js/xr/xrinteract.js'));
});

/* Cenário mínimo: chão plano, jogador na origem, UM baú à frente dentro do raio
   de gameplay que js/interact.js usa (2,4 m). Nada de veículo, helicóptero,
   canhão ou segredo — o que está em teste é o VERBO, não a lista de alvos. */
const BAU = { x: 0, z: -1.5 };

function cenario({ bauX = BAU.x, bauZ = BAU.z } = {}) {
  const scene = new THREE.Scene();
  const player = { pos: new THREE.Vector3(0, 0, 0), dead: false };
  const mao = new THREE.Object3D();
  scene.add(mao);
  const inter = createXrInteract({
    THREE, scene, player, state: {},
    heightAt: () => 0,
    Structures: { chestSpots: [{ x: bauX, z: bauZ }], bazookaSpot: null },
    Car: null, Heli: null, arsenal: [],
    win: null,               // sem DOM: nada de rótulo, nada de dispatchEvent
    despachar: false,        // o que se mede aqui é a INTENÇÃO, não o teclado
  });
  return { scene, player, mao, inter };
}

/* Fonte de entrada no formato do WebXR. Botões do xr-standard:
   0 gatilho, 1 empunhadura. */
function fonte(lado, { gatilho = false, grip = false } = {}) {
  return {
    handedness: lado,
    gamepad: {
      axes: [0, 0, 0, 0],
      buttons: [{ pressed: gatilho }, { pressed: grip }, { pressed: false },
        { pressed: false }, { pressed: false }, { pressed: false }],
    },
  };
}

/* põe a mão num ponto do mundo, apontando para outro */
function porMao(mao, de, para) {
  mao.position.set(de[0], de[1], de[2]);
  mao.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().lookAt(
      new THREE.Vector3(de[0], de[1], de[2]),
      new THREE.Vector3(para[0], para[1], para[2]),
      new THREE.Vector3(0, 1, 0)));
  mao.updateWorldMatrix(true, false);
}

const DT = 1 / 72;   // o frame do Quest 3

let C;
beforeEach(() => { C = cenario(); });

/* ---------------------------------------------------------------- */
describe('D3 — o botão que pega é a EMPUNHADURA', () => {
  /* A mão encostada no baú: o alvo está a `casca + 5 cm` do centro, dentro do
     raio de agarre. É o caso em que o agarre direto TEM que valer. */
  const encostada = () => {
    porMao(C.mao, [BAU.x, 0, BAU.z + CASCA.bau + 0.05], [BAU.x, 0, BAU.z]);
  };

  it('o grip AGARRA', () => {
    encostada();
    C.inter.update({ maoRaio: C.mao, fontes: [fonte('left')], dt: DT });
    const r = C.inter.update({ maoRaio: C.mao, fontes: [fonte('left', { grip: true })], dt: DT });
    assert.equal(r.gesto, true, 'a empunhadura não agarrou — é o botão que a plataforma manda usar');
    assert.equal(r.modo, 'direto', `com a mão encostada o agarre é DIRETO, veio ${r.modo}`);
  });

  it('o GATILHO não agarra — pegar no gatilho é o que a régua reprova', () => {
    encostada();
    C.inter.update({ maoRaio: C.mao, fontes: [fonte('left')], dt: DT });
    const r = C.inter.update({ maoRaio: C.mao, fontes: [fonte('left', { gatilho: true })], dt: DT });
    assert.equal(r.gesto, false,
      'o gatilho continua agarrando: VRC.Quest.Input.2 pede grip, e o gatilho é da arma');
  });

  it('segurar o grip não vira rajada — um aperto, um agarre', () => {
    encostada();
    const f = [fonte('left', { grip: true })];
    assert.equal(C.inter.update({ maoRaio: C.mao, fontes: f, dt: DT }).gesto, true);
    assert.equal(C.inter.update({ maoRaio: C.mao, fontes: f, dt: DT }).gesto, false,
      'segurar o grip entraria e sairia do carro dez vezes por segundo');
  });
});

describe('D3 — o agarre DIRETO é perto de verdade (5 a 10 cm)', () => {
  it('o raio do agarre direto está na faixa de 5 a 10 cm que a régua exige', () => {
    assert.ok(RAIO_AGARRE >= 0.05 && RAIO_AGARRE <= 0.10,
      `o raio de agarre direto é ${RAIO_AGARRE} m, fora da faixa 0,05–0,10 m que o critério exige`);
  });

  it('a mão encostada na casca agarra DIRETO, no primeiro frame do grip', () => {
    porMao(C.mao, [BAU.x, 0, BAU.z + CASCA.bau + RAIO_AGARRE * 0.5], [BAU.x, 0, BAU.z]);
    C.inter.update({ maoRaio: C.mao, fontes: [fonte('left')], dt: DT });
    const r = C.inter.update({ maoRaio: C.mao, fontes: [fonte('left', { grip: true })], dt: DT });
    assert.equal(r.modo, 'direto');
    assert.equal(r.gesto, true, 'a mão encostada no baú não agarrou de imediato');
  });

  it('a mão a 30 cm da casca NÃO é agarre direto — senão "perto" não quer dizer nada', () => {
    porMao(C.mao, [BAU.x, 0, BAU.z + CASCA.bau + 0.30], [BAU.x, 0, BAU.z]);
    C.inter.update({ maoRaio: C.mao, fontes: [fonte('left')], dt: DT });
    const r = C.inter.update({ maoRaio: C.mao, fontes: [fonte('left', { grip: true })], dt: DT });
    assert.notEqual(r.modo, 'direto',
      'a 30 cm o agarre ainda se diz direto: o raio de 7,5 cm virou enfeite');
    assert.equal(r.gesto, false, 'agarrou de longe sem o verbo de distância');
  });

  it('a distância é medida da MÃO, não do corpo — o corpo parado, a mão decide', () => {
    /* O jogador não sai do lugar; só a mão vai até o baú e volta. Se a decisão
       fosse de `player.pos` (o defeito que D2 e D3 cobram juntos), o resultado
       seria o mesmo nos dois frames. */
    const antes = C.player.pos.clone();
    porMao(C.mao, [BAU.x, 0, BAU.z + CASCA.bau + 0.04], [BAU.x, 0, BAU.z]);
    C.inter.update({ maoRaio: C.mao, fontes: [fonte('left')], dt: DT });
    const perto = C.inter.update({ maoRaio: C.mao, fontes: [fonte('left', { grip: true })], dt: DT }).modo;

    const C2 = cenario();
    porMao(C2.mao, [0, 1.4, 0], [BAU.x, 0, BAU.z]);      // mão recolhida ao peito
    C2.inter.update({ maoRaio: C2.mao, fontes: [fonte('left')], dt: DT });
    const longe = C2.inter.update({ maoRaio: C2.mao, fontes: [fonte('left', { grip: true })], dt: DT }).modo;

    assert.deepEqual(C.player.pos.toArray(), antes.toArray(), 'o teste mexeu no jogador sem querer');
    assert.equal(perto, 'direto');
    assert.notEqual(longe, 'direto',
      'com o corpo no MESMO lugar, esticar ou recolher a mão deu no mesmo: a decisão é do corpo, não da mão');
  });
});

describe('D3 — o agarre à DISTÂNCIA é um verbo separado e explícito', () => {
  /* Mão recolhida ao peito, apontando para o baú. O baú continua dentro do raio
     de gameplay (1,5 m < 2,4 m), então a AÇÃO é permitida — o que muda é que a
     mão não está encostada, e por isso o verbo tem de ser outro. */
  const apontando = C0 => porMao((C0 || C).mao, [0, 1.4, 0], [BAU.x, 0, BAU.z]);

  it('apertar e soltar o grip rápido, de longe, NÃO agarra', () => {
    apontando();
    C.inter.update({ maoRaio: C.mao, fontes: [fonte('left')], dt: DT });
    const r = C.inter.update({ maoRaio: C.mao, fontes: [fonte('left', { grip: true })], dt: DT });
    assert.equal(r.gesto, false,
      'o grip sozinho agarrou de longe: aí não é verbo separado, é o comando de proximidade que a régua reprova');
  });

  it('o PUXÃO (flick) agarra — é o gesto das gravity gloves', () => {
    apontando();
    const f = [fonte('left', { grip: true })];
    C.inter.update({ maoRaio: C.mao, fontes: [fonte('left')], dt: DT });
    C.inter.update({ maoRaio: C.mao, fontes: f, dt: DT });
    // a mão recua na direção do próprio apontar, acima do limiar
    const rec = FLICK_VEL * DT * 1.6;
    C.mao.position.z += rec * Math.cos(0) + rec;    // afasta do alvo = puxa para si
    C.mao.updateWorldMatrix(true, false);
    const r = C.inter.update({ maoRaio: C.mao, fontes: f, dt: DT });
    assert.equal(r.gesto, true, 'o puxão de pulso não agarrou nada');
    assert.equal(r.modo, 'distancia', `o modo devia ser distancia, veio ${r.modo}`);
  });

  it('EMPURRAR a mão não agarra — o puxão tem direção, e direção importa', () => {
    apontando();
    const f = [fonte('left', { grip: true })];
    C.inter.update({ maoRaio: C.mao, fontes: [fonte('left')], dt: DT });
    C.inter.update({ maoRaio: C.mao, fontes: f, dt: DT });
    // MESMO deslocamento, sentido oposto: a mão vai na direção do baú
    const rec = FLICK_VEL * DT * 1.6;
    C.mao.position.z -= rec * 2;
    C.mao.updateWorldMatrix(true, false);
    const r = C.inter.update({ maoRaio: C.mao, fontes: f, dt: DT });
    assert.equal(r.gesto, false,
      'empurrar a mão para a frente agarrou igual: o teste de módulo passaria, o jogador levaria susto');
  });

  it('MANTER o grip apontado agarra — quem não consegue dar o flick também joga', () => {
    apontando();
    const f = [fonte('left', { grip: true })];
    C.inter.update({ maoRaio: C.mao, fontes: [fonte('left')], dt: DT });
    let r = null, t = 0;
    for (let i = 0; i < Math.ceil(HOLD_LONGE / DT) + 2; i++) {
      r = C.inter.update({ maoRaio: C.mao, fontes: f, dt: DT });
      t += DT;
      if (r.gesto) break;
    }
    assert.equal(r.gesto, true, `manter o grip por ${t.toFixed(2)} s não agarrou`);
    assert.equal(r.modo, 'distancia');
    assert.ok(t >= HOLD_LONGE * 0.9,
      `agarrou cedo demais (${t.toFixed(2)} s): sem retenção, o hold não é distinguível de um toque`);
  });

  it('manter o grip sem alvo apontado não agarra nada', () => {
    porMao(C.mao, [0, 1.4, 0], [0, 1.4, 5]);   // olhando para o lado oposto do baú
    const f = [fonte('left', { grip: true })];
    let gestos = 0;
    for (let i = 0; i < Math.ceil(HOLD_LONGE / DT) + 6; i++) {
      if (C.inter.update({ maoRaio: C.mao, fontes: f, dt: DT }).gesto) gestos++;
    }
    assert.equal(gestos, 0, 'segurar o grip virado para o nada agarrou assim mesmo');
  });
});

describe('D3 — o alcance de GAMEPLAY não cresce (isso seria trapaça, não conforto)', () => {
  it('baú a 7,5 m: nem o flick nem o hold acionam', () => {
    const C2 = cenario({ bauZ: -7.5 });          // muito além dos 2,4 m de js/interact.js
    porMao(C2.mao, [0, 1.4, 0], [0, 0, -7.5]);
    const f = [fonte('left', { grip: true })];
    C2.inter.update({ maoRaio: C2.mao, fontes: [fonte('left')], dt: DT });
    let gestos = 0;
    for (let i = 0; i < Math.ceil(HOLD_LONGE / DT) + 8; i++) {
      C2.mao.position.z += 0.05;                 // puxando o tempo todo
      C2.mao.updateWorldMatrix(true, false);
      if (C2.inter.update({ maoRaio: C2.mao, fontes: f, dt: DT }).gesto) gestos++;
    }
    assert.equal(gestos, 0, 'o baú a 7,5 m foi acionado: a camada de VR ampliou o alcance do jogo');
    const e = C2.inter.estado();
    if (e.alvo) assert.equal(e.alvo.acionavel, false, 'marcou como acionável o que o jogo recusa');
  });
});

describe('D3 — a forma que o navegador entrega de verdade', () => {
  it('lê o grip de um array-like que NÃO é Array', () => {
    /* `session.inputSources` é um XRInputSourceArray. O emulador faz
       `class XRInputSourceArray extends Array`, então Array.isArray dá TRUE nele
       e FALSE no aparelho — foi esse o bug que descartou os dois controles por
       semanas com a suíte verde. */
    const nativo = itens => {
      const o = { length: itens.length, [Symbol.iterator]: Array.prototype[Symbol.iterator] };
      itens.forEach((v, i) => { o[i] = v; });
      return o;
    };
    assert.equal(Array.isArray(nativo([])), false, 'o dublê tem que NÃO ser Array');
    porMao(C.mao, [BAU.x, 0, BAU.z + CASCA.bau + 0.04], [BAU.x, 0, BAU.z]);
    C.inter.update({ maoRaio: C.mao, fontes: nativo([fonte('left')]), dt: DT });
    const r = C.inter.update({
      maoRaio: C.mao, fontes: nativo([fonte('left', { grip: true })]), dt: DT,
    });
    assert.equal(r.gesto, true, 'o agarre não leu a forma real do WebXR');
  });
});
