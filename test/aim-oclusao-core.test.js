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

let createOclusao, gradeDeTriangulos, gradeCorta, congelarGrade, inverteAfim, OCL, OCL_GRAMA, OCL_VENTO;
before(async () => {
  ({ createOclusao, gradeDeTriangulos, gradeCorta, congelarGrade, inverteAfim, OCL, GRAMA: OCL_GRAMA, ventoGrama: OCL_VENTO } =
    await import('../js/oclusao.js'));
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

/* ================================================================
   A GRAMA DESENHADA (A2, validacao-6aeda6c.md: 1 de 33 casos com 0 px e a
   assistência agindo). Reproduzido pelo construtor com a âncora de pixels:
   alvo a 37,5 m atrás de uma crista, linha do olho ao centro da cabeça
   0,188 m acima do chão da crista — e 0 px. ESCONDENDO A GRAMA, 24 px. Não
   era a esfera maior que a cabeça (a linha vai ao CENTRO dela, e o centro
   está dentro da cabeça desenhada): era a grama EM CIMA DA CRISTA, que o
   raio atravessa e que a regra de grama (só no pé do alvo) não via.

   A grama é um ShaderMaterial instanciado: fica fora da grade de triângulos,
   e ganha camada própria — o TOPO de cada lâmina desenhada (as matrizes de
   instância do chunk), dilatado pelo quanto a lâmina alcança de lado (as
   parcelas de js/grass.js: largura + curva + tombo, vento pelo `uWind` do
   material, dobra do jogador e do carro), com o corte do shader na borda do
   tapete (`edgeFade` zera a 0,97·uPatchRadius da câmera).
   ================================================================ */
/* chunk de grama no formato do three: InstancedMesh + ShaderMaterial com os
   uniforms do js/grass.js. `laminas` = [[x, y, z, altura], ...] no LOCAL do chunk */
function chunkGrama(pai, laminas, { pos = [0, 0, 0], vento = 0, dir = [0.72, 0.45], patch = 65, jogador = [0, -999, 0], carro = [0, -999, 0] } = {}) {
  const mats = laminas.map(([x, y, z, s]) => trs([x, y, z], 0, [1, s, 1]));
  const u = { uWind: { value: vento }, uPatchRadius: { value: patch }, uWindDir: { value: { x: dir[0], y: dir[1] } },
    uPlayerPos: { value: { x: jogador[0], y: jogador[1], z: jogador[2] } }, uCarPos: { value: { x: carro[0], y: carro[1], z: carro[2] } } };
  const m = instancias(pai, [-0.05, 0, 0, 0.05, 0, 0, 0, 1, 0], mats, {
    material: { type: 'ShaderMaterial', isShaderMaterial: true, uniforms: u } });
  m.matrixWorld = { elements: trs(pos) };
  return m;
}
/* tapete de lâminas a cada `passo` m no retângulo [x0,x1]×[z0,z1], altura s, chão y */
function tapete(x0, x1, z0, z1, s, y = 0, passo = 0.25) {
  const l = [];
  for (let x = x0; x <= x1 + 1e-9; x += passo) for (let z = z0; z <= z1 + 1e-9; z += passo) l.push([x, y, z, s]);
  return l;
}
const ehGrama = o => !!(o && o.material && o.material.isShaderMaterial && o.isInstancedMesh);

describe('oclusão — a GRAMA desenhada (camada própria)', () => {
  /* O modelo da lâmina em js/oclusao.js repete números do vertex shader e do
     preenchimento do js/grass.js. Se um deles mudar lá e não aqui, a camada
     passa a errar para o lado errado (vazamento) sem nenhum teste de tela
     perceber. Este caso lê o arquivo da grama e falha ALTO. */
  it('dado o js/grass.js, então os números do modelo da lâmina são os dele', () => {
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'grass.js'), 'utf8');
    const tem = (re, o) => assert.match(src, re, `js/grass.js mudou: ${o} (revise GRAMA em js/oclusao.js)`);
    tem(/PlaneGeometry\(0\.1, 1,/, 'largura da lâmina 0,1');
    tem(/\(1\.0 - y \* 0\.82\)/, 'afunilamento 0,82');
    tem(/Math\.pow\(y, 2\) \* 0\.18/, 'curva 0,18·y²');
    tem(/rotation\.set\(r\(-0\.13, 0\.13\), r\(0, TAU\), r\(-0\.13, 0\.13\)\)/, 'tombo ±0,13 rad');
    tem(/scale\.set\(r\(0\.8, 1\.25\), s, 1\)/, 'escala x 0,8–1,25');
    tem(/r\(0\.65, 1\.4\) \* CFG\.GRASS_HEIGHT/, 'altura 0,65–1,4 × GRASS_HEIGHT');
    tem(/\(w1 - 0\.5\) \* 1\.7 \+ \(w2 - 0\.5\) \* 0\.55/, 'amplitude do vento');
    tem(/float w1 = vnoise\(wpos\.xz \* 0\.08 \+ vec2\(uTime \* 0\.85, uTime \* 0\.55\)\);/, 'oitava 1 do vento (ventoGrama)');
    tem(/float w2 = vnoise\(wpos\.xz \* 0\.33 - vec2\(uTime \* 1\.6, uTime \* 0\.2\)\);/, 'oitava 2 do vento (ventoGrama)');
    tem(/float hash12\(vec2 p\)\{ vec3 p3 = fract\(vec3\(p\.xyx\) \* 0\.1031\); p3 \+= dot\(p3, p3\.yzx \+ 33\.33\); return fract\(\(p3\.x \+ p3\.y\) \* p3\.z\); \}/, 'hash12');
    tem(/f = f \* f \* \(3\.0 - 2\.0 \* f\);/, 'vnoise (smoothstep)');
    tem(/sin\(uTime \* 2\.3 \+ aPhase \* 6\.2831\) \* 0\.055/, 'balanço 0,055');
    tem(/wpos\.x \+= windDir\.x \* \(wind \* uWind \+ sway\) \* hh;/, 'vento só ao longo de windDir, × h²');
    tem(/wpos\.y -= abs\(wind\) \* uWind \* hh \* 0\.16;/, 'o vento só ABAIXA');
    tem(/bendAway\(wpos, uPlayerPos, 1\.5, 1\.05, h\)/, 'dobra do jogador (1,5; 1,05)');
    tem(/bendAway\(wpos, uCarPos, +3\.1, 1\.4, +h\)/, 'dobra do carro (3,1; 1,4)');
    tem(/wpos\.y -= falloff \* h \* 0\.3;/, 'a dobra só ABAIXA');
    tem(/vec2 pushDir = toBlade \/ max\(d, 1e-4\);/, 'a dobra é RADIAL');
    tem(/smoothstep\(uPatchRadius \* 0\.72, uPatchRadius \* 0\.97, dCam\)/, 'edgeFade some a 0,97');
    // e as constantes do módulo batem com eles
    assert.equal(OCL_GRAMA.VENTO, 1.7 * 0.5 + 0.55 * 0.5);
    assert.equal(OCL_GRAMA.BALANCO, 0.055);
    assert.equal(OCL_GRAMA.FADE, 0.97);
    assert.deepEqual(OCL_GRAMA.EMPURRA.map(E => [E.u, E.raio, E.forca]), [['uPlayerPos', 1.5, 1.05], ['uCarPos', 3.1, 1.4]]);
    // alcance sem vento: tombo nos dois eixos sobre a lâmina mais alta + curva + meia-largura
    const cfg = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'config.js'), 'utf8');
    const gh = +(/GRASS_HEIGHT:\s*([0-9.]+)/.exec(cfg) || [])[1];
    assert.ok(gh > 0, 'GRASS_HEIGHT não encontrado em js/config.js');
    const hMax = 1.4 * gh, tombo = Math.atan(Math.hypot(Math.tan(0.13), Math.tan(0.13)));
    const alcance = hMax * Math.sin(tombo) + 0.18 + 0.05 * 1.25;
    assert.ok(OCL_GRAMA.LAMINA >= alcance, `LAMINA ${OCL_GRAMA.LAMINA} < alcance da lâmina ${alcance.toFixed(3)}`);
  });

  it('dada uma faixa de grama entre o olho e o alvo, então a linha DENTRO da altura dela é coberta; por cima, não', () => {
    const raiz = cena();
    chunkGrama(raiz, tapete(9, 11, -3, 3, 1.2));        // lâminas de 1,2 m numa faixa de 2 m
    const oc = pronta(raiz, { grama: ehGrama });
    assert.equal(oc.gramaCobre(P(0, 0.5, 0), P(20, 0.5, 0), 0.28), true, 'linha a 0,5 m atravessando a faixa');
    assert.equal(oc.gramaCobre(P(0, 1.5, 0), P(20, 1.5, 0), 0.28), false, 'linha a 1,5 m, 0,3 m acima do topo');
    assert.equal(oc.gramaCobre(P(0, 0.5, 0), P(7.5, 0.5, 0), 0.28), false, 'a linha acaba 1,5 m antes da faixa');
    // o que a grama cobre NÃO é parede: o `tampa` (malha e terreno) continua sem ela
    assert.equal(oc.tampa(P(0, 0.5, 0), P(20, 0.5, 0), 0.28), false, 'a grama virou oclusor sólido no tampa');
  });

  /* O ALCANCE DE VERDADE, calculado aqui sem o módulo: a lâmina de teste
     (sem tombo, curva 0,18·h² em +z, meia-largura 0,05·(1 − 0,82·h)) com o
     vertex shader do js/grass.js em força bruta — ponto h da lâmina, vento
     a ∈ [−1,125·uWind, +1,125·uWind] mais balanço 0,055 ao longo de `dir`,
     abaixado 0,16·|a|·h². Devolve o quanto ela vai em +z na altura `y`. */
  function alcanceBruto(s, y, uWind, dir) {
    const A = 1.125 * uWind, L = Math.hypot(dir[0], dir[1]), dz = dir[1] / L;
    let melhor = -Infinity;
    for (let i = 0; i <= 2000; i++) {
      const h = i / 2000;
      for (let j = 0; j <= 100; j++) {
        const a = -A + 2 * A * j / 100;
        for (const sw of [-0.055, 0.055]) {
          const yy = s * h - 0.16 * Math.abs(a) * h * h;
          if (Math.abs(yy - y) > 0.005) continue;
          const z = 0.18 * h * h + Math.max((a + sw) * dz * h * h, -(a + sw) * dz * h * h) + 0.05 * (1 - 0.82 * h);
          if (z > melhor) melhor = z;
        }
      }
    }
    return melhor;
  }

  it('dado o vento, então a lâmina vai ao longo da DIREÇÃO dele até onde o shader a leva — e de lado, não', () => {
    const vento = 0.55;
    const lado = (oc, z, y) => oc.gramaCobre(P(0, y, z), P(20, y, z), 0.28);
    // vento soprando em z: lâminas de 1,2 m numa faixa z ∈ [−3, 3]
    const emZ = cena();
    chunkGrama(emZ, tapete(9, 11, -3, 3, 1.2), { vento, dir: [0, 1] });
    const ocZ = pronta(emZ, { grama: ehGrama });
    const alto = alcanceBruto(1.2, 1.1, vento, [0, 1]), meio = alcanceBruto(1.2, 0.6, vento, [0, 1]);
    assert.ok(alto > 0.8 && meio < alto / 2, `cenário: alcance ${alto.toFixed(3)} m perto da ponta, ${meio.toFixed(3)} m no meio`);
    assert.equal(lado(ocZ, 3 + alto - 0.03, 1.1), true, `a linha a 1,1 m, ${(alto - 0.03).toFixed(2)} m além da faixa (o vento leva a ponta até ${alto.toFixed(2)})`);
    assert.equal(lado(ocZ, 3 + alto + 0.3, 1.1), false, `a ${(alto + 0.3).toFixed(2)} m além da faixa (alcance + 0,3)`);
    // no MEIO da lâmina o vento leva só h²: a linha baixa não é coberta onde só a ponta chega
    assert.equal(lado(ocZ, 3 + meio - 0.03, 0.6), true, `a linha a 0,6 m, ${(meio - 0.03).toFixed(2)} m além da faixa`);
    assert.equal(lado(ocZ, 3 + meio + 0.3, 0.6), false, `a linha a 0,6 m, ${(meio + 0.3).toFixed(2)} m além (só a ponta chega lá)`);
    // vento soprando em x: de LADO (z) só a curva da lâmina
    const emX = cena();
    chunkGrama(emX, tapete(9, 11, -3, 3, 1.2), { vento, dir: [1, 0] });
    const deLado = alcanceBruto(1.2, 1.1, vento, [1, 0]);
    assert.ok(deLado < 0.25, `cenário: de lado ${deLado.toFixed(3)} m`);
    assert.equal(lado(pronta(emX, { grama: ehGrama }), 3 + deLado + 0.3, 1.1), false, 'o vento em x levou a lâmina para o lado (z)');
    /* o vento SOBE depois de montada a camada (js/env.js: + 0,5 na
       tempestade): o alcance novo vale na hora, sem remontar */
    const u = emZ.children[0].material.uniforms;
    u.uWind.value = 0;
    const ocT = pronta(emZ, { grama: ehGrama });
    const calma = alcanceBruto(1.2, 1.1, 0, [0, 1]), tempestade = alcanceBruto(1.2, 1.1, 1.05, [0, 1]);
    const zT = 3 + (calma + tempestade) / 2;
    assert.equal(lado(ocT, zT, 1.1), false, `cenário: sem vento a lâmina não chega a ${(zT - 3).toFixed(2)} m`);
    u.uWind.value = 1.05;
    assert.equal(lado(ocT, zT, 1.1), true, 'o vento aumentou e a camada seguiu com o alcance da calmaria');
  });

  /* COM O TEMPO DO SHADER (uTime) e a fase de cada lâmina (aPhase), o vento
     não é mais a cota ±W: é o `wind` do shader naquele ponto e instante
     (ventoGrama — conferido contra o GPU no teste de tela), ± o quanto ele
     muda ao longo da lâmina. Medido na varredura com o tapete assentado: com
     a cota, 9 de 31 alvos visíveis perdiam a assistência, e em todos os 9 o
     pixel do centro da cabeça MOSTRAVA o alvo — era a ponta de uma lâmina
     varrida pelo vento máximo cruzando a linha. */
  it('dado o tempo do shader, então a lâmina cobre onde o vento DAQUELE instante a põe — e não do outro lado', () => {
    const vento = 0.55, dir = [1, 0], s = 1.2, faseL = 0.25;
    // um instante em que o vento empurra a ponta com força para um lado
    let t = 0, D = 0;
    for (let k = 0; k < 4000; k++) {
      const tt = k * 0.37;
      const w = OCL_VENTO(0, 0.18, tt), sw = Math.sin(tt * 2.3 + faseL * 6.2831) * 0.055, d = w * vento + sw;
      if (Math.abs(d) > Math.abs(D)) { D = d; t = tt; }
      if (Math.abs(D) > 0.5) break;
    }
    assert.ok(Math.abs(D) > 0.4, `cenário: nenhum instante com vento forte (${D})`);
    const raiz = cena();
    const ch = chunkGrama(raiz, [[0, 0, 0, s]], { vento, dir });
    ch.material.uniforms.uTime = { value: t };
    ch.geometry.attributes.aPhase = { array: Float32Array.from([faseL]) };
    const oc = pronta(raiz, { grama: ehGrama });
    // linha ao longo de z na altura da ponta (1,15 m), em x = onde o vento a pôs / o lado oposto
    const linha = x => oc.gramaCobre(P(x, 1.15, -5), P(x, 1.15, 5), 0.28);
    assert.equal(linha(D * 0.95), true, `a ponta, levada a x = ${D.toFixed(2)} m pelo vento desse instante, não cobriu`);
    assert.equal(linha(-D * 0.9), false, `cobriu do outro lado (x = ${(-D * 0.9).toFixed(2)} m), onde o vento desse instante não a põe`);
    // controle: sem o tempo do shader, a cota ±W cobre os dois lados
    delete ch.material.uniforms.uTime;
    const oc2 = pronta(raiz, { grama: ehGrama });
    assert.equal(oc2.gramaCobre(P(-D * 0.9, 1.15, -5), P(-D * 0.9, 1.15, 5), 0.28), true, 'cenário: a cota não cobria o outro lado');
  });

  it('dada a grama numa CRISTA, então a linha que passa rente à crista é coberta (o caso do laudo)', () => {
    // crista: chão sobe a 4 m em x = 20; lâminas de 1,0 m em cima dela
    const raiz = cena();
    chunkGrama(raiz, tapete(19, 21, -2, 2, 1.0, 4));
    const heightAt = x => Math.max(0, 4 - Math.abs(x - 20) * 0.8);
    const oc = pronta(raiz, { grama: ehGrama, heightAt });
    // olho a 5,62, cabeça do alvo a 40 m: a linha passa 0,19 m acima do topo da crista
    const olho = P(0, 5.62, 0), cabeca = P(40, 3.1, 0);
    const yCrista = olho.y + (cabeca.y - olho.y) * 0.5;
    assert.ok(yCrista > 4 && yCrista < 5, `cenário: a linha cruza a crista a ${yCrista.toFixed(2)} m`);
    assert.equal(oc.tampa(olho, cabeca, 0.28), false, 'cenário: o terreno sozinho não tampa');
    assert.equal(oc.gramaCobre(olho, cabeca, 0.28), true, 'a grama na crista não cobriu a linha');
  });

  it('dada a grama além do corte do shader (0,97·uPatchRadius da câmera), então não cobre', () => {
    // a MESMA faixa a 80 m, com o tapete de 65 m (edgeFade = 0 lá) e com um de 100 m (inteira)
    const linha = patch => {
      const raiz = cena();
      chunkGrama(raiz, tapete(79, 81, -3, 3, 1.2), { patch });
      return pronta(raiz, { grama: ehGrama }).gramaCobre(P(0, 0.5, 0), P(90, 0.5, 0), 0.28);
    };
    assert.equal(linha(100), true, 'controle: no tapete de 100 m a faixa a 80 m cobre');
    assert.equal(linha(65), false, 'a faixa a 80 m cobriu com o tapete de 65 m (o shader a apaga a 63 m)');
  });

  it('dada a lâmina na FAIXA do edgeFade (encolhida, mas com o vento e a curva do h da geometria), então conta a lâmina inteira', () => {
    /* o shader encolhe x e y da lâmina entre 0,72 e 0,97·uPatchRadius da
       câmera, e o vento continua pelo h da geometria: o ponto que chega à
       linha baixa tem h maior e anda mais. A linha a 0,6 m, 0,6 m além da
       faixa na direção do vento: longe da borda só a ponta chegaria (não
       cobre); na faixa do edgeFade, cobre */
    const vento = 0.55;
    const cobreA = xFaixa => {
      const raiz = cena();
      chunkGrama(raiz, tapete(xFaixa - 1, xFaixa + 1, -3, 3, 1.2), { vento, dir: [0, 1], patch: 65 });
      // o olho na origem: a faixa fica a xFaixa m da câmera
      return pronta(raiz, { grama: ehGrama }).gramaCobre(P(0, 0.6, 3.6), P(xFaixa + 5, 0.6, 3.6), 0.28);
    };
    assert.equal(cobreA(20), false, 'cenário: longe da borda do tapete a lâmina a meia altura não chega a 0,6 m de lado');
    assert.equal(cobreA(55), true, 'na faixa do edgeFade a lâmina encolhida não foi contada inteira');
  });

  it('dado o chunk RECICLADO (instâncias e posição novas), então a camada acompanha na hora', () => {
    const raiz = cena();
    const ch = chunkGrama(raiz, tapete(9, 11, -3, 3, 1.2));
    const oc = pronta(raiz, { grama: ehGrama });
    assert.equal(oc.gramaCobre(P(0, 0.5, 0), P(20, 0.5, 0), 0.28), true);
    // o js/grass.js reescreve as matrizes E move o chunk (fillChunk): agora a faixa fica em z ∈ [47, 53]
    ch.matrixWorld.elements = trs([0, 0, 50]);
    ch.instanceMatrix.version++;
    assert.equal(oc.gramaCobre(P(0, 0.5, 0), P(20, 0.5, 0), 0.28), false, 'a grama que saiu dali ainda cobria');
    assert.equal(oc.gramaCobre(P(0, 0.5, 50), P(20, 0.5, 50), 0.28), true, 'a grama que chegou não cobria');
  });

  it('dado o JOGADOR no mato, então a lâmina perto dele é empurrada para longe só até onde o shader a leva', () => {
    /* touceira de 1,2 m a 0,3 m do jogador: o shader a empurra no máximo
       1,05·k (k ≤ ~0,73 na ponta) — ela para por volta de 1,06 m dele. A
       linha a 1,0 m de altura a 1,4 m do jogador (dentro do disco da dobra)
       não é coberta; a 0,9 m do jogador, onde a ponta abaixada chega, é */
    const raiz = cena();
    chunkGrama(raiz, [[0.3, 0, 0, 1.2]], { jogador: [0, 0, 0] });
    const oc = pronta(raiz, { grama: ehGrama });
    // trechos da linha que "enxergam" a touceira desde o jogador: z de 0,2 a 1,3 (a ponta curva para +z)
    const linha = (x, y) => oc.gramaCobre(P(x, y, 0.2 * x / 1.4), P(x, y, 1.3 * x / 1.4), 0.28);
    assert.equal(linha(0.95, 0.95), true, 'a touceira empurrada não cobriu onde a dobra a põe');
    assert.equal(linha(1.4, 1.0), false, 'a dobra levou a touceira além do que o shader a empurra');
  });

  it('dado o chunk MOVIDO pela posição e ainda sem render (matrixWorld velha), então vale a posição', () => {
    /* o js/grass.js move o chunk pela `position` (fillChunk) e reescreve as
       instâncias; a matrixWorld só é recomposta no render. Medido no jogo:
       chunk em (100, 100) com a matrixWorld em (−30, −30) — as instâncias
       novas lidas com a matriz velha punham a grama a 130 m do lugar */
    const raiz = cena();
    const ch = chunkGrama(raiz, tapete(-1, 1, -3, 3, 1.2));
    Object.assign(ch, { matrixAutoUpdate: true, position: { x: 10, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 } });
    ch.matrixWorld = { elements: trs([-120, 0, 0]) };               // a do render anterior
    const oc = pronta(raiz, { grama: ehGrama });
    assert.equal(oc.gramaCobre(P(0, 0.5, 0), P(20, 0.5, 0), 0.28), true, 'a grama em x = 10 (a posição) não cobriu');
    assert.equal(oc.gramaCobre(P(-130, 0.5, 0), P(-110, 0.5, 0), 0.28), false, 'a grama cobriu onde a matriz velha a punha');
  });

  it('dada a grama escondida ou fora da cena, então não cobre; e sem o predicado, não há camada', () => {
    const raiz = cena();
    const ch = chunkGrama(raiz, tapete(9, 11, -3, 3, 1.2));
    const oc = pronta(raiz, { grama: ehGrama });
    ch.visible = false;
    assert.equal(oc.gramaCobre(P(0, 0.5, 0), P(20, 0.5, 0), 0.28), false, 'chunk invisível cobriu');
    ch.visible = true;
    assert.equal(oc.gramaCobre(P(0, 0.5, 0), P(20, 0.5, 0), 0.28), true);
    assert.equal(pronta(raiz).gramaCobre(P(0, 0.5, 0), P(20, 0.5, 0), 0.28), false, 'sem `grama` nas deps');
  });

  it('dado o CARRO na grama (bendAway deita a lâmina para FORA dele), então ela cobre onde foi deitada — e não além do que o shader a leva', () => {
    /* touceira de 1,2 m em x = 0,3, carro em x = 0,6, sem vento. O shader
       empurra o vértice força·k para fora e o abaixa 0,3·k (o MESMO k =
       falloff·h·vf): para chegar a x = −0,95 (1,55 m do carro, 1,25 m além
       da touceira) o k tem de ser ~0,89, e aí a lâmina já desceu ~0,27 m —
       a linha a 0,9 m ali é coberta; a linha a 1,1 m, não (lá ela chega com
       k = 0,33, empurrada só 0,47 m) */
    const touceira = [[0.3, 0, 0, 1.2]];
    const semCarro = cena(), comCarro = cena();
    chunkGrama(semCarro, touceira);
    chunkGrama(comCarro, touceira, { carro: [0.6, 0, 0] });
    const linha = (oc, x, y) => oc.gramaCobre(P(x, y, -5), P(x, y, 5), 0.28);
    assert.equal(linha(pronta(semCarro, { grama: ehGrama }), -0.95, 0.9), false, 'cenário: sem a dobra a touceira não alcança');
    const oc = pronta(comCarro, { grama: ehGrama });
    assert.equal(linha(oc, -0.95, 0.9), true, 'a lâmina deitada pelo carro não cobriu onde foi deitada');
    assert.equal(linha(oc, -0.95, 1.1), false, 'cobriu a 1,1 m, altura em que a lâmina nunca chega tão longe (empurrão e descida andam juntos)');
    /* e o caso que só a DESCIDA decide: a 1,3 m do carro a ponta chega (k ≈
       0,74), mas desce 0,22 m no caminho — a linha a 1,15 m passa por cima */
    assert.equal(linha(oc, -0.7, 1.15), false, 'cobriu onde a ponta chega já abaixada (a descida da dobra foi ignorada)');
    // nunca além do raio da dobra (3,1 m): o shader não a leva até lá
    assert.equal(linha(oc, -2.8, 0.5), false, 'a dobra levou a touceira além do raio');
  });

});
