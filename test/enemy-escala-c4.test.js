/* ================================================================
   QA — C4 do critério AAA: o soldado comum tem escala de humano.

   docs/vr/criterio-aaa.md exige ≈1,75 m (tolerância 5%) pra referência de
   humano. Medido na Rodada 30 via `hitSpheres()` (a MESMA fonte que a régua
   usa, pra não medir um dublê): 2,10 m no soldado/executivo, scale=1 sem
   justificativa de design escrita — diferente do `heavy`, que é grande de
   propósito ("Brutamontes").

   `hitSpheres()` (js/enemies.js) multiplica posição e raio de TODAS as
   esferas por `group.scale.y` — malha e hitbox escalam juntas. Este teste
   mede o PRODUTO ao vivo (inimigo real, `Enemies.list`), não uma cópia
   isolada: `enemy-drawcalls.test.js` já cobre a FORMA fundida sozinha
   (com scale forçado a 1 de propósito, pra separar "a malha mudou" de
   "o scale de produção mudou") — não duplica esta medição.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

const ALVO = 1.75, TOL = 0.05; // 5% — mesma tolerância que C4 declara

describe('Inimigos — escala de humano (C4)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootGame({ port: 3872, blockRequests: ['Guardiao'] }); });
  after(async () => { if (h) await h.close(); });

  it('soldado comum: topo da cabeça (hitSpheres) fica dentro de 5% de 1,75 m', async () => {
    const altura = await h.play(() => {
      const G = window.QA.G;
      const e = G.Enemies.list.find(x => !x.suit && !x.heavy);
      const sph = e.hitSpheres()[0]; // 'head'
      return sph.c.y - e.group.position.y + sph.r;
    });
    console.log(`      soldado comum: ${altura.toFixed(4)} m (alvo ${ALVO} ±${(TOL * 100)}%)`);
    assert.ok(Math.abs(altura - ALVO) <= ALVO * TOL,
      `soldado com ${altura.toFixed(4)} m — fora de ${(ALVO * (1 - TOL)).toFixed(4)}-${(ALVO * (1 + TOL)).toFixed(4)} m`);
  });

  it('executivo (suit): mesma malha-base, mesma correção de escala', async () => {
    const altura = await h.play(() => {
      const G = window.QA.G;
      const e = G.Enemies.list.find(x => x.suit && !x.heavy);
      const sph = e.hitSpheres()[0];
      return sph.c.y - e.group.position.y + sph.r;
    });
    console.log(`      executivo: ${altura.toFixed(4)} m (alvo ${ALVO} ±${(TOL * 100)}%)`);
    assert.ok(Math.abs(altura - ALVO) <= ALVO * TOL,
      `executivo com ${altura.toFixed(4)} m — fora de ${(ALVO * (1 - TOL)).toFixed(4)}-${(ALVO * (1 + TOL)).toFixed(4)} m`);
  });

  it('heavy (Brutamontes) NÃO muda — é grande por design, não por bug', async () => {
    const altura = await h.play(() => {
      const G = window.QA.G;
      const e = G.Enemies.list.find(x => x.heavy);
      const sph = e.hitSpheres()[0];
      return sph.c.y - e.group.position.y + sph.r;
    });
    console.log(`      heavy: ${altura.toFixed(4)} m (esperado ~2,436 m, 1,16× de 2,10)`);
    assert.ok(Math.abs(altura - 2.436) < 0.01,
      `heavy mudou de altura (${altura.toFixed(4)} m) — a correção de C4 não deveria tocar o Brutamontes`);
  });
});
