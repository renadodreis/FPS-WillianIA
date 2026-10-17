/* ================================================================
   CAIXA-PRETA — a aba que MORRE conta ao servidor na abertura seguinte.
   Em 2026-10-17 a aba de um jogador travou e fechou sozinha no meio do
   PvP, e o log só sabia que o socket caiu. Crash do Chrome ("Aw, Snap"),
   falta de memória e pane de GPU não se despedem: não há evento, não há
   pacote. O cliente grava um resumo no navegador durante o jogo e o apaga
   ao sair direito (pagehide); se o resumo sobrou, a aba anterior morreu.

   O crash aqui é DE VERDADE (CDP `Page.crash` derruba o renderer, como o
   "Aw, Snap"), e a saída limpa é um recarregar (F5) — o falso positivo
   que mais aconteceria se o resumo não fosse apagado.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness');

const PORT = 3702;
const CHAVE = 'br_caixaPreta';
const sleep = ms => new Promise(r => setTimeout(r, ms));

describe('Caixa-preta — a aba que morre conta na volta', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, host, p2;
  before(async () => {
    h = await bootGame({ port: PORT, captureServerLog: true, extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '300' } });
    host = await startBRMatch(h, { serverPort: PORT, flags: { cidade: false } });
  });
  after(async () => {
    if (p2) await p2.close().catch(() => {});
    if (host) host.close();
    if (h) await h.close();
  });

  const crashes = () => h.serverLog().split('\n').filter(l => l.startsWith('[CRASH]'));
  /* o registro que a página guardou (a caixa-preta grava a cada 2 s) */
  async function registro(page, cond, ms = 10000) {
    const fim = Date.now() + ms;
    while (Date.now() < fim) {
      const r = await page.evaluate(k => {
        try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; }
      }, CHAVE).catch(() => null);
      if (r && cond(r)) return r;
      await sleep(250);
    }
    return null;
  }
  /* a página respondeu o hello (é na resposta que a caixa-preta é contada) */
  const helloRespondido = page => page.waitForFunction('window.__BR_aoHello === null', { timeout: 90000 });

  it('o renderer morre em partida: a próxima abertura conta [CRASH] com a fase e o tempo', async () => {
    const r = await registro(h.page, x => x.fase === 'PLAY' && x.t >= 1);
    assert.ok(r, 'pré-condição: a caixa-preta não gravou nada com a partida em PLAY');
    const url = h.page.url();
    assert.deepEqual(crashes(), [], 'pré-condição: [CRASH] antes do crash');

    h.page.on('error', () => {});                 // "Page crashed!" é o cenário, não falha
    const cdp = await h.page.target().createCDPSession();
    await cdp.send('Page.crash').catch(() => {});  // o renderer morre sem pagehide, como no "Aw, Snap"

    p2 = await h.browser.newPage();               // mesmo navegador = mesmo localStorage
    await p2.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await helloRespondido(p2);
    const fim = Date.now() + 10000;
    while (Date.now() < fim && !crashes().length) await sleep(200);
    assert.equal(crashes().length, 1, 'a abertura seguinte não contou o crash; log:\n' + h.serverLog().slice(-800));
    const l = crashes()[0];
    const m = /partida (\d+) t=(\d+)s fase=PLAY visível/.exec(l);
    assert.ok(m, 'a linha devia dizer a partida, o tempo e fase=PLAY visível: ' + l);
    assert.ok(+m[1] >= 1 && +m[2] >= 1, l);
    assert.match(l, /gpu="[^"]+"/, 'sem a GPU: ' + l);
    assert.match(l, /prog=[1-9]/, 'sem a contagem de shaders: ' + l);

    // contou uma vez: o registro saiu do navegador
    const sobrou = await p2.evaluate(k => localStorage.getItem(k), CHAVE);
    assert.ok(!sobrou || JSON.parse(sobrou).ts > r.ts, 'o registro do crash continuou lá para ser contado de novo');
  });

  it('recarregar a página (saída limpa) NÃO acusa crash', async () => {
    assert.ok(p2, 'o caso anterior não abriu a segunda página');
    const r = await registro(p2, () => true);
    assert.ok(r, 'pré-condição: a caixa-preta não gravou nada na página nova');
    const antes = crashes().length;
    await p2.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    await helloRespondido(p2);
    await sleep(1500);
    assert.equal(crashes().length, antes, 'F5 virou [CRASH]: ' + crashes().slice(antes).join('\n'));
  });
});
