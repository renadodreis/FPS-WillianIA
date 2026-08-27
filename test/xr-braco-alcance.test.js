/* ================================================================
   QA — O BRAÇO QUE O IK PEDE TEM DE SER O BRAÇO QUE EXISTE.

   O DEFEITO, MEDIDO ANTES DE ESCREVER UMA LINHA (sonda IWER, headset a
   1,70 m, fuzil na mão, ossos lidos no MUNDO logo depois do solver do
   frame):

     escala da raiz do boneco em VR ......... 0,89455
     braço+antebraço que os ossos vencem .... 0,5881 m
     braço+antebraço alimentado no solver ... 0,6574 m   (+11,79 %)
     raiz do braço → empunhadura ............ 0,6245 m   (> 0,5881: impossível)
     mão do boneco → empunhadura ............ 0,0639 m ✘
     ângulo do cotovelo ..................... 145,51°

     MESMO CÓDIGO no desktop, com a raiz em escala 1:
     pedido = real = 0,6574 m, mão → empunhadura = 0,0000 m ✔

   `armLen` é medido UMA VEZ no carregamento, com a raiz em escala 1. Em
   VR js/xr/xrbody.js dimensiona o boneco pelo jogador (escala = altura do
   olho ÷ olho do modelo) e o solver continua trabalhando em METROS DE
   MUNDO: a lei dos cossenos recebe um braço 12 % maior do que o que os
   ossos vencem. A clavícula então PARA de estender cedo demais — ela mira
   `alcance × reachBend`, e esse alcance é o falso —, o triângulo fica
   inconsistente e a mão do boneco fica um palmo fora da empunhadura do
   controle. É o mesmo defeito de escala que a perna tinha (o joelho
   dobrado a 130,9° com o jogador de pé), e a queixa do dono é a mesma
   frase: "o corpo onde segura a arma parece deslocado do centro".

   COMO ESTE ARQUIVO MEDE:

   - POSIÇÃO DE OSSO (`bone.getWorldPosition`) e distância em METROS.
     Nunca `Box3.setFromObject` num SkinnedMesh: o three calcula a caixa
     deformada uma vez e guarda em `mesh.boundingBox` ("If the skinned
     mesh is animated, the bounding box should be recomputed per frame in
     order to reflect the current animation state" — fonte do three
     0.185.1), então a caixa segue a RAIZ e não o osso.
   - O NÚMERO QUE ENTROU NO SOLVER, e não um proxy dele: `FpBody.alcanceDoIK`
     é o próprio par de comprimentos alimentado na lei dos cossenos naquele
     frame, em metros de mundo.
   - A amostra sai de um gancho no `FpBody.update`, DEPOIS do solver: é o
     único instante em que os ossos e as âncoras da arma são do mesmo frame.
   - O DESKTOP entra como CONTROLE: mesmo solver, mesma arma, raiz em
     escala 1. Se o defeito fosse do IK, apareceria nos dois.

   PORTAS 3610 (VR) e 3612 (desktop) — faixa exclusiva desta frente.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

/* Tolerância da mão na empunhadura. O dedo do boneco tem ~2 cm; acima disso
   a mão deixa de estar NA arma e passa a flutuar ao lado dela. */
const MAO_NA_ARMA = 0.02;

async function esperarCorpo() {
  const G = window.__game;
  for (let i = 0; i < 300 && !(G.FpBody.ready || G.FpBody.failed); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  if (!G.FpBody.ready) throw new Error('FpBody não carregou o GLB');
}

/* Sonda: engancha no FpBody.update e lê os ossos DEPOIS do solver do frame. */
function instalarSonda() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  const raiz = G.FpBody.bodyRoot, B = G.FpBody.bones;
  const _a = new T.Vector3(), _b = new T.Vector3(), _p = new T.Vector3();
  const wp = o => o.getWorldPosition(new T.Vector3());
  const orig = G.FpBody.update.bind(G.FpBody);
  window.__M = { amostra: null, erro: null };
  G.FpBody.update = function (dt, t) {
    const v = orig(dt, t);
    try {
      const g = G.arsenal[G.gunIndex];
      const seg = (x, y) => wp(x).distanceTo(wp(y));
      const ang = (p, q, r) => {
        _a.copy(wp(p)).sub(wp(q)); _b.copy(wp(r)).sub(wp(q));
        if (_a.lengthSq() < 1e-9 || _b.lengthSq() < 1e-9) return null;
        return Math.acos(Math.min(1, Math.max(-1,
          _a.normalize().dot(_b.normalize())))) * 180 / Math.PI;
      };
      const braco = (lado, up, fo, ha, sh, anc) => {
        const pedido = G.FpBody.alcanceDoIK[lado];
        const real = seg(up, fo) + seg(fo, ha);
        const raizP = wp(up), maoP = wp(ha), ombroP = wp(sh);
        return {
          a: seg(up, fo), b: seg(fo, ha),
          real,
          pedido: pedido.a + pedido.b,
          dRaizAlvo: anc ? raizP.distanceTo(anc) : null,
          resid: anc ? maoP.distanceTo(anc) : null,
          cotovelo: ang(up, fo, ha),
          /* o ombro tem de ficar ATRÁS da mão: a clavícula estende rumo à
             arma, e se ela passar da mão o tronco viaja junto com o cano */
          ombroAteMao: ombroP.distanceTo(maoP),
          ombroAteAlvo: anc ? ombroP.distanceTo(anc) : null,
          ombro: ombroP.toArray(), mao: maoP.toArray(), cotoveloP: wp(fo).toArray(),
        };
      };
      const ancR = g && g.parts && g.parts.handR ? wp(g.parts.handR) : null;
      const ancL = g && g.parts && g.parts.handL ? wp(g.parts.handL) : null;
      /* EM XR a pose da câmera é escrita pelo three DENTRO do render(): ler
         com getWorldPosition recompõe a matriz e devolve o frame anterior. */
      _p.setFromMatrixPosition(G.camera.matrixWorld);
      window.__M.amostra = {
        escala: raiz.scale.x,
        visivel: raiz.visible,
        R: braco('r', B.upR, B.foR, B.haR, B.shR, ancR),
        L: braco('l', B.upL, B.foL, B.haL, B.shL, ancL),
        olho: _p.toArray(),
        ancR: ancR ? ancR.toArray() : null,
        ancL: ancL ? ancL.toArray() : null,
        arma: g ? g.name || String(G.gunIndex) : null,
        melee: !!(g && g.melee),
      };
    } catch (e) { window.__M.erro = String((e && e.message) || e); }
    return v;
  };
  return { ok: !!(B.upR && B.foR && B.haR && B.upL && B.foL && B.haL) };
}

/* Move um controle em coordenadas de MUNDO (o IWER recebe no espaço do rig). */
function instalarControles() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  window.__C = {
    por(qual, posMundo) {
      const dev = window.__xrEmulado, rig = G.XR.rig;
      rig.updateWorldMatrix(true, false);
      const v = new T.Vector3().fromArray(posMundo);
      rig.worldToLocal(v);
      dev.controllers[qual].position.set(v.x, v.y, v.z);
    },
    cabeca() {
      G.camera.updateWorldMatrix(true, false);
      return G.camera.getWorldPosition(new T.Vector3()).toArray();
    },
  };
  return true;
}

const pct = (a, b) => Math.abs(a - b) / Math.max(b, 1e-6) * 100;

/* ================================================================
   1) DENTRO DA SESSÃO IMERSIVA — o produto que o dono usa.
   ================================================================ */
describe('o braço do boneco em VR alcança a empunhadura do controle',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootEmVR(bootGame, { port: 3610 });
      await h.play(esperarCorpo);
      const r = await h.play(instalarSonda);
      assert.equal(r.ok, true, 'ossos do braço não encontrados no rig');
      await h.play(instalarControles);
    });
    after(async () => { if (h) await h.close(); });

    /* Empunhadura confortável: arma à frente do peito, dentro do alcance de
       um braço. Repetido algumas vezes porque a arma persegue o controle com
       suavização e a clavícula é resolvida por frame. */
    const segurar = async (offR, offL, voltas = 6) => await h.play(async (oR, oL, n) => {
      const dev = window.__xrEmulado;
      dev.position.set(0, 1.70, 0);
      dev.quaternion.set(0, 0, 0, 1);
      await new Promise(r => setTimeout(r, 1200));
      const c = window.__C.cabeca();
      for (let i = 0; i < n; i++) {
        window.__C.por('right', [c[0] + oR[0], c[1] + oR[1], c[2] + oR[2]]);
        window.__C.por('left', [c[0] + oL[0], c[1] + oL[1], c[2] + oL[2]]);
        await new Promise(r => setTimeout(r, 200));
      }
      return window.__M.amostra;
    }, offR, offL, voltas);

    const PERTO = [[0.18, -0.30, -0.28], [-0.12, -0.28, -0.42]];

    it('o comprimento alimentado no solver é o que os ossos vencem no mundo', async () => {
      /* A MEDIDA QUE FECHA A SUSPEITA. `armLen` é medido no carregamento com
         a raiz em escala 1; em VR a raiz vale 0,89 e o solver trabalha em
         mundo. Medido antes do conserto: pedido 0,6574 m contra 0,5881 m de
         osso — o IK pede um braço 11,79 % maior do que existe. */
      const m = await segurar(...PERTO);
      assert.ok(m.escala < 0.99,
        `a raiz do boneco está em escala ${m.escala.toFixed(4)}: sem escala não há ` +
        'o que medir aqui (o jogador emulado tem 1,70 m e o modelo, 1,90 m de olho)');
      for (const lado of ['R', 'L']) {
        const b = m[lado];
        assert.ok(pct(b.pedido, b.real) < 1,
          `braço ${lado}: o solver foi alimentado com ${b.pedido.toFixed(4)} m ` +
          `(${b.a.toFixed(4)} + ${b.b.toFixed(4)} na escala do carregamento) e os ossos ` +
          `vencem ${b.real.toFixed(4)} m no mundo — ${pct(b.pedido, b.real).toFixed(2)} % ` +
          `a mais, com a raiz em escala ${m.escala.toFixed(4)}`);
      }
    });

    it('a raiz do braço para DENTRO do alcance: a empunhadura é alcançável', async () => {
      /* CONSEQUÊNCIA FÍSICA do número acima, e a razão de a mão ficar fora da
         arma. A clavícula estende até a raiz do braço ficar a
         `alcance × reachBend` do alvo — com o alcance falso ela para a
         0,6245 m, que é MAIS do que os 0,5881 m que o braço vence. Não existe
         pose que feche isso: o alvo está fora do alcance por construção. */
      const m = await segurar(...PERTO);
      const b = m.R;
      assert.ok(b.dRaizAlvo <= b.real,
        `a raiz do braço direito parou a ${b.dRaizAlvo.toFixed(4)} m da empunhadura, ` +
        `e o braço vence ${b.real.toFixed(4)} m: sobram ${(b.dRaizAlvo - b.real).toFixed(4)} m ` +
        'que nenhuma dobra de cotovelo resolve');
    });

    it('a MÃO do boneco fica NA empunhadura, não a um palmo dela', async () => {
      /* A QUEIXA DO DONO, em metros: "o corpo onde segura a arma parece
         deslocado do centro". Medido antes do conserto: 0,0639 m. */
      const m = await segurar(...PERTO);
      assert.ok(m.R.resid < MAO_NA_ARMA,
        `a mão DIREITA do boneco ficou a ${m.R.resid.toFixed(4)} m da empunhadura ` +
        `(cotovelo a ${m.R.cotovelo.toFixed(1)}°, raiz do braço a ` +
        `${m.R.dRaizAlvo.toFixed(4)} m do alvo, alcance real ${m.R.real.toFixed(4)} m)`);
    });

    it('e o cotovelo não fica esticado para tentar chegar lá', async () => {
      /* Braço reto com a mão ainda longe é a assinatura de alvo fora de
         alcance. Com a empunhadura ao alcance, o cotovelo tem de sobrar dobra
         — é exatamente para isso que `reachBend` existe (0,95). */
      const m = await segurar(...PERTO);
      assert.ok(m.R.cotovelo < 172,
        `o cotovelo direito ficou a ${m.R.cotovelo.toFixed(1)}° (180° = esticado) ` +
        `com a mão a ${m.R.resid.toFixed(4)} m da empunhadura`);
      assert.ok(m.R.cotovelo > 20,
        `o cotovelo direito dobrou até ${m.R.cotovelo.toFixed(1)}°: mais do que um ` +
        'cotovelo humano fecha');
    });

    it('o ombro não passa da mão: a clavícula estende, não viaja', async () => {
      /* A clavícula é o que compra alcance quando a arma está longe do corpo,
         e ela é elástica de propósito (`clavMax`). O limite honesto: o OMBRO
         tem de continuar mais perto do pescoço do que a MÃO — se ele passar
         da mão, o tronco inteiro foi atrás do cano e a vista sai do centro. */
      const m = await segurar(...PERTO);
      const dOlhoOmbro = Math.hypot(
        m.R.ombro[0] - m.olho[0], m.R.ombro[1] - m.olho[1], m.R.ombro[2] - m.olho[2]);
      const dOlhoMao = Math.hypot(
        m.R.mao[0] - m.olho[0], m.R.mao[1] - m.olho[1], m.R.mao[2] - m.olho[2]);
      assert.ok(dOlhoOmbro < dOlhoMao,
        `o ombro direito ficou a ${dOlhoOmbro.toFixed(4)} m do olho e a mão a ` +
        `${dOlhoMao.toFixed(4)} m: o ombro passou da mão`);
      assert.ok(dOlhoOmbro < 0.60,
        `o ombro direito ficou a ${dOlhoOmbro.toFixed(4)} m do olho do jogador — ` +
        'ombro de gente fica a ~0,35 m; mais que isso é o tronco viajando com a arma');
    });

    /* POR ÚLTIMO DE PROPÓSITO: este caso sobe a referência "em pé" para 2,05 m
       e ela NÃO desce sozinha (js/xr/xrbody.js, §3.2 do referencia-corpo.md).
       Rodar antes deixaria os outros medindo com o boneco em outra escala. */
    it('e vale para OUTRA escala: jogador alto continua com a mão na arma', async () => {
      /* O conserto não pode ser calibrado para uma altura só. A escala do
         boneco sai da altura do jogador (js/xr/xrbody.js, travada em
         [0,70 · 1,15]) e a referência "em pé" SOBE quando o headset se mantém
         alto por 0,75 s — então subir o headset para 2,05 m troca a escala
         para o outro lado de 1, onde o defeito antigo pedia um braço mais
         CURTO do que existe em vez de mais longo. A janela de sustentação
         corre em tempo SIMULADO (game.js clampa o passo em 50 ms), por isso a
         espera é generosa. */
      const alto = await h.play(async () => {
        const dev = window.__xrEmulado;
        dev.quaternion.set(0, 0, 0, 1);
        dev.position.set(0, 2.05, 0);
        await new Promise(r => setTimeout(r, 4000));
        const c = window.__C.cabeca();
        for (let i = 0; i < 6; i++) {
          window.__C.por('right', [c[0] + 0.18, c[1] - 0.30, c[2] - 0.28]);
          window.__C.por('left', [c[0] - 0.12, c[1] - 0.28, c[2] - 0.42]);
          await new Promise(r => setTimeout(r, 200));
        }
        return window.__M.amostra;
      });
      assert.ok(alto.escala > 1.02,
        `a escala do boneco ficou em ${alto.escala.toFixed(4)} com o headset a 2,05 m: ` +
        'o teste precisa da escala do outro lado de 1 para valer alguma coisa');
      assert.ok(pct(alto.R.pedido, alto.R.real) < 1,
        `com a escala em ${alto.escala.toFixed(4)}, o solver foi alimentado com ` +
        `${alto.R.pedido.toFixed(4)} m contra ${alto.R.real.toFixed(4)} m de osso`);
      assert.ok(alto.R.resid < MAO_NA_ARMA,
        `com a escala em ${alto.escala.toFixed(4)}, a mão direita ficou a ` +
        `${alto.R.resid.toFixed(4)} m da empunhadura`);
      // devolve a sessão à altura padrão para não contaminar o próximo teste
      await h.play(async () => {
        window.__xrEmulado.position.set(0, 1.70, 0);
        await new Promise(r => setTimeout(r, 1200));
      });
    });

  });

/* ================================================================
   2) CONTROLE — o mesmo solver com a raiz em escala 1 (desktop).
   ================================================================ */
describe('controle: o mesmo braço no desktop, com a raiz em escala 1',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootGame({ port: 3612 });
      await h.play(esperarCorpo);
      const r = await h.play(instalarSonda);
      assert.equal(r.ok, true, 'ossos do braço não encontrados no rig');
    });
    after(async () => { if (h) await h.close(); });

    const ler = async () => await h.play(async () => {
      await new Promise(r => setTimeout(r, 800));
      return window.__M.amostra;
    });

    it('pedido = real e as DUAS mãos ficam na empunhadura', async () => {
      /* Este é o controle que prova que o defeito é a ESCALA e não o IK: aqui
         a raiz vale 1, pedido e real são o mesmo número, e o resíduo medido é
         0,0000 m nas duas mãos. Vale também como rede: o conserto do VR não
         pode custar nada ao desktop, que é o jogo que já está no ar. */
      const m = await ler();
      assert.ok(Math.abs(m.escala - 1) < 1e-6,
        `a raiz do boneco no desktop está em escala ${m.escala}`);
      for (const lado of ['R', 'L']) {
        const b = m[lado];
        assert.ok(pct(b.pedido, b.real) < 1,
          `braço ${lado}: solver alimentado com ${b.pedido.toFixed(4)} m contra ` +
          `${b.real.toFixed(4)} m de osso`);
        assert.ok(b.resid < 0.01,
          `braço ${lado}: a mão ficou a ${b.resid.toFixed(4)} m da empunhadura no desktop`);
      }
    });
  });
