/* ================================================================
   QA — adaptivequality.js (controlador puro de escala de resolução).
   Roda em Node puro (sem porta, sem browser, sem WebGL).

   Contrato: o jogador escolhe o TETO de qualidade; o controlador só
   desce a partir dele quando o frame estoura POR CULPA DA GPU, e
   volta a subir quando sobra folga. Nunca passa do teto.
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let A;
before(async () => { A = await import('../js/adaptivequality.js'); });

/* Alimenta o controlador com `n` frames idênticos e devolve quantas
   vezes a escala mudou. `now` avança junto com o tempo simulado. */
function feed(sc, n, frameMs, simMs, startNow = 0) {
  let now = startNow, changes = 0;
  for (let i = 0; i < n; i++) {
    now += frameMs;
    if (sc.push(frameMs, simMs, now)) changes++;
  }
  return { changes, now };
}

/* Mesma coisa, mas com variação de frame — precisa pra distinguir uma
   máquina TRAVADA no vsync (jitter baixo, sobra folga) de outra que só
   ATINGE o vsync na média (jitter alto, está no limite). */
function feedVarying(sc, windows, pattern, simMs, startNow = 0) {
  let now = startNow, changes = 0;
  for (let w = 0; w < windows; w++) {
    for (let i = 0; i < BASE.windowFrames; i++) {
      const frameMs = pattern[i % pattern.length];
      now += frameMs;
      if (sc.push(frameMs, simMs, now)) changes++;
    }
  }
  return { changes, now };
}

const BASE = { ceiling: 1.5, floor: 0.75, step: 0.25, windowFrames: 20, cooldownMs: 0 };
const VSYNC60 = [16.6, 16.7, 16.8, 16.7]; // travado no vsync: jitter ~0,2 ms

describe('escala de resolução — estado inicial', () => {
  it('começa no teto do jogador', () => {
    assert.equal(A.createResolutionScaler({ ...BASE }).scale, 1.5);
  });

  it('não decide nada antes de completar a janela', () => {
    const sc = A.createResolutionScaler({ ...BASE });
    const { changes } = feed(sc, BASE.windowFrames - 1, 40, 2);
    assert.equal(changes, 0, 'janela incompleta não pode mexer na resolução');
    assert.equal(sc.scale, 1.5);
  });

  it('teto abaixo do piso não inverte a faixa', () => {
    const sc = A.createResolutionScaler({ ...BASE, ceiling: 0.5, floor: 0.75 });
    assert.ok(sc.scale <= 0.5 && sc.scale > 0, 'teto manda quando é menor que o piso');
  });
});

describe('escala de resolução — descida por GPU', () => {
  it('desce um passo quando o frame estoura e a culpa é do render', () => {
    const sc = A.createResolutionScaler({ ...BASE });
    feed(sc, BASE.windowFrames, 40, 3); // 40 ms de frame, só 3 ms de simulação
    assert.equal(sc.scale, 1.25, 'um passo por janela, não um tombo');
  });

  it('desce em degraus sucessivos até o piso e para lá', () => {
    const sc = A.createResolutionScaler({ ...BASE });
    for (let w = 0; w < 12; w++) feed(sc, BASE.windowFrames, 40, 3, w * 1e5);
    assert.equal(sc.scale, 0.75, 'nunca abaixo do piso');
  });

  it('NÃO desce quando o gargalo é CPU — resolução não resolveria', () => {
    const sc = A.createResolutionScaler({ ...BASE });
    feed(sc, BASE.windowFrames, 40, 39); // frame inteiro gasto na simulação
    assert.equal(sc.scale, 1.5, 'derrubar pixel não conserta gargalo de CPU');
  });

  it('ignora picos isolados (troca de aba, carregamento)', () => {
    const sc = A.createResolutionScaler({ ...BASE });
    let now = 0;
    for (let i = 0; i < BASE.windowFrames * 2; i++) {
      const spike = i % 10 === 0;
      const frameMs = spike ? 2000 : 8;
      now += frameMs;
      sc.push(frameMs, spike ? 1 : 2, now);
    }
    assert.equal(sc.scale, 1.5, 'outlier não é evidência de GPU saturada');
  });
});

describe('escala de resolução — volta a subir', () => {
  it('recupera qualidade quando sobra folga, sem passar do teto', () => {
    const sc = A.createResolutionScaler({ ...BASE });
    feed(sc, BASE.windowFrames, 40, 3);
    assert.equal(sc.scale, 1.25);
    for (let w = 0; w < 12; w++) feed(sc, BASE.windowFrames, 6, 2, (w + 1) * 1e5);
    assert.equal(sc.scale, 1.5, 'teto é limite duro mesmo com folga sobrando');
  });

  it('zona morta: frame mediano não mexe em nada', () => {
    const sc = A.createResolutionScaler({ ...BASE, downMs: 20, upMs: 12 });
    const { changes } = feed(sc, BASE.windowFrames * 3, 16, 4);
    assert.equal(changes, 0, '16 ms fica entre upMs e downMs: nada a fazer');
    assert.equal(sc.scale, 1.5);
  });
});

describe('escala de resolução — histerese e teto', () => {
  it('cooldown impede duas mudanças coladas', () => {
    const sc = A.createResolutionScaler({ ...BASE, cooldownMs: 5000 });
    feed(sc, BASE.windowFrames, 40, 3);
    assert.equal(sc.scale, 1.25);
    feed(sc, BASE.windowFrames, 40, 3, 100); // ainda dentro do cooldown
    assert.equal(sc.scale, 1.25, 'trocar resolução realoca render target: não pode ser em rajada');
  });

  it('setCeiling puxa a escala atual pra dentro da nova faixa', () => {
    const sc = A.createResolutionScaler({ ...BASE });
    assert.equal(sc.setCeiling(1), true);
    assert.equal(sc.scale, 1);
    assert.equal(sc.setCeiling(2), false, 'subir o teto não sobe a escala sozinho');
    assert.equal(sc.scale, 1);
  });

  /* `res` vem de localStorage, que o jogador pode ter corrompido. `+"lixo"`
     é NaN e `renderer.setPixelRatio(NaN)` zera o canvas — tela preta. */
  it('teto inválido (localStorage corrompido) nunca vira escala NaN', () => {
    for (const lixo of [NaN, undefined, null, 'abc', Infinity, -1, 0]) {
      const sc = A.createResolutionScaler({ ...BASE, ceiling: lixo });
      assert.ok(Number.isFinite(sc.scale) && sc.scale > 0,
        `ceiling=${String(lixo)} produziu escala ${sc.scale}`);
    }
  });

  it('setCeiling inválido não contamina uma escala que estava boa', () => {
    const sc = A.createResolutionScaler({ ...BASE });
    sc.setCeiling(NaN);
    assert.ok(Number.isFinite(sc.scale) && sc.scale > 0, `escala virou ${sc.scale}`);
    feed(sc, BASE.windowFrames, 40, 3);
    assert.ok(Number.isFinite(sc.scale) && sc.scale > 0, `escala virou ${sc.scale} após decidir`);
  });

  it('reset volta ao teto e limpa a janela', () => {
    const sc = A.createResolutionScaler({ ...BASE });
    feed(sc, BASE.windowFrames, 40, 3);
    assert.equal(sc.scale, 1.25);
    sc.reset();
    assert.equal(sc.scale, 1.5);
    assert.equal(sc.samples, 0);
  });

  it('vsync trava o frame em 16,7 ms e ainda assim a qualidade volta', () => {
    // Sem isto o jogo perde qualidade PRA SEMPRE: num monitor de 60 Hz
    // nenhum frame desce de 16,7 ms, então um pico isolado derrubaria a
    // resolução e ela nunca mais teria "prova" de folga pra subir.
    const sc = A.createResolutionScaler({ ...BASE });
    feed(sc, BASE.windowFrames, 40, 3);
    assert.equal(sc.scale, 1.25, 'pré-condição: caiu um degrau');
    feedVarying(sc, 8, VSYNC60, 3, 1e5);
    assert.equal(sc.scale, 1.5, 'vsync estável é folga, não gargalo');
  });

  it('vsync só na média (jitter alto) NÃO conta como folga', () => {
    const sc = A.createResolutionScaler({ ...BASE });
    feed(sc, BASE.windowFrames, 40, 3);
    const afterDrop = sc.scale;
    feedVarying(sc, 8, [16.7, 16.7, 16.7, 33.4], 3, 1e5); // 1 frame perdido a cada 4
    assert.ok(sc.scale <= afterDrop, 'máquina no limite não pode ganhar resolução');
  });

  it('uma janela boa sozinha não sobe (evita subir em cima de ruído)', () => {
    const sc = A.createResolutionScaler({ ...BASE });
    feed(sc, BASE.windowFrames, 40, 3);
    assert.equal(sc.scale, 1.25);
    feed(sc, BASE.windowFrames, 6, 2, 1e5);
    assert.equal(sc.scale, 1.25, 'precisa de streak, não de um lampejo');
  });

  it('subiu e se arrependeu: fica mais exigente pra tentar de novo', () => {
    // Anti-oscilação: a máquina que fica exatamente na fronteira não pode
    // ficar piscando entre duas resoluções a cada poucos segundos.
    const sc = A.createResolutionScaler({ ...BASE });
    feed(sc, BASE.windowFrames, 40, 3);                 // 1.25
    feed(sc, 2 * BASE.windowFrames, 6, 2, 1e5);         // sobe de volta: 1.5
    assert.equal(sc.scale, 1.5);
    feed(sc, BASE.windowFrames, 40, 3, 2e5);            // arrependimento: 1.25
    assert.equal(sc.scale, 1.25);
    feed(sc, 2 * BASE.windowFrames, 6, 2, 3e5);         // mesma dose de antes
    assert.equal(sc.scale, 1.25, 'exigência tinha que ter dobrado');
    feed(sc, 4 * BASE.windowFrames, 6, 2, 4e5);         // dose dobrada
    assert.equal(sc.scale, 1.5, 'com evidência suficiente, sobe');
  });

  it('é determinístico: mesma entrada, mesma saída', () => {
    const run = () => {
      const sc = A.createResolutionScaler({ ...BASE });
      for (let w = 0; w < 6; w++) feed(sc, BASE.windowFrames, w % 2 ? 40 : 6, 3, w * 1e5);
      return sc.scale;
    };
    assert.equal(run(), run());
  });
});
