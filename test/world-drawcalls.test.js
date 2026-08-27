/* ================================================================
   QA — DRAW CALLS DO MUNDO (porte Quest 3)

   O orçamento do Quest 3 é 180 draw calls POR OLHO; a pose de castelo
   media 702 em estéreo (sessão immersive-vr real, mundo congelado com
   `setTimeScale(0)`, sombra desligada, seed 424242). A atribuição por
   subtração de conjuntos fechou exata — 460 do "mundo", 140 da grama,
   102 de personagens/veículos — e mostrou que o grande bloco do mundo
   NÃO é a cidade nem as estruturas (essas já são meshes mescladas de 1
   call cada): é PROP DE GLB ENTREGUE CRU.

     · 1 barril de madeira  = 20 malhas, UM material  → 20 calls por olho
     · casa da árvore       = 14 malhas, DOIS materiais
     · acampamento do spawn = 3 lenhas + 7 pedras + banco, cada uma solta
     · 15 pássaros          = 15 malhas com a MESMA geometria e material

   Este arquivo é a rede do que não pode mudar junto com o corte:

     1. a contagem de malhas cai de verdade (é o que vira draw call);
     2. a APARÊNCIA não muda — para cada material, a caixa que os
        vértices ocupam NO MUNDO é a mesma casa decimal por casa decimal
        que em HEAD (os dourados abaixo saíram do jogo ANTES da fusão);
     3. os pássaros continuam VOANDO — instanciar não pode congelar
        bicho no céu, então o teste cobra deslocamento das instâncias e
        que eles sigam em bandos separados;
     4. o contrato do `Math.random` seedado não anda: fundir cria objetos
        THREE novos e cada UUID come 4 sorteios do stream do worldgen, por
        isso toda fusão em módulo seedado roda dentro de `noSeed`. O
        retrato do mundo (sítios, vagas de veículo) tem que bater com o
        de test/carregamento-determinismo.test.js.

   Dourados colhidos em HEAD bbe6b48 com WORLD_SEED=424242.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

const PORTA = 3490;

/* Caixa [min, max] que os vértices DAQUELE material ocupam no MUNDO, com o
   prop já assentado. Fundir só reescreve como se desenha: se um número aqui
   se mexe, a fusão mexeu no que se vê. */
const OURO = {
  // os 6 barris (`wooden_barrel.glb`), na ordem em que game.js os assenta
  barris: [
    [[-231.387, 7.982, 115.609], [-230.612, 9.032, 116.409]],
    [[-242.387, 5.776, 113.609], [-241.611, 6.826, 114.390]],
    [[-233.391, 7.300, 105.608], [-232.611, 8.350, 106.393]],
    [[315.994, -1.325, -159.779], [316.767, -0.275, -159.005]],
    [[308.989, -0.181, -165.802], [309.771, 0.869, -165.002]],
    [[313.992, -1.120, -166.784], [314.764, -0.070, -166.004]],
  ],
  // casa da árvore: dois materiais, duas caixas
  casa: {
    'ffffff|map': [[308.200, -1.176, -167.046], [315.460, 11.824, -155.746]],
    '7b77c1|-': [[310.959, -0.424, -162.387], [313.297, 1.317, -160.468]],
  },
  // mercado: já vinha com uma malha só — a fusão não pode piorá-lo
  mercado: [[-241.843, 6.922, 105.150], [-230.693, 13.922, 118.103]],
  // acampamento do spawn: união das 3 lenhas + banco (madeira) e das 7 pedras
  campoMadeira: [[1.350, 2.329, -2.414], [3.050, 3.283, -0.040]],
  campoPedra: [[1.196, 2.455, -2.877], [2.888, 2.720, -1.153]],
  /* Drop de munição, em coordenadas LOCAIS do modelo. Estes dois não vêm de
     captura: saem da geometria escrita em js/pickups.js, e é justamente por
     isso que provam a fusão. A caixa é `RoundedBoxGeometry(0.5, 0.3, 0.34)`
     na origem; as três cápsulas são cilindros de raio 0,045 e altura 0,22,
     centrados em y = 0,22 e x = −0,12 / 0 / 0,12 — e o cilindro de 8 gomos
     tem vértice exatamente em ±raio nos dois eixos (θ = 0°, 90°, 180°, 270°). */
  dropCaixa: [[-0.250, -0.150, -0.170], [0.250, 0.150, 0.170]],
  dropLatao: [[-0.165, 0.110, -0.045], [0.165, 0.330, 0.045]],
};

/* Teto de draw calls da pose de castelo, MONO e com o mundo congelado — a
   mesma medição que o teste faz mais abaixo. Medido em HEAD (bbe6b48): 496.
   Depois da fusão: 406. O teto de 460 pega de volta uma regressão do tamanho
   da que este arquivo fecha e ainda deixa folga pra IA e clima moverem quem
   está no frustum entre execuções. */
const TETO_CASTELO = 460;

const TOL = 2e-3;

function perto(atual, esperado, rotulo) {
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 3; j++) {
      assert.ok(Math.abs(atual[i][j] - esperado[i][j]) <= TOL,
        `${rotulo}: caixa[${i}][${j}] = ${atual[i][j]}, esperado ${esperado[i][j]} (tol ${TOL})`);
    }
  }
}

/* Roda NA PÁGINA: caixa por material, em coordenadas de mundo, lendo vértice
   a vértice. Vale para malha solta e para malha mesclada — é o mesmo
   conjunto de pontos, só reagrupado. */
function sondaNaPagina() {
  const MP = window.__MP;
  const round = v => Math.round(v * 1000) / 1000;

  /* `relativo`: mede no espaço da própria raiz em vez do mundo — é o que serve
     pra coisa que anda (o drop gira e flutua; a caixa dele só é comparável
     entre execuções em coordenadas locais). */
  function caixaPorMaterial(raiz, relativo) {
    raiz.updateMatrixWorld(true);
    const inv = relativo ? raiz.matrixWorld.clone().invert() : null;
    const _m = raiz.matrixWorld.clone();
    const porMat = {};
    let meshes = 0;
    raiz.traverse(n => {
      if (!n.isMesh) return;
      meshes++;
      const g = n.geometry, p = g.attributes.position;
      if (!p) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      const grupos = (g.groups && g.groups.length) ? g.groups
        : [{ start: 0, count: -1, materialIndex: 0 }];
      for (const grp of grupos) {
        const m = mats[grp.materialIndex] || mats[0];
        if (!m) continue;
        const chave = (m.color && m.color.getHexString ? m.color.getHexString() : '-') +
          '|' + (m.map ? 'map' : '-');
        if (!porMat[chave]) porMat[chave] = [[1e9, 1e9, 1e9], [-1e9, -1e9, -1e9]];
        const b = porMat[chave];
        const total = g.index ? g.index.count : p.count;
        const ini = grp.start || 0;
        const fim = grp.count === -1 ? total : Math.min(total, ini + grp.count);
        const e = (inv ? _m.multiplyMatrices(inv, n.matrixWorld) : n.matrixWorld).elements;
        for (let i = ini; i < fim; i++) {
          const vi = g.index ? g.index.getX(i) : i;
          const vx = p.getX(vi), vy = p.getY(vi), vz = p.getZ(vi);
          const w = 1 / ((e[3] * vx + e[7] * vy + e[11] * vz + e[15]) || 1);
          const x = (e[0] * vx + e[4] * vy + e[8] * vz + e[12]) * w;
          const y = (e[1] * vx + e[5] * vy + e[9] * vz + e[13]) * w;
          const z = (e[2] * vx + e[6] * vy + e[10] * vz + e[14]) * w;
          if (x < b[0][0]) b[0][0] = x;
          if (y < b[0][1]) b[0][1] = y;
          if (z < b[0][2]) b[0][2] = z;
          if (x > b[1][0]) b[1][0] = x;
          if (y > b[1][1]) b[1][1] = y;
          if (z > b[1][2]) b[1][2] = z;
        }
      }
    });
    for (const k in porMat) porMat[k] = porMat[k].map(a => a.map(round));
    return { meshes, porMat };
  }

  /* Marca do prop: o nome dos nós do GLB sobrevive ao clone e à fusão
     (a malha mesclada herda o nome do primeiro pedaço), então dá para
     achar cada prop sem depender do índice na cena. */
  const marcaDe = raiz => {
    let marca = '';
    raiz.traverse(n => {
      if (marca || !n.name) return;
      if (/wooden_barrel|^base07/i.test(n.name)) marca = 'barril';
      else if (/Mercado/i.test(n.name)) marca = 'mercado';
      else if (/^Island$|^Tree$|tree_house/i.test(n.name)) marca = 'casa';
    });
    return marca;
  };

  const props = { barril: [], mercado: [], casa: [] };
  for (const o of MP.scene.children) {
    const marca = marcaDe(o);
    if (!marca) continue;
    props[marca].push({ pos: o.position.toArray().map(round), ...caixaPorMaterial(o) });
  }
  props.barril.sort((a, b) => (a.pos[0] - b.pos[0]) || (a.pos[2] - b.pos[2]));

  /* Acampamento do spawn: filhos diretos da cena, achados pela COR do
     material — é o que sobrevive a qualquer reorganização de malhas. */
  const porCor = hex => {
    const achados = [];
    for (const o of MP.scene.children) {
      if (!o.isMesh || o.isInstancedMesh) continue;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || !m.color || m.color.getHexString() !== hex) continue;
      if (Math.hypot(o.position.x - 2, o.position.z + 2) > 12) continue;
      achados.push(o);
    }
    return achados;
  };
  const uniao = lista => {
    const b = [[1e9, 1e9, 1e9], [-1e9, -1e9, -1e9]];
    for (const o of lista) {
      const c = caixaPorMaterial(o);
      for (const k in c.porMat) {
        const q = c.porMat[k];
        for (let j = 0; j < 3; j++) {
          if (q[0][j] < b[0][j]) b[0][j] = q[0][j];
          if (q[1][j] > b[1][j]) b[1][j] = q[1][j];
        }
      }
    }
    return b.map(a => a.map(round));
  };
  const madeira = porCor('6b4a2e'), pedra = porCor('7e7a73');

  /* Pássaros: 15 planos escuros idênticos. Depois do corte tem que ser UMA
     InstancedMesh — e ela precisa estar VOANDO, não parada no céu. */
  const passarosSoltos = MP.scene.children.filter(o => o.isMesh && !o.isInstancedMesh &&
    o.material && o.material.color && o.material.color.getHexString() === '1d2126');
  const passarosInst = MP.scene.children.filter(o => o.isInstancedMesh &&
    o.material && o.material.color && o.material.color.getHexString() === '1d2126');

  /* Drops de munição/kit: o pool tem 26 raízes com os 5 modelos dentro (só um
     visível por vez). Conta as malhas do modelo de MUNIÇÃO, que era o pior. */
  const pickups = [];
  for (const o of MP.scene.children) {
    let temLatao = false, temCaixa = false;
    o.traverse(n => {
      if (!n.isMesh || !n.material || !n.material.color) return;
      const hex = n.material.color.getHexString();
      if (hex === 'd9b04e') temLatao = true;
      if (hex === '3a4a2e') temCaixa = true;
    });
    if (!temLatao || !temCaixa) continue;
    // o modelo de munição é o filho que carrega os dois materiais
    for (const modelo of o.children) {
      let latao = false;
      modelo.traverse(n => {
        if (n.isMesh && n.material && n.material.color &&
            n.material.color.getHexString() === 'd9b04e') latao = true;
      });
      if (latao) pickups.push(caixaPorMaterial(modelo, true));
    }
  }

  return {
    props,
    pickups,
    campo: {
      madeiraNos: madeira.length, madeiraCaixa: uniao(madeira),
      pedraNos: pedra.length, pedraCaixa: uniao(pedra),
    },
    passaros: {
      soltos: passarosSoltos.length,
      inst: passarosInst.length,
      instancias: passarosInst.length ? passarosInst[0].count : 0,
    },
  };
}

/* Posições de mundo das 15 aves, seja qual for a forma que elas tenham. */
function posDosPassaros() {
  const MP = window.__MP;
  const ehAve = o => o.material && o.material.color && o.material.color.getHexString() === '1d2126';
  const inst = MP.scene.children.find(o => o.isInstancedMesh && ehAve(o));
  if (inst) {
    const out = [];
    const m = new (Object.getPrototypeOf(inst.matrixWorld).constructor)();
    for (let i = 0; i < inst.count; i++) {
      inst.getMatrixAt(i, m);
      out.push([m.elements[12], m.elements[13], m.elements[14]]);
    }
    return out;
  }
  return MP.scene.children.filter(o => o.isMesh && ehAve(o))
    .map(o => [o.position.x, o.position.y, o.position.z]);
}

describe('draw calls do mundo — props de GLB, acampamento e pássaros', { skip: !CHROME }, () => {
  let h, sonda;

  before(async () => {
    h = await bootGame({ port: PORTA, worldSeed: '424242' });
    // os props de POI entram por load assíncrono de GLB: esperar o barril
    await h.page.waitForFunction(() => {
      const MP = window.__MP;
      return MP && MP.scene.children.some(o => {
        let achou = false;
        o.traverse(n => { if (/wooden_barrel|^base07/i.test(n.name || '')) achou = true; });
        return achou;
      });
    }, { timeout: 180000, polling: 500 });
    sonda = await h.play(sondaNaPagina);
  });

  after(async () => { if (h) await h.close(); });

  it('barril de madeira: uma malha por material, silhueta intacta', () => {
    assert.equal(sonda.props.barril.length, 6, 'os 6 barris continuam no mundo');
    const ordenado = OURO.barris.slice().sort((a, b) => (a[0][0] - b[0][0]) || (a[0][2] - b[0][2]));
    sonda.props.barril.forEach((b, i) => {
      assert.ok(b.meshes <= 1, `barril ${i}: ${b.meshes} malhas (era 20, o alvo é 1)`);
      const chaves = Object.keys(b.porMat);
      assert.equal(chaves.length, 1, `barril ${i}: um material só`);
      perto(b.porMat[chaves[0]], ordenado[i], `barril ${i}`);
    });
  });

  it('casa da árvore: uma malha por material, silhueta intacta', () => {
    assert.equal(sonda.props.casa.length, 1);
    const casa = sonda.props.casa[0];
    assert.ok(casa.meshes <= 2, `casa da árvore: ${casa.meshes} malhas (era 14, o alvo é 2)`);
    for (const chave of Object.keys(OURO.casa)) {
      assert.ok(casa.porMat[chave], `casa da árvore: material ${chave} sumiu`);
      perto(casa.porMat[chave], OURO.casa[chave], `casa/${chave}`);
    }
  });

  it('mercado: continua com uma malha e a mesma silhueta', () => {
    assert.equal(sonda.props.mercado.length, 1);
    const m = sonda.props.mercado[0];
    assert.equal(m.meshes, 1, `mercado: ${m.meshes} malhas (era 1 depois da fusão)`);
    /* `<= 1` aceitava ZERO, ou seja, a peça sumida passava. E sem checar a
       chave, um balde recusado só aparecia como TypeError adiante — reprovava
       por acidente, não por asserção. */
    const chaveM = Object.keys(m.porMat);
    assert.equal(chaveM.length, 1, `mercado: ${chaveM.length} materiais`);
    perto(m.porMat[Object.keys(m.porMat)[0]], OURO.mercado, 'mercado');
  });

  it('acampamento do spawn: madeira e pedra viram uma malha cada', () => {
    assert.equal(sonda.campo.madeiraNos, 1,
      `madeira do acampamento: ${sonda.campo.madeiraNos} malhas (eram 4)`);
    perto(sonda.campo.madeiraCaixa, OURO.campoMadeira, 'acampamento/madeira');
    assert.equal(sonda.campo.pedraNos, 1,
      `pedras do acampamento: ${sonda.campo.pedraNos} malhas (eram 7)`);
    perto(sonda.campo.pedraCaixa, OURO.campoPedra, 'acampamento/pedra');
  });

  it('drop de munição: caixa e latão, duas malhas', () => {
    assert.ok(sonda.pickups.length >= 20, `pool de drops encontrado (${sonda.pickups.length})`);
    for (const p of sonda.pickups) {
      assert.equal(p.meshes, 2, `drop de munição: ${p.meshes} malhas (eram 4)`);
      assert.deepEqual(Object.keys(p.porMat).sort(), ['3a4a2e|-', 'd9b04e|-'],
        'os dois materiais do drop continuam os mesmos');
    }
    // as 3 cápsulas de latão fundidas ocupam exatamente o mesmo espaço
    perto(sonda.pickups[0].porMat['d9b04e|-'], OURO.dropLatao, 'drop/latão');
    perto(sonda.pickups[0].porMat['3a4a2e|-'], OURO.dropCaixa, 'drop/caixa');
  });

  it('orçamento de draw calls do mundo na pose de castelo', async () => {
    const medido = await h.play(() => {
      const G = window.__game, MP = window.__MP, R = MP.renderer;
      const P = G.Structures.FORT_POS;
      G.player.pos.set(P.x, G.groundAt(P.x, P.z, 999) + 1, P.z);
      G.player.vel.set(0, 0, 0);
      const autoSalvo = R.info.autoReset, sombraSalva = R.shadowMap.enabled;
      R.info.autoReset = false;
      R.shadowMap.enabled = false;
      const frame = () => {
        G.tick(0);                        // mundo CONGELADO: a conta é estável
        R.info.reset();
        R.render(MP.scene, MP.camera);
        return R.info.render.calls;
      };
      for (let i = 0; i < 40; i++) frame();   // assenta stream de grama e frustum
      const amostras = [];
      for (let i = 0; i < 7; i++) amostras.push(frame());
      R.info.autoReset = autoSalvo;
      R.shadowMap.enabled = sombraSalva;
      amostras.sort((a, b) => a - b);
      return { mediana: amostras[3], min: amostras[0], max: amostras[6] };
    });
    assert.equal(medido.min, medido.max, 'mundo congelado dá frame estável');
    assert.ok(medido.mediana <= TETO_CASTELO,
      `pose de castelo: ${medido.mediana} draw calls (teto ${TETO_CASTELO}; ` +
      'em HEAD, antes da fusão, eram 496 nesta mesma medição mono)');
  });

  it('pássaros: uma InstancedMesh de 15 — e continuam voando', async () => {
    assert.equal(sonda.passaros.soltos, 0, 'nenhum pássaro solto sobrou');
    assert.equal(sonda.passaros.inst, 1, 'os pássaros viraram UMA InstancedMesh');
    assert.equal(sonda.passaros.instancias, 15, '15 aves, como sempre');

    const antes = await h.play(posDosPassaros);
    await h.play(() => window.QA.tick(60, 1 / 60));   // 1 s de jogo
    const depois = await h.play(posDosPassaros);
    assert.equal(antes.length, 15);
    const andou = antes.map((p, i) => Math.hypot(
      depois[i][0] - p[0], depois[i][1] - p[1], depois[i][2] - p[2]));
    assert.ok(andou.every(d => d > 0.5),
      `toda ave voa em 1 s (mínimo medido ${Math.min(...andou).toFixed(2)} m)`);
    // três bandos: as aves não podem ter colapsado num ponto só
    const espalhamento = Math.max(...depois.map(p => Math.hypot(p[0], p[2]))) -
      Math.min(...depois.map(p => Math.hypot(p[0], p[2])));
    assert.ok(espalhamento > 50, `bandos separados (espalhamento ${espalhamento.toFixed(0)} m)`);
  });

  /* ================================================================
     FEIXES DE FINDABILITY (js/farbeacon.js)

     Os 6 feixes verticais — 5 marcos de atração (js/maptoys.js) e o
     ninho do atirador (js/secrets.js) — existem PARA serem vistos de
     longe: são declarados `fog: false` justamente por isso. Eles são a
     única coisa que impedia encurtar `camera.far` de 1020 m para os
     420 m em que a névoa já satura, um corte medido em −126 draw calls
     estéreo na pose de castelo.

     Duas coisas os prendiam:

     1. `transparent` + `DoubleSide` faz o three desenhar a malha em DOIS
        passes (traseiras, depois frentes). Em mistura ADITIVA com
        `depthWrite: false` a ordem não muda um pixel — o segundo passe
        era draw call jogada fora. Medido: 6 stereo por frame.
     2. Além do plano far a geometria é RECORTADA pela GPU, e o objeto
        ainda é descartado no culling da CPU. O truque é o mesmo que o
        addon `Sky` do three usa há anos: prender o z de clip no far em
        vez de deixar recortar.

     Este bloco é a rede dos dois: se alguém tirar o `forceSinglePass`,
     o passe duplo volta; se alguém tirar o clamp do vertex shader, o
     feixe distante SOME com far curto — e o caso de pixel abaixo é o
     que enxerga isso (foi verificado removendo o clamp: 0 pixels).
     ================================================================ */

  /* Caixa que os vértices de cada feixe ocupam NO MUNDO, colhida em HEAD
     3cc8eea (6 malhas soltas, seed 424242). Fundir só muda como se
     desenha: se um número aqui se mexer, mexeu no que se vê. */
  const OURO_FEIXES = {
    '8a3ffb': [[-337.550, 1.060, -224.950], [-335.650, 47.060, -223.050]],
    'ffe14a': [[-226.415, 6.800, 286.134], [-224.515, 52.800, 288.034]],
    '53c7ff': [[-183.866, 4.773, 5.515], [-181.966, 50.773, 7.415]],
    'd7343a': [[-122.248, 11.309, 409.897], [-120.348, 57.309, 411.797]],
    'ff8ad4': [[-11.697, 1.751, -4.220], [-9.797, 47.751, -2.320]],
    'ff3b30': [[224.690, 22.606, -360.198], [226.290, 54.606, -358.598]],
  };

  /* Roda na página: acha as malhas de farol pelo carimbo do módulo e
     devolve, POR COR DE FEIXE, a caixa de mundo dos vértices daquela cor. */
  function sondaFeixes() {
    const MP = window.__MP, THREE = MP.THREE;
    const round = v => Math.round(v * 1000) / 1000;
    const farois = [], aditivosSoltos = [];
    MP.scene.traverse(o => {
      const m = o.material;
      if (!o.isMesh || !m || Array.isArray(m)) return;
      if (m.userData && m.userData.farbeacon) { farois.push(o); return; }
      // sobra de feixe solto: aditivo + fog:false, o desenho antigo
      if (m.type === 'MeshBasicMaterial' && m.fog === false &&
          m.blending === THREE.AdditiveBlending) aditivosSoltos.push(o);
    });

    const porCor = {};
    let malhas = 0;
    for (const o of farois) {
      malhas++;
      o.updateMatrixWorld(true);
      const g = o.geometry, p = g.attributes.position, cor = g.attributes.color;
      const v = new THREE.Vector3(), c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        // a cor por vértice está no espaço de trabalho (linear): volta pra sRGB
        // pra bater com o getHexString() do material que existia antes
        c.fromBufferAttribute(cor, i);
        const chave = c.getHexString(THREE.SRGBColorSpace);
        if (!porCor[chave]) porCor[chave] = [[1e9, 1e9, 1e9], [-1e9, -1e9, -1e9]];
        const b = porCor[chave];
        for (let j = 0; j < 3; j++) {
          const q = v.getComponent(j);
          if (q < b[0][j]) b[0][j] = q;
          if (q > b[1][j]) b[1][j] = q;
        }
      }
    }
    for (const k in porCor) porCor[k] = porCor[k].map(a => a.map(round));

    return {
      malhas, soltos: aditivosSoltos.length, porCor,
      props: farois.map(o => ({
        nome: o.name,
        forceSinglePass: o.material.forceSinglePass === true,
        fog: o.material.fog,
        aditivo: o.material.blending === THREE.AdditiveBlending,
        depthWrite: o.material.depthWrite,
        vertexColors: o.material.vertexColors === true,
        frustumCulled: o.frustumCulled,
        opacidade: o.material.opacity,
        // o clamp do far tem que estar NO SHADER COMPILADO, não só na fonte
        clampNoPrograma: !!(o.material.program &&
          /gl_Position\.z\s*=\s*min/.test(o.material.program.vertexShader || '')),
      })),
    };
  }

  it('feixes de findability: uma malha por módulo, em passe único', async () => {
    const r = await h.play(sondaFeixes);
    assert.equal(r.soltos, 0,
      `${r.soltos} feixes ainda soltos: cada um paga draw call por conta`);
    assert.equal(r.malhas, 2,
      `os 6 feixes viraram ${r.malhas} malhas (o alvo é 2: atrações + segredo)`);
    for (const p of r.props) {
      assert.equal(p.forceSinglePass, true,
        `${p.nome}: sem forceSinglePass, transparent+DoubleSide paga DOIS passes`);
      assert.equal(p.fog, false, `${p.nome}: o feixe tem que furar a névoa`);
      assert.equal(p.aditivo, true, `${p.nome}: mistura aditiva (é o que torna a ordem irrelevante)`);
      assert.equal(p.depthWrite, false, `${p.nome}: feixe não escreve profundidade`);
      assert.equal(p.vertexColors, true, `${p.nome}: a cor de cada feixe vive no vértice`);
      assert.equal(p.frustumCulled, false,
        `${p.nome}: com far curto o culling da CPU mataria o feixe distante`);
    }
  });

  it('feixes: cada cor ocupa exatamente o mesmo espaço de antes', async () => {
    const r = await h.play(sondaFeixes);
    const cores = Object.keys(r.porCor).sort();
    assert.deepEqual(cores, Object.keys(OURO_FEIXES).sort(),
      `as cores dos feixes mudaram: ${cores.join(',')}`);
    for (const cor of cores) perto(r.porCor[cor], OURO_FEIXES[cor], `feixe ${cor}`);
  });

  it('feixes: com far = VIEW_DIST o feixe a 600 m ainda pinta pixels', async () => {
    const medido = await h.play(() => {
      const MP = window.__MP, THREE = MP.THREE, R = MP.renderer;
      const alvo = new THREE.Vector3(-121.298, 34.309, 410.847); // feixe d7343a
      const cam = new THREE.PerspectiveCamera(75,
        R.domElement.width / R.domElement.height, 0.08, MP.CFG.VIEW_DIST);
      // 600 m na horizontal e bem acima do relevo: linha de visada limpa
      cam.position.set(alvo.x - 600, alvo.y + 60, alvo.z);
      cam.lookAt(alvo);
      cam.updateMatrixWorld(true);
      const dist = cam.position.distanceTo(alvo);

      const farois = [];
      MP.scene.traverse(o => {
        if (o.isMesh && o.material && !Array.isArray(o.material) &&
            o.material.userData && o.material.userData.farbeacon) farois.push(o);
      });

      const gl = R.getContext();
      const w = R.domElement.width, hh = R.domElement.height;
      const quadro = () => {
        R.render(MP.scene, cam);
        const buf = new Uint8Array(w * hh * 4);
        gl.readPixels(0, 0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        return buf;
      };
      const com = quadro();
      for (const f of farois) f.visible = false;
      const sem = quadro();
      for (const f of farois) f.visible = true;
      let difs = 0, maxD = 0;
      for (let i = 0; i < com.length; i += 4) {
        const d = Math.max(Math.abs(com[i] - sem[i]), Math.abs(com[i + 1] - sem[i + 1]),
          Math.abs(com[i + 2] - sem[i + 2]));
        if (d > 2) difs++;
        if (d > maxD) maxD = d;
      }
      return { difs, maxD, dist: Math.round(dist), far: MP.CFG.VIEW_DIST, pixels: w * hh };
    });
    assert.ok(medido.dist > medido.far,
      `a câmera do caso precisa estar ALÉM do far (${medido.dist} m contra far ${medido.far})`);
    assert.ok(medido.difs > 100,
      `com far = ${medido.far} m o feixe a ${medido.dist} m pintou só ${medido.difs} pixels ` +
      '(sem o clamp do vertex shader a GPU recorta o feixe e dá 0)');
  });

  it('feixes: os dois faróis juntos custam no máximo 2 draw calls', async () => {
    const medido = await h.play(() => {
      const G = window.__game, MP = window.__MP, R = MP.renderer;
      const farois = [];
      MP.scene.traverse(o => {
        if (o.isMesh && o.material && !Array.isArray(o.material) &&
            o.material.userData && o.material.userData.farbeacon) farois.push(o);
      });
      const autoSalvo = R.info.autoReset, sombraSalva = R.shadowMap.enabled;
      R.info.autoReset = false;
      R.shadowMap.enabled = false;
      const frame = () => {
        G.tick(0);
        R.info.reset();
        R.render(MP.scene, MP.camera);
        return R.info.render.calls;
      };
      for (let i = 0; i < 20; i++) frame();
      const com = frame();
      for (const f of farois) f.visible = false;
      for (let i = 0; i < 3; i++) frame();
      const sem = frame();
      for (const f of farois) f.visible = true;
      R.info.autoReset = autoSalvo;
      R.shadowMap.enabled = sombraSalva;
      return { com, sem, n: farois.length };
    });
    assert.equal(medido.n, 2, 'dois faróis na cena');
    assert.ok(medido.com - medido.sem <= 2,
      `os faróis custaram ${medido.com - medido.sem} draw calls mono (teto 2; ` +
      'em HEAD os 6 feixes soltos custavam 6, dois passes cada)');
  });
});

describe('o céu noturno cabe no campo de visão', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  /* O DOMO DE ESTRELAS MORAVA FORA DO ALCANCE DA CÂMERA. Ele era montado a
     1500 m e colado na câmera todo frame, contra um `far` de 1020: a GPU
     recortava quase tudo, e o jogador via um céu noturno 96% vazio sem que
     ninguém tivesse decidido isso. Medido em pixels de estrela pintados: 46
     com far 1020 contra 1082 com far 4000.

     Não é detalhe estético: enquanto o domo dependesse de um `far` longo, a
     maior alavanca de desempenho do porte VR ficava travada — encurtar o far
     acabaria com o céu. Trazer o domo para dentro do campo destrava as duas
     coisas de uma vez.

     Aqui se mede GEOMETRIA, não pixel: contagem de pixels de estrela é frágil
     (depende de exposição, de bloom, do horário e de onde a câmera está
     olhando) e já me devolveu zero nos dois lados de uma comparação em que o
     efeito existia. O que não é frágil é a distância do domo comparada ao
     alcance da câmera. */
  let h;
  before(async () => { h = await bootGame({ port: 3496 }); });
  after(async () => { if (h) await h.close(); });

  it('todas as estrelas ficam DENTRO do alcance da câmera', async () => {
    const r = await h.play(() => {
      const MP = window.__MP;
      let pontos = null;
      MP.scene.traverse(o => {
        if (!pontos && o.isPoints && o.geometry && o.geometry.attributes.position
            && o.geometry.attributes.position.count > 300) pontos = o;
      });
      if (!pontos) return { achou: false };
      const p = pontos.geometry.attributes.position;
      let maxR = 0, minR = Infinity;
      for (let i = 0; i < p.count; i++) {
        const r2 = Math.hypot(p.getX(i), p.getY(i), p.getZ(i));
        if (r2 > maxR) maxR = r2;
        if (r2 < minR) minR = r2;
      }
      return {
        achou: true, n: p.count, maxR: +maxR.toFixed(1), minR: +minR.toFixed(1),
        far: MP.camera.far, temFog: pontos.material.fog !== false,
      };
    });
    assert.equal(r.achou, true, 'não achei o domo de estrelas na cena');
    assert.ok(r.maxR < r.far,
      `a estrela mais distante está a ${r.maxR} m e a câmera enxerga até ${r.far} m: ` +
      'o céu noturno é recortado pela GPU antes de chegar na tela');
    assert.equal(r.temFog, false,
      'as estrelas recebem névoa: dentro do alcance da câmera elas sairiam LAVADAS, ' +
      'o que troca "recortadas" por "apagadas"');
    assert.ok(r.n >= 500, `o domo tem ${r.n} estrelas`);
  });

  it('e ficam FORA da névoa mais densa, para não virarem borrão', async () => {
    const r = await h.play(() => {
      const MP = window.__MP;
      return { fogFar: MP.scene.fog ? MP.scene.fog.far : null, far: MP.camera.far };
    });
    assert.ok(r.fogFar !== null, 'a cena perdeu a névoa');
    assert.ok(r.far <= r.fogFar + 1,
      `a câmera enxerga até ${r.far} m mas a névoa satura em ${r.fogFar}: ` +
      'tudo entre os dois é desenhado 100% da cor da névoa — pixel que não muda nada e custa draw call');
  });
});

/* ================================================================
   ESQUELETOS — QUATRO SUBMALHAS VIRAM UMA, COM ATLAS DE TEXTURA

   `skeleton.v1.glb` traz o esqueleto em quatro `SkinnedMesh` cujos
   materiais são IDÊNTICOS (MeshPhysicalMaterial branco, rugosidade 1,
   metalicidade 0, DoubleSide, sem nenhum outro mapa): o que as separa é
   só a textura de 256×256 de cada uma. Compartilhar material não
   resolveria — o three não faz batching por material, então quatro
   malhas continuam sendo quatro draw calls. O único caminho é fundir a
   GEOMETRIA, e para isso o mapa tem que ser um só: atlas.

   Medido em sessão immersive-vr (IWER Quest 3), mundo congelado com
   `MP.setTimeScale(0)`, sombra desligada na atribuição, GLB do Guardião
   carregado, seed 424242, spread 0 em todas as amostras, com os SETE
   esqueletos plantados na frente da câmera para a contagem ser
   comparável entre execuções:

     antes  56 draw calls estéreo (4,00 por olho por esqueleto)
     depois 14 draw calls estéreo (1,00 por olho por esqueleto)   −75 %
     com sombra: 84 → 21 estéreo
     triângulos: 81 872 estéreo nos DOIS — a fusão não move um triângulo

   Este bloco é a rede das quatro coisas que não podem mudar junto:

     1. a contagem de malhas cai de verdade (é o que vira draw call);
     2. o atlas carrega os MESMOS pixels das quatro texturas;
     3. a cadeia de mip é montada célula a célula E em luz (linear), que
        é como o driver reduz textura sRGB — com o filtro do canvas o
        esqueleto a 25 m ficava com 87 % dos pixels diferentes;
     4. os vértices SKINADOS caem exatamente onde caíam. Isto é o que
        pega as duas armadilhas caras: a correção de espaço de bind
        (cada submalha vem com uma skin de `inverseBindMatrices`
        diferente) e a DESQUANTIZAÇÃO (o GLB usa KHR_mesh_quantization,
        posição é inteiro normalizado, e escrever por cima corta em ±1).

   Dourados colhidos no worktree limpo de 4c4810b, WORLD_SEED=424242.
   ================================================================ */
const OURO_ESQ = [
  { nome: 'Circle_0', verts: 2240, tris: 3724, hash: 930731516,
    caixa: [[-8.90625, -2.20887, -0.47301], [8.90625, 2.68417, 9.50471]] },
  { nome: 'Circle_1', verts: 823, tris: 1420, hash: 2228075012,
    caixa: [[-1.78626, -1.74905, 8.4219], [1.78626, 2.18452, 14.3625]] },
  { nome: 'Circle_2', verts: 260, tris: 448, hash: 3541268468,
    caixa: [[-1.64138, -0.99477, 11.30124], [1.64143, 0.52146, 12.90082]] },
  { nome: 'Circle_3', verts: 175, tris: 256, hash: 1889804764,
    caixa: [[-8.52662, -9.34667, 7.80512], [-6.73524, 1.89713, 9.15921]] },
];

describe('esqueletos: as quatro submalhas viram uma malha só', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, r;

  /* Roda NA PÁGINA. Normaliza o palco (grupo na origem, sem rotação) porque
     `getVertexPosition` de SkinnedMesh sai no espaço em que os OSSOS estão —
     sem fixar o grupo, o dourado dependeria de onde o mundo largou o
     esqueleto, e o mundo larga cada um num ponto diferente a cada boot (o
     sorteio acontece na chegada assíncrona do GLB). */
  function sondaEsqueleto(ordem) {
    const G = window.__game, THREE = window.__MP.THREE;
    const sk = G.Skeletons.list[0];
    const out = { modelos: [], atlas: null, partes: [], material: null };
    for (const s of G.Skeletons.list) {
      let malhas = 0, skinned = 0;
      if (s.model) s.model.traverse(o => {
        if (o.isMesh || o.isSkinnedMesh) malhas++;
        if (o.isSkinnedMesh) skinned++;
      });
      out.modelos.push({ malhas, skinned });
    }
    if (!sk || !sk.model) return out;
    sk.group.position.set(0, 0, 0);
    sk.group.rotation.set(0, 0, 0);
    sk.group.scale.set(1, 1, 1);
    sk.group.updateMatrixWorld(true);
    sk.model.updateMatrixWorld(true);

    let malha = null;
    sk.model.traverse(o => { if (o.isSkinnedMesh && !malha) malha = o; });
    if (!malha) return out;
    malha.skeleton.update();

    const m = malha.material, tex = m.map, img = tex.image;
    out.material = {
      tipo: m.type, cor: m.color.getHexString(), rough: m.roughness, metal: m.metalness,
      side: m.side, transparent: m.transparent, flatShading: m.flatShading,
      vertexColors: m.vertexColors,
      outrosMapas: ['normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
        'alphaMap', 'bumpMap', 'displacementMap', 'lightMap'].filter(k => m[k]),
    };
    out.atlas = {
      w: img.width, h: img.height,
      niveis: (tex.mipmaps || []).map(x => `${x.width}x${x.height}`),
      generateMipmaps: tex.generateMipmaps, flipY: tex.flipY, colorSpace: tex.colorSpace,
      minFilter: tex.minFilter, magFilter: tex.magFilter,
    };

    /* pixels: hash de cada quadrante do nível 0, e o texel do nível 2×2 */
    const lePixels = (fonte, x, y, w2, h2) => {
      const c = document.createElement('canvas');
      c.width = fonte.width; c.height = fonte.height;
      c.getContext('2d', { willReadFrequently: true }).drawImage(fonte, 0, 0);
      return c.getContext('2d', { willReadFrequently: true }).getImageData(x, y, w2, h2).data;
    };
    const grade = 2, cw = img.width / grade, ch = img.height / grade;
    const paraLinear = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    const paraSrgb = v => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
    const nivel8 = (tex.mipmaps || []).find(x => x.width === 2 && x.height === 2);
    const px8 = nivel8 ? lePixels(nivel8, 0, 0, 2, 2) : null;

    /* Faixa de vértice de cada peça: a fusão concatena na ordem, e uv
       exatamente na borda cairia no quadrante vizinho se a classificação
       fosse por uv. */
    const g = malha.geometry, pos = g.attributes.position;
    const v = new THREE.Vector3();
    const round = x => Math.round(x * 1e5) / 1e5;
    let ini = 0;
    for (let q = 0; q < grade * grade; q++) {
      const gx = q % grade, gy = Math.floor(q / grade);
      const d = lePixels(img, gx * cw, gy * ch, cw, ch);
      let hsh = 2166136261 >>> 0;
      let lr = 0, lg = 0, lb = 0, br = 0, bg = 0, bb = 0;
      for (let i = 0; i < d.length; i++) hsh = ((hsh ^ d[i]) * 16777619) >>> 0;
      for (let i = 0; i < d.length; i += 4) {
        lr += paraLinear(d[i] / 255); lg += paraLinear(d[i + 1] / 255); lb += paraLinear(d[i + 2] / 255);
        br += d[i]; bg += d[i + 1]; bb += d[i + 2];
      }
      const n = d.length / 4;
      const fim = ini + (ordem[q] || 0);
      const b = [[1e9, 1e9, 1e9], [-1e9, -1e9, -1e9]];
      const uvAttr = g.attributes.uv;
      const cel = [1e9, -1e9, 1e9, -1e9];
      for (let i = ini; i < fim && i < pos.count; i++) {
        malha.getVertexPosition(i, v);
        for (let j = 0; j < 3; j++) {
          const x = v.getComponent(j);
          if (x < b[0][j]) b[0][j] = x;
          if (x > b[1][j]) b[1][j] = x;
        }
        const uu = uvAttr.getX(i), vv = uvAttr.getY(i);
        if (uu < cel[0]) cel[0] = uu; if (uu > cel[1]) cel[1] = uu;
        if (vv < cel[2]) cel[2] = vv; if (vv > cel[3]) cel[3] = vv;
      }
      ini = fim;
      out.partes.push({
        q, hash: hsh, bytes: d.length, caixa: b.map(a => a.map(round)),
        uv: cel.map(round), celula: [gx / grade, (gx + 1) / grade, gy / grade, (gy + 1) / grade],
        mediaLinear: [lr, lg, lb].map(x => Math.round(paraSrgb(x / n) * 255)),
        mediaByte: [br, bg, bb].map(x => Math.round(x / n)),
        nivel2x2: px8 ? [px8[q * 4], px8[q * 4 + 1], px8[q * 4 + 2]] : null,
      });
    }
    out.verts = pos.count;
    out.tris = (g.index ? g.index.count : pos.count) / 3;
    out.esfera = malha.boundingSphere
      ? { c: malha.boundingSphere.center.toArray().map(round), r: round(malha.boundingSphere.radius) }
      : null;
    return out;
  }

  before(async () => {
    h = await bootGame({ port: 3494, worldSeed: '424242' });
    await h.page.waitForFunction('window.__game.Skeletons && window.__game.Skeletons.modelReady',
      { timeout: 180000, polling: 250 });
    r = await h.play(sondaEsqueleto, OURO_ESQ.map(p => p.verts));
  });

  after(async () => { if (h) await h.close(); });

  it('cada esqueleto tem UMA malha, e ela é skinada', () => {
    assert.equal(r.modelos.length, 7, 'os 7 esqueletos continuam no mapa');
    for (const [i, m] of r.modelos.entries()) {
      assert.equal(m.malhas, 1,
        `esqueleto ${i}: ${m.malhas} malhas (o GLB traz 4, e cada uma é uma draw call por olho)`);
      assert.equal(m.skinned, 1, `esqueleto ${i}: a malha fundida tem que continuar skinada`);
    }
    assert.equal(r.verts, OURO_ESQ.reduce((s, p) => s + p.verts, 0),
      'a fusão não pode perder nem inventar vértice');
    assert.equal(r.tris, OURO_ESQ.reduce((s, p) => s + p.tris, 0),
      'a fusão não pode mover um triângulo');
  });

  it('o material continua o mesmo — só o mapa virou atlas', () => {
    assert.equal(r.material.tipo, 'MeshPhysicalMaterial');
    assert.equal(r.material.cor, 'ffffff');
    assert.equal(r.material.rough, 1);
    assert.equal(r.material.metal, 0);
    assert.equal(r.material.transparent, false);
    assert.equal(r.material.flatShading, false);
    assert.equal(r.material.vertexColors, false);
    assert.deepEqual(r.material.outrosMapas, [],
      'o atlas só vale porque o mapa de cor é o ÚNICO que difere entre as peças');
    assert.equal(r.atlas.w, 512, 'atlas 2×2 de células de 256');
    assert.equal(r.atlas.h, 512);
    assert.equal(r.atlas.flipY, false, 'GLB nasce com flipY=false; o atlas tem que herdar');
    assert.equal(r.atlas.colorSpace, 'srgb');
  });

  it('cada quadrante do atlas tem os MESMOS pixels da textura que substituiu', () => {
    assert.equal(r.partes.length, 4);
    const hashes = r.partes.map(p => p.hash);
    assert.deepEqual(hashes, OURO_ESQ.map(p => p.hash),
      'os bytes das quatro texturas de 256×256 têm que chegar intactos ao atlas ' +
      '(hash FNV-1a dos 262 144 bytes RGBA de cada célula)');
    /* Pixel certo no lugar certo não basta: o uv de cada peça tem que APONTAR
       pra célula dela. Sem esta cerca, esquecer o deslocamento do atlas deixa
       as quatro peças lendo a textura do canto de baixo à esquerda — e os
       hashes acima continuariam todos verdes. */
    for (const p of r.partes) {
      const [u0, u1, v0, v1] = p.uv, [cu0, cu1, cv0, cv1] = p.celula;
      assert.ok(u0 >= cu0 - 1e-4 && u1 <= cu1 + 1e-4 && v0 >= cv0 - 1e-4 && v1 <= cv1 + 1e-4,
        `peça ${p.q}: uv ${JSON.stringify(p.uv)} sai da célula ${JSON.stringify(p.celula)} — ` +
        'ela leria a textura da vizinha');
      assert.ok(u1 - u0 > 0.2 && v1 - v0 > 0.05,
        `peça ${p.q}: uv ${JSON.stringify(p.uv)} não ocupa a célula — o deslocamento comeu a escala`);
    }
  });

  it('a cadeia de mip é MONTADA, célula a célula e em luz', () => {
    assert.equal(r.atlas.generateMipmaps, false,
      'deixar a GPU gerar o mip mistura texel de uma textura com o da vizinha nos níveis baixos');
    assert.deepEqual(r.atlas.niveis,
      ['512x512', '256x256', '128x128', '64x64', '32x32', '16x16', '8x8', '4x4', '2x2', '1x1'],
      'a cadeia tem que ser COMPLETA: nível faltando deixa a textura incompleta pro filtro trilinear');
    /* O nível 2×2 é o último em que cada célula ainda é só dela: cada texel
       tem que ser a média da SUA textura, e em LUZ. Média em byte dá outro
       número — e com ela o esqueleto a 25 m tinha 82 % dos pixels diferentes
       de HEAD contra 66 % da média em luz (média de desvio 3,49 contra 1,24). */
    for (const p of r.partes) {
      assert.ok(p.nivel2x2, 'o nível 2×2 tem que existir');
      const dLinear = Math.max(...p.nivel2x2.map((v, i) => Math.abs(v - p.mediaLinear[i])));
      const dByte = Math.max(...p.nivel2x2.map((v, i) => Math.abs(v - p.mediaByte[i])));
      assert.ok(dLinear <= 2,
        `célula ${p.q}: o texel 2×2 ${JSON.stringify(p.nivel2x2)} não é a média em luz ` +
        `${JSON.stringify(p.mediaLinear)} (desvio ${dLinear}) — ou o mip cruzou a borda da célula, ` +
        'ou o filtro do canvas voltou');
      assert.ok(dLinear < dByte,
        `célula ${p.q}: o texel 2×2 está mais perto da média em BYTE ${JSON.stringify(p.mediaByte)} ` +
        `que da média em luz ${JSON.stringify(p.mediaLinear)} — reduzir textura sRGB em byte escurece`);
    }
  });

  it('os vértices SKINADOS caem exatamente onde caíam com quatro malhas', () => {
    /* Mata os dois defeitos que custaram esta rodada:
       - sem a correção de espaço de bind (cada submalha do GLB vem com uma
         skin de `inverseBindMatrices` própria), o corpo se deforma;
       - sem desquantizar (KHR_mesh_quantization: posição é inteiro
         NORMALIZADO, ou seja, mora em [-1,1]), escrever a correção por cima
         corta em ±1 e um punhado de vértices voa. Medido: as caixas de duas
         peças erravam 13,6 e 6,6 enquanto as outras batiam na quinta casa. */
    for (const [i, ouro] of OURO_ESQ.entries()) {
      perto(r.partes[i].caixa, ouro.caixa, `esqueleto/${ouro.nome}`);
    }
    assert.ok(r.esfera && r.esfera.r > 0 && Number.isFinite(r.esfera.r),
      'a malha fundida precisa de esfera de bounds: sem ela o frustum culling some');
  });

  it('sete esqueletos na frente da câmera custam SETE draw calls', async () => {
    const medido = await h.play(() => {
      const G = window.__game, MP = window.__MP, R = MP.renderer;
      const P = MP.player.pos;
      const dir = new MP.THREE.Vector3();
      MP.camera.getWorldDirection(dir);
      dir.y = 0; dir.normalize();
      const lado = new MP.THREE.Vector3(-dir.z, 0, dir.x);
      G.Skeletons.list.forEach((s, i) => {
        const d = 6 + i * 1.1, l = (i - 3) * 1.6;
        const x = P.x + dir.x * d + lado.x * l, z = P.z + dir.z * d + lado.z * l;
        s.group.position.set(x, MP.heightAt(x, z), z);
        s.group.visible = true;
        s.group.updateMatrixWorld(true);
      });
      const autoSalvo = R.info.autoReset, sombraSalva = R.shadowMap.enabled;
      R.info.autoReset = false;
      R.shadowMap.enabled = false;
      const frame = () => {
        G.tick(0);
        R.info.reset();
        R.render(MP.scene, MP.camera);
        return { calls: R.info.render.calls, tris: R.info.render.triangles };
      };
      for (let i = 0; i < 20; i++) frame();
      const com = frame();
      const vis = G.Skeletons.list.map(s => s.group.visible);
      for (const s of G.Skeletons.list) s.group.visible = false;
      for (let i = 0; i < 3; i++) frame();
      const sem = frame();
      G.Skeletons.list.forEach((s, i) => { s.group.visible = vis[i]; });
      R.info.autoReset = autoSalvo;
      R.shadowMap.enabled = sombraSalva;
      return { custo: com.calls - sem.calls, tris: com.tris - sem.tris, com: com.calls };
    });
    assert.equal(medido.custo, 7,
      `os 7 esqueletos custaram ${medido.custo} draw calls MONO (o alvo é 7, uma por esqueleto; ` +
      'com as quatro submalhas do GLB eram 28)');
    assert.ok(medido.tris > 40000,
      `pré-condição vazia: só ${medido.tris} triângulos de esqueleto no quadro`);
  });
});
