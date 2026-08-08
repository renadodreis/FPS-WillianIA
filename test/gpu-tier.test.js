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

let classifyGpu, presetFor, autoTierSettings, TIERS, ALL_TIERS, MOBILE_TIER;
before(async () => {
  ({ classifyGpu, presetFor, autoTierSettings, TIERS, ALL_TIERS, MOBILE_TIER } =
    await import('../js/gputier.js'));
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

  it('SOMBRA fica ligada em todo tier de DESKTOP — sem ela a medição dá só 4% de draw calls', () => {
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

/* ================================================================
   TIER MOBILE — o celular não é "um desktop fraco".

   A classificação por string de GPU não resolve celular: um iPhone 15
   ("Apple A17 Pro") e um Snapdragon topo de linha ("Adreno 750") caem no
   tier `baixo` pela regra de GPU móvel, e `baixo` mantém SOMBRA LIGADA.
   Em GPU móvel a sombra custa BANDA DE MEMÓRIA (passes de profundidade
   extra + amostragem), não draw calls — a medição dos 4% que justifica
   manter sombra vale só pra desktop.

   Daí um tier próprio, escolhido pelo sinal de dispositivo (não pela
   string da GPU), com corte agressivo pra caber em 60 FPS.
   ================================================================ */
describe('tier mobile — preset agressivo e fora da escada do desktop', () => {
  it('o preset mobile corta tudo o que é banda de memória', () => {
    assert.deepEqual(presetFor('mobile'), { res: 1, shadow: 0, bloom: 0, aa: 0 });
  });

  it('mobile é o ÚNICO tier sem sombra — e por banda, não por draw calls', () => {
    assert.equal(presetFor('mobile').shadow, 0);
    for (const t of TIERS) assert.equal(presetFor(t).shadow, 1, `${t} perdeu a sombra`);
  });

  it('o preset mobile tem as MESMAS chaves de SETTINGS (nada de undefined no boot)', () => {
    assert.deepEqual(Object.keys(presetFor('mobile')).sort(), ['aa', 'bloom', 'res', 'shadow']);
    assert.ok(Number.isFinite(presetFor('mobile').res) && presetFor('mobile').res > 0,
      'res inválido = tela preta');
  });

  it('mobile não entra em TIERS (escada monotônica do desktop), mas está em ALL_TIERS', () => {
    assert.deepEqual(TIERS, ['baixo', 'medio', 'alto'], 'a escada do desktop mudou');
    assert.ok(!TIERS.includes('mobile'), 'mobile virou degrau da escada de desktop');
    assert.equal(MOBILE_TIER, 'mobile');
    assert.ok(ALL_TIERS.includes('mobile'), 'quem valida tier não consegue aceitar mobile');
    for (const t of TIERS) assert.ok(ALL_TIERS.includes(t), t);
  });

  it('mobile nunca é mais caro que o tier baixo do desktop', () => {
    const mob = presetFor('mobile'), baixo = presetFor('baixo');
    for (const k of ['res', 'shadow', 'bloom', 'aa'])
      assert.ok(mob[k] <= baixo[k], `${k}: mobile ficou mais caro que baixo`);
  });
});

describe('autoTierSettings — celular vence a string da GPU', () => {
  const gl = renderer => ({
    getExtension: name => (name === 'WEBGL_debug_renderer_info'
      ? { UNMASKED_RENDERER_WEBGL: 37446 } : null),
    getParameter: p => (p === 37446 ? renderer : 'algum vendor'),
  });
  const fresh = () => ({ vol: 0.5, res: 1.5, shadow: 1, bloom: 1, ping: 1, autores: 1, aa: 1 });

  it('com sinal de mobile, o tier é mobile mesmo em GPU de celular topo de linha', () => {
    for (const s of ['Apple A17 Pro GPU', 'Adreno (TM) 750', 'Mali-G715-Immortalis MC11']) {
      const settings = fresh();
      const r = autoTierSettings({ gl: gl(s), stored: null, settings, mobile: true });
      assert.equal(r.applied, true, s);
      assert.equal(r.tier, 'mobile', `${s} caiu em "${r.tier}" — sombra ligada no celular`);
      assert.equal(settings.shadow, 0, s);
      assert.equal(settings.res, 1, s);
      assert.equal(settings.vol, 0.5, 'mexeu em ajuste que não é de qualidade');
    }
  });

  it('sem sinal de mobile, a classificação por GPU continua igual (nada regrediu)', () => {
    const settings = fresh();
    const r = autoTierSettings({ gl: gl('Adreno (TM) 640'), stored: null, settings });
    assert.equal(r.tier, 'baixo');
    assert.equal(settings.shadow, 1, 'desktop perdeu sombra por causa do tier mobile');
  });

  it('mobile NÃO fura a trava: existindo configuração salva, não encosta em nada', () => {
    const settings = { res: 2, shadow: 1, bloom: 1, aa: 1 };
    const r = autoTierSettings({ gl: gl('Adreno (TM) 750'), stored: '{"res":2}', settings, mobile: true });
    assert.equal(r.applied, false);
    assert.deepEqual(settings, { res: 2, shadow: 1, bloom: 1, aa: 1 });
  });

  it('?mobile=1 força o tier mobile mesmo numa RTX (QA reproduz no desktop)', () => {
    const settings = fresh();
    const r = autoTierSettings({ gl: gl('NVIDIA GeForce RTX 4090'), stored: null, settings,
      search: '?mobile=1' });
    assert.equal(r.tier, 'mobile');
    assert.equal(settings.shadow, 0);
  });

  it('?mobile=0 cancela a detecção errada e volta pra classificação por GPU', () => {
    const settings = fresh();
    const r = autoTierSettings({ gl: gl('NVIDIA GeForce RTX 4090'), stored: null, settings,
      mobile: true, search: '?mobile=0' });
    assert.equal(r.tier, 'alto');
    assert.equal(settings.shadow, 1);
  });

  it('?tier= é mais específico que ?mobile: o tier forçado ganha', () => {
    const settings = fresh();
    const r = autoTierSettings({ gl: gl('Adreno (TM) 750'), stored: null, settings,
      mobile: true, search: '?tier=alto' });
    assert.equal(r.tier, 'alto');
    assert.deepEqual(presetFor('alto'), { res: settings.res, shadow: settings.shadow,
      bloom: settings.bloom, aa: settings.aa });
  });

  it('?tier=mobile força o preset de celular (suporte)', () => {
    const settings = { res: 2, shadow: 1, bloom: 1, aa: 1 };
    const r = autoTierSettings({ gl: gl('NVIDIA GeForce RTX 4090'), stored: '{"res":2}', settings,
      search: '?tier=mobile' });
    assert.equal(r.applied, true);
    assert.equal(r.tier, 'mobile');
    assert.deepEqual(settings, presetFor('mobile'));
  });

  it('?tier=off desliga o auto-tier mesmo com sinal de mobile', () => {
    const settings = fresh();
    const r = autoTierSettings({ gl: gl('Adreno (TM) 750'), stored: null, settings,
      mobile: true, search: '?tier=off' });
    assert.equal(r.applied, false);
    assert.deepEqual(settings, fresh());
  });

  it('o motivo diz que foi o dispositivo, não a GPU (diagnóstico no console)', () => {
    const settings = fresh();
    const r = autoTierSettings({ gl: gl('Adreno (TM) 750'), stored: null, settings, mobile: true });
    assert.match(r.reason, /dispositivo m[óo]vel/i, `motivo não cita o dispositivo: ${r.reason}`);
    assert.match(r.gpu, /Adreno/);
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
