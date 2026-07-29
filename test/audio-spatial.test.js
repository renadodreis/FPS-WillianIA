/* ================================================================
   QA — áudio espacial no navegador (WebAudio de verdade).
   Prova o que o teste puro não alcança: o grafo não vaza PannerNode,
   o teto de vozes é respeitado e som atrás de parede fica mais baixo
   e mais abafado que som em linha de visão.
   Porta fixa 3720 — rodar SEMPRE com --test-concurrency=1.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { bootGame } = require('./helpers/harness');

const MAX_VOICES = 24; // contrato de js/sfx3d.js
/* as vozes só liberam quando o som acaba (freeAt no relógio do contexto):
   depois de saturar o pool de propósito, esperar é obrigatório */
const drenar = () => new Promise(res => setTimeout(res, 900));

describe('Áudio espacial', { concurrency: 1 }, () => {
  let h;
  before(async () => { h = await bootGame({ port: 3720, worldSeed: '424242' }); }, { timeout: 180000 });
  after(async () => { if (h) await h.close(); });

  it('a câmera é o listener e o probe de oclusão está ligado', async () => {
    const d = await h.play(() => window.QA.MP.SFX.debugAudio());
    assert.equal(d.ctx, true, 'AudioContext não subiu');
    assert.equal(d.hasListener, true, 'listener não foi acoplado à câmera');
    assert.equal(d.hasOccluder, true, 'probe de oclusão não foi ligado');
    assert.equal(d.maxVoices, MAX_VOICES);
  });

  it('o pan é equal-power com atenuação inversa (escolha de custo)', async () => {
    const d = await h.play(() => {
      const S = window.QA.MP.SFX, P = window.QA.MP.player;
      S.updateListener();
      S.shot('rifle', { x: P.pos.x + 20, y: P.pos.y + 1, z: P.pos.z });
      return S.debugAudio();
    });
    assert.equal(d.panningModel, 'equalpower');
    assert.equal(d.distanceModel, 'inverse');
  });

  it('300 sons espaciais não vazam UM PannerNode sequer', async () => {
    const r = await h.play((n) => {
      const S = window.QA.MP.SFX, P = window.QA.MP.player;
      const proto = window.BaseAudioContext ? window.BaseAudioContext.prototype : window.AudioContext.prototype;
      const orig = proto.createPanner;
      let criados = 0;
      proto.createPanner = function () { criados++; return orig.call(this); };
      try {
        S.updateListener();
        for (let i = 0; i < n; i++) {
          const a = i * 0.37;
          S.shot('rifle', { x: P.pos.x + Math.cos(a) * 30, y: P.pos.y + 1, z: P.pos.z + Math.sin(a) * 30 });
        }
      } finally { proto.createPanner = orig; }
      const d = S.debugAudio();
      return { criados, voices: d.voices, panners: d.panners };
    }, 300);
    assert.ok(r.criados <= MAX_VOICES,
      `criou ${r.criados} panners para 300 sons — o pool deveria reciclar`);
    assert.equal(r.voices, r.panners);
    assert.ok(r.voices <= MAX_VOICES, `pool estourou o teto: ${r.voices}`);
  });

  it('a segunda rodada de 300 sons não cria NENHUM nó novo (pool quente)', async () => {
    const criados = await h.play((n) => {
      const S = window.QA.MP.SFX, P = window.QA.MP.player;
      const proto = window.BaseAudioContext ? window.BaseAudioContext.prototype : window.AudioContext.prototype;
      const orig = proto.createPanner;
      let c = 0;
      proto.createPanner = function () { c++; return orig.call(this); };
      try {
        for (let i = 0; i < n; i++) S.explosion({ x: P.pos.x + i % 40, y: P.pos.y, z: P.pos.z + 12 });
      } finally { proto.createPanner = orig; }
      return c;
    }, 300);
    assert.equal(criados, 0, 'pool quente ainda alocou panner — é vazamento');
  });

  it('teto de vozes: rajada instantânea satura em MAX_VOICES e para por aí', async () => {
    const d = await h.play(() => {
      const S = window.QA.MP.SFX, P = window.QA.MP.player;
      for (let i = 0; i < 500; i++)
        S.shot('rifle', { x: P.pos.x + (i % 50), y: P.pos.y + 1, z: P.pos.z + 5 });
      return S.debugAudio();
    });
    assert.equal(d.voices, MAX_VOICES, `pool deveria ter saturado em ${MAX_VOICES}, tem ${d.voices}`);
  });

  it('a distância do som é medida a partir da câmera', async () => {
    await drenar();
    const r = await h.play(() => {
      const MP = window.QA.MP, S = MP.SFX;
      S.updateListener();
      const c = MP.camera.position;
      S.shot('rifle', { x: c.x + 40, y: c.y, z: c.z });
      return S.debugAudio().lastClaim;
    });
    assert.ok(Math.abs(r.dist - 40) < 0.6, `distância errada: ${r.dist}`);
    assert.equal(r.cat, 'gun');
  });

  it('passo a 200 m não chega a gastar voz (corte por alcance)', async () => {
    await drenar();
    const r = await h.play(() => {
      const MP = window.QA.MP, S = MP.SFX;
      S.updateListener();
      const c = MP.camera.position;
      S.step(true, { x: c.x + 8, y: c.y, z: c.z });   // perto: entra
      const perto = S.debugAudio().lastClaim;
      S.step(true, { x: c.x + 200, y: c.y, z: c.z }); // longe: descartado
      return { perto, longe: S.debugAudio().lastClaim };
    });
    assert.equal(r.perto.dropped, false, 'passo perto não tocou');
    assert.ok(Math.abs(r.perto.dist - 8) < 0.6);
    assert.equal(r.longe.dropped, true, 'passo a 200 m gastou voz do pool');
  });

  it('som da sua própria cabeça (sem posição) não gasta voz nenhuma', async () => {
    const r = await h.play(() => {
      const S = window.QA.MP.SFX;
      const antes = S.debugAudio().voices;
      for (let i = 0; i < 50; i++) { S.shot('rifle'); S.reload(); S.hurt(); S.hit(); S.jump(); }
      return { antes, depois: S.debugAudio().voices };
    });
    assert.equal(r.depois, r.antes, 'som 2D alocou voz espacial');
  });

  /* ---- daqui pra baixo o probe de oclusão é substituído por stub ---- */
  it('tiro ATRÁS DE PAREDE fica mais baixo e mais abafado que em linha de visão', async () => {
    await drenar();
    const r = await h.play(() => {
      const MP = window.QA.MP, S = MP.SFX;
      const c = MP.camera.position;
      const alvo = { x: c.x + 25, y: c.y, z: c.z };
      const medir = (bloqueado) => {
        S.setSpatial({ camera: MP.camera, occluded: () => bloqueado });
        S.updateListener();
        S.shot('rifle', alvo);
        return S.debugAudio().lastClaim;
      };
      const livre = medir(false);
      const tapado = medir(true);
      return { livre, tapado };
    });
    assert.equal(r.livre.occluded, false);
    assert.equal(r.tapado.occluded, true);
    assert.ok(r.tapado.gain < r.livre.gain * 0.7,
      `parede quase não abaixou: ${r.tapado.gain} vs ${r.livre.gain}`);
    assert.ok(r.tapado.lp < r.livre.lp * 0.2,
      `parede quase não abafou: ${r.tapado.lp} Hz vs ${r.livre.lp} Hz`);
  });

  it('fonte atrás da cabeça perde agudo (pista de frente/trás sem HRTF)', async () => {
    await drenar();
    const r = await h.play(() => {
      const MP = window.QA.MP, S = MP.SFX;
      S.setSpatial({ camera: MP.camera, occluded: () => false });
      MP.camera.rotation.set(0, 0, 0);          // olhando para -Z
      MP.camera.updateMatrixWorld(true);
      S.updateListener();
      const c = MP.camera.position;
      S.shot('rifle', { x: c.x, y: c.y, z: c.z - 30 });
      const frente = S.debugAudio().lastClaim.lp;
      S.shot('rifle', { x: c.x, y: c.y, z: c.z + 30 });
      const atras = S.debugAudio().lastClaim.lp;
      return { frente, atras };
    });
    assert.ok(r.atras < r.frente * 0.5,
      `atrás não ficou mais escuro: ${r.atras} Hz vs ${r.frente} Hz`);
  });

  it('custo por frame do listener é desprezível', async () => {
    const ms = await h.play(() => {
      const MP = window.QA.MP, S = MP.SFX;
      const c = MP.camera;
      const t0 = performance.now();
      for (let i = 0; i < 600; i++) {        // 10 s de jogo a 60 fps
        c.position.x += 0.01; c.rotation.y += 0.001;
        S.updateListener();
      }
      return (performance.now() - t0) / 600;
    });
    console.log(`    listener: ${ms.toFixed(4)} ms/frame`);
    assert.ok(ms < 0.5, `updateListener custa ${ms} ms/frame — caro demais`);
  });

  it('equal-power é mais barato que HRTF (justifica a escolha)', async () => {
    const r = await h.play(async () => {
      async function bench(model) {
        const oc = new OfflineAudioContext(2, 44100 * 2, 44100);
        const buf = oc.createBuffer(1, 44100, 44100);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        for (let i = 0; i < 24; i++) {
          const s = oc.createBufferSource(); s.buffer = buf; s.loop = true;
          const p = oc.createPanner();
          p.panningModel = model; p.distanceModel = 'inverse';
          p.positionX.value = i - 12; p.positionZ.value = 10;
          const g = oc.createGain(); g.gain.value = 0.02;
          s.connect(p); p.connect(g); g.connect(oc.destination); s.start();
        }
        const t0 = performance.now();
        await oc.startRendering();
        return performance.now() - t0;
      }
      let eq = Infinity, hr = Infinity;
      for (let i = 0; i < 3; i++) {           // melhor de 3: tira ruído de agendamento
        eq = Math.min(eq, await bench('equalpower'));
        hr = Math.min(hr, await bench('HRTF'));
      }
      return { eq, hr };
    });
    console.log(`    24 vozes / 2 s: equalpower ${r.eq.toFixed(1)} ms · HRTF ${r.hr.toFixed(1)} ms`);
    assert.ok(r.eq <= r.hr, `HRTF saiu mais barato (${r.hr}) que equal-power (${r.eq})`);
  });

  it('sons de interface tocam sem gastar voz e sem estourar', async () => {
    const r = await h.play(() => {
      const S = window.QA.MP.SFX;
      const antes = S.debugAudio().voices;
      let erro = null;
      try { for (let i = 0; i < 30; i++) { S.uiHover(); S.uiClick(); S.uiBack(); S.uiToggle(); } }
      catch (e) { erro = String(e); }
      return { antes, depois: S.debugAudio().voices, erro };
    });
    assert.equal(r.erro, null);
    assert.equal(r.depois, r.antes, 'som de UI virou voz espacial');
  });

  it('trilha do menu liga, abaixa a chuva e para de verdade', async () => {
    const r = await h.play(async () => {
      const S = window.QA.MP.SFX;
      S.setRain({ intensity: 1, exposure: 1 });
      const semMenu = S.rainLevel();
      S.menuMusicStart();
      const ligada = S.debugAudio().menuMusic;
      const comMenu = S.rainLevel();
      S.menuMusicStop();
      await new Promise(res => setTimeout(res, 1200)); // fade + limpeza
      return { semMenu, comMenu, ligada, desligada: S.debugAudio().menuMusic };
    });
    assert.equal(r.ligada, true, 'menuMusicStart não ligou');
    assert.equal(r.desligada, false, 'menuMusicStop não parou');
    assert.ok(r.comMenu < r.semMenu, 'chuva não recuou com a trilha do menu');
    assert.ok(r.semMenu <= 0.07 + 1e-9, 'teto da chuva quebrado');
  });

  /* mesma rede de segurança do test/gameplay.test.js: erros de RUNTIME da
     página. consoleErrors não serve aqui — junta ruído de rede/asset sob carga. */
  it('não sobrou erro de runtime na página', async () => {
    const errs = await h.play(() => window.__game.errors.map(e => String((e && e.message) || e)));
    assert.deepEqual(errs, [], `erros: ${errs.join(' | ')}`);
    assert.deepEqual(h.pageErrors, [], `pageErrors: ${h.pageErrors.join(' | ')}`);
  });
});
