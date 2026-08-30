/* ================================================================
   QA — G2 · Antialiasing existe em XR (docs/vr/criterio-aaa.md).

   O MÉTODO QUE A RÉGUA PRESCREVE NÃO EXISTE. `renderer.xr.getRenderTarget()`
   não é método público do `WebXRManager` no three r0.185.1 instalado aqui —
   a lista inteira de `this.xxx = function` do módulo (WebXRManager.js) não
   tem `getRenderTarget`. O alvo de render da sessão (`newRenderTarget`) é
   variável de CLOSURE, nunca exposta em `renderer.xr`.

   TENTATIVA 1 (ERRADA, e o erro fica registrado porque quase virou o
   veredito): ler `renderer.getRenderTarget().samples` (no RENDERER, depois
   de `renderer.render`) parecia funcionar — devolve o mesmo objeto que
   `WebXRManager` usa internamente. MAS o three só escreve `samples:
   attributes.antialias ? 4 : 0` no branch `supportsLayers` (Layers API /
   `XRProjectionLayer`), lido em `WebXRManager.js` por volta da linha 497.
   No branch CLÁSSICO (`!supportsLayers`, `XRWebGLLayer`/`baseLayer` —
   linhas ~426-455), o `WebGLRenderTarget` espelho **nem tem campo
   `samples` na criação** — fica no default (0) SEMPRE, com ou sem
   antialiasing real acontecendo no compositor nativo. Medir `samples` nesse
   branch é medir o vazio: dá 0 mesmo com `antialias:true` pedido e
   concedido.

   `IWER` (o runtime emulado usado aqui) **não implementa**
   `XRWebGLBinding.prototype.createProjectionLayer` (confirmado por grep em
   `node_modules/iwer/lib/`) — logo `supportsLayers` é sempre `false` nesta
   suíte, e o jogo SEMPRE cai no branch clássico. `samples` é inútil aqui por
   construção, não por bug de teste.

   O MÉTODO QUE FUNCIONA: a spec do WebXR define `XRWebGLLayer.antialias`
   como atributo **read-only**, refletindo se a camada usa antialiasing de
   verdade — e é isso que `WebXRManager` passa pro `layerInit` do
   `XRWebGLLayer` nativo (`antialias: attributes.antialias`, o valor real de
   `gl.getContextAttributes().antialias`). `IWER` implementa esse getter
   (`node_modules/iwer/lib/layers/XRWebGLLayer.js`, `get antialias()`) como
   eco fiel do que foi pedido na construção — não é decisão de hardware
   simulada, é passthrough. Lido via `session.renderState.baseLayer.antialias`
   (a via pública documentada pela spec — `renderState.baseLayer` É a
   instância que `WebXRManager` criou e registrou com
   `session.updateRenderState({ baseLayer: glBaseLayer })`).

   O QUE ISTO PROVA E O QUE NÃO PROVA: prova que o PEDIDO (`antialias:true`
   em `game.js`) chega inteiro até a camada WebXR, sem se perder no caminho
   three→WebXR. NÃO prova que o Oculus Browser real, no Quest 3, CONCEDE
   antialiasing de verdade nesse pedido — isso é decisão do compositor
   nativo, que o IWER não simula (só ecoa o valor pedido). Confirmar o
   veredito final exige o aparelho físico. */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3872;

async function instalarSonda() {
  const G = window.__game, MP = window.__MP;

  window.__G2 = {
    presenting: () => !!(G.XR && G.XR.presenting),
    contextAttrAntialias: () => MP.renderer.getContext().getContextAttributes().antialias,
    caminho: () => {
      const session = MP.renderer.xr.getSession();
      const rs = session ? session.renderState : null;
      return {
        temBaseLayer: !!(rs && rs.baseLayer),
        temLayers: !!(rs && rs.layers && rs.layers.length),
        baseLayerAntialias: rs && rs.baseLayer ? rs.baseLayer.antialias : null,
      };
    },
    gpuString: () => {
      const gl = MP.renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    },
  };
  return true;
}

describe('G2 — antialiasing do framebuffer da sessão XR (IWER real)',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      await h.play(instalarSonda);
      await h.play(async () => { await window.__A.espera(300); });
    });
    after(async () => { if (h) await h.close(); });

    it('a sessão está mesmo apresentando, com GPU real (não é a amostra que importa sem isto)', async () => {
      const presenting = await h.play(() => window.__G2.presenting());
      assert.equal(presenting, true, 'sessão IWER não entrou em apresentação — as amostras seguintes seriam do desktop');
      const gpu = await h.play(() => window.__G2.gpuString());
      console.log(`      backend WebGL desta medição: ${gpu}`);
    });

    it('confirma o caminho ativo (clássico vs Layers API) — decide qual sonda vale', async () => {
      const c = await h.play(() => window.__G2.caminho());
      console.log(`      baseLayer(clássico)=${c.temBaseLayer} · layers(moderno)=${c.temLayers} · ` +
        `baseLayer.antialias=${c.baseLayerAntialias}`);
      assert.equal(c.temLayers, false,
        'sessão entrou pela Layers API (inesperado — IWER não implementa createProjectionLayer). ' +
        'Se isto mudar, `renderer.getRenderTarget().samples` volta a ser a sonda certa, não `baseLayer.antialias`.');
      assert.equal(c.temBaseLayer, true, 'nenhum `baseLayer` nem `layers` na sessão — nenhuma sonda de G2 tem onde ler');
    });

    it('o antialias chega inteiro do WebGLRenderer até a XRWebGLLayer — pedido não se perde no caminho', async () => {
      const antialiasContexto = await h.play(() => window.__G2.contextAttrAntialias());
      const c = await h.play(() => window.__G2.caminho());
      assert.equal(antialiasContexto, true,
        'gl.getContextAttributes().antialias === false — o WebGLRenderer não conseguiu antialias:true ' +
        'nem no contexto base (game.js pede antialias:true na criação)');
      assert.equal(c.baseLayerAntialias, antialiasContexto,
        `baseLayer.antialias (${c.baseLayerAntialias}) diverge do contexto (${antialiasContexto}) — o pedido ` +
        'se perdeu entre o WebGLRenderer e a XRWebGLLayer (WebXRManager não repassou attributes.antialias)');
      /* NÃO é assert.equal(c.baseLayerAntialias, true) sozinho: o IWER só ecoa
         o que foi pedido (visto no getter, node_modules/iwer/lib/layers/
         XRWebGLLayer.js) — não decide nada por conta própria. Provar "chegou
         true" é útil; provar "true é o valor CORRETO no Quest real" exige
         aparelho, e por isso não é a asserção principal deste caso. */
    });
  });
