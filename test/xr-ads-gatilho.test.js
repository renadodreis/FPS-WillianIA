/* ================================================================
   QA — ADS POR BOTÃO (P0 do dono, rodada 2026-08-29), IWER real.

   O RELATO. O dono revogou a decisão antiga ("mirar em VR é só gesto físico",
   `docs/vr/referencia-arma-mira.md` §item 5 e o cabeçalho de `js/xr/xrinput.js`)
   e pediu, para esta frente: "o ADS em VR agora deve ser acionado por botão
   enquanto estiver pressionado e desligado ao soltar", com preferência pelo
   GATILHO ESQUERDO — a mão de apoio, que segura o gatilho hoje só para abrir
   o radial de quatro fatias (granada/kit médico/comer/troca de mira).

   POR QUE NÃO É O GRIP DIREITO (a "mira assistida" que já existe). O grip
   direito já significa EMPUNHAR (a máquina STICKY de `criarEmpunhadura`), e
   no modo `manter` (hold) soltar o grip para sair da mira SOLTARIA A ARMA
   junto — os dois verbos no mesmo botão colidem exatamente no modo que a
   acessibilidade pede. O gatilho esquerdo não carrega nenhuma máquina de
   estado: apertar/soltar é sempre a borda pura, em qualquer modo.

   POR QUE NÃO É O GRIP ESQUERDO (apoio/agarrar). Esse botão já é contextual —
   apoiar a arma, buscar o pente na recarga, ou agarrar o mundo — resolvido por
   DISTÂNCIA a três âncoras diferentes em js/xr/xrweapon.js. Empilhar "mirar"
   em cima disso faria segurar uma maçaneta também ligar o ADS.

   O ORÇAMENTO DE BOTÕES É FECHADO (5 por mão) e todos os outros nove já têm
   dono com motivo escrito. O gatilho esquerdo é o único sem máquina de estado
   e sem ambiguidade de modo — daí a preferência do dono bater com a análise.
   CONSEQUÊNCIA ACEITA: o radial perde o binding. RADIAL_FATIAS e
   `criarRadialXR` continuam existindo (não é código morto esquecido, é uma
   peça sem lar); repor um novo caminho para granada/kit médico/comer/troca de
   mira é a PRÓXIMA prioridade registrada em docs/vr/progresso.md — os quatro
   verbos não fazem parte do roteiro mínimo "já dá para jogar" desta frente.

   O QUE ESTE ARQUIVO MEDE:
   · `mouse.aiming` (o mesmo campo que espalhamento, sway, bob e retículo já
     leem — não um proxy) liga no aperto e desliga na soltura, com a mão
     direita LONGE do olho (isola o caminho do BOTÃO do caminho do GESTO);
   · o `ads` FÍSICO de `XRArma` (o gunstock — recuo da arma até o olho)
     continua baixo o tempo todo: o botão não pode empurrar a arma, só o
     espalhamento/retículo (é o mesmo B4 que já vale para a mira assistida);
   · a pose da arma RELATIVA À PALMA não pula ao apertar (B4: botão não
     teleporta a arma);
   · segurando o gatilho esquerdo para mirar, o radial de itens NÃO abre —
     guarda de regressão do conflito que motivou a troca de dono do botão.

   PORTA 3862 (livre — a mais alta em uso antes desta era 3860).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3862;
const f3 = v => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(3) : '?');

async function instalarSonda() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  let amostra = null;

  const rOrig = MP.renderer.render.bind(MP.renderer);
  MP.renderer.render = (cena, cam) => {
    const v = rOrig(cena, cam);
    const e = G.XRArma.estado();
    const gun = G.arsenal[G.gunIndex];
    const punho = G.XR.punho('right');
    let locP = null, locQ = null;
    if (punho && gun && gun.group) {
      punho.updateWorldMatrix(true, false);
      const inv = new T.Matrix4().copy(punho.matrixWorld).invert();
      const mm = new T.Matrix4().multiplyMatrices(inv, gun.group.matrixWorld);
      const p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3();
      mm.decompose(p, q, s);
      locP = p.toArray(); locQ = q.toArray();
    }
    amostra = {
      aiming: !!(G.mouse && G.mouse.aiming),
      adsFisico: e.ads,
      radialVisivel: G.XRInterage.estado().radial.visivel,
      radialAberto: G.XRInterage.estado().radial.aberto,
      locP, locQ,
    };
    return v;
  };

  window.__ADS = {
    ler: () => amostra,
    /* mão direita no quadril, longe do olho: qualquer ADS medido aqui só pode
       vir do BOTÃO, nunca do gesto de trazer a arma à cara. */
    maoLonge: () => {
      const d = window.__xrEmulado;
      d.controllers.right.position.set(0.25, 1.20, -0.25);
      d.controllers.right.quaternion.set(0, 0, 0, 1);
      d.position.set(0, 1.70, 0);
      d.quaternion.set(0, 0, 0, 1);
    },
    angulo: (a, b) => {
      const qa = new T.Quaternion().fromArray(a), qb = new T.Quaternion().fromArray(b);
      return 2 * Math.acos(Math.min(1, Math.abs(qa.dot(qb)))) * 180 / Math.PI;
    },
    espera: ms => window.__A.espera(ms),
  };
  return true;
}

describe('ADS por botão — gatilho esquerdo (P0 do dono)',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      await h.play(instalarSonda);
      await h.play(async () => { window.__ADS.maoLonge(); await window.__ADS.espera(500); });
    });
    after(async () => { if (h) await h.close(); });

    it('apertar o gatilho esquerdo liga a mira do jogo; soltar desliga — sem gesto físico', async () => {
      const antes = await h.play(() => window.__ADS.ler());
      const dur = await h.play(async () => {
        window.__A.botao('left', 'trigger', 1);
        await window.__ADS.espera(250);
        return window.__ADS.ler();
      });
      const dep = await h.play(async () => {
        window.__A.botao('left', 'trigger', 0);
        await window.__ADS.espera(250);
        return window.__ADS.ler();
      });
      console.log(`      antes: aiming=${antes.aiming} ads_fisico=${f3(antes.adsFisico)}`);
      console.log(`      apertado: aiming=${dur.aiming} ads_fisico=${f3(dur.adsFisico)}`);
      console.log(`      solto: aiming=${dep.aiming} ads_fisico=${f3(dep.adsFisico)}`);

      assert.equal(antes.aiming, false, 'nasceu mirando sem apertar nada');
      assert.equal(dur.aiming, true,
        'segurar o gatilho esquerdo tinha de ligar mouse.aiming (espalhamento/retículo do jogo)');
      assert.equal(dep.aiming, false,
        'soltar o gatilho esquerdo tinha de desligar mouse.aiming imediatamente');

      assert.ok(dur.adsFisico < 0.10,
        `o botão acendeu o ADS FÍSICO (${f3(dur.adsFisico)}) com a mão longe do olho — ` +
        'isso é o caminho do GESTO vazando, não o do botão (B4)');

      const dP = Math.hypot(
        dur.locP[0] - antes.locP[0], dur.locP[1] - antes.locP[1], dur.locP[2] - antes.locP[2]);
      const dA = await h.play((a, b) => window.__ADS.angulo(a, b), antes.locQ, dur.locQ);
      console.log(`      arma vs palma: andou ${f3(dP)} m, girou ${f3(dA)}°`);
      assert.ok(dP <= 0.01, `B4: o botão moveu a arma ${f3(dP)} m em relação à palma (teto 0,010)`);
      assert.ok(dA <= 1.0, `B4: o botão girou a arma ${f3(dA)}° em relação à palma (teto 1,0°)`);
    });

    it('segurando o gatilho esquerdo para mirar, o radial de itens NÃO abre', async () => {
      const dur = await h.play(async () => {
        window.__A.botao('left', 'trigger', 1);
        await window.__ADS.espera(250);
        return window.__ADS.ler();
      });
      await h.play(async () => {
        window.__A.botao('left', 'trigger', 0);
        await window.__ADS.espera(200);
      });
      console.log(`      radial: aberto=${dur.radialAberto} visivel=${dur.radialVisivel}`);
      assert.equal(dur.radialAberto, false,
        'o gatilho esquerdo ainda abriu o radial — o botão mudou de dono, o radial não pode continuar ouvindo');
      assert.equal(dur.radialVisivel, false,
        'o disco do radial apareceu na cena enquanto o jogador tentava mirar');
    });
  });
