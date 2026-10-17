/* ================================================================
   DIAGNÓSTICO DE REDE NO LOG DO SERVIDOR.
   Em 2026-10-17 um jogador caiu 82 s depois do começo da partida e o
   log só dizia "[-] <id> (1 online)": sem o motivo, não dava para saber
   se a aba CRASHOU (transport close, na hora) ou TRAVOU (ping timeout,
   20–45 s depois do travamento), nem se o cliente passava segundos sem
   mandar `state` antes. Estes testes fixam o que o log tem de contar:
   1. o motivo de cada desconexão (e o nick, e o tempo de partida);
   2. o buraco de `state` de quem está vivo na partida (> 1,5 s);
   3. o resumo de quadros que o cliente manda (`diag`) — saneado (uma
      linha só, sem controle, com teto de tamanho) e limitado no tempo.
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

/* PORT=0 (porta efêmera anunciada no log). O log INTEIRO fica guardado:
   é ele o produto destes testes. */
function spawnServer(env = {}) {
  const rankFile = path.join(os.tmpdir(), `fps-diag-rank-${process.pid}-${nServidor++}-${Date.now()}.json`);
  const proc = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env, PORT: '0', HOST_CODE: 'QA123', COUNTDOWN_S: '1', NEXT_IN_S: '60',
      RANK_FILE: rankFile, ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const srv = { proc, log: '' };
  proc.stdout.on('data', d => { srv.log += d; });
  let stderrFim = '';
  proc.stderr.on('data', d => { stderrFim = (stderrFim + d).slice(-1500); });
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
      if (m) { clearInterval(olha); clearTimeout(to); srv.port = Number(m[1]); res(srv); }
    }, 20);
    proc.on('exit', c => { clearInterval(olha); rej(new Error('servidor morreu cedo, código ' + c + '\n' + stderrFim)); });
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
async function ate(cond, ms = 3000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (cond()) return true; await sleep(25); }
  return cond();
}

async function partida(t, nicks, env) {
  const srv = await spawnServer(env);
  t.after(() => srv.stop());
  const clients = [];
  for (const nick of nicks) {
    const c = await connect(srv.port);
    c.s.emit('hello', { nick });
    clients.push(c);
    t.after(() => c.s.close());
  }
  const started = clients.map(c => once(c.s, 'matchStart'));
  await ack(clients[0].s, 'claimHost', { code: 'QA123' });
  clients[0].s.emit('requestStart');
  const ms = await Promise.all(started);
  return { srv, clients, plan: ms[0].plan };
}
const linhas = (log, tag) => log.split('\n').filter(l => l.startsWith(tag));

describe('Diagnóstico — motivo da desconexão no log', () => {
  it('quem fecha a aba: o log diz o motivo e o nick', async t => {
    const srv = await spawnServer();
    t.after(() => srv.stop());
    const { s } = await connect(srv.port);
    s.emit('hello', { nick: 'Fulano' });
    await sleep(100);
    /* a aba que morre derruba o TCP sem o pacote de despedida do socket.io —
       é o `transport close` do servidor. Fechar o engine imita isso. */
    s.io.engine.close();
    assert.ok(await ate(() => /\[-\] .*Fulano.*motivo=transport close/.test(srv.log)),
      'esperava "[-] ... Fulano ... motivo=transport close" no log; veio:\n' + linhas(srv.log, '[-]').join('\n'));
  });

  it('em partida: o log diz há quanto tempo a partida corria', async t => {
    const { srv, clients } = await partida(t, ['Anfitriao', 'Visita']);
    await sleep(300);
    clients[1].s.disconnect();
    assert.ok(await ate(() => /\[-\] .*Visita.*motivo=client namespace disconnect.*partida \d+ t=\d+s/.test(srv.log)),
      'esperava motivo e "partida N t=Xs" no log; veio:\n' + linhas(srv.log, '[-]').join('\n'));
  });

  /* o caso do dia: a aba morre em partida. A vaga fica guardada (janela de
     reconexão), e o log tem de contar a queda NA HORA — com o motivo e o
     tempo de partida — e depois que desistiu de esperar, de novo com ele. */
  it('em partida, a aba que morre: "caiu (motivo)" na hora e "não voltou" no fim da janela', async t => {
    const { srv, clients } = await partida(t, ['Anfitriao', 'Visita'], { RECONEXAO_S: '1' });
    await sleep(300);
    clients[1].s.io.engine.close();
    assert.ok(await ate(() => /\[~\] .*Visita caiu \(transport close\).*partida \d+ t=\d+s/.test(srv.log)),
      'esperava "[~] ... Visita caiu (transport close) ... partida N t=Xs"; veio:\n' + linhas(srv.log, '[~]').join('\n'));
    assert.ok(await ate(() => /\[-\] .*Visita.*motivo=não voltou em 1s \(transport close\).*partida \d+ t=\d+s/.test(srv.log)),
      'esperava "[-] ... Visita ... motivo=não voltou em 1s (transport close)"; veio:\n' + linhas(srv.log, '[-]').join('\n'));
  });
});

describe('Diagnóstico — buraco de pacote de quem joga', () => {
  it('vivo na partida, 1,6 s sem `state`: o log registra o buraco com o nick', async t => {
    const { srv, clients } = await partida(t, ['Anfitriao', 'Travado']);
    const s = clients[1].s;
    s.emit('state', { pos: [0, 250, 0], rotY: 0, ship: true });
    await sleep(1600);
    s.emit('state', { pos: [0, 250, 0], rotY: 0, ship: true });
    assert.ok(await ate(() => /\[NET\] Travado: 1[.,]\d s sem state/.test(srv.log)),
      'esperava "[NET] Travado: 1.6 s sem state"; veio:\n' + linhas(srv.log, '[NET]').join('\n'));
  });

  it('pacotes a 10 Hz: nenhum buraco registrado', async t => {
    const { srv, clients } = await partida(t, ['Anfitriao', 'Liso']);
    for (let i = 0; i < 12; i++) {
      clients[1].s.emit('state', { pos: [0, 250, 0], rotY: 0, ship: true });
      await sleep(100);
    }
    await sleep(200);
    assert.deepEqual(linhas(srv.log, '[NET]'), []);
  });
});

describe('Diagnóstico — resumo de quadros do cliente (`diag`)', () => {
  it('chega ao log numa linha só, com números e a GPU', async t => {
    const { srv, clients } = await partida(t, ['Anfitriao', 'Windows']);
    clients[1].s.emit('diag', {
      fps: 58.4, pior: 1234.5, q100: 7, q500: 2, heap: 412.3, rtt: 141,
      ctxLost: 0, gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)', cores: 4, mem: 8,
      prog: 41, tex: 120, geo: 300,
    });
    assert.ok(await ate(() => linhas(srv.log, '[DIAG]').length === 1), 'sem linha [DIAG]');
    const l = linhas(srv.log, '[DIAG]')[0];
    for (const pedaco of ['Windows', 'fps=58', 'pior=1235ms', '>100ms=7', '>500ms=2', 'heap=412MB', 'rtt=141ms',
      'gpu="ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)"', 'cores=4', 'mem=8',
      // shaders compilados e memória de GPU: travada por recompilação e vazamento se veem daqui
      'prog=41', 'tex=120', 'geo=300'])
      assert.ok(l.includes(pedaco), `faltou "${pedaco}" em: ${l}`);
  });

  it('texto do cliente não quebra linha, não leva controle e tem teto', async t => {
    const { srv, clients } = await partida(t, ['Anfitriao', 'Malicioso']);
    clients[1].s.emit('diag', {
      fps: 1e9, pior: -5, q100: 'x', heap: NaN,
      gpu: 'A\n[CHEAT] forjado\r\x1b[31m' + 'B'.repeat(500),
      err: 'erro\nlinha2',
    });
    assert.ok(await ate(() => linhas(srv.log, '[DIAG]').length === 1), 'sem linha [DIAG]');
    assert.equal(linhas(srv.log, '[CHEAT]').length, 0, 'texto do cliente virou linha própria no log');
    const l = linhas(srv.log, '[DIAG]')[0];
    // eslint-disable-next-line no-control-regex -- procurar controle é o objetivo
    assert.ok(!/[\x00-\x1f]/.test(l), 'caractere de controle no log: ' + JSON.stringify(l));
    assert.ok(l.length < 400, `linha com ${l.length} caracteres`);
    assert.ok(!l.includes('fps=1000000000'), 'número sem teto: ' + l);
  });

  it('mais de um `diag` em 4 s: só o primeiro entra no log', async t => {
    const { srv, clients } = await partida(t, ['Anfitriao', 'Inundador']);
    for (let i = 0; i < 20; i++) clients[1].s.emit('diag', { fps: 60, pior: 16 });
    await sleep(500);
    assert.equal(linhas(srv.log, '[DIAG]').length, 1);
  });
});

/* CAIXA-PRETA: a aba que MORRE (crash do Chrome, falta de memória, GPU) não
   avisa ninguém — não há despedida. O cliente grava um resumo no próprio
   navegador durante o jogo e apaga ao sair direito; se o resumo sobrou, a
   aba anterior morreu, e a próxima abertura do jogo conta ao servidor. Sem
   depender de o jogador mandar print de nada. */
describe('Diagnóstico — caixa-preta da aba que morreu', () => {
  const REG = {
    idade: 12.4, partida: 3, t: 82.2, fase: 'PLAY', oculta: false, heap: 812.6, pior: 2400.2, q500: 3,
    prog: 57, tex: 140, geo: 512, ctxLost: 1, gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)',
  };
  it('chega ao log como [CRASH], com o nick, o momento e a máquina', async t => {
    const srv = await spawnServer();
    t.after(() => srv.stop());
    const { s } = await connect(srv.port);
    t.after(() => s.close());
    s.emit('hello', { nick: 'Amigo' });
    await sleep(100);
    s.emit('caixaPreta', REG);
    assert.ok(await ate(() => linhas(srv.log, '[CRASH]').length === 1), 'sem linha [CRASH]; log:\n' + srv.log.slice(-600));
    const l = linhas(srv.log, '[CRASH]')[0];
    for (const pedaco of ['Amigo', 'há 12s', 'partida 3 t=82s', 'fase=PLAY', 'visível', 'heap=813MB', 'pior=2400ms',
      '>500ms=3', 'prog=57', 'tex=140', 'geo=512', 'ctxLost=1', 'gpu="ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)"'])
      assert.ok(l.includes(pedaco), `faltou "${pedaco}" em: ${l}`);
  });

  it('aba que estava OCULTA quando morreu diz isso (o celular mata aba em segundo plano)', async t => {
    const srv = await spawnServer();
    t.after(() => srv.stop());
    const { s } = await connect(srv.port);
    t.after(() => s.close());
    s.emit('hello', { nick: 'Celular' });
    await sleep(100);
    s.emit('caixaPreta', { ...REG, oculta: true });
    assert.ok(await ate(() => linhas(srv.log, '[CRASH]').length === 1), 'sem linha [CRASH]');
    assert.ok(linhas(srv.log, '[CRASH]')[0].includes('oculta'), linhas(srv.log, '[CRASH]')[0]);
  });

  it('uma por conexão, saneada: texto forjado não vira linha nem leva controle', async t => {
    const srv = await spawnServer();
    t.after(() => srv.stop());
    const { s } = await connect(srv.port);
    t.after(() => s.close());
    s.emit('hello', { nick: 'Forjador' });
    await sleep(100);
    s.emit('caixaPreta', { ...REG, fase: 'PLAY\n[CHEAT] x', gpu: 'A\n[-] forjado\x1b' + 'B'.repeat(500), heap: 1e12 });
    for (let i = 0; i < 10; i++) s.emit('caixaPreta', REG);
    await sleep(500);
    assert.equal(linhas(srv.log, '[CRASH]').length, 1, 'mais de uma [CRASH] na mesma conexão');
    assert.equal(linhas(srv.log, '[CHEAT]').length, 0);
    assert.ok(!linhas(srv.log, '[-]').some(l => l.includes('forjado')), 'texto do cliente virou linha própria');
    const l = linhas(srv.log, '[CRASH]')[0];
    // eslint-disable-next-line no-control-regex -- procurar controle é o objetivo
    assert.ok(!/[\x00-\x1f]/.test(l), 'controle no log: ' + JSON.stringify(l));
    assert.ok(l.length < 400, `linha com ${l.length} caracteres`);
    assert.ok(/fase=\?/.test(l), 'fase fora da lista devia virar "?": ' + l);
  });
});
