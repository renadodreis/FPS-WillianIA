'use strict';

/* ================================================================
   POSTURA NO SERVIDOR — o que o `state` diz sobre agachar e o que o
   servidor repassa no `playerUpdate` (função pura `crouchFromState`, a
   MESMA que o handler de `state` chama).

   Contrato:
   - o campo é um NÚMERO em [0, 1] (0 = em pé, 1 = agachado; o cliente manda
     o `crouchT` dele, que anda suave entre os dois). Qualquer outra coisa
     vira 0 — em pé é a postura MAIS visível, então lixo no campo nunca
     esconde ninguém;
   - só vale a pé: nave, queda, paraquedas, carro e helicóptero mandam 0;
   - agachado anda a 2,6 m/s (game.js CROUCH_SPEED). Quem se desloca mais
     rápido que isso (com folga para a rede) é repassado EM PÉ: dizer
     "agachado" enquanto corre não compra silhueta menor a toda velocidade.
     A velocidade é o CAMINHO percorrido (soma dos trechos) na janela, não o
     deslocamento — zigue-zague no lugar não a disfarça.
   ================================================================ */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { crouchFromState, CROUCH } = require(path.join(__dirname, '..', 'server.js'));
const { mulberry32 } = require(path.join(__dirname, '..', 'server.js'));

/* Um jogador que manda `state` a 10 Hz (o setInterval de 100 ms do
   br-game.js) andando em linha reta a `v` m/s (ou em zigue-zague), com a
   chegada no servidor atrasada por `jitter(i)` ms. Devolve o que o servidor
   repassaria em cada pacote. */
function simula({ v, crouch = 1, n = 60, jitter = () => 0, zigzag = 0, extra = {} }) {
  const p = { pos: [0, 0, 0] };
  const out = [];
  let x = 0, z = 0, dir = 1, lastArr = -Infinity;
  for (let i = 0; i < n; i++) {
    const tSend = i * 100;
    if (i > 0) {
      if (zigzag > 0) {
        // vai e volta: muda de sentido a cada `zigzag` pacotes
        if (i % zigzag === 0) dir = -dir;
        x += dir * v * 0.1;
      } else z += v * 0.1;
    }
    // chegada nunca antes da anterior (TCP entrega em ordem)
    const arr = Math.max(lastArr, tSend + jitter(i));
    lastArr = arr;
    p.pos = [x, 0, z];
    out.push({ t: arr, c: crouchFromState(p, { pos: p.pos, crouch, ...extra }, arr) });
  }
  return out;
}
const frac = (xs, pred) => xs.filter(pred).length / xs.length;

describe('Postura no servidor — crouchFromState', () => {
  it('exporta a função e as constantes do portão', () => {
    assert.equal(typeof crouchFromState, 'function', 'server.js não exporta crouchFromState');
    assert.ok(CROUCH && CROUCH.SPEED_MAX > 2.6 && CROUCH.SPEED_MAX < 5.2,
      `teto de velocidade agachado fora de (2,6; 5,2): ${CROUCH && CROUCH.SPEED_MAX}`);
  });

  it('parado e agachado: repassa a postura; valor fracionário passa como veio', () => {
    for (const c of [1, 0.5, 0.25, 0]) {
      const r = simula({ v: 0, crouch: c, n: 12 });
      assert.ok(r.every(s => s.c === c), `agachado ${c} parado virou ${JSON.stringify(r.map(s => s.c))}`);
    }
  });

  it('tipo errado vira EM PÉ (0) e número fora da faixa é limitado a [0, 1]', () => {
    const casos = [['1', 0], [true, 0], [null, 0], [undefined, 0], [{}, 0], [[1], 0],
      [NaN, 0], [Infinity, 0], [-Infinity, 0], [-5, 0], [7, 1], [1.0000001, 1]];
    for (const [cru, esperado] of casos) {
      const p = { pos: [0, 0, 0] };
      let c;
      for (let i = 0; i < 8; i++) c = crouchFromState(p, { pos: [0, 0, 0], crouch: cru }, i * 100);
      assert.equal(c, esperado, `crouch ${JSON.stringify(cru)} (${typeof cru}) virou ${c}, esperado ${esperado}`);
    }
  });

  it('fora do chão não existe agachar: nave, queda, paraquedas, carro e helicóptero mandam 0', () => {
    const fora = [
      { ship: true }, { fall: true }, { chute: true }, { car: 3 }, { heli: true },
    ];
    for (const extra of fora) {
      const p = { pos: [0, 0, 0], ship: !!extra.ship, fall: !!(extra.fall || extra.chute) };
      let c;
      for (let i = 0; i < 8; i++) c = crouchFromState(p, { pos: [0, 0, 0], crouch: 1, ...extra }, i * 100);
      assert.equal(c, 0, `agachado aceito fora do chão: ${JSON.stringify(extra)}`);
    }
    // carro -1 = a pé (é o que o cliente manda fora do veículo)
    const p = { pos: [0, 0, 0] };
    let c;
    for (let i = 0; i < 8; i++) c = crouchFromState(p, { pos: [0, 0, 0], crouch: 1, car: -1 }, i * 100);
    assert.equal(c, 1, 'car: -1 (a pé) derrubou o agachado');
  });

  it('agachado de verdade (2,6 m/s) passa, inclusive com a rede tremendo ±40 ms', (t) => {
    const rng = mulberry32(7);
    const limpo = simula({ v: 2.6 });
    const tremido = simula({ v: 2.6, n: 400, jitter: () => (rng() * 2 - 1) * 40 });
    const fl = frac(limpo, s => s.c === 1), ft = frac(tremido, s => s.c === 1);
    t.diagnostic(`2,6 m/s agachado: repassado agachado em ${(fl * 100).toFixed(1)} % (sem tremor) e ${(ft * 100).toFixed(1)} % (±40 ms)`);
    assert.equal(fl, 1, 'agachado honesto derrubado para em pé sem tremor de rede nenhum');
    assert.ok(ft >= 0.99, `agachado honesto derrubado em ${((1 - ft) * 100).toFixed(1)} % dos pacotes com ±40 ms`);
  });

  it('quem diz agachado ANDANDO (5,2 m/s) ou CORRENDO (8,6 m/s) aparece em pé', (t) => {
    for (const v of [5.2, 8.6]) {
      const r = simula({ v });
      // depois de a janela encher, nenhum pacote pode passar agachado
      const cheio = r.filter(s => s.t >= CROUCH.WINDOW_S * 1000 + 100);
      const passou = cheio.filter(s => s.c > 0).length;
      t.diagnostic(`${v} m/s dizendo agachado: ${passou}/${cheio.length} pacotes repassados agachados`);
      assert.equal(passou, 0, `a ${v} m/s o agachado mentiroso passou em ${passou} pacotes`);
    }
  });

  it('zigue-zague no lugar a 5,2 m/s dizendo agachado aparece em pé (caminho, não deslocamento)', (t) => {
    for (const zz of [1, 2, 3]) {
      const r = simula({ v: 5.2, zigzag: zz });
      const cheio = r.filter(s => s.t >= CROUCH.WINDOW_S * 1000 + 100);
      const passou = cheio.filter(s => s.c > 0).length;
      t.diagnostic(`zigue-zague a cada ${zz} pacote(s): ${passou}/${cheio.length} passaram agachados`);
      assert.equal(passou, 0, `zigue-zague (${zz}) disfarçou a velocidade: ${passou} pacotes agachados`);
    }
  });

  it('flood de states no mesmo instante não quebra a conta (sem divisão por zero, memória limitada)', () => {
    const p = { pos: [0, 0, 0] };
    let c;
    for (let i = 0; i < 5000; i++) {
      p.pos = [i * 0.001, 0, 0];
      c = crouchFromState(p, { pos: p.pos, crouch: 1 }, 1000);
    }
    assert.ok(Number.isFinite(c) && c >= 0 && c <= 1, `postura virou ${c}`);
    assert.ok(p.crouchHist.length <= 64, `histórico cresceu sem teto: ${p.crouchHist.length}`);
    // 5 m em "0 s" é velocidade infinita: em pé
    assert.equal(c, 0, 'teleporte em rajada passou agachado');
  });

  it('agachar andando: a postura chega aos outros em ≤ 0,6 s (custo do portão)', (t) => {
    // anda a 5,2 m/s, aperta agachar em t = 1 s: a velocidade cai como no
    // game.js (damp com aceleração 11/s rumo a 2,6 m/s)
    const p = { pos: [0, 0, 0] };
    let z = 0, v = 5.2, primeiro = null;
    for (let i = 0; i <= 40; i++) {
      const tt = i * 0.1;
      const agachou = tt >= 1;
      if (i > 0) {
        const alvo = agachou ? 2.6 : 5.2;
        // integra 0,1 s em passos de 1/60 como o laço do jogo
        for (let k = 0; k < 6; k++) { v += (alvo - v) * (1 - Math.exp(-11 / 60)); z += v / 60; }
      }
      p.pos = [0, 0, z];
      const c = crouchFromState(p, { pos: p.pos, crouch: agachou ? 1 : 0 }, tt * 1000);
      if (agachou && c === 1 && primeiro == null) primeiro = tt - 1;
    }
    t.diagnostic(`agachou andando: os outros o veem agachado ${primeiro == null ? 'nunca' : primeiro.toFixed(2) + ' s'} depois`);
    assert.ok(primeiro != null && primeiro <= 0.6 + 1e-9, `agachar andando demorou ${primeiro} s para chegar`);
  });
});
