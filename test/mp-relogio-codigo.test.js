/* ================================================================
   RELÓGIO DE QUEM ENTRA NO MEIO E O ESFRIAMENTO DO CÓDIGO — auditoria do
   multiplayer 338d153, MP-6 e MP-7 (baixas).

   MP-6: o relógio da partida (`S.clockOffset`) nascia no boot do lobby com o
   `serverNow` de um `init` recebido ANTES de gerar o mundo; quem entra no
   meio não recebe `matchStart` e via a partida atrasada pelo tempo de
   carregar (−2 168 ms medido; no celular lento, 4–6,6 s): nave, zona, clima
   e a cinemática da cidade fora do lugar. Agora o `pingx` responde a hora
   do servidor e o cliente acerta o relógio (algoritmo de Cristian).
   Régua independente: servidor, navegador e teste rodam na MESMA máquina —
   o relógio dela é a hora do servidor.

   MP-7: 5 erros esfriam o IP, e durante o esfriamento o servidor respondia
   ao código CERTO igual ao errado; o cliente dizia "✖ código errado" e
   APAGAVA o código salvo (a re-reivindicação da rodada seguinte deixava a
   sala sem anfitrião). A política (5 por IP) é decisão do dono e não muda:
   muda o que se diz e o que se apaga.

   Porta 4179 (navegador) e PORT=0 (servidor puro).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');
const { CHROME, bootGame } = require('./helpers/harness.js');

const PORT = 4179;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ack = (s, ev, d) => new Promise(res => s.timeout(4000).emit(ev, d, (e, r) => res(e ? { erro: String(e) } : r)));

function subir(env = {}) {
  const rank = path.join(os.tmpdir(), `fps-codigo-rank-${process.pid}-${Date.now()}.json`);
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: '0', HOST_CODE: 'QA123', RANK_FILE: rank, NODE_ENV: 'test', ...env },
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

describe('MP-7: o esfriamento do código diz que é espera', () => {
  let srv;
  before(async () => { srv = await subir({ CLAIM_COOLDOWN_MS: '1500' }); });
  after(() => { if (srv) { srv.proc.kill(); fs.rmSync(srv.rank, { force: true }); } });

  it('5 erros na rede: o código CERTO recebe "esfriando" com o tempo que falta; passado o prazo, entra', async t => {
    const s = io(`http://127.0.0.1:${srv.porta}`, { transports: ['websocket'], forceNew: true });
    await new Promise(r => s.once('init', r));
    for (let i = 0; i < 5; i++) assert.equal((await ack(s, 'claimHost', { code: 'ERRADO' + i })).ok, false);
    const certo = await ack(s, 'claimHost', { code: 'QA123' });
    t.diagnostic(`no esfriamento: ${JSON.stringify(certo)}`);
    assert.equal(certo.ok, false, 'cenário: o esfriamento não segurou');
    assert.equal(certo.esfriando, true, 'a recusa do esfriamento é igual à do código errado');
    assert.ok(certo.faltam >= 1 && certo.faltam <= 2, `faltam ${certo.faltam} s (prazo de 1,5 s)`);
    await sleep(1700);
    assert.equal((await ack(s, 'claimHost', { code: 'QA123' })).ok, true, 'passado o prazo o código certo não entrou');
    s.close();
  });
});

describe('MP-6 e MP-7 no navegador', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    // o br-game.js chega 6 s depois do init: o boot do lobby acontece tarde
    h = await bootGame({ port: PORT, autoStart: false, delayRequests: [{ fragment: '/br-game.js', ms: 6000 }] });
    await h.page.waitForFunction('window.__BR_debug && window.__BR_debug.S && typeof window.__BR_debug.S.now === "function"', { timeout: 90000 });
  });
  after(async () => { if (h) await h.close(); });

  it('MP-6: com o boot 6 s depois do init, o relógio da partida acompanha a hora do servidor', async t => {
    await sleep(1500);
    const r = await h.play(() => ({ erro: window.__BR_debug.S.now() - Date.now(), offset: window.__BR_debug.S.clockOffset }));
    t.diagnostic(`relógio da partida − hora do servidor: ${r.erro.toFixed(0)} ms (offset ${r.offset.toFixed(0)} ms)`);
    assert.ok(Math.abs(r.erro) < 250, `o relógio da partida está ${r.erro.toFixed(0)} ms fora da hora do servidor`);
  });

  it('MP-7: no esfriamento o lobby diz "tente de novo" e o código salvo FICA', async t => {
    /* 5 erros na rede (o limite é por IP: o caso medido foi outro aparelho da
       casa; aqui saem do próprio socket da página, para o IP ser o mesmo
       sem depender de como "localhost" resolve no Node e no Chrome) */
    const recusas = await h.play(async () => {
      const s = window.__MP.socket, out = [];
      for (let i = 0; i < 5; i++) out.push(await new Promise(r => s.timeout(4000).emit('claimHost', { code: 'ERRADO' + i }, (e, d) => r(d && d.ok))));
      return out;
    });
    assert.deepEqual(recusas, [false, false, false, false, false], 'cenário: os erros não foram recusados');
    // o dono, com o código salvo, toca OK com o código certo
    await h.play(() => {
      try { localStorage.setItem('br_hostcode', 'QUEDALIVRE'); } catch (e) { /* */ }
      window.__MP_lobby && window.__MP_lobby.show && window.__MP_lobby.show();
    });
    await sleep(300);
    const antes = await h.play(() => !!document.getElementById('brHostBtn'));
    assert.ok(antes, 'cenário: o lobby não está montado');
    await h.play(() => {
      document.getElementById('brHostCode').value = 'QUEDALIVRE';
      document.getElementById('brHostBtn').click();
    });
    await sleep(800);
    const r = await h.play(() => {
      let salvo = null;
      try { salvo = localStorage.getItem('br_hostcode'); } catch (e) { /* */ }
      return { msg: document.getElementById('brHostMsg').textContent, salvo };
    });
    t.diagnostic(JSON.stringify(r));
    assert.doesNotMatch(r.msg, /código errado/, 'o código certo, no esfriamento, virou "código errado"');
    assert.match(r.msg, /tente de novo em \d+s/, `a mensagem não diz que é espera: "${r.msg}"`);
    assert.equal(r.salvo, 'QUEDALIVRE', 'o esfriamento apagou o código salvo');
  });
});
