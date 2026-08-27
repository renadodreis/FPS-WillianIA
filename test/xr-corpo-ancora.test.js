/* ================================================================
   QA — O CORPO EM PRIMEIRA PESSOA ANCORA NA CABEÇA (critério C5, e o C2
   que o dono do projeto descreveu com as próprias palavras).

   As duas queixas são a mesma geometria vista de dois ângulos:

     "O BONECO PARECE ÀS VEZES ENTERRADO NO CHÃO"
     "O CORPO ONDE SEGURA A ARMA PARECE DESLOCADO DO CENTRO"

   MEDIDO ANTES DE ESCREVER UMA LINHA (sessão imersiva IWER, headset a
   1,70 m, corpo lido OSSO A OSSO no mundo):

     em pé ................ ombro 0,349 m ABAIXO do olho ✔
     agachado a 1,15 m .... ombro 0,185 m ACIMA do olho ✘
                            topo do boneco 0,709 m acima do olho
     depois de um pico de
     rastreio de 2,05 m ... `alturaDePe` travou em 2,05; o jogador EM PÉ
                            ficou com `agachado: true` e `crouchT: 1`, e
                            o boneco 21 % maior (escala 1,0787)

   Ou seja: baixar a cabeça deixava o jogador com a vista saindo do meio
   do TÓRAX do boneco, e um pico de rastreio de 0,4 s o deixava agachado
   no jogo — colisor menor, velocidade de agachado — enquanto ele estava
   de pé.

   A CAUSA de metade disso era uma escolha explícita do módulo: a origem
   do corpo era `Math.max(alturaCabeca, olho − AFUNDA_MAX)`, ou seja, os
   PÉS tinham prioridade sobre a CABEÇA. O VRIK documenta esse mesmo
   trade-off pelo nome — `plantFeet` "can cause the camera to exit the
   head" —, e o critério C5 cobra o outro lado ("o corpo ancorado na
   cabeça com erro ≤ 0,05 m"). Quem está DENTRO do corpo não vê os
   próprios pés furarem o chão; vê o próprio peito na altura dos olhos.

   COMO ESTE ARQUIVO MEDE: pela posição de MUNDO dos ossos, dentro de uma
   sessão immersive-vr de verdade, amostrada DEPOIS do rig ser posto no
   lugar deste frame (`rig.matrixWorld × cameras[0].matrix`) — nunca
   `camera.getWorldPosition()`, que compõe rig(N) com pose(N−1) e já fez
   um teste desta base passar por acidente.

   PORTA 3540 (só deste arquivo).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3540;

describe('o corpo em 1ª pessoa ancora na cabeça do jogador',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      await h.play(async () => {
        const G = window.__game;
        for (let i = 0; i < 300 && !(G.FpBody.ready || G.FpBody.failed); i++) {
          await new Promise(r => setTimeout(r, 100));
        }
        if (!G.FpBody.ready) throw new Error('FpBody não carregou o GLB');
      });
      /* Amostrador por frame, pendurado no `place` — que roda depois do rig
         ser posicionado, no mesmo instante em que o quadro é composto. */
      await h.play(() => {
        const G = window.__game, MP = window.__MP, T = MP.THREE;
        const xrCam = MP.renderer.xr.getCamera();
        const _m = new T.Matrix4(), olho = new T.Vector3(), _p = new T.Vector3();
        const box = new T.Box3();
        const orig = G.XR.place.bind(G.XR);
        window.__C = { amostra: null };
        G.XR.place = (...a) => {
          const v = orig(...a);
          G.XR.rig.updateMatrixWorld(true);
          _m.multiplyMatrices(G.XR.rig.matrixWorld, xrCam.cameras[0].matrix);
          olho.setFromMatrixPosition(_m);
          const raiz = G.FpBody.bodyRoot;
          const B = G.FpBody.bones || {};
          const rel = nome => {
            const b = B[nome];
            if (!b) return null;
            b.getWorldPosition(_p);
            return { dy: _p.y - olho.y, dxz: Math.hypot(_p.x - olho.x, _p.z - olho.z) };
          };
          let topo = null, base = null;
          if (raiz && raiz.parent) {
            box.setFromObject(raiz);
            if (!box.isEmpty()) { topo = box.max.y - olho.y; base = box.min.y; }
          }
          window.__C.amostra = {
            olhoY: olho.y,
            chao: MP.groundAt(olho.x, olho.z, olho.y),
            topo, base,
            ombroR: rel('shR'), ombroL: rel('shL'), chest: rel('chest'), torso: rel('torso'),
            escala: G.XR.corpo.escala,
            altCabeca: G.XR.corpo.alturaCabeca,
            altDePe: G.XR.corpo.alturaDePe,
            agachado: G.XR.corpo.agachado,
            crouchT: MP.player.crouchT,
          };
          return v;
        };
      });
    });
    after(async () => { if (h) await h.close(); });

    /* Põe o headset numa altura/pitch e devolve a amostra do frame.

       AS ESPERAS SÃO GENEROSAS DE PROPÓSITO. A janela de sustentação da
       altura (0,75 s) corre em tempo SIMULADO, e `game.js:3279` clampa o
       passo em 50 ms — num Chrome de teste a 10 fps, um segundo de relógio
       vale meio segundo de simulação. O clamp só encurta o tempo simulado,
       nunca o alonga: por isso o caso do PICO (400 ms) continua sendo um
       pico em qualquer máquina, e os casos que esperam CONFIRMAÇÃO precisam
       de folga. */
    const pose = async (y, ms = 2500, pitch = 0) => await h.play(async (yy, mm, pp) => {
      const dev = window.__xrEmulado, A = window.__A;
      dev.position.set(0, yy, 0);
      const p = pp * Math.PI / 180;
      dev.quaternion.set(Math.sin(p / 2), 0, 0, Math.cos(p / 2));
      await A.espera(mm);
      return window.__C.amostra;
    }, y, ms, pitch);

    it('EM PÉ: ombros abaixo do olho, pés no chão, boneco do tamanho do jogador', async () => {
      /* A linha de base que não pode regredir. Falha se o boneco deixar de
         ser dimensionado pelo jogador (a versão de desktop tem altura fixa de
         2,10 m com o olho a 1,90: um jogador de 1,70 de olho ficaria com os
         pés 20 cm abaixo do chão). */
      const a = await pose(1.70);
      assert.ok(a.ombroR.dy < -0.10 && a.ombroL.dy < -0.10,
        `ombros em ${a.ombroR.dy.toFixed(3)} / ${a.ombroL.dy.toFixed(3)} m em relação ao olho`);
      assert.ok(Math.abs(a.base - a.chao) < 0.05,
        `os pés do boneco ficaram a ${(a.base - a.chao).toFixed(4)} m do chão ` +
        `(altDePe ${a.altDePe.toFixed(3)} · altCabeca ${a.altCabeca.toFixed(3)} · escala ${a.escala.toFixed(4)})`);
      assert.ok(Math.abs(a.olhoY - a.chao - 1.70) < 0.02,
        `a folga cabeça↔chão deu ${(a.olhoY - a.chao).toFixed(4)} m com o headset a 1,70`);
    });

    it('AGACHADO: o corpo não agacha junto — LIMITE CONHECIDO, travado por número', async () => {
      /* ISTO NÃO É UM VERDE, É UMA CERCA. O jogador que agacha 0,55 m fica com
         o ombro do boneco ACIMA do próprio olho: a vista sai do meio do tórax.
         O critério C5 pede o contrário ("corpo ancorado na cabeça com erro
         ≤ 0,05 m"), e o VRIK nomeia o trade-off — `plantFeet` "can cause the
         camera to exit the head".

         Ancorar na cabeça foi TENTADO E MEDIDO nesta rodada: resolve o tórax e
         enterra o pé em 0,31 a 0,47 m, porque o modelo do js/fpbody.js NÃO
         encurta ao agachar (a dobra de `crouchT` gira coxa e canela em sentidos
         que mantêm o pé onde está — o osso mais baixo não se move com `crouchT`
         indo de 0 a 1). Sem um solver que encurte a perna, os dois defeitos são
         o mesmo cobertor curto, e o conserto mora em js/fpbody.js.

         Enquanto isso, o número fica TRAVADO aqui: falha se PIORAR. Foi assim
         que este defeito cresceu sem ninguém ver — ninguém media. */
      await pose(1.70, 2500);
      const a = await pose(1.15, 1800);
      assert.ok(a.topo < 0.80,
        `o topo do boneco ficou ${a.topo.toFixed(4)} m acima do olho do jogador agachado ` +
        '(medido nesta rodada: 0,709 m; em pé são ~0,18 m, que é o alto da cabeça)');
      assert.ok(a.ombroR.dy < 0.25,
        `o ombro do boneco subiu para ${a.ombroR.dy.toFixed(4)} m acima do olho ` +
        '(medido nesta rodada: +0,185 m)');
    });

    it('e o corpo continua ancorado no eixo da cabeça, não deslocado do centro', async () => {
      /* A outra metade da queixa ("deslocado do centro"). O tronco fica
         recuado de propósito (a pose do visor está À FRENTE dos olhos —
         Population: ONE consertou isso com "set height at center of head
         instead of headset"), então o que se cobra é a ORDEM DE GRANDEZA do
         recuo, não zero. Falha se o tronco escorregar para longe do eixo. */
      const a = await pose(1.70, 2500);
      assert.ok(a.torso.dxz < 0.25,
        `o tronco ficou a ${a.torso.dxz.toFixed(4)} m do eixo da cabeça`);
      const b = await pose(1.15, 1800);
      assert.ok(b.torso.dxz < 0.30,
        `agachado, o tronco ficou a ${b.torso.dxz.toFixed(4)} m do eixo da cabeça`);
    });

    it('um PICO de rastreio não deixa o jogador agachado no jogo para sempre', async () => {
      /* Medido no ajuste anterior: a altura "em pé" era o MÁXIMO histórico
         absoluto, então 0,4 s de headset erguido (jogador ajeitando a
         correia, rastreio pulando) travava a referência em 2,05 m — e o
         jogador DE PÉ ficava com `agachado: true`, `crouchT: 1` e o boneco
         21 % maior, pelo resto da sessão.

         Falha se a referência voltar a subir na primeira leitura alta. O que
         a protege é exigir SUSTENTAÇÃO: quem cresceu de verdade continua
         alto no frame seguinte. */
      await pose(1.70, 2500);
      const antes = await pose(1.70, 300);
      await pose(2.05, 400);                    // o pico
      const depois = await pose(1.70, 2000);    // e o jogador, de pé, como antes
      assert.equal(depois.agachado, false,
        `um pico de 0,35 m por 0,4 s deixou o jogador agachado (altDePe ${depois.altDePe.toFixed(3)})`);
      assert.ok(depois.crouchT < 0.2,
        `o jogo ficou com crouchT ${depois.crouchT.toFixed(2)} com o jogador em pé`);
      assert.ok(Math.abs(depois.escala - antes.escala) < 0.02,
        `o boneco mudou de tamanho por causa do pico: ${antes.escala.toFixed(4)} → ${depois.escala.toFixed(4)}`);
    });

    it('…mas LEVANTAR de verdade (sustentado) continua recalibrando a altura', async () => {
      /* O outro lado da mesma moeda: exigir sustentação não pode virar "a
         referência nunca sobe". Quem estica o corpo, troca de tênis ou entra
         na sessão sentado e levanta tem que ser medido de pé — senão o boneco
         fica pequeno e o jogo deixa o jogador agachado permanentemente, que é
         o defeito de cima com o sinal trocado.

         O par com o caso anterior é o que dá sentido aos dois: MESMA altura,
         tempos diferentes. 0,4 s não move a referência; 2 s move. */
      const antes = await pose(1.70, 2500);
      const sustentado = await pose(2.02, 3500);
      assert.ok(sustentado.altDePe > antes.altDePe + 0.2,
        `2 s a 2,02 m não moveram a referência (${antes.altDePe.toFixed(3)} → ${sustentado.altDePe.toFixed(3)})`);
      assert.equal(sustentado.agachado, false, 'o jogador que levantou continuou marcado como agachado');
      /* e devolve o estado para os outros casos não herdarem 2,02 m */
      await pose(1.70, 2500);
    });
  });
