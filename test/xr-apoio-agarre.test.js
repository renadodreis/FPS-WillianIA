/* ================================================================
   QA — A MÃO QUE APOIA A ARMA NÃO PODE AGARRAR O MUNDO.

   O DEFEITO, medido pela frente da arma e registrado no relatório dela: o
   grip ESQUERDO tem três trabalhos que disputam o mesmo botão — buscar o
   pente, apoiar a arma e agarrar coisa do mundo — e `js/xr/xrinteract.js` lê
   a empunhadura direto das fontes de entrada, sem saber de nenhum dos outros
   dois. Consequência concreta: o jogador põe a mão de apoio no guarda-mão e
   segura, que é o gesto de firmar a arma para atirar; passados
   `HOLD_LONGE` segundos com a mão apontada para um baú, o jogo entende
   "agarre à distância" e abre o baú no meio do tiroteio.

   O critério D3 diz que o agarre à distância tem de ser "um verbo separado e
   EXPLÍCITO", e reprova "'pegar' que é na verdade um comando de proximidade".
   Um agarre que dispara enquanto o jogador está fazendo outra coisa com o
   mesmo botão é exatamente isso: implícito.

   POR QUE ESTE ARQUIVO NÃO É DE BROWSER, e é o mesmo motivo de
   `test/xr-agarrar.test.js`: o que se mede é a DECISÃO do módulo com frames
   cravados, não o efeito na tela. O efeito no mundo já tem cobertura em
   sessão imersiva (`test/xr-verbos-efeito.test.js`).

   POR QUE NÃO PASSA POR ACIDENTE. O caso do bloqueio sozinho passaria com o
   agarre INTEIRO quebrado — é o formato 1 da lista do CLAUDE.md, asserção que
   não pode falhar. Por isso cada caso de bloqueio vem colado com o seu
   complementar: MESMO gesto, MESMA geometria, MESMOS frames, só que sem
   apoiar — e aí tem de agarrar. Os dois juntos medem a PORTA, não o silêncio.
   ================================================================ */
'use strict';
const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

let THREE, createXrInteract, CASCA, RAIO_AGARRE, HOLD_LONGE;
before(async () => {
  THREE = await import('three');
  ({ createXrInteract, CASCA, RAIO_AGARRE, HOLD_LONGE } =
    await import('../js/xr/xrinteract.js'));
});

const BAU = { x: 0, z: -1.5 };

function cenario() {
  const scene = new THREE.Scene();
  const player = { pos: new THREE.Vector3(0, 0, 0), dead: false };
  const mao = new THREE.Object3D();
  scene.add(mao);
  const inter = createXrInteract({
    THREE, scene, player, state: {},
    heightAt: () => 0,
    Structures: { chestSpots: [{ x: BAU.x, z: BAU.z }], bazookaSpot: null },
    Car: null, Heli: null, arsenal: [],
    win: null, despachar: false,
  });
  return { scene, player, mao, inter };
}

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

function porMao(mao, de, para) {
  mao.position.set(de[0], de[1], de[2]);
  mao.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().lookAt(
      new THREE.Vector3(de[0], de[1], de[2]),
      new THREE.Vector3(para[0], para[1], para[2]),
      new THREE.Vector3(0, 1, 0)));
  mao.updateWorldMatrix(true, false);
}

const DT = 1 / 72;
let C;
beforeEach(() => { C = cenario(); });

/* a mão encostada na casca do baú: é onde o agarre DIRETO tem de valer */
const encostada = () => porMao(C.mao, [BAU.x, 0, BAU.z + CASCA.bau + RAIO_AGARRE * 0.5], [BAU.x, 0, BAU.z]);
/* longe, mas apontando: é onde o agarre à distância (hold) tem de valer */
const apontandoDeLonge = () => porMao(C.mao, [BAU.x, 0, BAU.z + 1.2], [BAU.x, 0, BAU.z]);

/* segura o grip por `HOLD_LONGE` + folga, e devolve o último resultado com
   gesto — que é o instante em que o agarre à distância dispara */
function segurar(inter, mao, apoiando) {
  inter.update({ maoRaio: mao, fontes: [fonte('left')], dt: DT, apoiando });
  const frames = Math.ceil((HOLD_LONGE + 0.10) / DT);
  let disparou = null;
  for (let i = 0; i < frames; i++) {
    const r = inter.update({ maoRaio: mao, fontes: [fonte('left', { grip: true })], dt: DT, apoiando });
    if (r.gesto && !disparou) disparou = r;
  }
  return disparou;
}

describe('a mão que APOIA a arma não agarra o mundo (D3: o agarre é explícito)', () => {
  it('APOIANDO, manter o grip apontado NÃO agarra à distância', () => {
    apontandoDeLonge();
    const bloqueado = segurar(C.inter, C.mao, true);
    assert.equal(bloqueado, null,
      `apoiando a arma, segurar o grip por ${HOLD_LONGE.toFixed(2)} s agarrou pelo modo ` +
      `"${bloqueado && bloqueado.modo}" — firmar a arma abriu um baú no meio do tiroteio`);
  });

  it('e o COMPLEMENTAR: sem apoiar, o MESMO gesto agarra', () => {
    /* sem este caso o de cima passaria com o agarre à distância inteiro
       quebrado — asserção que não pode falhar, formato 1 da lista */
    apontandoDeLonge();
    const solto = segurar(C.inter, C.mao, false);
    assert.ok(solto && solto.gesto === true,
      'sem apoiar, manter o grip apontado deixou de agarrar — o bloqueio comeu o verbo inteiro');
    assert.equal(solto.modo, 'distancia',
      `o gesto de manter deveria agarrar pelo modo à distância, veio "${solto.modo}"`);
  });

  it('APOIANDO, nem o agarre DIRETO com a mão encostada passa', () => {
    /* O direto é o caminho mais curto do módulo (dispara no primeiro frame do
       grip), então ele é o que mais facilmente escapa de um bloqueio posto
       só no ramo de longe. */
    encostada();
    C.inter.update({ maoRaio: C.mao, fontes: [fonte('left')], dt: DT, apoiando: true });
    const r = C.inter.update({ maoRaio: C.mao, fontes: [fonte('left', { grip: true })], dt: DT, apoiando: true });
    assert.equal(r.gesto, false,
      `apoiando a arma, a mão encostada no baú agarrou pelo modo "${r.modo}" — a mão de apoio fica no guarda-mão, ` +
      'e o guarda-mão passa perto de tudo que o jogador contorna');
  });

  it('e o COMPLEMENTAR: sem apoiar, a mão encostada agarra DIRETO', () => {
    encostada();
    C.inter.update({ maoRaio: C.mao, fontes: [fonte('left')], dt: DT, apoiando: false });
    const r = C.inter.update({ maoRaio: C.mao, fontes: [fonte('left', { grip: true })], dt: DT, apoiando: false });
    assert.equal(r.gesto, true, 'sem apoiar, a mão encostada no baú deixou de agarrar');
    assert.equal(r.modo, 'direto');
  });

  it('soltar o apoio devolve o agarre no MESMO aperto seguinte', () => {
    /* O bloqueio não pode deixar resíduo: quem larga o guarda-mão para pegar
       uma caixa não pode precisar de um aperto extra para "destravar". */
    apontandoDeLonge();
    assert.equal(segurar(C.inter, C.mao, true), null, 'o cenário não bloqueou — nada a medir depois');
    const depois = segurar(C.inter, C.mao, false);
    assert.ok(depois && depois.gesto === true,
      'depois de soltar o apoio, o próximo aperto continuou sem agarrar — o bloqueio deixou resíduo');
  });

  it('o relógio do agarre NÃO acumula enquanto a mão apoia', () => {
    /* O DEFEITO, achado pela frente da arma medindo o próprio vizinho: a porta
       fechava o agarre, mas `gripSeguraT` continuava CRESCENDO por baixo dela.
       Resultado medido: segurando o grip 0,500 s apontado para um baú com o
       apoio ligado (zero agarres, correto), o PRIMEIRO frame em que o apoio cai
       — no MESMO aperto — dispara `modo: 'distancia'`, porque o relógio já
       passou de `HOLD_LONGE` faz tempo.

       Na prática é o gesto mais comum do jogo: firmar a arma para atirar e
       depois soltar o guarda-mão. O jogador larga o apoio e um baú abre.

       O que a §4.3 da referência pede é "zerado E travado", não só travado. */
    apontandoDeLonge();
    const frames = Math.ceil((HOLD_LONGE + 0.20) / DT);
    C.inter.update({ maoRaio: C.mao, fontes: [fonte('left')], dt: DT, apoiando: true });
    for (let i = 0; i < frames; i++) {
      C.inter.update({ maoRaio: C.mao, fontes: [fonte('left', { grip: true })], dt: DT, apoiando: true });
    }
    /* MESMO APERTO, apoio cai: o grip nunca foi solto */
    const r = C.inter.update({ maoRaio: C.mao, fontes: [fonte('left', { grip: true })], dt: DT, apoiando: false });
    assert.equal(r.gesto, false,
      `soltar o apoio no meio do aperto agarrou na hora, pelo modo "${r.modo}" — o relógio do agarre ` +
      `acumulou os ${(frames * DT).toFixed(3)} s em que a mão estava apoiando`);
  });

  it('e o COMPLEMENTAR: sem apoiar em momento nenhum, o relógio conta e agarra', () => {
    /* sem este caso o de cima passaria com o relógio zerado para sempre */
    apontandoDeLonge();
    const solto = segurar(C.inter, C.mao, false);
    assert.ok(solto && solto.gesto === true,
      'o relógio parou de contar mesmo sem apoio — o conserto comeu o agarre à distância');
  });

  it('o parâmetro é OPCIONAL: quem não o passa continua agarrando como antes', () => {
    /* Contrato com o resto da base: `js/xr/xrinteract.js` é chamado de mais de
       um lugar, e um parâmetro novo que mude o padrão quebraria os chamadores
       que não sabem dele. */
    encostada();
    C.inter.update({ maoRaio: C.mao, fontes: [fonte('left')], dt: DT });
    const r = C.inter.update({ maoRaio: C.mao, fontes: [fonte('left', { grip: true })], dt: DT });
    assert.equal(r.gesto, true, 'sem passar `apoiando`, o agarre parou de funcionar');
  });
});
