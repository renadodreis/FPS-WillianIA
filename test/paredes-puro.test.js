/* ================================================================
   PAREDES — o construtor do mundo sólido é PURO e serve ao servidor.

   js/paredes.js é importado pelo Node (servidor, bots) só com o que está em
   `dependencies`. Aqui, sem navegador:
     • o grafo de import não tem pacote nenhum (nem `three`), nem DOM;
     • não encosta no Math.random global (roda com ele ARMADO para explodir);
     • é determinístico por semente, e sementes diferentes dão plantas
       diferentes;
     • os espelhos do castelo (medida do sítio e colisores) batem BIT A BIT
       com js/castle.js — que o servidor não pode importar;
     • numa varredura de sementes, a planta nova mantém os invariantes que a
       varredura de 500 sementes do castelo cobrou (rampa ≤ 30°, órbita do
       Golem livre de cidade e de base, 2 bases, tudo construído);
     • a consulta segmento × caixas é a mesma conta do Structures.rayHit.
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const Bots = require('../scripts/bots.js');

const JS = path.join(__dirname, '..', 'js');
const importar = f => import(url.pathToFileURL(path.join(JS, f)).href);

async function mundoDe(semente) {
  const P = await importar('paredes.js');
  const t = await Bots.createBotTerrain(semente);
  const args = { worldSeed: semente, heightAt: t.heightAt, slopeAt: t.slopeAt, WATER_LEVEL: t.WATER_LEVEL, CITY: t.CITY };
  return { P, t, args, mundo: P.construirMundoSolido(args) };
}

describe('paredes.js é dado puro', () => {
  it('o grafo de import só tem módulos relativos do próprio jogo, nenhum pacote e nenhum DOM', () => {
    const vistos = new Set();
    const pendentes = ['paredes.js'];
    while (pendentes.length) {
      const f = pendentes.pop();
      if (vistos.has(f)) continue;
      vistos.add(f);
      const src = fs.readFileSync(path.join(JS, f), 'utf8');
      const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const m of codigo.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)) {
        const esp = m[1];
        assert.ok(esp.startsWith('./'), `${f} importa o pacote "${esp}" — o servidor não pode depender disso`);
        pendentes.push(path.normalize(esp));
      }
      for (const proibido of [/\bdocument\s*[.[]/, /\bwindow\s*[.[]/, /\bglobalThis\b/, /\bTHREE\s*\./, /Math\.random\s*\(/])
        assert.ok(!proibido.test(codigo), `${f} usa ${proibido} — não é mais dado puro`);
    }
    assert.ok(vistos.size >= 2, `pré-condição: o grafo tem só ${[...vistos]}`);
  });

  it('não consome o Math.random global (roda com ele armado para explodir)', async () => {
    const P = await importar('paredes.js');
    const t = await Bots.createBotTerrain(424242);
    const R = Math.random;
    let chamadas = 0;
    Math.random = () => { chamadas++; throw new Error('paredes.js chamou Math.random'); };
    try {
      P.construirMundoSolido({ worldSeed: 424242, heightAt: t.heightAt, slopeAt: t.slopeAt,
        WATER_LEVEL: t.WATER_LEVEL, CITY: t.CITY });
    } finally { Math.random = R; }
    assert.equal(chamadas, 0);
  });

  it('mesma semente → mesmo mundo; semente diferente → planta diferente, cidade no mesmo desenho', async () => {
    const a = (await mundoDe(424242)).mundo, b = (await mundoDe(424242)).mundo, c = (await mundoDe(7)).mundo;
    assert.deepEqual(a.paredes, b.paredes);
    const rurais = m => m.paredes.filter(w => !w.city).map(w => [w.x0, w.z0]);
    const ra = rurais(a), rc = rurais(c);
    const dif = ra.filter((p, i) => Math.hypot(p[0] - rc[i][0], p[1] - rc[i][1]) > 1).length;
    assert.ok(dif > 100, `sementes 424242 e 7 deram só ${dif} caixas rurais em lugar diferente`);
    // a cidade não sorteia nada: mesmo desenho em planta, e a altura acompanha
    // só o chão do centro (gy), que o platô NÃO fixa por completo (5% do relevo)
    const ca = a.paredes.filter(w => w.city), cc = c.paredes.filter(w => w.city);
    assert.equal(ca.length, cc.length);
    assert.notEqual(a.cidade.gy, c.cidade.gy, 'pré-condição: as duas sementes têm o mesmo gy');
    ca.forEach((w, i) => {
      for (const k of ['x0', 'x1', 'z0', 'z1']) assert.equal(w[k], cc[i][k], `cidade #${i}.${k}`);
      for (const k of ['y0', 'y1'])
        assert.ok(Math.abs((w[k] - a.cidade.gy) - (cc[i][k] - c.cidade.gy)) < 1e-9, `cidade #${i}.${k} fora do gy`);
    });
  });

  it('semente 0/ausente cai em 424242, como a grama e os POIs do cliente', async () => {
    const P = await importar('paredes.js');
    assert.equal(P.sementeNormalizada(0), 424242);
    assert.equal(P.sementeNormalizada(undefined), 424242);
    assert.equal(P.sementeNormalizada('987654'), 987654);
    assert.equal(P.sementeNormalizada(-1), 4294967295);
  });
});

describe('espelhos do castelo batem com js/castle.js', () => {
  let P, C, terrenos;
  before(async () => {
    P = await importar('paredes.js');
    C = await importar('castle.js');
    terrenos = await Promise.all([424242, 1, 138].map(s => Bots.createBotTerrain(s)));
  });

  it('medirSitioCastelo == measureCastleSite (relevo real, 3 sementes × 12 sítios)', () => {
    let n = 0;
    for (const t of terrenos) for (let k = 0; k < 12; k++) {
      const a = k * 0.5236, r = 290 + k * 10;
      const center = { x: Math.cos(a) * r, z: Math.sin(a) * r };
      assert.deepEqual(P.medirSitioCastelo({ center, heightAt: t.heightAt }),
        C.measureCastleSite({ center, heightAt: t.heightAt }), `sítio ${JSON.stringify(center)}`);
      n++;
    }
    assert.equal(n, 36);
  });

  it('paredesDoCastelo == colisores de createCastle (mesma ordem, mesmos bits, mesmas marcas)', async () => {
    const avisos = console.warn;
    console.warn = () => {};   // o GLB não existe no Node: o castelo cai no fallback e avisa
    try {
      for (const t of terrenos) {
        const center = { x: 320, z: -260 };
        const walls = [];
        const castelo = C.createCastle({ center, heightAt: t.heightAt, scene: { add() {}, remove() {} }, csmMat: m => m,
          noSeed: fn => fn(), walls, platforms: [], fieldRoofs: [], modelUrl: 'file:///nao-existe.glb' });
        await castelo.ready; // o aviso do fallback sai aqui, ainda silenciado
        const nossas = P.paredesDoCastelo(P.medirSitioCastelo({ center, heightAt: t.heightAt }));
        assert.equal(nossas.length, walls.length);
        walls.forEach((w, i) => {
          for (const k of ['x0', 'x1', 'y0', 'y1', 'z0', 'z1'])
            assert.equal(nossas[i][k], w[k], `castelo #${i} (${w.part}).${k}`);
          assert.equal(nossas[i].part, w.part);
          assert.equal(!!nossas[i].noCollide, !!w.noCollide, `castelo #${i} (${w.part}).noCollide`);
        });
      }
    } finally { console.warn = avisos; }
  });
});

describe('planta nova mantém os invariantes (varredura em Node)', () => {
  it('120 sementes: tudo construído, rampa ≤ 30°, órbita do Golem livre de cidade e de base', async () => {
    const P = await importar('paredes.js');
    const falhas = [];
    let ms = 0, contagem = null;
    for (let s = 0; s < 120; s++) {
      const semente = s === 0 ? 424242 : (Math.imul(s, 2654435761) >>> 0);
      const t = await Bots.createBotTerrain(semente);
      const t0 = performance.now();
      const m = P.construirMundoSolido({ worldSeed: semente, heightAt: t.heightAt, slopeAt: t.slopeAt,
        WATER_LEVEL: t.WATER_LEVEL, CITY: t.CITY });
      ms += performance.now() - t0;
      const pl = m.plano;
      const guarda = 30 + 1.5; // órbita + corpo do Golem (castle-layout.test.js)
      const pb = [];
      if (pl.torres.length !== 6 || pl.cabanas.length !== 6 || pl.ruinas.length !== 5 || pl.bases.length !== 2)
        pb.push(`construído ${pl.torres.length}/${pl.cabanas.length}/${pl.ruinas.length}/${pl.bases.length}`);
      if (pl.forte.x === 330 && pl.forte.z === -280) pb.push('forte no ponto de reserva');
      else if (m.castelo.rampMaxSlopeDegrees > 30) pb.push(`rampa ${m.castelo.rampMaxSlopeDegrees.toFixed(2)}°`);
      const cidade = Math.hypot(pl.forte.x - t.CITY.x, pl.forte.z - t.CITY.z) - 88 - guarda;
      if (cidade < -1e-6) pb.push(`cidade invade a órbita (${cidade.toFixed(2)} m)`);
      for (const b of pl.bases) {
        const g = Math.hypot(Math.max(0, Math.abs(b.x - pl.forte.x) - 21), Math.max(0, Math.abs(b.z - pl.forte.z) - 15)) - guarda;
        if (g < -1e-6) pb.push(`base invade a órbita (${g.toFixed(2)} m)`);
      }
      for (const st of pl.sites) if (st.type !== 'cidade' && t.heightAt(st.x, st.z) < t.WATER_LEVEL + 1.5)
        pb.push(`${st.type} dentro d'água`);
      if (contagem === null) contagem = m.paredes.length;
      if (pb.length) falhas.push(`${semente}: ${pb.join('; ')}`);
    }
    assert.deepEqual(falhas, []);
    assert.ok(ms / 120 < 200, `construirMundoSolido custou ${(ms / 120).toFixed(1)} ms por semente`);
    // Era 303. O assentamento no terreno (js/paredes.js, test/predios-assentamento)
    // somou 78: o muro das 2 bases virou 25 + 38 trechos que acompanham a
    // encosta (eram 5 + 5 caixas inteiras) e o castelo ganhou a fundação sob
    // o portão + 12 degraus de aterro e 12 lajes de bala sob a rampa.
    // 381 → 581: os 10 degraus de cada um dos 20 lances da Torre Nexus
    // viraram caixas `noCollide` (barram bala, não empurram quem anda) —
    // antes a bala passava pelos degraus desenhados (test/torre-bala-escada).
    assert.equal(contagem, 581, 'a semente 424242 devia ter 581 paredes (sem o cofre)');
  });
});

describe('consulta segmento × caixas (fase 2: visada dos bots)', () => {
  let P;
  before(async () => { P = await importar('paredes.js'); });
  const caixa = { x0: 0, x1: 2, y0: 0, y1: 3, z0: -1, z1: 1 };

  it('distância até a face, erro e raio paralelo — a conta do rayHit', () => {
    const q = P.criarConsultaParedes([caixa]);
    assert.equal(q.raio({ x: -5, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 100), 5);          // face x0
    assert.equal(q.raio({ x: -5, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 4), Infinity);     // curto demais
    assert.equal(q.raio({ x: -5, y: 5, z: 0 }, { x: 1, y: 0, z: 0 }, 100), Infinity);   // passa por cima
    assert.equal(q.raio({ x: 1, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 100), Infinity);    // origem dentro: t0 = 0 não conta
    assert.equal(q.raio({ x: 5, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }, 100), 3);          // de trás pra frente: face x1
  });

  it('segmentoBloqueado: atravessa, termina antes, passa ao lado, degenerado', () => {
    const q = P.criarConsultaParedes([caixa]);
    assert.equal(q.segmentoBloqueado({ x: -5, y: 1, z: 0 }, { x: 5, y: 1, z: 0 }), true);
    assert.equal(q.segmentoBloqueado({ x: -5, y: 1, z: 0 }, { x: -0.01, y: 1, z: 0 }), false);
    assert.equal(q.segmentoBloqueado({ x: -5, y: 1, z: 1.5 }, { x: 5, y: 1, z: 1.5 }), false);
    assert.equal(q.segmentoBloqueado({ x: -5, y: 1, z: 0 }, { x: -5, y: 1, z: 0 }), false);
  });

  it('no mundo: um prédio da cidade barra a reta que o atravessa e deixa passar a que vai por cima', async () => {
    const { P: Par, mundo } = await mundoDe(424242);
    const q = Par.criarConsultaParedes(Par.paredesDoJogo(mundo));
    const L = mundo.cidade.lotes[0], v = L.volume; // maciço: volume = o prédio inteiro
    const y = mundo.cidade.gy + 1.7;
    assert.equal(q.segmentoBloqueado({ x: v.x - v.w, y, z: v.z }, { x: v.x + v.w, y, z: v.z }), true, 'atravessou o prédio');
    const alto = v.y + v.h / 2 + 5;
    assert.equal(q.segmentoBloqueado({ x: v.x - v.w, y: alto, z: v.z }, { x: v.x + v.w, y: alto, z: v.z }), false,
      'a reta por cima do telhado foi barrada');
    // cidade destruída: o prédio some e só o toco/escombros baixos ficam
    const qd = Par.criarConsultaParedes(Par.paredesComCidadeDestruida(mundo));
    assert.equal(Par.paredesComCidadeDestruida(mundo).filter(w => w.city).length, 0);
    assert.equal(qd.segmentoBloqueado({ x: v.x - v.w, y: y + 3, z: v.z }, { x: v.x + v.w, y: y + 3, z: v.z }), false,
      'com a cidade destruída o prédio ainda barrou');
  });
});
