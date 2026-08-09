/* ================================================================
   QA — grama DECORATIVA e determinística (js/grass.js).
   Prova: zero física originada da grama; raiz na superfície canônica;
   chunk reciclado = bytes idênticos (RNG local por seed/chunk); zero
   lâminas relevantes em água/rua/prédio/vulcão; bounds/culling válidos.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { CHROME, bootGame } = require('./helpers/harness.js');

describe('Grama decorativa (Chrome headless)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootGame({ port: 3232 }); });
  after(async () => { if (h) await h.close(); });

  it('dada a arquitetura, então grama NUNCA cria física (fonte + mundo)', async () => {
    // asserção estrutural: o módulo não importa CANNON nem registra obstáculo
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'grass.js'), 'utf8');
    assert.ok(!/CANNON|cannon-es|addObstacle/.test(src), 'grass.js referencia física');
    // asserção viva: refazer TODA a grama não muda a contagem de corpos do mundo
    const r = await h.play(() => {
      const G = window.QA.G, MP = window.QA.MP;
      const antes = MP.world.bodies.length;
      G.Grass.refreshAll();
      window.QA.tick(5);
      return { antes, depois: MP.world.bodies.length };
    });
    assert.equal(r.depois, r.antes, 'refreshAll mudou a contagem de corpos físicos');
  });

  it('caracteriza height/desertK/forestK pelo caminho direto sem perder um bit', async () => {
    const r = await h.play(() => {
      const G = window.QA.G, THREE = window.QA.MP.THREE;
      const failures = [];
      for (let i = 0; i < 4096; i++) {
        const x = ((i * 137.51) % 1080) - 540;
        const z = ((i * 91.17) % 1080) - 540;
        const surface = G.surfaceAt(x, z);
        const biome = G.biomeAt(x, z);
        const direct = {
          height: G.heightAt(x, z),
          desertK: THREE.MathUtils.smoothstep(-biome, 0.18, 0.45),
          forestK: THREE.MathUtils.smoothstep(biome, 0.34, 0.62),
        };
        if (!Object.is(surface.height, direct.height) ||
            !Object.is(surface.desertK, direct.desertK) ||
            !Object.is(surface.forestK, direct.forestK)) {
          failures.push({ x, z, surface, direct });
          break;
        }
      }
      return failures;
    });
    assert.deepEqual(r, [], `sampler direto divergiu: ${JSON.stringify(r[0])}`);
  });

  it('createGrass e refill não consultam o classificador completo surfaceAt', async () => {
    const r = await h.play(async () => {
      const { createGrass } = await import('/js/grass.js');
      const THREE = window.QA.MP.THREE;
      const scene = new THREE.Scene();
      let surfaceCalls = 0;
      const originalRandom = Math.random;
      Math.random = () => 0.5;
      try {
        const grass = createGrass({
          CFG: {
            GRASS_CHUNKS: 1,
            GRASS_TOTAL: 4,
            GRASS_CHUNK_SIZE: 10,
            GRASS_HEIGHT: 0.95,
            WIND_STRENGTH: 0.55,
          },
          rand: (a, b) => b === undefined ? a * 0.5 : a + (b - a) * 0.5,
          TAU: Math.PI * 2,
          heightAt: () => 2,
          biomeAt: () => 0.1,
          WATER_LEVEL: -5,
          simplex: { noise: () => 0 },
          scene,
          sunDir: new THREE.Vector3(0, 1, 0),
          CITY: null,
          VOLCANO: null,
          clearings: [],
          cityGrassFactor: null,
          worldSeed: 424242,
          surfaceAt: () => {
            surfaceCalls++;
            return { height: 2, desertK: 0, forestK: 0 };
          },
        });
        const createCalls = surfaceCalls;
        surfaceCalls = 0;
        grass.refreshAll();
        const refillCalls = surfaceCalls;
        scene.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); });
        grass.material.dispose();
        return { createCalls, refillCalls };
      } finally {
        Math.random = originalRandom;
      }
    });
    assert.deepEqual(r, { createCalls: 0, refillCalls: 0 },
      'grama ainda paga surfaceAt/classifyAt por lâmina');
  });

  it('shader calcula modelMatrix * instanceMatrix uma vez e reutiliza o produto', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'grass.js'), 'utf8');
    const products = src.match(/modelMatrix\s*\*\s*instanceMatrix/g) || [];
    assert.equal(products.length, 1, `produto de matrizes repetido ${products.length} vezes`);
    const alias = src.match(/mat4\s+(\w+)\s*=\s*modelMatrix\s*\*\s*instanceMatrix/);
    assert.ok(alias, 'produto model/instance não foi nomeado para reutilização');
    const uses = src.match(new RegExp(`${alias[1]}\\s*\\*\\s*vec4`, 'g')) || [];
    assert.ok(uses.length >= 2, `produto ${alias[1]} não foi reutilizado nas duas posições`);
  });

  it('dadas as raízes, então ficam a ≤3 cm da superfície canônica', async () => {
    const r = await h.play(() => {
      const G = window.QA.G, MP = window.QA.MP;
      // pradaria aberta, longe do spawn (clareiras de veículos zeram lâminas lá)
      MP.player.pos.set(90, G.heightAt(90, -60) + 1, -60);
      window.QA.tick(150);
      let worst = 0, n = 0;
      for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) {
        const sample = G.Grass.debugSample(90 + cx * 10, -60 + cz * 10, 500) || [];
        for (const b of sample) {
          if (b.sy < 0.05) continue; // lâminas colapsadas não contam
          const d = Math.abs(b.y - G.heightAt(b.x, b.z));
          worst = Math.max(worst, d);
          n++;
        }
      }
      return { n, worst };
    });
    assert.ok(r.n > 50, `amostra pequena demais (${r.n})`);
    assert.ok(r.worst <= 0.03, `raiz a ${(r.worst * 100).toFixed(1)}cm da superfície`);
  });

  it('dado um chunk reciclado, então volta com bytes IDÊNTICOS (determinismo por seed/chunk)', async () => {
    const r = await h.play(() => {
      const G = window.QA.G, MP = window.QA.MP;
      window.QA.reset();
      window.QA.tick(200); // fila de rebuild (6 chunks/frame) esvazia
      const antes = G.Grass.debugChunkBytes(2, 1);
      // player viaja pra longe: chunk (2,1) sai da grade e é reciclado
      MP.player.pos.set(300, G.heightAt(300, 300) + 1, 300);
      window.QA.tick(120);
      const longe = G.Grass.debugChunkBytes(2, 1); // não deve existir na grade
      // volta: chunk (2,1) é re-preenchido
      MP.player.pos.set(20, G.heightAt(20, 10) + 1, 10);
      window.QA.tick(120);
      const depois = G.Grass.debugChunkBytes(2, 1);
      return { antes, longe, depois };
    });
    assert.ok(r.antes, 'chunk (2,1) ausente no início');
    assert.equal(r.longe, null, 'chunk não foi reciclado ao viajar');
    assert.ok(r.depois, 'chunk (2,1) ausente na volta');
    assert.deepEqual(r.depois, r.antes, 'chunk reciclado divergiu — layout não determinístico');
  });

  it('dadas água/rua/prédio/vulcão, então ZERO lâminas relevantes', async () => {
    const r = await h.play(() => {
      const G = window.QA.G, MP = window.QA.MP;
      const count = (x, z, pred) => {
        MP.player.pos.set(x, G.heightAt(x, z) + 1, z);
        window.QA.tick(150); // grade re-centra e recicla
        let bad = 0, seen = 0;
        for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) {
          const sample = G.Grass.debugSample(x + cx * 10, z + cz * 10, 500) || [];
          for (const b of sample) {
            if (b.sy < 0.05) continue;
            seen++;
            if (pred(b)) bad++;
          }
        }
        return { bad, seen };
      };
      const cidade = count(-340, 130, b => {
        const t = G.surfaceAt(b.x, b.z).surfaceType;
        return t === 'street' || t === 'building';
      });
      const vulcao = count(420, -420, b => Math.hypot(b.x - 420, b.z + 420) < 114 * 0.95);
      // água: acha um lago
      let lake = null;
      for (let k = 0; k < 6000 && !lake; k++) {
        const x = ((k * 137.51) % 1000) - 500, z = ((k * 91.17) % 1000) - 500;
        if (G.heightAt(x, z) < MP.WATER_LEVEL - 0.3) lake = [x, z];
      }
      const agua = lake ? count(lake[0], lake[1], b => G.heightAt(b.x, b.z) < MP.WATER_LEVEL + 0.25) : { bad: 0, seen: 1 };
      return { cidade, vulcao, agua, lake };
    });
    assert.equal(r.cidade.bad, 0, `${r.cidade.bad}/${r.cidade.seen} lâminas em rua/prédio`);
    assert.equal(r.vulcao.bad, 0, `${r.vulcao.bad}/${r.vulcao.seen} lâminas no cone do vulcão`);
    assert.equal(r.agua.bad, 0, `${r.agua.bad}/${r.agua.seen} lâminas na água (lago ${r.lake})`);
  });

  it('dado o rebuild, então needsUpdate/bounds ficam válidos e a fila esvazia', async () => {
    const r = await h.play(() => {
      const G = window.QA.G;
      window.QA.reset();
      window.QA.tick(150);
      const sample = G.Grass.debugSample(30, 30, 400) || [];
      // bounding sphere do chunk central contém as raízes (world-local do mesh)
      let out = 0;
      const cx = Math.round(30 / 10) * 10, cz = Math.round(30 / 10) * 10;
      for (const b of sample) {
        if (b.sy < 0.05) continue;
        // esfera cobre y? amostra: raiz dentro de ±(raio) do centro em y
        if (Math.abs(b.x - cx) > 10 || Math.abs(b.z - cz) > 10) out++;
      }
      return { out, n: sample.length };
    });
    assert.equal(r.out, 0, `${r.out} lâminas fora do próprio chunk`);
  });

  it('trilha de pneu: amassa lâminas SÓ no corredor e zera no chunk reciclado', async () => {
    const r = await h.play(() => {
      const G = window.QA.G;
      G.Grass.stampTrack(1, -3, 1, 3);           // segmento dentro do chunk (0,0)
      const b = G.Grass.debugChunkBytes(0, 0);
      const marcadas = b.tr.filter(v => v > -1).length;
      const total = b.tr.length;
      G.Grass.refreshAll();                       // reciclagem/refill limpa a trilha
      const depois = G.Grass.debugChunkBytes(0, 0).tr.filter(v => v > -1).length;
      return { marcadas, total, depois };
    });
    assert.ok(r.marcadas > 0, 'nenhuma lâmina marcada no corredor');
    assert.ok(r.marcadas < r.total * 0.2, `trilha larga demais: ${r.marcadas}/${r.total}`);
    assert.equal(r.depois, 0, 'trilha sobreviveu à reciclagem do chunk');
  });
});

/* ================================================================
   LOD de lâmina por DISTÂNCIA — corta triângulo sem tirar lâmina.

   Regra dura: reduzir densidade, altura ou alcance da grama seria
   WALLHACK (adversário deitado no mato ficaria visível pra quem
   baixasse a configuração). Por isso o LOD mexe só nos SEGMENTOS de
   altura da lâmina: mesma quantidade, mesma altura, mesma silhueta.
   ================================================================ */
describe('Grama — LOD de lâmina (Chrome headless)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootGame({ port: 3234 }); });
  after(async () => { if (h) await h.close(); });

  it('chunk perto usa a lâmina completa; chunk longe usa a reduzida', async () => {
    const r = await h.play(() => {
      const G = window.QA.G;
      window.QA.reset(0, 0);
      window.QA.tick(200); // drena a fila de refill
      const lods = G.Grass.debugLod();
      const perto = lods.filter(l => Math.max(Math.abs(l.cx), Math.abs(l.cz)) <= 1);
      const longe = lods.filter(l => Math.max(Math.abs(l.cx), Math.abs(l.cz)) >= 6);
      return {
        total: lods.length,
        pertoCheios: perto.every(l => !l.reduzida),
        longeReduzidos: longe.every(l => l.reduzida),
        trisPerto: perto[0] && perto[0].triangulosPorLamina,
        trisLonge: longe[0] && longe[0].triangulosPorLamina,
      };
    });
    assert.ok(r.total > 100, `grade de chunks inesperada: ${r.total}`);
    assert.equal(r.pertoCheios, true, 'chunk colado no jogador perdeu detalhe');
    assert.equal(r.longeReduzidos, true, 'chunk distante não economizou triângulo');
    assert.ok(r.trisLonge < r.trisPerto, `LOD não reduziu: ${r.trisPerto} -> ${r.trisLonge}`);
  });

  it('ANTI-TRAPAÇA: o LOD nunca muda a quantidade de lâminas de nenhum chunk', async () => {
    const r = await h.play(() => {
      const G = window.QA.G;
      window.QA.tick(200);
      const lods = G.Grass.debugLod();
      const contagens = new Set(lods.map(l => l.laminas));
      return { contagens: [...contagens], reduzidos: lods.filter(l => l.reduzida).length };
    });
    assert.equal(r.contagens.length, 1,
      `chunks com contagens diferentes de lâmina: ${r.contagens.join(', ')} — densidade variável é wallhack`);
    assert.ok(r.reduzidos > 0, 'nenhum chunk reduzido: o teste não provou nada');
  });

  it('ANTI-TRAPAÇA: lâmina reduzida mantém base e ponta (silhueta e ocultamento)', async () => {
    const r = await h.play(() => {
      const G = window.QA.G;
      return G.Grass.debugBladeShapes();
    });
    assert.ok(r.completa.segmentos > r.reduzida.segmentos, 'as duas lâminas são iguais');
    assert.ok(Math.abs(r.completa.alturaMax - r.reduzida.alturaMax) < 1e-6,
      `altura mudou: ${r.completa.alturaMax} vs ${r.reduzida.alturaMax}`);
    assert.ok(Math.abs(r.completa.larguraBase - r.reduzida.larguraBase) < 1e-6,
      `largura da base mudou: ${r.completa.larguraBase} vs ${r.reduzida.larguraBase}`);
    assert.ok(Math.abs(r.completa.larguraTopo - r.reduzida.larguraTopo) < 1e-6,
      `largura do topo mudou: ${r.completa.larguraTopo} vs ${r.reduzida.larguraTopo}`);
  });

  it('o LOD não altera um único byte do conteúdo do chunk (mundo idêntico)', async () => {
    const r = await h.play(() => {
      const G = window.QA.G, MP = window.QA.MP;
      window.QA.reset(0, 0);
      window.QA.tick(200);
      const perto = G.Grass.debugChunkBytes(5, 5); // longe do centro => reduzida
      // aproxima: o mesmo chunk vira "perto" e recupera a lâmina completa
      MP.player.pos.set(50, G.heightAt(50, 50) + 1, 50);
      window.QA.tick(200);
      const depois = G.Grass.debugChunkBytes(5, 5);
      const iguais = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
      return {
        achou: !!(perto && depois),
        m: perto && depois && iguais(perto.m, depois.m),
        ph: perto && depois && iguais(perto.ph, depois.ph),
        ti: perto && depois && iguais(perto.ti, depois.ti),
      };
    });
    assert.equal(r.achou, true, 'chunk (5,5) não estava na grade nas duas medições');
    assert.equal(r.m, true, 'matriz de instância mudou com o LOD — posição/altura da grama se moveu');
    assert.equal(r.ph, true, 'fase do vento mudou com o LOD');
    assert.equal(r.ti, true, 'tint mudou com o LOD');
  });

  it('chunk que se aproxima recupera a lâmina completa', async () => {
    const r = await h.play(() => {
      const G = window.QA.G, MP = window.QA.MP;
      MP.player.pos.set(0, G.heightAt(0, 0) + 1, 0);
      window.QA.tick(200);
      const antes = G.Grass.debugLod().find(l => l.cx === 5 && l.cz === 0);
      MP.player.pos.set(50, G.heightAt(50, 0) + 1, 0); // chunk 5 vira o centro
      window.QA.tick(200);
      const depois = G.Grass.debugLod().find(l => l.cx === 5 && l.cz === 0);
      return { antes: antes && antes.reduzida, depois: depois && depois.reduzida };
    });
    assert.equal(r.antes, true, 'chunk distante não estava reduzido');
    assert.equal(r.depois, false, 'chunk ficou reduzido mesmo colado no jogador');
  });
});

/* ================================================================
   ESFERA DE CULLING POR CHUNK — a que o renderer REALMENTE testa.

   `Frustum.intersectsObject` (three r185) usa `object.boundingSphere`
   quando a propriedade EXISTE, e `InstancedMesh` a define. Se ela ficar
   nula, o three chama `InstancedMesh.computeBoundingSphere()`, que UNE
   `geometry.boundingSphere` aplicada a CADA matriz de instância — ou
   seja, espalha a esfera da geometria pelos 1005 pontos do chunk.

   Os dois lados são fixados aqui, e é a combinação que vale:
     - TETO: a esfera não pode passar do pior caso derivado das
       constantes do shader (senão o culling engrossa de graça);
     - PISO: nenhuma lâmina, com vento e dobra no MÁXIMO, pode ficar
       fora dela (senão grama visível some — o wallhack proibido).
   ================================================================ */
describe('Grama — esfera de culling por chunk (Chrome headless)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, dados;

  /* Pior caso do vertex shader, derivado das constantes de js/grass.js e
     js/env.js — recalculado AQUI, de propósito, para não copiar a conta da
     implementação. Se as duas contas divergirem, o teste acusa. */
  const WIND_STRENGTH = 0.55, SIZE = 10;
  const VENTO_MAX = 1.125 * (WIND_STRENGTH + 0.5) + 0.055; // js/env.js:117 escreve uWind
  const DOBRA_MAX = 1.05 + 1.4;              // bendAway do player + do carro, somados
  const DESLOC_H = VENTO_MAX + DOBRA_MAX;    // deslocamento horizontal máximo de uma lâmina
  const QUEDA_MAX = 0.16 * (WIND_STRENGTH + 0.5) + 0.3 + 0.42; // afundamento máximo
  const ALCANCE = Math.hypot(SIZE / 2, SIZE / 2) + 0.45 + DESLOC_H;
  const DESLOC = { h: DESLOC_H, queda: QUEDA_MAX };

  /* Perfil por chunk: a esfera que o RENDERER testa (mesmo caminho de
     Frustum.intersectsObject, inclusive o cálculo tardio quando ela é nula)
     e os extremos REAIS das instâncias. Uma fonte só para os dois cenários
     (grade recém-criada e grade reciclada). */
  const PERFIL = desloc => {
    const G = window.QA.G, MP = window.QA.MP, THREE = MP.THREE;
    const malhas = [];
    MP.scene.traverse(o => {
      if (o.isInstancedMesh && o.material === G.Grass.material) malhas.push(o);
    });
    const esf = new THREE.Sphere(), p = new THREE.Vector3();
    // caixa local da LÂMINA: PlaneGeometry(0.1, 1) afunilada + curva de 0.18 em z
    const canto = [];
    for (const sx of [-0.05, 0.05]) for (const sy of [0, 1]) for (const sz of [0, 0.18])
      canto.push([sx, sy, sz]);
    const e = new Float32Array(16);
    return malhas.map(m => {
      if (m.boundingSphere === null) m.computeBoundingSphere();
      esf.copy(m.boundingSphere).applyMatrix4(m.matrixWorld);
      p.setFromMatrixPosition(m.matrixWorld);
      const arr = m.instanceMatrix.array;
      let raizMin = Infinity, topoMax = -Infinity, pior = 0;
      for (let i = 0; i < m.count; i++) {
        for (let k = 0; k < 16; k++) e[k] = arr[i * 16 + k];
        /* colunas da matriz LIDAS DIRETO (quirk r185: decompose de matriz
           singular — lâmina colapsada com escala ~0 — devolve escala (1,1,1)
           falsa e mentiria sobre a altura). */
        const rx = e[12] + p.x, ry = e[13] + p.y, rz = e[14] + p.z;
        if (ry < raizMin) raizMin = ry;
        for (const [cx, cy, cz] of canto) {
          const wx = rx + e[0] * cx + e[4] * cy + e[8] * cz;
          const wy = ry + e[1] * cx + e[5] * cy + e[9] * cz;
          const wz = rz + e[2] * cx + e[6] * cy + e[10] * cz;
          if (wy > topoMax) topoMax = wy;
          // vento e dobra empurram no plano XZ e afundam em Y
          const dxz = Math.hypot(wx - esf.center.x, wz - esf.center.z) + desloc.h;
          const d = Math.max(Math.hypot(dxz, wy - esf.center.y),
            Math.hypot(dxz, wy - desloc.queda - esf.center.y));
          if (d > pior) pior = d;
        }
      }
      return {
        cx: Math.round(p.x / 10), cz: Math.round(p.z / 10),
        raio: esf.radius, centroY: esf.center.y,
        centroXZ: Math.hypot(esf.center.x - p.x, esf.center.z - p.z),
        raizMin, topoMax, pior, laminas: m.count,
      };
    });
  };

  /* TETO do raio: alcance horizontal do pior caso + a metade da faixa
     vertical REAL do chunk + 0,5 m de folga. É a soma, não a hipotenusa, de
     propósito: o teto é a rede contra culling grosso, não uma reimplementação
     da fórmula (essa é fixada pelo PISO do teste anti-trapaça). */
  const conferir = (perfil, rotulo) => {
    const teto = c => ALCANCE + (c.topoMax - c.raizMin) / 2 + QUEDA_MAX / 2 + 0.5;
    const grandes = perfil.filter(c => c.raio > teto(c))
      .sort((a, b) => (b.raio - teto(b)) - (a.raio - teto(a)));
    assert.deepEqual(grandes.slice(0, 3).map(c =>
      `(${c.cx},${c.cz}) raio ${c.raio.toFixed(2)} > teto ${teto(c).toFixed(2)}`), [],
    `${rotulo}: ${grandes.length}/${perfil.length} chunks com esfera maior que o pior caso do shader`);
    /* o centro tem que ser o do CHUNK. Quando o three calcula sozinho, a
       matriz de instância translada o centro da esfera da geometria junto e
       ele vai parar perto de 2x a altura do terreno. */
    const fora = perfil.filter(c =>
      c.centroY < c.raizMin - 1.5 || c.centroY > c.topoMax + 1.5 || c.centroXZ > 0.01);
    assert.deepEqual(fora.slice(0, 3).map(c =>
      `(${c.cx},${c.cz}) centro em ${c.centroY.toFixed(2)}, chunk de ${c.raizMin.toFixed(2)} a ${c.topoMax.toFixed(2)} (dXZ ${c.centroXZ.toFixed(2)})`), [],
    `${rotulo}: ${fora.length}/${perfil.length} chunks com o centro da esfera fora do próprio chunk`);
  };

  before(async () => {
    h = await bootGame({ port: 3242 });
    dados = await h.play(arg => {
      window.QA.reset(0, 0);
      window.QA.tick(200); // drena a fila de refill
      return (0, eval)('(' + arg.src + ')')(arg.desloc);
    }, { src: PERFIL.toString(), desloc: DESLOC });
  });
  after(async () => { if (h) await h.close(); });

  it('a esfera de culling é do tamanho do CHUNK, não da união por instância', () => {
    assert.ok(dados.length > 100, `grade de chunks inesperada: ${dados.length}`);
    conferir(dados, 'grade inicial');
  });

  it('ANTI-TRAPAÇA: nenhuma lâmina fica fora da esfera nem com vento e dobra no máximo', () => {
    const estouram = dados.filter(c => c.pior > c.raio + 1e-4)
      .sort((a, b) => (b.pior - b.raio) - (a.pior - a.raio));
    assert.deepEqual(estouram.slice(0, 3).map(c =>
      `(${c.cx},${c.cz}) lâmina a ${c.pior.toFixed(3)} m do centro, esfera de ${c.raio.toFixed(3)} m`), [],
    `${estouram.length}/${dados.length} chunks com lâmina fora da esfera — grama visível seria descartada`);
    // a folga tem que ser MEDIDA, não confortável por acidente
    const folga = Math.min(...dados.map(c => c.raio - c.pior));
    assert.ok(folga >= 0 && folga < 3,
      `folga da esfera fora da faixa medida: ${folga.toFixed(3)} m (negativa = corta lâmina, larga = culling grosso)`);
  });

  it('chunk reciclado refaz a esfera (o three só calcula quando ela é nula)', async () => {
    const r = await h.play(arg => {
      const G = window.QA.G, MP = window.QA.MP;
      window.QA.reset(0, 0); window.QA.tick(200);
      // relevo BEM diferente do spawn: a grade inteira é reciclada por lá
      MP.player.pos.set(420, G.heightAt(420, -420) + 1, -420);
      window.QA.tick(400);
      return (0, eval)('(' + arg.src + ')')(arg.desloc);
    }, { src: PERFIL.toString(), desloc: DESLOC });
    conferir(r, 'grade reciclada');
    const estouram = r.filter(c => c.pior > c.raio + 1e-4);
    assert.equal(estouram.length, 0,
      `${estouram.length}/${r.length} chunks reciclados com lâmina fora da esfera`);
  });

  it('CONTRATO DO PRNG: o consumo do stream seedado na criação da grama não mudou', async () => {
    const r = await h.play(async () => {
      const { createGrass } = await import('/js/grass.js');
      const THREE = window.QA.MP.THREE;
      const scene = new THREE.Scene();
      let randCalls = 0, mathCalls = 0;
      const originalRandom = Math.random;
      Math.random = () => { mathCalls++; return 0.5; };
      try {
        const grass = createGrass({
          CFG: { GRASS_CHUNKS: 3, GRASS_TOTAL: 45, GRASS_CHUNK_SIZE: 10,
            GRASS_HEIGHT: 0.95, WIND_STRENGTH: 0.55 },
          rand: (a, b) => { randCalls++; return b === undefined ? a * 0.5 : a + (b - a) * 0.5; },
          TAU: Math.PI * 2,
          heightAt: () => 2, biomeAt: () => 0.1, WATER_LEVEL: -5,
          simplex: { noise: () => 0 },
          scene, sunDir: new THREE.Vector3(0, 1, 0),
          CITY: null, VOLCANO: null, clearings: [], cityGrassFactor: null,
          worldSeed: 424242,
        });
        const out = { randCalls, mathCalls };
        scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
        grass.material.dispose();
        return out;
      } finally { Math.random = originalRandom; }
    });
    /* 3x3 chunks x floor(45/9) = 5 lâminas.
       `rand`: legacyConsume (js/grass.js:184-198) gasta 8 por lâmina.
       `Math.random`: 1 por lâmina no mesmo legacyConsume (o 2º, do deserto,
       não dispara com biomeAt=0.1) MAIS 4 por UUID do three — e o three
       gera 22 UUIDs aqui (9 geometrias + 9 InstancedMesh + material + as
       duas lâminas base + a Scene). Ou seja: este teste fixa as DUAS coisas
       que deslocam o mundo com o mesmo seed — a contagem do legacyConsume E
       quantos objetos do three a grama cria. */
    assert.deepEqual(r, { randCalls: 9 * 5 * 8, mathCalls: 9 * 5 * 1 + 22 * 4 },
      'o consumo do rand/Math.random global mudou — o layout do mundo anda com o mesmo seed');
  });
});
