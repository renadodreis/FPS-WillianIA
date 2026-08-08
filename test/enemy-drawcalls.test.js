/* ================================================================
   QA — FUSÃO DO CORPO PROCEDURAL DOS INIMIGOS (draw calls)

   O boneco procedural era montado com 32 (executivo) a 37 (pesado) `new
   THREE.Mesh` soltos, e cada um é UMA draw call. Medido no viewport de
   celular com o mundo recém-criado, os 8 executivos da Torre Nexus custavam
   256 das 560 draw calls do frame.

   js/meshutils.js:fuseBody funde as peças em poucas malhas — uma por
   (material, castShadow) — usando os membros articulados como ossos rígidos.
   Este arquivo é a rede de proteção do que NÃO pode mudar junto:

     1. draw calls caem de verdade;
     2. hitbox é analítica (hitSpheres) e continua idêntica — tiro na cabeça
        segue sendo tiro na cabeça;
     3. a silhueta de CADA material, numa POSE ANIMADA, é a mesma casa decimal
        por casa decimal (cor, rugosidade, metalicidade, posição e articulação);
     4. a silhueta que projeta sombra é a mesma, e os materiais continuam
        registrados no CSM;
     5. a esfera delimitadora do SkinnedMesh cobre a pose animada (armadilha
        do three r185: ela não acompanha os ossos);
     6. o contrato do `Math.random` seedado não andou — fundir cria objetos
        THREE novos e cada UUID come 4 sorteios do stream do worldgen.

   Os valores dourados abaixo foram colhidos em HEAD (13b3552 + rodada de
   celular), com WORLD_SEED=424242, ANTES da fusão existir.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

/* pose fixa de mira: braços à frente, cabeça virada, pernas em passo */
const POSE = {
  armR: [-Math.PI / 2 + 0.31, 0, 0],
  armL: [-Math.PI / 2 + 0.45, 0, 0.6],
  legL: [0.53, 0, 0],
  legR: [-0.53, 0, 0],
  head: [0, 0.7, 0],
};

/* Dourados de HEAD. Chave = cor|tipo|rugosidade|metalicidade; valor = caixa
   [min, max] que os vértices DAQUELE material ocupam, na pose acima, com o
   grupo na origem. O plano do flash (ffd9a0) fica de fora: ele tinha
   opacidade 0 fora do tiro e agora fica invisível — é a única mudança. */
const OURO = {
  executivo: {
    drawCalls: 32,
    caixaSombra: [[-0.573, 0.145, -0.43], [0.578, 2.02, 0.43]],
    porMaterial: {
      '14161a|MeshStandardMaterial|r0.5|m0.5': [[0.405, 1.189, 0.536], [0.475, 1.98, 0.84]],
      '151712|MeshStandardMaterial|r0.6|m0': [[-0.016, 1.775, 0.019], [0.261, 1.845, 0.272]],
      '16181d|MeshStandardMaterial|r0.55|m0.1': [[-0.573, 0.387, -0.302], [0.578, 2.08, 0.428]],
      '22252d|MeshStandardMaterial|r0.6|m0.3': [[-0.29, 0.04, -0.466], [0.51, 1.503, 0.792]],
      '8a1620|MeshStandardMaterial|r0.6|m0': [[-0.035, 1.01, 0.281], [0.035, 1.35, 0.339]],
      'c9a182|MeshStandardMaterial|r0.75|m0': [[-0.239, 1.54, -0.239], [0.239, 2.02, 0.239]],
      'e8e8ea|MeshStandardMaterial|r0.7|m0': [[-0.13, 0.99, 0.21], [0.13, 1.45, 0.31]],
    },
  },
  soldado: {
    drawCalls: 36,
    caixaSombra: [[-0.573, 0.145, -0.43], [0.578, 2.105, 0.43]],
    porMaterial: {
      '14161a|MeshStandardMaterial|r0.5|m0.5': [[0.405, 1.189, 0.536], [0.475, 1.98, 0.84]],
      '200505|MeshStandardMaterial|r0.3|m0': [[-0.012, 1.735, 0.023], [0.27, 1.825, 0.283]],
      '22252d|MeshStandardMaterial|r0.6|m0.3': [[-0.29, 0.04, -0.466], [0.51, 2.02, 0.792]],
      '4a5240|MeshStandardMaterial|r0.75|m0.05': [[-0.464, 0.423, -0.302], [0.515, 1.69, 0.428]],
      '59626f|MeshStandardMaterial|r0.45|m0.45': [[-0.573, 0.387, -0.304], [0.578, 2.105, 0.308]],
    },
  },
  pesado: {
    drawCalls: 37,
    caixaSombra: [[-0.573, 0.145, -0.43], [0.578, 2.105, 0.43]],
    porMaterial: {
      '14161a|MeshStandardMaterial|r0.5|m0.5': [[0.405, 1.189, 0.536], [0.475, 1.98, 0.84]],
      '200505|MeshStandardMaterial|r0.3|m0': [[-0.012, 1.735, 0.023], [0.27, 1.825, 0.283]],
      '22252d|MeshStandardMaterial|r0.6|m0.3': [[-0.29, 0.04, -0.466], [0.51, 2.02, 0.792]],
      '272b34|MeshStandardMaterial|r0.4|m0.55': [[-0.573, 0.387, -0.304], [0.578, 2.105, 0.308]],
      '363b46|MeshStandardMaterial|r0.7|m0.1': [[-0.464, 0.423, -0.302], [0.515, 1.69, 0.428]],
      '9c5018|MeshStandardMaterial|r0.5|m0.3': [[-0.2, 1.07, -0.4], [0.2, 2.29, 0.066]],
    },
  },
};

/* teto de draw calls por inimigo procedural: uma malha por (material,
   castShadow). Executivo/pesado usam 6 materiais, soldado 5. */
const TETO = { executivo: 10, soldado: 8, pesado: 10 };

/* Materiais standard do corpo que NÃO estão registrados no CSM — estado de
   HEAD, reproduzido aqui pra a fusão não mexer nele sem querer (nem pra mais
   nem pra menos). O visor é emissivo de propósito; os óculos do executivo
   usam o material do soco das mãos em 1ª pessoa (js/weapons.js), que vive
   fora do CSM. Não é do escopo desta rodada consertar. */
const OURO_SEM_CSM = {
  executivo: ['151712|MeshStandardMaterial|r0.6|m0'],
  soldado: ['200505|MeshStandardMaterial|r0.3|m0'],
  pesado: ['200505|MeshStandardMaterial|r0.3|m0'],
};

/* stream seedado LOGO A JUSANTE do buildBody: se a fusão consumir um
   `Math.random` a mais ou a menos, isto anda (e o mapa inteiro atrás). */
const OURO_SEED = {
  casas: [[79.8919, 118.9435], [-345.0308, -214.8442], [-19.1836, -72.3092]],
  waypoints: [[93.2651, 124.1702], [-336.2117, -206.5287], [-5.6515, -66.9843]],
  yaws: [5.3518, 5.0665, 0.573],
  animais: [[-53.0398, -129.1791], [264.5897, 83.0253], [-33.6206, -91.5028]],
};

describe('Inimigos — corpo fundido sem mudar o que aparece', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, perfis;
  before(async () => {
    /* O GLB do Guardião troca o visual de quem não é executivo e esconde o
       corpo procedural. Bloqueá-lo deixa os três tipos procedurais na mesa e
       tira a corrida de carregamento do caminho do teste. */
    h = await bootGame({ port: 3246, blockRequests: ['Guardiao'] });
    perfis = await h.play(pose => {
      const G = window.QA.G, MP = window.QA.MP, THREE = MP.THREE;
      const rd = v => +v.toFixed(3);
      const vertsWorld = (mesh, cb) => {
        const v = new THREE.Vector3();
        const pos = mesh.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          if (mesh.isSkinnedMesh) mesh.getVertexPosition(i, v);
          else v.fromBufferAttribute(pos, i);
          cb(v.applyMatrix4(mesh.matrixWorld));
        }
      };
      const perfil = e => {
        const g = e.group;
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.setScalar(1);
        for (const k of Object.keys(pose)) e.parts[k].rotation.set(...pose[k]);
        g.updateMatrixWorld(true);
        if (e.skeleton) e.skeleton.update();
        const porMat = {}, caixaSombra = new THREE.Box3();
        let malhas = 0, foraDaEsfera = 0, semCsm = [];
        g.traverse(o => {
          if (!(o.isMesh || o.isSkinnedMesh) || !o.visible) return;
          malhas++;
          const m = Array.isArray(o.material) ? o.material[0] : o.material;
          const key = `${m.color.getHexString()}|${m.type}|r${m.roughness}|m${m.metalness}`;
          const box = porMat[key] ? new THREE.Box3(
            new THREE.Vector3(...porMat[key][0]), new THREE.Vector3(...porMat[key][1])) : new THREE.Box3();
          const esfera = o.boundingSphere && o.boundingSphere.clone().applyMatrix4(o.matrixWorld);
          vertsWorld(o, v => {
            box.expandByPoint(v);
            if (o.castShadow) caixaSombra.expandByPoint(v);
            if (esfera && v.distanceTo(esfera.center) > esfera.radius + 1e-4) foraDaEsfera++;
          });
          porMat[key] = [box.min.toArray().map(rd), box.max.toArray().map(rd)];
          if (m.isMeshStandardMaterial && !G.csmDebug.hasMaterial(m)) semCsm.push(key);
        });
        return { malhas, foraDaEsfera, semCsm,
          caixaSombra: [caixaSombra.min.toArray().map(rd), caixaSombra.max.toArray().map(rd)],
          porMaterial: porMat,
          partes: Object.keys(e.parts).sort(),
          hitSpheres: e.hitSpheres().map(s => ({ r: +s.r.toFixed(4), part: s.part,
            dy: +(s.c.y - g.position.y).toFixed(4) })) };
      };
      const draws = e => { // draw calls REAIS: só esse inimigo visível
        const cam = MP.camera;
        cam.position.set(0, 1.1, 6); cam.rotation.set(0, 0, 0); cam.updateMatrixWorld(true);
        const prev = new Map();
        MP.scene.children.forEach(c => { prev.set(c, c.visible); c.visible = false; });
        e.group.visible = true;
        MP.renderer.info.autoReset = true;
        MP.renderer.render(MP.scene, cam);
        const n = MP.renderer.info.render.calls;
        MP.scene.children.forEach(c => { c.visible = prev.get(c); });
        return n;
      };
      const achar = {
        executivo: G.Enemies.list.find(e => e.suit && !e.hasModel),
        soldado: G.Enemies.list.find(e => !e.suit && !e.heavy && !e.hasModel),
        pesado: G.Enemies.list.find(e => e.heavy && !e.hasModel),
      };
      const out = { semente: {
        casas: G.Enemies.list.slice(0, 3).map(e => [+e.home.x.toFixed(4), +e.home.z.toFixed(4)]),
        waypoints: G.Enemies.list.slice(0, 3).map(e => [+e.waypoints[0].x.toFixed(4), +e.waypoints[0].z.toFixed(4)]),
        yaws: G.Enemies.list.slice(0, 3).map(e => +e.yaw.toFixed(4)),
        animais: G.Animals.list.slice(0, 3).map(a => [+a.group.position.x.toFixed(4), +a.group.position.z.toFixed(4)]),
      } };
      for (const [nome, e] of Object.entries(achar)) {
        if (!e) { out[nome] = null; continue; }
        out[nome] = perfil(e);
        out[nome].drawCalls = draws(e);
      }
      return out;
    }, POSE);
  });
  after(async () => { if (h) await h.close(); });

  for (const nome of ['executivo', 'soldado', 'pesado']) {
    it(`${nome}: draw calls caem sem perder nenhuma peça`, () => {
      const p = perfis[nome];
      assert.ok(p, `nenhum inimigo do tipo ${nome} nasceu procedural`);
      assert.ok(p.drawCalls <= TETO[nome],
        `${nome} desenha ${p.drawCalls} malhas (teto ${TETO[nome]}, era ${OURO[nome].drawCalls})`);
      assert.equal(p.malhas, p.drawCalls, 'malha visível que não vira draw call (ou vice-versa)');
      // nenhum material sumiu: a fusão é por material, então a conta fecha
      assert.deepEqual(Object.keys(p.porMaterial).sort(),
        Object.keys(OURO[nome].porMaterial).sort());
    });

    it(`${nome}: cada material ocupa o MESMO volume na pose animada`, () => {
      const p = perfis[nome];
      const dif = [];
      for (const [k, ouro] of Object.entries(OURO[nome].porMaterial)) {
        const agora = p.porMaterial[k];
        for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++)
          if (Math.abs(agora[i][j] - ouro[i][j]) > 0.002)
            dif.push(`${k} [${i}][${j}]: ouro ${ouro[i][j]} agora ${agora[i][j]}`);
      }
      assert.deepEqual(dif, [], `silhueta por material mudou:\n${dif.join('\n')}`);
    });

    it(`${nome}: a silhueta que projeta sombra é a mesma`, () => {
      const p = perfis[nome];
      const ouro = OURO[nome].caixaSombra;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++)
        assert.ok(Math.abs(p.caixaSombra[i][j] - ouro[i][j]) <= 0.002,
          `caixa de sombra [${i}][${j}]: ouro ${ouro[i][j]} agora ${p.caixaSombra[i][j]}`);
      assert.deepEqual([...new Set(p.semCsm)].sort(), OURO_SEM_CSM[nome],
        'mudou quais materiais do corpo recebem as cascatas do CSM');
    });

    it(`${nome}: esfera delimitadora cobre a pose animada (r185)`, () => {
      assert.equal(perfis[nome].foraDaEsfera, 0,
        'vértice fora da bounding sphere: o inimigo some da tela ao mirar');
    });

    it(`${nome}: hitbox analítica intacta e membros ainda articulados`, () => {
      const p = perfis[nome];
      assert.deepEqual(p.partes, ['armL', 'armR', 'head', 'legL', 'legR']);
      assert.deepEqual(p.hitSpheres, [
        { r: 0.3, part: 'head', dy: 1.8 },
        { r: 0.43, part: 'body', dy: 1.22 },
        { r: 0.4, part: 'body', dy: 0.78 },
        { r: 0.36, part: 'body', dy: 0.36 },
      ]);
    });
  }

  it('o stream seedado do worldgen não andou (contrato do Math.random)', () => {
    assert.deepEqual(perfis.semente.casas, OURO_SEED.casas);
    assert.deepEqual(perfis.semente.waypoints, OURO_SEED.waypoints);
    assert.deepEqual(perfis.semente.yaws, OURO_SEED.yaws);
    assert.deepEqual(perfis.semente.animais, OURO_SEED.animais);
  });
});

describe('Inimigos — tiro na cabeça e no corpo depois da fusão', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootGame({ port: 3247, blockRequests: ['Guardiao'] }); });
  after(async () => { if (h) await h.close(); });

  it('a hitbox continua sendo a esfera analítica, não a malha fundida', async () => {
    const r = await h.play(() => {
      const QA = window.QA, G = QA.G, MP = QA.MP;
      QA.reset(30, 30);
      const e = G.Enemies.list.find(x => x.alive);
      // inimigo parado a 8 m à frente, no chão, sem IA por cima
      const P = MP.player.pos;
      e.group.position.set(P.x, MP.groundAt(P.x, P.z + 8, 999), P.z + 8);
      e.health = e.maxHp;
      const alvo = e.hitSpheres();
      const cabeca = alvo.find(s => s.part === 'head');
      const antes = e.health;
      // mira no CENTRO da esfera da cabeça: tem que contar como tiro na cabeça
      QA.aimAt(cabeca.c.x, cabeca.c.y, cabeca.c.z);
      G.mouse.clicked = true; G.mouse.shooting = true;
      QA.tick(2);
      G.mouse.clicked = false; G.mouse.shooting = false;
      return { antes, depois: e.health, acertou: e.health < antes, flinch: e.flinchT > 0 };
    });
    assert.ok(r.acertou, `tiro mirado na esfera da cabeça não tirou vida (${r.antes} -> ${r.depois})`);
    assert.ok(r.flinch, 'inimigo não reagiu ao impacto');
  });

  it('o fogo de cano só existe enquanto o tiro dura', async () => {
    const r = await h.play(() => {
      const G = window.QA.G;
      const e = G.Enemies.list.find(x => x.alive && !x.hasModel);
      const parado = e.flash.visible;
      e.flashT = 0.06;
      G.Enemies.update(1 / 240, 1);
      const atirando = e.flash.visible;
      e.flashT = 0;
      G.Enemies.update(1 / 240, 1);
      return { parado, atirando, depois: e.flash.visible };
    });
    assert.equal(r.parado, false, 'plano do flash desenhando com o inimigo parado');
    assert.equal(r.atirando, true, 'flash não aparece no disparo');
    assert.equal(r.depois, false, 'flash não some depois do disparo');
  });
});

describe('Criaturas da noite — zumbi e fantasma fundidos', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootGame({ port: 3248 }); });
  after(async () => { if (h) await h.close(); });

  it('zumbi vira 4 malhas e fantasma 2, com as mesmas cores', async () => {
    const r = await h.play(() => {
      const G = window.QA.G;
      const conta = c => {
        const cores = new Set(); let n = 0;
        c.group.traverse(o => {
          if (!o.isMesh) return;
          n++; cores.add(o.material.color.getHexString());
        });
        return { n, cores: [...cores].sort() };
      };
      const z = G.Night.list.find(c => !c.ghost), f = G.Night.list.find(c => c.ghost);
      return { zumbi: conta(z), fantasma: conta(f), temVeu: !!f.veu };
    });
    // zumbi: zRag(cast)+zRag+zMat+olhos ; fantasma: véu + olhos
    assert.equal(r.zumbi.n, 4, 'zumbi não fundiu como esperado');
    assert.deepEqual(r.zumbi.cores, ['100000', '3c3a30', '5a7a3e']);
    assert.equal(r.fantasma.n, 2, 'fantasma não fundiu como esperado');
    assert.deepEqual(r.fantasma.cores, ['100000', 'bfe8ff']);
    assert.ok(r.temVeu, 'fantasma sem referência do véu: a pulsação de opacidade quebra');
  });

  it('o véu do fantasma continua pulsando a opacidade', async () => {
    const r = await h.play(() => {
      const G = window.QA.G;
      const f = G.Night.list.find(c => c.ghost);
      f.alive = true; f.hp = 50; f.group.visible = true;
      // Env.nightK é getter: força noite fechada só durante a amostragem
      const orig = Object.getOwnPropertyDescriptor(G.Env, 'nightK');
      Object.defineProperty(G.Env, 'nightK', { get: () => 1, configurable: true });
      const amostras = [];
      try {
        for (let i = 0; i < 40; i++) { G.Night.update(1 / 60, i / 6); amostras.push(f.veu.material.opacity); }
      } finally { Object.defineProperty(G.Env, 'nightK', orig); }
      f.alive = false; f.group.visible = false;
      return { min: Math.min(...amostras), max: Math.max(...amostras) };
    });
    assert.ok(r.max - r.min > 0.05, `opacidade do véu parada (${r.min}..${r.max})`);
  });
});
