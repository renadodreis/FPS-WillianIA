/* ================================================================
   QA — I4 · NENHUM ESTADO SEM SAÍDA: OS QUATRO QUE FALTAVAM.

   docs/vr/progresso.md (medição anterior, sem escrever teste novo) já
   auditou a cobertura existente e achou 6 de 10 estados PROVADOS por
   clique real (`test/xr-ui.test.js`: jogando, pausado, morto, fim de
   partida; `test/xr-menu.test.js`: lobby) — e 4 sem prova nenhuma: NAVE,
   QUEDA, DIRIGINDO, ESPECTADOR. Este arquivo fecha esses quatro.

   MÉTODO — o mesmo dos outros seis, sem inventar um segundo: `XRUI.update`
   já roda TODO frame de sessão XR (`game.js`, guardado só por `xrOn`, nunca
   por fase de BR nem por `state.driving`) — a expectativa é que o botão de
   pausa (clique do analógico direito) funcione em qualquer estado. Mas
   "expectativa não é medição" é a lição mais repetida deste repo: cada
   estado é alcançado pelo CAMINHO DO JOGO (nave/queda via BR de verdade
   com bot-host, `startBRMatchInShip` + `__BR_debug.jump()`; dirigindo via
   `G.tryToggleCar()` no helicóptero, o mesmo caminho de
   `xr-heli-piloto.test.js`; espectador via `__BR_debug.spect()`, o mesmo
   de `xr-spect-passo.test.js`), e a saída é um clique REAL no botão
   VOLTAR/SAIR do painel — nunca uma chamada direta à função do jogo.

   Portas próprias por describe (4 sessões independentes, cada uma sobe e
   derruba seu servidor): 3872 (nave), 3874 (queda), 3876 (dirigindo),
   3878 (espectador).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch, startBRMatchInShip } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

/* Ferramentas de painel reaproveitadas do padrão de test/xr-ui.test.js —
   mesmos nomes, mesmo comportamento, instaladas de novo aqui porque cada
   describe deste arquivo sobe sua própria página/sessão. */
async function instalarPainel() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  const v3 = a => new T.Vector3(a[0], a[1], a[2]);
  window.__I4 = {
    estado: () => G.XRUI.estado(),
    linha: id => (G.XRUI.estado().linhas || []).find(l => l.id === id) || null,
    /* BOTÃO DE PAUSA DE VERDADE: clique do analógico direito, o mesmo que
       um jogador de headset apertaria — não `XRUI.abrir()`. É exatamente
       isto que o critério I4 cobra ("usando só os controles"). */
    async abrirPausa() {
      window.__A.botao('right', 'thumbstick', 1);
      await window.__A.espera(200);
      window.__A.botao('right', 'thumbstick', 0);
      await window.__A.espera(350);
    },
    /* `Matrix4.lookAt(eye, alvo, up)` (o padrão de test/xr-ui.test.js) degenera
       perto de ALVO QUASE NO ZÊNITE: o produto vetorial `up × direção` que a
       constrói vai a quase-zero quando a direção é quase paralela ao próprio
       up (0,1,0), e a base sai instável — é o caso de apontar para um painel
       muitos metros ACIMA a pouca distância horizontal (queda livre com o
       painel ainda convergindo, ver `gapVertical`). `setFromUnitVectors` não
       usa vetor de referência nenhum: alinha o -Z do controle à direção pedida
       por qualquer ângulo, sem singularidade — e o ROLL em torno do eixo não
       importa aqui porque `bater()` (js/xr/xrui.js) só usa direção e origem
       do raio, nunca a rotação em torno dele. */
    apontar: (qual, alvoMundo) => {
      const dev = window.__xrEmulado, rig = G.XR.rig;
      rig.updateWorldMatrix(true, false);
      MP.camera.updateWorldMatrix(true, false);
      const cab = MP.camera.getWorldPosition(new T.Vector3());
      const mao = new T.Vector3(cab.x + (qual === 'left' ? -0.22 : 0.22), cab.y - 0.35, cab.z);
      const dir = v3(alvoMundo).sub(mao).normalize();
      const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, -1), dir);
      const p = mao.clone();
      rig.worldToLocal(p);
      q.premultiply(rig.getWorldQuaternion(new T.Quaternion()).invert());
      dev.controllers[qual].position.set(p.x, p.y, p.z);
      dev.controllers[qual].quaternion.set(q.x, q.y, q.z, q.w);
    },
    async clique(qual) {
      window.__A.botao(qual || 'right', 'trigger', 1);
      await window.__A.espera(200);
      window.__A.botao(qual || 'right', 'trigger', 0);
      await window.__A.espera(350);
    },
    /* GAP vertical painel↔olho, em metros — a âncora independente do defeito
       da Rodada 23 (painel de pausa preso em altura velha durante queda
       livre): `erroDeVista()` em js/xr/xrui.js zera a componente Y de
       propósito (é cone de GIRO), então antes do fix nada disparava o
       reposicionamento por queda. Medir a DISTÂNCIA, não o clique, é o que
       sobrevive a mudanças de layout do painel. */
    gapVertical: () => {
      const e = G.XRUI.estado();
      if (!e.aberto) return null;
      MP.camera.updateWorldMatrix(true, false);
      const olhoY = MP.camera.getWorldPosition(new T.Vector3()).y;
      return Math.abs(e.pos[1] - olhoY);
    },
    /* O ROTEIRO INTEIRO DE I4, PARTINDO DE QUALQUER ESTADO: abre a pausa
       pelo botão real, aponta e clica em SAIR (o id é sempre 'sair' — só o
       texto muda entre "SAIR DA PARTIDA" e "VOLTAR AO MENU", ver
       js/xr/xrui.js linhas()). Devolve tudo que uma prova de I4 precisa. */
    async tentarVoltarAoMenu() {
      const antesTinhaPainel = !!(await (async () => G.XRUI.estado().aberto)());
      await window.__I4.abrirPausa();
      const e1 = window.__I4.estado();
      const linhaSair = window.__I4.linha('sair');
      if (!linhaSair) {
        return { abriuPausa: e1.aberto, tinhaLinhaSair: false, presenting: G.XR.presenting };
      }
      /* PERSEGUE ATÉ CONFIRMAR O HOVER, SÓ DEPOIS CLICA: o painel é objeto de
         MUNDO em movimento (durante queda livre real ele nunca para de vez,
         só converge — ver o teste de convergência acima) e GIRA junto
         (`painel.lookAt(_olho)` a cada frame, olho subindo/descendo). Mirar
         uma vez no centro e disparar às cegas confunde linha vizinha (medido:
         pousava em "recentrar" em vez de "sair", uma fileira de distância) —
         exatamente o erro que um jogador de verdade EVITA porque vê o realce
         de hover antes de apertar. Este laço faz a mesma coisa: reaponta,
         espera o hover assentar, só aperta quando `item.id==='sair'`. */
      let tentativas = 0, hoverOk = false;
      let e2 = window.__I4.estado();
      while (e2.modo !== 'menu' && tentativas < 150) {
        const alvoAgora = window.__I4.linha('sair') || linhaSair;
        window.__I4.apontar('right', alvoAgora.centro);
        await window.__A.espera(180);   // deixa o hover (calculado por frame) assentar, com folga generosa pra máquina sob carga
        const item = window.__I4.estado().item;
        hoverOk = !!(item && item.id === 'sair');
        if (hoverOk) {
          window.__A.botao('right', 'trigger', 1);
          await window.__A.espera(60);
          window.__A.botao('right', 'trigger', 0);
          await window.__A.espera(120);
        }
        e2 = window.__I4.estado();
        tentativas++;
      }
      await window.__A.espera(500);
      e2 = window.__I4.estado();
      return {
        antesTinhaPainel, abriuPausa: e1.aberto, tinhaLinhaSair: true, tentativas, hoverOk,
        presenting: G.XR.presenting, started: G.state.started,
        modoDepois: e2.modo, abertoDepois: e2.aberto,
      };
    },
  };
  return true;
}

describe('I4 · nave → menu (sessão IWER real, BR de verdade)',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    const PORT = 3872;
    let h, bot;
    before(async () => {
      // FLY_TIME alto: a nave não pode terminar sozinha no meio do teste
      h = await bootEmVR(bootGame, { port: PORT, extraEnv: { FLY_TIME: '600' } });
      await h.play(instalarPainel);
      bot = await startBRMatchInShip(h);
    });
    after(async () => { if (bot) bot.close(); if (h) await h.close(); });

    it('dado o jogador NA NAVE, então o botão de pausa abre o painel e SAIR volta ao menu', async () => {
      const r = await h.play(async () => {
        const fase = window.__BR_debug.S.phase;
        const res = await window.__I4.tentarVoltarAoMenu();
        return { fase, ...res };
      });
      assert.equal(r.fase, 'SHIP', `o teste não estava na nave de verdade (fase=${r.fase})`);
      assert.equal(r.abriuPausa, true, 'o clique do analógico não abriu o painel de pausa na nave — BECO (I4)');
      assert.equal(r.tinhaLinhaSair, true, 'o painel de pausa na nave não oferece SAIR');
      assert.equal(r.presenting, true, 'sair da nave não pode encerrar a sessão XR — o menu é no mundo');
      assert.equal(r.modoDepois, 'menu', `depois de sair da nave o painel ficou em "${r.modoDepois}"`);
      assert.equal(r.abertoDepois, true, 'saiu da nave e ficou sem tela nenhuma — beco de I4');
    });
  });

describe('I4 · queda livre → menu (sessão IWER real, BR de verdade)',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    const PORT = 3874;
    let h, bot;
    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT, extraEnv: { FLY_TIME: '600' } });
      await h.play(instalarPainel);
      bot = await startBRMatchInShip(h);
      // PULA PELO CAMINHO DO JOGO: __BR_debug.jump === jumpFromShip, a mesma
      // função que o botão de pular do jogador chama (br-game.js:1872).
      await h.play(async () => {
        window.__BR_debug.jump();
        await window.__A.espera(400);
      });
    });
    after(async () => { if (bot) bot.close(); if (h) await h.close(); });

    it('o painel de pausa CONVERGE em altura durante a queda — não diverge sem limite como antes do fix',
      async () => {
        /* ACHADO desta rodada, medido por aritmética independente: antes do
           fix o painel ficava a 41,6 m do olho, crescendo sem parar enquanto
           a queda durasse — `erroDeVista()` mede só GIRO (zera Y de
           propósito) e nada disparava reposição por queda de altura sozinha.

           A ÂNCORA CERTA não é uma tolerância pequena inventada: um filtro de
           1ª ordem (`seguir()`, `TAU=0,22 s`) perseguindo um alvo em
           velocidade CONSTANTE nunca fecha o gap a zero — converge para
           `v·TAU`, e a queda tem teto de velocidade conhecido
           (`maxFall=46 m/s`, br-game.js): `46×0,22 ≈ 10,1 m` é o PIOR CASO
           físico do próprio desenho, não um número solto. O que prova o fix
           é o gap PARAR DE CRESCER (convergir) bem abaixo do 41,6 m medido
           antes — não ficar pequeno. */
        const TETO_FISICO = 46 * 0.22 + 3; // margem sobre v_max·TAU do próprio código
        const r = await h.play(async () => {
          await window.__I4.abrirPausa();
          await window.__A.espera(800);           // deixa o amortecimento entrar em regime
          const gapA = window.__I4.gapVertical();
          await window.__A.espera(1200);           // mais tempo de queda em velocidade ~constante
          const gapB = window.__I4.gapVertical();
          await window.__I4.abrirPausa();          // fecha de novo — deixa o estado limpo pro próximo caso
          return { gapA, gapB };
        });
        assert.ok(r.gapA < TETO_FISICO,
          `gap depois de 0,8 s de queda: ${r.gapA.toFixed(2)} m — acima do pior caso físico (${TETO_FISICO.toFixed(1)} m)`);
        assert.ok(r.gapB < TETO_FISICO,
          `gap depois de 2,0 s de queda: ${r.gapB.toFixed(2)} m — acima do pior caso físico (${TETO_FISICO.toFixed(1)} m)`);
      });

    it('dado o jogador EM QUEDA LIVRE, então o botão de pausa abre o painel e SAIR volta ao menu', async () => {
      const r = await h.play(async () => {
        const fase = window.__BR_debug.S.phase;
        const res = await window.__I4.tentarVoltarAoMenu();
        return { fase, ...res };
      });
      assert.equal(r.fase, 'FALL', `o teste não estava em queda livre de verdade (fase=${r.fase})`);
      assert.equal(r.abriuPausa, true, 'o clique do analógico não abriu o painel de pausa em queda — BECO (I4)');
      assert.equal(r.tinhaLinhaSair, true, 'o painel de pausa em queda não oferece SAIR');
      assert.equal(r.presenting, true, 'sair da queda não pode encerrar a sessão XR');
      assert.equal(r.modoDepois, 'menu', `depois de sair da queda o painel ficou em "${r.modoDepois}"`);
      assert.equal(r.abertoDepois, true, 'saiu da queda e ficou sem tela nenhuma — beco de I4');
    });
  });

describe('I4 · dirigindo (helicóptero) → menu (sessão IWER real, solo)',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    const PORT = 3876;
    let h;
    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      await h.play(instalarPainel);
      // ENTRAR PELO CAMINHO DO JOGO: mesma sequência de xr-heli-piloto.test.js.
      await h.play(async () => {
        const G = window.__game, MP = window.__MP;
        const x = 40, z = 40, gy = MP.groundAt(x, z, 100);
        G.Heli.group.position.set(x, gy + 0.05, z);
        G.Heli.group.rotation.set(0, 0, 0);
        MP.player.pos.set(x + 1.5, MP.groundAt(x + 1.5, z, 100), z);
        MP.player.vel.set(0, 0, 0);
        await window.__A.espera(300);
        G.tryToggleCar();
        await window.__A.espera(600);
      });
    });
    after(async () => { if (h) await h.close(); });

    it('dado o jogador DIRIGINDO (helicóptero), então o botão de pausa abre o painel e SAIR volta ao menu', async () => {
      const r = await h.play(async () => {
        // helicóptero usa state.flying (js/heli.js:90), não state.driving (esse é do carro)
        const flying = !!window.__MP.state.flying;
        const res = await window.__I4.tentarVoltarAoMenu();
        return { flying, ...res };
      });
      assert.equal(r.flying, true, 'o teste não estava dirigindo (voando) de verdade — tryToggleCar não engatou o helicóptero');
      assert.equal(r.abriuPausa, true, 'o clique do analógico não abriu o painel de pausa dirigindo — BECO (I4)');
      assert.equal(r.tinhaLinhaSair, true, 'o painel de pausa dirigindo não oferece SAIR');
      assert.equal(r.presenting, true, 'sair dirigindo não pode encerrar a sessão XR');
      assert.equal(r.modoDepois, 'menu', `depois de sair dirigindo o painel ficou em "${r.modoDepois}"`);
      assert.equal(r.abertoDepois, true, 'saiu dirigindo e ficou sem tela nenhuma — beco de I4');
    });
  });

describe('I4 · espectador → menu (sessão IWER real, BR de verdade)',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    const PORT = 3878;
    let h, bot;
    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      bot = await startBRMatch(h);
      await h.play(instalarPainel);
      // ENTRA NO ESPECTADOR PELO CAMINHO DO JOGO: __BR_debug.spect ===
      // enterSpectator, a mesma função que o fim da recapitulação de morte
      // chama (mesmo caminho de xr-spect-passo.test.js).
      await h.play(async () => {
        window.__BR_debug.spect();
        await window.__A.espera(400);
      });
    });
    after(async () => { if (bot) bot.close(); if (h) await h.close(); });

    it('dado o jogador ESPECTANDO, então o botão de pausa abre o painel e SAIR volta ao menu', async () => {
      const r = await h.play(async () => {
        const fase = window.__BR_debug.S.phase;
        const res = await window.__I4.tentarVoltarAoMenu();
        return { fase, ...res };
      });
      assert.equal(r.fase, 'SPECT', `o teste não estava espectando de verdade (fase=${r.fase})`);
      assert.equal(r.abriuPausa, true, 'o clique do analógico não abriu o painel de pausa no espectador — BECO (I4)');
      assert.equal(r.tinhaLinhaSair, true, 'o painel de pausa no espectador não oferece SAIR');
      assert.equal(r.presenting, true, 'sair do espectador não pode encerrar a sessão XR');
      assert.equal(r.modoDepois, 'menu', `depois de sair do espectador o painel ficou em "${r.modoDepois}"`);
      assert.equal(r.abertoDepois, true, 'saiu do espectador e ficou sem tela nenhuma — beco de I4');
    });
  });
