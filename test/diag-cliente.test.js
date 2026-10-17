/* ================================================================
   DIAGNÓSTICO DO CLIENTE NO LOG DO SERVIDOR — o caminho inteiro:
   o laço de quadros do br-game.js mede, o socket leva, o server.js loga.
   Um quadro de 1,3 s (aba travada) tem de virar uma linha [DIAG] com
   pior ≥ 1,3 s logo depois, e a primeira linha leva a GPU e a máquina.
   O lado do servidor (saneamento, limite) está em diag-rede.test.js.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { bootGame } = require('./helpers/harness');

const PORT = 3694;
const sleep = ms => new Promise(r => setTimeout(r, ms));

describe('Diagnóstico — o cliente conta os engasgos ao servidor', () => {
  let h;
  before(async () => { h = await bootGame({ port: PORT, captureServerLog: true }); });
  after(async () => { if (h) await h.close(); });

  it('um quadro de 1,3 s vira linha [DIAG] com pior ≥ 1300 ms e a GPU', async () => {
    // espera passar a trava de 5 s do cliente desde um eventual resumo do boot
    await sleep(5500);
    await h.play(() => new Promise(res => requestAnimationFrame(() => {
      const t = performance.now();
      while (performance.now() - t < 1300) { /* aba travada */ }
      res();
    })));
    const fim = Date.now() + 15000;
    let linha = null;
    while (Date.now() < fim && !linha) {
      linha = h.serverLog().split('\n').find(l => {
        const m = /^\[DIAG\] .* pior=(\d+)ms/.exec(l);
        return m && +m[1] >= 1300;
      });
      if (!linha) await sleep(200);
    }
    assert.ok(linha, 'sem linha [DIAG] com pior ≥ 1300 ms; log:\n' +
      h.serverLog().split('\n').filter(l => l.startsWith('[DIAG]')).join('\n'));
    assert.match(linha, />500ms=[1-9]/);
    const primeira = h.serverLog().split('\n').find(l => l.startsWith('[DIAG]'));
    assert.match(primeira, /gpu="[^"]+"/, 'a 1ª linha devia trazer a GPU: ' + primeira);
    assert.match(primeira, /cores=[1-9]/);
  });
});
