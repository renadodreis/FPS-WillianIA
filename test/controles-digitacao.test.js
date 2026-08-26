/* ================================================================
   QA — DIGITAR EM CAMPO DE TEXTO CONTINUA FUNCIONANDO.

   Regressão que este teste existe pra travar (bug nº 18 do
   QA-REPORT.md, já corrigido uma vez): "Dado que digito num campo
   (nick, chat, código do anfitrião), quando aperto espaço/teclas,
   então o jogo capturava e bloqueava a digitação".

   A correção histórica mora em game.js:1328 — o listener de teclado do
   jogo SAI FORA quando o alvo é INPUT/TEXTAREA, e só depois disso chama
   `preventDefault` em Space/Ctrl/Tab.

   O remapeamento de teclas trouxe um interceptador em fase de CAPTURA no
   `window`, que roda ANTES de todo mundo. Se ele repetir o
   `preventDefault` sem repetir a guarda, o bug volta inteiro: o espaço
   nunca chega no campo. Capturar tecla pro jogo e capturar tecla pra
   digitar são coisas diferentes, e quem intercepta cedo precisa saber
   disso.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

const PORT = 3402;

describe('digitação em campo de texto', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: PORT, autoStart: false });
    await h.play(() => {
      const el = document.createElement('input');
      el.type = 'text';
      el.id = 'qaCampoTexto';
      el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999';
      document.body.appendChild(el);
      el.focus();
    });
  });
  after(async () => { if (h) await h.close(); });

  it('espaço entra no campo em vez de virar pulo', async () => {
    await h.play(() => {
      const el = document.getElementById('qaCampoTexto');
      el.value = '';
      el.focus();
    });
    // teclado de VERDADE: o evento chega com isTrusted, que é o que o
    // interceptador de remapeamento examina
    await h.page.keyboard.type('ana');
    await h.page.keyboard.press('Space');
    await h.page.keyboard.type('maria');
    const valor = await h.play(() => document.getElementById('qaCampoTexto').value);
    assert.equal(valor, 'ana maria',
      'o espaço foi engolido: interceptador chamando preventDefault sem checar o campo de texto');
  });

  it('Tab não é engolido dentro do campo', async () => {
    const bloqueado = await h.play(async () => {
      const el = document.getElementById('qaCampoTexto');
      el.focus();
      let impedido = false;
      const espia = e => { if (e.code === 'Tab') impedido = e.defaultPrevented; };
      window.addEventListener('keydown', espia);
      await new Promise(r => setTimeout(r, 10));
      window.__qaLeituraTab = () => { window.removeEventListener('keydown', espia); return impedido; };
      return true;
    });
    assert.equal(bloqueado, true);
    await h.page.keyboard.press('Tab');
    const impedido = await h.play(() => window.__qaLeituraTab());
    assert.equal(impedido, false,
      'Tab foi cancelado dentro de um campo de texto — navegação por teclado quebrada');
  });

  it('fora de campo de texto o jogo continua recebendo a tecla', async () => {
    // a outra metade do contrato: a guarda não pode desligar o jogo
    const recebeu = await h.play(async () => {
      document.getElementById('qaCampoTexto').blur();
      document.body.focus();
      const G = window.__game;
      G.keys['KeyW'] = false;
      return true;
    });
    assert.equal(recebeu, true);
    await h.page.keyboard.down('KeyW');
    const ligado = await h.play(() => window.__game.keys['KeyW'] === true);
    await h.page.keyboard.up('KeyW');
    assert.equal(ligado, true, 'a guarda de campo de texto silenciou o jogo inteiro');
  });
});
