/* ================================================================
   A BALA E A CRISTA DO RELEVO — laudo a9a4ffd, §4.3.

   O `rayBlockedAt` (game.js) achava o chão marchando de 1,6 em 1,6 m: a
   reta que raspa uma crista desenhada passava entre duas amostras. É a
   família "a tela tampa e a bala passa" — e, desde que a vítima aceita o
   dano pela cabeça, era dano entrando em quem a tela do atirador não
   mostrava (28 dos 53 pares do laudo). Também: um segmento mais curto que
   o passo (a balística anda um segmento por quadro) nem olhava o chão.

   ÂNCORA independente: os TRIÂNGULOS DESENHADOS — o índice e as posições
   do `terrainMesh`, Möller–Trumbore em dupla precisão. Por par atirador →
   alvo longe de construção, obstáculo e vulcão, acha-se (marcha fina de
   2 cm, ferramenta de BUSCA, não régua) a altura do alvo em que a reta passa
   a raspar a crista, e medem-se duas retas: 4 cm abaixo (a malha barra) e
   4 cm acima (a malha não barra). O produto tem de barrar a primeira onde
   a malha barra (±2 cm) e não parar a segunda.

   Porta 4161.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');

const PORT = 4161;

describe('a bala e a crista do relevo', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, r;
  before(async () => {
    h = await bootGame({ port: PORT });
    r = await h.play(() => {
      const G = window.__game, MP = window.__MP, T = MP.THREE;
      const malha = G.terrainMesh;
      malha.updateWorldMatrix(true, false);
      /* os triângulos DESENHADOS, em mundo, separados por célula de grade */
      const pos = malha.geometry.attributes.position, idx = malha.geometry.index;
      const P = new Float64Array(pos.count * 3), v = new T.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(malha.matrixWorld);
        P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
      }
      let minX = Infinity, maxX = -Infinity;
      for (let i = 0; i < pos.count; i++) { minX = Math.min(minX, P[i * 3]); maxX = Math.max(maxX, P[i * 3]); }
      const n = Math.round(Math.sqrt(pos.count)), cel = (maxX - minX) / (n - 1);
      const balde = new Map(), chave = (i, j) => i * 100000 + j;
      for (let f = 0; f < idx.count; f += 3) {
        const a = idx.getX(f), b = idx.getX(f + 1), c = idx.getX(f + 2);
        const cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3, cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
        const k = chave(Math.floor((cx - minX) / cel), Math.floor((cz - minX) / cel));
        let l = balde.get(k); if (!l) balde.set(k, l = []);
        l.push(a, b, c);
      }
      /* 1ª interseção da reta (o, d unitário) com a malha até `len` (os dois lados) */
      const malhaNaReta = (o, d, len) => {
        const vistos = new Set();
        let melhor = Infinity;
        for (let s = 0; s <= len + cel; s += cel / 3) {
          const ss = Math.min(s, len);
          const ci = Math.floor((o.x + d.x * ss - minX) / cel), cj = Math.floor((o.z + d.z * ss - minX) / cel);
          for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
            const k = chave(ci + di, cj + dj);
            if (vistos.has(k)) continue;
            vistos.add(k);
            const l = balde.get(k);
            if (!l) continue;
            for (let q = 0; q < l.length; q += 3) {
              const a = l[q] * 3, b = l[q + 1] * 3, c = l[q + 2] * 3;
              const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
              const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
              const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x;
              const det = e1x * px + e1y * py + e1z * pz;
              if (Math.abs(det) < 1e-12) continue;
              const inv = 1 / det;
              const tx = o.x - P[a], ty = o.y - P[a + 1], tz = o.z - P[a + 2];
              const u = (tx * px + ty * py + tz * pz) * inv;
              if (u < 0 || u > 1) continue;
              const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
              const w = (d.x * qx + d.y * qy + d.z * qz) * inv;
              if (w < 0 || u + w > 1) continue;
              const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
              if (t >= 0 && t <= len && t < melhor) melhor = t;
            }
          }
        }
        return melhor;
      };
      /* o par só vale longe do que não é relevo: construção, obstáculo, vulcão, borda */
      const V = { x: 420, z: -420, r: 114 };   // js/terrain.js VOLCANO (a rocha desenhada vai além do relevo)
      const livre = (ax, az, bx, bz) => {
        const L = Math.hypot(bx - ax, bz - az);
        for (let s = 0; s <= L; s += 4) {
          const x = ax + (bx - ax) * s / L, z = az + (bz - az) * s / L;
          if (G.Structures.sites.some(st => Math.hypot(st.x - x, st.z - z) < (st.r || 20) + 15)) return false;
          if (V && Math.hypot(V.x - x, V.z - z) < V.r * 1.4) return false;
          if (Math.abs(x) > maxX - 30 || Math.abs(z) > maxX - 30) return false;
          for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
            for (const ob of G.obstaclesNear(x + i * 16, z + j * 16)) {
              // distância do obstáculo ao segmento (xz)
              const ux = bx - ax, uz = bz - az;
              const k = Math.max(0, Math.min(1, ((ob.x - ax) * ux + (ob.z - az) * uz) / (L * L)));
              if (Math.hypot(ob.x - (ax + ux * k), ob.z - (az + uz * k)) < (ob.r || 1) * 2 + 2) return false;
            }
        }
        return true;
      };
      let semente = 7;
      const aleat = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
      const o = new T.Vector3(), d = new T.Vector3(), alvo = new T.Vector3();
      const out = { pares: 0, tentativas: 0, abaixo: { passa: 0, longe: 0, ex: null }, acima: { para: 0, malha: 0, ex: null },
        curto: { n: 0, passa: 0, ex: null }, enterrada: { sai: 0, saiBarrou: 0, entra: 0, entraPassou: 0 } };
      while (out.pares < 160 && out.tentativas < 20000) {
        out.tentativas++;
        const ox = (aleat() * 2 - 1) * (maxX - 60), oz = (aleat() * 2 - 1) * (maxX - 60);
        const ang = aleat() * Math.PI * 2, L = 25 + aleat() * 125;
        const bx = ox + Math.cos(ang) * L, bz = oz + Math.sin(ang) * L;
        const oy = G.heightAt(ox, oz) + 1.6;
        /* a crista: maior inclinação (h − oy)/s ao longo do caminho (busca: 25 cm,
           depois 0,5 mm em volta; o máximo mora num vértice do caminho) */
        const inclina = s => (G.heightAt(ox + (bx - ox) * s / L, oz + (bz - oz) * s / L) - oy) / s;
        let maxInc = -Infinity, sCrista = 0;
        for (let s = 0.5; s < L - 0.5; s += 0.25) { const inc = inclina(s); if (inc > maxInc) { maxInc = inc; sCrista = s; } }
        if (sCrista < Math.max(3, 0.1 * L) || sCrista > L - 3) continue;   // crista no meio, não nas pontas
        for (let s = sCrista - 0.3, fim = sCrista + 0.3; s <= fim; s += 0.0005) { const inc = inclina(s); if (inc > maxInc) maxInc = inc; }
        const hStar = oy + maxInc * L;
        if (hStar < G.heightAt(bx, bz) + 0.3) continue;                  // quem barra é a crista, não o pé do alvo
        if (hStar - oy > 0.35 * L || oy - hStar > 0.35 * L) continue;    // reta de tiro, não de morteiro
        if (!livre(ox, oz, bx, bz)) continue;
        o.set(ox, oy, oz);
        // paredes na reta: fora
        alvo.set(bx, hStar, bz); d.subVectors(alvo, o); const len0 = d.length(); d.multiplyScalar(1 / len0);
        if (G.Structures.rayHit(o, d, len0) < Infinity) continue;
        out.pares++;
        for (const [lado, dh] of [['abaixo', -0.04], ['acima', 0.04]]) {
          alvo.set(bx, hStar + dh, bz); d.subVectors(alvo, o); const len = d.length(); d.multiplyScalar(1 / len);
          const tm = malhaNaReta(o, d, len), tp = MP.rayBlockedAt(o, d, len);
          if (lado === 'abaixo') {
            if (!(tm < len)) continue;   // não há crista na malha (não deve acontecer)
            if (!(tp < len - 0.15)) { out.abaixo.passa++; if (!out.abaixo.ex) out.abaixo.ex = { o: [ox, oy, oz].map(x => +x.toFixed(2)), alvo: [bx, hStar + dh, bz].map(x => +x.toFixed(2)), crista: +tm.toFixed(2) }; }
            else if (Math.abs(tp - tm) > 0.02) { out.abaixo.longe++; if (!out.abaixo.ex) out.abaixo.ex = { malha: +tm.toFixed(3), produto: +tp.toFixed(3) }; }
          } else {
            if (tm < len) out.acima.malha++;
            if (tp < len - 0.15) { out.acima.para++; if (!out.acima.ex) out.acima.ex = { produto: +tp.toFixed(3), len: +len.toFixed(2) }; }
          }
        }
        /* segmento CURTO (um quadro da balística) que entra no chão */
        if (out.curto.n < 60) {
          const gy = G.heightAt(ox, oz);
          o.set(ox, gy + 0.3, oz);
          d.set(Math.cos(ang), -1.2, Math.sin(ang)).normalize();
          const tm = malhaNaReta(o, d, 1.2);
          if (tm < 1.0) {
            out.curto.n++;
            const tp = MP.rayBlockedAt(o, d, 1.2);
            if (!(Math.abs(tp - tm) <= 0.02)) { out.curto.passa++; if (!out.curto.ex) out.curto.ex = { malha: +tm.toFixed(3), produto: tp }; }
          }
          /* origem 5 cm ENTERRADA (a granada no chão): subindo a 45° sai e não
             barra; reto morro acima, onde o chão sobe mais que 10 %, barra */
          o.set(ox, gy - 0.05, oz);
          d.set(Math.cos(ang), 1, Math.sin(ang)).normalize();
          out.enterrada.sai++;
          if (MP.rayBlockedAt(o, d, 12) < 12 - 0.15) out.enterrada.saiBarrou++;
          const gx = G.heightAt(ox + 1, oz) - G.heightAt(ox - 1, oz), gz = G.heightAt(ox, oz + 1) - G.heightAt(ox, oz - 1);
          const gl = Math.hypot(gx, gz) / 2;
          if (gl > 0.1) {
            d.set(gx, 0, gz).normalize();
            out.enterrada.entra++;
            if (!(MP.rayBlockedAt(o, d, 4) < 1.0)) out.enterrada.entraPassou++;
          }
        }
      }
      return out;
    });
  });
  after(async () => { if (h) await h.close(); });

  it('a reta que raspa a crista por baixo para nela, onde a malha desenhada para', t => {
    t.diagnostic(`${r.pares} pares em ${r.tentativas} tentativas; abaixo da crista: ${r.abaixo.passa} passaram, ${r.abaixo.longe} pararam a mais de 2 cm da malha${r.abaixo.ex ? ' — ex.: ' + JSON.stringify(r.abaixo.ex) : ''}`);
    assert.ok(r.pares >= 120, `cenário: só ${r.pares} pares`);
    assert.equal(r.abaixo.passa, 0, `a bala passou por baixo da crista desenhada em ${r.abaixo.passa} de ${r.pares}`);
    assert.equal(r.abaixo.longe, 0, `parou a mais de 2 cm da malha em ${r.abaixo.longe} de ${r.pares}`);
  });

  it('a reta que passa 4 cm por cima da crista não para no ar', t => {
    t.diagnostic(`acima da crista: malha barrou ${r.acima.malha}, produto parou ${r.acima.para}${r.acima.ex ? ' — ex.: ' + JSON.stringify(r.acima.ex) : ''}`);
    assert.equal(r.acima.malha, 0, `âncora: a malha barrou ${r.acima.malha} retas que deviam passar`);
    assert.equal(r.acima.para, 0, `a bala parou no ar por cima da crista em ${r.acima.para} de ${r.pares}`);
  });

  it('um segmento mais curto que o passo antigo também olha o chão', t => {
    t.diagnostic(`${r.curto.n} segmentos de 1,2 m entrando no chão; ${r.curto.passa} sem parar na malha${r.curto.ex ? ' — ex.: ' + JSON.stringify(r.curto.ex) : ''}`);
    assert.ok(r.curto.n >= 40, `cenário: ${r.curto.n} segmentos`);
    assert.equal(r.curto.passa, 0);
  });

  it('origem enterrada 5 cm (granada no chão): sai sem barrar; morro adentro, barra', t => {
    const e = r.enterrada;
    t.diagnostic(`saindo: ${e.saiBarrou} de ${e.sai} barradas; morro adentro: ${e.entraPassou} de ${e.entra} passaram`);
    assert.ok(e.sai >= 40 && e.entra >= 10, `cenário: ${e.sai} saindo, ${e.entra} entrando`);
    assert.equal(e.saiBarrou, 0);
    assert.equal(e.entraPassou, 0);
  });

  it('boot limpo: sem erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
