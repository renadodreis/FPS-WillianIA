/* ================================================================
   C2 — TODO ALVO DE TOQUE TEM ≥ 44 × 44 px CSS (docs/mobile/criterio-aaa.md)
   C3 — a barra de ARMAS (C7) não cobre HUD essencial nem controle.

   Fonte do limiar: Apple HIG, "a button needs a hit region of at least 44x44
   pt"; WCAG 2.2 2.5.5 (AAA), "at least 44 by 44 CSS pixels" (referência
   §4.6). REGIÃO DE TOQUE, não desenho.

   A MEDIDA É A DO VALIDADOR, não a do CSS: para cada controle visível, uma
   grade de 2 px de `elementFromPoint` sobre o retângulo dele, e o maior
   quadrado contido em que o ponto devolve o próprio controle (ou um filho).
   Ler `width`/`min-height` do CSS diria 48 px para o botão de cantos de 14 px
   que o validador mediu com 40 — o raio recorta o hit test, e o CSS não sabe.

   Estados cobertos: partida BR (cluster com os contextuais acesos, 2º ATIRAR
   ligado, as 8 armas destrancadas) em V1–V5 e no retrato liberado; ajustes
   com a seção de toque; lobby do BR. Viewports da régua: V1 667×375, V2
   800×360, V3 844×390, V4 932×430, V5 1180×820, VR 390×844 — todos com
   hasTouch/isMobile (trocar só largura/altura não recria o contexto).

   Porta: 4013.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness.js');

const PORT = 4013;
const BASE = { hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const PAISAGEM = {
  V1: { width: 667, height: 375 }, V2: { width: 800, height: 360 }, V3: { width: 844, height: 390 },
  V4: { width: 932, height: 430 }, V5: { width: 1180, height: 820 },
};
const RETRATO = { width: 390, height: 844 };

function instalar() {
  /* maior quadrado (px) em que elementFromPoint devolve `el` ou um filho */
  function quadradoUtil(el) {
    const r = el.getBoundingClientRect();
    const passo = 2;
    const nx = Math.floor(r.width / passo), ny = Math.floor(r.height / passo);
    if (nx <= 0 || ny <= 0) return 0;
    let melhor = 0;
    let ant = new Array(nx).fill(0), cur = new Array(nx).fill(0);
    for (let j = 0; j < ny; j++) {
      const y = r.top + passo * j + passo / 2;
      for (let i = 0; i < nx; i++) {
        const x = r.left + passo * i + passo / 2;
        const hit = document.elementFromPoint(x, y);
        const ok = !!hit && (hit === el || el.contains(hit));
        cur[i] = ok ? 1 + Math.min(i ? cur[i - 1] : 0, ant[i], i ? ant[i - 1] : 0) : 0;
        if (cur[i] > melhor) melhor = cur[i];
      }
      const t = ant; ant = cur; cur = t;
    }
    return melhor * passo;
  }
  const visivel = el => {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility === 'visible' && r.width > 1 && r.height > 1 &&
      !el.closest('[hidden]');
  };
  const nome = el => el.id ? '#' + el.id
    : (el.dataset && (el.dataset.act || el.dataset.slot || el.dataset.p || el.dataset.i))
      ? `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}[${el.dataset.act || el.dataset.slot || el.dataset.p || el.dataset.i}]`
      : el.tagName.toLowerCase() + '.' + (el.className || '').split(' ')[0];
  window.TQA_alvo = {
    quadradoUtil, visivel, nome,
    /* mede todos os seletores visíveis; `rolar` põe cada um no meio da vista
       antes (menu e lobby rolam) */
    medir(sel, rolar) {
      const out = [];
      for (const el of document.querySelectorAll(sel)) {
        if (rolar) el.scrollIntoView({ block: 'center', inline: 'center' });
        if (!visivel(el)) continue;
        out.push({ nome: nome(el), px: quadradoUtil(el) });
      }
      return out;
    },
    rect(sel) {
      const el = document.querySelector(sel);
      if (!el || !visivel(el)) return null;
      const r = el.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    },
  };
}

/* estado "tudo na tela": contextuais acesos, 2º ATIRAR ligado, 8 armas */
function tudoNaTela() {
  const QA = window.QA, G = QA.G;
  for (const w of G.arsenal) w.locked = false;
  G.inventory.meat = 2; G.inventory.medkits = 1; G.inventory.nades = 2;
  const fl = document.getElementById('setTFireL');
  if (fl.value !== '1') { fl.value = '1'; fl.dispatchEvent(new Event('change')); }
  G.teleportToCar();
  QA.tick(4);
}

describe('C2/C3 — alvos de toque e a barra de armas', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, bot;
  before(async () => {
    h = await bootGame({ port: PORT, query: '?mobile=1', viewport: { ...PAISAGEM.V3, ...BASE } });
    await h.play(instalar);
    bot = await startBRMatch(h);
  });
  after(async () => {
    if (bot) bot.close();
    if (h) await h.close();
  });
  const play = (fn, ...args) => h.play(fn, ...args);
  const tela = async vp => { await h.page.setViewport({ ...vp, ...BASE }); };

  it('dado a partida em cada paisagem (V1–V5), então todo controle de toque tem ≥ 44 px úteis', async () => {
    const falhas = [];
    for (const [nomeVp, vp] of Object.entries(PAISAGEM)) {
      await tela(vp);
      const r = await play(tudoSrc => {
        new Function(`return (${tudoSrc})`)()();
        const A = window.TQA_alvo;
        const ctx = ['use', 'eat', 'med', 'nade'].map(a => A.visivel(document.querySelector(`.tcBtn[data-act="${a}"]`)));
        return { ctx, medidas: A.medir('#tcBtns .tcBtn, #tcBtnsL .tcBtn, #tcArmas .tcArma') };
      }, tudoNaTela.toString());
      assert.deepEqual(r.ctx, [true, true, true, true], `${nomeVp}: cenário inválido — os contextuais não acenderam`);
      assert.ok(r.medidas.length >= 15 + 8, `${nomeVp}: só ${r.medidas.length} controles medidos`);
      const min = r.medidas.reduce((m, x) => (x.px < m.px ? x : m));
      console.log(`  [C2] ${nomeVp} ${vp.width}×${vp.height}: ${r.medidas.length} controles, menor ${min.px} px (${min.nome})`);
      for (const m of r.medidas) if (m.px < 44) falhas.push(`${nomeVp} ${m.nome}: ${m.px} px`);
    }
    assert.deepEqual(falhas, [], `alvos abaixo de 44 px:\n${falhas.join('\n')}`);
  });

  it('dado o retrato liberado (390×844), então todo controle de toque tem ≥ 44 px úteis', async () => {
    await tela(RETRATO);
    const r = await play(tudoSrc => {
      const QA = window.QA, G = QA.G;
      G.Orient.allowPortrait();
      if (G.state.paused) document.getElementById('overlay').click();
      new Function(`return (${tudoSrc})`)()();
      return { pausado: G.state.paused, medidas: window.TQA_alvo.medir('#tcBtns .tcBtn, #tcBtnsL .tcBtn, #tcArmas .tcArma') };
    }, tudoNaTela.toString());
    assert.equal(r.pausado, false, 'cenário inválido: o retrato liberado não retomou a partida');
    const min = r.medidas.reduce((m, x) => (x.px < m.px ? x : m));
    console.log(`  [C2] VR 390×844: ${r.medidas.length} controles, menor ${min.px} px (${min.nome})`);
    const falhas = r.medidas.filter(m => m.px < 44).map(m => `${m.nome}: ${m.px} px`);
    assert.deepEqual(falhas, [], `retrato: alvos abaixo de 44 px:\n${falhas.join('\n')}`);
  });

  it('dados os controles (barra de armas e 2º ATIRAR inclusos), então nenhum cobre HUD essencial nem outro controle (V1–V5 e retrato)', async () => {
    const falhas = [];
    const vps = { ...PAISAGEM, VR: RETRATO };
    for (const [nomeVp, vp] of Object.entries(vps)) {
      await tela(vp);
      const r = await play((tudoSrc, retrato) => {
        const QA = window.QA, G = QA.G, A = window.TQA_alvo;
        if (retrato) { G.Orient.allowPortrait(); if (G.state.paused) document.getElementById('overlay').click(); }
        new Function(`return (${tudoSrc})`)()();
        /* HUD cheio: 5 abates no killfeed, e o HUD do SOLO (pontos, missão)
           forçado a aparecer — ele divide o canto com a barra fora do BR */
        for (let i = 0; i < 5; i++) QA.MP.addKillFeed(`<b>Jogador${i}</b> ☠ Alvo${i}`);
        const solo = ['score', 'mission'].map(id => document.getElementById(id));
        const antes = solo.map(e => e.style.display);
        for (const e of solo) e.style.display = 'block';
        const inv = document.getElementById('invPanel');
        G.Interact.renderInv();
        const essenciais = ['#healthWrap', '#inv', '#minimapWrap', '#brTop', '#brZoneMap', '#brRoster',
          '#bossWrap', '#brBossBar', '#prompt', '#brHint', '#ammoWrap', '#killfeed', '#brChat', '#fps',
          '#score', '#mission'];
        /* os CONTROLES de toque, cada um contra o HUD essencial e contra os
           outros controles (a barra nova e o 2º ATIRAR são os que mudaram) */
        const controles = ['#tcArmas', '#tcBtnsL', '#tcBtns', '#tcMove'];
        const barra = A.rect('#tcArmas');
        const area = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) *
          Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
        const cobre = [];
        for (let i = 0; i < controles.length; i++) {
          const c = A.rect(controles[i]);
          if (!c) continue;
          for (const s of [...essenciais, ...controles.slice(i + 1)]) {
            const q = A.rect(s);
            if (q && area(c, q) > 0) cobre.push(`${controles[i]} × ${s}: ${Math.round(area(c, q))} px²`);
          }
        }
        inv.classList.add('open');
        const qi = A.rect('#invPanel');
        for (const s of controles) {
          const c = A.rect(s);
          if (qi && c && area(c, qi) > 0) cobre.push(`${s} × #invPanel aberto: ${Math.round(area(c, qi))} px²`);
        }
        inv.classList.remove('open');
        solo.forEach((e, i) => { e.style.display = antes[i]; });
        /* o centro de cada ícone destrancado recebe o próprio ícone */
        const tampados = [];
        for (const c of document.querySelectorAll('#tcArmas .tcArma:not(.tranc)')) {
          const b = c.getBoundingClientRect();
          const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          if (!hit || (hit !== c && !c.contains(hit))) tampados.push(`arma ${c.dataset.slot}`);
        }
        const dentro = barra && barra.l >= 0 && barra.t >= 0 && barra.r <= innerWidth && barra.b <= innerHeight;
        return { barra, cobre, tampados, dentro };
      }, tudoNaTela.toString(), nomeVp === 'VR');
      assert.ok(r.barra, `${nomeVp}: cenário inválido — a barra de armas não está na tela`);
      if (!r.dentro) falhas.push(`${nomeVp}: a barra sai da tela ${JSON.stringify(r.barra)}`);
      for (const c of r.cobre) falhas.push(`${nomeVp}: cobre ${c}`);
      for (const t of r.tampados) falhas.push(`${nomeVp}: ${t} tampada`);
    }
    await tela(PAISAGEM.V3);
    await play(() => { window.QA.G.Orient.revokePortrait(); });
    assert.deepEqual(falhas, [], falhas.join('\n'));
  });

  it('dados os ajustes (seção de toque, com RESTAURAR), então todo controle tem ≥ 44 px úteis', async () => {
    const falhas = [];
    for (const [nomeVp, vp] of [['V2', PAISAGEM.V2], ['V1', PAISAGEM.V1], ['VR', RETRATO]]) {
      await tela(vp);
      const r = await play(retrato => {
        const G = window.QA.G;
        if (retrato) G.Orient.allowPortrait();
        G.setPaused(true);
        G.MENU.open('settings');
        const m = window.TQA_alvo.medir('#settings select, #settings input, #settings button, #settings .mbtn', true);
        G.MENU.close();
        document.getElementById('overlay').click();
        return { m, reset: m.some(x => x.nome === '#setTReset') };
      }, nomeVp === 'VR');
      assert.equal(r.reset, true, `${nomeVp}: o botão RESTAURAR PADRÃO não está nos ajustes`);
      const min = r.m.reduce((a, x) => (x.px < a.px ? x : a));
      console.log(`  [C2] ajustes ${nomeVp}: ${r.m.length} controles, menor ${min.px} px (${min.nome})`);
      for (const x of r.m) if (x.px < 44) falhas.push(`${nomeVp} ${x.nome}: ${x.px} px`);
    }
    await tela(PAISAGEM.V3);
    await play(() => { window.QA.G.Orient.revokePortrait(); });
    assert.deepEqual(falhas, [], `ajustes abaixo de 44 px:\n${falhas.join('\n')}`);
  });

  it('dado o lobby do BR, então todo alvo (nick, cores, paletas, regras, anfitrião) tem ≥ 44 px úteis', async () => {
    const falhas = [];
    for (const [nomeVp, vp] of [['V2', PAISAGEM.V2], ['V1', PAISAGEM.V1], ['VR', RETRATO]]) {
      await tela(vp);
      const r = await play(retrato => {
        const G = window.QA.G;
        if (retrato) G.Orient.allowPortrait();
        G.setPaused(true);
        window.__MP_lobby.show();
        const m = window.TQA_alvo.medir('#brLobby input, #brLobby select, #brLobby button, #btnMpBack', true);
        const tipos = {
          preset: m.filter(x => /brPreset/.test(x.nome)).length,
          cor: m.filter(x => /brCol4/.test(x.nome)).length,
          regra: m.filter(x => /^#fg/.test(x.nome)).length,
        };
        G.MENU.close();
        document.getElementById('overlay').click();
        return { m, tipos };
      }, nomeVp === 'VR');
      assert.ok(r.tipos.preset >= 6 && r.tipos.cor === 4 && r.tipos.regra >= 5,
        `${nomeVp}: cenário inválido — lobby sem paletas/cores/regras (${JSON.stringify(r.tipos)})`);
      const min = r.m.reduce((a, x) => (x.px < a.px ? x : a));
      console.log(`  [C2] lobby ${nomeVp}: ${r.m.length} alvos, menor ${min.px} px (${min.nome})`);
      for (const x of r.m) if (x.px < 44) falhas.push(`${nomeVp} ${x.nome}: ${x.px} px`);
    }
    await tela(PAISAGEM.V3);
    await play(() => { window.QA.G.Orient.revokePortrait(); });
    assert.deepEqual(falhas, [], `lobby abaixo de 44 px:\n${falhas.join('\n')}`);
  });

  it('dado o percurso, então nenhum erro de página apareceu', () => {
    assert.deepEqual(h.pageErrors, [], `erros de página: ${h.pageErrors.join(' | ')}`);
  });
});
