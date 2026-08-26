'use strict';
/* ================================================================
   QA — PAINEL DE CONTROLES NO JOGO DE VERDADE (Chrome headless).

   O teste de núcleo (test/controles-keybinds.test.js) prova a lógica
   pura do remapeamento. Este prova a FIAÇÃO: que clicar numa tecla no
   menu, apertar a nova, MUDA o jogo de verdade — sem tocar em game.js.

   Dois defeitos originais, dois blocos de prova:
     1. O painel CONTROLES era uma legenda somente-leitura. Aqui: clicar
        um `.keyBtn`, apertar uma tecla física de VERDADE (`page.keyboard`,
        que é `isTrusted:true` via CDP — o mesmo portão que o listener de
        produção usa pra ignorar o teclado sintético do toque) e provar
        que (a) o rótulo do botão muda, (b) o localStorage persiste em
        `callofai_keys` (não em `callofai_cfg`), (c) um listener em fase
        de BOLHA no `window` — o mesmo lugar onde game.js escuta — passa a
        ver o código CANÔNICO da ação, não o código físico apertado, e a
        tecla física ANTIGA vira letra morta (nunca fica funcionando
        escondida). Conflito: pede a MESMA tecla de outra ação e prova
        que as duas trocam (nunca ficam as duas na mesma tecla).
     2. O painel vazava pra fora da tela em 1920x1080 (o rodapé "ESC pausa
        o jogo..." cortado). Aqui: abre o painel nas três larguras da
        tarefa (1366x768, 1920x1080, 2560x1080) e mede que o rodapé
        continua DENTRO da viewport e que não nasce rolagem horizontal.

   Porta: 3400 (faixa reservada pra este agente, 3400-3419).
   ================================================================ */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');

const PORT = 3400;

describe('painel de controles no navegador (Chrome headless)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    // online:false + blockRequests: garante o MENU SOLO puro (sem lobby
    // do BR por cima — #mpPanel visível esconde #ctlBox por CSS). Duas
    // travas independentes de propósito: é exatamente o estado que o
    // dono do jogo via quando reportou o bug.
    h = await bootGame({
      port: PORT, autoStart: false, online: false,
      blockRequests: ['/socket.io/'],
    });
    await h.page.waitForFunction(
      "window.__game && document.querySelector('#title .ln') && document.getElementById('btnKeyReset')",
      { timeout: 60000, polling: 200 });
  });
  after(async () => { if (h) await h.close(); });

  async function openControls() {
    await h.page.evaluate(() => {
      const box = document.getElementById('ctlBox');
      if (!box.open) document.getElementById('btnCtl').click();
    });
    await h.page.waitForFunction("document.getElementById('ctlBox').open === true", { timeout: 5000 });
  }
  async function resetToDefault() {
    await h.page.evaluate(() => document.getElementById('btnKeyReset').click());
  }
  const labelOf = act => h.page.evaluate(a => document.querySelector(`.keyBtn[data-act="${a}"]`).textContent.trim(), act);
  const isListening = act => h.page.evaluate(a => document.querySelector(`.keyBtn[data-act="${a}"]`).classList.contains('listening'), act);
  const storedKeys = () => h.page.evaluate(() => localStorage.getItem('callofai_keys'));

  describe('o painel cabe na tela (1366x768, 1920x1080, 2560x1080)', () => {
    before(async () => { await openControls(); });

    for (const [w, hgt] of [[1366, 768], [1920, 1080], [2560, 1080]]) {
      it(`dado o painel aberto em ${w}x${hgt}, então o rodapé continua dentro da viewport e sem rolagem horizontal`, async () => {
        await h.page.setViewport({ width: w, height: hgt, deviceScaleFactor: 1 });
        await new Promise(r => setTimeout(r, 200));
        const m = await h.page.evaluate(() => {
          const r = document.getElementById('loadingMsg').getBoundingClientRect();
          return {
            footerBottom: r.bottom, footerTop: r.top, innerH: window.innerHeight,
            scrollWidth: document.documentElement.scrollWidth, innerW: window.innerWidth,
          };
        });
        assert.ok(m.footerTop >= 0, `rodapé começa acima da viewport (top=${m.footerTop})`);
        assert.ok(m.footerBottom <= m.innerH,
          `rodapé cortado @ ${w}x${hgt}: bottom=${m.footerBottom} > innerH=${m.innerH}`);
        assert.ok(m.scrollWidth <= m.innerW,
          `overflow horizontal @ ${w}x${hgt}: scrollWidth=${m.scrollWidth} > innerW=${m.innerW}`);
      });
    }

    it('dado os 3 grupos (Movimento/Combate/Interação), então ficam numa linha só (não empilham)', async () => {
      await h.page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
      const tops = await h.page.evaluate(() =>
        [...document.querySelectorAll('.ctlGroup')].map(g => Math.round(g.getBoundingClientRect().top)));
      assert.equal(new Set(tops).size, 1, `grupos em linhas diferentes: ${tops}`);
    });
  });

  describe('remapeamento de verdade — clicar, apertar, valer', () => {
    before(async () => { await h.page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 }); await openControls(); await resetToDefault(); });

    it('dado o botão de Recarregar (R), então o rótulo inicial bate com o padrão', async () => {
      assert.equal(await labelOf('reload'), 'R');
    });

    it('dado um clique no botão, então ele entra em modo "esperando tecla" (.listening)', async () => {
      await h.page.click('.keyBtn[data-act="reload"]');
      assert.equal(await isListening('reload'), true);
    });

    it('dado ESC durante a captura, então CANCELA sem mudar o binding', async () => {
      await h.page.keyboard.press('Escape');
      assert.equal(await isListening('reload'), false);
      assert.equal(await labelOf('reload'), 'R', 'ESC não pode ter trocado a tecla');
    });

    it('dado clicar e apertar KeyJ, então o rótulo muda pra J e persiste em callofai_keys (não em callofai_cfg)', async () => {
      await h.page.click('.keyBtn[data-act="reload"]');
      await h.page.keyboard.press('KeyJ');
      assert.equal(await labelOf('reload'), 'J');
      const raw = await storedKeys();
      assert.ok(raw, 'nada foi salvo em callofai_keys');
      assert.equal(JSON.parse(raw).reload, 'KeyJ');
    });

    it('dado a tecla J pressionada de verdade, então um listener em BOLHA no window (o mesmo lugar de game.js) vê o código CANÔNICO KeyR, não KeyJ', async () => {
      await h.page.evaluate(() => {
        window.__seenCodes = [];
        window.addEventListener('keydown', e => window.__seenCodes.push(e.code), false);
      });
      await h.page.keyboard.press('KeyJ');
      const seen = await h.page.evaluate(() => window.__seenCodes);
      assert.deepEqual(seen, ['KeyR'], 'game.js precisa ver KeyR (o canônico de reload) quando o jogador aperta a tecla remapeada');
    });

    /* EXPECTATIVA CORRIGIDA. A versão original exigia que o evento da tecla
       órfã NÃO CHEGASSE — o que era implementado matando o evento com
       `stopImmediatePropagation()` na captura do `window`. Isso silenciava o
       jogo e também a PÁGINA: o ESPAÇO parava de ativar o `.mbtn` focado do
       menu (js/menuscene.js) e os botões da tela de morte (game.js), os dois
       lendo `e.key`. Contrato certo: a tecla órfã fica INERTE PRO JOGO
       (código renomeado pra algo que nenhum sistema conhece) e VIVA PRA
       PÁGINA. Ver test/controles-orfa-viva.test.js. */
    it('dado a tecla física ANTIGA (R) depois do remap, então ela chega INERTE — nunca como KeyR nem como a ação', async () => {
      await h.page.evaluate(() => { window.__seenCodes = []; });
      await h.page.keyboard.press('KeyR');
      const seen = await h.page.evaluate(() => window.__seenCodes);
      assert.ok(!seen.includes('KeyR'),
        'a tecla R antiga não pode continuar recarregando depois do remap pra J');
      for (const c of seen) {
        assert.match(c, /^Orfa_/,
          `código "${c}" vazou pro jogo: a tecla órfã tem que chegar renomeada`);
      }
    });

    it('dado um evento de teclado SINTÉTICO (isTrusted:false, o que js/touchcontrols.js dispara), então NÃO é interceptado — o toque nunca quebra por causa de um remap no desktop', async () => {
      // reload está em KeyJ (remapeado); KeyR ficou órfã pro teclado FÍSICO.
      // Um evento sintético de KeyR (o que o botão de toque "reload" dispara,
      // js/touchcontrols.js KEY_OF.reload='KeyR') tem que chegar INTACTO —
      // senão remapear no desktop quebraria o botão de toque no celular.
      // (a sonda já instalada no teste anterior só ouve 'keydown' — um
      // 'keyup' sozinho aqui bastaria pra provar o ponto.)
      await h.page.evaluate(() => { window.__seenCodes = []; });
      await h.page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true, cancelable: true }));
      });
      const seen = await h.page.evaluate(() => window.__seenCodes);
      assert.deepEqual(seen, ['KeyR'], 'evento sintético (toque) tem que passar intocado, nunca suprimido nem reescrito');
    });

    it('dado um rebind pra uma tecla já usada por outra ação (Granada=G), então TROCA (swap) e avisa — nunca aceita silenciosamente', async () => {
      // reload agora é J (do teste anterior). Pede pra granada usar J também.
      assert.equal(await labelOf('grenade'), 'G');
      await h.page.click('.keyBtn[data-act="grenade"]');
      await h.page.keyboard.press('KeyJ');
      assert.equal(await labelOf('grenade'), 'J', 'granada devia assumir a tecla J');
      assert.equal(await labelOf('reload'), 'G', 'reload devia herdar a tecla antiga da granada (swap)');
      const status = await h.page.evaluate(() => document.getElementById('keyStatus').textContent);
      assert.ok(status && status.length > 0, 'o jogador tem que ser avisado da troca');
      const raw = JSON.parse(await storedKeys());
      const usadas = Object.values(raw);
      assert.equal(usadas.length, new Set(usadas).size, 'duas ações ficaram na mesma tecla depois do swap');
    });

    it('dado "Restaurar padrão", então TODOS os rótulos voltam e o localStorage não guarda mais override', async () => {
      await resetToDefault();
      assert.equal(await labelOf('reload'), 'R');
      assert.equal(await labelOf('grenade'), 'G');
      assert.equal(await storedKeys(), null, 'restaurar padrão devia limpar callofai_keys');
    });
  });
});
