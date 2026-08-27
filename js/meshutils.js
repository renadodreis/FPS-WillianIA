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
const _identidade = new THREE.Matrix4();
const MERGEABLE = ['position', 'normal', 'uv'];

/* Bandeiras de render que moram na PEÇA, não no material. Tudo que não entra
   na chave do balde é descartado sem erro, sem warning e sem teste falhando —
   então entra tudo, e a malha fundida sai com o valor do balde. Peças que
   divergem em qualquer uma delas simplesmente não se fundem (uma draw call a
   mais é barato perto de perder uma sombra ou um renderOrder em silêncio). */
function renderFlags(o) {
  return {
    castShadow: !!o.castShadow, receiveShadow: !!o.receiveShadow,
    visible: o.visible !== false, renderOrder: o.renderOrder || 0,
    frustumCulled: o.frustumCulled !== false, layers: o.layers.mask,
  };
}
const flagKey = f => `${+f.castShadow}|${+f.receiveShadow}|${+f.visible}|` +
  `${f.renderOrder}|${+f.frustumCulled}|${f.layers}`;
function applyFlags(mesh, f) {
  mesh.castShadow = f.castShadow;
  mesh.receiveShadow = f.receiveShadow;
  mesh.visible = f.visible;
  mesh.renderOrder = f.renderOrder;
  mesh.frustumCulled = f.frustumCulled;
  mesh.layers.mask = f.layers;
}

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
     - agrupa por (material + bandeiras de render da peça). Material igual =>
       cor, rugosidade, metalicidade e registro no CSM ficam EXATAMENTE os
       mesmos; separar por castShadow preserva a silhueta da sombra peça por
       peça, e as outras bandeiras entram na chave pra nunca sumirem calado
       (ver renderFlags acima).
     - membros que giram (braços, pernas, cabeça) viram OSSOS RÍGIDOS: cada
       vértice pesa 1 no osso do membro a que pertencia, então a pose é
       idêntica à da hierarquia de Group que existia antes. Sem os ossos, a
       fusão só poderia juntar peças do MESMO membro e pararia na metade.
     - o esqueleto é montado com o corpo na origem e em repouso: `bind()` tira
       as inversas nesse instante, e daí em diante o grupo pode andar, girar e
       encolher (a morte escala o grupo pra 0,001) que a conta fecha.

   Armadilha do three r185 já registrada no projeto: a esfera delimitadora de
   SkinnedMesh não acompanha os ossos. Aqui ela é calculada UMA vez em repouso
   (centro da caixa + maior distância REAL a um vértice) e inflada por
   `boundsFactor` — mesma solução de js/skeletons.js:312-316. Sem isso o
   inimigo desaparece quando levanta o braço pra mirar; com folga demais ele
   volta a desenhar fora da tela.

   `cache`+`cacheKey`: corpos iguais (os 28 inimigos são 3 receitas: padrão,
   pesado e executivo) compartilham a MESMA geometria fundida. Cada boneco
   continua com esqueleto e esfera próprios — só o buffer de vértice é um só.
   Sem isso a fusão custaria +5,1 MB de atributo de vértice em vez de −5,8 MB.
   ================================================================ */
export function fuseBody(root, {
  bones = null, keep = [], boundsFactor = 1.5, cache = null, cacheKey = null } = {}) {
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
      const flags = renderFlags(o);
      const key = `${o.material.uuid}|${flagKey(flags)}`;
      const entry = buckets.get(key) || { material: o.material, flags, geos: [] };
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
        receita.partes.push({ geometry: merged, material: g.material, flags: g.flags });
      }
      /* Esfera do corpo em repouso. O centro é o da caixa, mas o raio é a
         MAIOR distância real a um vértice — Box3.getBoundingSphere devolve a
         meia-diagonal, que sobra 18-25 % de graça (medido nos três corpos).
         Cada centímetro aqui é culling perdido: um inimigo parado logo fora da
         borda da tela volta a custar as 7-9 draw calls, o skeleton.update() e
         o reupload da bone texture, vezes as 4 cascatas do CSM.
         `boundsFactor` cobre o quanto os membros giram ALÉM do repouso —
         medido em test/enemy-drawcalls: 1,33 no pior caso (o braço de mira do
         executivo), daí 1,5 com folga honesta. */
      bounds.getCenter(receita.esfera.center);
      const c = receita.esfera.center;
      let maxSq = 0;
      for (const p of receita.partes) {
        const pos = p.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const dx = pos.getX(i) - c.x, dy = pos.getY(i) - c.y, dz = pos.getZ(i) - c.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > maxSq) maxSq = d2;
        }
      }
      receita.esfera.radius = Math.sqrt(maxSq) * boundsFactor;
      if (cache && cacheKey !== null) cache.set(cacheKey, receita);
    }

    const meshes = [];
    for (const p of receita.partes) {
      const mesh = bones ? new THREE.SkinnedMesh(p.geometry, p.material)
        : new THREE.Mesh(p.geometry, p.material);
      applyFlags(mesh, p.flags);
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

/* ================================================================
   FUSÃO POR ATLAS DE TEXTURA

   O caso que ela resolve, e por que nenhuma outra ferramenta serve:
   N malhas cujos materiais são iguais em TUDO menos o `map`.
   Compartilhar material não corta nada — o three não faz batching por
   material, então N malhas continuam sendo N draw calls mesmo com um
   material só (está medido em docs/vr/perf-xr.md). O único jeito de as N
   virarem UMA é fundir a GEOMETRIA, e para isso o mapa precisa ser um só.
   O atlas põe as N texturas em células de uma textura e reescreve o `uv`
   de cada peça para a célula dela.

   Três armadilhas, e como cada uma é fechada aqui:

   1. **Escorrimento entre células no mip.** Deixar a GPU gerar a cadeia de
      mip mistura texel de uma textura com o da vizinha nos níveis baixos, e
      isso aparece como franja de cor na silhueta. Aqui a cadeia é montada à
      mão, CÉLULA A CÉLULA: cada nível reduz cada célula pela metade dentro
      dela mesma. Só o último nível (o atlas inteiro em 1×1) mistura, e ali o
      objeto tem menos de um pixel.

   2. **Espaço de bind diferente por submalha.** Um GLB pode trazer uma skin
      por submalha, com `inverseBindMatrices` DIFERENTES apesar da mesma
      lista de ossos (é o caso do esqueleto deste jogo). Fundir sem corrigir
      deforma o corpo. A correção existe e é uma matriz só quando
      `IBM_base⁻¹ · IBM_parte` é a MESMA em todos os ossos — o que é
      verificado osso a osso, e a fusão é recusada se não for.

   3. **`uv` fora de [0,1].** Com atlas, um `uv` que vazasse da célula
      amostraria a textura da vizinha. Recusa.

   4. **Atributo QUANTIZADO (`KHR_mesh_quantization`).** Um GLB otimizado
      guarda posição e normal como inteiro NORMALIZADO — ou seja, em [-1,1],
      com a escala real morando na matriz de bind. Escrever de volta em cima
      disso (`setXYZ` renormaliza) CORTA em ±1 tudo que a correção empurrou
      para fora, e o resultado é um punhado de vértices voando. Aconteceu
      aqui: a caixa de duas submalhas do esqueleto errava 13,6 e 6,6 unidades
      enquanto o resto batia na quinta casa. Por isso posição, normal e uv
      são desquantizados para float ANTES de qualquer escrita.

   Recusar é sempre a saída segura: N draw calls é barato perto de mudar o
   que o jogador vê em silêncio. Devolve `null` quando recusa. */

const ATLAS_ATTRS = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight', 'color'];
const ATLAS_IGNORAR = new Set(['uuid', 'id', 'name', 'version', 'userData', 'map']);

/* Assinatura de aparência do material SEM o mapa: se duas peças caem na
   mesma, o que as separa é só a textura — que é o que o atlas junta. Todo
   outro slot de textura entra por uuid, então normalMap/roughnessMap
   diferentes continuam impedindo a fusão (conservador de propósito). */
function assinaturaSemMapa(m) {
  const p = [m.type];
  for (const k of Object.keys(m).sort()) {
    if (ATLAS_IGNORAR.has(k) || k.charAt(0) === '_') continue;
    const v = m[k];
    if (typeof v === 'function') continue;
    if (v === null || v === undefined) { p.push(`${k}=nulo`); continue; }
    if (v.isTexture) { p.push(`${k}=T${v.uuid}`); continue; }
    if (v.isColor) { p.push(`${k}=C${v.getHex()}`); continue; }
    if (v.isVector2 || v.isVector3 || v.isVector4) { p.push(`${k}=V${v.toArray().join(',')}`); continue; }
    if (v.isMatrix3 || v.isMatrix4) { p.push(`${k}=M${v.elements.join(',')}`); continue; }
    if (typeof v === 'object') {
      try { p.push(`${k}=J${JSON.stringify(v)}`); } catch { return null; }
      continue;
    }
    p.push(`${k}=${v}`);
  }
  return p.join('|');
}

/* Tira a quantização (ver armadilha 4): inteiro normalizado vira float com o
   MESMO valor que o shader já lia, e a partir daí escrever no atributo é
   escrever o número, não um número cortado em ±1. */
function desquantizar(g, nomes) {
  for (const nome of nomes) {
    const a = g.attributes[nome];
    if (!a || !a.normalized) continue;
    const is = a.itemSize, arr = new Float32Array(a.count * is);
    for (let i = 0; i < a.count; i++)
      for (let k = 0; k < is; k++) arr[i * is + k] = a.getComponent(i, k);
    g.setAttribute(nome, new THREE.BufferAttribute(arr, is, false));
  }
}

function tamanhoDaImagem(t) {
  const img = t && t.image;
  if (!img) return null;
  const w = img.width || img.naturalWidth || 0;
  const h = img.height || img.naturalHeight || 0;
  return (w > 0 && h > 0) ? { w, h } : null;
}

/* sRGB <-> linear: a média de mipmap tem que acontecer em LUZ, não em byte
   codificado, senão a textura escurece a cada nível. É o que o driver faz ao
   gerar mip de uma textura sRGB, e reproduzir isso é a diferença entre a
   malha fundida ficar idêntica de longe ou ficar visivelmente mais escura. */
const _srgbParaLinear = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  _srgbParaLinear[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearParaSrgb(v) {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

/* Cadeia de mip montada à mão (ver armadilha 1). Cada nível é a MÉDIA 2×2 do
   anterior — a mesma redução que o `generateMipmap` do driver faz. Como as
   células têm lado par até o penúltimo nível, a média 2×2 nunca cruza a borda
   de uma célula: o escorrimento entre texturas vizinhas só existiria no nível
   1×1, onde o objeto tem menos de um pixel na tela.

   Filtro de canvas NÃO serve aqui, e está medido: com `drawImage` reduzindo
   pela metade (que no Chrome é um filtro de reconstrução, não uma caixa), o
   esqueleto a 25 m tinha 87 % dos pixels diferentes de HEAD, com desvio de até
   37 em 255. */
function atlasNiveis(texturas, grade, w, h) {
  const cria = (largura, altura) => {
    const c = document.createElement('canvas');
    c.width = largura; c.height = altura;
    return c;
  };
  const base = cria(w * grade, h * grade);
  {
    const ctx = base.getContext('2d', { willReadFrequently: true });
    texturas.forEach((t, i) => {
      // mesmo tamanho na origem e no destino: cópia exata, sem reamostragem
      ctx.drawImage(t.image, (i % grade) * w, Math.floor(i / grade) * h, w, h);
    });
  }
  const niveis = [base];
  const eSrgb = texturas[0].colorSpace === THREE.SRGBColorSpace;
  let anterior = base.getContext('2d', { willReadFrequently: true })
    .getImageData(0, 0, base.width, base.height);
  while (anterior.width > 1 || anterior.height > 1) {
    const nw = Math.max(1, anterior.width >> 1), nh = Math.max(1, anterior.height >> 1);
    const larguraAnt = anterior.width, dados = anterior.data;
    const saida = new Uint8ClampedArray(nw * nh * 4);
    const passoX = anterior.width > 1 ? 2 : 1, passoY = anterior.height > 1 ? 2 : 1;
    const n = passoX * passoY;
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let dy = 0; dy < passoY; dy++) {
          for (let dx = 0; dx < passoX; dx++) {
            const o = ((y * passoY + dy) * larguraAnt + (x * passoX + dx)) * 4;
            if (eSrgb) {
              r += _srgbParaLinear[dados[o]];
              g += _srgbParaLinear[dados[o + 1]];
              b += _srgbParaLinear[dados[o + 2]];
            } else { r += dados[o]; g += dados[o + 1]; b += dados[o + 2]; }
            a += dados[o + 3];
          }
        }
        const q = (y * nw + x) * 4;
        if (eSrgb) {
          saida[q] = linearParaSrgb(r / n);
          saida[q + 1] = linearParaSrgb(g / n);
          saida[q + 2] = linearParaSrgb(b / n);
        } else {
          saida[q] = Math.round(r / n); saida[q + 1] = Math.round(g / n); saida[q + 2] = Math.round(b / n);
        }
        saida[q + 3] = Math.round(a / n);
      }
    }
    const img = new ImageData(saida, nw, nh);
    const c = cria(nw, nh);
    c.getContext('2d', { willReadFrequently: true }).putImageData(img, 0, 0);
    niveis.push(c);
    anterior = img;
  }
  return niveis;
}

export function fundirPorAtlas(root, { boundsFactor = 1, maxPartes = 16 } = {}) {
  return noSeed(() => {
    const partes = [];
    root.traverse(o => {
      if ((o.isMesh || o.isSkinnedMesh) && o.material && !Array.isArray(o.material)) partes.push(o);
    });
    if (partes.length < 2 || partes.length > maxPartes) return null;

    const base = partes[0].material;
    const assinatura = assinaturaSemMapa(base);
    const tam = tamanhoDaImagem(base.map);
    if (!assinatura || !tam) return null;

    const pai = partes[0].parent;
    if (!pai) return null;                        // sem pai não há onde pendurar a fundida
    const skin = partes[0].isSkinnedMesh ? partes[0].skeleton : null;
    const flags = renderFlags(partes[0]);
    const chave = flagKey(flags);
    for (const p of partes) {
      if (p.parent !== pai) return null;
      if (!!p.isSkinnedMesh !== !!skin) return null;
      if (flagKey(renderFlags(p)) !== chave) return null;
      if (!p.matrix.equals(_identidade)) return null;   // transform local vira mentira na fusão
      if (assinaturaSemMapa(p.material) !== assinatura) return null;
      const t = tamanhoDaImagem(p.material.map);
      if (!t || t.w !== tam.w || t.h !== tam.h) return null;
      const uv = p.geometry.attributes.uv;
      if (!uv) return null;
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i), v = uv.getY(i);
        if (u < -1e-4 || u > 1 + 1e-4 || v < -1e-4 || v > 1 + 1e-4) return null;
      }
      if (skin) {
        if (!p.skeleton || p.skeleton.bones.length !== skin.bones.length) return null;
        for (let i = 0; i < skin.bones.length; i++)
          if (p.skeleton.bones[i] !== skin.bones[i]) return null;
        if (!p.bindMatrix.equals(partes[0].bindMatrix)) return null;
      }
    }

    /* Correção de espaço de bind, uma matriz por peça (ver armadilha 2). */
    let correcao = null;
    if (skin) {
      correcao = [];
      for (const p of partes) {
        if (p.skeleton === skin) { correcao.push(null); continue; }
        const C = new THREE.Matrix4().copy(skin.boneInverses[0]).invert()
          .multiply(p.skeleton.boneInverses[0]);
        const t = new THREE.Matrix4();
        for (let i = 1; i < skin.bones.length; i++) {
          t.copy(skin.boneInverses[i]).invert().multiply(p.skeleton.boneInverses[i]);
          for (let k = 0; k < 16; k++)
            if (Math.abs(t.elements[k] - C.elements[k]) > 1e-3) return null;
        }
        correcao.push(C);
      }
    }

    const grade = Math.ceil(Math.sqrt(partes.length));
    const niveis = atlasNiveis(partes.map(p => p.material.map), grade, tam.w, tam.h);
    const atlas = new THREE.CanvasTexture(niveis[0]);
    atlas.mipmaps = niveis;
    atlas.generateMipmaps = false;
    atlas.flipY = base.map.flipY;
    atlas.colorSpace = base.map.colorSpace;
    atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;
    atlas.minFilter = base.map.minFilter;
    atlas.magFilter = base.map.magFilter;
    atlas.anisotropy = base.map.anisotropy;
    atlas.channel = base.map.channel;
    atlas.name = `${base.map.name || 'atlas'}+${partes.length}`;
    atlas.needsUpdate = true;

    const passo = 1 / grade;
    const geos = partes.map((p, i) => {
      const g = p.geometry.clone();
      for (const nome of Object.keys(g.attributes))
        if (!ATLAS_ATTRS.includes(nome)) g.deleteAttribute(nome);
      g.clearGroups();
      if (g.index === null) {
        const n = g.attributes.position.count;
        const idx = new Uint32Array(n);
        for (let k = 0; k < n; k++) idx[k] = k;
        g.setIndex(new THREE.BufferAttribute(idx, 1));
      }
      desquantizar(g, ['position', 'normal', 'uv']);
      if (correcao && correcao[i]) g.applyMatrix4(correcao[i]);
      const uv = g.attributes.uv;
      const ox = (i % grade) * passo, oy = Math.floor(i / grade) * passo;
      for (let k = 0; k < uv.count; k++)
        uv.setXY(k, uv.getX(k) * passo + ox, uv.getY(k) * passo + oy);
      uv.needsUpdate = true;
      return g;
    });
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    if (!merged) { atlas.dispose(); return null; }   // recusou: nada foi tirado da cena ainda

    const material = base.clone();
    material.map = atlas;
    material.name = `${base.name || base.type}+atlas${partes.length}`;

    const malha = skin ? new THREE.SkinnedMesh(merged, material)
      : new THREE.Mesh(merged, material);
    malha.name = partes[0].name || 'fundidoPorAtlas';
    applyFlags(malha, flags);
    pai.add(malha);
    if (skin) {
      malha.bind(skin, partes[0].bindMatrix);
      malha.updateMatrixWorld(true);
    }
    for (const p of partes) { p.removeFromParent(); p.geometry.dispose(); }
    if (skin) {
      malha.computeBoundingSphere();
      if (malha.boundingSphere) malha.boundingSphere.radius *= boundsFactor;
    }
    return { malha, atlas, partes: partes.length, niveis: niveis.length, grade };
  });
}
