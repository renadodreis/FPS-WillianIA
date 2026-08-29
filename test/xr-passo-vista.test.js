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

   ================================================================
   POR QUE A RAZÃO ANTIGA ERA 1 POR ÁLGEBRA — o furo que a validação
   independente achou, e a régua que o conserta.

   A razão publicada era `vista / passoPose`: o deslocamento da câmera no MUNDO
   dividido pelo deslocamento de `camera.position`, que é a pose no espaço de
   referência. Só que a câmera é FILHA do rig. Se o rig não muda no intervalo,
   `Δmundo = R · Δlocal`, e rotação preserva norma: a razão é 1 para QUALQUER
   produto, inclusive um sem `js/xr/xrrig.js` nenhum. Arrancando o `place()`
   inteiro (`if (true) return;` na primeira linha), 5 dos 6 casos continuavam
   VERDES — formatos 1 e 10 da lista do CLAUDE.md.

   A RÉGUA INDEPENDENTE é a pose que ESTE ARQUIVO escreve no headset emulado
   (`dev.position`), amostrada nos mesmos frames que a vista e o colisor. Ela
   sai da caneta do teste e não passa por nenhum código sob teste, e contra ela
   as duas razões deixam de ser tautologia:
     · `vista / comando` — a vista seguiu a cabeça? (guarda o invariante nº 1
       pelo lado da tela; fica vermelho se alguém passar a arrastar a vista)
     · `colisor / comando` — o CORPO seguiu a cabeça? É a régua que denunciou o
       congelamento do corpo com o painel aberto e na cinemática, e é ela que o
       guarda contra a volta dele.

   ================================================================
   A REPRODUÇÃO — QUAL MUTANTE DE PRODUTO MATA CADA CASO, HOJE.

   ESTA SEÇÃO JÁ ESTEVE ERRADA, e o erro foi o mais caro que um teste pode
   carregar: uma prova publicada que não prova. O texto anterior afirmava que
   `razaoCorpo` *"é a única grandeza deste arquivo que morre com o `place()`
   morto: medida, ela vai de 1,0000 para 0,0000 e o caso A PÉ fica vermelho"*,
   e a mensagem do commit `4855d57` repetia a frase. Medido com `place()`
   inteiro arrancado (`js/xr/xrrig.js`, primeira linha de `place()` →
   `if (true) return;`): **colisor/comando 1,0000 · 1,0000 · 1,0000, os seis
   primeiros casos VERDES.** A frase foi copiada de um laudo em que era
   verdadeira e envelheceu junto com a arquitetura: medir o passo saiu de
   dentro do `place()` e virou contrato de frame (`rig.rastrear()` no `sync()`
   de js/xr/xrboot.js), e o dreno que move o colisor mora no `game.js`. Com o
   `place()` morto o RIG para — a separação vista↔colisor vai a 397,0041 m, que
   `test/xr-painel-corpo.test.js` cobra — mas o colisor continua andando.
   Quem reproduzisse a frase não conseguiria, e concluiria a coisa errada.

   Medido nesta bancada, na worktree em `4855d57`, máquina ociosa (load ~0,5):

   | caso | asserção | mutante de PRODUTO que o mata | intacto → mutado |
   |---|---|---|---|
   | 1 A PÉ | `razaoVista` na faixa | correção proibida¹ | 1,0000 → **0,0000** |
   | 1 A PÉ | `razaoCorpo` na faixa | dreno desligado² | 1,0000 → **0,0000** |
   | 2 CINEMÁTICA | `razaoVista` na faixa | correção proibida¹ | 1,0000 → **0,0000** |
   | 3 PAINEL | `razaoVista` na faixa | correção proibida¹ | 1,0000 → **0,0000** |
   | 4 assimetria | âncora (cada estado anda) | correção proibida¹ | 1,0000 → **0,0000** nos três |
   | 4 assimetria | âncora (cada estado anda) | defeito ORIGINAL³ | corpo 1,0000 → **0,0000 / 0,0000** |
   | 4 assimetria | espalhamento do CORPO | defeito ORIGINAL³ | 0,0000 → **1,0000** |
   | 5 CORPO nos três | `razaoCorpo` nos 3 estados | defeito ORIGINAL³ | 1,0000 → **1,0000 / 0,0000 / 0,0000** |
   | 6 andado × saltado | vista do SALTO < 0,05 m | limiar solto⁴ | 0,0000 → **0,5000 m** |
   | 6 andado × saltado | vista do SALTO < 0,05 m | `place()` morto | 0,0000 → **0,5000 m** |
   | 7 sem erro (I2) | — | (ver abaixo) | — |

   ¹ a CORREÇÃO PROIBIDA: a vista colada no colisor — `js/xr/xrrig.js` sem
     `passoX/foraX` no `rig.position.set` do `place()`, mais o dreno
     (`XR.consumirPasso`, game.js) desligado. É a "correção" que alguém tentaria
     para o congelamento do corpo, e é a que este arquivo existe para proibir.
   ² dreno desligado: `XR.consumirPasso(_passoXR);` do `game.js` trocado por
     `_passoXR.x = 0; _passoXR.z = 0;`. O passo continua sendo medido e nunca
     chega ao `player.pos`.
   ³ defeito ORIGINAL: o produto de `18a231e` —
     `git checkout 18a231e -- game.js js/xr/xrrig.js js/xr/xrboot.js`. ATENÇÃO
     ao desfazer: `git checkout <commit> -- <caminho>` também escreve no ÍNDICE,
     e um `git checkout -- <caminho>` depois disso restaura do índice sujo e
     DEIXA o defeito na árvore. Use `git checkout HEAD -- …`.
   ⁴ limiar solto: `PASSO_HUMANO_MAX` de `js/xr/xrrig.js`, 0.35 → 5.0.

   O CASO 7 (I2) É UM ARAME DE TROPEÇO, e nenhum mutante plausível DESTA área
   o mata: os guardas que tentei arrancar (`if (XR.rig)` antes de anexar o
   boneco, o `typeof esp.addEventListener !== 'function'` do ouvinte de reset)
   não lançam nesta plataforma. Ele fica vermelho com qualquer exceção não
   tratada no caminho do frame de XR — provado com uma injetada de propósito em
   `atualizarPose`: `error: "Cannot read properties of undefined (reading
   'toFixed')"`, 7 de 7 vermelhos. Vale pelo que é: um arame, e ele está ligado.
   ================================================================

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
  const S = { on: false, antes: [], depois: [], pose: [], player: [], dev: [], frames: 0 };
  const rOrig = MP.renderer.render.bind(MP.renderer);
  const _v = new T.Vector3();
  /* A RÉGUA INDEPENDENTE: a pose que ESTE ARQUIVO escreve no headset emulado.
     Amostrada nos MESMOS frames que a vista e o colisor, para as três medidas
     compartilharem a janela. Ver o bloco "POR QUE A RAZÃO ANTIGA ERA 1 POR
     ÁLGEBRA" no cabeçalho. */
  const dev = window.__xrEmulado;
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
      S.dev.push([dev.position.x, 0, dev.position.z]);
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
      const A = window.__A;
      A.solta();
      dev.position.set(0, 1.7, 0);
      await A.espera(600);           // assenta a base do rig na pose parada
      if (antesDeAndar) antesDeAndar();
      await A.espera(400);
      S.antes.length = 0; S.depois.length = 0; S.pose.length = 0; S.player.length = 0;
      S.dev.length = 0;
      S.frames = 0; S.on = true;
      /* A JANELA COMEÇA COM O HEADSET PARADO. Ligar a sonda e sair andando no
         mesmo instante custava até um degrau na régua (0,48 m amostrados de
         0,50 m comandados) e obrigava a comparar a vista com a POSE em vez de
         com o comando. */
      await A.espera(120);
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
      const passoDev = dist(S.dev[0], S.dev[n - 1]);
      const vista = dist(S.depois[0], S.depois[n - 1]);
      const vistaAntes = dist(S.antes[0], S.antes[n - 1]);
      const colisor = Math.hypot(S.player[n - 1][0] - S.player[0][0],
        S.player[n - 1][1] - S.player[0][1]);
      return {
        frames: S.frames,
        passoPose,
        passoDev,
        vista,
        vistaAntes,
        colisor,
        /* AS DUAS RAZÕES QUE VALEM, as duas contra a MESMA régua independente:
           o deslocamento que este arquivo escreveu no headset. */
        razaoVista: passoDev > 1e-6 ? vista / passoDev : 0,
        razaoCorpo: passoDev > 1e-6 ? colisor / passoDev : 0,
        /* diagnóstico: a razão antiga (vista contra a POSE da câmera), que é
           1 por álgebra sempre que o rig não muda no intervalo */
        razaoPose: passoPose > 1e-6 ? vista / passoPose : 0,
        razaoAntes: passoPose > 1e-6 ? vistaAntes / passoPose : 0,
        trajetoPose: trajeto(S.pose),
        trajetoVista: trajeto(S.depois),
        maiorDeltaPose: maiorDelta(S.pose),
        fora: G.XR.foraDoCorpo,
      };
    },

    /* SALTO NUM FRAME SÓ: o instrumento acusado. Não é caminhada — é o ramo
       de "recentrar / piso redefinido / rastreio perdido" do rig. Medir aqui
       serve para PROVAR que aquele 0,000 m era o descarte funcionando, e não
       o passo sumindo. */
    async salto(metros) {
      const A = window.__A;
      A.solta();
      dev.position.set(0, 1.7, 0);
      await A.espera(600);
      S.antes.length = 0; S.depois.length = 0; S.pose.length = 0; S.player.length = 0;
      S.dev.length = 0;
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

    /* CONDIÇÃO DE MEDIDA, comum aos três estados: o cenário aconteceu (o
       headset andou mesmo o que se pediu), a caminhada ficou abaixo do limiar
       de recentrar, e a pose que o runtime devolveu bate com o comando (senão
       não é o produto que está sendo medido, é o emulador). */
    const condicaoDeCaminhada = r => {
      assert.ok(r.passoDev > DIST * 0.95 && r.passoDev < DIST * 1.05,
        `o headset foi comandado a andar ${DIST} m e a régua registrou ` +
        `${r.passoDev.toFixed(4)} m — o cenário não aconteceu`);
      assert.ok(r.maiorDeltaPose < 0.35,
        `um frame moveu a cabeça ${r.maiorDeltaPose.toFixed(4)} m — acima de 0,35 m o rig ` +
        'trata como recentrar, e esta medição estaria exercitando o descarte em vez do passo');
      assert.ok(Math.abs(r.passoPose - r.passoDev) < 0.02,
        `a pose que o runtime entregou andou ${r.passoPose.toFixed(4)} m contra ` +
        `${r.passoDev.toFixed(4)} m comandados: o headset emulado e a câmera divergiram, ` +
        'e sem isso fechar nenhuma das duas razões deste caso significa alguma coisa');
    };

    /* os três estados, colhidos na MESMA sessão e na mesma ordem */
    const colherOsTres = async () => {
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
      return [a, b, c];
    };

    it('A PÉ: meio metro de caminhada física move a vista E o corpo meio metro', async () => {
      const r = await h.play(([d, n]) => window.__PV.caminhada({ degrau: d, degraus: n }),
        [DEGRAU, DEGRAUS]);
      assert.ok(!r.vazio && r.frames > 20,
        `só ${r.frames} frames renderizados — a sonda está cega (fora de XR o jogo ` +
        'usa composer.render e esta sonda não vê nada)');
      console.log(`      A PÉ: comandado ${r.passoDev.toFixed(4)} m · vista ${r.vista.toFixed(4)} m ` +
        `(${r.razaoVista.toFixed(4)}) · colisor ${r.colisor.toFixed(4)} m ` +
        `(${r.razaoCorpo.toFixed(4)}) · [pose lida ${r.passoPose.toFixed(4)} m; razão ` +
        `vista/pose ${r.razaoPose.toFixed(4)}, a antiga, 1 por álgebra] · ` +
        `maior delta/frame ${r.maiorDeltaPose.toFixed(4)} m · ${r.frames} frames`);
      condicaoDeCaminhada(r);
      assert.ok(r.razaoVista >= RAZAO_MIN && r.razaoVista <= RAZAO_MAX,
        `andando a pé, a vista seguiu ${(r.razaoVista * 100).toFixed(1)} % do passo físico ` +
        `(${r.vista.toFixed(4)} m de ${r.passoDev.toFixed(4)} m comandados) — A6 exige 1:1`);
      /* ================================================================
         E O CORPO. Esta é a asserção que faltava ao arquivo inteiro, e ela
         pergunta uma coisa que `razaoVista` não pode responder: a vista segue
         a cabeça DE GRAÇA, porque a câmera é filha do rig — se o rig congelar,
         a vista continua 1:1 e o jogo não fez nada. Quem move o CORPO é o
         dreno do passo (`XR.consumirPasso`, game.js). Com o dreno desligado
         ela vai de 1,0000 para 0,0000 e este caso fica vermelho.

         E ela NÃO é a grandeza que morre com o `place()` morto — essa frase
         esteve escrita aqui e é falsa desde que medir o passo virou contrato
         de frame. Medido: com `place()` arrancado, colisor/comando 1,0000 nos
         três estados. Ver a tabela de reprodução no cabeçalho.

         É por isso que a razão ANTIGA não podia falhar: ela era
         `|Δ(mundo)| / |Δ(pose local)|`, e com o rig parado no intervalo isso é
         `|R·v| / |v|`, que rotação nenhuma muda. Validação independente
         arrancou `place()` e 5 dos 6 casos continuaram VERDES.
         ================================================================ */
      assert.ok(r.razaoCorpo >= RAZAO_MIN && r.razaoCorpo <= RAZAO_MAX,
        `andando a pé ${r.passoDev.toFixed(4)} m, o COLISOR do jogador andou ` +
        `${r.colisor.toFixed(4)} m (${(r.razaoCorpo * 100).toFixed(1)} %). O passo físico ` +
        'não está sendo drenado para a posição de jogo: a vista acompanha a cabeça de ' +
        'graça (a câmera é filha do rig), mas o corpo ficou para trás — e é a separação ' +
        'cabeça↔corpo que vira teleporte de vista no frame em que o jogo voltar a ' +
        'posicionar o rig');
    });

    it('DENTRO DA CINEMÁTICA: a vista continua seguindo a cabeça 1:1', async () => {
      /* `state.cinematic` é escrito pelo próprio produto
         (city-destruction-client.js `startCinematic`); escrevê-lo aqui é a
         mesma escrita, não um dublê. É o estado em que `applyFpsCamera` —
         e com ele o `XR.place()` — sai do caminho do tick.

         O QUE ESTE CASO PODE E O QUE NÃO PODE PROVAR. Neste estado o
         `place()` não roda, então NADA aqui exercita o rig — nenhuma asserção
         deste caso pode morrer com uma mudança em `js/xr/xrrig.js`, e dizer o
         contrário seria vender proteção que não existe. O que ele guarda é o
         invariante nº 1 do projeto pelo outro lado: a vista tem de continuar
         seguindo a cabeça mesmo com o jogo pausado, e a régua é o
         deslocamento que ESTE ARQUIVO escreveu no headset — não a pose lida de
         volta da câmera, que daria 1 por álgebra. Ele fica vermelho no dia em
         que alguém "consertar" o congelamento do corpo (§2.2 do laudo)
         ARRASTANDO a vista de volta para cima do colisor, que é exatamente a
         correção proibida. */
      const r = await h.play(([d, n]) => window.__PV.caminhada({
        degrau: d, degraus: n,
        antesDeAndar: () => { window.__MP.state.cinematic = true; },
        depoisDeAndar: () => { window.__MP.state.cinematic = false; },
      }), [DEGRAU, DEGRAUS]);
      assert.ok(!r.vazio && r.frames > 20, `só ${r.frames} frames renderizados — sonda cega`);
      console.log(`      CINEMÁTICA: comandado ${r.passoDev.toFixed(4)} m · vista ` +
        `${r.vista.toFixed(4)} m (${r.razaoVista.toFixed(4)}) · colisor ` +
        `${r.colisor.toFixed(4)} m (${r.razaoCorpo.toFixed(4)}) · ${r.frames} frames`);
      condicaoDeCaminhada(r);
      assert.ok(r.razaoVista >= RAZAO_MIN && r.razaoVista <= RAZAO_MAX,
        `dentro da cinemática a vista seguiu ${(r.razaoVista * 100).toFixed(1)} % do passo ` +
        `físico (${r.vista.toFixed(4)} m de ${r.passoDev.toFixed(4)} m comandados)`);
    });

    it('COM O PAINEL ABERTO: a vista continua seguindo a cabeça 1:1', async () => {
      const r = await h.play(([d, n]) => window.__PV.caminhada({
        degrau: d, degraus: n,
        antesDeAndar: () => { window.__game.XRUI.abrir('pausa'); },
        depoisDeAndar: () => { window.__game.XRUI.fechar(); },
      }), [DEGRAU, DEGRAUS]);
      assert.ok(!r.vazio && r.frames > 20, `só ${r.frames} frames renderizados — sonda cega`);
      console.log(`      PAINEL: comandado ${r.passoDev.toFixed(4)} m · vista ` +
        `${r.vista.toFixed(4)} m (${r.razaoVista.toFixed(4)}) · colisor ` +
        `${r.colisor.toFixed(4)} m (${r.razaoCorpo.toFixed(4)}) · ${r.frames} frames`);
      condicaoDeCaminhada(r);
      assert.ok(r.razaoVista >= RAZAO_MIN && r.razaoVista <= RAZAO_MAX,
        `com o painel aberto a vista seguiu ${(r.razaoVista * 100).toFixed(1)} % do passo ` +
        `físico (${r.vista.toFixed(4)} m de ${r.passoDev.toFixed(4)} m comandados)`);
    });

    it('a assimetria entre estados sumiu — os três batem entre si', async () => {
      /* O relato não era só "chega pouco": era "chega DIFERENTE conforme o
         estado". Uma vista que responde 100 % andando e 55 % em outro estado
         é pior que uma que responde 90 % sempre — o corpo aprende uma escala
         e ela muda debaixo dele.

         O espalhamento é medido sobre `razaoVista` (vista contra o comando do
         headset), não sobre a razão antiga: aquela era 1,0000 nos três estados
         por álgebra, e o espalhamento dela era 0,0000 para qualquer produto.

         ================================================================
         POR QUE O ESPALHAMENTO SOZINHO NÃO PODE FALHAR — o furo que a
         validação independente achou neste caso (§5.1 de
         docs/vr/validacao-4855d57.md), e a âncora que o fecha.

         Espalhamento é uma comparação dos estados ENTRE SI, e "os três iguais"
         é satisfeito tanto por "os três certos" quanto por "os três parados".
         Medido em cinco produtos diferentes, o espalhamento deu 0,0000 em
         todos — inclusive na CORREÇÃO PROIBIDA (a vista colada no colisor),
         onde os três estados leem 0,0000: a vista não segue a cabeça em estado
         NENHUM e o caso ficava verde. É o formato 1 da lista do CLAUDE.md,
         asserção que não pode falhar.

         A âncora é esta: antes de comparar, cada estado tem de provar
         SOZINHO, contra a régua independente, que andou. Com ela a correção
         proibida mata este caso pelos três estados em 0,0000, e não pelo
         espalhamento.

         E O SEGUNDO EIXO, `razaoCorpo`: o espalhamento da VISTA é 0,0000
         também no defeito ORIGINAL (a vista sempre seguiu — ela segue de graça,
         porque a câmera é filha do rig). Quem varia entre estados no defeito
         original é o CORPO: 1,0000 a pé contra 0,0000 nos dois estados em que
         `applyFpsCamera` sai do caminho, espalhamento 1,0000. Sem esta segunda
         régua, "a assimetria sumiu" seria uma afirmação sobre metade do
         relato.
         ================================================================ */
      const tres = await colherOsTres();
      const nomes = ['a pé', 'cinemática', 'painel'];
      const rs = tres.map(x => x.razaoVista);
      const rc = tres.map(x => x.razaoCorpo);
      const espalho = Math.max(...rs) - Math.min(...rs);
      const espalhoCorpo = Math.max(...rc) - Math.min(...rc);
      console.log(`      vista/comando: a pé ${rs[0].toFixed(4)} · cinemática ` +
        `${rs[1].toFixed(4)} · painel ${rs[2].toFixed(4)} · espalhamento ` +
        `${espalho.toFixed(4)}  ·  colisor/comando: ${rc.map(x => x.toFixed(4)).join(' / ')} ` +
        `· espalhamento ${espalhoCorpo.toFixed(4)}`);
      for (const x of tres) condicaoDeCaminhada(x);
      /* A ÂNCORA. Sem ela as duas asserções de espalhamento abaixo não podem
         ficar vermelhas por um produto que congela tudo por igual. */
      const parados = nomes
        .map((nome, i) => [nome, rs[i], rc[i]])
        .filter(([, v, c]) => v < RAZAO_MIN || v > RAZAO_MAX || c < RAZAO_MIN || c > RAZAO_MAX)
        .map(([nome, v, c]) => `${nome}: vista ${v.toFixed(4)} · colisor ${c.toFixed(4)}`);
      assert.deepEqual(parados, [],
        `estados que não responderam ao passo físico — ${parados.join(' | ')}. Comparar ` +
        'estados entre si só diz alguma coisa depois que cada um provou, sozinho e contra a ' +
        'régua independente, que a vista E o corpo andaram o que a cabeça andou: "os três ' +
        'iguais" também é verdade quando os três estão parados.');
      assert.ok(espalho < 0.03,
        `a resposta da VISTA ao passo físico varia ${(espalho * 100).toFixed(1)} % entre ` +
        `estados (${rs.map(x => x.toFixed(4)).join(' / ')})`);
      assert.ok(espalhoCorpo < 0.03,
        `a resposta do CORPO ao passo físico varia ${(espalhoCorpo * 100).toFixed(1)} % entre ` +
        `estados (${rc.map(x => x.toFixed(4)).join(' / ')}) — é a assimetria que o relato ` +
        'original descreveu, no eixo em que a vista não a mostra');
    });

    /* ================================================================
       O CORPO NOS TRÊS ESTADOS — o vermelho que este arquivo abriu (§2.2 do
       laudo `docs/vr/validacao-18a231e.md`) e que a rodada 17 fechou.

       O defeito era do PRODUTO e não deste arquivo: com `state.paused` ou
       `state.cinematic`, `applyFpsCamera` não rodava, logo `XR.place()` não era
       chamado e o passo físico não chegava ao colisor. Medido: vista 0,5000 m
       nos três estados, colisor 0,5000 / 0,0000 / 0,0000 m; e ao FECHAR o
       painel a vista dava um salto de 1,0000 m num frame com a cabeça parada,
       porque `place()` recebia o metro inteiro de uma vez e o classificava como
       recentrar.

       Por que o caso nasceu assim: a entrega anterior AFIRMOU "passo físico 1:1
       nos três estados" e escreveu um teste que não podia falhar para prová-lo.
       A afirmação era verdadeira para a vista e falsa para o corpo. Aqui ela
       ficou escrita inteira, com a régua certa, e em força total desde o
       primeiro commit — este caso NUNCA esteve marcado `todo`, ao contrário do
       que o cabeçalho e a mensagem do commit `4855d57` diziam.

       CONSERTADO na rodada 17, e são DUAS linhas, não uma: medir o passo saiu
       de dentro do `place()` e virou contrato de frame (`rig.rastrear()`,
       chamado pelo `sync()` de js/xr/xrboot.js, que é o único ponto que roda em
       TODO estado), E o `game.js` ganhou `XR.place()` nos ramos do menu/pausa e
       da cinemática. Quem sustenta ESTE caso é a segunda: arrancando só o
       `rastrear()`, ele continua verde (o guarda dessa linha é o caso
       CONTRATO DE FRAME de `test/xr-painel-corpo.test.js`). O colisor passou a
       andar 0,5000 m de 0,5000 m nos três estados, a separação cabeça↔corpo
       caiu de 1,0000 para 0,0000 m e o salto ao fechar o painel, de
       1,0000 m/frame para 0,0000.
       ================================================================ */
    it('o CORPO também tem de andar nos três estados (A6/C2)', async () => {
        const [aPe, cine, painel] = await colherOsTres();
        const rs = [aPe, cine, painel].map(x => x.razaoCorpo);
        console.log(`      colisor/comando: a pé ${rs[0].toFixed(4)} · cinemática ` +
          `${rs[1].toFixed(4)} · painel ${rs[2].toFixed(4)}`);
        const fora = [['a pé', aPe], ['cinemática', cine], ['painel', painel]]
          .filter(([, x]) => x.razaoCorpo < RAZAO_MIN || x.razaoCorpo > RAZAO_MAX)
          .map(([nome, x]) => `${nome}: colisor ${x.colisor.toFixed(4)} m de ` +
            `${x.passoDev.toFixed(4)} m comandados (${(x.razaoCorpo * 100).toFixed(1)} %)`);
        assert.deepEqual(fora, [],
          `estados em que o corpo NÃO acompanhou o passo físico — ${fora.join(' | ')}. ` +
          'A vista acompanha nos três (os casos acima medem isso); o corpo, não. A ' +
          'separação cabeça↔corpo que isso acumula estoura o teto de C2 (0,10 m) e vira ' +
          'salto de vista no frame em que o estado sai.');
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
      assert.ok(andada.vista >= andada.passoDev * RAZAO_MIN,
        `andando, a vista seguiu só ${andada.vista.toFixed(4)} m de ` +
        `${andada.passoDev.toFixed(4)} m comandados`);
      assert.ok(r.vista < 0.05,
        `a vista seguiu ${r.vista.toFixed(4)} m de um salto de ${r.passoPose.toFixed(4)} m num ` +
        'frame — com o limiar frouxo, recentrar volta a teleportar o jogador no mundo');
    });

    it('sem erro de console durante a sessão inteira (I2)', async () => {
      assert.deepEqual(h.pageErrors, [], 'erro de página durante a sessão');
      assert.deepEqual(h.consoleErrors, [], 'erro de console durante a sessão');
    });
  });
