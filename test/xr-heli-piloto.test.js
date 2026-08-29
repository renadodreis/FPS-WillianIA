/* ================================================================
   QA — O PILOTO DO HELICÓPTERO DENTRO DO HEADSET (D5)

   O DEFEITO MEDIDO pela frente de C2 na rodada 18 e declarado FORA DA
   POSSE dela (ver a mensagem do commit 9ae5a58, "medido e NÃO
   consertado"): em XR o piloto fica NO CHÃO.

       helicóptero a 32,85 m de altura · olho do jogador a 4,55 m
       diferença: 28,30 m — voando.

   A CAUSA, e ela é de ordem de frame:

   · `Heli.update` (js/heli.js) escreve `player.pos` TODO FRAME enquanto
     `state.flying`, e escreve a COTA DO TERRENO debaixo do helicóptero:
     `player.pos.set(g.x, groundAt(g.x, g.z, g.y), g.z)`. O comentário
     dele diz o motivo — "player acompanha (recentra grama/chunks)" —, e
     no monitor isso nunca apareceu porque quem desenha a cena ali é a
     câmera de PERSEGUIÇÃO (`carCameraUpdate`), que não olha `player.pos`.
   · Em XR não existe câmera de perseguição: o rig VAI para `player.pos`
     (`XR.place`, chamado dentro do `applyFpsCamera`, que roda DEPOIS do
     `Heli.update` no tick). O jogador de headset fica plantado no chão
     vendo o helicóptero subir sem ele.

   ================================================================
   O QUE ESTE ARQUIVO COBRA, e de onde sai cada régua:

   · D5 (docs/vr/criterio-aaa.md) — "ao entrar: a origem do rig passa a
     acompanhar o veículo, **a cabeça fica no lugar do motorista**, o
     rastreamento continua 1:1 e **nada gira a vista** … 0 rad de rotação
     imposta". São três casos separados neste arquivo, um por oração.
   · A ÂNCORA DA MEDIDA É O MODELO DESENHADO, não uma constante do código
     sob teste: a CABINE DE VIDRO do helicóptero é a única malha
     transparente do grupo (js/heli.js), e é a ela que o olho é comparado.
     Uma régua tirada da mesma constante que posiciona o assento seria
     comparar uma reta consigo mesma.

   ================================================================
   CONDIÇÃO DECLARADA DA BANCADA (medição sem condição não é medida):

   · sessão imersiva REAL (IWER, preset Quest 3); o olho é lido de
     `camera.matrixWorld` DEPOIS do `renderer.render()` — antes dele a
     leitura compõe `rig(N)` com `pose(N−1)` e os dois erros se cancelam;
   · o helicóptero é entrado PELO CAMINHO DO JOGO (`tryToggleCar()` →
     `Heli.tryEnter()`) e SOBE pelo botão do jogador (`pular`, botão 4 do
     controle direito → `Space` → `vel.y`). Escrever `state.flying = true`
     ou empurrar `group.position.y` na mão seria a bandeira, não o estado;
   · passo físico em degraus de 2 cm por amostra: `PASSO_HUMANO_MAX` é
     0,35 m e delta maior é DESCARTADO de propósito pelo rig (recentrar,
     piso redefinido, rastreio perdido). O maior delta por frame é
     publicado em todo caso;
   · a cabeça volta ao centro do quarto ANDANDO entre os casos, A PÉ:
     teleportar `dev.position` não desfaz o acumulado do rig (o salto cai
     no ramo de descarte), e o caso seguinte herdaria metros de passo
     pendente;
   · a fase do BR é forçada a `ENDED` na limpeza: o `brTick` roda por rAF
     mesmo em partida SOLO, e a fase `SPECT` escreve `player.pos` todo
     frame (medido em outra bancada: 3873,7723 m de salto num frame).

   PORTA 3820 (só deste arquivo).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3820;

/* O olho do piloto contra o CENTRO DA CABINE DE VIDRO desenhada. A cabine
   tem 0,9 × 1,1 × 1,4 m; o assento fica no meio dela e a altura do olho
   dentro da sessão (1,70 m no runtime emulado) deixa o olho ~0,5 m acima
   do centro. 1,0 m é folga para altura de olho de 1,2 m (sentado) a
   1,9 m (de pé), e é 28× menor que o defeito medido. */
const CABINE_RAIO = 1.0;
/* D5: "0 rad de rotação imposta". O teto é ruído numérico, não licença. */
const ROT_IMPOSTA_MAX = 0.02;      // rad (1,15°)
/* O passo físico tem de chegar à vista inteiro (D5: "rastreamento
   posicional preservado dentro do veículo"). 96 % é folga de assentamento. */
const RASTREIO_MIN = 0.96;

async function instalarSonda() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;

  /* A CABINE DE VIDRO É A ÂNCORA. Única malha do grupo com material
     transparente (js/heli.js: `glassH`). Sai do MODELO DESENHADO, não da
     constante que posiciona o assento — é o mesmo raciocínio do cano
     como âncora da mira. */
  const cabine = G.Heli.group.children.find(m => m.material && m.material.transparent);

  const S = { on: false, tr: [], frames: 0 };
  const espera = ms => new Promise(r => setTimeout(r, ms));
  const foraDoBR = () => {
    if (window.__BR_debug && window.__BR_debug.S) window.__BR_debug.S.phase = 'ENDED';
    window.__BR_freeze = false;
  };

  const rOrig = MP.renderer.render.bind(MP.renderer);
  const _olho = new T.Vector3(), _cab = new T.Vector3();
  MP.renderer.render = (cena, cam) => {
    const r = rOrig(cena, cam);
    if (S.on) {
      S.frames++;
      _olho.setFromMatrixPosition(MP.camera.matrixWorld);
      if (cabine) _cab.setFromMatrixPosition(cabine.matrixWorld);
      const dev = window.__xrEmulado;
      const g = G.Heli.group.position;
      S.tr.push({
        ox: _olho.x, oy: _olho.y, oz: _olho.z,
        cx: _cab.x, cy: _cab.y, cz: _cab.z,
        gx: g.x, gy: g.y, gz: g.z,
        gyaw: G.Heli.group.rotation.y,
        /* A RÉGUA INDEPENDENTE DO PASSO: a pose que o RUNTIME emulado
           reporta. Não sai de nenhuma linha do produto sob teste. */
        hx: dev.position.x, hz: dev.position.z,
        px: MP.player.pos.x, py: MP.player.pos.y, pz: MP.player.pos.z,
        rigYaw: G.XR.rig ? G.XR.rig.rotation.y : 0,
        giro: G.XR.giro.yaw,
        flying: !!MP.state.flying,
        fase: (window.__BR_debug && window.__BR_debug.S) ? window.__BR_debug.S.phase : null,
      });
    }
    return r;
  };

  const d3 = (a, kx, ky, kz, bx, by, bz) =>
    Math.hypot(a[kx] - a[bx], a[ky] - a[by], a[kz] - a[bz]);
  const maiorDelta = (xs, kx, kz) => {
    let m = 0;
    for (let i = 1; i < xs.length; i++)
      m = Math.max(m, Math.hypot(xs[i][kx] - xs[i - 1][kx], xs[i][kz] - xs[i - 1][kz]));
    return m;
  };

  function resumo() {
    const n = S.tr.length;
    if (n < 6) return { vazio: true, frames: S.frames, n };
    const a0 = S.tr[0], a1 = S.tr[n - 1];
    return {
      frames: S.frames, n,
      /* O NÚMERO DO DEFEITO: altura do olho contra altura do helicóptero. */
      olhoY: a1.oy, heliY: a1.gy, difY: a1.oy - a1.gy,
      /* E o número que decide: distância do olho ao centro da cabine
         DESENHADA, em 3D, no pior frame da janela. */
      cabineMax: Math.max(...S.tr.map(t => d3(t, 'ox', 'oy', 'oz', 'cx', 'cy', 'cz'))),
      cabineFim: d3(a1, 'ox', 'oy', 'oz', 'cx', 'cy', 'cz'),
      subiu: a1.gy - a0.gy,
      colisorY: a1.py,
      /* passo físico e o que ele moveu na vista, RELATIVO ao helicóptero
         (que continua sendo o referencial de quem está dentro dele) */
      passo: Math.hypot(a1.hx - a0.hx, a1.hz - a0.hz),
      vistaRel: Math.hypot((a1.ox - a1.gx) - (a0.ox - a0.gx),
        (a1.oz - a1.gz) - (a0.oz - a0.gz)),
      vistaMundo: Math.hypot(a1.ox - a0.ox, a1.oz - a0.oz),
      maiorDeltaPose: maiorDelta(S.tr, 'hx', 'hz'),
      /* D5: nada pode girar a vista. O rig é o único dono do yaw da vista
         em XR (a pose da câmera é do pescoço do jogador). */
      rigYawIni: a0.rigYaw, rigYawFim: a1.rigYaw,
      rigYawSpan: Math.max(...S.tr.map(t => t.rigYaw)) - Math.min(...S.tr.map(t => t.rigYaw)),
      heliYawSpan: Math.max(...S.tr.map(t => t.gyaw)) - Math.min(...S.tr.map(t => t.gyaw)),
      giroMax: Math.max(...S.tr.map(t => Math.abs(t.giro))),
      flying: S.tr.every(t => t.flying),
      faseFim: a1.fase,
    };
  }

  window.__HELI = {
    temCabine: !!cabine,
    /* Um ponto de campo aberto para o helicóptero decolar sem parede por
       perto: o heli tem colisão própria de raio 2,3 m contra as
       estruturas, e decolar encostado num prédio mediria a colisão. */
    acharCampoAberto() {
      for (let t = 0; t < 400; t++) {
        const x = -300 + t * 3, z = -260;
        const perto = (G.Structures.walls || []).some(w => !w.noCollide
          && x > w.x0 - 20 && x < w.x1 + 20 && z > w.z0 - 20 && z < w.z1 + 20);
        if (!perto) return { x, z, gy: MP.groundAt(x, z, 100) };
      }
      return null;
    },

    /* ESTADO LIMPO ENTRE CASOS — inclusive o ACUMULADO DO RIG. Voando o
       dreno do passo NÃO roda (decisão medida da rodada 18), então um caso
       que anda 1 m dentro do helicóptero deixa 1 m de passo pendente. A
       cabeça volta ao centro do quarto ANDANDO, a pé e em campo aberto, e
       a bancada espera o dreno pagar o acumulado (0,15 m/frame). */
    async limpar() {
      const campo = window.__HELI.campo;
      if (MP.state.driving || MP.state.flying) G.tryToggleCar();
      foraDoBR();
      window.__A.solta();
      MP.player.dead = false;
      MP.player.health = 100;
      if (G.XRUI.aberto) G.XRUI.fechar();
      MP.player.pos.set(campo.x, campo.gy, campo.z);
      MP.player.vel.set(0, 0, 0);
      await espera(250);
      const dev = window.__xrEmulado;
      const p0 = { x: dev.position.x, z: dev.position.z };
      const n = Math.max(1, Math.ceil(Math.hypot(p0.x, p0.z) / 0.25));
      for (let i = 1; i <= n; i++) {
        const k = 1 - i / n;
        dev.position.set(p0.x * k, 1.7, p0.z * k);
        await espera(30);
      }
      await espera(900);
      return {
        flying: !!MP.state.flying, driving: !!MP.state.driving,
        sepResidual: G.XR.separacao, foraResidual: G.XR.foraDoCorpo,
      };
    },

    /* ENTRAR PELO CAMINHO DO JOGO: `tryToggleCar()` é a tecla E do jogador
       e o primeiro ramo dela é `Heli.tryEnter()`. */
    async entrar(x, z, gy) {
      G.Heli.group.position.set(x, gy + 0.05, z);
      G.Heli.group.rotation.set(0, 0, 0);
      MP.player.pos.set(x + 1.5, MP.groundAt(x + 1.5, z, 100), z);
      MP.player.vel.set(0, 0, 0);
      await espera(250);
      G.tryToggleCar();
      await espera(600);
      return { flying: !!MP.state.flying, gy: G.Heli.group.position.y };
    },

    /* SUBIR PELO BOTÃO DO JOGADOR. `out.pular` é o botão 4 do controle
       direito (js/xr/xrinput.js), que a ponte de entrada do game.js
       traduz em `Space` — a mesma tecla que js/heli.js lê para subir. */
    async subir(segundos) {
      window.__A.botao('right', 'a-button', 1);
      await espera(segundos * 1000);
      window.__A.botao('right', 'a-button', 0);
      await espera(400);
      return { y: G.Heli.group.position.y };
    },

    /* GUINAR PELO ANALÓGICO DO JOGADOR. `cmd.andar.x` vira `KeyA`/`KeyD`,
       que é o que js/heli.js lê para guinar. */
    async guinar(segundos) {
      window.__A.stick('left', -1, 0);
      await espera(segundos * 1000);
      window.__A.solta();
      await espera(300);
      return { yaw: G.Heli.group.rotation.y };
    },

    /* UMA CAMINHADA FÍSICA DENTRO DO QUARTO, com o estado já montado. */
    async caminhar({ metros, degrau = 0.02, esperaMs = 20, assentaMs = 500 }) {
      const dev = window.__xrEmulado;
      const degraus = Math.max(1, Math.round(metros / degrau));
      const base = { x: dev.position.x, z: dev.position.z };
      await espera(400);
      S.tr.length = 0; S.frames = 0; S.on = true;
      for (let i = 1; i <= degraus; i++) {
        dev.position.set(base.x + i * degrau, 1.7, base.z);
        await espera(esperaMs);
      }
      await espera(assentaMs);
      S.on = false;
      return resumo();
    },

    /* GRAVA UMA JANELA SEM COMANDAR NADA (piloto parado no assento). */
    async observar(ms) {
      S.tr.length = 0; S.frames = 0; S.on = true;
      await espera(ms);
      S.on = false;
      return resumo();
    },

    /* GRAVA ENQUANTO O JOGADOR COMANDA — a janela cobre o comando inteiro. */
    async gravando(fn) {
      S.tr.length = 0; S.frames = 0; S.on = true;
      const extra = await fn();
      await espera(300);
      S.on = false;
      return Object.assign(resumo(), { extra });
    },

    /* O CUSTO DO ASSENTO, medido no produto: é a conta que passa a rodar
       em todo frame de `place()` enquanto o jogador voa. */
    custoDoAssento(n = 200000) {
      const alvo = new T.Vector3();
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        if (G.Heli.assentoXR) G.Heli.assentoXR(alvo);
        else alvo.copy(MP.player.pos);
      }
      return { ms: (performance.now() - t0) / n, x: alvo.x };
    },
  };
  return true;
}

describe('D5 · o piloto do helicóptero dentro do headset (sessão imersiva real)',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h, campo;

    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      await h.play(instalarSonda);
      await h.play(() => window.__A.espera(700));
      campo = await h.play(() => window.__HELI.acharCampoAberto());
      assert.ok(campo, 'não achei campo aberto para o helicóptero decolar');
      await h.play(c => { window.__HELI.campo = c; }, campo);
      const temCabine = await h.play(() => window.__HELI.temCabine);
      assert.ok(temCabine,
        'não achei a cabine de vidro do helicóptero — a âncora independente '
        + 'da medida não existe, e sem ela o caso mediria o próprio código');
    });
    after(async () => { if (h) await h.close(); });

    /* ============================================================
       O DEFEITO. É este o caso que a rodada 18 mediu e não consertou. */
    it('dado o helicóptero SUBINDO com o jogador de headset dentro, então o olho '
      + 'dele fica na cabine e não no chão', async () => {
      const r = await h.play(async c => {
        await window.__HELI.limpar();
        const e = await window.__HELI.entrar(c.x, c.z, c.gy);
        if (!e.flying) return { erro: 'não entrei no helicóptero', e };
        const s = await window.__HELI.subir(2.6);
        return Object.assign(await window.__HELI.observar(700), { subiuAte: s.y });
      }, campo);
      assert.ok(!r.erro, `${r.erro || ''} ${JSON.stringify(r.e || {})}`);
      assert.ok(!r.vazio && r.frames > 20,
        `só ${r.frames} frames renderizados (n=${r.n}) — a sonda está cega`);
      console.log(`      HELI/subindo: helicóptero a ${r.heliY.toFixed(2)} m · `
        + `OLHO a ${r.olhoY.toFixed(2)} m · diferença ${(r.olhoY - r.heliY).toFixed(2)} m · `
        + `olho↔cabine ${r.cabineFim.toFixed(4)} m (máx ${r.cabineMax.toFixed(4)}) · `
        + `colisor a ${r.colisorY.toFixed(2)} m · ${r.frames} frames`);
      assert.equal(r.flying, true, 'o jogador não ficou voando a janela inteira');
      assert.ok(r.heliY > 20,
        `o helicóptero só chegou a ${r.heliY.toFixed(2)} m — o cenário não aconteceu, `
        + 'e um helicóptero no chão não separa o defeito do certo');
      assert.ok(r.cabineMax <= CABINE_RAIO,
        `o olho do piloto ficou a ${r.cabineMax.toFixed(2)} m do centro da cabine `
        + `desenhada (helicóptero a ${r.heliY.toFixed(2)} m, olho a ${r.olhoY.toFixed(2)} m) `
        + `— teto ${CABINE_RAIO} m`);
    });

    /* ============================================================
       D5, segunda oração: "nada gira a vista … 0 rad de rotação imposta". */
    it('dado o helicóptero GUINANDO sob comando do jogador, então a vista dele não '
      + 'é girada por isso (0 rad imposta) e o olho continua na cabine', async () => {
      const r = await h.play(async c => {
        await window.__HELI.limpar();
        const e = await window.__HELI.entrar(c.x, c.z, c.gy);
        if (!e.flying) return { erro: 'não entrei no helicóptero', e };
        await window.__HELI.subir(2.0);
        return window.__HELI.gravando(() => window.__HELI.guinar(1.6));
      }, campo);
      assert.ok(!r.erro, `${r.erro || ''} ${JSON.stringify(r.e || {})}`);
      assert.ok(!r.vazio && r.frames > 20,
        `só ${r.frames} frames renderizados (n=${r.n}) — a sonda está cega`);
      console.log(`      HELI/guinada: o helicóptero girou ${(r.heliYawSpan * 180 / Math.PI).toFixed(2)}° · `
        + `o rig girou ${(r.rigYawSpan * 180 / Math.PI).toFixed(4)}° · `
        + `olho↔cabine máx ${r.cabineMax.toFixed(4)} m · ${r.frames} frames`);
      assert.ok(Math.abs(r.heliYawSpan) > 0.7,
        `pré-condição falhou: o helicóptero guinou só ${(r.heliYawSpan * 180 / Math.PI).toFixed(1)}° `
        + '— sem guinada o caso passaria vazio');
      assert.ok(Math.abs(r.rigYawSpan) <= ROT_IMPOSTA_MAX,
        `a guinada do helicóptero girou a vista do jogador `
        + `${(r.rigYawSpan * 180 / Math.PI).toFixed(2)}° (D5: 0 rad de rotação imposta)`);
      assert.ok(r.cabineMax <= CABINE_RAIO,
        `com o helicóptero guinado o olho saiu ${r.cabineMax.toFixed(2)} m do centro da `
        + 'cabine — o assento não acompanhou a fuselagem');
    });

    /* ============================================================
       D5, terceira oração: "o rastreamento continua 1:1". É o guarda que
       impede a correção de virar "câmera colada no assento" — que é o
       texto do REPROVA de D5. */
    it('dado o jogador ANDANDO fisicamente pelo quarto com o helicóptero no ar, '
      + 'então a vista dele acompanha 1:1 dentro da cabine', async () => {
      const r = await h.play(async c => {
        await window.__HELI.limpar();
        const e = await window.__HELI.entrar(c.x, c.z, c.gy);
        if (!e.flying) return { erro: 'não entrei no helicóptero', e };
        await window.__HELI.subir(2.0);
        return window.__HELI.caminhar({ metros: 0.98 });
      }, campo);
      assert.ok(!r.erro, `${r.erro || ''} ${JSON.stringify(r.e || {})}`);
      assert.ok(!r.vazio && r.frames > 20,
        `só ${r.frames} frames renderizados (n=${r.n}) — a sonda está cega`);
      console.log(`      HELI/passo: passo físico ${r.passo.toFixed(4)} m · `
        + `vista relativa ao helicóptero ${r.vistaRel.toFixed(4)} m `
        + `(${(100 * r.vistaRel / Math.max(r.passo, 1e-9)).toFixed(2)} %) · `
        + `maior delta/frame ${r.maiorDeltaPose.toFixed(4)} m · ${r.frames} frames`);
      assert.equal(r.flying, true, 'o jogador não ficou voando a janela inteira');
      assert.ok(r.giroMax < 1e-6,
        `giro artificial em ${r.giroMax.toFixed(6)} rad — o +x do quarto deixou de ser `
        + 'o +x do mundo e a caminhada iria para outro lugar');
      assert.ok(r.maiorDeltaPose < 0.35,
        `um frame moveu a cabeça ${r.maiorDeltaPose.toFixed(4)} m — isso é o ramo de `
        + 'descarte do rig, não passo');
      assert.ok(r.passo > 0.9, `o headset andou ${r.passo.toFixed(4)} m — o cenário não aconteceu`);
      assert.ok(r.vistaRel >= r.passo * RASTREIO_MIN,
        `a vista andou ${r.vistaRel.toFixed(4)} m de ${r.passo.toFixed(4)} m de passo físico `
        + `(${(100 * r.vistaRel / r.passo).toFixed(1)} %) — câmera colada no assento é o `
        + 'REPROVA de D5');
    });

    /* ============================================================
       A OUTRA PONTA, obrigatória: sair do helicóptero devolve o rig ao
       chão. Sem este caso, "prender o rig no assento para sempre" passaria. */
    it('dado o jogador SAINDO do helicóptero no ar, então o rig volta ao chão com '
      + 'ele e não fica preso no assento', async () => {
      const r = await h.play(async c => {
        await window.__HELI.limpar();
        const e = await window.__HELI.entrar(c.x, c.z, c.gy);
        if (!e.flying) return { erro: 'não entrei no helicóptero', e };
        await window.__HELI.subir(2.2);
        const heliY = window.__game.Heli.group.position.y;
        window.__game.tryToggleCar();          // a MESMA tecla E do jogador
        await window.__A.espera(700);
        const obs = await window.__HELI.observar(600);
        const MP = window.__MP;
        return Object.assign(obs, {
          heliNoAr: heliY,
          chao: MP.groundAt(MP.player.pos.x, MP.player.pos.z, MP.player.pos.y + 5),
          flyingFim: !!MP.state.flying,
        });
      }, campo);
      assert.ok(!r.erro, `${r.erro || ''} ${JSON.stringify(r.e || {})}`);
      assert.ok(!r.vazio && r.frames > 10,
        `só ${r.frames} frames renderizados (n=${r.n}) — a sonda está cega`);
      const acimaDoChao = r.olhoY - r.chao;
      console.log(`      HELI/saída: helicóptero ficou a ${r.heliNoAr.toFixed(2)} m · `
        + `olho a ${r.olhoY.toFixed(2)} m · chão a ${r.chao.toFixed(2)} m · `
        + `olho acima do chão ${acimaDoChao.toFixed(2)} m · ${r.frames} frames`);
      assert.equal(r.flyingFim, false, 'a tecla E não tirou o jogador do helicóptero');
      assert.ok(r.heliNoAr > 15,
        `pré-condição falhou: o helicóptero estava a ${r.heliNoAr.toFixed(2)} m — `
        + 'saindo do chão o caso não separa "preso no assento" de "no chão"');
      assert.ok(acimaDoChao > 0.5 && acimaDoChao < 3.5,
        `o olho do jogador ficou ${acimaDoChao.toFixed(2)} m acima do chão depois de sair `
        + `(helicóptero a ${r.heliNoAr.toFixed(2)} m) — ou ficou preso no assento, ou `
        + 'enterrado');
    });

    it('o custo do assento por frame', async () => {
      const c = await h.play(() => window.__HELI.custoDoAssento());
      console.log(`      CUSTO: assento do piloto ${c.ms.toFixed(6)} ms por chamada`);
      assert.ok(c.ms < 0.01, `assento a ${c.ms.toFixed(6)} ms por frame`);
    });
  });
