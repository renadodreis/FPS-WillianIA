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

/* ================================================================ */
export function createOclusao(deps) {
  const d = deps && typeof deps === 'object' ? deps : {};
  const raiz = d.raiz || null;
  const heightAt = typeof d.heightAt === 'function' ? d.heightAt : null;
  const ignorar = typeof d.ignorar === 'function' ? d.ignorar : () => false;
  const alvos = typeof d.alvos === 'function' ? d.alvos : () => [];
  const agora = typeof d.agora === 'function' ? d.agora : () => Date.now();

  const regs = new Map();           // objeto → registro
  const fila = [];                  // registros a rasterizar
  const globais = new Set();        // malhas grandes demais pro índice, e as que andam
  const idx = new Map();            // célula do índice → Set de registros parados
  let ultimaVarredura = -Infinity, carimbo = 0, marca = 0;
  const stats = { malhas: 0, instancias: 0, pendentes: 0, celulas: 0, refs: 0, rasterMs: 0, raios: 0, raiosMs: 0,
    bloqueios: { terreno: 0, malha: 0, pendente: 0 } };

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
      let r = regs.get(o);
      if (!r && vis && !pequenas.has(o) && candidata(o)) r = registrar(o);
      if (r) r.visto = carimbo;
      const ch = o.children;
      if (ch) for (let i = 0; i < ch.length; i++) { pilha.push(ch[i]); pilhaVis.push(vis && ch[i].visible !== false); }
    }
    // apagar durante a iteração de um Map é seguro (e não aloca cópia)
    for (const r of regs.values()) if (r.visto !== carimbo) remover(r);
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
    if (fila.length) {
      const t1 = agora(), limite = t0 + OCL.ORCAMENTO_MS;
      while (fila.length && agora() <= limite) {
        const r = fila[0];
        if (rasterizar(r, limite)) fila.shift(); else break;
      }
      stats.rasterMs += agora() - t1;
    }
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
    const e = { ...stats, bloqueios: { ...stats.bloqueios }, globais: globais.size, indice: idx.size, blocos, kb: Math.round(bytes / 1024) };
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
    ultimaVarredura = agora();
  }
  return { atualizar, tampa, estado, prontoJa, quemTampou, get pendentes() { return fila.length; } };
}
