/* Personagens 3D rigados (inimigos/boss): carregamento com cache, clone de
   esqueleto por instância (SkeletonUtils) e normalização pé-no-chão.
   Cada build() devolve { root, mixer, actions } — quem chama pendura o root
   no grupo do personagem e dirige o mixer; se a rede falhar, o chamador
   simplesmente continua com o corpo procedural antigo. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { prepRiggedMesh, noSeed } from './meshutils.js';

export function createCharModels() {
  const loader = new GLTFLoader();
  const cache = new Map();
  const norm = s => String(s).replace(/[.\s]/g, '');

  function cached(url) {
    if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
    return cache.get(url);
  }

  /* caixa CIENTE DA POSE: SkinnedMesh.computeBoundingBox usa o esqueleto atual —
     a bbox ingênua mede os vértices sem skinning (e com quantização vem errada:
     o Visitante nascia 2m enterrado) */
  function poseBox(obj) {
    obj.updateWorldMatrix(true, true);
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    obj.traverse(o => {
      if (o.isSkinnedMesh) {
        o.computeBoundingBox();
        tmp.copy(o.boundingBox).applyMatrix4(o.matrixWorld);
        box.union(tmp);
      } else if (o.isMesh) {
        box.expandByObject(o);
      }
    });
    return box;
  }

  /* ================================================================
     SUBMALHAS DO MESMO MATERIAL VIRAM UMA.

     O GLB do Guardião chega em duas `SkinnedMesh` — a arma (142 vértices) e o
     corpo (943) — e as duas usam o MESMO material, o MESMO skin e o MESMO
     bindMatrix (o GLTFLoader liga todo skinned mesh com a identidade:
     `mesh.bind( skeleton, _identityMatrix )`). Duas malhas com o mesmo
     material continuam sendo DUAS draw calls: o three não junta nada sozinho.
     Com 20 dos 28 inimigos usando esse rig, é 1 draw call por inimigo na tela
     que se ganha sem tocar num pixel.

     Funde só o que é seguro, e some sozinho quando não é:
       - mesmo material (o mesmo OBJETO, não "parecido");
       - mesmo esqueleto — skin diferente tem outra tabela de juntas, e os
         índices de JOINTS_0 de um não valem no outro;
       - mesmo pai e mesmo modo de bind, para o `matrixWorld` da malha fundida
         ser o das originais;
       - mesmas bandeiras de render: quem diverge fica de fora em vez de
         perder a bandeira em silêncio (mesma regra de fuseBody);
       - `mergeGeometries` recusando (atributos incompatíveis), mantém as
         malhas originais.

     O Visitante (`alien.optimized.glb`) tem DOIS materiais e DOIS skins: nada
     funde nele, e é isso mesmo — a lista de candidatos sai vazia.

     `noSeed`: geometria e Object3D novos consomem 4 sorteios do `Math.random`
     seedado por UUID, e a ordem de consumo é contrato do worldgen (CLAUDE.md).
     ================================================================ */
  function fundirSubmalhas(root) {
    const grupos = new Map();
    root.traverse(o => {
      if (!o.isSkinnedMesh || !o.skeleton || !o.material || Array.isArray(o.material)) return;
      if (!o.parent) return;
      const chave = [o.material.uuid, o.skeleton.uuid, o.parent.uuid, o.bindMode,
        +!!o.castShadow, +!!o.receiveShadow, o.visible !== false ? 1 : 0,
        o.renderOrder || 0, o.frustumCulled !== false ? 1 : 0, o.layers.mask].join('|');
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(o);
    });
    return noSeed(() => {
      let fundidas = 0;
      for (const grupo of grupos.values()) {
        if (grupo.length < 2) continue;
        const merged = mergeGeometries(grupo.map(m => m.geometry));
        if (!merged) { // atributos incompatíveis: melhor 2 draw calls que malha torta
          console.warn('[charmodels] fusão de submalha recusada em', root.name);
          continue;
        }
        const base = grupo[0];
        const nova = new THREE.SkinnedMesh(merged, base.material);
        nova.name = grupo.map(m => m.name).filter(Boolean).join('+') || base.name;
        nova.castShadow = base.castShadow;
        nova.receiveShadow = base.receiveShadow;
        nova.visible = base.visible;
        nova.renderOrder = base.renderOrder;
        nova.frustumCulled = base.frustumCulled;
        nova.layers.mask = base.layers.mask;
        nova.bindMode = base.bindMode;
        base.parent.add(nova);
        nova.bind(base.skeleton, base.bindMatrix);
        for (const m of grupo) { m.removeFromParent(); m.geometry.dispose(); }
        fundidas++;
      }
      /* ARMADILHA QUE CUSTOU UMA MEDIÇÃO INTEIRA: `SkinnedMesh.bind()` grava
         `bindMatrixInverse` como o INVERSO do bindMatrix que recebeu — aqui a
         identidade. Mas em `AttachedBindMode` (o padrão) o valor certo é
         `matrixWorld⁻¹`, e quem o escreve é `updateMatrixWorld`, que o
         GLTFLoader chama no fim do `parse()` (`scene.updateMatrixWorld()`).
         `poseBox` usa `updateWorldMatrix`, que é OUTRO método e o SkinnedMesh
         não sobrescreve — então sem esta linha a malha fundida media a altura
         com a transformação interna do modelo aplicada DUAS vezes, e o
         Guardião nascia 2,36x maior. Sem erro, sem warning: só um mutante
         gigante. Idempotente para quem não fundiu nada. */
      root.updateMatrixWorld(true);
      return fundidas;
    });
  }

  /* ================================================================
     ESFERA QUE COBRE A ANIMAÇÃO — o que devolve o frustum culling ao rig.

     `prepRiggedMesh` desliga `frustumCulled` porque a esfera que o three
     calcula sozinho é a da POSE DE BIND: os ossos animados levam vértices
     para fora dela e a malha SOME da tela no meio da caminhada. Medido no
     Guardião: 36 553 vértices saem da esfera de bind ao longo das animações,
     e o pior deles fica 6,6 % além do raio.

     O preço de desligar o culling, medido por subtração (seed 424242, pose de
     spawn, GLB carregado): os 20 inimigos com o GLB desenham SEMPRE — a 403 m,
     de costas, do outro lado do mapa — 40 das 221 draw calls do frame, e
     nenhuma delas na tela. Num Quest 3, onde o orçamento é 180 por olho, isso
     é 22 % do quadro gasto com quem não aparece.

     A saída é a mesma que js/skeletons.js já usa e que fuseBody usa no corpo
     procedural: calcular UMA vez uma esfera que cobre a animação inteira e
     deixar o culling ligado. Aqui a varredura é exaustiva por clipe — amostra
     cada clipe do arquivo e une as esferas por malha — em vez de um fator
     chutado sobre o repouso; a margem cobre só o que fica ENTRE as amostras e
     a mistura de clipes que o jogo monta por cima (js/enemies.js anima Walk
     com peso variável e Shoot/Punch em cima).

     Contrato do `Math.random` seedado: nada aqui cria Object3D, geometria,
     material ou textura — `AnimationMixer`, `AnimationAction`, `Sphere` e
     `Vector3` não têm UUID. Zero sorteio consumido.
     ================================================================ */
  const POSE_AMOSTRAS = 32;   // por clipe
  /* 1,12 sobre a união medida. A união já sobra 4-6 % em cima do pior vértice
     (esfera de esferas não é esfera de pontos); a margem cobre as poses ENTRE
     as amostras e o blend. Medido no Guardião: folga final 1,19× sobre o pior
     vértice de uma varredura independente, com as misturas do jogo. Cada
     centímetro a mais é culling perdido — não inflar "por segurança". */
  const POSE_MARGEM = 1.12;

  function boundsDaAnimacao(proto, clips) {
    const malhas = [];
    proto.traverse(o => { if (o.isSkinnedMesh) malhas.push(o); });
    if (!malhas.length) return;

    /* O protótipo é o molde que build() clona, e a pose dele decide o offset
       de pé-no-chão de cada instância. Sair daqui com outra pose muda o
       visual de todo mundo — instantâneo e devolução exatos. */
    const salvo = [];
    proto.traverse(o => salvo.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));

    const uniao = malhas.map(() => null);
    const acumular = () => {
      proto.updateMatrixWorld(true);
      malhas.forEach((m, i) => {
        m.boundingSphere = null;
        m.computeBoundingSphere();
        if (!m.boundingSphere) return;
        if (uniao[i]) uniao[i].union(m.boundingSphere);
        else uniao[i] = m.boundingSphere.clone();
      });
    };

    acumular();                      // pose de repouso do arquivo
    if (clips && clips.length) {
      const mixer = new THREE.AnimationMixer(proto);
      for (const clip of clips) {
        const acao = mixer.clipAction(clip);
        acao.reset();
        acao.play();
        const passo = Math.max(clip.duration, 1e-3) / POSE_AMOSTRAS;
        for (let i = 0; i < POSE_AMOSTRAS; i++) { mixer.update(passo); acumular(); }
        acao.stop();
      }
      mixer.stopAllAction();
      mixer.uncacheRoot(proto);
    }

    for (const [o, p, q, e] of salvo) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(e); }
    proto.updateMatrixWorld(true);
    /* A esfera fica no PROTÓTIPO: `SkinnedMesh.copy` clona `boundingSphere`,
       então cada instância de build() nasce com a sua sem trabalho extra. */
    malhas.forEach((m, i) => {
      if (!uniao[i]) return;
      uniao[i].radius *= POSE_MARGEM;
      m.boundingSphere = uniao[i];
    });
  }

  /* prepara um "molde": mede uma vez, cada build() clona esqueleto+malha */
  async function character(url, { height = 1.9, yaw = 0 } = {}) {
    const gltf = await cached(url);
    const proto = gltf.scene;
    /* Nesta ordem: fundir primeiro (a nuvem de vértices não muda, então a
       altura medida a seguir é a mesma), medir a altura, e só então varrer a
       animação — que devolve a pose exata do arquivo. */
    fundirSubmalhas(proto);
    const box = poseBox(proto);
    const rawH = Math.max(box.max.y - box.min.y, 1e-3);
    const s = height / rawH;
    boundsDaAnimacao(proto, gltf.animations);

    function build() {
      const inst = cloneSkeleton(proto);
      prepRiggedMesh(inst);
      /* culling de volta: `prepRiggedMesh` desliga por padrão (a esfera de
         bind não cobre a pose animada), e com a esfera da varredura acima ela
         cobre. Só as malhas que ganharam esfera — o resto fica como estava. */
      inst.traverse(o => { if (o.isSkinnedMesh && o.boundingSphere) o.frustumCulled = true; });
      const orient = new THREE.Group();
      orient.rotation.y = yaw;
      orient.scale.setScalar(s);
      orient.add(inst);
      const b = poseBox(orient); // pés no chão DE VERDADE (pose atual do rig)
      orient.position.set(-(b.min.x + b.max.x) * 0.5, -b.min.y, -(b.min.z + b.max.z) * 0.5);
      const root = new THREE.Group();
      root.add(orient);

      const mixer = new THREE.AnimationMixer(inst);
      const actions = {};
      for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);

      const findNode = frag => {
        const f = norm(frag);
        let hit = null;
        inst.traverse(o => { if (!hit && norm(o.name).includes(f)) hit = o; });
        return hit;
      };
      return { root, mixer, actions, findNode };
    }
    return { build };
  }

  return { character };
}
