'use strict';

/* ================================================================
   B7 — os bots conhecem os PRÉDIOS (docs/mobile/criterio-aaa.md).

   Antes: `lineOfSight` só conhecia o relevo. O bot via através da cidade,
   do castelo e das cabanas, virava, perseguia e metralhava a parede (o dano
   não passava porque a VÍTIMA recusa por cobertura — mas o bot que persegue e
   atira na parede É a sensação de wallhack; PUBG 12.1, referência §1.2).

   Agora o processo dos bots reconstrói, só pela semente, as MESMAS caixas que
   o cliente usa (`js/paredes.js`, paridade caixa a caixa com `Structures.walls`
   em test/paredes-paridade.test.js) e troca a consulta quando o servidor
   publica a cidade destruída (`cityDestruction`, state 'destroyed').

   ÂNCORA independente do código sob teste: a marcha fina (2 cm) deste
   arquivo, ponto-dentro-de-caixa sobre a LISTA de caixas da semente — não o
   slab test de paredes.js nem a visada do bot. O relevo é conferido por uma
   marcha de 5 cm (a mesma âncora de test/bots-visada.test.js), e os pares
   escolhidos têm o relevo LIVRE: o que esconde é a parede, não o morro (B6).

   Tudo no LAÇO REAL: cada tick chama `tickBots` com um socket falso que só
   grava o que o bot emitiu (o dublê de test/bots-combate.test.js). O bot fica
   de guarda (posição presa, como em test/postura-bots.test.js) — virar,
   perceber e atirar continuam com o `tickBots`.

   Árvores, pedras, cactos, a tenda e os POIs são OUTRO módulo puro
   (js/obstaculos.js, desde 2026-09-28) e têm o arquivo deles:
   test/bots-obstaculos.test.js. Aqui os sentinelas montam o mundo com
   terreno + paredes e SEM obstáculos (`world.obstacles` nulo), para que o que
   se mede seja só a parede — os pares foram escolhidos pela âncora de caixas,
   que não conhece pedra nem árvore.

   Antes (seed 424242, 93 humanos atrás de parede, 10 s cada): 534 disparos,
   172 `shotHit` emitidos, 93 viradas; bot contra bot, 110 disparos.
   Reinjeções (cada uma vermelha, com número): sem paredes → 534 disparos;
   consulta da cidade TROCADA → 103 disparos através da cidade de pé; cidade
   que nunca cai → 0/30 vistos sobre os escombros; 'cinematic' derrubando a
   cidade → 49 tiros/viradas antes do impacto; sem o `s.on('cityDestruction')`
   → o processo real segue com a cidade de pé; bala sem parede → 7 acertos na
   cauda da reação; bot de dentro da parede enxergando → 47 disparos; sem a
   trava do fogo de dentro → 15 disparos com a boca na parede; grupos apertados
   (−5 cm) → 57/40 000 segmentos divergem; visada só em pé → 262 disparos no
   agachado atrás da mureta; erro sem o −1 m → B11 0,3 %; erro no rosto → 379
   a < 0,42 m.
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
const f2 = x => (Number.isFinite(x) ? x.toFixed(2) : String(x));

function yawTo(from, to) { return Math.atan2(-(to.x - from.x), -(to.z - from.z)); }
function angDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return Math.abs(d);
}

/* ---------------- âncora ---------------- */

const dentro = (w, p) => p.x > w.x0 && p.x < w.x1 && p.y > w.y0 && p.y < w.y1 && p.z > w.z0 && p.z < w.z1;
function dentroDeAlguma(caixas, p) {
  for (const w of caixas) if (dentro(w, p)) return true;
  return false;
}
/* marcha de `passo` m ao longo do segmento: algum ponto dentro de alguma caixa */
function paredeEntre(caixas, a, b, passo = 0.02) {
  const lx = Math.min(a.x, b.x), hx = Math.max(a.x, b.x);
  const ly = Math.min(a.y, b.y), hy = Math.max(a.y, b.y);
  const lz = Math.min(a.z, b.z), hz = Math.max(a.z, b.z);
  const perto = caixas.filter(w => w.x1 >= lx && w.x0 <= hx && w.y1 >= ly && w.y0 <= hy && w.z1 >= lz && w.z0 <= hz);
  if (!perto.length) return false;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / passo));
  const p = { x: 0, y: 0, z: 0 };
  for (let i = 1; i < n; i++) {
    const k = i / n;
    p.x = a.x + dx * k; p.y = a.y + dy * k; p.z = a.z + dz * k;
    for (const w of perto) if (dentro(w, p)) return true;
  }
  return false;
}
function relevoEntre(terrain, a, b, passo = 0.05) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / passo));
  for (let i = 1; i < n; i++) {
    const k = i / n;
    if (terrain.heightAt(a.x + dx * k, a.z + dz * k) > a.y + dy * k) return true;
  }
  return false;
}

/* ---------------- mundo da semente ---------------- */

let terrain = null, Par = null, mundo = null, intactas = null, destruidas = null, solids = null;
/* o painel do campo de tiro (js/maptoys-core.js) é parede no cliente e no bot,
   com a cidade de pé ou destruída */
async function paredesDasAtracoes() {
  const Ob = await import(pathToFileURL(path.join(__dirname, '..', 'js', 'obstaculos.js')).href);
  const Toys = await import(pathToFileURL(path.join(__dirname, '..', 'js', 'maptoys-core.js')).href);
  const atracoes = Ob.atracoesDaSemente({ worldSeed: SEED, heightAt: terrain.heightAt, slopeAt: terrain.slopeAt,
    biomeAt: terrain.biomeAt, WATER_LEVEL: terrain.WATER_LEVEL, CITY: terrain.CITY, sitios: mundo.plano.sites });
  return Toys.paredesDasAtracoes(atracoes, terrain.heightAt);
}

const corpo = (x, z) => {
  const y = terrain.heightAt(x, z);
  return { x, y, z, olho: { x, y: y + EYE, z }, cabeca: { x, y: y + HEAD, z }, tronco: { x, y: y + TRUNK, z }, pe: { x, y: y + 0.1, z } };
};
/* ninguém nasce dentro de caixa: nem o pé, nem o tronco, nem a cabeça/olho */
const livre = (caixas, c) => ![c.pe, c.tronco, c.cabeca, c.olho].some(p => dentroDeAlguma(caixas, p));

/* o que a âncora diz de um par bot → humano, contra uma lista de caixas */
function visada(caixas, bot, hum) {
  const relevo = relevoEntre(terrain, bot.olho, hum.cabeca) || relevoEntre(terrain, bot.olho, hum.tronco);
  const cab = paredeEntre(caixas, bot.olho, hum.cabeca), tro = paredeEntre(caixas, bot.olho, hum.tronco);
  return { relevo, escondido: cab && tro, aVista: !cab && !tro };
}

/* Sorteia pares ao redor de `centro`: bot a ≤ rMax do centro, humano a
   dMin–dMax m do bot. `quer(bot, hum)` decide se o par entra. */
function amostrar({ centro, rMax, n, seed, dMin = 15, dMax = 70, quer, tentativas = 30000 }) {
  const r = mulberry32(seed);
  const out = [];
  for (let k = 0; k < tentativas && out.length < n; k++) {
    const a = r() * TAU, rr = Math.sqrt(r()) * rMax;
    const bx = centro.x + Math.cos(a) * rr, bz = centro.z + Math.sin(a) * rr;
    const ang = r() * TAU, d = dMin + r() * (dMax - dMin);
    const hx = bx + Math.sin(ang) * d, hz = bz + Math.cos(ang) * d;
    if (Math.max(Math.abs(bx), Math.abs(bz), Math.abs(hx), Math.abs(hz)) > 520) continue;
    const bot = corpo(bx, bz), hum = corpo(hx, hz);
    if (!livre(intactas, bot) || !livre(intactas, hum)) continue;
    const par = quer(bot, hum);
    if (par) out.push(par);
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

/* Um bot de guarda em `bot`, olhando 20° ao lado do humano (dentro do cone);
   humano parado em `hum(t)` olhando para o bot. `solt(t)`: a partir de
   quando o bot é solto (persegue). `alvoBot`: o alvo é outro bot (faca, de
   guarda) em vez de humano. Devolve disparos, acertos, estados. */
function sentinela({ bot, hum, dur = 10, seed = 1, weapon = 'FUZIL', comParedes = true, cidade = null,
  soltaEm = Infinity, alvoBot = false, crouch = 0, onTick = null }) {
  const world = Bots.createBotWorld();
  world.terrain = terrain;
  world.plan = { zone: [] };
  if (comParedes) world.solids = solids;
  if (cidade) Bots.applyCityState(world, { state: cidade });
  const rng = mulberry32(seed);
  const out = [];
  const h0 = hum(0);
  const dir = { x: h0.x - bot.x, z: h0.z - bot.z }, dl = Math.hypot(dir.x, dir.z);
  const c = Math.cos(20 * DEG), s = Math.sin(20 * DEG);
  const wd = { x: (dir.x * c - dir.z * s) / dl, z: (dir.x * s + dir.z * c) / dl };
  const wp = [bot.x + wd.x * 500, bot.z + wd.z * 500];
  const b = Bots.createBotState(0, sockDe('b0', out), rng);
  Bots.resetBotForMatch(b);
  Object.assign(b, { id: 'b0', phase: 'PLAY', x: bot.x, z: bot.z, y: bot.y, weapon, ammo: 1e6, hp: 1e9, mira: 0.9,
    yaw: Math.atan2(-wd.x, -wd.z), wp: wp.slice() });
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
    else {
      Bots.observePlayerUpdate(world.observedPlayers, {
        id: HUMAN, pos: [h.x, terrain.heightAt(h.x, h.z), h.z], rotY: yawTo(h, b), bot: false, crouch,
      });
    }
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

/* ---------------- os pares ---------------- */

const G = {};

describe('B7 — bots não veem através de prédio, castelo nem construção (paredes da seed)', () => {
  before(async () => {
    Par = await import(pathToFileURL(path.join(__dirname, '..', 'js', 'paredes.js')).href);
    terrain = await Bots.createBotTerrain(SEED);
    mundo = Par.construirMundoSolido({ worldSeed: SEED, heightAt: terrain.heightAt, slopeAt: terrain.slopeAt,
      WATER_LEVEL: terrain.WATER_LEVEL, CITY: terrain.CITY });
    const extras = await paredesDasAtracoes();
    intactas = Par.paredesDoJogo(mundo).concat(extras);
    destruidas = Par.paredesComCidadeDestruida(mundo).concat(extras);
    solids = await Bots.createBotSolids(SEED, terrain);

    const cidade = { x: mundo.cidade.cx, z: mundo.cidade.cz };
    const escondido = (bot, hum) => {
      const v = visada(intactas, bot, hum);
      return !v.relevo && v.escondido ? { bot, hum } : null;
    };
    G.cidade = amostrar({ centro: cidade, rMax: 90, n: 40, seed: 11, quer: escondido });
    G.castelo = amostrar({ centro: mundo.plano.forte, rMax: 45, n: 15, seed: 12, quer: escondido });
    G.rural = [];
    const rurais = [...mundo.plano.cabanas, ...mundo.plano.bases, ...mundo.plano.ruinas, ...mundo.plano.torres];
    rurais.forEach((p, i) => G.rural.push(...amostrar({ centro: p, rMax: 22, n: 2, seed: 100 + i, dMin: 8, dMax: 40, quer: escondido })));
    G.escondidos = [...G.cidade, ...G.castelo, ...G.rural];
    const aVista = (caixas, bot, hum) => { const v = visada(caixas, bot, hum); return !v.relevo && v.aVista; };
    const atras = (caixas, bot, hum) => { const v = visada(caixas, bot, hum); return !v.relevo && v.escondido; };
    // controle: MESMA posição de bot, humano à vista (relevo e parede livres)
    G.aVista = G.escondidos.map((p, i) => amostrar({
      centro: p.bot, rMax: 0, n: 1, seed: 500 + i,
      quer: (bot, hum) => (aVista(intactas, bot, hum) ? { bot, hum } : null),
    })[0]).filter(Boolean);

    // à vista em A; em B, perto (1,5–4 m: um passo para trás da quina), escondido
    G.cauda = amostrar({ centro: cidade, rMax: 90, n: 40, seed: 21, dMax: 60, quer: (bot, A) => {
      if (!aVista(intactas, bot, A)) return null;
      const B = pontoPerto(A, 1.5, 4, Math.round(A.x * 131 + A.z * 7), p => atras(intactas, bot, p));
      return B ? { bot, A, B } : null;
    } });
    // à vista em A; em B, longe (8–30 m) e a > 20° de A visto do bot, escondido
    G.persegue = amostrar({ centro: cidade, rMax: 90, n: 30, seed: 22, dMin: 20, dMax: 60, quer: (bot, A) => {
      if (!aVista(intactas, bot, A)) return null;
      const B = pontoPerto(A, 8, 30, Math.round(A.x * 17 + A.z * 131), p =>
        angDiff(yawTo(bot, p), yawTo(bot, A)) > 20 * DEG && atras(intactas, bot, p));
      return B ? { bot, A, B } : null;
    } });
    // escondido com a cidade de pé, à vista sobre os escombros
    G.destruida = amostrar({ centro: cidade, rMax: 90, n: 30, seed: 23, quer: (bot, hum) =>
      (livre(destruidas, bot) && livre(destruidas, hum) && atras(intactas, bot, hum) && aVista(destruidas, bot, hum)
        ? { bot, hum } : null) });
    // bot DENTRO de um prédio maciço (atravessou andando); humano na rua. A
    // conta do rayHit ignora a caixa onde a reta nasce: de dentro, a reta do
    // bot até o humano passa livre — e a do humano até o bot bate na fachada
    const ref = Par.criarConsultaParedes(intactas);
    G.dentro = [];
    mundo.cidade.lotes.filter(L => !L.oco).forEach((L, i) => {
      const bot = corpo(L.bx, L.bz);
      if (!dentroDeAlguma(intactas, bot.olho)) return;
      const hum = pontoPerto(bot, 15, 50, 900 + i, p => {
        if (relevoEntre(terrain, bot.olho, p.cabeca) || relevoEntre(terrain, bot.olho, p.tronco)) return false;
        const brecha = !ref.segmentoBloqueado(bot.olho, p.cabeca) && !ref.segmentoBloqueado(bot.olho, p.tronco);
        return brecha && paredeEntre(intactas, { ...p.cabeca, y: p.y + 1.62 }, bot.olho);
      }, 2000);
      if (hum) G.dentro.push({ bot, hum });
    });
  });

  it('o mundo sólido do bot é o de js/paredes.js: intacto = paredesDoJogo, destruído = paredesComCidadeDestruida (+ o painel do campo de tiro)', () => {
    assert.deepEqual(solids.intact.walls, intactas, 'as caixas do bot (cidade de pé) não são as do jogo');
    assert.deepEqual(solids.destroyed.walls, destruidas, 'as caixas do bot (cidade destruída) não são as do jogo');
    // a consulta do bot responde o mesmo que a de paredes.js (a conta do Structures.rayHit)
    const ref = { intact: Par.criarConsultaParedes(intactas), destroyed: Par.criarConsultaParedes(destruidas) };
    const r = mulberry32(3);
    let dif = 0, bloq = 0, total = 0;
    const cx = mundo.cidade.cx, cz = mundo.cidade.cz;
    for (let i = 0; i < 20000; i++) {
      const perto = i % 2 === 0; // metade dentro da cidade, onde as caixas se amontoam
      const R = perto ? 110 : 520, ox = perto ? cx : 0, oz = perto ? cz : 0;
      const a = { x: ox + (r() * 2 - 1) * R, y: r() * 30, z: oz + (r() * 2 - 1) * R };
      const b = { x: ox + (r() * 2 - 1) * R, y: r() * 30, z: oz + (r() * 2 - 1) * R };
      for (const k of ['intact', 'destroyed']) {
        const want = ref[k].segmentoBloqueado(a, b);
        if (want) bloq++;
        total++;
        if (solids[k].segmentBlocked(a, b) !== want) dif++;
      }
    }
    assert.ok(bloq > 2000, `pré-condição: só ${bloq} de ${total} segmentos batem em parede`);
    assert.equal(dif, 0, `${dif} de ${total} segmentos: a consulta do bot diverge da de paredes.js`);
  });

  it('o cenário exercita prédio de verdade: pares escondidos SÓ pela parede, na cidade, no castelo e no campo', (t) => {
    t.diagnostic(`seed ${SEED}: escondidos pela parede com o relevo livre — cidade ${G.cidade.length}, castelo ${G.castelo.length}, construções do campo ${G.rural.length}; controles à vista ${G.aVista.length}`);
    assert.ok(G.cidade.length >= 30, `só ${G.cidade.length} pares na cidade`);
    assert.ok(G.castelo.length >= 10, `só ${G.castelo.length} pares no castelo`);
    assert.ok(G.rural.length >= 8, `só ${G.rural.length} pares nas construções do campo`);
    assert.ok(G.aVista.length >= G.escondidos.length * 0.9, `controles à vista: ${G.aVista.length}`);
  });

  it('B7: humano parado e calado atrás de parede por 10 s — 0 disparos, 0 acertos, 0 viradas para ele', (t) => {
    const conta = (pares, comParedes) => {
      let tiros = 0, acertos = 0, viradas = 0, comTiro = 0;
      pares.forEach((p, i) => {
        const res = sentinela({ bot: p.bot, hum: () => p.hum, seed: i + 1, comParedes });
        tiros += res.shots.length; acertos += res.hits.length;
        if (res.shots.length) comTiro++;
        if (virou(res)) viradas++;
      });
      return { tiros, acertos, viradas, comTiro };
    };
    const linhas = [];
    let total = { tiros: 0, acertos: 0, viradas: 0 };
    for (const [nome, pares] of [['cidade', G.cidade], ['castelo', G.castelo], ['campo', G.rural]]) {
      const sem = conta(pares, false), com = conta(pares, true);
      linhas.push(`${nome} (${pares.length} pares): sem paredes ${sem.tiros} tiros/${sem.acertos} acertos/${sem.viradas} viradas; com paredes ${com.tiros}/${com.acertos}/${com.viradas}`);
      for (const k of Object.keys(total)) total[k] += com[k];
    }
    t.diagnostic(linhas.join(' · '));
    assert.equal(total.tiros, 0, `o bot disparou ${total.tiros} vezes contra humano atrás de parede`);
    assert.equal(total.acertos, 0, `o bot acertou ${total.acertos} vezes através de parede`);
    assert.equal(total.viradas, 0, `o bot virou ${total.viradas} vezes para humano atrás de parede`);
  });

  it('bot contra bot: outro bot atrás da parede também não é alvejado', (t) => {
    let tiros = 0, semParedes = 0;
    G.cidade.slice(0, 20).forEach((p, i) => {
      tiros += sentinela({ bot: p.bot, hum: () => p.hum, seed: i + 1, alvoBot: true }).shots.length;
      semParedes += sentinela({ bot: p.bot, hum: () => p.hum, seed: i + 1, alvoBot: true, comParedes: false }).shots.length;
    });
    t.diagnostic(`bot atrás de prédio (20 pares, 10 s): ${tiros} tiros com paredes; ${semParedes} sem`);
    assert.ok(semParedes > 20, `o caso não exercita bot contra bot: ${semParedes} tiros sem paredes`);
    assert.equal(tiros, 0, `o bot atirou ${tiros} vezes em outro bot atrás da parede`);
  });

  it('controle: com as paredes, o humano À VISTA da mesma posição é visto e alvejado (não é bot cego)', (t) => {
    let engajou = 0;
    G.aVista.forEach((p, i) => {
      const res = sentinela({ bot: p.bot, hum: () => p.hum, seed: i + 1 });
      if (virou(res) && res.shots.length) engajou++;
    });
    t.diagnostic(`humano à vista (âncora de 2 cm): o bot virou e atirou em ${engajou}/${G.aVista.length}`);
    assert.ok(engajou >= G.aVista.length - 1, `o bot ignorou ${G.aVista.length - engajou} de ${G.aVista.length} humanos à vista`);
  });

  it('o cenário exercita os casos: cauda da reação, perseguição, cidade destruída e bot dentro da parede', (t) => {
    t.diagnostic(`cauda ${G.cauda.length}, perseguição ${G.persegue.length}, cidade destruída ${G.destruida.length}, bot dentro de prédio ${G.dentro.length}`);
    assert.ok(G.cauda.length >= 30, `só ${G.cauda.length} pares de cauda`);
    assert.ok(G.persegue.length >= 20, `só ${G.persegue.length} pares de perseguição`);
    assert.ok(G.destruida.length >= 20, `só ${G.destruida.length} pares de cidade destruída`);
    assert.ok(G.dentro.length >= 3, `só ${G.dentro.length} bots dentro de prédio`);
  });

  it('a bala não atravessa parede: quem entra atrás do prédio não leva o tiro decidido 0,6 s antes', (t) => {
    const T = 12;
    let antes = 0, tirosCauda = 0, acertosCauda = 0, tirosDepois = 0, semParedes = 0;
    G.cauda.forEach((p, i) => {
      const hum = tt => (tt < T ? p.A : p.B);
      const res = sentinela({ bot: p.bot, hum, dur: T + 6, seed: i + 1 });
      antes += res.hits.filter(h => h.t < T).length;
      tirosCauda += res.shots.filter(s => s.t >= T && s.t < T + 0.7).length;
      acertosCauda += res.hits.filter(h => h.t >= T && h.t < T + 0.7).length;
      tirosDepois += res.shots.filter(s => s.t >= T + 0.7).length;
      semParedes += sentinela({ bot: p.bot, hum, dur: T + 6, seed: i + 1, comParedes: false }).hits.filter(h => h.t >= T).length;
    });
    t.diagnostic(`${G.cauda.length} pares: acertos antes de esconder ${antes}; nos 0,7 s depois: ${tirosCauda} tiros, ${acertosCauda} acertos; depois disso ${tirosDepois} tiros; sem paredes, ${semParedes} acertos em B`);
    assert.ok(antes > 30, 'controle: o bot tinha de estar acertando o humano à vista');
    assert.ok(tirosCauda >= 10, `o caso não exercita a reação: só ${tirosCauda} tiros na janela de 0,7 s`);
    assert.equal(acertosCauda, 0, `${acertosCauda} acertos atravessaram a parede (bala resolvida contra a posição atrasada)`);
    assert.equal(tirosDepois, 0, `o bot seguiu atirando ${tirosDepois} vezes depois de o humano sumir atrás da parede`);
  });

  it('perseguição: quem sumiu atrás do prédio é procurado na ÚLTIMA POSIÇÃO VISTA — sem tiro nem virada para onde ele está', (t) => {
    const T = 8, chega = T + 0.6 + Bots.AI.CHASE_AFTER_S + 2;
    let foiParaA = 0, tiros = 0, viradas = 0, vazou = 0, validos = 0;
    G.persegue.forEach((p, i) => {
      let visto = false;
      const res = sentinela({
        bot: p.bot, hum: tt => (tt < T ? p.A : p.B), dur: chega + 0.1, seed: i + 1, soltaEm: T,
        onTick: (tt, w, b) => {
          if (tt < T) return;
          const olho = { x: b.x, y: b.y + EYE, z: b.z };
          if (!paredeEntre(intactas, olho, p.B.cabeca) || !paredeEntre(intactas, olho, p.B.tronco)) visto = true;
        },
      });
      if (visto) { vazou++; return; } // andando, o bot chegou a um ponto de onde B aparece: não é mais o caso
      validos++;
      tiros += res.shots.filter(s => s.t >= T + 0.7).length;
      if (virou(res, T + 0.7)) viradas++;
      const fim = res.states[res.states.length - 1].pos;
      const mv = { x: fim[0] - p.bot.x, z: fim[2] - p.bot.z }, paraA = { x: p.A.x - p.bot.x, z: p.A.z - p.bot.z };
      const cos = (mv.x * paraA.x + mv.z * paraA.z) / (Math.hypot(mv.x, mv.z) * Math.hypot(paraA.x, paraA.z) || 1);
      if (Math.hypot(mv.x, mv.z) > 4 && cos > 0.95) foiParaA++;
    });
    t.diagnostic(`${validos} perseguições (${vazou} descartadas: B ficou à vista no caminho): foi à última posição vista em ${foiParaA}; tiros em B ${tiros}; viradas para B ${viradas}`);
    assert.ok(validos >= 15, `só ${validos} perseguições válidas`);
    assert.equal(tiros, 0, `o bot atirou ${tiros} vezes em quem está atrás do prédio`);
    assert.equal(viradas, 0, `o bot virou ${viradas} vezes para onde o humano ESTÁ (atrás do prédio)`);
    assert.equal(foiParaA, validos, `o bot foi à última posição vista só em ${foiParaA}/${validos}`);
  });

  it('ouvir atravessa parede: o humano atrás do prédio que atira é ouvido (o bot vira e vai ver), mas não é alvejado', (t) => {
    let ouviu = 0, tiros = 0;
    G.cidade.forEach((p, i) => {
      const res = sentinela({
        bot: p.bot, hum: () => p.hum, dur: 8, seed: i + 1,
        onTick: (tt, w, b, h) => {
          if (Math.abs(tt - 3) > 1e-9) return;
          const hy = terrain.heightAt(h.x, h.z);
          Bots.onPlayerFired(w, b, { shooterId: HUMAN, weapon: 'FUZIL', fromPos: [h.x, hy + 1.5, h.z], toPos: [h.x, hy, h.z + 30] }, tt);
        },
      });
      if (virou(res, 3, 5)) ouviu++;
      tiros += res.shots.length;
    });
    t.diagnostic(`${G.cidade.length} humanos atrás de prédio atirando aos 3 s: o bot virou para o som em ${ouviu}; disparou ${tiros} vezes`);
    assert.ok(ouviu >= G.cidade.length * 0.9, `o bot ouviu só ${ouviu}/${G.cidade.length} tiros atrás da parede`);
    assert.equal(tiros, 0, `o bot atirou ${tiros} vezes em quem ele só ouviu atrás da parede`);
  });

  it('bot DENTRO de parede (atravessou um prédio andando) não enxerga nem atira para fora — quem está lá fora também não o vê', (t) => {
    let tiros = 0, viradas = 0;
    G.dentro.forEach((p, i) => {
      const res = sentinela({ bot: p.bot, hum: () => p.hum, seed: i + 1 });
      tiros += res.shots.length;
      if (virou(res)) viradas++;
    });
    t.diagnostic(`${G.dentro.length} bots dentro de prédio maciço, humano na rua a 15–50 m (a reta de dentro passa livre pela conta do rayHit): ${tiros} tiros, ${viradas} viradas`);
    assert.equal(tiros, 0, `bot de dentro da parede atirou ${tiros} vezes`);
    assert.equal(viradas, 0, `bot de dentro da parede virou ${viradas} vezes para o humano`);
  });

  it('de dentro da parede o bot não dispara — nem na cauda da reação (o traçante nasceria dentro do prédio)', (t) => {
    /* O cliente corta o traçante do bot no primeiro obstáculo (br-game.js,
       `MP.rayBlockedAt` no `playerFired`) — MENOS a caixa onde a reta nasce.
       O bot que via o humano de fora e entrou na parede ainda age, por 0,6 s,
       sobre o que via: sem a trava, o tiro sai de dentro do prédio. Cenário:
       o bot de guarda do lado de fora, na reta até o humano; aos T s ele passa
       para dentro do prédio maciço (o que a patrulha faz andando). */
    const T = 10;
    let antes = 0, deDentro = 0, rodadas = 0;
    const ref = Par.criarConsultaParedes(intactas);
    G.dentro.forEach((p, i) => {
      const dx = p.hum.x - p.bot.x, dz = p.hum.z - p.bot.z, dl = Math.hypot(dx, dz);
      // da caixa onde o bot está até o humano, a reta passa livre: sai dela e anda +1,5 m
      let fora = null;
      for (let s = 1; s < dl - 5 && !fora; s += 0.5) {
        const c = corpo(p.bot.x + dx / dl * s, p.bot.z + dz / dl * s);
        if (livre(intactas, c) && !ref.segmentoBloqueado(c.olho, p.hum.cabeca)) fora = corpo(p.bot.x + dx / dl * (s + 1.5), p.bot.z + dz / dl * (s + 1.5));
      }
      if (!fora || !livre(intactas, fora)) return;
      for (let k = 0; k < 6; k++) {
        rodadas++;
        const res = sentinela({ bot: fora, hum: () => p.hum, dur: T + 1.5, seed: 40 + i * 6 + k,
          onTick: (tt, w, b) => { if (tt >= T) { b.x = p.bot.x; b.z = p.bot.z; b.y = p.bot.y; } } });
        antes += res.shots.filter(s => s.t < T).length;
        deDentro += res.shots.filter(s => s.t >= T && dentroDeAlguma(intactas, { x: s.payload.fromPos[0], y: s.payload.fromPos[1], z: s.payload.fromPos[2] })).length;
      }
    });
    t.diagnostic(`${rodadas} rodadas: ${antes} disparos de fora (o bot via o humano); depois de entrar no prédio, ${deDentro} disparos com a boca dentro da parede`);
    assert.ok(rodadas >= 18 && antes >= rodadas, `o caso não exercita o bot atirando antes de entrar: ${antes} disparos em ${rodadas} rodadas`);
    assert.equal(deDentro, 0, `${deDentro} disparos saíram de dentro da parede`);
  });

  it('postura: agachado atrás de mureta (sacos de areia da base, ruína, cobertura do térreo) some; em pé, no mesmo lugar, aparece', (t) => {
    /* O corpo agachado que o bot procura (bots.js, bodyHeights): cabeça a
       1,6 − 0,58 = 1,02 m, tronco a 0,55 m — o desenho do boneco remoto. */
    const agachado = c => ({ cabeca: { ...c.cabeca, y: c.y + 1.02 }, tronco: { ...c.tronco, y: c.y + 0.55 } });
    const quer = (bot, hum) => {
      const a = agachado(hum);
      if (relevoEntre(terrain, bot.olho, hum.cabeca) || relevoEntre(terrain, bot.olho, hum.tronco)
        || relevoEntre(terrain, bot.olho, a.cabeca) || relevoEntre(terrain, bot.olho, a.tronco)) return null;
      const emPeVisto = !paredeEntre(intactas, bot.olho, hum.cabeca);
      const agachadoSome = paredeEntre(intactas, bot.olho, a.cabeca) && paredeEntre(intactas, bot.olho, a.tronco);
      return emPeVisto && agachadoSome ? { bot, hum } : null;
    };
    const centros = [...mundo.plano.bases, ...mundo.plano.ruinas, { x: mundo.cidade.cx, z: mundo.cidade.cz }];
    const pares = [];
    centros.forEach((c, i) => pares.push(...amostrar({ centro: c, rMax: c.x === mundo.cidade.cx ? 80 : 20, n: 6, seed: 700 + i, dMin: 8, dMax: 45, quer })));
    let tirosAgachado = 0, viradasAgachado = 0, emPeEngajou = 0;
    pares.forEach((p, i) => {
      const ag = sentinela({ bot: p.bot, hum: () => p.hum, seed: i + 1, crouch: 1 });
      tirosAgachado += ag.shots.length;
      if (virou(ag)) viradasAgachado++;
      const ep = sentinela({ bot: p.bot, hum: () => p.hum, seed: i + 1, crouch: 0 });
      if (virou(ep) && ep.shots.length) emPeEngajou++;
    });
    t.diagnostic(`${pares.length} humanos atrás de cobertura baixa: agachados, ${tirosAgachado} tiros e ${viradasAgachado} viradas em 10 s; em pé, o bot virou e atirou em ${emPeEngajou}`);
    assert.ok(pares.length >= 10, `só ${pares.length} pares de cobertura baixa`);
    assert.equal(tirosAgachado + viradasAgachado, 0, 'o bot viu o agachado através da mureta');
    assert.ok(emPeEngajou >= pares.length - 1, `em pé ele só foi visto em ${emPeEngajou}/${pares.length}`);
  });

  it('erro perto de prédio (B11): o traçante que o cliente desenha, cortado na parede, continua rente ao rosto', (t) => {
    /* O cliente desenha o erro do bot de fromPos até toPos + 1 m e CORTA no
       primeiro obstáculo (br-game.js, `playerFired` → `MP.rayBlockedAt`):
       traçante nenhum atravessa parede na tela. O que a parede pode estragar é
       o "rente ao rosto" — a reta desviada 0,5–1,5 m bater na quina antes de
       passar pelo humano. Âncora do corte: a marcha de 2 cm deste arquivo
       (paredes) e o passo de 1,6 m do cliente (relevo). Limiar de B11: ≥ 80 %
       a 0,42–1,5 m do olho e a 1,2–2,0 m do pé; 0 a < 0,42 m. */
    const rng = mulberry32(77);
    let n = 0, ok = 0, cortadoAntes = 0, rente = 0;
    const cortar = (a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz);
      const nPassos = Math.ceil(len / 0.02);
      let L = len;
      for (let i = 1; i < nPassos; i++) {
        const k = i / nPassos, p = { x: a.x + dx * k, y: a.y + dy * k, z: a.z + dz * k };
        if (dentroDeAlguma(intactas, p)) { L = len * k; break; }
      }
      for (let s = 1.6; s < L; s += 1.6) {
        const k = s / len;
        if (a.y + dy * k < terrain.heightAt(a.x + dx * k, a.z + dz * k)) { L = s - 0.8; break; }
      }
      return { b: { x: a.x + dx * L / len, y: a.y + dy * L / len, z: a.z + dz * L / len }, L };
    };
    const maisPerto = (a, b, p) => {
      const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, l2 = ab.x ** 2 + ab.y ** 2 + ab.z ** 2;
      const k = Math.max(0, Math.min(1, l2 ? ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / l2 : 0));
      const q = { x: a.x + ab.x * k, y: a.y + ab.y * k, z: a.z + ab.z * k };
      return { d: Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z), q, s: Math.sqrt(l2) * k };
    };
    const pares = amostrar({ centro: { x: mundo.cidade.cx, z: mundo.cidade.cz }, rMax: 90, n: 150, seed: 31, quer: (bot, hum) => {
      const v = visada(intactas, bot, hum);
      return !v.relevo && !v.escondido ? { bot, hum } : null; // o bot atira em quem VÊ (cabeça ou tronco)
    } });
    for (const p of pares) {
      for (let k = 0; k < 10; k++) {
        const shot = Bots.buildMissShot({ x: p.bot.x, y: p.bot.y, z: p.bot.z, weapon: 'FUZIL' }, { x: p.hum.x, y: p.hum.y, z: p.hum.z }, rng);
        const a = { x: shot.fromPos[0], y: shot.fromPos[1], z: shot.fromPos[2] };
        const fim = { x: shot.toPos[0], y: shot.toPos[1] + 1, z: shot.toPos[2] };
        const corte = cortar(a, fim);
        const olho = { x: p.hum.x, y: p.hum.y + HEAD, z: p.hum.z };
        const cheio = maisPerto(a, fim, olho), desenhado = maisPerto(a, corte.b, olho);
        n++;
        if (corte.L < cheio.s - 0.05) cortadoAntes++;
        if (desenhado.d < 0.42) rente++;
        const alt = desenhado.q.y - p.hum.y;
        if (desenhado.d >= 0.42 && desenhado.d <= 1.5 && alt >= 1.2 && alt <= 2.0) ok++;
      }
    }
    t.diagnostic(`${n} erros contra humano à vista na cidade: B11 ok ${(100 * ok / n).toFixed(1)} %; a parede cortou o traçante antes de ele passar pelo rosto em ${(100 * cortadoAntes / n).toFixed(1)} %; a < 0,42 m: ${rente}`);
    assert.ok(n >= 1000, `só ${n} erros medidos`);
    assert.equal(rente, 0, `${rente} erros passaram a menos de 0,42 m do olho`);
    assert.ok(ok >= n * 0.8, `só ${(100 * ok / n).toFixed(1)} % dos erros perto de prédio passam rente ao rosto`);
  });

  it('cidade destruída: com o "destroyed" do servidor o bot passa a ver sobre os escombros — na hora, e só então', (t) => {
    const T = 5;
    let antes = 0, cinematica = 0, engajou = 0;
    G.destruida.forEach((p, i) => {
      const res = sentinela({
        bot: p.bot, hum: () => p.hum, dur: T + 10, seed: i + 1, cidade: 'intact',
        onTick: (tt, w) => {
          if (Math.abs(tt - 2) < 1e-9) Bots.applyCityState(w, { state: 'cinematic' }); // mísseis no céu: cidade ainda de pé
          if (Math.abs(tt - T) < 1e-9) Bots.applyCityState(w, { state: 'destroyed' }); // impacto
        },
      });
      antes += res.shots.filter(s => s.t < 2).length;
      cinematica += res.shots.filter(s => s.t >= 2 && s.t < T + 0.6).length + (virou(res, 0, T) ? 1 : 0);
      if (virou(res, T) && res.shots.some(s => s.t >= T)) engajou++;
    });
    t.diagnostic(`${G.destruida.length} humanos atrás de prédio que cai: tiros com a cidade de pé ${antes}, na cinemática ${cinematica}; depois do impacto o bot virou e atirou em ${engajou}`);
    assert.equal(antes + cinematica, 0, 'o bot viu através da cidade antes do impacto');
    assert.ok(engajou >= G.destruida.length - 1, `depois do impacto o bot só viu ${engajou}/${G.destruida.length} humanos sobre os escombros`);
  });

  it('custo a 10 Hz: 16 bots + 4 humanos com as paredes — na cidade (o pior caso) e no campo', (t) => {
    /* o layout de test/bots-visada.test.js (campo) e o mesmo espalhado sobre
       a cidade; bots patrulhando de verdade (andam, atravessam prédio), humanos
       passeando. Mesmas sementes com e sem paredes. */
    const medir = (cx, cz, solidos) => {
      const world = Bots.createBotWorld();
      world.terrain = terrain;
      world.solids = solidos;
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
    // a MESMA consulta sem a divisão em grupos (paredes.js puro), só para medir o ganho
    const semGrupos = { intact: { walls: intactas, segmentBlocked: Par.criarConsultaParedes(intactas).segmentoBloqueado,
      contains: p => dentroDeAlguma(intactas, p) } };
    const cx = mundo.cidade.cx - 55, cz = mundo.cidade.cz - 55;
    medir(cx, cz, solids); // aquece o JIT dos dois caminhos antes de medir
    const cidadeSem = medir(cx, cz, null), cidadeCom = medir(cx, cz, solids), cidadeBruta = medir(cx, cz, semGrupos);
    const campoSem = medir(60, -40, null), campoCom = medir(60, -40, solids);
    const fmt = r => `p50 ${f2(r.p50)} ms, p99 ${f2(r.p99)} ms, máx ${f2(r.max)} ms`;
    t.diagnostic(`cidade — sem paredes: ${fmt(cidadeSem)}; com paredes: ${fmt(cidadeCom)}; com paredes sem a divisão em grupos: ${fmt(cidadeBruta)}`);
    t.diagnostic(`campo — sem paredes: ${fmt(campoSem)}; com paredes: ${fmt(campoCom)}`);
    // D5: p99 < 100 ms no processo real; aqui metade do passo, como em bots-visada
    assert.ok(cidadeCom.p99 < 50, `o tick dos bots na cidade custa ${f2(cidadeCom.p99)} ms no p99`);
    assert.ok(campoCom.p99 < 50, `o tick dos bots no campo custa ${f2(campoCom.p99)} ms no p99`);
  });

  it('o estado da cidade: init/cityDestruction mandam; partida nova e mapa novo recomeçam de pé', () => {
    const w = Bots.createBotWorld();
    assert.equal(Bots.activeWalls(w), null, 'sem paredes carregadas não há consulta');
    w.solids = solids;
    assert.equal(Bots.activeWalls(w), solids.intact);
    for (const [cd, want] of [[{ state: 'destroyed' }, 'destroyed'], [{ state: 'cinematic' }, 'intact'],
      [{ state: 'destroyed' }, 'destroyed'], [null, 'intact'], [{ state: 'destroyed' }, 'destroyed'],
      [{ eventId: null, state: 'intact' }, 'intact'], [undefined, 'intact']]) {
      Bots.applyCityState(w, cd);
      assert.equal(Bots.activeWalls(w), solids[want], `estado ${JSON.stringify(cd)} → ${want}`);
    }
  });
});

/* ---------------- ponto perto de um centro ---------------- */
function pontoPerto(c, rMin, rMax, seed, quer, tentativas = 400) {
  const r = mulberry32(seed >>> 0);
  for (let k = 0; k < tentativas; k++) {
    const a = r() * TAU, d = rMin + r() * (rMax - rMin);
    const p = corpo(c.x + Math.sin(a) * d, c.z + Math.cos(a) * d);
    if (!livre(intactas, p)) continue;
    if (quer(p)) return p;
  }
  return null;
}

/* ================================================================
   O CAMINHO REAL do estado da cidade: server.js de verdade (porta alta,
   ≥ 47000) publica `cityDestruction`, e o `startBots` de verdade — o mesmo
   que o server.js spawna pela flag do anfitrião — monta terreno + paredes da
   semente do `init` e troca a consulta no impacto. Os bots rodam dentro deste
   processo (`watchdog: false`) para o teste olhar o mundo que eles montaram.
   ================================================================ */
const net = require('node:net');
const os = require('node:os');
const { spawn } = require('node:child_process');

async function portaLivre() {
  const base = 47000 + (process.pid % 900) * 2;
  for (let p = base; p < 49000; p++) {
    const ok = await new Promise(res => {
      const s = net.createServer();
      s.once('error', () => res(false));
      s.listen(p, () => s.close(() => res(true)));
    });
    if (ok) return p;
  }
  throw new Error('sem porta livre em 47000–49000');
}

describe('B7 no processo real: o servidor derruba a cidade e os bots trocam as paredes', () => {
  it('init traz a semente → terreno + paredes; cityDestruction "destroyed" → consulta da cidade destruída', async (t) => {
    if (!intactas) {
      Par = await import(pathToFileURL(path.join(__dirname, '..', 'js', 'paredes.js')).href);
      terrain = await Bots.createBotTerrain(SEED);
      mundo = Par.construirMundoSolido({ worldSeed: SEED, heightAt: terrain.heightAt, slopeAt: terrain.slopeAt,
        WATER_LEVEL: terrain.WATER_LEVEL, CITY: terrain.CITY });
      intactas = Par.paredesDoJogo(mundo).concat(await paredesDasAtracoes());
    }
    const port = await portaLivre();
    const rank = path.join(os.tmpdir(), `fps-bots-paredes-rank-${process.pid}-${port}.json`);
    const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, PORT: String(port), HOST_CODE: 'QA123', COUNTDOWN_S: '1', NEXT_IN_S: '60',
        WORLD_SEED: String(SEED), CITY_DESTRUCTION_DELAY_MS: '1500', CITY_DESTRUCTION_IMPACT_DELAY_MS: '800', RANK_FILE: rank },
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
    const w = bots.world;
    const espera = async (cond, ms, msg) => {
      const fim = Date.now() + ms;
      while (!cond()) {
        if (Date.now() > fim) throw new Error(msg);
        await new Promise(r => setTimeout(r, 25));
      }
    };
    await espera(() => w.solids && w.terrain, 8000, 'o processo dos bots não montou terreno + paredes da semente do init');
    // as paredes montadas são as da semente que o servidor anunciou
    assert.deepEqual(w.solids.intact.walls, intactas, 'as paredes do bot não são as da semente do servidor');
    assert.equal(Bots.activeWalls(w), w.solids.intact, 'no lobby a cidade está de pé');

    const { io } = require('socket.io-client');
    const host = io(url, { transports: ['websocket'] });
    t.after(() => host.close());
    await new Promise(res => host.once('init', res));
    host.emit('hello', { nick: 'QA' });
    const estados = [];
    host.on('cityDestruction', d => estados.push(d.state));
    const partida = new Promise(res => host.once('matchStart', res));
    await new Promise((res, rej) => host.timeout(3000).emit('claimHost', { code: 'QA123' },
      (e, r) => (e || !r || !r.ok ? rej(e || new Error('claimHost recusado')) : res())));
    host.emit('requestStart');
    await partida;
    await espera(() => estados.includes('cinematic'), 8000, 'o servidor não começou a cinemática');
    assert.equal(Bots.activeWalls(w), w.solids.intact, 'durante a cinemática (mísseis no céu) a cidade ainda está de pé');
    await espera(() => estados.includes('destroyed'), 8000, 'o servidor não publicou o impacto');
    // o bot recebe a MESMA difusão que o anfitrião; um instante para processar
    await espera(() => Bots.activeWalls(w) === w.solids.destroyed, 1000,
      'o servidor publicou a cidade destruída e o processo dos bots continuou com as paredes da cidade de pé');
    t.diagnostic(`estados publicados pelo servidor: ${estados.join(' → ')}; o processo dos bots trocou para a consulta da cidade destruída`);
  });
});
