/* ================================================================
   CONSTANTES AJUSTÁVEIS — mexa aqui para calibrar qualidade/perf
   ================================================================ */
export const CFG = {
  // Grama
  GRASS_TOTAL:      170000,  // total aproximado de lâminas no patch
  GRASS_CHUNKS:     13,      // grade NxN de chunks ao redor do player
  GRASS_CHUNK_SIZE: 10,      // metros por chunk (raio do patch = N/2 * tamanho)
  GRASS_HEIGHT:     0.95,    // altura média da lâmina
  WIND_STRENGTH:    0.55,
  // Mundo
  WORLD_SIZE:       1100,    // lado do terreno (m)
  TERRAIN_SEGS:     220,     // segmentos do PlaneGeometry
  VIEW_DIST:        420,     // far do fog / culling
  TREE_COUNT:       380,
  ROCK_COUNT:       240,
  FLOWER_COUNT:     2600,
  // Sombra
  SHADOW_MAP_SIZE:  1024,    // por cascata (4 cascatas CSM)
  CSM_MAX_FAR:      160,
  // Inimigos
  ENEMY_COUNT:      12,
  // Render
  MAX_PIXEL_RATIO:  2,
  BLOOM_STRENGTH:   0.28,
  BLOOM_RADIUS:     0.35,
  BLOOM_THRESHOLD:  1.0,
  // Compressão do glare do céu: satura em 1/k. BASE mantém o dia como sempre
  // foi; MAX entra quando o halo de Mie cresce (golden hour, chuva) e evita
  // que o horizonte inteiro passe do limiar do bloom e vire borrão branco.
  GLARE_BASE:       0.55,
  GLARE_MAX:        0.85,   // teto 1,18: céu só floresce acima de 6,67 (era 2,22)
  MIE_BASE:         0.0008,
  MIE_HALO_SPAN:    0.007,   // mie extra do golden hour: 0,0008 -> 0,0078
  EXPOSURE:         0.58,
};

/* ===== configurações (localStorage) ===== */
// `res` é o TETO de resolução; `autores` deixa a máquina descer dele quando a
// GPU não dá conta e voltar quando sobra folga (ver js/adaptivequality.js).
// `aa` = SMAA. São TRÊS passes em resolução cheia (bordas, pesos, mistura),
// o item mais caro do pós — e o único que não tinha botão.
export const SETTINGS = Object.assign({ vol: 0.5, res: 1.5, shadow: 1, bloom: 1, ping: 1, autores: 1, aa: 1 },
  (() => { try { return JSON.parse(localStorage.getItem('callofai_cfg') || '{}'); } catch (e) { return {}; } })());
export function persistSettings() { localStorage.setItem('callofai_cfg', JSON.stringify(SETTINGS)); }
