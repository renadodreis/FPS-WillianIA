/* ================================================================
   Atrações do mapa — NÚCLEO PURO (sem THREE/DOM).
   Matemática das 5 brincadeiras: cama elástica, aros de acrobacia,
   xilofone gigante, campo de tiro e fogos. Mesmo código no navegador
   (js/maptoys.js) e nos testes de Node. Reusa pickSpot de cannon-core.
   ================================================================ */
import { pickSpot } from './cannon-core.js';
import { ASSENTO } from './paredes.js';
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
/* as paredes das atrações (hoje só o painel) */
export function paredesDasAtracoes(plano, heightAt) {
  return [painelDaGaleria(plano.galeria, heightAt)];
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
