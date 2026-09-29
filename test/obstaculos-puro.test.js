/* ================================================================
   OBSTÁCULOS — js/obstaculos.js é PURO e serve ao processo dos bots.

   Sem navegador:
     • o grafo de import só tem módulos relativos do jogo (nem `three`), sem
       DOM e sem Math.random;
     • não encosta no Math.random global (roda com ele ARMADO para explodir);
     • é determinístico por semente, e sementes diferentes dão vegetação
       diferente;
     • o que NÃO podia mudar não mudou: os POIs (mercado, refúgio, barris) e
       a tenda estão EXATAMENTE onde o cliente antigo os punha (números
       capturados do jogo em ed120ed, antes desta entrega);
     • a vegetação respeita as exclusões (cidade, vulcão, rota do castelo,
       sítios das construções e dos POIs, spawn);
     • a consulta segmento × cilindros bate com uma âncora de força bruta
       (marcha de 1 cm, ponto-dentro-de-cilindro com a regra da bala) em
       segmentos sorteados pelo mapa inteiro.
   ================================================================ */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const Bots = require('../scripts/bots.js');
const { mulberry32 } = require('../server.js');

const JS = path.join(__dirname, '..', 'js');
const importar = f => import(url.pathToFileURL(path.join(JS, f)).href);

async function obstaculosDe(semente) {
  const Ob = await importar('obstaculos.js');
  const Par = await importar('paredes.js');
  const { CFG } = await importar('config.js');
  const t = await Bots.createBotTerrain(semente);
  const mundo = Par.construirMundoSolido({ worldSeed: semente, heightAt: t.heightAt, slopeAt: t.slopeAt,
    WATER_LEVEL: t.WATER_LEVEL, CITY: t.CITY });
  const args = { worldSeed: semente, heightAt: t.heightAt, slopeAt: t.slopeAt, biomeAt: t.biomeAt,
    noise: (x, z) => t.simplex.noise(x, z), WATER_LEVEL: t.WATER_LEVEL, CITY: t.CITY, VOLCANO: t.VOLCANO,
    sitios: mundo.plano.sites, WORLD_SIZE: CFG.WORLD_SIZE, TREE_COUNT: CFG.TREE_COUNT, ROCK_COUNT: CFG.ROCK_COUNT };
  return { Ob, t, mundo, args, ob: Ob.construirObstaculos(args), CFG };
}

describe('obstaculos.js é dado puro', () => {
  it('o grafo de import só tem módulos relativos do próprio jogo, nenhum pacote e nenhum DOM', () => {
    const vistos = new Set();
    const pendentes = ['obstaculos.js'];
    while (pendentes.length) {
      const f = pendentes.pop();
      if (vistos.has(f)) continue;
      vistos.add(f);
      const src = fs.readFileSync(path.join(JS, f), 'utf8');
      const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const m of codigo.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)) {
        const esp = m[1];
        assert.ok(esp.startsWith('./'), `${f} importa o pacote "${esp}" — o processo dos bots não pode depender disso`);
        pendentes.push(path.normalize(esp));
      }
      for (const proibido of [/\bdocument\s*[.[]/, /\bwindow\s*[.[]/, /\bglobalThis\b/, /\bTHREE\s*\./, /Math\.random\s*\(/])
        assert.ok(!proibido.test(codigo), `${f} usa ${proibido} — não é mais dado puro`);
    }
    assert.ok(vistos.has('paredes.js'), `pré-condição: o grafo é ${[...vistos]}`);
  });

  it('não consome o Math.random global (roda com ele armado para explodir)', async () => {
    const { Ob, args } = await obstaculosDe(424242);
    const R = Math.random;
    let chamadas = 0;
    Math.random = () => { chamadas++; throw new Error('obstaculos.js chamou Math.random'); };
    try {
      const o = Ob.construirObstaculos(args);
      Ob.criarConsultaObstaculos(o.solidos, { heightAt: args.heightAt }).segmentoBloqueado({ x: 0, y: 5, z: 0 }, { x: 300, y: 5, z: 200 });
    } finally { Math.random = R; }
    assert.equal(chamadas, 0);
  });

  it('mesma semente → mesmos obstáculos; semente diferente → vegetação diferente', async () => {
    const a = (await obstaculosDe(424242)).ob, b = (await obstaculosDe(424242)).ob, c = (await obstaculosDe(7)).ob;
    assert.deepEqual(a.solidos, b.solidos);
    // árvores e pedras (a árvore pelo pivô: cada tronco dela tem várias fatias na lista de sólidos)
    const perto = (o, l) => l.some(p => Math.hypot(p.x - o.x, p.z - o.z) < 1);
    const iguais = a.arvores.filter(o => perto(o, c.arvores)).length + a.pedras.filter(o => perto(o, c.pedras)).length;
    assert.ok(iguais < 10, `sementes 424242 e 7 dividem ${iguais} árvores/pedras no mesmo lugar`);
  });

  it('o que não podia mudar não mudou: POIs e tenda onde o cliente antigo (ed120ed) os punha', async () => {
    /* Capturado da grade do `obstaclesNear` do jogo real em ed120ed, semente
       424242, antes desta entrega (scratch probe-obst.js do relatório). */
    const ANTES = [
      { sourceId: 'mercado', x: -236, z: 112, r: 4.127790246561884 },
      { sourceId: 'refúgio', x: 312.37904870065694, z: -161.3925724075108, r: 3.6904513284542166 },
      { sourceId: 'tent', x: 5.6, z: -4.2, r: 1.3 },
      { sourceId: 'barrel', x: -231, z: 116, r: 0.55 }, { sourceId: 'barrel', x: -242, z: 114, r: 0.55 },
      { sourceId: 'barrel', x: -233, z: 106, r: 0.55 },
      { sourceId: 'barrel', x: 316.37904870065694, z: -159.3925724075108, r: 0.55 },
      { sourceId: 'barrel', x: 309.37904870065694, z: -165.3925724075108, r: 0.55 },
      { sourceId: 'barrel', x: 314.37904870065694, z: -166.3925724075108, r: 0.55 },
    ];
    const { ob } = await obstaculosDe(424242);
    for (const o of ANTES) {
      const n = ob.solidos.find(p => p.sourceId === o.sourceId && Math.hypot(p.x - o.x, p.z - o.z) < 1e-9);
      assert.ok(n, `${o.sourceId} em (${o.x}, ${o.z}) sumiu`);
      assert.ok(Math.abs(n.r - o.r) < 1e-9, `${o.sourceId}: raio ${n.r} × ${o.r}`);
    }
    assert.equal(ob.solidos.filter(o => ['mercado', 'refúgio', 'tent', 'barrel'].includes(o.sourceId)).length, ANTES.length);
  });

  it('exclusões: nada nasce no distrito urbano, no vulcão, na rota do castelo, no spawn, nem perto de construção/POI', async () => {
    for (const semente of [424242, 1, 987654]) {
      const { Ob, ob, t, mundo } = await obstaculosDe(semente);
      const forte = mundo.plano.sites.find(s => s.type === 'forte');
      const veg = ob.solidos.filter(o => ['tree', 'rock', 'cactus'].includes(o.sourceId));
      const ruim = veg.filter(o => Math.hypot(o.x - t.CITY.x, o.z - t.CITY.z) < Ob.VEGETACAO.CIDADE_LIVRE_M
        || Math.hypot(o.x - t.VOLCANO.x, o.z - t.VOLCANO.z) < t.VOLCANO.r
        || Math.hypot(o.x - forte.x, o.z - forte.z) <= Ob.CASTELO_ROTA_LIVRE_M
        // longe do spawn: árvore a 26 m, pedra a 18 m (cacto nunca excluiu)
        || (o.sourceId === 'tree' && Math.hypot(o.x, o.z) < 26) || (o.sourceId === 'rock' && Math.hypot(o.x, o.z) < 18));
      assert.equal(ruim.length, 0, `semente ${semente}: ${ruim.length} obstáculos em área excluída — ${JSON.stringify(ruim[0])}`);
      const sitios = mundo.plano.sites.concat(ob.pois.sitios);
      const arvoreEmSitio = ob.arvores.filter(a => sitios.some(s => Math.hypot(a.x - s.x, a.z - s.z) < s.r + 4));
      assert.equal(arvoreEmSitio.length, 0, `semente ${semente}: ${arvoreEmSitio.length} árvores dentro de construção/POI`);
      assert.ok(ob.arvores.length > 250 && ob.pedras.length > 150, `semente ${semente}: só ${ob.arvores.length} árvores e ${ob.pedras.length} pedras`);
    }
  });

  it('consulta segmento × cilindros == âncora de força bruta (marcha de 1 cm) em 6 000 segmentos', async (t0) => {
    const { Ob, ob, t } = await obstaculosDe(424242);
    const q = Ob.criarConsultaObstaculos(ob.solidos, { heightAt: t.heightAt, grade: t.losGrid });
    const qSemGrade = Ob.criarConsultaObstaculos(ob.solidos, { heightAt: t.heightAt });
    const ancora = (a, b) => {
      const lx = Math.min(a.x, b.x) - 5, hx = Math.max(a.x, b.x) + 5, lz = Math.min(a.z, b.z) - 5, hz = Math.max(a.z, b.z) + 5;
      const perto = ob.solidos.filter(o => o.x > lx && o.x < hx && o.z > lz && o.z < hz);
      if (!perto.length) return false;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, n = Math.ceil(Math.hypot(dx, dy, dz) / 0.01);
      for (let i = 0; i <= n; i++) {
        const p = { x: a.x + dx * i / n, y: a.y + dy * i / n, z: a.z + dz * i / n };
        // fatia de tronco (y0/y1): só na faixa ABSOLUTA de altura dela
        if (perto.some(o => (p.x - o.x) ** 2 + (p.z - o.z) ** 2 < o.r * o.r * 0.8 &&
          (Number.isFinite(o.y1) ? p.y >= o.y0 && p.y < o.y1 : p.y - t.heightAt(p.x, p.z) < 3.4))) return true;
      }
      return false;
    };
    const r = mulberry32(31);
    let n = 0, barra = 0, dif = 0, difSemGrade = 0, ex = null;
    for (let k = 0; k < 6000; k++) {
      // metade mirando a borda de um obstáculo (onde a regra decide), metade solta no mapa
      let ax, az, bx, bz;
      if (k % 2 === 0) {
        const o = ob.solidos[Math.floor(r() * ob.solidos.length)], R = o.r * Math.sqrt(0.8);
        const ang = r() * Math.PI * 2, ux = Math.sin(ang), uz = Math.cos(ang), lat = (r() * 2 - 1) * R * 1.3;
        const cx = o.x - uz * lat, cz = o.z + ux * lat, antes = 1 + r() * 25, depois = 1 + r() * 10;
        ax = cx - ux * antes; az = cz - uz * antes; bx = cx + ux * depois; bz = cz + uz * depois;
      } else {
        ax = (r() * 2 - 1) * 500; az = (r() * 2 - 1) * 500;
        const ang = r() * Math.PI * 2, L = 2 + r() * 40;
        bx = ax + Math.sin(ang) * L; bz = az + Math.cos(ang) * L;
      }
      const a = { x: ax, y: t.heightAt(ax, az) + r() * 5, z: az }, b = { x: bx, y: t.heightAt(bx, bz) + r() * 5, z: bz };
      const esperado = ancora(a, b);
      n++; if (esperado) barra++;
      if (q.segmentoBloqueado(a, b) !== esperado) { dif++; ex ||= { a, b, esperado }; }
      if (qSemGrade.segmentoBloqueado(a, b) !== esperado) difSemGrade++;
    }
    t0.diagnostic(`${n} segmentos, ${barra} barrados pela âncora; a consulta diverge em ${dif} (com a grade do relevo) e ${difSemGrade} (sem)`);
    assert.ok(barra > 800, `pré-condição: só ${barra} de ${n} segmentos passam por obstáculo`);
    // a âncora amostra a cada 1 cm: corda (ou folga sob o teto) menor que isso ela não vê
    assert.ok(dif <= n * 0.002, `${dif} de ${n} segmentos: a consulta diverge da âncora — ex.: ${JSON.stringify(ex)}`);
    assert.ok(difSemGrade <= n * 0.002, `${difSemGrade} de ${n} segmentos: a consulta sem grade diverge da âncora`);
  });

  it('`contem`: olho dentro do cilindro (abaixo do teto) sim; fora do raio ou acima de 3,4 m do chão, não', async () => {
    const { Ob, ob, t } = await obstaculosDe(424242);
    const q = Ob.criarConsultaObstaculos(ob.solidos, { heightAt: t.heightAt });
    const pedra = ob.solidos.find(o => o.sourceId === 'rock' && o.r > 1.5);
    const y = t.heightAt(pedra.x, pedra.z);
    assert.equal(q.contem({ x: pedra.x, y: y + 1.5, z: pedra.z }), true);
    assert.equal(q.contem({ x: pedra.x, y: y + 3.5, z: pedra.z }), false);
    assert.equal(q.contem({ x: pedra.x + pedra.r * Math.sqrt(0.8) + 0.01, y: y + 1.5, z: pedra.z }), false);
  });
});
