/* ================================================================
   OCLUSÃO DA ASSISTÊNCIA DE MIRA — o que a TELA desenha e o tiro não
   conhece.

   Núcleo PURO: sem three, sem DOM, sem `Math.random`. Lê a cena por duck
   typing (`visible`, `parent`, `children`, `geometry`, `matrixWorld`,
   `instanceMatrix`) e nada cria nela — nenhum Object3D, nenhum UUID, nenhum
   número do PRNG seedado do worldgen. Testável sem navegador:
   test/aim-oclusao-core.test.js.

   POR QUE EXISTE (validação 7515734, A2/A8). A linha de visada da
   assistência era o `rayBlockedAt` do tiro: terreno, paredes e troncos. A
   tela desenha muito mais do que a bala conhece. Medido com a âncora de
   pixels (dois renders do mesmo quadro, com e sem o alvo): atrás do
   CAMINHÃO parado, 20 de 30 posições com 0 px e a assistência agindo — e o
   automático dispararia; e na varredura aleatória, 3 de 32, que eram o
   painel do campo de tiro (js/maptoys.js, caixa sem colisão de bala), os
   galhos retorcidos de uma árvore (o colisor é um círculo no centro, o
   tronco desenhado faz curva) e o castelo com o olho dentro da parede.
   Assistir quem a tela não mostra é informação vazada: a mesma família do
   wallhack de grama que já foi deployado nesta base.

   O MODELO — os TRIÂNGULOS que a tela desenha, testados de verdade contra o
   segmento olho → parte do alvo. Para não testar todos, cada malha ganha uma
   GRADE no espaço LOCAL dela: o plano XZ em células, e em cada célula os
   triângulos que a tocam (recortados célula a célula, Sutherland–Hodgman),
   com a caixa XZ e a faixa de Y deles como descarte barato. Isso passa pelo
   vão debaixo do chassi, para na janela opaca da cabine, na copa por cima do
   tronco, no tronco que faz curva e na lona da tenda — e só nelas.
     · malha comum: grade local + `matrixWorld` do quadro — anda junto
       (veículo, helicóptero, nave, rotor);
     · InstancedMesh (árvores, pedras, cactos): UMA grade da geometria e as
       matrizes de instância, relidas quando a versão muda (o LOD das árvores
       reescreve tudo a cada 0,45 s);
     · terreno: marcha de 0,5 m no `heightAt` (o `rayBlockedAt` anda 1,6 m e
       pula crista fina — o mesmo que o validador mediu nos bots, B6).

   NA DÚVIDA, NÃO ASSISTE: malha comum ainda não rasterizada conta como a
   CAIXA dela, sólida; o conjunto de instâncias, pela esfera de cada
   instância. O que NÃO entra (e por quê) está em `candidata`.

   A GRAMA tem camada própria (`gramaCobre`, mais abaixo): ela não é parede —
   o tiro a atravessa, e um ponto dentro dela pode aparecer entre as lâminas —
   mas pode cobrir. Quem decide "o alvo está À VISTA" pergunta às duas.

   CUSTO (medido no jogo, desktop, carga 2,6–3,4, ver
   test/aim-visibilidade.test.js): 9 raios por quadro — o teto da assistência,
   3 candidatos × 3 partes — custam 0,03–0,10 ms (campo, floresta, castelo,
   centro da cidade); `atualizar` parado, 0,02 ms; as grades congeladas,
   ~5 MB; a montagem inteira, ~0,5 s de CPU espalhado em quadros de 2 ms.
   ================================================================ */

export const OCL = Object.freeze({
  CEL: 0.25,            // m (no mundo): célula das malhas pequenas
  CEL_GRANDE: 0.5,      // m: malhas com mais de GRANDE m de lado
  GRANDE: 24,
  PULO_OLHO: 0.08,      // m: o plano próximo da câmera (game.js): o que está mais perto nem é desenhado
  PASSO_TERRENO: 0.5,   // m
  MIN_RAIO: 0.3,        // m: malha menor que isso não esconde um corpo (flor, granada)
  MAX_TRIS: 80000,      // malha maior que isso é terreno/céu: fica de fora
  REVARRER_S: 2,        // s entre varreduras da cena (malha nova, malha que saiu)
  ORCAMENTO_MS: 2,      // ms de rasterização por quadro (no BR, a montagem cabe na nave)
  ORCAMENTO_GRAMA_MS: 1, // ms por quadro para o índice da grama (o chunk mais perto do jogador primeiro)
  IDX: 16,              // m: célula do índice grosso (segmento → malhas perto)
  IDX_MAX: 64,          // células de índice: malha maior que isso vai pra lista global
});
const QUIETO = 90;      // quadros parada até uma malha que andou voltar ao índice

/* ---------------- grade de triângulos (espaço local da malha) ----------------
   Cada célula XZ guarda os TRIÂNGULOS que a tocam (recorte exato célula a
   célula), mais a caixa XZ e a faixa de Y do que a toca — dois descartes
   baratos antes do teste exato raio × triângulo (Möller–Trumbore).

   A primeira versão guardava só intervalos de Y por célula (conservadora por
   construção) e foi MEDIDA contra um raycast exato do three: o atirador na
   entrada de uma tenda perdia a assistência em alvos 1/3 visíveis logo além
   da borda (3 de 17 controles ao lado do caminhão), porque a lona inclinada
   dentro de uma célula de 0,5 m ocupava uma faixa de Y inteira que o raio
   cruzava por baixo — e o raycast exato não achava nada na frente. Com o
   triângulo testado de verdade, o que bloqueia é o que a tela desenha. */
const CH = 16, CH2 = CH * CH;                   // células por lado de um bloco
const chave = (ci, cj) => (ci + 32768) * 65536 + (cj + 32768);
const EPS = 1e-4;          // folga de ponto flutuante nos descartes
const EPS_BARI = 1e-6;     // folga baricêntrica: o raio pela aresta comum de dois triângulos não escapa

/* `geo` = { L (leitor de posição), I (índice ou null), ntris } — a grade lê a
   geometria da própria malha para o teste exato (nada é copiado) */
export function criarGrade(cel, geo) {
  return { cel, inv: 1 / cel, geo, blocos: new Map(), celulas: 0, refs: 0,
    x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity,
    _k: NaN, _b: null, mb: null, selo: 0 };
}
/* geometria solta (lista plana de triângulos) — para teste e ferramenta */
export function geoDeTriangulos(flat) {
  const arr = Float32Array.from(flat);
  return { L: { arr, stride: 3, off: 0, norm: 0, count: arr.length / 3 }, I: null, ntris: Math.floor(arr.length / 9) };
}

function blocoDe(g, i, j, criar) {
  const ci = i >> 4, cj = j >> 4;
  const k = chave(ci, cj);
  if (k === g._k) return g._b;
  let b = g.blocos.get(k);
  if (!b) {
    if (!criar) { g._k = k; g._b = null; return null; }
    const bb = new Float32Array(CH2 * 4), yr = new Float32Array(CH2 * 2);
    for (let c = 0; c < CH2; c++) { bb[4 * c] = bb[4 * c + 2] = yr[2 * c] = Infinity; bb[4 * c + 1] = bb[4 * c + 3] = yr[2 * c + 1] = -Infinity; }
    b = { lst: new Array(CH2).fill(null), bb, yr };
    g.blocos.set(k, b);
  }
  g._k = k; g._b = b;
  return b;
}
function addRef(g, i, j, id, lo, hi, bx0, bx1, bz0, bz1) {
  const b = blocoDe(g, i, j, true);
  const c = (i & 15) + ((j & 15) << 4);
  let l = b.lst[c];
  if (!l) { l = b.lst[c] = []; g.celulas++; }
  if (l[l.length - 1] !== id) { l.push(id); g.refs++; }
  const bb = b.bb, q = 4 * c, yr = b.yr;
  if (bx0 < bb[q]) bb[q] = bx0; if (bx1 > bb[q + 1]) bb[q + 1] = bx1; if (bz0 < bb[q + 2]) bb[q + 2] = bz0; if (bz1 > bb[q + 3]) bb[q + 3] = bz1;
  if (lo < yr[2 * c]) yr[2 * c] = lo; if (hi > yr[2 * c + 1]) yr[2 * c + 1] = hi;
}

/* recorte de polígono num semiplano (Sutherland–Hodgman), buffers fixos */
const PX = [new Float64Array(8), new Float64Array(8)], PY = [new Float64Array(8), new Float64Array(8)],
  PZ = [new Float64Array(8), new Float64Array(8)];
function recorta(src, n, eixoX, valor, maior) {
  const sx = PX[src], sy = PY[src], sz = PZ[src], dst = 1 - src;
  const dx = PX[dst], dy = PY[dst], dz = PZ[dst];
  let m = 0;
  for (let a = 0; a < n; a++) {
    const b = a + 1 === n ? 0 : a + 1;
    const va = eixoX ? sx[a] : sz[a], vb = eixoX ? sx[b] : sz[b];
    const inA = maior ? va >= valor : va <= valor, inB = maior ? vb >= valor : vb <= valor;
    if (inA) { dx[m] = sx[a]; dy[m] = sy[a]; dz[m] = sz[a]; m++; }
    if (inA !== inB) {
      const t = (valor - va) / (vb - va);
      dx[m] = sx[a] + (sx[b] - sx[a]) * t; dy[m] = sy[a] + (sy[b] - sy[a]) * t; dz[m] = sz[a] + (sz[b] - sz[a]) * t;
      if (eixoX) dx[m] = valor; else dz[m] = valor;
      m++;
    }
  }
  return m;
}

const _A = new Float64Array(3), _B = new Float64Array(3), _C = new Float64Array(3);
function vertices(geo, id) {
  const I = geo.I;
  let ia, ib, ic;
  if (I) { ia = I.array[id * 3]; ib = I.array[id * 3 + 1]; ic = I.array[id * 3 + 2]; } else { ia = id * 3; ib = ia + 1; ic = ia + 2; }
  lePos(geo.L, ia, _A); lePos(geo.L, ib, _B); lePos(geo.L, ic, _C);
}

/* põe o triângulo `id` da geometria da grade em cada célula que ele toca */
export function addTri(g, id) {
  vertices(g.geo, id);
  const ax = _A[0], ay = _A[1], az = _A[2], bx = _B[0], by = _B[1], bz = _B[2], cx = _C[0], cy = _C[1], cz = _C[2];
  if (!Number.isFinite(ax + ay + az + bx + by + bz + cx + cy + cz)) return;
  const xa = Math.min(ax, bx, cx), xb = Math.max(ax, bx, cx), za = Math.min(az, bz, cz), zb = Math.max(az, bz, cz);
  const ya = Math.min(ay, by, cy), yb = Math.max(ay, by, cy);
  if (xa < g.x0) g.x0 = xa; if (xb > g.x1) g.x1 = xb; if (ya < g.y0) g.y0 = ya; if (yb > g.y1) g.y1 = yb;
  if (za < g.z0) g.z0 = za; if (zb > g.z1) g.z1 = zb;
  const i0 = Math.floor(xa * g.inv), i1 = Math.floor(xb * g.inv), j0 = Math.floor(za * g.inv), j1 = Math.floor(zb * g.inv);
  if (i0 === i1 && j0 === j1) { addRef(g, i0, j0, id, ya, yb, xa, xb, za, zb); return; }
  for (let i = i0; i <= i1; i++) {
    const cx0 = i * g.cel, cx1 = cx0 + g.cel;
    for (let j = j0; j <= j1; j++) {
      const cz0 = j * g.cel, cz1 = cz0 + g.cel;
      PX[0][0] = ax; PY[0][0] = ay; PZ[0][0] = az; PX[0][1] = bx; PY[0][1] = by; PZ[0][1] = bz;
      PX[0][2] = cx; PY[0][2] = cy; PZ[0][2] = cz;
      let n = recorta(0, 3, true, cx0, true);
      if (n) n = recorta(1, n, true, cx1, false);
      if (n) n = recorta(0, n, false, cz0, true);
      if (n) n = recorta(1, n, false, cz1, false);
      if (!n) continue;
      let lo = Infinity, hi = -Infinity, qx0 = Infinity, qx1 = -Infinity, qz0 = Infinity, qz1 = -Infinity;
      const xx = PX[0], yy = PY[0], zz = PZ[0];
      for (let a = 0; a < n; a++) {
        if (yy[a] < lo) lo = yy[a]; if (yy[a] > hi) hi = yy[a];
        if (xx[a] < qx0) qx0 = xx[a]; if (xx[a] > qx1) qx1 = xx[a]; if (zz[a] < qz0) qz0 = zz[a]; if (zz[a] > qz1) qz1 = zz[a];
      }
      addRef(g, i, j, id, lo, hi, qx0, qx1, qz0, qz1);
    }
  }
}

/* CONGELA a grade terminada: por bloco, uma tabela de deslocamentos e um
   fluxo com, por célula OCUPADA, um cabeçalho de 4 números de 16 bits (caixa
   XZ em 1/255 da célula e faixa de Y em 1/65535 da altura da malha, as duas
   arredondadas para FORA — os descartes nunca descartam demais) e os índices
   dos triângulos. Medido no jogo: os blocos densos de montagem da primeira
   versão somavam 15,8 MB em 2 402 blocos com 30 % das células ocupadas. */
const q8lo = (v, o, cel) => Math.max(0, Math.min(255, Math.floor((v - o) / cel * 255)));
const q8hi = (v, o, cel) => Math.max(0, Math.min(255, Math.ceil((v - o) / cel * 255)));
export function congelarGrade(g) {
  const altura = Math.max(1e-6, g.y1 - g.y0);
  const grande = g.geo.ntris > 65535;
  for (const [k, b] of g.blocos) {
    if (b.off) continue;
    const ci = Math.floor(k / 65536) - 32768, cj = (k % 65536) - 32768;
    let tot = 0;
    for (let c = 0; c < CH2; c++) if (b.lst[c]) tot += 4 + b.lst[c].length;
    const s = grande ? new Uint32Array(tot) : new Uint16Array(tot);
    const off = tot > 65535 ? new Uint32Array(CH2 + 1) : new Uint16Array(CH2 + 1);
    let w = 0;
    for (let c = 0; c < CH2; c++) {
      off[c] = w;
      const l = b.lst[c];
      if (!l) continue;
      const x0 = (ci * CH + (c & 15)) * g.cel, z0 = (cj * CH + (c >> 4)) * g.cel, bb = b.bb, yr = b.yr;
      s[w++] = q8lo(bb[4 * c], x0, g.cel) | (q8hi(bb[4 * c + 1], x0, g.cel) << 8);
      s[w++] = q8lo(bb[4 * c + 2], z0, g.cel) | (q8hi(bb[4 * c + 3], z0, g.cel) << 8);
      s[w++] = Math.max(0, Math.min(65535, Math.floor((yr[2 * c] - g.y0) / altura * 65535)));
      s[w++] = Math.max(0, Math.min(65535, Math.ceil((yr[2 * c + 1] - g.y0) / altura * 65535)));
      for (let q = 0; q < l.length; q++) s[w++] = l[q];
    }
    off[CH2] = w;
    g.blocos.set(k, { off, s });
  }
  g._k = NaN; g._b = null;
  return g;
}

/* recorte de t ∈ [t0, t1] por uma faixa [lo, hi] num eixo; devolve o novo
   par em _rt (sem alocar) ou false */
const _rt = new Float64Array(2);
function faixa(o, d, lo, hi, t0, t1) {
  if (Math.abs(d) < 1e-12) { if (o < lo || o > hi) return false; _rt[0] = t0; _rt[1] = t1; return true; }
  let u = (lo - o) / d, v = (hi - o) / d;
  if (u > v) { const s = u; u = v; v = s; }
  _rt[0] = u > t0 ? u : t0; _rt[1] = v < t1 ? v : t1;
  return _rt[0] <= _rt[1];
}

/* raio × triângulo (Möller–Trumbore), com o parâmetro do SEGMENTO: acerta
   em t ∈ [ta, tb]? Triângulo de gume (det ~0) não tem pixel: não acerta. */
function triCorta(g, id, ox, oy, oz, dx, dy, dz, ta, tb) {
  vertices(g.geo, id);
  const e1x = _B[0] - _A[0], e1y = _B[1] - _A[1], e1z = _B[2] - _A[2];
  const e2x = _C[0] - _A[0], e2y = _C[1] - _A[1], e2z = _C[2] - _A[2];
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-14) return false;
  const inv = 1 / det;
  const sx = ox - _A[0], sy = oy - _A[1], sz = oz - _A[2];
  const u = (sx * px + sy * py + sz * pz) * inv;
  if (u < -EPS_BARI || u > 1 + EPS_BARI) return false;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < -EPS_BARI || u + v > 1 + EPS_BARI) return false;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t >= ta && t <= tb;
}

/* a célula c (origem x0, z0) tem algum triângulo que o segmento acerta?
   Descartes: a caixa XZ do que a toca (encurta o trecho [t, tn]) e a faixa
   de Y. Um triângulo acertado FORA do trecho desta célula ainda é um acerto
   do segmento — vale. `mb` (caixa de correio) evita testar de novo o
   triângulo que já foi testado noutra célula nesta mesma consulta. */
function celulaCruza(g, b, c, x0, z0, ox, oy, oz, dx, dy, dz, t, tn, ta, tb) {
  const cel = g.cel;
  let bx0, bx1, bz0, bz1, ylo, yhi, q, f, s;
  if (b.off) {
    q = b.off[c]; f = b.off[c + 1];
    if (q === f) return false;
    s = b.s;
    const k = cel / 255, h = (g.y1 - g.y0) / 65535;
    bx0 = x0 + (s[q] & 255) * k; bx1 = x0 + (s[q] >>> 8) * k; bz0 = z0 + (s[q + 1] & 255) * k; bz1 = z0 + (s[q + 1] >>> 8) * k;
    ylo = g.y0 + s[q + 2] * h; yhi = g.y0 + s[q + 3] * h;
    q += 4;
  } else {
    s = b.lst[c];
    if (!s) return false;
    bx0 = b.bb[4 * c]; bx1 = b.bb[4 * c + 1]; bz0 = b.bb[4 * c + 2]; bz1 = b.bb[4 * c + 3];
    ylo = b.yr[2 * c]; yhi = b.yr[2 * c + 1];
    q = 0; f = s.length;
  }
  if (!faixa(ox, dx, bx0 - EPS, bx1 + EPS, t, tn)) return false;
  if (!faixa(oz, dz, bz0 - EPS, bz1 + EPS, _rt[0], _rt[1])) return false;
  const ya = oy + dy * _rt[0], yb = oy + dy * _rt[1];
  if ((ya < yb ? yb : ya) < ylo - EPS || (ya < yb ? ya : yb) > yhi + EPS) return false;
  const mb = g.mb, selo = g.selo;
  for (; q < f; q++) {
    const id = s[q];
    if (mb[id] === selo) continue;
    mb[id] = selo;
    if (triCorta(g, id, ox, oy, oz, dx, dy, dz, ta, tb)) return true;
  }
  return false;
}

/* O segmento O + t·D, t ∈ [ta, tb], acerta algum triângulo da grade? DDA 2D
   (Amanatides–Woo) no plano XZ, `celulaCruza` em cada célula ocupada. */
export function gradeCorta(g, ox, oy, oz, dx, dy, dz, ta, tb) {
  const m = g.cel;
  if (!(g.x1 >= g.x0)) return false;   // grade vazia
  // recorte pela caixa da grade (uma célula de folga)
  if (!faixa(ox, dx, g.x0 - m, g.x1 + m, ta, tb)) return false;
  if (!faixa(oy, dy, g.y0 - m, g.y1 + m, _rt[0], _rt[1])) return false;
  if (!faixa(oz, dz, g.z0 - m, g.z1 + m, _rt[0], _rt[1])) return false;
  const t0 = _rt[0], t1 = _rt[1];
  if (!g.mb || g.mb.length < g.geo.ntris) g.mb = new Uint32Array(Math.max(1, g.geo.ntris));
  if (++g.selo >= 0xffffffff) { g.mb.fill(0); g.selo = 1; }
  const inv = g.inv;
  let i = Math.floor((ox + dx * t0) * inv), j = Math.floor((oz + dz * t0) * inv);
  const si = dx > 0 ? 1 : dx < 0 ? -1 : 0, sj = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tdx = si ? m / Math.abs(dx) : Infinity, tdz = sj ? m / Math.abs(dz) : Infinity;
  let tmx = si ? ((si > 0 ? (i + 1) * m : i * m) - ox) / dx : Infinity;
  let tmz = sj ? ((sj > 0 ? (j + 1) * m : j * m) - oz) / dz : Infinity;
  let t = t0;
  for (let guarda = 0; guarda < 200000; guarda++) {
    const tn = Math.min(tmx, tmz, t1);
    const b = blocoDe(g, i, j, false);
    if (b && celulaCruza(g, b, (i & 15) + ((j & 15) << 4), i * m, j * m, ox, oy, oz, dx, dy, dz, t, tn, ta, tb)) return true;
    if (tn >= t1) return false;
    if (tmx < tmz) { i += si; t = tmx; tmx += tdx; } else { j += sj; t = tmz; tmz += tdz; }
  }
  return true;   // não terminou: na dúvida, bloqueia
}

/* grade inteira de uma geometria solta (teste e ferramenta) */
export function gradeDeTriangulos(cel, flat) {
  const g = criarGrade(cel, geoDeTriangulos(flat));
  for (let id = 0; id < g.geo.ntris; id++) addTri(g, id);
  return g;
}

/* ---------------- matrizes afins (colunas, como o three) ---------------- */
/* inversa da parte afim de uma 4×4 em colunas → 12 números (3×3 + t) */
export function inverteAfim(e, o, off = 0) {
  const a = e[off], b = e[off + 1], c = e[off + 2], d = e[off + 4], f = e[off + 5], g = e[off + 6],
    h = e[off + 8], k = e[off + 9], l = e[off + 10], tx = e[off + 12], ty = e[off + 13], tz = e[off + 14];
  // colunas: (a,b,c) (d,f,g) (h,k,l) — M = [[a,d,h],[b,f,k],[c,g,l]]
  const A = f * l - g * k, B = -(d * l - g * h), C = d * k - f * h;
  const det = a * A + b * B + c * C;
  if (!(Math.abs(det) > 1e-12)) return false;
  const id = 1 / det;
  const i00 = A * id, i01 = B * id, i02 = C * id;
  const i10 = -(b * l - c * k) * id, i11 = (a * l - c * h) * id, i12 = -(a * k - b * h) * id;
  const i20 = (b * g - c * f) * id, i21 = -(a * g - c * d) * id, i22 = (a * f - b * d) * id;
  // o = [linha0 | linha1 | linha2] da inversa + translação
  o[0] = i00; o[1] = i01; o[2] = i02; o[3] = i10; o[4] = i11; o[5] = i12; o[6] = i20; o[7] = i21; o[8] = i22;
  o[9] = -(i00 * tx + i01 * ty + i02 * tz); o[10] = -(i10 * tx + i11 * ty + i12 * tz); o[11] = -(i20 * tx + i21 * ty + i22 * tz);
  return true;
}
const escalaMax = (e, off = 0) => Math.sqrt(Math.max(
  e[off] * e[off] + e[off + 1] * e[off + 1] + e[off + 2] * e[off + 2],
  e[off + 4] * e[off + 4] + e[off + 5] * e[off + 5] + e[off + 6] * e[off + 6],
  e[off + 8] * e[off + 8] + e[off + 9] * e[off + 9] + e[off + 10] * e[off + 10]));

/* multiplica duas 4×4 afins em colunas (out = A·B), só a parte afim */
function multAfim(A, ao, B, bo, out) {
  for (let col = 0; col < 4; col++) {
    const b0 = B[bo + col * 4], b1 = B[bo + col * 4 + 1], b2 = B[bo + col * 4 + 2], b3 = col === 3 ? 1 : 0;
    for (let row = 0; row < 3; row++)
      out[col * 4 + row] = A[ao + row] * b0 + A[ao + 4 + row] * b1 + A[ao + 8 + row] * b2 + A[ao + 12 + row] * b3;
    out[col * 4 + 3] = col === 3 ? 1 : 0;
  }
  return out;
}

/* segmento contra caixa alinhada (mundo): t de entrada ou -1 */
function segCaixa(ex, ey, ez, dx, dy, dz, ta, tb, b) {
  let t0 = ta, t1 = tb;
  for (let a = 0; a < 3; a++) {
    const o = a === 0 ? ex : a === 1 ? ey : ez, d = a === 0 ? dx : a === 1 ? dy : dz;
    const lo = b[a], hi = b[a + 3];
    if (Math.abs(d) < 1e-12) { if (o < lo || o > hi) return false; continue; }
    let u = (lo - o) / d, v = (hi - o) / d;
    if (u > v) { const s = u; u = v; v = s; }
    if (u > t0) t0 = u; if (v < t1) t1 = v;
    if (t0 > t1) return false;
  }
  return true;
}
/* segmento contra esfera: toca? */
function segEsfera(ex, ey, ez, dx, dy, dz, ta, tb, cx, cy, cz, r) {
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 < 1e-12) return false;
  let t = ((cx - ex) * dx + (cy - ey) * dy + (cz - ez) * dz) / d2;
  t = t < ta ? ta : t > tb ? tb : t;
  const qx = ex + dx * t - cx, qy = ey + dy * t - cy, qz = ez + dz * t - cz;
  return qx * qx + qy * qy + qz * qz <= r * r;
}

/* ---------------- leitura de geometria (duck typing) ---------------- */
const MAXN = { Uint32Array: 4294967295, Uint16Array: 65535, Uint8Array: 255, Int32Array: 2147483647, Int16Array: 32767, Int8Array: 127 };
function leitorPosicao(attr) {
  if (!attr) return null;
  const inter = !!attr.isInterleavedBufferAttribute;
  const arr = inter ? attr.data && attr.data.array : attr.array;
  if (!arr) return null;
  const stride = inter ? attr.data.stride : (attr.itemSize || 3);
  const off = inter ? (attr.offset || 0) : 0;
  const norm = attr.normalized ? MAXN[arr.constructor && arr.constructor.name] || 0 : 0;
  const count = typeof attr.count === 'number' ? attr.count : Math.floor((arr.length - off) / stride);
  return { arr, stride, off, norm, count };
}
function lePos(L, i, out) {
  const p = L.off + i * L.stride;
  let x = L.arr[p], y = L.arr[p + 1], z = L.arr[p + 2];
  if (L.norm) { x = Math.max(x / L.norm, -1); y = Math.max(y / L.norm, -1); z = Math.max(z / L.norm, -1); }
  out[0] = x; out[1] = y; out[2] = z;
}
function numTris(geo) {
  if (!geo || !geo.attributes) return 0;
  const idx = geo.index;
  const L = leitorPosicao(geo.attributes.position);
  if (!L) return 0;
  return Math.floor((idx ? (idx.count || idx.array.length) : L.count) / 3);
}

/* malha que pode esconder alguém na TELA. Fica de fora (o conjunto é o que o
   pixel mostra, e o critério A2 é o pixel):
   · o que não é Mesh (Sprite, Points, Line): nome, partícula, traçante;
   · SkinnedMesh: personagem animado — a caixa do three fica CONGELADA na
     pose do primeiro pedido (CLAUDE.md), e personagem é alvo, não parede;
   · material transparente, ShaderMaterial (grama, céu, água deste jogo),
     sem cor ou sem profundidade: atrás de vidro o alvo APARECE (o pixel
     muda), então vidro não esconde ninguém;
   · malha menor que MIN_RAIO (flor, granada) e maior que MAX_TRIS (terreno —
     que tem marcha própria). */
function opaco(mt) {
  if (!mt) return false;
  if (mt.visible === false || mt.colorWrite === false || mt.depthWrite === false) return false;
  if (mt.transparent === true || (typeof mt.opacity === 'number' && mt.opacity < 1)) return false;
  if (mt.isShaderMaterial || mt.isRawShaderMaterial || mt.type === 'ShaderMaterial' || mt.type === 'RawShaderMaterial') return false;
  return true;
}
function candidata(o) {
  if (!o || !o.isMesh || o.isSkinnedMesh || o.isSprite || o.isPoints || o.isLine) return false;
  const mt = o.material;
  if (Array.isArray(mt) ? !mt.some(opaco) : !opaco(mt)) return false;
  const n = numTris(o.geometry);
  return n > 0 && n <= OCL.MAX_TRIS;
}

/* ---------------- a GRAMA desenhada ----------------
   A2 (validacao-6aeda6c.md): 1 de 33 casos da varredura com 0 px e a
   assistência agindo. Reproduzido com a âncora de pixels: alvo a 37,5 m
   atrás de uma crista, a linha do olho ao CENTRO da cabeça passa 0,188 m
   acima do chão da crista — e 0 px; ESCONDENDO A GRAMA, 24 px. O que tampava
   era a grama em cima da crista, e a regra de grama da assistência só olhava
   o pé do alvo. (A esfera da cabeça maior que o boneco não entra: a linha vai
   ao centro dela, que está dentro da cabeça desenhada.) Com o tapete já
   repreenchido em volta do atirador — a sonda do laudo mede 12 quadros depois
   de um salto, e o js/grass.js leva 57 para refazer os 169 chunks no celular
   — eram 5 dos 40 alvos com 0 px (2 com o automático disparando).

   A grama é ShaderMaterial instanciado, fora da grade de triângulos. Aqui
   cada lâmina DESENHADA é lida da matriz de instância do chunk (como está na
   tela, inclusive o chunk ainda não reciclado depois de um salto) e testada
   como o vertex shader a desenha: ponto da geometria (xg, h, 0,18·h²), xg ∈
   ±0,05·(1 − 0,82·h), levado ao mundo pela instância (tombo, giro, altura,
   largura); depois
     · vento   w·h² ao longo de `uWindDir`, |w| ≤ (0,85 + 0,275)·uWind +
               balanço 0,055 — lidos do MATERIAL a cada consulta, então
               tempestade e giro do vento valem na hora;
     · dobra   bendAway: a até `raio` do jogador/carro, o vértice é empurrado
               para FORA, na direção em que já estava (ver `dobraCobre`);
     · borda   edgeFade zera a lâmina cuja raiz passa de 0,97·uPatchRadius
               da câmera.
   Vento e dobra só ABAIXAM a lâmina (0,16·uWind·h² e 0,3·h): a altura em pé
   é o pior caso, e a faixa de h que pode estar na altura da linha sai disso.
   Uma linha que passa entre as lâminas passa; na dúvida (chunk ainda sem
   índice), o chunk inteiro cobre até a lâmina mais alta dele. */
export const GRAMA = Object.freeze({
  LAMINA: 0.49,         // m: o que a lâmina alcança da raiz sem vento (tombo 0,24 + curva 0,18 + meia-largura 0,0625)
  VENTO: 1.125,         // × uWind: amplitude do vento no shader (0,85 + 0,275)
  BALANCO: 0.055,       // m: balanço senoidal (também na direção do vento)
  MIN: 0.05,            // m: lâmina colapsada (deserto, rua, lago: 0,0001–0,02) não cobre ninguém
  FADE: 0.97,           // edgeFade: some a 0,97·uPatchRadius da câmera
  EMPURRA: Object.freeze([                    // bendAway(src, raio, força) do vertex shader
    Object.freeze({ u: 'uPlayerPos', raio: 1.5, forca: 1.05 }),
    Object.freeze({ u: 'uCarPos', raio: 3.1, forca: 1.4 }),
  ]),
  EMPURRA_DY: 3,        // m: a dobra some a 3 m de desnível (smoothstep 0,5–3,0 do shader)
  IDX: 8,               // m: célula do índice (ponto → chunks)
  CEL: 1,               // m: célula do índice de lâminas de cada chunk
});
const num = (u, def = 0) => (u && Number.isFinite(+u.value) ? +u.value : def);

/* O VENTO DO SHADER, em JS: hash12/vnoise do vertex shader do js/grass.js,
   com a aritmética de float32 do GPU (Math.fround em cada operação). É o
   `wind` do shader no ponto (x, z) do mundo (antes do vento) no tempo t:
   (vnoise(xz·0,08 + t·(0,85; 0,55)) − 0,5)·1,7 + (vnoise(xz·0,33 − t·(1,6; 0,2)) − 0,5)·0,55.
   Conferido contra o GPU de verdade, com o texto do shader do material
   compilado de novo, em test/aim-visibilidade.test.js. */
const F = Math.fround, K1 = F(0.1031), K2 = F(33.33);
const fr = x => x - Math.floor(x);
function hash12(px, py) {
  const x = fr(F(px * K1)), y = fr(F(py * K1)), z = x;
  const d = F(F(F(x * F(y + K2)) + F(y * F(z + K2))) + F(z * F(x + K2)));
  const X = F(x + d), Y = F(y + d), Z = F(z + d);
  return fr(F(F(X + Y) * Z));
}
function vnoise(px, py) {
  const ix = Math.floor(px), iy = Math.floor(py);
  let fx = px - ix, fy = py - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash12(ix, iy), b = hash12(ix + 1, iy), c = hash12(ix, iy + 1), d = hash12(ix + 1, iy + 1);
  const ab = a + (b - a) * fx, cd = c + (d - c) * fx;
  return ab + (cd - ab) * fy;
}
const V1 = F(0.08), V2 = F(0.33), T1X = F(0.85), T1Z = F(0.55), T2X = F(1.6), T2Z = F(0.2);
export function ventoGrama(x, z, t) {
  const w1 = vnoise(F(F(x * V1) + F(t * T1X)), F(F(z * V1) + F(t * T1Z)));
  const w2 = vnoise(F(F(x * V2) - F(t * T2X)), F(F(z * V2) - F(t * T2Z)));
  return (w1 - 0.5) * 1.7 + (w2 - 0.5) * 0.55;
}
/* quanto o `wind` pode mudar por metro: o vnoise muda no máximo 1,5·√2 por
   unidade de entrada (smoothstep' ≤ 1,5 nos dois eixos), vezes a frequência
   e o peso de cada oitava */
export const VENTO_LIPSCHITZ = 1.5 * Math.SQRT2 * (1.7 * 0.08 + 0.55 * 0.33);
const VENTO_FOLGA = 0.02;             // float32 do GPU (medido no teste de tela) + folga

/* ================================================================ */
export function createOclusao(deps) {
  const d = deps && typeof deps === 'object' ? deps : {};
  const raiz = d.raiz || null;
  const heightAt = typeof d.heightAt === 'function' ? d.heightAt : null;
  const ignorar = typeof d.ignorar === 'function' ? d.ignorar : () => false;
  const alvos = typeof d.alvos === 'function' ? d.alvos : () => [];
  const agora = typeof d.agora === 'function' ? d.agora : () => Date.now();
  const ehGrama = typeof d.grama === 'function' ? d.grama : () => false;   // o chunk de grama (js/grass.js)

  const regs = new Map();           // objeto → registro
  const fila = [];                  // registros a rasterizar
  const globais = new Set();        // malhas grandes demais pro índice, e as que andam
  const idx = new Map();            // célula do índice → Set de registros parados
  let ultimaVarredura = -Infinity, carimbo = 0, marca = 0;
  const stats = { malhas: 0, instancias: 0, pendentes: 0, celulas: 0, refs: 0, rasterMs: 0, raios: 0, raiosMs: 0,
    bloqueios: { terreno: 0, malha: 0, pendente: 0, grama: 0 }, gramas: 0, gramaMontagens: 0, gramaMs: 0, gramaRaios: 0 };

  const _v = new Float64Array(3);
  const _m = new Float64Array(16), _i = new Float64Array(12);

  /* ---- registro ---- */
  function raizDe(o) { let p = o; while (p.parent && p.parent !== raiz) p = p.parent; return p; }
  function registrar(o) {
    const geo = o.geometry;
    const L = leitorPosicao(geo.attributes.position);
    // caixa local (dos vértices, não do `boundingBox` guardado)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < L.count; i++) {
      lePos(L, i, _v);
      if (_v[0] < x0) x0 = _v[0]; if (_v[0] > x1) x1 = _v[0]; if (_v[1] < y0) y0 = _v[1]; if (_v[1] > y1) y1 = _v[1];
      if (_v[2] < z0) z0 = _v[2]; if (_v[2] > z1) z1 = _v[2];
    }
    if (!(x1 >= x0)) return null;
    const cxl = (x0 + x1) / 2, cyl = (y0 + y1) / 2, czl = (z0 + z1) / 2;
    const rl = Math.hypot(x1 - cxl, y1 - cyl, z1 - czl);
    const r = {
      obj: o, raiz: raizDe(o), inst: !!o.isInstancedMesh, L, idx: geo.index || null, ntris: numTris(geo),
      caixaLocal: [x0, y0, z0, x1, y1, z1], esfLocal: [cxl, cyl, czl, rl],
      grade: null, prog: 0, feito: false,
      mw: new Float64Array(16).fill(NaN), inv: new Float64Array(12), caixa: new Float64Array(6), esc: 1,
      ok: false, anda: false, quieto: 0, celIdx: null, visto: 0,
      // instâncias
      ver: -1, n: 0, iinv: null, iesf: null, iidx: null, iok: null,
    };
    const e = o.matrixWorld && o.matrixWorld.elements;
    const esc = e && escalaMax(e) > 1e-9 ? escalaMax(e) : 1;
    r.raio = rl * esc;
    // pequena demais para esconder um corpo (a instância decide por instância)
    if (!r.inst && r.raio < OCL.MIN_RAIO) { pequenas.add(o); return null; }
    /* célula no espaço LOCAL: CEL no mundo dividido pela escala do objeto, e
       nunca menos de 24 células no maior lado (a pedra é uma geometria de
       raio 1 que a instância estica até ~3,8 m: 0,25 local seria ~1 m no
       mundo) */
    const ladoL = Math.max(x1 - x0, z1 - z0);
    const celMundo = ladoL * esc > OCL.GRANDE ? OCL.CEL_GRANDE : OCL.CEL;
    // e nunca mais de 2048 células por lado: um triângulo do tamanho da malha
    // recortado célula a célula travaria o quadro (e uma geometria quantizada
    // lida sem desnormalizar vira uma malha de 130 km)
    r.grade = criarGrade(Math.max(1e-3, ladoL / 2048, Math.min(celMundo / esc, ladoL / 24)), { L, I: geo.index || null, ntris: r.ntris });
    regs.set(o, r);
    fila.push(r);
    return r;
  }
  const pequenas = new WeakSet();
  function desindexar(r) {
    if (r.celIdx) { for (const k of r.celIdx) { const s = idx.get(k); if (s) s.delete(r); } r.celIdx = null; }
    globais.delete(r);
  }
  function remover(r) { desindexar(r); regs.delete(r.obj); const i = fila.indexOf(r); if (i >= 0) fila.splice(i, 1); }

  /* pose: inversa + caixa do mundo; índice grosso só para quem está parado */
  function atualizaPose(r) {
    const e = r.obj.matrixWorld && r.obj.matrixWorld.elements;
    if (!e) { r.ok = false; return; }
    let igual = true;
    for (let i = 0; i < 16; i++) if (r.mw[i] !== e[i]) { igual = false; break; }
    if (igual && !r.inst) {
      /* parou de andar (o carro estacionou, a malha nova ganhou a primeira
         matrixWorld do render): volta para o índice, senão toda consulta a
         testa para sempre */
      if (r.anda && ++r.quieto === QUIETO) { r.anda = false; desindexar(r); indexar(r, r.caixa); }
      return;
    }
    r.quieto = 0;
    const primeira = Number.isNaN(r.mw[0]);
    for (let i = 0; i < 16; i++) r.mw[i] = e[i];
    if (r.inst) { atualizaInstancias(r, !igual); return; }
    r.ok = inverteAfim(e, r.inv);
    if (!r.ok) { desindexar(r); return; }
    caixaMundo(e, 0, r.caixaLocal, r.caixa);
    if (!primeira) r.anda = true;
    desindexar(r);
    if (r.anda) { globais.add(r); return; }
    indexar(r, r.caixa);
  }
  function caixaMundo(e, off, cl, out) {
    out[0] = out[1] = out[2] = Infinity; out[3] = out[4] = out[5] = -Infinity;
    for (let c = 0; c < 8; c++) {
      const x = c & 1 ? cl[3] : cl[0], y = c & 2 ? cl[4] : cl[1], z = c & 4 ? cl[5] : cl[2];
      const wx = e[off] * x + e[off + 4] * y + e[off + 8] * z + e[off + 12];
      const wy = e[off + 1] * x + e[off + 5] * y + e[off + 9] * z + e[off + 13];
      const wz = e[off + 2] * x + e[off + 6] * y + e[off + 10] * z + e[off + 14];
      if (wx < out[0]) out[0] = wx; if (wy < out[1]) out[1] = wy; if (wz < out[2]) out[2] = wz;
      if (wx > out[3]) out[3] = wx; if (wy > out[4]) out[4] = wy; if (wz > out[5]) out[5] = wz;
    }
  }
  function indexar(r, cx) {
    const i0 = Math.floor(cx[0] / OCL.IDX), i1 = Math.floor(cx[3] / OCL.IDX), j0 = Math.floor(cx[2] / OCL.IDX), j1 = Math.floor(cx[5] / OCL.IDX);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > OCL.IDX_MAX) { globais.add(r); return; }
    r.celIdx = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = chave(i, j);
      let s = idx.get(k);
      if (!s) { s = new Set(); idx.set(k, s); }
      s.add(r); r.celIdx.push(k);
    }
  }
  function atualizaInstancias(r, mudouObjeto) {
    const o = r.obj, im = o.instanceMatrix;
    if (!im || !im.array) { r.ok = false; return; }
    const n = Math.max(0, Math.min(o.count | 0, Math.floor(im.array.length / 16)));
    if (!mudouObjeto && im.version === r.ver && n === r.n) return;
    r.ver = im.version; r.n = n;
    if (!r.iinv || r.iinv.length < n * 12) { r.iinv = new Float32Array(Math.max(1, n) * 12); r.iesf = new Float32Array(Math.max(1, n) * 4); r.iok = new Uint8Array(Math.max(1, n)); }
    r.iidx = new Map();
    const e = r.mw, a = im.array, s = r.esfLocal;
    const caixa = r.caixa;
    caixa[0] = caixa[1] = caixa[2] = Infinity; caixa[3] = caixa[4] = caixa[5] = -Infinity;
    for (let q = 0; q < n; q++) {
      multAfim(e, 0, a, q * 16, _m);
      const esc = escalaMax(_m);
      r.iok[q] = 0;
      if (!(esc > 1e-3) || !inverteAfim(_m, _i)) continue;     // instância "escondida" (escala ~0)
      for (let z = 0; z < 12; z++) r.iinv[q * 12 + z] = _i[z];
      const cx = _m[0] * s[0] + _m[4] * s[1] + _m[8] * s[2] + _m[12];
      const cy = _m[1] * s[0] + _m[5] * s[1] + _m[9] * s[2] + _m[13];
      const cz = _m[2] * s[0] + _m[6] * s[1] + _m[10] * s[2] + _m[14];
      const rr = s[3] * esc;
      if (rr < OCL.MIN_RAIO) continue;
      r.iesf[q * 4] = cx; r.iesf[q * 4 + 1] = cy; r.iesf[q * 4 + 2] = cz; r.iesf[q * 4 + 3] = rr;
      r.iok[q] = 1;
      if (cx - rr < caixa[0]) caixa[0] = cx - rr; if (cy - rr < caixa[1]) caixa[1] = cy - rr; if (cz - rr < caixa[2]) caixa[2] = cz - rr;
      if (cx + rr > caixa[3]) caixa[3] = cx + rr; if (cy + rr > caixa[4]) caixa[4] = cy + rr; if (cz + rr > caixa[5]) caixa[5] = cz + rr;
      const i0 = Math.floor((cx - rr) / OCL.IDX), i1 = Math.floor((cx + rr) / OCL.IDX), j0 = Math.floor((cz - rr) / OCL.IDX), j1 = Math.floor((cz + rr) / OCL.IDX);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const k = chave(i, j);
        let l = r.iidx.get(k);
        if (!l) { l = []; r.iidx.set(k, l); }
        l.push(q);
      }
    }
    r.ok = true;
    globais.add(r);   // o conjunto inteiro é testado pelo índice PRÓPRIO dele (nunca vai ao grosso)
  }

  /* ---- varredura da cena ---- */
  const pilha = [], pilhaVis = [];
  const raizesAlvo = new Set();
  function varrer() {
    if (!raiz) return;
    carimbo++;
    raizesAlvo.clear();
    for (const t of alvos()) {
      if (!t) continue;
      const g = t.group || t.mesh;
      if (g) raizesAlvo.add(g);
    }
    pilha.length = 0; pilhaVis.length = 0;
    pilha.push(raiz); pilhaVis.push(raiz.visible !== false);
    /* Só REGISTRA o que está desenhado agora (a cena guarda moldes e menus
       escondidos que nunca aparecem em jogo); mas quem já foi registrado
       fica, mesmo escondido — a consulta pergunta se está desenhado, e tirar
       faria a malha que pisca (alvo do campo de tiro, porta) ser
       rasterizada de novo a cada volta */
    while (pilha.length) {
      const o = pilha.pop(), vis = pilhaVis.pop();
      if (o !== raiz && (raizesAlvo.has(o) || ignorar(o))) continue;
      if (o !== raiz && ehGrama(o)) {
        let g = gramas.get(o);
        if (!g && vis) g = registrarGrama(o);
        if (g) g.visto = carimbo;
        continue;
      }
      let r = regs.get(o);
      if (!r && vis && !pequenas.has(o) && candidata(o)) r = registrar(o);
      if (r) r.visto = carimbo;
      const ch = o.children;
      if (ch) for (let i = 0; i < ch.length; i++) { pilha.push(ch[i]); pilhaVis.push(vis && ch[i].visible !== false); }
    }
    // apagar durante a iteração de um Map é seguro (e não aloca cópia)
    for (const r of regs.values()) if (r.visto !== carimbo) remover(r);
    for (const g of gramas.values()) if (g.visto !== carimbo) { desindexarGrama(g); gramas.delete(g.obj); }
  }

  /* ---- rasterização com orçamento ---- */
  function rasterizar(r, limite) {
    const g = r.grade, total = r.ntris;
    for (; r.prog < total; r.prog++) {
      addTri(g, r.prog);
      if ((r.prog & 63) === 63 && agora() > limite) { r.prog++; return false; }
    }
    congelarGrade(g);
    r.feito = true;
    return true;
  }

  function atualizar() {
    const t0 = agora();
    if (t0 - ultimaVarredura >= OCL.REVARRER_S * 1000) { ultimaVarredura = t0; varrer(); }
    for (const r of regs.values()) atualizaPose(r);
    /* a grama reciclada (js/grass.js repreenche 3–6 chunks por quadro) é
       remontada aqui, dentro do orçamento; o que sobrar, a consulta monta */
    /* orçamento PRÓPRIO, contado daqui (a pose das malhas e das árvores
       acima pode comer os 2 ms da rasterização inteiros — medido: com isso a
       grama ficava pendente para sempre, e pendente cobre tudo), sempre pelo
       menos um chunk por quadro, e o MAIS PERTO do jogador primeiro */
    if (gramas.size) {
      const tg = agora();
      for (;;) {
        let alvo = null, dAlvo = Infinity;
        for (const g of gramas.values()) {
          if (!(g.pend || gramaVelha(g)) || !renderizado(g.obj)) continue;
          const src = uniformsDe(g).uPlayerPos, pp = src && src.value;
          const d = pp && g.chaves ? distCaixa(g, +pp.x, +pp.z) : 0;
          if (d < dAlvo) { dAlvo = d; alvo = g; }
        }
        if (!alvo) break;
        montarGrama(alvo, true);
        if (agora() - tg > OCL.ORCAMENTO_GRAMA_MS) break;
      }
    }
    if (fila.length) {
      const t1 = agora(), limite = t0 + OCL.ORCAMENTO_MS;
      while (fila.length && agora() <= limite) {
        const r = fila[0];
        if (rasterizar(r, limite)) fila.shift(); else break;
      }
      stats.rasterMs += agora() - t1;
    }
  }

  /* ---- a camada da GRAMA (ver GRAMA, acima) ---- */
  const gramas = new Map();          // chunk → registro
  const gIdx = new Map();            // célula do índice → registros cuja caixa a toca
  let gbx = new Float32Array(0), gbz = gbx, gbq = new Uint32Array(0), gcur = gbq;
  function registrarGrama(o) {
    const g = { obj: o, ver: NaN, n: -1, mw: new Float64Array(16).fill(NaN), pose: new Float64Array(26).fill(NaN), vis: true, pend: false, marca: 0,
      bx0: 0, bx1: 0, bz0: 0, bz1: 0, yMin: Infinity, yMax: -Infinity, chaves: null, visto: carimbo,
      arr: null, fase: null, lx0: 0, lz0: 0, bnx: 0, bnz: 0, off: null, ids: null, dat: null, celTopo: null };
    gramas.set(o, g);
    return g;
  }
  function uniformsDe(g) { const m = g.obj.material; return (m && m.uniforms) || {}; }
  /* A matriz com que o PRÓXIMO render desenha o chunk. O fillChunk move o
     chunk pela `position` e reescreve as instâncias na hora; a `matrixWorld`
     só é recomposta no render. Ler as instâncias NOVAS com a matriz VELHA
     punha a grama a 130 m de onde ela aparece (medido: chunk em (100, 100)
     com matrixWorld em (−30, −30) depois de 60 quadros de QA.tick). Com
     matrixAutoUpdate, compõe posição · giro · escala sob a matriz do pai. */
  const _loc = new Float64Array(16), _mund = new Float64Array(16);
  function mundoDe(o) {
    const e = o.matrixWorld && o.matrixWorld.elements;
    const p = o.position, q = o.quaternion, sc = o.scale;
    if (!o.matrixAutoUpdate || !p || !q || !sc) return e || null;
    const x = +q.x, y = +q.y, z = +q.z, w = +q.w, x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    const sx = +sc.x, sy = +sc.y, sz = +sc.z;
    _loc[0] = (1 - (yy + zz)) * sx; _loc[1] = (xy + wz) * sx; _loc[2] = (xz - wy) * sx; _loc[3] = 0;
    _loc[4] = (xy - wz) * sy; _loc[5] = (1 - (xx + zz)) * sy; _loc[6] = (yz + wx) * sy; _loc[7] = 0;
    _loc[8] = (xz + wy) * sz; _loc[9] = (yz - wx) * sz; _loc[10] = (1 - (xx + yy)) * sz; _loc[11] = 0;
    _loc[12] = +p.x; _loc[13] = +p.y; _loc[14] = +p.z; _loc[15] = 1;
    const pe = o.parent && o.parent.matrixWorld && o.parent.matrixWorld.elements;
    if (!pe) return _loc;
    return multAfim(pe, 0, _loc, 0, _mund);
  }
  /* mudou o que está desenhado? (fillChunk reescreve as matrizes e move o chunk) */
  function gramaVelha(g) {
    const o = g.obj, im = o.instanceMatrix;
    if (!im) return g.chaves !== null;
    if (im.version !== g.ver || (o.count | 0) !== g.n) return true;
    /* barato primeiro: posição/giro/escala e a matriz do pai (169 chunks por
       quadro — compor a matriz de cada um só para comparar custava ~0,07 ms) */
    const p = o.position, q = o.quaternion, sc = o.scale, c = g.pose;
    if (o.matrixAutoUpdate && p && q && sc) {
      if (p.x !== c[0] || p.y !== c[1] || p.z !== c[2] || q.x !== c[3] || q.y !== c[4] || q.z !== c[5] || q.w !== c[6] ||
        sc.x !== c[7] || sc.y !== c[8] || sc.z !== c[9]) return true;
      const pe = o.parent && o.parent.matrixWorld && o.parent.matrixWorld.elements;
      if (pe) for (let i = 0; i < 16; i++) if (pe[i] !== c[10 + i]) return true;
      return false;
    }
    const e = mundoDe(o);
    if (!e) return g.chaves !== null;
    for (let i = 0; i < 16; i++) if (e[i] !== g.mw[i]) return true;
    return false;
  }
  function guardaPose(g) {
    const o = g.obj, p = o.position, q = o.quaternion, sc = o.scale, c = g.pose;
    if (!(o.matrixAutoUpdate && p && q && sc)) return;
    c[0] = p.x; c[1] = p.y; c[2] = p.z; c[3] = q.x; c[4] = q.y; c[5] = q.z; c[6] = q.w; c[7] = sc.x; c[8] = sc.y; c[9] = sc.z;
    const pe = o.parent && o.parent.matrixWorld && o.parent.matrixWorld.elements;
    for (let i = 0; i < 16; i++) c[10 + i] = pe ? pe[i] : NaN;
  }
  function desindexarGrama(g) {
    if (!g.chaves) return;
    for (const k of g.chaves) { const l = gIdx.get(k); if (l) { const i = l.indexOf(g); if (i >= 0) l.splice(i, 1); if (!l.length) gIdx.delete(k); } }
    g.chaves = null;
  }
  function indexarGrama(g) {
    // o mesmo array a cada remontagem: o js/grass.js recicla chunks o tempo todo
    g.chaves = g.chavesBuf || (g.chavesBuf = []);
    g.chaves.length = 0;
    const I = GRAMA.IDX;
    for (let i = Math.floor(g.bx0 / I), i1 = Math.floor(g.bx1 / I); i <= i1; i++)
      for (let j = Math.floor(g.bz0 / I), j1 = Math.floor(g.bz1 / I); j <= j1; j++) {
        const k = chave(i, j);
        let l = gIdx.get(k);
        if (!l) { l = []; gIdx.set(k, l); }
        l.push(g); g.chaves.push(k);
      }
  }
  /* distância horizontal de (x, z) até a caixa das lâminas do chunk (0 dentro) */
  function distCaixa(g, x, z) {
    const dx = x < g.bx0 ? g.bx0 - x : x > g.bx1 ? x - g.bx1 : 0, dz = z < g.bz0 ? g.bz0 - z : z > g.bz1 ? z - g.bz1 : 0;
    return Math.sqrt(dx * dx + dz * dz);
  }
  /* Lê as lâminas do chunk. `completa` = falso: só a caixa e a lâmina mais
     alta, e o chunk fica PENDENTE — na consulta ele cobre, inteiro, até ela
     (na dúvida, não assiste). Completa: índice por célula de CEL m e, por
     lâmina, o descarte barato (topo e o círculo que a contém parada). O
     js/grass.js recicla até 3 chunks por quadro no celular; o `atualizar`
     completa o mais perto do jogador primeiro, com orçamento próprio. */
  function montarGrama(g, completa) {
    const t0 = agora();
    stats.gramaMontagens++;
    const o = g.obj, im = o.instanceMatrix, a = im && im.array, e = mundoDe(o);
    desindexarGrama(g);
    g.ver = im ? im.version : NaN; g.n = o.count | 0;
    if (e) for (let i = 0; i < 16; i++) g.mw[i] = e[i];
    guardaPose(g);
    g.pend = false; g.arr = null; g.yMin = Infinity; g.yMax = -Infinity;
    const n = a && e ? Math.max(0, Math.min(o.count | 0, Math.floor(a.length / 16))) : 0;
    if (gbx.length < n) { gbx = new Float32Array(n); gbz = new Float32Array(n); gbq = new Uint32Array(n); }
    const bx = gbx, bz = gbz, bq = gbq, MIN = GRAMA.MIN;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, yLo = Infinity, yHi = -Infinity, m = 0;
    const M = g.mw;
    const e0 = M[0], e1 = M[1], e2 = M[2], e4 = M[4], e5 = M[5], e6 = M[6], e8 = M[8], e9 = M[9], e10 = M[10], e12 = M[12], e13 = M[13], e14 = M[14];
    for (let q = 0, k = 0; q < n; q++, k += 16) {
      const lx = a[k + 12], ly = a[k + 13], lz = a[k + 14], ax = a[k + 4], ay = a[k + 5], az = a[k + 6];
      // raiz no mundo, e o eixo Y da lâmina no mundo (a geometria vai de y = 0 a 1)
      const wx = e0 * lx + e4 * ly + e8 * lz + e12, wy = e1 * lx + e5 * ly + e9 * lz + e13, wz = e2 * lx + e6 * ly + e10 * lz + e14;
      const cx = e0 * ax + e4 * ay + e8 * az, cy = e1 * ax + e5 * ay + e9 * az, cz = e2 * ax + e6 * ay + e10 * az;
      const sLen = Math.sqrt(cx * cx + cy * cy + cz * cz);
      const soma = wx + wy + wz;
      if (!(sLen >= MIN) || soma !== soma || Math.abs(soma) === Infinity) continue;
      bx[m] = wx; bz[m] = wz; bq[m] = q; m++;
      if (wx < x0) x0 = wx; if (wx > x1) x1 = wx; if (wz < z0) z0 = wz; if (wz > z1) z1 = wz;
      if (wy < yLo) yLo = wy;
      if (wy + sLen + 0.05 > yHi) yHi = wy + sLen + 0.05;    // + a curva e a largura inclinadas
    }
    g.yMin = yLo; g.yMax = yHi;
    if (m) {
      const R = GRAMA.LAMINA;
      g.bx0 = x0 - R; g.bx1 = x1 + R; g.bz0 = z0 - R; g.bz1 = z1 + R;
      indexarGrama(g);
      if (!completa) { g.pend = true; stats.gramaMs += agora() - t0; return; }
      const CB = GRAMA.CEL, bnx = Math.floor((x1 - x0) / CB) + 1, bnz = Math.floor((z1 - z0) / CB) + 1, bt = bnx * bnz;
      const off = g.off && g.off.length >= bt + 1 ? g.off : new Uint32Array(bt + 1);
      const ids = g.ids && g.ids.length >= m ? g.ids : new Uint32Array(m);
      const dat = g.dat && g.dat.length >= 4 * m ? g.dat : new Float32Array(4 * m);
      const cel = g.celTopo && g.celTopo.length >= bt ? g.celTopo : new Float32Array(bt);
      if (gcur.length < bt) gcur = new Uint32Array(bt);
      off.fill(0, 0, bt + 1);
      for (let q = 0; q < m; q++) off[Math.floor((bz[q] - z0) / CB) * bnx + Math.floor((bx[q] - x0) / CB) + 1]++;
      for (let c = 0; c < bt; c++) { off[c + 1] += off[c]; gcur[c] = off[c]; }
      for (let q = 0; q < m; q++) ids[gcur[Math.floor((bz[q] - z0) / CB) * bnx + Math.floor((bx[q] - x0) / CB)]++] = bq[q];
      cel.fill(-Infinity, 0, bt);
      for (let c = 0; c < bt; c++) for (let f = off[c]; f < off[c + 1]; f++) {
        const k = ids[f] * 16;
        const Bx = e0 * a[k + 12] + e4 * a[k + 13] + e8 * a[k + 14] + e12, By = e1 * a[k + 12] + e5 * a[k + 13] + e9 * a[k + 14] + e13,
          Bz = e2 * a[k + 12] + e6 * a[k + 13] + e10 * a[k + 14] + e14;
        const c0x = e0 * a[k] + e4 * a[k + 1] + e8 * a[k + 2], c0y = e1 * a[k] + e5 * a[k + 1] + e9 * a[k + 2], c0z = e2 * a[k] + e6 * a[k + 1] + e10 * a[k + 2];
        const c1x = e0 * a[k + 4] + e4 * a[k + 5] + e8 * a[k + 6], c1y = e1 * a[k + 4] + e5 * a[k + 5] + e9 * a[k + 6], c1z = e2 * a[k + 4] + e6 * a[k + 5] + e10 * a[k + 6];
        const c2x = e0 * a[k + 8] + e4 * a[k + 9] + e8 * a[k + 10], c2y = e1 * a[k + 8] + e5 * a[k + 9] + e9 * a[k + 10], c2z = e2 * a[k + 8] + e6 * a[k + 9] + e10 * a[k + 10];
        const px = c1x + 0.18 * c2x, pz = c1z + 0.18 * c2z;
        const topo = By + Math.max(0, c1y) + 0.18 * Math.max(0, c2y) + 0.05 * Math.abs(c0y);
        dat[4 * f] = topo;
        dat[4 * f + 1] = Bx + px / 2; dat[4 * f + 2] = Bz + pz / 2;
        dat[4 * f + 3] = Math.sqrt(px * px + pz * pz) / 2 + 0.045 * Math.sqrt(c2x * c2x + c2z * c2z) +
          0.05 * Math.sqrt(c0x * c0x + c0y * c0y + c0z * c0z) + 0.02;
        if (topo > cel[c]) cel[c] = topo;
      }
      g.off = off; g.ids = ids; g.dat = dat; g.celTopo = cel; g.lx0 = x0; g.lz0 = z0; g.bnx = bnx; g.bnz = bnz; g.arr = a;
      const ap = o.geometry && o.geometry.attributes && o.geometry.attributes.aPhase;
      g.fase = ap && ap.array && ap.array.length >= n ? ap.array : null;
    }
    stats.gramaMs += agora() - t0;
  }
  const ultGrama = { t: 0, y: 0, via: -1, lamina: -1, obj: null, col: null, raiz: null, h: null, dist: 0, meia: 0, W: 0 };   // QA: onde a última consulta foi coberta (m do olho, altura, -1 lâmina / 0 jogador / 1 carro)
  /* O vento: |w| ≤ W ao longo de `uWindDir` (sem direção no material:
     qualquer direção — um disco). */
  const vv = { W: 0, dx: 0, dz: 0, iso: false, uWind: 0, t: NaN };
  function ventoDe(u) {
    vv.uWind = Math.max(0, num(u.uWind));
    vv.W = Math.max(0, GRAMA.VENTO * vv.uWind + GRAMA.BALANCO);
    vv.t = num(u.uTime, NaN);             // o tempo que o shader usa (sem ele, o vento é só a cota)
    const d = u.uWindDir && u.uWindDir.value, L = d ? Math.hypot(+d.x, +d.y) : 0;
    vv.iso = !(L > 1e-9);
    if (!vv.iso) { vv.dx = d.x / L; vv.dz = d.y / L; }
  }
  /* ---- a lâmina, como o shader a desenha ----
     Polígono de consulta em QP (x, z): o trecho da linha em volta da amostra
     (2 pontos) ou, dentro do disco de uma dobra, o leque empurrador → trecho
     (3 pontos). A lâmina cobre se a região que o material dela pode ocupar na
     faixa de altura da linha chega a menos da meia-largura dele do polígono. */
  const QP = new Float64Array(6), PG = new Float64Array(8), _pend = [];
  let eyeY = 0;                                   // a altura do olho da consulta (o edgeFade mede em 3D)
  const fadeIni2 = (0.72 / GRAMA.FADE) * (0.72 / GRAMA.FADE);   // edgeFade começa a 0,72·uPatchRadius
  // a dobra em teste (dobraCobre): o empurrador, o raio e a força — `empR` 0 = nenhuma
  let empX = 0, empY = 0, empZ = 0, empR = 0, empF = 0, empYlo = 0, empYhi = 0;
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let qn = 2, gMarca = 0;
  const orient = (ax, az, bx, bz, cx, cz) => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  function ptSeg2(px, pz, ax, az, bx, bz) {
    const vx = bx - ax, vz = bz - az, L = vx * vx + vz * vz;
    let t = L > 0 ? ((px - ax) * vx + (pz - az) * vz) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + vx * t - px, qz = az + vz * t - pz;
    return qx * qx + qz * qz;
  }
  function segSeg2(ax, az, bx, bz, cx, cz, dx, dz) {
    const o1 = orient(ax, az, bx, bz, cx, cz), o2 = orient(ax, az, bx, bz, dx, dz);
    const o3 = orient(cx, cz, dx, dz, ax, az), o4 = orient(cx, cz, dx, dz, bx, bz);
    if (o1 * o2 < 0 && o3 * o4 < 0) return 0;
    return Math.min(ptSeg2(ax, az, cx, cz, dx, dz), ptSeg2(bx, bz, cx, cz, dx, dz),
      ptSeg2(cx, cz, ax, az, bx, bz), ptSeg2(dx, dz, ax, az, bx, bz));
  }
  // ponto dentro de polígono convexo (qualquer sentido); polígono degenerado: nunca
  function dentro(px, pz, P, n) {
    let pos = false, neg = false;
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      const o = orient(P[2 * i], P[2 * i + 1], P[2 * j], P[2 * j + 1], px, pz);
      if (o > 1e-12) pos = true; else if (o < -1e-12) neg = true;
      if (pos && neg) return false;
    }
    return pos !== neg;
  }
  // distância² entre os convexos QP (qn pontos) e PG (4 pontos); 0 se se tocam
  function distQP2() {
    for (let i = 0; i < qn; i++) if (dentro(QP[2 * i], QP[2 * i + 1], PG, 4)) return 0;
    if (qn === 3) for (let i = 0; i < 4; i++) if (dentro(PG[2 * i], PG[2 * i + 1], QP, 3)) return 0;
    let d = Infinity;
    const ne = qn === 2 ? 1 : 3;
    for (let i = 0; i < ne; i++) {
      const j = i + 1 === qn ? 0 : i + 1;
      for (let a = 0; a < 4; a++) {
        const b = a === 3 ? 0 : a + 1;
        const v = segSeg2(QP[2 * i], QP[2 * i + 1], QP[2 * j], QP[2 * j + 1], PG[2 * a], PG[2 * a + 1], PG[2 * b], PG[2 * b + 1]);
        if (v < d) { d = v; if (d === 0) return 0; }
      }
    }
    return d;
  }
  function distPontoQP2(px, pz) {
    if (qn === 3 && dentro(px, pz, QP, 3)) return 0;
    let d = Infinity;
    const ne = qn === 2 ? 1 : 3;
    for (let i = 0; i < ne; i++) {
      const j = i + 1 === qn ? 0 : i + 1;
      const v = ptSeg2(px, pz, QP[2 * i], QP[2 * i + 1], QP[2 * j], QP[2 * j + 1]);
      if (v < d) d = v;
    }
    return d;
  }
  /* A lâmina q do chunk g na faixa de altura [yMin, yMax]: acima de h1 ela
     está acima da linha mesmo abaixada pelo vento (0,16·W·h²), abaixo de h0
     não chega nela (cotas com h² ≤ h, conservadoras). A curva do centro de h0
     a h1 fica a no máximo a flecha da corda; o vento leva o ponto h por
     w·h² ≤ W·h1². Região: paralelogramo corda ⊕ [−W·h1², W·h1²]·dir,
     engordado pela meia-largura e pela flecha. */
  const FATIAS = 3;      // a faixa de h em pedaços: cada pedaço com o deslocamento do vento DELE (w·h²)
  function laminaCobre(g, q, yMin, yMax, ex, ez, lim2) {
    const a = g.arr, M = g.mw, k = q * 16;
    const lx = a[k + 12], ly = a[k + 13], lz = a[k + 14];
    const Bx = M[0] * lx + M[4] * ly + M[8] * lz + M[12], By = M[1] * lx + M[5] * ly + M[9] * lz + M[13],
      Bz = M[2] * lx + M[6] * ly + M[10] * lz + M[14];
    if ((Bx - ex) * (Bx - ex) + (Bz - ez) * (Bz - ez) > lim2) return false;   // edgeFade: raiz fora do tapete desenhado
    /* na FAIXA DO edgeFade (raiz a mais de 0,72·uPatchRadius da câmera, em 3D
       como o shader mede) a lâmina encolhe em x e y mas o vento e a curva
       seguem o h da geometria: o ponto na altura da linha tem h MAIOR e anda
       mais. Ali, a lâmina inteira (h de 0 a 1) — conservador, e só na borda */
    const noFade = (Bx - ex) * (Bx - ex) + (By - eyeY) * (By - eyeY) + (Bz - ez) * (Bz - ez) > lim2 * fadeIni2;
    const c0x = M[0] * a[k] + M[4] * a[k + 1] + M[8] * a[k + 2], c0y = M[1] * a[k] + M[5] * a[k + 1] + M[9] * a[k + 2],
      c0z = M[2] * a[k] + M[6] * a[k + 1] + M[10] * a[k + 2];
    const c1x = M[0] * a[k + 4] + M[4] * a[k + 5] + M[8] * a[k + 6], c1y = M[1] * a[k + 4] + M[5] * a[k + 5] + M[9] * a[k + 6],
      c1z = M[2] * a[k + 4] + M[6] * a[k + 5] + M[10] * a[k + 6];
    const c2x = M[0] * a[k + 8] + M[4] * a[k + 9] + M[8] * a[k + 10], c2y = M[1] * a[k + 8] + M[5] * a[k + 9] + M[9] * a[k + 10],
      c2z = M[2] * a[k + 8] + M[6] * a[k + 9] + M[10] * a[k + 10];
    const larg = 0.05 * Math.abs(c0y), c0 = Math.sqrt(c0x * c0x + c0y * c0y + c0z * c0z), c2h = Math.sqrt(c2x * c2x + c2z * c2z);
    const c2a = 0.18 * Math.abs(c2y), den = c1y + c2a;
    /* a faixa de h em que a lâmina pode estar na altura da linha: abaixo de
       h0 ela não chega; acima de h1 ela está acima mesmo abaixada pelo vento
       (0,16·|wind|·uWind·h²). Cotas com h² ≤ h, conservadoras */
    let h0 = den > 1e-9 ? (yMin - By - larg) / den : 0;
    h0 = noFade ? 0 : h0 < 0 ? 0 : h0 > 1 ? 1 : h0;
    const faixaH1 = baixa => {
      const d1 = c1y - c2a - baixa;
      const h = d1 > 1e-9 ? (yMax - By + larg) / d1 : 1;
      return h < h0 ? h0 : h > 1 ? 1 : h;
    };
    let h1 = noFade ? 1 : faixaH1(0.16 * GRAMA.VENTO * vv.uWind);
    /* O VENTO desta lâmina, como o shader o calcula: `wind` no meio da corda
       da faixa (± o quanto ele muda até o ponto mais longe dela, ± o
       float32), mais o balanço dela (aPhase): D = wind·uWind + balanço, e o
       ponto h anda D·h² ao longo de uWindDir. Sem o tempo ou a fase no
       material, D ∈ ±W (a cota inteira). */
    let Dlo = -vv.W, Dhi = vv.W, rDisco = 0;
    const fase = g.fase;
    if (vv.iso) { Dlo = Dhi = 0; rDisco = vv.W; } else if (vv.t === vv.t && fase && q < fase.length) {
      const q0x = Bx + c1x * h0 + 0.18 * h0 * h0 * c2x, q0z = Bz + c1z * h0 + 0.18 * h0 * h0 * c2z;
      const q1x = Bx + c1x * h1 + 0.18 * h1 * h1 * c2x, q1z = Bz + c1z * h1 + 0.18 * h1 * h1 * c2z;
      const alcance = Math.sqrt((q1x - q0x) * (q1x - q0x) + (q1z - q0z) * (q1z - q0z)) / 2 +
        0.18 * c2h * (h1 - h0) * (h1 - h0) / 4 + 0.05 * c0 + 0.02;
      const w = ventoGrama((q0x + q1x) / 2, (q0z + q1z) / 2, vv.t), tol = VENTO_LIPSCHITZ * alcance + VENTO_FOLGA;
      const sw = Math.sin(F(F(vv.t * F(2.3)) + F(fase[q] * F(6.2831)))) * 0.055;
      Dlo = (w - tol) * vv.uWind + sw - 0.001; Dhi = (w + tol) * vv.uWind + sw + 0.001;
      // o vento DESTE instante abaixa só 0,16·|wind|·uWind: a faixa de h fecha
      if (!noFade) h1 = faixaH1(0.16 * Math.max(Math.abs(w - tol), Math.abs(w + tol)) * vv.uWind);
    }
    const n = h1 - h0 > 0.02 ? FATIAS : 1;
    for (let f = 0; f < n; f++) {
      const ha = h0 + (h1 - h0) * f / n, hb = h0 + (h1 - h0) * (f + 1) / n, ha2 = ha * ha, hb2 = hb * hb;
      const q0x = Bx + c1x * ha + 0.18 * ha2 * c2x, q0z = Bz + c1z * ha + 0.18 * ha2 * c2z;
      const q1x = Bx + c1x * hb + 0.18 * hb2 * c2x, q1z = Bz + c1z * hb + 0.18 * hb2 * c2z;
      const meia = 0.05 * (1 - 0.82 * ha) * c0 + 0.18 * c2h * (hb - ha) * (hb - ha) / 4 + 0.01;
      const dA = Math.min(Dlo * ha2, Dlo * hb2), dB = Math.max(Dhi * ha2, Dhi * hb2);
      const ax = vv.dx * dA, az = vv.dz * dA, bx = vv.dx * dB, bz = vv.dz * dB;
      PG[0] = q0x + ax; PG[1] = q0z + az; PG[2] = q1x + ax; PG[3] = q1z + az;
      PG[4] = q1x + bx; PG[5] = q1z + bz; PG[6] = q0x + bx; PG[7] = q0z + bz;
      const m = meia + rDisco * hb2;
      if (empR > 0) {
        /* dentro da DOBRA: o vértice só vai para FORA, e da distância d do
           empurrador a no máximo d + força·(1 − smoothstep(0, raio, d)). E o
           empurrão e a descida andam JUNTOS: ele desce 0,3·k e sai força·k (o
           mesmo k = falloff·h·vf do shader) — para cair na altura da linha,
           desce o quanto estava acima dela, e sai força/0,3 vezes isso. Se o
           que a lâmina ocupa não chega, assim empurrado, à faixa de
           distâncias do trecho [A, B], ela não cobre o trecho */
        let dLo = Infinity, dHi = 0;
        if (dentro(empX, empZ, PG, 4)) dLo = 0;
        for (let i = 0; i < 4; i++) {
          const j = i === 3 ? 0 : i + 1;
          const e2 = ptSeg2(empX, empZ, PG[2 * i], PG[2 * i + 1], PG[2 * j], PG[2 * j + 1]);
          if (e2 < dLo * dLo) dLo = Math.sqrt(e2);
          const v = Math.hypot(PG[2 * i] - empX, PG[2 * i + 1] - empZ);
          if (v > dHi) dHi = v;
        }
        dLo = Math.max(0, dLo - m); dHi += m;
        /* k = falloff(d)·h·vf(desnível) — o shader o FIXA para cada vértice:
           entre o menor (mais longe, mais baixo na lâmina, maior desnível) e o
           maior. Quem está perto do jogador É empurrado, não pode ficar onde
           estava */
        const yb0 = By + (c1y - c2a) * ha - larg - 0.16 * GRAMA.VENTO * vv.uWind * hb2, yb1 = By + (c1y + c2a) * hb + larg;
        const dy0 = yb0 - empY, dy1 = yb1 - empY;
        const dyMin = dy0 > 0 ? dy0 : dy1 < 0 ? -dy1 : 0, dyMax = Math.max(Math.abs(dy0), Math.abs(dy1));
        const kLo = (1 - sstep(0, empR, dHi)) * ha * (1 - sstep(0.5, 3.0, dyMax)),
          kHi = (1 - sstep(0, empR, dLo)) * hb * (1 - sstep(0.5, 3.0, dyMin));
        const r = empF / 0.3;
        const eMin = Math.max(empF * kLo, r * (yb0 - empYhi)), eMax = Math.min(empF * kHi, r * (yb1 - empYlo));
        if (eMax < eMin) continue;
        const rMin = Math.sqrt(ptSeg2(empX, empZ, QP[2], QP[3], QP[4], QP[5])),
          rMax = Math.max(Math.hypot(QP[2] - empX, QP[3] - empZ), Math.hypot(QP[4] - empX, QP[5] - empZ));
        if (dHi + eMax < rMin || dLo + eMin > rMax) continue;
      }
      const d2 = distQP2();
      if (d2 > m * m) continue;
      ultGrama.lamina = q; ultGrama.obj = g.obj; ultGrama.raiz = [Bx, By, Bz]; ultGrama.h = [ha, hb];
      ultGrama.dist = Math.sqrt(d2); ultGrama.meia = m; ultGrama.W = (dB - dA) / 2;
      return true;
    }
    return false;
  }
  /* Alguma lâmina desenhada cobre o polígono QP na faixa [yMin, yMax]? Os
     chunks que o índice põe perto; a célula cuja lâmina mais alta não chega a
     yMin é pulada inteira; a lâmina, pelo topo e pelo círculo (+ vento) antes
     do teste. O PENDENTE cobre a caixa dele inteira até a mais alta. */
  function laminasCobrem(yMin, yMax, ex, ez) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < qn; i++) {
      const x = QP[2 * i], z = QP[2 * i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    const R = GRAMA.LAMINA + vv.W + 0.05, I = GRAMA.IDX, CB = GRAMA.CEL, Wp = vv.W + 0.01;
    x0 -= R; x1 += R; z0 -= R; z1 += R;
    /* chunk PENDENTE no caminho: monta agora (no máximo os que a linha toca —
       medido: sem isso, logo depois de um salto o chunk por montar cobria a
       caixa inteira e o alvo visível ao lado do caminhão perdia a assistência) */
    gMarca++;
    _pend.length = 0;
    for (let ci = Math.floor(x0 / I), ci1 = Math.floor(x1 / I); ci <= ci1; ci++)
      for (let cj = Math.floor(z0 / I), cj1 = Math.floor(z1 / I); cj <= cj1; cj++) {
        const l = gIdx.get(chave(ci, cj));
        if (l) for (let a = 0; a < l.length; a++) { const g = l[a]; if (g.marca !== gMarca) { g.marca = gMarca; if (g.vis && (g.pend || !g.arr)) _pend.push(g); } }
      }
    for (let a = 0; a < _pend.length; a++) montarGrama(_pend[a], true);
    gMarca++;
    for (let ci = Math.floor(x0 / I), ci1 = Math.floor(x1 / I); ci <= ci1; ci++)
      for (let cj = Math.floor(z0 / I), cj1 = Math.floor(z1 / I); cj <= cj1; cj++) {
        const l = gIdx.get(chave(ci, cj));
        if (!l) continue;
        for (let a = 0; a < l.length; a++) {
          const g = l[a];
          if (g.marca === gMarca || !g.vis || g.yMax <= yMin) continue;
          g.marca = gMarca;
          if (g.bx1 + vv.W < x0 + R || g.bx0 - vv.W > x1 - R || g.bz1 + vv.W < z0 + R || g.bz0 - vv.W > z1 - R) continue;
          if (g.pend || !g.arr) return true;
          const lim = GRAMA.FADE * num(uniformsDe(g).uPatchRadius, Infinity), lim2 = lim * lim;
          const i0 = Math.max(0, Math.floor((x0 - g.lx0) / CB)), i1 = Math.min(g.bnx - 1, Math.floor((x1 - g.lx0) / CB));
          const j0 = Math.max(0, Math.floor((z0 - g.lz0) / CB)), j1 = Math.min(g.bnz - 1, Math.floor((z1 - g.lz0) / CB));
          const dat = g.dat, off = g.off, cel = g.celTopo;
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            const c = j * g.bnx + i;
            if (cel[c] <= yMin) continue;                                        // nenhuma lâmina da célula chega
            for (let f = off[c], ff = off[c + 1]; f < ff; f++) {
              if (dat[4 * f] <= yMin) continue;                                  // a ponta não chega à linha
              const rr = dat[4 * f + 3] + Wp;
              if (distPontoQP2(dat[4 * f + 1], dat[4 * f + 2]) > rr * rr) continue;   // longe demais, até com vento
              if (laminaCobre(g, g.ids[f], yMin, yMax, ex, ez, lim2)) return true;
            }
          }
        }
      }
    return false;
  }
  /* A DOBRA (bendAway) é RADIAL: o shader empurra cada vértice para longe do
     jogador/carro, na mesma direção em que ele já estava, e o vértice que
     estava a `d` termina a d + força·(1 − smoothstep(0, raio, d)) — que nunca
     passa de `raio` (conta: do jogador, o vértice a 1,4 m vai a 1,414 m; do
     carro, o a 2,8 m vai a 2,84 m). Então dentro do disco da dobra a lâmina
     que chega ao trecho [A, B] veio, depois do vento, do LEQUE empurrador →
     trecho, mais perto do empurrador; fora do disco a dobra não põe nada.
     E a dobra só ABAIXA (0,3·h): antes dela a lâmina estava até 0,3 m acima. */
  function dobraCobre(y, yTopo, ax, az, bx, bz, ex, ez, u, yMin, yMax) {
    for (let q = 0; q < GRAMA.EMPURRA.length; q++) {
      const E = GRAMA.EMPURRA[q], src = u[E.u] && u[E.u].value;
      if (!src || !Number.isFinite(src.x + src.y + src.z)) continue;
      // a dobra some a 3 m de desnível entre o vértice e o empurrador
      if (!(src.y > yMin - GRAMA.EMPURRA_DY) || !(src.y < yMax + GRAMA.EMPURRA_DY)) continue;
      // o trecho [A, B] inteiro fora do disco da dobra: ela não põe nada ali
      if (ptSeg2(+src.x, +src.z, ax, az, bx, bz) > E.raio * E.raio) continue;
      QP[0] = +src.x; QP[1] = +src.z; QP[2] = ax; QP[3] = az; QP[4] = bx; QP[5] = bz; qn = 3;
      // duas dobras no mesmo trecho somam: aí só o leque, sem a faixa radial de uma só
      if (dobras < 2) { empX = +src.x; empY = +src.y; empZ = +src.z; empR = E.raio; empF = E.forca; empYlo = y; empYhi = yTopo; }
      const cobre = laminasCobrem(y, yTopo + 0.3, ex, ez);
      empR = 0;
      if (cobre) { ultGrama.via = q; return true; }
    }
    return false;
  }
  /* quantas dobras ativas alcançam o trecho [A, B], e se ele está INTEIRO
     dentro de alguma (aí todo vértice ali passou pela dobra, e o teste da
     dobra — que inclui empurrão zero — é o teste inteiro) */
  let dobras = 0, dentroDeDobra = false;
  function contaDobras(ax, az, bx, bz, u, yMin, yMax) {
    dobras = 0; dentroDeDobra = false;
    for (let q = 0; q < GRAMA.EMPURRA.length; q++) {
      const E = GRAMA.EMPURRA[q], src = u[E.u] && u[E.u].value;
      if (!src || !Number.isFinite(src.x + src.y + src.z)) continue;
      if (!(src.y > yMin - GRAMA.EMPURRA_DY) || !(src.y < yMax + GRAMA.EMPURRA_DY)) continue;
      if (ptSeg2(+src.x, +src.z, ax, az, bx, bz) > E.raio * E.raio) continue;
      dobras++;
      if (Math.max(Math.hypot(ax - src.x, az - src.z), Math.hypot(bx - src.x, bz - src.z)) <= E.raio) dentroDeDobra = true;
    }
  }
  /* O segmento olho → ponto `p` passa por onde a grama DESENHADA está?
     Do plano próximo (como o `tampa`) até r/2 antes do centro da parte —
     dentro dela para qualquer giro do boneco —, em trechos de PASSO_TERRENO.
     Verdadeiro = a linha NÃO prova que o ponto aparece na tela. Não é oclusão
     de tiro: o `tampa` segue sem grama. */
  function gramaCobre(e, p, r) {
    if (!gramas.size) return false;
    const t0 = agora();
    stats.gramaRaios++;
    let yMin = Infinity, yMax = -Infinity, uRef = null;
    for (const g of gramas.values()) {
      g.vis = renderizado(g.obj);
      if (!g.vis) continue;
      if (gramaVelha(g)) montarGrama(g, false);        // só a caixa: a consulta monta o que tocar
      if (!g.chaves) continue;
      if (g.yMax > yMax) yMax = g.yMax;
      if (g.yMin < yMin) yMin = g.yMin;
      if (!uRef) uRef = uniformsDe(g);
    }
    const ex = +e.x, ey = +e.y, ez = +e.z;
    eyeY = ey;
    const dx = p.x - ex, dy = p.y - ey, dz = p.z - ez;
    const len = Math.hypot(dx, dy, dz);
    let res = false;
    if (len > 1e-3 && uRef) {
      ventoDe(uRef);
      const ta = Math.min(1, OCL.PULO_OLHO / len), tb = Math.max(0, (len - Math.max(0, +r || 0) / 2) / len);
      const passo = OCL.PASSO_TERRENO / len;
      for (let tA = ta; !res && tA < tb; tA += passo) {
        const tB = Math.min(tb, tA + passo);
        const yA = ey + dy * tA, yB = ey + dy * tB, yLo = Math.min(yA, yB), yHi = Math.max(yA, yB);
        if (yLo >= yMax) continue;                     // acima da lâmina mais alta do tapete
        const ax = ex + dx * tA, az = ez + dz * tA, bx = ex + dx * tB, bz = ez + dz * tB;
        ultGrama.via = -1;
        contaDobras(ax, az, bx, bz, uRef, yMin, yMax);
        QP[0] = ax; QP[1] = az; QP[2] = bx; QP[3] = bz; qn = 2;
        res = (!(dentroDeDobra && dobras === 1) && laminasCobrem(yLo, yHi, ex, ez)) ||
          dobraCobre(yLo, yHi, ax, az, bx, bz, ex, ez, uRef, yMin, yMax);
        if (res) { ultGrama.t = tA * len; ultGrama.y = yLo; }
      }
    }
    if (res) stats.bloqueios.grama++;
    stats.raiosMs += agora() - t0;
    return res;
  }

  /* ---- consulta ---- */
  const _cand = [];
  function renderizado(o) {
    for (let p = o, i = 0; p && i < 64; p = p.parent, i++) {
      if (p.visible === false) return false;
      if (p === raiz) return true;
    }
    return false;
  }
  function testaReg(r, ex, ey, ez, dx, dy, dz, ta, tb) {
    /* instâncias reescritas DEPOIS do `atualizar` deste quadro (o LOD das
       árvores roda mais adiante no tick e troca os índices de TODAS as
       árvores quando uma cruza os 70 m): relê na hora, senão por um quadro
       as copas estariam nos lugares errados */
    if (r.inst && r.obj.instanceMatrix && (r.obj.instanceMatrix.version !== r.ver || (r.obj.count | 0) !== r.n)) atualizaInstancias(r, false);
    if (!r.ok || !segCaixa(ex, ey, ez, dx, dy, dz, ta, tb, r.caixa)) return false;
    if (!renderizado(r.obj)) return false;
    ultimoInst = -1;
    /* NA DÚVIDA: a malha comum ainda não rasterizada conta como a caixa
       inteira. O conjunto de instâncias, não: a caixa dele é o MAPA (as
       árvores chegam por GLB depois do boot), e enquanto a grade se monta —
       dezenas de quadros — nenhum alvo seria assistido em lugar nenhum. Ele
       conta pela esfera de cada instância, que também contém tudo. */
    if (!r.feito && !r.inst) { stats.bloqueios.pendente++; return true; }
    if (!r.inst) {
      const v = r.inv;
      const lx = v[0] * ex + v[1] * ey + v[2] * ez + v[9], ly = v[3] * ex + v[4] * ey + v[5] * ez + v[10], lz = v[6] * ex + v[7] * ey + v[8] * ez + v[11];
      const ldx = v[0] * dx + v[1] * dy + v[2] * dz, ldy = v[3] * dx + v[4] * dy + v[5] * dz, ldz = v[6] * dx + v[7] * dy + v[8] * dz;
      return gradeCorta(r.grade, lx, ly, lz, ldx, ldy, ldz, ta, tb);
    }
    // instâncias: células do índice próprio ao longo do segmento
    marca++;
    const nk = celulasSegmento(ex, ez, dx, dz, ta, tb, _cand);
    for (let a = 0; a < nk; a++) {
      const l = r.iidx.get(_cand[a]);
      if (!l) continue;
      for (let b = 0; b < l.length; b++) {
        const q = l[b];
        if (r._marca && r._marca[q] === marca) continue;
        if (!r._marca || r._marca.length < r.n) r._marca = new Uint32Array(Math.max(r.n, 1));
        r._marca[q] = marca;
        if (!r.iok[q]) continue;
        const s = q * 4;
        if (!segEsfera(ex, ey, ez, dx, dy, dz, ta, tb, r.iesf[s], r.iesf[s + 1], r.iesf[s + 2], r.iesf[s + 3])) continue;
        const o = q * 12, v = r.iinv;
        const lx = v[o] * ex + v[o + 1] * ey + v[o + 2] * ez + v[o + 9], ly = v[o + 3] * ex + v[o + 4] * ey + v[o + 5] * ez + v[o + 10],
          lz = v[o + 6] * ex + v[o + 7] * ey + v[o + 8] * ez + v[o + 11];
        const ldx = v[o] * dx + v[o + 1] * dy + v[o + 2] * dz, ldy = v[o + 3] * dx + v[o + 4] * dy + v[o + 5] * dz,
          ldz = v[o + 6] * dx + v[o + 7] * dy + v[o + 8] * dz;
        if (!r.feito) { stats.bloqueios.pendente++; ultimoInst = q; return true; }
        if (gradeCorta(r.grade, lx, ly, lz, ldx, ldy, ldz, ta, tb)) { ultimoInst = q; return true; }
      }
    }
    return false;
  }
  /* células do índice grosso tocadas pelo segmento (DDA 2D), em `out` */
  function celulasSegmento(ex, ez, dx, dz, ta, tb, out) {
    const m = OCL.IDX;
    let i = Math.floor((ex + dx * ta) / m), j = Math.floor((ez + dz * ta) / m);
    const i1 = Math.floor((ex + dx * tb) / m), j1 = Math.floor((ez + dz * tb) / m);
    const si = dx > 0 ? 1 : dx < 0 ? -1 : 0, sj = dz > 0 ? 1 : dz < 0 ? -1 : 0;
    const tdx = si ? m / Math.abs(dx) : Infinity, tdz = sj ? m / Math.abs(dz) : Infinity;
    let tmx = si ? ((si > 0 ? (i + 1) * m : i * m) - ex) / dx : Infinity;
    let tmz = sj ? ((sj > 0 ? (j + 1) * m : j * m) - ez) / dz : Infinity;
    let n = 0;
    for (let g = 0; g < 256; g++) {
      out[n++] = chave(i, j);
      if ((i === i1 && j === j1) || Math.min(tmx, tmz) > tb) break;
      if (tmx < tmz) { i += si; tmx += tdx; } else { j += sj; tmz += tdz; }
    }
    return n;
  }

  /* O segmento olho → ponto `p` está tampado por algo DESENHADO? `r` é o
     raio da parte do alvo: o último `r` antes do centro não conta (é o
     próprio corpo — a mesma folga do `rayBlockedAt` na linha de visada
     antiga). O primeiro PULO_OLHO também não: é o plano próximo da câmera
     (0,08 m) — o que está mais perto do olho que isso a câmera corta e a tela
     não mostra. `dono`: o grupo do próprio alvo (nunca tampa a si mesmo). */
  function tampa(e, p, r, dono) {
    const t0 = agora();
    stats.raios++;
    const ex = +e.x, ey = +e.y, ez = +e.z;
    const dx = p.x - ex, dy = p.y - ey, dz = p.z - ez;
    const len = Math.hypot(dx, dy, dz);
    let res = false;
    if (len > 1e-3) {
      const ta = Math.min(1, OCL.PULO_OLHO / len), tb = Math.max(0, (len - Math.max(0, +r || 0)) / len);
      // o dono pode ser um grupo aninhado: o que conta é a raiz dele sob a cena
      if (tb > ta) res = tampaTrecho(ex, ey, ez, dx, dy, dz, ta, tb, len, dono ? raizDe(dono) : null);
    }
    stats.raiosMs += agora() - t0;
    return res;
  }
  function tampaTrecho(ex, ey, ez, dx, dy, dz, ta, tb, len, dono) {
    if (heightAt) {
      const passo = OCL.PASSO_TERRENO / len;
      for (let t = ta; t <= tb; t += passo) {
        const x = ex + dx * t, z = ez + dz * t;
        if (ey + dy * t < heightAt(x, z)) { stats.bloqueios.terreno++; ultimo = null; ultimoInst = -1; return true; }
      }
    }
    marca++;
    const m0 = marca;
    for (const r of globais) {
      if (r.raiz === dono) continue;
      if (testaReg(r, ex, ey, ez, dx, dy, dz, ta, tb)) { stats.bloqueios.malha++; ultimo = r; return true; }
    }
    const nk = celulasSegmento(ex, ez, dx, dz, ta, tb, _celSeg);
    for (let a = 0; a < nk; a++) {
      const s = idx.get(_celSeg[a]);
      if (!s) continue;
      for (const r of s) {
        if (r._m0 === m0 || r.raiz === dono) continue;
        r._m0 = m0;
        if (testaReg(r, ex, ey, ez, dx, dy, dz, ta, tb)) { stats.bloqueios.malha++; ultimo = r; return true; }
      }
    }
    return false;
  }
  const _celSeg = [];
  let ultimo = null, ultimoInst = -1;
  /* QA: o que tampou a última consulta que deu `true` ('terreno' ou a malha) */
  function quemTampou() {
    if (!ultimo) return 'terreno';
    const n = []; for (let p = ultimo.obj; p && p !== raiz && n.length < 5; p = p.parent) n.push(p.name || p.type || '?');
    return { malha: n.join('<'), instancia: ultimo.inst ? ultimoInst : null, tris: ultimo.ntris, pendente: !ultimo.feito,
      material: ultimo.obj.material && (ultimo.obj.material.name || ultimo.obj.material.type) };
  }

  /* QA/custo. `detalhe`: as malhas que mais pesam (células, triângulos por célula, blocos) */
  function estado(detalhe) {
    let blocos = 0, bytes = 0, cel = 0, refs = 0, inst = 0;
    for (const r of regs.values()) { cel += r.grade.celulas; refs += r.grade.refs; if (r.inst) inst += r.n; }
    stats.malhas = regs.size; stats.pendentes = fila.length; stats.celulas = cel; stats.refs = refs; stats.instancias = inst;
    for (const r of regs.values()) {
      if (r.grade.mb) bytes += r.grade.mb.byteLength;
      for (const b of r.grade.blocos.values()) {
        blocos++;
        if (b.off) { bytes += b.off.byteLength + b.s.byteLength; continue; }
        bytes += b.bb.byteLength + b.yr.byteLength;
        for (const l of b.lst) if (l) bytes += 8 * l.length;
      }
    }
    let gb = 0;
    for (const g of gramas.values()) for (const b of [g.off, g.ids, g.dat, g.celTopo]) if (b) gb += b.byteLength;
    stats.gramas = gramas.size;
    let gp = 0;
    for (const g of gramas.values()) if (g.pend) gp++;
    stats.gramaPendentes = gp;
    const e = { ...stats, bloqueios: { ...stats.bloqueios }, globais: globais.size, indice: idx.size, blocos, kb: Math.round(bytes / 1024),
      gramaKb: Math.round(gb / 1024) };
    if (detalhe) {
      const nome = o => { const n = []; for (let p = o; p && p !== raiz && n.length < 4; p = p.parent) n.push(p.name || p.type || '?'); return n.join('<'); };
      e.top = [...regs.values()].map(r => ({ nome: nome(r.obj), inst: r.inst ? r.n : 0, tris: r.ntris, cel: +r.grade.cel.toFixed(3),
        celulas: r.grade.celulas, refs: r.grade.refs, blocos: r.grade.blocos.size, vis: renderizado(r.obj) }))
        .sort((a, b) => b.blocos - a.blocos).slice(0, detalhe === true ? 25 : detalhe);
    }
    return e;
  }
  /* QA: força uma varredura e rasteriza TUDO agora (sem orçamento) */
  function prontoJa() {
    varrer();
    for (const r of regs.values()) atualizaPose(r);
    const t1 = agora();
    while (fila.length) { rasterizar(fila[0], Infinity); fila.shift(); }
    stats.rasterMs += agora() - t1;
    for (const g of gramas.values()) if (gramaVelha(g) || g.pend || (g.chaves && !g.arr)) montarGrama(g, true);
    ultimaVarredura = agora();
  }
  return { atualizar, tampa, gramaCobre, ventoGrama, estado, prontoJa, quemTampou, get pendentes() { return fila.length; },
    /* QA: onde a última `gramaCobre` verdadeira foi coberta (m do olho, altura da linha, topo, -1 grade / 0 jogador / 1 carro) */
    get ultimaGrama() { return { ...ultGrama }; } };
}
