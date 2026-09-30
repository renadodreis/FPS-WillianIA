/* ================================================================
   O VULCÃO DESENHADO COMO SÓLIDO — lado Node, sem porta.

   Laudo d381d29, §2c: 69 de 97 pares aleatórios de "a tela tampa e a bala
   passa" eram o vulcão. O relevo (js/terrain.js) é uma grade 56 × 56 de 8
   bits do modelo; a rocha desenhada passa dele em quase metade da
   superfície, e a calota de lava cobre o poço da cratera.

   Âncoras: FORÇA BRUTA sobre todos os triângulos do GLB (sem a grade nem a
   travessia de células do produto), e o relevo do bot.
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const Bots = require('../scripts/bots.js');

const SEED = 424242;

describe('o vulcão desenhado como sólido', () => {
  let V, m, terrain;
  const rng = (s => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296))(0xB0CA);
  before(async () => {
    V = await import(url.pathToFileURL(path.join(__dirname, '..', 'js', 'vulcao-solido.js')).href);
    terrain = await Bots.createBotTerrain(SEED);
    m = V.montarVulcao(fs.readFileSync(path.join(__dirname, '..', V.VULCAO_GLB.slice(1))), terrain.VOLCANO);
  });

  /* força bruta: todos os triângulos, sem grade */
  function retaBruta(o, d, len) {
    let melhor = Infinity;
    const T = m.tris;
    for (let t = 0; t < m.nt; t++) {
      const k = t * 9;
      const e1 = [T[k + 3] - T[k], T[k + 4] - T[k + 1], T[k + 5] - T[k + 2]];
      const e2 = [T[k + 6] - T[k], T[k + 7] - T[k + 1], T[k + 8] - T[k + 2]];
      const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
      const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
      if (Math.abs(det) < 1e-12) continue;
      const s = [o[0] - T[k], o[1] - T[k + 1], o[2] - T[k + 2]];
      const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
      if (u < 0 || u > 1) continue;
      const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
      const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
      if (v < 0 || u + v > 1) continue;
      const tt = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
      if (tt > 1e-6 && tt <= len && tt < melhor) melhor = tt;
    }
    return melhor;
  }
  const V0 = () => terrain.VOLCANO;
  function pontoSobre(alturaMin, alturaMax) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * V0().r * 1.1;
    const x = V0().x + Math.cos(a) * r, z = V0().z + Math.sin(a) * r;
    return [x, terrain.heightAt(x, z) + alturaMin + rng() * (alturaMax - alturaMin), z];
  }

  it('a malha: 22 402 triângulos, 228 m de pegada, na caixa do vulcão', () => {
    assert.equal(m.nt, 22402);
    const W = V0();
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < m.nt * 3; k++) {
      x0 = Math.min(x0, m.tris[k * 3]); x1 = Math.max(x1, m.tris[k * 3]);
      z0 = Math.min(z0, m.tris[k * 3 + 2]); z1 = Math.max(z1, m.tris[k * 3 + 2]);
    }
    // a escala do js/volcano.js: o MAIOR lado da pegada vale 2·r, centrado no vulcão
    assert.ok(Math.abs(Math.max(x1 - x0, z1 - z0) - W.r * 2) < 1e-6, `pegada ${(x1 - x0).toFixed(3)} × ${(z1 - z0).toFixed(3)}`);
    assert.ok(Math.abs((x0 + x1) / 2 - W.x) < 1e-6 && Math.abs((z0 + z1) / 2 - W.z) < 1e-6, 'fora do centro');
  });

  /* altas (0,5–12 m) e RASANTES (5–80 cm do chão, que entram e saem da rocha
     várias vezes — é onde um triângulo de uma célula pode ser atingido além
     dela e outro, na célula seguinte, antes) */
  it('a reta do produto (grade + células) = a força bruta, em 3 000 segmentos', () => {
    let dif = 0, acertos = 0, pior = 0;
    for (let i = 0; i < 3000; i++) {
      const [h0, h1] = i % 2 ? [0.05, 0.8] : [0.5, 12];
      const a = pontoSobre(h0, h1), b = pontoSobre(h0, h1);
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...d);
      d[0] /= len; d[1] /= len; d[2] /= len;
      const t1 = V.retaNoVulcao(m, a[0], a[1], a[2], d[0], d[1], d[2], len), t2 = retaBruta(a, d, len);
      if (t2 < Infinity) acertos++;
      if (t1 === Infinity && t2 === Infinity) continue;
      const e = Math.abs(t1 - t2);
      if (!(e < 1e-6)) dif++;
      if (Number.isFinite(e)) pior = Math.max(pior, e);
    }
    assert.ok(acertos > 800, `cenário: só ${acertos} segmentos cruzam a rocha`);
    assert.equal(dif, 0, `${dif} segmentos com resposta diferente da força bruta (pior ${pior})`);
  });

  /* o caso que a travessia de células tem de acertar e que o acaso quase
     não sorteia: T1 é registrado na 1ª célula (a caixa dele a toca) mas a
     reta o atinge só na 2ª, em x = 3,5; T2 mora só na 2ª e é atingido antes,
     em x = 2,5. Parar na 1ª célula que teve acerto devolve T1 — 1 m depois
     da rocha que a reta encontra primeiro. */
  it('a travessia não para na 1ª célula com acerto se o acerto é da célula seguinte', () => {
    const g = V.gradeDeTriangulos(Float64Array.from([
      0, -3.5, -5, 5, 1.5, -5, 0, -3.5, 20,          // T1: plano y = x − 3,5, caixa de x 0 a 5
      2.1, -0.4, 0, 2.9, 0.4, 0, 2.1, -0.4, 1.5,     // T2: plano y = x − 2,5, só em x 2,1–2,9
    ]), 2);
    const t = V.retaNoVulcao(g, 0.1, 0, 0.5, 1, 0, 0, 10);
    assert.ok(Math.abs(t - 2.4) < 1e-9, `a reta parou em x = ${(0.1 + t).toFixed(3)}, e a 1ª rocha está em x = 2,5`);
  });

  it('o topo do produto = o mais alto da força bruta (reta vertical), em 2 000 pontos', () => {
    let dif = 0, dentro = 0;
    for (let i = 0; i < 2000; i++) {
      const [x, , z] = pontoSobre(0, 0);
      const bruto = retaBruta([x, 500, z], [0, -1, 0], 1000);
      const esperado = bruto === Infinity ? -Infinity : 500 - bruto;
      const y = V.topoDoVulcao(m, x, z);
      if (esperado > -Infinity) dentro++;
      if (!(Math.abs(y - esperado) < 1e-6) && !(y === esperado)) dif++;
    }
    assert.ok(dentro > 1000, `cenário: ${dentro} pontos sobre a rocha`);
    assert.equal(dif, 0, `${dif} pontos com topo diferente da força bruta`);
  });

  it('o chão: a rocha desenhada onde ela está, menos a calota de lava sobre o poço', () => {
    const W = V0();
    // centro da lava: a calota (desenhada muito acima do poço do relevo) não é chão
    const noCentro = V.topoDoVulcao(m, W.lavaX, W.lavaZ);
    assert.ok(noCentro - terrain.heightAt(W.lavaX, W.lavaZ) > 20, 'cenário: a calota não cobre o poço aqui');
    assert.equal(V.chaoDoVulcao(m, W.lavaX, W.lavaZ, terrain.heightAt, W), -Infinity, 'a calota de lava virou chão');
    // encosta: o chão é a rocha desenhada (força bruta de cima)
    let n = 0, dif = 0, acimaRelevo = 0;
    for (let i = 0; i < 800; i++) {
      const [x, , z] = pontoSobre(0, 0);
      if (Math.hypot(x - W.lavaX, z - W.lavaZ) < V.CALOTA_R + 2) continue;
      const bruto = retaBruta([x, 500, z], [0, -1, 0], 1000);
      if (bruto === Infinity) continue;
      n++;
      if (Math.abs(V.chaoDoVulcao(m, x, z, terrain.heightAt, W) - (500 - bruto)) > 1e-6) dif++;
      if (500 - bruto > terrain.heightAt(x, z) + 0.3) acimaRelevo++;
    }
    assert.ok(n > 300 && acimaRelevo > 50, `cenário: ${n} pontos na encosta, ${acimaRelevo} com a rocha acima do relevo`);
    assert.equal(dif, 0, `${dif} de ${n} pontos da encosta com chão diferente da rocha desenhada`);
    // o bot pisa no maior dos dois
    for (let i = 0; i < 200; i++) {
      const [x, , z] = pontoSobre(0, 0);
      const esperado = Math.max(terrain.heightAt(x, z), V.chaoDoVulcao(m, x, z, terrain.heightAt, W));
      assert.ok(Math.abs(Bots.chaoDoBot(terrain, x, z) - esperado) < 1e-9, `chão do bot em (${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
  });

  it('o bot: com o relevo livre, a rocha desenhada tampa a visada — e por cima dela não', () => {
    let casos = 0, tampou = 0, livres = 0, viu = 0;
    for (let i = 0; i < 6000 && casos < 200; i++) {
      const a = pontoSobre(1.5, 1.7), b = pontoSobre(1.0, 1.7);
      if (Math.hypot(a[0] - b[0], a[2] - b[2]) < 8) continue;
      const A = { x: a[0], y: a[1], z: a[2] }, B = { x: b[0], y: b[1], z: b[2] };
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...d);
      const rocha = retaBruta(a, d.map(v => v / len), len) < len;
      // só vale o caso em que o RELEVO deixa ver (sem o vulcão, o bot via)
      const soRelevo = Bots.lineOfSight({ ...terrain, vulcao: null }, A, B);
      if (!soRelevo) continue;
      if (rocha) { casos++; if (!Bots.lineOfSight(terrain, A, B)) tampou++; }
      else if (livres < 200) { livres++; if (Bots.lineOfSight(terrain, A, B)) viu++; }
    }
    assert.ok(casos >= 50, `cenário: só ${casos} visadas em que só a rocha desenhada tampa`);
    assert.equal(tampou, casos, `${casos - tampou} de ${casos} visadas atravessaram a rocha desenhada`);
    assert.equal(viu, livres, `${livres - viu} de ${livres} visadas livres foram barradas`);
  });
});
