'use strict';

/* ================================================================
   POSTURA NOS BOTS — o humano agachado, medido no LAÇO REAL (`tickBots`).

   O humano é um dublê que só manda `playerUpdate`, agora com `crouch` (o
   campo que o servidor sanitiza e repassa: test/postura-servidor.test.js).
   Nada aqui monta condutor próprio: cada tick chama `tickBots`, a mesma
   função do `setInterval` de 100 ms de scripts/bots.js, com um socket falso
   que só grava o que o bot emitiu (o mesmo dublê de test/bots-combate.test.js).

   Fontes (docs/mobile/referencia-bots.md):
   - Game AI Pro 3, cap. 33: "we will keep the base delay if the player is
     standing (i.e., the multiplier is 1), but double it if they are
     crouching" — o intervalo entre acertos DOBRA;
   - CS (cs_bot_vision.cpp), chance de notar por 0,25 s, perto → longe:
     parado em pé 100 → 10, parado agachado 80 → 5; andando em pé 100 → 75,
     andando agachado 90 → 60 — de longe, parado e agachado leva o DOBRO;
   - critério B10 (docs/mobile/criterio-aaa.md): "o cliente mentiroso ganha no
     máximo esse fator — nunca some do bot".
   ================================================================ */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const Bots = require(path.join(__dirname, '..', 'scripts', 'bots.js'));
const { mulberry32 } = require(path.join(__dirname, '..', 'server.js'));

const DT = 0.1;
const HUMAN = 'humano';
const DEG = Math.PI / 180;
const FLAT = Object.freeze({ heightAt: () => 0 });

function yawTo(from, to) { return Math.atan2(-(to.x - from.x), -(to.z - from.z)); }
function angDiff(a, b) {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}
function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
}
const f2 = x => (Number.isFinite(x) ? x.toFixed(2) : String(x));

function makeSim({ seed, bots, terrain = FLAT }) {
  const rng = mulberry32(seed >>> 0);
  const world = Bots.createBotWorld();
  world.terrain = terrain;
  world.plan = { zone: [] };
  const out = [];
  const ground = (x, z) => terrain.heightAt(x, z);
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
      weapon: spec.weapon || 'FUZIL', ammo: 1e6, hp: 1e9,
    });
    if (spec.mira != null) b.mira = spec.mira;
    if (spec.yaw != null) b.yaw = spec.yaw;
    if (spec.wp) b.wp = spec.wp.slice();
    world.bots.push(b);
  });
  return { world, rng, out, ground };
}

/* laço real a 10 Hz. `human(t)` → {x, z, rotY, crouch}. Rajada (vários
   `shotHit` do mesmo bot no mesmo tick) conta como UM evento de acerto.
   `deGuarda`: o bot fica no lugar (cenário de sentinela — a patrulha dele
   sortearia um waypoint e mudaria a distância no meio da medida). Só a
   POSIÇÃO é presa; virar, perceber e atirar continuam com o `tickBots`. */
function run(sim, { human, duration, deGuarda = false }) {
  const res = { hitEvents: [], shotsAtHuman: 0, hitsShots: 0, states: [], humanTrack: [] };
  const posto = sim.world.bots.map(b => ({ b, x: b.x, z: b.z }));
  for (let k = 0; k * DT < duration - 1e-9; k++) {
    const t = k / 10;
    if (deGuarda) for (const p of posto) { p.b.x = p.x; p.b.z = p.z; p.b.y = sim.ground(p.x, p.z); }
    const h = human(t);
    const hy = sim.ground(h.x, h.z);
    Bots.observePlayerUpdate(sim.world.observedPlayers, {
      id: HUMAN, pos: [h.x, hy, h.z], rotY: h.rotY || 0, bot: false, crouch: h.crouch,
    });
    res.humanTrack.push({ t, x: h.x, z: h.z });
    sim.out.length = 0;
    Bots.tickBots(sim.world, t, sim.rng);
    const emitted = sim.out.slice();
    const hitThisTick = new Set();
    for (const e of emitted) {
      if (e.volatile) {
        if (e.ev === 'state') res.states.push({ t, from: e.from, rotY: e.payload.rotY, pos: e.payload.pos.slice() });
        continue;
      }
      if (e.ev === 'shotHit' && e.payload.targetId === HUMAN) {
        if (!hitThisTick.has(e.from)) { hitThisTick.add(e.from); res.hitEvents.push({ t, from: e.from }); res.hitsShots++; res.shotsAtHuman++; }
      } else if (e.ev === 'shotFired') {
        // erro: a quem se dirigia? só há o humano de alvo possível nestes cenários
        res.shotsAtHuman++;
      }
    }
  }
  return res;
}

/* primeiro instante em que o bot VIROU para o humano (rotY a ≤ `lockDeg` dele).
   Alvo andando de lado: o bot mira onde o viu 0,6 s antes (reação), então a
   2,6 m/s a 40 m a mira fica ~2,2° atrás — o limiar precisa ser mais largo. */
function lockOnT(res, botId = 'b0', lockDeg = 2) {
  const track = new Map(res.humanTrack.map(p => [Math.round(p.t * 10), p]));
  for (const s of res.states) {
    if (s.from !== botId) continue;
    const h = track.get(Math.round(s.t * 10));
    if (!h) continue;
    if (angDiff(s.rotY, yawTo({ x: s.pos[0], z: s.pos[2] }, h)) <= lockDeg * DEG) return s.t;
  }
  return null;
}

/* menor intervalo entre EVENTOS de acerto consecutivos no humano */
function minGap(res) {
  let m = Infinity;
  for (let i = 1; i < res.hitEvents.length; i++) m = Math.min(m, res.hitEvents[i].t - res.hitEvents[i - 1].t);
  return m;
}

/* humano parado a `d` m ao norte, dentro do cone (20° da frente do bot, que
   anda para o waypoint dele): o "virar" é o momento em que o bot percebeu */
function percepcao({ d, crouch, seeds = 40, anda = 0 }) {
  const locks = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const base = { x: d * Math.sin(20 * DEG), z: d * Math.cos(20 * DEG) };
    const bot = { x: 0, z: 0 };
    const sim = makeSim({ seed, bots: [{ id: 'b0', ...bot, mira: 0.9, yaw: yawTo(bot, { x: 0, z: 1 }), wp: [0, 500] }] });
    const res = run(sim, {
      duration: 14, deGuarda: true,
      human: tt => {
        // `anda` m/s de lado, perpendicular à linha até o bot (distância ~constante)
        const p = { x: base.x + anda * tt * Math.cos(20 * DEG), z: base.z - anda * tt * Math.sin(20 * DEG) };
        return { ...p, rotY: yawTo(p, bot), crouch };
      },
    });
    locks.push(lockOnT(res, 'b0', anda > 0 ? 6 : 2));
  }
  return locks;
}

describe('Postura nos bots — agachado conta e mentir não vira invisibilidade (laço real)', () => {
  it('percepção: humano AGACHADO e parado a 30 e 60 m leva o dobro do medidor para ser notado (CS: 10 % → 5 % longe)', (t) => {
    const R = Bots.AI.REACTION_S;
    for (const d of [30, 60]) {
      const emPe = percepcao({ d, crouch: 0 });
      const agach = percepcao({ d, crouch: 1 });
      const okP = emPe.filter(x => x != null), okA = agach.filter(x => x != null);
      const mP = median(okP), mA = median(okA);
      // o virar = reação + medidor; a razão que a fonte fixa é a do MEDIDOR
      const razao = (mA - R) / (mP - R);
      t.diagnostic(`${d} m parado: em pé virou aos ${f2(mP)} s (${okP.length}/40), agachado aos ${f2(mA)} s (${okA.length}/40); medidor ×${f2(razao)}`);
      assert.equal(okP.length, 40, `controle: em pé a ${d} m o bot não percebeu em 14 s`);
      assert.equal(okA.length, 40, `agachado a ${d} m SUMIU do bot: percebido em ${okA.length}/40`);
      assert.ok(razao >= 1.8 && razao <= 2.2, `medidor agachado × em pé a ${d} m = ${f2(razao)} (fonte: ×2)`);
    }
  });

  it('percepção: agachado ANDANDO a 2,6 m/s é notado ~1,25× mais devagar que em pé andando (CS: 75 → 60 longe)', (t) => {
    const R = Bots.AI.REACTION_S;
    const emPe = percepcao({ d: 40, crouch: 0, anda: 2.6 }).filter(x => x != null);
    const agach = percepcao({ d: 40, crouch: 1, anda: 2.6 }).filter(x => x != null);
    const razao = (median(agach) - R) / (median(emPe) - R);
    t.diagnostic(`40 m andando a 2,6 m/s: em pé ${f2(median(emPe))} s, agachado ${f2(median(agach))} s; medidor ×${f2(razao)}`);
    assert.equal(agach.length, 40, 'agachado andando sumiu do bot');
    assert.ok(razao >= 1.1 && razao <= 1.4, `medidor andando agachado × em pé = ${f2(razao)} (fonte: 75/60 = ×1,25)`);
  });

  it('acerto: intervalo mínimo entre acertos no humano AGACHADO é ≥ 2× o de em pé — 1 e 4 bots de fuzil, 1 de bazuca (cap. 33)', (t) => {
    // arco de sentinelas a 27,5 m (abaixo dos 28 m em que o bot avança
    // atirando), 26,7° entre si, todas olhando para o humano: a vizinha fica a
    // 76,7° da frente e o cone a 12,7 m tem 72,6° — nenhuma vê a outra. De guarda, para a patrulha não juntá-las (aí elas se engajam
    // entre si e o caso deixa de medir o humano).
    // A bazuca (cadência 2,4 s) é o caso em que o intervalo GLOBAL dobrado
    // (2,0 s) não alcança nada: sozinho, quem limita o bot é a cadência dele.
    const cenario = ({ crouch, nBots, seed, weapon }) => {
      const angles = nBots === 1 ? [0] : [-40, -40 / 3, 40 / 3, 40];
      const bots = angles.map((a, i) => {
        const p = { x: 27.5 * Math.sin(a * DEG), z: 27.5 * Math.cos(a * DEG) };
        return { id: `b${i}`, ...p, weapon, mira: 0.9, yaw: yawTo(p, { x: 0, z: 0 }), wp: [0, 0] };
      });
      const sim = makeSim({ seed, bots });
      return run(sim, { duration: 90, deGuarda: true,
        human: () => ({ x: 0, z: 0, rotY: yawTo({ x: 0, z: 0 }, { x: 0, z: 1 }), crouch }) });
    };
    for (const [nBots, weapon] of [[1, 'FUZIL'], [4, 'FUZIL'], [1, 'BAZUCA']]) {
      const gaps = { 0: Infinity, 1: Infinity }, hits = { 0: 0, 1: 0 }, shots = { 0: 0, 1: 0 };
      for (let seed = 1; seed <= 20; seed++) {
        for (const c of [0, 1]) {
          const res = cenario({ crouch: c, nBots, seed, weapon });
          gaps[c] = Math.min(gaps[c], minGap(res));
          hits[c] += res.hitEvents.length;
          shots[c] += res.shotsAtHuman;
        }
      }
      t.diagnostic(`${nBots} bot(s) de ${weapon} a 27,5 m, 20 × 90 s: intervalo mínimo em pé ${f2(gaps[0])} s × agachado ${f2(gaps[1])} s ` +
        `(×${f2(gaps[1] / gaps[0])}); eventos de acerto ${hits[0]} × ${hits[1]}; disparos ${shots[0]} × ${shots[1]}; ` +
        `acerto por disparo ${f2(hits[0] / shots[0])} × ${f2(hits[1] / shots[1])}`);
      assert.ok(hits[0] >= 40 && hits[1] >= 20, `poucos acertos para medir (${hits[0]} em pé, ${hits[1]} agachado)`);
      assert.ok(gaps[1] >= 2 * gaps[0] - 1e-9, `${nBots} × ${weapon}: agachado ${f2(gaps[1])} s < 2 × em pé ${f2(gaps[0])} s`);
      // "no máximo esse fator": o ganho não passa do ×2 da fonte (+1 tick de 0,1 s)
      assert.ok(gaps[1] <= 2 * gaps[0] + 0.1 + 1e-9, `${nBots} × ${weapon}: agachado ganhou mais que ×2 (${f2(gaps[1])} s × ${f2(gaps[0])} s)`);
    }
  });

  it('mentir postura não some do bot: "agachado" sempre, em campo aberto, ainda é percebido, alvejado e ferido', (t) => {
    const duelo = crouch => {
      let percebeu = 0, feriu = 0;
      const ttks = [];
      for (let seed = 1; seed <= 20; seed++) {
        const sim = makeSim({ seed, bots: [{ id: 'b0', x: 0, z: 0, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, { x: 0, z: 1 }), wp: [0, 500] }] });
        const res = run(sim, { duration: 60, human: () => ({ x: 0, z: 30, rotY: yawTo({ x: 0, z: 30 }, sim.world.bots[0]), crouch }) });
        if (lockOnT(res) != null) percebeu++;
        if (res.hitEvents.length) feriu++;
        // 100 HP, rajada do fuzil = 2 × 14 por evento: morre no 4º
        if (res.hitEvents.length >= 4) ttks.push(res.hitEvents[3].t);
      }
      return { percebeu, feriu, ttk: median(ttks) };
    };
    const emPe = duelo(0), mente = duelo(1);
    t.diagnostic(`duelo a 30 m, 20 sementes: em pé TTK mediano ${f2(emPe.ttk)} s; "agachado" o tempo todo: percebido ` +
      `${mente.percebeu}/20, ferido ${mente.feriu}/20, TTK mediano ${f2(mente.ttk)} s (×${f2(mente.ttk / emPe.ttk)})`);
    assert.equal(mente.percebeu, 20, 'quem diz agachado sumiu da percepção do bot');
    assert.equal(mente.feriu, 20, 'quem diz agachado ficou imune ao bot');
    // o ganho total é limitado pelos dois fatores da fonte (medidor ×2 e intervalo ×2)
    assert.ok(mente.ttk <= 2.5 * emPe.ttk, `ganho de TTK ×${f2(mente.ttk / emPe.ttk)} passa do limite dos fatores da fonte`);
  });

  it('crista baixa: esconde o AGACHADO (cabeça a ~1,0 m) e não o em pé (cabeça a 1,6 m) — a postura muda o que o bot vê', (t) => {
    // crista de 1,4 m a meio caminho: a reta olho(1,5 m) → cabeça em pé (1,6 m)
    // passa a 1,55 m (livre); → cabeça agachada (~1,0 m) passa a ~1,25 m (barrada)
    const ridge = { heightAt: (x, z) => 1.4 * Math.exp(-((z - 20) ** 2) / (2 * 0.8 * 0.8)) };
    // humano 20° fora da frente do bot: virar para ele exige percebê-lo
    const H = { x: 40 * Math.sin(20 * DEG), z: 40 * Math.cos(20 * DEG) };
    const cena = (crouch, seed) => {
      const sim = makeSim({ seed, terrain: ridge, bots: [{ id: 'b0', x: 0, z: 0, mira: 0.9, yaw: yawTo({ x: 0, z: 0 }, { x: 0, z: 1 }), wp: [0, 500] }] });
      return run(sim, { duration: 12, deGuarda: true, human: () => ({ ...H, rotY: yawTo(H, { x: 0, z: 0 }), crouch }) });
    };
    let viuEmPe = 0, viuAgach = 0, tirosAgach = 0;
    for (let seed = 1; seed <= 20; seed++) {
      if (lockOnT(cena(0, seed)) != null) viuEmPe++;
      const r = cena(1, seed);
      if (lockOnT(r) != null) viuAgach++;
      tirosAgach += r.shotsAtHuman;
    }
    t.diagnostic(`atrás da crista de 1,4 m: em pé visto ${viuEmPe}/20; agachado visto ${viuAgach}/20, ${tirosAgach} disparos nele`);
    assert.equal(viuEmPe, 20, 'controle: em pé, com a cabeça acima da crista, o bot tinha de ver');
    assert.equal(viuAgach, 0, 'agachado atrás da crista foi visto (o bot usa a altura de quem está em pé)');
    assert.equal(tirosAgach, 0);
  });

  it('observePlayerUpdate: postura inválida vira 0, válida fica em [0, 1]', () => {
    const obs = new Map();
    for (const [cru, esp] of [[1, 1], [0.4, 0.4], [9, 1], [-1, 0], ['1', 0], [null, 0], [undefined, 0], [NaN, 0]]) {
      const p = Bots.observePlayerUpdate(obs, { id: 'x', pos: [0, 0, 0], crouch: cru });
      assert.equal(p.crouch, esp, `crouch ${JSON.stringify(cru)} observado como ${p.crouch}`);
    }
  });
});
