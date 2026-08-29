/* ================================================================
   QA — O ESPECTADOR DO BR ENGOLE O PASSO FÍSICO (A6)

   O DEFEITO MEDIDO pela frente de C2 na rodada 18 e declarado FORA DA
   POSSE dela (mensagem do commit 9ae5a58, "medido e NÃO consertado"):

       0,9800 m de caminhada física → 0,0200 m de vista (2,04 %)

   A CAUSA, e ela é de DONO DE `player.pos`:

   · `enterSpectator()` (br-game.js) põe `MP.player.dead = false` e
     `window.__BR_freeze = true`. Com isso o jogador não é "morto" nem
     "dirigindo" nem "voando" — e o DRENO do passo físico do game.js, que
     é guardado por `!state.driving && !state.flying`, RODA: o passo sai
     do acumulado do rig e entra em `player.pos`.
   · `spectStep()` (br-game.js:1381) escreve `MP.player.pos` INTEIRO todo
     frame, do alvo assistido mais a órbita. O passo que acabou de entrar
     é apagado. Passo saindo do acumulado sem chegar a lugar nenhum é
     exatamente a versão errada nº 2 de `consumirPasso`: a cabeça é
     ARRASTADA de volta, e é isso que A6 proíbe ("nada além do pescoço do
     jogador move a vista — em TODOS os estados").

   É A MESMA FAMÍLIA que a rodada 18 resolveu para DIRIGINDO e VOANDO, e
   a resposta é a mesma que ela mediu: **onde o dono de `player.pos`
   reescreve depois, o dreno não pode rodar.** O que faltava era o
   game.js ENXERGAR o estado — a fase `SPECT` mora no br-game.js, que é
   script clássico e não exporta nada para o tick.

   ================================================================
   A OUTRA PONTA É OBRIGATÓRIA, e é metade deste arquivo: "congelar
   `player.pos`" faria o primeiro caso passar e QUEBRARIA o espectador,
   que existe para SEGUIR o jogador assistido. Por isso todo caso de
   passo tem o gêmeo em que o ALVO anda e a vista tem de ir junto.

   ================================================================
   CONDIÇÃO DECLARADA DA BANCADA (medição sem condição não é medida):

   · sessão imersiva REAL (IWER, preset Quest 3); o olho é lido de
     `camera.matrixWorld` DEPOIS do `renderer.render()`;
   · partida de BR de verdade (`startBRMatch`), com um adversário VIVO na
     sala — sem ele o `spectStep` cai no ramo "ninguém pra assistir", que
     é outro código, e o caso passaria vazio;
   · o espectador é entrado PELO CAMINHO DO JOGO (`enterSpectator()`,
     exposto como `__BR_debug.spect`) — é a mesma função que o fim da
     recapitulação de morte chama;
   · passo físico em degraus de 2 cm por amostra; o maior delta por frame
     é publicado em todo caso (acima de `PASSO_HUMANO_MAX` = 0,35 m o rig
     DESCARTA de propósito, e o caso mediria o descarte);
   · giro artificial conferido em ZERO em todo caso: a órbita do
     espectador em XR segue o yaw do RIG (br-game.js), então giro
     diferente de zero moveria o alvo da órbita no meio da medida;
   · o alvo assistido é o bot-host, que fica PARADO (o pulso de vida do
     harness repete a última posição). A deriva do alvo durante a janela é
     publicada em todo caso — ela entra na vista e não pode ser confundida
     com passo.

   PORTA 3822 (só deste arquivo).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3822;

/* A6: o passo físico chega inteiro à vista. 96 % é folga de assentamento
   (o rig tem teto de 0,15 m por frame no dreno e o alvo interpola). */
const VISTA_MIN = 0.96;
/* E a vista não pode andar MAIS que o passo: o espectador não pode ganhar
   locomoção que ninguém comandou. */
const VISTA_MAX = 1.15;
/* Deriva tolerada do alvo assistido durante a janela. Acima disso a vista
   mediu o alvo andando, não o jogador. */
const ALVO_PARADO = 0.25;

async function instalarSonda() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  const D = window.__BR_debug;

  const S = { on: false, tr: [], frames: 0 };
  const espera = ms => new Promise(r => setTimeout(r, ms));

  const alvos = () => (window.__MP_remotePlayers || []).filter(p => p.alive && !p.isBoss);

  const rOrig = MP.renderer.render.bind(MP.renderer);
  const _olho = new T.Vector3();
  MP.renderer.render = (cena, cam) => {
    const r = rOrig(cena, cam);
    if (S.on) {
      S.frames++;
      _olho.setFromMatrixPosition(MP.camera.matrixWorld);
      const dev = window.__xrEmulado;
      /* O ALVO ASSISTIDO, medido no grupo dele — é ele que a órbita do
         espectador segue, e a deriva dele entra na vista. */
      const a = alvos()[0];
      S.tr.push({
        ox: _olho.x, oy: _olho.y, oz: _olho.z,
        /* A RÉGUA INDEPENDENTE: a pose que o RUNTIME emulado reporta.
           Não sai de nenhuma linha do produto sob teste. */
        hx: dev.position.x, hz: dev.position.z,
        px: MP.player.pos.x, pz: MP.player.pos.z,
        ax: a ? a.group.position.x : 0, az: a ? a.group.position.z : 0,
        temAlvo: !!a,
        giro: G.XR.giro.yaw,
        fase: D.S.phase,
        dead: !!MP.player.dead,
        freeze: !!window.__BR_freeze,
      });
    }
    return r;
  };

  const d2 = (a, b, kx, kz) => Math.hypot(b[kx] - a[kx], b[kz] - a[kz]);
  const maiorDelta = (xs, kx, kz) => {
    let m = 0;
    for (let i = 1; i < xs.length; i++) m = Math.max(m, d2(xs[i - 1], xs[i], kx, kz));
    return m;
  };

  function resumo() {
    const n = S.tr.length;
    if (n < 6) return { vazio: true, frames: S.frames, n };
    const a0 = S.tr[0], a1 = S.tr[n - 1];
    return {
      frames: S.frames, n,
      passo: d2(a0, a1, 'hx', 'hz'),          // o headset, régua independente
      vista: d2(a0, a1, 'ox', 'oz'),          // o que o jogador VÊ
      colisor: d2(a0, a1, 'px', 'pz'),
      alvoDerivou: d2(a0, a1, 'ax', 'az'),
      maiorDeltaPose: maiorDelta(S.tr, 'hx', 'hz'),
      maiorSaltoColisor: maiorDelta(S.tr, 'px', 'pz'),
      giroMax: Math.max(...S.tr.map(t => Math.abs(t.giro))),
      temAlvo: S.tr.every(t => t.temAlvo),
      spect: S.tr.every(t => t.fase === 'SPECT'),
      dead: S.tr.some(t => t.dead),
      freeze: S.tr.every(t => t.freeze),
    };
  }

  window.__SPECT = {
    nAlvos: () => alvos().length,
    async esperarAlvo(ms = 15000) {
      const t0 = performance.now();
      while (!alvos().length && performance.now() - t0 < ms) await espera(200);
      return alvos().length;
    },
    /* ENTRAR PELO CAMINHO DO JOGO: `enterSpectator()` é a mesma função
       que `showRecap()` agenda no fim da morte. */
    async entrar() {
      D.spect();
      await espera(700);
      return { fase: D.S.phase, dead: !!MP.player.dead, freeze: !!window.__BR_freeze };
    },
    /* A cabeça volta ao centro do quarto ANDANDO entre casos: teleportar
       `dev.position` cai no ramo de descarte do rig e o acumulado fica
       inteiro para o caso seguinte. */
    async recentrarCabeca() {
      const dev = window.__xrEmulado;
      const p0 = { x: dev.position.x, z: dev.position.z };
      const n = Math.max(1, Math.ceil(Math.hypot(p0.x, p0.z) / 0.25));
      for (let i = 1; i <= n; i++) {
        const k = 1 - i / n;
        dev.position.set(p0.x * k, 1.7, p0.z * k);
        await espera(30);
      }
      await espera(700);
      return { sep: G.XR.separacao, fora: G.XR.foraDoCorpo };
    },
    /* SAIR DO ESPECTADOR. A fase é escrita à mão, e isso é declarado: quem
       a move para `ENDED` no produto é o fim de partida vindo do SERVIDOR,
       e derrubar a sala inteira só para medir o frame seguinte trocaria uma
       medida por uma encenação maior. `brTick` só LÊ `S.phase` (é o mesmo
       movimento que a bancada de C2 declarou na rodada 18). */
    async sairDoEspectador() {
      D.S.phase = 'ENDED';
      window.__BR_freeze = false;
      await espera(500);
      return { fase: D.S.phase, bandeira: !!window.__BR_espectador };
    },
    /* O CUSTO DA BANDEIRA: uma leitura de global no guarda do dreno (todo
       frame de XR) e uma escrita no `brTick` (todo frame da janela). */
    custoDaBandeira(n = 400000) {
      const t0 = performance.now();
      let acc = 0;
      for (let i = 0; i < n; i++) {
        window.__BR_espectador = (D.S.phase === 'SPECT');
        if (!window.__BR_espectador) acc++;
      }
      return { ms: (performance.now() - t0) / n, acc };
    },
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
    /* GRAVA SEM PASSO NENHUM — é assim que o gêmeo mede o alvo andando. */
    async observar(ms) {
      S.tr.length = 0; S.frames = 0; S.on = true;
      await espera(ms);
      S.on = false;
      return resumo();
    },
  };
  return true;
}

describe('A6 · o espectador do BR e o passo físico (sessão imersiva real)',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h, bot;

    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      bot = await startBRMatch(h, { hostCode: 'QUEDALIVRE' });
      await h.play(instalarSonda);
      const n = await h.play(() => window.__SPECT.esperarAlvo());
      assert.ok(n > 0,
        'pré-condição falhou: nenhum adversário vivo — o espectador cairia no ramo '
        + '"ninguém pra assistir" e o caso passaria vazio');
    });
    after(async () => { if (bot) bot.close(); if (h) await h.close(); });

    /* ============================================================
       O DEFEITO. 0,9800 m de caminhada → 0,0200 m de vista (2,04 %). */
    it('dado o espectador com alvo vivo, então a caminhada física do jogador chega '
      + 'INTEIRA na vista dele', async () => {
      const r = await h.play(async () => {
        const e = await window.__SPECT.entrar();
        if (e.fase !== 'SPECT') return { erro: 'não entrei em espectador', e };
        await window.__SPECT.recentrarCabeca();
        return Object.assign(await window.__SPECT.caminhar({ metros: 0.98 }), { e });
      });
      assert.ok(!r.erro, `${r.erro || ''} ${JSON.stringify(r.e || {})}`);
      assert.ok(!r.vazio && r.frames > 20,
        `só ${r.frames} frames renderizados (n=${r.n}) — a sonda está cega`);
      console.log(`      SPECT/passo: passo físico ${r.passo.toFixed(4)} m → VISTA `
        + `${r.vista.toFixed(4)} m (${(100 * r.vista / Math.max(r.passo, 1e-9)).toFixed(2)} %) · `
        + `colisor ${r.colisor.toFixed(4)} m · alvo derivou ${r.alvoDerivou.toFixed(4)} m · `
        + `maior delta/frame ${r.maiorDeltaPose.toFixed(4)} m · ${r.frames} frames`);
      assert.equal(r.spect, true, 'a fase saiu de SPECT no meio da medição');
      assert.equal(r.temAlvo, true,
        'o alvo assistido sumiu no meio — o espectador caiu no ramo sem alvo');
      assert.ok(r.giroMax < 1e-6,
        `giro artificial em ${r.giroMax.toFixed(6)} rad — a órbita do espectador segue o `
        + 'yaw do rig, e o alvo dela teria andado no meio da medida');
      assert.ok(r.maiorDeltaPose < 0.35,
        `um frame moveu a cabeça ${r.maiorDeltaPose.toFixed(4)} m — isso é o ramo de `
        + 'descarte do rig, não passo');
      assert.ok(r.passo > 0.9, `o headset andou ${r.passo.toFixed(4)} m — o cenário não aconteceu`);
      assert.ok(r.alvoDerivou < ALVO_PARADO,
        `o alvo assistido andou ${r.alvoDerivou.toFixed(4)} m durante a janela — a vista `
        + 'mediu o alvo, não o jogador');
      assert.ok(r.vista >= r.passo * VISTA_MIN,
        `${r.passo.toFixed(4)} m de caminhada física moveram a vista ${r.vista.toFixed(4)} m `
        + `(${(100 * r.vista / r.passo).toFixed(2)} %) — o espectador engoliu o passo`);
      assert.ok(r.vista <= r.passo * VISTA_MAX,
        `a vista andou ${r.vista.toFixed(4)} m para ${r.passo.toFixed(4)} m de passo — o `
        + 'espectador ganhou locomoção que ninguém comandou');
    });

    /* ============================================================
       A OUTRA PONTA: o espectador existe para SEGUIR o alvo. Sem este
       caso, congelar `player.pos` passaria no caso de cima. */
    it('dado o ALVO assistido andando e o jogador parado, então a vista do espectador '
      + 'vai atrás dele', async () => {
      const antes = await h.play(async () => {
        const e = await window.__SPECT.entrar();
        if (e.fase !== 'SPECT') return { erro: 'não entrei em espectador', e };
        await window.__SPECT.recentrarCabeca();
        return { ok: true, n: window.__SPECT.nAlvos() };
      });
      assert.ok(!antes.erro, `${antes.erro || ''}`);
      /* o bot-host anda de verdade pelo socket — é o mesmo caminho por onde
         a posição de qualquer adversário chega ao cliente */
      bot.emit('state', { pos: [30, 2, 30], rotY: 0 });
      await new Promise(r => setTimeout(r, 600));
      const grava = h.play(() => window.__SPECT.observar(2600));
      for (let i = 1; i <= 8; i++) {
        bot.emit('state', { pos: [30 + i * 2.2, 2, 30], rotY: 0 });
        await new Promise(r => setTimeout(r, 250));
      }
      const r = await grava;
      assert.ok(!r.vazio && r.frames > 20,
        `só ${r.frames} frames renderizados (n=${r.n}) — a sonda está cega`);
      console.log(`      SPECT/alvo: o alvo andou ${r.alvoDerivou.toFixed(4)} m · a VISTA foi `
        + `${r.vista.toFixed(4)} m atrás dele · passo físico ${r.passo.toFixed(4)} m · `
        + `${r.frames} frames`);
      assert.equal(r.spect, true, 'a fase saiu de SPECT no meio da medição');
      assert.ok(r.passo < 0.02,
        `o jogador andou ${r.passo.toFixed(4)} m no quarto — o caso mediria as duas coisas juntas`);
      assert.ok(r.alvoDerivou > 5,
        `pré-condição falhou: o alvo andou só ${r.alvoDerivou.toFixed(2)} m — sem alvo em `
        + 'movimento o caso passaria vazio');
      assert.ok(r.vista > r.alvoDerivou * 0.7,
        `o alvo andou ${r.alvoDerivou.toFixed(2)} m e a vista do espectador foi só `
        + `${r.vista.toFixed(2)} m atrás — o espectador parou de seguir`);
    });

    /* ============================================================
       E O COLISOR NÃO PODE TELEPORTAR. `spectStep` põe `player.pos` no
       alvo assistido, que pode estar a centenas de metros; se o passo
       físico voltar a entrar por ali, o servidor lê teleporte. */
    it('dado o espectador andando pelo quarto, então nenhum frame teleporta o colisor',
      async () => {
        const r = await h.play(async () => {
          const e = await window.__SPECT.entrar();
          if (e.fase !== 'SPECT') return { erro: 'não entrei em espectador', e };
          await window.__SPECT.recentrarCabeca();
          return window.__SPECT.caminhar({ metros: 0.6 });
        });
        assert.ok(!r.erro, `${r.erro || ''}`);
        assert.ok(!r.vazio && r.frames > 20,
          `só ${r.frames} frames renderizados (n=${r.n}) — a sonda está cega`);
        console.log(`      SPECT/salto: maior salto de colisor num frame `
          + `${r.maiorSaltoColisor.toFixed(4)} m · passo ${r.passo.toFixed(4)} m · `
          + `${r.frames} frames`);
        assert.ok(r.maiorSaltoColisor < 1.0,
          `um frame moveu o colisor ${r.maiorSaltoColisor.toFixed(4)} m no espectador`);
      });

    /* ============================================================
       A BANDEIRA NÃO PODE GRUDAR. Ela desliga o dreno do passo físico; se
       sobreviver ao fim do espectador, o jogador volta ao jogo com o
       colisor plantado debaixo de uma cabeça que anda — que é o defeito
       que a rodada 17 consertou, ressuscitado por esta correção. */
    it('dado o jogador SAINDO do espectador, então o dreno do passo volta e o colisor '
      + 'anda de novo debaixo da cabeça', async () => {
      const r = await h.play(async () => {
        const e = await window.__SPECT.entrar();
        if (e.fase !== 'SPECT') return { erro: 'não entrei em espectador', e };
        await window.__SPECT.recentrarCabeca();
        const s = await window.__SPECT.sairDoEspectador();
        return Object.assign(await window.__SPECT.caminhar({ metros: 0.6 }), { s });
      });
      assert.ok(!r.erro, `${r.erro || ''}`);
      assert.ok(!r.vazio && r.frames > 20,
        `só ${r.frames} frames renderizados (n=${r.n}) — a sonda está cega`);
      console.log(`      SPECT/saída: bandeira ${r.s.bandeira} na fase ${r.s.fase} · `
        + `passo ${r.passo.toFixed(4)} m → COLISOR ${r.colisor.toFixed(4)} m `
        + `(${(100 * r.colisor / Math.max(r.passo, 1e-9)).toFixed(2)} %) · ${r.frames} frames`);
      assert.equal(r.spect, false, 'a fase continuou em SPECT — a saída não aconteceu');
      assert.equal(r.s.bandeira, false,
        'a bandeira `__BR_espectador` continuou ligada fora do espectador');
      assert.ok(r.passo > 0.55, `o headset andou ${r.passo.toFixed(4)} m — o cenário não aconteceu`);
      assert.ok(r.colisor >= r.passo * VISTA_MIN,
        `o colisor andou ${r.colisor.toFixed(4)} m de ${r.passo.toFixed(4)} m de passo físico `
        + `(${(100 * r.colisor / r.passo).toFixed(2)} %) — o dreno não voltou ao sair do espectador`);
    });

    it('o custo da bandeira por frame', async () => {
      const c = await h.play(() => window.__SPECT.custoDaBandeira());
      console.log(`      CUSTO: bandeira do espectador ${c.ms.toFixed(6)} ms por frame`);
      assert.ok(c.ms < 0.001, `bandeira a ${c.ms.toFixed(6)} ms por frame`);
    });
  });
