/* ================================================================
   TORRE DE VIGIA — CONTRATO GEOMÉTRICO PURO (sem THREE, sem DOM).

   As 6 torres do campo (js/structures.js: tower(), flatSpot(90, 470))
   sempre tiveram varanda modelada, colisão lateral (walls[]) e telhado
   climático (fieldRoofs) — mas NENHUMA plataforma. groundAt() só olha
   `platforms`, então o jogador atravessava o tampo: seis miradouros
   inúteis num mapa que pede verticalidade.

   Só publicar a laje não resolve: groundAt "gruda" numa plataforma até
   +0,65 m acima do pé atual (js/terrain.js:175). Tampo a 6,34 m sem
   acesso = plataforma inalcançável. Por isso este módulo descreve, de
   uma vez, o tampo E o acesso: uma escada dog-leg (dois lances em U)
   encostada na face LESTE, no padrão do repo — rampa lógica contínua
   (colisão suave) + degraus SÓ visuais por cima (js/structures.js:
   buildStaircase/flight, da Torre Nexus).

   PURO E SEM RNG DE PROPÓSITO: a torre nasce na fase SEEDADA do
   worldgen, onde qualquer Math.random extra desloca o mapa inteiro
   (CLAUDE.md). Aqui só entram contas; a geometria THREE é criada pelo
   chamador dentro de noSeed().
   ================================================================ */

/* espelho de js/terrain.js:175 — a folga máxima que groundAt aceita pra
   "grudar" numa plataforma. Mudou lá? Muda aqui e o teste acusa. */
export const MAX_STEP_UP = 0.65;

export const TOWER = Object.freeze({
  H: 6.2,            // altura dos montantes (js/structures.js: tower())
  DECK_HALF: 1.85,   // meia-largura do tampo (caixa 3,7 × 3,7)
  DECK_T: 0.28,      // espessura da caixa do tampo
  BAND: 1.3,         // largura de cada lance da escada
  INNER_X: 1.9,      // início do lance de cima (fora do footprint: 1,85)
  RUN_A: 6.8,        // vão do lance de baixo (norte-sul)
  RUN_B: 4.4,        // vão do lance de cima
  LANDING_D: 1.3,    // profundidade do patamar da virada (norte)
  TOP_D: 0.9,        // profundidade do patamar de topo
  TOP_OVERLAP: 0.85, // quanto o patamar de topo entra por cima do tampo
  /* O lance de baixo continua ABAIXO do nível do centro da torre, na
     MESMA inclinação. A torre nasce num flatSpot, mas "plano" não é
     plano: medido nas 6 torres da seed 424242, o terreno varia de
     -0,65 a +0,70 m dentro do footprint da escada. Terminar a rampa em
     `gy` deixava o pé FLUTUANDO onde o chão cai (visível na captura) e,
     pior, fora do alcance de +0,65 m do groundAt em alguns pontos — a
     escada simplesmente não começava. Enterrado, o degrau some no chão
     e a rampa sempre emerge sozinha no ponto certo. */
  FOOT_DROP: 0.9,
  STEPS_A: 14,
  STEPS_B: 7,
  STEP_T: 0.3,       // espessura do degrau visual
});

/* ---- retângulos e alturas da torre (coordenadas de MUNDO) ----
   Convenção do projeto: +x leste, +z sul. A escada mora a LESTE.

     deckY  ─────────────┬───[T]──   patamar de topo (sobrepõe o tampo)
                         │  ╱
                      ╱──┘ lance B (sobe indo pro SUL)
     midY   ──[N]───╱          patamar da virada (180°)
                 ╲
                  ╲───  lance A (sobe indo pro NORTE)
     gy     ────────────[entrada, canto SUDESTE] */
export function towerSurfaces(cx, cz, gy) {
  const T = TOWER;
  const deckY = gy + T.H + T.DECK_T / 2;
  const rise = deckY - gy;
  // um único ângulo pros dois lances: cada um leva a fatia da subida
  // proporcional ao seu vão (senão o de cima vira paredão de 45°)
  const riseA = rise * T.RUN_A / (T.RUN_A + T.RUN_B);
  const midY = gy + riseA;

  const innerX0 = cx + T.INNER_X, innerX1 = innerX0 + T.BAND;   // lance B
  const outerX0 = innerX1, outerX1 = outerX0 + T.BAND;          // lance A

  // o lance A termina no norte, onde vira; o B desce de volta pro sul e
  // encosta no tampo. zTop é o fim do B (dentro do tampo, em z).
  const zTop = cz + T.DECK_HALF - T.TOP_OVERLAP;   // = cz + 1.0
  const zTurn = zTop - T.RUN_B;                    // topo do A / base do B
  // prolonga o lance A abaixo de gy na MESMA inclinação (ver FOOT_DROP)
  const extraRun = T.FOOT_DROP * T.RUN_A / riseA;
  const zFoot = zTurn + T.RUN_A + extraRun;        // pé do A (sul, enterrado)

  return {
    gy, midY, deckY,
    deck: { x0: cx - T.DECK_HALF, x1: cx + T.DECK_HALF, z0: cz - T.DECK_HALF, z1: cz + T.DECK_HALF, y: deckY },
    // rampa em z: y0 vale em z0 e y1 em z1 (mesma convenção de groundAt)
    flightA: { x0: outerX0, x1: outerX1, z0: zTurn, z1: zFoot, y0: midY, y1: gy - T.FOOT_DROP },
    landingN: { x0: innerX0, x1: outerX1, z0: zTurn - TOWER.LANDING_D, z1: zTurn, y: midY },
    flightB: { x0: innerX0, x1: innerX1, z0: zTurn, z1: zTop, y0: midY, y1: deckY },
    // o patamar de topo SOBREPÕE o tampo de propósito: sem essa costura
    // sobra um vão entre a última contra-piso e a laje, e o jogador cai
    landingT: { x0: cx + T.DECK_HALF - T.TOP_OVERLAP, x1: innerX1, z0: zTop, z1: zTop + T.TOP_D, y: deckY },
    entry: { x: (outerX0 + outerX1) / 2, z: zFoot },
  };
}

/* plataformas prontas pro `platforms` de js/terrain.js (groundAt).
   `role` é metadado de QA; `city`/`castle` não entram (torre é campo). */
export function towerPlatforms(cx, cz, gy) {
  const s = towerSurfaces(cx, cz, gy);
  const flat = (r, role) => ({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y: r.y, role, tower: true });
  const ramp = (r, role) => ({ ramp: true, axis: 'z', x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1,
    y0: r.y0, y1: r.y1, role, tower: true });
  return [
    flat(s.deck, 'deck'),
    ramp(s.flightA, 'flightA'),
    flat(s.landingN, 'landingN'),
    ramp(s.flightB, 'flightB'),
    flat(s.landingT, 'landingT'),
  ];
}

/* degraus VISUAIS por cima da rampa lógica: {x,y,z,w,h,d,flight}.
   y é o CENTRO da caixa; o topo (y + h/2) encosta na rampa. */
export function towerSteps(cx, cz, gy) {
  const s = towerSurfaces(cx, cz, gy);
  const out = [];
  const emit = (r, n, tag) => {
    const dz = (r.z1 - r.z0) / n;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const z = r.z0 + (r.z1 - r.z0) * t;
      out.push({
        x: (r.x0 + r.x1) / 2, z,
        y: r.y0 + (r.y1 - r.y0) * t - TOWER.STEP_T / 2,
        w: r.x1 - r.x0, h: TOWER.STEP_T, d: Math.abs(dz) + 0.02,
        flight: tag,
      });
    }
  };
  emit(s.flightA, TOWER.STEPS_A, 'A');
  emit(s.flightB, TOWER.STEPS_B, 'B');
  return out;
}

/* caminho de subida amostrado (QA e captura de evidência): do pé da
   escada até o centro do tampo, passando pelos dois lances. */
export function climbWaypoints(cx, cz, gy, step = 0.25) {
  const s = towerSurfaces(cx, cz, gy);
  const midInner = (s.flightB.x0 + s.flightB.x1) / 2;
  const midOuter = (s.flightA.x0 + s.flightA.x1) / 2;
  const zLanding = (s.landingN.z0 + s.landingN.z1) / 2;
  const cantos = [
    { x: midOuter, z: s.flightA.z1 },       // pé, sul
    { x: midOuter, z: s.flightA.z0 },       // topo do lance A, norte
    { x: midOuter, z: zLanding },           // entra no patamar
    { x: midInner, z: zLanding },           // vira 180°
    { x: midInner, z: s.flightB.z0 },       // base do lance B
    { x: midInner, z: s.flightB.z1 },       // topo do lance B (= tampo)
    { x: (s.landingT.x0 + s.landingT.x1) / 2, z: (s.landingT.z0 + s.landingT.z1) / 2 },
    { x: cx, z: cz },                       // centro do tampo
  ];
  const out = [{ x: cantos[0].x, z: cantos[0].z }];
  for (let i = 1; i < cantos.length; i++) {
    const a = cantos[i - 1], b = cantos[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= n; k++)
      out.push({ x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n });
  }
  return out;
}
