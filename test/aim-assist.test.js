/* ================================================================
   QA — ASSISTÊNCIA DE MIRA E TIRO AUTOMÁTICO NO JOGO DE VERDADE.

   O núcleo (test/aim-assist-core.test.js) prova a matemática. Este prova
   a FIAÇÃO no jogo real (?mobile=1, viewport de celular com hasTouch):
     (b) rastrear um alvo que anda de lado: erro angular médio COM vs SEM
         assistência, em graus;
     (c) alvo que o jogador NÃO vê (atrás do CAMINHÃO militar, atrás do
         relevo, fora da cena): a vista sai IDÊNTICA com e sem assistência —
         e "não vê" é medido na TELA (dois renders do mesmo quadro, com e sem
         o alvo, pixels que mudam na caixa dele), nunca pela linha de visada
         do próprio produto. O caso antigo escondia o boneco atrás de um bloco
         de `Structures.walls`: exatamente o que o `rayBlockedAt` do produto
         conhece, e um bloco que a tela nem desenha — não podia falhar
         (docs/mobile/validacao-7515734.md §4.4);
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
  const evt = (el, type, id, x, y, tipo = 'touch') => el.dispatchEvent(new PointerEvent(type, {
    pointerId: id, pointerType: tipo, isPrimary: id === 1,
    clientX: x, clientY: y, bubbles: true, cancelable: true }));
  const _f = new THREE.Vector3(), _o = new THREE.Vector3(), _v = new THREE.Vector3();
  const _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const A = window.AQA = {
    alvos: [],
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
      // `combate: true`: o boneco faz o papel de um INIMIGO (A8-e — o automático
      // só dispara no que é alvo de combate; ver o caso do campo de tiro)
      const t = { group: g, alive: true, enabled: true, acertos: 0, dy, combate: true,
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
    },
    /* ÂNCORA DE TELA (a do validador): pixels que mudam na caixa projetada
       das esferas do alvo entre dois renders do MESMO quadro, com e sem ele.
       Independente da linha de visada do produto. */
    px(t) {
      const R = MP.renderer, gl = R.getContext(), cam = MP.camera;
      const cw = R.domElement.width, ch = R.domElement.height;
      cam.updateMatrixWorld(true);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const s of t.hitSpheres()) for (const [ox, oy, oz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const v = _v.set(s.c.x + ox * s.r * 1.3, s.c.y + oy * s.r * 1.3, s.c.z + oz * s.r * 1.3).project(cam);
        if (v.z > 1) continue;
        const px = (v.x + 1) / 2 * cw, py = (v.y + 1) / 2 * ch;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(cw - 1, Math.ceil(x1)); y1 = Math.min(ch - 1, Math.ceil(y1));
      if (!(x1 >= x0 && y1 >= y0)) return 0;
      const w = x1 - x0 + 1, hh = y1 - y0 + 1, a = new Uint8Array(w * hh * 4), b = new Uint8Array(w * hh * 4);
      const obj = t.group || t.mesh;   // o disco do campo de tiro é uma malha solta
      const vis = obj.visible;
      obj.visible = true; R.render(MP.scene, cam); gl.readPixels(x0, y0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, a);
      obj.visible = false; R.render(MP.scene, cam); gl.readPixels(x0, y0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, b);
      obj.visible = vis;
      let n = 0;
      for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 6) n++;
      return n;
    },
    /* O CAMINHÃO MILITAR de verdade (o oclusor que o validador mediu): o
       jogador a 15 m dele, olhando para ele; o alvo atrás, andando ±0,6 m de
       lado. `lado` desloca o alvo para o lado (controle positivo). O
       esconderijo é ESCOLHIDO PELA TELA, nas 8 direções do laudo do validador
       e a 1,6 ou 2,2 m do centro: o primeiro em que o alvo some da tela em
       toda a passada (0 px) e o controle aparece nela inteiro — o vão do
       chassi mostra as pernas de quem está de lado, e o acampamento em volta
       de um dos caminhões esconde o controle. `null` = nenhum serve (o caso
       diz "cenário inválido"); `A.tentativas` guarda o que cada um mediu. */
    cenarioCaminhao: undefined, tentativas: [],
    caminhao() {
      if (A.cenarioCaminhao !== undefined) return A.cenarioCaminhao;
      A.cenarioCaminhao = null;
      const cam = MP.camera;
      const ver = (C, lado) => {       // px mínimo e máximo ao longo da passada
        QA.reset(C.olho.x, C.olho.z); QA.tick(4);
        const a0 = C.alvo(lado), t = A.criar(a0.x, a0.z);
        let lo = Infinity, hi = 0;
        for (let k = 0; k < 6; k++) {
          const p = C.alvo(lado + 0.6 * Math.sin(2 * Math.PI * k / 6));
          A.pos(t, p.x, p.z);
          const o = cam.position, c = t.group.position;
          A.mirarYaw(Math.atan2(-(c.x - o.x), -(c.z - o.z)), Math.atan2(c.y + 1.1 - o.y, Math.hypot(c.x - o.x, c.z - o.z)));
          const n = A.px(t); lo = Math.min(lo, n); hi = Math.max(hi, n);
        }
        A.limpar();
        return { lo, hi };
      };
      for (const v of G.Car.vehicles.filter(c => /CAMINH/.test(c.cfg.name))) {
        const p = v.group.position;
        for (let k = 0; k < 8; k++) for (const atras of [1.6, 2.2]) {
          const ang = k * Math.PI / 4, sx = Math.cos(ang), sz = Math.sin(ang), px = -sz, pz = sx;
          const C = { olho: { x: p.x - sx * 15, z: p.z - sz * 15 },
            alvo: (lado = 0) => ({ x: p.x + sx * atras + px * lado, z: p.z + sz * atras + pz * lado }) };
          const esc = ver(C, 0);
          const tent = { caminhao: [+p.x.toFixed(1), +p.z.toFixed(1)], k, atras, escondido: esc };
          A.tentativas.push(tent);
          if (esc.hi !== 0) continue;
          const ctl = ver(C, 5);
          tent.controle = ctl;
          if (ctl.lo < 100) continue;
          A.cenarioCaminhao = C;
          return C;
        }
      }
      return null;
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
    rastrear(t, { frames = 210, atraso = 9, ganho = 0.12, mover = () => {}, id = 31, tipo = 'touch' } = {}) {
      const el = document.querySelector('#tcLook');
      const r = el.getBoundingClientRect();
      let px = r.left + r.width / 2, py = r.top + r.height / 2;
      evt(el, 'pointerdown', id, px, py, tipo);
      const hist = [], erros = [], yaws = [];
      for (let i = 0; i < frames; i++) {
        mover(i);
        hist.push(A.erroYP(t));
        const e = hist[Math.max(0, hist.length - 1 - atraso)];
        const sens = G.Touch.lookSens;               // rad/px do QUADRIL
        px += -e.yaw * ganho / sens;
        py += -e.pitch * ganho / (sens * G.Touch.cfg.ratioY);
        evt(el, 'pointermove', id, px, py, tipo);
        QA.tick(1);
        erros.push(A.erro(t));
        yaws.push(A.olhar().yaw);
      }
      evt(el, 'pointerup', id, px, py, tipo);
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
  function cenarioLateral(assist, { tipo = 'touch', bandeiras = {} } = {}) {
    return play((ligada, tipo, bandeiras) => {
      const A = window.AQA;
      A.limpar();
      A.ajuste('setTAssist', ligada ? 1 : 0);
      A.posicionar();
      const p0 = A.ponto(20);
      const t = A.criar(p0.x, p0.z);
      /* bandeiras que br-game.js publica (nave/queda: __BR_freeze; espectador:
         __BR_espectador) — ligadas SÓ durante o rastreio */
      const antes = {};
      for (const k in bandeiras) { antes[k] = window[k]; window[k] = bandeiras[k]; }
      let r;
      try {
        r = A.rastrear(t, {
          tipo,
          mover: i => { const p = A.ponto(20, 2 * Math.sin(2 * Math.PI * (i / 60) / 2.5)); A.pos(t, p.x, p.z); },
        });
      } finally {
        for (const k in antes) window[k] = antes[k];
      }
      A.limpar();
      return { erros: r.erros, yaws: r.yaws };
    }, assist, tipo, bandeiras);
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

  /* A1 (docs/mobile/criterio-aaa.md): assistência é do DEDO. O portão era
     `Touch.enabled` — com `?mobile=1` no desktop, arrastar #tcLook com o
     MOUSE recebia assistência com precisão de mouse. E nave, queda e
     espectador (onde `player.dead` é falso) não estavam no portão. O controle
     positivo é o caso (b): o mesmo rastreio com o dedo MUDA a vista. */
  const difMax = (a, b) => Math.max(...a.map((y, i) => Math.abs(y - b[i])));
  for (const [nome, opt] of [
    ['mouse arrastando a área de mira', { tipo: 'mouse' }],
    ['caneta arrastando a área de mira', { tipo: 'pen' }],
    ['nave/queda (__BR_freeze)', { bandeiras: { __BR_freeze: true } }],
    ['espectador (__BR_espectador)', { bandeiras: { __BR_espectador: true } }],
  ]) {
    it(`A1: dado ${nome}, então a assistência não mexe na vista (0 rad)`, async () => {
      assert.notEqual(campo, null, 'cenário inválido: nenhuma direção de campo aberto');
      const sem = await cenarioLateral(false, opt);
      const com = await cenarioLateral(true, opt);
      const d = difMax(sem.yaws, com.yaws);
      console.log(`  [A1 ${nome}] maior diferença de yaw com × sem assistência: ${graus(d).toExponential(3)}°`);
      assert.ok(d < 1e-9, `assistência agiu com ${nome}: ${graus(d).toFixed(4)}° de diferença`);
    });
  }

  /* ---- (c) quem o jogador NÃO vê ---- */
  function cenarioEscondido(assist, esconder) {
    return play((ligada, modo) => {
      const QA = window.QA, A = window.AQA, MP = QA.MP;
      A.limpar();
      A.ajuste('setTAssist', ligada ? 1 : 0);
      A.posicionar();
      const p0 = A.ponto(20);
      const t = A.criar(p0.x, p0.z);
      if (modo === 'invisivel') t.group.visible = false;    // dentro de carro/heli
      if (modo === 'forada cena') MP.scene.remove(t.group);
      const r = A.rastrear(t, {
        mover: i => { const p = A.ponto(20, 2 * Math.sin(2 * Math.PI * (i / 60) / 2.5)); A.pos(t, p.x, p.z); },
      });
      A.limpar();
      return { erros: r.erros, yaws: r.yaws };
    }, assist, esconder);
  }

  /* ATRÁS DO CAMINHÃO: o dedo rastreia o alvo que anda ±0,6 m de lado atrás
     do caminhão. A cada 20 quadros a TELA é conferida (0 px = escondido de
     verdade); `lado` desloca o alvo para fora da ponta (controle: visível). */
  function cenarioCaminhao(assist, lado = 0) {
    return play((ligada, lado) => {
      const QA = window.QA, A = window.AQA;
      A.limpar();
      const C = A.caminhao();
      if (!C) return null;
      A.ajuste('setTAssist', ligada ? 1 : 0);
      QA.reset(C.olho.x, C.olho.z);
      QA.tick(10);
      const a0 = C.alvo(lado);
      const t = A.criar(a0.x, a0.z);
      const o = QA.MP.camera.position;
      A.mirarYaw(Math.atan2(-(a0.x - o.x), -(a0.z - o.z)) + 0.05, 0);   // 2,9° fora: o dedo tem trabalho
      const pxs = [];
      const r = A.rastrear(t, { frames: 150,
        mover: i => {
          const p = C.alvo(lado + 0.6 * Math.sin(2 * Math.PI * (i / 60) / 2.5));
          A.pos(t, p.x, p.z);
          if (i % 20 === 0) pxs.push(A.px(t));
        },
      });
      A.limpar();
      return { erros: r.erros, yaws: r.yaws, pxs };
    }, assist, lado);
  }

  it('(c) dado o alvo atrás do CAMINHÃO militar (0 px na tela), então a vista sai IDÊNTICA com e sem assistência', async () => {
    const sem = await cenarioCaminhao(false), com = await cenarioCaminhao(true);
    if (!sem || !com) console.log('  [c:caminhão] tentativas: ' + JSON.stringify(await play(() => window.AQA.tentativas)));
    assert.ok(sem && com, 'cenário inválido: nenhum lado de caminhão esconde o alvo na tela e mostra o controle');
    let maior = 0;
    for (let i = 0; i < sem.yaws.length; i++) maior = Math.max(maior, Math.abs(sem.yaws[i] - com.yaws[i]));
    console.log(`  [c:caminhão] px na tela ${JSON.stringify(com.pxs)} · maior diferença de yaw: ${graus(maior).toExponential(3)}°`);
    assert.deepEqual(com.pxs.filter(n => n > 0), [], `cenário inválido: o alvo apareceu na tela (${com.pxs})`);
    assert.ok(graus(media(sem.erros, 30)) > 0.3, 'cenário inválido: o dedo não teve trabalho nenhum');
    assert.equal(maior, 0, `a assistência mexeu na vista por um alvo que a tela não mostra: ${graus(maior)}°`);
  });

  it('(c) controle: o MESMO alvo saindo da ponta do caminhão (visível), então a assistência mexe na vista', async () => {
    const sem = await cenarioCaminhao(false, 5), com = await cenarioCaminhao(true, 5);
    assert.ok(sem && com, 'cenário inválido: nenhum lado de caminhão esconde o alvo na tela e mostra o controle');
    let maior = 0;
    for (let i = 0; i < sem.yaws.length; i++) maior = Math.max(maior, Math.abs(sem.yaws[i] - com.yaws[i]));
    console.log(`  [c:caminhão-controle] px na tela ${JSON.stringify(com.pxs)} · maior diferença de yaw: ${graus(maior).toFixed(3)}°`);
    assert.ok(Math.min(...com.pxs) > 100, `cenário inválido: o alvo não estava visível (${com.pxs})`);
    assert.ok(maior > 1e-4, 'a assistência não agiu num alvo visível ao lado do caminhão');
  });

  for (const modo of ['invisivel', 'forada cena']) {
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
    /* a busca antiga escolhia o esconderijo pelo `rayBlockedAt` do produto —
       e o ponto que ela achava aparecia na TELA (84 px, medido). Agora a
       linha de visada do tiro só faz a pré-seleção (barata); quem decide que
       o relevo esconde é a tela: 0 px com a cruz em cima do alvo. */
    const achado = await play(() => {
      const QA = window.QA, MP = QA.MP, THREE = MP.THREE, A = window.AQA;
      QA.reset(30, 30);
      QA.tick(4);
      const olho = MP.camera.position.clone();
      const d = new THREE.Vector3();
      let testados = 0;
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
          if (!tudo) continue;
          const t = A.criar(x, z);
          A.mirarYaw(Math.atan2(-(x - olho.x), -(z - olho.z)), Math.atan2(g + 1.1 - olho.y, Math.hypot(x - olho.x, z - olho.z)));
          const px = A.px(t);
          A.limpar();
          testados++;
          if (px === 0) return { x, z, az: a, dist, testados };
          if (testados > 40) return null;
        }
      }
      return null;
    });
    assert.ok(achado, 'cenário inválido: nenhum ponto que o relevo esconda NA TELA em 70 m');
    const rodar = ligada => play((lig, p) => {
      const QA = window.QA, A = window.AQA, MP = QA.MP;
      A.limpar();
      A.ajuste('setTAssist', lig ? 1 : 0);
      QA.reset(30, 30);
      QA.tick(10);
      const t = A.criar(p.x, p.z);
      // a TELA confirma o esconderijo (a busca acima usou a régua do produto)
      const o = MP.camera.position, c = t.group.position;
      A.mirarYaw(Math.atan2(-(c.x - o.x), -(c.z - o.z)), Math.atan2(c.y + 1.1 - o.y, Math.hypot(c.x - o.x, c.z - o.z)));
      const px = A.px(t);
      A.mirarYaw(p.az + 0.08);                 // começa 4,6° fora: o dedo tem trabalho
      const r = A.rastrear(t, { frames: 120 });
      A.limpar();
      return Object.assign(r, { px });
    }, ligada, achado);
    const sem = await rodar(false), com = await rodar(true);
    let maior = 0;
    for (let i = 0; i < sem.yaws.length; i++) maior = Math.max(maior, Math.abs(sem.yaws[i] - com.yaws[i]));
    console.log(`  [c:relevo] alvo a ${achado.dist} m, azimute ${graus(achado.az).toFixed(0)}° (${achado.testados}º pré-selecionado), ${com.px} px na tela · ` +
      `maior diferença de yaw: ${graus(maior).toExponential(3)}°`);
    assert.equal(com.px, 0, `cenário inválido: o relevo não esconde o alvo na tela (${com.px} px)`);
    assert.equal(maior, 0, `a assistência mexeu na vista por um alvo atrás do relevo: ${graus(maior)}°`);
  });

  /* ---- tiro automático ---- */
  /* `desvio`: metros de lado entre a cabeça do boneco e o ponto onde a cruz
     é posta (0 = cruz no centro da cabeça) */
  function autoFire({ dist = 25, arma = 0, ajuste = 1, desvio = 0 }) {
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
      // cruz no centro da cabeça (ou `desvio` m ao lado dela), vista do olho
      const olho = QA.MP.camera.position;
      const q = A.ponto(o.dist, o.desvio);
      const ax = q.x, ay = t.group.position.y + 1.66, az = q.z;
      A.mirarYaw(Math.atan2(-(ax - olho.x), -(az - olho.z)),
        Math.atan2(ay - olho.y, Math.hypot(ax - olho.x, az - olho.z)));
      const visivel = A.livre(A.ponto(o.dist));   // validade do cenário, pela régua do tiro
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
    }, { dist, arma, ajuste, desvio });
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

  /* ATRÁS DO CAMINHÃO, com a cruz na cabeça do alvo e a TELA conferindo que
     ele não aparece; controle: o mesmo alvo 5 m para fora da ponta dispara */
  function autoFireCaminhao(lado) {
    return play(lado => {
      const QA = window.QA, A = window.AQA, G = QA.G;
      A.limpar();
      const C = A.caminhao();
      if (!C) return null;
      A.ajuste('setTAuto', 1);
      QA.reset(C.olho.x, C.olho.z);
      QA.tick(10);
      G.switchWeapon(0);
      QA.tick(40);
      G.gun.mag = G.gun.magSize; G.gun.reloading = false;
      const p = C.alvo(lado);
      const t = A.criar(p.x, p.z);
      const o = QA.MP.camera.position, c = t.group.position;
      A.mirarYaw(Math.atan2(-(c.x - o.x), -(c.z - o.z)), Math.atan2(c.y + 1.66 - o.y, Math.hypot(c.x - o.x, c.z - o.z)));
      const px = A.px(t);
      const mag0 = G.gun.mag;
      let segurou = false;
      for (let i = 0; i < 40; i++) { QA.tick(1); segurou = segurou || G.mouse.shooting; }
      const out = { px, gastou: mag0 - G.gun.mag, segurou };
      A.ajuste('setTAuto', 0);
      QA.tick(2);
      A.limpar();
      return out;
    }, lado);
  }

  it('dado o tiro automático e o alvo ATRÁS DO CAMINHÃO (0 px na tela), então NÃO dispara', async () => {
    const r = await autoFireCaminhao(0);
    assert.ok(r, 'cenário inválido: nenhum lado de caminhão esconde o alvo na tela e mostra o controle');
    console.log(`  [auto:caminhão] ${r.px} px na tela · ${r.gastou} tiros`);
    assert.equal(r.px, 0, `cenário inválido: o alvo aparecia na tela (${r.px} px)`);
    assert.equal(r.gastou, 0, `disparou ${r.gastou} vezes num alvo que a tela não mostra`);
    assert.equal(r.segurou, false);
    // controle: 5 m para fora da ponta, visível — o automático dispara (o caso exercita o limiar)
    const k = await autoFireCaminhao(5);
    assert.ok(k.px > 100, `cenário inválido: o controle não estava visível (${k.px} px)`);
    assert.ok(k.gastou > 0, 'cenário inválido: nem com o alvo visível ao lado do caminhão o automático disparou');
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

  /* A8(e) — docs/mobile/criterio-aaa.md: "0 com a retícula sobre algo que não
     é jogador/bot/inimigo PvE". O validador (validacao-6aeda6c.md) mediu 10
     disparos nos discos do CAMPO DE TIRO (js/maptoys.js): eles entram em
     `extraTargets` durante o minijogo, a mesma lista dos esqueletos e zumbis.
     Controle: o MESMO disco, declarado alvo de combate, dispara — só a
     categoria muda entre os dois casos (geometria, tela e cruz iguais). */
  function campoDeTiro(declararCombate) {
    return play(declararCombate => {
      const QA = window.QA, A = window.AQA, G = QA.G, MP = QA.MP;
      A.limpar();
      const lever = G.MapToys.gallery.leverPos;     // o painel fica 3,4 m atrás da alavanca
      QA.reset(lever.x + 4.6, lever.z + 12);
      QA.tick(20);
      A.ajuste('setTAuto', 1);
      G.MapToys.startGallery();
      QA.tick(90);                                   // os discos sobem
      const discos = G.extraTargets.filter(t => t.mesh && t.alive && t.enabled !== false);
      if (!discos.length) return { discos: 0 };
      const d = discos[0];
      d.respawn = 1e9;                               // o disco não desce no meio da medida
      if (declararCombate) d.combate = true;
      const g = G.arsenal[0], trava = g.locked;
      g.locked = false; G.switchWeapon(0); QA.tick(40);
      g.mag = g.magSize; g.reserve = 999; g.reloading = false;
      const o = MP.camera.position, c = d.mesh.position;
      const mirar = () => A.mirarYaw(Math.atan2(-(c.x - o.x), -(c.z - o.z)),
        Math.atan2(c.y - o.y, Math.hypot(c.x - o.x, c.z - o.z)));
      /* PONTO DE OBSERVAÇÃO ESCOLHIDO PELA TELA. O campo de tiro vem do sorteio
         que corre depois das construções, então muda de lugar quando o layout
         muda (2a7dae6): do ponto fixo antigo o disco ficou com 100 px e a
         grama cobrindo a linha — a assistência parada ali está CERTA. O caso
         exige disco bem visível e linha sem grama; procura esse ponto em volta
         da alavanca em vez de assumir um. */
      let px = 0;
      const cx = c.x, cz = c.z;   // o estande também GIRA com o layout: círculo em volta do DISCO
      achar: for (const dist of [12, 9, 15]) {
        for (let k = 0; k < 16; k++) {
          const a = k * Math.PI / 8;
          QA.reset(cx + Math.sin(a) * dist, cz + Math.cos(a) * dist);
          /* a grama em volta do ponto se refaz: espera a FILA zerar — com um
             número fixo de quadros a busca parava em pontos diferentes a cada
             rodada (9 m ou 12 m), conforme o que já tinha sido refeito */
          for (let q = 0; q < 600 && (q < 10 || G.Grass.pendentes > 0); q++) QA.tick(1);
          mirar();
          QA.tick(1);
          px = A.px(d);
          if (px > 300 && !G.Oclusao.gramaCobre(o, c, 0.3)) break achar;
        }
      }
      g.mag = g.magSize; g.reloading = false;
      mirar();
      /* o dedo mexe devagar no olhar (a assistência só age com o jogador
         mirando) e nunca toca o gatilho */
      const el = document.querySelector('#tcLook'), r = el.getBoundingClientRect();
      let x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const ev = (type, xx) => el.dispatchEvent(new PointerEvent(type, { pointerId: 41, pointerType: 'touch',
        isPrimary: false, clientX: xx, clientY: y, bubbles: true, cancelable: true }));
      ev('pointerdown', x);
      const mag0 = g.mag;
      let noDisco = 0;
      for (let i = 0; i < 60; i++) {
        x += (i % 20 < 10 ? 0.3 : -0.3); ev('pointermove', x);
        QA.tick(1);
        if (G.AimAssist.last.target === d) noDisco++;
      }
      ev('pointerup', x);
      const out = { discos: discos.length, px, gastou: mag0 - g.mag, noDisco, dedo: G.Touch.core.pressed('fire'),
        dist: +Math.hypot(c.x - o.x, c.y - o.y, c.z - o.z).toFixed(1) };
      delete d.combate;
      A.ajuste('setTAuto', 0);
      QA.tick(2);
      g.locked = trava;
      return out;
    }, declararCombate);
  }

  it('A8(e): dado o tiro automático e a cruz num disco do CAMPO DE TIRO, então NÃO dispara — e a assistência age nele', async () => {
    const r = await campoDeTiro(false);
    console.log(`  [auto:campo de tiro] ${r.discos} discos, ${r.px} px, ${r.dist} m · ${r.gastou} tiros · ` +
      `assistência no disco em ${r.noDisco} de 60 quadros`);
    assert.ok(r.discos > 0, 'cenário inválido: o campo de tiro não levantou disco');
    assert.ok(r.px > 100, `cenário inválido: o disco não estava na tela (${r.px} px)`);
    assert.equal(r.dedo, false, 'cenário inválido: tinha dedo no gatilho');
    assert.equal(r.gastou, 0, `o automático disparou ${r.gastou} vezes num disco do campo de tiro`);
    // decisão documentada em js/aimassist.js: o campo de tiro é treino de MIRA — a assistência age
    assert.ok(r.noDisco >= 30, `a assistência deixou de agir no disco (${r.noDisco} de 60 quadros)`);
    // CONTROLE: o mesmo disco, declarado alvo de combate, dispara (o caso exercita o portão)
    const k = await campoDeTiro(true);
    assert.ok(k.gastou > 0, `cenário inválido: nem declarado combate o disco levou tiro (${k.gastou})`);
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
    /* 7 da rodada da assistência + "curso do analógico" e "aceleração do
       olhar" (8506731, frente de toque) */
    assert.equal(r.linhas, 9);
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
