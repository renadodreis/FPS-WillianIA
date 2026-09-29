/* ================================================================
   VEÍCULO COM VIDA — no JOGO rodando (BR online, servidor de verdade).

   Decisão do dono (2026-09-28): "carro pode segurar tiro, mas não...
   pra sempre!!". Aqui se mede, no cliente real:
     1. PARIDADE: a frota que o servidor anuncia (plan.veiculos) é a frota
        que o cliente desenhou — mesmo índice, mesma vaga;
     2. CALIBRAGEM: a caixa que segura bala (js/veiculo-vida.js) cobre o
        modelo DESENHADO — medido pelos vértices da lataria, não pela
        própria caixa;
     3. OS TRÊS CAMINHOS DO TIRO param no caminhão inteiro — escopeta
        (hitscan), fuzil (`__BR_ballistics`) e bazuca (foguete) — e o
        acerto vira `vehicleHit`/`vehicleBlast`, que o SERVIDOR aceita
        (o bot-host recebe o `vehicleHp`);
     4. A VÍTIMA recusa dano com veículo inteiro no caminho, e o próprio
        veículo dela não a cobre;
     5. NÃO PRA SEMPRE: vida zero → motor morto e para de proteger; ~1 s
        depois (VEICULO_QUEIMA_S=1) explode, some da cena e da física, e
        quem ficou dentro morre.

   Âncoras independentes: o boneco do bot-host (as esferas de acerto que o
   próprio jogo desenha), os vértices do modelo, e o que o SERVIDOR difunde.
   Porta 4121 (faixa 4120–4129 desta frente).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness');

const PORT = 4121;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const collect = (sock, ev) => { const arr = []; sock.on(ev, d => arr.push(d)); return arr; };

describe('veículo com vida no jogo (BR online)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, host, hostId, pageId;

  before(async () => {
    h = await bootGame({ port: PORT, extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '300', FLY_TIME: '40', VEICULO_QUEIMA_S: '1' } });
    host = await startBRMatch(h, { serverPort: PORT });
    hostId = host.id;
    pageId = await h.play(() => window.__MP.socket.id);
    await h.play(() => window.__game.Car.ready);
    // espião do que a PÁGINA manda ao servidor
    await h.play(() => {
      const s = window.__MP.socket;
      window.__envios = [];
      const orig = s.emit.bind(s);
      s.emit = (ev, ...a) => { if (/^(vehicle|shotHit|explosionHit)/.test(ev)) window.__envios.push({ ev, d: a[0] }); return orig(ev, ...a); };
    });
  });
  after(async () => { if (host) host.close(); if (h) await h.close(); });

  /* põe o bot-host em `pos` com o servidor aceitando (anti-teleporte:
     re-ancora depois de 10 recusas) e espera a página ver o boneco lá */
  async function hostEm(pos, extra = {}) {
    for (let i = 0; i < 14; i++) { host.emit('state', { pos, rotY: 0, heldWeapon: 'FUZIL', ...extra }); await sleep(25); }
    for (let k = 0; k < 40; k++) {
      const ok = await h.play((id, p) => {
        const rp = window.__BR_debug.remotes.get(id);
        if (!rp) return false;
        window.QA.tick(3);
        return Math.hypot(rp.group.position.x - p[0], rp.group.position.z - p[2]) < 0.3;
      }, hostId, pos);
      if (ok) return;
      await sleep(50);
    }
    throw new Error('a página não viu o host chegar');
  }
  /* página em (x,z), com o servidor aceitando */
  async function paginaEm(x, z) {
    await h.play((px, pz) => window.QA.reset(px, pz), x, z);
    const alvo = await h.play(() => { const P = window.__MP.player.pos; return [P.x, P.z]; });
    for (let k = 0; k < 60; k++) {
      const visto = await new Promise(res => {
        const t = setTimeout(() => res(false), 150);
        host.once('playerUpdate', d => { clearTimeout(t); res(d && d.id === pageId && Math.hypot(d.pos[0] - alvo[0], d.pos[2] - alvo[1]) < 1.5); });
      });
      if (visto) return;
      await h.play(() => window.QA.tick(2));
    }
    throw new Error('o servidor não aceitou a página na posição');
  }

  it('paridade: a frota do servidor é a frota desenhada (mesmo índice, mesma vaga)', async t => {
    const r = await h.play(() => {
      const G = window.__game, S = window.__BR_debug.S;
      return {
        plan: S.plan.veiculos,
        vagas: [{ x: 7.5, z: -6, ry: 0 }, ...G.Structures.carSpots.map(s => ({ x: s.x, z: s.z, ry: s.ry }))],
        heli: G.Structures.heliSpot,
        y: G.Car.vehicles.map(v => v.group.position.y),
        itens: G.Veiculos.itens.map(i => [i.id, i.tipo]),
      };
    });
    const carros = r.plan.filter(v => v.v !== 'heli');
    assert.equal(carros.length, r.vagas.length, 'número de veículos diverge');
    assert.deepEqual(r.plan.map(v => [v.v, v.tipo]), r.itens, 'ids/tipos do servidor × do cliente');
    let piorY = 0;
    const difY = [];
    carros.forEach((v, i) => {
      assert.ok(Math.hypot(v.pos[0] - r.vagas[i].x, v.pos[2] - r.vagas[i].z) < 1e-6, `vaga ${i}: servidor ${v.pos} × cliente ${r.vagas[i].x},${r.vagas[i].z}`);
      assert.ok(Math.abs(v.ry - r.vagas[i].ry) < 1e-9, `giro ${i}`);
      difY.push(`${v.v}/${v.tipo}: ${(v.pos[1] - r.y[i]).toFixed(3)}`);
      piorY = Math.max(piorY, Math.abs(v.pos[1] - r.y[i]));
    });
    t.diagnostic(`servidor − cliente em y: ${difY.join(', ')}`);
    const heli = r.plan.find(v => v.v === 'heli');
    assert.ok(Math.hypot(heli.pos[0] - r.heli.x, heli.pos[1] - (r.heli.y + 0.05), heli.pos[2] - r.heli.z) < 1e-6, 'heliponto diverge');
    t.diagnostic(`altura: pior diferença servidor × chassi assentado = ${piorY.toFixed(3)} m`);
    assert.ok(piorY < 0.15, `o servidor põe um veículo ${piorY.toFixed(2)} m fora da altura desenhada`);
  });

  it('calibragem: a caixa de bala cobre a lataria DESENHADA (vértices do modelo, no referencial do chassi)', async t => {
    const m = await h.play(() => {
      const G = window.__game, THREE = window.__MP.THREE;
      const inv = new THREE.Matrix4(), v = new THREE.Vector3();
      const medir = (grupo, filtro) => {
        grupo.updateMatrixWorld(true);
        inv.copy(grupo.matrixWorld).invert();
        const ys = [], xs = [], zs = [];
        grupo.traverse(o => {
          if (!o.isMesh || !filtro(o)) return;
          const pos = o.geometry.attributes.position;
          for (let i = 0; i < pos.count; i += 3) {
            v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
            xs.push(v.x); ys.push(v.y); zs.push(v.z);
          }
        });
        const q = (a, k) => { const s = a.slice().sort((p, r) => p - r); return s[Math.floor(k * (s.length - 1))]; };
        return { x: [q(xs, 0.005), q(xs, 0.995)], y: [q(ys, 0.02), q(ys, 0.995)], z: [q(zs, 0.005), q(zs, 0.995)], n: xs.length };
      };
      const out = {};
      for (const it of G.Veiculos.itens) {
        if (out[it.tipo] || it.tipo === 'heli') continue; // heli: a caixa sai das medidas de js/heli.js
        out[it.tipo] = medir(it.ref.group, o => !!o.userData.importedCarModel);
      }
      return { medidas: out, tipos: G.Veiculos.TIPOS };
    });
    const linhas = [];
    for (const tipo of ['buggy', 'esportivo', 'caminhao']) {
      const md = m.medidas[tipo];
      linhas.push(md ? `${tipo}: modelo x ${md.x.map(v => v.toFixed(2))} y ${md.y.map(v => v.toFixed(2))} z ${md.z.map(v => v.toFixed(2))} (${md.n} vértices)` : `${tipo}: sem medida`);
    }
    t.diagnostic(linhas.join(' · '));
    for (const tipo of ['buggy', 'esportivo', 'caminhao']) {
      const md = m.medidas[tipo], cx = m.tipos[tipo].caixas[0];
      assert.ok(md && md.n > 100, `${tipo}: modelo sem vértices medidos`);
      // planta e teto: a caixa acompanha o desenho a ±8 cm
      assert.ok(Math.abs(cx.max[0] - md.x[1]) < 0.08 && Math.abs(cx.min[0] - md.x[0]) < 0.08, `${tipo}: comprimento da caixa [${cx.min[0]}, ${cx.max[0]}] × desenho`);
      assert.ok(Math.abs(cx.max[2] - md.z[1]) < 0.08 && Math.abs(cx.min[2] - md.z[0]) < 0.08, `${tipo}: largura da caixa [${cx.min[2]}, ${cx.max[2]}] × desenho`);
      assert.ok(Math.abs(cx.max[1] - md.y[1]) < 0.08, `${tipo}: teto da caixa ${cx.max[1]} × desenho ${md.y[1].toFixed(2)}`);
      assert.ok(cx.min[1] >= md.y[0] - 0.05, `${tipo}: a caixa desce abaixo do chão desenhado (${cx.min[1]} < ${md.y[0].toFixed(2)})`);
    }
  });

  /* cena: o caminhão (id 4), a página a ~14 m de um lado e o host 2,8 m
     ATRÁS dele, do outro, numa direção em que SÓ o caminhão está no meio */
  async function cenaDoCaminhao() {
    const c = await h.play(() => {
      const G = window.__game, MP = window.__MP, THREE = MP.THREE;
      const it = G.Veiculos.itens.find(i => i.tipo === 'caminhao');
      const cx = G.Veiculos.TIPOS.caminhao.caixas[0];
      /* ÂNCORA da cena, independente da consulta do produto: marcha de 2 cm
         com ponto-dentro-da-caixa no referencial do grupo desenhado */
      const inv = new THREE.Matrix4().copy(it.grupo.matrixWorld).invert(), q = new THREE.Vector3();
      const cruzaCaminhao = (a, b) => {
        for (let t = 0; t <= 1; t += 0.02 / a.distanceTo(b)) {
          q.copy(a).lerp(b, t).applyMatrix4(inv);
          if (q.x > cx.min[0] && q.x < cx.max[0] && q.y > cx.min[1] && q.y < cx.max[1] && q.z > cx.min[2] && q.z < cx.max[2]) return true;
        }
        return false;
      };
      const o = new THREE.Vector3(), d = new THREE.Vector3();
      for (let k = 0; k < 72; k++) {
        const a = k * Math.PI / 36;
        const ux = Math.cos(a), uz = Math.sin(a);
        const hx = it.pose.x + ux * 4.2, hz = it.pose.z + uz * 4.2;
        const px = it.pose.x - ux * 14, pz = it.pose.z - uz * 14;
        const hy = MP.groundAt(hx, hz, 999), py = MP.groundAt(px, pz, 999);
        o.set(px, py + 1.62, pz);
        const alvo = new THREE.Vector3(hx, hy + 1.0, hz), cabeca = new THREE.Vector3(hx, hy + 1.66, hz);
        d.copy(alvo).sub(o); const len = d.length(); d.normalize();
        // parede, relevo e o resto do mundo livres (sem contar o caminhão)...
        if (MP.rayBlockedAt(o, d, len, it) < len) continue;
        // ...e o caminhão no meio, pela âncora — do tronco E da cabeça
        if (cruzaCaminhao(o, alvo) && cruzaCaminhao(o, cabeca)) return { id: it.id, host: [hx, hy, hz], pagina: [px, pz], u: [ux, uz], centro: [it.pose.x, it.pose.y, it.pose.z] };
      }
      return null;
    });
    assert.ok(c, 'nenhuma direção em que só o caminhão separa os dois');
    await paginaEm(c.pagina[0], c.pagina[1]);
    await hostEm(c.host);
    return c;
  }
  async function disparar(indice, frames, alvo) {
    return h.play(async (i, n, a) => {
      const G = window.__game, MP = window.__MP, QA = window.QA;
      window.__envios.length = 0;
      const gun = G.arsenal[i];
      gun.locked = false;
      G.switchWeapon(i);
      QA.tick(70);
      gun.spreadHip = 0; gun.spreadAds = 0; gun.mag = gun.magSize; gun.lastShot = -99; gun.reloading = false;
      MP.camera.lookAt(a[0], a[1] + 1.0, a[2]);
      G.mouse.clicked = true; G.mouse.shooting = true;
      QA.tick(1);
      G.mouse.clicked = false; G.mouse.shooting = false;
      QA.tick(n);
      // o acerto em veículo sai agregado num microtask (a escopeta vira 1 mensagem)
      await new Promise(r => setTimeout(r, 30));
      return window.__envios.map(e => ({ ev: e.ev, d: e.d }));
    }, indice, frames, alvo);
  }

  it('os TRÊS caminhos do tiro param no caminhão inteiro, e o servidor aceita o acerto na lataria', async t => {
    const c = await cenaDoCaminhao();
    const hp = collect(host, 'vehicleHp');
    const esc = await disparar(1, 5, c.host);   // escopeta: hitscan no BR
    const fuz = await disparar(0, 30, c.host);  // fuzil: projétil (__BR_ballistics)
    const baz = await disparar(3, 60, c.host);  // bazuca: foguete
    await sleep(500);
    const noHost = [...esc, ...fuz, ...baz].filter(e => (e.ev === 'shotHit' || e.ev === 'explosionHit') && e.d.targetId === hostId);
    t.diagnostic(`escopeta ${JSON.stringify(esc.map(e => e.ev))} · fuzil ${JSON.stringify(fuz.map(e => e.ev))} · bazuca ${JSON.stringify(baz.map(e => e.ev))} · vehicleHp no host: ${JSON.stringify(hp.map(x => x.vida))}`);
    assert.equal(noHost.length, 0, `acerto no host através do caminhão: ${JSON.stringify(noHost)}`);
    assert.ok(esc.some(e => e.ev === 'vehicleHit' && e.d.v === c.id && e.d.weapon === 'ESCOPETA'), 'o hitscan não virou vehicleHit');
    assert.ok(fuz.some(e => e.ev === 'vehicleHit' && e.d.v === c.id && e.d.weapon === 'FUZIL'), 'o projétil não virou vehicleHit');
    assert.ok(baz.some(e => e.ev === 'vehicleBlast' && e.d.v === c.id && e.d.kind === 'BAZUCA'), 'o foguete não virou vehicleBlast');
    assert.ok(hp.length >= 3 && hp.at(-1).vida < 1760 - 88 - 26, `o servidor não descontou: ${JSON.stringify(hp)}`);

    // controle: com o MESMO caminhão fora da conta (só no cliente), o tiro chega ao host
    const controle = await h.play(id => { const it = window.__game.Veiculos.porId(id); it.inteiro = false; return true; }, c.id);
    assert.ok(controle);
    const livre = await disparar(1, 5, c.host);
    await h.play(id => { window.__game.Veiculos.porId(id).inteiro = true; }, c.id);
    assert.ok(livre.some(e => e.ev === 'shotHit' && e.d.targetId === hostId), `controle: sem o caminhão a escopeta não acertou o host (${JSON.stringify(livre.map(e => e.ev))})`);
  });

  it('a vítima recusa tiro e estilhaço com veículo inteiro no caminho', async () => {
    const c = await cenaDoCaminhao();
    // agora a PÁGINA é a vítima atrás do caminhão, e o host atira do outro lado
    const vitima = c.host, atirador = [c.pagina[0], 0, c.pagina[1]];
    await paginaEm(vitima[0], vitima[2]);
    await h.play(() => { const P = window.__MP.player; P.health = 100; P.armor = 0; P.invulnUntil = 0; });
    const yA = await h.play((x, z) => window.__MP.groundAt(x, z, 999), atirador[0], atirador[2]);
    await hostEm([atirador[0], yA, atirador[2]]);
    const tiro = { targetId: pageId, dmg: 25, weapon: 'FUZIL', fromPos: [atirador[0], yA + 1.5, atirador[2]] };
    // o estilhaço estoura colado no caminhão, do lado do atirador (a ~7,5 m da vítima)
    const impacto = [c.centro[0] - c.u[0] * 3.3, c.centro[1], c.centro[2] - c.u[1] * 3.3];
    const estilhaco = { targetId: pageId, dmg: 60, kind: 'GRANADA', impactPos: impacto };
    host.emit('shotHit', tiro);
    await sleep(300);
    host.emit('explosionHit', estilhaco);
    await sleep(400);
    const vida = await h.play(() => { window.QA.tick(2); return window.__MP.player.health; });
    assert.equal(vida, 100, `dano atravessou o caminhão inteiro (vida ${vida})`);
    // controle: o MESMO tiro e o MESMO estilhaço com o caminhão fora da conta (só no cliente)
    await h.play(id => { window.__game.Veiculos.porId(id).inteiro = false; }, c.id);
    await sleep(1100); // janelas de 1 s do servidor
    host.emit('shotHit', tiro);
    await sleep(300);
    const vidaTiro = await h.play(() => { window.QA.tick(2); return window.__MP.player.health; });
    host.emit('explosionHit', estilhaco);
    await sleep(400);
    const vidaEstilhaco = await h.play(() => { window.QA.tick(2); return window.__MP.player.health; });
    await h.play(id => { window.__game.Veiculos.porId(id).inteiro = true; }, c.id);
    assert.ok(vidaTiro < 100, `controle: sem o caminhão o tiro também não entrou (vida ${vidaTiro})`);
    assert.ok(vidaEstilhaco < vidaTiro, `controle: sem o caminhão o estilhaço também não entrou (${vidaEstilhaco})`);
  });

  it('o veículo da PRÓPRIA vítima não a cobre (quem atirou já resolveu esfera × lataria)', async () => {
    const c = await cenaDoCaminhao();
    // a página entra no caminhão; o host atira nela do lado de fora
    await paginaEm(c.centro[0] - c.u[0] * 3.5, c.centro[2] - c.u[1] * 3.5);
    const entrou = await h.play(() => { window.__game.tryToggleCar(); window.QA.tick(2); return window.__game.state.driving; });
    assert.ok(entrou, 'não entrou no caminhão');
    await h.play(() => { const P = window.__MP.player; P.health = 100; P.armor = 0; P.invulnUntil = 0; });
    await sleep(1100);
    host.emit('shotHit', { targetId: pageId, dmg: 25, weapon: 'FUZIL', fromPos: [c.host[0], c.host[1] + 1.5, c.host[2]] });
    await sleep(400);
    const vida = await h.play(() => { window.QA.tick(2); return window.__MP.player.health; });
    await h.play(() => { if (window.__game.state.driving) window.__game.tryToggleCar(); window.QA.tick(2); });
    assert.ok(vida < 100, `o próprio caminhão cobriu o motorista (vida ${vida})`);
  });

  it('ninguém se esconde DENTRO do helicóptero: o corpo é empurrado para fora das caixas que seguram bala', async () => {
    const r = await h.play(() => {
      const G = window.__game, MP = window.__MP, QA = window.QA, THREE = MP.THREE;
      const it = G.Veiculos.porId('heli');
      const pontos = [[0, 0], [1.2, 0.3], [-0.8, -0.5], [-2.5, 0.1]]; // cabine, fuselagem, cauda
      const inv = new THREE.Matrix4(), q = new THREE.Vector3();
      const dentro = [];
      for (const [lx, lz] of pontos) {
        QA.reset(0, 0);
        const g = it.grupo;
        g.updateMatrixWorld(true);
        q.set(lx, 0, lz).applyMatrix4(g.matrixWorld);
        MP.player.pos.set(q.x, g.position.y, q.z);
        QA.tick(3);
        inv.copy(g.matrixWorld).invert();
        const P = MP.player.pos, r = MP.player.radius;
        // âncora: o círculo do corpo (raio r) contra as caixas, no referencial do grupo
        for (const cx of G.Veiculos.TIPOS.heli.caixas) {
          q.set(P.x, g.position.y + (cx.min[1] + cx.max[1]) / 2, P.z).applyMatrix4(inv);
          const ex = Math.max(cx.min[0] - q.x, 0, q.x - cx.max[0]), ez = Math.max(cx.min[2] - q.z, 0, q.z - cx.max[2]);
          if (Math.hypot(ex, ez) < r - 0.02) dentro.push([lx, lz, +q.x.toFixed(2), +q.z.toFixed(2)]);
        }
      }
      return dentro;
    });
    assert.deepEqual(r, [], `corpo dentro da fuselagem depois do empurrão: ${JSON.stringify(r)}`);
  });

  it('não pra sempre: o motorista vê o motor morrer; ~1 s depois o veículo explode, some da cena e da física, e quem ficou dentro morre', async () => {
    const buggy = await h.play(() => { const i = window.__game.Veiculos.porId(0); return [i.pose.x, i.pose.y, i.pose.z]; });
    await paginaEm(buggy[0] + 2.5, buggy[2]);
    // entra no buggy (USAR) e espera o servidor ver o motorista
    const entrou = await h.play(() => { window.__game.tryToggleCar(); window.QA.tick(2); return window.__game.state.driving; });
    assert.ok(entrou, 'não entrou no buggy');
    await sleep(600);
    await hostEm([buggy[0] + 20, buggy[1], buggy[2]]);
    const mortes = collect(host, 'playerKilled');
    host.emit('vehicleBlast', { v: 0, dmg: 130, kind: 'BAZUCA', impactPos: [buggy[0] + 1, buggy[1], buggy[2]] });
    await sleep(300);
    const queimando = await h.play(() => {
      const G = window.__game, QA = window.QA;
      const it = G.Veiculos.porId(0), v = it.ref;
      const v0 = v.chassisBody.velocity.length();
      G.keys.KeyW = true; QA.tick(40); G.keys.KeyW = false;
      return { estado: it.estado, inteiro: it.inteiro, semMotor: !!v.semMotor, ganhou: v.chassisBody.velocity.length() - v0 };
    });
    assert.equal(queimando.estado, 'queimando');
    assert.equal(queimando.inteiro, false, 'em chamas e ainda protegendo');
    assert.ok(queimando.semMotor && queimando.ganhou < 1, `o motor em chamas ainda empurra (+${queimando.ganhou.toFixed(2)} m/s)`);
    await sleep(1400);
    const fim = await h.play(() => {
      const G = window.__game, QA = window.QA;
      QA.tick(5);
      const it = G.Veiculos.porId(0), v = it.ref;
      return { estado: it.estado, naCena: !!v.group.parent, naFisica: window.__MP.world.bodies.includes(v.chassisBody),
        dirigindo: G.state.driving, morto: window.__MP.player.dead };
    });
    assert.equal(fim.estado, 'destruido');
    assert.equal(fim.naCena, false, 'o veículo explodido continua desenhado');
    assert.equal(fim.naFisica, false, 'o veículo explodido continua na física');
    assert.equal(fim.dirigindo, false);
    assert.ok(mortes.some(m => m.victimId === pageId && m.killerId === hostId), `o motorista não morreu na explosão: ${JSON.stringify(mortes)}`);
  });
});
