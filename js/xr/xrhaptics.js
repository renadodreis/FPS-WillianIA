/* ================================================================
   TATO DOS CONTROLES EM XR — o vocabulário de pulsos do jogo.

   POR QUE ISTO EXISTE: em VR metade do "game feel" é tato. A validação
   independente de `docs/vr/validacao-98b114f.md` contou **zero chamadas de
   háptico no repositório inteiro**, com **dois atuadores disponíveis** (um por
   controle Touch Plus). Atirar sem retorno tátil é a queixa literal do dono do
   projeto — "não sinto o tiro" — e é o defeito que a crítica cita em todo porte
   de tela plana.

   ONDE O ATUADOR MORA. A spec do WebXR Gamepads Module não fala em háptico:
   ela só diz que os dados do controle chegam "though a Gamepad object exposed
   on the XRInputSource". O háptico vem junto, pela Gamepad API comum, em
   `inputSource.gamepad.hapticActuators[0].pulse(value, duration)` — `value` de
   0,0 a 1,0, `duration` em milissegundos (MDN). Nada nesse caminho avisa quando
   falta: fonte sem `gamepad`, `gamepad` sem `hapticActuators`, lista vazia ou
   `pulse` ausente são quatro casos reais e nenhum deles lança. Quem não degrada
   explicitamente, quebra.

   TRÊS DECISÕES QUE AQUI SÃO CONTRATO, NÃO GOSTO:

   1. **HÁPTICO É POR MÃO.** Quem sente o coice é a mão que segura a arma. É
      consequência direta da VRC.Quest.Input.3 (obrigatória): "as mãos e
      controles dentro da aplicação devem coincidir com os equivalentes do mundo
      real do usuário". Arma na direita fazendo a esquerda vibrar é a mesma
      classe de erro de pendurar a arma no raio de mira em vez do punho.
      A ÚNICA exceção é o DANO: levar tiro é no corpo, não na arma, e as duas
      mãos juntas são o único jeito de dizer "isto é você, não é a sua arma".

   2. **PULSO NOVO MATA PULSO VELHO — então existe PRIORIDADE.** "Repeated
      calls to pulse() override the previous calls if they are still ongoing"
      (MDN; a spec do W3C diz o mesmo). Não há mixagem: um tique de menu de
      10 ms chegando 2 ms depois do coice de 27 ms não soma, DECAPITA. Sem
      prioridade o jogador não sente nem um nem outro. Um pulso em voo só é
      interrompido por evento de prioridade igual ou maior.

   3. **DURAÇÃO NUNCA PASSA DE 60% DA CADÊNCIA DA ARMA.** O fuzil dispara a
      cada 87 ms; pulso mais longo que isso vira vibração contínua, que é o
      "excessive or continuous haptic effects" que a Meta manda evitar. É o
      MESMO problema que `shotTrauma` já resolve no domínio visual — por isso o
      peso do tiro vem de lá, e não de oito constantes inventadas aqui.

   E DUAS PORTAS FECHADAS:

   - **SEM FOCO, SEM PULSO.** VRC.Quest.Input.4 (obrigatória) manda o app
     "ignore all hand or controller input" quando perde o foco. Um controle
     vibrando na mão de quem está no Universal Menu é o app furando o foco do
     sistema pelo único canal que não é gráfico.
   - **DÁ PARA DESLIGAR.** As boas práticas da Meta são explícitas: o usuário
     tem que poder silenciar o háptico, e o app tem que continuar bom sem ele.

   NADA AQUI ALOCA `Object3D`. Todo `Object3D` gasta 4 números do `Math.random`
   seedado no UUID e a ordem de consumo é contrato do worldgen — este módulo é
   só número e objeto simples, então pode nascer no boot sem mover o mundo de
   ninguém.

   Fontes, números e a tabela por arma: docs/vr/referencia-tato-sessao.md
   ================================================================ */
import { shotTrauma, hitmarkerFlavor } from '../hitfeel-core.js';

/* Faixa útil de duração. O piso não é da spec: é derivado do hardware — o
   Quest 3 usa atuador VCM de banda larga (Meta: "up to 500 Hz"), e alguns
   ciclos na faixa de mais amplitude dão a ordem de 8 ms. Abaixo disso não se
   promete sensação nenhuma, e prometer seria inventar. O teto é o "avoid long
   or overlapping effects": acima de ~250 ms o pulso deixa de ser evento e vira
   estado. */
export const PULSO_MIN_MS = 8;
export const PULSO_MAX_MS = 250;

/* Quem interrompe quem. Ver a decisão 2 do cabeçalho. */
export const PRIORIDADE = {
  dano: 40,
  acerto: 30,
  tiro: 20,
  'recarga-pronta': 16,
  recarga: 12,
  pegar: 10,
  coldre: 10,
  vazio: 9,
  'ui-toque': 6,
  mira: 4,
  'ui-foco': 2,
};

const TIRO_MS_MIN = 18;
const TIRO_MS_MAX = 90;
const TIRO_DUTY = 0.6;      // fração máxima do intervalo entre dois tiros

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const outraMao = m => (m === 'left' ? 'right' : 'left');
const aMao = m => (m === 'left' || m === 'right' ? m : 'right');
/* duas casas: o vocabulário tem que ser legível na documentação e estável
   entre execuções — 0,3128260... não é um número que alguém consiga conferir */
const int2 = v => Math.round(clamp(v, 0, 1) * 100) / 100;

function pulso(mao, intensidade, ms, evento) {
  return {
    mao: aMao(mao),
    intensidade: int2(intensidade),
    ms: clamp(Math.round(ms), PULSO_MIN_MS, PULSO_MAX_MS),
    evento,
    prioridade: PRIORIDADE[evento] || 0,
  };
}

/* PESO DO TIRO: reaproveita `shotTrauma` (js/hitfeel-core.js), que já entrega o
   coice por arma COM teto por cadência — "fogo sustentado não pode passar de
   SUSTAIN_CEIL", diz o comentário de lá. É o mesmo problema de saturação que a
   Meta descreve no domínio tátil, resolvido nesta base há tempo no domínio
   visual. Reusar mantém arma pesada pesada nos dois sentidos. */
function pesoDoTiro(ctx) {
  if (Number.isFinite(ctx.peso)) return clamp(ctx.peso, 0, 1);
  return clamp(shotTrauma(ctx.arma || {}), 0, 1);
}

function intervaloMsDoTiro(ctx) {
  if (Number.isFinite(ctx.intervalo) && ctx.intervalo > 0) return ctx.intervalo * 1000;
  const rpm = ctx.arma && Number.isFinite(ctx.arma.rpm) && ctx.arma.rpm > 0 ? ctx.arma.rpm : 60;
  return 60000 / rpm;
}

const ACERTO = {
  hit: [0.35, 22],
  head: [0.60, 34],
  kill: [0.85, 55],
};

/* ================================================================
   POLÍTICA PURA: evento + contexto → lista de pulsos. Sem sessão, sem
   navegador, sem estado. Separada da aplicação pelo mesmo motivo de
   js/xr/xrquality.js: dá para conferir cada número sem headset.
   ================================================================ */
export function planoDePulso(evento, ctx = {}) {
  const c = ctx || {};
  const mao = aMao(c.mao);
  switch (evento) {
    case 'tiro': {
      const peso = pesoDoTiro(c);
      /* O teto é `floor` e não `round` de propósito: arredondar para cima
         devolveria um pulso mais longo que a própria trava anti-zumbido. */
      const teto = Math.floor(Math.min(TIRO_MS_MAX, intervaloMsDoTiro(c) * TIRO_DUTY));
      const ms = clamp(TIRO_MS_MIN + peso * 170, TIRO_MS_MIN, Math.max(PULSO_MIN_MS, teto));
      return [pulso(mao, 0.25 + peso * 1.25, ms, 'tiro')];
    }
    case 'acerto': {
      /* Os três sabores são os MESMOS de `hitmarkerFlavor`: o tato conta a
         mesma história que a tela ("complement visual and auditory cues"), e
         não uma segunda história. Mais curto que o hitmarker visual
         (110/170/260 ms) porque confirmação é clique, não animação. */
      const sabor = c.sabor || hitmarkerFlavor(c);
      const [i, ms] = ACERTO[sabor] || ACERTO.hit;
      return [pulso(mao, i, ms, 'acerto')];
    }
    /* O carregador é buscado e levado pela mão de APOIO; o ferrolho fechando é
       sentido por quem segura a arma. Forte e curto é o que "encaixou" parece;
       fraco e longo é o que "saiu o carregador" parece. */
    case 'recarga': return [pulso(outraMao(mao), 0.40, 45, 'recarga')];
    case 'recarga-pronta': return [pulso(mao, 0.75, 30, 'recarga-pronta')];
    case 'dano': {
      const dano = Number.isFinite(c.dano) ? Math.max(0, c.dano) : 10;
      const letal = !!c.letal;
      const i = letal ? 1 : clamp(0.35 + dano * 0.006, 0.35, 0.9);
      const ms = letal ? 200 : clamp(60 + dano, 60, 180);
      // as DUAS mãos: dano é no corpo, não na arma (ver o cabeçalho)
      return [pulso('left', i, ms, 'dano'), pulso('right', i, ms, 'dano')];
    }
    case 'pegar': return [pulso(mao, 0.45, 40, 'pegar')];
    /* COLDREAR é o gesto do Body Holsters do Alyx: "move your hand to one of the
       seven holster slots on your body until you feel a vibration". Mais longo e
       mais forte que `pegar` porque guardar a arma é a ação com consequência —
       o jogador precisa saber que ficou de mãos vazias sem tirar os olhos do
       inimigo. */
    case 'coldre': return [pulso(mao, 0.55, 55, 'coldre')];
    /* GATILHO SECO. Fraco e curtíssimo DE PROPÓSITO, e o número tem de ficar
       abaixo do pulso de tiro mais leve do arsenal: `tiro` sai em
       0,25 + peso·1,25, ou seja NUNCA abaixo de 0,25 (js/hitfeel-core.js
       garante `peso ≥ TRAUMA_MIN > 0`). Confundir "acabou a munição" com
       "saiu tiro" é o pior erro que este vocabulário pode cometer — o jogador
       continuaria puxando o gatilho achando que está atirando. */
    case 'vazio': return [pulso(mao, 0.20, 12, 'vazio')];
    /* ENTRAR NA JANELA DE MIRA. A Meta manda "avoid long or overlapping haptic
       effects", e a mira entra e sai da janela dezenas de vezes por minuto —
       por isso este é o pulso mais fraco e mais curto do vocabulário inteiro,
       e quem chama (js/xr/xrweapon.js) só o emite na BORDA de entrada, com
       carência. Sozinho ele seria ruído; com a affordance visual junto ele é o
       "synchronize multimodal feedback" da mesma página. */
    case 'mira': return [pulso(mao, 0.18, 12, 'mira')];
    case 'ui-foco': return [pulso(mao, 0.15, 10, 'ui-foco')];
    case 'ui-toque': return [pulso(mao, 0.50, 18, 'ui-toque')];
    default: return [];
  }
}

/* `session.inputSources` NÃO é Array (`Array.isArray` devolve false), e
   `gamepad.hapticActuators` é `FrozenArray` sem promessa de sê-lo. O guarda com
   `Array.isArray` já descartou os DOIS controles todo frame nesta base, sem
   erro e sem console. Aceite qualquer coisa iterável ou com `length`. */
function comoLista(v) {
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== 'object') return [];
  if (typeof v[Symbol.iterator] === 'function') return Array.from(v);
  if (typeof v.length === 'number') return Array.prototype.slice.call(v);
  return [];
}

/* ================================================================
   APLICAÇÃO: pega o plano e o entrega ao atuador de verdade.
   ================================================================ */
export function createXrHaptics({
  getSession = () => null,
  getVisibilidade = null,
  agora = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
} = {}) {
  let ligado = true;
  // até quando o pulso em voo dura, e com que prioridade, em cada mão
  const ocupado = { left: { ate: 0, prio: -Infinity }, right: { ate: 0, prio: -Infinity } };

  /* O atuador da mão pedida, ou null. `vibrationActuator` é o caminho
     alternativo da Gamepad API moderna; aceitar os dois custa uma linha e evita
     um jogo mudo num navegador que só exponha um deles. */
  function atuadorDe(sessao, qual) {
    for (const f of comoLista(sessao && sessao.inputSources)) {
      if (!f || f.handedness !== qual) continue;
      const g = f.gamepad;
      if (!g) return null;
      const a = comoLista(g.hapticActuators)[0] || g.vibrationActuator || null;
      return a && typeof a.pulse === 'function' ? a : null;
    }
    return null;
  }

  function visivel(sessao) {
    if (typeof getVisibilidade === 'function') return getVisibilidade() === 'visible';
    return (sessao.visibilityState || 'visible') === 'visible';
  }

  /* Devolve os pulsos que REALMENTE saíram. Lista vazia é resposta legítima e
     silenciosa: sem sessão, sem foco, mudo, evento desconhecido, controle
     dormindo ou navegador sem háptico. Nenhum desses casos é erro. */
  function emitir(evento, ctx = {}) {
    if (!ligado) return [];
    const sessao = getSession();
    if (!sessao) return [];
    // PORTÃO DE FOCO ANTES DE TUDO: ver VRC.Quest.Input.4 no cabeçalho
    if (!visivel(sessao)) return [];
    const plano = planoDePulso(evento, ctx);
    if (!plano.length) return [];
    const t = agora();
    const saiu = [];
    for (const p of plano) {
      const est = ocupado[p.mao];
      // pulso em voo só cede para prioridade igual ou maior (decisão 2)
      if (t < est.ate && p.prioridade < est.prio) continue;
      const atuador = atuadorDe(sessao, p.mao);
      if (!atuador) continue;                 // controle sem háptico: degrada calado
      try {
        const r = atuador.pulse(p.intensidade, p.ms);
        /* Promise rejeitada sem `catch` é erro no console, e o critério I2 é
           zero erro durante a sessão inteira. O háptico não é motivo pra
           reprovar uma sessão. */
        if (r && typeof r.catch === 'function') r.catch(() => {});
      } catch { continue; }
      est.ate = t + p.ms;
      est.prio = p.prioridade;
      saiu.push(p);
    }
    return saiu;
  }

  /* Sair da sessão zera o que estava em voo: entrar de novo não pode nascer com
     uma mão "ocupada" por um pulso que morreu junto com a sessão anterior.
     Sai na primeira linha quando não há nada a soltar — o wiring do game.js
     chama isto TODO FRAME fora de XR, e a versão de PC não pode regredir. */
  function soltar() {
    if (!ocupado.left.ate && !ocupado.right.ate) return false;
    ocupado.left.ate = 0; ocupado.left.prio = -Infinity;
    ocupado.right.ate = 0; ocupado.right.prio = -Infinity;
    return true;
  }

  return {
    emitir, soltar,
    get ligado() { return ligado; },
    set ligado(v) { ligado = !!v; if (!ligado) soltar(); },
  };
}
