/* ================================================================
   QA — PRESET DE QUALIDADE DA SESSÃO XR.

   Medição que motivou o módulo (`npm run vr:censo`, mono, pose de spawn):
   frame sem sombra 198 draw calls · 0,65 M tris; as 4 cascatas CSM custam
   +42 draw calls e +0,16 M tris — 17,5% do quadro. Em estéreo tudo dobra, e
   o alvo do Quest 3 é 72 fps travados com teto de 180 draw calls.

   O QUE ESTE ARQUIVO PROTEGE, e é mais importante que o corte em si:

   1. **Restaurar ao sair.** Preset que vaza para o desktop é regressão de
      PC introduzida por VR — o jogador tira o headset, volta pro monitor e
      fica com duas cascatas de sombra desligadas para sempre.
   2. **Não cortar o que é contrato.** Nada que alimente o `Math.random`
      seedado (grama, árvores, pedras, flores, terreno, inimigos) pode
      mudar: quem está de headset ficaria num mundo DIFERENTE do dos outros
      jogadores da mesma partida.
   3. **Não ralar grama nem encurtar visão.** Isso é wallhack contra quem
      está deitado no mato, e vantagem para quem usa headset não é
      otimização, é defeito de projeto.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3460;

describe('política de qualidade (unidade, sem three)', () => {
  let planoDeQualidade;
  before(async () => { ({ planoDeQualidade } = await import('../js/xr/xrquality.js')); });

  it('deixa acesas as cascatas PRÓXIMAS e apaga as distantes', () => {
    const p = planoDeQualidade({ cascatas: 4 });
    assert.equal(p.cascatasLigadas, 2,
      'as cascatas distantes cobrem a maior área com o mesmo mapa: muito custo, pouca sombra visível');
  });

  it('nunca liga mais cascata do que existe', () => {
    assert.equal(planoDeQualidade({ cascatas: 1 }).cascatasLigadas, 1);
    assert.equal(planoDeQualidade({ cascatas: 0 }).cascatasLigadas, 0);
  });

  it('o modo agressivo corta mais, e não ao contrário', () => {
    const n = planoDeQualidade({ cascatas: 4 });
    const a = planoDeQualidade({ cascatas: 4, agressivo: true });
    assert.ok(a.cascatasLigadas <= n.cascatasLigadas);
    assert.ok(a.framebuffer <= n.framebuffer);
    assert.ok(a.maxFar <= n.maxFar);
  });

  it('a foveação fica LONGE do padrão do three (1.0 = periferia borrada)', () => {
    assert.ok(planoDeQualidade({ cascatas: 4 }).foveacao <= 0.25,
      'o three nasce em foveação máxima, e foi assim que o jogo rodou até agora');
    assert.ok(planoDeQualidade({ cascatas: 4, agressivo: true }).foveacao < 1,
      'nem o modo agressivo pode voltar ao borrão do padrão');
  });

  it('o framebuffer não desce ao ponto de matar a legibilidade', () => {
    assert.ok(planoDeQualidade({ cascatas: 4, agressivo: true }).framebuffer >= 0.8,
      'texto ilegível reprova na loja — escala não é lugar de economizar sem limite');
  });
});

describe('preset aplicado na sessão de verdade', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootEmVR(bootGame, { port: PORT }); });
  after(async () => { if (h) await h.close(); });

  it('entrar na sessão APAGA as cascatas distantes', async () => {
    const r = await h.play(() => {
      const G = window.__game;
      return {
        dentro: G.XR.qualidade.dentro,
        sombras: G.csmDebug ? null : null,
        acesas: G.XR.qualidade.dentro,
      };
    });
    assert.equal(r.dentro, true, 'o preset não foi aplicado ao entrar na sessão');
  });

  it('o quadro fica MAIS BARATO com o preset — medido, não suposto', async () => {
    const r = await h.play(async () => {
      const G = window.__game, MP = window.__MP, R = MP.renderer;
      const esperaFrames = n => new Promise(res => {
        const alvo = R.info.render.frame + n;
        const olha = () => (R.info.render.frame >= alvo ? res() : setTimeout(olha, 6));
        olha();
      });
      const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1] || 0;
      const amostra = async () => {
        const c = [];
        for (let i = 0; i < 9; i++) { await esperaFrames(1); c.push(R.info.render.calls); }
        return med(c);
      };
      await esperaFrames(20);
      const comPreset = await amostra();
      G.XR.qualidade.restaurar();                 // volta ao quadro cheio
      await esperaFrames(20);
      const semPreset = await amostra();
      G.XR.qualidade.aplicar();                   // e devolve o preset
      await esperaFrames(10);
      return { comPreset, semPreset };
    });
    assert.ok(r.comPreset < r.semPreset,
      `o preset não baixou o custo: ${r.comPreset} draw calls contra ${r.semPreset} sem ele`);
  });

  it('SAIR restaura tudo — preset que vaza pro desktop é regressão de PC', async () => {
    const r = await h.play(async () => {
      const G = window.__game, MP = window.__MP;
      const luzes = () => MP.renderer.xr && null;
      void luzes;
      const antes = G.XR.qualidade.dentro;
      G.XR.qualidade.restaurar();
      const fbDepois = MP.renderer.xr.getFramebufferScaleFactor
        ? MP.renderer.xr.getFramebufferScaleFactor() : 1;
      const fov = MP.renderer.xr.getFoveation ? MP.renderer.xr.getFoveation() : null;
      G.XR.qualidade.aplicar();
      return { antes, dentroDepois: G.XR.qualidade.dentro, fbDepois, fov };
    });
    assert.equal(r.antes, true);
    assert.equal(r.fbDepois, 1, `o framebuffer ficou em ${r.fbDepois} depois de restaurar`);
    assert.equal(r.fov, 0.2, `a foveação ficou em ${r.fov} — tinha que voltar ao valor de fora da sessão`);
  });

  it('restaurar duas vezes não quebra nem desfaz o que não é seu', async () => {
    const r = await h.play(() => {
      const G = window.__game;
      const a = G.XR.qualidade.restaurar();
      const b = G.XR.qualidade.restaurar();
      G.XR.qualidade.aplicar();
      return { a, b };
    });
    assert.equal(r.a, true);
    assert.equal(r.b, false, 'restaurar sem ter aplicado tem que ser no-op, não estrago');
  });
});
