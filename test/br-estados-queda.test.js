/* ================================================================
   QA — ESTADOS DO BR NO CELULAR que o `startBRMatch` pula (ele joga o
   jogador direto no chão, de propósito): nave, queda, paraquedas, pouso,
   chat, morte e espectador. Partida BR de verdade, V3 844×390, ?mobile=1,
   percorrida em ordem — cada caso parte do estado em que o anterior deixou.

   O que se cobra (laudo `7515734`):
   · M6 — a retícula só aparece quando diz a verdade. Na nave, na queda, no
     paraquedas e no espectador `shootUpdate` retorna antes de qualquer tiro
     (`__BR_freeze`), e a retícula estava com opacidade 1. Controle positivo:
     depois do pouso, com o tiro possível, ela aparece.
   · E3 — queda e paraquedas pelo ANALÓGICO. `fallStep` lia só W/A/S/D, e o
     analógico a pé não emite tecla: 0,00 m em 8 direções, com a dica
     prometendo "analógico pra planar". Régua: a direção andada (posição do
     jogador) contra a pedida RELATIVA À VISTA, e a vista lida da
     `camera.matrixWorld` — não do `yawDaVista()` que o produto usa.
   · C10 — abrir o chat e morrer SOLTAM tudo: com o polegar no analógico, o
     dedo no ATIRAR, o ⇩ apertado e a MIRA ligada, o boneco andava 1,275 m em
     0,5 s digitando, e na morte `ControlLeft`/`shooting`/`aiming` seguiam
     ligados.

   A queda anda no RELÓGIO (o `brTick` roda no rAF da página), então estes
   casos esperam quadros de verdade em vez de `QA.tick`. Porta 4002.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

const PORT = 4002;
const V3 = { width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

/* O `startBRMatchInShip` do harness, com as REGRAS DA SALA aplicadas pelo
   anfitrião antes do início (mesmo caminho do lobby real): sem golem, sem
   visitante, sem bichos, sem gás e sem a cinemática da cidade — nada disso é
   assunto aqui, e qualquer um deles pode matar ou tomar a câmera no meio do
   percurso. */
async function partidaNaNave(h) {
  const { io } = require('socket.io-client');
  await h.play(() => { const s = window.__MP && window.__MP.socket; if (s && !s.connected) s.connect(); });
  await h.page.waitForFunction('window.__MP && window.__MP.socket && window.__MP.socket.connected', { timeout: 15000 });
  await h.page.waitForFunction(
    'window.__BR_debug && window.__BR_debug.S && window.__BR_debug.S.phase === "LOBBY"' +
    ' && window.__MP_init && window.__MP_init.id === window.__MP.socket.id', { timeout: 60000 });
  const bot = io(`http://localhost:${h.port}`, { transports: ['websocket'] });
  const espera = ev => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`sem "${ev}"`)), 8000);
    bot.once(ev, d => { clearTimeout(t); res(d); });
  });
  try {
    await espera('init');
    bot.emit('hello', { nick: 'BotHost' });
    await new Promise((res, rej) => bot.timeout(4000).emit('claimHost', { code: 'QUEDALIVRE' },
      (e, d) => (e || !d || !d.ok) ? rej(new Error('claimHost falhou')) : res()));
    const flags = espera('flags');
    bot.emit('setFlags', { golem: false, alien: false, animais: false, cidade: false, gas: 'off' });
    await flags;
    bot.emit('requestStart');
    await h.page.waitForFunction(
      'window.__BR_debug && !!window.__BR_debug.S.plan && window.__BR_debug.S.phase === "SHIP"' +
      ' && !!window.__BR_debug.shipDebug.local', { timeout: 60000 });
    return bot;
  } catch (e) { bot.close(); throw e; }
}

function instalar() {
  const QA = window.QA, MP = QA.MP, THREE = MP.THREE;
  const toque = (sel, type, id, x, y) => document.querySelector(sel).dispatchEvent(new PointerEvent(type, {
    pointerId: id, pointerType: 'touch', isPrimary: id === 1,
    clientX: x, clientY: y, bubbles: true, cancelable: true }));
  const centro = sel => {
    const r = document.querySelector(sel).getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  const quadro = () => new Promise(r => requestAnimationFrame(() => r(performance.now())));
  const _f = new THREE.Vector3(), _r = new THREE.Vector3();
  window.EQA = {
    toque, centro, esperar, quadro,
    tap(sel, id) { const [x, y] = centro(sel); toque(sel, 'pointerdown', id, x, y); toque(sel, 'pointerup', id, x, y); },
    /* opacidade que o NAVEGADOR calcula para a retícula, e se o HUD que a
       contém está na tela (retícula com opacidade 1 dentro de um HUD
       escondido não é desenhada por ninguém). A opacidade tem transição de
       0,12 s (style.css): quem lê espera ela assentar. */
    async reticula() {
      await esperar(260);
      const c = document.getElementById('crosshair'), hud = document.getElementById('hud');
      const cs = getComputedStyle(c), hs = getComputedStyle(hud);
      return { opacidade: +cs.opacity, visivel: cs.visibility !== 'hidden',
        hud: hs.display !== 'none' && hs.visibility !== 'hidden' && +hs.opacity > 0 };
    },
    /* frente e direita HORIZONTAIS da câmera desenhada (âncora independente
       do `yawDaVista()` que o produto usa para dirigir a queda) */
    vista() {
      MP.camera.updateMatrixWorld();
      _f.set(0, 0, -1).transformDirection(MP.camera.matrixWorld); _f.y = 0; _f.normalize();
      _r.set(1, 0, 0).transformDirection(MP.camera.matrixWorld); _r.y = 0; _r.normalize();
      return { f: [_f.x, _f.z], r: [_r.x, _r.z] };
    },
    /* o polegar no analógico a `graus` da frente (horário, como na tela) e
       `curso` do raio de 58 px; espera `ms` de relógio e mede o que o jogador
       andou no plano, contra a direção pedida relativa à vista */
    async dirigir(graus, curso = 1, ms = 260, id = 40) {
      const [mx, my] = centro('#tcMove');
      const a = graus * Math.PI / 180;
      toque('#tcMove', 'pointerdown', id, mx, my);
      toque('#tcMove', 'pointermove', id, mx + 58 * curso * Math.sin(a), my - 58 * curso * Math.cos(a));
      await quadro(); await quadro();
      const P = MP.player.pos, v = this.vista();
      const x0 = P.x, z0 = P.z, t0 = performance.now();
      await esperar(ms);
      await quadro();
      const dx = P.x - x0, dz = P.z - z0, dt = (performance.now() - t0) / 1000;
      toque('#tcMove', 'pointerup', id, mx, my);
      const qx = v.f[0] * Math.cos(a) + v.r[0] * Math.sin(a), qz = v.f[1] * Math.cos(a) + v.r[1] * Math.sin(a);
      const andou = Math.hypot(dx, dz);
      const erro = andou > 1e-6
        ? Math.abs(Math.atan2(dx * qz - dz * qx, dx * qx + dz * qz)) * 180 / Math.PI : 180;
      return { graus, andou, vel: andou / dt, erro };
    },
  };
}

describe('BR no celular — nave, queda, paraquedas, chat, morte, espectador', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, bot;
  before(async () => {
    h = await bootGame({ port: PORT, query: '?mobile=1', viewport: V3,
      extraEnv: { COUNTDOWN_S: '1', FLY_TIME: '300', NEXT_IN_S: '300' } });
    await h.play(instalar);
    /* o PvE do BR (esqueletos) caça quem pousa: fora do percurso */
    await h.play(() => window.QA.G.Skeletons.setEnabled(false));
    bot = await partidaNaNave(h);
    await h.play(() => window.EQA.esperar(400));
  });
  after(async () => {
    if (bot) bot.close();
    if (h) await h.close();
  });

  it('M6: dado a nave (sem tiro possível), então a retícula NÃO está na tela', async () => {
    const r = await h.play(async () => {
      const E = window.EQA, S = window.__BR_debug.S;
      await E.quadro(); await E.quadro();
      return { fase: S.phase, freeze: !!window.__BR_freeze, ...(await E.reticula()) };
    });
    assert.equal(r.fase, 'SHIP', 'cenário inválido: não está na nave');
    assert.equal(r.freeze, true, 'cenário inválido: na nave o tiro tem de estar travado');
    assert.equal(r.hud, true, 'cenário inválido: o HUD está escondido, a retícula não seria desenhada de qualquer jeito');
    assert.equal(r.opacidade, 0, `retícula com opacidade ${r.opacidade} na nave, onde nenhum tiro sai`);
  });

  it('E3: dado o ⇧ na nave e o analógico na QUEDA LIVRE, então o jogador anda na direção pedida relativa à vista (8 direções fora dos eixos)', async () => {
    const r = await h.play(async () => {
      const E = window.EQA, S = window.__BR_debug.S, MP = window.QA.MP;
      E.tap('.tcBtn[data-act="jump"]', 21);
      await E.quadro();
      const fase = S.phase;
      const ret = await E.reticula();
      /* vista girada 37°: yaw zero esconderia a troca de eixos */
      MP.camera.rotation.set(-0.35, 37 * Math.PI / 180, 0, 'YXZ');
      const out = [];
      /* 22,5° FORA dos eixos: quantizar o analógico em 8 direções (como tecla)
         daria erro 0 exatamente nos múltiplos de 45° (formato 3 do CLAUDE.md:
         medir o eixo em que o defeito não aparece) */
      for (let g = 22.5; g < 360; g += 45) {
        if (S.phase !== 'FALL' || S.chuteOpen) break;
        /* segura a queda LIVRE acima dos 120 m em que o paraquedas abre sozinho */
        const P = MP.player.pos;
        /* longe da borda do mapa (a rota da nave começa nela, e o clamp de
           `LIM` entortaria a direção) e acima dos 120 m do paraquedas */
        P.x = 30; P.z = 30;
        P.y = MP.groundAt(P.x, P.z, 999) + 230;
        out.push(await E.dirigir(g));
      }
      return { fase, ret, out, chute: !!S.chuteOpen };
    });
    console.log('  [queda livre] ' + r.out.map(m => `${m.graus}°: ${m.erro.toFixed(3)}° ${m.vel.toFixed(2)} m/s`).join(' · '));
    assert.equal(r.fase, 'FALL', 'o ⇧ não tirou da nave');
    assert.equal(r.out.length, 8, `a queda livre acabou antes das 8 direções (${r.out.length}, paraquedas ${r.chute})`);
    const ruins = r.out.filter(m => m.andou < 1 || m.erro > 1 || Math.abs(m.vel - 13) > 13 * 0.15)
      .map(m => `${m.graus}°: andou ${m.andou.toFixed(2)} m (${m.vel.toFixed(1)} m/s), erro ${m.erro.toFixed(2)}°`);
    assert.deepEqual(ruins, [], 'queda livre pelo analógico (13 m/s, ± 1°):\n' + ruins.join('\n'));
    assert.equal(r.ret.opacidade, 0, `retícula na queda (opacidade ${r.ret.opacidade}), sem tiro possível`);
  });

  it('E3: dado o paraquedas aberto pelo ⇧, então o analógico plana nas 8 direções, com velocidade proporcional ao curso', async () => {
    const r = await h.play(async () => {
      const E = window.EQA, S = window.__BR_debug.S, MP = window.QA.MP;
      E.tap('.tcBtn[data-act="jump"]', 22);
      await E.quadro();
      const chute = !!S.chuteOpen, ret = await E.reticula();
      MP.camera.rotation.set(-0.2, -121 * Math.PI / 180, 0, 'YXZ');
      const out = [];
      for (let g = 0; g < 360; g += 45) {
        if (S.phase !== 'FALL') break;
        out.push(await E.dirigir(g));
      }
      const meio = S.phase === 'FALL' ? await E.dirigir(30, 0.5) : null;
      return { chute, ret, out, meio };
    });
    console.log('  [paraquedas] ' + r.out.map(m => `${m.graus}°: ${m.erro.toFixed(3)}° ${m.vel.toFixed(2)} m/s`).join(' · ') +
      (r.meio ? ` · meio curso 30°: ${r.meio.erro.toFixed(3)}° ${r.meio.vel.toFixed(2)} m/s` : ''));
    assert.equal(r.chute, true, 'o ⇧ na queda não abriu o paraquedas');
    assert.equal(r.out.length, 8, `pousou antes das 8 direções (${r.out.length})`);
    const ruins = r.out.filter(m => m.andou < 1 || m.erro > 1 || Math.abs(m.vel - 10.5) > 10.5 * 0.15)
      .map(m => `${m.graus}°: andou ${m.andou.toFixed(2)} m (${m.vel.toFixed(1)} m/s), erro ${m.erro.toFixed(2)}°`);
    assert.deepEqual(ruins, [], 'paraquedas pelo analógico (10,5 m/s, ± 1°):\n' + ruins.join('\n'));
    assert.ok(r.meio, 'pousou antes do caso de meio curso');
    assert.ok(r.meio.erro <= 1, `meio curso a 30°: erro ${r.meio.erro.toFixed(2)}°`);
    /* curso 0,5 com zona morta radial de 0,12 → (0,5 − 0,12)/0,88 = 0,43 do talo */
    assert.ok(r.meio.vel > 10.5 * 0.3 && r.meio.vel < 10.5 * 0.6,
      `meio curso deveria planar mais devagar que o talo: ${r.meio.vel.toFixed(2)} m/s`);
    assert.equal(r.ret.opacidade, 0, `retícula no paraquedas (opacidade ${r.ret.opacidade})`);
  });

  it('M6: dado o pouso (tiro possível de novo), então a retícula VOLTA — controle positivo', async () => {
    const r = await h.play(async () => {
      const E = window.EQA, S = window.__BR_debug.S, MP = window.QA.MP;
      const P = MP.player.pos;
      P.y = MP.groundAt(P.x, P.z, 999) + 0.3;   // encosta no chão: o fallStep declara o pouso
      for (let i = 0; i < 20 && S.phase !== 'PLAY'; i++) await E.quadro();
      await E.quadro(); await E.quadro();
      return { fase: S.phase, freeze: !!window.__BR_freeze, ...(await E.reticula()) };
    });
    assert.equal(r.fase, 'PLAY', 'não pousou');
    assert.equal(r.freeze, false);
    assert.equal(r.opacidade, 1, `retícula sumida com o tiro possível (opacidade ${r.opacidade})`);
    assert.equal(r.visivel, true, 'retícula com visibility hidden com o tiro possível');
    assert.equal(r.hud, true, 'HUD escondido com o tiro possível');
  });

  /* C4 — o HUD nunca cita tecla que o celular não tem. A dica do baú dizia
     "<b>E</b> — ABRIR BAÚ"; no celular o baú abre pelo botão USAR. */
  it('C4: dado o jogador ao lado de um baú no celular, então a dica cita o botão USAR, não a tecla E', async () => {
    const r = await h.play(async () => {
      const E = window.EQA, D = window.__BR_debug, MP = window.QA.MP;
      const c = D.crates.find(k => !k.opened);
      if (!c) return { erro: 'nenhum baú fechado' };
      const P = MP.player.pos, antes = [P.x, P.y, P.z];
      P.set(c.x + 1.2, MP.groundAt(c.x + 1.2, c.z, c.g.position.y + 2), c.z);
      await E.esperar(400);                   // a dica do baú é revista a cada 0,15 s
      const box = document.getElementById('brHint');
      const html = box ? box.innerHTML : '', texto = box ? box.textContent : '';
      P.set(antes[0], antes[1], antes[2]);
      await E.esperar(400);
      return { html, texto };
    });
    assert.ok(!r.erro, r.erro);
    assert.match(r.texto, /ABRIR BAÚ/, `cenário inválido: a dica do baú não apareceu ("${r.texto}")`);
    assert.ok(!/<b[^>]*>\s*[A-Z]\s*<\/b>/.test(r.html) && !/\[E\]/.test(r.texto),
      `a dica do baú cita tecla de uma letra no celular: ${r.html}`);
    assert.match(r.texto, /USAR/, `a dica do baú não cita o botão USAR: "${r.texto}"`);
  });

  it('C10: dado o chat aberto com analógico, ATIRAR, ⇩ e MIRA apertados, então tudo é SOLTO e o boneco para', async () => {
    const r = await h.play(async () => {
      const E = window.EQA, S = window.__BR_debug.S, G = window.QA.G, MP = window.QA.MP;
      const [mx, my] = E.centro('#tcMove');
      const [fx, fy] = E.centro('.tcBtn[data-act="fire"]');
      const [cx, cy] = E.centro('.tcBtn[data-act="crouch"]');
      if (!G.mouse.aiming) E.tap('.tcBtn[data-act="ads"]', 30);
      E.toque('#tcMove', 'pointerdown', 31, mx, my);
      E.toque('#tcMove', 'pointermove', 31, mx, my - 58);
      E.toque('.tcBtn[data-act="fire"]', 'pointerdown', 32, fx, fy);
      E.toque('.tcBtn[data-act="crouch"]', 'pointerdown', 33, cx, cy);
      for (let i = 0; i < 20; i++) await E.quadro();
      const antes = { crouch: !!G.keys.ControlLeft, shooting: !!G.mouse.shooting, aiming: !!G.mouse.aiming,
        analogico: !!G.Touch.getMove().active };
      E.tap('.tcBtn[data-act="chat"]', 34);
      const aberto = !!S.chatOpen;
      const logo = { crouch: !!G.keys.ControlLeft, shooting: !!G.mouse.shooting, aiming: !!G.mouse.aiming,
        analogico: !!G.Touch.getMove().active };
      const P = MP.player.pos, x0 = P.x, z0 = P.z;
      await E.esperar(350);
      const x1 = P.x, z1 = P.z, t1 = performance.now();
      await E.esperar(250);
      const vel = Math.hypot(P.x - x1, P.z - z1) / ((performance.now() - t1) / 1000);
      const total = Math.hypot(P.x - x0, P.z - z0);
      const depois = { crouch: !!G.keys.ControlLeft, shooting: !!G.mouse.shooting, aiming: !!G.mouse.aiming,
        analogico: !!G.Touch.getMove().active };
      /* os dedos saem da tela e o chat fecha pelo mesmo botão */
      E.toque('#tcMove', 'pointerup', 31, mx, my);
      E.toque('.tcBtn[data-act="fire"]', 'pointerup', 32, fx, fy);
      E.toque('.tcBtn[data-act="crouch"]', 'pointerup', 33, cx, cy);
      E.tap('.tcBtn[data-act="chat"]', 35);
      await E.quadro();
      return { antes, aberto, logo, depois, vel, total, fechou: !S.chatOpen };
    });
    console.log(`  [chat] ${r.vel.toFixed(3)} m/s entre 0,35 e 0,6 s depois de abrir; ${r.total.toFixed(3)} m no total`);
    assert.deepEqual(r.antes, { crouch: true, shooting: true, aiming: true, analogico: true },
      'cenário inválido: os quatro dedos não estavam segurando nada');
    assert.equal(r.aberto, true, 'o chat não abriu');
    assert.deepEqual(r.logo, { crouch: false, shooting: false, aiming: false, analogico: false },
      'abrir o chat não soltou os dedos');
    assert.deepEqual(r.depois, { crouch: false, shooting: false, aiming: false, analogico: false },
      'algo voltou a ficar preso com o chat aberto');
    assert.ok(r.vel < 0.5, `o boneco seguiu andando com o chat aberto: ${r.vel.toFixed(2)} m/s (andou ${r.total.toFixed(2)} m)`);
    assert.equal(r.fechou, true, 'o chat não fechou');
  });

  it('C10: dada a MORTE com analógico, ATIRAR, ⇩ e MIRA apertados, então tudo é solto', async () => {
    const r = await h.play(async () => {
      const E = window.EQA, G = window.QA.G, MP = window.QA.MP;
      const [mx, my] = E.centro('#tcMove');
      const [fx, fy] = E.centro('.tcBtn[data-act="fire"]');
      const [cx, cy] = E.centro('.tcBtn[data-act="crouch"]');
      if (!G.mouse.aiming) E.tap('.tcBtn[data-act="ads"]', 40);
      E.toque('#tcMove', 'pointerdown', 41, mx, my);
      E.toque('#tcMove', 'pointermove', 41, mx + 58, my);
      E.toque('.tcBtn[data-act="fire"]', 'pointerdown', 42, fx, fy);
      E.toque('.tcBtn[data-act="crouch"]', 'pointerdown', 43, cx, cy);
      for (let i = 0; i < 10; i++) await E.quadro();
      const antes = { crouch: !!G.keys.ControlLeft, shooting: !!G.mouse.shooting, aiming: !!G.mouse.aiming,
        analogico: !!G.Touch.getMove().active };
      MP.player.invulnUntil = 0;
      MP.playerDamage(99999, null, { type: 'environment' });
      const morto = !!MP.player.dead;
      await E.quadro(); await E.quadro();
      const depois = { crouch: !!G.keys.ControlLeft, shooting: !!G.mouse.shooting, aiming: !!G.mouse.aiming,
        analogico: !!G.Touch.getMove().active };
      E.toque('#tcMove', 'pointerup', 41, mx, my);
      E.toque('.tcBtn[data-act="fire"]', 'pointerup', 42, fx, fy);
      E.toque('.tcBtn[data-act="crouch"]', 'pointerup', 43, cx, cy);
      return { antes, morto, depois };
    });
    assert.deepEqual(r.antes, { crouch: true, shooting: true, aiming: true, analogico: true },
      'cenário inválido: os dedos não estavam segurando nada');
    assert.equal(r.morto, true, 'cenário inválido: o dano não matou');
    assert.deepEqual(r.depois, { crouch: false, shooting: false, aiming: false, analogico: false },
      'morreu com dedo preso');
  });

  /* O espectador pelo caminho do jogo: `__BR_debug.spect` É o `enterSpectator`
     que o fim da recapitulação de morte chama (mesmo caminho de
     xr-spect-passo.test.js). Esperar a recapitulação não serve aqui: com só o
     bot-host vivo a partida TERMINA quando a página morre. */
  it('M6: dado o espectador (depois da morte), então a retícula NÃO está na tela', async () => {
    const r = await h.play(async () => {
      const E = window.EQA, S = window.__BR_debug.S;
      window.__BR_debug.spect();
      await E.quadro(); await E.quadro(); await E.quadro();
      return { fase: S.phase, freeze: !!window.__BR_freeze, ...(await E.reticula()) };
    });
    assert.equal(r.fase, 'SPECT', 'não chegou ao espectador');
    assert.equal(r.freeze, true);
    assert.equal(r.opacidade, 0, `retícula no espectador (opacidade ${r.opacidade}), sem tiro possível`);
  });

  it('dado o percurso inteiro, então nenhum erro de página', () => {
    assert.deepEqual(h.pageErrors, [], 'erros de página:\n' + h.pageErrors.join('\n'));
  });
});
