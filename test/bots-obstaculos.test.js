'use strict';

/* ================================================================
   B7 (rocha) e árvore — os bots conhecem os OBSTÁCULOS
   (docs/mobile/criterio-aaa.md; laudo docs/mobile/validacao-070502f.md).

   Relato do dono (2026-09-28): "falta corrigir os bots... atirar através de
   parede, isso é o principal". Prédios, castelo e bases o bot já respeitava
   (test/bots-paredes.test.js); o validador mediu que ele via e atirava
   através de PEDRA (33 de 41 pares) e de árvore (21 de 23): árvore, pedra,
   cacto e barril nasciam do Math.random global seedado depois do terreno e
   da grama, e o Node não os reconstruía. A vítima recusava o dano (o
   `rayBlockedAt` dela conhece os obstáculos), mas o bot virava, perseguia e
   metralhava a pedra na frente do jogador.

   Agora os obstáculos são dado puro com sorteio próprio (js/obstaculos.js;
   paridade com a grade do `obstaclesNear` do cliente em
   test/obstaculos-paridade.test.js) e o processo dos bots monta a consulta
   deles junto com terreno e paredes.

   ÂNCORA independente do código sob teste: a marcha fina (2 cm) deste
   arquivo, ponto-dentro-de-cilindro sobre a LISTA de obstáculos da semente
   com a regra do `rayBlockedAt` (raio r·√0,8, até 3,4 m acima do chão do
   ponto) — não a consulta analítica de js/obstaculos.js nem a visada do bot.
   Relevo: marcha de 5 cm (a de bots-visada); paredes: marcha de 2 cm sobre
   as caixas (a de bots-paredes). Os pares escolhidos têm relevo e paredes
   LIVRES: o que esconde é o obstáculo.

   Tudo no LAÇO REAL: `tickBots` com o socket falso que só grava o que o bot
   emitiu (o dublê de bots-combate/bots-paredes). O bot fica de guarda.
   ================================================================ */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const Bots = require(path.join(__dirname, '..', 'scripts', 'bots.js'));
const { mulberry32 } = require(path.join(__dirname, '..', 'server.js'));

const SEED = 424242;
const EYE = 1.5, HEAD = 1.6, TRUNK = 1.0;
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const HUMAN = 'humano';
const R2F = 0.8, TETO = 3.4;          // a regra do rayBlockedAt (game.js)
const f2 = x => (Number.isFinite(x) ? x.toFixed(2) : String(x));
const importar = f => import(pathToFileURL(path.join(__dirname, '..', 'js', f)).href);

function yawTo(from, to) { return Math.atan2(-(to.x - from.x), -(to.z - from.z)); }
function angDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return Math.abs(d);
}

/* ---------------- mundo da semente ---------------- */

let terrain = null, Par = null, Ob = null, mundo = null, intactas = null, solids = null, ob = null, obst = null;

/* ---------------- âncoras ---------------- */

const dentroCaixa = (w, p) => p.x > w.x0 && p.x < w.x1 && p.y > w.y0 && p.y < w.y1 && p.z > w.z0 && p.z < w.z1;
function paredeEntre(a, b, passo = 0.02) {
  const lx = Math.min(a.x, b.x), hx = Math.max(a.x, b.x), lz = Math.min(a.z, b.z), hz = Math.max(a.z, b.z);
  const perto = intactas.filter(w => w.x1 >= lx && w.x0 <= hx && w.z1 >= lz && w.z0 <= hz);
  if (!perto.length) return false;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / passo));
  const p = { x: 0, y: 0, z: 0 };
  for (let i = 1; i < n; i++) {
    const k = i / n;
    p.x = a.x + dx * k; p.y = a.y + dy * k; p.z = a.z + dz * k;
    for (const w of perto) if (dentroCaixa(w, p)) return true;
  }
  return false;
}
function relevoEntre(a, b, passo = 0.05) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / passo));
  for (let i = 1; i < n; i++) {
    const k = i / n;
    if (terrain.heightAt(a.x + dx * k, a.z + dz * k) > a.y + dy * k) return true;
  }
  return false;
}
const dentroCilindro = (o, p) => (p.x - o.x) ** 2 + (p.z - o.z) ** 2 < o.r * o.r * R2F && p.y - terrain.heightAt(p.x, p.z) < TETO;
/* marcha de 2 cm: algum ponto do segmento dentro de algum cilindro de `lista` */
function obstaculoEntre(lista, a, b, passo = 0.02) {
  const lx = Math.min(a.x, b.x) - 4, hx = Math.max(a.x, b.x) + 4, lz = Math.min(a.z, b.z) - 4, hz = Math.max(a.z, b.z) + 4;
  const perto = lista.filter(o => o.x >= lx && o.x <= hx && o.z >= lz && o.z <= hz);
  if (!perto.length) return false;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / passo));
  const p = { x: 0, y: 0, z: 0 };
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    p.x = a.x + dx * k; p.y = a.y + dy * k; p.z = a.z + dz * k;
    for (const o of perto) if (dentroCilindro(o, p)) return true;
  }
  return false;
}

const corpo = (x, z) => {
  const y = terrain.heightAt(x, z);
  return { x, y, z, olho: { x, y: y + EYE, z }, cabeca: { x, y: y + HEAD, z }, tronco: { x, y: y + TRUNK, z }, pe: { x, y: y + 0.1, z } };
};
/* ninguém nasce dentro de caixa, nem de cilindro (o jogador é empurrado para
   fora do círculo r + 0,42 m; o bot, não — mas aqui ele começa fora) */
const livre = c => ![c.pe, c.tronco, c.cabeca, c.olho].some(p => intactas.some(w => dentroCaixa(w, p)))
  && !ob.solidos.some(o => Math.hypot(c.x - o.x, c.z - o.z) < o.r + 0.45);

/* o que a âncora diz de um par bot → humano */
function visada(bot, hum, lista = ob.solidos) {
  const relevo = relevoEntre(bot.olho, hum.cabeca) || relevoEntre(bot.olho, hum.tronco);
  const parede = paredeEntre(bot.olho, hum.cabeca) || paredeEntre(bot.olho, hum.tronco);
  const cab = obstaculoEntre(lista, bot.olho, hum.cabeca), tro = obstaculoEntre(lista, bot.olho, hum.tronco);
  return { relevo, parede, escondido: cab && tro, aVista: !cab && !tro };
}
/* nem o relevo nem a parede escondem; SÓ obstáculos da família escondem os dois pontos */
function escondidoPor(fam, bot, hum) {
  const v = visada(bot, hum, ob.solidos.filter(o => o.sourceId === fam));
  return !v.relevo && !v.parede && v.escondido;
}
function aVista(bot, hum) {
  const v = visada(bot, hum);
  return !v.relevo && !v.parede && v.aVista;
}

/* Pares escondidos atrás de um obstáculo da família: o humano a 0,5–3 m da
   borda do colisor, do lado de lá; o bot a 10–70 m do lado de cá, com a reta
   passando por dentro do cilindro. */
function paresAtras(fam, { n, seed, dMin = 10, dMax = 70, porObstaculo = 1, tentativas = 60 }) {
  const r = mulberry32(seed);
  const lista = ob.solidos.filter(o => o.sourceId === fam && Math.max(Math.abs(o.x), Math.abs(o.z)) < 500);
  const out = [];
  for (let i = lista.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [lista[i], lista[j]] = [lista[j], lista[i]]; }
  for (const o of lista) {
    let achados = 0;
    for (let k = 0; k < tentativas && achados < porObstaculo && out.length < n; k++) {
      const R = o.r * Math.sqrt(R2F);
      const ang = r() * TAU, ux = Math.sin(ang), uz = Math.cos(ang);
      const atras = o.r + 0.5 + r() * 2.5, frente = dMin + r() * (dMax - dMin), lat = (r() * 2 - 1) * R * 0.5;
      const hum = corpo(o.x + ux * atras, o.z + uz * atras);
      const bot = corpo(o.x - ux * frente - uz * lat, o.z - uz * frente + ux * lat);
      if (!livre(hum) || !livre(bot)) continue;
      if (!escondidoPor(fam, bot, hum)) continue;
      out.push({ bot, hum, o });
      achados++;
    }
    if (out.length >= n) break;
  }
  return out;
}

/* ---------------- laço real ---------------- */

function sockDe(id, out) {
  return {
    emit: (ev, payload) => out.push({ from: id, ev, payload }),
    volatile: { emit: (ev, payload) => out.push({ from: id, ev, payload, volatile: true }) },
    timeout: () => ({ emit: (ev, payload, cb) => cb && cb(new Error('sem servidor no teste')) }),
  };
}

/* Bot de guarda em `bot`, olhando 20° ao lado do humano (dentro do cone);
   humano parado em `hum(t)` olhando para o bot. `comObstaculos`: o mundo do
   processo real (terreno + paredes + obstáculos) ou o de antes (sem os
   obstáculos). */
function sentinela({ bot, hum, dur = 10, seed = 1, weapon = 'FUZIL', comObstaculos = true, soltaEm = Infinity,
  alvoBot = false, onTick = null }) {
  const world = Bots.createBotWorld();
  world.terrain = terrain;
  world.solids = solids;
  world.obstacles = comObstaculos ? obst : null;
  world.plan = { zone: [] };
  const rng = mulberry32(seed);
  const out = [];
  const h0 = hum(0);
  const dir = { x: h0.x - bot.x, z: h0.z - bot.z }, dl = Math.hypot(dir.x, dir.z);
  const c = Math.cos(20 * DEG), s = Math.sin(20 * DEG);
  const wd = { x: (dir.x * c - dir.z * s) / dl, z: (dir.x * s + dir.z * c) / dl };
  const b = Bots.createBotState(0, sockDe('b0', out), rng);
  Bots.resetBotForMatch(b);
  Object.assign(b, { id: 'b0', phase: 'PLAY', x: bot.x, z: bot.z, y: bot.y, weapon, ammo: 1e6, hp: 1e9, mira: 0.9,
    yaw: Math.atan2(-wd.x, -wd.z), wp: [bot.x + wd.x * 500, bot.z + wd.z * 500] });
  world.bots.push(b);
  let alvo = null;
  if (alvoBot) {
    alvo = Bots.createBotState(1, sockDe('b1', []), rng);
    Bots.resetBotForMatch(alvo);
    Object.assign(alvo, { id: 'b1', phase: 'PLAY', x: h0.x, z: h0.z, y: terrain.heightAt(h0.x, h0.z), weapon: 'FACA', hp: 1e9 });
    world.bots.push(alvo);
  }
  const res = { shots: [], hits: [], states: [], track: [], world };
  for (let k = 0; k * 0.1 < dur - 1e-9; k++) {
    const t = k / 10;
    if (t < soltaEm) { b.x = bot.x; b.z = bot.z; b.y = bot.y; }
    const h = hum(t);
    if (alvo) { alvo.x = h.x; alvo.z = h.z; alvo.y = terrain.heightAt(h.x, h.z); alvo.wp = [h.x, h.z]; }
    else Bots.observePlayerUpdate(world.observedPlayers, { id: HUMAN, pos: [h.x, terrain.heightAt(h.x, h.z), h.z], rotY: yawTo(h, b), bot: false });
    res.track.push({ t, x: h.x, z: h.z });
    if (onTick) onTick(t, world, b, h);
    out.length = 0;
    Bots.tickBots(world, t, rng);
    for (const e of out) {
      if (e.from !== 'b0') continue;
      if (e.volatile) { if (e.ev === 'state') res.states.push({ t, rotY: e.payload.rotY, pos: e.payload.pos.slice() }); continue; }
      if (e.ev === 'shotHit' || e.ev === 'shotFired') {
        if (!res.shots.length || res.shots[res.shots.length - 1].t !== t) res.shots.push({ t, ev: e.ev, payload: e.payload });
        if (e.ev === 'shotHit' && !res.hits.some(x => x.t === t)) res.hits.push({ t });
      }
    }
  }
  return res;
}

/* o bot virou para o humano (rotY a ≤ 2° da direção dele) em [t0, t1) */
function virou(res, t0 = 0, t1 = Infinity, lockDeg = 2) {
  const track = new Map(res.track.map(p => [Math.round(p.t * 10), p]));
  return res.states.some(s => {
    if (s.t < t0 - 1e-9 || s.t >= t1 - 1e-9) return false;
    const h = track.get(Math.round(s.t * 10));
    return h && angDiff(s.rotY, yawTo({ x: s.pos[0], z: s.pos[2] }, h)) <= lockDeg * DEG;
  });
}

function conta(pares, comObstaculos, extra = {}) {
  let tiros = 0, acertos = 0, viradas = 0, comTiro = 0;
  pares.forEach((p, i) => {
    const res = sentinela({ bot: p.bot, hum: () => p.hum, seed: i + 1, comObstaculos, ...extra });
    tiros += res.shots.length; acertos += res.hits.length;
    if (res.shots.length) comTiro++;
    if (virou(res)) viradas++;
  });
  return { tiros, acertos, viradas, comTiro, n: pares.length };
}
const fmt = c => `${c.comTiro}/${c.n} pares com tiro — ${c.tiros} disparos, ${c.acertos} acertos, ${c.viradas} viradas`;

/* ponto perto de um centro que satisfaz `quer` */
function pontoPerto(c, rMin, rMax, seed, quer, tentativas = 400) {
  const r = mulberry32(seed >>> 0);
  for (let k = 0; k < tentativas; k++) {
    const a = r() * TAU, d = rMin + r() * (rMax - rMin);
    const p = corpo(c.x + Math.sin(a) * d, c.z + Math.cos(a) * d);
    if (!livre(p)) continue;
    if (quer(p)) return p;
  }
  return null;
}

const G = {};

describe('B7 — bots não veem nem atiram através de pedra, árvore, cacto e POI', () => {
  before(async () => {
    Par = await importar('paredes.js');
    Ob = await importar('obstaculos.js');
    const { CFG } = await importar('config.js');
    terrain = await Bots.createBotTerrain(SEED);
    mundo = Par.construirMundoSolido({ worldSeed: SEED, heightAt: terrain.heightAt, slopeAt: terrain.slopeAt,
      WATER_LEVEL: terrain.WATER_LEVEL, CITY: terrain.CITY });
    intactas = Par.paredesDoJogo(mundo);
    solids = await Bots.createBotSolids(SEED, terrain);
    ob = Ob.construirObstaculos({ worldSeed: SEED, heightAt: terrain.heightAt, slopeAt: terrain.slopeAt, biomeAt: terrain.biomeAt,
      noise: (x, z) => terrain.simplex.noise(x, z), WATER_LEVEL: terrain.WATER_LEVEL, CITY: terrain.CITY, VOLCANO: terrain.VOLCANO,
      sitios: mundo.plano.sites, WORLD_SIZE: CFG.WORLD_SIZE, TREE_COUNT: CFG.TREE_COUNT, ROCK_COUNT: CFG.ROCK_COUNT });
    obst = typeof Bots.createBotObstacles === 'function'
      ? await Bots.createBotObstacles(SEED, terrain)
      : Ob.criarConsultaObstaculos(ob.solidos, { heightAt: terrain.heightAt, grade: terrain.losGrid });

    G.pedra = paresAtras('rock', { n: 40, seed: 11, porObstaculo: 1 });
    G.arvore = paresAtras('tree', { n: 40, seed: 12, porObstaculo: 1 });
    G.cacto = paresAtras('cactus', { n: 20, seed: 13, porObstaculo: 1, dMax: 45 });
    G.poi = [...paresAtras('mercado', { n: 6, seed: 14, porObstaculo: 6, tentativas: 400 }),
      ...paresAtras('refúgio', { n: 6, seed: 15, porObstaculo: 6, tentativas: 400 }),
      ...paresAtras('tent', { n: 4, seed: 16, porObstaculo: 4, tentativas: 400, dMin: 8, dMax: 25 })];
    G.escondidos = [...G.pedra, ...G.arvore, ...G.cacto, ...G.poi];
    // controle: MESMA posição de bot, humano à vista (relevo, paredes e obstáculos livres)
    G.aVista = G.escondidos.map((p, i) => pontoPerto(p.bot, 12, 60, 500 + i, h => aVista(p.bot, h)))
      .map((hum, i) => hum && { bot: G.escondidos[i].bot, hum }).filter(Boolean);
    // à vista em A; em B, perto (1,5–4 m), atrás de pedra ou árvore
    G.cauda = [];
    for (const p of [...G.pedra, ...G.arvore]) {
      if (G.cauda.length >= 40) break;
      const A = pontoPerto(p.hum, 1.5, 4, Math.round(p.hum.x * 131 + p.hum.z * 7), h => aVista(p.bot, h));
      if (A) G.cauda.push({ bot: p.bot, A, B: p.hum });
    }
  });

  it('o mundo do bot conhece os obstáculos da semente: mesma lista de js/obstaculos.js, consulta pronta', () => {
    assert.equal(typeof Bots.createBotObstacles, 'function', 'scripts/bots.js não monta obstáculos (createBotObstacles)');
    assert.deepEqual(obst.solidos, ob.solidos, 'os obstáculos do bot não são os da semente');
    assert.equal(typeof obst.segmentoBloqueado, 'function');
  });

  it('o cenário exercita obstáculo de verdade: pares escondidos SÓ pela família, com relevo e paredes livres', (t) => {
    t.diagnostic(`seed ${SEED}: escondidos atrás de pedra ${G.pedra.length}, árvore ${G.arvore.length}, cacto ${G.cacto.length}, POI (mercado/refúgio/tenda) ${G.poi.length}; controles à vista ${G.aVista.length}; cauda ${G.cauda.length}`);
    assert.ok(G.pedra.length >= 30, `só ${G.pedra.length} pares atrás de pedra`);
    assert.ok(G.arvore.length >= 30, `só ${G.arvore.length} pares atrás de árvore`);
    assert.ok(G.cacto.length >= 10, `só ${G.cacto.length} pares atrás de cacto`);
    assert.ok(G.poi.length >= 8, `só ${G.poi.length} pares atrás de POI`);
    assert.ok(G.aVista.length >= G.escondidos.length * 0.9, `controles à vista: ${G.aVista.length}`);
    assert.ok(G.cauda.length >= 20, `só ${G.cauda.length} pares de cauda`);
  });

  it('humano parado e calado atrás de pedra/árvore/cacto/POI por 10 s — 0 disparos, 0 acertos, 0 viradas', (t) => {
    const linhas = [];
    const total = { tiros: 0, acertos: 0, viradas: 0 };
    for (const [nome, pares] of [['pedra', G.pedra], ['árvore', G.arvore], ['cacto', G.cacto], ['POI', G.poi]]) {
      const sem = conta(pares, false), com = conta(pares, true);
      linhas.push(`${nome}: sem obstáculos ${fmt(sem)}; com obstáculos ${fmt(com)}`);
      for (const k of Object.keys(total)) total[k] += com[k];
    }
    t.diagnostic(linhas.join(' · '));
    assert.equal(total.tiros, 0, `o bot disparou ${total.tiros} vezes contra humano atrás de obstáculo`);
    assert.equal(total.acertos, 0, `o bot acertou ${total.acertos} vezes através de obstáculo`);
    assert.equal(total.viradas, 0, `o bot virou ${total.viradas} vezes para humano atrás de obstáculo`);
  });

  it('bot contra bot: outro bot atrás da pedra/árvore também não é alvejado', (t) => {
    let tiros = 0, sem = 0;
    [...G.pedra.slice(0, 12), ...G.arvore.slice(0, 12)].forEach((p, i) => {
      tiros += sentinela({ bot: p.bot, hum: () => p.hum, seed: i + 1, alvoBot: true }).shots.length;
      sem += sentinela({ bot: p.bot, hum: () => p.hum, seed: i + 1, alvoBot: true, comObstaculos: false }).shots.length;
    });
    t.diagnostic(`bot atrás de pedra/árvore (24 pares, 10 s): ${tiros} tiros com obstáculos; ${sem} sem`);
    assert.ok(sem > 20, `o caso não exercita bot contra bot: ${sem} tiros sem obstáculos`);
    assert.equal(tiros, 0, `o bot atirou ${tiros} vezes em outro bot atrás de obstáculo`);
  });

  it('controle: com os obstáculos, o humano À VISTA da mesma posição é visto e alvejado (não é bot cego)', (t) => {
    let engajou = 0;
    G.aVista.forEach((p, i) => {
      const res = sentinela({ bot: p.bot, hum: () => p.hum, seed: i + 1 });
      if (virou(res) && res.shots.length) engajou++;
    });
    t.diagnostic(`humano à vista (âncora de 2 cm): o bot virou e atirou em ${engajou}/${G.aVista.length}`);
    assert.ok(engajou >= G.aVista.length - 1, `o bot ignorou ${G.aVista.length - engajou} de ${G.aVista.length} humanos à vista`);
  });

  it('a bala não atravessa pedra/árvore: quem pisa atrás dela não leva o tiro decidido 0,6 s antes', (t) => {
    const T = 12;
    let antes = 0, tirosCauda = 0, acertosCauda = 0, tirosDepois = 0, semObst = 0;
    G.cauda.forEach((p, i) => {
      const hum = tt => (tt < T ? p.A : p.B);
      const res = sentinela({ bot: p.bot, hum, dur: T + 6, seed: i + 1 });
      antes += res.hits.filter(h => h.t < T).length;
      tirosCauda += res.shots.filter(s => s.t >= T && s.t < T + 0.7).length;
      acertosCauda += res.hits.filter(h => h.t >= T && h.t < T + 0.7).length;
      tirosDepois += res.shots.filter(s => s.t >= T + 0.7).length;
      semObst += sentinela({ bot: p.bot, hum, dur: T + 6, seed: i + 1, comObstaculos: false }).hits.filter(h => h.t >= T).length;
    });
    t.diagnostic(`${G.cauda.length} pares: acertos antes de esconder ${antes}; nos 0,7 s depois: ${tirosCauda} tiros, ${acertosCauda} acertos; depois disso ${tirosDepois} tiros; sem obstáculos, ${semObst} acertos atrás dele`);
    assert.ok(antes > 20, 'controle: o bot tinha de estar acertando o humano à vista');
    assert.equal(acertosCauda, 0, `${acertosCauda} acertos atravessaram o obstáculo (bala resolvida contra a posição atrasada)`);
    assert.equal(tirosDepois, 0, `o bot seguiu atirando ${tirosDepois} vezes depois de o humano sumir atrás do obstáculo`);
  });

  it('ouvir atravessa pedra: o humano atrás dela que atira é ouvido (o bot vira e vai ver), mas não é alvejado', (t) => {
    let ouviu = 0, tiros = 0;
    const pares = [...G.pedra, ...G.arvore].slice(0, 30);
    pares.forEach((p, i) => {
      const res = sentinela({
        bot: p.bot, hum: () => p.hum, dur: 8, seed: i + 1,
        onTick: (tt, w, b, h) => {
          if (Math.abs(tt - 3) > 1e-9) return;
          const hy = terrain.heightAt(h.x, h.z);
          Bots.onPlayerFired(w, b, { shooterId: HUMAN, weapon: 'FUZIL', fromPos: [h.x, hy + 1.5, h.z], toPos: [h.x, hy, h.z + 30] }, tt);
        },
      });
      // ouviu = virou para a direção do som (tolerância de cone, não de mira)
      if (virou(res, 3, 5, 25)) ouviu++;
      tiros += res.shots.length;
    });
    t.diagnostic(`${pares.length} humanos atrás de pedra/árvore atirando aos 3 s: o bot virou para o som em ${ouviu}; disparou ${tiros} vezes`);
    assert.ok(ouviu >= pares.length * 0.9, `o bot ouviu só ${ouviu}/${pares.length} tiros atrás do obstáculo`);
    assert.equal(tiros, 0, `o bot atirou ${tiros} vezes em quem ele só ouviu atrás do obstáculo`);
  });

  /* bot com o olho DENTRO do colisor de uma pedra grande; humano a 15–50 m
     com a reta livre de todo o resto (relevo, paredes, outros obstáculos) */
  const dentroDePedra = () => {
    const pedras = ob.solidos.filter(o => o.sourceId === 'rock' && o.r * Math.sqrt(R2F) > 1.2).slice(0, 25);
    const pares = [];
    pedras.forEach((o, i) => {
      const bot = corpo(o.x, o.z);
      if (!dentroCilindro(o, bot.olho) || intactas.some(w => dentroCaixa(w, bot.olho))) return;
      const hum = pontoPerto(bot, 15, 50, 900 + i, h => !relevoEntre(bot.olho, h.cabeca) && !paredeEntre(bot.olho, h.cabeca)
        && !obstaculoEntre(ob.solidos.filter(x => x !== o), bot.olho, h.cabeca)
        && !obstaculoEntre(ob.solidos.filter(x => x !== o), bot.olho, h.tronco));
      if (hum) pares.push({ bot, hum, o });
    });
    return pares;
  };

  it('bot DENTRO do colisor de uma pedra (atravessou andando) não enxerga nem atira para fora', (t) => {
    const pares = dentroDePedra();
    let tiros = 0, viradas = 0, semObst = 0;
    pares.forEach((p, i) => {
      const res = sentinela({ bot: p.bot, hum: () => p.hum, seed: i + 1 });
      tiros += res.shots.length;
      if (virou(res)) viradas++;
      semObst += sentinela({ bot: p.bot, hum: () => p.hum, seed: i + 1, comObstaculos: false }).shots.length;
    });
    t.diagnostic(`${pares.length} bots dentro de pedra grande, humano a 15–50 m com o resto livre: ${tiros} tiros, ${viradas} viradas; sem obstáculos, ${semObst} tiros`);
    assert.ok(pares.length >= 8, `só ${pares.length} bots dentro de pedra`);
    assert.ok(semObst > 0, 'o caso não exercita: sem obstáculos o bot também não atira');
    assert.equal(tiros, 0, `bot de dentro da pedra atirou ${tiros} vezes`);
    assert.equal(viradas, 0, `bot de dentro da pedra virou ${viradas} vezes para o humano`);
  });

  it('de dentro da pedra o bot não dispara — nem na cauda da reação (o traçante nasceria dentro dela)', (t) => {
    /* A reta que NASCE dentro do cilindro já sai barrada (o bot de dentro não
       enxerga — caso acima). O que sobra é a cauda da reação: o bot via o
       humano de FORA e, andando, entrou na pedra; por 0,6 s ele age sobre o
       que via e o tiro sairia de dentro dela. Cenário: bot de guarda a
       1,2–2 m da borda do colisor, na reta até o humano; aos T s ele passa
       para o centro da pedra. Âncora do "de dentro": o ponto do fromPos
       contra a lista de obstáculos (cilindro), não a consulta do bot. */
    const T = 10;
    let antes = 0, deDentro = 0, rodadas = 0;
    dentroDePedra().forEach((p, i) => {
      const dx = p.hum.x - p.o.x, dz = p.hum.z - p.o.z, dl = Math.hypot(dx, dz);
      const R = p.o.r * Math.sqrt(R2F);
      const fora = corpo(p.o.x + dx / dl * (R + 1.2 + (i % 3) * 0.4), p.o.z + dz / dl * (R + 1.2 + (i % 3) * 0.4));
      if (!livre(fora) || !aVista(fora, p.hum)) return;
      for (let k = 0; k < 4; k++) {
        rodadas++;
        const res = sentinela({ bot: fora, hum: () => p.hum, dur: T + 1.5, seed: 60 + i * 4 + k,
          onTick: (tt, w, b) => { if (tt >= T) { b.x = p.bot.x; b.z = p.bot.z; b.y = p.bot.y; } } });
        antes += res.shots.filter(s => s.t < T).length;
        deDentro += res.shots.filter(s => s.t >= T && ob.solidos.some(o => dentroCilindro(o,
          { x: s.payload.fromPos[0], y: s.payload.fromPos[1], z: s.payload.fromPos[2] }))).length;
      }
    });
    t.diagnostic(`${rodadas} rodadas: ${antes} disparos de fora (o bot via o humano); depois de entrar na pedra, ${deDentro} disparos com a boca dentro dela`);
    assert.ok(rodadas >= 20 && antes >= rodadas, `o caso não exercita o bot atirando antes de entrar: ${antes} disparos em ${rodadas} rodadas`);
    assert.equal(deDentro, 0, `${deDentro} disparos saíram de dentro da pedra`);
  });

  it('custo a 10 Hz: 16 bots + 4 humanos — na floresta (o pior caso dos obstáculos) e na cidade', (t) => {
    const medir = (cx, cz, comObstaculos) => {
      const world = Bots.createBotWorld();
      world.terrain = terrain;
      world.solids = solids;
      world.obstacles = comObstaculos ? obst : null;
      world.plan = { zone: [] };
      const rng = mulberry32(99), layout = mulberry32(5);
      const sock = { emit: () => {}, volatile: { emit: () => {} }, timeout: () => ({ emit: () => {} }) };
      const weapons = ['FUZIL', 'ESCOPETA', 'DMR', 'PLASMA', 'SNIPER', 'FUZIL', 'DMR', 'FUZIL'];
      for (let i = 0; i < 16; i++) {
        const b = Bots.createBotState(i, sock, rng);
        Bots.resetBotForMatch(b);
        const x = cx + layout() * 110, z = cz + layout() * 110;
        Object.assign(b, { id: `b${i}`, phase: 'PLAY', x, z, y: terrain.heightAt(x, z), weapon: weapons[i % weapons.length], ammo: 1e6, hp: 1e9, yaw: layout() * TAU });
        world.bots.push(b);
      }
      const humans = [0, 1, 2, 3].map(i => ({ id: `h${i}`, x: cx + layout() * 110, z: cz + layout() * 110 }));
      const ms = [];
      for (let k = 0; k < 600; k++) {
        const tt = k / 10;
        for (const h of humans) {
          h.x += Math.sin(tt + h.z) * 0.3; h.z += Math.cos(tt + h.x) * 0.3;
          Bots.observePlayerUpdate(world.observedPlayers, { id: h.id, pos: [h.x, terrain.heightAt(h.x, h.z), h.z], rotY: 0 });
        }
        const t0 = process.hrtime.bigint();
        Bots.tickBots(world, tt, rng);
        ms.push(Number(process.hrtime.bigint() - t0) / 1e6);
      }
      const s = ms.slice(20).sort((a, b) => a - b); // descarta o aquecimento do JIT
      const q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
      return { p50: q(0.5), p99: q(0.99), max: s[s.length - 1] };
    };
    // a floresta mais densa da semente: o quadrado de 110 m com mais árvores
    let floresta = null, melhor = -1;
    for (let x = -480; x <= 370; x += 20) for (let z = -480; z <= 370; z += 20) {
      const n = ob.solidos.filter(o => o.sourceId === 'tree' && o.x >= x && o.x < x + 110 && o.z >= z && o.z < z + 110).length;
      if (n > melhor) { melhor = n; floresta = { x, z }; }
    }
    const cx = mundo.cidade.cx - 55, cz = mundo.cidade.cz - 55;
    medir(floresta.x, floresta.z, true); // aquece o JIT
    const fSem = medir(floresta.x, floresta.z, false), fCom = medir(floresta.x, floresta.z, true);
    const cSem = medir(cx, cz, false), cCom = medir(cx, cz, true);
    const fmtq = r => `p50 ${f2(r.p50)} ms, p99 ${f2(r.p99)} ms, máx ${f2(r.max)} ms`;
    t.diagnostic(`floresta (${melhor} árvores em 110 × 110 m) — só paredes: ${fmtq(fSem)}; paredes + obstáculos: ${fmtq(fCom)}`);
    t.diagnostic(`cidade — só paredes: ${fmtq(cSem)}; paredes + obstáculos: ${fmtq(cCom)}`);
    // D5: p99 < 100 ms no processo real; aqui metade do passo, como em bots-visada
    assert.ok(fCom.p99 < 50, `o tick dos bots na floresta custa ${f2(fCom.p99)} ms no p99`);
    assert.ok(cCom.p99 < 50, `o tick dos bots na cidade custa ${f2(cCom.p99)} ms no p99`);
  });
});

/* ================================================================
   O CAMINHO REAL: server.js de verdade (porta alta) manda o `init` com a
   semente, e o `startBots` de verdade monta terreno + paredes + obstáculos
   JUNTOS. Sem obstáculos o bot veria através de pedra em silêncio — então
   eles fazem parte do "tudo ou nada" da geometria (B12c).
   ================================================================ */
const net = require('node:net');
const os = require('node:os');
const { spawn } = require('node:child_process');

async function portaLivre() {
  const base = 49100 + (process.pid % 400) * 2;
  for (let p = base; p < 50000; p++) {
    const ok = await new Promise(res => {
      const s = net.createServer();
      s.once('error', () => res(false));
      s.listen(p, () => s.close(() => res(true)));
    });
    if (ok) return p;
  }
  throw new Error('sem porta livre em 49100–50000');
}

describe('obstáculos no processo real: o init traz a semente e o startBots monta os obstáculos com o terreno', () => {
  it('world.obstacles do processo real == js/obstaculos.js da semente do servidor', async (t) => {
    if (!ob) {
      Par = await importar('paredes.js');
      Ob = await importar('obstaculos.js');
      const { CFG } = await importar('config.js');
      terrain = await Bots.createBotTerrain(SEED);
      mundo = Par.construirMundoSolido({ worldSeed: SEED, heightAt: terrain.heightAt, slopeAt: terrain.slopeAt,
        WATER_LEVEL: terrain.WATER_LEVEL, CITY: terrain.CITY });
      ob = Ob.construirObstaculos({ worldSeed: SEED, heightAt: terrain.heightAt, slopeAt: terrain.slopeAt, biomeAt: terrain.biomeAt,
        noise: (x, z) => terrain.simplex.noise(x, z), WATER_LEVEL: terrain.WATER_LEVEL, CITY: terrain.CITY, VOLCANO: terrain.VOLCANO,
        sitios: mundo.plano.sites, WORLD_SIZE: CFG.WORLD_SIZE, TREE_COUNT: CFG.TREE_COUNT, ROCK_COUNT: CFG.ROCK_COUNT });
    }
    const port = await portaLivre();
    const rank = path.join(os.tmpdir(), `fps-bots-obst-rank-${process.pid}-${port}.json`);
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
    const bots = Bots.startBots(1, `http://localhost:${port}`, { watchdog: false });
    t.after(() => bots.stop());
    const w = bots.world;
    const fim = Date.now() + 8000;
    while (!(w.terrain && w.solids && w.obstacles)) {
      if (Date.now() > fim) throw new Error(`o processo dos bots não montou a geometria: terreno ${!!w.terrain}, paredes ${!!w.solids}, obstáculos ${!!w.obstacles}`);
      await new Promise(r => setTimeout(r, 25));
    }
    assert.deepEqual(w.obstacles.solidos, ob.solidos, 'os obstáculos do processo dos bots não são os da semente do servidor');
    t.diagnostic(`processo real: ${w.obstacles.solidos.length} obstáculos da semente ${SEED} montados junto com terreno e paredes`);
  });
});
