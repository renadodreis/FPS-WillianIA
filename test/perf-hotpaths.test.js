/* ================================================================
   QA — caminhos quentes sem lixo por frame (Node puro).

   Três consultas rodam dezenas a centenas de vezes POR FRAME:
   `heightAt` (chão, IA, grama, balística), `obstaclesNear` (colisão de
   todo bicho + 1 por passo do raio de cada bala) e `coverAt` (uma vez
   por GOTA de chuva e por FLOCO de neve). Todas alocavam objeto — e a
   `obstaclesNear` alocava ainda 9 strings de template literal por
   chamada.

   O que este arquivo trava:
     1. o RESULTADO não mudou (oráculo independente, milhares de pontos);
     2. o caminho quente não aloca mais (identidade do que é devolvido /
        primitivo em vez de objeto).
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SIZE = 1100, SEGS = 220, CELL = SIZE / SEGS, HALF = SIZE / 2;

function seedRandom(seed) {
  let s = seed >>> 0;
  const orig = Math.random;
  Math.random = function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => { Math.random = orig; };
}

let createTerrain, createCover;
before(async () => {
  ({ createTerrain } = await import('../js/terrain.js'));
  ({ createCover } = await import('../js/cover.js'));
});

function makeTerrain(seed = 424242) {
  const restore = seedRandom(seed);
  const t = createTerrain({ lerp, clamp });
  restore();
  t.buildHeightGrid(SIZE);
  return t;
}

describe('terrain — heightAt sem alocar por consulta', () => {
  it('interpola o MESMO triângulo de sempre (oráculo independente, 20 mil pontos)', () => {
    const T = makeTerrain();
    // oráculo: relê a grade canônica por sampleAt e refaz a regra
    // documentada (diagonal b–d do PlaneGeometry) sem tocar em cellAt
    const oracle = (x, z) => {
      const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
      const i = Math.min(fx | 0, SEGS - 1), j = Math.min(fz | 0, SEGS - 1);
      const tx = fx - i, tz = fz - j;
      const ha = T.sampleAt(i, j), hd = T.sampleAt(i + 1, j);
      const hb = T.sampleAt(i, j + 1), hc = T.sampleAt(i + 1, j + 1);
      return (tx + tz <= 1)
        ? ha + (hd - ha) * tx + (hb - ha) * tz
        : hc + (hb - hc) * (1 - tx) + (hd - hc) * (1 - tz);
    };
    let s = 12345;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let k = 0; k < 20000; k++) {
      const x = (rnd() - 0.5) * (SIZE - 2), z = (rnd() - 0.5) * (SIZE - 2);
      assert.equal(T.heightAt(x, z), oracle(x, z), `heightAt divergiu em ${x},${z}`);
    }
  });

  it('normal geométrica segue o gradiente do MESMO triângulo', () => {
    const T = makeTerrain();
    const out = { x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; } };
    let s = 777;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let k = 0; k < 5000; k++) {
      const x = (rnd() - 0.5) * (SIZE - 2), z = (rnd() - 0.5) * (SIZE - 2);
      T.geometricNormalAt(x, z, out);
      // a normal aponta pra cima e é unitária; e bate com a inclinação
      assert.ok(out.y > 0, 'normal virada pra baixo');
      const len = Math.hypot(out.x, out.y, out.z);
      assert.ok(Math.abs(len - 1) < 1e-9, `normal não unitária (${len})`);
      // e reproduz o mesmo valor duas vezes seguidas (buffer reutilizado
      // não pode ser corrompido por uma consulta intermediária)
      const a = [out.x, out.y, out.z];
      T.heightAt(x + 7, z - 3);
      T.geometricNormalAt(x, z, out);
      assert.deepEqual([out.x, out.y, out.z], a, 'consulta intermediária sujou o resultado');
    }
  });

  it('fora da grade continua caindo na analítica', () => {
    const T = makeTerrain();
    assert.equal(T.heightAt(HALF + 5, 0), T.heightAnalytic(HALF + 5, 0));
    assert.equal(T.heightAt(0, -HALF - 5), T.heightAnalytic(0, -HALF - 5));
  });
});

describe('terrain — obstaclesNear sem alocar por consulta', () => {
  function withObstacles() {
    const T = makeTerrain();
    for (let i = 0; i < 400; i++)
      T.addObstacle(((i * 37.3) % 300) - 150, ((i * 53.7) % 300) - 150, 0.4 + (i % 5) * 0.2, { category: 'tree' });
    return T;
  }

  it('mesma célula devolve a MESMA lista (zero alocação em regime)', () => {
    const T = withObstacles();
    const a = T.obstaclesNear(10, 10);
    const b = T.obstaclesNear(10.5, 11.2);            // mesma célula de 16 m
    assert.equal(b, a, 'realocou a lista para a mesma célula');
    const c = T.obstaclesNear(200, 200);
    assert.notEqual(c, a, 'células diferentes compartilhando a mesma lista');
  });

  it('conteúdo e ORDEM idênticos ao varrer as 9 células na mão', () => {
    const T = withObstacles();
    const CELLSZ = 16;
    // oráculo: reconstrói a partir do que addObstacle recebeu
    const all = [];
    for (let i = 0; i < 400; i++)
      all.push({ x: ((i * 37.3) % 300) - 150, z: ((i * 53.7) % 300) - 150, r: 0.4 + (i % 5) * 0.2 });
    const oracle = (x, z) => {
      const gx = Math.floor(x / CELLSZ), gz = Math.floor(z / CELLSZ);
      const out = [];
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
        for (const o of all)
          if (Math.floor(o.x / CELLSZ) === gx + i && Math.floor(o.z / CELLSZ) === gz + j) out.push(o);
      return out;
    };
    let s = 4242;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let k = 0; k < 400; k++) {
      const x = (rnd() - 0.5) * 400, z = (rnd() - 0.5) * 400;
      const got = T.obstaclesNear(x, z).map(o => `${o.x.toFixed(4)}|${o.z.toFixed(4)}|${o.r}`);
      const want = oracle(x, z).map(o => `${o.x.toFixed(4)}|${o.z.toFixed(4)}|${o.r}`);
      assert.deepEqual(got, want, `divergiu em ${x},${z}`);
    }
  });

  it('obstáculo novo aparece na consulta seguinte (cache invalidado)', () => {
    const T = withObstacles();
    const antes = T.obstaclesNear(500, 500).length;
    T.addObstacle(500, 500, 1.5);
    const depois = T.obstaclesNear(500, 500);
    assert.equal(depois.length, antes + 1, 'obstáculo adicionado ficou invisível');
    assert.equal(depois[depois.length - 1].r, 1.5);
  });

  it('coordenadas negativas e distantes não colidem de chave', () => {
    const T = makeTerrain();
    T.addObstacle(-1000, -1000, 1, { category: 'a' });
    T.addObstacle(1000, 1000, 2, { category: 'b' });
    assert.deepEqual(T.obstaclesNear(-1000, -1000).map(o => o.category), ['a']);
    assert.deepEqual(T.obstaclesNear(1000, 1000).map(o => o.category), ['b']);
    assert.deepEqual(T.obstaclesNear(-1000, 1000).map(o => o.category), []);
  });
});

describe('cover — consulta por gota sem alocar', () => {
  function withRoofs() {
    const C = createCover();
    C.addRoofRect({ x0: 0, x1: 8, z0: 0, z1: 8, roofY: 4, sourceId: 'campo' });
    C.addRoofRect({ x0: -60, x1: -40, z0: 20, z1: 40, roofY: 12, sourceId: 'city' });
    return C;
  }

  it('isCovered devolve booleano e concorda com coverAt em 5 mil pontos', () => {
    const C = withRoofs();
    let s = 31337;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let k = 0; k < 5000; k++) {
      const x = (rnd() - 0.5) * 200, y = (rnd() - 0.5) * 40, z = (rnd() - 0.5) * 200;
      const v = C.isCovered(x, y, z);
      assert.equal(typeof v, 'boolean', 'isCovered alocou objeto em vez de devolver booleano');
      assert.equal(v, C.coverAt(x, y, z).covered, `divergiu em ${x},${y},${z}`);
    }
  });

  it('provider dinâmico manda no isCovered igual manda no coverAt', () => {
    const C = withRoofs();
    C.setDynamicProvider(() => ({ covered: true, sourceId: 'ship' }));
    assert.equal(C.isCovered(999, 999, 999), true);
    C.setDynamicProvider(() => ({ covered: false }));
    assert.equal(C.isCovered(999, 999, 999), false, 'provider negativo virou cobertura');
    assert.equal(C.isCovered(2, 1, 2), true, 'telhado do campo sumiu com provider negativo');
    C.setDynamicProvider(null);
    assert.equal(C.isCovered(2, 5, 2), false, 'em cima do telhado é céu aberto');
  });

  it('destruição da cidade descobre no isCovered também', () => {
    const C = withRoofs();
    assert.equal(C.isCovered(-50, 1, 30), true);
    C.removeBySource('city');
    assert.equal(C.isCovered(-50, 1, 30), false);
    assert.equal(C.isCovered(2, 1, 2), true, 'campo caiu junto com a cidade');
  });

  it('coverAt segue devolvendo objeto próprio (consumidores guardam o resultado)', () => {
    const C = withRoofs();
    const a = C.coverAt(2, 1, 2);
    const b = C.coverAt(-50, 1, 30);
    assert.notEqual(a, b, 'coverAt passou a reciclar o objeto de retorno');
    assert.equal(a.sourceId, 'campo', 'a segunda consulta sujou a primeira');
    assert.equal(b.sourceId, 'city');
  });
});
