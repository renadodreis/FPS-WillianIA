/* ================================================================
   CONFORTO EM VR — vinheta de túnel e piscada no giro.

   O ENJOO EM VR É CONFLITO SENSORIAL: o olho vê movimento que o ouvido
   interno não sente. A recomendação da Meta para locomoção é reduzir o
   fluxo óptico periférico — "use vignettes to darken or occlude screen
   edges during movement, limiting visible optic flow" — porque a periferia
   da retina é justamente a que alimenta a sensação de auto-movimento.

   Duas funções, uma malha só:

   1. TÚNEL AO ANDAR. Quanto mais rápido, mais a periferia fecha. Correndo
      o campo visível encolhe; parado a vinheta some por completo, e o
      jogador tem a visão inteira de volta — cobrar o preço só enquanto o
      movimento acontece é o ponto.

   2. PISCADA NO GIRO. Um passo de 45° instantâneo é confortável, mas o
      corte seco desorienta ("rodou a tela"). Escurecer por ~80 ms durante
      a virada dá ao cérebro o mesmo tratamento de um piscar de olhos — a
      técnica clássica de snap turn, e a diferença entre "girei" e "a tela
      girou sozinha".

   POR QUE UMA ESFERA E NÃO PÓS-PROCESSAMENTO: em XR o EffectComposer sai
   do caminho (ele desenha nos render targets dele, e o framebuffer da
   sessão não é um deles). A vinheta precisa existir DENTRO da cena, e
   filha da CÂMERA para acompanhar a cabeça sem um frame de atraso —
   vinheta que "escorrega" quando o jogador vira a cabeça é pior que
   vinheta nenhuma.

   NASCE PREGUIÇOSA como todo o resto do XR: `Object3D` gasta 4 números do
   `Math.random` seedado no UUID e a ordem de consumo é contrato do
   worldgen. Quem cria é `anexar()`, no clique do jogador.
   ================================================================ */

const VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/* O alpha cresce com o ângulo em relação ao centro da vista. `abertura` é o
   cosseno do ângulo onde o escuro começa: 1 = fecha tudo, -1 = aberto. */
const FRAG = `
varying vec3 vDir;
uniform float abertura;
uniform float escuro;
void main() {
  float c = -normalize(vDir).z;                 // 1 no centro da vista
  float borda = smoothstep(abertura, abertura - 0.35, c);
  float a = max(borda, escuro);
  if (a <= 0.001) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}`;

export function createXrComfort({ THREE, camera }) {
  let malha = null, uni = null;
  let piscada = 0;          // 1 = totalmente escuro, decai sozinho
  let tunelAtual = 0;

  function anexar() {
    if (malha) { malha.visible = true; return; }
    uni = { abertura: { value: -1 }, escuro: { value: 0 } };
    const geo = new THREE.SphereGeometry(0.35, 24, 16);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: uni,
      transparent: true, side: THREE.BackSide,
      depthTest: false, depthWrite: false, fog: false, toneMapped: false,
    });
    malha = new THREE.Mesh(geo, mat);
    malha.name = 'xrComfort';
    malha.frustumCulled = false;   // está colada na cara; culling só daria sumiço
    malha.renderOrder = 9999;      // por cima de tudo, inclusive da arma
    camera.add(malha);
  }

  function soltar() { if (malha) malha.visible = false; }

  /* Chamado quando o giro em passo acontece. */
  function piscar() { piscada = 1; }

  /* `vel` é a velocidade horizontal em m/s; `vmax` a de corrida. */
  function update(dt, vel, vmax) {
    if (!malha || !malha.visible) return;
    // some por completo parado: a vinheta só cobra preço enquanto há movimento
    const alvo = Math.min(1, Math.max(0, (vel - 1.2) / Math.max(1, vmax - 1.2)));
    // fecha rápido, abre devagar — abrir de repente é um solavanco visual
    const k = alvo > tunelAtual ? 6 : 2.5;
    tunelAtual += (alvo - tunelAtual) * Math.min(1, k * dt);
    piscada = Math.max(0, piscada - dt / 0.08);   // ~80 ms de piscada
    uni.abertura.value = 1 - tunelAtual * 0.55;   // 1 = aberto, 0.45 = túnel fechado
    uni.escuro.value = piscada;
  }

  return {
    anexar, soltar, piscar, update,
    get malha() { return malha; },
    get tunel() { return tunelAtual; },
    get piscando() { return piscada; },
  };
}
