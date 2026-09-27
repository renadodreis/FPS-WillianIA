/* ================================================================
   QA — OCLUSÃO DA ASSISTÊNCIA (js/oclusao.js), núcleo puro.

   O módulo lê a cena por duck typing; aqui a "cena" é montada à mão com
   objetos soltos no mesmo formato do three (visible/parent/children,
   geometry.attributes.position, matrixWorld.elements em COLUNAS,
   instanceMatrix). Toda expectativa sai da GEOMETRIA montada no caso — onde
   está a caixa, por onde passa o raio — e não da saída do módulo.

   O teste de TELA (a âncora de pixels, com o caminhão e a copa de verdade) é
   test/aim-visibilidade.test.js; este prova o modelo: conservador (o que a
   malha ocupa bloqueia), mas justo (vão debaixo do chassi, térreo de prédio
   de vários andares, raio ao lado da caixa passam).
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let createOclusao, gradeDeTriangulos, gradeCorta, congelarGrade, inverteAfim, OCL;
before(async () => {
  ({ createOclusao, gradeDeTriangulos, gradeCorta, congelarGrade, inverteAfim, OCL } = await import('../js/oclusao.js'));
});

/* ---- geometria de teste ---- */
function trisCaixa(x0, y0, z0, x1, y1, z1) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const f = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [3, 2, 6], [3, 6, 7], [0, 3, 7], [0, 7, 4], [1, 5, 6], [1, 6, 2]];
  const out = [];
  for (const [a, b, c] of f) out.push(...v[a], ...v[b], ...v[c]);
  return out;
}
/* matriz TRS em colunas: giro em Y (rad), escala (número ou [x,y,z]), posição */
function trs(pos = [0, 0, 0], rotY = 0, esc = 1) {
  const [sx, sy, sz] = Array.isArray(esc) ? esc : [esc, esc, esc];
  const c = Math.cos(rotY), s = Math.sin(rotY);
  return Float64Array.from([c * sx, 0, -s * sx, 0, 0, sy, 0, 0, s * sz, 0, c * sz, 0, pos[0], pos[1], pos[2], 1]);
}
function cena() { return { visible: true, parent: null, children: [], add(o) { o.parent = this; this.children.push(o); return o; } }; }
function grupo(pai, pos, rotY = 0) {
  const g = { visible: true, parent: null, children: [], matrixWorld: { elements: trs(pos, rotY) }, add(o) { o.parent = this; this.children.push(o); return o; } };
  pai.add(g);
  return g;
}
function malha(pai, tris, { mat = { type: 'MeshStandardMaterial' }, matriz = trs(), skin = false, extra = {} } = {}) {
  const array = Float32Array.from(tris);
  const m = Object.assign({ isMesh: true, isSkinnedMesh: skin, visible: true, parent: null, children: [], material: mat,
    geometry: { attributes: { position: { array, itemSize: 3, count: array.length / 3 } }, index: null },
    matrixWorld: { elements: matriz } }, extra);
  pai.add ? pai.add(m) : (m.parent = pai, pai.children.push(m));
  return m;
}
function instancias(pai, tris, mats, extra = {}) {
  const im = new Float32Array(mats.length * 16);
  mats.forEach((m, i) => im.set(m, i * 16));
  return malha(pai, tris, { extra: Object.assign({ isInstancedMesh: true, count: mats.length, instanceMatrix: { array: im, version: 0 } }, extra) });
}
function pronta(raiz, o = {}) {
  const oc = createOclusao(Object.assign({ raiz }, o));
  oc.prontoJa();
  return oc;
}
const P = (x, y, z) => ({ x, y, z });

describe('grade de triângulos — a peça que decide', () => {
  it('dada uma parede, então o raio que a atravessa bloqueia; por cima, ao lado ou antes dela, não', () => {
    const g = gradeDeTriangulos(0.25, trisCaixa(5, 0, -2, 5.2, 3, 2));
    const corta = (a, b) => gradeCorta(g, a[0], a[1], a[2], b[0] - a[0], b[1] - a[1], b[2] - a[2], 0, 1);
    assert.equal(corta([0, 1.5, 0], [10, 1.5, 0]), true, 'atravessando a parede');
    assert.equal(corta([0, 3.5, 0], [10, 3.5, 0]), false, 'meio metro acima do topo (3 m)');
    assert.equal(corta([0, 1.5, 2.6], [10, 1.5, 2.6]), false, '0,6 m ao lado da ponta');
    assert.equal(corta([0, 1.5, 0], [4.6, 1.5, 0]), false, 'termina 0,4 m antes da parede');
  });

  it('dada uma coluna de 10 andares, então o raio no TÉRREO passa (os pisos não se fundem num bloco)', () => {
    /* numa grade de intervalos com teto por célula, 20 superfícies se
       fundiam: o térreo inteiro ficava "tampado" e a assistência morria
       dentro de qualquer prédio alto. Aqui cada laje é o triângulo dela. */
    const lajes = [];
    for (let a = 0; a < 10; a++) lajes.push(...trisCaixa(-10, a * 3.3, -10, 10, a * 3.3 + 0.3, 10));
    const g = gradeDeTriangulos(0.5, lajes);
    const corta = (y1, y2) => gradeCorta(g, -8, y1, 0, 16, y2 - y1, 0, 0, 1);
    assert.equal(corta(1.6, 1.6), false, 'olho a 1,6 m no térreo, alvo no mesmo andar');
    assert.equal(corta(1.6 + 6.6, 1.6 + 6.6), false, 'no 3º andar');
    assert.equal(corta(1.6, 1.6 + 3.3), true, 'do térreo para o andar de cima: atravessa a laje');
  });

  it('dada a BORDA de uma tenda no meio da célula, então o raio 0,3 m além dela passa (a célula não conta inteira)', () => {
    /* medido no jogo: o atirador na entrada de uma tenda perdia a assistência
       num alvo 1/3 visível logo além da borda — célula de 0,5 m inteira
       ocupada por uma borda que só entrava 0,1 m nela, a 1 m do olho */
    for (const congelar of [false, true]) {
      const g = gradeDeTriangulos(0.5, trisCaixa(-5, 0, -3, 0.1, 3, 3));   // a borda em x = 0,1: dentro da célula [0; 0,5)
      if (congelar) congelarGrade(g);
      const corta = (x) => gradeCorta(g, x, 1.62, 5, 0, 0, -15, 0, 1);
      assert.equal(corta(0.4), false, `${congelar ? 'congelada' : 'montagem'}: 0,3 m além da borda`);
      assert.equal(corta(0.05), true, `${congelar ? 'congelada' : 'montagem'}: 5 cm para dentro da borda`);
    }
  });

  it('dada a LONA INCLINADA dentro da célula, então o raio que passa POR BAIXO dela não é tampado', () => {
    /* o caso que a grade de intervalos errava (3 de 17 controles ao lado do
       caminhão): uma lona de 45° dentro de uma célula de 0,5 m ocupa uma
       faixa de Y inteira; o raio que passa 10 cm por baixo da lona, dentro
       dessa faixa, era "tampado". Com o triângulo exato, passa. */
    for (const congelar of [false, true]) {
      // lona: sobe de y = 1 em x = 0 até y = 1,5 em x = 0,5 (45°), z de -3 a 3
      const g = gradeDeTriangulos(0.5, [0, 1, -3, 0.5, 1.5, -3, 0.5, 1.5, 3, 0, 1, -3, 0.5, 1.5, 3, 0, 1, 3]);
      if (congelar) congelarGrade(g);
      // raio ao longo de z em x = 0,4 e y = 1,3: a lona ali está em y = 1,4
      assert.equal(gradeCorta(g, 0.4, 1.3, 6, 0, 0, -12, 0, 1), false, `${congelar ? 'congelada' : 'montagem'}: por baixo`);
      assert.equal(gradeCorta(g, 0.4, 1.3, 6, 0, 0.3, -12, 0, 1), true, `${congelar ? 'congelada' : 'montagem'}: subindo através da lona`);
    }
  });

  it('dada a aresta COMUM dos dois triângulos de uma parede, então o raio exatamente por ela não passa (não é fresta)', () => {
    // parede 4 × 3 m em z = 0, cortada na diagonal de (−2,0) a (2,3)
    const g = congelarGrade(gradeDeTriangulos(0.25, [-2, 0, 0, 2, 0, 0, 2, 3, 0, -2, 0, 0, 2, 3, 0, -2, 3, 0]));
    let fura = 0;
    for (let k = 1; k < 200; k++) {
      const f = k / 200, x = -2 + 4 * f, y = 3 * f;            // ponto SOBRE a diagonal
      if (!gradeCorta(g, x * 0.37, y, 5, 2 * (x - x * 0.37), 0, -10, 0, 1)) fura++;   // em t = 0,5 está em (x, y, 0)
    }
    assert.equal(fura, 0, `${fura} de 199 raios pela aresta comum atravessaram a parede`);
  });

  it('dada uma parede na DIAGONAL, então um raio paralelo a 0,6 m dela passa', () => {
    // parede fina de (0,0) a (10,10), 3 m de altura: dois triângulos verticais
    const g = gradeDeTriangulos(0.25, [0, 0, 0, 10, 0, 10, 10, 3, 10, 0, 0, 0, 10, 3, 10, 0, 3, 0]);
    const off = 0.6 / Math.SQRT2;
    assert.equal(gradeCorta(g, 1 + off, 1.5, 1 - off, 8, 0, 8, 0, 1), false, 'paralelo a 0,6 m');
    assert.equal(gradeCorta(g, 3, 1.5, 7, 4, 0, -4, 0, 1), true, 'cruzando a parede');
  });

  it('dada a grade CONGELADA (forma compacta), então ela responde IGUAL à de montagem em 3 000 raios', () => {
    /* a congelada é a que o jogo consulta; a de montagem é a que os casos
       acima exercitam. Os descartes da congelada (caixa XZ e faixa de Y)
       são quantizados para FORA, e a decisão é o triângulo exato nas duas:
       a resposta tem de ser a mesma. Um raio a menos seria vazamento criado
       pela compactação. Triângulos e raios de uma LCG fixa (nada de
       Math.random: o módulo nem o toca, e o teste também não) */
    let sd = 7;
    const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
    const tris = [];
    for (let a = 0; a < 400; a++) {
      const x = rnd() * 30 - 15, y = rnd() * 12, z = rnd() * 30 - 15;
      tris.push([x, y, z, x + rnd() * 3 - 1.5, y + rnd() * 3 - 1.5, z + rnd() * 3 - 1.5, x + rnd() * 3 - 1.5, y + rnd() * 3 - 1.5, z + rnd() * 3 - 1.5]);
    }
    // uma coluna de 40 superfícies na mesma célula
    for (let a = 0; a < 40; a++) tris.push([0.1, a * 0.5, 0.1, 0.2, a * 0.5, 0.1, 0.1, a * 0.5, 0.2]);
    const viva = gradeDeTriangulos(0.3, tris.flat()), fria = congelarGrade(gradeDeTriangulos(0.3, tris.flat()));
    let vazou = 0, aMais = 0, bloqueados = 0;
    for (let a = 0; a < 3000; a++) {
      const o = [rnd() * 40 - 20, rnd() * 14 - 1, rnd() * 40 - 20], p = [rnd() * 40 - 20, rnd() * 14 - 1, rnd() * 40 - 20];
      const args = [o[0], o[1], o[2], p[0] - o[0], p[1] - o[1], p[2] - o[2], 0, 1];
      const v = gradeCorta(viva, ...args), f = gradeCorta(fria, ...args);
      if (v && !f) vazou++;
      if (f && !v) aMais++;
      if (v) bloqueados++;
    }
    console.log(`  [congelada] ${bloqueados} de 3000 bloqueados; a congelada deixou passar ${vazou} e bloqueou ${aMais} a mais`);
    assert.ok(bloqueados > 300 && bloqueados < 2700, `cenário: ${bloqueados} de 3000 bloqueados — pouco contraste`);
    assert.equal(vazou, 0, `a compactação deixou passar ${vazou} raios que a grade bloqueava`);
    assert.equal(aMais, 0, `a compactação bloqueou ${aMais} raios a mais`);
  });

  it('dada uma matriz afim com giro e escala, então a inversa leva o mundo de volta ao local', () => {
    const e = trs([3, -2, 7], 0.7, [2, 0.5, 1.5]), o = new Float64Array(12);
    assert.equal(inverteAfim(e, o), true);
    const lx = 0.3, ly = -1.2, lz = 2.1;
    const wx = e[0] * lx + e[4] * ly + e[8] * lz + e[12], wy = e[1] * lx + e[5] * ly + e[9] * lz + e[13], wz = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
    const bx = o[0] * wx + o[1] * wy + o[2] * wz + o[9], by = o[3] * wx + o[4] * wy + o[5] * wz + o[10], bz = o[6] * wx + o[7] * wy + o[8] * wz + o[11];
    assert.ok(Math.hypot(bx - lx, by - ly, bz - lz) < 1e-9, `volta: (${bx}, ${by}, ${bz})`);
    assert.equal(inverteAfim(trs([0, 0, 0], 0, 0), o), false, 'escala zero não inverte');
  });
});

describe('oclusão — veículo, e o que NÃO pode tampar', () => {
  /* "caminhão": chassi de 5,3 × 1,6 × 2 m com o piso a 0,5 m do chão (vão
     entre as rodas), num grupo que anda */
  function caminhao(raiz, pos = [0, 0, 0], rotY = 0) {
    const g = grupo(raiz, pos, rotY);
    const m = malha(g, trisCaixa(-2.65, 0.5, -1, 2.65, 3.0, 1), { matriz: trs(pos, rotY) });
    return { g, m };
  }

  it('dado o alvo atrás do caminhão, então tampa; 1 m além da ponta, não; pelo vão do chassi, não', () => {
    const raiz = cena();
    caminhao(raiz);
    const oc = pronta(raiz);
    const olho = P(0, 1.62, 15);
    assert.equal(oc.tampa(olho, P(0, 1.66, -2.2), 0.28), true, 'cabeça atrás do caminhão');
    assert.equal(oc.tampa(olho, P(3.8, 1.66, -2.2), 0.28), false, 'cabeça 1,15 m além da ponta');
    // olho agachado a 0,3 m, pés do alvo a 0,3 m: raio horizontal por baixo do chassi
    assert.equal(oc.tampa(P(0, 0.3, 15), P(0, 0.3, -2.2), 0.1), false, 'pelo vão debaixo do chassi');
  });

  it('dado o caminhão ANDANDO, então a oclusão vai junto (a pose é a do quadro)', () => {
    const raiz = cena();
    const { g, m } = caminhao(raiz);
    const oc = pronta(raiz);
    const olho = P(0, 1.62, 15);
    assert.equal(oc.tampa(olho, P(0, 1.66, -2.2), 0.28), true);
    m.matrixWorld.elements = trs([12, 0, 0]); g.matrixWorld.elements = trs([12, 0, 0]);
    oc.atualizar();
    assert.equal(oc.tampa(olho, P(0, 1.66, -2.2), 0.28), false, 'o caminhão saiu da frente e ainda tampou');
    assert.equal(oc.tampa(olho, P(12, 1.66, -2.2), 0.28), true, 'o caminhão chegou e não tampou');
  });

  it('dado vidro (transparente), shader, personagem animado, malha pequena ou raiz ignorada, então NÃO tampa', () => {
    const casos = {
      vidro: { mat: { type: 'MeshStandardMaterial', transparent: true, opacity: 0.6 } },
      shader: { mat: { type: 'ShaderMaterial', isShaderMaterial: true } },
      personagem: { skin: true },
    };
    for (const [nome, o] of Object.entries(casos)) {
      const raiz = cena();
      malha(raiz, trisCaixa(-2.65, 0.5, -1, 2.65, 3.0, 1), o);
      assert.equal(pronta(raiz).tampa(P(0, 1.62, 15), P(0, 1.66, -2.2), 0.28), false, nome);
    }
    // pequena: um cubo de 20 cm bem na frente do olho não esconde um corpo
    const r1 = cena();
    malha(r1, trisCaixa(-0.1, 1.55, 4.9, 0.1, 1.75, 5.1));
    assert.equal(pronta(r1).tampa(P(0, 1.62, 15), P(0, 1.66, -2.2), 0.28), false, 'pequena');
    // ignorada pelo jogo (a arma na câmera, a grama…)
    const r2 = cena();
    const arma = malha(r2, trisCaixa(-2.65, 0.5, -1, 2.65, 3.0, 1));
    assert.equal(pronta(r2, { ignorar: o => o === arma }).tampa(P(0, 1.62, 15), P(0, 1.66, -2.2), 0.28), false, 'ignorada');
    // controle: a MESMA caixa, opaca e sem regra nenhuma, tampa (os casos acima exercitam as regras)
    const r3 = cena();
    malha(r3, trisCaixa(-2.65, 0.5, -1, 2.65, 3.0, 1));
    assert.equal(pronta(r3).tampa(P(0, 1.62, 15), P(0, 1.66, -2.2), 0.28), true, 'controle');
  });

  it('dado o corpo do PRÓPRIO alvo (ou de qualquer alvo da lista), então ele não tampa a si mesmo', () => {
    const raiz = cena();
    const corpo = grupo(raiz, [0, 0, -2.2]);
    malha(corpo, trisCaixa(-0.3, 0, -0.2, 0.3, 1.9, 0.2), { matriz: trs([0, 0, -2.2]) });
    // sem saber que é alvo: o corpo tampa o centro da própria cabeça? (sim — é o defeito que o `dono` evita)
    const cru = pronta(raiz);
    assert.equal(cru.tampa(P(0, 1.62, 15), P(0, 1.1, -2.2), 0.05), true, 'cenário: sem o dono o corpo se tampa');
    assert.equal(cru.tampa(P(0, 1.62, 15), P(0, 1.1, -2.2), 0.05, corpo), false, 'passando o dono');
    const lista = pronta(raiz, { alvos: () => [{ group: corpo }] });
    assert.equal(lista.tampa(P(0, 1.62, 15), P(0, 1.1, -2.2), 0.05), false, 'alvo da lista nem é registrado');
  });

  it('dada a malha escondida ou fora da cena, então não tampa (a tela não a desenha)', () => {
    const raiz = cena();
    const { g } = caminhao(raiz);
    const oc = pronta(raiz);
    const olho = P(0, 1.62, 15), alvo = P(0, 1.66, -2.2);
    g.visible = false;
    assert.equal(oc.tampa(olho, alvo, 0.28), false, 'pai invisível');
    g.visible = true;
    assert.equal(oc.tampa(olho, alvo, 0.28), true, 'controle');
    raiz.children.splice(raiz.children.indexOf(g), 1); g.parent = null;
    assert.equal(oc.tampa(olho, alvo, 0.28), false, 'fora da cena');
  });

  it('dada uma malha ainda NÃO rasterizada, então conta a caixa inteira (na dúvida, não assiste)', () => {
    const raiz = cena();
    // "L": laje fina lá em cima; a caixa dela cobre o raio, a malha não
    malha(raiz, [...trisCaixa(-3, 0, -1, 3, 0.2, 1), ...trisCaixa(-3, 3.8, -1, 3, 4.0, 1)]);
    let relogio = 0;
    const oc = createOclusao({ raiz, agora: () => (relogio += 1000) });   // todo orçamento estoura na hora
    oc.atualizar();
    assert.ok(oc.pendentes > 0, 'cenário: devia ficar pendente');
    assert.equal(oc.tampa(P(0, 1.62, 15), P(0, 1.66, -2.2), 0.28), true, 'pendente: a caixa conta');
    oc.prontoJa();
    assert.equal(oc.tampa(P(0, 1.62, 15), P(0, 1.66, -2.2), 0.28), false, 'rasterizada: o raio passa entre as lajes');
  });

  it('dado algo MAIS PERTO do olho que o plano próximo da câmera (0,08 m), então não tampa — a 0,15 m, tampa', () => {
    /* a câmera corta o que está a menos de 0,08 m do olho (game.js): isso a
       tela não mostra. Um painel a 5 cm na frente do olho não esconde nada;
       o mesmo painel a 15 cm esconde. */
    for (const [dist, espera] of [[0.05, false], [0.15, true]]) {
      const raiz = cena();
      malha(raiz, trisCaixa(-0.6, 1.0, 15 - dist - 0.01, 0.6, 2.2, 15 - dist));   // painel fino de 1,2 × 1,2 m
      assert.equal(pronta(raiz).tampa(P(0, 1.62, 15), P(0, 1.66, -2.2), 0.28), espera, `painel a ${dist} m do olho`);
    }
  });
});

describe('oclusão — instâncias (árvore) e terreno', () => {
  /* "árvore": tronco 0,5 × 3 m e copa 5 × 3 × 5 m de 3 a 6 m de altura */
  const ARVORE = [...trisCaixa(-0.25, 0, -0.25, 0.25, 3, 0.25), ...trisCaixa(-2.5, 3, -2.5, 2.5, 6, 2.5)];

  it('dada a copa entre um olho no alto e o alvo, então tampa; o mesmo alvo visto de lado (sob a copa), não', () => {
    const raiz = cena();
    instancias(raiz, ARVORE, [trs([0, 0, 0], 0.4, 1.2), trs([40, 0, 0])]);
    const oc = pronta(raiz);
    // atirador 7 m acima do chão a 14 m; alvo 1,4 m do tronco
    assert.equal(oc.tampa(P(-14, 8.6, 0), P(1.4, 1.66, 0), 0.28), true, 'de cima, através da copa');
    assert.equal(oc.tampa(P(-14, 1.62, 0.9), P(1.4, 1.66, 0.9), 0.28), false, 'de lado, sob a copa, fora do tronco');
    assert.equal(oc.tampa(P(-14, 1.62, 0), P(1.4, 1.66, 0), 0.28), true, 'de lado, pelo tronco');
    assert.equal(oc.tampa(P(30, 8.6, 0), P(40, 1.66, 3), 0.28), true, 'a SEGUNDA instância (sem giro) também');
  });

  it('dado um conjunto de instâncias ainda PENDENTE, então tampa perto de cada instância, não no mapa inteiro', () => {
    /* as árvores chegam por GLB depois do boot; a caixa do conjunto é o mapa.
       Contar a caixa inteira enquanto a grade se monta apagava a assistência
       em todo lugar por dezenas de quadros — e tornava o teste de jogo
       dependente do relógio (medido: o mesmo rastreio deu +1,7 % e −0,0 %
       em duas rodadas). A esfera de cada instância também contém tudo. */
    const raiz = cena();
    instancias(raiz, ARVORE, [trs([0, 0, 0]), trs([200, 0, 0])]);
    let relogio = 0;
    const oc = createOclusao({ raiz, agora: () => (relogio += 1000) });
    oc.atualizar();
    assert.ok(oc.pendentes > 0, 'cenário: devia ficar pendente');
    assert.equal(oc.tampa(P(-14, 1.62, 0.9), P(1.4, 1.66, 0.9), 0.28), true, 'pendente: perto da árvore, na dúvida tampa');
    assert.equal(oc.tampa(P(90, 1.62, 0), P(110, 1.66, 0), 0.28), false, 'pendente: no meio do mapa, longe das duas árvores');
  });

  it('dada a instância reescrita (LOD das árvores), então vale a matriz NOVA', () => {
    const raiz = cena();
    const m = instancias(raiz, ARVORE, [trs([0, 0, 0])]);
    const oc = pronta(raiz);
    assert.equal(oc.tampa(P(-14, 8.6, 0), P(1.4, 1.66, 0), 0.28), true);
    m.instanceMatrix.array.set(trs([200, 0, 0]), 0); m.instanceMatrix.version++;
    oc.atualizar();
    assert.equal(oc.tampa(P(-14, 8.6, 0), P(1.4, 1.66, 0), 0.28), false, 'a árvore mudou de lugar e ainda tampa o lugar velho');
    assert.equal(oc.tampa(P(186, 8.6, 0), P(201.4, 1.66, 0), 0.28), true, 'e não tampa o lugar novo');
    /* e reescrita DEPOIS do atualizar do quadro (o LOD roda mais adiante no
       tick): a consulta seguinte já tem de ver a matriz nova */
    m.instanceMatrix.array.set(trs([0, 0, 0]), 0); m.instanceMatrix.version++;
    assert.equal(oc.tampa(P(-14, 8.6, 0), P(1.4, 1.66, 0), 0.28), true, 'reescrita no meio do quadro: a consulta usou a matriz velha');
  });

  it('dada uma crista FINA (0,6 m) de terreno em qualquer ponto do caminho, então a marcha a vê sempre', () => {
    /* a marcha do tiro (1,6 m) acerta ou pula uma crista de 0,6 m conforme
       onde ela cai; a da assistência (0,5 m) não pode pular nenhuma. 40
       posições da crista entre 8 e 12 m. */
    let vistas = 0, puladasPeloTiro = 0;
    for (let k = 0; k < 40; k++) {
      const c = 8 + k * 0.1;
      const heightAt = x => (Math.abs(x - c) < 0.3 ? 3 : 0);
      if (pronta(cena(), { heightAt }).tampa(P(0, 1.62, 0), P(20, 1.66, 0), 0.28)) vistas++;
      let pega = false;
      for (let dd = 1.6; dd < 20; dd += 1.6) if (1.62 < heightAt(dd)) pega = true;
      if (!pega) puladasPeloTiro++;
    }
    assert.ok(puladasPeloTiro > 0, 'cenário: a marcha de 1,6 m do tiro devia pular alguma');
    assert.equal(vistas, 40, `a assistência viu através de ${40 - vistas} de 40 cristas`);
    const heightAt = x => (Math.abs(x - 10) < 0.3 ? 3 : 0);
    assert.equal(pronta(cena(), { heightAt }).tampa(P(0, 3.5, 0), P(20, 3.5, 0), 0.28), false, 'por cima da crista');
  });
});

describe('oclusão — geometria indexada, quantizada e intercalada (o que os GLB otimizados trazem)', () => {
  it('dada a posição em Int16 normalizado com índice, então a grade é a do valor DESNORMALIZADO', () => {
    const raiz = cena();
    const t = trisCaixa(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5);   // cubo unitário
    const verts = [], index = [];
    for (let i = 0; i < t.length; i += 3) { verts.push(Math.round(t[i] * 32767), Math.round(t[i + 1] * 32767), Math.round(t[i + 2] * 32767)); index.push(i / 3); }
    const array = Int16Array.from(verts);
    const m = malha(raiz, [], { matriz: trs([0, 1.5, 0], 0, 4) });   // escala 4: cubo de 4 m centrado a 1,5 m
    m.geometry = { attributes: { position: { array, itemSize: 3, count: array.length / 3, normalized: true } },
      index: { array: Uint16Array.from(index), count: index.length } };
    const oc = pronta(raiz);
    assert.equal(oc.tampa(P(0, 1.62, 15), P(0, 1.66, -8), 0.28), true, 'atravessa o cubo de 4 m');
    assert.equal(oc.tampa(P(3, 1.62, 15), P(3, 1.66, -8), 0.28), false, 'passa 1 m ao lado');
  });
});

describe('oclusão — custo', () => {
  it('dados 300 árvores e 9 raios de 60 m, então a consulta cabe no quadro do celular', () => {
    const raiz = cena();
    const mats = [];
    for (let i = 0; i < 300; i++) mats.push(trs([((i * 37) % 200) - 100, 0, ((i * 91) % 200) - 100], i));
    instancias(raiz, [...trisCaixa(-0.25, 0, -0.25, 0.25, 3, 0.25), ...trisCaixa(-2.5, 3, -2.5, 2.5, 6, 2.5)], mats);
    const oc = pronta(raiz, { heightAt: () => 0 });
    const t0 = process.hrtime.bigint();
    let n = 0;
    for (let k = 0; k < 200; k++) for (let a = 0; a < 9; a++) {
      const ang = (k * 9 + a) * 0.37;
      oc.tampa(P(0, 1.62, 0), P(Math.cos(ang) * 60, 1.66, Math.sin(ang) * 60), 0.28); n++;
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 200;
    console.log(`  [custo] ${n / 200} raios por quadro: ${ms.toFixed(3)} ms/quadro (desktop, núcleo puro)`);
    assert.ok(ms < 2, `${ms} ms por quadro de 9 raios`);
    assert.ok(OCL.PASSO_TERRENO <= 0.5);
  });
});
