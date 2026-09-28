/* ================================================================
   QA — RETÍCULA VERMELHA NA TELA (desktop): a cruz avermelha sobre o
   inimigo que a tela MOSTRA, no alcance da arma — e nunca sobre quem ela
   não mostra (docs/mobile/referencia-reticula.md).

   Relato do dono: "a mira não fica vermelha quando apontada aos inimigos".

   O PRODUTO é observado, não dirigido: cada caso põe o jogador e o alvo no
   mundo, aponta a câmera e roda o `tick()` de verdade; a medida é a COR
   COMPUTADA do traço da retícula (`getComputedStyle`), que é o que o jogador
   vê. Ninguém aqui chama a retícula nem a oclusão por fora — no desktop
   quem alimenta js/oclusao.js é SÓ a fiação da retícula (a assistência é do
   toque), e se ela não o fizesse o caminhão vazaria.

   ÂNCORA INDEPENDENTE: a técnica dos testes `aim-visibilidade` — o MESMO
   quadro desenhado duas vezes, com e sem o alvo, e os pixels que mudam (na
   caixa projetada das esferas, e numa janela de 5×5 px no CENTRO da tela,
   onde a cruz está). 0 px ⇒ a tela não mostra o alvo ⇒ a cruz não pode
   avermelhar. Centro > 0 ⇒ a cruz está sobre o alvo desenhado.

   Alvo: o avatar REMOTO de um jogador de verdade (o BotHost do harness), o
   boneco que a tela de quem joga desenha; no mato, o boneco AGACHADO de
   teste dos `aim-visibilidade` e um DEITADO (caixas desenhadas, alvos de
   combate). Neutros: os discos do estande (js/maptoys.js) e o cervo.

   REINJEÇÕES (medidas na rodada que criou a retícula): sem teste de visibilidade, a cruz
   avermelha em 22 de 22 escondidos pelo caminhão, 20 de 20 pela parede e 38
   de 38 no campo; sem a categoria, nos 4 discos e no cervo; sem a oclusão
   na fiação do desktop, em 10 de 23 atrás do caminhão; sem histerese, 59
   trocas de cor em 60 quadros de tremor na borda.

   Portas 4080 (desktop) e 4082 (celular).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness.js');

const PORT = 4080;
const VIEW = { width: 1024, height: 576 };

function instalar() {
  const G = window.QA.G, MP = window.QA.MP, THREE = MP.THREE, cam = MP.camera;
  const renderer = MP.renderer, scene = MP.scene, gl = renderer.getContext();
  for (const e of G.Enemies.list) { e.alive = false; if (e.group) e.group.visible = false; }
  const r0 = window.QA.reset;
  window.QA.reset = function (...a) { r0.apply(this, a); MP.player.invulnUntil = 1e12; };
  const remoto = () => (window.__MP_remotePlayers || []).find(r => r.nick === 'BotHost');
  const cw = renderer.domElement.width, ch = renderer.domElement.height;
  const buf1 = new Uint8Array(cw * ch * 4), buf2 = new Uint8Array(cw * ch * 4);
  const traco = document.getElementById('ch-l'), cruz = document.getElementById('crosshair');
  // "sob a cruz" na página também (a mesma régua do lado do Node, abaixo)
  window.sobACruz = c => c.nucleo === 4;
  const ARMA = { fuzil: 0, trovao: 1, rajada: 7 };
  const V = window.RET = {
    remoto, ARMA,
    /* a cor que o jogador VÊ no traço da cruz */
    cor() {
      const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(traco).backgroundColor);
      return m ? m[1].split(',').map(Number) : [0, 0, 0, 0];
    },
    vermelha() { const [r, g, b] = V.cor(); return r > 200 && g < 110 && b < 110; },
    arma(nome) {
      const i = ARMA[nome];
      G.unlockWeapon(i); G.switchWeapon(i);
      return G.gunIndex === i;
    },
    /* ÂNCORA: pixels que mudam entre dois renders do MESMO quadro, com e sem
       o alvo — na caixa projetada das esferas (×1,3) e na janela do centro */
    px(t) {
      const obj = t.group || t.mesh;
      const sprites = [];
      obj.traverse(o => { if (o.isSprite && o.visible) { sprites.push(o); o.visible = false; } });
      cam.updateMatrixWorld(true);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const s of t.hitSpheres()) for (const [ox, oy, oz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const v = new THREE.Vector3(s.c.x + ox * s.r * 1.3, s.c.y + oy * s.r * 1.3, s.c.z + oz * s.r * 1.3).project(cam);
        if (v.z > 1) continue;
        const px = (v.x + 1) / 2 * cw, py = (v.y + 1) / 2 * ch;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      const cx = Math.floor(cw / 2), cy = Math.floor(ch / 2), J = 2;
      x0 = Math.max(0, Math.min(Math.floor(x0), cx - J)); y0 = Math.max(0, Math.min(Math.floor(y0), cy - J));
      x1 = Math.min(cw - 1, Math.max(Math.ceil(x1), cx + J)); y1 = Math.min(ch - 1, Math.max(Math.ceil(y1), cy + J));
      let n = 0, centro = 0, nucleo = 0;
      const w = x1 - x0 + 1, hh = y1 - y0 + 1;
      const vis0 = obj.visible;
      obj.visible = true; renderer.render(scene, cam); gl.readPixels(x0, y0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, buf1);
      obj.visible = false; renderer.render(scene, cam); gl.readPixels(x0, y0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, buf2);
      obj.visible = vis0;
      for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) {
        const k = 4 * (j * w + i);
        if (Math.abs(buf1[k] - buf2[k]) + Math.abs(buf1[k + 1] - buf2[k + 1]) + Math.abs(buf1[k + 2] - buf2[k + 2]) <= 6) continue;
        n++;
        const px = x0 + i, py = y0 + j;
        if (Math.abs(px - cx) <= J && Math.abs(py - cy) <= J) centro++;
        // os 4 pixels em volta do centro exato do canvas (largura/altura pares): a linha da cruz passa ali
        if ((px === cx || px === cx - 1) && (py === cy || py === cy - 1)) nucleo++;
      }
      for (const s of sprites) s.visible = true;
      return { px: n, centro, nucleo };
    },
    /* lâminas DESENHADAS perto de (x, z), lidas das matrizes de instância dos
       chunks do js/grass.js — sem passar pela oclusão */
    laminasPerto(x, z, raio, hMin) {
      let n = 0;
      scene.traverse(o => {
        if (!o.isInstancedMesh || o.material !== G.Grass.material || !o.visible) return;
        const c = o.position, a = o.instanceMatrix.array;
        if (Math.hypot(c.x - x, c.z - z) > 8 + raio) return;
        for (let k = 0; k < o.count * 16; k += 16) {
          const bx = c.x + a[k + 12], bz = c.z + a[k + 14];
          if (Math.hypot(bx - x, bz - z) < raio && Math.hypot(a[k + 4], a[k + 5], a[k + 6]) > hMin) n++;
        }
      });
      return n;
    },
    semGrama(sx, sz, tx, tz) {
      const L = Math.hypot(tx - sx, tz - sz);
      for (let k = 0; k <= L; k += 1.5) if (V.laminasPerto(sx + (tx - sx) * k / L, sz + (tz - sz) * k / L, 2, 0.1) > 0) return false;
      return true;
    },
    /* bonecos de teste, alvos de COMBATE desenhados como caixa:
       · AGACHADO (o dos aim-visibilidade): 0,6 × 1,33 × 0,5, esferas da
         postura agachada (cabeça a 1,08 m);
       · DEITADO: 1,7 × 0,45 × 0,5 no chão, esferas a 0,22–0,24 m — o jogo não
         tem postura deitada, mas um corpo no chão do mato é o pior caso da
         grama, e é o que o relato do wallhack deployado descrevia. */
    bonecos: {},
    criarBoneco(tipo) {
      if (V.bonecos[tipo]) return V.bonecos[tipo];
      const [bx, by, bz, partes] = tipo === 'deitado'
        ? [1.7, 0.45, 0.5, [[0.22, 0.25, 'head', 0.62], [0.24, 0.30, 'body', 0], [0.22, 0.28, 'body', -0.55]]]
        : [0.6, 1.33, 0.5, [[1.08, 0.28, 'head', 0], [0.70, 0.42, 'body', 0], [0.30, 0.34, 'body', 0]]];
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(bx, by, bz), new THREE.MeshStandardMaterial({ color: 0x8a4a2a }));
      m.position.y = by / 2; g.add(m); scene.add(g); g.visible = false;
      const sph = partes.map(([h, r, part, dx]) => ({ c: new THREE.Vector3(), r, part, h, dx }));
      const t = { group: g, alive: false, enabled: true, combate: true, damage() { return false; },
        hitSpheres() { for (const sp of sph) sp.c.set(g.position.x + sp.dx, g.position.y + sp.h, g.position.z); return sph; } };
      G.extraTargets.push(t);
      return (V.bonecos[tipo] = t);
    },
    /* põe o alvo onde o caso pede — e só ele vivo entre os bonecos do teste */
    posicionar(t, x, z) {
      const y = G.heightAt(x, z), obj = t.group || t.mesh;
      const rp = remoto();
      if (rp && rp !== t) { rp.group.visible = false; rp.alive = false; }
      for (const b of Object.values(V.bonecos)) if (b !== t) { b.alive = false; b.group.visible = false; }
      if (t.group) t.group.position.set(x, y, z); else t.mesh.position.set(x, t.mesh.position.y, z);
      if (t.targetPos) t.targetPos.set(x, y, z);
      t.alive = true; obj.visible = true; obj.updateMatrixWorld(true);
    },
    olho() { cam.updateMatrixWorld(true); return new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld); },
    /* aponta a câmera para o ponto `p` (+ `lado` m à direita da linha) */
    mirar(p, lado = 0) {
      const o = V.olho(), d = new THREE.Vector3().subVectors(p, o);
      if (lado) { const r = new THREE.Vector3(-d.z, 0, d.x).normalize(); d.addScaledVector(r, lado); }
      cam.quaternion.setFromEuler(new THREE.Euler(Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(-d.x, -d.z), 0, 'YXZ'));
    },
    /* UM CASO, no jogo de verdade: atirador em (sx, sz) (olho `dy` acima),
       alvo `t` em (tx, tz), cruz a `altura` m do chão dele (e `lado` m ao
       lado), `quadros` para assentar a grama; a última volta de `tick` é a
       que pinta a retícula — e a âncora mede ESSE quadro */
    caso(tag, o) {
      const t = o.alvo || remoto();
      G.Env.weather = 'limpo';
      window.QA.reset(o.sx, o.sz);
      if (o.arma) V.arma(o.arma);
      // atirador AGACHADO: a tecla do jogo (olho 1,62 → 1,04 m), assentada
      if (o.agachar) G.keys.ControlLeft = true;
      window.QA.tick(Math.max(o.quadros || 12, o.agachar ? 40 : 0));
      if (o.ads) { G.mouse.aiming = true; window.QA.tick(40); }
      /* no alto (copa vista de cima): fora do chão, sem velocidade — o
         `onGround` do reset colaria o jogador de volta no terreno */
      const noAlto = () => { if (o.dy) { MP.player.vel.set(0, 0, 0); MP.player.onGround = false; } };
      if (o.dy) MP.player.pos.y += o.dy;
      noAlto();
      V.posicionar(t, o.tx, o.tz);
      const alvoP = () => { const g = (t.group || t.mesh).position; return new THREE.Vector3(g.x, (t.group ? g.y : 0) + (o.altura ?? 1.1), g.z); };
      /* 8 quadros MIRANDO antes de ler: a histerese (0,1 s = 6 quadros) de
         qualquer coisa que a câmera do reset tenha visto já expirou, e a cor
         lida é a do regime, não a de um quadro de transição */
      for (let k = 0; k < 8; k++) {
        noAlto();
        V.mirar(alvoP(), o.lado || 0);
        window.QA.tick(1);
      }
      const verm = V.vermelha(), cor = V.cor(), ret = G.Reticula ? G.Reticula.last : { motivo: 'sem-reticula' };
      const r = { tag, vermelha: verm, cor: cor.slice(0, 3), motivo: ret.motivo, opac: document.getElementById('crosshair').style.opacity,
        dist: +alvoP().distanceTo(V.olho()).toFixed(1), adsT: +(G.adsT ?? 0), arma: G.gunIndex,
        atirador: [+o.sx.toFixed(2), +o.sz.toFixed(2)], alvo: [+o.tx.toFixed(2), +o.tz.toFixed(2)] };
      Object.assign(r, V.px(t));
      G.mouse.aiming = false;
      return r;
    },
    cruzVisivel() { return getComputedStyle(cruz).opacity; },
  };
}

/* "sob a cruz": os 4 pixels do centro exato mostram o alvo (a linha da cruz
   atravessa o boneco DESENHADO, não uma borda de parede na frente dele) */
const sobACruz = c => c.nucleo === 4;
const resumo = cs => cs.map(c => `${c.tag} ${c.dist} m px=${c.px} centro=${c.centro} núcleo=${c.nucleo} vermelha=${c.vermelha} (${c.motivo}) ` +
  `arma=${c.arma} atirador=${c.atirador} alvo=${c.alvo}`).join('\n');
const vaza = c => c.px === 0 && c.vermelha;
/* quanto do inimigo VISÍVEL sob a cruz, no campo, a régua da grama pode
   deixar branco (medido no primeiro verde; teto para pegar regressão) */
const LIMITE_BRANCO_CAMPO = 0.5;

describe('retícula vermelha na tela (desktop) — acende no inimigo que a tela mostra, nunca no que ela esconde', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, host;
  before(async () => {
    h = await bootGame({ port: PORT, viewport: VIEW,
      extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '900', GAS_DEFAULT: 'off' } });
    host = await startBRMatch(h, { serverPort: PORT, flags: { golem: false, ciclo: 'dia' } });
    await h.play(async () => {
      const G = window.QA.G;
      await G.WeaponModels.ready;
      if (G.Car && G.Car.ready) await G.Car.ready;
      for (let i = 0; i < 100 && !(window.__MP_remotePlayers || []).some(r => r.nick === 'BotHost'); i++) await new Promise(r => setTimeout(r, 100));
      await new Promise(r => setTimeout(r, 3000));
    });
    await h.play(instalar);
    /* A OCLUSÃO ASSENTADA — pelo JOGO: só `tick`. No desktop quem chama o
       `Oclusao.atualizar` é a fiação da retícula; se ela não chamasse, o
       registro ficaria em 0 malhas e o caso do caminhão vazaria. */
    const oc = await h.play(async () => {
      const G = window.QA.G, O = G.Oclusao;
      window.QA.reset(30, 30);
      let estavel = 0, ultimo = -1;
      const t0 = performance.now();
      while (performance.now() - t0 < 90000) {
        window.QA.tick(10);
        await new Promise(r => setTimeout(r, 100));
        const n = O.estado().malhas;
        if (O.pendentes === 0 && n === ultimo && n > 0) { if (++estavel >= 30) break; } else estavel = 0;
        ultimo = n;
      }
      return { pendentes: O.pendentes, estavel, malhas: O.estado().malhas };
    });
    console.log(`  [montagem] oclusão pelo tick do desktop: ${oc.malhas} malhas, ${oc.pendentes} pendentes, estável ${oc.estavel}`);
  });
  after(async () => { if (host) host.close(); if (h) await h.close(); });

  it('dado o inimigo VISÍVEL sob a cruz na rua (fuzil e escopeta no quadril), então vermelha — e 1 m ao lado, branca', async () => {
    const r = await h.play(() => {
      const V = window.RET;
      const C = { x: -340, z: 130 };
      const out = { fuzil: [], trovao: [], lado: [], tentativas: 0 };
      // o tapete de grama assentado em volta da cidade: a régua `semGrama` lê os chunks desenhados
      window.QA.reset(C.x, C.z); window.QA.tick(60);
      for (let r2 = 6; r2 <= 50 && (out.fuzil.length < 8 || out.trovao.length < 4); r2 += 6) {
        for (let a = 0; a < 12 && (out.fuzil.length < 8 || out.trovao.length < 4); a++) {
          const tx = C.x + Math.cos(a * 0.5236 + r2) * r2, tz = C.z + Math.sin(a * 0.5236 + r2) * r2;
          for (let k = 0; k < 8; k++) {
            const arma = out.fuzil.length < 8 ? 'fuzil' : 'trovao';
            const d = arma === 'fuzil' ? [8, 15, 25, 35][(out.fuzil.length) % 4] : [6, 9, 12, 14][out.trovao.length % 4];
            const b = k * Math.PI / 4, sx = tx - Math.cos(b) * d, sz = tz - Math.sin(b) * d;
            out.tentativas++;
            if (!V.semGrama(sx, sz, tx, tz)) continue;
            const c = V.caso('rua-' + arma, { sx, sz, tx, tz, arma, quadros: 6 });
            if (!sobACruz(c)) continue;                 // a linha da cruz não atravessa o boneco desenhado
            out[arma].push(c);
            /* o MESMO lugar, a cruz 1 m para o lado (o boneco continua na
               tela); 12 quadros antes: a histerese do caso anterior expira */
            if (out.lado.length < 6) out.lado.push(V.caso('lado', { sx, sz, tx, tz, arma, quadros: 12, lado: 1 }));
            break;
          }
        }
      }
      return out;
    });
    const brancas = [...r.fuzil, ...r.trovao].filter(c => !c.vermelha);
    const ladoVerm = r.lado.filter(c => c.vermelha);
    console.log(`  [rua] fuzil ${r.fuzil.length} casos, ${r.fuzil.filter(c => c.vermelha).length} vermelhos · ` +
      `escopeta ${r.trovao.length}, ${r.trovao.filter(c => c.vermelha).length} vermelhos · ` +
      `1 m ao lado: ${r.lado.length}, ${r.lado.filter(c => c.vermelha).length} vermelhos (${r.tentativas} tentativas)`);
    console.log('  [rua] casos:\n' + resumo([...r.fuzil, ...r.trovao, ...r.lado]));
    assert.ok(r.lado.every(c => c.centro === 0 && c.px > 0), `cenário: a cruz 1 m ao lado ainda pega o boneco, ou ele saiu da tela:\n${resumo(r.lado)}`);
    assert.ok(r.fuzil.length >= 6, `cenário: só ${r.fuzil.length} casos de fuzil na rua com o boneco sob a cruz`);
    assert.ok(r.trovao.length >= 3, `cenário: só ${r.trovao.length} casos de escopeta na rua`);
    assert.deepEqual(brancas, [], `inimigo visível sob a cruz, no alcance, sem grama no caminho, e a cruz branca:\n${resumo(brancas)}`);
    assert.ok(r.lado.length >= 4, 'cenário: casos de cruz ao lado');
    assert.deepEqual(ladoVerm, [], `cruz 1 m ao lado (0 px no centro esperado) e vermelha:\n${resumo(ladoVerm)}`);
    for (const c of r.fuzil) assert.equal(c.opac, '1', 'no quadril a cruz está na tela');
  });

  it('dado o alcance da arma, então além dele branca — e a MIRA o alonga (escopeta a 20 m, fuzil a 75 m)', async () => {
    const r = await h.play(() => {
      const V = window.RET;
      const C = { x: -340, z: 130 };
      const out = { trovao: [], fuzil: [] };
      window.QA.reset(C.x, C.z); window.QA.tick(60);
      // escopeta a 20 m na rua: quadril (alcance 16,8 m) e mira (26 m)
      for (let a = 0; a < 24 && out.trovao.length < 3; a++) {
        const tx = C.x + Math.cos(a * 0.2618) * 12, tz = C.z + Math.sin(a * 0.2618) * 12;
        for (let k = 0; k < 8; k++) {
          const b = k * Math.PI / 4, sx = tx - Math.cos(b) * 20, sz = tz - Math.sin(b) * 20;
          if (!V.semGrama(sx, sz, tx, tz)) continue;
          const quadril = V.caso('trovao-20m-quadril', { sx, sz, tx, tz, arma: 'trovao', quadros: 6 });
          if (!sobACruz(quadril)) continue;
          const mira = V.caso('trovao-20m-mira', { sx, sz, tx, tz, arma: 'trovao', quadros: 2, ads: true });
          if (!sobACruz(mira)) continue;
          out.trovao.push([quadril, mira]);
          break;
        }
      }
      // fuzil a 75 m (quadril 60 m; mira até 240 m), cruz na cabeça — campo aberto
      let seed = 2024;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const G = window.QA.G;
      for (let i = 0; i < 400 && out.fuzil.length < 3; i++) {
        const sx = (rnd() * 2 - 1) * 450, sz = (rnd() * 2 - 1) * 450, a = rnd() * Math.PI * 2;
        const tx = sx + Math.cos(a) * 75, tz = sz + Math.sin(a) * 75;
        if (G.heightAt(sx, sz) < 0.5 || G.heightAt(tx, tz) < 0.5) continue;
        const quadril = V.caso('fuzil-75m-quadril', { sx, sz, tx, tz, arma: 'fuzil', quadros: 6, altura: 1.66 });
        if (!sobACruz(quadril)) continue;
        const mira = V.caso('fuzil-75m-mira', { sx, sz, tx, tz, arma: 'fuzil', quadros: 2, ads: true, altura: 1.66 });
        if (!sobACruz(mira)) continue;
        out.fuzil.push([quadril, mira]);
      }
      return out;
    });
    const todos = [...r.trovao, ...r.fuzil];
    console.log(`  [alcance] ${todos.map(([q, m]) => `${q.tag.split('-')[0]} ${q.dist} m: quadril ${q.vermelha ? 'VERMELHA' : 'branca'} (${q.motivo}), ` +
      `mira ${m.vermelha ? 'VERMELHA' : 'branca'} (${m.motivo}, adsT ${m.adsT.toFixed(2)}, opacidade ${m.opac})`).join(' · ')}`);
    assert.ok(r.trovao.length >= 2, `cenário: só ${r.trovao.length} lugares de 20 m na rua`);
    assert.ok(r.fuzil.length >= 1, `cenário: só ${r.fuzil.length} linhas de 75 m com a cabeça na tela`);
    const quadrilVerm = todos.filter(([q]) => q.vermelha).map(([q]) => q);
    assert.deepEqual(quadrilVerm, [], `além do alcance do quadril e vermelha:\n${resumo(quadrilVerm)}`);
    // a mira alonga: nos casos em que a linha da cruz até o boneco está livre (rua), vermelha
    const miraBranca = r.trovao.filter(([, m]) => !m.vermelha).map(([, m]) => m);
    assert.deepEqual(miraBranca, [], `escopeta na MIRA a 20 m (alcance 26 m), boneco sob a cruz, e branca:\n${resumo(miraBranca)}`);
    assert.ok(r.fuzil.filter(([, m]) => m.vermelha).length >= 1, `fuzil na MIRA a 75 m nunca avermelhou:\n${resumo(r.fuzil.map(([, m]) => m))}`);
  });

  it('dado o alvo atrás do CAMINHÃO MILITAR parado (8 direções), então 0 px ⇒ branca; ao lado e visível, vermelha', async () => {
    const r = await h.play(() => {
      const V = window.RET, G = window.QA.G;
      const casos = [], controles = [];
      for (const v of G.Car.vehicles) {
        if (!/CAMINH/.test(v.cfg.name)) continue;
        const c = v.group.position;
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a);
          for (const altura of [1.1, 1.66]) {
            const cs = V.caso('caminhao', { sx: c.x - ca * 15, sz: c.z - sa * 15, tx: c.x + ca * 2.2, tz: c.z + sa * 2.2, arma: 'fuzil', altura });
            casos.push(cs);
            if (cs.px !== 0 || altura !== 1.1) continue;
            for (const lado of [1, -1]) {
              let achou = null;
              for (let d = 3; d <= 12 && !achou; d += 1) {
                const k2 = V.caso('controle', { sx: c.x - ca * 15, sz: c.z - sa * 15, arma: 'fuzil', quadros: 2,
                  tx: c.x + ca * 2.2 - sa * lado * d, tz: c.z + sa * 2.2 + ca * lado * d });
                if (sobACruz(k2) && k2.px > 150) achou = k2;
              }
              if (achou) { controles.push(achou); break; }
            }
          }
        }
      }
      return { casos, controles };
    });
    const zero = r.casos.filter(c => c.px === 0), vaz = r.casos.filter(vaza);
    const perdidos = r.controles.filter(c => !c.vermelha);
    console.log(`  [caminhão] ${r.casos.length} casos, ${zero.length} com 0 px: ${vaz.length} vermelhos · ` +
      `controle: ${r.controles.length} visíveis ao lado, ${r.controles.length - perdidos.length} vermelhos`);
    if (perdidos.length) console.log('  [caminhão] controles brancos:\n' + resumo(perdidos));
    assert.ok(zero.length >= 10, `cenário inválido: só ${zero.length} casos com o alvo escondido pelo caminhão`);
    assert.deepEqual(vaz, [], `a retícula avermelhou sobre quem a tela não mostra:\n${resumo(vaz)}`);
    assert.ok(r.controles.length >= 6, `cenário: só ${r.controles.length} controles visíveis`);
    assert.ok(perdidos.length <= r.controles.length * 0.25,
      `a retícula não avermelhou em ${perdidos.length} de ${r.controles.length} inimigos VISÍVEIS sob a cruz ao lado do caminhão:\n${resumo(perdidos)}`);
  });

  it('dado o alvo atrás de uma PAREDE da cidade, então 0 px ⇒ branca', async () => {
    const r = await h.play(() => {
      const V = window.RET, G = window.QA.G;
      const casos = [];
      /* paredes da cidade de verdade (AABB de js/paredes.js), altas e com
         pelo menos 3 m de comprimento; o caso atravessa pela espessura */
      const paredes = G.Structures.walls.filter(w => w.city && !w.noCollide && Math.max(w.x1 - w.x0, w.z1 - w.z0) > 3 &&
        w.y1 - G.heightAt((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2) > 2.6);
      const passo = Math.max(1, Math.floor(paredes.length / 14));
      for (let i = 0; i < paredes.length && casos.length < 28; i += passo) {
        const w = paredes[i], cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
        const eixo = (w.x1 - w.x0) < (w.z1 - w.z0) ? 'x' : 'z';
        // atravessa a caixa pela espessura: atirador 10 m antes de uma face, alvo 0,6 m depois da outra
        for (const [ax, s] of [[eixo, 1], [eixo, -1]]) {
          const ini = ax === 'x' ? (s > 0 ? w.x0 : w.x1) : (s > 0 ? w.z0 : w.z1);
          const fim = ax === 'x' ? (s > 0 ? w.x1 : w.x0) : (s > 0 ? w.z1 : w.z0);
          const sx = ax === 'x' ? ini - s * 10 : cx, sz = ax === 'z' ? ini - s * 10 : cz;
          const tx = ax === 'x' ? fim + s * 0.6 : cx, tz = ax === 'z' ? fim + s * 0.6 : cz;
          casos.push(V.caso('parede', { sx, sz, tx, tz, arma: 'fuzil', quadros: 4 }));
          casos.push(V.caso('parede-cabeca', { sx, sz, tx, tz, arma: 'fuzil', quadros: 2, altura: 1.66 }));
        }
      }
      return casos;
    });
    const zero = r.filter(c => c.px === 0), vaz = r.filter(vaza);
    console.log(`  [parede] ${r.length} casos, ${zero.length} com 0 px: ${vaz.length} vermelhos`);
    assert.ok(zero.length >= 10, `cenário inválido: só ${zero.length} casos com o alvo escondido pela parede`);
    assert.deepEqual(vaz, [], `a retícula avermelhou através da parede:\n${resumo(vaz)}`);
  });

  it('dado o alvo sob a COPA vista do alto e o AGACHADO no mato, então 0 px ⇒ branca', async () => {
    const r = await h.play(() => {
      const V = window.RET, G = window.QA.G;
      let seed = 12345;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const copa = [], mato = [];
      /* a copa vista do ALTO: atirador 6–10 m ao lado e 9–12 m acima, alvo
         junto do tronco — a linha desce pela copa (a 14 m e 7 m, a da
         varredura dos aim-visibilidade, ela passa por baixo dela) */
      let arvores = 0;
      for (let i = 0; i < 2000 && arvores < 20; i++) {
        const x = (rnd() * 2 - 1) * 480, z = (rnd() * 2 - 1) * 480;
        const obs = (G.obstaclesNear(x, z) || []).filter(o => o.r > 0.2 && o.r < 1.5);
        if (!obs.length) continue;
        const o = obs[0]; arvores++;
        const a = rnd() * Math.PI * 2;
        for (const [d, dy] of [[6, 12], [8, 10], [10, 9]]) {
          copa.push(V.caso('copa', { sx: o.x - Math.cos(a) * d, sz: o.z - Math.sin(a) * d, dy,
            tx: o.x + Math.cos(a) * 1.2, tz: o.z + Math.sin(a) * 1.2, arma: 'fuzil', quadros: 4 }));
        }
      }
      /* o agachado e o deitado onde a grama DESENHADA é alta e densa, com o
         atirador em pé e agachado (a linha baixa atravessa mais mato) */
      const agachado = V.criarBoneco('agachado'), deitado = V.criarBoneco('deitado');
      seed = 4242;
      for (let i = 0; i < 120 && mato.length < 60; i++) {
        const px = (rnd() * 2 - 1) * 450, pz = (rnd() * 2 - 1) * 450, a0 = rnd() * Math.PI * 2;
        if (G.heightAt(px, pz) < 0.5) continue;
        window.QA.reset(px, pz); window.QA.tick(60);
        let achou = null;
        for (let k = 0; k < 12 && !achou; k++) for (const d of [16, 24, 32]) {
          const a = a0 + k * Math.PI / 6, tx = px + Math.cos(a) * d, tz = pz + Math.sin(a) * d;
          if (V.laminasPerto(tx, tz, 1.5, 0.6) >= 25) { achou = [tx, tz]; break; }
        }
        if (!achou) continue;
        const [tx, tz] = achou, base = { sx: px, sz: pz, tx, tz, arma: 'fuzil', quadros: 2 };
        for (const altura of [0.70, 1.08]) mato.push(V.caso('mato-agachado', { ...base, alvo: agachado, altura }));
        mato.push(V.caso('mato-agachado/atirador-agachado', { ...base, alvo: agachado, altura: 0.70, agachar: true }));
        mato.push(V.caso('mato-deitado', { ...base, alvo: deitado, altura: 0.24 }));
        mato.push(V.caso('mato-deitado/atirador-agachado', { ...base, alvo: deitado, altura: 0.24, agachar: true }));
      }
      for (const t of [agachado, deitado]) { t.alive = false; t.group.visible = false; }
      return { copa, mato };
    });
    const copaZero = r.copa.filter(c => c.px === 0), matoZero = r.mato.filter(c => c.px === 0);
    const vaz = [...r.copa, ...r.mato].filter(vaza);
    const matoVisto = r.mato.filter(sobACruz);
    const porMotivo = cs => Object.entries(cs.reduce((m, c) => ((m[c.motivo] = (m[c.motivo] || 0) + 1), m), {})).map(([k, v]) => `${k} ${v}`).join(', ');
    console.log(`  [mato] brancos sob a cruz, por motivo: ${porMotivo(matoVisto.filter(c => !c.vermelha))}`);
    console.log(`  [copa] ${r.copa.length} casos, ${copaZero.length} com 0 px · [mato] ${r.mato.length} casos, ${matoZero.length} com 0 px ` +
      `(${matoZero.filter(c => /deitado/.test(c.tag)).length} deitados), ` +
      `${matoVisto.length} com o boneco sob a cruz (${matoVisto.filter(c => c.vermelha).length} vermelhos) · vazamentos: ${vaz.length}`);
    assert.ok(copaZero.length >= 3, `cenário inválido: só ${copaZero.length} alvos escondidos pela copa`);
    assert.ok(matoZero.length >= 6, `cenário inválido: só ${matoZero.length} bonecos que o mato esconde (0 px) em ${r.mato.length}`);
    assert.deepEqual(vaz, [], `a retícula avermelhou sobre quem a copa/o mato esconde:\n${resumo(vaz)}`);
  });

  /* A VARREDURA DO CAMPO (a LCG 12345 dos aim-visibilidade, tapete de grama
     assentado): o inimigo em pé a 8–70 m, cruz no tronco e na cabeça. Mede
     os dois lados: 0 px ⇒ branca (sem exceção), e QUANTO do inimigo visível
     sob a cruz a régua conservadora da grama deixa branco — é o preço de
     "na dúvida, branca", e o teto aqui pega regressão, não é meta. */
  it('dada a varredura do campo (inimigo em pé, 8–70 m, tronco e cabeça), então 0 px ⇒ branca, e o visível sob a cruz avermelha', async () => {
    const r = await h.play(() => {
      const V = window.RET, G = window.QA.G;
      let seed = 12345;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const casos = [];
      for (let i = 0; i < 160 && casos.length < 120; i++) {
        const px = (rnd() * 2 - 1) * 480, pz = (rnd() * 2 - 1) * 480;
        if (G.heightAt(px, pz) < 0.5) continue;
        const a = rnd() * Math.PI * 2, d = 8 + rnd() * 52;
        const base = { sx: px, sz: pz, tx: px + Math.cos(a) * d, tz: pz + Math.sin(a) * d, arma: 'fuzil' };
        casos.push(V.caso('campo-tronco', { ...base, quadros: 40 }));
        casos.push(V.caso('campo-cabeca', { ...base, quadros: 2, altura: 1.66 }));
      }
      return casos;
    });
    const zero = r.filter(c => c.px === 0), vaz = r.filter(vaza);
    const vistos = r.filter(sobACruz), brancos = vistos.filter(c => !c.vermelha);
    const porMotivo = cs => Object.entries(cs.reduce((m, c) => ((m[c.motivo] = (m[c.motivo] || 0) + 1), m), {})).map(([k, v]) => `${k} ${v}`).join(', ');
    const tronco = vistos.filter(c => c.tag === 'campo-tronco'), cabeca = vistos.filter(c => c.tag === 'campo-cabeca');
    console.log(`  [campo] ${r.length} casos, ${zero.length} com 0 px: ${vaz.length} vermelhos · sob a cruz: ${vistos.length}, ` +
      `${vistos.length - brancos.length} vermelhos (tronco ${tronco.filter(c => c.vermelha).length}/${tronco.length}, ` +
      `cabeça ${cabeca.filter(c => c.vermelha).length}/${cabeca.length}) · brancos por motivo: ${porMotivo(brancos)}`);
    assert.ok(zero.length >= 10, `cenário inválido: só ${zero.length} casos escondidos`);
    assert.deepEqual(vaz, [], `a retícula avermelhou sobre quem a tela não mostra:\n${resumo(vaz)}`);
    assert.ok(vistos.length >= 30, `cenário: só ${vistos.length} inimigos sob a cruz`);
    assert.ok(brancos.length <= vistos.length * LIMITE_BRANCO_CAMPO,
      `a retícula ficou branca em ${brancos.length} de ${vistos.length} inimigos VISÍVEIS sob a cruz no campo:\n${resumo(brancos)}`);
  });

  it('dado um alvo que NÃO é de combate sob a cruz (disco do estande, cervo), então branca', async () => {
    const r = await h.play(() => {
      const V = window.RET, G = window.QA.G, MP = window.QA.MP;
      const out = { disco: [], cervo: [] };
      // o estande: os discos entram em extraTargets e sobem no tick
      const spot = G.MapToys.spots.gallery;
      G.MapToys.startGallery();
      window.QA.reset(spot.x, spot.z + 9); window.QA.tick(4);
      const discos = G.extraTargets.filter(t => t.mesh && t.homeY !== undefined);
      for (const d of discos.slice(0, 4)) {
        window.QA.reset(d.mesh.position.x, d.mesh.position.z + 9);
        V.arma('fuzil');
        window.QA.tick(2);
        d.alive = true; d.enabled = true; d.mesh.visible = true; d.mesh.position.y = d.homeY;
        for (let k = 0; k < 3; k++) { V.mirar(d.mesh.position); window.QA.tick(1); }
        const c = { tag: 'disco', vermelha: V.vermelha(), motivo: G.Reticula ? G.Reticula.last.motivo : 'sem-reticula', dist: 9, arma: G.gunIndex,
          atirador: [], alvo: [d.mesh.position.x, d.mesh.position.z] };
        Object.assign(c, V.px(d));
        out.disco.push(c);
      }
      for (const d of discos) { d.alive = false; d.enabled = false; d.mesh.visible = false; }
      // o cervo: caça, não inimigo
      const cervo = G.Animals.list.find(a => !a.predator);
      if (cervo) {
        const C = { x: -340, z: 130 };
        for (let k = 0; k < 8 && out.cervo.length < 3; k++) {
          const b = k * Math.PI / 4;
          const c = V.caso('cervo', { sx: C.x - Math.cos(b) * 12, sz: C.z - Math.sin(b) * 12, tx: C.x, tz: C.z, alvo: cervo, arma: 'fuzil',
            altura: 0.62 * cervo.size });
          if (sobACruz(c)) out.cervo.push(c);
        }
        cervo.alive = false; cervo.group.visible = false;
      }
      MP.player.invulnUntil = 1e12;
      return out;
    });
    const todos = [...r.disco, ...r.cervo];
    console.log(`  [neutros] disco: ${r.disco.map(c => `núcleo=${c.nucleo} ${c.vermelha ? 'VERMELHA' : 'branca'} (${c.motivo})`).join(', ')} · ` +
      `cervo: ${r.cervo.map(c => `núcleo=${c.nucleo} ${c.vermelha ? 'VERMELHA' : 'branca'} (${c.motivo})`).join(', ')}`);
    const naTela = todos.filter(sobACruz);
    assert.ok(r.disco.filter(sobACruz).length >= 2, `cenário: só ${r.disco.filter(sobACruz).length} discos sob a cruz`);
    assert.ok(r.cervo.length >= 1, 'cenário: nenhum cervo sob a cruz');
    const verm = naTela.filter(c => c.vermelha);
    assert.deepEqual(verm, [], `a retícula avermelhou no que não é inimigo:\n${resumo(verm)}`);
  });

  /* C12 (laudo validacao-070502f.md): sobre o VISITANTE (e o Colosso) a cruz
     nunca avermelhava — o motivo registrado era `oculto`, com o alvo ocupando
     os 25 px sob a cruz. Os objetos dos dois chefes não expunham `group`, e
     `isRendered(undefined)` é falso: a MESMA causa tirava a assistência deles.
     O objeto desenhado é achado pela CENA (a raiz cuja posição É a de
     `pos()`), não pelo `group` do produto — a âncora não usa o conserto. */
  it('dados o VISITANTE e o COLOSSO visíveis sob a cruz, então vermelha', async () => {
    const r = await h.play(() => {
      const V = window.RET, G = window.QA.G, MP = window.QA.MP;
      const out = [];
      for (const [nome, B] of [['VISITANTE', G.Alien], ['COLOSSO', G.Boss]]) {
        // o Colosso do mundo de teste pode ainda não ter despertado: o caso mede a retícula, não o spawn
        if (B && !B.alive && B.state) { B.state.alive = true; if (B.state.hp !== undefined && B.state.hp <= 0) B.state.hp = 1; }
        if (!B || !B.alive) { out.push({ nome, erro: 'chefe morto/ausente' }); continue; }
        const raiz = MP.scene.children.find(o => o.position === B.pos());
        if (!raiz) { out.push({ nome, erro: 'objeto desenhado não achado na cena' }); continue; }
        raiz.visible = true;   // reanimado (Colosso): o corpo volta a ser desenhado
        /* o chefe fica onde mora (o Colosso no pátio do castelo): IA parada
           durante a medida (restaurada abaixo) e o atirador procura um rumo e
           uma distância de onde o vê sob a cruz */
        const upd = B.update;
        B.update = () => {};
        let achado = null;
        try {
        const proxy = { group: raiz, hitSpheres: () => B.hitSpheres() };
        for (let n = 0; n < 40 && !achado; n++) {
          const k = n % 8, d0 = [6, 10, 15, 22, 30][Math.floor(n / 8)];
          const sph = B.hitSpheres().reduce((a, b) => (b.r > a.r ? b : a));
          const a = k * Math.PI / 4, d = d0 + sph.r;
          window.QA.reset(sph.c.x + Math.sin(a) * d, sph.c.z + Math.cos(a) * d);
          V.arma('fuzil');
          window.QA.tick(12);
          for (let q = 0; q < 8; q++) { V.mirar(B.hitSpheres().reduce((x, y) => (y.r > x.r ? y : x)).c); window.QA.tick(1); }
          const c = { nome, vermelha: V.vermelha(), motivo: G.Reticula ? G.Reticula.last.motivo : 'sem-reticula' };
          Object.assign(c, V.px(proxy));
          if (c.nucleo === 4) achado = c;
        }
        } finally { B.update = upd; }
        /* a causa, direto: o objeto do chefe aponta o MESMO corpo que a cena
           desenha (é por `group`/`mesh` que assistência e retícula perguntam
           "está desenhado?") — vale mesmo sem rumo livre até o Colosso no pátio */
        const expoe = (B.group || B.mesh) === raiz;
        out.push(achado ? { ...achado, expoe } : { nome, expoe, semRumo: true });
      }
      MP.player.invulnUntil = 1e12;
      return out;
    });
    console.log(`  [chefes] ${r.map(c => c.erro ? `${c.nome}: ${c.erro}` : c.semRumo ? `${c.nome}: sem rumo livre; expõe o corpo: ${c.expoe}`
      : `${c.nome} px=${c.px} ${c.vermelha ? 'VERMELHA' : 'branca'} (${c.motivo}); expõe o corpo: ${c.expoe}`).join(' · ')}`);
    for (const c of r) {
      assert.ok(!c.erro, `cenário inválido: ${c.nome}: ${c.erro}`);
      assert.equal(c.expoe, true, `${c.nome} não expõe o corpo desenhado (group/mesh) — assistência e retícula o tratam como oculto`);
    }
    const vis = r.find(c => c.nome === 'VISITANTE');
    assert.ok(vis && !vis.semRumo, 'cenário inválido: nenhum rumo com o VISITANTE sob a cruz');
    assert.equal(vis.vermelha, true, `VISITANTE visível sob a cruz (${vis.px} px) e a retícula ficou branca (${vis.motivo})`);
  });

  it('dada a cruz saindo do inimigo ou tremendo na borda, então apaga em ~0,1 s e não pisca', async () => {
    const r = await h.play(() => {
      const V = window.RET, MP = window.QA.MP, THREE = MP.THREE;
      const C = { x: -340, z: 130 };
      window.QA.reset(C.x, C.z); window.QA.tick(60);
      for (let k = 0; k < 96; k++) {
        const r2 = 6 + 6 * Math.floor(k / 12), a = (k % 12) * 0.5236 + r2;
        const tx = C.x + Math.cos(a) * r2, tz = C.z + Math.sin(a) * r2;
        const b = (k % 8) * Math.PI / 4, sx = tx - Math.cos(b) * 15, sz = tz - Math.sin(b) * 15;
        if (!V.semGrama(sx, sz, tx, tz)) continue;
        const c = V.caso('histerese', { sx, sz, tx, tz, arma: 'fuzil', quadros: 6 });
        if (!c.vermelha || !sobACruz(c)) continue;
        // o centro do TRONCO desenhado (esfera do avatar remoto), não a conta do teste
        const t = V.remoto(), alvo = new THREE.Vector3().copy(t.hitSpheres()[1].c);
        // sai 1 m para o lado e conta os quadros até apagar
        let quadros = 0;
        for (; quadros < 30 && V.vermelha(); quadros++) { V.mirar(alvo, 1); window.QA.tick(1); }
        // tremor: a cruz a 0,40 e 0,45 m do centro do tronco (raio 0,42), quadro sim quadro não
        V.mirar(alvo); window.QA.tick(1);
        let trocas = 0, antes = V.vermelha();
        for (let i = 0; i < 60; i++) {
          V.mirar(alvo, i % 2 ? 0.45 : 0.40); window.QA.tick(1);
          const agora = V.vermelha();
          if (agora !== antes) trocas++;
          antes = agora;
        }
        return { quadros, trocas, dt: 1 / 60, c };
      }
      return null;
    });
    assert.ok(r, 'cenário: nenhum inimigo vermelho sob a cruz na rua');
    console.log(`  [histerese] apagou ${r.quadros} quadros depois de sair (1/60 s cada) · ${r.trocas} trocas em 60 quadros de tremor na borda`);
    assert.ok(r.quadros >= 1 && r.quadros <= 8, `apagou em ${r.quadros} quadros (esperado ~6 = 0,1 s)`);
    assert.ok(r.trocas <= 1, `a cruz piscou ${r.trocas} vezes em 1 s de tremor na borda`);
  });

  it('dado o custo por quadro, então a retícula cabe (varredura dos alvos, consultas de visada e a oclusão do desktop)', async () => {
    const r = await h.play(() => {
      const V = window.RET, G = window.QA.G, MP = window.QA.MP;
      const C = { x: -340, z: 130 };
      /* o pior caso da consulta: a cruz sobre um inimigo VISÍVEL (as quatro
         consultas de visada rodam todas) */
      let tx = C.x, tz = C.z;
      for (let k = 0; k < 8; k++) {
        const b = k * Math.PI / 4;
        V.caso('custo', { sx: C.x - Math.cos(b) * 15, sz: C.z - Math.sin(b) * 15, tx, tz, arma: 'fuzil', quadros: 6 });
        if (G.Reticula.last.motivo === 'inimigo') break;
      }
      const sobre = G.Reticula.last.consultas;
      const N = 300;
      let t0 = performance.now();
      for (let i = 0; i < N; i++) G.reticulaDoQuadro(1 / 60);
      const msSobre = (performance.now() - t0) / N;
      V.mirar(new MP.THREE.Vector3(tx, 30, tz)); // o céu: nada sob a cruz
      t0 = performance.now();
      for (let i = 0; i < N; i++) G.reticulaDoQuadro(1 / 60);
      const msNada = (performance.now() - t0) / N;
      // a oclusão no desktop, com o jogador ANDANDO (a grama reciclada remonta)
      const O = G.Oclusao, at = O.atualizar;
      let ms = 0, n = 0;
      window.QA.reset(0, 0);
      O.atualizar = function () { const a = performance.now(); at.call(O); ms += performance.now() - a; n++; };
      try {
        G.keys.KeyW = true;
        window.QA.tick(240);
      } finally { G.keys.KeyW = false; O.atualizar = at; }
      return { msSobre, msNada, sobre, oclusaoMs: ms / Math.max(1, n), chamadas: n };
    });
    console.log(`  [custo] retícula por quadro: ${r.msNada.toFixed(4)} ms sem nada sob a cruz · ${r.msSobre.toFixed(4)} ms sobre o inimigo ` +
      `(${r.sobre} consultas) · Oclusao.atualizar andando: ${r.oclusaoMs.toFixed(3)} ms/quadro em ${r.chamadas} quadros (desktop)`);
    assert.equal(r.sobre, 4, 'cenário: a cruz não ficou sobre um inimigo visível (as 4 consultas não rodaram)');
    assert.equal(r.chamadas, 240, `a oclusão tem de ser atualizada UMA vez por quadro no desktop (${r.chamadas} em 240)`);
    assert.ok(r.msNada < 0.2, `${r.msNada} ms por quadro sem alvo`);
    assert.ok(r.msSobre < 1, `${r.msSobre} ms por quadro sobre o inimigo`);
    assert.ok(r.oclusaoMs < 3, `${r.oclusaoMs} ms por quadro de oclusão andando`);
  });

  it('dado o caminho, então nenhum erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});

/* O CELULAR (o dono joga nele): a mesma cruz, a mesma régua — e a oclusão
   passa a ter DOIS clientes no quadro (a assistência do toque, ligada por
   padrão, antes do tiro; a retícula, antes do render). Ela tem de rodar UMA
   vez por quadro: duas pagariam o orçamento de rasterização e o da grama em
   dobro. Porta 4082. */
describe('retícula vermelha na tela (celular) — mesma régua, oclusão uma vez por quadro', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, host;
  const PORT_CEL = 4082;
  const V3 = { width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
  before(async () => {
    h = await bootGame({ port: PORT_CEL, query: '?mobile=1', viewport: V3,
      extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '900', GAS_DEFAULT: 'off' } });
    host = await startBRMatch(h, { serverPort: PORT_CEL, flags: { golem: false, ciclo: 'dia' } });
    await h.play(async () => {
      const G = window.QA.G;
      await G.WeaponModels.ready;
      if (G.Car && G.Car.ready) await G.Car.ready;
      for (let i = 0; i < 100 && !(window.__MP_remotePlayers || []).some(r => r.nick === 'BotHost'); i++) await new Promise(r => setTimeout(r, 100));
      await new Promise(r => setTimeout(r, 3000));
    });
    await h.play(instalar);
    await h.play(async () => {
      const O = window.QA.G.Oclusao;
      window.QA.reset(30, 30);
      let estavel = 0, ultimo = -1;
      const t0 = performance.now();
      while (performance.now() - t0 < 90000) {
        window.QA.tick(10);
        await new Promise(r => setTimeout(r, 100));
        const n = O.estado().malhas;
        if (O.pendentes === 0 && n === ultimo && n > 0) { if (++estavel >= 30) break; } else estavel = 0;
        ultimo = n;
      }
    });
  });
  after(async () => { if (host) host.close(); if (h) await h.close(); });

  it('dado o toque com a assistência ligada, então a oclusão roda UMA vez por quadro', async () => {
    const r = await h.play(() => {
      const G = window.QA.G, O = G.Oclusao, at = O.atualizar;
      window.QA.reset(-340, 130);
      let n = 0;
      O.atualizar = function () { n++; return at.call(O); };
      try { window.QA.tick(120); } finally { O.atualizar = at; }
      return { n, assist: !!G.Touch.cfg.assist, touch: !!G.Touch.enabled };
    });
    console.log(`  [celular] toque ${r.touch}, assistência ${r.assist}: ${r.n} atualizações da oclusão em 120 quadros`);
    assert.ok(r.touch && r.assist, 'cenário: o toque com a assistência ligada (o padrão)');
    assert.equal(r.n, 120);
  });

  it('dado o inimigo visível sob a cruz na rua e o escondido atrás do caminhão, então vermelha e branca', async () => {
    const r = await h.play(() => {
      const V = window.RET, G = window.QA.G;
      const C = { x: -340, z: 130 };
      const out = { rua: [], lado: [], caminhao: [] };
      window.QA.reset(C.x, C.z); window.QA.tick(60);
      for (let k = 0; k < 96 && out.rua.length < 4; k++) {
        const r2 = 6 + 6 * Math.floor(k / 12), a = (k % 12) * 0.5236 + r2;
        const tx = C.x + Math.cos(a) * r2, tz = C.z + Math.sin(a) * r2;
        const b = (k % 8) * Math.PI / 4, d = [8, 15, 25, 35][out.rua.length % 4];
        const sx = tx - Math.cos(b) * d, sz = tz - Math.sin(b) * d;
        if (!V.semGrama(sx, sz, tx, tz)) continue;
        const c = V.caso('cel-rua', { sx, sz, tx, tz, arma: 'fuzil', quadros: 6 });
        if (!window.sobACruz(c)) continue;
        out.rua.push(c);
        out.lado.push(V.caso('cel-lado', { sx, sz, tx, tz, arma: 'fuzil', quadros: 12, lado: 1 }));
      }
      for (const v of G.Car.vehicles) {
        if (!/CAMINH/.test(v.cfg.name)) continue;
        const c = v.group.position;
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a);
          out.caminhao.push(V.caso('cel-caminhao', { sx: c.x - ca * 15, sz: c.z - sa * 15, tx: c.x + ca * 2.2, tz: c.z + sa * 2.2, arma: 'fuzil' }));
        }
      }
      return out;
    });
    const brancas = r.rua.filter(c => !c.vermelha), ladoVerm = r.lado.filter(c => c.vermelha);
    const zero = r.caminhao.filter(c => c.px === 0), vaz = r.caminhao.filter(vaza);
    console.log(`  [celular] rua: ${r.rua.length} sob a cruz, ${r.rua.length - brancas.length} vermelhos · 1 m ao lado: ${ladoVerm.length} vermelhos · ` +
      `caminhão: ${r.caminhao.length} casos, ${zero.length} com 0 px, ${vaz.length} vermelhos`);
    assert.ok(r.rua.length >= 3, `cenário: só ${r.rua.length} casos de rua`);
    assert.deepEqual(brancas, [], `celular: inimigo visível sob a cruz e a cruz branca:\n${resumo(brancas)}`);
    assert.deepEqual(ladoVerm, [], `celular: cruz 1 m ao lado e vermelha:\n${resumo(ladoVerm)}`);
    assert.ok(zero.length >= 5, `cenário inválido: só ${zero.length} escondidos pelo caminhão`);
    assert.deepEqual(vaz, [], `celular: a retícula avermelhou sobre quem o caminhão esconde:\n${resumo(vaz)}`);
  });

  it('dado o caminho, então nenhum erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
