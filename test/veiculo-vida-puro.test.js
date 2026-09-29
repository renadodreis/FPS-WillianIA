/* ================================================================
   VEÍCULO COM VIDA — o núcleo PURO (js/veiculo-vida.js).

   Decisão do dono (2026-09-28): "carro pode segurar tiro, mas não...
   pra sempre!!". O veículo passa a ser SÓLIDO para bala e visada enquanto
   tem vida, e deixa de ser quando ela acaba. Este núcleo é a regra única
   que o cliente (três caminhos do tiro + a vítima), o servidor e os bots
   aplicam — sem THREE, sem DOM, sem Math.random.

   Âncoras INDEPENDENTES do código sob teste:
     • a interseção raio × caixa girada é conferida contra uma MARCHA de
       1 mm com ponto-dentro-da-caixa escrito aqui (outra conta, não a do
       módulo), em raios sorteados;
     • o giro é conferido contra a convenção do js/car.js (createPhysics:
       `x + wx·cos(ry) + wz·sin(ry)`, `z − wx·sin(ry) + wz·cos(ry)`) —
       escrita à mão aqui, não importada;
     • a frota por semente é conferida contra as vagas LITERAIS do
       js/structures.js (lidas do fonte), e a paridade com o jogo rodando
       fica em test/veiculo-vida-jogo.test.js.
   Docs: docs/mobile/referencia-veiculos.md.
   ================================================================ */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const JS = path.join(__dirname, '..', 'js');
const importar = f => import(url.pathToFileURL(path.join(JS, f)).href);
const VV = () => importar('veiculo-vida.js');

/* mulberry32 local — o teste não depende do servidor para sortear */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ponto do MUNDO dentro da caixa local de um veículo com giro `ry` —
   conta própria: leva o ponto para o referencial do chassi pela inversa da
   convenção do js/car.js */
function dentroDaCaixaLocal(p, pose, caixa) {
  const dx = p.x - pose.x, dz = p.z - pose.z, c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  const lx = dx * c - dz * s, lz = dx * s + dz * c, ly = p.y - pose.y;
  return lx > caixa.min[0] && lx < caixa.max[0] && ly > caixa.min[1] && ly < caixa.max[1] &&
    lz > caixa.min[2] && lz < caixa.max[2];
}
/* marcha de 1 mm: primeira distância em que o raio está dentro de alguma
   caixa do tipo — ignora a caixa em que a origem já nasce */
function marcha(o, d, maxDist, pose, tipo) {
  const dentroNaOrigem = tipo.caixas.map(cx => dentroDaCaixaLocal(o, pose, cx));
  for (let t = 0.001; t < maxDist; t += 0.001) {
    const p = { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t };
    for (let i = 0; i < tipo.caixas.length; i++)
      if (!dentroNaOrigem[i] && dentroDaCaixaLocal(p, pose, tipo.caixas[i])) return t;
  }
  return Infinity;
}

describe('veiculo-vida.js é dado puro', () => {
  it('o grafo de import só tem módulos relativos do jogo, sem pacote, DOM, THREE nem Math.random', () => {
    const vistos = new Set();
    const pendentes = ['veiculo-vida.js'];
    while (pendentes.length) {
      const f = pendentes.pop();
      if (vistos.has(f)) continue;
      vistos.add(f);
      const src = fs.readFileSync(path.join(JS, f), 'utf8');
      const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const m of codigo.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)) {
        assert.ok(m[1].startsWith('./'), `${f} importa o pacote "${m[1]}" — servidor e bots não podem depender disso`);
        pendentes.push(path.normalize(m[1]));
      }
      for (const proibido of [/\bdocument\s*[.[]/, /\bwindow\s*[.[]/, /\bTHREE\s*\./, /Math\.random\s*\(/])
        assert.ok(!proibido.test(codigo), `${f} usa ${proibido}`);
    }
  });
});

describe('raio × veículo (a caixa girada que segura a bala)', () => {
  it('bate com a marcha de 1 mm em 400 raios sorteados, com giro, nos quatro tipos', async () => {
    const V = await VV();
    const r = rng(0xC4A0);
    let acertos = 0, pior = 0;
    for (let i = 0; i < 400; i++) {
      const nome = Object.keys(V.TIPOS)[i % 4];
      const tipo = V.TIPOS[nome];
      const pose = { x: (r() - 0.5) * 20, y: (r() - 0.5) * 4, z: (r() - 0.5) * 20, yaw: (r() - 0.5) * 2 * Math.PI };
      // origem a 3–12 m, mirando perto do veículo (metade acerta)
      const ang = r() * Math.PI * 2, dist = 3 + r() * 9;
      const o = { x: pose.x + Math.cos(ang) * dist, y: pose.y + (r() - 0.3) * 3, z: pose.z + Math.sin(ang) * dist };
      const alvo = { x: pose.x + (r() - 0.5) * 6, y: pose.y + (r() - 0.3) * 2.5, z: pose.z + (r() - 0.5) * 6 };
      let d = { x: alvo.x - o.x, y: alvo.y - o.y, z: alvo.z - o.z };
      const L = Math.hypot(d.x, d.y, d.z); d = { x: d.x / L, y: d.y / L, z: d.z / L };
      const esperado = marcha(o, d, 20, pose, tipo);
      const obtido = V.raioNoVeiculo(o, d, 20, pose, nome);
      if (esperado === Infinity) { assert.equal(obtido, Infinity, `raio ${i} (${nome}) acertou ${obtido} onde a marcha não acha nada`); continue; }
      acertos++;
      pior = Math.max(pior, Math.abs(obtido - esperado));
      assert.ok(Math.abs(obtido - esperado) < 0.0015, `raio ${i} (${nome}): módulo ${obtido.toFixed(4)} × marcha ${esperado.toFixed(4)}`);
    }
    assert.ok(acertos > 120, `poucos raios exercitaram a caixa (${acertos}) — o cenário não mede nada`);
  });

  it('o giro segue a convenção do js/car.js: +X do chassi é a frente, ry gira no sentido do three', async () => {
    const V = await VV();
    const cx = V.TIPOS.caminhao.caixas[0];
    // caminhão em (0,0,0) girado 90°: pela convenção do car.js, o +X local
    // vai para −Z no mundo — a frente dele aponta para −Z
    const pose = { x: 0, y: 0, z: 0, yaw: Math.PI / 2 };
    const yMeio = (cx.min[1] + cx.max[1]) / 2;
    // vindo de −Z em direção a +Z, bate na FRENTE (lx máximo)
    const t = V.raioNoVeiculo({ x: 0, y: yMeio, z: -20 }, { x: 0, y: 0, z: 1 }, 40, pose, 'caminhao');
    assert.ok(Math.abs(t - (20 - cx.max[0])) < 1e-9, `frente do caminhão girado 90° a ${(20 - t).toFixed(3)} m do centro (esperado ${cx.max[0]})`);
    // de lado (vindo de +X), bate no FLANCO (|lz| máximo)
    const t2 = V.raioNoVeiculo({ x: 20, y: yMeio, z: 0 }, { x: -1, y: 0, z: 0 }, 40, pose, 'caminhao');
    assert.ok(Math.abs(t2 - (20 - cx.max[2])) < 1e-9, `flanco a ${(20 - t2).toFixed(3)} m (esperado ${cx.max[2]})`);
  });

  it('quaternion de giro puro em Y dá o MESMO resultado que o yaw (o cliente usa a pose inteira)', async () => {
    const V = await VV();
    const r = rng(77);
    for (let i = 0; i < 100; i++) {
      const yaw = (r() - 0.5) * 6;
      const q = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
      const base = { x: r() * 4, y: r(), z: r() * 4 };
      const o = { x: base.x + 9, y: base.y + 0.3, z: base.z - 2 };
      let d = { x: -1, y: (r() - 0.5) * 0.1, z: (r() - 0.5) * 0.8 };
      const L = Math.hypot(d.x, d.y, d.z); d = { x: d.x / L, y: d.y / L, z: d.z / L };
      const a = V.raioNoVeiculo(o, d, 30, { ...base, yaw }, 'esportivo');
      const b = V.raioNoVeiculo(o, d, 30, { ...base, q }, 'esportivo');
      assert.ok(a === b || Math.abs(a - b) < 1e-9, `yaw ${a} × quaternion ${b}`);
    }
  });

  it('raio que NASCE dentro da caixa não é barrado por ela (a mesma regra do Structures.rayHit)', async () => {
    const V = await VV();
    const pose = { x: 0, y: 0, z: 0, yaw: 0.3 };
    const t = V.raioNoVeiculo({ x: 0, y: 0.2, z: 0 }, { x: 1, y: 0, z: 0 }, 30, pose, 'caminhao');
    assert.equal(t, Infinity);
  });

  it('na frota: só veículo INTEIRO barra; `ignorar` tira um da conta; o mais perto vence', async () => {
    const V = await VV();
    const y = 0.2;
    const a = { id: 0, tipo: 'buggy', inteiro: true, pose: { x: 10, y: 0, z: 0, yaw: 0 } };
    const b = { id: 1, tipo: 'caminhao', inteiro: true, pose: { x: 20, y: 0, z: 0, yaw: 0 } };
    const o = { x: 0, y, z: 0 }, d = { x: 1, y: 0, z: 0 };
    let h = V.raioNaFrota(o, d, 100, [b, a]);
    assert.equal(h.alvo, a, 'o mais perto não venceu');
    assert.ok(Math.abs(h.t - (10 - V.TIPOS.buggy.caixas[0].max[0])) < 1e-9);
    h = V.raioNaFrota(o, d, 100, [a, b], a);
    assert.equal(h.alvo, b, '`ignorar` não tirou o buggy da conta');
    a.inteiro = false;
    h = V.raioNaFrota(o, d, 100, [a, b]);
    assert.equal(h.alvo, b, 'veículo sem vida continuou segurando bala');
    b.inteiro = false;
    assert.equal(V.raioNaFrota(o, d, 100, [a, b]), null, 'frota inteira destruída ainda barra');
    // o teto de distância vale: o caminhão está além dos 15 m
    b.inteiro = true;
    assert.equal(V.raioNaFrota(o, d, 15, [a, b]), null);
  });

  it('distância do ponto à lataria: 0 dentro, a folga certa fora', async () => {
    const V = await VV();
    const pose = { x: 0, y: 0, z: 0, yaw: 0 };
    const cx = V.TIPOS.esportivo.caixas[0];
    assert.equal(V.distanciaAoVeiculo({ x: 0, y: (cx.min[1] + cx.max[1]) / 2, z: 0 }, pose, 'esportivo'), 0);
    const d = V.distanciaAoVeiculo({ x: cx.max[0] + 3, y: (cx.min[1] + cx.max[1]) / 2, z: 0 }, pose, 'esportivo');
    assert.ok(Math.abs(d - 3) < 1e-9, `3 m à frente mediu ${d}`);
  });
});

describe('vida e dano (quantos tiros até parar de proteger)', () => {
  it('fuzil: buggy 30, esportivo 45, caminhão 68, helicóptero 84 tiros — a escala do PUBG (30/45/49) e do Fortnite (sedã 800, caminhão 1 200, Choppa 1 500)', async () => {
    const V = await VV();
    const tiros = (tipo, arma) => Math.ceil(V.TIPOS[tipo].vida / V.DANO_BALA_MAX[arma]);
    assert.deepEqual(['buggy', 'esportivo', 'caminhao', 'heli'].map(t => tiros(t, 'FUZIL')), [30, 45, 68, 84]);
  });

  it('bazuca direta: buggy num tiro, esportivo e caminhão em dois, helicóptero em três (Panzerfaust do PUBG)', async () => {
    const V = await VV();
    const n = tipo => Math.ceil(V.TIPOS[tipo].vida / V.danoExplosivoNoVeiculo('BAZUCA', V.EXPLOSIVO_MAX));
    assert.deepEqual(['buggy', 'esportivo', 'caminhao', 'heli'].map(n), [1, 2, 2, 3]);
  });

  it('explosivo desconhecido não fere veículo; dano negativo, NaN e acima do teto são limitados', async () => {
    const V = await VV();
    assert.equal(V.danoExplosivoNoVeiculo('MISSIL', 130), 0);
    assert.equal(V.danoExplosivoNoVeiculo('GRANADA', -5), 0);
    assert.equal(V.danoExplosivoNoVeiculo('GRANADA', NaN), 0);
    assert.equal(V.danoExplosivoNoVeiculo('BAZUCA', 10000), V.danoExplosivoNoVeiculo('BAZUCA', V.EXPLOSIVO_MAX));
    assert.equal(V.danoDeBalaNoVeiculo('FACA', 34), 0, 'faca não fura lataria');
    assert.equal(V.danoDeBalaNoVeiculo('FUZIL', 999), 26);
    assert.equal(V.danoDeBalaNoVeiculo('FUZIL', 'x'), 0);
  });

  it('a explosão do veículo destruído fere perto e zera fora do raio, decrescendo', async () => {
    const V = await VV();
    const E = V.EXPLOSAO;
    let ant = Infinity;
    for (let d = 0; d <= E.raio + 2; d += 0.5) {
      const x = V.danoDaExplosaoDoVeiculo(d);
      assert.ok(x <= ant, `a ${d} m cresceu (${x} > ${ant})`);
      if (d >= E.raio) assert.equal(x, 0, `a ${d} m ainda fere`);
      ant = x;
    }
    assert.ok(V.danoDaExplosaoDoVeiculo(0) >= 100, 'em cima do veículo tem de ser letal para quem está sem colete');
  });
});

describe('frota por semente (o servidor e os bots sabem onde cada veículo nasce)', () => {
  it('ordem e vagas iguais às do js/structures.js (buggy, 3 esportivos na cidade, 1 caminhão por base) + o helicóptero no topo da Torre Nexus', async () => {
    const V = await VV();
    const src = fs.readFileSync(path.join(JS, 'structures.js'), 'utf8');
    // âncora: as vagas LITERAIS do desenho (se alguém mexer lá, isto grita)
    for (const lit of ["carSpots.push({ x: cx + 14, z: cz + 26, ry: 0, type: 'sport' })",
      "carSpots.push({ x: cx - 8, z: cz + 26, ry: Math.PI, type: 'sport2' })",
      "carSpots.push({ x: cx + 26, z: cz - 16, ry: -Math.PI / 2, type: 'sport' })",
      "carSpots.push({ x: cx, z: cz - 4, ry: b.caminhaoRy, type: 'truck' })"])
      assert.ok(src.includes(lit), `vaga mudou no js/structures.js: ${lit}`);
    assert.ok(fs.readFileSync(path.join(JS, 'car.js'), 'utf8').includes('makeVehicle(CFG_BUGGY, 7.5, -6)'), 'o buggy mudou de lugar');
    const plano = {
      cidade: { x: -340, z: 130, gy: 5 },
      bases: [{ x: 100, z: 50, caminhaoRy: 1.25 }, { x: -60, z: -200, caminhaoRy: 4 }],
    };
    const f = V.frotaDoPlano(plano);
    assert.deepEqual(f.map(v => [v.id, v.tipo]), [[0, 'buggy'], [1, 'esportivo'], [2, 'esportivo'], [3, 'esportivo'],
      [4, 'caminhao'], [5, 'caminhao'], ['heli', 'heli']]);
    assert.deepEqual(f.slice(0, 6).map(v => [v.x, v.z, v.ry]), [[7.5, -6, 0], [-326, 156, 0], [-348, 156, Math.PI],
      [-314, 114, -Math.PI / 2], [100, 46, 1.25], [-60, -204, 4]]);
    const heli = f[6];
    const { NEXUS } = await importar('paredes.js');
    assert.equal(heli.x, -340); assert.equal(heli.z, 130);
    assert.ok(Math.abs(heli.y - (5 + NEXUS.NF * NEXUS.FH + 0.25 + 0.05)) < 1e-9, `heli no topo errado: ${heli.y}`);
    // base que não coube (flatSpot nulo) simplesmente não tem caminhão
    assert.equal(V.frotaDoPlano({ cidade: plano.cidade, bases: [] }).length, 5);
  });
});
