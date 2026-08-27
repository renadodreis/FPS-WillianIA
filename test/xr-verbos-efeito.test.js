/* ================================================================
   QA — O RADIAL MEXE NO INVENTÁRIO DE VERDADE.

   POR QUE ESTE ARQUIVO É SEPARADO. `test/xr-verbos.test.js` cobre a DECISÃO do
   radial: abrir, escolher a fatia, confirmar na soltura, não confirmar no
   centro, não disparar em rajada. Tudo isso vive em `js/xr/xrinput.js` e pode
   estar perfeito com o jogo sem receber nada — porque quem transforma a
   decisão em ação é UMA linha do `game.js`, e ela tem de ficar num ponto
   específico do frame: `shootUpdate` lê `justPressed` mais abaixo e
   `justPressed.clear()` apaga tudo no fim, então a mesma linha dez linhas
   depois vira código morto silencioso.

   Este arquivo mede o OUTRO LADO: o gesto do Touch, feito de verdade, tem de
   mudar o número do inventário. É o teste que só pôde existir depois da linha
   — escrito antes, mediria um dublê.

   E MEDE A RAJADA NO PRODUTO. O radial confirma na SOLTURA justamente porque
   manter o polegar na fatia a 72 Hz jogaria uma granada por frame. Isso está
   provado em unidade; aqui está provado no inventário, que é onde dói.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3554;

async function instalarSondas() {
  const G = window.__game;

  window.__V = {
    inv: () => ({ nades: G.inventory.nades, medkits: G.inventory.medkits, food: G.inventory.food }),
    vida: () => G.player.health,
    setVida: v => { G.player.health = v; },
    darItens: () => { G.inventory.nades = 5; G.inventory.medkits = 5; },
    /* O GESTO INTEIRO, como o jogador faz: aperta o gatilho da mão de apoio,
       empurra o analógico para a fatia, solta. A confirmação é na soltura. */
    async verbo(code, seguraMs = 260) {
      const [x, y] = { KeyG: [0, -1], KeyQ: [1, 0], KeyF: [0, 1], KeyT: [-1, 0] }[code];
      window.__A.botao('left', 'trigger', 1);
      await window.__A.espera(90);
      window.__A.stick('left', x, y);
      await window.__A.espera(seguraMs);
      window.__A.botao('left', 'trigger', 0);
      window.__A.stick('left', 0, 0);
      await window.__A.espera(420);
    },
    /* mesmo gesto, mas cancelando: solta com o polegar no CENTRO */
    async cancelar() {
      window.__A.botao('left', 'trigger', 1);
      await window.__A.espera(90);
      window.__A.stick('left', 0, -1);
      await window.__A.espera(160);
      window.__A.stick('left', 0, 0);
      await window.__A.espera(120);
      window.__A.botao('left', 'trigger', 0);
      await window.__A.espera(420);
    },
  };
  return true;
}

describe('o radial de verbos mexe no inventário (fiação do game.js)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootEmVR(bootGame, { port: PORT });
    await h.play(instalarSondas);
    await h.play(() => window.__A.espera(700));
  });
  after(async () => { if (h) await h.close(); });

  it('a fatia da GRANADA gasta uma granada — e só uma', async () => {
    const r = await h.play(async () => {
      window.__V.darItens();
      const antes = window.__V.inv();
      await window.__V.verbo('KeyG');
      return { antes, depois: window.__V.inv() };
    });
    assert.equal(r.depois.nades, r.antes.nades - 1,
      `granadas foram de ${r.antes.nades} para ${r.depois.nades}; o gesto tinha que gastar exatamente uma. ` +
      'Igual antes = a linha da ponte no game.js não está no frame certo (justPressed.clear() come o code)');
  });

  it('a fatia do KIT MÉDICO cura de verdade', async () => {
    const r = await h.play(async () => {
      window.__V.darItens();
      window.__V.setVida(40);
      const antes = { vida: window.__V.vida(), ...window.__V.inv() };
      await window.__V.verbo('KeyQ');
      await window.__A.espera(900);
      return { antes, vida: window.__V.vida(), inv: window.__V.inv() };
    });
    /* A CONTAGEM DE KITS É O SINAL, NÃO A VIDA. Escrito primeiro como
       `vida subiu OU kits caíram`, este caso passou com a ponte do game.js
       ARRANCADA — a vida deste jogo sobe sozinha, então o primeiro ramo era
       verdadeiro sem verbo nenhum. Um `||` com um termo que se satisfaz
       sozinho é um teste que não pode falhar. */
    assert.equal(r.inv.medkits, r.antes.medkits - 1,
      `kits foram de ${r.antes.medkits} para ${r.inv.medkits}: o verbo não consumiu kit nenhum`);
    assert.ok(r.vida > r.antes.vida,
      `o kit foi consumido mas a vida ficou em ${r.vida} (era ${r.antes.vida})`);
  });

  it('segurar a fatia quase um segundo NÃO vira rajada', async () => {
    /* A 72 Hz, um frame de confirmação por frame seriam ~65 granadas. Este é o
       defeito que a confirmação-na-soltura existe para impedir, medido aqui no
       inventário e não na máquina de estado. */
    const r = await h.play(async () => {
      window.__V.darItens();
      const antes = window.__V.inv();
      await window.__V.verbo('KeyG', 900);
      return { antes, depois: window.__V.inv() };
    });
    const gastou = r.antes.nades - r.depois.nades;
    assert.equal(gastou, 1,
      `segurando a fatia por 0,9 s o jogo gastou ${gastou} granadas — a confirmação voltou a ser por frame`);
  });

  /* CASO NEGATIVO, e o limite dele está escrito de propósito: ele passa
     também quando a ponte NÃO existe, porque aí nada é gasto de qualquer
     jeito. Não é o guarda da fiação (esse é o caso 1) — é o guarda do
     DISPARO INDEVIDO: abrir o radial sem querer não pode custar item. */
  it('soltar no CENTRO cancela: nada é gasto', async () => {
    const r = await h.play(async () => {
      window.__V.darItens();
      const antes = window.__V.inv();
      await window.__V.cancelar();
      return { antes, depois: window.__V.inv() };
    });
    assert.equal(r.depois.nades, r.antes.nades,
      `cancelando no centro o jogo ainda gastou ${r.antes.nades - r.depois.nades} granada(s) — abrir o radial sem querer não pode custar item`);
  });

});
