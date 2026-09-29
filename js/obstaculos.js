/* ================================================================
   OBSTÁCULOS — o que barra a bala FORA das construções, como DADO PURO:
   árvores, pedras, cactos, a tenda do acampamento e os POIs (mercado,
   refúgio na árvore, barris).

   Sem THREE, sem DOM, sem Math.random. É o irmão de js/paredes.js: o
   cliente (game.js, js/amb.js) desenha e registra no `obstaclesNear` o que
   este módulo descreve, e os bots (scripts/bots.js) chamam EXATAMENTE a
   mesma função em Node, só com a semente e o relevo — por isso enxergam as
   mesmas pedras e árvores que o jogador (critério B7 de docs/mobile).

   ── Por que existe ───────────────────────────────────────────────
   Árvores, pedras e cactos nasciam do `Math.random` GLOBAL seedado, no
   ponto em que o stream estava depois de terreno + grama + construções
   (~1,59 milhão de sorteios na semente 424242). O Node não reconstrói
   isso, e o bot via e atirava através de pedra (33 de 41 pares no laudo
   070502f) e de árvore (21 de 23) — a vítima recusava o dano por cobertura
   (`youWereHit` → `rayBlockedAt`), mas o traçante batia na pedra na frente
   do jogador: é a sensação de wallhack.

   Agora cada família sorteia num PRNG PRÓPRIO derivado só da semente, e o
   stream global não é mais consumido aqui. Consequências:
     • obstáculos = f(semente, relevo, sítios das construções);
     • árvores, pedras e cactos mudaram de lugar UMA vez para cada semente
       (decisão do dono, 2026-09-28, a mesma aceita para os prédios);
     • o stream global encurtou: tudo que o consome DEPOIS da vegetação
       (flores, pickups, inimigos, bichos, noite, alien…) também mudou uma
       vez. Terreno, grama, construções e baús não mudaram (nascem antes ou
       têm sorteio próprio) — prova no relatório da entrega e em
       test/obstaculos-paridade.test.js;
     • os POIs já tinham sorteio próprio (0xBEEF) e continuam no MESMO
       lugar; o que muda é que a planta deles sai daqui, síncrona, e as
       árvores passam a evitá-los ao nascer (antes nasciam dentro, eram
       apagadas da tela quando o GLB chegava e o colisor ficava lá,
       invisível, barrando bala).

   ── Contrato ─────────────────────────────────────────────────────
   `construirObstaculos` devolve `solidos` — a lista {x, z, r, category,
   sourceId} que o cliente registra com `addObstacle` — e o que cada família
   precisa para ser desenhada. test/obstaculos-paridade.test.js sobe o jogo
   real e compara a grade do `obstaclesNear` com o Node, obstáculo a
   obstáculo (1e-6). As medidas dos GLBs dos POIs (PROPS) são ESPELHO: o
   cliente usa a medida real para o colisor, então se o GLB mudar a
   paridade acusa.

   ── A regra da bala ──────────────────────────────────────────────
   `rayBlockedAt` (game.js) barra o raio num círculo de raio r·√0,8 em torno
   do obstáculo, só até 3,4 m acima do chão do ponto (BALA). A consulta dos
   bots (`criarConsultaObstaculos`) usa a MESMA regra; as duas são contínuas
   (o cliente amostrava a cada 1,6 m e a bala passava por metade dos cactos
   e árvores). Única diferença: no cliente o cilindro que CONTÉM a origem não
   barra a reta (granada no pé do tronco). A paridade mede isso contra o
   `rayBlockedAt` de verdade.
   ================================================================ */
import { mulberry32, sementeNormalizada } from './paredes.js';

const TAU = Math.PI * 2;

/* ---------------- sorteios próprios ----------------
   Os sais separam estes streams dos outros derivados da semente (baús
   0xC0FFEE, POIs 0xBEEF, escombros 0xC1DADE, detalhe 0xB111D5, construções
   0xED1F1C, plano da partida 0x9E3779B9, cidade 0xC17DE57). Uma família por
   stream: mexer nas pedras não move árvore nem cacto. */
export const SAL_ARVORES = 0xA2B0E5;
export const SAL_PEDRAS = 0x9ED2A5;
export const SAL_CACTOS = 0xCAC705;
export const SAL_POIS = 0xBEEF;      // o de sempre (era o `poiSeed` do game.js)

const rngDe = (worldSeed, sal) => mulberry32((sementeNormalizada(worldSeed) ^ sal) >>> 0);
export const rngArvores = worldSeed => rngDe(worldSeed, SAL_ARVORES);
export const rngPedras = worldSeed => rngDe(worldSeed, SAL_PEDRAS);
export const rngCactos = worldSeed => rngDe(worldSeed, SAL_CACTOS);
export const rngPois = worldSeed => rngDe(worldSeed, SAL_POIS);

const sorteador = rng => (a = 1, b) => (b === undefined ? rng() * a : a + rng() * (b - a));

/* ---------------- constantes ---------------- */
export const VEGETACAO = Object.freeze({
  LIMITE: 0.47,            // × WORLD_SIZE: faixa onde árvore/pedra/cacto nascem
  CIDADE_LIVRE_M: 92,      // nada de vegetação no distrito urbano
  CACTOS_MAX: 160,         // capacidade da InstancedMesh dos cactos (game.js)
});
/* ESPELHO de RIGID_CLEAR_RADIUS (js/castle.js, `excludesGuardRoute`): a rota
   do Golem não tem colisor rígido. castle.js importa THREE + GLTFLoader e o
   Node não o carrega; a paridade lê `Structures.castle.rigidClearRadius`. */
export const CASTELO_ROTA_LIVRE_M = 49;

/* a regra do `rayBlockedAt` (game.js): círculo r·√0,8, até 3,4 m do chão */
export const BALA = Object.freeze({ FATOR_R2: 0.8, TETO_M: 3.4 });
/* FAIXA ABSOLUTA: o obstáculo com `y1` (fatia de tronco) barra só com a
   altura da bala em [y0, y1), no MUNDO — não "até 3,4 m acima do chão do
   ponto". Exata e sem relevo: o tronco deslocado do pivô não depende do
   chão debaixo dele. Devolve o trecho do parâmetro u da reta y + dy·u que
   fica na faixa. */
export function trechoNaFaixa(y, dy, y0, y1) {
  if (Math.abs(dy) < 1e-12) return y >= y0 && y < y1 ? [-Infinity, Infinity] : [Infinity, -Infinity];
  const u0 = (y0 - y) / dy, u1 = (y1 - y) / dy;
  return u0 < u1 ? [u0, u1] : [u1, u0];
}

/* tenda em A do acampamento inicial (js/amb.js) */
export const TENDA = Object.freeze({ x: 5.6, z: -4.2, r: 1.3 });

/* Medidas dos GLBs dos POIs na escala do jogo — ESPELHO do que
   Scenery.prop mede (`meia` = max(size.x, size.z) / 2 com a altura pedida).
   O cliente registra o colisor com a medida REAL; se o arquivo mudar, a
   paridade acusa. */
export const PROPS = Object.freeze({
  mercado: Object.freeze({ altura: 7, meia: 6.37004667679303 }),
  refugio: Object.freeze({ altura: 13, meia: 5.695140938972557 }),
  barril: Object.freeze({ r: 0.55 }),
});
/* colisor-círculo de um prop: a caixa física vale 72 % da pegada e o círculo
   90 % da maior meia-largura dela (placeProp, game.js) */
export function raioDoProp(meia) { return meia * 0.72 * 0.9; }
/* colisor-círculo de cada família (o cliente registra com estas contas) */
export const raioDaArvore = s => 0.45 * s;

/* ---------------- árvore: o MODELO e os TRONCOS ----------------
   De perto (< 70 m) cada árvore é um de quatro GLBs (game.js,
   `treeVariantMeshes`, na ordem de ARVORE.MODELOS), e o tronco deles NÃO
   fica no pivô: na retorcida está a ~1 m do centro, o bosquete tem três em
   fila, e o quarto modelo são duas MUDAS a ±2,2 m (caule de ~10 cm até
   0,8 m e folhas até 1,25 m) com o meio vazio. O colisor era um círculo de
   0,45·s no pivô para todas: o jogador atravessava o tronco desenhado e
   batia num pilar invisível, a bala idem, e o bot (mesma lista) via e
   atirava através do tronco.

   TRONCOS[v]: os troncos do modelo v, cada um em FATIAS de altura
   [dx, dz, r, até] em coordenadas do modelo (escala 1, pivô no chão, antes
   do giro): centro, raio da MADEIRA e topo da fatia (null = até o teto da
   bala). O tronco afina (a retorcida vai de r 0,44 a 0,26 entre 0,5 e
   1,8 m) e inclina (o pinheiro do bosquete deita ~0,4 m nesse trecho): um
   círculo só erra 10–15 cm numa ponta ou na outra, e fatia de 0,6 m ainda
   erra ±13 cm no pinheiro. Fatias de 0,3 m; cada uma é o círculo que
   melhor reproduz a SILHUETA dos cortes da faixa (largura projetada em 16
   direções — a caixa do contorno superestima a base com raízes). ESPELHO dos GLBs, medido
   cortando a geometria assada (Scenery.bakedGeometry, altura normalizada)
   por planos horizontais a cada 0,1 m; test/arvores-colisor.test.js varre
   a MALHA desenhada e acusa se o modelo mudar. Raízes e moitas abaixo de
   0,5 m ficam de fora; muda é folha, não madeira: não segura bala nem
   corpo.

   O colisor guarda r_madeira/√BALA.FATOR_R2: a regra da bala (r·√0,8) cai
   exatamente na casca, e o corpo do jogador para ~4 cm antes dela.

   Qual modelo e qual escala eram decididos no game.js DEPOIS do GLB chegar
   (e o colisor não sabia); agora são dado da árvore (planejarArvores), pelo
   número da candidata e o bioma, sem sorteio — o stream não muda. */
export const ARVORE = Object.freeze({
  MODELOS: Object.freeze(['giant_low_poly_tree', 'low_poly_tree_with_twisting_branches',
    'low_poly__tree_assets', 'low_poly_tree_log_and_stump']),
  TRONCOS: Object.freeze([
    // gigante
    [[[-0.08, 0.43, 0.61, 0.8], [-0.08, 0.39, 0.54, 1.1], [-0.08, 0.35, 0.51, 1.4], [-0.08, 0.30, 0.48, 1.7], [-0.08, 0.25, 0.45, null]]],
    // retorcida
    [[[0.14, -1.00, 0.44, 0.8], [0.15, -1.04, 0.37, 1.1], [0.12, -1.05, 0.31, 1.4], [0.08, -1.04, 0.26, 1.7], [0.06, -1.02, 0.26, null]]],
    // bosquete: árvore seca, pinheiro, árvore vermelha
    [[[3.25, -0.10, 0.405, 0.8], [3.05, -0.01, 0.357, 1.1], [3.08, -0.04, 0.309, 1.4], [3.19, -0.07, 0.267, 1.7], [3.30, 0.11, 0.219, null]],
      [[0.67, 0.03, 0.394, 0.8], [0.67, 0.04, 0.349, 1.1], [0.53, 0.04, 0.309, 1.4], [0.34, 0.05, 0.278, 1.7], [0.27, 0.04, 0.232, null]],
      [[-3.39, 0.13, 0.322, 0.8], [-3.40, 0.02, 0.249, 1.1], [-3.40, -0.09, 0.200, 1.4], [-3.40, -0.18, 0.161, 1.7], [-3.51, -0.22, 0.172, null]]],
    // mudas
    [],
  ].map(troncos => Object.freeze(troncos.map(fatias => Object.freeze(fatias.map(f => Object.freeze(f))))))),
  /* o tronco em que a árvore procedural de LONGE fica (-1: nenhuma — de
     longe não se desenha árvore grande onde de perto há muda) */
  PRINCIPAL: Object.freeze([0, 0, 1, -1]),
  AFUNDA: 0.15,   // a instância desce 15 cm no chão (game.js, rebucketTrees)
});
/* campo: retorcidas; floresta: bosquetes densos; 1 em 12 mudas; a
   gigante é marco raro (1 em 40, só em bioma de mata) */
export function modeloDaArvore(i, bio) {
  return (i % 40 === 0 && bio > 0.3) ? 0
    : (i % 12 === 0) ? 3
      : bio > 0.34 ? (i % 2 ? 1 : 2) : (i % 3 === 0 ? 2 : 1);
}
/* muda não vira gigante; a gigante é imponente (pelo índice: sem sorteio) */
export function escalaDoModelo(i, modelo, s) {
  return modelo === 3 ? 0.8 + (i % 5) * 0.1 : modelo === 0 ? 1.2 + (i % 5) * 0.1 : s;
}
/* as fatias de tronco de uma árvore no MUNDO: { x, z, rMadeira, y0, y1,
   tronco } — y0/y1 alturas absolutas. A base da instância é o chão do pivô
   menos AFUNDA; a primeira fatia desce até bem abaixo do chão e a última
   sobe até o teto da bala acima do chão do pivô. Giro do three:
   (x, z) → (x cos + z sen, −x sen + z cos). */
export function troncosDaArvore(a) {
  const c = Math.cos(a.rot), sn = Math.sin(a.rot), base = a.y - ARVORE.AFUNDA;
  const out = [];
  ARVORE.TRONCOS[a.modelo].forEach((fatias, tronco) => {
    let y0 = a.y - 50;
    for (const [dx, dz, r, ate] of fatias) {
      const y1 = ate === null ? a.y + BALA.TETO_M : base + ate * a.s;
      out.push({ x: a.x + (dx * c + dz * sn) * a.s, z: a.z + (-dx * sn + dz * c) * a.s, rMadeira: r * a.s, y0, y1, tronco });
      y0 = y1;
    }
  });
  return out;
}
export const raioDaPedra = s => s * 0.8;
export const RAIO_CACTO = 0.35;
export function sitioDoProp(x, z, meia, type) { return { x, z, r: meia + 3, type }; }

/* ---------------- POIs ----------------
   A MESMA conta que morava no bloco assíncrono do game.js, com o MESMO
   sorteio (0xBEEF) e a mesma ordem: busca do refúgio (2 por tentativa),
   giro do refúgio, giro de cada barril. `sitios` são os das construções
   (Structures.sites antes do mercado). */
export function planejarPois({ worldSeed, heightAt, slopeAt, biomeAt, WATER_LEVEL, sitios, rng, medidas = PROPS }) {
  const rand = sorteador(rng || rngPois(worldSeed));
  const cidade = sitios.find(s => s.type === 'cidade');
  const mx = cidade ? cidade.x + cidade.r + 16 : 60, mz = cidade ? cidade.z - 18 : 60;
  const mercado = { x: mx, z: mz, ry: 0.4, meia: medidas.mercado.meia };
  mercado.sitio = sitioDoProp(mx, mz, mercado.meia, 'mercado');
  const ocupados = sitios.concat([mercado.sitio]);

  // refúgio na árvore: primeiro canto de floresta plano que achar
  let tx = 0, tz = 0;
  for (let i = 0; i < 300; i++) {
    const a = rand(TAU), r = rand(150, 420);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (biomeAt(x, z) > 0.4 && slopeAt(x, z) < 0.3 && heightAt(x, z) > WATER_LEVEL + 1.5 &&
        !ocupados.some(s => Math.hypot(x - s.x, z - s.z) < s.r + 20)) { tx = x; tz = z; break; }
  }
  let refugio = null;
  if (tx || tz) {
    refugio = { x: tx, z: tz, ry: rand(TAU), meia: medidas.refugio.meia };
    refugio.sitio = sitioDoProp(tx, tz, refugio.meia, 'refúgio');
  }
  // barris: cobertura leve perto dos POIs; sem refúgio, os 3 dele não existem
  const spots = [[mx + 5, mz + 4], [mx - 6, mz + 2], [mx + 3, mz - 6]];
  if (refugio) spots.push([tx + 4, tz + 2], [tx - 3, tz - 4], [tx + 2, tz - 5]);
  const barris = spots.map(([x, z]) => ({ x, z, ry: rand(TAU) }));
  return { mercado, refugio, barris, sitios: refugio ? [mercado.sitio, refugio.sitio] : [mercado.sitio] };
}

/* ---------------- vegetação ---------------- */

/* cidade, vulcão e rota do castelo: o lugar conta no teto do laço, mas nada
   nasce ali (antes nascia com escala 0,0001 a 100 m debaixo do chão) */
function criarExclusao({ CITY, VOLCANO, sitios }) {
  const forte = sitios.find(s => s.type === 'forte');
  return (x, z) => (CITY && Math.hypot(x - CITY.x, z - CITY.z) < VEGETACAO.CIDADE_LIVRE_M) ||
    (VOLCANO && Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.r) ||
    (!!forte && Math.hypot(x - forte.x, z - forte.z) <= CASTELO_ROTA_LIVRE_M);
}

/* variação de cor por região: verdes, outono dourado e tons profundos */
const tintaDaArvore = cv => (cv > 0.45 ? 0xffaa58 : cv > 0.3 ? 0xffd98a : cv < -0.45 ? 0x7ddf9a : 0xffffff);

/* Árvores: bosques pelo ruído, floresta bem mais densa, nada em barranco,
   areia ou deserto, nem a menos de r + 4 m de construção ou POI. A árvore é
   o MODELO, não o pivô: os troncos (até ~5 m dele no bosquete) também
   respeitam o spawn, as exclusões e as construções. O modelo sai do número
   da candidata (`contadas`), que não muda quando outra é excluída — o
   índice na lista mudava, e excluir uma árvore trocaria o modelo de todas
   as seguintes. Nada disso consome sorteio: o stream é o mesmo. */
export function planejarArvores({ rng, heightAt, slopeAt, biomeAt, noise, sitios, exclui, WORLD_SIZE, TREE_COUNT }) {
  const rand = sorteador(rng);
  const lim = WORLD_SIZE * VEGETACAO.LIMITE;
  const arvores = [];
  let contadas = 0, tries = 0;
  while (contadas < TREE_COUNT && tries++ < TREE_COUNT * 30) {
    const x = rand(-lim, lim), z = rand(-lim, lim);
    if (Math.hypot(x, z) < 26) continue;                       // longe do spawn
    if (slopeAt(x, z) > 0.5) continue;                         // sem árvore em barranco
    const y = heightAt(x, z);
    if (y < 0.8) continue;                                     // nem na areia
    const bio = biomeAt(x, z);
    if (bio < -0.18) continue;                                 // deserto: sem árvores
    if (noise(x * 0.006 + 50, z * 0.006 - 80) < (bio > 0.34 ? -0.3 : 0.05)) continue;
    let perto = false;
    for (const st of sitios) if (Math.hypot(x - st.x, z - st.z) < st.r + 4) { perto = true; break; }
    if (perto) continue;
    const s = rand(0.75, 1.5), rot = rand(TAU);
    const n = contadas++;
    if (exclui(x, z)) continue;
    const modelo = modeloDaArvore(n, bio);
    const a = { x, y, z, s: escalaDoModelo(n, modelo, s), rot, modelo, tint: tintaDaArvore(noise(x * 0.004 - 90, z * 0.004 + 60)) };
    if (troncosDaArvore(a).some(t => Math.hypot(t.x, t.z) < 26 || exclui(t.x, t.z)
      || sitios.some(st => Math.hypot(t.x - st.x, t.z - st.z) < st.r + 4))) continue;
    arvores.push(a);
  }
  return arvores;
}

/* Pedras: icosaedro deformado; só a partir de s > 1,1 viram colisor. */
export function planejarPedras({ rng, heightAt, exclui, WORLD_SIZE, ROCK_COUNT }) {
  const rand = sorteador(rng);
  const lim = WORLD_SIZE * VEGETACAO.LIMITE;
  const pedras = [];
  let postas = 0, tries = 0;
  while (postas < ROCK_COUNT && tries++ < ROCK_COUNT * 20) {
    const x = rand(-lim, lim), z = rand(-lim, lim);
    if (Math.hypot(x, z) < 18) continue;
    const s = Math.pow(rng(), 2.2) * 2.6 + 0.35;
    const rX = rand(-0.3, 0.3), rY = rand(TAU), rZ = rand(-0.3, 0.3);
    const scX = rand(0.8, 1.3), scZ = rand(0.8, 1.3);
    postas++;
    if (exclui(x, z)) continue;
    pedras.push({ x, y: heightAt(x, z) - s * 0.3, z, s, rX, rY, rZ, scX, scZ, solida: s > 1.1 });
  }
  return pedras;
}

/* Cactos saguaro no deserto: "vegetação macia" — barram o jogador e a bala,
   não o carro (sem corpo Cannon, de propósito). */
export function planejarCactos({ rng, heightAt, slopeAt, biomeAt, WATER_LEVEL, exclui, WORLD_SIZE }) {
  const rand = sorteador(rng);
  const lim = WORLD_SIZE * VEGETACAO.LIMITE;
  const cactos = [];
  let n = 0, tries = 0;
  while (n < VEGETACAO.CACTOS_MAX && tries++ < 4000) {
    const x = rand(-lim, lim), z = rand(-lim, lim);
    if (biomeAt(x, z) > -0.25 || slopeAt(x, z) > 0.4) continue;
    const y = heightAt(x, z);
    if (y < WATER_LEVEL + 0.5) continue;                       // cacto não nasce no lago
    const rY = rand(TAU), rZ = rand(-0.06, 0.06), s = rand(0.7, 1.5);
    n++;
    if (exclui(x, z)) continue;
    cactos.push({ x, y, z, s, rY, rZ });
  }
  return cactos;
}

/* ---------------- tudo junto ----------------
   `sitios`: Structures.sites das construções (js/paredes.js, `plano.sites`).
   `noise(x, z)`: o simplex do terreno (o mesmo de biomeAt).
   `rngs` é opcional ({ arvores, pedras, cactos, pois }): existe para o teste
   de paridade provar que um sorteio a mais num lado aparece. */
export function construirObstaculos({ worldSeed, heightAt, slopeAt, biomeAt, noise, WATER_LEVEL, CITY, VOLCANO,
  sitios, WORLD_SIZE, TREE_COUNT, ROCK_COUNT, rngs = {} }) {
  for (const [nome, fn] of [['heightAt', heightAt], ['slopeAt', slopeAt], ['biomeAt', biomeAt], ['noise', noise]])
    if (typeof fn !== 'function') throw new Error(`construirObstaculos: ${nome} ausente`);
  for (const [nome, v] of [['WATER_LEVEL', WATER_LEVEL], ['WORLD_SIZE', WORLD_SIZE], ['TREE_COUNT', TREE_COUNT], ['ROCK_COUNT', ROCK_COUNT]])
    if (!Number.isFinite(v)) throw new Error(`construirObstaculos: ${nome} ausente`);
  if (!Array.isArray(sitios) || !sitios.some(s => s.type === 'cidade'))
    throw new Error('construirObstaculos: sítios das construções ausentes');
  const semente = sementeNormalizada(worldSeed);
  const construcoes = sitios.map(s => ({ x: s.x, z: s.z, r: s.r, type: s.type }));
  const pois = planejarPois({ worldSeed: semente, heightAt, slopeAt, biomeAt, WATER_LEVEL, sitios: construcoes, rng: rngs.pois });
  const exclui = criarExclusao({ CITY, VOLCANO, sitios: construcoes });
  const arvores = planejarArvores({ rng: rngs.arvores || rngArvores(semente), heightAt, slopeAt, biomeAt, noise,
    sitios: construcoes.concat(pois.sitios), exclui, WORLD_SIZE, TREE_COUNT });
  const pedras = planejarPedras({ rng: rngs.pedras || rngPedras(semente), heightAt, exclui, WORLD_SIZE, ROCK_COUNT });
  const cactos = planejarCactos({ rng: rngs.cactos || rngCactos(semente), heightAt, slopeAt, biomeAt, WATER_LEVEL, exclui, WORLD_SIZE });

  const solidos = [];
  const add = (x, z, r, category, sourceId) => solidos.push({ x, z, r, category, sourceId });
  const aBala = Math.sqrt(BALA.FATOR_R2);
  for (const a of arvores) {
    for (const t of troncosDaArvore(a)) solidos.push({ x: t.x, z: t.z, r: t.rMadeira / aBala, category: 'rigid', sourceId: 'tree', y0: t.y0, y1: t.y1 });
  }
  for (const p of pedras) if (p.solida) add(p.x, p.z, raioDaPedra(p.s), 'rigid', 'rock');
  for (const c of cactos) add(c.x, c.z, RAIO_CACTO, 'softVegetation', 'cactus');
  add(TENDA.x, TENDA.z, TENDA.r, 'rigid', 'tent');
  add(pois.mercado.x, pois.mercado.z, raioDoProp(pois.mercado.meia), 'rigid', 'mercado');
  if (pois.refugio) add(pois.refugio.x, pois.refugio.z, raioDoProp(pois.refugio.meia), 'rigid', 'refúgio');
  for (const b of pois.barris) add(b.x, b.z, PROPS.barril.r, 'rigid', 'barrel');
  return { semente, pois, arvores, pedras, cactos, solidos };
}

/* ---------------- consulta: segmento × cilindros ----------------
   A regra do `rayBlockedAt`, contínua: o segmento a→b é barrado por um
   obstáculo se passa DENTRO do círculo de raio r·√0,8 (estrito) num ponto
   que está a menos de 3,4 m acima do chão daquele ponto — ou, na fatia de
   tronco (y0/y1), com a altura dentro da faixa absoluta dela. Começar dentro do
   cilindro também barra (o bot que atravessou uma pedra andando não enxerga
   de dentro dela, como com as paredes).

   `heightAt` é o relevo; `grade` ({ half, cell, segs }, a do terreno) torna a
   conta da altura EXATA: dentro de uma célula o chão é um plano por
   triângulo (js/terrain.js), então a folga "reta − chão" é linear por
   trechos, com quebra só onde a reta cruza x, z ou a diagonal da grade —
   basta testar as pontas da corda e esses cruzamentos. Sem grade, amostra a
   cada 0,25 m.

   Os obstáculos moram numa grade uniforme (célula de 8 m), em toda célula que
   o quadrado envolvente do círculo toca; a reta percorre só as células por
   onde passa (Amanatides & Woo) — ~15 células num segmento de 100 m. */
export function criarConsultaObstaculos(solidos, { heightAt, grade = null, celula = 8 } = {}) {
  if (typeof heightAt !== 'function') throw new Error('criarConsultaObstaculos: heightAt ausente');
  const n = solidos.length;
  const ox = new Float64Array(n), oz = new Float64Array(n), oR2 = new Float64Array(n);
  const oY0 = new Float64Array(n), oY1 = new Float64Array(n).fill(NaN);   // faixa absoluta (NaN: regra do teto)
  let rMax = 0;
  for (let i = 0; i < n; i++) {
    const o = solidos[i];
    ox[i] = o.x; oz[i] = o.z; oR2[i] = o.r * o.r * BALA.FATOR_R2;
    if (Number.isFinite(o.y1)) { oY0[i] = o.y0; oY1[i] = o.y1; }
    rMax = Math.max(rMax, Math.sqrt(oR2[i]));
  }
  const cel = celula, celulas = new Map();
  const chave = (i, j) => (i + 32768) * 65536 + (j + 32768);
  for (let k = 0; k < n; k++) {
    const R = Math.sqrt(oR2[k]);
    const i0 = Math.floor((ox[k] - R) / cel), i1 = Math.floor((ox[k] + R) / cel);
    const j0 = Math.floor((oz[k] - R) / cel), j1 = Math.floor((oz[k] + R) / cel);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const c = chave(i, j);
      let l = celulas.get(c);
      if (!l) { l = []; celulas.set(c, l); }
      l.push(k);
    }
  }
  const visto = new Uint32Array(n);
  let marca = 0;

  /* há ponto da reta em [ta, tb] com folga (y − chão) < TETO? */
  function abaixoDoTeto(a, dx, dy, dz, ta, tb) {
    const folga = t => a.y + dy * t - heightAt(a.x + dx * t, a.z + dz * t) < BALA.TETO_M;
    if (folga(ta) || folga(tb)) return true;
    if (grade) {
      const inv = 1 / grade.cell;
      const fx = t => (a.x + dx * t + grade.half) * inv, fz = t => (a.z + dz * t + grade.half) * inv;
      const familias = [[fx(ta), fx(tb)], [fz(ta), fz(tb)], [fx(ta) + fz(ta), fx(tb) + fz(tb)]];
      for (const [u0, u1] of familias) {
        if (u1 === u0) continue;
        const lo = Math.min(u0, u1), hi = Math.max(u0, u1);
        for (let m = Math.floor(lo) + 1; m < hi; m++) if (folga(ta + (tb - ta) * (m - u0) / (u1 - u0))) return true;
      }
      return false;
    }
    const passos = Math.ceil(Math.hypot(dx, dz) * (tb - ta) / 0.25);
    for (let i = 1; i < passos; i++) if (folga(ta + (tb - ta) * i / passos)) return true;
    return false;
  }

  /* o obstáculo k barra o segmento a→b (d = b − a)? */
  function barra(k, a, dx, dy, dz) {
    const cx = a.x - ox[k], cz = a.z - oz[k];
    const A = dx * dx + dz * dz, B = cx * dx + cz * dz, C = cx * cx + cz * cz - oR2[k];
    let ta, tb;
    if (A < 1e-12) {
      if (C >= 0) return false;
      ta = 0; tb = 1;
    } else {
      const disc = B * B - A * C;
      if (disc <= 0) return false;
      const sq = Math.sqrt(disc);
      ta = Math.max(0, (-B - sq) / A); tb = Math.min(1, (-B + sq) / A);
      if (ta >= tb) return false;
    }
    if (!Number.isNaN(oY1[k])) {
      const [lo, hi] = trechoNaFaixa(a.y, dy, oY0[k], oY1[k]);
      return Math.max(ta, lo) < Math.min(tb, hi);
    }
    return abaixoDoTeto(a, dx, dy, dz, ta, tb);
  }

  /* percorre as células da reta 2D a→b; `visita(k)` true interrompe */
  function percorrer(a, b, visita) {
    if (!n) return false;
    if (++marca === 0xFFFFFFFF) { visto.fill(0); marca = 1; }
    const dx = b.x - a.x, dz = b.z - a.z;
    let i = Math.floor(a.x / cel), j = Math.floor(a.z / cel);
    const iFim = Math.floor(b.x / cel), jFim = Math.floor(b.z / cel);
    const si = dx > 0 ? 1 : dx < 0 ? -1 : 0, sj = dz > 0 ? 1 : dz < 0 ? -1 : 0;
    const tdx = si ? Math.abs(cel / dx) : Infinity, tdz = sj ? Math.abs(cel / dz) : Infinity;
    let tmx = si > 0 ? ((i + 1) * cel - a.x) / dx : si < 0 ? (i * cel - a.x) / dx : Infinity;
    let tmz = sj > 0 ? ((j + 1) * cel - a.z) / dz : sj < 0 ? (j * cel - a.z) / dz : Infinity;
    for (let guarda = 0; guarda < 100000; guarda++) {
      const l = celulas.get(chave(i, j));
      if (l) for (const k of l) {
        if (visto[k] === marca) continue;
        visto[k] = marca;
        if (visita(k)) return true;
      }
      if (i === iFim && j === jFim) return false;
      if (tmx < tmz) { if (tmx > 1) return false; i += si; tmx += tdx; }
      else { if (tmz > 1) return false; j += sj; tmz += tdz; }
    }
    return false;
  }

  /* a reta a→b passa por um obstáculo antes de chegar em b */
  function segmentoBloqueado(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    return percorrer(a, b, k => barra(k, a, dx, dy, dz));
  }
  /* o ponto está DENTRO de um cilindro que barra bala */
  function contem(p) {
    const l = celulas.get(chave(Math.floor(p.x / cel), Math.floor(p.z / cel)));
    if (!l) return false;
    for (const k of l) {
      const cx = p.x - ox[k], cz = p.z - oz[k];
      if (cx * cx + cz * cz >= oR2[k]) continue;
      if (Number.isNaN(oY1[k]) ? p.y - heightAt(p.x, p.z) < BALA.TETO_M : p.y >= oY0[k] && p.y < oY1[k]) return true;
    }
    return false;
  }
  /* quem barrou (diagnóstico dos testes): índice em `solidos`, ou -1 */
  function quemBarra(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    let achou = -1;
    percorrer(a, b, k => (barra(k, a, dx, dy, dz) ? ((achou = k), true) : false));
    return achou;
  }
  return { n, rMax, celulas: celulas.size, segmentoBloqueado, contem, quemBarra };
}
