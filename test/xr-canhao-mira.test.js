/* ================================================================
   O CANHÃO EM XR MIRA PARA ONDE A CABEÇA OLHA NO MUNDO — laudo a03c122, §4.6.

   `aimDir` (js/cannon.js) lia `camera.quaternion`. Em XR isso é a pose da
   cabeça RELATIVA ao rig (CLAUDE.md: "a fonte única certa é vistaMundo()"):
   com giro artificial o voo saía pelo giro inteiro de erro (84°, 174°).

   Sessão imersiva REAL (IWER). O giro entra pelo módulo que o laço do jogo
   alimenta com o analógico (`XR.giro.atualizar`), até a vista ficar de LADO
   para o curso de argolas (a mira que cruza uma argola voa para ela — não é
   o caso medido aqui). RÉGUA INDEPENDENTE de `vistaMundo`: o giro do rig
   (`XR.rig.rotation.y`) composto com a pose da cabeça relativa a ele
   (`camera.quaternion`), lida DEPOIS do render. O voo é a velocidade do
   jogador no 1º quadro do voo.

   Porta 3882.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');
const { bootEmVR } = require('./helpers/iwer.js');

const PORT = 3882;
const sleep = ms => new Promise(r => setTimeout(r, ms));

describe('o canhão em XR mira pela vista de mundo', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootEmVR(bootGame, { port: PORT }); });
  after(async () => { if (h) await h.close(); });

  it('com giro artificial de ~90°, o voo sai para onde a cabeça olha no mundo', async t => {
    // no canhão, de pé, e o giro até a vista ficar de lado para o curso
    const prep = await h.play(() => {
      const G = window.__game, M = G.MapToys, cn = G.Cannon, sp = cn.spot;
      window.QA.reset(sp.x, sp.z);
      const L = M.rings.list, nx = L[0].nx, nz = L[0].nz;
      return { nx, nz };
    });
    let giro;
    for (let k = 0; k < 200; k++) {
      giro = await h.play(() => {
        const G = window.__game, T = window.__MP.THREE;
        G.XR.giro.atualizar(1 / 60, 1);
        const yaw = G.XR.rig.rotation.y;
        const f = new T.Vector3(0, 0, -1).applyQuaternion(window.__MP.camera.quaternion);
        f.applyAxisAngle(new T.Vector3(0, 1, 0), yaw); f.y = 0; f.normalize();
        return { yaw, gx: G.XR.giro.yaw, fx: f.x, fz: f.z };
      });
      await sleep(30);
      const cos = giro.fx * prep.nx + giro.fz * prep.nz;
      if (Math.abs(giro.gx) > 1.2 && Math.abs(cos) < 0.25) break;
    }
    await sleep(300);   // o rig assenta o giro (o `place` roda no quadro)
    const r = await h.play(async () => {
      const G = window.__game, T = window.__MP.THREE, cn = G.Cannon, P = window.__MP.player;
      const cam = window.__MP.camera;
      // a régua: giro do rig ∘ cabeça relativa ao rig (não `vistaMundo`)
      const f = new T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      f.applyAxisAngle(new T.Vector3(0, 1, 0), G.XR.rig.rotation.y); f.y = 0; f.normalize();
      const ok = cn.fire();
      let v = null;
      for (let i = 0; i < 120 && !v; i++) {
        await new Promise(res => setTimeout(res, 16));
        if (cn.state === 'flying') v = { x: P.vel.x, z: P.vel.z };
      }
      return { ok, rigYaw: G.XR.rig.rotation.y, esperado: { x: f.x, z: f.z }, v };
    });
    assert.ok(r.ok, 'o canhão recusou o disparo');
    assert.ok(r.v, 'cenário: o voo não começou');
    assert.ok(Math.abs(r.rigYaw) > 1.2, `cenário: giro artificial de só ${(r.rigYaw * 180 / Math.PI).toFixed(1)}°`);
    const l = Math.hypot(r.v.x, r.v.z);
    const cos = (r.v.x * r.esperado.x + r.v.z * r.esperado.z) / l;
    const erro = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    t.diagnostic(`giro do rig ${(r.rigYaw * 180 / Math.PI).toFixed(1)}°; voo a ${erro.toFixed(2)}° de onde a cabeça olha`);
    assert.ok(erro < 3, `o voo saiu a ${erro.toFixed(2)}° de onde a cabeça olha no mundo`);
  });

  it('boot limpo: sem erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
