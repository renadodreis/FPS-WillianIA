/* ================================================================
   OBSTÁCULOS — o que o CLIENTE registra no `obstaclesNear` é o que o
   NODE calcula (o caminho dos bots).

   Árvores, pedras, cactos, a tenda e os POIs (mercado, refúgio, barris)
   barram a bala no `rayBlockedAt` do cliente. Os bots não têm navegador:
   reconstroem o relevo pela semente (createBotTerrain), as construções
   (js/paredes.js) e chamam js/obstaculos.js. Esta é a rede que diz que isso
   basta: para cada semente o jogo REAL sobe no Chrome, espera os POIs
   assíncronos (GLB) e entrega a grade inteira do `obstaclesNear`; do outro
   lado, o MESMO caminho da fase de mundo dos bots. Tem de dar a mesma
   contagem por família e o mesmo obstáculo, um a um, a 1e-6 (posição e
   raio), com a mesma categoria.

   Âncora independente nos pontos que importam: o relevo do navegador é o do
   jogo (Math.random seedado do game.js), o do Node é o dos bots; os sítios
   do Node saem de js/paredes.js; o raio do mercado e do refúgio, no
   cliente, sai da medida REAL do GLB (Scenery.prop) — no Node, do espelho
   PROPS. Um sorteio a mais em qualquer família, num lado só, move dezenas
   de obstáculos (caso "sensibilidade", sem navegador).

   E a REGRA da bala: segmentos que cruzam obstáculos, avaliados pelo
   `rayBlockedAt` de verdade (window.__MP) e pela consulta dos bots. Com
   relevo e paredes livres (conta do Node), tudo que o cliente barra o bot
   tem de barrar — senão o bot atira em quem a vítima diz estar coberto.

   Portas 4110–4115 (faixa desta frente).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const url = require('node:url');
const { CHROME, bootGame } = require('./helpers/harness.js');
const Bots = require('../scripts/bots.js');
const { mulberry32 } = require('../server.js');

const TOL = 1e-6;
const CASOS = [
  ['424242', 4110, ''],
  ['1', 4111, ''],
  ['138', 4112, ''],
  ['150', 4113, ''],
  ['987654', 4114, ''],
  // celular: o preset móvel não pode encostar em obstáculo
  ['424242', 4115, '?mobile=1'],
];
const FAMILIAS = ['tree', 'rock', 'cactus', 'tent', 'mercado', 'refúgio', 'barrel'];

const importar = f => import(url.pathToFileURL(path.join(__dirname, '..', 'js', f)).href);

/* AUTOCONTIDA (o puppeteer serializa só o corpo): a grade inteira do
   `obstaclesNear` (vizinhança 3×3 de células de 16 m, varrida a cada 40 m) */
function lerGrade() {
  const g = window.__game;
  const vistos = new Set(), out = [];
  for (let x = -600; x <= 600; x += 40) for (let z = -600; z <= 600; z += 40) {
    for (const o of g.obstaclesNear(x, z)) if (!vistos.has(o)) { vistos.add(o); out.push(o); }
  }
  return {
    obst: out.map(o => ({ x: o.x, z: o.z, r: o.r, category: o.category || null, sourceId: o.sourceId || null,
      y0: o.y0 === undefined ? null : o.y0, y1: o.y1 === undefined ? null : o.y1 })),
    sitios: g.Structures.sites.map(s => ({ x: s.x, z: s.z, r: s.r, type: s.type })),
    rotaCastelo: g.Structures.castle.rigidClearRadius,
    semente: window.__MP_init && window.__MP_init.worldSeed,
  };
}

/* os POIs chegam depois do boot (GLB): espera o último passo deles (barris) */
async function lerDoJogo(h) {
  const fim = Date.now() + 90000;
  let r = await h.play(lerGrade);
  while (r.obst.filter(o => o.sourceId === 'barrel').length < 3 && Date.now() < fim) {
    await new Promise(res => setTimeout(res, 500));
    r = await h.play(lerGrade);
  }
  await new Promise(res => setTimeout(res, 800)); // o refúgio põe 3 barris a mais logo depois
  return h.play(lerGrade);
}

/* o caminho dos bots: relevo pela semente + construções + obstáculos */
async function doNode(semente, rngs = {}) {
  const Par = await importar('paredes.js');
  const Ob = await importar('obstaculos.js');
  const { CFG } = await importar('config.js');
  const t = await Bots.createBotTerrain(semente);
  const mundo = Par.construirMundoSolido({ worldSeed: semente, heightAt: t.heightAt, slopeAt: t.slopeAt,
    WATER_LEVEL: t.WATER_LEVEL, CITY: t.CITY });
  const ob = Ob.construirObstaculos({ worldSeed: semente, heightAt: t.heightAt, slopeAt: t.slopeAt, biomeAt: t.biomeAt,
    noise: (x, z) => t.simplex.noise(x, z), WATER_LEVEL: t.WATER_LEVEL, CITY: t.CITY, VOLCANO: t.VOLCANO,
    sitios: mundo.plano.sites, WORLD_SIZE: CFG.WORLD_SIZE, TREE_COUNT: CFG.TREE_COUNT, ROCK_COUNT: CFG.ROCK_COUNT, rngs });
  return { Ob, Par, t, mundo, ob };
}

const ordenar = l => l.slice().sort((a, b) => (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : a.x - b.x || a.z - b.z));

/* casa cada obstáculo do jogo com o do Node (mesma família, mais perto) e
   devolve o laudo com NÚMERO */
function comparar(jogo, node) {
  const porFam = l => { const m = {}; for (const o of l) (m[o.sourceId || 'sem-família'] ||= []).push(o); return m; };
  const J = porFam(jogo), N = porFam(node);
  const fams = [...new Set([...Object.keys(J), ...Object.keys(N)])];
  let diferentes = 0, pior = 0, primeira = null;
  const contagem = {};
  for (const f of fams) {
    const a = ordenar(J[f] || []), b = ordenar(N[f] || []);
    contagem[f] = `${a.length}×${b.length}`;
    const livres = b.slice();
    for (const o of a) {
      let melhor = -1, dm = Infinity;
      for (let i = 0; i < livres.length; i++) {
        const d = Math.hypot(livres[i].x - o.x, livres[i].z - o.z);
        if (d < dm) { dm = d; melhor = i; }
      }
      const p = melhor >= 0 ? livres[melhor] : null;
      /* fatia de tronco: a faixa de altura também (sem faixa dos dois lados = 0) */
      const faixa = (u, w) => (u == null && w == null ? 0 : u == null || w == null ? Infinity : Math.abs(u - w));
      const desvio = p ? Math.max(dm, Math.abs(p.r - o.r), faixa(p.y0, o.y0), faixa(p.y1, o.y1)) : Infinity;
      const marca = p && p.category !== o.category;
      if (p) livres.splice(melhor, 1);
      if (desvio > TOL || marca) {
        diferentes++;
        pior = Math.max(pior, desvio);
        if (!primeira) primeira = { fam: f, desvio, marca, jogo: o, node: p };
      }
    }
    diferentes += livres.length;
    if (livres.length && !primeira) primeira = { fam: f, desvio: Infinity, jogo: null, node: livres[0] };
    if (livres.length) pior = Infinity;
  }
  return { diferentes, pior, primeira, contagem, nJogo: jogo.length, nNode: node.length };
}
const laudo = r => `${r.diferentes} de ${Math.max(r.nJogo, r.nNode)} obstáculos diferem ` +
  `(jogo ${r.nJogo} × node ${r.nNode}; por família jogo×node ${JSON.stringify(r.contagem)}); ` +
  `pior desvio ${r.pior === Infinity ? '∞' : r.pior.toFixed(4)} m` +
  (r.primeira ? `; primeiro: ${r.primeira.fam} jogo ${JSON.stringify(r.primeira.jogo)} × node ${JSON.stringify(r.primeira.node)}` : '');

const resultados = new Map();

describe('obstáculos: cliente (jogo real) × Node (caminho dos bots)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  // a página da 424242 (desktop) fica aberta para o caso da regra da bala
  after(async () => { for (const { h } of resultados.values()) await h.close(); });
  for (const [semente, porta, query] of CASOS) {
    describe(`semente ${semente}${query ? ' ' + query : ''}`, () => {
      let h, jogo, node;
      before(async () => {
        h = await bootGame({ port: porta, worldSeed: semente, autoStart: false, query });
        jogo = await lerDoJogo(h);
        node = await doNode(semente);
        resultados.set(semente + query, { h, jogo, node });
      });
      after(async () => { if (h && !(semente === '424242' && !query)) { await h.close(); resultados.delete(semente + query); } });

      it('o cliente recebeu a semente pedida (a comparação é da semente certa)', () => {
        assert.equal(String(jogo.semente >>> 0), semente);
      });

      it('grade do obstaclesNear == js/obstaculos.js no Node: família, posição e raio a 1e-6, categoria', () => {
        const r = comparar(jogo.obst, node.ob.solidos);
        assert.ok(node.ob.solidos.length > 300, `pré-condição: o Node montou só ${node.ob.solidos.length} obstáculos`);
        for (const f of FAMILIAS.filter(f => f !== 'refúgio'))
          assert.ok(node.ob.solidos.some(o => o.sourceId === f), `pré-condição: o Node não tem nenhum ${f}`);
        assert.equal(r.diferentes, 0, laudo(r));
      });

      it('os sítios dos POIs (mercado, refúgio) que o cliente publica são os do Node', () => {
        const pois = s => s.filter(x => x.type === 'mercado' || x.type === 'refúgio').map(x => ({ ...x }));
        const a = pois(jogo.sitios), b = node.ob.pois.sitios;
        assert.equal(a.length, b.length, `sítios de POI: jogo ${JSON.stringify(a)} × node ${JSON.stringify(b)}`);
        for (let i = 0; i < a.length; i++) {
          assert.equal(a[i].type, b[i].type);
          assert.ok(Math.max(Math.abs(a[i].x - b[i].x), Math.abs(a[i].z - b[i].z), Math.abs(a[i].r - b[i].r)) < TOL,
            `${a[i].type}: jogo ${JSON.stringify(a[i])} × node ${JSON.stringify(b[i])}`);
        }
      });

      it('o espelho da rota livre do castelo é o de js/castle.js', () => {
        assert.equal(node.Ob.CASTELO_ROTA_LIVRE_M, jogo.rotaCastelo);
      });
    });
  }

  /* A REGRA. Segmentos sorteados cruzando perto de obstáculos, do olho/corpo
     até 4,5 m do chão, avaliados pelo `rayBlockedAt` de verdade (window.__MP)
     e pela consulta dos bots. Só contam os que têm relevo e paredes livres
     pela conta do Node — aí quem barra é obstáculo.

     O cliente AMOSTRAVA a reta a cada 1,6 m (a partir de 1,6 m da origem);
     hoje as duas são contínuas (caso "o tiro do jogador", abaixo). Os dois
     números de antes continuam:
       • a regra: o `rayBlockedAt` chamado 16 vezes com a origem deslizada de
         0,1 m em 0,1 m cobre a reta a cada 0,1 m — é a MESMA regra (raio
         r·√0,8, teto de 3,4 m), sem a peneira. Com o início da reta livre
         (1,7 m), cliente fino e bot têm de concordar (≤ 1 %: cordas < 0,1 m);
       • a garantia do produto: tudo que o `rayBlockedAt` normal (uma chamada)
         barra, o bot barra — senão o bot atiraria em quem a vítima diz estar
         coberto. O contrário (o bot barra e o cliente deixa passar entre duas
         amostras) é o bot mais conservador que a vítima: vai no diagnóstico. */
  /* ÂNCORA independente do `rayBlockedAt` e da consulta analítica: marcha de
     2 cm, ponto-dentro-de-cilindro sobre a lista de obstáculos, com a regra
     escrita aqui (raio r·√0,8, até 3,4 m acima do chão do ponto; a fatia de
     tronco, na faixa absoluta y0–y1 dela). Devolve a distância da primeira
     amostra barrada, ou Infinity. */
  function entradaNoObstaculo(solidos, heightAt, a, b, passo = 0.02) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz);
    const lx = Math.min(a.x, b.x) - 4, hx = Math.max(a.x, b.x) + 4, lz = Math.min(a.z, b.z) - 4, hz = Math.max(a.z, b.z) + 4;
    const perto = solidos.filter(o => o.x > lx && o.x < hx && o.z > lz && o.z < hz);
    const n = Math.ceil(len / passo);
    for (let i = 0; i <= n; i++) {
      const k = i / n, x = a.x + dx * k, y = a.y + dy * k, z = a.z + dz * k;
      for (const o of perto) {
        if ((x - o.x) ** 2 + (z - o.z) ** 2 < o.r * o.r * 0.8 &&
          (Number.isFinite(o.y1) ? y >= o.y0 && y < o.y1 : y - heightAt(x, z) < 3.4)) return len * k;
      }
    }
    return Infinity;
  }

  describe('a regra da bala: rayBlockedAt do cliente × consulta dos bots', () => {
    let seg = null, cli = null, no = null, solidos = null;
    before(async () => {
      const R = resultados.get('424242');
      assert.ok(R, 'o boot da semente 424242 (desktop) não rodou');
      const { h, node } = R;
      const { t, Par, mundo, Ob, ob } = node;
      solidos = ob.solidos;
      const rng = mulberry32(2026);
      seg = [];
      for (let k = 0; k < 4000; k++) {
        const o = ob.solidos[Math.floor(rng() * ob.solidos.length)];
        const R2 = o.r * Math.sqrt(0.8);
        const ang = rng() * Math.PI * 2, lat = (rng() * 2 - 1) * R2 * 1.4;
        const ux = Math.cos(ang), uz = Math.sin(ang);
        const antes = 4 + rng() * 40, depois = 2 + rng() * 12;
        const cx = o.x - uz * lat, cz = o.z + ux * lat;
        const ax = cx - ux * antes, az = cz - uz * antes, bx = cx + ux * depois, bz = cz + uz * depois;
        const a = { x: ax, y: t.heightAt(ax, az) + 0.5 + rng() * 3.5, z: az };
        const b = { x: bx, y: t.heightAt(bx, bz) + 0.3 + rng() * 4.2, z: bz };
        seg.push([a, b]);
      }
      cli = await h.play(lista => {
        const MP = window.__MP, T = MP.THREE, V = window.__game.Veiculos;
        const o = new T.Vector3(), d = new T.Vector3();
        return lista.map(([a, b]) => {
          /* veículo inteiro também barra desde a vida de veículo (03e292f) —
             ele não é obstáculo do mapa, é outra regra: sai da comparação */
          const veiculo = !!(V && V.segmento && V.segmento(a, b));
          d.set(b.x - a.x, b.y - a.y, b.z - a.z);
          const len = d.length();
          d.multiplyScalar(1 / len);
          o.set(a.x, a.y, a.z);
          const dist = MP.rayBlockedAt(o, d, len);
          const grossa = dist < len;
          let fina = false;
          for (let k = 0; k < 16 && !fina; k++) {
            o.set(a.x + d.x * 0.1 * k, a.y + d.y * 0.1 * k, a.z + d.z * 0.1 * k);
            fina = MP.rayBlockedAt(o, d, len - 0.1 * k) < len - 0.1 * k;
          }
          return { grossa, fina, veiculo, dist: Math.min(dist, len + 1) };
        });
      }, seg);
      const paredes = Par.criarConsultaParedes(Par.paredesDoJogo(mundo));
      const q = Ob.criarConsultaObstaculos(ob.solidos, { heightAt: t.heightAt, grade: t.losGrid });
      no = seg.map(([a, b], i) => {
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz);
        const inicio = { x: a.x + dx / len * 1.7, y: a.y + dy / len * 1.7, z: a.z + dz / len * 1.7 };
        return {
          livre: Bots.lineOfSight(t, a, b) && !paredes.segmentoBloqueado(a, b) && !cli[i].veiculo,
          inicioLivre: !q.segmentoBloqueado(a, inicio),
          obst: q.segmentoBloqueado(a, b),
          quem: q.quemBarra(a, b),
          entrada: entradaNoObstaculo(ob.solidos, t.heightAt, a, b),
        };
      });
    });

    it('a mesma regra: rayBlockedAt a cada 0,1 m × consulta dos bots (raio r·√0,8, teto 3,4 m)', (t) => {
      let n = 0, barra = 0, soCliente = 0, soBot = 0, ex = null;
      seg.forEach((s, i) => {
        if (!no[i].livre || !no[i].inicioLivre) return;
        n++;
        if (cli[i].fina) barra++;
        if (cli[i].fina && !no[i].obst) { soCliente++; ex ||= s; }
        if (!cli[i].fina && no[i].obst) { soBot++; ex ||= s; }
      });
      t.diagnostic(`${n} segmentos com relevo, paredes e início livres: o cliente fino barrou ${barra}; só o cliente ${soCliente}, só o bot ${soBot}`);
      assert.ok(n > 2000 && barra > 500, `o cenário não exercita a regra: ${n} segmentos, ${barra} barrados`);
      assert.ok(soCliente + soBot <= n * 0.01, `cliente e bot discordam em ${soCliente} + ${soBot} de ${n} — ex.: ${JSON.stringify(ex)}`);
    });

    it('a garantia: com relevo e paredes livres, todo segmento que o rayBlockedAt barra o bot barra (0 violações)', (t) => {
      let livres = 0, cliBarra = 0, violacoes = 0, soBot = 0, primeira = null;
      seg.forEach((s, i) => {
        if (!no[i].livre) return;
        livres++;
        if (cli[i].grossa) {
          cliBarra++;
          if (!no[i].obst) { violacoes++; primeira ||= s; }
        } else if (no[i].obst) soBot++;
      });
      t.diagnostic(`${livres} segmentos com relevo e paredes livres: o rayBlockedAt barrou ${cliBarra}; o bot deixou passar ${violacoes} deles; ` +
        `o bot barrou ${soBot} que o rayBlockedAt deixou passar (bot mais conservador que a vítima: reta que nasce dentro de um cilindro)`);
      assert.ok(livres > 2000 && cliBarra > 500, `o cenário não exercita a regra: ${livres} livres, ${cliBarra} barrados pelo cliente`);
      assert.equal(violacoes, 0, `o bot vê por ${violacoes} segmentos que o cliente barra — ex.: ${JSON.stringify(primeira)}`);
    });

    /* O TIRO DO JOGADOR não pula obstáculo fino. Amostrando a cada 1,6 m, a
       bala só parava num cacto (r·√0,8 = 0,31 m) se uma amostra caísse
       dentro dele: o validador mediu a bala passando por cacto e árvore que
       barram o bot. Aqui, UMA chamada do `rayBlockedAt` (a do tiro) contra a
       consulta dos bots, por família, e o ponto em que ela para contra a
       marcha de 2 cm — a bala para na casca, não depois dela. */
    it('o tiro do jogador (uma chamada) barra o que o bot barra, por família, e para na entrada do obstáculo', (t) => {
      const fam = {};
      let livres = 0, soBot = 0, longe = 0, pior = 0, ex = null, dentro = 0, dentroDiverge = 0;
      seg.forEach((s, i) => {
        if (!no[i].livre || !no[i].obst) return;
        /* a reta que NASCE dentro de um cilindro: o cliente não deixa esse
           cilindro barrá-la (granada no pé do tronco; o jogador nunca nasce
           lá), o bot deixa. Fora da conta, com o número no diagnóstico. */
        if (no[i].entrada === 0) {
          dentro++;
          if (!cli[i].grossa || cli[i].dist > 0.05) dentroDiverge++;
          return;
        }
        livres++;
        const f = no[i].quem >= 0 ? solidos[no[i].quem].sourceId : '?';
        const c = fam[f] || (fam[f] = { n: 0, passou: 0 });
        c.n++;
        if (!cli[i].grossa) { soBot++; c.passou++; ex ||= s; return; }
        if (Number.isFinite(no[i].entrada)) {
          const e = Math.abs(cli[i].dist - no[i].entrada);
          pior = Math.max(pior, e);
          if (e > 0.05) longe++;
        }
      });
      const porFam = Object.entries(fam).map(([f, c]) => `${f} ${c.passou}/${c.n}`).join(', ');
      t.diagnostic(`${livres} segmentos que o bot barra (relevo e paredes livres); a bala do jogador passou por ${soBot} (${porFam}); ` +
        `impacto a mais de 5 cm da entrada: ${longe} (pior ${pior.toFixed(3)} m); nascem dentro de um cilindro: ${dentro} (${dentroDiverge} com o cliente seguindo)`);
      assert.ok(livres > 500 && fam.cactus && fam.cactus.n > 20 && fam.tree && fam.tree.n > 20,
        `o cenário não exercita cacto e árvore: ${porFam}`);
      assert.ok(soBot <= livres * 0.01, `a bala do jogador atravessou ${soBot} de ${livres} obstáculos que barram o bot (${porFam}) — ex.: ${JSON.stringify(ex)}`);
      assert.ok(longe <= livres * 0.01, `a bala parou longe da entrada em ${longe} de ${livres} (pior ${pior.toFixed(3)} m)`);
    });
  });
});

/* A comparação acima só vale se ela PODE falhar. Sem navegador: o mesmo
   comparador entre o caminho do Node e o caminho do Node com UM sorteio a
   mais numa família — o tamanho do estrago tem de ser grande e com número,
   e as outras famílias não podem se mexer (streams separados). */
describe('obstáculos: sensibilidade da comparação (um sorteio a mais num lado)', () => {
  for (const [fam, sid] of [['arvores', 'tree'], ['pedras', 'rock'], ['cactos', 'cactus']]) {
    it(`um consumo extra do sorteio das ${fam} move ${sid} e só ${sid}`, async () => {
      const Ob = await importar('obstaculos.js');
      const certo = (await doNode('424242')).ob;
      const rng = Ob[`rng${fam[0].toUpperCase()}${fam.slice(1)}`]('424242');
      rng();
      const torto = (await doNode('424242', { [fam]: rng })).ob;
      const r = comparar(certo.solidos, torto.solidos);
      // rejeição re-sincroniza o stream (o cacto aceita pouco e consome 2 por
      // recusa, 5 por aceite): 1 sorteio a mais mexe ~25 cactos, não todos
      assert.ok(r.diferentes >= 10, `só ${r.diferentes} obstáculos mudaram com 1 sorteio a mais — ${laudo(r)}`);
      const outros = l => l.filter(o => o.sourceId !== sid);
      assert.equal(comparar(outros(certo.solidos), outros(torto.solidos)).diferentes, 0, `mexer nas ${fam} moveu outra família`);
    });
  }
  it('um consumo extra do sorteio dos POIs move o refúgio', async () => {
    const Ob = await importar('obstaculos.js');
    const certo = (await doNode('424242')).ob;
    const rng = Ob.rngPois('424242');
    rng();
    const torto = (await doNode('424242', { pois: rng })).ob;
    assert.ok(certo.pois.refugio && torto.pois.refugio, 'pré-condição: refúgio nas duas');
    const d = Math.hypot(certo.pois.refugio.x - torto.pois.refugio.x, certo.pois.refugio.z - torto.pois.refugio.z);
    assert.ok(d > 20, `o refúgio andou só ${d.toFixed(2)} m com 1 sorteio a mais`);
  });
});
