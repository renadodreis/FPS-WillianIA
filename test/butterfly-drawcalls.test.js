/* ================================================================
   QA — FUSÃO DAS ASAS DE BORBOLETA (draw calls)

   js/amb.js criava 22 borboletas × 2 asas = 44 `new THREE.Mesh`, cada asa com
   MATERIAL PRÓPRIO (22 materiais para 5 cores de paleta). E cada asa custava
   DUAS draw calls, não uma: `transparent: true` + `side: DoubleSide` faz o
   three renderizar o objeto em DOIS passes (BackSide e depois FrontSide, em
   WebGLRenderer.renderObject), marcando `material.needsUpdate` nos dois.
   Medido no viewport de celular com WORLD_SEED=424242: 24 draw calls no solo e
   76 no battle royale — 19 % do frame inteiro do BR.

   As 44 asas viram UMA InstancedMesh com cor por instância. É o mesmo
   argumento do commit dos veículos (7f4ed3e): o three faz `diffuseColor *=
   vColor` sem conversão nenhuma e `material.color` já está no espaço de
   trabalho linear, então material BRANCO × cor da instância dá exatamente a
   mesma cor. Aqui a cor entra por `instanceColor`, e o prefixo de FRAGMENTO do
   three define USE_COLOR quando `instancingColor` está ligado
   (WebGLProgram.js:737) — é literalmente o mesmo caminho de shader.

   Este arquivo é a rede do que NÃO pode mudar junto:
     1. as draw calls caem de verdade, com TODA asa visível;
     2. a cor efetiva de cada asa é a MESMA cor linear de antes, e o material
        mantém side/transparent/opacity/blending/depth;
     3. as asas continuam BATENDO e espelhadas, com a dobradiça no corpo;
     4. a borboleta não pode sumir da tela: a esfera de uma InstancedMesh não
        acompanha as instâncias (armadilha do three r185, a mesma que
        js/meshutils.js registra), então ela não pode ser frustum-culled;
     5. o contrato do `Math.random` seedado não andou — criar Object3D/material
        come 4 sorteios do stream do worldgen por UUID, e js/amb.js roda NO MEIO
        dele (game.js:2267, antes de animais, esqueletos, noite e alien).

   Dourados colhidos em df68872 (HEAD desta rodada), WORLD_SEED=424242, ANTES
   da fusão existir.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

/* paleta de js/amb.js:11, na ordem — a borboleta i usa bColors[i % 5] */
const PALETA = [0xffd24d, 0xff8ac2, 0x9ad9ff, 0xfff3c4, 0xcf9aff];
const N_BORBOLETAS = 22;
const N_ASAS = N_BORBOLETAS * 2;

/* Teto de draw calls com TODA asa visível (frustum fora do caminho). Em HEAD
   são 88: 44 asas × 2 passes do DoubleSide transparente. Uma malha instanciada
   com `forceSinglePass` custa 1; o teto é 2 pra tolerar quem preferir manter os
   dois passes. 3 já seria regressão de balde. */
const TETO_DRAW = 2;

/* Triângulos DESENHADOS pelas asas: 44 quads de 2 triângulos. Instanciar não
   pode inventar nem perder geometria. */
const OURO_TRIS = N_ASAS * 2;

/* Faixa do bater — js/amb.js:118 produz flap = 0,3 + |sin(t·16 + phase·7)|·1,0,
   ou seja [0,3 ; 1,3]: 1,0 rad de amplitude. */
const FLAP_AMPLITUDE = 1.0;

/* stream seedado A JUSANTE de createAmb (game.js:2267). Animais (2272) e
   esqueletos (2279) nascem DEPOIS das borboletas: se a fusão consumir um
   `Math.random` a mais ou a menos, estes andam — e o mapa inteiro atrás.
   Os dois canários são imutáveis depois do worldgen: `size` é sorteado dentro
   do laço de criação (js/animals.js) e `idlePhase` (js/skeletons.js:268) só é
   LIDO pela animação, nunca reescrito. Posição não serve: bicho e esqueleto
   renascem, e aí o valor vira função do relógio, não da semente. */
const OURO_SEED = {
  animais: [0.9401, 0.9968, 0.9483, 1.0707, 1.11, 1.1065, 1.1023, 1.0081,
    0.85, 0.85, 0.85, 0.85, 0.85],
  esqueletos: [5.056, 3.439, 3.2986, 2.3055, 3.0275, 1.7277, 1.9306],
};

/* CSM. O número absoluto de csmMaterials NÃO é asserção aqui de propósito: ele
   é o total do jogo inteiro e sobe legitimamente quando qualquer outro módulo
   ganha um material — assertar 139 transformaria trabalho alheio em regressão
   falsa (aconteceu: js/grass.js subiu pra 146 no meio desta rodada). Medido
   nesta rodada, com a fusão sendo a ÚNICA mudança: 139 antes e 139 depois com o
   Guardião bloqueado, 148 antes e 148 depois com ele carregado.
   O que ESTE arquivo trava é o invariante que é dele: nenhuma asa entra no CSM
   (MeshBasicMaterial nunca esteve), e todo material registrado continua com
   shader — o canário de vazamento do item 7 de 091d5a7. */

/* Acha as asas SEM hook novo no game.js (que não é meu nesta rodada): js/amb.js
   é o único PlaneGeometry(0,16 × 0,12) do repo, e a malha fundida se identifica
   pelo nome. As duas regras convivem, então o mesmo teste roda em HEAD e depois
   da fusão sem ganhar folga nenhuma. */

describe('Borboletas — asas fundidas sem mudar o que aparece',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h, perfil, batida, semente;
    before(async () => {
      h = await bootGame({ port: 3252, blockRequests: ['Guardiao'] });

      perfil = await h.play((paleta, nAsas) => {
        const MP = window.QA.MP, G = window.QA.G;
        const acharAsas = () => {
          const out = [];
          MP.scene.traverse(o => {
            if (!(o.isMesh || o.isInstancedMesh)) return;
            const g = o.geometry;
            if (o.name === 'borboletas' || (g && g.type === 'PlaneGeometry' && g.parameters &&
                Math.abs(g.parameters.width - 0.16) < 1e-9 &&
                Math.abs(g.parameters.height - 0.12) < 1e-9)) out.push(o);
          });
          return out;
        };
        const asas = acharAsas();
        /* draw calls com TODA asa visível: o enquadramento natural varia
           (armadilha registrada na rodada de personagens), então o teto é
           medido com o frustum fora do caminho. */
        const antes = asas.map(o => o.frustumCulled);
        for (const o of asas) o.frustumCulled = false;
        const alvo = new Set(asas);
        const R = MP.renderer;
        const orig = R.renderBufferDirect;
        let calls = 0, tris = 0;
        R.renderBufferDirect = function (cam, scn, geo, mat, obj, grp) {
          if (alvo.has(obj)) {
            calls++;
            const n = geo.index ? geo.index.count : geo.attributes.position.count;
            tris += (n / 3) * (obj.isInstancedMesh ? obj.count : 1);
          }
          return orig.call(this, cam, scn, geo, mat, obj, grp);
        };
        R.render(MP.scene, MP.camera);
        R.renderBufferDirect = orig;
        asas.forEach((o, i) => { o.frustumCulled = antes[i]; });

        const mats = [], vistos = new Set();
        for (const o of asas) {
          if (vistos.has(o.material)) continue;
          vistos.add(o.material);
          const m = o.material;
          mats.push({ tipo: m.type, cor: m.color.getHexString(), side: m.side,
            transparent: m.transparent, opacity: m.opacity, blending: m.blending,
            depthWrite: m.depthWrite, depthTest: m.depthTest, fog: m.fog,
            csm: G.csmDebug.hasMaterial(m) });
        }
        /* Cor EFETIVA de cada asa = material.color × cor da instância, que é o
           que o shader calcula. Comparada com a cor linear que o hex da paleta
           produz — a mesma conta que o material próprio de cada asa fazia. */
        const c = new MP.THREE.Color(), efet = [];
        for (const o of asas) {
          if (o.isInstancedMesh) {
            for (let i = 0; i < o.count; i++) {
              o.getColorAt(i, c);
              efet.push([c.r * o.material.color.r, c.g * o.material.color.g,
                c.b * o.material.color.b]);
            }
          } else efet.push([o.material.color.r, o.material.color.g, o.material.color.b]);
        }
        const ref = [];
        for (let i = 0; i < nAsas / 2; i++) {
          c.setHex(paleta[i % paleta.length]);
          ref.push([c.r, c.g, c.b], [c.r, c.g, c.b]);
        }
        let piorCor = 0;
        for (let i = 0; i < Math.min(efet.length, ref.length); i++)
          for (let k = 0; k < 3; k++) piorCor = Math.max(piorCor, Math.abs(efet[i][k] - ref[i][k]));

        return {
          nObjetos: asas.length,
          nInstancias: asas.reduce((a, o) => a + (o.isInstancedMesh ? o.count : 1), 0),
          calls, tris, piorCor, nCores: efet.length,
          coresDistintas: new Set(efet.map(v => v.map(x => x.toFixed(6)).join(','))).size,
          frustumCulled: asas.map(o => o.frustumCulled),
          renderOrder: asas.map(o => o.renderOrder),
          /* quem MAIS no projeto usa renderOrder: se alguém passar a usar, o
             -1 das asas deixa de ser "o primeiro da fila" em silêncio. */
          outrosRenderOrder: (() => {
            let n = 0;
            MP.scene.traverse(o => { if (!alvo.has(o) && (o.renderOrder || 0) !== 0) n++; });
            return n;
          })(),
          materiais: mats,
          csmMaterialCount: G.csmDebug.materialCount,
          csmShaderCount: G.csmDebug.shaderCount,
        };
      }, PALETA, N_ASAS);

      /* ---- a asa continua batendo, espelhada e com a dobradiça no corpo ---
         Não existe hook pro objeto `bflies` (o game.js não exporta o Amb, e o
         game.js não é meu nesta rodada), então a prova sai da MATRIZ DE MUNDO
         de cada asa — que é exatamente o que a GPU consome. A leitura vale
         igual em HEAD (matrixWorld da malha) e depois (matriz da instância). */
      batida = await h.play(async () => {
        const MP = window.QA.MP, THREE = MP.THREE;
        const asas = [];
        MP.scene.traverse(o => {
          if (!(o.isMesh || o.isInstancedMesh)) return;
          const g = o.geometry;
          if (o.name === 'borboletas' || (g && g.type === 'PlaneGeometry' && g.parameters &&
              Math.abs(g.parameters.width - 0.16) < 1e-9 &&
              Math.abs(g.parameters.height - 0.12) < 1e-9)) asas.push(o);
        });
        const M = new THREE.Matrix4(), P = new THREE.Vector3(),
          Q = new THREE.Quaternion(), S = new THREE.Vector3(), E = new THREE.Euler();
        const ler = () => {
          const out = [];
          for (const o of asas) {
            if (o.isInstancedMesh) {
              for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); out.push(M.clone()); }
            } else { o.updateMatrixWorld(true); out.push(o.matrixWorld.clone()); }
          }
          return out;
        };
        const quadros = [];
        for (let f = 0; f < 90; f++) {
          await new Promise(r => requestAnimationFrame(r));
          quadros.push(ler().map(m => {
            const det = m.determinant();
            m.decompose(P, Q, S);
            E.setFromQuaternion(Q, 'YXZ');
            /* a asa 2 nasce com scale.x = -1 (espelho). O decompose devolve
               escala positiva e joga o sinal na rotação, então o SINAL DO
               DETERMINANTE é o que separa as duas asas. */
            return { p: [+P.x.toFixed(5), +P.y.toFixed(5), +P.z.toFixed(5)],
              yaw: +E.y.toFixed(5),
              esc: [+S.x.toFixed(5), +S.y.toFixed(5), +S.z.toFixed(5)],
              det: Math.sign(det) };
          }));
        }
        return { nAsas: quadros[0].length, quadros };
      });

      semente = await h.play(() => ({
        animais: window.QA.G.Animals.list.map(a => +a.size.toFixed(4)),
        esqueletos: window.QA.G.Skeletons.list.map(k => +k.idlePhase.toFixed(4)),
      }));
    });
    after(async () => { if (h) await h.close(); });

    it('1) as asas custam no máximo 2 draw calls com TODAS visíveis', () => {
      assert.ok(perfil.calls <= TETO_DRAW,
        `asas custaram ${perfil.calls} draw calls (teto ${TETO_DRAW}); ` +
        `objetos=${perfil.nObjetos} instâncias=${perfil.nInstancias}`);
    });

    it('2) uma malha instanciada com as 44 asas, e nenhuma malha solta', () => {
      assert.equal(perfil.nObjetos, 1, 'devia sobrar UM objeto de asa na cena');
      assert.equal(perfil.nInstancias, N_ASAS);
      assert.equal(perfil.tris, OURO_TRIS, 'triângulos desenhados mudaram');
    });

    it('3) cor de cada asa idêntica à de antes, com material branco', () => {
      assert.equal(perfil.materiais.length, 1, 'devia sobrar UM material de asa');
      const m = perfil.materiais[0];
      assert.equal(m.tipo, 'MeshBasicMaterial');
      assert.equal(m.cor, 'ffffff', 'o material fundido tem que ser branco');
      assert.equal(m.side, 2, 'DoubleSide');
      assert.equal(m.transparent, true);
      assert.equal(m.opacity, 0.95);
      assert.equal(m.blending, 1, 'NormalBlending');
      assert.equal(m.depthWrite, true);
      assert.equal(m.depthTest, true);
      assert.equal(m.fog, true, 'a asa sempre respeitou o fog da cena');
      assert.equal(m.csm, false, 'MeshBasicMaterial nunca esteve no CSM');
      assert.equal(perfil.nCores, N_ASAS);
      assert.equal(perfil.coresDistintas, PALETA.length, 'a paleta tem 5 cores');
      assert.ok(perfil.piorCor < 1e-6,
        `cor efetiva saiu ${perfil.piorCor} do valor linear original`);
    });

    it('4) as asas continuam batendo, espelhadas e com a dobradiça no corpo', () => {
      assert.equal(batida.nAsas, N_ASAS);
      let piorDobradica = 0, piorEscala = 0;
      const amp = [];
      for (let b = 0; b < N_BORBOLETAS; b++) {
        const yaws = [];
        for (const q of batida.quadros) {
          const a = q[b * 2], c = q[b * 2 + 1];
          for (let k = 0; k < 3; k++)
            piorDobradica = Math.max(piorDobradica, Math.abs(a.p[k] - c.p[k]));
          /* |escala|: o decompose devolve x negativo na asa espelhada (ele joga
             o sinal do determinante em sx). O que não pode mudar é o TAMANHO. */
          for (const s of [...a.esc, ...c.esc])
            piorEscala = Math.max(piorEscala, Math.abs(Math.abs(s) - 1));
          assert.equal(a.det * c.det, -1, `asas da borboleta ${b} deviam ser espelhadas`);
          yaws.push(a.yaw);
        }
        amp.push(Math.max(...yaws) - Math.min(...yaws));
      }
      assert.ok(piorDobradica < 1e-4, `dobradiça abriu ${piorDobradica} m entre as asas`);
      assert.ok(piorEscala < 1e-4, `escala da asa saiu de 1 por ${piorEscala}`);
      const mediaAmp = amp.reduce((a, b) => a + b, 0) / amp.length;
      assert.ok(mediaAmp > FLAP_AMPLITUDE * 0.5,
        `amplitude média do bater ${mediaAmp.toFixed(3)} rad — as asas pararam de bater`);
    });

    it('5) a malha das asas não pode ser frustum-culled (r185 não segue instância)', () => {
      assert.deepEqual(perfil.frustumCulled, [false],
        'InstancedMesh com instância móvel e sem esfera própria some da tela se for culled');
    });

    /* Ordenação: um transparente é ordenado pela posição da MALHA. A malha
       instanciada fica na origem enquanto as asas voam a 7-42 m do player, então
       sem renderOrder a profundidade de ordenação vira a distância do player à
       origem do mundo. Medido com um quadro aditivo na frente das asas: 71 de
       255 de diferença com a origem decidindo, ZERO com renderOrder = -1. */
    it('5b) as asas desenham primeiro entre os transparentes (renderOrder -1)', () => {
      assert.deepEqual(perfil.renderOrder, [-1]);
      assert.equal(perfil.outrosRenderOrder, 0,
        'alguém passou a usar renderOrder: o -1 das asas não é mais o primeiro da fila');
    });

    it('6) o stream seedado não andou (animais e esqueletos são a jusante)', () => {
      assert.deepEqual(semente.animais, OURO_SEED.animais,
        'animais: ' + JSON.stringify(semente.animais));
      assert.deepEqual(semente.esqueletos, OURO_SEED.esqueletos,
        'esqueletos: ' + JSON.stringify(semente.esqueletos));
    });

    it('7) nenhuma asa entra no CSM e nenhum material registrado ficou sem shader', () => {
      for (const m of perfil.materiais)
        assert.equal(m.csm, false, 'material de asa não pode estar registrado no CSM');
      assert.equal(perfil.csmMaterialCount, perfil.csmShaderCount,
        `material registrado sem shader (vazamento): ${perfil.csmMaterialCount} materiais ` +
        `x ${perfil.csmShaderCount} shaders`);
    });
  });
