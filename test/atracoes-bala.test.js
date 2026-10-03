/* ================================================================
   O TOTEM DE FOGOS E O CANHÃO SEGURAM BALA — laudos 5 a 8, observação (b).

   "Desenho sólido barra bala": o totem (quatro caixas empilhadas) e a
   carreta e as rodas do canhão eram só desenho — a bala e a visada do bot
   passavam. Agora são paredes (corpo e bala) da lista única das atrações
   (js/maptoys-core.js, paredesDasAtracoes). O cano GIRA para mirar e fica de
   fora (desenho que se mexe não é parede).

   ÂNCORA independente: a MALHA desenhada (`Raycaster` nas malhas nomeadas
   `totemFogos`, `canhaoCarreta`, `canhaoRoda`). Retas horizontais de
   quatro lados: (a) as que cruzam o MIOLO do desenho (alturas 30–70 %, até
   70 % da borda) param dentro da peça — não a atravessam (o cilindro de
   bala é feito de caixas dentro do polígono, então pode parar uns cm depois
   da casca); (b) as que passam 2 cm por fora não param no ar; (c) RENTE à
   borda achada na própria malha, de 12 lados, 1 cm por fora: não param no
   ar; (d) por baixo do totem, rente ao chão, não param no ar.

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
            /* miolo de verdade: alturas 30–70 % e ±70 % da borda naquela altura. No
               disco da roda, altura e lateral perto da borda juntas dão 0,95 r radial —
               a faixa rente que a caixa inscrita não cobre por construção (a borda
               tem o teste rente, abaixo) */
            for (let fy = 0.3; fy <= 0.71; fy += 0.1) {
              const y = cx.min.y + tam.y * fy;
              /* o miolo é medido contra a BORDA desenhada naquela altura e naquele
                 lado (busca binária na malha): a carreta é tronco de cone, e 85 % da
                 meia-largura da base é 95 % do raio lá em cima — a faixa rente que a
                 caixa inscrita não cobre por construção */
              const borda = lado => {
                const ok = q => { o.set(c.x - dx * 6 + (dz ? q : 0), y, c.z - dz * 6 + (dx ? q : 0)); d.set(dx, 0, dz); rc.set(o, d); rc.near = 0; rc.far = 12;
                  const hh = rc.intersectObject(m, false); return hh.length > 0; };
                if (!ok(0)) return 0;
                let lo = 0, hi = meia + 0.1;
                for (let it = 0; it < 20; it++) { const mid = (lo + hi) / 2; if (ok(mid * lado)) lo = mid; else hi = mid; }
                return lo;
              };
              const bordas = { [-1]: borda(-1), 1: borda(1) };
              for (const [tipo, frac] of [['miolo', -0.7], ['miolo', -0.35], ['miolo', 0], ['miolo', 0.35], ['miolo', 0.7], ['fora', -1], ['fora', 1]]) {
                const lat = tipo === 'fora' ? Math.sign(frac) * (meia + 0.02) : frac * bordas[frac < 0 ? -1 : 1];
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
      /* RENTE À BORDA, de qualquer lado: para cada malha, 36 azimutes (a quina
         que sai do polígono só aparece numa janela de ±7°); a
         borda é achada na PRÓPRIA malha (busca binária da última reta que
         ainda a acerta), e a reta 1 cm por fora não pode parar. Lado (em 3
         alturas) e topo (em 3 deslocamentos). Pega quina de caixa saindo do
         polígono desenhado (os fatores do círculo num polígono de 20 e 16
         lados passavam 2,2 cm; laudo f672d81, §4.2) */
      const todas = Object.values(grupos).flat();
      const acerta = (m, ox, oy, oz, dx, dz) => { o.set(ox, oy, oz); d.set(dx, 0, dz); rc.set(o, d); rc.near = 0; rc.far = 12; const h0 = rc.intersectObjects(todas, false)[0]; return h0 && h0.object === m ? h0 : (h0 ? 'outra' : null); };
      for (const [nome, malhas] of Object.entries(grupos)) {
        const res = out[nome]; res.rente = 0; res.renteAr = 0; res.exRente = null;
        for (const m of malhas) {
          cx.setFromObject(m); cx.getCenter(c); cx.getSize(tam);
          for (let k = 0; k < 36; k++) {
            const az = (k + 0.37) * Math.PI / 18, dx = Math.cos(az), dz = Math.sin(az), px = -dz, pz = dx;
            const testa = (lat, y) => {
              const ox = c.x - dx * 6 + px * lat, oz = c.z - dz * 6 + pz * lat;
              if (!livreDoChao(ox, y, oz, dx, dz, 12)) return;
              if (acerta(m, ox, y, oz, dx, dz)) return;   // ainda pega a malha (ou outra): não é rente
              res.rente++;
              o.set(ox, y, oz); d.set(dx, 0, dz);
              const tp = MP.rayBlockedAt(o, d, 12);
              if (tp < 12 - 0.15) { res.renteAr++; if (!res.exRente) res.exRente = { o: [ox, y, oz].map(v => +v.toFixed(3)), az: +az.toFixed(2), produto: +tp.toFixed(3) }; }
            };
            // lado: em 3 alturas, a borda lateral pelos dois lados
            for (const fy of [0.25, 0.5, 0.75]) {
              const y = cx.min.y + tam.y * fy;
              for (const lado of [1, -1]) {
                const h0 = acerta(m, c.x - dx * 6, y, c.z - dz * 6, dx, dz);
                if (!h0 || h0 === 'outra') continue;   // o centro tem de pegar ESTA malha
                let lo = 0, hi = Math.max(tam.x, tam.z);
                for (let it = 0; it < 22; it++) {
                  const mid = (lo + hi) / 2, h1 = acerta(m, c.x - dx * 6 + px * mid * lado, y, c.z - dz * 6 + pz * mid * lado, dx, dz);
                  if (h1 && h1 !== 'outra') lo = mid; else hi = mid;
                }
                testa((hi + 0.01) * lado, y);
              }
            }
            // topo: em 3 deslocamentos laterais, a borda de cima
            for (const lat of [-0.3, 0, 0.3].map(f => f * Math.min(tam.x, tam.z))) {
              const ox = c.x - dx * 6 + px * lat, oz = c.z - dz * 6 + pz * lat;
              let lo = cx.min.y + tam.y * 0.5, hi = cx.max.y + 0.5;
              const h0 = acerta(m, ox, lo, oz, dx, dz);
              if (!h0 || h0 === 'outra') continue;
              for (let it = 0; it < 22; it++) {
                const mid = (lo + hi) / 2, h1 = acerta(m, ox, mid, oz, dx, dz);
                if (h1 && h1 !== 'outra') lo = mid; else hi = mid;
              }
              testa(lat, hi + 0.01);
            }
          }
        }
      }
      /* POR BAIXO do totem: retas rasantes ao chão debaixo dele — a caixa de
         bala assenta abaixo da base desenhada, e sem o desenho ir junto a
         bala parava no ar na fresta (71 de 6 009, laudo f672d81) */
      {
        const res = out.totemFogos; res.baixo = 0; res.baixoAr = 0; res.exBaixo = null;
        const tm = grupos.totemFogos, bb = new T.Box3(), base = G.MapToys.spots.fireworks.y + 0.05;
        for (const m of tm) bb.expandByObject(m);
        bb.getCenter(c);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          for (let lat = -0.5; lat <= 0.5; lat += 0.1) {
            const ox = c.x - dx * 6 + (dz ? lat : 0), oz = c.z - dz * 6 + (dx ? lat : 0);
            // o chão mais BAIXO debaixo do totem nesta travessia (5,45–6,55 m)
            let gmin = Infinity;
            for (let sp = 5.45; sp <= 6.55; sp += 0.05) gmin = Math.min(gmin, G.heightAt(ox + dx * sp, oz + dz * sp));
            // a faixa entre o chão e a BASE das caixas empilhadas: com o pedestal
            // desenhado a reta pega a malha; sem ele, só a caixa de bala
            for (let y = gmin + 0.01; y < base; y += 0.01) {
              let rente = true;   // a aproximação não pode entrar no chão
              for (let sp = 0; sp <= 5.4 && rente; sp += 0.1) if (y < G.heightAt(ox + dx * sp, oz + dz * sp) + 0.01) rente = false;
              if (!rente) continue;
              res.baixo++;
              o.set(ox, y, oz); d.set(dx, 0, dz); rc.set(o, d); rc.near = 0; rc.far = 7.5;
              const hm = rc.intersectObjects(todas, false)[0];
              const tp = MP.rayBlockedAt(o, d, 7.5);
              if (tp < 7.5 - 0.15 && !(hm && hm.distance <= tp + 0.05)) { res.baixoAr++; if (!res.exBaixo) res.exBaixo = { o: [ox, y, oz].map(v => +v.toFixed(3)), produto: +tp.toFixed(3) }; }
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
    it(`${nome}: rente à borda desenhada (1 cm por fora, de 36 lados, lado e topo), a bala não para no ar`, t => {
      const x = r[nome];
      t.diagnostic(`${x.renteAr} de ${x.rente} retas rentes paradas no ar${x.exRente ? ' — ex.: ' + JSON.stringify(x.exRente) : ''}`);
      // a carreta fica quase toda atrás das rodas e do cano: menos retas rentes só dela
      assert.ok(x.rente >= (nome === 'canhaoCarreta' ? 36 : 120), `cenário: só ${x.rente} retas rentes`);
      assert.equal(x.renteAr, 0, `a bala parou no ar rente à borda em ${x.renteAr} de ${x.rente}`);
    });
  }

  it('totemFogos: por baixo, rente ao chão, a bala não para no ar (a fresta da base)', t => {
    const x = r.totemFogos;
    t.diagnostic(`${x.baixoAr} de ${x.baixo} retas rasantes por baixo paradas no ar${x.exBaixo ? ' — ex.: ' + JSON.stringify(x.exBaixo) : ''}`);
    assert.ok(x.baixo >= 10, `cenário: só ${x.baixo} retas na faixa entre o chão e a base`);
    assert.equal(x.baixoAr, 0, `a bala parou no ar debaixo do totem em ${x.baixoAr} de ${x.baixo}`);
  });

  it('boot limpo: sem erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
