/* ================================================================
   QA — O CORPO SEGUE A CABEÇA COM O JOGO PARADO (C2), E FECHAR O
   PAINEL NÃO DESLIZA O MUNDO (A6).

   O DEFEITO MEDIDO PELA VALIDAÇÃO INDEPENDENTE (§2.2 de
   docs/vr/validacao-18a231e.md), com o painel de pausa aberto e 1 m de
   caminhada física dentro do quarto:

       a vista andou ..................... 1,0000 m   (certo)
       o COLISOR andou .................. 0,0000 m   (o corpo ficou)
       separação cabeça↔corpo ........... 1,0236 m   (teto de C2: 0,10 m)
       SALTO DA VISTA AO FECHAR ......... 1,0000 m EM UM FRAME, cabeça parada
       XR.foraDoCorpo ................... 0,0000 m   (nenhuma cortina acendeu)

   Com `state.cinematic` os números eram idênticos, dígito por dígito.

   ================================================================
   AS TRÊS GRANDEZAS QUE ESTE ARQUIVO MEDE, E POR QUE ESTAS:

   1. **DESLOCAMENTO DO COLISOR** (`MP.player.pos`). É o número que
      denuncia. A razão vista/pose NÃO serve de régua aqui: com o rig
      parado, o deslocamento de MUNDO da câmera é a rotação do
      deslocamento LOCAL, e rotação preserva a norma — a razão dá 1 para
      qualquer produto, inclusive para um produto que nunca posiciona o
      rig. Foi essa a armadilha de `xr-passo-vista.test.js` (§5.2 do
      laudo). `player.pos` não é tocado nem pelo rig nem pela câmera.

   2. **SEPARAÇÃO CABEÇA↔CORPO** medida na TELA: centro do visor lido de
      `camera.matrixWorld` DEPOIS do `render()`, menos `player.pos`. Não
      é `XR.foraDoCorpo` — esse é o que o MUNDO recusou, e o defeito de
      §2.2 tinha separação de 1,02 m com `foraDoCorpo` em zero. Uma
      régua que só consulta o produto não vê o que o produto não sabe.

   3. **METROS POR FRAME NO FECHAMENTO**, com a cabeça PARADA. Com o
      headset imóvel, qualquer deslocamento da vista é o mundo
      escorregando por baixo do jogador — que é literalmente o que A6
      proíbe ("The display should respond to the user's movements at all
      times, without exception", Oculus BP).

   ================================================================
   CONDIÇÃO DECLARADA DA BANCADA (medição sem condição não é medida):

   · campo aberto, longe de qualquer sólido — perto de parede o passo
     recusado vira separação e a conta passaria a medir a parede;
   · degrau de 2 cm por amostra, 50 degraus = 1,00 m. A 72 Hz isso é
     ~1,4 m/s, caminhada rápida de verdade. `js/xr/xrrig.js` tem
     `PASSO_HUMANO_MAX = 0,35 m` e DESCARTA delta maior de propósito
     (recentrar, piso redefinido, rastreio perdido): teleportar o
     headset exercita o descarte, não o passo. O maior delta por frame é
     publicado em todo caso, para provar que a caminhada ficou abaixo do
     limiar;
   · assentamento de 600 ms antes e 500 ms depois de andar;
   · o fechamento acontece com o headset IMÓVEL — nenhum degrau é
     escrito depois dele.

   A amostragem é DEPOIS do `renderer.render()`, com
   `setFromMatrixPosition(camera.matrixWorld)`. Antes dele a leitura
   compõe `rig(N)` com `pose(N−1)` e os dois erros se cancelam
   exatamente — já aconteceu nesta base.

   ================================================================
   A REPRODUÇÃO — QUAL MUTANTE DE PRODUTO MATA CADA ASSERÇÃO, HOJE.

   Reprodução de laudo envelhece junto com a arquitetura, e reprodução que não
   reproduz é pior que reprodução nenhuma: a rodada seguinte tenta, não
   consegue, e conclui a coisa errada. Estes números foram medidos NESTA
   bancada, na worktree em `4855d57`, máquina ociosa (load ~0,5).

   | asserção | mutante de PRODUTO | intacto → mutado |
   |---|---|---|
   | `colisor >= passo × 0,96` (a pé) | dreno desligado¹ | 0,9800 → **0,0000 m** |
   | `sepMax <= 0,10` (a pé) | `place()` morto² | 0,0000 → **397,0041 m** |
   | `colisor`/`sepMax` (painel) | defeito ORIGINAL³ | 0,9800 → **0,0000 m** / 0,0000 → **1,0000 m** |
   | `salto <= 0,02` ao fechar | defeito ORIGINAL³ | 0,0000 → **1,0000 m/frame** |
   | `colisor`/`sepMax`/`salto` (cinemática) | defeito ORIGINAL³ | 0,9800 → **0,0000 m** · 0,0000 → **1,0000 m** · 0,0000 → **1,0000 m/frame** |
   | `atrasoFrames < 0,5` (contrato de frame) | `rastrear()` fora do `sync()`⁴ | 0,0000 → **1,0000 frame** (0,0200 m) |
   | `erroChaoMax <= 0,10` (encosta) | cota não reassentada⁵ | 0,0000 → **0,7009 m** |
   | `saltoY <= 0,02` (encosta) | os dois `XR.place()` do game.js⁶ | 0,0000 → **0,7009 m/frame** |
   | `colisor < passo × 0,9` (parede) | sem física nos estados sem tick⁷ | 0,5600 → **0,9800 m** de 0,9800 m |
   | `foraMax > 0,15` (parede) | defeito ORIGINAL³ | 0,4200 → **0,0000 m** |
   | `escuroMax > 0,9` (parede) | cortina de intrusão cega⁸ | 1,000 → **0,000** |

   ¹ `XR.consumirPasso(_passoXR);` do `game.js` → `_passoXR.x = 0; _passoXR.z = 0;`
   ² `js/xr/xrrig.js`, primeira linha de `place()` → `if (true) return;`
   ³ `git checkout 18a231e -- game.js js/xr/xrrig.js js/xr/xrboot.js`. Ao
     desfazer, use `git checkout HEAD -- …`: `git checkout <commit> -- <caminho>`
     escreve no ÍNDICE também, e um `git checkout -- <caminho>` depois disso
     restaura do índice sujo e deixa o defeito na árvore.
   ⁴ `js/xr/xrboot.js`, `sync()`: `rig.atualizarPose(); rig.rastrear();` →
     `rig.atualizarPose();`. Antes deste arquivo ganhar o caso do contrato de
     frame, este mutante deixava os 14 casos da frente VERDES.
   ⁵ `game.js`, `resolverPassoSemFisicaXR`: `player.pos.y = gy;` desligado.
   ⁶ as duas linhas `if (xrOn) XR.place(…)` que a rodada 17 acrescentou aos
     ramos do menu/pausa e da cinemática.
   ⁷ `game.js`: a chamada de `resolverPassoSemFisicaXR();` arrancada. Fecha a
     única asserção que o laudo `validacao-4855d57.md` §4.8 registrou sem
     mutante conhecido — o corpo atravessa a parede inteira, 0,9800 m de
     0,9800 m de passo.
   ⁸ `game.js`: `XR.conforto.intrusao(dt, XR.foraDoCorpo, sondaDeSolidoXR())` →
     `XR.conforto.intrusao(dt, 0, undefined)`.

   OS DOIS CASOS DE ENCOSTA FICAM VERDES COM O DEFEITO ORIGINAL (`erroChaoMax`
   0,0000 e `saltoY` 0,0000, porque com o colisor congelado o chão sob ele nunca
   muda). Eles guardam a regressão que a CORREÇÃO pode criar, não o defeito que
   ela consertou — está declarado para ninguém confundir.

   PORTA 3740 (só deste arquivo).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3740;
const DEGRAU = 0.02;
const DEGRAUS = 50;
const DIST = DEGRAU * DEGRAUS;      // 1,00 m

/* C2: teto de separação cabeça↔corpo. É o mesmo número que
   `test/xr-parede.test.js` cobra no passeio canônico. */
const SEP_TETO = 0.10;
/* A6: com a cabeça parada, a vista pode andar o que o assentamento do
   colisor devolve ao rig — nada. 2 cm num frame é folga de leitura; o
   defeito media 1,0000 m. */
const SALTO_TETO = 0.02;
/* O passo tem de chegar ao colisor. 96 % de 1 m deixa 4 cm de folga para
   o dreno de `consumirPasso` (0,15 m/frame) e para o assentamento. */
const COLISOR_MIN = 0.96;

async function instalarSonda() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;

  /* A SONDA FICA DEPOIS DO `renderer.render`, e só vale dentro de XR: fora
     da sessão o jogo desenha por `composer.render` (game.js `renderFrame`)
     e esta sonda gravaria zero frames. Por isso todo caso cobra `frames`
     antes de olhar para qualquer número. */
  const S = { on: false, tr: [], frames: 0 };
  const rOrig = MP.renderer.render.bind(MP.renderer);
  const _v = new T.Vector3();
  MP.renderer.render = (cena, cam) => {
    const v = rOrig(cena, cam);
    if (S.on) {
      S.frames++;
      /* A LEITURA CERTA: a matriz de mundo que o three ACABOU de escrever
         dentro do render. `getWorldPosition()` aqui comporia rig(N) com
         pose(N−1). */
      _v.setFromMatrixPosition(MP.camera.matrixWorld);
      const dev = window.__xrEmulado;
      const u = G.XR.conforto.malha && G.XR.conforto.malha.material.uniforms;
      S.tr.push({
        ex: _v.x, ey: _v.y, ez: _v.z,
        /* a COTA do piso sob o colisor: durante a pausa o `playerUpdate` não
           roda, e é ele quem reassenta `player.pos.y` no terreno */
        py: MP.player.pos.y,
        chao: MP.groundAt(MP.player.pos.x, MP.player.pos.z, MP.player.pos.y),
        px: MP.player.pos.x, pz: MP.player.pos.z,
        /* A RÉGUA INDEPENDENTE: a pose que o RUNTIME emulado reporta. Não
           sai de nenhuma linha do produto sob teste. */
        hx: dev.position.x, hz: dev.position.z,
        sep: Math.hypot(_v.x - MP.player.pos.x, _v.z - MP.player.pos.z),
        fora: G.XR.foraDoCorpo,
        escuro: u ? Math.max(u.escuro.value, u.parede ? u.parede.value : 0) : 0,
      });
    }
    return v;
  };

  const d2 = (a, b, kx, kz) => Math.hypot(b[kx] - a[kx], b[kz] - a[kz]);
  const maiorDelta = (xs, kx, kz) => {
    let m = 0;
    for (let i = 1; i < xs.length; i++) m = Math.max(m, d2(xs[i - 1], xs[i], kx, kz));
    return m;
  };

  window.__PC = {
    /* CAMPO ABERTO. Perto de sólido o passo recusado vira separação
       (js/xr/xrrig.js `devolverPasso`) e a conta mediria a parede. */
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

    /* A ENCOSTA MAIS ÍNGREME que houver em campo aberto, medida em desnível
       por metro ao longo de +x — que é a direção em que a bancada caminha. Um
       terreno plano não exercita a cota: o defeito vertical só aparece onde o
       chão muda debaixo de quem anda. */
    plantarEmEncosta() {
      let melhor = null, dmax = 0;
      for (let t = 0; t < 400; t++) {
        const x = -400 + t * 2, z = -200;
        const perto = (G.Structures.walls || []).some(w => !w.noCollide
          && x > w.x0 - 8 && x < w.x1 + 8 && z > w.z0 - 8 && z < w.z1 + 8);
        if (perto) continue;
        const g0 = MP.groundAt(x, z, 100), g1 = MP.groundAt(x + 1, z, 100);
        const d = Math.abs(g1 - g0);
        if (d > dmax) { dmax = d; melhor = { x, z, g0 }; }
      }
      if (!melhor) return null;
      MP.player.pos.set(melhor.x, melhor.g0, melhor.z);
      MP.player.vel.set(0, 0, 0);
      return { desnivel: dmax };
    },

    /* Planta o jogador `recuo` metros a OESTE da face oeste do sólido
       grande mais próximo, olhando para ele. É a bancada do caso de
       integridade: andar de verdade contra parede virtual. */
    plantarDianteDeParede(recuo) {
      const ws = G.Structures.walls || [];
      let alvo = null, dm = Infinity;
      for (const w of ws) {
        if (w.noCollide) continue;
        if (w.y1 - w.y0 < 2 || Math.min(w.x1 - w.x0, w.z1 - w.z0) < 1) continue;
        const d = Math.hypot((w.x0 + w.x1) / 2 - MP.player.pos.x, (w.z0 + w.z1) / 2 - MP.player.pos.z);
        if (d < dm) { dm = d; alvo = w; }
      }
      if (!alvo) return null;
      const zc = (alvo.z0 + alvo.z1) / 2, x0 = alvo.x0 - recuo;
      MP.player.pos.set(x0, MP.groundAt(x0, zc, 100), zc);
      MP.player.vel.set(0, 0, 0);
      return { recuo, faceX: alvo.x0 };
    },

    /* UMA CAMINHADA FÍSICA, e um FECHAMENTO com a cabeça imóvel.

       `antes` liga o estado (painel/cinemática), `depois` o desliga. O
       corte entre "andando" e "fechando" é gravado por índice: tudo o que
       vier depois de `depois()` tem a cabeça PARADA, e é lá que o salto é
       medido. */
    async caminhada({ degrau, degraus, esperaMs = 20, antes = null, depois = null,
      assentaMs = 500, fechaMs = 700, pausaInicialMs = 0 }) {
      const A = window.__A, dev = window.__xrEmulado;
      A.solta();
      dev.position.set(0, 1.7, 0);
      await A.espera(600);            // assenta a base do rig na pose parada
      if (antes) antes();
      await A.espera(400);
      S.tr.length = 0; S.frames = 0; S.on = true;
      /* FRAMES PARADOS DENTRO DA JANELA, e eles não são enfeite: a dívida de
         frame (ver `atrasoM`) é uma diferença ABSOLUTA entre duas réguas de
         origens diferentes — a pose do headset no quarto e o colisor no mundo.
         O zero comum entre as duas só existe num instante em que sabemos que
         não há dívida, e esse instante é a cabeça PARADA. Sem esses frames a
         referência seria o primeiro frame da caminhada, que já carrega o
         atraso, e a subtração o cancelaria: foi exatamente isso que fez o
         colisor publicar 1,0000 m para 0,9800 m de passo sob o mutante em vez
         de publicar a dívida. */
      if (pausaInicialMs) await A.espera(pausaInicialMs);
      const iRef = Math.max(0, S.tr.length - 1);
      for (let i = 1; i <= degraus; i++) {
        dev.position.set(i * degrau, 1.7, 0);
        await A.espera(esperaMs);
      }
      await A.espera(assentaMs);      // dreno do passo e escoamento
      const iCorte = S.tr.length;
      if (depois) depois();
      await A.espera(fechaMs);        // a cabeça NÃO se mexe daqui em diante
      S.on = false;

      const n = S.tr.length;
      if (n < 4 || iCorte < 2 || iCorte >= n) return { vazio: true, frames: S.frames, n, iCorte };
      const anda = S.tr.slice(0, iCorte);
      const fecha = S.tr.slice(iCorte - 1);
      const a0 = anda[0], a1 = anda[anda.length - 1];

      /* SÓ OS FRAMES EM QUE A CABEÇA NÃO SE MEXEU entram no salto. Com o
         headset imóvel qualquer metro que a vista ande é o mundo
         escorregando. */
      let salto = 0, saltoI = -1, saltoY = 0;
      for (let i = 1; i < fecha.length; i++) {
        if (d2(fecha[i - 1], fecha[i], 'hx', 'hz') > 1e-9) continue;
        const dv = d2(fecha[i - 1], fecha[i], 'ex', 'ez');
        if (dv > salto) { salto = dv; saltoI = i; }
        /* O MESMO SALTO NO EIXO VERTICAL. A6 não distingue eixo: com a cabeça
           parada, o piso do rig reassentando de uma vez é mundo escorregando
           igual. Ele nasce de outro lugar — a cota do colisor, que durante a
           pausa não é reamostrada por ninguém. */
        const dy = Math.abs(fecha[i].ey - fecha[i - 1].ey);
        if (dy > saltoY) saltoY = dy;
      }
      /* A DÍVIDA DE FRAME — quanto a cabeça ficou à frente do corpo em relação
         ao instante parado, com a régua independente de um lado e o colisor do
         outro. Ela é a assinatura de QUANDO o passo é medido, não de QUANTO: um
         produto que mede o passo tarde no tick (dentro de quem posiciona, em
         vez de no contrato de frame) entrega ao dreno o passo do frame ANTERIOR,
         e o corpo caminha o metro inteiro atrasado de um frame o tempo todo. */
      let atrasoM = 0;
      for (let i = iRef + 1; i < iCorte; i++) {
        const dv = d2(S.tr[iRef], S.tr[i], 'hx', 'hz') - d2(S.tr[iRef], S.tr[i], 'px', 'pz');
        if (dv > atrasoM) atrasoM = dv;
      }
      const maiorPasso = maiorDelta(anda, 'hx', 'hz');
      /* quanto a cabeça andou entre o primeiro frame da janela e a referência:
         zero é a condição para a referência valer como zero comum */
      const mexeuAntes = d2(S.tr[0], S.tr[iRef], 'hx', 'hz');
      return {
        frames: S.frames, n, iCorte,
        iRef, framesParado: iRef, mexeuAntes,
        atrasoM,
        /* A DÍVIDA EM FRAMES, que é o número que não depende da velocidade da
           bancada nem da taxa de quadros da máquina: dívida dividida pelo maior
           passo de um frame. Zero = o corpo absorve no MESMO frame; 1 = um
           frame inteiro de atraso. */
        atrasoFrames: maiorPasso > 1e-9 ? atrasoM / maiorPasso : 0,
        passo: d2(a0, a1, 'hx', 'hz'),
        vista: d2(a0, a1, 'ex', 'ez'),
        colisor: d2(a0, a1, 'px', 'pz'),
        sepIni: a0.sep,
        sepMax: Math.max(...anda.map(t => t.sep)),
        sepFim: a1.sep,
        maiorDeltaPose: maiorPasso,
        salto, saltoI, saltoY,
        saltoFrames: fecha.length,
        /* quanto a cota do colisor divergiu do terreno sob ele durante a
           caminhada — a CAUSA do salto vertical, medida na fonte */
        erroChaoMax: Math.max(...anda.map(t => Math.abs(t.py - t.chao))),
        foraMax: Math.max(...anda.map(t => t.fora)),
        escuroMax: Math.max(...anda.map(t => t.escuro)),
        /* depois do fechamento: a vista total percorrida com a cabeça parada */
        derivaFecha: d2(fecha[0], fecha[fecha.length - 1], 'ex', 'ez'),
        colisorFecha: d2(fecha[0], fecha[fecha.length - 1], 'px', 'pz'),
      };
    },

    /* Liga/desliga um dos dois estados por NOME. O painel entra pelo produto
       (`XRUI.abrir('pausa')` chama o `setPaused` do jogo, que é o escritor
       único); a cinemática é a MESMA bandeira que city-destruction-client.js
       escreve. Escopo declarado: escrever `state.cinematic` sem passar por
       `startCinematic` não exercita o código da cinemática em si — o que este
       arquivo cobra é o estado, não o espetáculo. */
    ligarEstado(qual, liga) {
      if (qual === 'painel') { if (liga) G.XRUI.abrir('pausa'); else G.XRUI.fechar(); }
      else MP.state.cinematic = !!liga;
    },

    estado: () => ({
      paused: !!MP.state.paused, cinematic: !!MP.state.cinematic,
      started: !!MP.state.started, painel: !!G.XRUI.aberto,
    }),
  };
  return true;
}

describe('o corpo segue a cabeça em TODOS os estados (C2/A6, sessão imersiva real)',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      await h.play(instalarSonda);
      await h.play(() => window.__A.espera(600));
      const ok = await h.play(() => window.__PC.plantarEmCampoAberto());
      assert.equal(ok, true, 'não achei campo aberto para medir o passo');
      await h.play(() => window.__A.espera(400));
    });
    after(async () => { if (h) await h.close(); });

    /* O CONTROLE. Sem ele os outros dois casos não têm com que ser
       comparados — e é este que prova que a bancada mede o que diz medir. */
    it('A PÉ (controle): 1 m de passo físico move o COLISOR 1 m', async () => {
      const r = await h.play(([d, n]) => window.__PC.caminhada({ degrau: d, degraus: n }),
        [DEGRAU, DEGRAUS]);
      assert.ok(!r.vazio && r.frames > 40,
        `só ${r.frames} frames renderizados (n=${r.n}, corte=${r.iCorte}) — a sonda está cega`);
      console.log(`      A PÉ: passo ${r.passo.toFixed(4)} m · vista ${r.vista.toFixed(4)} m · ` +
        `COLISOR ${r.colisor.toFixed(4)} m · sep máx ${r.sepMax.toFixed(4)} m · ` +
        `fora máx ${r.foraMax.toFixed(4)} m · salto ${r.salto.toFixed(4)} m/frame · ` +
        `maior delta/frame ${r.maiorDeltaPose.toFixed(4)} m · ${r.frames} frames`);
      assert.ok(r.passo > DIST * 0.9,
        `o headset andou ${r.passo.toFixed(4)} m dos ${DIST} m pedidos — o cenário não aconteceu`);
      assert.ok(r.maiorDeltaPose < 0.35,
        `um frame moveu a cabeça ${r.maiorDeltaPose.toFixed(4)} m — acima de 0,35 m o rig trata ` +
        'como recentrar, e a medição estaria exercitando o descarte em vez do passo');
      assert.ok(r.colisor >= r.passo * COLISOR_MIN,
        `o colisor andou ${r.colisor.toFixed(4)} m de ${r.passo.toFixed(4)} m de passo físico`);
      assert.ok(r.sepMax <= SEP_TETO,
        `pico de separação cabeça↔corpo ${r.sepMax.toFixed(4)} m contra o teto de ${SEP_TETO} m de C2`);
    });

    it('PAINEL DE PAUSA ABERTO: o colisor acompanha, e a separação fica sob o teto de C2',
      async () => {
        const r = await h.play(([d, n]) => window.__PC.caminhada({
          degrau: d, degraus: n,
          antes: () => { window.__game.XRUI.abrir('pausa'); },
          depois: () => { window.__game.XRUI.fechar(); },
        }), [DEGRAU, DEGRAUS]);
        assert.ok(!r.vazio && r.frames > 40,
          `só ${r.frames} frames renderizados (n=${r.n}, corte=${r.iCorte}) — a sonda está cega`);
        console.log(`      PAINEL: passo ${r.passo.toFixed(4)} m · vista ${r.vista.toFixed(4)} m · ` +
          `COLISOR ${r.colisor.toFixed(4)} m · sep máx ${r.sepMax.toFixed(4)} m · ` +
          `fora máx ${r.foraMax.toFixed(4)} m · escuro máx ${r.escuroMax.toFixed(3)} · ` +
          `maior delta/frame ${r.maiorDeltaPose.toFixed(4)} m · ${r.frames} frames`);
        assert.ok(r.passo > DIST * 0.9,
          `o headset andou ${r.passo.toFixed(4)} m — o cenário não aconteceu`);
        assert.ok(r.maiorDeltaPose < 0.35,
          `um frame moveu a cabeça ${r.maiorDeltaPose.toFixed(4)} m — isso é o ramo de descarte`);
        assert.ok(r.colisor >= r.passo * COLISOR_MIN,
          `com o painel aberto o colisor andou ${r.colisor.toFixed(4)} m de ` +
          `${r.passo.toFixed(4)} m de passo físico — o corpo do jogador ficou para trás`);
        assert.ok(r.sepMax <= SEP_TETO,
          `com o painel aberto a cabeça ficou ${r.sepMax.toFixed(4)} m à frente do corpo, contra o ` +
          `teto de ${SEP_TETO} m de C2 — nessa faixa o jogador vê o outro lado da parede`);
      });

    it('PAINEL DE PAUSA: FECHAR não desliza o mundo (a cabeça está parada)', async () => {
      const r = await h.play(([d, n]) => window.__PC.caminhada({
        degrau: d, degraus: n,
        antes: () => { window.__game.XRUI.abrir('pausa'); },
        depois: () => { window.__game.XRUI.fechar(); },
      }), [DEGRAU, DEGRAUS]);
      assert.ok(!r.vazio && r.saltoFrames > 8,
        `só ${r.saltoFrames} frames depois do fechamento — não dá para medir o salto`);
      console.log(`      FECHAR: maior salto da vista ${r.salto.toFixed(4)} m/frame ` +
        `(frame ${r.saltoI} de ${r.saltoFrames}) · deriva total ${r.derivaFecha.toFixed(4)} m · ` +
        `colisor andou ${r.colisorFecha.toFixed(4)} m no fechamento`);
      assert.ok(r.salto <= SALTO_TETO,
        `ao FECHAR o painel a vista andou ${r.salto.toFixed(4)} m num frame com a cabeça imóvel — ` +
        `A6 proíbe (teto ${SALTO_TETO} m)`);
    });

    it('CINEMÁTICA DA CIDADE: o colisor acompanha, e fechar não desliza o mundo', async () => {
      /* `state.cinematic` é a MESMA bandeira que city-destruction-client.js
         escreve; é mecânica intencional do servidor e não pode ser
         bloqueada. O que se cobra aqui é que o corpo do jogador continue
         debaixo da cabeça enquanto ela roda. */
      const r = await h.play(([d, n]) => window.__PC.caminhada({
        degrau: d, degraus: n,
        antes: () => { window.__MP.state.cinematic = true; },
        depois: () => { window.__MP.state.cinematic = false; },
      }), [DEGRAU, DEGRAUS]);
      assert.ok(!r.vazio && r.frames > 40,
        `só ${r.frames} frames renderizados (n=${r.n}, corte=${r.iCorte}) — a sonda está cega`);
      console.log(`      CINEMÁTICA: passo ${r.passo.toFixed(4)} m · vista ${r.vista.toFixed(4)} m · ` +
        `COLISOR ${r.colisor.toFixed(4)} m · sep máx ${r.sepMax.toFixed(4)} m · ` +
        `salto ao sair ${r.salto.toFixed(4)} m/frame · ${r.frames} frames`);
      assert.ok(r.passo > DIST * 0.9,
        `o headset andou ${r.passo.toFixed(4)} m — o cenário não aconteceu`);
      assert.ok(r.colisor >= r.passo * COLISOR_MIN,
        `na cinemática o colisor andou ${r.colisor.toFixed(4)} m de ${r.passo.toFixed(4)} m`);
      assert.ok(r.sepMax <= SEP_TETO,
        `na cinemática a cabeça ficou ${r.sepMax.toFixed(4)} m à frente do corpo (teto ${SEP_TETO} m)`);
      assert.ok(r.salto <= SALTO_TETO,
        `ao SAIR da cinemática a vista andou ${r.salto.toFixed(4)} m num frame com a cabeça imóvel`);
    });

    /* ================================================================
       O CONTRATO DE FRAME — MEDIR O PASSO É OBRIGAÇÃO DE TODO FRAME, E NÃO
       TAREFA DE QUEM POSICIONA.

       POR QUE ESTE CASO EXISTE. A correção da rodada 17 tem DUAS linhas: o
       `rig.rastrear()` que o `sync()` de js/xr/xrboot.js passou a chamar todo
       frame, e os dois `XR.place()` que o `game.js` ganhou nos ramos do
       menu/pausa e da cinemática. A validação independente arrancou SÓ a
       primeira e os 14 casos da frente continuaram VERDES (§2.2 de
       docs/vr/validacao-4855d57.md): quem segurava tudo era o `place()`, e a
       linha que a mensagem do commit vende como *a* causa não tinha guarda
       nenhum.

       O QUE MUDA SEM ELA, e é a única coisa que muda: com `rastrear()` fora do
       `sync()`, a marca `rastreado` de js/xr/xrrig.js nunca acende e quem passa
       a medir o passo é o `place()` — que roda TARDE no tick. O dreno
       (`XR.consumirPasso`, game.js) roda ANTES dele. Resultado: o corpo recebe
       em cada frame o passo do frame ANTERIOR e caminha o metro inteiro um
       frame atrás da cabeça. Medido: dívida 0,0200 m, que é exatamente um
       degrau da bancada — 1,0000 frame de atraso.

       POR QUE OS OUTROS CASOS NÃO VEEM ISSO. O teto de separação de C2 é
       0,10 m (é critério de CONFORTO, e 2 cm passam nele com folga — e não é
       para ele apertar); e o deslocamento total é medido dentro de uma janela,
       onde o atraso se cancela na subtração: por isso o colisor publica
       1,0000 m para 0,9800 m de passo em vez de publicar a dívida. A dívida só
       aparece contra uma referência TOMADA COM A CABEÇA PARADA, que é o que
       `pausaInicialMs` põe dentro da janela.

       A RÉGUA É INDEPENDENTE dos dois lados: a pose que este arquivo escreve
       no headset emulado (`dev.position`) contra `player.pos`. Nenhuma das
       duas passa por `js/xr/xrrig.js`, e nenhuma é a vista — `sep`, que é
       vista contra colisor, lê 0,0000 quando as duas congelam juntas (é o que
       a correção proibida faz), e por isso não serve sozinha.

       O QUE ESTE CASO NÃO PROVA, e não vou vender o que não mede: ele não
       exercita um estado FUTURO que deixe de chamar `place()` — hoje os cinco
       estados do jogo chamam. O que ele mede é a consequência OBSERVÁVEL de a
       medição estar acoplada a quem posiciona, que é a razão de o contrato
       existir. O dia em que alguém acoplar de novo, este caso fica vermelho
       antes de o estado novo nascer.
       ================================================================ */
    it('CONTRATO DE FRAME: o corpo absorve o passo no MESMO frame, e não no seguinte',
      async () => {
        /* Os dois ramos de `place()` do game.js, para o caso não depender de um
           só: a pé (dentro do `applyFpsCamera`) e com o painel aberto (a linha
           do ramo de menu/pausa). */
        const casos = [];
        for (const nome of ['A PÉ', 'PAINEL']) {
          const r = await h.play(([d, n, cp]) => window.__PC.caminhada({
            degrau: d, degraus: n, pausaInicialMs: 200,
            antes: cp ? () => window.__PC.ligarEstado('painel', true) : null,
            depois: cp ? () => window.__PC.ligarEstado('painel', false) : null,
          }), [DEGRAU, DEGRAUS, nome === 'PAINEL']);
          casos.push([nome, r]);
        }
        for (const [nome, r] of casos) {
          assert.ok(!r.vazio && r.frames > 40, `${nome}: só ${r.frames} frames — a sonda está cega`);
          console.log(`      CONTRATO/${nome}: dívida ${r.atrasoM.toFixed(4)} m = ` +
            `${r.atrasoFrames.toFixed(4)} frame(s) de atraso · maior passo/frame ` +
            `${r.maiorDeltaPose.toFixed(4)} m · ${r.framesParado} frames de referência ` +
            `parada (cabeça andou ${r.mexeuAntes.toFixed(4)} m neles) · ` +
            `passo ${r.passo.toFixed(4)} m · COLISOR ${r.colisor.toFixed(4)} m`);
        }

        /* CONDIÇÃO DA MEDIDA, e ela é o que separa este caso de um que passa
           por acidente. Três coisas têm de ser verdade ANTES de a dívida
           significar alguma coisa:
             1. a referência é PARADA — senão ela já carrega o atraso e a
                subtração o apaga (é o formato "a condição que valida o caso é
                a que esconde o defeito");
             2. o cenário aconteceu — a cabeça andou e o corpo andou junto,
                senão "sem dívida" seria satisfeito por "nada se mexeu";
             3. a bancada RESOLVE um frame de atraso — se o passo por frame
                fosse pequeno demais, um frame de atraso caberia dentro do erro
                de leitura e o caso passaria sem poder falhar. */
        for (const [nome, r] of casos) {
          assert.ok(r.framesParado >= 4 && r.mexeuAntes < 1e-6,
            `${nome}: a referência tem ${r.framesParado} frames e a cabeça andou ` +
            `${r.mexeuAntes.toFixed(4)} m dentro deles — sem um instante PARADO as duas ` +
            'réguas não têm zero comum e a dívida medida não é dívida');
          assert.ok(r.passo > DIST * 0.9,
            `${nome}: o headset andou ${r.passo.toFixed(4)} m — o cenário não aconteceu`);
          assert.ok(r.colisor >= r.passo * COLISOR_MIN,
            `${nome}: o colisor andou ${r.colisor.toFixed(4)} m de ${r.passo.toFixed(4)} m — ` +
            'sem o corpo caminhando não há atraso a medir');
          assert.ok(r.maiorDeltaPose > 0.01,
            `${nome}: o maior passo de um frame foi ${r.maiorDeltaPose.toFixed(4)} m — abaixo de ` +
            '1 cm um frame de atraso não é distinguível do erro de leitura, e este caso não ' +
            'poderia ficar vermelho');
        }

        /* A MEDIDA. Meio frame de atraso já é vermelho: o produto certo entrega
           ZERO, e um acoplamento entre medir e posicionar entrega UM. */
        const atrasados = casos.filter(([, r]) => r.atrasoFrames >= 0.5)
          .map(([nome, r]) => `${nome}: ${r.atrasoFrames.toFixed(4)} frame(s) ` +
            `(${r.atrasoM.toFixed(4)} m de dívida para ${r.maiorDeltaPose.toFixed(4)} m de passo/frame)`);
        assert.deepEqual(atrasados, [],
          `o corpo do jogador anda ATRASADO em relação à cabeça — ${atrasados.join(' | ')}. ` +
          'Medir o passo saiu do contrato de frame (o `rig.rastrear()` do `sync()`, ' +
          'js/xr/xrboot.js) e voltou para dentro de quem posiciona, que roda depois do dreno. ' +
          'A separação resultante passa despercebida pelo teto de conforto de C2 e reaparece ' +
          'inteira no dia em que um estado novo do jogo deixar de chamar `place()`.');
      });

    /* A6 NÃO DISTINGUE EIXO, e este caso nasceu de um defeito que a própria
       correção criou: com o colisor caminhando durante a pausa, a COTA dele
       deixa de valer (quem a reassenta é o `playerUpdate`, que não roda), e é
       ela que o rig recebe como piso. Na encosta mais íngreme do mapa isso
       media 0,7009 m de erro de chão — pagos de uma vez ao fechar o painel,
       com a cabeça parada. Terreno plano não exercita nada disto: a bancada
       procura o desnível antes de medir. */
    /* OS DOIS ESTADOS, e não só o painel: o `place()` de cada ramo é uma linha
       DIFERENTE do `game.js`, e um caso de encosta só do painel deixa a linha
       da cinemática sem guarda nenhuma. Medido: arrancando o `place()` do ramo
       da cinemática com este arquivo cobrindo só o painel, os seis casos
       continuavam VERDES — é o formato "cenário que não exercita o limiar",
       aqui em campo plano, onde a cota não muda e não há o que reassentar. */
    for (const [nome, modo] of [['PAINEL', 'painel'], ['CINEMÁTICA', 'cinematica']]) {
      it(`${nome} EM ENCOSTA: a cota acompanha, e sair não derruba a vista`, async () => {
        const p = await h.play(() => window.__PC.plantarEmEncosta());
        assert.ok(p && p.desnivel > 0.15,
          `a encosta mais íngreme que achei tem ${p ? p.desnivel.toFixed(4) : '—'} m/m — ` +
          'plana demais para exercitar a cota');
        await h.play(() => window.__A.espera(400));
        const r = await h.play(([d, n, m]) => window.__PC.caminhada({
          degrau: d, degraus: n,
          antes: () => window.__PC.ligarEstado(m, true),
          depois: () => window.__PC.ligarEstado(m, false),
        }), [DEGRAU, DEGRAUS, modo]);
        assert.ok(!r.vazio && r.frames > 40, `só ${r.frames} frames — a sonda está cega`);
        console.log(`      ENCOSTA/${nome}: desnível ${p.desnivel.toFixed(4)} m/m · ` +
          `erro de chão máx ${r.erroChaoMax.toFixed(4)} m · ` +
          `salto VERTICAL da vista ${r.saltoY.toFixed(4)} m/frame · ` +
          `salto horizontal ${r.salto.toFixed(4)} m/frame · COLISOR ${r.colisor.toFixed(4)} m`);
        assert.ok(r.erroChaoMax <= 0.10,
          `a cota do colisor ficou ${r.erroChaoMax.toFixed(4)} m fora do terreno sob ele em ` +
          `${nome} — é essa dívida que a saída paga de uma vez`);
        assert.ok(r.saltoY <= SALTO_TETO,
          `ao SAIR de ${nome} a vista caiu ${r.saltoY.toFixed(4)} m num frame com a cabeça ` +
          `imóvel (teto ${SALTO_TETO} m) — A6 não distingue eixo`);
        await h.play(() => window.__PC.plantarEmCampoAberto());
      });
    }

    /* O CONTRAPESO DO CONSERTO, e ele é obrigatório: fazer o colisor seguir
       a cabeça em estado sem `playerUpdate` seria trocar um defeito de
       integridade de mundo por outro PIOR se a parede sumisse do caminho.
       Aqui o jogador anda de verdade contra um sólido com o painel aberto:
       o colisor tem de PARAR, e a separação resultante tem de acender a
       cortina — que é o contrato de `devolverPasso`/`xrcomfort`. */
    it('PAINEL ABERTO CONTRA PAREDE: o colisor para no sólido e a cortina fecha', async () => {
      const p = await h.play(() => window.__PC.plantarDianteDeParede(1.0));
      assert.ok(p, 'não achei sólido grande para a bancada de parede');
      await h.play(() => window.__A.espera(400));
      const r = await h.play(([d, n]) => window.__PC.caminhada({
        degrau: d, degraus: n,
        antes: () => { window.__game.XRUI.abrir('pausa'); },
        depois: () => { window.__game.XRUI.fechar(); },
      }), [DEGRAU, DEGRAUS]);
      assert.ok(!r.vazio && r.frames > 40, `só ${r.frames} frames — a sonda está cega`);
      console.log(`      PAREDE+PAINEL: passo ${r.passo.toFixed(4)} m · ` +
        `COLISOR ${r.colisor.toFixed(4)} m · sep máx ${r.sepMax.toFixed(4)} m · ` +
        `fora máx ${r.foraMax.toFixed(4)} m · escuro máx ${r.escuroMax.toFixed(3)}`);
      assert.ok(r.passo > DIST * 0.9, `o headset andou ${r.passo.toFixed(4)} m — cenário não aconteceu`);
      assert.ok(r.colisor < r.passo * 0.9,
        `o colisor andou ${r.colisor.toFixed(4)} m de ${r.passo.toFixed(4)} m contra um sólido — ` +
        'o corpo do jogador atravessou a parede com o painel aberto');
      assert.ok(r.foraMax > 0.15,
        `a separação recusada pelo mundo ficou em ${r.foraMax.toFixed(4)} m — o rig não soube que ` +
        'a cabeça saiu do corpo, e sem isso nenhuma cortina acende');
      assert.ok(r.escuroMax > 0.9,
        `a cortina de conforto chegou a ${r.escuroMax.toFixed(3)} com a cabeça ` +
        `${r.foraMax.toFixed(4)} m dentro do sólido — o jogador vê o outro lado`);
      // devolve a bancada ao campo aberto para não contaminar re-execuções
      await h.play(() => window.__PC.plantarEmCampoAberto());
    });
  });
