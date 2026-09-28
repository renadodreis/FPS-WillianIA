/* ================================================================
   QA — o boot mais rápido tem que produzir o MESMO MUNDO.

   Contexto: game.js monta o mundo inteiro de forma síncrona no escopo do
   módulo, e o CLAUDE.md deste repo é taxativo — a ORDEM de consumo do
   Math.random seedado é contrato. Cortar o tempo até o primeiro frame
   (ver scripts/vr-baseline.js) só é seguro se o corte for feito por
   FATIAMENTO (pontos de `await` entre statements que já existiam, sem
   reordenar nem inserir consumo novo) — nunca por reordenar quem chama
   `rand()`/`Math.random()` primeiro.

   Este teste é a rede: sobe o jogo com a MESMA seed de sempre (424242,
   a mesma do scripts/vr-baseline.js) e compara um retrato do mundo —
   castelo, sítios, clareiras de vaga, vagas de veículo, TODOS os
   inimigos, boss, alien e cinco amostras de altura — contra os valores
   capturados ANTES de qualquer fatiamento (fingerprint-before.json,
   gerado direto de window.__game na branch refatoracao, HEAD 36022f1).

   Por que estes campos e não a grama: o conteúdo de cada chunk de grama
   vem de um RNG LOCAL por (worldSeed,cx,cz) — não do stream global — e
   por isso NÃO denuncia um deslocamento do stream (ver js/grass.js,
   comentário de `legacyConsume`). Os 12 inimigos de patrulha e o alien
   continuam lendo `rand()` direto do stream global: se qualquer coisa
   ANTES deles ganhar ou perder uma chamada, a posição de pelo menos um
   destes muda. Castelo, sítios, clareiras, vagas, guardas das bases/Torre
   e o boss vêm do sorteio PRÓPRIO das construções (js/paredes.js, desde
   2026-09-28): denunciam mudança no planejador ou no relevo, não no stream.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');

const SEED = '424242';

/* Retrato de REFERÊNCIA da seed 424242. Reproduzir: bootGame({ port,
   worldSeed: '424242', autoStart: false }) e a função `retrato()` logo
   adiante.

   RECAPTURADO em 2026-09-28, na mudança aprovada pelo dono em que as
   construções passaram a sortear num PRNG próprio (js/paredes.js) e a não
   consumir mais NADA do stream seedado. Por isso mudaram, UMA vez:
   castelo/boss, os 20 sítios rurais, clareiras das torres, os 2 caminhões,
   os 16 guardas (Torre + bases) — sorteio novo — e os 12 inimigos de
   patrulha + o alien — o stream global depois das construções encurtou
   5.923 sorteios. `heightSamples` e a cidade NÃO mudaram (o relevo e a
   grama nascem antes; prova medida no relatório da entrega e em
   test/paredes-paridade.test.js). O retrato anterior (fingerprint do HEAD
   36022f1) está no histórico do git deste arquivo. Três capturas
   seguidas deram o mesmo retrato byte a byte. */
const ANTES = {
  castle: { x: 279.78, z: -248.04 },
  sitesCount: 21,
  sites: [
    { type: 'forte', x: 279.78, z: -248.04, r: 28 },
    { type: 'torre', x: -453.26, z: -3.94, r: 5 },
    { type: 'torre', x: 335.91, z: 181.43, r: 5 },
    { type: 'torre', x: -10.98, z: 430.47, r: 5 },
    { type: 'torre', x: -253.9, z: -269.21, r: 5 },
    { type: 'torre', x: -87.33, z: 319.02, r: 5 },
    { type: 'torre', x: 235.84, z: -91.04, r: 5 },
    { type: 'cabana', x: 166.19, z: 330.73, r: 6.5 },
    { type: 'cabana', x: -182.52, z: -334.06, r: 6.5 },
    { type: 'cabana', x: -184.87, z: -57.75, r: 6.5 },
    { type: 'cabana', x: -92.51, z: 61.42, r: 6.5 },
    { type: 'cabana', x: 21.67, z: -181.53, r: 6.5 },
    { type: 'cabana', x: 259.73, z: 301.78, r: 6.5 },
    { type: 'ruína', x: -339.07, z: -91.39, r: 5.5 },
    { type: 'ruína', x: 266.21, z: -20.37, r: 5.5 },
    { type: 'ruína', x: -166.87, z: -7.76, r: 5.5 },
    { type: 'ruína', x: -226.95, z: -107.38, r: 5.5 },
    { type: 'ruína', x: 175.05, z: 387.77, r: 5.5 },
    { type: 'cidade', x: -340, z: 130, r: 88 },
    { type: 'base', x: -102.17, z: -284.21, r: 22 },
    { type: 'base', x: 278.08, z: -71.61, r: 22 },
  ],
  towerClearings: [
    { x: -450.66, z: -4.54 },
    { x: 338.51, z: 180.83 },
    { x: -8.38, z: 429.87 },
    { x: -251.3, z: -269.81 },
    { x: -84.73, z: 318.42 },
    { x: 238.44, z: -91.64 },
  ],
  carSpots: [
    { type: 'sport', x: -326, z: 156 },
    { type: 'sport2', x: -348, z: 156 },
    { type: 'sport', x: -314, z: 114 },
    { type: 'truck', x: -102.17, z: -288.21 },
    { type: 'truck', x: 278.08, z: -75.61 },
  ],
  enemiesCount: 28,
  enemies: [
    { x: -166.03, z: 8.97, fsm: 'PATRULHA', alive: true },
    { x: 247.73, z: 358.11, fsm: 'PATRULHA', alive: true },
    { x: 296, z: 172.7, fsm: 'PATRULHA', alive: true },
    { x: 147.84, z: 250.22, fsm: 'PATRULHA', alive: true },
    { x: -28.54, z: -118.79, fsm: 'PATRULHA', alive: true },
    { x: 212.41, z: -219.84, fsm: 'PATRULHA', alive: true },
    { x: -128.7, z: 19.7, fsm: 'PATRULHA', alive: true },
    { x: 38.45, z: 117.76, fsm: 'PATRULHA', alive: true },
    { x: 244.32, z: -197.31, fsm: 'PATRULHA', alive: true },
    { x: 256.13, z: -381.29, fsm: 'PATRULHA', alive: true },
    { x: 111.07, z: 63.13, fsm: 'PATRULHA', alive: true },
    { x: -214.45, z: -266.55, fsm: 'PATRULHA', alive: true },
    { x: -337, z: 126.31, fsm: 'PATRULHA', alive: true },
    { x: -335.37, z: 131.44, fsm: 'PATRULHA', alive: true },
    { x: -337, z: 128.28, fsm: 'PATRULHA', alive: true },
    { x: -336.36, z: 125.82, fsm: 'PATRULHA', alive: true },
    { x: -337, z: 133.54, fsm: 'PATRULHA', alive: true },
    { x: -336.41, z: 127.54, fsm: 'PATRULHA', alive: true },
    { x: -337, z: 130.9, fsm: 'PATRULHA', alive: true },
    { x: -337.03, z: 128.03, fsm: 'PATRULHA', alive: true },
    { x: -102.62, z: -281.35, fsm: 'PATRULHA', alive: true },
    { x: -107.48, z: -286.14, fsm: 'PATRULHA', alive: true },
    { x: -100, z: -283.35, fsm: 'PATRULHA', alive: true },
    { x: -101.16, z: -290.11, fsm: 'PATRULHA', alive: true },
    { x: 286.37, z: -67.37, fsm: 'PATRULHA', alive: true },
    { x: 272.18, z: -73.02, fsm: 'PATRULHA', alive: true },
    { x: 268.11, z: -73.98, fsm: 'PATRULHA', alive: true },
    { x: 274.46, z: -70.37, fsm: 'PATRULHA', alive: true },
  ],
  boss: { x: 279.78, z: -248.04 },
  alien: { x: -117.15, z: 143.29 },
  // idênticas às do retrato de 36022f1: o relevo nasce antes e não mudou
  heightSamples: [2.53, 4.4, 0.74, -1.1, 40.49],
};

/* AUTOCONTIDA de propósito (ver test/boot-robustez.test.js): o puppeteer
   serializa só o corpo desta função, chamar um helper de fora vira
   ReferenceError DENTRO da página. */
function retrato() {
  const G = window.__game;
  const r2 = n => Math.round(n * 100) / 100;
  const pos2 = o => ({ x: r2(o.x), z: r2(o.z) });
  return {
    castle: pos2(G.Structures.castle.center),
    sitesCount: G.Structures.sites.length,
    sites: G.Structures.sites.map(s => ({ type: s.type, x: r2(s.x), z: r2(s.z), r: r2(s.r) })),
    towerClearings: G.Structures.towerClearings.map(pos2),
    carSpots: G.Structures.carSpots.map(s => ({ type: s.type, x: r2(s.x), z: r2(s.z) })),
    enemiesCount: G.Enemies.list.length,
    enemies: G.Enemies.list.map(e => ({ x: r2(e.group.position.x), z: r2(e.group.position.z), fsm: e.fsm, alive: e.alive })),
    boss: pos2(G.Boss.pos()),
    alien: pos2(G.Alien.pos()),
    heightSamples: [[0, 0], [55, 55], [-120, 40], [220, -160], [420, -420]]
      .map(([x, z]) => r2(G.heightAt(x, z))),
  };
}

describe('mundo determinístico pela mesma seed (Chrome headless)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootGame({ port: 3425, worldSeed: SEED, autoStart: false }); });
  after(async () => { if (h) await h.close(); });

  it('dada a seed 424242, então castelo/sítios/clareiras/vagas/inimigos/boss/alien/altura saem BYTE A BYTE iguais ao retrato de referência', async () => {
    const depois = await h.play(retrato);
    assert.deepEqual(depois, ANTES,
      'o mundo mudou pra mesma seed — algum fatiamento/adiamento do boot ' +
      'inseriu, removeu ou reordenou consumo do rand seedado (inimigos/alien), ' +
      'ou o planejador das construções mudou (js/paredes.js: castelo/sítios/vagas)');
  });
});
