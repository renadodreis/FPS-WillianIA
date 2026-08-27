/* ================================================================
   QA — AGACHAR ENCURTA A PERNA (a causa raiz do C5).

   O DEFEITO, MEDIDO ANTES DE ESCREVER UMA LINHA (sonda IWER, headset a
   1,70 m, corpo lido OSSO A OSSO no mundo, amostrado depois do rig ser
   posto no lugar do frame):

     em pé (1,70 m) ....... ombro 0,351 m ABAIXO do olho ✔
                            topo do boneco 0,179 m acima do olho ✔
                            pé 0,0035 m acima do chão ✔
     agachado (1,15 m) .... ombro 0,190 m ACIMA do olho ✘
                            topo do boneco 0,709 m acima do olho ✘
                            pé 0,0165 m abaixo do chão
     crouchT 0 → 1, com a
     CABEÇA PARADA ........ o osso do pé andou 0,0000 m ✘✘

   A última linha é a causa das outras duas. `js/fpbody.js` girava coxa e
   canela em sentidos que se cancelam: a perna mudava de forma e o pé
   ficava no mesmo lugar. Com a perna que não encurta, ancorar o corpo na
   CABEÇA (que é o que o critério C5 pede — "corpo ancorado na cabeça com
   erro ≤ 0,05 m") enterra o pé exatamente o tanto que o jogador agachou,
   e ancorar nos PÉS põe o peito do boneco na altura dos olhos. Um
   cobertor curto: os dois defeitos são a MESMA perna rígida.

   O VRIK — o solver que a Oculus Studios criou para "Dead and Buried" e
   que virou o padrão de fato de corpo em VR — nomeia esse trade-off pelo
   nome: `plantFeet` "can cause the camera to exit the head".

   COMO ESTE ARQUIVO MEDE:

   - POSIÇÃO DE OSSO, em metros, no MUNDO. Nunca contagem, nunca "chamou
     a função", nunca distância de proxy. O pé é o osso `Boot`, o joelho é
     o `Leg_2`, e o ângulo do joelho é o ângulo entre os dois segmentos.
   - O DESKTOP mede o SOLVER puro (js/fpbody.js sozinho, sem XR): a
     medida é o pé em relação à CÂMERA, que cancela a descida da própria
     câmera ao agachar e deixa só o que a perna fez.
   - O VR mede o PRODUTO dentro de sessão `immersive-vr` de verdade
     (IWER, o runtime que a Meta publica), com a pose do olho tirada de
     `rig.matrixWorld × cameras[0].matrix` DEPOIS do rig ser posto no
     lugar — nunca `camera.getWorldPosition()`, que compõe rig(N) com
     pose(N−1) e já fez um teste desta base passar por acidente.

   PORTAS 3570 (desktop) e 3572 (VR) — faixa exclusiva desta frente.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

/* O agachamento do jogo baixa o olho de 1,62 m para 1,04 m (game.js:1978):
   0,58 m é o tanto que a perna do boneco tem de encurtar para o pé ficar
   onde estava. */
const QUEDA_DO_JOGO = 0.58;

/* Sonda instalada na página: força `crouchT` DEPOIS do playerUpdate e ANTES
   do FpBody.update (o gancho é o próprio FpBody.update), e lê os ossos. */
function instalarSonda() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  const raiz = G.FpBody.bodyRoot;
  const _p = new T.Vector3(), _cam = new T.Vector3();
  const _a = new T.Vector3(), _b = new T.Vector3();
  const achar = frag => {
    let hit = null;
    const f = String(frag).replace(/[.\s]/g, '');
    raiz.traverse(o => { if (!hit && o.isBone && o.name.replace(/[.\s]/g, '').includes(f)) hit = o; });
    return hit;
  };
  const ossos = {
    peR: achar('Boot.R'), peL: achar('Boot.L'),
    joelhoR: achar('Leg_2.R'), joelhoL: achar('Leg_2.L'),
    quadrilR: achar('Leg_1.R'), quadrilL: achar('Leg_1.L'),
    ombroR: achar('Sholder.R'), ombroL: achar('Sholder.L'),
    torso: achar('Torso'),
  };
  if (!ossos.peR || !ossos.joelhoR || !ossos.quadrilR) {
    return { ok: false, motivo: 'ossos da perna não encontrados no rig' };
  }
  /* CAIXA VIVA. `Box3.setFromObject` num SkinnedMesh NÃO reflete a pose: o
     three calcula a caixa deformada UMA vez e guarda em `mesh.boundingBox`
     ("If the skinned mesh is animated, the bounding box should be recomputed
     per frame in order to reflect the current animation state" — doc do
     three). Sem este recálculo a "caixa do boneco" é a pose do primeiro frame
     transladada pela raiz: a medida acompanha a RAIZ e não o PÉ, e uma perna
     que não dobra passa despercebida. */
  const caixaViva = () => {
    raiz.updateWorldMatrix(true, true);
    raiz.traverse(o => { if (o.isSkinnedMesh) o.computeBoundingBox(); });
    return new T.Box3().setFromObject(raiz);
  };
  const fpOrig = G.FpBody.update;
  window.__P = { crouch: null };
  G.FpBody.update = function (dt, t) {
    if (window.__P.crouch !== null) MP.player.crouchT = window.__P.crouch;
    return fpOrig.call(this, dt, t);
  };
  window.__P.ler = () => {
    raiz.updateWorldMatrix(true, true);
    /* EM XR a pose da câmera é escrita pelo three DENTRO do render(): ler com
       getWorldPosition recompõe a matriz e devolve o frame anterior. Aqui a
       leitura sai da matriz já escrita. */
    _cam.setFromMatrixPosition(G.camera.matrixWorld);
    const p = nome => {
      const o = ossos[nome];
      if (!o) return null;
      o.getWorldPosition(_p);
      const w = { x: _p.x, y: _p.y, z: _p.z, dy: _p.y - _cam.y };
      /* NA RAIZ DO CORPO, e não no eixo Y do mundo: no desktop o corpo é filho
         da CÂMERA, que tem pitch. Com a câmera inclinada ~22°, os 0,22 m que o
         pé anda para a frente ao agachar viram 0,08 m de Y no mundo e comem a
         margem da medida — 0,497 m medidos contra 0,493 m de teto. Na raiz a
         conta é a do solver, sem pitch no meio. */
      raiz.worldToLocal(_p);
      w.ry = _p.y; w.rz = _p.z;
      return w;
    };
    /* ângulo INTERNO do joelho: 180° = perna esticada, 0° = dobrada em dois */
    const ang = lado => {
      const q = ossos['quadril' + lado], j = ossos['joelho' + lado], pe = ossos['pe' + lado];
      if (!q || !j || !pe) return null;
      q.getWorldPosition(_a); j.getWorldPosition(_p); pe.getWorldPosition(_b);
      _a.sub(_p); _b.sub(_p);
      if (_a.lengthSq() < 1e-9 || _b.lengthSq() < 1e-9) return null;
      return Math.acos(Math.min(1, Math.max(-1, _a.normalize().dot(_b.normalize())))) * 180 / Math.PI;
    };
    const caixa = caixaViva();
    return {
      camY: _cam.y,
      peR: p('peR'), peL: p('peL'), joelhoR: p('joelhoR'), quadrilR: p('quadrilR'),
      ombroR: p('ombroR'), ombroL: p('ombroL'), torso: p('torso'),
      anguloJoelhoR: ang('R'), anguloJoelhoL: ang('L'),
      caixaMin: caixa.isEmpty() ? null : caixa.min.y,
      caixaMax: caixa.isEmpty() ? null : caixa.max.y,
      crouchT: MP.player.crouchT,
      visivel: raiz.visible,
      escala: raiz.scale.x,
    };
  };
  return { ok: true };
}

async function esperarCorpo() {
  const G = window.__game;
  for (let i = 0; i < 300 && !(G.FpBody.ready || G.FpBody.failed); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  if (!G.FpBody.ready) throw new Error('FpBody não carregou o GLB');
}

/* ================================================================
   1) O SOLVER, SEM XR: a perna encurta quando o jogador agacha.
   ================================================================ */
describe('a perna do boneco ENCURTA ao agachar (js/fpbody.js, sem XR)',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootGame({ port: 3570 });
      await h.play(esperarCorpo);
      const r = await h.play(instalarSonda);
      assert.equal(r.ok, true, r.motivo || 'sonda não instalou');
    });
    after(async () => { if (h) await h.close(); });

    const pose = async (crouch, ms = 400) => await h.play(async (c, m) => {
      window.__P.crouch = c;
      await new Promise(r => setTimeout(r, m));
      return window.__P.ler();
    }, crouch, ms);

    it('o PÉ sobe em relação à câmera o tanto que o agachamento baixou', async () => {
      /* A MEDIDA É O OSSO DO PÉ CONTRA A CÂMERA, e não contra o mundo: ao
         agachar o jogo baixa o olho 0,58 m e o corpo desce junto (ele é filho
         da câmera no desktop). O que interessa é o que a PERNA fez, e é
         exatamente isso que a diferença cancela.

         Medido antes do conserto: 0,0000 m. A dobra girava coxa e canela em
         sentidos que mantinham o pé no mesmo lugar. */
      const a = await pose(0, 500);
      const b = await pose(1, 700);
      const subiuR = b.peR.ry - a.peR.ry;
      const subiuL = b.peL.ry - a.peL.ry;
      assert.ok(subiuR > QUEDA_DO_JOGO * 0.85,
        `o pé DIREITO andou ${subiuR.toFixed(4)} m com crouchT de 0 a 1 ` +
        `(pé na raiz ${a.peR.ry.toFixed(4)} → ${b.peR.ry.toFixed(4)}; ` +
        `no eixo do mundo ${(b.peR.dy - a.peR.dy).toFixed(4)}); ` +
        `o agachamento do jogo baixa o olho ${QUEDA_DO_JOGO} m, então a perna ` +
        'tem de encurtar esse tanto ou o pé fura o chão');
      assert.ok(subiuL > QUEDA_DO_JOGO * 0.85,
        `o pé ESQUERDO andou ${subiuL.toFixed(4)} m com crouchT de 0 a 1`);
      assert.ok(subiuR < QUEDA_DO_JOGO * 1.25,
        `o pé direito subiu ${subiuR.toFixed(4)} m: mais que o agachamento — o boneco flutua`);
    });

    it('a PERNA fica mais curta — não é só o joelho girando no lugar', async () => {
      /* A MEDIDA QUE SEPARA O CONSERTO DO TEATRO. O código antigo dobrava o
         joelho 57° e a perna encurtava só 0,083 m, porque a bacia girava 40°
         no sentido contrário e devolvia tudo: o pé ficava onde estava. Aqui a
         medida é a DISTÂNCIA quadril→pé, que é o comprimento efetivo da perna
         e não tem como ser fingida por rotação. */
      const a = await pose(0, 500);
      const b = await pose(1, 700);
      const perna = m => Math.hypot(m.quadrilR.x - m.peR.x, m.quadrilR.y - m.peR.y,
        m.quadrilR.z - m.peR.z);
      const p0 = perna(a), p1 = perna(b);
      assert.ok(p0 - p1 > QUEDA_DO_JOGO * 0.85,
        `a perna foi de ${p0.toFixed(4)} m para ${p1.toFixed(4)} m: encurtou ` +
        `${(p0 - p1).toFixed(4)} m, e o agachamento do jogo pede ${QUEDA_DO_JOGO} m ` +
        '(medido antes do conserto: 0,083 m, com o joelho dobrando 57° à toa)');
    });

    it('e o JOELHO é que dobra — dentro do que um joelho humano dobra', async () => {
      /* Encurtar não pode ser "encolher o osso": o comprimento coxa+canela é
         constante e quem some com a diferença é o ângulo do joelho. Flexão
         humana máxima ≈ 150° (ângulo interno de 30°); esticado são 180°. */
      const a = await pose(0, 500);
      const b = await pose(1, 700);
      assert.ok(a.anguloJoelhoR > 150,
        `em pé o joelho já estava a ${a.anguloJoelhoR.toFixed(1)}° (180° = esticado)`);
      assert.ok(b.anguloJoelhoR < a.anguloJoelhoR - 40,
        `agachado o joelho ficou em ${b.anguloJoelhoR.toFixed(1)}°, contra ` +
        `${a.anguloJoelhoR.toFixed(1)}° em pé: o joelho não dobrou`);
      assert.ok(b.anguloJoelhoR > 28,
        `o joelho dobrou até ${b.anguloJoelhoR.toFixed(1)}° internos: mais que ` +
        'um joelho humano (limite ~30°, que é 150° de flexão)');
      assert.ok(b.anguloJoelhoR <= 180.5 && a.anguloJoelhoR <= 180.5,
        `joelho hiperestendido: ${a.anguloJoelhoR.toFixed(1)}° / ${b.anguloJoelhoR.toFixed(1)}°`);
    });

    it('a COXA e a CANELA não mudam de comprimento (é IK, não é escala)', async () => {
      /* O jeito errado de encurtar a perna é escalar o osso: fica barato e
         fica ERRADO — a perna afina, o boneco vira anão da cintura para
         baixo e o replicado no BR herdaria isso. Aqui o comprimento de cada
         segmento é medido nos dois estados. */
      const a = await pose(0, 500);
      const b = await pose(1, 700);
      const seg = (m, p, q) => Math.hypot(m[p].x - m[q].x, m[p].y - m[q].y, m[p].z - m[q].z);
      const coxa0 = seg(a, 'quadrilR', 'joelhoR'), coxa1 = seg(b, 'quadrilR', 'joelhoR');
      const canela0 = seg(a, 'joelhoR', 'peR'), canela1 = seg(b, 'joelhoR', 'peR');
      assert.ok(Math.abs(coxa1 - coxa0) < 0.005,
        `a coxa mudou de ${coxa0.toFixed(4)} m para ${coxa1.toFixed(4)} m ao agachar`);
      assert.ok(Math.abs(canela1 - canela0) < 0.005,
        `a canela mudou de ${canela0.toFixed(4)} m para ${canela1.toFixed(4)} m ao agachar`);
    });
  });

/* ================================================================
   2) O PRODUTO, DENTRO DA SESSÃO: âncora na cabeça E pé no chão.
   ================================================================ */
describe('agachar de verdade no headset: âncora na cabeça, pé no chão',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootEmVR(bootGame, { port: 3572 });
      await h.play(esperarCorpo);
      /* Amostrador pendurado no XR.place: roda DEPOIS do rig ser posto no
         lugar deste frame, que é o único instante em que a pose do olho e a
         do corpo são do mesmo frame. */
      await h.play(() => {
        const G = window.__game, MP = window.__MP, T = MP.THREE;
        const xrCam = MP.renderer.xr.getCamera();
        const _m = new T.Matrix4(), olho = new T.Vector3(), _p = new T.Vector3();
        const _a = new T.Vector3(), _b = new T.Vector3();
        const caixa = new T.Box3();
        const raiz = G.FpBody.bodyRoot;
        const achar = frag => {
          let hit = null;
          const f = String(frag).replace(/[.\s]/g, '');
          raiz.traverse(o => {
            if (!hit && o.isBone && o.name.replace(/[.\s]/g, '').includes(f)) hit = o;
          });
          return hit;
        };
        const O = {
          peR: achar('Boot.R'), peL: achar('Boot.L'),
          joelhoR: achar('Leg_2.R'), quadrilR: achar('Leg_1.R'),
          ombroR: achar('Sholder.R'), ombroL: achar('Sholder.L'), torso: achar('Torso'),
          cabeca: achar('Head_'),
        };
        const orig = G.XR.place.bind(G.XR);
        window.__V = { amostra: null };
        G.XR.place = (...a) => {
          const v = orig(...a);
          G.XR.rig.updateMatrixWorld(true);
          _m.multiplyMatrices(G.XR.rig.matrixWorld, xrCam.cameras[0].matrix);
          olho.setFromMatrixPosition(_m);
          raiz.updateMatrixWorld(true);
          const rel = nome => {
            const o = O[nome];
            if (!o) return null;
            o.getWorldPosition(_p);
            return { y: _p.y, dy: _p.y - olho.y, dxz: Math.hypot(_p.x - olho.x, _p.z - olho.z) };
          };
          O.quadrilR.getWorldPosition(_a); O.joelhoR.getWorldPosition(_p); O.peR.getWorldPosition(_b);
          _a.sub(_p); _b.sub(_p);
          const ang = Math.acos(Math.min(1, Math.max(-1,
            _a.normalize().dot(_b.normalize())))) * 180 / Math.PI;
          raiz.traverse(o => { if (o.isSkinnedMesh) o.computeBoundingBox(); });
          caixa.setFromObject(raiz);
          window.__V.amostra = {
            olhoY: olho.y,
            chao: MP.groundAt(olho.x, olho.z, olho.y),
            topo: caixa.isEmpty() ? null : caixa.max.y,
            base: caixa.isEmpty() ? null : caixa.min.y,
            peR: rel('peR'), peL: rel('peL'), joelhoR: rel('joelhoR'),
            ombroR: rel('ombroR'), ombroL: rel('ombroL'),
            torso: rel('torso'), cabeca: rel('cabeca'), anguloJoelhoR: ang,
            /* TOPO RÍGIDO DO MODELO: a raiz do corpo é o OLHO do boneco e o
               alto da cabeça fica `eyeDrop` acima dela. É esta a medida que o
               laudo anterior publicou como "topo do boneco 0,709 m acima do
               olho" — fica aqui para a comparação ser da mesma régua. A caixa
               do objeto NÃO serve: em VR os controles emulados não descem com
               o agachamento, os braços do boneco sobem atrás deles e quem
               ganha o topo da caixa é o DEDO, a 0,41 m acima do olho. */
            topoRigido: raiz.position.y + G.FpBody.TUNE.eyeDrop * raiz.scale.x
              - (olho.y - G.XR.rig.position.y),
            escala: G.XR.corpo.escala,
            altCabeca: G.XR.corpo.alturaCabeca,
            altDePe: G.XR.corpo.alturaDePe,
            agachado: G.XR.corpo.agachado,
          };
          return v;
        };
      });
    });
    after(async () => { if (h) await h.close(); });

    /* Esperas generosas: a janela de sustentação da altura "em pé" (0,75 s)
       corre em tempo SIMULADO e game.js clampa o passo em 50 ms — num Chrome
       de teste a 10 fps, um segundo de relógio vale meio segundo de simulação. */
    const pose = async (y, ms = 2500) => await h.play(async (yy, mm) => {
      const dev = window.__xrEmulado;
      dev.position.set(0, yy, 0);
      dev.quaternion.set(0, 0, 0, 1);
      await new Promise(r => setTimeout(r, mm));
      return window.__V.amostra;
    }, y, ms);

    it('EM PÉ: pé no chão, ombro abaixo do olho, topo do boneco na cabeça', async () => {
      const a = await pose(1.70, 3000);
      assert.ok(Math.abs(a.base - a.chao) < 0.05,
        `o pé do boneco ficou a ${(a.base - a.chao).toFixed(4)} m do chão em pé`);
      assert.ok(a.ombroR.dy < -0.20 && a.ombroL.dy < -0.15,
        `ombros a ${a.ombroR.dy.toFixed(4)} / ${a.ombroL.dy.toFixed(4)} m do olho`);
      assert.ok(Math.abs(a.topoRigido - 0.18) < 0.10,
        `o topo da cabeça do boneco ficou ${a.topoRigido.toFixed(4)} m acima do olho ` +
        '(o alto de uma cabeça são ~0,18 m)');
      assert.ok(Math.abs(a.cabeca.dy) < 0.20,
        `o osso da cabeça do boneco ficou a ${a.cabeca.dy.toFixed(4)} m do olho do jogador`);
    });

    it('AGACHADO a 1,15 m: o pé NÃO enterra e o ombro NÃO sobe acima do olho', async () => {
      /* O critério C5 pede "o corpo ancorado na cabeça com erro ≤ 0,05 m".
         Medido antes do conserto, com o corpo ancorado nos PÉS: ombro +0,190 m
         ACIMA do olho e topo do boneco +0,709 m — a vista saindo do meio do
         tórax. Ancorar na cabeça sem encurtar a perna trocava o defeito de
         lugar: o pé enterrava 0,31 a 0,47 m. */
      await pose(1.70, 3000);
      const a = await pose(1.15, 2200);
      assert.equal(a.agachado, true,
        `o jogo não reconheceu o agachamento (altDePe ${a.altDePe.toFixed(3)})`);
      assert.ok(a.base - a.chao > -0.06,
        `agachado, o pé do boneco enterrou ${(a.chao - a.base).toFixed(4)} m no chão`);
      assert.ok(a.base - a.chao < 0.12,
        `agachado, o pé do boneco flutuou ${(a.base - a.chao).toFixed(4)} m`);
      assert.ok(a.ombroR.dy < -0.10,
        `agachado, o ombro DIREITO ficou a ${a.ombroR.dy.toFixed(4)} m do olho ` +
        '(negativo = abaixo; medido antes do conserto: +0,190 m)');
      assert.ok(a.ombroL.dy < -0.05,
        `agachado, o ombro ESQUERDO ficou a ${a.ombroL.dy.toFixed(4)} m do olho ` +
        '(medido antes do conserto: +0,308 m)');
      assert.ok(a.topoRigido < 0.30,
        `agachado, o topo da cabeça do boneco ficou ${a.topoRigido.toFixed(4)} m acima ` +
        'do olho do jogador (medido antes do conserto: 0,709 m)');
      assert.ok(Math.abs(a.cabeca.dy) < 0.20,
        `agachado, o osso da cabeça do boneco ficou a ${a.cabeca.dy.toFixed(4)} m do ` +
        'olho do jogador: a cabeça do boneco tem de acompanhar a cabeça real');
      /* O PÉ MEDIDO NO OSSO, ao lado da caixa: a caixa dá a sola e o osso dá o
         tornozelo. Como a bota é mantida CHAPADA, um é o outro mais uma
         constante — e se os dois não andarem juntos, alguma coisa na medida
         está mentindo. */
      const pe0 = await pose(1.70, 3000);
      assert.ok(Math.abs((a.peR.y - a.chao) - (pe0.peR.y - pe0.chao)) < 0.05,
        `o TORNOZELO direito saiu de ${(pe0.peR.y - pe0.chao).toFixed(4)} m do chão em pé ` +
        `para ${(a.peR.y - a.chao).toFixed(4)} m agachado`);
    });

    it('e é o JOELHO que absorve o agachamento, sem passar do limite humano', async () => {
      const dePe = await pose(1.70, 3000);
      const agachado = await pose(1.15, 2200);
      assert.ok(dePe.anguloJoelhoR > 150,
        `em pé o joelho já estava dobrado a ${dePe.anguloJoelhoR.toFixed(1)}°`);
      assert.ok(agachado.anguloJoelhoR < dePe.anguloJoelhoR - 40,
        `o joelho foi de ${dePe.anguloJoelhoR.toFixed(1)}° para ` +
        `${agachado.anguloJoelhoR.toFixed(1)}°: não é o joelho que está agachando`);
      assert.ok(agachado.anguloJoelhoR > 28,
        `o joelho dobrou até ${agachado.anguloJoelhoR.toFixed(1)}° internos — ` +
        'mais que os ~30° (150° de flexão) que um joelho humano faz');
      /* AGACHAR É JOELHO PARA CIMA E PARA A FRENTE, NÃO PARA BAIXO. Existem
         duas soluções de IK para o mesmo pé, e a diferença entre elas é a
         diferença entre agachar e ajoelhar de costas. Com o tornozelo ATRÁS do
         quadril (que é onde ele nasce na pose de descanso) a única saída é o
         joelho mergulhar: medido com `footFwd` em zero, joelho a 0,047 m do
         chão, 0,084 m ABAIXO do próprio tornozelo. Nenhuma outra medida deste
         arquivo enxerga isso — o pé continua plantado e o ombro continua no
         lugar enquanto a perna dobra ao contrário. */
      assert.ok(agachado.joelhoR.y - agachado.peR.y > 0.05,
        `agachado, o joelho ficou ${(agachado.joelhoR.y - agachado.peR.y).toFixed(4)} m ` +
        'acima do tornozelo: num agachamento o joelho sobe à frente do pé, e ' +
        'joelho abaixo do tornozelo é a perna dobrando para trás');
      await pose(1.70, 3000);
    });

    it('o agachamento RASO (0,25 m) já mexe na perna, e sem enterrar o pé', async () => {
      /* O caso do meio importa: um solver que só acerta os extremos entrega
         um degrau no meio do movimento, e quem agacha devagar vê o boneco
         pular. */
      await pose(1.70, 3000);
      const a = await pose(1.45, 2000);
      assert.ok(a.base - a.chao > -0.06,
        `agachado 0,25 m, o pé enterrou ${(a.chao - a.base).toFixed(4)} m`);
      assert.ok(a.base - a.chao < 0.10,
        `agachado 0,25 m, o pé flutuou ${(a.base - a.chao).toFixed(4)} m`);
      assert.ok(a.ombroR.dy < -0.20,
        `agachado 0,25 m, o ombro ficou a ${a.ombroR.dy.toFixed(4)} m do olho`);
      assert.ok(a.anguloJoelhoR < 165,
        `agachado 0,25 m, o joelho ficou em ${a.anguloJoelhoR.toFixed(1)}°: a perna não reagiu`);
      await pose(1.70, 3000);
    });
  });
