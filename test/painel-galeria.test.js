/* ================================================================
   O PAINEL DO CAMPO DE TIRO É PAREDE — laudo d381d29, §2c. Lado do jogo.

   • PARIDADE: o canhão e as atrações do cliente estão onde o Node (o bot)
     calcula pela semente, e o painel do cliente é a parede que o bot usa.
   • BALA: toda reta que cruza o painel DESENHADO para nele no `rayBlockedAt`
     (o do tiro, da vítima e da assistência). Âncora: o raycast do three na
     malha desenhada, e o desenho de sempre (9 × 3,4 × 0,4 m, 2 m atrás do
     ponto, topo 3,4 m acima dele).
   • CORPO: andando contra o painel, de oito lados, o jogador não entra nem
     atravessa.

   Porta 4157.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const url = require('node:url');
const { CHROME, bootGame } = require('./helpers/harness.js');
const Bots = require('../scripts/bots.js');

const PORT = 4157;
const imp = f => import(url.pathToFileURL(path.join(__dirname, '..', 'js', f)).href);

describe('o painel do campo de tiro é parede', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, cli, node;
  before(async () => {
    h = await bootGame({ port: PORT });
    cli = await h.play(() => {
      const G = window.__game;
      const s = G.MapToys.spots, c = G.Cannon.spot;
      const w = G.Structures.walls.find(x => x.atracao === 'galeria');
      return { seed: window.__MP_init && window.__MP_init.worldSeed, spots: s, canhao: { x: c.x, z: c.z },
        painel: w ? { x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1, z0: w.z0, z1: w.z1 } : null };
    });
    const [Ob, Toys, Par] = await Promise.all([imp('obstaculos.js'), imp('maptoys-core.js'), imp('paredes.js')]);
    const t = await Bots.createBotTerrain(cli.seed);
    const { plano } = Par.construirMundoSolido({ worldSeed: cli.seed, heightAt: t.heightAt, slopeAt: t.slopeAt,
      WATER_LEVEL: t.WATER_LEVEL, CITY: t.CITY });
    const atracoes = Ob.atracoesDaSemente({ worldSeed: cli.seed, heightAt: t.heightAt, slopeAt: t.slopeAt, biomeAt: t.biomeAt,
      WATER_LEVEL: t.WATER_LEVEL, CITY: t.CITY, sitios: plano.sites });
    node = { atracoes, painel: Toys.paredesDasAtracoes(atracoes, t.heightAt)[0] };
  });
  after(async () => { if (h) await h.close(); });

  it('paridade: canhão, atrações e painel do cliente = os do Node pela semente', () => {
    const perto = (a, b, nome) => assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-6,
      `${nome}: cliente (${a.x.toFixed(2)}, ${a.z.toFixed(2)}) × Node (${b.x.toFixed(2)}, ${b.z.toFixed(2)})`);
    perto(cli.canhao, node.atracoes.canhao, 'canhão');
    perto(cli.spots.tramp, node.atracoes.cama, 'cama elástica');
    perto(cli.spots.gallery, node.atracoes.galeria, 'campo de tiro');
    perto(cli.spots.fireworks, node.atracoes.fogos, 'fogos');
    perto(cli.spots.xylo, node.atracoes.xilofone, 'xilofone');
    assert.ok(cli.painel, 'o cliente não tem o painel entre as paredes');
    for (const k of ['x0', 'x1', 'y0', 'y1', 'z0', 'z1'])
      assert.ok(Math.abs(cli.painel[k] - node.painel[k]) < 1e-6, `painel.${k}: cliente ${cli.painel[k]} × Node ${node.painel[k]}`);
  });

  it('bala: toda reta que cruza o painel desenhado para nele', async t => {
    const r = await h.play(() => {
      const G = window.__game, MP = window.__MP, T = MP.THREE;
      const m = MP.scene.getObjectByName('painelGaleria');
      const g = G.MapToys.spots.gallery;
      m.updateMatrixWorld(true);
      const bb = new T.Box3().setFromObject(m);   // malha rígida: a caixa vale
      const rc = new T.Raycaster(), o = new T.Vector3(), d = new T.Vector3(), alvo = new T.Vector3();
      const out = { desenho: { larg: bb.max.x - bb.min.x, esp: bb.max.z - bb.min.z, topo: bb.max.y - g.y, atras: g.z - (bb.min.z + bb.max.z) / 2 },
        retas: 0, passou: 0, cedo: 0, pior: 0, outros: 0 };
      const lado = m.material.side; m.material.side = T.DoubleSide;
      for (const frente of [1, -1]) {
        for (let i = 0; i < 9; i++) {
          for (let k = 0; k < 4; k++) {
            for (const ang of [-0.5, 0, 0.5]) {
              alvo.set(bb.min.x + 0.3 + i * (bb.max.x - bb.min.x - 0.6) / 8, g.y + 0.4 + k * 0.8, (bb.min.z + bb.max.z) / 2);
              o.set(alvo.x + Math.sin(ang) * 8, alvo.y + 0.3, alvo.z + frente * Math.cos(ang) * 8);
              d.copy(alvo).sub(o); const len = d.length() + 4; d.normalize();
              rc.set(o, d); rc.near = 0; rc.far = len;
              const hit = rc.intersectObject(m, false)[0];
              if (!hit) continue;
              /* outro sólido na frente não é o painel: fora da conta a reta que
                 passa rente ao relevo (< 0,3 m) ou pelo círculo de um obstáculo
                 (tronco, pedra) antes de chegar nele */
              let outro = false;
              for (let s = 0; s < hit.distance && !outro; s += 0.25) {
                const px = o.x + d.x * s, py = o.y + d.y * s, pz = o.z + d.z * s;
                if (py < MP.heightAt(px, pz) + 0.3) outro = true;
                for (const ob of G.obstaclesNear(px, pz) || [])
                  if (Math.hypot(ob.x - px, ob.z - pz) < ob.r + 0.3) outro = true;
              }
              if (outro) { out.outros++; continue; }
              out.retas++;
              const tB = MP.rayBlockedAt(o, d, len);
              if (!(tB < len - 0.01)) { out.passou++; continue; }
              const erro = Math.abs(tB - hit.distance);
              if (erro > out.pior) out.pior = erro;
              if (tB < hit.distance - 0.15) out.cedo++;
            }
          }
        }
      }
      m.material.side = lado;
      return out;
    });
    t.diagnostic(`desenho ${r.desenho.larg.toFixed(2)} × ${r.desenho.esp.toFixed(2)} m, topo +${r.desenho.topo.toFixed(2)}, ${r.desenho.atras.toFixed(2)} m atrás; ` +
      `${r.retas} retas (${r.outros} fora: outro sólido antes), ${r.passou} passaram, ${r.cedo} pararam antes, pior ${r.pior.toFixed(3)} m`);
    // o desenho de sempre (independente do painelDaGaleria)
    assert.ok(Math.abs(r.desenho.larg - 9) < 1e-3 && Math.abs(r.desenho.esp - 0.4) < 1e-3, 'o painel desenhado não é 9 × 0,4 m');
    assert.ok(Math.abs(r.desenho.topo - 3.4) < 1e-3 && Math.abs(r.desenho.atras - 2) < 1e-3, 'o painel desenhado saiu do lugar');
    assert.ok(r.retas >= 100, `cenário: ${r.retas} retas`);
    assert.equal(r.passou, 0, `${r.passou} de ${r.retas} retas atravessaram o painel desenhado`);
    assert.equal(r.cedo, 0, `${r.cedo} retas pararam > 15 cm antes do painel desenhado`);
  });

  it('corpo: andando contra o painel, de oito lados, o jogador não entra nem atravessa', async t => {
    const r = await h.play(() => {
      const G = window.__game, MP = window.__MP, QA = window.QA, cam = MP.camera;
      const w = G.Structures.walls.find(x => x.atracao === 'galeria');
      const zc = (w.z0 + w.z1) / 2;
      let dentro = 0, cruzou = 0, quadros = 0;
      for (let k = 0; k < 8; k++) {
        const frente = k < 4 ? 1 : -1;
        const x = w.x0 + 0.8 + (k % 4) * (w.x1 - w.x0 - 1.6) / 3;
        QA.reset(x, zc + frente * 3);
        QA.tick(10);
        const lado0 = Math.sign(MP.player.pos.z - zc);
        const yaw = frente > 0 ? 0 : Math.PI;   // de frente para o painel
        for (let f = 0; f < 120; f++) {
          cam.rotation.set(0, yaw + (f % 40 - 20) * 0.01, 0, 'YXZ');
          if (MP.player.yaw !== undefined) MP.player.yaw = cam.rotation.y;
          G.keys.KeyW = true; QA.tick(1); quadros++;
          const P = MP.player.pos;
          if (P.x > w.x0 && P.x < w.x1 && P.z > w.z0 && P.z < w.z1) dentro++;
          if (P.x > w.x0 && P.x < w.x1 && Math.sign(P.z - zc) !== lado0) cruzou++;
        }
        G.keys.KeyW = false; QA.tick(2);
      }
      return { dentro, cruzou, quadros };
    });
    t.diagnostic(`${r.quadros} quadros; centro dentro do painel em ${r.dentro}; do outro lado em ${r.cruzou}`);
    assert.equal(r.dentro, 0, `o jogador entrou no painel em ${r.dentro} quadros`);
    assert.equal(r.cruzou, 0, `o jogador atravessou o painel em ${r.cruzou} quadros`);
  });

  it('boot limpo: sem erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
