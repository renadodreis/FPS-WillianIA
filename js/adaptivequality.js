/* ================================================================
   ESCALA ADAPTATIVA DE RESOLUÇÃO — controlador puro (sem three, sem DOM).

   Por que existe: a mesma cena roda numa RTX e numa Intel UHD. Fixar
   qualidade pra todo mundo ou castiga o PC bom ou trava o fraco. Aqui
   o jogador escolhe o TETO e a máquina decide quanto consegue pagar.

   Duas travas contra "otimizar destruindo o jogo":
     1. Nunca passa do teto do jogador — a escolha dele é limite duro.
     2. Só desce quando o frame estoura POR CULPA DO RENDER. Se o
        gargalo é CPU (física, streaming de grama), derrubar pixel não
        acelera nada e só deixaria o jogo feio de graça.
   ================================================================ */

const DEFAULTS = {
  ceiling: 1.5,        // teto = min(devicePixelRatio, escolha do jogador)
  floor: 0.75,         // abaixo disso o jogo fica borrado demais
  step: 0.25,          // um degrau por decisão: sem tombo visível
  downMs: 20,          // p90 do frame acima disso (~<50 FPS) => desce
  upMs: 12,            // p90 do frame abaixo disso (~>83 FPS) => sobe
  renderShareMs: 6,    // p90 de (frame - simulação) precisa passar disso
  windowFrames: 45,    // ~0,75 s a 60 FPS: reage rápido sem tremer
  cooldownMs: 2500,    // trocar resolução realoca render target (custa)
  outlierMs: 250,      // troca de aba / carregamento não é evidência
  jitterMs: 2,         // p90-p10 abaixo disso = frame preso na cadência do monitor
  vsyncSlack: 1.12,    // margem sobre o período do monitor pra chamar de "travado"
  refreshMinMs: 4,     // 240 Hz
  refreshMaxMs: 34,    // 30 Hz
  upStreak: 2,         // janelas boas seguidas exigidas pra subir
  upStreakMax: 16,     // teto do arrependimento (ver `regret` abaixo)
};

function percentileAt(sorted, q) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1))];
}

export function createResolutionScaler(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  /* `res` sai de localStorage, que o jogador pode ter corrompido: `+"lixo"`
     é NaN e `renderer.setPixelRatio(NaN)` zera o canvas (tela preta). Lixo
     que entra aqui vira o padrão em vez de contaminar a escala. */
  const sane = (v, fallback) => (Number.isFinite(v) && v > 0 ? v : fallback);
  // teto sempre manda: um teto menor que o piso não pode inverter a faixa
  const floorOf = ceiling => Math.min(sane(cfg.floor, DEFAULTS.floor), ceiling);
  const clampScale = (v, ceiling) => Math.min(ceiling, Math.max(floorOf(ceiling), v));

  let ceiling = sane(cfg.ceiling, DEFAULTS.ceiling);
  let scale = clampScale(ceiling, ceiling);
  let lastChangeMs = -Infinity;
  let changes = 0, lastP90 = 0, lastRenderP90 = 0, lastRefreshMs = 0;
  let upStreak = 0, upStreakNeeded = cfg.upStreak, lastActionWasUp = false;
  const frames = [], renders = [];

  function clearWindow() { frames.length = 0; renders.length = 0; }

  function decide(nowMs) {
    const sortedFrames = frames.slice().sort((a, b) => a - b);
    const sortedRenders = renders.slice().sort((a, b) => a - b);
    lastP90 = percentileAt(sortedFrames, 0.9);
    lastRenderP90 = percentileAt(sortedRenders, 0.9);
    const p10 = percentileAt(sortedFrames, 0.1);
    clearWindow();

    // logo após uma troca os números ainda descrevem a resolução antiga
    if (nowMs - lastChangeMs < cfg.cooldownMs) return false;

    /* Com vsync ligado NENHUM frame desce do período do monitor: num 60 Hz
       o melhor caso possível é ~16,7 ms, bem acima de `upMs`. Sem enxergar
       isso, um pico isolado derrubaria a resolução e ela nunca mais teria
       "prova" de folga pra voltar — otimização virando perda permanente de
       qualidade. O sinal de folga aqui é o frame COLADO na cadência do
       monitor com jitter baixo; quem só atinge o vsync na média tem jitter
       alto e continua sem subir. */
    lastRefreshMs = Math.min(cfg.refreshMaxMs, Math.max(cfg.refreshMinMs, p10));
    const lockedToDisplay = (lastP90 - p10) < cfg.jitterMs &&
      lastP90 < lastRefreshMs * cfg.vsyncSlack;
    const slow = lastP90 > cfg.downMs && lastRenderP90 > cfg.renderShareMs;
    const headroom = lastP90 < cfg.upMs || lockedToDisplay;

    let next;
    if (slow) {
      // arrependimento: subiu e teve que voltar => dobra a exigência pra
      // não ficar piscando entre duas resoluções a cada poucos segundos
      if (lastActionWasUp) upStreakNeeded = Math.min(cfg.upStreakMax, upStreakNeeded * 2);
      upStreak = 0;
      next = scale - cfg.step;
    } else if (headroom) {
      if (++upStreak < upStreakNeeded) return false;
      next = scale + cfg.step;
    } else {
      upStreak = 0;
      return false;
    }

    next = clampScale(next, ceiling);
    if (next === scale) return false;
    if (next > scale) { upStreak = 0; lastActionWasUp = true; } else lastActionWasUp = false;
    scale = next;
    lastChangeMs = nowMs;
    changes++;
    return true;
  }

  return {
    /* Um frame de evidência. `simMs` é o tempo de CPU do jogo (física,
       IA, streaming); a diferença pro frame é o custo de render+present.
       Devolve true quando a resolução mudou neste push. */
    push(frameMs, simMs, nowMs) {
      if (!(frameMs > 0) || frameMs > cfg.outlierMs) return false;
      frames.push(frameMs);
      renders.push(Math.max(0, frameMs - (simMs > 0 ? simMs : 0)));
      return frames.length >= cfg.windowFrames ? decide(nowMs) : false;
    },
    /* O jogador mexeu na configuração (ou mudou de monitor). Devolve
       true quando a escala atual precisou ser puxada pra dentro. */
    setCeiling(value) {
      ceiling = sane(value, ceiling);
      clearWindow();
      upStreak = 0; // regime novo: a evidência anterior não vale mais
      const next = clampScale(scale, ceiling);
      if (next === scale) return false;
      scale = next;
      return true;
    },
    reset() {
      scale = clampScale(ceiling, ceiling);
      lastChangeMs = -Infinity;
      upStreak = 0;
      upStreakNeeded = cfg.upStreak;
      lastActionWasUp = false;
      clearWindow();
    },
    get scale() { return scale; },
    get ceiling() { return ceiling; },
    get samples() { return frames.length; },
    get stats() {
      return { scale, ceiling, changes, lastP90, lastRenderP90, lastRefreshMs, upStreakNeeded };
    },
  };
}
