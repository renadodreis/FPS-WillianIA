/* ================================================================
   QA — TÉRREO OCO DOS PRÉDIOS DA CIDADE (contrato puro).

   Os 12 prédios eram caixas MACIÇAS (js/structures.js: cityBox) com
   telhado pisável e portas de trim — desenho, não vão. A cidade é o
   principal campo de batalha do BR e não dava pra entrar em lugar
   nenhum: zero esconderijo, zero rota interna, zero espaço de rotação.

   Aqui se trava o desenho de 4 térreos abertos (um por quadrante).
   Regra de ouro de level design: todo esconderijo precisa de DUAS
   saídas, senão vira armadilha — o teste recusa qualquer planta que
   tenha só um vão.
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let CI, L;
before(async () => {
  CI = await import('../js/cityinterior.js');
  L = await import('../js/citylayout.js');
});

const planOf = (i) => {
  const lot = L.LOTS[i];
  return CI.interiorPlan(lot, L.lotDepth(lot), CI.groundFloorHeight(lot));
};

describe('Seleção dos lotes ocos', () => {
  it('escolhe poucos lotes e todos existem no layout', () => {
    assert.ok(CI.HOLLOW_LOTS.length >= 3 && CI.HOLLOW_LOTS.length <= 5,
      `qualidade acima de quantidade: ${CI.HOLLOW_LOTS.length} lotes ocos`);
    for (const i of CI.HOLLOW_LOTS) {
      assert.ok(L.LOTS[i], `lote ${i} não existe`);
      assert.ok(CI.isHollowLot(i));
    }
    assert.equal(new Set(CI.HOLLOW_LOTS).size, CI.HOLLOW_LOTS.length, 'lote repetido');
  });

  it('os lotes ocos estão espalhados (rotação pela cidade, não um cantinho só)', () => {
    const quad = new Set(CI.HOLLOW_LOTS.map(i => {
      const l = L.LOTS[i];
      return `${l.ox >= 0 ? 'L' : 'O'}${l.oz >= 0 ? 'S' : 'N'}`;
    }));
    assert.ok(quad.size >= 3, `ocos concentrados em ${quad.size} quadrante(s): ${[...quad]}`);
  });

  it('cada lote oco é grande o bastante pra virar sala de tiroteio', () => {
    for (const i of CI.HOLLOW_LOTS) {
      const lot = L.LOTS[i], d = L.lotDepth(lot);
      const T = CI.INT.WALL_T;
      assert.ok((lot.w - 2 * T) >= 8 && (d - 2 * T) >= 8,
        `lote ${i} interno ${(lot.w - 2 * T).toFixed(1)}×${(d - 2 * T).toFixed(1)} m — apertado demais`);
      assert.ok(CI.groundFloorHeight(lot) >= 3,
        `lote ${i} com pé-direito ${CI.groundFloorHeight(lot)}`);
    }
  });

  /* O balcão central da sala existe para "pular nele pra atirar por cima do
     peitoril" (js/structures.js). Se o pé-direito não couber o jogador PULANDO
     de cima dele, a cabeça entra no bloco MACIÇO do prédio — que começa exatamente
     em gy+gfH e cobre TODO o footprint — e `Structures.collide` cai no ramo de
     "dentro da parede", que empurra para a face mais próxima: teleporte lateral
     de ~6 m, o jogador atravessa a fachada e cai na rua.
     Medido em Chrome headless (lote em -356,96): pés a 1,92 m do chão já
     disparavam empurrão de 6,12 m. */
  it('o pé-direito do térreo oco cabe o jogador PULANDO de cima da cobertura', () => {
    const ALTURA_JOGADOR = 1.7, GRAVIDADE = 22, VEL_PULO = 8.4; // game.js:1297,1171
    const apice = (VEL_PULO * VEL_PULO) / (2 * GRAVIDADE);
    const preciso = CI.INT.COVER_H + ALTURA_JOGADOR + apice;
    for (const i of CI.HOLLOW_LOTS) {
      const lot = L.LOTS[i];
      const pd = CI.groundFloorHeight(lot, true);
      assert.ok(pd >= preciso,
        `lote ${i}: pé-direito ${pd.toFixed(2)} m < ${preciso.toFixed(2)} m necessários ` +
        `(cobertura ${CI.INT.COVER_H} + jogador ${ALTURA_JOGADOR} + ápice do pulo ${apice.toFixed(2)})`);
    }
  });
});

describe('Planta do térreo — duas saídas obrigatórias', () => {
  it('toda planta tem exatamente 2 portas, em faces OPOSTAS', () => {
    for (const i of CI.HOLLOW_LOTS) {
      const p = planOf(i);
      assert.equal(p.exits.length, 2, `lote ${i} com ${p.exits.length} saída(s) — vira armadilha`);
      const [a, b] = p.exits;
      assert.equal(CI.oppositeFace(a.face), b.face,
        `lote ${i}: saídas em ${a.face} e ${b.face} não são opostas (fuga previsível)`);
      // a da frente é a fachada declarada no layout urbano
      assert.ok(p.exits.some(e => e.face === L.LOTS[i].face),
        `lote ${i}: nenhuma porta na fachada declarada (${L.LOTS[i].face})`);
    }
  });

  it('as portas são atravessáveis por um jogador (vão e altura reais)', () => {
    for (const i of CI.HOLLOW_LOTS) {
      for (const e of planOf(i).exits) {
        assert.ok(e.width >= 2.0, `porta de ${e.width} m no lote ${i}`);
        assert.ok(e.height >= 2.2, `porta de ${e.height} m de altura no lote ${i}`);
      }
    }
  });

  it('as duas saídas ficam em pontos distantes (não dá pra cobrir as duas de um lugar só)', () => {
    for (const i of CI.HOLLOW_LOTS) {
      const [a, b] = planOf(i).exits;
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(dist >= 8, `lote ${i}: saídas a ${dist.toFixed(1)} m`);
    }
  });

  it('tem uma janela: sightline pra fora sem precisar sair', () => {
    for (const i of CI.HOLLOW_LOTS) {
      const p = planOf(i);
      assert.ok(p.window, `lote ${i} sem janela — sala cega`);
      assert.ok(p.window.y0 >= 0.7 && p.window.y0 <= 1.3, 'peitoril fora da altura de cobertura');
      assert.ok(p.window.y1 - p.window.y0 >= 0.9, 'janela baixa demais pra mirar');
      assert.notEqual(p.window.face, L.LOTS[i].face, 'janela na mesma face da porta da frente');
      assert.notEqual(p.window.face, CI.oppositeFace(L.LOTS[i].face), 'janela na face da porta dos fundos');
    }
  });
});

describe('Planta do térreo — paredes fechadas e sem vazamento', () => {
  it('as 4 faces são cobertas por segmentos, sem furo além dos vãos declarados', () => {
    for (const i of CI.HOLLOW_LOTS) {
      const lot = L.LOTS[i], d = L.lotDepth(lot), gfH = CI.groundFloorHeight(lot);
      const p = CI.interiorPlan(lot, d, gfH);
      for (const face of ['N', 'S', 'E', 'O']) {
        const segs = p.walls.filter(s => s.face === face);
        assert.ok(segs.length >= 1, `lote ${i} face ${face} sem parede`);
        // varre a face de baixo pra cima em cada posição e confere que só os
        // vãos declarados ficam vazios
        const horiz = face === 'N' || face === 'S';
        const span = horiz ? [-lot.w / 2, lot.w / 2]
          : [-d / 2 + CI.INT.WALL_T, d / 2 - CI.INT.WALL_T];
        const vaos = [];
        for (const e of p.exits) if (e.face === face) vaos.push({ c: horiz ? e.x : e.z, hw: e.width / 2, y0: 0, y1: e.height });
        if (p.window && p.window.face === face)
          vaos.push({ c: horiz ? p.window.x : p.window.z, hw: p.window.width / 2, y0: p.window.y0, y1: p.window.y1 });
        for (let u = span[0] + 0.05; u < span[1]; u += 0.25) {
          for (let y = 0.05; y < gfH; y += 0.25) {
            const noVao = vaos.some(v => Math.abs(u - v.c) < v.hw && y > v.y0 && y < v.y1);
            const coberto = segs.some(s => {
              const su = horiz ? s.x : s.z, sl = horiz ? s.w : s.d;
              return Math.abs(u - su) <= sl / 2 && y >= s.y - s.h / 2 && y <= s.y + s.h / 2;
            });
            assert.equal(coberto, !noVao,
              `lote ${i} face ${face} em (u=${u.toFixed(2)}, y=${y.toFixed(2)}): coberto=${coberto}, esperado=${!noVao}`);
          }
        }
      }
    }
  });

  it('nenhum segmento de parede invade o footprint do lote', () => {
    for (const i of CI.HOLLOW_LOTS) {
      const lot = L.LOTS[i], d = L.lotDepth(lot);
      for (const s of CI.interiorPlan(lot, d, CI.groundFloorHeight(lot)).walls) {
        assert.ok(Math.abs(s.x) + s.w / 2 <= lot.w / 2 + 1e-6, `parede fora do lote em x (${i})`);
        assert.ok(Math.abs(s.z) + s.d / 2 <= d / 2 + 1e-6, `parede fora do lote em z (${i})`);
      }
    }
  });
});

describe('Planta do térreo — a sala vale a pena', () => {
  it('tem cobertura interna que quebra a linha reta entre as duas portas', () => {
    for (const i of CI.HOLLOW_LOTS) {
      const p = planOf(i);
      assert.ok(p.cover.length >= 3, `lote ${i} com ${p.cover.length} peça(s) de cobertura — sala vazia é galpão`);
      for (const c of p.cover)
        assert.ok(c.h >= 0.8 && c.h <= 1.4, `cobertura de ${c.h} m no lote ${i} (nem agacha nem tapa a visão)`);
      // o segmento porta→porta tem que esbarrar em pelo menos uma peça
      const [a, b] = p.exits;
      let bate = false;
      for (let t = 0; t <= 1; t += 0.01) {
        const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        if (p.cover.some(c => Math.abs(x - c.x) <= c.w / 2 && Math.abs(z - c.z) <= c.d / 2)) { bate = true; break; }
      }
      assert.ok(bate, `lote ${i}: dá pra varrer de porta a porta sem obstáculo`);
    }
  });

  it('mesmo assim dá pra atravessar: existe rota livre entre as duas portas', () => {
    for (const i of CI.HOLLOW_LOTS) {
      const lot = L.LOTS[i], d = L.lotDepth(lot);
      const p = CI.interiorPlan(lot, d, CI.groundFloorHeight(lot));
      const T = CI.INT.WALL_T, R = 0.45; // raio do jogador
      const passa = (x, z) => {
        if (Math.abs(x) > lot.w / 2 - T - R || Math.abs(z) > d / 2 - T - R) return false;
        return !p.cover.some(c => Math.abs(x - c.x) <= c.w / 2 + R && Math.abs(z - c.z) <= c.d / 2 + R);
      };
      // BFS numa grade de 0,25 m entre os dois vãos
      const step = 0.25;
      const key = (a, b) => `${a}_${b}`;
      const [a, b] = p.exits;
      const start = [Math.round((a.x - Math.sign(a.x) * 0.8) / step), Math.round((a.z - Math.sign(a.z) * 0.8) / step)];
      const goal = [Math.round((b.x - Math.sign(b.x) * 0.8) / step), Math.round((b.z - Math.sign(b.z) * 0.8) / step)];
      const fila = [start], visto = new Set([key(...start)]);
      let achou = false;
      while (fila.length) {
        const [gx, gz] = fila.shift();
        if (Math.abs(gx - goal[0]) <= 2 && Math.abs(gz - goal[1]) <= 2) { achou = true; break; }
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = gx + dx, nz = gz + dz, k = key(nx, nz);
          if (visto.has(k)) continue;
          if (!passa(nx * step, nz * step)) continue;
          visto.add(k); fila.push([nx, nz]);
        }
      }
      assert.ok(achou, `lote ${i}: cobertura entupiu a sala — não dá pra ir de uma porta à outra`);
    }
  });
});

describe('Pureza do contrato', () => {
  it('não consome Math.random (o térreo nasce na fase SEEDADA do worldgen)', () => {
    const R = Math.random;
    let n = 0;
    Math.random = () => { n++; return R(); };
    try {
      for (const i of CI.HOLLOW_LOTS) planOf(i);
    } finally { Math.random = R; }
    assert.equal(n, 0, `a planta consumiu ${n} Math.random — desloca o mundo inteiro`);
  });

  it('é determinístico', () => {
    for (const i of CI.HOLLOW_LOTS) assert.deepEqual(planOf(i), planOf(i));
  });

  it('a contagem de geometria pulada do caminho maciço é declarada (compensação de RNG)', () => {
    assert.equal(typeof CI.SKIPPED_TRIMS, 'number');
    assert.ok(CI.SKIPPED_TRIMS > 0, 'sem compensação declarada o stream seedado anda');
  });
});
