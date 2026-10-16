/* ================================================================
   O ≡ SEGURA A PAUSA COM O TOQUE DE VERDADE — laudo 1ae1a81, §A.5 (C9, E9).

   O ≡ pausa na DESCIDA do dedo, e o #overlay aparece no mesmo quadro. O
   `preventDefault()` do `pointerdown` corta o mouse de compatibilidade, mas
   NÃO o `click` do toque: o navegador o manda, depois do `pointerup`, para o
   que estiver no TOPO naquele ponto — já o #overlay, cujo `click` retoma.
   Medido em r16: em 844×390, 932×430, 1180×820 e no retrato a pausa durava
   4–11 ms; em 667×375 o mesmo `click` caía no CONFIGURAÇÕES.

   O dedo é o `Input.dispatchTouchEvent` do DevTools (gera pointer, touch e o
   `click` do gesto, como o aparelho). Um `PointerEvent` despachado à mão NÃO
   gera o `click` — é por isso que `touch-controls` ficava verde.

   Âncora independente do estado do jogo: o #overlay com ÁREA na tela e o
   painel de configurações sem área.

   Porta 4170.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');

const PORT = 4170;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VIEWPORTS = [
  { nome: 'V1 667×375', width: 667, height: 375 },
  { nome: 'V2 800×360', width: 800, height: 360 },
  { nome: 'V3 844×390', width: 844, height: 390 },
  { nome: 'V4 932×430', width: 932, height: 430 },
  { nome: 'V5 1180×820', width: 1180, height: 820 },
];

function criarDedo(cdp) {
  const um = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 5, radiusY: 5, force: 1 }] });
  return {
    async tap(x, y, ms = 80) { await um('touchStart', x, y); await sleep(ms); await um('touchEnd', x, y); },
  };
}

/* só leitura */
function leitura() {
  const area = el => {
    if (!el) return 0;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return 0;
    const r = el.getBoundingClientRect();
    return r.width * r.height;
  };
  const b = document.querySelector('.tcBtn[data-act="pause"]');
  const r = b ? b.getBoundingClientRect() : null;
  return {
    paused: window.__game.state.paused,
    overlay: area(document.getElementById('overlay')),
    settings: area(document.getElementById('settings')),
    btn: r && r.width > 0 && area(b) > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null,
  };
}

describe('o ≡ tocado de verdade segura a pausa', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, dedo;
  before(async () => {
    h = await bootGame({ port: PORT, query: '?mobile=1', autoStart: false, online: false,
      viewport: { width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } });
    dedo = criarDedo(await h.page.target().createCDPSession());
    const b = await h.play(() => { const r = document.getElementById('btnNew').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await dedo.tap(b.x, b.y);
    await h.page.waitForFunction('window.__game.state.started && !window.__game.state.paused', { timeout: 15000 });
    await h.play(() => { for (const e of window.__game.Enemies.list) { e.alive = false; if (e.group) e.group.visible = false; } });
  });
  after(async () => { if (h) await h.close(); });

  /* volta a jogar SEM mexer no estado: um toque no canto de cima à esquerda
     do #overlay (fora do #menuBtns), como o jogador faz */
  async function retomar() {
    for (let i = 0; i < 4; i++) {
      const r = await h.play(leitura);
      if (!r.paused) return;
      if (r.settings > 0) {
        // configurações abertas (por um caso anterior): VOLTAR, rolado até a
        // vista e tocado, como o jogador faz
        const v = await h.play(() => { const b = document.getElementById('btnBack'); b.scrollIntoView({ block: 'center' }); const e = b.getBoundingClientRect(); return { x: e.left + e.width / 2, y: e.top + e.height / 2 }; });
        await dedo.tap(v.x, v.y);
      } else await dedo.tap(12, 12);
      await sleep(300);
    }
    assert.fail('cenário: não consegui retomar a partida pelo toque');
  }

  for (const vp of VIEWPORTS) {
    for (const ms of [80, 600]) {
      it(`${vp.nome}, toque de ${ms} ms no ≡: pausa e FICA pausado, sem abrir as configurações`, async t => {
        await h.page.setViewport({ width: vp.width, height: vp.height, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
        await sleep(400);
        await retomar();
        const antes = await h.play(leitura);
        assert.ok(antes.btn, `cenário: o ≡ não está na tela em ${vp.nome}`);
        await dedo.tap(antes.btn.x, antes.btn.y, ms);
        await sleep(700);
        const r = await h.play(leitura);
        t.diagnostic(`≡ em (${antes.btn.x.toFixed(0)}, ${antes.btn.y.toFixed(0)}); 0,7 s depois: paused=${r.paused}, #overlay ${r.overlay.toFixed(0)} px², #settings ${r.settings.toFixed(0)} px²`);
        assert.equal(r.paused, true, 'o mesmo toque do ≡ retomou a partida');
        assert.ok(r.overlay > 0, 'a tela de pausa não está na tela');
        assert.equal(r.settings, 0, 'o toque do ≡ abriu as configurações');
      });
    }
  }

  it('o avesso: logo depois do ≡, um NOVO toque no mesmo ponto retoma (V3)', async () => {
    await h.page.setViewport({ width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await sleep(400);
    await retomar();
    const a = await h.play(leitura);
    await dedo.tap(a.btn.x, a.btn.y);
    await sleep(300);
    assert.equal((await h.play(leitura)).paused, true, 'cenário: o ≡ não pausou');
    await dedo.tap(a.btn.x, a.btn.y);
    await sleep(400);
    assert.equal((await h.play(leitura)).paused, false, 'o toque seguinte, no mesmo ponto, não retomou');
  });

  it('o avesso: ≡ ARRASTADO para fora (sem click do gesto) e logo um toque no mesmo ponto — retoma (V3)', async t => {
    await h.page.setViewport({ width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await sleep(400);
    await retomar();
    const a = await h.play(leitura);
    const cdp = await h.page.target().createCDPSession();
    const p = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 2, radiusX: 5, radiusY: 5, force: 1 }] });
    await p('touchStart', a.btn.x, a.btn.y);
    for (let k = 1; k <= 6; k++) { await sleep(16); await p('touchMove', a.btn.x - 12 * k, a.btn.y); }
    await p('touchEnd', a.btn.x - 72, a.btn.y);
    await sleep(150);
    const meio = await h.play(leitura);
    assert.equal(meio.paused, true, 'cenário: o ≡ arrastado não pausou (ou o gesto gerou click e retomou)');
    await dedo.tap(a.btn.x, a.btn.y);
    await sleep(400);
    const r = await h.play(leitura);
    t.diagnostic(`depois do ≡ arrastado, o toque no mesmo ponto: paused=${r.paused}`);
    assert.equal(r.paused, false, 'o toque seguinte no lugar do ≡ foi engolido');
  });

  it('o avesso: o click do toque que cai no PRÓPRIO botão segue (é o gesto que destrava o áudio)', async () => {
    await h.page.setViewport({ width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await sleep(400);
    await retomar();
    const b = await h.play(() => {
      window.__clicksNoBotao = 0;
      document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.tcBtn[data-act="reload"]')) window.__clicksNoBotao++; });
      const r = document.querySelector('.tcBtn[data-act="reload"]').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
    });
    assert.ok(b.w > 0, 'cenário: o RECARREGAR não está na tela');
    await dedo.tap(b.x, b.y);
    await sleep(300);
    assert.equal(await h.play(() => window.__clicksNoBotao), 1, 'o click do toque no próprio botão não chegou ao documento');
  });

  it('retrato liberado (390×844, JOGAR ASSIM tocado): o ≡ segura a pausa', async t => {
    await h.page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await sleep(500);
    const g = await h.play(() => {
      const b = document.getElementById('rgPlay');
      const r = b && b.getBoundingClientRect();
      return r && r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    });
    if (g) { await dedo.tap(g.x, g.y); await sleep(500); }
    await retomar();
    const antes = await h.play(leitura);
    assert.ok(antes.btn, 'cenário: o ≡ não está na tela em retrato');
    await dedo.tap(antes.btn.x, antes.btn.y);
    await sleep(700);
    const r = await h.play(leitura);
    t.diagnostic(`retrato: paused=${r.paused}, #overlay ${r.overlay.toFixed(0)} px²`);
    assert.equal(r.paused, true, 'o mesmo toque do ≡ retomou a partida em retrato');
    assert.equal(r.settings, 0);
  });

  it('boot limpo: sem erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
