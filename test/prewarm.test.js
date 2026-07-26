/* ================================================================
   QA — prewarm.js (linkagem antecipada de programas WebGL).
   Roda em Node puro: o renderer é dublê, nada de GL de verdade.

   Contrato: todo material precisa ter programa linkado ANTES do
   tiroteio. Linkar no meio do frame trava 30-200 ms; linkar no lobby
   não custa nada. Warm repetido não pode refazer trabalho.
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let P;
before(async () => { P = await import('../js/prewarm.js'); });

let uid = 0;
const tex = () => ({ isTexture: true, uuid: `t${uid++}` });
const mat = (extra = {}) => ({ uuid: `m${uid++}`, ...extra });

/* Nó mínimo com o mesmo contrato de Object3D.traverse. */
function node(children = [], material = null) {
  const self = {
    children, material,
    isMesh: !!material,
    traverse(fn) { fn(self); for (const c of children) c.traverse(fn); },
  };
  return self;
}

function fakeRenderer({ async: useAsync = true, throwOn = null } = {}) {
  const calls = { compile: 0, compileAsync: 0, initTexture: [] };
  const r = {
    calls,
    initTexture(t) {
      if (throwOn === 'initTexture') throw new Error('sem contexto GL');
      calls.initTexture.push(t.uuid);
    },
    compile() {
      if (throwOn === 'compile') throw new Error('sem contexto GL');
      calls.compile++;
    },
  };
  if (useAsync) r.compileAsync = async () => {
    if (throwOn === 'compileAsync') throw new Error('sem contexto GL');
    calls.compileAsync++;
  };
  return r;
}

const scene = () => node();
const camera = {};

describe('prewarm — caminho feliz', () => {
  it('prefere compileAsync (KHR_parallel_shader_compile) quando existe', async () => {
    const renderer = fakeRenderer({ async: true });
    const root = node([node([], mat())]);
    const pw = P.createPrewarm({ renderer, scene: root, camera });
    await pw.warm();
    assert.equal(renderer.calls.compileAsync, 1);
    assert.equal(renderer.calls.compile, 0, 'compile síncrono trava a thread: só como fallback');
  });

  it('cai pro compile síncrono quando compileAsync não existe', async () => {
    const renderer = fakeRenderer({ async: false });
    const root = node([node([], mat())]);
    await P.createPrewarm({ renderer, scene: root, camera }).warm();
    assert.equal(renderer.calls.compile, 1);
  });

  it('sobe as texturas dos materiais junto (upload no lobby, não no tiro)', async () => {
    const renderer = fakeRenderer();
    const a = tex(), b = tex();
    const root = node([node([], mat({ map: a, normalMap: b, color: 0xff0000 }))]);
    const pw = P.createPrewarm({ renderer, scene: root, camera });
    const r = await pw.warm();
    assert.deepEqual(renderer.calls.initTexture.sort(), [a.uuid, b.uuid].sort());
    assert.equal(r.textures, 2);
    assert.equal(r.materials, 1);
  });

  it('aceita material em array (multi-material)', async () => {
    const renderer = fakeRenderer();
    const root = node([node([], [mat(), mat()])]);
    const r = await P.createPrewarm({ renderer, scene: root, camera }).warm();
    assert.equal(r.materials, 2);
  });
});

describe('prewarm — não repete trabalho', () => {
  it('segundo warm da mesma cena não chama o compilador de novo', async () => {
    const renderer = fakeRenderer();
    const root = node([node([], mat())]);
    const pw = P.createPrewarm({ renderer, scene: root, camera });
    await pw.warm();
    const r2 = await pw.warm();
    assert.equal(renderer.calls.compileAsync, 1, 'nada novo na cena: warm é no-op');
    assert.equal(r2.materials, 0);
    assert.equal(r2.skipped, true);
  });

  it('material novo depois do primeiro warm dispara um warm novo', async () => {
    const renderer = fakeRenderer();
    const root = node([node([], mat())]);
    const pw = P.createPrewarm({ renderer, scene: root, camera });
    await pw.warm();
    root.children.push(node([], mat()));
    const r2 = await pw.warm();
    assert.equal(renderer.calls.compileAsync, 2);
    assert.equal(r2.materials, 1, 'só o material novo entra na conta');
  });

  it('invalidate força relinkagem (troca de sombra recompila shader)', async () => {
    const renderer = fakeRenderer();
    const root = node([node([], mat())]);
    const pw = P.createPrewarm({ renderer, scene: root, camera });
    await pw.warm();
    pw.invalidate();
    await pw.warm();
    assert.equal(renderer.calls.compileAsync, 2);
  });
});

describe('prewarm — fila de assets tardios', () => {
  it('schedule adia o warm; flush executa na janela segura', async () => {
    const renderer = fakeRenderer();
    const pw = P.createPrewarm({ renderer, scene: scene(), camera });
    const glb = node([node([], mat())]);
    pw.schedule(glb);
    assert.equal(renderer.calls.compileAsync, 0, 'GLB caiu no meio da partida: não linka agora');
    assert.equal(pw.stats.queued, 1);
    const r = await pw.flush();
    assert.equal(r.materials, 1);
    assert.equal(pw.stats.queued, 0);
  });

  it('flush com fila vazia ainda cobre a cena principal', async () => {
    const renderer = fakeRenderer();
    const root = node([node([], mat())]);
    await P.createPrewarm({ renderer, scene: root, camera }).flush();
    assert.equal(renderer.calls.compileAsync, 1);
  });
});

describe('prewarm — nunca derruba o jogo', () => {
  for (const throwOn of ['compileAsync', 'compile', 'initTexture']) {
    it(`engole falha de ${throwOn} (headless/contexto perdido) e segue`, async () => {
      const renderer = fakeRenderer({ async: throwOn !== 'compile', throwOn });
      const root = node([node([], mat({ map: tex() }))]);
      const pw = P.createPrewarm({ renderer, scene: root, camera });
      await assert.doesNotReject(() => pw.warm());
      assert.ok(pw.stats.errors >= 1, 'falha é contada, não propagada');
    });
  }

  it('renderer ausente não quebra o boot', async () => {
    const pw = P.createPrewarm({ renderer: null, scene: scene(), camera });
    await assert.doesNotReject(() => pw.warm());
  });

  /* O loop chama isto sem await. Uma promise rejeitada aqui vira
     unhandledrejection no console do jogador — e o prewarm é otimização,
     não pode virar erro visível. */
  it('travessia que explode não rejeita a promise (loop chama sem await)', async () => {
    const renderer = fakeRenderer();
    const podre = { traverse() { throw new Error('nó corrompido'); } };
    const pw = P.createPrewarm({ renderer, scene: podre, camera });
    await assert.doesNotReject(() => pw.warm());
    await assert.doesNotReject(() => pw.flush());
    assert.ok(pw.stats.errors >= 1, 'falha tem que ser contada');
  });

  it('flush não rejeita nem quando um item da fila está podre', async () => {
    const renderer = fakeRenderer();
    const pw = P.createPrewarm({ renderer, scene: scene(), camera });
    pw.schedule({ traverse() { throw new Error('GLB meio carregado'); } });
    pw.schedule(node([node([], mat())]));
    const r = await pw.flush();
    assert.equal(r.materials, 1, 'item bom da fila tem que passar mesmo assim');
    assert.equal(pw.stats.queued, 0, 'fila drenada apesar do item podre');
  });
});
