/* ================================================================
   QA — CONTROLES DE TOQUE NO JOGO DE VERDADE (Chrome headless).

   O teste de núcleo (test/touch-controls-core.test.js) prova a
   matemática. Este prova a FIAÇÃO: que o dedo na tela move o jogador,
   gira a câmera, dispara a arma e pausa — e que o desktop não mudou.

   Como o toque é simulado: `PointerEvent` sintético despachado nos
   elementos do contrato (#tcMove, #tcLook, .tcBtn). É determinístico e
   passa exatamente pelo caminho de produção — nenhum handler do jogo
   checa `isTrusted`, e o roteamento por `pointerId` é o mesmo. O
   viewport é o de um celular em paisagem, com `hasTouch`.

   O modo celular é ligado por `?mobile=1` (js/mobile.js), que vence a
   detecção — é assim que o Chrome headless de desktop entra no modo.

   Portas: 3270 (celular paisagem), 3271 (desktop), 3272 (celular em
   RETRATO) e 3273 (partida BR no celular). Uma partida por porta porque
   a detecção e o viewport valem a partir do boot.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness.js');

const PORT_MOBILE = 3270;
const PORT_DESKTOP = 3271;
const PORT_PORTRAIT = 3272;
const PORT_BR = 3273;

/* paisagem de celular real (iPhone 14 deitado). Vai no bootGame, NÃO depois:
   setViewport pós-boot recria o contexto de execução e apaga o window.QA. */
const PHONE_VIEWPORT = {
  width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
};
/* o MESMO aparelho em pé — o caso do bloqueio de rotação do sistema */
const PHONE_PORTRAIT = {
  width: 390, height: 844, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
};

/* área comum de retângulos (0 = não se tocam) */
function overlapArea(a, b) {
  const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return w * h;
}

/* helpers de ponteiro instalados NA PÁGINA (uma vez por boot) */
function installPointerHelpers() {
  const doc = document;
  const evt = (el, type, id, x, y) => {
    el.dispatchEvent(new PointerEvent(type, {
      pointerId: id, pointerType: 'touch', isPrimary: id === 1,
      clientX: x, clientY: y, bubbles: true, cancelable: true,
    }));
  };
  const center = el => {
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  window.TQA = {
    center,
    at: sel => center(doc.querySelector(sel)),
    down(sel, id, x, y) {
      const el = doc.querySelector(sel);
      const p = (x === undefined) ? center(el) : [x, y];
      evt(el, 'pointerdown', id, p[0], p[1]);
      return p;
    },
    move(sel, id, x, y) { evt(doc.querySelector(sel), 'pointermove', id, x, y); },
    up(sel, id, x, y) { evt(doc.querySelector(sel), 'pointerup', id, x || 0, y || 0); },
    cancel(sel, id) { evt(doc.querySelector(sel), 'pointercancel', id, 0, 0); },
    tap(sel, id) { const p = window.TQA.down(sel, id); window.TQA.up(sel, id, p[0], p[1]); },
    /* yaw/pitch lidos na MESMA ordem que a câmera usa (YXZ) */
    look() {
      const THREE = window.QA.MP.THREE;
      const e = new THREE.Euler(0, 0, 0, 'YXZ');
      e.setFromQuaternion(window.QA.MP.camera.quaternion);
      return { yaw: e.y, pitch: e.x, roll: e.z };
    },
    visible(id) {
      const el = doc.getElementById(id);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return getComputedStyle(el).display !== 'none' && r.width > 1 && r.height > 1;
    },
    /* O painel do lobby BR (.brPanel, z-index 300) é modal e nasce aberto no
       boot de QA. Escondê-lo é o que deixa o hit test medir o que interessa:
       os controles por cima do HUD e do canvas. */
    semLobby(fn) {
      const modais = [...doc.querySelectorAll('.brPanel')];
      for (const m of modais) m.style.display = 'none';
      try { return fn(); } finally { for (const m of modais) m.style.display = ''; }
    },
    /* retângulo serializável (DOMRect não sobrevive ao page.evaluate) */
    rect(sel) {
      const el = doc.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        width: r.width, height: r.height };
    },
    /* o que está DEBAIXO do dedo neste ponto */
    hit(x, y) {
      const el = doc.elementFromPoint(x, y);
      return el ? (el.id || el.className || el.tagName) : null;
    },
    /* ...e se esse alvo pertence a `sel` (o dedo cai NO widget, não importa
       em qual filho dele) */
    hitDentro(x, y, sel) {
      const el = doc.elementFromPoint(x, y);
      return !!(el && el.closest && el.closest(sel));
    },
  };
}

describe('Controles de toque — modo celular', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: PORT_MOBILE, query: '?mobile=1', viewport: PHONE_VIEWPORT });
    await h.play(installPointerHelpers);
    /* Os inimigos comuns ficam em pé no QA (o BR real os mata no começo da
       partida, br-game.js). Com a assistência de mira do toque ligada por
       padrão, um deles perto da cruz mexeria no giro que estes casos medem. */
    await h.play(() => {
      for (const e of window.QA.G.Enemies.list) { e.alive = false; if (e.group) e.group.visible = false; }
      window.QA.reset(); window.QA.tick(4);
    });
  });
  after(async () => { if (h) await h.close(); });
  const play = (fn, ...args) => h.play(fn, ...args);

  it('dado ?mobile=1, então o modo celular liga e o pointer lock NUNCA é pedido', async () => {
    const r = await play(() => {
      const G = window.QA.G;
      return {
        isMobile: G.isMobile,
        touchEnabled: G.Touch.enabled,
        fallback: G.Touch.fallback,
        classeMobile: document.documentElement.classList.contains('mobile'),
        classePlaying: document.documentElement.classList.contains('playing'),
        lockFailed: G.state.lockFailed,
        pointerLocked: G.state.pointerLocked,
        started: G.state.started,
        paused: G.state.paused,
      };
    });
    assert.equal(r.isMobile, true, '?mobile=1 não ligou a detecção');
    assert.equal(r.touchEnabled, true, 'camada de toque não instalou');
    assert.equal(r.fallback, false,
      'o DOM do contrato não foi encontrado no index.html (andaime de emergência entrou)');
    assert.equal(r.classeMobile, true, 'falta a classe `mobile` no <html>');
    assert.equal(r.classePlaying, true, 'em partida e sem a classe `playing`');
    assert.equal(r.lockFailed, true, 'celular precisa nascer em modo sem pointer lock');
    assert.equal(r.pointerLocked, false, 'pediu pointer lock no celular');
    assert.equal(r.paused, false);
  });

  /* CONTRATO NOVO (C8, docs/mobile/criterio-aaa.md). Este caso exigia os 14
     botões SEMPRE na tela (`btns.length === 14` + "falta o botão X") — era o
     próprio defeito escrito como requisito: USAR, COMER, KIT e GRANADA
     ocupando a zona do polegar com 0 carne, 0 kit e nada ao alcance. Agora:
     o CONTRATO DO HTML continua com os 14 `data-act` (o módulo depende deles);
     os DEZ fixos estão na tela e recebem o dedo; os QUATRO contextuais estão
     na tela exatamente quando o jogo tem o que fazer com eles — e a condição
     é lida do JOGO (inventário, #prompt), não do módulo de toque. Os casos
     de transição, "não anda de lugar" e "não some debaixo do dedo" moram em
     test/hud-contexto.test.js. */
  it('dado o modo celular em partida, então os fixos estão na tela, os contextuais seguem o jogo, e todos recebem o dedo', async () => {
    const r = await play(() => {
      const doc = document;
      const G = window.QA.G;
      window.QA.tick(1);
      const btns = [...doc.querySelectorAll('#tcBtns .tcBtn[data-act]')].map(b => b.dataset.act);
      const naTela = act => {
        const el = doc.querySelector(`#tcBtns .tcBtn[data-act="${act}"]`);
        const cs = getComputedStyle(el), rc = el.getBoundingClientRect();
        if (cs.display === 'none' || cs.visibility !== 'visible') return false;
        const hit = doc.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
        return !!hit && (hit === el || el.contains(hit));
      };
      const vis = {};
      for (const a of btns) vis[a] = window.TQA.semLobby(() => naTela(a));
      const jogo = { use: doc.getElementById('prompt').style.opacity === '1' || !!window.__BR_bauPerto,
        eat: G.inventory.meat > 0, med: G.inventory.medkits > 0, nade: G.inventory.nades > 0 };
      /* O painel do lobby BR (.brPanel, z-index 300) é modal e nasce aberto no
         boot de QA — em partida ele fecha. Ele é escondido aqui só para o hit
         test medir o que interessa: os controles POR CIMA do HUD e do canvas. */
      const modais = [...doc.querySelectorAll('.brPanel')];
      for (const m of modais) m.style.display = 'none';
      const alvo = sel => {
        const [x, y] = window.TQA.at(sel);
        const el = doc.elementFromPoint(x, y);
        return el ? (el.id || el.className || el.tagName) : null;
      };
      const fire = doc.querySelector('.tcBtn[data-act="fire"]').getBoundingClientRect();
      const alvos = { stick: alvo('#tcMove'), look: alvo('#tcLook'),
        fire: alvo('.tcBtn[data-act="fire"]') };
      for (const m of modais) m.style.display = '';
      return {
        touchUI: window.TQA.visible('touchUI'),
        move: window.TQA.visible('tcMove'),
        look: window.TQA.visible('tcLook'),
        btns, vis, jogo,
        alvoStick: alvos.stick,
        alvoLook: alvos.look,
        alvoFire: alvos.fire,
        fireLado: Math.min(fire.width, fire.height),
        lookMetadeDireita: window.TQA.at('#tcLook')[0] > window.innerWidth / 2,
        rotateGate: getComputedStyle(doc.getElementById('rotateGate')).display,
      };
    });
    assert.equal(r.touchUI, true, '#touchUI invisível em partida no celular');
    assert.equal(r.move, true, '#tcMove invisível');
    assert.equal(r.look, true, '#tcLook invisível');
    // contrato do HTML (o módulo liga os 14 data-act): presença no DOM, não na tela
    assert.deepEqual([...r.btns].sort(), ['ads', 'chat', 'crouch', 'eat', 'fire', 'inv', 'jump', 'med',
      'nade', 'pause', 'reload', 'sight', 'swap', 'use'], `contrato do HTML: ${r.btns.join(',')}`);
    for (const act of ['fire', 'ads', 'jump', 'crouch', 'reload', 'swap', 'inv', 'pause', 'sight', 'chat'])
      assert.equal(r.vis[act], true, `o botão FIXO ${act} não está na tela (ou não recebe o dedo)`);
    for (const act of ['use', 'eat', 'med', 'nade'])
      assert.equal(r.vis[act], r.jogo[act],
        `${act}: na tela = ${r.vis[act]}, mas o jogo ${r.jogo[act] ? 'TEM' : 'não tem'} o que fazer com ele`);
    // hit test REAL: o que está sob o dedo é o controle, não o HUD
    assert.equal(r.alvoStick, 'tcMove', `dedo no analógico caiu em ${r.alvoStick}`);
    assert.equal(r.alvoLook, 'tcLook', `dedo na área de mira caiu em ${r.alvoLook}`);
    assert.equal(r.alvoFire, 'tcBtn', `dedo no gatilho caiu em ${r.alvoFire}`);
    assert.equal(r.lookMetadeDireita, true, 'a área de mira não está na metade direita');
    assert.ok(r.fireLado >= 44, `gatilho de ${r.fireLado}px é alvo de toque pequeno demais`);
    assert.equal(r.rotateGate, 'none', 'aviso de girar o celular aparecendo em paisagem');
  });

  it('dado um arrasto na área de mira, então a câmera GIRA (e o pitch clampa)', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA;
      QA.reset();
      QA.tick(2);
      const antes = T.look();
      const p = T.down('#tcLook', 1);
      T.move('#tcLook', 1, p[0] + 60, p[1]);   // 60 px pra direita
      T.move('#tcLook', 1, p[0] + 120, p[1]);  // + 60 px
      const durante = T.look();                 // ainda NÃO tickou
      QA.tick(1);
      const depoisYaw = T.look();
      T.move('#tcLook', 1, p[0] + 120, p[1] - 90); // 90 px pra cima = olhar pra cima
      QA.tick(1);
      const depoisPitch = T.look();
      // arrasto absurdo: o pitch tem que travar, não capotar
      for (let i = 0; i < 40; i++) T.move('#tcLook', 1, p[0] + 120, p[1] - 90 - i * 60);
      QA.tick(1);
      const travado = T.look();
      T.up('#tcLook', 1, p[0] + 120, p[1]);
      QA.tick(1);
      const soltou = T.look();
      return {
        antes, durante, depoisYaw, depoisPitch, travado, soltou,
        sens: QA.G.Touch.lookSens, pointerSpeed: QA.G.controls.pointerSpeed,
      };
    });
    // o handler de ponteiro NÃO escreve na câmera: só o frame escreve
    assert.equal(r.durante.yaw, r.antes.yaw,
      'o pointermove girou a câmera fora do frame (jitter garantido)');
    const esperado = -120 * r.sens * (r.pointerSpeed || 1);
    assert.ok(Math.abs((r.depoisYaw.yaw - r.antes.yaw) - esperado) < 1e-3,
      `yaw devia mudar ${esperado} rad, mudou ${r.depoisYaw.yaw - r.antes.yaw}`);
    assert.ok(r.depoisPitch.pitch > r.depoisYaw.pitch + 0.1,
      `arrasto pra cima devia subir o pitch (${r.depoisYaw.pitch} -> ${r.depoisPitch.pitch})`);
    assert.ok(Math.abs(r.travado.pitch) <= 1.55 + 1e-6,
      `pitch estourou o clamp de game.js: ${r.travado.pitch}`);
    assert.ok(r.travado.pitch > 1.5, `pitch devia encostar no teto, ficou ${r.travado.pitch}`);
    /* TOLERÂNCIA, NÃO IGUALDADE: com o pitch no teto (1,55 rad, a 1,2° do
       gimbal) o ida-e-volta Euler↔quatérnio do applyFpsCamera — que roda todo
       frame, com ou sem dedo — mexe o último bit do yaw (medido: 1,4e-15 rad
       por frame, com o applyTouchLook saindo cedo e zero candidato de
       assistência). O `equal` passava por sorte de bits: com a razão Y/X em
       1,0 a sequência de pitch era outra. Girar de verdade é 1e-4 rad pra
       cima (um px de dedo = 3,2e-3). */
    assert.ok(Math.abs(r.soltou.yaw - r.travado.yaw) < 1e-9,
      `soltar o dedo continuou girando a câmera: ${r.soltou.yaw - r.travado.yaw} rad`);
  });

  /* ================================================================
     M3 — O MESMO ARRASTO É O MESMO ÂNGULO EM QUALQUER TAXA DE QUADROS.
     Este arquivo passava 45/45 com o delta do olhar multiplicado por `dt·60`
     (laudo 7515734, §4.2): todos os casos rodavam no dt padrão de 1/60, onde
     o fator vale 1. O arrasto é DISTÂNCIA de dedo, não velocidade — o ângulo
     não pode depender de quantos quadros couberam dentro dele.
     Âncora: 120 px × o ganho declarado no MENU (o `<output>` do slider mostra
     100 %, que é 0,0032 rad/px por js/touchcontrols.js) — o giro é lido da
     `camera.quaternion`, e o caso de 1 evento × 120 eventos compara o jogo
     com ele mesmo em cadências de dedo diferentes.
     ================================================================ */
  it('M3: dado o mesmo arrasto a 30, 60 e 120 Hz (e em 1 ou 120 eventos), então o giro é o MESMO', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA, G = QA.G;
      const medir = (hz, eventos) => {
        QA.reset();
        QA.tick(90, 1 / hz);                        // recuo e FOV assentam NESSA taxa
        const a = T.look();
        const p = T.down('#tcLook', 81, 600, 200);
        /* 120 px pra ESQUERDA, espalhados por `eventos` pointermoves, um
           quadro depois de cada grupo de 10 px (o dedo não espera o quadro) */
        const passo = 120 / eventos;
        for (let k = 1; k <= eventos; k++) {
          T.move('#tcLook', 81, p[0] - passo * k, p[1]);
          if (k % Math.max(1, Math.round(eventos / 12)) === 0) QA.tick(1, 1 / hz);
        }
        QA.tick(2, 1 / hz);
        const b = T.look();
        T.up('#tcLook', 81, p[0] - 120, p[1]);
        QA.tick(1, 1 / hz);
        return (b.yaw - a.yaw) * 180 / Math.PI;
      };
      const out = { hz30: medir(30, 120), hz60: medir(60, 120), hz120: medir(120, 120),
        umEvento: medir(60, 1), menu: document.getElementById('setTLookV').textContent,
        sens: G.Touch.lookSens };
      QA.reset();
      QA.tick(2);
      return out;
    });
    const esperado = 120 * 0.0032 * 180 / Math.PI;   // 22,0016° — ganho de 100 % do menu
    console.log(`  [M3] 120 px: ${r.hz30.toFixed(4)}° a 30 Hz, ${r.hz60.toFixed(4)}° a 60 Hz, ` +
      `${r.hz120.toFixed(4)}° a 120 Hz, ${r.umEvento.toFixed(4)}° em 1 evento (conta: ${esperado.toFixed(4)}°)`);
    assert.equal(r.menu, '100%', 'cenário inválido: a sensibilidade do menu não está em 100 %');
    for (const [nome, v] of [['30 Hz', r.hz30], ['60 Hz', r.hz60], ['120 Hz', r.hz120], ['1 evento', r.umEvento]])
      assert.ok(Math.abs(v - esperado) < esperado * 0.001,
        `${nome}: o mesmo arrasto girou ${v.toFixed(4)}°, a conta pede ${esperado.toFixed(4)}°`);
  });

  /* ================================================================
     P0-1 — O ATIRAR TAMBÉM GIRA A CÂMERA (docs/mobile/referencia-mira-toque.md)
     ================================================================ */
  it('(a) dado o dedo no ATIRAR arrastando, então a câmera gira N px × sens E a arma dispara', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA, G = QA.G;
      const btn = '.tcBtn[data-act="fire"]';
      /* `municao` false = GATILHO SECO: o dedo segura o gatilho, mas sem bala
         não há tiro nem RECUO — e o recuo (com desvio sorteado por tiro) soma
         yaw no mesmo frame, o que contaminaria o giro medido. Com munição, o
         mesmo gesto prova que a arma dispara enquanto o dedo arrasta. */
      const medir = (fator, municao) => {
        if (fator !== undefined) {
          const el = document.getElementById('setTFire');
          el.value = String(fator);
          el.dispatchEvent(new Event('input'));
        }
        QA.reset();
        QA.tick(90);                               // switchAnim e a mola do recuo assentam
        G.gun.mag = municao ? G.gun.magSize : 0; G.gun.reloading = false;
        const mag0 = G.gun.mag;
        const antes = T.look();
        const p = T.down(btn, 5);
        // 100 px pra ESQUERDA, em 5 passos, sem soltar o gatilho
        for (let i = 1; i <= 5; i++) T.move(btn, 5, p[0] - 20 * i, p[1]);
        QA.tick(1);
        const depois = T.look();
        QA.tick(12);
        const out = { dyaw: depois.yaw - antes.yaw, dpitch: depois.pitch - antes.pitch,
          gastou: mag0 - G.gun.mag, segurando: G.mouse.shooting, sens: G.Touch.lookSens };
        T.up(btn, 5, p[0] - 100, p[1]);
        QA.tick(2);
        out.soltou = !G.mouse.shooting;
        return out;
      };
      /* o gatilho seco dispara RECARGA automática (game.js, startReload), que
         drena a reserva: a munição volta no fim, senão o caso do botão de
         recarga, mais adiante, não tem o que recarregar */
      const guarda = { mag: G.gun.mag, reserve: G.gun.reserve };
      const cheio = medir(undefined, false);
      const atirando = medir(undefined, true);
      const metade = medir(50, false);
      const zero = medir(0, false);
      const zeroAtira = medir(0, true);
      medir(100, false);                            // devolve o padrão
      G.gun.reloading = false; G.gun.mag = guarda.mag; G.gun.reserve = guarda.reserve;
      return { cheio, atirando, metade, zero, zeroAtira };
    });
    const esperado = 100 * r.cheio.sens;             // dedo pra esquerda = yaw +
    console.log(`  [a] ATIRAR arrastado 100 px: girou ${(r.cheio.dyaw * 180 / Math.PI).toFixed(3)}° ` +
      `(conta: ${(esperado * 180 / Math.PI).toFixed(3)}°); com munição girou ` +
      `${(r.atirando.dyaw * 180 / Math.PI).toFixed(3)}° e gastou ${r.atirando.gastou} balas`);
    assert.ok(Math.abs(r.cheio.dyaw - esperado) < 1e-6,
      `arrastar o ATIRAR devia girar ${esperado} rad, girou ${r.cheio.dyaw}`);
    assert.ok(Math.abs(r.cheio.dpitch) < 1e-9, `arrasto horizontal mexeu no pitch: ${r.cheio.dpitch}`);
    assert.equal(r.cheio.segurando, true, 'arrastar soltou o gatilho');
    assert.equal(r.cheio.soltou, true);
    // com munição: dispara E gira (o recuo soma no máximo alguns milirradianos)
    assert.ok(r.atirando.gastou > 0, 'o dedo no ATIRAR girou mas não disparou');
    assert.ok(Math.abs(r.atirando.dyaw - esperado) < 0.01,
      `atirando, o giro saiu ${r.atirando.dyaw} rad contra ${esperado}`);
    assert.equal(r.atirando.segurando, true);
    assert.ok(Math.abs(r.metade.dyaw - esperado / 2) < 1e-6, `fator 50 %: ${r.metade.dyaw}`);
    assert.ok(Math.abs(r.zero.dyaw) < 1e-9, `fator 0 devia desligar o giro: ${r.zero.dyaw}`);
    assert.ok(r.zeroAtira.gastou > 0, 'com o giro desligado o botão parou de atirar');
  });

  it('(a) dados o dedo do olhar E o do ATIRAR juntos, então os dois giros somam', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA, G = QA.G;
      QA.reset();
      QA.tick(90);
      const guarda = { mag: G.gun.mag, reserve: G.gun.reserve };
      G.gun.mag = 0;                              // gatilho seco: sem recuo no giro medido
      const antes = T.look();
      const a = T.down('#tcLook', 21, 600, 120);
      const b = T.down('.tcBtn[data-act="fire"]', 22);
      T.move('#tcLook', 21, a[0] + 40, a[1]);
      T.move('.tcBtn[data-act="fire"]', 22, b[0] + 25, b[1]);
      QA.tick(1);
      const depois = T.look();
      T.up('#tcLook', 21, a[0] + 40, a[1]);
      T.up('.tcBtn[data-act="fire"]', 22, b[0] + 25, b[1]);
      QA.tick(2);
      G.gun.reloading = false; G.gun.mag = guarda.mag; G.gun.reserve = guarda.reserve;
      return { dyaw: depois.yaw - antes.yaw, sens: G.Touch.lookSens };
    });
    assert.ok(Math.abs(r.dyaw - (-65 * r.sens)) < 1e-6, `40 + 25 px deviam somar: ${r.dyaw}`);
  });

  it('(a) dado o ajuste do segundo ATIRAR, então ele aparece à esquerda, atira e mira', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA, G = QA.G;
      const sel = '.tcBtn[data-act="fireL"]';
      const liga = v => { const el = document.getElementById('setTFireL'); el.value = String(v); el.dispatchEvent(new Event('change')); };
      const antesDoAjuste = T.visible('tcBtnsL');
      liga(1);
      const ligado = T.visible('tcBtnsL');
      const rect = T.rect(sel), stick = T.rect('#tcMove');
      QA.reset();
      QA.tick(90);
      const guarda = { mag: G.gun.mag, reserve: G.gun.reserve };
      G.gun.mag = G.gun.magSize;
      const mag0 = G.gun.mag;
      const p = T.semLobby(() => T.hit(...T.at(sel)));
      let d = T.down(sel, 41);
      QA.tick(12);
      const gastou = mag0 - G.gun.mag;
      T.up(sel, 41, d[0], d[1]);
      QA.tick(90);
      G.gun.mag = 0;                              // gatilho seco: o giro sem recuo
      const y0 = T.look().yaw;
      d = T.down(sel, 41);
      T.move(sel, 41, d[0] + 30, d[1]);
      QA.tick(1);
      const out = { antesDoAjuste, ligado, alvo: p, gastou,
        dyaw: T.look().yaw - y0, sens: G.Touch.lookSens,
        esquerda: rect.right < innerWidth / 2, sobreStick: rect.left < stick.right && rect.bottom > stick.top && rect.top < stick.bottom && rect.right > stick.left };
      T.up(sel, 41, d[0] + 30, d[1]);
      QA.tick(2);
      out.soltou = !G.mouse.shooting;
      liga(0);
      out.desligado = !T.visible('tcBtnsL');
      G.gun.reloading = false; G.gun.mag = guarda.mag; G.gun.reserve = guarda.reserve;
      return out;
    });
    assert.equal(r.antesDoAjuste, false, 'o segundo ATIRAR nasceu visível (padrão é desligado)');
    assert.equal(r.ligado, true, 'ligar o ajuste não mostrou o botão');
    assert.equal(r.alvo, 'tcBtn', `o dedo no segundo ATIRAR caiu em ${r.alvo}`);
    assert.equal(r.esquerda, true, 'o segundo ATIRAR não está na metade esquerda');
    assert.equal(r.sobreStick, false, 'o segundo ATIRAR cobre o analógico');
    assert.ok(r.gastou > 0, 'o segundo ATIRAR não disparou');
    assert.ok(Math.abs(r.dyaw - (-30 * r.sens)) < 1e-6, `arrastar o segundo ATIRAR não mirou: ${r.dyaw}`);
    assert.equal(r.soltou, true);
    assert.equal(r.desligado, true);
  });

  /* ================================================================
     P1-5 — VERTICAL MAIS LENTO: o ângulo de um arrasto DIAGONAL é o da conta
     (atan(razão × dy/dx)), sem torção — o VR já pagou por zona morta por
     eixo que torcia a diagonal (9,79°).
     ================================================================ */
  it('dado um arrasto DIAGONAL, então a câmera gira no ângulo atan(0,6 × dy/dx)', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA, G = QA.G;
      const out = [];
      for (const [dx, dy] of [[80, -80], [100, -40], [-60, 90]]) {
        QA.reset();
        QA.tick(90);                                // a mola do recuo do caso anterior assenta
        const a = T.look();
        const p = T.down('#tcLook', 51);
        T.move('#tcLook', 51, p[0] + dx, p[1] + dy);
        QA.tick(1);
        const b = T.look();
        T.up('#tcLook', 51, p[0] + dx, p[1] + dy);
        QA.tick(1);
        out.push({ dx, dy, dyaw: b.yaw - a.yaw, dpitch: b.pitch - a.pitch });
      }
      return { out, ratio: G.Touch.cfg.ratioY, sens: G.Touch.lookSens };
    });
    assert.equal(r.ratio, 0.6, 'razão Y/X padrão devia ser 0,6 (Lyra)');
    for (const m of r.out) {
      const esperado = Math.atan2(Math.abs(m.dy) * 0.6, Math.abs(m.dx)) * 180 / Math.PI;
      const medido = Math.atan2(Math.abs(m.dpitch), Math.abs(m.dyaw)) * 180 / Math.PI;
      console.log(`  [P1-5] arrasto (${m.dx}, ${m.dy}) px: girou a ${medido.toFixed(3)}°, a conta pede ${esperado.toFixed(3)}°`);
      assert.ok(Math.abs(medido - esperado) < 0.01, `(${m.dx},${m.dy}): ${medido}° ≠ ${esperado}°`);
      assert.ok(Math.abs(Math.abs(m.dyaw) - Math.abs(m.dx) * r.sens) < 1e-6, 'o eixo horizontal perdeu escala');
    }
  });

  /* ================================================================
     P1-4 — ADS pela RAZÃO DAS TANGENTES, arma por arma. A régua é o FOV de
     mira declarado de cada arma (js/weapons.js / js/weaponrig.js), não o
     código de sensibilidade: esperado = N × sens × tan(adsFov/2)/tan(37,5°).
     ================================================================ */
  it('(f) dado o ADS de cada arma, então o arrasto gira pela razão das tangentes', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA, G = QA.G;
      const medir = () => {
        const a = T.look();
        const p = T.down('#tcLook', 61);
        T.move('#tcLook', 61, p[0] - 50, p[1]);
        QA.tick(1);
        const b = T.look();
        T.up('#tcLook', 61, p[0] - 50, p[1]);
        QA.tick(1);
        return b.yaw - a.yaw;
      };
      const out = [];
      /* as travas VOLTAM no fim: destrancar tudo e não devolver esvaziou o
         caso da troca de arma ("nunca para numa trancada" sem trancada
         nenhuma) e deixou a bazuca na mão do caso da cinemática */
      const travas = G.arsenal.map(w => !!w.locked);
      for (let i = 0; i < G.arsenal.length; i++) {
        G.arsenal[i].locked = false;
        QA.reset();
        G.switchWeapon(i);
        QA.tick(40);
        const miras = i === 0 ? 3 : 1;             // fuzil: ferro, red dot, luneta 2x (T)
        for (let m = 0; m < miras; m++) {
          if (m > 0) { T.tap('.tcBtn[data-act="sight"]', 62); QA.tick(2); }
          T.tap('.tcBtn[data-act="ads"]', 63);
          QA.tick(70);                              // FOV assenta (damp 11/s)
          const fov = G.gun.melee ? 75 : G.gun.adsFov;
          out.push({ nome: G.gun.name, fov, fovCam: QA.MP.camera.fov, dyaw: medir(),
            ps: QA.G.controls.pointerSpeed });
          T.tap('.tcBtn[data-act="ads"]', 63);
          QA.tick(30);
        }
        if (i === 0) { T.tap('.tcBtn[data-act="sight"]', 62); QA.tick(2); }  // volta pra alça
      }
      QA.reset();
      G.switchWeapon(0);
      QA.tick(10);
      G.arsenal.forEach((w, i) => { w.locked = travas[i]; });
      return { out, sens: G.Touch.lookSens };
    });
    const tan = f => Math.tan(f * Math.PI / 360);
    for (const m of r.out) {
      const ideal = tan(m.fov) / tan(75);
      const esperado = 50 * r.sens * ideal;
      const degrau = m.fov < 75 ? (m.fov < 40 ? 0.36 : 0.75) : 1;
      console.log(`  [f] ${m.nome.padEnd(22)} FOV ${String(m.fov).padStart(2)}°: escala ${(m.dyaw / (50 * r.sens)).toFixed(4)}` +
        ` (tangente ${ideal.toFixed(4)}; o degrau antigo dava ${degrau})`);
      assert.ok(Math.abs(m.fovCam - m.fov) < 0.05, `cenário inválido: ${m.nome} não assentou o FOV (${m.fovCam})`);
      assert.ok(Math.abs(m.dyaw - esperado) < esperado * 0.005,
        `${m.nome} (${m.fov}°): girou ${m.dyaw} rad, a razão das tangentes pede ${esperado}`);
    }
    assert.ok(r.out.some(m => m.fov === 48) && r.out.some(m => m.fov === 36), 'o red dot e a 2x não foram medidos');
  });

  it('dado o analógico no talo, então o jogador ANDA na direção da câmera e CORRE', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA, P = QA.MP.player;
      QA.reset();
      QA.tick(2);
      const p0 = QA.pos();
      // direção que a câmera olha (o movimento tem que sair nela)
      const fwd = new QA.MP.THREE.Vector3(0, 0, -1)
        .applyQuaternion(QA.MP.camera.quaternion);
      fwd.y = 0; fwd.normalize();
      const p = T.down('#tcMove', 1);
      T.move('#tcMove', 1, p[0], p[1] - 200); // dedo pra CIMA = frente, no talo
      const mag = QA.G.Touch.getMove().mag;
      QA.tick(45);
      const andou = QA.fwdDelta(p0);
      const spd = Math.hypot(P.vel.x, P.vel.z);
      const d = { x: P.pos.x - p0[0], z: P.pos.z - p0[1] };
      const dLen = Math.hypot(d.x, d.z) || 1;
      const cos = (d.x / dLen) * fwd.x + (d.z / dLen) * fwd.z;
      T.up('#tcMove', 1, p[0], p[1]);
      QA.tick(30);
      const spdParado = Math.hypot(P.vel.x, P.vel.z);
      const knob = document.getElementById('tcMoveKnob').style.transform;
      return { andou, spd, cos, mag, spdParado, knob, ativo: QA.G.Touch.getMove().active };
    });
    assert.ok(r.mag > 0.99, `talo do analógico devia dar mag 1, deu ${r.mag}`);
    assert.ok(r.andou > 3, `andou só ${r.andou} m em 0,75 s`);
    assert.ok(r.cos > 0.9, `andou de lado: cosseno ${r.cos} com a direção da câmera`);
    assert.ok(r.spd > 6.5, `talo devia CORRER (>6,5 m/s), veio ${r.spd} m/s`);
    assert.ok(/translate3d/.test(r.knob), `knob não acompanhou o dedo: "${r.knob}"`);
    assert.equal(r.ativo, false, 'soltar o dedo não desativou o analógico');
    assert.ok(r.spdParado < 0.5, `continuou andando depois de soltar: ${r.spdParado} m/s`);
  });

  it('dado meio curso do analógico, então ANDA sem correr', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA, P = QA.MP.player;
      QA.reset();
      QA.tick(2);
      const p = T.down('#tcMove', 1);
      T.move('#tcMove', 1, p[0], p[1] - 29); // ~meio raio
      const mag = QA.G.Touch.getMove().mag;
      QA.tick(45);
      const spd = Math.hypot(P.vel.x, P.vel.z);
      T.up('#tcMove', 1, p[0], p[1]);
      QA.tick(20);
      return { mag, spd };
    });
    assert.ok(r.mag > 0.3 && r.mag < 0.7, `meio curso devia dar mag média, deu ${r.mag}`);
    assert.ok(r.spd > 1 && r.spd < 5.6,
      `meio curso devia andar devagar (<5,6 m/s), veio ${r.spd} m/s`);
  });

  it('dados DOIS dedos, então mover e mirar funcionam AO MESMO TEMPO', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA;
      QA.reset();
      QA.tick(2);
      const p0 = QA.pos();
      const yaw0 = T.look().yaw;
      const a = T.down('#tcMove', 11);   // dedo esquerdo: analógico
      const b = T.down('#tcLook', 22);   // dedo direito: mira
      T.move('#tcMove', 11, a[0], a[1] - 200);
      T.move('#tcLook', 22, b[0] + 80, b[1]);
      QA.tick(30);
      const andou = QA.fwdDelta(p0);
      const girou = T.look().yaw - yaw0;
      const roles = [QA.G.Touch.core.roleOf(11), QA.G.Touch.core.roleOf(22)];
      T.up('#tcMove', 11, a[0], a[1]);
      T.up('#tcLook', 22, b[0], b[1]);
      QA.tick(20);
      return { andou, girou, roles };
    });
    assert.deepEqual(r.roles, ['stick', 'look'], 'os dois dedos se atrapalharam');
    assert.ok(r.andou > 2, `andou só ${r.andou} m com os dois dedos na tela`);
    assert.ok(Math.abs(r.girou) > 0.1, `câmera girou só ${r.girou} rad`);
  });

  it('dado o botão de tiro, então a arma DISPARA e solta o gatilho ao levantar o dedo', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA;
      QA.reset();
      QA.tick(30); // switchAnim precisa passar de 0,8
      const magAntes = QA.G.gun.mag;
      T.down('.tcBtn[data-act="fire"]', 1);
      const segurando = QA.G.mouse.shooting;
      const classe = document.querySelector('.tcBtn[data-act="fire"]').classList.contains('on');
      QA.tick(20);
      const magDurante = QA.G.gun.mag;
      T.up('.tcBtn[data-act="fire"]', 1);
      const soltou = QA.G.mouse.shooting;
      const classeSolta = document.querySelector('.tcBtn[data-act="fire"]').classList.contains('on');
      QA.tick(20);
      const magDepois = QA.G.gun.mag;
      return { magAntes, magDurante, magDepois, segurando, soltou, classe, classeSolta };
    });
    assert.equal(r.segurando, true, 'botão de tiro não segurou mouse.shooting');
    assert.equal(r.classe, true, 'botão pressionado sem a classe `on`');
    assert.ok(r.magDurante < r.magAntes, `não atirou: pente ${r.magAntes} -> ${r.magDurante}`);
    assert.equal(r.soltou, false, 'levantar o dedo não soltou o gatilho');
    assert.equal(r.classeSolta, false, 'classe `on` ficou colada no botão');
    assert.equal(r.magDepois, r.magDurante, 'continuou atirando com o dedo fora da tela');
  });

  it('dado o botão de mira, então alterna o ADS (segurar um terceiro dedo não é viável)', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA;
      QA.reset();
      QA.tick(4);
      T.tap('.tcBtn[data-act="ads"]', 1);
      const ligou = QA.G.mouse.aiming;
      const classe = document.querySelector('.tcBtn[data-act="ads"]').classList.contains('on');
      QA.tick(30);
      T.tap('.tcBtn[data-act="ads"]', 1);
      const desligou = QA.G.mouse.aiming;
      QA.tick(4);
      return { ligou, desligou, classe };
    });
    assert.equal(r.ligou, true, 'toque na mira não ligou o ADS');
    assert.equal(r.classe, true, 'ADS ligado sem a classe `on`');
    assert.equal(r.desligou, false, 'segundo toque não desligou o ADS');
  });

  it('dado o botão de pular, então o jogador PULA (evento de teclado sintético)', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA;
      QA.reset();
      QA.tick(4);
      const noChao = QA.MP.player.onGround;
      T.down('.tcBtn[data-act="jump"]', 1);
      const tecla = !!QA.G.keys.Space;         // o keydown sintético chegou no jogo
      QA.tick(1);
      const vy = QA.MP.player.vel.y;
      T.up('.tcBtn[data-act="jump"]', 1);
      const teclaSolta = !!QA.G.keys.Space;    // keyup casado: sem tecla presa
      QA.tick(40);
      return { noChao, tecla, teclaSolta, vy };
    });
    assert.equal(r.noChao, true, 'cenário inválido: jogador não estava no chão');
    assert.equal(r.tecla, true, 'o keydown sintético não chegou no `keys` do jogo');
    assert.ok(r.vy > 5, `não pulou: vel.y = ${r.vy}`);
    assert.equal(r.teclaSolta, false, 'Space ficou preso (pulo infinito)');
  });

  it('dado o botão de agachar SEGURADO, então agacha e levanta ao soltar', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA;
      QA.reset();
      QA.tick(4);
      T.down('.tcBtn[data-act="crouch"]', 1);
      QA.tick(30);
      const agachado = QA.MP.player.crouchT;
      T.up('.tcBtn[data-act="crouch"]', 1);
      QA.tick(40);
      return { agachado, depois: QA.MP.player.crouchT };
    });
    assert.ok(r.agachado > 0.85, `não agachou segurando: crouchT ${r.agachado}`);
    assert.ok(r.depois < 0.15, `ficou agachado depois de soltar: crouchT ${r.depois}`);
  });

  it('dados os botões de recarga, granada, kit e inventário, então cada um age', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA, G = QA.G;
      QA.reset();
      QA.tick(20);
      G.gun.mag = 1;
      T.tap('.tcBtn[data-act="reload"]', 1);
      QA.tick(1);
      const recarregando = G.gun.reloading;
      QA.reset();
      /* C8: granada e kit só aparecem com o item no inventário */
      G.inventory.nades = Math.max(1, G.inventory.nades);
      G.inventory.medkits = Math.max(1, G.inventory.medkits);
      QA.tick(4);
      const nadesAntes = G.inventory.nades;
      T.tap('.tcBtn[data-act="nade"]', 1);
      QA.tick(2);
      const jogouNade = G.inventory.nades < nadesAntes;
      QA.MP.player.health = 40;
      const medAntes = G.inventory.medkits;
      T.tap('.tcBtn[data-act="med"]', 1);
      QA.tick(2);
      const usouMed = G.inventory.medkits < medAntes || QA.MP.player.healPool > 0;
      T.tap('.tcBtn[data-act="inv"]', 1);
      QA.tick(2);
      const invAberto = document.getElementById('invPanel').classList.contains('open');
      T.tap('.tcBtn[data-act="inv"]', 1);
      QA.tick(2);
      const invFechado = !document.getElementById('invPanel').classList.contains('open');
      return { recarregando, jogouNade, usouMed, invAberto, invFechado };
    });
    assert.equal(r.recarregando, true, 'botão de recarga não recarregou');
    assert.equal(r.jogouNade, true, 'botão de granada não jogou granada');
    assert.equal(r.usouMed, true, 'botão de kit médico não curou');
    assert.equal(r.invAberto, true, 'botão de inventário não abriu o painel');
    assert.equal(r.invFechado, true, 'botão de inventário não fechou o painel');
  });

  it('dado o botão de troca, então cicla a arma pulando as trancadas', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA, G = QA.G;
      QA.reset();
      QA.tick(10);
      const nomes = [G.gun.name];
      for (let i = 0; i < 3; i++) {
        T.tap('.tcBtn[data-act="swap"]', 1);
        QA.tick(2);
        nomes.push(G.gun.name);
      }
      return { nomes, trancadas: G.arsenal.filter(w => w.locked).map(w => w.name) };
    });
    assert.notEqual(r.nomes[1], r.nomes[0], `troca não mudou de arma (${r.nomes.join(' -> ')})`);
    for (const nome of r.nomes) assert.ok(!r.trancadas.includes(nome),
      `a troca parou numa arma TRANCADA: ${nome}`);
  });

  it('dado o botão de pausa, então pausa e o toque na tela retoma', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA;
      QA.reset();
      QA.tick(4);
      T.tap('.tcBtn[data-act="pause"]', 1);
      const pausado = QA.G.state.paused;
      const semControles = !document.documentElement.classList.contains('playing');
      const uiVisivel = window.TQA.visible('touchUI');
      document.getElementById('overlay').click(); // toque na tela = retoma
      const voltou = !QA.G.state.paused;
      const controlesDeVolta = document.documentElement.classList.contains('playing');
      QA.tick(4);
      return { pausado, semControles, uiVisivel, voltou, controlesDeVolta,
        lock: QA.G.state.pointerLocked };
    });
    assert.equal(r.pausado, true, 'botão de pausa não pausou');
    assert.equal(r.semControles, true, 'pausado e a classe `playing` ficou');
    assert.equal(r.uiVisivel, false, '#touchUI continuou na tela na pausa');
    assert.equal(r.voltou, true, 'toque na tela não retomou a partida');
    assert.equal(r.controlesDeVolta, true, 'retomou sem devolver os controles');
    assert.equal(r.lock, false, 'retomar no celular pediu pointer lock');
  });

  /* C5 (docs/mobile/criterio-aaa.md). O navegador do celular, depois de um
     toque cujo `pointerdown` NÃO foi cancelado, despacha mouse de
     COMPATIBILIDADE: pointerdown → pointerup → mousedown → mouseup → click.
     O `mousedown` de game.js escuta a janela sem olhar a origem — e 47 % da
     tela em partida é canvas nu. O headless não gera esses eventos; o dublê
     os despacha na ordem do Chrome Android, com a marca que o próprio Chrome
     põe neles (`sourceCapabilities.firesTouchEvents`), e SÓ depois de um
     pointerdown não cancelado (dublê que despacha sempre seria bom demais). */
  /* `semMarca`: o Safari não implementa InputDeviceCapabilities — lá o mouse
     de compatibilidade chega SEM `sourceCapabilities`, e só o relógio do
     último toque pode reconhecê-lo. */
  function toqueComCompat(el, x, y, id, semMarca = false) {
    const o = { pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y,
      bubbles: true, cancelable: true };
    const down = new PointerEvent('pointerdown', o);
    el.dispatchEvent(down);
    el.dispatchEvent(new PointerEvent('pointerup', o));
    if (down.defaultPrevented) return false;   // regra do Pointer Events: sem compat
    const caps = !semMarca && typeof InputDeviceCapabilities === 'function'
      ? new InputDeviceCapabilities({ firesTouchEvents: true }) : null;
    const m = { button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true,
      sourceCapabilities: caps };
    el.dispatchEvent(new MouseEvent('mousedown', m));
    el.dispatchEvent(new MouseEvent('mouseup', { ...m, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('click', { ...m, buttons: 0 }));
    return true;
  }

  it('C5: dado um toque em área VAZIA da tela (canvas nu), então a arma NÃO dispara', async () => {
    const r = await play(toqueSrc => {
      const toque = new Function(`return (${toqueSrc})`)();
      const QA = window.QA, G = QA.G;
      QA.reset();
      /* arma SEMI (DMR): o mousedown e o mouseup de compatibilidade chegam
         juntos, então a automática (lê `mouse.shooting`) já vê o gatilho
         solto no frame — quem dispara é o `mouse.clicked` que fica armado */
      /* a arma e a trava VOLTAM no fim: os casos seguintes seguram o gatilho
         esperando a automática de antes (o da cinemática ficou vermelho com
         "30 -> 30" enquanto este vazava a DMR) */
      const armaAntes = G.arsenal.indexOf(G.gun), travaAntes = G.arsenal[2].locked;
      G.arsenal[2].locked = false;
      G.switchWeapon(2);
      QA.tick(30);
      try {
        const canvas = document.querySelector('canvas#game') || document.querySelector('canvas');
        /* pontos de canvas NU: o que está por cima no ponto é o próprio canvas */
        const pontos = [];
        for (let y = 20; y < innerHeight - 20; y += 40)
          for (let x = 20; x < innerWidth - 20; x += 40)
            if (document.elementFromPoint(x, y) === canvas) pontos.push([x, y]);
        const antes = G.gun.mag;
        let compat = 0, id = 700;
        let n = 0;
        for (const [x, y] of pontos.slice(0, 12)) {
          if (toque(canvas, x, y, id++, n++ % 2 === 1)) compat++;   // metade "Safari"
          QA.tick(3);
        }
        return { pontos: pontos.length, compat, antes, depois: G.gun.mag, atirando: G.mouse.shooting };
      } finally {
        G.arsenal[2].locked = travaAntes;
        G.switchWeapon(armaAntes);
        QA.tick(30);
      }
    }, toqueComCompat.toString());
    assert.ok(r.pontos > 0, 'cenário inválido: nenhum ponto de canvas nu na tela em partida');
    assert.ok(r.compat > 0, 'cenário inválido: nenhum toque gerou mouse de compatibilidade');
    assert.equal(r.depois, r.antes,
      `toque em canvas nu DISPAROU: pente ${r.antes} → ${r.depois} (${r.compat} toques)`);
    assert.equal(r.atirando, false, 'gatilho ficou preso depois dos toques');
  });

  it('C5-b: dado o toque que TIRA DA PAUSA, então ele não dispara', async () => {
    const r = await play(toqueSrc => {
      const toque = new Function(`return (${toqueSrc})`)();
      const QA = window.QA, G = QA.G, T = window.TQA;
      QA.reset();
      const armaAntes = G.arsenal.indexOf(G.gun), travaAntes = G.arsenal[2].locked;
      G.arsenal[2].locked = false;   // semi: ver o caso de cima
      G.switchWeapon(2);
      QA.tick(30);
      try {
        T.tap('.tcBtn[data-act="pause"]', 1);
        const pausado = G.state.paused;
        const ov = document.getElementById('overlay');
        const b = ov.getBoundingClientRect();
        const antes = G.gun.mag;
        toque(ov, b.left + b.width / 2, b.top + b.height * 0.8, 780);
        QA.tick(6);
        return { pausado, voltou: !G.state.paused, antes, depois: G.gun.mag };
      } finally {
        if (G.state.paused) document.getElementById('overlay').click();
        G.arsenal[2].locked = travaAntes;
        G.switchWeapon(armaAntes);
        QA.tick(30);
      }
    }, toqueComCompat.toString());
    assert.equal(r.pausado, true, 'cenário inválido: o botão de pausa não pausou');
    assert.equal(r.voltou, true, 'cenário inválido: o toque não tirou da pausa');
    assert.equal(r.depois, r.antes, `o toque que retoma DISPAROU: pente ${r.antes} → ${r.depois}`);
  });

  it('dado um dedo cancelado (pointercancel), então nada fica preso', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA;
      QA.reset();
      QA.tick(20);
      const p = T.down('#tcMove', 1);
      T.move('#tcMove', 1, p[0], p[1] - 200);
      T.down('.tcBtn[data-act="fire"]', 2);
      T.down('.tcBtn[data-act="crouch"]', 3);
      QA.tick(5);
      const antes = { mag: QA.G.Touch.getMove().mag, atirando: QA.G.mouse.shooting,
        ctrl: !!QA.G.keys.ControlLeft };
      T.cancel('#tcMove', 1);
      T.cancel('.tcBtn[data-act="fire"]', 2);
      T.cancel('.tcBtn[data-act="crouch"]', 3);
      QA.tick(30);
      return { antes, mag: QA.G.Touch.getMove().mag, atirando: QA.G.mouse.shooting,
        ctrl: !!QA.G.keys.ControlLeft, spd: Math.hypot(QA.MP.player.vel.x, QA.MP.player.vel.z),
        crouchT: QA.MP.player.crouchT };
    });
    assert.equal(r.antes.mag > 0.9 && r.antes.atirando && r.antes.ctrl, true,
      'cenário inválido: os três controles não estavam ativos');
    assert.equal(r.mag, 0, 'analógico ficou preso depois do pointercancel');
    assert.equal(r.atirando, false, 'gatilho ficou preso depois do pointercancel');
    assert.equal(r.ctrl, false, 'ControlLeft ficou preso depois do pointercancel');
    assert.ok(r.spd < 0.5, `continuou andando: ${r.spd} m/s`);
    assert.ok(r.crouchT < 0.2, `continuou agachado: ${r.crouchT}`);
  });

  /* C10 (laudo 7515734): "pointercancel de todos os dedos: a MIRA (alternada)
     segue ligada". A mira é o único estado que nenhum dedo segura — por isso
     o caso de cima (analógico + ATIRAR + ⇩) não a pegava. */
  it('C10: dado pointercancel de TODOS os dedos com a MIRA ligada, então a mira também solta', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA, G = QA.G;
      QA.reset();
      QA.tick(20);
      const p = T.down('#tcMove', 101);
      T.move('#tcMove', 101, p[0], p[1] - 200);
      T.down('.tcBtn[data-act="fire"]', 102);
      T.tap('.tcBtn[data-act="ads"]', 103);
      QA.tick(5);
      const antes = { mirando: G.mouse.aiming, atirando: G.mouse.shooting, mag: G.Touch.getMove().mag };
      T.cancel('#tcMove', 101);
      const umSo = G.mouse.aiming;               // ainda há um dedo dono: a mira fica
      T.cancel('.tcBtn[data-act="fire"]', 102);
      QA.tick(10);
      return { antes, umSo, mirando: G.mouse.aiming, atirando: G.mouse.shooting,
        acesos: [...document.querySelectorAll('.tcBtn.on')].map(b => b.dataset.act) };
    });
    assert.equal(r.antes.mirando && r.antes.atirando && r.antes.mag > 0.9, true,
      'cenário inválido: analógico + ATIRAR + MIRA não foram montados');
    assert.equal(r.umSo, true, 'cancelar UM dedo (com outro ainda segurando) derrubou a mira');
    assert.equal(r.mirando, false, 'pointercancel de todos os dedos deixou a MIRA ligada');
    assert.equal(r.atirando, false);
    assert.deepEqual(r.acesos, [], `botões acesos depois do cancelamento: ${r.acesos.join(',')}`);
  });

  /* C10: o jogo chama `Touch.releaseAll()` ao abrir o chat e ao morrer (outra
     frente). Aqui: ele cobre TUDO que o critério lista — W/A/S/D, Space,
     ControlLeft, Tab, E, gatilho, mira, `.on`, trava de corrida, velocidade 0,5
     s depois — e os dedos que CONTINUAM na tela, arrastando, não religam nada. */
  it('C10: dado releaseAll com cinco dedos na tela, então tudo solta e o dedo que segue arrastando não religa', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA, G = QA.G, P = QA.MP.player;
      QA.reset();
      QA.tick(20);
      const p = T.down('#tcMove', 111);
      T.move('#tcMove', 111, p[0], p[1] - 120);  // além do alvo: corrida TRAVADA
      T.down('.tcBtn[data-act="fire"]', 112);
      T.down('.tcBtn[data-act="crouch"]', 113);
      T.down('.tcBtn[data-act="jump"]', 114);
      T.down('.tcBtn[data-act="inv"]', 115);
      T.tap('.tcBtn[data-act="ads"]', 116);
      QA.tick(3);
      const antes = { trava: G.Touch.sprintLocked, fogo: G.mouse.shooting, mira: G.mouse.aiming,
        ctrl: !!G.keys.ControlLeft, space: !!G.keys.Space, tab: !!G.keys.Tab };
      G.Touch.releaseAll();
      /* os dedos NÃO saíram da tela: seguem arrastando */
      for (let i = 1; i <= 10; i++) {
        T.move('#tcMove', 111, p[0] + i * 3, p[1] - 150);
        T.move('.tcBtn[data-act="fire"]', 112, 700 - i * 5, 300);
        QA.tick(3);
      }
      const k = G.keys;
      const out = { antes,
        teclas: ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ControlLeft', 'Tab', 'KeyE'].filter(c => k[c]),
        fogo: G.mouse.shooting, mira: G.mouse.aiming, trava: G.Touch.sprintLocked,
        mag: G.Touch.getMove().mag, vel: Math.hypot(P.vel.x, P.vel.z),
        acesos: [...document.querySelectorAll('.tcBtn.on, #tcMove.on, #tcMove.trava')].map(b => b.dataset.act || b.id) };
      /* devolve: dedos saem, inventário fecha */
      for (const [sel, id] of [['#tcMove', 111], ['.tcBtn[data-act="fire"]', 112], ['.tcBtn[data-act="crouch"]', 113],
        ['.tcBtn[data-act="jump"]', 114], ['.tcBtn[data-act="inv"]', 115]]) T.up(sel, id);
      document.getElementById('invPanel').classList.remove('open');
      QA.tick(10);
      return out;
    });
    assert.deepEqual(r.antes, { trava: true, fogo: true, mira: true, ctrl: true, space: true, tab: true },
      'cenário inválido: os cinco dedos + a mira não foram montados');
    assert.deepEqual(r.teclas, [], `teclas presas depois do releaseAll: ${r.teclas.join(',')}`);
    assert.equal(r.fogo, false, 'gatilho preso depois do releaseAll');
    assert.equal(r.mira, false, 'mira presa depois do releaseAll');
    assert.equal(r.trava, false, 'corrida travada depois do releaseAll');
    assert.equal(r.mag, 0, 'o dedo que seguiu no analógico religou o movimento');
    assert.ok(r.vel < 0.5, `0,5 s depois o jogador ainda anda a ${r.vel} m/s`);
    assert.deepEqual(r.acesos, [], `controles acesos: ${r.acesos.join(',')}`);
  });

  it('dada a perda de foco da janela, então tudo solta (aba trocada no meio do tiro)', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA;
      QA.reset();
      QA.tick(20);
      const p = T.down('#tcMove', 1);
      T.move('#tcMove', 1, p[0], p[1] - 200);
      T.down('.tcBtn[data-act="fire"]', 2);
      T.tap('.tcBtn[data-act="ads"]', 3);
      QA.tick(5);
      window.dispatchEvent(new Event('blur'));
      QA.tick(20);
      return { mag: QA.G.Touch.getMove().mag, atirando: QA.G.mouse.shooting,
        mirando: QA.G.mouse.aiming,
        classes: [...document.querySelectorAll('.tcBtn.on')].map(b => b.dataset.act) };
    });
    assert.equal(r.mag, 0, 'analógico preso depois do blur');
    assert.equal(r.atirando, false, 'gatilho preso depois do blur');
    assert.equal(r.mirando, false, 'ADS preso depois do blur');
    assert.deepEqual(r.classes, [], `botões acesos depois do blur: ${r.classes.join(',')}`);
  });

  it('dado o teclado no modo celular, então ele continua funcionando (nada foi trocado)', async () => {
    const r = await play(() => {
      const QA = window.QA;
      QA.reset();
      const p0 = QA.pos();
      QA.G.keys.KeyW = true;
      QA.tick(45);
      const andou = QA.fwdDelta(p0);
      QA.G.keys.KeyW = false;
      QA.tick(20);
      return { andou, ativo: QA.G.Touch.getMove().active };
    });
    assert.equal(r.ativo, false, 'canal de toque ficou ativo sem dedo na tela');
    assert.ok(r.andou > 3, `teclado parou de andar no modo celular: ${r.andou} m`);
  });

  it('dado um veículo, então o analógico vira volante (o carro só lê teclas)', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA, G = QA.G;
      QA.reset();
      G.teleportToCar();
      QA.tick(4);
      G.tryToggleCar();
      QA.tick(4);
      const dirigindo = G.state.driving;
      const p = T.down('#tcMove', 1);
      T.move('#tcMove', 1, p[0], p[1] - 200); // acelerar
      QA.tick(3);
      const w = !!G.keys.KeyW;
      T.move('#tcMove', 1, p[0] + 200, p[1]); // virar pra direita
      QA.tick(3);
      const d = !!G.keys.KeyD, wDepois = !!G.keys.KeyW;
      T.up('#tcMove', 1, p[0], p[1]);
      QA.tick(3);
      const soltou = { w: !!G.keys.KeyW, d: !!G.keys.KeyD };
      if (G.state.driving) G.tryToggleCar();
      QA.tick(4);
      return { dirigindo, w, d, wDepois, soltou, foraDoCarro: !G.state.driving,
        wFora: !!G.keys.KeyW };
    });
    assert.equal(r.dirigindo, true, 'cenário inválido: não entrou no carro');
    assert.equal(r.w, true, 'analógico pra frente não acelerou o carro (KeyW)');
    assert.equal(r.d, true, 'analógico pra direita não virou o carro (KeyD)');
    assert.equal(r.wDepois, false, 'KeyW ficou ligado com o analógico só no eixo x');
    assert.deepEqual(r.soltou, { w: false, d: false }, 'teclas do volante ficaram presas');
    assert.equal(r.foraDoCarro, true);
    assert.equal(r.wFora, false, 'saiu do carro com tecla de volante presa');
  });

  /* ================================================================
     A CINEMÁTICA DA DESTRUIÇÃO DA CIDADE (mecânica INTENCIONAL do
     servidor — CLAUDE.md) assume câmera E input por ~8 s. Os dois testes
     abaixo cobrem o encontro dela com a camada de toque. Nada aqui pode
     bloquear a cinemática nem os projéteis: o que se conserta é só o
     estado do toque que sobrevivia a ela.
     ================================================================ */
  it('dado arrasto na área de mira DURANTE a cinemática, então a câmera não chicoteia no fim', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA, G = QA.G;
      QA.reset();
      QA.tick(2);
      const qAntes = QA.MP.camera.quaternion.clone();
      G.state.cinematic = true;   // city-destruction-client.js:152
      QA.tick(2);
      const p = T.down('#tcLook', 1);
      // ~3000 px de arrasto ao longo do evento (o dedo não sabe que tem cinemática)
      for (let i = 1; i <= 50; i++) {
        T.move('#tcLook', 1, p[0] + i * 60, p[1]);
        if (i % 5 === 0) QA.tick(1);
      }
      QA.tick(4);
      const qDurante = QA.MP.camera.quaternion.clone();
      G.state.cinematic = false;  // endCinematic()
      T.up('#tcLook', 1, p[0] + 3000, p[1]);
      QA.tick(1);
      const qDepois = QA.MP.camera.quaternion.clone();
      return { girouDurante: qAntes.angleTo(qDurante), chicote: qDurante.angleTo(qDepois) };
    });
    assert.ok(r.girouDurante < 1e-6,
      `o dedo girou a câmera ${r.girouDurante} rad DURANTE a cinemática (ela é dona da câmera)`);
    assert.ok(r.chicote < 0.15,
      `câmera chicoteou ${r.chicote} rad no primeiro frame depois da cinemática ` +
      '(o acumulador de olhar sobreviveu ao evento)');
  });

  it('dada a cinemática zerando o mouse por baixo, então o dedo no gatilho volta a atirar', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA, G = QA.G;
      QA.reset();
      QA.tick(30);
      T.down('.tcBtn[data-act="fire"]', 1);   // dedo FIRME no gatilho
      T.tap('.tcBtn[data-act="ads"]', 2);     // e mira ligada
      QA.tick(4);
      const btnAds = document.querySelector('.tcBtn[data-act="ads"]');
      const antes = { atirando: G.mouse.shooting, mirando: G.mouse.aiming,
        aceso: btnAds.classList.contains('on') };
      /* MESMA linha de city-destruction-client.js:153 — a cinemática assume o
         input e o núcleo de toque não fica sabendo */
      G.state.cinematic = true;
      G.mouse.shooting = G.mouse.clicked = G.mouse.aiming = false;
      QA.tick(10);
      G.state.cinematic = false;
      QA.tick(2);
      G.gun.mag = 30;
      const magAntes = G.gun.mag;
      QA.tick(25);
      const depois = { atirando: G.mouse.shooting, mag: G.gun.mag,
        aceso: btnAds.classList.contains('on'), mirando: G.mouse.aiming };
      // o próximo toque na MIRA tem que LIGAR (e não ligar/desligar trocado)
      T.tap('.tcBtn[data-act="ads"]', 3);
      QA.tick(2);
      const religou = G.mouse.aiming;
      T.up('.tcBtn[data-act="fire"]', 1);
      QA.tick(4);
      return { antes, depois, magAntes, religou, soltou: G.mouse.shooting };
    });
    assert.equal(r.antes.atirando && r.antes.mirando && r.antes.aceso, true,
      'cenário inválido: gatilho segurado + ADS aceso não foi montado');
    assert.equal(r.depois.atirando, true,
      'a arma não voltou a atirar com o dedo ainda no gatilho depois da cinemática');
    assert.ok(r.depois.mag < r.magAntes,
      `dedo no gatilho e o pente não desceu (${r.magAntes} -> ${r.depois.mag})`);
    assert.equal(r.depois.aceso, false,
      'botão MIRA ficou aceso com o ADS desligado por baixo');
    assert.equal(r.religou, true, 'o toque seguinte na MIRA desligou o que já estava desligado');
    assert.equal(r.soltou, false, 'levantar o dedo deixou de soltar o gatilho');
  });

  it('dado o botão de carne, então dá pra COMER no celular (a cura deixa de ser inalcançável)', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA, G = QA.G;
      QA.reset();
      QA.tick(4);
      G.inventory.meat = 3;
      QA.MP.player.health = 40;
      QA.MP.player.healPool = 0;
      QA.tick(1);   // C8: o COMER só aparece com carne — em até 1 quadro
      const antes = G.inventory.meat;
      T.down('.tcBtn[data-act="eat"]', 1);
      const tecla = !!G.keys.KeyF;
      QA.tick(2);
      T.up('.tcBtn[data-act="eat"]', 1);
      const teclaSolta = !!G.keys.KeyF;
      QA.tick(2);
      return { antes, depois: G.inventory.meat, healPool: QA.MP.player.healPool,
        tecla, teclaSolta };
    });
    assert.equal(r.tecla, true, 'o botão de carne não emitiu KeyF');
    assert.equal(r.teclaSolta, false, 'KeyF ficou presa');
    assert.equal(r.depois, r.antes - 1, `carne não foi consumida (${r.antes} -> ${r.depois})`);
    assert.ok(r.healPool > 0, 'comeu carne e não curou');
  });

  it('dado o botão de acessório de mira, então KeyT chega no jogo', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA, G = QA.G;
      QA.reset();
      QA.tick(6);
      T.down('.tcBtn[data-act="sight"]', 1);
      const tecla = !!G.keys.KeyT;
      QA.tick(2);
      T.up('.tcBtn[data-act="sight"]', 1);
      const teclaSolta = !!G.keys.KeyT;
      QA.tick(2);
      return { tecla, teclaSolta };
    });
    assert.equal(r.tecla, true, 'o botão de acessório de mira não emitiu KeyT');
    assert.equal(r.teclaSolta, false, 'KeyT ficou presa');
  });

  it('dado o botão de chat, então ele emite o MESMO Enter que o BR escuta', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA;
      QA.reset();
      QA.tick(4);
      const vistos = [];
      const espia = e => vistos.push(e.code);
      window.addEventListener('keydown', espia);
      T.tap('.tcBtn[data-act="chat"]', 1);
      window.removeEventListener('keydown', espia);
      const btn = document.querySelector('.tcBtn[data-act="chat"]');
      const rc = btn.getBoundingClientRect();
      return { vistos, lado: Math.min(rc.width, rc.height),
        visivel: getComputedStyle(btn).display !== 'none' };
    });
    assert.equal(r.visivel, true, 'botão de chat escondido numa partida BR');
    assert.ok(r.vistos.includes('Enter'),
      `o botão de chat não emitiu Enter (viu: ${r.vistos.join(',')})`);
    assert.ok(r.lado >= 44, `botão de chat de ${r.lado}px é alvo de toque pequeno demais`);
  });

  it('dado o HUD no celular, então ele NÃO anuncia tecla que o aparelho não tem', async () => {
    const r = await play(() => {
      const QA = window.QA, G = QA.G;
      QA.reset();
      QA.tick(4);
      G.Interact.renderInv();
      const inv = document.getElementById('invList').textContent;
      const h3 = document.querySelector('#invPanel h3').textContent;
      G.teleportToCar();
      QA.tick(4);
      const prompt = document.getElementById('prompt').innerHTML;
      const speedo = document.querySelector('#speedo small').textContent;
      return { inv, h3, prompt, speedo };
    });
    const teclasFantasma = /\[[A-Z]+\]/;
    assert.ok(!teclasFantasma.test(r.inv),
      `o inventário anuncia tecla inalcançável no celular: "${r.inv}"`);
    assert.ok(!teclasFantasma.test(r.h3),
      `o título do inventário anuncia tecla inalcançável: "${r.h3}"`);
    assert.ok(/INV/i.test(r.h3),
      `o inventário aberto não diz como fechar: "${r.h3}"`);
    assert.ok(!/<b>E<\/b>/.test(r.prompt),
      `o prompt de interação ainda manda apertar E: "${r.prompt}"`);
    assert.ok(/USAR/i.test(r.prompt), `o prompt não aponta pro botão USAR: "${r.prompt}"`);
    assert.ok(/USAR/i.test(r.speedo), `o velocímetro perdeu a dica de toque: "${r.speedo}"`);
  });

  it('dado o inventário ABERTO, então ele não cobre nenhum controle de toque', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA;
      QA.reset();
      QA.tick(4);
      QA.G.Interact.renderInv();
      document.getElementById('invPanel').classList.add('open');
      QA.tick(2);
      return { painel: T.rect('#invPanel'), stick: T.rect('#tcMove'), btns: T.rect('#tcBtns') };
    });
    assert.ok(r.painel.width > 40, 'inventário aberto sem área — cenário inválido');
    assert.equal(overlapArea(r.painel, r.stick), 0,
      'o inventário cobre o analógico (e, dentro de #hud, não recebe o dedo)');
    assert.equal(overlapArea(r.painel, r.btns), 0,
      'o inventário cobre o cluster de botões (e não recebe o dedo)');
  });

  /* O arsenal do celular agora é a barra de ARMAS TOCÁVEIS (#tcArmas, C7) —
     o #slots do HUD sai de cena em partida porque a barra É a mesma leitura
     (qual está na mão, quais estão trancadas). A troca em um toque é medida
     em test/hud-armas.test.js; aqui fica a leitura. */
  it('dado o celular, então o arsenal continua legível (agora tocável) e fora dos controles', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA, G = QA.G;
      QA.reset();
      QA.tick(4);
      const trava2 = G.arsenal[2].locked;
      G.arsenal[2].locked = true;   // garante pelo menos uma trancada
      G.switchWeapon(0);
      QA.tick(2);
      const barra = document.getElementById('tcArmas');
      const out = {
        visivel: T.visible('tcArmas'),
        texto: barra.textContent,
        ativos: barra.querySelectorAll('.tcArma.ativa').length,
        ativaCerta: !!barra.querySelector(`.tcArma.ativa[data-slot="${G.arsenal.indexOf(G.gun)}"]`),
        rect: T.rect('#tcArmas'),
        stick: T.rect('#tcMove'), btns: T.rect('#tcBtns'), ammo: T.rect('#ammoWrap'),
      };
      G.arsenal[2].locked = trava2;
      QA.tick(1);
      return out;
    });
    assert.equal(r.visivel, true,
      'o celular escondeu o arsenal inteiro — sem leitura de qual arma vem nem do que está trancado');
    assert.ok(/🔒/.test(r.texto), `nenhum cadeado no arsenal: "${r.texto}"`);
    assert.equal(r.ativos, 1, `esperava 1 arma acesa, achei ${r.ativos}`);
    assert.equal(r.ativaCerta, true, 'a arma acesa não é a que está na mão');
    assert.equal(overlapArea(r.rect, r.stick), 0, 'o arsenal cobre o analógico');
    assert.equal(overlapArea(r.rect, r.btns), 0, 'o arsenal cobre o cluster de botões');
    assert.equal(overlapArea(r.rect, r.ammo), 0, 'o arsenal cobre a munição');
  });

  /* ================================================================
     TRAVA DE CORRIDA (referência §4.2/§4.3, P2-7): arrastar o analógico além
     de um ponto ACIMA dele trava a corrida. O alvo desenhado (#tcTrava) tem
     de estar onde a trava engata — é a única dica que o jogador tem —, e o
     teste acha esse ponto pela TELA (centro do alvo), não pela constante.
     ================================================================ */
  it('dado o dedo arrastado até o alvo acima do analógico, então a corrida TRAVA com o polegar relaxado; puxar pra trás solta', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA, P = QA.MP.player, G = QA.G;
      const vel = () => Math.hypot(P.vel.x, P.vel.z);
      const mv = document.getElementById('tcMove');
      QA.reset();
      QA.tick(2);
      /* controle: polegar a 10 px da origem, SEM trava = anda devagar */
      let p = T.down('#tcMove', 91);
      T.move('#tcMove', 91, p[0], p[1] - 10);
      QA.tick(45);
      const semTrava = vel();
      T.up('#tcMove', 91, p[0], p[1] - 10);
      QA.tick(30);
      /* agora: sobe além do talo — o alvo aparece — e vai até ELE */
      QA.reset();
      QA.tick(2);
      p = T.down('#tcMove', 92);
      T.move('#tcMove', 92, p[0], p[1] - 70);
      QA.tick(1);
      const alvo = document.getElementById('tcTrava');
      const alvoVisivel = getComputedStyle(alvo).display !== 'none';
      const ra = alvo.getBoundingClientRect();
      const ax = ra.left + ra.width / 2, ay = ra.top + ra.height / 2;
      const travadoAntes = G.Touch.sprintLocked;
      T.move('#tcMove', 92, ax, ay - 1);      // o dedo chega ao alvo
      QA.tick(1);
      const travou = G.Touch.sprintLocked;
      const anel = mv.classList.contains('trava');
      const alvoSome = getComputedStyle(alvo).display === 'none';
      T.move('#tcMove', 92, p[0], p[1] - 10); // polegar relaxa: 10 px da origem
      QA.tick(45);
      const relaxado = vel();
      const fwd = new QA.MP.THREE.Vector3(0, 0, -1).applyQuaternion(QA.MP.camera.quaternion);
      fwd.y = 0; fwd.normalize();
      const indoFrente = (P.vel.x * fwd.x + P.vel.z * fwd.z) / (vel() || 1);
      T.move('#tcMove', 92, p[0], p[1] + 40);  // puxa pra TRÁS
      QA.tick(30);
      const soltou = !G.Touch.sprintLocked;
      const re = (P.vel.x * fwd.x + P.vel.z * fwd.z);
      T.up('#tcMove', 92, p[0], p[1] + 40);
      QA.tick(30);
      return { semTrava, alvoVisivel, dy: p[1] - ay, travadoAntes, travou, anel, alvoSome,
        relaxado, indoFrente, soltou, re, parado: vel(), anelDepois: mv.classList.contains('trava') };
    });
    console.log(`  [trava] alvo a ${r.dy.toFixed(1)} px acima do dedo; polegar a 10 px: ` +
      `${r.semTrava.toFixed(2)} m/s sem trava, ${r.relaxado.toFixed(2)} m/s travado`);
    assert.ok(r.semTrava < 3, `cenário inválido: sem trava, 10 px já corria (${r.semTrava} m/s)`);
    assert.equal(r.alvoVisivel, true, 'o dedo passou do talo subindo e o alvo da trava não apareceu');
    assert.equal(r.travadoAntes, false, 'travou antes de o dedo chegar ao alvo');
    assert.equal(r.travou, true, 'o dedo chegou ao alvo desenhado e a corrida não travou');
    assert.equal(r.anel, true, 'travado, o anel do analógico não avisa');
    assert.equal(r.alvoSome, true, 'travado, o alvo continuou na tela (cobre o killfeed)');
    assert.ok(r.relaxado > 6.5, `travado com o polegar relaxado devia CORRER (>6,5 m/s), veio ${r.relaxado} m/s`);
    assert.ok(r.indoFrente > 0.95, `travado, o jogador não corre pra onde olha (cos ${r.indoFrente})`);
    assert.equal(r.soltou, true, 'puxar o analógico pra trás não destravou');
    assert.ok(r.re < -0.5, `puxou pra trás e o jogador não recuou (${r.re} m/s na frente)`);
    assert.ok(r.parado < 0.5, `soltou o dedo e o jogador seguiu (${r.parado} m/s)`);
    assert.equal(r.anelDepois, false);
  });

  it('dado o carro, então a trava de corrida não existe (acelerador preso seria cruzeiro sem mão)', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA, G = QA.G;
      QA.reset();
      G.teleportToCar();
      QA.tick(4);
      G.tryToggleCar();
      QA.tick(4);
      const dirigindo = G.state.driving;
      const p = T.down('#tcMove', 93);
      T.move('#tcMove', 93, p[0], p[1] - 160);  // bem além do alvo
      QA.tick(2);
      const travou = G.Touch.sprintLocked;
      T.move('#tcMove', 93, p[0], p[1]);        // polegar volta ao centro
      QA.tick(3);
      const w = !!G.keys.KeyW;
      T.up('#tcMove', 93, p[0], p[1]);
      QA.tick(2);
      if (G.state.driving) G.tryToggleCar();
      QA.tick(4);
      return { dirigindo, travou, w };
    });
    assert.equal(r.dirigindo, true, 'cenário inválido: não entrou no carro');
    assert.equal(r.travou, false, 'a trava de corrida engatou dirigindo');
    assert.equal(r.w, false, 'polegar no centro e o acelerador (KeyW) seguiu apertado');
  });

  /* ================================================================
     C9 — "RESTAURAR PADRÃO" e localStorage que LANÇA (aba privada, cota
     cheia). A âncora do efeito é o GIRO medido na câmera contra a conta com o
     padrão de js/config.js (1,0 × 0,0032 rad/px) — não o valor do slider.
     ================================================================ */
  it('C9: dado RESTAURAR PADRÃO, então os sete ajustes voltam e o giro volta ao do padrão', async () => {
    const r = await play(() => {
      const QA = window.QA, T = window.TQA;
      const set = (id, v, ev) => { const el = document.getElementById(id); el.value = String(v); el.dispatchEvent(new Event(ev)); };
      const giro = () => {
        QA.reset();
        QA.tick(90);   // FOV do caso anterior (mira, corrida) assenta: a escala do zoom volta a 1
        const a = T.look();
        const p = T.down('#tcLook', 121, 600, 200);
        T.move('#tcLook', 121, p[0] - 50, p[1]);
        QA.tick(1);
        const b = T.look();
        T.up('#tcLook', 121, p[0] - 50, p[1]);
        QA.tick(1);
        return b.yaw - a.yaw;
      };
      set('setTLook', 200, 'input'); set('setTRatio', 40, 'input'); set('setTAds', 130, 'input');
      set('setTFire', 0, 'input'); set('setTAssist', 0, 'change'); set('setTAuto', 1, 'change');
      set('setTFireL', 1, 'change');
      const mexido = giro();
      document.getElementById('setTReset').click();
      const ids = ['setTLook', 'setTRatio', 'setTAds', 'setTFire', 'setTAssist', 'setTAuto', 'setTFireL'];
      return {
        mexido, padrao: giro(),
        valores: ids.map(id => document.getElementById(id).value),
        saidas: ['setTLookV', 'setTRatioV', 'setTAdsV', 'setTFireV'].map(id => document.getElementById(id).textContent),
        fireL: document.documentElement.classList.contains('fireL'),
      };
    });
    /* 0,1 %: o FOV do caso anterior ainda deixa ~1e-4 de resíduo na escala do
       zoom; um restaurar que não vale erra por um fator 2, não por 1e-4 */
    assert.ok(Math.abs(r.mexido / (50 * 0.0032 * 2) - 1) < 1e-3, `cenário inválido: 200 % não dobrou o giro (${r.mexido})`);
    assert.ok(Math.abs(r.padrao / (50 * 0.0032) - 1) < 1e-3, `restaurou e o giro ficou ${r.padrao} rad (padrão: ${50 * 0.0032})`);
    assert.deepEqual(r.valores, ['100', '60', '100', '100', '1', '0', '0'], 'os controles do menu não voltaram ao padrão');
    assert.deepEqual(r.saidas, ['100%', '60%', '100%', '100%'], 'o número ao lado do slider não voltou');
    assert.equal(r.fireL, false, 'restaurou e o segundo ATIRAR continuou na tela');
  });

  it('C9: dado localStorage que LANÇA, então mexer nos ajustes e restaurar não derruba nada e vale na sessão', async () => {
    const errosAntes = h.pageErrors.length;
    const r = await play(() => {
      const QA = window.QA, G = QA.G;
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { throw new DOMException('cheio', 'QuotaExceededError'); };
      try {
        const el = document.getElementById('setTLook');
        el.value = '150';
        el.dispatchEvent(new Event('input'));
        const mexido = G.Touch.lookSens;
        document.getElementById('setTReset').click();
        return { mexido, restaurado: G.Touch.lookSens, saida: document.getElementById('setTLookV').textContent };
      } finally { Storage.prototype.setItem = orig; }
    });
    assert.equal(h.pageErrors.length, errosAntes, `localStorage lançando virou erro de página: ${h.pageErrors.slice(errosAntes).join(' | ')}`);
    assert.ok(Math.abs(r.mexido - 0.0032 * 1.5) < 1e-12, `o ajuste não valeu na sessão sem persistir (${r.mexido})`);
    assert.ok(Math.abs(r.restaurado - 0.0032) < 1e-12, `restaurar sem persistir não valeu na sessão (${r.restaurado})`);
    assert.equal(r.saida, '100%');
  });

  it('dado o modo celular, então nenhum erro de página apareceu no caminho', () => {
    assert.deepEqual(h.pageErrors, [], `erros de página: ${h.pageErrors.join(' | ')}`);
  });
});

/* ================================================================
   RETRATO — o caso em que GIRAR NÃO RESOLVE.

   Quem tem o bloqueio de rotação do sistema ligado (padrão de muita
   gente) deita o aparelho e o viewport continua em retrato: a media
   query continua casando, o #rotateGate continua cobrindo tudo (z 400,
   pointer-events auto) e "deite o aparelho para continuar" vira uma
   instrução impossível de cumprir. Mesmo desenho pega o iPad em Split
   View: `orientation` é medida pelo VIEWPORT, não pelo aparelho.

   Este viewport de teste é justamente esse: retrato, e sem nenhuma
   chance de girar.
   ================================================================ */
describe('Controles de toque — retrato quando girar não resolve',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootGame({ port: PORT_PORTRAIT, query: '?mobile=1', viewport: PHONE_PORTRAIT });
      await h.play(installPointerHelpers);
    });
    after(async () => { if (h) await h.close(); });
    const play = (fn, ...args) => h.play(fn, ...args);

    it('dado retrato, então o aviso cobre a tela E a partida NÃO roda por baixo dele', async () => {
      const r = await play(() => {
        const QA = window.QA, T = window.TQA;
        return {
          gate: getComputedStyle(document.getElementById('rotateGate')).display,
          bloqueando: QA.G.Orient.blocking(),
          pausado: QA.G.state.paused,
          iniciado: QA.G.state.started,
          /* o aviso é z 400: fica acima do #touchUI (60), do #overlay (100) e
             até do lobby do BR (.brPanel, 300) */
          comeuOToque: T.hitDentro(innerWidth / 2, innerHeight * 0.45, '#rotateGate'),
          centro: T.hit(innerWidth / 2, innerHeight * 0.45),
        };
      });
      assert.equal(r.iniciado, true, 'cenário inválido: a partida nem começou');
      assert.equal(r.gate, 'flex', 'o aviso de orientação não apareceu em retrato');
      assert.equal(r.bloqueando, true, 'o portão não se considera bloqueando em retrato');
      assert.equal(r.comeuOToque, true,
        `o aviso não está capturando o toque (achei ${r.centro})`);
      assert.equal(r.pausado, true,
        'partida rodando por baixo de um aviso que come todo o toque: ' +
        'alvo parado que não anda, não atira e não alcança a pausa');
    });

    it('dado que o aparelho GIRA pra retrato em plena partida, então pausa e solta os dedos', async () => {
      const r = await play(() => {
        const QA = window.QA, T = window.TQA, G = QA.G;
        /* monta "em partida, em paisagem": liberar o retrato desarma o aviso
           exatamente como estar deitado desarmaria */
        G.Orient.allowPortrait();
        G.state.paused = false;
        G.Touch.setPlaying(true);
        QA.reset();
        QA.tick(4);
        const p = T.down('#tcMove', 1);
        T.move('#tcMove', 1, p[0], p[1] - 200);
        T.down('.tcBtn[data-act="fire"]', 2);
        QA.tick(4);
        const antes = { mag: G.Touch.getMove().mag, atirando: G.mouse.shooting,
          pausado: G.state.paused };
        // ...e o aparelho auto-rotaciona pra retrato no meio do tiroteio
        G.Orient.revokePortrait();
        window.dispatchEvent(new Event('orientationchange'));
        QA.tick(4);
        return { antes, pausado: G.state.paused, mag: G.Touch.getMove().mag,
          atirando: G.mouse.shooting,
          playing: document.documentElement.classList.contains('playing') };
      });
      assert.equal(r.antes.mag > 0.9 && r.antes.atirando && !r.antes.pausado, true,
        'cenário inválido: analógico no talo + gatilho segurado não foi montado');
      assert.equal(r.pausado, true, 'girou pra retrato no meio da partida e o jogo continuou');
      assert.equal(r.mag, 0, 'pausou sem soltar o analógico');
      assert.equal(r.atirando, false, 'pausou com o gatilho preso');
      assert.equal(r.playing, false, 'pausou e deixou os controles na tela');
    });

    it('dado o travamento de orientação REJEITADO, então o aviso oferece saída', async () => {
      const r = await play(async () => {
        /* iOS Safari não implementa `orientation.lock` e rejeita SEMPRE; sem
           fullscreen, nenhum navegador trava. É o caso NORMAL, não um erro. */
        if (window.screen.orientation)
          window.screen.orientation.lock = () => Promise.reject(new Error('sem suporte'));
        document.documentElement.requestFullscreen = () => Promise.reject(new Error('sem gesto'));
        await window.QA.G.Orient.attempt(true);
        const b = document.getElementById('rgPlay');
        if (!b) return { falta: true };
        const rc = b.getBoundingClientRect();
        return {
          display: getComputedStyle(b).display,
          w: rc.width, h: rc.height,
          aria: b.getAttribute('aria-label') || '',
          texto: b.textContent.trim(),
          aviso: document.getElementById('rgSub').textContent,
        };
      });
      assert.ok(!r.falta, 'não existe botão de escape no aviso de orientação (#rgPlay)');
      assert.notEqual(r.display, 'none',
        'travamento rejeitado e o aviso continuou sem saída — 0% do jogo acessível');
      assert.ok(r.w >= 48 && r.h >= 48, `alvo de toque de ${r.w}x${r.h}px é pequeno demais`);
      assert.ok(/[a-zà-ú]/i.test(r.aria), 'botão de escape sem aria-label em pt-BR');
      assert.ok(/jogar assim/i.test(r.texto), `rótulo inesperado: "${r.texto}"`);
      // CRÍTICO 3: o texto não pode afirmar uma causa só ("é só girar")
      assert.ok(/rotaç|rotac/i.test(r.aviso),
        `o aviso não menciona o bloqueio de rotação do aparelho: "${r.aviso}"`);
      assert.ok(/janela|dividid|estreit/i.test(r.aviso),
        `o aviso não menciona janela estreita (iPad em Split View): "${r.aviso}"`);
    });

    it('dado o toque em JOGAR ASSIM, então o jogo fica ALCANÇÁVEL em retrato', async () => {
      const r = await play(() => {
        const QA = window.QA, T = window.TQA, G = QA.G;
        document.getElementById('rgPlay').click();
        const gate = getComputedStyle(document.getElementById('rotateGate')).display;
        document.getElementById('overlay').click();   // toque na tela retoma, como sempre
        QA.reset();
        QA.tick(4);
        const p0 = QA.pos();
        const p = T.down('#tcMove', 1);
        T.move('#tcMove', 1, p[0], p[1] - 200);
        QA.tick(45);
        const andou = QA.fwdDelta(p0);
        T.up('#tcMove', 1, p[0], p[1]);
        QA.tick(10);
        const alvos = T.semLobby(() => ({
          mira: T.hit(innerWidth * 0.75, innerHeight * 0.35),
          stick: T.hit(...T.at('#tcMove')),
          fire: T.hit(...T.at('.tcBtn[data-act="fire"]')),
        }));
        return { gate, andou, pausado: G.state.paused, alvos,
          portraitok: document.documentElement.classList.contains('portraitok'),
          stick: T.rect('#tcMove'), btns: T.rect('#tcBtns') };
      });
      assert.equal(r.gate, 'none', 'o aviso continuou na tela depois de JOGAR ASSIM');
      assert.equal(r.portraitok, true, 'falta a classe que faz a escolha vencer a media query');
      assert.equal(r.pausado, false, 'liberou o retrato e não deixou retomar');
      assert.equal(r.alvos.mira, 'tcLook',
        `a área de mira não recebe o dedo (achei ${r.alvos.mira})`);
      assert.equal(r.alvos.stick, 'tcMove', `o analógico não recebe o dedo (achei ${r.alvos.stick})`);
      assert.equal(r.alvos.fire, 'tcBtn', `o gatilho não recebe o dedo (achei ${r.alvos.fire})`);
      assert.ok(r.andou > 3, `o jogador só andou ${r.andou} m em retrato liberado`);
      assert.equal(overlapArea(r.stick, r.btns), 0,
        'em retrato o cluster de botões cobre o analógico');
    });

    it('dado o retrato liberado, então nenhum erro de página apareceu', () => {
      assert.deepEqual(h.pageErrors, [], `erros de página: ${h.pageErrors.join(' | ')}`);
    });
  });

/* ================================================================
   BATTLE ROYALE NO CELULAR — o chat só abria com Enter, e no celular
   não existe tecla Enter até o campo estar aberto. Partida BR de
   verdade porque o listener do chat vive em br-game.js, que só é
   carregado numa partida.
   ================================================================ */
describe('Controles de toque — chat do BR no celular',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h, bot;
    before(async () => {
      h = await bootGame({ port: PORT_BR, query: '?mobile=1', viewport: PHONE_VIEWPORT });
      await h.play(installPointerHelpers);
      bot = await startBRMatch(h);
    });
    after(async () => {
      if (bot) bot.close();
      if (h) await h.close();
    });

    it('dado o botão de chat numa partida BR, então o chat ABRE e FECHA enviando', async () => {
      const r = await h.play(() => {
        const QA = window.QA, T = window.TQA;
        const S = window.__BR_debug.S;
        QA.tick(2);
        const antes = !!S.chatOpen;
        T.tap('.tcBtn[data-act="chat"]', 1);
        const abriu = !!S.chatOpen;
        const campo = document.getElementById('brChatInput');
        const visivel = campo ? getComputedStyle(campo).display !== 'none' : false;
        if (campo) campo.value = 'oi';
        T.tap('.tcBtn[data-act="chat"]', 1);
        const fechou = !S.chatOpen;
        return { antes, abriu, visivel, fechou, fase: S.phase };
      });
      assert.equal(r.antes, false, 'cenário inválido: chat já estava aberto');
      assert.equal(r.abriu, true, 'o botão de chat não abriu o chat do BR');
      assert.equal(r.visivel, true, 'chat aberto e o campo de texto continuou escondido');
      assert.equal(r.fechou, true, 'o segundo toque não fechou/enviou');
    });

    /* C4 (laudo 7515734, REGRESSÃO): o chat aberto no celular dizia "Enter
       envia · Esc fecha" — o celular não tem Esc, e quem envia e fecha é o
       próprio 💬. O texto é lido do CAMPO FOCADO, que é o que o jogador vê. */
    it('C4: dado o chat aberto no celular, então o texto de ajuda cita o botão, não tecla', async () => {
      const r = await h.play(() => {
        const S = window.__BR_debug.S, T = window.TQA;
        window.QA.tick(2);
        T.tap('.tcBtn[data-act="chat"]', 131);
        const campo = document.getElementById('brChatInput');
        const out = { aberto: !!S.chatOpen, foco: document.activeElement === campo, ajuda: campo.placeholder };
        campo.value = '';
        T.tap('.tcBtn[data-act="chat"]', 131);
        out.fechou = !S.chatOpen;
        return out;
      });
      assert.equal(r.aberto && r.foco, true, 'cenário inválido: o chat não abriu com o campo focado');
      assert.ok(!/\b(enter|esc|escape)\b|clique|mouse|\[[A-Z]+\]/i.test(r.ajuda),
        `o chat do celular cita tecla que o aparelho não tem: "${r.ajuda}"`);
      assert.ok(/💬/.test(r.ajuda), `o texto de ajuda não aponta o botão que envia: "${r.ajuda}"`);
      assert.equal(r.fechou, true);
    });

    /* O BR tinha a MESMA promessa de tecla ausente que o interact.js já
       consertou: "[ESPAÇO] pra pular" na nave, "WASD pra planar" no
       paraquedas e a lista de controles do lobby toda em teclado. */
    it('dado o BR no celular, então nave, queda e lobby citam BOTÕES, não teclas', async () => {
      const r = await h.play(() => {
        const QA = window.QA, S = window.__BR_debug.S;
        const box = document.getElementById('brHint');
        const fase = S.phase;
        const dicas = [];
        try {
          S.phase = 'SHIP';
          QA.tick(3);
          dicas.push(box ? box.textContent : '(sem #brHint)');
        } finally {
          S.phase = fase;
        }
        const vis = sel => {
          const el = document.querySelector(sel);
          return el ? getComputedStyle(el).display : '(ausente)';
        };
        return { dicas, toque: vis('.brKeysToque'), desk: vis('.brKeysDesk'),
          textoToque: (document.querySelector('.brKeysToque') || {}).textContent || '' };
      });
      for (const d of r.dicas) {
        assert.ok(!/\[ESPAÇO\]|WASD/.test(d), `dica do BR anuncia tecla no celular: "${d}"`);
        assert.ok(/⇧/.test(d), `dica da nave não cita o botão de pular: "${d}"`);
      }
      assert.notEqual(r.toque, 'none', 'lista de controles de TOQUE escondida no celular');
      assert.equal(r.desk, 'none', 'lista de TECLADO aparece no lobby do celular');
      assert.ok(!/WASD|SHIFT|ENTER/.test(r.textoToque), `lista de toque cita tecla: "${r.textoToque}"`);
    });
  });

describe('Controles de toque — desktop não muda', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootGame({ port: PORT_DESKTOP }); });
  after(async () => { if (h) await h.close(); });

  /* ARMADILHA JÁ VIVIDA: numa rodada anterior o caminho `!enabled` devolvia
     closures que liam consts declaradas DEPOIS do return antecipado — o
     primeiro `setPaused` do desktop estourava com "Cannot access 'html'
     before initialization" e o jogo nem bootava. Este teste chama toda a API
     do objeto inerte de propósito. */
  it('dado o objeto inerte do desktop, então TODA a API é no-op e não lança', async () => {
    const r = await h.play(() => {
      const T = window.QA.G.Touch;
      const antes = document.documentElement.className;
      const erros = [];
      for (const [nome, fn] of [
        ['setPlaying(true)', () => T.setPlaying(true)],
        ['setPlaying(false)', () => T.setPlaying(false)],
        ['releaseAll', () => T.releaseAll()],
        ['frame(true)', () => T.frame(true)],
        ['frame(false)', () => T.frame(false)],
        ['getMove', () => T.getMove()],
        ['takeLook', () => T.takeLook()],
      ]) {
        try { fn(); } catch (e) { erros.push(`${nome}: ${e.message}`); }
      }
      return { erros, classeIgual: document.documentElement.className === antes,
        classes: document.documentElement.className };
    });
    assert.deepEqual(r.erros, [], `API inerte lançou: ${r.erros.join(' | ')}`);
    assert.equal(r.classeIgual, true, `o objeto inerte mexeu no <html>: "${r.classes}"`);
  });

  it('dado um desktop, então NÃO existe camada de toque nem classe `mobile`', async () => {
    const r = await h.play(() => {
      const G = window.QA.G;
      const ui = document.getElementById('touchUI');
      return {
        isMobile: G.isMobile,
        touchEnabled: G.Touch.enabled,
        el: G.Touch.el,
        classeMobile: document.documentElement.classList.contains('mobile'),
        touchUIDisplay: ui ? getComputedStyle(ui).display : 'ausente',
        move: G.Touch.getMove(),
        look: G.Touch.takeLook(),
      };
    });
    assert.equal(r.isMobile, false, 'desktop detectado como celular');
    assert.equal(r.touchEnabled, false, 'camada de toque instalou no desktop');
    assert.equal(r.el, null, 'o módulo mexeu no DOM no desktop');
    assert.equal(r.classeMobile, false, 'classe `mobile` vazou pro desktop');
    assert.equal(r.touchUIDisplay, 'none', '#touchUI visível no desktop');
    // canal analógico NEUTRO: é o `active` false que mantém playerUpdate idêntico
    assert.deepEqual(r.move, { x: 0, y: 0, mag: 0, active: false });
    assert.deepEqual(r.look, { dx: 0, dy: 0 });
  });

  it('dado o desktop, então o aviso de orientação é inerte (nem numa janela em pé)', async () => {
    const r = await h.play(() => {
      const G = window.QA.G;
      const gate = document.getElementById('rotateGate');
      const play = document.getElementById('rgPlay');
      const classes = document.documentElement.className;
      G.Orient.allowPortrait();       // API inerte: não pode escrever nada
      G.Orient.revokePortrait();
      return {
        habilitado: G.Orient.enabled,
        bloqueando: G.Orient.blocking(),
        gate: gate ? getComputedStyle(gate).display : 'ausente',
        botao: play ? getComputedStyle(play).display : 'ausente',
        classesIguais: document.documentElement.className === classes,
        classes: document.documentElement.className,
      };
    });
    assert.equal(r.habilitado, false, 'portão de orientação instalou no desktop');
    assert.equal(r.bloqueando, false, 'desktop bloqueado por orientação');
    assert.equal(r.gate, 'none', '#rotateGate visível no desktop');
    assert.equal(r.botao, 'none', '#rgPlay visível no desktop');
    assert.equal(r.classesIguais, true, `o portão inerte mexeu no <html>: "${r.classes}"`);
    assert.ok(!/portraitok|rgstuck|\bbr\b|mobile|\barmas\b|fireL/.test(r.classes),
      `classe do modo celular vazou pro desktop: "${r.classes}"`);
  });

  it('dado o desktop, então o HUD continua falando de TECLAS', async () => {
    const r = await h.play(() => {
      const QA = window.QA, G = QA.G;
      QA.reset();
      QA.tick(4);
      G.Interact.renderInv();
      G.teleportToCar();
      QA.tick(4);
      return {
        inv: document.getElementById('invList').textContent,
        h3: document.querySelector('#invPanel h3').textContent,
        prompt: document.getElementById('prompt').innerHTML,
        speedo: document.querySelector('#speedo small').textContent,
        slots: getComputedStyle(document.getElementById('slots')).display,
      };
    });
    assert.ok(/\[F\] comer/.test(r.inv), `desktop perdeu o "[F] comer": "${r.inv}"`);
    assert.ok(/\[T\]/.test(r.inv), `desktop perdeu o "[T] troca mira": "${r.inv}"`);
    assert.ok(/\[Q\]/.test(r.inv) && /\[G\]/.test(r.inv), `desktop perdeu [Q]/[G]: "${r.inv}"`);
    assert.ok(/\[TAB\]/.test(r.h3), `desktop perdeu o "[TAB]" do inventário: "${r.h3}"`);
    assert.ok(/<b>E<\/b>/.test(r.prompt), `desktop perdeu o "E" do prompt: "${r.prompt}"`);
    assert.ok(/E PARA SAIR/.test(r.speedo), `desktop perdeu a dica de tecla: "${r.speedo}"`);
    assert.equal(r.slots, 'flex', 'os slots de arma sumiram do desktop');
  });

  it('dado o desktop, então o teclado anda igual e a câmera não deriva sozinha', async () => {
    const r = await h.play(() => {
      const QA = window.QA;
      QA.reset();
      QA.tick(2);
      const q0 = QA.MP.camera.quaternion.clone();
      QA.tick(30); // sem input: applyTouchLook não pode encostar na câmera
      const deriva = q0.angleTo(QA.MP.camera.quaternion);
      QA.reset();
      const p1 = QA.pos();
      QA.G.keys.KeyW = true;
      QA.tick(60);
      const andou = QA.fwdDelta(p1);
      QA.reset();
      const p2 = QA.pos();
      QA.G.keys.KeyW = true; QA.G.keys.ShiftLeft = true;
      QA.tick(60);
      const correu = QA.fwdDelta(p2);
      QA.reset();
      return { deriva, andou, correu };
    });
    assert.ok(r.deriva < 1e-6, `a câmera girou sozinha ${r.deriva} rad sem input`);
    assert.ok(r.andou > 4 && r.andou < 6.5, `W devia andar ~5 m/s, andou ${r.andou} m`);
    assert.ok(r.correu > r.andou + 1.5,
      `SHIFT devia correr mais (andou ${r.andou} m, correu ${r.correu} m)`);
  });
});
