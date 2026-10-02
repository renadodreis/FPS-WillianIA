/* ================================================================
   O TOTEM DE FOGOS E O CANHÃO SEGURAM BALA — laudos 5 a 8, observação (b).

   "Desenho sólido barra bala": o totem (quatro caixas empilhadas) e a
   carreta e as rodas do canhão eram só desenho — a bala e a visada do bot
   passavam. Agora são paredes (corpo e bala) da lista única das atrações
   (js/maptoys-core.js, paredesDasAtracoes). O cano GIRA para mirar e fica de
   fora (desenho que se mexe não é parede).

   ÂNCORA independente: a MALHA desenhada (`Raycaster` nas malhas nomeadas
   `totemFogos`, `canhaoCarreta`, `canhaoRoda`). Retas horizontais de
   quatro lados, em várias alturas: (a) as que cruzam o miolo do desenho
   (até 85 % da meia-largura) param DENTRO da peça — não a atravessam (o
   cilindro de bala é feito de caixas dentro do círculo, então pode parar
   uns cm depois da casca); (b) as que passam 2 cm por fora não param no ar.

   Porta 4162.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');

const PORT = 4162;

describe('o totem de fogos e o canhão seguram bala', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, r;
  before(async () => {
    h = await bootGame({ port: PORT });
    r = await h.play(() => {
      const G = window.__game, MP = window.__MP, T = MP.THREE, scene = MP.scene;
      scene.updateWorldMatrix(true, true);
      const grupos = { totemFogos: [], canhaoCarreta: [], canhaoRoda: [] };
      scene.traverse(o => { if (o.isMesh && grupos[o.name]) grupos[o.name].push(o); });
      const rc = new T.Raycaster(), o = new T.Vector3(), d = new T.Vector3(), cx = new T.Box3(), c = new T.Vector3(), tam = new T.Vector3();
      const out = {};
      const livreDoChao = (ox, oy, oz, dx, dz, L) => {
        for (let s = 0; s <= L; s += 0.25) if (oy < G.heightAt(ox + dx * s, oz + dz * s) + 0.15) return false;
        return true;
      };
      for (const [nome, malhas] of Object.entries(grupos)) {
        const res = { malhas: malhas.length, miolo: 0, semColisor: 0, ex: null, fora: 0, noAr: 0, exAr: null };
        out[nome] = res;
        for (const m of malhas) {
          cx.setFromObject(m); cx.getCenter(c); cx.getSize(tam);
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const meia = dx ? tam.z / 2 : tam.x / 2;   // meia-largura perpendicular à reta
            for (let fy = 0.15; fy <= 0.86; fy += 0.175) {
              const y = cx.min.y + tam.y * fy;
              for (const [tipo, frac] of [['miolo', -0.85], ['miolo', -0.4], ['miolo', 0], ['miolo', 0.4], ['miolo', 0.85], ['fora', -1], ['fora', 1]]) {
                const lat = tipo === 'fora' ? Math.sign(frac) * (meia + 0.02) : frac * meia;
                const ox = c.x - dx * 6 + (dz ? lat : 0), oz = c.z - dz * 6 + (dx ? lat : 0);
                if (!livreDoChao(ox, y, oz, dx, dz, 12)) continue;
                o.set(ox, y, oz); d.set(dx, 0, dz);
                rc.set(o, d); rc.near = 0; rc.far = 12;
                const hit = rc.intersectObjects(Object.values(grupos).flat(), false)[0];
                const tp = MP.rayBlockedAt(o, d, 12);
                if (tipo === 'miolo') {
                  if (!hit || hit.object !== m) continue;   // a reta pega outra peça antes: não é desta
                  res.miolo++;
                  // atravessou: passou da profundidade da peça (o cilindro de bala é
                  // inscrito — parar uns cm depois da casca na ponta da corda é o desenho)
                  const fundo = dx ? tam.x : tam.z;
                  if (tp > hit.distance + fundo) { res.semColisor++; if (!res.ex) res.ex = { o: [ox, y, oz].map(v => +v.toFixed(2)), d: [dx, dz], malha: +hit.distance.toFixed(2), produto: tp }; }
                } else {
                  if (hit) continue;
                  res.fora++;
                  if (tp < 12 - 0.15) { res.noAr++; if (!res.exAr) res.exAr = { o: [ox, y, oz].map(v => +v.toFixed(2)), d: [dx, dz], produto: +tp.toFixed(2) }; }
                }
              }
            }
          }
        }
      }
      return out;
    });
  });
  after(async () => { if (h) await h.close(); });

  for (const nome of ['totemFogos', 'canhaoCarreta', 'canhaoRoda']) {
    it(`${nome}: a reta que cruza o desenho para nele; a que passa 2 cm por fora não para no ar`, t => {
      const x = r[nome];
      t.diagnostic(`${x.malhas} malhas; miolo: ${x.semColisor} de ${x.miolo} sem colisor${x.ex ? ' — ex.: ' + JSON.stringify(x.ex) : ''}; fora: ${x.noAr} de ${x.fora} paradas no ar${x.exAr ? ' — ex.: ' + JSON.stringify(x.exAr) : ''}`);
      assert.ok(x.malhas >= 1 && x.miolo >= 20 && x.fora >= 8, `cenário: ${x.malhas} malhas, ${x.miolo} retas no miolo, ${x.fora} por fora`);
      assert.equal(x.semColisor, 0, `a bala atravessou o desenho em ${x.semColisor} de ${x.miolo}`);
      assert.equal(x.noAr, 0, `a bala parou no ar em ${x.noAr} de ${x.fora}`);
    });
  }

  it('boot limpo: sem erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
