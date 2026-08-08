/* ================================================================
   QA — DETECÇÃO DE DISPOSITIVO MÓVEL (js/mobile.js).

   O jogo precisa saber se está num celular ANTES de montar renderer,
   pós-processamento e controles: no celular o preset é outro (sombra
   fora, resolução 1) e o corte tem que valer no primeiro frame.

   Três armadilhas que este teste existe pra travar:
     1. iPadOS moderno MENTE no user-agent — diz "Macintosh". Sem o par
        (platform MacIntel + maxTouchPoints > 1) todo iPad entraria como
        desktop e rodaria no preset alto.
     2. Touch NÃO é sinônimo de celular. Notebook Windows com tela de
        toque é DESKTOP; classificar por `maxTouchPoints > 0` puro
        entregaria controles de toque e preset cortado pra quem tem GPU
        dedicada.
     3. `?mobile=1` / `?mobile=0` tem que vencer tudo — QA e suporte
        precisam reproduzir o modo móvel num desktop e escapar de uma
        detecção errada sem esperar release.

   O módulo é PURO: recebe o ambiente por parâmetro. Nada de ler
   navigator/window dentro da lógica (isso é o wrapper fino).
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let detectMobile, mobileOverrideFrom, mobileEnv, isMobileEnv,
  TABLET_MIN_SIDE, COARSE_MAX_SIDE;
before(async () => {
  ({ detectMobile, mobileOverrideFrom, mobileEnv, isMobileEnv,
    TABLET_MIN_SIDE, COARSE_MAX_SIDE } = await import('../js/mobile.js'));
});

/* user-agents reais (2024/2025) */
const UA = {
  pixel: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  ipadOld: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  // iPadOS >= 13 no Safari: idêntico ao de um Mac
  ipadLying: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  galaxyTab: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  winTouch: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // Android genérico de fabricante obscuro: nenhum token conhecido no UA
  androidAnon: 'Mozilla/5.0 (Linux; U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

describe('detectMobile — celular de verdade entra, notebook com toque não', () => {
  it('Android (Pixel) é celular', () => {
    const r = detectMobile({ userAgent: UA.pixel, maxTouchPoints: 5, platform: 'Linux armv8l',
      screenW: 412, screenH: 915, matchesCoarse: true });
    assert.equal(r.mobile, true);
    assert.equal(r.kind, 'phone');
    assert.ok(r.reason.length > 0, 'sem motivo registrado');
  });

  it('iPhone é celular', () => {
    const r = detectMobile({ userAgent: UA.iphone, maxTouchPoints: 5, platform: 'iPhone',
      screenW: 390, screenH: 844, matchesCoarse: true });
    assert.equal(r.mobile, true);
    assert.equal(r.kind, 'phone');
  });

  it('iPad com UA antigo é tablet', () => {
    const r = detectMobile({ userAgent: UA.ipadOld, maxTouchPoints: 5, platform: 'iPad',
      screenW: 810, screenH: 1080, matchesCoarse: true });
    assert.equal(r.mobile, true);
    assert.equal(r.kind, 'tablet');
  });

  it('iPadOS MENTINDO "Macintosh" ainda é tablet (platform MacIntel + toque)', () => {
    const r = detectMobile({ userAgent: UA.ipadLying, maxTouchPoints: 5, platform: 'MacIntel',
      screenW: 1024, screenH: 1366, matchesCoarse: true });
    assert.equal(r.mobile, true, 'iPad entrou como desktop — rodaria no preset alto');
    assert.equal(r.kind, 'tablet');
    assert.match(r.reason, /ipad/i);
  });

  it('Mac de verdade (MacIntel SEM toque) é desktop', () => {
    const r = detectMobile({ userAgent: UA.mac, maxTouchPoints: 0, platform: 'MacIntel',
      screenW: 1728, screenH: 1117, matchesCoarse: false });
    assert.equal(r.mobile, false);
    assert.equal(r.kind, 'desktop');
  });

  it('NOTEBOOK Windows com tela de toque é DESKTOP — touch não é celular', () => {
    const r = detectMobile({ userAgent: UA.winTouch, maxTouchPoints: 10, platform: 'Win32',
      screenW: 1920, screenH: 1080, matchesCoarse: false });
    assert.equal(r.mobile, false, 'notebook com touch caiu no modo celular');
    assert.equal(r.kind, 'desktop');
  });

  it('nem com ponteiro grosso: tela grande continua desktop', () => {
    const r = detectMobile({ userAgent: UA.winTouch, maxTouchPoints: 10, platform: 'Win32',
      screenW: 1920, screenH: 1200, matchesCoarse: true });
    assert.equal(r.mobile, false, 'monitor/all-in-one touch virou celular');
  });

  it('Android sem token conhecido no UA entra pelo trio toque+ponteiro grosso+tela pequena', () => {
    const r = detectMobile({ userAgent: UA.androidAnon, maxTouchPoints: 5, platform: 'Linux armv8l',
      screenW: 393, screenH: 873, matchesCoarse: true });
    assert.equal(r.mobile, true);
    assert.equal(r.kind, 'phone');
  });

  it('faltando QUALQUER peça do trio, não classifica como celular', () => {
    const base = { userAgent: UA.androidAnon, maxTouchPoints: 5, platform: 'Linux armv8l',
      screenW: 393, screenH: 873, matchesCoarse: true };
    assert.equal(detectMobile({ ...base, maxTouchPoints: 0 }).mobile, false, 'sem toque');
    assert.equal(detectMobile({ ...base, matchesCoarse: false }).mobile, false, 'ponteiro fino');
    assert.equal(detectMobile({ ...base, screenW: 1920, screenH: 1080 }).mobile, false, 'tela grande');
  });

  it('desktop puro (Linux/X11, sem toque) é desktop', () => {
    const r = detectMobile({ userAgent: UA.linux, maxTouchPoints: 0, platform: 'Linux x86_64',
      screenW: 2560, screenH: 1440, matchesCoarse: false });
    assert.equal(r.mobile, false);
    assert.equal(r.kind, 'desktop');
  });
});

describe('detectMobile — phone x tablet sai do MENOR lado da tela', () => {
  it('tablet Android (UA sem "Mobile") vira tablet pelo tamanho', () => {
    const r = detectMobile({ userAgent: UA.galaxyTab, maxTouchPoints: 5, platform: 'Linux armv8l',
      screenW: 1600, screenH: 1000, matchesCoarse: true });
    assert.equal(r.mobile, true);
    assert.equal(r.kind, 'tablet');
  });

  it('o limite phone/tablet é o menor lado, não a orientação', () => {
    const retrato = detectMobile({ userAgent: UA.pixel, maxTouchPoints: 5, platform: 'Linux armv8l',
      screenW: TABLET_MIN_SIDE, screenH: 1200, matchesCoarse: true });
    const paisagem = detectMobile({ userAgent: UA.pixel, maxTouchPoints: 5, platform: 'Linux armv8l',
      screenW: 1200, screenH: TABLET_MIN_SIDE, matchesCoarse: true });
    assert.equal(retrato.kind, 'tablet', 'no limite já é tablet');
    assert.equal(paisagem.kind, retrato.kind, 'girar o aparelho mudou a classe');
  });

  it('um pixel abaixo do limite ainda é phone', () => {
    const r = detectMobile({ userAgent: UA.pixel, maxTouchPoints: 5, platform: 'Linux armv8l',
      screenW: TABLET_MIN_SIDE - 1, screenH: 1200, matchesCoarse: true });
    assert.equal(r.kind, 'phone');
  });

  it('os limites são coerentes: tablet cabe dentro da janela do ponteiro grosso', () => {
    assert.ok(Number.isFinite(TABLET_MIN_SIDE) && TABLET_MIN_SIDE > 0);
    assert.ok(Number.isFinite(COARSE_MAX_SIDE) && COARSE_MAX_SIDE > TABLET_MIN_SIDE);
  });
});

describe('mobileOverrideFrom — QA e suporte forçam o modo', () => {
  it('?mobile=1 liga, ?mobile=0 desliga, sem parâmetro é null', () => {
    assert.equal(mobileOverrideFrom('?mobile=1'), true);
    assert.equal(mobileOverrideFrom('?mobile=0'), false);
    assert.equal(mobileOverrideFrom('?tier=alto&mobile=1'), true);
    assert.equal(mobileOverrideFrom('?mobile=0&tier=alto'), false);
    assert.equal(mobileOverrideFrom(''), null);
    assert.equal(mobileOverrideFrom('?tier=alto'), null);
    assert.equal(mobileOverrideFrom(undefined), null);
    assert.equal(mobileOverrideFrom(null), null);
  });

  it('valor lixo não é override (não vira "true" por existir o parâmetro)', () => {
    assert.equal(mobileOverrideFrom('?mobile=talvez'), null);
    assert.equal(mobileOverrideFrom('?mobiles=1'), null);
    assert.equal(mobileOverrideFrom('?nomobile=1'), null);
  });

  it('?mobile=1 força celular num desktop sem toque nenhum', () => {
    const r = detectMobile({ userAgent: UA.linux, maxTouchPoints: 0, platform: 'Linux x86_64',
      screenW: 2560, screenH: 1440, matchesCoarse: false, search: '?mobile=1' });
    assert.equal(r.mobile, true);
    assert.notEqual(r.kind, 'desktop');
    assert.match(r.reason, /mobile=1/);
  });

  it('?mobile=0 desliga até num iPhone (escape de detecção errada)', () => {
    const r = detectMobile({ userAgent: UA.iphone, maxTouchPoints: 5, platform: 'iPhone',
      screenW: 390, screenH: 844, matchesCoarse: true, search: '?mobile=0' });
    assert.equal(r.mobile, false);
    assert.equal(r.kind, 'desktop');
    assert.match(r.reason, /mobile=0/);
  });
});

describe('detectMobile — entrada lixo não pode LANÇAR (boot morreria)', () => {
  it('sem argumento nenhum, responde desktop com motivo', () => {
    for (const arg of [undefined, null, {}, 'texto', 42, [], NaN]) {
      let r;
      assert.doesNotThrow(() => { r = detectMobile(arg); }, `lançou com ${String(arg)}`);
      assert.equal(typeof r.mobile, 'boolean', String(arg));
      assert.ok(r.reason.length > 0, String(arg));
    }
  });

  it('campos corrompidos (NaN, string, negativo) não viram celular por acidente', () => {
    const r = detectMobile({ userAgent: 12345, maxTouchPoints: 'muitos', platform: null,
      screenW: NaN, screenH: -1, matchesCoarse: 'sim', search: {} });
    assert.equal(typeof r.mobile, 'boolean');
    assert.equal(r.mobile, false, 'lixo virou celular');
  });

  it('a resposta é sempre coerente: kind desktop se e só se mobile false', () => {
    const casos = [
      { userAgent: UA.pixel, maxTouchPoints: 5, screenW: 412, screenH: 915, matchesCoarse: true },
      { userAgent: UA.winTouch, maxTouchPoints: 10, screenW: 1920, screenH: 1080 },
      { userAgent: UA.ipadLying, platform: 'MacIntel', maxTouchPoints: 5, screenW: 1024, screenH: 1366 },
      {},
    ];
    for (const c of casos) {
      const r = detectMobile(c);
      assert.equal(r.kind === 'desktop', !r.mobile, JSON.stringify(c).slice(0, 60));
      assert.ok(['phone', 'tablet', 'desktop'].includes(r.kind), r.kind);
    }
  });
});

describe('mobileEnv / isMobileEnv — wrapper fino do ambiente real', () => {
  const navOf = (o) => ({ userAgent: '', maxTouchPoints: 0, platform: '', ...o });
  const winOf = (o) => ({ screen: { width: 1920, height: 1080 },
    matchMedia: () => ({ matches: false }), location: { search: '' }, ...o });

  it('lê UA/toque/tela do navigator e window injetados', () => {
    const nav = navOf({ userAgent: UA.pixel, maxTouchPoints: 5, platform: 'Linux armv8l' });
    const win = winOf({ screen: { width: 412, height: 915 }, matchMedia: () => ({ matches: true }) });
    assert.equal(mobileEnv(nav, win).mobile, true);
    assert.equal(isMobileEnv(nav, win), true);
    assert.equal(mobileEnv(nav, win).kind, 'phone');
  });

  it('lê o ?mobile= da location injetada', () => {
    const nav = navOf({ userAgent: UA.linux, platform: 'Linux x86_64' });
    const win = winOf({ location: { search: '?mobile=1' } });
    assert.equal(isMobileEnv(nav, win), true);
  });

  it('sem navigator/window (node, teste, worker) devolve desktop sem lançar', () => {
    assert.doesNotThrow(() => isMobileEnv());
    assert.equal(isMobileEnv(), false);
    assert.equal(mobileEnv().kind, 'desktop');
    assert.equal(mobileEnv(null, null).mobile, false);
  });

  it('matchMedia ausente ou explodindo não derruba o boot', () => {
    const nav = navOf({ userAgent: UA.pixel, maxTouchPoints: 5 });
    assert.doesNotThrow(() => mobileEnv(nav, winOf({ matchMedia: undefined })));
    assert.doesNotThrow(() => mobileEnv(nav, winOf({ matchMedia: () => { throw new Error('x'); } })));
    // UA de celular ainda é reconhecido mesmo sem o sinal de ponteiro
    assert.equal(mobileEnv(nav, winOf({ matchMedia: undefined })).mobile, true);
  });

  it('isMobileEnv devolve BOOLEAN e mobileEnv o registro completo', () => {
    const nav = navOf({ userAgent: UA.iphone, maxTouchPoints: 5, platform: 'iPhone' });
    const win = winOf({ screen: { width: 390, height: 844 } });
    assert.equal(typeof isMobileEnv(nav, win), 'boolean');
    const r = mobileEnv(nav, win);
    assert.deepEqual(Object.keys(r).sort(), ['kind', 'mobile', 'reason']);
  });
});
