/* ================================================================
   PRÉDIOS × TERRENO — nada FLUTUA e nada que tem de aparecer AFUNDA.

   Relato do dono: "precisa ver nos prédios, se temos bugs". A frente de
   PvE mediu paredes de base e de castelo acima do chão: bicho, jogador e
   bala passavam POR BAIXO. Aqui, em Node e no mundo REAL de 12 sementes
   (relevo dos bots = relevo do cliente; paredes de js/paredes.js, a fonte
   única do que é sólido), medido ANTES do conserto:

     muro de base      vão até 8,20 m (99), 124 muros > 0,94 m, 65 > 1,9 m;
                       e o outro lado: topo até 5,22 m ABAIXO do chão (777)
     sacos de areia    vão até 2,68 m        caixotes  vão até 2,04 m
     cabana            vão até 0,83 m        ruína     vão até 0,69 m
     torre de vigia    0 (montantes enterrados 2 m) — controle
     castelo           anel da fundação fecha o perímetro; o PORTÃO não:
                       vão sob a soleira até 5,14 m, e corpo que anda no
                       terreno entrava debaixo do pátio em 12 de 12
                       sementes (lobo, zumbi, soldado); rampa flutuando
                       sobre um vazio de até 4,98 m.

   ÂNCORA INDEPENDENTE: o relevo é amostrado aqui numa grade PRÓPRIA (passo
   0,1 m, bordas incluídas) — não a do construtor —, e quem diz o que é peça
   de chão é a geometria de cada tipo (lista abaixo), não uma marca que o
   código sob teste possa esquecer. Os corpos andam com a cópia literal do
   `collide` de js/structures.js (test/helpers/pve-mundo.js).
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const Bots = require('../scripts/bots.js');
const { comEstruturas, importar } = require('./helpers/pve-mundo');

const SEMENTES = [20260928, 99, 777, 424242, 1, 138, 150, 987654, 2, 42, 31337, 555];
const PASSO = 0.1;

/* relevo sob a pegada {x0,x1,z0,z1}: grade própria, bordas incluídas */
function relevo(h, b, passo = PASSO) {
  const nx = Math.max(1, Math.ceil((b.x1 - b.x0) / passo)), nz = Math.max(1, Math.ceil((b.z1 - b.z0) / passo));
  let min = Infinity, max = -Infinity, pMin = null;
  for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) {
    const x = b.x0 + (b.x1 - b.x0) * i / nx, z = b.z0 + (b.z1 - b.z0) * k / nz;
    const y = h(x, z);
    if (y < min) { min = y; pMin = [x, z]; }
    max = Math.max(max, y);
  }
  return { min, max, pMin };
}

/* peças que ENCOSTAM no chão, por tipo — geometria, não marca:
   torre: os 4 montantes (os únicos com mais de 3 m de altura);
   cabana: as paredes (as sólidas altas: o forro tem 0,18 m);
   ruína e base: todas as sólidas (muro, sacos de areia, caixotes). */
const DE_CHAO = {
  torre: p => p.solida && p.h > 3,
  cabana: p => p.solida && p.h > 1,
  ruína: p => p.solida,
  base: p => p.solida,
};
/* na base, pela PEGADA (a altura é o que o conserto muda): caixote é
   quadrado de 1,2/1,4 m, saco de areia é 2,2 × 0,6 m, o resto é muro (0,7 m
   de espessura, qualquer comprimento) */
const nomeDaPeca = (tipo, p) => (tipo !== 'base' ? tipo
  : Math.abs(p.w - p.d) < 1e-9 && p.w <= 1.4 ? 'caixote'
    : Math.abs(p.w - 2.2) < 1e-9 && Math.abs(p.d - 0.6) < 1e-9 ? 'sacos' : 'muro');

let P, mundos;
before(async () => {
  P = await importar('paredes.js');
  mundos = [];
  for (const s of SEMENTES) {
    const t = await Bots.createBotTerrain(s);
    const mundo = P.construirMundoSolido({ worldSeed: s, heightAt: t.heightAt, slopeAt: t.slopeAt,
      WATER_LEVEL: t.WATER_LEVEL, CITY: t.CITY });
    mundos.push({ s, t, mundo });
  }
});

function* pecasDeChao({ mundo }) {
  const grupos = [['torre', mundo.plano.torres, mundo.pecas.torres], ['cabana', mundo.plano.cabanas, mundo.pecas.cabanas],
    ['ruína', mundo.plano.ruinas, mundo.pecas.ruinas], ['base', mundo.plano.bases, mundo.pecas.bases]];
  for (const [tipo, planos, pecas] of grupos)
    for (let i = 0; i < planos.length; i++)
      for (const [j, p] of pecas[i].entries())
        if (DE_CHAO[tipo](p)) yield { tipo: nomeDaPeca(tipo, p), nome: `${tipo}#${i}/${j}`, p, c: planos[i], caixa: P.caixaDaPeca(p) };
}

describe('construções rurais: a caixa sólida desce até o chão em toda a pegada', () => {
  it('torre, cabana, ruína, muro de base, sacos e caixotes: vão ZERO entre a caixa e o terreno (12 sementes)', () => {
    const pior = {}, contagem = {};
    for (const m of mundos) for (const q of pecasDeChao(m)) {
      const r = relevo(m.t.heightAt, q.caixa);
      const vao = q.caixa.y0 - r.min;
      contagem[q.tipo] = (contagem[q.tipo] || 0) + 1;
      if (!pior[q.tipo] || vao > pior[q.tipo].vao)
        pior[q.tipo] = { vao, onde: `semente ${m.s} ${q.nome} em (${r.pMin.map(v => v.toFixed(1)).join(', ')})` };
    }
    for (const tipo of ['torre', 'cabana', 'ruína', 'muro', 'sacos', 'caixote'])
      assert.ok(contagem[tipo] >= 12, `pré-condição: só ${contagem[tipo] || 0} peças de ${tipo}`);
    const laudo = Object.entries(pior).map(([t, v]) => `${t} ${v.vao.toFixed(2)} m (${v.onde})`).join('; ');
    for (const [tipo, v] of Object.entries(pior))
      assert.ok(v.vao <= 0, `${tipo}: a caixa sólida fica ${v.vao.toFixed(2)} m acima do chão — ${laudo}`);
  });

  it('sem enterrar: caixote e sacos com a altura inteira de fora; o muro da base continua muro (2,1 m ou mais, nunca penhasco)', () => {
    const faixa = {};
    const anota = (tipo, v, onde) => {
      const f = faixa[tipo] || (faixa[tipo] = { min: Infinity, max: -Infinity, ondeMin: '', ondeMax: '' });
      if (v < f.min) { f.min = v; f.ondeMin = onde; }
      if (v > f.max) { f.max = v; f.ondeMax = onde; }
    };
    for (const m of mundos) for (const q of pecasDeChao(m)) {
      if (!['muro', 'sacos', 'caixote'].includes(q.tipo)) continue;
      const alto = q.tipo === 'muro' ? 2.1 : q.p.w === 1.4 ? 1.4 : q.p.w === 1.2 ? 1.2 : 0.8;
      // altura visível em cada coluna de 0,1 m ao longo da peça: topo − chão da coluna
      const longo = q.caixa.x1 - q.caixa.x0 >= q.caixa.z1 - q.caixa.z0;
      const L = longo ? q.caixa.x1 - q.caixa.x0 : q.caixa.z1 - q.caixa.z0;
      for (let k = 0; k <= Math.ceil(L / PASSO); k++) {
        const u = Math.min(L, k * PASSO);
        const col = longo ? { x0: q.caixa.x0 + u, x1: q.caixa.x0 + u, z0: q.caixa.z0, z1: q.caixa.z1 }
          : { x0: q.caixa.x0, x1: q.caixa.x1, z0: q.caixa.z0 + u, z1: q.caixa.z0 + u };
        const r = relevo(m.t.heightAt, col);
        const onde = `semente ${m.s} ${q.nome}`;
        anota(q.tipo, (q.caixa.y1 - r.max) / alto, onde);   // o lado mais alto do chão
        anota(q.tipo, (q.caixa.y1 - r.min) / alto, onde);   // o lado mais baixo
      }
    }
    const laudo = Object.entries(faixa).map(([t, f]) => `${t} ${f.min.toFixed(2)}–${f.max.toFixed(2)}× o desenho`).join('; ');
    // 3 %: o construtor amostra o relevo a cada 0,25 m e este teste a cada
    // 0,1 m — o pico entre duas amostras dele fica uns centímetros acima
    for (const tipo of ['muro', 'sacos', 'caixote'])
      assert.ok(faixa[tipo].min >= 0.97, `${tipo} enterrado: só ${(faixa[tipo].min * 100).toFixed(0)} % da altura de fora (${faixa[tipo].ondeMin}) — ${laudo}`);
    // o muro de 2,1 m não pode virar um paredão no lado de baixo da encosta.
    // Um muro inteiro assentado no chão mais alto chegaria a 2,1 + 13 m (777);
    // em trechos de 3 m ele fica em 2,1–3,75 m (1,8×) nas 12 sementes
    assert.ok(faixa.muro.max <= 1.8, `muro vira penhasco: ${(faixa.muro.max * 2.1).toFixed(2)} m de altura (${faixa.muro.ondeMax}) — ${laudo}`);
  });

  it('portas continuam portas: o portão de 6 m da base e a porta de 1,2 m da cabana seguem sem caixa sólida', () => {
    for (const m of mundos) {
      const solidas = P.paredesDoJogo(m.mundo).filter(w => !w.noCollide);
      const vaoLivre = (x0, x1, z0, z1, y0, y1) => solidas.filter(w =>
        w.x1 > x0 && w.x0 < x1 && w.z1 > z0 && w.z0 < z1 && w.y1 > y0 && w.y0 < y1);
      for (const b of m.mundo.plano.bases) {
        const chao = relevo(m.t.heightAt, { x0: b.x - 2.9, x1: b.x + 2.9, z0: b.z + 14.6, z1: b.z + 15.4 });
        const tapam = vaoLivre(b.x - 2.9, b.x + 2.9, b.z + 14.6, b.z + 15.4, chao.max + 0.13, chao.max + 2);
        assert.deepEqual(tapam, [], `semente ${m.s}: o portão da base (${b.x.toFixed(1)}, ${b.z.toFixed(1)}) foi fechado`);
      }
      for (const c of m.mundo.plano.cabanas) {
        const { D } = P.dimensoesCabana(c.flip);
        const zf = c.z + D / 2;
        const tapam = vaoLivre(c.x - 0.55, c.x + 0.55, zf - 0.2, zf + 0.2, c.y + 0.25, c.y + 2.2);
        assert.deepEqual(tapam, [], `semente ${m.s}: a porta da cabana (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) foi fechada`);
      }
    }
  });
});

/* ---------------- castelo ---------------- */
function progressoRampa(t) { // o perfil C1 de js/castle.js
  const e = 0.25, s = 1 - e;
  t = Math.max(0, Math.min(1, t));
  if (t < e) return t * t / (2 * e * s);
  if (t > 1 - e) { const r = 1 - t; return 1 - r * r / (2 * e * s); }
  return (t - e / 2) / s;
}
const FH = 19.18, GATE_INNER = 19.24, RAMP_OUTER = 26.5, RAMP_HALF = 2;
const rampaY = (c, zLocal) => c.floorY + (c.approachY - c.floorY) * progressoRampa((zLocal - GATE_INNER) / (RAMP_OUTER - GATE_INNER));
const CORPOS = { lobo: [0.238, 0.935], zumbi: [0.4, 1.8], soldado: [0.45, 1.9] };
// o que o Colosso alcança vindo do chão em frente: raio 1,5 m + um degrau de 0,61 m (7,32 m / 12)
const FIM_DA_RAMPA = RAMP_OUTER - 1.6 - 0.61;
const DEGRAU = { jogador: 0.65, colosso: 1.45 }; // js/terrain.js groundAt (+0,65) e js/boss.js (sonda +0,8)

/* corpo que anda NO TERRENO (heightAt, como bicho, zumbi e soldado) de `de` até `para` */
function andar(S, h, de, para, [r, alt], aoPasso) {
  const pos = { x: de.x, y: h(de.x, de.z), z: de.z };
  for (let i = 0; i < 4000; i++) {
    const dx = para.x - pos.x, dz = para.z - pos.z, d = Math.hypot(dx, dz);
    if (d < 0.06) break;
    pos.x += dx / d * 0.05; pos.z += dz / d * 0.05;
    pos.y = h(pos.x, pos.z);
    S.collide(pos, r, alt);
    pos.y = h(pos.x, pos.z);
    aoPasso(pos);
  }
  return pos;
}

describe('castelo: portão e rampa sem vão por baixo', () => {
  it('quem anda no terreno não entra debaixo do pátio nem do aterro da rampa (12 sementes × 3 corpos × 23 trajetos)', async () => {
    const falhas = [];
    let debaixoRampa = { vao: 0, onde: '' }, antesDoFim = { vao: 0, onde: '' }, trajetos = 0;
    for (const m of mundos) {
      const c = m.mundo.castelo, cx = c.center.x, cz = c.center.z;
      const doCastelo = P.paredesDoJogo(m.mundo).filter(w => w.castle);
      const S = await comEstruturas(doCastelo);
      const solidas = doCastelo.filter(w => !w.noCollide);
      // collide() é UMA passada: empurrado para fora de um degrau, o corpo pode
      // acabar o quadro dentro do vizinho e sai no seguinte. Isso é trânsito
      // dentro do sólido, não vão — o vão é onde ele fica SEM caixa nenhuma.
      const emSolido = p => solidas.some(w => p.x > w.x0 && p.x < w.x1 && p.z > w.z0 && p.z < w.z1 && p.y < w.y1 - 0.12);
      const h = m.t.heightAt;
      const rotas = [];
      for (const x0 of [-2.25, -1.9, -1, 0, 1, 1.9, 2.25]) rotas.push([{ x: cx + x0, z: cz + 32 }, { x: cx + x0 * 0.5, z: cz - 10 }]);
      for (const z0 of [19.5, 20.5, 22, 23.5, 25, 26.2]) for (const lado of [-1, 1])
        rotas.push([{ x: cx + lado * 9, z: cz + z0 }, { x: cx - lado * 0.5, z: cz + z0 }]);
      for (const x0 of [-1.5, 0, 1.5]) rotas.push([{ x: cx + x0, z: cz + 29 }, { x: cx + x0, z: cz + 20 }]);
      rotas.push([{ x: cx - 25, z: cz + 25 }, { x: cx, z: cz }]);
      for (const [nome, corpo] of Object.entries(CORPOS)) for (const [de, para] of rotas) {
        trajetos++;
        let dentro = null;
        andar(S, h, de, para, corpo, pos => {
          const lx = pos.x - cx, lz = pos.z - cz;
          if (!dentro && Math.abs(lx) < FH - 0.46 && Math.abs(lz) < FH - 0.46 && pos.y < c.floorY - 0.3)
            dentro = `semente ${m.s}: ${nome} entrou debaixo do pátio em (${lx.toFixed(1)}, ${lz.toFixed(1)}), ${(c.floorY - pos.y).toFixed(2)} m sob o piso`;
          if (Math.abs(lx) < RAMP_HALF && lz > FH && lz < RAMP_OUTER && !emSolido(pos)) {
            const vao = rampaY(c, lz) - 0.28 - pos.y;   // do chão onde ele pisa até a face de baixo da rampa
            const onde = `semente ${m.s}: ${nome} em (${lx.toFixed(2)}, ${lz.toFixed(2)})`;
            if (vao > debaixoRampa.vao) debaixoRampa = { vao, onde };
            if (lz < FIM_DA_RAMPA && vao > antesDoFim.vao) antesDoFim = { vao, onde };
          }
        });
        if (dentro) falhas.push(dentro);
      }
    }
    assert.ok(trajetos >= 12 * 3 * 23, `pré-condição: ${trajetos} trajetos`);
    assert.deepEqual(falhas.slice(0, 6), [], `${falhas.length} trajetos entraram debaixo do castelo`);
    /* Debaixo da rampa. Antes: vazio de até 4,98 m, aberto dos lados. Agora o
       aterro barra quem anda no terreno, com uma exceção medida e assumida: o
       Colosso (1,5 m de raio) sobe na rampa vindo do terreno por um degrau de
       até 1,45 m (sonda 0,8 m + os 0,65 do groundAt), então os degraus que ele
       alcança do chão em frente ao fim da rampa (os últimos 2,2 m) ficam
       baixos o bastante para não empurrá-lo. Ali sobra vão onde o chão cai de
       lado sob o fim da rampa — medido: 1,14 m (sementes 138 e 555), ≤ 0,81 m
       nas outras dez. Antes desse trecho, ≤ 0,42 m: o lobo (0,94 m) não cabe. */
    assert.ok(antesDoFim.vao <= 0.5, `corpo andou debaixo da rampa com ${antesDoFim.vao.toFixed(2)} m de vão (${antesDoFim.onde})`);
    assert.ok(debaixoRampa.vao <= 1.2, `corpo andou debaixo do fim da rampa com ${debaixoRampa.vao.toFixed(2)} m de vão (${debaixoRampa.onde})`);
  });

  it('bala rente ao chão não atravessa o perímetro, o portão nem o aterro da rampa', async () => {
    let raios = 0;
    const furos = [];
    for (const m of mundos) {
      const c = m.mundo.castelo, cx = c.center.x, cz = c.center.z, h = m.t.heightAt;
      const q = P.criarConsultaParedes(P.paredesDoJogo(m.mundo).filter(w => w.castle));
      const lados = [
        [s => ({ x: cx - FH, z: cz + s }), { x: 1, y: 0, z: 0 }], [s => ({ x: cx + FH, z: cz + s }), { x: -1, y: 0, z: 0 }],
        [s => ({ x: cx + s, z: cz - FH }), { x: 0, y: 0, z: 1 }], [s => ({ x: cx + s, z: cz + FH }), { x: 0, y: 0, z: -1 }],
      ];
      // perímetro da pegada (portão incluído): do chão da borda até 0,3 m sob o piso
      for (const [ponto, d] of lados) for (let s = -FH + 0.05; s <= FH - 0.05; s += 0.25) {
        const p = ponto(s), chao = h(p.x, p.z);
        for (let y = chao + 0.05; y < c.floorY - 0.3; y += 0.2) {
          raios++;
          if (q.raio({ x: p.x - d.x * 0.6, y, z: p.z - d.z * 0.6 }, d, 1.5) === Infinity)
            furos.push(`semente ${m.s}: borda (${(p.x - cx).toFixed(2)}, ${(p.z - cz).toFixed(2)}) a ${(y - chao).toFixed(2)} m do chão`);
        }
      }
      // de lado através da rampa: do chão até 0,4 m sob a pista (a laje visual tem 0,28 m)
      for (let z = FH + 0.05; z < RAMP_OUTER; z += 0.25) for (const lado of [-1, 1]) {
        const x = cx + lado * (RAMP_HALF + 0.6), chao = Math.max(h(x, cz + z), h(cx, cz + z), h(cx - lado * (RAMP_HALF + 0.6), cz + z));
        for (let y = chao + 0.05; y < rampaY(c, z) - 0.4; y += 0.2) {
          raios++;
          if (q.raio({ x, y, z: cz + z }, { x: -lado, y: 0, z: 0 }, 2 * RAMP_HALF + 1.2) === Infinity)
            furos.push(`semente ${m.s}: através da rampa em z ${z.toFixed(2)}, ${(y - chao).toFixed(2)} m do chão`);
        }
      }
    }
    assert.ok(raios > 20000, `pré-condição: só ${raios} raios`);
    assert.deepEqual(furos.slice(0, 5), [], `${furos.length} de ${raios} raios passaram`);
  });

  it('quem sobe a rampa não é empurrado pelo aterro: jogador (0,42 m) e Colosso (1,5 m) na pista, na soleira e no pé da rampa', async () => {
    const empurroes = [];
    for (const m of mundos) {
      const c = m.mundo.castelo, cx = c.center.x, cz = c.center.z, h = m.t.heightAt;
      const S = await comEstruturas(P.paredesDoJogo(m.mundo).filter(w => w.castle));
      const testa = (x, z, y, r, alt, onde) => {
        const pos = { x, y, z };
        S.collide(pos, r, alt);
        const d = Math.hypot(pos.x - x, pos.z - z);
        if (d > 1e-9) empurroes.push(`semente ${m.s}: ${onde} r=${r} empurrado ${d.toFixed(3)} m`);
      };
      let pe = 0;
      for (let z = FH - 1.5; z <= RAMP_OUTER + 2.2; z += 0.2) {
        for (const [quem, r, alt, xs] of [['jogador', 0.42, 1.7, [-1.85, -1, 0, 1, 1.85]], ['colosso', 1.5, 5, [-0.8, 0, 0.8]]]) for (const xl of xs) {
          const x = cx + xl, Z = cz + z;
          let y;
          if (z < GATE_INNER) y = c.floorY;                                 // pátio e soleira
          else if (z <= RAMP_OUTER) y = Math.max(rampaY(c, z), h(x, Z));   // pista (groundAt)
          else {                                                             // pé da rampa, no terreno
            y = h(x, Z);
            // de onde o degrau dele não alcança a pista, ele não sobe por ali:
            // dar de cara com a cabeceira do aterro é o certo
            if (rampaY(c, RAMP_OUTER) - y > DEGRAU[quem]) continue;
            pe++;
          }
          testa(x, Z, y, r, alt, `${quem} (${xl}, ${z.toFixed(1)})`);
        }
      }
      assert.ok(pe > 0, `pré-condição: semente ${m.s} sem ponto de subida em frente à rampa`);
    }
    assert.deepEqual(empurroes.slice(0, 6), [], `${empurroes.length} empurrões na rampa`);
  });
});
