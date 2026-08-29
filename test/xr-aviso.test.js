/* ================================================================
   QA — O AVISO CENTRAL DENTRO DO MUNDO (H1, IWER, sessão imersiva real).

   O DEFEITO: `centerMsg` é DOM, e dentro de uma sessão `immersive-vr` sem
   `dom-overlay` o DOM não chega ao compositor. Consequência medida:
   **"⚠ MÍSSEIS SE APROXIMANDO DA CIDADE" não existe no headset** — os
   mísseis voam, a cidade cai, e quem está de costas não recebe sinal
   nenhum. É o critério H1 do docs/vr/criterio-aaa.md ("nenhuma informação
   essencial vive só no DOM") no seu caso mais caro: a informação que
   decide se o jogador sai de dentro da cidade a tempo.

   O QUE ESTE ARQUIVO MEDE, EM NÚMERO — nada é lido do DOM:
   · a mensagem vira OBJETO NA CENA dentro da sessão, com o texto certo;
   · antes da primeira mensagem o objeto NÃO EXISTE (todo `Object3D` gasta
     4 números do `Math.random` seedado no UUID, e a ordem de consumo é
     contrato do worldgen);
   · distância ao olho, ângulo de encaramento e altura ANGULAR do texto
     em graus — que é o número que decide se dá para ler, não o pixel;
   · o painel NÃO é filho da câmera e NÃO acompanha giro pequeno de
     cabeça (H2: "Avoid locking HUD style content to the user's head
     movements"), mas ALCANÇA o jogador que vira de vez;
   · andar fisicamente para dentro dele não o traz para perto do olho
     (I3 e o piso de foco de 0,75 m do Oculus BP);
   · ele SOME sozinho, e o tempo é medido;
   · custo em draw calls por olho, por diferença pareada com mediana.

   ================================================================
   ESTE ARQUIVO NÃO CONDUZ O MÓDULO, E NÃO ENTREGA MENSAGEM

   Ele NÃO instala um condutor que chame `update()` por frame — essa é a
   armadilha que já custou seis rodadas nesta frente ("andaime que vira
   produto"): duas coisas conduzindo o mesmo módulo, e o teste medindo a
   briga. Quem chama `update()` continua sendo o jogo, uma vez por frame,
   e o único embrulho aqui é um OBSERVADOR que conta as chamadas.

   E ele também não espelha mais a mensagem. Nasceu com um adaptador que
   levava o `centerMsg` até o `XRHud` enquanto a fiação do `game.js` não
   existia; a fiação entrou (dentro do próprio `centerMsg`), e com o
   andaime ainda entregando o painel passou a receber a MESMA mensagem
   duas vezes — medido: `emitiu` = 2. O andaime saiu; o que ficou conta
   quantas chamadas de `centerMsg` passaram MUDAS. Arranque a linha do
   `game.js` e o último caso fica vermelho com número.

   PORTA 3652 (só deste arquivo).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3652;
const AVISO = '⚠ MÍSSEIS SE APROXIMANDO DA CIDADE';
/* Piso de foco confortável do Oculus Best Practices — "the optics … make it
   most comfortable to view objects that fall within a range of 0.75 to 3.5
   meters", e "minimum comfortable distance, 75 cm". */
const FOCO_MIN = 0.75;
/* Alvo de altura de maiúscula em que a tipografia de MR da Microsoft e o
   Android XR convergem, com piso absoluto de 0,35–0,4°. */
const TEXTO_ALVO = 0.7;
const TEXTO_PISO = 0.4;

const mediana = xs => {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

async function instalarFerramentas() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;

  /* OBSERVADOR DO `centerMsg` — e ele NÃO ENTREGA NADA. Este arquivo nasceu
     com um adaptador que espelhava a mensagem para o `XRHud` enquanto a
     fiação do `game.js` não existia; a fiação entrou (`game.js`, dentro do
     próprio `centerMsg`), e um andaime que continua entregando vira o
     segundo dono da mesma mensagem — foi exatamente o que aconteceu na
     primeira execução com a linha colada: `emitiu` deu 2.
     Agora o embrulho só CONTA. `mudos` sobe quando uma chamada de
     `centerMsg` passa sem o painel receber nada, que é a assinatura da
     fiação arrancada — arranque a linha do `game.js` e o caso final fica
     vermelho com número, em vez de ser socorrido pelo andaime. */
  let mudos = 0;
  const cmOrig = MP.centerMsg;
  MP.centerMsg = (texto, dur) => {
    const antes = (G.XRHud && G.XRHud.avisoEmissoes) || 0;
    const v = cmOrig(texto, dur);
    if (G.XR.presenting && G.XRHud && typeof G.XRHud.mensagem === 'function'
      && G.XRHud.avisoEmissoes === antes) mudos++;
    return v;
  };

  /* OBSERVADOR DO `update` — ele CONFERE, nunca preenche.

     A versão anterior deste embrulho repunha `rig` e `camera` na chamada:
     `Object.assign({}, o, { rig: G.XR.rig, camera: MP.camera })`. O cabeçalho
     dizia "o único embrulho aqui é um OBSERVADOR", e não era — quem faz
     `rig.add(aviso.obj)` é o `atualizarAviso`, que retorna cedo sem os dois.
     Consequência medida por validação independente: arrancando
     `rig: XR.rig, camera` da fiação do `game.js`, o painel de aviso SOME do
     grafo da cena (pai `null`, `naCena` false) e este arquivo continuava
     **9 de 9 verde**. H1 verde e desprotegido — o quarto formato da lista do
     CLAUDE.md, o teste dirigindo o produto em vez de observá-lo.

     Agora o embrulho só CONTA, e conta também as chamadas que chegaram SEM os
     argumentos que o produto precisa. `semArgs` é asserido abaixo: se a fiação
     do `game.js` sumir, ele sobe e o caso fica vermelho com número. */
  let updatesDoJogo = 0, semArgs = 0, suprimir = false;
  const uOrig = G.XRHud.update.bind(G.XRHud);
  G.XRHud.update = (o = {}) => {
    updatesDoJogo++;
    if (!o.rig || !o.camera) semArgs++;
    /* `suprimir` existe só para a medida de CUSTO: apagar o quad escrevendo
       `visible = false` à mão perderia a corrida contra o `update()` do jogo,
       que o reacende no frame seguinte enquanto a mensagem vive. Cortar o
       `rig` REMOVE um argumento que o jogo mandou — não fabrica nenhum —,
       então não pode fazer produto quebrado passar. */
    return suprimir ? uOrig(Object.assign({}, o, { rig: null })) : uOrig(o);
  };

  const vec = () => new T.Vector3();
  window.__AV = {
    contadores: () => ({ mudos, updatesDoJogo, semArgs }),
    /* dispara a MESMA chamada literal do evento da cidade */
    disparar: (texto = '⚠ MÍSSEIS SE APROXIMANDO DA CIDADE', ms = 3000) => MP.centerMsg(texto, ms),
    estado: () => {
      const cab = MP.camera.getWorldPosition(vec());
      const e = G.XRHud.estado(cab);
      return { aviso: e.aviso || null, cabeca: cab.toArray() };
    },
    objetoNaCena: nome => {
      let achou = false;
      MP.scene.traverse(o => { if (o.name === nome && o.visible && o.parent) achou = true; });
      return achou;
    },
    paiDoAviso: () => {
      const a = G.XRHud.aviso;
      if (!a || !a.parent) return null;
      return { nome: a.parent.name || '(sem nome)', eCamera: a.parent === MP.camera, eRig: a.parent === G.XR.rig };
    },
    posAviso: () => {
      const a = G.XRHud.aviso;
      if (!a) return null;
      a.updateWorldMatrix(true, false);
      return a.getWorldPosition(vec()).toArray();
    },
    /* gira a CABEÇA de verdade no runtime (não um dublê): yaw em graus */
    olhar: g => {
      const dev = window.__xrEmulado;
      const r = g * Math.PI / 180;
      dev.quaternion.set(0, Math.sin(r / 2), 0, Math.cos(r / 2));
    },
    andar: (x, z) => { window.__xrEmulado.position.set(x, 1.7, z); },
    parar: () => {
      const dev = window.__xrEmulado;
      dev.position.set(0, 1.7, 0);
      dev.quaternion.set(0, 0, 0, 1);
    },
    espera: ms => window.__A.espera(ms),

    /* CUSTO EM DRAW CALLS, POR DIFERENÇA PAREADA COM MEDIANA. A cena está
       viva (grama, animais, partículas) e a contagem oscila vários calls
       entre frames: janelas separadas por segundos misturam o custo da UI
       com a deriva do mundo. As duas leituras ficam a ~140 ms uma da outra
       e o que sai é a mediana das diferenças. */
    async custo(n) {
      const dif = [];
      const vis = [];
      for (let i = 0; i < n; i++) {
        MP.centerMsg('⚠ MÍSSEIS SE APROXIMANDO DA CIDADE', 4000);
        suprimir = false; await window.__A.espera(70);
        vis.push(!!(G.XRHud.estado(MP.camera.getWorldPosition(vec())).aviso || {}).visivel);
        const com = MP.renderer.info.render.calls;
        suprimir = true; await window.__A.espera(70);
        vis.push(!!(G.XRHud.estado(MP.camera.getWorldPosition(vec())).aviso || {}).visivel);
        dif.push(com - MP.renderer.info.render.calls);
      }
      suprimir = false;
      return { dif, acendeu: vis.filter((v, i) => i % 2 === 0).every(Boolean),
        apagou: vis.filter((v, i) => i % 2 === 1).every(v => !v) };
    },
  };
  return true;
}

describe('o aviso central existe DENTRO do mundo em VR (H1)',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      await h.play(instalarFerramentas);
      await h.play(() => window.__A.espera(600));
    });
    after(async () => { if (h) await h.close(); });

    it('antes da primeira mensagem o painel NÃO existe — nada nasce de graça', async () => {
      /* Todo `Object3D` gasta 4 números do `Math.random` seedado no UUID e a
         ordem de consumo é contrato do worldgen (test/carregamento-determinismo).
         Um painel criado no `update()` de graça, mesmo invisível, é consumo. */
      /* ESPERA PELA CONDIÇÃO, NÃO POR TEMPO. A afirmação "o jogo está
         conduzindo o módulo" continua sendo cobrada — sem ela, este caso
         mediria um painel que ninguém atualiza e o `null` valeria por
         qualquer motivo. O que mudou é COMO ela é esperada: a versão anterior
         lia a contagem uma vez, depois de 600 ms fixos, e sob a carga da
         suíte completa o boot só tinha rendido 9 frames — o caso ficou
         VERMELHO com a fiação intacta, e o runner classificou como regressão
         real. É a mesma lição do CLAUDE.md sobre medir com a máquina
         carregada, na forma de limiar de frames.

         Sondando até 12 s, a fiação morta continua reprovando (a contagem
         nunca sai do lugar) e a máquina lenta só demora mais. */
      const r = await h.play(async () => {
        const alvo = 12;
        for (let i = 0; i < 120 && window.__AV.contadores().updatesDoJogo <= alvo; i++) {
          await window.__A.espera(100);
        }
        return {
          aviso: window.__game.XRHud.aviso || null,
          updates: window.__AV.contadores().updatesDoJogo,
          semArgs: window.__AV.contadores().semArgs,
        };
      });
      assert.ok(r.updates > 10,
        `em 12 s o game.js chamou XRHud.update só ${r.updates} vezes — sem fiação viva não há o que medir`);
      /* A FIAÇÃO TEM DE MANDAR `rig` E `camera`. Sem eles `atualizarAviso`
         retorna cedo e o painel nunca entra no grafo — o aviso de mísseis
         simplesmente não existe no headset, com este arquivo verde. Foi assim
         que a validação independente derrubou a versão anterior deste teste:
         arrancando `rig: XR.rig, camera` do game.js, o painel sumia da cena
         (pai `null`) e os 9 casos continuavam passando. */
      assert.equal(r.semArgs, 0,
        `${r.semArgs} de ${r.updates} chamadas de XRHud.update chegaram sem \`rig\`/\`camera\` — ` +
        'sem eles o painel de aviso nunca entra no grafo da cena, e H1 fica verde e desprotegido');
      assert.equal(r.aviso, null,
        'o painel de aviso já existia antes de qualquer mensagem — objeto criado de graça');
    });

    it('a mensagem da cidade vira objeto no mundo, com o texto certo', async () => {
      const r = await h.play(async ([txt]) => {
        window.__AV.parar();
        await window.__AV.espera(300);
        window.__AV.disparar(txt, 4000);
        await window.__AV.espera(300);
        return {
          naCena: window.__AV.objetoNaCena('xrHudAviso'),
          e: window.__AV.estado(),
          pai: window.__AV.paiDoAviso(),
          c: window.__AV.contadores(),
        };
      }, [AVISO]);
      assert.equal(r.naCena, true,
        'a mensagem central continua só no DOM — no headset o jogador não recebe sinal nenhum (H1)');
      assert.ok(r.e.aviso, 'o painel de aviso não reportou estado');
      assert.equal(r.e.aviso.visivel, true, 'o painel nasceu apagado');
      assert.equal(r.e.aviso.texto, AVISO,
        `o painel mostra "${r.e.aviso.texto}" e a mensagem era "${AVISO}"`);
    });

    it('distância, encaramento e altura angular do texto — em graus', async () => {
      const r = await h.play(async ([txt]) => {
        window.__AV.parar();
        await window.__AV.espera(300);
        window.__AV.disparar(txt, 4000);
        await window.__AV.espera(400);
        return window.__AV.estado();
      }, [AVISO]);
      const a = r.aviso;
      assert.ok(a, 'sem painel não há o que medir');
      console.log(`      aviso: ${a.distancia.toFixed(4)} m · encara ${a.anguloEncara.toFixed(2)}° · ` +
        `painel ${a.grausH.toFixed(2)}° × ${a.grausV.toFixed(2)}° · texto ${a.grausTexto.toFixed(3)}°`);
      /* A faixa da Meta para painel grande de interação indireta é "around 1
         meter"; o piso óptico do Oculus BP é 0,75 m. O painel de sessão desta
         base vive a 1,004 m — o aviso não pode ser a exceção solta. */
      assert.ok(a.distancia >= FOCO_MIN && a.distancia <= 1.3,
        `o aviso apareceu a ${a.distancia.toFixed(4)} m do olho — fora da faixa de foco confortável`);
      assert.ok(a.anguloEncara < 12,
        `o painel está ${a.anguloEncara.toFixed(2)}° fora de encarar o olho — texto em perspectiva não se lê`);
      assert.ok(a.grausTexto >= TEXTO_ALVO,
        `a maiúscula do aviso mede ${a.grausTexto.toFixed(3)}° — o alvo é ${TEXTO_ALVO}° ` +
        `(piso absoluto ${TEXTO_PISO}°)`);
    });

    it('NÃO é colado na cara: giro pequeno não move o painel, giro grande alcança', async () => {
      /* H2, literal da Meta: "Avoid locking HUD style content to the user's
         head movements" — e a saída que a MESMA página autoriza: "Anchor
         information and digital content to a space, or loosely follow the
         user using smoothing animation". O teste mede as duas metades: o
         painel fica PARADO no mundo quando o jogador dá uma olhada, e ALCANÇA
         quem virou de vez ("prevent the users from having to turn their head").
         Head-locked reprova na primeira; ancorado-e-mudo reprova na segunda. */
      const r = await h.play(async ([txt]) => {
        window.__AV.parar();
        await window.__AV.espera(300);
        window.__AV.disparar(txt, 9000);
        await window.__AV.espera(400);
        const p0 = window.__AV.posAviso();
        window.__AV.olhar(20);                  // uma olhada de lado
        await window.__AV.espera(700);
        const p20 = window.__AV.posAviso();
        window.__AV.olhar(110);                 // virou de vez
        await window.__AV.espera(1400);
        const p110 = window.__AV.posAviso();
        const e = window.__AV.estado();
        window.__AV.parar();
        return { p0, p20, p110, pai: window.__AV.paiDoAviso(), e };
      }, [AVISO]);
      const d = (a, b) => Math.hypot(b[0] - a[0], b[2] - a[2]);
      const mexeu20 = d(r.p0, r.p20), mexeu110 = d(r.p0, r.p110);
      console.log(`      lazy-follow: olhada de 20° moveu ${mexeu20.toFixed(4)} m · ` +
        `virada de 110° moveu ${mexeu110.toFixed(4)} m · pai ${JSON.stringify(r.pai)}`);
      assert.equal(r.pai && r.pai.eCamera, false,
        'o painel de aviso é FILHO DA CÂMERA — é a definição de head-locked (H2)');
      assert.ok(mexeu20 < 0.05,
        `uma olhada de 20° arrastou o painel ${mexeu20.toFixed(4)} m — conteúdo colado na cabeça`);
      assert.ok(mexeu110 > 0.8,
        `virando 110° o painel andou só ${mexeu110.toFixed(4)} m — quem virou de costas ` +
        'para a cidade continua sem receber o aviso');
      assert.ok(r.e.aviso.anguloEncara < 12,
        `depois de alcançar, o painel ficou ${r.e.aviso.anguloEncara.toFixed(2)}° fora de encarar o olho`);
    });

    it('andar fisicamente para dentro dele não o enfia no olho (I3)', async () => {
      /* A armadilha estrutural do lazy-follow por ÂNGULO: andar em linha reta
         para a frente não muda o erro angular nenhum grau, então um painel
         que só corrige ângulo fica parado enquanto a cabeça chega nele.
         1,00 m de caminhada física contra um painel a 1,00 m = painel dentro
         do olho. O critério I3 proíbe geometria a menos de 0,15 m. */
      const r = await h.play(async ([txt]) => {
        window.__AV.parar();
        await window.__AV.espera(300);
        window.__AV.disparar(txt, 9000);
        await window.__AV.espera(400);
        let minimo = Infinity;
        for (let i = 1; i <= 50; i++) {          // 1,00 m em degraus de 2 cm
          window.__AV.andar(0, -i * 0.02);       // −Z é a frente
          await window.__AV.espera(20);
          const e = window.__AV.estado();
          if (e.aviso && e.aviso.visivel) minimo = Math.min(minimo, e.aviso.distancia);
        }
        const fim = window.__AV.estado();
        window.__AV.parar();
        return { minimo, fim: fim.aviso ? fim.aviso.distancia : null };
      }, [AVISO]);
      console.log(`      caminhada de 1,00 m contra o painel: distância mínima ${r.minimo.toFixed(4)} m`);
      assert.ok(Number.isFinite(r.minimo), 'o painel sumiu no meio da caminhada — nada foi medido');
      assert.ok(r.minimo >= FOCO_MIN,
        `andando 1 m para a frente o painel chegou a ${r.minimo.toFixed(4)} m do olho — ` +
        `abaixo do piso de foco de ${FOCO_MIN} m do Oculus BP`);
    });

    it('some sozinho, e o tempo bate com o pedido', async () => {
      /* "Mensagem que fica é pior que mensagem que falta": um aviso preso na
         vista vira obstáculo permanente, e em VR não há tecla para fechá-lo. */
      const r = await h.play(async ([txt]) => {
        window.__AV.parar();
        await window.__AV.espera(300);
        const t0 = performance.now();
        window.__AV.disparar(txt, 1200);
        await window.__AV.espera(300);
        const aceso = !!(window.__AV.estado().aviso || {}).visivel;
        let sumiuEm = null;
        for (let i = 0; i < 60 && sumiuEm === null; i++) {
          await window.__AV.espera(100);
          const e = window.__AV.estado().aviso;
          if (!e || !e.visivel) sumiuEm = performance.now() - t0;
        }
        return { aceso, sumiuEm };
      }, [AVISO]);
      assert.equal(r.aceso, true, 'o aviso nem chegou a acender — o cenário não aconteceu');
      assert.ok(r.sumiuEm !== null, 'o aviso ficou aceso por mais de 6 s depois de um pedido de 1,2 s');
      console.log(`      pedido 1200 ms · sumiu em ${Math.round(r.sumiuEm)} ms`);
      assert.ok(r.sumiuEm >= 1100 && r.sumiuEm <= 2000,
        `o aviso sumiu em ${Math.round(r.sumiuEm)} ms para um pedido de 1200 ms`);
    });

    it('custa uma draw call por olho', async () => {
      const r = await h.play(async () => {
        const c = await window.__AV.custo(9);
        /* A PROVA DE QUE A MEDIDA NÃO ESTÁ CEGA: se o painel não tiver
           acendido e apagado em TODAS as janelas, a diferença acima está
           medindo a deriva do mundo e não o quad. */
        window.__MP.centerMsg('⚠ MÍSSEIS SE APROXIMANDO DA CIDADE', 4000);
        await window.__A.espera(250);
        return Object.assign({ aceso: !!(window.__AV.estado().aviso || {}).visivel }, c);
      });
      const custo = mediana(r.dif);
      console.log(`      custo do aviso em draw calls (estéreo, diferença pareada): ${custo}  [${r.dif.join(' ')}]`);
      assert.equal(r.acendeu, true, 'o painel não acendeu em alguma janela — a medida é cega');
      assert.equal(r.apagou, true, 'o painel não apagou em alguma janela — a medida é cega');
      assert.equal(r.aceso, true, 'o painel não voltou a acender depois da medida');
      /* 2 = 1 quad × 2 olhos. O teto em 2 pega a regressão que já aconteceu
         neste módulo: com `side: DoubleSide` o three desenha material
         transparente em DOIS passes e o custo dobra. */
      assert.ok(custo >= 1 && custo <= 2,
        `o aviso custou ${custo} draw calls em estéreo — o esperado é 2 (1 quad × 2 olhos)`);
    });

    it('quem alimenta o painel é a fiação do game.js, e ela entrega uma vez só', async () => {
      /* ESTE É O CASO QUE MORRE SE A LINHA DO `game.js` FOR ARRANCADA. Não
         há mais andaime entregando mensagem neste arquivo (ver o cabeçalho
         do observador): o único caminho entre `centerMsg` e o painel é o
         do produto. Tirando a linha, `emitiu` cai para 0, `mudos` sobe e o
         caso fica vermelho com número — que é a única defesa que funciona
         contra teste que passa por acidente. */
      const r = await h.play(async () => {
        const mudosAntes = window.__AV.contadores().mudos;
        const emissoes = window.__game.XRHud.avisoEmissoes;
        window.__MP.centerMsg('⚠ MÍSSEIS SE APROXIMANDO DA CIDADE', 1500);
        await window.__A.espera(300);
        return {
          mudos: window.__AV.contadores().mudos - mudosAntes,
          emitiu: window.__game.XRHud.avisoEmissoes - emissoes,
          updatesDoJogo: window.__AV.contadores().updatesDoJogo,
          aceso: !!(window.__AV.estado().aviso || {}).visivel,
        };
      });
      console.log(`      centerMsg → painel: ${r.emitiu} mensagem(ns) · chamadas mudas ${r.mudos} · ` +
        `updates do jogo ${r.updatesDoJogo}`);
      assert.equal(r.mudos, 0,
        'uma chamada de centerMsg passou sem o painel receber nada — a fiação do game.js sumiu do `centerMsg`');
      /* UM DONO SÓ. Dois espelhos para a mesma mensagem fazem `emitiu` virar
         2 — foi o que aconteceu quando a fiação entrou com o andaime deste
         arquivo ainda entregando. */
      assert.equal(r.emitiu, 1,
        `uma chamada de centerMsg produziu ${r.emitiu} mensagens no painel`);
      assert.equal(r.aceso, true, 'uma chamada de centerMsg não acendeu o aviso no mundo');
      assert.ok(r.updatesDoJogo > 50,
        `o game.js chamou XRHud.update só ${r.updatesDoJogo} vezes — sem o jogo conduzindo, ` +
        'tudo acima mediu o teste dirigindo o módulo');
    });

    it('sem erro de console durante a sessão inteira (I2)', async () => {
      assert.deepEqual(h.pageErrors, [], 'erro de página durante a sessão');
      assert.deepEqual(h.consoleErrors, [], 'erro de console durante a sessão');
    });
  });
