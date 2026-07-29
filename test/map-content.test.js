/* ================================================================
   QA — CONTEÚDO DO MAPA (stream C: entretenimento/exploração).

   Integração no jogo de verdade — terreno real, `platforms` real,
   `Structures.collide` real. O contrato puro de cada peça mora nos
   testes de node (watchtower / poi-bounds / city-interiors); aqui se
   prova que ele SOBREVIVE ao mundo:

     1. as 6 torres de vigia viraram miradouros utilizáveis;
     2. as atrações pararam de nascer encostadas na cerca do mundo;
     3. dá pra ENTRAR nos prédios marcados da cidade (e sair pelo outro
        lado), e o interior some junto no evento de destruição.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

const PORT = 3740;

describe('Conteúdo do mapa', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: PORT, worldSeed: '424242' });
    await h.play(() => window.QA.tick(4));
  });
  after(async () => { if (h) await h.close(); });

  /* ---------------- TORRES DE VIGIA ---------------- */

  it('as 6 torres publicam tampo pisável (antes o jogador atravessava)', async () => {
    const r = await h.play(() => {
      const G = window.__game;
      const torres = G.Structures.sites.filter(s => s.type === 'torre');
      return torres.map(t => {
        const decks = G.platforms.filter(p => p.role === 'deck' &&
          Math.hypot((p.x0 + p.x1) / 2 - t.x, (p.z0 + p.z1) / 2 - t.z) < 0.01);
        return { x: t.x, z: t.z, decks: decks.length, y: decks[0] ? decks[0].y : null,
          chao: G.heightAt(t.x, t.z) };
      });
    });
    assert.equal(r.length, 6, 'o mapa perdeu torres');
    for (const t of r) {
      assert.equal(t.decks, 1, `torre (${t.x.toFixed(0)},${t.z.toFixed(0)}) sem tampo pisável`);
      assert.ok(t.y - t.chao > 6 && t.y - t.chao < 7,
        `tampo a ${(t.y - t.chao).toFixed(2)} m do chão (esperado ~6,34)`);
    }
  });

  it('o jogador PARA em cima do tampo em vez de atravessar', async () => {
    const r = await h.play(() => {
      const G = window.__game, out = [];
      for (const t of G.Structures.sites.filter(s => s.type === 'torre')) {
        const deck = G.platforms.find(p => p.role === 'deck' &&
          Math.hypot((p.x0 + p.x1) / 2 - t.x, (p.z0 + p.z1) / 2 - t.z) < 0.01);
        // pousa no tampo e deixa a física rodar: sem plataforma, cai 6 m
        G.player.pos.set(t.x, deck.y + 0.05, t.z);
        G.player.vel.set(0, 0, 0);
        G.player.onGround = false;
        window.QA.tick(45);
        out.push({ x: t.x, z: t.z, alvo: deck.y, ficou: G.player.pos.y });
      }
      return out;
    });
    for (const t of r)
      assert.ok(Math.abs(t.ficou - t.alvo) < 0.4,
        `caiu do tampo em (${t.x.toFixed(0)},${t.z.toFixed(0)}): parou em ${t.ficou.toFixed(2)}, tampo ${t.alvo.toFixed(2)}`);
  });

  it('a escada sobe de verdade no terreno REAL das 6 torres', async () => {
    const r = await h.play(async () => {
      const G = window.__game;
      const W = await import('/js/watchtower.js');
      const out = [];
      for (const t of G.Structures.sites.filter(s => s.type === 'torre')) {
        const gy = G.heightAt(t.x, t.z);
        const path = W.climbWaypoints(t.x, t.z, gy, 0.25);
        // começa no TERRENO cru do pé da escada (não já em cima da rampa):
        // é assim que o jogador chega
        let cur = G.heightAt(path[0].x, path[0].z), pior = 0;
        for (const wp of path) {
          const g = G.groundAt(wp.x, wp.z, cur);
          if (g - cur > pior) pior = g - cur;
          cur = g;
        }
        const deck = G.platforms.find(p => p.role === 'deck' &&
          Math.hypot((p.x0 + p.x1) / 2 - t.x, (p.z0 + p.z1) / 2 - t.z) < 0.01);
        out.push({ x: t.x, z: t.z, pior, fim: cur, deck: deck.y });
      }
      return out;
    });
    for (const t of r) {
      assert.ok(t.pior <= 0.65 + 1e-6,
        `degrau de ${t.pior.toFixed(3)} m na torre (${t.x.toFixed(0)},${t.z.toFixed(0)})`);
      assert.ok(Math.abs(t.fim - t.deck) < 1e-6,
        `subida não chegou ao tampo em (${t.x.toFixed(0)},${t.z.toFixed(0)}): ${t.fim.toFixed(2)} vs ${t.deck.toFixed(2)}`);
    }
  });

  it('a escada não fica dentro de parede: collide não expulsa quem sobe', async () => {
    const r = await h.play(async () => {
      const G = window.__game;
      const W = await import('/js/watchtower.js');
      let pior = 0, piorEm = null;
      for (const t of G.Structures.sites.filter(s => s.type === 'torre')) {
        const gy = G.heightAt(t.x, t.z);
        let cur = gy;
        for (const wp of W.climbWaypoints(t.x, t.z, gy, 0.35)) {
          cur = G.groundAt(wp.x, wp.z, cur);
          const p = { x: wp.x, y: cur, z: wp.z };
          G.Structures.collide(p, 0.42, 1.7);
          const empurrao = Math.hypot(p.x - wp.x, p.z - wp.z);
          if (empurrao > pior) { pior = empurrao; piorEm = { x: +wp.x.toFixed(1), z: +wp.z.toFixed(1), t: t.type }; }
        }
      }
      return { pior, piorEm };
    });
    assert.ok(r.pior < 0.25,
      `collide empurrou ${r.pior.toFixed(3)} m em ${JSON.stringify(r.piorEm)} — a escada esbarra em parede`);
  });

  it('o guarda-corpo do tampo é cobertura de verdade (para bala) e deixa a boca da escada aberta', async () => {
    const r = await h.play(() => {
      const G = window.__game, S = G.Structures;
      const t = S.sites.filter(s => s.type === 'torre')[0];
      const deck = G.platforms.find(p => p.role === 'deck' &&
        Math.hypot((p.x0 + p.x1) / 2 - t.x, (p.z0 + p.z1) / 2 - t.z) < 0.01);
      const yPeito = deck.y + 0.35;
      const V = (x, y, z) => ({ x, y, z });
      return {
        // tiro rasante vindo do NORTE bate no parapeito
        norte: S.segBlocked(V(t.x, yPeito, t.z - 6), V(t.x, yPeito, t.z)),
        // a boca da escada (leste-sul) segue vazada: dá pra entrar
        boca: S.segBlocked(V(t.x + 4, deck.y + 0.9, t.z + 1.4), V(t.x, deck.y + 0.9, t.z + 1.4)),
      };
    });
    assert.equal(r.norte, true, 'parapeito não bloqueia bala — não é cobertura');
    assert.equal(r.boca, false, 'a entrada da escada está murada');
  });

  /* ---------------- ATRAÇÕES DENTRO DO MAPA ---------------- */

  it('nenhuma atração nasce encostada na cerca do mundo', async () => {
    const r = await h.play(async () => {
      const core = await import('/js/cannon-core.js');
      const G = window.__game;
      const pts = Object.entries(G.MapToys.spots).map(([k, s]) => ({ k, x: s.x, z: s.z }));
      pts.push({ k: 'cannon', x: G.Cannon.spot.x, z: G.Cannon.spot.z });
      return { limite: core.POI_MAX_RADIUS,
        pts: pts.map(p => ({ ...p, d: Math.hypot(p.x, p.z) })) };
    });
    for (const p of r.pts) {
      assert.ok(Number.isFinite(p.d), `atração ${p.k} sem posição`);
      assert.ok(p.d <= r.limite + 1e-6,
        `${p.k} a ${p.d.toFixed(0)} m do centro (limite ${r.limite}) — de volta pra cerca`);
    }
  });

  it('as atrações continuam espalhadas (o teto não empilhou tudo num canto)', async () => {
    const r = await h.play(() => {
      const G = window.__game;
      // `rings` MORA no canhão de propósito (o curso é o arco do disparo,
      // js/maptoys.js) — comparar os dois daria sempre 0 m
      const pts = Object.entries(G.MapToys.spots)
        .filter(([k]) => k !== 'rings').map(([, s]) => ({ x: s.x, z: s.z }));
      pts.push({ x: G.Cannon.spot.x, z: G.Cannon.spot.z });
      let min = Infinity;
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++)
          min = Math.min(min, Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z));
      return min;
    });
    assert.ok(r > 25, `duas atrações a ${r.toFixed(0)} m uma da outra`);
  });

  /* ---------------- TÉRREOS OCOS DA CIDADE ---------------- */

  it('os 4 lotes marcados viraram sala de verdade', async () => {
    const r = await h.play(async () => {
      const CI = await import('/js/cityinterior.js');
      const G = window.__game;
      return { n: G.Structures.cityInteriors.length, esperado: CI.HOLLOW_LOTS.length };
    });
    assert.equal(r.n, r.esperado, 'nem todos os lotes ocos foram materializados');
  });

  it('dá pra FICAR dentro: o miolo não empurra o jogador pra fora', async () => {
    const r = await h.play(() => {
      const G = window.__game, S = G.Structures, out = [];
      for (const it of S.cityInteriors) {
        const p = { x: it.bx, y: it.gy + 0.05, z: it.bz };
        // fora do centro exato: o balcão central ocupa o meio da sala
        p.x += 2.6;
        const antes = { x: p.x, z: p.z };
        for (let i = 0; i < 4; i++) S.collide(p, 0.42, 1.7);
        out.push({ lote: it.lot.ox + ',' + it.lot.oz,
          empurrao: Math.hypot(p.x - antes.x, p.z - antes.z),
          chao: G.groundAt(antes.x, antes.z, it.gy + 1) });
      }
      return out;
    });
    for (const it of r) {
      assert.ok(it.empurrao < 0.2, `lote ${it.lote}: collide empurrou ${it.empurrao.toFixed(2)} m — a sala é maciça`);
      assert.ok(Number.isFinite(it.chao), `lote ${it.lote}: sem chão dentro da sala`);
    }
  });

  it('as DUAS portas são vãos reais e as faces cegas continuam parede', async () => {
    const r = await h.play(() => {
      const G = window.__game, S = G.Structures, out = [];
      const V = (x, y, z) => ({ x, y, z });
      for (const it of S.cityInteriors) {
        const y = it.gy + 1.2;                     // altura do peito
        const portas = it.plan.exits.map(e => {
          const nx = e.face === 'E' ? 1 : e.face === 'O' ? -1 : 0;
          const nz = e.face === 'S' ? 1 : e.face === 'N' ? -1 : 0;
          const fx = it.bx + e.x, fz = it.bz + e.z;
          return S.segBlocked(V(fx + nx * 3, y, fz + nz * 3), V(fx - nx * 1.6, y, fz - nz * 1.6));
        });
        // face cega: a perpendicular que NÃO tem janela
        const usadas = new Set(it.plan.exits.map(e => e.face).concat([it.plan.window.face]));
        const cega = ['N', 'S', 'E', 'O'].find(f => !usadas.has(f));
        const cx2 = cega === 'E' ? it.bx + it.lot.w / 2 : cega === 'O' ? it.bx - it.lot.w / 2 : it.bx;
        const cz2 = cega === 'S' ? it.bz + it.d / 2 : cega === 'N' ? it.bz - it.d / 2 : it.bz;
        const cnx = cega === 'E' ? 1 : cega === 'O' ? -1 : 0;
        const cnz = cega === 'S' ? 1 : cega === 'N' ? -1 : 0;
        out.push({ lote: it.lot.ox + ',' + it.lot.oz, portas, cega,
          paredeCega: S.segBlocked(V(cx2 + cnx * 3, y, cz2 + cnz * 3), V(it.bx, y, it.bz)) });
      }
      return out;
    });
    for (const it of r) {
      assert.equal(it.portas.length, 2, `lote ${it.lote} sem duas portas`);
      for (const p of it.portas) assert.equal(p, false, `lote ${it.lote}: porta murada`);
      assert.equal(it.paredeCega, true, `lote ${it.lote}: a face ${it.cega} não é parede — a sala vaza`);
    }
  });

  it('a janela deixa ver/atirar pra fora, mas o peitoril continua cobrindo', async () => {
    const r = await h.play(() => {
      const G = window.__game, S = G.Structures, out = [];
      const V = (x, y, z) => ({ x, y, z });
      for (const it of S.cityInteriors) {
        const wnd = it.plan.window;
        const nx = wnd.face === 'E' ? 1 : wnd.face === 'O' ? -1 : 0;
        const nz = wnd.face === 'S' ? 1 : wnd.face === 'N' ? -1 : 0;
        const fx = it.bx + wnd.x, fz = it.bz + wnd.z;
        const olho = it.gy + (wnd.y0 + wnd.y1) / 2;
        const joelho = it.gy + wnd.y0 / 2;
        out.push({ lote: it.lot.ox + ',' + it.lot.oz,
          aberto: S.segBlocked(V(fx + nx * 4, olho, fz + nz * 4), V(fx - nx * 1.5, olho, fz - nz * 1.5)),
          peitoril: S.segBlocked(V(fx + nx * 4, joelho, fz + nz * 4), V(fx - nx * 1.5, joelho, fz - nz * 1.5)) });
      }
      return out;
    });
    for (const it of r) {
      assert.equal(it.aberto, false, `lote ${it.lote}: a janela está tapada`);
      assert.equal(it.peitoril, true, `lote ${it.lote}: o peitoril não cobre — a janela vai do chão ao teto`);
    }
  });

  it('o telhado continua pisável (o térreo oco não tirou o acesso de cima)', async () => {
    const r = await h.play(() => {
      const G = window.__game;
      return G.Structures.cityInteriors.map(it => ({
        lote: it.lot.ox + ',' + it.lot.oz,
        teto: G.groundAt(it.bx, it.bz, it.gy + it.lot.h + 1),
        esperado: it.gy + it.lot.h,
      }));
    });
    for (const it of r)
      assert.ok(Math.abs(it.teto - it.esperado) < 0.3,
        `lote ${it.lote}: telhado em ${it.teto.toFixed(2)}, esperado ${it.esperado.toFixed(2)}`);
  });

  it('a chuva não entra na sala (cobertura climática)', async () => {
    const r = await h.play(() => {
      const G = window.__game;
      return G.Structures.cityInteriors.map(it => ({
        lote: it.lot.ox + ',' + it.lot.oz,
        coberto: G.Cover.isCovered(it.bx, it.gy + 1, it.bz),
      }));
    });
    for (const it of r) assert.equal(it.coberto, true, `lote ${it.lote}: chove dentro da sala`);
  });

  it('a entrada aparece no radar do minimapa (findability)', async () => {
    const r = await h.play(() => {
      const G = window.__game;
      return G.Structures.poiMarks.filter(m => m.kind === 'interior').length;
    });
    assert.equal(r, 4, 'entradas dos térreos ocos não estão no radar');
  });

  it('o evento da cidade leva o interior junto (nada flutuando depois do destroy)', async () => {
    const r = await h.play(() => {
      const G = window.__game, MP = window.__MP, S = G.Structures;
      const it = S.cityInteriors[0];
      const dentro = (w) => w.city &&
        Math.abs((w.x0 + w.x1) / 2 - it.bx) < it.lot.w && Math.abs((w.z0 + w.z1) / 2 - it.bz) < it.d;
      const antes = S.walls.filter(dentro).length;
      const meshes = [];
      MP.scene.traverse(o => { if (o.name === 'cityInteriorMesh' || o.name === 'cityInteriorLampMesh') meshes.push(o); });
      const visAntes = meshes.map(m => m.visible);
      S.city.destroy();
      const depois = S.walls.filter(dentro).length;
      const visDepois = meshes.map(m => m.visible);
      S.city.restore();
      return { antes, depois, visAntes, visDepois,
        restaurado: S.walls.filter(dentro).length, meshes: meshes.length };
    });
    assert.equal(r.meshes, 2, 'meshes de interior não encontradas na cena');
    assert.ok(r.antes > 8, `só ${r.antes} paredes no lote oco — a sala não foi construída`);
    assert.equal(r.depois, 0, 'paredes do térreo oco sobreviveram ao destroy (colisão fantasma)');
    assert.deepEqual(r.visAntes, [true, true]);
    assert.deepEqual(r.visDepois, [false, false], 'o interior ficou visível depois do destroy — vaza no mesh global');
    assert.equal(r.restaurado, r.antes, 'restore() não devolveu as paredes da sala');
  });

  /* ---------------- SEGREDOS / ARMAS ÓRFÃS ---------------- */

  it('os 3 segredos existem e ficam em lugares alcançáveis', async () => {
    const r = await h.play(() => {
      const G = window.__game, S = G.Secrets;
      return {
        ninho: S.nest, cofre: S.vault, tabua: S.tablet,
        marcas: S.marks.length,
        // o estojo do ninho tem que estar EM CIMA de um tampo de torre
        tampo: S.nest ? G.platforms.some(p => p.role === 'deck' &&
          S.nest.x >= p.x0 - 1.5 && S.nest.x <= p.x1 + 1.5 &&
          S.nest.z >= p.z0 - 1.5 && S.nest.z <= p.z1 + 1.5 &&
          Math.abs(p.y - S.nest.y) < 0.01) : false,
        // o cofre tem que estar DENTRO de um térreo oco
        dentro: S.vault ? G.Structures.cityInteriors.some(it =>
          Math.abs(S.vault.x - it.bx) < it.lot.w / 2 && Math.abs(S.vault.z - it.bz) < it.d / 2) : false,
      };
    });
    assert.ok(r.ninho, 'sem ninho do atirador');
    assert.ok(r.cofre, 'sem cofre lacrado');
    assert.ok(r.tabua, 'sem tábua da melodia');
    assert.equal(r.tampo, true, 'o estojo do sniper não está no tampo de uma torre');
    assert.equal(r.dentro, true, 'o cofre não está dentro de nenhum térreo oco');
    assert.equal(r.marcas, 3, 'os 3 segredos precisam de ícone no radar (findability)');
  });

  it('o cofre nasce LACRADO: sem quebrar o cadeado não há prêmio', async () => {
    const r = await h.play(() => {
      const G = window.__game, S = G.Secrets;
      window.__BR_active = false;
      const out = { vivo: S.vault.alive, aberto: S.vault.open,
        prompt: S.prompt({ x: S.vault.x, y: S.vault.y, z: S.vault.z }) };
      window.__BR_active = true;
      return out;
    });
    assert.equal(r.vivo, true, 'o cadeado já nasce quebrado');
    assert.equal(r.aberto, false, 'o cofre já nasce aberto');
    assert.equal(r.prompt, null, 'dá pra saquear o cofre sem atirar no cadeado');
  });

  it('NO BR nenhum segredo entrega arma (arsenal do BR vem dos baús)', async () => {
    const r = await h.play(() => {
      const G = window.__game, S = G.Secrets;
      window.__BR_active = true;
      const antes = [5, 6, 7].map(i => G.arsenal[i].locked);
      S.playNote && G.Secrets.melody.forEach(i => S.playNote(i));  // melodia completa
      S.breakLock();                                                // cadeado quebrado
      const p = S.prompt(G.player.pos);
      return { antes, depois: [5, 6, 7].map(i => G.arsenal[i].locked), prompt: p };
    });
    assert.deepEqual(r.antes, [true, true, true], 'as 3 armas deviam começar trancadas');
    assert.deepEqual(r.depois, [true, true, true], 'segredo desbloqueou arma no BR — vantagem fora do loot');
    assert.equal(r.prompt, null, 'segredo oferece prompt de [E] no BR');
  });

  it('NO SOLO a melodia certa entrega a FACA "AURORA"', async () => {
    const r = await h.play(() => {
      const G = window.__game, S = G.Secrets;
      window.__BR_active = false;
      const antes = G.arsenal[5].locked;
      const meio = S.melody.slice(0, 3).map(i => S.playNote(i));
      const errado = G.arsenal[5].locked;              // meia melodia não vale
      S.melody.forEach(i => S.playNote(i));
      const depois = G.arsenal[5].locked;
      window.__BR_active = true;                        // devolve o harness ao estado dele
      return { antes, meio: meio.map(x => x.solved), errado, depois };
    });
    assert.equal(r.antes, true);
    assert.deepEqual(r.meio, [false, false, false], 'melodia parcial já resolvia');
    assert.equal(r.errado, true, 'meia melodia destrancou a faca');
    assert.equal(r.depois, false, 'a melodia completa NÃO destrancou a faca');
  });

  it('NO SOLO o cadeado é alvo de tiro e o cofre entrega a ESCOPETA "RAJADA"', async () => {
    const r = await h.play(() => {
      const G = window.__game, S = G.Secrets;
      window.__BR_active = false;
      // o cadeado foi registrado em extraTargets no boot (o teste do BR já
      // o quebrou — o "lacrado" tem teste próprio acima)
      const naLista = G.extraTargets.some(t => t.hitSpheres &&
        Math.hypot(t.pos().x - S.vault.x, t.pos().z - S.vault.z) < 1.5) || !S.vault.alive;
      S.breakLock();
      const depoisDoTiro = S.prompt({ x: S.vault.x, y: S.vault.y, z: S.vault.z });
      const trancada = G.arsenal[7].locked;
      if (depoisDoTiro) depoisDoTiro.fn();
      const solta = G.arsenal[7].locked;
      window.__BR_active = true;
      return { naLista, temPrompt: !!depoisDoTiro, trancada, solta };
    });
    assert.equal(r.naLista, true, 'o cadeado não entrou em extraTargets — não dá pra atirar nele');
    assert.equal(r.temPrompt, true, 'cofre aberto não oferece [E]');
    assert.equal(r.trancada, true);
    assert.equal(r.solta, false, 'saquear o cofre não destrancou a escopeta');
  });

  it('NO SOLO o estojo do ninho entrega a SNIPER "AGULHA" (recompensa da verticalidade)', async () => {
    const r = await h.play(() => {
      const G = window.__game, S = G.Secrets;
      window.__BR_active = false;
      const longe = S.prompt({ x: S.nest.x + 30, y: S.nest.y, z: S.nest.z });
      const chao = S.prompt({ x: S.nest.x, y: S.nest.y - 6, z: S.nest.z }); // do pé da torre não vale
      const perto = S.prompt({ x: S.nest.x, y: S.nest.y, z: S.nest.z });
      const antes = G.arsenal[6].locked;
      if (perto) perto.fn();
      const depois = G.arsenal[6].locked;
      window.__BR_active = true;
      return { longe, chao, temPrompt: !!perto, antes, depois };
    });
    assert.equal(r.longe, null, 'o estojo é interagível de 30 m');
    assert.equal(r.chao, null, 'dá pra pegar o estojo do chão sem subir a torre');
    assert.equal(r.temPrompt, true, 'em cima do tampo não aparece o prompt');
    assert.equal(r.antes, true);
    assert.equal(r.depois, false, 'o estojo não destrancou a sniper');
  });

  it('não gerou erros de página', async () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
