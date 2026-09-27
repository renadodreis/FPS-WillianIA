'use strict';

/* ================================================================
   Combate dos bots medido no LAÇO REAL.

   Nada aqui monta um condutor próprio: cada tick chama `tickBots` — a mesma
   função que o `setInterval` de 100 ms de `scripts/bots.js` chama — com um
   socket falso que só GRAVA o que o bot emitiu. O que os bots mandam é tratado
   como o `server.js` trata: `shotHit` tira vida de quem foi acertado e vira
   `playerFired` para os outros; `shotFired` (erro) vira `playerFired` com
   `targetId: null`. O humano é um dublê que só manda `playerUpdate` (e, quando
   o caso pede, atira).

   Referência dos números: docs/mobile/referencia-bots.md, seção 7.
   A queixa medida: "os bots estão apelões" — jogando no celular.
   ================================================================ */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const Bots = require(path.join(__dirname, '..', 'scripts', 'bots.js'));
const { mulberry32 } = require(path.join(__dirname, '..', 'server.js'));

const DT = 0.1;
const HUMAN = 'humano';

function yawTo(from, to) { return Math.atan2(-(to.x - from.x), -(to.z - from.z)); }
function angDiff(a, b) {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}
const DEG = Math.PI / 180;
function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
}
const f2 = x => (Number.isFinite(x) ? x.toFixed(2) : String(x));

/* ---------------- dublê de servidor ---------------- */

/* Chão plano EXPLÍCITO. `terrain: null` não é "chão plano": é o bot sem
   terreno, que por contrato não enxerga ninguém (B12c,
   test/bots-visada.test.js). */
const FLAT = Object.freeze({ heightAt: () => 0 });

function makeSim({ seed, bots, terrain = FLAT, plan = { zone: [] } }) {
  const rng = mulberry32(seed >>> 0);
  const world = Bots.createBotWorld();
  world.terrain = terrain;
  world.plan = plan;
  const out = [];
  const ground = (x, z) => (terrain ? terrain.heightAt(x, z) : 0);
  bots.forEach((spec, i) => {
    const sock = {
      emit: (ev, payload) => out.push({ from: spec.id, ev, payload }),
      volatile: { emit: (ev, payload) => out.push({ from: spec.id, ev, payload, volatile: true }) },
      timeout: () => ({ emit: (ev, payload, cb) => cb && cb(new Error('sem servidor no teste')) }),
    };
    const b = Bots.createBotState(i, sock, rng);
    Bots.resetBotForMatch(b);
    Object.assign(b, {
      id: spec.id, phase: 'PLAY', x: spec.x, z: spec.z, y: ground(spec.x, spec.z),
      weapon: spec.weapon || 'FUZIL', ammo: spec.ammo == null ? 1e6 : spec.ammo,
      hp: spec.hp == null ? 1e9 : spec.hp, // bots imortais: o caso mede o humano
    });
    if (spec.mira != null) b.mira = spec.mira;
    if (spec.yaw != null) b.yaw = spec.yaw;
    if (spec.wp) b.wp = spec.wp.slice();
    world.bots.push(b);
  });
  return { world, rng, out, ground };
}

function botById(sim, id) { return sim.world.bots.find(b => b.id === id); }

/* o servidor difunde `playerFired` para todo mundo menos quem atirou */
function relayFired(sim, shooterId, payload, t) {
  if (typeof Bots.onPlayerFired !== 'function') return;
  for (const b of sim.world.bots) if (b.id !== shooterId) Bots.onPlayerFired(sim.world, b, payload, t);
}

/* humano atira (o dublê): ouvido por todos os bots; se `targetId` é um bot,
   ele leva `youWereHit` como no servidor */
function humanFires(sim, h, t, { targetId = null, dmg = 0, toPos = null } = {}) {
  const hy = sim.ground(h.x, h.z);
  const fromPos = [h.x, hy + 1.5, h.z];
  const tgt = targetId ? botById(sim, targetId) : null;
  const to = tgt ? [tgt.x, tgt.y, tgt.z] : (toPos || [h.x, hy, h.z + 30]);
  relayFired(sim, HUMAN, { shooterId: HUMAN, targetId, weapon: 'FUZIL', fromPos, toPos: to }, t);
  if (tgt && dmg > 0 && typeof Bots.onBotHit === 'function') {
    Bots.onBotHit(sim.world, tgt, { dmg, fromPos, shooterId: HUMAN, shooterNick: 'h', weapon: 'FUZIL' }, t);
  }
}

/* A quem um tiro se dirigia: `shotHit` diz; `shotFired` (erro) não diz, então
   é o candidato de menor ângulo entre a reta do tiro e a reta até ele. */
function shotTarget(sim, e, humanPos) {
  if (e.ev === 'shotHit') return e.payload.targetId;
  const f = e.payload.fromPos, to = e.payload.toPos;
  const dir = [to[0] - f[0], to[2] - f[2]];
  const cands = [];
  if (humanPos) cands.push({ id: HUMAN, x: humanPos.x, z: humanPos.z });
  for (const b of sim.world.bots) if (b.id !== e.from) cands.push({ id: b.id, x: b.x, z: b.z });
  let best = null, bestAng = Infinity;
  for (const c of cands) {
    const v = [c.x - f[0], c.z - f[2]];
    const ang = Math.abs(Math.atan2(dir[0] * v[1] - dir[1] * v[0], dir[0] * v[0] + dir[1] * v[1]));
    if (ang < bestAng) { bestAng = ang; best = c.id; }
  }
  return best;
}

/* Roda o laço real a 10 Hz. `human(t)` devolve {x, z, rotY} (ou null). */
function run(sim, { human, duration, humanHp = 100, stopOnDeath = true, onTick = null }) {
  const res = { hits: [], shots: [], states: new Map(), deathT: null, dmg: 0, humanTrack: [] };
  let hp = humanHp;
  for (let k = 0; k * DT < duration - 1e-9; k++) {
    const t = k / 10;
    const h = human ? human(t) : null;
    if (h) {
      const hy = sim.ground(h.x, h.z);
      Bots.observePlayerUpdate(sim.world.observedPlayers, {
        id: HUMAN, pos: [h.x, hy, h.z], rotY: h.rotY || 0, bot: false,
      });
      res.humanTrack.push({ t, x: h.x, z: h.z });
    }
    if (onTick) onTick(t, sim, h);
    sim.out.length = 0;
    Bots.tickBots(sim.world, t, sim.rng);
    const emitted = sim.out.slice();
    sim.out.length = 0;
    const shotThisTick = new Map(); // bot → registro do tiro (rajada = 1 tiro)
    for (const e of emitted) {
      if (e.volatile) {
        if (e.ev === 'state') {
          if (!res.states.has(e.from)) res.states.set(e.from, []);
          res.states.get(e.from).push({ t, rotY: e.payload.rotY, pos: e.payload.pos.slice() });
        }
        continue;
      }
      if (e.ev !== 'shotHit' && e.ev !== 'shotFired') continue;
      const target = shotTarget(sim, e, h);
      let rec = shotThisTick.get(e.from);
      if (!rec) {
        rec = { t, from: e.from, target, hit: false, dmg: 0 };
        shotThisTick.set(e.from, rec);
        res.shots.push(rec);
      }
      if (e.ev === 'shotHit') {
        rec.hit = true;
        rec.target = e.payload.targetId;
        rec.dmg += e.payload.dmg;
        const victimPos = e.payload.targetId === HUMAN && h
          ? [h.x, sim.ground(h.x, h.z), h.z]
          : (() => { const v = botById(sim, e.payload.targetId); return v ? [v.x, v.y, v.z] : [0, 0, 0]; })();
        relayFired(sim, e.from, {
          shooterId: e.from, targetId: e.payload.targetId, weapon: e.payload.weapon,
          fromPos: e.payload.fromPos, toPos: victimPos,
        }, t);
        if (e.payload.targetId === HUMAN) {
          hp -= e.payload.dmg;
          res.dmg += e.payload.dmg;
          res.hits.push({ t, from: e.from, dmg: e.payload.dmg });
          if (hp <= 0 && res.deathT == null) res.deathT = t;
        } else if (typeof Bots.onBotHit === 'function') {
          const v = botById(sim, e.payload.targetId);
          if (v) Bots.onBotHit(sim.world, v, {
            dmg: e.payload.dmg, fromPos: e.payload.fromPos, shooterId: e.from, weapon: e.payload.weapon,
          }, t);
        }
      } else {
        relayFired(sim, e.from, {
          shooterId: e.from, targetId: null, weapon: e.payload.weapon,
          fromPos: e.payload.fromPos, toPos: e.payload.toPos,
        }, t);
      }
    }
    if (stopOnDeath && res.deathT != null) break;
  }
  return res;
}

/* primeiro instante em que o bot VIROU para o humano (rotY a ≤ 2° dele):
   é o momento visível, para o humano, de "ele me viu" */
function lockOnT(res, botId, lockDeg = 2) {
  const track = new Map(res.humanTrack.map(p => [Math.round(p.t * 10), p]));
  for (const s of res.states.get(botId) || []) {
    const h = track.get(Math.round(s.t * 10));
    if (!h) continue;
    const want = yawTo({ x: s.pos[0], z: s.pos[2] }, h);
    if (angDiff(s.rotY, want) <= lockDeg * DEG) return s.t;
  }
  return null;
}

const firstHitT = res => (res.hits.length ? res.hits[0].t : null);
const shotsAtHuman = res => res.shots.filter(s => s.target === HUMAN);

/* cenário padrão: 1 bot na origem olhando para o humano parado a `d` m ao
   norte, andando na direção dele; o humano olha para o bot */
function duel({ seed, d, mira = 0.9, weapon = 'FUZIL', duration = 60, humanHp = 100, stopOnDeath = true }) {
  const hp = { x: 0, z: d };
  const sim = makeSim({ seed, bots: [{ id: 'b0', x: 0, z: 0, weapon, mira, yaw: yawTo({ x: 0, z: 0 }, hp), wp: [0, 500] }] });
  const rotY = yawTo(hp, { x: 0, z: 0 });
  return run(sim, { human: () => ({ ...hp, rotY }), duration, humanHp, stopOnDeath });
}

describe('Bots: combate justo para quem joga no celular (laço real a 10 Hz)', () => {
  it('humano visível e parado a 30 m: o primeiro dano leva ≥ 1,5 s', (t) => {
    const firsts = [];
    let semDano = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const res = duel({ seed, d: 30, duration: 40 });
      const ft = firstHitT(res);
      if (ft == null) semDano++; else firsts.push(ft);
    }
    const min = Math.min(...firsts);
    t.diagnostic(`1º dano a 30 m (mira 0,9, 60 sementes): mín ${f2(min)} s, mediana ${f2(median(firsts))} s, sem dano em 40 s: ${semDano}`);
    assert.ok(firsts.length >= 54, `o bot deixou de ser ameaça: só ${firsts.length}/60 partidas tiveram dano em 40 s`);
    assert.ok(min >= 1.5, `primeiro dano cedo demais: ${f2(min)} s (meta ≥ 1,5 s)`);
  });

  it('percepção: o bot só vira para um humano parado a ~30 m depois de ≥ 1,2 s (medidor + reação)', (t) => {
    const locks = [];
    for (let seed = 1; seed <= 40; seed++) {
      // humano a 20° da frente do bot: dentro do cone, mas o bot ainda anda
      // para o waypoint dele — o "virar" é observável na rotY emitida
      const hp = { x: 30 * Math.sin(20 * DEG), z: 30 * Math.cos(20 * DEG) };
      const sim = makeSim({ seed, bots: [{ id: 'b0', x: 0, z: 0, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, { x: 0, z: 1 }), wp: [0, 500] }] });
      const res = run(sim, { human: () => ({ ...hp, rotY: yawTo(hp, { x: 0, z: 0 }) }), duration: 12, stopOnDeath: false });
      locks.push(lockOnT(res, 'b0'));
    }
    const got = locks.filter(x => x != null);
    t.diagnostic(`virada para o humano: mín ${f2(Math.min(...got))} s, mediana ${f2(median(got))} s (${got.length}/40 viraram)`);
    assert.equal(got.length, 40, 'o bot não chegou a perceber um humano parado à frente');
    assert.ok(Math.min(...got) >= 1.2, `percebeu instantâneo: virou aos ${f2(Math.min(...got))} s`);
  });

  it('reação: com o alvo já engajado, o bot mira onde o humano estava ~0,6 s atrás', (t) => {
    const lags = [];
    for (let seed = 1; seed <= 20; seed++) {
      const A = { x: 0, z: 25 }, B = { x: 10, z: 25 };
      const sim = makeSim({ seed, bots: [{ id: 'b0', x: 0, z: 0, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, A), wp: [0, 500] }] });
      const res = run(sim, {
        human: tt => ({ ...(tt < 8 ? A : B), rotY: 0 }),
        duration: 10, humanHp: Infinity, stopOnDeath: false,
      });
      const after = (res.states.get('b0') || []).filter(s => s.t >= 8);
      const lock = after.find(s => angDiff(s.rotY, yawTo({ x: s.pos[0], z: s.pos[2] }, B)) <= 2 * DEG);
      lags.push(lock ? lock.t - 8 : Infinity);
    }
    t.diagnostic(`atraso da mira depois de o humano pular 10 m: mín ${f2(Math.min(...lags))} s, máx ${f2(Math.max(...lags))} s`);
    assert.ok(Math.min(...lags) >= 0.55, `sem tempo de reação: a mira seguiu o humano em ${f2(Math.min(...lags))} s`);
    assert.ok(Math.max(...lags) <= 0.75, `a mira não alcançou o humano: ${f2(Math.max(...lags))} s`);
  });

  it('atraso do primeiro disparo: ≥ 1,0 s entre virar para o alvo e o primeiro tiro', (t) => {
    const delays = [];
    for (let seed = 1; seed <= 40; seed++) {
      const hp = { x: 30 * Math.sin(20 * DEG), z: 30 * Math.cos(20 * DEG) };
      const sim = makeSim({ seed, bots: [{ id: 'b0', x: 0, z: 0, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, { x: 0, z: 1 }), wp: [0, 500] }] });
      const res = run(sim, { human: () => ({ ...hp, rotY: yawTo(hp, { x: 0, z: 0 }) }), duration: 12, humanHp: Infinity, stopOnDeath: false });
      const lock = lockOnT(res, 'b0');
      const first = shotsAtHuman(res)[0];
      if (lock != null && first) delays.push(first.t - lock);
    }
    t.diagnostic(`virar → 1º tiro: mín ${f2(Math.min(...delays))} s, máx ${f2(Math.max(...delays))} s (${delays.length}/40)`);
    assert.equal(delays.length, 40, 'nem todo bot chegou a virar e atirar');
    assert.ok(Math.min(...delays) >= 0.95, `atirou no instante em que virou: ${f2(Math.min(...delays))} s`);
    assert.ok(Math.max(...delays) <= 1.65, `atraso maior que o sorteado (1,0–1,5 s): ${f2(Math.max(...delays))} s`);
  });

  it('janela de erro: os primeiros tiros erram por 1,0 s + 0,0315 s/m, e ela cresce com a distância', (t) => {
    const gaps = { 30: [], 80: [] };
    for (const d of [30, 80]) {
      for (let seed = 1; seed <= 40; seed++) {
        // acima de 28 m o bot avança; o humano recua na mesma velocidade para a
        // distância ficar fixa (o caso mede a janela, não a aproximação)
        const sim = makeSim({ seed, bots: [{ id: 'b0', x: 0, z: 0, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, { x: 0, z: d }), wp: [0, 900] }] });
        const res = run(sim, {
          human: () => {
            const b = sim.world.bots[0];
            const z = Math.max(d, b.z + d);
            return { x: 0, z, rotY: yawTo({ x: 0, z }, b) };
          },
          duration: 40, humanHp: Infinity, stopOnDeath: false,
        });
        const shots = shotsAtHuman(res);
        const hit = shots.find(s => s.hit);
        if (shots.length && hit) gaps[d].push(hit.t - shots[0].t);
      }
    }
    const min30 = Math.min(...gaps[30]), min80 = Math.min(...gaps[80]);
    t.diagnostic(`1º tiro → 1º acerto: a 30 m mín ${f2(min30)} s (${gaps[30].length}/40), a 80 m mín ${f2(min80)} s (${gaps[80].length}/40)`);
    assert.ok(gaps[30].length >= 36 && gaps[80].length >= 20, 'poucos acertos para medir a janela');
    assert.ok(min30 >= 1.0 + 0.0315 * 30 - 0.05, `a 30 m o 1º acerto veio ${f2(min30)} s depois do 1º tiro (janela: 1,95 s)`);
    assert.ok(min80 >= 1.0 + 0.0315 * 80 - 0.05, `a 80 m o 1º acerto veio ${f2(min80)} s depois do 1º tiro (janela: 3,52 s)`);
  });

  it('TTK de 1 bot de fuzil contra humano parado (100 HP): sobe, e é maior a 80 m que a 30 m', (t) => {
    const ttk = { 30: [], 80: [] };
    const naoMatou = { 30: 0, 80: 0 };
    for (const d of [30, 80]) {
      for (let seed = 1; seed <= 100; seed++) {
        const res = duel({ seed, d, duration: 90 });
        if (res.deathT == null) naoMatou[d]++; else ttk[d].push(res.deathT);
      }
    }
    const m30 = median(ttk[30]), m80 = median(ttk[80]);
    t.diagnostic(`TTK 1 bot (mira 0,9): 30 m mediana ${f2(m30)} s (não matou em 90 s: ${naoMatou[30]}/100); 80 m mediana ${f2(m80)} s (não matou: ${naoMatou[80]}/100)`);
    assert.ok(naoMatou[30] <= 10, `o bot ficou inofensivo a 30 m: ${naoMatou[30]}/100 sem matar em 90 s`);
    assert.ok(m30 >= 6, `TTK a 30 m ainda é de bot apelão: ${f2(m30)} s (meta ≥ 6 s, docs/mobile/referencia-bots.md)`);
    assert.ok(m80 > m30 * 1.2, `a distância não pesa: TTK 80 m ${f2(m80)} s contra 30 m ${f2(m30)} s`);
  });

  it('4 bots em alcance: no máximo 1 bot causa dano ao humano por janela de 1 s (token de acerto)', (t) => {
    let worst = 0, totalHits = 0;
    const hitters = new Set();
    const ttks = [];
    for (let seed = 1; seed <= 20; seed++) {
      // arco de 4 bots a 30 m, 26,7° entre si: nenhum cabe no cone de visão
      // do outro, então o alvo de todos é o humano (que atira neles)
      const angles = [-40, -40 / 3, 40 / 3, 40];
      const bots = angles.map((a, i) => {
        const p = { x: 30 * Math.sin(a * DEG), z: 30 * Math.cos(a * DEG) };
        return { id: `b${i}`, ...p, mira: 0.9, yaw: yawTo(p, { x: 0, z: 0 }), wp: [0, 0] };
      });
      const sim = makeSim({ seed, bots });
      let rr = 0;
      const res = run(sim, {
        human: () => ({ x: 0, z: 0, rotY: yawTo({ x: 0, z: 0 }, { x: 0, z: 1 }) }),
        duration: 60, humanHp: Infinity, stopOnDeath: false,
        onTick: (tt, s, h) => { if (Math.round(tt * 10) % 4 === 0) humanFires(s, h, tt, { targetId: `b${rr++ % 4}`, dmg: 5 }); },
      });
      // janela deslizante [t, t + 1 s): quantos bots DIFERENTES acertaram
      for (const a of res.hits) {
        const inWin = new Set(res.hits.filter(b => b.t >= a.t - 1e-9 && b.t < a.t + 1 - 1e-9).map(b => b.from));
        worst = Math.max(worst, inWin.size);
      }
      for (const hh of res.hits) hitters.add(hh.from);
      totalHits += res.hits.length;
      let acc = 0, dead = null;
      for (const hh of res.hits) { acc += hh.dmg; if (acc >= 100) { dead = hh.t; break; } }
      if (dead != null) ttks.push(dead);
    }
    t.diagnostic(`4 bots: máx. de bots acertando o humano na mesma janela de 1 s = ${worst}; acertos = ${totalHits}; bots que acertaram = ${hitters.size}; TTK (100 HP) mediana ${f2(median(ttks))} s`);
    assert.ok(hitters.size >= 2, `o caso não exercita o token: só ${hitters.size} bot acertou o humano`);
    assert.ok(totalHits >= 40, `o caso não exercita o token: só ${totalHits} acertos em 20 × 60 s`);
    assert.ok(worst <= 1, `${worst} bots acertaram o humano dentro da mesma janela de 1 s`);
  });

  it('humano atrás de um morro não toma dano nem vira alvo por visão; em terreno plano, vira', (t) => {
    // crista ao longo de X em z = 45 m (12 m de altura); humano a 90 m
    const ridge = { heightAt: (x, z) => 12 * Math.exp(-((z - 45) ** 2) / (2 * 4 * 4)) };
    const hp = { x: 0, z: 90 };
    const scenario = (terrain, seed, duration) => {
      const heading = { x: Math.sin(20 * DEG), z: Math.cos(20 * DEG) };
      const sim = makeSim({
        seed, terrain,
        bots: [{ id: 'b0', x: 0, z: 0, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, heading), wp: [heading.x * 500, heading.z * 500] }],
      });
      return { sim, res: run(sim, { human: () => ({ ...hp, rotY: yawTo(hp, { x: 0, z: 0 }) }), duration, humanHp: Infinity, stopOnDeath: false }) };
    };
    let hidHits = 0, hidShots = 0, hidLocks = 0, flatEngaged = 0, flatHurt = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const hidden = scenario(ridge, seed, 8).res;
      hidHits += hidden.hits.length;
      hidShots += shotsAtHuman(hidden).length;
      if (lockOnT(hidden, 'b0') != null) hidLocks++;
      const flat = scenario(FLAT, seed, 30).res;
      if (lockOnT(flat, 'b0') != null && shotsAtHuman(flat).length) flatEngaged++;
      if (flat.hits.length) flatHurt++;
    }
    t.diagnostic(`atrás do morro (8 s × 20): acertos ${hidHits}, tiros nele ${hidShots}, bot virou para ele ${hidLocks}×; plano (30 s × 20): engajou ${flatEngaged}/20, deu dano ${flatHurt}/20`);
    assert.equal(flatEngaged, 20, 'controle: em terreno plano o bot tinha de ver e atirar no humano');
    assert.ok(flatHurt >= 18, `controle: em terreno plano o bot deu dano só em ${flatHurt}/20`);
    assert.equal(hidHits, 0, 'humano atrás do morro tomou dano');
    assert.equal(hidShots, 0, 'bot atirou no humano através do morro');
    assert.equal(hidLocks, 0, 'bot virou para um humano que o terreno esconde');
  });

  it('a bala vai contra onde o humano ESTÁ: quem se esconde atrás do morro não leva o tiro decidido 0,6 s antes', (t) => {
    // morro redondo de 10 m centrado em (10, 25): não cobre A = (0, 30), cobre B = (13, 30)
    const hill = { heightAt: (x, z) => 10 * Math.exp(-((x - 10) ** 2 + (z - 25) ** 2) / (2 * 3 * 3)) };
    const A = { x: 0, z: 30 }, B = { x: 13, z: 30 }, T = 12;
    let before = 0, shotsWin = 0, hitsWin = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const sim = makeSim({ seed, terrain: hill, bots: [{ id: 'b0', x: 0, z: 0, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, A), wp: [0, 500] }] });
      const res = run(sim, {
        human: tt => ({ ...(tt < T ? A : B), rotY: yawTo(tt < T ? A : B, sim.world.bots[0]) }),
        duration: T + 1, humanHp: Infinity, stopOnDeath: false,
      });
      before += res.hits.filter(h => h.t < T).length;
      // o bot ainda "vê" A por 0,6 s (reação): pode atirar, mas o terreno de agora barra
      const win = res.shots.filter(s => s.t >= T && s.t < T + 0.7 && s.target === HUMAN);
      shotsWin += win.length;
      hitsWin += res.hits.filter(h => h.t >= T && h.t < T + 0.7).length;
    }
    t.diagnostic(`acertos antes de esconder: ${before}; nos 0,7 s depois de esconder: ${shotsWin} tiros, ${hitsWin} acertos`);
    assert.ok(before > 60, 'controle: o bot tinha de estar acertando o humano antes de ele se esconder');
    assert.ok(shotsWin >= 10, `o caso não exercita a reação: só ${shotsWin} tiros saíram na janela de 0,7 s`);
    assert.equal(hitsWin, 0, `${hitsWin} acertos atravessaram o morro (bala resolvida contra a posição atrasada)`);
  });

  it('bot mais perto não é ignorado por causa de um humano mais longe (fração de engajamentos no humano)', (t) => {
    const layout = mulberry32(777);
    let againstHuman = 0, engaged = 0;
    const N = 100;
    for (let n = 0; n < N; n++) {
      // o outro bot fica a 6–12 m, 30–50° de lado (dentro do cone largo de
      // perto), e se afasta radialmente — de costas, sem atirar no primeiro
      const d1 = 6 + layout() * 6;
      const a1 = (layout() < 0.5 ? -1 : 1) * (30 + layout() * 20);
      const dH = d1 + 15 + layout() * (45 - d1);
      const aH = -20 + layout() * 40;
      const b1 = { x: d1 * Math.sin(a1 * DEG), z: d1 * Math.cos(a1 * DEG) };
      const hp = { x: dH * Math.sin(aH * DEG), z: dH * Math.cos(aH * DEG) };
      const sim = makeSim({
        seed: 1000 + n,
        bots: [
          { id: 'b0', x: 0, z: 0, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, { x: 0, z: 1 }), wp: [0, 500] },
          { id: 'b1', ...b1, mira: 0.9, yaw: yawTo(b1, { x: 0, z: 0 }), wp: [b1.x * 40, b1.z * 40] },
        ],
      });
      const res = run(sim, { human: () => ({ ...hp, rotY: yawTo(hp, { x: 0, z: 0 }) }), duration: 12, humanHp: Infinity, stopOnDeath: false });
      const first = res.shots.find(s => s.from === 'b0');
      if (!first) continue;
      engaged++;
      if (first.target === HUMAN) againstHuman++;
    }
    const frac = engaged ? againstHuman / engaged : NaN;
    t.diagnostic(`1º engajamento do bot contra o humano (bot a 6–12 m, humano 15+ m mais longe): ${againstHuman}/${engaged} = ${(frac * 100).toFixed(0)}%`);
    assert.ok(engaged >= 90, `o bot não engajou ninguém em ${N - engaged}/${N} cenários`);
    assert.ok(frac <= 0.1, `o bot ignorou o bot próximo para ir no humano em ${(frac * 100).toFixed(0)}% dos engajamentos`);
  });

  it('acerto por disparo: alvo andando é acertado menos que parado, e bot andando acerta menos que parado', (t) => {
    const W = 4.5; // m/s — igual ao passo do bot (0,45 m a 10 Hz), para o caso "bot andando" ficar à distância fixa
    const rate = (mk) => {
      let shots = 0, hits = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const { sim, human } = mk(seed);
        const res = run(sim, { human, duration: 90, humanHp: Infinity, stopOnDeath: false });
        const s = shotsAtHuman(res);
        shots += s.length;
        hits += s.filter(x => x.hit).length;
      }
      return { shots, hits, rate: hits / shots };
    };
    // Os três casos terminam a ~28 m: acima disso o bot avança atirando, abaixo
    // ele para. Antes de perceber o alvo o bot anda para o waypoint (ao norte).
    const bot0 = seed => makeSim({ seed, bots: [{ id: 'b0', x: 0, z: 0, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, { x: 0, z: 1 }), wp: [0, 900] }] });
    // S0: humano parado a 34 m; o bot anda até ficar a ≤ 28 m e para
    const S0 = rate(seed => ({ sim: bot0(seed), human: () => ({ x: 0, z: 34, rotY: yawTo({ x: 0, z: 34 }, { x: 0, z: 0 }) }) }));
    // S1: humano anda em volta do bot, a 27,8 m dele, a 4,5 m/s
    const S1 = rate(seed => {
      const sim = bot0(seed);
      const r = 27.8;
      return {
        sim,
        human: tt => {
          const b = sim.world.bots[0];
          const a = (W / r) * tt;
          const p = { x: b.x + r * Math.sin(a), z: b.z + r * Math.cos(a) };
          return { ...p, rotY: yawTo(p, b) };
        },
      };
    });
    const M1 = rate(seed => {
      const sim = makeSim({ seed, bots: [{ id: 'b0', x: 0, z: 0, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, { x: 0, z: 1 }), wp: [0, 900] }] });
      // humano recua a 4,5 m/s: o bot (a > 28 m) avança atrás dele o tempo todo
      return { sim, human: tt => ({ x: 0, z: 28.5 + W * tt, rotY: 0 }) };
    });
    t.diagnostic(`acerto por disparo: bot parado × alvo parado ${f2(S0.rate)} (${S0.hits}/${S0.shots}); bot parado × alvo andando ${f2(S1.rate)} (${S1.hits}/${S1.shots}); bot andando × alvo andando ${f2(M1.rate)} (${M1.hits}/${M1.shots})`);
    assert.ok(S0.shots > 500 && S1.shots > 500 && M1.shots > 500, 'poucos disparos para medir');
    assert.ok(S1.rate < S0.rate * 0.9, `alvo andando é acertado igual ao parado: ${f2(S1.rate)} contra ${f2(S0.rate)}`);
    assert.ok(M1.rate < S1.rate * 0.75, `bot andando acerta igual ao parado: ${f2(M1.rate)} contra ${f2(S1.rate)}`);
  });

  it('distância: nas mesmas condições, o bot acerta menos a 60 m que a 30 m', (t) => {
    // bot andando atrás de um humano que recua na mesma velocidade: tudo igual
    // menos a distância (o "TTK maior a 80 m" também tem a aproximação e a
    // janela de erro por metro segurando; este caso isola a mira)
    const W = 4.5;
    const rate = (d) => {
      let shots = 0, hits = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const sim = makeSim({ seed, bots: [{ id: 'b0', x: 0, z: 0, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, { x: 0, z: 1 }), wp: [0, 900] }] });
        const res = run(sim, { human: tt => ({ x: 0, z: d + W * tt, rotY: 0 }), duration: 60, humanHp: Infinity, stopOnDeath: false });
        const s = shotsAtHuman(res);
        shots += s.length;
        hits += s.filter(x => x.hit).length;
      }
      return { shots, hits, rate: hits / shots };
    };
    const near = rate(30), far = rate(60);
    t.diagnostic(`acerto por disparo, bot andando × alvo recuando: 30 m ${f2(near.rate)} (${near.hits}/${near.shots}); 60 m ${f2(far.rate)} (${far.hits}/${far.shots})`);
    assert.ok(near.shots > 500 && far.shots > 500, 'poucos disparos para medir');
    assert.ok(far.rate < near.rate * 0.7, `a distância não pesa na mira: ${f2(far.rate)} a 60 m contra ${f2(near.rate)} a 30 m`);
  });

  it('foco: logo depois da janela de erro o bot acerta menos do que depois de muito tempo mirando', (t) => {
    // bot parado, humano parado a ~28 m. "cedo" = até 1,5 s depois de a
    // janela de erro abrir; "tarde" = mais de 12 s depois do 1º tiro
    let earlyS = 0, earlyH = 0, lateS = 0, lateH = 0;
    for (let seed = 1; seed <= 800; seed++) {
      const sim = makeSim({ seed, bots: [{ id: 'b0', x: 0, z: 0, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, { x: 0, z: 1 }), wp: [0, 900] }] });
      const res = run(sim, { human: () => ({ x: 0, z: 34, rotY: yawTo({ x: 0, z: 34 }, { x: 0, z: 0 }) }), duration: 24, humanHp: Infinity, stopOnDeath: false });
      const s = shotsAtHuman(res);
      if (!s.length) continue;
      const t0 = s[0].t, open = t0 + 1.0 + 0.0315 * 28;
      for (const x of s) {
        if (x.t >= open && x.t < open + 1.5) { earlyS++; if (x.hit) earlyH++; }
        if (x.t >= t0 + 12) { lateS++; if (x.hit) lateH++; }
      }
    }
    const early = earlyH / earlyS, late = lateH / lateS;
    t.diagnostic(`acerto por disparo: cedo ${f2(early)} (${earlyH}/${earlyS}); tarde ${f2(late)} (${lateH}/${lateS})`);
    assert.ok(earlyS > 600 && lateS > 600, 'poucos disparos para medir');
    assert.ok(early < late * 0.88, `a mira não fecha com a exposição: cedo ${f2(early)} contra tarde ${f2(late)}`);
  });

  it('bot nas costas do humano espera o dobro entre acertos (o humano não pode responder)', (t) => {
    const minGap = (behind) => {
      let min = Infinity;
      for (let seed = 1; seed <= 30; seed++) {
        const hp = { x: 0, z: 25 };
        const sim = makeSim({ seed, bots: [{ id: 'b0', x: 0, z: 0, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, hp), wp: [0, 500] }] });
        // de frente: olha para o bot; de costas: olha para longe dele
        const rotY = behind ? yawTo(hp, { x: 0, z: 100 }) : yawTo(hp, { x: 0, z: 0 });
        const res = run(sim, { human: () => ({ ...hp, rotY }), duration: 60, humanHp: Infinity, stopOnDeath: false });
        const ts = [...new Set(res.hits.map(h => h.t))];
        for (let i = 1; i < ts.length; i++) min = Math.min(min, ts[i] - ts[i - 1]);
      }
      return min;
    };
    const front = minGap(false), back = minGap(true);
    t.diagnostic(`menor intervalo entre acertos do mesmo bot: de frente ${f2(front)} s; pelas costas ${f2(back)} s`);
    assert.ok(front < 1.6, `controle: de frente a cadência do fuzil (1,1 s) já devia caber — ${f2(front)} s`);
    assert.ok(back >= 1.95, `pelas costas os acertos vieram a ${f2(back)} s um do outro (mínimo 2,0 s)`);
  });

  it('DMR/sniper: os dois primeiros disparos num alvo novo além de 12,7 m sempre erram (CoD4)', (t) => {
    let hitEarly = 0, sampled = 0;
    for (let seed = 1; seed <= 40; seed++) {
      // a 15 m a janela de erro (1,47 s) é mais curta que a cadência da DMR
      // (1,5 s): sem a regra da luneta, o 2º disparo já podia acertar. O
      // humano se mantém 15 m à frente enquanto o bot anda (antes de percebê-lo)
      // e congela aos 2 s — senão o bot chegava a 8,7 m, abaixo dos 12,7 m.
      const sim = makeSim({ seed, bots: [{ id: 'b0', x: 0, z: 0, weapon: 'DMR', mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, { x: 0, z: 1 }), wp: [0, 500] }] });
      const hp = { x: 0, z: 15 };
      const res = run(sim, {
        human: tt => { if (tt < 2) hp.z = sim.world.bots[0].z + 15; return { ...hp, rotY: yawTo(hp, sim.world.bots[0]) }; },
        duration: 12, humanHp: Infinity, stopOnDeath: false,
      });
      const s = shotsAtHuman(res);
      if (s.length < 2) continue;
      sampled++;
      if (s[0].hit || s[1].hit) hitEarly++;
    }
    t.diagnostic(`DMR a 15 m: acerto num dos 2 primeiros disparos em ${hitEarly}/${sampled} partidas`);
    assert.equal(sampled, 40);
    assert.equal(hitEarly, 0, `a DMR acertou um dos dois primeiros disparos em ${hitEarly}/40`);
  });

  it('faca: o bot fica colado no alvo para golpear, não sai andando no meio do golpe', (t) => {
    let worst = 0, hits = 0;
    for (let seed = 1; seed <= 20; seed++) {
      // o humano se mantém 2 m à frente enquanto o bot anda (senão o bot passa
      // por ele em 0,5 s, antes de o medidor encher) e congela aos 2 s
      const sim = makeSim({ seed, bots: [{ id: 'b0', x: 0, z: 0, weapon: 'FACA', ammo: Infinity, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, { x: 0, z: 1 }), wp: [0, 500] }] });
      const hp = { x: 0, z: 2 };
      const res = run(sim, {
        human: tt => { if (tt < 2) hp.z = sim.world.bots[0].z + 2; return { ...hp, rotY: yawTo(hp, sim.world.bots[0]) }; },
        duration: 12, humanHp: Infinity, stopOnDeath: false,
      });
      for (const s of res.states.get('b0') || []) {
        if (s.t >= 3) worst = Math.max(worst, Math.hypot(s.pos[0] - hp.x, s.pos[2] - hp.z));
      }
      hits += res.hits.length;
    }
    t.diagnostic(`faca: maior distância do alvo depois de engajar ${f2(worst)} m; golpes que entraram ${hits}`);
    assert.ok(hits > 0, 'o bot de faca não golpeou ninguém');
    assert.ok(worst <= 2.8, `o bot de faca se afastou ${f2(worst)} m do alvo no meio do combate`);
  });

  it('tiro revela: bot de costas não vê o humano parado atrás dele, mas o ouve atirar', (t) => {
    let before = 0, after = 0, react = [];
    for (let seed = 1; seed <= 20; seed++) {
      const hp = { x: 0, z: 30 };
      const sim = makeSim({ seed, bots: [{ id: 'b0', x: 0, z: 0, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, { x: 0, z: -1 }), wp: [0, -500] }] });
      const res = run(sim, {
        human: () => ({ ...hp, rotY: yawTo(hp, sim.world.bots[0]) }),
        duration: 25, humanHp: Infinity, stopOnDeath: false,
        onTick: (tt, s, h) => { if (Math.abs(tt - 5) < 1e-9) humanFires(s, h, tt, { toPos: [0, 0, 60] }); },
      });
      const shots = shotsAtHuman(res);
      before += shots.filter(s => s.t < 5).length + res.hits.filter(x => x.t < 5).length;
      const firstAfter = shots.find(s => s.t >= 5);
      if (firstAfter) { after++; react.push(firstAfter.t - 5); }
    }
    t.diagnostic(`de costas: tiros no humano antes de ele atirar ${before}; depois do tiro dele: ${after}/20 bots atiraram, reação mediana ${f2(median(react))} s`);
    assert.equal(before, 0, 'bot de costas atirou num humano que não podia ver nem ouvir');
    assert.equal(after, 20, 'o tiro do humano a ~50 m não revelou a posição dele');
  });

  it('fora da tela de quem atira, o bot ouve pela metade (Splinter Cell)', (t) => {
    let heardInView = 0, heardOffscreen = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const h = { x: 0, z: 0, rotY: yawTo({ x: 0, z: 0 }, { x: 0, z: 1 }) }; // olha para +Z
      const sim = makeSim({
        seed,
        bots: [
          { id: 'na-tela', x: 0, z: 55, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, { x: 0, z: 1 }), wp: [0, 600] },
          { id: 'fora', x: 0, z: -55, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, { x: 0, z: -1 }), wp: [0, -600] },
        ],
      });
      const res = run(sim, {
        human: () => h, duration: 20, humanHp: Infinity, stopOnDeath: false,
        onTick: (tt, s, hh) => { if (Math.abs(tt - 0.5) < 1e-9) humanFires(s, hh, tt, { toPos: [0, 0, 40] }); },
      });
      if (res.shots.some(s => s.from === 'na-tela' && s.target === HUMAN)) heardInView++;
      if (res.shots.some(s => s.from === 'fora' && s.target === HUMAN)) heardOffscreen++;
    }
    t.diagnostic(`tiro do humano a ~57 m: bot na tela dele reagiu ${heardInView}/20; bot fora da tela reagiu ${heardOffscreen}/20`);
    assert.equal(heardInView, 20, 'bot na frente do humano, a 57 m, não ouviu o tiro');
    assert.equal(heardOffscreen, 0, 'bot fora da tela do humano ouviu a 57 m (a audição dele é metade)');
  });

  it('memória: sem ver o humano, o bot vai à ÚLTIMA posição vista, não à atual', (t) => {
    let wrong = 0, right = 0;
    // o bot segura a posição por 3,8 s (CHASE_AFTER_S, CS Easy) depois de a
    // perda chegar pela reação (6,6 s); a perseguição se mede depois disso
    const go = 6 + 0.6 + 3.8;
    for (let seed = 1; seed <= 20; seed++) {
      const A = { x: 0, z: 25 }, B = { x: 0, z: -25 }; // B fica atrás do bot: fora do cone
      const sim = makeSim({ seed, bots: [{ id: 'b0', x: 0, z: 0, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, A), wp: [0, 500] }] });
      const res = run(sim, {
        human: tt => ({ ...(tt < 6 ? A : B), rotY: 0 }),
        duration: go + 3, humanHp: Infinity, stopOnDeath: false,
      });
      const st = res.states.get('b0');
      const at = tt => st.find(s => Math.abs(s.t - Math.round(tt * 10) / 10) < 1e-9);
      const p0 = at(go + 0.3), p1 = at(go + 2.3);
      const dz = p1.pos[2] - p0.pos[2];
      const firedAtB = res.shots.some(s => s.t >= 6.7 && s.target === HUMAN);
      if (dz > 3 && !firedAtB) right++; else wrong++;
    }
    t.diagnostic(`depois de o humano sumir atrás do bot: foi à última posição vista em ${right}/20; seguiu/atirou na posição atual em ${wrong}/20`);
    assert.equal(wrong, 0, 'o bot sabia onde estava um humano que ele não via');
  });
});

/* ================================================================
   RE-EXPOSIÇÃO — B1/B2 do laudo docs/mobile/validacao-7515734.md.

   O tiroteio normal de BR é "espia, atira, se esconde, espia de novo". O
   laudo mediu no processo real: o humano some 2 s atrás do relevo e volta ao
   mesmo ponto → 1º disparo em 0,41–0,79 s e 1º dano da escopeta em 0,41 s a
   14,5 m. As proteções (reação, atraso de ataque, janela de erro) só valiam
   no PRIMEIRO contato.

   Os limiares são os da régua e valem para contato novo E re-exposição:
     B1 — 1º disparo contra o humano ≥ 1,3 s depois de ele aparecer;
     B2 — 1º dano ≥ 1,3 + 1,0 + 0,0315·d s (d = distância quando ele aparece).

   Âncora independente do bot: quando o humano está escondido e quando está à
   vista quem diz é uma marcha de 2 cm do PRÓPRIO TESTE sobre a crista, não a
   `lineOfSight` do bot; o t0 é o instante em que o humano volta ao ponto.
   ================================================================ */

/* crista ao longo de X em z = zc: 3 m de altura, σ = 1,5 m. Quem está no topo
   (A) aparece; 6 m atrás (B) some. */
function crest(zc) {
  return { heightAt: (x, z) => 3 * Math.exp(-((z - zc) ** 2) / (2 * 1.5 * 1.5)) };
}
function seesFine(terrain, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const n = Math.ceil(Math.hypot(dx, dy, dz) / 0.02);
  for (let i = 1; i < n; i++) {
    const k = i / n;
    if (terrain.heightAt(from.x + dx * k, from.z + dz * k) > from.y + dy * k) return false;
  }
  return true;
}
/* olho do bot (pé + 1,5 m) → cabeça (1,6 m) OU tronco (1,0 m) do humano */
function humanInSight(terrain, b, h) {
  const eye = { x: b.x, y: b.y + 1.5, z: b.z };
  const hy = terrain.heightAt(h.x, h.z);
  return seesFine(terrain, eye, { x: h.x, y: hy + 1.6, z: h.z })
    || seesFine(terrain, eye, { x: h.x, y: hy + 1.0, z: h.z });
}

/* Um bot a `start` m do topo da crista; o humano fica no topo (A) até `hideAt`,
   desce 6 m para trás (B) por `hideFor` s e volta ao MESMO ponto A. */
function peek({ seed, weapon, start, hideAt = 8, hideFor = 2, duration = 16 }) {
  const terrain = crest(start);
  const A = { x: 0, z: start }, B = { x: 0, z: start + 6 };
  const sim = makeSim({
    seed, terrain,
    bots: [{ id: 'b0', x: 0, z: 0, weapon, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, A), wp: [0, 500] }],
  });
  const t0 = hideAt + hideFor;
  const probe = { leaks: 0, visibleAtT0: null, dAtT0: null, dAtHide: null };
  const at = tt => (tt >= hideAt - 1e-9 && tt < t0 - 1e-9 ? B : A);
  const dA = b => Math.hypot(A.x - b.x, terrain.heightAt(A.x, A.z) - b.y, A.z - b.z);
  const res = run(sim, {
    human: tt => { const p = at(tt); return { ...p, rotY: yawTo(p, sim.world.bots[0]) }; },
    duration, humanHp: Infinity, stopOnDeath: false,
    onTick: (tt, s, h) => {
      const b = s.world.bots[0];
      const seen = humanInSight(terrain, b, h);
      if (tt >= hideAt - 1e-9 && tt < t0 - 1e-9 && seen) probe.leaks++;
      if (Math.abs(tt - hideAt) < 1e-9) probe.dAtHide = dA(b);
      if (Math.abs(tt - t0) < 1e-9) { probe.visibleAtT0 = seen; probe.dAtT0 = dA(b); }
    },
  });
  return { res, probe, t0, hideAt, A };
}

const missTime = d => 1.0 + 0.0315 * d;

describe('Bots: re-exposição — quem some atrás do relevo e volta paga reação, atraso e janela de erro de novo (B1/B2)', () => {
  // escopeta a ~14 m e DMR/sniper a ~30 m são as armas e distâncias do laudo
  const CASES = [
    { weapon: 'ESCOPETA', start: 20 },
    { weapon: 'FUZIL', start: 30 },
    { weapon: 'DMR', start: 36 },
    { weapon: 'SNIPER', start: 36 },
  ];
  const N = 30;
  const runs = new Map();
  const collect = () => {
    if (runs.size) return runs;
    for (const c of CASES) {
      const out = [];
      for (let seed = 1; seed <= N; seed++) out.push({ seed, ...c, ...peek({ seed, weapon: c.weapon, start: c.start }) });
      runs.set(c.weapon, out);
    }
    return runs;
  };

  it('o cenário exercita a re-exposição: o bot já atirava, o humano some de verdade e volta à vista', (t) => {
    for (const [weapon, out] of collect()) {
      const engaged = out.filter(r => shotsAtHuman(r.res).some(s => s.t < r.hideAt)).length;
      const leaks = out.reduce((a, r) => a + r.probe.leaks, 0);
      const back = out.filter(r => r.probe.visibleAtT0).length;
      const d = out.map(r => r.probe.dAtT0), dh = out.map(r => r.probe.dAtHide);
      t.diagnostic(`${weapon}: bot já atirava no humano antes de ele sumir em ${engaged}/${N}; ticks à vista durante o esconde ${leaks}; à vista ao voltar ${back}/${N}; distância ao sumir ${f2(Math.min(...dh))}–${f2(Math.max(...dh))} m, na volta ${f2(Math.min(...d))}–${f2(Math.max(...d))} m`);
      assert.equal(engaged, N, `${weapon}: o bot não chegou a engajar antes do esconde em ${N - engaged}/${N}`);
      assert.equal(leaks, 0, `${weapon}: a crista não escondeu o humano (âncora de 2 cm)`);
      assert.equal(back, N, `${weapon}: o humano não estava à vista ao voltar`);
    }
  });

  it('B1: o 1º disparo depois de o humano reaparecer leva ≥ 1,3 s — igual ao contato novo', (t) => {
    const all = [], per = [];
    for (const [weapon, out] of collect()) {
      const fresh = [], again = [];
      for (const r of out) {
        const s0 = shotsAtHuman(r.res)[0];
        if (s0) fresh.push(s0.t);
        const s1 = shotsAtHuman(r.res).find(s => s.t >= r.t0 - 1e-9);
        if (s1) again.push(s1.t - r.t0);
      }
      all.push(...again);
      per.push({ weapon, fresh, again });
      t.diagnostic(`${weapon}: contato novo 1º disparo mín ${f2(Math.min(...fresh))} s; re-exposição 1º disparo mín ${f2(Math.min(...again))} s, mediana ${f2(median(again))} s (${again.length}/${N}); abaixo de 1,3 s: ${again.filter(x => x < 1.3 - 1e-9).length}`);
    }
    const low = all.filter(x => x < 1.3 - 1e-9).length;
    t.diagnostic(`todas as armas: re-exposição 1º disparo mín ${f2(Math.min(...all))} s, mediana ${f2(median(all))} s; abaixo de 1,3 s: ${low}/${all.length}`);
    for (const { weapon, fresh, again } of per) {
      assert.ok(Math.min(...fresh) >= 1.3 - 1e-9, `${weapon}: contato novo atirou em ${f2(Math.min(...fresh))} s`);
      assert.ok(again.length >= N - 2, `${weapon}: só ${again.length}/${N} bots atiraram depois da volta — o caso não mede nada`);
    }
    assert.equal(low, 0, `o humano reapareceu e levou tiro antes de 1,3 s em ${low}/${all.length} (mín ${f2(Math.min(...all))} s)`);
  });

  it('B2: o 1º dano depois de o humano reaparecer leva ≥ 1,3 + missTime(d) — a janela de erro volta', (t) => {
    // d: a leitura mais dura entre a distância de quando ele sumiu (a
    // "nominal" do cenário) e a de quando ele voltou — um bot que avança
    // durante o esconde encurta a própria janela (CoD4 usa a distância do
    // momento), e a régua não diz qual das duas vale
    let worstSlack = Infinity, violations = 0, n = 0;
    for (const [weapon, out] of collect()) {
      const firsts = [];
      let bad = 0;
      for (const r of out) {
        const h = r.res.hits.find(x => x.t >= r.t0 - 1e-9);
        if (!h) continue;
        const dt = h.t - r.t0, lim = 1.3 + missTime(Math.max(r.probe.dAtT0, r.probe.dAtHide));
        firsts.push(dt);
        worstSlack = Math.min(worstSlack, dt - lim);
        if (dt < lim - 1e-9) bad++;
        n++;
      }
      violations += bad;
      t.diagnostic(`${weapon}: re-exposição 1º dano mín ${f2(Math.min(...firsts))} s, mediana ${f2(median(firsts))} s (${firsts.length}/${N} com dano em 6 s); antes do limite: ${bad}`);
    }
    t.diagnostic(`todas as armas: ${violations} violações em ${n}; menor folga ${f2(worstSlack)} s`);
    assert.ok(n >= 60, `só ${n} re-exposições tiveram dano — o caso não exercita a janela`);
    assert.equal(violations, 0, `${violations} re-exposições tomaram dano antes de 1,3 s + missTime(d) (pior folga ${f2(worstSlack)} s)`);
  });

  it('piscar de 0,1 s (um estado) não é re-exposição: o bot não recomeça a contagem', (t) => {
    // controle do limiar: o CS só marca o inimigo como escondido depois de
    // 0,25 s sem vê-lo (cs_bot_attack.cpp, m_isEnemyHidden) — sem isso o bot
    // ficava mudo a cada vez que o humano passasse atrás de um toco
    const gaps = [];
    for (let seed = 1; seed <= N; seed++) {
      const r = peek({ seed, weapon: 'FUZIL', start: 30, hideAt: 8, hideFor: 0.1, duration: 12 });
      // maior intervalo entre disparos consecutivos contra o humano em volta do piscar
      const ts = shotsAtHuman(r.res).map(s => s.t).filter(x => x >= 6 && x <= 11.5);
      let worst = 0;
      for (let i = 1; i < ts.length; i++) worst = Math.max(worst, ts[i] - ts[i - 1]);
      if (ts.length >= 3) gaps.push(worst);
    }
    t.diagnostic(`piscar de 0,1 s: maior intervalo entre disparos de 6 a 11,5 s — máx ${f2(Math.max(...gaps))} s, mediana ${f2(median(gaps))} s (${gaps.length}/${N})`);
    assert.equal(gaps.length, N, 'o bot parou de atirar depois de um piscar de 0,1 s');
    assert.ok(Math.max(...gaps) <= 1.1 + 0.45 + 0.2 + 1e-9, `um piscar de 0,1 s custou ${f2(Math.max(...gaps))} s de silêncio (a cadência do fuzil é 1,1–1,55 s)`);
  });

  /* CS (states/cs_bot_attack.cpp): "if we haven't seen our enemy for a long
     time, chase after them" — chaseTime = 2 + 2·(1 − Aggression), +3 s com
     fuzil de precisão; CS2 Easy Aggression = 10 → 3,8 s. Halo (Isla): "the AI
     will assume the player is still sitting where the AI last knew him to be".
     Antes o bot disparava para a última posição no mesmo tick em que a
     perdia: em 2 s de esconde chegava 9 m mais perto — em cima de quem se
     escondeu, e com a janela de erro encurtada pela distância. */
  it('perdeu de vista quem via: segura a posição, mirando onde o viu, antes de ir atrás (3,8 s; 6,8 s com luneta)', (t) => {
    const REACT = 0.6;
    const rows = [];
    for (const { weapon, start, hold } of [{ weapon: 'FUZIL', start: 30, hold: 3.8 }, { weapon: 'DMR', start: 36, hold: 6.8 }]) {
      let worstStill = 0, worstAim = 0, minGo = Infinity;
      for (let seed = 1; seed <= 20; seed++) {
        const r = peek({ seed, weapon, start, hideAt: 8, hideFor: 12, duration: 20 });
        const st = r.res.states.get('b0');
        const at = tt => st.find(s => Math.abs(s.t - tt) < 1e-9);
        // parado de quando a perda chega (reação) até pouco antes do prazo
        const a0 = 8 + REACT + 0.2, a1 = 8 + REACT + hold - 0.2;
        const p0 = at(a0);
        for (const s of st.filter(x => x.t >= a0 - 1e-9 && x.t <= a1 + 1e-9)) {
          worstStill = Math.max(worstStill, Math.hypot(s.pos[0] - p0.pos[0], s.pos[2] - p0.pos[2]));
          worstAim = Math.max(worstAim, angDiff(s.rotY, yawTo({ x: s.pos[0], z: s.pos[2] }, r.A)) / DEG);
        }
        // e depois do prazo ele vai: 1,5 s depois, andou para o ponto onde o viu
        const p2 = at(Math.round((8 + REACT + hold + 1.5) * 10) / 10);
        minGo = Math.min(minGo, Math.hypot(p0.pos[0] - r.A.x, p0.pos[2] - r.A.z) - Math.hypot(p2.pos[0] - r.A.x, p2.pos[2] - r.A.z));
      }
      rows.push({ weapon, worstStill, worstAim, minGo });
      t.diagnostic(`${weapon}: parado ${f2(worstStill)} m no esconde (até ${f2(hold - 0.2)} s depois da reação), mira a ≤ ${f2(worstAim)}° de onde o viu; 1,5 s depois do prazo andou ≥ ${f2(minGo)} m até lá`);
    }
    for (const { weapon, worstStill, worstAim, minGo } of rows) {
      assert.ok(worstStill <= 0.01, `${weapon}: o bot saiu andando ${f2(worstStill)} m antes do prazo de perseguição`);
      assert.ok(worstAim <= 3, `${weapon}: enquanto segura, o bot deixou de mirar onde viu o humano (${f2(worstAim)}°)`);
      assert.ok(minGo >= 3, `${weapon}: passado o prazo, o bot não foi atrás (${f2(minGo)} m)`);
    }
  });

  it('enquanto segura, vira para onde OUVIU o humano escondido atirar — sem sair do lugar', (t) => {
    // o humano some atrás da crista em A' (6 m atrás de A) e, aos 9 s, atira
    // de C, 12 m ao lado, ainda escondido. O bot o perdeu aos 8,6 s e segura
    // até ~12,3 s: tem de virar para C (onde o ouviu), não ficar olhando A.
    // Sem isto o caso anterior não distingue "mira onde o viu" de "não mexe
    // o corpo": nos dois o bot já olhava para A.
    let worstAim = 0, worstStill = 0, aimOld = Infinity;
    for (let seed = 1; seed <= 20; seed++) {
      const start = 30, terrain = crest(start);
      const A = { x: 0, z: start }, C = { x: 12, z: start + 6 };
      const sim = makeSim({ seed, terrain, bots: [{ id: 'b0', x: 0, z: 0, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, A), wp: [0, 500] }] });
      const pos = tt => (tt < 8 - 1e-9 ? A : C);
      const res = run(sim, {
        human: tt => { const p = pos(tt); return { ...p, rotY: yawTo(p, sim.world.bots[0]) }; },
        duration: 12, humanHp: Infinity, stopOnDeath: false,
        onTick: (tt, s, h) => {
          if (Math.abs(tt - 9) < 1e-9) humanFires(s, h, tt, { toPos: [C.x, 0, C.z + 40] });
          if (tt >= 8.6 - 1e-9 && humanInSight(terrain, s.world.bots[0], h)) worstStill = Infinity; // C tem de estar escondido
        },
      });
      const st = res.states.get('b0');
      const p0 = st.find(s => Math.abs(s.t - 8.8) < 1e-9);
      for (const s of st.filter(x => x.t >= 9.8 - 1e-9 && x.t <= 11.8 + 1e-9)) {
        worstAim = Math.max(worstAim, angDiff(s.rotY, yawTo({ x: s.pos[0], z: s.pos[2] }, C)) / DEG);
        aimOld = Math.min(aimOld, angDiff(s.rotY, yawTo({ x: s.pos[0], z: s.pos[2] }, A)) / DEG);
        worstStill = Math.max(worstStill, Math.hypot(s.pos[0] - p0.pos[0], s.pos[2] - p0.pos[2]));
      }
    }
    t.diagnostic(`ouviu de C enquanto segurava: mira a ≤ ${f2(worstAim)}° de C (e a ≥ ${f2(aimOld)}° de A, onde o viu); andou ${f2(worstStill)} m`);
    assert.ok(worstStill <= 0.01, `o bot saiu do lugar (${f2(worstStill)} m) — ou C não estava escondido`);
    assert.ok(worstAim <= 3, `o bot não virou para onde ouviu o humano (${f2(worstAim)}° de C)`);
  });

  it('quem o bot só OUVIU (nunca viu) ele vai investigar na hora — o prazo é só para quem ele perdeu de vista', (t) => {
    // morro de 6 m entre o bot (de costas) e o humano, que atira aos 2 s
    const hill = { heightAt: (x, z) => 6 * Math.exp(-((z - 20) ** 2) / (2 * 2 * 2)) };
    let moved = Infinity, shots = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const hp = { x: 0, z: 40 };
      const sim = makeSim({ seed, terrain: hill, bots: [{ id: 'b0', x: 0, z: 0, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, { x: 0, z: -1 }), wp: [0, -500] }] });
      const res = run(sim, {
        human: () => ({ ...hp, rotY: yawTo(hp, sim.world.bots[0]) }),
        duration: 5, humanHp: Infinity, stopOnDeath: false,
        onTick: (tt, s, h) => { if (Math.abs(tt - 2) < 1e-9) humanFires(s, h, tt, { toPos: [0, 0, 0] }); },
      });
      const st = res.states.get('b0');
      const z = tt => st.find(s => Math.abs(s.t - tt) < 1e-9).pos[2];
      moved = Math.min(moved, z(4.5) - z(2.7));
      shots += shotsAtHuman(res).length;
    }
    t.diagnostic(`ouviu o tiro atrás do morro: andou ≥ ${f2(moved)} m na direção dele entre 2,7 e 4,5 s; disparos contra ele ${shots}`);
    assert.ok(moved >= 5, `o bot não foi investigar o tiro que ouviu (${f2(moved)} m)`);
    assert.equal(shots, 0, 'o bot atirou em quem só ouviu, atrás do morro');
  });
});
