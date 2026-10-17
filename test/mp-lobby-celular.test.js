/* ================================================================
   NO LOBBY DO CELULAR, A SALA E O COMEÇAR APARECEM SEM ROLAR — auditoria
   do multiplayer 338d153, MQ-3.

   A 800×360 o cartão do lobby rola dentro de ~300 px, e na ordem do desktop
   (nick, cores, prévia) a lista NA SALA ficava em y 550–634 e o botão
   COMEÇAR/AGUARDANDO em 646–706: o dono, de celular, não via quem estava na
   sala nem o botão de começar sem rolar o cartão.

   O caminho é o REAL: o MULTIJOGADOR tocado (Input.dispatchTouchEvent).
   Âncora: a área VISÍVEL do cartão (o retângulo dele na tela, com a rolagem
   no começo) e a janela — não a ordem do HTML.

   Porta 4180.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');

const PORT = 4180;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function caixas() {
  const card = document.querySelector('#mpPanel .brCard');
  const r = el => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: b.height }; };
  return {
    card: card ? r(card) : null, rolagem: card ? card.scrollTop : null, janela: innerHeight,
    lista: r(document.getElementById('brLobbyList')),
    botao: r(document.getElementById('brStartBtn')),
    nick: r(document.getElementById('brNick')),
  };
}

describe('lobby do celular: a sala e o COMEÇAR à vista', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: PORT, query: '?mobile=1', autoStart: false,
      viewport: { width: 800, height: 360, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } });
  });
  after(async () => { if (h) await h.close(); });

  it('800×360, MULTIJOGADOR tocado: a lista NA SALA e o botão cabem na área visível do cartão', async t => {
    await h.page.waitForFunction('!document.getElementById("btnMulti").classList.contains("disabled")', { timeout: 60000 });
    const cdp = await h.page.target().createCDPSession();
    const b = await h.play(() => { const r = document.getElementById('btnMulti').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const toque = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    await toque('touchStart', [{ x: Math.round(b.x), y: Math.round(b.y), id: 1, radiusX: 5, radiusY: 5, force: 1 }]);
    await sleep(80);
    await toque('touchEnd', []);
    await h.page.waitForFunction('document.getElementById("brLobbyList") && document.getElementById("brLobbyList").getBoundingClientRect().height > 0', { timeout: 20000 });
    await sleep(400);
    const c = await h.play(caixas);
    t.diagnostic(JSON.stringify(c));
    assert.ok(c.card, 'cenário: o cartão do lobby não está na tela');
    assert.equal(c.rolagem, 0, 'cenário: o cartão já abriu rolado');
    const fundo = Math.min(c.card.bottom, c.janela);
    assert.ok(c.lista.top >= c.card.top && c.lista.bottom <= fundo, `a lista NA SALA está fora da vista (y ${c.lista.top.toFixed(0)}–${c.lista.bottom.toFixed(0)}, visível até ${fundo.toFixed(0)})`);
    assert.ok(c.botao.top >= c.card.top && c.botao.bottom <= fundo, `o COMEÇAR está fora da vista (y ${c.botao.top.toFixed(0)}–${c.botao.bottom.toFixed(0)}, visível até ${fundo.toFixed(0)})`);
  });

  it('o avesso: no desktop a ordem não muda (o nick vem antes da sala)', async () => {
    const page = await h.browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`http://localhost:${PORT}/?tier=baixo`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction('window.__MP_lobby && document.getElementById("brNick")', { timeout: 90000 });
      await page.evaluate(() => window.__MP_lobby.show());
      await sleep(300);
      const c = await page.evaluate(caixas);
      assert.ok(c.nick.h > 0 && c.lista.h > 0, 'cenário: o lobby não apareceu no desktop');
      assert.ok(c.nick.top < c.lista.top, 'no desktop a sala passou para antes do nick');
    } finally { await page.close(); }
  });
});
