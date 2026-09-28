/* ================================================================
   ASSISTÊNCIA DE MIRA DO TOQUE — núcleo PURO.

   Sem three, sem DOM, sem `Math.random`: o PRNG global é seedado e a ordem
   de consumo é contrato do worldgen (CLAUDE.md). Vetores entram como objetos
   `{x, y, z}` soltos; quem desenha a cena, a linha de visada e o chão é
   INJETADO (`los`, `heightAt`, `root`). Testável sem navegador:
   test/aim-assist-core.test.js.

   O MODELO (docs/mobile/referencia-mira-toque.md §1.2, §1.3 e §6 P0-2):
   · SLOW — sobre o alvo, o giro que AFASTA dele é reduzido; o eixo que vai
     PARA ele passa inteiro (Lyra `bUseDynamicSlow`), e o slow nunca acelera
     eixo nenhum. Friction pura não alcança alvo rápido (Insomniac 12:53) —
     por isso ele nunca age sozinho.
   · PULL — "a percentage of the rotation needed to stay on target" (Lyra
     .cpp l. 675): uma fração do quanto a DIREÇÃO do alvo mudou desde o frame
     anterior, vista do olho. Isso é o movimento RELATIVO (alvo andando E
     jogador andando). Não é ímã pro centro: alvo parado não puxa nada.
   · SÓ COM O JOGADOR MEXENDO (`bRequireInput`): slow exige arrasto de
     olhar; pull aceita olhar OU analógico, e só andando é escalado pelo
     quanto o jogador vai de LADO (Lyra .cpp l. 680) com o piso de −25 % do
     CoD BO7 ("if only the left stick is being controlled").
   · DUAS ZONAS medidas contra a SILHUETA ANGULAR do alvo (a esfera de cada
     parte projetada), com piso para alvo longe (Insomniac 09:33). Na zona
     interna a força é cheia; na externa ela desce em rampa até zero na borda
     (Insomniac: "inside the inner box, the value was 1 [...] and we ramp up
     in between"). As margens encolhem com o zoom, junto com a imagem (Lyra
     divide profundidade e alcance pelo fator de FOV).
   · HISTERESE: o alvo anterior ganha vantagem na escolha, para outro que
     cruze a cruz não roubar a assistência (Insomniac 10:09).

   VISIBILIDADE — NUNCA ASSISTE QUEM O JOGADOR NÃO VÊ. Uma assistência que
   "gruda" em alguém atrás da parede ou deitado no mato é informação vazada,
   da mesma família do wallhack de grama que já foi deployado nesta base.
   Uma parte do alvo só entra na silhueta se passar TODOS os testes:
     1. o objeto é DESENHADO — visível e pendurado na cena até a raiz (objeto
        com `visible: true` e sem pai não é desenhado por ninguém: formato 5
        do "teste que passa por acidente");
     2. está dentro do frustum e do alcance (que a neblina limita);
     3. a linha de visada do olho até ela está livre — no jogo, o MESMO
        `rayBlockedAt` que decide se o tiro passa (terreno, estruturas, troncos)
        E nada DESENHADO na frente (js/oclusao.js: veículo, copa e galho,
        painel, tenda, castelo — o que a tela mostra e a bala atravessa ou
        nem conhece). `los(olho, ponto, raio, alvo)` recebe o alvo para que o
        corpo dele nunca tampe a si mesmo.
   E o alvo só conta como VISTO se ao menos uma parte com linha livre não
   pode estar coberta pela GRAMA — que não é linha de visada (o raio
   atravessa) mas esconde. Dois jeitos de saber, e o melhor manda:
     · `grama(olho, ponto, r)` injetada: a grama DESENHADA no caminho inteiro
       (js/oclusao.js, `gramaCobre`: lâmina por lâmina, como o shader a põe).
       Ela resolve os dois defeitos da regra de altura: a grama NO CAMINHO
       (A2, validacao-6aeda6c.md — a linha até a cabeça passava 0,19 m acima
       de uma crista gramada, 0 px na tela, e a assistência agia) e o chão
       SEM grama (o alvo agachado, cabeça a 1,08 m, nunca era "visto" nem na
       rua: 0 de 8 rumos, medido pela frente de postura);
     · sem ela, a regra de ALTURA: a parte a ≥ `grassTop` do chão do alvo
       (1,33 m, o topo da lâmina mais alta).
   A parte que a grama pode cobrir continua silhueta de quem JÁ está à vista,
   mas não põe ninguém à vista.

   TIRO AUTOMÁTICO SÓ EM ALVO DE COMBATE (A8-e, validacao-6aeda6c.md: 10
   disparos nos discos do campo de tiro, que moram em `extraTargets` junto dos
   esqueletos, zumbis e bichos). "Fire at any foe that enters your crosshairs"
   (WZM, referência §2.5); "look at a target and have the selected weapon
   fire" (Fortnite, §2.4). Quem é combate o JOGO diz (`combate(t)` injetado);
   sem ele, só o alvo que se declara (`t.combate === true`). Na dúvida, não
   atira: um alvo novo que ninguém classificou fica sem automático — defeito
   que aparece na primeira partida, em vez de tiro sozinho no que não é
   inimigo (o que, no BR, ainda denuncia a posição para os bots, B8).
   A ASSISTÊNCIA (slow/pull) continua agindo no disco, e isso é decisão: o
   campo de tiro existe para treinar a MIRA, e treinar sem a ajuda que o
   combate tem ensina outra mão. O Lyra só assiste quem se declara alvo
   (`IAimAssistTaggedTargetInterface`, §1.2) — o disco se declara alvo pelo
   mesmo contrato `hitSpheres()` do tiro. O que A8(e) proíbe é o GATILHO.
   ================================================================ */

const DEG = Math.PI / 180;

/* Números de partida. Os de força são a METADE dos padrões do Lyra — é o que
   o Fortnite rodou em produção em 2020 (datamine do hotfix, §1.2). Margens,
   piso, rampa de perto e alcance automático são INFERÊNCIA (§6 marca assim):
   calibrar com jogador NOVATO (Insomniac 21:03), não com quem desenvolve. */
export const AIM = Object.freeze({
  BASE_FOV: 75,                // FOV vertical do quadril (game.js): margens valem nele
  PULL: Object.freeze({ hipIn: 0.30, hipOut: 0.25, adsIn: 0.35, adsOut: 0.20 }),
  SLOW: Object.freeze({ hipIn: 0.30, hipOut: 0.25, adsIn: 0.35, adsOut: 0.20 }),
  INNER_DEG: 0.5,              // margem interna além da silhueta
  OUTER_DEG: 3.0,              // margem externa além da silhueta
  FLOOR_DEG: 0.6,              // raio angular mínimo de uma parte (alvo longe)
  HYST_DEG: 0.5,               // vantagem do alvo anterior na escolha
  RANGE: 100,                  // m no FOV base (Lyra TargetRange 10000 uu); cresce com o zoom
  CLOSE_NEAR: 3,               // m: abaixo disto a força fica no piso
  CLOSE_FAR: 15,               // m: acima disto a força é cheia (Insomniac: "under 15 meters")
  CLOSE_FLOOR: 0.4,            // piso de perto — ver `closeK`
  LOOK_HOLD: 0.12,             // s: dedo que parou há pouco ainda conta como "mirando"
  STRAFE_PENALTY: 0.75,        // só andando: −25 % (CoD BO7, "Minimum Rotational Aim Assist penalty")
  PULL_IN: 60, PULL_OUT: 4,    // /s — Lyra PullLerpInRate/OutRate
  SLOW_IN: 60, SLOW_OUT: 20,   // /s — solta rápido: slow que sobra depois do alvo é lerdeza
  MAX_PULL: 1.0,               // rad/s: teto do pull ("prevent it from yanking the player's view")
  MAX_CANDIDATES: 3,           // alvos que pagam raycast por frame
  GRASS_TOP: 1.33,             // m: 1,4 × GRASS_HEIGHT (js/grass.js ALTURA_MAX)
  JUMP: 0.5,                   // rad/frame: mudança maior que isto é teleporte, não movimento
});

/* Por arma. `k` multiplica slow e pull. Sem assistência na bazuca e na faca
   (o Fortnite nem dispara automático com lançador e corpo a corpo, §2.4);
   sniper/DMR com −50 % (Insomniac: "for our sniper rifle [...] reducing
   magnetism by 50%"). Tiro automático só no fuzil, escopetas e plasma
   (§6 P0-3), com o alcance da arma (WZM: "fire only at targets within the
   weapon's range"; CoD Mobile: "limiting auto hip fire range"). Os alcances
   são INFERÊNCIA: o espalhamento do quadril do fuzil (0,014 rad) abre 0,84 m
   a 60 m, e o das escopetas (0,05 rad) 0,75 m a 15 m. */
export const WEAPON_ASSIST = Object.freeze({
  rifle:    Object.freeze({ k: 1, auto: true, autoRange: 60 }),
  plasma:   Object.freeze({ k: 1, auto: true, autoRange: 45 }),
  shotgun:  Object.freeze({ k: 1, auto: true, autoRange: 15 }),
  marksman: Object.freeze({ k: 0.5, auto: false, autoRange: 0 }),
  launcher: Object.freeze({ k: 0, auto: false, autoRange: 0 }),
  melee:    Object.freeze({ k: 0, auto: false, autoRange: 0 }),
});

/* Classe pela MECÂNICA da arma, não pelo nome (js/weapons.js). Semi-automática
   de um projétil só é arma de precisão: DMR e sniper. */
export function weaponClass(gun) {
  const g = gun && typeof gun === 'object' ? gun : {};
  if (g.melee) return 'melee';
  if (g.rocket) return 'launcher';
  if (g.laser) return 'plasma';
  if ((g.pellets || 1) > 1) return 'shotgun';
  if (!g.auto) return 'marksman';
  return 'rifle';
}

/* tan(fov/2) / tan(base/2): quanto a imagem encolhe em ângulo com o zoom.
   Lyra: "This is the proper way to scale based off FOV changes." */
export function tanRatio(fovDeg, baseDeg) {
  const a = Math.tan(fovDeg * DEG / 2), b = Math.tan(baseDeg * DEG / 2);
  return b > 0 && a > 0 ? a / b : 1;
}

/* Desenhado = visível e pendurado na raiz da cena, com todos os pais visíveis. */
export function isRendered(obj, root) {
  let o = obj;
  for (let i = 0; o && i < 64; i++) {
    if (!o.visible) return false;
    if (o === root) return true;
    o = o.parent;
  }
  return false;
}

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (cur, tgt, inRate, outRate, dt) =>
  cur + (tgt - cur) * (1 - Math.exp(-(tgt > cur ? inRate : outRate) * dt));
/* o giro deste eixo vai na direção do alvo? (em cima dele, não: lá qualquer
   giro afasta) */
const rumo = (giro, desvio) => giro !== 0 && Math.abs(desvio) > 1e-9 && Math.sign(giro) === Math.sign(desvio);

/* Força no perto. A Insomniac zerava abaixo de 15 m (console, "targets that
   are up close [...] tapering off aim assist to zero"); o CoD, com dados de
   partida multiplayer, só REDUZ de perto ("scale over a short distance") —
   porque lá o controle ganhava do mouse no curto alcance. Aqui o toque perde
   do mouse justamente de perto (o dedo tem 422 px de curso para 77°), e zerar
   tiraria a ajuda das escopetas quase sempre. Então: rampa até um PISO, não
   até zero. INFERÊNCIA a calibrar. */
function closeK(dist) {
  const t = clamp01((dist - AIM.CLOSE_NEAR) / (AIM.CLOSE_FAR - AIM.CLOSE_NEAR));
  return AIM.CLOSE_FLOOR + (1 - AIM.CLOSE_FLOOR) * t;
}

/* PULL de UM eixo. `n` = quanto o alvo andou neste quadro, visto do olho (o
   giro que o manteria parado na tela); `resto` = quanto falta, DEPOIS do
   dedo, até a parte mirada; `k` = força. Devolve k·n ("a percentage of the
   rotation needed to stay on target", Lyra .cpp l. 675) — com duas travas.

   O DEFEITO (validador, 7515734, A5-c): o dedo que copia o alvo com 150 ms de
   atraso rastreava PIOR a 20 m com a assistência (4,64° × 4,34°). Reproduzido
   no núcleo: o pull empurrava a cruz PARA ALÉM do centro do alvo, e o slow
   (que freia o dedo que "se afasta") a travava lá, adiantada. Na virada do
   alvo a cruz adiantada estava do lado errado: 8,32° de erro contra 4,50° sem
   assistência. Um jogador que acompanha a velocidade E corrige a posição
   piorava até +22,5 % (a 30 m, 60 °/s).

   1. Só com a cruz ATRÁS do alvo no sentido em que ele anda. Com a cruz à
      frente, o alvo vem até ela sozinho; puxar junto só atrasa o encontro
      (A5-b) e é o que a deixava adiantada. A Insomniac só centralizava
      "turning towards the center of the target" (11:32).
   2. Nunca mais que o `resto`: a assistência não faz a cruz CRUZAR a parte
      mirada (A4: "0 cruzamentos causados pela assistência").

   O que foi medido e RECUSADO: interpolar o dedo rumo ao rastreio perfeito
   (Insomniac 10:29, "interpolating between the player's input and that target
   input") limitando o pull ao que falta ao dedo. Não piorou nenhum caso, mas
   tirou 73 % da ajuda de quem corrige pelo erro (cenário (b) do teste de
   jogo: 35,3 % → 9,4 % de erro a menos a 20 m) sem melhorar nenhum outro — as
   duas travas acima sozinhas já zeram o dano. */
function puxa(n, resto, k) {
  if (!(k > 0) || n === 0) return 0;
  const sg = n > 0 ? 1 : -1;
  if (resto * sg <= 0) return 0;
  return sg * Math.min(k * Math.abs(n), Math.abs(resto));
}

const MAX_SPH = 8;

export function createAimAssist(deps) {
  const d = deps && typeof deps === 'object' ? deps : {};
  const los = typeof d.los === 'function' ? d.los : () => false;   // sem teste de visada: nada é visto
  const heightAt = typeof d.heightAt === 'function' ? d.heightAt : () => 0;
  const root = d.root || null;
  const grassTop = typeof d.grassTop === 'number' && Number.isFinite(d.grassTop) ? d.grassTop : AIM.GRASS_TOP;
  // A8(e): quem é alvo de COMBATE (jogador, bot, chefe, inimigo PvE) — só nele o automático dispara
  const combate = typeof d.combate === 'function' ? d.combate : t => t.combate === true;
  // A2: a grama desenhada no CAMINHO até a parte; sem a camada, a regra de altura no pé do alvo
  const grama = typeof d.grama === 'function' ? d.grama : null;

  /* pool de candidatos: nada de alocação por frame no caminho quente */
  const pool = [];
  function slot(i) {
    let c = pool[i];
    if (!c) {
      c = { t: null, n: 0, gap: 0, score: 0, cx: 0, cy: 0, cz: 0,
        x: new Float64Array(MAX_SPH), y: new Float64Array(MAX_SPH), z: new Float64Array(MAX_SPH),
        r: new Float64Array(MAX_SPH), dist: new Float64Array(MAX_SPH), sep: new Float64Array(MAX_SPH),
        ang: new Float64Array(MAX_SPH), inF: new Uint8Array(MAX_SPH), vis: new Uint8Array(MAX_SPH),
        visGap: 0, aim: -1, seen: false, hit: false, hitDist: 0 };
      pool[i] = c;
    }
    return c;
  }
  const order = [];
  const eyeP = { x: 0, y: 0, z: 0 }, cP = { x: 0, y: 0, z: 0 };

  let prevTarget = null;           // histerese
  let prevAngT = null, prevPsi = 0, prevTheta = 0;   // pull: direção do alvo no frame anterior
  let holdT = 0;                   // "dedo mexendo" recente
  let slowCur = 0, pullCur = 0;
  let losCalls = 0;

  const out = { yaw: 0, pitch: 0, fire: false, target: null, zone: 0, slow: 0, pull: 0,
    pullYaw: 0, pullPitch: 0, dist: 0, candidates: 0, losCalls: 0 };

  function reset() {
    prevTarget = null; prevAngT = null; holdT = 0; slowCur = 0; pullCur = 0;
  }

  function step(f) {
    const dt = Math.min(0.1, Math.max(0, +f.dt || 0));
    const inYaw = +f.inYaw || 0, inPitch = +f.inPitch || 0;
    out.yaw = inYaw; out.pitch = inPitch; out.fire = false; out.target = null; out.zone = 0;
    out.pullYaw = 0; out.pullPitch = 0; out.candidates = 0; out.losCalls = 0;
    losCalls = 0;

    if (inYaw !== 0 || inPitch !== 0) holdT = AIM.LOOK_HOLD;
    else holdT = Math.max(0, holdT - dt);
    const looking = holdT > 0;
    const strafe = Math.abs(+f.strafe || 0);

    const wa = WEAPON_ASSIST[f.weapon] || WEAPON_ASSIST.rifle;
    const assistOn = !!f.assist && wa.k > 0 && (looking || strafe > 0.05);
    const fireOn = !!f.autoFire && wa.auto && !!f.canFire;
    if (!assistOn && !fireOn) {
      /* ninguém pediu nada: nenhum raycast, e o histórico do pull é jogado
         fora (o primeiro frame de volta não tem "antes" confiável) */
      prevAngT = null; prevTarget = null; slowCur = 0; pullCur = 0;
      out.slow = 0; out.pull = 0;
      return out;
    }

    /* base da câmera (Euler YXZ do three, sem roll): frente, direita, cima */
    const psi = +f.yaw || 0, theta = +f.pitch || 0;
    const sP = Math.sin(psi), cP_ = Math.cos(psi), sT = Math.sin(theta), cT = Math.cos(theta);
    const fx = -sP * cT, fy = sT, fz = -cP_ * cT;
    const rx = cP_, rz = -sP;
    const ux = sP * sT, uy = cT, uz = cP_ * sT;
    const eye = f.eye || eyeP;
    const ex = +eye.x || 0, ey = +eye.y || 0, ez = +eye.z || 0;

    const fov = +f.fov > 0 ? +f.fov : AIM.BASE_FOV;
    const fs = tanRatio(fov, AIM.BASE_FOV);
    const tanV = Math.tan(fov * DEG / 2), tanH = tanV * (+f.aspect > 0 ? +f.aspect : 1);
    const inner = AIM.INNER_DEG * DEG * fs, outer = AIM.OUTER_DEG * DEG * fs;
    const floor = AIM.FLOOR_DEG * DEG * fs, hyst = AIM.HYST_DEG * DEG * fs;
    const maxR = +f.maxRange > 0 ? +f.maxRange : Infinity;
    const range = Math.min(AIM.RANGE / fs, maxR);

    /* ---- 1. coleta: desenhado, no frustum, no alcance, perto da cruz ---- */
    let n = 0;
    const lists = Array.isArray(f.lists) ? f.lists : [];
    for (let li = 0; li < lists.length; li++) {
      const list = lists[li];
      if (!list || typeof list[Symbol.iterator] !== 'function') continue;
      for (const t of list) {
        if (!t || !t.alive || t.enabled === false || t.ship === true) continue;
        if (typeof t.hitSpheres !== 'function') continue;
        if (!isRendered(t.group || t.mesh, root)) continue;
        const sph = t.hitSpheres();
        if (!sph || !sph.length) continue;
        const c = slot(n);
        c.t = t; c.n = 0; c.gap = Infinity; c.cx = 0; c.cy = 0; c.cz = 0;
        let cnt = 0;
        for (let i = 0; i < sph.length && c.n < MAX_SPH; i++) {
          const s = sph[i];
          if (!s || !s.c) continue;
          const sx = +s.c.x, sy = +s.c.y, sz = +s.c.z, r = +s.r > 0 ? +s.r : 0;
          if (!Number.isFinite(sx + sy + sz)) continue;
          c.cx += sx; c.cy += sy; c.cz += sz; cnt++;
          const vx = sx - ex, vy = sy - ey, vz = sz - ez;
          const dist = Math.hypot(vx, vy, vz);
          const k = c.n++;
          c.x[k] = sx; c.y[k] = sy; c.z[k] = sz; c.r[k] = r; c.dist[k] = dist; c.vis[k] = 0;
          const cx = vx * rx + vz * rz, cy = vx * ux + vy * uy + vz * uz, cz = vx * fx + vy * fy + vz * fz;
          const inF = dist - r <= range && cz > 0.05 &&
            Math.abs(cx) <= cz * tanH + r && Math.abs(cy) <= cz * tanV + r;
          c.inF[k] = inF ? 1 : 0;
          const sep = Math.atan2(Math.hypot(cx, cy), cz);
          const ang = Math.asin(Math.min(1, dist > 0 ? r / dist : 1));
          c.sep[k] = sep; c.ang[k] = ang;
          if (inF) c.gap = Math.min(c.gap, sep - Math.max(ang, floor));
        }
        if (!cnt) continue;
        c.cx /= cnt; c.cy /= cnt; c.cz /= cnt;
        const isPrev = t === prevTarget;
        if (!(c.gap <= outer + (isPrev ? hyst : 0))) continue;
        c.score = c.gap - (isPrev ? hyst : 0);
        n++;
      }
    }
    out.candidates = n;

    /* ordena por pontuação (inserção: n é pequeno) */
    order.length = 0;
    for (let i = 0; i < n; i++) {
      const c = pool[i];
      let j = order.length;
      order.push(c);
      while (j > 0 && order[j - 1].score > c.score) { order[j] = order[j - 1]; j--; }
      order[j] = c;
    }

    /* ---- 2. visibilidade de verdade, só nos primeiros (custo com teto) ---- */
    let best = null;
    eyeP.x = ex; eyeP.y = ey; eyeP.z = ez;
    const lim = Math.min(order.length, AIM.MAX_CANDIDATES);
    for (let oi = 0; oi < lim; oi++) {
      const c = order[oi];
      c.seen = false; c.hit = false; c.visGap = Infinity; c.aim = -1;
      for (let k = 0; k < c.n; k++) {
        if (!c.inF[k]) continue;
        cP.x = c.x[k]; cP.y = c.y[k]; cP.z = c.z[k];
        losCalls++;
        if (!los(eyeP, cP, c.r[k], c.t)) continue;
        c.vis[k] = 1;
        if (!c.seen && (grama ? !grama(eyeP, cP, c.r[k]) : c.y[k] - heightAt(c.x[k], c.z[k]) >= grassTop)) c.seen = true;
      }
      if (!c.seen) continue;
      for (let k = 0; k < c.n; k++) {
        if (!c.vis[k]) continue;
        const g = c.sep[k] - Math.max(c.ang[k], floor);
        if (g < c.visGap) { c.visGap = g; c.aim = k; }
        // tiro automático: a cruz DENTRO da esfera (sem piso), no alcance da arma
        if (c.sep[k] <= c.ang[k] && c.dist[k] <= wa.autoRange) c.hit = true;
      }
      if (c.hit && fireOn && combate(c.t)) out.fire = true;
      const isPrev = c.t === prevTarget;
      const sc = c.visGap - (isPrev ? hyst : 0);
      if (c.visGap <= outer + (isPrev ? hyst : 0) && (!best || sc < best.score)) { best = c; best.score = sc; }
    }
    out.losCalls = losCalls;

    if (!assistOn || !best) {
      prevTarget = best ? best.t : null;
      prevAngT = null;
      slowCur = approach(slowCur, 0, AIM.SLOW_IN, AIM.SLOW_OUT, dt);
      pullCur = approach(pullCur, 0, AIM.PULL_IN, AIM.PULL_OUT, dt);
      out.slow = 0; out.pull = 0;
      return out;
    }

    /* ---- 3. força pela zona, pela arma e pela distância ---- */
    const ads = clamp01(+f.ads || 0);
    const k = best.aim;
    const g = best.visGap;
    let sTgt = 0, pTgt = 0;
    if (g <= inner) {
      out.zone = 2;
      sTgt = lerp(AIM.SLOW.hipIn, AIM.SLOW.adsIn, ads);
      pTgt = lerp(AIM.PULL.hipIn, AIM.PULL.adsIn, ads);
    } else if (g <= outer) {
      out.zone = 1;
      const w = 1 - (g - inner) / (outer - inner);
      sTgt = lerp(AIM.SLOW.hipOut, AIM.SLOW.adsOut, ads) * w;
      pTgt = lerp(AIM.PULL.hipOut, AIM.PULL.adsOut, ads) * w;
    }
    const kk = wa.k * closeK(best.dist[k]);
    sTgt *= kk; pTgt *= kk;
    slowCur = approach(slowCur, sTgt, AIM.SLOW_IN, AIM.SLOW_OUT, dt);
    pullCur = approach(pullCur, pTgt, AIM.PULL_IN, AIM.PULL_OUT, dt);
    out.target = best.t; out.dist = best.dist[k]; out.slow = slowCur; out.pull = pullCur;

    /* ---- 4. SLOW, POR EIXO: o eixo que vai PARA o alvo passa inteiro; o
       que afasta (ou que já está em cima dele) é freado ----
       Por eixo e não por projeção vetorial, e isso foi medido: decompor o
       arrasto em "rumo ao alvo" + resto e frear só o resto deixa sobrar uma
       componente no eixo que o jogador NÃO pediu — arrasto só vertical rumo a
       uma cabeça na diagonal virava giro horizontal. Aqui cada eixo só pode
       ficar igual ou menor (o slow "nunca deixa mais rápido que o normal"). */
    if ((inYaw !== 0 || inPitch !== 0) && slowCur > 0) {
      const ax = best.x[k] - ex, ay = best.y[k] - ey, az = best.z[k] - ez;
      const oPsi = wrap(Math.atan2(-ax, -az) - psi);
      const oTh = Math.atan2(ay, Math.hypot(ax, az)) - theta;
      const keep = 1 - slowCur;
      out.yaw = rumo(inYaw, oPsi) ? inYaw : inYaw * keep;
      out.pitch = rumo(inPitch, oTh) ? inPitch : inPitch * keep;
    }

    /* ---- 5. PULL: fração do giro que manteria a mira no alvo ----
       Direção do CENTRO do alvo (todas as partes): é o movimento do corpo,
       e ela não salta quando uma parte entra ou sai de trás da cobertura.
       Quanto puxar, por eixo, é `puxa` (acima): só rumo ao alvo, e nunca
       além dele. */
    const vx = best.cx - ex, vy = best.cy - ey, vz = best.cz - ez;
    const tPsi = Math.atan2(-vx, -vz), tTh = Math.atan2(vy, Math.hypot(vx, vz));
    if (prevAngT === best.t && pullCur > 0) {
      const dPsi = wrap(tPsi - prevPsi), dTh = tTh - prevTheta;
      if (Math.abs(dPsi) < AIM.JUMP && Math.abs(dTh) < AIM.JUMP) {
        const scale = looking ? 1 : strafe * AIM.STRAFE_PENALTY;
        const kk = pullCur * scale;
        // quanto falta, DEPOIS do dedo, até a parte mirada (a mais perto da cruz)
        const ax = best.x[k] - ex, ay = best.y[k] - ey, az = best.z[k] - ez;
        const restoPsi = wrap(Math.atan2(-ax, -az) - (psi + out.yaw));
        const restoTh = Math.atan2(ay, Math.hypot(ax, az)) - (theta + out.pitch);
        let py = puxa(dPsi, restoPsi, kk), pp = puxa(dTh, restoTh, kk);
        const mag = Math.hypot(py * cT, pp), cap = AIM.MAX_PULL * dt;
        if (mag > cap && mag > 0) { py *= cap / mag; pp *= cap / mag; }
        out.pullYaw = py; out.pullPitch = pp;
        out.yaw += py; out.pitch += pp;
      }
    }
    prevAngT = best.t; prevPsi = tPsi; prevTheta = tTh;
    prevTarget = best.t;
    return out;
  }

  /* `last`: a saída do último frame (QA lê zona/alvo para validar o CENÁRIO;
     a medida do teste é a câmera contra a posição do alvo, não isto) */
  return { step, reset, get losCalls() { return losCalls; }, get last() { return out; } };
}

/* ================================================================
   RETÍCULA VERMELHA — "posso atirar" (docs/mobile/referencia-reticula.md).

   A cruz fica vermelha quando a LINHA DE MIRA (no jogo, as mesmas
   `miraOrigem`/`miraDirecao` do `fire()`) entra na esfera de acerto de um
   alvo de COMBATE, dentro do alcance útil da arma, e o jogador VÊ o que ela
   aponta. Halo: "the reticle will change to red if moved over an enemy";
   "if the enemy is not in range for that particular weapon, the reticle will
   still remain as blue" (referência §1).

   É uma CONSULTA, não assistência: não mexe na câmera, no tiro nem no
   `createAimAssist` acima. Reusa dele o que decide quem é quem — `isRendered`,
   a categoria `combate` e as mesmas `los`/`grama` injetadas (no jogo:
   `rayBlockedAt` do tiro + js/oclusao.js).

   NUNCA VIRA WALLHACK. Pintar a cruz sobre alguém que a tela não mostra é a
   mesma informação vazada da assistência que "gruda" atrás da parede — a
   família do wallhack de grama que já foi deployado. Por isso a régua aqui é
   MAIS estrita que a da assistência, e sem folga nenhuma:
     1. a esfera sob a cruz é a do alvo MAIS PERTO na linha (o tiro pega o da
        frente: disco na frente do inimigo = branca);
     2. o alvo é de combate e está desenhado (pendurado na cena, visível);
     3. a linha da cruz, do olho até o ponto dela MAIS PERTO do centro da
        parte (dentro do corpo, não na casca da esfera), está livre — no
        mundo do tiro e no que a tela desenha, sem folga; a grama, até meio
        raio antes desse ponto (a folga da assistência: lâmina DENTRO do
        corpo não cobre nada, o corpo é que a cobre);
     4. o CENTRO da parte também é visto do olho (`los` sem folga, grama com a
        mesma folga). A esfera é maior que o corpo: sem isto, a casca que
        vaza para o lado de cá de uma parede oblíqua, de um chassi ou de uma
        touceira acenderia a cruz sobre o obstáculo.
   Na dúvida, branca: o custo de errar para o lado seguro é a cruz não
   avermelhar num canto; o do outro lado é informação que a tela não deu.

   HISTERESE SÓ NA SAÍDA: acende no primeiro quadro, apaga `SEGURA` segundos
   depois do último (o "fade timer" do Quake III, referência §3) — e só
   quando a cruz saiu para o NADA ou para além do alcance. Sobre alvo
   escondido ou neutro, morte do alvo e vista inativa apagam na hora.
   ================================================================ */
export const RETICULA = Object.freeze({
  /* m: raio do cone de espalhamento no limite do alcance. É a régua do
     `autoRange` do fuzil acima (0,014 rad × 60 m) — INFERÊNCIA: no limite,
     1 tiro em 4 do cone cai dentro do raio do tronco (0,42 m). */
  RAIO_UTIL: 0.84,
  TETO: 240,       // m: o hitscan do `fire()` não passa disso
  FACA: 2.6,       // m: o golpe da faca (`__BR_melee`, br-game.js)
  SEGURA: 0.1,     // s: quanto a cruz fica vermelha depois de sair do alvo
});

/* Alcance útil: onde o cone da arma (o MESMO `lerp(spreadHip, spreadAds,
   adsT)` do `fire()`, sem o movimento) abre `RAIO_UTIL`. Cresce na mira,
   como o "red reticle range" do Halo ("whether the player is hip-firing or
   zoomed in"). Faca: o golpe. */
export function alcanceUtil(gun, adsT) {
  const g = gun && typeof gun === 'object' ? gun : {};
  if (g.melee) return RETICULA.FACA;
  const hip = Number.isFinite(+g.spreadHip) ? +g.spreadHip : 0;
  const mira = Number.isFinite(+g.spreadAds) ? +g.spreadAds : hip;
  const s = lerp(hip, mira, clamp01(+adsT || 0));
  return s > 0 ? Math.min(RETICULA.TETO, RETICULA.RAIO_UTIL / s) : RETICULA.TETO;
}

export function createReticula(deps) {
  const d = deps && typeof deps === 'object' ? deps : {};
  const los = typeof d.los === 'function' ? d.los : () => false;      // sem visada: nada é visto
  const grama = typeof d.grama === 'function' ? d.grama : null;
  const heightAt = typeof d.heightAt === 'function' ? d.heightAt : () => 0;
  const grassTop = typeof d.grassTop === 'number' && Number.isFinite(d.grassTop) ? d.grassTop : AIM.GRASS_TOP;
  const combate = typeof d.combate === 'function' ? d.combate : t => t.combate === true;
  const root = d.root || null;
  /* a grama cobre a linha até `p`? Sem a camada, a regra de ALTURA da
     assistência (a parte acima do topo da lâmina mais alta) */
  const coberto = (e, p, r, c) => (grama ? grama(e, p, r) : c.y - heightAt(c.x, c.z) < grassTop);

  const E = { x: 0, y: 0, z: 0 }, M = { x: 0, y: 0, z: 0 }, C = { x: 0, y: 0, z: 0 };
  let segura = 0, alvoSeguro = null;
  const out = { vermelha: false, alvo: null, dist: 0, motivo: '', consultas: 0 };

  function reset() { segura = 0; alvoSeguro = null; out.vermelha = false; }

  /* a esfera que a linha da cruz toca PRIMEIRO, entre todos os alvos vivos
     (o `fire()` escolhe o acerto do mesmo jeito); `b` recebe o resultado */
  const b = { t: null, tIn: Infinity, proj: 0, x: 0, y: 0, z: 0, r: 0 };
  function primeiraEsfera(lists, ex, ey, ez, dx, dy, dz) {
    b.t = null; b.tIn = Infinity;
    for (let li = 0; li < lists.length; li++) {
      const list = lists[li];
      if (!list || typeof list[Symbol.iterator] !== 'function') continue;
      for (const t of list) {
        if (!t || !t.alive || t.enabled === false || t.ship === true) continue;
        if (typeof t.hitSpheres !== 'function') continue;
        const sph = t.hitSpheres();
        if (!sph || !sph.length) continue;
        for (let i = 0; i < sph.length; i++) {
          const s = sph[i];
          if (!s || !s.c) continue;
          const sx = +s.c.x, sy = +s.c.y, sz = +s.c.z, r = +s.r > 0 ? +s.r : 0;
          if (!Number.isFinite(sx + sy + sz)) continue;
          const vx = sx - ex, vy = sy - ey, vz = sz - ez;
          const proj = vx * dx + vy * dy + vz * dz;
          if (proj < 0) continue;
          const d2 = vx * vx + vy * vy + vz * vz - proj * proj;
          if (d2 >= r * r) continue;
          const tIn = Math.max(0, proj - Math.sqrt(r * r - d2));
          if (tIn < b.tIn) { b.tIn = tIn; b.t = t; b.proj = proj; b.x = sx; b.y = sy; b.z = sz; b.r = r; }
        }
      }
    }
  }

  function step(f) {
    const dt = Math.min(0.1, Math.max(0, +f.dt || 0));
    out.alvo = null; out.dist = 0; out.motivo = ''; out.consultas = 0;
    if (!f.ativa) { reset(); out.motivo = 'inativa'; return out; }

    const eye = f.eye || E, dir = f.dir || E;
    const ex = +eye.x || 0, ey = +eye.y || 0, ez = +eye.z || 0;
    let dx = +dir.x || 0, dy = +dir.y || 0, dz = +dir.z || 0;
    const dl = Math.hypot(dx, dy, dz);
    let achou = null;
    if (dl > 1e-9) {
      dx /= dl; dy /= dl; dz /= dl;
      primeiraEsfera(Array.isArray(f.lists) ? f.lists : [], ex, ey, ez, dx, dy, dz);
      const range = +f.range > 0 ? +f.range : 0;
      if (!b.t) out.motivo = 'nada';
      else if (b.tIn > range) out.motivo = 'alcance';
      else if (!combate(b.t)) out.motivo = 'neutro';
      else if (!isRendered(b.t.group || b.t.mesh, root)) out.motivo = 'oculto';
      else {
        /* 3 e 4: a linha da cruz até o ponto dela mais perto do centro da
           parte, e o próprio centro — o corpo do alvo não tampa a si mesmo */
        E.x = ex; E.y = ey; E.z = ez;
        M.x = ex + dx * b.proj; M.y = ey + dy * b.proj; M.z = ez + dz * b.proj;
        C.x = b.x; C.y = b.y; C.z = b.z;
        out.consultas = 1;
        if (!los(E, M, 0, b.t)) out.motivo = 'tampado';
        else if (++out.consultas && coberto(E, M, b.r, C)) out.motivo = 'grama';
        else if (++out.consultas && !los(E, C, 0, b.t)) out.motivo = 'tampado-centro';
        else if (++out.consultas && coberto(E, C, b.r, C)) out.motivo = 'grama-centro';
        else { achou = b.t; out.alvo = b.t; out.dist = b.tIn; out.motivo = 'inimigo'; }
      }
    }

    /* A histerese só cobre a cruz que SAIU do alvo (céu, chão — nada sob
       ela) ou o alvo na borda do alcance. Nunca a cruz sobre alguém que a
       tela não mostra ou que não é inimigo: sem isto, varrer de um inimigo
       visível para outro atrás da parede deixava a cruz vermelha sobre a
       parede por `SEGURA` segundos — e o que a cruz pinta é onde ela ESTÁ. */
    if (achou) { segura = RETICULA.SEGURA; alvoSeguro = achou; }
    else if (out.motivo !== 'nada' && out.motivo !== 'alcance') segura = 0;
    else {
      segura = Math.max(0, segura - dt);
      if (alvoSeguro && (!alvoSeguro.alive || alvoSeguro.enabled === false)) segura = 0;
    }
    out.vermelha = !!achou || segura > 1e-9;
    if (!out.vermelha) alvoSeguro = null;
    return out;
  }

  /* `last`: a saída do último quadro (QA lê o MOTIVO para validar o cenário;
     a medida dos testes de tela é a cor computada da retícula) */
  return { step, reset, get last() { return out; } };
}
