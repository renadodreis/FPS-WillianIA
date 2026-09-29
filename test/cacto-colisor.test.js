/* ================================================================
   CACTO E BARRIL — o colisor é o que se VÊ.

   O cacto (saguaro: tronco, capa e dois braços, escala 0,7–1,5) tinha um
   cilindro fixo de 0,35 (bala a 0,31) até 3,4 m do chão: mais largo que o
   tronco fino, sem os braços, e parando bala no AR acima do topo. O barril
   (1,05 m) e a tenda (cumeeira a 1,23 m) tinham o mesmo cilindro até 3,4 m.

   ÂNCORA independente do colisor: a MALHA desenhada — a InstancedMesh dos
   cactos e os barris da cena. Varreduras de retas horizontais paralelas
   (5 cm) de oito lados, do chão até ACIMA do topo; o `Raycaster` dá a
   silhueta desenhada e o `rayBlockedAt` do produto a do que barra a bala.
   Mede-se: desenho sem colisor, colisor sem desenho (inclusive por cima), e
   o erro de largura.

   Porta 4154.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');

const PORT = 4154;
const PASSO = 0.05;

describe('cacto e barril: o colisor é o desenho', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, r;
  before(async () => {
    h = await bootGame({ port: PORT });
    await h.page.waitForFunction(() => window.__game && window.__game.cactiMesh && window.__game.barrisQA.length >= 3, { timeout: 90000 });
    r = await h.play(async passo => {
      const G = window.__game, MP = window.__MP, T = MP.THREE, QA = window.QA;
      const cactos = G.cactiMesh;
      const vizinhos = (x, z, raio) => {
        const out = [];
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          for (const o of G.obstaclesNear(x + i * 16, z + j * 16)) if (Math.hypot(o.x - x, o.z - z) < raio && !out.includes(o)) out.push(o);
        }
        return out;
      };
      const m4 = new T.Matrix4(), pos = new T.Vector3(), q = new T.Quaternion(), esc = new T.Vector3();
      /* alvos: cactos (instância) e barris (objeto), longe de construção e de outro obstáculo */
      const alvos = [];
      for (let i = 0; i < cactos.count && alvos.length < 12; i++) {
        cactos.getMatrixAt(i, m4); m4.decompose(pos, q, esc);
        // nenhum outro obstáculo (pela BORDA dele, não pelo centro) perto das retas
        if (vizinhos(pos.x, pos.z, 12).some(o => (o.sourceId !== 'cactus' || Math.hypot(o.x - pos.x, o.z - pos.z) > 0.01) && Math.hypot(o.x - pos.x, o.z - pos.z) - o.r < 1.3 * esc.y + 4)) continue;
        alvos.push({ tipo: 'cacto', x: pos.x, z: pos.z, raio: 1.3 * esc.y, topo: pos.y + 2.6 * esc.y,
          acerta: (rc) => { const hs = rc.intersectObject(cactos, false).filter(hh => hh.instanceId === i); return hs.length ? hs[0].distance : Infinity; } });
      }
      for (const b of G.barrisQA) {
        const cx = new T.Box3().setFromObject(b);
        alvos.push({ tipo: 'barril', x: b.position.x, z: b.position.z, raio: 0.9, topo: cx.max.y,
          acerta: (rc) => { const hs = rc.intersectObject(b, true); return hs.length ? hs[0].distance : Infinity; } });
      }
      const rc = new T.Raycaster(), o = new T.Vector3(), d = new T.Vector3();
      const res = { alvos: { cacto: 0, barril: 0 }, por: {} };
      /* reta que passa pela borda de OUTRO obstáculo (o barril fica colado no
         mercado) sai da conta: aqui só o alvo pode barrar */
      const outros = a => vizinhos(a.x, a.z, 20).filter(o => Math.hypot(o.x - a.x, o.z - a.z) > 0.01);
      const cruzaOutro = (lista, ax, az, bx, bz) => lista.some(o => {
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, k = Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.z - az) * dz) / L2));
        return Math.hypot(ax + dx * k - o.x, az + dz * k - o.z) < o.r + 0.05;
      });
      for (const a of alvos) {
        res.alvos[a.tipo]++;
        const perto = outros(a);
        const R = (res.por[a.tipo] ||= { varreduras: 0, trechos: 0, semColisor: 0, semDesenho: 0, porCima: 0, larg: [], ex: null });
        QA.reset(a.x + a.raio + 5, a.z + 2); QA.tick(5);
        if (a.tipo === 'cacto') cactos.computeBoundingSphere();   // a esfera da InstancedMesh fica em cache
        const chao = MP.heightAt(a.x, a.z), alcance = a.raio + 3;
        for (let k = 0; k < 8; k++) {
          const ang = k * Math.PI / 4 + 0.17, ux = Math.cos(ang), uz = Math.sin(ang);
          for (let ya = chao + 0.2; ya < a.topo + 0.6; ya += 0.25) {
            const linha = [];
            for (let lat = -a.raio; lat <= a.raio + 1e-9; lat += passo) {
              const ax = a.x - ux * alcance - uz * lat, az = a.z - uz * alcance + ux * lat;
              const bx = a.x + ux * alcance - uz * lat, bz = a.z + uz * alcance + ux * lat;
              o.set(ax, ya, az); d.set(bx - ax, 0, bz - az);
              const len = d.length(); d.multiplyScalar(1 / len);
              let ok = true;
              for (let s = 0; s <= len && ok; s += 0.2) if (ya - MP.heightAt(ax + d.x * s, az + d.z * s) < 0.05) ok = false;
              if (ok && G.Structures.rayHit(o, d, len) < len) ok = false;
              if (ok && cruzaOutro(perto, ax, az, bx, bz)) ok = false;
              if (!ok) { linha.push(null); continue; }
              rc.set(o, d); rc.near = 0; rc.far = len;
              const tM = a.acerta(rc), rb = MP.rayBlockedAt(o, d, len);
              linha.push({ lat, tM, tB: rb < len - 1e-6 ? rb : Infinity });
            }
            R.varreduras++;
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
            R.trechos += tm.length;
            for (const m of tm) {
              const par = tb.find(b => b.l1 >= m.l0 - 1e-9 && b.l0 <= m.l1 + 1e-9 && Math.abs(b.t - m.t) < 0.8);
              if (!par) { if (m.l1 - m.l0 + passo > 0.1 + 1e-9) { R.semColisor++; R.ex ||= { tipo: a.tipo, alt: +(ya - chao).toFixed(2), larg: +(m.l1 - m.l0 + passo).toFixed(2) }; } continue; }
              R.larg.push((m.l1 - m.l0) - (par.l1 - par.l0));
            }
            for (const b of tb) {
              if (tm.some(m => b.l1 >= m.l0 - 1e-9 && b.l0 <= m.l1 + 1e-9 && Math.abs(b.t - m.t) < 0.8)) continue;
              if (b.l1 - b.l0 + passo > 0.1 + 1e-9) { R.semDesenho++; if (ya > a.topo) R.porCima++; }
            }
          }
        }
      }
      return res;
    }, PASSO);
  });
  after(async () => { if (h) await h.close(); });

  const pct = (l, q) => { if (!l.length) return 0; const s = l.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
  for (const tipo of ['cacto', 'barril']) {
    it(`${tipo}: onde o desenho aparece a bala para, e onde não aparece — inclusive por cima — ela passa`, t => {
      const R = r.por[tipo] || { varreduras: 0, trechos: 0, semColisor: 0, semDesenho: 0, porCima: 0, larg: [] };
      const lMais = pct(R.larg, 0.9), lMenos = -pct(R.larg.map(v => -v), 0.9);
      t.diagnostic(`${tipo}: ${r.alvos[tipo]} alvos, ${R.varreduras} varreduras, ${R.trechos} silhuetas; desenho sem colisor ${R.semColisor}, ` +
        `colisor sem desenho ${R.semDesenho} (${R.porCima} acima do topo); largura desenhada − barrada p90 ${lMais.toFixed(3)} m, p10 ${lMenos.toFixed(3)} m` +
        (R.ex ? ` — ex. ${JSON.stringify(R.ex)}` : ''));
      assert.ok(r.alvos[tipo] >= 3 && R.trechos >= 40, `cenário: ${r.alvos[tipo]} alvos, ${R.trechos} silhuetas`);
      assert.ok(R.semColisor <= R.trechos * 0.03, `desenho sem colisor em ${R.semColisor} de ${R.trechos}`);
      assert.ok(R.semDesenho <= R.trechos * 0.03, `colisor sem desenho em ${R.semDesenho} (${R.porCima} acima do topo)`);
      assert.ok(lMais <= 0.15 && lMenos >= -0.15, `largura: p90 ${lMais.toFixed(3)} m, p10 ${lMenos.toFixed(3)} m`);
    });
  }

  it('boot limpo: sem erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
