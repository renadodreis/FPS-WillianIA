/* ================================================================
   QA — NÚCLEO DA RETÍCULA VERMELHA (js/aimassist.js, `createReticula`).

   Relato do dono: "a mira não fica vermelha quando apontada aos inimigos".
   O núcleo é PURO (sem three, sem DOM, sem `Math.random`): recebe o olho e a
   direção da linha de mira (no jogo, as MESMAS `miraOrigem`/`miraDirecao` do
   `fire()`), o alcance e as listas de alvos (o contrato `hitSpheres()` do
   tiro), e diz se a cruz está sobre um alvo de COMBATE visível. A
   visibilidade chega injetada — no jogo é a régua da assistência:
   `rayBlockedAt` do tiro + js/oclusao.js (desenhado e grama).

   Toda expectativa sai da GEOMETRIA do cenário (posição, raio da esfera,
   distância) e das constantes declaradas (docs/mobile/referencia-reticula.md
   §6), nunca da saída do próprio módulo.
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let createReticula, alcanceUtil, RETICULA, WEAPON_ASSIST;
before(async () => {
  ({ createReticula, alcanceUtil, RETICULA, WEAPON_ASSIST } = await import('../js/aimassist.js'));
});

const ROOT = { visible: true, parent: null };
const OLHO_Y = 1.10;                 // na altura do centro do TRONCO: a cruz passa pelo centro dele
const DT = 1 / 60;

/* boneco com o desenho de esferas do jogador remoto (br-game.js): cabeça
   r 0,28 a +1,66, tronco r 0,42 a +1,10, pernas r 0,34 a +0,42 */
function boneco(x, z, opts = {}) {
  const group = { visible: opts.visible !== false, parent: opts.parent === undefined ? ROOT : opts.parent,
    position: { x, y: 0, z } };
  const sph = [[1.66, 0.28, 'head'], [1.10, 0.42, 'body'], [0.42, 0.34, 'body']]
    .map(([h, r, part]) => ({ c: { x: 0, y: 0, z: 0 }, r, part, h }));
  return {
    alive: true, group, combate: opts.combate !== false,
    hitSpheres() {
      const p = this.group.position;
      for (const s of sph) { s.c.x = p.x; s.c.y = p.y + s.h; s.c.z = p.z; }
      return sph;
    },
    damage() { return false; },
  };
}

/* o olho na origem olhando −Z (a câmera do three com yaw 0); `ladoX` desloca
   a LINHA DE MIRA para o lado, paralela */
function quadro(alvos, o = {}) {
  return Object.assign({
    dt: DT, ativa: true, eye: { x: o.ladoX || 0, y: OLHO_Y, z: 0 }, dir: { x: 0, y: 0, z: -1 },
    range: 60, lists: [alvos],
  }, o);
}

function nucleo(o = {}) {
  const chamadas = { los: [], grama: [] };
  const ret = createReticula({
    root: ROOT,
    combate: o.combate || (t => t.combate === true),
    los: (e, p, r, t) => { chamadas.los.push({ p: { ...p }, r, t }); return o.livre ? o.livre(e, p, r, t) : true; },
    grama: (e, p, r) => { chamadas.grama.push({ p: { ...p }, r }); return o.grama ? o.grama(e, p, r) : false; },
  });
  return { ret, chamadas };
}

describe('retícula — alcance útil da arma (o arsenal real, js/weapons.js)', () => {
  it('dado o espalhamento de cada arma, então o alcance é onde o cone abre 0,84 m (e cresce na mira)', () => {
    // os MESMOS campos de js/weapons.js
    const fuzil = { spreadHip: 0.014, spreadAds: 0.0022 };
    const trovao = { spreadHip: 0.05, spreadAds: 0.032, pellets: 8 };
    const rajada = { spreadHip: 0.055, spreadAds: 0.04, pellets: 7, auto: true };
    const dmr = { spreadHip: 0.02, spreadAds: 0.0005 };
    const faca = { spreadHip: 0, spreadAds: 0, melee: true };
    // a régua é a do `autoRange` do fuzil na assistência: 0,014 rad × 60 m = 0,84 m
    assert.ok(Math.abs(WEAPON_ASSIST.rifle.autoRange * 0.014 - RETICULA.RAIO_UTIL) < 1e-9,
      `RAIO_UTIL ${RETICULA.RAIO_UTIL} não é o cone do fuzil no alcance do automático`);
    assert.ok(Math.abs(alcanceUtil(fuzil, 0) - 60) < 1e-9, `fuzil no quadril: ${alcanceUtil(fuzil, 0)}`);
    assert.ok(Math.abs(alcanceUtil(trovao, 0) - 0.84 / 0.05) < 1e-9, `escopeta: ${alcanceUtil(trovao, 0)}`);
    assert.ok(Math.abs(alcanceUtil(rajada, 0) - 0.84 / 0.055) < 1e-9, `rajada: ${alcanceUtil(rajada, 0)}`);
    assert.ok(Math.abs(alcanceUtil(dmr, 0) - 42) < 1e-9, `DMR no quadril: ${alcanceUtil(dmr, 0)}`);
    // metade da mira: o MESMO lerp do `fire()` (spread linear em adsT)
    assert.ok(Math.abs(alcanceUtil(fuzil, 0.5) - 0.84 / ((0.014 + 0.0022) / 2)) < 1e-9, `fuzil meio ADS: ${alcanceUtil(fuzil, 0.5)}`);
    // na mira inteira, o teto do hitscan
    assert.equal(alcanceUtil(fuzil, 1), 240);
    assert.equal(alcanceUtil(dmr, 1), 240);
    assert.equal(alcanceUtil(faca, 0), 2.6, 'faca: o golpe do __BR_melee');
    assert.equal(alcanceUtil(faca, 1), 2.6);
    assert.ok(alcanceUtil(trovao, 1) > alcanceUtil(trovao, 0), 'a mira tem de alongar o alcance (Halo)');
  });
});

describe('retícula — acende no inimigo visível sob a cruz', () => {
  it('dado um inimigo a 20 m com a cruz no tronco, então vermelha, e a distância é a da ENTRADA na esfera', () => {
    const { ret } = nucleo();
    const t = boneco(0, -20);
    const r = ret.step(quadro([t]));
    assert.equal(r.vermelha, true);
    assert.equal(r.alvo, t);
    // a linha passa pelo centro do tronco (olho na altura dele): entra a 20 − 0,42
    assert.ok(Math.abs(r.dist - (20 - 0.42)) < 1e-9, `distância ${r.dist}`);
  });

  it('dada a cruz 1 m ao lado do inimigo, então branca (depois da histerese)', () => {
    const { ret } = nucleo();
    const t = boneco(0, -20);
    let r;
    for (let i = 0; i < 30; i++) r = ret.step(quadro([t], { ladoX: 1 }));
    assert.equal(r.vermelha, false, `cruz a 1 m do centro, raio do tronco 0,42: ${r.motivo}`);
  });

  it('dados dois inimigos na mesma linha, então quem conta é o da FRENTE', () => {
    const { ret } = nucleo();
    const longe = boneco(0, -30), perto = boneco(0, -12);
    const r = ret.step(quadro([longe, perto]));
    assert.equal(r.alvo, perto);
    assert.ok(Math.abs(r.dist - (12 - 0.42)) < 1e-9);
  });

  it('dado o inimigo ATRÁS do olho, então branca', () => {
    const { ret } = nucleo();
    const r = ret.step(quadro([boneco(0, 20)]));
    assert.equal(r.vermelha, false);
  });
});

describe('retícula — alcance', () => {
  it('dado o inimigo além do alcance, então branca; dentro, vermelha', () => {
    const { ret } = nucleo();
    let r = ret.step(quadro([boneco(0, -70)], { range: 60 }));
    assert.equal(r.vermelha, false, 'a 70 m com alcance de 60 m');
    for (let i = 0; i < 30; i++) r = ret.step(quadro([boneco(0, -70)], { range: 60 }));
    assert.equal(r.vermelha, false);
    // a borda: entra na esfera a 60,0 m exatos
    r = ret.step(quadro([boneco(0, -60.42)], { range: 60 }));
    assert.equal(r.vermelha, true, 'entrada na esfera exatamente no alcance');
    const { ret: r2 } = nucleo();
    assert.equal(r2.step(quadro([boneco(0, -60.43)], { range: 60 })).vermelha, false, '1 cm além');
  });
});

describe('retícula — só alvo de COMBATE', () => {
  it('dado um alvo de treino (disco) ou caça (cervo) sob a cruz, então branca', () => {
    const { ret } = nucleo();
    const disco = boneco(0, -10, { combate: false });
    let r;
    for (let i = 0; i < 30; i++) r = ret.step(quadro([disco]));
    assert.equal(r.vermelha, false);
    assert.equal(r.motivo, 'neutro');
  });

  it('dado um alvo NEUTRO na frente de um inimigo, então branca (o tiro pega o da frente)', () => {
    const { ret } = nucleo();
    const disco = boneco(0, -8, { combate: false }), inimigo = boneco(0, -20);
    let r;
    for (let i = 0; i < 30; i++) r = ret.step(quadro([inimigo, disco]));
    assert.equal(r.vermelha, false);
  });

  it('dado o inimigo na frente do neutro, então vermelha', () => {
    const { ret } = nucleo();
    const r = ret.step(quadro([boneco(0, -30, { combate: false }), boneco(0, -12)]));
    assert.equal(r.vermelha, true);
  });

  it('sem a categoria injetada, só quem se declara combate', () => {
    const ret = createReticula({ root: ROOT, los: () => true, grama: () => false });
    const t = boneco(0, -10); delete t.combate;
    assert.equal(ret.step(quadro([t])).vermelha, false);
    t.combate = true;
    assert.equal(ret.step(quadro([t])).vermelha, true);
  });
});

describe('retícula — nunca acende em quem a tela não mostra', () => {
  it('dado o alvo sem pai ou invisível, então branca (desenhado = pendurado na cena)', () => {
    for (const opts of [{ visible: false }, { parent: null }]) {
      const { ret } = nucleo();
      let r;
      for (let i = 0; i < 30; i++) r = ret.step(quadro([boneco(0, -10, opts)]));
      assert.equal(r.vermelha, false, JSON.stringify(opts));
    }
  });

  it('dada a linha de visada fechada, então branca — e as consultas são no ponto da LINHA DA CRUZ e no CENTRO da parte, sem folga', () => {
    const { ret, chamadas } = nucleo({ livre: () => false });
    const t = boneco(0.2, -20);          // a cruz passa 0,2 m ao lado do centro do tronco
    const r = ret.step(quadro([t]));
    assert.equal(r.vermelha, false);
    const p = chamadas.los[0].p;
    // o ponto da linha da cruz mais perto do centro: (0, 1,10, −20)
    assert.ok(Math.abs(p.x) < 1e-9 && Math.abs(p.y - 1.10) < 1e-9 && Math.abs(p.z + 20) < 1e-9, JSON.stringify(p));
    assert.equal(chamadas.los[0].r, 0, 'sem folga: a parede DENTRO da esfera também apaga');
    assert.equal(chamadas.los[0].t, t, 'o alvo vai junto: o corpo dele não tampa a si mesmo');
  });

  it('dada uma parede OBLÍQUA que esconde o centro da parte mas não a linha da cruz, então branca', () => {
    /* parede no plano x = 0,25 (paralela à vista), o tronco com centro em
       x = 0,40 atrás dela; a esfera (r 0,42) passa para o lado de cá e a cruz
       (x = 0) a atravessa sem cruzar a parede */
    const cruza = (e, p) => (e.x - 0.25) * (p.x - 0.25) < 0;
    const { ret } = nucleo({ livre: (e, p) => !cruza(e, p) });
    let r;
    for (let i = 0; i < 30; i++) r = ret.step(quadro([boneco(0.40, -20)]));
    assert.equal(r.vermelha, false, `a esfera vaza pela parede: ${r.motivo}`);
  });

  it('dada a grama cobrindo a linha da cruz OU o centro da parte, então branca', () => {
    /* a cruz (x = 0) passa 0,2 m ao lado do centro do tronco (x = 0,2): a
       consulta da LINHA DA CRUZ é a que termina em x = 0, a do CENTRO em 0,2 */
    const naCruz = p => Math.abs(p.x) < 1e-9, noCentro = p => Math.abs(p.x - 0.2) < 1e-9;
    let n = nucleo({ grama: (e, p) => naCruz(p) });
    let r;
    for (let i = 0; i < 30; i++) r = n.ret.step(quadro([boneco(0.2, -20)]));
    assert.equal(r.vermelha, false, 'grama na linha da cruz');
    n = nucleo({ grama: (e, p) => noCentro(p) });
    for (let i = 0; i < 30; i++) r = n.ret.step(quadro([boneco(0.2, -20)]));
    assert.equal(r.vermelha, false, 'grama no centro da parte');
    // as duas com a folga da assistência: meio raio antes do ponto (a lâmina dentro do corpo não cobre)
    n = nucleo();
    n.ret.step(quadro([boneco(0.2, -20)]));
    assert.equal(n.chamadas.grama.length, 2);
    for (const c of n.chamadas.grama) assert.ok(Math.abs(c.r - 0.42) < 1e-9, `folga ${c.r}: tem de ser o raio da parte`);
    assert.ok(naCruz(n.chamadas.grama[0].p) && noCentro(n.chamadas.grama[1].p), JSON.stringify(n.chamadas.grama));
  });
});

describe('retícula — histerese curta', () => {
  it('dada a cruz saindo do alvo, então fica vermelha só o tempo de SEGURA e apaga', () => {
    const { ret } = nucleo();
    const t = boneco(0, -20);
    assert.equal(ret.step(quadro([t])).vermelha, true);
    const quadros = Math.round(RETICULA.SEGURA / DT);
    let vermelhos = 0, r;
    for (let i = 0; i < quadros + 10; i++) { r = ret.step(quadro([t], { ladoX: 1 })); if (r.vermelha) vermelhos++; }
    assert.ok(RETICULA.SEGURA > 0 && RETICULA.SEGURA <= 0.15, `histerese de ${RETICULA.SEGURA} s não é curta`);
    assert.ok(Math.abs(vermelhos - quadros) <= 1, `${vermelhos} quadros vermelhos depois de sair; esperado ~${quadros}`);
    assert.equal(r.vermelha, false);
  });

  it('dada a cruz tremendo na borda (entra e sai a cada quadro), então NÃO pisca', () => {
    const { ret } = nucleo();
    const t = boneco(0, -20);
    let trocas = 0, antes = null;
    for (let i = 0; i < 120; i++) {
      const r = ret.step(quadro([t], { ladoX: i % 2 ? 0.43 : 0.41 }));
      if (antes !== null && r.vermelha !== antes) trocas++;
      antes = r.vermelha;
    }
    assert.equal(trocas, 0, `${trocas} trocas de cor em 2 s de tremor na borda`);
  });

  it('dado o inimigo indo para trás da parede COM a cruz nele, então apaga no MESMO quadro (a histerese não segura escondido)', () => {
    let parede = false;
    const { ret } = nucleo({ livre: () => !parede });
    const t = boneco(0, -20);
    assert.equal(ret.step(quadro([t])).vermelha, true);
    parede = true;
    const r = ret.step(quadro([t]));
    assert.equal(r.vermelha, false, `a cruz seguiu vermelha sobre o inimigo escondido (${r.motivo})`);
  });

  it('dada a cruz varrendo de um inimigo visível para outro ESCONDIDO, então apaga no mesmo quadro', () => {
    const visivel = boneco(0, -20), escondido = boneco(3, -20);
    const { ret } = nucleo({ livre: (e, p, r, t) => t !== escondido });
    assert.equal(ret.step(quadro([visivel, escondido])).vermelha, true);
    const r = ret.step(quadro([visivel, escondido], { ladoX: 3 }));
    assert.equal(r.vermelha, false, `a cruz sobre o escondido ficou vermelha pela histerese do outro (${r.motivo})`);
  });

  it('dada a cruz passando para um alvo NEUTRO, então apaga no mesmo quadro', () => {
    const inimigo = boneco(0, -20), disco = boneco(3, -20, { combate: false });
    const { ret } = nucleo();
    assert.equal(ret.step(quadro([inimigo, disco])).vermelha, true);
    assert.equal(ret.step(quadro([inimigo, disco], { ladoX: 3 })).vermelha, false);
  });

  it('dado o alvo morrendo ou a vista deixando de ser de combate, então apaga NO MESMO quadro', () => {
    const { ret } = nucleo();
    const t = boneco(0, -20);
    assert.equal(ret.step(quadro([t])).vermelha, true);
    t.alive = false;
    assert.equal(ret.step(quadro([t])).vermelha, false, 'morto');
    t.alive = true;
    assert.equal(ret.step(quadro([t])).vermelha, true);
    assert.equal(ret.step(quadro([t], { ativa: false })).vermelha, false, 'inativa (XR, veículo, morte, pausa)');
  });

  it('dada a vista inativa, então nem percorre alvo nem consulta visada', () => {
    const { ret, chamadas } = nucleo();
    let chamou = 0;
    const t = boneco(0, -20);
    const h = t.hitSpheres.bind(t);
    t.hitSpheres = () => { chamou++; return h(); };
    for (let i = 0; i < 10; i++) ret.step(quadro([t], { ativa: false }));
    assert.equal(chamou, 0);
    assert.equal(chamadas.los.length, 0);
  });
});
