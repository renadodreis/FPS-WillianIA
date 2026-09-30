/* ================================================================
   O VULCÃO DESENHADO SEGURA BALA — laudo d381d29, §2c. Lado do jogo.

   • PARIDADE: o sólido (js/vulcao-solido.js, os bytes do GLB lidos sem
     three) é o DESENHO — cada triângulo que o three desenha, vértice a
     vértice, na matriz do mundo dele.
   • BALA: retas sobre o vulcão; âncora = a 1ª superfície DESENHADA
     (Raycaster na malha do vulcão, dos dois lados, e no terreno). Onde a
     1ª coisa desenhada é a rocha do vulcão, o `rayBlockedAt` (o do tiro, da
     vítima e da assistência) tem de parar nela — nem depois (atravessou a
     rocha), nem muito antes.

   Porta 4158.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');

const PORT = 4158;

describe('o vulcão desenhado segura bala', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: PORT });
    await h.page.waitForFunction(() => window.__game && window.__game.Volcano
      && window.__game.Volcano.modelReady && window.__game.Volcano.solido, { timeout: 120000 });
  });
  after(async () => { if (h) await h.close(); });

  it('paridade: cada triângulo desenhado é o do sólido (vértice a vértice)', async t => {
    const r = await h.play(() => {
      const G = window.__game, T = window.__MP.THREE, S = G.Volcano.solido;
      const malhas = [];
      // no QA o render é no-op: ninguém atualizou as matrizes do grupo
      G.Volcano.group.updateWorldMatrix(true, true);
      G.Volcano.group.traverse(o => { if (o.isMesh) malhas.push(o); });
      let n = 0, pior = 0;
      const v = new T.Vector3();
      for (const m of malhas) {
        const pos = m.geometry.attributes.position, idx = m.geometry.index;
        const nt = (idx ? idx.count : pos.count) / 3;
        for (let k = 0; k < nt; k++, n++) {
          for (let c = 0; c < 3; c++) {
            const i = idx ? idx.getX(k * 3 + c) : k * 3 + c;
            v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
            const o = n * 9 + c * 3;
            pior = Math.max(pior, Math.abs(v.x - S.tris[o]), Math.abs(v.y - S.tris[o + 1]), Math.abs(v.z - S.tris[o + 2]));
          }
        }
      }
      return { malhas: malhas.length, desenhados: n, solidos: S.nt, pior };
    });
    t.diagnostic(`${r.malhas} malha(s), ${r.desenhados} triângulos desenhados × ${r.solidos} no sólido; pior vértice ${r.pior.toExponential(2)} m`);
    assert.equal(r.desenhados, r.solidos, 'o sólido não tem os mesmos triângulos do desenho');
    assert.ok(r.pior < 1e-3, `vértice do sólido a ${r.pior} m do desenhado`);
  });

  it('bala: onde a 1ª coisa desenhada é a rocha do vulcão, o rayBlockedAt para nela', async t => {
    const r = await h.play(() => {
      const G = window.__game, MP = window.__MP, T = MP.THREE, V = G.VOLCANO || G.Volcano.VOLCANO;
      const malhas = [];
      G.Volcano.group.updateWorldMatrix(true, true);
      G.terrainMesh.updateWorldMatrix(true, false);
      G.Volcano.group.traverse(o => { if (o.isMesh) malhas.push(o); });
      const lados = malhas.map(m => m.material.side);
      malhas.forEach(m => { m.material.side = T.DoubleSide; });
      const rc = new T.Raycaster(), a = new T.Vector3(), b = new T.Vector3(), d = new T.Vector3();
      let s = 0x5EED;
      const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
      const ponto = (out, h0, h1) => {
        const ang = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * V.r;
        const x = V.x + Math.cos(ang) * rr, z = V.z + Math.sin(ang) * rr;
        return out.set(x, MP.heightAt(x, z) + h0 + rnd() * (h1 - h0), z);
      };
      const out = { retas: 0, rocha: 0, passou: 0, cedo: 0, pior: 0, exemplo: null };
      for (let i = 0; i < 1500; i++) {
        ponto(a, 1.2, 1.7); ponto(b, 0.5, 1.7);
        const len = d.subVectors(b, a).length();
        if (len < 5 || len > 150) continue;
        d.multiplyScalar(1 / len);
        rc.set(a, d); rc.near = 0; rc.far = len;
        const hv = rc.intersectObjects(malhas, false)[0];
        const ht = rc.intersectObject(G.terrainMesh, false)[0];
        out.retas++;
        if (!hv || (ht && ht.distance < hv.distance)) continue;   // a 1ª coisa desenhada não é a rocha
        out.rocha++;
        const tB = MP.rayBlockedAt(a, d, len + 1);
        const erro = tB - hv.distance;
        if (erro > 0.3) {
          out.passou++;
          if (!out.exemplo) out.exemplo = { a: a.toArray().map(v => +v.toFixed(2)), rocha: +hv.distance.toFixed(2), bala: Number.isFinite(tB) ? +tB.toFixed(2) : 'livre' };
        } else if (erro < -1.0) out.cedo++;
        if (Number.isFinite(erro)) out.pior = Math.max(out.pior, Math.abs(erro));
      }
      malhas.forEach((m, k) => { m.material.side = lados[k]; });
      return out;
    });
    t.diagnostic(`${r.retas} retas; a rocha do vulcão é a 1ª desenhada em ${r.rocha}; a bala passou dela em ${r.passou}, ` +
      `parou > 1 m antes em ${r.cedo}${r.exemplo ? '; ex.: ' + JSON.stringify(r.exemplo) : ''}`);
    assert.ok(r.rocha >= 150, `cenário: só ${r.rocha} retas batem primeiro na rocha desenhada`);
    assert.equal(r.passou, 0, `a bala atravessou a rocha desenhada em ${r.passou} de ${r.rocha} retas`);
    assert.equal(r.cedo, 0, `a bala parou mais de 1 m antes da rocha em ${r.cedo} de ${r.rocha} retas`);
  });

  it('boot limpo: sem erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
