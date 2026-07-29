/* ================================================================
   QA — broadphase SAP: o pulo do gato tem que ser INVISÍVEL.

   O `collisionPairs` de fábrica do cannon-es varre TODOS os pares
   (i,j): quando o par é estático×estático ele faz `continue` — nunca
   `break` — então o laço interno vai até o fim da lista. Num mundo com
   ~1000 colisores de cenário parados isso é O(N²) por substep e come
   quase metade da CPU do frame.

   A versão daqui só olha, para um corpo PASSIVO (estático ou dormindo),
   os corpos ATIVOS à frente dele na lista ordenada. É uma reescrita
   PURAMENTE ALGORÍTMICA: todo par pulado é exatamente um par em que o
   original faria `continue`, então a sequência de `intersectionTest` —
   e portanto os pares emitidos e a ORDEM deles — é idêntica.

   Este teste prova isso comparando as duas implementações par a par em
   mundos aleatórios (estáticos, dinâmicos, dormindo, filtros de colisão,
   raios variados) — inclusive nos casos em que o `break` do original
   dispara cedo.
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let CANNON, installFastSAP;
before(async () => {
  CANNON = await import('cannon-es');
  ({ installFastSAP } = await import('../js/sapbroadphase.js'));
});

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* mundo sintético: mistura de estáticos, dinâmicos e adormecidos */
function makeWorld(seed, n, dynamicRatio) {
  const rnd = mulberry(seed);
  const world = new CANNON.World();
  for (let i = 0; i < n; i++) {
    const dyn = rnd() < dynamicRatio;
    const half = 0.3 + rnd() * 4;
    const body = new CANNON.Body({
      mass: dyn ? 1 : 0,
      shape: new CANNON.Box(new CANNON.Vec3(half, half * (0.2 + rnd() * 3), half)),
    });
    body.position.set((rnd() - 0.5) * 400, (rnd() - 0.5) * 40, (rnd() - 0.5) * 400);
    if (dyn && rnd() < 0.35) body.sleepState = CANNON.Body.SLEEPING; // dinâmico dormindo = passivo
    if (rnd() < 0.15) { body.collisionFilterGroup = 2; body.collisionFilterMask = 2; }
    body.updateAABB();
    body.updateBoundingRadius();
    world.addBody(body);
  }
  return world;
}

/* roda um collisionPairs isolado e devolve a lista de pares (em ordem) */
function pairsOf(broadphase, world) {
  const p1 = [], p2 = [];
  broadphase.collisionPairs(world, p1, p2);
  return p1.map((b, i) => `${world.bodies.indexOf(b)}:${world.bodies.indexOf(p2[i])}`);
}

/* mesma lista ordenada nas duas: clona o axisList já ordenado do original */
function compare(seed, n, dynamicRatio, axisIndex) {
  const world = makeWorld(seed, n, dynamicRatio);
  const stock = new CANNON.SAPBroadphase(world);
  stock.axisIndex = axisIndex;
  const fast = new CANNON.SAPBroadphase(world);
  fast.axisIndex = axisIndex;
  installFastSAP(fast);
  const a = pairsOf(stock, world);   // ordena a lista dele
  const b = pairsOf(fast, world);    // ordena a lista dele (mesmo critério)
  return { a, b, world };
}

describe('SAPBroadphase acelerado (js/sapbroadphase.js)', () => {
  it('emite EXATAMENTE os mesmos pares, na mesma ordem, que o cannon-es de fábrica', () => {
    let totalPairs = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const ratio of [0, 0.02, 0.2, 1]) {
        for (const axis of [0, 1, 2]) {
          const { a, b } = compare(seed * 7919, 90, ratio, axis);
          assert.deepEqual(b, a,
            `divergiu: seed=${seed} dinâmicos=${ratio} eixo=${axis}`);
          totalPairs += a.length;
        }
      }
    }
    assert.ok(totalPairs > 200,
      `cenários fracos demais para provar equivalência (${totalPairs} pares)`);
  });

  it('mundo denso (mundo real: quase tudo estático) continua idêntico', () => {
    for (const seed of [11, 23, 4242]) {
      const { a, b } = compare(seed, 400, 0.01, 0);
      assert.deepEqual(b, a, `divergiu no mundo denso seed=${seed}`);
    }
  });

  it('quando TUDO acorda, cai no caminho original e continua idêntico', () => {
    const { a, b } = compare(31337, 150, 1, 0);
    assert.deepEqual(b, a);
  });

  it('não olha pares estático×estático: o trabalho cai com o nº de ativos', () => {
    const world = makeWorld(99, 600, 0);          // 600 corpos, ZERO ativos
    const fast = new CANNON.SAPBroadphase(world);
    installFastSAP(fast);
    let checks = 0;
    const orig = fast.needBroadphaseCollision.bind(fast);
    fast.needBroadphaseCollision = (x, y) => { checks++; return orig(x, y); };
    fast.collisionPairs(world, [], []);
    assert.equal(checks, 0,
      `varreu ${checks} pares num mundo sem nenhum corpo ativo`);
  });

  it('instalar é idempotente e não vaza para outras instâncias', () => {
    const world = makeWorld(5, 40, 0.3);
    const other = new CANNON.SAPBroadphase(world);
    const fast = new CANNON.SAPBroadphase(world);
    installFastSAP(fast);
    installFastSAP(fast);
    assert.notEqual(fast.collisionPairs, other.collisionPairs,
      'installFastSAP não trocou a implementação da instância');
    assert.equal(other.collisionPairs, CANNON.SAPBroadphase.prototype.collisionPairs,
      'installFastSAP vazou para o protótipo / outras instâncias');
    assert.deepEqual(pairsOf(fast, world), pairsOf(other, world));
  });
});
