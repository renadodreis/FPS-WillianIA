/* ================================================================
   AUTO-TIER DE QUALIDADE — o primeiro boot para de ser uma aposta.

   Até aqui todo mundo entrava com o mesmo padrão (res 1.5 + sombra +
   bloom + SMAA). Numa Intel HD isso é a diferença entre 60 e 25 FPS;
   numa RTX é qualidade jogada fora. Aqui a string da GPU
   (WEBGL_debug_renderer_info) escolhe um preset de PARTIDA.

   Três regras que não podem cair:
     1. A escolha do jogador SEMPRE vence. Existindo configuração salva,
        este módulo não encosta em nada — nem no boot seguinte.
     2. GPU desconhecida cai no MÉDIO, nunca no baixo: navegador com
        privacidade ligada bloqueia a extensão, e castigar quem a gente
        não conseguiu identificar seria pior que não ter auto-tier.
     3. Só mexe em qualidade (res/shadow/bloom/aa). Volume, ping e a
        escala adaptativa continuam com o jogador.

   Isto é o PONTO DE PARTIDA; a partir dele o js/adaptivequality.js
   segue medindo e ajustando a resolução dentro do teto.
   ================================================================ */

export const TIERS = ['baixo', 'medio', 'alto'];

/* Presets. `alto` é EXATAMENTE o padrão histórico: quem já rodava liso
   não perde nada. Os degraus tiram primeiro o mais caro:

     aa   — SMAA são TRÊS passes em resolução cheia (bordas, pesos,
            mistura). É o item mais caro do pós e o único cujo custo
            não cai com nada mais que desligar.
     bloom— um passe a mais na cadeia (já em meia resolução por dentro).
     res  — teto do pixel ratio; só morde em tela HiDPI, por isso não é
            o primeiro degrau.

   SOMBRA FICA LIGADA EM TODOS OS TIERS — de propósito. A medição do
   projeto diz que sem sombra a cena cai de 365 pra 352 draw calls (4%):
   o rodízio de cascatas já tirou o custo, e trocar a leitura do mapa
   inteiro por 4% de draw calls é perda de imagem sem ganho de frame. */
const PRESETS = {
  baixo: { res: 1, shadow: 1, bloom: 0, aa: 0 },
  medio: { res: 1, shadow: 1, bloom: 1, aa: 0 },
  alto: { res: 1.5, shadow: 1, bloom: 1, aa: 1 },
};

export function presetFor(tier) {
  return { ...(PRESETS[tier] || PRESETS.medio) };
}

/* --- regras de classificação, da mais específica pra mais genérica --- */
const RULES = [
  // rasterizador de software: nem tenta
  [/swiftshader|llvmpipe|softpipe|basic render|microsoft basic|software rasterizer|\bswrast\b/i,
    'baixo', 'rasterizador de software'],
  // celular/tablet
  [/adreno|mali-|powervr|apple a\d|videocore/i, 'baixo', 'GPU de celular/tablet'],
  // Apple Silicon: integrada, mas rápida
  [/apple m\d/i, 'alto', 'Apple Silicon'],
  // Intel: Iris Xe / Arc são de outra geração que as HD/UHD
  [/iris\s*\(?r?\)?\s*xe|intel.*\barc\b|\bxe graphics\b/i, 'medio', 'Intel Xe/Arc'],
  [/\bhd graphics\b|\buhd graphics\b|\bintel\b.*\bgraphics\b|\bgma\b|\bivybridge\b|\bhaswell\b/i,
    'baixo', 'Intel integrada'],
  // AMD integrada (APU)
  [/radeon.*\bvega \d\b|\bvega \d\b graphics|radeon\(tm\) graphics|\bamd custom gpu\b/i,
    'medio', 'AMD integrada'],
  // NVIDIA dedicada
  [/\brtx\s*[2-9]\d{3}\b/i, 'alto', 'NVIDIA RTX'],
  [/\bgtx\s*(16|20)\d\d\b/i, 'alto', 'NVIDIA GTX moderna'],
  [/\bgtx\s*10[5-8]\d\b/i, 'alto', 'NVIDIA GTX 10xx'],
  [/\bgtx\s*(9|10)\d\d\b/i, 'medio', 'NVIDIA GTX antiga'],
  [/\bgtx\s*[5-8]\d\d\b|\bgt\s*\d{3,4}\b|\bmx\s*\d{3}\b|\bquadro\b/i, 'baixo', 'NVIDIA antiga/entrada'],
  // AMD dedicada
  [/\brx\s*[5-9]\d{3}\b|\bradeon pro w\b/i, 'alto', 'AMD RX moderna'],
  [/\brx\s*[45]\d\d\b|\br9\b|\br7\b/i, 'medio', 'AMD RX antiga'],
  // genéricas de fabricante (sem modelo reconhecido)
  [/nvidia|geforce/i, 'alto', 'NVIDIA dedicada'],
  [/radeon|amd/i, 'medio', 'AMD'],
];

export function classifyGpu(rendererString) {
  const s = typeof rendererString === 'string' ? rendererString.trim() : '';
  if (!s) return { tier: 'medio', reason: 'GPU não identificada (sem string)', gpu: '' };
  for (const [re, tier, reason] of RULES) {
    if (re.test(s)) return { tier, reason, gpu: s };
  }
  return { tier: 'medio', reason: 'GPU não reconhecida — não dá pra castigar sem prova', gpu: s };
}

/* string crua da GPU; `null` quando o navegador esconde (privacidade) */
export function gpuStringOf(gl) {
  if (!gl || typeof gl.getExtension !== 'function') return null;
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return null;
    const s = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    return typeof s === 'string' && s ? s : null;
  } catch {
    return null;
  }
}

/* `?tier=alto|medio|baixo` força o preset (suporte/QA); `?tier=off`
   desliga o auto-tier. Sem parâmetro, devolve null. */
export function tierOverrideFrom(search) {
  const m = /[?&]tier=(alto|medio|baixo|off)\b/i.exec(String(search || ''));
  return m ? m[1].toLowerCase() : null;
}

/* Aplica o preset em `settings` SOMENTE quando não existe configuração
   salva. Devolve o diagnóstico pra quem chamou registrar no console. */
export function autoTierSettings({ gl, stored, settings, search = '' }) {
  const forced = tierOverrideFrom(search);
  if (forced === 'off') {
    return { applied: false, tier: null, gpu: '', reason: 'auto-tier desligado por ?tier=off' };
  }
  if (!forced && stored !== null && stored !== undefined) {
    return { applied: false, tier: null, gpu: gpuStringOf(gl) || '',
      reason: 'já existe configuração salva — a escolha manual manda' };
  }
  const gpu = gpuStringOf(gl);
  const c = forced ? { tier: forced, reason: `forçado por ?tier=${forced}`, gpu: gpu || '' }
    : classifyGpu(gpu);
  const preset = presetFor(c.tier);
  for (const k of Object.keys(preset)) settings[k] = preset[k];
  return { applied: true, tier: c.tier, gpu: c.gpu, reason: c.reason, preset };
}
