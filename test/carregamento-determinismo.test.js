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
   comentário de `legacyConsume`). Sítios/inimigos/boss/alien continuam
   lendo `rand()` direto do stream global: se qualquer coisa ANTES deles
   ganhar ou perder uma chamada, a posição de pelo menos um destes muda.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');

const SEED = '424242';

/* capturado de window.__game ANTES de qualquer mudança neste PR — ver o
   cabeçalho acima. Reproduzir: node scripts/vr-baseline.js já usa esta
   seed; o retrato abaixo saiu de um bootGame({ port, worldSeed: '424242',
   autoStart: false }) e da função `retrato()` logo adiante. */
const ANTES = {
  castle: { x: 250.03, z: 299.42 },
  sitesCount: 21,
  sites: [
    { type: 'forte', x: 250.03, z: 299.42, r: 28 },
    { type: 'torre', x: -214.8, z: -185.67, r: 5 },
    { type: 'torre', x: -181.76, z: -334.35, r: 5 },
    { type: 'torre', x: 359.84, z: 102.38, r: 5 },
    { type: 'torre', x: 344.11, z: -154.02, r: 5 },
    { type: 'torre', x: 225.49, z: -359.4, r: 5 },
    { type: 'torre', x: 27.37, z: -189.64, r: 5 },
    { type: 'cabana', x: 170.72, z: 326.56, r: 6.5 },
    { type: 'cabana', x: -337.93, z: 272.29, r: 6.5 },
    { type: 'cabana', x: -110.8, z: -66.46, r: 6.5 },
    { type: 'cabana', x: 270.51, z: -29.08, r: 6.5 },
    { type: 'cabana', x: -336.07, z: -90.67, r: 6.5 },
    { type: 'cabana', x: 162.94, z: -390.61, r: 6.5 },
    { type: 'ruína', x: -114.34, z: 172.76, r: 5.5 },
    { type: 'ruína', x: 115.44, z: -381.39, r: 5.5 },
    { type: 'ruína', x: -92.06, z: -191.01, r: 5.5 },
    { type: 'ruína', x: -178.19, z: 114.81, r: 5.5 },
    { type: 'ruína', x: -68.14, z: 88.83, r: 5.5 },
    { type: 'cidade', x: -340, z: 130, r: 88 },
    { type: 'base', x: -247.69, z: -101.44, r: 22 },
    { type: 'base', x: 172.74, z: -285.99, r: 22 },
  ],
  towerClearings: [
    { x: -212.2, z: -186.27 },
    { x: -179.16, z: -334.95 },
    { x: 362.44, z: 101.78 },
    { x: 346.71, z: -154.62 },
    { x: 228.09, z: -360 },
    { x: 29.97, z: -190.24 },
  ],
  carSpots: [
    { type: 'sport', x: -326, z: 156 },
    { type: 'sport2', x: -348, z: 156 },
    { type: 'sport', x: -314, z: 114 },
    { type: 'truck', x: -247.69, z: -105.44 },
    { type: 'truck', x: 172.74, z: -289.99 },
  ],
  enemiesCount: 28,
  enemies: [
    { x: 79.89, z: 118.94, fsm: 'PATRULHA', alive: true },
    { x: -345.03, z: -214.84, fsm: 'PATRULHA', alive: true },
    { x: -19.18, z: -72.31, fsm: 'PATRULHA', alive: true },
    { x: 323.21, z: -81.92, fsm: 'PATRULHA', alive: true },
    { x: -103.62, z: -202.54, fsm: 'PATRULHA', alive: true },
    { x: 7.81, z: 363.91, fsm: 'PATRULHA', alive: true },
    { x: 102.21, z: -96.7, fsm: 'PATRULHA', alive: true },
    { x: -290.3, z: 200.62, fsm: 'PATRULHA', alive: true },
    { x: -201.11, z: -132.25, fsm: 'PATRULHA', alive: true },
    { x: -382.63, z: -5.5, fsm: 'PATRULHA', alive: true },
    { x: -182.99, z: 363.05, fsm: 'PATRULHA', alive: true },
    { x: 354.26, z: 39.48, fsm: 'PATRULHA', alive: true },
    { x: -337, z: 130.37, fsm: 'PATRULHA', alive: true },
    { x: -336.83, z: 133.45, fsm: 'PATRULHA', alive: true },
    { x: -337, z: 129.39, fsm: 'PATRULHA', alive: true },
    { x: -336.29, z: 131.62, fsm: 'PATRULHA', alive: true },
    { x: -337, z: 133.76, fsm: 'PATRULHA', alive: true },
    { x: -336.09, z: 126.88, fsm: 'PATRULHA', alive: true },
    { x: -337, z: 126.65, fsm: 'PATRULHA', alive: true },
    { x: -337.84, z: 134.23, fsm: 'PATRULHA', alive: true },
    { x: -250.4, z: -97.8, fsm: 'PATRULHA', alive: true },
    { x: -249.19, z: -108.11, fsm: 'PATRULHA', alive: true },
    { x: -243.45, z: -95.32, fsm: 'PATRULHA', alive: true },
    { x: -259.01, z: -105.53, fsm: 'PATRULHA', alive: true },
    { x: 167.53, z: -289.39, fsm: 'PATRULHA', alive: true },
    { x: 177.86, z: -279.05, fsm: 'PATRULHA', alive: true },
    { x: 168.73, z: -284.84, fsm: 'PATRULHA', alive: true },
    { x: 182.65, z: -287.39, fsm: 'PATRULHA', alive: true },
  ],
  boss: { x: 250.03, z: 299.42 },
  alien: { x: 202.67, z: 130.48 },
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

  it('dada a seed 424242, então castelo/sítios/clareiras/vagas/inimigos/boss/alien/altura saem BYTE A BYTE iguais ao retrato pré-fatiamento', async () => {
    const depois = await h.play(retrato);
    assert.deepEqual(depois, ANTES,
      'o mundo mudou pra mesma seed — algum fatiamento/adiamento do boot ' +
      'inseriu, removeu ou reordenou consumo do rand seedado');
  });
});
