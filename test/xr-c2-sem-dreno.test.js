/* ================================================================
   QA — C2 NOS TRÊS ESTADOS EM QUE O DRENO DO PASSO NÃO RODA
   (morto, dirigindo, voando).

   O DEFEITO MEDIDO PELA VALIDAÇÃO INDEPENDENTE (§2.5 de
   docs/vr/validacao-4855d57.md). A rodada 17 mandou MEDIR o passo físico
   em todo frame (`rig.rastrear()` no `sync()`), e com isso o corpo voltou
   a andar com o painel aberto e na cinemática. Mas o DRENO continua
   guardado por `!state.driving && !state.flying && !player.dead`
   (game.js:3735), e nesses três o defeito sobreviveu inteiro:

       estado    separação cabeça↔corpo   teto C2   cortina
       morto             0,9800 m           0,10     0,000
       voando            0,9800 m           0,10     0,000

   `foraDoCorpo` lê 0,0000 nos dois: nenhuma parede recusou nada, então
   nenhuma cortina acende — e o jogador enxerga através de parede andando
   pelo quarto (o limiar do repo é 0,34 m de separação para o outro lado
   do mundo aparecer).

   ================================================================
   AS TRÊS DECISÕES QUE ESTE ARQUIVO COBRA, uma por estado:

   · MORTO — o dreno PASSA A RODAR, com `resolverPassoSemFisicaXR()`
     (o `playerUpdate` não roda quando `player.dead`, então é ele quem
     põe a parede na frente do passo). Nada sobrescreve `player.pos` no
     estado morto, então o passo drenado FICA: o colisor volta a andar
     debaixo da cabeça e C2 volta a ser cobrável na letra (≤ 0,10 m).

   · DIRIGINDO e VOANDO — o dreno NÃO pode rodar, e isto é medido, não
     opinado: `carCameraUpdate` faz `player.pos.copy(Car.group.position)`
     e `Heli.update` faz `player.pos.set(group.position…)` TODO FRAME.
     O passo drenado seria apagado por eles, e `devolverRejeicaoXR()`
     roda ANTES dos dois no tick — ou seja, a rejeição nem seria vista.
     Resultado: passo saindo do acumulado sem entrar em lugar nenhum, que
     é a versão errada nº 2 de `consumirPasso` ("descartar o excedente →
     a cabeça era ARRASTADA de volta"). O caso `dirigindo (dreno ligado)`
     mede exatamente isso.

     Nesses dois a resposta é a CORTINA, e ela passa a entrar pela
     separação GEOMÉTRICA (`XR.separacao`, a régua que a rodada 17 criou
     e não ligou em nada) em vez de por `foraDoCorpo` — porque
     `foraDoCorpo` é o que o MUNDO RECUSOU, e num veículo o mundo não
     recusa nada. O termo do TETO continua saindo de `foraDoCorpo`: é ele
     que tem clamp e é ele que faz a vista parar de responder.

   ================================================================
   A OUTRA PONTA É OBRIGATÓRIA, e ela é metade deste arquivo.

   "Cortina que dispara em encosto de parede troca um defeito por outro
   pior." A porta que impede isso é a SONDA DE SÓLIDO na cabeça (o
   `_head_shape_cast` do Godot XR Tools): debruçar-se para fora da janela
   do carro e enfiar a cabeça no prédio ocupam a MESMA faixa de
   separação, e nenhum limiar de distância os separa — o que separa é o
   mundo. Por isso todo caso de "a cortina fecha" tem o gêmeo em CAMPO
   ABERTO, com a MESMA separação, cobrando cortina ZERO.

   ================================================================
   CONDIÇÃO DECLARADA DA BANCADA (medição sem condição não é medida):

   · sessão imersiva REAL (IWER, preset Quest 3), um olho por vez lido de
     `camera.matrixWorld` DEPOIS do `renderer.render()` — antes dele a
     leitura compõe `rig(N)` com `pose(N−1)` e os dois erros se cancelam;
   · degrau de 2 cm por amostra. `PASSO_HUMANO_MAX` é 0,35 m e um delta
     maior é DESCARTADO de propósito (recentrar, piso redefinido,
     rastreio perdido): teleportar o headset exercitaria o descarte, não
     o passo. O maior delta por frame é publicado em todo caso;
   · giro artificial em ZERO, conferido em todo caso: com `xrYaw ≠ 0` o
     `+x` do quarto deixa de ser o `+x` do mundo e a caminhada iria para
     outro lugar;
   · **os três estados são entrados pelo CAMINHO DO JOGO**: o carro por
     `tryToggleCar()` → `Car.nearest` → `Car.setCur`, o helicóptero por
     `tryToggleCar()` → `Heli.tryEnter()`, a morte por
     `playerDamage(999)`. Escrever `state.driving = true` na mão é a
     bandeira, não o estado — foi a ressalva de escopo que o próprio
     laudo declarou ao medir §2.5;
   · **o helicóptero tem colisão própria de raio 2,3 m** contra as
     estruturas (`js/heli.js`), então ele nunca encosta na parede: para a
     CABEÇA alcançar o sólido a caminhada física passa de 2,5 m, acima da
     área mínima de loja (2,0 × 2,0 m). O caso mede o MECANISMO da
     cortina no estado `flying`, e a distância medida é publicada.

   PORTA 3800 (só deste arquivo).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3800;

/* C2: teto de separação cabeça↔corpo. O mesmo número de
   `test/xr-parede.test.js` e de `test/xr-painel-corpo.test.js`. */
const SEP_TETO = 0.10;
/* O passo tem de chegar ao colisor. 96 % deixa folga para o teto de
   `consumirPasso` (0,15 m/frame) e para o assentamento. */
const COLISOR_MIN = 0.96;
/* A cortina fecha por completo bem antes do teto (FORA_MAX = 0,32 m de
   separação); com a cabeça dentro do sólido ela tem de estar no talo. */
const CORTINA_FECHADA = 0.90;
/* E em campo aberto ela não pode acender NADA — é a outra ponta. */
const CORTINA_ABERTA = 0.02;
/* Separação mínima para o caso valer: abaixo de FORA_MIN (0,16 m) o termo
   `perto` da cortina é zero por construção e o cenário não visitaria o
   limiar (o "cenário que não exercita o limiar", formato 9). */
const SEP_MIN_DO_CASO = 0.30;

async function instalarSonda() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;

  /* A SONDA FICA DEPOIS DO `renderer.render`, e só vale dentro de XR: fora
     da sessão o jogo desenha por `composer.render` e esta sonda gravaria
     zero frames. Por isso todo caso cobra `frames` antes de olhar número. */
  const S = { on: false, tr: [], frames: 0 };
  /* A FASE DO BR NO BOOT. `br-game.js` roda o `brTick` dele por
     `requestAnimationFrame` MESMO em partida solo, e a fase `SPECT` faz
     `spectStep()` (br-game.js:1385) ESCREVER `MP.player.pos` todo frame — no
     caso sem alvo vivo, para o ponto de sobrevoo da zona. Medido nesta
     bancada: 3873,7723 m de salto de colisor em UM frame, para (0,00; 3999,60).
     Morrer duas vezes seguidas deixava a fase em SPECT, e o caso seguinte media
     o espectador do BR em vez do jogador morto do solo. `limpar()` devolve a
     fase pristina, e todo caso de MORTO cobra que nenhum frame moveu o colisor
     mais que um passo. O que o espectador do BR faz com o passo físico é OUTRO
     estado (lá `player.dead` volta a `false`) e está declarado como NÃO MEDIDO
     aqui. */
  /* E O ESPECTADOR É AGENDADO NA MORTE, não no instante em que a bancada
     olha: `showRecap()` (br-game.js:1460) marca `enterSpectator()` para 4,2 s
     depois, e a caminhada contra a parede dura mais que isso. Devolver a fase
     em `limpar()` não bastava — o temporizador da morte ANTERIOR chegava no
     meio da caminhada seguinte (medido: 3873,7003 m de salto de colisor num
     frame). `ENDED` é a única fase que aquele temporizador respeita
     (`if (S.phase !== 'ENDED')`), e escrevê-la não dispara nada: `brTick` só
     LÊ a fase. É a partida de BR saindo do caminho de uma medição de morte
     em SOLO, declarada aqui e sem efeito no produto. */
  const foraDoBR = () => {
    if (window.__BR_debug && window.__BR_debug.S) window.__BR_debug.S.phase = 'ENDED';
    window.__BR_freeze = false;
  };
  const rOrig = MP.renderer.render.bind(MP.renderer);
  /* O CORPO DO JOGADOR NEM SEMPRE É `player.pos`. Desde que o rig do piloto
     passou a sentar no assento do helicóptero (rodada 19), `player.pos` voando
     é o número que o SERVIDOR vê — a mira dos inimigos, o dano da zona, o
     anti-teleporte —, e não o lugar onde o corpo do piloto está. Medindo a
     separação contra ele, os dois casos de VOO liam 1,5200 m constantes, que é
     o próprio deslocamento do assento e não separação nenhuma.

     A régua é que envelheceu, não o produto: com esta função os números de voo
     voltam EXATAMENTE aos publicados na rodada 18 (campo 1,0000 m, parede
     3,5000 m), o que é confirmação independente. */
  const _v = new T.Vector3(), _corpo = new T.Vector3();
  const corpoDoJogo = () => ((MP.state.flying && G.Heli && G.Heli.assentoXR)
    ? G.Heli.assentoXR(_corpo) : MP.player.pos);
  MP.renderer.render = (cena, cam) => {
    const r = rOrig(cena, cam);
    if (S.on) {
      S.frames++;
      _v.setFromMatrixPosition(MP.camera.matrixWorld);
      const dev = window.__xrEmulado;
      const u = G.XR.conforto.malha && G.XR.conforto.malha.material.uniforms;
      S.tr.push({
        ex: _v.x, ez: _v.z,
        px: MP.player.pos.x, pz: MP.player.pos.z,
        /* A RÉGUA INDEPENDENTE: a pose que o RUNTIME emulado reporta. Não
           sai de nenhuma linha do produto sob teste. */
        hx: dev.position.x, hz: dev.position.z,
        /* SEPARAÇÃO MEDIDA NA TELA — visor lido da matriz de mundo que o
           three acabou de escrever, menos o colisor. NÃO é `XR.separacao`:
           uma régua que só pergunta ao produto não vê o que o produto não
           sabe (foi assim que 1,02 m de separação conviveram com
           `foraDoCorpo` em 0,0000). */
        sep: (c => Math.hypot(_v.x - c.x, _v.z - c.z))(corpoDoJogo()),
        fora: G.XR.foraDoCorpo,
        sepP: G.XR.separacao,
        /* O QUE ESCURECE A TELA, lido do uniform da malha — não de um
           getter de conveniência. */
        cortina: u ? u.parede.value : 0,
        yaw: G.XR.giro.yaw,
        dead: !!MP.player.dead, driving: !!MP.state.driving, flying: !!MP.state.flying,
        fase: (window.__BR_debug && window.__BR_debug.S) ? window.__BR_debug.S.phase : null,
      });
    }
    return r;
  };

  const d2 = (a, b, kx, kz) => Math.hypot(b[kx] - a[kx], b[kz] - a[kz]);
  const maiorDelta = (xs, kx, kz) => {
    let m = 0;
    for (let i = 1; i < xs.length; i++) m = Math.max(m, d2(xs[i - 1], xs[i], kx, kz));
    return m;
  };
  const espera = ms => new Promise(r => setTimeout(r, ms));

  /* A face OESTE do sólido grande mais próximo do centro da cidade que
     cubra a altura do OLHO — a sonda de sólido varre uma fatia de 0,24 m
     centrada no olho, e parede baixa demais não seria alcançada por ela. */
  function acharParede() {
    const ws = G.Structures.walls || [];
    let alvo = null, melhor = Infinity;
    for (const w of ws) {
      if (w.noCollide) continue;
      if (Math.min(w.x1 - w.x0, w.z1 - w.z0) < 3) continue;
      const zc = (w.z0 + w.z1) / 2;
      const gy = MP.groundAt(w.x0 - 4, zc, 100);
      // tem de cobrir do chão até acima do olho (1,7 m) na face oeste
      if (!(w.y0 <= gy + 1.0 && w.y1 >= gy + 2.4)) continue;
      const d = Math.hypot(w.x0, zc);
      if (d < melhor) { melhor = d; alvo = { faceX: w.x0, zc, gy }; }
    }
    return alvo;
  }

  /* Um ponto longe de qualquer sólido, para o gêmeo de campo aberto. */
  function acharCampoAberto() {
    for (let t = 0; t < 400; t++) {
      const x = -300 + t * 3, z = -260;
      const perto = (G.Structures.walls || []).some(w => !w.noCollide
        && x > w.x0 - 12 && x < w.x1 + 12 && z > w.z0 - 12 && z < w.z1 + 12);
      if (!perto) return { x, z, gy: MP.groundAt(x, z, 100) };
    }
    return null;
  }

  function plantarJogador(x, z, gy) {
    MP.player.pos.set(x, gy, z);
    MP.player.vel.set(0, 0, 0);
  }

  function longeDoHeli(x, z) { G.Heli.group.position.set(x + 500, 200, z + 500); }

  window.__C2 = {
    acharParede, acharCampoAberto,

    /* ESTADO LIMPO ENTRE CASOS — e "limpo" aqui inclui o ACUMULADO DO RIG,
       que é a parte que engana.

       Um caso que anda 1,7 m morto deixa 1,7 m de passo físico pendente: o
       dreno não rodou, e o acumulado É a posição da cabeça em relação ao
       colisor. Teleportar `dev.position` de volta para a origem NÃO o
       desfaz — o salto passa de `PASSO_HUMANO_MAX` e é descartado de
       propósito, e o acumulado fica inteiro para o caso seguinte. Foi
       exatamente isso que apareceu na primeira execução desta bancada:
       `fora máx 0,5590 m` num caso que nunca encostou em parede, herdado
       do caso anterior.

       Por isso a cabeça volta ao centro do quarto ANDANDO, com o jogador
       A PÉ e em campo aberto, e a bancada espera o dreno pagar o
       acumulado (0,15 m/frame). O residual é devolvido para o caso poder
       cobrar que começou zerado. */
    async limpar() {
      const campo = window.__C2.campo;
      if (MP.state.driving || MP.state.flying) G.tryToggleCar();
      foraDoBR();
      MP.player.dead = false;
      MP.player.health = 100;
      MP.player.invulnUntil = 0;
      MP.setTimeScale(1);
      G.Morte.esconder();
      if (G.XRUI.aberto) G.XRUI.fechar();
      window.__A.solta();
      plantarJogador(campo.x, campo.z, campo.gy);
      await espera(250);
      const dev = window.__xrEmulado;
      const p0 = { x: dev.position.x, z: dev.position.z };
      const n = Math.max(1, Math.ceil(Math.hypot(p0.x, p0.z) / 0.25));
      for (let i = 1; i <= n; i++) {
        const k = 1 - i / n;
        dev.position.set(p0.x * k, 1.7, p0.z * k);
        await espera(30);
      }
      await espera(900);
      return {
        driving: !!MP.state.driving, flying: !!MP.state.flying, dead: !!MP.player.dead,
        sepResidual: G.XR.separacao, foraResidual: G.XR.foraDoCorpo,
      };
    },

    /* ENTRAR NO CARRO PELO CAMINHO DO JOGO. O chassi é levado ao ponto
       escolhido (cenário), mas quem coloca o jogador dentro é
       `tryToggleCar()` → `Car.nearest` → `Car.setCur`, exatamente como a
       tecla do jogador. `state.driving` escrito na mão seria a bandeira,
       não o estado. */
    async entrarCarro(x, z, gy) {
      longeDoHeli(x, z);
      const alvo = G.Car.vehicles[0];
      alvo.chassisBody.position.set(x, gy + 0.9, z);
      alvo.chassisBody.velocity.set(0, 0, 0);
      alvo.chassisBody.angularVelocity.set(0, 0, 0);
      alvo.chassisBody.quaternion.set(0, 0, 0, 1);
      G.Car.wake(alvo);
      await espera(900);                       // o chassi assenta na suspensão
      plantarJogador(alvo.chassisBody.position.x - 2,
        alvo.chassisBody.position.z, MP.groundAt(alvo.chassisBody.position.x - 2,
          alvo.chassisBody.position.z, 100));
      await espera(120);
      G.tryToggleCar();
      await espera(500);
      /* O carro fica onde foi posto: sem isto ele rola pelo terreno durante a
         caminhada e o colisor (que É o carro) anda sozinho — na primeira
         execução desta bancada foram 4,0021 m de deriva num caso de campo
         aberto. Zerar velocidade não dirige o carro; só o deixa parado. */
      alvo.chassisBody.velocity.set(0, 0, 0);
      alvo.chassisBody.angularVelocity.set(0, 0, 0);
      return {
        driving: !!MP.state.driving,
        cx: MP.player.pos.x, cz: MP.player.pos.z,
      };
    },

    /* ENTRAR NO HELICÓPTERO PELO CAMINHO DO JOGO (`Heli.tryEnter`, que é
       o primeiro ramo de `tryToggleCar`). */
    async entrarHeli(x, z, gy) {
      G.Heli.group.position.set(x, gy + 0.05, z);
      plantarJogador(x + 1.5, z, MP.groundAt(x + 1.5, z, 100));
      await espera(200);
      G.tryToggleCar();
      await espera(700);
      return {
        flying: !!MP.state.flying,
        cx: MP.player.pos.x, cz: MP.player.pos.z,
        hx: G.Heli.group.position.x,
      };
    },

    /* MORRER PELO CAMINHO DO JOGO. `playerDamage` é o escritor único de
       `player.dead` — escrever a bandeira na mão pularia o fluxo inteiro
       (tela de morte, painel de morte no headset, timeScale). */
    async matar() {
      MP.player.invulnUntil = 0;
      MP.player.armor = 0;
      MP.playerDamage(999);
      await espera(900);
      foraDoBR();          // a morte acabou de agendar o espectador do BR
      return { dead: !!MP.player.dead, paused: !!MP.state.paused, painel: !!G.XRUI.aberto };
    },

    /* UMA CAMINHADA FÍSICA DENTRO DO QUARTO, com o estado já montado.
       `metros` sai da geometria do cenário (a distância que falta para a
       cabeça alcançar o sólido), nunca de um número escolhido a dedo. */
    async caminhar({ metros, degrau = 0.02, esperaMs = 20, assentaMs = 600 }) {
      const dev = window.__xrEmulado;
      const degraus = Math.max(1, Math.round(metros / degrau));
      dev.position.set(0, 1.7, 0);
      await espera(500);                       // assenta a base do rig parada
      S.tr.length = 0; S.frames = 0; S.on = true;
      for (let i = 1; i <= degraus; i++) {
        dev.position.set(i * degrau, 1.7, 0);
        await espera(esperaMs);
      }
      await espera(assentaMs);
      S.on = false;

      const n = S.tr.length;
      if (n < 6) return { vazio: true, frames: S.frames, n };
      const a0 = S.tr[0], a1 = S.tr[n - 1];
      return {
        frames: S.frames, n, pedido: degraus * degrau,
        passo: d2(a0, a1, 'hx', 'hz'),
        /* A VISTA. É ela que diz se a cabeça foi ARRASTADA: com o dono de
           `player.pos` sendo outro (carro, helicóptero), drenar o passo o
           entrega para quem o apaga, e a vista volta para o veículo. */
        vista: d2(a0, a1, 'ex', 'ez'),
        colisor: d2(a0, a1, 'px', 'pz'),
        maiorDeltaPose: maiorDelta(S.tr, 'hx', 'hz'),
        /* A BANCADA COMEÇOU ZERADA? Sem este número, o caso seguinte pode
           passar (ou reprovar) por causa do acumulado que o anterior deixou. */
        sepIni: a0.sep, foraIni: a0.fora,
        x0: a0.px, z0: a0.pz, x1: a1.px, z1: a1.pz,
        maiorSaltoColisor: maiorDelta(S.tr, 'px', 'pz'),
        faseFim: a1.fase,
        sepMax: Math.max(...S.tr.map(t => t.sep)),
        sepFim: a1.sep,
        sepProdutoMax: Math.max(...S.tr.map(t => t.sepP)),
        foraMax: Math.max(...S.tr.map(t => t.fora)),
        cortinaMax: Math.max(...S.tr.map(t => t.cortina)),
        cortinaFim: a1.cortina,
        yawMax: Math.max(...S.tr.map(t => Math.abs(t.yaw))),
        driving: S.tr.every(t => t.driving),
        flying: S.tr.every(t => t.flying),
        dead: S.tr.every(t => t.dead),
      };
    },

    /* O CUSTO DA SONDA DE SÓLIDO, medido no produto: é a consulta que
       passa a rodar sempre que a separação passa de 0,10 m (antes só
       rodava quando o MUNDO tinha recusado passo). */
    /* E O CUSTO DA RÉGUA NOVA. `XR.separacao` passou a ser lida DUAS vezes por
       frame (a porta da sonda e a chamada da cortina); ela é um cos/sin e um
       hypot, mas número sem medida é opinião. */
    custoDaSeparacao(n = 200000) {
      const t0 = performance.now();
      let acc = 0;
      for (let i = 0; i < n; i++) acc += G.XR.separacao;
      const ms = (performance.now() - t0) / n;
      return { ms, acc };
    },

    custoDaSonda(n = 20000) {
      const p = new T.Vector3(MP.player.pos.x, MP.player.pos.y + 1.6, MP.player.pos.z);
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        p.set(MP.player.pos.x, MP.player.pos.y + 1.6, MP.player.pos.z);
        G.Structures.collide(p, 0.25, 0.24);
      }
      return (performance.now() - t0) / n;
    },
  };
  return true;
}

describe('C2 nos estados sem dreno: morto, dirigindo e voando (sessão imersiva real)',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h, parede, campo;

    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      await h.play(instalarSonda);
      await h.play(() => window.__A.espera(700));
      parede = await h.play(() => window.__C2.acharParede());
      campo = await h.play(() => window.__C2.acharCampoAberto());
      assert.ok(parede, 'não achei parede alta o bastante para a cabeça alcançar');
      assert.ok(campo, 'não achei campo aberto para o gêmeo sem sólido');
      /* o ponto de campo aberto é onde `limpar()` devolve a cabeça ao centro
         do quarto andando — longe de sólido, para o retorno não virar `fora` */
      await h.play(c => { window.__C2.campo = c; }, campo);
    });
    after(async () => { if (h) await h.close(); });

    /* ============================================================
       O CONTROLE. Sem ele os outros casos não têm com que ser
       comparados — e é este que prova que a bancada mede o que diz. */
    it('A PÉ (controle): o colisor anda o passo inteiro e a cortina fica fechada em 0',
      async () => {
        const r = await h.play(async c => {
          await window.__C2.limpar();
          window.__MP.player.pos.set(c.x, c.gy, c.z);
          window.__MP.player.vel.set(0, 0, 0);
          await window.__A.espera(400);
          return window.__C2.caminhar({ metros: 1.0 });
        }, campo);
        assert.ok(!r.vazio && r.frames > 40,
          `só ${r.frames} frames renderizados (n=${r.n}) — a sonda está cega`);
        console.log(`      A PÉ: passo ${r.passo.toFixed(4)} m · vista ${r.vista.toFixed(4)} m · COLISOR ${r.colisor.toFixed(4)} m · `
          + `sep máx ${r.sepMax.toFixed(4)} m · fora máx ${r.foraMax.toFixed(4)} m · `
          + `cortina máx ${r.cortinaMax.toFixed(3)} · maior delta/frame `
          + `${r.maiorDeltaPose.toFixed(4)} m · ${r.frames} frames`);
        assert.ok(r.yawMax < 1e-6,
          `giro artificial em ${r.yawMax.toFixed(6)} rad — o +x do quarto deixou de ser o +x do mundo`);
        assert.ok(r.maiorDeltaPose < 0.35,
          `um frame moveu a cabeça ${r.maiorDeltaPose.toFixed(4)} m — isso é o ramo de descarte, não passo`);
        assert.ok(r.sepIni < 0.05,
          `a bancada começou com ${r.sepIni.toFixed(4)} m de separação e ${r.foraIni.toFixed(4)} m de fora — o acumulado do caso anterior entrou neste, e o número medido não é deste cenário`);
        assert.ok(r.passo > 0.9, `o headset andou ${r.passo.toFixed(4)} m — o cenário não aconteceu`);
        assert.ok(r.colisor >= r.passo * COLISOR_MIN,
          `o colisor andou ${r.colisor.toFixed(4)} m de ${r.passo.toFixed(4)} m de passo físico`);
        assert.ok(r.sepMax <= SEP_TETO,
          `separação ${r.sepMax.toFixed(4)} m contra o teto de ${SEP_TETO} m de C2`);
        assert.ok(r.cortinaMax <= CORTINA_ABERTA,
          `a cortina acendeu ${r.cortinaMax.toFixed(3)} andando em campo aberto — `
          + 'trocar um defeito por outro pior');
      });

    /* ============================================================
       MORTO — o dreno passa a rodar. */
    it('MORTO em campo aberto: o colisor volta a andar debaixo da cabeça (C2)', async () => {
      const r = await h.play(async c => {
        await window.__C2.limpar();
        window.__MP.player.pos.set(c.x, c.gy, c.z);
        window.__MP.player.vel.set(0, 0, 0);
        await window.__A.espera(300);
        const m = await window.__C2.matar();
        if (!m.dead) return { erro: 'o jogador não morreu', m };
        return window.__C2.caminhar({ metros: 1.0 });
      }, campo);
      assert.ok(!r.erro, `${r.erro || ''} ${JSON.stringify(r.m || {})}`);
      assert.ok(!r.vazio && r.frames > 40,
        `só ${r.frames} frames renderizados (n=${r.n}) — a sonda está cega`);
      console.log(`      MORTO/campo: passo ${r.passo.toFixed(4)} m · vista ${r.vista.toFixed(4)} m · COLISOR ${r.colisor.toFixed(4)} m · `
        + `sep máx ${r.sepMax.toFixed(4)} m (produto ${r.sepProdutoMax.toFixed(4)}) · `
        + `fora máx ${r.foraMax.toFixed(4)} m · cortina máx ${r.cortinaMax.toFixed(3)} · `
        + `${r.frames} frames`);
      assert.equal(r.dead, true, 'o jogador não ficou morto durante a caminhada inteira');
      assert.ok(r.maiorSaltoColisor < 0.35,
        `um frame moveu o COLISOR ${r.maiorSaltoColisor.toFixed(4)} m (fase do BR ao fim: `
        + `${r.faseFim}) — isso não é dreno de passo, é outro dono escrevendo player.pos`);
      assert.ok(r.maiorDeltaPose < 0.35,
        `um frame moveu a cabeça ${r.maiorDeltaPose.toFixed(4)} m — isso é o ramo de descarte`);
      assert.ok(r.sepIni < 0.05,
        `a bancada começou com ${r.sepIni.toFixed(4)} m de separação e ${r.foraIni.toFixed(4)} m de fora — o acumulado do caso anterior entrou neste, e o número medido não é deste cenário`);
      assert.ok(r.passo > 0.9, `o headset andou ${r.passo.toFixed(4)} m — o cenário não aconteceu`);
      assert.ok(r.colisor >= r.passo * COLISOR_MIN,
        `MORTO, o colisor andou ${r.colisor.toFixed(4)} m de ${r.passo.toFixed(4)} m de passo físico `
        + '— o corpo do jogador ficou para trás');
      assert.ok(r.sepMax <= SEP_TETO,
        `MORTO, a cabeça ficou ${r.sepMax.toFixed(4)} m à frente do corpo, contra o teto de `
        + `${SEP_TETO} m de C2`);
    });

    it('MORTO contra parede: o colisor PARA no sólido e a cortina fecha', async () => {
      const r = await h.play(async p => {
        await window.__C2.limpar();
        const x0 = p.faceX - 1.2;
        window.__MP.player.pos.set(x0, window.__MP.groundAt(x0, p.zc, 100), p.zc);
        window.__MP.player.vel.set(0, 0, 0);
        await window.__A.espera(300);
        const m = await window.__C2.matar();
        if (!m.dead) return { erro: 'o jogador não morreu', m };
        const gap = p.faceX - window.__MP.player.pos.x;
        const r2 = await window.__C2.caminhar({ metros: Math.min(3.2, gap + 0.5) });
        r2.gap = gap;
        return r2;
      }, parede);
      assert.ok(!r.erro, `${r.erro || ''} ${JSON.stringify(r.m || {})}`);
      assert.ok(!r.vazio && r.frames > 40,
        `só ${r.frames} frames renderizados (n=${r.n}) — a sonda está cega`);
      console.log(`      MORTO/parede DIAG: (${r.x0.toFixed(2)},${r.z0.toFixed(2)}) → `
        + `(${r.x1.toFixed(2)},${r.z1.toFixed(2)}) · maior salto colisor `
        + `${r.maiorSaltoColisor.toFixed(4)} m`);
      console.log(`      MORTO/parede: vão ${r.gap.toFixed(4)} m · passo ${r.passo.toFixed(4)} m · vista ${r.vista.toFixed(4)} m · `
        + `COLISOR ${r.colisor.toFixed(4)} m · sep máx ${r.sepMax.toFixed(4)} m · `
        + `fora máx ${r.foraMax.toFixed(4)} m · cortina máx ${r.cortinaMax.toFixed(3)} · `
        + `${r.frames} frames`);
      assert.equal(r.dead, true, 'o jogador não ficou morto durante a caminhada inteira');
      assert.ok(r.maiorSaltoColisor < 0.35,
        `um frame moveu o COLISOR ${r.maiorSaltoColisor.toFixed(4)} m (fase do BR ao fim: `
        + `${r.faseFim}) — isso não é dreno de passo, é outro dono escrevendo player.pos`);
      assert.ok(r.maiorDeltaPose < 0.35,
        `um frame moveu a cabeça ${r.maiorDeltaPose.toFixed(4)} m — isso é o ramo de descarte`);
      assert.ok(r.sepIni < 0.05,
        `a bancada começou com ${r.sepIni.toFixed(4)} m de separação e ${r.foraIni.toFixed(4)} m de fora — o acumulado do caso anterior entrou neste, e o número medido não é deste cenário`);
      assert.ok(r.colisor < r.passo - 0.10,
        `MORTO contra parede, o colisor andou ${r.colisor.toFixed(4)} m de ${r.passo.toFixed(4)} m `
        + '— ele atravessou o sólido em vez de parar nele');
      assert.ok(r.foraMax >= 0.16,
        `o mundo recusou só ${r.foraMax.toFixed(4)} m — a parede não entrou no caminho, `
        + 'e o caso não mediu o que diz medir');
      assert.ok(r.cortinaMax >= CORTINA_FECHADA,
        `MORTO com a cabeça dentro do sólido, a cortina chegou a ${r.cortinaMax.toFixed(3)} `
        + `de ${CORTINA_FECHADA} — o jogador enxerga do outro lado`);
    });

    /* ============================================================
       DIRIGINDO — o dreno não roda, e a cortina passa a responder. */
    it('DIRIGINDO em campo aberto: separação grande e cortina em ZERO (a outra ponta)',
      async () => {
        const r = await h.play(async c => {
          await window.__C2.limpar();
          const e = await window.__C2.entrarCarro(c.x, c.z, c.gy);
          if (!e.driving) return { erro: 'não entrei no carro pelo caminho do jogo', e };
          const r2 = await window.__C2.caminhar({ metros: 1.0 });
          r2.entrada = e;
          return r2;
        }, campo);
        assert.ok(!r.erro, `${r.erro || ''} ${JSON.stringify(r.e || {})}`);
        assert.ok(!r.vazio && r.frames > 40,
          `só ${r.frames} frames renderizados (n=${r.n}) — a sonda está cega`);
        console.log(`      DIRIGINDO/campo: passo ${r.passo.toFixed(4)} m · vista ${r.vista.toFixed(4)} m · `
          + `COLISOR ${r.colisor.toFixed(4)} m · sep máx ${r.sepMax.toFixed(4)} m `
          + `(produto ${r.sepProdutoMax.toFixed(4)}) · fora máx ${r.foraMax.toFixed(4)} m · `
          + `cortina máx ${r.cortinaMax.toFixed(3)} · ${r.frames} frames`);
        assert.equal(r.driving, true, 'o jogador não ficou dirigindo a caminhada inteira');
        assert.ok(r.maiorDeltaPose < 0.35,
          `um frame moveu a cabeça ${r.maiorDeltaPose.toFixed(4)} m — isso é o ramo de descarte`);
        assert.ok(r.sepIni < 0.05,
          `a bancada começou com ${r.sepIni.toFixed(4)} m de separação e ${r.foraIni.toFixed(4)} m de fora — o acumulado do caso anterior entrou neste, e o número medido não é deste cenário`);
        assert.ok(r.sepMax >= SEP_MIN_DO_CASO,
          `a separação chegou só a ${r.sepMax.toFixed(4)} m — abaixo de ${SEP_MIN_DO_CASO} m o termo `
          + '`perto` da cortina é zero por construção e o caso não exercita o limiar');
        assert.ok(r.cortinaMax <= CORTINA_ABERTA,
          `dirigindo em campo aberto a cortina acendeu ${r.cortinaMax.toFixed(3)} com ` +
          `${r.sepMax.toFixed(4)} m de separação — debruçar-se para fora do carro não é ` +
          'enfiar a cabeça no prédio');
      });

    it('DIRIGINDO contra parede: a cabeça entra no sólido e a cortina fecha', async () => {
      const r = await h.play(async p => {
        await window.__C2.limpar();
        const x0 = p.faceX - 2.0;
        const e = await window.__C2.entrarCarro(x0, p.zc, window.__MP.groundAt(x0, p.zc, 100));
        if (!e.driving) return { erro: 'não entrei no carro pelo caminho do jogo', e };
        const gap = p.faceX - window.__MP.player.pos.x;
        const r2 = await window.__C2.caminhar({ metros: Math.min(3.2, gap + 0.5) });
        r2.gap = gap; r2.entrada = e;
        return r2;
      }, parede);
      assert.ok(!r.erro, `${r.erro || ''} ${JSON.stringify(r.e || {})}`);
      assert.ok(!r.vazio && r.frames > 40,
        `só ${r.frames} frames renderizados (n=${r.n}) — a sonda está cega`);
      console.log(`      DIRIGINDO/parede: vão ${r.gap.toFixed(4)} m · passo ${r.passo.toFixed(4)} m · vista ${r.vista.toFixed(4)} m · `
        + `COLISOR ${r.colisor.toFixed(4)} m · sep máx ${r.sepMax.toFixed(4)} m · `
        + `fora máx ${r.foraMax.toFixed(4)} m · cortina máx ${r.cortinaMax.toFixed(3)} · `
        + `${r.frames} frames`);
      assert.equal(r.driving, true, 'o jogador não ficou dirigindo a caminhada inteira');
      assert.ok(r.maiorDeltaPose < 0.35,
        `um frame moveu a cabeça ${r.maiorDeltaPose.toFixed(4)} m — isso é o ramo de descarte`);
      assert.ok(r.sepIni < 0.05,
        `a bancada começou com ${r.sepIni.toFixed(4)} m de separação e ${r.foraIni.toFixed(4)} m de fora — o acumulado do caso anterior entrou neste, e o número medido não é deste cenário`);
      assert.ok(r.sepMax >= r.gap,
        `a cabeça andou ${r.sepMax.toFixed(4)} m contra um vão de ${r.gap.toFixed(4)} m — `
        + 'ela não chegou dentro do sólido e o caso não mediu o que diz medir');
      assert.ok(r.cortinaMax >= CORTINA_FECHADA,
        `dirigindo com a cabeça dentro do prédio, a cortina chegou a ${r.cortinaMax.toFixed(3)} `
        + `de ${CORTINA_FECHADA} — o jogador enxerga do outro lado da parede`);
    });

    /* ============================================================
       VOANDO — mesmo desenho. */
    it('VOANDO em campo aberto: separação grande e cortina em ZERO', async () => {
      const r = await h.play(async c => {
        await window.__C2.limpar();
        const e = await window.__C2.entrarHeli(c.x, c.z, c.gy);
        if (!e.flying) return { erro: 'não entrei no helicóptero pelo caminho do jogo', e };
        const r2 = await window.__C2.caminhar({ metros: 1.0 });
        r2.entrada = e;
        return r2;
      }, campo);
      assert.ok(!r.erro, `${r.erro || ''} ${JSON.stringify(r.e || {})}`);
      assert.ok(!r.vazio && r.frames > 40,
        `só ${r.frames} frames renderizados (n=${r.n}) — a sonda está cega`);
      console.log(`      VOANDO/campo: passo ${r.passo.toFixed(4)} m · vista ${r.vista.toFixed(4)} m · `
        + `COLISOR ${r.colisor.toFixed(4)} m · sep máx ${r.sepMax.toFixed(4)} m `
        + `(produto ${r.sepProdutoMax.toFixed(4)}) · fora máx ${r.foraMax.toFixed(4)} m · `
        + `cortina máx ${r.cortinaMax.toFixed(3)} · ${r.frames} frames`);
      assert.equal(r.flying, true, 'o jogador não ficou voando a caminhada inteira');
      assert.ok(r.maiorDeltaPose < 0.35,
        `um frame moveu a cabeça ${r.maiorDeltaPose.toFixed(4)} m — isso é o ramo de descarte`);
      assert.ok(r.sepIni < 0.05,
        `a bancada começou com ${r.sepIni.toFixed(4)} m de separação e ${r.foraIni.toFixed(4)} m de fora — o acumulado do caso anterior entrou neste, e o número medido não é deste cenário`);
      assert.ok(r.sepMax >= SEP_MIN_DO_CASO,
        `a separação chegou só a ${r.sepMax.toFixed(4)} m — o caso não exercita o limiar`);
      assert.ok(r.cortinaMax <= CORTINA_ABERTA,
        `voando em campo aberto a cortina acendeu ${r.cortinaMax.toFixed(3)} com `
        + `${r.sepMax.toFixed(4)} m de separação`);
    });

    it('VOANDO contra parede: a cabeça entra no sólido e a cortina fecha', async () => {
      const r = await h.play(async p => {
        await window.__C2.limpar();
        const x0 = p.faceX - 3.0;
        const e = await window.__C2.entrarHeli(x0, p.zc, window.__MP.groundAt(x0, p.zc, 100));
        if (!e.flying) return { erro: 'não entrei no helicóptero pelo caminho do jogo', e };
        await window.__A.espera(400);
        const gap = p.faceX - window.__MP.player.pos.x;
        const r2 = await window.__C2.caminhar({ metros: Math.min(4.0, gap + 0.5) });
        r2.gap = gap; r2.entrada = e;
        return r2;
      }, parede);
      assert.ok(!r.erro, `${r.erro || ''} ${JSON.stringify(r.e || {})}`);
      assert.ok(!r.vazio && r.frames > 40,
        `só ${r.frames} frames renderizados (n=${r.n}) — a sonda está cega`);
      console.log(`      VOANDO/parede: vão ${r.gap.toFixed(4)} m · passo ${r.passo.toFixed(4)} m · vista ${r.vista.toFixed(4)} m · `
        + `COLISOR ${r.colisor.toFixed(4)} m · sep máx ${r.sepMax.toFixed(4)} m · `
        + `fora máx ${r.foraMax.toFixed(4)} m · cortina máx ${r.cortinaMax.toFixed(3)} · `
        + `${r.frames} frames`);
      assert.equal(r.flying, true, 'o jogador não ficou voando a caminhada inteira');
      assert.ok(r.maiorDeltaPose < 0.35,
        `um frame moveu a cabeça ${r.maiorDeltaPose.toFixed(4)} m — isso é o ramo de descarte`);
      assert.ok(r.sepIni < 0.05,
        `a bancada começou com ${r.sepIni.toFixed(4)} m de separação e ${r.foraIni.toFixed(4)} m de fora — o acumulado do caso anterior entrou neste, e o número medido não é deste cenário`);
      assert.ok(r.sepMax >= r.gap,
        `a cabeça andou ${r.sepMax.toFixed(4)} m contra um vão de ${r.gap.toFixed(4)} m — `
        + 'ela não chegou dentro do sólido');
      assert.ok(r.cortinaMax >= CORTINA_FECHADA,
        `voando com a cabeça dentro do prédio, a cortina chegou a ${r.cortinaMax.toFixed(3)} `
        + `de ${CORTINA_FECHADA}`);
    });

    /* ============================================================
       O CUSTO. A sonda de sólido passa a rodar sempre que a separação
       geométrica passa de 0,10 m — antes só rodava quando o MUNDO havia
       recusado passo. É UMA consulta por frame, e este caso publica o
       preço dela em ms. */
    it('CUSTO: a consulta de sólido na cabeça cabe no orçamento de frame', async () => {
      const ms = await h.play(() => window.__C2.custoDaSonda(20000));
      const sep = await h.play(() => window.__C2.custoDaSeparacao(200000));
      console.log(`      CUSTO da sonda de sólido: ${ms.toFixed(5)} ms por frame `
        + '(uma consulta, só acima de 0,10 m de separação)');
      console.log(`      CUSTO de XR.separacao: ${sep.ms.toFixed(6)} ms por leitura, `
        + `duas leituras por frame = ${(sep.ms * 2).toFixed(6)} ms`);
      assert.ok(sep.ms * 2 < 0.005,
        `as duas leituras de XR.separacao custam ${(sep.ms * 2).toFixed(6)} ms por frame`);
      assert.ok(ms < 0.05,
        `a sonda custa ${ms.toFixed(5)} ms — acima de 0,05 ms ela deixa de ser de graça a 72 Hz`);
    });
  });
