/* ================================================================
   PISO DO SAGUÃO DA TORRE NEXUS em TODA semente — "na entrada o chão
   buga" (dono).

   O platô da cidade guarda 5 % do relevo natural: na pegada da torre o
   terreno sobe até +0,13 m acima de gy na mediana das sementes (+0,42 no
   pior de 60 medidas) e desce até −0,33. Uma placa plana fixa furava ou
   enterrava o pé conforme a semente. O piso do saguão (js/paredes.js:
   pisoDoSaguao) acompanha o relevo da semente; aqui a âncora é o
   TERRENO dos bots (createBotTerrain — o mesmo do cliente), amostrado
   mais fino que o próprio cálculo.
   ================================================================ */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { importar } = require('./helpers/pve-mundo');
const Bots = require('../scripts/bots.js');

describe('Piso do saguão da torre acompanha o relevo da semente', () => {
  it('20 sementes: terreno nunca encosta no piso, rampa da porta termina NO terreno e as muretas cobrem os lados', async () => {
    const P = await importar('paredes.js');
    const falhas = [];
    let acimaDoMinimo = 0;
    for (let s = 0; s < 20; s++) {
      const semente = s === 0 ? 424242 : (Math.imul(s + 7, 2654435761) >>> 0);
      const t = await Bots.createBotTerrain(semente);
      const m = P.construirMundoSolido({ worldSeed: semente, heightAt: t.heightAt, slopeAt: t.slopeAt,
        WATER_LEVEL: t.WATER_LEVEL, CITY: t.CITY });
      const { cx, cz, gy } = m.cidade;
      const NI = m.cidade.nexus.info, R = NI.rampaPorta;
      const pb = [];
      // 1) o terreno fica abaixo do piso em toda a pegada (0,1 m, mais fino que o cálculo)
      const RR = P.NEXUS.W / 2 + 0.25;
      let alto = -Infinity;
      for (let x = -RR; x <= RR + 1e-9; x += 0.1) for (let z = -RR; z <= RR + 1e-9; z += 0.1)
        alto = Math.max(alto, t.heightAt(cx + x, cz + z));
      if (alto > NI.lobbyY - 0.02) pb.push(`terreno a ${(NI.lobbyY - alto).toFixed(3)} m do piso`);
      if (NI.lobbyY < gy + 0.16 - 1e-9) pb.push('piso abaixo do asfalto da rua de acesso');
      if (NI.lobbyY > gy + 0.16 + 1e-9) acimaDoMinimo++;
      // 2) a rampa sai do piso e termina no terreno de fora (sem degrau na ponta), em toda a largura
      const rampa = m.paredes && m.cidade.nexus.ops.find(o => o.tipo === 'rampaPorta');
      if (!rampa) { pb.push('sem rampa'); falhas.push(`${semente}: ${pb.join('; ')}`); continue; }
      if (Math.abs(rampa.y0 - NI.lobbyY) > 1e-9) pb.push('rampa não sai do piso');
      for (let x = -2; x <= 2 + 1e-9; x += 0.5) {
        const d = rampa.y1 - t.heightAt(cx + x, cz + R.z1);
        if (d > 0.02) pb.push(`ponta da rampa ${d.toFixed(3)} m acima do terreno em x ${x}`);
      }
      const declive = (rampa.y0 - rampa.y1) / (rampa.z1 - rampa.z0);
      if (declive > 0.1 + 1e-9 && rampa.z1 - rampa.z0 < 5 - 1e-9) pb.push(`declive ${declive.toFixed(3)}`);
      // 3) as muretas cobrem os dois lados da rampa inteira
      const muretas = m.cidade.nexus.ops.filter(o => o.tipo === 'mureta');
      if (muretas.length !== 2) pb.push(`${muretas.length} muretas`);
      for (const mu of muretas) {
        if (Math.abs(mu.z0 - R.z0) > 1e-9 || Math.abs(mu.z1 - R.z1) > 1e-9) pb.push('mureta não cobre a rampa');
        if (mu.y1 < NI.lobbyY + 0.4) pb.push('mureta baixa demais para segurar quem vem de lado');
      }
      if (pb.length) falhas.push(`${semente}: ${pb.join('; ')}`);
    }
    assert.deepEqual(falhas, []);
    assert.ok(acimaDoMinimo >= 5, `pré-condição: só ${acimaDoMinimo} de 20 sementes exercitam o relevo (piso acima do mínimo)`);
  });
});
