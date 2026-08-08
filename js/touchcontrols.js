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
   ================================================================ */

/* data-act do contrato com o HUD (index.html).
   `eat`/`sight`/`chat` existem porque KeyF (comer carne), KeyT (trocar
   acessório de mira) e Enter (chat do BR) não tinham NENHUM caminho de
   toque: no celular a carne entrava no inventário e nunca saía — uma
   mecânica de cura inteira morta —, a arma ficava presa na mira padrão e
   o BR ficava mudo. */
export const TOUCH_ACTS = Object.freeze(['fire', 'ads', 'jump', 'crouch', 'reload',
  'nade', 'use', 'med', 'swap', 'inv', 'pause', 'eat', 'sight', 'chat']);

/* Raio útil do analógico em px de CSS. O analógico é FLUTUANTE: a origem
   é onde o dedo encostou, não o centro do desenho — polegar de celular
   não acerta o centro de um círculo de 130 px. */
export const STICK_RADIUS = 58;

/* Zona morta RADIAL (fração do raio). Por eixo deixaria a diagonal curta
   passar e o jogador andaria de esguelha só apoiando o dedo. */
export const STICK_DEADZONE = 0.12;

/* Correr no toque não tem botão: é o analógico no talo (mesma leitura de
   um gatilho analógico de controle). Acima disto liga o `sprintHeld`. */
export const SPRINT_MAG = 0.85;

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
  const rRaw = num(o.radius);
  const radius = rRaw > 0 ? rRaw : STICK_RADIUS;

  /* Um dedo, uma função. `owners` é pointerId -> 'stick' | 'look' | act. */
  const owners = new Map();
  const held = new Set();
  /* objetos FIXOS: o loop roda a 60 FPS num celular fraco e alocar por
     evento/frame no caminho quente paga GC exatamente no tiroteio */
  const move = { x: 0, y: 0, mag: 0, active: false };
  const look = { dx: 0, dy: 0 };     // acumulador
  const lookOut = { dx: 0, dy: 0 };  // devolvido por takeLook()
  let stickId = null, lookId = null;
  let lastLookX = 0, lastLookY = 0;

  function zeroMove() { move.x = 0; move.y = 0; move.mag = 0; }

  /* px relativos à origem do analógico (y cresce pra BAIXO, como na tela)
     -> x = strafe (direita +), y = frente (+ = W), mag = 0..1 */
  function setStick(px, py) {
    const dx = num(px), dy = num(py);
    const len = Math.hypot(dx, dy);
    if (len <= 0) { zeroMove(); return; }
    let m = len / radius;
    if (m > 1) m = 1;                       // fora do raio = talo, não mais
    if (m <= dz) { zeroMove(); return; }     // zona morta radial
    m = (m - dz) / (1 - dz);                 // remapeia: borda da zona = 0
    const k = m / len;                       // normaliza E aplica a magnitude
    move.x = dx * k;
    move.y = -dy * k;                        // tela pra cima = frente
    move.mag = m;
  }

  function onStickStart(id, x, y) {
    if (owners.has(id) || stickId !== null) return false;
    stickId = id;
    owners.set(id, 'stick');
    move.active = true;
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
    zeroMove();
    return true;
  }

  function onLookStart(id, x, y) {
    if (owners.has(id) || lookId !== null) return false;
    lookId = id;
    owners.set(id, 'look');
    lastLookX = num(x);
    lastLookY = num(y);   // encostar o dedo NÃO gira: delta parte daqui
    return true;
  }
  function onLookMove(id, x, y) {
    if (lookId === null || id !== lookId) return false;
    const nx = num(x), ny = num(y);
    look.dx += nx - lastLookX;
    look.dy += ny - lastLookY;
    lastLookX = nx;
    lastLookY = ny;
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

  function press(act, id) {
    if (!ACTS.has(act)) return false;
    if (owners.has(id)) return false;   // esse dedo já controla outra coisa
    if (held.has(act)) return false;    // botão já é de outro dedo
    held.add(act);
    owners.set(id, act);
    return true;
  }
  function release(act) {
    if (!ACTS.has(act) || !held.delete(act)) return false;
    for (const [id, role] of owners) if (role === act) { owners.delete(id); break; }
    return true;
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
    stickId = null;
    lookId = null;
    move.active = false;
    zeroMove();
    look.dx = 0;
    look.dy = 0;
  }

  return {
    onStickStart, onStickMove, onStickEnd,
    onLookStart, onLookMove, onLookEnd, takeLook,
    press, release, releasePointer, releaseAll,
    pressed: act => held.has(act),
    roleOf: id => { const r = owners.get(id); return r === undefined ? null : r; },
    getMove: () => move,
    lookActive: () => lookId !== null,
    stickActive: () => stickId !== null,
    radius, deadzone: dz,
  };
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

const IDS = { root: 'touchUI', move: 'tcMove', knob: 'tcMoveKnob', look: 'tcLook', btns: 'tcBtns' };
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
      setPlaying() {}, releaseAll() {}, frame() {},
      lookSens: LOOK_RAD_PER_CSS_PX,
    };
  }

  const api = {
    core, enabled, fallback: false, el: null,
    getMove: core.getMove,
    takeLook: core.takeLook,
    setPlaying, releaseAll, frame,
    lookSens: LOOK_RAD_PER_CSS_PX,
  };
  const html = doc.documentElement;
  html.classList.add('mobile');

  let root = doc.getElementById(IDS.root);
  if (!root) { root = buildFallback(doc); api.fallback = true; }
  const moveEl = doc.getElementById(IDS.move);
  const knobEl = doc.getElementById(IDS.knob);
  const lookEl = doc.getElementById(IDS.look);
  const btnsEl = doc.getElementById(IDS.btns);
  api.el = { root, move: moveEl, knob: knobEl, look: lookEl, btns: btnsEl };

  /* `touch-action:none` é FUNCIONAL, não enfeite: sem ele o navegador
     rola/dá zoom e cancela a sequência de pointermove no meio do arrasto. */
  for (const el of [moveEl, lookEl, btnsEl]) if (el) el.style.touchAction = 'none';

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
      case 'fire': mouse.shooting = true; mouse.clicked = true; return;
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
    if (act === 'fire') { mouse.shooting = false; return; }
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
    e.preventDefault();               // sem isto vem mousedown de compatibilidade
    if (act !== 'pause' && !live()) return;
    if (!core.press(act, e.pointerId)) return;
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
    capture(moveEl, e.pointerId);
  }

  /* ---- olhar ---- */
  function onLookDown(e) {
    if (!live()) return;
    e.preventDefault();
    if (!core.onLookStart(e.pointerId, e.clientX, e.clientY)) return;
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
    if (role === 'stick') core.onStickMove(e.pointerId, e.clientX - originX, e.clientY - originY);
    else if (role === 'look') core.onLookMove(e.pointerId, e.clientX, e.clientY);
  }
  function onPointerUp(e) {
    const role = core.roleOf(e.pointerId);
    if (role === null) return;
    if (role === 'stick' || role === 'look') core.releasePointer(e.pointerId);
    else letGo(role);
  }

  function releaseAll() {
    for (const act of TOUCH_ACTS) letGo(act);
    mouse.shooting = false;
    mouse.aiming = false;
    adsOn = false;
    for (const el of pressedEl.values()) el.classList.remove('on');
    pressedEl.clear();
    if (moveEl) moveEl.classList.remove('on');
    for (const code in veh) if (veh[code]) { veh[code] = false; sendKey('keyup', code); }
    core.releaseAll();
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
       botão só passa a refletir a verdade. */
  function syncMouse() {
    if (core.pressed('fire') && !mouse.shooting) mouse.shooting = true;
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

  function frame(inVehicle) {
    syncMouse();
    syncBR();
    const m = core.getMove();
    /* dirigindo/voando, playerUpdate nem roda (game.js:2530) — quem lê
       input é js/car.js / js/heli.js, e os dois só entendem `keys` */
    const on = !!inVehicle && m.active;
    const y = on ? m.y : 0, x = on ? m.x : 0;
    setVeh('KeyW', hyst(veh.KeyW, y));
    setVeh('KeyS', hyst(veh.KeyS, -y));
    setVeh('KeyD', hyst(veh.KeyD, x));
    setVeh('KeyA', hyst(veh.KeyA, -x));
    if (moveEl) moveEl.classList.toggle('on', m.active);
    if (!knobEl) return;
    // dedo fora: a origem flutuante deixa de valer e a bolinha volta ao centro
    // desenhado (senão ela fica parada onde o último toque começou)
    if (!m.active) { knobOX = 0; knobOY = 0; }
    /* O CSS centra o knob por MARGEM NEGATIVA justamente pra deixar o
       `transform` inteiro pro JS (style.css:583). Uma escrita por frame e só
       quando o valor MUDA — mesmo motivo do styleOnce de game.js:1360. */
    const kx = Math.round(knobOX + m.x * knobSpan);
    const ky = Math.round(knobOY - m.y * knobSpan);
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

  if (btnsEl) btnsEl.addEventListener('pointerdown', onBtnDown);
  if (moveEl) moveEl.addEventListener('pointerdown', onMoveDown);
  if (lookEl) lookEl.addEventListener('pointerdown', onLookDown);
  win.addEventListener('pointermove', onPointerMove);
  win.addEventListener('pointerup', onPointerUp);
  win.addEventListener('pointercancel', onPointerUp);
  win.addEventListener('lostpointercapture', onPointerUp);
  win.addEventListener('blur', releaseAll);
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) releaseAll(); });

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
