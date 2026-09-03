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

   CORREÇÃO DE 2026-08-30 — A VERSÃO ANTERIOR DESTE ARQUIVO MEDIA A COISA
   ERRADA, E O DONO PROVOU ISSO NO APARELHO: "o modo mira que você está
   colocando é o modo normal de segurar a arma, eu deveria ver a MIRA da
   arma, não a arma". O teste original citava **B4** para proibir a arma de
   se mover com o gatilho esquerdo segurado — mas B4 (`docs/vr/criterio-aaa.md`)
   mede o botão **`right`/`squeeze`**, que é a MIRA ASSISTIDA (acessibilidade,
   correta em não mover a arma por design). O gatilho esquerdo é outro botão,
   com outro pedido: "acionado por botão enquanto estiver pressionado", que
   só faz sentido se a arma for ONDE o gesto físico a levaria — senão o botão
   liga só um número invisível (`mouse.aiming`, espalhamento/retículo) e o
   jogador nunca vê a mira de verdade, exatamente o relato acima. Confirmado
   em `js/xr/xrweapon.js`: sem `mirarBotao` forçando o `alvo` do `damp` de
   `adsT`, a arma media 0,00 m de deslocamento com o gatilho segurado.

   O QUE ESTE ARQUIVO MEDE, AGORA:
   · `mouse.aiming` liga no aperto e desliga na soltura, com a mão direita
     LONGE do olho (isola o caminho do BOTÃO do caminho do GESTO);
   · o `ads` FÍSICO de `XRArma` SOBE de verdade com o botão (o gunstock virtual
     se move) — é a mesma transição suave (`damp`, `SUAVIZA_ADS`) que o gesto
     físico já usa, não um valor congelado em zero;
   · a transição NÃO é instantânea (isso sim é B4, e continua valendo: nenhum
     botão pode TELEPORTAR a arma) — medido bem cedo, antes do `damp`
     terminar, o avanço é parcial, não um salto completo num frame;
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

  /* O EIXO ÓPTICO DE REFERÊNCIA, reconstruído do PERFIL DO MODELO — nunca de
     `XRArma.estado().eixo`, que é gerado pelo código sob teste (comparar uma
     reta consigo mesma já deu 1,86e-15 m nesta base com 0,12 m de erro real).
     `eye`/`front` da mira ativa são calibração do GLB desenhado; a matriz é a
     do `gun.group`, que é o objeto na tela. Amostrado DEPOIS do render, que é
     quando a pose de XR está escrita (o three a escreve dentro de `render`). */
  function eixoDoModelo(gun) {
    const idx = G.arsenal.indexOf(gun);
    const perfil = G.WeaponRig.inspect ? G.WeaponRig.inspect(idx) : null;
    const s = G.WeaponRig.activeSight ? G.WeaponRig.activeSight(gun) : null;
    if (!s || !perfil) return null;
    const c = (gun.modelStatus === 'fallback' && s.fb) ? s.fb : s;
    if (!c || !c.eye || !c.front) return null;
    const m = gun.group.matrixWorld;
    const a = new T.Vector3().fromArray(c.eye).applyMatrix4(m);
    const b = new T.Vector3().fromArray(c.front).applyMatrix4(m);
    return { ocular: a, eixo: b.sub(a).normalize() };
  }

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
    /* O OLHO CONTRA O EIXO DO MODELO, na pose DESENHADA (depois do puxão):
       `recuoReal` é o quanto o olho está atrás da ocular ao longo do eixo;
       `desvioReal` é a distância do olho à reta do eixo. Mirar de verdade é
       desvio ~0: o olho SOBRE a linha de mira. */
    let recuoReal = null, desvioReal = null;
    const ref = gun ? eixoDoModelo(gun) : null;
    if (ref) {
      const olho = new T.Vector3().setFromMatrixPosition(MP.camera.matrixWorld);
      const d = olho.clone().sub(ref.ocular);
      const proj = d.dot(ref.eixo);
      recuoReal = -proj;
      desvioReal = d.addScaledVector(ref.eixo, -proj).length();
    }
    amostra = {
      aiming: !!(G.mouse && G.mouse.aiming),
      adsFisico: e.ads,
      radialVisivel: G.XRInterage.estado().radial.visivel,
      radialAberto: G.XRInterage.estado().radial.aberto,
      locP, locQ, recuoReal, desvioReal,
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

    it('apertar o gatilho esquerdo TRAZ A ARMA AO OLHO de verdade — não só liga um número invisível', async () => {
      const antes = await h.play(() => window.__ADS.ler());
      /* amostra bem cedo (1-2 frames a 72Hz): só para EVIDÊNCIA de que a
         transição é suave (o `damp` de SUAVIZA_ADS), não um teleporte
         completo no mesmo frame — não é asserção travada em timing exato
         (janela curta demais para não flakar sob máquina carregada), é
         log para quem for investigar uma regressão futura. */
      const cedo = await h.play(async () => {
        window.__A.botao('left', 'trigger', 1);
        await window.__ADS.espera(20);
        return window.__ADS.ler();
      });
      const dur = await h.play(async () => {
        /* 400 ms: `SUAVIZA_ADS` = 14 deixa e^(-14·0,4) ≈ 0,4 % do caminho por
           andar — a 250 ms sobravam 3 %, que sobre 0,29 m de desvio natural
           é ~0,9 cm de "erro" que não é do produto, é do relógio. */
        await window.__ADS.espera(400);
        return window.__ADS.ler();
      });
      const dep = await h.play(async () => {
        window.__A.botao('left', 'trigger', 0);
        await window.__ADS.espera(250);
        return window.__ADS.ler();
      });
      console.log(`      antes: aiming=${antes.aiming} ads_fisico=${f3(antes.adsFisico)}`);
      console.log(`      cedo (~20ms): ads_fisico=${f3(cedo.adsFisico)}`);
      console.log(`      apertado (~400ms): aiming=${dur.aiming} ads_fisico=${f3(dur.adsFisico)}`);
      console.log(`      solto: aiming=${dep.aiming} ads_fisico=${f3(dep.adsFisico)}`);

      assert.equal(antes.aiming, false, 'nasceu mirando sem apertar nada');
      assert.equal(dur.aiming, true,
        'segurar o gatilho esquerdo tinha de ligar mouse.aiming (espalhamento/retículo do jogo)');
      assert.equal(dep.aiming, false,
        'soltar o gatilho esquerdo tinha de desligar mouse.aiming imediatamente');

      /* O PEDIDO DO DONO, medido no aparelho: "eu deveria ver a MIRA da
         arma, não a arma" — com a mão DIREITA longe do olho (isola o
         caminho do BOTÃO do caminho do GESTO), o ADS físico tem de subir
         de verdade, não ficar preso em zero. */
      assert.ok(dur.adsFisico > 0.85,
        `o botão não trouxe a arma pro olho (ads_fisico=${f3(dur.adsFisico)} depois de 250 ms) — ` +
        'o jogador continua vendo a arma na pose normal, não a mira');

      const dP = Math.hypot(
        dur.locP[0] - antes.locP[0], dur.locP[1] - antes.locP[1], dur.locP[2] - antes.locP[2]);
      const dA = await h.play((a, b) => window.__ADS.angulo(a, b), antes.locQ, dur.locQ);
      console.log(`      arma vs palma: andou ${f3(dP)} m, girou ${f3(dA)}°`);
      assert.ok(dP > 0.02,
        `a arma não saiu visivelmente da pose de quadril em relação à palma (só ${f3(dP)} m)`);

      /* O OLHO SOBRE A LINHA DE MIRA — medido contra o eixo do MODELO, não do
         módulo. A versão de 2026-08-30 puxava ao longo de punho→boca, e o
         olho ficava ~6 cm FORA do eixo óptico: o jogador via a óptica ACIMA
         da vista e o ponto vermelho no corpo da arma (fotografado no kit
         emulado). Reinjetando `_muzzleMundo − _gripMundo` no lugar de
         `_eixo`, este número volta para a casa dos centímetros e o caso
         morre. Teto 1,5 cm: metade do raio do ponto de um red dot pequeno
         ainda cabe; 6 cm é a óptica fora da vista. */
      console.log(`      olho contra o eixo do MODELO: recuo ${f3(dur.recuoReal)} m · desvio ${f3(dur.desvioReal)} m`);
      assert.ok(dur.desvioReal !== null, 'sem eixo de referência do modelo não há o que comparar');
      assert.ok(dur.desvioReal <= 0.015,
        `mirando pelo botão o olho ficou ${f3(dur.desvioReal)} m FORA da linha de mira (teto 0,015):` +
        ' o jogador vê a arma, não a mira');
      assert.ok(dur.recuoReal >= 0.14 && dur.recuoReal <= 0.45,
        `o olho ficou a ${f3(dur.recuoReal)} m atrás da ocular — fora da janela [0,14; 0,45] do ADS`);
    });

    it('o GRIP DIREITO também traz a arma ao olho (pedido do dono, 2026-09-03)', async () => {
      /* "no grip direito tem um botão onde você seleciona e solta a arma...
         ele deveria ser o botão de mira". Mesma fonte (`mirarBotao`), mesmo
         puxão, medido com a mão longe do olho. */
      await h.play(async () => { window.__ADS.maoLonge(); await window.__ADS.espera(400); });
      const antes = await h.play(() => window.__ADS.ler());
      const dur = await h.play(async () => {
        window.__A.botao('right', 'squeeze', 1);
        await window.__ADS.espera(400);
        return window.__ADS.ler();
      });
      const dep = await h.play(async () => {
        window.__A.botao('right', 'squeeze', 0);
        await window.__ADS.espera(300);
        return window.__ADS.ler();
      });
      const dP = Math.hypot(
        dur.locP[0] - antes.locP[0], dur.locP[1] - antes.locP[1], dur.locP[2] - antes.locP[2]);
      console.log(`      grip: aiming ${antes.aiming}→${dur.aiming}→${dep.aiming} · ads ${f3(antes.adsFisico)}→${f3(dur.adsFisico)}→${f3(dep.adsFisico)}` +
        ` · andou ${f3(dP)} m · desvio ${f3(dur.desvioReal)} m`);
      assert.equal(antes.aiming, false, 'já estava mirando antes de apertar');
      assert.equal(dur.aiming, true, 'o grip direito não ligou mouse.aiming');
      assert.ok(dur.adsFisico > 0.85, `o grip direito não trouxe a arma ao olho (ads ${f3(dur.adsFisico)})`);
      assert.ok(dP > 0.02, `a arma não saiu da pose de quadril (só ${f3(dP)} m)`);
      assert.ok(dur.desvioReal <= 0.015,
        `pelo grip o olho ficou ${f3(dur.desvioReal)} m fora da linha de mira (teto 0,015)`);
      assert.equal(dep.aiming, false, 'soltar o grip não desligou a mira');
      assert.ok(dep.adsFisico < 0.15, `soltar o grip não devolveu a arma (ads ${f3(dep.adsFisico)})`);
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
