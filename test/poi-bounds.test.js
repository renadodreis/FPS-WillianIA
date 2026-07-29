/* ================================================================
   QA — ATRAÇÕES DENTRO DO MAPA JOGÁVEL.

   `pickSpot` varre um anel de 150–360 m ao redor da CIDADE (-340, 130),
   que já está a 363 m do centro do mundo. Somando, o anel alcança 700 m
   do centro; o único freio era `worldHalf` (±520 POR EIXO), então a
   pontuação — que premia clareira — empurrava as atrações justamente
   pra borda vazia do mundo. Medido antes da correção: campo de tiro em
   x = -519 e canhão/argolas em (-517, 436), ou seja 676 m do centro,
   ENCOSTADOS na cerca (jogador para em ±539; árvore/pedra em ±517).

   Este teste trava o raio máximo em vários "mundos" (layouts de sites e
   relevos diferentes), inclusive nos casos degenerados que empurram a
   pontuação pro extremo: nenhuma atração pode nascer além de
   POI_MAX_RADIUS do centro do mundo.
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let core;
before(async () => { core = await import('../js/cannon-core.js'); });

/* PRNG próprio: mundos sintéticos reprodutíveis, sem tocar Math.random */
function prng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

/* um "mundo": relevo suave + N estruturas espalhadas, como Structures.sites */
function makeWorld(seed) {
  const r = prng(seed);
  const sites = [];
  for (let i = 0; i < 24; i++) {
    const a = r() * Math.PI * 2, d = 40 + r() * 430;
    sites.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: 5 + r() * 25 });
  }
  const ph = r() * 100;
  const sampler = (x, z) => ({
    h: 6 + 4 * Math.sin((x + ph) * 0.004) + 3 * Math.cos((z - ph) * 0.005),
    slope: Math.abs(Math.sin(x * 0.01) * Math.cos(z * 0.01)) * 0.2,
  });
  return { sites, sampler };
}

const CITY = { x: -340, z: 130 };

describe('Atrações não nascem na cerca do mundo', () => {
  it('expõe um teto de raio explícito e plausível', () => {
    assert.equal(typeof core.POI_MAX_RADIUS, 'number');
    // dentro do limite de árvore/pedra (±517) e MUITO dentro do do jogador (±539)
    assert.ok(core.POI_MAX_RADIUS > 200 && core.POI_MAX_RADIUS <= 470,
      `POI_MAX_RADIUS fora da faixa razoável: ${core.POI_MAX_RADIUS}`);
  });

  it('em 12 mundos, nenhuma das 6 atrações passa de POI_MAX_RADIUS do centro', () => {
    const R = core.POI_MAX_RADIUS;
    assert.ok(Number.isFinite(R), 'POI_MAX_RADIUS não exportado (comparação viraria NaN e passaria à toa)');
    const fora = [];
    for (let seed = 1; seed <= 12; seed++) {
      const { sites, sampler } = makeWorld(seed * 7919);
      // reproduz o encadeamento real: canhão primeiro, depois as 5 atrações,
      // cada uma evitando as anteriores (js/maptoys.js: place())
      const avoid = [];
      for (let k = 0; k < 6; k++) {
        const p = core.pickSpot({
          sites, avoid: avoid.slice(), cx: CITY.x, cz: CITY.z,
          sampler, waterLevel: -5,
        });
        assert.ok(p, `mundo ${seed}: pickSpot devolveu null num mapa seco`);
        avoid.push({ x: p.x, z: p.z, r: 46 });
        const d = Math.hypot(p.x, p.z);
        if (d > R + 1e-6) fora.push({ seed, k, x: +p.x.toFixed(1), z: +p.z.toFixed(1), d: +d.toFixed(1) });
      }
    }
    assert.deepEqual(fora, [], `atrações fora do raio ${R}: ${JSON.stringify(fora)}`);
  });

  it('o teto é aplicado ao ponto, não ao score: o ponto devolvido segue seco e plano', () => {
    const { sites, sampler } = makeWorld(4242);
    const p = core.pickSpot({ sites, cx: CITY.x, cz: CITY.z, sampler, waterLevel: -5 });
    assert.ok(p, 'sem ponto');
    assert.ok(sampler(p.x, p.z).h > -5 + 1.2, 'ponto na água');
    assert.ok(Math.hypot(p.x, p.z) <= core.POI_MAX_RADIUS);
  });

  it('respeita um maxRadius menor passado pelo chamador', () => {
    const { sites, sampler } = makeWorld(99);
    const p = core.pickSpot({ sites, cx: CITY.x, cz: CITY.z, sampler, waterLevel: -5, maxRadius: 300 });
    assert.ok(p, 'sem ponto com maxRadius=300');
    assert.ok(Math.hypot(p.x, p.z) <= 300 + 1e-6, `raio ${Math.hypot(p.x, p.z)} > 300`);
  });

  it('mapa todo dentro do teto continua determinístico (mesma entrada, mesmo ponto)', () => {
    const { sites, sampler } = makeWorld(7);
    const a = core.pickSpot({ sites, cx: CITY.x, cz: CITY.z, sampler, waterLevel: -5 });
    const b = core.pickSpot({ sites, cx: CITY.x, cz: CITY.z, sampler, waterLevel: -5 });
    assert.deepEqual(a, b);
  });
});
