/* ================================================================
   QA — o tiro do BR passa pela RETÍCULA DO QUADRO EM QUE É DESENHADO,
   no celular (V3 844×390, ?mobile=1), nos três caminhos de `fire()`.

   HISTÓRICO. No BR as armas com `projSpeed` não são hitscan: `fire()`
   entrega origem e direção a `window.__BR_ballistics`. Fora de VR essa
   origem era a BOCA DO CANO, com a direção da câmera — duas retas paralelas
   separadas pelo deslocamento da arma na tela: 29–31 cm no quadril, CONSTANTE
   em 10, 25 e 50 m (corrigido em `2ed48e7`).

   ESTE ARQUIVO PASSAVA POR ACIDENTE DUAS VEZES (laudo `7515734`, §4):
   1. Congelava a câmera ANTES do tick do disparo e mirava PARADA. O defeito
      que sobrava era de ORDEM DO QUADRO: `shootUpdate` rodava antes de
      `applyTouchLook` e a posição da câmera só era escrita no
      `applyFpsCamera` — o tiro saía pela câmera do quadro ANTERIOR. Arrastando
      o ATIRAR a 4 px/quadro (≈ 44 °/s) eram 0,733° = 64 cm a 50 m; andando de
      lado no talo, 8,7–9,7 cm de origem. Com a câmera congelada antes do tick e
      o dedo parado, o cenário não exercitava nada disso (formato 9).
   2. A velocidade da bala era lida da TABELA (`gun.projSpeed`) e a conta feita
      no próprio teste. Com `__BR_ballistics` lançando a 200 m/s o caso ficava
      verde (formato 2). Agora a bala é medida EM VOO.

   ÂNCORA INDEPENDENTE: a câmera do quadro DESENHADO — `camera.matrixWorld`
   lida depois do tick (o tick chama `camera.updateMatrixWorld()` imediatamente
   antes do render), projetada para PIXELS do canvas. É isso que o jogador vê:
   a retícula é o centro do canvas. O raio do tiro é o que o próprio disparo
   usou (o que `__BR_ballistics` recebeu, ou `origemDoTiro/direcaoDoTiro` no
   hitscan e no foguete); se `fire()` ler uma câmera velha, os dois divergem.

   RECUO NÃO É ZERADO, de propósito. O coice do próprio tiro entra na câmera
   do quadro SEGUINTE; o que já estava no ar entra antes do disparo. Assim a
   bala sai pela retícula desenhada em todo tiro da rajada, não só no primeiro.
   Só o ESPALHAMENTO é zerado (é outro assunto): `spreadHip/spreadAds = 0` e
   `Math.random = () => 0` durante a medida.

   Porta 3952.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness');

const PORT = 3952;
/* o celular da suíte (iPhone 14 deitado). `?mobile=1` liga o toque. */
const V3 = { width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const FUZIL = 0, ESCOPETA = 1, DMR = 2, BAZUCA = 3, PLASMA = 4, SNIPER = 6, RAJADA = 7;

/* Instalado NA PÁGINA, uma vez. Nada aqui cria Object3D no boot: roda depois
   do mundo gerado. */
function instalarSonda() {
  const QA = window.QA, G = QA.G, MP = QA.MP, THREE = MP.THREE;
  const tela = MP.renderer.domElement;
  const toque = (sel, type, id, x, y) => document.querySelector(sel).dispatchEvent(new PointerEvent(type, {
    pointerId: id, pointerType: 'touch', isPrimary: id === 1,
    clientX: x, clientY: y, bubbles: true, cancelable: true }));
  const centro = sel => {
    const r = document.querySelector(sel).getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  const _inv = new THREE.Matrix4();
  /* a câmera do quadro desenhado, congelada no instante do evento */
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
  window.MQA = {
    toque, centro,
    /* Arma pronta, depois `quadros` ticks; `antes(k)` despacha a entrada do
       quadro k (dedo, tecla) ANTES do tick, como o navegador entrega o evento
       entre dois quadros. Devolve cada tiro medido contra a câmera DO QUADRO
       em que ele saiu. */
    rodada({ arma, ads = false, quadros = 1, antes = () => {} }) {
      const g = G.arsenal[arma];
      QA.reset();
      g.locked = false;
      G.switchWeapon(arma);
      g.mag = g.magSize; g.reloading = false; g.lastShot = -99;
      QA.tick(40);
      const P = MP.player.pos;
      QA.aimAt(P.x + 50, P.y + 1.62, P.z);
      G.mouse.aiming = ads;
      QA.tick(ads ? 60 : 10);
      QA.aimAt(P.x + 50, P.y + 1.62, P.z);
      const sh = g.spreadHip, sa = g.spreadAds, rnd = Math.random;
      const orig = window.__BR_ballistics;
      const tiros = [], fotos = [];
      let quadro = -1;
      g.spreadHip = 0; g.spreadAds = 0;
      Math.random = () => 0;
      if (orig) window.__BR_ballistics = (o, d, gun) => {
        tiros.push({ o: o.clone(), d: d.clone(), quadro, via: 'projétil' });
        return orig(o, d, gun);   // captura E repassa: o tiro acontece de verdade
      };
      try {
        for (let k = 0; k < quadros; k++) {
          quadro = k;
          antes(k);
          const mag0 = g.mag, n0 = tiros.length;
          QA.tick(1);
          fotos[k] = fotografar();
          if (g.mag < mag0 && tiros.length === n0) tiros.push({
            o: new THREE.Vector3().fromArray(G.origemDoTiro()),
            d: new THREE.Vector3().fromArray(G.direcaoDoTiro()),
            quadro: k, via: g.rocket ? 'foguete' : 'hitscan' });
        }
      } finally {
        if (orig) window.__BR_ballistics = orig;
        g.spreadHip = sh; g.spreadAds = sa;
        Math.random = rnd;
        G.Touch.releaseAll();
        G.mouse.shooting = false; G.mouse.clicked = false; G.mouse.aiming = false;
      }
      return tiros.map(s => ({ arma: g.name, ads, quadro: s.quadro, via: s.via, ...medir(s.o, s.d, fotos[s.quadro]) }));
    },
  };
}

/* ≤ 1 cm e ≤ 1 px nas três distâncias (M1). O foguete tem régua própria. */
function foraDaRetícula(medidas, rotulo) {
  const ruins = [];
  for (const m of medidas) {
    if (m.via === 'foguete') continue;
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

describe('BR no celular: o tiro sai pela retícula do quadro desenhado', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, host;
  before(async () => {
    h = await bootGame({ port: PORT, query: '?mobile=1', viewport: V3,
      extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '300' } });
    /* sala sem golem, visitante, bichos, gás nem cinemática da cidade: nada
       pode andar até a frente da cruz, parar a bala ou tomar a câmera no meio
       da medida (o golem vagando até o jogador parava a bala do caso em voo) */
    host = await startBRMatch(h, { serverPort: PORT,
      flags: { golem: false, alien: false, animais: false, cidade: false, gas: 'off' } });
    await h.play(async () => {
      const G = window.QA.G;
      await G.WeaponModels.ready;
      for (let i = 0; i < 200 && !(G.FpBody.ready || G.FpBody.failed); i++)
        await new Promise(r => setTimeout(r, 100));
      /* nenhum alvo perto da cruz: a assistência de mira não entra neste arquivo.
         E os ESQUELETOS do PvE do BR ficam fora: eles caçam o jogador e param
         no rosto dele — a bala do caso em voo acertava a cabeça de um a 1 m
         da boca (diagnosticado: `blood`/`head` em (31, 7, 30), 0 m de voo). */
      for (const e of G.Enemies.list) { e.alive = false; if (e.group) e.group.visible = false; }
      G.Skeletons.setEnabled(false);
    });
    await h.play(instalarSonda);
  });
  after(async () => {
    if (host) host.close();
    if (h) await h.close();
  });

  it('dado o dedo PARADO no ATIRAR, então a bala cruza a retícula a 10/25/50 m em toda arma de projétil', async () => {
    const medidas = await h.play(({ armas }) => {
      const M = window.MQA, out = [];
      const [fx, fy] = M.centro('.tcBtn[data-act="fire"]');
      for (const arma of armas) for (const ads of [false, true]) {
        out.push(...M.rodada({ arma, ads, quadros: 1,
          antes: () => M.toque('.tcBtn[data-act="fire"]', 'pointerdown', 5, fx, fy) }));
        M.toque('.tcBtn[data-act="fire"]', 'pointerup', 5, fx, fy);
      }
      return out;
    }, { armas: [FUZIL, DMR, PLASMA, SNIPER] });
    assert.ok(medidas.filter(m => m.via === 'projétil').length >= 8,
      `esperava 4 armas de projétil × 2 posturas, veio ${JSON.stringify(medidas.map(m => m.arma + '/' + m.via))}`);
    resumo('parado', medidas);
    const ruins = foraDaRetícula(medidas, 'parado');
    assert.deepEqual(ruins, [], 'a bala tem de cruzar a retícula desenhada (≤ 1 cm e ≤ 1 px):\n' + ruins.join('\n'));
  });

  /* M1/C1: o polegar ARRASTA o ATIRAR (mira e atira com o mesmo dedo). O giro
     daquele quadro tem de estar na câmera que o tiro usa — é a mesma câmera que
     o quadro desenha. 4 px/quadro ≈ 44 °/s no quadril; 10 px/quadro ≈ 110 °/s. */
  for (const passo of [4, 10]) {
    it(`dado o dedo ARRASTANDO o ATIRAR a ${passo} px/quadro, então todo tiro sai pela retícula do seu quadro (projétil, hitscan)`, async () => {
      const medidas = await h.play(({ armas, passo }) => {
        const M = window.MQA, out = [];
        const sel = '.tcBtn[data-act="fire"]';
        const [fx, fy] = M.centro(sel);
        for (const arma of armas) for (const ads of [false, true]) {
          let x = fx;
          out.push(...M.rodada({ arma, ads, quadros: 14, antes: k => {
            if (k === 0) M.toque(sel, 'pointerdown', 6, fx, fy);
            x += passo;
            M.toque(sel, 'pointermove', 6, x, fy);   // arrasto que termina NESTE quadro
          } }));
          M.toque(sel, 'pointerup', 6, x, fy);
        }
        return out;
      }, { armas: [FUZIL, ESCOPETA, DMR, PLASMA, SNIPER, RAJADA], passo });
      const vias = new Set(medidas.map(m => m.via));
      assert.ok(vias.has('projétil') && vias.has('hitscan'), `cenário não exercitou os dois caminhos: ${[...vias]}`);
      /* controle positivo: o dedo girou a câmera de verdade entre os quadros */
      assert.ok(medidas.length >= 12, `poucos tiros medidos (${medidas.length})`);
      resumo(`arrasto ${passo} px`, medidas);
      const ruins = foraDaRetícula(medidas, `arrasto ${passo} px`);
      assert.deepEqual(ruins, [], 'com o dedo girando no quadro do disparo a bala saiu de outra câmera:\n' + ruins.join('\n'));
    });
  }

  it('dado o dedo arrastando o ATIRAR com a BAZUCA, então o foguete voa PARALELO à retícula (afastamento constante)', async () => {
    const medidas = await h.play(() => {
      const M = window.MQA, out = [];
      const sel = '.tcBtn[data-act="fire"]';
      const [fx, fy] = M.centro(sel);
      for (const ads of [false, true]) {
        let x = fx;
        out.push(...M.rodada({ arma: 3, ads, quadros: 2, antes: k => {
          if (k === 0) M.toque(sel, 'pointerdown', 7, fx, fy);
          x += 4;
          M.toque(sel, 'pointermove', 7, x, fy);
        } }));
        M.toque(sel, 'pointerup', 7, x, fy);
      }
      return out;
    });
    const foguetes = medidas.filter(m => m.via === 'foguete');
    console.log('  [bazuca] ' + foguetes.map(m => `${m.ads ? 'mira' : 'quadril'} ${m.graus.toFixed(5)}° · ` +
      [10, 25, 50].map(D => `${m.cm[D].toFixed(2)} cm@${D}`).join(' ')).join(' | '));
    assert.equal(foguetes.length, 2, `esperava 1 foguete no quadril e 1 na mira, veio ${JSON.stringify(medidas)}`);
    const ruins = [];
    for (const m of foguetes) {
      const cms = [10, 25, 50].map(D => m.cm[D]);
      const faixa = Math.max(...cms) - Math.min(...cms);
      /* zeragem pelo 1º obstáculo é proibida (CLAUDE.md): convergir faz o
         impacto andar entre um tiro e outro. Paralelo = ângulo 0 e afastamento
         igual nas três distâncias. */
      if (m.graus > 0.01 || faixa > 0.5)
        ruins.push(`${m.ads ? 'mira' : 'quadril'}: ${m.graus.toFixed(3)}° da retícula, afastamento ` +
          cms.map((c, i) => `${c.toFixed(1)} cm @${[10, 25, 50][i]} m`).join(' / '));
    }
    assert.deepEqual(ruins, [], 'o foguete não voa paralelo à linha de mira desenhada:\n' + ruins.join('\n'));
  });

  /* M1: andando de lado no talo do analógico. A posição da câmera era escrita
     só no applyFpsCamera, DEPOIS do tiro: a origem ficava um passo atrás
     (8,7–9,7 cm no laudo). */
  it('dado o analógico no talo de lado, então a origem do tiro é a câmera desenhada (projétil, hitscan, foguete)', async () => {
    const medidas = await h.play(({ armas }) => {
      const M = window.MQA, out = [];
      const [mx, my] = M.centro('#tcMove');
      const [fx, fy] = M.centro('.tcBtn[data-act="fire"]');
      for (const arma of armas) {
        out.push(...M.rodada({ arma, quadros: 26, antes: k => {
          if (k === 0) { M.toque('#tcMove', 'pointerdown', 8, mx, my); M.toque('#tcMove', 'pointermove', 8, mx + 58, my); }
          if (k === 22) M.toque('.tcBtn[data-act="fire"]', 'pointerdown', 9, fx, fy);
        } }));
        M.toque('.tcBtn[data-act="fire"]', 'pointerup', 9, fx, fy);
        M.toque('#tcMove', 'pointerup', 8, mx + 58, my);
      }
      return out;
    }, { armas: [FUZIL, DMR, ESCOPETA, BAZUCA] });
    assert.ok(medidas.length >= 4, `esperava ≥ 4 tiros andando, veio ${medidas.length}`);
    resumo('andando de lado', medidas);
    const ruins = foraDaRetícula(medidas, 'andando de lado');
    for (const m of medidas.filter(x => x.via === 'foguete')) {
      const cms = [10, 25, 50].map(D => m.cm[D]);
      if (m.graus > 0.01 || Math.max(...cms) - Math.min(...cms) > 0.5)
        ruins.push(`foguete andando: ${m.graus.toFixed(3)}°, ${cms.map(c => c.toFixed(1)).join(' / ')} cm`);
    }
    assert.deepEqual(ruins, [], 'andando de lado o tiro saiu de uma câmera atrasada:\n' + ruins.join('\n'));
  });

  /* VELOCIDADE DE BALA DE FUZIL É DE GÊNERO, NÃO DE GOSTO. O BR nasceu com o
     fuzil a 200 m/s: um alvo correndo a 5 m/s a 50 m pedia 1,25 m de
     antecipação. Referências (docs/mobile/referencia-mira-toque.md): Fortnite,
     "assault rifles ... are all hitscan"; Apex R-301 "equals to 736 meters per
     second"; PUBG M416 ~880 m/s. O plasma fica de fora: arma de energia.

     MEDIDA EM VOO. A bala entregue ao br-game é seguida quadro a quadro do rAF
     (o `brTick` integra no relógio da página): velocidade = caminho andado ÷
     tempo entre quadros (intervalos > 90 ms descartados — o `brTick` corta o
     passo em 0,1 s), queda = distância abaixo da reta de lançamento quando a
     bala passa de 100 m. Nada vem da tabela `gun.projSpeed`. */
  it('dado fuzil/DMR/sniper no BR, então a bala EM VOO chega a 100 m em ≤ 0,15 s e cai ≤ 10 cm', async () => {
    const r = await h.play(async ({ armas }) => {
      const QA = window.QA, G = QA.G, MP = QA.MP;
      const quadro = () => new Promise(res => requestAnimationFrame(() => res(performance.now())));
      const out = [];
      for (const i of armas) {
        const g = G.arsenal[i];
        QA.reset();
        g.locked = false;
        G.switchWeapon(i);
        g.mag = g.magSize; g.reloading = false; g.lastShot = -99;
        QA.tick(40);
        const P = MP.player.pos;
        /* 4° acima do horizonte: o relevo não corta a bala antes de 100 m */
        QA.aimAt(P.x + 50, P.y + 1.62 + 50 * Math.tan(4 * Math.PI / 180), P.z);
        const orig = window.__BR_ballistics;
        let bala = null;
        /* pega a PRÓPRIA bala: `__BR_ballistics` faz `origin.clone()` e
           `dir.clone()` para montar `p` e `v`, que o brTick integra depois */
        window.__BR_ballistics = (o, d, gun) => {
          const cl = o.clone;
          bala = {};
          o.clone = function () { const c = cl.call(this); bala.p = c; return c; };
          d.clone = function () { const c = cl.call(this); bala.v = c; return c; };
          try { return orig(o, d, gun); } finally { delete o.clone; delete d.clone; }
        };
        try { G.mouse.shooting = true; G.mouse.clicked = true; QA.tick(1); }
        finally { G.mouse.shooting = false; G.mouse.clicked = false; window.__BR_ballistics = orig; }
        if (!bala || !bala.p || !bala.v) { out.push({ arma: g.name, erro: 'nenhuma bala entregue ao br-game' }); continue; }
        const p0 = bala.p.clone(), v0 = bala.v.clone();
        const hz0 = Math.hypot(v0.x, v0.z), tg = v0.y / hz0;
        const am = [{ t: performance.now(), p: p0.clone() }];
        for (let n = 0; n < 90; n++) {
          const t = await quadro();
          am.push({ t, p: bala.p.clone() });
          if (Math.hypot(bala.p.x - p0.x, bala.p.z - p0.z) > 110) break;
        }
        const vel = [];
        for (let k = 2; k < am.length; k++) {
          const dt = (am[k].t - am[k - 1].t) / 1000, ds = am[k].p.distanceTo(am[k - 1].p);
          if (dt > 0.004 && dt < 0.09 && ds > 0) vel.push(ds / dt);
        }
        vel.sort((a, b) => a - b);
        const v = vel.length ? vel[vel.length >> 1] : 0;
        let queda = null;
        for (let k = 1; k < am.length; k++) {
          const h1 = Math.hypot(am[k].p.x - p0.x, am[k].p.z - p0.z);
          if (h1 < 100) continue;
          const h0 = Math.hypot(am[k - 1].p.x - p0.x, am[k - 1].p.z - p0.z);
          const f = (100 - h0) / (h1 - h0);
          const y = am[k - 1].p.y + (am[k].p.y - am[k - 1].p.y) * f;
          queda = p0.y + 100 * tg - y;
          break;
        }
        out.push({ arma: g.name, v, amostras: vel.length, t100: v > 0 ? 100 / v : null, queda100: queda,
          trilha: am.slice(0, 8).map((a, k) => k ? `${(a.t - am[k - 1].t).toFixed(0)}ms/${a.p.distanceTo(am[k - 1].p).toFixed(1)}m` : 'disparo').join(' ') });
      }
      return out;
    }, { armas: [FUZIL, DMR, SNIPER] });
    console.log('  [em voo] ' + r.map(m => m.erro ? m.erro : `${m.arma}: ${m.v.toFixed(0)} m/s, ${m.t100 === null ? '∞' : m.t100.toFixed(3)} s, ` +
      `${m.queda100 === null ? '—' : (m.queda100 * 100).toFixed(1)} cm @100 m (${m.amostras} intervalos)`).join(' · '));
    assert.equal(r.length, 3, 'esperava fuzil, DMR e sniper');
    const ruins = [];
    for (const m of r) {
      if (m.erro) { ruins.push(`${m.arma}: ${m.erro}`); continue; }
      if (m.amostras < 3) { ruins.push(`${m.arma}: só ${m.amostras} intervalos de voo medidos (${m.trilha})`); continue; }
      if (m.queda100 === null) { ruins.push(`${m.arma}: a bala não chegou a 100 m (v = ${m.v.toFixed(0)} m/s)`); continue; }
      if (m.t100 === null || m.t100 > 0.15 || m.queda100 > 0.10)
        ruins.push(`${m.arma}: ${m.v.toFixed(0)} m/s em voo → ${m.t100 === null ? '∞' : m.t100.toFixed(3)} s e ${(m.queda100 * 100).toFixed(1)} cm a 100 m`);
    }
    assert.deepEqual(ruins, [], 'bala de fuzil lenta demais para o gênero (medida em voo):\n' + ruins.join('\n'));
  });
});
