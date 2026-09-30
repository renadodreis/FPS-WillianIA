/* ================================================================
   AS ATRAÇÕES PELA SEMENTE, E O PAINEL DO CAMPO DE TIRO COMO PAREDE
   (laudo d381d29, §2c) — lado Node, sem porta.

   O painel (9 × 3,4 m) não segurava bala: no caminho real o bot deu 10
   acertos (140 de dano) num humano que a tela escondia atrás dele. E ele
   não PODIA saber do painel: o lugar das atrações saía do `Structures.sites`
   ao vivo do cliente, que ganha o mercado quando o GLB dele chega.

   Âncoras independentes: o relevo amostrado aqui (passo 0,1 m, não o do
   produto) e segmentos montados à mão contra a caixa desenhada 9 × 0,4 m.
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const url = require('node:url');
const Bots = require('../scripts/bots.js');

const imp = f => import(url.pathToFileURL(path.join(__dirname, '..', 'js', f)).href);
const SEEDS = [424242, 7, 90210];

describe('atrações pela semente', () => {
  let Toys, Ob, Par, CFG;
  const mundos = new Map();
  before(async () => {
    [Toys, Ob, Par, { CFG }] = await Promise.all([imp('maptoys-core.js'), imp('obstaculos.js'), imp('paredes.js'), imp('config.js')]);
    for (const seed of SEEDS) {
      const terrain = await Bots.createBotTerrain(seed);
      const { plano } = Par.construirMundoSolido({ worldSeed: seed, heightAt: terrain.heightAt, slopeAt: terrain.slopeAt,
        WATER_LEVEL: terrain.WATER_LEVEL, CITY: terrain.CITY });
      mundos.set(seed, { terrain, plano });
    }
  });

  it('o atalho do bot (atracoesDaSemente) dá as MESMAS atrações do construirObstaculos do cliente', () => {
    for (const [seed, { terrain, plano }] of mundos) {
      const t = terrain;
      const cheio = Ob.construirObstaculos({ worldSeed: seed, heightAt: t.heightAt, slopeAt: t.slopeAt, biomeAt: t.biomeAt,
        noise: (x, z) => t.simplex.noise(x, z), WATER_LEVEL: t.WATER_LEVEL, CITY: t.CITY, VOLCANO: t.VOLCANO,
        sitios: plano.sites, WORLD_SIZE: CFG.WORLD_SIZE, TREE_COUNT: CFG.TREE_COUNT, ROCK_COUNT: CFG.ROCK_COUNT });
      const curto = Ob.atracoesDaSemente({ worldSeed: seed, heightAt: t.heightAt, slopeAt: t.slopeAt, biomeAt: t.biomeAt,
        WATER_LEVEL: t.WATER_LEVEL, CITY: t.CITY, sitios: plano.sites });
      assert.deepEqual(curto, cheio.atracoes, `semente ${seed}`);
    }
  });

  it('as atrações evitam o mercado e o refúgio (sítios da semente, não os que o GLB acrescenta)', () => {
    for (const [seed, { terrain: t, plano }] of mundos) {
      const pois = Ob.planejarPois({ worldSeed: Par.sementeNormalizada(seed), heightAt: t.heightAt, slopeAt: t.slopeAt,
        biomeAt: t.biomeAt, WATER_LEVEL: t.WATER_LEVEL, sitios: plano.sites });
      const a = Ob.atracoesDaSemente({ worldSeed: seed, heightAt: t.heightAt, slopeAt: t.slopeAt, biomeAt: t.biomeAt,
        WATER_LEVEL: t.WATER_LEVEL, CITY: t.CITY, sitios: plano.sites });
      for (const [nome, p] of Object.entries(a)) {
        for (const s of pois.sitios) {
          const folga = Math.hypot(p.x - s.x, p.z - s.z) - s.r;
          assert.ok(folga > 10, `semente ${seed}: ${nome} a ${folga.toFixed(1)} m da borda do ${s.type}`);
        }
      }
    }
  });

  it('o painel: 9 × 0,4 m, topo 3,4 m acima do ponto, base enterrada abaixo do chão mais baixo da pegada', () => {
    for (const [seed, { terrain: t }] of mundos) {
      const a = Ob.atracoesDaSemente({ worldSeed: seed, heightAt: t.heightAt, slopeAt: t.slopeAt, biomeAt: t.biomeAt,
        WATER_LEVEL: t.WATER_LEVEL, CITY: t.CITY, sitios: mundos.get(seed).plano.sites });
      const [w] = Toys.paredesDasAtracoes(a, t.heightAt);
      const g = a.galeria;
      assert.ok(Math.abs(w.x1 - w.x0 - 9) < 1e-9 && Math.abs(w.z1 - w.z0 - 0.4) < 1e-9, 'medidas do painel');
      assert.ok(Math.abs((w.z0 + w.z1) / 2 - (g.z - 2)) < 1e-9 && Math.abs((w.x0 + w.x1) / 2 - g.x) < 1e-9, 'o painel fica 2 m atrás do ponto');
      assert.ok(Math.abs(w.y1 - (g.y + 3.4)) < 1e-9, 'o topo do painel mudou');
      let chao = Infinity;
      for (let x = w.x0; x <= w.x1 + 1e-9; x += 0.1)
        for (let z = w.z0; z <= w.z1 + 1e-9; z += 0.1) chao = Math.min(chao, t.heightAt(x, z));
      assert.ok(w.y0 <= chao - 0.25, `semente ${seed}: base em ${w.y0.toFixed(2)} com o chão mais baixo em ${chao.toFixed(2)} — flutua`);
    }
  });

  it('o bot não vê através do painel, e vê por cima e pelo lado (cidade de pé e destruída)', async () => {
    for (const [seed, { terrain: t }] of mundos) {
      const solids = await Bots.createBotSolids(seed, t);
      const [w] = Toys.paredesDasAtracoes(solids.atracoes, t.heightAt);
      const cx = (w.x0 + w.x1) / 2, zc = (w.z0 + w.z1) / 2, yTopo = w.y1;
      const olho = (x, dz, y) => ({ x, y, z: zc + dz });
      for (const estado of ['intact', 'destroyed']) {
        const q = solids[estado];
        let barrou = 0, total = 0;
        for (let x = w.x0 + 0.3; x <= w.x1 - 0.3; x += 0.6) {
          for (const h of [0.9, 1.5, yTopo - (t.heightAt(x, zc) + 0.1) > 1.8 ? 2.6 : 1.2]) {
            const y = t.heightAt(x, zc) + h;
            if (y > yTopo - 0.1) continue;
            total++;
            if (q.segmentBlocked(olho(x, 6, y), olho(x + 0.4, -6, y))) barrou++;
          }
        }
        assert.ok(total >= 30, `cenário: ${total} retas`);
        assert.equal(barrou, total, `semente ${seed} (${estado}): ${total - barrou} de ${total} retas atravessaram o painel`);
        // por cima (30 cm acima do topo) e pelo lado (50 cm fora da borda) o bot vê
        assert.equal(q.segmentBlocked(olho(cx, 6, yTopo + 0.3), olho(cx, -6, yTopo + 0.3)), false, 'barrou por cima do painel');
        const yl = t.heightAt(w.x1 + 0.5, zc) + 1.5;
        assert.equal(q.segmentBlocked(olho(w.x1 + 0.5, 6, yl), olho(w.x1 + 0.5, -6, yl)), false, 'barrou ao lado do painel');
      }
    }
  });
});
