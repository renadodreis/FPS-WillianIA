/* ================================================================
   DICAS DE CONTROLE NO HEADSET — "como eu corro? como troco de arma?"

   O dono, no aparelho (2026-08-30): "CADÊ O BOTÃO DE MIRA? COMO EU CORRO?
   CADÊ O BOTÃO DE CORRER? ... COMO TROCAR DE ARMA". Os verbos existiam e
   funcionavam (B troca, batente/clique corre, gatilho/grip mira) — o que não
   existia era qualquer lugar DENTRO da sessão que dissesse isso. O Touch não
   tem teclado impresso: sem dica, o jogador descobre por acidente ou não
   descobre. É o que o gênero faz nos primeiros segundos (Pavlov e Onward
   mostram o mapa de botões na primeira partida).

   O canal é o AVISO CENTRAL que já existe (js/xr/xrhud.js `mensagem`, o
   mesmo dos mísseis): nasce onde o jogador olha, 13,5° ACIMA da linha de
   mira, a 1 m — fora da linha de tiro por construção (H1/I3 já medidos em
   test/xr-aviso.test.js). Uma sequência curta, só na PRIMEIRA partida da
   sessão de navegador, só dentro de XR.

   O QUE ESTE ARQUIVO MEDE:
     · dentro da sessão, começar a partida faz o aviso central passar por
       TODAS as dicas declaradas, na ordem, cada uma com o texto exato;
     · a dica de TROCAR ARMA e a de CORRER estão entre elas (são as duas
       perguntas literais do dono);
     · terminada a sequência o aviso SOME (não vira HUD permanente);
     · JOGAR DE NOVO na mesma sessão NÃO repete a sequência.

   PORTA 3880 (livre — a mais alta em uso antes desta era 3878).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3880;

describe('dicas de controle ao começar a partida em VR',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      /* `emJogo: false`: a sonda de amostragem tem de estar instalada ANTES
         de a partida começar — as dicas nascem no `startGame`. */
      h = await bootEmVR(bootGame, { port: PORT, emJogo: false });
      await h.play(() => window.__A.espera(600));
    });
    after(async () => { if (h) await h.close(); });

    it('começar a partida mostra as dicas, na ordem, e depois some', async () => {
      const r = await h.play(async () => {
        const G = window.__game;
        const lista = G.dicasVR.lista.slice();
        const vistos = [];
        let ultimo = null;
        const t0 = performance.now();
        G.forceStart();
        /* amostra a 10 Hz por toda a janela declarada + folga: cada dica dura
           `ms`, e o aviso esmaece no fim */
        const total = G.dicasVR.atraso + lista.length * G.dicasVR.ms + 1500;
        while (performance.now() - t0 < total) {
          await window.__A.espera(100);
          const e = G.XRHud.estado();
          const a = e && e.aviso;
          const txt = a && a.visivel && a.opacidade > 0.5 ? a.texto : null;
          if (txt !== ultimo) { vistos.push({ t: Math.round(performance.now() - t0), txt }); ultimo = txt; }
        }
        const fim = G.XRHud.estado();
        return { lista, vistos, fimVisivel: !!(fim && fim.aviso && fim.aviso.visivel), started: G.state.started };
      });
      const textos = r.vistos.map(v => v.txt).filter(Boolean);
      console.log('      dicas declaradas: ' + JSON.stringify(r.lista));
      console.log('      vistas no aviso:  ' + r.vistos.map(v => `${v.t}ms=${v.txt === null ? '(nada)' : JSON.stringify(v.txt)}`).join(' | '));
      assert.equal(r.started, true, 'a partida não começou — nada foi medido');
      assert.ok(r.lista.length >= 3, `poucas dicas declaradas (${r.lista.length})`);
      assert.deepEqual(textos, r.lista,
        'o aviso central não passou por TODAS as dicas na ordem declarada');
      /* as duas perguntas literais do dono */
      assert.ok(r.lista.some(t => /TROCAR ARMA/.test(t)), 'nenhuma dica diz como TROCAR ARMA');
      assert.ok(r.lista.some(t => /CORRER/.test(t)), 'nenhuma dica diz como CORRER');
      assert.ok(r.lista.some(t => /MIRAR/.test(t)), 'nenhuma dica diz como MIRAR');
      assert.equal(r.fimVisivel, false, 'terminada a sequência o aviso tinha de sumir — virou HUD permanente');
    });

    it('JOGAR DE NOVO na mesma sessão não repete as dicas', async () => {
      const r = await h.play(async () => {
        const G = window.__game, MP = window.__MP;
        window.__BR_active = false; window.__MP_active = false;
        MP.player.health = 100; MP.player.dead = false; MP.player.armor = 0;
        MP.playerDamage(9999, null, { type: 'test' });
        await window.__A.espera(1000);
        const antes = G.dicasVR.emissoes();
        G.restartMatch();
        await window.__A.espera(G.dicasVR.atraso + 800);
        const e = G.XRHud.estado();
        return { antes, depois: G.dicasVR.emissoes(), dead: MP.player.dead, aviso: e && e.aviso && e.aviso.visivel ? e.aviso.texto : null };
      });
      console.log(`      emissões antes ${r.antes} · depois ${r.depois} · aviso agora: ${r.aviso === null ? '(nada)' : JSON.stringify(r.aviso)}`);
      assert.equal(r.dead, false, 'JOGAR DE NOVO não reviveu — o cenário não mediu o reinício');
      assert.equal(r.depois, r.antes, 'JOGAR DE NOVO repetiu as dicas — a sequência é uma vez por sessão');
    });
  });
