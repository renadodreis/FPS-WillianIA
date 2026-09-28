'use strict';

/* ================================================================
   Decisão do dono (2026-09-28): bots NÃO acertam quem está no helicóptero.

   O laudo docs/mobile/validacao-070502f.md mediu (achado 4): dublê com o
   estado `heli` a 12 m do chão, bot a 25 m — 19 de 20 atiram e acertam
   (38–128 de dano em 14 s); `scripts/bots.js` não tinha a palavra "heli".

   O `playerUpdate` que o servidor difunde traz `heli` (e `car`): quem está
   no helicóptero manda a pose DELE (br-game.js), e o bot não o escolhe como
   alvo, não vira para ele e não atira — voando ou pousado. Quem desce do
   helicóptero volta a ser alvo (o bot não fica cego para ele de vez).

   Tudo no LAÇO REAL (`tickBots` com o socket falso de bots-combate), no
   mundo da semente (terreno + paredes + obstáculos); e o caminho do dado,
   no fim, com o server.js de verdade: o `state` de um cliente com
   `heli: true` chega ao processo dos bots como `heli: true`.
   ================================================================ */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const Bots = require(path.join(__dirname, '..', 'scripts', 'bots.js'));
const { mulberry32 } = require(path.join(__dirname, '..', 'server.js'));

const SEED = 424242;
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const HUMAN = 'piloto';
const ALTURA = 12;

function yawTo(from, to) { return Math.atan2(-(to.x - from.x), -(to.z - from.z)); }
function angDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return Math.abs(d);
}

let terrain = null, solids = null, obstacles = null;

function sockDe(id, out) {
  return {
    emit: (ev, payload) => out.push({ from: id, ev, payload }),
    volatile: { emit: (ev, payload) => out.push({ from: id, ev, payload, volatile: true }) },
    timeout: () => ({ emit: (ev, payload, cb) => cb && cb(new Error('sem servidor no teste')) }),
  };
}

/* bot de guarda olhando 20° ao lado do humano; `estado(t)` diz a altura
   acima do chão e se ele está no helicóptero naquele instante */
function sentinela({ bot, hum, estado, dur = 14, seed = 1, onTick = null }) {
  const world = Bots.createBotWorld();
  world.terrain = terrain;
  world.solids = solids;
  world.obstacles = obstacles;
  world.plan = { zone: [] };
  const rng = mulberry32(seed);
  const out = [];
  const dir = { x: hum.x - bot.x, z: hum.z - bot.z }, dl = Math.hypot(dir.x, dir.z);
  const c = Math.cos(20 * DEG), s = Math.sin(20 * DEG);
  const wd = { x: (dir.x * c - dir.z * s) / dl, z: (dir.x * s + dir.z * c) / dl };
  const b = Bots.createBotState(0, sockDe('b0', out), rng);
  Bots.resetBotForMatch(b);
  const by = terrain.heightAt(bot.x, bot.z);
  Object.assign(b, { id: 'b0', phase: 'PLAY', x: bot.x, z: bot.z, y: by, weapon: 'FUZIL', ammo: 1e6, hp: 1e9, mira: 0.9,
    yaw: Math.atan2(-wd.x, -wd.z), wp: [bot.x + wd.x * 500, bot.z + wd.z * 500] });
  world.bots.push(b);
  const res = { shots: [], hits: [], viradas: [] };
  for (let k = 0; k * 0.1 < dur - 1e-9; k++) {
    const t = k / 10;
    b.x = bot.x; b.z = bot.z; b.y = by;
    const e = estado(t);
    const hy = terrain.heightAt(hum.x, hum.z) + e.alt;
    Bots.observePlayerUpdate(world.observedPlayers, { id: HUMAN, pos: [hum.x, hy, hum.z], rotY: yawTo(hum, b),
      bot: false, heli: e.heli, car: -1 });
    if (onTick) onTick(t, world, b, hy);
    out.length = 0;
    Bots.tickBots(world, t, rng);
    for (const ev of out) {
      if (ev.volatile) {
        if (ev.ev === 'state' && angDiff(ev.payload.rotY, yawTo(b, hum)) <= 2 * DEG) res.viradas.push(t);
        continue;
      }
      if (ev.ev === 'shotHit' || ev.ev === 'shotFired') {
        if (!res.shots.length || res.shots[res.shots.length - 1] !== t) res.shots.push(t);
        if (ev.ev === 'shotHit' && res.hits[res.hits.length - 1] !== t) res.hits.push(t);
      }
    }
  }
  return res;
}

const PARES = [];

describe('bots não alvejam quem está no helicóptero (decisão do dono)', () => {
  before(async () => {
    terrain = await Bots.createBotTerrain(SEED);
    solids = await Bots.createBotSolids(SEED, terrain);
    obstacles = typeof Bots.createBotObstacles === 'function' ? await Bots.createBotObstacles(SEED, terrain) : null;
    // 20 pares: humano a 25 m do bot, com a visada LIVRE até o piloto (12 m
    // acima do chão) e até ele no chão — relevo, paredes e (se houver) obstáculos
    const r = mulberry32(4242);
    const livre = (a, b) => Bots.clearSight(terrain, solids.intact, a, b)
      && !(obstacles && obstacles.segmentoBloqueado(a, b));
    for (let k = 0; k < 5000 && PARES.length < 20; k++) {
      const bx = (r() * 2 - 1) * 420, bz = (r() * 2 - 1) * 420, a = r() * TAU;
      const hx = bx + Math.sin(a) * 25, hz = bz + Math.cos(a) * 25;
      const olho = { x: bx, y: terrain.heightAt(bx, bz) + 1.5, z: bz };
      const hy = terrain.heightAt(hx, hz);
      if (terrain.heightAt(bx, bz) < terrain.WATER_LEVEL + 1 || hy < terrain.WATER_LEVEL + 1) continue;
      if (solids.intact.contains(olho)) continue;
      if (![hy + 1.0, hy + 1.6, hy + ALTURA + 1.0, hy + ALTURA + 1.6].every(y => livre(olho, { x: hx, y, z: hz }))) continue;
      PARES.push({ bot: { x: bx, z: bz }, hum: { x: hx, z: hz } });
    }
  });

  it('observePlayerUpdate guarda o `heli` do servidor (e desliga quando ele desce)', () => {
    const m = new Map();
    assert.equal(Bots.observePlayerUpdate(m, { id: 'p', pos: [0, 12, 0], heli: true }).heli, true);
    assert.equal(Bots.observePlayerUpdate(m, { id: 'p', pos: [0, 0, 0], heli: false }).heli, false);
    assert.equal(Bots.observePlayerUpdate(m, { id: 'p', pos: [0, 0, 0] }).heli, false, 'sem o campo: a pé');
  });

  it('controle: o MESMO humano a 12 m do chão, fora do helicóptero, é visto e alvejado', (t) => {
    let comTiro = 0, acertos = 0;
    PARES.forEach((p, i) => {
      const res = sentinela({ ...p, estado: () => ({ alt: ALTURA, heli: false }), seed: i + 1 });
      if (res.shots.length) comTiro++;
      acertos += res.hits.length;
    });
    t.diagnostic(`${PARES.length} pares a 25 m, humano a ${ALTURA} m do chão SEM helicóptero: ${comTiro} bots atiraram, ${acertos} acertos em 14 s`);
    assert.ok(PARES.length >= 15, `só ${PARES.length} pares com visada livre`);
    assert.ok(comTiro >= PARES.length - 1, `o controle não exercita: só ${comTiro}/${PARES.length} atiraram`);
  });

  it('no helicóptero, a 12 m do chão: 0 disparos, 0 acertos, 0 viradas em 14 s', (t) => {
    let tiros = 0, acertos = 0, viradas = 0;
    PARES.forEach((p, i) => {
      const res = sentinela({ ...p, estado: () => ({ alt: ALTURA, heli: true }), seed: i + 1 });
      tiros += res.shots.length; acertos += res.hits.length; viradas += res.viradas.length ? 1 : 0;
    });
    t.diagnostic(`${PARES.length} pilotos a ${ALTURA} m, bot a 25 m: ${tiros} disparos, ${acertos} acertos, ${viradas} bots viraram`);
    assert.equal(tiros, 0, `o bot disparou ${tiros} vezes em quem está no helicóptero`);
    assert.equal(acertos, 0, `o bot acertou ${acertos} vezes quem está no helicóptero`);
    assert.equal(viradas, 0, `${viradas} bots viraram para o helicóptero`);
  });

  it('helicóptero pousado (piloto na altura do chão): também 0 disparos', (t) => {
    let tiros = 0;
    PARES.forEach((p, i) => { tiros += sentinela({ ...p, estado: () => ({ alt: 0, heli: true }), seed: i + 1 }).shots.length; });
    t.diagnostic(`${PARES.length} helicópteros pousados: ${tiros} disparos`);
    assert.equal(tiros, 0, `o bot disparou ${tiros} vezes em quem está no helicóptero pousado`);
  });

  it('quem embarca no meio do tiroteio deixa de levar tiro NA HORA; quem desembarca volta a ser alvo', (t) => {
    /* Depois de perder o alvo o bot volta a patrulhar e vira para outro lado
       (sai do cone): a volta é medida com o piloto que desce e ATIRA — o som
       abre o cone (onPlayerFired) e, a pé, ele tem de ser visto e alvejado de
       novo. Dentro do helicóptero o mesmo tiro não o torna alvo. */
    const EMBARCA = 8, DESCE = 16;
    let antes = 0, noHeli = 0, depois = 0;
    PARES.forEach((p, i) => {
      const atira = (tt, w, b, hy) => {
        if (Math.abs(tt - 12) > 1e-9 && Math.abs(tt - (DESCE + 0.5)) > 1e-9) return;
        Bots.onPlayerFired(w, b, { shooterId: HUMAN, weapon: 'FUZIL', fromPos: [p.hum.x, hy + 1.5, p.hum.z], toPos: [p.bot.x, hy, p.bot.z] }, tt);
      };
      const res = sentinela({ ...p, dur: 26, seed: i + 1, onTick: atira,
        estado: tt => (tt >= EMBARCA && tt < DESCE ? { alt: 0, heli: true } : { alt: 0, heli: false }) });
      antes += res.shots.filter(s => s < EMBARCA).length;
      noHeli += res.shots.filter(s => s >= EMBARCA && s < DESCE).length;
      if (res.shots.some(s => s >= DESCE)) depois++;
    });
    t.diagnostic(`${PARES.length} pares: tiros a pé antes de embarcar ${antes}; dentro do helicóptero ${noHeli}; voltaram a levar tiro depois de descer ${depois}/${PARES.length}`);
    assert.ok(antes >= PARES.length, `controle: o bot tinha de estar atirando antes do embarque (${antes})`);
    assert.equal(noHeli, 0, `${noHeli} disparos em quem já estava no helicóptero (nem a fila de reação de 0,6 s vale)`);
    assert.ok(depois >= PARES.length - 1, `depois de descer só ${depois}/${PARES.length} voltaram a ser alvejados`);
  });
});

/* ================================================================
   O caminho do dado: um cliente de verdade manda `state` com heli: true ao
   server.js de verdade, e o processo dos bots (startBots) recebe o
   `playerUpdate` com heli: true — é nele que a regra acima se apoia.
   ================================================================ */
const net = require('node:net');
const os = require('node:os');
const { spawn } = require('node:child_process');

async function portaLivre() {
  const base = 50100 + (process.pid % 400) * 2;
  for (let p = base; p < 51000; p++) {
    const ok = await new Promise(res => {
      const s = net.createServer();
      s.once('error', () => res(false));
      s.listen(p, () => s.close(() => res(true)));
    });
    if (ok) return p;
  }
  throw new Error('sem porta livre em 50100–51000');
}

describe('heli no processo real: servidor → bots', () => {
  it('o `state` com heli: true de um cliente chega ao processo dos bots como heli: true (e volta a false)', async (t) => {
    const port = await portaLivre();
    const rank = path.join(os.tmpdir(), `fps-bots-heli-rank-${process.pid}-${port}.json`);
    const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, PORT: String(port), HOST_CODE: 'QA123', WORLD_SEED: String(SEED), RANK_FILE: rank },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    t.after(() => srv.kill());
    await new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('servidor não subiu')), 8000);
      srv.stdout.on('data', d => { if (String(d).includes('Servidor BR no ar')) { clearTimeout(to); res(); } });
      srv.once('exit', c => rej(new Error('servidor morreu cedo: ' + c)));
    });
    const url = `http://localhost:${port}`;
    const bots = Bots.startBots(1, url, { watchdog: false });
    t.after(() => bots.stop());
    const { io } = require('socket.io-client');
    const cli = io(url, { transports: ['websocket'] });
    t.after(() => cli.close());
    const init = await new Promise(res => cli.once('init', res));
    cli.emit('hello', { nick: 'PILOTO' });
    const espera = async (cond, ms, msg) => {
      const fim = Date.now() + ms;
      while (!cond()) {
        if (Date.now() > fim) throw new Error(msg);
        await new Promise(r => setTimeout(r, 25));
      }
    };
    const visto = () => bots.world.observedPlayers.get(init.id);
    let heli = true;
    const manda = setInterval(() => cli.emit('state', { pos: [10, 20, 10], rotY: 0, car: -1, heli, crouch: 0 }), 100);
    t.after(() => clearInterval(manda));
    await espera(() => visto() && visto().heli === true, 5000, 'o processo dos bots não recebeu heli: true');
    heli = false;
    await espera(() => visto() && visto().heli === false, 5000, 'o processo dos bots não recebeu heli: false na volta');
  });
});
