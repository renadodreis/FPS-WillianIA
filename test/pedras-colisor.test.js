/* ================================================================
   PEDRA — o colisor é a pedra que se VÊ.

   A pedra é um icosaedro deformado (ruído ±28 %, achatado em y), escalado
   (s·scX, s, s·scZ) com scX/scZ entre 0,8 e 1,3, inclinado até ±0,3 rad e
   afundado 0,3·s no chão (game.js / js/obstaculos.js). O colisor era um
   círculo de 0,8·s no centro — a bala parava a 0,72·s, e a pedra desenhada
   vai de ~0,6·s a 1,66·s conforme o eixo: a borda que se vê não segurava
   bala, e o bot via e atirava através dela. No campo aberto, a pedra é A
   cobertura.

   ÂNCORA independente do colisor: a MALHA desenhada (a InstancedMesh das
   pedras). Para cada pedra sólida, varreduras de retas horizontais
   paralelas (5 cm) de oito lados, em alturas do chão até o topo; o
   `Raycaster` dá a silhueta da pedra em cada varredura e o `rayBlockedAt`
   do produto (o do tiro) dá a do que barra a bala. Mede-se trecho a trecho:
   pedra sem colisor, colisor sem pedra, erro do centro e da largura.

   Porta 4153.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');

const PORT = 4153;
const PASSO = 0.05;
const PEDRAS = 16;

describe('pedra: o colisor é a pedra desenhada', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, r;
  before(async () => {
    h = await bootGame({ port: PORT });
    r = await h.play(async (nPedras, passo) => {
      const G = window.__game, MP = window.__MP, T = MP.THREE, QA = window.QA, scene = MP.scene;
      let rochas = null;
      scene.traverse(o => { if (o.isInstancedMesh && o.geometry.type === 'IcosahedronGeometry') rochas = o; });
      const vizinhos = (x, z, raio) => {
        const out = [];
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          for (const o of G.obstaclesNear(x + i * 16, z + j * 16)) if (Math.hypot(o.x - x, o.z - z) < raio && !out.includes(o)) out.push(o);
        }
        return out;
      };
      /* pedras SÓLIDAS (escala y > 1,1), longe de construção e de outro obstáculo */
      const m4 = new T.Matrix4(), pos = new T.Vector3(), q = new T.Quaternion(), esc = new T.Vector3();
      const escolhidas = [];
      for (let i = 0; i < rochas.count && escolhidas.length < nPedras; i++) {
        rochas.getMatrixAt(i, m4); m4.decompose(pos, q, esc);
        if (esc.y <= 1.1) continue;
        const raio = Math.max(esc.x, esc.z) * 1.5;
        if (G.Structures.sites.some(s => Math.hypot(s.x - pos.x, s.z - pos.z) < s.r + 12)) continue;
        if (vizinhos(pos.x, pos.z, raio + 8).some(o => o.sourceId !== 'rock' || Math.hypot(o.x - pos.x, o.z - pos.z) > raio + 1)) continue;
        escolhidas.push({ i, x: pos.x, y: pos.y, z: pos.z, s: esc.y, raio });
      }
      const rc = new T.Raycaster(), o = new T.Vector3(), d = new T.Vector3();
      const res = { pedras: escolhidas.length, varreduras: 0, trechosMalha: 0, semColisor: [], semPedra: [], erroCentro: [], erroLargura: [] };
      for (const p of escolhidas) {
        QA.reset(p.x + p.raio + 6, p.z + 2);
        QA.tick(5);
        rochas.computeBoundingSphere();                    // a esfera da InstancedMesh fica em cache (ver arvores-colisor)
        const chao = MP.heightAt(p.x, p.z), topo = p.y + p.s * 0.95;
        const alcance = p.raio + 3, meia = p.raio + 0.5;
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4 + 0.21, ux = Math.cos(a), uz = Math.sin(a);
          for (let ya = chao + 0.25; ya < topo - 0.1; ya += 0.3) {
            const linha = [];
            for (let lat = -meia; lat <= meia + 1e-9; lat += passo) {
              const ax = p.x - ux * alcance - uz * lat, az = p.z - uz * alcance + ux * lat;
              const bx = p.x + ux * alcance - uz * lat, bz = p.z + uz * alcance + ux * lat;
              o.set(ax, ya, az); d.set(bx - ax, 0, bz - az);
              const len = d.length(); d.multiplyScalar(1 / len);
              let ok = true;
              for (let s = 0; s <= len && ok; s += 0.2) if (ya - MP.heightAt(ax + d.x * s, az + d.z * s) < 0.05) ok = false;
              if (ok && G.Structures.rayHit(o, d, len) < len) ok = false;
              if (!ok) { linha.push(null); continue; }
              rc.set(o, d); rc.near = 0; rc.far = len;
              const hs = rc.intersectObject(rochas, false).filter(hh => hh.instanceId === p.i);
              const tM = hs.length ? hs[0].distance : Infinity;
              const rb = MP.rayBlockedAt(o, d, len);
              linha.push({ lat, tM, tB: rb < len - 1e-6 ? rb : Infinity });
            }
            res.varreduras++;
            const trechos = chave => {
              const out = [];
              let cur = null;
              for (const pt of linha) {
                const tt = pt && pt[chave];
                if (pt && Number.isFinite(tt) && cur && Math.abs(tt - cur.t) < 0.6) { cur.l1 = pt.lat; cur.t = tt; continue; }
                if (cur) out.push(cur);
                cur = pt && Number.isFinite(tt) ? { l0: pt.lat, l1: pt.lat, t: tt } : null;
              }
              if (cur) out.push(cur);
              return out;
            };
            const tm = trechos('tM'), tb = trechos('tB');
            res.trechosMalha += tm.length;
            /* uma faixa de bala pode cobrir mais de uma silhueta (pedra com
               reentrância vira dois trechos na malha): o par não é exclusivo */
            const usados = new Set();
            for (const m of tm) {
              let par = -1;
              for (let i = 0; i < tb.length; i++) {
                if (tb[i].l1 >= m.l0 - 1e-9 && tb[i].l0 <= m.l1 + 1e-9 && Math.abs(tb[i].t - m.t) < 0.8) { par = i; break; }
              }
              const larg = m.l1 - m.l0 + passo;
              if (par < 0) { if (larg > 0.1 + 1e-9) res.semColisor.push({ larg: +larg.toFixed(2), s: +p.s.toFixed(2), alt: +(ya - chao).toFixed(2) }); continue; }
              usados.add(par);
              const b = tb[par];
              res.erroCentro.push(Math.abs((b.l0 + b.l1) / 2 - (m.l0 + m.l1) / 2));
              res.erroLargura.push((m.l1 - m.l0) - (b.l1 - b.l0));   // > 0: a pedra desenhada é mais LARGA que o que barra
            }
            tb.forEach((b, i) => {
              const larg = b.l1 - b.l0 + passo;
              if (!usados.has(i) && larg > 0.1 + 1e-9) res.semPedra.push({ larg: +larg.toFixed(2), s: +p.s.toFixed(2), alt: +(ya - chao).toFixed(2) });
            });
          }
        }
      }
      return res;
    }, PEDRAS, PASSO);
  });
  after(async () => { if (h) await h.close(); });

  const pct = (l, q) => { if (!l.length) return 0; const s = l.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

  it('onde a pedra aparece a bala para, e onde não aparece ela passa (silhueta por fatia)', t => {
    const ec = pct(r.erroCentro, 0.9), elMais = pct(r.erroLargura, 0.9), elMenos = -pct(r.erroLargura.map(v => -v), 0.9);
    t.diagnostic(`${r.pedras} pedras, ${r.varreduras} varreduras, ${r.trechosMalha} silhuetas; pedra sem colisor ${r.semColisor.length}, ` +
      `colisor sem pedra ${r.semPedra.length}; erro p90 do centro ${ec.toFixed(3)} m; largura desenhada − barrada: p90 ${elMais.toFixed(3)} m, p10 ${elMenos.toFixed(3)} m` +
      (r.semColisor[0] ? ` — ex. sem colisor ${JSON.stringify(r.semColisor[0])}` : '') + (r.semPedra[0] ? ` — ex. sem pedra ${JSON.stringify(r.semPedra[0])}` : ''));
    assert.ok(r.pedras >= 8 && r.trechosMalha >= 150, `cenário: ${r.pedras} pedras, ${r.trechosMalha} silhuetas`);
    assert.ok(r.semColisor.length <= r.trechosMalha * 0.03, `pedra desenhada sem colisor em ${r.semColisor.length} de ${r.trechosMalha} silhuetas`);
    assert.ok(r.semPedra.length <= r.trechosMalha * 0.03, `colisor sem pedra desenhada em ${r.semPedra.length} silhuetas`);
    assert.ok(ec <= 0.15, `o colisor está deslocado da pedra: erro p90 do centro ${ec.toFixed(3)} m`);
    assert.ok(elMais <= 0.3, `a pedra desenhada é mais larga que o que barra: p90 ${elMais.toFixed(3)} m`);
    assert.ok(elMenos >= -0.1, `o que barra é mais largo que a pedra desenhada: p10 ${elMenos.toFixed(3)} m`);
  });

  it('boot limpo: sem erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
