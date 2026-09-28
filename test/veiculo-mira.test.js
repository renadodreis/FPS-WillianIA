/* ================================================================
   QA — M6 NO VEÍCULO: a bala sai pela retícula que o quadro DESENHA.

   O DEFEITO (laudo `6aeda6c`, M6). A ordem nova do quadro (`9a17c3a`)
   resolveu a vista ANTES do tiro só a pé; helicóptero, a volta da câmera de
   perseguição ao sair do veículo (`driveBlend`) e a cinemática ficaram na
   ordem antiga. Voando, o `Heli.update` e a câmera de perseguição rodavam
   DEPOIS do `shootUpdate`: o disparo lia a câmera do QUADRO ANTERIOR. Medido
   pelo validador: o 1º tiro 0,5 s depois de entrar no helicóptero passava a
   72 / 55 / 26 cm do ponto que a retícula indica a 10 / 25 / 50 m (0,676° de
   eixo), acima do raio da cabeça (28 cm).

   E havia uma segunda reta: a origem do tiro voando é o helicóptero (1,6 m
   acima do grupo) e a linha de mira é a da câmera de perseguição, 10,5 m atrás
   e 4,2 m acima. As duas são PARALELAS e separadas: 15–16 cm pairando, mais em
   voo para a frente, quando a câmera fica para trás. Erro de ORIGEM não fecha
   em distância nenhuma (CLAUDE.md, três caminhos do tiro).

   ÂNCORA: a câmera DESENHADA no quadro do disparo — `camera.matrixWorld` lida
   depois do tick (o tick chama `updateMatrixWorld()` logo antes do render),
   com `setFromMatrixPosition`, e a projeção daquele quadro para pixels do
   canvas. Nada lido de `miraDoTiro()` (comparar o raio com a mira que o gerou
   é comparar uma reta consigo mesma). As distâncias contam a partir de QUEM
   ATIRA (o ponto da linha de mira na altura do helicóptero), não da câmera
   10 m atrás — é a convenção do laudo: "10 m" é o alvo a 10 m do jogador.

   Espalhamento zerado (`spread = 0`, `Math.random = () => 0`). Portas: 4030
   (celular V3 844×390) e 4031 (desktop).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

const PORT_V3 = 4030;
const PORT_DESKTOP = 4031;
const V3 = { width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
/* teto do caso: 1 cm e 1 px. O critério (M6) aceita até o raio da cabeça,
   28 cm; este arquivo cobra o que a construção entrega — a bala NA linha de
   mira — para que um erro constante de origem (que o critério deixaria passar
   pairando e reprovaria em voo) apareça aqui primeiro. */
const TETO_CM = 1, TETO_PX = 1;

function instalarSonda() {
  const QA = window.QA, G = QA.G, MP = QA.MP, THREE = MP.THREE;
  const tela = MP.renderer.domElement;
  for (const e of G.Enemies.list) { e.alive = false; if (e.group) e.group.visible = false; }
  G.Skeletons.setEnabled(false);
  const toque = (el, type, id, x, y) => el.dispatchEvent(new PointerEvent(type, {
    pointerId: id, pointerType: 'touch', isPrimary: id === 1,
    clientX: x, clientY: y, bubbles: true, cancelable: true }));
  const centro = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const btn = act => document.querySelector(`.tcBtn[data-act="${act}"]`);
  const _inv = new THREE.Matrix4();
  /* a câmera DESTE quadro, depois do tick: é a que o render desenharia */
  const fotografar = () => ({ mundo: MP.camera.matrixWorld.clone(), proj: MP.camera.projectionMatrix.clone() });
  function medir(o, d, foto) {
    const co = new THREE.Vector3().setFromMatrixPosition(foto.mundo);
    const cf = new THREE.Vector3(0, 0, -1).transformDirection(foto.mundo);
    _inv.copy(foto.mundo).invert();
    const W = tela.clientWidth, H = tela.clientHeight;
    const base = o.clone().sub(co).dot(cf);   // profundidade de quem atira na vista
    const cm = {}, px = {};
    for (const D of [10, 25, 50]) {
      const P = co.clone().addScaledVector(cf, base + D);      // o que a retícula indica
      const p = o.clone().addScaledVector(d, D / d.dot(cf));   // a bala na mesma profundidade
      cm[D] = p.distanceTo(P) * 100;
      const n = p.clone().applyMatrix4(_inv).applyMatrix4(foto.proj);
      px[D] = Math.hypot(n.x * W / 2, n.y * H / 2);
    }
    const graus = Math.acos(Math.min(1, d.clone().normalize().dot(cf))) * 180 / Math.PI;
    return { cm, px, graus };
  }
  /* onde a bala nasceu contra o helicóptero DESENHADO (o grupo depois do
     tick, 1,6 m acima): a distância, e a ESTAÇÃO — quanto ela nasceu à frente
     (+) ou atrás (−) dele ao longo da vista. A bala pode sair do lado ou de
     cima do heli (é a linha de mira que passa ali), mas não de onde o
     helicóptero estava no quadro anterior: a 22 m/s são 37 cm para trás. */
  function doHeli(o, foto) {
    const heli = new THREE.Vector3().copy(G.Heli.group.position); heli.y += 1.6;
    const cf = new THREE.Vector3(0, 0, -1).transformDirection(foto.mundo);
    return { doHeli: o.distanceTo(heli), estacao: o.clone().sub(heli).dot(cf) };
  }
  /* sobe no helicóptero pelo caminho do jogo. Celular: USAR tocado; desktop:
     `tryToggleCar`, que é o que o KeyE do `Interact` chama. */
  function entrarNoHeli(celular) {
    QA.reset();
    const hp = G.Heli.group.position;
    MP.player.pos.set(hp.x + 3, hp.y, hp.z);
    QA.tick(20);
    if (celular) {
      const u = btn('use'); const [x, y] = centro(u);
      toque(u, 'pointerdown', 71, x, y); toque(u, 'pointerup', 71, x, y);
      QA.tick(1);
    } else G.tryToggleCar();
    return !!G.state.flying;
  }
  function armar(arma) {
    const g = G.arsenal[arma];
    g.locked = false; G.switchWeapon(arma);
    g.mag = g.magSize; g.reloading = false; g.lastShot = -99; g.reserve = 999;
    return g;
  }
  /* `quadros` ticks; `antes(k)` despacha a entrada do quadro k. Cada disparo
     volta medido contra a câmera do quadro em que saiu. */
  function rodada(g, quadros, antes) {
    const sh = g.spreadHip, sa = g.spreadAds, rnd = Math.random;
    const tiros = [];
    g.spreadHip = 0; g.spreadAds = 0; Math.random = () => 0;
    try {
      for (let k = 0; k < quadros; k++) {
        antes(k);
        const mag0 = g.mag;
        QA.tick(1);
        if (g.mag >= mag0) continue;
        const foto = fotografar();
        const o = new THREE.Vector3().fromArray(G.origemDoTiro());
        const d = new THREE.Vector3().fromArray(G.direcaoDoTiro());
        tiros.push({ quadro: k, via: g.rocket ? 'foguete' : 'hitscan', voando: !!G.state.flying,
          ...doHeli(o, foto), ...medir(o, d, foto) });
      }
    } finally {
      g.spreadHip = sh; g.spreadAds = sa; Math.random = rnd;
    }
    return tiros;
  }
  window.VMQA = { toque, centro, btn, fotografar, medir, doHeli, entrarNoHeli, armar, rodada };
}

function ruinsDe(tiros, rotulo) {
  const ruins = [];
  for (const m of tiros) {
    if (m.voando && Math.abs(m.estacao) > 0.02)
      ruins.push(`${rotulo} · quadro ${m.quadro}: a bala nasceu ${m.estacao.toFixed(3)} m ` +
        `${m.estacao < 0 ? 'atrás' : 'à frente'} do helicóptero desenhado (ao longo da vista)`);
    if (m.via === 'foguete') continue;
    for (const D of [10, 25, 50]) if (m.cm[D] > TETO_CM || m.px[D] > TETO_PX)
      ruins.push(`${rotulo} · quadro ${m.quadro} @${D} m do atirador: ${m.cm[D].toFixed(2)} cm / ` +
        `${m.px[D].toFixed(2)} px da retícula (${m.graus.toFixed(3)}°)`);
  }
  return ruins;
}
function resumo(rotulo, tiros) {
  const hs = tiros.filter(m => m.via !== 'foguete');
  const cm = Math.max(0, ...hs.flatMap(m => [10, 25, 50].map(D => m.cm[D])));
  const px = Math.max(0, ...hs.flatMap(m => [10, 25, 50].map(D => m.px[D])));
  const gr = Math.max(0, ...tiros.map(m => m.graus));
  const voando = tiros.filter(m => m.voando);
  const dh = voando.length ? ` · origem até ${Math.max(...voando.map(m => m.doHeli)).toFixed(2)} m do helicóptero, ` +
    `estação ${Math.max(...voando.map(m => Math.abs(m.estacao))).toFixed(3)} m` : '';
  console.log(`  [${rotulo}] ${tiros.length} tiros · pior: ${cm.toFixed(3)} cm, ${px.toFixed(3)} px, ${gr.toFixed(4)}°${dh}`);
}

describe('M6 voando — celular V3 (USAR e ATIRAR pelo toque)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: PORT_V3, query: '?mobile=1', viewport: V3 });
    await h.play(instalarSonda);
  });
  after(async () => { if (h) await h.close(); });

  it('dado o 1º tiro 0,5 s depois de entrar pelo USAR (câmera ainda chegando), então a bala passa pela retícula desenhada', async () => {
    const r = await h.play(() => {
      const M = window.VMQA, G = window.QA.G, QA = window.QA;
      const g = M.armar(0); QA.tick(40);
      const voando = M.entrarNoHeli(true);
      QA.tick(29);                               // + o tick do USAR = 0,5 s
      M.armar(0);
      const f = M.btn('fire'); const [x, y] = M.centro(f);
      const tiros = [];
      try {
        for (let i = 0; i < 3; i++) {
          tiros.push(...M.rodada(g, 1, () => M.toque(f, 'pointerdown', 72, x, y)));
          M.toque(f, 'pointerup', 72, x, y);
          QA.tick(20);
        }
      } finally { G.Touch.releaseAll(); if (G.state.flying) G.tryToggleCar(); }
      return { voando, tiros };
    });
    assert.equal(r.voando, true, 'cenário inválido: o USAR não pôs o jogador no helicóptero');
    assert.equal(r.tiros.length, 3, `esperava 3 tiros voando, saíram ${r.tiros.length}`);
    assert.ok(r.tiros.every(m => m.voando), 'algum tiro saiu fora do helicóptero');
    resumo('1º tiro após entrar', r.tiros);
    const ruins = ruinsDe(r.tiros, '1º tiro após entrar');
    assert.deepEqual(ruins, [], 'voando, a bala saiu pela câmera do quadro ANTERIOR:\n' + ruins.join('\n'));
  });

  it('dado o voo para a frente fazendo curva (analógico) com o dedo no ATIRAR, então toda bala sai pela retícula do seu quadro', async () => {
    const r = await h.play(() => {
      const M = window.VMQA, G = window.QA.G, QA = window.QA;
      const g = M.armar(0); QA.tick(40);
      const voando = M.entrarNoHeli(true);
      const jb = M.btn('jump'); const [jx, jy] = M.centro(jb);
      M.toque(jb, 'pointerdown', 73, jx, jy); QA.tick(90);   // sobe ~10 m
      M.toque(jb, 'pointerup', 73, jx, jy); QA.tick(30);
      const mv = document.getElementById('tcMove'); const [mx, my] = M.centro(mv);
      const f = M.btn('fire'); const [fx, fy] = M.centro(f);
      const tiros = [];
      let vel;
      try {
        /* frente e direita no talo: `KeyW` + `KeyD` do volante (acelera e guina) */
        M.toque(mv, 'pointerdown', 74, mx, my);
        M.toque(mv, 'pointermove', 74, mx + 120, my - 120);
        QA.tick(60);                            // a câmera de perseguição fica para trás
        g.mag = g.magSize;
        tiros.push(...M.rodada(g, 40, k => { if (k === 0) M.toque(f, 'pointerdown', 75, fx, fy); }));
        vel = Math.hypot(G.Heli.vel.x, G.Heli.vel.z);
      } finally {
        M.toque(f, 'pointerup', 75, fx, fy); M.toque(mv, 'pointerup', 74, mx, my);
        G.Touch.releaseAll(); if (G.state.flying) G.tryToggleCar();
      }
      return { voando, tiros, vel };
    });
    assert.equal(r.voando, true, 'cenário inválido: não entrou no helicóptero');
    assert.ok(r.vel > 10, `cenário inválido: o helicóptero não estava voando para a frente (${r.vel.toFixed(1)} m/s)`);
    assert.ok(r.tiros.length >= 3, `poucos tiros em voo (${r.tiros.length})`);
    resumo(`em voo a ${r.vel.toFixed(1)} m/s`, r.tiros);
    const ruins = ruinsDe(r.tiros, 'em voo');
    /* a bala nasce NO helicóptero (o servidor valida a origem contra a posição
       autoritativa, que voando é o grupo do heli): o que se move é só a altura
       e o lado sobre a linha de mira, nunca a câmera 10 m atrás */
    for (const m of r.tiros) if (m.doHeli > 5)
      ruins.push(`quadro ${m.quadro}: origem a ${m.doHeli.toFixed(2)} m do helicóptero`);
    assert.deepEqual(ruins, [], 'em voo a bala descolou da retícula:\n' + ruins.join('\n'));
  });

  /* O CAMINHO DO BR (CLAUDE.md: o tiro tem TRÊS caminhos). Fora de partida o
     fuzil não tem `projSpeed`; aqui ele ganha um, e `__BR_ballistics` vira
     uma sonda que guarda o que o `fire()` ENTREGOU a ela — origem, direção e
     a boca congelada, de onde br-game.js desenha o traçante e replica o erro
     (`shotFired`, que o servidor recusa a mais de 5 m da posição autoritativa
     — voando, o grupo do helicóptero). */
  it('dado o caminho do BR (__BR_ballistics) voando, então o projétil sai pela retícula e o traçante nasce no helicóptero', async () => {
    const r = await h.play(() => {
      const M = window.VMQA, G = window.QA.G, QA = window.QA, THREE = QA.MP.THREE;
      const g = M.armar(0); QA.tick(40);
      const voando = M.entrarNoHeli(true);
      QA.tick(29);
      M.armar(0);
      const ps = g.projSpeed, orig = window.__BR_ballistics, rnd = Math.random, sh = g.spreadHip;
      let cap;
      const f = M.btn('fire'); const [x, y] = M.centro(f);
      const tiros = [];
      g.projSpeed = 715.7; g.spreadHip = 0; Math.random = () => 0;
      window.__BR_ballistics = (o, d) => {
        cap = { o: o.clone(), d: d.clone(), boca: new THREE.Vector3().fromArray(G.canoPosDoTiro()) };
      };
      try {
        for (let i = 0; i < 3; i++) {
          cap = null;
          M.toque(f, 'pointerdown', 77, x, y);
          QA.tick(1);
          M.toque(f, 'pointerup', 77, x, y);
          if (cap) {
            const foto = M.fotografar();
            const heli = new THREE.Vector3().copy(G.Heli.group.position); heli.y += 1.6;
            tiros.push({ quadro: i, via: 'BR', voando: !!G.state.flying, ...M.doHeli(cap.o, foto),
              bocaDoHeli: cap.boca.distanceTo(heli), ...M.medir(cap.o, cap.d, foto) });
          }
          QA.tick(20);
        }
      } finally {
        window.__BR_ballistics = orig; g.projSpeed = ps; g.spreadHip = sh; Math.random = rnd;
        G.Touch.releaseAll(); if (G.state.flying) G.tryToggleCar();
      }
      return { voando, tiros };
    });
    assert.equal(r.voando, true, 'cenário inválido: não entrou no helicóptero');
    assert.equal(r.tiros.length, 3, `esperava 3 projéteis do BR, saíram ${r.tiros.length}`);
    resumo('caminho do BR, 1º tiro após entrar', r.tiros);
    const ruins = ruinsDe(r.tiros, 'caminho do BR');
    for (const m of r.tiros) if (m.bocaDoHeli > 0.01)
      ruins.push(`quadro ${m.quadro}: o traçante do BR nasce a ${m.bocaDoHeli.toFixed(2)} m do helicóptero`);
    assert.deepEqual(ruins, [], ruins.join('\n'));
  });

  it('dada a BAZUCA voando, então o foguete nasce no helicóptero e voa PARALELO à retícula do quadro', async () => {
    const r = await h.play(() => {
      const M = window.VMQA, G = window.QA.G, QA = window.QA;
      const voando = M.entrarNoHeli(true);
      QA.tick(29);
      const g = M.armar(3);
      QA.tick(40);
      g.mag = g.magSize; g.lastShot = -99;
      const f = M.btn('fire'); const [x, y] = M.centro(f);
      let tiros;
      try {
        tiros = M.rodada(g, 1, () => M.toque(f, 'pointerdown', 76, x, y));
      } finally { M.toque(f, 'pointerup', 76, x, y); G.Touch.releaseAll(); if (G.state.flying) G.tryToggleCar(); }
      return { voando, tiros };
    });
    assert.equal(r.voando, true, 'cenário inválido: não entrou no helicóptero');
    assert.equal(r.tiros.length, 1, 'o foguete não saiu');
    const m = r.tiros[0];
    const cms = [10, 25, 50].map(D => m.cm[D]);
    console.log(`  [foguete voando] ${m.graus.toFixed(4)}° da retícula; afastamento ` +
      cms.map((c, i) => `${c.toFixed(1)} cm@${[10, 25, 50][i]}`).join(' ') + `; nasce a ${m.doHeli.toFixed(3)} m do heli`);
    assert.ok(m.doHeli < 0.01, `o foguete (projétil VISÍVEL) tem de nascer no helicóptero: nasceu a ${m.doHeli.toFixed(3)} m`);
    assert.ok(m.graus <= 0.01, `o foguete não voa paralelo à retícula do quadro: ${m.graus.toFixed(4)}°`);
    assert.ok(Math.max(...cms) - Math.min(...cms) <= 0.5, `afastamento variando com a distância (converge): ${cms.map(c => c.toFixed(1)).join(' / ')} cm`);
    /* paralelo e constante não bastam: com a vista num lugar e o helicóptero
       noutro, o foguete voa paralelo a 46 m da retícula (medido reinjetando a
       reescrita do olho por cima da perseguição). O afastamento legítimo é o
       quanto o heli fica fora da linha de mira — 10–23 cm pairando —, muito
       menor que o estilhaço de 7,5 m. */
    assert.ok(Math.max(...cms) <= 200, `o foguete voa longe da retícula: ${Math.max(...cms).toFixed(1)} cm`);
  });
});

describe('M6 voando e na volta do veículo — desktop', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: PORT_DESKTOP });
    await h.play(instalarSonda);
  });
  after(async () => { if (h) await h.close(); });

  it('dado o 1º tiro 0,5 s depois de entrar no helicóptero (teclado e mouse), então a bala passa pela retícula desenhada', async () => {
    const r = await h.play(() => {
      const M = window.VMQA, G = window.QA.G, QA = window.QA;
      const g = M.armar(0); QA.tick(40);
      const voando = M.entrarNoHeli(false);
      QA.tick(30);
      M.armar(0);
      let tiros;
      try {
        tiros = M.rodada(g, 12, k => { if (k === 0) { G.mouse.shooting = true; G.mouse.clicked = true; } });
      } finally { G.mouse.shooting = false; G.mouse.clicked = false; if (G.state.flying) G.tryToggleCar(); }
      return { voando, tiros };
    });
    assert.equal(r.voando, true, 'cenário inválido: não entrou no helicóptero');
    assert.ok(r.tiros.length >= 2, `poucos tiros (${r.tiros.length})`);
    resumo('desktop, entrando', r.tiros);
    const ruins = ruinsDe(r.tiros, 'desktop entrando');
    assert.deepEqual(ruins, [], ruins.join('\n'));
  });

  /* SAIR DO HELICÓPTERO: a câmera de perseguição volta para o olho do
     jogador. `carCameraUpdate` escolhia o alvo por `state.flying ? Heli :
     Car`, e na volta `state.flying` já é falso: a câmera ia buscar o CARRO,
     onde quer que ele estivesse. Medido: com o carro a 378 m, a câmera saltou
     31,75 m no 1º quadro depois de sair. Âncora: a distância da câmera
     desenhada ao olho do jogador, que só pode DIMINUIR na volta. */
  it('dado sair do helicóptero, então a câmera volta para o jogador (não para o carro) e o tiro sai pela retícula desenhada', async () => {
    const r = await h.play(() => {
      const M = window.VMQA, G = window.QA.G, QA = window.QA, MP = QA.MP, THREE = MP.THREE;
      const g = M.armar(0); QA.tick(40);
      const voando = M.entrarNoHeli(false);
      G.keys.Space = true; QA.tick(60); G.keys.Space = false;
      QA.tick(60);
      const carro = G.Car.group.position.distanceTo(G.Heli.group.position);
      G.tryToggleCar();                          // sai
      const olho = () => new THREE.Vector3(MP.player.pos.x, MP.player.pos.y + 1.62, MP.player.pos.z);
      const cam = () => new THREE.Vector3().setFromMatrixPosition(MP.camera.matrixWorld);
      QA.tick(1);
      const d0 = cam().distanceTo(olho());
      let maxDist = d0, maxSalto = 0, prev = cam();
      for (let i = 0; i < 20; i++) {
        QA.tick(1);
        const c = cam();
        maxDist = Math.max(maxDist, c.distanceTo(olho()));
        maxSalto = Math.max(maxSalto, c.distanceTo(prev));
        prev = c;
      }
      /* ainda na volta (driveBlend alto): tiro */
      M.armar(0);
      let tiros;
      try {
        tiros = M.rodada(g, 12, k => { if (k === 0) { G.mouse.shooting = true; G.mouse.clicked = true; } });
      } finally { G.mouse.shooting = false; G.mouse.clicked = false; }
      QA.tick(120);
      const fim = cam().distanceTo(olho());
      return { voando, carro, d0, maxDist, maxSalto, fim, tiros };
    });
    assert.equal(r.voando, true, 'cenário inválido: não entrou no helicóptero');
    console.log(`  [saída do heli] carro a ${r.carro.toFixed(0)} m; câmera a ${r.d0.toFixed(2)} m do olho ao sair, ` +
      `máx ${r.maxDist.toFixed(2)} m, maior salto ${r.maxSalto.toFixed(2)} m/quadro, ${r.fim.toFixed(3)} m 2 s depois`);
    assert.ok(r.maxDist <= r.d0 + 0.5,
      `a câmera se AFASTOU do jogador ao sair do helicóptero: ${r.d0.toFixed(2)} → ${r.maxDist.toFixed(2)} m ` +
      `(foi buscar o carro a ${r.carro.toFixed(0)} m)`);
    assert.ok(r.fim < 0.05, `a câmera não voltou ao olho: ${r.fim.toFixed(3)} m`);
    assert.ok(r.tiros.length >= 2, `poucos tiros na volta (${r.tiros.length})`);
    resumo('volta do heli', r.tiros);
    const ruins = ruinsDe(r.tiros, 'volta do heli');
    assert.deepEqual(ruins, [], 'na volta da câmera o tiro saiu pela câmera do quadro anterior:\n' + ruins.join('\n'));
  });

  it('dado sair do carro, então o tiro durante a volta da câmera sai pela retícula desenhada', async () => {
    const r = await h.play(() => {
      const M = window.VMQA, G = window.QA.G, QA = window.QA;
      QA.reset();
      const g = M.armar(0); QA.tick(40);         // dirigindo não troca de arma
      G.teleportToCar(); QA.tick(4);
      G.tryToggleCar();
      const dirigindo = !!G.state.driving;
      G.keys.KeyW = true; QA.tick(90); G.keys.KeyW = false;
      G.tryToggleCar();                          // sai, com o carro ainda rodando
      QA.tick(3);
      M.armar(0);
      let tiros;
      try {
        tiros = M.rodada(g, 8, k => { if (k === 0) { G.mouse.shooting = true; G.mouse.clicked = true; } });
      } finally { G.mouse.shooting = false; G.mouse.clicked = false; }
      return { dirigindo, tiros };
    });
    assert.equal(r.dirigindo, true, 'cenário inválido: não entrou no carro');
    assert.ok(r.tiros.length >= 2, `poucos tiros na volta (${r.tiros.length})`);
    resumo('volta do carro', r.tiros);
    const ruins = ruinsDe(r.tiros, 'volta do carro');
    assert.deepEqual(ruins, [], ruins.join('\n'));
  });
});
