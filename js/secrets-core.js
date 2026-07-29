/* ================================================================
   SEGREDOS DO MAPA — NÚCLEO PURO (sem THREE, sem DOM).

   Três armas do arsenal nascem `locked: true` (js/weapons.js) e NÃO
   tinham fonte de desbloqueio nenhuma no solo: FACA "AURORA" (5),
   SNIPER "AGULHA" (6) e ESCOPETA "RAJADA" (7). Só BAZUCA (heliponto)
   e PLASMA (matar o Visitante) eram alcançáveis. Conteúdo pronto e
   morto.

   Aqui cada uma vira o prêmio de um segredo DESCOBRÍVEL — a regra é
   pista → busca → recompensa. Segredo que ninguém acha é conteúdo
   morto do mesmo jeito, então todo segredo tem um sinal no mundo
   (feixe/marco/placa acesa) e um ícone no radar.

   Puro e sem RNG: escolhas de lugar são determinísticas a partir do
   que o worldgen já produziu, então todo cliente da mesma seed vê o
   segredo no mesmo lugar sem tocar o stream seedado.
   ================================================================ */

/* placas do xilofone (js/maptoys.js) na ordem da melodia. NÃO é a
   escala subindo de propósito: 0,1,2,3,4 o jogador acerta sem olhar a
   pista, e aí não é segredo — é acidente. A tábua ao lado do xilofone
   mostra estes 5 índices como quadrados nas MESMAS cores das placas. */
export const MELODY = Object.freeze([2, 0, 4, 1, 6]);

export const SECRETS = Object.freeze([
  Object.freeze({
    id: 'ninho', weapon: 6, name: 'NINHO DO ATIRADOR',
    hint: 'Uma luz vermelha no alto da torre mais distante do mapa.',
  }),
  Object.freeze({
    id: 'cofre', weapon: 7, name: 'COFRE LACRADO',
    hint: 'Dentro do prédio aberto mais fundo na cidade — o cadeado é o alvo.',
  }),
  Object.freeze({
    id: 'melodia', weapon: 5, name: 'A MELODIA',
    hint: 'A tábua ao lado do xilofone mostra cinco cores. Toque nessa ordem.',
  }),
]);

/* A torre de vigia mais LONGE do centro do mundo vira o ninho: o
   prêmio pela verticalidade nova fica onde quase ninguém passa.
   Desempate por (x, z) pra não depender da ordem de `sites`. */
export function pickNestTower(sites) {
  let best = null, bestD = -Infinity;
  for (const s of sites) {
    if (s.type !== 'torre') continue;
    const d = Math.hypot(s.x, s.z);
    if (d > bestD || (d === bestD && best && (s.x < best.x || (s.x === best.x && s.z < best.z)))) {
      bestD = d; best = s;
    }
  }
  return best;
}

/* O cofre vai no térreo oco mais FUNDO na cidade (mais longe da Torre
   Nexus): obriga a atravessar o campo de batalha, não é o primeiro
   prédio que se vê da praça. */
export function pickVaultInterior(interiors, center) {
  let best = null, bestD = -Infinity;
  for (const it of interiors) {
    const d = Math.hypot(it.bx - center.x, it.bz - center.z);
    if (d > bestD || (d === bestD && best && it.bx < best.bx)) { bestD = d; best = it; }
  }
  return best;
}

/* Máquina da melodia. Perdoa erro NA HORA: uma nota errada zera, mas se
   a errada for a primeira da sequência já conta como recomeço — senão o
   jogador teria que sair do xilofone e voltar pra tentar de novo. */
export function createMelodyTracker(sequence = MELODY) {
  const st = {
    progress: 0,
    get length() { return sequence.length; },
    step(plate) {
      if (plate === sequence[st.progress]) {
        st.progress += 1;
        if (st.progress >= sequence.length) {
          st.progress = 0;
          return { hit: true, solved: true };
        }
        return { hit: true, solved: false };
      }
      st.progress = plate === sequence[0] ? 1 : 0;
      return { hit: false, solved: false };
    },
    reset() { st.progress = 0; },
  };
  return st;
}
