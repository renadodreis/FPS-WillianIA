/* vida ambiente: borboletas, pássaros, fogueira, bandeiras — extraído de game.js; deps explícitas */
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { noSeed, fuseBody } from './meshutils.js';

export function createAmb(deps) {
  const { rand, TAU, _v1, _v2, heightAt, biomeAt, addObstacle, SFX, FX, scene, csmMat, Structures, player } = deps;
  /* ---- borboletas perto do player ---- */
  const bflies = [];
  const wingGeo = new THREE.PlaneGeometry(0.16, 0.12);
  wingGeo.translate(0.08, 0, 0); // dobradiça no corpo
  const bColors = [0xffd24d, 0xff8ac2, 0x9ad9ff, 0xfff3c4, 0xcf9aff];
  /* Este laço NÃO pode encolher: cada Group, Material e Mesh come 4 sorteios do
     `Math.random` seedado pelo UUID, e js/amb.js roda no MEIO do worldgen
     (game.js:2267 — animais, esqueletos, noite e alien vêm depois). Os 22
     grupos e as 44 malhas continuam nascendo com o mesmo consumo; o que muda é
     que NENHUM deles entra na cena — viram só portadores de transformação,
     lidos pela fusão logo abaixo. Mesmo contrato de fuseBody() em
     js/meshutils.js. Os 22 materiais também ficam de pé (é por eles que a cor
     de cada asa é lida na fusão) e de propósito NÃO recebem dispose: eles nunca
     chegaram à GPU, e a rodada anterior registrou que dispose de material na
     janela do prewarm derruba o compileAsync (ver 091d5a7 item 7). */
  for (let i = 0; i < 22; i++) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: bColors[i % bColors.length], side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    const w1 = new THREE.Mesh(wingGeo, mat);
    const w2 = new THREE.Mesh(wingGeo, mat); w2.scale.x = -1;
    g.add(w1, w2);
    bflies.push({ g, w1, w2, anchor: new THREE.Vector3(), phase: rand(TAU), speed: rand(0.5, 1.2), life: 0 });
  }
  /* ---- FUSÃO DAS ASAS: 88 draw calls viram 1 -----------------------------
     Cada asa era `new THREE.Mesh` com MATERIAL PRÓPRIO (22 materiais para 5
     cores) e custava DUAS draw calls, não uma: `transparent` + `DoubleSide`
     faz o three renderizar o objeto em dois passes (BackSide e depois
     FrontSide, WebGLRenderer.renderObject), marcando `material.needsUpdate`
     nos dois. Medido no celular: 24 draw calls no solo e 76 no BR — 19 % do
     frame do BR só de borboleta.

     Vira UMA InstancedMesh de 44 instâncias com cor por instância. O argumento
     de cor é o do commit dos veículos: o three faz `diffuseColor *= vColor` sem
     conversão nenhuma e `material.color` já está no espaço de trabalho linear,
     então BRANCO × cor da instância dá exatamente a mesma cor. `instanceColor`
     usa o mesmo caminho — o prefixo de fragmento define USE_COLOR quando
     `instancingColor` está ligado (WebGLProgram.js:737).

     `forceSinglePass`: o quad é PLANO, então back e front face nunca aparecem
     ao mesmo tempo; hoje um dos dois passes já sai inteiro descartado pelo
     culling de face e só gasta a draw call. Desenhar DoubleSide num passe só
     produz o mesmo pixel por uma call.

     `frustumCulled = false`: a esfera de uma InstancedMesh não acompanha as
     instâncias (armadilha do three r185 já registrada em js/meshutils.js) e as
     44 asas cobrem um anel de 42 m em volta do player — a esfera honesta nunca
     seria culled de qualquer jeito. Melhor 1 call fixa que sumir da tela. */
  const _bw = new THREE.Matrix4();
  const wings = noSeed(() => {
    const m = new THREE.InstancedMesh(wingGeo, new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide, transparent: true, opacity: 0.95, forceSinglePass: true,
    }), bflies.length * 2);
    m.name = 'borboletas';
    m.frustumCulled = false;
    /* Ordenação: um transparente é ordenado pela posição da MALHA, e a malha
       instanciada fica na origem enquanto as asas estão a 7-42 m do player —
       a profundidade de ordenação viraria a distância do player à origem do
       mundo, ou seja, aleatória. `renderOrder = -1` tira a loteria: as asas
       desenham SEMPRE primeiro entre os transparentes e, como escrevem
       profundidade com alpha 0,95, o resto do passe se resolve pelo depth test
       (efeito aditivo atrás some, efeito na frente soma por cima). Medido: com
       a origem decidindo, um quadro aditivo à frente das asas mudava até 71 de
       255; com renderOrder = -1 o mesmo quadro dá zero. Nada mais no projeto
       usa renderOrder (tudo é 0), então -1 é o primeiro da fila e só isso. */
    m.renderOrder = -1;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bflies.forEach((b, i) => {
      m.setColorAt(i * 2, b.w1.material.color);
      m.setColorAt(i * 2 + 1, b.w2.material.color);
      b.g.remove(b.w1, b.w2);
      escreveAsas(m, i, b); // repouso na origem: mesmo estado do 1º frame de antes
    });
    m.instanceColor.needsUpdate = true;
    scene.add(m);
    return m;
  });
  /* A matriz de instância é a matrixWorld que a asa teria: o grupo era filho
     direto da cena (identidade) e a asa filha do grupo. Compõe na mão porque os
     dois saíram do grafo — assim ninguém paga updateMatrixWorld duas vezes. */
  function escreveAsas(m, i, b) {
    b.g.updateMatrix(); b.w1.updateMatrix(); b.w2.updateMatrix();
    m.setMatrixAt(i * 2, _bw.multiplyMatrices(b.g.matrix, b.w1.matrix));
    m.setMatrixAt(i * 2 + 1, _bw.multiplyMatrices(b.g.matrix, b.w2.matrix));
  }
  function reanchor(b) {
    const a = rand(TAU), r = rand(7, 42);
    b.anchor.set(player.pos.x + Math.cos(a) * r, 0, player.pos.z + Math.sin(a) * r);
    b.anchor.y = heightAt(b.anchor.x, b.anchor.z) + rand(0.5, 1.6);
    b.life = rand(7, 15);
  }
  bflies.forEach(reanchor);

  /* ---- bandos de pássaros circulando alto ----
     Quinze planos IDÊNTICOS (mesma geometria, mesmo material) espalhados por
     três bandos: quinze draw calls por olho sempre que a câmera pega o céu.
     Vira UMA InstancedMesh de 15, pelo mesmo caminho das asas acima — as
     malhas continuam nascendo (cada `new THREE.Mesh` come 4 sorteios do
     `Math.random` seedado, e a ordem de consumo é contrato), só que agora
     como PORTADORAS DE TRANSFORMAÇÃO: o update anima `b.m` como sempre e a
     matriz dele é copiada pra instância.

     `frustumCulled = false` pelo mesmo motivo das borboletas: a esfera de uma
     InstancedMesh não acompanha as instâncias, e os três bandos cobrem
     ±300 m — a esfera honesta nunca seria descartada. Uma call fixa é melhor
     que bando sumindo do céu. */
  const birds = [];
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x1d2126, side: THREE.DoubleSide });
  const birdGeo = new THREE.PlaneGeometry(0.95, 0.22);
  for (let f = 0; f < 3; f++) {
    const center = new THREE.Vector3(rand(-260, 260), 0, rand(-260, 260));
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(birdGeo, birdMat);
      m.rotation.x = -0.35;
      birds.push({ m, center, r: rand(16, 42), h: rand(26, 46), a: rand(TAU), sp: rand(0.22, 0.4) * (f % 2 ? 1 : -1), ph: rand(TAU) });
    }
  }
  const birdInst = noSeed(() => {
    const m = new THREE.InstancedMesh(birdGeo, birdMat, birds.length);
    m.name = 'passaros';
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    birds.forEach((b, i) => { b.m.updateMatrix(); m.setMatrixAt(i, b.m.matrix); });
    scene.add(m);
    return m;
  });

  /* ---- pólen dourado flutuando (1 draw call) ---- */
  const MOTES = 70;
  const moteGeo = new THREE.BufferGeometry();
  const motePos = new Float32Array(MOTES * 3);
  for (let i = 0; i < MOTES; i++) {
    motePos[i * 3] = rand(-22, 22); motePos[i * 3 + 1] = rand(0.3, 3.4); motePos[i * 3 + 2] = rand(-22, 22);
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    color: 0xffe9b0, size: 0.055, transparent: true, opacity: 0.45,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
  motes.frustumCulled = false;
  scene.add(motes);

  /* ---- acampamento do spawn: fogueira, pedras, banco e tenda ----
     Eram DOZE malhas soltas na cena (3 lenhas + 7 pedras + banco + tenda) e
     três materiais. Como o `camera.far` é VIEW_DIST + 600, elas continuam
     sendo desenhadas do outro lado do mapa, atrás de uma névoa que já satura
     em 420 m — na pose de castelo o acampamento custava 20 draw calls
     estéreo sem colocar um pixel na tela. Fundidas por material viram TRÊS
     malhas, com os vértices no mesmo ponto do mundo.

     As peças continuam nascendo na mesma ordem e com o mesmo consumo de
     `rand`/UUID (contrato do worldgen); o que mudou é que elas entram numa
     raiz temporária em vez da cena, e quem vai pra cena é o resultado da
     fusão. Mesmo padrão das asas de borboleta, logo acima. */
  const campY = heightAt(2, -2);
  {
    const pecas = [];
    const wood = csmMat(new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.8 }));
    const stone = csmMat(new THREE.MeshStandardMaterial({ color: 0x7e7a73, roughness: 0.9 }));
    const canvasM = csmMat(new THREE.MeshStandardMaterial({ color: 0xc26b3a, roughness: 0.85, side: THREE.DoubleSide }));
    for (let i = 0; i < 3; i++) { // lenha em tripé
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.95, 7), wood);
      log.position.set(2, campY + 0.28, -2);
      log.rotation.set(0.5, i * TAU / 3, 0.45);
      log.castShadow = true;
      pecas.push(log);
    }
    for (let i = 0; i < 7; i++) { // círculo de pedras
      const st = new THREE.Mesh(new THREE.SphereGeometry(rand(0.09, 0.15), 7, 5), stone);
      const a = i / 7 * TAU;
      st.position.set(2 + Math.cos(a) * 0.78, campY + 0.06, -2 + Math.sin(a) * 0.78);
      pecas.push(st);
    }
    const bench = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.7, 8), wood);
    bench.rotation.z = Math.PI / 2;
    bench.position.set(2.2, campY + 0.18, -0.2);
    bench.castShadow = true;
    pecas.push(bench);
    // tenda em A
    const s1 = new THREE.PlaneGeometry(1.5, 2.3); s1.rotateX(-Math.PI / 2); s1.rotateZ(0.96);  s1.translate(-0.44, 0.62, 0);
    const s2 = new THREE.PlaneGeometry(1.5, 2.3); s2.rotateX(-Math.PI / 2); s2.rotateZ(-0.96); s2.translate(0.44, 0.62, 0);
    const tent = new THREE.Mesh(BufferGeometryUtils.mergeGeometries([s1, s2]), canvasM);
    tent.position.set(5.6, campY, -4.2);
    tent.rotation.y = 0.5;
    tent.castShadow = true;
    pecas.push(tent);
    addObstacle(5.6, -4.2, 1.3);
    /* A raiz é IDENTIDADE e some depois: `fuseBody` leva os vértices pro
       espaço dela, então cada malha fundida pode ir direto pra cena sem
       ganhar um Group de intermediário (e o `scene.add` já a desparenta). */
    noSeed(() => {
      const raiz = new THREE.Group();
      for (const p of pecas) raiz.add(p);
      for (const m of fuseBody(raiz).meshes) scene.add(m);
    });
  }
  /* chamas da fogueira (3 quads aditivos cruzados)
     `forceSinglePass`: `transparent` + `DoubleSide` faz o three desenhar o
     objeto DUAS vezes (passe de BackSide e passe de FrontSide) — e o quad é
     plano, então um dos dois passes já sai inteiro descartado pelo culling de
     face e só gasta a draw call. Mesmo argumento, e mesma prova, das asas de
     borboleta acima: o pixel é idêntico, a call é metade. */
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa53d, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
  const fireFlames = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.85), flameMat);
    f.position.set(2, campY + 0.5, -2);
    f.rotation.y = i * Math.PI / 3;
    scene.add(f);
    fireFlames.push(f);
  }
  const fireLight = new THREE.PointLight(0xff9a40, 2.2, 15, 2);
  fireLight.position.set(2, campY + 1, -2);
  scene.add(fireLight);

  let smokeAcc = 0, chirpAcc = rand(3, 7);

  function update(dt, t) {
    // borboletas vagueiam em volta de uma âncora
    for (let i = 0; i < bflies.length; i++) {
      const b = bflies[i];
      b.life -= dt;
      if (b.life <= 0 || b.anchor.distanceToSquared(player.pos) > 85 * 85) reanchor(b);
      b.phase += dt * b.speed;
      const px = b.anchor.x + Math.sin(b.phase * 1.3) * 1.7 + Math.sin(b.phase * 0.7) * 1.1;
      const pz = b.anchor.z + Math.cos(b.phase * 1.1) * 1.7;
      const py = b.anchor.y + Math.sin(b.phase * 2.1) * 0.35;
      b.g.rotation.y = Math.atan2(px - b.g.position.x, pz - b.g.position.z);
      b.g.position.set(px, py, pz);
      const flap = 0.3 + Math.abs(Math.sin(t * 16 + b.phase * 7)) * 1.0;
      b.w1.rotation.y = flap;
      b.w2.rotation.y = -flap;
      escreveAsas(wings, i, b);
    }
    wings.instanceMatrix.needsUpdate = true;
    // pássaros circulam batendo asas (a malha é portadora: a matriz vai pra instância)
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      b.a += b.sp * dt;
      b.m.position.set(b.center.x + Math.cos(b.a) * b.r, b.h + Math.sin(t * 0.6 + b.ph) * 2, b.center.z + Math.sin(b.a) * b.r);
      b.m.rotation.y = -b.a + (b.sp > 0 ? 0 : Math.PI);
      b.m.scale.y = 0.45 + Math.abs(Math.sin(t * 7 + b.ph)) * 0.85;
      b.m.updateMatrix();
      birdInst.setMatrixAt(i, b.m.matrix);
    }
    birdInst.instanceMatrix.needsUpdate = true;
    // pólen acompanha o player
    motes.position.set(player.pos.x, player.pos.y, player.pos.z);
    motes.rotation.y += dt * 0.025;
    // fogueira tremeluz
    for (let i = 0; i < fireFlames.length; i++) {
      const f = fireFlames[i];
      const k = 0.82 + Math.sin(t * 11 + i * 2.1) * 0.18 + Math.sin(t * 23 + i) * 0.08;
      f.scale.set(k, k * (1 + Math.sin(t * 17 + i * 3) * 0.16), 1);
      f.position.y = campY + 0.5 + Math.sin(t * 13 + i) * 0.05;
    }
    fireLight.intensity = 2 + Math.sin(t * 9.3) * 0.5 + Math.sin(t * 23.7) * 0.3;
    // fumaça: fogueira + chaminés visíveis
    smokeAcc += dt;
    if (smokeAcc > 0.4) {
      smokeAcc = 0;
      _v1.set(2 + rand(-0.15, 0.15), campY + 0.9, -2 + rand(-0.15, 0.15));
      _v2.set(rand(-0.2, 0.2), rand(0.8, 1.3), rand(-0.2, 0.2));
      FX.spawnParticle(_v1, _v2, 0x6a6661, rand(0.25, 0.5), rand(1.4, 2.2), -0.55);
      for (const s of Structures.smokeSpots) {
        if (Math.random() < 0.55) continue;
        if (Math.hypot(s.x - player.pos.x, s.z - player.pos.z) > 140) continue;
        _v1.set(s.x, s.y, s.z);
        _v2.set(rand(-0.3, 0.3), rand(0.7, 1.2), rand(-0.3, 0.3));
        FX.spawnParticle(_v1, _v2, 0x8d8983, rand(0.3, 0.6), rand(1.6, 2.6), -0.5);
      }
    }
    // bandeiras do forte tremulam
    for (let i = 0; i < Structures.flags.length; i++) {
      const fl = Structures.flags[i];
      fl.rotation.y = fl.userData.ry + Math.sin(t * 2.6 + i * 1.3) * 0.3 + Math.sin(t * 5.1 + i) * 0.12;
      fl.scale.x = 1 + Math.sin(t * 7 + i * 2) * 0.09;
    }
    // braseiros do forte pulsam
    for (let i = 0; i < Structures.flames.length; i++) {
      const f = Structures.flames[i];
      f.scale.setScalar(1 + Math.sin(t * 9 + i * 1.9) * 0.16);
    }
    // canto de passarinhos quando fora do deserto
    chirpAcc -= dt;
    if (chirpAcc <= 0) {
      chirpAcc = rand(3.5, 9);
      if (biomeAt(player.pos.x, player.pos.z) > -0.15) {
        // o passarinho canta de ALGUM galho, não dentro da sua cabeça
        const a = rand(TAU), r = rand(6, 22);
        _v2.set(player.pos.x + Math.cos(a) * r, player.pos.y + rand(3, 9), player.pos.z + Math.sin(a) * r);
        SFX.chirp(_v2);
      }
    }
  }
  return { update };
}
