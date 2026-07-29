/* ================================================================
   OVERLAY DE DIAGNÓSTICO (F3 ou ?perf=1)

   Por que existe: o contador de FPS sozinho MENTE. "60 FPS" com um
   engasgo de 90 ms a cada segundo é exatamente a sensação que o dono
   descreveu como travando — a média não vê o engasgo, o jogador vê.
   Aqui aparecem p50, p1% (o 1% pior), quantos engasgos aconteceram na
   janela, quantas draw calls e triângulos a cena está pagando e em que
   escala de resolução o adaptativo parou.

   Duas regras de construção:
     - o núcleo estatístico é PURO (sem DOM, sem three) pra ser testável;
     - o DOM nasce por JS, nada de tocar em index.html/style.css.

   Nada de three.js aqui: criar geometria/material consome 4 Math.random
   por UUID e deslocaria o mundo seedado. Overlay é só texto.

   Sobre draw calls: `WebGLRenderer.render()` chama `info.reset()` sozinho
   a cada passe. Com EffectComposer isso zera o contador entre os passes e
   o número final descreve só o ÚLTIMO. Enquanto o overlay está ligado ele
   assume o controle (`autoReset = false` + reset manual no começo do
   frame) e devolve o comportamento original ao desligar.
   ================================================================ */

const DEFAULTS = {
  capacity: 240,      // ~4 s a 60 FPS: janela curta o bastante pra reagir
  hitchFactor: 2.5,   // engasgo = frame N vezes pior que o p50 da janela...
  hitchFloorMs: 30,   // ...e acima disto (num jogo a 30 FPS, 33 ms é o normal)
};

/* q = 0.99 tem que devolver o piso do 1% PIOR: com 200 amostras os dois
   frames ruins são os índices 198 e 199, então o corte é o 198. */
function percentile(sorted, q) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)))];
}

/* Janela deslizante de tempos de frame. Só números finitos e positivos
   entram: `performance.now()` em aba escondida devolve saltos absurdos e
   `frameMs` no primeiro frame pode vir NaN. */
export function createFrameStats(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const buf = new Float64Array(cfg.capacity);
  const sorted = new Float64Array(cfg.capacity);
  let n = 0, head = 0, hitches = 0;
  // o snapshot ordena a janela: fica em cache pra não sortear duas vezes por
  // frame (uma na detecção de engasgo, outra na leitura do overlay)
  let cached = null;

  function snapshot() {
    if (cached) return cached;
    if (!n) return (cached = { samples: 0, p50: 0, p99: 0, worst: 0, fps: 0, hitches: 0 });
    const view = sorted.subarray(0, n);
    for (let i = 0; i < n; i++) view[i] = buf[i];
    view.sort();
    const p50 = percentile(view, 0.5);
    return (cached = { samples: n, p50, p99: percentile(view, 0.99), worst: view[n - 1],
      fps: p50 > 0 ? 1000 / p50 : 0, hitches });
  }

  return {
    push(ms) {
      if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return;
      // engasgo é SALTO relativo ao regime da janela, não número mágico:
      // quem joga a 30 FPS estáveis não pode ver 200 "engasgos"
      if (n >= 8) {
        const p50 = snapshot().p50;
        if (ms > cfg.hitchFloorMs && ms > p50 * cfg.hitchFactor) hitches++;
      }
      buf[head] = ms;
      head = (head + 1) % cfg.capacity;
      if (n < cfg.capacity) n++;
      cached = null;
    },
    reset() { n = 0; head = 0; hitches = 0; cached = null; },
    get stats() { return snapshot(); },
  };
}

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const compact = v => (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M'
  : v >= 1e3 ? (v / 1e3).toFixed(0) + 'k' : String(v));

/* Texto do overlay — separado do DOM pra ser testável. */
export function formatPerfLines({ stats, calls, triangles, scale, ceiling, simMs }) {
  const renderMs = Math.max(0, stats.p50 - (simMs || 0));
  return [
    `${fmt(stats.fps, 0)} FPS · p50 ${fmt(stats.p50)} ms · p1% ${fmt(stats.p99)} ms`,
    `engasgos ${stats.hitches} (pior ${fmt(stats.worst)} ms) · janela ${stats.samples}`,
    `draw ${calls} · tris ${compact(triangles)}`,
    `res ${fmt(scale, 2)} / teto ${fmt(ceiling, 2)}`,
    `sim ${fmt(simMs)} ms · render ~${fmt(renderMs)} ms`,
  ];
}

/* ---- camada fina de DOM ---- */
export function createPerfHud({ renderer, doc = document, win = window,
  getScale = () => 1, getCeiling = () => 1, toggleCode = 'F3', stats: statsOptions } = {}) {
  const frameStats = createFrameStats(statsOptions);
  let el = null, on = false, savedAutoReset = true;
  let calls = 0, triangles = 0;

  function ensureEl() {
    if (el) return el;
    el = doc.createElement('div');
    el.id = 'perfHud';
    // estilo inline: o overlay não pode depender do style.css (outra frente)
    el.style.cssText = [
      'position:fixed', 'left:8px', 'bottom:8px', 'z-index:99999',
      'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      'color:#d8f5ff', 'background:rgba(6,12,20,.72)', 'padding:6px 9px',
      'border:1px solid rgba(120,200,255,.28)', 'border-radius:6px',
      'pointer-events:none', 'white-space:pre', 'text-shadow:0 1px 2px #000',
    ].join(';');
    doc.body.appendChild(el);
    return el;
  }

  function setEnabled(next) {
    if (next === on) return on;
    on = next;
    if (on) {
      ensureEl().style.display = 'block';
      if (renderer && renderer.info) {
        savedAutoReset = renderer.info.autoReset;
        renderer.info.autoReset = false; // ver cabeçalho: senão o número mente
      }
      frameStats.reset();
    } else {
      if (el) el.style.display = 'none';
      if (renderer && renderer.info) renderer.info.autoReset = savedAutoReset;
    }
    return on;
  }

  /* começo do frame: zera o acumulador de draw calls do renderer */
  function beginFrame() {
    if (on && renderer && renderer.info) renderer.info.reset();
  }

  /* fim do frame: colhe os contadores e desenha o texto */
  function endFrame(frameMs, simMs) {
    if (!on) return;
    frameStats.push(frameMs);
    if (renderer && renderer.info) {
      calls = renderer.info.render.calls;
      triangles = renderer.info.render.triangles;
    }
    ensureEl().textContent = formatPerfLines({
      stats: frameStats.stats, calls, triangles,
      scale: getScale(), ceiling: getCeiling(), simMs,
    }).join('\n');
  }

  // liga por tecla (F3) e por query param (?perf=1) — sem tocar no index.html
  const onKey = e => { if (e.code === toggleCode) { e.preventDefault(); setEnabled(!on); } };
  if (win && win.addEventListener) win.addEventListener('keydown', onKey);
  try {
    if (win && win.location && /[?&]perf=1\b/.test(win.location.search)) setEnabled(true);
  } catch { /* sem location (QA em Node): segue desligado */ }

  return {
    beginFrame, endFrame,
    get enabled() { return on; },
    set enabled(v) { setEnabled(!!v); },
    get stats() { return frameStats.stats; },
    dispose() {
      setEnabled(false);
      if (win && win.removeEventListener) win.removeEventListener('keydown', onKey);
      if (el && el.parentNode) el.parentNode.removeChild(el);
      el = null;
    },
  };
}
