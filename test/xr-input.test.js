/* ================================================================
   QA — ENTRADA DOS CONTROLES DE VR (js/xr/xrinput.js).

   Módulo PURO, no molde do resto da casa: recebe as fontes de entrada do
   WebXR por parâmetro e devolve INTENÇÃO. Nada de DOM, nada de three —
   dá pra testar controle de VR sem headset.

   Duas decisões de conforto que viram contrato aqui, porque em VR elas
   são a diferença entre jogar e passar mal:

     GIRO EM PASSOS (snap turn). Girar o mundo suave debaixo de quem está
     parado é a receita clássica de enjoo. O giro acontece em degraus de
     45°, UM por inclinada de analógico: enquanto o jogador segurar pro
     lado, não repete. Ele precisa voltar ao centro pra girar de novo.

     ZONA MORTA. Analógico de Touch descansa em ±0,1 sozinho. Sem zona
     morta o jogador "anda" parado — e em VR andar sem querer é enjoo na
     veia.

   O mapa de eixos do Quest Touch: o gamepad expõe 4 eixos e os que valem
   são os índices 2 e 3 (o par 0/1 é do touchpad, que o Touch não tem).
   Isso não é detalhe: ler 0/1 dá analógico morto no aparelho e ninguém
   descobre sem um Quest na mão.
   ================================================================ */
'use strict';
const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

let criarEntradaXR, DEADZONE, SNAP_RAD;
before(async () => {
  ({ criarEntradaXR, DEADZONE, SNAP_RAD } = await import('../js/xr/xrinput.js'));
});

/* dublê de XRInputSource: só o que o módulo lê */
function mao(lado, eixos = [0, 0, 0, 0], botoes = []) {
  return {
    handedness: lado,
    gamepad: {
      axes: eixos,
      buttons: botoes.map(b => (typeof b === 'boolean' ? { pressed: b, value: b ? 1 : 0 } : b)),
    },
  };
}

let entrada;
beforeEach(() => { entrada = criarEntradaXR(); });

describe('analógico de andar (mão esquerda)', () => {
  it('parado no centro não anda', () => {
    const r = entrada.ler([mao('left', [0, 0, 0, 0])]);
    assert.deepEqual([r.andar.x, r.andar.y], [0, 0]);
  });

  it('descanso dentro da zona morta não anda', () => {
    const r = entrada.ler([mao('left', [0, 0, DEADZONE * 0.9, -DEADZONE * 0.9])]);
    assert.deepEqual([r.andar.x, r.andar.y], [0, 0],
      'analógico em repouso faria o jogador andar sozinho — enjoo garantido');
  });

  it('empurrar pra frente anda pra frente', () => {
    // eixo 3 negativo = pra frente no Touch
    const r = entrada.ler([mao('left', [0, 0, 0, -1])]);
    assert.ok(r.andar.y > 0.9, `esperava andar pra frente, veio ${r.andar.y}`);
    assert.equal(r.andar.x, 0);
  });

  it('empurrar pro lado anda pro lado', () => {
    const r = entrada.ler([mao('left', [0, 0, 1, 0])]);
    assert.ok(r.andar.x > 0.9);
  });

  it('a zona morta é descontada, não cortada — não há salto de 0 pra 1', () => {
    const pouco = entrada.ler([mao('left', [0, 0, 0, -(DEADZONE + 0.05)])]).andar.y;
    assert.ok(pouco > 0 && pouco < 0.2,
      `logo depois da zona morta o passo tem que ser pequeno, veio ${pouco}`);
  });

  it('não passa de 1 na diagonal', () => {
    const r = entrada.ler([mao('left', [0, 0, 1, -1])]);
    assert.ok(Math.hypot(r.andar.x, r.andar.y) <= 1.0001);
  });
});

describe('giro em passos (mão direita)', () => {
  it('um passo por inclinada, não um por frame', () => {
    const m = () => [mao('right', [0, 0, 1, 0])];
    assert.equal(entrada.ler(m()).girar, -1, 'primeira leitura tem que girar');
    assert.equal(entrada.ler(m()).girar, 0, 'segurando, não pode repetir');
    assert.equal(entrada.ler(m()).girar, 0);
  });

  it('volta ao centro destrava o próximo passo', () => {
    entrada.ler([mao('right', [0, 0, 1, 0])]);
    entrada.ler([mao('right', [0, 0, 0, 0])]);          // soltou
    assert.equal(entrada.ler([mao('right', [0, 0, 1, 0])]).girar, -1);
  });

  it('cada lado gira pro seu lado', () => {
    assert.equal(entrada.ler([mao('right', [0, 0, 1, 0])]).girar, -1);
    entrada.ler([mao('right', [0, 0, 0, 0])]);
    assert.equal(entrada.ler([mao('right', [0, 0, -1, 0])]).girar, 1);
  });

  it('inclinada fraca não gira', () => {
    assert.equal(entrada.ler([mao('right', [0, 0, 0.4, 0])]).girar, 0);
  });

  it('o passo é de 45 graus', () => {
    assert.ok(Math.abs(SNAP_RAD - Math.PI / 4) < 1e-9);
  });
});

describe('botões', () => {
  it('gatilho da direita é atirar', () => {
    const r = entrada.ler([mao('right', [0, 0, 0, 0], [true])]);
    assert.equal(r.atirar, true);
  });

  it('gatilho da esquerda não atira', () => {
    const r = entrada.ler([mao('left', [0, 0, 0, 0], [true])]);
    assert.equal(r.atirar, false);
  });

  it('botão A (índice 4) pula', () => {
    const r = entrada.ler([mao('right', [0, 0, 0, 0], [false, false, false, false, true])]);
    assert.equal(r.pular, true);
  });

  it('empunhadura da esquerda agacha', () => {
    const r = entrada.ler([mao('left', [0, 0, 0, 0], [false, true])]);
    assert.equal(r.agachar, true);
  });
});

describe('o que o WebXR ENTREGA de verdade (não é Array)', () => {
  /* ESTE É O BUG QUE PASSOU. `session.inputSources` é um `XRInputSourceArray`,
     NÃO um `Array`: `Array.isArray()` devolve FALSE nele. O guarda defensivo
     `Array.isArray(fontes) ? fontes : []` descartava os dois controles TODO
     FRAME, no aparelho, para sempre — e nenhum teste pegou porque os dublês
     daqui eram arrays comuns. Testar o dublê em vez da realidade é como o
     controle "não funcionar" com 20 testes verdes. */
  function comoOWebXREntrega(itens) {
    // array-like com length e índices, iterável, mas NÃO Array — igual ao real
    const o = { length: itens.length, [Symbol.iterator]: Array.prototype[Symbol.iterator] };
    itens.forEach((v, i) => { o[i] = v; });
    return o;
  }

  it('lê analógico de um XRInputSourceArray (array-like, não Array)', () => {
    const fontes = comoOWebXREntrega([mao('left', [0, 0, 0, -1])]);
    assert.equal(Array.isArray(fontes), false, 'o dublê tem que NÃO ser Array, senão não testa nada');
    const r = entrada.ler(fontes);
    assert.ok(r.andar.y > 0.9, `controle ignorado: veio ${r.andar.y}`);
  });

  it('lê giro de um array-like', () => {
    const r = entrada.ler(comoOWebXREntrega([mao('right', [0, 0, 1, 0])]));
    assert.equal(r.girar, -1);
  });

  it('lê botão de um array-like', () => {
    const r = entrada.ler(comoOWebXREntrega([mao('right', [0, 0, 0, 0], [true])]));
    assert.equal(r.atirar, true);
  });
});

describe('robustez — controle é hardware, e hardware falta', () => {
  it('sem fonte de entrada nenhuma devolve tudo zerado', () => {
    for (const v of [undefined, null, [], {}]) {
      const r = entrada.ler(v);
      assert.deepEqual([r.andar.x, r.andar.y, r.girar], [0, 0, 0]);
      assert.equal(r.atirar, false);
    }
  });

  it('fonte sem gamepad não derruba', () => {
    const r = entrada.ler([{ handedness: 'left' }, { handedness: 'right', gamepad: null }]);
    assert.deepEqual([r.andar.x, r.andar.y], [0, 0]);
  });

  it('gamepad com poucos eixos não derruba', () => {
    const r = entrada.ler([mao('left', [0.5])]);
    assert.deepEqual([r.andar.x, r.andar.y], [0, 0]);
  });

  it('eixo com lixo (NaN, string) não vira movimento', () => {
    const r = entrada.ler([mao('left', [0, 0, NaN, 'muito'])]);
    assert.deepEqual([r.andar.x, r.andar.y], [0, 0]);
  });

  it('mão desconhecida é ignorada em vez de virar as duas', () => {
    const r = entrada.ler([mao('none', [0, 0, 1, -1])]);
    assert.deepEqual([r.andar.x, r.andar.y, r.girar], [0, 0, 0]);
  });
});
