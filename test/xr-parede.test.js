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

   PORTAS 3546 (só deste arquivo).
   ================================================================ */
'use strict';
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3546;

let THREE, createXrRig, createXrComfort;
before(async () => {
  THREE = await import('three');
  ({ createXrRig } = await import('../js/xr/xrrig.js'));
  ({ createXrComfort } = await import('../js/xr/xrcomfort.js'));
});

/* ================================================================
   1. O RIG — o passo recusado vira separação, não empurrão no colisor.
   ================================================================ */
describe('o passo que a parede recusa', () => {
  let scene, camera, xr;
  beforeEach(() => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, 1, 0.08, 1000);
    scene.add(camera);
    xr = createXrRig({ THREE, scene, camera });
    xr.enter();
    camera.position.set(0, 1.7, 0);
    xr.place(0, 0, 0, 0);       // primeira base
  });

  /* O CICLO DO game.js, na mesma ordem: place → consumirPasso →
     player.pos += passo → colisão → devolverPasso do que foi recusado.
     Reproduzir a ORDEM importa: foi ela que fez o colisor atravessar. */
  function andarContraParede({ metros, paredeX = 0.5, espessura = 0.25, passoFisico = 0.02, extraFrames = 60 }) {
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
      trilha.push({ cabeca: player.x + xr.passoPendente.x + xr.foraDoCorpo.x, colisor: player.x });
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

  it('…e a VISTA anda os 10 m, porque a parede não existe no quarto do jogador', () => {
    /* O outro lado da mesma moeda, e o defeito que veio antes: a vista
       congelava (0,82 m de 3,00 m). Falha se alguém "consertar" o colisor
       arrastando a cabeça de volta. */
    const r = andarContraParede({ metros: 10, paredeX: 0.5 });
    const cabeca = r.trilha[r.trilha.length - 1].cabeca;
    assert.ok(cabeca > 9.5,
      `a vista andou ${cabeca.toFixed(4)} m dos 10 m que o jogador andou de verdade`);
    /* e ANDOU O TEMPO TODO: um congelamento no meio não aparece no total */
    const meio = r.trilha[Math.floor(r.trilha.length * 0.6)].cabeca;
    const fim = r.trilha[r.trilha.length - 1].cabeca;
    assert.ok(fim - meio > 0.5,
      `a vista parou no meio do caminho: ${meio.toFixed(3)} m → ${fim.toFixed(3)} m`);
  });

  it('a separação cabeça↔colisor É o passo recusado, e não some no ar', () => {
    /* É este número que alimenta o escurecimento. Falha se o recusado for
       descartado (a cabeça seria arrastada) ou represado no dreno (o colisor
       teleportaria quando o obstáculo sumisse). */
    const r = andarContraParede({ metros: 3, paredeX: 0.5 });
    const sep = Math.hypot(r.fora.x + r.pendente.x, r.fora.z + r.pendente.z);
    assert.ok(Math.abs(sep - 2.5) < 0.15,
      `o jogador andou 3 m com a parede a 0,5 m: a separação devia ser ~2,5 m e deu ${sep.toFixed(4)} m`);
  });

  it('andar de VOLTA cancela a separação antes de mexer no colisor', () => {
    /* Sem isto o jogador sai de dentro da parede e o colisor dispara para
       trás junto — teleporte de colisor, que é a versão espelhada do defeito
       de atravessar. Falha se o passo de volta for entregue ao colisor
       enquanto ainda há separação para pagar. */
    const r = andarContraParede({ metros: 3, paredeX: 0.5, extraFrames: 0 });
    const player = r.player;
    const colisorAntes = player.x;
    const alvo = { x: 0, z: 0 };
    let cab = 3;
    for (let f = 0; f < 100; f++) {          // 2 m de volta, 2 cm por frame
      cab = Math.max(1.0, cab - 0.02);
      camera.position.x = cab;
      xr.place(player.x, 0, player.z, 0);
      xr.consumirPasso(alvo);
      player.x += alvo.x; player.z += alvo.z;
      if (player.x > 0.5) player.x = 0.5;
    }
    /* A tolerância não é 0: o escoamento do `fora` (0,006 m por frame, para o
       caso de o obstáculo sumir) entrega alguns centímetros ao colisor nesses
       100 frames, e o dreno tem resíduo. O que este caso pega é o DEFEITO, que
       tem a ordem de grandeza da caminhada inteira — 2 m, não 2 cm. */
    assert.ok(Math.abs(player.x - colisorAntes) < 0.20,
      `andar 2 m de volta moveu o colisor ${(player.x - colisorAntes).toFixed(4)} m — ` +
      'o passo de volta tinha que abater a separação, não empurrar o corpo');
    const sep = Math.hypot(xr.foraDoCorpo.x + xr.passoPendente.x, xr.foraDoCorpo.z + xr.passoPendente.z);
    assert.ok(sep < 0.7, `sobrou ${sep.toFixed(4)} m de separação depois de 2 m de volta`);
  });

  it('quando o obstáculo SOME, o colisor caminha até debaixo da cabeça — sem salto', () => {
    /* A porta abre, a cidade cai, o carro sai da frente. O que estava fora
       tem que escoar de volta para o colisor, e devagar: despejar 2,5 m num
       frame é o teleporte de colisor que o anti-cheat de servidor vê como
       trapaça. Falha nos dois extremos — não escoar (colisor preso para
       sempre) e escoar de uma vez. */
    const r = andarContraParede({ metros: 3, paredeX: 0.5, extraFrames: 0 });
    const player = r.player;
    const alvo = { x: 0, z: 0 };
    let maiorSalto = 0;
    for (let f = 0; f < 900; f++) {           // sem parede nenhuma agora
      xr.place(player.x, 0, player.z, 0);
      xr.consumirPasso(alvo);
      const d = Math.hypot(alvo.x, alvo.z);
      if (d > maiorSalto) maiorSalto = d;
      player.x += alvo.x; player.z += alvo.z;
    }
    assert.ok(player.x > 2.5,
      `o obstáculo sumiu e o colisor ficou em ${player.x.toFixed(4)} m, com a cabeça em 3,00 m`);
    assert.ok(maiorSalto <= 0.155,
      `o colisor andou ${maiorSalto.toFixed(4)} m num frame só — teleporte`);
  });
});

/* ================================================================
   2. O ESCURECIMENTO — "fora do mundo" desenhado (three de verdade).
   ================================================================ */
describe('o fora do mundo é desenhado, não escondido', () => {
  let camera, c;
  beforeEach(() => {
    camera = new THREE.PerspectiveCamera(75, 1, 0.08, 1000);
    c = createXrComfort({ THREE, camera });
    c.anexar();
  });

  const escuro = () => c.malha.material.uniforms.escuro.value;

  it('encostar de leve não escurece nada', () => {
    /* A separação em uso normal foi medida em 0,0131 m no pior frame de
       1799 (validação de `fa9ed86`), e o encosto de parede pica em 0,133 m.
       Escurecer aí seria piscar a tela para quem só está jogando. Falha se
       o limiar descer para dentro do uso normal. */
    for (let i = 0; i < 120; i++) c.intrusao(1 / 72, 0.13);
    assert.equal(escuro(), 0, `0,13 m de separação escureceu ${escuro().toFixed(4)}`);
  });

  it('meio metro dentro do sólido leva a tela ao preto', () => {
    /* Meio metro é a cabeça DO OUTRO LADO de uma parede de jogo. Falha se o
       fade parar no meio — cinza translúcido é espiar-parede com filtro. */
    for (let i = 0; i < 200; i++) c.intrusao(1 / 72, 0.55);
    assert.ok(escuro() > 0.98, `com 0,55 m dentro da parede a tela ficou em ${escuro().toFixed(4)}`);
    assert.equal(c.malha.visible, true, 'a malha do fade não está sendo desenhada');
  });

  it('o fade é PROGRESSIVO: 0,3 m escurece menos que 0,45 m', () => {
    /* Falha se virar liga-desliga: um corte seco no meio da caminhada é o
       mesmo solavanco que a vinheta existe para evitar. */
    for (let i = 0; i < 200; i++) c.intrusao(1 / 72, 0.30);
    const meio = escuro();
    for (let i = 0; i < 200; i++) c.intrusao(1 / 72, 0.45);
    const mais = escuro();
    assert.ok(meio > 0.05 && meio < 0.9, `0,30 m deu ${meio.toFixed(4)} — nem começou, nem é preto`);
    assert.ok(mais > meio + 0.15, `0,45 m (${mais.toFixed(4)}) não escureceu mais que 0,30 m (${meio.toFixed(4)})`);
  });

  it('sair da parede devolve a vista, e rápido', () => {
    /* Falha se o preto ficar preso: tela preta que não abre é o pior estado
       possível dentro de um headset. */
    for (let i = 0; i < 200; i++) c.intrusao(1 / 72, 0.55);
    let frames = 0;
    while (escuro() > 0.001 && frames < 400) { c.intrusao(1 / 72, 0); frames++; }
    assert.ok(escuro() <= 0.001, `a tela ficou presa no escuro (${escuro().toFixed(4)})`);
    assert.ok(frames / 72 < 1.0, `levou ${(frames / 72).toFixed(2)} s para devolver a vista`);
  });

  it('DESLIGAR A VINHETA não desliga isto — integridade do mundo não é preferência', () => {
    /* A vinheta de conforto é escolha do jogador. O escurecimento de
       intrusão não é: ele é o que impede ver e atirar do outro lado da
       parede depois de andar fisicamente para dentro dela. Falha se o
       `soltar()` do painel levar o fade junto. */
    c.soltar();
    for (let i = 0; i < 200; i++) c.intrusao(1 / 72, 0.55);
    assert.ok(escuro() > 0.98, `com a vinheta desligada o fade deu ${escuro().toFixed(4)}`);
    assert.equal(c.malha.visible, true, 'com a vinheta desligada a malha do fade sumiu da cena');
  });

  it('o túnel de andar continua funcionando junto, sem um apagar o outro', () => {
    /* Os dois moram na mesma malha e no mesmo shader. Falha se o fade
       sobrescrever o túnel (ou vice-versa) — a vinheta de corrida sumiria
       toda vez que o jogador encostasse num muro. */
    c.anexar();
    for (let i = 0; i < 200; i++) { c.update(1 / 72, 8, 8.6, 0); c.intrusao(1 / 72, 0.55); }
    assert.ok(c.tunel > 0.5, `o túnel de corrida sumiu quando o fade acendeu: ${c.tunel.toFixed(3)}`);
    assert.ok(escuro() > 0.98, `o fade sumiu quando o túnel acendeu: ${escuro().toFixed(4)}`);
  });
});

/* ================================================================
   3. O PRODUTO — sessão immersive-vr de verdade, contra sólido do mapa.
   ================================================================ */
describe('dentro da sessão: a parede segura o corpo e escurece a vista',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => { h = await bootEmVR(bootGame, { port: PORT }); });
    after(async () => { if (h) await h.close(); });

    it('10 m de caminhada física contra estrutura: colisor preso, vista solta', async () => {
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

        /* A FIAÇÃO DO JOGO, SE ELA JÁ EXISTIR — senão, a proposta, aqui.

           `intrusao()` precisa ser chamado uma vez por frame pelo game.js
           (uma linha; está no relatório da rodada). Enquanto essa linha não
           estiver colada, este caso instala a MESMA chamada e mede o produto
           inteiro com ela: o que se testa é se a saída escolhida funciona no
           jogo de verdade, não se alguém já colou a linha. Quando ela existir,
           o embrulho detecta e não chama duas vezes — a contagem abaixo é o
           que distingue os dois casos, e ela vai no resultado. */
        let doJogo = 0;
        const intrusaoOrig = G.XR.conforto.intrusao.bind(G.XR.conforto);
        G.XR.conforto.intrusao = (dt, m) => { doJogo++; return intrusaoOrig(dt, m); };
        let ultimo = performance.now();
        G.XR.place = (...a) => {
          const v = orig(...a);
          G.XR.rig.updateMatrixWorld(true);
          _m.multiplyMatrices(G.XR.rig.matrixWorld, xrCam.cameras[0].matrix);
          olho.setFromMatrixPosition(_m);
          const agora = performance.now();
          const dt = Math.min(0.1, (agora - ultimo) / 1000);
          ultimo = agora;
          /* SEPARAÇÃO GEOMÉTRICA, medida no mundo: a cabeça DESTE frame contra
             o colisor. Não é proxy — é a grandeza que o rig acumula. */
          const sep = Math.hypot(olho.x - MP.player.pos.x, olho.z - MP.player.pos.z);
          if (doJogo === 0) intrusaoOrig(dt, sep);
          const u = G.XR.conforto.malha && G.XR.conforto.malha.material.uniforms;
          trilha.push({ ex: olho.x, ez: olho.z, px: MP.player.pos.x, pz: MP.player.pos.z,
            sep, escuro: u ? u.escuro.value : 0 });
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
        return {
          vista: Math.hypot(b.ex - a.ex, b.ez - a.ez),
          colisor: Math.hypot(b.px - a.px, b.pz - a.pz),
          escuroMax: Math.max(...trilha.map(t => t.escuro)),
          escuroFim: b.escuro,
          sepMax: Math.max(...trilha.map(t => t.sep)),
          fiacaoDoJogo: doJogo > 0,
          frames: trilha.length,
        };
      });
      assert.ok(!r.semParede, 'não achei sólido nenhum perto do spawn para medir');
      assert.ok(r.frames > 100, `só ${r.frames} frames de amostra — a medida está cega`);
      /* (1) A PAREDE SEGURA O CORPO. Medido em `fa9ed86`: 10,9623 m. */
      assert.ok(r.colisor < 2.0,
        `o colisor andou ${r.colisor.toFixed(4)} m contra a parede — atravessou (vetor de trapaça)`);
      /* (2) A VISTA NÃO TRAVA. Medido antes do `devolverPasso`: 0,82 m de 3 m. */
      assert.ok(r.vista > 8.0,
        `a vista andou ${r.vista.toFixed(4)} m dos 10 m que o jogador andou no quarto dele`);
      /* (3) O FORA DO MUNDO É DESENHADO. Medido em `fa9ed86`: grep por
         blackout/fade em js/xr/ devolvia zero. */
      assert.ok(r.escuroMax > 0.98,
        `a cabeça entrou metros adentro do sólido e a tela escureceu só ${r.escuroMax.toFixed(4)} — ` +
        'em multijogador isso é ver e atirar do outro lado da parede');
      console.log(`      vista ${r.vista.toFixed(4)} m · colisor ${r.colisor.toFixed(4)} m · ` +
        `separação máx ${r.sepMax.toFixed(4)} m · escuro máx ${r.escuroMax.toFixed(4)} · ` +
        `fiação ${r.fiacaoDoJogo ? 'do JOGO' : 'do TESTE (a linha do game.js ainda não foi colada)'}`);
    });
  });
