/* ================================================================
   QA — C10 NA TROCA DE VEÍCULO: nada fica preso com o dedo na tela.

   O DEFEITO (laudo `6aeda6c`, C10). Sair do carro pelo USAR com o polegar
   ainda no analógico: o boneco andava 3,66 m em 0,5 s. Sair do helicóptero
   com o ⇧ ainda apertado: `Space` seguia ligado. O chat e a morte já
   chamavam `soltarEntrada()`; a troca de veículo, não. O caso antigo de
   test/touch-controls.test.js soltava o analógico ANTES de sair e entrava por
   `tryToggleCar()`, nunca pelo botão USAR — media o caminho que não quebra.

   O QUE ESTE ARQUIVO COBRA, na letra da régua (C10: "com o dedo PRESSIONADO
   no instante da transição"): entrar e sair do carro e do helicóptero PELO
   BOTÃO USAR, com o polegar no analógico, o ⇧ e o dedo no ATIRAR apertados
   durante a troca. Depois dela: `keys` W/A/S/D/Space/ControlLeft/Tab/E
   soltas, `mouse.shooting`/`mouse.aiming` falsos, nenhum controle aceso
   (`.on`) e o boneco (ou o veículo) a menos de 0,5 m/s 0,5 s depois.
   E cada caso tem CONTROLE POSITIVO: levantar o dedo e encostar de novo volta
   a comandar — senão "nada anda" passaria com o toque morto.

   ÂNCORA: o que o jogo fez (posição e velocidade do jogador/veículo, tiro
   saindo do pente), não o estado interno do módulo de toque.
   Porta 4032, celular V3 844×390.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

const PORT = 4032;
const V3 = { width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

function instalarSonda() {
  const QA = window.QA, G = QA.G, MP = QA.MP;
  for (const e of G.Enemies.list) { e.alive = false; if (e.group) e.group.visible = false; }
  G.Skeletons.setEnabled(false);
  const toque = (el, type, id, x, y) => el.dispatchEvent(new PointerEvent(type, {
    pointerId: id, pointerType: 'touch', isPrimary: id === 1,
    clientX: x, clientY: y, bubbles: true, cancelable: true }));
  const centro = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const btn = act => document.querySelector(`.tcBtn[data-act="${act}"]`);
  const stick = () => document.getElementById('tcMove');
  /* dedo que FICA na tela: desce, arrasta até (dx, dy) e devolve o que soltar */
  function segurar(el, id, dx = 0, dy = 0) {
    const [x, y] = centro(el);
    toque(el, 'pointerdown', id, x, y);
    if (dx || dy) toque(el, 'pointermove', id, x + dx, y + dy);
    return {
      mover(ddx, ddy) { toque(el, 'pointermove', id, x + ddx, y + ddy); },
      soltar() { toque(el, 'pointerup', id, x + dx, y + dy); },
    };
  }
  /* o USAR tocado por um dedo que desce e sobe no mesmo quadro */
  function usar(id = 90) {
    const u = btn('use'); const [x, y] = centro(u);
    toque(u, 'pointerdown', id, x, y); toque(u, 'pointerup', id, x, y);
  }
  const TECLAS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ControlLeft', 'Tab', 'KeyE'];
  /* tudo que a régua lista, lido do jogo */
  function presos() {
    const p = TECLAS.filter(c => G.keys[c]);
    if (G.mouse.shooting) p.push('mouse.shooting');
    if (G.mouse.aiming) p.push('mouse.aiming');
    for (const el of document.querySelectorAll('#tcMove.on, .tcBtn.on')) p.push(`.on em ${el.id || el.dataset.act}`);
    return p;
  }
  const horiz = v => Math.hypot(v.x, v.z);
  window.VTQA = { toque, centro, btn, stick, segurar, usar, presos, horiz, MP };
  void MP;
}

describe('C10 — troca de veículo com o dedo na tela (celular V3)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: PORT, query: '?mobile=1', viewport: V3 });
    await h.play(instalarSonda);
  });
  after(async () => { if (h) await h.close(); });

  /* DECISÃO DO DONO (2026-09-28): "já entra dirigindo". Ao ENTRAR, o
     polegar que estava no analógico passa a ser o volante na hora (antes o
     contrato C10 exigia levantar e encostar de novo — "o carro não anda").
     Ao SAIR continua soltando tudo (o boneco não sai andando). Botões
     (tiro, pulo…) soltam nas duas trocas. */
  it('dado ENTRAR no carro pelo USAR com o polegar no analógico, então JÁ SAI DIRIGINDO — e nenhum botão fica preso', async () => {
    const r = await h.play(() => {
      const QA = window.QA, G = QA.G, T = window.VTQA;
      QA.reset(); G.teleportToCar(); QA.tick(6);
      const polegar = T.segurar(T.stick(), 1, 0, -120);   // pra frente, no talo
      QA.tick(10);
      T.usar();
      QA.tick(1);
      const dirigindo = !!G.state.driving;
      const presos = T.presos();
      QA.tick(30);
      const kmh = G.Car.speedKmh();
      polegar.mover(0, -40);                                // o mesmo dedo segue arrastando
      QA.tick(5);
      const kmhArrasto = G.Car.speedKmh();
      polegar.soltar();
      /* controle positivo: dedo novo no analógico dirige */
      const novo = T.segurar(T.stick(), 2, 0, -120);
      QA.tick(60);
      const kmhNovo = G.Car.speedKmh();
      novo.soltar(); QA.tick(2);
      if (G.state.driving) G.tryToggleCar();
      QA.tick(4);
      return { dirigindo, presos, kmh, kmhArrasto, kmhNovo };
    });
    assert.equal(r.dirigindo, true, 'cenário inválido: o USAR não pôs o jogador no carro');
    console.log(`  [entrar no carro] presos: [${r.presos.join(', ')}]; ${r.kmh.toFixed(2)} km/h 0,5 s depois, ` +
      `${r.kmhArrasto.toFixed(2)} arrastando o mesmo dedo; dedo novo: ${r.kmhNovo.toFixed(1)} km/h`);
    // o volante é o analógico: W e o anel aceso SÃO o polegar; nada além disso
    const botoes = r.presos.filter(p => p !== 'KeyW' && p !== '.on em tcMove');
    assert.deepEqual(botoes, [], 'botão ficou preso ao entrar no carro com o dedo na tela');
    assert.ok(r.kmh > 5, `entrou com o polegar no analógico e o carro não andou: ${r.kmh.toFixed(2)} km/h em 0,5 s`);
    assert.ok(r.kmhArrasto > 5, `o polegar deixou de dirigir ao arrastar: ${r.kmhArrasto.toFixed(2)} km/h`);
    assert.ok(r.kmhNovo > 5, `um dedo NOVO no analógico não dirigiu (${r.kmhNovo.toFixed(2)} km/h)`);
  });

  it('dado SAIR do carro pelo USAR com o polegar no analógico, então o boneco fica parado; um novo gesto anda', async () => {
    const r = await h.play(() => {
      const QA = window.QA, G = QA.G, T = window.VTQA, P = T.MP.player;
      QA.reset(); G.teleportToCar(); QA.tick(6);
      T.usar(); QA.tick(2);
      const dirigindo = !!G.state.driving;
      const polegar = T.segurar(T.stick(), 3, 0, -120);   // acelera
      QA.tick(40);
      const w = !!G.keys.KeyW;
      T.usar();
      QA.tick(1);
      const saiu = !G.state.driving;
      const presos = T.presos();
      const p0 = P.pos.clone();
      QA.tick(30);
      const andou = Math.hypot(P.pos.x - p0.x, P.pos.z - p0.z), vel = T.horiz(P.vel);
      polegar.mover(40, -120);
      QA.tick(5);
      const andouArrasto = Math.hypot(P.pos.x - p0.x, P.pos.z - p0.z);
      polegar.soltar();
      const novo = T.segurar(T.stick(), 4, 0, -120);
      const p1 = P.pos.clone();
      QA.tick(30);
      const andouNovo = Math.hypot(P.pos.x - p1.x, P.pos.z - p1.z);
      novo.soltar(); QA.tick(2);
      return { dirigindo, w, saiu, presos, andou, vel, andouArrasto, andouNovo };
    });
    assert.equal(r.dirigindo, true, 'cenário inválido: não entrou no carro');
    assert.equal(r.w, true, 'cenário inválido: o analógico não acelerava o carro');
    assert.equal(r.saiu, true, 'o USAR não tirou o jogador do carro');
    console.log(`  [sair do carro] presos: [${r.presos.join(', ')}]; andou ${r.andou.toFixed(3)} m em 0,5 s ` +
      `(${r.vel.toFixed(3)} m/s), ${r.andouArrasto.toFixed(3)} m arrastando o mesmo dedo; dedo novo: ${r.andouNovo.toFixed(2)} m`);
    assert.deepEqual(r.presos, [], 'ficou preso ao sair do carro com o dedo na tela');
    assert.ok(r.vel < 0.5, `o boneco saiu andando: ${r.vel.toFixed(3)} m/s 0,5 s depois`);
    assert.ok(r.andou < 0.25, `o boneco andou ${r.andou.toFixed(3)} m em 0,5 s com o polegar que dirigia`);
    assert.ok(r.andouArrasto < 0.25, `o dedo esquecido voltou a andar ao arrastar: ${r.andouArrasto.toFixed(3)} m`);
    assert.ok(r.andouNovo > 1, `controle positivo falhou: um dedo NOVO no analógico não andou (${r.andouNovo.toFixed(3)} m)`);
  });

  it('dado ENTRAR no helicóptero pelo USAR com ⇧, analógico e ATIRAR apertados, então o analógico JÁ VOA — mas ⇧ e ATIRAR de quando estava a pé não sobem nem atiram', async () => {
    const r = await h.play(() => {
      const QA = window.QA, G = QA.G, T = window.VTQA, P = T.MP.player;
      QA.reset();
      const g = G.arsenal[0]; g.locked = false; G.switchWeapon(0);
      g.mag = g.magSize; g.reserve = 999; g.reloading = false; QA.tick(40);
      const hp = G.Heli.group.position; P.pos.set(hp.x + 3, hp.y, hp.z); QA.tick(6);
      /* o analógico agora VOA ao entrar: o helicóptero sai do heliponto — e o
         caso seguinte monta o jogador ao lado dele. Devolvido no fim. */
      const heli0 = { p: G.Heli.group.position.clone(), q: G.Heli.group.quaternion.clone() };
      const dedoTiro = T.segurar(T.btn('fire'), 5);
      const pulo = T.segurar(T.btn('jump'), 6);
      const polegar = T.segurar(T.stick(), 7, 0, -120);
      QA.tick(3);
      T.usar();
      QA.tick(1);
      const voando = !!G.state.flying;
      const presos = T.presos();
      g.mag = g.magSize; const mag0 = g.mag;
      /* o 1º passo do voo ergue o heli do heliponto para a folga mínima do
         chão (+0,5 m, `minY` em js/heli.js) com ou sem dedo nenhum: a subida
         que interessa é a que vem DEPOIS disso */
      QA.tick(5);
      const y0 = G.Heli.group.position.y, h0 = G.Heli.group.position.clone();
      QA.tick(25);
      const subiu = G.Heli.group.position.y - y0;
      const voou = Math.hypot(G.Heli.group.position.x - h0.x, G.Heli.group.position.z - h0.z);
      const tiros = mag0 - g.mag;
      dedoTiro.soltar(); pulo.soltar(); polegar.soltar();
      /* controle positivo: ⇧ novo sobe, ATIRAR novo atira */
      const pulo2 = T.segurar(T.btn('jump'), 8);
      const tiro2 = T.segurar(T.btn('fire'), 9);
      const y1 = G.Heli.group.position.y, mag1 = g.mag;
      QA.tick(40);
      const subiuNovo = G.Heli.group.position.y - y1, tirosNovo = mag1 - g.mag;
      pulo2.soltar(); tiro2.soltar(); QA.tick(2);
      if (G.state.flying) G.tryToggleCar();
      QA.tick(4);
      G.Heli.group.position.copy(heli0.p); G.Heli.group.quaternion.copy(heli0.q);
      QA.tick(2);
      return { voando, presos, subiu, voou, tiros, subiuNovo, tirosNovo };
    });
    assert.equal(r.voando, true, 'cenário inválido: o USAR não pôs o jogador no helicóptero');
    console.log(`  [entrar no heli] presos: [${r.presos.join(', ')}]; em 0,5 s subiu ${r.subiu.toFixed(3)} m, ` +
      `voou ${r.voou.toFixed(3)} m, ${r.tiros} tiros; dedos novos: subiu ${r.subiuNovo.toFixed(2)} m, ${r.tirosNovo} tiros`);
    const botoes = r.presos.filter(p => p !== 'KeyW' && p !== '.on em tcMove');
    assert.deepEqual(botoes, [], 'botão ficou preso ao entrar no helicóptero com o dedo na tela');
    assert.ok(Math.abs(r.subiu) < 0.25, `o ⇧ que pulava fez o helicóptero subir ${r.subiu.toFixed(3)} m`);
    assert.ok(r.voou > 0.25, `entrou com o polegar no analógico e o helicóptero não voou (${r.voou.toFixed(3)} m)`);
    assert.equal(r.tiros, 0, `o dedo que atirava a pé seguiu atirando do helicóptero (${r.tiros} tiros)`);
    assert.ok(r.subiuNovo > 1, `controle positivo falhou: ⇧ novo não subiu (${r.subiuNovo.toFixed(3)} m)`);
    assert.ok(r.tirosNovo > 0, 'controle positivo falhou: ATIRAR novo não atirou do helicóptero');
  });

  it('dado SAIR do helicóptero pelo USAR com ⇧ e analógico apertados, então o boneco não pula nem anda; um novo gesto anda e pula', async () => {
    const r = await h.play(() => {
      const QA = window.QA, G = QA.G, T = window.VTQA, P = T.MP.player;
      QA.reset();
      const hp = G.Heli.group.position; P.pos.set(hp.x + 3, hp.y, hp.z); QA.tick(6);
      T.usar(); QA.tick(2);
      const voando = !!G.state.flying;
      const pulo = T.segurar(T.btn('jump'), 10);
      QA.tick(12);                                         // sobe um pouco com o ⇧
      const polegar = T.segurar(T.stick(), 11, 0, -120);   // e o polegar no talo
      QA.tick(3);
      const space = !!G.keys.Space;
      T.usar();
      QA.tick(1);
      const saiu = !G.state.flying;
      const presos = T.presos();
      const p0 = P.pos.clone();
      let pulou = 0;
      for (let i = 0; i < 30; i++) { QA.tick(1); if (P.vel.y > 0.5) pulou++; }
      const andou = Math.hypot(P.pos.x - p0.x, P.pos.z - p0.z), vel = T.horiz(P.vel);
      pulo.soltar(); polegar.soltar();
      QA.tick(40);                                          // assenta no chão
      const novo = T.segurar(T.stick(), 12, 0, -120);
      const p1 = P.pos.clone();
      QA.tick(30);
      const andouNovo = Math.hypot(P.pos.x - p1.x, P.pos.z - p1.z);
      novo.soltar(); QA.tick(10);
      const pulo2 = T.segurar(T.btn('jump'), 13);
      let pulouNovo = 0;
      for (let i = 0; i < 10; i++) { QA.tick(1); if (P.vel.y > 0.5) pulouNovo++; }
      pulo2.soltar(); QA.tick(30);
      return { voando, space, saiu, presos, andou, vel, pulou, andouNovo, pulouNovo };
    });
    assert.equal(r.voando, true, 'cenário inválido: não entrou no helicóptero');
    assert.equal(r.space, true, 'cenário inválido: o ⇧ não estava subindo o helicóptero');
    assert.equal(r.saiu, true, 'o USAR não tirou o jogador do helicóptero');
    console.log(`  [sair do heli] presos: [${r.presos.join(', ')}]; em 0,5 s andou ${r.andou.toFixed(3)} m ` +
      `(${r.vel.toFixed(3)} m/s), ${r.pulou} quadros subindo; dedos novos: andou ${r.andouNovo.toFixed(2)} m, ` +
      `${r.pulouNovo} quadros subindo`);
    assert.deepEqual(r.presos, [], 'ficou preso ao sair do helicóptero com o dedo na tela');
    assert.equal(r.pulou, 0, `o ⇧ que subia o helicóptero fez o boneco pular (${r.pulou} quadros subindo)`);
    assert.ok(r.vel < 0.5, `o boneco saiu andando: ${r.vel.toFixed(3)} m/s 0,5 s depois`);
    assert.ok(r.andou < 0.25, `o boneco andou ${r.andou.toFixed(3)} m em 0,5 s com o polegar que pilotava`);
    assert.ok(r.andouNovo > 1, `controle positivo falhou: dedo NOVO no analógico não andou (${r.andouNovo.toFixed(3)} m)`);
    assert.ok(r.pulouNovo > 0, 'controle positivo falhou: ⇧ novo não pulou');
  });

  it('dado o toque, então nenhum erro de página apareceu no caminho', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
