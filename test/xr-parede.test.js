/* ================================================================
   QA — O PASSO FÍSICO QUE A PAREDE RECUSA (critério A6 c + C2).

   O JOGADOR ANDA NO QUARTO DELE E A PAREDE DO JOGO NÃO EXISTE LÁ. Três
   rodadas de validação bateram neste ponto, e as duas saídas erradas já
   foram medidas no produto:

   1. **A vista trava.** O passo saía do acumulado, a colisão empurrava
      `player.pos` de volta, e a cabeça era ARRASTADA junto: 3,00 m de
      caminhada real moviam a vista 0,82 m e depois nada. É a coisa que o
      Oculus BP proíbe com todas as letras ("The display should respond to
      the user's movements at all times, without exception") e a que mais
      rápido enjoa — o corpo diz que andou, o olho diz que não.
   2. **O colisor atravessa.** A correção seguinte devolveu o passo
      recusado ao MESMO acumulado que alimenta o colisor, e ele voltava
      pelo dreno no frame seguinte: pedido de 10 m contra estrutura, o
      colisor andou **10,9623 m** (validação de `fa9ed86`). Num jogo
      multijogador isso não é desconforto, é vetor de trapaça — andar
      fisicamente para dentro do muro e ver (e atirar) do outro lado.

   A SAÍDA ESCOLHIDA, E POR QUE ELA (docs/vr/referencia-locomocao.md §6):

   A cabeça ATRAVESSA — porque nada pode arrastar a vista de quem está de
   headset — e o "fora do mundo" é DESENHADO: a periferia fecha e a tela
   escurece conforme a cabeça entra no sólido. É o `head_behavior_mode`
   do Godot XR Tools, cujo DEFAULT é exatamente este ("Push away, pushes
   the player body away. **Fade, fades view to black**"), e a alternativa
   ("push away") é justamente empurrar o rig, que aqui é proibido por A6.

   E o passo recusado NÃO VOLTA PARA O COLISOR: ele vira separação
   cabeça↔corpo, que é o que alimenta o escurecimento. O colisor recebe só
   o passo físico do frame (~2 cm a 72 Hz), então a parede o segura.

   ================================================================
   O QUE ESTA RODADA ACRESCENTA (docs/vr/referencia-locomocao.md §7)

   A validação de `2d55610` mediu a cortina e achou que ela CHEGA TARDE:
   a vista ficava limpa até 1,10 m de separação, atrasada 0,33 s, e a
   separação não tinha teto (8,4140 m). Os limiares de então eram números
   de conforto e não tinham relação com o instante em que o mundo vaza.

   ESSE INSTANTE É GEOMETRIA, e é a régua desta suíte:

     RAIO_COLISOR = 0,42 m   (`player.radius`, game.js)
     NEAR         = 0,08 m   (`PerspectiveCamera(75, …, 0.08, 1000)`)
     VAZA         = 0,34 m   de separação — a face da parede cruza o plano
                             near e o outro lado aparece

   Os dois primeiros números NÃO são importados do módulo sob teste de
   propósito: um teste que confere a própria tabela vale para qualquer
   valor dela. O caso `a régua desta suíte é a do JOGO` no bloco de sessão
   lê os dois do produto e fica vermelho se alguém mudar um.

   PORTAS 3600 (só deste arquivo).
   ================================================================ */
'use strict';
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3600;

/* A GEOMETRIA DO JOGO, copiada como número (ver o cabeçalho). */
const RAIO_COLISOR = 0.42;
const NEAR = 0.08;
const VAZA = RAIO_COLISOR - NEAR;      // 0,34 m
/* Condição declarada da bancada: 72 Hz e 2 cm por frame = 1,44 m/s, que é
   caminhada rápida. Medição sem condição declarada não é medida. */
const DT = 1 / 72;
const PASSO_FIS = 0.02;

let THREE, createXrRig, createXrComfort, COMFORT;
before(async () => {
  THREE = await import('three');
  ({ createXrRig } = await import('../js/xr/xrrig.js'));
  COMFORT = await import('../js/xr/xrcomfort.js');
  ({ createXrComfort } = COMFORT);
});

/* O ESCURECIMENTO EFETIVO que chega na tela, seja qual for o uniform que o
   carregue. Ler um nome só amarraria o teste à implementação. */
function escuroDe(c) {
  const u = c.malha.material.uniforms;
  let v = 0;
  for (const k of ['escuro', 'parede']) if (u[k] && typeof u[k].value === 'number') v = Math.max(v, u[k].value);
  return v;
}

/* ================================================================
   1. O RIG — o passo recusado vira separação, não empurrão no colisor.
   ================================================================ */
describe('o passo que a parede recusa', () => {
  let scene, camera, xr;
  beforeEach(() => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, 1, NEAR, 1000);
    scene.add(camera);
    xr = createXrRig({ THREE, scene, camera });
    xr.enter();
    camera.position.set(0, 1.7, 0);
    xr.place(0, 0, 0, 0);       // primeira base
  });

  /* O CICLO DO game.js, na mesma ordem: place → consumirPasso →
     player.pos += passo → colisão → devolverPasso do que foi recusado.
     Reproduzir a ORDEM importa: foi ela que fez o colisor atravessar. */
  function andarContraParede({ metros, paredeX = 0.5, espessura = 0.25, passoFisico = PASSO_FIS, extraFrames = 60 }) {
    const player = { x: 0, z: 0 };
    const alvo = { x: 0, z: 0 };
    const frames = Math.round(metros / passoFisico) + extraFrames;
    const trilha = [];
    let cabecaFisica = 0;
    let entregue = 0;              // quanto o dreno ofereceu ao colisor, somado
    for (let f = 0; f < frames; f++) {
      if (f * passoFisico < metros) cabecaFisica = (f + 1) * passoFisico;
      camera.position.x = cabecaFisica;
      xr.place(player.x, 0, player.z, 0);
      xr.consumirPasso(alvo);
      const pedidoX = alvo.x, pedidoZ = alvo.z;
      const pedido = Math.hypot(pedidoX, pedidoZ);
      entregue += pedido;
      player.x += pedidoX; player.z += pedidoZ;
      const antesDaParede = player.x;
      /* A PAREDE É UM BLOCO COM ESPESSURA, E O EMPURRÃO É PELA FACE MAIS
         PRÓXIMA — como `Structures.collide`, que resolve pelo menor eixo. Um
         clamp perfeito (`if (x > parede) x = parede`) seria um dublê que
         NUNCA deixa atravessar: o teste passaria com o defeito reinjetado, e
         foi exatamente isso que aconteceu na primeira versão deste arquivo.
         Com face mais próxima, penetração maior que meia espessura empurra
         para o LADO ERRADO — que é como o colisor andou 10,9623 m no jogo. */
      if (player.x > paredeX && player.x < paredeX + espessura) {
        player.x = (player.x - paredeX) < (paredeX + espessura - player.x)
          ? paredeX : paredeX + espessura;
      }
      if (pedido > 1e-6) {
        const perdaX = antesDaParede - player.x;
        const proj = (perdaX * pedidoX) / (pedido * pedido);
        if (proj > 0) xr.devolverPasso(pedidoX * Math.min(1, proj), pedidoZ * Math.min(1, proj));
      }
      /* a cabeça DEPOIS do place deste frame: é o que o jogador enxerga */
      trilha.push({ cabeca: player.x + xr.passoPendente.x + xr.foraDoCorpo.x, colisor: player.x, fisica: cabecaFisica });
    }
    return { player, trilha, entregue, fora: xr.foraDoCorpo, pendente: xr.passoPendente };
  }

  it('A PAREDE SEGURA O COLISOR — pedido de 10 m e ele não passa', () => {
    /* O número que este caso trava é o do laudo de `fa9ed86`: 10 m pedidos,
       colisor andou 10,9623 m. Falha se o passo recusado voltar a ser
       oferecido ao colisor por qualquer caminho. */
    const r = andarContraParede({ metros: 10, paredeX: 0.5 });
    assert.ok(r.player.x <= 0.5 + 1e-9,
      `o colisor andou ${r.player.x.toFixed(4)} m contra uma parede a 0,50 m — atravessou`);
    /* E A CAUSA, medida direto, sem depender do modelo de parede: o total que
       o dreno OFERECEU ao colisor. Com o passo recusado voltando ao mesmo
       acumulado, cada frame oferece o teto de novo e a soma explode; sem ele,
       o oferecido é a caminhada física. Esta asserção é a que sobrevive a
       qualquer dublê de colisão. */
    assert.ok(r.entregue < 11,
      `o dreno ofereceu ${r.entregue.toFixed(2)} m ao colisor para uma caminhada de 10 m — ` +
      'o passo recusado está voltando para a fila do colisor');
  });

  it('a VISTA responde ao passo físico — até o teto, e só ele a segura', () => {
    /* O outro lado da mesma moeda, e o defeito que veio antes: a vista
       congelava (0,82 m de 3,00 m). Falha se alguém "consertar" o colisor
       arrastando a cabeça de volta.

       O TETO desta rodada (js/xr/xrrig.js) muda o número e não a regra: a
       vista responde até 1,00 m ALÉM do colisor e para ali, com a tela já
       preta desde 0,32 m. O caso "só para com a tela preta" é o de baixo. */
    const r = andarContraParede({ metros: 10, paredeX: 0.5 });
    const cabeca = r.trilha[r.trilha.length - 1].cabeca;
    assert.ok(cabeca > 1.4,
      `a vista andou ${cabeca.toFixed(4)} m: nem os 0,5 m até a parede mais o teto de 1,0 m`);
    /* e ANDOU O TEMPO TODO enquanto havia vista: um congelamento antes de a
       tela fechar não aparece no total */
    const meio = r.trilha[Math.floor(r.trilha.length * 0.05)].cabeca;
    assert.ok(meio > 0.3, `a vista parou logo no começo: ${meio.toFixed(3)} m no frame ${Math.floor(r.trilha.length * 0.05)}`);
  });

  it('a separação cabeça↔colisor tem TETO — e ele é o `max_head_distance` do Godot', () => {
    /* DEFEITO #1 do laudo de `2d55610`: `devolverPasso` fazia `foraX += dx`
       sem clamp e mediu 8,4140 m numa caminhada só (era 0,1331 m antes).
       Falha se o teto sumir ou subir. */
    const r = andarContraParede({ metros: 10, paredeX: 0.5 });
    const sep = Math.hypot(r.fora.x, r.fora.z);
    assert.ok(sep <= 1.0 + 1e-9,
      `10 m de caminhada física contra a parede separaram a cabeça do corpo em ${sep.toFixed(4)} m — ` +
      'sem teto o corpo do jogador fica arbitrariamente fundo dentro de geometria');
    /* e o teto é ALCANÇADO: um teto que nunca chega não é teto, é sorte */
    assert.ok(sep > 0.9, `a separação parou em ${sep.toFixed(4)} m e nem chegou perto do teto de 1,0 m`);
  });

  it('o teto NÃO rouba metros: entrar 3 m e sair 3 m devolve a cabeça ao lugar', () => {
    /* A armadilha do teto. Se o excedente for DESCARTADO, o jogador entra 3 m
       (a vista anda 1 m e congela) e sai 3 m (a vista anda 3 m para trás):
       ele termina 2 m atrás de onde começou, com o mundo deslocado por baixo
       dele. O excedente tem que virar DÍVIDA e ser pago na volta antes de a
       vista mexer. Falha nos dois erros: descartar e represar. */
    const r = andarContraParede({ metros: 3, paredeX: 0.5, extraFrames: 0 });
    const player = r.player;
    const alvo = { x: 0, z: 0 };
    const cabecaNoTopo = r.trilha[r.trilha.length - 1].cabeca;
    let cab = 3;
    for (let f = 0; f < 150; f++) {          // 3 m de volta, 2 cm por frame
      cab = Math.max(0, cab - PASSO_FIS);
      camera.position.x = cab;
      xr.place(player.x, 0, player.z, 0);
      xr.consumirPasso(alvo);
      const pedido = Math.hypot(alvo.x, alvo.z);
      player.x += alvo.x; player.z += alvo.z;
      /* A PAREDE CONTINUA LÁ NA VOLTA, e o ciclo continua sendo o do game.js.
         Sem o `devolverPasso` deste trecho, o escoamento do `fora` entrega
         passo ao colisor, a parede o recusa e o teste JOGA FORA um passo que o
         produto devolve — 0,56 m de erro que não existe no jogo. */
      const antes = player.x;
      if (player.x > 0.5) player.x = 0.5;
      if (pedido > 1e-6) {
        const perda = antes - player.x;
        const proj = (perda * alvo.x) / (pedido * pedido);
        if (proj > 0) xr.devolverPasso(alvo.x * Math.min(1, proj), alvo.z * Math.min(1, proj));
      }
    }
    const cabecaNoFim = player.x + xr.passoPendente.x + xr.foraDoCorpo.x;
    assert.ok(Math.abs(cabecaNoFim) < 0.25,
      `o jogador entrou 3 m e saiu 3 m e a cabeça terminou em ${cabecaNoFim.toFixed(4)} m ` +
      `(era 0,00 na saída; no fundo estava ${cabecaNoTopo.toFixed(4)} m) — o teto comeu ${Math.abs(cabecaNoFim).toFixed(4)} m de mundo`);
  });

  it('andar de VOLTA cancela a separação antes de mexer no colisor', () => {
    /* Sem isto o jogador sai de dentro da parede e o colisor dispara para
       trás junto — teleporte de colisor, que é a versão espelhada do defeito
       de atravessar. Falha se o passo de volta for entregue ao colisor
       enquanto ainda há separação (ou dívida) para pagar. */
    const r = andarContraParede({ metros: 3, paredeX: 0.5, extraFrames: 0 });
    const player = r.player;
    const colisorAntes = player.x;
    const alvo = { x: 0, z: 0 };
    let cab = 3;
    for (let f = 0; f < 100; f++) {          // 2 m de volta, 2 cm por frame
      cab = Math.max(1.0, cab - PASSO_FIS);
      camera.position.x = cab;
      xr.place(player.x, 0, player.z, 0);
      xr.consumirPasso(alvo);
      const pedido = Math.hypot(alvo.x, alvo.z);
      player.x += alvo.x; player.z += alvo.z;
      const antes = player.x;
      if (player.x > 0.5) player.x = 0.5;
      if (pedido > 1e-6) {
        const perda = antes - player.x;
        const proj = (perda * alvo.x) / (pedido * pedido);
        if (proj > 0) xr.devolverPasso(alvo.x * Math.min(1, proj), alvo.z * Math.min(1, proj));
      }
    }
    assert.ok(Math.abs(player.x - colisorAntes) < 0.20,
      `andar 2 m de volta moveu o colisor ${(player.x - colisorAntes).toFixed(4)} m — ` +
      'o passo de volta tinha que abater a separação, não empurrar o corpo');
  });

  it('quando o obstáculo SOME, o colisor caminha até debaixo da cabeça — sem salto', () => {
    /* A porta abre, a cidade cai, o carro sai da frente. O que estava fora
       tem que escoar de volta para o colisor, e devagar: despejar 1 m num
       frame é o teleporte de colisor que o anti-cheat de servidor vê como
       trapaça. Falha nos dois extremos — não escoar (colisor preso para
       sempre) e escoar de uma vez. */
    const r = andarContraParede({ metros: 3, paredeX: 0.5, extraFrames: 0 });
    const player = r.player;
    const cabeca = r.trilha[r.trilha.length - 1].cabeca;
    const alvo = { x: 0, z: 0 };
    let maiorSalto = 0;
    for (let f = 0; f < 1500; f++) {           // sem parede nenhuma agora
      xr.place(player.x, 0, player.z, 0);
      xr.consumirPasso(alvo);
      const d = Math.hypot(alvo.x, alvo.z);
      if (d > maiorSalto) maiorSalto = d;
      player.x += alvo.x; player.z += alvo.z;
    }
    assert.ok(player.x > cabeca - 0.1,
      `o obstáculo sumiu e o colisor ficou em ${player.x.toFixed(4)} m, com a cabeça em ${cabeca.toFixed(4)} m`);
    assert.ok(maiorSalto <= 0.155,
      `o colisor andou ${maiorSalto.toFixed(4)} m num frame só — teleporte`);
  });
});

/* ================================================================
   2. A CORTINA — ela tem que FECHAR ANTES de o outro lado aparecer.

   Bancada: 72 Hz, 2 cm de passo físico por frame (1,44 m/s), parede real
   com face em `FACE`, colisor de raio 0,42 empurrado pela face mais
   próxima. A cabeça de mundo é `colisor + passo + fora`, e a sonda de
   sólido é calculada da GEOMETRIA da bancada — não do módulo.
   ================================================================ */
describe('a cortina fecha antes de mostrar o outro lado', () => {
  const FACE = 3.0;               // face oeste do bloco, em mundo
  const ESP = 0.6;                // espessura do bloco
  const R_SONDA = 0.25;           // raio da sonda de cabeça (ver §7.3 do doc)

  /* Caminha fisicamente para +X contra o bloco e devolve a trilha inteira.
     `comSonda` liga a consulta de sólido na cabeça (a fiação do game.js). */
  function caminhada({ metros = 4, comSonda = true, alturaDoTopo = 99 } = {}) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, NEAR, 1000);
    scene.add(camera);
    const xr = createXrRig({ THREE, scene, camera });
    xr.enter();
    camera.position.set(0, 1.7, 0);
    xr.place(0, 0, 0, 0);
    const c = createXrComfort({ THREE, camera });
    c.anexar();

    const player = { x: 0, z: 0 };
    const alvo = { x: 0, z: 0 };
    const trilha = [];
    const frames = Math.round(metros / PASSO_FIS);
    for (let f = 0; f < frames; f++) {
      camera.position.x = (f + 1) * PASSO_FIS;
      xr.place(player.x, 0, player.z, 0);
      xr.consumirPasso(alvo);
      const pedido = Math.hypot(alvo.x, alvo.z);
      player.x += alvo.x; player.z += alvo.z;
      const antes = player.x;
      // colisão: o CENTRO do colisor não entra no bloco inflado pelo raio
      if (player.x > FACE - RAIO_COLISOR && player.x < FACE + ESP + RAIO_COLISOR) {
        player.x = (player.x - (FACE - RAIO_COLISOR)) < (FACE + ESP + RAIO_COLISOR - player.x)
          ? FACE - RAIO_COLISOR : FACE + ESP + RAIO_COLISOR;
      }
      if (pedido > 1e-6) {
        const perda = antes - player.x;
        const proj = (perda * alvo.x) / (pedido * pedido);
        if (proj > 0) xr.devolverPasso(alvo.x * Math.min(1, proj), alvo.z * Math.min(1, proj));
      }
      const cabecaX = player.x + xr.passoPendente.x + xr.foraDoCorpo.x;
      /* A SONDA, como `Structures.collide` a devolveria: o empurrão que uma
         esfera de R_SONDA na cabeça sofreria. `alturaDoTopo` abaixo da cabeça
         = parapeito, e aí a consulta não encontra nada (é a linha
         `pos.y >= by1 - 0.12` do collide). */
      const distanciaAteAFace = FACE - cabecaX;
      const perto = alturaDoTopo >= 1.7 ? Math.max(0, R_SONDA - distanciaAteAFace) : 0;
      const sonda = comSonda ? { m: perto, x: 1, z: 0 } : undefined;
      c.intrusao(DT, xr.foraDoCorpoM, sonda);
      trilha.push({
        f, sep: xr.foraDoCorpoM, escuro: escuroDe(c), cabecaX, colisor: player.x,
        fisica: camera.position.x,
        // o outro lado aparece quando a face cruza o plano near
        vazando: cabecaX > FACE - NEAR,
      });
    }
    return { trilha, xr, c, player };
  }

  it('A VISTA NUNCA FICA LIMPA DENTRO DO SÓLIDO — nem um frame', () => {
    /* O DEFEITO, com número: `2d55610` deixava a vista limpa de 0,27 m a
       1,10 m de separação (0,33 s). Nesta bancada o mesmo defeito mede a
       cortina preta só em 0,68 m, com 16 frames (0,222 s) de vista vazando.

       O que este caso cobra é geometria, não constante do módulo: o outro
       lado aparece quando a cabeça passa de `FACE − NEAR`. Falha se a
       cortina fechar UM frame depois disso. */
    const r = caminhada({ metros: 4 });
    const maus = r.trilha.filter(t => t.vazando && t.escuro < 0.98);
    const primeiro = maus[0];
    assert.equal(maus.length, 0,
      maus.length ? `${maus.length} frames (${(maus.length * DT).toFixed(3)} s) com a cabeça ` +
        `dentro do sólido e a tela ainda aberta — o primeiro em ${primeiro.sep.toFixed(4)} m de ` +
        `separação com escuro ${primeiro.escuro.toFixed(4)}; a vista vazou por ` +
        `${(maus[maus.length - 1].cabecaX - primeiro.cabecaX).toFixed(4)} m` : '');
  });

  it('O ATRASO DA CORTINA É ZERO — ela acompanha a geometria no mesmo frame', () => {
    /* A rampa temporal de 3/s custava 1/3 de segundo — 0,48 m a 1,44 m/s —
       e é a CAUSA do vazamento acima. Fechar acompanha a geometria; abrir é
       que mantém freio (o caso `sair da parede devolve a vista`).

       Medida da CAUSA, imune a dublê: entre o frame em que a separação passa
       do limiar de preto e o frame em que a tela está preta. */
    const r = caminhada({ metros: 4 });
    const preto = r.trilha.find(t => t.escuro >= 0.98);
    assert.ok(preto, 'a tela nunca ficou preta em 4 m de caminhada contra a parede');
    /* O último frame ANTES do preto já tinha separação suficiente? Se sim, o
       atraso é temporal e é defeito. Se não, o preto veio no primeiro frame
       possível — atraso zero. */
    const antes = r.trilha[preto.f - 1];
    const alvoDoAntes = antes ? antes.escuro : 0;
    assert.ok(!antes || alvoDoAntes < 0.98,
      'invariante do teste quebrada: o frame anterior ao primeiro preto já estava preto');
    /* A prova do atraso zero: rodar a MESMA separação por 200 frames e ver que
       o valor de regime já era o do PRIMEIRO frame. */
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(75, 1, NEAR, 1000);
    scene.add(cam);
    const c = createXrComfort({ THREE, camera: cam });
    c.anexar();
    c.intrusao(DT, preto.sep, { m: 0.25, x: 1, z: 0 });
    const umFrame = escuroDe(c);
    for (let i = 0; i < 200; i++) c.intrusao(DT, preto.sep, { m: 0.25, x: 1, z: 0 });
    const regime = escuroDe(c);
    assert.ok(regime - umFrame < 0.01,
      `um frame de ${preto.sep.toFixed(3)} m de separação deu ${umFrame.toFixed(4)} e o regime é ` +
      `${regime.toFixed(4)} — a cortina ainda tem rampa temporal no fechamento`);
  });

  it('ENCOSTAR DE LEVE NÃO ESCURECE NADA — a outra ponta, medida', () => {
    /* A armadilha desta rodada: trocar "chega tarde" por "pisca à toa".
       A separação em uso normal foi medida em 0,0131 m no pior frame de 1799
       (validação de `fa9ed86`) e 0,0083 m em 3840 frames de `2d55610`; o
       encosto de parede pica em 0,133 m. Falha se o limiar descer para
       dentro do uso normal. */
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(75, 1, NEAR, 1000);
    scene.add(cam);
    const c = createXrComfort({ THREE, camera: cam });
    c.anexar();
    /* AS DUAS FIAÇÕES, e isto não é zelo: com a sonda ligada a cabeça a
       0,13 m do corpo está 0,29 m longe da face e a PORTA fecha sozinha —
       o limiar de separação nem chega a ser exercido. A mutação
       `FORA_MIN = 0,10` passou por este caso enquanto ele só media o caminho
       com sonda. Sem sonda, quem protege é o limiar, e é ele que este laço
       cobra. */
    for (const comSonda of [false, true]) {
      for (const m of [0.0083, 0.0131, 0.05, 0.10, 0.13]) {
        const sonda = comSonda ? { m: Math.max(0, 0.25 - (RAIO_COLISOR - m)), x: 1, z: 0 } : undefined;
        for (let i = 0; i < 120; i++) c.intrusao(DT, m, sonda);
        assert.equal(escuroDe(c), 0,
          `${m.toFixed(4)} m de separação ${comSonda ? 'com' : 'SEM'} sonda escureceu ${escuroDe(c).toFixed(4)}`);
      }
    }
  });

  it('DEBRUÇAR SOBRE UM PARAPEITO NÃO APAGA A TELA — é gesto legítimo de VR', () => {
    /* O caso que a separação sozinha NÃO distingue: debruçar põe a cabeça
       0,3–0,6 m adiante do corpo, a mesma faixa de enfiar a cabeça na
       parede. O que separa os dois é o MUNDO — no parapeito a cabeça está no
       AR. É a consulta de sólido do Godot (`_head_shape_cast`), que esta base
       não tinha.

       Falha se a cortina voltar a ser só distância: com `2d55610` este gesto
       media escuro 0,8333. */
    const r = caminhada({ metros: 3.2, alturaDoTopo: 1.0 });   // mureta de 1 m
    const sepMax = Math.max(...r.trilha.map(t => t.sep));
    const escMax = Math.max(...r.trilha.map(t => t.escuro));
    assert.ok(sepMax > 0.45,
      `o gesto nem chegou a separar (${sepMax.toFixed(4)} m): a bancada não está medindo o caso`);
    assert.equal(escMax, 0,
      `debruçar ${sepMax.toFixed(2)} m sobre uma mureta de 1 m apagou a tela em ${escMax.toFixed(4)} — ` +
      'a cabeça estava no AR o tempo todo');
  });

  it('…mas o BATENTE de 1 m fecha a tela mesmo com a cabeça no ar', () => {
    /* O segundo gatilho do Godot (`max_head_distance`), e ele NÃO é vetado
       pela sonda de propósito: é ele que garante que a vista nunca congela
       com a tela aberta. Debruçar 0,6 m é gesto; empurrar o corpo 1 m contra
       uma mureta e continuar andando é o teto do rig chegando, e ali a tela
       tem de estar fechada. Falha se o batente sumir junto com a veto da
       sonda — seria vista congelada e mundo visível. */
    const r = caminhada({ metros: 4.2, alturaDoTopo: 1.0 });
    const noTeto = r.trilha.filter(t => t.sep > 0.98);
    assert.ok(noTeto.length > 5, `a bancada não chegou ao teto (${noTeto.length} frames)`);
    assert.ok(noTeto[noTeto.length - 1].escuro > 0.98,
      `a separação bateu no teto de 1,00 m com a tela em ${noTeto[noTeto.length - 1].escuro.toFixed(4)} — ` +
      'a vista congela e o jogador continua vendo o mundo');
  });

  it('SEM a sonda a cortina continua fechando — o padrão erra para o lado seguro', () => {
    /* A sonda é uma fiação do game.js. Se ela faltar (ou se a geometria não
       for de `Structures` — carro, helicóptero), a cortina cai no
       comportamento por separação. Falha se a ausência da sonda virar
       "nunca escurece", que seria espiar-parede em silêncio. */
    const r = caminhada({ metros: 4, comSonda: false });
    const maus = r.trilha.filter(t => t.vazando && t.escuro < 0.98);
    assert.equal(maus.length, 0,
      `sem sonda, ${maus.length} frames com a cabeça dentro do sólido e a tela aberta`);
  });

  it('A VISTA SÓ PARA DE RESPONDER COM A TELA JÁ PRETA', () => {
    /* O preço declarado do teto (A6 × C2). O teto congela a vista em 1,00 m
       de separação — e isso só é defensável porque a tela está preta desde
       0,32 m. Este caso mede a condição inteira: em TODO frame em que a
       cabeça andou menos que o aparelho, a tela tinha de estar preta.
       Falha se alguém subir o `FORA_MAX` acima do teto, ou baixar o teto. */
    const r = caminhada({ metros: 4 });
    let maus = 0, pior = null;
    for (let i = 1; i < r.trilha.length; i++) {
      const dCabeca = r.trilha[i].cabecaX - r.trilha[i - 1].cabecaX;
      const dAparelho = r.trilha[i].fisica - r.trilha[i - 1].fisica;
      if (dAparelho - dCabeca > 1e-4 && r.trilha[i].escuro < 0.99) {
        maus++;
        if (!pior || r.trilha[i].escuro < pior.escuro) pior = r.trilha[i];
      }
    }
    assert.equal(maus, 0,
      pior ? `${maus} frames em que a vista deixou de acompanhar o aparelho com a tela em ` +
        `${pior.escuro.toFixed(4)} (separação ${pior.sep.toFixed(4)} m)` : '');
  });

  it('sair da parede devolve a vista, e rápido — mas sem flash', () => {
    /* Falha nos dois extremos: preto preso (o pior estado possível dentro de
       um headset) e abertura instantânea (flash de luz na cara de quem está
       no escuro). A taxa de abertura é a do Godot XR Tools, `delta * 3.0`. */
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(75, 1, NEAR, 1000);
    scene.add(cam);
    const c = createXrComfort({ THREE, camera: cam });
    c.anexar();
    for (let i = 0; i < 200; i++) c.intrusao(DT, 0.55, { m: 0.25, x: 1, z: 0 });
    assert.ok(escuroDe(c) > 0.98, 'a bancada não chegou ao preto');
    let frames = 0;
    while (escuroDe(c) > 0.001 && frames < 400) { c.intrusao(DT, 0, { m: 0, x: 0, z: 0 }); frames++; }
    assert.ok(escuroDe(c) <= 0.001, `a tela ficou presa no escuro (${escuroDe(c).toFixed(4)})`);
    assert.ok(frames / 72 < 0.6, `levou ${(frames / 72).toFixed(2)} s para devolver a vista`);
    assert.ok(frames >= 15, `a vista voltou em ${(frames / 72).toFixed(3)} s — abertura instantânea é flash`);
  });
});

/* ================================================================
   3. A CORTINA EXPLICA — direção da parede e grade tipo Guardian.
   ================================================================ */
describe('a cortina explica o que está acontecendo', () => {
  let camera, c;
  beforeEach(() => {
    const scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, 1, NEAR, 1000);
    scene.add(camera);
    c = createXrComfort({ THREE, camera });
    c.anexar();
  });

  it('o escuro nasce DO LADO DA PAREDE, e a direção acompanha a cabeça', () => {
    /* Preto liso não explica nada; quem está lá dentro precisa saber de que
       lado veio. A direção vem de graça da sonda. Falha se a cortina for
       sempre simétrica (não há para onde voltar) ou se a direção ficar
       presa no mundo enquanto o jogador vira a cabeça. */
    c.intrusao(1 / 72, 0.25, { m: 0.12, x: 1, z: 0 });   // parede a +X do mundo
    const u = c.malha.material.uniforms;
    assert.ok(u.ladoParede, 'não existe uniform de direção da parede');
    const olhandoPraFrente = u.ladoParede.value.clone();
    /* De cara para −Z (identidade), uma parede em +X do mundo fica à direita:
       em espaço de VISTA isso é +X. */
    assert.ok(olhandoPraFrente.x > 0.9,
      `a parede está em +X do mundo e o uniform aponta para ${olhandoPraFrente.toArray().map(v => v.toFixed(2))}`);
    /* Agora o jogador vira 90° para a direita (olha para +X): a parede passa a
       ficar à FRENTE, que em vista é −Z. */
    camera.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
    camera.updateMatrixWorld(true);
    c.intrusao(1 / 72, 0.25, { m: 0.12, x: 1, z: 0 });
    const virado = u.ladoParede.value.clone();
    assert.ok(virado.z < -0.9,
      'o jogador virou para a parede e a direção da cortina não acompanhou: ' +
      `${virado.toArray().map(v => v.toFixed(2))}`);
  });

  it('a grade acende com a cortina — e SÓ com ela', () => {
    /* A grade é o que distingue "o jogo pôs uma barreira aqui" de "a tela
       apagou". Falha se ela aparecer no túnel de corrida ou na piscada do
       giro, que são conforto e não barreira. */
    const u = c.malha.material.uniforms;
    assert.ok(u.grade, 'não existe uniform de grade');
    c.update(1 / 72, 8, 8.6, 0);   // correndo: túnel cheio
    for (let i = 0; i < 200; i++) c.update(1 / 72, 8, 8.6, 3);
    c.piscar();
    c.update(1 / 72, 8, 8.6, 3);
    assert.equal(u.grade.value, 0,
      `o túnel de corrida e a piscada do giro acenderam a grade em ${u.grade.value.toFixed(3)}`);
    for (let i = 0; i < 60; i++) c.intrusao(1 / 72, 0.55, { m: 0.25, x: 1, z: 0 });
    assert.ok(u.grade.value > 0.5,
      `a cortina fechou e a grade ficou em ${u.grade.value.toFixed(3)}`);
  });

  it('o túnel de andar continua funcionando junto, sem um apagar o outro', () => {
    /* Os dois moram na mesma malha e no mesmo shader. Falha se a cortina
       sobrescrever o túnel (ou vice-versa) — a vinheta de corrida sumiria
       toda vez que o jogador encostasse num muro. */
    for (let i = 0; i < 200; i++) { c.update(1 / 72, 8, 8.6, 0); c.intrusao(1 / 72, 0.55, { m: 0.25, x: 1, z: 0 }); }
    assert.ok(c.tunel > 0.5, `o túnel de corrida sumiu quando a cortina acendeu: ${c.tunel.toFixed(3)}`);
    assert.ok(escuroDe(c) > 0.98, `a cortina sumiu quando o túnel acendeu: ${escuroDe(c).toFixed(4)}`);
  });

  it('DESLIGAR A VINHETA não desliga isto — integridade do mundo não é preferência', () => {
    /* A vinheta de conforto é escolha do jogador. A cortina de intrusão não
       é: ela é o que impede ver e atirar do outro lado da parede depois de
       andar fisicamente para dentro dela. Falha se o `soltar()` do painel
       levar a cortina junto. */
    c.soltar();
    for (let i = 0; i < 200; i++) c.intrusao(1 / 72, 0.55, { m: 0.25, x: 1, z: 0 });
    assert.ok(escuroDe(c) > 0.98, `com a vinheta desligada a cortina deu ${escuroDe(c).toFixed(4)}`);
    assert.equal(c.malha.visible, true, 'com a vinheta desligada a malha da cortina sumiu da cena');
  });
});

/* ================================================================
   4. A EXCEÇÃO DECLARADA — C2 perde para A6, e isso é uma DECISÃO.

   O laudo de `2d55610` não reprovou a escolha; reprovou ela estar em
   prosa de comentário enquanto A4 tem `EXCECOES` em código, com motivo,
   custo e condição de validade. Aqui a condição vira teste.
   ================================================================ */
describe('a troca A6 × C2 é exceção declarada, com amarra em código', () => {
  it('a auditoria devolve a exceção de C2 com motivo, custo e condição', () => {
    const a = COMFORT.auditarIntrusao();
    assert.ok(a.ok, `a auditoria da cortina reprovou: ${JSON.stringify(a.faltas)}`);
    const e = a.excecoes.find(x => x.criterio === 'C2');
    assert.ok(e, 'a troca A6 × C2 continua sem exceção declarada — é o que o laudo reprovou');
    assert.ok(e.porque && e.porque.length > 120, 'a exceção de C2 não tem motivo escrito');
    assert.ok(e.custo && e.custo.length > 80, 'a exceção de C2 não tem custo escrito');
    assert.equal(typeof e.vale, 'function', 'a exceção de C2 não tem amarra em código');
  });

  it('a amarra CAI se a cortina deixar de fechar antes do teto', () => {
    /* A condição de validade inteira da exceção: o teto de separação só é
       defensável porque a tela está preta MUITO antes dele. Se alguém subir
       `FORA_MAX` para perto (ou acima) do teto, a exceção deixa de valer
       sozinha e a auditoria fica vermelha — sem depender de ninguém lembrar.
       Falha se `vale` for `() => true` disfarçado. */
    const e = COMFORT.auditarIntrusao().excecoes.find(x => x.criterio === 'C2');
    assert.equal(e.vale({ pretoEm: 0.32, teto: 1.00, vazaEm: VAZA }), true);
    assert.equal(e.vale({ pretoEm: 0.99, teto: 1.00, vazaEm: VAZA }), false,
      'a cortina fechando só no teto ainda passa pela amarra');
    assert.equal(e.vale({ pretoEm: 0.40, teto: 1.00, vazaEm: VAZA }), false,
      'a cortina fechando DEPOIS do vazamento ainda passa pela amarra');
  });

  it('a auditoria reprova se a cortina passar do ponto de vazamento', () => {
    /* A auditoria roda contra a geometria do JOGO (raio do colisor e near),
       não contra a própria tabela. Falha se ela for tautológica. */
    const a = COMFORT.auditarIntrusao({ raioColisor: RAIO_COLISOR, near: 0.30 });
    assert.equal(a.ok, false,
      'com o near em 0,30 m o vazamento começa em 0,12 m e a cortina de 0,32 m chega tarde — ' +
      'a auditoria aprovou mesmo assim');
    assert.ok(a.faltas.some(f => f.criterio === 'A6c'), `faltas: ${JSON.stringify(a.faltas)}`);
  });
});

/* ================================================================
   5. O PRODUTO — sessão immersive-vr de verdade, contra sólido do mapa.
   ================================================================ */
describe('dentro da sessão: a parede segura o corpo e escurece a vista',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => { h = await bootEmVR(bootGame, { port: PORT }); });
    after(async () => { if (h) await h.close(); });

    it('a régua desta suíte é a do JOGO — raio do colisor e near', async () => {
      /* Os testes de unidade acima copiam 0,42 e 0,08 como número. Este caso é
         o que impede a cópia de virar mentira: se o jogo mudar o raio do
         colisor ou o near da câmera, o ponto de vazamento muda e esta suíte
         inteira passa a medir a coisa errada. */
      const r = await h.play(() => ({
        raio: window.__MP.player.radius, near: window.__MP.camera.near,
      }));
      assert.equal(r.raio, RAIO_COLISOR,
        `o colisor do jogador é ${r.raio} m e a suíte mede com ${RAIO_COLISOR} m`);
      assert.equal(r.near, NEAR,
        `o near da câmera é ${r.near} m e a suíte mede com ${NEAR} m`);
    });

    it('a receita canônica de C2 não acende a cortina — 2 m × 2 m, 30 s', async () => {
      /* A outra ponta, no produto: o passeio de sala que o critério C2 manda
         medir. Se a cortina piscar aqui, trocamos um defeito por outro pior.
         E o pico de separação é o próprio C2: teto de 0,10 m. */
      const r = await h.play(async () => {
        const G = window.__game, MP = window.__MP, A = window.__A, dev = window.__xrEmulado;
        /* campo aberto: longe de qualquer estrutura */
        let livre = null;
        for (let t = 0; t < 200 && !livre; t++) {
          const x = -300 + t * 3, z = -260;
          const perto = (G.Structures.walls || []).some(w => !w.noCollide
            && x > w.x0 - 6 && x < w.x1 + 6 && z > w.z0 - 6 && z < w.z1 + 6);
          if (!perto) livre = { x, z };
        }
        if (!livre) return { semCampo: true };
        MP.player.pos.set(livre.x, MP.groundAt(livre.x, livre.z, 100), livre.z);
        MP.player.vel.set(0, 0, 0);
        const sujeira = G.XR.foraDoCorpo;
        A.solta();
        dev.position.set(0, 1.7, 0);
        await A.espera(600);
        let sepMax = 0, escMax = 0, n = 0;
        const amostra = () => {
          const cab = G.XR.headWorldPosition(new MP.THREE.Vector3());
          sepMax = Math.max(sepMax, Math.hypot(cab.x - MP.player.pos.x, cab.z - MP.player.pos.z));
          const u = G.XR.conforto.malha && G.XR.conforto.malha.material.uniforms;
          if (u) escMax = Math.max(escMax, u.escuro.value, u.parede ? u.parede.value : 0);
          n++;
        };
        /* quatro cantos de um quadrado de 2 m, 0,5 m/s (a receita do §C2) */
        const cantos = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
        for (let i = 1; i < cantos.length; i++) {
          const [ax, az] = cantos[i - 1], [bx, bz] = cantos[i];
          for (let s = 1; s <= 40; s++) {
            dev.position.set(ax + (bx - ax) * s / 40, 1.7, az + (bz - az) * s / 40);
            await A.espera(25);
            amostra();
          }
        }
        return { sepMax, escMax, n, sujeira };
      });
      assert.ok(!r.semCampo, 'não achei campo aberto para o passeio de C2');
      assert.ok(r.n > 100, `só ${r.n} amostras no passeio`);
      assert.ok(r.sujeira < 0.05,
        `o passeio começou com ${r.sujeira.toFixed(4)} m de separação herdada de outro caso — ` +
        'a medida de C2 estaria contaminada');
      console.log(`      passeio C2: separação máx ${r.sepMax.toFixed(4)} m · cortina máx ${r.escMax.toFixed(4)} em ${r.n} amostras`);
      assert.equal(r.escMax, 0,
        `o passeio de sala acendeu a cortina em ${r.escMax.toFixed(4)} — escurecer quem só está jogando`);
      assert.ok(r.sepMax <= 0.10,
        `pico de separação ${r.sepMax.toFixed(4)} m no passeio canônico, contra o teto de 0,10 m de C2`);
    });

    it('10 m de caminhada física contra estrutura: colisor preso, vista fechada', async () => {
      const r = await h.play(async () => {
        const G = window.__game, MP = window.__MP, A = window.__A, dev = window.__xrEmulado;
        const T = MP.THREE;
        /* planta o jogador 1,2 m a oeste da face oeste de um sólido grande */
        const ws = G.Structures.walls || [];
        let alvo = null, dm = Infinity;
        for (const w of ws) {
          if (w.noCollide) continue;
          if (w.y1 - w.y0 < 2 || Math.min(w.x1 - w.x0, w.z1 - w.z0) < 1) continue;
          const d = Math.hypot((w.x0 + w.x1) / 2 - MP.player.pos.x, (w.z0 + w.z1) / 2 - MP.player.pos.z);
          if (d < dm) { dm = d; alvo = w; }
        }
        if (!alvo) return { semParede: true };
        const zc = (alvo.z0 + alvo.z1) / 2;
        MP.player.pos.set(alvo.x0 - 1.2, MP.groundAt(alvo.x0 - 1.2, zc, 100), zc);
        MP.player.vel.set(0, 0, 0);

        /* AMOSTRA A VISTA COMO ELA VAI PARA A TELA: rig deste frame × pose de
           olho deste frame. `camera.getWorldPosition()` compõe rig(N) com a
           pose(N−1) e já fez um teste desta base passar por acidente. */
        const xrCam = MP.renderer.xr.getCamera();
        const _m = new T.Matrix4(), olho = new T.Vector3();
        const orig = G.XR.place.bind(G.XR);
        const trilha = [];

        /* A FIAÇÃO É DO JOGO, E ISSO É COBRADO. A rodada passada embrulhou
           `intrusao` e, se o jogo não chamasse, o TESTE chamava — e aprovava.
           Aqui o embrulho só CONTA; quem não chamar fica vermelho no assert. */
        let doJogo = 0, comSonda = 0;
        const intrusaoOrig = G.XR.conforto.intrusao.bind(G.XR.conforto);
        G.XR.conforto.intrusao = (dt, m, sonda) => {
          doJogo++;
          if (sonda !== undefined && sonda !== null) comSonda++;
          return intrusaoOrig(dt, m, sonda);
        };
        G.XR.place = (...a) => {
          const v = orig(...a);
          G.XR.rig.updateMatrixWorld(true);
          _m.multiplyMatrices(G.XR.rig.matrixWorld, xrCam.cameras[0].matrix);
          olho.setFromMatrixPosition(_m);
          const sep = Math.hypot(olho.x - MP.player.pos.x, olho.z - MP.player.pos.z);
          const u = G.XR.conforto.malha && G.XR.conforto.malha.material.uniforms;
          const esc = u ? Math.max(u.escuro.value, u.parede ? u.parede.value : 0) : 0;
          trilha.push({ ex: olho.x, ez: olho.z, px: MP.player.pos.x, pz: MP.player.pos.z, sep, escuro: esc });
          return v;
        };
        A.solta();
        dev.position.set(0, 1.7, 0);
        await A.espera(600);
        trilha.length = 0;
        for (let i = 1; i <= 500; i++) {      // 10 m em degraus de 2 cm
          dev.position.set(i * 0.02, 1.7, 0);
          await A.espera(12);
        }
        await A.espera(500);
        G.XR.place = orig;
        G.XR.conforto.intrusao = intrusaoOrig;
        const a = trilha[0], b = trilha[trilha.length - 1];
        /* o outro lado aparece quando a separação passa de raio − near */
        const vaza = MP.player.radius - MP.camera.near;
        const maus = trilha.filter(t => t.sep > vaza && t.escuro < 0.98);
        return {
          vista: Math.hypot(b.ex - a.ex, b.ez - a.ez),
          colisor: Math.hypot(b.px - a.px, b.pz - a.pz),
          escuroMax: Math.max(...trilha.map(t => t.escuro)),
          sepMax: Math.max(...trilha.map(t => t.sep)),
          vaza, vazando: maus.length, sepDoPrimeiroVazamento: maus.length ? maus[0].sep : 0,
          fiacaoDoJogo: doJogo, fiacaoComSonda: comSonda,
          frames: trilha.length,
        };
      });
      assert.ok(!r.semParede, 'não achei sólido nenhum perto do spawn para medir');
      assert.ok(r.frames > 100, `só ${r.frames} frames de amostra — a medida está cega`);
      console.log(`      vista ${r.vista.toFixed(4)} m · colisor ${r.colisor.toFixed(4)} m · ` +
        `separação máx ${r.sepMax.toFixed(4)} m · escuro máx ${r.escuroMax.toFixed(4)} · ` +
        `vazamento em ${r.vazando} frames · chamadas de intrusão ${r.fiacaoDoJogo} (${r.fiacaoComSonda} com sonda)`);
      /* (0) A FIAÇÃO É DO JOGO. Sem assert, o teste vira a fiação e aprova —
         foi a quinta ocorrência histórica, e o laudo pegou. */
      assert.ok(r.fiacaoDoJogo > 100,
        `o game.js chamou XR.conforto.intrusao ${r.fiacaoDoJogo} vezes em ${r.frames} frames — ` +
        'a linha de fiação não está no jogo');
      /* (1) A PAREDE SEGURA O CORPO. Medido em `fa9ed86`: 10,9623 m. */
      assert.ok(r.colisor < 2.0,
        `o colisor andou ${r.colisor.toFixed(4)} m contra a parede — atravessou (vetor de trapaça)`);
      /* (2) A SEPARAÇÃO TEM TETO. Medido em `2d55610`: 8,4140 m. */
      assert.ok(r.sepMax <= 1.05,
        `a separação chegou a ${r.sepMax.toFixed(4)} m — o teto de 1,00 m não está valendo no produto`);
      /* (3) A VISTA FECHA ANTES DO OUTRO LADO. Medido em `2d55610`: limpa até
         1,10 m de separação, com o vazamento começando em 0,34 m. */
      assert.equal(r.vazando, 0,
        `${r.vazando} frames com a cabeça além de ${r.vaza.toFixed(2)} m (o ponto em que a face ` +
        `cruza o near) e a tela ainda aberta — o primeiro em ${r.sepDoPrimeiroVazamento.toFixed(4)} m`);
      assert.ok(r.escuroMax > 0.98,
        `a cabeça entrou metros adentro do sólido e a tela escureceu só ${r.escuroMax.toFixed(4)}`);
    });

    it('a cortina é escura DE VERDADE na tela — e do lado da parede (pixels)', async () => {
      /* Uniform certo com shader errado é o defeito que nenhum teste de
         unidade pega. Aqui o shader roda na GPU do navegador e os PIXELS são
         lidos: no fim a tela é opaca e escura; no meio, o lado da parede é
         mais escuro que o lado oposto. */
      const r = await h.play(async () => {
        const MP = window.__MP, T = MP.THREE;
        const { createXrComfort } = await import('/js/xr/xrcomfort.js');
        const cam = new T.PerspectiveCamera(90, 1, 0.05, 10);
        const cena = new T.Scene();
        cena.add(cam);
        const c = createXrComfort({ THREE: T, camera: cam });
        c.anexar();
        const alvo = new T.WebGLRenderTarget(64, 64);
        const buf = new Uint8Array(64 * 64 * 4);
        /* A SESSÃO XR TEM DE SAIR DO CAMINHO. `WebGLRenderer.render` troca a
           câmera recebida pela ArrayCamera do headset quando `xr.isPresenting`,
           e desenha os dois olhos em viewports — o alvo sairia com metade da
           tela por olho e a geometria de outra câmera. Desligar a bandeira em
           volta de um bloco SÍNCRONO não deixa nenhum frame do jogo passar no
           meio. Sem isto a medida lê o lado errado como escuro, que foi o
           primeiro resultado desta bancada. */
        const xrAntes = MP.renderer.xr.enabled;
        MP.renderer.xr.enabled = false;
        const media = (x0, x1) => {
          MP.renderer.setRenderTarget(alvo);
          MP.renderer.clear();
          MP.renderer.render(cena, cam);
          MP.renderer.readRenderTargetPixels(alvo, 0, 0, 64, 64, buf);
          MP.renderer.setRenderTarget(null);
          let s = 0, n = 0;
          for (let y = 24; y < 40; y++) {
            for (let x = x0; x < x1; x++) { const i = (y * 64 + x) * 4; s += buf[i] + buf[i + 1] + buf[i + 2]; n += 3; }
          }
          return s / n;
        };
        /* fundo branco para medir OCLUSÃO, e não a cor do céu */
        cena.background = new T.Color(0xffffff);
        const limpo = media(0, 64);
        /* meia cortina, parede à ESQUERDA da vista (−X de vista) */
        c.intrusao(1 / 72, 0.24, { m: 0.09, x: -1, z: 0 });
        const esq = media(2, 18), dir = media(46, 62);
        /* cortina cheia */
        for (let i = 0; i < 90; i++) c.intrusao(1 / 72, 0.60, { m: 0.25, x: -1, z: 0 });
        const cheia = media(0, 64);
        MP.renderer.xr.enabled = xrAntes;
        alvo.dispose();
        return { limpo, esq, dir, cheia };
      });
      console.log(`      pixels: limpo ${r.limpo.toFixed(1)} · meia cortina esq ${r.esq.toFixed(1)} / dir ${r.dir.toFixed(1)} · cheia ${r.cheia.toFixed(1)}`);
      assert.ok(r.limpo > 200, `sem cortina a tela já estava escura (${r.limpo.toFixed(1)}) — a bancada não mede nada`);
      assert.ok(r.cheia < 40, `com a cortina cheia a tela ficou em ${r.cheia.toFixed(1)} de 255 — não oclui`);
      assert.ok(r.esq < r.dir - 20,
        `a parede estava à esquerda e o lado esquerdo (${r.esq.toFixed(1)}) não ficou mais escuro ` +
        `que o direito (${r.dir.toFixed(1)}) — a cortina não diz de que lado veio`);
    });
  });
