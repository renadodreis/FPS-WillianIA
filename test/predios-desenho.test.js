/* ================================================================
   PRÉDIOS × TERRENO — o que o DESENHO mostra (jogo real, Chrome).

   test/predios-assentamento.test.js mede a COLISÃO em Node. Aqui a pergunta
   é outra: o jogador VÊ vão? O jogo sobe por semente e a medida é feita na
   malha desenhada, sem heightAt nenhum:
     • terreno = os triângulos do `terrainMesh` (a superfície que aparece);
     • construção = os triângulos da malha mesclada `estruturas` e, no
       castelo, do GLB + fundação (saia e rampa) — com as matrizes de mundo.
   Numa vertical dentro da pegada de cada peça de chão conta-se o sólido
   desenhado (face virada para baixo entra, para cima sai): o terreno dentro
   de sólido = vão zero; senão o vão é a distância até a primeira face acima.
   No castelo, raios curtos atravessam a borda da pegada do chão até o piso:
   o que passa sem bater em nada é buraco na casca.

   ANTES do conserto (12 sementes, mesma sonda): muro de base 8,18 m de vão
   desenhado, sacos 2,68 m, caixote 2,03 m, cabana 0,55 m, ruína 0,58 m;
   portão do castelo com buraco de até 4,0 m na casca (987654) e a rampa
   sobre um vazio de até 4,98 m. Torre: 0 (controle).

   Quem é peça de chão vem do DADO (js/paredes.js) com a classificação
   geométrica de test/predios-assentamento.test.js; o que se mede é a malha.
   Portas 4100–4103 (faixa desta frente).
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');
const Bots = require('../scripts/bots.js');
const { importar } = require('./helpers/pve-mundo');

const CASOS = [['987654', 4100], ['99', 4101], ['20260928', 4102], ['424242', 4103]];

const DE_CHAO = {
  torre: p => p.solida && p.h > 3,
  cabana: p => p.solida && p.h > 1,
  ruína: p => p.solida,
  base: p => p.solida,
};
const nomeDaPeca = (tipo, p) => (tipo !== 'base' ? tipo
  : Math.abs(p.w - p.d) < 1e-9 && p.w <= 1.4 ? 'caixote'
    : Math.abs(p.w - 2.2) < 1e-9 && Math.abs(p.d - 0.6) < 1e-9 ? 'sacos' : 'muro');

async function entradaDaSemente(semente) {
  const P = await importar('paredes.js');
  const t = await Bots.createBotTerrain(Number(semente));
  const m = P.construirMundoSolido({ worldSeed: semente, heightAt: t.heightAt, slopeAt: t.slopeAt, WATER_LEVEL: t.WATER_LEVEL, CITY: t.CITY });
  const pecas = [];
  const grupos = [['torre', m.plano.torres, m.pecas.torres], ['cabana', m.plano.cabanas, m.pecas.cabanas],
    ['ruína', m.plano.ruinas, m.pecas.ruinas], ['base', m.plano.bases, m.pecas.bases]];
  for (const [tipo, planos, lista] of grupos) planos.forEach((c, i) => lista[i].forEach((p, j) => {
    if (DE_CHAO[tipo](p)) pecas.push({ tipo: nomeDaPeca(tipo, p), nome: `${tipo}#${i}/${j}`, box: P.caixaDaPeca(p) });
  }));
  const c = m.castelo;
  return { pecas, castelo: { cx: c.center.x, cz: c.center.z, floorY: c.floorY, originY: c.originY } };
}

/* AUTOCONTIDA (roda na página) */
async function medirNaPagina(entrada) {
  const G = window.__game, THREE = window.__MP.THREE, scene = window.__MP.scene, S = G.Structures;
  try { await S.castle.ready; } catch (e) { /* fallback também é desenho */ }
  const visivel = o => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
  /* triângulos em coordenadas de mundo cuja projeção XZ toca a região */
  const tris = (raizes, reg) => {
    const out = [];
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const m4 = new THREE.Matrix4(), mi = new THREE.Matrix4();
    for (const raiz of raizes) {
      raiz.updateMatrixWorld(true);
      raiz.traverse(o => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes.position || !visivel(o)) return;
        const pos = o.geometry.attributes.position, idx = o.geometry.index;
        const n = idx ? idx.count : pos.count;
        for (let k = 0; k < (o.isInstancedMesh ? o.count : 1); k++) {
          m4.copy(o.matrixWorld);
          if (o.isInstancedMesh) { o.getMatrixAt(k, mi); m4.multiply(mi); }
          for (let i = 0; i < n; i += 3) {
            for (let j = 0; j < 3; j++) v[j].fromBufferAttribute(pos, idx ? idx.getX(i + j) : i + j).applyMatrix4(m4);
            if (Math.max(v[0].x, v[1].x, v[2].x) < reg.x0 || Math.min(v[0].x, v[1].x, v[2].x) > reg.x1 ||
                Math.max(v[0].z, v[1].z, v[2].z) < reg.z0 || Math.min(v[0].z, v[1].z, v[2].z) > reg.z1) continue;
            out.push(v[0].x, v[0].y, v[0].z, v[1].x, v[1].y, v[1].z, v[2].x, v[2].y, v[2].z);
          }
        }
      });
    }
    return out;
  };
  /* vertical em (x,z): cada face cruzada {y, ny: sinal da normal em y} */
  const vertical = (T, x, z) => {
    const hits = [];
    for (let i = 0; i < T.length; i += 9) {
      const ax = T[i], ay = T[i + 1], az = T[i + 2], bx = T[i + 3], by = T[i + 4], bz = T[i + 5], cx = T[i + 6], cy = T[i + 7], cz = T[i + 8];
      if (x < Math.min(ax, bx, cx) - 1e-6 || x > Math.max(ax, bx, cx) + 1e-6 || z < Math.min(az, bz, cz) - 1e-6 || z > Math.max(az, bz, cz) + 1e-6) continue;
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-9) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
      if (l1 < -1e-7 || l2 < -1e-7 || l3 < -1e-7) continue;
      hits.push({ y: l1 * ay + l2 * by + l3 * cy, ny: Math.sign((bz - az) * (cx - ax) - (bx - ax) * (cz - az)) });
    }
    return hits;
  };
  const terrenoEm = (T, x, z) => { let y = -Infinity; for (const h of vertical(T, x, z)) y = Math.max(y, h.y); return y; };
  /* vão desenhado: 0 se o terreno está dentro de sólido; senão até a 1ª face acima; null = nada acima */
  const vaoEm = (T, ty, x, z) => {
    const hs = vertical(T, x, z).sort((a, c) => a.y - c.y);
    let dentro = 0;
    for (const h of hs) { if (h.y <= ty) dentro += h.ny < 0 ? 1 : -1; else return dentro > 0 ? 0 : h.y - ty; }
    return dentro > 0 ? 0 : null;
  };
  let malha = null;
  scene.traverse(o => { if (o.isMesh && o.name === 'estruturas') malha = o; });
  const terr = G.terrainMesh;
  const res = { malha: !!malha, castelo: null, pecas: [] };
  if (!malha) return res;
  for (const p of entrada.pecas) {
    const b = p.box, m = 0.03, PASSO = 0.25;
    const reg = { x0: b.x0 - 0.5, x1: b.x1 + 0.5, z0: b.z0 - 0.5, z1: b.z1 + 0.5 };
    const TS = tris([malha], reg), TT = tris([terr], reg);
    const nx = Math.max(1, Math.ceil((b.x1 - b.x0 - 2 * m) / PASSO)), nz = Math.max(1, Math.ceil((b.z1 - b.z0 - 2 * m) / PASSO));
    let vao = 0, onde = null, enterrado = 0, n = 0;
    for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) {
      const x = b.x0 + m + (b.x1 - b.x0 - 2 * m) * i / nx, z = b.z0 + m + (b.z1 - b.z0 - 2 * m) * k / nz;
      const v = vaoEm(TS, terrenoEm(TT, x, z), x, z);
      n++;
      if (v === null) { enterrado++; continue; }
      if (v > vao) { vao = v; onde = [+x.toFixed(1), +z.toFixed(1)]; }
    }
    res.pecas.push({ tipo: p.tipo, nome: p.nome, vao, onde, enterrado, n });
  }
  /* castelo: casca do perímetro e o vão sob a rampa. A casca que DEPENDE do
     terreno é a do chão até a base do GLB (−1,10 m do originY: saia da
     fundação); acima dela a casca é o próprio GLB, a mesma em toda semente
     (nos cantos ele é chanfrado e deixa frestas de 0,1–0,2 m rente ao piso —
     medido, e fora do assunto). No portão a medida vai até a soleira. */
  {
    const C = entrada.castelo, FH = 19.18;
    const raizes = [S.castle.modelRoot, S.castle.foundationRoot, S.castle.fallbackRoot].filter(Boolean);
    const reg = { x0: C.cx - 32, x1: C.cx + 32, z0: C.cz - 32, z1: C.cz + 32 };
    const TC = tris(raizes, reg), TT = tris([terr], reg), TF = tris([S.castle.foundationRoot], reg);
    const grade = new Map();
    for (let i = 0; i < TC.length; i += 9) {
      const x0 = Math.floor(Math.min(TC[i], TC[i + 3], TC[i + 6])), x1 = Math.floor(Math.max(TC[i], TC[i + 3], TC[i + 6]));
      const z0 = Math.floor(Math.min(TC[i + 2], TC[i + 5], TC[i + 8])), z1 = Math.floor(Math.max(TC[i + 2], TC[i + 5], TC[i + 8]));
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
        const k = gx * 100003 + gz; let l = grade.get(k); if (!l) grade.set(k, l = []); l.push(i);
      }
    }
    const bate = (o, d, max) => { // Möller–Trumbore, dupla face: bate em algo antes de `max`?
      const vistos = new Set();
      for (let s = 0; s <= max + 1; s += 0.5) {
        const l = grade.get(Math.floor(o.x + d.x * s) * 100003 + Math.floor(o.z + d.z * s)); if (!l) continue;
        for (const i of l) {
          if (vistos.has(i)) continue; vistos.add(i);
          const e1x = TC[i + 3] - TC[i], e1y = TC[i + 4] - TC[i + 1], e1z = TC[i + 5] - TC[i + 2];
          const e2x = TC[i + 6] - TC[i], e2y = TC[i + 7] - TC[i + 1], e2z = TC[i + 8] - TC[i + 2];
          const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x;
          const det = e1x * px + e1y * py + e1z * pz;
          if (Math.abs(det) < 1e-12) continue;
          const inv = 1 / det, tx = o.x - TC[i], ty = o.y - TC[i + 1], tz = o.z - TC[i + 2];
          const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
          const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
          const w = (d.x * qx + d.y * qy + d.z * qz) * inv; if (w < 0 || u + w > 1) continue;
          const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
          if (t > 1e-6 && t < max) return true;
        }
      }
      return false;
    };
    const lados = [
      ['oeste', s => ({ x: C.cx - FH, z: C.cz + s }), { x: 1, y: 0, z: 0 }], ['leste', s => ({ x: C.cx + FH, z: C.cz + s }), { x: -1, y: 0, z: 0 }],
      ['norte', s => ({ x: C.cx + s, z: C.cz - FH }), { x: 0, y: 0, z: 1 }], ['sul', s => ({ x: C.cx + s, z: C.cz + FH }), { x: 0, y: 0, z: -1 }],
    ];
    const casca = { pior: 0, onde: null, pontos: 0, portao: 0 };
    for (const [nome, ponto, d] of lados) for (let s = -FH + 0.5; s <= FH - 0.5; s += 0.25) {
      const p = ponto(s), chao = terrenoEm(TT, p.x, p.z);
      const portao = nome === 'sul' && Math.abs(s) < 2.3;
      const topo = portao ? C.floorY - 0.3 : C.originY - 1.1;
      let aberto = 0, run = 0;
      for (let y = chao + 0.05; y < topo; y += 0.1) {
        if (!bate({ x: p.x - d.x * 0.6, y, z: p.z - d.z * 0.6 }, d, 1.5)) { run += 0.1; aberto = Math.max(aberto, run); } else run = 0;
      }
      casca.pontos++;
      if (portao) casca.portao++;
      if (aberto > casca.pior) { casca.pior = aberto; casca.onde = `${nome} ${s.toFixed(2)} m`; }
    }
    const rampa = { pior: 0, onde: null, n: 0 };
    for (let x = -1.9; x <= 1.9; x += 0.2) for (let z = 19.3; z <= 26.45; z += 0.25) {
      const X = C.cx + x, Z = C.cz + z, v = vaoEm(TF, terrenoEm(TT, X, Z), X, Z);
      rampa.n++;
      if (v !== null && v > rampa.pior) { rampa.pior = v; rampa.onde = `(${x.toFixed(1)}, ${z.toFixed(2)})`; }
    }
    res.castelo = { status: S.castle.status, casca, rampa };
  }
  return res;
}

describe('construções: o DESENHO não mostra vão entre prédio e chão', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  const medidas = [];
  before(async () => {
    for (const [semente, porta] of CASOS) {
      const entrada = await entradaDaSemente(semente);
      const h = await bootGame({ port: porta, worldSeed: semente, autoStart: false });
      try { medidas.push({ semente, entrada, r: await h.play(medirNaPagina, entrada) }); } finally { await h.close(); }
    }
  });

  it('pré-condição: malha `estruturas` achada, castelo carregado e peças de todos os tipos medidas', () => {
    for (const { semente, entrada, r } of medidas) {
      assert.ok(r.malha, `semente ${semente}: a malha mesclada 'estruturas' não está na cena`);
      assert.equal(r.castelo.status, 'ready', `semente ${semente}: castelo em ${r.castelo.status}`);
      assert.equal(r.pecas.length, entrada.pecas.length);
      const tipos = new Set(r.pecas.map(p => p.tipo));
      for (const t of ['torre', 'cabana', 'ruína', 'muro', 'sacos', 'caixote']) assert.ok(tipos.has(t), `semente ${semente}: sem ${t}`);
      assert.ok(r.castelo.casca.pontos > 500 && r.castelo.casca.portao >= 16 && r.castelo.rampa.n > 500,
        `semente ${semente}: amostragem do castelo pequena demais ${JSON.stringify(r.castelo)}`);
    }
  });

  it('torre, cabana, ruína, muro, sacos e caixote: vão desenhado ≤ 2 cm; muro, sacos e caixote nunca somem no chão', () => {
    const pior = {};
    const enterrados = [];
    for (const { semente, r } of medidas) for (const p of r.pecas) {
      if (!pior[p.tipo] || p.vao > pior[p.tipo].vao) pior[p.tipo] = { vao: p.vao, onde: `semente ${semente} ${p.nome} ${JSON.stringify(p.onde)}` };
      if (['muro', 'sacos', 'caixote'].includes(p.tipo) && p.enterrado) enterrados.push(`semente ${semente} ${p.nome}: ${p.enterrado}/${p.n} amostras sob o chão`);
    }
    const laudo = Object.entries(pior).map(([t, v]) => `${t} ${v.vao.toFixed(2)} m (${v.onde})`).join('; ');
    for (const [tipo, v] of Object.entries(pior)) assert.ok(v.vao <= 0.02, `${tipo}: ${v.vao.toFixed(2)} m de vão desenhado — ${laudo}`);
    assert.deepEqual(enterrados.slice(0, 5), [], `${enterrados.length} peças com trecho inteiro sob o chão`);
  });

  it('castelo: a casca fecha do chão até a base do GLB em todo o perímetro e até a soleira no portão; a rampa não flutua', () => {
    for (const { semente, r } of medidas) {
      const c = r.castelo;
      assert.ok(c.casca.pior <= 0.1, `semente ${semente}: buraco de ${c.casca.pior.toFixed(2)} m na casca (${c.casca.onde})`);
      assert.ok(c.rampa.pior <= 0.02, `semente ${semente}: a rampa flutua ${c.rampa.pior.toFixed(2)} m sobre o chão (${c.rampa.onde})`);
    }
  });
});
