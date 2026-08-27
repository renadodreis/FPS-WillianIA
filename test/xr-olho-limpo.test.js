/* ================================================================
   QA — NADA DO CORPO ENTRA NO OLHO (critério I3, e a metade geométrica
   do C5).

   O DEFEITO, MEDIDO POR VALIDAÇÃO INDEPENDENTE (docs/vr/validacao-da3987c.md,
   §2.3 e a linha I3 da tabela): na malha SKINADA (3641 vértices), em dez
   poses de controle e de cabeça — inclusive a receita literal do critério,
   pitch −70° e yaw ±60° —, a geometria do corpo fica entre **0,0092 m** e
   **0,0829 m** do olho. O teto é **0,15 m**. Nenhuma das dez passa. O pior
   caso é o braço levantado, com o vértice a **9,2 mm** do olho: o jogador
   enxerga por DENTRO do próprio braço.

   POR QUE ISTO É DEFEITO E NÃO REALISMO. Na vida real o antebraço encosta
   no rosto e ninguém reclama, porque o olho não consegue focar nele e o
   cérebro o descarta. Em VR a geometria a 9 mm atravessa o plano near,
   preenche um olho e não o outro, e o cérebro não funde as duas imagens —
   é o mesmo mecanismo que o Oculus Best Practices descreve para o HUD a
   profundidade fixa ("difficulty and/or discomfort when trying to fuse the
   images"). Por isso o critério é absoluto e o número é 0,15 m.

   COMO ESTE ARQUIVO MEDE — e por que NÃO por caixa:

   - **VÉRTICE SKINADO.** `Box3.setFromObject` num `SkinnedMesh` devolve
     caixa CONGELADA: `computeBoundingBox` é ciente da pose, mas o three
     grava o resultado em `mesh.boundingBox` e nunca invalida esse campo —
     e js/fpbody.js envenena esse cache no carregamento, de propósito
     (linha 160, `new THREE.Box3().setFromObject(model)`), para medir a
     altura de repouso. Daqui em diante, caixa mente. Este arquivo lê
     `getVertexPosition` (que passa por `applyBoneTransform`) vértice a
     vértice e leva ao mundo pela `matrixWorld` da malha.
   - **OS DOIS OLHOS.** A distância é medida contra `cameras[0]` e
     `cameras[1]` do `renderer.xr.getCamera()`, e vale a MENOR. Medir só o
     olho esquerdo esconde metade do defeito.
   - **A POSE DESTE FRAME.** A amostra sai de um gancho no `XR.place`, que
     roda depois de o rig ser posto no lugar — `rig.matrixWorld ×
     cameras[i].matrix`, nunca `camera.getWorldPosition()`, que compõe
     rig(N) com pose(N−1) e já fez um teste desta base passar por acidente.
   - **O CULPADO TEM NOME.** Junto do número sai a malha, o índice do
     vértice e o OSSO de maior peso: sem isso "0,0092 m" não diz onde
     mexer, e o conserto vira chute.

   PORTAS 3630 (poses) e 3634 (ombro) — faixa exclusiva desta frente.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

/* Critério I3 e C5: nenhuma geometria dentro de 0,15 m do olho. */
const TETO_OLHO = 0.15;

async function esperarCorpo() {
  const G = window.__game;
  for (let i = 0; i < 300 && !(G.FpBody.ready || G.FpBody.failed); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  if (!G.FpBody.ready) throw new Error('FpBody não carregou o GLB');
}

/* Sonda: engancha no XR.place (depois do rig posicionado, no mesmo instante
   em que o quadro é composto) e varre a malha skinada quando armada. Armada
   sob demanda porque varrer 3641 vértices × 2 olhos por frame derruba a
   sessão emulada — e sessão engasgada mede o harness, não o produto. */
function instalarSondaOlho() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  const xrCam = MP.renderer.xr.getCamera();
  const _m = new T.Matrix4();
  const olhos = [new T.Vector3(), new T.Vector3()];
  const _v = new T.Vector3(), _p = new T.Vector3();
  const orig = G.XR.place.bind(G.XR);
  window.__O = { amostra: null, erro: null, armar: false };

  const osso = (malha, idx) => {
    const g = malha.geometry, sk = malha.skeleton;
    if (!g.attributes.skinIndex || !sk) return null;
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    let melhorW = -1, melhorI = -1;
    for (const comp of ['x', 'y', 'z', 'w']) {
      const w = sw[`get${comp.toUpperCase()}`](idx);
      if (w > melhorW) { melhorW = w; melhorI = si[`get${comp.toUpperCase()}`](idx); }
    }
    const b = sk.bones[melhorI];
    return b ? { nome: b.name, peso: melhorW } : null;
  };

  G.XR.place = (...a) => {
    const v = orig(...a);
    if (!window.__O.armar) return v;
    try {
      G.XR.rig.updateMatrixWorld(true);
      const cams = xrCam.cameras && xrCam.cameras.length ? xrCam.cameras : [G.camera];
      const n = Math.min(2, cams.length);
      for (let i = 0; i < n; i++) {
        _m.multiplyMatrices(G.XR.rig.matrixWorld, cams[i].matrix);
        olhos[i].setFromMatrixPosition(_m);
      }
      const raiz = G.FpBody.bodyRoot;
      let melhor = null;
      if (raiz && raiz.parent && raiz.visible) {
        raiz.updateWorldMatrix(true, true);
        raiz.traverse(o => {
          if (!(o.isMesh || o.isSkinnedMesh) || !o.visible) return;
          const pos = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
          if (!pos) return;
          for (let k = 0; k < pos.count; k++) {
            o.getVertexPosition(k, _v);
            _v.applyMatrix4(o.matrixWorld);
            for (let e = 0; e < n; e++) {
              const d = _v.distanceTo(olhos[e]);
              if (!melhor || d < melhor.d) {
                melhor = { d, idx: k, malha: o, olho: e, p: _v.toArray() };
              }
            }
          }
        });
      }
      /* O OMBRO É OUTRA GRANDEZA e sai na mesma amostra: C5 cobra o corpo
         ancorado na cabeça, e o sintoma medido é o ombro SUBINDO acima do
         olho quando a perna acaba de dobrar. */
      const B = G.FpBody.bones || {};
      const rel = nome => {
        const b = B[nome];
        if (!b) return null;
        b.getWorldPosition(_p);
        return _p.y - olhos[0].y;
      };
      /* ONDE, no espaço do CORPO — sem isto "0,13 m" não diz se quem chegou
         perto foi a malha que andou ou o olho que se mexeu com a cabeça. */
      let vertRaiz = null, olhoRaiz = null;
      if (raiz && raiz.parent && melhor) {
        const inv = new T.Matrix4().copy(raiz.matrixWorld).invert();
        vertRaiz = new T.Vector3().fromArray(melhor.p).applyMatrix4(inv).toArray()
          .map(v => +v.toFixed(4));
        olhoRaiz = olhos[melhor.olho].clone().applyMatrix4(inv).toArray().map(v => +v.toFixed(4));
      }
      window.__O.amostra = {
        vertRaiz, olhoRaiz,
        min: melhor ? melhor.d : null,
        idx: melhor ? melhor.idx : null,
        malha: melhor ? (melhor.malha.name || '(sem nome)') : null,
        osso: melhor ? osso(melhor.malha, melhor.idx) : null,
        olho: melhor ? melhor.olho : null,
        vert: melhor ? melhor.p : null,
        olhoY: olhos[0].y,
        olhos: n,
        ombroR: rel('shR'), ombroL: rel('shL'),
        cabeca: rel('head'), peito: rel('chest'),
        escala: raiz ? raiz.scale.x : null,
        raizY: raiz ? raiz.position.y : null,
        afundou: G.XR.corpo ? G.XR.corpo.afundou : null,
        visivel: !!(raiz && raiz.visible && raiz.parent),
        sentinelas: G.FpBody.sentinelas,
        recuoOlho: G.FpBody.recuoOlho,
        olhoMin: G.FpBody.olhoMin,
        alturaCabeca: G.XR.corpo ? G.XR.corpo.alturaCabeca : null,
        alturaDePe: G.XR.corpo ? G.XR.corpo.alturaDePe : null,
      };
      window.__O.armar = false;
    } catch (e) { window.__O.erro = String((e && e.message) || e); window.__O.armar = false; }
    return v;
  };
  return true;
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

/* Uma pose = altura e orientação do headset + os dois controles, em offsets
   a partir da cabeça. Repetida algumas voltas porque a arma persegue o
   controle com suavização e o IK é resolvido por frame. */
async function pose(h, { y = 1.70, pitch = 0, yaw = 0, oR, oL, voltas = 8 }) {
  return await h.play(async (y_, pitch_, yaw_, oR_, oL_, n) => {
    const dev = window.__xrEmulado, MP = window.__MP, T = MP.THREE;
    dev.position.set(0, y_, 0);
    dev.quaternion.copy(new T.Quaternion().setFromEuler(
      new T.Euler(pitch_ * Math.PI / 180, yaw_ * Math.PI / 180, 0, 'YXZ')));
    await new Promise(r => setTimeout(r, 500));
    for (let i = 0; i < n; i++) {
      const c = window.__C.cabeca();
      window.__C.por('right', [c[0] + oR_[0], c[1] + oR_[1], c[2] + oR_[2]]);
      window.__C.por('left', [c[0] + oL_[0], c[1] + oL_[1], c[2] + oL_[2]]);
      await new Promise(r => setTimeout(r, 120));
    }
    window.__O.armar = true;
    for (let i = 0; i < 40 && window.__O.armar; i++) await new Promise(r => setTimeout(r, 50));
    if (window.__O.erro) throw new Error('sonda: ' + window.__O.erro);
    return window.__O.amostra;
  }, y, pitch, yaw, oR, oL, voltas);
}

/* AS DEZ POSES DO LAUDO. Os nomes são os do docs/vr/validacao-da3987c.md
   para que os dois números sejam comparáveis linha a linha. */
const QUADRIL = [[0.22, -0.55, -0.18], [-0.06, -0.50, -0.32]];
const PRONTA = [[0.18, -0.30, -0.28], [-0.12, -0.28, -0.42]];
const POSES = [
  { nome: 'arma no quadril', oR: QUADRIL[0], oL: QUADRIL[1] },
  { nome: 'arma pronta', oR: PRONTA[0], oL: PRONTA[1] },
  { nome: 'arma no olho', oR: [0.05, -0.09, -0.26], oL: [-0.03, -0.11, -0.46] },
  { nome: 'braço estendido', oR: [0.20, -0.06, -0.60], oL: [-0.16, -0.10, -0.62] },
  { nome: 'braço para cima', oR: [0.20, 0.35, -0.14], oL: [-0.18, 0.32, -0.20] },
  { nome: 'colado no peito', oR: [0.10, -0.34, -0.12], oL: [-0.10, -0.34, -0.14] },
  { nome: 'olhando para baixo (−70°)', pitch: -70, oR: PRONTA[0], oL: PRONTA[1] },
  { nome: 'olhando 60° à esquerda', yaw: 60, oR: PRONTA[0], oL: PRONTA[1] },
  { nome: 'olhando 60° à direita', yaw: -60, oR: PRONTA[0], oL: PRONTA[1] },
  { nome: 'agachado (cabeça a 1,10 m)', y: 1.10, oR: PRONTA[0], oL: PRONTA[1] },
];

const m4 = v => (v === null || v === undefined ? '—' : Number(v).toFixed(4));

describe('nada do corpo em 1ª pessoa entra no olho (I3)',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    const medido = [];
    before(async () => {
      h = await bootEmVR(bootGame, { port: 3630 });
      await h.play(esperarCorpo);
      await h.play(instalarSondaOlho);
      await h.play(instalarControles);
      /* calibra o "em pé" com a cabeça na altura de trabalho antes de
         qualquer pose baixa: sem isso o agachamento é lido como estatura */
      await pose(h, { ...POSES[1], voltas: 6 });
      for (const p of POSES) medido.push({ nome: p.nome, a: await pose(h, p) });
      const tabela = medido.map(({ nome, a }) =>
        `  ${nome.padEnd(28)} ${m4(a.min).padStart(8)} m   ` +
        `(${a.malha}#${a.idx}, osso ${a.osso ? a.osso.nome : '—'}) ` +
        `vert${JSON.stringify(a.vertRaiz)} olho${JSON.stringify(a.olhoRaiz)} ` +
        `esc ${m4(a.escala)} sent ${a.sentinelas} recuo ${m4(a.recuoOlho)} interno ${m4(a.olhoMin)}`).join('\n');
      console.log(`\n[I3] geometria mais perto do olho, malha SKINADA, 10 poses:\n${tabela}\n`);
    });
    after(async () => { if (h) await h.close(); });

    it('nenhuma das dez poses põe geometria a menos de 0,15 m do olho', () => {
      const ruins = medido.filter(({ a }) => !(a.min >= TETO_OLHO));
      assert.equal(ruins.length, 0,
        `${ruins.length} de ${medido.length} poses põem malha do corpo dentro dos ` +
        `${TETO_OLHO} m que o critério I3 proíbe:\n` +
        ruins.map(({ nome, a }) =>
          `  ${nome}: ${m4(a.min)} m — ${a.malha}, vértice ${a.idx}, ` +
          `osso de maior peso ${a.osso ? `${a.osso.nome} (${a.osso.peso.toFixed(2)})` : '—'}, ` +
          `olho ${a.olho}`).join('\n'));
    });

    it('a sonda mediu os DOIS olhos, e o corpo estava desenhado', () => {
      /* Guarda contra o teste que passa por acidente: corpo invisível ou um
         olho só mediriam "nada perto" sem provar nada. */
      for (const { nome, a } of medido) {
        assert.equal(a.visivel, true, `${nome}: o corpo não estava desenhado`);
        assert.equal(a.olhos, 2, `${nome}: a sonda viu ${a.olhos} olho(s), não 2`);
        assert.ok(a.min !== null, `${nome}: a sonda não achou vértice nenhum`);
      }
    });
  });

describe('o ombro do boneco não sobe acima do olho, nem com o jogador sentado',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    let alto = null, baixo = null;
    before(async () => {
      h = await bootEmVR(bootGame, { port: 3634 });
      await h.play(esperarCorpo);
      await h.play(instalarSondaOlho);
      await h.play(instalarControles);
      /* A REFERÊNCIA "EM PÉ" NASCE ALTA DE PROPÓSITO. O defeito que a
         validação mediu (+0,0521 m de ombro acima do olho a 0,95 m de cabeça)
         só aparece com o "em pé" ALTO: é ele que empurra o `piso` para cima e
         é dele que a raiz do boneco não descia. Com 1,70 m de referência o
         mesmo caso passa por acidente — foi o que este arquivo fez na
         primeira versão, e um teste que passa por acidente é o defeito que
         esta base já pagou oito vezes.

         2,05 m é a mesma altura que o `test/xr-braco-alcance` usa para o
         "jogador alto", e ela LATCHA (js/xr/xrbody.js só sobe a referência
         depois de 0,75 s sustentados), então a pose seguinte já mede contra
         ela. */
      alto = await pose(h, { y: 2.05, oR: PRONTA[0], oL: PRONTA[1], voltas: 14 });
      /* 0,95 m de olho é o jogador SENTADO NO CHÃO, e a
         VRC.Quest.Tracking.1 aceita sessão sentada como modo válido. */
      baixo = await pose(h, { y: 0.95, oR: PRONTA[0], oL: PRONTA[1], voltas: 10 });
      console.log(`\n[C5] ombro vs olho — de pé (1,70 m): R ${m4(alto.ombroR)} / ` +
        `L ${m4(alto.ombroL)}\n      sentado (0,95 m): R ${m4(baixo.ombroR)} / ` +
        `L ${m4(baixo.ombroL)}  (altura lida ${m4(baixo.alturaCabeca)})\n`);
    });
    after(async () => { if (h) await h.close(); });

    it('a referência "em pé" subiu: é ela que criava o defeito', () => {
      assert.ok(alto.alturaDePe >= 2.0,
        `a referência "em pé" ficou em ${m4(alto.alturaDePe)} m — sem ela alta o ` +
        'caso de 0,95 m passa por acidente, e o defeito medido no laudo não aparece');
    });

    it('de pé o ombro está bem abaixo do olho', () => {
      assert.ok(alto.ombroR < 0, `ombro direito a ${m4(alto.ombroR)} m do olho (de pé)`);
      assert.ok(alto.ombroL < 0, `ombro esquerdo a ${m4(alto.ombroL)} m do olho (de pé)`);
    });

    it('o corpo continua ANCORADO na cabeça, com erro ≤ 0,05 m (C5)', () => {
      /* ESTE É O CASO QUE PEGA O MECANISMO, e o do ombro sozinho não pegava:
         a origem do boneco era `max(alturaCabeca, piso)`, ou seja, ela PARAVA
         quando a perna acabava de dobrar e a cabeça continuava descendo. Com
         a cabeça a 0,95 m e o "em pé" em 1,70 m, o piso ficava em 1,1536 m —
         **0,20 m de erro de âncora**, contra os 0,05 m que o critério C5
         escreve ("o corpo ancorado na cabeça com erro ≤ 0,05 m"). O ombro
         acima do olho (+0,0521 m no laudo) é o sintoma; isto é a causa. */
      const erroAlto = Math.abs(alto.raizY - alto.alturaCabeca);
      const erroBaixo = Math.abs(baixo.raizY - baixo.alturaCabeca);
      assert.ok(erroAlto <= 0.05,
        `de pé, a raiz do boneco está a ${m4(alto.raizY)} m e a cabeça a ` +
        `${m4(alto.alturaCabeca)} m: ${m4(erroAlto)} m de erro de âncora`);
      assert.ok(erroBaixo <= 0.05,
        `com a cabeça a ${m4(baixo.alturaCabeca)} m, a raiz do boneco parou em ` +
        `${m4(baixo.raizY)} m — ${m4(erroBaixo)} m ACIMA da cabeça, contra os ` +
        '0,05 m que o critério C5 aceita. O corpo deixou de acompanhar a cabeça ' +
        `(pé ${m4(baixo.afundou)} m abaixo do chão é o preço declarado disso)`);
    });

    it('com a cabeça a 0,95 m o ombro CONTINUA abaixo do olho', () => {
      /* Medido pela validação independente em `da3987c`: +0,0521 m. A partir
         de 0,95 m de cabeça a perna acabava de dobrar, o corpo parava de
         descer e a vista saía do meio do tórax — o `plantFeet` do VRIK
         ("can cause the camera to exit the head") pelo outro lado. */
      assert.ok(baixo.alturaCabeca < 1.0,
        `a sonda leu a cabeça a ${m4(baixo.alturaCabeca)} m: a pose não desceu`);
      assert.ok(baixo.ombroR < 0,
        `com a cabeça a ${m4(baixo.alturaCabeca)} m o ombro DIREITO está ` +
        `${m4(baixo.ombroR)} m ACIMA do olho`);
      assert.ok(baixo.ombroL < 0,
        `com a cabeça a ${m4(baixo.alturaCabeca)} m o ombro ESQUERDO está ` +
        `${m4(baixo.ombroL)} m ACIMA do olho`);
    });
  });

/* ================================================================
   3) O DESKTOP NÃO PAGA POR ISTO — e o número toma o lugar da foto.

   O recorte do olho apaga malha de VERDADE, e a malha é a mesma nos dois
   modos: o que sai em VR sai no monitor. E o monitor é o jogo que já está no
   ar, com a regra escrita de não regredir em nada.

   A verificação óbvia seria uma captura de tela. NÃO DÁ: o `page.screenshot`
   deste harness devolve o DOM sobre um canvas WebGL preto (tentado nesta
   rodada, três capturas, nenhuma com mundo). Então o número toma o lugar da
   foto: no desktop o corpo é FILHO DA CÂMERA e a origem da raiz É o olho,
   então cada vértice apagado já está em coordenadas de câmera, e o teste é o
   frustum — à frente do plano near e dentro do cone de `fov`/`aspect`.

   PORTA 3636.
   ================================================================ */
describe('o recorte do olho não tira nada que o jogador de MONITOR via',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h, r = null;
    before(async () => {
      h = await bootGame({ port: 3636, autoStart: true });
      r = await h.play(async () => {
        const G = window.__game;
        for (let i = 0; i < 300 && !(G.FpBody.ready || G.FpBody.failed); i++) {
          await new Promise(x => setTimeout(x, 100));
        }
        if (!G.FpBody.ready) throw new Error('FpBody não carregou o GLB');
        const c = G.FpBody.recorteCaixa;
        return {
          apagados: G.FpBody.vertsSemCabeca,
          naVista: G.FpBody.recorteNaVista,
          caixa: [c.min.toArray(), c.max.toArray()],
          paiEhCamera: G.FpBody.bodyRoot.parent === window.__MP.camera,
          escala: G.FpBody.bodyRoot.scale.x,
        };
      });
      console.log(`\n[desktop] ${r.apagados} vértices apagados da malha; ` +
        `${r.naVista} deles dentro do frustum do monitor\n`);
    });
    after(async () => { if (h) await h.close(); });

    it('a medida vale: no desktop o corpo é filho da câmera, em escala 1', () => {
      /* sem isto o "0" abaixo passaria por acidente — a conta só é em
         coordenadas de câmera porque a raiz é filha dela e não tem escala */
      assert.equal(r.paiEhCamera, true, 'o corpo não está pendurado na câmera no desktop');
      assert.ok(Math.abs(r.escala - 1) < 1e-6, `raiz em escala ${r.escala} no desktop`);
    });

    it('o recorte apagou malha de verdade', () => {
      assert.ok(r.apagados > 500,
        `só ${r.apagados} vértices saíram da malha — o recorte não rodou`);
    });

    it('e NENHUM vértice apagado estava no campo de visão do monitor', () => {
      assert.equal(r.naVista, 0,
        `${r.naVista} dos ${r.apagados} vértices apagados estavam dentro do frustum ` +
        'do desktop (caixa do recorte, em coordenadas de câmera: ' +
        `${JSON.stringify(r.caixa)}) — o jogo do monitor perdeu geometria visível`);
    });
  });
