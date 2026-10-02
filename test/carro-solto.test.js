/* ================================================================
   O CARRO SOLTO — laudo d381d29, NC-2.

   O carro segue rolando depois que o motorista sai, e só o cliente dele o
   simula. O servidor e os outros ficavam com a pose de onde ele SAIU: o
   esportivo a 118 km/h rolava 53 m, o jogador andava até ele e ouvia
   "Veículo ocupado!" para sempre.

   Os dois lados do jogo, no navegador:
   • EX-MOTORISTA (a página dirige de verdade, sai a toda): a pose que o
     servidor repassa é a do carro PARADO na física da página, e quem chega
     nele entra. Âncora independente: o corpo do carro na física da página.
   • OBSERVADOR (o host dirige, sai, e o carro rola 40 m): a página mostra o
     carro onde o servidor diz que ele parou. Âncora: a pose que o host mandou.

   E a saída não perde o 1º `state` a pé (laudo a9a4ffd, §4.6).

   Porta 4156.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness');

const PORT = 4156;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const collect = (sock, ev) => { const arr = []; sock.on(ev, d => arr.push(d)); return arr; };
const ack = (sock, ev, d) => new Promise((res, rej) => sock.timeout(3000).emit(ev, d, (e, r) => (e ? rej(e) : res(r))));

describe('o carro solto (rola depois que o motorista sai)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, host, pageId;
  before(async () => {
    h = await bootGame({ port: PORT, extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '300', FLY_TIME: '40' } });
    host = await startBRMatch(h, { serverPort: PORT });
    pageId = await h.play(() => window.__MP.socket.id);
    await h.play(() => window.__game.Car.ready);
  });
  after(async () => { if (host) host.close(); if (h) await h.close(); });

  /* tempo de RELÓGIO: o estado sai a 10 Hz (setInterval) e o laço do
     renderer segue rodando no harness — um QA.tick por cima somaria tempo de
     jogo ao do relógio e o carro andaria mais rápido que o carro (medido:
     47 m/s aparentes a 105 km/h no velocímetro) */
  const quadro = (ms = 100) => sleep(ms);

  async function hostEm(pos) {
    for (let i = 0; i < 14; i++) { host.emit('state', { pos, rotY: 0, heldWeapon: 'FUZIL' }); await sleep(25); }
    await sleep(150);
  }
  async function paginaEm(x, z) {
    await h.play((px, pz) => window.QA.reset(px, pz), x, z);
    const alvo = await h.play(() => { const P = window.__MP.player.pos; return [P.x, P.z]; });
    for (let k = 0; k < 60; k++) {
      const visto = await new Promise(res => {
        const t = setTimeout(() => res(false), 150);
        host.once('playerUpdate', d => { clearTimeout(t); res(d && d.id === pageId && Math.hypot(d.pos[0] - alvo[0], d.pos[2] - alvo[1]) < 1.5); });
      });
      if (visto) return;
      await quadro(50);
    }
    throw new Error('o servidor não aceitou a página na posição');
  }

  it('ex-motorista: sai a toda, o carro rola, e quem chega onde ele parou entra', async t => {
    // o esportivo: é o que rola longe (118 km/h)
    const car = await h.play(() => {
      const vs = window.__game.Car.vehicles;
      const i = vs.findIndex(v => v.cfg.name === 'ESPORTIVO GT' && !v.destruido);
      const v = vs[i], p = v.chassisBody.position;
      // de pé ao lado da porta (2,5 m à esquerda do nariz +X)
      const q = v.group.quaternion, THREE = window.__MP.THREE;
      const lado = new THREE.Vector3(0, 0, -2.5).applyQuaternion(q);
      return { i, x: p.x, z: p.z, px: p.x + lado.x, pz: p.z + lado.z };
    });
    assert.ok(car.i >= 0, 'cenário: sem esportivo na frota');
    await paginaEm(car.px, car.pz);
    const entrou = await h.play(() => { window.__game.tryToggleCar(); window.QA.tick(2); return window.__game.state.driving; });
    assert.ok(entrou, 'não entrou no esportivo');
    // acelera de verdade (tecla), em tempo real, até ~100 km/h
    let kmh = 0;
    for (let k = 0; k < 80 && kmh < 100; k++) {
      await h.play(() => { window.__game.keys.KeyW = true; });
      await quadro();
      kmh = await h.play(i => window.__game.Car.vehicles[i].chassisBody.velocity.length() * 3.6, car.i);
    }
    const rola = collect(host, 'carRola');
    /* o ex-motorista continua EXISTINDO para os outros enquanto o carro rola
       (laudo afb1ae8, §4.1: o `carSolto` normal e o `state` volátil no mesmo
       tique — o socket.io descartava o volátil, 0 playerUpdate dele por até
       2,65 s, e o outro cliente prendia o carro no ponto de saída) */
    const ups = [];
    host.on('playerUpdate', d => {
      if (d && d.id === pageId) ups.push(Date.now());
      if (d && d.solto) rola.push(d.solto);   // o carro solto vem dentro do playerUpdate
    });
    /* e o 1º `state` A PÉ não se perde na saída (laudo a9a4ffd, §4.6): o
       `leaveCar` normal saía antes do `state` volátil do mesmo tique e o
       socket.io descartava o volátil. Na ordem certa, o servidor repassa o
       ex-motorista a pé ANTES de liberar o carro (`carFree`) */
    const ordem = [];
    host.on('carFree', d => { if (d && d.idx === car.i) ordem.push({ ev: 'carFree', t: Date.now() }); });
    host.on('playerUpdate', d => {
      if (d && d.id === pageId && d.car === -1 && !ordem.some(o => o.ev === 'aPe')) ordem.push({ ev: 'aPe', t: Date.now() });
    });
    const tSaida = Date.now();
    const saida = await h.play(i => {
      const G = window.__game;
      G.keys.KeyW = false;
      G.tryToggleCar();
      const p = G.Car.vehicles[i].chassisBody.position;
      return { x: p.x, z: p.z, dirigindo: G.state.driving };
    }, car.i);
    assert.equal(saida.dirigindo, false, 'não saiu do carro');
    // rola até parar (1 s abaixo de 0,3 m/s) — no máximo 12 s
    let parado = 0;
    for (let k = 0; k < 120 && parado < 10; k++) {
      await quadro();
      const v = await h.play(i => window.__game.Car.vehicles[i].chassisBody.velocity.length(), car.i);
      parado = v < 0.3 ? parado + 1 : 0;
    }
    for (let k = 0; k < 8; k++) await quadro();   // os últimos pacotes chegam
    const fim = await h.play(i => { const p = window.__game.Car.vehicles[i].chassisBody.position; return { x: p.x, y: p.y, z: p.z }; }, car.i);
    const rolou = Math.hypot(fim.x - saida.x, fim.z - saida.z);
    const ultima = rola.filter(r => r.idx === car.i).at(-1);
    t.diagnostic(`saiu a ${kmh.toFixed(1)} km/h; rolou ${rolou.toFixed(2)} m; ${rola.length} poses repassadas; ` +
      `última a ${ultima ? Math.hypot(ultima.pos[0] - fim.x, ultima.pos[2] - fim.z).toFixed(3) : '—'} m do carro parado`);
    assert.ok(rolou > 15, `cenário: o carro rolou só ${rolou.toFixed(2)} m depois da saída (precisa passar da folga de 12 m)`);
    const marcas = [tSaida, ...ups.filter(u => u > tSaida && u < tSaida + 4000)];
    let buraco = 0;
    for (let i = 1; i < marcas.length; i++) buraco = Math.max(buraco, marcas[i] - marcas[i - 1]);
    t.diagnostic(`playerUpdate do ex-motorista nos 4 s depois da saída: ${marcas.length - 1}; maior buraco ${buraco} ms`);
    assert.ok(marcas.length - 1 >= 20 && buraco < 600, `o ex-motorista sumiu para os outros enquanto o carro rolava: ${marcas.length - 1} playerUpdate em 4 s, buraco de ${buraco} ms`);
    t.diagnostic(`na saída: ${ordem.map(o => `${o.ev} +${o.t - tSaida} ms`).join(', ')}`);
    assert.deepEqual(ordem.map(o => o.ev), ['aPe', 'carFree'], 'o 1º state a pé se perdeu: o servidor liberou o carro antes de ver o ex-motorista a pé');
    assert.ok(ultima, 'o servidor não repassou nenhuma pose do carro solto');
    assert.ok(Math.hypot(ultima.pos[0] - fim.x, ultima.pos[2] - fim.z) < 0.5,
      `a última pose repassada está a ${Math.hypot(ultima.pos[0] - fim.x, ultima.pos[2] - fim.z).toFixed(2)} m do carro parado`);
    // o host anda até o carro parado e entra
    await hostEm([fim.x + 2.5, fim.y, fim.z]);
    const r = await ack(host, 'enterCar', { idx: car.i });
    assert.equal(r && r.ok, true, 'quem chegou ao lado do carro parado não entrou ("Veículo ocupado!")');
    host.emit('leaveCar', { idx: car.i });
    await sleep(150);
  });

  it('observador: o carro que o outro soltou aparece onde parou, e fica lá', async t => {
    const car = await h.play(() => {
      const vs = window.__game.Car.vehicles;
      const i = vs.findIndex(v => v.cfg.name === 'BUGGY' && !v.destruido);
      const p = vs[i].chassisBody.position;
      return { i, x: p.x, y: p.y, z: p.z };
    });
    assert.ok(car.i >= 0, 'cenário: sem buggy na frota');
    await paginaEm(car.x + 30, car.z + 30);
    await hostEm([car.x + 2.5, car.y, car.z]);
    assert.equal((await ack(host, 'enterCar', { idx: car.i })).ok, true, 'o host não pegou o buggy');
    // dirige 20 m e sai; o carro solto rola mais 40 m (20 m/s)
    for (let k = 0; k <= 10; k++) { host.emit('state', { pos: [car.x + 2 * k, car.y, car.z], rotY: 0, car: car.i, heldWeapon: 'FUZIL' }); await quadro(); }
    host.emit('leaveCar', { idx: car.i });
    host.emit('state', { pos: [car.x + 20, car.y, car.z + 2.5], rotY: 0, heldWeapon: 'FUZIL' });
    const fim = [car.x + 60, car.y, car.z];
    // como o cliente de verdade: o carro solto vai DENTRO do state do ex-motorista
    for (let k = 1; k <= 20; k++) {
      host.emit('state', { pos: [car.x + 20, car.y, car.z + 2.5], rotY: 0, heldWeapon: 'FUZIL',
        solto: { idx: car.i, pos: [car.x + 20 + 2 * k, car.y, car.z], rotY: 0 } });
      await quadro();
    }
    const logo = await h.play(i => { const p = window.__game.Car.vehicles[i].chassisBody.position; return [p.x, p.z]; }, car.i);
    for (let k = 0; k < 20; k++) await quadro();   // 2 s depois: os pacotes pararam, a física assenta
    const depois = await h.play(i => { const p = window.__game.Car.vehicles[i].chassisBody.position; return [p.x, p.z]; }, car.i);
    const d1 = Math.hypot(logo[0] - fim[0], logo[1] - fim[2]), d2 = Math.hypot(depois[0] - fim[0], depois[1] - fim[2]);
    t.diagnostic(`na página: ${d1.toFixed(2)} m do fim ao chegar a última pose; ${d2.toFixed(2)} m 2 s depois`);
    assert.ok(d1 < 1.5, `a página mostra o carro a ${d1.toFixed(2)} m de onde o servidor diz que ele parou`);
    assert.ok(d2 < 1.5, `2 s depois o carro está a ${d2.toFixed(2)} m de onde parou`);
  });

  it('boot limpo: sem erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
