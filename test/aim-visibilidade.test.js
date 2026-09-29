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
    veredito(t, listas) {
      const e = new THREE.Euler(0, 0, 0, 'YXZ').setFromQuaternion(cam.quaternion);
      G.Oclusao.atualizar();
      G.AimAssist.reset();
      const q = { dt: 1 / 60, eye: cam.position.clone(), yaw: e.y, pitch: e.x, fov: cam.fov, aspect: cam.aspect,
        inYaw: 0.001, inPitch: 0, strafe: 0, ads: 0, weapon: 'rifle', assist: true, autoFire: true, canFire: true,
        maxRange: scene.fog ? scene.fog.near + (scene.fog.far - scene.fog.near) * 0.5 : 0,
        lists: listas || [window.__MP_remotePlayers] };
      G.AimAssist.step(q); G.AimAssist.step(q);
      const last = G.AimAssist.last;
      return { age: last.target === t, fire: !!last.fire };
    },
    /* lâminas DESENHADAS em volta de (x, z), lidas das matrizes de instância
       dos chunks do js/grass.js — sem passar pela oclusão: é a régua para
       dizer "aqui não há grama" */
    laminasPerto(x, z, raio, hMin) {
      let n = 0;
      scene.traverse(o => {
        if (!o.isInstancedMesh || o.material !== G.Grass.material || !o.visible) return;
        /* a POSIÇÃO do chunk, não a matrixWorld: o fillChunk move o chunk pela
           posição e a matriz só é recomposta no render (o chunk filho da cena,
           sem giro nem escala) */
        const c = o.position, a = o.instanceMatrix.array;
        if (Math.hypot(c.x - x, c.z - z) > 8 + raio) return;      // chunk de 10 m: raízes a até 7,1 m do centro
        for (let k = 0; k < o.count * 16; k += 16) {
          const bx = c.x + a[k + 12], bz = c.z + a[k + 14];
          if (Math.hypot(bx - x, bz - z) < raio && Math.hypot(a[k + 4], a[k + 5], a[k + 6]) > hMin) n++;
        }
      });
      return n;
    },
    /* boneco AGACHADO de teste — frente de postura: cabeça 1,66 → 1,08 m,
       topo do boneco 1,33 m; tronco e pernas na mesma proporção (a conferir
       com o avatar agachado de verdade na integração). Uma caixa DESENHADA
       que contém os centros das três esferas, em extraTargets como alvo de
       combate. */
    agachado: null,
    criarAgachado() {
      if (V.agachado) return V.agachado;
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.33, 0.5), new THREE.MeshStandardMaterial({ color: 0x8a4a2a }));
      m.position.y = 1.33 / 2; g.add(m); scene.add(g);
      const sph = [[1.08, 0.28, 'head'], [0.70, 0.42, 'body'], [0.30, 0.34, 'body']].map(([h, r, part]) => ({ c: new THREE.Vector3(), r, part, h }));
      const t = { group: g, alive: true, enabled: true, combate: true, damage() { return false; },
        hitSpheres() { for (const sp of sph) sp.c.set(g.position.x, g.position.y + sp.h, g.position.z); return sph; } };
      G.extraTargets.push(t);
      return (V.agachado = t);
    },
    /* atirador em (sx, sz) — olho `sdy` acima do normal (−0,58: o agachado,
       1,62 → 1,04 m) —, o agachado em (tx, tz), tapete assentado; cruz no tronco */
    casoAgachado(tag, sx, sz, tx, tz, sdy = 0, quadros = 60) {
      const t = V.criarAgachado(), rp = alvo();
      if (rp) rp.group.visible = false;               // o avatar do BotHost fora do quadro
      G.Env.weather = 'limpo';
      window.QA.reset(sx, sz); window.QA.tick(quadros);
      if (sdy) cam.position.y += sdy;
      t.group.position.set(tx, G.heightAt(tx, tz), tz); t.group.visible = true; t.group.updateMatrixWorld(true);
      const o = eye();
      const c = new THREE.Vector3(tx, t.group.position.y + 0.70, tz).sub(o);
      cam.quaternion.setFromEuler(new THREE.Euler(Math.atan2(c.y, Math.hypot(c.x, c.z)), Math.atan2(-c.x, -c.z), 0, 'YXZ'));
      cam.updateMatrixWorld(true);
      const p = V.px(t);
      const v = V.veredito(t, [G.extraTargets]);
      const O = G.Oclusao, gc = O.gramaCobre;
      O.gramaCobre = () => false;
      let sg;
      try { sg = V.veredito(t, [G.extraTargets]); } finally { O.gramaCobre = gc; }
      /* "nada além da grama na frente", pela linha de visada do tiro e pelo
         que a tela desenha — sem passar pela regra de grama do núcleo */
      const olho = cam.position, livres = t.hitSpheres().filter(sp => {
        const d = sp.c.clone().sub(olho), L = d.length();
        return !(MP.rayBlockedAt(olho, d.normalize(), L) < L - sp.r) && !O.tampa(olho, sp.c, sp.r, t.group);
      }).length;
      t.group.visible = false;
      if (rp) rp.group.visible = true;
      return { tag, dist: +c.length().toFixed(1), px: p.px, age: v.age, fire: v.fire, ageSemGrama: sg.age, fireSemGrama: sg.fire, livres,
        atirador: [+sx.toFixed(2), +sz.toFixed(2)], alvo: [+tx.toFixed(2), +tz.toFixed(2)] };
    },
    /* um caso: atirador em (x, z) com o olho `dy` acima do normal, alvo em
       (x, z), cruz no centro do tronco dele. `quadros` depois do salto: 12
       deixa o tapete de grama pela METADE (o js/grass.js recicla 3 chunks
       por quadro no celular, 169 chunks); 60 o assenta. */
    caso(tag, sx, sz, sdy, tx, tz, quadros = 12) {
      const t = alvo();
      G.Env.weather = 'limpo';
      window.QA.reset(sx, sz); window.QA.tick(quadros);
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
      const O = G.Oclusao, tampa = O.tampa, gramaCobre = O.gramaCobre;
      O.tampa = () => false;
      let base, semGrama;
      try { base = V.veredito(t); } finally { O.tampa = tampa; }
      // e só sem a camada de GRAMA (a regra de antes: grama só no pé do alvo)
      O.gramaCobre = () => false;
      try { semGrama = V.veredito(t); } finally { O.gramaCobre = gramaCobre; }
      let quem = null;
      if (p.px > 0 && !v.age && base.age) {
        for (const s of t.hitSpheres()) if (tampa(cam.position, s.c, s.r, t.group)) { quem = O.quemTampou(); break; }
      }
      return { tag, dist: +c.length().toFixed(1), px: p.px, caixa: p.caixa, age: v.age, fire: v.fire, ageBase: base.age,
        ageSemGrama: semGrama.age, fireSemGrama: semGrama.fire,
        quem, atirador: [+sx.toFixed(2), +sz.toFixed(2), sdy], alvo: [+tx.toFixed(2), +tz.toFixed(2)] };
    },
  };
}

const vaza = c => c.px === 0 && (c.age || c.fire);
/* quanto da assistência em alvo VISÍVEL a camada de grama pode tirar. É o
   preço de "0 px ⇒ 0 efeito" na grama: a lâmina que passa a 2–4 cm da linha
   (a tolerância do vento calculado) conta como cobrindo. Medido com o tapete
   assentado, mesmas sementes: varredura 26 de 31 (antes 31, com 5 de 40
   escondidos assistidos), rente à crista 1–2 de 7 (antes 7, com 8–9 de 11
   escondidos assistidos). Teto aqui para pegar regressão, não meta. */
const LIMITE_PERDA_GRAMA = 0.4;
// o mesmo caso com a linha de visada ANTIGA (só `rayBlockedAt`): a régua de antes, no mesmo quadro
const vaza_antes = c => c.px === 0 && c.ageBase;
const resumo = cs => cs.map(c => `${c.tag} ${c.dist} m px=${c.px}/${c.caixa} assist=${c.age} (antes ${c.ageBase}) auto=${c.fire} ` +
  `atirador=${c.atirador} alvo=${c.alvo}${c.quem ? ' tampou: ' + JSON.stringify(c.quem) : ''}`).join('\n');

describe('A2/A8 na tela — assistência e automático só em quem a tela mostra', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, host;
  before(async () => {
    h = await bootGame({ port: PORT, query: '?mobile=1', viewport: V3,
      extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '900', GAS_DEFAULT: 'off' } });
    /* DIA fixo (a flag `ciclo` da sala) e céu limpo a cada caso: a âncora de
       pixels conta diferença de cor, e à noite ou na chuva (névoa mais perto)
       o mesmo alvo visível dá menos pixels — o arquivo inteiro leva ~10 min,
       mais que um dia do jogo (480 s), e a varredura caía na noite */
    /* SEM a destruição da cidade: é mecânica do servidor cronometrada por
       relógio de PAREDE (90 s após o início) e a cinemática dela toma a
       câmera. Caía no meio da varredura conforme o setup demorasse mais ou
       menos — 61 de 130 casos medidos com a câmera da cinemática, a 200 m de
       altura, e o controle ia de 24 para 0 alvos visíveis. */
    host = await startBRMatch(h, { serverPort: PORT, flags: { golem: false, ciclo: 'dia', cidade: false } });
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

  /* OS CASOS NOVOS VÊM PRIMEIRO, e não é estética: as varreduras de baixo
     saltam o jogador centenas de vezes com 12 quadros cada, e o js/grass.js
     enfileira 169 chunks a cada salto e refaz 3 por quadro — depois delas o
     tapete em volta do atirador é de SALTOS ANTERIORES (medido: 0 chunks a
     30 m do jogador depois de 60 quadros). Grama velha na tela e na camada
     não exercita nada. */
  /* A2 — A GRAMA NO CAMINHO. O laudo 6aeda6c achou 1 de 33 (alvo a 37,5 m
     atrás de uma crista, 0 px, assistência agindo); reproduzido com a âncora
     de pixels: escondendo a grama, 24 px — era a grama EM CIMA DA CRISTA. O
     caso só aparece com o tapete de grama ASSENTADO em volta do atirador: a
     varredura acima mede 12 quadros depois do salto, e o js/grass.js recicla
     3 chunks por quadro no celular (169 chunks, 57 quadros). Aqui: 60. Mesma
     LCG do laudo, e mais os casos RENTE À CRISTA (a distância em que a linha
     até o centro da cabeça passa 0,02–0,25 m acima do chão entre os dois — o
     terreno sozinho não a tampa, a grama de cima da crista talvez; escolhidos
     pelo terreno, julgados pela tela). Dois vereditos no MESMO
     quadro: o produto, e o produto com a camada de grama desligada. */
  it('dada a GRAMA no caminho (tapete assentado, crista gramada), então 0 px ⇒ sem assistência e sem tiro', async () => {
    const r = await h.play(() => {
      const V = window.VIS, G = window.QA.G, MP = window.QA.MP;
      let seed = 12345;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const casos = [];
      for (let i = 0; i < 160; i++) {
        const px = (rnd() * 2 - 1) * 480, pz = (rnd() * 2 - 1) * 480;
        if (G.heightAt(px, pz) < 0.5) continue;
        const a = rnd() * Math.PI * 2, d = 8 + rnd() * 70;
        casos.push(V.caso('varredura', px, pz, 0, px + Math.cos(a) * d, pz + Math.sin(a) * d, 60));
      }
      // rente à crista: a folga da linha olho → centro da cabeça sobre o terreno
      const folga = (o, tx, tz) => {
        const hy = G.heightAt(tx, tz) + 1.66, dx = tx - o.x, dy = hy - o.y, dz = tz - o.z, L = Math.hypot(dx, dy, dz);
        let f = Infinity;
        for (let k = 1; k < L - 1; k += 0.25) { const u = k / L; f = Math.min(f, o.y + dy * u - G.heightAt(o.x + dx * u, o.z + dz * u)); }
        return f;
      };
      seed = 777;
      let crista = 0;
      for (let tent = 0; crista < 60 && tent < 1200; tent++) {
        const px = (rnd() * 2 - 1) * 450, pz = (rnd() * 2 - 1) * 450;
        if (G.heightAt(px, pz) < 0.5) continue;
        const a = rnd() * Math.PI * 2;
        /* o olho sem teleportar: salto sem quadros deixa chunks de grama por
           repreencher (o js/grass.js enfileira 169 a cada salto e refaz 3 por
           quadro) e o tapete fica velho para os casos seguintes */
        const o = { x: px, y: MP.groundAt(px, pz, 999) + 1.62, z: pz };
        let achou = null;
        for (let d = 10; d <= 70 && !achou; d += 1.5) {
          const tx = px + Math.cos(a) * d, tz = pz + Math.sin(a) * d, f = folga(o, tx, tz);
          if (f > 0.02 && f < 0.25) achou = [tx, tz];
        }
        if (!achou) continue;
        crista++;
        casos.push(V.caso('crista', px, pz, 0, achou[0], achou[1], 60));
      }
      return casos;
    });
    const zero = r.filter(c => c.px === 0), vaz = r.filter(vaza);
    const vazSemGrama = r.filter(c => c.px === 0 && (c.ageSemGrama || c.fireSemGrama));
    // CONTROLE: visível (> 200 px) e assistido com a grama ignorada → continua
    const base = r.filter(c => c.px > 200 && c.ageSemGrama), perdidos = base.filter(c => !c.age);
    // A8(e) na fiação do jogo: o jogador remoto é alvo de COMBATE — o automático dispara nele
    const tiroVisivel = r.filter(c => c.px > 200 && c.dist <= 60 && c.age && c.fire);
    console.log(`  [grama no caminho] ${r.length} casos (${r.filter(c => c.tag === 'crista').length} rente à crista), ` +
      `${zero.length} com 0 px: ${vaz.length} vazamentos agora, ${vazSemGrama.length} com a grama ignorada · ` +
      `controle: ${base.length} visíveis assistidos sem grama, ${base.length - perdidos.length} com ela · ` +
      `automático no jogador remoto visível: ${tiroVisivel.length}`);
    if (vazSemGrama.length) console.log('  [grama no caminho] o que a grama esconde e só ela:\n' + resumo(vazSemGrama));
    if (perdidos.length) console.log('  [grama no caminho] perdidos:\n' + resumo(perdidos));
    assert.ok(zero.length >= 20, `cenário inválido: só ${zero.length} casos escondidos`);
    /* quantos o tapete esconde SOZINHO varia com o vento e a hora do jogo (0 a
       5 medidos na mesma varredura); quem garante que a camada é exercitada é
       o caso do AGACHADO no mato, abaixo, e os casos de núcleo */
    assert.deepEqual(vaz, [], `a assistência/automático agiu em quem a tela não mostra:\n${resumo(vaz)}`);
    assert.ok(base.length >= 20, `cenário: só ${base.length} alvos visíveis assistidos`);
    assert.ok(perdidos.length <= base.length * LIMITE_PERDA_GRAMA,
      `a camada de grama tirou a assistência de ${perdidos.length} de ${base.length} alvos VISÍVEIS:\n${resumo(perdidos)}`);
    assert.ok(tiroVisivel.length >= 10, `o automático disparou em só ${tiroVisivel.length} jogadores remotos visíveis (fiação do combate)`);
  });

  /* AGACHADO (frente de postura): a regra de altura da grama (parte ≥ 1,33 m
     do chão) deixava o agachado — cabeça a 1,08 m — invisível para a
     assistência EM TODO LUGAR: sem grama nenhuma, corpo 100 % visível, 0 de 8
     rumos. Na RUA da cidade (sem lâmina desenhada, conferido nos chunks do
     js/grass.js), ele tem de ser assistido; no MATO, 0 px ⇒ 0 efeito. */
  it('dado um alvo AGACHADO na rua (sem grama) e no mato, então é assistido onde aparece e nunca onde a tela não mostra', async () => {
    const r = await h.play(() => {
      const V = window.VIS, G = window.QA.G;
      const out = { rua: [], mato: [] };
      // a rua: em volta do centro da cidade, sem lâmina de 10 cm a 2 m do caminho
      const C = { x: -340, z: 130 };
      const livre = (sx, sz, tx, tz) => {
        const L = Math.hypot(tx - sx, tz - sz);
        for (let k = 0; k <= L; k += 1.5) if (V.laminasPerto(sx + (tx - sx) * k / L, sz + (tz - sz) * k / L, 2, 0.1) > 0) return false;
        return true;
      };
      for (let r2 = 8; r2 <= 50 && out.rua.length < 8; r2 += 7) for (let a = 0; a < 12 && out.rua.length < 8; a++) {
        const tx = C.x + Math.cos(a * 0.5236) * r2, tz = C.z + Math.sin(a * 0.5236) * r2;
        for (let k = 0; k < 8; k++) {
          const b = k * Math.PI / 4, sx = tx - Math.cos(b) * 16, sz = tz - Math.sin(b) * 16;
          if (Math.hypot(sx - C.x, sz - C.z) > 58) continue;
          // o tapete assentado em volta do atirador, e só então a régua da grama
          window.QA.reset(sx, sz); window.QA.tick(60);
          if (!livre(sx, sz, tx, tz)) continue;
          const c = V.casoAgachado('rua', sx, sz, tx, tz, 0, 2);
          if (c.px < 200) continue;
          out.rua.push(c);
          break;
        }
      }
      // o mato: de um atirador aleatório, o alvo onde a grama DESENHADA é alta e densa
      let seed = 4242;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      out.tentativas = 0;
      {
        const S = window.__BR_debug && window.__BR_debug.S, MP = window.QA.MP;
        window.QA.reset(0, 0); window.QA.tick(60);
        let perto = 0;
        MP.scene.traverse(o => { if (o.isInstancedMesh && o.material === G.Grass.material && Math.hypot(o.position.x, o.position.z) < 30) perto++; });
        out.estado = { fase: S && S.phase, started: G.state.started, morto: MP.player.dead, espectador: !!window.__BR_espectador,
          cinematica: !!G.state.cinematic, chunksPerto: perto };
      }
      for (let i = 0; i < 120 && out.mato.length < 40; i++) {
        const px = (rnd() * 2 - 1) * 450, pz = (rnd() * 2 - 1) * 450, a0 = rnd() * Math.PI * 2;
        if (G.heightAt(px, pz) < 0.5) continue;
        out.tentativas++;
        window.QA.reset(px, pz); window.QA.tick(60);
        let achou = null;
        for (let k = 0; k < 12 && !achou; k++) for (const d of [10, 16, 24]) {
          const a = a0 + k * Math.PI / 6, tx = px + Math.cos(a) * d, tz = pz + Math.sin(a) * d;
          if (V.laminasPerto(tx, tz, 1.5, 0.6) >= 25) { achou = [tx, tz]; break; }
        }
        if (!achou) continue;
        out.mato.push(V.casoAgachado('mato', px, pz, achou[0], achou[1], 0, 2));
        // e o atirador AGACHADO também (olho a 1,04 m: a linha atravessa o mato)
        out.mato.push(V.casoAgachado('mato-agachado', px, pz, achou[0], achou[1], -0.58, 2));
      }
      return out;
    });
    /* a rua conta só onde o resto do mundo deixa: as três partes com o tiro
       livre e nada desenhado na frente — o caso é sobre a GRAMA */
    const rua = r.rua.filter(c => c.livres === 3), ruaSem = rua.filter(c => !c.age);
    const mato = r.mato, matoZero = mato.filter(c => c.px === 0), matoVaz = mato.filter(vaza);
    const soGrama = matoZero.filter(c => c.ageSemGrama || c.fireSemGrama);   // 0 px e SÓ a grama o esconde
    console.log(`  [agachado] rua: ${r.rua.length} casos visíveis sem grama (${rua.length} sem outro oclusor), ${rua.length - ruaSem.length} assistidos · ` +
      `mato: ${mato.length} casos, ${matoZero.length} com 0 px (${matoVaz.length} com efeito; ${soGrama.length} em que só a grama esconde), ` +
      `${mato.filter(c => c.px > 0).length} aparecendo, ${mato.filter(c => c.px > 0 && c.age).length} assistidos ` +
      `(${r.tentativas} atiradores tentados; estado ${JSON.stringify(r.estado)})`);
    if (ruaSem.length) console.log('  [agachado] rua sem assistência:\n' + resumo(ruaSem));
    assert.ok(rua.length >= 4, `cenário inválido: só ${rua.length} lugares de rua com o agachado visível, sem grama no caminho e sem outro oclusor (${r.rua.length} visíveis)`);
    assert.deepEqual(ruaSem, [], `o agachado VISÍVEL na rua, sem grama, ficou sem assistência:\n${resumo(ruaSem)}`);
    /* medido: no mato alto deste mapa o agachado quase nunca some da tela
       (39 de 40 aparecem, a 10–24 m, atirador em pé ou agachado) — e a camada
       não prova nenhuma linha livre entre as lâminas: 0 assistidos, o mesmo
       que a regra de altura dava. O que se cobra aqui é o absoluto: 0 px ⇒ 0
       efeito. A camada é exercitada lâmina a lâmina nos casos de núcleo
       (test/aim-oclusao-core.test.js). */
    assert.ok(mato.length >= 20, `cenário inválido: só ${mato.length} agachados no mato alto`);
    assert.deepEqual(matoVaz, [], `a assistência/automático agiu no agachado que o mato esconde:\n${resumo(matoVaz)}`);
  });

  /* A camada de grama calcula o VENTO do vertex shader em JS
     (js/oclusao.js, ventoGrama) para saber onde cada lâmina está naquele
     instante. Se a conta divergir do GPU, a camada erra de lugar — e erro de
     lugar é vazamento. A régua é o PRÓPRIO texto do shader do material da
     grama, compilado de novo aqui num shader de fragmento, lido de volta em
     float32: 256 pontos do mapa e instantes. */
  it('dado o vento da grama, então a conta em JS bate com o GPU (o texto do shader do material)', async () => {
    const r = await h.play(() => {
      const G = window.QA.G, MP = window.QA.MP, THREE = MP.THREE, R = MP.renderer;
      const src = G.Grass.material.vertexShader;
      const fns = src.slice(src.indexOf('float hash12'), src.indexOf('// dobra a lamina'));
      const w1 = /float w1 = [^;]+;/.exec(src)[0].replace('wpos.xz', 'wxz');
      const w2 = /float w2 = [^;]+;/.exec(src)[0].replace('wpos.xz', 'wxz');
      const N = 16, data = new Float32Array(N * N * 4);
      let seed = 99;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const tJogo = G.Grass.material.uniforms.uTime.value;
      for (let i = 0; i < N * N; i++) {
        data[4 * i] = (rnd() * 2 - 1) * 480; data[4 * i + 1] = (rnd() * 2 - 1) * 480;
        data[4 * i + 2] = i % 4 === 0 ? tJogo + rnd() * 5 : rnd() * 3000;
      }
      const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.FloatType);
      tex.needsUpdate = true;
      const rt = new THREE.WebGLRenderTarget(N, N, { type: THREE.FloatType, format: THREE.RGBAFormat,
        minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
      const mat = new THREE.ShaderMaterial({ uniforms: { uIn: { value: tex } },
        vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: `uniform sampler2D uIn;\n${fns}\nvoid main(){ vec4 v = texelFetch(uIn, ivec2(gl_FragCoord.xy), 0);\n` +
          `vec2 wxz = v.xy; float uTime = v.z;\n${w1}\n${w2}\ngl_FragColor = vec4((w1 - 0.5) * 1.7 + (w2 - 0.5) * 0.55, 0.0, 0.0, 1.0); }` });
      const sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
      const out = new Float32Array(N * N * 4);
      const antes = R.getRenderTarget();
      R.setRenderTarget(rt); R.render(sc, cam); R.readRenderTargetPixels(rt, 0, 0, N, N, out); R.setRenderTarget(antes);
      let max = 0, pior = null;
      for (let i = 0; i < N * N; i++) {
        const js = G.Oclusao.ventoGrama(data[4 * i], data[4 * i + 1], data[4 * i + 2]);
        const d = Math.abs(js - out[4 * i]);
        if (d > max) { max = d; pior = [data[4 * i], data[4 * i + 1], data[4 * i + 2], out[4 * i], js]; }
      }
      rt.dispose(); tex.dispose(); mat.dispose();
      return { max, pior, amostra: [out[0], G.Oclusao.ventoGrama(data[0], data[1], data[2])], faixa: [Math.min(...out.filter((_, i) => i % 4 === 0)), Math.max(...out.filter((_, i) => i % 4 === 0))] };
    });
    console.log(`  [vento] GPU × JS em 256 pontos: diferença máxima ${r.max.toExponential(2)} (faixa do vento no GPU ${r.faixa.map(n => n.toFixed(3)).join(' a ')})` +
      (r.pior ? ` · pior em ${JSON.stringify(r.pior.map(n => +n.toFixed(4)))}` : ''));
    assert.ok(r.faixa[1] - r.faixa[0] > 0.5, `cenário: o GPU devolveu um vento sem variação (${r.faixa})`);
    assert.ok(r.max <= 0.01, `a conta do vento em JS diverge do GPU em ${r.max} (a folga de js/oclusao.js é 0,02)`);
  });

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
    /* 12 quadros depois de cada salto (a condição do laudo) deixam o tapete
       de grama pela metade, e quanto dele aparece depende de quantos saltos
       vieram antes (o js/grass.js enfileira 169 chunks por salto e refaz 3 por
       quadro): medido de 11 a 29 alvos visíveis assistidos nesta varredura.
       A mesma LCG com o tapete assentado é a do caso da GRAMA NO CAMINHO. */
    assert.ok(base.length >= 10, `cenário: só ${base.length} alvos visíveis assistidos antes`);
    assert.ok(perdidos.length <= base.length * 0.1,
      `a oclusão tirou a assistência de ${perdidos.length} de ${base.length} alvos VISÍVEIS:\n${resumo(perdidos)}`);
  });

  it('dado o custo por quadro, então a oclusão cabe no celular (raios com teto, microssegundos por raio, memória)', async () => {
    const r = await h.play(() => {
      const G = window.QA.G, MP = window.QA.MP, O = G.Oclusao;
      const antes = O.estado();
      // um quadro de pior caso: 3 candidatos × 3 esferas = 9 raios, a 5–70 m (tapete de grama assentado)
      window.QA.reset(30, 30); window.QA.tick(60);
      const cam = MP.camera.position, P = { x: 0, y: 0, z: 0 };
      let t = performance.now();
      for (let i = 0; i < 2700; i++) {
        const a = i * 2.399, d = 5 + (i % 66);
        P.x = cam.x + Math.cos(a) * d; P.z = cam.z + Math.sin(a) * d; P.y = G.heightAt(P.x, P.z) + 1.66;
        O.tampa(cam, P, 0.28);
      }
      const msQuadro = (performance.now() - t) / 300;
      /* a GRAMA: a assistência só pergunta a ela pela parte que poria o alvo
         à vista — as mesmas 9 linhas por quadro são o pior caso, e metade
         delas na altura do tronco (dentro do tapete) */
      O.atualizar();
      t = performance.now();
      let cobertas = 0;
      for (let i = 0; i < 2700; i++) {
        const a = i * 2.399, d = 5 + (i % 66);
        P.x = cam.x + Math.cos(a) * d; P.z = cam.z + Math.sin(a) * d; P.y = G.heightAt(P.x, P.z) + (i % 2 ? 1.66 : 1.1);
        if (O.gramaCobre(cam, P, 0.28)) cobertas++;
      }
      const gramaQuadro = (performance.now() - t) / 300;
      t = performance.now();
      for (let i = 0; i < 300; i++) O.atualizar();
      const atualizarMs = (performance.now() - t) / 300;
      const e = O.estado();
      return { msQuadro, gramaQuadro, cobertas, atualizarMs, kb: antes.kb, gramaKb: e.gramaKb, gramaMontagemMs: e.gramaMs / Math.max(1, e.gramaMontagens) };
    });
    console.log(`  [custo] 9 raios/quadro: ${r.msQuadro.toFixed(3)} ms · grama, 9 linhas/quadro: ${r.gramaQuadro.toFixed(3)} ms ` +
      `(${r.cobertas} de 2700 cobertas) · atualizar parado: ${r.atualizarMs.toFixed(3)} ms · memória das grades: ${r.kb} KB + ` +
      `grama ${r.gramaKb} KB · montagem de um chunk de grama: ${r.gramaMontagemMs.toFixed(3)} ms (desktop; celular ~4–5× o tempo)`);
    assert.ok(r.gramaQuadro < 1, `${r.gramaQuadro} ms por quadro de 9 linhas na grama`);
    assert.ok(r.gramaKb < 6144, `${r.gramaKb} KB de camada de grama`);
    assert.ok(r.msQuadro < 1, `${r.msQuadro} ms por quadro de 9 raios`);
    assert.ok(r.atualizarMs < 0.5, `${r.atualizarMs} ms por atualizar parado`);
    assert.ok(r.kb < 8192, `${r.kb} KB de grade`);
  });

  it('dado o caminho, então nenhum erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
