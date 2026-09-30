/* ================================================================
   O CORPO PISA NA ROCHA DESENHADA DO VULCÃO (fase 2 do §2c do laudo
   d381d29). O relevo é uma grade suave do modelo: a rocha desenhada passa
   dele em quase metade da superfície (até 6,7 m na saia) — quem andava ali
   ficava com as pernas, ou o tronco, dentro da rocha.

   O jogador anda de verdade (tecla, laço do jogo) de fora do vulcão até a
   borda da cratera, por 12 radiais. Âncora independente: o Raycaster na
   malha DESENHADA do vulcão e na do terreno (a 1ª superfície vista de
   cima), e a paridade (reta para cima cruza a malha um número ímpar de
   vezes) para o olho dentro da rocha.
   A calota de lava que cobre o poço não é chão: quem cai nela afunda para o
   poço e queima (a regra de sempre).

   Porta 4159.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');

const PORT = 4159;

describe('o corpo pisa na rocha desenhada do vulcão', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: PORT });
    await h.page.waitForFunction(() => window.__game && window.__game.Volcano
      && window.__game.Volcano.modelReady && window.__game.Volcano.solido, { timeout: 120000 });
  });
  after(async () => { if (h) await h.close(); });

  it('subindo o vulcão por 12 radiais: o pé não afunda na rocha, o olho não entra nela, e o pé não flutua', async t => {
    const r = { quadros: 0, naRocha: 0, enterrado: 0, olho: 0, flutua: 0, pior: 0, exemplo: null };
    for (let k = 0; k < 12; k++) {
      const p = await h.play(k => {
        const G = window.__game, MP = window.__MP, T = MP.THREE, QA = window.QA, cam = MP.camera, V = G.Volcano.VOLCANO;
        const malhas = [];
        G.Volcano.group.updateWorldMatrix(true, true);
        G.terrainMesh.updateWorldMatrix(true, false);
        G.Volcano.group.traverse(o => { if (o.isMesh) malhas.push(o); });
        const lados = malhas.map(m => m.material.side);
        malhas.forEach(m => { m.material.side = T.DoubleSide; });
        const rc = new T.Raycaster(), o = new T.Vector3(), baixo = new T.Vector3(0, -1, 0), cima = new T.Vector3(0, 1, 0);
        /* a 1ª superfície desenhada de cima (vulcão ou terreno) em (x, z) */
        const desenho = (x, z) => {
          o.set(x, 400, z); rc.set(o, baixo); rc.near = 0; rc.far = 800;
          const hv = rc.intersectObjects(malhas, false)[0], ht = rc.intersectObject(G.terrainMesh, false)[0];
          const yv = hv ? hv.point.y : -Infinity, yt = ht ? ht.point.y : -Infinity;
          return { y: Math.max(yv, yt), rocha: yv > yt };
        };
        const olhoDentro = (x, y, z) => {
          o.set(x, y, z); rc.set(o, cima); rc.near = 0; rc.far = 500;
          return rc.intersectObjects(malhas, false).length % 2 === 1;
        };
        const out = { quadros: 0, naRocha: 0, enterrado: 0, olho: 0, flutua: 0, pior: 0, exemplo: null };
        const a = k * Math.PI / 6 + 0.13;
        QA.reset(V.lavaX + Math.cos(a) * 125, V.lavaZ + Math.sin(a) * 125);
        QA.tick(10);
        const yaw = Math.atan2(-(V.lavaX - MP.player.pos.x), -(V.lavaZ - MP.player.pos.z));
        for (let f = 0; f < 1500; f++) {
          const P = MP.player.pos;
          if (Math.hypot(P.x - V.lavaX, P.z - V.lavaZ) < 20) break;   // a borda da cratera
          cam.rotation.set(0, yaw, 0, 'YXZ'); if (MP.player.yaw !== undefined) MP.player.yaw = yaw;
          G.keys.KeyW = true; QA.tick(1);
          if (!MP.player.onGround || f % 3) continue;   // mede um quadro em três
          out.quadros++;
          const d = desenho(P.x, P.z);
          if (d.rocha) out.naRocha++;
          const afundou = d.y - P.y;
          if (afundou > out.pior) out.pior = afundou;
          if (afundou > 0.25) { out.enterrado++; if (!out.exemplo) out.exemplo = { p: [P.x, P.y, P.z].map(v => +v.toFixed(2)), desenho: +d.y.toFixed(2) }; }
          if (P.y - d.y > 0.3) out.flutua++;
          if (olhoDentro(P.x, P.y + 1.62, P.z)) out.olho++;
        }
        G.keys.KeyW = false; QA.tick(2);
        malhas.forEach((m, i) => { m.material.side = lados[i]; });
        return out;
      }, k);
      for (const c of ['quadros', 'naRocha', 'enterrado', 'olho', 'flutua']) r[c] += p[c];
      r.pior = Math.max(r.pior, p.pior);
      if (!r.exemplo && p.exemplo) r.exemplo = p.exemplo;
    }
    t.diagnostic(`${r.quadros} quadros no chão (${r.naRocha} sobre a rocha desenhada); pé enterrado > 25 cm em ${r.enterrado} ` +
      `(pior ${r.pior.toFixed(2)} m${r.exemplo ? ', ex.: ' + JSON.stringify(r.exemplo) : ''}); olho dentro da rocha em ${r.olho}; pé flutuando > 30 cm em ${r.flutua}`);
    assert.ok(r.naRocha >= 300, `cenário: só ${r.naRocha} quadros sobre a rocha desenhada`);
    assert.equal(r.enterrado, 0, `o pé afundou mais de 25 cm na rocha desenhada em ${r.enterrado} de ${r.quadros} quadros`);
    assert.equal(r.olho, 0, `o olho ficou dentro da rocha em ${r.olho} quadros`);
    assert.equal(r.flutua, 0, `o pé flutuou acima do desenho em ${r.flutua} quadros`);
  });

  it('a calota de lava não é chão: quem cai nela afunda para o poço e queima', async t => {
    const r = await h.play(() => {
      const G = window.__game, MP = window.__MP, QA = window.QA, V = G.Volcano.VOLCANO;
      QA.reset(V.lavaX + 2, V.lavaZ + 2);
      const P = MP.player;
      P.pos.set(V.lavaX + 2, 110, V.lavaZ + 2); P.vel.set(0, 0, 0); P.onGround = false;
      P.health = 100; P.armor = 0; P.invulnUntil = 0;
      const topo = G.Volcano.topo(P.pos.x, P.pos.z);
      for (let f = 0; f < 60 * 8; f++) QA.tick(1);
      return { topo, y: P.pos.y, vida: P.health, morto: !!P.dead, lavaY: V.lavaY };
    });
    t.diagnostic(`calota desenhada em y = ${r.topo.toFixed(1)}; o jogador parou em y = ${r.y.toFixed(1)} (lava abaixo de ${r.lavaY.toFixed(1)}); vida ${r.vida}${r.morto ? ' (morto)' : ''}`);
    assert.ok(r.y < r.topo - 3, `o jogador ficou em pé sobre a calota de lava (y ${r.y.toFixed(1)}, calota ${r.topo.toFixed(1)})`);
    assert.ok(r.morto || r.vida < 100, 'caiu no poço de lava e não queimou');
  });

  it('boot limpo: sem erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
