/* ================================================================
   CASTELO — o piso do pátio segura bala.

   A fundação do castelo é só uma faixa de 0,46 m na borda da pegada, e a
   muralha começa em y local 0, embutida 16 cm no piso. O piso desenhado
   (RB_CourtyardFloor) não tinha colisor: a reta rasante que entrava pelo
   piso passava por BAIXO da muralha e por CIMA da fundação — o validador
   mediu 6 de 85 pares no castelo com a tela tampando e a bala passando
   (laudo de 2224bf5, §2c: bot no pátio, jogador embaixo, do lado de fora).

   ÂNCORA independente das caixas: o PLANO do piso. Toda reta que cruza
   y = piso dentro da pegada do castelo (fora do vão do portão, onde a
   soleira é outra peça) atravessa o chão desenhado — a consulta de paredes
   dos bots (a mesma regra do `rayHit` do cliente, js/paredes.js) tem de
   barrá-la. Node puro, sem navegador.
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const url = require('node:url');
const Bots = require('../scripts/bots.js');

const importar = f => import(url.pathToFileURL(path.join(__dirname, '..', 'js', f)).href);

describe('castelo: o piso do pátio barra bala', () => {
  const casos = [];
  before(async () => {
    const P = await importar('paredes.js');
    for (const semente of [424242, 1, 987654]) {
      const t = await Bots.createBotTerrain(semente);
      const mundo = P.construirMundoSolido({ worldSeed: semente, heightAt: t.heightAt, slopeAt: t.slopeAt, WATER_LEVEL: t.WATER_LEVEL, CITY: t.CITY });
      const C = P.CASTELO, m = mundo.castelo, piso = m.originY + C.FLOOR_LOCAL_Y, FH = C.FOOTPRINT_HALF;
      const { x: cx, z: cz } = m.center;
      const q = P.criarConsultaParedes(P.paredesDoJogo(mundo));
      // LCG própria do teste
      let s = semente >>> 0;
      const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      let n = 0, barradas = 0, rasantes = 0, rasantesBarradas = 0, ex = null;
      for (let k = 0; k < 4000; k++) {
        // ponto em que a reta fura o piso: dentro da pegada, fora do vão do portão
        const lx = (rnd() * 2 - 1) * (FH - 0.05), lz = (rnd() * 2 - 1) * (FH - 0.05);
        if (Math.abs(lx) < C.GATE_HALF + 0.3 && lz > FH - 3) continue;
        const pf = { x: cx + lx, y: piso, z: cz + lz };
        // de cima (olho no pátio, a 1–20 m) para baixo (até 6 m sob o piso), rasante ou não
        const ang = rnd() * Math.PI * 2, incl = rasante => (rasante ? 0.02 + rnd() * 0.1 : 0.15 + rnd() * 1.2);
        const rasante = k % 2 === 0, tg = incl(rasante);
        const acima = 1 + rnd() * 20, abaixo = 0.5 + rnd() * 6;
        const ux = Math.cos(ang), uz = Math.sin(ang);
        const a = { x: pf.x - ux * acima / tg, y: piso + acima, z: pf.z - uz * acima / tg };
        const b = { x: pf.x + ux * abaixo / tg, y: piso - abaixo, z: pf.z + uz * abaixo / tg };
        n++;
        const bar = q.segmentoBloqueado(a, b);
        if (bar) barradas++;
        if (rasante) { rasantes++; if (bar) rasantesBarradas++; }
        if (!bar && !ex) ex = { a, b, furo: [+lx.toFixed(2), +lz.toFixed(2)] };
      }
      casos.push({ semente, n, barradas, rasantes, rasantesBarradas, ex });
    }
  });

  it('toda reta que fura o piso do pátio é barrada (rasantes inclusive), em 3 sementes', t => {
    for (const c of casos) {
      t.diagnostic(`semente ${c.semente}: ${c.barradas} de ${c.n} barradas; rasantes ${c.rasantesBarradas} de ${c.rasantes}` +
        (c.ex ? ` — ex. livre: ${JSON.stringify(c.ex)}` : ''));
      assert.ok(c.n > 3000 && c.rasantes > 1500, `cenário: só ${c.n} retas (${c.rasantes} rasantes)`);
      assert.equal(c.barradas, c.n, `semente ${c.semente}: ${c.n - c.barradas} retas atravessaram o piso do pátio`);
    }
  });
});
