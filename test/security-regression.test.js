/* ================================================================
   QA — regressão de robustez do servidor (autoridade e limites).
   Cada teste fixa uma INVARIANTE do modelo cliente↔servidor: o
   servidor não confia em estado que o cliente afirma, e impõe seus
   próprios limites. Se um destes ficar vermelho, uma dessas garantias
   foi enfraquecida — não relaxe o teste, entenda a mudança primeiro.
   ================================================================ */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');

const SERVER = path.join(__dirname, '..', 'server.js');
/* PORT=0: o sistema escolhe uma porta livre e o servidor a anuncia no log.
   A faixa fixa antiga (33000+) caía dentro da faixa efêmera do Linux
   (32768–60999): uma conexão de saída qualquer ocupava a porta escolhida e
   o boot morria com EADDRINUSE — "regressão real" que era colisão. */
let nServidor = 0;

function spawnServer(env = {}) {
  const rankFile = env.RANK_FILE || path.join(os.tmpdir(),
    `fps-sec-rank-${process.pid}-${nServidor++}-${Date.now()}.json`);
  const removeRankFile = !env.RANK_FILE;
  const proc = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env, PORT: '0', HOST_CODE: 'QA123',
      COUNTDOWN_S: '1', NEXT_IN_S: '60', GAS_DEFAULT: 'classica',
      RANK_FILE: rankFile, ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('servidor não subiu')), 5000);
    let saida = '', subiu = false;
    proc.stdout.on('data', d => {
      if (subiu) return;                       // o resto do log não interessa (o pipe segue lido)
      saida += d;
      const m = /Servidor BR no ar em http:\/\/localhost:(\d+)/.exec(saida);
      if (m) {
        subiu = true;
        clearTimeout(to);
        res({
          port: Number(m[1]), proc,
          stop: () => new Promise(resolve => {
            const done = () => { if (removeRankFile) fs.rmSync(rankFile, { force: true }); resolve(); };
            if (proc.exitCode !== null) return done();
            proc.once('exit', done);
            proc.kill();
          }),
        });
      }
    });
    /* o stderr do servidor é LIDO (pipe cheio trava o processo) e vai junto
       na falha: "morreu cedo, código 1" sozinho não diz se foi porta ocupada
       ou exceção no boot — já custou triagem às cegas */
    let stderrFim = '';
    proc.stderr.on('data', d => { stderrFim = (stderrFim + d).slice(-1500); });
    proc.on('exit', c => rej(new Error('servidor morreu cedo, código ' + c + (stderrFim ? '\n' + stderrFim : ''))));
  });
}

const connect = port => {
  const s = io(`http://localhost:${port}`, { transports: ['websocket'], reconnection: false });
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('sem init')), 4000);
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

/* =============== teto de conexões por IP =============== */
describe('Conexões — teto por IP', () => {
  it('dado um IP acima do teto, então as conexões excedentes são recusadas', async t => {
    // IP_LIMIT_ALL=1 aplica o teto também a loopback (em produção loopback é
    // isento — ver o teste seguinte).
    const srv = await spawnServer({ MAX_CONN_PER_IP: '3', IP_LIMIT_ALL: '1' });
    t.after(() => srv.stop());
    const live = [];
    t.after(() => live.forEach(s => s.close()));
    for (let i = 0; i < 3; i++) {
      const c = await connect(srv.port);
      live.push(c.s);
    }
    const s4 = io(`http://localhost:${srv.port}`, { transports: ['websocket'], reconnection: false });
    live.push(s4);
    const verdict = await new Promise(res => {
      const to = setTimeout(() => res('timeout'), 3000);
      s4.once('init', () => { clearTimeout(to); res('aceito'); });
      s4.once('disconnect', () => { clearTimeout(to); res('recusado'); });
      s4.once('rejected', () => { clearTimeout(to); res('recusado'); });
    });
    assert.equal(verdict, 'recusado', 'a conexão acima do teto do IP deveria ser recusada');
  });

  it('dado loopback (bots e host de teste), então o teto por IP é isento', async t => {
    // Invariante de gameplay: os bots e o host de teste conectam de localhost;
    // sem a isenção de loopback a lobby esvaziaria.
    const srv = await spawnServer({ MAX_CONN_PER_IP: '2' });
    t.after(() => srv.stop());
    const live = [];
    t.after(() => live.forEach(s => s.close()));
    for (let i = 0; i < 5; i++) {
      const c = await connect(srv.port);
      live.push(c.s);
    }
    assert.equal(live.length, 5, 'loopback deveria ser isento do teto por IP');
  });
});

/* =============== loot só de quem participa =============== */
describe('Loot — só de participantes vivos da partida', () => {
  it('dado um espectador (entrou no meio), então o deathDrop dele é ignorado', async t => {
    // Só quem participa da partida solta loot; um espectador não injeta itens.
    const { srv, clients } = await playing(t, 2);
    const spec = await connect(srv.port);
    t.after(() => spec.s.close());
    spec.s.emit('hello', { nick: 'ESPEC' });
    await sleep(200);
    const drops = collect(clients[1].s, 'dropSpawn');
    spec.s.emit('deathDrop', {
      pos: [0, 2, 0],
      items: [{ type: 'weapon', weapon: 4, ammo: 999 }, { type: 'armor', amount: 200 }],
    });
    await sleep(350);
    assert.equal(drops.length, 0, 'espectador não deveria conseguir soltar loot');
  });

  it('dado um jogador que morreu na partida, então o deathDrop legítimo dele sai', async t => {
    // Invariante de gameplay: o loot de morte precisa continuar caindo. O
    // cliente e os bots emitem o drop ANTES do `died` — essa é a ordem real.
    const { clients } = await playing(t, 3); // 3: a morte não encerra a partida
    const [a, b] = clients;
    const drops = collect(b.s, 'dropSpawn');
    a.s.emit('deathDrop', { pos: [1, 2, 3], items: [{ type: 'armor', amount: 50 }, { type: 'ammo', amount: 60 }] });
    a.s.emit('died', { cause: { type: 'environment' } });
    await sleep(300);
    assert.equal(drops.length, 1, 'o loot de morte legítimo não pode sumir');
  });

  it('dado o servidor que já registrou a morte, então o deathDrop que chega depois também sai', async t => {
    // morte decidida pelo servidor (zona, cidade, inatividade) chega antes do drop
    const { clients } = await playing(t, 3); // 3: a morte não encerra a partida
    const [a, b] = clients;
    const drops = collect(b.s, 'dropSpawn');
    a.s.emit('died', { cause: { type: 'gas' } });
    await sleep(150);
    a.s.emit('deathDrop', { pos: [1, 2, 3], items: [{ type: 'ammo', amount: 60 }] });
    await sleep(300);
    assert.equal(drops.length, 1, 'drop depois da morte registrada sumiu');
  });

  it('dado um jogador VIVO, então o deathDrop dele não cria loot', async t => {
    // Loot de morte é da morte: sem `died`, nada aparece no chão.
    const { clients } = await playing(t, 3); // 3: a morte não encerra a partida
    const [a, b] = clients;
    const drops = collect(b.s, 'dropSpawn');
    a.s.emit('state', { pos: [40, 5, 40], rotY: 0 });
    await sleep(100);
    a.s.emit('deathDrop', { pos: [40, 5, 40], items: [{ type: 'ammo', amount: 60 }] });
    await sleep(700);
    assert.equal(drops.length, 0, 'jogador vivo criou loot de morte');
  });

  it('dado o loot de morte, então ele nasce onde o SERVIDOR viu o jogador, com valores plausíveis', async t => {
    // O servidor não confia em posição nem em quantidade declaradas.
    const { clients } = await playing(t, 3); // 3: a morte não encerra a partida
    const [a, b] = clients;
    const drops = collect(b.s, 'dropSpawn');
    a.s.emit('state', { pos: [40, 5, 40], rotY: 0 });
    await sleep(100);
    a.s.emit('deathDrop', {
      pos: [300, 5, -300],
      items: [
        { type: 'weapon', weapon: 3, ammo: 999 },
        { type: 'armor', amount: 200 },
        { type: 'ammo', amount: 200 },
        { type: 'desconhecido', amount: 5 },
      ],
    });
    a.s.emit('died', { cause: { type: 'environment' } });
    await sleep(300);
    assert.equal(drops.length, 1, 'o loot de morte não saiu');
    const d = drops[0];
    assert.ok(Math.hypot(d.pos[0] - 40, d.pos[2] - 40) < 1, `loot nasceu longe do jogador: ${JSON.stringify(d.pos)}`);
    const arma = d.items.find(i => i.type === 'weapon');
    const colete = d.items.find(i => i.type === 'armor');
    const mun = d.items.find(i => i.type === 'ammo');
    assert.ok(arma && arma.ammo <= 300, `munição da arma sem teto: ${JSON.stringify(arma)}`);
    assert.ok(colete && colete.amount <= 50, `colete sem teto: ${JSON.stringify(colete)}`);
    assert.ok(mun && mun.amount <= 60, `munição solta sem teto: ${JSON.stringify(mun)}`);
    assert.ok(!d.items.some(i => i.type === 'desconhecido'), 'tipo desconhecido passou');
  });

  it('dado o loot de morte, então a munição de cada arma respeita o teto daquela arma', async t => {
    // teto por arma: o que o jogo entrega para ela (baú, torre) com folga
    const { clients } = await playing(t, 3); // 3: a morte não encerra a partida
    const [a, b] = clients;
    const drops = collect(b.s, 'dropSpawn');
    a.s.emit('deathDrop', { pos: [0, 2, 0], items: [
      { type: 'weapon', weapon: 3, ammo: 300 },
      { type: 'weapon', weapon: 0, ammo: 300 },
    ] });
    a.s.emit('died', { cause: { type: 'environment' } });
    await sleep(300);
    assert.equal(drops.length, 1, 'o loot de morte não saiu');
    const porArma = Object.fromEntries(drops[0].items.filter(i => i.type === 'weapon').map(i => [i.weapon, i.ammo]));
    assert.ok(porArma[3] <= 12, `munição da arma 3 sem teto próprio: ${porArma[3]}`);
    assert.equal(porArma[0], 300, 'o teto de uma arma não pode cortar a munição legítima de outra');
  });
});

/* =============== posse de veículo é do servidor =============== */
describe('Veículo — posse arbitrada pela posição que o servidor conhece', () => {
  const veic = (plan, id) => (plan.veiculos || []).find(v => String(v.v) === String(id));

  it('dado um jogador longe do carro, então ele não assume o carro', async t => {
    const { clients, plan } = await playing(t, 3);
    const [a] = clients;
    const carro = (plan.veiculos || []).find(v => v.v !== 'heli');
    assert.ok(carro, 'cenário inválido: a partida não tem carro');
    a.s.emit('state', { pos: [carro.pos[0] + 200, 5, carro.pos[2] + 200], rotY: 0 });
    await sleep(150);
    const r = await ack(a.s, 'enterCar', { idx: +carro.v });
    assert.equal(r.ok, false, 'assumiu um carro a 280 m');
  });

  it('dado um jogador ao lado do carro, então ele assume o carro', async t => {
    const { clients, plan } = await playing(t, 3);
    const [a] = clients;
    const carro = (plan.veiculos || []).find(v => v.v !== 'heli');
    a.s.emit('state', { pos: [carro.pos[0] + 2, carro.pos[1], carro.pos[2]], rotY: 0 });
    await sleep(150);
    const r = await ack(a.s, 'enterCar', { idx: +carro.v });
    assert.equal(r.ok, true, 'não assumiu o carro estando ao lado dele');
  });

  it('dado um jogador longe do helicóptero, então ele não é tratado como piloto pelos outros', async t => {
    const { clients, plan } = await playing(t, 3);
    const [a, b] = clients;
    const heli = veic(plan, 'heli');
    assert.ok(heli, 'cenário inválido: a partida não tem helicóptero');
    const ups = collect(b.s, 'playerUpdate');
    for (let i = 0; i < 5; i++) {
      a.s.emit('state', { pos: [heli.pos[0] + 150, 5, heli.pos[2] + 150], rotY: 0, heli: true });
      await sleep(60);
    }
    await sleep(150);
    const deA = ups.filter(u => u.id === a.init.id);
    assert.ok(deA.length > 0, 'cenário inválido: nenhum playerUpdate do jogador');
    assert.ok(deA.every(u => !u.heli), 'jogador longe do helicóptero repassado como piloto');
  });

  it('dado o piloto de verdade (ao lado do helicóptero), então ele é repassado como piloto', async t => {
    const { clients, plan } = await playing(t, 3);
    const [a, b] = clients;
    const heli = veic(plan, 'heli');
    const ups = collect(b.s, 'playerUpdate');
    for (let i = 0; i < 5; i++) {
      a.s.emit('state', { pos: [heli.pos[0], heli.pos[1] + 0.5, heli.pos[2]], rotY: 0, heli: true });
      await sleep(60);
    }
    await sleep(150);
    const deA = ups.filter(u => u.id === a.init.id);
    assert.ok(deA.some(u => u.heli), 'o piloto de verdade não foi repassado como piloto');
  });

  /* a geometria da semente 424242, montada aqui pelos módulos puros (o
     servidor sobe com a MESMA semente): onde o cliente pisa */
  async function geometria() {
    const url = require('node:url');
    const imp = f => import(url.pathToFileURL(path.join(__dirname, '..', 'js', f)).href);
    const [Par, Cas, Tor] = await Promise.all([imp('paredes.js'), imp('castle.js'), imp('watchtower.js')]);
    const t = await require('../scripts/bots.js').createBotTerrain(424242);
    const mundo = Par.construirMundoSolido({ worldSeed: 424242, heightAt: t.heightAt, slopeAt: t.slopeAt,
      WATER_LEVEL: t.WATER_LEVEL, CITY: t.CITY });
    return { t, mundo, castelo: Cas.castleGeometry({ center: mundo.plano.forte, heightAt: t.heightAt }),
      torre: x => Tor.towerPlatforms(x.x, x.z, x.y) };
  }
  /* toma o helicóptero de verdade e manda `heli: true` de `pos` até o servidor
     aceitar a pose; devolve o último playerUpdate do piloto ali */
  async function pilotoEm(t, pos) {
    const { clients, plan } = await playing(t, 3, { WORLD_SEED: '424242' });
    const [a, b] = clients;
    const heli = veic(plan, 'heli');
    const ups = collect(b.s, 'playerUpdate');
    for (let i = 0; i < 5; i++) { a.s.emit('state', { pos: [heli.pos[0], heli.pos[1] + 0.5, heli.pos[2]], rotY: 0, heli: true }); await sleep(60); }
    for (let i = 0; i < 14; i++) { a.s.emit('state', { pos, rotY: 0, heli: true }); await sleep(80); }
    await sleep(150);
    const deA = ups.filter(u => u.id === a.init.id);
    return { foiPiloto: deA.some(u => u.heli), ali: deA.filter(u => Math.hypot(u.pos[0] - pos[0], u.pos[2] - pos[2]) < 1 && Math.abs(u.pos[1] - pos[1]) < 1).at(-1) };
  }

  it('dado o piloto pairando 3 m acima do chão DEBAIXO de uma cobertura que o helicóptero atravessa, então ele segue piloto', async t => {
    const G = await geometria();
    const cob = G.mundo.paredes.find(w => w.noCollide && w.acabamento
      && w.y0 - G.t.heightAt((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2) > 4.5 && (w.x1 - w.x0) > 3 && (w.z1 - w.z0) > 3);
    assert.ok(cob, 'cenário: nenhuma cobertura alta de acabamento');
    const x = (cob.x0 + cob.x1) / 2, z = (cob.z0 + cob.z1) / 2;
    const r = await pilotoEm(t, [x, G.t.heightAt(x, z) + 3, z]);
    assert.ok(r.foiPiloto && r.ali, 'cenário inválido: não chegou a pilotar ali');
    assert.equal(r.ali.heli, true, 'o piloto debaixo da cobertura deixou de ser piloto');
  });

  it('dado o piloto com o pé numa plataforma do castelo ou de uma torre de vigia, então ele deixa de ser tratado como piloto', async t => {
    const G = await geometria();
    /* o caso que só a PLATAFORMA explica: o que as paredes da semente põem
       debaixo dela fica bem abaixo do pé (o adarve sobre a laje da fundação,
       o patamar da escada da torre) */
    const vao = p => {
      const x = (p.x0 + p.x1) / 2, z = (p.z0 + p.z1) / 2;
      let sob = G.t.heightAt(x, z);
      for (const w of G.mundo.paredes) if (x >= w.x0 && x <= w.x1 && z >= w.z0 && z <= w.z1 && w.y1 <= p.y + 0.05 && w.y1 > sob) sob = w.y1;
      return p.y - sob;
    };
    const melhor = lista => lista.filter(p => !p.ramp).sort((p, q) => vao(q) - vao(p))[0];
    const casos = [['castelo', melhor(G.castelo.walkSurfaces)], ['torre', melhor(G.mundo.plano.torres.flatMap(G.torre))]];
    for (const [nome, p] of casos) {
      const x = (p.x0 + p.x1) / 2, z = (p.z0 + p.z1) / 2;
      assert.ok(vao(p) > 1, `cenário: debaixo da plataforma do ${nome} a parede fica a ${vao(p).toFixed(2)} m`);
      const r = await pilotoEm(t, [x, p.y, z]);
      assert.ok(r.foiPiloto && r.ali, `cenário inválido (${nome}): não chegou a ficar ali`);
      assert.equal(r.ali.heli, false, `repassado como piloto com o pé na plataforma do ${nome}`);
    }
  });

  it('dado o piloto a pé na rampa da escada da Torre, onde os degraus não dão chão, então ele deixa de ser piloto', async t => {
    const G = await geometria();
    /* os degraus são caixas com o topo no meio do degrau: no começo de cada
       um, a rampa que o cliente anda passa abaixo do topo dele, e o que sobra
       debaixo é o lance do andar de baixo. A âncora é a rampa da semente (a
       que o cliente empilha), e o vão é medido contra TODAS as paredes */
    const sob = (x, y, z) => {
      let g = G.t.heightAt(x, z);
      for (const w of G.mundo.paredes) if (x >= w.x0 && x <= w.x1 && z >= w.z0 && z <= w.z1 && w.y1 <= y + 0.05 && w.y1 > g) g = w.y1;
      return g;
    };
    let melhor = null;
    for (const op of G.mundo.cidade.nexus.ops) {
      const p = op.plataforma;
      if (op.tipo !== 'lance' || !p || !p.ramp) continue;
      const x = (p.x0 + p.x1) / 2;
      for (let z = p.z0 + 0.05; z < p.z1 - 0.05; z += 0.01) {
        const y = p.y0 + (p.y1 - p.y0) * (z - p.z0) / (p.z1 - p.z0);
        const vao = y - sob(x, y, z);
        if (!melhor || vao > melhor.vao) melhor = { x, y, z, vao };
      }
    }
    assert.ok(melhor && melhor.vao > 1, `cenário: a rampa da escada sempre tem parede a ${melhor && melhor.vao.toFixed(2)} m`);
    const r = await pilotoEm(t, [melhor.x, melhor.y, melhor.z]);
    assert.ok(r.foiPiloto && r.ali, 'cenário inválido: não chegou a ficar na rampa');
    assert.equal(r.ali.heli, false, `repassado como piloto a pé na rampa da escada (vão de ${melhor.vao.toFixed(2)} m pelas paredes)`);
  });

  it('dado o piloto pairando logo ACIMA de acabamento que o helicóptero atravessa, então ele segue piloto', async t => {
    const G = await geometria();
    /* caixa d'água, casa de máquinas de bala, poste: o helicóptero do cliente
       os atravessa (`Structures.collide` ignora `noCollide`), então 0,25 m
       acima do topo deles ele está NO AR — o telhado fica bem abaixo */
    const sobSemAcab = (x, y, z) => {
      let g = G.t.heightAt(x, z);
      for (const w of G.mundo.paredes) {
        if (w.noCollide && w.acabamento) continue;
        if (x >= w.x0 && x <= w.x1 && z >= w.z0 && z <= w.z1 && w.y1 <= y + 0.05 && w.y1 > g) g = w.y1;
      }
      return g;
    };
    const peca = G.mundo.paredes.find(w => {
      if (!w.noCollide || !w.acabamento || (w.x1 - w.x0) < 1 || (w.z1 - w.z0) < 1) return false;
      const x = (w.x0 + w.x1) / 2, z = (w.z0 + w.z1) / 2, y = w.y1 + 0.25;
      return y - sobSemAcab(x, y, z) > 1.2 && !G.mundo.paredes.some(o => o !== w && x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1 && o.y0 < y + 2 && o.y1 > w.y1);
    });
    assert.ok(peca, 'cenário: nenhum acabamento sem corpo com o telhado bem abaixo');
    const x = (peca.x0 + peca.x1) / 2, z = (peca.z0 + peca.z1) / 2;
    const r = await pilotoEm(t, [x, peca.y1 + 0.25, z]);
    assert.ok(r.foiPiloto && r.ali, 'cenário inválido: não chegou a pairar ali');
    assert.equal(r.ali.heli, true, `pairando 0,25 m acima de ${peca.acabamento} deixou de ser piloto`);
  });

  it('dado o piloto com o pé numa laje abaixo do telhado da coluna, então ele deixa de ser tratado como piloto', async t => {
    const { clients, plan } = await playing(t, 3);
    const [a, b] = clients;
    const heli = veic(plan, 'heli');
    const ups = collect(b.s, 'playerUpdate');
    for (let i = 0; i < 5; i++) {
      a.s.emit('state', { pos: [heli.pos[0], heli.pos[1] + 0.5, heli.pos[2]], rotY: 0, heli: true });
      await sleep(60);
    }
    // 7 m abaixo do heliponto, na mesma coluna: bem acima do relevo, abaixo do telhado
    const laje = [heli.pos[0] + 1, heli.pos[1] - 7, heli.pos[2] + 1];
    for (let i = 0; i < 14; i++) { a.s.emit('state', { pos: laje, rotY: 0, heli: true }); await sleep(80); }
    await sleep(150);
    const deA = ups.filter(u => u.id === a.init.id);
    assert.ok(deA.some(u => u.heli), 'cenário inválido: não chegou a ser piloto');
    const ultimo = deA.filter(u => Math.hypot(u.pos[0] - laje[0], u.pos[2] - laje[2]) < 1 && Math.abs(u.pos[1] - laje[1]) < 1).at(-1);
    assert.ok(ultimo, 'cenário inválido: a pose na laje não foi aceita');
    assert.equal(ultimo.heli, false, 'repassado como piloto debaixo do telhado');
  });

  it('dado o piloto com o pé no chão longe do helicóptero, então ele deixa de ser tratado como piloto', async t => {
    const { clients, plan } = await playing(t, 3);
    const [a, b] = clients;
    const heli = veic(plan, 'heli');
    const carro = (plan.veiculos || []).find(v => v.v !== 'heli');
    const ups = collect(b.s, 'playerUpdate');
    for (let i = 0; i < 5; i++) {
      a.s.emit('state', { pos: [heli.pos[0], heli.pos[1] + 0.5, heli.pos[2]], rotY: 0, heli: true });
      await sleep(60);
    }
    // o carro parado está a ~0,58 m do chão: ali, o chão é carro.y − 0,58
    const chao = [carro.pos[0] + 3, carro.pos[1] - 0.58, carro.pos[2]];
    for (let i = 0; i < 14; i++) { a.s.emit('state', { pos: chao, rotY: 0, heli: true }); await sleep(80); }
    await sleep(150);
    const deA = ups.filter(u => u.id === a.init.id);
    assert.ok(deA.some(u => u.heli), 'cenário inválido: não chegou a ser piloto');
    const ultimo = deA.filter(u => Math.hypot(u.pos[0] - chao[0], u.pos[2] - chao[2]) < 1).at(-1);
    assert.ok(ultimo, 'cenário inválido: a pose no chão não foi aceita');
    assert.equal(ultimo.heli, false, 'repassado como piloto com o pé no chão');
  });
});

/* =============== crédito de kill exige acerto validado =============== */
describe('Kill — crédito só com acerto validado', () => {
  it('dado um killer que nunca acertou a vítima, então a kill não é creditada', async t => {
    // O crédito de eliminação depende de um acerto que o servidor validou —
    // não do que a vítima declara.
    const { clients } = await playing(t, 3);
    const [a, b] = clients;
    const killed = once(a.s, 'playerKilled');
    await ack(b.s, 'died', { killerId: a.init.id, weapon: 'FUZIL' });
    const k = await killed;
    assert.equal(k.killerId, null, 'kill creditada sem acerto validado');
    assert.equal(k.killerKills, 0);
  });

  it('dado o killer que acertou a vítima, então a kill é creditada', async t => {
    // Gameplay legítimo: quem de fato atirou leva o crédito.
    const { clients } = await playing(t, 3);
    const [a, b] = clients;
    a.s.emit('shotHit', { targetId: b.init.id, dmg: 40, weapon: 'FUZIL', fromPos: [0, 1.5, 0] });
    await sleep(200);
    const killed = once(a.s, 'playerKilled');
    await ack(b.s, 'died', { killerId: a.init.id, weapon: 'FUZIL' });
    const k = await killed;
    assert.equal(k.killerId, a.init.id);
    assert.equal(k.killerKills, 1);
  });
});

/* =============== cooldown de anfitrião por IP =============== */
describe('Anfitrião — cooldown de tentativas por IP', () => {
  it('dado o teto de tentativas atingido, então reconectar não zera o cooldown', async t => {
    // O cooldown é do IP, não do socket: reconectar não devolve tentativas.
    const srv = await spawnServer();
    t.after(() => srv.stop());
    const c1 = await connect(srv.port);
    t.after(() => c1.s.close());
    for (let i = 0; i < 5; i++) await ack(c1.s, 'claimHost', { code: 'ERRADO' + i });
    const c2 = await connect(srv.port);
    t.after(() => c2.s.close());
    const r = await ack(c2.s, 'claimHost', { code: 'QA123' });
    assert.equal(r.ok, false, 'reconectar não pode zerar o cooldown do IP');
  });
});

/* =============== postura declarada pelo cliente é limitada =============== */
describe('Postura — o campo de agachar é limitado pelo servidor', () => {
  /* manda `state` a 10 Hz andando em linha reta a `v` m/s dizendo `crouch`;
     devolve a última postura que o OUTRO jogador recebeu */
  async function posturaVista(t, { v, crouch, extra = {}, ms = 1200 }) {
    const { clients } = await playing(t, 2);
    const [a, b] = clients;
    const upds = collect(b.s, 'playerUpdate');
    let z = 10;
    const iv = setInterval(() => {
      a.s.emit('state', { pos: [10, 2, z], rotY: 0, crouch, ...extra });
      z += v * 0.1;
    }, 100);
    t.after(() => clearInterval(iv));
    await sleep(ms);
    const mine = upds.filter(u => u.id === a.init.id);
    return { ultimo: mine.at(-1), todos: mine };
  }

  it('dado um tipo que não é número, então a postura repassada é 0', async t => {
    for (const crouch of ['1', true, { v: 1 }, [1]]) {
      const { ultimo } = await posturaVista(t, { v: 0, crouch, ms: 500 });
      assert.ok(ultimo, 'nenhum playerUpdate chegou');
      assert.equal(ultimo.crouch, 0, `postura ${JSON.stringify(crouch)} repassada como ${JSON.stringify(ultimo.crouch)}`);
    }
  });

  it('dado um número fora da faixa, então a postura repassada fica em [0, 1]', async t => {
    const alto = await posturaVista(t, { v: 0, crouch: 50, ms: 500 });
    const baixo = await posturaVista(t, { v: 0, crouch: -3, ms: 500 });
    assert.equal(alto.ultimo.crouch, 1);
    assert.equal(baixo.ultimo.crouch, 0);
  });

  it('dado deslocamento acima da velocidade de quem está agachado, então a postura repassada é 0', async t => {
    const andando = await posturaVista(t, { v: 5.2, crouch: 1 });
    const correndo = await posturaVista(t, { v: 8.6, crouch: 1 });
    // a primeira meia janela ainda não tem caminho medido; depois dela, nada passa
    const tardeA = andando.todos.slice(-5), tardeC = correndo.todos.slice(-5);
    assert.ok(tardeA.length >= 3 && tardeC.length >= 3, 'poucos playerUpdate para medir');
    assert.ok(tardeA.every(u => u.crouch === 0), `andando: ${JSON.stringify(tardeA.map(u => u.crouch))}`);
    assert.ok(tardeC.every(u => u.crouch === 0), `correndo: ${JSON.stringify(tardeC.map(u => u.crouch))}`);
  });

  it('dado deslocamento na velocidade de quem está agachado, então a postura é repassada', async t => {
    // controle do caso anterior: o portão não pode derrubar quem agacha de verdade
    const { todos } = await posturaVista(t, { v: 2.6, crouch: 1 });
    const tarde = todos.slice(-5);
    assert.ok(tarde.length >= 3 && tarde.every(u => u.crouch === 1),
      `agachado a 2,6 m/s repassado como ${JSON.stringify(tarde.map(u => u.crouch))}`);
  });

  it('dado paraquedas, queda, veículo ou helicóptero, então a postura repassada é 0', async t => {
    for (const extra of [{ chute: true }, { fall: true }, { car: 1 }, { heli: true }]) {
      const { ultimo } = await posturaVista(t, { v: 0, crouch: 1, extra, ms: 500 });
      assert.ok(ultimo, `nenhum playerUpdate com ${JSON.stringify(extra)}`);
      assert.equal(ultimo.crouch, 0, `postura aceita com ${JSON.stringify(extra)}`);
    }
  });
});

/* =============== invulnerabilidade de queda é temporal =============== */
describe('Queda — invulnerabilidade só na janela inicial', () => {
  it('dado o flag de queda fora da janela inicial, então o jogador ainda leva dano', async t => {
    // O flag de queda só protege durante a descida inicial; depois dela não
    // concede mais invulnerabilidade.
    const { clients } = await playing(t, 2, { FLY_TIME: '2', FALL_GRACE_S: '1' });
    const [a, b] = clients;
    await sleep(3500); // passa a janela (flyTime 2 + graça 1)
    a.s.emit('state', { pos: [0, 2, 0], rotY: 0, heldWeapon: 'FUZIL' });
    b.s.emit('state', { pos: [5, 2, 0], rotY: 0, fall: true });
    await sleep(300);
    const hits = collect(b.s, 'youWereHit');
    a.s.emit('shotHit', { targetId: b.init.id, dmg: 40, weapon: 'FUZIL', fromPos: [0, 3.5, 0] });
    await sleep(350);
    assert.equal(hits.length, 1, 'o flag de queda fora da janela não pode dar invulnerabilidade');
  });

  it('dado um jogador realmente em queda no início, então o tiro nele é rejeitado', async t => {
    // Gameplay legítimo: durante a queda de paraquedas o jogador é invulnerável.
    const { clients } = await playing(t, 2, { FLY_TIME: '30' });
    const [a, b] = clients;
    a.s.emit('state', { pos: [0, 2, 0], rotY: 0, heldWeapon: 'FUZIL' });
    b.s.emit('state', { pos: [5, 200, 0], rotY: 0, chute: true });
    await sleep(300);
    const hits = collect(b.s, 'youWereHit');
    a.s.emit('shotHit', { targetId: b.init.id, dmg: 40, weapon: 'FUZIL', fromPos: [0, 3.5, 0] });
    await sleep(350);
    assert.equal(hits.length, 0, 'quem cai de paraquedas no início deve ser invulnerável');
  });
});

/* =============== dano em veículo: as mesmas garantias do dano em jogador =============== */
describe('Veículo — o servidor valida o dano reportado na lataria', () => {
  const veic = (plan, id) => plan.veiculos.find(v => String(v.v) === String(id));
  const junto = (v, dx) => [v.pos[0] + dx, v.pos[1], v.pos[2]];
  async function cena(t, n = 2) {
    const r = await playing(t, n);
    assert.ok(Array.isArray(r.plan.veiculos) && r.plan.veiculos.length >= 5, 'partida sem frota anunciada');
    return r;
  }
  /* a vida que o SERVIDOR guarda, lida por uma conexão nova (init.veiculos) —
     não depende de ter visto (ou deixado de ver) um evento difundido */
  async function vidaNoServidor(t, srv, id) {
    const c = await connect(srv.port);
    t.after(() => c.s.close());
    const v = (c.init.veiculos || []).find(x => String(x.v) === String(id));
    return v ? v.vida : null;
  }

  it('dado um acerto além do alcance da arma, então a vida do veículo não muda', async t => {
    const { srv, clients, plan } = await cena(t);
    const [a, b] = clients;
    a.s.emit('state', { pos: junto(veic(plan, 0), 200), rotY: 0 }); // escopeta: 120 m
    await sleep(150);
    const hp = collect(b.s, 'vehicleHp');
    a.s.emit('vehicleHit', { v: 0, dmg: 88, weapon: 'ESCOPETA' });
    await sleep(300);
    assert.equal(hp.length, 0);
    assert.equal(await vidaNoServidor(t, srv, 0), 780);
  });

  it('dado uma arma que não fura lataria ou um código desconhecido, então nada muda', async t => {
    const { srv, clients, plan } = await cena(t);
    const [a, b] = clients;
    a.s.emit('state', { pos: junto(veic(plan, 0), 2), rotY: 0 });
    await sleep(150);
    const hp = collect(b.s, 'vehicleHp');
    for (const weapon of ['FACA', 'BAZUCA', 'LASER', null]) a.s.emit('vehicleHit', { v: 0, dmg: 30, weapon });
    await sleep(300);
    assert.equal(hp.length, 0);
    assert.equal(await vidaNoServidor(t, srv, 0), 780);
  });

  it('dado um dano declarado acima do da arma, então só o teto da arma é descontado', async t => {
    const { srv, clients, plan } = await cena(t);
    const [a, b] = clients;
    a.s.emit('state', { pos: junto(veic(plan, 0), 20), rotY: 0 });
    await sleep(150);
    const hp = collect(b.s, 'vehicleHp');
    a.s.emit('vehicleHit', { v: 0, dmg: 5000, weapon: 'FUZIL' });
    await sleep(300);
    assert.equal(hp.length, 1);
    assert.equal(hp[0].vida, 780 - 26);
    assert.equal(await vidaNoServidor(t, srv, 0), 780 - 26);
  });

  it('dado a janela de acertos já cheia com tiros em jogador, então o acerto em veículo também é recusado', async t => {
    const { srv, clients, plan } = await cena(t, 3);
    const [a, b, c] = clients;
    a.s.emit('state', { pos: junto(veic(plan, 0), 20), rotY: 0 });
    c.s.emit('state', { pos: junto(veic(plan, 0), 25), rotY: 0 });
    await sleep(150);
    const hp = collect(b.s, 'vehicleHp');
    for (let i = 0; i < 12; i++) a.s.emit('shotHit', { targetId: c.init.id, dmg: 5, weapon: 'FUZIL' });
    a.s.emit('vehicleHit', { v: 0, dmg: 26, weapon: 'FUZIL' });
    await sleep(300);
    assert.equal(hp.length, 0);
    assert.equal(await vidaNoServidor(t, srv, 0), 780);
  });

  it('dado quem está dentro atirando no próprio veículo, então nada muda', async t => {
    const { srv, clients, plan } = await cena(t);
    const [a, b] = clients;
    const buggy = veic(plan, 0);
    assert.equal((await ack(a.s, 'enterCar', { idx: 0 })).ok, true);
    a.s.emit('state', { pos: buggy.pos, rotY: 0, car: 0 });
    await sleep(150);
    const hp = collect(b.s, 'vehicleHp');
    a.s.emit('vehicleHit', { v: 0, dmg: 26, weapon: 'FUZIL' });
    a.s.emit('vehicleBlast', { v: 0, dmg: 130, kind: 'GRANADA', impactPos: buggy.pos });
    await sleep(300);
    assert.equal(hp.length, 0);
    assert.equal(await vidaNoServidor(t, srv, 0), 780);
  });

  it('dado uma origem declarada longe do atirador, então o acerto é recusado', async t => {
    const { srv, clients, plan } = await cena(t);
    const [a, b] = clients;
    const buggy = veic(plan, 0);
    a.s.emit('state', { pos: junto(buggy, 20), rotY: 0 });
    await sleep(150);
    const hp = collect(b.s, 'vehicleHp');
    a.s.emit('vehicleHit', { v: 0, dmg: 26, weapon: 'FUZIL', fromPos: junto(buggy, 2) });
    await sleep(300);
    assert.equal(hp.length, 0);
    assert.equal(await vidaNoServidor(t, srv, 0), 780);
  });

  it('dado um explosivo longe do veículo ou de tipo desconhecido, então nada muda', async t => {
    const { srv, clients, plan } = await cena(t);
    const [a, b] = clients;
    const buggy = veic(plan, 0);
    a.s.emit('state', { pos: junto(buggy, 20), rotY: 0 });
    await sleep(150);
    const hp = collect(b.s, 'vehicleHp'), queima = collect(b.s, 'vehicleBurning');
    a.s.emit('vehicleBlast', { v: 0, dmg: 130, kind: 'BAZUCA', impactPos: junto(buggy, 40) });
    a.s.emit('vehicleBlast', { v: 0, dmg: 130, kind: 'MISSIL', impactPos: junto(buggy, 1) });
    await sleep(300);
    assert.equal(hp.length + queima.length, 0);
    assert.equal(await vidaNoServidor(t, srv, 0), 780);
  });

  it('dado vários explosivos no mesmo segundo, então o dano em veículo por atirador tem teto', async t => {
    const { srv, clients, plan } = await cena(t);
    const [a, b] = clients;
    const cam = plan.veiculos.find(v => v.tipo === 'caminhao');
    assert.ok(cam, 'semente sem caminhão');
    a.s.emit('state', { pos: junto(cam, 20), rotY: 0 });
    await sleep(150);
    const hp = collect(b.s, 'vehicleHp'), queima = collect(b.s, 'vehicleBurning');
    for (let i = 0; i < 3; i++) a.s.emit('vehicleBlast', { v: cam.v, dmg: 130, kind: 'BAZUCA', impactPos: junto(cam, 1) });
    await sleep(300);
    assert.equal(queima.length, 0);
    assert.deepEqual(hp.map(h => h.vida), [1760 - 975]);
    assert.equal(await vidaNoServidor(t, srv, cam.v), 1760 - 975);
  });

  it('dado um jogador que não é o motorista declarando estar no veículo, então a posição do veículo não muda', async t => {
    const { srv, clients, plan } = await cena(t, 3);
    const [a, b, c] = clients;
    const buggy = veic(plan, 0);
    c.s.emit('state', { pos: junto(buggy, 300), rotY: 0, car: 0 }); // sem enterCar
    a.s.emit('state', { pos: junto(buggy, 380), rotY: 0 });          // perto de C, longe da vaga
    await sleep(200);
    const hp = collect(b.s, 'vehicleHp');
    a.s.emit('vehicleHit', { v: 0, dmg: 88, weapon: 'ESCOPETA' });
    await sleep(300);
    assert.equal(hp.length, 0);
    assert.equal(await vidaNoServidor(t, srv, 0), 780);
  });

  it('dado um jogador morto, então o acerto em veículo é ignorado', async t => {
    const { srv, clients, plan } = await cena(t, 3);
    const [a, b] = clients;
    a.s.emit('state', { pos: junto(veic(plan, 0), 20), rotY: 0 });
    await sleep(150);
    await ack(a.s, 'died', { cause: { type: 'environment' } });
    const hp = collect(b.s, 'vehicleHp');
    a.s.emit('vehicleHit', { v: 0, dmg: 26, weapon: 'FUZIL' });
    await sleep(300);
    assert.equal(hp.length, 0);
    assert.equal(await vidaNoServidor(t, srv, 0), 780);
  });
});
