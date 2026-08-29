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

let criarEntradaXR, DEADZONE, SNAP_RAD, CORRER_TILT, ANDAR_CHEIO;
before(async () => {
  ({ criarEntradaXR, DEADZONE, SNAP_RAD, CORRER_TILT, ANDAR_CHEIO } = await import('../js/xr/xrinput.js'));
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
    /* A ZONA MORTA É RADIAL, e por isso o repouso se mede pela MAGNITUDE.
       Este caso já usou `0,9 × DEADZONE` em CADA eixo, o que é um polegar a
       1,27 × DEADZONE do centro — fora da zona morta de verdade. A conta por
       eixo tinha um custo medido no jogo: encolhendo os dois eixos do mesmo
       tanto em valor absoluto, a RAZÃO entre eles muda e a direção andada saía
       9,79° da pedida com o polegar a 22,5°. O guarda que importa continua
       inteiro, e mais forte: polegar em repouso (mesmo torto) não move o
       jogador, e o primeiro passo fora da zona morta é pequeno, não um degrau. */
    const d = DEADZONE * 0.9 / Math.SQRT2;        // magnitude 0,9 × DEADZONE, na diagonal
    const r = entrada.ler([mao('left', [0, 0, d, -d])]);
    assert.deepEqual([r.andar.x, r.andar.y], [0, 0],
      'analógico em repouso faria o jogador andar sozinho — enjoo garantido');

    /* E o outro lado do limiar, para o caso acima não passar por um zero que
       vale para qualquer entrada: logo depois da borda o comando existe e é
       PEQUENO. Sem esta metade, `andar` travado em zero passaria nos dois. */
    const f = DEADZONE * 1.06 / Math.SQRT2;
    const fora = entrada.ler([mao('left', [0, 0, f, -f])]);
    const mag = Math.hypot(fora.andar.x, fora.andar.y);
    assert.ok(mag > 0 && mag < 0.2,
      `logo fora da zona morta o comando veio ${mag.toFixed(4)} — esperado pequeno e diferente de zero`);
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

  /* D3. A empunhadura é do AGARRAR, e isso não é gosto: VRC.Quest.Input.2 diz
     "use the Touch controller's grip button rather than the trigger button"; o
     grab do Immersive Web SDK da própria Meta roteia por `squeeze`; o
     `GrabTypes` padrão do SteamVR é `Grip`; e `pickup_axis_action` do Godot XR
     Tools nasce em `"grip"`. Quatro fontes, um resultado. Ver
     docs/vr/referencia-interacao.md §2. */
  it('empunhadura da esquerda AGARRA (VRC.Quest.Input.2), e não agacha', () => {
    const r = entrada.ler([mao('left', [0, 0, 0, 0], [false, true])]);
    assert.equal(r.agarrar, true, 'o grip esquerdo não virou o verbo de agarrar');
    assert.equal(r.agachar, false,
      'o grip continua agachando: com ele ocupado, pegar teria de sair no gatilho — o que a régua reprova');
  });

  it('o GATILHO da esquerda não agarra — pegar no gatilho é exatamente o que reprova', () => {
    const r = entrada.ler([mao('left', [0, 0, 0, 0], [true])]);
    assert.equal(r.agarrar, false);
  });
});

describe('correr e trocar de arma — sem isso não é FPS', () => {
  /* O Touch entrega 5 botões pressionáveis por mão (0,1,3,4,5): o índice 2 é
     nulo, o 6 é capacitivo e o 7 é reservado pela plataforma — "Buttons reserved
     by the UA or platform MUST NOT be exposed on the Gamepad" (W3C). Com o grip
     esquerdo indo para o agarrar, agachar desce para o clique do analógico e
     correr vai para o BATENTE, que é a convenção do gênero. */
  it('clique do analógico esquerdo é AGACHAR', () => {
    const btns = [false, false, false, true];
    assert.equal(entrada.ler([mao('left', [0, 0, 0, 0], btns)]).agachar, true);
  });

  it('correr é o analógico no BATENTE, não o clique', () => {
    // clique sem inclinada não corre
    assert.equal(entrada.ler([mao('left', [0, 0, 0, 0], [false, false, false, true])]).correr, false,
      'o clique do analógico ainda corre — ele agora é o agachar');
    // andar normal (meia inclinada) não corre
    assert.equal(entrada.ler([mao('left', [0, 0, 0, -0.6])]).correr, false,
      'meia inclinada virou corrida: o jogador correria sem pedir');
    // batente corre
    assert.equal(entrada.ler([mao('left', [0, 0, 0, -1])]).correr, true,
      'empurrar o analógico até o fim não corre');
  });

  it('correr é estado contínuo, não borda — soltar para de correr', () => {
    entrada.ler([mao('left', [0, 0, 0, -1])]);
    assert.equal(entrada.ler([mao('left', [0, 0, 0, -1])]).correr, true, 'segurar mantém');
    assert.equal(entrada.ler([mao('left', [0, 0, 0, -0.3])]).correr, false);
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

describe('radial do analógico direito — os quatro verbos que ficaram sem botão', () => {
  /* D1. Granada, kit médico, comer e troca de acessório de mira não tinham
     mapeamento NENHUM. E não é descuido: o Touch entrega 5 botões pressionáveis
     por mão e todos já têm dono — sobrou UM, o clique do analógico direito.
     Um botão para quatro verbos só fecha com um SELETOR.

     Quatro fatias é o teto por ergonomia, não por preguiça: "keep the number of
     buttons small… the attentional cone of vision is roughly 10 degrees" e "use
     hand menu for quick action" (Microsoft Learn, Hand menu). Ver
     docs/vr/referencia-interacao.md §4. */
  const CIMA = [0, 0, 0, -1], DIREITA = [0, 0, 1, 0];
  const BAIXO = [0, 0, 0, 1], ESQUERDA = [0, 0, -1, 0];
  const CENTRO = [0, 0, 0, 0];

  /* O BOTÃO É O GATILHO DA MÃO DE APOIO, e ele existe porque D3 o liberou: o
     agarre saiu do gatilho e foi para a empunhadura. Indicador segura, polegar
     escolhe — uma mão só.

     Não é o clique do analógico direito, que seria o palpite óbvio: esse botão
     JÁ É a pausa (js/xr/xrui.js, BOTAO_MENU = 3), que a loja exige
     (VRC.Quest.Functional.2). E não é o analógico direito para escolher a fatia,
     porque empurrar para o lado ali dispara o giro em passos — o giro é lido em
     OUTRO módulo (js/xr/xrturn.js, direto das fontes), fora do alcance deste, e
     um radial que gira a vista 45° ao ser aberto seria pior que a falta dele. */
  const esq = (eixos, gatilho) => mao('left', eixos, [!!gatilho]);
  const par = (eixos, gatilho) => [esq(eixos, gatilho), mao('right', CENTRO)];

  it('o gatilho da mão de apoio ABRE o radial', () => {
    assert.equal(entrada.ler(par(CENTRO, false)).radial.aberto, false, 'nasceu aberto');
    assert.equal(entrada.ler(par(CENTRO, true)).radial.aberto, true,
      'segurar o gatilho da mão de apoio não abriu o radial: os quatro verbos seguem sem botão');
  });

  it('o radial NÃO usa o clique do analógico direito — esse botão é a pausa', () => {
    /* Colisão que a suíte não pegaria e o headset pegaria em dois segundos:
       js/xr/xrui.js abre o painel de pausa nesse mesmo botão. Se o radial
       também morasse ali, abrir o menu de itens abriria a pausa junto — e o
       jogo pausado nem chega a processar o verbo. */
    const cliqueDireito = [mao('left', CENTRO), mao('right', CENTRO, [false, false, false, true])];
    assert.equal(entrada.ler(cliqueDireito).radial.aberto, false,
      'o clique do analógico direito abriu o radial: ele já é o botão de pausa (VRC.Quest.Functional.2)');
  });

  it('com o radial aberto o jogador NÃO anda — o analógico esquerdo está escolhendo', () => {
    assert.ok(entrada.ler(par(CIMA, false)).andar.y > 0.9, 'sem radial, andar tem que funcionar');
    const e = criarEntradaXR();
    e.ler(par(CENTRO, true));
    const r = e.ler(par(CIMA, true));
    assert.deepEqual([r.andar.x, r.andar.y], [0, 0],
      'escolher a fatia de cima também mandou o jogador andar pra frente às cegas');
  });

  it('escolher a fatia não CORRE junto — o batente é a fatia, não a disparada', () => {
    /* Defeito encontrado em sessão imersiva real, não no papel: a fatia é
       alcançada empurrando o analógico até o fim, e o batente é exatamente o que
       liga a corrida. Sem suspender junto, escolher qualquer verbo mandava um
       `ShiftLeft` — o jogador confirmava o item já em disparada. */
    const e = criarEntradaXR();
    e.ler(par(CENTRO, true));
    const r = e.ler(par(CIMA, true));
    assert.equal(r.correr, false,
      'escolher a fatia de cima ligou a corrida: o analógico está fazendo as duas coisas');
  });

  it('soltar a fatia com o polegar ainda na direção NÃO sai andando', () => {
    /* O outro defeito da mesma sessão, e o pior dos dois: o jogador confirma
       "granada" com o polegar para cima e, no frame seguinte, o radial já fechou
       mas o analógico continua no batente — ele sai correndo para a frente sem
       ter pedido. O analógico precisa passar pelo centro para voltar a andar,
       exatamente como o giro em passos precisa rearmar. */
    const e = criarEntradaXR();
    e.ler(par(CENTRO, true));
    e.ler(par(CIMA, true));
    const solta = e.ler(par(CIMA, false));      // confirma, polegar ainda em cima
    assert.equal(solta.radial.confirmou, 'KeyG', 'o cenário não confirmou — mediria o vazio');
    assert.deepEqual([solta.andar.x, solta.andar.y], [0, 0],
      'confirmar a fatia mandou o jogador andar no mesmo frame');
    assert.equal(solta.correr, false, 'e ainda saiu correndo');
    const depois = e.ler(par(CIMA, false));     // segue no batente, sem menu
    assert.deepEqual([depois.andar.x, depois.andar.y], [0, 0],
      'no frame seguinte já saiu andando: falta o rearme da locomoção');

    // e o rearme não pode travar o jogo: passou pelo centro, anda de novo
    e.ler(par(CENTRO, false));
    const volta = e.ler(par(CIMA, false));
    assert.ok(volta.andar.y > 0.9,
      `depois de voltar ao centro o jogador tem que andar de novo, veio ${volta.andar.y}`);
    assert.equal(volta.correr, true, 'e correr no batente também tem que voltar');
  });

  it('cada DIREÇÃO do analógico é um verbo — medido por direção, não por "tem fatia"', () => {
    const esperado = [
      [CIMA, 'KeyG'], [DIREITA, 'KeyQ'], [BAIXO, 'KeyF'], [ESQUERDA, 'KeyT'],
    ];
    for (const [eixos, code] of esperado) {
      const e = criarEntradaXR();
      e.ler(par(CENTRO, true));               // abre
      const r = e.ler(par(eixos, true));      // escolhe
      assert.equal(r.radial.code, code,
        `a direção ${JSON.stringify(eixos.slice(2))} devia selecionar ${code}, veio ${r.radial.code}`);
    }
  });

  it('soltar o clique CONFIRMA a fatia, uma vez só', () => {
    entrada.ler(par(CENTRO, true));
    entrada.ler(par(CIMA, true));
    const solta = entrada.ler(par(CIMA, false));
    assert.equal(solta.radial.confirmou, 'KeyG', 'soltar não confirmou a fatia escolhida');
    assert.equal(solta.radial.aberto, false, 'o radial ficou aberto depois de confirmar');
    assert.equal(entrada.ler(par(CIMA, false)).radial.confirmou, null,
      'a confirmação repetiu no frame seguinte: uma escolha viraria rajada de granadas');
  });

  it('SEGURAR a fatia não confirma em rajada — a confirmação é só no soltar', () => {
    /* Achado numa corrida de mutação: confirmar enquanto o analógico está na
       fatia passou impune por todos os outros testes daqui. A 72 Hz isso é uma
       granada POR FRAME enquanto o polegar decide — o jogador esvazia o
       inventário só de olhar o menu. Mesmo motivo pelo qual a troca de arma e o
       giro em passos exigem borda. */
    entrada.ler(par(CENTRO, true));
    const segurando = [];
    for (let i = 0; i < 5; i++) segurando.push(entrada.ler(par(CIMA, true)).radial.confirmou);
    assert.deepEqual(segurando, [null, null, null, null, null],
      `segurar a fatia confirmou ${segurando.filter(Boolean).length}× em 5 frames`);
    assert.equal(entrada.ler(par(CIMA, false)).radial.confirmou, 'KeyG',
      'e depois de tanto segurar, soltar tem que confirmar UMA vez');
  });

  it('soltar com o analógico no CENTRO cancela — abrir sem querer não pode gastar item', () => {
    entrada.ler(par(CENTRO, true));
    entrada.ler(par(CIMA, true));
    entrada.ler(par(CENTRO, true));          // voltou pro centro: larga a fatia
    const solta = entrada.ler(par(CENTRO, false));
    assert.equal(solta.radial.confirmou, null,
      'soltar no centro confirmou mesmo assim: o radial gasta item por acidente');
  });

  it('inclinada fraca não entra na fatia (o analógico descansa em ±0,1)', () => {
    entrada.ler(par(CENTRO, true));
    const r = entrada.ler(par([0, 0, 0, -0.25], true));
    assert.equal(r.radial.code, null,
      'o repouso do analógico já selecionou uma fatia — a escolha piscaria sozinha');
  });

  it('o analógico do GIRO nem é tocado pelo radial', () => {
    /* Defesa em profundidade. O giro que VALE mora noutro módulo
       (js/xr/xrturn.js, lido direto das fontes pelo game.js), e o desenho já
       evita o conflito pondo botão e fatia na mesma mão — a esquerda. Aqui se
       cobra que a saída de giro DESTE módulo também fique quieta enquanto o
       radial está aberto: se um dia alguém religar `cmd.girar`, o radial não
       pode voltar a girar a vista. O SINAL entra no assert porque medir
       "girou/não girou" já deixou passar movimento invertido nesta base. */
    const comGiro = eixos => [esq(CENTRO, true), mao('right', eixos)];
    const giros = [];
    giros.push(entrada.ler(comGiro(CENTRO)).girar);
    giros.push(entrada.ler(comGiro(DIREITA)).girar);
    giros.push(entrada.ler(comGiro(CENTRO)).girar);
    giros.push(entrada.ler(comGiro(ESQUERDA)).girar);
    assert.deepEqual(giros, [0, 0, 0, 0],
      `com o radial aberto o analógico direito girou o mundo (por frame: ${JSON.stringify(giros)})`);
  });

  it('o radial funciona na FORMA NATIVA do WebXR (array-like, não Array)', () => {
    /* Mesma armadilha que descartou os dois controles por semanas: o emulador
       faz `class XRInputSourceArray extends Array`, então Array.isArray dá true
       nele e FALSE no runtime real. */
    const nativo = itens => {
      const o = { length: itens.length, [Symbol.iterator]: Array.prototype[Symbol.iterator] };
      itens.forEach((v, i) => { o[i] = v; });
      return o;
    };
    assert.equal(Array.isArray(nativo([])), false, 'o dublê tem que NÃO ser Array');
    entrada.ler(nativo(par(CENTRO, true)));
    assert.equal(entrada.ler(nativo(par(CIMA, true))).radial.code, 'KeyG',
      'o radial não leu a forma que o navegador entrega de verdade');
    assert.equal(entrada.ler(nativo(par(CIMA, false))).radial.confirmou, 'KeyG');
  });

  it('sem o controle da mão de apoio o radial não fica preso aberto', () => {
    entrada.ler(par(CENTRO, true));
    entrada.ler(par(CIMA, true));
    const r = entrada.ler([mao('right', CENTRO)]);   // o controle do botão sumiu
    assert.equal(r.radial.aberto, false, 'o radial ficou aberto com o controle ausente');
    assert.equal(r.radial.confirmou, null, 'controle sumindo confirmou uma fatia sozinho');
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

  /* A FAIXA DE CAMINHADA PLENA, e por que ela existe.
     Quando `correr` desceu para o batente do analógico (para liberar a
     empunhadura ao AGARRAR), a caminhada normalizada só chegava a 100 % em
     inclinada 1,0 — que já é corrida. Na prática o jogador nunca andava
     inteiro: travava em 92 % e o passo seguinte era disparada. A caminhada
     passa a valer cheia a partir de `ANDAR_CHEIO` (0,85), e a corrida começa
     em `CORRER_TILT` (0,92): entre os dois há uma faixa real onde o polegar
     descansa andando a 100 % sem sair correndo.
     Se alguém igualar as duas constantes, este caso morre — e é para morrer:
     igualadas, andar cheio deixa de ser alcançável. */
  describe('a faixa entre andar cheio e correr', () => {
    const frente = m => mao('left', [0, 0, 0, -m], [false, false, false, false]);

    it('a caminhada chega a 100 % ANTES do batente de corrida', () => {
      assert.ok(ANDAR_CHEIO < CORRER_TILT,
        `ANDAR_CHEIO (${ANDAR_CHEIO}) tem que ser MENOR que CORRER_TILT (${CORRER_TILT}), senão andar cheio e correr começam no mesmo ponto`);
      const r = entrada.ler([frente(ANDAR_CHEIO)]);
      assert.ok(Math.abs(Math.hypot(r.andar.x, r.andar.y) - 1) < 1e-6,
        `na inclinada ${ANDAR_CHEIO} a caminhada deu ${Math.hypot(r.andar.x, r.andar.y).toFixed(3)}, não 1`);
      assert.equal(r.correr, false, `inclinada ${ANDAR_CHEIO} já disparou corrida`);
    });

    it('dentro da faixa anda cheio e NÃO corre', () => {
      const meio = (ANDAR_CHEIO + CORRER_TILT) / 2;
      const r = entrada.ler([frente(meio)]);
      assert.ok(Math.abs(Math.hypot(r.andar.x, r.andar.y) - 1) < 1e-6,
        `na inclinada ${meio.toFixed(3)} a caminhada não está cheia`);
      assert.equal(r.correr, false, `inclinada ${meio.toFixed(3)} disparou corrida antes do batente`);
    });

    it('no batente corre, e a caminhada não passa de 100 %', () => {
      const r = entrada.ler([frente(1)]);
      assert.equal(r.correr, true, 'o batente não disparou corrida');
      assert.ok(Math.hypot(r.andar.x, r.andar.y) <= 1 + 1e-6,
        'a caminhada passou de 100 % no batente');
    });

    it('abaixo da faixa a caminhada é proporcional — inclinar pouco anda pouco', () => {
      const r = entrada.ler([frente(0.5)]);
      const v = Math.hypot(r.andar.x, r.andar.y);
      assert.ok(v > 0.1 && v < 1,
        `inclinada 0,5 deu ${v.toFixed(3)}: a caminhada deixou de ser proporcional`);
    });
  });

  it('mão desconhecida é ignorada em vez de virar as duas', () => {
    const r = entrada.ler([mao('none', [0, 0, 1, -1])]);
    assert.deepEqual([r.andar.x, r.andar.y, r.girar], [0, 0, 0]);
  });
});
