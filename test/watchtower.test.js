/* ================================================================
   QA — TORRE DE VIGIA SUBÍVEL (contrato geométrico puro).

   As 6 torres do campo (js/structures.js: flatSpot(90, 470)) tinham
   varanda modelada, entravam em `walls[]` (colisão lateral) e em
   `fieldRoofs` (chuva) — mas NUNCA em `platforms[]`. Como groundAt()
   (js/terrain.js) só consulta `platforms`, o jogador ATRAVESSAVA o
   tampo: 6 miradouros de graça no mapa, nenhum utilizável.

   Plataforma sozinha não resolve: groundAt só "gruda" numa laje até
   +0,65 m acima do pé atual (js/terrain.js:175). Um tampo a 6,34 m sem
   acesso vira plataforma inalcançável. Este teste trava as DUAS metades:
   o tampo existe E a escada dog-leg encosta nele em degraus <= 0,65 m,
   sem furo lógico entre lances/patamares.
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let W;
before(async () => { W = await import('../js/watchtower.js'); });

/* Espelho EXATO da regra de groundAt (js/terrain.js:160-178) para um
   conjunto de plataformas + terreno plano. Se a regra do jogo mudar,
   este espelho e o MAX_STEP_UP exportado têm que mudar junto. */
function groundAt(platforms, terrainY, x, z, curY) {
  let g = terrainY;
  for (const p of platforms) {
    if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
    let top = p.y;
    if (p.ramp) {
      const k = p.axis === 'x' ? (x - p.x0) / (p.x1 - p.x0) : (z - p.z0) / (p.z1 - p.z0);
      const t = Math.min(1, Math.max(0, k));
      top = p.y0 + (p.y1 - p.y0) * t;
    }
    if (top > g && top <= curY + W.MAX_STEP_UP) g = top;
  }
  return g;
}

const CX = 120, CZ = -75, GY = 8.5;

describe('Torre de vigia — tampo pisável', () => {
  it('publica uma plataforma para o tampo, na altura do piso da varanda', () => {
    const plats = W.towerPlatforms(CX, CZ, GY);
    const deck = plats.find(p => p.role === 'deck');
    assert.ok(deck, 'nenhuma plataforma com role="deck"');
    assert.equal(deck.ramp, undefined, 'o tampo é laje plana, não rampa');
    const s = W.towerSurfaces(CX, CZ, GY);
    assert.ok(Math.abs(deck.y - s.deckY) < 1e-9);
    // o tampo é o topo da caixa da varanda: gy + H + espessura/2
    assert.ok(Math.abs(s.deckY - (GY + W.TOWER.H + W.TOWER.DECK_T / 2)) < 1e-9,
      `deckY ${s.deckY} não bate com o tampo modelado`);
    // cobre o footprint da varanda (3,7 × 3,7)
    assert.ok(deck.x0 <= CX - W.TOWER.DECK_HALF + 1e-9 && deck.x1 >= CX + W.TOWER.DECK_HALF - 1e-9);
    assert.ok(deck.z0 <= CZ - W.TOWER.DECK_HALF + 1e-9 && deck.z1 >= CZ + W.TOWER.DECK_HALF - 1e-9);
  });

  it('todas as plataformas ficam dentro do raio de site da torre + folga da escada', () => {
    const plats = W.towerPlatforms(CX, CZ, GY);
    for (const p of plats) {
      for (const [x, z] of [[p.x0, p.z0], [p.x1, p.z1], [p.x0, p.z1], [p.x1, p.z0]]) {
        const d = Math.hypot(x - CX, z - CZ);
        // árvores só são barradas até site.r + 4 = 9 m (game.js): a escada
        // TEM que caber aí dentro, senão nasce árvore no meio do degrau
        assert.ok(d <= 9, `plataforma a ${d.toFixed(2)} m do centro (limite 9)`);
      }
    }
  });
});

describe('Torre de vigia — a escada realmente sobe', () => {
  it('o pé da escada nasce no chão (jogador alcança sem pular)', () => {
    const plats = W.towerPlatforms(CX, CZ, GY);
    const s = W.towerSurfaces(CX, CZ, GY);
    const g = groundAt(plats, GY, s.entry.x, s.entry.z, GY);
    assert.ok(g - GY <= W.MAX_STEP_UP + 1e-9,
      `entrada da escada a ${(g - GY).toFixed(2)} m do chão (limite ${W.MAX_STEP_UP})`);
  });

  it('o pé fica ENTERRADO: o terreno mais alto do footprint ainda pega a rampa', () => {
    const s = W.towerSurfaces(CX, CZ, GY);
    assert.ok(s.flightA.y1 <= GY - 0.5,
      `pé da rampa em ${s.flightA.y1.toFixed(2)} (gy=${GY}) — flutua onde o chão cai`);
    // e mesmo com o terreno 0,7 m ACIMA de gy (pior caso medido nas 6
    // torres) a subida continua pegando a rampa sem degrau proibido
    for (const solo of [GY - 0.7, GY, GY + 0.7]) {
      const plats = W.towerPlatforms(CX, CZ, GY);
      let cur = solo, pior = 0;
      for (const wp of W.climbWaypoints(CX, CZ, GY, 0.25)) {
        const g = groundAt(plats, solo, wp.x, wp.z, cur);
        if (g - cur > pior) pior = g - cur;
        cur = g;
      }
      assert.ok(pior <= W.MAX_STEP_UP + 1e-9, `terreno ${solo}: degrau de ${pior.toFixed(3)} m`);
      assert.ok(Math.abs(cur - s.deckY) < 1e-6, `terreno ${solo}: não chegou ao tampo`);
    }
  });

  it('a subida inteira é contínua: nenhum degrau lógico acima de MAX_STEP_UP', () => {
    const plats = W.towerPlatforms(CX, CZ, GY);
    const path = W.climbWaypoints(CX, CZ, GY, 0.25);
    assert.ok(path.length > 40, `caminho curto demais (${path.length} amostras)`);
    let curY = GY, pior = 0, piorEm = null;
    for (const wp of path) {
      const g = groundAt(plats, GY, wp.x, wp.z, curY);
      const salto = g - curY;
      if (salto > pior) { pior = salto; piorEm = wp; }
      curY = g;
    }
    assert.ok(pior <= W.MAX_STEP_UP + 1e-9,
      `degrau de ${pior.toFixed(3)} m em ${JSON.stringify(piorEm)} (limite ${W.MAX_STEP_UP})`);
  });

  it('quem percorre o caminho todo termina EM CIMA do tampo', () => {
    const plats = W.towerPlatforms(CX, CZ, GY);
    const s = W.towerSurfaces(CX, CZ, GY);
    const path = W.climbWaypoints(CX, CZ, GY, 0.25);
    let curY = GY;
    for (const wp of path) curY = groundAt(plats, GY, wp.x, wp.z, curY);
    assert.ok(Math.abs(curY - s.deckY) < 1e-6,
      `terminou em ${curY.toFixed(3)}, esperado o tampo em ${s.deckY.toFixed(3)}`);
    const fim = path[path.length - 1];
    assert.ok(Math.hypot(fim.x - CX, fim.z - CZ) < 1.0, 'o caminho não chega ao centro do tampo');
  });

  it('os dois lances têm inclinação humana (<= 38°) e igual entre si', () => {
    const s = W.towerSurfaces(CX, CZ, GY);
    const a = s.flightA, b = s.flightB;
    const angA = Math.atan2(Math.abs(a.y1 - a.y0), a.z1 - a.z0) * 180 / Math.PI;
    const angB = Math.atan2(Math.abs(b.y1 - b.y0), b.z1 - b.z0) * 180 / Math.PI;
    assert.ok(angA <= 38, `lance A a ${angA.toFixed(1)}°`);
    assert.ok(angB <= 38, `lance B a ${angB.toFixed(1)}°`);
    assert.ok(Math.abs(angA - angB) < 0.5, `lances desiguais: ${angA.toFixed(1)}° vs ${angB.toFixed(1)}°`);
  });

  it('a escada NÃO invade o footprint da varanda (não empurra em parede)', () => {
    const s = W.towerSurfaces(CX, CZ, GY);
    // lances e patamar intermediário ficam a leste da caixa do tampo; só o
    // patamar de topo (já na altura do tampo) pode sobrepor
    for (const r of [s.flightA, s.flightB, s.landingN]) {
      assert.ok(r.x0 >= CX + W.TOWER.DECK_HALF - 1e-9,
        `rampa/patamar invade o footprint em x0=${r.x0} (limite ${CX + W.TOWER.DECK_HALF})`);
    }
    assert.ok(s.landingT.y === s.deckY, 'o patamar de topo tem que estar na altura do tampo');
    assert.ok(s.landingT.x0 < CX + W.TOWER.DECK_HALF,
      'o patamar de topo precisa SOBREPOR o tampo, senão sobra um vão pra cair');
  });
});

describe('Torre de vigia — determinismo e ausência de RNG', () => {
  it('o contrato é puro: duas chamadas dão exatamente o mesmo resultado', () => {
    assert.deepEqual(W.towerPlatforms(CX, CZ, GY), W.towerPlatforms(CX, CZ, GY));
    assert.deepEqual(W.towerSurfaces(CX, CZ, GY), W.towerSurfaces(CX, CZ, GY));
  });

  it('não consome Math.random (a torre nasce na fase SEEDADA do worldgen)', () => {
    const R = Math.random;
    let n = 0;
    Math.random = () => { n++; return R(); };
    try {
      W.towerPlatforms(CX, CZ, GY);
      W.towerSurfaces(CX, CZ, GY);
      W.towerSteps(CX, CZ, GY);
      W.climbWaypoints(CX, CZ, GY, 0.25);
    } finally { Math.random = R; }
    assert.equal(n, 0, `o contrato da torre consumiu ${n} Math.random — desloca o mundo inteiro`);
  });

  it('translada rigidamente: mover a torre move tudo junto', () => {
    const a = W.towerPlatforms(0, 0, 0);
    const b = W.towerPlatforms(50, -20, 3);
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) {
      assert.ok(Math.abs((b[i].x0 - a[i].x0) - 50) < 1e-9, 'x não transladou');
      assert.ok(Math.abs((b[i].z0 - a[i].z0) + 20) < 1e-9, 'z não transladou');
      const ay = a[i].ramp ? a[i].y0 : a[i].y, by = b[i].ramp ? b[i].y0 : b[i].y;
      assert.ok(Math.abs((by - ay) - 3) < 1e-9, 'y não transladou');
    }
  });
});

describe('Torre de vigia — degraus visuais', () => {
  it('os degraus acompanham a rampa lógica (nenhum flutuando fora dela)', () => {
    const steps = W.towerSteps(CX, CZ, GY);
    const s = W.towerSurfaces(CX, CZ, GY);
    assert.ok(steps.length >= 14, `poucos degraus (${steps.length})`);
    const dentro = (r, x, z) => x >= r.x0 - 1e-6 && x <= r.x1 + 1e-6 && z >= r.z0 - 1e-6 && z <= r.z1 + 1e-6;
    for (const st of steps) {
      const r = st.flight === 'A' ? s.flightA : s.flightB;
      assert.ok(dentro(r, st.x, st.z), `degrau fora da rampa ${st.flight}: ${JSON.stringify(st)}`);
      const k = (st.z - r.z0) / (r.z1 - r.z0);
      const rampY = r.y0 + (r.y1 - r.y0) * k;
      // o topo do degrau visual encosta na rampa lógica (tolerância de meia espessura)
      assert.ok(Math.abs((st.y + st.h / 2) - rampY) < 0.06,
        `degrau descolado da rampa: topo ${(st.y + st.h / 2).toFixed(3)} vs ${rampY.toFixed(3)}`);
    }
  });
});
