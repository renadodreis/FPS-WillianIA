/* ================================================================
   QA — glare do céu (compressão soft-Reinhard adaptativa).

   Bug: no golden hour o `mieCoefficient` sobe ~10× (0,0008 -> 0,0078) e o
   halo do sol vira uma área enorme acima do limiar do bloom (1,0). O céu
   saturava em 1/0,55 = 1,82, então TODA radiância bruta acima de 2,22
   florescia — o horizonte inteiro virava borrão branco.

   Correção: a compressão vira uniform e acompanha o próprio halo. Fora do
   golden hour o valor é EXATAMENTE o antigo, então o dia normal não muda
   um pixel.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { CHROME, bootGame } = require('./helpers/harness.js');

describe('Glare do céu (Chrome headless)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootGame({ port: 3295 }); });
  after(async () => { if (h) await h.close(); });

  const noCeu = fn => h.play(fn);

  it('o céu expõe uGlare e o shader realmente usa o uniform', async () => {
    const r = await noCeu(() => {
      let ceu = null;
      window.QA.MP.scene.traverse(o => {
        if (!ceu && o.material && o.material.uniforms && o.material.uniforms.sunPosition) ceu = o;
      });
      return {
        temUniform: !!(ceu && ceu.material.uniforms.uGlare),
        declara: !!(ceu && /uniform float uGlare;/.test(ceu.material.fragmentShader)),
        usa: !!(ceu && /1\.0 \+ uGlare \* texColor/.test(ceu.material.fragmentShader)),
        semLiteralAntigo: !!(ceu && !/1\.0 \+ 0\.55 \* texColor/.test(ceu.material.fragmentShader)),
      };
    });
    assert.equal(r.temUniform, true, 'uniform uGlare ausente');
    assert.equal(r.declara, true, 'o shader não declara uGlare — compilaria quebrado');
    assert.equal(r.usa, true, 'o shader não usa uGlare na compressão');
    assert.equal(r.semLiteralAntigo, true, 'sobrou o 0.55 fixo no shader');
  });

  it('dia normal NÃO muda: sem golden hour nem chuva, a compressão é a de antes', async () => {
    const r = await noCeu(() => {
      const G = window.QA.G;
      G.Env.weather = 'limpo';
      G.Env.tod = 0.50;              // meio-dia: goldenK = 0
      window.QA.tick(4);
      let ceu = null;
      window.QA.MP.scene.traverse(o => {
        if (!ceu && o.material && o.material.uniforms && o.material.uniforms.uGlare) ceu = o;
      });
      return { glare: ceu.material.uniforms.uGlare.value, golden: G.Env.goldenK,
        base: window.QA.MP.CFG.GLARE_BASE };
    });
    assert.equal(r.golden, 0, 'pré-condição: meio-dia não é golden hour');
    assert.equal(r.glare, r.base, `compressão do dia mudou: ${r.glare} != ${r.base}`);
  });

  it('golden hour aperta a compressão até o teto configurado', async () => {
    const r = await noCeu(() => {
      const G = window.QA.G;
      G.Env.weather = 'limpo';
      G.Env.tod = 0.72;              // pico do golden hour
      window.QA.tick(4);
      let ceu = null;
      window.QA.MP.scene.traverse(o => {
        if (!ceu && o.material && o.material.uniforms && o.material.uniforms.uGlare) ceu = o;
      });
      const CFG = window.QA.MP.CFG;
      return { glare: ceu.material.uniforms.uGlare.value, golden: G.Env.goldenK,
        mie: ceu.material.uniforms.mieCoefficient.value, max: CFG.GLARE_MAX, base: CFG.GLARE_BASE };
    });
    assert.equal(r.golden, 1, 'pré-condição: tod 0.72 tem que ser golden hour pleno');
    assert.ok(r.mie > 0.007, `pré-condição: halo de Mie não cresceu (${r.mie})`);
    assert.ok(Math.abs(r.glare - r.max) < 1e-6, `compressão não chegou ao teto: ${r.glare}`);
    assert.ok(r.glare > r.base, 'compressão não apertou no golden hour');
  });

  it('a faixa de céu que floresce encolhe pelo menos 2× no golden hour', async () => {
    // brilha acima de t onde t/(1+k*t) = 1  =>  t = 1/(1-k)
    const r = await noCeu(() => {
      const CFG = window.QA.MP.CFG;
      return { base: CFG.GLARE_BASE, max: CFG.GLARE_MAX };
    });
    const limiar = k => 1 / (1 - k);
    assert.ok(r.max < 1, 'GLARE_MAX >= 1 mataria o brilho do sol por completo');
    assert.ok(limiar(r.max) >= 2 * limiar(r.base),
      `barra do bloom subiu pouco: ${limiar(r.base).toFixed(2)} -> ${limiar(r.max).toFixed(2)}`);
  });

  it('chuva também aperta (mie sobe com o clima)', async () => {
    const r = await noCeu(() => {
      const G = window.QA.G;
      G.Env.tod = 0.50;
      G.Env.weather = 'limpo'; window.QA.tick(4);
      let ceu = null;
      window.QA.MP.scene.traverse(o => {
        if (!ceu && o.material && o.material.uniforms && o.material.uniforms.uGlare) ceu = o;
      });
      const limpo = ceu.material.uniforms.uGlare.value;
      G.Env.weather = 'chuva'; window.QA.tick(400); // weatherK sobe suavizado
      return { limpo, chuva: ceu.material.uniforms.uGlare.value };
    });
    assert.ok(r.chuva > r.limpo, `chuva não apertou a compressão: ${r.limpo} -> ${r.chuva}`);
  });

  it('boot limpo: sem erro de console nem pageerror', () => {
    assert.deepEqual(h.pageErrors, []);
    assert.deepEqual(h.consoleErrors, []);
  });
});
