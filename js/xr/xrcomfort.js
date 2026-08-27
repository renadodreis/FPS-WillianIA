/* ================================================================
   CONFORTO EM VR — vinheta de túnel e piscada no giro.

   O ENJOO EM VR É CONFLITO SENSORIAL: o olho vê movimento que o ouvido
   interno não sente. A recomendação da Meta para locomoção é reduzir o
   fluxo óptico periférico — "use vignettes to darken or occlude screen
   edges during movement, limiting visible optic flow" — porque a periferia
   da retina é justamente a que alimenta a sensação de auto-movimento.

   Três funções, uma malha só — e são três porque a vinheta da Meta reage
   a três eventos separados: MOVIMENTO, ROTAÇÃO e aceleração.

   1. TÚNEL AO ANDAR. Quanto mais rápido, mais a periferia fecha. Correndo
      o campo visível encolhe; parado a vinheta some por completo, e o
      jogador tem a visão inteira de volta — cobrar o preço só enquanto o
      movimento acontece é o ponto.

   2. TÚNEL AO GIRAR. Giro artificial contínuo é rotação que o olho vê e o
      ouvido interno não sente — o mesmo conflito de andar, e a periferia
      é de novo o canal. Giro pequeno (mira fina) não escurece nada: o
      túnel só começa depois de ~45°/s, senão a tela pisca a cada correção
      de mira. E fica abaixo do túnel de corrida: campo de visão reduzido
      demais é "disorienting or claustrophobic" (Meta, Reduce Optic Flow).

   3. PISCADA NO GIRO EM PASSOS. Um passo de 45° instantâneo é
      confortável, mas o corte seco desorienta ("rodou a tela"). Escurecer
      por ~80 ms durante a virada dá ao cérebro o mesmo tratamento de um
      piscar de olhos — a técnica clássica de snap turn, e a diferença
      entre "girei" e "a tela girou sozinha". No modo contínuo não há
      piscada: quem cobra o preço lá é o túnel.

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
import { PADRAO as PADRAO_ANDAR } from './xrlocomotion.js';

/* ================================================================
   O CONTRATO DE CONFORTO — o lugar ÚNICO que decide o que é confortável.

   POR QUE ISTO EXISTE, e por que aqui.

   A categoria de conforto do critério de aceite ficou vermelha quatro
   rodadas seguidas MUDANDO DE CAUSA a cada uma. Nas duas últimas, o que a
   derrubou não foi um defeito de conforto: foi uma correção de outra
   frente. A velocidade escolhível — que resolveu o jogador de headset não
   conseguir fugir do gás — trouxe junto a rampa do PC (A4: 281,1 ms contra
   teto de 150) e um fluxo óptico maior (A5: 0,01148 e 0,01361 contra teto
   de 0,0100). Ninguém errou nem foi descuidado: o perfil novo não tinha
   como saber que alimentava a vinheta e o critério de aceleração, porque
   isso não estava escrito em lugar nenhum e nada perguntava.

   Enquanto os números de conforto morarem espalhados — velocidade em
   `xrlocomotion`, giro em `xrturn`, vinheta aqui, painel em `xrui` —, toda
   frente nova reabre a categoria sem perceber, e a validação seguinte
   encontra o estrago como se fosse defeito novo. Aqui ficam os TETOS, as
   EXCEÇÕES DECLARADAS e `auditar()`, que responde por um plano de
   locomoção qualquer. `test/xr-conforto.test.js` roda a auditoria em TODO
   perfil que existir (`ORDEM` de `xrlocomotion.js`), então perfil novo que
   quebre conforto nasce vermelho com nome e número — sem depender de
   alguém lembrar de acrescentar um caso.
   ================================================================ */

/* Os tetos são os do critério de aceite (docs/vr/criterio-aaa.md §2),
   copiados aqui como NÚMERO e não como prosa para poderem ser cobrados. */
export const LIMITES = {
  /* A5 · vinheta com o jogador PARADO. "A periferia volta inteira." */
  vinhetaParado: 0.01,
  /* A5 · e em quanto tempo, do túnel cheio até ZERO EXATO. Não sai do
     critério: sai de fechar o critério pela raiz em vez de pelo sintoma —
     ver `passoTunel`. */
  aberturaS: 1.0,
  /* A4 · tempo até 95 % da velocidade alvo. */
  rampa95S: 0.15,
  /* A3 · tetos de velocidade. A3 tem cláusula de PADRÃO no critério
     ("≤ 2,0 e ≤ 4,0 m/s por padrão em VR, com a velocidade de PC disponível
     como opção declarada") e é por isso que só o perfil padrão responde por
     eles aqui. A4 não tem essa cláusula, e é exatamente essa assimetria que
     derrubou A4 quando os perfis rápidos ficaram alcançáveis. */
  andarPadraoMax: 2.0,
  correrPadraoMax: 4.0,
};

/* EXCEÇÕES DECLARADAS.

   Uma exceção aqui é uma DECISÃO com motivo, custo e condição de validade —
   não um "por enquanto". A rodada que derrubou A4 tinha a decisão certa
   tomada e NÃO ESCRITA: o custo existia, ninguém o havia registrado, e a
   validação o encontrou como se fosse defeito. */
export const EXCECOES = [{
  criterio: 'A4',
  limite: 'rampa95S',
  perfil: 'paridade',
  porque:
    'PARIDADE É PARIDADE INTEIRA, e isso vale mais que a rampa. Headset e '
    + 'monitor jogam a MESMA partida neste jogo, e o invariante do projeto é '
    + 'que quem está de headset não fique nem mais rápido nem mais lento que '
    + 'quem está no monitor. Dar a este perfil a rampa instantânea de XR '
    + '(50 ms) junto com a velocidade do PC (5,2 / 8,6 m/s) deixaria o '
    + 'jogador de headset ESTRITAMENTE MELHOR que o de monitor: nos 273 ms em '
    + 'que o PC ainda está subindo, o headset já está a 95 % — e duelo de '
    + 'canto é ganho por quem chega ao topo primeiro. Vantagem de headset não '
    + 'é conforto, é defeito de projeto. Quem escolhe a linha IGUAL AO PC no '
    + 'painel está pedindo o PC, rampa inclusa; o perfil é opt-in, é o mais '
    + 'rápido dos três e é o único que não é padrão.',
  custo:
    'A rampa deste perfil é a do PC: t95 ≈ 273 ms medidos em sessão contra o '
    + 'teto de 150 ms de A4. O jogador que escolhe IGUAL AO PC aceita a '
    + 'aceleração gradual que a Oculus BPG desaconselha; os outros dois '
    + 'perfis, inclusive o padrão, ficam em ~50 ms.',
  /* A exceção não é um cheque em branco: ela só alcança um perfil que seja
     paridade DE VERDADE. Um perfil "rápido mas não idêntico ao PC" não tem o
     argumento de equilíbrio competitivo que sustenta esta exceção — ele é só
     uma rampa longa —, e volta a responder por A4. */
  vale: plano => plano.escala === 1,
}];

function excecaoDe(criterio, plano) {
  return EXCECOES.find(e => e.criterio === criterio && e.perfil === plano.perfil
    && (typeof e.vale !== 'function' || e.vale(plano) === true)) || null;
}

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

/* Faixa do túnel de GIRO, em graus por segundo: abaixo de GIRO_MIN nada
   escurece (correção de mira não pode piscar a tela), em GIRO_MAX o túnel
   chega ao teto — que é MENOR que o de corrida de propósito. */
const GIRO_MIN = 45, GIRO_MAX = 180, GIRO_TETO = 0.85;

/* Velocidade em que a periferia começa a fechar. O analógico solto e o
   passo físico do jogador pelo cômodo ficam abaixo dela de propósito. */
const ANDAR_MIN = 1.2;

const PISCADA_S = 0.08;   // ~80 ms, o tempo de um piscar de olhos

/* FECHA rápido e ABRE devagar: abrir de repente é um solavanco visual. E
   ABRE_MIN é a taxa MÍNIMA de abertura — a peça que fecha A5 pela raiz. */
const FECHA_K = 6, ABRE_K = 2.5, ABRE_MIN = 0.8, ZERO = 1e-4;

/* Quanto a periferia deveria estar fechada AGORA, dados velocidade linear e
   angular. Separado de `passoTunel` porque a auditoria precisa do alvo sem
   precisar de uma malha. */
function alvoDoTunel(vel, vmax, velGiro) {
  const teto = Math.max(1, (vmax || 0) - ANDAR_MIN);
  const andar = Math.min(1, Math.max(0, ((vel || 0) - ANDAR_MIN) / teto));
  const graus = Math.abs(velGiro || 0) * 180 / Math.PI;
  const girar = Math.min(1, Math.max(0, (graus - GIRO_MIN) / (GIRO_MAX - GIRO_MIN)));
  return Math.max(andar, girar * GIRO_TETO);
}

/* UM PASSO DA VINHETA — e a causa de raiz do A5 mora aqui.

   A abertura era uma exponencial pura (`atual += (alvo − atual)·k·dt`), e
   exponencial NÃO CHEGA: ela divide a distância que falta, e dividir por
   dois para sempre nunca dá zero. Medido nos três perfis de velocidade, o
   resíduo 1,5 s depois de parar dava sempre a MESMA fração do pico —
   0,0212 — e só o pico mudava. Ou seja: A5 reprovava ou não conforme a
   velocidade do jogador, e "consertar" A5 baixando a velocidade (que foi o
   que aconteceu numa rodada) deixava o defeito inteiro no lugar, esperando
   o jogador ganhar a velocidade de volta — que foi o que aconteceu na
   rodada seguinte.

   O conserto não é escolher um pico menor, é a abertura TERMINAR. Abaixo de
   ABRE_MIN/ABRE_K (0,32) a exponencial vira rampa linear e o valor cai em
   ZERO EXATO: do túnel cheio à periferia inteira em ~0,86 s, seja qual for
   o pico e seja qual for o perfil de velocidade que alguém invente depois.
   Acima de 0,32 quem manda continua sendo a exponencial, então a sensação
   de "abre devagar" fica onde ela importa. */
function passoTunel(atual, alvo, dt) {
  const passoDt = dt > 0 ? dt : 0;
  const abrindo = alvo < atual;
  const k = abrindo ? ABRE_K : FECHA_K;
  let v = atual + (alvo - atual) * Math.min(1, k * passoDt);
  if (abrindo) {
    v = Math.min(v, atual - ABRE_MIN * passoDt);
    if (v - alvo <= ZERO) v = alvo;
  }
  return v;
}

/* A receita do §12 do critério (andar 2 s, parar 1,5 s), rodada com a MESMA
   função que a vinheta usa em cada frame. Auditoria com aritmética própria
   vira uma segunda verdade que diverge do produto em silêncio. */
function residuoParado(plano, dt = 1 / 72) {
  const alvo = alvoDoTunel(plano.andar, plano.correr, 0);
  let v = 0;
  for (let t = 0; t < 2; t += dt) v = passoTunel(v, alvo, dt);
  const pico = v;
  for (let t = 0; t < 1.5; t += dt) v = passoTunel(v, 0, dt);
  return { pico, residuo: v };
}

/* AUDITORIA DE CONFORTO de um plano de locomoção
   (`politicaDeVelocidade` de js/xr/xrlocomotion.js, ou qualquer objeto com
   a mesma forma). Devolve o que reprova, com número, e as exceções que
   foram usadas — para elas aparecerem no relatório em vez de sumirem. */
export function auditar(plano) {
  const p = plano || {};
  const faltas = [];
  const excecoes = [];
  const falta = (criterio, limite, medido) =>
    faltas.push({ criterio, limite, medido, teto: LIMITES[limite], perfil: p.perfil });

  /* A3 só vale para o PADRÃO: o critério oferece a velocidade de PC como
     opção declarada, e cobrar o teto de quem escolheu a opção seria proibir
     a opção. */
  if (p.perfil === PADRAO_ANDAR.perfil) {
    if (p.andar > LIMITES.andarPadraoMax) falta('A3', 'andarPadraoMax', p.andar);
    if (p.correr > LIMITES.correrPadraoMax) falta('A3', 'correrPadraoMax', p.correr);
  }

  /* A4 · `damp` chega a 95 % em ln(20)/k ≈ 3/k. */
  const t95 = p.aceleraSolo > 0 ? 3 / p.aceleraSolo : Infinity;
  if (t95 > LIMITES.rampa95S + 1e-9) {
    const e = excecaoDe('A4', p);
    if (e) excecoes.push(e); else falta('A4', 'rampa95S', t95);
  }

  /* A5 não aceita exceção. O jogador não escolheu ficar com a periferia
     fechada; ele só parou de andar. */
  const { pico, residuo } = residuoParado(p);
  if (residuo > LIMITES.vinhetaParado) falta('A5', 'vinhetaParado', residuo);

  return { perfil: p.perfil, ok: faltas.length === 0, faltas, excecoes, t95, pico, residuo };
}

export function createXrComfort({ THREE, camera }) {
  let malha = null, uni = null;
  let piscada = 0;          // 1 = totalmente escuro, decai sozinho
  let tunelAtual = 0;
  /* A VISIBILIDADE É DAQUI, e é reafirmada em todo `update`.
     `city-destruction-client.js:154-157` salva `camera.children[i].visible` e
     restaura POR ÍNDICE durante a cinemática — e a vinheta é filha da câmera.
     Com a lista mudando entre salvar e restaurar, a vinheta ficava presa
     ligada ou presa desligada, e vinheta fora de hora aumenta o enjoo em vez
     de reduzi-lo. O módulo não pede que ninguém mude; ele só não delega o
     próprio estado a um índice de terceiro. */
  let ligada = false;

  function anexar() {
    ligada = true;
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

  /* Desligar ZERA o estado. Sem isso, correr → desligar a vinheta no painel →
     parar → religar devolvia a periferia fechada no valor de quando o jogador
     corria, porque `update` não roda com a vinheta desligada e o túnel ficava
     congelado. Vinheta presa ligada com o jogador parado é o caso que a
     literatura (ACM SAP) mostra AUMENTANDO o enjoo. */
  function soltar() {
    ligada = false;
    tunelAtual = 0;
    piscada = 0;
    if (uni) { uni.abertura.value = 1; uni.escuro.value = 0; }
    if (malha) malha.visible = false;
  }

  /* Chamado quando o giro em passo acontece. */
  function piscar() { piscada = 1; }

  /* `vel` é a velocidade horizontal em m/s; `vmax` a de corrida; `velGiro` é
     a velocidade do giro ARTIFICIAL em rad/s (0 quando o jogador está girando
     o próprio corpo — giro físico não precisa de vinheta, não há conflito). */
  function update(dt, vel, vmax, velGiro = 0) {
    /* NÃO desiste com a malha invisível. Desistir era delegar o estado da
       vinheta a quem tivesse escondido a malha: durante a cinemática da
       cidade o túnel ficava congelado no valor de antes e voltava FECHADO
       com o jogador parado. Integrar sempre custa duas multiplicações e não
       depende de mais ninguém. */
    if (!malha) return;
    // some por completo parado: a vinheta só cobra preço enquanto há movimento
    tunelAtual = passoTunel(tunelAtual, alvoDoTunel(vel, vmax, velGiro), dt);
    piscada = Math.max(0, piscada - dt / PISCADA_S);
    malha.visible = ligada;
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
