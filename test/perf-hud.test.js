/* ================================================================
   QA — overlay de diagnóstico de performance (js/perfhud.js).

   O contador de FPS sozinho mente: 60 FPS de média com um engasgo de
   90 ms por segundo é exatamente a sensação que o dono descreveu como
   "travando". O que o overlay precisa mostrar é o p50, o p1% (o 1% pior)
   e a CONTAGEM de engasgos — e é isso que este arquivo trava.

   O núcleo estatístico é puro (sem DOM, sem three) justamente pra poder
   ser testado assim.
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let createFrameStats, formatPerfLines;
before(async () => {
  ({ createFrameStats, formatPerfLines } = await import('../js/perfhud.js'));
});

describe('createFrameStats — percentis e engasgos', () => {
  it('sem amostra não inventa número', () => {
    const s = createFrameStats();
    assert.equal(s.stats.samples, 0);
    assert.equal(s.stats.p50, 0);
    assert.equal(s.stats.hitches, 0);
  });

  it('60 FPS cravado: p50 e p1% colados em 16,7 ms e nenhum engasgo', () => {
    const s = createFrameStats();
    for (let i = 0; i < 300; i++) s.push(16.7);
    const r = s.stats;
    assert.ok(Math.abs(r.p50 - 16.7) < 0.01, `p50=${r.p50}`);
    assert.ok(Math.abs(r.p99 - 16.7) < 0.01, `p99=${r.p99}`);
    assert.equal(r.hitches, 0);
    assert.equal(Math.round(r.fps), 60);
  });

  it('o 1% pior aparece no p99 sem contaminar o p50', () => {
    const s = createFrameStats({ capacity: 200 });
    for (let i = 0; i < 198; i++) s.push(16);
    s.push(120); s.push(140);
    const r = s.stats;
    assert.ok(Math.abs(r.p50 - 16) < 0.01, `p50 contaminado: ${r.p50}`);
    assert.ok(r.p99 >= 120, `p1% não enxergou o engasgo: ${r.p99}`);
    assert.equal(r.worst, 140);
  });

  it('conta engasgo por SALTO relativo, não por número mágico', () => {
    const s = createFrameStats({ hitchFactor: 2.5, hitchFloorMs: 30 });
    for (let i = 0; i < 100; i++) s.push(16.7);
    assert.equal(s.stats.hitches, 0, 'frame liso virou engasgo');
    s.push(90);
    assert.equal(s.stats.hitches, 1);
    s.push(29);
    assert.equal(s.stats.hitches, 1, '29 ms não é engasgo (abaixo do piso)');
  });

  it('num jogo que roda a 30 FPS, 33 ms é o normal — não é engasgo', () => {
    const s = createFrameStats({ hitchFactor: 2.5, hitchFloorMs: 30 });
    for (let i = 0; i < 200; i++) s.push(33.3);
    assert.equal(s.stats.hitches, 0, '30 FPS estável foi contado como 200 engasgos');
    s.push(180);
    assert.equal(s.stats.hitches, 1);
  });

  it('a janela é deslizante: engasgo velho sai da conta', () => {
    const s = createFrameStats({ capacity: 50 });
    s.push(200);
    for (let i = 0; i < 60; i++) s.push(16.7);
    assert.equal(s.stats.samples, 50);
    assert.equal(s.stats.worst, 16.7, 'amostra antiga não saiu da janela');
  });

  it('lixo (NaN, negativo, infinito) não entra', () => {
    const s = createFrameStats();
    for (const bad of [NaN, -5, 0, Infinity, undefined, null, '16']) s.push(bad);
    assert.equal(s.stats.samples, 0, 'amostra inválida entrou na janela');
    s.push(16.7);
    assert.equal(s.stats.samples, 1);
  });

  it('reset limpa janela e contador de engasgo', () => {
    const s = createFrameStats();
    for (let i = 0; i < 30; i++) s.push(16.7);
    s.push(200);
    assert.equal(s.stats.hitches, 1);
    s.reset();
    assert.equal(s.stats.samples, 0);
    assert.equal(s.stats.hitches, 0);
  });
});

describe('formatPerfLines — o que o jogador lê', () => {
  it('mostra p50, p1%, engasgos, draw calls, triângulos e escala', () => {
    const txt = formatPerfLines({
      stats: { samples: 240, p50: 16.7, p99: 24.1, worst: 84.2, fps: 59.8, hitches: 3 },
      calls: 515, triangles: 814222, scale: 1.5, ceiling: 1.5, simMs: 6.1,
    }).join('\n');
    assert.match(txt, /16\.7/, 'sem p50');
    assert.match(txt, /24\.1/, 'sem p1%');
    assert.match(txt, /515/, 'sem draw calls');
    assert.match(txt, /814|814222|814\.2/, 'sem triângulos');
    assert.match(txt, /1\.50/, 'sem escala de resolução');
    assert.match(txt, /3/, 'sem contagem de engasgo');
    assert.match(txt, /6\.1/, 'sem tempo de simulação');
  });

  it('sem amostra ainda produz texto legível (não quebra no primeiro frame)', () => {
    const lines = formatPerfLines({
      stats: { samples: 0, p50: 0, p99: 0, worst: 0, fps: 0, hitches: 0 },
      calls: 0, triangles: 0, scale: 1, ceiling: 1, simMs: 0,
    });
    assert.ok(Array.isArray(lines) && lines.length > 0);
    for (const l of lines) assert.equal(typeof l, 'string');
  });
});
