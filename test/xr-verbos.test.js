/* ================================================================
   QA — D1: OS QUATRO VERBOS QUE NÃO TINHAM BOTÃO, DENTRO DA SESSÃO IMERSIVA.

   Granada (`KeyG`), kit médico (`KeyQ`), comer (`KeyF`) e trocar o acessório de
   mira (`KeyT`) não tinham mapeamento NENHUM no headset. E não era descuido: o
   Touch entrega cinco botões pressionáveis por mão (0,1,3,4,5 — o 2 é nulo, o 6
   é capacitivo e o 7 é reservado pela plataforma), e todos já tinham dono.
   Quatro verbos, um botão livre. Só fecha com seletor.

   O DESENHO: segurar o GATILHO da mão de apoio abre um radial de quatro
   fatias; o analógico DA MESMA MÃO escolhe a direção; soltar confirma. O
   gatilho está livre porque a correção de D3 o liberou (o agarre foi para a
   empunhadura). Não é o clique do analógico direito porque esse botão JÁ É a
   pausa (js/xr/xrui.js, BOTAO_MENU = 3) — e isso foi MEDIDO aqui: abrir o
   radial nele abria a pausa junto, e o jogo pausado nem processa o verbo. E não
   é o analógico direito que escolhe porque ali empurrar para o lado gira a
   vista 45°. Fontes e alternativas descartadas em
   docs/vr/referencia-interacao.md §4.

   O QUE ESTE ARQUIVO MEDE, E O QUE ELE NÃO MEDE — leia antes de confiar nele.

   Ele mede, em sessão imersiva REAL, tudo o que a camada de VR entrega
   sozinha: o code certo saindo do gesto certo, a DIREÇÃO decidindo qual verbo,
   uma confirmação por gesto (não uma por frame), o cancelamento, e dois efeitos
   de MUNDO que o radial não pode causar — girar a vista e andar.

   Ele NÃO mede a granada saindo do inventário, e isso é uma lacuna CONHECIDA e
   MEDIDA, não um esquecimento. As quatro teclas são lidas por
   `justPressed.has(...)` dentro de `shootUpdate` (game.js:2536‑2554), que roda
   na linha 3536 — ANTES de `XRInterage.update` (3550) — e `justPressed.clear()`
   (3635) apaga tudo no fim do mesmo frame. Um code emitido de dentro da camada
   de interação nunca chega a `shootUpdate`: foi despachado, foi visto no
   `window`, e morreu antes de ser lido. (O `KeyE` funciona porque
   `Interact.update` roda na 3554, DEPOIS.)

   Fechar isso é uma linha na ponte do game.js, no bloco de entrada que já roda
   cedo — e ela está no relatório desta entrega. O teste do EFEITO no inventário
   entra junto com a linha, e não antes: um teste que passasse hoje só poderia
   estar medindo um dublê.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3482;   // faixa exclusiva desta frente (3480-3488)

function instalarFerramentas() {
  const G = window.__game, MP = window.__MP;

  /* As quatro direções, na convenção do IWER (`updateAxes(id, x, y)`), que é a
     mesma do Touch: y NEGATIVO é para a frente/cima. */
  const DIR = { cima: [0, -1], direita: [1, 0], baixo: [0, 1], esquerda: [-1, 0] };

  /* Toda tecla que chega ao window, na ordem. É o caminho que o game.js escuta
     (game.js:1433 popula `keys`/`justPressed`) e o mesmo que o baú do BR usa. */
  window.__T = [];
  window.addEventListener('keydown', e => window.__T.push('+' + e.code));
  window.addEventListener('keyup', e => window.__T.push('-' + e.code));

  /* O gesto completo do radial. Os tempos são folgados de propósito: um frame
     perdido por carga da máquina não pode virar "o verbo não funciona". */
  async function radial(qual) {
    const d = DIR[qual] || [0, 0];
    window.__A.botao('left', 'trigger', 1);          // abre
    await window.__A.espera(140);
    window.__A.stick('left', d[0], d[1]);            // escolhe
    await window.__A.espera(220);
    window.__A.botao('left', 'trigger', 0);          // solta = confirma
    await window.__A.espera(240);
    window.__A.stick('left', 0, 0);
    await window.__A.espera(140);
  }

  /* abre o radial e solta SEM sair do centro: tem que cancelar */
  async function radialCancelado() {
    window.__A.botao('left', 'trigger', 1);
    await window.__A.espera(260);
    window.__A.botao('left', 'trigger', 0);
    await window.__A.espera(260);
  }

  /* só os codes do radial, sem o resto do teclado sintético do frame */
  const CODES = ['KeyG', 'KeyQ', 'KeyF', 'KeyT'];
  function verbos() {
    return window.__T.filter(t => CODES.includes(t.slice(1)));
  }
  function zerar() { window.__T.length = 0; }
  /* A INTENÇÃO de andar chegando ao jogo. O deslocamento em metros sozinho não
     serve de prova aqui: neste cenário a física horizontal pode nem rodar, e o
     teste passaria com a locomoção ligada (medido numa corrida de mutação). O
     que a camada de VR controla, e o que o jogo consome, é a TECLA. */
  const ANDAR = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft'];
  function locomocao() { return window.__T.filter(t => ANDAR.includes(t.slice(1))); }

  /* Cenário jogável: no chão, a pé, ferido (senão cura e comida seriam recusadas
     por `player.health >= maxHealth - 1`) e com item de cada.

     FECHAR O PAINEL É PARTE DO PREPARO, e isso custou uma corrida de mutação:
     o teste da pausa deixa o painel de XR ABERTO, e com painel aberto a ponte
     do game.js SOLTA todas as teclas (`ui3d.capturando`). Todo teste depois
     daquele media um jogo que não aceitava entrada nenhuma — e o assert de "não
     andou" passava porque nada andava, nunca. Zerar `state.paused` não basta:
     quem cala a entrada é o painel, não a bandeira. */
  function prontoParaUsar() {
    if (G.XRUI && G.XRUI.aberto) G.XRUI.fechar();
    window.__BR_active = false;
    window.__BR_freeze = false;
    const p = MP.player;
    p.pos.set(-120, G.heightAt(-120, -120), -120);
    p.vel.set(0, 0, 0);
    p.dead = false;
    p.health = 40;
    p.healPool = 0;
    G.state.paused = false;
    G.inventory.nades = 3;
    G.inventory.medkits = 3;
    G.inventory.meat = 3;
    window.__A.solta();
    zerar();
  }

  const onde = () => [MP.player.pos.x, MP.player.pos.z];

  window.__V = { radial, radialCancelado, verbos, locomocao, zerar, prontoParaUsar, onde, DIR,
    yaw: () => G.yawDaVista(), pausado: () => G.state.paused, uiAberto: () => !!(G.XRUI && G.XRUI.aberto) };
  return true;
}

/* SUSPENSO EM 2026-08-29: o pedido do dono ("ADS em VR agora deve ser
   acionado por botão enquanto estiver pressionado") tomou o gatilho esquerdo
   para o ADS (js/xr/xrinput.js, `out.mirar = botao(esquerda, 0)`), e não
   sobrou botão para o radial que este arquivo inteiro mede — `ler()` agora
   passa `null` para `criarRadialXR` e o radial nunca mais abre. Não é
   afrouxar critério: é o mecanismo medido aqui ter ficado, por decisão do
   dono, sem como ser acionado por controle nenhum. Repor os quatro verbos por
   outro caminho é a próxima prioridade registrada em docs/vr/progresso.md —
   quando isso acontecer, este arquivo volta a valer (ou é reescrito para o
   novo gesto). Manter os 9 casos ativos hoje só produziria positivo vazio
   (radial "não abre a pausa" porque não abre nada) ou vermelho por um
   mecanismo que ninguém pediu para consertar nesta iteração. */
describe('D1 — os quatro verbos sem botão, em sessão imersiva real',
  { skip: (!CHROME && 'Chrome não encontrado') ||
    'radial sem botão: gatilho esquerdo virou ADS em 2026-08-29 (ver docs/vr/progresso.md)' }, () => {
    let h;
    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      await h.play(instalarFerramentas);
      await h.play(async () => { window.__V.prontoParaUsar(); await window.__A.espera(300); });
    });
    after(async () => { if (h) await h.close(); });

    it('cada DIREÇÃO do analógico manda um verbo diferente — os quatro, sem trocar', async () => {
      /* O coração de D1: quatro ações que não tinham botão nenhum agora têm
         gesto, e a DIREÇÃO é o que as separa. Medir "saiu alguma tecla" deixaria
         passar um radial que manda sempre a mesma. */
      const r = await h.play(async () => {
        const saida = {};
        for (const qual of ['cima', 'direita', 'baixo', 'esquerda']) {
          window.__V.prontoParaUsar();
          await window.__A.espera(200);
          await window.__V.radial(qual);
          saida[qual] = window.__V.verbos();
        }
        return saida;
      });
      assert.deepEqual(r.cima, ['+KeyG', '-KeyG'], `fatia de cima: ${JSON.stringify(r.cima)}`);
      assert.deepEqual(r.direita, ['+KeyQ', '-KeyQ'], `fatia da direita: ${JSON.stringify(r.direita)}`);
      assert.deepEqual(r.baixo, ['+KeyF', '-KeyF'], `fatia de baixo: ${JSON.stringify(r.baixo)}`);
      assert.deepEqual(r.esquerda, ['+KeyT', '-KeyT'], `fatia da esquerda: ${JSON.stringify(r.esquerda)}`);
    });

    it('o keyup sai junto — sem ele a tecla fica presa para sempre', async () => {
      /* `keys[code] = true` só volta a false num keyup. Uma tecla presa não é
         só um bug de estado: `justPressed` só acusa borda quando `!keys[code]`,
         então o verbo funcionaria UMA vez e nunca mais. */
      const r = await h.play(async () => {
        window.__V.prontoParaUsar();
        await window.__A.espera(200);
        await window.__V.radial('cima');
        return { eventos: window.__V.verbos(), preso: !!window.__game.keys.KeyG };
      });
      assert.deepEqual(r.eventos, ['+KeyG', '-KeyG'], `veio ${JSON.stringify(r.eventos)}`);
      assert.equal(r.preso, false, 'KeyG ficou preso em `keys`: o verbo funcionaria uma vez só');
    });

    it('segurar a fatia manda UM verbo, não um por frame', async () => {
      /* A 72 Hz, confirmar enquanto o polegar está na fatia mandaria ~65 teclas
         em 0,9 s — o jogador esvaziaria o inventário só de olhar o menu. */
      const r = await h.play(async () => {
        window.__V.prontoParaUsar();
        await window.__A.espera(200);
        window.__A.botao('left', 'trigger', 1);
        await window.__A.espera(140);
        window.__A.stick('left', 0, -1);
        await window.__A.espera(900);                 // ~65 frames a 72 Hz
        window.__A.botao('left', 'trigger', 0);
        await window.__A.espera(240);
        window.__A.stick('left', 0, 0);
        await window.__A.espera(140);
        return { eventos: window.__V.verbos() };
      });
      const apertos = r.eventos.filter(t => t[0] === '+').length;
      assert.equal(apertos, 1,
        `segurar a fatia por ~0,9 s mandou ${apertos} vezes o verbo — tinha de mandar 1`);
    });

    it('abrir e soltar no CENTRO cancela — nenhum verbo sai', async () => {
      const r = await h.play(async () => {
        window.__V.prontoParaUsar();
        await window.__A.espera(200);
        await window.__V.radialCancelado();
        return { eventos: window.__V.verbos() };
      });
      assert.deepEqual(r.eventos, [],
        `abrir o menu e desistir mandou ${JSON.stringify(r.eventos)}: o radial gasta item por acidente`);
    });

    it('o radial NÃO abre a pausa — o botão dele não é o do menu', async () => {
      /* Colisão real, medida nesta rodada: o clique do analógico direito é o
         BOTAO_MENU de js/xr/xrui.js. Um radial ali abriria a pausa junto e o
         jogo pausado nem chegaria a processar o verbo. */
      const r = await h.play(async () => {
        window.__V.prontoParaUsar();
        await window.__A.espera(200);
        await window.__V.radial('cima');
        return { pausado: window.__V.pausado(), ui: window.__V.uiAberto(), eventos: window.__V.verbos() };
      });
      assert.equal(r.pausado, false, 'usar o radial pausou o jogo: ele está no botão do menu');
      assert.equal(r.ui, false, 'o painel de pausa abriu junto com o radial');
      assert.deepEqual(r.eventos, ['+KeyG', '-KeyG'], 'e o verbo tem que sair mesmo assim');
    });

    it('o clique do analógico direito continua sendo a PAUSA, e só ela', async () => {
      /* O outro lado da colisão: a pausa (VRC.Quest.Functional.2, obrigatória)
         não pode ter sido regredida por esta rodada, e o botão dela não pode
         mandar verbo.

         AVISO DE ALCANCE, aprendido numa corrida de mutação: pôr o radial TAMBÉM
         no clique direito não deixa este teste vermelho — a pausa abre, o tick
         do mundo para, e o verbo morre antes de ser despachado. O defeito
         mascara o próprio sintoma. Quem o pega é o unitário
         (test/xr-input.test.js, "o radial NÃO usa o clique do analógico
         direito"), que lê a intenção antes de o jogo pausar. O valor DESTE
         teste é o assert da pausa: ele prova que o menu do headset continua
         abrindo depois de tudo o que esta rodada mexeu no mapa de botões. */
      const r = await h.play(async () => {
        window.__V.prontoParaUsar();
        await window.__A.espera(250);
        window.__A.stick('left', 0, -1);                 // polegar numa fatia
        await window.__A.espera(120);
        window.__A.botao('right', 'thumbstick', 1);      // clique do menu
        await window.__A.espera(260);
        window.__A.botao('right', 'thumbstick', 0);
        await window.__A.espera(300);
        window.__A.stick('left', 0, 0);
        await window.__A.espera(160);
        return { eventos: window.__V.verbos(), pausado: window.__V.pausado(), ui: window.__V.uiAberto() };
      });
      assert.deepEqual(r.eventos, [],
        `o clique do analógico direito mandou ${JSON.stringify(r.eventos)}: o radial invadiu o botão da pausa`);
      assert.equal(r.ui, true,
        'o painel de pausa não abriu: a pausa do headset foi regredida (VRC.Quest.Functional.2 é obrigatório)');
    });

    it('escolher a fatia NÃO gira a vista — medido em radianos', async () => {
      /* O analógico direito é o do giro em passos. Se a escolha morasse nele,
         alcançar a fatia da direita daria um passo de 45° (0,785 rad) na cara do
         jogador. Botão e fatia moram os dois na mão de apoio justamente por
         isso, e este é o número que prova. */
      const r = await h.play(async () => {
        window.__V.prontoParaUsar();
        await window.__A.espera(250);
        const antes = window.__V.yaw();
        await window.__V.radial('direita');
        await window.__V.radial('esquerda');
        return { antes, depois: window.__V.yaw(), eventos: window.__V.verbos() };
      });
      assert.deepEqual(r.eventos, ['+KeyQ', '-KeyQ', '+KeyT', '-KeyT'],
        'o cenário não executou as duas fatias — o teste mediria o vazio');
      let d = Math.abs(r.depois - r.antes) % (Math.PI * 2);
      if (d > Math.PI) d = Math.PI * 2 - d;
      assert.ok(d < 0.09,
        `escolher duas fatias girou a vista ${d.toFixed(3)} rad (${(d * 180 / Math.PI).toFixed(1)}°) — um passo de giro é 0,785 rad`);
    });

    it('escolher a fatia NÃO faz o jogador andar — medido na tecla e em metros', async () => {
      /* O analógico que escolhe é o MESMO de andar. Sem suspender a locomoção,
         escolher a fatia de cima manda o jogador para a frente às cegas com o
         menu aberto — e no batente ainda por cima CORRENDO.

         A MESMA fatia duas vezes, de propósito. A primeira versão deste teste
         usava cima e depois baixo, e passava com o defeito reinjetado: os dois
         deslocamentos se cancelavam e o líquido dava zero. É a armadilha que já
         custou caro nesta base — o erro anulando a si mesmo. */
      const r = await h.play(async () => {
        window.__V.prontoParaUsar();
        await window.__A.espera(300);
        const antes = window.__V.onde();
        await window.__V.radial('cima');
        await window.__V.radial('cima');
        return { antes, depois: window.__V.onde(), eventos: window.__V.verbos(),
          andou: window.__V.locomocao() };
      });
      assert.deepEqual(r.eventos, ['+KeyG', '-KeyG', '+KeyG', '-KeyG'],
        'o cenário não executou as duas fatias — o teste mediria o vazio');
      assert.deepEqual(r.andou, [],
        `com o menu aberto a locomoção continuou ligada: saiu ${JSON.stringify(r.andou)}`);
      const d = Math.hypot(r.depois[0] - r.antes[0], r.depois[1] - r.antes[1]);
      assert.ok(d < 0.5,
        `escolher fatias andou ${d.toFixed(2)} m com o menu aberto: o analógico ficou fazendo as duas coisas`);
    });
  });
