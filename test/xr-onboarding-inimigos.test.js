/* ================================================================
   QA — ONBOARDING DE SOBREVIVÊNCIA, SÓ EM SOLO VR (P0 item 5 da missão).

   O PEDIDO: "Crie um perfil de onboarding somente para desenvolvimento/solo
   VR, claramente isolado e desativado fora desse contexto. Garanta proteção
   inicial suficiente, dano recebido reduzido e entrada gradual de inimigos.
   Como aceite inicial: pelo menos 15s sem dano [...] no máximo dois
   atacantes próximos durante o primeiro minuto."

   ANTES DESTA RODADA, js/skeletons.js não tinha isso: os 7 esqueletos
   perseguem o jogador de QUALQUER distância desde o primeiro frame —
   test/skeletons.test.js já cobre isso como comportamento INTENCIONAL do
   jogo normal ("um esqueleto longe, então ele caça o player sem desistir").
   Este arquivo não mexe nisso: mede um modo NOVO, opt-in, que só liga quando
   o game.js chama `Skeletons.iniciarOnboarding()` — e isso só pode
   acontecer em solo (`!__MP_active`, `!__BR_active`) dentro de sessão XR.

   POR QUE NÃO USA `G.tick()`: a suíte de esqueletos já documentou a
   armadilha — `tick` acorda os 12 soldados de `js/enemies.js`, que atiram à
   distância e contaminam a medição de dano com uma causa que não é a que
   este teste mede. Segue o mesmo padrão de test/skeletons.test.js: dirige
   `Skeletons.update(dt, t)` DIRETO, e usa `G.forceStart()`/reset manual de
   `state.started` só para o teste de FIAÇÃO (quando o game.js liga o
   onboarding), que não entra em loop nenhum.

   COMO EVITA MEDIR PROXY: em vez de confiar na distância natural de spawn
   (90–460 m, que sozinha já dá ~29 s de folga e esconderia o defeito por
   acidente — família 9 do CLAUDE.md), o setup TELEPORTA os esqueletos para
   2 m do jogador — pior caso, construção de cenário, não medição. A régua
   que decide é sempre `player.health` e o estado real de movimento/ataque,
   nunca a distância de spawn ou uma bandeira que o próprio código inventa.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

async function instalarSondas(h) {
  await h.page.evaluate(() => {
    window.__ONB = {
      empilhar(G) {
        const list = G.Skeletons.list;
        const P = window.QA.MP.player.pos;
        for (let i = 0; i < list.length; i++) {
          const sk = list[i];
          sk.alive = true;
          sk.hp = 90;
          sk.attacking = false;
          sk.attackT = 0;
          sk.attackHit = false;
          sk.hitT = 0;
          sk.respawnT = 0;
          const a = (i / list.length) * Math.PI * 2;
          sk.group.position.set(P.x + Math.cos(a) * 2, P.y, P.z + Math.sin(a) * 2);
        }
      },
      /* Roda `passos` chamadas diretas de `Skeletons.update`, colhendo o pior
         caso de "quantos esqueletos ativos ao mesmo tempo" e o instante do
         1º dano. */
      medir(G) {
        const S = G.Skeletons, P = window.QA.MP.player;
        const vidaInicial = P.health;
        let primeiroDanoEm = null;
        let maxAtivosSimultaneos = 0;
        const dt = 1 / 60;
        const passos = Math.round(90 / dt); // 90 s simulados, direto no módulo
        for (let i = 0; i < passos; i++) {
          S.update(dt, i * dt);
          const t = (i + 1) * dt;
          if (primeiroDanoEm === null && P.health < vidaInicial) primeiroDanoEm = t;
          let ativos = 0;
          for (const sk of S.list) {
            if (!sk.alive) continue;
            // "ativo" = perseguindo/engajando de verdade — medido pelo
            // COMPORTAMENTO (ataque em curso ou já dentro do alcance de
            // perigo), nunca por uma bandeira interna que o próprio código
            // sob teste poderia inventar.
            if (sk.attacking || sk.targetDistance < 1.6) ativos++;
          }
          if (ativos > maxAtivosSimultaneos) maxAtivosSimultaneos = ativos;
        }
        return { primeiroDanoEm, maxAtivosSimultaneos };
      },
    };
  });
}

describe('onboarding de inimigos — comportamento (Skeletons.update direto)',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => { h = await bootGame({ port: 3864 }); await instalarSondas(h); });
    after(async () => { if (h) await h.close(); });

    it('com onboarding ligado: 15s sem dano e no máx 2 esqueletos ativos no 1º minuto', async () => {
      const r = await h.play(() => {
        const G = window.__game;
        window.QA.reset(30, 30);
        G.Skeletons.iniciarOnboarding();
        window.__ONB.empilhar(G);
        return window.__ONB.medir(G);
      });
      assert.ok(r.primeiroDanoEm === null || r.primeiroDanoEm >= 15,
        `tomou dano em ${r.primeiroDanoEm}s — o pedido é pelo menos 15s de graça no onboarding`);
      assert.ok(r.maxAtivosSimultaneos <= 2,
        `${r.maxAtivosSimultaneos} esqueletos ativos ao mesmo tempo — o teto pedido é 2`);
    });

    it('sem onboarding (comportamento de sempre): o teto de 2 NÃO se aplica', async () => {
      const r = await h.play(() => {
        const G = window.__game;
        window.QA.reset(30, 30);
        // sem iniciarOnboarding(): é o estado padrão do jogo hoje
        window.__ONB.empilhar(G);
        return window.__ONB.medir(G);
      });
      assert.ok(r.maxAtivosSimultaneos > 2,
        'sem onboarding mais de 2 esqueletos devem perseguir juntos — senão o teto virou permanente ' +
        'e deixou de ser um modo opt-in isolado');
    });
  });

describe('onboarding de inimigos — fiação (quando o game.js liga)',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => { h = await bootGame({ port: 3866, autoStart: false, online: false }); });
    after(async () => { if (h) await h.close(); });

    it('só chama Skeletons.iniciarOnboarding em solo VR — nunca em desktop nem em multiplayer', async () => {
      const r = await h.play(() => {
        const G = window.__game, R = window.__MP.renderer;
        R.setAnimationLoop(null);
        let chamou = 0;
        const original = G.Skeletons.iniciarOnboarding;
        G.Skeletons.iniciarOnboarding = (...a) => { chamou++; return original.apply(G.Skeletons, a); };

        function cenario(xrPresente, mpAtivo) {
          G.state.started = false;
          window.__MP_active = mpAtivo;
          R.xr.isPresenting = xrPresente;
          chamou = 0;
          G.forceStart();
          return chamou;
        }

        const desktop = cenario(false, false);
        const multiplayerVR = cenario(true, true);
        const soloVR = cenario(true, false);

        G.Skeletons.iniciarOnboarding = original;
        R.xr.isPresenting = false;
        window.__MP_active = false;
        R.setAnimationLoop(() => G.tick());
        return { desktop, multiplayerVR, soloVR };
      });
      assert.equal(r.desktop, 0, 'chamou iniciarOnboarding fora de VR — vazou pro desktop');
      assert.equal(r.multiplayerVR, 0, 'chamou iniciarOnboarding em multiplayer — vazou pro modo online');
      assert.equal(r.soloVR, 1, 'não chamou iniciarOnboarding em solo VR — o caso que deveria ligar');
    });
  });
