/* helpers de malha/material compartilhados entre entidades */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Prepara uma malha de GLB riggado para render barato e coerente:
//  - sem sombra (CSM multiplicaria as draw calls por 4);
//  - sem frustum cull (ossos animados deslocam a malha do bounding original,
//    some da tela na câmera/no chão);
//  - limita o brilho de materiais standard SEM textura, pra não estourar branco.
export function prepRiggedMesh(root) {
  root.traverse(o => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
      o.frustumCulled = false;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m && m.isMeshStandardMaterial && !m.map) {
          const l = m.color.r * 0.299 + m.color.g * 0.587 + m.color.b * 0.114;
          if (l > 0.72) m.color.multiplyScalar(0.72 / l);
        }
      }
    }
  });
}

/* CONTRATO DO `Math.random` SEEDADO (ver CLAUDE.md): criar geometria, material,
   Object3D ou textura consome 4 chamadas de `Math.random` por UUID. Fundir
   malhas cria objetos NOVOS, e isso deslocaria tudo que o worldgen sorteia
   depois (ambiente, animais, esqueletos, alien...). `noSeed` troca o stream por
   um PRNG privado enquanto a fusão acontece — mesmo padrão já usado em
   js/structures.js, js/secrets.js, js/maptoys.js e js/chestmodel.js. */
let _noSeedState = 0x9E3779B9 >>> 0;
export function noSeed(fn) {
  const _R = Math.random;
  Math.random = () => (_noSeedState = (_noSeedState * 1664525 + 1013904223) >>> 0) / 4294967296;
  try { return fn(); } finally { Math.random = _R; }
}

const _toRoot = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const MERGEABLE = ['position', 'normal', 'uv'];

/* Prepara UMA cópia da geometria da peça já no espaço do corpo, com os
   atributos que a fusão aceita. RoundedBoxGeometry nasce SEM índice (ela chama
   toNonIndexed internamente) e mergeGeometries recusa misturar indexado com não
   indexado: em vez de explodir os vértices das outras (Sphere/Capsule são
   indexadas e reaproveitam vértice), cria um índice trivial pra caixa. */
function pieceGeometry(piece, boneIndex) {
  const g = piece.mesh.geometry.clone();
  for (const name of Object.keys(g.attributes))
    if (!MERGEABLE.includes(name)) g.deleteAttribute(name);
  if (g.index === null) {
    const n = g.attributes.position.count;
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  g.applyMatrix4(piece.matrix);
  g.clearGroups(); // grupos do BoxGeometry viram lixo depois da fusão
  if (boneIndex !== null) {
    const n = g.attributes.position.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = boneIndex; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  }
  return g;
}

/* ================================================================
   FUSÃO DE CORPO PROCEDURAL

   Por que existe: os bonecos procedurais (inimigos, zumbis) eram dezenas de
   `new THREE.Mesh` soltos — 32 a 38 por inimigo, e cada um é UMA draw call.
   Medido no viewport de celular, os 8 executivos da Torre Nexus sozinhos
   custavam 256 draw calls num frame de 560.

   Como funde sem mudar o que o jogador vê:
     - agrupa por (material, castShadow). Material igual => cor, rugosidade,
       metalicidade e registro no CSM ficam EXATAMENTE os mesmos; separar por
       castShadow preserva a silhueta da sombra peça por peça.
     - membros que giram (braços, pernas, cabeça) viram OSSOS RÍGIDOS: cada
       vértice pesa 1 no osso do membro a que pertencia, então a pose é
       idêntica à da hierarquia de Group que existia antes. Sem os ossos, a
       fusão só poderia juntar peças do MESMO membro e pararia na metade.
     - o esqueleto é montado com o corpo na origem e em repouso: `bind()` tira
       as inversas nesse instante, e daí em diante o grupo pode andar, girar e
       encolher (a morte escala o grupo pra 0,001) que a conta fecha.

   Armadilha do three r185 já registrada no projeto: a esfera delimitadora de
   SkinnedMesh não acompanha os ossos. Aqui ela é calculada UMA vez em repouso
   e inflada por `boundsFactor` — mesma solução de js/skeletons.js:312-316. Sem
   isso o inimigo desaparece quando levanta o braço pra mirar.

   `cache`+`cacheKey`: corpos iguais (os 28 inimigos são 3 receitas: padrão,
   pesado e executivo) compartilham a MESMA geometria fundida. Cada boneco
   continua com esqueleto e esfera próprios — só o buffer de vértice é um só.
   Sem isso a fusão custaria +5,1 MB de atributo de vértice em vez de −5,8 MB.
   ================================================================ */
export function fuseBody(root, {
  bones = null, keep = [], boundsFactor = 1.4, cache = null, cacheKey = null } = {}) {
  return noSeed(() => {
    root.updateMatrixWorld(true);
    _toRoot.copy(root.matrixWorld).invert();
    const keepSet = new Set(keep);
    const boneIdx = new Map();
    if (bones) bones.forEach((b, i) => boneIdx.set(b, i));
    const pronto = cache && cacheKey !== null ? cache.get(cacheKey) : null;

    /* uma malha por (material, castShadow). O membro entra como ATRIBUTO de
       osso, não como malha separada — é isso que deixa braço, perna e cabeça
       caírem na mesma fusão sem perder a articulação. */
    const buckets = new Map();
    const originais = [];
    root.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh || keepSet.has(o)) return;
      if (Array.isArray(o.material)) return; // multimaterial já é 1 draw por grupo
      originais.push(o);
      if (pronto) return; // a receita já existe: as peças só precisam sumir
      let bi = bones ? 0 : null;
      if (bones) {
        for (let n = o.parent; n && n !== root; n = n.parent)
          if (boneIdx.has(n)) { bi = boneIdx.get(n); break; }
      }
      const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}`;
      const entry = buckets.get(key) || { material: o.material, cast: !!o.castShadow, geos: [] };
      entry.geos.push(pieceGeometry(
        { mesh: o, matrix: new THREE.Matrix4().multiplyMatrices(_toRoot, o.matrixWorld) }, bi));
      buckets.set(key, entry);
    });
    for (const o of originais) { o.removeFromParent(); o.geometry.dispose(); }

    let receita = pronto;
    if (!receita) {
      const bounds = new THREE.Box3();
      receita = { partes: [], esfera: new THREE.Sphere() };
      for (const g of buckets.values()) {
        const merged = mergeGeometries(g.geos);
        for (const x of g.geos) x.dispose();
        if (!merged) { // atributos incompatíveis: some a peça em vez de desenhar torto
          console.warn('[fuseBody] fusão recusada para', g.material.type, g.material.color.getHexString());
          continue;
        }
        merged.computeBoundingBox();
        bounds.union(merged.boundingBox);
        receita.partes.push({ geometry: merged, material: g.material, cast: g.cast });
      }
      bounds.getBoundingSphere(receita.esfera);
      receita.esfera.radius *= boundsFactor; // membros giram além do repouso
      if (cache && cacheKey !== null) cache.set(cacheKey, receita);
    }

    const meshes = [];
    for (const p of receita.partes) {
      const mesh = bones ? new THREE.SkinnedMesh(p.geometry, p.material)
        : new THREE.Mesh(p.geometry, p.material);
      mesh.castShadow = p.cast;
      root.add(mesh);
      meshes.push(mesh);
    }

    let skeleton = null;
    if (bones && meshes.length) {
      skeleton = new THREE.Skeleton(bones);
      for (const m of meshes) m.bind(skeleton);
      skeleton.computeBoneTexture(); // aqui dentro do noSeed, não no 1º frame
      for (const m of meshes) m.boundingSphere = receita.esfera.clone();
    }
    return { meshes, skeleton };
  });
}
