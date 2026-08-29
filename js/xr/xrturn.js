/* ================================================================
   POLÍTICA DE GIRO EM VR — módulo PURO (sem DOM, sem three).

   Recebe o eixo horizontal do analógico direito e devolve QUANTO girar
   neste frame. Quem aplica o giro é o rig (js/xr/xrrig.js): em VR o jogo
   nunca gira a CÂMERA — a câmera é a cabeça do jogador.

   POR QUE ISTO EXISTE, E O QUE A PESQUISA REALMENTE DISSE
   -------------------------------------------------------
   O porte nasceu com giro em PASSOS de 45° fixos, sem opção. O dono do
   projeto vestiu o headset e reprovou: "viro com o controle e move igual
   PC, movimento estático, uns 30 graus de uma vez, esse movimento não
   existe em VR".

   A pesquisa (docs/vr/referencia-locomocao.md, com links) CONFIRMOU metade
   e REFUTOU a outra:

   - CONFIRMADO: todo FPS de VR do gênero oferece os DOIS giros e deixa o
     jogador escolher, com velocidade ajustável no contínuo — Alyx
     ("Continuous Turn, and associated turning speed options", update 1.1),
     Pavlov (smooth turn de 45 a 360), Population: ONE (Degrees Per Second,
     Ease In, Analog Control), Onward, Contractors. A Meta escreve isso
     como recomendação: "It's important to let users choose between these
     two options" e "It is recommended to allow users to adjust the speed
     of the rotation".
   - REFUTADO: NÃO é verdade que o padrão de fábrica do mercado seja
     suave. A Meta manda o contrário — "Default to comfort-friendly
     options (teleport, snap turn) and let users opt into more intense
     options (slide, smooth turn)" — e o Immersive Web SDK da própria Meta
     nasce em `TurningMethod.SnapTurn`.

   AQUI O PADRÃO É SUAVE MESMO ASSIM, e a razão é explícita: o critério de
   pronto deste porte é o dono do projeto, que jogou e reprovou o snap; e
   o jogo é um battle royale, onde giro aos pulos custa mira. O que a
   recomendação da Meta protege — o jogador que enjoa — continua a UM
   toque de distância, porque o modo em passos não foi removido: virou
   opção, com o ângulo dele também ajustável (a Meta sugere 30, 45 ou 90).

   AS TRÊS COISAS QUE FAZEM O GIRO CONTÍNUO NÃO ENJOAR
   ---------------------------------------------------
   1. RAMPA. Velocidade angular que salta de 0 para o valor cheio num
      frame é um solavanco vestibular — o mesmo estímulo do snap, só que
      sem o corte que o cérebro perdoa. "Offer smooth turning as an opt-in
      feature, tuning speed and acceleration carefully" / "Keep
      acceleration events brief and infrequent" (Meta, Locomotion Best
      Practices). A velocidade sobe em ~0,12 s e desce em ~0,05 s: soltar
      tem que parar rápido, porque overshoot depois de o analógico voltar
      ao centro estraga a mira.
   2. VELOCIDADE DO JOGADOR. O padrão, 180°/s, é o do Immersive Web SDK da
      Meta (`turningSpeed` default 180). A faixa real do mercado vai de
      60°/s (Unity XRI) a 360°/s (teto do Pavlov), e aqui vai de 30 a 360.
   3. VINHETA ENQUANTO GIRA. Quem consome este módulo alimenta
      js/xr/xrcomfort.js com `velocidade`. A vinheta da Meta reage a três
      eventos separados — Rotation, Movement e Acceleration —, não só a
      andar.

   E O TERCEIRO MODO: `desligado`
   ------------------------------
   O dono voltou do headset com o pedido oposto: "o botão de virar o
   personagem não se faz necessário, pois ao movimentar a cabeça o corpo
   deveria acompanhar... eu já consigo olhar ao redor sem enjoo".

   Ele está certo sobre o jogo dele — virar a cabeça JÁ vira a direção de
   andar, o `rotY` mandado ao servidor e o minimapa (medido:
   docs/vr/referencia-corpo-cabeca.md §4.0). Mas o giro artificial NÃO PODE
   SER REMOVIDO, e isso não é opinião:

   - VRC.Quest.Tracking.1 é requisito OBRIGATÓRIO de loja: o app tem de ser
     jogável sentado, e sentado não se pede pivô de mais de 90°.
   - A página de preferências de conforto da Meta e o XAUR do W3C listam o
     giro por controle como recurso de ACESSIBILIDADE — tirá-lo fecha o jogo
     para quem não gira o pescoço à vontade nem a cadeira.

   O caminho é o que a Half-Life: Alyx fez com a mesma queixa: não moveu o
   giro para outro botão, ofereceu DESLIGÁ-LO ("Added option to disable
   controller turning", update 1.1). Aqui isso é o modo `desligado`:
   `atualizar()` devolve giro zero, o analógico direito para de mover o rig,
   e o padrão de fábrica continua `suave` — quem joga em pé com espaço
   desliga em um toque, no painel que o critério A2 já exige.

   O modo é uma ESCOLHA DE POLÍTICA, e ela mora aqui: `MODOS` é a ordem em
   que a tela roda entre eles, para que a UI não invente um quarto estado nem
   inverta a sequência num arquivo distante deste.

   ZONA MORTA: a mesma de andar (js/xr/xrinput.js), DESCONTADA e não
   cortada — o analógico do Touch descansa em ±0,1 sozinho, e girar sem o
   jogador pedir é enjoo na veia.

   NADA AQUI ALOCA OBJETO DE CENA. É contrato do worldgen: todo `Object3D`
   gasta 4 números do `Math.random` seedado no UUID.
   ================================================================ */
import { DEADZONE } from './xrinput.js';

export const CHAVE = 'callofai_vr';

/* A ORDEM EM QUE A TELA RODA ENTRE OS MODOS. Fica aqui, e não no painel, para
   a UI não poder inventar um quarto estado nem inverter a sequência: quem sabe
   quais modos existem é quem os implementa. Os dois que GIRAM vêm juntos —
   trocar entre suave e passos é a comparação que o jogador quer fazer — e
   `desligado` fecha a volta. */
export const MODOS = ['suave', 'passos', 'desligado'];

export const PADRAO = {
  /* 'suave' (contínuo) | 'passos' (snap) | 'desligado' (o analógico direito
     não gira; ver o cabeçalho: é opção, nunca o padrão — VRC.Quest.Tracking.1) */
  modo: 'suave',
  velocidade: 180,    // graus/s no modo suave (o default do Immersive Web SDK)
  passo: 45,          // graus por inclinada no modo passos (Meta sugere 30/45/90)
};

const LIMITES = { velocidade: [30, 360], passo: [10, 90] };
const SUBIDA = 0.12;   // s até a velocidade cheia
const DESCIDA = 0.05;  // s do talo até parar (curto: overshoot atrapalha a mira)
const SNAP_ON = 0.7;   // inclinada que dispara o passo
const SNAP_OFF = 0.35; // e o quanto precisa voltar pra rearmar

const GRAU = Math.PI / 180;
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const trava = (v, [min, max]) => Math.min(max, Math.max(min, v));

/* zona morta DESCONTADA e normalizada: 0 no limiar, 1 no batente */
function semZonaMorta(v) {
  const a = Math.abs(v);
  if (a <= DEADZONE) return 0;
  return Math.sign(v) * ((a - DEADZONE) / (1 - DEADZONE));
}

/* `session.inputSources` NÃO é Array (é `XRInputSourceArray`) e
   `Array.isArray` devolve false nele — guardar com `Array.isArray` descarta
   os dois controles todo frame, sem erro e sem console. Aceite iterável ou
   coisa com `length`. */
function comoLista(v) {
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== 'object') return [];
  if (typeof v[Symbol.iterator] === 'function') return Array.from(v);
  if (typeof v.length === 'number') return Array.prototype.slice.call(v);
  return [];
}

/* O X CRU do analógico direito. Cru de propósito: o modo em passos mede os
   limiares de armar/rearmar no valor de fábrica, como sempre mediu.
   Índice 2, não 0 — o par 0/1 é de touchpad, que o Touch não tem. */
export function eixoDeGiro(fontes) {
  for (const f of comoLista(fontes)) {
    if (!f || f.handedness !== 'right') continue;
    const g = f.gamepad;
    if (!g || !g.axes) return 0;
    const a = Array.isArray(g.axes) ? g.axes : Array.from(g.axes);
    return a.length >= 4 ? num(a[2]) : 0;
  }
  return 0;
}

function lerPrefs(armazem) {
  if (!armazem || typeof armazem.getItem !== 'function') return {};
  try {
    const cru = armazem.getItem(CHAVE);
    if (!cru) return {};
    const o = JSON.parse(cru);
    return (o && typeof o === 'object') ? o : {};
  } catch {
    return {};   // modo privado, cota, JSON corrompido: cai no padrão e segue
  }
}

function gravarPrefs(armazem, prefs) {
  if (!armazem || typeof armazem.setItem !== 'function') return;
  try {
    const atual = lerPrefs(armazem);
    armazem.setItem(CHAVE, JSON.stringify({ ...atual, ...prefs }));
  } catch { /* sem armazenamento a preferência vale só nesta sessão */ }
}

function saneia(p, base) {
  const out = { ...base };
  if (MODOS.includes(p.modo)) out.modo = p.modo;
  if (typeof p.velocidade === 'number' && Number.isFinite(p.velocidade)) {
    out.velocidade = trava(p.velocidade, LIMITES.velocidade);
  }
  if (typeof p.passo === 'number' && Number.isFinite(p.passo)) {
    out.passo = trava(p.passo, LIMITES.passo);
  }
  return out;
}

export function criarGiroXR({ armazem = null } = {}) {
  const prefs = saneia(lerPrefs(armazem), PADRAO);
  let yaw = 0;          // giro artificial acumulado, em radianos
  let vel = 0;          // velocidade angular atual (rad/s), com rampa
  let armado = true;    // modo passos: rearma quando o analógico volta ao centro

  /* `dt` em segundos, `eixoX` o X CRU do analógico direito (-1..1).
     Devolve o delta aplicado neste frame, se foi um PASSO (para a piscada)
     e a velocidade angular atual (para a vinheta). */
  function atualizar(dt, eixoX) {
    const passoDt = num(dt) > 0 ? Math.min(num(dt), 0.1) : 0;
    const cru = num(eixoX);
    const antes = yaw;
    let passo = false;

    /* DESLIGADO SAI ANTES DOS DOIS CAMINHOS. Tem de vencer o contínuo E o
       snap: bastaria o jogador ter escolhido `passos` antes para o giro voltar
       sozinho se o corte fosse só no ramo suave. E o `armado` volta armado
       porque desligar no meio de uma inclinada não pode deixar um passo
       pendurado para disparar quando ele religar. */
    if (prefs.modo === 'desligado') {
      vel = 0;
      armado = true;
      return { delta: 0, passo: false, velocidade: 0, girando: false };
    }

    if (prefs.modo === 'passos') {
      vel = 0;
      if (armado && Math.abs(cru) >= SNAP_ON) {
        // empurrou pra direita = gira pra direita, e guinada pra direita é NEGATIVA
        yaw += (cru > 0 ? -1 : 1) * prefs.passo * GRAU;
        armado = false;
        passo = true;
      } else if (Math.abs(cru) <= SNAP_OFF) {
        armado = true;
      }
    } else {
      armado = true;   // trocar de modo no meio não deixa o passo travado
      const alvo = -semZonaMorta(cru) * prefs.velocidade * GRAU;
      /* rampa LINEAR: acelera em SUBIDA e freia em DESCIDA. Velocidade
         angular em degrau é o mesmo solavanco vestibular do snap, só que sem
         o corte de câmera que o cérebro perdoa. */
      const rampa = (Math.abs(alvo) > Math.abs(vel) ? SUBIDA : DESCIDA);
      const maxDelta = (prefs.velocidade * GRAU) * (passoDt / rampa);
      const d = alvo - vel;
      vel += Math.abs(d) <= maxDelta ? d : Math.sign(d) * maxDelta;
      yaw += vel * passoDt;
    }

    return { delta: yaw - antes, passo, velocidade: Math.abs(vel), girando: vel !== 0 || passo };
  }

  function preferir(p) {
    if (!p || typeof p !== 'object') return prefs;
    const novo = saneia(p, prefs);
    Object.assign(prefs, novo);
    gravarPrefs(armazem, novo);
    return prefs;
  }

  return {
    atualizar, preferir,
    zerar() { yaw = 0; vel = 0; armado = true; },
    get yaw() { return yaw; },
    set yaw(v) { yaw = num(v); },
    get velocidadeAtual() { return vel; },
    get prefs() { return { ...prefs }; },
  };
}
