/* ================================================================
   MUNDO REAL para os testes de PvE em Node (test/pve-*.test.js).

   Terreno: o MESMO do cliente (scripts/bots.js:createBotTerrain — mesma
   semente, mesma grade canônica). Paredes: js/paredes.js, que é a fonte
   ÚNICA do que é sólido no jogo (Structures.walls sai dali).

   A consulta de parede é `criarConsultaParedes`, a MESMA conta do
   `Structures.rayHit`/`segBlocked` (slab test) — ver js/paredes.js.
   `collide` é CÓPIA LITERAL de js/structures.js:collide (o módulo de
   lá monta malha e não roda em Node); se um dia divergir, os testes
   que dependem de movimento ficam avisados aqui.

   ÂNCORA INDEPENDENTE: os testes medem o que cruza o quê com
   `cruzaCaixa()` daqui, que é geometria pura sobre a caixa da peça —
   nunca com a função de visada do módulo sob teste.
   ================================================================ */
'use strict';
const path = require('node:path');
const url = require('node:url');
const Bots = require('../../scripts/bots.js');

const JS = path.join(__dirname, '..', '..', 'js');
const importar = f => import(url.pathToFileURL(path.join(JS, f)).href);

const _cache = new Map();
async function mundoReal(semente = 424242) {
  if (_cache.has(semente)) return _cache.get(semente);
  const P = await importar('paredes.js');
  const t = await Bots.createBotTerrain(semente);
  const mundo = P.construirMundoSolido({ worldSeed: semente, heightAt: t.heightAt, slopeAt: t.slopeAt,
    WATER_LEVEL: t.WATER_LEVEL, CITY: t.CITY });
  const out = { P, t, mundo, paredes: P.paredesDoJogo(mundo) };
  _cache.set(semente, out);
  return out;
}

/* Structures de mentira com paredes de verdade */
function estruturas(paredes) {
  const walls = paredes.slice();
  let consulta = null, visto = -1;
  const P = estruturas._P;
  const q = () => {
    if (!consulta || visto !== walls.length) { consulta = P.criarConsultaParedes(walls); visto = walls.length; }
    return consulta;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  return {
    walls,
    rayHit: (o, d, max) => q().raio(o, d, max),
    segBlocked: (a, b) => q().segmentoBloqueado(a, b),
    /* cópia literal de js/structures.js:collide */
    collide(pos, radius, height) {
      for (const b of walls) {
        if (b.noCollide) continue;
        if (pos.y + height < b.y0 || pos.y >= b.y1 - 0.12) continue;
        const nx = clamp(pos.x, b.x0, b.x1), nz = clamp(pos.z, b.z0, b.z1);
        const dx = pos.x - nx, dz = pos.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pos.x = nx + dx / d * radius;
          pos.z = nz + dz / d * radius;
        } else {
          const px = Math.min(pos.x - b.x0, b.x1 - pos.x);
          const pz = Math.min(pos.z - b.z0, b.z1 - pos.z);
          if (px < pz) pos.x = (pos.x - b.x0 < b.x1 - pos.x) ? b.x0 - radius : b.x1 + radius;
          else pos.z = (pos.z - b.z0 < b.z1 - pos.z) ? b.z0 - radius : b.z1 + radius;
        }
      }
    },
    enemyCamps: [],
  };
}
async function comEstruturas(paredes) {
  if (!estruturas._P) estruturas._P = await importar('paredes.js');
  return estruturas(paredes);
}

/* ÂNCORA: o segmento a→b atravessa a caixa? (slab test próprio, 3D) */
function cruzaCaixa(a, b, box) {
  let t0 = 0, t1 = 1;
  for (const [o, e, lo, hi] of [[a.x, b.x, box.x0, box.x1], [a.y, b.y, box.y0, box.y1], [a.z, b.z, box.z0, box.z1]]) {
    const d = e - o;
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return false; continue; }
    let ta = (lo - o) / d, tb = (hi - o) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}
function pontoNaCaixa(p, box) {
  return p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1 && p.z >= box.z0 && p.z <= box.z1;
}

/* rand determinístico: meio do intervalo (ou o topo, para forçar erro de mira) */
const randMeio = (a = 1, b) => (b === undefined ? a * 0.5 : (a + b) * 0.5);
const randTopo = (a = 1, b) => (b === undefined ? a * 0.999 : a + (b - a) * 0.999);

module.exports = { mundoReal, comEstruturas, cruzaCaixa, pontoNaCaixa, randMeio, randTopo, importar };
