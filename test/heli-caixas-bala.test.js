/* ================================================================
   AS CAIXAS DE BALA DO HELICÓPTERO SÃO O DESENHO — laudo 1ae1a81, §A.3.

   O helicóptero inteiro segura bala pelas caixas de js/veiculo-vida.js
   (`TIPOS.heli.caixas`): na tela, no servidor, na visada do bot e no
   empurrão do corpo. Medido em r16: a caixa da cauda deixava 40 cm do
   leme e 10 cm do comprimento sem bala, e mastro, esquis e suportes não
   tinham caixa — 0,41 m² por vista de desenho que a bala atravessava
   (6,5 × o do buggy calibrado). "Desenho sólido tem de barrar bala"; e
   "caixa MAIOR que o desenho é bala parando no ar".

   Âncora: a SUPERFÍCIE desenhada (triângulos das malhas do grupo, amostrados
   de 2 em 2 cm), no referencial do grupo — não vértices: o cilindro de um
   segmento só tem vértice nas pontas. Fora, por decisão escrita: as pás do
   rotor e o rotor de cauda (giram; "o rotor não segura bala").

   As duas pontas, com a régua que o repo aplica aos carros (±8 cm):
   (a) todo ponto do desenho sólido está numa caixa (≤ 2 cm);
   (b) nenhuma face de caixa passa mais de 8 cm do desenho que ela contém.

   Porta 4172.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');

const PORT = 4172;

describe('as caixas de bala do helicóptero × o desenho', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, m;
  before(async () => {
    h = await bootGame({ port: PORT });
    m = await h.play(() => {
      const G = window.__game, THREE = window.__MP.THREE, grupo = G.Heli.group;
      const caixas = G.Veiculos.TIPOS.heli.caixas;
      grupo.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(grupo.matrixWorld).invert();
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
      const pontos = [];   // [x, y, z, peça]
      let peca = 0;
      const pecas = [];
      for (const o of grupo.children) {
        if (!o.isMesh) continue;   // o rotor é um Group: as pás giram
        const g = o.geometry, prm = g.parameters || {};
        if (prm.width === 0.08 && prm.height === 1.1) continue;   // rotor de cauda (gira)
        const pos = g.attributes.position, idx = g.index;
        const n = idx ? idx.count : pos.count;
        const M = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
        const vert = (i, v) => v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(M);
        for (let t = 0; t < n; t += 3) {
          vert(t, a); vert(t + 1, b); vert(t + 2, c);
          const k = Math.max(1, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / 0.02));
          for (let i = 0; i <= k; i++) for (let j = 0; j <= k - i; j++) {
            p.set(0, 0, 0).addScaledVector(a, i / k).addScaledVector(b, j / k).addScaledVector(c, (k - i - j) / k);
            pontos.push([p.x, p.y, p.z, peca]);
          }
        }
        pecas.push(`${g.type.replace('Geometry', '')}@${o.position.x.toFixed(2)},${o.position.y.toFixed(2)},${o.position.z.toFixed(2)}`);
        peca++;
      }
      const dist = (q, cx) => {
        let s = 0;
        for (let e = 0; e < 3; e++) { const d = Math.max(cx.min[e] - q[e], 0, q[e] - cx.max[e]); s += d * d; }
        return Math.sqrt(s);
      };
      /* (a) fora de toda caixa */
      const fora = new Map();
      for (const q of pontos) {
        let d = Infinity;
        for (const cx of caixas) d = Math.min(d, dist(q, cx));
        if (d > 0.02) {
          const f = fora.get(q[3]) || { n: 0, max: 0 };
          f.n++; f.max = Math.max(f.max, d); fora.set(q[3], f);
        }
      }
      /* (b) cada caixa × o desenho que ela contém */
      const sobras = caixas.map(cx => {
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        let n = 0;
        for (const q of pontos) {
          if (dist(q, cx) > 0.02) continue;
          n++;
          for (let e = 0; e < 3; e++) { lo[e] = Math.min(lo[e], q[e]); hi[e] = Math.max(hi[e], q[e]); }
        }
        return { cx, n, sobra: n ? Math.max(...[0, 1, 2].flatMap(e => [lo[e] - cx.min[e], cx.max[e] - hi[e]])) : Infinity };
      });
      return { total: pontos.length, pecas, fora: [...fora].map(([k, f]) => ({ peca: pecas[k], ...f })), sobras };
    });
  });
  after(async () => { if (h) await h.close(); });

  it('(a) todo ponto do desenho sólido está numa caixa de bala', t => {
    t.diagnostic(`${m.total} pontos de superfície em ${m.pecas.length} peças; fora: ${m.fora.map(f => `${f.peca} ${f.n} (até ${(f.max * 100).toFixed(0)} cm)`).join(' · ') || 'nenhum'}`);
    assert.ok(m.total > 20000 && m.pecas.length >= 10, `cenário: ${m.total} pontos, ${m.pecas.length} peças`);
    assert.deepEqual(m.fora.map(f => `${f.peca}: ${f.n} pontos fora, até ${(f.max * 100).toFixed(1)} cm`), []);
  });

  it('(b) nenhuma caixa passa mais de 8 cm do desenho que ela contém (a régua dos carros)', t => {
    t.diagnostic(m.sobras.map(s => `[${s.cx.min.join(',')}]–[${s.cx.max.join(',')}]: ${s.n} pontos, sobra ${(s.sobra * 100).toFixed(1)} cm`).join(' · '));
    const ruins = m.sobras.filter(s => !(s.sobra <= 0.08));
    assert.deepEqual(ruins.map(s => `caixa [${s.cx.min.join(',')}]–[${s.cx.max.join(',')}]: sobra ${(s.sobra * 100).toFixed(1)} cm (${s.n} pontos dentro)`), []);
  });
});
