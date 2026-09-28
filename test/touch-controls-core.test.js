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

/* ================================================================
   ANDAR PELO ANALÓGICO = ANDAR PELO TECLADO NO TOPO DA FAIXA.
   Medido pelo caminho real (toque do DevTools, Galaxy S22 780×360): o
   vetor de andar valia a própria deflexão, e a faixa de andar acaba no
   limiar de corrida (era 0,85) — o dedo nunca passava de 0,85 × 5,2 = 4,42 m/s
   andando, 85 % do W do teclado, e saltava para 8,6 correndo. Meio curso
   dava 2,24 m/s. Quem joga no toque andava 15 % mais devagar que quem
   joga no teclado na MESMA partida.
   ================================================================ */
describe('núcleo dos controles de toque — andar (paridade com o teclado)', () => {
  const polegar = (c, frac, ang = 0) => {
    const r = STICK_RADIUS * frac, a = ang * Math.PI / 180;
    c.onStickMove(1, Math.sin(a) * r, -Math.cos(a) * r);
    return c.getMove();
  };
  it('dado o dedo logo antes do limiar de corrida, então o vetor de andar é o do teclado (módulo 1) e ainda não corre', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    /* deflexão pós-zona-morta logo abaixo do limiar: m = (f − 0,12)/0,88 */
    const f = (SPRINT_MAG - 0.001) * (1 - STICK_DEADZONE) + STICK_DEADZONE;
    const m = polegar(c, f);
    assert.ok(m.mag < SPRINT_MAG, `cenário inválido: já corre (mag ${m.mag})`);
    const modulo = Math.hypot(m.x, m.y);
    assert.ok(modulo > 0.998, `no topo da faixa de andar o vetor vale ${modulo.toFixed(4)} — o teclado anda 1`);
  });
  it('dada a faixa de andar, então a velocidade cresce sempre, com ≥ 5 patamares, e a zona morta segue 0,12', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    const mods = [];
    const fLimiar = SPRINT_MAG * (1 - STICK_DEADZONE) + STICK_DEADZONE;
    for (let f = 0; f <= fLimiar; f += 0.004) mods.push(Math.hypot(polegar(c, f).x, polegar(c, f).y));
    for (let i = 1; i < mods.length; i++)
      assert.ok(mods[i] >= mods[i - 1] - 1e-12, `a velocidade caiu entre ${(i - 1) * 0.004} e ${i * 0.004} do raio`);
    const patamares = new Set(mods.filter(v => v > 0).map(v => v.toFixed(3))).size;
    assert.ok(patamares >= 5, `só ${patamares} patamares de andar`);
    /* a zona morta efetiva é a primeira deflexão que anda */
    let dzEf = null;
    for (let f = 0; f <= 0.3; f += 0.0005) { const m = polegar(c, f); if (Math.hypot(m.x, m.y) > 0) { dzEf = f; break; } }
    assert.ok(Math.abs(dzEf - STICK_DEADZONE) <= 0.005, `zona morta efetiva ${dzEf}, declarada ${STICK_DEADZONE}`);
  });
  it('dada a faixa de andar, então a DIREÇÃO é exata em 16 rumos (a curva mexe só no módulo)', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    for (let k = 0; k < 16; k++) {
      const ang = k * 22.5;
      for (const f of [0.3, 0.6, 0.85]) {
        const m = polegar(c, f, ang);
        const medido = Math.atan2(m.x, m.y) * 180 / Math.PI;
        const erro = Math.abs(((medido - ang + 540) % 360) - 180);
        assert.ok(erro < 1e-6, `rumo ${ang}° a ${f} do raio saiu a ${medido.toFixed(3)}°`);
      }
    }
  });
  it('dado o volante e o desenho do knob, então eles leem a DEFLEXÃO do dedo (px, py), não o vetor de andar', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    const f = 0.5 * (1 - STICK_DEADZONE) + STICK_DEADZONE;   // deflexão 0,5
    const m = polegar(c, f, 90);
    assert.ok(Math.abs(m.px - 0.5) < 1e-9 && Math.abs(m.py) < 1e-9, `deflexão (${m.px}, ${m.py}), esperada (0,5; 0)`);
    assert.ok(Math.abs(m.px - m.mag) < 1e-9, 'a deflexão não bate com mag');
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
    /* `fireL`: segundo ATIRAR, à esquerda (PUBG Mobile o tem por padrão; CoD
       Mobile e Critical Ops permitem) — docs/mobile/referencia-mira-toque.md
       §6 P0-1. Nasce desligado por ajuste. */
    const esperados = ['fire', 'ads', 'jump', 'crouch', 'reload', 'nade', 'use', 'med',
      'swap', 'inv', 'pause', 'eat', 'sight', 'chat', 'fireL'];
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
   O BOTÃO ATIRAR TAMBÉM GIRA A CÂMERA (referência §6 P0-1).
   Antes, o polegar direito escolhia entre mirar e atirar — nunca os dois.
   O dedo que aperta ATIRAR passa a alimentar o MESMO acumulador do olhar
   enquanto arrasta, com fator próprio (Critical Ops: "FIRE BUTTON AIM
   SENSITIVITY"; 0 desliga).
   ================================================================ */
describe('núcleo dos controles de toque — ATIRAR que mira', () => {
  it('dado o dedo no ATIRAR arrastando, então o olhar acumula o arrasto (fator 1,0)', () => {
    const c = createTouchCore();
    assert.equal(c.press('fire', 7, 100, 200), true);
    assert.equal(c.pressed('fire'), true);
    assert.equal(c.onPressMove(7, 140, 190), true);
    c.onPressMove(7, 160, 185);
    const l = c.takeLook();
    assert.equal(l.dx, 60);
    assert.equal(l.dy, -15);
    assert.equal(c.pressed('fire'), true, 'arrastar soltou o gatilho');
  });

  it('dado o fator do botão, então o arrasto sai escalado (0 desliga)', () => {
    const c = createTouchCore({ fireLook: 0.5 });
    c.press('fire', 7, 0, 0);
    c.onPressMove(7, 40, 20);
    const l = c.takeLook();
    assert.equal(l.dx, 20);
    assert.equal(l.dy, 10);
    c.setFireLook(0);
    c.onPressMove(7, 90, 20);
    assert.equal(c.takeLook().dx, 0, 'fator 0 continuou girando');
    c.setFireLook(NaN);                     // lixo cai no padrão, não em NaN
    c.onPressMove(7, 100, 20);
    assert.equal(c.takeLook().dx, 10);
  });

  it('dado o encostar do dedo no ATIRAR, então não existe salto de delta', () => {
    const c = createTouchCore();
    c.press('fire', 7, 700, 300);
    assert.equal(c.takeLook().dx, 0);
    c.onPressMove(7, 700, 300);
    assert.equal(c.takeLook().dx, 0);
  });

  it('dados o dedo do olhar E o do ATIRAR juntos, então os dois somam (e o analógico segue)', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    c.onStickMove(1, 0, -STICK_RADIUS);
    c.onLookStart(2, 500, 200);
    c.press('fire', 3, 700, 300);
    c.onLookMove(2, 530, 200);
    c.onPressMove(3, 710, 300);
    assert.equal(c.takeLook().dx, 40);
    assert.ok(c.getMove().y > 0.9, 'o dedo do tiro matou o analógico');
  });

  it('dado o segundo ATIRAR (esquerda), então ele também mira e convive com o primeiro', () => {
    const c = createTouchCore();
    assert.equal(c.press('fire', 3, 0, 0), true);
    assert.equal(c.press('fireL', 4, 0, 0), true, 'os dois gatilhos não podem se excluir');
    c.onPressMove(4, -25, 0);
    assert.equal(c.takeLook().dx, -25);
  });

  it('dado outro botão arrastado, então NÃO mira (só o gatilho gira)', () => {
    const c = createTouchCore();
    c.press('jump', 5, 0, 0);
    assert.equal(c.onPressMove(5, 80, 0), false);
    assert.equal(c.takeLook().dx, 0);
  });

  it('dado soltar e reapertar, então o delta parte do novo ponto', () => {
    const c = createTouchCore();
    c.press('fire', 7, 0, 0);
    c.onPressMove(7, 10, 0);
    c.takeLook();
    assert.equal(c.releasePointer(7), 'fire');
    assert.equal(c.onPressMove(7, 300, 0), false, 'dedo solto continuou mirando');
    c.press('fire', 8, 600, 0);
    c.onPressMove(8, 605, 0);
    assert.equal(c.takeLook().dx, 5);
  });

  it('dado releaseAll, então o arrasto do gatilho não vaza', () => {
    const c = createTouchCore();
    c.press('fire', 7, 0, 0);
    c.onPressMove(7, 50, 0);
    c.releaseAll();
    assert.equal(c.takeLook().dx, 0);
    assert.equal(c.onPressMove(7, 90, 0), false);
  });
});

/* ================================================================
   SENSIBILIDADE — razão vertical/horizontal (P1-5) e ADS pela razão das
   tangentes (P1-4). A conta esperada sai da GEOMETRIA (ângulo do arrasto e
   tangente dos FOVs), não do código sob teste.
   ================================================================ */
describe('núcleo dos controles de toque — sensibilidade', () => {
  let lookRadians, lookScale, touchConfig, TOUCH_DEFAULTS, saveTouchSetting;
  before(async () => {
    ({ lookRadians, lookScale, touchConfig, saveTouchSetting } = await import('../js/touchcontrols.js'));
    ({ TOUCH_DEFAULTS } = await import('../js/config.js'));
  });

  it('dado um arrasto DIAGONAL, então o ângulo girado é atan(razão × dy/dx) — sem torção', () => {
    const out = { yaw: 0, pitch: 0 };
    for (const [dx, dy] of [[100, -100], [100, -50], [30, -90], [-70, 40]]) {
      for (const ratio of [0.6, 0.4, 1]) {
        lookRadians(dx, dy, 0.0032, ratio, 1, out);
        const esperado = Math.atan2(Math.abs(dy) * ratio, Math.abs(dx)) * 180 / Math.PI;
        const medido = Math.atan2(Math.abs(out.pitch), Math.abs(out.yaw)) * 180 / Math.PI;
        assert.ok(Math.abs(medido - esperado) < 1e-9,
          `(${dx},${dy}) razão ${ratio}: girou a ${medido}°, a conta pede ${esperado}°`);
        // sinais: dedo pra direita vira pra direita (yaw −), dedo pra cima olha pra cima (pitch +)
        assert.equal(Math.sign(out.yaw), -Math.sign(dx));
        assert.equal(Math.sign(out.pitch), -Math.sign(dy));
        assert.ok(Math.abs(Math.abs(out.yaw) - Math.abs(dx) * 0.0032) < 1e-12, 'o eixo X perdeu escala');
      }
    }
  });

  it('dado o ADS, então a escala é tan(fovADS/2)/tan(fovBase/2) (e 1 no quadril)', () => {
    const tabela = [[62, 0.783], [55, 0.678], [48, 0.580], [36, 0.423], [26, 0.301]];
    for (const [fov, ideal] of tabela)
      assert.ok(Math.abs(lookScale(fov, 75, 1, 1) - ideal) < 0.0015, `${fov}°: ${lookScale(fov, 75, 1, 1)}`);
    assert.equal(lookScale(75, 75, 0, 1), 1);
    // correndo o FOV abre pra 85 — a base acompanha, a sensibilidade NÃO muda
    assert.ok(Math.abs(lookScale(85, 85, 0, 1) - 1) < 1e-12);
    // o ajuste de "sensibilidade na mira" multiplica só na mira
    assert.ok(Math.abs(lookScale(48, 75, 1, 1.2) - 0.580 * 1.2) < 0.002);
    assert.ok(Math.abs(lookScale(75, 75, 0, 1.2) - 1) < 1e-12, 'o ajuste de ADS vazou pro quadril');
  });

  it('dados ajustes lixo, então os padrões e os limites valem', () => {
    const d = touchConfig({});
    assert.equal(d.look, TOUCH_DEFAULTS.touchLook);
    assert.equal(d.ratioY, 0.6, 'P1-5: razão padrão 0,6 (Lyra)');
    assert.equal(d.assist, true, 'assistência nasce LIGADA no toque');
    assert.equal(d.autoFire, false, 'tiro automático nasce DESLIGADO (decisão do dono)');
    assert.equal(d.fireLeft, false);
    assert.equal(d.fireLook, 1);
    const lixo = touchConfig({ touchLook: 'abc', touchRatioY: 99, touchAds: -5, touchFireLook: null,
      touchAssist: 'talvez', touchAutoFire: 1, touchFireLeft: '1' });
    assert.equal(lixo.look, TOUCH_DEFAULTS.touchLook);
    assert.equal(lixo.ratioY, 1, 'teto da razão');
    assert.equal(lixo.ads, 0.5, 'piso do ADS');
    assert.equal(lixo.fireLook, 1);
    assert.equal(lixo.assist, true, 'lixo no liga/desliga não pode desligar a assistência');
    assert.equal(lixo.autoFire, true);
    assert.equal(lixo.fireLeft, true);
    assert.equal(touchConfig(null).look, TOUCH_DEFAULTS.touchLook);
    /* aceleração nasce 0 (linear, régua M3e) e curso nasce 100 % (58 px) */
    assert.equal(d.accel, 0, 'a aceleração do olhar tem de nascer DESLIGADA (linear)');
    assert.equal(d.stick, 1);
    const fora = touchConfig({ touchLookAccel: 7, touchStick: 0.1 });
    assert.equal(fora.accel, 1, 'teto da aceleração');
    assert.equal(fora.stick, 0.6, 'piso do curso');
    assert.equal(touchConfig({ touchLookAccel: 'x', touchStick: null }).accel, 0);
  });

  it('dado localStorage que lança (aba privada, cota cheia), então salvar não derruba nada', () => {
    const s = {};
    const ok = saveTouchSetting(s, 'touchRatioY', 0.45, () => { throw new Error('QuotaExceededError'); });
    assert.equal(ok, false);
    assert.equal(s.touchRatioY, 0.45, 'o valor vale na sessão mesmo sem persistir');
    assert.equal(saveTouchSetting(s, 'touchRatioY', 0.5, () => {}), true);
    assert.equal(saveTouchSetting(s, 'naoExiste', 1, () => {}), false, 'aceitou chave fora do contrato');
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

/* ================================================================
   TRAVA DE CORRIDA (docs/mobile/referencia-mira-toque.md §4.2/§4.3 e P2-7).
   PUBG Mobile: "drag the "Cross" icon and hold in running mode"; Warzone
   Mobile: "lock Auto Sprint to a button above the virtual stick". Arrastar o
   analógico ALÉM de um ponto acima dele trava a corrida; puxar para trás ou
   soltar o dedo destrava. O limiar NÃO tem fonte (referência §5, item 10):
   é inferência escrita no código, e o que este bloco trava é o COMPORTAMENTO
   em volta dele — correr no talo de sempre nunca trava sem querer.
   ================================================================ */
describe('núcleo dos controles de toque — trava de corrida', () => {
  let SPRINT_LOCK_R, SPRINT_LOCK_CONE;
  before(async () => {
    ({ SPRINT_LOCK_R, SPRINT_LOCK_CONE } = await import('../js/touchcontrols.js'));
  });
  const acima = f => -STICK_RADIUS * f;   // px de tela: y cresce pra BAIXO

  it('dado o limiar declarado, então ele fica ALÉM do talo e dentro do alcance do polegar', () => {
    assert.equal(typeof SPRINT_LOCK_R, 'number', 'falta a constante SPRINT_LOCK_R');
    // além do talo (1,0 R) com folga: quem corre no talo passa do raio sem querer
    assert.ok(SPRINT_LOCK_R >= 1.4, `limiar ${SPRINT_LOCK_R} R encosta no talo: trava sem querer`);
    // 2,2 R = 128 px acima do dedo: o polegar ainda alcança sem soltar o aparelho
    assert.ok(SPRINT_LOCK_R <= 2.2, `limiar ${SPRINT_LOCK_R} R longe demais do polegar`);
    assert.ok(SPRINT_LOCK_CONE > 0 && SPRINT_LOCK_CONE < 45,
      `cone de ${SPRINT_LOCK_CONE}° deixaria a diagonal de 45° travar`);
  });

  it('dado o dedo arrastado acima do limiar, então TRAVA — e a corrida fica com o dedo de volta perto do centro', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    c.onStickMove(1, 0, acima(SPRINT_LOCK_R) - 1);
    assert.equal(c.locked(), true, 'arrastou acima do limiar e não travou');
    c.onStickMove(1, 0, acima(0.25));           // polegar relaxa: 1/4 do raio
    const m = c.getMove();
    assert.equal(c.locked(), true, 'relaxar o polegar soltou a trava');
    assert.ok(m.mag > SPRINT_MAG, `travado e o módulo caiu pra ${m.mag} (não corre)`);
    assert.ok(Math.abs(m.mag - 1) < 1e-12, `travado corre CHEIO, veio ${m.mag}`);
    assert.ok(Math.abs(m.y - 1) < 1e-12 && Math.abs(m.x) < 1e-12, `direção ${m.x},${m.y} não é a frente`);
  });

  it('dado o talo de sempre (até 1,3 R de sobra), então NÃO trava: soltar o polegar volta a andar', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    c.onStickMove(1, 0, acima(1.3));
    assert.equal(c.locked(), false, 'correr no talo travou sem o jogador pedir');
    c.onStickMove(1, 0, acima(0.4));
    assert.ok(c.getMove().mag < 0.5, `sem trava, 0,4 R devia andar devagar: ${c.getMove().mag}`);
  });

  it('dado o dedo acima do limiar mas fora do cone (diagonal), então NÃO trava', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    const r = STICK_RADIUS * SPRINT_LOCK_R * 1.5;
    const a = (SPRINT_LOCK_CONE + 5) * Math.PI / 180;   // 5° fora do cone
    c.onStickMove(1, r * Math.sin(a), -r * Math.cos(a));
    assert.equal(c.locked(), false, `travou a ${SPRINT_LOCK_CONE + 5}° da vertical`);
    const b = (SPRINT_LOCK_CONE - 5) * Math.PI / 180;   // 5° dentro
    c.onStickMove(1, r * Math.sin(b), -r * Math.cos(b));
    assert.equal(c.locked(), true, `não travou a ${SPRINT_LOCK_CONE - 5}° da vertical`);
  });

  it('dada a trava, então a direção é a do dedo (sem torção) e o módulo é 1', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    c.onStickMove(1, 0, acima(SPRINT_LOCK_R + 0.1));
    c.onStickMove(1, 20, -30);                  // dedo volta pra dentro, meio de lado
    const m = c.getMove();
    const pedido = Math.atan2(20, 30) * 180 / Math.PI;
    const andado = Math.atan2(m.x, m.y) * 180 / Math.PI;
    assert.ok(Math.abs(andado - pedido) < 1e-9, `travado andou a ${andado}°, o dedo pediu ${pedido}°`);
    assert.ok(Math.abs(Math.hypot(m.x, m.y) - 1) < 1e-12);
  });

  it('dada a trava, então PUXAR PARA TRÁS destrava e o analógico volta a ser analógico', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    c.onStickMove(1, 0, acima(SPRINT_LOCK_R + 0.1));
    c.onStickMove(1, 0, STICK_RADIUS * 0.5);    // meio raio pra trás
    const m = c.getMove();
    assert.equal(c.locked(), false, 'puxar pra trás não destravou');
    assert.ok(m.y < 0, `puxou pra trás e o jogador segue indo pra frente (${m.y})`);
    // dentro da zona morta pra trás NÃO destrava: é o polegar descansando
    c.onStickMove(1, 0, acima(SPRINT_LOCK_R + 0.1));
    c.onStickMove(1, 0, STICK_RADIUS * STICK_DEADZONE * 0.5);
    assert.equal(c.locked(), true, 'o polegar descansando no centro destravou');
    assert.ok(Math.abs(c.getMove().y - 1) < 1e-12, 'polegar no centro com a trava: devia seguir em frente');
  });

  it('dada a trava, então SOLTAR o dedo destrava (e o próximo toque nasce sem trava)', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    c.onStickMove(1, 0, acima(SPRINT_LOCK_R + 0.1));
    c.onStickEnd(1);
    assert.equal(c.locked(), false, 'soltar o dedo não destravou');
    assert.equal(c.getMove().mag, 0, 'soltou e o jogador segue correndo sozinho');
    c.onStickStart(2, 0, 0);
    c.onStickMove(2, 0, acima(0.3));
    assert.equal(c.locked(), false);
    assert.ok(c.getMove().mag < 0.5);
  });

  it('dados releaseAll e pointercancel, então a trava solta junto', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    c.onStickMove(1, 0, acima(SPRINT_LOCK_R + 0.1));
    c.releaseAll();
    assert.equal(c.locked(), false, 'releaseAll deixou a corrida travada');
    c.onStickStart(3, 0, 0);
    c.onStickMove(3, 0, acima(SPRINT_LOCK_R + 0.1));
    assert.equal(c.releasePointer(3), 'stick');
    assert.equal(c.locked(), false, 'pointercancel deixou a corrida travada');
  });

  it('dado o veículo (trava desligada), então não trava e a que existia solta na hora', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    c.onStickMove(1, 0, acima(SPRINT_LOCK_R + 0.1));
    c.onStickMove(1, 0, acima(0.25));
    assert.equal(c.locked(), true);
    c.setSprintLock(false);                     // entrou no carro: cruzeiro sem mão não
    assert.equal(c.locked(), false, 'desligar a trava não soltou a que existia');
    assert.ok(c.getMove().mag < 0.5, `o módulo não voltou ao do dedo: ${c.getMove().mag}`);
    c.onStickMove(1, 0, acima(SPRINT_LOCK_R + 0.5));
    assert.equal(c.locked(), false, 'travou com a trava desligada');
    c.setSprintLock(true);
    c.onStickMove(1, 0, acima(SPRINT_LOCK_R + 0.6));
    assert.equal(c.locked(), true, 'religar a trava não voltou a travar');
  });

  it('dado o dedo quase no limiar, então o núcleo avisa que a trava está PERTO (alvo visível)', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    c.onStickMove(1, 0, acima(0.8));
    assert.equal(c.nearLock(), false, 'dentro do raio não é "perto da trava"');
    c.onStickMove(1, 0, acima(1.1));
    assert.equal(c.nearLock(), true, 'passou do talo pra cima e o alvo da trava não apareceu');
    c.onStickMove(1, 0, acima(SPRINT_LOCK_R + 0.1));
    assert.equal(c.nearLock(), false, 'travado não é mais "perto": o alvo sai');
  });
});

/* ================================================================
   C8 — O BOTÃO APARECE QUANDO SERVE (docs/mobile/criterio-aaa.md). CoD
   Mobile: "When passing over a weapon on the ground, this button will
   pop-up"; Critical Ops 1.70: "The touch button appears when you can pick
   up an item". Regra pura: quem decide é o jogo (`disponivel`); o núcleo só
   garante as duas travas de segurança — botão SEGURADO não some debaixo do
   dedo, e fiação ausente ou quebrada nunca apaga botão nenhum.
   ================================================================ */
describe('núcleo dos controles de toque — botões contextuais', () => {
  let botaoVisivel, CONTEXT_ACTS;
  before(async () => {
    ({ botaoVisivel, CONTEXT_ACTS } = await import('../js/touchcontrols.js'));
  });

  it('dado o contrato, então USAR, COMER, KIT e GRANADA são os contextuais (e o gatilho nunca é)', () => {
    assert.deepEqual([...CONTEXT_ACTS].sort(), ['eat', 'med', 'nade', 'use']);
  });

  it('dada a condição de jogo, então o botão acompanha: aparece com, some sem', () => {
    const tem = { use: false, eat: false, med: false, nade: false };
    const disp = act => tem[act];
    for (const act of CONTEXT_ACTS) {
      assert.equal(botaoVisivel(act, disp, false), false, `${act} visível sem ter o que fazer`);
      tem[act] = true;
      assert.equal(botaoVisivel(act, disp, false), true, `${act} escondido com o que fazer`);
    }
    for (const act of ['fire', 'ads', 'jump', 'crouch', 'reload', 'swap', 'inv', 'pause'])
      assert.equal(botaoVisivel(act, () => false, false), true, `${act} não é contextual e sumiu`);
  });

  it('dado o dedo SEGURANDO o botão, então ele não some no meio do gesto', () => {
    assert.equal(botaoVisivel('use', () => false, true), true,
      'o botão sumiu debaixo do dedo (o baú abriu e o USAR evaporou com o dedo em cima)');
  });

  it('dada fiação ausente ou quebrada, então NENHUM botão some (falha aberta)', () => {
    for (const lixo of [undefined, null, 42, 'x', {}])
      assert.equal(botaoVisivel('med', lixo, false), true, `sem fiação (${String(lixo)}) o kit sumiu`);
    assert.equal(botaoVisivel('nade', () => { throw new Error('boom'); }, false), true,
      'uma exceção na leitura do jogo apagou a granada');
  });
});

/* ================================================================
   C7 — ARMAS COMO ÍCONES: o rótulo curto de cada arma. Sai do nome
   declarado em js/weapons.js (a primeira palavra); o número do slot mora no
   ícone, então duas ESCOPETAS continuam distinguíveis.
   ================================================================ */
describe('núcleo dos controles de toque — rótulo das armas', () => {
  let rotuloArma;
  before(async () => { ({ rotuloArma } = await import('../js/touchcontrols.js')); });

  it('dado o nome da arma, então o rótulo é a primeira palavra', () => {
    assert.equal(rotuloArma('FUZIL "VAGALUME"'), 'FUZIL');
    assert.equal(rotuloArma('DMR "FALCÃO"'), 'DMR');
    assert.equal(rotuloArma('FACA "AURORA"'), 'FACA');
    assert.equal(rotuloArma('  SNIPER   "AGULHA"'), 'SNIPER');
  });

  it('dado lixo, então rótulo vazio sem lançar', () => {
    for (const lixo of [undefined, null, 42, {}, ''])
      assert.equal(rotuloArma(lixo), '', `rótulo de ${String(lixo)}`);
  });
});

/* ================================================================
   C9 — "RESTAURAR PADRÃO" dos ajustes de toque. Vale na sessão mesmo quando
   gravar lança (aba privada, cota cheia): a falha de persistir não pode
   deixar o jogador preso num ajuste que ele quis desfazer.
   ================================================================ */
describe('núcleo dos controles de toque — restaurar padrão', () => {
  let restaurarToque, TOUCH_DEFAULTS;
  before(async () => {
    ({ restaurarToque } = await import('../js/touchcontrols.js'));
    ({ TOUCH_DEFAULTS } = await import('../js/config.js'));
  });

  it('dados ajustes mexidos, então restaurar devolve TODOS os padrões e não toca no resto', () => {
    const s = { touchLook: 2.2, touchRatioY: 0.35, touchAds: 1.4, touchFireLook: 0,
      touchAssist: 0, touchAutoFire: 1, touchFireLeft: 1, vol: 0.2, res: 1 };
    assert.equal(restaurarToque(s, () => {}), true);
    for (const k of Object.keys(TOUCH_DEFAULTS))
      assert.equal(s[k], TOUCH_DEFAULTS[k], `${k} não voltou ao padrão`);
    assert.equal(s.vol, 0.2, 'restaurar o TOQUE mexeu no volume');
    assert.equal(s.res, 1, 'restaurar o TOQUE mexeu na resolução');
  });

  it('dado localStorage que lança, então restaura na sessão e devolve false (não derruba)', () => {
    const s = { touchLook: 2.2 };
    let r;
    assert.doesNotThrow(() => { r = restaurarToque(s, () => { throw new Error('QuotaExceededError'); }); });
    assert.equal(r, false);
    assert.equal(s.touchLook, TOUCH_DEFAULTS.touchLook, 'sem persistir, a sessão também não restaurou');
    assert.equal(restaurarToque(null, () => {}), false, 'aceitou settings nulo');
  });
});

/* ================================================================
   C10 — pointercancel de TODOS os dedos solta a mira alternada. O núcleo
   conta quantos dedos ainda são donos de alguma coisa: é por esse número que
   a camada DOM sabe que o último dedo saiu e pode chamar o releaseAll.
   ================================================================ */
describe('núcleo dos controles de toque — contagem de dedos donos', () => {
  it('dados dedos entrando e saindo, então ativos() conta os donos vivos', () => {
    const c = createTouchCore();
    assert.equal(c.ativos(), 0);
    c.onStickStart(1, 0, 0);
    c.onLookStart(2, 0, 0);
    c.press('fire', 3, 0, 0);
    assert.equal(c.ativos(), 3);
    c.releasePointer(2);
    assert.equal(c.ativos(), 2);
    c.releasePointer(1);
    c.releasePointer(3);
    assert.equal(c.ativos(), 0);
    c.press('ads', 4);
    c.releaseAll();
    assert.equal(c.ativos(), 0);
  });
});

/* ================================================================
   ACELERAÇÃO DO OLHAR — opção do menu, PADRÃO 0 (linear: régua M3e).
   Com ela ligada, o ganho depende da VELOCIDADE DO DEDO, medida pelo
   relógio do EVENTO de toque — nunca pelo dt do quadro. Critical Ops 1.70
   publicou exatamente o defeito contrário: "Fixed aim acceleration being
   dependent on framerate" (docs/mobile/referencia-mira-toque.md §3.1).
   ================================================================ */
describe('núcleo dos controles de toque — aceleração do olhar', () => {
  let ganhoDoOlhar, LOOK_ACCEL;
  before(async () => { ({ ganhoDoOlhar, LOOK_ACCEL } = await import('../js/touchcontrols.js')); });

  /* um dedo que arrasta `px` na horizontal a `pxs` px/s, com um evento a
     cada 1000/`hz` ms; `quadro` = de quantos em quantos eventos o jogo
     consome (takeLook) — é a taxa de quadros */
  function arrastar(c, px, pxs, hz, quadro = 1, t0 = 1000) {
    const passos = Math.max(1, Math.round(px / pxs * hz)), dt = px / pxs * 1000 / passos;
    c.onLookStart(9, 0, 0, t0);
    let total = 0;
    for (let i = 1; i <= passos; i++) {
      c.onLookMove(9, px * i / passos, 0, t0 + dt * i);
      if (i % quadro === 0) total += c.takeLook().dx;
    }
    total += c.takeLook().dx;
    c.onLookEnd(9);
    return total;
  }

  it('dado o PADRÃO (aceleração 0), então o giro é linear em qualquer velocidade de dedo', () => {
    const c = createTouchCore();
    for (const pxs of [30, 300, 3000, 30000]) {
      const g = arrastar(c, 120, pxs, 120);
      assert.ok(Math.abs(g - 120) < 1e-9, `a ${pxs} px/s o padrão acumulou ${g} px (linear pede 120)`);
    }
  });

  it('dada a aceleração ligada, então o MESMO dedo dá o MESMO giro a 30, 60, 120 e 240 Hz de evento e de quadro', () => {
    const c = createTouchCore();
    c.setLookAccel(1);
    for (const pxs of [80, 400, 1200, 4000]) {
      const ref = arrastar(c, 180, pxs, 240, 4);
      for (const [hz, quadro] of [[30, 1], [60, 1], [60, 2], [120, 2], [240, 1], [240, 8]]) {
        const g = arrastar(c, 180, pxs, hz, quadro);
        assert.ok(Math.abs(g / ref - 1) < 1e-3,
          `${pxs} px/s: a ${hz} Hz (quadro a cada ${quadro}) girou ${g.toFixed(3)} px, a 240 Hz ${ref.toFixed(3)}`);
      }
    }
  });

  it('dada a aceleração ligada, então devagar gira IGUAL ao linear, rápido gira até 2×, e o ganho é monotônico e limitado', () => {
    const vs = [];
    for (let v = 0; v <= 20000; v += 25) vs.push(v);
    const gs = vs.map(v => ganhoDoOlhar(v, 1));
    for (let i = 1; i < gs.length; i++) assert.ok(gs[i] >= gs[i - 1] - 1e-12, `o ganho caiu em ${vs[i]} px/s`);
    assert.ok(Math.abs(gs[0] - LOOK_ACCEL.ganhoLento) < 1e-9, `ganho parado ${gs[0]}`);
    assert.ok(Math.abs(gs[gs.length - 1] - LOOK_ACCEL.ganhoRapido) < 1e-9, `ganho no talo ${gs[gs.length - 1]}`);
    assert.equal(LOOK_ACCEL.ganhoLento, 1, 'devagar a mira fina tem de ficar a do linear');
    assert.equal(LOOK_ACCEL.ganhoRapido, 2, 'o teto é o 2× das funções de Graham e Trankle & Deutschmann');
    /* rampa entre 0,05 e 0,2 m/s (libpointing), em px de CSS pelo dp do Android */
    const mm = 160 / 25.4;
    assert.ok(Math.abs(LOOK_ACCEL.vLenta - 50 * mm) < 1 && Math.abs(LOOK_ACCEL.vRapida - 200 * mm) < 1,
      `limiares ${LOOK_ACCEL.vLenta}/${LOOK_ACCEL.vRapida} px/s não são 0,05/0,2 m/s`);
    assert.equal(ganhoDoOlhar(LOOK_ACCEL.vLenta * 0.99, 1), 1);
    assert.ok(Math.abs(ganhoDoOlhar((LOOK_ACCEL.vLenta + LOOK_ACCEL.vRapida) / 2, 1) - 1.5) < 1e-12, 'a rampa não é linear');
    // metade do ajuste = metade do caminho entre o linear e a curva cheia
    for (const v of [0, LOOK_ACCEL.vLenta, (LOOK_ACCEL.vLenta + LOOK_ACCEL.vRapida) / 2, 1e5])
      assert.ok(Math.abs(ganhoDoOlhar(v, 0.5) - (1 + (ganhoDoOlhar(v, 1) - 1) * 0.5)) < 1e-12);
    assert.equal(ganhoDoOlhar(5000, 0), 1);
    assert.equal(ganhoDoOlhar(NaN, 1), 1, 'velocidade lixo tem de dar ganho 1');
  });

  it('dado o dedo que mira pelo ATIRAR, então a mesma curva vale, vezes o fator do botão', () => {
    const c = createTouchCore({ fireLook: 0.5 });
    c.setLookAccel(1);
    c.press('fire', 7, 0, 0, 1000);
    for (let i = 1; i <= 30; i++) c.onPressMove(7, 4000 * i / 240, 0, 1000 + i * 1000 / 240);  // 4000 px/s
    const rapido = c.takeLook().dx;
    const esperado = 500 * 0.5 * ganhoDoOlhar(4000, 1);
    assert.ok(Math.abs(rapido / esperado - 1) < 1e-6, `ATIRAR rápido: ${rapido} px, curva × fator pede ${esperado}`);
  });

  it('dado evento sem relógio (despachado sem timeStamp), então o ganho é 1 e nada vira NaN', () => {
    const c = createTouchCore();
    c.setLookAccel(1);
    c.onLookStart(3, 0, 0);
    c.onLookMove(3, 50, 0);
    c.onLookMove(3, 80, 'x');
    const l = c.takeLook();
    assert.equal(l.dx, 80);
    assert.equal(Number.isFinite(l.dy), true);
    c.setLookAccel('lixo');
    assert.equal(c.lookAccel, 0, 'ajuste lixo tem de cair no padrão (linear)');
  });
});

/* ================================================================
   LIMIAR DE CORRIDA E CURSO DO ANALÓGICO.
   · Correr a partir de 0,8 de deflexão: Apple, WWDC26 "Make your game
     great with touch" — "A small tilt means the character moves at a
     normal pace. If it's a big tilt, the character will sprint", com
     `if magnitude > 0.8`; o Touch Adaptation Kit da Microsoft troca andar
     por correr em 0,75. Este jogo pedia 0,85 — o mais alto dos três.
   · Curso (raio) ajustável: o polegar e a tela variam; o Touch Adaptation
     Kit expõe o tamanho "to match user ergonomic preferences".
   ================================================================ */
describe('núcleo dos controles de toque — limiar de corrida e curso', () => {
  it('dada deflexão de 0,82 (pós-zona-morta), então CORRE; a 0,78 ainda anda no topo', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    const bruto = m => (m * (1 - STICK_DEADZONE) + STICK_DEADZONE) * STICK_RADIUS;
    c.onStickMove(1, 0, -bruto(0.82));
    assert.ok(c.getMove().mag > SPRINT_MAG, `0,82 não corre (limiar ${SPRINT_MAG})`);
    c.onStickMove(1, 0, -bruto(0.78));
    const m = c.getMove();
    assert.ok(m.mag < SPRINT_MAG, `0,78 já corre (limiar ${SPRINT_MAG})`);
    assert.ok(Math.hypot(m.x, m.y) > 0.97, 'perto do limiar o andar tem de estar perto do teclado');
  });
  it('dado o curso ajustado para 40 px, então o talo chega em 40 px, a zona morta escala junto, e a trava também', () => {
    const c = createTouchCore();
    c.setRadius(40);
    assert.equal(c.radius, 40);
    c.onStickStart(1, 0, 0);
    c.onStickMove(1, 0, -40);
    assert.ok(Math.abs(c.getMove().mag - 1) < 1e-9, `40 px com curso 40 não é o talo (${c.getMove().mag})`);
    c.onStickMove(1, 0, -40 * STICK_DEADZONE * 0.9);
    assert.equal(c.getMove().mag, 0, 'a zona morta não acompanhou o curso');
    c.onStickMove(1, 0, -40 * 1.62);
    assert.equal(c.locked(), true, 'a trava não acompanhou o curso (1,6 × 40 px)');
  });
  it('dado curso lixo, então volta ao padrão sem lançar', () => {
    const c = createTouchCore();
    for (const lixo of [NaN, -5, 0, 'x', undefined]) {
      c.setRadius(lixo);
      assert.equal(c.radius, STICK_RADIUS, `curso ${String(lixo)} virou ${c.radius}`);
    }
  });
  it('dado mudar o curso com o dedo parado, então o movimento é recalculado na hora (sem esperar o próximo pointermove)', () => {
    const c = createTouchCore();
    c.onStickStart(1, 0, 0);
    c.onStickMove(1, 0, -29);
    const antes = c.getMove().mag;
    c.setRadius(29);
    assert.ok(antes < 0.6 && Math.abs(c.getMove().mag - 1) < 1e-9, `mag ${antes} → ${c.getMove().mag}`);
  });
});
