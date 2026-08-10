'use strict';
/* ================================================================
   QA — O VISUAL DO MENU ÚNICO (style.css)

   As rodadas de FLUXO (dc8925c, 3704cc3, 0ffff05) criaram os ganchos e
   deixaram o visual de fora de propósito. Este arquivo prende o que o
   visual passou a prometer — e, principalmente, as três armadilhas que
   um CSS de menu tem:

   1. PAINEL QUE NÃO FECHA. #mpPanel, #deathBtns, #pausedWarn e
      #menuNotice são alternados pelo ATRIBUTO `hidden`, não por classe.
      Qualquer `display` novo neles precisa da regra `[hidden]` junto,
      senão o painel nasce impossível de fechar — e o sintoma que chega
      ao dono é "o menu travou", não "faltou uma linha de CSS".
   2. CARREGANDO CONFUNDIDO COM DESABILITADO. Os dois usavam
      `.mbtn.disabled` (opacity .45), então o botão principal ficava
      cinza nos ~30 s de boot e parecia quebrado. O CSS separa os dois
      lendo `#btnSettings.disabled` — que o paintMenu (game.js) trava
      por UM motivo só, `!MenuGate.wired`. Esse acoplamento é
      verificado AQUI, no fonte: se o game.js mudar a regra, quem
      falha é este teste, não o jogador.
   3. PAUSA QUE COBRE A PARTIDA. Em BR a partida é do servidor e não
      para (docs/2026-08-09-menu-unico.md). `#overlay.brlive` existe
      para o painel NÃO cobrir a tela.

   Este arquivo NÃO sobe o jogo: serve index.html + style.css + o CSS
   que o multiplayer-client.js injeta (extraído do fonte, na mesma
   ordem de cascata) e aplica os estados à mão. Sem WebGL, sem
   worldgen, sem porta de servidor — roda em segundos e não colide com
   nada. O preço é não exercitar o JS; por isso os contratos com o
   game.js são checados no FONTE, acima.
   ================================================================ */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CHROME } = require('./helpers/harness');

const raiz = path.join(__dirname, '..');
const leia = f => fs.readFileSync(path.join(raiz, f), 'utf8');
const css = leia('style.css');

/* ---------------- contratos de fonte (sem navegador) ---------------- */

describe('style.css — armadilhas do menu único (fonte)', () => {
  it('dado todo painel alternado por `hidden`, então o style.css declara [hidden]', () => {
    /* A regra do navegador (`[hidden] { display: none }`) tem
       especificidade de tipo: QUALQUER `display` com id vence dela. */
    for (const id of ['mpPanel', 'deathBtns', 'pausedWarn', 'menuNotice']) {
      const temDisplay = new RegExp(`#${id}\\s*\\{[^}]*display\\s*:`).test(css);
      const temGuarda = new RegExp(`#${id}\\[hidden\\]\\s*\\{[^}]*display\\s*:\\s*none`).test(css);
      if (!temDisplay) continue; // sem display próprio, o do navegador basta
      assert.ok(temGuarda,
        `#${id} ganhou \`display\` no style.css sem \`#${id}[hidden] { display: none }\` — ` +
        'o JS alterna esse painel pelo ATRIBUTO, então ele nunca mais fecharia');
    }
  });

  it('dado o modo celular, então nenhuma regra reintroduz backdrop-filter', () => {
    /* backdrop-filter é leitura do framebuffer inteiro por frame. A rodada
       de celular tirou TODOS do caminho do aparelho; nada pode trazer de
       volta — nem por `html.mobile`, nem pela rede de segurança de
       `(pointer: coarse)`. O desktop pode continuar com blur nos cartões
       pequenos (#controls, #settings), que é o que o topo do arquivo diz. */
    const limpo = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const suspeitas = [];
    for (const m of limpo.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim(), decls = m[2];
      if (!/html\.mobile/.test(sel)) continue;
      if (/backdrop-filter\s*:(?!\s*none)/.test(decls)) suspeitas.push(`${sel} { ${decls.trim()} }`);
    }
    // e o bloco inteiro de (pointer: coarse), por contagem de chaves
    const at = limpo.indexOf('@media (pointer: coarse)');
    if (at >= 0) {
      let i = limpo.indexOf('{', at), nivel = 0, fim = i;
      for (; fim < limpo.length; fim++) {
        if (limpo[fim] === '{') nivel++;
        else if (limpo[fim] === '}' && --nivel === 0) break;
      }
      const bloco = limpo.slice(i, fim);
      if (/backdrop-filter\s*:(?!\s*none)/.test(bloco)) suspeitas.push('@media (pointer: coarse)');
    }
    assert.deepEqual(suspeitas, [],
      `backdrop-filter voltou no celular:\n${suspeitas.join('\n')}`);
  });

  it('dado o CSS do lobby, então as regras de coesão vivem presas ao #mpPanel', () => {
    /* O HUD do BR (#brTop, #brRoster, #brChat, #brToast) é irmão do
       <body>, não do menu: uma regra `.brCard`/`.brBtn` solta no
       style.css atravessaria a partida inteira. (`.brPanel` é o próprio
       #brLobby, que só existe dentro do #mpPanel — esse fica de fora.) */
    const internas = /\.br(Card|Btn|Input|Title|Sub|Row|Col|H|Count|Table|Keys|Players|Dot|Preset)\b/;
    const limpo = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const vazadas = [];
    for (const m of limpo.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      for (const parte of m[1].split(',')) {
        if (internas.test(parte) && !/#mpPanel/.test(parte)) vazadas.push(parte.trim());
      }
    }
    assert.deepEqual(vazadas, [],
      `regra do lobby sem escopo de #mpPanel (vaza pro HUD do BR): ${vazadas.join(' | ')}`);
  });
});

describe('game.js — o sinal que o CSS usa para dizer "carregando" (fonte)', () => {
  const game = leia('game.js');

  it('dado o paintMenu, então #btnSettings só é travado por !MenuGate.wired', () => {
    /* ESTE É O ACOPLAMENTO. O style.css escreve
         #menuBtns:has(#btnSettings.disabled) #btnNew.disabled { ...carregando... }
       porque as CONFIGURAÇÕES travam por um motivo só: os handlers ainda
       não existem. Se este teste cair, o menu não está quebrado — está
       MENTINDO ("carregando" com o mundo pronto), e a correção é trocar
       o seletor por uma classe explícita (`.mbtn.loading`, já estilizada
       no style.css). */
    const m = /cfg\.classList\.toggle\('disabled',\s*([^)]+)\)/.exec(game);
    assert.ok(m, 'paintMenu não trava mais #btnSettings por classe — o CSS lê esse sinal');
    assert.equal(m[1].trim(), '!MenuGate.wired',
      `o sinal de "carregando" mudou de motivo: ${m[1]} — ver o bloco ` +
      '"TRAVADO NÃO É QUEBRADO" em style.css');
    assert.ok(/#btnNew\.loading|\.mbtn\.loading/.test(css),
      'o style.css perdeu o estado .loading — o JS não tem por onde marcar o boot');
  });

  it('dado o paintMenu, então `brlive` continua sendo a marca de partida ao vivo', () => {
    assert.ok(/classList\.toggle\('brlive'/.test(game),
      'ninguém escreve mais #overlay.brlive — o painel de pausa volta a cobrir a partida');
    assert.ok(/#overlay\.brlive/.test(css), 'o style.css não trata #overlay.brlive');
  });
});

/* ---------------- estados no navegador (DOM + CSS puros) ---------------- */

/* CSS injetado em runtime pelo multiplayer-client.js: entra DEPOIS do
   <link> (mesma ordem da página real), senão a cascata do lobby mente. */
function cssDoLobby() {
  const src = leia('multiplayer-client.js');
  const i = src.indexOf('css.textContent = `');
  const j = src.indexOf('`;', i);
  assert.ok(i > 0 && j > i, 'não achei o <style> injetado do lobby em multiplayer-client.js');
  return src.slice(i + 'css.textContent = `'.length, j);
}

const LOBBY_CARD = `<div class="brCard">
  <div class="brTitle">☄ QUEDA LIVRE</div>
  <div class="brSub">BATTLE ROYALE · PARTIDA #1</div>
  <div class="brRow">
    <div class="brCol"><div class="brH">SEU NICK</div>
      <input id="brNick" class="brInput" value="Recruta1">
      <button class="brBtn" id="brStartBtn">COMEÇAR</button></div>
    <div class="brCol"><div class="brH">RANKING</div>
      <table class="brTable"><tr><td>1</td><td>Recruta1</td></tr></table></div>
  </div>
</div>`;

/* Estados do menu, aplicados no DOM como o paintMenu os aplicaria. */
const ESTADOS = {
  boot: () => {},                                  // como o index.html nasce
  pronto: () => {
    for (const id of ['btnNew', 'btnMulti', 'btnSettings'])
      document.getElementById(id).classList.remove('disabled');
  },
  pausaSolo: () => {
    ESTADOS.pronto();
    document.getElementById('btnNew').classList.add('disabled');
    document.getElementById('overlay').classList.add('paused');
  },
  pausaBR: () => {
    ESTADOS.pausaSolo();
    document.getElementById('overlay').classList.add('brlive');
    document.getElementById('pausedWarn').hidden = false;
    document.getElementById('pausedWarn').textContent =
      'A partida é do servidor: o gás, os tiros e o GOLEM não param.';
  },
  lobby: () => {
    ESTADOS.pronto();
    document.getElementById('mpPanel').hidden = false;
    const l = document.getElementById('brLobby');
    l.style.display = 'flex';
    l.innerHTML = window.__CARD;
  },
  morteSolo: () => {
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('deathScreen').classList.add('show');
    document.getElementById('deathBtns').hidden = false;
  },
  aviso: () => {
    ESTADOS.pronto();
    const a = document.getElementById('menuNotice');
    a.hidden = false;
    a.textContent = '⚠ A SALA ONLINE NÃO CARREGOU — DÁ PRA JOGAR SOLO AGORA.';
  },
};

async function abrir(browser, { w, h, dpr = 1, mobile = false, ponteiro = 'fine' }) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr,
    hasTouch: ponteiro === 'coarse', isMobile: mobile });
  /* pointer/any-pointer não estão na lista branca do puppeteer: CDP cru.
     prefers-reduced-motion congela as animações de entrada — sem isso a
     medição pega QUADRO, não estilo. */
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-reduced-motion', value: 'reduce' },
    { name: 'pointer', value: ponteiro },
    { name: 'any-pointer', value: ponteiro },
  ] });
  const html = leia('index.html');
  const folha = leia('style.css');
  await page.setRequestInterception(true);
  page.on('request', req => {
    const u = req.url();
    if (u.endsWith('/index.html')) req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: html }).catch(() => {});
    else if (u.endsWith('/style.css')) req.respond({ status: 200, contentType: 'text/css; charset=utf-8', body: folha }).catch(() => {});
    else req.abort().catch(() => {});   // nenhum script roda: a página fica no estado autoral
  });
  await page.goto('http://qa.local/index.html', { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: cssDoLobby() });
  await page.evaluate((cls, card) => {
    document.documentElement.className = cls;
    window.__CARD = card;
  }, mobile ? 'mobile' : '', LOBBY_CARD);
  /* IIFE: a mesma página recebe vários estados na sequência, e um `const`
     no escopo global do page.evaluate estoura na segunda chamada. */
  page.estado = async nome => page.evaluate(`(() => {
    const ESTADOS = {${Object.entries(ESTADOS).map(([k, f]) => `${k}: ${f.toString()}`).join(',')}};
    ESTADOS[${JSON.stringify(nome)}]();
  })()`);
  return page;
}

const medir = (page, sel) => page.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return { display: cs.display, opacity: +cs.opacity, cursor: cs.cursor,
    visibility: cs.visibility, background: cs.backgroundImage, cor: cs.color,
    x: r.x, y: r.y, w: r.width, h: r.height,
    vw: window.innerWidth, vh: window.innerHeight };
}, sel);

describe('menu único — visual (DOM + CSS, sem WebGL)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let browser;
  before(async () => {
    const puppeteer = require('puppeteer-core');
    browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'] });
  });
  after(async () => { if (browser) await browser.close(); });

  describe('desktop 1600x900', () => {
    let page;
    before(async () => { page = await abrir(browser, { w: 1600, h: 900 }); });
    after(async () => { if (page) await page.close(); });

    it('dado o #mpPanel com `hidden`, então ele some — e sem ele, aparece', async () => {
      const fechado = await medir(page, '#mpPanel');
      await page.estado('lobby');
      const aberto = await medir(page, '#mpPanel');
      assert.equal(fechado.display, 'none', '#mpPanel visível com o atributo hidden posto');
      assert.notEqual(aberto.display, 'none', '#mpPanel não abre sem o hidden');
      assert.ok(aberto.h > 100, `#mpPanel abriu com ${aberto.h}px de altura`);
    });

    it('dado o lobby aberto, então o cartão cabe no painel (nada transborda)', async () => {
      const painel = await medir(page, '#panel');
      const card = await medir(page, '#mpPanel .brCard');
      assert.ok(card.w <= painel.w + 0.5,
        `o cartão do lobby (${card.w}px) é mais largo que o painel (${painel.w}px)`);
      assert.ok(card.x >= painel.x - 0.5, 'o cartão do lobby escapa pela esquerda do painel');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true, 'o lobby dentro do menu criou rolagem horizontal');
    });

    it('dado o lobby aberto, então ele fala o idioma do menu (fonte e moldura do jogo)', async () => {
      const r = await page.evaluate(() => {
        const card = document.querySelector('#mpPanel .brCard');
        const corpo = getComputedStyle(document.body);
        return { fonte: getComputedStyle(card).fontFamily, fonteDoJogo: corpo.fontFamily,
          borda: getComputedStyle(card).borderTopColor,
          botao: getComputedStyle(document.getElementById('brStartBtn')).backgroundImage };
      });
      assert.equal(r.fonte, r.fonteDoJogo,
        `o lobby ainda usa outra família tipográfica: ${r.fonte}`);
      assert.match(r.borda, /255,\s*205,\s*120/, `a moldura do lobby não é a do menu: ${r.borda}`);
      assert.match(r.botao, /gradient/, 'o botão do lobby não recebeu o âmbar do menu');
    });

    it('dado o boot, então CARREGANDO é diferente de DESABILITADO (e não é lápide)', async () => {
      const page2 = await abrir(browser, { w: 1600, h: 900 });
      try {
        await page2.estado('boot');
        const carregando = await medir(page2, '#btnNew');
        await page2.estado('pausaSolo');
        const travado = await medir(page2, '#btnNew');
        assert.ok(carregando.opacity > 0.9,
          `"carregando" continua apagado como lápide (opacity ${carregando.opacity})`);
        assert.equal(carregando.cursor, 'progress',
          'o ponteiro não avisa que o jogo está trabalhando');
        assert.notEqual(carregando.background, travado.background,
          'carregando e desabilitado desenham o MESMO botão — era essa a confusão');
        assert.ok(travado.h < carregando.h,
          `o botão travado na pausa (${travado.h}px) não encolheu em relação ao de boot ` +
          `(${carregando.h}px): continua um tijolo cinza do tamanho da ação principal`);
      } finally { await page2.close(); }
    });

    it('dado o MULTIJOGADOR, então ele tem o corpo de segunda porta (largura do SOLO)', async () => {
      const p = await abrir(browser, { w: 1600, h: 900 });
      try {
        await p.estado('pronto');
        /* a largura RENDERIZADA depende do rótulo do momento (o paintMenu
           reescreve os dois); o que é contrato é a faixa de tamanho */
        const faixa = id => p.evaluate(i => {
          const cs = getComputedStyle(document.getElementById(i));
          return { min: parseFloat(cs.minWidth), fonte: parseFloat(cs.fontSize),
            alt: document.getElementById(i).getBoundingClientRect().height };
        }, id);
        const solo = await faixa('btnNew');
        const multi = await faixa('btnMulti');
        const cfg = await faixa('btnSettings');
        assert.equal(multi.min, solo.min,
          `MULTIJOGADOR (min-width ${multi.min}px) não acompanha o SOLO (${solo.min}px)`);
        assert.ok(multi.min > cfg.min + 100,
          'MULTIJOGADOR continua do tamanho de CONFIGURAÇÕES — o jogo tem dois modos');
        assert.ok(solo.fonte > multi.fonte && solo.alt > multi.alt,
          'MULTIJOGADOR ficou tão pesado quanto o SOLO: sumiu a ação padrão');
      } finally { await p.close(); }
    });

    it('dada a pausa com partida BR AO VIVO, então o menu NÃO cobre a tela', async () => {
      const p = await abrir(browser, { w: 1600, h: 900 });
      try {
        await p.estado('pausaBR');
        // o #hud acende por transição de .5s: esperar o valor, não o relógio
        const acendeu = await p.waitForFunction(
          () => getComputedStyle(document.getElementById('hud')).opacity === '1',
          { timeout: 3000 }).then(() => true).catch(() => false);
        assert.ok(acendeu, 'o HUD não acendeu na pausa com partida ao vivo');
        const ov = await medir(p, '#overlay');
        const painel = await medir(p, '#panel');
        const hud = await medir(p, '#hud');
        const titulo = await medir(p, '#titleWrap');
        const mira = await medir(p, '#crosshair');
        const area = (painel.w * painel.h) / (ov.vw * ov.vh);
        assert.equal(ov.background, 'none',
          'o scrim de tela cheia continua por cima de uma partida que não parou');
        assert.ok(area < 0.20,
          `o painel de pausa ocupa ${(area * 100).toFixed(1)}% da tela numa partida ao vivo`);
        assert.equal(titulo.display, 'none', 'o título gigante continua na pausa ao vivo');
        assert.equal(hud.opacity, 1,
          'o HUD segue apagado: o jogador não vê vida/zona da partida que continua');
        assert.equal(mira.visibility, 'hidden',
          'a mira ficou na tela prometendo tiro no meio do menu');
      } finally { await p.close(); }
    });

    it('dada a pausa NO SOLO, então o scrim continua (o brlive é portão, não regra nova)', async () => {
      const p = await abrir(browser, { w: 1600, h: 900 });
      try {
        await p.estado('pausaSolo');
        const ov = await medir(p, '#overlay');
        const hud = await medir(p, '#hud');
        assert.match(ov.background, /gradient/,
          'a pausa do solo perdeu o scrim — o brlive vazou para fora do BR');
        assert.equal(hud.opacity, 0, 'o HUD do solo acendeu com o jogo pausado');
      } finally { await p.close(); }
    });

    it('dados os avisos (#menuNotice e #pausedWarn), então leem como aviso — e somem com o hidden', async () => {
      const p = await abrir(browser, { w: 1600, h: 900 });
      try {
        const escondido = await medir(p, '#menuNotice');
        assert.equal(escondido.display, 'none', '#menuNotice aparece com hidden posto');
        await p.estado('aviso');
        const aviso = await medir(p, '#menuNotice');
        assert.notEqual(aviso.display, 'none', '#menuNotice não aparece sem o hidden');
        assert.match(aviso.background, /gradient/, 'o aviso do menu não tem tratamento próprio');
        const filete = await p.evaluate(() =>
          getComputedStyle(document.getElementById('menuNotice')).borderLeftWidth);
        assert.notEqual(filete, '0px', 'o aviso não tem filete: lê como legenda, não como aviso');
      } finally { await p.close(); }
    });

    it('dada a tela de morte, então a saída só existe sem o `hidden` e o CTA é o âmbar do menu', async () => {
      const p = await abrir(browser, { w: 1600, h: 900 });
      try {
        const semSaida = await medir(p, '#deathBtns');
        assert.equal(semSaida.display, 'none',
          '#deathBtns visível com hidden posto — em partida online ele cobriria o recap do servidor');
        await p.estado('morteSolo');
        const btns = await medir(p, '#deathBtns');
        const retry = await medir(p, '#btnRetry');
        const menu = await medir(p, '#btnDeathMenu');
        assert.notEqual(btns.display, 'none', 'a saída da morte não aparece sem o hidden');
        assert.match(retry.background, /gradient\(100deg/, 'JOGAR DE NOVO não é a ação da tela');
        assert.ok(retry.h >= 48, `JOGAR DE NOVO tem ${retry.h}px de alvo`);
        assert.ok(menu.h >= 48, `VOLTAR AO MENU tem ${menu.h}px de alvo`);
        assert.ok(retry.h > menu.h, 'os dois botões da morte têm o mesmo peso');
      } finally { await p.close(); }
    });
  });

  describe('celular em paisagem 844x390 (html.mobile)', () => {
    let page;
    before(async () => {
      page = await abrir(browser, { w: 844, h: 390, dpr: 2, mobile: true, ponteiro: 'coarse' });
    });
    after(async () => { if (page) await page.close(); });

    it('dados os botões do menu e da morte, então todo alvo tem 48px', async () => {
      await page.estado('pronto');
      const alvos = {};
      for (const id of ['btnNew', 'btnMulti', 'btnSettings']) alvos[id] = await medir(page, '#' + id);
      await page.estado('lobby');
      alvos.btnMpBack = await medir(page, '#btnMpBack');
      alvos.brStartBtn = await medir(page, '#mpPanel .brBtn');
      await page.estado('morteSolo');
      alvos.btnRetry = await medir(page, '#btnRetry');
      alvos.btnDeathMenu = await medir(page, '#btnDeathMenu');
      for (const [id, m] of Object.entries(alvos))
        assert.ok(m && m.h >= 48, `#${id} tem ${m ? m.h : '—'}px de alvo de toque (mínimo 48)`);
    });

    it('dado o aviso do menu no celular, então ele CONTINUA visível (o #loadingMsg some, ele não)', async () => {
      /* O #loadingMsg inteiro era `display: none` no celular — e o aviso
         mora dentro dele. O jogador de celular nunca via "a sala não
         carregou", só um botão que fazia outra coisa sem explicação. */
      const p = await abrir(browser, { w: 844, h: 390, dpr: 2, mobile: true, ponteiro: 'coarse' });
      try {
        await p.estado('aviso');
        const aviso = await medir(p, '#menuNotice');
        const teclas = await p.evaluate(() =>
          getComputedStyle(document.getElementById('loadingMsg')).fontSize);
        assert.notEqual(aviso.display, 'none', 'o aviso do menu sumiu no celular');
        assert.ok(aviso.h > 10, `o aviso ficou com ${aviso.h}px de altura no celular`);
        assert.equal(teclas, '0px',
          'a instrução de TECLADO voltou pro celular (não existe ESC no aparelho)');
      } finally { await p.close(); }
    });

    it('dado o lobby no celular, então o cartão não transborda o painel', async () => {
      await page.estado('lobby');
      const painel = await medir(page, '#panel');
      const card = await medir(page, '#mpPanel .brCard');
      assert.ok(card.w <= painel.w + 0.5,
        `cartão de ${card.w}px num painel de ${painel.w}px — era o \`width: min(94vw, 880px)\``);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true, 'o lobby criou rolagem horizontal no celular');
    });

    it('dada a pausa BR ao vivo no celular, então o cartão deixa a partida à vista', async () => {
      const p = await abrir(browser, { w: 844, h: 390, dpr: 2, mobile: true, ponteiro: 'coarse' });
      try {
        await p.estado('pausaBR');
        const ov = await medir(p, '#overlay');
        const painel = await medir(p, '#panel');
        assert.equal(ov.background, 'none', 'o scrim cobre a partida ao vivo no celular');
        assert.ok(painel.w / ov.vw < 0.55,
          `o cartão ocupa ${(painel.w / ov.vw * 100).toFixed(0)}% da largura do aparelho`);
      } finally { await p.close(); }
    });
  });
});
