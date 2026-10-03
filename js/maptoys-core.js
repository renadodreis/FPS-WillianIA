/* ================================================================
   Atrações do mapa — NÚCLEO PURO (sem THREE/DOM).
   Matemática das 5 brincadeiras: cama elástica, aros de acrobacia,
   xilofone gigante, campo de tiro e fogos. Mesmo código no navegador
   (js/maptoys.js) e nos testes de Node. Reusa pickSpot de cannon-core.
   ================================================================ */
import { pickSpot } from './cannon-core.js';
import { ASSENTO, CILINDRO } from './paredes.js';
export { pickSpot };

/* ---- ONDE FICA CADA ATRAÇÃO ---------------------------------------------
   Puro: relevo + sítios, sem sorteio (pickSpot é varredura determinística).
   Antes cada módulo escolhia na hora, lendo `Structures.sites` AO VIVO — e o
   mercado e o refúgio entram ali depois do `await` do GLB deles (game.js).
   Quem baixava o GLB antes do fim do boot via o canhão e as atrações em
   outro lugar; e o bot não sabia onde ficava o painel do campo de tiro, que
   é parede (laudo d381d29, §2c: 10 acertos num humano escondido atrás dele).
   `sitios`: construções (js/paredes.js, plano.sites) + POIs
   (js/obstaculos.js, pois.sitios) — os mesmos em todo cliente e no Node.
   A ordem é contrato: cada atração evita as anteriores. */
export function planejarAtracoes({ sitios, heightAt, slopeAt, WATER_LEVEL, CITY }) {
  if (!Array.isArray(sitios) || typeof heightAt !== 'function') throw new Error('planejarAtracoes: sitios/heightAt ausentes');
  const cx = (CITY && CITY.x) || 0, cz = (CITY && CITY.z) || 0;
  const sampler = (x, z) => ({ h: heightAt(x, z), slope: slopeAt ? slopeAt(x, z) : 0 });
  const noChao = p => ({ x: p.x, z: p.z, y: heightAt(p.x, p.z) });
  // canhão: o lugar mais vazio do anel; sem nada seco, 220 m a leste da cidade
  const canhao = noChao(pickSpot({ sites: sitios, cx, cz, sampler, waterLevel: WATER_LEVEL }) || { x: cx + 220, z: cz });
  const evita = [{ x: canhao.x, z: canhao.z, r: 40 }];
  const lugar = angulo => {
    const p = pickSpot({ sites: sitios, avoid: evita.slice(), cx, cz, sampler, waterLevel: WATER_LEVEL })
      || { x: cx + Math.cos(angulo) * 240, z: cz + Math.sin(angulo) * 240 };
    evita.push({ x: p.x, z: p.z, r: 46 });
    return noChao(p);
  };
  const cama = lugar(0.3), galeria = lugar(1.4), fogos = lugar(2.5), xilofone = lugar(5.2);
  return { canhao, cama, galeria, fogos, xilofone };
}

/* ---- o painel do campo de tiro é PAREDE (corpo e bala) -------------------
   9 × 3,4 × 0,4 m, 2 m atrás do ponto, alinhado aos eixos. Assenta como as
   construções (js/paredes.js, ASSENTO): o topo fica, a base desce até o chão
   mais baixo da pegada — em encosta o painel flutuava e a bala passava por
   baixo. O desenho (js/maptoys.js) é esta mesma caixa. */
export const PAINEL_GALERIA = Object.freeze({ larg: 9, alt: 3.4, esp: 0.4, atras: 2 });
export function painelDaGaleria(galeria, heightAt) {
  const P = PAINEL_GALERIA;
  const x0 = galeria.x - P.larg / 2, x1 = galeria.x + P.larg / 2;
  const zc = galeria.z - P.atras, z0 = zc - P.esp / 2, z1 = zc + P.esp / 2;
  const nx = Math.ceil(P.larg / ASSENTO.PASSO), nz = Math.max(1, Math.ceil(P.esp / ASSENTO.PASSO));
  let chao = Infinity;
  for (let i = 0; i <= nx; i++)
    for (let k = 0; k <= nz; k++) chao = Math.min(chao, heightAt(x0 + (x1 - x0) * i / nx, z0 + (z1 - z0) * k / nz));
  const y1 = galeria.y + P.alt;
  return { x0, x1, y0: Math.min(galeria.y, chao - ASSENTO.ENTERRO), y1, z0, z1, atracao: 'galeria' };
}
/* o chão mais baixo debaixo de um retângulo (a amostragem do ASSENTO) */
function chaoMaisBaixo(x0, x1, z0, z1, heightAt) {
  const nx = Math.max(1, Math.ceil((x1 - x0) / ASSENTO.PASSO)), nz = Math.max(1, Math.ceil((z1 - z0) / ASSENTO.PASSO));
  let chao = Infinity;
  for (let i = 0; i <= nx; i++)
    for (let k = 0; k <= nz; k++) chao = Math.min(chao, heightAt(x0 + (x1 - x0) * i / nx, z0 + (z1 - z0) * k / nz));
  return chao;
}

/* ---- o totem de fogos e o canhão também seguram BALA ----------------------
   "Desenho sólido barra bala" — os laudos 5 a 8 mediram a bala atravessando
   os dois.
   • totem (js/maptoys.js): 4 caixas de 1,1 × 0,7 × 1,1 empilhadas de
     y + 0,05 a y + 2,85 — uma caixa, assentada, de CORPO e bala: tem altura
     de gente, e laje só de bala em que se entra andando deixa quem entra
     imune atirando para fora (laudo d381d29, NC-1). A pirâmide do topo (0,9
     m, acima da cabeça) fica de fora;
   • canhão (js/cannon.js): a carreta (tronco de cone r 1,75 → 1,55, de
     y + 0,2 a y + 0,9, 20 lados) e as duas rodas (disco r 0,72, 16 lados,
     0,26 de espessura, em x ± 1,55, eixo a y + 0,72), em caixas DENTRO do
     desenho (caixa maior que o desenho é bala parando no ar). Só de
     BALA (`noCollide`, como o acabamento): o jogador ENTRA no canhão para
     ser disparado — o curso de argolas é desenhado para o tiro que sai do
     centro dele —, e com 0,9 m quem está ali dentro segue com a cabeça (e,
     em pé, o tronco) por cima. O CANO gira para mirar — desenho que se
     mexe não é parede. */
export const TOTEM_FOGOS = Object.freeze({ lado: 1.1, base: 0.05, topo: 2.85 });
export const CANHAO_PECAS = Object.freeze({
  carreta: { rTopo: 1.55, rBase: 1.75, y0: 0.2, y1: 0.9, lados: 20 },
  roda: { r: 0.72, x: 1.55, esp: 0.26, y: 0.72, lados: 16 },
});
/* as caixas do `CILINDRO` cabem num CÍRCULO (quina ≤ 1,003·r); o desenho é um
   polígono de N lados, cuja face fica a r·cos(π/N) do centro — as quinas
   passavam do desenho em até 2,2 cm (laudo f672d81, §4.2). O raio que cabe
   no polígono: */
const raioNoPoligono = (r, lados) => r * Math.cos(Math.PI / lados) / 1.003;
export function totemDosFogos(fogos, heightAt) {
  const m = TOTEM_FOGOS.lado / 2, x0 = fogos.x - m, x1 = fogos.x + m, z0 = fogos.z - m, z1 = fogos.z + m;
  return { x0, x1, y0: Math.min(fogos.y + TOTEM_FOGOS.base, chaoMaisBaixo(x0, x1, z0, z1, heightAt) - ASSENTO.ENTERRO),
    y1: fogos.y + TOTEM_FOGOS.topo, z0, z1, atracao: 'fogos' };
}
const SO_BALA = Object.freeze({ atracao: 'canhao', noCollide: true, acabamento: 'canhao' });
export function pecasDoCanhao(canhao) {
  const { carreta: C, roda: R } = CANHAO_PECAS, { x, y, z } = canhao, out = [];
  /* a carreta é tronco de cone (r da base 1,75 → topo 1,55): quatro fatias,
     cada uma no raio do TOPO dela (o menor), para a caixa não sair do
     desenho — com duas, a fatia de cima ficava 9 cm aquém do desenho */
  const rEm = yy => C.rBase + (C.rTopo - C.rBase) * (yy - C.y0) / (C.y1 - C.y0), FATIAS = 4;
  for (let i = 0; i < FATIAS; i++) {
    const a = C.y0 + (C.y1 - C.y0) * i / FATIAS, b = C.y0 + (C.y1 - C.y0) * (i + 1) / FATIAS;
    const r = raioNoPoligono(rEm(b), C.lados);
    for (const [fx, fz] of CILINDRO)
      out.push({ x0: x - r * fx, x1: x + r * fx, y0: y + a, y1: y + b, z0: z - r * fz, z1: z + r * fz, ...SO_BALA });
  }
  const rr = raioNoPoligono(R.r, R.lados);
  for (const lado of [-1, 1])
    for (const [fz, fy] of CILINDRO)
      out.push({ x0: x + lado * R.x - R.esp / 2, x1: x + lado * R.x + R.esp / 2, y0: y + R.y - rr * fy, y1: y + R.y + rr * fy,
        z0: z - rr * fz, z1: z + rr * fz, ...SO_BALA });
  return out;
}
/* as paredes das atrações, na ordem em que o cliente as empilha */
export function paredesDasAtracoes(plano, heightAt) {
  return [painelDaGaleria(plano.galeria, heightAt), totemDosFogos(plano.fogos, heightAt), ...pecasDoCanhao(plano.canhao)];
}

// ---- Cama Elástica -------------------------------------------------------
// Impulso pra cima ao pousar numa placa. Bem abaixo do teto vertical do
// anti-cheat (120 m/s): quicar encadeado nunca acumula além disso.
export const BOUNCE_UP = 15;         // m/s
export function bounceVelocity(strength = 1) {
  return Math.min(28, BOUNCE_UP * strength); // trava dura de segurança
}

// ---- Aros de Acrobacia ---------------------------------------------------
/* O segmento P0→P1 (posição do frame anterior → atual) cruzou o disco do aro?
   center/normal definem o plano; radius é o raio do buraco. Puro e testável. */
export function passedRing(p0, p1, center, normal, radius) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
  const denom = dx * normal.x + dy * normal.y + dz * normal.z;
  if (Math.abs(denom) < 1e-9) return false;                 // paralelo ao aro
  const t = ((center.x - p0.x) * normal.x + (center.y - p0.y) * normal.y +
             (center.z - p0.z) * normal.z) / denom;
  if (t < 0 || t > 1) return false;                         // cruzou fora do passo
  const hx = p0.x + dx * t, hy = p0.y + dy * t, hz = p0.z + dz * t;
  const off = Math.hypot(hx - center.x, hy - center.y, hz - center.z);
  return off <= radius;
}

// posição de um aro ao longo de um curso reto que ergue e baixa (arco suave)
export function ringAt(origin, dir, i, n, spacing = 11, arcH = 7) {
  const t = n > 1 ? i / (n - 1) : 0;
  return {
    x: origin.x + dir.x * (i + 1) * spacing,
    z: origin.z + dir.z * (i + 1) * spacing,
    y: origin.y + 3.2 + Math.sin(t * Math.PI) * arcH, // sobe no meio, desce nas pontas
  };
}

// ---- Xilofone Gigante ----------------------------------------------------
/* Índice da placa sob (x,z), ou -1. plates: [{x,z,w,d}] (retângulos no chão). */
export function plateAt(x, z, plates) {
  for (let i = 0; i < plates.length; i++) {
    const p = plates[i];
    if (Math.abs(x - p.x) <= p.w / 2 && Math.abs(z - p.z) <= p.d / 2) return i;
  }
  return -1;
}
// escala pentatônica (Dó maior) — sempre soa alegre, nunca desafinado/sombrio
export const XYLO_NOTES = [523, 587, 659, 784, 880, 1047, 1175, 1319];

// ---- Recordes ------------------------------------------------------------
export function betterMax(prev, v) { const p = Number.isFinite(prev) ? prev : 0; return v > p ? v : p; }
export function betterTime(prev, v) { // menor tempo é melhor; 0/NaN = sem recorde
  const p = Number.isFinite(prev) && prev > 0 ? prev : Infinity;
  return v > 0 && v < p ? v : (Number.isFinite(p) ? p : 0);
}
