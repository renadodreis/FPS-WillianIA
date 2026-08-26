/* ================================================================
   QA — O CONTROLE DE VR MOVE O JOGADOR DE VERDADE.

   Este arquivo existe por causa de UM bug que passou por 20 testes de
   unidade verdes e cinco relatos de "os controles não funcionam".

   `session.inputSources` NÃO é um `Array`. É um `XRInputSourceArray`, e
   `Array.isArray()` devolve FALSE nele. O guarda defensivo do módulo de
   entrada (`Array.isArray(fontes) ? fontes : []`) descartava os dois
   controles TODO FRAME, no aparelho, para sempre — sem erro, sem console,
   só analógico morto.

   Os testes de unidade não pegaram porque os dublês deles eram arrays
   comuns. Testar o dublê em vez da realidade é exatamente como se chega em
   "20 testes verdes e o controle não anda".

   A defesa aqui é de PRODUTO, não de módulo: entra em sessão, entrega uma
   coleção com a MESMA forma que o navegador entrega, e cobra que o jogador
   tenha saído do lugar. Se alguém reintroduzir um guarda de tipo em
   qualquer ponto do caminho — módulo, wiring, sessão — o jogador para de
   andar e este teste cai.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

const PORT = 3414;

/* Roda dentro da página: liga a sessão, injeta fontes de entrada com a forma
   REAL do WebXR (array-like iterável, não Array) e devolve o quanto o jogador
   andou no plano em `passos` frames. */
function correr({ eixos, botoes, passos }) {
  const G = window.__game, MP = window.__MP, R = MP.renderer;
  const antesLoop = R.xr.getSession;
  R.setAnimationLoop(null);

  const fonte = {
    handedness: 'left',
    gamepad: { axes: eixos, buttons: (botoes || []).map(p => ({ pressed: p, value: p ? 1 : 0 })) },
  };
  // a forma que o navegador entrega: length + índices + iterável, mas NÃO Array
  const comoOWebXREntrega = {
    length: 1, 0: fonte,
    [Symbol.iterator]: Array.prototype[Symbol.iterator],
  };
  R.xr.getSession = () => ({ inputSources: comoOWebXREntrega });
  R.xr.isPresenting = true;

  G.tick(1 / 60);                                   // entra em VR (começa o jogo)
  // zera a inércia herdada do caso anterior: aqui se mede ENTRADA, não deslize
  MP.player.vel.x = 0; MP.player.vel.z = 0;
  const p0 = [MP.player.pos.x, MP.player.pos.z];
  for (let i = 0; i < passos; i++) G.tick(1 / 60);
  const p1 = [MP.player.pos.x, MP.player.pos.z];

  R.xr.isPresenting = false;
  R.xr.getSession = antesLoop;
  G.tick(1 / 60);
  R.setAnimationLoop(() => G.tick());
  return { andou: Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) };
}

describe('controle de VR move o jogador', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootGame({ port: PORT, autoStart: false }); });
  after(async () => { if (h) await h.close(); });

  it('analógico pra frente ANDA — com a coleção na forma real do WebXR', async () => {
    const r = await h.play(correr, { eixos: [0, 0, 0, -1], passos: 60 });
    assert.ok(r.andou > 1.0,
      `analógico no batente por 1 s moveu ${r.andou.toFixed(3)} m: os controles não chegam no jogo`);
  });

  it('analógico no centro NÃO anda — nada de andar sozinho', async () => {
    const r = await h.play(correr, { eixos: [0, 0, 0, 0], passos: 60 });
    assert.ok(r.andou < 0.2,
      `parado, o jogador andou ${r.andou.toFixed(3)} m — andar sem querer em VR é enjoo`);
  });

  it('analógico dentro da zona morta NÃO anda', async () => {
    const r = await h.play(correr, { eixos: [0, 0, 0.1, -0.1], passos: 60 });
    assert.ok(r.andou < 0.2, `repouso do analógico moveu ${r.andou.toFixed(3)} m`);
  });
});
