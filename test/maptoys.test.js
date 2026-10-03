/* ================================================================
   QA — as 5 atrações do mapa no jogo real (browser + BR ativo).
   Cama elástica, campo de tiro, fogos, aros e xilofone. Porta 3261.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { bootGame } = require('./helpers/harness.js');

const PORT = 3261;

describe('Atrações do mapa 🎪', () => {
  let h;
  before(async () => { h = await bootGame({ port: PORT }); });
  after(async () => { if (h) await h.close(); });

  it('atrações espalhadas sem empilhar; argolas moram NO canhão (curso do disparo)', async () => {
    const r = await h.play(() => {
      const G = window.__game, M = G.MapToys;
      if (!M) return { ok: false, why: 'sem __game.MapToys' };
      const s = M.spots;
      const list = [s.tramp, s.gallery, s.fireworks, s.xylo]; // aros são DO canhão agora
      let minPair = Infinity;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++)
        minPair = Math.min(minPair, Math.hypot(list[i].x - list[j].x, list[i].z - list[j].z));
      const cannon = G.Cannon.spot;
      let minCannon = Infinity;
      for (const p of list) minCannon = Math.min(minCannon, Math.hypot(p.x - cannon.x, p.z - cannon.z));
      /* "nasceu na água" medido NA PEGADA, não num ponto. Antes era
         `heightAt(centro) > -3` — um proxy 2 m acima do nível da água (-5)
         que o próprio pickSpot não usa (ele aceita centro 1,2 m acima, a
         mesma regra de "seco" dos baús). Com o layout de 2026-09-28 (as
         construções sortearam num PRNG próprio, js/paredes.js) a cama
         elástica da seed 424242 foi parar numa margem: centro a 1,52 m da
         água e a pegada inteira (raio 3,5 m, onde ficam as quinas das
         almofadas a ±2,4 m) SECA — menor altura -4,29 contra água em -5; a
         água só começa a ~8 m. O que o caso quer saber é se alguma parte da
         atração está dentro do lago: pegada toda acima da água, com folga de
         0,3 m, e centro na regra de "seco" do pickSpot. */
      const WL = window.__MP.WATER_LEVEL;
      const menorNaPegada = p => {
        let mn = G.heightAt(p.x, p.z);
        for (let k = 0; k < 32; k++) {
          const a = k / 32 * Math.PI * 2;
          mn = Math.min(mn, G.heightAt(p.x + Math.cos(a) * 3.5, p.z + Math.sin(a) * 3.5));
        }
        return mn;
      };
      const molhadas = list.map((p, i) => ({ i, centro: G.heightAt(p.x, p.z), pegada: menorNaPegada(p) }))
        .filter(m => m.centro <= WL + 1.2 || m.pegada <= WL + 0.3)
        .map(m => `#${m.i} centro ${m.centro.toFixed(2)} pegada ${m.pegada.toFixed(2)} (água ${WL})`);
      const ringsAtCannon = Math.hypot(s.rings.x - cannon.x, s.rings.z - cannon.z);
      return { ok: true, minPair, minCannon, molhadas, count: list.length, ringsAtCannon };
    });
    assert.ok(r.ok, r.why);
    assert.equal(r.count, 4);
    assert.ok(r.minPair > 30, `atrações empilhadas (${r.minPair.toFixed(1)} m)`);
    assert.ok(r.minCannon > 20, `atração colada no canhão (${r.minCannon.toFixed(1)} m)`);
    assert.deepEqual(r.molhadas, [], `alguma nasceu na água: ${r.molhadas.join('; ')}`);
    assert.ok(r.ringsAtCannon < 2, `curso de argolas longe do canhão (${r.ringsAtCannon.toFixed(1)} m)`);
  });

  it('argolas seguem o ARCO BALÍSTICO do canhão; marcos e radar existem (findability)', async () => {
    const r = await h.play(() => {
      const G = window.__game, M = G.MapToys;
      const cn = G.Cannon.spot;
      const L = M.rings.list;
      const d0 = Math.hypot(L[0].x - cn.x, L[0].z - cn.z);
      const ys = L.map(p => p.y - G.heightAt(cn.x, cn.z)); // alturas relativas à base do canhão
      return {
        d0, ys, count: L.length,
        landmarks: M.landmarks.length,
        overlay: document.getElementById('minimapWrap').querySelectorAll('canvas').length,
      };
    });
    assert.equal(r.count, 5, 'curso deve ter 5 argolas');
    assert.ok(Math.abs(r.d0 - 11) < 2, `argola 1 fora do arco (d=${r.d0.toFixed(1)})`);
    assert.ok(r.ys[2] > r.ys[0] && r.ys[2] > r.ys[4], `sem apogeu no meio (${r.ys.map(y => y.toFixed(1))})`);
    assert.ok(r.ys[0] > 5, `argola 1 baixa demais pro tiro (${r.ys[0].toFixed(1)} m)`);
    assert.equal(r.landmarks, 5, 'cada atração precisa de um marco (mastro/bandeirola)');
    assert.equal(r.overlay, 2, 'overlay do radar das atrações ausente no minimapa');
  });

  it('🤸 Cama Elástica: cair na placa quica pra cima', async () => {
    const r = await h.play(() => {
      const G = window.__game, QA = window.QA, M = G.MapToys;
      const sp = M.spots.tramp;
      QA.reset(sp.x - 2.4, sp.z + 2.4);            // sobre uma placa
      const P = QA.MP.player;
      P.pos.y += 6; P.vel.set(0, -9, 0); P.onGround = false;
      let maxUp = -99, bounced = false;
      for (let i = 0; i < 40; i++) { QA.tick(1); if (P.vel.y > maxUp) maxUp = P.vel.y; if (P.vel.y > 6) bounced = true; }
      return { maxUp, bounced };
    });
    assert.ok(r.bounced, `não quicou (vel.y máx ${r.maxUp.toFixed(1)})`);
  });

  it('🎯 Campo de Tiro: alavanca abre sessão, alvo pipoca e pontua', async () => {
    const r = await h.play(async () => {
      const G = window.__game, QA = window.QA, M = G.MapToys;
      M.startGallery();
      const active = M.gallery.active;
      for (let i = 0; i < 90; i++) QA.tick(1);     // ~1.5s: alvos sobem
      const before = M.gallery.score;
      let hit = false;
      for (const a of G.extraTargets) {
        if (a && a.alive && typeof a.homeY === 'number') { a.damage(20, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, false); hit = true; break; }
      }
      return { active, targets: M.gallery.targets, hit, scored: M.gallery.score > before };
    });
    assert.ok(r.active, 'sessão não abriu');
    assert.equal(r.targets, 6, 'esperava 6 alvos');
    assert.ok(r.hit, 'nenhum alvo ficou vivo pra acertar');
    assert.ok(r.scored, 'acerto não pontuou');
  });

  it('🎆 Totem de Fogos: dispara, entra em recarga e não repete no cooldown', async () => {
    const r = await h.play(() => {
      const G = window.__game, M = G.MapToys;
      const cd0 = M.fireworks.cd;
      M.fireFireworks();
      const cd1 = M.fireworks.cd;
      M.fireFireworks();                            // no cooldown: no-op
      const cd2 = M.fireworks.cd;
      return { cd0, cd1, cd2 };
    });
    assert.equal(r.cd0, 0, 'começa pronto');
    assert.ok(r.cd1 > 0, 'entrou em recarga');
    assert.ok(r.cd2 <= r.cd1 + 1e-6, 'não recarregou de novo no cooldown');
  });

  it('💫 Aros de Acrobacia: atravessar o próximo aro avança o curso', async () => {
    const r = await h.play(() => {
      const G = window.__game, QA = window.QA, M = G.MapToys;
      const P = QA.MP.player;
      G.state.cinematic = true;                     // congela o playerUpdate (posiciono à mão)
      const r0 = M.rings.list[0];
      P.pos.set(r0.x - r0.nx * 1.5, r0.y, r0.z - r0.nz * 1.5); QA.tick(1); // salto grande: só ancora o prev
      P.pos.set(r0.x - r0.nx * 0.6, r0.y, r0.z - r0.nz * 0.6); QA.tick(1); // antes do aro
      P.pos.set(r0.x + r0.nx * 0.9, r0.y, r0.z + r0.nz * 0.9); QA.tick(1); // atravessa
      const st = M.rings;
      G.state.cinematic = false;
      return { next: st.next, running: st.running, total: st.total };
    });
    assert.equal(r.total, 5);
    assert.ok(r.next >= 1, `curso não avançou (next=${r.next})`);
    assert.ok(r.running, 'cronômetro do curso não começou');
  });

  it('🎹 Xilofone: pisar numa placa registra a nota', async () => {
    const r = await h.play(() => {
      const G = window.__game, QA = window.QA, M = G.MapToys;
      const P = QA.MP.player;
      G.state.cinematic = true;
      const pl = M.plates[2];
      P.onGround = true; P.pos.x = pl.x; P.pos.z = pl.z; QA.tick(1);
      const step = M.lastPlate;
      G.state.cinematic = false;
      return { step, plates: M.plates.length };
    });
    assert.equal(r.plates, 8);
    assert.equal(r.step, 2, 'não detectou a placa pisada');
  });

  /* `lastPlate` é o que o rastreador da melodia lê (js/secrets.js). Ele era
     escrito FORA do portão de `onGround`, então passar por cima de uma placa no
     ar não tocava nota nenhuma e mesmo assim registrava a nota — o progresso do
     segredo zerava por algo que o jogador nunca ouviu. A fileira é contígua, e
     pular as placas do meio é justamente o jeito de tocar a melodia. */
  it('🎹 Xilofone: placa atravessada NO AR não conta (silenciosa não registra)', async () => {
    const r = await h.play(() => {
      const G = window.__game, QA = window.QA, M = G.MapToys;
      const P = QA.MP.player;
      G.state.cinematic = true;
      // pisa na 2 (no chão): registra
      P.onGround = true; P.pos.x = M.plates[2].x; P.pos.z = M.plates[2].z; QA.tick(1);
      const pisou = M.lastPlate;
      // passa por cima da 1 NO AR: não pode registrar
      P.onGround = false; P.pos.x = M.plates[1].x; P.pos.z = M.plates[1].z; QA.tick(1);
      const noAr = M.lastPlate;
      // pousa na 0: registra
      P.onGround = true; P.pos.x = M.plates[0].x; P.pos.z = M.plates[0].z; QA.tick(1);
      const pousou = M.lastPlate;
      G.state.cinematic = false;
      return { pisou, noAr, pousou };
    });
    assert.equal(r.pisou, 2, 'não registrou a placa pisada no chão');
    assert.equal(r.noAr, 2, `placa atravessada no ar registrou (lastPlate=${r.noAr})`);
    assert.equal(r.pousou, 0, 'não registrou a placa em que pousou');
  });

  it('PRODUTO: ser disparado pelo canhão atravessa o curso de argolas', async () => {
    const r = await h.play(() => {
      const G = window.__game, QA = window.QA, M = G.MapToys;
      const cn = G.Cannon;
      const sp = cn.spot;
      QA.reset(sp.x, sp.z);
      const P = QA.MP.player;
      const L = M.rings.list;
      // mira no azimute do curso (o disparo segue o olhar horizontal)
      QA.MP.camera.lookAt(L[2].x, P.pos.y + 1.62, L[2].z);
      QA.tick(2);
      const before = M.rings.next;
      cn.fire();
      for (let i = 0; i < 320; i++) { QA.tick(1); if (P.onGround && cn.state === 'idle' && i > 60) break; }
      let gravado = null; try { gravado = localStorage.getItem('callofai_ringBest'); } catch (e) { /* off */ }
      return { before, after: M.rings.next, best: M.rings.best, gravado };
    });
    /* o curso COMPLETO: as 5 argolas (o recorde só é gravado quando a 5ª
       passa). Aceitar "≥ 3" escondia que a 5ª ficava depois do pouso — o
       voo cai a ~54 m e ela estava a 55 (laudo f672d81, observação d) */
    assert.ok(r.best > 0,
      `o voo não completou o curso de argolas (next ${r.before}→${r.after}, recorde ${r.best})`);
    // o recorde é um TEMPO: gravado com centésimos (inteiro, 1,80 s virava "2")
    assert.ok(Math.abs(Number(r.gravado) - r.best) < 0.006, `recorde ${r.best} gravado como "${r.gravado}"`);
  });

  it('o tempo do curso é o que se GRAVA (centésimos): a mesma volta não sai "RECORDE" de novo', async () => {
    /* no laço REAL (relógio de parede): com `QA.tick` o passo é fixo e a volta
       dá 108 quadros = 1,80 s exatos — o ruído do relógio que fazia 1,7999 s
       contra o "1.8" gravado nem aparecia */
    const r = await h.play(async () => {
      const G = window.__game, QA = window.QA, M = G.MapToys, cn = G.Cannon, sp = cn.spot, P = QA.MP.player;
      const L = M.rings.list, voltas = [], espera = ms => new Promise(res => setTimeout(res, ms));
      for (let k = 0; k < 2; k++) {
        QA.reset(sp.x, sp.z);
        QA.MP.camera.lookAt(L[2].x, P.pos.y + 1.62, L[2].z);
        await espera(150);
        const antes = M.rings.completos;
        cn.fire();
        for (let i = 0; i < 160 && !(M.rings.completos > antes && P.onGround && cn.state === 'idle'); i++) await espera(50);
        voltas.push(M.rings.completos > antes ? { ...M.rings.ultimo } : null);
      }
      return voltas;
    });
    assert.ok(r[0] && r[1], `cenário: o curso não completou nas duas voltas (${JSON.stringify(r)})`);
    for (const v of r) assert.ok(Math.abs(v.time * 100 - Math.round(v.time * 100)) < 1e-6, `tempo ${v.time} fora de centésimos — compara-se uma coisa e grava-se outra`);
    assert.equal(r[1].rec, false, `a volta igual (${r[0].time} → ${r[1].time}) saiu "RECORDE"`);
  });

  for (const [dist, mira] of [[4, 2], [4.5, 0]]) it(`PRODUTO: disparado da BEIRA do canhão (${dist} m, onde o USAR alcança), mirando a ${mira + 1}ª argola, a carga o puxa e o curso completa`, async () => {
    const r = await h.play((dist, mira) => {
      const G = window.__game, QA = window.QA, M = G.MapToys, cn = G.Cannon, sp = cn.spot;
      const L = M.rings.list;
      // de lado para o curso; mirar a 1ª (a acesa) da beira era o caso de r10/r11
      const nx = L[0].nx, nz = L[0].nz;
      QA.reset(sp.x - nz * dist, sp.z + nx * dist);
      const P = QA.MP.player;
      QA.MP.camera.lookAt(L[mira].x, P.pos.y + 1.62, L[mira].z);
      QA.tick(2);
      const antes = M.rings.completos, dist0 = Math.hypot(P.pos.x - sp.x, P.pos.z - sp.z);
      const ok = cn.fire();
      for (let i = 0; i < 360; i++) { QA.tick(1); if (P.onGround && cn.state === 'idle' && i > 60) break; }
      return { ok, dist0, antes, depois: M.rings.completos };
    }, dist, mira);
    assert.ok(r.ok, 'fire() recusou o disparo da beira');
    assert.ok(r.dist0 > dist - 0.5, `cenário: a ${r.dist0.toFixed(2)} m do centro`);
    assert.equal(r.depois, r.antes + 1, `da beira, o voo não completou o curso (${r.antes} → ${r.depois})`);
  });

  it('o curso é UM voo: passou argola e voltou ao chão, ele reinicia', async () => {
    const r = await h.play(() => {
      const G = window.__game, QA = window.QA, M = G.MapToys, P = QA.MP.player;
      const L = M.rings.list, a0 = L[0];
      // atravessa a 1ª argola pelo meio (como no voo), e cai
      QA.reset(a0.x - a0.nx * 0.5, a0.z - a0.nz * 0.5);
      P.pos.set(a0.x - a0.nx * 0.5, a0.y, a0.z - a0.nz * 0.5); P.onGround = false;
      P.vel.set(a0.nx * 20, 0, a0.nz * 20);
      QA.tick(1);   // o 1º quadro só registra a posição (o teleporte não conta)
      P.pos.set(a0.x - a0.nx * 0.2, a0.y, a0.z - a0.nz * 0.2); P.vel.set(a0.nx * 20, 0, a0.nz * 20);
      let meio = null;
      for (let i = 0; i < 4; i++) { QA.tick(1); if (M.rings.next === 1) { meio = { next: M.rings.next, running: M.rings.running }; break; } }
      /* o quadro da SAÍDA DO HELICÓPTERO: o jogador no ar com o `onGround` que o
         helicóptero deixou (ele assenta a pose no chão o voo inteiro) — o
         reinício lia esse flag e zerava o curso a 20 m de altura (laudo a03c122) */
      P.onGround = true;
      M.update(1 / 60, 0);
      const noAr = { next: M.rings.next, y: P.pos.y - G.heightAt(P.pos.x, P.pos.z) };
      P.onGround = false;
      for (let i = 0; i < 300 && !P.onGround; i++) QA.tick(1);
      QA.tick(20);
      return { meio, noAr, chao: P.onGround, next: M.rings.next, running: M.rings.running, acesa: M.rings.list[0].lit };
    });
    assert.ok(r.meio && r.meio.running, `cenário: não atravessou a 1ª argola (${JSON.stringify(r.meio)})`);
    assert.equal(r.noAr.next, 1, `o curso reiniciou no ar (a ${r.noAr.y.toFixed(1)} m) com o onGround velho do helicóptero`);
    assert.ok(r.chao, 'cenário: não voltou ao chão');
    assert.equal(r.next, 0, `de volta ao chão, o curso segue esperando a argola ${r.next + 1}`);
    assert.equal(r.running, false);
    assert.equal(r.acesa, true, 'depois do voo, a 1ª argola ("comece aqui") ficou apagada');
  });

  it('o puxão do canhão não atravessa um carro encostado; o disparo sai de onde o jogador está', async () => {
    const r = await h.play(() => {
      const G = window.__game, QA = window.QA, cn = G.Cannon, sp = cn.spot, P = QA.MP.player;
      const L = G.MapToys.rings.list, nx = L[0].nx, nz = L[0].nz;
      // jogador a 4,5 m de lado; um carro parado entre ele e o centro
      const px = sp.x - nz * 4.5, pz = sp.z + nx * 4.5;
      const v = G.Car.vehicles.find(c => !c.destruido);
      const cx = sp.x - nz * 2.3, cz = sp.z + nx * 2.3;
      v.chassisBody.position.set(cx, G.heightAt(cx, cz) + 1, cz);
      v.chassisBody.velocity.set(0, 0, 0); v.chassisBody.angularVelocity.set(0, 0, 0);
      QA.tick(30);
      QA.reset(px, pz); QA.tick(3);
      const raio = Math.max(v.cfg.half[0], v.cfg.half[2]) * 0.9 + P.radius;
      const ok = cn.fire();
      let menor = Infinity;
      for (let i = 0; i < 40 && cn.state === 'charge'; i++) {
        QA.tick(1);
        const c = v.group.position;
        menor = Math.min(menor, Math.hypot(P.pos.x - c.x, P.pos.z - c.z));
      }
      for (let i = 0; i < 600 && cn.state !== 'idle'; i++) QA.tick(1);   // pousa: o caso seguinte acha o canhão livre
      return { ok, menor, raio, estado: cn.state };
    });
    assert.ok(r.ok, 'o canhão recusou o disparo');
    assert.ok(r.menor >= r.raio * 0.95, `puxado para dentro do carro: ${r.menor.toFixed(2)} m do centro dele (raio de corpo ${r.raio.toFixed(2)})`);
  });

  it('o puxão do canhão não atravessa carro EM CHAMAS (que deixou de segurar bala, mas tem corpo)', async () => {
    const r = await h.play(() => {
      const G = window.__game, QA = window.QA, cn = G.Cannon, sp = cn.spot, P = QA.MP.player;
      const L = G.MapToys.rings.list, nx = L[0].nx, nz = L[0].nz;
      const px = sp.x - nz * 4.5, pz = sp.z + nx * 4.5;
      const v = G.Car.vehicles.find(c => !c.destruido);
      const cx = sp.x - nz * 2.3, cz = sp.z + nx * 2.3;
      v.chassisBody.position.set(cx, G.heightAt(cx, cz) + 1, cz);
      v.chassisBody.velocity.set(0, 0, 0); v.chassisBody.angularVelocity.set(0, 0, 0);
      // em chamas: o estado que tira a proteção de bala (js/veiculos.js, queimar)
      const it = G.Veiculos.itens.find(x => x.ref === v);
      if (it) { it.estado = 'queimando'; it.inteiro = false; it.queimaAte = performance.now() + 60000; }
      QA.tick(30);
      QA.reset(px, pz); QA.tick(3);
      const raio = Math.max(v.cfg.half[0], v.cfg.half[2]) * 0.9 + P.radius;
      const ok = cn.fire();
      let menor = Infinity;
      for (let i = 0; i < 40 && cn.state === 'charge'; i++) {
        QA.tick(1);
        const c = v.group.position;
        menor = Math.min(menor, Math.hypot(P.pos.x - c.x, P.pos.z - c.z));
      }
      if (it) { it.estado = 'inteiro'; it.inteiro = true; }
      for (let i = 0; i < 600 && cn.state !== 'idle'; i++) QA.tick(1);   // pousa: o caso seguinte acha o canhão livre
      return { ok, temItem: !!it, menor, raio };
    });
    assert.ok(r.ok && r.temItem, 'cenário: sem disparo ou sem o item do veículo');
    assert.ok(r.menor >= r.raio * 0.95, `puxado para dentro do carro em chamas: ${r.menor.toFixed(2)} m (raio ${r.raio.toFixed(2)})`);
  });

  it('o puxão do canhão não atravessa o HELICÓPTERO pousado no caminho', async () => {
    const r = await h.play(() => {
      const G = window.__game, QA = window.QA, cn = G.Cannon, sp = cn.spot, P = QA.MP.player, Hl = G.Heli;
      const L = G.MapToys.rings.list, nx = L[0].nx, nz = L[0].nz;
      const px = sp.x - nz * 4.5, pz = sp.z + nx * 4.5;
      // helicóptero pousado entre o jogador e o centro
      const hx = sp.x - nz * 2.3, hz = sp.z + nx * 2.3;
      Hl.group.position.set(hx, G.heightAt(hx, hz), hz); Hl.group.rotation.y = Math.atan2(nx, nz);
      QA.tick(5);
      QA.reset(px, pz); QA.tick(3);
      const ok = cn.fire();
      let dentro = 0, quadros = 0;
      for (let i = 0; i < 40 && cn.state === 'charge'; i++) {
        QA.tick(1); quadros++;
        if (Hl.corpoNaFuselagem(P.pos.x, P.pos.y, P.pos.z, P.radius * 0.9)) dentro++;
      }
      for (let i = 0; i < 600 && cn.state !== 'idle'; i++) QA.tick(1);   // pousa: o caso seguinte acha o canhão livre
      return { ok, dentro, quadros };
    });
    assert.ok(r.ok, 'o canhão recusou o disparo');
    assert.ok(r.quadros >= 10, `cenário: ${r.quadros} quadros de carga`);
    assert.equal(r.dentro, 0, `puxado através do helicóptero: ${r.dentro} de ${r.quadros} quadros dentro da fuselagem`);
  });

  it('o carro que ENTRA no caminho durante a carga para o puxão; parado, a mira na 3ª argola voa para a 3ª', async () => {
    const r = await h.play(() => {
      const G = window.__game, QA = window.QA, cn = G.Cannon, sp = cn.spot, P = QA.MP.player;
      const L = G.MapToys.rings.list, nx = L[0].nx, nz = L[0].nz;
      const px = sp.x - nz * 4.5, pz = sp.z + nx * 4.5;
      const v = G.Car.vehicles.find(c => !c.destruido);
      // o carro começa LONGE (caminho livre no aperto)...
      v.chassisBody.position.set(sp.x + 40, G.heightAt(sp.x + 40, sp.z) + 1, sp.z);
      v.chassisBody.velocity.set(0, 0, 0); v.chassisBody.angularVelocity.set(0, 0, 0);
      QA.tick(20);
      QA.reset(px, pz); QA.tick(3);
      QA.MP.camera.lookAt(L[2].x, P.pos.y + 1.62, L[2].z);
      const ok = cn.fire();
      // ...e entra no caminho no 2º quadro da carga
      QA.tick(2);
      const cx = sp.x - nz * 1.8, cz = sp.z + nx * 1.8;
      v.chassisBody.position.set(cx, G.heightAt(cx, cz) + 1, cz);
      v.chassisBody.velocity.set(0, 0, 0); v.chassisBody.angularVelocity.set(0, 0, 0);
      const raio = Math.max(v.cfg.half[0], v.cfg.half[2]) * 0.9 + P.radius;
      let menor = Infinity, vel = null;
      for (let i = 0; i < 60 && !vel; i++) {
        QA.tick(1);
        const c = v.group.position;
        menor = Math.min(menor, Math.hypot(P.pos.x - c.x, P.pos.z - c.z));
        if (cn.state === 'flying') vel = { x: P.vel.x, z: P.vel.z, px: P.pos.x, pz: P.pos.z };
      }
      const alvo = { x: L[2].x - vel.px, z: L[2].z - vel.pz };
      const cos = (vel.x * alvo.x + vel.z * alvo.z) / (Math.hypot(vel.x, vel.z) * Math.hypot(alvo.x, alvo.z));
      for (let i = 0; i < 300 && !(P.onGround && cn.state === 'idle'); i++) QA.tick(1);
      return { ok, menor, raio, erroGraus: Math.acos(Math.min(1, cos)) * 180 / Math.PI };
    });
    assert.ok(r.ok, 'o canhão recusou o disparo');
    assert.ok(r.menor >= r.raio * 0.95, `o carro entrou no caminho e o puxão seguiu: ${r.menor.toFixed(2)} m do centro dele (raio ${r.raio.toFixed(2)})`);
    assert.ok(r.erroGraus < 2, `mirando a 3ª argola, o voo saiu a ${r.erroGraus.toFixed(1)}° dela`);
  });

  it('corpo: tronco e pedra só empurram na faixa de altura deles (o voo do canhão a 20 m passa reto)', async () => {
    // o mercado entra no obstaclesNear quando o GLB dele chega (assíncrono)
    await h.page.waitForFunction(() => {
      const G = window.__game;
      for (let gx = -520; gx <= 520; gx += 16) for (let gz = -520; gz <= 520; gz += 16)
        if (G.obstaclesNear(gx, gz).some(c => c.sourceId === 'mercado')) return true;
      return false;
    }, { timeout: 60000, polling: 500 });
    const r = await h.play(() => {
      const G = window.__game, QA = window.QA, P = QA.MP.player;
      // um tronco de corpo qualquer, longe de construção
      let o = null;
      for (let gx = -400; gx <= 400 && !o; gx += 40) for (let gz = -400; gz <= 400 && !o; gz += 40)
        for (const c of G.obstaclesNear(gx, gz)) if (c.sourceId === 'tree' && c.corpo !== false && c.r > 0.15) { o = c; break; }
      const chao = G.heightAt(o.x, o.z);
      const mede = (alto) => {
        QA.reset(o.x + o.r * 0.5, o.z);
        P.pos.set(o.x + o.r * 0.5, chao + alto, o.z); P.vel.set(0, 0, 0); P.onGround = alto < 0.01;
        if (alto > 0.01) P.launchT = 1;   // em voo (o do canhão): nada de chão no meio
        const x0 = P.pos.x, z0 = P.pos.z;
        QA.tick(1);
        P.launchT = 0;
        return Math.hypot(P.pos.x - x0, P.pos.z - z0);
      };
      /* a tenda (baixa): no alcance do PULO ela bate — passar por cima e cair
         dentro terminava num teleporte de 1 m; e o mercado: entre 3,4 m (o teto
         da bala) e o telhado desenhado (7 m) o corpo ficava DENTRO (laudo b92a932) */
      const empurra = (x, z, y) => {
        QA.reset(x, z); P.pos.set(x, y, z); P.vel.set(0, 0, 0); P.onGround = false; P.launchT = 1;
        const x0 = P.pos.x, z0 = P.pos.z; QA.tick(1); P.launchT = 0;
        return Math.hypot(P.pos.x - x0, P.pos.z - z0);
      };
      let tenda = null, mercado = null;
      for (let gx = -520; gx <= 520 && !(tenda && mercado); gx += 16) for (let gz = -520; gz <= 520 && !(tenda && mercado); gz += 16)
        for (const c of G.obstaclesNear(gx, gz)) { if (c.sourceId === 'tent') tenda = c; if (c.sourceId === 'mercado') mercado = c; }
      const res = { r: o.r, alto: mede(20), chao: mede(0) };
      if (tenda) {
        res.tendaPulo = empurra(tenda.x + tenda.r * 0.5, tenda.z, tenda.y1 + 1.0);
        res.tendaVoo = empurra(tenda.x + tenda.r * 0.5, tenda.z, tenda.y1 + 3);
      }
      // 6 m: acima do teto da bala + a margem do pulo (3,4 + 1,7), abaixo do telhado desenhado (7)
      if (mercado) res.mercado = empurra(mercado.x + mercado.r * 0.5, mercado.z, G.heightAt(mercado.x, mercado.z) + 6);
      return res;
    });
    assert.ok(r.chao > r.r * 0.3, `controle: no chão o tronco não empurrou (${r.chao.toFixed(3)} m)`);
    assert.ok(r.alto < 0.01, `20 m acima do tronco o corpo foi empurrado ${r.alto.toFixed(3)} m`);
    assert.ok(r.tendaPulo !== undefined && r.mercado !== undefined, 'cenário: sem tenda ou mercado');
    assert.ok(r.tendaPulo > 0.05, `1 m acima da cumeeira (no alcance do pulo) a tenda não bateu (${r.tendaPulo.toFixed(3)} m)`);
    assert.ok(r.tendaVoo < 0.01, `3 m acima da cumeeira a tenda empurrou ${r.tendaVoo.toFixed(3)} m`);
    assert.ok(r.mercado > 0.05, `a 6 m do chão (abaixo do telhado desenhado de 7 m) o corpo ficou DENTRO do mercado`);
  });

  /* CHÃO LIMPO SOB AS ATRAÇÕES. O canhão e as atrações nascem DEPOIS do
     refill que abre as clareiras da grama — nenhuma delas limpava o mato.
     Com o layout de 2a7dae6 o campo de tiro caiu no meio da grama: os discos
     sobem a ~0,8 m do chão e a lâmina vai de 0,62 a 1,33 m, então o
     minijogo ficava com os ALVOS escondidos. Âncora: as lâminas desenhadas
     (matriz de cada instância), não a lista de clareiras. */
  it('atrações e canhão nascem em chão limpo: nenhuma lâmina de grama de pé sob elas', async () => {
    const r = await h.play(() => {
      const G = window.QA.G;
      const pontos = Object.entries(G.MapToys.spots).filter(([, s]) => s)
        .map(([nome, s]) => ({ nome, x: s.x, z: s.z, r: nome === 'gallery' ? 6 : 3 }));
      const cp = G.Cannon && G.Cannon.pos;
      if (cp) pontos.push({ nome: 'canhão', x: cp.x, z: cp.z, r: 3 });
      return pontos.map(p => {
        /* a grama só existe em volta do jogador: sem visitar, a amostra vem
           vazia e o caso passa sem medir nada (0 de 0) */
        window.QA.reset(p.x + p.r + 3, p.z);
        window.QA.tick(120);
        let emPe = 0, total = 0;
        for (let k = 0; k < 9; k++) {
          const a = k * Math.PI * 2 / 9, d = k === 0 ? 0 : p.r * 0.7;
          const amostra = G.Grass.debugSample(p.x + Math.sin(a) * d, p.z + Math.cos(a) * d, 20000) || [];
          for (const l of amostra) {
            if (Math.hypot(l.x - p.x, l.z - p.z) > p.r) continue;
            total++;
            if (l.sy > 0.05) emPe++;
          }
        }
        return { nome: p.nome, emPe, total };
      });
    });
    assert.ok(r.length >= 5, `cenário inválido: ${r.length} atrações`);
    const vazias = r.filter(p => p.total < 20).map(p => `${p.nome}: ${p.total}`);
    assert.deepEqual(vazias, [], 'cenário inválido: amostra de grama vazia sob atração (não mediu):\n' + vazias.join('\n'));
    const sujas = r.filter(p => p.emPe > 0).map(p => `${p.nome}: ${p.emPe} de ${p.total} lâminas de pé`);
    assert.deepEqual(sujas, [], 'grama de pé sob atração:\n' + sujas.join('\n'));
  });

  it('não gerou erros de página (window.onerror)', async () => {
    const errs = await h.play(() => window.__game.errors.slice());
    assert.deepEqual(errs, [], `erros: ${errs.join(' | ')}`);
  });
});
