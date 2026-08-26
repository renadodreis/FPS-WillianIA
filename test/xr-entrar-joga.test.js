/* ================================================================
   QA — ENTRAR EM VR JÁ COLOCA O JOGADOR EM JOGO.

   O buraco que este teste fecha: o menu é DOM, e DOM não existe dentro de
   uma sessão imersiva. Quem entrava em VR pelo botão do menu ficava preso
   num estado sem saída — `state.started === false`, `paused === true` —
   de pé no mundo, com o analógico sem mover ninguém, e sem nenhum jeito
   de apertar "JOGAR" porque o botão não é renderizado no headset.

   Do lado de fora parecia "controle de VR não funciona". Não era: era o
   jogo nunca ter começado.

   A verificação anterior não pegou porque a sonda chamava `forceStart()`
   antes de medir — ou seja, testava um passo que o jogador não tem como
   dar. Sonda que faz pelo usuário o que o usuário não consegue fazer não
   está testando o produto.

   Enquanto não existir menu dentro do mundo (Fase 5), entrar em VR
   significa jogar.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

const PORT = 3412;

describe('entrar em VR começa o jogo', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootGame({ port: PORT, autoStart: false }); });
  after(async () => { if (h) await h.close(); });

  it('no menu, fora de VR, o jogo continua parado — nada de começar sozinho', async () => {
    const r = await h.play(() => {
      const G = window.__game;
      G.tick(1 / 60);
      return { started: G.state.started, paused: G.state.paused };
    });
    assert.equal(r.started, false, 'o desktop não pode começar sozinho ao abrir o menu');
  });

  it('entrar em sessão imersiva tira o jogador do menu', async () => {
    const r = await h.play(() => {
      const G = window.__game, R = window.__MP.renderer;
      R.setAnimationLoop(null);
      const antes = { started: G.state.started, paused: G.state.paused };
      R.xr.isPresenting = true;
      G.tick(1 / 60);
      const depois = { started: G.state.started, paused: G.state.paused };
      R.xr.isPresenting = false;
      G.tick(1 / 60);
      R.setAnimationLoop(() => G.tick());
      return { antes, depois };
    });
    assert.equal(r.antes.started, false);
    assert.equal(r.depois.started, true,
      'entrou em VR e continuou no menu: sem menu dentro do mundo, isso é beco sem saída');
    assert.equal(r.depois.paused, false, 'entrou em jogo pausado — o analógico não moveria ninguém');
  });

  it('sair e voltar pra VR não reinicia a partida em andamento', async () => {
    const r = await h.play(() => {
      const G = window.__game, MP = window.__MP, R = MP.renderer;
      R.setAnimationLoop(null);
      R.xr.isPresenting = true;
      G.tick(1 / 60);
      MP.player.pos.set(120, MP.groundAt(120, -60, 999), -60);
      G.tick(1 / 60);
      const antes = [+MP.player.pos.x.toFixed(1), +MP.player.pos.z.toFixed(1)];
      R.xr.isPresenting = false;
      G.tick(1 / 60);
      R.xr.isPresenting = true;
      G.tick(1 / 60);
      const depois = [+MP.player.pos.x.toFixed(1), +MP.player.pos.z.toFixed(1)];
      R.xr.isPresenting = false;
      G.tick(1 / 60);
      R.setAnimationLoop(() => G.tick());
      return { antes, depois };
    });
    assert.deepEqual(r.depois, r.antes,
      'tirar e recolocar o headset teleportou o jogador de volta pro spawn');
  });
});
