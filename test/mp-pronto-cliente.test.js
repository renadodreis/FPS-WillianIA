/* ================================================================
   O CELULAR QUE AINDA CARREGA QUANDO A PARTIDA COMEÇA — auditoria do
   multiplayer 338d153, MP-1, pelo caminho REAL do navegador.

   O socket conecta no começo do módulo do jogo; o ouvinte do `matchStart`
   só existe depois do boot do BR (br-game.js). Aqui o `br-game.js` do
   segundo jogador fica PRESO (o 4G lento) até a partida começar, e só
   então é solto: o `matchStart` chega antes do ouvinte e some. Antes, o
   servidor o punha VIVO na nave e a tela dele mostrava o lobby
   "AGUARDANDO O ANFITRIÃO..." — fantasma até o backstop de inatividade.

   Página crua (sem os ganchos do harness: o reload é o de verdade). Âncora:
   o roster do SERVIDOR (lido por um socket observador) e a fase da tela.

   Porta 4177.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const { CHROME, bootGame } = require('./helpers/harness.js');

const PORT = 4177;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const evento = (s, ev, filtro = () => true, ms = 20000) => new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('sem ' + ev)), ms);
  const f = d => { if (filtro(d)) { clearTimeout(to); s.off(ev, f); res(d); } };
  s.on(ev, f);
});

describe('quem carrega quando a partida começa vira espectador, não fantasma', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, dono;
  before(async () => {
    h = await bootGame({ port: PORT, autoStart: false, extraEnv: { HOST_CODE: 'QA123', COUNTDOWN_S: '1' } });
  });
  after(async () => { if (dono) dono.close(); if (h) await h.close(); });

  it('br-game.js preso até o matchStart: o servidor não o conta vivo, e a tela dele cai na partida como espectador', async t => {
    // o anfitrião: um socket que se apresenta e segura o posto
    dono = io(`http://localhost:${PORT}`, { transports: ['websocket'] });
    const ini = await evento(dono, 'init');
    dono.emit('hello', { nick: 'Dono' });
    await new Promise((res, rej) => dono.timeout(4000).emit('claimHost', { code: 'QA123' }, (e, d) => (e || !d || !d.ok ? rej(new Error('claimHost')) : res())));
    const pulso = setInterval(() => dono.emit('state', { pos: [(ini.spawn && ini.spawn.x) || 60, 2, (ini.spawn && ini.spawn.z) || 60], rotY: 0 }), 2000);

    /* a página do harness também é jogadora (online): espera ela estar pronta,
       para o único "carregando" da sala ser o segundo jogador */
    let prontos = 0;
    for (let i = 0; i < 100 && prontos < 2; i++) {
      const r0 = await new Promise(res => { dono.once('roster', res); dono.emit('hello', { nick: 'Dono' }); });
      prontos = r0.players.filter(p => !p.carregando).length;
      if (prontos < 2 || r0.players.some(p => p.carregando)) { prontos = Math.min(prontos, 1); await sleep(300); }
    }
    assert.ok(prontos >= 2, 'cenário: a página do harness não ficou pronta');

    const page = await h.browser.newPage();
    try {
      // o celular lento: o br-game.js fica preso
      const presos = [];
      await page.setRequestInterception(true);
      page.on('request', req => (/\/br-game\.js/.test(req.url()) ? presos.push(req) : req.continue()));
      page.goto(`http://localhost:${PORT}/?tier=baixo`, { timeout: 120000 }).catch(() => {});
      // o socket dele conectou (aparece no servidor, ainda sem hello)
      let carregando = null;
      for (let i = 0; i < 200 && !carregando; i++) {
        const r = await new Promise(res => { dono.once('roster', res); dono.emit('hello', { nick: 'Dono' }); });
        carregando = r.players.find(p => p.carregando && p.id !== dono.id) || null;
        if (!carregando) await sleep(300);
      }
      assert.ok(carregando, 'cenário: o socket do segundo jogador não apareceu na sala');
      // o anfitrião começa com ele ainda carregando
      const naPartida = evento(dono, 'roster', d => d.phase === 'PLAYING');
      dono.emit('requestStart');
      const r = await naPartida;
      const ele = r.players.find(p => p.id === carregando.id);
      t.diagnostic(`no início: vivos ${r.aliveCount}; ele ${JSON.stringify(ele)}`);
      // solta o br-game.js: ele termina de carregar DEPOIS do matchStart
      page.removeAllListeners('request');
      page.on('request', req => req.continue());
      for (const req of presos.splice(0)) await req.continue().catch(() => {});
      // a tela dele: espectador da partida em andamento (pode recarregar no caminho)
      let fim = null;
      for (let i = 0; i < 120; i++) {
        await sleep(1000);
        fim = await page.evaluate(() => ({
          fase: window.__BR_debug && window.__BR_debug.S && window.__BR_debug.S.phase,
          botao: (document.getElementById('brStartBtn') || {}).textContent || '',
        })).catch(() => null);
        if (fim && fim.fase === 'SPECT') break;
      }
      const servidor = await new Promise(res => { dono.once('roster', res); dono.emit('hello', { nick: 'Dono' }); });
      t.diagnostic(`a tela dele: ${JSON.stringify(fim)}; servidor: vivos ${servidor.aliveCount}`);
      assert.equal(ele.alive, false, 'o servidor pôs VIVO na nave quem ainda carregava (fantasma)');
      assert.equal(r.aliveCount, 2, `vivos no início (o anfitrião e a página do harness): ${r.aliveCount}`);
      assert.equal(fim && fim.fase, 'SPECT', `a tela dele não entrou na partida (fase ${fim && fim.fase}, botão "${fim && fim.botao}")`);
      assert.ok(servidor.players.every(p => p.id !== carregando.id || !p.alive), 'ele virou vivo depois');
    } finally {
      clearInterval(pulso);
      await page.close();
    }
  });
});
