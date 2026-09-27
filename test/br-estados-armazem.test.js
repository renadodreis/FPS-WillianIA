/* ================================================================
   QA — `localStorage` QUE LANÇA NÃO DERRUBA O JOGO (A6/C9, parte do boot).

   Safari em aba privada (versões antigas) e cota cheia fazem
   `localStorage.setItem` LANÇAR (`QuotaExceededError`). No primeiro boot o
   auto-tier escolhe a qualidade e chama `persistSettings()` — que não tinha
   `try`. Medido pelo validador (laudo `7515734`): exceção não tratada e
   `window.__game` nunca aparece em 90 s. O jogo inteiro morria por causa de
   uma preferência que não conseguiu ser salva.

   O ambiente hostil é instalado ANTES de qualquer script da página
   (`initScripts` → `evaluateOnNewDocument`): `getItem` devolve `null` (nada
   salvo — é o primeiro boot, o caminho que grava) e `setItem` lança.
   Viewport de celular (V3, ?mobile=1): é o aparelho do dono, e o Safari do
   iPhone é quem entrega este erro. Porta 4003.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

const PORT = 4003;
const V3 = { width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

const ARMAZEM_QUE_LANCA = `(() => {
  const S = Storage.prototype;
  window.__lancamentos = 0;
  S.getItem = function () { return null; };
  S.setItem = function () {
    window.__lancamentos++;
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  };
})();`;

describe('Boot com localStorage que lança (Safari privado, cota cheia)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: PORT, query: '?mobile=1', viewport: V3, initScripts: [ARMAZEM_QUE_LANCA] });
  });
  after(async () => { if (h) await h.close(); });

  it('dado setItem lançando no primeiro boot, então o jogo sobe, começa e roda quadros', async () => {
    const r = await h.play(() => {
      const G = window.__game;
      window.QA.tick(5);
      return { jogo: !!G, comecou: !!G.state.started, lancou: window.__lancamentos,
        erros: (G.errors || []).slice() };
    });
    assert.equal(r.jogo, true);
    assert.equal(r.comecou, true, 'o jogo subiu mas a partida não começou');
    assert.ok(r.lancou >= 1, 'cenário inválido: nenhuma escrita tentou gravar (o armazém hostil não foi exercitado)');
    assert.deepEqual(r.erros, [], 'erro não tratado durante o boot:\n' + r.erros.join('\n'));
  });

  it('dado um ajuste mudado no menu (volume e olhar do toque), então vale na hora e nada lança', async () => {
    const r = await h.play(() => {
      const n0 = window.__lancamentos;
      const falhas = [];
      const mexer = (id, v) => {
        const el = document.getElementById(id);
        if (!el) { falhas.push(`#${id} ausente`); return; }
        el.value = String(v);
        try { el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input')); }
        catch (e) { falhas.push(`#${id}: ${e.message}`); }
      };
      mexer('setVol', 30);
      mexer('setTLook', 150);
      return { falhas, gravacoes: window.__lancamentos - n0, look: window.__game.Touch.cfg.look,
        erros: (window.__game.errors || []).slice() };
    });
    assert.deepEqual(r.falhas, []);
    assert.ok(r.gravacoes >= 1, 'cenário inválido: mudar o ajuste não tentou gravar');
    assert.ok(Math.abs(r.look - 1.5) < 1e-9, `o ajuste do olhar não valeu na hora (${r.look})`);
    assert.deepEqual(r.erros, [], r.erros.join('\n'));
  });

  /* O LOBBY TAMBÉM GRAVA: nick e cores iam para `localStorage.setItem` sem
     `try` (multiplayer-client.js). Com o armazém hostil, digitar o nick ou
     tocar numa paleta lançava dentro do ouvinte — o nick não chegava ao
     servidor e a prévia não trocava de cor. `__lancamentos` subir prova que o
     caminho que grava foi exercitado (o caso não passa por não ter gravado). */
  it('dado o lobby com o armazém hostil, então nick e paleta funcionam e nada lança', async () => {
    const r = await h.play(() => {
      const antes = window.__lancamentos;
      window.__MP_lobby.show();
      const nick = document.getElementById('brNick');
      nick.value = 'Hostil';
      nick.dispatchEvent(new Event('input', { bubbles: true }));
      const preset = document.querySelector('.brPreset');
      if (preset) preset.click();
      const cor = document.querySelector('.brCol4');
      if (cor) { cor.value = '#123456'; cor.dispatchEvent(new Event('input', { bubbles: true })); }
      return { tentou: window.__lancamentos - antes, preset: !!preset, cor: !!cor };
    });
    assert.ok(r.preset && r.cor, 'cenário inválido: lobby sem paleta/cor');
    assert.ok(r.tentou >= 3, `cenário inválido: o lobby não tentou gravar (${r.tentou})`);
    await new Promise(res => setTimeout(res, 300));
    assert.deepEqual(h.pageErrors, [], `o lobby lançou com o armazém hostil: ${h.pageErrors.join(' | ')}`);
  });

  it('dado o boot inteiro com o armazém hostil, então nenhum erro de página', () => {
    assert.deepEqual(h.pageErrors, [], 'erros de página:\n' + h.pageErrors.join('\n'));
  });
});
