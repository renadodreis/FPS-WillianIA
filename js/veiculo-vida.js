/* ================================================================
   VEÍCULO COM VIDA — a regra ÚNICA, como dado puro.

   Decisão do dono (2026-09-28): "carro pode segurar tiro, mas não...
   pra sempre!!". Até aqui o veículo não era cobertura para ninguém: o
   `rayBlockedAt` do cliente não o conhecia, a vítima aceitava dano através
   dele e os bots também não o viam. Agora:

     • veículo INTEIRO é sólido para bala e visada — nos três caminhos do
       tiro do cliente, na vítima (`youWereHit`) e nos bots;
     • ele tem VIDA, autoritativa no SERVIDOR (todos veem o mesmo), que
       bala e explosivo descontam;
     • com a vida em zero ele PARA de proteger na hora, fica 5 s em chamas
       (motor morto, dá tempo de pular fora) e explode: quem ainda está
       dentro morre, quem está perto se fere, e o veículo SOME.

   Referência (fonte + citação literal): docs/mobile/referencia-veiculos.md.
   [LASTRO] = a fonte diz isso; [INFERÊNCIA] = número deste jogo.

   Sem THREE, sem DOM, sem Math.random: o servidor (server.js), os bots
   (scripts/bots.js) e o cliente (js/veiculos.js) importam ESTE arquivo.
   ================================================================ */
import { NEXUS } from './paredes.js';

/* ---------------- tipos ----------------
   `caixas`: o casco que segura bala, no referencial do CHASSI — origem na
   origem do grupo do veículo (o centro de massa do cannon, para os carros;
   o pé do trem de pouso, para o helicóptero), +X é a frente, +Y para cima.
   Planta = a do modelo desenhado (js/car.js normaliza o GLB para 98 % da
   caixa física em X/Z); altura = a do modelo, sem o vão livre debaixo do
   assoalho [INFERÊNCIA no vão]. Medido contra o desenho em
   test/veiculo-vida-jogo.test.js.
   `acimaDoChao`: altura da origem sobre o chão com o veículo parado (a
   conta de spawn do js/car.js: apoio + raio da roda − centro da roda + 3 cm
   − comDrop) — é o que o servidor e os bots usam para quem nunca andou.
   `raio`: raio horizontal que envolve as caixas (folga de alcance).

   VIDA, em "dano de corpo" (o mesmo número que a arma tira de um jogador,
   sem cabeça): o fuzil tira 26.
   [LASTRO] PUBG: "Buggy ~1540, UAZ ~1820, Dacia ~1820" (pubg.wiki.gg) e
   30/45/49 tiros de M416 para buggy/Dacia/UAZ; Fortnite: sedã e esportivo
   800, picape 1 000, caminhão 1 200, Choppa 1 500 (fortnite.fandom.com).
   [INFERÊNCIA] a escala em tiros de fuzil: buggy 30, esportivo 45 (o sedã
   do PUBG), caminhão ×1,5 do esportivo (a razão caminhão/sedã do Fortnite)
   = 68, helicóptero ×1,875 (Choppa/sedã) = 84. */
/* Caixas CALIBRADAS pelo desenho (test/veiculo-vida-jogo.test.js mede os
   vértices da lataria no referencial do chassi, percentis 0,5–99,5 % em
   planta e 99,5 % no teto): buggy x ±1,73 z ±0,73 teto 0,54; esportivo
   x −1,82…1,81 z ±0,74 teto 0,52; caminhão x −2,47…2,54 z ±1,03 teto 2,14. */
export const TIPOS = Object.freeze({
  buggy: Object.freeze({
    nome: 'BUGGY', vida: 780, acimaDoChao: 0.58, raio: 1.95,
    caixas: Object.freeze([{ min: [-1.73, -0.40, -0.73], max: [1.73, 0.54, 0.73] }]),
  }),
  esportivo: Object.freeze({
    nome: 'ESPORTIVO GT', vida: 1170, acimaDoChao: 0.555, raio: 2.05,
    caixas: Object.freeze([{ min: [-1.82, -0.42, -0.74], max: [1.81, 0.52, 0.74] }]),
  }),
  caminhao: Object.freeze({
    nome: 'CAMINHÃO MILITAR', vida: 1760, acimaDoChao: 0.554, raio: 2.84,
    caixas: Object.freeze([{ min: [-2.47, -0.20, -1.03], max: [2.54, 2.14, 1.03] }]),
  }),
  /* fuselagem + cabine de vidro (js/heli.js: 3,1 × 1,5 × 1,6 em x 0,2,
     vidro até x 2,05) e o cone da cauda com o leme. O rotor não segura bala. */
  heli: Object.freeze({
    nome: 'HELICÓPTERO', vida: 2180, acimaDoChao: 0, raio: 3.64,
    caixas: Object.freeze([
      { min: [-1.35, 0.40, -0.80], max: [2.05, 1.90, 0.80] },
      { min: [-3.55, 1.15, -0.30], max: [-0.90, 1.85, 0.30] },
    ]),
  }),
});
export const HELI = 'heli';

/* dano por ACERTO agregado (a escopeta junta os chumbos num só), por arma
   — o corpo, sem cabeça: lataria não tem ponto fraco aqui. A faca não fura
   lataria [INFERÊNCIA]; o foguete e a granada vão pelo explosivo. */
export const DANO_BALA_MAX = Object.freeze({ FUZIL: 26, ESCOPETA: 88, DMR: 72, PLASMA: 38, SNIPER: 46 });

/* explosivo contra veículo. [LASTRO] Warzone (mein-mmo): "C4 – 1 Treffer"
   no SUV, "C4 – 2 Pakete" no caminhão; PUBG: a Panzerfaust destrói veículo
   fraco (buggy, moto) num acerto direto e tira mais de 80 % dos outros (resumo
   de busca da namu.wiki — a página recusou a leitura; ver a referência).
   [INFERÊNCIA] ×7,5 na bazuca = 975 no
   epicentro: buggy num foguete, esportivo e caminhão em dois, helicóptero em
   três; granada ×3 (390). O teto é o mesmo do `explosionHit` (130). */
export const EXPLOSIVO_MAX = 130;
export const MULT_EXPLOSIVO = Object.freeze({ BAZUCA: 7.5, GRANADA: 3 });

/* [LASTRO] PUBG 7.3: "Vehicles no longer explode instantly upon reaching 0
   HP. Instead, engines are now disabled and set on fire, causing the
   vehicle to explode after 5 seconds." */
export const QUEIMA_S = 5;

/* a explosão do veículo destruído. [LASTRO] PUBG Mobile: "all people inside
   and around the vehicle can get killed"; Warzone: "killing any passengers
   and bystanders in the vicinity". [INFERÊNCIA] raio 8 m (o da granada é
   7,5), 120 em cima e 10 na borda. */
export const EXPLOSAO = Object.freeze({ raio: 8, max: 110, piso: 10 });

/* teto de dano EM VEÍCULO por atirador por segundo (já com o multiplicador
   do explosivo). O legítimo mais alto: foguete direto (975) + fuzil no
   mesmo segundo (~300) = 1 275. */
export const VEICULO_DANO_POR_S = 1300;

const n = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function danoDeBalaNoVeiculo(arma, dano) {
  const teto = DANO_BALA_MAX[arma];
  if (!teto) return 0;
  return Math.min(Math.max(n(dano), 0), teto);
}
export function danoExplosivoNoVeiculo(tipo, dano) {
  const mult = MULT_EXPLOSIVO[tipo];
  if (!mult) return 0;
  return Math.min(Math.max(n(dano), 0), EXPLOSIVO_MAX) * mult;
}
export function danoDaExplosaoDoVeiculo(dist) {
  const d = Math.max(0, n(dist));
  if (d >= EXPLOSAO.raio) return 0;
  return Math.round(EXPLOSAO.piso + EXPLOSAO.max * (1 - d / EXPLOSAO.raio));
}

/* ---------------- frota por semente ----------------
   A MESMA ordem de `Car.vehicles` (js/car.js): o buggy do spawn, depois
   `Structures.carSpots` na ordem do js/structures.js — as três vagas da
   cidade e um caminhão por base militar que coube no mapa. O helicóptero
   (único) fica à parte, com id HELI, no topo da Torre Nexus
   (`Structures.heliSpot` + 5 cm, js/heli.js). `plano` é o de
   `planejarEstruturas` (js/paredes.js). Com `heightAt`, a altura dos
   carros sai do chão + `acimaDoChao`. As três vagas da cidade ficam NA RUA,
   e a rua tem laje física acima do relevo (game.js, "lajes FÍSICAS do
   pavimento urbano": topo do asfalto em gy + 0,14) — sem ela o servidor
   punha os esportivos 0,24–0,37 m abaixo de onde o cliente os assenta. */
export const TOPO_DO_ASFALTO = 0.14;
export function frotaDoPlano(plano, heightAt = null) {
  const { x: cx, z: cz, gy } = plano.cidade;
  const chao = (x, z, naRua) => Math.max(heightAt(x, z), naRua ? gy + TOPO_DO_ASFALTO : -Infinity);
  const lista = [
    { tipo: 'buggy', x: 7.5, z: -6, ry: 0 },
    { tipo: 'esportivo', x: cx + 14, z: cz + 26, ry: 0, rua: true },
    { tipo: 'esportivo', x: cx - 8, z: cz + 26, ry: Math.PI, rua: true },
    { tipo: 'esportivo', x: cx + 26, z: cz - 16, ry: -Math.PI / 2, rua: true },
    ...(plano.bases || []).map(b => ({ tipo: 'caminhao', x: b.x, z: b.z - 4, ry: b.caminhaoRy })),
  ].map(({ rua, ...v }, id) => ({ id, ...v, y: heightAt ? chao(v.x, v.z, rua) + TIPOS[v.tipo].acimaDoChao : null }));
  lista.push({ id: HELI, tipo: 'heli', x: cx, z: cz, ry: 0, y: gy + NEXUS.NF * NEXUS.FH + 0.25 + 0.05 });
  return lista;
}

/* ---------------- geometria ----------------
   pose: { x, y, z } + `yaw` (giro em Y, convenção do three/js/car.js) OU
   `q` ({x,y,z,w}, a pose inteira — o cliente, com inclinação de rampa).
   Leva um vetor do MUNDO para o referencial do chassi (a inversa da pose). */
function paraLocal(vx, vy, vz, pose, out) {
  const q = pose.q;
  if (q) {
    // v' = q⁻¹ · v · q — rotação pelo conjugado (quaternion unitário)
    const qx = -q.x, qy = -q.y, qz = -q.z, qw = q.w;
    const ix = qw * vx + qy * vz - qz * vy, iy = qw * vy + qz * vx - qx * vz;
    const iz = qw * vz + qx * vy - qy * vx, iw = -qx * vx - qy * vy - qz * vz;
    out[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    out[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    out[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return out;
  }
  const c = Math.cos(pose.yaw || 0), s = Math.sin(pose.yaw || 0);
  out[0] = vx * c - vz * s;
  out[1] = vy;
  out[2] = vx * s + vz * c;
  return out;
}
const _o = [0, 0, 0], _d = [0, 0, 0];

/* slab test no referencial local; a mesma regra do `Structures.rayHit`:
   origem DENTRO da caixa não conta (t0 fica em 0) */
function slabLocal(o, d, best, cx) {
  let t0 = 0, t1 = best;
  for (let k = 0; k < 3; k++) {
    const lo = cx.min[k], hi = cx.max[k];
    if (Math.abs(d[k]) < 1e-12) { if (o[k] < lo || o[k] > hi) return best; continue; }
    let ta = (lo - o[k]) / d[k], tb = (hi - o[k]) / d[k];
    if (ta > tb) { const m = ta; ta = tb; tb = m; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return best;
  }
  return t0 > 0 && t0 < best ? t0 : best;
}

/* distância ao longo do raio (d unitário) até a lataria do veículo, ou Infinity */
export function raioNoVeiculo(o, d, maxDist, pose, tipo) {
  const T = TIPOS[tipo];
  if (!T) return Infinity;
  paraLocal(o.x - pose.x, o.y - pose.y, o.z - pose.z, pose, _o);
  paraLocal(d.x, d.y, d.z, pose, _d);
  let best = maxDist;
  for (const cx of T.caixas) best = slabLocal(_o, _d, best, cx);
  return best < maxDist ? best : Infinity;
}

/* o veículo INTEIRO mais perto no raio: { t, alvo } ou null.
   `lista`: [{ tipo, inteiro, pose }]; `ignorar`: um item (ou null). */
const _hit = { t: 0, alvo: null };
export function raioNaFrota(o, d, maxDist, lista, ignorar = null) {
  let best = maxDist, alvo = null;
  for (const v of lista) {
    if (!v || !v.inteiro || v === ignorar || !v.pose) continue;
    const t = raioNoVeiculo(o, d, best, v.pose, v.tipo);
    if (t < best) { best = t; alvo = v; }
  }
  if (!alvo) return null;
  _hit.t = best; _hit.alvo = alvo;
  return _hit;
}

/* a reta a→b bate num veículo inteiro antes de chegar em b: o item ou null */
export function segmentoNaFrota(a, b, lista, ignorar = null) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-4) return null;
  const h = raioNaFrota(a, { x: dx / len, y: dy / len, z: dz / len }, len, lista, ignorar);
  return h ? h.alvo : null;
}

/* distância do ponto à caixa mais próxima do veículo (0 dentro) */
export function distanciaAoVeiculo(p, pose, tipo) {
  const T = TIPOS[tipo];
  if (!T) return Infinity;
  paraLocal(p.x - pose.x, p.y - pose.y, p.z - pose.z, pose, _o);
  let best = Infinity;
  for (const cx of T.caixas) {
    let s = 0;
    for (let k = 0; k < 3; k++) {
      const e = Math.max(cx.min[k] - _o[k], 0, _o[k] - cx.max[k]);
      s += e * e;
    }
    best = Math.min(best, Math.sqrt(s));
  }
  return best;
}

/* o ponto está dentro de algum veículo inteiro da lista (bot que atravessou
   um andando — de dentro ele não enxerga nem atira, como na parede) */
export function dentroDaFrota(p, lista) {
  for (const v of lista) if (v && v.inteiro && v.pose && distanciaAoVeiculo(p, v.pose, v.tipo) === 0) return v;
  return null;
}
