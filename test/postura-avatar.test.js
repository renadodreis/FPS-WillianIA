/* ================================================================
   POSTURA NA TELA — o boneco remoto agacha de verdade, fica menor para
   quem atira e aparece MENOS no mato (medido: não some — ver o caso).

   Caminho medido, ponta a ponta, com o servidor real:
   - o jogador da página agacha (tecla) → o `state` leva `crouch` → o outro
     jogador (o BotHost do harness) recebe no `playerUpdate`;
   - o BotHost manda `crouch` → o servidor repassa → o boneco dele NA PÁGINA
     abaixa: cabeça, topo do modelo e esferas de acerto, medidos no desenho;
   - a grama: ÂNCORA INDEPENDENTE de pixels — o MESMO quadro desenhado com e
     sem o boneco (os pixels que mudam na caixa dele) e, de novo, com a grama
     escondida. `sem grama` diz quanto do boneco a tela mostraria; `com grama`,
     quanto ela mostra. O nome flutuante entra na conta (é o que um humano vê).
   - a assistência de mira (js/aimassist.js, NÃO editada aqui) é só observada
     no agachado escondido e no agachado sem grama — relatório, não trava.

   Porta 4050. Celular (?mobile=1, V3 844×390, DPR 2): é onde o dono joga.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness.js');

const PORT = 4050;
const V3 = { width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function instalar() {
  const G = window.QA.G, MP = window.QA.MP, THREE = MP.THREE, cam = MP.camera;
  const renderer = MP.renderer, scene = MP.scene, gl = renderer.getContext();
  for (const e of G.Enemies.list) { e.alive = false; if (e.group) e.group.visible = false; }
  const r0 = window.QA.reset;
  window.QA.reset = function (...a) { r0.apply(this, a); MP.player.invulnUntil = 1e12; };
  const alvo = () => (window.__MP_remotePlayers || []).find(r => r.nick === 'BotHost');
  const cw = renderer.domElement.width, ch = renderer.domElement.height;
  const buf1 = new Uint8Array(cw * ch * 4), buf2 = new Uint8Array(cw * ch * 4);
  const gramas = () => { const o = []; scene.traverse(m => { if (m.isInstancedMesh && m.material === G.Grass.material) o.push(m); }); return o; };
  /* as malhas do CORPO (sem nome flutuante, paraquedas e silhueta da arma) */
  const corpo = t => {
    const out = [];
    t.group.traverse(o => {
      if (!o.isMesh || o.isSprite) return;
      for (let p = o; p && p !== t.group; p = p.parent) if (p === t.body.chute || p === t.body.weapon) return;
      out.push(o);
    });
    return out;
  };
  const caixaDe = (malhas) => {
    const b = new THREE.Box3(), tmp = new THREE.Box3();
    for (const m of malhas) { m.updateWorldMatrix(true, false); if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); tmp.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); b.union(tmp); }
    return b;
  };
  /* a CABEÇA desenhada: a caixa 0,40 × 0,38 × 0,38 do boneco voxel */
  const cabeca = t => corpo(t).find(m => m.geometry.parameters && Math.abs(m.geometry.parameters.width - 0.4) < 1e-6
    && Math.abs(m.geometry.parameters.height - 0.38) < 1e-6);
  const tronco = t => corpo(t).find(m => m.geometry.parameters && Math.abs(m.geometry.parameters.width - 0.56) < 1e-6);

  /* O SERVIDOR NÃO ACEITA O TELEPORTE DO TESTE: cada salto de dezenas de
     metros vira ~11 `state` recusados e 11 "strikes" do anti-teleporte — e
     acima de 120 ele EXPULSA a página (medido: na metade da varredura a página
     já estava fora da partida e o quadro desenhava outra coisa). Toda função
     que teleporta o jogador o devolve, no mesmo avaliar, ao lugar que o
     servidor aceitou: o `setInterval` do `state` nunca vê o salto. */
  const casa = { x: MP.player.pos.x, z: MP.player.pos.z };
  const V = window.POSTURA = {
    alvo, gramas, casa,
    voltar() { window.QA.reset(casa.x, casa.z); },
    /* medidas do boneco NO DESENHO, relativas ao pé */
    medir() {
      const t = alvo();
      t.group.updateMatrixWorld(true);
      const pe = t.group.position.y;
      const cab = new THREE.Box3().setFromObject(cabeca(t));
      const tro = new THREE.Box3().setFromObject(tronco(t));
      const topo = caixaDe(corpo(t)).max.y - pe;
      const sph = t.hitSpheres().map(s => ({ c: s.c.clone(), r: s.r, part: s.part }));
      const dentro = (p, b, folga) => p.x >= b.min.x - folga && p.x <= b.max.x + folga && p.y >= b.min.y - folga
        && p.y <= b.max.y + folga && p.z >= b.min.z - folga && p.z <= b.max.z + folga;
      return {
        crouch: t.crouch, topo: +topo.toFixed(3),
        cabecaY: +(cab.getCenter(new THREE.Vector3()).y - pe).toFixed(3),
        esferaCabecaY: +(sph[0].c.y - pe).toFixed(3),
        esferaCorpoY: +(sph[1].c.y - pe).toFixed(3),
        esferaPernaY: +(sph[2].c.y - pe).toFixed(3),
        // o centro de cada esfera cai DENTRO da peça desenhada que ela representa
        cabecaDentro: dentro(sph[0].c, cab, 0.02),
        corpoDentro: dentro(sph[1].c, tro, 0.02),
        // o topo da esfera da cabeça não passa do topo do desenho (a esfera
        // acima do modelo já custou A2 — docs/mobile/validacao-6aeda6c.md)
        esferaCabecaTopo: +(sph[0].c.y + sph[0].r - pe).toFixed(3),
        nomeVisivel: t.group.children.some(o => o.isSprite && o.visible && o.material.opacity > 0.02),
      };
    },
    /* ÂNCORA: pixels que mudam na caixa projetada do alvo entre dois renders do
       mesmo quadro, com e sem ele. `nome`: conta o nome flutuante junto. */
    px(t, { nome = true } = {}) {
      const sprites = [];
      if (!nome) t.group.traverse(o => { if (o.isSprite && o.visible) { sprites.push(o); o.visible = false; } });
      cam.updateMatrixWorld(true);
      t.group.updateMatrixWorld(true);
      const b = caixaDe(corpo(t));
      if (nome) b.expandByPoint(new THREE.Vector3(t.group.position.x, t.group.position.y + 2.5, t.group.position.z));
      b.expandByScalar(0.3);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < 8; i++) {
        const v = new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(cam);
        if (v.z > 1) continue;
        const px = (v.x + 1) / 2 * cw, py = (v.y + 1) / 2 * ch;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(cw - 1, Math.ceil(x1)); y1 = Math.min(ch - 1, Math.ceil(y1));
      let n = 0;
      if (x1 >= x0 && y1 >= y0) {
        const w = x1 - x0 + 1, hh = y1 - y0 + 1;
        t.group.visible = true; renderer.render(scene, cam); gl.readPixels(x0, y0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, buf1);
        t.group.visible = false; renderer.render(scene, cam); gl.readPixels(x0, y0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, buf2);
        t.group.visible = true;
        for (let i = 0; i < w * hh * 4; i += 4)
          if (Math.abs(buf1[i] - buf2[i]) + Math.abs(buf1[i + 1] - buf2[i + 1]) + Math.abs(buf1[i + 2] - buf2[i + 2]) > 6) n++;
      }
      for (const s of sprites) s.visible = true;
      return n;
    },
    /* a assistência de mira REAL (núcleo + visada do jogo), cruz no centro do
       tronco do alvo, dedo mexendo, fuzil — o mesmo veredito de
       test/aim-visibilidade.test.js */
    assiste(t) {
      const e = new THREE.Euler(0, 0, 0, 'YXZ').setFromQuaternion(cam.quaternion);
      G.Oclusao.atualizar();
      G.AimAssist.reset();
      const q = { dt: 1 / 60, eye: cam.position.clone(), yaw: e.y, pitch: e.x, fov: cam.fov, aspect: cam.aspect,
        inYaw: 0.001, inPitch: 0, strafe: 0, ads: 0, weapon: 'rifle', assist: true, autoFire: true, canFire: true,
        maxRange: scene.fog ? scene.fog.near + (scene.fog.far - scene.fog.near) * 0.5 : 0,
        lists: [window.__MP_remotePlayers] };
      G.AimAssist.step(q); G.AimAssist.step(q);
      return G.AimAssist.last.target === t;
    },
    /* um quadro: atirador a `d` m do alvo no rumo `rumo`, olhando para o
       tronco dele; o alvo na posição T (onde o servidor o põe) */
    quadro(T, d, rumo) {
      const t = alvo();
      const sx = T.x + d * Math.sin(rumo), sz = T.z + d * Math.cos(rumo);
      window.QA.reset(sx, sz); window.QA.tick(40); // a grama em volta do atirador enche
      const y = G.heightAt(T.x, T.z);
      t.group.position.set(T.x, y, T.z); t.targetPos.set(T.x, y, T.z); t.lastPos.set(T.x, y, T.z);
      t.alive = true; t.group.visible = true; t.group.updateMatrixWorld(true);
      cam.updateMatrixWorld(true);
      const o = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
      const c = new THREE.Vector3(T.x, y + 0.8, T.z).sub(o);
      cam.quaternion.setFromEuler(new THREE.Euler(Math.atan2(c.y, Math.hypot(c.x, c.z)), Math.atan2(-c.x, -c.z), 0, 'YXZ'));
      cam.updateMatrixWorld(true);
      // visada livre do olho ao alvo (tronco): sem árvore/rocha/estrutura no meio
      const dir = new THREE.Vector3(T.x, y + 1.0, T.z).sub(o), len = dir.length();
      const livre = MP.rayBlockedAt(o, dir.normalize(), len) >= len - 0.3;
      const gs = gramas();
      const com = V.px(t), comCorpo = V.px(t, { nome: false });
      const assistComGrama = V.assiste(t);
      for (const g of gs) g.visible = false;
      const sem = V.px(t), semCorpo = V.px(t, { nome: false });
      const assistSemGrama = V.assiste(t);
      for (const g of gs) g.visible = true;
      V.voltar();
      return { d, rumo: +(rumo / Math.PI * 180).toFixed(0), livre, com, sem, comCorpo, semCorpo, assistComGrama, assistSemGrama };
    },
    /* lugar de campo aberto com grama cheia: fora da cidade, do vulcão, da
       água e do deserto, chão quase plano, e lâminas de pé em volta (a amostra
       do próprio pedaço de grama carregado) */
    acharCampo() {
      const cands = [];
      for (let r = 60; r <= 420; r += 30) for (let a = 0; a < 360; a += 20) {
        const x = 30 + r * Math.sin(a * Math.PI / 180), z = 30 + r * Math.cos(a * Math.PI / 180);
        if (Math.abs(x) > 480 || Math.abs(z) > 480) continue;
        if (G.heightAt(x, z) < MP.WATER_LEVEL + 1.5 || MP.slopeAt(x, z) > 0.12) continue;
        cands.push({ x, z });
      }
      for (const T of cands) {
        window.QA.reset(T.x + 20, T.z); window.QA.tick(40);
        const s = G.Grass.debugSample(T.x, T.z, 2000) || [];
        const perto = s.filter(b => Math.hypot(b.x - T.x, b.z - T.z) < 3);
        if (perto.length < 150) continue;
        const altas = perto.filter(b => b.sy > 0.6).length / perto.length;
        if (altas < 0.95) continue;
        V.voltar();
        return { ...T, laminas: perto.length, altas: +altas.toFixed(3) };
      }
      V.voltar();
      return null;
    },
  };
}

describe('Postura na tela — o boneco remoto agacha, encolhe para quem atira e aparece menos no mato', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, host, T;
  const hostState = (extra) => host.emit('state', { rotY: 0, ...extra });
  before(async () => {
    h = await bootGame({ port: PORT, query: '?mobile=1', viewport: V3,
      extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '900', GAS_DEFAULT: 'off' } });
    host = await startBRMatch(h, { serverPort: PORT, flags: { golem: false } });
    await h.play(async () => {
      const G = window.QA.G;
      await G.WeaponModels.ready;
      for (let i = 0; i < 100 && !(window.__MP_remotePlayers || []).some(r => r.nick === 'BotHost'); i++) await new Promise(r => setTimeout(r, 100));
      await new Promise(r => setTimeout(r, 2000));
    });
    await h.play(instalar);
    T = await h.play(() => window.POSTURA.acharCampo());
    assert.ok(T, 'nenhum campo aberto com grama cheia encontrado');
    /* leva o BotHost até o campo ANDANDO (≤ 50 m/s, abaixo do anti-teleporte
       do servidor): é o servidor quem diz onde ele está */
    const ini = await h.play(() => { const t = window.POSTURA.alvo(); return { x: t.targetPos.x, z: t.targetPos.z }; });
    const passos = Math.ceil(Math.hypot(T.x - ini.x, T.z - ini.z) / 4.5);
    const alturas = await h.play((ini, T, n) => Array.from({ length: n + 1 }, (_, i) => {
      const k = i / n; return window.QA.G.heightAt(ini.x + (T.x - ini.x) * k, ini.z + (T.z - ini.z) * k);
    }), ini, T, passos);
    for (let i = 0; i <= passos; i++) {
      const k = i / passos;
      hostState({ pos: [ini.x + (T.x - ini.x) * k, alturas[i], ini.z + (T.z - ini.z) * k], crouch: 0 });
      await sleep(100);
    }
    T.y = alturas[passos];
    await h.page.waitForFunction((T) => {
      const t = (window.__MP_remotePlayers || []).find(r => r.nick === 'BotHost');
      return t && Math.hypot(t.targetPos.x - T.x, t.targetPos.z - T.z) < 0.5;
    }, { timeout: 20000 }, T);
    console.log(`  [campo] (${T.x.toFixed(1)}, ${T.z.toFixed(1)}): ${T.laminas} lâminas a < 3 m, ${(T.altas * 100).toFixed(1)} % acima de 0,6 m`);
  });
  after(async () => { if (host) host.close(); if (h) await h.close(); });

  /* manda a postura pelo servidor (parado no campo) e espera o boneco da
     página chegar nela */
  async function posturaDoHost(crouch) {
    for (let i = 0; i < 6; i++) { hostState({ pos: [T.x, T.y, T.z], crouch }); await sleep(100); }
    await h.page.waitForFunction(c => {
      const t = (window.__MP_remotePlayers || []).find(r => r.nick === 'BotHost');
      return t && Number.isFinite(t.crouch) && Math.abs(t.crouch - c) < 0.005;
    }, { timeout: 10000 }, crouch);
  }

  it('o jogador da página agacha → o outro recebe crouch no playerUpdate; levanta → 0', async () => {
    const pageId = await h.play(() => window.__MP.socket.id);
    const vistos = [];
    const on = d => { if (d && d.id === pageId) vistos.push(d.crouch); };
    host.on('playerUpdate', on);
    try {
      // no lugar que o servidor aceitou (a casa): o state sai e é repassado
      await h.play(() => { window.POSTURA.voltar(); window.QA.G.keys.ControlLeft = true; });
      await sleep(1500);
      const agachado = vistos.slice(-3);
      await h.play(() => { window.QA.G.keys.ControlLeft = false; });
      await sleep(1500);
      const dePe = vistos.slice(-3);
      assert.ok(agachado.length === 3 && agachado.every(c => c >= 0.99), `agachado chegou como ${JSON.stringify(agachado)}`);
      assert.ok(dePe.length === 3 && dePe.every(c => c === 0), `em pé chegou como ${JSON.stringify(dePe)}`);
    } finally {
      host.off('playerUpdate', on);
      await h.play(() => { window.QA.G.keys.ControlLeft = false; });
    }
  });

  it('o boneco remoto agacha no desenho: cabeça −0,58 m, topo ≤ 1,33 m, esferas descem junto e ficam dentro do corpo', async () => {
    await posturaDoHost(0);
    const emPe = await h.play(() => window.POSTURA.medir());
    await posturaDoHost(1);
    const agachado = await h.play(() => window.POSTURA.medir());
    await posturaDoHost(0);
    const volta = await h.play(() => window.POSTURA.medir());
    console.log(`  [em pé]    ${JSON.stringify(emPe)}\n  [agachado] ${JSON.stringify(agachado)}\n  [levantou] ${JSON.stringify(volta)}`);
    // em pé: o boneco de sempre (cabeça 1,66, topo do capacete 1,91)
    assert.ok(Math.abs(emPe.cabecaY - 1.66) < 0.01 && Math.abs(emPe.topo - 1.91) < 0.01, `em pé mudou: ${JSON.stringify(emPe)}`);
    // agachado: a cabeça desce os mesmos 0,58 m do olho (1,62 → 1,04 no game.js)
    assert.ok(Math.abs((emPe.cabecaY - agachado.cabecaY) - 0.58) < 0.01, `a cabeça desceu ${(emPe.cabecaY - agachado.cabecaY).toFixed(3)} m (olho: 0,58)`);
    // e o boneco inteiro fica abaixo do topo da lâmina mais alta (1,4 × 0,95 = 1,33 m)
    assert.ok(agachado.topo <= 1.335, `topo do boneco agachado a ${agachado.topo} m, acima da grama (1,33)`);
    // esferas de acerto: descem junto e ficam na peça desenhada
    assert.ok(Math.abs((emPe.esferaCabecaY - agachado.esferaCabecaY) - 0.58) < 0.02,
      `esfera da cabeça desceu ${(emPe.esferaCabecaY - agachado.esferaCabecaY).toFixed(3)} m`);
    assert.ok(agachado.esferaCorpoY < emPe.esferaCorpoY - 0.4, `esfera do corpo não desceu: ${agachado.esferaCorpoY} × ${emPe.esferaCorpoY}`);
    for (const m of [emPe, agachado]) {
      assert.ok(m.cabecaDentro, `centro da esfera da cabeça fora da cabeça desenhada (crouch ${m.crouch})`);
      assert.ok(m.corpoDentro, `centro da esfera do corpo fora do tronco desenhado (crouch ${m.crouch})`);
    }
    /* a esfera da cabeça (r 0,28) já passa 3 cm do capacete EM PÉ (1,94 × 1,91 —
       a esfera maior que a cabeça do laudo 6aeda6c, A2). Agachar não pode
       piorar isso: o excesso agachado é o mesmo de em pé. */
    const excesso = m => m.esferaCabecaTopo - m.topo;
    assert.ok(excesso(agachado) <= excesso(emPe) + 0.005,
      `agachado, a esfera da cabeça passa ${excesso(agachado).toFixed(3)} m do topo (em pé: ${excesso(emPe).toFixed(3)} m)`);
    // levantou: tudo de volta
    assert.ok(Math.abs(volta.cabecaY - emPe.cabecaY) < 0.005 && Math.abs(volta.topo - emPe.topo) < 0.005, 'não voltou a ficar em pé');
    // o nome flutuante não denuncia quem está agachado (ele ficaria acima da grama)
    assert.equal(emPe.nomeVisivel, true, 'controle: em pé o nome aparece');
    assert.equal(agachado.nomeVisivel, false, 'o nome flutuante continua aparecendo sobre quem está agachado');
  });

  /* O QUE A GRAMA FAZ COM QUEM AGACHA — medido, não suposto.
     A premissa era "agachar abaixo do topo da lâmina esconde". O topo da
     lâmina MAIS alta é 1,33 m, mas a lâmina média tem 0,97 m (js/grass.js:
     altura uniforme em 0,62–1,33 m) e afunila até 1,8 cm na ponta: a cabeça
     do agachado (0,89–1,33 m) fica na faixa em que quase só pontas passam.
     Medido a 30 m, 8 rumos: em pé ~58 % do corpo aparece no mato, agachado
     ~32 % — metade, e NUNCA zero. Afundar o boneco mais 0,4 m (cabeça a
     0,68 m) ainda deixa 16,5 % à mostra (sonda da rodada, fora do teste).
     Por isso o caso trava o que é verdade e não pode regredir: agachado
     mostra MENOS que em pé em todo rumo limpo, a tela mostra o boneco sem a
     grama (a âncora: quem esconde é a grama, não um boneco sumido), o nome
     flutuante não o entrega, e a assistência não gruda em quem a grama cobre
     quase inteiro. A 60 m a grama já está no desbotamento da borda do tapete
     (46,8–63 m do olho): só relatório. */
  it('mato alto: agachado aparece MENOS que em pé (não some); o nome não o entrega; a assistência não gruda no coberto', async () => {
    const rumos = [0, 45, 90, 135, 180, 225, 270, 315].map(a => a * Math.PI / 180);
    const medir = async (crouch) => {
      await posturaDoHost(crouch);
      const out = [];
      for (const d of [30, 60]) for (const r of rumos) out.push(await h.play((T, d, r) => window.POSTURA.quadro(T, d, r), T, d, r));
      return out;
    };
    const emPe = await medir(0), agach = await medir(1);
    await posturaDoHost(0);
    const linhas = emPe.map((p, i) => {
      const a = agach[i];
      return `${p.d} m ${String(p.rumo).padStart(3)}° livre=${p.livre} | em pé ${p.com}/${p.sem} px (corpo ${p.comCorpo}/${p.semCorpo}) assist ${p.assistComGrama} | ` +
        `agachado ${a.com}/${a.sem} px (corpo ${a.comCorpo}/${a.semCorpo}) assist ${a.assistComGrama} (sem grama ${a.assistSemGrama})`;
    });
    console.log('  [grama] com grama / sem grama\n  ' + linhas.join('\n  '));
    const soma = (xs, k) => xs.reduce((a, x) => a + x[k], 0);
    for (const d of [30, 60]) {
      const p = emPe.filter(x => x.d === d), a = agach.filter(x => x.d === d);
      console.log(`  [${d} m] corpo visível no mato: em pé ${soma(p, 'comCorpo')}/${soma(p, 'semCorpo')} px ` +
        `(${(100 * soma(p, 'comCorpo') / soma(p, 'semCorpo')).toFixed(1)} %), agachado ${soma(a, 'comCorpo')}/${soma(a, 'semCorpo')} px ` +
        `(${(100 * soma(a, 'comCorpo') / soma(a, 'semCorpo')).toFixed(1)} %); assistência no agachado: ${a.filter(x => x.assistComGrama).length}/8 com grama, ` +
        `${a.filter(x => x.assistSemGrama).length}/8 sem grama; no em pé: ${p.filter(x => x.assistComGrama).length}/8`);
    }
    // rumo limpo: nada entre o olho e o alvo, e os dois aparecem SEM grama (âncora)
    const v30 = emPe.map((p, i) => [p, agach[i]]).filter(([p, a]) => p.d === 30 && p.livre && p.semCorpo >= 30 && a.semCorpo >= 20);
    assert.ok(v30.length >= 6, `poucos rumos limpos a 30 m para medir: ${v30.length}`);
    for (const [p, a] of v30) {
      const fp = p.comCorpo / p.semCorpo, fa = a.comCorpo / a.semCorpo;
      assert.ok(fa < fp, `30 m ${p.rumo}°: agachado mostra ${(100 * fa).toFixed(0)} % no mato, em pé ${(100 * fp).toFixed(0)} %`);
      assert.ok(a.comCorpo < p.comCorpo, `30 m ${p.rumo}°: agachado ${a.comCorpo} px ≥ em pé ${p.comCorpo} px`);
    }
    const totP = soma(v30.map(x => x[0]), 'comCorpo') / soma(v30.map(x => x[0]), 'semCorpo');
    const totA = soma(v30.map(x => x[1]), 'comCorpo') / soma(v30.map(x => x[1]), 'semCorpo');
    assert.ok(totA <= 0.7 * totP, `30 m: agachado mostra ${(100 * totA).toFixed(1)} % contra ${(100 * totP).toFixed(1)} % em pé — agachar quase não esconde`);
    for (const a of agach) {
      // o nome flutuante (2,35 m) não denuncia quem agachou: com e sem ele, o mesmo
      assert.equal(a.com, a.comCorpo, `${a.d} m ${a.rumo}°: o nome flutuante apareceu sobre o agachado (${a.com} × ${a.comCorpo} px)`);
      // quem a grama cobre quase inteiro não recebe assistência
      if (a.comCorpo <= 0.1 * a.semCorpo) assert.equal(a.assistComGrama, false, `${a.d} m ${a.rumo}°: assistência grudou no agachado coberto`);
    }
  });

  it('boot limpo: sem erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
