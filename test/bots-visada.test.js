'use strict';

/* ================================================================
   Visada dos bots contra o RELEVO REAL (B6) e sem terreno (B12c) —
   docs/mobile/criterio-aaa.md e o laudo docs/mobile/validacao-7515734.md.

   B6: o laudo mediu, na seed 424242, que dos pares humano/bot que o terreno
   do CLIENTE esconde o bot enxergava 0,44 % (1,21 % contra marcha fina de
   5 cm): a marcha de 2 m da `lineOfSight` pulava cristas finas. A âncora aqui
   não é a `lineOfSight` do bot: é a marcha do CLIENTE (o trecho de terreno de
   `rayBlockedAt`, game.js — passo de 1,6 m) e uma marcha de 5 cm escrita neste
   arquivo, as duas sobre o MESMO `heightAt` que o bot reconstrói da seed.

   B12(c): sem terreno o bot não pode ficar onisciente em silêncio. Contrato
   escolhido: sem terreno NÃO há linha de visada — o bot não enxerga ninguém
   (ouve tiro e persegue, mas não atira: atirar exige ver). Falha barulhenta
   no log (`[bots] terreno indisponível …`) e comportamento seguro no jogo.
   ================================================================ */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const Bots = require(path.join(__dirname, '..', 'scripts', 'bots.js'));
const { mulberry32 } = require(path.join(__dirname, '..', 'server.js'));

const SEED = 424242;
const EYE = 1.5, HEAD = 1.6, TRUNK = 1.0;
const f2 = x => (Number.isFinite(x) ? x.toFixed(2) : String(x));
const pct = (a, b) => (b ? (100 * a / b).toFixed(2) : '—') + ' %';

/* O trecho de TERRENO do `rayBlockedAt` do cliente (game.js): passo de 1,6 m
   a partir de `step`, enquanto d < comprimento; bloqueia se y < heightAt. */
function clientBlocked(terrain, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  const step = 1.6;
  for (let d = step; d < len; d += step) {
    const k = d / len;
    if (from.y + dy * k < terrain.heightAt(from.x + dx * k, from.z + dz * k)) return true;
  }
  return false;
}

/* Marcha uniforme de `step` metros (no plano) sobre o segmento inteiro. */
function marchBlocked(terrain, from, to, step) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / step));
  for (let i = 1; i < n; i++) {
    const k = i / n;
    if (terrain.heightAt(from.x + dx * k, from.z + dz * k) > from.y + dy * k) return true;
  }
  return false;
}

/* Pares bot/humano espalhados pelo mapa da seed: bot em ±480 m, humano a
   5–100 m numa direção qualquer (100 m = alcance de visão do bot). */
function makePairs(terrain, n, seed = 7) {
  const r = mulberry32(seed);
  const pairs = [];
  while (pairs.length < n) {
    const bx = (r() * 2 - 1) * 480, bz = (r() * 2 - 1) * 480;
    const a = r() * Math.PI * 2, d = 5 + r() * 95;
    const hx = bx + Math.sin(a) * d, hz = bz + Math.cos(a) * d;
    if (Math.abs(hx) > 540 || Math.abs(hz) > 540) continue;
    const by = terrain.heightAt(bx, bz), hy = terrain.heightAt(hx, hz);
    pairs.push({
      eye: { x: bx, y: by + EYE, z: bz },
      head: { x: hx, y: hy + HEAD, z: hz },
      trunk: { x: hx, y: hy + TRUNK, z: hz },
    });
  }
  return pairs;
}

describe('Bots: visada contra o relevo real da seed (B6) e sem terreno (B12c)', () => {
  let terrain = null, pairs = null;
  const table = [];
  before(async () => {
    terrain = await Bots.createBotTerrain(SEED);
    pairs = makePairs(terrain, 30000);
    for (const p of pairs) {
      table.push({
        client: clientBlocked(terrain, p.eye, p.head) && clientBlocked(terrain, p.eye, p.trunk),
        fine: marchBlocked(terrain, p.eye, p.head, 0.05) && marchBlocked(terrain, p.eye, p.trunk, 0.05),
        fineVisible: !marchBlocked(terrain, p.eye, p.head, 0.05) || !marchBlocked(terrain, p.eye, p.trunk, 0.05),
        old2m: marchBlocked(terrain, p.eye, p.head, 2) && marchBlocked(terrain, p.eye, p.trunk, 2),
        bot: Bots.lineOfSight(terrain, p.eye, p.head) || Bots.lineOfSight(terrain, p.eye, p.trunk),
      });
    }
  });

  it('a grade de altura do bot é a do cliente (CFG.WORLD_SIZE / CFG.TERRAIN_SEGS)', async () => {
    const { CFG } = await import(path.join(__dirname, '..', 'js', 'config.js'));
    const segs = CFG.TERRAIN_SEGS, half = CFG.WORLD_SIZE / 2, cell = CFG.WORLD_SIZE / segs;
    // (segs + 1)² vértices: o último existe, o seguinte não
    assert.ok(Number.isFinite(terrain.sampleAt(segs, segs)), 'a grade do bot tem menos vértices que a do cliente');
    assert.equal(terrain.sampleAt(0, segs + 1), undefined, 'a grade do bot tem mais vértices que a do cliente');
    // e o vértice (i, j) mora em (−half + i·cell, −half + j·cell)
    for (const [i, j] of [[3, 7], [110, 110], [57, 190], [219, 2]]) {
      const x = -half + i * cell, z = -half + j * cell;
      assert.ok(Math.abs(terrain.heightAt(x, z) - terrain.sampleAt(i, j)) < 1e-4,
        `vértice (${i}, ${j}) fora do lugar: heightAt ${terrain.heightAt(x, z)} × grade ${terrain.sampleAt(i, j)}`);
    }
  });

  it('B6: nenhum par que o terreno do CLIENTE esconde é visto pelo bot (cabeça e tronco)', (t) => {
    const hidden = table.filter(r => r.client);
    const seen = hidden.filter(r => r.bot).length;
    const old = hidden.filter(r => !r.old2m).length;
    t.diagnostic(`seed ${SEED}, ${pairs.length} pares: o cliente esconde ${hidden.length}; o bot vê ${seen} (${pct(seen, hidden.length)}); a marcha antiga de 2 m veria ${old} (${pct(old, hidden.length)})`);
    assert.ok(hidden.length > 3000, `o cenário não exercita o relevo: só ${hidden.length} pares escondidos`);
    assert.equal(seen, 0, `o bot enxerga ${seen} de ${hidden.length} pares que o terreno do cliente esconde`);
  });

  it('B6: nenhum par escondido pela marcha fina de 5 cm é visto pelo bot (as cristas que o passo de 1,6 m também pula)', (t) => {
    const hidden = table.filter(r => r.fine);
    const seen = hidden.filter(r => r.bot).length;
    const old = hidden.filter(r => !r.old2m).length;
    const clientMiss = hidden.filter(r => !r.client).length;
    t.diagnostic(`marcha de 5 cm esconde ${hidden.length}; o bot vê ${seen} (${pct(seen, hidden.length)}); a marcha de 2 m veria ${old} (${pct(old, hidden.length)}); o próprio cliente (1,6 m) veria ${clientMiss}`);
    assert.equal(seen, 0, `o bot enxerga ${seen} de ${hidden.length} pares que a marcha de 5 cm esconde`);
  });

  it('controle: o bot vê o que está à vista — a correção não é um bot cego', (t) => {
    const visible = table.filter(r => r.fineVisible);
    const blind = visible.filter(r => !r.bot).length;
    t.diagnostic(`à vista pela marcha de 5 cm: ${visible.length}; o bot não vê ${blind} (${pct(blind, visible.length)})`);
    assert.ok(visible.length > 10000, `poucos pares à vista: ${visible.length}`);
    // cristas que furam a reta entre duas amostras de 5 cm: a marcha fina não
    // as vê, a visada exata sim. Medido na seed 424242: são 3 pares, e uma
    // marcha de 0,5 mm confirma o chão 0,1–1,05 mm ACIMA da reta da cabeça
    // nos três — é o único desacordo admissível, e é raro
    assert.ok(blind <= visible.length * 0.001, `o bot ficou cego para ${blind} de ${visible.length} pares à vista`);
  });

  it('custo a 10 Hz: 16 bots + 4 humanos em combate no relevo real cabem folgados no passo de 100 ms', (t) => {
    // área de 110 × 110 m perto do centro: todo mundo a < 100 m de todo mundo
    let calls = 0;
    const counted = Object.assign(Object.create(Object.getPrototypeOf(terrain)), terrain, {
      heightAt: (x, z) => { calls++; return terrain.heightAt(x, z); },
    });
    const world = Bots.createBotWorld();
    world.terrain = counted;
    world.plan = { zone: [] };
    const rng = mulberry32(99);
    const layout = mulberry32(5);
    const sock = { emit: () => {}, volatile: { emit: () => {} }, timeout: () => ({ emit: () => {} }) };
    const weapons = ['FUZIL', 'ESCOPETA', 'DMR', 'PLASMA', 'SNIPER', 'FUZIL', 'DMR', 'FUZIL'];
    for (let i = 0; i < 16; i++) {
      const b = Bots.createBotState(i, sock, rng);
      Bots.resetBotForMatch(b);
      const x = 60 + layout() * 110, z = -40 + layout() * 110;
      Object.assign(b, { id: `b${i}`, phase: 'PLAY', x, z, y: terrain.heightAt(x, z), weapon: weapons[i % weapons.length], ammo: 1e6, hp: 1e9, yaw: layout() * 6.28 });
      world.bots.push(b);
    }
    const humans = [0, 1, 2, 3].map(i => ({ id: `h${i}`, x: 60 + layout() * 110, z: -40 + layout() * 110 }));
    const ms = [], perTick = [];
    for (let k = 0; k < 600; k++) {
      const tt = k / 10;
      for (const h of humans) {
        h.x += Math.sin(tt + h.z) * 0.3; h.z += Math.cos(tt + h.x) * 0.3;
        Bots.observePlayerUpdate(world.observedPlayers, { id: h.id, pos: [h.x, terrain.heightAt(h.x, h.z), h.z], rotY: 0 });
      }
      calls = 0;
      const t0 = process.hrtime.bigint();
      Bots.tickBots(world, tt, rng);
      ms.push(Number(process.hrtime.bigint() - t0) / 1e6);
      perTick.push(calls);
    }
    const sorted = ms.slice(20).sort((a, b) => a - b); // descarta o aquecimento do JIT
    const q = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    const meanCalls = perTick.reduce((a, b) => a + b, 0) / perTick.length;
    t.diagnostic(`tickBots com 16 bots + 4 humanos: p50 ${f2(q(0.5))} ms, p99 ${f2(q(0.99))} ms, máx ${f2(sorted[sorted.length - 1])} ms; heightAt por tick: média ${meanCalls.toFixed(0)}, máx ${Math.max(...perTick)}`);
    // D5 exige p99 < 100 ms no processo real; aqui metade do passo, para
    // sobrar para o socket e para a máquina carregada
    assert.ok(q(0.99) < 50, `o tick dos bots custa ${f2(q(0.99))} ms no p99 (passo de 100 ms)`);
  });

  it('B12(c): sem terreno não há linha de visada — o contrato está escrito na função', () => {
    const a = { x: 0, y: 1.5, z: 0 }, b = { x: 0, y: 1.6, z: 20 };
    assert.equal(Bots.lineOfSight(null, a, b), false, 'sem terreno o bot enxerga através de tudo');
    assert.equal(Bots.lineOfSight(undefined, a, b), false);
    assert.equal(Bots.lineOfSight({}, a, b), false, 'terreno sem heightAt não é terreno');
    assert.equal(Bots.lineOfSight({ heightAt: () => 0 }, a, b), true, 'controle: chão plano de verdade é visível');
  });

  it('B12(c): no laço real, sem terreno o bot não vira nem atira em quem está à frente — nem depois de ouvir o tiro', (t) => {
    const scenario = (terr, seed) => {
      const world = Bots.createBotWorld();
      world.terrain = terr;
      world.plan = { zone: [] };
      const rng = mulberry32(seed);
      const shots = [];
      const sock = {
        emit: (ev, p) => { if (ev === 'shotHit' || ev === 'shotFired') shots.push(ev); },
        volatile: { emit: () => {} }, timeout: () => ({ emit: () => {} }),
      };
      const b = Bots.createBotState(0, sock, rng);
      Bots.resetBotForMatch(b);
      Object.assign(b, { id: 'b0', phase: 'PLAY', x: 0, z: 0, y: 0, weapon: 'FUZIL', ammo: 1e6, hp: 1e9, mira: 0.9, yaw: Math.PI, wp: [0, 500] });
      world.bots.push(b);
      for (let k = 0; k < 120; k++) {
        const tt = k / 10;
        Bots.observePlayerUpdate(world.observedPlayers, { id: 'h', pos: [0, 0, 20 + b.z], rotY: 0 });
        if (k === 50) Bots.onPlayerFired(world, b, { shooterId: 'h', fromPos: [0, 1.5, 20 + b.z], toPos: [0, 0, 60] }, tt);
        Bots.tickBots(world, tt, rng);
      }
      return shots.length;
    };
    let blindShots = 0, flatEngaged = 0;
    for (let seed = 1; seed <= 20; seed++) {
      blindShots += scenario(null, seed);
      if (scenario({ heightAt: () => 0 }, seed) > 0) flatEngaged++;
    }
    t.diagnostic(`sem terreno: ${blindShots} disparos em 20 × 12 s; com chão plano: engajou em ${flatEngaged}/20`);
    assert.equal(flatEngaged, 20, 'controle: com chão plano o bot tinha de atirar no humano à frente');
    assert.equal(blindShots, 0, `sem terreno o bot atirou ${blindShots} vezes (enxerga através de tudo)`);
  });
});
