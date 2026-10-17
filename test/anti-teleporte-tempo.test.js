/* ================================================================
   ANTI-TELEPORTE PELO RELÓGIO, NÃO PELO PACOTE.
   O servidor recusava a posição impossível e, depois de 10 recusas
   SEGUIDAS, re-ancorava (aceitava) — pensado para o lag extremo
   legítimo a 10 Hz (~1 s). Contado em PACOTES, quem manda 100 pacotes
   por segundo re-ancorava um teleporte em 0,1 s. E o `state` não tinha
   teto: cada pacote é repassado para a sala inteira.
   Os dois viram tempo — o que também deixa o cliente honesto mandar a
   20 Hz sem mudar a regra para ninguém.
   ================================================================ */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');

const SERVER = path.join(__dirname, '..', 'server.js');
let nServidor = 0;
function spawnServer(env = {}) {
  const rankFile = path.join(os.tmpdir(), `fps-tele-rank-${process.pid}-${nServidor++}-${Date.now()}.json`);
  const proc = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: '0', HOST_CODE: 'QA123', COUNTDOWN_S: '1', NEXT_IN_S: '60', RANK_FILE: rankFile, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const srv = { proc, log: '' };
  proc.stdout.on('data', d => { srv.log += d; });
  let err = '';
  proc.stderr.on('data', d => { err = (err + d).slice(-1500); });
  srv.stop = () => new Promise(resolve => {
    const done = () => { fs.rmSync(rankFile, { force: true }); resolve(); };
    if (proc.exitCode !== null) return done();
    proc.once('exit', done);
    proc.kill();
  });
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('servidor não subiu')), 5000);
    const olha = setInterval(() => {
      const m = /Servidor BR no ar em http:\/\/localhost:(\d+)/.exec(srv.log);
      if (m) { clearInterval(olha); clearTimeout(to); srv.port = +m[1]; res(srv); }
    }, 20);
    proc.on('exit', c => { clearInterval(olha); rej(new Error('servidor morreu cedo, código ' + c + '\n' + err)); });
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

async function partida(t) {
  const srv = await spawnServer();
  t.after(() => srv.stop());
  const a = await connect(srv.port), b = await connect(srv.port);
  t.after(() => { a.s.close(); b.s.close(); });
  a.s.emit('hello', { nick: 'Anfitriao' });
  b.s.emit('hello', { nick: 'Jogador' });
  const started = [once(a.s, 'matchStart'), once(b.s, 'matchStart')];
  await ack(a.s, 'claimHost', { code: 'QA123' });
  a.s.emit('requestStart');
  await Promise.all(started);
  return { srv, a, b };
}

describe('Anti-teleporte — re-ancoragem pelo relógio', () => {
  it('teleporte em rajada de 100 pacotes/s não é aceito antes de 1 s de recusa', async t => {
    const { a, b } = await partida(t);
    const vistos = [];
    a.s.on('playerUpdate', d => { if (d.id === b.s.id) vistos.push({ t: Date.now(), x: d.pos[0] }); });
    b.s.emit('state', { pos: [0, 5, 0], rotY: 0 });
    await sleep(300);
    const t0 = Date.now();
    for (let i = 0; i < 40; i++) { b.s.emit('state', { pos: [500, 5, 500], rotY: 0 }); await sleep(10); }
    await sleep(300);
    const cedo = vistos.filter(v => v.x > 400 && v.t - t0 < 900);
    assert.equal(cedo.length, 0, `teleporte aceito ${cedo.length > 0 ? cedo[0].t - t0 : '?'} ms depois do 1º pacote`);
  });

  it('dessincronia legítima (mesma posição longe, a 10 Hz) re-ancora em ~1 s', async t => {
    const { a, b } = await partida(t);
    const vistos = [];
    a.s.on('playerUpdate', d => { if (d.id === b.s.id) vistos.push({ t: Date.now(), x: d.pos[0] }); });
    b.s.emit('state', { pos: [0, 5, 0], rotY: 0 });
    await sleep(300);
    const t0 = Date.now();
    for (let i = 0; i < 20; i++) { b.s.emit('state', { pos: [500, 5, 500], rotY: 0 }); await sleep(100); }
    await sleep(200);
    const aceito = vistos.find(v => v.x > 400);
    assert.ok(aceito, 'nunca re-ancorou');
    assert.ok(aceito.t - t0 >= 900 && aceito.t - t0 <= 1600, `re-ancorou ${aceito.t - t0} ms depois`);
  });

  it('honesto a 20 Hz a 40 m/s (carro), com a rede entregando em rajadas: nenhum [CHEAT]', async t => {
    const { srv, b } = await partida(t);
    let x = 0;
    for (let k = 0; k < 10; k++) {          // 10 rajadas de 1 s
      await sleep(1000);                    // rede parada: 20 pacotes represados...
      for (let i = 0; i < 20; i++) { x += 2; b.s.emit('state', { pos: [x, 5, 0], rotY: 0 }); } // ...chegam juntos
    }
    await sleep(300);
    assert.ok(!/\[CHEAT\]/.test(srv.log), srv.log.split('\n').filter(l => l.includes('[CHEAT]')).join('\n'));
  });
});

describe('`state` — teto de ritmo', () => {
  it('inundação de ~200 pacotes/s por 3 s: depois da rajada, a sala recebe ≤ 35/s', async t => {
    const { a, b } = await partida(t);
    const chegadas = [];
    a.s.on('playerUpdate', d => { if (d.id === b.s.id) chegadas.push(Date.now()); });
    b.s.emit('state', { pos: [0, 5, 0], rotY: 0 });
    await sleep(300);
    const t0 = Date.now();
    // espaçados (5 ms): colados, o volátil do repasse já descartaria a maioria
    let enviados = 0;
    while (Date.now() - t0 < 3000) { b.s.emit('state', { pos: [0, 5, 0], rotY: 0 }); enviados++; await sleep(5); }
    await sleep(300);
    const fim = chegadas.filter(c => c - t0 >= 1500 && c - t0 < 3000).length;
    assert.ok(enviados > 300, `só ${enviados} enviados: a inundação não aconteceu`);
    assert.ok(fim / 1.5 <= 35, `${(fim / 1.5).toFixed(0)} playerUpdate/s repassados com a rajada já gasta`);
  });

  it('honesto a 20 Hz: todo pacote é repassado', async t => {
    const { a, b } = await partida(t);
    let n = 0;
    a.s.on('playerUpdate', d => { if (d.id === b.s.id) n++; });
    for (let i = 0; i < 60; i++) { b.s.emit('state', { pos: [i * 0.3, 5, 0], rotY: 0 }); await sleep(50); }
    await sleep(300);
    assert.ok(n >= 58, `${n} de 60 repassados`);
  });
});
