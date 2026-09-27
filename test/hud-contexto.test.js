/* ================================================================
   C8 — O BOTÃO APARECE QUANDO SERVE (docs/mobile/criterio-aaa.md).

   Antes: os 14 botões ficavam SEMPRE na tela — USAR, COMER, KIT e GRANADA
   visíveis com 0 carne, 0 kit, 0 granada e nada ao alcance. E o teste de
   touch-controls EXIGIA isso (`btns.length === 14`), congelando o defeito
   como requisito. Referências (docs/mobile/referencia-mira-toque.md §4.1 e
   §4.5): CoD Mobile, "When passing over a weapon on the ground, this button
   will pop-up"; Critical Ops 1.70, "The touch button appears when you can
   pick up an item".

   Contrato medido aqui:
   · USAR ⇔ interação ao alcance — a âncora é o #prompt que o js/interact.js
     acende (opacidade no DOM) e, no BR, o baú ao alcance; COMER ⇔ carne > 0;
     KIT ⇔ kits > 0; GRANADA ⇔ granadas > 0 (inventário do JOGO);
   · a transição sai em ≤ 1 quadro;
   · os botões que ficam NÃO mudam de lugar (retângulos idênticos em todos
     os estados) — memória do polegar;
   · o botão SEGURADO não some debaixo do dedo;
   · o lugar de um botão escondido devolve o dedo à área de MIRA (hit test
     real) e não dispara a tecla dele.

   Portas: 4011 (partida de QA) e 4012 (partida BR de verdade, baú).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness.js');

const PORT = 4011;
const PORT_BR = 4012;
const PHONE = { width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const CONTEXTUAIS = ['use', 'eat', 'med', 'nade'];
const FIXOS = ['fire', 'ads', 'jump', 'crouch', 'reload', 'swap', 'inv', 'pause', 'sight', 'chat'];

function instalar() {
  const doc = document;
  window.TQC = {
    btn: act => doc.querySelector(`#tcBtns .tcBtn[data-act="${act}"]`),
    /* VISÍVEL de verdade: sem `visibility: hidden`, com caixa, e o que está
       debaixo do centro dele É ele (nada cobrindo) */
    visivel(act) {
      const el = window.TQC.btn(act);
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      if (cs.display === 'none' || cs.visibility !== 'visible' || r.width < 1) return false;
      const hit = doc.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && (hit === el || el.contains(hit));
    },
    debaixo(act) {
      const r = window.TQC.btn(act).getBoundingClientRect();
      const hit = doc.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit ? (hit.id || hit.className || hit.tagName) : null;
    },
    rects() {
      const out = {};
      for (const b of doc.querySelectorAll('#tcBtns .tcBtn[data-act]')) {
        const r = b.getBoundingClientRect();
        out[b.dataset.act] = [r.left, r.top, r.width, r.height].map(v => Math.round(v * 10) / 10);
      }
      return out;
    },
    promptAceso: () => doc.getElementById('prompt').style.opacity === '1',
    evt(el, type, id, x, y) {
      el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true,
        clientX: x, clientY: y, bubbles: true, cancelable: true }));
    },
  };
}

describe('C8 — botões contextuais', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: PORT, query: '?mobile=1', viewport: PHONE });
    await h.play(instalar);
    await h.play(() => {
      for (const e of window.QA.G.Enemies.list) { e.alive = false; if (e.group) e.group.visible = false; }
      window.QA.reset();
      window.QA.tick(4);
    });
  });
  after(async () => { if (h) await h.close(); });
  const play = (fn, ...args) => h.play(fn, ...args);

  /* estado "nada serve": inventário vazio e longe de qualquer interação */
  function vazio() {
    const QA = window.QA, G = QA.G;
    QA.reset();
    G.inventory.meat = 0; G.inventory.medkits = 0; G.inventory.nades = 0;
    QA.tick(3);
  }

  it('dado inventário vazio e nada ao alcance, então USAR, COMER, KIT e GRANADA saem — e o buraco é MIRA', async () => {
    const r = await play(vazioSrc => {
      new Function(`return (${vazioSrc})`)()();
      const T = window.TQC;
      const out = { prompt: T.promptAceso(), ctx: {}, debaixo: {}, fixos: {} };
      for (const a of ['use', 'eat', 'med', 'nade']) { out.ctx[a] = T.visivel(a); out.debaixo[a] = T.debaixo(a); }
      for (const a of ['fire', 'ads', 'jump', 'crouch', 'reload', 'swap', 'inv', 'pause', 'sight', 'chat'])
        out.fixos[a] = T.visivel(a);
      return out;
    }, vazio.toString());
    assert.equal(r.prompt, false, 'cenário inválido: o #prompt está aceso (há interação ao alcance)');
    for (const a of CONTEXTUAIS) {
      assert.equal(r.ctx[a], false, `${a} na tela sem ter o que fazer`);
      assert.equal(r.debaixo[a], 'tcLook', `o lugar do ${a} escondido caiu em ${r.debaixo[a]}, não na área de mira`);
    }
    for (const a of FIXOS) assert.equal(r.fixos[a], true, `o botão fixo ${a} sumiu`);
  });

  it('dado cada item do inventário, então o botão dele entra e sai em ≤ 1 quadro', async () => {
    const r = await play(vazioSrc => {
      new Function(`return (${vazioSrc})`)()();
      const QA = window.QA, G = QA.G, T = window.TQC;
      const casos = [['eat', 'meat'], ['med', 'medkits'], ['nade', 'nades']];
      const out = [];
      for (const [act, campo] of casos) {
        G.inventory[campo] = 1;
        QA.tick(1);
        const entrou = T.visivel(act);
        const outros = casos.filter(c => c[0] !== act).map(c => T.visivel(c[0]));
        G.inventory[campo] = 0;
        QA.tick(1);
        out.push({ act, entrou, outros, saiu: !T.visivel(act) });
      }
      return out;
    }, vazio.toString());
    for (const c of r) {
      assert.equal(c.entrou, true, `${c.act}: o item chegou e o botão não apareceu em 1 quadro`);
      assert.deepEqual(c.outros, [false, false], `${c.act}: acender um botão acendeu outro`);
      assert.equal(c.saiu, true, `${c.act}: o item acabou e o botão ficou na tela`);
    }
  });

  it('dado um veículo ao alcance, então USAR aparece no máximo 1 quadro depois do #prompt (e some ao sair)', async () => {
    const r = await play(vazioSrc => {
      new Function(`return (${vazioSrc})`)()();
      const QA = window.QA, G = QA.G, T = window.TQC;
      G.teleportToCar();
      let acendeu = -1, apareceu = -1;
      for (let f = 1; f <= 8 && (acendeu < 0 || apareceu < 0); f++) {
        QA.tick(1);
        if (acendeu < 0 && T.promptAceso()) acendeu = f;
        if (apareceu < 0 && T.visivel('use')) apareceu = f;
      }
      QA.reset();
      let apagou = -1, sumiu = -1;
      for (let f = 1; f <= 8 && (apagou < 0 || sumiu < 0); f++) {
        QA.tick(1);
        if (apagou < 0 && !T.promptAceso()) apagou = f;
        if (sumiu < 0 && !T.visivel('use')) sumiu = f;
      }
      return { acendeu, apareceu, apagou, sumiu };
    }, vazio.toString());
    assert.ok(r.acendeu > 0, 'cenário inválido: o #prompt nunca acendeu perto do carro');
    assert.ok(r.apareceu > 0, 'o #prompt acendeu e o USAR nunca apareceu');
    assert.ok(r.apareceu - r.acendeu <= 1, `USAR apareceu ${r.apareceu - r.acendeu} quadros depois do #prompt`);
    assert.ok(r.apagou > 0 && r.sumiu > 0, 'saiu de perto e o USAR ficou');
    assert.ok(r.sumiu - r.apagou <= 1, `USAR sumiu ${r.sumiu - r.apagou} quadros depois do #prompt`);
  });

  it('dados todos os estados, então os botões que ficam NÃO mudam de lugar', async () => {
    const r = await play(vazioSrc => {
      new Function(`return (${vazioSrc})`)()();
      const QA = window.QA, G = QA.G, T = window.TQC;
      const nada = T.rects();
      G.inventory.meat = 2; G.inventory.medkits = 1; G.inventory.nades = 2;
      G.teleportToCar();
      QA.tick(4);
      const tudo = T.rects();
      const acesos = ['use', 'eat', 'med', 'nade'].map(a => T.visivel(a));
      G.inventory.meat = 0; G.inventory.nades = 0;
      QA.tick(2);
      const meio = T.rects();
      return { nada, tudo, meio, acesos };
    }, vazio.toString());
    assert.deepEqual(r.acesos, [true, true, true, true], 'cenário inválido: o estado "tudo serve" não acendeu os quatro');
    assert.deepEqual(r.tudo, r.nada, 'um botão andou de lugar quando os contextuais apareceram');
    assert.deepEqual(r.meio, r.nada, 'um botão andou de lugar com metade dos contextuais');
  });

  it('dado o dedo SEGURANDO COMER e a última carne acabando, então o botão fica até o dedo sair', async () => {
    const r = await play(vazioSrc => {
      new Function(`return (${vazioSrc})`)()();
      const QA = window.QA, G = QA.G, T = window.TQC;
      G.inventory.meat = 1;
      QA.MP.player.health = 40;
      QA.tick(1);
      const el = T.btn('eat'), rc = el.getBoundingClientRect();
      const x = rc.left + rc.width / 2, y = rc.top + rc.height / 2;
      const alvo = document.elementFromPoint(x, y);
      T.evt(alvo, 'pointerdown', 61, x, y);
      QA.tick(3);                               // o KeyF come a carne: acabou
      const comeu = G.inventory.meat === 0;
      const durante = T.visivel('eat');
      T.evt(alvo, 'pointerup', 61, x, y);
      const tecla = !!G.keys.KeyF;
      QA.tick(1);
      return { alvoOk: alvo === el, comeu, durante, depois: T.visivel('eat'), tecla };
    }, vazio.toString());
    assert.equal(r.alvoOk, true, 'cenário inválido: o dedo não caiu no COMER');
    assert.equal(r.comeu, true, 'cenário inválido: a carne não foi comida');
    assert.equal(r.durante, true, 'o COMER sumiu com o dedo em cima (o gesto perdeu o botão)');
    assert.equal(r.tecla, false, 'KeyF ficou presa');
    assert.equal(r.depois, false, 'soltou o dedo e o COMER sem carne ficou na tela');
  });

  it('dado o lugar de um botão escondido, então o dedo ali NÃO emite a tecla dele', async () => {
    const r = await play(vazioSrc => {
      new Function(`return (${vazioSrc})`)()();
      const QA = window.QA, T = window.TQC;
      const vistos = [];
      const espia = e => vistos.push(e.code);
      window.addEventListener('keydown', espia);
      const out = {};
      try {
        for (const [act, code] of [['use', 'KeyE'], ['eat', 'KeyF'], ['med', 'KeyQ'], ['nade', 'KeyG']]) {
          const el = T.btn(act), rc = el.getBoundingClientRect();
          const x = rc.left + rc.width / 2, y = rc.top + rc.height / 2;
          const alvo = document.elementFromPoint(x, y);
          T.evt(alvo, 'pointerdown', 70, x, y);
          T.evt(alvo, 'pointerup', 70, x, y);
          /* dublê: despachado DIRETO no botão escondido, ele também recusa */
          T.evt(el, 'pointerdown', 71, x, y);
          T.evt(el, 'pointerup', 71, x, y);
          QA.tick(1);
          out[act] = vistos.includes(code);
        }
      } finally { window.removeEventListener('keydown', espia); }
      return out;
    }, vazio.toString());
    for (const act of CONTEXTUAIS) assert.equal(r[act], false, `tocar o lugar do ${act} escondido emitiu a tecla`);
  });

  it('dado o celular, então nenhum erro de página apareceu', () => {
    assert.deepEqual(h.pageErrors, [], `erros de página: ${h.pageErrors.join(' | ')}`);
  });
});

/* BR DE VERDADE: o baú é do br-game.js (loop próprio, rAF), e o botão USAR
   tem de aparecer com o baú ao alcance mesmo sem nenhum #prompt do
   js/interact.js. A âncora é a distância do jogador ao baú na lista do
   próprio BR (`__BR_debug.crates`), medida no teste. */
describe('C8 — USAR com baú no Battle Royale', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, bot;
  before(async () => {
    h = await bootGame({ port: PORT_BR, query: '?mobile=1', viewport: PHONE });
    await h.play(instalar);
    bot = await startBRMatch(h);
  });
  after(async () => {
    if (bot) bot.close();
    if (h) await h.close();
  });
  const doisQuadros = () => h.play(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

  it('dado um baú fechado ao alcance, então USAR aparece; longe dele, some', async () => {
    const perto = await h.play(() => {
      const QA = window.QA, G = QA.G, D = window.__BR_debug;
      G.inventory.meat = 0; G.inventory.medkits = 0; G.inventory.nades = 0;
      const c = D.crates.find(k => !k.opened);
      if (!c) return { semBau: true };
      window.__qaBau = c;
      QA.MP.player.pos.set(c.x + 1.2, c.g.position.y, c.z);
      QA.MP.player.vel.set(0, 0, 0);
      return { semBau: false };
    });
    assert.equal(perto.semBau, false, 'cenário inválido: nenhum baú fechado no mapa');
    await doisQuadros();
    const a = await h.play(() => {
      const QA = window.QA, c = window.__qaBau, P = QA.MP.player.pos;
      QA.tick(1);
      return { d: Math.hypot(P.x - c.x, P.z - c.z), usar: window.TQC.visivel('use'),
        prompt: window.TQC.promptAceso() };
    });
    await h.play(() => { window.QA.reset(30, 30); });
    await doisQuadros();
    const b = await h.play(() => {
      const QA = window.QA, c = window.__qaBau, P = QA.MP.player.pos;
      QA.tick(1);
      return { d: Math.hypot(P.x - c.x, P.z - c.z), usar: window.TQC.visivel('use') };
    });
    console.log(`  [C8] baú a ${a.d.toFixed(2)} m: USAR ${a.usar ? 'na tela' : 'fora'}; ` +
      `a ${b.d.toFixed(1)} m: USAR ${b.usar ? 'na tela' : 'fora'}`);
    assert.ok(a.d < 2.4, `cenário inválido: o jogador ficou a ${a.d} m do baú`);
    assert.equal(a.prompt, false, 'cenário inválido: o #prompt do interact acendeu (o caso é o baú)');
    assert.equal(a.usar, true, 'baú fechado ao alcance e o USAR não apareceu');
    assert.ok(b.d > 5, `cenário inválido: o jogador ficou a ${b.d} m do baú`);
    assert.equal(b.usar, false, 'longe do baú e o USAR continuou na tela');
  });

  it('dado o BR no celular, então nenhum erro de página apareceu', () => {
    assert.deepEqual(h.pageErrors, [], `erros de página: ${h.pageErrors.join(' | ')}`);
  });
});
