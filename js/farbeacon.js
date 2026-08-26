/* ================================================================
   FAROL — o feixe de findability que ATRAVESSA o plano far.

   Os feixes verticais das atrações (js/maptoys.js) e do ninho do
   atirador (js/secrets.js) existem PARA serem vistos do outro lado do
   mapa: por isso nascem `fog: false`, com o comentário do próprio código
   dizendo que "a névoa lavava a cor e o feixe sumia de longe".

   Eram exatamente eles que impediam encurtar `camera.far`. A câmera
   desenha até `CFG.VIEW_DIST + 600` (1020 m) enquanto a névoa LINEAR já
   satura em `CFG.VIEW_DIST` (420 m): tudo entre 420 e 1020 m é desenhado
   100 % da cor da névoa, pixel que não muda nada na tela. Medido em
   sessão immersive-vr com o mundo congelado, encurtar o far para 420 m
   vale −126 draw calls estéreo na pose de castelo (−54 na cidade) — e o
   preço era perder a orientação à distância.

   Este módulo tira esse preço da mesa, com duas correções e nenhuma
   passada de render nova:

   1. UMA MALHA POR MÓDULO, com a cor de cada feixe no VÉRTICE. Seis
      malhas soltas eram seis draw calls; agora são duas, e o culling
      deixa de importar (a malha mesclada cobre o mapa).

   2. PASSE ÚNICO. `transparent` + `DoubleSide` faz o three desenhar a
      malha DUAS vezes (traseiras, depois frentes). Em mistura ADITIVA
      com `depthWrite: false` a soma é comutativa: o segundo passe não
      muda um pixel e só gasta draw call. Medido: 6 draw calls estéreo
      por frame, jogadas fora. (Mesmo achado de js/amb.js, borboletas.)

   3. O Z DE CLIP PRESO NO FAR. Além do plano far a GPU RECORTA a
      geometria — nenhuma flag de material salva. O truque é o mesmo que
      o addon `Sky` do three usa há anos (`gl_Position.z = gl_Position.w`):
      prender o z em vez de deixar recortar. Aqui é um `min`, então
      enquanto o feixe estiver DENTRO do far nada muda — o mecanismo é
      inerte com o far de hoje e só acorda se alguém encurtá-lo.

   O que muda de aparência, e é preciso dizer: com far curto o feixe
   além de 420 m deixa de ser escondido por relevo que também está além
   de 420 m — relevo que, àquela distância, é 100 % cor de névoa. Dentro
   dos 420 m a oclusão continua idêntica.

   RNG: criar objetos THREE consome o `Math.random` seedado (4 sorteios
   por UUID). Chame SEMPRE de dentro do `noSeed` do módulo dono, como já
   fazem js/maptoys.js e js/secrets.js.
   ================================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* `min` e não atribuição direta: feixe dentro do far tem que continuar
   com a profundidade dele (senão passa a flutuar na frente do mundo).
   `w > 0` guarda o vértice atrás do olho, onde w fica negativo. */
const CLAMP_FAR = `
	if ( gl_Position.w > 0.0 ) gl_Position.z = min( gl_Position.z, gl_Position.w * 0.999999 );`;

const ALVO_CLAMP = '#include <project_vertex>';

const _c = new THREE.Color();

/* Um feixe: cilindro aberto, vertical, com a base no chão do marco.
   Mesma geometria que as duas casas escreviam à mão — o que muda é que
   ela nasce já POSICIONADA, para poder ser mesclada com as outras. */
function geometriaDeFeixe({ x, y, z, cor, altura, raioTopo, raioBase }) {
  const g = new THREE.CylinderGeometry(raioTopo, raioBase, altura, 8, 1, true);
  g.translate(x, y + altura / 2, z);
  _c.set(cor);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/* Material do farol. `customProgramCacheKey` entra explícito: o padrão do
   three é `onBeforeCompile.toString()` (three.core.js:21018), que já separa
   este programa do de um MeshBasicMaterial comum — mas ele re-serializa a
   função a cada `getParameters`. Uma constante faz o mesmo de graça, e diz
   no código que a chave é parte do contrato, não acidente. */
function materialDeFarol(opacidade) {
  const m = new THREE.MeshBasicMaterial({
    color: 0xffffff, vertexColors: true,
    transparent: true, opacity: opacidade,
    blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, forceSinglePass: true,
    fog: false, // `toneMapped` fica no padrão: os feixes antigos também usavam
  });
  m.userData.farbeacon = true;
  m.onBeforeCompile = (shader) => {
    const antes = shader.vertexShader;
    shader.vertexShader = antes.replace(ALVO_CLAMP, ALVO_CLAMP + CLAMP_FAR);
    if (shader.vertexShader === antes) {
      // o chunk mudou de nome numa atualização do three: o feixe volta a
      // ser recortado pelo far e ninguém veria, então avise alto.
      console.warn('farbeacon: clamp do far NÃO entrou — feixe volta a sumir de longe');
    }
  };
  m.customProgramCacheKey = () => 'farbeacon';
  return m;
}

/**
 * Uma malha só com todos os feixes de um módulo.
 * @param {Array<{x,y,z,cor,altura,raioTopo,raioBase}>} feixes — base no chão (y do terreno).
 * @param {{opacidade?:number, nome?:string}} opts
 * @returns {THREE.Mesh} pronta para `scene.add` / `grupo.add`.
 */
export function criarFarol(feixes, { opacidade = 0.3, nome = 'farol' } = {}) {
  const partes = feixes.map(geometriaDeFeixe);
  let geo;
  if (partes.length === 1) {
    geo = partes[0];
  } else {
    geo = mergeGeometries(partes);
    for (const p of partes) p.dispose();
  }
  const mesh = new THREE.Mesh(geo, materialDeFarol(opacidade));
  mesh.name = nome;
  /* Lista vazia (um marco que não nasceu, um segredo sem lugar): a malha
     existe para o chamador não precisar de `if`, mas NÃO desenha — geometria
     sem atributo `position` derruba o render, e desenhar nada é o certo. */
  if (!partes.length) mesh.visible = false;
  /* A malha mesclada cobre o mapa inteiro: o culling por objeto nunca a
     rejeitaria mesmo ligado, e com far curto ele MATARIA o feixe
     distante — que é justamente o que este módulo existe para salvar. */
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
