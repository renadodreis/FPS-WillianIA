/* ================================================================
   REMAPEAMENTO DE TECLAS — módulo PURO (sem DOM, sem three).

   Por que existe: o painel CONTROLES do menu era uma legenda
   SOMENTE-LEITURA — W/A/S/D, SHIFT, ESPAÇO... impressos em HTML fixo,
   sem um único listener. Um jogo que se pretende AAA precisa deixar o
   jogador trocar a tecla.

   A lógica recebe TODO o ambiente por parâmetro (mesmo padrão de
   js/mobile.js e js/gputier.js: quem lê `localStorage`/DOM de verdade é
   a camada fina que CHAMA este módulo, nunca o módulo em si). Isto é o
   que torna o núcleo testável sem navegador — ver test/controles-keybinds.test.js.

   ================================================================
   POR QUE O JOGO NEM PRECISA SER EDITADO PRA ISTO VALER

   game.js lê teclado assim (game.js:1326-1333):

     window.addEventListener('keydown', e => { keys[e.code] = true; ... });

   Ou seja: o jogo inteiro (game.js, br-game.js, js/car.js, js/heli.js,
   js/interact.js...) lê `keys` e `justPressed` indexados pelo CÓDIGO
   FÍSICO PADRÃO ('KeyW', 'Space', 'ControlLeft'...). Remapear de verdade
   sem tocar em nenhum desses arquivos exige interceptar o evento de
   teclado ANTES desses listeners rodarem, e:

     1. Quando a tecla física atual de uma ação NÃO é mais o código
        padrão dela (o jogador remapeou), REESCREVER `e.code` pro
        código CANÔNICO da ação antes do evento chegar em game.js —
        `resolveIncomingCode()` devolve `{ rewritten: true, code }`.
     2. Quando a tecla física É o código padrão de uma ação, mas essa
        ação foi remapeada pra OUTRO lugar, a tecla antiga virou uma
        porta dos fundos — `resolveIncomingCode()` devolve
        `{ suppress: true }`, e quem chama torna a tecla INERTE renomeando
        o código (nunca matando o evento: ver o docbloco de
        `resolveIncomingCode`).

   Um listener em fase de CAPTURA no `window` roda ANTES de qualquer
   listener em fase de bolha no MESMO `window` — é a ordem de despacho
   do DOM, não a ordem de registro do `<script>` — então isto funciona
   não importa se o script que instala o listener roda antes ou depois
   de game.js no HTML. A camada fina que faz essa instalação mora em
   index.html (dono deste agente), não aqui: este arquivo só devolve a
   DECISÃO (reescrever/suprimir/passar), nunca mexe em `addEventListener`.
   ================================================================ */

/* chave própria — NÃO reaproveitar `callofai_cfg` (configurações de
   vídeo/áudio, outro dono, outro formato). */
export const STORAGE_KEY = 'callofai_keys';

/* Catálogo das ações remapeáveis. Espelha os grupos e rótulos que já
   existiam na legenda somente-leitura de index.html (Movimento/Combate/
   Interação), pra quem já conhece o painel não estranhar nada.

   FORA daqui de propósito (ver README do relatório final):
     · "Atirar / mirar" (botão do MOUSE) — o pedido foi remapeamento de
       TECLAS ("aperta a tecla nova"); botão de mouse é outro contrato.
     · "Trocar de arma" (1–5 / scroll) — são 5 códigos (Digit1..Digit5)
       mais scroll, com semântica de ORDEM (slot 1, slot 2...) que o
       BR ainda estende até Digit8/faca/sniper/escopeta em br-game.js.
       Remapear dígito por dígito é escopo de outra rodada.
     · ESC (pausa) — no BR ela nem passa por `keys`: é o `unlock` nativo
       do Pointer Lock. Não dá pra remapear e também é a tecla universal
       de CANCELAR a captura de uma nova tecla (ver a camada fina).

   `aliases`: códigos que o jogo já aceita como sinônimo do padrão
   (game.js:1555-1556 faz `keys.ShiftLeft || keys.ShiftRight`, mesma
   coisa pra Control). Um alias PADRÃO só é órfão (suprimido) quando a
   ação sai do cluster {code, ...aliases} inteiro — ver resolveIncomingCode. */
export const ACTIONS = Object.freeze([
  { id: 'moveForward', group: 'Movimento', label: 'Mover para a frente', code: 'KeyW' },
  { id: 'moveLeft', group: 'Movimento', label: 'Mover para a esquerda', code: 'KeyA' },
  { id: 'moveBack', group: 'Movimento', label: 'Mover para trás', code: 'KeyS' },
  { id: 'moveRight', group: 'Movimento', label: 'Mover para a direita', code: 'KeyD' },
  { id: 'sprint', group: 'Movimento', label: 'Correr', code: 'ShiftLeft', aliases: ['ShiftRight'] },
  { id: 'jump', group: 'Movimento', label: 'Pular', code: 'Space' },
  { id: 'crouch', group: 'Movimento', label: 'Agachar / deslizar', code: 'ControlLeft', aliases: ['ControlRight'] },
  { id: 'reload', group: 'Combate', label: 'Recarregar', code: 'KeyR' },
  { id: 'grenade', group: 'Combate', label: 'Granada', code: 'KeyG' },
  { id: 'sight', group: 'Combate', label: 'Acessório da mira', code: 'KeyT' },
  { id: 'use', group: 'Interação', label: 'Veículo / baú', code: 'KeyE' },
  { id: 'medkit', group: 'Interação', label: 'Kit médico', code: 'KeyQ' },
  { id: 'eat', group: 'Interação', label: 'Comer carne', code: 'KeyF' },
  { id: 'inventory', group: 'Interação', label: 'Inventário', code: 'Tab' },
]);

/* Teclas que nunca podem virar binding de uma ação:
     Escape    — cancela a captura de "esperando tecla" e é a saída de
                 pausa (fora do sistema `keys`, ver o cabeçalho acima).
     Meta*     — a tecla Windows/Cmd: o SISTEMA OPERACIONAL intercepta
                 antes do navegador na maioria das combinações; um
                 preventDefault daqui não segura o menu Iniciar/Spotlight
                 abrindo no meio do tiroteio. */
const RESERVED = new Set(['Escape', 'MetaLeft', 'MetaRight']);

/* Mesmo conjunto que game.js:1329 já protegia (Space rola a página,
   ControlLeft não faz nada sozinho mas soma na barra, Tab troca o foco
   e tira o teclado do jogo). Exportado porque quem instala o listener
   real (index.html) precisa chamar `e.preventDefault()` — aqui é só o
   dado, o `.preventDefault()` em si é DOM e não mora neste módulo. */
export const PREVENT_DEFAULT_CODES = Object.freeze(['Space', 'ControlLeft', 'ControlRight', 'Tab']);

const ACTION_IDS = new Set(ACTIONS.map(a => a.id));
const DEFAULT_BINDINGS = Object.freeze(ACTIONS.reduce((m, a) => { m[a.id] = a.code; return m; }, {}));
/* code -> actionId cobrindo o código PADRÃO e todo alias, de TODAS as
   ações. Estático (ACTIONS é fixo): computado uma vez. */
const DEFAULT_CLUSTER_INDEX = Object.freeze(ACTIONS.reduce((idx, a) => {
  idx[a.code] = a.id;
  for (const alt of a.aliases || []) idx[alt] = a.id;
  return idx;
}, {}));

export function isKnownAction(id) { return typeof id === 'string' && ACTION_IDS.has(id); }
export function isReservedCode(code) { return typeof code === 'string' && RESERVED.has(code); }

/* cópia nova a cada chamada — quem recebe pode mutar sem vazar pro módulo */
export function defaultBindings() { return { ...DEFAULT_BINDINGS }; }

/* Núcleo defensivo: aceita QUALQUER lixo (localStorage corrompido, JSON
   de outra versão, campos ausentes/errados) sem lançar — uma exceção
   aqui mataria o boot do menu inteiro (mesma filosofia de js/mobile.js).
   Devolve SEMPRE um mapa completo (uma entrada por ACTIONS) com valores
   string válidos e sem duas ações na mesma tecla. */
export function normalizeBindings(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const used = new Set();
  const out = {};
  for (const a of ACTIONS) {
    const cand = src[a.id];
    const validCand = typeof cand === 'string' && cand.length > 0 && !isReservedCode(cand) && !used.has(cand);
    let code = validCand ? cand : a.code;
    /* o padrão da própria ação também já está em uso (mapa de origem
       malformado à mão) — aceita a colisão em vez de lançar; é uma
       situação que só um localStorage editado manualmente produz, e o
       jogador resolve na hora reabrindo o remapeamento. */
    if (used.has(code)) code = a.code;
    out[a.id] = code;
    used.add(code);
  }
  return out;
}

/* `storage`: qualquer objeto com getItem (localStorage-like). Nunca lança. */
export function loadBindings(storage) {
  const s = storage && typeof storage.getItem === 'function' ? storage : null;
  let raw = null;
  if (s) {
    try {
      const txt = s.getItem(STORAGE_KEY);
      if (txt) raw = JSON.parse(txt);
    } catch { raw = null; }
  }
  return normalizeBindings(raw);
}

/* devolve true/false em vez de lançar — quota cheia ou modo privado não
   pode derrubar o menu por causa de uma troca de tecla */
export function saveBindings(storage, bindings) {
  const s = storage && typeof storage.setItem === 'function' ? storage : null;
  if (!s) return false;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(normalizeBindings(bindings)));
    return true;
  } catch { return false; }
}

/* remove o override salvo (não grava o padrão por cima — "sem
   configuração salva" é o estado mais simples de auditar depois) e
   devolve o mapa padrão pronto pra pintar na UI */
export function resetBindings(storage) {
  const s = storage && typeof storage.removeItem === 'function' ? storage : null;
  if (s) { try { s.removeItem(STORAGE_KEY); } catch { /* ok */ } }
  return defaultBindings();
}

/* code -> actionId a partir dos bindings ATUAIS (não dos padrões) */
export function codeToActionMap(bindings) {
  const b = normalizeBindings(bindings);
  const out = {};
  for (const id of Object.keys(b)) out[b[id]] = id;
  return out;
}

/* ================================================================
   REBIND — o único jeito de mudar uma tecla. CONFLITO NUNCA É SILENCIOSO:
   se a tecla nova já pertence a outra ação, as duas TROCAM de lugar
   (swap) — nunca sobra duas ações na mesma tecla. Quem chama recebe
   `swappedWith` pra avisar o jogador (a UI decide o texto). ================================================================ */
export function rebind(bindings, actionId, newCode) {
  const b = normalizeBindings(bindings);
  if (!isKnownAction(actionId)) return { ok: false, reason: 'unknown-action', bindings: b, swappedWith: null, changed: false };
  if (typeof newCode !== 'string' || !newCode) return { ok: false, reason: 'invalid-code', bindings: b, swappedWith: null, changed: false };
  if (isReservedCode(newCode)) return { ok: false, reason: 'reserved', bindings: b, swappedWith: null, changed: false };
  if (b[actionId] === newCode) return { ok: true, reason: null, bindings: b, swappedWith: null, changed: false };

  const otherId = Object.keys(b).find(id => id !== actionId && b[id] === newCode) || null;
  const next = { ...b };
  const oldCode = b[actionId];
  next[actionId] = newCode;
  if (otherId) next[otherId] = oldCode; // swap: a outra ação herda a tecla antiga
  return { ok: true, reason: null, bindings: next, swappedWith: otherId, changed: true };
}

/* ================================================================
   resolveIncomingCode — A TRADUÇÃO que faz o remapeamento valer.

   Dado o código FÍSICO que acabou de ser pressionado e os bindings
   atuais, devolve o que fazer:
     · { suppress:true }               → tecla órfã: quem chama torna a
                                          tecla INERTE pro jogo renomeando
                                          o código (ex.: `Orfa_<código>`).
                                          NUNCA matando o evento: este
                                          módulo é consumido por um
                                          listener em CAPTURA no `window`,
                                          e `stopImmediatePropagation` ali
                                          apaga a tecla pra página inteira
                                          — quebrou a navegação por teclado
                                          do menu e da tela de morte.
     · { rewritten:true, code }        → tecla remapeada: quem chama
                                          reescreve `e.code` pro `code`
                                          devolvido ANTES do evento
                                          chegar em game.js.
     · nenhum dos dois (padrão)        → passa como está, byte a byte
                                          igual ao comportamento de
                                          antes do remapeamento existir.
   ================================================================ */
export function resolveIncomingCode(bindings, rawCode) {
  const code = typeof rawCode === 'string' ? rawCode : '';
  if (!code) return { code, suppress: false, rewritten: false, action: null };
  const b = normalizeBindings(bindings);

  // 1. a tecla é o binding ATUAL de alguma ação?
  for (const a of ACTIONS) {
    if (b[a.id] !== code) continue;
    if (a.code === code) return { code, suppress: false, rewritten: false, action: a.id }; // já é o canônico
    return { code: a.code, suppress: false, rewritten: true, action: a.id }; // remapeada: reescreve pro canônico
  }

  // 2. não é binding de ninguém agora — é um código PADRÃO (ou alias) órfão?
  const ownerId = DEFAULT_CLUSTER_INDEX[code];
  if (ownerId) {
    const owner = ACTIONS.find(a => a.id === ownerId);
    const cluster = [owner.code, ...(owner.aliases || [])];
    if (cluster.includes(b[ownerId])) return { code, suppress: false, rewritten: false, action: null }; // ainda no padrão: sinônimo inofensivo
    return { code, suppress: true, rewritten: false, action: ownerId }; // órfão: a ação já mora em outra tecla
  }

  // 3. tecla sem relação nenhuma com o jogo
  return { code, suppress: false, rewritten: false, action: null };
}

/* ================================================================
   RÓTULO LEGÍVEL — pro texto do botão. Cobre o vocabulário comum de um
   FPS (letras, dígitos, modificadores, setas, pontuação do teclado
   ANSI); o que sobra cai num fallback que nunca lança e nunca fica
   vazio (código cru, mais legível que nada). ================================================================ */
const CODE_LABELS = {
  Space: 'ESPAÇO', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT ⇒',
  ControlLeft: 'CTRL', ControlRight: 'CTRL ⇒', AltLeft: 'ALT', AltRight: 'ALT ⇒',
  Tab: 'TAB', Enter: 'ENTER', Escape: 'ESC', Backspace: '⌫', CapsLock: 'CAPS',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
  Insert: 'INS', Delete: 'DEL', Home: 'HOME', End: 'END', PageUp: 'PGUP', PageDown: 'PGDN',
};

export function describeCode(code) {
  if (typeof code !== 'string' || !code) return '—';
  if (CODE_LABELS[code]) return CODE_LABELS[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `NUM ${code.slice(6)}`;
  if (/^F([1-9]|1[0-9])$/.test(code)) return code; // F1..F19: o próprio code já é o rótulo
  return code; // desconhecido: mostra o código cru em vez de esconder a tecla
}
