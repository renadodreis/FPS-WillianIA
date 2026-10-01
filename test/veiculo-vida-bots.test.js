'use strict';

/* ================================================================
   VEÍCULO É COBERTURA — PARA O BOT TAMBÉM, e não pra sempre.

   Decisão do dono (2026-09-28): "carro pode segurar tiro, mas não... pra
   sempre!!". Antes, o bot não conhecia veículo: o orquestrador mediu 15 de
   48 humanos atrás de veículo parado levando tiro. Agora o bot usa a MESMA
   regra do cliente (js/veiculo-vida.js):
     • atrás de veículo INTEIRO, escondido por inteiro: o bot não vê, não
       vira e não atira;
     • com a cabeça de fora e o tronco atrás da lataria: o bot vê e atira, e
       a rajada ACERTA O VEÍCULO (`vehicleHit`) — nenhum `shotHit` no humano;
     • veículo sem vida (`vehicleBurning`/`vehicleExploded`): não barra mais,
       e o mesmo humano volta a levar tiro;
     • a pose de veículo dirigido vem do `playerUpdate` do motorista.

   ÂNCORA independente do código sob teste: marcha de 1 cm com
   ponto-dentro-da-caixa escrito AQUI (as medidas das caixas vêm de
   TIPOS, mas a conta de interseção e o giro são deste arquivo). Os pares têm o
   relevo livre (marcha de 5 cm no heightAt): o que esconde é o veículo.

   Tudo no LAÇO REAL: `tickBots` com um socket falso que só grava o que o bot
   emitiu (o dublê de test/bots-paredes.test.js). Sem paredes e sem
   obstáculos no mundo do teste: o que se mede é só o veículo.
   ================================================================ */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const Bots = require(path.join(__dirname, '..', 'scripts', 'bots.js'));
const { mulberry32 } = require(path.join(__dirname, '..', 'server.js'));

const SEED = 424242;
const EYE = 1.5, HEAD = 1.6, TRUNK = 1.0, CROUCH_HEAD = 1.02, CROUCH_TRUNK = 0.55;
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const HUMAN = 'humano';

let terrain = null, VV = null, Par = null, plano = null;
const G = {};

/* ---------------- âncora ---------------- */
function dentroDoVeiculo(p, v) {
  const T = VV.TIPOS[v.tipo];
  const dx = p.x - v.x, dz = p.z - v.z, c = Math.cos(v.ry), s = Math.sin(v.ry);
  const lx = dx * c - dz * s, lz = dx * s + dz * c, ly = p.y - v.y;
  return T.caixas.some(b => lx > b.min[0] && lx < b.max[0] && ly > b.min[1] && ly < b.max[1] && lz > b.min[2] && lz < b.max[2]);
}
function veiculoEntre(v, a, b, passo = 0.01) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / passo));
  for (let i = 1; i < n; i++) {
    const k = i / n;
    if (dentroDoVeiculo({ x: a.x + dx * k, y: a.y + dy * k, z: a.z + dz * k }, v)) return true;
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
function yawTo(from, to) { return Math.atan2(-(to.x - from.x), -(to.z - from.z)); }
function angDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return Math.abs(d);
}

/* ---------------- pares ----------------
   Um veículo estacionado em terreno aberto (pose de quem o largou ali), o
   humano 1,2–2,6 m ATRÁS dele na linha do bot, o bot a 15–55 m. */
function amostrar({ tipo, n, seed, crouch, quer, tentativas = 40000 }) {
  const r = mulberry32(seed);
  const out = [];
  for (let k = 0; k < tentativas && out.length < n; k++) {
    const vx = (r() * 2 - 1) * 420, vz = (r() * 2 - 1) * 420;
    if (Math.hypot(vx - terrain.CITY.x, vz - terrain.CITY.z) < 120) continue;
    if (terrain.slopeAt(vx, vz) > 0.15 || terrain.heightAt(vx, vz) < terrain.WATER_LEVEL + 1) continue;
    const v = { id: 0, tipo, x: vx, z: vz, ry: r() * TAU, y: terrain.heightAt(vx, vz) + VV.TIPOS[tipo].acimaDoChao };
    const ang = r() * TAU, d = 15 + r() * 40;
    const bot = { x: vx + Math.cos(ang) * d, z: vz + Math.sin(ang) * d };
    const atras = 1.2 + r() * 1.4 + VV.TIPOS[tipo].raio * 0.6, lado = (r() - 0.5) * 0.8;
    const ux = -Math.cos(ang), uz = -Math.sin(ang);
    const hum = { x: vx + ux * atras - uz * lado, z: vz + uz * atras + ux * lado };
    bot.y = terrain.heightAt(bot.x, bot.z); hum.y = terrain.heightAt(hum.x, hum.z);
    const olho = { x: bot.x, y: bot.y + EYE, z: bot.z };
    const cab = { x: hum.x, y: hum.y + (crouch ? CROUCH_HEAD : HEAD), z: hum.z };
    const tro = { x: hum.x, y: hum.y + (crouch ? CROUCH_TRUNK : TRUNK), z: hum.z };
    // ninguém dentro da lataria, relevo livre dos dois lados
    if ([olho, cab, tro, { ...hum, y: hum.y + 0.1 }, { ...bot, y: bot.y + 0.1 }].some(p => dentroDoVeiculo(p, v))) continue;
    if (relevoEntre(olho, cab) || relevoEntre(olho, tro)) continue;
    const par = quer({ v, bot, hum, cab: veiculoEntre(v, olho, cab), tro: veiculoEntre(v, olho, tro) });
    if (par) out.push(par);
  }
  return out;
}
const frotaDe = v => [{ v: v.id, tipo: v.tipo, pos: [v.x, v.y, v.z], ry: v.ry, estado: 'inteiro' }];

/* ---------------- laço real ---------------- */
function sockDe(id, out) {
  return {
    emit: (ev, payload) => out.push({ from: id, ev, payload }),
    volatile: { emit: (ev, payload) => out.push({ from: id, ev, payload, volatile: true }) },
    timeout: () => ({ emit: (ev, payload, cb) => cb && cb(new Error('sem servidor no teste')) }),
  };
}
/* bot de guarda olhando 20° ao lado do humano; humano parado olhando o bot.
   `frota`: lista no formato do servidor (ou null = bot sem veículo, o antes).
   `onTick(t, world)`: mexe no mundo (evento do servidor, motorista). */
function sentinela({ bot, hum, frota, crouch = 0, dur = 10, seed = 1, weapon = 'FUZIL', onTick = null }) {
  const world = Bots.createBotWorld();
  world.terrain = terrain;
  world.plan = { zone: [] };
  if (frota) Bots.applyVehicleFleet(world, frota);
  const rng = mulberry32(seed);
  const out = [];
  const dir = { x: hum.x - bot.x, z: hum.z - bot.z }, dl = Math.hypot(dir.x, dir.z);
  const c = Math.cos(20 * DEG), s = Math.sin(20 * DEG);
  const wd = { x: (dir.x * c - dir.z * s) / dl, z: (dir.x * s + dir.z * c) / dl };
  const b = Bots.createBotState(0, sockDe('b0', out), rng);
  Bots.resetBotForMatch(b);
  Object.assign(b, { id: 'b0', phase: 'PLAY', x: bot.x, z: bot.z, y: bot.y, weapon, ammo: 1e6, hp: 1e9, mira: 0.9,
    yaw: Math.atan2(-wd.x, -wd.z), wp: [bot.x + wd.x * 500, bot.z + wd.z * 500] });
  world.bots.push(b);
  const res = { tiros: 0, shotHit: 0, shotHitT: [], vehicleHit: [], viradas: 0, world };
  for (let k = 0; k * 0.1 < dur - 1e-9; k++) {
    const t = k / 10;
    b.x = bot.x; b.z = bot.z; b.y = bot.y;
    const upd = { id: HUMAN, pos: [hum.x, hum.y, hum.z], rotY: yawTo(hum, b), bot: false, crouch };
    Bots.observePlayerUpdate(world.observedPlayers, upd);
    Bots.observeVehicleFromUpdate(world, upd);
    if (onTick) onTick(t, world);
    out.length = 0;
    Bots.tickBots(world, t, rng);
    let atirou = false;
    for (const e of out) {
      if (e.from !== 'b0') continue;
      if (e.volatile && e.ev === 'state' && angDiff(e.payload.rotY, yawTo(bot, hum)) <= 2 * DEG) res.viradas++;
      if (e.ev === 'shotHit') { res.shotHit++; res.shotHitT.push(t); atirou = true; }
      if (e.ev === 'shotFired') atirou = true;
      if (e.ev === 'vehicleHit') { res.vehicleHit.push({ t, ...e.payload }); atirou = true; }
    }
    if (atirou) res.tiros++;
  }
  return res;
}

describe('veículo inteiro é cobertura para o bot; sem vida, deixa de ser', () => {
  before(async () => {
    Par = await import(pathToFileURL(path.join(__dirname, '..', 'js', 'paredes.js')).href);
    VV = await Bots.loadVehicleRules();
    terrain = await Bots.createBotTerrain(SEED);
    plano = Par.construirMundoSolido({ worldSeed: SEED, heightAt: terrain.heightAt, slopeAt: terrain.slopeAt,
      WATER_LEVEL: terrain.WATER_LEVEL, CITY: terrain.CITY }).plano;
    // escondido POR INTEIRO: agachado atrás do esportivo, em pé atrás do caminhão
    G.agachadoEsportivo = amostrar({ tipo: 'esportivo', n: 16, seed: 31, crouch: true, quer: p => (p.cab && p.tro ? p : null) });
    G.emPeCaminhao = amostrar({ tipo: 'caminhao', n: 16, seed: 32, crouch: false, quer: p => (p.cab && p.tro ? p : null) });
    G.agachadoBuggy = amostrar({ tipo: 'buggy', n: 16, seed: 33, crouch: true, quer: p => (p.cab && p.tro ? p : null) });
    // cabeça de fora, tronco atrás da lataria (em pé atrás do esportivo)
    G.cabecaDeFora = amostrar({ tipo: 'esportivo', n: 16, seed: 34, crouch: false, quer: p => (!p.cab && p.tro ? p : null) });
  });

  it('o cenário exercita veículo de verdade (relevo livre, só a lataria esconde)', t => {
    t.diagnostic(`seed ${SEED}: agachado atrás do esportivo ${G.agachadoEsportivo.length}, em pé atrás do caminhão ${G.emPeCaminhao.length}, agachado atrás do buggy ${G.agachadoBuggy.length}, cabeça de fora ${G.cabecaDeFora.length}`);
    for (const [k, lista] of Object.entries(G)) assert.ok(lista.length >= 12, `só ${lista.length} pares em ${k}`);
  });

  it('escondido por inteiro atrás de veículo inteiro por 10 s: 0 tiros, 0 viradas (antes, sem a regra, o bot atirava)', t => {
    const conta = (pares, crouch, comVeiculo) => pares.reduce((a, p, i) => {
      const r = sentinela({ bot: p.bot, hum: p.hum, crouch: crouch ? 1 : 0, seed: i + 1, frota: comVeiculo ? frotaDe(p.v) : null });
      a.tiros += r.tiros; a.acertos += r.shotHit; a.viradas += r.viradas ? 1 : 0; a.alvosComTiro += r.shotHit ? 1 : 0;
      return a;
    }, { tiros: 0, acertos: 0, viradas: 0, alvosComTiro: 0 });
    const linhas = [];
    let depois = { tiros: 0, acertos: 0, viradas: 0 }, antesAlvos = 0, total = 0;
    for (const [nome, pares, crouch] of [['agachado/esportivo', G.agachadoEsportivo, true],
      ['em pé/caminhão', G.emPeCaminhao, false], ['agachado/buggy', G.agachadoBuggy, true]]) {
      const antes = conta(pares, crouch, false), agora = conta(pares, crouch, true);
      linhas.push(`${nome}: antes ${antes.alvosComTiro}/${pares.length} humanos com tiro (${antes.acertos} acertos); agora ${agora.tiros} tiros, ${agora.acertos} acertos, ${agora.viradas} viradas`);
      antesAlvos += antes.alvosComTiro; total += pares.length;
      depois = { tiros: depois.tiros + agora.tiros, acertos: depois.acertos + agora.acertos, viradas: depois.viradas + agora.viradas };
    }
    t.diagnostic(linhas.join(' · '));
    assert.ok(antesAlvos > total * 0.5, `o antes não reproduz o defeito (${antesAlvos}/${total}) — o cenário não mede nada`);
    assert.equal(depois.acertos, 0, `acertos através de veículo inteiro: ${depois.acertos}`);
    assert.equal(depois.tiros, 0, `disparos contra quem o veículo esconde: ${depois.tiros}`);
    assert.equal(depois.viradas, 0, `viradas para quem o veículo esconde: ${depois.viradas}`);
  });

  it('cabeça de fora e tronco atrás da lataria: o bot atira, e a rajada ACERTA O VEÍCULO — nenhum shotHit no humano', t => {
    let tiros = 0, shotHit = 0, noVeiculo = 0, outroId = 0, danoErrado = 0;
    G.cabecaDeFora.forEach((p, i) => {
      const r = sentinela({ bot: p.bot, hum: p.hum, seed: i + 1, frota: frotaDe({ ...p.v, id: 3 }) });
      tiros += r.tiros; shotHit += r.shotHit; noVeiculo += r.vehicleHit.length;
      outroId += r.vehicleHit.filter(h => h.v !== 3).length;
      danoErrado += r.vehicleHit.filter(h => h.dmg !== Bots.WEAPON_PROFILES.FUZIL.dmg || h.weapon !== 'FUZIL').length;
    });
    t.diagnostic(`${G.cabecaDeFora.length} pares: ${tiros} ticks com disparo, ${noVeiculo} balas no veículo, ${shotHit} shotHit no humano`);
    assert.ok(tiros > 0, 'o bot nem atirou — o caso não exercita a bala parando no veículo');
    assert.equal(shotHit, 0, `${shotHit} balas atravessaram o veículo inteiro até o tronco`);
    assert.ok(noVeiculo > 0, 'a rajada não foi para o veículo');
    assert.equal(outroId, 0, 'vehicleHit com o id de outro veículo');
    assert.equal(danoErrado, 0, 'vehicleHit com dano/arma diferente do que o bot disparou');
  });

  it('não pra sempre: com a vida em zero (vehicleBurning) os MESMOS humanos voltam a levar tiro, e nada vai para o veículo', t => {
    let comTiro = 0, noVeiculo = 0, total = 0;
    for (const lista of [G.cabecaDeFora, G.emPeCaminhao]) lista.forEach((p, i) => {
      total++;
      const r = sentinela({ bot: p.bot, hum: p.hum, seed: i + 1, frota: frotaDe(p.v),
        onTick: (tt, world) => { if (tt === 0) Bots.vehicleOut(world, { v: p.v.id }); } });
      if (r.shotHit) comTiro++;
      noVeiculo += r.vehicleHit.length;
    });
    t.diagnostic(`${comTiro}/${total} humanos levaram tiro com o veículo sem vida; ${noVeiculo} balas no veículo`);
    assert.equal(noVeiculo, 0, 'bala indo para veículo que já não tem vida');
    assert.ok(comTiro >= total * 0.5, `veículo sem vida ainda cobre: só ${comTiro}/${total} levaram tiro`);
  });

  it('veículo dirigido: a pose vem do playerUpdate do motorista (car = índice) e passa a esconder quem está atrás dele', t => {
    // o caminhão nasce a 280 m (a vaga dele); o motorista o traz para a
    // frente do humano aos CHEGA s. A bala é decidida contra a geometria de
    // AGORA: depois da chegada, nenhum shotHit — nem na cauda da reação.
    const CHEGA = 4;
    let depois = 0, controle = 0, antes = 0;
    G.emPeCaminhao.forEach((p, i) => {
      const longe = { ...p.v, x: p.v.x + 200, z: p.v.z + 200 };
      const r = sentinela({ bot: p.bot, hum: p.hum, seed: i + 1, frota: frotaDe(longe), dur: 12,
        onTick: (tt, world) => {
          if (tt >= CHEGA - 1e-9) Bots.observeVehicleFromUpdate(world, { id: 'motorista', car: 0, pos: [p.v.x, p.v.y, p.v.z], rotY: p.v.ry });
        } });
      depois += r.shotHitT.filter(x => x >= CHEGA - 1e-9).length;
      antes += r.shotHitT.filter(x => x < CHEGA - 1e-9).length;
      // controle: ninguém dirige, o caminhão fica longe
      controle += sentinela({ bot: p.bot, hum: p.hum, seed: i + 1, frota: frotaDe(longe), dur: 12 })
        .shotHitT.filter(x => x >= CHEGA - 1e-9).length;
    });
    t.diagnostic(`shotHit depois dos ${CHEGA} s: ${depois} com o caminhão trazido pelo motorista, ${controle} no controle; antes da chegada: ${antes}`);
    assert.ok(controle > 0, 'o controle não acerta depois da chegada — o caso não mede nada');
    assert.equal(depois, 0, `${depois} balas no humano depois que o caminhão parou na frente dele`);
  });

  it('bot com o olho dentro de um veículo inteiro (atravessou andando) não enxerga nem atira', () => {
    let tiros = 0, controle = 0;
    G.cabecaDeFora.slice(0, 8).forEach((p, i) => {
      const v = { ...p.v, x: p.bot.x, z: p.bot.z, y: p.bot.y + 0.9, tipo: 'caminhao' };
      tiros += sentinela({ bot: p.bot, hum: p.hum, seed: i + 1, frota: frotaDe(v) }).tiros;
      // controle: o MESMO caminhão, sem vida — o bot atira de onde está
      controle += sentinela({ bot: p.bot, hum: p.hum, seed: i + 1, frota: [{ ...frotaDe(v)[0], estado: 'queimando' }] }).tiros;
    });
    assert.ok(controle > 0, 'o controle não atira — o caso não mede nada');
    assert.equal(tiros, 0, `${tiros} disparos de dentro do caminhão (controle: ${controle})`);
  });

  it('a frota do servidor (plan.veiculos) entra inteira no mundo do bot, com os ids e poses da semente', () => {
    const frota = VV.frotaDoPlano(plano, terrain.heightAt).map(f => ({ v: f.id, tipo: f.tipo, pos: [f.x, f.y, f.z], ry: f.ry, estado: 'inteiro' }));
    const world = Bots.createBotWorld();
    Bots.applyVehicleFleet(world, frota);
    assert.equal(world.vehicles.length, frota.length);
    assert.deepEqual(world.vehicles.map(v => v.id), frota.map(f => f.v));
    assert.ok(world.vehicles.every(v => v.inteiro));
    // explodido sai; a lista vazia/nula não quebra
    Bots.vehicleOut(world, { v: 'heli' });
    assert.equal(world.vehicleById.get('heli').inteiro, false);
    Bots.applyVehicleFleet(world, null);
    assert.equal(world.vehicles.length, 0);
  });
});

/* laudo afb1ae8, B7: o carro SOLTO (rola depois que o motorista sai) vinha
   para os humanos e não para o bot — ele o via onde o motorista saiu: 14
   disparos e 8 acertos em humano escondido atrás do carro rolado. O servidor
   repassa a pose dentro do `playerUpdate` do ex-motorista (`solto`) e, no
   caminho antigo, no evento `carRola`. */
describe('o bot vê o carro solto onde ele parou', () => {
  it('a pose do carro solto (playerUpdate.solto e carRola) move o carro no mundo do bot, e a reta passa a bater nele lá', async () => {
    await Bots.loadVehicleRules();
    const world = Bots.createBotWorld();
    Bots.applyVehicleFleet(world, [{ v: 0, tipo: 'esportivo', estado: 'inteiro', pos: [0, 0.6, 0], ry: 0 }]);
    const reta = x => Bots.vehicleOnSegment(world.vehicles, { x, y: 0.8, z: -10 }, { x, y: 0.8, z: 10 });
    assert.ok(reta(0), 'cenário: a reta pela vaga não bate no carro parado nela');
    assert.equal(reta(40), null, 'cenário: a reta 40 m adiante já bate em algo');
    // o ex-motorista manda o state a pé; o carro solto vem junto
    Bots.observeVehicleFromUpdate(world, { id: 'ex', pos: [3, 0, 2], rotY: 0, car: -1, solto: { idx: 0, pos: [40, 0.6, 0], rotY: 0 } });
    assert.ok(reta(40), 'o bot não vê o carro onde ele parou (playerUpdate.solto)');
    assert.equal(reta(0), null, 'o bot ainda vê o carro na vaga de saída');
    // e pelo evento à parte
    Bots.observeLooseCar(world, { idx: 0, pos: [-30, 0.6, 0], rotY: 0 });
    assert.ok(reta(-30) && !reta(40), 'o bot não segue o carro solto pelo carRola');
  });
});
