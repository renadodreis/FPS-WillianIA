/* ================================================================
   QA — O PASSO FÍSICO TEM DE CHEGAR INTEIRO À VISTA (critério A6).

   O QUE ESTÁ SENDO COBRADO, e por que é o invariante nº 1 do projeto: em
   XR o jogo NÃO move a cabeça do jogador. Se ele dá um passo de meio metro
   dentro do quarto dele, a VISTA tem de andar meio metro — nem mais, nem
   menos, em qualquer estado do jogo. O Oculus Best Practices escreve isso
   sem margem: "The display should respond to the user's movements at all
   times, without exception".

   A DENÚNCIA QUE ORIGINOU ESTE ARQUIVO (medida de passagem, sem dono):
     · fora da cinemática, o headset andava 0,472 m e a câmera de mundo
       0,262 m — 55 %;
     · numa sonda direta, passo de 0,50 m num FRAME só → rig −0,50 m e
       posição de mundo da câmera EXATAMENTE parada;
     · dentro da cinemática, 0,485 m de 0,485 m.

   ================================================================
   POR QUE ESTE ARQUIVO NÃO REPETE O INSTRUMENTO QUE PRODUZIU AQUELES
   NÚMEROS — as duas armadilhas, as duas já pagas nesta base:

   1. **AMOSTRAR ANTES DO `render()`.** Em XR quem escreve a pose da câmera
      é o three, DENTRO de `renderer.render()`. Ler `getWorldPosition()`
      antes dele pode compor `rig(N)` com `pose(N−1)`, e nesta base já
      produziu um teste em que os dois erros se cancelavam exatamente.
      Aqui as DUAS leituras são gravadas — a de antes e a de depois — e a
      diferença entre elas é publicada, para o artefato aparecer em número
      em vez de ser argumentado.

   2. **SALTAR A CABEÇA NUM FRAME SÓ.** `js/xr/xrrig.js` tem
      `PASSO_HUMANO_MAX = 0,35 m`: um delta maior que isso num único frame
      não é caminhada (seriam 25 m/s a 72 Hz) — é recentrar, é o piso sendo
      redefinido, é rastreio perdido — e o rig aceita a pose nova SEM gerar
      passo, de propósito. Um instrumento que teleporta o headset 0,50 m num
      frame está exercitando esse ramo e medindo o descarte, não o passo.
      Aqui o passo é FÍSICO: 2 cm por frame, que a 72 Hz são 1,44 m/s —
      caminhada rápida de verdade. O maior delta por frame é publicado
      junto, para provar que a caminhada ficou abaixo do limiar.

   CONDIÇÃO DECLARADA DA BANCADA (medição sem condição não é medida):
   campo aberto (longe de qualquer sólido, senão o passo recusado vira
   separação e a conta passa a medir a parede), degrau de 2 cm, 25 degraus
   = 0,50 m, e assentamento de 500 ms antes e depois.

   OS TRÊS ESTADOS, e por que estes três: o `XR.place()` do jogo mora
   DENTRO do `applyFpsCamera`, que é chamado em UM ramo só do `tick`. A
   pergunta "o passo chega à vista?" tem, portanto, três respostas
   possíveis no produto:
     · A PÉ — `applyFpsCamera` roda, `place()` roda todo frame;
     · CINEMÁTICA — `state.cinematic` tira o `applyFpsCamera` do caminho;
     · PAINEL ABERTO — o painel pausa, e o `tick` retorna antes do
       `applyFpsCamera`.
   Um número só, colhido num estado só, não é resposta.

   PORTA 3650 (só deste arquivo).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3650;
/* 2 cm por frame a 72 Hz = 1,44 m/s: caminhada rápida, e três vezes abaixo
   do limiar de 0,35 m que o rig usa para separar passo de recentrar. */
const DEGRAU = 0.02;
const DEGRAUS = 25;
const DIST = DEGRAU * DEGRAUS;      // 0,50 m

/* A régua de A6. Um passo que chega a 98 % já é 1 cm perdido em meio metro —
   abaixo do erro de leitura de qualquer headset. Abaixo disso é o mundo
   escorregando debaixo do jogador. */
const RAZAO_MIN = 0.98;
const RAZAO_MAX = 1.02;

async function instalarSonda() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;

  /* A SONDA FICA NO `renderer.render`, E SÓ VALE DENTRO DE XR. Fora da
     sessão o jogo nunca chama `renderer.render` — chama `composer.render`
     (game.js renderFrame) — então uma sonda instalada aqui gravaria ZERO
     frames no monitor e "passaria" sem medir nada. Por isso todo caso deste
     arquivo cobra `frames` antes de olhar para a razão. */
  const S = { on: false, antes: [], depois: [], pose: [], player: [], frames: 0 };
  const rOrig = MP.renderer.render.bind(MP.renderer);
  const _v = new T.Vector3();
  MP.renderer.render = (cena, cam) => {
    /* A LEITURA DO INSTRUMENTO ACUSADO: `getWorldPosition()` ANTES do
       render. Fica gravada de propósito — é ela que permite publicar o
       artefato como número em vez de como opinião. */
    if (S.on) S.antes.push(MP.camera.getWorldPosition(new T.Vector3()).toArray());
    const v = rOrig(cena, cam);
    if (S.on) {
      S.frames++;
      /* A LEITURA CERTA: a matriz de mundo que o three acabou de escrever. */
      S.depois.push(_v.setFromMatrixPosition(MP.camera.matrixWorld).toArray());
      /* A POSE NO ESPAÇO DE REFERÊNCIA: em XR o three escreve
         `camera.matrix = pai.matrixWorld⁻¹ × cameraXR.matrixWorld`, e
         `cameraXR.matrixWorld = pai.matrixWorld × pose`. O pai cancela:
         `camera.position` É a pose do headset em `local-floor`. É contra
         ela que a vista tem de andar 1:1. */
      S.pose.push(MP.camera.position.toArray());
      S.player.push([MP.player.pos.x, MP.player.pos.z]);
    }
    return v;
  };

  const dist = (a, b) => Math.hypot(b[0] - a[0], b[2] - a[2]);
  const trajeto = xs => {
    let s = 0;
    for (let i = 1; i < xs.length; i++) s += dist(xs[i - 1], xs[i]);
    return s;
  };
  const maiorDelta = xs => {
    let m = 0;
    for (let i = 1; i < xs.length; i++) m = Math.max(m, dist(xs[i - 1], xs[i]));
    return m;
  };

  window.__PV = {
    /* CAMPO ABERTO. Perto de sólido o passo recusado vira separação
       cabeça↔corpo (js/xr/xrrig.js `devolverPasso`) e a razão passaria a
       medir a parede, não o rig. */
    plantarEmCampoAberto() {
      let livre = null;
      for (let t = 0; t < 300 && !livre; t++) {
        const x = -300 + t * 3, z = -260;
        const perto = (G.Structures.walls || []).some(w => !w.noCollide
          && x > w.x0 - 8 && x < w.x1 + 8 && z > w.z0 - 8 && z < w.z1 + 8);
        if (!perto) livre = { x, z };
      }
      if (!livre) return false;
      MP.player.pos.set(livre.x, MP.groundAt(livre.x, livre.z, 100), livre.z);
      MP.player.vel.set(0, 0, 0);
      return true;
    },

    async caminhada({ degrau, degraus, esperaMs = 20, antesDeAndar = null, depoisDeAndar = null }) {
      const A = window.__A, dev = window.__xrEmulado;
      A.solta();
      dev.position.set(0, 1.7, 0);
      await A.espera(600);           // assenta a base do rig na pose parada
      if (antesDeAndar) antesDeAndar();
      await A.espera(400);
      S.antes.length = 0; S.depois.length = 0; S.pose.length = 0; S.player.length = 0;
      S.frames = 0; S.on = true;
      for (let i = 1; i <= degraus; i++) {
        dev.position.set(i * degrau, 1.7, 0);
        await A.espera(esperaMs);
      }
      await A.espera(500);           // assenta: dreno do passo e escoamento
      S.on = false;
      if (depoisDeAndar) depoisDeAndar();
      const n = S.depois.length;
      if (n < 2) return { frames: S.frames, vazio: true };
      const passoPose = dist(S.pose[0], S.pose[n - 1]);
      const vista = dist(S.depois[0], S.depois[n - 1]);
      const vistaAntes = dist(S.antes[0], S.antes[n - 1]);
      return {
        frames: S.frames,
        passoPose,
        vista,
        vistaAntes,
        razao: passoPose > 1e-6 ? vista / passoPose : 0,
        razaoAntes: passoPose > 1e-6 ? vistaAntes / passoPose : 0,
        trajetoPose: trajeto(S.pose),
        trajetoVista: trajeto(S.depois),
        maiorDeltaPose: maiorDelta(S.pose),
        colisor: Math.hypot(S.player[n - 1][0] - S.player[0][0], S.player[n - 1][1] - S.player[0][1]),
        fora: G.XR.foraDoCorpo,
      };
    },

    /* SALTO NUM FRAME SÓ: o instrumento acusado. Não é caminhada — é o ramo
       de "recentrar / piso redefinido / rastreio perdido" do rig. Medir aqui
       serve para PROVAR que aquele 0,000 m era o descarte funcionando, e não
       o passo sumindo. */
    async salto(metros) {
      const A = window.__A, dev = window.__xrEmulado;
      A.solta();
      dev.position.set(0, 1.7, 0);
      await A.espera(600);
      S.antes.length = 0; S.depois.length = 0; S.pose.length = 0; S.player.length = 0;
      S.frames = 0; S.on = true;
      await A.espera(120);
      const i0 = S.depois.length - 1;
      dev.position.set(metros, 1.7, 0);
      await A.espera(400);
      S.on = false;
      const n = S.depois.length;
      if (i0 < 0 || n < 2) return { vazio: true, frames: S.frames };
      return {
        frames: S.frames,
        passoPose: dist(S.pose[i0], S.pose[n - 1]),
        vista: dist(S.depois[i0], S.depois[n - 1]),
        maiorDeltaPose: maiorDelta(S.pose),
      };
    },

    estado: () => ({
      cinematic: !!MP.state.cinematic,
      paused: !!MP.state.paused,
      started: !!MP.state.started,
      painel: !!G.XRUI.aberto,
    }),
  };
  return true;
}

describe('o passo físico chega inteiro à vista (A6, sessão imersiva real)',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      await h.play(instalarSonda);
      await h.play(() => window.__A.espera(600));
      const ok = await h.play(() => window.__PV.plantarEmCampoAberto());
      assert.equal(ok, true, 'não achei campo aberto para medir o passo');
      await h.play(() => window.__A.espera(400));
    });
    after(async () => { if (h) await h.close(); });

    it('A PÉ: meio metro de caminhada física move a vista meio metro', async () => {
      const r = await h.play(([d, n]) => window.__PV.caminhada({ degrau: d, degraus: n }),
        [DEGRAU, DEGRAUS]);
      assert.ok(!r.vazio && r.frames > 20,
        `só ${r.frames} frames renderizados — a sonda está cega (fora de XR o jogo ` +
        'usa composer.render e esta sonda não vê nada)');
      console.log(`      A PÉ: pose ${r.passoPose.toFixed(4)} m · vista ${r.vista.toFixed(4)} m ` +
        `· razão ${r.razao.toFixed(4)} · [lido ANTES do render: ${r.vistaAntes.toFixed(4)} m, ` +
        `razão ${r.razaoAntes.toFixed(4)}] · colisor ${r.colisor.toFixed(4)} m · ` +
        `maior delta/frame ${r.maiorDeltaPose.toFixed(4)} m · ${r.frames} frames`);
      assert.ok(r.passoPose > DIST * 0.8,
        `o headset andou ${r.passoPose.toFixed(4)} m dos ${DIST} m pedidos — o cenário não aconteceu`);
      assert.ok(r.maiorDeltaPose < 0.35,
        `um frame moveu a cabeça ${r.maiorDeltaPose.toFixed(4)} m — acima de 0,35 m o rig ` +
        'trata como recentrar, e esta medição estaria exercitando o descarte em vez do passo');
      assert.ok(r.razao >= RAZAO_MIN && r.razao <= RAZAO_MAX,
        `andando a pé, o passo físico chegou a ${(r.razao * 100).toFixed(1)} % da vista ` +
        `(${r.vista.toFixed(4)} m de ${r.passoPose.toFixed(4)} m) — A6 exige 1:1`);
    });

    it('DENTRO DA CINEMÁTICA: o passo continua chegando 1:1', async () => {
      /* `state.cinematic` é escrito pelo próprio produto
         (city-destruction-client.js `startCinematic`); escrevê-lo aqui é a
         mesma escrita, não um dublê. É o estado em que `applyFpsCamera` —
         e com ele o `XR.place()` — sai do caminho do tick. */
      const r = await h.play(([d, n]) => window.__PV.caminhada({
        degrau: d, degraus: n,
        antesDeAndar: () => { window.__MP.state.cinematic = true; },
        depoisDeAndar: () => { window.__MP.state.cinematic = false; },
      }), [DEGRAU, DEGRAUS]);
      assert.ok(!r.vazio && r.frames > 20, `só ${r.frames} frames renderizados — sonda cega`);
      console.log(`      CINEMÁTICA: pose ${r.passoPose.toFixed(4)} m · vista ${r.vista.toFixed(4)} m ` +
        `· razão ${r.razao.toFixed(4)} · colisor ${r.colisor.toFixed(4)} m · ${r.frames} frames`);
      assert.ok(r.passoPose > DIST * 0.8,
        `o headset andou ${r.passoPose.toFixed(4)} m — o cenário não aconteceu`);
      assert.ok(r.razao >= RAZAO_MIN && r.razao <= RAZAO_MAX,
        `dentro da cinemática o passo chegou a ${(r.razao * 100).toFixed(1)} % da vista ` +
        `(${r.vista.toFixed(4)} m de ${r.passoPose.toFixed(4)} m)`);
    });

    it('COM O PAINEL ABERTO: o passo continua chegando 1:1', async () => {
      const r = await h.play(([d, n]) => window.__PV.caminhada({
        degrau: d, degraus: n,
        antesDeAndar: () => { window.__game.XRUI.abrir('pausa'); },
        depoisDeAndar: () => { window.__game.XRUI.fechar(); },
      }), [DEGRAU, DEGRAUS]);
      assert.ok(!r.vazio && r.frames > 20, `só ${r.frames} frames renderizados — sonda cega`);
      console.log(`      PAINEL: pose ${r.passoPose.toFixed(4)} m · vista ${r.vista.toFixed(4)} m ` +
        `· razão ${r.razao.toFixed(4)} · colisor ${r.colisor.toFixed(4)} m · ${r.frames} frames`);
      assert.ok(r.passoPose > DIST * 0.8,
        `o headset andou ${r.passoPose.toFixed(4)} m — o cenário não aconteceu`);
      assert.ok(r.razao >= RAZAO_MIN && r.razao <= RAZAO_MAX,
        `com o painel aberto o passo chegou a ${(r.razao * 100).toFixed(1)} % da vista ` +
        `(${r.vista.toFixed(4)} m de ${r.passoPose.toFixed(4)} m)`);
    });

    it('a assimetria entre estados sumiu — os três batem entre si', async () => {
      /* O relato não era só "chega pouco": era "chega DIFERENTE conforme o
         estado". Uma vista que responde 100 % andando e 55 % em outro estado
         é pior que uma que responde 90 % sempre — o corpo aprende uma escala
         e ela muda debaixo dele. */
      const a = await h.play(([d, n]) => window.__PV.caminhada({ degrau: d, degraus: n }),
        [DEGRAU, DEGRAUS]);
      const b = await h.play(([d, n]) => window.__PV.caminhada({
        degrau: d, degraus: n,
        antesDeAndar: () => { window.__MP.state.cinematic = true; },
        depoisDeAndar: () => { window.__MP.state.cinematic = false; },
      }), [DEGRAU, DEGRAUS]);
      const c = await h.play(([d, n]) => window.__PV.caminhada({
        degrau: d, degraus: n,
        antesDeAndar: () => { window.__game.XRUI.abrir('pausa'); },
        depoisDeAndar: () => { window.__game.XRUI.fechar(); },
      }), [DEGRAU, DEGRAUS]);
      const rs = [a.razao, b.razao, c.razao];
      const espalho = Math.max(...rs) - Math.min(...rs);
      console.log(`      razões: a pé ${a.razao.toFixed(4)} · cinemática ${b.razao.toFixed(4)} ` +
        `· painel ${c.razao.toFixed(4)} · espalhamento ${espalho.toFixed(4)}`);
      assert.ok(espalho < 0.03,
        `a resposta ao passo físico varia ${(espalho * 100).toFixed(1)} % entre estados ` +
        `(${rs.map(x => x.toFixed(4)).join(' / ')})`);
    });

    it('0,50 m ANDADOS movem a vista 0,50 m; 0,50 m SALTADOS num frame não movem nada', async () => {
      /* ESTE CASO É A EXPLICAÇÃO DO RELATO, e o contraste está dentro dele:
         o MESMO meio metro, entregue de dois jeitos, dá 0,50 m e 0,00 m de
         vista. Quem move o headset meio metro num frame só não está medindo
         caminhada — está exercitando `PASSO_HUMANO_MAX` (0,35 m/frame, que a
         72 Hz seriam 25 m/s), o ramo que existe para que RECENTRAR e o piso
         sendo redefinido não teleportem o jogador no mundo (medido antes
         dele: 0,7778 m de deslocamento por um recentrar).

         E o assert é sobre o PRODUTO, não sobre o instrumento: se alguém
         subir o limiar (ou tirá-lo), a vista passa a seguir o salto e este
         caso fica vermelho — provado por mutação, ver o relatório. */
      const andada = await h.play(([d, n]) => window.__PV.caminhada({ degrau: d, degraus: n }),
        [DEGRAU, DEGRAUS]);
      const r = await h.play(() => window.__PV.salto(0.50));
      assert.ok(!r.vazio && r.frames > 5, `só ${r.frames} frames — sonda cega`);
      console.log(`      ANDADO: pose ${andada.passoPose.toFixed(4)} m → vista ${andada.vista.toFixed(4)} m ` +
        `(delta/frame máx ${andada.maiorDeltaPose.toFixed(4)} m)  ·  ` +
        `SALTADO: pose ${r.passoPose.toFixed(4)} m → vista ${r.vista.toFixed(4)} m ` +
        `(delta/frame máx ${r.maiorDeltaPose.toFixed(4)} m)`);
      assert.ok(andada.maiorDeltaPose < 0.35 && r.maiorDeltaPose > 0.35,
        `o contraste não aconteceu: andada ${andada.maiorDeltaPose.toFixed(4)} m/frame, ` +
        `salto ${r.maiorDeltaPose.toFixed(4)} m/frame — os dois precisam cair em lados ` +
        'opostos do limiar de 0,35 m para o caso significar alguma coisa');
      assert.ok(andada.vista >= andada.passoPose * RAZAO_MIN,
        `andando, a vista seguiu só ${andada.vista.toFixed(4)} m de ${andada.passoPose.toFixed(4)} m`);
      assert.ok(r.vista < 0.05,
        `a vista seguiu ${r.vista.toFixed(4)} m de um salto de ${r.passoPose.toFixed(4)} m num ` +
        'frame — com o limiar frouxo, recentrar volta a teleportar o jogador no mundo');
    });

    it('sem erro de console durante a sessão inteira (I2)', async () => {
      assert.deepEqual(h.pageErrors, [], 'erro de página durante a sessão');
      assert.deepEqual(h.consoleErrors, [], 'erro de console durante a sessão');
    });
  });
