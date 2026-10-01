/* ================================================================
   VEÍCULO COM VIDA — a autoridade do SERVIDOR.

   Decisão do dono (2026-09-28): "carro pode segurar tiro, mas não... pra
   sempre!!". A vida mora no servidor (todos veem o mesmo): o cliente, ou o
   bot, reporta o acerto na lataria (`vehicleHit`, `vehicleBlast`); o
   servidor confere, desconta e difunde (`vehicleHp`), e com a vida em zero
   anuncia a queima (`vehicleBurning`: o veículo para de proteger) e, depois
   dela, a explosão (`vehicleExploded`): quem ficou dentro morre (crédito a
   quem destruiu), quem está perto leva dano pela distância.

   Âncora: os números da regra (js/veiculo-vida.js) contados à mão aqui —
   30 tiros de fuzil no buggy, 1 foguete — e a frota que o servidor anuncia
   conferida contra a que o processo dos BOTS monta da mesma semente por
   outro caminho (createBotTerrain + createBotSolids).
   Portas 4120–4129 (faixa desta frente).
   ================================================================ */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const url = require('node:url');
const { io } = require('socket.io-client');

const SERVER = path.join(__dirname, '..', 'server.js');
const SEED = 424242;
let porta = 0;

function spawnServer(env = {}) {
  const port = 4120 + (porta++ % 10);
  const rankFile = path.join(os.tmpdir(), `fps-veiculo-rank-${process.pid}-${port}-${Date.now()}.json`);
  const proc = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), HOST_CODE: 'QA123', COUNTDOWN_S: '1', NEXT_IN_S: '60',
      GAS_DEFAULT: 'classica', WORLD_SEED: String(SEED), VEICULO_QUEIMA_S: '1', RANK_FILE: rankFile, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('servidor não subiu')), 8000);
    proc.stdout.on('data', d => {
      if (String(d).includes('Servidor BR no ar')) {
        clearTimeout(to);
        res({ port, proc, stop: () => new Promise(r => {
          const done = () => { fs.rmSync(rankFile, { force: true }); r(); };
          if (proc.exitCode !== null) return done();
          proc.once('exit', done); proc.kill();
        }) });
      }
    });
    let err = '';
    proc.stderr.on('data', d => { err = (err + d).slice(-1500); });
    proc.on('exit', c => rej(new Error('servidor morreu cedo, código ' + c + (err ? '\n' + err : ''))));
  });
}
const connect = port => {
  const s = io(`http://localhost:${port}`, { transports: ['websocket'], reconnection: false });
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('sem init')), 5000);
    s.once('init', init => { clearTimeout(to); res({ s, init }); });
  });
};
const once = (sock, ev) => new Promise(res => sock.once(ev, res));
const ack = (sock, ev, data) => new Promise((res, rej) =>
  sock.timeout(3000).emit(ev, data, (err, d) => (err ? rej(err) : res(d))));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const collect = (sock, ev) => { const arr = []; sock.on(ev, d => arr.push(d)); return arr; };

async function playing(t, n, env = {}) {
  const srv = await spawnServer(env);
  t.after(() => srv.stop());
  const clients = [];
  for (let i = 0; i < n; i++) {
    const c = await connect(srv.port);
    c.s.emit('hello', { nick: 'QA' + i });
    clients.push(c);
    t.after(() => c.s.close());
  }
  const started = clients.map(c => once(c.s, 'matchStart'));
  await ack(clients[0].s, 'claimHost', { code: 'QA123' });
  clients[0].s.emit('requestStart');
  const ms = await Promise.all(started);
  return { srv, clients, plan: ms[0].plan };
}
const veic = (plan, id) => plan.veiculos.find(v => String(v.v) === String(id));
const perto = (v, dx = 6, dz = 0) => [v.pos[0] + dx, v.pos[1], v.pos[2] + dz];
/* assumir um veículo exige estar ao lado dele na pose que o servidor conhece */
async function aoLado(c, v) { c.s.emit('state', { pos: perto(v, 2), rotY: 0 }); await sleep(120); }
/* N acertos espaçados (cabem na cadência e no orçamento de 1 s) */
async function rajada(sock, n, payload, gapMs = 110) {
  for (let i = 0; i < n; i++) { sock.emit('vehicleHit', payload); await sleep(gapMs); }
}

describe('a frota que o servidor anuncia', () => {
  it('plan.veiculos: a frota da semente, vida cheia, e a MESMA que o processo dos bots monta por outro caminho', async t => {
    const { plan } = await playing(t, 1);
    const VV = await import(url.pathToFileURL(path.join(__dirname, '..', 'js', 'veiculo-vida.js')).href);
    const Par = await import(url.pathToFileURL(path.join(__dirname, '..', 'js', 'paredes.js')).href);
    const Bots = require('../scripts/bots.js');
    const terrain = await Bots.createBotTerrain(SEED);
    const plano = Par.construirMundoSolido({ worldSeed: SEED, heightAt: terrain.heightAt, slopeAt: terrain.slopeAt,
      WATER_LEVEL: terrain.WATER_LEVEL, CITY: terrain.CITY }).plano;
    const esperado = VV.frotaDoPlano(plano, terrain.heightAt);
    assert.deepEqual(plan.veiculos.map(v => [v.v, v.tipo]), esperado.map(f => [f.id, f.tipo]));
    for (const [i, v] of plan.veiculos.entries()) {
      const e = esperado[i];
      assert.ok(Math.hypot(v.pos[0] - e.x, v.pos[1] - e.y, v.pos[2] - e.z) < 1e-6, `${v.v}: ${v.pos} × ${[e.x, e.y, e.z]}`);
      assert.equal(v.vida, VV.TIPOS[v.tipo].vida);
      assert.equal(v.estado, 'inteiro');
    }
  });
});

describe('vida, queima e explosão (autoritativas)', () => {
  it('buggy: 29 tiros de fuzil deixam 26 de vida; o 30º zera — queima, e ~1 s depois explode', async t => {
    const { clients, plan } = await playing(t, 2);
    const [a, b] = clients;
    const buggy = veic(plan, 0);
    a.s.emit('state', { pos: perto(buggy, 20), rotY: 0, heldWeapon: 'FUZIL' });
    await sleep(150);
    const hp = collect(b.s, 'vehicleHp'), queima = collect(b.s, 'vehicleBurning'), boom = collect(b.s, 'vehicleExploded');
    await rajada(a.s, 29, { v: 0, dmg: 26, weapon: 'FUZIL', fromPos: perto(buggy, 20) });
    await sleep(200);
    assert.equal(hp.at(-1) && hp.at(-1).vida, 26, `vida depois de 29 tiros: ${JSON.stringify(hp.at(-1))}`);
    assert.equal(queima.length, 0, 'queimou antes da hora');
    let tQueima = 0, tBoom = 0;
    b.s.once('vehicleBurning', () => { tQueima = Date.now(); });
    b.s.once('vehicleExploded', () => { tBoom = Date.now(); });
    a.s.emit('vehicleHit', { v: 0, dmg: 26, weapon: 'FUZIL', fromPos: perto(buggy, 20) });
    await sleep(250);
    assert.equal(queima.length, 1, 'o 30º tiro não zerou o buggy');
    assert.equal(queima[0].by, a.init.id);
    // queimando: mais tiro não muda nada — nem vida, nem o relógio da queima
    const antes = hp.length;
    await rajada(a.s, 5, { v: 0, dmg: 26, weapon: 'FUZIL' });
    assert.equal(hp.length, antes, 'veículo em chamas continuou levando dano');
    assert.equal(queima.length, 1, 'veículo em chamas voltou a "queimar" com o tiro');
    await sleep(1100);
    assert.equal(boom.length, 1, 'não explodiu depois da queima');
    assert.equal(boom[0].v, 0);
    // VEICULO_QUEIMA_S=1: explode ~1 s depois de zerar, não depois do último tiro
    assert.ok(tBoom - tQueima < 1250, `a queima durou ${tBoom - tQueima} ms (esperado ~1000)`);
  });

  it('bazuca direta: UM foguete destrói o buggy; granada tira 390', async t => {
    const { clients, plan } = await playing(t, 3);
    const [a, b, c] = clients;
    const buggy = veic(plan, 0), gt = veic(plan, 1);
    a.s.emit('state', { pos: perto(buggy, 20), rotY: 0, heldWeapon: 'BAZUCA' });
    c.s.emit('state', { pos: perto(gt, 30), rotY: 0 }); // o esportivo fica na cidade
    await sleep(150);
    const queima = collect(b.s, 'vehicleBurning'), hp = collect(b.s, 'vehicleHp');
    a.s.emit('vehicleBlast', { v: 0, dmg: 130, kind: 'BAZUCA', impactPos: perto(buggy, 1.5) });
    await sleep(250);
    assert.deepEqual(queima.map(q => q.v), [0], 'um foguete não destruiu o buggy');
    c.s.emit('vehicleBlast', { v: 1, dmg: 130, kind: 'GRANADA', impactPos: perto(gt, 1) });
    await sleep(250);
    assert.equal(hp.filter(h => h.v === 1).at(-1)?.vida, 1170 - 390, `granada no esportivo: ${JSON.stringify(hp)}`);
  });

  it('quem ainda está DENTRO morre na explosão, com a eliminação creditada; quem está perto se fere; longe, nada', async t => {
    const { clients, plan } = await playing(t, 4);
    const [a, b, c, d] = clients;
    const buggy = veic(plan, 0);
    await aoLado(b, buggy);
    assert.equal((await ack(b.s, 'enterCar', { idx: 0 })).ok, true);
    b.s.emit('state', { pos: buggy.pos, rotY: 0, car: 0 });
    c.s.emit('state', { pos: perto(buggy, 3), rotY: 0 });
    d.s.emit('state', { pos: perto(buggy, 40), rotY: 0 });
    a.s.emit('state', { pos: perto(buggy, 25), rotY: 0, heldWeapon: 'BAZUCA' });
    await sleep(200);
    const mortes = collect(a.s, 'playerKilled'), hitC = collect(c.s, 'youWereHit'), hitD = collect(d.s, 'youWereHit');
    a.s.emit('vehicleBlast', { v: 0, dmg: 130, kind: 'BAZUCA', impactPos: perto(buggy, 1) });
    await sleep(1500);
    const mB = mortes.find(m => m.victimId === b.init.id);
    assert.ok(mB, `o motorista não morreu: ${JSON.stringify(mortes)}`);
    assert.equal(mB.killerId, a.init.id, 'a eliminação não foi para quem destruiu');
    assert.equal(mB.killerKills, 1);
    assert.equal(mB.weapon, 'VEÍCULO');
    assert.equal(hitC.length, 1, 'quem estava a 3 m não sentiu a explosão');
    assert.equal(hitC[0].weapon, 'VEICULO');
    assert.ok(hitC[0].dmg >= 60 && hitC[0].dmg <= 120, `dano a ~3 m: ${hitC[0].dmg}`);
    assert.equal(hitC[0].shooterId, a.init.id);
    assert.equal(hitD.length, 0, 'a explosão feriu quem estava a 40 m');
    // destruído, não há o que assumir — nem para quem está ao lado
    assert.equal((await ack(c.s, 'enterCar', { idx: 0 })).ok, false, 'assumiu um carro destruído');
  });

  /* laudo d381d29, NC-2: o carro que continua rolando depois que o motorista
     sai ficava com a pose VELHA no servidor — a 53 m de onde parou, e ninguém
     conseguia entrar de novo ("Veículo ocupado!"). Quem saiu reporta a pose do
     carro solto até ele parar; o servidor só aceita dele, na janela e com
     velocidade de carro. */
  /* uma trilha de 64 m a partir da vaga que um carro de verdade rolaria:
     sem parede no caminho, e a pose sempre no relevo da semente (o servidor
     só aceita carro solto no chão) */
  async function trilha(veh) {
    const terrain = await require('../scripts/bots.js').createBotTerrain(SEED);
    const Par = await import(url.pathToFileURL(path.join(__dirname, '..', 'js', 'paredes.js')).href);
    const mundo = Par.construirMundoSolido({ worldSeed: SEED, heightAt: terrain.heightAt, slopeAt: terrain.slopeAt,
      WATER_LEVEL: terrain.WATER_LEVEL, CITY: terrain.CITY });
    const q = Par.criarConsultaParedes(Par.paredesDoJogo(mundo).filter(w => !w.noCollide));
    const [x0, y0, z0] = veh.pos, sobe = y0 - terrain.heightAt(x0, z0);
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8, ux = Math.cos(a), uz = Math.sin(a);
      const at = d => { const x = x0 + ux * d, z = z0 + uz * d; return [x, terrain.heightAt(x, z) + sobe, z]; };
      let ok = true;
      for (let d = 0; d < 64 && ok; d += 2) {
        const p = at(d), n = at(d + 2);
        if (Math.abs(n[1] - p[1]) > 1.2 || q.segmentoBloqueado({ x: p[0], y: p[1] + 0.6, z: p[2] }, { x: n[0], y: n[1] + 0.6, z: n[2] })) ok = false;
      }
      if (ok) return { at, ux, uz };
    }
    return null;
  }

  it('o carro que rolou depois que o motorista saiu segue pegável onde parou', async t => {
    const { clients, plan } = await playing(t, 3);
    const [a, b, c] = clients;
    const buggy = veic(plan, 0);
    const T = await trilha(buggy);
    assert.ok(T, 'cenário: nenhuma trilha livre de 64 m a partir da vaga');
    await aoLado(a, buggy);
    assert.equal((await ack(a.s, 'enterCar', { idx: 0 })).ok, true);
    for (let k = 0; k <= 10; k++) { a.s.emit('state', { pos: T.at(2 * k), rotY: 0, car: 0 }); await sleep(100); }
    const rola = collect(b.s, 'carRola');
    a.s.emit('leaveCar', { idx: 0 });
    const lado = T.at(20); a.s.emit('state', { pos: [lado[0] - T.uz * 2, lado[1], lado[2] + T.ux * 2], rotY: 0 });
    // o carro solto rola mais 40 m (20 m/s) e para
    for (let k = 1; k <= 20; k++) { a.s.emit('carSolto', { idx: 0, pos: T.at(20 + 2 * k), rotY: 0 }); await sleep(100); }
    /* quem NÃO dirigia não mexe no carro solto — nem com pose plausível
       (2 m de lado, dentro do teto de velocidade: é a posse que recusa) */
    await sleep(150);
    const fim = T.at(60);
    c.s.emit('carSolto', { idx: 0, pos: [fim[0] - T.uz * 2, fim[1], fim[2] + T.ux * 2], rotY: 0 });
    await sleep(150);
    const perto = T.at(62);
    b.s.emit('state', { pos: perto, rotY: 0 });
    await sleep(150);
    assert.equal((await ack(b.s, 'enterCar', { idx: 0 })).ok, true, 'o carro parado 40 m adiante não aceitou quem está ao lado dele');
    // os outros recebem a pose do carro solto (e a de quem não dirigia, não)
    assert.ok(rola.length >= 15, `repassou só ${rola.length} de 20 poses do carro solto`);
    assert.ok(Math.hypot(rola.at(-1).pos[0] - fim[0], rola.at(-1).pos[2] - fim[2]) < 0.01, `última pose repassada em ${rola.at(-1).pos}`);
    const naTrilha = r => { const d = (r.pos[0] - buggy.pos[0]) * T.ux + (r.pos[2] - buggy.pos[2]) * T.uz, p = T.at(d); return Math.hypot(r.pos[0] - p[0], r.pos[2] - p[2]) < 0.05; };
    assert.ok(rola.every(r => r.idx === 0 && naTrilha(r)), 'repassou a pose de quem não dirigia');
  });

  it('carro solto: a pose com velocidade de carro vale, a que salta (teleporte) é recusada', async t => {
    const { clients, plan } = await playing(t, 3);
    const [a, b] = clients;
    const buggy = veic(plan, 0), [x0, y0, z0] = buggy.pos;
    await aoLado(a, buggy);
    assert.equal((await ack(a.s, 'enterCar', { idx: 0 })).ok, true);
    a.s.emit('leaveCar', { idx: 0 });
    await sleep(120);
    // rola 12 m a 20 m/s — vale
    for (let k = 1; k <= 6; k++) { a.s.emit('carSolto', { idx: 0, pos: [x0 + 2 * k, y0, z0], rotY: 0 }); await sleep(100); }
    a.s.emit('carSolto', { idx: 0, pos: [x0 + 262, y0, z0], rotY: 0 });   // 250 m num pacote
    await sleep(150);
    // a 2 m de onde ele PAROU e a 14 m da vaga: só pega se o rolar valeu e o salto não
    b.s.emit('state', { pos: [x0 + 14, y0, z0], rotY: 0 });
    await sleep(150);
    assert.equal((await ack(b.s, 'enterCar', { idx: 0 })).ok, true, 'o carro não está onde parou (rolar recusado ou salto aceito)');
  });

  it('carro solto: rola no chão — subir pelo ar não move a pose do servidor', async t => {
    const { clients, plan } = await playing(t, 3);
    const [a, b] = clients;
    const buggy = veic(plan, 0), [x0, y0, z0] = buggy.pos;
    await aoLado(a, buggy);
    assert.equal((await ack(a.s, 'enterCar', { idx: 0 })).ok, true);
    a.s.emit('leaveCar', { idx: 0 });
    await sleep(120);
    // 20 pacotes de 4,5 m para cima (dentro do teto de velocidade por pacote)
    for (let k = 1; k <= 20; k++) { a.s.emit('carSolto', { idx: 0, pos: [x0, y0 + 4.5 * k, z0], rotY: 0 }); await sleep(100); }
    await sleep(150);
    // a pose do servidor continua no chão: quem chega ao lado da vaga entra
    b.s.emit('state', { pos: [x0 + 2, y0, z0], rotY: 0 });
    await sleep(150);
    assert.equal((await ack(b.s, 'enterCar', { idx: 0 })).ok, true, 'o carro solto subiu no ar com a pose do servidor');
  });

  it('o veículo anda com quem o dirige: a pose é a do motorista arbitrado, e a de mais ninguém', async t => {
    const { clients, plan } = await playing(t, 3);
    const [a, b, c] = clients;
    const cam = veic(plan, 4); // caminhão da 1ª base
    assert.ok(cam && cam.tipo === 'caminhao', 'semente sem caminhão');
    const destino = [cam.pos[0] + 60, cam.pos[1], cam.pos[2]];
    await aoLado(b, cam);
    assert.equal((await ack(b.s, 'enterCar', { idx: 4 })).ok, true);
    // B leva o caminhão 60 m (a 20 m/s, dentro do anti-teleporte)
    for (let k = 0; k <= 30; k++) {
      b.s.emit('state', { pos: [cam.pos[0] + 2 * k, cam.pos[1], cam.pos[2]], rotY: 0.5, car: 4 });
      await sleep(100);
    }
    // DEPOIS, C (que NÃO é o motorista) diz estar no caminhão, 200 m adiante
    c.s.emit('state', { pos: [destino[0] + 200, destino[1], destino[2]], rotY: 0, car: 4, heldWeapon: 'ESCOPETA' });
    await sleep(150);
    const hp = collect(a.s, 'vehicleHp');
    // A, com escopeta (120 m), a 100 m do destino e a 160 m da vaga
    a.s.emit('state', { pos: [destino[0] + 100, destino[1], destino[2]], rotY: 0, heldWeapon: 'ESCOPETA' });
    await sleep(150);
    a.s.emit('vehicleHit', { v: 4, dmg: 88, weapon: 'ESCOPETA' });
    await sleep(250);
    assert.equal(hp.at(-1)?.vida, 1760 - 88, 'o acerto no caminhão onde o motorista o deixou foi recusado');
    // e a alegação de C (sem posse) não moveu o caminhão: de lá, fora do alcance
    c.s.emit('vehicleHit', { v: 4, dmg: 88, weapon: 'ESCOPETA' });
    await sleep(250);
    assert.equal(hp.length, 1, 'quem não dirige moveu o caminhão no servidor');
  });

  it('quem entra no meio recebe a vida e o estado de todos os veículos (init.veiculos)', async t => {
    const { srv, clients, plan } = await playing(t, 2);
    const [a] = clients;
    const buggy = veic(plan, 0);
    a.s.emit('state', { pos: perto(buggy, 20), rotY: 0 });
    await sleep(150);
    await rajada(a.s, 3, { v: 0, dmg: 26, weapon: 'FUZIL' });
    await sleep(200);
    const late = await connect(srv.port);
    t.after(() => late.s.close());
    const b0 = late.init.veiculos.find(v => v.v === 0);
    assert.ok(b0, 'init sem veículos');
    assert.equal(b0.vida, 780 - 78);
    assert.equal(b0.estado, 'inteiro');
    assert.equal(late.init.veiculos.length, plan.veiculos.length);
  });
});
