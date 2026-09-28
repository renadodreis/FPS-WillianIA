/* ================================================================
   PAREDES — o que o CLIENTE monta é o que o NODE calcula.

   Os bots (scripts/bots.js) e o servidor não têm navegador: para enxergar
   os prédios eles reconstroem o relevo pela semente (createBotTerrain) e
   chamam js/paredes.js. Esta é a rede que diz que isso basta.

   Para cada semente o jogo REAL sobe no Chrome e entrega
   `Structures.walls` depois do boot inteiro (construções, castelo e o
   cofre que js/secrets.js empurra depois). Do outro lado, em Node, o
   MESMO caminho que a fase 2 dos bots vai usar: createBotTerrain(semente)
   → construirMundoSolido → paredesDoJogo. Tem de dar a mesma contagem,
   na mesma ordem, caixa a caixa a 1e-6, com as mesmas marcas
   (city / noCollide / castle). Idem para os escombros da cidade
   destruída (`Structures.ruinWalls`).

   A âncora é independente do código sob teste nos pontos que importam:
   o relevo do navegador é o do jogo (terreno montado pelo game.js com o
   Math.random seedado), o do Node é o dos bots; a semente do cliente vem
   do `init` do servidor. Um consumo a mais do sorteio das construções em
   QUALQUER um dos lados desloca a planta — o caso "sensibilidade" abaixo
   mede o tamanho disso no Node, e o registro da reinjeção no cliente está
   no relatório da entrega.

   Também aqui: createStructures não consome NADA do Math.random seedado
   (o sorteio das construções é próprio). Armadilha no Math.random conta
   as chamadas ao stream seedado e anota as trocas feitas por dentro de
   createStructures (noSeed); da primeira à última troca o contador não
   pode andar.

   Portas 4060–4066 (faixa desta frente).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const url = require('node:url');
const { CHROME, bootGame } = require('./helpers/harness.js');
const Bots = require('../scripts/bots.js');

const TOL = 1e-6;
const CHAVES = ['x0', 'x1', 'y0', 'y1', 'z0', 'z1'];
// semente, porta, query, armadilha com pilha. 138/150 são as da varredura de
// 500 sementes que achou base invadindo a órbita do Golem
// (test/castle-layout.test.js).
const CASOS = [
  ['424242', 4060, '', true],
  ['1', 4061, '', false],
  ['138', 4062, '', false],
  ['150', 4063, '', false],
  ['987654', 4064, '', false],
  // celular: o preset móvel não pode encostar no mundo sólido
  ['424242', 4065, '?mobile=1', false],
];

/* Instalada antes de qualquer script da página. O game.js troca o
   Math.random pelo mulberry32 seedado logo que o `init` chega; a
   armadilha embrulha ESSE (o primeiro atribuído com __MP_init presente)
   para contar chamadas, e registra cada troca feita com createStructures
   na pilha — `externa` quando a troca é a do embrulho de fora (a pilha tem
   createStructures e ainda NÃO tem criarEstruturas).

   Leve (padrão): um contador por chamada. Só as trocas olham a pilha.
   Com `pilha`: TODA chamada ao stream seedado olha a pilha e conta as que
   vêm de js/structures.js ou js/paredes.js — a medida exata, sem depender
   de como o embrulho foi escrito (~10 s a mais de boot: vai numa semente). */
const armadilha = (pilha = false) => `(() => {
  const T = { semeadas: 0, trocas: [], deEstruturas: ${pilha ? 0 : 'null'} };
  window.__RNG_PAREDES = T;
  let atual = Math.random, semeada = null;
  const DE_ESTRUTURAS = /[/]js[/](structures|paredes)[.]js/;
  Object.defineProperty(Math, 'random', {
    configurable: true,
    get() { return atual; },
    set(fn) {
      if (!semeada && window.__MP_init && fn !== atual) {
        const orig = fn;
        semeada = ${pilha ? `function () {
          T.semeadas++;
          const lim = Error.stackTraceLimit; Error.stackTraceLimit = 14;
          const s = String(new Error().stack);
          Error.stackTraceLimit = lim;
          if (DE_ESTRUTURAS.test(s)) T.deEstruturas++;
          return orig();
        }` : 'function () { T.semeadas++; return orig(); }'};
        atual = semeada;
        return;
      }
      if (semeada) {
        const s = String(new Error().stack);
        if (/createStructures/.test(s))
          T.trocas.push({ i: T.semeadas, volta: fn === semeada, externa: !/criarEstruturas/.test(s) });
      }
      atual = fn;
    },
  });
})();`;

/* CONSUMIDOR ASSÍNCRONO no meio do boot. Entre o terreno/grama e as
   construções o game.js cede a vez uma única vez (`await bootFase(...)`,
   setTimeout 0) — e o que rodar ali come do Math.random SEEDADO. Medido
   nesta entrega: uma queda do socket nessa janela faz o socket.io agendar a
   reconexão com jitter (`Backoff.duration` → Math.random) e o stream anda 1
   a 2 sorteios; no código antigo as construções mudavam de lugar entre duas
   cargas da MESMA semente (visto na 987654). Aqui o consumo é direto e
   determinístico: `n` sorteios num setTimeout 0 armado quando o `init`
   chega, o mesmo instante da janela. Vai DEPOIS da armadilha. */
const consumidorAssincrono = n => `(() => {
  const P = { pedidas: ${n}, comidas: null, antes: null };
  window.__PERTURBA = P;
  let init;
  Object.defineProperty(window, '__MP_init', {
    configurable: true,
    get() { return init; },
    set(v) {
      init = v;
      if (P.antes !== null) return;
      P.antes = -1;
      setTimeout(() => {
        const T = window.__RNG_PAREDES;
        P.antes = T.semeadas;
        for (let i = 0; i < P.pedidas; i++) Math.random();
        P.comidas = T.semeadas - P.antes; // só conta o que saiu do stream seedado
      }, 0);
    },
  });
})();`;

/* AUTOCONTIDA: o puppeteer serializa só o corpo */
function lerDoJogo() {
  const S = window.__game.Structures;
  const plano = w => ({ x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1, z0: w.z0, z1: w.z1,
    city: !!w.city, noCollide: !!w.noCollide, castle: !!w.castle });
  const T = window.__RNG_PAREDES;
  return {
    paredes: S.walls.map(plano),
    escombros: S.ruinWalls.map(plano),
    trocas: T ? T.trocas : null,
    semeadas: T ? T.semeadas : null,
    deEstruturas: T ? T.deEstruturas : null,
    perturbacao: window.__PERTURBA || null,
    semente: window.__MP_init && window.__MP_init.worldSeed,
  };
}

const simples = w => ({ x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1, z0: w.z0, z1: w.z1,
  city: !!w.city, noCollide: !!w.noCollide, castle: !!w.castle });

let P = null;
async function paredesMod() {
  if (!P) P = await import(url.pathToFileURL(path.join(__dirname, '..', 'js', 'paredes.js')).href);
  return P;
}

/* o caminho dos bots: relevo pela semente + construtor puro */
async function doNode(semente, { consumoExtra = 0 } = {}) {
  const Par = await paredesMod();
  const t = await Bots.createBotTerrain(semente);
  let rng;
  if (consumoExtra) {
    rng = Par.rngEstruturas(semente);
    for (let i = 0; i < consumoExtra; i++) rng();
  }
  const mundo = Par.construirMundoSolido({ worldSeed: semente, heightAt: t.heightAt, slopeAt: t.slopeAt,
    WATER_LEVEL: t.WATER_LEVEL, CITY: t.CITY, rng });
  return {
    mundo,
    paredes: Par.paredesDoJogo(mundo).map(simples),
    origens: mundo.cofre ? mundo.origens.concat(['cofre']) : mundo.origens,
    escombros: mundo.escombros.map(simples),
  };
}

/* compara duas listas ordenadas; devolve o laudo com NÚMERO */
function comparar(jogo, node, origens = []) {
  const n = Math.max(jogo.length, node.length);
  let diferentes = 0, pior = 0, primeira = null;
  for (let i = 0; i < n; i++) {
    const a = jogo[i], b = node[i];
    let desvio = 0, marca = false;
    if (!a || !b) desvio = Infinity;
    else {
      for (const k of CHAVES) desvio = Math.max(desvio, Math.abs(a[k] - b[k]));
      marca = a.city !== b.city || a.noCollide !== b.noCollide || a.castle !== b.castle;
    }
    if (desvio > TOL || marca) {
      diferentes++;
      if (desvio > pior) pior = desvio;
      if (!primeira) primeira = { i, origem: origens[i] || '?', desvio, marca, jogo: a || null, node: b || null };
    }
  }
  return { nJogo: jogo.length, nNode: node.length, diferentes, pior, primeira };
}

const laudo = r => `${r.diferentes} de ${Math.max(r.nJogo, r.nNode)} caixas diferem ` +
  `(jogo ${r.nJogo} × node ${r.nNode}); pior desvio ${r.pior === Infinity ? '∞' : r.pior.toFixed(4)} m; ` +
  (r.primeira ? `primeira: #${r.primeira.i} (${r.primeira.origem}) desvio ` +
    `${r.primeira.desvio === Infinity ? '∞ (falta caixa)' : r.primeira.desvio.toFixed(4) + ' m'}` +
    `${r.primeira.marca ? ' + marcas diferentes' : ''} — jogo ${JSON.stringify(r.primeira.jogo)} × node ${JSON.stringify(r.primeira.node)}` : '');

describe('paredes: cliente (jogo real) × Node (caminho dos bots)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  for (const [semente, porta, query, pilha] of CASOS) {
    describe(`semente ${semente}${query ? ' ' + query : ''}`, () => {
      let h, jogo, node;
      before(async () => {
        h = await bootGame({ port: porta, worldSeed: semente, autoStart: false, query, initScripts: [armadilha(pilha)] });
        jogo = await h.play(lerDoJogo);
        node = await doNode(semente);
      });
      after(async () => { if (h) await h.close(); });

      it('o cliente recebeu a semente pedida (a comparação é da semente certa)', () => {
        assert.equal(String(jogo.semente >>> 0), semente);
      });

      it('Structures.walls == construtor puro no Node: contagem, ordem, caixas a 1e-6 e marcas', () => {
        const r = comparar(jogo.paredes, node.paredes, node.origens);
        assert.ok(node.paredes.length > 250, `pré-condição: o Node montou só ${node.paredes.length} paredes`);
        assert.equal(r.diferentes, 0, laudo(r));
      });

      it('escombros da cidade destruída (Structures.ruinWalls) == Node', () => {
        const r = comparar(jogo.escombros, node.escombros);
        assert.equal(r.nNode, 7, 'pré-condição: 6 stubs + toco da torre');
        assert.equal(r.diferentes, 0, laudo(r));
      });

      it('createStructures consome ZERO do Math.random seedado', () => {
        assert.ok(Array.isArray(jogo.trocas), 'a armadilha do Math.random não foi instalada');
        assert.ok(jogo.semeadas > 1e5, `pré-condição: o stream seedado quase não rodou (${jogo.semeadas})`);
        assert.ok(jogo.trocas.length >= 2, 'createStructures não trocou o Math.random nenhuma vez (noSeed sumiu?)');
        const ini = jogo.trocas[0], fim = jogo.trocas[jogo.trocas.length - 1];
        // o embrulho de FORA: sem ele as trocas de dentro (castelo) ainda
        // aparecem, e entre elas o contador pode não andar por acaso
        assert.ok(ini.externa && !ini.volta,
          'a primeira troca não é o noSeed que embrulha createStructures inteiro: ' + JSON.stringify(ini));
        assert.ok(fim.externa && fim.volta,
          'a última troca não devolve o stream no fim de createStructures: ' + JSON.stringify(fim));
        assert.equal(fim.i - ini.i, 0,
          `createStructures consumiu ${fim.i - ini.i} sorteios do stream seedado ` +
          `(índices ${ini.i} → ${fim.i}); tudo que é gerado depois se desloca por construção`);
        if (pilha)
          assert.equal(jogo.deEstruturas, 0,
            `${jogo.deEstruturas} chamadas ao stream seedado têm js/structures.js ou js/paredes.js na pilha`);
      });
    });
  }
});

describe('paredes: consumidor assíncrono no boot não move os prédios', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  const N = 7;
  let h, jogo, node;
  before(async () => {
    h = await bootGame({ port: 4066, worldSeed: '424242', autoStart: false,
      initScripts: [armadilha(false), consumidorAssincrono(N)] });
    jogo = await h.play(lerDoJogo);
    node = await doNode('424242');
  });
  after(async () => { if (h) await h.close(); });

  it(`pré-condição: ${N} sorteios saíram do stream SEEDADO antes de createStructures`, () => {
    const P = jogo.perturbacao;
    assert.ok(P && P.comidas !== null, 'o consumidor assíncrono não rodou');
    assert.equal(P.comidas, N, `o consumidor comeu ${P.comidas} do stream seedado (o Math.random não era o seedado?)`);
    assert.ok(jogo.trocas.length >= 1 && jogo.trocas[0].i >= P.antes + N,
      `a janela não ficou antes das construções: consumo em ${P.antes}, entrada em ${jogo.trocas[0] && jogo.trocas[0].i}`);
  });

  it('Structures.walls continua == construtor puro no Node (o Node não sabe do consumo)', () => {
    const r = comparar(jogo.paredes, node.paredes, node.origens);
    assert.equal(r.diferentes, 0, laudo(r));
    assert.equal(comparar(jogo.escombros, node.escombros).diferentes, 0, 'escombros mudaram');
  });
});

/* A comparação acima só vale se ela PODE falhar. Sem navegador: o mesmo
   comparador entre o caminho do Node e o caminho do Node com UM sorteio a
   mais — o tamanho do estrago tem de ser grande e com número. */
describe('paredes: sensibilidade da comparação (um sorteio a mais num lado)', () => {
  it('um consumo extra do rng das construções move a planta e a comparação acusa', async () => {
    const certo = await doNode('424242');
    const torto = await doNode('424242', { consumoExtra: 1 });
    const r = comparar(certo.paredes, torto.paredes, certo.origens);
    assert.ok(r.diferentes >= 100, `só ${r.diferentes} caixas mudaram com 1 sorteio a mais — ${laudo(r)}`);
    assert.ok(r.pior > 50, `o pior desvio foi só ${r.pior} m — ${laudo(r)}`);
    // e a cidade (sem sorteio) NÃO pode ser o que mudou
    const cidadeCerta = certo.paredes.filter(w => w.city), cidadeTorta = torto.paredes.filter(w => w.city);
    assert.equal(comparar(cidadeCerta, cidadeTorta).diferentes, 0, 'a cidade não sorteia nada e mudou');
  });
});
