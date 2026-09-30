/* ================================================================
   O VULCÃO DESENHADO COMO SÓLIDO — puro (sem three, sem DOM): o mesmo
   código no navegador, no servidor e no processo dos bots.

   O relevo do vulcão (js/terrain.js) é uma grade 56 × 56 de 8 bits do
   modelo, reamostrada pela grade de 5 m do terreno: suave demais. O modelo
   desenhado (assets/models/volcano.v1.glb) passa MAIS de 0,3 m acima desse
   relevo em 45 % da superfície, e na saia (100–114 m do centro) 43 % dos
   pontos ficam mais de 1,5 m acima — até 6,7 m. Quem está ali fica com o
   tronco DENTRO da rocha desenhada: a tela o esconde e a bala (que conhece
   só o relevo) passa pela rocha. Laudo d381d29, §2c: 69 de 97 pares
   aleatórios de "a tela tampa e a bala passa" eram o vulcão.

   Aqui: os triângulos do modelo, no mundo, pela MESMA transformação do
   js/volcano.js (caixa do modelo centrada em VOLCANO, escala pela pegada,
   base em baseY), numa grade de células em XZ. Consultas:
     topoDoVulcao(m, x, z)            → a superfície desenhada mais alta
     retaNoVulcao(m, o, d, len)       → a distância do 1º triângulo na reta
   ================================================================ */

export const VULCAO_GLB = '/assets/models/volcano.v1.glb';

/* ---------------- leitura do GLB (glTF 2.0 binário) ---------------- */
const TAM = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function leitor(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
}
function lerAcessor(dv, gltf, bin, i) {
  const a = gltf.accessors[i], bv = gltf.bufferViews[a.bufferView];
  const n = NCOMP[a.type], t = TAM[a.componentType];
  const passo = bv.byteStride || n * t;
  const base = bin + (bv.byteOffset || 0) + (a.byteOffset || 0);
  const out = new Float64Array(a.count * n);
  for (let k = 0; k < a.count; k++) {
    for (let c = 0; c < n; c++) {
      const o = base + k * passo + c * t;
      let v;
      switch (a.componentType) {
        case 5120: v = dv.getInt8(o); if (a.normalized) v = Math.max(v / 127, -1); break;
        case 5121: v = dv.getUint8(o); if (a.normalized) v /= 255; break;
        case 5122: v = dv.getInt16(o, true); if (a.normalized) v = Math.max(v / 32767, -1); break;
        case 5123: v = dv.getUint16(o, true); if (a.normalized) v /= 65535; break;
        case 5125: v = dv.getUint32(o, true); break;
        default: v = dv.getFloat32(o, true);
      }
      out[k * n + c] = v;
    }
  }
  return out;
}
/* matriz 4×4 (coluna-maior, como o three) de um nó: `matrix` ou T·R·S */
function matrizDoNo(no) {
  if (no.matrix) return Float64Array.from(no.matrix);
  const [tx, ty, tz] = no.translation || [0, 0, 0];
  const [x, y, z, w] = no.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = no.scale || [1, 1, 1];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return Float64Array.from([
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]);
}
function multiplicar(a, b) {
  const r = new Float64Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
    r[i * 4 + j] = s;
  }
  return r;
}
const aplicar = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

/* os triângulos do GLB no espaço da CENA dele (nós aplicados), e a caixa
   que o `Box3.setFromObject` do three daria: a caixa de cada geometria
   (min/max do acessor) com os 8 cantos transformados */
export function lerTriangulosDoGLB(bytes) {
  const dv = leitor(bytes);
  if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('vulcão: não é GLB');
  const jl = dv.getUint32(12, true);
  const json = new TextDecoder().decode(new Uint8Array(dv.buffer, dv.byteOffset + 20, jl));
  const gltf = JSON.parse(json);
  const bin = 20 + jl + 8;
  const tris = [], caixa = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const visitar = (i, pai) => {
    const no = gltf.nodes[i];
    const m = multiplicar(pai, matrizDoNo(no));
    if (no.mesh !== undefined) {
      for (const p of gltf.meshes[no.mesh].primitives) {
        if (p.mode !== undefined && p.mode !== 4) continue;   // só TRIANGLES
        const ap = gltf.accessors[p.attributes.POSITION];
        const pos = lerAcessor(dv, gltf, bin, p.attributes.POSITION);
        const nv = pos.length / 3;
        const mundo = new Float64Array(pos.length);
        for (let k = 0; k < nv; k++) {
          const [x, y, z] = aplicar(m, pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
          mundo[k * 3] = x; mundo[k * 3 + 1] = y; mundo[k * 3 + 2] = z;
        }
        const idx = p.indices !== undefined ? lerAcessor(dv, gltf, bin, p.indices) : Float64Array.from({ length: nv }, (_, k) => k);
        for (let t = 0; t < idx.length; t += 3)
          for (let c = 0; c < 3; c++) for (let e = 0; e < 3; e++) tris.push(mundo[idx[t + c] * 3 + e]);
        // caixa: min/max do acessor (desquantizado como o GLTFLoader faz), 8 cantos
        const q = v => (ap.normalized && ap.componentType === 5122 ? Math.max(v / 32767, -1) : v);
        const lo = ap.min.map(q), hi = ap.max.map(q);
        for (let c = 0; c < 8; c++) {
          const w = aplicar(m, c & 1 ? hi[0] : lo[0], c & 2 ? hi[1] : lo[1], c & 4 ? hi[2] : lo[2]);
          for (let e = 0; e < 3; e++) { caixa.min[e] = Math.min(caixa.min[e], w[e]); caixa.max[e] = Math.max(caixa.max[e], w[e]); }
        }
      }
    }
    for (const f of no.children || []) visitar(f, m);
  };
  const ident = Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  for (const r of gltf.scenes[gltf.scene || 0].nodes) visitar(r, ident);
  return { tris: Float64Array.from(tris), caixa };
}

/* a transformação do js/volcano.js: caixa centrada em (VOLCANO.x, VOLCANO.z),
   escala pela pegada, base (min y) a 0,6 % da altura abaixo de baseY */
export function transformacaoDoVulcao(caixa, VOLCANO) {
  const tam = [0, 1, 2].map(e => caixa.max[e] - caixa.min[e]);
  const s = (VOLCANO.r * 2) / Math.max(tam[0], tam[2]);
  return {
    s,
    px: VOLCANO.x - (caixa.min[0] + tam[0] / 2) * s,
    py: VOLCANO.baseY - 0.006 * tam[1] * s - caixa.min[1] * s,
    pz: VOLCANO.z - (caixa.min[2] + tam[2] / 2) * s,
  };
}

/* ---------------- o sólido: triângulos no mundo + grade XZ ---------------- */
export const CELULA_VULCAO = 2;
export function montarVulcao(bytes, VOLCANO, { excluir = null, celula = CELULA_VULCAO } = {}) {
  const { tris: loc, caixa } = lerTriangulosDoGLB(bytes);
  const T = transformacaoDoVulcao(caixa, VOLCANO);
  const nt0 = loc.length / 9;
  const lista = [];
  for (let t = 0; t < nt0; t++) {
    const tri = new Float64Array(9);
    for (let c = 0; c < 3; c++) {
      tri[c * 3] = T.px + T.s * loc[t * 9 + c * 3];
      tri[c * 3 + 1] = T.py + T.s * loc[t * 9 + c * 3 + 1];
      tri[c * 3 + 2] = T.pz + T.s * loc[t * 9 + c * 3 + 2];
    }
    if (excluir && excluir(tri)) continue;
    lista.push(tri);
  }
  const tris = new Float64Array(lista.length * 9);
  lista.forEach((tri, t) => tris.set(tri, t * 9));
  return { ...gradeDeTriangulos(tris, celula), T };
}

/* a grade XZ de uma lista de triângulos (9 números cada): cada célula guarda
   os triângulos cuja caixa a toca */
export function gradeDeTriangulos(tris, celula = CELULA_VULCAO) {
  const nt = tris.length / 9;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, ymax = -Infinity;
  for (let k = 0; k < nt * 3; k++) {
    x0 = Math.min(x0, tris[k * 3]); x1 = Math.max(x1, tris[k * 3]);
    z0 = Math.min(z0, tris[k * 3 + 2]); z1 = Math.max(z1, tris[k * 3 + 2]);
    ymax = Math.max(ymax, tris[k * 3 + 1]);
  }
  const nx = Math.max(1, Math.ceil((x1 - x0) / celula)), nz = Math.max(1, Math.ceil((z1 - z0) / celula));
  const conta = new Uint32Array(nx * nz + 1);
  const faixa = (t, e) => { const a = tris[t * 9 + e], b = tris[t * 9 + 3 + e], c = tris[t * 9 + 6 + e]; return [Math.min(a, b, c), Math.max(a, b, c)]; };
  const celulasDe = (t, fn) => {
    const [ax, bx] = faixa(t, 0), [az, bz] = faixa(t, 2);
    const i0 = Math.max(0, Math.floor((ax - x0) / celula)), i1 = Math.min(nx - 1, Math.floor((bx - x0) / celula));
    const k0 = Math.max(0, Math.floor((az - z0) / celula)), k1 = Math.min(nz - 1, Math.floor((bz - z0) / celula));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) fn(k * nx + i);
  };
  for (let t = 0; t < nt; t++) celulasDe(t, c => conta[c + 1]++);
  for (let c = 0; c < nx * nz; c++) conta[c + 1] += conta[c];
  const itens = new Uint32Array(conta[nx * nz]), cursor = conta.slice(0, nx * nz);
  for (let t = 0; t < nt; t++) celulasDe(t, c => { itens[cursor[c]++] = t; });
  return { tris, nt, x0, z0, nx, nz, celula, inicio: conta, itens, ymax };
}

/* a superfície desenhada mais alta em (x, z), ou -Infinity fora do vulcão */
export function topoDoVulcao(m, x, z) {
  const i = Math.floor((x - m.x0) / m.celula), k = Math.floor((z - m.z0) / m.celula);
  if (i < 0 || k < 0 || i >= m.nx || k >= m.nz) return -Infinity;
  const c = k * m.nx + i, T = m.tris;
  let melhor = -Infinity;
  for (let q = m.inicio[c]; q < m.inicio[c + 1]; q++) {
    const o = m.itens[q] * 9;
    const ax = T[o], az = T[o + 2], bx = T[o + 3], bz = T[o + 5], cx = T[o + 6], cz = T[o + 8];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) continue;
    const l0 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
    const l1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
    const l2 = 1 - l0 - l1;
    if (l0 < -1e-9 || l1 < -1e-9 || l2 < -1e-9) continue;
    const y = l0 * T[o + 1] + l1 * T[o + 4] + l2 * T[o + 7];
    if (y > melhor) melhor = y;
  }
  return melhor;
}

/* Möller–Trumbore, dois lados: t da reta o + t·d, ou Infinity */
function retaNoTriangulo(T, o, ox, oy, oz, dx, dy, dz) {
  const e1x = T[o + 3] - T[o], e1y = T[o + 4] - T[o + 1], e1z = T[o + 5] - T[o + 2];
  const e2x = T[o + 6] - T[o], e2y = T[o + 7] - T[o + 1], e2z = T[o + 8] - T[o + 2];
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return Infinity;
  const inv = 1 / det;
  const sx = ox - T[o], sy = oy - T[o + 1], sz = oz - T[o + 2];
  const u = (sx * px + sy * py + sz * pz) * inv;
  if (u < 0 || u > 1) return Infinity;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return Infinity;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > 1e-6 ? t : Infinity;
}

/* a 1ª superfície desenhada na reta o + t·d (d unitário), t ≤ len; Infinity
   se nenhuma. Percorre só as células por onde a reta passa (Amanatides & Woo). */
export function retaNoVulcao(m, ox, oy, oz, dx, dy, dz, len) {
  const C = m.celula, X1 = m.x0 + m.nx * C, Z1 = m.z0 + m.nz * C;
  // recorta a reta na caixa XZ da grade (e acima do topo: nada)
  let t0 = 0, t1 = len;
  for (const [o, d, lo, hi] of [[ox, dx, m.x0, X1], [oz, dz, m.z0, Z1]]) {
    if (Math.abs(d) < 1e-12) { if (o < lo || o > hi) return Infinity; continue; }
    let a = (lo - o) / d, b = (hi - o) / d;
    if (a > b) { const w = a; a = b; b = w; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return Infinity;
  }
  if (oy + dy * t0 > m.ymax && oy + dy * t1 > m.ymax) return Infinity;
  let i = Math.min(m.nx - 1, Math.max(0, Math.floor((ox + dx * t0 - m.x0) / C)));
  let k = Math.min(m.nz - 1, Math.max(0, Math.floor((oz + dz * t0 - m.z0) / C)));
  const si = dx > 0 ? 1 : -1, sk = dz > 0 ? 1 : -1;
  const tdi = Math.abs(dx) > 1e-12 ? C / Math.abs(dx) : Infinity, tdk = Math.abs(dz) > 1e-12 ? C / Math.abs(dz) : Infinity;
  let tmi = Math.abs(dx) > 1e-12 ? (m.x0 + (i + (dx > 0 ? 1 : 0)) * C - ox) / dx : Infinity;
  let tmk = Math.abs(dz) > 1e-12 ? (m.z0 + (k + (dz > 0 ? 1 : 0)) * C - oz) / dz : Infinity;
  let melhor = Infinity;
  for (;;) {
    const c = k * m.nx + i;
    for (let q = m.inicio[c]; q < m.inicio[c + 1]; q++) {
      const t = retaNoTriangulo(m.tris, m.itens[q] * 9, ox, oy, oz, dx, dy, dz);
      if (t < melhor && t <= len) melhor = t;
    }
    const tSai = Math.min(tmi, tmk, t1);
    if (melhor <= tSai + 1e-9) return melhor;   // o triângulo desta célula vem antes da próxima
    if (tSai >= t1) return melhor;
    if (tmi < tmk) { i += si; tmi += tdi; if (i < 0 || i >= m.nx) return melhor; }
    else { k += sk; tmk += tdk; if (k < 0 || k >= m.nz) return melhor; }
  }
}

/* ---------------- o CHÃO do vulcão (onde o corpo pisa) ----------------
   A rocha desenhada, menos a CALOTA DE LAVA: o modelo cobre o poço da
   cratera (o relevo desce até a lava, VOLCANO.lavaY) com uma tampa opaca
   de lava. Pisar nela é afundar na lava — o corpo cai para o poço do
   relevo, onde a regra de sempre queima. Calota: perto do centro da lava
   (CALOTA_R) e mais de CALOTA_ALTURA acima do relevo (o poço embaixo).
   Fora do vulcão, ou onde a rocha fica abaixo do relevo: -Infinity (vale o
   relevo, que também é desenhado). Uma regra só, para o cliente e o bot. */
export const CALOTA_R = 16, CALOTA_ALTURA = 3;
export function chaoDoVulcao(m, x, z, heightAt, VOLCANO) {
  const y = topoDoVulcao(m, x, z);
  if (!(y > -Infinity)) return -Infinity;
  if (Math.hypot(x - VOLCANO.lavaX, z - VOLCANO.lavaZ) < CALOTA_R && y - heightAt(x, z) > CALOTA_ALTURA) return -Infinity;
  return y;
}
