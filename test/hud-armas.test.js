/* ================================================================
   C7 — QUALQUER ARMA EM UM TOQUE (docs/mobile/criterio-aaa.md).

   Antes: o ⇄ só andava pra frente (até 7 toques entre duas das 8 armas do
   BR), e tocar a arma no #slots caía no CANVAS — o #hud é pointer-events:
   none. Referência (docs/mobile/referencia-mira-toque.md §4.1): CoD Mobile,
   "Tapping the stowed weapon will take it out and make it the current
   weapon".

   Como mede, e por que a medida não é o próprio produto:
   · o dedo cai onde o JOGADOR vê o ícone: centro do retângulo na tela, e o
     alvo do toque é quem o `elementFromPoint` devolve ali — não um
     `querySelector` que acharia o botão mesmo coberto;
   · o resultado é a ARMA DO JOGO (`arsenal.indexOf(gun)`) e o nome que o HUD
     de munição mostra (#weaponName), estado que a camada de toque não escreve;
   · os 56 pares ordenados das 8 armas saem de um circuito euleriano do
     grafo completo: cada toque parte da arma que o toque anterior deixou, e
     nenhum `switchWeapon` do teste arruma o caminho entre dois toques.

   Porta: 4010 (faixa 4010–4019 desta frente).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');

const PORT = 4010;
const PHONE = { width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

/* circuito euleriano do dígrafo completo K_n (Hierholzer): toda aresta i→j
   (i ≠ j) exatamente uma vez, começando e terminando em `ini` */
function circuitoCompleto(n, ini) {
  const saida = [];
  for (let i = 0; i < n; i++) saida.push([...Array(n).keys()].filter(j => j !== i).reverse());
  const pilha = [ini], caminho = [];
  while (pilha.length) {
    const v = pilha[pilha.length - 1];
    if (saida[v].length) pilha.push(saida[v].pop());
    else caminho.push(pilha.pop());
  }
  return caminho.reverse();
}

describe('C7 — armas como ícones tocáveis', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: PORT, query: '?mobile=1', viewport: PHONE });
    await h.play(() => {
      for (const e of window.QA.G.Enemies.list) { e.alive = false; if (e.group) e.group.visible = false; }
      /* o toque de verdade: pointerdown/up no que ESTÁ debaixo do ponto */
      window.TQA_armas = {
        chip: i => document.querySelector(`#tcArmas .tcArma[data-slot="${i}"]`),
        centro(el) { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; },
        tocar(x, y, id) {
          const alvo = document.elementFromPoint(x, y);
          if (!alvo) return null;
          const o = { pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y,
            bubbles: true, cancelable: true };
          alvo.dispatchEvent(new PointerEvent('pointerdown', o));
          alvo.dispatchEvent(new PointerEvent('pointerup', o));
          return alvo;
        },
      };
      window.QA.reset();
      window.QA.tick(4);
    });
  });
  after(async () => { if (h) await h.close(); });
  const play = (fn, ...args) => h.play(fn, ...args);

  it('dado o celular em partida, então existe um ícone por arma, na ordem do arsenal, e ele substitui o #slots', async () => {
    const r = await play(() => {
      const G = window.QA.G;
      const chips = [...document.querySelectorAll('#tcArmas .tcArma')];
      const bar = document.getElementById('tcArmas').getBoundingClientRect();
      return {
        n: chips.length, arsenal: G.arsenal.length,
        slots: chips.map(c => Number(c.dataset.slot)),
        numeros: chips.map(c => c.querySelector('b').textContent),
        rotulos: chips.map(c => c.querySelector('small').textContent),
        nomes: G.arsenal.map(w => w.name), trancadas: G.arsenal.map(w => !!w.locked),
        barVisivel: getComputedStyle(document.getElementById('tcArmas')).display !== 'none' && bar.width > 40,
        slotsHud: getComputedStyle(document.getElementById('slots')).display,
        classe: document.documentElement.classList.contains('armas'),
      };
    });
    assert.equal(r.classe, true, 'a fiação do game.js não chegou (falta html.armas): sem arsenal, sem barra');
    assert.equal(r.n, r.arsenal, `${r.n} ícones para ${r.arsenal} armas`);
    assert.deepEqual(r.slots, [...Array(r.arsenal).keys()], 'ícones fora da ordem do arsenal');
    assert.deepEqual(r.numeros, r.slots.map(i => String(i + 1)));
    for (let i = 0; i < r.n; i++) {
      if (r.trancadas[i]) assert.equal(r.rotulos[i], '🔒', `${r.nomes[i]} trancada sem cadeado`);
      else assert.ok(r.nomes[i].startsWith(r.rotulos[i]) && r.rotulos[i].length > 1,
        `rótulo "${r.rotulos[i]}" não é de ${r.nomes[i]}`);
    }
    assert.equal(r.barVisivel, true, 'a barra de armas não está na tela em partida');
    assert.equal(r.slotsHud, 'none', 'o #slots do HUD continua na tela junto com a barra (dois arsenais)');
  });

  it('dadas as 8 armas destrancadas, então QUALQUER arma sai em UM toque — os 56 pares', async () => {
    const seq = circuitoCompleto(8, 0);
    assert.equal(seq.length, 57, 'cenário inválido: o circuito tem de cobrir 56 arestas');
    const r = await play(ordem => {
      const QA = window.QA, G = QA.G, A = window.TQA_armas;
      const travas = G.arsenal.map(w => !!w.locked);
      for (const w of G.arsenal) w.locked = false;
      QA.reset();
      G.switchWeapon(ordem[0]);
      QA.tick(2);
      const falhas = [], toques = [];
      let id = 300;
      try {
        for (let k = 1; k < ordem.length; k++) {
          const de = G.arsenal.indexOf(G.gun), para = ordem[k];
          const chip = A.chip(para);
          const [x, y] = A.centro(chip);
          const alvo = A.tocar(x, y, id++);
          const noMesmoQuadro = document.querySelector('#tcArmas .tcArma.ativa');
          QA.tick(1);
          const agora = G.arsenal.indexOf(G.gun);
          toques.push(agora === para ? 1 : Infinity);
          if (agora !== para || alvo !== chip && !chip.contains(alvo)) {
            falhas.push(`${de + 1}→${para + 1}: foi pra ${agora + 1}, o dedo caiu em ` +
              `${alvo ? (alvo.id || alvo.className || alvo.tagName) : 'nada'}`);
          }
          if (noMesmoQuadro !== chip) falhas.push(`${de + 1}→${para + 1}: destaque não andou no quadro do toque`);
          if (document.getElementById('weaponName').textContent.trim() !== G.arsenal[para].name.trim())
            falhas.push(`${de + 1}→${para + 1}: o HUD de munição mostra "${document.getElementById('weaponName').textContent}"`);
        }
      } finally {
        G.arsenal.forEach((w, i) => { w.locked = travas[i]; });
        G.switchWeapon(0);
        QA.tick(2);
      }
      return { falhas, max: Math.max(...toques), pares: toques.length };
    }, seq);
    console.log(`  [C7] ${r.pares} pares ordenados, pior caso: ${r.max} toque(s) (antes: 7 no ⇄)`);
    assert.deepEqual(r.falhas, [], r.falhas.join('\n'));
    assert.equal(r.pares, 56);
    assert.equal(r.max, 1, `pior par pediu ${r.max} toques`);
  });

  it('dada uma arma TRANCADA, então o ícone dela não é alvo (o dedo cai na mira) e não troca nada', async () => {
    const r = await play(() => {
      const QA = window.QA, G = QA.G, A = window.TQA_armas;
      const trava3 = G.arsenal[3].locked;
      G.arsenal[3].locked = true;
      QA.reset();
      G.switchWeapon(0);
      QA.tick(2);
      try {
        const chip = A.chip(3);
        const [x, y] = A.centro(chip);
        const debaixo = document.elementFromPoint(x, y);
        const antes = G.arsenal.indexOf(G.gun);
        A.tocar(x, y, 400);
        /* e mesmo despachado DIRETO no ícone (dublê), ele recusa */
        const o = { pointerId: 401, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y,
          bubbles: true, cancelable: true };
        chip.dispatchEvent(new PointerEvent('pointerdown', o));
        chip.dispatchEvent(new PointerEvent('pointerup', o));
        QA.tick(1);
        return {
          debaixo: debaixo ? (debaixo.id || debaixo.className) : null, antes, depois: G.arsenal.indexOf(G.gun),
          cadeado: chip.querySelector('small').textContent, classe: chip.className,
          ativos: document.querySelectorAll('#tcArmas .tcArma.ativa').length,
        };
      } finally {
        G.arsenal[3].locked = trava3;
        QA.tick(1);
      }
    });
    assert.equal(r.debaixo, 'tcLook', `o ícone trancado ainda recebe o dedo (caiu em ${r.debaixo})`);
    assert.equal(r.depois, r.antes, `tocar uma trancada trocou de arma (${r.antes + 1} → ${r.depois + 1})`);
    assert.equal(r.cadeado, '🔒');
    assert.match(r.classe, /\btranc\b/);
    assert.equal(r.ativos, 1, `${r.ativos} ícones acesos ao mesmo tempo`);
  });

  it('dada uma arma que DESTRANCA no meio da partida, então o ícone acende sem nada mudar de lugar', async () => {
    const r = await play(() => {
      const QA = window.QA, G = QA.G, A = window.TQA_armas;
      const trava4 = G.arsenal[4].locked;
      G.arsenal[4].locked = true;
      QA.tick(1);
      const antes = [...document.querySelectorAll('#tcArmas .tcArma')].map(c => {
        const b = c.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top)];
      });
      G.arsenal[4].locked = false;           // o loot do BR faz exatamente isto (br-game.js applyItems)
      QA.tick(1);
      const depois = [...document.querySelectorAll('#tcArmas .tcArma')].map(c => {
        const b = c.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top)];
      });
      const chip = A.chip(4);
      const [x, y] = A.centro(chip);
      const alvo = A.tocar(x, y, 450);
      QA.tick(1);
      const foi = G.arsenal.indexOf(G.gun);
      const rotulo = chip.querySelector('small').textContent;   // ANTES de devolver a trava
      G.arsenal[4].locked = trava4;
      G.switchWeapon(0);
      QA.tick(2);
      return { antes, depois, foi, alvoOk: alvo === chip || chip.contains(alvo), rotulo };
    });
    assert.deepEqual(r.depois, r.antes, 'destrancar uma arma mexeu a posição dos ícones');
    assert.equal(r.alvoOk, true, 'a arma recém-destrancada não recebe o dedo');
    assert.equal(r.foi, 4, 'a arma recém-destrancada não saiu no toque');
    assert.equal(r.rotulo, 'PLASMA');
  });

  it('dado o jogo PAUSADO, então tocar um ícone não troca a arma', async () => {
    const r = await play(() => {
      const QA = window.QA, G = QA.G, A = window.TQA_armas;
      QA.reset();
      G.switchWeapon(0);
      QA.tick(2);
      const chip = A.chip(1);
      const [x, y] = A.centro(chip);
      G.setPaused(true);
      const o = { pointerId: 470, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y,
        bubbles: true, cancelable: true };
      chip.dispatchEvent(new PointerEvent('pointerdown', o));
      chip.dispatchEvent(new PointerEvent('pointerup', o));
      const pausado = G.arsenal.indexOf(G.gun);
      const slotsNaPausa = getComputedStyle(document.getElementById('slots')).display;
      document.getElementById('overlay').click();
      QA.tick(2);
      return { pausado, slotsNaPausa, voltou: !G.state.paused };
    });
    assert.equal(r.voltou, true, 'cenário inválido: não retomou');
    assert.equal(r.pausado, 0, 'tocar o ícone com o jogo pausado trocou de arma');
    assert.notEqual(r.slotsNaPausa, 'none', 'na pausa o #touchUI sai e o #slots do HUD tinha de voltar');
  });

  it('dado o celular, então nenhum erro de página apareceu', () => {
    assert.deepEqual(h.pageErrors, [], `erros de página: ${h.pageErrors.join(' | ')}`);
  });
});
