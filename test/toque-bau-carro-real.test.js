/* ================================================================
   BAÚ E CARRO NO CAMINHO REAL DO CELULAR — "os baús não estavam abrindo
   no celular" e "nem estavam conseguindo entrar e sair do carro" (relato
   do dono, que joga no celular).

   O QUE ESTE ARQUIVO NÃO FAZ, e é o motivo de ele existir: nenhum
   `QA.tick` (o laço do jogo roda SOZINHO no rAF, como no aparelho), nenhum
   teleporte, nenhum `startBRMatch` (que pula a nave de propósito), nenhum
   `PointerEvent` montado à mão. O dedo é o `Input.dispatchTouchEvent` do
   DevTools — o mesmo caminho do toque de verdade no Chrome: gera pointer,
   touch e o `click` do gesto. O jogador chega aos lugares PELO ANALÓGICO.

   Viewport: Galaxy S22 do dono em paisagem, 780×360 CSS, DPR 3.

   O DEFEITO QUE ESTE ARQUIVO PEGOU (medido, BR de verdade):
   os 4 baús do SOLO (`Structures.chestSpots`: praça do spawn, cidade e as
   duas bases militares) continuavam DESENHADOS no Battle Royale, com o
   mesmo modelo do baú de saque do BR — e no BR nenhum deles abre
   (`js/interact.js` recusa baú no BR: "loot vem dos baús BR"). Cada um fica
   a 6–11 m de um veículo, justamente onde o jogador pousa. Ao lado do
   caminhão da base, o baú desenhado mais perto do caminhão era o falso
   (6,4 m, contra 9,2 m do baú de verdade): o jogador chegava a 1 m dele e o
   USAR não aparecia nunca, e tocar o lugar não abria nada.

   AS SUSPEITAS QUE FORAM MEDIDAS E CAÍRAM (refutar com número também é
   entrega): (1) USAR contextual — acende ≤ 1 quadro depois do #prompt e o
   centro dele é ele mesmo (elementFromPoint) em 17 viewports, de 568×320 a
   1180×820 e em retrato 360–412 de largura; (2) troca de veículo soltando o
   toque (C10) — entrar e sair pelo USAR funcionou no BR e no solo, inclusive
   com o polegar parado no analógico e com CPU 4× mais lenta e render ligado
   (26 quadros/s); (3) mousedown de compatibilidade engolido (C5) — o toque no
   USAR gera pointerdown → keydown KeyE → pointerup → keyup → click, sem
   mousedown; o USAR não depende dele.

   ÂNCORA INDEPENDENTE DO PRODUTO: o baú é achado no GRAFO DA CENA pela
   geometria do modelo (o que a tela desenha), não pela lista de baús do BR
   nem pelo `__BR_bauPerto`; "abriu" é a TAMPA daquele baú desenhado girar;
   "entrou no carro" é o CARRO andar com o dedo.

   Porta 4070 (BR) e 4071 (solo).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');

const PORT_BR = 4070;
const PORT_SOLO = 4071;
const S22 = { width: 780, height: 360, hasTouch: true, isMobile: true, deviceScaleFactor: 3 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- o DEDO: DevTools Input.dispatchTouchEvent, um ponto por evento (é
   como o puppeteer faz multitoque; cada ponto tem seu id) ---- */
function criarDedos(page, cdp) {
  const vivos = new Map();
  const um = (type, p) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: [{ x: Math.round(p.x), y: Math.round(p.y), id: p.id, radiusX: 5, radiusY: 5, force: 1 }] });
  return {
    async down(id, x, y) { const p = { id, x, y }; vivos.set(id, p); await um('touchStart', p); },
    async move(id, x, y) { const p = vivos.get(id); p.x = x; p.y = y; await um('touchMove', p); },
    async up(id) { const p = vivos.get(id); if (!p) return; vivos.delete(id); await um('touchEnd', p); },
    async tap(id, x, y) { await this.down(id, x, y); await sleep(80); await this.up(id); },
    async soltarTudo() { for (const id of [...vivos.keys()]) await this.up(id); },
  };
}

/* ---- sonda na página: SÓ LEITURA (nada escreve em estado do jogo) ---- */
function instalarSonda() {
  const G = window.__game, MP = window.__MP;
  /* baú de referência FORA da cena: só para conhecer as geometrias do modelo
     (cacheadas e compartilhadas por todo baú — js/chestmodel.js). O modelo
     roda em noSeed: não consome o sorteio do mundo. */
  const ref = G.buildChest();
  const geoBau = new Set(), geoTampa = new Set();
  ref.group.traverse(o => { if (o.isMesh) geoBau.add(o.geometry); });
  ref.lid.traverse(o => { if (o.isMesh) geoTampa.add(o.geometry); });
  const noGrafo = o => { for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p === MP.scene) return true; } return false; };
  function bausDesenhados() {
    const raizes = new Set();
    MP.scene.traverse(o => {
      if (!o.isMesh || !geoBau.has(o.geometry)) return;
      let r = o; while (r.parent && r.parent !== MP.scene) r = r.parent;
      if (r.parent === MP.scene) raizes.add(r);
    });
    return [...raizes].filter(noGrafo);
  }
  function tampa(raiz) {
    let lid = null;
    raiz.traverse(o => { if (!lid && o.isMesh && geoTampa.has(o.geometry)) lid = o; });
    while (lid && lid.parent && lid.parent !== raiz) lid = lid.parent;
    return lid ? lid.rotation.x : NaN;
  }
  const btn = act => document.querySelector(`#tcBtns .tcBtn[data-act="${act}"]`);
  function centro(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  /* o botão está NA TELA: visível e o que está debaixo do centro dele é ele */
  function naTela(act) {
    const el = btn(act); if (!el) return false;
    const cs = getComputedStyle(el); if (cs.visibility !== 'visible' || cs.display === 'none') return false;
    const c = centro(el), hit = document.elementFromPoint(c.x, c.y);
    return !!hit && (hit === el || el.contains(hit));
  }
  /* rumo do analógico para chegar num ponto do mundo, relativo ao que a
     CÂMERA mostra (matrixWorld do quadro desenhado) */
  function rumo(x, z) {
    const P = MP.player.pos, m = MP.camera.matrixWorld.elements;
    let rx = m[0], rz = m[2], fx = -m[8], fz = -m[10];
    const rl = Math.hypot(rx, rz) || 1, fl = Math.hypot(fx, fz) || 1;
    rx /= rl; rz /= rl; fx /= fl; fz /= fl;
    const dx = x - P.x, dz = z - P.z, a = dx * rx + dz * rz, f = dx * fx + dz * fz, L = Math.hypot(a, f) || 1;
    return { a: a / L, f: f / L, d: Math.hypot(dx, dz) };
  }
  /* o AVISO de interação (#prompt, e no BR a dica do baú em #brHint) está
     aceso e é ELE que recebe o dedo no centro dele */
  function avisoTocavel(id) {
    const el = document.getElementById(id); if (!el) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility !== 'visible' || +cs.opacity < 0.5) return null;
    const c = centro(el), hit = document.elementFromPoint(c.x, c.y);
    return { ...c, meu: !!hit && (hit === el || el.contains(hit)), txt: el.textContent };
  }
  window.__TR = { bausDesenhados, tampa, btn, centro, naTela, rumo, avisoTocavel, G, MP,
    stick: () => centro(document.getElementById('tcMove')),
    fase: () => (window.__BR_debug ? window.__BR_debug.S.phase : null) };
}

/* anda pelo ANALÓGICO até (x, z) — o alvo é lido de novo a cada passo */
async function andarAte(h, dedos, alvo, { perto = 1.4, ms = 25000, id = 11, raio = 52 } = {}) {
  const st = await h.play(() => window.__TR.stick());
  await dedos.down(id, st.x, st.y);
  const t0 = Date.now();
  let r = null;
  try {
    while (Date.now() - t0 < ms) {
      r = await h.play(a => window.__TR.rumo(a.x, a.z), alvo);
      if (r.d < perto) break;
      const k = r.d < 3 ? 0.55 : 1;   // perto do alvo, meio curso: não passa do ponto
      await dedos.move(id, st.x + r.a * raio * k, st.y - r.f * raio * k);
      await sleep(70);
    }
  } finally { await dedos.up(id); }
  return r;
}

describe('BR no celular pelo caminho real — nave, pouso, analógico, USAR', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, bot, cdp, dedos, pulse;
  before(async () => {
    h = await bootGame({ port: PORT_BR, query: '?mobile=1', viewport: S22, autoStart: false });
    cdp = await h.page.target().createCDPSession();
    dedos = criarDedos(h.page, cdp);
    await h.play(instalarSonda);
    /* anfitrião: um socket que entra no lobby e inicia (o mesmo caminho do
       botão de iniciar de outro jogador). A página NÃO é forçada a fase
       nenhuma: nave → pulo → queda → pouso são do jogo. */
    const { io } = require('socket.io-client');
    await h.page.waitForFunction('window.__MP && window.__MP.socket && window.__MP.socket.connected', { timeout: 30000 });
    await h.page.waitForFunction('window.__BR_debug && window.__BR_debug.S && window.__BR_debug.S.phase === "LOBBY"' +
      ' && window.__MP_init && window.__MP_init.id === window.__MP.socket.id', { timeout: 60000 });
    bot = io(`http://localhost:${PORT_BR}`, { transports: ['websocket'] });
    await new Promise(r => bot.once('init', r));
    bot.emit('hello', { nick: 'BotHost' });
    await new Promise((res, rej) => bot.timeout(4000).emit('claimHost', { code: 'QUEDALIVRE' },
      (e, d) => (e || !d || !d.ok) ? rej(new Error('claimHost falhou')) : res()));
    pulse = setInterval(() => { if (bot.connected) bot.emit('state', { pos: [60, 2, 60], rotY: 0 }); }, 5000);
    bot.emit('requestStart');
    await h.page.waitForFunction('window.__BR_debug.S.phase === "SHIP"', { timeout: 60000 });
  });
  after(async () => {
    if (pulse) clearInterval(pulse);
    if (dedos) await dedos.soltarTudo().catch(() => {});
    if (bot) bot.close();
    if (h) await h.close();
  });

  /* estado compartilhado entre os casos (é UMA partida, em ordem) */
  const cena = {};

  it('dada a nave, então o ⇧ pula perto da base militar e o analógico pilota a queda até o caminhão', async () => {
    /* o caminhão de base militar que a rota da nave cruza mais perto: veículo
       com baú do lado, onde o jogador pousa — o caso do relato */
    const alvo = await h.play(() => {
      const G = window.__game;
      return G.Car.vehicles.filter(c => /CAMINH/.test(c.cfg.name))
        .map(c => ({ i: G.Car.vehicles.indexOf(c), x: c.group.position.x, z: c.group.position.z }));
    });
    assert.ok(alvo.length >= 1, 'cenário inválido: nenhum caminhão no mapa');
    /* espera a nave passar o mais perto de um caminhão e pula pelo ⇧ */
    let melhor = null, antes = Infinity;
    const t0 = Date.now();
    while (Date.now() - t0 < 50000) {
      const p = await h.play(() => { const P = window.__MP.player.pos; return { x: P.x, z: P.z, f: window.__TR.fase() }; });
      if (p.f !== 'SHIP') break;
      let d = Infinity, c = null;
      for (const a of alvo) { const dd = Math.hypot(a.x - p.x, a.z - p.z); if (dd < d) { d = dd; c = a; } }
      if (d > antes + 0.5 && antes < 160) { melhor = c; break; }
      if (d < antes) { antes = d; melhor = c; }
      await sleep(200);
    }
    const pulo = await h.play(() => window.__TR.centro(window.__TR.btn('jump')));
    await dedos.tap(1, pulo.x, pulo.y);
    await h.page.waitForFunction('window.__BR_debug.S.phase !== "SHIP"', { timeout: 5000 });
    cena.carro = melhor;
    /* queda: o analógico aponta para o caminhão até pousar */
    const st = await h.play(() => window.__TR.stick());
    await dedos.down(2, st.x, st.y);
    const t1 = Date.now();
    while (Date.now() - t1 < 60000) {
      const r = await h.play(c => ({ ...window.__TR.rumo(c.x + 3, c.z + 3), fase: window.__TR.fase() }), melhor);
      if (r.fase !== 'FALL') break;
      const k = r.d < 6 ? 0.3 : 1;
      await dedos.move(2, st.x + r.a * 52 * k, st.y - r.f * 52 * k);
      await sleep(80);
    }
    await dedos.up(2);
    const pouso = await h.play(c => ({ d: window.__TR.rumo(c.x, c.z).d, fase: window.__TR.fase() }), melhor);
    console.log(`  [queda] pulou a ${antes.toFixed(0)} m do caminhão; pousou a ${pouso.d.toFixed(1)} m dele (${pouso.fase})`);
    assert.equal(pouso.fase, 'PLAY', `a queda não terminou em PLAY (${pouso.fase})`);
    assert.ok(pouso.d < 40, `pousou longe demais do caminhão para o cenário (${pouso.d.toFixed(1)} m)`);
  });

  it('dado o baú DESENHADO mais perto do caminhão, então andar até ele pelo analógico acende o USAR e tocar o USAR abre a tampa', async () => {
    assert.ok(cena.carro, 'cenário inválido: a queda não escolheu caminhão');
    const bau = await h.play(c => {
      const T = window.__TR;
      let best = null, bd = Infinity;
      for (const b of T.bausDesenhados()) {
        const d = Math.hypot(b.position.x - c.x, b.position.z - c.z);
        if (d < bd) { bd = d; best = b; }
      }
      window.__trBau = best;
      return best ? { x: best.position.x, z: best.position.z, dCarro: bd, tampa: T.tampa(best), total: T.bausDesenhados().length } : null;
    }, cena.carro);
    assert.ok(bau, 'cenário inválido: nenhum baú desenhado na cena');
    console.log(`  [baú] ${bau.total} baús desenhados; o mais perto do caminhão está a ${bau.dCarro.toFixed(1)} m dele`);
    const chegou = await andarAte(h, dedos, { x: bau.x, z: bau.z }, { perto: 1.3 });
    await sleep(250);   // ~15 quadros parado: o botão contextual tem ≤ 1 quadro
    const antes = await h.play(() => ({ usar: window.__TR.naTela('use'), tampa: window.__TR.tampa(window.__trBau) }));
    const u = await h.play(() => window.__TR.centro(window.__TR.btn('use')));
    await dedos.tap(3, u.x, u.y);
    let depois = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 2500) {
      depois = await h.play(() => ({ tampa: window.__TR.tampa(window.__trBau) }));
      if (depois.tampa < -0.5) break;
      await sleep(100);
    }
    console.log(`  [baú] chegou a ${chegou.d.toFixed(2)} m; USAR ${antes.usar ? 'na tela' : 'FORA da tela'}; ` +
      `tampa ${antes.tampa.toFixed(2)} → ${depois.tampa.toFixed(2)} rad`);
    assert.ok(chegou.d < 2.0, `o analógico não levou o jogador ao baú (${chegou.d.toFixed(2)} m)`);
    assert.equal(antes.usar, true, `a ${chegou.d.toFixed(2)} m de um baú desenhado e o USAR não está na tela`);
    assert.ok(depois.tampa < -0.5, `tocou o USAR ao lado do baú e a tampa ficou em ${depois.tampa.toFixed(2)} rad (não abriu)`);
  });

  /* O AVISO É O BOTÃO. No celular a pessoa toca no que está escrito no meio
     da tela ("USAR — ABRIR BAÚ"), não no botão do canto — e a dica não
     respondia a toque (#hud é pointer-events: none). Relato do dono: "os baús
     não estavam abrindo no celular". */
  it('dado o próximo baú, então tocar a DICA "ABRIR BAÚ" (não o botão) abre a tampa', async () => {
    const bau = await h.play(() => {
      const T = window.__TR, P = window.__MP.player.pos;
      let best = null, bd = Infinity;
      const S = window.__game.Structures;
      for (const b of T.bausDesenhados()) {
        if (T.tampa(b) < -0.5) continue;               // já aberto
        const d = Math.hypot(b.position.x - P.x, b.position.z - P.z);
        // o jogador é POSTO ao lado (abaixo): não precisa de caminho livre nem de estar perto
        if (d < bd) { bd = d; best = b; }
      }
      window.__trBau2 = best;
      window.__trBausFechados = T.bausDesenhados().filter(b => T.tampa(b) > -0.5)
        .map(b => ({ d: +Math.hypot(b.position.x - P.x, b.position.z - P.z).toFixed(1),
          livre: !S.segBlocked({ x: P.x, y: P.y + 1, z: P.z }, { x: b.position.x, y: b.position.y + 1, z: b.position.z }) }))
        .sort((a, b) => a.d - b.d).slice(0, 6);
      return best ? { x: best.position.x, z: best.position.z, d: bd, lista: window.__trBausFechados } : null;
    });
    assert.ok(bau, 'cenário inválido: nenhum baú fechado desenhado');
    /* ESTE caso mede o TOQUE na dica, não a caminhada (o caso anterior já
       leva o jogador ao baú pelo analógico). O próximo baú fechado fica a
       ~45 m e um obstáculo baixo segura a reta aos 31 m — o jogador é posto
       ao lado dele (a abertura é validada pelo servidor, sem distância) */
    const volta = await h.play(() => { const P = window.__MP.player.pos; return [P.x, P.y, P.z]; });
    await h.play(b => {
      const P = window.__MP.player.pos;
      P.set(b.x + 1, window.__MP.heightAt(b.x + 1, b.z) + 0.05, b.z);
      window.__MP.player.vel.set(0, 0, 0);
    }, bau);
    const chegou = await andarAte(h, dedos, { x: bau.x, z: bau.z }, { perto: 1.3, ms: 5000, id: 12 });
    await sleep(400);
    const aviso = await h.play(() => window.__TR.avisoTocavel('brHint'));
    assert.ok(aviso && /ABRIR BA/.test(aviso.txt), `a ${chegou.d.toFixed(2)} m do baú e a dica não está acesa: ${JSON.stringify(aviso)}`);
    await dedos.tap(7, aviso.x, aviso.y);
    let tampa = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 2500) {
      tampa = await h.play(() => window.__TR.tampa(window.__trBau2));
      if (tampa < -0.5) break;
      await sleep(100);
    }
    // devolve o jogador ao lado do caminhão: o caso seguinte parte de lá
    await h.play(v => { window.__MP.player.pos.set(v[0], v[1], v[2]); window.__MP.player.vel.set(0, 0, 0); }, volta);
    await sleep(300);
    console.log(`  [dica do baú] chegou a ${chegou.d.toFixed(2)} m; dica recebe o dedo: ${aviso.meu}; tampa ${tampa.toFixed(2)} rad`);
    assert.equal(aviso.meu, true, 'a dica do baú está acesa mas não recebe o dedo');
    assert.ok(tampa < -0.5, `tocou a dica "ABRIR BAÚ" e a tampa ficou em ${tampa.toFixed(2)} rad`);
  });

  it('dado o caminhão, então o USAR entra, um dedo novo no analógico dirige, e o USAR sai', async () => {
    const c = cena.carro;
    assert.ok(c, 'cenário inválido: sem caminhão');
    /* chega pelo lado do caminhão (a 3 m do centro, no rumo de onde o jogador está) */
    const lado = await h.play(cc => {
      const P = window.__MP.player.pos, v = window.__game.Car.vehicles[cc.i].group.position;
      const dx = P.x - v.x, dz = P.z - v.z, L = Math.hypot(dx, dz) || 1;
      return { x: v.x + dx / L * 3, z: v.z + dz / L * 3 };
    }, c);
    const chegou = await andarAte(h, dedos, lado, { perto: 0.9 });
    await sleep(250);
    const antes = await h.play(cc => ({ usar: window.__TR.naTela('use'),
      d: window.__MP.player.pos.distanceTo(window.__game.Car.vehicles[cc.i].group.position) }), c);
    const u = await h.play(() => window.__TR.centro(window.__TR.btn('use')));
    await dedos.tap(4, u.x, u.y);
    await sleep(400);
    const dentro = await h.play(cc => {
      const G = window.__game, v = G.Car.vehicles[cc.i].group.position;
      return { dirigindo: !!G.state.driving, p: [v.x, v.z] };
    }, c);
    /* dirige: dedo NOVO no analógico, pra frente, 2 s */
    const st = await h.play(() => window.__TR.stick());
    await dedos.down(5, st.x, st.y);
    await dedos.move(5, st.x, st.y - 52);
    await sleep(2000);
    const andou = await h.play(cc => {
      const v = window.__game.Car.vehicles[cc.i].group.position;
      return Math.hypot(v.x - cc.p[0], v.z - cc.p[1]);
    }, { i: c.i, p: dentro.p });
    await dedos.up(5);
    await sleep(600);
    const u2 = await h.play(() => ({ ...window.__TR.centro(window.__TR.btn('use')), naTela: window.__TR.naTela('use') }));
    await dedos.tap(6, u2.x, u2.y);
    await sleep(400);
    const fora = await h.play(() => !window.__game.state.driving);
    console.log(`  [carro] chegou a ${antes.d.toFixed(2)} m do centro (USAR ${antes.usar ? 'na tela' : 'FORA'}); ` +
      `entrou: ${dentro.dirigindo}; andou ${andou.toFixed(1)} m em 2 s; USAR para sair ${u2.naTela ? 'na tela' : 'FORA'}; saiu: ${fora}`);
    assert.ok(chegou.d < 1.5, `o analógico não levou o jogador ao lado do caminhão (${chegou.d.toFixed(2)} m)`);
    assert.equal(antes.usar, true, `a ${antes.d.toFixed(2)} m do caminhão e o USAR não está na tela`);
    assert.equal(dentro.dirigindo, true, 'tocou o USAR ao lado do caminhão e não entrou');
    assert.ok(andou > 3, `dentro do caminhão, o analógico não dirigiu (${andou.toFixed(2)} m em 2 s)`);
    assert.equal(u2.naTela, true, 'dirigindo, o USAR para sair não está na tela');
    assert.equal(fora, true, 'tocou o USAR dirigindo e não saiu');
  });

  it('dado o percurso, então nenhum erro de página apareceu', () => {
    assert.deepEqual(h.pageErrors, [], `erros de página: ${h.pageErrors.join(' | ')}`);
  });
});

describe('SOLO no celular pelo caminho real — menu por toque, analógico até o carro, USAR', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, dedos;
  before(async () => {
    h = await bootGame({ port: PORT_SOLO, query: '?mobile=1', viewport: S22, autoStart: false, online: false });
    const cdp = await h.page.target().createCDPSession();
    dedos = criarDedos(h.page, cdp);
    await h.play(instalarSonda);
    /* o SOLO do menu, tocado */
    const b = await h.play(() => window.__TR.centro(document.getElementById('btnNew')));
    await dedos.tap(1, b.x, b.y);
    await h.page.waitForFunction('window.__game.state.started && !window.__game.state.paused', { timeout: 15000 });
    await h.play(() => { for (const e of window.__game.Enemies.list) { e.alive = false; if (e.group) e.group.visible = false; } });
  });
  after(async () => {
    if (dedos) await dedos.soltarTudo().catch(() => {});
    if (h) await h.close();
  });

  it('dado o carro mais perto do spawn, então o USAR entra e sai — com o polegar ainda no analógico', async () => {
    const c = await h.play(() => {
      const G = window.__game, n = G.Car.nearest(window.__MP.player.pos);
      window.__trCarro = n.v;
      const v = n.v.group.position, P = window.__MP.player.pos;
      const dx = P.x - v.x, dz = P.z - v.z, L = Math.hypot(dx, dz) || 1;
      return { x: v.x + dx / L * 3, z: v.z + dz / L * 3, d: n.d };
    });
    /* chega sem soltar o polegar: o dedo fica PARADO no centro do analógico */
    const st = await h.play(() => window.__TR.stick());
    await dedos.down(20, st.x, st.y);
    let r = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      r = await h.play(a => window.__TR.rumo(a.x, a.z), c);
      if (r.d < 0.9) break;
      const k = r.d < 3 ? 0.55 : 1;
      await dedos.move(20, st.x + r.a * 52 * k, st.y - r.f * 52 * k);
      await sleep(70);
    }
    await dedos.move(20, st.x, st.y);
    await sleep(250);
    const usarAntes = await h.play(() => window.__TR.naTela('use'));
    const u = await h.play(() => window.__TR.centro(window.__TR.btn('use')));
    await dedos.tap(21, u.x, u.y);
    await sleep(400);
    const entrou = await h.play(() => !!window.__game.state.driving);
    await dedos.up(20);
    await sleep(300);
    const usarDentro = await h.play(() => window.__TR.naTela('use'));
    await dedos.tap(22, u.x, u.y);
    await sleep(400);
    const saiu = await h.play(() => !window.__game.state.driving);
    console.log(`  [solo] a ${r.d.toFixed(2)} m do ponto ao lado do carro: USAR ${usarAntes ? 'na tela' : 'FORA'}; ` +
      `entrou ${entrou}; USAR dirigindo ${usarDentro ? 'na tela' : 'FORA'}; saiu ${saiu}`);
    assert.equal(usarAntes, true, 'ao lado do carro e o USAR não está na tela');
    assert.equal(entrou, true, 'tocou o USAR com o polegar no analógico e não entrou');
    assert.equal(usarDentro, true, 'dirigindo, o USAR não está na tela');
    assert.equal(saiu, true, 'tocou o USAR dirigindo e não saiu');
  });

  it('dado o carro, então tocar o AVISO "ENTRAR" (não o botão) entra — e o aviso "SAIR" sai', async () => {
    const c = await h.play(() => {
      const G = window.__game, n = G.Car.nearest(window.__MP.player.pos);
      const v = n.v.group.position, P = window.__MP.player.pos;
      const dx = P.x - v.x, dz = P.z - v.z, L = Math.hypot(dx, dz) || 1;
      return { x: v.x + dx / L * 3, z: v.z + dz / L * 3 };
    });
    const chegou = await andarAte(h, dedos, c, { perto: 0.9, id: 30 });
    await sleep(300);
    const a1 = await h.play(() => window.__TR.avisoTocavel('prompt'));
    assert.ok(a1 && /ENTRAR/.test(a1.txt), `a ${chegou.d.toFixed(2)} m do carro e o aviso ENTRAR não está aceso: ${JSON.stringify(a1)}`);
    await dedos.tap(31, a1.x, a1.y);
    await sleep(400);
    const entrou = await h.play(() => !!window.__game.state.driving);
    await sleep(300);
    const a2 = await h.play(() => window.__TR.avisoTocavel('prompt'));
    if (a2) await dedos.tap(32, a2.x, a2.y);
    await sleep(400);
    const saiu = await h.play(() => !window.__game.state.driving);
    console.log(`  [aviso] ENTRAR recebe o dedo: ${a1.meu}; entrou ${entrou}; aviso dirigindo: ${a2 && a2.txt}; saiu ${saiu}`);
    assert.equal(a1.meu, true, 'o aviso ENTRAR está aceso mas não recebe o dedo');
    assert.equal(entrou, true, 'tocou o aviso ENTRAR e não entrou no carro');
    assert.ok(a2 && a2.meu, `dirigindo, o aviso SAIR não está aceso/tocável: ${JSON.stringify(a2)}`);
    assert.equal(saiu, true, 'tocou o aviso SAIR e não saiu do carro');
  });

  /* o complementar do conserto: no SOLO o baú de guardar É o baú, e continua
     desenhado e usável — esconder no BR não pode apagá-lo aqui */
  it('dado o baú desenhado mais perto do jogador no solo, então o USAR aparece e guardar/retirar responde', async () => {
    const bau = await h.play(() => {
      const T = window.__TR, P = window.__MP.player.pos;
      let best = null, bd = Infinity;
      for (const b of T.bausDesenhados()) {
        const d = Math.hypot(b.position.x - P.x, b.position.z - P.z);
        if (d < bd) { bd = d; best = b; }
      }
      return best ? { x: best.position.x, z: best.position.z, d: bd, total: T.bausDesenhados().length } : null;
    });
    assert.ok(bau, 'no solo nenhum baú está desenhado — o conserto do BR apagou o baú do solo');
    const chegou = await andarAte(h, dedos, { x: bau.x, z: bau.z }, { perto: 1.3, id: 23 });
    await sleep(250);
    const usar = await h.play(() => window.__TR.naTela('use'));
    const u = await h.play(() => window.__TR.centro(window.__TR.btn('use')));
    await dedos.tap(24, u.x, u.y);
    await sleep(300);
    const msg = await h.play(() => document.getElementById('centerMsg').textContent);
    console.log(`  [solo] ${bau.total} baús desenhados; chegou a ${chegou.d.toFixed(2)} m do mais perto; ` +
      `USAR ${usar ? 'na tela' : 'FORA'}; aviso: "${msg}"`);
    assert.ok(chegou.d < 2.0, `o analógico não levou o jogador ao baú (${chegou.d.toFixed(2)} m)`);
    assert.equal(usar, true, 'no solo, ao lado do baú de guardar, o USAR não está na tela');
    assert.match(msg, /^Baú:/, `tocou o USAR ao lado do baú do solo e ele não respondeu ("${msg}")`);
  });

  it('dado o solo, então nenhum erro de página apareceu', () => {
    assert.deepEqual(h.pageErrors, [], `erros de página: ${h.pageErrors.join(' | ')}`);
  });
});
