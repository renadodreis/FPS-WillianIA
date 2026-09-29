/* ================================================================
   ACABAMENTO DA CIDADE — desenho sólido barra bala.

   Parapeito de telhado, pódio, cornija, batente, marquise, pilastras,
   casa de máquinas, caixa d'água, ar-condicionado, antena, bancos,
   floreira, hidrante, lixeira, postes e o acabamento de fora da Torre
   Nexus eram SÓ desenho (cityTrimMesh / cityProps): a bala e a visada do
   bot atravessavam, e o parapeito de todo telhado pisável não protegia
   ninguém (laudo de 2224bf5, §2c: bot vendo o jogador atrás de floreira e
   lixeira). Agora são dado em js/paredes.js (`acabamentoDaCidade`) e o
   structures.js desenha a partir dele.

   ÂNCORA independente das caixas de bala: a MALHA desenhada. Pontos
   sorteados na superfície do cityTrimMesh (por área, fora do pavimento —
   nada abaixo do topo do meio-fio) e na haste dos postes; de uma origem a
   6–20 m, a reta até o ponto é lançada no `Raycaster` do three contra tudo
   o que a cidade desenha. Quando a primeira coisa na reta é acabamento, o
   `rayBlockedAt` do produto (o do tiro) tem de parar ali (±15 cm). E o
   avesso: a reta deslocada 0,3 m para fora da superfície, que não cruza
   desenho nenhum, não pode parar no ar.

   Porta 4152.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');

const PORT = 4152;
const TOL = 0.15;
const N = 700;

describe('acabamento da cidade: o que se desenha sólido segura a bala', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, r;
  before(async () => {
    h = await bootGame({ port: PORT });
    r = await h.play((n, tol) => {
      const G = window.__game, MP = window.__MP, T = MP.THREE, scene = MP.scene;
      const trim = scene.getObjectByName('cityTrimMesh'), props = scene.getObjectByName('cityProps');
      // tudo o que a cidade desenha e segura bala — inclusive os carros parados nela
      const desenho = ['cityMesh', 'cityTrimMesh', 'cityProps', 'cityInteriorMesh'].map(nm => scene.getObjectByName(nm)).filter(Boolean)
        .concat((G.Car && G.Car.vehicles || []).map(v => v.group), G.Heli && G.Heli.group ? [G.Heli.group] : []);
      const interior = scene.getObjectByName('cityInteriorMesh');
      const eAcab = (o, pt) => {
        for (let p = o; p; p = p.parent) if (p === trim || p === props) return true;
        return o === interior && pt.y > TOPO_TORRE + 0.2 && cobertura(pt) && !vazado(pt);   // parapeito e caixote do heliponto
      };
      // LCG própria: o sorteio do teste não mexe no do jogo
      let seed = 20260929;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

      /* o chão da CIDADE: o fundo do pavimento desenhado (o disco da praça,
         gy − 0,02). O platô guarda um pouco do relevo, então o `heightAt`
         fica abaixo do asfalto — medir "acima do relevo" contava calçada e
         meio-fio como acabamento */
      const pos = trim.geometry.attributes.position, idx = trim.geometry.index;
      let chaoCidade = Infinity;
      for (let i = 0; i < pos.count; i++) chaoCidade = Math.min(chaoCidade, pos.getY(i));
      const PAVIMENTO = chaoCidade + 0.32;              // topo do meio-fio: gy + 0,24
      /* triângulos do acabamento, por área, fora do pavimento */
      const nTri = (idx ? idx.count : pos.count) / 3;
      const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), nrm = new T.Vector3();
      const tris = [];
      let area = 0;
      for (let t = 0; t < nTri; t++) {
        const i0 = idx ? idx.getX(3 * t) : 3 * t, i1 = idx ? idx.getX(3 * t + 1) : 3 * t + 1, i2 = idx ? idx.getX(3 * t + 2) : 3 * t + 2;
        a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
        const cy = (a.y + b.y + c.y) / 3;
        if (cy < PAVIMENTO) continue;                                       // pavimento, meio-fio
        const ar = nrm.subVectors(b, a).cross(c.clone().sub(a)).length() / 2;
        if (ar < 1e-4) continue;
        area += ar; tris.push({ i0, i1, i2, acc: area });
      }
      const pontoNoAcab = () => {
        const alvo = rnd() * area;
        let lo = 0, hi = tris.length - 1;
        while (lo < hi) { const m = (lo + hi) >> 1; if (tris[m].acc < alvo) lo = m + 1; else hi = m; }
        const t = tris[lo];
        a.fromBufferAttribute(pos, t.i0); b.fromBufferAttribute(pos, t.i1); c.fromBufferAttribute(pos, t.i2);
        let u = rnd(), v = rnd();
        if (u + v > 1) { u = 1 - u; v = 1 - v; }
        const p = a.clone().addScaledVector(b.clone().sub(a), u).addScaledVector(c.clone().sub(a), v);
        const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        return { p, n };
      };
      /* o TOPO da Torre (malha do interior): faces VERTICAIS desenhadas de
         0,2 a 0,72 m acima do heliponto — parapeitos e o caixote da bazuca.
         O disco e o "H" (bordas de 6–10 cm) são piso, e o guarda-corpo do
         poço é vazado de propósito (`noBullet`): ficam de fora. */
      const ipos = interior.geometry.attributes.position, iidx = interior.geometry.index;
      const TOPO_TORRE = G.Structures.towerTopY;
      /* só o que é COBERTURA no heliponto: a faixa da borda (parapeitos) e o
         caixote da bazuca — o corrimão da escada que chega ali é vazado */
      const sitio = G.Structures.sites.find(st => st.type === 'cidade');
      const cobertura = pt => {
        const dx = pt.x - sitio.x, dz = pt.z - sitio.z;
        return Math.max(Math.abs(dx), Math.abs(dz)) > 9 - 0.5 || (Math.abs(dx - 6.5) < 0.7 && Math.abs(dz - 6.5) < 0.45);
      };
      const vazado = pt => G.Structures.walls.some(w => w.noBullet && pt.x > w.x0 - 0.05 && pt.x < w.x1 + 0.05 &&
        pt.y > w.y0 - 0.05 && pt.y < w.y1 + 0.05 && pt.z > w.z0 - 0.05 && pt.z < w.z1 + 0.05);
      const trisTopo = [];
      for (let t = 0; t < (iidx ? iidx.count : ipos.count) / 3; t++) {
        const i0 = iidx ? iidx.getX(3 * t) : 3 * t, i1 = iidx ? iidx.getX(3 * t + 1) : 3 * t + 1, i2 = iidx ? iidx.getX(3 * t + 2) : 3 * t + 2;
        a.fromBufferAttribute(ipos, i0); b.fromBufferAttribute(ipos, i1); c.fromBufferAttribute(ipos, i2);
        const my = (a.y + b.y + c.y) / 3;
        if (my < TOPO_TORRE + 0.2 || my > TOPO_TORRE + 0.72) continue;   // disco e "H" são piso
        const ct = { x: (a.x + b.x + c.x) / 3, y: my, z: (a.z + b.z + c.z) / 3 };
        if (!cobertura(ct) || vazado(ct)) continue;
        if (Math.abs(nrm.subVectors(b, a).cross(c.clone().sub(a)).normalize().y) > 0.5) continue;
        trisTopo.push([i0, i1, i2]);
      }
      const pontoNoTopo = () => {
        const [i0, i1, i2] = trisTopo[Math.floor(rnd() * trisTopo.length)];
        a.fromBufferAttribute(ipos, i0); b.fromBufferAttribute(ipos, i1); c.fromBufferAttribute(ipos, i2);
        let u = rnd(), v = rnd();
        if (u + v > 1) { u = 1 - u; v = 1 - v; }
        return { p: a.clone().addScaledVector(b.clone().sub(a), u).addScaledVector(c.clone().sub(a), v),
          n: b.clone().sub(a).cross(c.clone().sub(a)).normalize() };
      };
      /* postes: pontos na haste (instâncias do cityProps) */
      const hastes = props.children.find(o => o.isInstancedMesh && o.geometry.type === 'CylinderGeometry');
      const mi = new T.Matrix4(), mp = new T.Vector3();
      const pontoNoPoste = () => {
        hastes.getMatrixAt(Math.floor(rnd() * hastes.count), mi);
        mp.setFromMatrixPosition(mi);
        const ang = rnd() * Math.PI * 2;
        return { p: new T.Vector3(mp.x, mp.y - 1.5 + rnd() * 3, mp.z), n: new T.Vector3(Math.cos(ang), 0, Math.sin(ang)) };
      };

      const rc = new T.Raycaster();
      const dentroDeParede = p => G.Structures.walls.some(w => !w.noCollide && p.x > w.x0 && p.x < w.x1 && p.y > w.y0 && p.y < w.y1 && p.z > w.z0 && p.z < w.z1);
      const out = { retas: 0, noAcab: 0, atravessou: [], noAr: 0, retasAr: 0, exAr: null, noArJusto: 0, retasArJusto: 0, exArJusto: null,
        rua: 0, alto: 0, topo: 0, trisTopo: trisTopo.length };
      for (let k = 0; k < n; k++) {
        const { p, n: nn } = (k % 7 === 6) ? pontoNoPoste() : (k % 7 >= 4) ? pontoNoTopo() : pontoNoAcab();
        // origem do lado de FORA da face, a 6–20 m, subindo ou descendo até 30°
        const yaw = Math.atan2(nn.z, nn.x) + (rnd() - 0.5) * 1.6, el = (rnd() - 0.5) * 1.0;
        const d = new T.Vector3(Math.cos(yaw) * Math.cos(el), Math.sin(el), Math.sin(yaw) * Math.cos(el));
        if (d.dot(nn) < 0.15 && Math.abs(nn.y) < 0.9) d.addScaledVector(nn, 0.5).normalize();
        const dist = 6 + rnd() * 14;
        const o = p.clone().addScaledVector(d, dist);
        if (o.y - MP.heightAt(o.x, o.z) < 0.3 || dentroDeParede(o)) continue;
        const dir = p.clone().sub(o), len = dir.length();
        dir.multiplyScalar(1 / len);
        rc.set(o, dir); rc.near = 0; rc.far = len + 1;
        const hits = rc.intersectObjects(desenho, true);
        if (!hits.length) continue;
        out.retas++;
        const h0 = hits[0];
        if (!eAcab(h0.object, h0.point) || h0.point.y < PAVIMENTO) continue;
        out.noAcab++;
        if (h0.object === interior) out.topo++;
        if (h0.point.y - chaoCidade > 4) out.alto++; else out.rua++;
        const tB = MP.rayBlockedAt(o, dir, len + 1);
        if (!(Math.abs(tB - h0.distance) <= tol))
          out.atravessou.push({ tMalha: +h0.distance.toFixed(2), tBala: Number.isFinite(tB) ? +tB.toFixed(2) : null, ponto: h0.point.toArray().map(q => +q.toFixed(2)) });
        /* o avesso: a mesma reta 0,3 m para fora da superfície atingida */
        const nf = h0.face ? h0.face.normal.clone().transformDirection(h0.object.matrixWorld) : nn.clone();
        {
          const o2 = o.clone().addScaledVector(nf, 0.3), p2 = h0.point.clone().addScaledVector(nf, 0.3);
          const d2 = p2.clone().sub(o2), len2 = d2.length();
          d2.multiplyScalar(1 / len2);
          rc.set(o2, d2); rc.far = len2;
          if (!rc.intersectObjects(desenho, true).length && !dentroDeParede(o2)) {
            out.retasAr++;
            const tB2 = MP.rayBlockedAt(o2, d2, len2);
            if (tB2 < len2 - 0.05) { out.noAr++; out.exAr ||= { o: o2.toArray().map(q => +q.toFixed(2)), p: p2.toArray().map(q => +q.toFixed(2)), tB: +tB2.toFixed(2) }; }
          }
        }
        /* e RENTE: segmento de 1,2 m paralelo à superfície, 2 cm fora dela. Sem
           desenho nele, a caixa de bala não pode sobrar do desenho ali (o
           quadrado no poste sobrava 2–4 cm na diagonal da haste) */
        {
          const u = new T.Vector3().crossVectors(nf, Math.abs(nf.y) < 0.9 ? new T.Vector3(0, 1, 0) : new T.Vector3(1, 0, 0)).normalize();
          const c2 = h0.point.clone().addScaledVector(nf, 0.02), a2 = c2.clone().addScaledVector(u, -0.6);
          rc.set(a2, u); rc.far = 1.2;
          if (!rc.intersectObjects(desenho, true).length && !dentroDeParede(a2) && a2.y > PAVIMENTO) {
            out.retasArJusto++;
            const tB3 = MP.rayBlockedAt(a2, u, 1.2);
            if (tB3 < 1.2) { out.noArJusto++; out.exArJusto ||= { a: a2.toArray().map(q => +q.toFixed(3)), u: u.toArray().map(q => +q.toFixed(3)), tB: +tB3.toFixed(3) }; }
          }
        }
      }
      return out;
    }, N, TOL);
  });
  after(async () => { if (h) await h.close(); });

  it('reta que bate no acabamento desenhado: a bala para nele (±15 cm)', t => {
    t.diagnostic(`${r.retas} retas, ${r.noAcab} com o acabamento na frente (${r.rua} até 4 m do chão, ${r.alto} no alto, ${r.topo} no topo da Torre); ` +
      `a bala atravessou ${r.atravessou.length}` + (r.atravessou[0] ? ` — ex.: ${JSON.stringify(r.atravessou[0])}` : ''));
    assert.ok(r.noAcab >= 200 && r.rua >= 60 && r.alto >= 60 && r.topo >= 15,
      `cenário não exercita o acabamento: ${r.noAcab} (${r.rua} na rua, ${r.alto} no alto, ${r.topo} no topo da Torre)`);
    assert.ok(r.atravessou.length <= r.noAcab * 0.03, `a bala atravessou o acabamento em ${r.atravessou.length} de ${r.noAcab} retas`);
  });

  it('reta 0,3 m ao lado do acabamento, sem desenho nenhum: a bala passa', t => {
    t.diagnostic(`${r.retasAr} retas sem desenho; a bala parou no ar em ${r.noAr}` + (r.exAr ? ` — ex.: ${JSON.stringify(r.exAr)}` : ''));
    assert.ok(r.retasAr >= 100, `cenário: só ${r.retasAr} retas livres ao lado`);
    assert.ok(r.noAr <= r.retasAr * 0.03, `a bala parou no ar em ${r.noAr} de ${r.retasAr} retas`);
  });

  it('reta 2 cm ao lado do acabamento, rente e sem desenho: a caixa de bala não sobra do desenho', t => {
    t.diagnostic(`${r.retasArJusto} retas rentes; a bala parou no ar em ${r.noArJusto}` + (r.exArJusto ? ` — ex.: ${JSON.stringify(r.exArJusto)}` : ''));
    assert.ok(r.retasArJusto >= 100, `cenário: só ${r.retasArJusto} retas rentes livres`);
    assert.ok(r.noArJusto <= r.retasArJusto * 0.03, `a bala parou no ar, rente ao desenho, em ${r.noArJusto} de ${r.retasArJusto} retas`);
  });

  it('boot limpo: sem erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
