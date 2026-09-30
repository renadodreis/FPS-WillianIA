/* ================================================================
   O OLHO NÃO ENTRA NO SÓLIDO — laudo d381d29, NC-1 e NC-3.

   Sólido que segura bala não barra a reta que NASCE dentro dele (é a regra:
   a granada no pé do tronco, a bala que sai da superfície). Então o jogador
   com o OLHO dentro de um sólido fica escondido na tela e da bala de fora —
   e atira para fora. Dois jeitos de chegar lá, os dois nascidos de
   correções desta leva:
   • NC-1: a casa de máquinas / a caixa d'água do telhado eram laje de bala
     sem corpo — dava para entrar andando;
   • NC-3: a pedra (e o cacto) seguram bala pela malha desenhada, que incha
     além do círculo que empurra o corpo — o agachado encostado ficava com o
     olho dentro dela.

   ÂNCORA independente: a MALHA desenhada. O olho está dentro quando a reta
   para cima cruza a superfície um número ÍMPAR de vezes (material em dois
   lados só para a medida). O jogador anda de verdade (tecla, laço do jogo)
   contra o sólido, de oito lados, em pé e agachado.

   Porta 4155.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');

const PORT = 4155;

describe('o olho não entra no sólido (pedra, cacto, casa de máquinas)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, r;
  before(async () => {
    h = await bootGame({ port: PORT });
    await h.page.waitForFunction(() => window.__game && window.__game.cactiMesh, { timeout: 90000 });
    r = await h.play(() => {
      const G = window.__game, MP = window.__MP, T = MP.THREE, QA = window.QA, scene = MP.scene;
      const cam = MP.camera, olho = new T.Vector3(), rc = new T.Raycaster(), cima = new T.Vector3(0, 1, 0);
      let rochas = null;
      scene.traverse(o => { if (o.isInstancedMesh && o.geometry.type === 'IcosahedronGeometry') rochas = o; });
      const trim = scene.getObjectByName('cityTrimMesh');
      /* paridade: quantas vezes a reta para cima cruza o desenho (dois lados) */
      const dentro = (obj, filtro) => {
        const lado = obj.material.side;
        obj.material.side = T.DoubleSide;
        rc.set(olho, cima); rc.near = 0; rc.far = 200;
        const n = rc.intersectObject(obj, false).filter(filtro || (() => true)).length;
        obj.material.side = lado;
        return n % 2 === 1;
      };
      const m4 = new T.Matrix4(), pos = new T.Vector3(), q = new T.Quaternion(), esc = new T.Vector3();
      const empurrar = (alvoX, alvoZ, raio, agachado, testar) => {
        let dentroN = 0, quadros = 0;
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4 + 0.1;
          QA.reset(alvoX + Math.cos(a) * (raio + 1.2), alvoZ + Math.sin(a) * (raio + 1.2));
          G.keys.ControlLeft = agachado; QA.tick(20);
          // de frente para o centro, andando
          const yaw = Math.atan2(-(alvoX - MP.player.pos.x), -(alvoZ - MP.player.pos.z));
          for (let f = 0; f < 90; f++) {
            cam.rotation.set(0, yaw, 0, 'YXZ'); if (MP.player.yaw !== undefined) MP.player.yaw = yaw;
            G.keys.KeyW = true; QA.tick(1);
            cam.updateMatrixWorld(true); olho.setFromMatrixPosition(cam.matrixWorld);
            quadros++;
            if (testar()) dentroN++;
          }
          G.keys.KeyW = false; G.keys.ControlLeft = false; QA.tick(2);
        }
        return { dentroN, quadros };
      };
      const res = { pedra: { alvos: 0, dentro: 0, quadros: 0 }, cacto: { alvos: 0, dentro: 0, quadros: 0 }, telhado: { alvos: 0, dentro: 0, quadros: 0 } };
      /* pedras sólidas (escala y > 1,1) */
      for (let i = 0; i < rochas.count && res.pedra.alvos < 6; i++) {
        rochas.getMatrixAt(i, m4); m4.decompose(pos, q, esc);
        if (esc.y <= 1.4 || G.Structures.sites.some(s => Math.hypot(s.x - pos.x, s.z - pos.z) < s.r + 10)) continue;
        res.pedra.alvos++;
        rochas.computeBoundingSphere();
        for (const ag of [true, false]) {
          const x = pos.x, z = pos.z, ii = i;
          const m = empurrar(x, z, Math.max(esc.x, esc.z) * 1.5, ag, () => dentro(rochas, hh => hh.instanceId === ii));
          res.pedra.dentro += m.dentroN; res.pedra.quadros += m.quadros;
        }
      }
      /* cactos grandes (os braços incham além do círculo do corpo) */
      const cac = G.cactiMesh;
      for (let i = 0; i < cac.count && res.cacto.alvos < 4; i++) {
        cac.getMatrixAt(i, m4); m4.decompose(pos, q, esc);
        if (esc.y < 1.2) continue;
        res.cacto.alvos++;
        cac.computeBoundingSphere();
        const x = pos.x, z = pos.z, ii = i;
        const m = empurrar(x, z, 1.0 * esc.y, false, () => dentro(cac, hh => hh.instanceId === ii));
        res.cacto.dentro += m.dentroN; res.cacto.quadros += m.quadros;
      }
      /* casas de máquinas e caixas d'água: paredes do acabamento acima de 5 m, altas */
      const vistas = [];
      for (const w of G.Structures.walls) {
        if (!w.acabamento || !/^lote#/.test(w.acabamento) || w.y1 - w.y0 < 1.3) continue;
        const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
        if (MP.groundAt(cx, cz, w.y0 + 0.1) < w.y0 - 0.3) continue;       // não está no telhado
        if (vistas.some(v => Math.hypot(v[0] - cx, v[1] - cz) < 2)) continue;
        vistas.push([cx, cz]);
        if (vistas.length > 6) break;
        res.telhado.alvos++;
        const m = empurrar(cx, cz, Math.max(w.x1 - w.x0, w.z1 - w.z0) / 2, false, () => dentro(trim));
        res.telhado.dentro += m.dentroN; res.telhado.quadros += m.quadros;
      }
      return res;
    });
  });
  after(async () => { if (h) await h.close(); });

  for (const [tipo, minAlvos] of [['pedra', 4], ['cacto', 3], ['telhado', 3]]) {
    it(`${tipo}: andando contra o sólido de oito lados, o olho nunca fica dentro do desenho`, t => {
      const x = r[tipo];
      t.diagnostic(`${tipo}: ${x.alvos} alvos, ${x.quadros} quadros, olho dentro em ${x.dentro}`);
      assert.ok(x.alvos >= minAlvos, `cenário: só ${x.alvos} alvos`);
      assert.equal(x.dentro, 0, `o olho ficou dentro do ${tipo} desenhado em ${x.dentro} de ${x.quadros} quadros`);
    });
  }

  it('boot limpo: sem erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
