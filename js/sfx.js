/* ================== áudio procedural (WebAudio, zero assets) ==================
   Espacialização: sons com origem no MUNDO passam por um PannerNode tirado de
   um POOL reciclado (js/sfx3d.js manda na política); sons que saem da SUA
   cabeça (sua arma, seus passos, HUD) continuam 2D em volume cheio.
   Toda função aceita uma posição OPCIONAL no fim — sem ela, o som é 2D.

   Grafo:
     [weapons]──comp──┐
     [world]───comp───┤
     [ui]─────────────┼─▶ master (SETTINGS.vol) ─▶ limiter ─▶ destination
     [music]──────────┘
   As vozes espaciais desembocam SEMPRE no barramento world: assim um tiroteio
   de 100 jogadores se auto-comprime sem abafar a sua arma nem o seu dano.
   ============================================================================= */
import * as S3 from './sfx3d.js';

export function createSFX(deps) {
  const { SETTINGS, clamp, rand } = deps;
  let ctx = null, master = null, noiseBuf = null;
  const BUS = { weapons: null, world: null, ui: null, music: null };
  let dest = null;              // destino corrente de blip()/noise()
  // motor do carro (2 osciladores dessintonizados + sub + escape com ruído)
  let engineOsc = null, engineOsc2 = null, engineSub = null, engineGain = null, engineFilter = null, engineLfo = null, exhGain = null;
  let heliGain = null, heliLfo = null;
  // sem música/vento no jogo: só a camada de chuva reage ao clima.
  // Mixagem da chuva: ganho-teto MUITO abaixo do antigo 0.13 (mascarava passos/
  // tiros) + low-pass por exposição — dentro de prédio/nave vira chuva "lá fora".
  const RAIN_GAIN_BASE = 0.05;  // externo, intensidade máxima
  const RAIN_GAIN_CAP = 0.07;   // teto duro (não subir sem A/B de mix)
  let musicOn = false, rainGain = null, rainLp = null, rainAmt = 0, rainExposure = 1;

  /* ---------------- espacialização: listener + pool de vozes ---------------- */
  let cam = null, occludedFn = null;
  const voices = [];            // { input, lp, panner, cat, dist, dur, t0, freeAt }
  const occlBudget = S3.makeBudget();
  const camPos = { x: 0, y: 0, z: 0 }, camFwd = { x: 0, y: 0, z: -1 }, camUp = { x: 0, y: 1, z: 0 };
  const lastCam = { px: 1e9, py: 1e9, pz: 1e9, fx: 9, fy: 9, fz: 9 };
  let lastClaim = null;         // QA: retrato da última voz entregue

  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = SETTINGS.vol;
      // rede de proteção final: nada clipa mesmo com 24 vozes + sua arma juntas
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20;
      lim.attack.value = 0.002; lim.release.value = 0.12;
      master.connect(lim); lim.connect(ctx.destination);
      // weapons: compressão leve, só cola — sua arma mantém o punch.
      // world: herda o -18/6 que era o compressor global; agora ele só age
      //   sobre a MULTIDÃO (é a multidão que abafa a multidão, não você).
      // ui/music: sem compressão — hitmarker e dano em VOCÊ cortam o caos.
      BUS.weapons = makeBus(1.0, -12, 3);
      BUS.world = makeBus(0.9, -18, 6);
      BUS.ui = makeBus(1.0, 0, 0);
      BUS.music = makeBus(1.0, 0, 0);
      dest = BUS.world;
      const len = ctx.sampleRate * 1.2;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
  }
  function makeBus(gain, threshold, ratio) {
    const g = ctx.createGain(); g.gain.value = gain;
    if (!ratio) { g.connect(master); return g; }
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = threshold; c.knee.value = 20; c.ratio.value = ratio;
    c.attack.value = 0.004; c.release.value = 0.16;
    g.connect(c); c.connect(master);
    return g;
  }
  function ensure() { // UI do menu pode tocar antes de o jogo começar
    if (!ctx) init();
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* gesto ainda não veio */ } }
    return !!ctx;
  }

  function blip(freq, dur, type = 'sine', vol = 0.2, slide = 0) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(dest); o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }
  function noise(dur, vol, fStart, fEnd, q = 1) {
    if (!ctx) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = rand(0.85, 1.15);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = q;
    f.frequency.setValueAtTime(fStart, ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, fEnd), ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(); s.stop(ctx.currentTime + dur + 0.05);
  }
  /* cauda de som (segundo estalo, eco, etc) continua na MESMA voz espacial:
     sem isto o rabo do tiro remoto vazaria pro barramento em 2D. Se a voz for
     roubada antes da cauda, ela toca na posição nova — é o preço de um pool
     fixo, e o roubo só acontece em tiroteio, onde ninguém percebe. */
  function later(ms, fn) {
    const d = dest;
    setTimeout(() => { const p = dest; dest = d; try { fn(); } finally { dest = p; } }, ms);
  }

  /* ---------------- listener ---------------- */
  /* gira (vx,vy,vz) pelo quaternion — sem depender de THREE nem de
     matrixWorld (que só é recalculada no render: ficaria um frame atrás). */
  function rotQ(q, vx, vy, vz, out) {
    const x = q.x, y = q.y, z = q.z, w = q.w;
    const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
    out.x = vx + w * tx + (y * tz - z * ty);
    out.y = vy + w * ty + (z * tx - x * tz);
    out.z = vz + w * tz + (x * ty - y * tx);
  }
  function readCam() {
    if (!cam) return false;
    const p = cam.position;
    camPos.x = p.x; camPos.y = p.y; camPos.z = p.z;
    if (cam.quaternion) {              // a câmera olha para -Z local
      rotQ(cam.quaternion, 0, 0, -1, camFwd);
      rotQ(cam.quaternion, 0, 1, 0, camUp);
    }
    return true;
  }
  function updateListener() {
    if (!ctx || !cam) return;
    readCam();
    // parado é grátis: sem movimento nem giro, nada é reagendado
    if (Math.abs(camPos.x - lastCam.px) < 1e-3 && Math.abs(camPos.y - lastCam.py) < 1e-3 &&
        Math.abs(camPos.z - lastCam.pz) < 1e-3 && Math.abs(camFwd.x - lastCam.fx) < 1e-4 &&
        Math.abs(camFwd.y - lastCam.fy) < 1e-4 && Math.abs(camFwd.z - lastCam.fz) < 1e-4) return;
    lastCam.px = camPos.x; lastCam.py = camPos.y; lastCam.pz = camPos.z;
    lastCam.fx = camFwd.x; lastCam.fy = camFwd.y; lastCam.fz = camFwd.z;
    const L = ctx.listener, t = ctx.currentTime, tc = 0.015;
    if (L.positionX) {
      L.positionX.setTargetAtTime(camPos.x, t, tc);
      L.positionY.setTargetAtTime(camPos.y, t, tc);
      L.positionZ.setTargetAtTime(camPos.z, t, tc);
      L.forwardX.setTargetAtTime(camFwd.x, t, tc);
      L.forwardY.setTargetAtTime(camFwd.y, t, tc);
      L.forwardZ.setTargetAtTime(camFwd.z, t, tc);
      L.upX.setTargetAtTime(camUp.x, t, tc);
      L.upY.setTargetAtTime(camUp.y, t, tc);
      L.upZ.setTargetAtTime(camUp.z, t, tc);
    } else { // Safari antigo
      L.setPosition(camPos.x, camPos.y, camPos.z);
      L.setOrientation(camFwd.x, camFwd.y, camFwd.z, camUp.x, camUp.y, camUp.z);
    }
  }

  /* ---------------- pool de vozes ---------------- */
  function makeVoice() {
    const input = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = S3.OPEN_LP; lp.Q.value = 0.707;
    const panner = ctx.createPanner();
    // equal-power e não HRTF: HRTF é uma convolução por voz; com 24 vozes numa
    // máquina fraca custa ~10x mais que o pan de ganho. A pista de frente/trás
    // que o HRTF daria vem do corte de agudo em S3.backLowpass (custo ~zero).
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    input.connect(lp); lp.connect(panner); panner.connect(BUS.world);
    return { input, lp, panner, cat: 'small', dist: 0, dur: 0, t0: 0, freeAt: 0 };
  }
  function claim(pos, cat, dur) {
    if (!ctx || !cam || !pos) return null;
    if (!readCam()) return null;
    const dx = pos.x - camPos.x, dy = (pos.y || 0) - camPos.y, dz = pos.z - camPos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const now = ctx.currentTime;
    const i = S3.acquireVoice(voices, { cat, dist: d, dur }, now);
    if (i < 0) {                            // longe demais ou não vale roubar voz
      lastClaim = { cat, dist: d, dropped: true, gain: 0, lp: 0, occluded: false };
      return null;
    }
    if (i === voices.length) voices.push(makeVoice());
    const v = voices[i], c = S3.CATS[cat] || S3.CATS.small;
    v.cat = cat; v.dist = d; v.dur = dur; v.t0 = now; v.freeAt = now + dur;
    const pn = v.panner;
    pn.refDistance = c.ref; pn.rolloffFactor = c.roll; pn.maxDistance = c.max;
    if (pn.positionX) {
      pn.positionX.value = pos.x; pn.positionY.value = pos.y || 0; pn.positionZ.value = pos.z;
    } else pn.setPosition(pos.x, pos.y || 0, pos.z);
    // oclusão barata: só o que importa, só perto, e dentro do orçamento
    let occ = 0;
    if (c.occl && occludedFn && d < S3.OCCL_MAX_DIST && S3.takeToken(occlBudget, now)) {
      try { occ = occludedFn(pos) ? 1 : 0; } catch (e) { occ = 0; }
    }
    const tgt = S3.occlusionTarget(occ);
    const dot = d > 1e-3 ? (dx * camFwd.x + dy * camFwd.y + dz * camFwd.z) / d : 1;
    v.input.gain.value = tgt.gain;
    v.lp.frequency.value = Math.min(tgt.lp, S3.backLowpass(dot));
    lastClaim = { cat, dist: d, dropped: false, gain: tgt.gain, lp: v.lp.frequency.value, occluded: occ > 0 };
    return v;
  }
  /* Toca `fn` no lugar certo: com posição vira voz espacial; sem posição
     (som da sua própria cabeça) vai direto pro barramento, em 2D. */
  function spat(pos, cat, bus, dur, fn) {
    if (!ctx) return;
    const prev = dest;
    if (pos && cam) {                       // sem listener ainda: degrada pra 2D
      const v = claim(pos, cat, dur);
      if (!v) return;                       // descartado pela política de vozes
      dest = v.input;
    } else dest = bus || BUS.world;
    try { fn(); } finally { dest = prev; }
  }
  /* nível-alvo da chuva: com a trilha do menu no ar ela recua pra soma não estourar */
  function rainLevelNow() {
    return Math.min(RAIN_GAIN_CAP, rainAmt * RAIN_GAIN_BASE) *
      (0.15 + 0.85 * rainExposure) * (menuOn ? 0.4 : 1);
  }

  /* ---------------- trilha do menu (procedural, sem loop curto) ---------------- */
  const MENU_ROOT = 110;                                  // Lá2
  const MENU_CHORDS = [0, -5, -3, -7, 2, -10];            // 6 acordes × 21 s = 126 s
  const MENU_ARP = [0, 7, 3, 10, 5, 12, 3];               // 7 graus (pentatônica menor)
  const MENU_CHORD_T = 21, MENU_GAIN = 0.1;
  let menuOn = false, menuGain = null, menuLp = null, menuTimer = 0;
  let menuNodes = [], menuNext = 0, menuStep = 0, menuT0 = 0;

  function padNote(freq, when, dur, vol, type, target) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + dur * 0.4);   // ataque lento = pad, não bipe
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(target);
    o.start(when); o.stop(when + dur + 0.05);
  }
  function menuPump() {
    if (!ctx || !menuOn || !menuLp) return;
    const now = ctx.currentTime;
    let guard = 0;
    while (menuNext < now + 1.2 && guard++ < 8) {
      const at = Math.max(menuNext, now + 0.05);
      const acorde = MENU_CHORDS[Math.floor((at - menuT0) / MENU_CHORD_T) % MENU_CHORDS.length];
      const grau = MENU_ARP[menuStep % MENU_ARP.length];
      // oitava troca em ciclos de 5 e 7: contra 6 acordes, a combinação exata
      // só volta depois de minutos — nada de "loop de 2 compassos"
      const oitava = menuStep % 7 === 3 ? 12 : menuStep % 5 === 0 ? -12 : 0;
      const f = MENU_ROOT * Math.pow(2, (acorde + grau + oitava) / 12);
      padNote(f, at, 2.6 + (menuStep % 3) * 0.9, 0.055, 'triangle', menuLp);
      if (menuStep % 9 === 4) padNote(f * 4, at + 0.4, 1.6, 0.011, 'sine', menuGain);
      menuNext = at + 1.55 + (menuStep % 4) * 0.35;
      menuStep++;
    }
  }
  function menuMusicStart() {
    try {
      if (!ensure() || menuOn) return;
      menuOn = true;
      menuGain = ctx.createGain(); menuGain.gain.value = 0.0001;
      menuGain.connect(BUS.music);
      menuGain.gain.setTargetAtTime(MENU_GAIN, ctx.currentTime, 1.6);
      menuLp = ctx.createBiquadFilter(); menuLp.type = 'lowpass';
      menuLp.frequency.value = 800; menuLp.Q.value = 0.8;
      menuLp.connect(menuGain);
      // respiração lenta do filtro: ~22 s por ciclo, nunca sincroniza com o arpejo
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.045;
      const lfoG = ctx.createGain(); lfoG.gain.value = 520;
      lfo.connect(lfoG); lfoG.connect(menuLp.frequency); lfo.start();
      // drone: duas ondas dessintonizadas seguram o fundo entre as notas
      for (const [f, det, vol, type] of [[55, 0, 0.05, 'sine'], [82.5, 0.4, 0.03, 'triangle']]) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f + det;
        const g = ctx.createGain(); g.gain.value = vol;
        o.connect(g); g.connect(menuLp); o.start();
        menuNodes.push(o);
      }
      // véu de ruído: cola tudo e disfarça o começo/fim de cada nota
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.4;
      const sg = ctx.createGain(); sg.gain.value = 0.014;
      s.connect(bp); bp.connect(sg); sg.connect(menuGain); s.start();
      menuNodes.push(s, lfo);
      menuT0 = ctx.currentTime; menuNext = ctx.currentTime + 0.4; menuStep = 0;
      menuPump();
      menuTimer = setInterval(menuPump, 500);
    } catch (e) { menuOn = false; }
  }
  function menuMusicStop() {
    try {
      if (!menuOn) return;
      menuOn = false;
      clearInterval(menuTimer); menuTimer = 0;
      const g = menuGain, nodes = menuNodes;
      menuGain = null; menuLp = null; menuNodes = [];
      if (!ctx || !g) return;
      const t = ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
      g.gain.linearRampToValueAtTime(0, t + 0.55);
      setTimeout(() => {
        for (const n of nodes) { try { n.stop(); } catch (e) { /* já parado */ } try { n.disconnect(); } catch (e) { /* já solto */ } }
        try { g.disconnect(); } catch (e) { /* já solto */ }
      }, 900);
    } catch (e) { /* menu fechando: nunca pode estourar */ }
  }

  return {
    init,
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
    /* liga o listener na câmera e o probe de oclusão (game.js passa rayBlockedAt) */
    setSpatial(o) { cam = (o && o.camera) || null; occludedFn = (o && o.occluded) || null; },
    updateListener,

    shot(kind, pos) { // timbre por arma: estalo agudo + corpo + sub grave (punch)
      spat(pos, 'gun', BUS.weapons, 0.55, () => {
        const v = rand(0.94, 1.06); // variação de pitch por disparo: rajada não vira metrônomo
        if (kind === 'shotgun') { noise(0.4, 0.72, 3400 * v, 95, 0.6); blip(84 * v, 0.24, 'square', 0.2, -46); blip(46, 0.32, 'sine', 0.3, -14); }
        else if (kind === 'dmr') { noise(0.22, 0.6, 6800 * v, 170, 0.9); blip(175 * v, 0.12, 'square', 0.14, -120); blip(52, 0.24, 'sine', 0.24, -18); later(70, () => noise(0.4, 0.12, 650, 80, 0.4)); }
        else { noise(0.17, 0.55, 5600 * v, 210, 0.8); blip(140 * v, 0.09, 'square', 0.14, -85); blip(58, 0.18, 'sine', 0.22, -22); }
      });
    },
    melee(pos) { // facada: corte de ar + impacto seco
      spat(pos, 'small', BUS.weapons, 0.2, () => {
        noise(0.09, 0.2, 2600, 700, 0.7);
        later(60, () => { noise(0.06, 0.18, 900, 240, 1.2); blip(190, 0.05, 'square', 0.08, -60); });
      });
    },
    chirp(pos) { // passarinhos
      if (!ctx) return;
      spat(pos, 'small', BUS.world, 0.55, () => {
        const n = 2 + ((Math.random() * 3) | 0);
        for (let i = 0; i < n; i++)
          later(i * 115 + rand(50), () => blip(rand(2300, 3400), 0.07, 'sine', 0.04, -rand(300, 900)));
      });
    },
    enemyShot(pos) { spat(pos, 'gun', BUS.world, 0.2, () => noise(0.14, 0.18, 2600, 200, 0.7)); },
    reload()    { spat(null, 'small', BUS.weapons, 0.4, () => { noise(0.05, 0.14, 2400, 800, 1.5); blip(420, 0.05, 'square', 0.09); later(130, () => { noise(0.05, 0.12, 1800, 600, 1.5); blip(620, 0.05, 'square', 0.09); }); later(320, () => { noise(0.06, 0.16, 2800, 900, 1.5); blip(900, 0.06, 'square', 0.11); }); }); },
    empty()     { spat(null, 'small', BUS.weapons, 0.05, () => blip(900, 0.04, 'square', 0.07)); },
    hit()       { spat(null, 'small', BUS.ui, 0.06, () => { blip(1150, 0.055, 'triangle', 0.17); blip(760, 0.045, 'sine', 0.08); }); },
    headshot()  { spat(null, 'small', BUS.ui, 0.11, () => { blip(1500, 0.07, 'triangle', 0.22); blip(2100, 0.1, 'sine', 0.14); blip(980, 0.05, 'sine', 0.08); }); },
    kill()      { spat(null, 'small', BUS.ui, 0.32, () => { blip(740, 0.09, 'triangle', 0.17); later(70, () => blip(1180, 0.14, 'triangle', 0.19)); later(150, () => blip(1560, 0.16, 'sine', 0.1)); }); },
    hurt()      { spat(null, 'small', BUS.ui, 0.26, () => { noise(0.25, 0.4, 700, 90, 0.5); blip(110, 0.18, 'sawtooth', 0.12, -40); }); }, // dano em VOCÊ: barramento sem compressão
    step(run, pos)   { spat(pos, 'small', BUS.world, 0.08, () => noise(0.07, run ? 0.1 : 0.06, rand(750, 1050), 180, 0.4)); },
    jump()      { spat(null, 'small', BUS.world, 0.1, () => noise(0.1, 0.08, 1200, 300, 0.5)); },
    land()      { spat(null, 'small', BUS.world, 0.17, () => noise(0.16, 0.2, 500, 80, 0.6)); },
    carDoor(pos)   { spat(pos, 'vehicle', BUS.world, 0.2, () => { blip(220, 0.08, 'square', 0.12); later(60, () => noise(0.1, 0.2, 800, 200)); }); },
    switchW()   { spat(null, 'small', BUS.weapons, 0.15, () => { blip(480, 0.04, 'square', 0.07); later(90, () => blip(760, 0.05, 'square', 0.09)); }); },
    throwNade() { spat(null, 'small', BUS.weapons, 0.14, () => noise(0.13, 0.12, 1600, 380, 0.5)); },
    bounce(pos)    { spat(pos, 'small', BUS.world, 0.05, () => blip(290, 0.035, 'square', 0.05)); },
    /* ---- Canhão de Circo ---- */
    cannonWind(pos)  { spat(pos, 'toy', BUS.world, 0.55, () => blip(300, 0.5, 'square', 0.06, 520)); }, // assobio que sobe carregando (== CHARGE_T)
    cannonFire(pos)  { // FIUUU ascendente + BUM redondo e alegre (nada grave/terror)
      spat(pos, 'toy', BUS.world, 0.6, () => {
        blip(340, 0.34, 'sine', 0.13, 900);
        noise(0.5, 0.55, 520, 130, 0.5);
        blip(150, 0.4, 'triangle', 0.18, -58);
        later(120, () => { blip(680, 0.12, 'triangle', 0.12); blip(1010, 0.14, 'sine', 0.08); });
      });
    },
    cannonLand(pos)  { spat(pos, 'toy', BUS.world, 0.35, () => { noise(0.16, 0.16, 500, 90, 0.6); [784, 1047].forEach((f, i) => later(i * 90, () => blip(f, 0.16, 'triangle', 0.13))); }); },
    /* ---- Atrações do mapa ---- */
    boing(pos)       { spat(pos, 'toy', BUS.world, 0.22, () => { blip(180, 0.2, 'sine', 0.15, 620); blip(320, 0.14, 'triangle', 0.06, 240); }); }, // cama elástica
    ding(pos)        { spat(pos, 'toy', BUS.world, 0.2, () => { blip(1320, 0.12, 'sine', 0.13); later(20, () => blip(1760, 0.14, 'sine', 0.07)); }); }, // aro
    xyloNote(freq, pos) { spat(pos, 'toy', BUS.world, 0.26, () => { blip(freq || 660, 0.24, 'triangle', 0.13); blip((freq || 660) * 2, 0.09, 'sine', 0.04); }); }, // xilofone
    explosion(pos) { spat(pos, 'boom', BUS.world, 1.0, () => { noise(0.95, 0.75, 320, 38, 0.4); blip(58, 0.55, 'sine', 0.35, -32); blip(120, 0.3, 'sawtooth', 0.15, -70); }); },
    pickup()    { spat(null, 'small', BUS.ui, 0.18, () => { blip(880, 0.06, 'triangle', 0.11); later(80, () => blip(1320, 0.08, 'triangle', 0.12)); }); },
    medkit()    { spat(null, 'small', BUS.ui, 0.28, () => { blip(620, 0.08, 'sine', 0.12); later(140, () => blip(930, 0.12, 'sine', 0.12)); }); },
    roar(pos)      { spat(pos, 'creature', BUS.world, 0.9, () => { blip(88, 0.85, 'sawtooth', 0.3, -42); noise(0.75, 0.4, 480, 55, 0.6); }); },
    stomp(pos)     { spat(pos, 'creature', BUS.world, 0.45, () => { noise(0.4, 0.55, 220, 45, 0.6); blip(70, 0.3, 'sine', 0.25, -25); }); },
    slide()     { spat(null, 'small', BUS.world, 0.3, () => noise(0.28, 0.13, 850, 220, 0.5)); },
    bossShot(pos)  { spat(pos, 'gun', BUS.world, 0.25, () => { noise(0.2, 0.28, 900, 120, 0.8); blip(220, 0.16, 'sawtooth', 0.12, -120); }); },
    victory()   { spat(null, 'small', BUS.ui, 0.62, () => [523, 659, 784, 1047].forEach((f, i) => later(i * 130, () => blip(f, 0.22, 'triangle', 0.16)))); },
    thunder()   { spat(null, 'boom', BUS.world, 1.6, () => { noise(1.5, 0.5, 220, 28, 0.3); blip(44, 1.1, 'sine', 0.26, -18); }); },
    laser(pos)     { spat(pos, 'gun', BUS.weapons, 0.12, () => { blip(1800, 0.09, 'square', 0.13, -1300); blip(900, 0.05, 'sawtooth', 0.06, -400); }); },
    rocket(pos)    { spat(pos, 'gun', BUS.weapons, 0.95, () => { noise(0.9, 0.32, 900, 180, 0.6); blip(120, 0.4, 'sawtooth', 0.1, 60); }); },
    pop(pos)       { spat(pos, 'toy', BUS.world, 0.06, () => noise(0.05, 0.3, 1500, 250, 2.2)); }, // 'toy': o estouro do fogo de artifício precisa chegar longe
    groan(pos)     { spat(pos, 'creature', BUS.world, 0.8, () => blip(rand(68, 105), 0.75, 'sawtooth', 0.13, -22)); },
    whisper(pos)   { spat(pos, 'creature', BUS.world, 1.05, () => noise(1.0, 0.07, 2200, 500, 0.2)); },
    deathSting(){ spat(null, 'small', BUS.ui, 1.3, () => [220, 174, 146, 110].forEach((f, i) => later(i * 230, () => blip(f, 0.55, 'triangle', 0.15)))); },
    eat()       { spat(null, 'small', BUS.ui, 0.14, () => { noise(0.12, 0.16, 1200, 280, 1); blip(300, 0.09, 'sine', 0.1); }); },
    unlock()    { spat(null, 'small', BUS.ui, 0.4, () => [523, 659, 784].forEach((f, i) => later(i * 105, () => blip(f, 0.16, 'triangle', 0.14)))); },

    /* ---- sons de interface (contrato com o menu; sempre no-op silencioso) ---- */
    // hover não é gesto do usuário: não cria contexto do nada, só toca se já existe
    uiHover() { try { if (!ctx) return; spat(null, 'small', BUS.ui, 0.04, () => { blip(1500, 0.022, 'triangle', 0.035); noise(0.02, 0.03, 4200, 1800, 2); }); } catch (e) { /* menu nunca quebra por áudio */ } },
    uiClick() { try { if (!ensure()) return; spat(null, 'small', BUS.ui, 0.2, () => { blip(660, 0.05, 'triangle', 0.1); noise(0.035, 0.09, 3200, 900, 1.4); later(55, () => blip(990, 0.09, 'triangle', 0.09)); }); } catch (e) { /* idem */ } },
    uiBack()  { try { if (!ensure()) return; spat(null, 'small', BUS.ui, 0.18, () => { blip(620, 0.05, 'triangle', 0.09); later(55, () => blip(415, 0.09, 'triangle', 0.08)); }); } catch (e) { /* idem */ } },
    uiToggle(){ try { if (!ensure()) return; spat(null, 'small', BUS.ui, 0.07, () => { blip(1180, 0.035, 'square', 0.055); noise(0.025, 0.05, 3000, 1200, 1.8); }); } catch (e) { /* idem */ } },
    menuMusicStart, menuMusicStop,

    /* ---- evento de destruição da cidade (2D: cinemática + evento do mapa todo) ---- */
    missileIncoming() { // sirene grave + rasgo de ar
      spat(null, 'boom', BUS.world, 2.2, () => {
        blip(220, 1.6, 'sawtooth', 0.1, -60);
        noise(1.8, 0.16, 2400, 300, 0.4);
        later(700, () => blip(180, 1.4, 'sawtooth', 0.09, -50));
      });
    },
    warheadRelease() { // estalos metálicos + assobios agudos caindo
      spat(null, 'boom', BUS.world, 1.2, () => {
        for (let i = 0; i < 5; i++) later(i * 130, () => {
          blip(1400 - i * 120, 0.5, 'triangle', 0.07, -900);
          noise(0.2, 0.08, 3600, 800, 1.2);
        });
      });
    },
    cityImpact() { // detonação em camadas: sub + corpo + estilhaço
      spat(null, 'boom', BUS.world, 3.0, () => {
        blip(38, 1.6, 'sine', 0.5, -20);
        noise(1.6, 0.9, 380, 30, 0.35);
        blip(90, 0.9, 'sawtooth', 0.25, -55);
        later(180, () => noise(1.1, 0.5, 700, 60, 0.5));
        later(500, () => noise(2.4, 0.3, 240, 25, 0.3));
      });
    },
    distantRumble() { // ribombo distante contínuo (pós-impacto)
      spat(null, 'boom', BUS.world, 2.9, () => {
        noise(2.8, 0.2, 160, 22, 0.25);
        blip(46, 2.2, 'sine', 0.12, -12);
      });
    },
    setVolumes() { if (master) master.gain.setTargetAtTime(SETTINGS.vol, ctx.currentTime, 0.1); },
    engineStart() {
      if (!ctx || engineOsc) return;
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 48;
      engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'sawtooth'; engineOsc2.frequency.value = 48.6;
      engineSub = ctx.createOscillator(); engineSub.type = 'sine'; engineSub.frequency.value = 24;
      engineLfo = ctx.createOscillator(); engineLfo.type = 'sine'; engineLfo.frequency.value = 26;
      const lfoG = ctx.createGain(); lfoG.gain.value = 5;
      engineLfo.connect(lfoG); lfoG.connect(engineOsc.frequency);
      engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 320; engineFilter.Q.value = 1.6;
      engineGain = ctx.createGain(); engineGain.gain.value = 0.0;
      const g1 = ctx.createGain(); g1.gain.value = 0.5;
      const g2 = ctx.createGain(); g2.gain.value = 0.38;
      const g3 = ctx.createGain(); g3.gain.value = 0.55;
      engineOsc.connect(g1); engineOsc2.connect(g2); engineSub.connect(g3);
      g1.connect(engineFilter); g2.connect(engineFilter); g3.connect(engineFilter);
      engineFilter.connect(engineGain); engineGain.connect(BUS.world);
      // escape: ruído grave borbulhando junto do acelerador
      const exh = ctx.createBufferSource(); exh.buffer = noiseBuf; exh.loop = true;
      const exhF = ctx.createBiquadFilter(); exhF.type = 'bandpass'; exhF.frequency.value = 130; exhF.Q.value = 1.1;
      exhGain = ctx.createGain(); exhGain.gain.value = 0;
      exh.connect(exhF); exhF.connect(exhGain); exhGain.connect(BUS.world);
      engineOsc.start(); engineOsc2.start(); engineSub.start(); engineLfo.start(); exh.start();
    },
    engineUpdate(speedKmh, on, throttle = 0, profile = 'normal') {
      if (!ctx || !engineOsc) return;
      const t = ctx.currentTime;
      // caixa de marchas: o RPM sobe dentro da marcha e cai na troca (vrum-vrum)
      const gearLen = profile === 'sport' ? 32 : 26;
      const gear = Math.min(5, Math.floor(speedKmh / gearLen));
      const frac = clamp((speedKmh - gear * gearLen) / gearLen, 0, 1);
      const pm = profile === 'sport' ? 1.6 : profile === 'truck' ? 0.68 : 1;
      const rpm = (46 + frac * 74 + gear * 7 + throttle * 6) * pm;
      engineOsc.frequency.setTargetAtTime(rpm, t, 0.07);
      engineOsc2.frequency.setTargetAtTime(rpm * 1.013, t, 0.07);
      engineSub.frequency.setTargetAtTime(rpm / 2, t, 0.08);
      engineFilter.frequency.setTargetAtTime((250 + frac * 680 + throttle * 420) * (profile === 'sport' ? 1.5 : 1), t, 0.1);
      engineGain.gain.setTargetAtTime(on ? 0.1 + throttle * 0.05 : 0, t, on ? 0.12 : 0.25);
      exhGain.gain.setTargetAtTime(on ? (profile === 'truck' ? 0.05 : 0.018) + throttle * (profile === 'sport' ? 0.08 : 0.05) : 0, t, 0.15);
    },
    heliUpdate(on, lift) {
      if (!ctx) return;
      if (!heliGain) { // whump-whump: ruído modulado por LFO
        const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 120; f.Q.value = 1.3;
        const amp = ctx.createGain(); amp.gain.value = 0.5;
        heliLfo = ctx.createOscillator(); heliLfo.frequency.value = 12;
        const lg = ctx.createGain(); lg.gain.value = 0.5;
        heliLfo.connect(lg); lg.connect(amp.gain);
        heliGain = ctx.createGain(); heliGain.gain.value = 0;
        s.connect(f); f.connect(amp); amp.connect(heliGain); heliGain.connect(BUS.world);
        s.start(); heliLfo.start();
      }
      heliGain.gain.setTargetAtTime(on ? 0.15 + lift * 0.06 : 0, ctx.currentTime, 0.35);
      heliLfo.frequency.setTargetAtTime(on ? 12 + lift * 4 : 8, ctx.currentTime, 0.4);
    },
    musicStart() { // no jogo não há trilha: liga só a camada de chuva (clima)
      if (!ctx || musicOn) return;
      musicOn = true;
      const r = ctx.createBufferSource(); r.buffer = noiseBuf; r.loop = true;
      const rF = ctx.createBiquadFilter(); rF.type = 'bandpass'; rF.frequency.value = 2800; rF.Q.value = 0.25;
      // low-pass de INTERIOR: aberto (12 kHz) lá fora, ~900 Hz coberto
      rainLp = ctx.createBiquadFilter(); rainLp.type = 'lowpass'; rainLp.frequency.value = 12000;
      rainGain = ctx.createGain(); rainGain.gain.value = 0;
      r.connect(rF); rF.connect(rainLp); rainLp.connect(rainGain); rainGain.connect(BUS.music);
      r.start();
    },
    musicUpdate() {
      if (!ctx || !musicOn || !rainGain) return;
      // interior: −85% de volume e timbre abafado; transições sem clique
      rainGain.gain.setTargetAtTime(rainLevelNow(), ctx.currentTime, 1.2);
      rainLp.frequency.setTargetAtTime(900 + 11100 * rainExposure, ctx.currentTime, 0.5);
    },
    // aceita número (compat) OU { intensity, exposure }
    setRain(k) {
      if (typeof k === 'object' && k !== null) {
        rainAmt = k.intensity || 0;
        rainExposure = k.exposure === undefined ? 1 : Math.max(0, Math.min(1, k.exposure));
      } else rainAmt = k || 0;
    },
    rainLevel: rainLevelNow, // QA: nível-alvo atual da chuva (sem tocar o grafo)
    /* QA: retrato do grafo espacial — nada aqui altera o áudio */
    debugAudio() {
      return {
        ctx: !!ctx,
        voices: voices.length,
        maxVoices: S3.MAX_VOICES,
        panners: voices.length,
        nodes: voices.length * 3,
        hasListener: !!cam,
        hasOccluder: !!occludedFn,
        menuMusic: menuOn,
        active: ctx ? voices.filter(v => v.freeAt > ctx.currentTime).length : 0,
        panningModel: voices.length ? voices[0].panner.panningModel : null,
        distanceModel: voices.length ? voices[0].panner.distanceModel : null,
        lastClaim,
      };
    },
  };
}
