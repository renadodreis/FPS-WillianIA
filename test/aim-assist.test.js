/* ================================================================
   QA — ASSISTÊNCIA DE MIRA E TIRO AUTOMÁTICO NO JOGO DE VERDADE.

   O núcleo (test/aim-assist-core.test.js) prova a matemática. Este prova
   a FIAÇÃO no jogo real (?mobile=1, viewport de celular com hasTouch):
     (b) rastrear um alvo que anda de lado: erro angular médio COM vs SEM
         assistência, em graus;
     (c) alvo que o jogador NÃO vê (atrás de parede, atrás do relevo, fora
         da cena): a vista sai IDÊNTICA com e sem assistência;
     (d) desktop com mouse, mesmo cenário: zero assistência;
     (e) o ajuste persiste depois de recarregar a página;
     e o tiro automático: só em alvo visível, sob a cruz, no alcance.

   O "jogador" é um dedo simulado que segue o alvo com ATRASO de reação
   (150 ms — a Insomniac mediu 250–320 ms de reação média) e ganho menor
   que 1: um rastreador humano imperfeito. Ele age pela ENTRADA (eventos de
   ponteiro no #tcLook) e o teste OBSERVA a câmera. A régua do erro é
   INDEPENDENTE do código sob teste: a posição do alvo no mundo contra a
   frente da câmera, nunca a saída da própria assistência.

   Portas: 3960 (celular) e 3961 (desktop).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');

const PORT_MOBILE = 3960;
const PORT_DESKTOP = 3961;
const PHONE_VIEWPORT = { width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

/* Instalado NA PÁGINA, uma vez por boot. Tudo que cria Object3D roda DEPOIS
   do boot: o mundo já foi gerado, o PRNG seedado não é mais contrato aqui. */
function instalar() {
  const QA = window.QA, G = QA.G, MP = QA.MP, THREE = MP.THREE;
  /* os inimigos comuns ficam em pé no QA (o BR real os mata no começo da
     partida, br-game.js). Aqui eles sairiam na frente da cruz e virariam
     alvo da assistência no meio da medição. */
  for (const e of G.Enemies.list) { e.alive = false; if (e.group) e.group.visible = false; }
  const evt = (el, type, id, x, y) => el.dispatchEvent(new PointerEvent(type, {
    pointerId: id, pointerType: 'touch', isPrimary: id === 1,
    clientX: x, clientY: y, bubbles: true, cancelable: true }));
  const _f = new THREE.Vector3(), _o = new THREE.Vector3(), _v = new THREE.Vector3();
  const _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const A = window.AQA = {
    alvos: [], paredes: [],
    /* boneco com o MESMO desenho de esferas do jogador remoto (br-game.js) */
    criar(x, z, dy = 0) {
      const g = new THREE.Group();
      const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.9, 0.4), new THREE.MeshBasicMaterial());
      corpo.position.y = 0.95;
      g.add(corpo);
      g.position.set(x, MP.heightAt(x, z) + dy, z);
      MP.scene.add(g);
      const sph = [[1.66, 0.28, 'head'], [1.10, 0.42, 'body'], [0.42, 0.34, 'body']]
        .map(([h, r, part]) => ({ c: new THREE.Vector3(), r, part, h }));
      const t = { group: g, alive: true, enabled: true, acertos: 0, dy,
        hitSpheres() {
          for (const s of sph) s.c.set(g.position.x, g.position.y + s.h, g.position.z);
          return sph;
        },
        damage() { this.acertos++; return false; } };
      G.extraTargets.push(t);
      A.alvos.push(t);
      return t;
    },
    pos(t, x, z) { t.group.position.set(x, MP.heightAt(x, z) + t.dy, z); },
    limpar() {
      for (const t of A.alvos) {
        MP.scene.remove(t.group);
        const i = G.extraTargets.indexOf(t);
        if (i >= 0) G.extraTargets.splice(i, 1);
      }
      A.alvos.length = 0;
      for (const w of A.paredes) {
        const i = G.Structures.walls.indexOf(w);
        if (i >= 0) G.Structures.walls.splice(i, 1);
      }
      A.paredes.length = 0;
      G.Structures.invalidateWallCache();
    },
    /* bloco sólido pro tiro (Structures.walls é o que rayBlockedAt consulta),
       centrado em (x, z), `m` metros de meia-largura */
    parede(x, z, m = 3) {
      const y = MP.heightAt(x, z);
      const w = { x0: x - m, x1: x + m, y0: y - 2, y1: y + 4, z0: z - m, z1: z + m };
      G.Structures.walls.push(w);
      G.Structures.invalidateWallCache();
      A.paredes.push(w);
      return w;
    },
    /* ajuste pelo MESMO caminho do menu: valor no controle + evento */
    ajuste(id, v) {
      const el = document.getElementById(id);
      el.value = String(v);
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input'));
    },
    /* CAMPO ABERTO. O relevo desta seed esconde um boneco a 22 m no azimute
       0° visto de (30, 30) — medido: foi isso que deixou o tiro automático
       "sem disparar" num alvo que o produto corretamente NÃO via. Todo cenário
       de alvo visível parte de um lugar e de uma direção em que o boneco
       INTEIRO tem linha livre (o MESMO rayBlockedAt do tiro) de 6 a 25 m e
       até 2,5 m de cada lado. `null` = cenário inválido, e o caso diz isso. */
    base: { x: 30, z: 30 }, campo: null,
    livre(p) {
      const olho = MP.camera.position, chao = MP.heightAt(p.x, p.z);
      for (const h of [1.66, 1.10, 0.42]) {
        _v.set(p.x - olho.x, chao + h - olho.y, p.z - olho.z);
        const len = _v.length();
        _v.multiplyScalar(1 / len);
        if (MP.rayBlockedAt(olho, _v, len) < len + 0.5) return false;
      }
      return true;
    },
    acharCampo() {
      for (const [bx, bz] of [[30, 30], [60, 60], [0, 60], [60, 0], [-40, 20], [90, 30], [20, -60], [120, 90]]) {
        A.base = { x: bx, z: bz };
        QA.reset(bx, bz);
        QA.tick(2);
        for (let g = 0; g < 360; g += 10) {
          A.campo = g * Math.PI / 180;
          let ok = true;
          for (const dist of [6, 10, 14, 20, 25]) {
            for (const lado of [-2.5, 0, 2.5]) if (!A.livre(A.ponto(dist, lado))) { ok = false; break; }
            if (!ok) break;
          }
          if (ok) return { base: A.base, campo: A.campo };
        }
      }
      A.campo = null;
      return null;
    },
    /* ponto a `dist` m na direção do campo e `lado` m à direita dela */
    ponto(dist, lado = 0) {
      const a = A.campo, o = A.base;
      return { x: o.x - Math.sin(a) * dist + Math.cos(a) * lado, z: o.z - Math.cos(a) * dist - Math.sin(a) * lado };
    },
    /* volta o jogador para a base do campo, olhando na direção dele */
    posicionar(extraYaw = 0) {
      QA.reset(A.base.x, A.base.z);
      QA.tick(10);
      A.mirarYaw(A.campo + extraYaw);
    },
    olhar() { _e.setFromQuaternion(MP.camera.quaternion); return { yaw: _e.y, pitch: _e.x }; },
    mirarYaw(yaw, pitch = 0) { MP.camera.rotation.set(pitch, yaw, 0, 'YXZ'); MP.camera.updateMatrixWorld(); },
    /* RÉGUA: ângulo entre a frente da câmera e o centro do TRONCO do alvo */
    erro(t) {
      MP.camera.updateMatrixWorld();
      _o.setFromMatrixPosition(MP.camera.matrixWorld);
      MP.camera.getWorldDirection(_f);
      _v.set(t.group.position.x, t.group.position.y + 1.10, t.group.position.z).sub(_o).normalize();
      return Math.acos(Math.min(1, Math.max(-1, _f.dot(_v))));
    },
    /* erro em yaw/pitch (o que o "dedo" enxerga para corrigir) */
    erroYP(t) {
      MP.camera.updateMatrixWorld();
      _o.setFromMatrixPosition(MP.camera.matrixWorld);
      const v = _v.set(t.group.position.x, t.group.position.y + 1.10, t.group.position.z).sub(_o);
      const psiT = Math.atan2(-v.x, -v.z), thT = Math.atan2(v.y, Math.hypot(v.x, v.z));
      const o = A.olhar();
      return { yaw: Math.atan2(Math.sin(psiT - o.yaw), Math.cos(psiT - o.yaw)), pitch: thT - o.pitch };
    },
    /* O DEDO SIMULADO. Reage ao erro de `atraso` frames atrás com `ganho`
       por frame, pelo #tcLook. `mover(i)` posiciona o alvo antes do frame i.
       Devolve a série de erros (rad) e a de yaw da câmera. */
    rastrear(t, { frames = 210, atraso = 9, ganho = 0.12, mover = () => {}, id = 31 } = {}) {
      const el = document.querySelector('#tcLook');
      const r = el.getBoundingClientRect();
      let px = r.left + r.width / 2, py = r.top + r.height / 2;
      evt(el, 'pointerdown', id, px, py);
      const hist = [], erros = [], yaws = [];
      for (let i = 0; i < frames; i++) {
        mover(i);
        hist.push(A.erroYP(t));
        const e = hist[Math.max(0, hist.length - 1 - atraso)];
        const sens = G.Touch.lookSens;               // rad/px do QUADRIL
        px += -e.yaw * ganho / sens;
        py += -e.pitch * ganho / (sens * G.Touch.cfg.ratioY);
        evt(el, 'pointermove', id, px, py);
        QA.tick(1);
        erros.push(A.erro(t));
        yaws.push(A.olhar().yaw);
      }
      evt(el, 'pointerup', id, px, py);
      QA.tick(1);
      return { erros, yaws };
    },
  };
}

const graus = r => r * 180 / Math.PI;
const media = (xs, de = 0) => { const s = xs.slice(de); return s.reduce((a, b) => a + b, 0) / s.length; };

describe('Assistência de mira no toque — celular', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: PORT_MOBILE, query: '?mobile=1', viewport: PHONE_VIEWPORT });
    await h.play(instalar);
    campo = await h.play(() => window.AQA.acharCampo());
    console.log(`  [campo] ${JSON.stringify(campo)}`);
    await h.play(() => { window.QA.reset(); window.QA.tick(4); });
  });
  let campo = null;
  after(async () => { if (h) await h.close(); });
  const play = (fn, ...args) => h.play(fn, ...args);

  /* Alvo a 20 m, andando de lado em senoide (±2 m, período 2,5 s: pico de
     5 m/s — um jogador trocando de direção). Mesmo dedo, mesmo começo;
     só o ajuste muda. */
  function cenarioLateral(assist) {
    return play(ligada => {
      const A = window.AQA;
      A.limpar();
      A.ajuste('setTAssist', ligada ? 1 : 0);
      A.posicionar();
      const p0 = A.ponto(20);
      const t = A.criar(p0.x, p0.z);
      const r = A.rastrear(t, {
        mover: i => { const p = A.ponto(20, 2 * Math.sin(2 * Math.PI * (i / 60) / 2.5)); A.pos(t, p.x, p.z); },
      });
      A.limpar();
      return { erros: r.erros, yaws: r.yaws };
    }, assist);
  }

  it('(b) dado um alvo andando de lado, então o erro angular médio CAI com a assistência', async () => {
    assert.notEqual(campo, null, 'cenário inválido: nenhuma direção de campo aberto a partir de (30, 30)');
    const sem = await cenarioLateral(false);
    const com = await cenarioLateral(true);
    const mSem = graus(media(sem.erros, 30)), mCom = graus(media(com.erros, 30));
    const pSem = graus(Math.max(...sem.erros.slice(30))), pCom = graus(Math.max(...com.erros.slice(30)));
    console.log(`  [b] erro médio: SEM ${mSem.toFixed(3)}° · COM ${mCom.toFixed(3)}° ` +
      `(${(100 * (1 - mCom / mSem)).toFixed(1)} % menor) · pico SEM ${pSem.toFixed(3)}° COM ${pCom.toFixed(3)}°`);
    assert.ok(mSem > 0.3, `cenário inválido: sem assistência o dedo já rastreia perfeito (${mSem}°)`);
    assert.ok(mCom < mSem * 0.85,
      `a assistência não ajudou: ${mCom.toFixed(3)}° com contra ${mSem.toFixed(3)}° sem`);
  });

  /* ---- (c) quem o jogador NÃO vê ---- */
  function cenarioEscondido(assist, esconder) {
    return play((ligada, modo) => {
      const QA = window.QA, A = window.AQA, MP = QA.MP;
      A.limpar();
      A.ajuste('setTAssist', ligada ? 1 : 0);
      A.posicionar();
      const p0 = A.ponto(20);
      const t = A.criar(p0.x, p0.z);
      if (modo === 'parede') { const m = A.ponto(11); A.parede(m.x, m.z, 3); }
      if (modo === 'invisivel') t.group.visible = false;    // dentro de carro/heli
      if (modo === 'forada cena') MP.scene.remove(t.group);
      const r = A.rastrear(t, {
        mover: i => { const p = A.ponto(20, 2 * Math.sin(2 * Math.PI * (i / 60) / 2.5)); A.pos(t, p.x, p.z); },
      });
      A.limpar();
      return { erros: r.erros, yaws: r.yaws };
    }, assist, esconder);
  }

  for (const modo of ['parede', 'invisivel', 'forada cena']) {
    it(`(c) dado o alvo escondido (${modo}), então a vista sai IDÊNTICA com e sem assistência`, async () => {
      assert.notEqual(campo, null, 'cenário inválido: nenhuma direção de campo aberto');
      const sem = await cenarioEscondido(false, modo);
      const com = await cenarioEscondido(true, modo);
      let maior = 0;
      for (let i = 0; i < sem.yaws.length; i++) maior = Math.max(maior, Math.abs(sem.yaws[i] - com.yaws[i]));
      console.log(`  [c:${modo}] maior diferença de yaw entre COM e SEM: ${graus(maior).toExponential(3)}°` +
        ` · erro médio ${graus(media(com.erros, 30)).toFixed(3)}°`);
      assert.ok(graus(media(sem.erros, 30)) > 0.3, 'cenário inválido: o dedo não teve trabalho nenhum');
      assert.equal(maior, 0, `a assistência mexeu na vista por um alvo escondido: ${graus(maior)}°`);
    });
  }

  it('(c) dado o alvo atrás do RELEVO, então a vista sai idêntica com e sem assistência', async () => {
    /* procura, com a seed fixa, um ponto onde o terreno esconde o boneco
       INTEIRO do olho — o MESMO rayBlockedAt do tiro decide */
    const achado = await play(() => {
      const QA = window.QA, MP = QA.MP, THREE = MP.THREE;
      QA.reset(30, 30);
      QA.tick(4);
      const olho = MP.camera.position.clone();
      const d = new THREE.Vector3();
      for (let az = 0; az < 360; az += 3) {
        for (let dist = 22; dist <= 70; dist += 2) {
          const a = az * Math.PI / 180;
          const x = 30 - Math.sin(a) * dist, z = 30 - Math.cos(a) * dist;
          const g = MP.heightAt(x, z);
          let tudo = true;
          for (const [h, r] of [[1.66, 0.28], [1.10, 0.42], [0.42, 0.34]]) {
            d.set(x - olho.x, g + h - olho.y, z - olho.z);
            const len = d.length();
            d.multiplyScalar(1 / len);
            if (MP.rayBlockedAt(olho, d, len) >= len - r - 1) { tudo = false; break; }
          }
          if (tudo) return { x, z, az: a, dist };
        }
      }
      return null;
    });
    assert.ok(achado, 'cenário inválido: nenhum ponto escondido pelo relevo em 70 m');
    const rodar = ligada => play((lig, p) => {
      const QA = window.QA, A = window.AQA;
      A.limpar();
      A.ajuste('setTAssist', lig ? 1 : 0);
      QA.reset(30, 30);
      QA.tick(10);
      A.mirarYaw(p.az + 0.08);                 // começa 4,6° fora: o dedo tem trabalho
      const t = A.criar(p.x, p.z);
      const r = A.rastrear(t, { frames: 120 });
      A.limpar();
      return r;
    }, ligada, achado);
    const sem = await rodar(false), com = await rodar(true);
    let maior = 0;
    for (let i = 0; i < sem.yaws.length; i++) maior = Math.max(maior, Math.abs(sem.yaws[i] - com.yaws[i]));
    console.log(`  [c:relevo] alvo a ${achado.dist} m, azimute ${graus(achado.az).toFixed(0)}° · ` +
      `maior diferença de yaw: ${graus(maior).toExponential(3)}°`);
    assert.equal(maior, 0, `a assistência mexeu na vista por um alvo atrás do relevo: ${graus(maior)}°`);
  });

  /* ---- tiro automático ---- */
  /* `desvio`: metros de lado entre a cabeça do boneco e o ponto onde a cruz
     é posta (0 = cruz no centro da cabeça) */
  function autoFire({ dist = 25, parede = false, arma = 0, ajuste = 1, desvio = 0 }) {
    return play(o => {
      const QA = window.QA, A = window.AQA, G = QA.G;
      A.limpar();
      A.ajuste('setTAuto', o.ajuste);
      A.posicionar();
      const trava = G.arsenal[o.arma].locked;
      G.arsenal[o.arma].locked = false;
      G.switchWeapon(o.arma);
      QA.tick(40);                            // troca de arma assenta (switchAnim)
      G.gun.mag = G.gun.magSize; G.gun.reloading = false;
      const p = A.ponto(o.dist);
      const t = A.criar(p.x, p.z);
      if (o.parede) { const m = A.ponto(o.dist * 0.5); A.parede(m.x, m.z, 3); }
      // cruz no centro da cabeça (ou `desvio` m ao lado dela), vista do olho
      const olho = QA.MP.camera.position;
      const q = A.ponto(o.dist, o.desvio);
      const ax = q.x, ay = t.group.position.y + 1.66, az = q.z;
      A.mirarYaw(Math.atan2(-(ax - olho.x), -(az - olho.z)),
        Math.atan2(ay - olho.y, Math.hypot(ax - olho.x, az - olho.z)));
      const visivel = !o.parede && A.livre(A.ponto(o.dist));   // validade do cenário, pela régua do tiro
      const mag0 = G.gun.mag;
      let segurou = false;
      for (let i = 0; i < 40; i++) { QA.tick(1); segurou = segurou || G.mouse.shooting; }
      const out = { gastou: mag0 - G.gun.mag, segurou, dedo: G.Touch.core.pressed('fire'),
        arma: G.gun.name, visivel };
      A.ajuste('setTAuto', 0);
      QA.tick(2);
      out.soltou = !G.mouse.shooting;
      A.limpar();
      G.switchWeapon(0);
      G.arsenal[o.arma].locked = trava;
      return out;
    }, { dist, parede, arma, ajuste, desvio });
  }

  it('dado o tiro automático LIGADO e um alvo visível sob a cruz, então o fuzil dispara sozinho', async () => {
    assert.notEqual(campo, null, 'cenário inválido: nenhuma direção de campo aberto');
    const r = await autoFire({});
    assert.equal(r.visivel, true, 'cenário inválido: o boneco não estava visível');
    console.log(`  [auto] ${r.arma}: ${r.gastou} tiros em 40 frames sem dedo no gatilho`);
    assert.equal(r.dedo, false, 'cenário inválido: tinha dedo no gatilho');
    assert.ok(r.gastou > 0, 'o automático não disparou num alvo visível sob a cruz');
    assert.equal(r.soltou, true, 'desligar o automático deixou o gatilho preso');
  });

  it('dado o tiro automático e o alvo ATRÁS DA PAREDE, então NÃO dispara', async () => {
    const r = await autoFire({ parede: true });
    assert.equal(r.gastou, 0, `disparou ${r.gastou} vezes num alvo escondido`);
    assert.equal(r.segurou, false);
  });

  it('dado o tiro automático e o alvo além do alcance da arma (escopeta a 20 m), então não dispara', async () => {
    /* escopeta: alcance automático de 15 m. O alvo a 20 m está VISÍVEL (a
       régua confere), então só o alcance pode segurar o gatilho — e o
       controle a 10 m prova que o caso exercita o limiar */
    const longe = await autoFire({ arma: 1, dist: 20 });
    assert.equal(longe.visivel, true, 'cenário inválido: o boneco a 20 m não estava visível');
    assert.equal(longe.gastou, 0, `a escopeta disparou ${longe.gastou} vezes a 20 m`);
    assert.ok((await autoFire({ arma: 1, dist: 10 })).gastou > 0, 'cenário inválido: nem a 10 m a escopeta disparou');
  });

  it('dado o tiro automático e a cruz 1,2 m AO LADO do boneco, então não dispara', async () => {
    // a 25 m, 1,2 m é 2,7°: dentro da zona externa da assistência, fora do corpo
    const r = await autoFire({ desvio: 1.2 });
    assert.equal(r.gastou, 0, `disparou ${r.gastou} vezes com a cruz fora do alvo`);
    // controle: 0,1 m ao lado (dentro da cabeça) dispara — o caso exercita o limiar
    assert.ok((await autoFire({ desvio: 0.1 })).gastou > 0, 'cenário inválido: nem dentro da cabeça disparou');
  });

  it('dado o tiro automático e a bazuca, a DMR ou o ajuste desligado, então não dispara', async () => {
    const baz = await autoFire({ arma: 3 });
    const dmr = await autoFire({ arma: 2 });
    const off = await autoFire({ ajuste: 0 });
    assert.equal(baz.gastou, 0, 'bazuca no automático');
    assert.equal(dmr.gastou, 0, 'DMR no automático');
    assert.equal(off.gastou, 0, 'ajuste desligado e disparou');
  });

  it('dado o celular, então a seção "Controles de toque" aparece no menu de ajustes', async () => {
    const r = await play(() => {
      const bloco = document.querySelector('#settings .touchOnly');
      return { display: bloco && getComputedStyle(bloco).display,
        linhas: bloco ? bloco.querySelectorAll('.srow').length : 0 };
    });
    assert.equal(r.display, 'block');
    assert.equal(r.linhas, 7);
  });

  // ÚLTIMO desta página: recarrega (o window.QA morre com o reload)
  it('(e) dado um ajuste de toque alterado, então ele vale NA HORA e sobrevive ao reload', async () => {
    const antes = await play(() => {
      const A = window.AQA, G = window.QA.G;
      A.ajuste('setTRatio', 45);
      A.ajuste('setTLook', 150);
      A.ajuste('setTAuto', 1);
      A.ajuste('setTFireL', 1);
      A.ajuste('setTAssist', 0);
      const salvo = JSON.parse(localStorage.getItem('callofai_cfg') || '{}');
      return { cfg: { ...G.Touch.cfg }, salvo, sens: G.Touch.lookSens,
        fireL: getComputedStyle(document.getElementById('tcBtnsL')).display,
        rotulo: document.getElementById('setTRatioV').textContent };
    });
    assert.equal(antes.cfg.ratioY, 0.45, 'o ajuste não valeu na hora');
    assert.ok(Math.abs(antes.sens - 0.0032 * 1.5) < 1e-12, `sensibilidade ${antes.sens}`);
    assert.equal(antes.cfg.autoFire, true);
    assert.equal(antes.cfg.assist, false);
    assert.equal(antes.fireL, 'block', 'o segundo ATIRAR não apareceu ao ligar o ajuste');
    assert.equal(antes.rotulo, '45%');
    assert.equal(antes.salvo.touchRatioY, 0.45, 'não persistiu no localStorage');
    await h.page.reload({ waitUntil: 'domcontentloaded' });
    await h.page.waitForFunction('!!window.__game && !!window.__game.Touch', { timeout: 90000 });
    const depois = await play(() => ({ cfg: { ...window.__game.Touch.cfg },
      ui: document.getElementById('setTRatio').value,
      assistUi: document.getElementById('setTAssist').value }));
    assert.equal(depois.cfg.ratioY, 0.45, 'a razão Y/X não sobreviveu ao reload');
    assert.equal(depois.cfg.look, 1.5);
    assert.equal(depois.cfg.autoFire, true);
    assert.equal(depois.cfg.fireLeft, true);
    assert.equal(depois.cfg.assist, false);
    assert.equal(depois.ui, '45', 'o slider voltou ao padrão depois do reload');
    assert.equal(depois.assistUi, '0');
  });

  it('dado o celular, então nenhum erro de página apareceu no caminho', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});

/* ================================================================
   (d) DESKTOP — mouse. O MESMO alvo andando de lado, rastreado pelo mouse
   (pointer lock simulado: `controls.isLocked` + mousemove com movementX, o
   caminho do PointerLockControls), com o jogador andando de LADO no teclado
   — que é o que ligaria o pull se a assistência vazasse para o desktop. E
   os ajustes de toque ligados no localStorage, para o caso não passar por
   estarem desligados. A régua: a câmera girou EXATAMENTE o que o mouse
   mandou (0,002 rad × movementX × pointerSpeed), frame a frame.
   ================================================================ */
describe('Assistência de mira — desktop não recebe', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    /* assistência E tiro automático ligados no localStorage ANTES do boot:
       o desktop não pode depender de estarem desligados */
    h = await bootGame({ port: PORT_DESKTOP, initScripts: [
      "try { localStorage.setItem('callofai_cfg', JSON.stringify({ touchAssist: 1, touchAutoFire: 1 })); } catch (e) {}",
    ] });
    await h.play(instalar);
    await h.play(() => { window.QA.reset(); window.QA.tick(4); });
  });
  after(async () => { if (h) await h.close(); });

  it('(d) dado o mouse rastreando um alvo andando de lado, então a câmera gira SÓ o que o mouse mandou', async () => {
    const r = await h.play(() => {
      const QA = window.QA, A = window.AQA, G = QA.G;
      // os ajustes de toque nasceram LIGADOS (initScripts): se vazassem pro
      // desktop, é aqui que apareceriam
      const S = JSON.parse(localStorage.getItem('callofai_cfg') || '{}');
      A.limpar();
      const campo = A.acharCampo();
      if (campo) A.posicionar();
      const p0 = A.ponto(20);
      const t = A.criar(p0.x, p0.z);
      G.controls.isLocked = true;
      G.state.pointerLocked = true;
      const desvios = [];
      const hist = [];
      let tiros = G.gun.mag;
      for (let i = 0; i < 210; i++) {
        const p = A.ponto(20, 2 * Math.sin(2 * Math.PI * (i / 60) / 2.5));
        A.pos(t, p.x, p.z);
        G.keys.KeyD = i % 90 < 45; G.keys.KeyA = !G.keys.KeyD;   // anda de lado o tempo todo
        hist.push(A.erroYP(t).yaw);
        const e = hist[Math.max(0, hist.length - 10)];
        const mx = Math.round(-e * 0.12 / (0.002 * G.controls.pointerSpeed));
        const y0 = A.olhar().yaw;
        document.dispatchEvent(new MouseEvent('mousemove', { movementX: mx, movementY: 0, bubbles: true }));
        const esperado = -mx * 0.002 * G.controls.pointerSpeed;
        const doMouse = A.olhar().yaw - y0;             // o que o PointerLockControls girou
        QA.tick(1);
        const noFrame = A.olhar().yaw - y0 - doMouse;    // o que o FRAME acrescentou por cima
        desvios.push({ mouse: Math.abs(doMouse - esperado), frame: Math.abs(noFrame), mx });
      }
      G.keys.KeyD = G.keys.KeyA = false;
      G.controls.isLocked = false;
      G.state.pointerLocked = false;
      tiros -= G.gun.mag;
      A.limpar();
      return { desvios, tiros, campo, touch: G.Touch.enabled, mobile: document.documentElement.classList.contains('mobile'),
        secao: getComputedStyle(document.querySelector('#settings .touchOnly')).display,
        cfgSalvo: S };
    });
    const maxMouse = Math.max(...r.desvios.map(d => d.mouse));
    const maxFrame = Math.max(...r.desvios.map(d => d.frame));
    const mexeu = r.desvios.filter(d => d.mx !== 0).length;
    console.log(`  [d] ${mexeu} frames com mouse · maior giro do frame por cima do mouse: ` +
      `${(maxFrame * 180 / Math.PI).toExponential(3)}° · desvio do mouse ${maxMouse.toExponential(3)} rad`);
    assert.notEqual(r.campo, null, 'cenário inválido: sem direção de campo aberto');
    assert.equal(r.touch, false, 'cenário inválido: o desktop ligou a camada de toque');
    assert.ok(mexeu > 100, `cenário inválido: o mouse quase não mexeu (${mexeu} frames)`);
    assert.ok(maxMouse < 1e-9, `o mouse não girou o que mandou (${maxMouse} rad)`);
    assert.ok(maxFrame < 1e-9, `o frame girou a câmera por conta própria no desktop: ${maxFrame} rad`);
    assert.equal(r.tiros, 0, 'o desktop disparou sozinho');
    assert.equal(r.secao, 'none', 'a seção de controles de toque apareceu no desktop');
    assert.equal(r.cfgSalvo.touchAutoFire, 1, 'cenário inválido: o automático não nasceu ligado');
    assert.equal(r.cfgSalvo.touchAssist, 1);
  });
});
