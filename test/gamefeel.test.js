/* ================================================================
   QA — GAME FEEL DE COMBATE no navegador (partida BR de verdade).

   Trava as lacunas de sensação que estavam abertas:
   1. o hitmarker MENTIA (predição local sem as regras do servidor);
   2. matar não acendia hitmarker no PvP;
   3. levar dano não dizia QUANTO;
   4. escudo quebrando não avisava.

   Porta reservada: 3750.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness');

const PORT = 3750;
const FAR = 130;   // > 120 m: fora do alcance da ESCOPETA no servidor
const wait = ms => new Promise(r => setTimeout(r, ms));

describe('game feel — combate', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, host, myId, spot = null;
  let hostPos = null; // onde o servidor acha que o bot está

  before(async () => {
    h = await bootGame({ port: PORT, extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '300' } });
    host = await startBRMatch(h, { serverPort: PORT });
    myId = await h.play(() => window.__MP_init.id);
    await h.play(() => {
      // espiã de saída: o que o cliente REALMENTE põe no fio
      const s = window.__MP.socket;
      window.__QA_emits = [];
      if (!s.__qaWrapped) {
        const orig = s.emit.bind(s);
        s.emit = function (...a) { window.__QA_emits.push(a[0]); return orig(...a); };
        s.__qaWrapped = true;
      }
    });
    // linha de tiro LIMPA a FAR metros: sem ela o disparo bate no morro e o
    // teste mediria pontaria em vez de feedback
    spot = await h.play(d => {
      const MP = window.QA.MP, THREE = MP.THREE;
      const P = MP.player.pos, LIM = MP.CFG.WORLD_SIZE / 2 - 20;
      const eye = new THREE.Vector3(P.x, P.y + 1.5, P.z), dir = new THREE.Vector3();
      for (let i = 0; i < 24; i++) {
        const a = i * Math.PI / 12;
        const tx = P.x + Math.cos(a) * d, tz = P.z + Math.sin(a) * d;
        if (Math.abs(tx) > LIM || Math.abs(tz) > LIM) continue;
        const gy = MP.heightAt(tx, tz);
        dir.set(tx - eye.x, gy + 1.1 - eye.y, tz - eye.z);
        const len = dir.length();
        dir.multiplyScalar(1 / len);
        if (MP.rayBlockedAt(eye, dir, len) >= len - 0.1) return { x: tx, y: gy, z: tz };
      }
      return null;
    }, FAR);
    if (spot) {
      // PRIMEIRO `state` do bot: o servidor ancora onde for (sem histórico de
      // posição não há checagem de velocidade)
      hostPos = [spot.x, spot.y, spot.z];
      host.emit('state', { pos: hostPos, rotY: 0, heldWeapon: 'FUZIL', ship: false, fall: false });
      await wait(500);
    }
  });
  after(async () => { if (host) host.close(); if (h) await h.close(); });

  /* Leva o bot CAMINHANDO até `d` metros de mim: o anti-cheat de movimento
     (90 m/s) descarta teleporte, e `state` recusado nunca vira playerUpdate. */
  async function walkHostTo(d) {
    const me = await h.play(() => {
      const P = window.QA.MP.player.pos;
      return [P.x, P.y, P.z];
    });
    const dx = hostPos[0] - me[0], dz = hostPos[2] - me[2];
    const len = Math.hypot(dx, dz) || 1;
    const tx = me[0] + dx / len * d, tz = me[2] + dz / len * d;
    for (let guard = 0; guard < 120; guard++) {
      const rx = tx - hostPos[0], rz = tz - hostPos[2];
      const rest = Math.hypot(rx, rz);
      if (rest < 0.05) break;
      const step = Math.min(rest, 4.2); // < 90 m/s com dt de 60 ms
      hostPos = [hostPos[0] + rx / rest * step, me[1], hostPos[2] + rz / rest * step];
      host.emit('state', { pos: hostPos, rotY: 0, heldWeapon: 'FUZIL', ship: false, fall: false });
      await wait(60);
    }
    await wait(400); // playerUpdate chega + meu `state` sai (o portão usa a posição de rede)
  }

  /* dispara um acerto predito no bot e devolve o que apareceu na tela/no fio */
  async function hitHost(weaponIdx, dmg) {
    return h.play(async (idx, amount) => {
      const { G, MP } = window.QA;
      G.arsenal[idx].locked = false;
      G.switchWeapon(idx);
      const rp = [...window.__BR_debug.remotes.values()][0];
      if (!rp) return { error: 'sem avatar remoto' };
      window.__QA_emits.length = 0;
      const marker = document.getElementById('hitmarker');
      marker.className = '';
      rp.damage(amount, null, { head: false });
      await new Promise(r => setTimeout(r, 40));
      return {
        emits: window.__QA_emits.slice(),
        marker: marker.className,
        hitT: rp.hitT,
        verdict: window.__BR_debug.hitGate && window.__BR_debug.hitGate.last,
        dist: Math.hypot(rp.targetPos.x - MP.player.pos.x, rp.targetPos.z - MP.player.pos.z),
      };
    }, weaponIdx, dmg);
  }

  it('1 — ATIRANDO DE VERDADE: escopeta fora de alcance não pinta hitmarker', async function (t) {
    if (!spot) { t.skip('nenhuma linha de tiro limpa nesta seed'); return; }
    const r = await h.play(async () => {
      const G = window.QA.G, QA = window.QA;
      const rp = [...window.__BR_debug.remotes.values()][0];
      if (!rp) return { error: 'sem avatar remoto' };
      G.arsenal[1].locked = false;
      G.switchWeapon(1);                       // ESCOPETA "TROVÃO"
      const gun = G.arsenal[1];
      const spread0 = gun.spreadHip;
      gun.spreadHip = 0;                       // chumbo no eixo: mede feedback, não pontaria
      gun.mag = gun.magSize; gun.reloading = false;
      QA.tick(20);                             // switchAnim sobe 3.4/s: precisa passar de 0.8
      QA.aimAt(rp.group.position.x, rp.group.position.y + 1.1, rp.group.position.z);
      window.__QA_emits.length = 0;
      const marker = document.getElementById('hitmarker');
      marker.className = '';
      const mag0 = gun.mag;
      G.mouse.clicked = true;
      QA.tick(1);
      await new Promise(r2 => setTimeout(r2, 40));
      gun.spreadHip = spread0;
      return {
        emits: window.__QA_emits.slice(), marker: marker.className,
        fired: mag0 - gun.mag,
        verdict: window.__BR_debug.hitGate && window.__BR_debug.hitGate.last,
      };
    });
    assert.ok(!r.error, r.error);
    assert.equal(r.fired, 1, 'a arma nem chegou a disparar');
    assert.ok(!r.marker.includes('show'),
      'o disparo real ainda acende hitmarker num acerto que o servidor descarta');
    assert.ok(!r.emits.includes('shotHit'), 'acerto recusado ainda vai pro fio');
    assert.ok(r.verdict && r.verdict.reason === 'range',
      `o tiro tinha de chegar ao portão e ser recusado por alcance: ${JSON.stringify(r.verdict)}`);
  });

  it('1 — o mesmo vale pra qualquer origem de dano remoto (bala, faca, splash)', async function (t) {
    if (!spot) { t.skip('nenhuma linha de tiro limpa nesta seed'); return; }
    const r = await hitHost(1, 22);
    assert.ok(!r.error, r.error);
    assert.ok(r.dist > 120, `bot precisa estar fora de alcance (dist=${r.dist})`);
    assert.ok(!r.marker.includes('show'), 'hitmarker num acerto descartado em silêncio');
    assert.ok(!r.emits.includes('shotHit'), 'cliente ainda gasta mensagem que o servidor recusa');
    assert.equal(r.hitT, 0, 'o avatar remoto piscou de dano sem ter tomado dano');
  });

  it('1 — escopeta DENTRO de 120 m acende o hitmarker e reporta o acerto', async function (t) {
    if (!spot) { t.skip('nenhuma linha de tiro limpa nesta seed'); return; }
    await walkHostTo(30);
    const r = await hitHost(1, 22);
    assert.ok(!r.error, r.error);
    assert.ok(r.marker.includes('show'),
      `acerto legítimo ficou sem hitmarker — veredito=${JSON.stringify(r.verdict)}`);
    assert.ok(r.emits.includes('shotHit'), 'acerto legítimo não foi reportado');
    assert.ok(r.hitT > 0, 'avatar remoto não piscou no acerto real');
  });

  it('1 — alvo já morto não gera hitmarker (a morte chega antes pela rede)', async function (t) {
    if (!spot) { t.skip('nenhuma linha de tiro limpa nesta seed'); return; }
    const r = await h.play(async () => {
      const G = window.QA.G;
      G.arsenal[0].locked = false; G.switchWeapon(0);
      const rp = [...window.__BR_debug.remotes.values()][0];
      const was = rp.alive;
      rp.alive = false;
      window.__QA_emits.length = 0;
      const marker = document.getElementById('hitmarker');
      marker.className = '';
      rp.damage(30, null, { head: true });
      await new Promise(r2 => setTimeout(r2, 40));
      const out = { emits: window.__QA_emits.slice(), marker: marker.className };
      rp.alive = was;
      return out;
    });
    assert.ok(!r.marker.includes('show'), 'hitmarker em cadáver');
    assert.ok(!r.emits.includes('shotHit'), 'shotHit em cadáver');
  });

  it('1 — o GOLEM não é jogador: acerto nele continua com feedback IMEDIATO', async function (t) {
    // o boss vive na MESMA lista de "remotos" que os jogadores, mas o dano
    // dele vai por `bossHit` — outro handler, sem alcance nem imunidade.
    // Passar o boss pelo portão de predição apagaria hitmarker, número e som.
    const r = await h.play(async () => {
      const B = window.__BR_debug.boss;
      if (!B) return { skip: true };
      const { G, MP, QA } = { ...window.QA, QA: window.QA };
      const P = MP.player.pos;
      B.alive = true;
      B.group.position.set(P.x + 12, MP.heightAt(P.x + 12, P.z), P.z);
      G.arsenal[1].locked = false;
      G.switchWeapon(1);
      const gun = G.arsenal[1];
      const spread0 = gun.spreadHip;
      gun.spreadHip = 0;
      gun.mag = gun.magSize; gun.reloading = false;
      QA.tick(20);
      QA.aimAt(B.group.position.x, B.group.position.y + 3.1, B.group.position.z);
      window.__QA_emits.length = 0;
      const marker = document.getElementById('hitmarker');
      marker.className = '';
      G.mouse.clicked = true;
      QA.tick(1);
      await new Promise(r2 => setTimeout(r2, 40));
      gun.spreadHip = spread0;
      B.group.position.set(P.x + 900, 0, P.z + 900); // fora do caminho dos outros testes
      return { emits: window.__QA_emits.slice(), marker: marker.className };
    });
    if (r.skip) { t.skip('GOLEM não existe nesta sala'); return; }
    assert.ok(r.marker.includes('show'), 'acertar o GOLEM ficou sem hitmarker');
    assert.ok(r.emits.includes('bossHit'), 'o dano no GOLEM não foi reportado');
  });

  it('3 — levar dano mostra QUANTO foi (número na tela, não só o flash)', async () => {
    const r = await h.play(() => {
      const MP = window.QA.MP;
      window.QA.reset(30, 30);
      MP.player.health = 100; MP.player.armor = 0; MP.player.invulnUntil = 0;
      MP.playerDamage(37, null, { type: 'test' });
      const el = document.getElementById('hfTook');
      return { html: el.innerHTML, cls: el.className, health: MP.player.health };
    });
    assert.equal(r.health, 63);
    assert.ok(r.cls.includes('show'), 'contador de dano recebido não apareceu');
    assert.ok(r.html.includes('-37'), `número errado: ${r.html}`);
    assert.ok(!r.cls.includes('danger'), '37 de 100 não é ameaça de morte');
  });

  it('3 — golpes seguidos somam no MESMO número (rajada não vira poluição)', async () => {
    await wait(800); // fecha a janela de rajada do teste anterior
    const r = await h.play(() => {
      const MP = window.QA.MP;
      window.QA.reset(30, 30);
      MP.player.health = 100; MP.player.armor = 0; MP.player.invulnUntil = 0;
      MP.playerDamage(10, null, { type: 'test' });
      MP.playerDamage(10, null, { type: 'test' });
      MP.playerDamage(10, null, { type: 'test' });
      return document.getElementById('hfTook').innerHTML;
    });
    assert.ok(r.includes('-30'), `rajada não somou: ${r}`);
  });

  it('7 — "o próximo tiro igual me mata" vira aviso explícito', async () => {
    const r = await h.play(() => {
      const MP = window.QA.MP;
      window.QA.reset(30, 30);
      MP.player.health = 50; MP.player.armor = 0; MP.player.invulnUntil = 0;
      MP.playerDamage(30, null, { type: 'test' }); // sobram 20 < 30
      return { cls: document.getElementById('hfTook').className, health: MP.player.health };
    });
    assert.equal(r.health, 20);
    assert.ok(r.cls.includes('danger'), 'jogador a um tiro da morte não foi avisado');
  });

  it('4 — escudo quebrando avisa (barra estilhaça) e só no frame da quebra', async () => {
    const r = await h.play(async () => {
      const MP = window.QA.MP;
      const bar = document.getElementById('armorFill');
      window.QA.reset(30, 30);
      MP.player.health = 100; MP.player.invulnUntil = 0;
      MP.player.armor = 50;
      bar.className = '';
      MP.playerDamage(20, null, { type: 'test' });   // absorve 14, escudo vai a 36
      const midCls = bar.className, midArmor = MP.player.armor;
      MP.player.armor = 5;
      MP.playerDamage(40, null, { type: 'test' });   // consome os 5 que sobravam
      await new Promise(r2 => setTimeout(r2, 20));
      return { midCls, midArmor, breakCls: bar.className, armor: MP.player.armor };
    });
    assert.equal(r.midArmor, 36, 'absorção de 70% mudou');
    assert.ok(!r.midCls.includes('hfBreak'), 'escudo que só arranhou não pode anunciar quebra');
    assert.equal(r.armor, 0);
    assert.ok(r.breakCls.includes('hfBreak'), 'escudo acabou e o jogador não ficou sabendo');
  });

  it('5 — explodeFx é SÓ o espetáculo: clarão, estrondo e tranco, zero dano', async () => {
    const r = await h.play(() => {
      const { G, MP } = window.QA;
      window.QA.reset(30, 30);
      MP.player.health = 100; MP.player.invulnUntil = 0; MP.player.armor = 0;
      const P = MP.player.pos;
      const at = new MP.THREE.Vector3(P.x + 2, P.y + 0.5, P.z);
      G.Grenades.explodeFx(at);
      const light = G.Grenades.boomLight;
      return {
        health: MP.player.health,
        lit: light.position.distanceTo(at) < 1.2,
        after: G.Grenades.boomT > 0,
      };
    });
    assert.equal(r.health, 100, 'efeito visual de explosão remota não pode ferir ninguém');
    assert.ok(r.lit, 'o clarão não foi parar no ponto do impacto');
    assert.ok(r.after, 'a luz de explosão não acendeu');
  });

  it('5 — bazuca do OUTRO jogador vira clarão e estrondo (antes: invisível e muda)', async function (t) {
    if (!spot) { t.skip('nenhuma linha de tiro limpa nesta seed'); return; }
    const impact = await h.play(() => {
      const { G, MP } = window.QA;
      G.Grenades.boomT = 0;
      const P = MP.player.pos;
      return [P.x + 18, MP.heightAt(P.x + 18, P.z) + 1, P.z];
    });
    host.emit('shotFired', {
      weapon: 'BAZUCA',
      fromPos: [hostPos[0], hostPos[1] + 1.5, hostPos[2]],
      toPos: impact,
    });
    // o foguete voa a 34 m/s: o estrondo chega DEPOIS, não junto do disparo —
    // e o clarão dura só 0,35 s, então espera-se pelo evento, não pelo relógio
    const t0 = Date.now();
    await h.page.waitForFunction('window.__game.Grenades.boomT > 0', { timeout: 6000 })
      .catch(() => { throw new Error('a bazuca do outro jogador continua sem clarão nenhum'); });
    const flight = Date.now() - t0;
    const dist = await h.play(imp => {
      const l = window.QA.G.Grenades.boomLight;
      return Math.hypot(l.position.x - imp[0], l.position.z - imp[2]);
    }, impact);
    assert.ok(dist < 2.5, `o clarão não caiu no impacto (${dist.toFixed(1)} m de erro)`);
    assert.ok(flight > 200, `estrondo instantâneo (${flight} ms): foguete tem tempo de voo`);
  });

  it('5 — meu lançamento de bazuca é replicado pros outros (evento que já existia)', async () => {
    const seen = [];
    host.on('playerFired', d => { if (d.weapon === 'BAZUCA') seen.push(d); });
    const emits = await h.play(async () => {
      const { G, QA } = { ...window.QA, QA: window.QA };
      G.arsenal[3].locked = false;
      G.switchWeapon(3);                       // BAZUCA "TROVOADA"
      const gun = G.arsenal[3];
      gun.mag = gun.magSize; gun.reloading = false;
      QA.tick(20);
      QA.aimAt(window.QA.MP.player.pos.x + 60, window.QA.MP.player.pos.y + 1.6, window.QA.MP.player.pos.z);
      window.__QA_emits.length = 0;
      G.mouse.clicked = true;
      QA.tick(1);
      await new Promise(r => setTimeout(r, 40));
      return window.__QA_emits.slice();
    });
    await wait(500);
    host.off('playerFired');
    assert.ok(emits.includes('shotFired'), 'o lançamento não foi pro fio');
    assert.equal(seen.length, 1, 'os outros jogadores não souberam do foguete');
  });

  it('2 — kill confirmada pelo servidor acende o hitmarker de KILL no PvP', async function (t) {
    if (!spot) { t.skip('nenhuma linha de tiro limpa nesta seed'); return; }
    await walkHostTo(25);
    await hitHost(0, 60); // acerto validado: sem ele o servidor não credita a kill (hitBy)
    await wait(300);
    // o hitmarker de kill dura 260 ms — grava o sabor no instante em que sai,
    // em vez de correr atrás da classe no DOM
    await h.play(() => {
      window.__QA_markers = [];
      const orig = window.__MP.showHitmarker;
      window.__MP.showHitmarker = f => { window.__QA_markers.push(f); return orig(f); };
      document.getElementById('hitmarker').className = '';
      // matar o último vivo termina a partida: instrumenta a encenação da
      // vitória antes do golpe (lacuna 7)
      window.__QA_timeScale = [];
      const ots = window.__MP.setTimeScale;
      window.__MP.setTimeScale = v => { window.__QA_timeScale.push(v); return ots(v); };
      window.__QA_victory = 0;
      const ov = window.__MP.SFX.victory;
      window.__MP.SFX.victory = () => { window.__QA_victory++; return ov(); };
    });
    host.emit('died', { killerId: myId, cause: { type: 'player' }, weapon: 'FUZIL' });
    await wait(700);
    const r = await h.play(() => ({
      markers: window.__QA_markers, cls: document.getElementById('hitmarker').className,
    }));
    assert.ok(r.markers.includes('kill'),
      `matar no PvP continua sem hitmarker de kill (sabores=${JSON.stringify(r.markers)})`);
    assert.ok(r.cls.includes('kill'), `classe vermelha não foi aplicada: "${r.cls}"`);
  });

  it('7 — a VITÓRIA é encenada: câmera lenta + fanfarra antes da tabela', async () => {
    // a kill anterior era do último adversário vivo: a partida acabou nela
    await h.page.waitForFunction('window.__BR_debug.S.phase === "ENDED"', { timeout: 8000 });
    const mid = await h.play(() => ({
      scales: window.__QA_timeScale.slice(), victory: window.__QA_victory,
    }));
    assert.equal(mid.victory, 1, 'ganhar continua sem fanfarra (SFX.victory nunca era tocado)');
    assert.ok(mid.scales.some(v => v < 1), `não houve câmera lenta na vitória: ${JSON.stringify(mid.scales)}`);
    // e o jogo tem de VOLTAR ao normal quando a tabela aparece
    await h.page.waitForFunction('window.__QA_timeScale.slice(-1)[0] === 1', { timeout: 5000 });
    const shown = await h.play(() => document.body.innerHTML.includes('RANKING DA PARTIDA'));
    assert.ok(shown, 'a tabela de resultado não chegou depois da encenação');
  });
});
