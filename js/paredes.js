/* ================================================================
   PAREDES — o mundo SÓLIDO das construções como DADO PURO.

   Sem THREE, sem DOM, sem canvas, sem Math.random. Só contas sobre
   (semente, relevo). É importável pelo Node com o que está em
   `dependencies` — o servidor e os bots (scripts/bots.js) chamam
   EXATAMENTE a mesma função que o cliente, e por isso enxergam os
   mesmos prédios que o jogador vê (critério B7 de docs/mobile).

   ── Por que existe ───────────────────────────────────────────────
   As paredes (o que `Structures.rayHit` e o `rayBlockedAt` do jogo
   consultam) nasciam do `Math.random` GLOBAL seedado, no ponto em que
   o stream estava depois de terreno + grama + ~1,6 milhão de sorteios.
   Reconstruir isso fora do navegador exigia reproduzir o boot inteiro
   — e nem o boot inteiro bastava: medido na seed 987654, duas cargas
   do MESMO código puseram os prédios em lugares diferentes, porque um
   consumidor assíncrono comeu números do stream antes das construções.
   Reproduzido: uma queda do socket durante o `await bootFase(...)` que
   separa grama e construções faz o socket.io agendar a reconexão com
   jitter (`Backoff.duration` → Math.random seedado).

   Agora as construções sorteiam num PRNG PRÓPRIO, derivado só da
   semente (`rngEstruturas`), e não consomem NADA do stream global
   (js/structures.js roda inteiro em noSeed). Consequências:
     • paredes = f(semente, relevo) — reproduzível no Node, e imunes a
       quem comer o stream global antes delas;
     • mudar/acrescentar construção não desloca mais o mundo por CONSUMO
       de sorteio. Ainda desloca por DADO: as árvores (game.js) e as
       atrações evitam `sites`, e o laço das árvores sorteia menos quando
       recusa um ponto — mover sítio mexe nelas e em tudo depois delas;
     • o layout mudou UMA vez para cada semente (decisão do dono,
       2026-09-28).

   ── Contrato ─────────────────────────────────────────────────────
   `construirMundoSolido` devolve `paredes` NA MESMA ORDEM e com os
   MESMOS números que `Structures.walls` tem ao fim de createStructures
   (castelo incluído). test/paredes-paridade.test.js sobe o jogo real
   em várias sementes e compara caixa a caixa com o Node (1e-6).
   Quem mexer em construção sólida mexe AQUI; js/structures.js só
   desenha o que este módulo descreve.

   Formato da caixa (o mesmo de Structures.walls):
     { x0, x1, y0, y1, z0, z1 }            AABB em metros, mundo
     + city: true      → urbana (sai do mundo na destruição da cidade)
     + noCollide: true → laje: barra bala, não empurra corpo
     + castle: true    → castelo do boss (com `part`, como castle.js)
   ================================================================ */
import * as CityLayout from './citylayout.js';
import * as CityInterior from './cityinterior.js';
import { pickVaultInterior } from './secrets-core.js';

const TAU = Math.PI * 2;

/* ---------------- sorteio próprio ---------------- */

/* mulberry32 — o MESMO de server.js, do cliente (game.js) e dos bots */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* O sal separa este stream dos outros sorteios derivados da semente
   (baús 0xC0FFEE, POIs 0xBEEF, escombros 0xC1DADE, detalhe 0xB111D5). */
export const SAL_ESTRUTURAS = 0xED1F1C;

/* Mesma normalização do cliente para grama/POIs (game.js):
   `(worldSeed >>> 0) || 424242`. Solo sem servidor cai em 424242. */
export function sementeNormalizada(worldSeed) {
  return (Number(worldSeed) >>> 0) || 424242;
}

export function rngEstruturas(worldSeed) {
  return mulberry32((sementeNormalizada(worldSeed) ^ SAL_ESTRUTURAS) >>> 0);
}

/* ---------------- castelo: medida do sítio + colisores ----------------
   ESPELHO de js/castle.js (measureCastleSite e os `wall(...)` de
   createCastle). castle.js importa THREE + GLTFLoader e não serve para o
   servidor; até ele passar a importar daqui, os DOIS têm de concordar —
   test/paredes-puro.test.js compara a medida com a de castle.js e
   test/paredes-paridade.test.js compara os colisores com os do jogo. */
const CASTELO = Object.freeze({
  FOOTPRINT_HALF: 19.18,
  FLOOR_LOCAL_Y: 0.16,
  BASE_CLEARANCE: 0.05,
  FOUNDATION_BURY: 0.25,
  GATE_HALF: 2.3,
  GATE_INNER_Z: 19.24,
  RAMP_OUTER_Z: 26.5,
  RAMP_HALF: 2,
  RAMP_EASE_FRACTION: 0.25,
  SAMPLE_STEP: 0.25,
});
export const MAX_RAMPA_CASTELO_GRAUS = 30;

function finito(value, label) {
  if (!Number.isFinite(value)) throw new Error(`Castelo: ${label} não é finito`);
  return value;
}

function amostraRetangulo(heightAt, cx, cz, halfX, halfZ, step = CASTELO.SAMPLE_STEP) {
  const nx = Math.max(1, Math.ceil(halfX * 2 / step));
  const nz = Math.max(1, Math.ceil(halfZ * 2 / step));
  let min = Infinity, max = -Infinity;
  for (let ix = 0; ix <= nx; ix++) {
    const x = cx - halfX + halfX * 2 * ix / nx;
    for (let iz = 0; iz <= nz; iz++) {
      const z = cz - halfZ + halfZ * 2 * iz / nz;
      const y = finito(heightAt(x, z), `heightAt(${x}, ${z})`);
      min = Math.min(min, y);
      max = Math.max(max, y);
    }
  }
  return { min, max };
}

function progressoRampa(value) {
  const t = Math.max(0, Math.min(1, value));
  const ease = CASTELO.RAMP_EASE_FRACTION;
  const scale = 1 - ease;
  if (t < ease) return t * t / (2 * ease * scale);
  if (t > 1 - ease) {
    const remaining = 1 - t;
    return 1 - remaining * remaining / (2 * ease * scale);
  }
  return (t - ease / 2) / scale;
}

function alturaDaAproximacao(heightAt, center, floorY) {
  const C = CASTELO;
  const length = C.RAMP_OUTER_Z - C.GATE_INNER_Z;
  const outer = amostraRetangulo(heightAt, center.x, center.z + C.RAMP_OUTER_Z, C.RAMP_HALF, 0.25);
  let y = outer.max + C.BASE_CLEARANCE;
  const nz = Math.ceil(length / C.SAMPLE_STEP);
  const nx = Math.ceil(C.RAMP_HALF * 2 / C.SAMPLE_STEP);
  for (let iz = 1; iz <= nz; iz++) {
    const t = iz / nz;
    const progress = progressoRampa(t);
    const z = center.z + C.GATE_INNER_Z + length * t;
    for (let ix = 0; ix <= nx; ix++) {
      const x = center.x - C.RAMP_HALF + C.RAMP_HALF * 2 * ix / nx;
      const terrainY = finito(heightAt(x, z), `heightAt(${x}, ${z})`) + C.BASE_CLEARANCE;
      y = Math.max(y, floorY + (terrainY - floorY) / progress);
    }
  }
  return y;
}

/* mesma saída de measureCastleSite (js/castle.js) */
export function medirSitioCastelo({ center, heightAt }) {
  if (!center || typeof center !== 'object') throw new Error('Castelo: center ausente');
  if (typeof heightAt !== 'function') throw new Error('Castelo: heightAt ausente');
  const C = CASTELO;
  const cx = finito(center.x, 'center.x'), cz = finito(center.z, 'center.z');
  const measuredCenter = { x: cx, z: cz };
  const terrain = amostraRetangulo(heightAt, cx, cz, C.FOOTPRINT_HALF, C.FOOTPRINT_HALF);
  const originY = terrain.max + C.BASE_CLEARANCE;
  const floorY = originY + C.FLOOR_LOCAL_Y;
  const foundationBottom = terrain.min - C.FOUNDATION_BURY - C.BASE_CLEARANCE;
  const approachY = alturaDaAproximacao(heightAt, measuredCenter, floorY);
  const rampSlopeDegrees = Math.atan2(
    Math.abs(floorY - approachY),
    C.RAMP_OUTER_Z - C.GATE_INNER_Z,
  ) * 180 / Math.PI;
  const rampMaxSlopeDegrees = Math.atan(
    Math.abs(floorY - approachY) /
    (C.RAMP_OUTER_Z - C.GATE_INNER_Z) /
    (1 - C.RAMP_EASE_FRACTION),
  ) * 180 / Math.PI;
  return {
    center: measuredCenter, terrain, originY, floorY, foundationBottom,
    approachY, rampSlopeDegrees, rampMaxSlopeDegrees,
  };
}

/* colisores do castelo, na ordem e com a aritmética de createCastle */
export function paredesDoCastelo(medida) {
  const C = CASTELO;
  const { x: cx, z: cz } = medida.center;
  const { originY, foundationBottom } = medida;
  const out = [];
  const wall = (part, x0, x1, y0, y1, z0, z1, extra = {}) => {
    const w = { x0: cx + x0, x1: cx + x1, y0: originY + y0, y1: originY + y1,
      z0: cz + z0, z1: cz + z1, castle: true, part, ...extra };
    for (const key of ['x0', 'x1', 'y0', 'y1', 'z0', 'z1']) finito(w[key], `${part}.${key}`);
    out.push(w);
  };
  const FH = C.FOOTPRINT_HALF;
  const bottomLocal = foundationBottom - originY;
  const edge0 = FH - 0.46;
  wall('foundation-left', -FH, -edge0, bottomLocal, C.FLOOR_LOCAL_Y, -FH, FH);
  wall('foundation-right', edge0, FH, bottomLocal, C.FLOOR_LOCAL_Y, -FH, FH);
  wall('foundation-back', -FH, FH, bottomLocal, C.FLOOR_LOCAL_Y, -FH, -edge0);
  wall('foundation-front-left', -FH, -C.GATE_HALF, bottomLocal, C.FLOOR_LOCAL_Y, edge0, FH);
  wall('foundation-front-right', C.GATE_HALF, FH, bottomLocal, C.FLOOR_LOCAL_Y, edge0, FH);
  wall('wall-left', -17.45, -16.55, 0, 7.1, -17.45, 17.45);
  wall('wall-right', 16.55, 17.45, 0, 7.1, -17.45, 17.45);
  wall('wall-back', -17.45, 17.45, 0, 7.1, -17.45, -16.55);
  wall('wall-front-left', -17.45, -2.3, 0, 7.1, 16.55, 17.45);
  wall('wall-front-right', 2.3, 17.45, 0, 7.1, 16.55, 17.45);
  wall('gate-pier-left', -4.1, -2.3, 0, 8.5, 16.3, 18.4);
  wall('gate-pier-right', 2.3, 4.1, 0, 8.5, 16.3, 18.4);
  wall('gate-bridge', -2.3, 2.3, 7, 8.5, 16.3, 18.4);
  wall('front-tower-left', -19, -13, 0, 9.78, 13, 19);
  wall('front-tower-right', 13, 19, 0, 9.78, 13, 19);
  wall('keep-left', -5, -4.1, 0, 14, -15, -5);
  wall('keep-right', 4.1, 5, 0, 14, -15, -5);
  wall('keep-back', -5, 5, 0, 14, -15.35, -14.45);
  wall('keep-front-sill', -5, 5, 0, 1.2, -5.55, -4.65);
  wall('keep-front-door-left', -5, -1.2, 1.2, 4.4, -5.55, -4.65);
  wall('keep-front-door-right', 1.2, 5, 1.2, 4.4, -5.55, -4.65);
  wall('keep-front-mid', -5, 5, 4.4, 5.8, -5.55, -4.65);
  wall('keep-front-window-left', -5, -0.8, 5.8, 8.4, -5.55, -4.65);
  wall('keep-front-window-right', 0.8, 5, 5.8, 8.4, -5.55, -4.65);
  wall('keep-front-top', -5, 5, 8, 14, -5.55, -4.65);
  wall('keep-roof', -5.2, 5.2, 13.89, 14.31, -15.2, -4.8, { noCollide: true });
  return out;
}

/* ---------------- planta: ONDE fica cada construção ----------------
   Única dona do sorteio das construções. A ordem das chamadas ao `rng`
   é contrato ENTRE cliente e servidor (os dois rodam este código); ela
   não precisa mais casar com nada do stream global. */
export function planejarEstruturas({ rng, heightAt, slopeAt, WATER_LEVEL, CITY }) {
  if (typeof rng !== 'function') throw new Error('planejarEstruturas: rng ausente');
  const rand = (a = 1, b) => (b === undefined ? rng() * a : a + rng() * (b - a));
  const sites = [];   // {x, z, r, type} — mesma ordem de Structures.sites

  function clearOf(x, z, need = 16, cityNeed = 100) {
    if (Math.hypot(x, z) < 42) return false;
    if (Math.hypot(x - CITY.x, z - CITY.z) < cityNeed) return false;
    if (heightAt(x, z) < WATER_LEVEL + 1.5) return false; // nada construído dentro de lago
    for (const s of sites) if (Math.hypot(x - s.x, z - s.z) < s.r + need) return false;
    return true;
  }
  /* acha pontos planos e sem sobreposição: consome SEMPRE 2 × tries */
  function flatSpot(rMin, rMax, tries = 70, options = {}) {
    const { need = 16, cityNeed = 100, accept = null } = options;
    let best = null, bestS = 1e9;
    for (let i = 0; i < tries; i++) {
      const a = rand(TAU), r = rand(rMin, rMax);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!clearOf(x, z, need, cityNeed)) continue;
      const s = slopeAt(x, z) + slopeAt(x + 6, z) + slopeAt(x, z + 6) + slopeAt(x - 6, z) + slopeAt(x, z - 6);
      if (s >= bestS) continue;
      const candidate = { x, z };
      if (accept && !accept(candidate)) continue;
      bestS = s;
      best = candidate;
    }
    return best;
  }

  // O disco de ruínas urbanas (88 m), a órbita (30 m) e o corpo do Golem
  // (1,5 m) exigem 119,5 m. Rampa acima de 30° também é recusada, com a
  // mesma medida que monta os colisores do castelo.
  const forte = flatSpot(290, 410, 70, {
    cityNeed: 120,
    accept: c => medirSitioCastelo({ center: c, heightAt }).rampMaxSlopeDegrees <= MAX_RAMPA_CASTELO_GRAUS,
  }) || { x: 330, z: -280 };
  sites.push({ x: forte.x, z: forte.z, r: 28, type: 'forte' });

  const torres = [], cabanas = [], ruinas = [], bases = [];
  for (let i = 0; i < 6; i++) {
    const p = flatSpot(90, 470);
    if (!p) continue;
    sites.push({ x: p.x, z: p.z, r: 5, type: 'torre' });
    torres.push({ x: p.x, z: p.z, y: heightAt(p.x, p.z) });
  }
  for (let i = 0; i < 6; i++) {
    const p = flatSpot(70, 440);
    if (!p) continue;
    sites.push({ x: p.x, z: p.z, r: 6.5, type: 'cabana' });
    cabanas.push({ x: p.x, z: p.z, y: heightAt(p.x, p.z), flip: i % 2 === 0 });
  }
  for (let i = 0; i < 5; i++) {
    const p = flatSpot(80, 460);
    if (!p) continue;
    sites.push({ x: p.x, z: p.z, r: 5.5, type: 'ruína' });
    const alturas = [rand(1.1, 2.4), rand(0.9, 2.6), rand(0.6, 1.1), rand(0.8, 1.6)];
    ruinas.push({ x: p.x, z: p.z, y: heightAt(p.x, p.z), alturas });
  }

  const cx = CITY.x, cz = CITY.z, gy = heightAt(cx, cz);
  sites.push({ x: cx, z: cz, r: 88, type: 'cidade' });
  // inimigos de terno em andares alternados da Torre Nexus
  const campsNexus = [];
  for (let k = 1; k <= NEXUS.NF; k++) if (k % 2 === 0 && k < NEXUS.NF) {
    campsNexus.push({ x: cx + 3, z: cz + rand(-4, 4), suit: true, floorY: gy + k * NEXUS.FH });
    campsNexus.push({ x: cx + rand(0, 5), z: cz + rand(-5, 5), suit: true, floorY: gy + k * NEXUS.FH });
  }

  // fort.r (28) + need (30) = 58 m: cobre a órbita e o envelope máximo
  // ±21 × ±15 m das paredes da base.
  for (let i = 0; i < 2; i++) {
    const p = flatSpot(130, 380, 70, { need: 30 });
    if (!p) continue;
    sites.push({ x: p.x, z: p.z, r: 22, type: 'base' });
    const guardas = [];
    for (let g = 0; g < 4; g++) guardas.push({ x: p.x + rand(-12, 12), z: p.z + rand(-8, 8) });
    bases.push({ x: p.x, z: p.z, y: heightAt(p.x, p.z), guardas, caminhaoRy: rand(TAU) });
  }

  return { forte, torres, cabanas, ruinas, cidade: { x: cx, z: cz, gy }, campsNexus, bases, sites };
}

/* ---------------- peças: O QUE cada construção é ----------------
   Uma peça é uma caixa alinhada {w,h,d,x,y,z} (centro + medidas) com cor
   e `solida`. js/structures.js desenha TODAS; as sólidas viram parede. */
const peca = (w, h, d, x, y, z, cor, solida = true) => ({ w, h, d, x, y, z, cor, solida });

/* a MESMA conta de sbox/cityBox em js/structures.js */
export function caixaDaPeca(p, extra) {
  const b = { x0: p.x - p.w / 2, x1: p.x + p.w / 2, y0: p.y - p.h / 2, y1: p.y + p.h / 2,
    z0: p.z - p.d / 2, z1: p.z + p.d / 2 };
  return extra ? Object.assign(b, extra) : b;
}

export const TORRE_H = 6.2;
export function pecasTorre(cx, cz, y) {
  const H = TORRE_H, out = [];
  for (const [ox, oz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]])
    out.push(peca(0.34, H + 2, 0.34, cx + ox, y + H / 2 - 1, cz + oz, 0x6b4a2e));
  out.push(peca(3.4, 0.2, 0.2, cx, y + 2.3, cz - 1.4, 0x8a6238, false));
  out.push(peca(3.4, 0.2, 0.2, cx, y + 2.3, cz + 1.4, 0x8a6238, false));
  out.push(peca(0.2, 0.2, 3.4, cx - 1.4, y + 3.6, cz, 0x8a6238, false));
  out.push(peca(0.2, 0.2, 3.4, cx + 1.4, y + 3.6, cz, 0x8a6238, false));
  out.push(peca(3.7, 0.28, 3.7, cx, y + H, cz, 0x8a6238));
  // Guarda-corpos SÓLIDOS: 6,3 m de queda sem parapeito é armadilha, e o
  // murinho de 0,5 m também para bala — o tampo vira ninho de sniper de
  // verdade. A face LESTE é a boca da escada: o trecho tem 2,7 m.
  out.push(peca(3.7, 0.5, 0.14, cx, y + H + 0.5, cz - 1.78, 0x6b4a2e));
  out.push(peca(3.7, 0.5, 0.14, cx, y + H + 0.5, cz + 1.78, 0x6b4a2e));
  out.push(peca(0.14, 0.5, 3.7, cx - 1.78, y + H + 0.5, cz, 0x6b4a2e));
  out.push(peca(0.14, 0.5, 2.7, cx + 1.78, y + H + 0.5, cz - 0.5, 0x6b4a2e));
  return out;
}

export const CABANA_H = 2.7;
export function dimensoesCabana(flip) {
  return { W: flip ? 4.4 : 5.4, D: flip ? 5.4 : 4.4, H: CABANA_H };
}
export function pecasCabana(cx, cz, y, flip) {
  const { W, D, H } = dimensoesCabana(flip);
  const out = [];
  out.push(peca(W + 0.7, 0.34, D + 0.7, cx, y + 0.05, cz, 0x6e6a63, false));          // base
  out.push(peca(W, H, 0.26, cx, y + H / 2 + 0.15, cz - D / 2, 0x8a6238));             // fundo
  out.push(peca(0.26, H, D, cx - W / 2, y + H / 2 + 0.15, cz, 0x8a6238));             // lateral esq
  out.push(peca(0.26, H, D, cx + W / 2, y + H / 2 + 0.15, cz, 0x8a6238));             // lateral dir
  const doorW = 1.2, segW = (W - doorW) / 2;                                          // frente com porta
  out.push(peca(segW, H, 0.26, cx - (doorW + segW) / 2, y + H / 2 + 0.15, cz + D / 2, 0x8a6238));
  out.push(peca(segW, H, 0.26, cx + (doorW + segW) / 2, y + H / 2 + 0.15, cz + D / 2, 0x8a6238));
  out.push(peca(doorW + 0.3, 0.45, 0.3, cx, y + H + 0.05, cz + D / 2, 0x6b4a2e, false));
  out.push(peca(W + 0.8, 0.18, D + 0.8, cx, y + H + 0.35, cz, 0x6b4a2e));             // forro
  out.push(peca(0.5, 1.5, 0.5, cx + W * 0.28, y + H + 1.1, cz - D * 0.18, 0x6e6a63, false)); // chaminé
  return out;
}

export function pecasRuina(cx, cz, y, alturas) {
  const [a0, a1, a2, a3] = alturas;
  return [
    peca(4.6, a0, 0.42, cx, y + 0.7, cz - 2, 0x9a958c),
    peca(0.42, a1, 4.2, cx - 2.2, y + 0.7, cz, 0x9a958c),
    peca(2, a2, 0.42, cx + 1, y + 0.4, cz + 1.8, 0x6e6a63),
    peca(0.7, 3, 0.7, cx + 2.1, y + 1.5, cz + 1.9, 0x9a958c),
    peca(0.7, a3, 0.7, cx - 2.1, y + 0.6, cz + 1.9, 0x6e6a63),
  ];
}

export function pecasBase(cx, cz, y) {
  const W2 = 21, D2 = 15, H2 = 2.4, out = [];
  out.push(peca(W2 * 2, H2, 0.7, cx, y + H2 / 2 - 0.3, cz - D2, 0x4a5240));
  out.push(peca(0.7, H2, D2 * 2, cx - W2, y + H2 / 2 - 0.3, cz, 0x4a5240));
  out.push(peca(0.7, H2, D2 * 2, cx + W2, y + H2 / 2 - 0.3, cz, 0x4a5240));
  const g2 = 6;
  out.push(peca(W2 - g2 / 2, H2, 0.7, cx - (g2 / 2 + (W2 - g2 / 2) / 2), y + H2 / 2 - 0.3, cz + D2, 0x4a5240));
  out.push(peca(W2 - g2 / 2, H2, 0.7, cx + (g2 / 2 + (W2 - g2 / 2) / 2), y + H2 / 2 - 0.3, cz + D2, 0x4a5240));
  // sacos de areia + caixotes
  for (let i = 0; i < 5; i++) out.push(peca(2.2, 0.8, 0.6, cx - 4 + i * 2.4, y + 0.4, cz + D2 - 3, 0x8a7a58));
  out.push(peca(1.4, 1.4, 1.4, cx + 6, y + 0.7, cz - 8, 0x6b5a38));
  out.push(peca(1.2, 1.2, 1.2, cx + 7.6, y + 0.6, cz - 7.2, 0x6b5a38));
  return out;
}

/* ---------------- cidade: lotes, térreo oco e Torre Nexus ----------------
   Sem sorteio nenhum: tudo sai de CityLayout/CityInterior e da altura do
   centro (gy). O que é SÓLIDO sai daqui; fachada, trim, tinta e luzes são
   de js/structures.js. */
export function lote(lot, idx, cx, cz, gy) {
  const { w, h } = lot;
  const bx = cx + lot.ox, bz = cz + lot.oz, d = CityLayout.lotDepth(lot);
  const oco = CityInterior.isHollowLot(idx);
  const gfH = CityInterior.groundFloorHeight(lot, oco);
  // oco: o volume maciço começa ACIMA do térreo (o térreo vira sala)
  const volume = oco
    ? { w, h: h - gfH, d, x: bx, y: gy + gfH + (h - gfH) / 2, z: bz }
    : { w, h, d, x: bx, y: gy + h / 2, z: bz };
  const out = { lot, idx, bx, bz, d, oco, gfH, volume, interior: null };
  if (oco) {
    const plan = CityInterior.interiorPlan(lot, d, gfH);
    out.interior = {
      plan,
      paredes: plan.walls.map(s => ({ w: s.w, h: s.h, d: s.d, x: bx + s.x, y: gy + s.y, z: bz + s.z })),
      cobertura: plan.cover.map(c => ({ w: c.w, h: c.h, d: c.d, x: bx + c.x, y: gy + c.h / 2, z: bz + c.z })),
    };
  }
  return out;
}

export const NEXUS = Object.freeze({ W: 18, FH: 3.4, NF: 10 });

/* casca externa texturizada (porta ao sul) — telhado pisável em todas */
export function cascaNexus(cx, cz, gy) {
  const { W, FH: fh, NF } = NEXUS;
  return [
    { w: W, h: NF * fh + 1, d: 0.5, x: cx, y: gy + (NF * fh + 1) / 2, z: cz - W / 2 },              // norte
    { w: 0.5, h: NF * fh + 1, d: W, x: cx - W / 2, y: gy + (NF * fh + 1) / 2, z: cz },              // oeste
    { w: 0.5, h: NF * fh + 1, d: W, x: cx + W / 2, y: gy + (NF * fh + 1) / 2, z: cz },              // leste
    { w: W / 2 - 2, h: NF * fh + 1, d: 0.5, x: cx - W / 4 - 1, y: gy + (NF * fh + 1) / 2, z: cz + W / 2 }, // sul-esq
    { w: W / 2 - 2, h: NF * fh + 1, d: 0.5, x: cx + W / 4 + 1, y: gy + (NF * fh + 1) / 2, z: cz + W / 2 }, // sul-dir
    { w: 4.2, h: NF * fh + 1 - 3, d: 0.5, x: cx, y: gy + 3 + (NF * fh - 2) / 2, z: cz + W / 2 },    // acima da porta
  ];
}

/* INTERIOR da Torre Nexus: escada dog-leg (dois lances em U) + poço + lobby.
   Devolve `info` (o NEXUS_INTERIOR que os testes leem) e `ops`, a lista
   ORDENADA do que existe lá dentro, em coordenadas LOCAIS (x,z relativos ao
   centro; y absoluto). Cada op carrega a `parede` e/ou a `plataforma` que
   gera — calculadas AQUI, com a aritmética de sempre — e os números que o
   desenho precisa. */
export function interiorNexus(cx, cz, gy) {
  const { W, FH: fh, NF } = NEXUS;
  const towerTopY = gy + NF * fh + 0.25;
  const HALF = W / 2 - 0.25;               // 8.75: meia-largura interna (casca 0.5)
  const WELL = { x0: -HALF, x1: -4.9, z0: -HALF, z1: -4.1 }; // poço fixo (NO)
  const GAP = 0.2, SLABT = 0.24, RAILH = 0.98, STEPS = 10;
  const FLW = (WELL.x1 - WELL.x0 - GAP) / 2;
  const xA0 = WELL.x0, xA1 = WELL.x0 + FLW;  // lance A (oeste)
  const xB0 = WELL.x1 - FLW, xB1 = WELL.x1;  // lance B (leste)
  const zMid = WELL.z0 + 1.75;               // topo dos lances / borda sul do patamar
  const zBot = WELL.z1;                       // base dos lances (borda norte do apron)
  const info = { W, fh, floors: NF, well: WELL, flightWidth: FLW, flightRun: zBot - zMid,
    gap: GAP, midDepth: 1.75, riserCount: STEPS, railHeight: RAILH, slabT: SLABT,
    xA0, xA1, xB0, xB1, zMid, zBot, half: HALF, gy, towerTopY };
  const ops = [];
  const panelH = NF * fh;
  // 4 pilares estruturais do lobby (colisor)
  for (const [px, pz] of [[-2.5, -5.5], [-2.5, 5.5], [6, -5.5], [6, 5.5]])
    ops.push({ tipo: 'pilar', px, pz, parede: { x0: cx + px - 0.25, x1: cx + px + 0.25, y0: gy, y1: gy + panelH,
      z0: cz + pz - 0.25, z1: cz + pz + 0.25, city: true } });
  // laje/patamar: pisável + parede noCollide (barra bala, não empurra)
  const laje = (x0, x1, z0, z1, y) => ops.push({ tipo: 'laje', x0, x1, z0, z1, y,
    parede: { x0: cx + x0, x1: cx + x1, y0: y - SLABT, y1: y, z0: cz + z0, z1: cz + z1, noCollide: true, city: true },
    plataforma: { x0: cx + x0, x1: cx + x1, z0: cz + z0, z1: cz + z1, y, city: true } });
  // corrimão horizontal; colisor fino contínuo opcional
  const corrimao = (x0, x1, z0, z1, yb, colide) => {
    const horiz = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, t = 0.12;
    ops.push({ tipo: 'corrimao', x0, x1, z0, z1, yb, colide,
      parede: colide ? { x0: cx + (horiz ? x0 : mx - t / 2), x1: cx + (horiz ? x1 : mx + t / 2),
        y0: yb, y1: yb + RAILH, z0: cz + (horiz ? mz - t / 2 : z0), z1: cz + (horiz ? mz + t / 2 : z1), city: true } : null });
  };
  // um lance: rampa lógica contínua (colisão SUAVE); degraus são só desenho
  const lance = (xL, xR, yN, yS) => ops.push({ tipo: 'lance', xL, xR, yN, yS,
    plataforma: { ramp: true, axis: 'z', x0: cx + xL, x1: cx + xR, z0: cz + zMid, z1: cz + zBot, y0: yN, y1: yS, city: true } });
  const corrimaoInclinado = (x, yN, yS) => ops.push({ tipo: 'corrimaoInclinado', x, yN, yS });
  const stairGuards = (y) => {
    corrimao(WELL.x1, WELL.x1, WELL.z0, zBot, y, true);   // borda leste do poço
    corrimao(xA1, xB0, zBot, zBot, y, true);              // vão central na borda do apron
  };
  const buildStaircase = (yBottom, yTop) => {
    const ym = (yBottom + yTop) / 2;
    laje(xA0, xB1, WELL.z0, zMid, ym);                    // patamar intermediário (norte)
    lance(xA0, xA1, ym, yBottom);                         // lance A: patamar -> piso baixo
    lance(xB0, xB1, ym, yTop);                            // lance B: patamar -> piso alto
    corrimaoInclinado(xA1, ym, yBottom); corrimaoInclinado(xB0, ym, yTop);
    corrimao(WELL.x1, WELL.x1, WELL.z0, zMid, ym, true);  // borda leste do patamar
  };
  // pavimento: laje = bloco leste + apron SO (tudo menos o poço)
  const buildFloor = (y) => { laje(WELL.x1, HALF, -HALF, HALF, y); laje(-HALF, WELL.x1, zBot, HALF, y); };
  for (let k = 1; k <= NF; k++) {
    const yTop = k === NF ? towerTopY : gy + k * fh;
    if (k < NF) { buildFloor(gy + k * fh); stairGuards(gy + k * fh); }
    buildStaircase(gy + (k - 1) * fh, yTop);
    ops.push({ tipo: 'luminaria', w: 1.4, d: 0.4, x: 3.5, y: gy + k * fh - 0.35, z: 0 });
    ops.push({ tipo: 'luminaria', w: 0.5, d: 1.2, x: -6.5, y: gy + k * fh - 0.35, z: -5.5 });
    ops.push({ tipo: 'placa', andar: k, x: -4.7, y: gy + (k - 1) * fh + 2.3, z: -4.0 });
  }
  // telhado: deck com a saída da escada (poço aberto) + guarda-corpo
  buildFloor(towerTopY);
  stairGuards(towerTopY);
  return { info, ops };
}

/* ---------------- cidade destruída e cofre ----------------
   Escombros: stubs nos centros dos lotes (contrato de 3 lugares com
   CityLayout.LOTS e city-destruction-protocol.js). Só os 6 primeiros ganham
   colisor, BAIXO (1,6 m); a Torre vira um toco de 13 m. */
export const LOTES_ESCOMBROS = Object.freeze([
  [-34, -28, 11, 22], [-16, -34, 12, 16], [4, -30, 10, 26], [38, -26, 13, 18],
  [-40, -2, 10, 14], [-38, 44, 12, 20], [-14, 42, 11, 24], [8, 44, 12, 15],
  [40, 8, 11, 19], [42, 42, 13, 28], [-44, 18, 9, 12], [16, -8, 9, 13],
]);
export function escombrosDaCidade(cx, cz, gy, heightAt) {
  const out = [];
  LOTES_ESCOMBROS.forEach(([ox, oz, w], li) => {
    if (li >= 6) return;
    const sy = heightAt(cx + ox, cz + oz);
    out.push({ x0: cx + ox - w / 2, x1: cx + ox + w / 2,
      y0: sy - 0.4, y1: sy + 1.6, z0: cz + oz - w / 2, z1: cz + oz + w / 2, cityRuin: true });
  });
  out.push({ x0: cx - 6.5, x1: cx + 6.5, y0: gy - 0.4, y1: gy + 13, z0: cz - 6.5, z1: cz + 6.5, cityRuin: true });
  return out;
}

/* O cofre dos segredos (js/secrets.js) nasce DEPOIS do worldgen dentro de um
   térreo oco e empurra UMA parede urbana em Structures.walls. ESPELHO da conta
   de lá: a paridade acusa se divergir. */
export function paredeDoCofre(interiores, centro) {
  const it = pickVaultInterior(interiores, centro);
  if (!it) return null;
  const px = it.bx + (it.lot.w / 2 - 1.6) * (it.lot.ox >= 0 ? -1 : 1);
  const pz = it.bz + (it.d / 2 - 1.6) * (it.lot.oz >= 0 ? -1 : 1);
  return { x0: px - 0.75, x1: px + 0.75, y0: it.gy, y1: it.gy + 1.04, z0: pz - 0.5, z1: pz + 0.5, city: true };
}

/* ---------------- o mundo sólido inteiro ----------------
   `rng` é opcional (padrão: rngEstruturas(worldSeed)); existe para o teste
   de paridade provar que um consumo a mais em UM dos lados aparece. */
export function construirMundoSolido({ worldSeed, heightAt, slopeAt, WATER_LEVEL, CITY, rng }) {
  for (const [nome, fn] of [['heightAt', heightAt], ['slopeAt', slopeAt]])
    if (typeof fn !== 'function') throw new Error(`construirMundoSolido: ${nome} ausente`);
  if (!Number.isFinite(WATER_LEVEL)) throw new Error('construirMundoSolido: WATER_LEVEL ausente');
  if (!CITY || !Number.isFinite(CITY.x) || !Number.isFinite(CITY.z)) throw new Error('construirMundoSolido: CITY ausente');
  const semente = sementeNormalizada(worldSeed);
  const plano = planejarEstruturas({ rng: rng || rngEstruturas(semente), heightAt, slopeAt, WATER_LEVEL, CITY });
  const paredes = [], origens = [];
  const add = (parede, origem) => { paredes.push(parede); origens.push(origem); };
  const solidas = (pecas, origem) => { for (const p of pecas) if (p.solida) add(caixaDaPeca(p), origem); };

  const pecas = {
    torres: plano.torres.map(t => pecasTorre(t.x, t.z, t.y)),
    cabanas: plano.cabanas.map(c => pecasCabana(c.x, c.z, c.y, c.flip)),
    ruinas: plano.ruinas.map(r => pecasRuina(r.x, r.z, r.y, r.alturas)),
    bases: plano.bases.map(b => pecasBase(b.x, b.z, b.y)),
  };
  pecas.torres.forEach((p, i) => solidas(p, `torre#${i}`));
  pecas.cabanas.forEach((p, i) => solidas(p, `cabana#${i}`));
  pecas.ruinas.forEach((p, i) => solidas(p, `ruína#${i}`));

  const { x: cx, z: cz, gy } = plano.cidade;
  const lotes = CityLayout.LOTS.map((lot, i) => lote(lot, i, cx, cz, gy));
  const interiores = [];
  for (const L of lotes) {
    add(caixaDaPeca(L.volume, { city: true }), `lote#${L.idx}`);
    if (!L.interior) continue;
    for (const s of L.interior.paredes) add(caixaDaPeca(s, { city: true }), `lote#${L.idx}/térreo`);
    for (const c of L.interior.cobertura) add(caixaDaPeca(c, { city: true }), `lote#${L.idx}/cobertura`);
    interiores.push({ lot: L.lot, bx: L.bx, bz: L.bz, gy, d: L.d, gfH: L.gfH, plan: L.interior.plan });
  }
  const casca = cascaNexus(cx, cz, gy);
  for (const b of casca) add(caixaDaPeca(b, { city: true }), 'nexus/casca');
  const nexus = interiorNexus(cx, cz, gy);
  for (const op of nexus.ops) if (op.parede) add(op.parede, `nexus/${op.tipo}`);

  pecas.bases.forEach((p, i) => solidas(p, `base#${i}`));

  const castelo = medirSitioCastelo({ center: plano.forte, heightAt });
  for (const w of paredesDoCastelo(castelo)) add(w, `castelo/${w.part}`);

  return {
    semente, plano, paredes, origens, pecas,
    cidade: { cx, cz, gy, lotes, casca, nexus, interiores },
    castelo,
    escombros: escombrosDaCidade(cx, cz, gy, heightAt),
    cofre: paredeDoCofre(interiores, { x: cx, z: cz }),
  };
}

/* o que Structures.walls tem com a cidade DE PÉ, depois do boot inteiro
   (estruturas + castelo + cofre dos segredos) */
export function paredesDoJogo(mundo) {
  return mundo.cofre ? mundo.paredes.concat([mundo.cofre]) : mundo.paredes.slice();
}

/* ... e depois de city.destroy(): urbano sai (cofre junto), escombros entram */
export function paredesComCidadeDestruida(mundo) {
  return paredesDoJogo(mundo).filter(w => !w.city).concat(mundo.escombros);
}

/* ---------------- consulta: raio / segmento × caixas ----------------
   A MESMA conta de Structures.rayHit (slab test): distância até a primeira
   face atingida à frente da origem, ou Infinity. Origem dentro da caixa não
   conta (t0 = 0), como no jogo. Lajes `noCollide` barram bala, então entram. */
export function criarConsultaParedes(paredes) {
  const n = paredes.length;
  const w = new Float64Array(n * 6);
  for (let i = 0, o = 0; i < n; i++, o += 6) {
    const b = paredes[i];
    w[o] = b.x0; w[o + 1] = b.x1; w[o + 2] = b.y0; w[o + 3] = b.y1; w[o + 4] = b.z0; w[o + 5] = b.z1;
  }
  function raio(o, d, maxDist) {
    let best = maxDist;
    for (let i = 0, p = 0; i < n; i++, p += 6) {
      let t0 = 0, t1 = best, ta, tb;
      const bx0 = w[p], bx1 = w[p + 1], by0 = w[p + 2], by1 = w[p + 3], bz0 = w[p + 4], bz1 = w[p + 5];
      if (Math.abs(d.x) < 1e-8) { if (o.x < bx0 || o.x > bx1) continue; }
      else { ta = (bx0 - o.x) / d.x; tb = (bx1 - o.x) / d.x; if (ta > tb) { const m = ta; ta = tb; tb = m; } t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue; }
      if (Math.abs(d.y) < 1e-8) { if (o.y < by0 || o.y > by1) continue; }
      else { ta = (by0 - o.y) / d.y; tb = (by1 - o.y) / d.y; if (ta > tb) { const m = ta; ta = tb; tb = m; } t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue; }
      if (Math.abs(d.z) < 1e-8) { if (o.z < bz0 || o.z > bz1) continue; }
      else { ta = (bz0 - o.z) / d.z; tb = (bz1 - o.z) / d.z; if (ta > tb) { const m = ta; ta = tb; tb = m; } t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue; }
      if (t0 > 0 && t0 < best) best = t0;
    }
    return best === maxDist ? Infinity : best;
  }
  /* a MESMA conta de Structures.segBlocked (Vector3.length + multiplyScalar):
     a reta a→b bate numa caixa antes de chegar em b */
  function segmentoBloqueado(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-4) return false;
    const inv = 1 / len;
    return raio(a, { x: dx * inv, y: dy * inv, z: dz * inv }, len) < len;
  }
  return { n, raio, segmentoBloqueado };
}
