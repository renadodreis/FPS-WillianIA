/* ================================================================
   QA — A2/A8 NA TELA: a assistência de mira e o tiro automático nunca
   agem em quem a TELA não mostra (docs/mobile/criterio-aaa.md, A2 e A8-b).

   ÂNCORA INDEPENDENTE do teste de visibilidade do produto — a do validador
   (docs/mobile/validacao-7515734.md, A2): o MESMO quadro desenhado duas
   vezes, com o alvo e sem ele, tempo parado, e os pixels que mudam dentro
   da caixa projetada do alvo. 0 px = a tela não mostra nada dele. O que o
   produto decide (o núcleo real da assistência com a linha de visada real
   do jogo — `rayBlockedAt` + js/oclusao.js) é comparado com isso.

   Por que existe: o teste antigo de "alvo escondido" escondia o boneco atrás
   de um bloco de `Structures.walls` — exatamente o que o `rayBlockedAt` do
   produto conhece, e um bloco que a tela nem desenha. Não podia falhar. Com
   ele verde, 20 de 30 posições atrás do caminhão militar tinham 0 px e a
   assistência agindo (e o automático dispararia).

   Oclusores REAIS do jogo: os dois caminhões militares parados (8 direções,
   em pé e agachado), a copa das árvores vista do alto, e a varredura
   aleatória do validador (mesma LCG, mesma seed) — que achou o painel do
   campo de tiro, galhos retorcidos e o castelo. Alvo: o avatar REMOTO de um
   jogador de verdade na partida (o BotHost do harness), o boneco que a tela
   de quem joga desenha.

   Controle positivo em todos: o mesmo cenário com o alvo VISÍVEL recebe
   assistência — senão "nunca assiste" passaria por uma assistência morta.

   Porta 4020.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness.js');

const PORT = 4020;
const V3 = { width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

function instalar() {
  const G = window.QA.G, MP = window.QA.MP, THREE = MP.THREE, cam = MP.camera;
  const renderer = MP.renderer, scene = MP.scene, gl = renderer.getContext();
  for (const e of G.Enemies.list) { e.alive = false; if (e.group) e.group.visible = false; }
  const r0 = window.QA.reset;
  window.QA.reset = function (...a) { r0.apply(this, a); MP.player.invulnUntil = 1e12; };
  const alvo = () => (window.__MP_remotePlayers || []).find(r => r.nick === 'BotHost');
  const cw = renderer.domElement.width, ch = renderer.domElement.height;
  const buf1 = new Uint8Array(cw * ch * 4), buf2 = new Uint8Array(cw * ch * 4);
  const eye = () => { cam.updateMatrixWorld(true); return new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld); };
  const V = window.VIS = {
    alvo,
    /* ÂNCORA: pixels que mudam na caixa projetada das esferas (×1,3) entre
       dois renders do mesmo quadro, com e sem o alvo. O nome flutuante (sprite)
       fica fora: ele não é o corpo. */
    px(t) {
      const sprites = [];
      t.group.traverse(o => { if (o.isSprite) { sprites.push(o); o.visible = false; } });
      cam.updateMatrixWorld(true);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const s of t.hitSpheres()) for (const [ox, oy, oz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const v = new THREE.Vector3(s.c.x + ox * s.r * 1.3, s.c.y + oy * s.r * 1.3, s.c.z + oz * s.r * 1.3).project(cam);
        if (v.z > 1) continue;
        const px = (v.x + 1) / 2 * cw, py = (v.y + 1) / 2 * ch;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(cw - 1, Math.ceil(x1)); y1 = Math.min(ch - 1, Math.ceil(y1));
      let n = 0, caixa = 0;
      if (x1 >= x0 && y1 >= y0) {
        const w = x1 - x0 + 1, hh = y1 - y0 + 1;
        caixa = w * hh;
        t.group.visible = true; renderer.render(scene, cam); gl.readPixels(x0, y0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, buf1);
        t.group.visible = false; renderer.render(scene, cam); gl.readPixels(x0, y0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, buf2);
        t.group.visible = true;
        for (let i = 0; i < w * hh * 4; i += 4)
          if (Math.abs(buf1[i] - buf2[i]) + Math.abs(buf1[i + 1] - buf2[i + 1]) + Math.abs(buf1[i + 2] - buf2[i + 2]) > 6) n++;
      }
      for (const s of sprites) s.visible = true;
      return { px: n, caixa };
    },
    /* O PRODUTO: o núcleo real com a linha de visada real, cruz no centro do
       alvo, dedo mexendo, assistência E automático ligados, fuzil. O quadro
       seguinte do jogo começaria pelo `atualizar` da oclusão — ele vem antes. */
    veredito(t) {
      const e = new THREE.Euler(0, 0, 0, 'YXZ').setFromQuaternion(cam.quaternion);
      G.Oclusao.atualizar();
      G.AimAssist.reset();
      const q = { dt: 1 / 60, eye: cam.position.clone(), yaw: e.y, pitch: e.x, fov: cam.fov, aspect: cam.aspect,
        inYaw: 0.001, inPitch: 0, strafe: 0, ads: 0, weapon: 'rifle', assist: true, autoFire: true, canFire: true,
        maxRange: scene.fog ? scene.fog.near + (scene.fog.far - scene.fog.near) * 0.5 : 0,
        lists: [window.__MP_remotePlayers] };
      G.AimAssist.step(q); G.AimAssist.step(q);
      const last = G.AimAssist.last;
      return { age: last.target === t, fire: !!last.fire };
    },
    /* um caso: atirador em (x, z) com o olho `dy` acima do normal, alvo em
       (x, z), cruz no centro do tronco dele */
    caso(tag, sx, sz, sdy, tx, tz) {
      const t = alvo();
      window.QA.reset(sx, sz); window.QA.tick(12);
      if (sdy) cam.position.y += sdy;
      t.group.position.set(tx, G.heightAt(tx, tz), tz); t.alive = true; t.group.visible = true; t.group.updateMatrixWorld(true);
      const o = eye();
      const c = new THREE.Vector3(tx, t.group.position.y + 1.1, tz).sub(o);
      cam.quaternion.setFromEuler(new THREE.Euler(Math.atan2(c.y, Math.hypot(c.x, c.z)), Math.atan2(-c.x, -c.z), 0, 'YXZ'));
      cam.updateMatrixWorld(true);
      const p = V.px(t);
      const v = V.veredito(t);
      /* a MESMA decisão só com a linha de visada antiga (`rayBlockedAt`): é a
         régua do controle — o que a oclusão tirou de quem a tela mostra */
      const O = G.Oclusao, tampa = O.tampa;
      O.tampa = () => false;
      let base;
      try { base = V.veredito(t); } finally { O.tampa = tampa; }
      let quem = null;
      if (p.px > 0 && !v.age && base.age) {
        for (const s of t.hitSpheres()) if (tampa(cam.position, s.c, s.r, t.group)) { quem = O.quemTampou(); break; }
      }
      return { tag, dist: +c.length().toFixed(1), px: p.px, caixa: p.caixa, age: v.age, fire: v.fire, ageBase: base.age,
        quem, atirador: [+sx.toFixed(2), +sz.toFixed(2), sdy], alvo: [+tx.toFixed(2), +tz.toFixed(2)] };
    },
  };
}

const vaza = c => c.px === 0 && (c.age || c.fire);
// o mesmo caso com a linha de visada ANTIGA (só `rayBlockedAt`): a régua de antes, no mesmo quadro
const vaza_antes = c => c.px === 0 && c.ageBase;
const resumo = cs => cs.map(c => `${c.tag} ${c.dist} m px=${c.px}/${c.caixa} assist=${c.age} (antes ${c.ageBase}) auto=${c.fire} ` +
  `atirador=${c.atirador} alvo=${c.alvo}${c.quem ? ' tampou: ' + JSON.stringify(c.quem) : ''}`).join('\n');

describe('A2/A8 na tela — assistência e automático só em quem a tela mostra', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, host;
  before(async () => {
    h = await bootGame({ port: PORT, query: '?mobile=1', viewport: V3,
      extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '900', GAS_DEFAULT: 'off' } });
    host = await startBRMatch(h, { serverPort: PORT, flags: { golem: false } });
    await h.play(async () => {
      const G = window.QA.G;
      await G.WeaponModels.ready;
      if (G.Car && G.Car.ready) await G.Car.ready;
      for (let i = 0; i < 100 && !(window.__MP_remotePlayers || []).some(r => r.nick === 'BotHost'); i++) await new Promise(r => setTimeout(r, 100));
      // árvores GLB e props chegam depois do boot: dá tempo a eles
      await new Promise(r => setTimeout(r, 3000));
    });
    await h.play(instalar);
    /* A OCLUSÃO ASSENTADA: os GLB (caminhão, árvores, props) chegam depois do
       boot e a grade de cada malha nova se monta aos poucos (orçamento por
       quadro). Espera o registro parar de mudar por 3 s (uma varredura da
       cena, pelo menos) com nada pendente — senão o cenário muda no meio da
       medição e o número muda de rodada para rodada. */
    const oc = await h.play(async () => {
      const G = window.QA.G, O = G.Oclusao;
      if (G.Car && G.Car.ready) await G.Car.ready;
      let estavel = 0, ultimo = -1;
      const t0 = performance.now();
      while (performance.now() - t0 < 90000) {
        for (let i = 0; i < 10; i++) window.QA.tick(1);
        await new Promise(r => setTimeout(r, 100));
        const n = O.estado().malhas;
        if (O.pendentes === 0 && n === ultimo) { if (++estavel >= 30) break; } else estavel = 0;
        ultimo = n;
      }
      return { pendentes: O.pendentes, estavel, estado: O.estado() };
    });
    assert.equal(oc.pendentes, 0, 'a oclusão da assistência não terminou de montar');
    assert.ok(oc.estavel >= 30, 'o registro da oclusão não assentou em 90 s');
    const m = oc.estado;
    console.log(`  [montagem] ${m.malhas} malhas, ${m.instancias} instâncias, ${m.celulas} células, ${m.refs} referências a ` +
      `triângulo, ${m.kb} KB, rasterização ${m.rasterMs.toFixed(0)} ms no total (orçamento por quadro)`);
  });
  after(async () => { if (host) host.close(); if (h) await h.close(); });

  it('dado o alvo atrás do CAMINHÃO MILITAR parado (8 direções, em pé e agachado), então 0 px ⇒ sem assistência e sem tiro', async () => {
    const r = await h.play(() => {
      const V = window.VIS, G = window.QA.G;
      const casos = [], controles = [];
      for (const v of G.Car.vehicles) {
        if (!/CAMINH/.test(v.cfg.name)) continue;
        const c = v.group.position;
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a);
          for (const dy of [0, -0.6]) {
            const cs = V.caso(dy ? 'caminhao-agachado' : 'caminhao', c.x - ca * 15, c.z - sa * 15, dy, c.x + ca * 2.2, c.z + sa * 2.2);
            casos.push(cs);
            if (cs.px !== 0) continue;
            /* CONTROLE: o mesmo alvo saindo de trás do caminhão, de lado em
               relação à linha de visada, até a tela mostrá-lo */
            for (const lado of [1, -1]) {
              let achou = null;
              for (let d = 3; d <= 12 && !achou; d += 1) {
                const tx = c.x + ca * 2.2 - sa * lado * d, tz = c.z + sa * 2.2 + ca * lado * d;
                const k2 = V.caso('controle', c.x - ca * 15, c.z - sa * 15, dy, tx, tz);
                if (k2.px > 150) achou = k2;
              }
              if (achou) { controles.push(achou); break; }
            }
          }
        }
      }
      return { casos, controles };
    });
    const zero = r.casos.filter(c => c.px === 0);
    const vaz = r.casos.filter(vaza);
    /* CONTROLE: o alvo visível ao lado, que a linha de visada ANTIGA
       assistia, continua assistido — a oclusão não pode virar "nunca assiste" */
    const base = r.controles.filter(c => c.ageBase), perdidos = base.filter(c => !c.age);
    console.log(`  [caminhão] ${r.casos.length} casos, ${zero.length} com 0 px: ${vaz.length} com assistência/tiro agora, ` +
      `${r.casos.filter(vaza_antes).length} com a linha de visada antiga · ` +
      `controle: ${r.controles.length} alvos visíveis ao lado, ${base.length} assistidos antes, ${base.length - perdidos.length} agora`);
    if (perdidos.length) console.log('  [caminhão] perdidos:\n' + resumo(perdidos));
    assert.ok(zero.length >= 10, `cenário inválido: só ${zero.length} casos com o alvo escondido pelo caminhão`);
    assert.deepEqual(vaz, [], `a assistência/automático agiu em quem a tela não mostra:\n${resumo(vaz)}`);
    assert.ok(base.length >= 8, `cenário: só ${base.length} controles visíveis e assistidos antes`);
    assert.ok(perdidos.length <= base.length * 0.1,
      `a oclusão tirou a assistência de ${perdidos.length} de ${base.length} alvos VISÍVEIS ao lado do caminhão:\n${resumo(perdidos)}`);
  });

  it('dada a varredura do validador (atirador no chão e no alto da copa, LCG 12345), então 0 px ⇒ sem assistência e sem tiro', async () => {
    const r = await h.play(() => {
      const V = window.VIS, G = window.QA.G;
      let seed = 12345;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const casos = [];
      for (let i = 0; i < 160; i++) {
        const px = (rnd() * 2 - 1) * 480, pz = (rnd() * 2 - 1) * 480;
        if (G.heightAt(px, pz) < 0.5) continue;
        const a = rnd() * Math.PI * 2, d = 8 + rnd() * 70;
        casos.push(V.caso('aleatorio', px, pz, 0, px + Math.cos(a) * d, pz + Math.sin(a) * d));
      }
      // copa vista do alto: a LCG continua (a mesma sequência do laudo)
      let arvores = 0;
      for (let i = 0; i < 2000 && arvores < 25; i++) {
        const x = (rnd() * 2 - 1) * 480, z = (rnd() * 2 - 1) * 480;
        const obs = (G.obstaclesNear(x, z) || []).filter(o => o.r > 0.2 && o.r < 1.5);
        if (!obs.length) continue;
        const o = obs[0]; arvores++;
        const a = rnd() * Math.PI * 2;
        casos.push(V.caso('copa', o.x - Math.cos(a) * 14, o.z - Math.sin(a) * 14, 7, o.x + Math.cos(a) * 1.4, o.z + Math.sin(a) * 1.4));
      }
      return casos;
    });
    const zero = r.filter(c => c.px === 0), vaz = r.filter(vaza);
    // CONTROLE: visível (> 200 px) e assistido pela linha de visada antiga → continua
    const base = r.filter(c => c.px > 200 && c.ageBase), perdidos = base.filter(c => !c.age);
    const antigos = r.filter(vaza_antes);
    console.log(`  [varredura] ${r.length} casos, ${zero.length} com 0 px: ${vaz.length} vazamentos agora, ` +
      `${antigos.length} com a linha de visada antiga · controle: ${base.length} visíveis assistidos antes, ${base.length - perdidos.length} agora`);
    if (perdidos.length) console.log('  [varredura] perdidos:\n' + resumo(perdidos));
    if (antigos.length) console.log('  [varredura] o que a linha de visada antiga deixava vazar:\n' + resumo(antigos));
    assert.ok(zero.length >= 20, `cenário inválido: só ${zero.length} casos escondidos`);
    assert.deepEqual(vaz, [], `a assistência/automático agiu em quem a tela não mostra:\n${resumo(vaz)}`);
    assert.ok(base.length >= 20, `cenário: só ${base.length} alvos visíveis assistidos antes`);
    assert.ok(perdidos.length <= base.length * 0.1,
      `a oclusão tirou a assistência de ${perdidos.length} de ${base.length} alvos VISÍVEIS:\n${resumo(perdidos)}`);
  });

  it('dado o custo por quadro, então a oclusão cabe no celular (raios com teto, microssegundos por raio, memória)', async () => {
    const r = await h.play(() => {
      const G = window.QA.G, MP = window.QA.MP, O = G.Oclusao;
      const antes = O.estado();
      // um quadro de pior caso: 3 candidatos × 3 esferas = 9 raios, a 5–70 m
      window.QA.reset(30, 30); window.QA.tick(4);
      const cam = MP.camera.position, P = { x: 0, y: 0, z: 0 };
      let t = performance.now();
      for (let i = 0; i < 2700; i++) {
        const a = i * 2.399, d = 5 + (i % 66);
        P.x = cam.x + Math.cos(a) * d; P.z = cam.z + Math.sin(a) * d; P.y = G.heightAt(P.x, P.z) + 1.66;
        O.tampa(cam, P, 0.28);
      }
      const msQuadro = (performance.now() - t) / 300;
      t = performance.now();
      for (let i = 0; i < 300; i++) O.atualizar();
      const atualizarMs = (performance.now() - t) / 300;
      return { msQuadro, atualizarMs, kb: antes.kb };
    });
    console.log(`  [custo] 9 raios/quadro: ${r.msQuadro.toFixed(3)} ms · atualizar parado: ${r.atualizarMs.toFixed(3)} ms · ` +
      `memória das grades: ${r.kb} KB (desktop; celular ~4–5× o tempo)`);
    assert.ok(r.msQuadro < 1, `${r.msQuadro} ms por quadro de 9 raios`);
    assert.ok(r.atualizarMs < 0.5, `${r.atualizarMs} ms por atualizar parado`);
    assert.ok(r.kb < 8192, `${r.kb} KB de grade`);
  });

  it('dado o caminho, então nenhum erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
