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

describe('correr e trocar de arma — sem isso não é FPS', () => {
  /* Sobravam dois botões no Touch depois de andar/girar/atirar/mirar/pular/
     agachar/usar/recarregar: o CLIQUE DO ANALÓGICO esquerdo (índice 3) e o B da
     direita (índice 5). Sem correr, o mapa de battle royale é impraticável a pé;
     sem trocar de arma, o jogador fica preso na inicial a partida inteira. */
  it('clique do analógico esquerdo é correr', () => {
    const btns = [false, false, false, true];
    assert.equal(entrada.ler([mao('left', [0, 0, 0, -1], btns)]).correr, true);
  });

  it('correr é estado contínuo, não borda — soltar para de correr', () => {
    const seg = [false, false, false, true];
    entrada.ler([mao('left', [0, 0, 0, -1], seg)]);
    assert.equal(entrada.ler([mao('left', [0, 0, 0, -1], seg)]).correr, true, 'segurar mantém');
    assert.equal(entrada.ler([mao('left', [0, 0, 0, -1])]).correr, false);
  });

  it('B da direita troca de arma, um passo por aperto', () => {
    const b = p => [mao('right', [0, 0, 0, 0], [false, false, false, false, false, p])];
    assert.equal(entrada.ler(b(true)).trocarArma, true);
    assert.equal(entrada.ler(b(true)).trocarArma, false, 'segurar não pode ciclar em rajada');
    entrada.ler(b(false));
    assert.equal(entrada.ler(b(true)).trocarArma, true);
  });
});

describe('borda do gatilho — semi-automática precisa do APERTO, não do segurar', () => {
  /* `const want = gun.auto ? mouse.shooting : mouse.clicked` — automática lê o
     estado, semi lê o CLIQUE. Em VR só o estado era escrito, então pistola,
     sniper e escopeta ficavam mudas sem erro nenhum. A borda mora aqui porque
     é lógica de entrada, e lógica de entrada se testa sem headset. */
  const gatilho = p => [mao('right', [0, 0, 0, 0], [p])];

  it('o aperto acusa borda uma vez só', () => {
    assert.equal(entrada.ler(gatilho(true)).atirarAgora, true, 'primeiro frame do aperto é o clique');
    assert.equal(entrada.ler(gatilho(true)).atirarAgora, false, 'segurar não é clicar de novo');
    assert.equal(entrada.ler(gatilho(true)).atirarAgora, false);
  });

  it('soltar e apertar de novo acusa outra borda', () => {
    entrada.ler(gatilho(true));
    entrada.ler(gatilho(false));
    assert.equal(entrada.ler(gatilho(true)).atirarAgora, true);
  });

  it('o estado contínuo continua existindo pra automática', () => {
    assert.equal(entrada.ler(gatilho(true)).atirar, true);
    assert.equal(entrada.ler(gatilho(true)).atirar, true, 'automática precisa do segurar');
  });

  it('controle sumindo no meio do aperto não deixa a borda armada errada', () => {
    entrada.ler(gatilho(true));
    entrada.ler([]);                       // controle sumiu com o gatilho apertado
    assert.equal(entrada.ler(gatilho(true)).atirarAgora, true);
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
