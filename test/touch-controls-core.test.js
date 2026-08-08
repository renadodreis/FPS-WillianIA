/* ================================================================
   QA — NÚCLEO DOS CONTROLES DE TOQUE (js/touchcontrols.js).

   O núcleo é PURO: recebe eventos já normalizados (px relativos ao
   centro do analógico, px absolutos da área de mira) e devolve estado.
   Nada de DOM, nada de three, nada de `Math.random` (o projeto tem
   contrato de PRNG seedado — consumir o stream global desloca o mundo).

   O que este teste existe pra travar:
     1. ZONA MORTA RADIAL. Dedo tremendo apoiado no analógico não pode
        andar. Zona morta por EIXO deixaria a diagonal passar.
     2. NORMALIZAÇÃO. Na diagonal o vetor não pode passar de 1, senão o
        jogador corre mais rápido de esguelha do que pra frente.
     3. MULTI-TOQUE POR pointerId. Andar com um dedo E mirar com o outro
        AO MESMO TEMPO é o requisito central de um FPS de celular. Um
        dedo nunca controla duas coisas.
     4. `takeLook()` ZERA. É consumo por frame (mesmo padrão do
        mouse.swayX em game.js) — sem zerar, o giro acumula pra sempre.
     5. `pointercancel` SOLTA TUDO. Dedo que sai da tela sem soltar =
        jogador andando e atirando pra sempre.
     6. ENTRADA LIXO não lança. Uma exceção no handler de ponteiro mata
        o input do jogo inteiro no meio da partida.
     7. CLAMP DE PITCH em ±1.55 — o MESMO de game.js:1402. Divergir daqui
        vira câmera de cabeça pra baixo.
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let createTouchCore, clampPitch, TOUCH_ACTS, STICK_DEADZONE, STICK_RADIUS,
  PITCH_LIMIT, SPRINT_MAG, LOOK_RAD_PER_CSS_PX, createOrientationGate;
before(async () => {
  ({ createTouchCore, clampPitch, TOUCH_ACTS, STICK_DEADZONE, STICK_RADIUS,
    PITCH_LIMIT, SPRINT_MAG, LOOK_RAD_PER_CSS_PX,
    createOrientationGate } = await import('../js/touchcontrols.js'));
});

describe('núcleo dos controles de toque — analógico', () => {
  it('dado um toque no centro, então o movimento é zero', () => {
    const c = createTouchCore();
    assert.equal(c.onStickStart(1, 0, 0), true);
    const m = c.getMove();
    assert.equal(m.mag, 0);
    assert.equal(m.x, 0);
    assert.equal(m.y, 0);
    assert.equal(m.active, true); // dedo NO analógico, só não pediu direção
  });

  it('dado um desvio dentro da zona morta, então o movimento continua zero', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    const dentro = STICK_RADIUS * STICK_DEADZONE * 0.8;
    c.onStickMove(1, dentro, -dentro * 0.2);
    const m = c.getMove();
    assert.equal(m.mag, 0, 'tremor de dedo dentro da zona morta virou movimento');
  });

  it('dada uma zona morta RADIAL, então a diagonal que passa do RAIO anda', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    // cada eixo sozinho fica DENTRO da zona morta, mas o raio combinado
    // passa: zona morta quadrada (por eixo) prenderia o jogador aqui
    const eixo = STICK_RADIUS * STICK_DEADZONE * 0.8;
    const raio = Math.hypot(eixo, eixo) / STICK_RADIUS;
    assert.ok(eixo / STICK_RADIUS < STICK_DEADZONE && raio > STICK_DEADZONE,
      'cenário inválido: os eixos precisam estar dentro e o raio fora');
    c.onStickMove(1, eixo, -eixo);
    const m = c.getMove();
    assert.ok(m.mag > 0, 'zona morta quadrada (por eixo) em vez de radial');
    assert.ok(m.mag < 0.2, 'movimento colado na zona morta devia sair pequeno');
    assert.ok(Math.abs(m.x - m.y) < 1e-9, 'diagonal perdeu a simetria');
  });

  it('dado o analógico no talo pra frente, então y=1 e mag=1', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    c.onStickMove(1, 0, -STICK_RADIUS * 2); // tela: y cresce pra BAIXO
    const m = c.getMove();
    assert.ok(Math.abs(m.y - 1) < 1e-6, `frente devia ser +1, veio ${m.y}`);
    assert.ok(Math.abs(m.x) < 1e-6);
    assert.ok(Math.abs(m.mag - 1) < 1e-6);
  });

  it('dado o analógico pra trás e pra direita, então os sinais batem com S e D', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    c.onStickMove(1, STICK_RADIUS, STICK_RADIUS); // direita + baixo
    const m = c.getMove();
    assert.ok(m.x > 0, 'direita devia ser x positivo (D)');
    assert.ok(m.y < 0, 'baixo devia ser y negativo (S)');
  });

  it('dada a diagonal no talo, então mag nunca passa de 1', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    for (const [x, y] of [[999, 999], [-999, 999], [STICK_RADIUS, -STICK_RADIUS]]) {
      c.onStickMove(1, x, y);
      const m = c.getMove();
      assert.ok(m.mag <= 1 + 1e-9, `mag=${m.mag} passou de 1 na diagonal`);
      assert.ok(Math.hypot(m.x, m.y) <= 1 + 1e-9,
        `vetor ${m.x},${m.y} passou do círculo unitário`);
      assert.ok(Math.abs(Math.hypot(m.x, m.y) - m.mag) < 1e-9, 'mag != módulo do vetor');
    }
  });

  it('dado o analógico quase no talo, então passa do limiar de corrida', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    c.onStickMove(1, 0, -STICK_RADIUS);
    assert.ok(c.getMove().mag > SPRINT_MAG, 'talo não corre');
    c.onStickMove(1, 0, -STICK_RADIUS * 0.5);
    assert.ok(c.getMove().mag < SPRINT_MAG, 'meio caminho já corre');
  });

  it('dado o fim do toque, então o movimento volta a zero e inativo', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    c.onStickMove(1, 0, -999);
    c.onStickEnd(1);
    const m = c.getMove();
    assert.equal(m.active, false);
    assert.equal(m.mag, 0);
    assert.equal(m.x, 0);
    assert.equal(m.y, 0);
  });

  it('dado um segundo dedo no analógico, então o primeiro continua no comando', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    c.onStickMove(1, 0, -STICK_RADIUS);
    assert.equal(c.onStickStart(2, 0, 0), false, 'segundo dedo roubou o analógico');
    assert.equal(c.onStickMove(2, STICK_RADIUS, 0), false);
    const m = c.getMove();
    assert.ok(m.y > 0.9, 'o dedo intruso apagou a direção do dono');
  });

  it('dado o mesmo objeto de leitura, então getMove não aloca por chamada', () => {
    const c = createTouchCore();
    assert.equal(c.getMove(), c.getMove(), 'getMove alocou objeto novo (caminho quente a 60 FPS)');
  });
});

describe('núcleo dos controles de toque — olhar', () => {
  it('dado um arrasto, então o delta acumulado é a soma dos passos', () => {
    const c = createTouchCore();
    assert.equal(c.onLookStart(5, 100, 200), true);
    c.onLookMove(5, 130, 190);
    c.onLookMove(5, 140, 190);
    const l = c.takeLook();
    assert.equal(l.dx, 40);
    assert.equal(l.dy, -10);
  });

  it('dado takeLook, então o acumulador zera (consumo por frame)', () => {
    const c = createTouchCore();
    c.onLookStart(5, 0, 0);
    c.onLookMove(5, 10, 10);
    assert.equal(c.takeLook().dx, 10);
    const l = c.takeLook();
    assert.equal(l.dx, 0);
    assert.equal(l.dy, 0);
  });

  it('dado o começo do toque, então não existe salto de delta', () => {
    const c = createTouchCore();
    c.onLookStart(5, 500, 400); // encostar o dedo NÃO gira a câmera
    const l = c.takeLook();
    assert.equal(l.dx, 0);
    assert.equal(l.dy, 0);
  });

  it('dado um dedo novo depois de soltar, então o delta parte do novo ponto', () => {
    const c = createTouchCore();
    c.onLookStart(5, 0, 0);
    c.onLookMove(5, 20, 0);
    c.takeLook();
    c.onLookEnd(5);
    c.onLookStart(6, 700, 300); // dedo do outro lado da tela: sem giro instantâneo
    const l = c.takeLook();
    assert.equal(l.dx, 0);
    assert.equal(l.dy, 0);
    c.onLookMove(6, 705, 300);
    assert.equal(c.takeLook().dx, 5);
  });

  it('dado o mesmo objeto de leitura, então takeLook não aloca por chamada', () => {
    const c = createTouchCore();
    assert.equal(c.takeLook(), c.takeLook(), 'takeLook alocou objeto novo');
  });
});

describe('núcleo dos controles de toque — multi-toque', () => {
  it('dados dois dedos, então andar e mirar funcionam AO MESMO TEMPO', () => {
    const c = createTouchCore();
    assert.equal(c.onStickStart(1, 0, 0), true);
    assert.equal(c.onLookStart(2, 400, 200), true);
    c.onStickMove(1, 0, -STICK_RADIUS);
    c.onLookMove(2, 460, 220);
    const m = c.getMove(), l = c.takeLook();
    assert.ok(m.y > 0.9, 'o dedo da mira matou o movimento');
    assert.equal(l.dx, 60);
    assert.equal(l.dy, 20);
    // e o movimento sobrevive ao consumo do olhar
    assert.ok(c.getMove().y > 0.9);
  });

  it('dado um dedo que já é dono do analógico, então ele não vira mira nem botão', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    assert.equal(c.onLookStart(1, 10, 10), false, 'um dedo virou dono de duas funções');
    assert.equal(c.press('fire', 1), false);
    assert.equal(c.pressed('fire'), false);
    assert.equal(c.lookActive(), false);
  });

  it('dado o dono de um botão, então ele não rouba o analógico', () => {
    const c = createTouchCore();
    assert.equal(c.press('fire', 9), true);
    assert.equal(c.onStickStart(9, 0, 0), false);
    assert.equal(c.getMove().active, false);
  });

  it('dado um pointerId, então o núcleo sabe qual função ele controla', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    c.onLookStart(2, 0, 0);
    c.press('jump', 3);
    assert.equal(c.roleOf(1), 'stick');
    assert.equal(c.roleOf(2), 'look');
    assert.equal(c.roleOf(3), 'jump');
    assert.equal(c.roleOf(99), null);
  });
});

describe('núcleo dos controles de toque — botões', () => {
  it('dado cada data-act do contrato, então press/release funcionam', () => {
    /* `eat`/`sight`/`chat` entraram porque as ações KeyF (comer carne), KeyT
       (trocar acessório de mira) e Enter (chat do BR) não tinham NENHUM
       caminho de toque: no celular a carne entrava no inventário e nunca
       saía. */
    const esperados = ['fire', 'ads', 'jump', 'crouch', 'reload', 'nade', 'use', 'med',
      'swap', 'inv', 'pause', 'eat', 'sight', 'chat'];
    assert.deepEqual([...TOUCH_ACTS].sort(), [...esperados].sort());
    for (const act of esperados) {
      const c = createTouchCore();
      assert.equal(c.pressed(act), false, `${act} nasceu pressionado`);
      assert.equal(c.press(act, 1), true, `${act} não aceitou press`);
      assert.equal(c.pressed(act), true, `${act} não registrou press`);
      assert.equal(c.release(act), true, `${act} não aceitou release`);
      assert.equal(c.pressed(act), false, `${act} ficou preso`);
      assert.equal(c.release(act), false, 'release em botão solto devia ser no-op');
    }
  });

  it('dado um act desconhecido, então recusa sem lançar', () => {
    const c = createTouchCore();
    for (const lixo of ['voar', '', null, undefined, 0, {}, 'constructor', '__proto__']) {
      assert.equal(c.press(lixo, 1), false, `aceitou act inválido ${String(lixo)}`);
      assert.equal(c.pressed(lixo), false);
      assert.equal(c.release(lixo), false);
    }
  });

  it('dado o mesmo botão em dois dedos, então o segundo é ignorado', () => {
    const c = createTouchCore();
    c.press('fire', 1);
    assert.equal(c.press('fire', 2), false);
    // soltar o dedo intruso não pode desarmar o botão do dono
    assert.equal(c.releasePointer(2), null);
    assert.equal(c.pressed('fire'), true);
    assert.equal(c.releasePointer(1), 'fire');
    assert.equal(c.pressed('fire'), false);
  });
});

describe('núcleo dos controles de toque — perda de ponteiro', () => {
  it('dado pointercancel no analógico, então o movimento zera', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    c.onStickMove(1, 0, -999);
    assert.equal(c.releasePointer(1), 'stick');
    assert.equal(c.getMove().mag, 0);
    assert.equal(c.getMove().active, false);
  });

  it('dado pointercancel na mira, então o olhar para de acumular', () => {
    const c = createTouchCore();
    c.onLookStart(2, 0, 0);
    assert.equal(c.releasePointer(2), 'look');
    assert.equal(c.onLookMove(2, 500, 500), false);
    assert.equal(c.takeLook().dx, 0);
  });

  it('dado releaseAll, então analógico, olhar e TODOS os botões soltam', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    c.onStickMove(1, 0, -999);
    c.onLookStart(2, 0, 0);
    c.onLookMove(2, 50, 50);
    c.press('fire', 3);
    c.press('crouch', 4);
    c.releaseAll();
    assert.equal(c.getMove().mag, 0);
    assert.equal(c.getMove().active, false);
    assert.equal(c.lookActive(), false);
    for (const act of TOUCH_ACTS) assert.equal(c.pressed(act), false, `${act} ficou preso`);
    assert.equal(c.roleOf(1), null);
    assert.equal(c.roleOf(3), null);
    // e o acumulador do olhar não pode "vazar" depois do cancelamento
    assert.equal(c.takeLook().dx, 0);
  });

  it('dado o mesmo pointerId reaproveitado depois do cancelamento, então volta a funcionar', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    c.releaseAll();
    assert.equal(c.onStickStart(1, 0, 0), true);
  });
});

describe('núcleo dos controles de toque — entrada lixo', () => {
  it('dadas coordenadas NaN/undefined, então nada lança e o estado fica são', () => {
    const c = createTouchCore();
    c.onStickStart(1, NaN, undefined);
    c.onStickMove(1, NaN, Infinity);
    let m = c.getMove();
    assert.equal(Number.isFinite(m.x), true);
    assert.equal(Number.isFinite(m.y), true);
    assert.equal(Number.isFinite(m.mag), true);
    assert.equal(m.mag, 0);
    c.onStickMove(1, '58', null);
    m = c.getMove();
    assert.equal(Number.isFinite(m.mag), true);
    c.onLookStart(2, undefined, NaN);
    c.onLookMove(2, NaN, '30');
    const l = c.takeLook();
    assert.equal(Number.isFinite(l.dx), true);
    assert.equal(Number.isFinite(l.dy), true);
  });

  it('dadas opções lixo, então o núcleo nasce com os padrões', () => {
    for (const lixo of [undefined, null, 'x', 42, { deadzone: NaN, radius: 0 }]) {
      const c = createTouchCore(lixo);
      c.onStickStart(1, 0, 0);
      c.onStickMove(1, 0, -999);
      const m = c.getMove();
      assert.ok(Math.abs(m.y - 1) < 1e-6, `opções ${JSON.stringify(lixo)} quebraram o analógico`);
    }
  });

  it('dados eventos fora de ordem, então nada lança', () => {
    const c = createTouchCore();
    assert.equal(c.onStickMove(7, 10, 10), false); // move sem start
    assert.equal(c.onStickEnd(7), false);
    assert.equal(c.onLookMove(7, 10, 10), false);
    assert.equal(c.onLookEnd(7), false);
    assert.equal(c.releasePointer(7), null);
    assert.equal(c.getMove().mag, 0);
    assert.equal(c.takeLook().dx, 0);
  });
});

describe('núcleo dos controles de toque — constantes de câmera', () => {
  it('dado o clamp de pitch, então é o MESMO de game.js (±1.55)', () => {
    assert.equal(PITCH_LIMIT, 1.55);
    assert.equal(clampPitch(2), 1.55);
    assert.equal(clampPitch(-2), -1.55);
    assert.equal(clampPitch(1.55), 1.55);
    assert.equal(clampPitch(0.3), 0.3);
    assert.equal(clampPitch(NaN), 0);
    assert.equal(clampPitch(undefined), 0);
    assert.equal(clampPitch(-Infinity), -1.55);
  });

  it('dada a sensibilidade base, então é radianos por px de CSS num intervalo sensato', () => {
    // um arrasto de 1000 px (paisagem de celular inteira) tem que virar
    // pelo menos meia volta e no máximo uma volta e meia
    assert.ok(LOOK_RAD_PER_CSS_PX * 1000 > Math.PI * 0.5,
      'sensibilidade baixa demais: a tela toda não vira meia volta');
    assert.ok(LOOK_RAD_PER_CSS_PX * 1000 < Math.PI * 3,
      'sensibilidade alta demais: a tela toda passa de uma volta e meia');
  });
});

/* ================================================================
   AVISO DE ORIENTAÇÃO (#rotateGate)

   Testado com janela/documento FALSOS de propósito: o cenário que
   importa é "screen.orientation.lock rejeita" (iOS Safari não
   implementa, e nenhum navegador trava sem fullscreen). Num Chrome de
   verdade esse resultado depende do ambiente; aqui é determinístico.

   O que está sendo travado:
     1. Bloqueio de rotação do SISTEMA ligado em retrato: o aparelho
        deitado continua reportando retrato, a media query continua
        casando e "deite o aparelho" vira instrução impossível. Sem
        saída, é 0% do jogo acessível.
     2. Girar no meio da partida cobre a tela (z 400) sem pausar nada:
        alvo parado que não anda, não atira e não alcança o botão de
        pausa.
   ================================================================ */
function fakeGateEnv(opts) {
  const o = opts || {};
  const state = { portrait: o.portrait !== false, fullscreenCalls: 0, lockCalls: [] };
  const classes = new Set();
  const winL = new Map();     // tipo -> [fn]
  const mqL = [];
  const btnL = [];
  const on = (map, type, fn) => { if (!map.has(type)) map.set(type, []); map.get(type).push(fn); };
  const html = {
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      contains: c => classes.has(c),
      toggle: (c, v) => (v ? classes.add(c) : classes.delete(c)),
    },
    requestFullscreen() {
      state.fullscreenCalls++;
      return o.fullscreenOk ? Promise.resolve() : Promise.reject(new Error('sem gesto'));
    },
  };
  const btn = { addEventListener: (t, fn) => { if (t === 'click') btnL.push(fn); } };
  const doc = {
    documentElement: html,
    fullscreenElement: null,
    getElementById: id => (id === 'rgPlay' ? btn : null),
    addEventListener: () => {},
  };
  const win = {
    document: doc,
    get innerWidth() { return state.portrait ? 390 : 844; },
    get innerHeight() { return state.portrait ? 844 : 390; },
    matchMedia: q => ({
      media: q,
      get matches() { return state.portrait; },
      addEventListener: (t, fn) => { if (t === 'change') mqL.push(fn); },
    }),
    screen: o.noOrientationApi ? {} : {
      orientation: {
        lock: (m) => {
          state.lockCalls.push(m);
          return o.lockOk ? Promise.resolve() : Promise.reject(new Error('não suportado'));
        },
      },
    },
    addEventListener: (t, fn) => on(winL, t, fn),
  };
  return {
    win, doc, state, classes,
    /* gira o "aparelho" e dispara os MESMOS eventos do navegador */
    rotate(toPortrait) {
      state.portrait = toPortrait;
      for (const fn of mqL) fn({ matches: toPortrait });
      for (const fn of winL.get('orientationchange') || []) fn();
      for (const fn of winL.get('resize') || []) fn();
    },
    tapPlay() { for (const fn of btnL) fn(); },
    temBotao: () => btnL.length > 0,
  };
}
const settle = () => new Promise(r => setTimeout(r, 0));

describe('aviso de orientação — saída quando girar não resolve', () => {
  it('dado o desktop, então o portão é inerte e não escreve classe nenhuma', () => {
    const env = fakeGateEnv({ portrait: true });
    const g = createOrientationGate({ isMobile: false, win: env.win, doc: env.doc });
    assert.equal(g.enabled, false);
    assert.equal(g.blocking(), false, 'desktop nunca é bloqueado por orientação');
    g.allowPortrait();
    assert.equal(env.classes.size, 0, `o portão inerte mexeu no <html>: ${[...env.classes]}`);
  });

  it('dado retrato com travamento REJEITADO, então o botão de escape é oferecido', async () => {
    const env = fakeGateEnv({ portrait: true, lockOk: false });
    const g = createOrientationGate({ isMobile: true, win: env.win, doc: env.doc });
    assert.equal(g.blocking(), true, 'retrato no celular tinha que bloquear');
    await settle();
    assert.equal(env.classes.has('rgstuck'), true,
      'travamento rejeitado e o aviso não ofereceu saída — jogador preso fora do jogo');
  });

  it('dado o toque em JOGAR ASSIM, então o retrato é liberado NA HORA (sem esperar promessa)', async () => {
    const env = fakeGateEnv({ portrait: true, lockOk: false });
    const g = createOrientationGate({ isMobile: true, win: env.win, doc: env.doc });
    assert.equal(env.temBotao(), true, 'o portão não ligou o botão #rgPlay');
    env.tapPlay();
    // SÍNCRONO: o escape do jogador não pode depender de promessa nenhuma
    assert.equal(g.blocking(), false, 'o toque não liberou o jogo imediatamente');
    assert.equal(env.classes.has('portraitok'), true, 'falta a classe que vence a media query');
    await settle();
    assert.equal(g.blocking(), false, 'a promessa rejeitada retomou o bloqueio');
    assert.ok(env.state.fullscreenCalls > 0, 'o gesto não tentou fullscreen antes de desistir');
    // uma tentativa no boot (sem gesto, só pra revelar o botão) + a do gesto
    assert.ok(env.state.lockCalls.length >= 1, 'nunca tentou travar a orientação');
    assert.ok(env.state.lockCalls.every(m => m === 'landscape'),
      `travou numa orientação errada: ${env.state.lockCalls.join(',')}`);
  });

  it('dado que o travamento FUNCIONOU e a tela virou, então o aviso volta a ficar armado', async () => {
    const env = fakeGateEnv({ portrait: true, lockOk: true, fullscreenOk: true });
    createOrientationGate({ isMobile: true, win: env.win, doc: env.doc });
    env.tapPlay();
    env.state.portrait = false;   // o lock girou a tela de verdade
    await settle();
    assert.equal(env.classes.has('portraitok'), false,
      'travou em paisagem e mesmo assim marcou "jogar em retrato" pra sempre');
  });

  it('dado que não existe screen.orientation, então oferece a saída sem lançar', async () => {
    const env = fakeGateEnv({ portrait: true, noOrientationApi: true });
    const g = createOrientationGate({ isMobile: true, win: env.win, doc: env.doc });
    await settle();
    assert.equal(env.classes.has('rgstuck'), true, 'sem API de orientação e sem saída');
    env.tapPlay();
    assert.equal(g.blocking(), false);
  });

  it('dado que a tela GIRA pra retrato em partida, então avisa quem tem que pausar', async () => {
    const env = fakeGateEnv({ portrait: false });
    const avisos = [];
    const g = createOrientationGate({ isMobile: true, win: env.win, doc: env.doc,
      onBlock: () => avisos.push('pausa') });
    assert.equal(g.blocking(), false, 'paisagem nasceu bloqueada');
    assert.deepEqual(avisos, [], 'avisou pausa em paisagem');
    env.rotate(true);
    assert.deepEqual(avisos, ['pausa'], 'girar pra retrato não pediu pausa');
    // sair do retrato NÃO retoma sozinho (quem retoma é o jogador, tocando)
    env.rotate(false);
    assert.deepEqual(avisos, ['pausa'], 'voltar pra paisagem disparou aviso indevido');
    // e voltando pro retrato pausa de novo
    env.rotate(true);
    assert.deepEqual(avisos, ['pausa', 'pausa'], 'segunda virada não pediu pausa');
  });

  it('dado o retrato JÁ liberado pelo jogador, então girar não pausa mais', () => {
    const env = fakeGateEnv({ portrait: false });
    const avisos = [];
    const g = createOrientationGate({ isMobile: true, win: env.win, doc: env.doc,
      onBlock: () => avisos.push('pausa') });
    g.allowPortrait();
    env.rotate(true);
    assert.deepEqual(avisos, [], 'quem escolheu jogar em retrato foi pausado assim mesmo');
    assert.equal(g.blocking(), false);
  });

  it('dado um ambiente sem matchMedia, então cai na razão de aspecto sem lançar', () => {
    const env = fakeGateEnv({ portrait: true });
    delete env.win.matchMedia;
    const g = createOrientationGate({ isMobile: true, win: env.win, doc: env.doc });
    assert.equal(g.blocking(), true, 'sem matchMedia devia medir innerWidth/innerHeight');
  });
});
