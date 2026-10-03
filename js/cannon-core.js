/* ================================================================
   Canhão de Circo — NÚCLEO PURO (sem THREE, sem DOM).
   O MESMO código roda no navegador (js/cannon.js importa isto) e nos
   testes de Node. Aqui vive toda a matemática: perfil de lançamento,
   guarda anti-cheat, escolha determinística do ponto e recorde.
   ================================================================ */

// Perfil do arco: alto e alegre, com folga GRANDE contra os tetos do
// servidor (server.js: hSpd>90 rejeita, >55 vira strike; vSpd>120 rejeita).
// speed 38 m/s @52° → vh≈23,4 m/s  vy≈29,9 m/s → voo ~64 m, apogeu ~20 m.
export const LAUNCH = Object.freeze({
  speed: 38,                 // m/s no bocal
  pitch: 52 * Math.PI / 180, // elevação fixa
  gravity: 22,               // == GRAVITY do player (game.js)
  drag: 0.12,                // arrasto do ar por segundo em voo (quase nada)
  maxAir: 5,                 // teto de segurança do estado "lançado" (s)
});

// Tetos do anti-cheat do servidor (server.js:724). O lançamento tem que
// caber com folga nos DOIS eixos para nunca gerar strike nem rejeição.
export const ANTICHEAT = Object.freeze({ hStrike: 55, hReject: 90, vReject: 120 });

export function horizontalSpeed(prof = LAUNCH) { return prof.speed * Math.cos(prof.pitch); }
export function verticalSpeed(prof = LAUNCH)   { return prof.speed * Math.sin(prof.pitch); }

/* velocidade de lançamento a partir de uma direção HORIZONTAL já
   normalizada (o chamador extrai o forward da câmera e passa x,z). */
export function launchVelocity(dirX, dirZ, prof = LAUNCH) {
  const len = Math.hypot(dirX, dirZ) || 1;
  const vh = horizontalSpeed(prof), vy = verticalSpeed(prof);
  return { x: (dirX / len) * vh, y: vy, z: (dirZ / len) * vh };
}

/* alcance/apogeu balísticos ideais (sem arrasto) — contrato de "diversão"
   e ferramenta de tuning; usados nos testes. */
export function ballisticRange(prof = LAUNCH) {
  return horizontalSpeed(prof) * (2 * verticalSpeed(prof) / prof.gravity);
}
export function ballisticApex(prof = LAUNCH) {
  const vy = verticalSpeed(prof);
  return (vy * vy) / (2 * prof.gravity);
}

/* a trajetória REAL do disparo, no mesmo passo do jogo (game.js, voo do
   canhão: arrasto horizontal por quadro, depois a gravidade, depois a
   posição): pontos { d (m na horizontal), y (acima da saída) } até voltar à
   altura da saída. Com o arrasto o alcance é ~53 m, não os 64 da balística
   ideal — o curso de argolas, medido pela ideal, punha a 5ª argola a 55 m,
   depois do pouso (laudo f672d81, observação d). */
export function trajetoriaDoCanhao(prof = LAUNCH, passo = 1 / 60) {
  let vh = horizontalSpeed(prof), vy = verticalSpeed(prof), d = 0, y = 0;
  const pts = [{ d, y }];
  for (let i = 0; i < 2000; i++) {
    vh *= Math.max(0, 1 - prof.drag * passo);
    vy -= prof.gravity * passo;
    d += vh * passo; y += vy * passo;
    pts.push({ d, y });
    if (y < 0 && vy < 0) break;
  }
  return pts;
}
/* altura da trajetória a `dist` metros da saída (interpolada) */
export function alturaNaTrajetoria(pts, dist) {
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].d >= dist) {
      const a = pts[i - 1], b = pts[i], k = (dist - a.d) / ((b.d - a.d) || 1);
      return a.y + (b.y - a.y) * k;
    }
  }
  return pts[pts.length - 1].y;
}
/* o perfil respeita o anti-cheat com folga? guarda de contrato. */
export function withinAntiCheat(prof = LAUNCH, caps = ANTICHEAT) {
  return horizontalSpeed(prof) < caps.hStrike && verticalSpeed(prof) < caps.vReject;
}

/* TETO DE RAIO das atrações, medido do CENTRO DO MUNDO (0,0).
   O anel de busca é centrado na CIDADE (-340, 130), que já está a 363 m
   do centro; somando o anel (até 360 m) dava 700 m de alcance, e o único
   freio era `worldHalf` — que é POR EIXO (|x|,|z| ≤ 520). Como o score
   premia clareira, as atrações iam parar exatamente na borda vazia:
   medido em produção, campo de tiro em x = -519 e canhão/argolas em
   (-517, 436) — 676 m do centro, encostados na cerca (o jogador para em
   ±539 e árvore/pedra param em ±517, então o entorno era pelado).
   430 m mantém tudo dentro do mapa POVOADO e ainda deixa o anel com
   candidatos de sobra em qualquer seed. */
export const POI_MAX_RADIUS = 430;

/* Escolha DETERMINÍSTICA do "ponto mais vazio" alcançável — SEM rand
   (não toca o stream seedado do worldgen; idêntico em todos os clientes
   para a mesma seed). Varre um anel ao redor da cidade e devolve o ponto
   seco, plano e mais distante de qualquer estrutura.
     sites     : [{x,z,r}]  estruturas a evitar (Structures.sites)
     sampler   : (x,z) => { h, slope }  leitura do terreno
     maxRadius : teto de distância do centro do mundo (ver POI_MAX_RADIUS)
   Retorna { x, z, clearance } ou null (o chamador tem fallback). */
export function pickSpot({
  sites = [], avoid = [], cx = 0, cz = 0, sampler, waterLevel = 0,
  ringMin = 150, ringMax = 360, step = 12, arcSteps = 48,
  maxSlope = 0.28, worldHalf = 520, maxRadius = POI_MAX_RADIUS,
}) {
  if (typeof sampler !== 'function') return null;
  // `avoid` = pontos já ocupados por OUTRAS atrações (mesma unidade de sites);
  // entram como estruturas a evitar pra as atrações não se empilharem.
  const all = avoid.length ? sites.concat(avoid) : sites;
  // SCORING (não filtro rígido): sempre devolve o MELHOR ponto seco do anel —
  // prioriza clareira grande e penaliza encosta. Assim terreno acidentado nunca
  // devolve null (o que jogava o canhão pro fallback). null só quando NADA é
  // seco (mapa todo água), aí o chamador usa o fallback fixo.
  let best = null, bestScore = -Infinity;
  const arc = (Math.PI * 2) / arcSteps;
  for (let r = ringMin; r <= ringMax + 1e-9; r += step) {
    for (let i = 0; i < arcSteps; i++) {
      const a = i * arc;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (Math.abs(x) > worldHalf || Math.abs(z) > worldHalf) continue;
      // TETO RADIAL: filtro duro ANTES do score. Penalizar no score não
      // resolvia — num anel onde tudo está longe, "menos ruim" continuava
      // sendo a borda do mundo.
      if (Math.hypot(x, z) > maxRadius) continue;
      const s = sampler(x, z);
      if (!s || !Number.isFinite(s.h) || s.h <= waterLevel + 1.2) continue; // seco
      let clr = Infinity;
      for (const st of all) {
        const d = Math.hypot(x - st.x, z - st.z) - (st.r || 0);
        if (d < clr) clr = d;
      }
      // vazio conta muito; cada grau de slope acima do plano custa caro
      const score = clr - Math.max(0, (s.slope || 0) - maxSlope) * 300;
      // > estrito: a ordem de varredura (r e ângulo crescentes) fixa o empate
      if (score > bestScore + 1e-9) { bestScore = score; best = { x, z, clearance: clr }; }
    }
  }
  return best;
}

/* recorde pessoal (localStorage no cliente) */
export function betterRecord(prev, dist) {
  const p = Number.isFinite(prev) ? prev : 0;
  return dist > p ? dist : p;
}
