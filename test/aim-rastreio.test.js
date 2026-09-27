/* ================================================================
   QA — A5 NO JOGO: a assistência nunca PIORA o rastreio
   (docs/mobile/criterio-aaa.md A5-c; laudo docs/mobile/validacao-7515734.md).

   O validador mediu, no jogo, com o dedo que COPIA o movimento do alvo
   atrasado 150 ms e o alvo a 30 °/s: a 20 m o erro médio subia de 4,34°
   para 4,64° com a assistência (+7 %). O núcleo puro reproduz a causa
   (test/aim-assist-core.test.js, A5): o pull empurrava a cruz para ALÉM do
   alvo e o slow a travava adiantada — na virada do alvo ela estava do lado
   errado. Este arquivo mede no JOGO, pelo caminho real do dedo (#tcLook,
   PointerEvent de toque, `applyTouchLook`), a 10/20/30 m e 5/30/60 °/s, com
   três jogadores de 150 ms de atraso:
     · cópia   — o do validador: repete o giro do alvo de 150 ms atrás;
     · fechado — corrige o erro que via 150 ms atrás (ganho 0,12/quadro);
     · misto   — as duas coisas.
   Régua: o ângulo entre a frente da câmera e a direção do alvo, que sai da
   posição do alvo no mundo — nunca a saída da assistência.

   Porta 4021.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');

const PORT = 4021;
const V3 = { width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

function instalar() {
  const QA = window.QA, G = QA.G, MP = QA.MP, THREE = MP.THREE, cam = MP.camera;
  for (const e of G.Enemies.list) { e.alive = false; if (e.group) e.group.visible = false; }
  const DEG = Math.PI / 180;
  const el = document.getElementById('tcLook');
  const evt = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: 41, pointerType: 'touch', isPrimary: true,
    clientX: x, clientY: y, bubbles: true, cancelable: true }));
  /* A BASE: o alvo percorre, em volta dela, TODO o arco que o roteiro
     visita — a 10, 20 e 30 m, de −95° a +35° (a 60 °/s ele varre 120° antes
     de virar). Em cada ponto do arco o chão está a ±1,5 m do da base e a
     cabeça e o tronco têm linha livre do olho (a do tiro e a da tela). Sem
     isso o alvo passava atrás de árvore e relevo justo na virada, a
     assistência (corretamente) não agia, e o número mudava de rodada para
     rodada. Escolha de CENÁRIO — a régua da medida continua sendo o ângulo. */
  const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = { x: 0, y: 0, z: 0 };
  const livre = (x, z) => {
    const h0 = G.heightAt(x, z);
    if (h0 < 1.5) return false;
    _o.set(x, h0 + 1.62, z);
    for (const R of [10, 20, 30]) for (let a = -95; a <= 35; a += 5) {
      const ar = a * DEG, tx = x - Math.sin(ar) * R, tz = z - Math.cos(ar) * R, ty = G.heightAt(tx, tz);
      if (Math.abs(ty - h0) > 1.5) return false;
      for (const hh of [1.66, 1.1]) {
        _p.x = tx; _p.y = ty + hh; _p.z = tz;
        _d.set(tx - x, _p.y - _o.y, tz - z);
        const len = _d.length(); _d.multiplyScalar(1 / len);
        if (MP.rayBlockedAt(_o, _d, len) < len - 0.3 || G.Oclusao.tampa(_o, _p, 0.3)) return false;
      }
    }
    return true;
  };
  let BASE = null;
  // alvo: o mesmo desenho de esferas do jogador remoto (br-game.js)
  const g = new THREE.Group();
  const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.9, 0.4), new THREE.MeshBasicMaterial());
  corpo.position.y = 0.95; g.add(corpo); MP.scene.add(g);
  const sph = [[1.66, 0.28, 'head'], [1.10, 0.42, 'body'], [0.42, 0.34, 'body']].map(([h, r, part]) => ({ c: new THREE.Vector3(), r, part, h }));
  const alvo = { group: g, alive: true, enabled: true,
    hitSpheres() { for (const s of sph) s.c.set(g.position.x, g.position.y + s.h, g.position.z); return sph; },
    damage() { return false; } };
  G.extraTargets.push(alvo);
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const yaw = () => e.setFromQuaternion(cam.quaternion).y;
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  window.RAS = {
    get base() { return BASE; },
    acharBase() {
      for (let x = -400; x <= 400 && !BASE; x += 10) for (let z = -400; z <= 400 && !BASE; z += 10) if (livre(x, z)) BASE = [x, z];
      return BASE;
    },
    rodar(R, vel, modelo, ligada, frames) {
      const s = document.getElementById('setTAssist'); s.value = ligada ? '1' : '0'; s.dispatchEvent(new Event('change'));
      QA.reset(BASE[0], BASE[1]); QA.tick(60);
      G.AimAssist.reset();
      const P = MP.player.pos, w = vel * DEG / 60;
      let ang = -Math.PI / 2;
      const poe = () => { const x = P.x - Math.sin(ang) * R, z = P.z - Math.cos(ang) * R; g.position.set(x, G.heightAt(x, z), z); g.updateMatrixWorld(true); };
      poe();
      const o = cam.position;
      cam.quaternion.setFromEuler(new THREE.Euler(Math.atan2(g.position.y + 1.1 - o.y, R), ang, 0, 'YXZ'));
      const hist = [], errH = [];
      const r = el.getBoundingClientRect();
      let x = r.left + r.width / 2, y = r.top + r.height / 2;
      evt('pointerdown', x, y);
      let soma = 0;
      for (let f = 0; f < frames; f++) {
        const sg = Math.floor(f / 120) % 2 === 0 ? 1 : -1;
        ang += sg * w; hist.push(sg * w); poe();
        // o dedo: giro que ele pede neste quadro (rad), convertido em px pela sensibilidade do quadril
        const eAtras = errH[Math.max(0, errH.length - 1 - 9)] || 0;
        const copia = f >= 9 ? hist[f - 9] : 0;
        const pede = modelo === 'copia' ? copia : modelo === 'fechado' ? eAtras * 0.12 : copia + eAtras * 0.06;
        x += -pede / G.Touch.lookSens;
        evt('pointermove', x, y);
        QA.tick(1);
        // régua: direção do alvo (centro do tronco) contra a frente da câmera, no plano
        const err = wrap(Math.atan2(-(g.position.x - o.x), -(g.position.z - o.z)) - yaw());
        errH.push(err);
        soma += Math.abs(err);
      }
      evt('pointerup', x, y);
      QA.tick(1);
      return soma / frames / DEG;
    },
  };
}

describe('A5 no jogo — a assistência nunca piora o rastreio (10/20/30 m × 5/30/60 °/s)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: PORT, query: '?mobile=1', viewport: V3 });
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
    const base = await h.play(() => window.RAS.acharBase());
    console.log(`  [base] ${JSON.stringify(base)}`);
    assert.ok(base, 'cenário inválido: nenhuma base com o arco inteiro do alvo à vista');
  });
  after(async () => { if (h) await h.close(); });

  for (const modelo of ['copia', 'fechado', 'misto']) {
    it(`dado o dedo "${modelo}" com 150 ms de atraso, então o erro médio COM assistência é menor que SEM em todos`, async () => {
      const linhas = [], piores = [];
      for (const R of [10, 20, 30]) for (const vel of [5, 30, 60]) {
        const r = await h.play((R, vel, modelo) => {
          const sem = window.RAS.rodar(R, vel, modelo, false, 360);
          const com = window.RAS.rodar(R, vel, modelo, true, 360);
          return { sem, com };
        }, R, vel, modelo);
        const pct = 100 * (r.com / r.sem - 1);
        const l = `${R} m ${vel} °/s: ${r.sem.toFixed(3)}° → ${r.com.toFixed(3)}° (${pct >= 0 ? '+' : ''}${pct.toFixed(1)} %)`;
        linhas.push(l);
        if (!(r.com < r.sem)) piores.push(l);
      }
      console.log(`  [A5 jogo ${modelo}] sem → com\n    ` + linhas.join('\n    '));
      assert.deepEqual(piores, [], `a assistência PIOROU o rastreio no jogo:\n${piores.join('\n')}`);
    });
  }

  it('dado o caminho, então nenhum erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
