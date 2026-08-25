/* ================================================================
   QA — RODAS DO CARRO NO MENU (js/car.js + js/carwheels.js).

   O menu é a APRESENTAÇÃO do jogo: o passeio de câmera abre justamente
   com um plano fechado no carro. E ali a física NÃO roda — `stepPhysics`
   só é chamado no caminho de jogo, depois que o bloco de menu retorna
   (game.js). O mundo do menu está vivo por `update` de cada módulo, não
   por simulação.

   O BUG QUE ESTE TESTE TRAVA: as rodas nascem certas — `carwheels.js`
   monta cada pivô a partir de `cfg.wheelsVis`, os centros VISUAIS
   calibrados no espaço do chassi — e aí o `Car.update` sobrescreve tudo
   com `wheelInfos[i].worldTransform`, que é pose de RaycastVehicle. Sem
   `world.step` essa pose nunca foi calculada: `suspensionLength` fica em
   0 (contra 0,55 de repouso) e nenhuma roda tem contato de raycast. O
   resultado medido era roda com y local +0,105 em vez de negativo — ou
   seja, ~1,1 m ACIMA de onde deveria, na altura da janela, flutuando
   0,7–0,8 m do chão com pneu de 0,207 de raio.

   Em jogo isto sempre funcionou (a física roda antes do `Car.update`), e
   é por isso que os testes de rig de roda existentes passam: todos
   bootam com `autoStart` ligado. O menu não tinha teste nenhum.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

const PORT = 3316;

describe('rodas do carro no menu', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, rodas;
  before(async () => {
    h = await bootGame({ port: PORT, autoStart: false });
    rodas = await h.play(async () => {
      const G = window.__game, MP = window.__MP;
      await G.Car.ready;
      for (let i = 0; i < 120; i++) G.tick(1 / 60);   // o menu roda, a física não
      const v = G.Car.vehicles[0];
      const out = { fisicaRodou: MP.world.stepnumber > 0, rodas: [] };
      for (let i = 0; i < 4; i++) {
        const pivo = v.visualWheels && v.visualWheels[i];
        if (!pivo) { out.rodas.push(null); continue; }
        const w = new MP.THREE.Vector3();
        pivo.getWorldPosition(w);
        out.rodas.push({
          localY: +pivo.position.y.toFixed(3),
          mundoY: +w.y.toFixed(3),
          terreno: +MP.heightAt(w.x, w.z).toFixed(3),
          raio: +v.vehicle.wheelInfos[i].radius.toFixed(3),
        });
      }
      return out;
    });
  });
  after(async () => { if (h) await h.close(); });

  it('o menu de fato não roda física — é a premissa do bug', () => {
    assert.equal(rodas.fisicaRodou, false,
      'se a física passou a rodar no menu, este teste precisa ser repensado');
  });

  it('cada roda fica ABAIXO do centro do chassi, não na altura da janela', () => {
    for (const [i, r] of rodas.rodas.entries()) {
      assert.ok(r, `roda ${i} sem pivô visual`);
      assert.ok(r.localY < 0,
        `roda ${i} com y local ${r.localY}: pose de suspensão nunca calculada a puxa pra dentro da carroceria`);
    }
  });

  it('o pneu encosta no chão, com folga de suspensão', () => {
    for (const [i, r] of rodas.rodas.entries()) {
      const base = r.mundoY - r.raio;          // parte de baixo do pneu
      const folga = base - r.terreno;
      assert.ok(Math.abs(folga) <= 0.3,
        `roda ${i} com a base a ${folga.toFixed(3)} m do terreno (limite 0,30)`);
    }
  });
});
