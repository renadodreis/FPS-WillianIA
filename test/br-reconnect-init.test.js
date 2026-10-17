/* ================================================================
   QA — RECONEXÃO ANTES DO CLIENTE BR CARREGAR (bug de produção).

   O servidor emite um `init` FRESCO em toda conexão, com o id novo do
   socket. Enquanto br-game.js não termina de baixar, multiplayer-client.js
   não bootou — e era ele quem escutava `init`. Nessa janela o transporte do
   engine.io cai com facilidade (a main thread fica travada montando o mundo)
   e o cliente reconectava com id novo SEM ninguém adotar o init: window.
   __MP_init ficava órfão do socket para sempre.

   Consequência real, não de QA: o servidor sabe que este socket é o
   anfitrião (claimHost pelo código salvo/URL roda no boot), mas o cliente
   compara `INIT.id === S.hostId` com um id morto — o botão COMEÇAR PARTIDA
   fica travado em "AGUARDANDO O ANFITRIÃO..." e ninguém inicia a partida.
   Pelo mesmo caminho, eventos endereçados por id que o servidor manda pra
   TODOS (playerKilled, matchEnd) deixam de se reconhecer.
   ================================================================ */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

describe('BR — reconexão na janela sem br-game.js',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    it('adota o init novo: o id acompanha o socket e o anfitrião consegue iniciar', async () => {
      let h;
      try {
        h = await bootGame({
          port: 3296,
          // ?host=CODIGO é o caminho de produção do anfitrião (savedHostCode)
          query: '?host=QUEDALIVRE',
          extraEnv: { COUNTDOWN_S: '30', NEXT_IN_S: '300' },
          // segura o cliente BR: é a janela em que ninguém escutava `init`
          delayRequests: [{ fragment: '/br-game.js', ms: 30000 }],
        });
        await h.page.waitForFunction(
          'window.__MP && window.__MP.socket && window.__MP.socket.connected',
          { timeout: 30000 });
        assert.equal(await h.play(() => !!window.__BR_debug), false,
          'pré-condição inválida: br-game bootou antes da janela sob teste');

        /* queda de transporte REAL (o que a rede ruim / main thread travada
           faz sozinha): o socket.io reconecta e o servidor manda um init novo.
           Com a recuperação de sessão (MP-2, server.js) o id pode ser o MESMO —
           então "INIT.id === socket.id" sozinho passaria sem adotar nada: a
           prova da adoção é o `serverNow` do init renovado. */
        const serverNowAntes = await h.play(() => {
          const s = window.__MP.socket;
          window.__reconectou = false;
          s.once('disconnect', () => s.once('connect', () => { window.__reconectou = true; }));
          s.io.engine.close();
          return window.__MP_init.serverNow;
        });
        await h.page.waitForFunction('window.__reconectou && window.__MP.socket.connected', { timeout: 30000 });

        // a identidade tem de acompanhar o socket AINDA na janela sem br-game
        const janela = await h.play(async antes => {
          const fim = Date.now() + 8000;
          for (;;) {
            const ok = window.__MP_init.id === window.__MP.socket.id && window.__MP_init.serverNow > antes;
            const brBootou = !!window.__BR_debug;
            if (ok || brBootou || Date.now() > fim) return { ok, brBootou };
            await new Promise(r => setTimeout(r, 50));
          }
        }, serverNowAntes);
        assert.equal(janela.brBootou, false,
          'pré-condição inválida: br-game bootou antes de a reconexão ser julgada');
        assert.equal(janela.ok, true,
          'INIT.id ficou órfão do socket: o init da reconexão não foi adotado');

        // com o cliente BR no ar, o anfitrião tem de se reconhecer
        await h.page.waitForFunction(
          'window.__BR_debug && window.__BR_debug.S && window.__BR_debug.S.phase === "LOBBY"',
          { timeout: 90000 });
        await h.page.waitForFunction(
          'window.__BR_debug.S.hostId === window.__MP.socket.id', { timeout: 20000 });
        const estado = await h.play(() => {
          const btn = document.getElementById('brStartBtn');
          return {
            init: window.__MP_init.id,
            socket: window.__MP.socket.id,
            botao: btn ? { travado: btn.disabled, texto: btn.textContent } : null,
            euComoRemoto: window.__BR_debug.remotes.has(window.__MP.socket.id),
          };
        });
        assert.equal(estado.init, estado.socket, 'INIT.id divergiu do socket depois do boot');
        assert.equal(estado.euComoRemoto, false, 'o jogador virou avatar remoto de si mesmo');
        assert.deepEqual(estado.botao, { travado: false, texto: '▶ COMEÇAR PARTIDA' },
          'o anfitrião reconectado não consegue iniciar a partida');
      } finally {
        if (h) await h.close();
      }
    });
  });
