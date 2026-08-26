/* ================================================================
   QA — TECLA ÓRFÃ FICA SURDA PRO JOGO, NÃO MORTA PRA UI.

   Quando o jogador remapeia uma ação, a tecla PADRÃO dela vira órfã e
   não pode mais acionar aquela ação — senão o comando antigo continua
   funcionando escondido. Até aí, certo.

   O ERRO QUE ESTE TESTE TRAVA: matar o evento com
   `stopImmediatePropagation()` na fase de CAPTURA do `window`. Isso não
   tira só o comando do jogo — apaga o evento antes de `document` e antes
   do elemento focado, ou seja, antes de QUEM NÃO TEM NADA A VER com a
   ação remapeada. Duas vítimas reais, as duas lendo `e.key` (nunca
   `e.code`, então nem o mapa de teclas as protege):

     · js/menuscene.js — ESPAÇO ativa o `.mbtn` focado. Os botões do menu
       são `<div role="button" tabindex="0">`, e ESPAÇO é a tecla padrão
       de ativação desse papel: matá-la quebra a navegação por teclado.
     · game.js — os botões "JOGAR DE NOVO"/"VOLTAR AO MENU" da tela de
       morte, que ficariam focáveis e mudos.

   Medido antes da correção: com "Pular" remapeado, o botão focado no
   menu recebia 1 clique com o padrão e ZERO depois do remap.

   O contrato certo tem DUAS metades, e as duas estão aqui: o jogo não
   pode mais ver a tecla órfã, e a interface tem que continuar vendo.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

const PORT = 3404;

describe('tecla órfã depois do remapeamento', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: PORT, autoStart: false });
    /* Remapeia PELO CAMINHO DO JOGADOR: abre o painel, clica na ação e aperta
       a tecla nova. Sem escrever no localStorage na marra e sem recarregar —
       o estado em memória do interceptador é o que vale, e é ele que o
       jogador de verdade produz. */
    await h.page.evaluate(() => {
      const box = document.getElementById('ctlBox');
      if (!box.open) document.getElementById('btnCtl').click();
    });
    await h.page.waitForFunction("document.getElementById('ctlBox').open === true", { timeout: 10000 });
    await h.page.evaluate(() => document.querySelector('.keyBtn[data-act="jump"]').click());
    await h.page.waitForFunction(
      "document.querySelector('.keyBtn[data-act=\"jump\"]').classList.contains('listening')",
      { timeout: 10000 });
    await h.page.keyboard.press('KeyB');
    await h.page.waitForFunction(
      "!document.querySelector('.keyBtn[data-act=\"jump\"]').classList.contains('listening')",
      { timeout: 10000 });
    const rotulo = await h.page.evaluate(
      () => document.querySelector('.keyBtn[data-act="jump"]').textContent.trim());
    assert.match(rotulo, /B/, `o remapeamento não pegou: rótulo ficou "${rotulo}"`);
    // fecha o painel pra não interferir no foco dos botões do menu
    await h.page.evaluate(() => {
      const box = document.getElementById('ctlBox');
      if (box.open) document.getElementById('btnCtl').click();
    });
  });

  after(async () => { if (h) await h.close(); });

  it('o jogo deixa de ver a tecla padrão órfã', async () => {
    await h.play(() => { window.__game.keys['Space'] = false; });
    // down/up separados: `press` solta a tecla, e o keyup zera `keys` antes da leitura
    await h.page.keyboard.down('Space');
    const viu = await h.play(() => window.__game.keys['Space'] === true);
    await h.page.keyboard.up('Space');
    assert.equal(viu, false, 'a tecla antiga continuou acionando o jogo — o remap não pegou');
  });

  it('a tecla nova aciona a ação no lugar da antiga', async () => {
    await h.play(() => { window.__game.keys['Space'] = false; });
    await h.page.keyboard.down('KeyB');
    const viu = await h.play(() => window.__game.keys['Space'] === true);
    await h.page.keyboard.up('KeyB');
    assert.equal(viu, true, 'a tecla nova não chegou como o código canônico da ação');
  });

  it('a INTERFACE continua recebendo a tecla órfã', async () => {
    // é o que o stopImmediatePropagation matava: o evento nem chegava em
    // document, então ESPAÇO parava de ativar o botão focado do menu
    const chegou = await h.play(async () => {
      window.__qaEspacoNoDocumento = 0;
      window.__qaEspia = e => { if (e.key === ' ') window.__qaEspacoNoDocumento++; };
      document.addEventListener('keydown', window.__qaEspia);
      return true;
    });
    assert.equal(chegou, true);
    await h.page.keyboard.press('Space');
    const n = await h.play(() => {
      document.removeEventListener('keydown', window.__qaEspia);
      return window.__qaEspacoNoDocumento;
    });
    assert.equal(n, 1,
      'ESPAÇO não chegou no documento: a tecla órfã foi morta em vez de silenciada');
  });

  it('ESPAÇO ainda ativa o botão focado do menu', async () => {
    const cliques = await h.play(async () => {
      const btn = document.getElementById('btnNew');
      let n = 0;
      const conta = () => { n++; };
      btn.addEventListener('click', conta);
      btn.focus();
      window.__qaLer = () => { btn.removeEventListener('click', conta); return n; };
      return document.activeElement === btn;
    });
    assert.equal(cliques, true, 'não consegui focar o botão do menu');
    await h.page.keyboard.press('Space');
    const n = await h.play(() => window.__qaLer());
    assert.equal(n, 1, 'botão focado do menu ficou mudo para ESPAÇO após o remapeamento');
  });
});
