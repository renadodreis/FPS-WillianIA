/* ================================================================
   TÉRREO OCO DOS PRÉDIOS DA CIDADE — CONTRATO PURO (sem THREE/DOM).

   Os 12 lotes de js/citylayout.js nasciam como caixas MACIÇAS
   (js/structures.js: cityBox = fachada + AABB inteira + telhado
   pisável) e as "portas" eram trim decorativo, sem vão. A cidade é o
   principal campo de batalha do BR e não dava pra entrar em nenhum
   prédio: sem esconderijo, sem rota interna, sem espaço de rotação.

   Aqui mora a planta de 4 térreos abertos — um por quadrante, pra
   valer como rota e não como enfeite. Regras que o teste trava:

     • DUAS saídas em faces opostas. Esconderijo com uma porta só é
       armadilha, não esconderijo.
     • uma janela na face perpendicular voltada pro miolo da cidade:
       dá pra vigiar a praça sem se expor.
     • cobertura interna que quebra a linha reta porta→porta, sem
       entupir a passagem (o teste faz BFS com o raio do jogador).

   PURO E SEM RNG: o térreo é construído na fase SEEDADA do worldgen,
   onde cada Math.random extra desloca o mapa inteiro (CLAUDE.md). Este
   módulo só faz contas; quem materializa cria a geometria em noSeed e
   REPÕE o consumo das peças do caminho maciço que deixou de criar
   (ver SKIPPED_TRIMS).
   ================================================================ */

/* Um por quadrante da cidade (índices em CityLayout.LOTS):
     1 → (-16, -34) noroeste   3 → ( 38, -26) nordeste
     5 → (-38,  44) sudoeste   9 → ( 42,  42) sudeste
   Quatro é o que dá pra fazer BEM: vão de porta real, sala com
   cobertura, janela e segunda saída. Espalhados assim, qualquer briga
   na cidade tem um prédio pra romper contato a menos de 40 m. */
export const HOLLOW_LOTS = Object.freeze([1, 3, 5, 9]);

export const INT = Object.freeze({
  WALL_T: 0.45,   // espessura das paredes do térreo
  DOOR_W: 2.8,
  DOOR_H: 2.6,    // acima disso vai a verga, até o pé-direito
  WIN_W: 3.0,
  WIN_Y0: 1.0,    // peitoril: altura de cobertura agachado
  WIN_Y1: 2.3,
  COVER_H: 1.1,   // caixotes/balcão: cobertura de pé, sem tapar a mira
});

/* Peças do caminho MACIÇO que o térreo oco deixa de criar: o pódium
   (trimBox do térreo cheio), a moldura da porta falsa e o vão recuado.
   Cada BoxGeometry custa 4 Math.random (UUID do THREE), e a fase é
   seedada — quem materializa REPÕE 4×SKIPPED_TRIMS chamadas, igualzinho
   às 168 de js/structures.js. Sem isso, bases/baús/grama saem do lugar. */
export const SKIPPED_TRIMS = 3;

export function isHollowLot(index) { return HOLLOW_LOTS.includes(index); }

/* Pé-direito do térreo.

   MACIÇO (GF_H_SOLID): faixa de fachada, ninguém entra — a conta original.

   OCO (GF_H_HOLLOW): é SALA, e o teto dela é a base do bloco maciço do
   prédio, que cobre TODO o footprint. Quem encosta a cabeça nesse bloco cai
   no ramo "dentro da parede" de Structures.collide e é empurrado para a face
   mais próxima — teleporte lateral de ~6 m ATRAVÉS da fachada, direto na rua.
   Como o balcão existe para pular em cima dele e atirar por cima do peitoril,
   o pé-direito tem que caber cobertura (1,1) + jogador (1,7) + ápice do pulo
   (8,4²/2·22 = 1,6) = 4,4 m. 4,6 dá a folga. */
export const GF_H_SOLID = 3.4;
export const GF_H_HOLLOW = 4.6;
export function groundFloorHeight(lot, hollow = false) {
  return Math.min(hollow ? GF_H_HOLLOW : GF_H_SOLID, lot.h * 0.33);
}

export function oppositeFace(f) {
  return f === 'N' ? 'S' : f === 'S' ? 'N' : f === 'E' ? 'O' : 'E';
}
const isHoriz = (f) => f === 'N' || f === 'S'; // parede corre no eixo x

/* A janela vai na perpendicular voltada pro MIOLO da cidade: de dentro
   dá pra vigiar a praça/avenida, que é por onde o inimigo vem. */
export function pickWindowFace(lot) {
  if (isHoriz(lot.face)) return lot.ox >= 0 ? 'O' : 'E';
  return lot.oz >= 0 ? 'N' : 'S';
}

/* centro do vão numa face, em coordenadas LOCAIS ao prédio */
function openingCenter(face, w, d, T) {
  if (face === 'N') return { x: 0, z: -d / 2 + T / 2 };
  if (face === 'S') return { x: 0, z: d / 2 - T / 2 };
  if (face === 'E') return { x: w / 2 - T / 2, z: 0 };
  return { x: -w / 2 + T / 2, z: 0 };
}

/* segmentos de UMA face, dado o conjunto de vãos.
   Faces N/S ocupam a largura toda; E/O recuam a espessura nas pontas
   pra não duplicar geometria nos cantos. */
function faceSegments(face, w, d, gfH, openings) {
  const T = INT.WALL_T;
  const horiz = isHoriz(face);
  const a = horiz ? -w / 2 : -d / 2 + T;
  const b = horiz ? w / 2 : d / 2 - T;
  const fixed = openingCenter(face, w, d, T);
  const out = [];
  // caixa na coordenada da face: u = eixo que corre, y = altura
  const push = (u0, u1, y0, y1, kind) => {
    if (u1 - u0 < 1e-6 || y1 - y0 < 1e-6) return;
    out.push({
      face, kind,
      x: horiz ? (u0 + u1) / 2 : fixed.x,
      z: horiz ? fixed.z : (u0 + u1) / 2,
      y: (y0 + y1) / 2,
      w: horiz ? u1 - u0 : T,
      d: horiz ? T : u1 - u0,
      h: y1 - y0,
    });
  };
  const vaos = openings
    .map(o => ({ c: horiz ? o.x : o.z, hw: o.width / 2, y0: o.y0, y1: o.y1 }))
    .sort((p, q) => p.c - q.c);
  let u = a;
  for (const v of vaos) {
    push(u, v.c - v.hw, 0, gfH, 'cheia');           // pilar à esquerda do vão
    if (v.y0 > 0) push(v.c - v.hw, v.c + v.hw, 0, v.y0, 'peitoril');
    if (v.y1 < gfH) push(v.c - v.hw, v.c + v.hw, v.y1, gfH, 'verga');
    u = v.c + v.hw;
  }
  push(u, b, 0, gfH, 'cheia');
  return out;
}

/* PLANTA do térreo, em coordenadas LOCAIS ao centro do prédio
   (+x leste, +z sul; y = 0 no piso). Quem materializa soma (bx, gy, bz). */
export function interiorPlan(lot, d, gfH) {
  const T = INT.WALL_T;
  const w = lot.w;
  const frontFace = lot.face;
  const backFace = oppositeFace(frontFace);
  const winFace = pickWindowFace(lot);

  const doorAt = (face) => {
    const c = openingCenter(face, w, d, T);
    return { face, x: c.x, z: c.z, width: INT.DOOR_W, height: INT.DOOR_H, y0: 0, y1: INT.DOOR_H };
  };
  const exits = [doorAt(frontFace), doorAt(backFace)];
  const wc = openingCenter(winFace, w, d, T);
  const win = { face: winFace, x: wc.x, z: wc.z, width: INT.WIN_W, y0: INT.WIN_Y0, y1: INT.WIN_Y1 };

  const walls = [];
  for (const face of ['N', 'S', 'E', 'O']) {
    const openings = exits.filter(e => e.face === face);
    if (win.face === face) openings.push({ x: win.x, z: win.z, width: win.width, y0: win.y0, y1: win.y1 });
    walls.push(...faceSegments(face, w, d, gfH, openings));
  }

  /* COBERTURA: o eixo porta→porta é uma reta; três peças a cruzam em
     zigue-zague, deixando corredor dos dois lados. `ax` é esse eixo. */
  const ax = isHoriz(frontFace) ? 'z' : 'x';   // eixo que liga as duas portas
  const inW = w / 2 - T, inD = d / 2 - T;      // meia-medida útil por dentro
  const along = ax === 'z' ? inD : inW;        // meia-medida ao longo do eixo
  const cross = ax === 'z' ? inW : inD;        // meia-medida atravessado
  const cover = [];
  const put = (u, v, cw, cd) => cover.push({
    x: ax === 'z' ? v : u, z: ax === 'z' ? u : v,
    w: ax === 'z' ? cw : cd, d: ax === 'z' ? cd : cw,
    h: INT.COVER_H, kind: 'caixote',
  });
  // 1) balcão longo bem no meio, deslocado pra um lado: cruza a reta e
  //    ainda deixa passagem de ~2 m do outro
  put(0, -cross * 0.30, cross * 1.05, 1.0);
  // 2) e 3) caixotes junto de cada porta, alternando de lado: quem entra
  //    já tem onde se encostar, e a reta porta→porta some
  put(-along * 0.60, cross * 0.45, 1.5, 1.4);
  put(along * 0.60, -cross * 0.48, 1.4, 1.4);

  return {
    lot, w, d, gfH, walls, exits, window: win, cover,
    frontFace, backFace,
    // placa/vitrine iluminada por cima da porta da frente (findability)
    sign: { face: frontFace, x: exits[0].x, z: exits[0].z, y: INT.DOOR_H + 0.45 },
    /* Luminárias de teto (mesh emissiva própria, como a Torre Nexus).
       DUAS placas estreitas, não um painel grande: o material emissivo é
       forte (0xcfe9ff @2.4) e uma placa de 3×3 m estourava branca no
       teto — na captura lia como BURACO no telhado, não como luz. */
    lamps: [
      { x: ax === 'z' ? 0 : -along * 0.42, y: gfH - 0.2, z: ax === 'z' ? -along * 0.42 : 0, w: ax === 'z' ? 1.7 : 0.45, d: ax === 'z' ? 0.45 : 1.7 },
      { x: ax === 'z' ? 0 : along * 0.42, y: gfH - 0.2, z: ax === 'z' ? along * 0.42 : 0, w: ax === 'z' ? 1.7 : 0.45, d: ax === 'z' ? 0.45 : 1.7 },
    ],
  };
}
