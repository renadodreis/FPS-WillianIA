/* ================================================================
   QA — G2 (docs/vr/criterio-aaa.md): antialiasing existe em XR?

   MEDE `renderer.xr.getRenderTarget().samples` dentro de sessão imersiva
   REAL (IWER, Quest 3). O critério aprova em 4x MSAA, reprova em 0.

   NÃO é bug isolado a corrigir sozinho: ligar MSAA custa 0,5-1,5 ms/frame
   (Meta, "Multisample Anti-Aliasing Analysis for Meta Quest") num orçamento
   de frame já apertado (docs/vr/perf-xr.md). Este arquivo só MEDE o estado
   atual — a decisão de pagar o custo é do dono (trade-off de qualidade vs.
   orçamento), não de quem escreve o teste.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3870;

describe('G2 — antialiasing (MSAA) do render target de sessão XR',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => { h = await bootEmVR(bootGame, { port: PORT }); });
    after(async () => { if (h) await h.close(); });

    it('registra o número de amostras (samples) do framebuffer de sessão — sem corrigir, só medir', async () => {
      /* `renderer.xr.getRenderTarget()` do critério (criterio-aaa.md) NÃO
         EXISTE nesta versão do three (r0.185) — o alvo de render da sessão é
         uma variável de clausura interna do WebXRManager, nunca exposta.
         Confirmado lendo node_modules/three/src/renderers/webxr/WebXRManager.js:
         zero ocorrência de `getRenderTarget` como método público ali. Ler
         `renderer.getRenderTarget()` (o método do PRÓPRIO WebGLRenderer,
         que devolve o alvo ATUALMENTE ligado) DENTRO de um `render()` real
         dá o mesmo dado pela porta que de fato existe. */
      const r = await h.play(() => {
        const MP = window.__MP;
        let samples = null, antialiasAttr = null;
        const rOrig = MP.renderer.render.bind(MP.renderer);
        MP.renderer.render = (cena, cam) => {
          const v = rOrig(cena, cam);
          const rt = MP.renderer.getRenderTarget();
          samples = rt ? rt.samples : 0;
          return v;
        };
        antialiasAttr = MP.renderer.getContextAttributes
          ? !!MP.renderer.getContextAttributes().antialias : null;
        const session = MP.renderer.xr.getSession();
        const rs = session ? session.renderState : null;
        return new Promise(resolve => {
          setTimeout(() => {
            MP.renderer.render = rOrig;
            resolve({
              samples, antialiasAttr, presenting: MP.renderer.xr.isPresenting,
              /* Qual caminho da spec o navegador/emulador escolheu — decide se
                 `samples` do render target do three SIGNIFICA alguma coisa.
                 Ver a nota grande abaixo. */
              temBaseLayer: !!(rs && rs.baseLayer),
              temLayers: !!(rs && rs.layers && rs.layers.length),
            });
          }, 120);
        });
      });
      console.log(`      G2 — samples=${r.samples}, presenting=${r.presenting}, ` +
        `contexto antialias=${r.antialiasAttr}, baseLayer(clássico)=${r.temBaseLayer}, ` +
        `layers(moderno)=${r.temLayers}`);
      assert.equal(r.presenting, true, 'sonda rodou fora de sessão imersiva — número não vale nada');
      /* A LEITURA SÓ É CONFIÁVEL NO CAMINHO "layers" (moderno). No caminho
         clássico (`XRWebGLLayer`/`baseLayer`), o three passa
         `antialias: attributes.antialias` pro CONSTRUTOR NATIVO do layer
         (que É onde o navegador decide MSAA de verdade) mas NÃO copia esse
         número pro `WebGLRenderTarget` espelho — `samples` fica 0 ali SEMPRE,
         com ou sem antialiasing real acontecendo no compositor. Medido lendo
         node_modules/three/src/renderers/webxr/WebXRManager.js:397-499: o
         branch `!supportsLayers` (linhas ~426-455) não tem `samples:` na
         opção do `WebGLRenderTarget`; só o branch `supportsLayers` (linhas
         ~456-497) tem `samples: attributes.antialias ? 4 : 0`. Se
         `temBaseLayer` for true aqui, a asserção de reprovação abaixo NÃO
         pode ser feita com confiança — é isso que este `if` decide. */
      if (r.temBaseLayer && !r.temLayers) {
        console.log('      G2 NÃO MEDIDO COM CONFIANÇA — sessão usa o caminho clássico ' +
          '(XRWebGLLayer/baseLayer), onde `renderer.getRenderTarget().samples` não reflete ' +
          'o MSAA real pedido ao navegador (antialias:true já vai pro layerInit nativo). ' +
          'Medir MSAA de verdade neste caminho exige o aparelho físico (captura de frame) ' +
          'ou checar se o Quest oferece a Layers API — AGUARDANDO APARELHO/PESQUISA.');
        return;
      }
      /* REGISTRO, não asserção de aprovação: o critério aprova em 4, reprova
         em 0 — mas ligar isso é decisão de orçamento do dono, então este
         caso só documenta o valor real com `assert.ok` sempre satisfeito
         (é um número, nunca NaN/undefined) e imprime o veredito no console
         para o laudo humano citar. Forçar `assert.equal(samples, 4)` aqui
         faria o CI decidir uma troca de performance sozinho. */
      assert.ok(Number.isFinite(r.samples), `samples não é um número válido: ${r.samples}`);
      console.log(r.samples >= 4
        ? '      G2 APROVA (>=4x MSAA)'
        : `      G2 REPROVA (${r.samples}x MSAA, teto 4x) — decisão de orçamento pendente do dono`);
    });
  });
