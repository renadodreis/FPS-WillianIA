/* ================================================================
   QA — TECLA REMAPEADA NÃO PODE FICAR PRESA.

   O defeito: a guarda de campo de texto do interceptador (que existe pra
   digitar no nick/chat/código continuar funcionando — bug nº 18 do
   QA-REPORT.md) saía do handler com `return` ANTES de reescrever o
   código. E o mesmo handler atende `keydown` E `keyup`.

   Consequência, no fluxo mais normal que existe numa partida:
     1. o jogador segura a tecla remapeada (ex.: U no lugar de W) e anda;
     2. aperta ENTER — o chat abre e o `<input>` rouba o foco;
     3. solta U DENTRO do chat: o keyup cai na guarda e não é reescrito,
        então `game.js` desliga o código FÍSICO (`KeyU`) enquanto o
        CANÔNICO (`KeyW`) fica ligado pra sempre;
     4. fecha o chat: o personagem anda sozinho, sem tecla apertada.

   Medido antes da correção: 6,97 m em 90 ticks sem input nenhum. Com o
   binding padrão o mesmo roteiro não prende — é defeito exclusivo do
   remapeamento.

   A raiz é confundir duas coisas: "não deixar o jogo AGIR enquanto
   digito" (que é sobre `preventDefault`) com "não traduzir a tecla"
   (que nunca deveria parar, senão o par keydown/keyup se desemparelha).
   Soltar tecla precisa SEMPRE chegar, ou o jogo fica com a tecla presa.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

const PORT = 3406;

describe('tecla remapeada não fica presa', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: PORT, autoStart: false });
    // remapeia "Mover para a frente" (W) para U, pelo caminho do jogador
    await h.page.evaluate(() => {
      const box = document.getElementById('ctlBox');
      if (!box.open) document.getElementById('btnCtl').click();
    });
    await h.page.waitForFunction("document.getElementById('ctlBox').open === true", { timeout: 10000 });
    await h.page.evaluate(() => document.querySelector('.keyBtn[data-act="moveForward"]').click());
    await h.page.waitForFunction(
      "document.querySelector('.keyBtn[data-act=\"moveForward\"]').classList.contains('listening')",
      { timeout: 10000 });
    await h.page.keyboard.press('KeyU');
    await h.page.waitForFunction(
      "!document.querySelector('.keyBtn[data-act=\"moveForward\"]').classList.contains('listening')",
      { timeout: 10000 });
    await h.page.evaluate(() => {
      const box = document.getElementById('ctlBox');
      if (box.open) document.getElementById('btnCtl').click();
      // campo de texto que rouba o foco, como o chat da partida faz
      const el = document.createElement('input');
      el.type = 'text';
      el.id = 'qaCampo';
      el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999';
      document.body.appendChild(el);
    });
  });
  after(async () => { if (h) await h.close(); });

  it('soltar a tecla DENTRO de um campo de texto desliga a ação', async () => {
    await h.play(() => {
      window.__game.keys['KeyW'] = false;
      window.__game.keys['KeyU'] = false;
      document.getElementById('qaCampo').blur();
      document.body.focus();
    });
    await h.page.keyboard.down('KeyU');
    const andando = await h.play(() => window.__game.keys['KeyW'] === true);
    assert.equal(andando, true, 'a tecla remapeada nem chegou a acionar a ação');

    // o chat abre e rouba o foco — e é aí que o jogador solta a tecla
    await h.play(() => document.getElementById('qaCampo').focus());
    await h.page.keyboard.up('KeyU');

    const preso = await h.play(() => ({
      canonico: window.__game.keys['KeyW'] === true,
      fisico: window.__game.keys['KeyU'] === true,
    }));
    assert.equal(preso.canonico, false,
      'tecla PRESA: soltar dentro do campo de texto deixou a ação ligada pra sempre — ' +
      'o personagem anda sozinho depois de usar o chat');
    assert.equal(preso.fisico, false);
  });

  it('e digitar no campo continua funcionando', async () => {
    // a guarda existe por um motivo real (bug nº 18); a correção não pode desfazê-la
    await h.play(() => {
      const el = document.getElementById('qaCampo');
      el.value = '';
      el.focus();
    });
    await h.page.keyboard.type('bom');
    await h.page.keyboard.press('Space');
    await h.page.keyboard.type('jogo');
    const valor = await h.play(() => document.getElementById('qaCampo').value);
    assert.equal(valor, 'bom jogo', 'o espaço voltou a ser engolido no campo de texto');
  });

  it('fora de campo de texto o ciclo apertar/soltar continua limpo', async () => {
    await h.play(() => {
      document.getElementById('qaCampo').blur();
      document.body.focus();
      window.__game.keys['KeyW'] = false;
    });
    await h.page.keyboard.down('KeyU');
    const ligou = await h.play(() => window.__game.keys['KeyW'] === true);
    await h.page.keyboard.up('KeyU');
    const desligou = await h.play(() => window.__game.keys['KeyW'] === false);
    assert.equal(ligou, true);
    assert.equal(desligou, true, 'a tecla ficou presa mesmo fora de campo de texto');
  });
});
