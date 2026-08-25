/* ================================================================
   QA — CICLO DE SESSÃO XR (js/xr/xrsession.js).

   Camada fina entre o botão e o `renderer.xr` do three. O que ela
   protege:

     1. ORDEM. `setReferenceSpaceType` tem que ser chamado ANTES de
        `setSession`: o three lê o tipo de referência ao adotar a sessão,
        e invertendo a ordem o jogo nasce em `local` (origem na cabeça, o
        chão vira o olho) em vez de `local-floor`. O sintoma é o jogador
        de 1,70 m enterrado até a cintura no terreno, sem nenhum erro no
        console.
     2. `local-floor` é REQUERIDO, não opcional. Sem ele a altura do
        headset não chega, e "agachar é agachar de verdade" morre.
     3. Uma sessão por vez. Dois cliques no botão abrindo duas sessões
        derruba a primeira e deixa `renderer.xr` apontando pro lugar
        errado.
     4. Recusa não pode sujar estado. O jogador pode negar a permissão, o
        headset pode estar ocupado — depois disso o botão tem que
        continuar funcionando.

   Tudo aqui é dublê simples de propósito: o valor do teste está na
   ORDEM e no ESTADO, e nenhum dos dois precisa de GPU nem de headset.
   ================================================================ */
'use strict';
const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

let createXrSession;
before(async () => {
  ({ createXrSession } = await import('../js/xr/xrsession.js'));
});

function sessaoFalsa() {
  const ouvintes = new Map();
  return {
    encerrada: false,
    addEventListener(tipo, fn) { (ouvintes.get(tipo) || ouvintes.set(tipo, []).get(tipo)).push(fn); },
    removeEventListener(tipo, fn) {
      const l = ouvintes.get(tipo) || [];
      const i = l.indexOf(fn);
      if (i >= 0) l.splice(i, 1);
    },
    async end() { this.encerrada = true; this.disparar('end'); },
    disparar(tipo, evento = {}) { for (const fn of (ouvintes.get(tipo) || []).slice()) fn(evento); },
  };
}

function rendererFalso() {
  const chamadas = [];
  return {
    chamadas,
    xr: {
      enabled: false,
      setReferenceSpaceType(tipo) { chamadas.push(`ref:${tipo}`); },
      async setSession(s) { chamadas.push(s ? 'setSession' : 'setSession:null'); },
    },
  };
}

function navFalso({ suportado = true, sessao = null, erroAoPedir = null, erroAoConsultar = null } = {}) {
  const pedidos = [];
  return {
    pedidos,
    xr: {
      async isSessionSupported(modo) {
        if (erroAoConsultar) throw erroAoConsultar;
        return modo === 'immersive-vr' && suportado;
      },
      async requestSession(modo, init) {
        pedidos.push({ modo, init });
        if (erroAoPedir) throw erroAoPedir;
        return sessao;
      },
    },
  };
}

let renderer, sessao, nav, xs;
beforeEach(() => {
  renderer = rendererFalso();
  sessao = sessaoFalsa();
  nav = navFalso({ sessao });
  xs = createXrSession({ renderer, navigator: nav });
});

describe('suporte', () => {
  it('sem navigator.xr não há suporte', async () => {
    const semXr = createXrSession({ renderer, navigator: {} });
    assert.equal(await semXr.isSupported(), false);
  });

  it('pergunta por immersive-vr', async () => {
    assert.equal(await xs.isSupported(), true);
  });

  it('devolve false quando o navegador diz que não suporta', async () => {
    const sem = createXrSession({ renderer, navigator: navFalso({ suportado: false }) });
    assert.equal(await sem.isSupported(), false);
  });

  it('não lança quando isSessionSupported rejeita', async () => {
    const ruim = createXrSession({
      renderer, navigator: navFalso({ erroAoConsultar: new Error('SecurityError') }),
    });
    assert.equal(await ruim.isSupported(), false);
  });
});

describe('entrar em VR', () => {
  it('pede immersive-vr com local-floor REQUERIDO', async () => {
    await xs.enter();
    assert.equal(nav.pedidos.length, 1);
    assert.equal(nav.pedidos[0].modo, 'immersive-vr');
    assert.ok(nav.pedidos[0].init.requiredFeatures.includes('local-floor'));
  });

  it('configura a referência ANTES de entregar a sessão ao three', async () => {
    await xs.enter();
    const iRef = renderer.chamadas.findIndex(c => c.startsWith('ref:'));
    const iSet = renderer.chamadas.indexOf('setSession');
    assert.ok(iRef >= 0 && iSet >= 0, JSON.stringify(renderer.chamadas));
    assert.ok(iRef < iSet, 'referência depois da sessão = jogador enterrado no chão');
    assert.equal(renderer.chamadas[iRef], 'ref:local-floor');
  });

  it('liga renderer.xr.enabled', async () => {
    await xs.enter();
    assert.equal(renderer.xr.enabled, true);
  });

  it('avisa quem estava esperando', async () => {
    const vistos = [];
    const x = createXrSession({ renderer, navigator: nav, onEnter: s => vistos.push(s) });
    await x.enter();
    assert.deepEqual(vistos, [sessao]);
  });

  it('dois cliques não abrem duas sessões', async () => {
    await Promise.all([xs.enter(), xs.enter()]);
    await xs.enter();
    assert.equal(nav.pedidos.length, 1);
  });

  it('recusa do jogador não suja o estado e deixa tentar de novo', async () => {
    const nega = navFalso({ erroAoPedir: new Error('NotAllowedError') });
    const x = createXrSession({ renderer, navigator: nega });
    const r = await x.enter();
    assert.equal(r.ok, false);
    assert.equal(x.presenting, false);
    assert.equal(renderer.xr.enabled, false, 'ligar o xr sem sessão muda o caminho de render à toa');
    await x.enter();
    assert.equal(nega.pedidos.length, 2, 'o botão tem que continuar funcionando');
  });
});

describe('sair do VR', () => {
  it('exit encerra a sessão', async () => {
    await xs.enter();
    await xs.exit();
    assert.equal(sessao.encerrada, true);
  });

  it('o fim da sessão devolve o estado e avisa', async () => {
    const saidas = [];
    const x = createXrSession({ renderer, navigator: nav, onExit: () => saidas.push(1) });
    await x.enter();
    assert.equal(x.presenting, true);
    sessao.disparar('end');                 // headset tirado, botão do sistema, bateria
    assert.equal(x.presenting, false);
    assert.equal(renderer.xr.enabled, false);
    assert.deepEqual(saidas, [1]);
  });

  it('depois de terminar dá pra entrar de novo', async () => {
    await xs.enter();
    sessao.disparar('end');
    const nova = sessaoFalsa();
    nav.xr.requestSession = async (modo, init) => { nav.pedidos.push({ modo, init }); return nova; };
    await xs.enter();
    assert.equal(xs.presenting, true);
  });

  it('exit sem sessão não lança', async () => {
    await xs.exit();
    assert.equal(xs.presenting, false);
  });
});

describe('foco (requisito de loja: o app continua vivo de headset tirado)', () => {
  it('reporta o estado de visibilidade da sessão', async () => {
    const vistos = [];
    const x = createXrSession({ renderer, navigator: nav, onVisibility: v => vistos.push(v) });
    await x.enter();
    sessao.visibilityState = 'visible-blurred';
    sessao.disparar('visibilitychange', { session: sessao });
    assert.deepEqual(vistos, ['visible-blurred']);
    assert.equal(x.visibility, 'visible-blurred');
  });

  it('nasce como visível', async () => {
    await xs.enter();
    assert.equal(xs.visibility, 'visible');
  });
});
