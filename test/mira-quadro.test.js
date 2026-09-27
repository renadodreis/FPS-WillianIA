/* ================================================================
   QA — ORDEM DO QUADRO: o tiro sai pela câmera que o quadro DESENHA.

   O DEFEITO (laudo `7515734`, M1/A7). No `tick()` o `shootUpdate` rodava
   ANTES do `applyTouchLook` e do `applyFpsCamera`, e a posição da câmera só
   era escrita no `applyFpsCamera`. O disparo lia a câmera do quadro ANTERIOR:
     · dedo arrastando o ATIRAR a 4 px/quadro: 0,733° = 64 cm a 50 m;
     · assistência de mira agindo no quadro do tiro: 0,26°;
     · andando de lado: a origem ficava um passo para trás (8,7–9,7 cm);
     · e o recuo do quadro (mola integrada DEPOIS do tiro) desenhava a
       retícula num lugar e mandava a bala para o outro.
   `test/br-mira-projetil.test.js` cobre o BR no celular (V3) pelos três
   caminhos. Este arquivo cobre o que sobra:
     · DESKTOP (porta 4000): o mouse gira a câmera no próprio evento
       (PointerLockControls), então a direção nunca atrasou pelo olhar — mas a
       origem andando (WASD) e a mola do recuo sim. Hitscan (fora de partida o
       fuzil não tem `projSpeed`) e o foguete, que tem de voar PARALELO à
       retícula (CLAUDE.md: nasce na boca, zeragem pelo 1º obstáculo é
       proibida).
     · CELULAR V2 800×360 (porta 4001): a assistência de mira girando a câmera
       no quadro do disparo (A7), com controle positivo de que ela agiu.

   ÂNCORA: `camera.matrixWorld` lida depois do tick (o tick chama
   `camera.updateMatrixWorld()` logo antes do render), projetada para pixels
   do canvas. O raio é o que o disparo usou (`origemDoTiro`/`direcaoDoTiro`).
   Espalhamento zerado (`spread = 0`, `Math.random = () => 0`); o RECUO não:
   o coice do tiro entra no quadro seguinte, o que já estava no ar entra antes
   do disparo — a bala sai pela retícula desenhada em todo tiro da rajada.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

const PORT_DESKTOP = 4000;
const PORT_V2 = 4001;
const PORT_VOO = 4004;
const V2 = { width: 800, height: 360, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const FUZIL = 0, ESCOPETA = 1, DMR = 2, BAZUCA = 3, RAJADA = 7;

function instalarSonda() {
  const QA = window.QA, G = QA.G, MP = QA.MP, THREE = MP.THREE;
  const tela = MP.renderer.domElement;
  for (const e of G.Enemies.list) { e.alive = false; if (e.group) e.group.visible = false; }
  G.Skeletons.setEnabled(false);   // o PvE caça o jogador e para na frente da cruz
  const toque = (sel, type, id, x, y) => document.querySelector(sel).dispatchEvent(new PointerEvent(type, {
    pointerId: id, pointerType: 'touch', isPrimary: id === 1,
    clientX: x, clientY: y, bubbles: true, cancelable: true }));
  const centro = sel => {
    const r = document.querySelector(sel).getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  const _inv = new THREE.Matrix4(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const fotografar = () => ({ mundo: MP.camera.matrixWorld.clone(), proj: MP.camera.projectionMatrix.clone() });
  function medir(o, d, foto) {
    const co = new THREE.Vector3().setFromMatrixPosition(foto.mundo);
    const cf = new THREE.Vector3(0, 0, -1).transformDirection(foto.mundo);
    _inv.copy(foto.mundo).invert();
    const W = tela.clientWidth, H = tela.clientHeight;
    const cm = {}, px = {};
    for (const D of [10, 25, 50]) {
      const t = (D - o.clone().sub(co).dot(cf)) / d.dot(cf);
      const p = o.clone().addScaledVector(d, t);
      cm[D] = p.distanceTo(co.clone().addScaledVector(cf, D)) * 100;
      const n = p.clone().applyMatrix4(_inv).applyMatrix4(foto.proj);
      px[D] = Math.hypot(n.x * W / 2, n.y * H / 2);
    }
    const graus = Math.acos(Math.min(1, d.clone().normalize().dot(cf))) * 180 / Math.PI;
    return { cm, px, graus };
  }
  const alvos = [];
  const M = window.MQA = {
    toque, centro,
    /* o que o PointerLockControls faz dentro do `mousemove` */
    mouse(dx, dy = 0) {
      _e.setFromQuaternion(MP.camera.quaternion);
      _e.y -= dx * 0.002; _e.x -= dy * 0.002;
      MP.camera.quaternion.setFromEuler(_e);
    },
    /* boneco com o MESMO desenho de esferas do jogador remoto (br-game.js) */
    alvo(x, z) {
      const g = new THREE.Group();
      const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.9, 0.4), new THREE.MeshBasicMaterial());
      corpo.position.y = 0.95; g.add(corpo);
      g.position.set(x, MP.heightAt(x, z), z);
      MP.scene.add(g);
      const sph = [[1.66, 0.28, 'head'], [1.10, 0.42, 'body'], [0.42, 0.34, 'body']]
        .map(([hh, r, part]) => ({ c: new THREE.Vector3(), r, part, hh }));
      const t = { group: g, alive: true, enabled: true,
        pos: () => g.position,
        hitSpheres() { for (const s of sph) s.c.set(g.position.x, g.position.y + s.hh, g.position.z); return sph; },
        damage() { return false; } };
      G.extraTargets.push(t); alvos.push(t);
      return t;
    },
    limparAlvos() {
      for (const t of alvos) {
        MP.scene.remove(t.group);
        const i = G.extraTargets.indexOf(t);
        if (i >= 0) G.extraTargets.splice(i, 1);
      }
      alvos.length = 0;
    },
    /* linha livre (o MESMO rayBlockedAt do tiro) do olho até cabeça, tronco e
       pé de um boneco em `p` */
    livre(p) {
      const olho = MP.camera.position, chao = MP.heightAt(p.x, p.z), v = new THREE.Vector3();
      for (const hh of [1.66, 1.10, 0.42]) {
        v.set(p.x - olho.x, chao + hh - olho.y, p.z - olho.z);
        const len = v.length(); v.multiplyScalar(1 / len);
        if (MP.rayBlockedAt(olho, v, len) < len + 0.5) return false;
      }
      return true;
    },
    /* um campo aberto: base e azimute em que um boneco a 12–25 m, até 2 m de
       cada lado, é visto inteiro */
    acharCampo() {
      for (const [bx, bz] of [[30, 30], [60, 60], [0, 60], [60, 0], [-40, 20], [90, 30], [20, -60]]) {
        QA.reset(bx, bz); QA.tick(2);
        for (let gdeg = 0; gdeg < 360; gdeg += 10) {
          const a = gdeg * Math.PI / 180;
          const pt = (d, l) => ({ x: bx - Math.sin(a) * d + Math.cos(a) * l, z: bz - Math.cos(a) * d - Math.sin(a) * l });
          let ok = true;
          for (const d of [12, 20, 25]) for (const l of [-2, 0, 2]) if (ok && !M.livre(pt(d, l))) ok = false;
          if (ok) return { base: { x: bx, z: bz }, yaw: a };
        }
      }
      return null;
    },
    /* Arma pronta; `antes(k)` despacha a entrada do quadro k ANTES do tick.
       Cada tiro volta medido contra a câmera DO QUADRO em que saiu. */
    rodada({ arma, ads = false, quadros = 1, base = null, yaw = null, antes = () => {} }) {
      const g = G.arsenal[arma];
      if (base) QA.reset(base.x, base.z); else QA.reset();
      g.locked = false;
      G.switchWeapon(arma);
      g.mag = g.magSize; g.reloading = false; g.lastShot = -99;
      QA.tick(40);
      const mirar = () => {
        if (yaw === null) { const P = MP.player.pos; QA.aimAt(P.x + 50, P.y + 1.62, P.z); }
        else { MP.camera.rotation.set(0, yaw, 0, 'YXZ'); MP.camera.updateMatrixWorld(); }
      };
      mirar();
      G.mouse.aiming = ads;
      QA.tick(ads ? 60 : 10);
      mirar();
      const sh = g.spreadHip, sa = g.spreadAds, rnd = Math.random;
      const tiros = [], fotos = [];
      g.spreadHip = 0; g.spreadAds = 0;
      Math.random = () => 0;
      try {
        for (let k = 0; k < quadros; k++) {
          antes(k);
          const mag0 = g.mag;
          QA.tick(1);
          fotos[k] = fotografar();
          if (g.mag < mag0) tiros.push({
            o: new THREE.Vector3().fromArray(G.origemDoTiro()),
            d: new THREE.Vector3().fromArray(G.direcaoDoTiro()),
            quadro: k, via: g.rocket ? 'foguete' : 'hitscan' });
        }
      } finally {
        g.spreadHip = sh; g.spreadAds = sa;
        Math.random = rnd;
        G.Touch.releaseAll();
        for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) G.keys[c] = false;
        G.mouse.shooting = false; G.mouse.clicked = false; G.mouse.aiming = false;
      }
      return tiros.map(s => ({ arma: g.name, ads, quadro: s.quadro, via: s.via, ...medir(s.o, s.d, fotos[s.quadro]) }));
    },
  };
}

function ruinsDe(medidas, rotulo) {
  const ruins = [];
  for (const m of medidas) {
    if (m.via === 'foguete') {
      const cms = [10, 25, 50].map(D => m.cm[D]);
      if (m.graus > 0.01 || Math.max(...cms) - Math.min(...cms) > 0.5)
        ruins.push(`${rotulo} · foguete ${m.ads ? 'mira' : 'quadril'}: ${m.graus.toFixed(3)}° da retícula, afastamento ` +
          cms.map((c, i) => `${c.toFixed(1)} cm @${[10, 25, 50][i]} m`).join(' / '));
      continue;
    }
    for (const D of [10, 25, 50]) if (m.cm[D] > 1 || m.px[D] > 1)
      ruins.push(`${rotulo} · ${m.arma} ${m.ads ? 'mira' : 'quadril'} (${m.via}, quadro ${m.quadro}) @${D} m: ` +
        `${m.cm[D].toFixed(2)} cm / ${m.px[D].toFixed(2)} px (${m.graus.toFixed(3)}°)`);
  }
  return ruins;
}

/* resumo pro log: o pior tiro medido (px, cm e graus contra a retícula) */
function resumo(rotulo, medidas) {
  const ms = medidas.filter(m => m.via !== 'foguete');
  const px = Math.max(0, ...ms.flatMap(m => [10, 25, 50].map(D => m.px[D])));
  const cm = Math.max(0, ...ms.flatMap(m => [10, 25, 50].map(D => m.cm[D])));
  const gr = Math.max(0, ...medidas.map(m => m.graus));
  console.log(`  [${rotulo}] ${medidas.length} tiros · pior: ${px.toFixed(4)} px, ${cm.toFixed(4)} cm, ${gr.toFixed(5)}°`);
}

describe('Ordem do quadro — desktop (mouse e teclado)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: PORT_DESKTOP });
    await h.play(instalarSonda);
  });
  after(async () => { if (h) await h.close(); });

  it('dada uma rajada de fuzil parado, então cada bala sai pela retícula do seu quadro (o recuo não descola)', async () => {
    const m = await h.play(() => window.MQA.rodada({ arma: 0, quadros: 20, antes: k => {
      if (k === 0) { window.QA.G.mouse.shooting = true; window.QA.G.mouse.clicked = true; }
    } }));
    assert.ok(m.length >= 3, `rajada curta demais (${m.length} tiros)`);
    resumo('rajada parado', m);
    const ruins = ruinsDe(m, 'rajada');
    assert.deepEqual(ruins, [], 'a mola do recuo mexeu na câmera DEPOIS do tiro:\n' + ruins.join('\n'));
  });

  it('dado o MOUSE girando a cada quadro durante a rajada, então a bala não piora: sai pela retícula desenhada', async () => {
    const m = await h.play(() => {
      const M = window.MQA, G = window.QA.G;
      return M.rodada({ arma: 0, quadros: 20, antes: k => {
        if (k === 0) { G.mouse.shooting = true; G.mouse.clicked = true; }
        M.mouse(6, -2);   // 6 px por quadro ≈ 41 °/s, como o evento de mousemove entrega
      } });
    });
    assert.ok(m.length >= 3, `rajada curta demais (${m.length} tiros)`);
    resumo('mouse girando', m);
    const ruins = ruinsDe(m, 'mouse girando');
    assert.deepEqual(ruins, [], ruins.join('\n'));
  });

  it('dado WASD andando de lado, então a origem do tiro é a câmera desenhada (hitscan e foguete)', async () => {
    const m = await h.play(({ armas }) => {
      const M = window.MQA, G = window.QA.G, out = [];
      for (const arma of armas) out.push(...M.rodada({ arma, quadros: 24, antes: k => {
        if (k === 0) G.keys.KeyD = true;
        if (k === 20) { G.mouse.shooting = true; G.mouse.clicked = true; }
      } }));
      return out;
    }, { armas: [FUZIL, ESCOPETA, BAZUCA] });
    assert.ok(m.length >= 3, `esperava ≥ 3 tiros andando, veio ${m.length}`);
    resumo('WASD de lado', m);
    const ruins = ruinsDe(m, 'andando');
    assert.deepEqual(ruins, [], 'a origem ficou um passo atrás:\n' + ruins.join('\n'));
  });

  it('dada a BAZUCA no quadril e na mira, então o foguete voa PARALELO à retícula (sem zeragem)', async () => {
    const m = await h.play(() => {
      const M = window.MQA, G = window.QA.G, out = [];
      for (const ads of [false, true]) out.push(...M.rodada({ arma: 3, ads, quadros: 1, antes: () => {
        G.mouse.shooting = true; G.mouse.clicked = true;
      } }));
      return out;
    });
    assert.equal(m.filter(x => x.via === 'foguete').length, 2, `esperava 2 foguetes: ${JSON.stringify(m)}`);
    console.log('  [bazuca desktop] ' + m.map(x => `${x.ads ? 'mira' : 'quadril'} ` +
      [10, 25, 50].map(D => `${x.cm[D].toFixed(1)} cm@${D}`).join(' ')).join(' · '));
    const ruins = ruinsDe(m, 'bazuca');
    assert.deepEqual(ruins, [], 'o foguete converge (zeragem proibida):\n' + ruins.join('\n'));
  });
});

/* M6 VOANDO. No helicóptero a vista é a câmera de PERSEGUIÇÃO (10,5 m atrás) e
   o tiro sai do HELICÓPTERO (o servidor recusaria origem longe da posição
   autoritativa) — duas retas diferentes. A retícula continua na tela porque o
   tiro é possível (porta aberta); então ela tem de dizer a verdade: a bala
   passa a menos do raio da menor esfera de acerto de um avatar remoto (a
   cabeça, 0,28 m em br-game.js) do centro dela, a 10, 25 e 50 m. */
describe('Retícula voando — desktop', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: PORT_VOO });
    await h.play(instalarSonda);
  });
  after(async () => { if (h) await h.close(); });

  it('dado o helicóptero no ar, então a retícula aparece e a bala passa a menos de uma cabeça (28 cm) do centro dela', async () => {
    const r = await h.play(async () => {
      const QA = window.QA, G = QA.G, MP = QA.MP, THREE = MP.THREE;
      QA.reset();
      const hp = G.Heli.group.position;
      MP.player.pos.set(hp.x + 2, hp.y, hp.z);
      QA.tick(1);
      G.tryToggleCar();                         // o caminho do jogo: Heli.tryEnter
      const voando = !!G.state.flying;
      G.keys.Space = true; QA.tick(150); G.keys.Space = false;
      QA.tick(90);                              // paira e a perseguição assenta
      const g = G.arsenal[0];
      g.locked = false; G.switchWeapon(0); g.mag = g.magSize; g.reloading = false; g.lastShot = -99;
      QA.tick(40);
      await new Promise(res => setTimeout(res, 300));   // transição de opacidade (style.css)
      const c = document.getElementById('crosshair');
      const retOpac = +getComputedStyle(c).opacity, retVis = getComputedStyle(c).visibility !== 'hidden';
      const sh = g.spreadHip, rnd = Math.random;
      g.spreadHip = 0; Math.random = () => 0;
      const out = [];
      try {
        G.mouse.shooting = true; G.mouse.clicked = true;
        for (let k = 0; k < 12; k++) {
          const mag0 = g.mag;
          QA.tick(1);
          if (g.mag >= mag0) continue;
          const mundo = MP.camera.matrixWorld;
          const co = new THREE.Vector3().setFromMatrixPosition(mundo);
          const cf = new THREE.Vector3(0, 0, -1).transformDirection(mundo);
          const o = new THREE.Vector3().fromArray(G.origemDoTiro());
          const d = new THREE.Vector3().fromArray(G.direcaoDoTiro());
          const cm = {};
          for (const D of [10, 25, 50]) {
            const p = co.clone().addScaledVector(cf, D);          // o que a retícula indica a D m
            const t = (D - o.clone().sub(co).dot(cf)) / d.dot(cf);
            cm[D] = o.clone().addScaledVector(d, t).distanceTo(p) * 100;
          }
          /* e a bala sai do HELICÓPTERO desenhado, não da câmera 10 m atrás */
          cm.heli = o.distanceTo(G.Heli.group.position);
          out.push(cm);
        }
      } finally {
        G.mouse.shooting = false; G.mouse.clicked = false;
        g.spreadHip = sh; Math.random = rnd;
        if (G.state.flying) G.tryToggleCar();
      }
      return { voando, retOpac, retVis, out };
    });
    console.log('  [voando] ' + r.out.map(m => [10, 25, 50].map(D => `${m[D].toFixed(1)} cm@${D}`).join(' ') +
      ` (origem a ${m.heli.toFixed(2)} m do heli)`).join(' · '));
    assert.equal(r.voando, true, 'cenário inválido: não entrou no helicóptero');
    assert.equal(r.retOpac, 1, `voando o tiro é possível e a retícula sumiu (opacidade ${r.retOpac})`);
    assert.equal(r.retVis, true);
    assert.ok(r.out.length >= 2, `poucos tiros voando (${r.out.length})`);
    const ruins = r.out.flatMap((m, i) => [10, 25, 50].filter(D => m[D] > 28)
      .map(D => `tiro ${i} @${D} m: ${m[D].toFixed(1)} cm do centro da retícula`));
    for (const [i, m] of r.out.entries()) if (m.heli > 3)
      ruins.push(`tiro ${i}: origem a ${m.heli.toFixed(2)} m do helicóptero (a câmera de perseguição fica ~10 m atrás)`);
    assert.deepEqual(ruins, [], 'voando a bala passa longe do que a retícula indica:\n' + ruins.join('\n'));
  });
});

describe('Ordem do quadro — celular V2 (dedo e assistência)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, campo;
  before(async () => {
    h = await bootGame({ port: PORT_V2, query: '?mobile=1', viewport: V2 });
    await h.play(instalarSonda);
    campo = await h.play(() => window.MQA.acharCampo());
    console.log(`  [campo] ${JSON.stringify(campo)}`);
  });
  after(async () => { if (h) await h.close(); });

  it('dado o dedo arrastando o ATIRAR, então hitscan e foguete saem pela retícula do quadro (V2)', async () => {
    const m = await h.play(({ armas }) => {
      const M = window.MQA, out = [];
      const sel = '.tcBtn[data-act="fire"]';
      const [fx, fy] = M.centro(sel);
      for (const arma of armas) for (const ads of [false, true]) {
        let x = fx;
        out.push(...M.rodada({ arma, ads, quadros: arma === 3 ? 2 : 14, antes: k => {
          if (k === 0) M.toque(sel, 'pointerdown', 6, fx, fy);
          x += 4;
          M.toque(sel, 'pointermove', 6, x, fy);
        } }));
        M.toque(sel, 'pointerup', 6, x, fy);
      }
      return out;
    }, { armas: [FUZIL, ESCOPETA, DMR, RAJADA, BAZUCA] });
    assert.ok(m.length >= 10, `poucos tiros medidos (${m.length})`);
    assert.ok(m.some(x => x.via === 'foguete'), 'o foguete não saiu');
    resumo('arrasto V2', m);
    const ruins = ruinsDe(m, 'arrasto V2');
    assert.deepEqual(ruins, [], ruins.join('\n'));
  });

  /* A7(a): a assistência gira a câmera (dedo + puxão) no MESMO quadro em que o
     automático dispara. Controle positivo: pelo menos um tiro saiu num quadro
     em que o núcleo devolveu giro diferente do dedo. */
  it('dada a assistência AGINDO no quadro do disparo, então a bala sai pela retícula desenhada (A7)', async t => {
    if (!campo) { t.skip('cenário inválido: nenhum campo aberto achado'); return; }
    const r = await h.play(({ campo }) => {
      const M = window.MQA, G = window.QA.G;
      const { base, yaw } = campo;
      /* alvo a 20 m, 1,1 m à direita da cruz: dentro da janela da assistência */
      const alvo = M.alvo(base.x - Math.sin(yaw) * 20 + Math.cos(yaw) * 1.1,
        base.z - Math.cos(yaw) * 20 - Math.sin(yaw) * 1.1);
      const agiu = [];
      let quadro = -1;
      const passo = G.AimAssist.step;
      G.AimAssist.step = function (q) {
        const inY = q.inYaw, inP = q.inPitch;
        const res = passo.call(this, q);
        agiu[quadro] = Math.hypot(res.yaw - inY, res.pitch - inP);
        return res;
      };
      const sel = '.tcBtn[data-act="fire"]';
      const [fx, fy] = M.centro(sel);
      let x = fx, out;
      try {
        out = M.rodada({ arma: 0, base, yaw, quadros: 30, antes: k => {
          quadro = k;
          if (k === 0) M.toque(sel, 'pointerdown', 11, fx, fy);
          x += 3;   // o polegar arrasta rumo ao alvo (à direita)
          M.toque(sel, 'pointermove', 11, x, fy);
        } });
      } finally {
        G.AimAssist.step = passo;
        M.toque(sel, 'pointerup', 11, x, fy);
        M.limparAlvos();
      }
      void alvo;
      return out.map(s => ({ ...s, assist: agiu[s.quadro] || 0 }));
    }, { campo });
    const comAssist = r.filter(s => s.assist > 1e-6);
    console.log(`  [A7] ${r.length} tiros, ${comAssist.length} com a assistência agindo no quadro ` +
      `(máx ${Math.max(0, ...comAssist.map(s => s.assist * 180 / Math.PI)).toFixed(3)}°)`);
    assert.ok(comAssist.length >= 1, 'controle positivo falhou: a assistência não agiu em nenhum quadro de disparo');
    resumo('assistência', r);
    const ruins = ruinsDe(r, 'assistência');
    assert.deepEqual(ruins, [], 'com a assistência girando a câmera no quadro do tiro:\n' + ruins.join('\n'));
  });
});
