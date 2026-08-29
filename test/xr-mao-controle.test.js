/* ================================================================
   QA — EM VR, A MÃO DO BONECO É A MÃO DO JOGADOR.

   O DEFEITO, MEDIDO ANTES DE ESCREVER UMA LINHA — e a primeira coisa que ele
   ensina é ONDE MEDIR.

   `js/fpbody.js` resolve os braços mirando as âncoras da ARMA
   (`gun.parts.handR` / `handL`). Em XR quem põe a arma no controle é o
   `XRArma.aplicar` do game.js, e ele roda DEPOIS do `FpBody.update` (que mora
   no fim do `applyFpsCamera`). Ou seja: o IK resolve a mão contra a pose de
   DESKTOP da arma, e a arma é movida em seguida.

   Medido no MESMO FRAME, sessão IWER, headset a 1,70 m, controles nivelados
   (targetRay com quaternion identidade, −Z = (0,000; 0,000; −1,000) medido),
   punho direito posto por iteração sobre o gripSpace:

     instante                     | −Z da arma            | mão D → empunhadura
     -----------------------------|-----------------------|--------------------
     dentro do `FpBody.update`    | (0,086; 0,707; −0,702)| 0,0000 m  ✔ (mentira)
     no `renderer.render`         | (0,000; 0,000; −1,000)| 0,4839 m  ✘

   O "0,0000 m da mão direita" que três laudos publicaram é a mão comparada com
   a arma NA POSE ERRADA: os dois números saem do mesmo instante e do mesmo
   engano, então a distância fecha em zero por construção. É o formato 2 da
   lista do CLAUDE.md ("comparar uma reta com ela mesma"), com a arma no lugar
   da reta. **Este arquivo mede no RENDER**, que é o que vai para a tela.

   E a mão ESQUERDA tem um segundo defeito, independente do instante: ela mira
   a âncora `supportHand` da ARMA, que fica 0,5508 m à frente da empunhadura do
   fuzil — nem onde a mão do jogador está, nem ao alcance do braço do boneco
   (ombro esquerdo → âncora 0,668 m contra 0,657 m de braço, cotovelo a 176,0°).
   Medido com o controle esquerdo onde um humano poria a mão de apoio: a mão do
   boneco ficou a **0,5575 m** da mão do jogador.

   O QUE A PLATAFORMA DIZ SOBRE ISSO. O `gripSpace` do WebXR é definido como o
   espaço cuja origem "tracks the pose used to render virtual objects so they
   appear to be held in (or part of) the user's hand", com a origem "located at
   the centroid — the center of mass — of the user's fist, tracking the position
   of the user's hand" (MDN, XRInputSource.gripSpace). Ou seja: o gripSpace É a
   mão. A mão do avatar mora nele, e a arma é o que fica pendurado nela — não o
   contrário.

   COMO ESTE ARQUIVO MEDE:
   - POSIÇÃO DE OSSO (`bone.getWorldPosition`) contra POSIÇÃO DO PUNHO
     (`XR.punho(lado)`), em metros de mundo. Nunca `Box3` num SkinnedMesh.
   - No instante do `renderer.render`, DEPOIS de `XRArma.aplicar`.
   - Com o controle POSTO onde se quer, e conferido: cada caso afirma que o
     punho chegou ao alvo pedido, senão o resíduo pequeno seria o de dois
     objetos parados no mesmo lugar por acaso.
   - E com a âncora da arma LONGE do controle (> 0,30 m) nos casos que separam
     as duas hipóteses: sem isso, mirar a âncora e mirar o controle dariam o
     mesmo número e o caso passaria com o defeito no lugar.

   PORTAS 3642 (VR) e 3644 (desktop) — faixa exclusiva desta frente.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

/* Tolerância da mão na empunhadura: o dedo do boneco tem ~2 cm. */
const MAO_NA_ARMA = 0.03;
/* A mão de apoio é a mão do jogador: mesma régua, com folga para a suavização
   da arma e para o servo anti-olho (teto 0,015 m em js/fpbody.js). */
const MAO_NO_CONTROLE = 0.05;

async function esperarCorpo() {
  const G = window.__game;
  for (let i = 0; i < 300 && !(G.FpBody.ready || G.FpBody.failed); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  if (!G.FpBody.ready) throw new Error('FpBody não carregou o GLB');
}

/* Sonda no RENDER: é o único instante em que a arma já está no controle. */
function instalarSonda() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  const raiz = G.FpBody.bodyRoot, B = G.FpBody.bones;
  const wp = o => o.getWorldPosition(new T.Vector3());
  const ang = (p, q, r) => {
    const a = wp(p).sub(wp(q)), b = wp(r).sub(wp(q));
    if (a.lengthSq() < 1e-9 || b.lengthSq() < 1e-9) return null;
    return Math.acos(Math.min(1, Math.max(-1, a.normalize().dot(b.normalize())))) * 180 / Math.PI;
  };
  function amostrar() {
    const g = G.arsenal[G.gunIndex];
    const emXR = !!(G.XR && G.XR.presenting);
    const punhoR = emXR ? (G.XR.punho('right') || G.XR.mao('right')) : null;
    const punhoL = emXR ? (G.XR.punho('left') || G.XR.mao('left')) : null;
    const pR = punhoR ? wp(punhoR) : null, pL = punhoL ? wp(punhoL) : null;
    const ancR = g && g.parts && g.parts.handR ? wp(g.parts.handR) : null;
    const ancL = g && g.parts && g.parts.handL ? wp(g.parts.handL) : null;
    const maoR = wp(B.haR), maoL = wp(B.haL);
    return {
      arma: g ? (g.name || String(G.gunIndex)) : null,
      escala: raiz.scale.x || 1, visivel: raiz.visible,
      /* condição de medida: a arma está NIVELADA? (o −Z do raio de mira do
         controle direito, que é de onde js/xr/xrweapon.js tira o cano) */
      raioZ: emXR && G.XR.mao('right')
        ? new T.Vector3(0, 0, -1).applyQuaternion(
          G.XR.mao('right').getWorldQuaternion(new T.Quaternion())).toArray() : null,
      maoDirNaArma: ancR ? maoR.distanceTo(ancR) : null,
      maoEsqNaArma: ancL ? maoL.distanceTo(ancL) : null,
      maoDirNoControle: pR ? maoR.distanceTo(pR) : null,
      maoEsqNoControle: pL ? maoL.distanceTo(pL) : null,
      /* separação entre as duas hipóteses: se for pequena, o caso não decide
         nada (mirar a âncora e mirar o controle dariam o mesmo número) */
      ancEsqAoControle: ancL && pL ? ancL.distanceTo(pL) : null,
      ancDirAoControle: ancR && pR ? ancR.distanceTo(pR) : null,
      cotoveloL: ang(B.upL, B.foL, B.haL),
      cotoveloR: ang(B.upR, B.foR, B.haR),
      punhoLW: pL ? pL.toArray() : null,
      punhoRW: pR ? pR.toArray() : null,
      olhoMin: G.FpBody.olhoMin,
      /* METROS QUE A CLAVÍCULA TRANSLADOU rumo ao alvo neste frame. É "o ombro
         viajando atrás da mão" com número, e é a medida que separa "o braço
         não alcançou" de "o tronco foi junto": as duas dão cotovelo esticado,
         e só esta distingue. */
      clavL: G.FpBody.clavicula.l, clavR: G.FpBody.clavicula.r,
      /* distância ombro esquerdo → alvo, contra o braço que existe: é o que
         diz se um cotovelo esticado é HONESTO (alvo realmente longe) ou é a
         assinatura de alvo inalcançável por construção */
      ombroLAoControle: pL ? wp(B.shL).distanceTo(pL) : null,
      bracoL: wp(B.upL).distanceTo(wp(B.foL)) + wp(B.foL).distanceTo(wp(B.haL)),
    };
  }
  window.__M = { amostra: null, erro: null, quero: false };
  const colher = () => {
    if (!window.__M.quero) return;
    try { window.__M.amostra = amostrar(); } catch (e) { window.__M.erro = String((e && e.stack) || e); }
    window.__M.quero = false;
  };
  /* EM XR: no `renderer.render`, que é o único instante em que a arma já está
     no punho (o `XRArma.aplicar` roda depois do `applyFpsCamera`).

     NO DESKTOP: logo depois do `FpBody.update`, e NÃO no render — porque no
     desktop não existe render nenhum para enganchar. O harness troca
     `composer.render` por um no-op ("mecânica não precisa de pixels", ver
     test/helpers/harness.js) e `renderFrame` só chama `renderer.render` dentro
     da sessão XR. Enganchado no render, este bloco de controle lia `amostra`
     null e morria em `Cannot read properties of null` — um controle que não
     mede nada. No desktop o instante certo é este de qualquer forma: a pose de
     mouse da arma é escrita no `applyFpsCamera`, ANTES do solver do corpo. */
  const origRender = MP.renderer.render.bind(MP.renderer);
  MP.renderer.render = function (cena, cam) {
    colher();
    return origRender(cena, cam);
  };
  const origFp = G.FpBody.update.bind(G.FpBody);
  G.FpBody.update = function (...a) {
    const v = origFp(...a);
    if (!(G.XR && G.XR.presenting)) colher();
    return v;
  };
  window.__M.ler = async () => {
    window.__M.quero = true;
    for (let i = 0; i < 120 && window.__M.quero; i++) await new Promise(r => setTimeout(r, 30));
    if (window.__M.erro) throw new Error('sonda: ' + window.__M.erro);
    return window.__M.amostra;
  };
  return { ok: !!(B.haR && B.haL) };
}

/* Põe o PUNHO (gripSpace) de um controle num ponto de MUNDO. O IWER aceita a
   pose do `targetRay`, e o gripSpace do Touch fica 45,4° e ~5 cm dela — então
   a colocação é por ITERAÇÃO sobre o erro medido, e o caso confere o resultado
   em vez de confiar nele. */
function instalarControles() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  void MP;
  window.__C = {
    async porPunho(qual, alvoMundo, voltas = 8) {
      const dev = window.__xrEmulado, rig = G.XR.rig;
      const alvo = new T.Vector3().fromArray(alvoMundo);
      for (let i = 0; i < voltas; i++) {
        const p = G.XR.punho(qual) || G.XR.mao(qual);
        const err = new T.Vector3();
        if (p) { p.updateWorldMatrix(true, false); err.copy(alvo).sub(p.getWorldPosition(new T.Vector3())); }
        rig.updateWorldMatrix(true, false);
        const eRig = err.applyQuaternion(rig.getWorldQuaternion(new T.Quaternion()).invert());
        const v = new T.Vector3().copy(dev.controllers[qual].position).add(eRig);
        dev.controllers[qual].position.set(v.x, v.y, v.z);
        await new Promise(r => setTimeout(r, 110));
      }
    },
    /* Arma NIVELADA: o cano sai do `targetRay` do controle direito
       (js/xr/xrweapon.js), então nivelar é zerar ESSE quaternion. Com ele
       identidade o cano lê (0; 0; −1) — e é a condição de medida que faltava
       na rodada passada, quando a arma apontava 45° para cima e a âncora de
       apoio subia junto. */
    nivelar() {
      window.__xrEmulado.controllers.right.quaternion.set(0, 0, 0, 1);
      window.__xrEmulado.controllers.left.quaternion.set(0, 0, 0, 1);
    },
    cabeca() {
      G.camera.updateWorldMatrix(true, false);
      return G.camera.getWorldPosition(new T.Vector3()).toArray();
    },
  };
  return true;
}

describe('em VR a mão do boneco fica no CONTROLE do jogador',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootEmVR(bootGame, { port: 3642 });
      await h.play(esperarCorpo);
      const r = await h.play(instalarSonda);
      assert.equal(r.ok, true, 'ossos das mãos não encontrados no rig');
      await h.play(instalarControles);
      await h.play(async () => {
        const dev = window.__xrEmulado;
        dev.position.set(0, 1.70, 0);
        dev.quaternion.set(0, 0, 0, 1);
        await new Promise(r2 => setTimeout(r2, 2500));
      });
    });
    after(async () => { if (h) await h.close(); });

    /* Duas poses de mão esquerda que um jogador faz de verdade, as duas com a
       âncora `supportHand` do fuzil LONGE do controle — que é o que faz o caso
       decidir entre as duas hipóteses. */
    const segurar = async (offL) => await h.play(async (oL) => {
      window.__C.nivelar();
      const c = window.__C.cabeca();
      await window.__C.porPunho('right', [c[0] + 0.16, c[1] - 0.32, c[2] - 0.30]);
      await window.__C.porPunho('left', [c[0] + oL[0], c[1] + oL[1], c[2] + oL[2]]);
      await new Promise(r => setTimeout(r, 500));
      const m = await window.__M.ler();
      m.alvoL = [c[0] + oL[0], c[1] + oL[1], c[2] + oL[2]];
      m.alvoR = [c[0] + 0.16, c[1] - 0.32, c[2] - 0.30];
      return m;
    }, offL);

    const APOIO = [-0.22, -0.30, -0.45];   // mão de apoio, à frente do peito
    const SOLTA = [-0.30, -0.60, -0.10];   // mão livre, ao lado do corpo

    const conferirCondicao = (m, exigeSeparacao) => {
      assert.ok(m.visivel, 'o boneco não está visível — não há o que medir');
      assert.ok(m.escala < 0.99,
        `a raiz do boneco está em escala ${m.escala.toFixed(4)}: sem escala de VR ` +
        'este arquivo não está medindo o produto');
      const dz = m.raioZ;
      assert.ok(Math.abs(dz[0]) < 0.02 && Math.abs(dz[1]) < 0.02 && dz[2] < -0.99,
        `a arma não está nivelada: o −Z do raio do controle direito é ` +
        `(${dz.map(v => v.toFixed(3)).join('; ')}) — a medida não vale`);
      const erroL = Math.hypot(m.punhoLW[0] - m.alvoL[0], m.punhoLW[1] - m.alvoL[1],
        m.punhoLW[2] - m.alvoL[2]);
      const erroR = Math.hypot(m.punhoRW[0] - m.alvoR[0], m.punhoRW[1] - m.alvoR[1],
        m.punhoRW[2] - m.alvoR[2]);
      assert.ok(erroL < 0.03 && erroR < 0.03,
        `os controles não chegaram onde o caso pediu (esq ${erroL.toFixed(4)} m, ` +
        `dir ${erroR.toFixed(4)} m): sem isso o resíduo medido não é sobre nada`);
      if (exigeSeparacao) {
        assert.ok(m.ancEsqAoControle > 0.30,
          `a âncora de apoio da arma está a só ${m.ancEsqAoControle.toFixed(4)} m do ` +
          'controle esquerdo: nesta pose mirar a âncora e mirar o controle dão o mesmo ' +
          'número, e o caso não decide nada');
      }
    };

    it('a mão DIREITA fica na empunhadura DA ARMA QUE APARECE (medido no render)', async () => {
      /* Medido antes: 0,4839 m no render, 0,0000 m dentro do FpBody.update. */
      const m = await segurar(APOIO);
      conferirCondicao(m, true);
      assert.ok(m.maoDirNaArma < MAO_NA_ARMA,
        `a mão DIREITA do boneco ficou a ${m.maoDirNaArma.toFixed(4)} m da empunhadura ` +
        `da arma que é desenhada (cotovelo ${m.cotoveloR.toFixed(1)}°). Dentro do ` +
        'FpBody.update esse número dá 0,0000 m — e é ele que três laudos publicaram');
      assert.ok(m.maoDirNoControle < MAO_NA_ARMA,
        `a mão DIREITA ficou a ${m.maoDirNoControle.toFixed(4)} m do punho do controle`);
    });

    it('a mão ESQUERDA fica no CONTROLE do jogador, com a mão de apoio à frente', async () => {
      /* Medido antes: 0,5575 m do controle (e 0,2881 m da âncora, que é para
         onde o IK mira hoje). */
      const m = await segurar(APOIO);
      conferirCondicao(m, true);
      assert.ok(m.maoEsqNoControle < MAO_NO_CONTROLE,
        `a mão ESQUERDA do boneco ficou a ${m.maoEsqNoControle.toFixed(4)} m da mão do ` +
        `JOGADOR (a âncora de apoio da arma está a ${m.ancEsqAoControle.toFixed(4)} m ` +
        `dali, e é para lá que o IK mira). Cotovelo ${m.cotoveloL.toFixed(1)}°`);
    });

    it('e continua nela com a mão ESQUERDA solta ao lado do corpo', async () => {
      /* O caso que separa "mão na arma" de "mão do jogador": aqui o jogador
         SOLTOU o guarda-mão. Medido antes: 0,9593 m do controle. */
      const m = await segurar(SOLTA);
      conferirCondicao(m, true);
      assert.ok(m.maoEsqNoControle < MAO_NO_CONTROLE,
        `com a mão do jogador ao lado do corpo, a mão do boneco ficou a ` +
        `${m.maoEsqNoControle.toFixed(4)} m dela — agarrada a um ponto da arma onde a ` +
        'mão dele não está');
    });

    it('o cotovelo esquerdo deixa de ficar esticado', async () => {
      /* Braço reto com a mão ainda longe é a assinatura de alvo fora de
         alcance. Medido antes: 176,0° nas três armas longas. */
      const m = await segurar(APOIO);
      conferirCondicao(m, false);
      assert.ok(m.cotoveloL < 172,
        `o cotovelo esquerdo ficou a ${m.cotoveloL.toFixed(1)}° (180° = esticado) com a ` +
        `mão a ${m.maoEsqNoControle.toFixed(4)} m do controle`);
      assert.ok(m.cotoveloL > 20,
        `o cotovelo esquerdo dobrou até ${m.cotoveloL.toFixed(1)}°: mais do que um ` +
        'cotovelo humano fecha');
    });

    it('mão do jogador FORA DE ALCANCE: o ombro não viaja atrás dela', async () => {
      /* O CASO QUE DECIDE ENTRE AS DUAS CAUSAS DO COTOVELO ESTICADO.

         Cotovelo reto sozinho não acusa nada: quem estica o braço de verdade
         TEM o cotovelo reto, e é a pose certa. O que estava errado era o
         tronco ir junto — a clavícula translada até `clavMax` (0,45 m) rumo ao
         alvo, e com a âncora do guarda-mão a 0,67 m do ombro ela ia. Aqui o
         jogador põe a mão a 0,90 m à frente do próprio rosto, que NENHUM braço
         deste boneco alcança (0,657 m), e o caso mede as duas coisas
         separadas: quanto a clavícula andou, e se o resíduo que sobrou é o
         déficit geométrico honesto — nem mais (ombro parado demais), nem menos
         (ombro viajando).

         O teto anatômico é `TUNE.clavMao` (0,06 m): a protração da escápula
         humana vai a ~2–6 cm. Meio metro é o tronco atrás da mão. */
      const m = await segurar([-0.20, -0.10, -0.90]);
      conferirCondicao(m, true);
      const braco = m.bracoL;
      /* A CONDIÇÃO DE MEDIDA NÃO PODE SER CONTAMINADA PELO DEFEITO, e a
         primeira versão deste caso era. Ela lia o ombro DEPOIS do IK — e a
         viagem da clavícula é justamente o que se mede aqui: com o teto de
         volta em 0,45 m o ombro chegava a 0,6725 m do controle, a condição
         concluía "a mão alcança, não há o que medir" e o caso morria antes da
         asserção que importa. Reconstruído somando a viagem, o número fica
         IDÊNTICO com e sem o defeito (1,100 m nos dois), que é o que uma
         condição de medida tem de ser. */
      const ombroRepouso = m.ombroLAoControle + m.clavL;
      console.log(`    [fora de alcance] ombro(repouso)→controle ` +
        `${ombroRepouso.toFixed(4)} m · braço ${braco.toFixed(4)} m · clavícula ` +
        `${m.clavL.toFixed(4)} m · mão→controle ${m.maoEsqNoControle.toFixed(4)} m · ` +
        `cotovelo ${m.cotoveloL.toFixed(1)}°`);
      assert.ok(ombroRepouso > braco + 0.15,
        `o caso não exercita nada: sem a viagem da clavícula o ombro esquerdo fica a ` +
        `${ombroRepouso.toFixed(4)} m do controle e o braço vence ${braco.toFixed(4)} m — ` +
        'a mão ALCANÇA, e então não há "fora de alcance" a medir');
      assert.ok(m.clavL <= 0.07,
        `a clavícula esquerda transladou ${m.clavL.toFixed(4)} m atrás da mão do ` +
        'jogador (teto anatômico 0,06 m; com a âncora da arma como alvo o teto ' +
        'era 0,45 m e o tronco ia junto)');
      /* E O RESÍDUO TEM DE SER O DÉFICIT, não mais: braço curto explica
         `ombro(repouso)→controle − braço`; qualquer coisa muito além disso é o
         solver desistindo do alvo em vez de esticar na direção dele. */
      const deficit = ombroRepouso - braco;
      assert.ok(m.maoEsqNoControle < deficit + 0.12,
        `com a mão do jogador ${deficit.toFixed(4)} m além do alcance do braço, a mão ` +
        `do boneco ficou ${m.maoEsqNoControle.toFixed(4)} m dela — mais do que o ` +
        'déficit geométrico explica');
    });

    it('vale para as três armas longas, que têm vãos de mão diferentes', async () => {
      /* 0,5508 / 0,6015 / 0,6412 m entre empunhadura e guarda-mão: se a mão do
         boneco seguisse a ARMA, o erro andaria com esse vão. Seguindo o
         CONTROLE, ele não anda. */
      const fora = [];
      for (const par of [['Digit1', 0], ['Digit2', 1], ['Digit3', 2]]) {
        const m = await h.play(async (t, oL) => {
          const G = window.__game, MP = window.__MP;
          for (const w of G.arsenal) w.locked = false;
          MP.justPressed.add(t);
          await new Promise(r => setTimeout(r, 900));
          window.__C.nivelar();
          const c = window.__C.cabeca();
          await window.__C.porPunho('right', [c[0] + 0.16, c[1] - 0.32, c[2] - 0.30]);
          await window.__C.porPunho('left', [c[0] + oL[0], c[1] + oL[1], c[2] + oL[2]]);
          await new Promise(r => setTimeout(r, 400));
          return await window.__M.ler();
        }, par[0], APOIO);
        if (m.maoEsqNoControle >= MAO_NO_CONTROLE || m.maoDirNaArma >= MAO_NA_ARMA) {
          fora.push(`${m.arma}: esq ${m.maoEsqNoControle.toFixed(4)} m do controle, ` +
            `dir ${m.maoDirNaArma.toFixed(4)} m da empunhadura`);
        }
      }
      assert.deepEqual(fora, [], `armas com a mão fora do lugar: ${fora.join(' | ')}`);
    });
  });

/* ================================================================
   CONTROLE — o desktop não pode regredir: lá não há controle nenhum, e a mão
   continua indo para a âncora da arma.
   ================================================================ */
describe('controle: no desktop as duas mãos continuam nas âncoras da arma',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootGame({ port: 3644 });
      await h.play(esperarCorpo);
      const r = await h.play(instalarSonda);
      assert.equal(r.ok, true, 'ossos das mãos não encontrados no rig');
    });
    after(async () => { if (h) await h.close(); });

    it('mão direita e mão esquerda a 0,00 m das âncoras, como já estava no ar', async () => {
      const m = await h.play(async () => {
        await new Promise(r => setTimeout(r, 900));
        return await window.__M.ler();
      });
      assert.ok(Math.abs(m.escala - 1) < 1e-6,
        `a raiz do boneco no desktop está em escala ${m.escala}`);
      assert.equal(m.maoDirNoControle, null, 'o desktop não devia ter punho de controle');
      assert.ok(m.maoDirNaArma < 0.01,
        `a mão direita ficou a ${m.maoDirNaArma.toFixed(4)} m da empunhadura no desktop`);
      assert.ok(m.maoEsqNaArma < 0.01,
        `a mão esquerda ficou a ${m.maoEsqNaArma.toFixed(4)} m do guarda-mão no desktop`);
    });
  });
