/* grama instanciada com vento no vertex shader — extraído de game.js; deps explícitas */
import * as THREE from 'three';

export function createGrass(deps) {
  const { CFG, rand, TAU, heightAt, biomeAt, WATER_LEVEL, simplex, scene, sunDir, CITY, VOLCANO, clearings = [],
    cityGrassFactor = null, worldSeed = 424242, rebuildBudget = 6 } = deps;
  /* RNG LOCAL por chunk: (seed, cx, cz) → mesmo conteúdo SEMPRE — preencher,
     reciclar, sair e voltar produz exatamente as mesmas matrizes/fases/cores,
     sem depender da ordem global do Math.random. */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const chunkRng = (cx, cz) =>
    mulberry32((worldSeed ^ Math.imul(cx + 31337, 0x9E3779B1) ^ Math.imul(cz + 7331, 0x85EBCA77)) >>> 0);
  const N = CFG.GRASS_CHUNKS;                       // grade NxN
  const SIZE = CFG.GRASS_CHUNK_SIZE;
  const PER_CHUNK = Math.floor(CFG.GRASS_TOTAL / (N * N));
  const PATCH_RADIUS = (N / 2) * SIZE;              // raio do tapete de grama

  // geometria da lâmina: quad afunilado com leve curvatura, raiz em y=0
  function bladeGeometry(segmentos = 4) {
    const g = new THREE.PlaneGeometry(0.1, 1, 1, segmentos);
    g.translate(0, 0.5, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setX(i, p.getX(i) * (1.0 - y * 0.82));      // afunila ate a ponta
      p.setZ(i, Math.pow(y, 2) * 0.18);             // curvinha pra frente
    }
    g.computeVertexNormals();
    return g;
  }
  const baseBlade = bladeGeometry(4);
  /* LOD DE LÂMINA EM TRÊS DEGRAUS — economia de triângulo SEM tirar grama.

     A MESMA fórmula de afunilamento/curva, com menos segmentos de altura.
     E o detalhe que torna isto seguro: **o afunilamento é LINEAR em y**
     (`x *= 1 - y*0.82`), então a largura em qualquer altura é a mesma com 4,
     2 ou 1 segmento — a interpolação do rasterizador reproduz exatamente a
     mesma reta. Raiz e ponta caem no MESMO ponto nos três. O único que muda
     é a curvinha `z = y²*0.18`, que vira uma poligonal com menos vértices;
     a 25 m a flecha dessa curva é sub-pixel.

       completa  4 segmentos = 8 triângulos   (perto)
       reduzida  2 segmentos = 4 triângulos   (média distância)
       mínima    1 segmento  = 2 triângulos   ← o PISO geométrico de um quad

     REGRA DURA DE ANTI-TRAPAÇA: o LOD mexe SÓ em segmentos. Quantidade,
     altura e alcance da grama são idênticos e nunca viram configuração do
     jogador — grama mais rala é wallhack contra quem está deitado no mato.
     O que sustenta o ocultamento a essa distância é a DENSIDADE, não a
     curvatura de cada lâmina, e isso está medido em pixel (contra um alvo do
     tamanho de um corpo deitado) em test/xr-quality.test.js. */
  const loBlade = bladeGeometry(2);
  /* A LÂMINA MÍNIMA NASCE PREGUIÇOSA, e isto não é economia de memória: é o
     invariante mais caro do repo. Todo `BufferGeometry` do three gasta 4
     números do `Math.random` no UUID, e durante o worldgen o `Math.random` É
     o fluxo SEEDADO — criá-la junto das outras duas deslocaria o layout do
     mundo de TODOS os jogadores da mesma seed. Não é teoria: o
     test/grass-decor.test.js conta os 22 UUIDs que a criação da grama gera e
     reprovou na primeira tentativa deste degrau.

     É a mesma regra que faz o rig de XR nascer preguiçoso (CLAUDE.md), e ela
     morde exatamente igual aqui.

     E quando ela finalmente nasce — dentro da sessão, que é o único lugar que
     pede o degrau mínimo — nasce sob um RNG LOCAL, para não gastar nem um
     sorteio do fluxo compartilhado nem naquele instante. */
  let minBlade = null;
  function laminaMinima() {
    if (minBlade) return minBlade;
    const originalRandom = Math.random;
    let s = 0x9E3779B9 >>> 0;
    Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    try { minBlade = bladeGeometry(1); } finally { Math.random = originalRandom; }
    return minBlade;
  }
  /* esfera da LÂMINA (não do chunk). Ela vai junto no clone de cada chunk e é
     o que `InstancedMesh.computeBoundingSphere` usaria como unidade se algum
     dia precisasse recalcular. As três lâminas têm a MESMA extensão (o LOD só
     tira subdivisão), então a do baseBlade serve para todas. */
  baseBlade.computeBoundingSphere();
  // 0 completa · 1 reduzida · 2 mínima (esta última criada na primeira vez)
  const NIVEIS = [() => baseBlade, () => loBlade, laminaMinima];
  /* OS DOIS ANÉIS SÃO LIDOS POR FRAME, NÃO CONGELADOS NO BOOT — e é isso que
     permite ao preset da sessão XR (js/xr/xrquality.js) trocá-los ao entrar no
     headset e devolvê-los ao sair, pelo MESMO canal por onde ele já mexe no
     `CFG.CSM_MAX_FAR`. Nenhuma fiação nova: quem chama `atualizarLods()` é o
     `update()` que o game.js já executa uma vez por frame.

     `GRASS_LOD_RING`     — além dele, a lâmina cai de 4 para 2 segmentos.
     `GRASS_LOD_RING_FAR` — além dele, cai para 1. AUSENTE POR PADRÃO: sem ele
       o valor é Infinity e o degrau mínimo simplesmente não existe, que é
       exatamente o comportamento histórico do desktop e do celular. Ele não
       mora no js/config.js de propósito — quem o escreve é o preset de sessão,
       e some quando a sessão acaba.

     `Number.isFinite` e não `|| 4`: anel ZERO é um valor legítimo (só a célula
     sob os pés fica com a lâmina completa) e `||` o transformava calado em 4 —
     um preset agressivo que não faria nada, sem erro nenhum. Há caso de teste
     e mutante provando exatamente isso.

     O `Math.max` é cinto, e vale dizer o que ele faz DE VERDADE: com
     FAR < RING não há inversão (a função é monótona no anel de qualquer
     jeito), mas o degrau REDUZIDO ficaria inalcançável e a faixa entre os dois
     limiares cairia direto no mínimo — mais agressivo do que quem escreveu os
     números pediu. O clamp faz o pedido virar "mínima a partir do maior dos
     dois", que é a leitura conservadora.

     O que a troca em runtime NÃO pode fazer, e não faz: mexer em quantidade,
     altura ou alcance de lâmina. Ela só decide, por chunk, QUAL das três
     geometrias compartilhadas de lâmina o chunk aponta. */
  const aneisLod = () => {
    const r = CFG.GRASS_LOD_RING;
    const f = CFG.GRASS_LOD_RING_FAR;
    const anel = Number.isFinite(r) ? r : 4;
    return { anel, anelMin: Number.isFinite(f) ? Math.max(f, anel) : Infinity };
  };
  const nivelDoAnel = (d, { anel, anelMin }) => (d > anelMin ? 2 : d > anel ? 1 : 0);
  const bladeTriangles = geo => (geo.index ? geo.index.count : geo.attributes.position.count) / 3;

  /* ================= ESFERA DE CULLING DO CHUNK =====================
     Alcance HORIZONTAL máximo de uma lâmina a partir do centro do chunk.
     Cada parcela sai de uma constante deste arquivo ou do js/env.js — nada
     de margem chutada, porque é ela que separa "culling correto" de
     "grama visível descartada" (wallhack).

       meia-diagonal do chunk  hypot(SIZE/2, SIZE/2): a raiz mais distante
       lâmina 0.45             meia-largura 0.0625 + curva 0.18 + o tombo de
                               0.13 rad em x e z sobre 1.33 m de altura
       vento                   (0.85 + 0.275)*uWind + sway 0.055, com uWind
                               no MÁXIMO que js/env.js:117 escreve
       dobra                   bendAway do player (1.05) + do carro (1.4),
                               somados: o pior caso é o jogador DENTRO do
                               carro, quando as duas empurram para o mesmo lado
     A queda (`AFUNDA`) é vertical e só para baixo: vento (0.16*uWind) mais
     as duas dobras (0.3 e 0.42). */
  const VENTO_MAX = 1.125 * (CFG.WIND_STRENGTH + 0.5) + 0.055;
  const ALCANCE = Math.hypot(SIZE / 2, SIZE / 2) + 0.45 + VENTO_MAX + (1.05 + 1.4);
  const AFUNDA = 0.16 * (CFG.WIND_STRENGTH + 0.5) + 0.3 + 0.42;
  const ALTURA_MAX = 1.4 * CFG.GRASS_HEIGHT;   // maior escala Y que fillChunk sorteia

  const uniforms = {
    uTime:        { value: 0 },
    uPlayerPos:   { value: new THREE.Vector3(0, -999, 0) },
    uCarPos:      { value: new THREE.Vector3(0, -999, 0) },
    uWind:        { value: CFG.WIND_STRENGTH },
    uWindDir:     { value: new THREE.Vector2(0.72, 0.45).normalize() }, // clima escreve aqui
    uSunDir:      { value: sunDir.clone().normalize() },
    uSunColor:    { value: new THREE.Color(0xfff0d4).multiplyScalar(1.12) },
    uSkyColor:    { value: new THREE.Color(0xbfd9ff) },
    uGroundColor: { value: new THREE.Color(0x4d6a36) },
    uBaseColor:   { value: new THREE.Color(0x3e7028) },
    uTipColor:    { value: new THREE.Color(0x9cc94f) },
    uPatchRadius: { value: PATCH_RADIUS },
    uTrackFade:   { value: 10.0 },  // segundos até a trilha de pneu sumir
    ...THREE.UniformsLib.fog,
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      uniform float uTime;
      uniform vec3  uPlayerPos;
      uniform vec3  uCarPos;
      uniform float uWind;
      uniform vec2  uWindDir;
      uniform float uPatchRadius;
      attribute float aPhase;
      attribute vec3  aTint;
      attribute float aTrack;
      uniform float uTrackFade;
      varying vec2 vUv;
      varying vec3 vTint;

      float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float vnoise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash12(i), b = hash12(i + vec2(1.0, 0.0)), c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      // dobra a lamina para longe de um ponto (player ou carro)
      void bendAway(inout vec4 wpos, vec3 src, float radius, float strength, float h) {
        vec2 toBlade = wpos.xz - src.xz;
        float d = length(toBlade);
        float falloff = 1.0 - smoothstep(0.0, radius, d);
        falloff *= 1.0 - smoothstep(0.5, 3.0, abs(wpos.y - src.y));   // so age perto em altura
        vec2 pushDir = toBlade / max(d, 1e-4);
        wpos.x += pushDir.x * falloff * h * strength;
        wpos.z += pushDir.y * falloff * h * strength;
        wpos.y -= falloff * h * 0.3;
      }

      void main() {
        vUv = uv;
        vTint = aTint;
        vec3 transformed = position;
        float h = uv.y;          // peso pela altura: raiz fixa, ponta solta
        float hh = h * h;

        // trilha de pneu: lâmina amassada que levanta em uTrackFade segundos
        float trackK = clamp(1.0 - (uTime - aTrack) / uTrackFade, 0.0, 1.0);
        transformed.y *= 1.0 - trackK * 0.85;

        // some suavemente perto da borda do patch (esconde o recorte)
        mat4 instanceWorld = modelMatrix * instanceMatrix;
        float dCam = distance((instanceWorld * vec4(0.0, 0.0, 0.0, 1.0)).xyz, cameraPosition);
        float edgeFade = 1.0 - smoothstep(uPatchRadius * 0.72, uPatchRadius * 0.97, dCam);
        transformed.y *= edgeFade;
        transformed.x *= edgeFade;

        vec4 wpos = instanceWorld * vec4(transformed, 1.0);

        // vento: ruido rolando + balanco senoidal com fase por instancia
        float w1 = vnoise(wpos.xz * 0.08 + vec2(uTime * 0.85, uTime * 0.55));
        float w2 = vnoise(wpos.xz * 0.33 - vec2(uTime * 1.6, uTime * 0.2));
        float wind = (w1 - 0.5) * 1.7 + (w2 - 0.5) * 0.55;
        float sway = sin(uTime * 2.3 + aPhase * 6.2831) * 0.055;
        vec2 windDir = normalize(uWindDir);
        wpos.x += windDir.x * (wind * uWind + sway) * hh;
        wpos.z += windDir.y * (wind * uWind + sway) * hh;
        wpos.y -= abs(wind) * uWind * hh * 0.16;

        bendAway(wpos, uPlayerPos, 1.5, 1.05, h);   // player amassa a grama
        bendAway(wpos, uCarPos,    3.1, 1.4,  h);   // carro amassa uma area maior

        vec4 mvPosition = viewMatrix * wpos;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyColor;
      uniform vec3 uGroundColor;
      uniform vec3 uBaseColor;
      uniform vec3 uTipColor;
      varying vec2 vUv;
      varying vec3 vTint;

      void main() {
        vec3 albedo = mix(uBaseColor, uTipColor, vUv.y) * vTint;
        // UMA luz direcional embutida + hemisferio fake (confiavel e barato)
        float ndl = clamp(uSunDir.y, 0.0, 1.0);
        float ao = mix(0.5, 1.0, vUv.y);                       // raiz mais escura
        vec3 hemi = mix(uGroundColor, uSkyColor, 0.35 + 0.65 * vUv.y);
        vec3 col = albedo * (hemi * 0.6 + uSunColor * ndl * 0.95) * ao;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  // chunks: cada um e um InstancedMesh com bounding sphere propria p/ frustum culling
  const chunks = [];
  const dummy = new THREE.Object3D();
  const tintCol = new THREE.Color();

  /* CONTRATO DO STREAM SEEDADO: a criação inicial da grade consumia o
     Math.random global numa ordem fixa — tudo que é gerado DEPOIS da grama
     (árvores, estruturas, inimigos) depende dessa contagem. Esta função
     replica o consumo antigo EXATAMENTE (mesmas chamadas, mesmos branches)
     descartando os resultados, para o layout do mundo não mudar por seed.
     O conteúdo REAL dos chunks vem do RNG local determinístico. */
  function legacyConsume(cx, cz) {
    const wx = cx * SIZE, wz = cz * SIZE;
    for (let i = 0; i < PER_CHUNK; i++) {
      const lx = rand(-SIZE / 2, SIZE / 2);
      const lz = rand(-SIZE / 2, SIZE / 2);
      const bio = biomeAt(wx + lx, wz + lz);
      const desert = THREE.MathUtils.smoothstep(-bio, 0.18, 0.45);
      rand(-0.13, 0.13); rand(TAU); rand(-0.13, 0.13); // rotação
      rand(0.65, 1.4);                                  // altura s
      if (desert > 0.05) Math.random();                 // colapso no deserto
      rand(0.8, 1.25);                                  // escala x
      Math.random();                                    // fase do vento
      rand(-0.06, 0.06);                                // luminosidade do tint
    }
  }

  function fillChunk(chunk, cx, cz) {
    chunk.cx = cx; chunk.cz = cz;
    const wx = cx * SIZE, wz = cz * SIZE;
    chunk.mesh.position.set(wx, 0, wz);
    const phase = chunk.mesh.geometry.attributes.aPhase;
    const tint = chunk.mesh.geometry.attributes.aTint;
    // chunk reciclado nasce limpo: trilha de pneu é estado de RUNTIME, nunca
    // parte do conteúdo determinístico (bytes m/ph/ti não mudam)
    const track = chunk.mesh.geometry.attributes.aTrack;
    track.array.fill(-1e4);
    track.needsUpdate = true;
    const rng = chunkRng(cx, cz);                      // determinístico por chunk
    const r = (a, b) => a + rng() * (b - a);
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < PER_CHUNK; i++) {
      const lx = r(-SIZE / 2, SIZE / 2);
      const lz = r(-SIZE / 2, SIZE / 2);
      chunk.roots[i * 2] = lx; chunk.roots[i * 2 + 1] = lz;
      // raiz na superfície CANÔNICA (a mesma da malha/física) + fatores centrais
      const y = heightAt(wx + lx, wz + lz);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      const bio = biomeAt(wx + lx, wz + lz);
      const desert = THREE.MathUtils.smoothstep(-bio, 0.18, 0.45);
      const forest = THREE.MathUtils.smoothstep(bio, 0.34, 0.62);
      dummy.position.set(lx, y, lz);
      dummy.rotation.set(r(-0.13, 0.13), r(0, TAU), r(-0.13, 0.13));
      let s = r(0.65, 1.4) * CFG.GRASS_HEIGHT;
      // deserto: quase sem grama (lâminas colapsam) e mais baixa nas bordas
      if (desert > 0.05) s *= rng() < desert * 0.85 ? 0.02 : (1 - desert * 0.45);
      if (y < WATER_LEVEL + 0.25) s = 0.015; // nada de grama dentro dos lagos
      // distrito urbano: máscara espacial (ruas/calçadas/praça/footprints = sem
      // grama; canteiros verdes = cheia; borda volta suave). Barato: só retângulos.
      if (cityGrassFactor) {
        const gf = cityGrassFactor(wx + lx, wz + lz);
        if (gf < 0.999) s = gf < 0.02 ? 0.0001 : s * gf;
      } else if (CITY && Math.hypot(wx + lx - CITY.x, wz + lz - CITY.z) < 92) {
        s = 0.0001; // fallback antigo se a máscara não for injetada
      }
      // cone do vulcão é rocha nua: grama não brota na encosta
      if (VOLCANO && Math.hypot(wx + lx - VOLCANO.x, wz + lz - VOLCANO.z) < VOLCANO.r * 0.95) s = 0.0001;
      // clareiras (vagas de veículos): grama embaixo do carro fazia ele
      // parecer enterrado/flutuando — chão limpo onde carro estaciona
      for (const c of clearings) {
        if (Math.hypot(wx + lx - c.x, wz + lz - c.z) < (c.r || 4.5)) { s = 0.0001; break; }
      }
      dummy.scale.set(r(0.8, 1.25), s, 1);
      dummy.updateMatrix();
      chunk.mesh.setMatrixAt(i, dummy.matrix);
      phase.setX(i, rng());
      // variacao sutil de cor por lamina, casando com terreno e bioma
      const v = simplex.noise((wx + lx) * 0.03, (wz + lz) * 0.03) * 0.5 + 0.5;
      tintCol.setHSL(
        0.26 + v * 0.035 - 0.018 - desert * 0.09 + forest * 0.015,
        0.58 - desert * 0.2,
        0.5 + r(-0.06, 0.06) - forest * 0.07);
      tint.setXYZ(i, 0.7 + tintCol.r * 0.5, 0.7 + tintCol.g * 0.5, 0.7 + tintCol.b * 0.5);
    }
    phase.needsUpdate = true;
    tint.needsUpdate = true;
    chunk.mesh.instanceMatrix.needsUpdate = true;
    /* CULLING: a esfera tem que ser a do MESH, não a da geometria. O three
       r185 (Frustum.intersectsObject) usa `object.boundingSphere` sempre que
       a propriedade existe — e InstancedMesh a define. Deixá-la nula fazia o
       three chamar computeBoundingSphere(), que UNE a esfera da geometria
       aplicada a CADA uma das 1005 instâncias: com uma esfera do tamanho do
       chunk na geometria, o resultado saía com o dobro do raio necessário e
       com o centro perto de 2x a altura do terreno (a matriz de instância
       translada o centro junto). Medido no celular: raio médio 20,49 m onde
       11,38 m bastam, 87,8 draw calls onde 72,7 bastam.
       Escrever aqui, e não uma vez só, é obrigatório: o three só calcula
       quando a esfera está nula, e chunk reciclado muda de terreno. */
    const yBase = minY - AFUNDA, yTopo = maxY + ALTURA_MAX;
    const esfera = chunk.mesh.boundingSphere ||
      (chunk.mesh.boundingSphere = new THREE.Sphere());
    esfera.center.set(0, (yBase + yTopo) / 2, 0);
    esfera.radius = Math.hypot(ALCANCE, (yTopo - yBase) / 2);
  }

  /* ================= CORTE DO QUE NÃO PINTA PIXEL =====================
     O vertex shader já apaga a grama longe: `edgeFade` vai a ZERO quando a
     raiz da lâmina passa de `0.97 * uPatchRadius` da CÂMERA, e ali ele
     multiplica x E y da lâmina por zero. A lâmina vira uma LINHA (só o z da
     curvinha sobrevive), as duas colunas do quad viram o mesmo ponto e todo
     triângulo fica degenerado — área zero, **nenhum pixel**. Vento e dobra
     não salvam: os dois vértices coincidentes têm o mesmo `wpos.xz` e sofrem
     exatamente o mesmo deslocamento.

     Ou seja: os chunks das quinas externas da grade eram desenhados INTEIROS
     para não pintar nada. Medido em sessão XR: 12 a 14 dos ~70 chunks do
     frustum, 24 k a 28 k triângulos por olho.

     POR QUE NO `onBeforeRender` DO MESH, e não no `update()`. O fade é função
     da posição da CÂMERA, e `update()` só recebe a posição do jogador/carro —
     que na câmera de perseguição fica **7,4 m atrás** (helicóptero: 10,5 m) e
     no passeio do menu, centenas de metros. Cortar por ali exigiria uma
     margem que comeria o ganho, e erraria para o lado ERRADO: grama sumindo
     na tela. `onBeforeRender` recebe a câmera EXATA que vai desenhar — em XR,
     a sub-câmera de CADA OLHO — imediatamente antes do `renderBufferDirect`
     (three r185, `renderObject`). Sem margem, sem chute, e certo nos dois olhos.

     `count = 0` faz o three sair antes da chamada de GL (`renderInstances`
     tem `if (primcount === 0) return`), então some o triângulo E a draw call.
     `onAfterRender` devolve a contagem: fora do desenho, `mesh.count` continua
     sendo PER_CHUNK para todo mundo que lê contagem de lâmina — inclusive o
     vigia anti-trapaça do scripts/soak.js e o test/grass-decor.test.js.

     A distância é medida em XZ contra o QUADRADO do chunk (a raiz mais
     próxima possível). A do shader é 3D, portanto SEMPRE maior ou igual: o
     corte erra para o lado de desenhar demais, nunca de esconder grama. */
  const CORTE_FADE = PATCH_RADIUS * 0.97;   // o mesmo 0.97 do `edgeFade` no shader
  const _camMundo = new THREE.Vector3();
  let cortesNoFrame = 0;                    // QA: quantos chunks o corte pulou
  function foraDoFade(mesh, camera) {
    /* `setFromMatrixPosition(matrixWorld)` e NUNCA `getWorldPosition()`.
       Custou uma medição inteira: `getWorldPosition` chama `updateWorldMatrix`,
       que RECALCULA `matrixWorld` a partir de position/quaternion locais — e a
       sub-câmera de olho do XR tem a `matrixWorld` escrita DIRETO pelo
       WebXRManager, sem local correspondente. O recálculo jogava a câmera pra
       origem, todo chunk virava "longe" e o corte comia a grama INTEIRA dentro
       do headset (medido: grama/olho 196 980 -> 0 na pose de castelo), enquanto
       o A/B de pixel no monitor seguia verde, porque em mono o recálculo dá o
       mesmo resultado. Esta é, literalmente, a linha do CLAUDE.md sobre a
       câmera em XR não ser coordenada de mundo.

       E é exatamente o vetor que o shader lê: o three preenche o uniform
       `cameraPosition` com `setFromMatrixPosition(camera.matrixWorld)`. */
    _camMundo.setFromMatrixPosition(camera.matrixWorld);
    const dx = Math.max(0, Math.abs(_camMundo.x - mesh.position.x) - SIZE / 2);
    const dz = Math.max(0, Math.abs(_camMundo.z - mesh.position.z) - SIZE / 2);
    return Math.hypot(dx, dz) > CORTE_FADE;
  }
  function instalarCorteDeFade(mesh) {
    mesh.onBeforeRender = (renderer, cena, camera) => {
      if (corteLigado && foraDoFade(mesh, camera)) { mesh.count = 0; cortesNoFrame++; }
    };
    mesh.onAfterRender = () => { mesh.count = PER_CHUNK; };
  }
  let corteLigado = true;                   // QA: debugCorteDeFade desliga p/ A/B

  function makeChunk(cx, cz) {
    const geo = baseBlade.clone();
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(PER_CHUNK), 1));
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(PER_CHUNK * 3), 3));
    geo.setAttribute('aTrack', new THREE.InstancedBufferAttribute(new Float32Array(PER_CHUNK).fill(-1e4), 1));
    const mesh = new THREE.InstancedMesh(geo, material, PER_CHUNK);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = true;   // culling por chunk
    instalarCorteDeFade(mesh);   // e o corte do que o shader já apaga (ver acima)
    const chunk = { mesh, cx: 99999, cz: 99999, roots: new Float32Array(PER_CHUNK * 2), nivel: 0 };
    legacyConsume(cx, cz); // preserva o consumo do stream seedado (ver comentário)
    fillChunk(chunk, cx, cz);
    scene.add(mesh);
    return chunk;
  }

  // grade inicial centrada na origem
  const halfN = Math.floor(N / 2);
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++)
      chunks.push(makeChunk(i - halfN, j - halfN));

  let centerX = 0, centerZ = 0; // celula central atual
  let lodForcado = null;        // QA/captura: ver debugForceLod
  // chunks re-preenchidos por frame, no maximo (celular passa 3 pela fiacao:
  // e so PACING, o conteudo de cada chunk e deterministico por (cx,cz))
  const REBUILD_BUDGET = rebuildBudget > 0 ? rebuildBudget : 6;
  const pending = [];

  /* Troca APENAS os atributos de vértice compartilhados (posição, normal, uv,
     índice). As instâncias — matriz, fase, tint, trilha — e a bounding sphere
     continuam sendo as do chunk, intocadas. Por isso o LOD não move uma lâmina
     nem muda um byte do conteúdo determinístico. */
  function aplicarLod(chunk, nivel) {
    if (chunk.nivel === nivel) return;
    const src = (NIVEIS[nivel] || NIVEIS[0])();
    const g = chunk.mesh.geometry;
    g.setIndex(src.index);
    g.setAttribute('position', src.attributes.position);
    g.setAttribute('normal', src.attributes.normal);
    g.setAttribute('uv', src.attributes.uv);
    chunk.nivel = nivel;
  }
  function atualizarLods() {
    const aneis = aneisLod();
    for (const ch of chunks)
      aplicarLod(ch, lodForcado !== null ? lodForcado
        : nivelDoAnel(Math.max(Math.abs(ch.cx - centerX), Math.abs(ch.cz - centerZ)), aneis));
  }
  atualizarLods();

  function update(playerPos, carPos, time) {
    uniforms.uTime.value = time;
    uniforms.uPlayerPos.value.copy(playerPos);
    uniforms.uCarPos.value.copy(carPos);

    const ncx = Math.round(playerPos.x / SIZE);
    const ncz = Math.round(playerPos.z / SIZE);
    if (ncx !== centerX || ncz !== centerZ) {
      centerX = ncx; centerZ = ncz;
      // recoloca chunks que sairam do raio da grade (wrap toroidal)
      for (const ch of chunks) {
        let tx = ch.cx, tz = ch.cz;
        while (tx < centerX - halfN) tx += N;
        while (tx > centerX + halfN) tx -= N;
        while (tz < centerZ - halfN) tz += N;
        while (tz > centerZ + halfN) tz -= N;
        if (tx !== ch.cx || tz !== ch.cz) pending.push([ch, tx, tz]);
      }
    }
    let budget = REBUILD_BUDGET;
    while (pending.length && budget-- > 0) {
      const [ch, tx, tz] = pending.shift();
      fillChunk(ch, tx, tz);
    }
    /* DEPOIS do refill: `aplicarLod` decide pelo ch.cx/ch.cz, que só é
       atualizado dentro de fillChunk. Rodar antes usaria coordenada velha e
       deixaria o chunk recém-reciclado com o detalhe do lugar antigo.
       Custo: 169 comparações e um early-return — sem alocação, sem refill. */
    atualizarLods();
  }

  /* refaz todos os chunks já preenchidos — usado quando as clareiras são
     registradas depois da grade inicial (vagas de veículos nascem com as
     Structures, que vêm depois da grama na ordem do rand seedado) */
  function refreshAll() {
    for (const ch of chunks) fillChunk(ch, ch.cx, ch.cz);
  }

  /* QA: decodifica as N primeiras lâminas do chunk que contém (x,z) —
     posição mundial da raiz + escala Y. Só leitura. */
  function debugSample(x = 0, z = 0, n = 200) {
    const cx = Math.round(x / SIZE), cz = Math.round(z / SIZE);
    const ch = chunks.find(c => c.cx === cx && c.cz === cz);
    if (!ch) return null;
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const out = [];
    for (let i = 0; i < Math.min(n, PER_CHUNK); i++) {
      ch.mesh.getMatrixAt(i, m);
      m.decompose(p, q, s);
      out.push({ x: p.x + ch.mesh.position.x, y: p.y, z: p.z + ch.mesh.position.z, sy: s.y });
    }
    return out;
  }
  /* QA: bytes do chunk (matriz+fase+tint) p/ prova de determinismo */
  function debugChunkBytes(cx, cz) {
    const ch = chunks.find(c => c.cx === cx && c.cz === cz);
    if (!ch) return null;
    const g = ch.mesh.geometry;
    return {
      m: Array.from(ch.mesh.instanceMatrix.array.slice(0, 64)),
      ph: Array.from(g.attributes.aPhase.array.slice(0, 16)),
      ti: Array.from(g.attributes.aTint.array.slice(0, 16)),
      tr: Array.from(g.attributes.aTrack.array),
    };
  }

  /* trilha de pneu: marca as lâminas num corredor segmento±TRACK_HW com o
     timestamp atual — o shader achata e devolve em uTrackFade s. Runtime
     puro: NENHUM rand, nenhum corpo físico, memória fixa por chunk. Só
     chunks que cruzam o bbox do segmento pagam o loop; needsUpdate sobe
     o buffer daquele chunk (~4 KB), nunca o tapete inteiro. */
  const TRACK_HW = 0.42;
  function stampTrack(x0, z0, x1, z1) {
    const minX = Math.min(x0, x1) - TRACK_HW, maxX = Math.max(x0, x1) + TRACK_HW;
    const minZ = Math.min(z0, z1) - TRACK_HW, maxZ = Math.max(z0, z1) + TRACK_HW;
    for (const ch of chunks) {
      const ox = ch.cx * SIZE, oz = ch.cz * SIZE;
      if (ox + SIZE / 2 < minX || ox - SIZE / 2 > maxX || oz + SIZE / 2 < minZ || oz - SIZE / 2 > maxZ) continue;
      const track = ch.mesh.geometry.attributes.aTrack;
      const ax = x0 - ox, az = z0 - oz;
      const abx = (x1 - ox) - ax, abz = (z1 - oz) - az;
      const ab2 = abx * abx + abz * abz || 1e-6;
      let dirty = false;
      for (let i = 0; i < PER_CHUNK; i++) {
        const px = ch.roots[i * 2] - ax, pz = ch.roots[i * 2 + 1] - az;
        let t = (px * abx + pz * abz) / ab2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = px - abx * t, dz = pz - abz * t;
        if (dx * dx + dz * dz > TRACK_HW * TRACK_HW) continue;
        track.setX(i, uniforms.uTime.value);
        dirty = true;
      }
      if (dirty) track.needsUpdate = true;
    }
  }

  /* QA/captura: força um NÍVEL em TODOS os chunks pra comparação visual A/B.
     `null` devolve o controle aos anéis de distância. Aceita o booleano
     histórico (false = completa, true = reduzida) e também o nível 0/1/2 —
     chamador antigo continua valendo. Não mexe em contagem de lâmina, altura
     nem alcance: só na subdivisão. */
  function debugForceLod(nivel) {
    lodForcado = nivel === null || nivel === undefined ? null
      : (typeof nivel === 'number' ? Math.min(NIVEIS.length - 1, Math.max(0, nivel | 0)) : (nivel ? 1 : 0));
    atualizarLods();
  }
  /* QA: estado do LOD por chunk. Só leitura. `reduzida` continua significando
     "não está na lâmina completa" — é o que os testes de fora deste módulo
     leem, e um chunk no degrau mínimo também é um chunk reduzido. */
  function debugLod() {
    return chunks.map(ch => ({
      cx: ch.cx, cz: ch.cz,
      nivel: ch.nivel,
      reduzida: ch.nivel > 0,
      laminas: ch.mesh.count,
      triangulosPorLamina: bladeTriangles(ch.mesh.geometry),
    }));
  }
  /* QA: os anéis que estão valendo AGORA (o preset de sessão os troca). */
  function debugAneis() { return aneisLod(); }
  /* QA: liga/desliga o corte do que não pinta pixel, para comparação A/B de
     framebuffer. `debugCortes()` diz quantos chunks ele pulou desde a última
     leitura — sem isso não dá para provar que o A/B mediu alguma coisa. */
  function debugCorteDeFade(ligado) { corteLigado = ligado === undefined ? true : !!ligado; }
  function debugCortes() { const n = cortesNoFrame; cortesNoFrame = 0; return { pulados: n, corte: CORTE_FADE }; }
  /* QA: prova de que as lâminas de menos detalhe preservam base, ponta e
     altura — é o que garante silhueta e ocultamento idênticos (ver a regra
     anti-trapaça). `completa`/`reduzida` continuam com o nome histórico;
     `minima` é o degrau novo de 1 segmento. */
  function debugBladeShapes() {
    const medir = geo => {
      const p = geo.attributes.position;
      let alturaMax = -Infinity, larguraBase = 0, larguraTopo = 0;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), x = Math.abs(p.getX(i));
        if (y > alturaMax) alturaMax = y;
        if (y < 1e-6) larguraBase = Math.max(larguraBase, x);
      }
      for (let i = 0; i < p.count; i++)
        if (Math.abs(p.getY(i) - alturaMax) < 1e-6) larguraTopo = Math.max(larguraTopo, Math.abs(p.getX(i)));
      return { segmentos: geo.parameters.heightSegments, alturaMax, larguraBase, larguraTopo,
        triangulos: bladeTriangles(geo) };
    };
    return { completa: medir(baseBlade), reduzida: medir(loBlade), minima: medir(laminaMinima()) };
  }

  return { update, material, PATCH_RADIUS, refreshAll, debugSample, debugChunkBytes, stampTrack,
    debugLod, debugAneis, debugBladeShapes, debugForceLod, debugCorteDeFade, debugCortes };
}
