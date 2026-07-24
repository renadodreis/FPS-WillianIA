/* ================================================================
   QA — motor de customização (lote 2): buildVoxelBody + retint, a base
   do preview 3D do lobby (R7), do re-tint ao vivo do avatar remoto (R5) e
   das cores validadas. A UI do lobby (presets/preview/aleatório) é
   verificada por captura (scripts/capture-lobby.js). Porta 3264.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

describe('Customização — buildBody + retint', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  const PORT = 3264;
  before(async () => {
    h = await bootGame({ port: PORT, extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '300' } });
    await h.page.waitForFunction(
      "window.__BR_debug && typeof window.__BR_debug.buildBody === 'function'", { timeout: 60000 });
  });
  after(async () => { if (h) await h.close(); });

  it('buildBody aplica as 4 cores nos materiais certos e expõe retint', async () => {
    const r = await h.play(() => {
      const b = window.__BR_debug.buildBody(['#ff0000', '#00ff00', '#0000ff', '#ffff00']);
      const out = {
        corpo: b.mats[0].color.getHexString(),
        roupa: b.mats[1].color.getHexString(),
        detalhe: b.mats[2].color.getHexString(),
        visor: b.mVisor.color.getHexString(),
        visorEmissive: b.mVisor.emissive.getHexString(),
        hasRetint: typeof b.retint === 'function',
        hasCanopy: !!b.canopy,
      };
      return out;
    });
    assert.equal(r.corpo, 'ff0000');
    assert.equal(r.roupa, '00ff00');
    assert.equal(r.detalhe, '0000ff');
    assert.equal(r.visor, 'ffff00');
    assert.equal(r.visorEmissive, 'ffff00', 'visor não é emissivo na própria cor');
    assert.ok(r.hasRetint, 'retint não exposto');
    assert.ok(r.hasCanopy, 'canopy não exposto');
  });

  it('retint troca as cores do boneco JÁ criado (sem recriar) — R5/R7', async () => {
    const r = await h.play(() => {
      const b = window.__BR_debug.buildBody(['#ff0000', '#00ff00', '#0000ff', '#ffff00']);
      const before = b.mats[0].color.getHexString();
      b.retint(['#123456', '#654321', '#abcdef', '#0f0f0f']);
      return {
        before, corpo: b.mats[0].color.getHexString(), visor: b.mVisor.color.getHexString(),
        cVisor: b.cVisor.getHexString(), canopy: b.canopy.material.color.getHexString(),
      };
    });
    assert.equal(r.before, 'ff0000');
    assert.equal(r.corpo, '123456', 'corpo não re-tingiu');
    assert.equal(r.visor, '0f0f0f', 'visor não re-tingiu');
    assert.equal(r.cVisor, '0f0f0f', 'cVisor base não atualizou (flash restauraria cor errada)');
    assert.equal(r.canopy, '123456', 'paraquedas não re-tingiu com a cor do corpo');
  });

  it('cor inválida no retint cai no default (nunca vira branco)', async () => {
    const r = await h.play(() => {
      const b = window.__BR_debug.buildBody(['#ff0000', '#00ff00', '#0000ff', '#ffff00']);
      b.retint(['garbage', 'red', '#zz', null]);
      return { corpo: b.mats[0].color.getHexString(), visor: b.mVisor.color.getHexString() };
    });
    // defaults: corpo #4da6ff, visor #ffd76a
    assert.equal(r.corpo, '4da6ff');
    assert.equal(r.visor, 'ffd76a');
  });

  it('não gerou erros de página', async () => {
    const errs = await h.play(() => window.__game.errors.slice());
    assert.deepEqual(errs, [], `erros: ${errs.join(' | ')}`);
  });
});
