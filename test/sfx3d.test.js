/* ================================================================
   QA — áudio espacial: núcleo puro (js/sfx3d.js) + contrato de
   no-op do catálogo (js/sfx.js sem AudioContext).
   Roda em Node puro (sem porta, sem browser, sem WebAudio).
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let S3, SFX;
before(async () => {
  S3 = await import('../js/sfx3d.js');
  const { createSFX } = await import('../js/sfx.js');
  SFX = createSFX({
    SETTINGS: { vol: 0.6 },
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    rand: (a, b) => (b === undefined ? a * 0.5 : (a + b) / 2),
  });
});

describe('Atenuação por distância', () => {
  it('mantém volume cheio dentro da distância de referência', () => {
    assert.equal(S3.distanceGain('gun', 0), 1);
    assert.equal(S3.distanceGain('gun', S3.CATS.gun.ref), 1);
  });
  it('cai monotonicamente com a distância', () => {
    let prev = Infinity;
    for (const d of [0, 10, 20, 40, 80, 160, 320]) {
      const g = S3.distanceGain('gun', d);
      assert.ok(g <= prev, `ganho subiu em ${d} m`);
      prev = g;
    }
  });
  it('modelo inverso bate com o do PannerNode (ref/(ref+roll*(d-ref)))', () => {
    const c = S3.CATS.gun;
    const d = 40, esperado = c.ref / (c.ref + c.roll * (d - c.ref));
    assert.ok(Math.abs(S3.distanceGain('gun', d) - esperado) < 1e-12);
    assert.ok(Math.abs(S3.distanceGain('gun', 40) - 0.3) < 1e-9, 'tiro a 40 m ≈ 30%');
  });
  it('trava no maxDistance: além dele o ganho não continua caindo', () => {
    const c = S3.CATS.gun;
    assert.equal(S3.distanceGain('gun', c.max), S3.distanceGain('gun', c.max * 3));
  });
  it('tiro alcança MUITO mais longe que um passo', () => {
    assert.ok(S3.distanceGain('gun', 60) > S3.distanceGain('small', 60) * 3);
  });
  it('explosão domina o mapa: audível de uma ponta à outra (1100 m de lado)', () => {
    assert.ok(S3.distanceGain('boom', 420) > 0.06, 'ribombo sumiu no mapa inteiro');
  });
});

describe('Corte por alcance (não gasta voz no que ninguém ouve)', () => {
  it('passo distante nem chega a pedir voz', () => {
    assert.ok(S3.audible('small', 20));
    assert.ok(!S3.audible('small', 200));
  });
  it('tiro a 300 m ainda pede voz', () => {
    assert.ok(S3.audible('gun', 300));
    assert.ok(!S3.audible('gun', 400));
  });
});

/* helper: voz sintética pro pool */
function voz(cat, dist, t0 = 0, dur = 1, freeAt = 999) {
  return { cat, dist, t0, dur, freeAt };
}

describe('Pool de vozes — teto e roubo', () => {
  it('reaproveita voz já vencida antes de criar outra', () => {
    const vs = [voz('gun', 10, 0, 1, 0.5), voz('gun', 10, 0, 1, 999)];
    assert.equal(S3.acquireVoice(vs, { cat: 'gun', dist: 5, dur: 0.5 }, 1), 0);
  });
  it('cresce sob demanda até o teto e nunca além', () => {
    const vs = [];
    for (let i = 0; i < S3.MAX_VOICES; i++) {
      const idx = S3.acquireVoice(vs, { cat: 'gun', dist: 20, dur: 1 }, 0);
      assert.equal(idx, i, 'deveria alocar uma voz nova');
      vs.push(voz('gun', 20, 0, 1, 1));
    }
    assert.equal(vs.length, S3.MAX_VOICES);
    // pool cheio e tudo vivo: só entra roubando
    const idx = S3.acquireVoice(vs, { cat: 'gun', dist: 20, dur: 1 }, 0);
    assert.ok(idx < S3.MAX_VOICES, 'estourou o teto de vozes');
  });
  it('rouba a mais DISTANTE quando a prioridade empata', () => {
    const vs = [];
    for (let i = 0; i < S3.MAX_VOICES; i++) vs.push(voz('gun', 20 + i, 0, 1, 1));
    const idx = S3.acquireVoice(vs, { cat: 'gun', dist: 1, dur: 1 }, 0);
    assert.equal(idx, S3.MAX_VOICES - 1, 'a voz mais longe é que deveria perder');
  });
  it('rouba a mais ANTIGA quando prioridade e distância empatam', () => {
    const vs = [];
    for (let i = 0; i < S3.MAX_VOICES; i++) vs.push(voz('gun', 20, -i * 0.1, 1, 1));
    const idx = S3.acquireVoice(vs, { cat: 'gun', dist: 20, dur: 1 }, 0);
    assert.equal(idx, S3.MAX_VOICES - 1, 'a voz mais velha é que deveria perder');
  });
  it('explosão rouba de tiro (prioridade maior ganha mesmo estando longe)', () => {
    const vs = [];
    for (let i = 0; i < S3.MAX_VOICES; i++) vs.push(voz('gun', 5, 0, 1, 1));
    assert.ok(S3.acquireVoice(vs, { cat: 'boom', dist: 300, dur: 1 }, 0) >= 0);
  });
  it('passo longe NÃO rouba tiro perto — o som some em vez de estragar o mix', () => {
    const vs = [];
    for (let i = 0; i < S3.MAX_VOICES; i++) vs.push(voz('gun', 5, 0, 1, 1));
    assert.equal(S3.acquireVoice(vs, { cat: 'small', dist: 40, dur: 1 }, 0), -1);
  });
  it('recusa direto o que está fora do alcance audível', () => {
    assert.equal(S3.acquireVoice([], { cat: 'small', dist: 500, dur: 1 }, 0), -1);
  });
});

describe('voiceScore', () => {
  it('perto vale mais que longe', () => {
    assert.ok(S3.voiceScore(voz('gun', 5), 0) > S3.voiceScore(voz('gun', 200), 0));
  });
  it('recém-disparada vale mais que quase acabada', () => {
    assert.ok(S3.voiceScore(voz('gun', 20, 1, 1), 1) > S3.voiceScore(voz('gun', 20, 0, 1), 0.9));
  });
  it('prioridade domina distância', () => {
    assert.ok(S3.voiceScore(voz('boom', 400), 0) > S3.voiceScore(voz('small', 0), 0));
  });
});

describe('Oclusão', () => {
  it('em linha de visão não mexe em nada', () => {
    const o = S3.occlusionTarget(0);
    assert.equal(o.gain, 1);
    assert.ok(o.lp >= 18000);
  });
  it('atrás de parede: mais baixo E mais abafado', () => {
    const claro = S3.occlusionTarget(0), tapado = S3.occlusionTarget(1);
    assert.ok(tapado.gain < claro.gain * 0.6, 'parede quase não abaixou o som');
    assert.ok(tapado.lp < 1200, 'parede quase não abafou o timbre');
  });
  it('é monotônica e sem salto entre 0 e 1', () => {
    let g = Infinity, f = Infinity;
    for (let k = 0; k <= 1.0001; k += 0.25) {
      const o = S3.occlusionTarget(k);
      assert.ok(o.gain <= g + 1e-9 && o.lp <= f + 1e-9);
      g = o.gain; f = o.lp;
    }
  });
});

describe('Pista de frente/trás (equal-power não tem HRTF)', () => {
  it('fonte atrás da cabeça perde agudo', () => {
    assert.ok(S3.backLowpass(-1) < S3.backLowpass(1) * 0.5);
  });
  it('fonte na frente fica aberta', () => {
    assert.ok(S3.backLowpass(1) >= 18000);
  });
});

describe('Orçamento de raycast da oclusão', () => {
  it('deixa passar a rajada inicial e depois segura', () => {
    const b = S3.makeBudget(10, 4);
    let ok = 0;
    for (let i = 0; i < 20; i++) if (S3.takeToken(b, 0)) ok++;
    assert.equal(ok, 4, 'estourou o burst do orçamento');
  });
  it('recarrega com o tempo', () => {
    const b = S3.makeBudget(10, 4);
    for (let i = 0; i < 10; i++) S3.takeToken(b, 0);
    assert.ok(S3.takeToken(b, 0.2), 'não recarregou após 200 ms');
  });
  it('nunca acumula além do burst', () => {
    const b = S3.makeBudget(10, 4);
    let ok = 0;
    for (let i = 0; i < 20; i++) if (S3.takeToken(b, 100)) ok++;
    assert.equal(ok, 4);
  });
});

/* ---------------------------------------------------------------- */
describe('Catálogo sem AudioContext — silêncio, nunca exceção', () => {
  const chamadas = [
    ['init'], ['resume'], ['setVolumes'], ['updateListener'],
    ['shot', 'rifle'], ['shot', 'shotgun', { x: 10, y: 1, z: 0 }],
    ['melee'], ['chirp'], ['chirp', { x: 3, y: 1, z: 3 }],
    ['enemyShot'], ['enemyShot', { x: 40, y: 1, z: 0 }],
    ['reload'], ['empty'], ['hit'], ['headshot'], ['kill'], ['hurt'],
    ['step', true], ['jump'], ['land'], ['carDoor'], ['switchW'],
    ['throwNade'], ['bounce'], ['bounce', { x: 2, y: 0, z: 2 }],
    ['cannonWind'], ['cannonFire'], ['cannonLand'],
    ['boing'], ['ding'], ['ding', { x: 5, y: 2, z: 5 }], ['xyloNote', 660],
    ['explosion'], ['explosion', { x: 30, y: 1, z: 30 }],
    ['pickup'], ['medkit'], ['roar'], ['roar', { x: 12, y: 1, z: 0 }],
    ['stomp'], ['slide'], ['bossShot'], ['victory'], ['thunder'],
    ['laser'], ['rocket'], ['pop'], ['groan'], ['whisper'],
    ['deathSting'], ['eat'], ['unlock'],
    ['missileIncoming'], ['warheadRelease'], ['cityImpact'], ['distantRumble'],
    ['engineStart'], ['engineUpdate', 40, true, 0.5, 'sport'], ['heliUpdate', true, 1],
    ['musicStart'], ['musicUpdate'], ['setRain', 0.5], ['rainLevel'],
    ['uiHover'], ['uiClick'], ['uiBack'], ['uiToggle'],
    ['menuMusicStart'], ['menuMusicStop'],
    ['setSpatial', { camera: null, occluded: null }],
  ];
  for (const [nome, ...args] of chamadas) {
    it(`SFX.${nome}() é no-op silencioso`, () => {
      assert.equal(typeof SFX[nome], 'function', `SFX.${nome} não existe`);
      assert.doesNotThrow(() => SFX[nome](...args));
    });
  }
  it('debugAudio() responde mesmo sem contexto', () => {
    const d = SFX.debugAudio();
    assert.equal(d.ctx, false);
    assert.equal(d.voices, 0);
    assert.equal(d.maxVoices, S3.MAX_VOICES);
  });
  it('rainLevel() continua no teto contratado com o QA de clima', () => {
    SFX.setRain({ intensity: 1, exposure: 1 });
    assert.ok(SFX.rainLevel() <= 0.07 + 1e-9);
    assert.ok(SFX.rainLevel() > 0.03);
  });
});
