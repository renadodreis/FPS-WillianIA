/* ================================================================
   QA — fiação do Tier 0 no cliente real (Chrome headless).

     1. o auto-tier roda no PRIMEIRO boot, escolhe um preset pela GPU e
        deixa registrado o porquê;
     2. o overlay de perf (F3 / ?perf=1) nasce por JS — sem tocar em
        index.html/style.css — e mede draw calls DE VERDADE: com
        EffectComposer o `info.reset()` automático do renderer zera o
        contador entre os passes e o número mentiria.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { CHROME, bootGame } = require('./helpers/harness.js');

describe('Tier 0 — auto-tier e overlay de perf', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootGame({ port: 3730 }); });
  after(async () => { if (h) await h.close(); });

  it('o auto-tier decidiu no primeiro boot e diz por quê', async () => {
    const r = await h.play(() => window.QA.G.gpuTier);
    assert.ok(r, 'gpuTier não foi exposto');
    assert.equal(r.applied, true, 'perfil novo do Chrome tem localStorage vazio: o auto-tier tinha que rodar');
    assert.ok(['baixo', 'medio', 'alto'].includes(r.tier), `tier inválido: ${r.tier}`);
    assert.ok(r.reason && r.reason.length > 0, 'sem motivo registrado');
    // headless roda em SwiftShader: tem que cair no tier baixo
    assert.equal(r.tier, 'baixo', `SwiftShader classificado como "${r.tier}" (GPU: ${r.gpu})`);
  });

  it('o preset do tier chegou de verdade no renderer e no pós', async () => {
    const r = await h.play(() => {
      const MP = window.QA.MP, tier = window.QA.G.gpuTier;
      const smaa = MP.composer.passes.find(p => p.constructor.name === 'SMAAPass');
      const bloom = MP.composer.passes.find(p => p.constructor.name === 'UnrealBloomPass');
      return { preset: tier.preset, smaa: smaa.enabled, bloom: bloom.enabled,
        shadow: MP.renderer.shadowMap.enabled };
    });
    assert.equal(r.smaa, r.preset.aa === 1, 'SMAA fora do preset do tier');
    assert.equal(r.bloom, r.preset.bloom === 1, 'bloom fora do preset do tier');
    assert.equal(r.shadow, true, 'sombra desligada: nenhum tier pode desligar sombra');
  });

  it('a escolha do tier ficou PERSISTIDA — no boot seguinte quem manda é o jogador', async () => {
    const r = await h.play(() => JSON.parse(localStorage.getItem('callofai_cfg') || 'null'));
    assert.ok(r, 'auto-tier não persistiu: no próximo boot ele reescreveria a escolha do jogador');
    const preset = await h.play(() => window.QA.G.gpuTier.preset);
    for (const k of Object.keys(preset)) assert.equal(r[k], preset[k], `chave ${k} não persistiu`);
  });

  it('o overlay nasce desligado, liga por F3 e cria o próprio DOM', async () => {
    const r = await h.play(() => {
      const hud = window.QA.G.perfHud;
      const antes = { on: hud.enabled, el: !!document.getElementById('perfHud') };
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F3' }));
      const ligado = { on: hud.enabled, el: !!document.getElementById('perfHud') };
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F3' }));
      return { antes, ligado, depois: hud.enabled };
    });
    assert.equal(r.antes.on, false, 'overlay veio ligado sem ninguém pedir');
    assert.equal(r.antes.el, false, 'overlay criou DOM antes de ser ligado');
    assert.equal(r.ligado.on, true, 'F3 não ligou o overlay');
    assert.equal(r.ligado.el, true, 'overlay ligado sem criar o próprio DOM');
    assert.equal(r.depois, false, 'F3 não desligou de volta');
  });

  it('ligado, mede draw calls do FRAME INTEIRO (não só do último passe do pós)', async () => {
    const r = await h.play(() => {
      const G = window.QA.G, MP = window.QA.MP;
      // o harness anula composer.render com uma propriedade PRÓPRIA; apagar
      // devolve o método do protótipo, que é o render de verdade
      delete MP.composer.render;
      G.perfHud.enabled = true;
      const autoReset = MP.renderer.info.autoReset;
      for (let i = 0; i < 3; i++) G.tick(1 / 60);
      const texto = document.getElementById('perfHud').textContent;
      const calls = MP.renderer.info.render.calls;
      G.perfHud.enabled = false;
      const autoResetDepois = MP.renderer.info.autoReset;
      MP.composer.render = () => {};
      return { autoReset, autoResetDepois, calls, texto };
    });
    assert.equal(r.autoReset, false, 'overlay ligado não assumiu o renderer.info (o número mentiria)');
    assert.equal(r.autoResetDepois, true, 'overlay desligado não devolveu o autoReset');
    assert.ok(r.calls > 50, `draw calls implausíveis: ${r.calls}`);
    for (const alvo of [/FPS/, /p50/, /p1%/, /engasgos/, /draw \d+/, /tris/, /res /, /sim /]) {
      assert.match(r.texto, alvo, `overlay sem "${alvo}":\n${r.texto}`);
    }
  });

  it('desligado, o renderer volta ao comportamento de fábrica', async () => {
    const r = await h.play(() => ({
      on: window.QA.G.perfHud.enabled,
      autoReset: window.QA.MP.renderer.info.autoReset,
      display: document.getElementById('perfHud').style.display,
    }));
    assert.equal(r.on, false);
    assert.equal(r.autoReset, true);
    assert.equal(r.display, 'none', 'overlay desligado continua desenhando na tela');
  });
});
