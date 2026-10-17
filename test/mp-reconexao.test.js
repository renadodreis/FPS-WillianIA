/* ================================================================
   QUEDA DE CONEXÃO NO MEIO DA PARTIDA NÃO ELIMINA — auditoria do
   multiplayer 338d153, MP-2 (alta).

   No `disconnect` o servidor apagava o jogador na hora (sem colocação, sem
   killfeed); o cliente reconectava, recebia um `init` em PLAYING, recarregava
   e voltava ESPECTADOR. Um soluço de rede (troca Wi-Fi → 4G: conexão nova em
   1,1 s, medido) tirava o jogador da partida. O gênero guarda o personagem e
   deixa voltar (Apex, PUBG desde 2017, Warzone 4 min).

   Agora: a conexão que cai SEM o jogador pedir (transporte fechou, ping
   expirou) é guardada por uma janela; o socket.io devolve a MESMA identidade
   (connection state recovery) e os eventos perdidos. Sair por escolha
   (`disconnect()` do cliente) e expulsão seguem imediatos.

   Socket puro contra o servidor real, PORT=0.
   ================================================================ */
'use strict';
const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');
const ShipProto = require(path.join(__dirname, '..', 'ship-protocol.js'));

const SERVER = path.join(__dirname, '..', 'server.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function subir(env = {}) {
  const rank = path.join(os.tmpdir(), `fps-reconexao-rank-${process.pid}-${Date.now()}.json`);
  const proc = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: '0', HOST_CODE: 'QA123', COUNTDOWN_S: '1', NEXT_IN_S: '60', GAS_DEFAULT: 'off', RANK_FILE: rank, NODE_ENV: 'test', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let erro = '';
  proc.stderr.on('data', d => { erro = (erro + d).slice(-1500); });
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('servidor não subiu\n' + erro)), 20000);
    proc.stdout.on('data', d => {
      const m = /Servidor BR no ar em http:\/\/localhost:(\d+)/.exec(String(d));
      if (m) { clearTimeout(to); res({ porta: +m[1], proc, rank }); }
    });
    proc.on('exit', c => rej(new Error('servidor morreu cedo, código ' + c + '\n' + erro)));
  });
}
const conectar = (porta, opts = {}) => new Promise((res, rej) => {
  const s = io(`http://127.0.0.1:${porta}`, { transports: ['websocket'], forceNew: true, reconnectionDelay: 200, reconnectionDelayMax: 400, ...opts });
  const to = setTimeout(() => rej(new Error('sem init')), 8000);
  s.once('init', d => { clearTimeout(to); s.initData = d; res(s); });
});
const esperar = (s, ev, filtro = () => true, ms = 8000) => new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('sem ' + ev)), ms);
  const f = d => { if (filtro(d)) { clearTimeout(to); s.off(ev, f); res(d); } };
  s.on(ev, f);
});

describe('queda de conexão em partida: o personagem fica e o jogador volta', () => {
  const servidores = [], abertos = [];
  after(() => {
    for (const s of abertos) s.close();
    for (const srv of servidores) { srv.proc.kill(); fs.rmSync(srv.rank, { force: true }); }
  });

  /* dois jogadores numa partida em andamento; B manda estado como quem joga */
  async function emPartida(env, optsB) {
    const srv = await subir(env); servidores.push(srv);
    const a = await conectar(srv.porta); abertos.push(a);
    const b = await conectar(srv.porta, optsB); abertos.push(b);
    a.emit('hello', { nick: 'Dono' }); b.emit('hello', { nick: 'Celular' });
    await new Promise(res => a.emit('claimHost', { code: 'QA123' }, res));
    await sleep(200);
    const comecou = esperar(a, 'roster', d => d.phase === 'PLAYING', 10000);
    const plano = esperar(b, 'matchStart', () => true, 10000);
    a.emit('requestStart');
    const r = await comecou;
    const ms = await plano;
    assert.equal(r.aliveCount, 2, 'cenário: os dois não entraram vivos');
    // o lugar dele na cabine (a regra do servidor)
    const sl = ShipProto.slotLocal(ms.plan.shipSlots[b.initData.id]);
    const cabine = [sl[0], ShipProto.DIMS.floorY, sl[1]];
    return { srv, a, b, idB: b.initData.id, cabine };
  }

  it('o transporte cai e volta em 1 s: MESMA identidade, nada de playerLeft, vivo, e a posição dele volta a chegar', async t => {
    const { a, b, idB, cabine } = await emPartida();
    const saiu = [];
    a.on('playerLeft', d => saiu.push(d && d.id));
    const voltou = new Promise(res => b.once('connect', res));
    b.io.engine.close();   // o túnel, a troca de rede: o transporte morre sem o jogador pedir
    await voltou;
    await sleep(500);
    const posicao = esperar(a, 'playerUpdate', d => d && d.id === b.id, 5000);
    const pulso = setInterval(() => b.emit('state', { pos: [0, 250, 0], rotY: 0, ship: true, shipLocal: cabine }), 150);
    const chegou = await posicao.catch(() => null).finally(() => clearInterval(pulso));
    const r = await new Promise(res => { a.once('roster', res); a.emit('hello', { nick: 'Dono' }); });
    const ele = r.players.find(p => p.id === idB);
    t.diagnostic(`recuperou: ${b.recovered}, id ${b.id === idB ? 'o mesmo' : 'NOVO'}; playerLeft: ${saiu.length}; no roster: ${JSON.stringify(ele && { alive: ele.alive, spectator: ele.spectator })}; posição chegou: ${!!chegou}`);
    assert.equal(b.recovered, true, 'o socket.io não recuperou a sessão');
    assert.equal(b.id, idB, 'voltou com outra identidade');
    assert.deepEqual(saiu, [], 'os outros viram o jogador SAIR por um soluço de rede');
    assert.ok(ele && ele.alive, 'o jogador foi eliminado pela queda');
    assert.ok(chegou, 'depois de voltar, a posição dele não chega aos outros');
  });

  it('o avesso: quem SAI por escolha sai na hora', async () => {
    const { a, b, idB } = await emPartida();
    const saiu = esperar(a, 'playerLeft', d => d && d.id === idB, 3000);
    b.disconnect();
    await saiu;
    const r = await new Promise(res => { a.once('roster', res); a.emit('hello', { nick: 'Dono' }); });
    assert.equal(r.players.find(p => p.id === idB), undefined, 'quem saiu por escolha continuou na sala');
  });

  it('o avesso: quem não volta dentro da janela sai de vez', async t => {
    const { a, b, idB } = await emPartida({ RECONEXAO_S: '1' }, { reconnection: false });
    const t0 = Date.now();
    const saiu = esperar(a, 'playerLeft', d => d && d.id === idB, 6000);
    b.io.engine.close();
    await saiu;
    const dt = Date.now() - t0;
    t.diagnostic(`saiu de vez ${dt} ms depois da queda`);
    assert.ok(dt >= 800, `saiu antes da janela (${dt} ms)`);
  });
});
