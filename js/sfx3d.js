/* ================================================================
   Áudio espacial — NÚCLEO PURO (sem WebAudio, sem THREE, sem DOM).
   Toda a política que decide QUEM toca, QUÃO ALTO e QUÃO ABAFADO
   mora aqui: mesma matemática no navegador (js/sfx.js) e nos testes
   de Node. js/sfx.js só traduz isto em nós do WebAudio.
   ================================================================ */

export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/* ----------------------------------------------------------------
   CATEGORIAS
   O mapa tem 1100 m de lado e VIEW_DIST 420 m. Os números abaixo são
   escolhidos pelo ALCANCE REAL de cada coisa, não por tutorial:

   ref   — raio de volume cheio (o "tamanho" da fonte)
   roll  — quão rápido cai depois do ref (modelo 'inverse' do PannerNode)
   max   — piso: além disso o ganho congela (tiro distante nunca some de vez)
   cull  — CORTE DURO: além disso nem vale criar voz (economia real de CPU)
   prio  — quem sobrevive ao roubo de voz num tiroteio
   occl  — vale gastar raycast de oclusão neste som?

   Referências de projeto: fuzil/DMR brigam de 30 a 250 m — a 40 m um
   tiro fica em 30% e a 200 m em ~5,7%: dá pra localizar sem virar lama.
   Passo de inimigo morre aos 45 m (ninguém ouve pisada a um quarteirão).
   Explosão é o único som que atravessa o mapa inteiro de propósito.
   ---------------------------------------------------------------- */
export const CATS = {
  boom:     { ref: 26, roll: 0.75, max: 420, cull: 420, prio: 4, occl: true  }, // explosão, cidade, trovão
  gun:      { ref: 12, roll: 1.0,  max: 340, cull: 340, prio: 3, occl: true  }, // tiro (seu ou de terceiros)
  vehicle:  { ref: 10, roll: 1.1,  max: 200, cull: 170, prio: 2, occl: false }, // motor, rotor, porta
  creature: { ref: 6,  roll: 1.3,  max: 130, cull: 110, prio: 2, occl: true  }, // rugido, gemido, pisão
  toy:      { ref: 8,  roll: 1.1,  max: 130, cull: 100, prio: 1, occl: false }, // atrações, fogos, argolas
  small:    { ref: 3,  roll: 1.6,  max: 60,  cull: 45,  prio: 0, occl: true  }, // passo, quique, item
};

/* Teto de vozes espaciais simultâneas.
   Cada voz custa 3 nós permanentes (gain + lowpass + panner equal-power)
   e é RECICLADA, nunca recriada: 24 vozes = 72 nós vivos no pior caso,
   qualquer que seja o tamanho do tiroteio. 24 é o ponto em que ainda dá
   pra distinguir eventos: acima disso vira ruído e só custa CPU. */
export const MAX_VOICES = 24;

/* Oclusão só vale perto: atrás de 120 m a atenuação por distância já
   fez o trabalho e o raycast seria desperdício. */
export const OCCL_MAX_DIST = 120;
/* Orçamento de raycast: 14/s com rajada de 6. Um tiroteio dispara muito
   mais que isso — o excedente simplesmente toca sem oclusão. */
export const OCCL_PER_SEC = 14;
export const OCCL_BURST = 6;

/* ---------------------------------------------------------------- */
export function audible(cat, d) {
  const c = CATS[cat] || CATS.small;
  return d <= c.cull;
}

/* Mesma fórmula do distanceModel:'inverse' do PannerNode. Existe aqui
   pra poder ser testada e comparada sem subir um AudioContext. */
export function distanceGain(cat, d) {
  const c = CATS[cat] || CATS.small;
  const dd = Math.min(Math.max(d, c.ref), c.max);
  return c.ref / (c.ref + c.roll * (dd - c.ref));
}

/* Quanto vale manter esta voz viva. Ordem de desempate:
   prioridade  >  proximidade  >  quão recente.
   Consequência direta: a mais distante perde; empatando, a mais antiga.
   A recência é 1/(1+idade) de propósito: nunca satura, então duas vozes
   velhas continuam desempatando pela idade em vez de virar sorteio. */
export function voiceScore(v, now) {
  const c = CATS[v.cat] || CATS.small;
  const perto = 1 - clamp01(v.dist / c.cull);
  const recente = 1 / (1 + Math.max(0, now - v.t0));
  return c.prio * 100 + perto * 10 + recente * 4;
}

/* Escolhe o slot do pool para um som novo.
   Retorna índice de voz livre, índice roubado, voices.length (criar nova)
   ou -1 (descartar o som).
   voices: [{ cat, dist, t0, dur, freeAt }] — freeAt em segundos do contexto. */
export function acquireVoice(voices, req, now, max = MAX_VOICES) {
  if (!audible(req.cat, req.dist)) return -1;          // longe demais: nem tenta
  for (let i = 0; i < voices.length; i++)
    if (voices[i].freeAt <= now) return i;             // voz vencida: reciclagem
  if (voices.length < max) return voices.length;       // pool cresce sob demanda
  let pior = -1, piorNota = Infinity;
  for (let i = 0; i < voices.length; i++) {
    const s = voiceScore(voices[i], now);
    if (s < piorNota) { piorNota = s; pior = i; }
  }
  const minha = voiceScore({ cat: req.cat, dist: req.dist, dur: req.dur, t0: now }, now);
  return minha > piorNota ? pior : -1;                 // não vale roubar: cala
}

/* ---------------------------------------------------------------- */
export const OCCL_GAIN = 0.4;    // parede tira ~8 dB
export const OCCL_LP = 600;      // e come o agudo: sobra o "bum" abafado
export const OPEN_LP = 20000;

/* blocked: 0 (linha de visão) .. 1 (parede inteira no caminho).
   O corte interpola em log — é assim que ouvido/filtro se comportam. */
export function occlusionTarget(blocked) {
  const k = clamp01(blocked);
  if (k <= 0) return { gain: 1, lp: OPEN_LP };
  return {
    gain: 1 - k * (1 - OCCL_GAIN),
    lp: Math.exp(Math.log(OPEN_LP) * (1 - k) + Math.log(OCCL_LP) * k),
  };
}

/* equal-power não distingue frente de trás (é só pan L/R). O ouvido usa
   o brilho pra isso: o pavilhão da orelha corta agudo do que vem de trás.
   dotFwd: +1 na frente da câmera, -1 exatamente atrás. */
export function backLowpass(dotFwd) {
  const atras = clamp01(-dotFwd);
  return OPEN_LP * Math.pow(0.22, atras);   // 20 kHz na frente → ~4,4 kHz atrás
}

/* ---------------------------------------------------------------- */
/* Balde de fichas: segura o custo de raycast sem timer nem alocação. */
export function makeBudget(perSec = OCCL_PER_SEC, burst = OCCL_BURST) {
  return { perSec, burst, tokens: burst, t: NaN };
}
export function takeToken(b, now) {
  if (!Number.isFinite(b.t)) b.t = now;
  b.tokens = Math.min(b.burst, b.tokens + Math.max(0, now - b.t) * b.perSec);
  b.t = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}
