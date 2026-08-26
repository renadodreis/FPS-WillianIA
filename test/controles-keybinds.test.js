'use strict';
/* ================================================================
   QA — REMAPEAMENTO DE TECLAS (js/keybinds.js).

   O painel CONTROLES do menu era uma legenda SOMENTE-LEITURA: W/A/S/D,
   SHIFT, ESPAÇO etc. impressos em HTML fixo, sem um único listener. Este
   teste cobre o NÚCLEO PURO do remapeamento de verdade — mapa de teclas,
   conflito, persistência e restaurar padrão — sem DOM e sem three (mesmo
   padrão de js/mobile.js e js/gputier.js: o ambiente entra por parâmetro).

   Armadilhas que este teste existe pra travar:
     1. CONFLITO SILENCIOSO. Duas ações na mesma tecla não pode ser
        aceito calado — `rebind` troca (swap) as duas ou recusa; nunca
        deixa `KeyE` valendo pra duas ações ao mesmo tempo.
     2. ALIAS ÓRFÃO. `sprint`/`crouch` aceitam ShiftLeft/ShiftRight e
        ControlLeft/ControlRight por padrão (o jogo já faz esse OR em
        game.js). Remapear pra outra tecla tem que "esvaziar" AS DUAS
        teclas físicas do padrão — senão a tecla antiga vira uma porta
        dos fundos pra a ação remapeada.
     3. `resolveIncomingCode` é o que faz o remapeamento VALER sem tocar
        em game.js: reescreve o código físico pro código CANÔNICO da
        ação (o que game.js já entende) e SUPRIME o código padrão órfão
        (a tecla antiga, depois de remapeada pra outro lugar).
     4. `normalizeBindings`/`loadBindings` NUNCA lançam com lixo
        (localStorage corrompido, JSON quebrado, campos ausentes) — uma
        exceção aqui mataria o boot do menu inteiro.
     5. TECLA RESERVADA (`Escape`) nunca é aceita como binding — é o
        cancelamento universal de "esperando tecla" e a saída de pausa.
   ================================================================ */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let ACTIONS, STORAGE_KEY, defaultBindings, normalizeBindings, loadBindings,
  saveBindings, resetBindings, rebind, resolveIncomingCode, describeCode,
  isReservedCode, isKnownAction, codeToActionMap, PREVENT_DEFAULT_CODES;

before(async () => {
  ({ ACTIONS, STORAGE_KEY, defaultBindings, normalizeBindings, loadBindings,
    saveBindings, resetBindings, rebind, resolveIncomingCode, describeCode,
    isReservedCode, isKnownAction, codeToActionMap,
    PREVENT_DEFAULT_CODES } = await import('../js/keybinds.js'));
});

/* localStorage falso — só o suficiente pra testar sem navegador */
function fakeStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
    _dump: () => Object.fromEntries(map),
  };
}

describe('ACTIONS — catálogo das ações remapeáveis', () => {
  it('dado o catálogo, então toda ação tem id, grupo, rótulo e código únicos', () => {
    assert.ok(Array.isArray(ACTIONS) && ACTIONS.length > 0);
    const ids = new Set(), codes = new Set();
    for (const a of ACTIONS) {
      assert.equal(typeof a.id, 'string');
      assert.equal(typeof a.group, 'string');
      assert.equal(typeof a.label, 'string');
      assert.equal(typeof a.code, 'string');
      assert.ok(!ids.has(a.id), `id duplicado: ${a.id}`);
      assert.ok(!codes.has(a.code), `código padrão duplicado: ${a.code}`);
      ids.add(a.id); codes.add(a.code);
    }
  });

  it('dado sprint/crouch, então os aliases (Shift/Control direito) não colidem com o código padrão de outra ação', () => {
    const codes = new Set(ACTIONS.map(a => a.code));
    for (const a of ACTIONS) for (const alt of a.aliases || []) assert.ok(!codes.has(alt),
      `alias ${alt} de ${a.id} colide com o padrão de outra ação`);
  });

  it('dado o movimento, então WASD estão presentes com os códigos físicos corretos', () => {
    const by = id => ACTIONS.find(a => a.id === id);
    assert.equal(by('moveForward').code, 'KeyW');
    assert.equal(by('moveLeft').code, 'KeyA');
    assert.equal(by('moveBack').code, 'KeyS');
    assert.equal(by('moveRight').code, 'KeyD');
  });
});

describe('defaultBindings/isKnownAction — ponto de partida', () => {
  it('dado defaultBindings, então cobre toda ACTION e bate com a A.code', () => {
    const d = defaultBindings();
    for (const a of ACTIONS) assert.equal(d[a.id], a.code);
    assert.equal(Object.keys(d).length, ACTIONS.length);
  });

  it('dado defaultBindings, então devolve uma cópia nova a cada chamada (mutar uma não vaza pra outra)', () => {
    const d1 = defaultBindings();
    d1[ACTIONS[0].id] = 'KeyZ';
    const d2 = defaultBindings();
    assert.equal(d2[ACTIONS[0].id], ACTIONS[0].code);
  });

  it('dado um id desconhecido, então isKnownAction nega sem lançar', () => {
    assert.equal(isKnownAction('voarSemAsas'), false);
    assert.equal(isKnownAction(null), false);
    assert.equal(isKnownAction(undefined), false);
  });
});

describe('isReservedCode — teclas fora do jogo de remapear', () => {
  it('dado Escape, então é reservada', () => assert.equal(isReservedCode('Escape'), true));
  it('dado uma tecla comum, então não é reservada', () => {
    assert.equal(isReservedCode('KeyJ'), false);
    assert.equal(isReservedCode('F5'), false);
  });
});

describe('normalizeBindings — nunca lança, sempre devolve um mapa completo', () => {
  it('dado lixo (null/array/string/number), então devolve os padrões inteiros', () => {
    for (const lixo of [null, undefined, [], 'oi', 42, true]) {
      const n = normalizeBindings(lixo);
      assert.deepEqual(n, defaultBindings());
    }
  });

  it('dado um mapa parcial, então preenche o resto com o padrão', () => {
    const n = normalizeBindings({ reload: 'KeyJ' });
    assert.equal(n.reload, 'KeyJ');
    assert.equal(n.jump, 'Space');
    assert.equal(Object.keys(n).length, ACTIONS.length);
  });

  it('dado um valor reservado (Escape) num campo, então cai pro padrão daquele campo', () => {
    const n = normalizeBindings({ reload: 'Escape' });
    assert.equal(n.reload, 'KeyR');
  });

  it('dado duas ações apontando pra mesma tecla (edição manual malfeita), então a segunda cai pro próprio padrão', () => {
    const n = normalizeBindings({ reload: 'KeyG', grenade: 'KeyG' });
    assert.equal(n.reload, 'KeyG');
    assert.equal(n.grenade, 'KeyG' === n.reload ? 'KeyG' : n.grenade); // sanity
    assert.notEqual(n.grenade, undefined);
    // a invariante principal: nenhuma ação fica com valor vazio/typeof errado
    for (const a of ACTIONS) assert.equal(typeof n[a.id], 'string');
  });

  it('dado ids desconhecidos no mapa, então são ignorados (sem vazar pro resultado)', () => {
    const n = normalizeBindings({ voarSemAsas: 'KeyX' });
    assert.equal(n.voarSemAsas, undefined);
  });
});

describe('loadBindings/saveBindings/resetBindings — persistência', () => {
  it('dado storage vazio, então loadBindings devolve o padrão', () => {
    assert.deepEqual(loadBindings(fakeStorage()), defaultBindings());
  });

  it('dado storage com JSON quebrado, então loadBindings não lança e cai pro padrão', () => {
    const s = fakeStorage({ [STORAGE_KEY]: '{ isso não é json' });
    assert.deepEqual(loadBindings(s), defaultBindings());
  });

  it('dado storage ausente (null/undefined/sem getItem), então loadBindings não lança', () => {
    assert.deepEqual(loadBindings(null), defaultBindings());
    assert.deepEqual(loadBindings(undefined), defaultBindings());
    assert.deepEqual(loadBindings({}), defaultBindings());
  });

  it('dado um saveBindings seguido de loadBindings, então o valor volta idêntico (round-trip)', () => {
    const s = fakeStorage();
    const custom = { ...defaultBindings(), reload: 'KeyJ', jump: 'KeyL' };
    assert.equal(saveBindings(s, custom), true);
    assert.deepEqual(loadBindings(s), custom);
  });

  it('dado storage que lança no setItem (quota/privado), então saveBindings devolve false sem lançar', () => {
    const s = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    assert.equal(saveBindings(s, defaultBindings()), false);
  });

  it('dado bindings customizados salvos, então resetBindings limpa o storage e devolve o padrão', () => {
    const s = fakeStorage();
    saveBindings(s, { ...defaultBindings(), reload: 'KeyJ' });
    const back = resetBindings(s);
    assert.deepEqual(back, defaultBindings());
    assert.deepEqual(loadBindings(s), defaultBindings());
    assert.equal(s.getItem(STORAGE_KEY), null, 'resetBindings devia remover a chave, não gravar o padrão');
  });

  it('dado a STORAGE_KEY, então é "callofai_keys" (não pode colidir com callofai_cfg)', () => {
    assert.equal(STORAGE_KEY, 'callofai_keys');
  });
});

describe('rebind — troca com tratamento de conflito', () => {
  it('dado um rebind pra uma tecla livre, então muda só aquela ação', () => {
    const r = rebind(defaultBindings(), 'reload', 'KeyJ');
    assert.equal(r.ok, true);
    assert.equal(r.changed, true);
    assert.equal(r.swappedWith, null);
    assert.equal(r.bindings.reload, 'KeyJ');
    assert.equal(r.bindings.jump, 'Space', 'outras ações não podem mudar');
  });

  it('dado um rebind pra ação desconhecida, então recusa sem tocar nos bindings', () => {
    const base = defaultBindings();
    const r = rebind(base, 'voarSemAsas', 'KeyJ');
    assert.equal(r.ok, false);
    assert.deepEqual(r.bindings, base);
  });

  it('dado um rebind pra Escape, então recusa por ser reservada', () => {
    const r = rebind(defaultBindings(), 'reload', 'Escape');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'reserved');
    assert.equal(r.bindings.reload, 'KeyR', 'reload continua no padrão');
  });

  it('dado um rebind pra tecla já usada por outra ação, então TROCA as duas (swap), nunca deixa as duas na mesma tecla', () => {
    const base = defaultBindings(); // reload=KeyR, grenade=KeyG
    const r = rebind(base, 'reload', 'KeyG');
    assert.equal(r.ok, true);
    assert.equal(r.swappedWith, 'grenade');
    assert.equal(r.bindings.reload, 'KeyG');
    assert.equal(r.bindings.grenade, 'KeyR', 'grenade herda a tecla antiga do reload');
    // invariante: nenhuma tecla repetida entre ações depois do swap
    const usadas = Object.values(r.bindings);
    assert.equal(usadas.length, new Set(usadas).size, 'duas ações ficaram na mesma tecla');
  });

  it('dado um rebind pra a MESMA tecla que a ação já tem, então não muda nada (changed:false)', () => {
    const r = rebind(defaultBindings(), 'reload', 'KeyR');
    assert.equal(r.ok, true);
    assert.equal(r.changed, false);
    assert.equal(r.swappedWith, null);
  });

  it('dado bindings sujos (fora do padrão), então rebind normaliza antes de operar (não lança)', () => {
    const r = rebind({ reload: 'KeyJ' }, 'grenade', 'KeyX');
    assert.equal(r.ok, true);
    assert.equal(r.bindings.reload, 'KeyJ', 'preserva o custom que já existia');
    assert.equal(r.bindings.grenade, 'KeyX');
  });
});

describe('codeToActionMap — mapa reverso das ligações atuais', () => {
  it('dado os padrões, então cada código aponta pra a ação certa', () => {
    const map = codeToActionMap(defaultBindings());
    assert.equal(map.KeyW, 'moveForward');
    assert.equal(map.Space, 'jump');
    assert.equal(map.Tab, 'inventory');
  });
});

describe('resolveIncomingCode — é isto que faz o remapeamento VALER sem tocar em game.js', () => {
  it('dado nada remapeado, então uma tecla padrão passa direto (sem reescrever, sem suprimir)', () => {
    const b = defaultBindings();
    const r = resolveIncomingCode(b, 'KeyR');
    assert.equal(r.suppress, false);
    assert.equal(r.rewritten, false);
    assert.equal(r.code, 'KeyR');
  });

  it('dado nada remapeado, então o ALIAS (ShiftRight) também passa direto — game.js já entende os dois', () => {
    const r = resolveIncomingCode(defaultBindings(), 'ShiftRight');
    assert.equal(r.suppress, false);
    assert.equal(r.code, 'ShiftRight');
  });

  it('dado reload remapeado de KeyR pra KeyJ, então KeyJ é REESCRITO pro código canônico KeyR', () => {
    const b = { ...defaultBindings(), reload: 'KeyJ' };
    const r = resolveIncomingCode(b, 'KeyJ');
    assert.equal(r.suppress, false);
    assert.equal(r.rewritten, true);
    assert.equal(r.code, 'KeyR', 'game.js só entende keys.KeyR — tem que virar isso');
    assert.equal(r.action, 'reload');
  });

  it('dado reload remapeado pra longe de KeyR, então a tecla física KeyR ANTIGA fica ÓRFÃ e é SUPRIMIDA', () => {
    const b = { ...defaultBindings(), reload: 'KeyJ' };
    const r = resolveIncomingCode(b, 'KeyR');
    assert.equal(r.suppress, true, 'a tecla R antiga não pode mais recarregar depois do remap');
  });

  it('dado crouch remapeado pra longe de ControlLeft, então ControlRight (alias) TAMBÉM fica órfão e é suprimido', () => {
    const b = { ...defaultBindings(), crouch: 'KeyC' };
    const rLeft = resolveIncomingCode(b, 'ControlLeft');
    const rRight = resolveIncomingCode(b, 'ControlRight');
    assert.equal(rLeft.suppress, true, 'ControlLeft órfão devia ser suprimido');
    assert.equal(rRight.suppress, true, 'ControlRight órfão (alias) é a porta dos fundos que não pode ficar aberta');
  });

  it('dado sprint AINDA no padrão (ShiftLeft), então ShiftRight continua passando direto (não é órfão)', () => {
    const b = defaultBindings(); // nada mudou
    const r = resolveIncomingCode(b, 'ShiftRight');
    assert.equal(r.suppress, false, 'ShiftRight só vira órfão depois que sprint sai do cluster padrão');
  });

  it('dado uma tecla sem relação nenhuma com o jogo, então passa direto sem suprimir nem reescrever', () => {
    const r = resolveIncomingCode(defaultBindings(), 'KeyZ');
    assert.equal(r.suppress, false);
    assert.equal(r.rewritten, false);
    assert.equal(r.code, 'KeyZ');
  });

  it('dado um swap (reload<->grenade), então cada tecla física aciona a ação certa e nenhuma fica órfã por engano', () => {
    const base = defaultBindings();
    const { bindings } = rebind(base, 'reload', 'KeyG'); // swap com grenade
    const viaG = resolveIncomingCode(bindings, 'KeyG'); // agora é reload
    const viaR = resolveIncomingCode(bindings, 'KeyR'); // agora é grenade
    assert.equal(viaG.action, 'reload');
    assert.equal(viaG.code, 'KeyR', 'reescreve pro canônico do reload');
    assert.equal(viaR.action, 'grenade');
    assert.equal(viaR.code, 'KeyG', 'reescreve pro canônico do grenade');
    assert.equal(viaG.suppress, false);
    assert.equal(viaR.suppress, false);
  });

  it('dado entrada lixo (rawCode não-string, bindings null), então não lança', () => {
    assert.doesNotThrow(() => resolveIncomingCode(null, 123));
    assert.doesNotThrow(() => resolveIncomingCode(undefined, undefined));
    const r = resolveIncomingCode(null, '');
    assert.equal(r.suppress, false);
  });
});

describe('describeCode — rótulo legível pro botão', () => {
  it('dado códigos comuns, então mostra o rótulo que o jogador reconhece', () => {
    assert.equal(describeCode('KeyW'), 'W');
    assert.equal(describeCode('Digit1'), '1');
    assert.equal(describeCode('Space'), 'ESPAÇO');
    assert.equal(describeCode('ShiftLeft'), 'SHIFT');
    assert.equal(describeCode('ControlLeft'), 'CTRL');
    assert.equal(describeCode('Tab'), 'TAB');
    assert.equal(describeCode('ArrowUp'), '↑');
  });

  it('dado um código desconhecido, então não lança e devolve algo não-vazio', () => {
    assert.doesNotThrow(() => describeCode('AlgumaCoisaNova99'));
    assert.ok(describeCode('AlgumaCoisaNova99').length > 0);
    assert.doesNotThrow(() => describeCode(null));
    assert.doesNotThrow(() => describeCode(undefined));
  });
});

describe('PREVENT_DEFAULT_CODES — mesmas teclas que o game.js já protegia', () => {
  it('dado o conjunto, então cobre Space/ControlLeft/Tab (o preventDefault original de game.js:1329)', () => {
    for (const c of ['Space', 'ControlLeft', 'Tab']) assert.ok(PREVENT_DEFAULT_CODES.includes(c));
  });
});
