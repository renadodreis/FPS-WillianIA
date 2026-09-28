/* ================================================================
   CONTROLES DE TOQUE — analógico, olhar por arrasto e botões.

   Duas camadas, de propósito:

   1. NÚCLEO PURO (`createTouchCore`). Recebe eventos já normalizados
      (px relativos ao centro do analógico, px absolutos da área de
      mira) e devolve estado. Sem DOM, sem three, sem `Math.random` —
      consumir o PRNG seedado global deslocaria o layout do mundo
      (invariante do worldgen). Testável sem navegador:
      test/touch-controls-core.test.js.
   2. CAMADA DOM (`createTouchControls`). Liga os `pointer*` nos
      elementos do contrato de HUD, resolve multi-toque por `pointerId`
      e traduz botão em evento de teclado SINTÉTICO / estado de mouse.

   POR QUE EVENTO DE TECLADO SINTÉTICO E NÃO ESCREVER EM `keys`:
   existem DOIS ouvintes de `keydown` no jogo — o de game.js (que
   preenche `keys` + `justPressed`) e o exclusivo do modo Battle Royale
   (br-game.js: chat, pular da nave, paraquedas, abrir baú, armas 4-8).
   Escrever em `keys` na mão alimentaria só o primeiro e metade do BR
   ficaria injogável no celular. Nenhum handler checa `isTrusted`, então
   um evento sintético serve os dois de uma vez.

   REGRA DE OURO: todo `keydown` tem `keyup` casado. Dedo que sai da
   tela sem soltar (`pointercancel`, troca de aba, `blur`) é jogador
   andando e atirando pra sempre — por isso `releaseAll()` existe e é
   chamado nos três casos.

   O olhar NÃO é aplicado aqui. O módulo só acumula o arrasto do dedo;
   quem escreve na câmera é game.js (`applyTouchLook`), uma vez por
   frame, ANTES do applyFpsCamera — mesma matemática e mesma ordem YXZ
   que o PointerLockControls fazia no `mousemove`, que no celular não
   existe porque não existe pointer lock.

   O GATILHO TAMBÉM MIRA (docs/mobile/referencia-mira-toque.md §6 P0-1).
   Antes, o polegar direito escolhia entre mirar e atirar — nunca os dois,
   e é isso que todo AAA de toque resolve (CoD Mobile: botão que segue o
   dedo; Critical Ops: "FIRE BUTTON AIM SENSITIVITY"; PUBG: tiro dos dois
   lados). O dedo que aperta ATIRAR alimenta o MESMO acumulador do olhar
   enquanto arrasta, multiplicado por um fator próprio (0 desliga). Nada
   muda no caminho do tiro.

   HUD QUE SERVE (referência §4 e P2-7; critérios C7/C8 da régua do celular):
   · ARMAS COMO ÍCONES (#tcArmas): uma arma por toque, pelo índice — o ⇄ só
     andava pra frente (até 7 toques entre duas das 8 do BR).
   · BOTÕES CONTEXTUAIS: USAR, COMER, KIT e GRANADA só aparecem quando o jogo
     tem o que fazer com eles (`disponivel`, lido do jogo). Some por
     `visibility`, a célula fica: nada anda de lugar debaixo do polegar.
   · TRAVA DE CORRIDA: arrastar o analógico além de um ponto acima dele trava
     a corrida (SPRINT_LOCK_R). O jogo não precisa saber: travado, o módulo
     sai 1 e o `mag > SPRINT_MAG` de sempre corre.
   As leituras do jogo (arsenal, arma ativa, troca, disponível) chegam por
   injeção no createTouchControls; sem elas tudo volta ao comportamento
   anterior (fiação ausente nunca apaga botão).
   ================================================================ */
import { TOUCH_DEFAULTS } from './config.js';
import { tanRatio } from './aimassist.js';

/* data-act do contrato com o HUD (index.html).
   `eat`/`sight`/`chat` existem porque KeyF (comer carne), KeyT (trocar
   acessório de mira) e Enter (chat do BR) não tinham NENHUM caminho de
   toque: no celular a carne entrava no inventário e nunca saía — uma
   mecânica de cura inteira morta —, a arma ficava presa na mira padrão e
   o BR ficava mudo. `fireL` é o segundo ATIRAR, à esquerda (ajuste,
   nasce desligado): PUBG Mobile o tem por padrão. */
export const TOUCH_ACTS = Object.freeze(['fire', 'ads', 'jump', 'crouch', 'reload',
  'nade', 'use', 'med', 'swap', 'inv', 'pause', 'eat', 'sight', 'chat', 'fireL']);

/* os gatilhos: os únicos botões cujo arrasto também gira a câmera */
const AIM_ACTS = new Set(['fire', 'fireL']);

/* Raio útil do analógico em px de CSS. O analógico é FLUTUANTE: a origem
   é onde o dedo encostou, não o centro do desenho — polegar de celular
   não acerta o centro de um círculo de 130 px. */
export const STICK_RADIUS = 58;

/* Zona morta RADIAL (fração do raio). Por eixo deixaria a diagonal curta
   passar e o jogador andaria de esguelha só apoiando o dedo. */
export const STICK_DEADZONE = 0.12;

/* Correr no toque não tem botão: é o analógico no talo (mesma leitura de
   um gatilho analógico de controle). Acima disto liga o `sprintHeld`.
   0,8 é o da Apple (WWDC26 "Make your game great with touch": "A small tilt
   means the character moves at a normal pace. If it's a big tilt, the
   character will sprint", `if magnitude > 0.8`); o Touch Adaptation Kit da
   Microsoft troca andar por correr em 0,75. Era 0,85 — o mais alto dos três,
   e o que mais polegar pedia para correr (8,6 mm contra 9,1 mm no S22). */
export const SPRINT_MAG = 0.8;

/* Deflexão (0..1, pós-zona-morta) → módulo do vetor de ANDAR (0..1, onde 1
   é o W do teclado). Acima do limiar de corrida é 1: o jogo corre pelo `mag`,
   não por este módulo. Pura, sem estado, exportada para o teste medir. */
export function andarDaDeflexao(m) {
  const d = typeof m === 'number' && Number.isFinite(m) ? m : 0;
  if (d <= 0) return 0;
  if (d >= SPRINT_MAG) return 1;
  return d / SPRINT_MAG;
}

/* TRAVA DE CORRIDA (docs/mobile/referencia-mira-toque.md §4.2/§4.3, P2-7).
   PUBG Mobile: "drag the "Cross" icon and hold in running mode"; Warzone
   Mobile: "lock Auto Sprint to a button above the virtual stick". Arrastar o
   dedo do analógico ALÉM de um ponto acima dele trava a corrida: o polegar
   pode relaxar de volta pro centro e o jogador segue correndo, cheio, na
   direção do dedo (ou em frente, com o dedo parado no centro). Destrava ao
   PUXAR PARA TRÁS além da zona morta, ao soltar o dedo e em todo releaseAll.

   [INFERÊNCIA — sem fonte] Nenhum jogo publica o limiar (referência §5, item
   10: CoD fala em "forward position", PUBG em "running mode", sem número).
   · 1,6 R = 93 px acima de onde o dedo encostou. Precisa ficar ALÉM do talo
     com folga: quem corre empurra o polegar para fora do raio (58 px) sem
     querer, e 1,3 R de sobra (75 px) nunca trava (teste de núcleo). E precisa
     caber no polegar: com a origem a 60–90 px do rodapé, o alvo fica a
     150–180 px do rodapé, dentro de qualquer paisagem de 360 px.
   · cone de 30° em volta da vertical: a diagonal de 45° (correr de esguelha)
     nunca trava; o polegar que sobe torto até 30° trava.
   Dirigindo, a trava fica DESLIGADA (setSprintLock): lá o analógico vira
   tecla de volante, e "travado com o dedo no centro" seria acelerador preso. */
export const SPRINT_LOCK_R = 1.6;
export const SPRINT_LOCK_CONE = 30;

/* SENSIBILIDADE DO OLHAR — radianos por px de CSS.
   O mouse com pointer lock usa `movementX * 0.002 * pointerSpeed`, em px
   de DISPOSITIVO e sem limite de curso (o mouse anda o quanto quiser). O
   dedo tem curso limitado pela tela, então o valor aqui é maior: uma
   varredura de 1000 px (paisagem de celular inteira) gira ~183°.
   Por que px de CSS e NÃO multiplicado por devicePixelRatio: px de CSS
   já É a unidade normalizada por DPI — em telas de DPR 2 e 3 o mesmo
   deslocamento FÍSICO do dedo dá o mesmo número de px de CSS. Multiplicar
   por DPR contaria a normalização duas vezes e um celular DPR 3 ficaria
   3x mais sensível que outro DPR 1 pro mesmo arrasto de dedo. */
export const LOOK_RAD_PER_CSS_PX = 0.0032;

/* ACELERAÇÃO DO OLHAR — OPÇÃO do menu, PADRÃO 0 = LINEAR.
   Por que o padrão fica linear: a régua (docs/mobile/criterio-aaa.md M3e)
   pede, e a Apple desenha o olhar por toque como touchpad 1:1 — "It moves
   exactly as far as their finger moves, with no latency or drift"
   (WWDC26 "Make your game great with touch"). Aceleração no toque só o
   Critical Ops documenta (3 %), e ela teve o defeito "dependent on
   framerate" (docs/mobile/referencia-mira-toque.md §3.1, P3-10).
   Ligada, o ganho de cada pedaço de arrasto depende da VELOCIDADE DO DEDO,
   medida pelo relógio do EVENTO de toque (timeStamp, amostra a amostra via
   getCoalescedEvents na camada DOM) — nunca pelo dt do quadro.
   A forma e os números têm fonte, e são de dispositivo RELATIVO de dedo/mão:
   · rampa linear entre 0,05 e 0,2 m/s — `SigmoidFunction` da libpointing
     (INRIA, Casiez & Roussel): "GMIN 1.0f, GMAX 6.0f, V1 0.05f, V2 0.2f";
   · ganho de 1 a 2 — as duas funções que Casiez, Vogel, Balakrishnan e
     Cockburn (HCI 2008) revisam: ganho 1 até 200 mm/s e 2 depois (Graham);
     de 1 a 2 linear até 100 mm/s (Trankle & Deutschmann). O 6 da
     libpointing é de CURSOR; câmera de FPS com 6× em flick é inusável
     [INFERÊNCIA]. O mesmo artigo mede aceleração 3,3 % mais rápida que
     ganho constante em apontamento.
   · mm → px de CSS pelo dp do Android ("One dp is ... roughly equal to one
     pixel on a medium-density screen (160 dpi ...)"; o Chrome do Android
     tem 1 px de CSS = 1 dp): 6,3 px/mm → 0,05 m/s = 315 px/s, 0,2 m/s =
     1260 px/s. No S22 do dono (≈422 ppi, DPR 3) 1 mm = 5,5 px de CSS: os
     limiares caem em 0,057 e 0,23 m/s — a mesma ordem.
   Devagar (mira fina) o ganho é 1 — a mira fina não muda; quem quer mais
   fino baixa a sensibilidade base e deixa a aceleração devolver a volta
   rápida. O ajuste do menu (0..1) mistura o linear com a curva cheia. */
export const LOOK_ACCEL = Object.freeze({ vLenta: 315, vRapida: 1260, ganhoLento: 1, ganhoRapido: 2 });
/* piso do intervalo entre dois eventos: 240 Hz de digitalizador = 4,2 ms
   (Galaxy S22: "240Hz Touch Sampling Rate in Game Mode", Samsung). Dois
   eventos com o MESMO relógio (sintético, ou sem relógio próprio) viram "o
   mais rápido que um dedo real produz", nunca ÷0 */
const ACCEL_DT_MIN_MS = 4;
export function ganhoDoOlhar(vPxPorS, k) {
  const kk = typeof k === 'number' && Number.isFinite(k) ? (k < 0 ? 0 : k > 1 ? 1 : k) : 0;
  if (!(kk > 0) || typeof vPxPorS !== 'number' || !Number.isFinite(vPxPorS)) return 1;
  const A = LOOK_ACCEL;
  const t = (vPxPorS - A.vLenta) / (A.vRapida - A.vLenta);
  const g = A.ganhoLento + (A.ganhoRapido - A.ganhoLento) * (t < 0 ? 0 : t > 1 ? 1 : t);
  return 1 + (g - 1) * kk;
}

/* MESMO clamp de pitch de game.js:1402. Divergir daqui = câmera de
   cabeça pra baixo em um dos dois caminhos. */
export const PITCH_LIMIT = 1.55;

/* Volante do carro/heli é BINÁRIO (js/car.js e js/heli.js leem `keys`).
   Enquanto dirige, o analógico é quantizado em WASD com histerese — sem
   ela um dedo parado no limiar dispararia keydown/keyup todo frame. */
export const VEHICLE_ON = 0.35;
export const VEHICLE_OFF = 0.2;

const ACTS = new Set(TOUCH_ACTS);

/* qualquer lixo (NaN, undefined, string, null) vira 0: uma exceção num
   handler de ponteiro mataria o input do jogo no meio da partida */
function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : 0; }

/* NaN/lixo vira 0 (olhar pro horizonte); ±Infinity CLAMPA e preserva a
   direção — é um limite, não uma validação. */
export function clampPitch(x) {
  if (typeof x !== 'number' || Number.isNaN(x)) return 0;
  return x < -PITCH_LIMIT ? -PITCH_LIMIT : x > PITCH_LIMIT ? PITCH_LIMIT : x;
}

/* ================================================================
   NÚCLEO PURO
   ================================================================ */
export function createTouchCore(options) {
  const o = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  const dzRaw = num(o.deadzone);
  const dz = dzRaw > 0 && dzRaw < 0.9 ? dzRaw : STICK_DEADZONE;
  const cursoValido = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : STICK_RADIUS);
  let radius = cursoValido(num(o.radius));
  /* fator do arrasto do gatilho sobre o olhar: 0 desliga, lixo vira 1 */
  const fatorGatilho = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 1);
  let fireLook = fatorGatilho(o.fireLook);

  /* Um dedo, uma função. `owners` é pointerId -> 'stick' | 'look' | act. */
  const owners = new Map();
  const held = new Set();
  /* último ponto do dedo de cada GATILHO (pointerId -> {x, y}) — o arrasto
     dele vira olhar. Aloca só no toque, nunca por pointermove. */
  const drag = new Map();
  /* objetos FIXOS: o loop roda a 60 FPS num celular fraco e alocar por
     evento/frame no caminho quente paga GC exatamente no tiroteio */
  /* `x`/`y` = vetor de ANDAR (o que o jogo soma ao W/A/S/D); `px`/`py` =
     DEFLEXÃO do dedo (0..1, pós-zona-morta), que é o que o knob desenha e o
     volante quantiza; `mag` = módulo da deflexão (o limiar de corrida lê). */
  const move = { x: 0, y: 0, mag: 0, px: 0, py: 0, active: false };
  const look = { dx: 0, dy: 0 };     // acumulador
  /* aceleração do olhar (0 = linear, o padrão). `lastLookT` = relógio do
     último evento do dedo do olhar; NaN = sem relógio (ganho 1). */
  const ajusteAccel = v => (typeof v === 'number' && Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0);
  let accel = ajusteAccel(o.lookAccel);
  let lastLookT = NaN;
  /* ganho do pedaço (ddx, ddy) que chegou em `t`, desde o evento em `t0` */
  function ganhoDoPedaco(ddx, ddy, t, t0) {
    if (!(accel > 0) || typeof t !== 'number' || !Number.isFinite(t) || !Number.isFinite(t0)) return 1;
    const dt = t - t0 > ACCEL_DT_MIN_MS ? t - t0 : ACCEL_DT_MIN_MS;
    return ganhoDoOlhar(Math.hypot(ddx, ddy) * 1000 / dt, accel);
  }
  const relogio = t => (typeof t === 'number' && Number.isFinite(t) ? t : NaN);
  const lookOut = { dx: 0, dy: 0 };  // devolvido por takeLook()
  let stickId = null, lookId = null;
  let lastLookX = 0, lastLookY = 0;
  /* trava de corrida (ver SPRINT_LOCK_R): `travaOn` é a permissão (veículo
     desliga), `travado` o estado, `perto` = dedo além do talo subindo, ainda
     sem travar (a camada DOM mostra o alvo). `rawX/rawY` guardam o último
     ponto do dedo para recalcular o movimento quando a trava é desligada por
     fora, sem esperar o próximo pointermove. */
  let lockDist = radius * SPRINT_LOCK_R;
  const coneCos = Math.cos(SPRINT_LOCK_CONE * Math.PI / 180);
  let travaOn = true, travado = false, perto = false;
  let rawX = 0, rawY = 0;

  function zeroMove() { move.x = 0; move.y = 0; move.mag = 0; move.px = 0; move.py = 0; }

  /* px relativos à origem do analógico (y cresce pra BAIXO, como na tela)
     -> x = strafe (direita +), y = frente (+ = W), mag = 0..1 */
  function setStick(px, py) {
    const dx = num(px), dy = num(py);
    rawX = dx; rawY = dy;
    const len = Math.hypot(dx, dy);
    /* subindo DENTRO do cone: -dy/len = cosseno do ângulo com a vertical */
    const subindo = -dy > 0 && -dy >= len * coneCos;
    if (travaOn) {
      if (!travado && subindo && -dy >= lockDist) travado = true;
      else if (travado && dy > radius * dz) travado = false;   // puxou pra trás
    }
    perto = travaOn && !travado && subindo && len >= radius;
    if (travado) {
      /* corrida CHEIA na direção do dedo; polegar descansando no centro =
         em frente (é o "auto sprint" do WZM, não um acelerador de meio curso) */
      if (len <= radius * dz) { move.x = 0; move.y = 1; move.mag = 1; move.px = 0; move.py = 1; return; }
      move.x = dx / len; move.y = -dy / len; move.mag = 1;
      move.px = move.x; move.py = move.y;
      return;
    }
    if (len <= 0) { zeroMove(); return; }
    let m = len / radius;
    if (m > 1) m = 1;                       // fora do raio = talo, não mais
    if (m <= dz) { zeroMove(); return; }     // zona morta radial
    m = (m - dz) / (1 - dz);                 // remapeia: borda da zona = 0
    const k = m / len;                       // normaliza E aplica a magnitude
    move.px = dx * k;
    move.py = -dy * k;                       // tela pra cima = frente
    move.mag = m;
    /* ANDAR: a faixa de andar vai da zona morta ao limiar de corrida, e o
       TOPO dela anda o que o W do teclado anda (módulo 1). Antes o vetor
       valia a própria deflexão: andando, o toque parava em 0,85 × 5,2 =
       4,42 m/s (85 % do teclado, na mesma partida) e meio curso dava 2,24
       m/s — medido no S22 pelo toque real. Só o MÓDULO muda: a direção é a
       do dedo, sem torção (a lição da zona morta por eixo do VR). */
    const a = andarDaDeflexao(m) / m;
    move.x = move.px * a;
    move.y = move.py * a;
  }

  function onStickStart(id, x, y) {
    if (owners.has(id) || stickId !== null) return false;
    stickId = id;
    owners.set(id, 'stick');
    move.active = true;
    travado = false;
    setStick(x, y);
    return true;
  }
  function onStickMove(id, x, y) {
    if (stickId === null || id !== stickId) return false;
    setStick(x, y);
    return true;
  }
  function onStickEnd(id) {
    if (stickId === null || id !== stickId) return false;
    owners.delete(id);
    stickId = null;
    move.active = false;
    travado = false;
    perto = false;
    zeroMove();
    return true;
  }
  /* veículo liga/desliga a permissão. Desligar com a trava engatada solta na
     hora e devolve ao movimento o que o DEDO está pedindo agora. */
  function setSprintLock(on) {
    travaOn = !!on;
    if (travaOn) return;
    perto = false;
    if (!travado) return;
    travado = false;
    if (stickId !== null) setStick(rawX, rawY);
  }

  /* `t` (opcional) = relógio do evento de toque em ms (`timeStamp`). Só a
     aceleração o lê; sem ele o ganho é 1. */
  function onLookStart(id, x, y, t) {
    if (owners.has(id) || lookId !== null) return false;
    lookId = id;
    owners.set(id, 'look');
    lastLookX = num(x);
    lastLookY = num(y);   // encostar o dedo NÃO gira: delta parte daqui
    lastLookT = relogio(t);
    return true;
  }
  function onLookMove(id, x, y, t) {
    if (lookId === null || id !== lookId) return false;
    const nx = num(x), ny = num(y);
    const ddx = nx - lastLookX, ddy = ny - lastLookY;
    const g = ganhoDoPedaco(ddx, ddy, t, lastLookT);
    look.dx += ddx * g;
    look.dy += ddy * g;
    lastLookX = nx;
    lastLookY = ny;
    const tt = relogio(t);
    if (Number.isFinite(tt)) lastLookT = tt;
    return true;
  }
  function onLookEnd(id) {
    if (lookId === null || id !== lookId) return false;
    owners.delete(id);
    lookId = null;
    return true;
  }
  /* consumo por frame (mesmo padrão do mouse.swayX em game.js:1417-1419):
     devolve o acumulado E zera */
  function takeLook() {
    lookOut.dx = look.dx;
    lookOut.dy = look.dy;
    look.dx = 0;
    look.dy = 0;
    return lookOut;
  }

  /* `x`/`y` (opcionais) = onde o dedo encostou. Só os gatilhos guardam: é a
     origem do arrasto que mira — encostar não gira nada, igual ao olhar. */
  function press(act, id, x, y, t) {
    if (!ACTS.has(act)) return false;
    if (owners.has(id)) return false;   // esse dedo já controla outra coisa
    if (held.has(act)) return false;    // botão já é de outro dedo
    held.add(act);
    owners.set(id, act);
    if (AIM_ACTS.has(act)) drag.set(id, { x: num(x), y: num(y), t: relogio(t) });
    return true;
  }
  function release(act) {
    if (!ACTS.has(act) || !held.delete(act)) return false;
    for (const [id, role] of owners) if (role === act) { owners.delete(id); drag.delete(id); break; }
    return true;
  }
  /* arrasto do dedo que segura um GATILHO: soma no mesmo acumulador do olhar */
  function onPressMove(id, x, y, t) {
    const p = drag.get(id);
    if (!p || !AIM_ACTS.has(owners.get(id))) return false;
    const nx = num(x), ny = num(y);
    if (fireLook > 0) {
      const ddx = nx - p.x, ddy = ny - p.y;
      const g = ganhoDoPedaco(ddx, ddy, t, p.t) * fireLook;
      look.dx += ddx * g;
      look.dy += ddy * g;
    }
    p.x = nx;
    p.y = ny;
    const tt = relogio(t);
    if (Number.isFinite(tt)) p.t = tt;
    return true;
  }
  function setFireLook(k) { fireLook = fatorGatilho(k); }
  function setLookAccel(k) { accel = ajusteAccel(k); }
  /* CURSO do analógico (px de CSS do centro ao talo). A zona morta e a trava
     são frações dele e acompanham; com o dedo parado, recalcula na hora. */
  function setRadius(px) {
    radius = cursoValido(px);
    lockDist = radius * SPRINT_LOCK_R;
    if (stickId !== null) setStick(rawX, rawY);
  }
  function releasePointer(id) {
    const role = owners.get(id);
    if (role === undefined) return null;
    if (role === 'stick') { onStickEnd(id); return 'stick'; }
    if (role === 'look') { onLookEnd(id); return 'look'; }
    release(role);
    return role;
  }
  /* aba escondida / blur / pointercancel geral: solta TUDO. Quem precisa
     emitir os keyup casados varre TOUCH_ACTS com pressed() ANTES de chamar. */
  function releaseAll() {
    owners.clear();
    held.clear();
    drag.clear();
    stickId = null;
    lookId = null;
    move.active = false;
    travado = false;
    perto = false;
    zeroMove();
    look.dx = 0;
    look.dy = 0;
  }

  return {
    onStickStart, onStickMove, onStickEnd,
    onLookStart, onLookMove, onLookEnd, takeLook,
    press, release, releasePointer, releaseAll,
    onPressMove, setFireLook, setSprintLock, setLookAccel, setRadius,
    get fireLook() { return fireLook; },
    get lookAccel() { return accel; },
    pressed: act => held.has(act),
    roleOf: id => { const r = owners.get(id); return r === undefined ? null : r; },
    getMove: () => move,
    lookActive: () => lookId !== null,
    stickActive: () => stickId !== null,
    /* corrida travada (ver SPRINT_LOCK_R) e "dedo a caminho da trava" */
    locked: () => travado,
    nearLock: () => perto,
    /* quantos dedos ainda são donos de alguma coisa (pointercancel: o último
       que sai é quem autoriza soltar a mira alternada — ver camada DOM) */
    ativos: () => owners.size,
    get radius() { return radius; },
    deadzone: dz,
  };
}

/* ================================================================
   BOTÕES CONTEXTUAIS (C8) — puro
   ================================================================ */

/* Os botões que só aparecem quando servem (referência §4.1/§4.5: CoD Mobile
   "this button will pop-up"; Critical Ops "The touch button appears when you
   can pick up an item"). O resto do cluster é fixo: o gatilho, a mira, pular,
   agachar e recarregar servem sempre. */
export const CONTEXT_ACTS = Object.freeze(['use', 'eat', 'med', 'nade']);
const CONTEXT_SET = new Set(CONTEXT_ACTS);

/* `disponivel(act)` é a leitura do JOGO (inventário, #prompt, baú do BR). As
   duas travas daqui são de segurança, não de gosto:
   · botão SEGURADO fica — some com o dedo em cima e o toque seguinte cai na
     área de mira, o `keyup` casado vira órfão e o jogador perde o gesto;
   · fiação ausente, lixo ou exceção = VISÍVEL. Um defeito na leitura do jogo
     pode no máximo mostrar um botão a mais, nunca apagar o kit médico. */
export function botaoVisivel(act, disponivel, pressionado) {
  if (!CONTEXT_SET.has(act) || pressionado || typeof disponivel !== 'function') return true;
  try { return !!disponivel(act); } catch (e) { return true; }
}

/* ================================================================
   ARMAS COMO ÍCONES (C7) — puro
   ================================================================ */

/* Rótulo curto do ícone: a primeira palavra do nome declarado em
   js/weapons.js ("FUZIL", "DMR", "FACA"...). O número do slot mora no próprio
   ícone, então as duas ESCOPETAS continuam distintas. */
export function rotuloArma(nome) {
  if (typeof nome !== 'string') return '';
  const t = nome.trim();
  if (!t) return '';
  return t.split(/\s+/)[0];
}

/* ================================================================
   SENSIBILIDADE DO TOQUE — puro (docs/mobile/referencia-mira-toque.md §3)
   ================================================================ */

/* px de arrasto -> radianos de giro. `ratioY` é a razão vertical/horizontal
   (P1-5): 0,33 na Insomniac, 0,40 no Critical Ops, 0,60 no Lyra — o
   músculo do movimento vertical do polegar é mais fraco. A razão escala SÓ o
   eixo vertical, linearmente: um arrasto (dx, dy) gira no ângulo
   atan(razão × dy/dx). Nada de zona morta aqui — é zona morta POR EIXO que
   torce a diagonal (o VR já pagou por isso). `out` é reaproveitado. */
export function lookRadians(dx, dy, sens, ratioY, scale, out) {
  const o = out || { yaw: 0, pitch: 0 };
  const k = num(sens) * num(scale);
  o.yaw = -num(dx) * k;
  o.pitch = -num(dy) * k * num(ratioY);
  return o;
}

/* Escala do olhar pelo zoom (P1-4): tan(fov/2) / tan(fovQuadril/2) — "the
   proper way to scale based off FOV changes" (Lyra, para toque E controle).
   O degrau antigo (0,75 / 0,36 por um corte em 40°) deixava o red dot 29 %
   mais rápido na tela que o quadril e a luneta 2x 15 % mais lenta. A base é
   o FOV do QUADRIL NAQUELE MOMENTO (75, ou 85 correndo): abrir o FOV no
   sprint não pode mexer na sensibilidade. `adsMult` é o ajuste do jogador,
   misturado por `adsK` (0 quadril … 1 mirando) para nunca vazar pro quadril. */
export function lookScale(fovNow, fovHip, adsK, adsMult) {
  const k = num(adsK) < 0 ? 0 : num(adsK) > 1 ? 1 : num(adsK);
  const m = typeof adsMult === 'number' && Number.isFinite(adsMult) && adsMult > 0 ? adsMult : 1;
  return tanRatio(num(fovNow) || 75, num(fovHip) || 75) * (1 + (m - 1) * k);
}

/* Limites dos ajustes numéricos (o slider do menu anda dentro deles). */
const TOUCH_RANGES = Object.freeze({
  touchLook: [0.3, 2.5], touchRatioY: [0.3, 1], touchAds: [0.5, 1.5], touchFireLook: [0, 1.5],
  touchLookAccel: [0, 1], touchStick: [0.6, 1.5],
});
function cfgNum(s, k) {
  const raw = s[k];
  const v = typeof raw === 'number' ? raw
    : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(v)) return TOUCH_DEFAULTS[k];
  const [lo, hi] = TOUCH_RANGES[k];
  return v < lo ? lo : v > hi ? hi : v;
}
/* liga/desliga: só 0/1 (ou booleano) contam. Lixo cai no PADRÃO — um
   localStorage corrompido não pode desligar a assistência de ninguém. */
function cfgFlag(s, k) {
  const v = s[k];
  if (v === true || v === 1 || v === '1') return true;
  if (v === false || v === 0 || v === '0') return false;
  return !!TOUCH_DEFAULTS[k];
}
/* SETTINGS (js/config.js, localStorage) -> configuração do toque, normalizada */
export function touchConfig(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  return {
    look: cfgNum(s, 'touchLook'),
    ratioY: cfgNum(s, 'touchRatioY'),
    ads: cfgNum(s, 'touchAds'),
    fireLook: cfgNum(s, 'touchFireLook'),
    accel: cfgNum(s, 'touchLookAccel'),
    stick: cfgNum(s, 'touchStick'),
    assist: cfgFlag(s, 'touchAssist'),
    autoFire: cfgFlag(s, 'touchAutoFire'),
    fireLeft: cfgFlag(s, 'touchFireLeft'),
  };
}
/* Grava um ajuste de toque. O valor vale NA HORA (fica no objeto da sessão);
   persistir é melhor esforço: aba privada ou cota cheia fazem o
   `localStorage.setItem` lançar, e isso não pode derrubar o menu. */
export function saveTouchSetting(settings, key, value, persist) {
  if (!settings || typeof settings !== 'object' ||
      !Object.prototype.hasOwnProperty.call(TOUCH_DEFAULTS, key)) return false;
  settings[key] = value;
  try { if (typeof persist === 'function') persist(); return true; }
  catch (e) { return false; }
}
/* "Restaurar padrão" (C9): devolve TODAS as chaves de toque ao padrão de
   js/config.js e só elas (volume, resolução etc. são de outra seção). Mesma
   regra do saveTouchSetting: vale na sessão primeiro, persistir é melhor
   esforço — cota cheia não pode prender o jogador no ajuste que ele quis
   desfazer. */
export function restaurarToque(settings, persist) {
  if (!settings || typeof settings !== 'object') return false;
  for (const k of Object.keys(TOUCH_DEFAULTS)) settings[k] = TOUCH_DEFAULTS[k];
  try { if (typeof persist === 'function') persist(); return true; }
  catch (e) { return false; }
}

/* ================================================================
   CAMADA DOM
   ================================================================ */

/* botão -> KeyboardEvent.code. Estes passam por evento sintético porque
   as MESMAS teclas são lidas por game.js (keys/justPressed) e pelo
   listener exclusivo do BR (nave, paraquedas, baú, chat). */
const KEY_OF = {
  jump: 'Space',        // pular / pular da nave / abrir paraquedas / próximo espectado
  crouch: 'ControlLeft', // agachar (SEGURA) + deslizar no sprint
  reload: 'KeyR',
  nade: 'KeyG',
  use: 'KeyE',          // veículo/baú (js/interact.js + br-game.js)
  med: 'KeyQ',
  inv: 'Tab',
  eat: 'KeyF',          // comer carne (game.js:1977 -> eatMeat)
  sight: 'KeyT',        // ciclar acessório de mira (WeaponRig.cycleSight)
  /* chat do BR. É o MESMO Enter de br-game.js:1821 — abrir e enviar saem do
     listener que já existe, então o modo BR não precisa saber que existe
     toque. Segundo toque com o chat aberto cai no `closeChat(true)` de lá. */
  chat: 'Enter',
};

const IDS = { root: 'touchUI', move: 'tcMove', knob: 'tcMoveKnob', look: 'tcLook', btns: 'tcBtns',
  btnsL: 'tcBtnsL',     // segundo ATIRAR, à esquerda (fora do cluster: é do polegar ESQUERDO)
  armas: 'tcArmas',     // armas como ícones tocáveis (C7)
  trava: 'tcTrava' };   // alvo da trava de corrida, acima do analógico
/* aviso de orientação: o nó do aviso e o botão de escape (ver createOrientationGate) */
const GATE_IDS = { gate: 'rotateGate', play: 'rgPlay' };

/* Andaime mínimo pra quando o HUD ainda não trouxe o DOM do contrato.
   Só é criado no modo celular, então o desktop nunca vê isto. Estilo
   inline PROPOSITAL: sem CSS do HUD, os controles precisam existir e ser
   tocáveis por conta própria (é o que o teste de browser exercita). */
function buildFallback(doc) {
  const mk = (tag, id, css) => {
    const el = doc.createElement(tag);
    if (id) el.id = id;
    el.style.cssText = css;
    return el;
  };
  const root = mk('div', IDS.root,
    'position:fixed;inset:0;pointer-events:none;z-index:40;display:none');
  root.dataset.tcFallback = '1';
  const look = mk('div', IDS.look,
    'position:absolute;inset:0;pointer-events:auto;touch-action:none;z-index:0');
  const move = mk('div', IDS.move,
    'position:absolute;left:16px;bottom:16px;width:132px;height:132px;border-radius:50%;' +
    'background:rgba(255,255,255,.06);border:2px solid rgba(255,255,255,.18);' +
    'pointer-events:auto;touch-action:none;z-index:1');
  // centrado por MARGEM NEGATIVA, igual ao contrato do style.css: o
  // `transform` do knob é do JS (ver frame()), um translate(-50%) aqui seria
  // apagado no primeiro movimento
  const knob = mk('div', IDS.knob,
    'position:absolute;left:50%;top:50%;width:53px;height:53px;margin:-26.5px 0 0 -26.5px;' +
    'border-radius:50%;background:rgba(255,255,255,.22);pointer-events:none');
  move.appendChild(knob);
  const btns = mk('div', IDS.btns,
    'position:absolute;right:14px;bottom:14px;display:flex;flex-wrap:wrap-reverse;' +
    'justify-content:flex-end;gap:8px;width:250px;pointer-events:none;z-index:1');
  const LABEL = { fire: '🔥', ads: '🎯', jump: '⤒', crouch: '⤓', reload: '⟳', nade: '●',
    use: 'E', med: '✚', swap: '⇄', inv: '☰', pause: '❚❚',
    eat: '🍖', sight: '🔭', chat: '💬' };
  for (const act of TOUCH_ACTS) {
    if (act === 'fireL') continue;   // opcional e do lado esquerdo: o andaime não precisa
    const b = mk('div', '',
      'width:54px;height:54px;border-radius:50%;display:flex;align-items:center;' +
      'justify-content:center;font:600 15px/1 system-ui,sans-serif;color:#fff;' +
      'background:rgba(0,0,0,.35);border:2px solid rgba(255,255,255,.25);' +
      'pointer-events:auto;touch-action:none;user-select:none');
    b.className = 'tcBtn';
    b.dataset.act = act;
    b.textContent = LABEL[act] || act;
    btns.appendChild(b);
  }
  root.append(look, move, btns);
  doc.body.appendChild(root);
  return root;
}

export function createTouchControls(deps) {
  const d = deps && typeof deps === 'object' ? deps : {};
  const win = d.win || (typeof window !== 'undefined' ? window : null);
  const doc = d.doc || (win && win.document) || null;
  const core = d.core || createTouchCore();
  const mouse = d.mouse || { shooting: false, aiming: false, clicked: false, swayX: 0, swayY: 0 };
  const state = d.state || { started: false, paused: true };
  const setPaused = typeof d.setPaused === 'function' ? d.setPaused : () => {};
  const enabled = !!d.isMobile && !!win && !!doc && !!doc.body;
  /* ajustes de toque: o objeto SETTINGS do jogo (js/config.js). Lido aqui e
     reescrito por `bindSettings` — os dois lados olham o MESMO objeto. */
  const settings = d.settings && typeof d.settings === 'object' ? d.settings : {};
  let cfg = touchConfig(settings);

  /* DESLIGADO (desktop): nenhum listener, nenhum elemento, nenhuma classe. O
     objeto inerte tem a MESMA forma do ligado — `getMove()` devolve o estado
     zerado do núcleo, que é o que mantém o playerUpdate do teclado idêntico.
     Os no-ops são declarados AQUI e não reaproveitados do caminho ligado: uma
     closure de lá referenciaria consts que nunca são inicializadas (TDZ) e
     estouraria no primeiro setPaused. */
  if (!enabled) {
    return {
      core, enabled: false, fallback: false, el: null,
      getMove: core.getMove,
      takeLook: core.takeLook,
      setPlaying() {}, releaseAll() {}, soltarBotoes() {}, frame() {},
      lookSens: LOOK_RAD_PER_CSS_PX,
      /* sem toque não há ajuste de toque, escala de ADS nem tiro automático:
         o mouse segue com o `pointerSpeed` de sempre */
      cfg, lookScale: () => 1, setAutoFire() {}, bindSettings() {}, autoFire: false,
      lookIsTouch: false, sprintLocked: false,
    };
  }

  /* LEITURAS DO JOGO (fiação em game.js; todas opcionais — sem elas o toque
     se comporta como antes desta rodada, e nenhum botão some):
     · `arsenal` + `armaAtiva()` + `trocarArma(i)` — C7, armas como ícones
       tocáveis: qualquer arma em UM toque, pelo índice (CoD Mobile: "Tapping
       the stowed weapon will take it out and make it the current weapon").
     · `disponivel(act)` — C8, o botão aparece quando serve (ver botaoVisivel).
     Nenhuma delas aloca por chamada: são lidas uma vez por frame. */
  const arsenal = Array.isArray(d.arsenal) ? d.arsenal : null;
  const armaAtiva = typeof d.armaAtiva === 'function' ? d.armaAtiva : null;
  const trocarArma = typeof d.trocarArma === 'function' ? d.trocarArma : null;
  const disponivel = typeof d.disponivel === 'function' ? d.disponivel : null;

  /* estado do tiro automático: o que a assistência pediu neste frame, e se
     foi ele (e não um dedo) que segurou o gatilho — ver syncMouse */
  let autoFire = false, autoHeld = false;
  /* QUEM MEXEU NESTE QUADRO FOI UM DEDO? (critério A1) A assistência é do
     dedo: com `?mobile=1` no desktop, arrastar a área de mira com o MOUSE
     recebia assistência com precisão de mouse (0,806° medidos). `naoDedo`
     são os ponteiros vivos que não são toque; `naoDedoNoQuadro` acumula
     entre dois `takeLook` — o arrasto de mouse que terminou antes do quadro
     ainda é consumido nele, e esse quadro também não é do dedo. */
  const naoDedo = new Set();
  let naoDedoNoQuadro = false, dedoNoQuadro = true;
  function tipoDoPonteiro(e) {
    if (e.pointerType === 'touch') return;
    naoDedo.add(e.pointerId);
    naoDedoNoQuadro = true;
  }
  function takeLook() {
    dedoNoQuadro = !naoDedoNoQuadro;
    naoDedoNoQuadro = naoDedo.size > 0;
    return core.takeLook();
  }
  const api = {
    core, enabled, fallback: false, el: null,
    getMove: core.getMove,
    takeLook,
    /* false se algum ponteiro que moveu mira/analógico desde o último
       takeLook não era dedo — game.js desliga assistência e automático */
    get lookIsTouch() { return dedoNoQuadro; },
    setPlaying, releaseAll, soltarBotoes, frame, bindSettings,
    /* corrida travada pelo analógico (SPRINT_LOCK_R). O jogo não precisa ler:
       travado, o módulo sai 1 e o `mag > SPRINT_MAG` de sempre já corre. */
    get sprintLocked() { return core.locked(); },
    /* rad/px do olhar JÁ com o ajuste do jogador (a razão Y/X e o zoom são
       aplicados por quem gira a câmera: game.js applyTouchLook) */
    get lookSens() { return LOOK_RAD_PER_CSS_PX * cfg.look; },
    get cfg() { return cfg; },
    lookScale: (fovNow, fovHip, adsK) => lookScale(fovNow, fovHip, adsK, cfg.ads),
    setAutoFire(on) { autoFire = !!on; },
    get autoFire() { return autoFire; },
  };
  const html = doc.documentElement;
  html.classList.add('mobile');
  core.setFireLook(cfg.fireLook);
  core.setLookAccel(cfg.accel);
  core.setRadius(STICK_RADIUS * cfg.stick);
  html.classList.toggle('fireL', cfg.fireLeft);

  let root = doc.getElementById(IDS.root);
  if (!root) { root = buildFallback(doc); api.fallback = true; }
  const moveEl = doc.getElementById(IDS.move);
  const knobEl = doc.getElementById(IDS.knob);
  const lookEl = doc.getElementById(IDS.look);
  const btnsEl = doc.getElementById(IDS.btns);
  const btnsLEl = doc.getElementById(IDS.btnsL);
  const armasEl = doc.getElementById(IDS.armas);
  /* alvo da trava de corrida: nasce aqui se o HTML não o trouxe (andaime) */
  let travaEl = doc.getElementById(IDS.trava);
  if (!travaEl && moveEl) {
    travaEl = doc.createElement('div');
    travaEl.id = IDS.trava;
    travaEl.setAttribute('aria-hidden', 'true');
    travaEl.textContent = '⇈';
    moveEl.appendChild(travaEl);
  }
  api.el = { root, move: moveEl, knob: knobEl, look: lookEl, btns: btnsEl, btnsL: btnsLEl,
    armas: armasEl, trava: travaEl };

  /* `touch-action:none` é FUNCIONAL, não enfeite: sem ele o navegador
     rola/dá zoom e cancela a sequência de pointermove no meio do arrasto. */
  for (const el of [moveEl, lookEl, btnsEl, btnsLEl, armasEl]) if (el) el.style.touchAction = 'none';

  /* ---- C8: botões contextuais (act -> elementos), lidos UMA vez ---- */
  const ctxEls = {};
  const ctxShown = {};
  if (btnsEl) {
    for (const b of btnsEl.querySelectorAll('.tcBtn[data-act]')) {
      const act = b.dataset.act;
      if (!CONTEXT_SET.has(act)) continue;
      (ctxEls[act] || (ctxEls[act] = [])).push(b);
    }
  }

  /* ---- C7: armas como ícones. Um botão por arma, na ORDEM do arsenal: a
     posição de cada arma nunca muda (memória do polegar), a trancada fica no
     lugar dela, apagada e sem receber toque. ---- */
  const chips = [];
  if (arsenal && armaAtiva && trocarArma && armasEl) {
    for (let i = 0; i < arsenal.length; i++) {
      const w = arsenal[i] || {};
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'tcArma';
      b.dataset.slot = String(i);
      const n = doc.createElement('b');
      n.textContent = String(i + 1);
      const r = doc.createElement('small');
      r.textContent = rotuloArma(w.name);
      b.append(n, r);
      b.setAttribute('aria-label', `Arma ${i + 1}: ${typeof w.name === 'string' ? w.name : ''}`);
      armasEl.appendChild(b);
      chips.push({ el: b, rotulo: r, nome: r.textContent });
    }
    html.classList.add('armas');   // CSS troca o #slots do HUD por esta barra
  }

  const KeyEv = win.KeyboardEvent || (typeof KeyboardEvent !== 'undefined' ? KeyboardEvent : null);
  const WheelEv = win.WheelEvent || (typeof WheelEvent !== 'undefined' ? WheelEvent : null);
  const pressedEl = new Map();     // act -> elemento (pro feedback visual 'on')
  const veh = { KeyW: false, KeyS: false, KeyA: false, KeyD: false };
  /* estado do ADS que ESTE módulo acha que impôs. Existe só para detectar que
     alguém escreveu em `mouse.aiming` por baixo (ver syncMouse). */
  let adsOn = false;
  let brOn = null;                 // última leitura de window.__BR_active
  let originX = 0, originY = 0;    // origem flutuante do analógico
  let knobSpan = STICK_RADIUS;
  let knobX = 0, knobY = 0, knobOX = 0, knobOY = 0;

  /* menu, pausa e lobby não consomem input de jogo (mesmo portão do
     mousedown de game.js:1103) */
  const live = () => !!state.started && !state.paused;

  function sendKey(type, code) {
    if (!KeyEv) return;
    try { win.dispatchEvent(new KeyEv(type, { code, key: code, bubbles: true, cancelable: true })); }
    catch (e) { /* navegador sem construtor de evento: nada a fazer */ }
  }

  /* ---- botões ---- */
  function pressAct(act) {
    switch (act) {
      /* fire/ads NÃO passam por teclado: o jogo lê estado de MOUSE
         (game.js:1919 `want = gun.auto ? mouse.shooting : mouse.clicked`) */
      case 'fire': case 'fireL': mouse.shooting = true; mouse.clicked = true; return;
      /* ADS é ALTERNADO de propósito: segurar consumiria um terceiro dedo
         permanente e mirar+girar+atirar junto ficaria impossível */
      case 'ads': adsOn = !adsOn; mouse.aiming = adsOn; return;
      /* roda sintética em vez de Digit1/2/3: o handler de `wheel`
         (game.js:1107) já pula armas trancadas e cobre as OITO do BR —
         Digit só alcançaria três, e as 4-8 dependem do listener do BR */
      case 'swap':
        if (WheelEv) {
          try { win.dispatchEvent(new WheelEv('wheel', { deltaY: 100, bubbles: true })); }
          catch (e) { /* idem */ }
        }
        return;
      /* sem pointer lock não existe ESC nativo: o botão reusa o setPaused
         do jogo (game.js:1140), sem caminho paralelo de pausa */
      case 'pause': setPaused(!state.paused); return;
      default: {
        const code = KEY_OF[act];
        if (code) sendKey('keydown', code);
      }
    }
  }
  function releaseAct(act) {
    /* dois gatilhos (e o automático): soltar UM não solta o que o outro segura */
    if (AIM_ACTS.has(act)) { mouse.shooting = core.pressed('fire') || core.pressed('fireL') || autoFire; return; }
    if (act === 'ads' || act === 'swap' || act === 'pause') return; // sem tecla casada
    const code = KEY_OF[act];
    if (code) sendKey('keyup', code);
  }
  function paint(act) {
    const el = pressedEl.get(act);
    if (!el) return;
    el.classList.toggle('on', act === 'ads' ? adsOn : core.pressed(act));
  }
  function letGo(act) {
    if (!core.pressed(act)) return;
    core.release(act);
    releaseAct(act);
    paint(act);
    if (act !== 'ads') pressedEl.delete(act);
  }

  function onBtnDown(e) {
    const btn = e.target && e.target.closest ? e.target.closest('.tcBtn[data-act]') : null;
    if (!btn) return;
    const act = btn.dataset.act;
    if (!ACTS.has(act)) return;
    /* contextual escondido não é botão (C8). O dedo de verdade nem chega aqui
       (`visibility: hidden` não recebe toque); isto cobre evento despachado */
    if (btn.classList.contains('tcFora')) return;
    e.preventDefault();               // sem isto vem mousedown de compatibilidade
    if (act !== 'pause' && !live()) return;
    if (!core.press(act, e.pointerId, e.clientX, e.clientY, e.timeStamp)) return;
    tipoDoPonteiro(e);
    pressedEl.set(act, btn);
    capture(btn, e.pointerId);
    pressAct(act);
    paint(act);
  }

  /* ---- analógico ---- */
  function onMoveDown(e) {
    if (!live()) return;
    e.preventDefault();
    if (!core.onStickStart(e.pointerId, 0, 0)) return;
    tipoDoPonteiro(e);
    /* rect lido UMA vez por gesto (nunca no pointermove: leitura de
       layout no caminho quente é reflow por evento) */
    const r = moveEl.getBoundingClientRect();
    originX = e.clientX;
    originY = e.clientY;
    // curso do knob: raio do anel menos o raio do knob (--tcKnob = 0.4 do
    // diâmetro em style.css) => 0,5 - 0,2 = 0,3 do lado. Sem isto a bolinha
    // vaza pra fora do círculo desenhado.
    knobSpan = Math.max(12, Math.min(r.width, r.height) * 0.3);
    knobOX = originX - (r.left + r.width / 2);
    knobOY = originY - (r.top + r.height / 2);
    /* o alvo da trava fica ONDE ela engata: SPRINT_LOCK_R raios acima do
       ponto em que o dedo encostou (a origem é flutuante). Escrito uma vez por
       gesto — só aparece quando o dedo passa do talo subindo (`perto`). */
    if (travaEl) {
      /* o filho absoluto mede a partir da caixa de PADDING do anel, dentro
         da borda de 2 px — sem descontar a borda o alvo saía 2 px abaixo do
         ponto em que a trava engata (o teste achou 90,5 px contra 92,8) */
      const tx = originX - r.left - (moveEl.clientLeft || 0);
      const ty = originY - r.top - (moveEl.clientTop || 0) - core.radius * SPRINT_LOCK_R;
      travaEl.style.transform = `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0)`;
    }
    capture(moveEl, e.pointerId);
  }

  /* ---- C7: toque no ícone de uma arma = essa arma, já ----
     Na DESCIDA do dedo, como todo botão deste módulo: é o quadro mais cedo
     possível, e um dedo que depois arrasta não vira olhar (ele não é dono de
     nada no núcleo, então o pointermove dele é ignorado). */
  function onArmaDown(e) {
    const b = e.target && e.target.closest ? e.target.closest('.tcArma[data-slot]') : null;
    if (!b) return;
    e.preventDefault();               // mesmo motivo do onBtnDown (mouse de compatibilidade)
    if (!live()) return;
    const i = Number(b.dataset.slot);
    const w = arsenal[i];
    if (!w || w.locked) return;
    trocarArma(i);
    syncArmas();                      // o destaque anda no mesmo quadro do toque
  }

  /* ---- olhar ---- */
  function onLookDown(e) {
    if (!live()) return;
    e.preventDefault();
    if (!core.onLookStart(e.pointerId, e.clientX, e.clientY, e.timeStamp)) return;
    tipoDoPonteiro(e);
    capture(lookEl, e.pointerId);
  }

  function capture(el, id) {
    // ajuda quando o dedo escorrega pra fora do botão; em ponteiro
    // sintético (teste) lança NotFoundError — o roteamento por pointerId
    // nos listeners de janela cobre os dois casos
    try { el.setPointerCapture(id); } catch (err) { /* ok */ }
  }

  /* ---- roteamento por pointerId na JANELA ----
     move/up/cancel na janela (e não só nos elementos) é o que garante
     que um dedo que sai do botão, do analógico ou da tela ainda solte. */
  function onPointerMove(e) {
    const role = core.roleOf(e.pointerId);
    if (role === null) return;
    if (naoDedo.has(e.pointerId)) naoDedoNoQuadro = true;
    if (role === 'stick') { core.onStickMove(e.pointerId, e.clientX - originX, e.clientY - originY); return; }
    const olhar = role === 'look';
    if (!olhar && !AIM_ACTS.has(role)) return;
    /* COM ACELERAÇÃO, cada amostra do digitalizador conta com o PRÓPRIO
       relógio: o navegador agrupa os pointermove por quadro (rAF), e ler só
       o último faria a velocidade do dedo — e o ganho — depender da taxa de
       quadros. `getCoalescedEvents` devolve as amostras cruas. Sem aceleração
       (o padrão) a conta é linear e o agrupamento não muda nada: nem chama. */
    const amostras = core.lookAccel > 0 && typeof e.getCoalescedEvents === 'function'
      ? e.getCoalescedEvents() : null;
    if (amostras && amostras.length) {
      for (let i = 0; i < amostras.length; i++) {
        const a = amostras[i];
        if (olhar) core.onLookMove(e.pointerId, a.clientX, a.clientY, a.timeStamp);
        else core.onPressMove(e.pointerId, a.clientX, a.clientY, a.timeStamp);
      }
    } else if (olhar) core.onLookMove(e.pointerId, e.clientX, e.clientY, e.timeStamp);
    else core.onPressMove(e.pointerId, e.clientX, e.clientY, e.timeStamp); // o gatilho mira
  }
  function onPointerUp(e) {
    naoDedo.delete(e.pointerId);
    const role = core.roleOf(e.pointerId);
    if (role === null) return;
    if (role === 'stick' || role === 'look') core.releasePointer(e.pointerId);
    else letGo(role);
  }
  /* pointercancel é o SISTEMA tomando o gesto (notificação puxada, gesto de
     borda, chamada). Cada dedo cancelado solta o que segurava, como no
     pointerup; e quando o ÚLTIMO dedo que era dono de algo sai assim, o resto
     do estado vai junto — inclusive a MIRA alternada, que nenhum dedo segura
     (C10: "pointercancel de todos os dedos: a MIRA segue ligada"). Um dedo
     estranho (fora dos controles) cancelado não mexe em nada. */
  function onPointerCancel(e) {
    const dono = core.roleOf(e.pointerId) !== null;
    onPointerUp(e);
    if (dono && core.ativos() === 0) releaseAll();
  }

  function releaseAll() {
    naoDedo.clear();
    for (const act of TOUCH_ACTS) letGo(act);
    mouse.shooting = false;
    mouse.aiming = false;
    adsOn = false;
    autoFire = false;
    autoHeld = false;
    for (const el of pressedEl.values()) el.classList.remove('on');
    pressedEl.clear();
    if (moveEl) moveEl.classList.remove('on');
    for (const code in veh) if (veh[code]) { veh[code] = false; sendKey('keyup', code); }
    core.releaseAll();
  }

  /* ENTRAR no veículo — decisão do dono (2026-09-28): "já entra dirigindo".
     Solta os BOTÕES (tiro, pulo, mira, agachar…: o que servia a pé não pode
     virar subida do helicóptero nem tiro da janela) e MANTÉM o analógico: no
     quadro seguinte `frame(inVehicle)` o transforma em volante. Sair do
     veículo continua `releaseAll` (senão o boneco sai andando sozinho). */
  function soltarBotoes() {
    for (const act of TOUCH_ACTS) letGo(act);
    mouse.shooting = false;
    mouse.aiming = false;
    adsOn = false;
    autoFire = false;
    autoHeld = false;
    for (const el of pressedEl.values()) el.classList.remove('on');
    pressedEl.clear();
  }

  /* ---- por frame ---- */
  function setVeh(code, on) {
    if (veh[code] === on) return;
    veh[code] = on;
    sendKey(on ? 'keydown' : 'keyup', code);
  }
  const hyst = (was, v) => v > (was ? VEHICLE_OFF : VEHICLE_ON);

  /* ---- RECONCILIAÇÃO, uma vez por frame ----
     Outro sistema pode zerar o estado de mouse POR BAIXO do toque: a
     cinemática da destruição da cidade faz exatamente isso
     (city-destruction-client.js:153 zera shooting/clicked/aiming). Sem um
     ponto de reconciliação o dedo continuava em cima do gatilho, `core.held`
     ainda tinha 'fire' e `onBtnDown` recusava a nova pressão — a arma só
     voltava a atirar depois de levantar e reencostar o dedo, no meio do
     combate pós-explosão. E o botão MIRA ficava aceso com o ADS desligado.

     As duas direções são diferentes de propósito:
     · `fire` é DEDO NA TELA — verdade física. Se o dedo está lá, o gatilho
       volta. Nada aqui destrava a cinemática: shootUpdate (game.js:1993) já
       retorna cedo enquanto `state.cinematic`, então nenhum tiro sai antes
       da hora e os projéteis/cinemática do servidor seguem intactos.
     · `mouse.clicked` NÃO é reimposto: é aresta de um toque só (semi-auto),
       e reimpor daria um tiro de graça por frame.
     · `ads` é ESTADO ALTERNADO, não dedo. Quem escreveu por fora manda; o
       botão só passa a refletir a verdade.
     · TIRO AUTOMÁTICO (ajuste, §6 P0-3): quem decide é a assistência
       (js/aimassist.js — alvo VISÍVEL sob a cruz, no alcance da arma), via
       `setAutoFire`. Aqui ele segura o gatilho como um dedo seguraria, e
       arma o CLIQUE também: semiautomática lê a aresta, e a cadência de
       shootUpdate (60/rpm) é que limita — o clique reimposto por frame não
       vira tiro extra. Quando ele sai, solta só o que ELE segurou. */
  function syncMouse() {
    const dedo = core.pressed('fire') || core.pressed('fireL');
    if ((dedo || autoFire) && !mouse.shooting) mouse.shooting = true;
    if (autoFire) mouse.clicked = true;
    else if (autoHeld && !dedo) mouse.shooting = false;
    autoHeld = autoFire;
    if (!!mouse.aiming !== adsOn) { adsOn = !!mouse.aiming; paint('ads'); }
  }
  /* O botão de chat só faz sentido no Battle Royale: o Enter que ele emula é
     lido pelo listener exclusivo do BR. Ler a flag global que o BR já publica
     é mais barato (e menos invasivo) que fazer o br-game.js conhecer o toque. */
  function syncBR() {
    const on = !!win.__BR_active;
    if (on === brOn) return;
    brOn = on;
    html.classList.toggle('br', on);
  }

  /* ---- C8: o botão aparece quando serve ----
     Esconde com `visibility` (classe `tcFora`), NUNCA com `display`: a célula
     do grid continua ocupada e nenhum outro botão anda de lugar — memória do
     polegar. Escreve só na transição. */
  function syncContexto() {
    if (!disponivel) return;
    for (let i = 0; i < CONTEXT_ACTS.length; i++) {
      const act = CONTEXT_ACTS[i];
      const on = botaoVisivel(act, disponivel, core.pressed(act));
      if (ctxShown[act] === on) continue;
      ctxShown[act] = on;
      const els = ctxEls[act];
      if (els) for (let k = 0; k < els.length; k++) els[k].classList.toggle('tcFora', !on);
    }
  }
  /* ---- C7: a barra de armas acompanha o arsenal ----
     Assinatura numérica (arma ativa + máscara de trancadas): comparar um
     número por frame, reescrever o DOM só quando o arsenal muda. */
  let armasSig = -1;
  function syncArmas() {
    if (!chips.length) return;
    let ativa;
    try { ativa = armaAtiva(); } catch (e) { ativa = -1; }
    if (typeof ativa !== 'number' || !Number.isInteger(ativa)) ativa = -1;
    let mask = 0;
    for (let i = 0; i < chips.length && i < 30; i++) if (arsenal[i] && arsenal[i].locked) mask |= 1 << i;
    const sig = mask * 64 + (ativa + 1);
    if (sig === armasSig) return;
    armasSig = sig;
    for (let i = 0; i < chips.length; i++) {
      const c = chips[i];
      const tranc = !!(arsenal[i] && arsenal[i].locked);
      c.el.classList.toggle('ativa', i === ativa);
      c.el.classList.toggle('tranc', tranc);
      c.el.setAttribute('aria-pressed', i === ativa ? 'true' : 'false');
      c.el.setAttribute('aria-disabled', tranc ? 'true' : 'false');
      c.rotulo.textContent = tranc ? '🔒' : c.nome;
    }
  }

  /* ---- O AVISO É O BOTÃO ----
     No celular a pessoa toca no que está ESCRITO no meio da tela ("USAR —
     ENTRAR — BUGGY", "USAR — ABRIR BAÚ"), não no botão do canto — e o aviso
     não respondia: #prompt mora em #hud (pointer-events: none, z 10, abaixo
     do #touchUI) e a dica do baú do BR (#brHint, z 45) também. Relato do dono:
     "os baús não estavam abrindo no celular e nem estavam conseguindo entrar e
     sair do carro". O #prompt passa a morar no #touchUI (acima da área de
     mira) e o #brHint sobe de camada SÓ quando é a dica do baú; os dois só
     aceitam o dedo enquanto ACESOS (classe `tocavel`), senão comeriam o
     arrasto de mira que começa em cima deles. O toque vira o MESMO `use` do
     botão USAR (KeyE, com keyup casado no pointerup). */
  let avisoPrompt = doc.getElementById('prompt'), avisoBR = null;
  if (avisoPrompt && root && avisoPrompt.parentNode !== root) root.appendChild(avisoPrompt);
  function avisoAceso(el) {
    if (!el) return false;
    if (el === avisoPrompt) return el.style.opacity === '1';
    return !!win.__BR_bauPerto && el.style.display !== 'none';
  }
  function syncAvisos() {
    if (!avisoBR) avisoBR = doc.getElementById('brHint');
    for (const el of [avisoPrompt, avisoBR]) if (el) el.classList.toggle('tocavel', live() && avisoAceso(el));
  }
  function onAvisoDown(e) {
    const el = e.currentTarget;
    if (!el.classList.contains('tocavel') || !live()) return;
    e.preventDefault();               // sem isto vem mousedown de compatibilidade
    if (!core.press('use', e.pointerId, e.clientX, e.clientY)) return;
    tipoDoPonteiro(e);
    capture(el, e.pointerId);
    pressAct('use');
    paint('use');
  }
  let avisoBRLigado = false;

  function frame(inVehicle) {
    syncMouse();
    syncBR();
    syncContexto();
    syncArmas();
    syncAvisos();
    if (avisoBR && !avisoBRLigado) { avisoBR.addEventListener('pointerdown', onAvisoDown); avisoBRLigado = true; }
    /* dirigindo, a trava de corrida sai: o analógico vira volante binário */
    core.setSprintLock(!inVehicle);
    const m = core.getMove();
    /* dirigindo/voando, playerUpdate nem roda (game.js:2530) — quem lê
       input é js/car.js / js/heli.js, e os dois só entendem `keys` */
    const on = !!inVehicle && m.active;
    const y = on ? m.py : 0, x = on ? m.px : 0;   // volante: a DEFLEXÃO do dedo
    setVeh('KeyW', hyst(veh.KeyW, y));
    setVeh('KeyS', hyst(veh.KeyS, -y));
    setVeh('KeyD', hyst(veh.KeyD, x));
    setVeh('KeyA', hyst(veh.KeyA, -x));
    if (moveEl) {
      moveEl.classList.toggle('on', m.active);
      moveEl.classList.toggle('trava', core.locked());
      moveEl.classList.toggle('perto', core.nearLock());
    }
    if (!knobEl) return;
    // dedo fora: a origem flutuante deixa de valer e a bolinha volta ao centro
    // desenhado (senão ela fica parada onde o último toque começou)
    if (!m.active) { knobOX = 0; knobOY = 0; }
    /* O CSS centra o knob por MARGEM NEGATIVA justamente pra deixar o
       `transform` inteiro pro JS (style.css:583). Uma escrita por frame e só
       quando o valor MUDA — mesmo motivo do styleOnce de game.js:1360. */
    const kx = Math.round(knobOX + m.px * knobSpan);   // o knob desenha o DEDO
    const ky = Math.round(knobOY - m.py * knobSpan);
    if (kx === knobX && ky === knobY) return;
    knobX = kx; knobY = ky;
    knobEl.style.transform = `translate3d(${kx}px,${ky}px,0)`;
  }

  function setPlaying(on) {
    const playing = !!on;
    html.classList.toggle('playing', playing);
    // sem o CSS do HUD, a visibilidade é do andaime (ver buildFallback)
    if (api.fallback) root.style.display = playing ? 'block' : 'none';
    if (!playing) releaseAll();
    else syncBR();   // entrar em partida BR já nasce com o botão de chat na tela
  }

  /* ---- MOUSE DE COMPATIBILIDADE (critério C5) ----
     Depois de um toque cujo `pointerdown` não foi cancelado, o navegador do
     celular despacha pointerdown → pointerup → mousedown → mouseup → click.
     Os controles cancelam o deles (preventDefault em onBtnDown/onMoveDown/
     onLookDown), mas 47 % da tela em partida é canvas NU, e o `mousedown` de
     game.js escuta a janela sem olhar a origem: 12 toques no vazio davam 2
     tiros de DMR (arma semi lê `mouse.clicked`, que ficava armado).
     Duas marcas, porque nenhuma é universal: `sourceCapabilities.
     firesTouchEvents` (Chrome) e o relógio do último toque (Safari não tem
     InputDeviceCapabilities). CAPTURA na janela roda antes de qualquer outro
     ouvinte. Campo, botão e menu continuam recebendo o mousedown — só o
     gatilho do jogo deixa de ouvir o toque que não era gatilho. */
  const COMPAT_MS = 1000;
  const agora = () => (win.performance && win.performance.now ? win.performance.now() : Date.now());
  let ultimoToque = -Infinity;
  function marcarToque(e) { if (e.pointerType === 'touch') ultimoToque = agora(); }
  function engolirCompat(e) {
    const caps = e.sourceCapabilities;
    if (!(caps && caps.firesTouchEvents) && agora() - ultimoToque > COMPAT_MS) return;
    const alvo = e.target;
    if (alvo && alvo.closest &&
        alvo.closest('input, textarea, select, button, a, [role="button"], #overlay, #settings, #mpPanel')) return;
    e.stopImmediatePropagation();
  }
  win.addEventListener('pointerdown', marcarToque, true);
  win.addEventListener('pointerup', marcarToque, true);
  win.addEventListener('mousedown', engolirCompat, true);

  if (btnsEl) btnsEl.addEventListener('pointerdown', onBtnDown);
  if (avisoPrompt) avisoPrompt.addEventListener('pointerdown', onAvisoDown);
  if (btnsLEl) btnsLEl.addEventListener('pointerdown', onBtnDown);
  if (moveEl) moveEl.addEventListener('pointerdown', onMoveDown);
  if (lookEl) lookEl.addEventListener('pointerdown', onLookDown);
  if (armasEl && chips.length) armasEl.addEventListener('pointerdown', onArmaDown);
  win.addEventListener('pointermove', onPointerMove);
  win.addEventListener('pointerup', onPointerUp);
  win.addEventListener('pointercancel', onPointerCancel);
  win.addEventListener('lostpointercapture', onPointerUp);
  win.addEventListener('blur', releaseAll);
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) releaseAll(); });

  /* ---- MENU: seção "Controles de toque" (index.html, só aparece com
     html.mobile). Cada linha grava em SETTINGS e vale NA HORA; persistir é
     melhor esforço (saveTouchSetting engole o erro de localStorage). O
     slider anda em % (inteiros), o ajuste guarda a fração. ---- */
  const LINHAS = [
    ['setTLook', 'touchLook', 100], ['setTRatio', 'touchRatioY', 100],
    ['setTAds', 'touchAds', 100], ['setTFire', 'touchFireLook', 100],
    ['setTAccel', 'touchLookAccel', 100], ['setTStick', 'touchStick', 100],
    ['setTAssist', 'touchAssist', 1], ['setTAuto', 'touchAutoFire', 1],
    ['setTFireL', 'touchFireLeft', 1],
  ];
  const CAMPO = { touchLook: 'look', touchRatioY: 'ratioY', touchAds: 'ads', touchFireLook: 'fireLook',
    touchLookAccel: 'accel', touchStick: 'stick',
    touchAssist: 'assist', touchAutoFire: 'autoFire', touchFireLeft: 'fireLeft' };
  /* O OLHAR EM UNIDADE QUE O DEDO ENTENDE. "100 %" não diz nada; a régua
     (M3a) pede que o giro medido bata com o que o MENU mostra. Quanto gira
     um arrasto de MEIA LARGURA da tela — a área de mira em paisagem — sai
     exato em qualquer aparelho (px de CSS × rad/px), sem supor densidade.
     No S22 do dono (780 px de CSS) é 72° a 100 %. */
  function grausMeiaTela(v) {
    const w = (win.innerWidth || 0) / 2;
    return Math.round(w * LOOK_RAD_PER_CSS_PX * v * 180 / Math.PI);
  }
  function mostrar(el, key, mul) {
    const v = cfg[CAMPO[key]];
    el.value = String(typeof v === 'boolean' ? (v ? 1 : 0) : Math.round(v * mul));
    const saida = doc.getElementById(el.id + 'V');
    if (!saida) return;
    if (mul !== 100) { saida.textContent = ''; return; }
    const pct = `${Math.round(v * 100)}%`;
    saida.textContent = key === 'touchLook' ? `${pct} · meia tela ${grausMeiaTela(v)}°` : pct;
  }
  function aplicarCfg() {
    cfg = touchConfig(settings);
    core.setFireLook(cfg.fireLook);
    core.setLookAccel(cfg.accel);
    core.setRadius(STICK_RADIUS * cfg.stick);
    html.classList.toggle('fireL', cfg.fireLeft);
    if (!cfg.fireLeft) letGo('fireL');   // desligou com o dedo em cima: solta casado
    if (!cfg.autoFire) autoFire = false;
  }
  function bindSettings(persist) {
    for (const [id, key, mul] of LINHAS) {
      const el = doc.getElementById(id);
      if (!el) continue;
      mostrar(el, key, mul);
      const ev = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        const v = Number(el.value) / mul;
        saveTouchSetting(settings, key, Number.isFinite(v) ? v : TOUCH_DEFAULTS[key], persist);
        aplicarCfg();
        mostrar(el, key, mul);
      });
    }
    /* C9: "restaurar padrão" da seção de toque (CoD Mobile e WZM têm; aqui
       era slider por slider, de memória). Vale na hora, repinta os
       controles e persiste por melhor esforço (restaurarToque engole a cota). */
    const reset = doc.getElementById('setTReset');
    if (reset) {
      reset.addEventListener('click', () => {
        restaurarToque(settings, persist);
        aplicarCfg();
        for (const [id, key, mul] of LINHAS) {
          const el = doc.getElementById(id);
          if (el) mostrar(el, key, mul);
        }
      });
    }
  }

  syncArmas();   // a barra nasce certa, antes do primeiro frame

  return api;
}

/* ================================================================
   AVISO DE ORIENTAÇÃO (#rotateGate) — E A SAÍDA DE EMERGÊNCIA

   O caminho comum continua CSS-first: `@media (orientation: portrait)`
   mostra o aviso, o jogador gira o aparelho e acabou. Nada aqui depende
   de evento pra esse caso.

   O que o CSS sozinho NÃO resolve, e por isso este módulo existe:

   1. BLOQUEIO DE ROTAÇÃO DO SISTEMA ligado em retrato (padrão de muita
      gente). O jogador deita o aparelho obedecendo o aviso, o SO mantém
      retrato, a media query continua casando e o aviso nunca sai. Sem
      botão, sem dica, sem escape: 0% do jogo acessível com uma
      instrução impossível de cumprir.
   2. JANELA ESTREITA. `orientation` é medida pelo VIEWPORT, não pelo
      aparelho: um iPad DEITADO na coluna estreita do Split View
      (375x1024) cai em retrato. Girar não resolve — só arrastar o
      divisor. Não existe API confiável pra detectar isso, então o texto
      do aviso passa a citar as três causas em vez de afirmar uma.
   3. GIRAR EM PARTIDA não pausava nada. O aviso cobre tudo (z 400,
      pointer-events auto, acima do #touchUI e do #overlay) e o jogo
      seguia rodando por baixo: alvo parado que não anda, não atira e
      não alcança nem o botão de pausa.

   O desenho:
   · tenta `screen.orientation.lock('landscape')`. Ela exige fullscreen
     na maioria dos navegadores, então o pedido de fullscreen sai do
     GESTO do jogador (botão de começar / botão do aviso). Promessa
     rejeitada é caso NORMAL, não erro: iOS Safari não implementa
     `orientation.lock` e rejeita sempre.
   · se não travou e o viewport continua em retrato, o aviso revela
     "JOGAR ASSIM" (`html.rgstuck`), que libera o jogo em retrato
     marcando `html.portraitok` — e a classe VENCE a media query
     (`html.mobile:not(.portraitok) #rotateGate`).
   · entrar em retrato bloqueado avisa `onBlock()`; game.js pausa. Sair
     do retrato NÃO retoma sozinho: quem retoma é o jogador tocando a
     tela, o mesmo fluxo do ESC no desktop.
   ================================================================ */
export function createOrientationGate(deps) {
  const d = deps && typeof deps === 'object' ? deps : {};
  const win = d.win || (typeof window !== 'undefined' ? window : null);
  const doc = d.doc || (win && win.document) || null;
  const onBlock = typeof d.onBlock === 'function' ? d.onBlock : () => {};
  const enabled = !!d.isMobile && !!win && !!doc && !!doc.documentElement;

  /* DESLIGADO (desktop): mesma forma, zero listener, zero classe. `blocking()`
     false é o que mantém o setPaused do desktop byte-idêntico. */
  if (!enabled) {
    return {
      enabled: false,
      portrait: () => false,
      blocking: () => false,
      allowPortrait: () => false,
      revokePortrait: () => false,
      attempt: () => Promise.resolve(false),
    };
  }

  const html = doc.documentElement;
  /* matchMedia é o sinal bom (dispara sozinho); innerWidth/innerHeight é a
     rede pra navegador antigo ou implementação que explode. */
  let mq = null;
  try {
    if (typeof win.matchMedia === 'function') mq = win.matchMedia('(orientation: portrait)');
  } catch (e) { mq = null; }

  let allowed = false;    // o jogador escolheu jogar em retrato
  let offered = false;    // o botão de escape já foi revelado
  let blocked = false;    // último estado observado (dispara só na transição)

  const portrait = () => (mq ? !!mq.matches
    : (win.innerHeight || 0) > (win.innerWidth || 0));
  const blocking = () => portrait() && !allowed;

  function allowPortrait() {
    if (allowed) return false;
    allowed = true;
    blocked = false;
    html.classList.add('portraitok');
    return true;
  }
  /* o aparelho voltou a poder girar (travou em paisagem de verdade, ou QA
     recolocando o cenário): o aviso volta a ficar armado */
  function revokePortrait() {
    if (!allowed) return false;
    allowed = false;
    blocked = false;
    html.classList.remove('portraitok');
    return true;
  }
  function offer() {
    if (offered) return;
    offered = true;
    html.classList.add('rgstuck');
  }

  /* `withFullscreen` só faz sentido dentro de um gesto do jogador — fora
     dele o navegador recusa o fullscreen e, sem fullscreen, recusa o lock. */
  async function attempt(withFullscreen) {
    try {
      if (withFullscreen && !doc.fullscreenElement &&
          typeof html.requestFullscreen === 'function') {
        await html.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch (e) { /* recusado: ainda vale tentar o lock sozinho */ }
    let ok = false;
    try {
      const so = win.screen && win.screen.orientation;
      if (so && typeof so.lock === 'function') { await so.lock('landscape'); ok = true; }
    } catch (e) { /* iOS Safari não implementa: caso NORMAL, não erro */ }
    if (!ok && portrait()) offer();
    return ok;
  }

  function check() {
    const now = blocking();
    if (now === blocked) return;
    blocked = now;
    if (!now) return;
    onBlock();
    /* sem gesto aqui: o pedido vai falhar na maioria dos navegadores, e é
       justamente a falha que revela o botão de escape */
    attempt(false);
  }

  const btn = doc.getElementById(GATE_IDS.play);
  if (btn) {
    btn.addEventListener('click', () => {
      /* SÍNCRONO PRIMEIRO. O escape do jogador não pode depender de promessa
         nenhuma — uma que nunca resolva o prenderia fora do jogo, que é
         exatamente o defeito que este botão conserta. Se o travamento der
         certo DEPOIS (e a tela realmente virar), devolvemos o aviso ao
         estado armado: em paisagem ele não aparece mesmo. */
      allowPortrait();
      attempt(true).then(ok => { if (ok && !portrait()) revokePortrait(); });
    });
  }

  /* três fontes porque nenhuma é confiável sozinha: nem todo navegador
     dispara `orientationchange`, e `resize` sozinho perde a virada em
     alguns Android. `mq` é o sinal certo quando existe. */
  if (mq) {
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', check);
    else if (typeof mq.addListener === 'function') mq.addListener(check);  // Safari < 14
  }
  win.addEventListener('orientationchange', check);
  win.addEventListener('resize', check);
  check();   // já nascer em retrato conta como transição

  return { enabled: true, portrait, blocking, allowPortrait, revokePortrait, attempt };
}
