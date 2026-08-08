/* ================================================================
   QA — RECONEXÃO NO LOBBY NÃO PODE PERDER O ANFITRIÃO.

   O commit que trocou o reload por "adotar o init novo" resolveu o
   problema certo (boot pesado derruba o transporte no menu e o reload
   jogava o jogador pro início do carregamento), mas deixou um buraco:
   o servidor LIBERA o posto de anfitrião no disconnect do socket
   antigo (server.js, handler de 'disconnect') e quem re-reivindica
   pelo código salvo é o BOOT — que não roda de novo no caminho de
   adoção. Resultado: a sala volta com `hostId === null`, o botão vira
   "SEM ANFITRIÃO" para todo mundo e ninguém consegue iniciar partida
   até alguém redigitar o código num campo `type=password` vazio.

   Cenário exatamente o desta suíte: máquina fraca no lobby.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

describe('Reconexão no lobby (Chrome headless)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  const PORT = 3238;
  before(async () => { h = await bootGame({ port: PORT, extraEnv: { COUNTDOWN_S: '60' } }); });
  after(async () => { if (h) await h.close(); });

  it('dado o anfitrião reconectando no lobby, então ele CONTINUA anfitrião', async t => {
    // vira anfitrião pelo fluxo real: digita o código no campo do lobby
    await h.page.waitForFunction('!!document.getElementById("brHostBtn")', { timeout: 60000 });
    await h.play(() => {
      document.getElementById('brHostCode').value = 'QUEDALIVRE';
      document.getElementById('brHostBtn').click();
    });
    const virouHostNoInicio = await h.page.waitForFunction(
      'window.__BR_debug && window.__MP.socket && window.__BR_debug.S.hostId === window.__MP.socket.id',
      { timeout: 15000, polling: 200 }).then(() => true).catch(() => false);
    assert.ok(virouHostNoInicio, 'cenário não montou: o clique no código não virou anfitrião — ' +
      JSON.stringify(await h.play(() => ({
        hostId: window.__BR_debug && window.__BR_debug.S.hostId,
        meuId: window.__MP.socket && window.__MP.socket.id,
        msg: (document.getElementById('brHostMsg') || {}).textContent,
        lobbyVisivel: (document.getElementById('brLobby') || {}).style.display,
      }))));
    const idAntes = await h.play(() => window.__MP.socket.id);

    // o transporte cai e volta — o servidor manda um `init` fresco
    await h.play(() => {
      window.__QA_reconnected = false;
      window.__MP.socket.once('init', () => { window.__QA_reconnected = true; });
      window.__MP.socket.disconnect();
      window.__MP.socket.connect();
    });
    await h.page.waitForFunction('window.__QA_reconnected === true', { timeout: 20000, polling: 100 });
    await h.page.waitForFunction(
      'window.__MP.socket.connected && window.__MP.socket.id !== ' + JSON.stringify(idAntes),
      { timeout: 20000, polling: 100 });

    // dá tempo do claim de volta chegar e do roster novo ser publicado
    const virouHost = await h.page.waitForFunction(
      'window.__BR_debug.S.hostId === window.__MP.socket.id',
      { timeout: 15000, polling: 200 }).then(() => true).catch(() => false);

    const estado = await h.play(() => ({
      hostId: window.__BR_debug.S.hostId,
      meuId: window.__MP.socket.id,
      botao: (document.getElementById('brStartBtn') || {}).textContent,
      desabilitado: (document.getElementById('brStartBtn') || {}).disabled,
    }));
    assert.ok(virouHost,
      `sala ficou SEM anfitrião depois da reconexão: hostId=${estado.hostId} meuId=${estado.meuId} ` +
      `botão="${estado.botao}"`);
    assert.equal(estado.desabilitado, false, `botão de começar seguiu travado: "${estado.botao}"`);
  });
});
