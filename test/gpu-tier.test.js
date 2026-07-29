/* ================================================================
   QA — auto-tier de qualidade no PRIMEIRO boot (js/gputier.js).

   Até aqui todo mundo entrava com os mesmos padrões (res 1.5, sombra,
   bloom e SMAA ligados). Numa GPU integrada fraca isso é a diferença
   entre 60 e 25 FPS; numa RTX é qualidade jogada fora à toa.

   Duas travas que o módulo NÃO pode violar:
     1. escolha manual do jogador sempre vence e persiste — o auto só
        opina quando NÃO existe configuração salva;
     2. GPU desconhecida não é motivo pra castigar ninguém: cai no tier
        médio, nunca no mais baixo.
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let classifyGpu, presetFor, autoTierSettings, TIERS;
before(async () => {
  ({ classifyGpu, presetFor, autoTierSettings, TIERS } = await import('../js/gputier.js'));
});

describe('classifyGpu — string da GPU vira tier', () => {
  it('rasterizador de software cai no tier baixo', () => {
    for (const s of [
      'Google SwiftShader',
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
      'Mesa/X.org, llvmpipe (LLVM 15.0.6, 256 bits)',
      'Microsoft Basic Render Driver',
    ]) assert.equal(classifyGpu(s).tier, 'baixo', s);
  });

  it('GPU integrada antiga cai no tier baixo', () => {
    for (const s of [
      'ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Intel(R) HD Graphics 620',
      'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    ]) assert.equal(classifyGpu(s).tier, 'baixo', s);
  });

  it('integrada moderna (Iris Xe / Arc / Vega iGPU) cai no médio', () => {
    for (const s of [
      'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Intel, Intel(R) Arc(TM) Graphics, D3D11)',
      'ANGLE (AMD, AMD Radeon(TM) Vega 8 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    ]) assert.equal(classifyGpu(s).tier, 'medio', s);
  });

  it('dedicada moderna cai no alto', () => {
    for (const s of [
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Apple M2 Pro',
    ]) assert.equal(classifyGpu(s).tier, 'alto', s);
  });

  it('dedicada VELHA não passa por moderna', () => {
    for (const s of [
      'ANGLE (NVIDIA, NVIDIA GeForce GT 710 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (NVIDIA, NVIDIA GeForce GTX 750 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (NVIDIA, NVIDIA GeForce GT 1030 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (NVIDIA, NVIDIA GeForce MX150 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    ]) assert.notEqual(classifyGpu(s).tier, 'alto', s);
  });

  it('Linux/Mesa com GPU de verdade não vira "software"', () => {
    assert.equal(classifyGpu(
      'ANGLE (Mesa, AMD Radeon RX 6600 (radeonsi navi23 LLVM 15.0.6), OpenGL 4.6)').tier, 'alto');
    assert.equal(classifyGpu(
      'ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)').tier, 'baixo');
  });

  it('GPU de celular cai no baixo', () => {
    for (const s of ['Adreno (TM) 640', 'Mali-G76 MC4', 'PowerVR Rogue GE8320']) {
      assert.equal(classifyGpu(s).tier, 'baixo', s);
    }
  });

  it('GPU desconhecida NÃO é castigada: fica no médio, com motivo', () => {
    for (const s of ['', null, undefined, 'WebKit WebGL', 'GPU Marciana 9000']) {
      const r = classifyGpu(s);
      assert.equal(r.tier, 'medio', String(s));
      assert.ok(r.reason && r.reason.length > 0, 'sem motivo registrado');
    }
  });

  it('todo tier tem preset com as MESMAS chaves de SETTINGS', () => {
    const keys = ['res', 'shadow', 'bloom', 'aa'];
    for (const t of TIERS) {
      assert.deepEqual(Object.keys(presetFor(t)).sort(), [...keys].sort(), t);
      const p = presetFor(t);
      assert.ok(Number.isFinite(p.res) && p.res > 0, `${t}: res inválido (tela preta)`);
    }
  });

  it('o preset alto é o padrão histórico (quem já rodava bem não perde nada)', () => {
    assert.deepEqual(presetFor('alto'), { res: 1.5, shadow: 1, bloom: 1, aa: 1 });
  });

  it('SOMBRA fica ligada em todo tier — sem ela a medição dá só 4% de draw calls', () => {
    for (const t of TIERS) assert.equal(presetFor(t).shadow, 1, t);
  });

  it('o primeiro degrau é o SMAA (3 passes em resolução cheia)', () => {
    assert.equal(presetFor('medio').aa, 0);
    assert.equal(presetFor('medio').bloom, 1, 'médio já sacrificou bloom antes do AA');
  });

  it('quanto mais baixo o tier, menos custo — nunca o contrário', () => {
    const b = presetFor('baixo'), m = presetFor('medio'), a = presetFor('alto');
    assert.ok(b.res <= m.res && m.res <= a.res, 'resolução não é monotônica');
    for (const k of ['shadow', 'bloom', 'aa'])
      assert.ok(b[k] <= m[k] && m[k] <= a[k], `${k} não é monotônico`);
  });
});

describe('autoTierSettings — só opina no primeiro boot', () => {
  const gl = renderer => ({
    getExtension: name => (name === 'WEBGL_debug_renderer_info'
      ? { UNMASKED_RENDERER_WEBGL: 37446 } : null),
    getParameter: p => (p === 37446 ? renderer : 'algum vendor'),
  });

  it('sem configuração salva, aplica o preset do tier detectado', () => {
    const settings = { vol: 0.5, res: 1.5, shadow: 1, bloom: 1, ping: 1, autores: 1, aa: 1 };
    const r = autoTierSettings({ gl: gl('Google SwiftShader'), stored: null, settings });
    assert.equal(r.applied, true);
    assert.equal(r.tier, 'baixo');
    assert.deepEqual(
      { res: settings.res, shadow: settings.shadow, bloom: settings.bloom, aa: settings.aa },
      presetFor('baixo'));
    assert.equal(settings.vol, 0.5, 'mexeu em ajuste que não é de qualidade');
    assert.equal(settings.autores, 1, 'mexeu em autores');
  });

  it('COM configuração salva, não encosta em nada (escolha manual manda)', () => {
    const settings = { res: 2, shadow: 0, bloom: 1, aa: 0 };
    const r = autoTierSettings({ gl: gl('Google SwiftShader'), stored: '{"res":2}', settings });
    assert.equal(r.applied, false);
    assert.deepEqual(settings, { res: 2, shadow: 0, bloom: 1, aa: 0 });
    assert.ok(r.reason.includes('salva') || r.reason.includes('manual'), r.reason);
  });

  it('configuração salva VAZIA ainda conta como escolha do jogador', () => {
    const settings = { res: 1.5, shadow: 1, bloom: 1, aa: 1 };
    assert.equal(autoTierSettings({ gl: gl('Google SwiftShader'), stored: '{}', settings }).applied, false);
  });

  it('sem WebGL utilizável, não quebra e não aplica preset baixo às cegas', () => {
    const settings = { res: 1.5, shadow: 1, bloom: 1, aa: 1 };
    const r = autoTierSettings({ gl: null, stored: null, settings });
    assert.equal(r.tier, 'medio', 'sem GPU legível castigou o jogador');
    assert.deepEqual(
      { res: settings.res, shadow: settings.shadow, bloom: settings.bloom, aa: settings.aa },
      presetFor('medio'));
  });

  it('extensão bloqueada (navegador com privacidade) também cai no médio', () => {
    const settings = { res: 1.5, shadow: 1, bloom: 1, aa: 1 };
    const blind = { getExtension: () => null, getParameter: () => 'WebKit WebGL' };
    assert.equal(autoTierSettings({ gl: blind, stored: null, settings }).tier, 'medio');
  });

  it('?tier=off desliga o auto-tier mesmo sem configuração salva', () => {
    const settings = { res: 1.5, shadow: 1, bloom: 1, aa: 1 };
    const r = autoTierSettings({ gl: gl('Google SwiftShader'), stored: null, settings, search: '?tier=off' });
    assert.equal(r.applied, false);
    assert.deepEqual(settings, { res: 1.5, shadow: 1, bloom: 1, aa: 1 });
  });

  it('?tier=baixo força o preset mesmo COM configuração salva (suporte)', () => {
    const settings = { res: 2, shadow: 1, bloom: 1, aa: 1 };
    const r = autoTierSettings({ gl: gl('NVIDIA GeForce RTX 4090'), stored: '{"res":2}', settings, search: '?tier=baixo' });
    assert.equal(r.applied, true);
    assert.equal(r.tier, 'baixo');
    assert.deepEqual(settings, presetFor('baixo'));
  });

  it('devolve a string da GPU e o motivo pra registrar no console', () => {
    const settings = { res: 1.5, shadow: 1, bloom: 1, aa: 1 };
    const r = autoTierSettings({ gl: gl('NVIDIA GeForce RTX 4090'), stored: null, settings });
    assert.match(r.gpu, /RTX 4090/);
    assert.ok(r.reason.length > 0);
  });
});
