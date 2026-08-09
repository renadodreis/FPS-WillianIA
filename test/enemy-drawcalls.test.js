/* ================================================================
   QA — FUSÃO DO CORPO PROCEDURAL DOS INIMIGOS (draw calls)

   O boneco procedural era montado com 32 (executivo) a 37 (pesado) `new
   THREE.Mesh` soltos, e cada um é UMA draw call. Medido no viewport de
   celular com o mundo recém-criado, os 8 executivos da Torre Nexus custavam
   256 das 560 draw calls do frame.

   js/meshutils.js:fuseBody funde as peças em poucas malhas — uma por
   (material, castShadow) — usando os membros articulados como ossos rígidos.
   Este arquivo é a rede de proteção do que NÃO pode mudar junto:

     1. draw calls caem de verdade;
     2. hitbox é analítica (hitSpheres) e continua idêntica — tiro na cabeça
        segue sendo tiro na cabeça;
     3. a silhueta de CADA material, numa POSE ANIMADA, é a mesma casa decimal
        por casa decimal (cor, rugosidade, metalicidade, posição e articulação);
     4. a silhueta que projeta sombra é a mesma, e os materiais continuam
        registrados no CSM;
     5. a esfera delimitadora do SkinnedMesh cobre a pose animada (armadilha
        do three r185: ela não acompanha os ossos);
     6. o contrato do `Math.random` seedado não andou — fundir cria objetos
        THREE novos e cada UUID come 4 sorteios do stream do worldgen.

   Os valores dourados abaixo foram colhidos em HEAD (13b3552 + rodada de
   celular), com WORLD_SEED=424242, ANTES da fusão existir.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

/* pose fixa de mira: braços à frente, cabeça virada, pernas em passo */
const POSE = {
  armR: [-Math.PI / 2 + 0.31, 0, 0],
  armL: [-Math.PI / 2 + 0.45, 0, 0.6],
  legL: [0.53, 0, 0],
  legR: [-0.53, 0, 0],
  head: [0, 0.7, 0],
};

/* Dourados de HEAD. Chave = cor|tipo|rugosidade|metalicidade; valor = caixa
   [min, max] que os vértices DAQUELE material ocupam, na pose acima, com o
   grupo na origem. O plano do flash (ffd9a0) fica de fora: ele tinha
   opacidade 0 fora do tiro e agora fica invisível — é a única mudança. */
const OURO = {
  executivo: {
    drawCalls: 32,
    caixaSombra: [[-0.573, 0.145, -0.43], [0.578, 2.02, 0.43]],
    porMaterial: {
      '14161a|MeshStandardMaterial|r0.5|m0.5': [[0.405, 1.189, 0.536], [0.475, 1.98, 0.84]],
      '151712|MeshStandardMaterial|r0.6|m0': [[-0.016, 1.775, 0.019], [0.261, 1.845, 0.272]],
      '16181d|MeshStandardMaterial|r0.55|m0.1': [[-0.573, 0.387, -0.302], [0.578, 2.08, 0.428]],
      '22252d|MeshStandardMaterial|r0.6|m0.3': [[-0.29, 0.04, -0.466], [0.51, 1.503, 0.792]],
      '8a1620|MeshStandardMaterial|r0.6|m0': [[-0.035, 1.01, 0.281], [0.035, 1.35, 0.339]],
      'c9a182|MeshStandardMaterial|r0.75|m0': [[-0.239, 1.54, -0.239], [0.239, 2.02, 0.239]],
      'e8e8ea|MeshStandardMaterial|r0.7|m0': [[-0.13, 0.99, 0.21], [0.13, 1.45, 0.31]],
    },
  },
  soldado: {
    drawCalls: 36,
    caixaSombra: [[-0.573, 0.145, -0.43], [0.578, 2.105, 0.43]],
    porMaterial: {
      '14161a|MeshStandardMaterial|r0.5|m0.5': [[0.405, 1.189, 0.536], [0.475, 1.98, 0.84]],
      '200505|MeshStandardMaterial|r0.3|m0': [[-0.012, 1.735, 0.023], [0.27, 1.825, 0.283]],
      '22252d|MeshStandardMaterial|r0.6|m0.3': [[-0.29, 0.04, -0.466], [0.51, 2.02, 0.792]],
      '4a5240|MeshStandardMaterial|r0.75|m0.05': [[-0.464, 0.423, -0.302], [0.515, 1.69, 0.428]],
      '59626f|MeshStandardMaterial|r0.45|m0.45': [[-0.573, 0.387, -0.304], [0.578, 2.105, 0.308]],
    },
  },
  pesado: {
    drawCalls: 37,
    caixaSombra: [[-0.573, 0.145, -0.43], [0.578, 2.105, 0.43]],
    porMaterial: {
      '14161a|MeshStandardMaterial|r0.5|m0.5': [[0.405, 1.189, 0.536], [0.475, 1.98, 0.84]],
      '200505|MeshStandardMaterial|r0.3|m0': [[-0.012, 1.735, 0.023], [0.27, 1.825, 0.283]],
      '22252d|MeshStandardMaterial|r0.6|m0.3': [[-0.29, 0.04, -0.466], [0.51, 2.02, 0.792]],
      '272b34|MeshStandardMaterial|r0.4|m0.55': [[-0.573, 0.387, -0.304], [0.578, 2.105, 0.308]],
      '363b46|MeshStandardMaterial|r0.7|m0.1': [[-0.464, 0.423, -0.302], [0.515, 1.69, 0.428]],
      '9c5018|MeshStandardMaterial|r0.5|m0.3': [[-0.2, 1.07, -0.4], [0.2, 2.29, 0.066]],
    },
  },
};

/* teto de draw calls por inimigo procedural: uma malha por (material +
   bandeiras de render). Valores MEDIDOS, sem folga: um balde a mais por corpo
   é regressão e tem que falhar aqui. Executivo/pesado usam 6 materiais,
   soldado 5; o que passa de 6 são os materiais que aparecem com e sem sombra. */
const TETO = { executivo: 9, soldado: 7, pesado: 9 };

/* ---- esfera delimitadora ----------------------------------------------
   O corpo fundido tem UMA esfera para as 7-9 malhas, calculada em repouso e
   inflada por `boundsFactor` (js/meshutils.js). Cada centímetro de raio é
   culling perdido: um inimigo parado logo fora da borda da tela passa a
   custar as 7-9 draw calls MAIS `skeleton.update()` e o reupload da bone
   texture, nas 4 cascatas do CSM. Teto MEDIDO com a varredura de pose
   abaixo (pior distância a um vértice: 1,4407 / 1,4270 / 1,3396 m). */
const TETO_ESFERA = { executivo: 1.65, soldado: 1.66, pesado: 1.78 };
/* e o outro lado: ninguém pode raspar a esfera no pior caso medido — pose
   futura cresce. Mínimo de 8 % de folga sobre a varredura. */
const FOLGA_MINIMA = 1.08;

/* Materiais standard do corpo que NÃO estão registrados no CSM — estado de
   HEAD, reproduzido aqui pra a fusão não mexer nele sem querer (nem pra mais
   nem pra menos). O visor é emissivo de propósito; os óculos do executivo
   usam o material do soco das mãos em 1ª pessoa (js/weapons.js), que vive
   fora do CSM. Não é do escopo desta rodada consertar. */
const OURO_SEM_CSM = {
  executivo: ['151712|MeshStandardMaterial|r0.6|m0'],
  soldado: ['200505|MeshStandardMaterial|r0.3|m0'],
  pesado: ['200505|MeshStandardMaterial|r0.3|m0'],
};

/* stream seedado LOGO A JUSANTE do buildBody: se a fusão consumir um
   `Math.random` a mais ou a menos, isto anda (e o mapa inteiro atrás).

   Os canários têm que ser IMUTÁVEIS depois do worldgen. `animais` era a
   POSIÇÃO do bicho — e posição de animal não é função da semente depois do
   boot: o harness mata todos e eles renascem em spawnPos() a cada 5 s, ou
   seja, é função do RELÓGIO. Passava por sorte e ia piscar sozinho num boot
   lento. O `size` é sorteado DENTRO do laço de criação (js/animals.js:109) e
   nunca mais muda: é o canário certo pro mesmo trecho de stream. */
const OURO_SEED = {
  casas: [[79.8919, 118.9435], [-345.0308, -214.8442], [-19.1836, -72.3092]],
  waypoints: [[93.2651, 124.1702], [-336.2117, -206.5287], [-5.6515, -66.9843]],
  yaws: [5.3518, 5.0665, 0.573],
  // 8 herbívoros com tamanho sorteado + 5 predadores de tamanho fixo (0,85)
  animais: [0.9401, 0.9968, 0.9483, 1.0707, 1.11, 1.1065, 1.1023, 1.0081,
    0.85, 0.85, 0.85, 0.85, 0.85],
};

describe('Inimigos — corpo fundido sem mudar o que aparece', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, perfis, esferas;
  before(async () => {
    /* O GLB do Guardião troca o visual de quem não é executivo e esconde o
       corpo procedural. Bloqueá-lo deixa os três tipos procedurais na mesa e
       tira a corrida de carregamento do caminho do teste. */
    h = await bootGame({ port: 3246, blockRequests: ['Guardiao'] });
    perfis = await h.play(pose => {
      const G = window.QA.G, MP = window.QA.MP, THREE = MP.THREE;
      const rd = v => +v.toFixed(3);
      const vertsWorld = (mesh, cb) => {
        const v = new THREE.Vector3();
        const pos = mesh.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          if (mesh.isSkinnedMesh) mesh.getVertexPosition(i, v);
          else v.fromBufferAttribute(pos, i);
          cb(v.applyMatrix4(mesh.matrixWorld));
        }
      };
      const perfil = e => {
        const g = e.group;
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.setScalar(1);
        for (const k of Object.keys(pose)) e.parts[k].rotation.set(...pose[k]);
        g.updateMatrixWorld(true);
        if (e.skeleton) e.skeleton.update();
        const porMat = {}, caixaSombra = new THREE.Box3();
        let malhas = 0, foraDaEsfera = 0, semCsm = [];
        g.traverse(o => {
          if (!(o.isMesh || o.isSkinnedMesh) || !o.visible) return;
          malhas++;
          const m = Array.isArray(o.material) ? o.material[0] : o.material;
          const key = `${m.color.getHexString()}|${m.type}|r${m.roughness}|m${m.metalness}`;
          const box = porMat[key] ? new THREE.Box3(
            new THREE.Vector3(...porMat[key][0]), new THREE.Vector3(...porMat[key][1])) : new THREE.Box3();
          const esfera = o.boundingSphere && o.boundingSphere.clone().applyMatrix4(o.matrixWorld);
          vertsWorld(o, v => {
            box.expandByPoint(v);
            if (o.castShadow) caixaSombra.expandByPoint(v);
            if (esfera && v.distanceTo(esfera.center) > esfera.radius + 1e-4) foraDaEsfera++;
          });
          porMat[key] = [box.min.toArray().map(rd), box.max.toArray().map(rd)];
          if (m.isMeshStandardMaterial && !G.csmDebug.hasMaterial(m)) semCsm.push(key);
        });
        return { malhas, foraDaEsfera, semCsm,
          caixaSombra: [caixaSombra.min.toArray().map(rd), caixaSombra.max.toArray().map(rd)],
          porMaterial: porMat,
          partes: Object.keys(e.parts).sort(),
          hitSpheres: e.hitSpheres().map(s => ({ r: +s.r.toFixed(4), part: s.part,
            dy: +(s.c.y - g.position.y).toFixed(4) })) };
      };
      const draws = e => { // draw calls REAIS: só esse inimigo visível
        const cam = MP.camera;
        cam.position.set(0, 1.1, 6); cam.rotation.set(0, 0, 0); cam.updateMatrixWorld(true);
        const prev = new Map();
        MP.scene.children.forEach(c => { prev.set(c, c.visible); c.visible = false; });
        e.group.visible = true;
        MP.renderer.info.autoReset = true;
        MP.renderer.render(MP.scene, cam);
        const n = MP.renderer.info.render.calls;
        MP.scene.children.forEach(c => { c.visible = prev.get(c); });
        return n;
      };
      const achar = {
        executivo: G.Enemies.list.find(e => e.suit && !e.hasModel),
        soldado: G.Enemies.list.find(e => !e.suit && !e.heavy && !e.hasModel),
        pesado: G.Enemies.list.find(e => e.heavy && !e.hasModel),
      };
      const out = { semente: {
        casas: G.Enemies.list.slice(0, 3).map(e => [+e.home.x.toFixed(4), +e.home.z.toFixed(4)]),
        waypoints: G.Enemies.list.slice(0, 3).map(e => [+e.waypoints[0].x.toFixed(4), +e.waypoints[0].z.toFixed(4)]),
        yaws: G.Enemies.list.slice(0, 3).map(e => +e.yaw.toFixed(4)),
        animais: G.Animals.list.map(a => +a.size.toFixed(4)),
      } };
      for (const [nome, e] of Object.entries(achar)) {
        if (!e) { out[nome] = null; continue; }
        out[nome] = perfil(e);
        out[nome].drawCalls = draws(e);
      }
      return out;
    }, POSE);

    /* ---- varredura da FAIXA de pose, não de UMA pose ------------------
       O teste da esfera acima usa a pose fixa de mira. Isso não prova nada
       sobre o resto da animação. Aqui percorre-se TODO vértice do corpo em
       toda a faixa que js/enemies.js:439-478 produz, e exige-se zero fora.

       Por que dá pra varrer osso a osso: o skinning é RÍGIDO (cada vértice
       pesa 1 num único osso) e todo osso é filho direto do grupo — a posição
       de um vértice depende SÓ da rotação do seu osso. O teste confere as
       duas premissas antes de usá-las. */
    esferas = await h.play(() => {
      const G = window.QA.G, MP = window.QA.MP, THREE = MP.THREE;
      const PI2 = Math.PI / 2;
      /* união do que a mira e a caminhada produzem (js/enemies.js:439-478):
         braços transitam por damp entre a pose de mira (clamp de ±0,6 em
         torno de -PI/2) e o balanço da caminhada (±0,6 × 0,8); armL.z entre 0
         e 0,6; pernas recebem ±swing; a cabeça vasculha ±0,7 em Y. */
      const FAIXAS = {
        head: { y: [-0.7, 0.7] },
        armL: { x: [-PI2 - 0.6 + 0.14, 0.48], z: [0, 0.6] },
        armR: { x: [-PI2 - 0.6, 0.48] },
        legL: { x: [-0.6, 0.6] },
        legR: { x: [-0.6, 0.6] },
      };
      const ORDEM = ['head', 'armL', 'armR', 'legL', 'legR']; // = bones de js/enemies.js:138
      const lin = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
      const achar = {
        executivo: G.Enemies.list.find(e => e.suit && !e.hasModel),
        soldado: G.Enemies.list.find(e => !e.suit && !e.heavy && !e.hasModel),
        pesado: G.Enemies.list.find(e => e.heavy && !e.hasModel),
      };
      const out = {};
      for (const [nome, e] of Object.entries(achar)) {
        if (!e) { out[nome] = null; continue; }
        const g = e.group, bones = e.skeleton.bones, inv = e.skeleton.boneInverses;
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.setScalar(1);
        for (const k of Object.keys(e.parts)) e.parts[k].rotation.set(0, 0, 0);
        g.updateMatrixWorld(true);
        const premissas = {
          raizEhOGrupo: bones[0] === g,
          ossosNaOrdem: ORDEM.every((k, i) => bones[i + 1] === e.parts[k]),
          hierarquiaPlana: bones.slice(1).every(b => b.parent === g),
          esferaCompartilhada: true, pesoRigido: true,
        };
        const malhas = [];
        g.traverse(o => { if (o.isSkinnedMesh) malhas.push(o); });
        const raio = malhas[0].boundingSphere.radius;
        const centro = malhas[0].boundingSphere.center.clone();
        // vértices em repouso, agrupados pelo osso que os move
        const porOsso = bones.map(() => []);
        for (const m of malhas) {
          if (m.boundingSphere.radius !== raio) premissas.esferaCompartilhada = false;
          const pos = m.geometry.attributes.position;
          const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
          for (let i = 0; i < pos.count; i++) {
            if (sw.getX(i) !== 1 || sw.getY(i) !== 0) premissas.pesoRigido = false;
            porOsso[si.getX(i)].push(pos.getX(i), pos.getY(i), pos.getZ(i));
          }
        }
        const arr = porOsso.map(a => new Float32Array(a));
        const T = new THREE.Matrix4(), v = new THREE.Vector3();
        let pior = 0, fora = 0, poses = 0, nVert = 0;
        const varrer = b => {
          T.multiplyMatrices(bones[b].matrixWorld, inv[b]);
          const a = arr[b];
          for (let i = 0; i < a.length; i += 3) {
            v.set(a[i], a[i + 1], a[i + 2]).applyMatrix4(T);
            const d = v.distanceTo(centro);
            if (d > pior) pior = d;
            if (d > raio + 1e-4) fora++;
            nVert++;
          }
          poses++;
        };
        varrer(0); // tronco/cinto: não gira sozinho
        for (let b = 1; b < bones.length; b++) {
          const f = FAIXAS[ORDEM[b - 1]];
          const xs = f.x ? lin(f.x[0], f.x[1], 33) : [0];
          const ys = f.y ? lin(f.y[0], f.y[1], 33) : [0];
          const zs = f.z ? lin(f.z[0], f.z[1], 17) : [0];
          for (const x of xs) for (const y of ys) for (const z of zs) {
            bones[b].rotation.set(x, y, z);
            g.updateMatrixWorld(true);
            varrer(b);
          }
          bones[b].rotation.set(0, 0, 0);
        }
        g.updateMatrixWorld(true);

        /* morte: js/enemies.js:316-334 dá `continue` ANTES do bloco de
           animação — os membros congelam onde estavam (dentro das faixas
           acima) e o grupo tomba até PI/2, gira em Z e encolhe até 0,001.
           Tudo isso é transformação do GRUPO: a esfera do skinned mesh anda
           junto pelo matrixWorld. Confere-se no mundo, com a pior pose. */
        e.parts.armR.rotation.set(-PI2 - 0.6, 0, 0);
        e.parts.armL.rotation.set(-PI2 - 0.46, 0, 0.6);
        e.parts.legL.rotation.set(-0.6, 0, 0); e.parts.legR.rotation.set(0.6, 0, 0);
        e.parts.head.rotation.set(0, -0.7, 0);
        let foraNaMorte = 0;
        for (const escala of [1, 0.35, 0.001]) {
          g.position.set(12, 3, -7);
          g.rotation.set(Math.PI / 2, 1.3, 2.9);
          g.scale.setScalar(escala * (e.heavy ? 1.16 : 1));
          g.updateMatrixWorld(true);
          e.skeleton.update();
          const mundo = new THREE.Vector3();
          for (const m of malhas) {
            const esf = m.boundingSphere.clone().applyMatrix4(m.matrixWorld);
            for (let i = 0; i < m.geometry.attributes.position.count; i++) {
              m.getVertexPosition(i, mundo);
              mundo.applyMatrix4(m.matrixWorld);
              if (mundo.distanceTo(esf.center) > esf.radius + 1e-4) foraNaMorte++;
            }
          }
        }
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0);
        g.scale.setScalar(e.heavy ? 1.16 : 1);
        for (const k of Object.keys(e.parts)) e.parts[k].rotation.set(0, 0, 0);
        g.updateMatrixWorld(true);

        out[nome] = { premissas, malhas: malhas.length, poses, nVert, fora, foraNaMorte,
          raio: +raio.toFixed(4), pior: +pior.toFixed(4),
          folga: +(raio / pior).toFixed(4) };
      }
      return out;
    });
  });
  after(async () => { if (h) await h.close(); });

  for (const nome of ['executivo', 'soldado', 'pesado']) {
    it(`${nome}: draw calls caem sem perder nenhuma peça`, () => {
      const p = perfis[nome];
      assert.ok(p, `nenhum inimigo do tipo ${nome} nasceu procedural`);
      assert.ok(p.drawCalls <= TETO[nome],
        `${nome} desenha ${p.drawCalls} malhas (teto ${TETO[nome]}, era ${OURO[nome].drawCalls})`);
      assert.equal(p.malhas, p.drawCalls, 'malha visível que não vira draw call (ou vice-versa)');
      // nenhum material sumiu: a fusão é por material, então a conta fecha
      assert.deepEqual(Object.keys(p.porMaterial).sort(),
        Object.keys(OURO[nome].porMaterial).sort());
    });

    it(`${nome}: cada material ocupa o MESMO volume na pose animada`, () => {
      const p = perfis[nome];
      const dif = [];
      for (const [k, ouro] of Object.entries(OURO[nome].porMaterial)) {
        const agora = p.porMaterial[k];
        for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++)
          if (Math.abs(agora[i][j] - ouro[i][j]) > 0.002)
            dif.push(`${k} [${i}][${j}]: ouro ${ouro[i][j]} agora ${agora[i][j]}`);
      }
      assert.deepEqual(dif, [], `silhueta por material mudou:\n${dif.join('\n')}`);
    });

    it(`${nome}: a silhueta que projeta sombra é a mesma`, () => {
      const p = perfis[nome];
      const ouro = OURO[nome].caixaSombra;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++)
        assert.ok(Math.abs(p.caixaSombra[i][j] - ouro[i][j]) <= 0.002,
          `caixa de sombra [${i}][${j}]: ouro ${ouro[i][j]} agora ${p.caixaSombra[i][j]}`);
      assert.deepEqual([...new Set(p.semCsm)].sort(), OURO_SEM_CSM[nome],
        'mudou quais materiais do corpo recebem as cascatas do CSM');
    });

    it(`${nome}: esfera delimitadora cobre a pose animada (r185)`, () => {
      assert.equal(perfis[nome].foraDaEsfera, 0,
        'vértice fora da bounding sphere: o inimigo some da tela ao mirar');
    });

    it(`${nome}: esfera cobre TODA a faixa de pose, inclusive a morte`, () => {
      const s = esferas[nome];
      assert.ok(s, `nenhum inimigo do tipo ${nome} nasceu procedural`);
      // as premissas que tornam a varredura osso a osso exata
      assert.deepEqual(s.premissas, { raizEhOGrupo: true, ossosNaOrdem: true,
        hierarquiaPlana: true, esferaCompartilhada: true, pesoRigido: true },
      'a fusão mudou o rig: a varredura osso a osso deixou de ser exaustiva');
      assert.ok(s.nVert > 20000, `varredura vazia (${s.nVert} vértices em ${s.poses} poses)`);
      assert.equal(s.fora, 0,
        `${s.fora} vértices fora da esfera na faixa de animação: o inimigo some da tela`);
      assert.equal(s.foraNaMorte, 0,
        'vértice fora da esfera no tombo/encolhimento da morte');
    });

    it(`${nome}: esfera não sobra (cada centímetro é culling perdido)`, () => {
      const s = esferas[nome];
      assert.ok(s.raio <= TETO_ESFERA[nome],
        `esfera de ${s.raio} m (teto ${TETO_ESFERA[nome]}); pior vértice medido ` +
        `fica a ${s.pior} m, então sobram ${(s.raio - s.pior).toFixed(3)} m de ` +
        'culling grosso — o inimigo fora da tela paga draw call + skeleton.update()');
      assert.ok(s.folga >= FOLGA_MINIMA,
        `esfera raspando o pior caso (folga ${s.folga}×, mínimo ${FOLGA_MINIMA}×): ` +
        'qualquer pose nova estoura e o inimigo some ao mirar');
    });

    it(`${nome}: hitbox analítica intacta e membros ainda articulados`, () => {
      const p = perfis[nome];
      assert.deepEqual(p.partes, ['armL', 'armR', 'head', 'legL', 'legR']);
      assert.deepEqual(p.hitSpheres, [
        { r: 0.3, part: 'head', dy: 1.8 },
        { r: 0.43, part: 'body', dy: 1.22 },
        { r: 0.4, part: 'body', dy: 0.78 },
        { r: 0.36, part: 'body', dy: 0.36 },
      ]);
    });
  }

  it('o stream seedado do worldgen não andou (contrato do Math.random)', () => {
    assert.deepEqual(perfis.semente.casas, OURO_SEED.casas);
    assert.deepEqual(perfis.semente.waypoints, OURO_SEED.waypoints);
    assert.deepEqual(perfis.semente.yaws, OURO_SEED.yaws);
    assert.deepEqual(perfis.semente.animais, OURO_SEED.animais);
  });
});

describe('Inimigos — tiro na cabeça e no corpo depois da fusão', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootGame({ port: 3247, blockRequests: ['Guardiao'] }); });
  after(async () => { if (h) await h.close(); });

  it('a hitbox continua sendo a esfera analítica, não a malha fundida', async () => {
    const r = await h.play(() => {
      const QA = window.QA, G = QA.G, MP = QA.MP;
      QA.reset(30, 30);
      const e = G.Enemies.list.find(x => x.alive);
      // inimigo parado a 8 m à frente, no chão, sem IA por cima
      const P = MP.player.pos;
      e.group.position.set(P.x, MP.groundAt(P.x, P.z + 8, 999), P.z + 8);
      e.health = e.maxHp;
      const alvo = e.hitSpheres();
      const cabeca = alvo.find(s => s.part === 'head');
      const antes = e.health;
      // mira no CENTRO da esfera da cabeça: tem que contar como tiro na cabeça
      QA.aimAt(cabeca.c.x, cabeca.c.y, cabeca.c.z);
      G.mouse.clicked = true; G.mouse.shooting = true;
      QA.tick(2);
      G.mouse.clicked = false; G.mouse.shooting = false;
      return { antes, depois: e.health, acertou: e.health < antes, flinch: e.flinchT > 0 };
    });
    assert.ok(r.acertou, `tiro mirado na esfera da cabeça não tirou vida (${r.antes} -> ${r.depois})`);
    assert.ok(r.flinch, 'inimigo não reagiu ao impacto');
  });

  it('o fogo de cano só existe enquanto o tiro dura', async () => {
    const r = await h.play(() => {
      const G = window.QA.G;
      const e = G.Enemies.list.find(x => x.alive && !x.hasModel);
      const parado = e.flash.visible;
      e.flashT = 0.06;
      G.Enemies.update(1 / 240, 1);
      const atirando = e.flash.visible;
      e.flashT = 0;
      G.Enemies.update(1 / 240, 1);
      return { parado, atirando, depois: e.flash.visible };
    });
    assert.equal(r.parado, false, 'plano do flash desenhando com o inimigo parado');
    assert.equal(r.atirando, true, 'flash não aparece no disparo');
    assert.equal(r.depois, false, 'flash não some depois do disparo');
  });
});

/* ================================================================
   O CAMINHO QUE MAIS EXISTE NO JOGO REAL: os inimigos que NÃO são executivos
   recebem o GLB do Guardião (js/enemies.js:254-279), que esconde o corpo
   fundido e desenha o rig no lugar. Os describes acima bloqueiam esse GLB de
   propósito — é a única forma de ter os três corpos procedurais na mesa —, e
   com isso a maioria dos 28 inimigos ficava sem rede nenhuma.
   ================================================================ */
describe('Inimigos — caminho do GLB do Guardião', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, r;
  before(async () => {
    h = await bootGame({ port: 3249 });
    // o GLB entra por promise: espera a troca de visual acontecer
    await h.page.waitForFunction(
      'window.QA.G.Enemies.list.some(e => e.hasModel)', { timeout: 60000 });
    r = await h.play(() => {
      const G = window.QA.G, MP = window.QA.MP;
      const draws = e => {
        const cam = MP.camera;
        cam.position.set(0, 1.1, 6); cam.rotation.set(0, 0, 0); cam.updateMatrixWorld(true);
        const prev = new Map();
        MP.scene.children.forEach(c => { prev.set(c, c.visible); c.visible = false; });
        const salvo = { p: e.group.position.clone(), r: e.group.rotation.clone() };
        e.group.position.set(0, 0, 0); e.group.rotation.set(0, 0, 0);
        e.group.updateMatrixWorld(true);
        e.group.visible = true;
        MP.renderer.info.autoReset = true;
        MP.renderer.render(MP.scene, cam);
        const n = MP.renderer.info.render.calls;
        MP.scene.children.forEach(c => { c.visible = prev.get(c); });
        e.group.position.copy(salvo.p); e.group.rotation.copy(salvo.r);
        e.group.updateMatrixWorld(true);
        return n;
      };
      /* o corpo fundido é EXATAMENTE quem está preso ao esqueleto do boneco
         procedural; o resto de malha no grupo é o rig do GLB (o flash tem
         material próprio e fica de fora da fusão). */
      const perfil = e => {
        let fundidoOculto = 0, fundidoVisivel = 0, doGlb = 0, glbComSombra = 0, glbCulled = 0;
        e.group.traverse(o => {
          if (!(o.isMesh || o.isSkinnedMesh) || o === e.flash) return;
          if (o.isSkinnedMesh && o.skeleton === e.skeleton) {
            if (o.visible) fundidoVisivel++; else fundidoOculto++;
            return;
          }
          doGlb++;
          if (o.castShadow) glbComSombra++;
          if (o.frustumCulled) glbCulled++;
        });
        return { fundidoOculto, fundidoVisivel, doGlb, glbComSombra, glbCulled,
          flashMuted: !!e.flashMuted, temEsqueletoFundido: !!e.skeleton,
          hitSpheres: e.hitSpheres().length, drawCalls: draws(e) };
      };
      const comModelo = G.Enemies.list.filter(e => e.hasModel);
      const semModelo = G.Enemies.list.filter(e => !e.hasModel);
      return {
        total: G.Enemies.list.length, comModelo: comModelo.length, semModelo: semModelo.length,
        executivosSemModelo: semModelo.filter(e => e.suit).length,
        perfis: comModelo.map(perfil),
      };
    });
  });
  after(async () => { if (h) await h.close(); });

  it('o GLB troca o visual dos não-executivos e cobre a maioria da lista', () => {
    assert.equal(r.total, 28, 'a lista de inimigos mudou de tamanho');
    assert.ok(r.comModelo >= 15, `só ${r.comModelo} de ${r.total} inimigos receberam o GLB`);
    assert.equal(r.semModelo, r.executivosSemModelo,
      'inimigo sem GLB que não é executivo: a troca de visual falhou pela metade');
  });

  it('cada inimigo com GLB custa 2 draw calls e o corpo fundido some inteiro', () => {
    for (const p of r.perfis) {
      assert.ok(p.drawCalls <= 2,
        `inimigo com GLB gastou ${p.drawCalls} draw calls (${p.doGlb} malhas no rig)`);
      assert.equal(p.fundidoVisivel, 0,
        'malha do corpo fundido continua desenhando por baixo do GLB (draw call dobrada)');
      assert.ok(p.fundidoOculto >= 7,
        `só ${p.fundidoOculto} malhas fundidas escondidas — a fusão não rodou nesse corpo`);
      assert.ok(p.temEsqueletoFundido,
        'esqueleto do corpo fundido sumiu: a hitbox e as âncoras de mira dependem dos ossos');
    }
  });

  it('o rig do GLB não entra no caminho de sombra nem some por bounding box', () => {
    for (const p of r.perfis) {
      assert.equal(p.glbComSombra, 0,
        'malha do GLB com castShadow: o CSM tem 4 cascatas, isso quadruplica a draw call');
      assert.equal(p.glbCulled, 0,
        'malha do GLB com frustumCulled: os ossos animados saem do bounding original e ela some');
    }
  });

  it('a hitbox analítica e o silêncio do fogo de cano continuam iguais', () => {
    for (const p of r.perfis) {
      assert.equal(p.hitSpheres, 4, 'a hitbox analítica mudou no caminho do GLB');
      assert.equal(p.flashMuted, true,
        'flashMuted caiu: o traverse do GLB apaga o plano do flash e nada o reacende');
    }
  });
});

describe('Criaturas da noite — zumbi e fantasma fundidos', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootGame({ port: 3248 }); });
  after(async () => { if (h) await h.close(); });

  it('zumbi vira 4 malhas e fantasma 2, com as mesmas cores', async () => {
    const r = await h.play(() => {
      const G = window.QA.G;
      const conta = c => {
        const cores = new Set(); let n = 0;
        c.group.traverse(o => {
          if (!o.isMesh) return;
          n++; cores.add(o.material.color.getHexString());
        });
        return { n, cores: [...cores].sort() };
      };
      const z = G.Night.list.find(c => !c.ghost), f = G.Night.list.find(c => c.ghost);
      return { zumbi: conta(z), fantasma: conta(f), temVeu: !!f.veu };
    });
    // zumbi: zRag(cast)+zRag+zMat+olhos ; fantasma: véu + olhos
    assert.equal(r.zumbi.n, 4, 'zumbi não fundiu como esperado');
    assert.deepEqual(r.zumbi.cores, ['100000', '3c3a30', '5a7a3e']);
    assert.equal(r.fantasma.n, 2, 'fantasma não fundiu como esperado');
    assert.deepEqual(r.fantasma.cores, ['100000', 'bfe8ff']);
    assert.ok(r.temVeu, 'fantasma sem referência do véu: a pulsação de opacidade quebra');
  });

  it('o véu do fantasma continua pulsando a opacidade', async () => {
    const r = await h.play(() => {
      const G = window.QA.G;
      const f = G.Night.list.find(c => c.ghost);
      f.alive = true; f.hp = 50; f.group.visible = true;
      // Env.nightK é getter: força noite fechada só durante a amostragem
      const orig = Object.getOwnPropertyDescriptor(G.Env, 'nightK');
      Object.defineProperty(G.Env, 'nightK', { get: () => 1, configurable: true });
      const amostras = [];
      try {
        for (let i = 0; i < 40; i++) { G.Night.update(1 / 60, i / 6); amostras.push(f.veu.material.opacity); }
      } finally { Object.defineProperty(G.Env, 'nightK', orig); }
      f.alive = false; f.group.visible = false;
      return { min: Math.min(...amostras), max: Math.max(...amostras) };
    });
    assert.ok(r.max - r.min > 0.05, `opacidade do véu parada (${r.min}..${r.max})`);
  });
});

/* ================================================================
   fuseBody — BANDEIRAS DE RENDER DA PEÇA ORIGINAL (Node puro, sem Chrome).

   A fusão agrupa peças num balde e desenha o balde. Tudo que estava na peça e
   não entra na chave do balde é DESCARTADO em silêncio: sem erro, sem warning
   e sem teste falhando. `castShadow` já estava na chave (é o que preserva a
   silhueta que projeta). `receiveShadow`, `visible`, `renderOrder`, `layers` e
   `frustumCulled` não estavam — hoje nenhuma peça de js/enemies.js ou
   js/night.js usa nenhum deles, então não havia bug vivo; no dia em que
   alguém puser renderOrder numa viseira translúcida, o flag some.

   Estes testes são o alarme: peças que divergem numa bandeira NÃO podem cair
   no mesmo balde, e a malha fundida tem que sair com a bandeira da peça.
   ================================================================ */
describe('fuseBody — bandeiras de render da peça original', () => {
  let THREE, fuseBody;
  before(async () => {
    THREE = await import('three');
    ({ fuseBody } = await import('../js/meshutils.js'));
  });

  /* funde N peças do MESMO material, cada uma passada por um ajuste, e
     devolve as malhas que sobraram na raiz. */
  const fundir = ajustes => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0x336699 });
    ajustes.forEach((ajuste, i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), material);
      m.position.x = i * 1.5;
      ajuste(m);
      root.add(m);
    });
    fuseBody(root);
    return root.children.filter(o => o.isMesh);
  };
  const nada = () => {};

  it('peças idênticas continuam virando UMA malha (a fusão não pode desandar)', () => {
    const malhas = fundir([nada, nada, nada]);
    assert.equal(malhas.length, 1, 'a chave ficou fina demais e a fusão parou de fundir');
  });

  for (const [nome, aplicar, ler] of [
    ['receiveShadow', m => { m.receiveShadow = true; }, m => m.receiveShadow],
    ['renderOrder', m => { m.renderOrder = 3; }, m => m.renderOrder],
    ['visible', m => { m.visible = false; }, m => m.visible],
    ['frustumCulled', m => { m.frustumCulled = false; }, m => m.frustumCulled],
    ['layers', m => m.layers.set(2), m => m.layers.mask],
  ]) {
    it(`peça com ${nome} divergente não é fundida junto e mantém o valor`, () => {
      const malhas = fundir([nada, aplicar]);
      assert.equal(malhas.length, 2,
        `peça com ${nome} próprio entrou no balde alheio — a bandeira sumiu sem aviso`);
      const padrao = fundir([nada])[0];
      const valores = malhas.map(ler);
      assert.ok(valores.includes(ler(padrao)),
        `nenhuma malha fundida ficou com o ${nome} padrão`);
      assert.ok(valores.some(v => v !== ler(padrao)),
        `o ${nome} da peça divergente não chegou na malha fundida`);
    });
  }

  it('castShadow continua separando os baldes (silhueta de sombra peça a peça)', () => {
    const malhas = fundir([nada, m => { m.castShadow = true; }]);
    assert.equal(malhas.length, 2);
    assert.deepEqual(malhas.map(m => m.castShadow).sort(), [false, true]);
  });
});
