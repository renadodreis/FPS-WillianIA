/* helpers de IA compartilhados entre as criaturas (PvE) */
import * as THREE from 'three';
import { retaNaMalha } from './obstaculos.js';

const _from = new THREE.Vector3(), _to = new THREE.Vector3();

/* ================================================================
   NO HELICÓPTERO, O PvE NÃO ALCANÇA O JOGADOR (regra do dono).

   Voando, js/heli.js escreve `player.pos` no CHÃO debaixo do helicóptero —
   é o ponto que recentra grama e chunks, não onde o jogador está. Todo bicho
   que mirava `player.pos` perseguia esse ponto, chegava debaixo do
   helicóptero e mordia/batia/atirava em quem estava lá em cima (medido em
   test/pve-heli.test.js: lobo 19, esqueleto 36, zumbi 26, fantasma 28,
   soldado 80, Visitante 153, Colosso 84 de dano "no ar").

   Regra: com `state.flying`, NENHUM PvE dá dano nem persegue. Não é
   "mirar no helicóptero": bicho no chão não alcança a cabine, e o soldado
   comum não tem arma antiaérea neste jogo — atirar para cima numa fuselagem
   blindada seria dano que o jogador não tem como evitar nem ver de onde vem.
   PvP segue igual (quem decide é o servidor).

   CARRO NÃO ENTRA NESTA REGRA, de propósito: os veículos são abertos
   (buggy, jipe, caminhão), andam no chão e o jogo já pune quem para no meio
   dos bichos — é o gênero (Far Cry, 7 Days to Die: parado no carro, o bicho
   alcança). E correndo acima de ~24 km/h nenhum deles acompanha. */
export function noHelicoptero(state) {
  return !!(state && state.flying);
}

/* o PONTO está dentro de alguma caixa sólida do mundo? (lajes incluídas:
   param bala, então também param golpe). `Structures.walls` é a lista viva. */
export function pontoEmSolido(p, Structures) {
  const walls = Structures && Structures.walls;
  if (!walls) return false;
  for (let i = 0; i < walls.length; i++) {
    const b = walls[i];
    if (p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1 && p.z > b.z0 && p.z < b.z1) return true;
  }
  return false;
}

/* o CORPO (círculo de raio r, altura h, pés em pos.y) sobrepõe uma parede?
   É exatamente a faixa em que Structures.collide expulsaria o bicho — então
   "nasceu aqui" = "vai ser cuspido da parede no primeiro quadro". */
export function corpoEmSolido(pos, r, h, Structures) {
  const walls = Structures && Structures.walls;
  if (!walls) return false;
  for (let i = 0; i < walls.length; i++) {
    const b = walls[i];
    if (b.noCollide) continue;
    if (pos.y + h < b.y0 || pos.y >= b.y1 - 0.12) continue;
    const nx = Math.max(b.x0, Math.min(b.x1, pos.x)), nz = Math.max(b.z0, Math.min(b.z1, pos.z));
    if ((pos.x - nx) ** 2 + (pos.z - nz) ** 2 < r * r) return true;
  }
  return false;
}

/* ================================================================
   PRIMEIRO OBSTÁCULO ao longo de um raio — a MESMA regra da bala do
   jogador (`rayBlockedAt` em game.js): parede (Structures.rayHit), chão e
   tronco/pedra (círculo com raio² × 0,8, só perto do chão, até 3,4 m).
   Diferenças deliberadas, ambas a favor de não atravessar nada:
   • o chão é marchado de 0,5 m em 0,5 m (a bala do jogador marcha 1,6 m e
     pula crista fina — é o passo do bot, scripts/bots.js LOS_MARCH_M);
   • o tronco é testado contra o SEGMENTO inteiro (a marcha de 1,6 m pode
     pular um tronco de 0,3 m entre dois passos).
   Devolve a distância até o obstáculo, ou Infinity se o raio passa livre
   até `maxDist`. `dir` tem de ser unitário. */
const PASSO_CHAO = 0.5, CELULA_OBST = 16, TRONCO_ALTO = 3.4;
export function primeiroObstaculo(o, dir, maxDist, { Structures = null, heightAt = null, obstaclesNear = null } = {}) {
  let best = maxDist;
  if (Structures) {
    if (typeof Structures.rayHit === 'function') {
      const tw = Structures.rayHit(o, dir, maxDist);
      if (tw < best) best = tw;
    } else if (typeof Structures.segBlocked === 'function') {
      _to.copy(o).addScaledVector(dir, maxDist);
      if (Structures.segBlocked(o, _to)) best = maxDist * 0.5; // sem distância exata: só "bloqueado"
    }
  }
  if (typeof heightAt === 'function') {
    for (let d = PASSO_CHAO; d < best; d += PASSO_CHAO) {
      const x = o.x + dir.x * d, z = o.z + dir.z * d;
      if (o.y + dir.y * d < heightAt(x, z)) { best = d - PASSO_CHAO * 0.5; break; }
    }
  }
  if (typeof obstaclesNear === 'function') {
    const dx = dir.x, dz = dir.z, h2 = dx * dx + dz * dz;
    if (h2 > 1e-10) {
      const passos = Math.max(1, Math.ceil(best / CELULA_OBST));
      for (let k = 0; k <= passos; k++) {
        const s = Math.min(best, k * CELULA_OBST);
        for (const c of obstaclesNear(o.x + dx * s, o.z + dz * s)) {
          if (c.bala === false) continue;             // só segura corpo (o círculo da pedra)
          if (c.malha) {                              // pedra: a malha desenhada, exata
            const h = retaNaMalha(c.malha, o.x, o.y, o.z, dir.x, dir.y, dir.z);
            if (h && h.entra && h.t < best) best = h.t;
            continue;
          }
          const t = ((c.x - o.x) * dx + (c.z - o.z) * dz) / h2;
          if (t <= 0 || t >= best) continue;
          const px = o.x + dx * t - c.x, pz = o.z + dz * t - c.z;
          if (px * px + pz * pz >= c.r * c.r * 0.8) continue;
          const y = o.y + dir.y * t;
          if (c.y1 !== undefined) { if (y < c.y0 || y >= c.y1) continue; }   // fatia: faixa absoluta
          else if (typeof heightAt === 'function' && y >= heightAt(c.x, c.z) + TRONCO_ALTO) continue;
          best = t;
        }
      }
    }
  }
  return best < maxDist ? best : Infinity;
}
const _seg = new THREE.Vector3();
export function linhaLivre(a, b, mundo) {
  _seg.copy(b).sub(a);
  const len = _seg.length();
  if (len < 1e-4) return true;
  _seg.multiplyScalar(1 / len);
  return primeiroObstaculo(a, _seg, len, mundo) === Infinity;
}

// true quando o corpo-a-corpo da criatura até o jogador está bloqueado por
// altura (andar diferente), parede (Structures.segBlocked), obstáculo do grid —
// ou porque a criatura está DENTRO do sólido (fantasma atravessando a parede:
// o slab test ignora a caixa que contém a origem, e o toque saía através dela).
export function meleeBlocked(group, playerPos, Structures, obstaclesNear) {
  _from.set(group.position.x, group.position.y + 1, group.position.z);
  _to.set(playerPos.x, playerPos.y + 0.9, playerPos.z);
  if (Math.abs(_to.y - _from.y) > 1.8) return true; // andar de cima/baixo
  if (pontoEmSolido(_from, Structures)) return true;
  if (Structures && typeof Structures.segBlocked === 'function' &&
      Structures.segBlocked(_from, _to)) return true;
  if (typeof obstaclesNear !== 'function') return false;
  const dx = _to.x - _from.x, dz = _to.z - _from.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-8) return false;
  for (const o of obstaclesNear((_from.x + _to.x) * 0.5, (_from.z + _to.z) * 0.5)) {
    if (o.corpo === false) continue;               // fatia de bala: o golpe usa o corpo da pedra
    const k = Math.max(0, Math.min(1,
      ((o.x - _from.x) * dx + (o.z - _from.z) * dz) / len2));
    const nx = _from.x + dx * k, nz = _from.z + dz * k;
    if ((nx - o.x) ** 2 + (nz - o.z) ** 2 < o.r * o.r) return true;
  }
  return false;
}
