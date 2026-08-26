/* ================================================================
   QA — TECLAS QUE O JOGADOR NÃO PODE SEQUESTRAR, E CAPTURA QUE NÃO
   PODE ROUBAR DIGITAÇÃO.

   Dois defeitos achados por auditoria, os dois no mesmo lugar: o que o
   remapeamento tem direito de tocar.

   1. ENTER RESERVADO. O painel aceitava ligar uma ação em ENTER. Em
      partida, ENTER é o ÚNICO jeito de abrir o chat (br-game.js) — e ele
      compara `e.code === 'Enter'`. Ligar qualquer ação ali fazia o chat
      parar de abrir, sem outro caminho pra ele. `Escape` já era reservado
      pelo mesmo motivo (é o "cancelar universal"); `Enter` tem a mesma
      cara e ficou de fora. É defeito ALCANÇÁVEL: o painel mostrava
      "ENTER" e gravava.

   2. CAPTURA PENDENTE NÃO ROUBA TECLA DE CAMPO DE TEXTO. O modo
      "esperando tecla" pode ficar pendente (ativação sem foco). Com a
      guarda de digitação deixando de sair do handler — correção certa,
      feita por causa da tecla presa —, esse modo passou a engolir a
      PRIMEIRA tecla digitada num campo e regravar o binding em silêncio:
      digitar "abc" no campo dava "bc", e a ação ia parar em A.

   As duas metades do contrato: capturar tecla é modal e vale sobre o
   JOGO, nunca sobre o texto que a pessoa está escrevendo.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

const PORT = 3408;

describe('teclas reservadas (núcleo puro)', () => {
  let isReservedCode, rebind, defaultBindings;
  before(async () => {
    ({ isReservedCode, rebind, defaultBindings } = await import('../js/keybinds.js'));
  });

  it('ENTER é reservado — é o único jeito de abrir o chat da partida', () => {
    assert.equal(isReservedCode('Enter'), true);
  });

  it('NumpadEnter também — é o mesmo ENTER pra quem digita no teclado numérico', () => {
    assert.equal(isReservedCode('NumpadEnter'), true);
  });

  it('rebind recusa ENTER em vez de gravar', () => {
    const r = rebind(defaultBindings(), 'medkit', 'Enter');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'reserved');
    assert.equal(r.bindings.medkit, 'KeyQ', 'o binding não pode ter mudado');
  });

  it('as reservadas de antes continuam reservadas', () => {
    for (const c of ['Escape', 'MetaLeft', 'MetaRight']) assert.equal(isReservedCode(c), true);
  });

  it('e tecla comum segue livre', () => {
    for (const c of ['KeyB', 'Digit7', 'ArrowUp']) assert.equal(isReservedCode(c), false);
  });
});

describe('captura pendente não rouba digitação', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: PORT, autoStart: false });
    await h.page.evaluate(() => {
      const box = document.getElementById('ctlBox');
      if (!box.open) document.getElementById('btnCtl').click();
      const el = document.createElement('input');
      el.type = 'text';
      el.id = 'qaCampo';
      el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999';
      document.body.appendChild(el);
    });
    await h.page.waitForFunction("document.getElementById('ctlBox').open === true", { timeout: 10000 });
  });
  after(async () => { if (h) await h.close(); });

  it('com "esperando tecla" pendente, digitar num campo não regrava nem engole letra', async () => {
    const antes = await h.play(() => {
      /* ativação SEM foco — é o caminho que a auditoria usou e que existe em
         navegador que não foca botão no clique, e em tecnologia assistiva */
      document.querySelector('.keyBtn[data-act="jump"]').click();
      const el = document.getElementById('qaCampo');
      el.value = '';
      el.focus();
      return localStorage.getItem('callofai_keys');
    });
    await h.page.keyboard.type('abc');
    const depois = await h.play(() => ({
      texto: document.getElementById('qaCampo').value,
      gravado: localStorage.getItem('callofai_keys'),
      rotuloJump: document.querySelector('.keyBtn[data-act="jump"]').textContent.trim(),
    }));
    assert.equal(depois.texto, 'abc', 'a captura pendente engoliu a primeira letra digitada');
    assert.equal(depois.gravado, antes, 'a captura pendente regravou o mapa de teclas em silêncio');
    assert.match(depois.rotuloJump, /ESPAÇO|Space/i, 'o binding de pular mudou sozinho');
  });
});
