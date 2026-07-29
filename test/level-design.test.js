/* ================================================================
   QA — HIGIENE DE LEVEL DESIGN: nada flutuando, nada sem colisão.

   Complementa test/entities.test.js, que só varre inimigos, animais,
   pickups, veículos e bosses. Aqui entram as categorias que ficavam de
   fora (baús, atrações, props GLB dos POIs, barris) e os dois registros
   de colisão que nasciam VAZIOS:

     - escombros da cidade destruída (ruinWalls entram em Structures.walls
       só no destroy(), depois do loop de corpos CANNON do boot);
     - barris dos POIs (só tinham círculo de obstáculo, sem corpo).

   Sem corpo CANNON o jogador e a bala param, mas o CARRO ATRAVESSA.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

describe('Higiene de level design', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: 3710 });
    // os POIs (mercado/refúgio/barris) entram no mundo por await de GLB
    await h.page.waitForFunction(
      "window.__game.Structures.sites.some(s => s.type === 'mercado')",
      { timeout: 90000 },
    );
    await h.play(() => window.QA.tick(60));
  });
  after(async () => { if (h) await h.close(); });

  /* corpo CANNON "de verdade" perto de um ponto: ignora o heightfield do
     terreno e as lajes gigantes de rua, que cobrem meio mapa. */
  const HELPERS = () => {
    const world = window.QA.MP.world;
    return (x, z, raio) => {
      for (const b of world.bodies) {
        const a = b.aabb;
        if (!a) continue;
        if (a.upperBound.x - a.lowerBound.x > 60) continue;
        if (a.upperBound.z - a.lowerBound.z > 60) continue;
        if (Math.hypot(b.position.x - x, b.position.z - z) < raio) return b;
      }
      return null;
    };
  };

  it('dada a cidade destruída, então cada escombro tem corpo CANNON (carro não atravessa)', async () => {
    const r = await h.play(fonte => {
      const perto = new Function('return ' + fonte)()();
      const G = window.QA.G, world = window.QA.MP.world;
      const city = G.Structures.city;
      const antes = new Set(world.bodies);          // identidade, não posição:
      city.destroy();                               // os prédios restaurados voltam
      const novos = new Set();                      // pros MESMOS (x,z) dos escombros
      const escombros = G.Structures.walls.filter(w => w.cityRuin).map(w => {
        const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
        const b = perto(cx, cz, 2);
        if (b && !antes.has(b)) novos.add(b);
        return { x: +cx.toFixed(1), z: +cz.toFixed(1),
          larg: +(w.x1 - w.x0).toFixed(1), alt: +(w.y1 - w.y0).toFixed(1),
          temCorpo: !!(b && !antes.has(b)) };
      });
      city.restore();
      // os corpos que entraram no destroy têm de sair no restore
      const vivos = world.bodies.filter(b => novos.has(b)).length;
      return { escombros, vivos, nNovos: novos.size };
    }, HELPERS.toString());
    assert.ok(r.escombros.length >= 6, `sem escombros pra testar (${r.escombros.length})`);
    const semCorpo = r.escombros.filter(e => !e.temCorpo);
    assert.deepEqual(semCorpo, [],
      `escombros sem corpo CANNON (carro atravessa):\n${JSON.stringify(semCorpo, null, 1)}`);
    assert.equal(r.vivos, 0, 'corpo fantasma de escombro sobrou com a cidade intacta');
  });

  it('dados os barris dos POIs, então cada um tem corpo CANNON (carro não atravessa)', async () => {
    // os POIs (mercado/refúgio/barris) nascem num bloco ASYNC de GLB depois do
    // boot; com a integração o boot ficou mais pesado e o teste chegava antes
    // do barril existir — espere a prontidão em vez de amostrar no escuro.
    await h.page.waitForFunction(() => {
      const G = window.QA && window.QA.G;
      if (!G) return false;
      const m = G.Structures.sites.find(s => s.type === 'mercado');
      return !!m && G.obstaclesNear(m.x + 5, m.z + 4)
        .some(o => o.sourceId === 'barrel');
    }, { timeout: 30000, polling: 500 });
    const r = await h.play(fonte => {
      const perto = new Function('return ' + fonte)()();
      const G = window.QA.G;
      const sites = G.Structures.sites;
      const m = sites.find(s => s.type === 'mercado');
      const t = sites.find(s => s.type === 'refúgio');
      const spots = [];
      if (m) spots.push([m.x + 5, m.z + 4], [m.x - 6, m.z + 2], [m.x + 3, m.z - 6]);
      if (t) spots.push([t.x + 4, t.z + 2], [t.x - 3, t.z - 4], [t.x + 2, t.z - 5]);
      return spots.map(([x, z]) => ({ x: +x.toFixed(1), z: +z.toFixed(1),
        temObstaculo: G.obstaclesNear(x, z).some(o => Math.hypot(o.x - x, o.z - z) < 0.1),
        temCorpo: !!perto(x, z, 1.2) }));
    }, HELPERS.toString());
    assert.ok(r.length >= 3, `sem barris pra testar (${r.length})`);
    assert.ok(r.every(b => b.temObstaculo), 'pré-condição falhou: barril sem círculo de obstáculo');
    const semCorpo = r.filter(b => !b.temCorpo);
    assert.deepEqual(semCorpo, [],
      `barris sem corpo CANNON (carro atravessa):\n${JSON.stringify(semCorpo, null, 1)}`);
  });

  it('dado o chão das ruínas, então ele acompanha o terreno (não fica laje voando)', async () => {
    const r = await h.play(() => {
      const G = window.QA.G, MP = window.QA.MP, THREE = MP.THREE;
      const city = G.Structures.city;
      city.destroy();
      const grupo = MP.scene.getObjectByName('cidadeDestruida');
      // o chão é a única malha translúcida do grupo (decalque escuro do solo)
      let chao = null;
      grupo.traverse(o => {
        if (!chao && o.isMesh && o.name === 'chaoRuinas') chao = o;
        if (!chao && o.isMesh && o.material && o.material.transparent && o.material.opacity < 1) chao = o;
      });
      if (!chao) { city.restore(); return { semChao: true }; }
      const ray = new THREE.Raycaster();
      const dir = new THREE.Vector3(0, -1, 0);
      const piores = [];
      const c = G.Structures.city.center;
      for (let raio = 6; raio <= 84; raio += 6) {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
          const x = c.x + Math.cos(a) * raio, z = c.z + Math.sin(a) * raio;
          ray.set(new THREE.Vector3(x, 400, z), dir);
          const hit = ray.intersectObject(chao, false)[0];
          if (!hit) continue;
          const dy = hit.point.y - MP.heightAt(x, z);
          piores.push({ x: +x.toFixed(1), z: +z.toFixed(1), dy: +dy.toFixed(2) });
        }
      }
      city.restore();
      piores.sort((p, q) => Math.abs(q.dy) - Math.abs(p.dy));
      return { amostras: piores.length, pior: piores[0], top: piores.slice(0, 8) };
    });
    assert.ok(!r.semChao, 'malha do chão das ruínas não encontrada');
    assert.ok(r.amostras > 100, `varredura rala demais (${r.amostras})`);
    assert.ok(Math.abs(r.pior.dy) <= 0.6,
      `chão das ruínas descolado do terreno (máx ${r.pior.dy} m):\n${JSON.stringify(r.top, null, 1)}`);
  });

  it('dadas as categorias fora do entities.test, então nada nasce voando/enterrado', async () => {
    const v = await h.play(() => {
      const G = window.QA.G, MP = window.QA.MP;
      const out = [];
      const checa = (grupo, nome, x, z, y, min, max) => {
        const dy = y - MP.groundAt(x, z, y + 2);
        if (dy < min || dy > max)
          out.push({ grupo, nome, x: +x.toFixed(1), z: +z.toFixed(1), dy: +dy.toFixed(2) });
      };
      for (const s of G.Structures.chestSpots)
        checa('baú', 'baú-solo', s.x, s.z, MP.heightAt(s.x, s.z), -0.5, 0.5);
      const MT = G.MapToys;
      if (MT && MT.spots) for (const [k, s] of Object.entries(MT.spots))
        if (s) checa('atração', k, s.x, s.z, s.y != null ? s.y : MP.heightAt(s.x, s.z), -0.5, 0.5);
      const CN = G.Cannon;
      if (CN && CN.spot) checa('atração', 'canhão', CN.spot.x, CN.spot.z,
        CN.spot.y != null ? CN.spot.y : MP.heightAt(CN.spot.x, CN.spot.z), -0.5, 0.5);
      for (const s of G.Structures.sites)
        if (s.type === 'mercado' || s.type === 'refúgio')
          checa('prop GLB', s.type, s.x, s.z, MP.heightAt(s.x, s.z), -0.5, 0.5);
      for (const sk of (G.Skeletons && G.Skeletons.list) || [])
        if (sk.alive && sk.group)
          checa('esqueleto', 'esqueleto', sk.group.position.x, sk.group.position.z,
            sk.group.position.y, -0.8, 1.5);
      for (const n of (G.Night && G.Night.list) || [])
        if (n.alive && n.group)
          checa('noturno', n.kind || 'noturno', n.group.position.x, n.group.position.z,
            n.group.position.y, -1.0, 1.5);
      return out;
    });
    assert.deepEqual(v, [], `objetos fora do chão:\n${JSON.stringify(v, null, 1)}`);
  });
});
