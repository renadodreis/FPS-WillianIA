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
      /* Distâncias DIFERENTES e conhecidas (não o mesmo raio pra todos), pra
         a ordem de "quem é o mais próximo" ficar determinística — é essa
         ordem que `ativosPermitidos` usa pra decidir quem persegue. */
      espalharDistancias(G, dists) {
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
          const d = dists[i];
          sk.group.position.set(P.x + Math.cos(a) * d, P.y, P.z + Math.sin(a) * d);
        }
      },
      /* "ativo" pelo COMPORTAMENTO real (andou de verdade em direção ao
         jogador), não por uma bandeira interna do módulo sob teste. */
      andou(sk, antesX, antesZ) {
        return Math.hypot(sk.group.position.x - antesX, sk.group.position.z - antesZ) > 0.01;
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

    /* ÚLTIMO da bateria de propósito: `iniciarOnboarding()` não tem "desligar"
       (é opt-in de uma via, por construção), e `onboardingT` some, não zera,
       entre chamadas de `update()` — outro `it()` depois deste herdaria o
       relógio já rearmado e a suposição de "onboarding desligado" do caso
       acima quebraria. Ver o comentário da Rodada 21 em docs/vr/progresso.md. */
    it('matar os 2 ativos libera vaga pro próximo mais próximo NO PRÓXIMO FRAME — sem fantasma, sem enxame',
      async () => {
        /* O ACEITE PEDE "eliminar 3 inimigos sem enxame ou spawn injusto".
           Os dois casos acima medem o TETO parado; nenhum mede o que acontece
           DEPOIS de matar — é aí que um esqueleto morto poderia continuar
           contando pra vaga (fantasma) ou nenhum substituto assumir (o
           jogador ficaria livre demais, o que também não é o pedido: entrada
           GRADUAL, não zero depois da graça).

           "ATIVO" É DISTÂNCIA CAINDO ABAIXO DO SPAWN, não "chegou ao alcance
           de ataque". Primeira versão deste teste cobrava `attacking ||
           targetDistance<1.6` e morreu num falso-negativo: a régua de
           NAVEGAÇÃO (desviar de obstáculo/estrutura perto do spawn de teste)
           é outro assunto, já coberto em test/skeletons.test.js ("dado um
           obstáculo no caminho, então o esqueleto DESVIA"). O que ESTE teste
           garante é elegibilidade (a vaga abriu e foi ocupada), não a
           geometria do trajeto até o corpo a corpo — medido: o candidato a
           9 m andou 9,00→6,78 m em 1 s e depois ficou preso contra algo perto
           de (30,30) pelo resto da janela; exigir alcance de ataque ali
           reprovava um onboarding correto por causa do mapa, não da lógica.
           Um esqueleto PASSIVO nunca sai do lugar (o ramo de movimento nem
           roda), então `targetDistance` dele fica EXATAMENTE igual ao spawn
           — a régua abaixo não empata por acidente. */
        const r = await h.play(() => {
          const G = window.__game, S = G.Skeletons, P = window.QA.MP.player;
          window.QA.reset(30, 30);
          G.Skeletons.iniciarOnboarding();
          // distâncias conhecidas: índice 0 é o mais próximo, 6 o mais longe
          const dists = [5, 6, 7, 8, 9, 10, 11];
          window.__ONB.espalharDistancias(G, dists);
          const dt = 1 / 60;
          let t = 0;
          const passo = () => { S.update(dt, t); t += dt; };
          const EPS = 0.05;
          /* `sk.alive` entra na régua: morto não anda (o loop de `update`
             desvia pro ramo de respawn e nem toca `targetDistance`), mas o
             campo fica com o valor STALE de antes da morte — sem o
             `sk.alive`, um morto que já tinha andado mediria "ativo" pra
             sempre. */
          const ativo = (sk, i) => sk.alive && sk.targetDistance < dists[i] - EPS;
          // passa da graça (15s) com folga pra quem tem vaga começar a andar
          for (let i = 0; i < Math.ceil(17 / dt); i++) passo();
          const ativosPosGraca = S.list.map(ativo);

          // mata os DOIS mais próximos (índices 0 e 1) pelo caminho real de dano
          const morreu0 = S.list[0].damage(S.list[0].hp);
          const morreu1 = S.list[1].damage(S.list[1].hp);
          const aliveAposKill = S.list.map(sk => sk.alive);
          const visibleAposKill = S.list.map(sk => sk.group.visible);

          passo();   // UM frame depois da morte — a vaga já tem que estar livre
          const ativosImediatoPosKill = S.list.map(ativo);
          // 1 s basta pra provar elegibilidade (2,7 m ≈ SPEED), sem depender
          // de terreno pra terminar a viagem inteira até o corpo a corpo
          for (let i = 0; i < Math.ceil(1 / dt); i++) passo();
          const ativosPosKill = S.list.map(ativo);

          // mata um terceiro (o novo mais próximo vivo, índice 2) — "eliminar 3" completo
          const morreu2 = S.list[2].damage(S.list[2].hp);
          for (let i = 0; i < Math.ceil(1 / dt); i++) passo();
          const ativosPos3Kills = S.list.map(ativo);

          return {
            morreu0, morreu1, morreu2, aliveAposKill, visibleAposKill,
            ativosPosGraca, ativosImediatoPosKill, ativosPosKill, ativosPos3Kills,
            vidaFinal: P.health,
          };
        });

        assert.ok(r.morreu0 && r.morreu1 && r.morreu2, 'damage(hp) não matou algum dos três — teto não fica provado');

        // ANTES de matar: só os dois mais próximos (0,1) perseguem — o resto passivo
        const contagemGraca = r.ativosPosGraca.filter(Boolean).length;
        assert.equal(contagemGraca, 2,
          `depois da graça, ${contagemGraca} ativos (${JSON.stringify(r.ativosPosGraca)}) — esperado 2`);
        assert.ok(r.ativosPosGraca[0] && r.ativosPosGraca[1],
          `os dois mais próximos (0,1) deveriam estar ativos: ${JSON.stringify(r.ativosPosGraca)}`);

        // os dois mortos não viram fantasma: nem vivos, nem visíveis
        assert.equal(r.aliveAposKill[0], false, 'esqueleto 0 morto continua alive=true — fantasma');
        assert.equal(r.aliveAposKill[1], false, 'esqueleto 1 morto continua alive=true — fantasma');
        assert.equal(r.visibleAposKill[0], false, 'esqueleto 0 morto continua visível — fantasma');
        assert.equal(r.visibleAposKill[1], false, 'esqueleto 1 morto continua visível — fantasma');

        // a vaga libera NO FRAME SEGUINTE (não espera um ciclo de re-cálculo
        // qualquer): os mortos somem da lista de "quem pode ser ativo" na
        // mesma passada que os filtra por `alive`
        assert.equal(r.ativosImediatoPosKill[0], false, 'morto 0 não pode continuar ativo');
        assert.equal(r.ativosImediatoPosKill[1], false, 'morto 1 não pode continuar ativo');

        // com 1s pra provar elegibilidade: exatamente 2 ativos de novo — os
        // dois novos mais próximos VIVOS (índices 2 e 3), nunca enxame,
        // nunca vaga presa (0 ativos depois da graça seria bug oposto)
        const contagemPosKill = r.ativosPosKill.filter(Boolean).length;
        assert.equal(contagemPosKill, 2,
          `depois de matar os 2 ativos, ${contagemPosKill} ativos (${JSON.stringify(r.ativosPosKill)}) ` +
          '— esperado exatamente 2 (a vaga liberada e ocupada pelos próximos mais próximos)');
        assert.ok(r.ativosPosKill[2] && r.ativosPosKill[3],
          `deveriam ser os índices 2 e 3 a assumir: ${JSON.stringify(r.ativosPosKill)}`);
        assert.ok(!r.ativosPosKill[4] && !r.ativosPosKill[5] && !r.ativosPosKill[6],
          `os mais distantes (4,5,6) não podiam virar ativos ainda: ${JSON.stringify(r.ativosPosKill)}`);

        // depois do 3º kill: de novo exatamente 2, nunca mais — "eliminar 3"
        // completo sem que o jogador seja cercado em nenhum momento da cadeia
        const contagem3 = r.ativosPos3Kills.filter(Boolean).length;
        assert.equal(contagem3, 2,
          `depois do 3º kill, ${contagem3} ativos (${JSON.stringify(r.ativosPos3Kills)}) — esperado 2, nunca enxame`);
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

    /* RELATO DO DONO NO APARELHO, 2026-08-30, verbatim: "quando renasço
       continuo cercado de inimigos... mesmos problemas ao entrar no modo
       VR" — depois de morrer e clicar JOGAR DE NOVO, a graça nunca mais
       volta. Causa: `restartMatch()` (game.js) chama `resetarPartida()` e
       liga `state.started` direto — NUNCA passa por `startGame()`, que é o
       ÚNICO call site de `iniciarOnboarding()`. O caso acima só prova a
       PRIMEIRA entrada; este prova a RETOMADA, que é o caminho que o IWER
       nunca exercitou (nenhum teste desta sessão clicava JOGAR DE NOVO em
       solo VR e conferia o onboarding). */
    it('JOGAR DE NOVO em solo VR rearma a graça — a segunda entrada não pode ficar sem proteção',
      async () => {
        const r = await h.play(() => {
          const G = window.__game, R = window.__MP.renderer;
          R.setAnimationLoop(null);
          let chamou = 0;
          const original = G.Skeletons.iniciarOnboarding;
          G.Skeletons.iniciarOnboarding = (...a) => { chamou++; return original.apply(G.Skeletons, a); };

          window.__MP_active = false;
          R.xr.isPresenting = true;
          G.state.started = false;
          chamou = 0;
          G.forceStart();
          const naPrimeiraEntrada = chamou;

          // morre e clica JOGAR DE NOVO — sem sair da sessão, sem voltar ao menu
          window.QA.MP.player.health = 0;
          chamou = 0;
          G.restartMatch();
          const noRetry = chamou;

          G.Skeletons.iniciarOnboarding = original;
          R.xr.isPresenting = false;
          window.__MP_active = false;
          R.setAnimationLoop(() => G.tick());
          return { naPrimeiraEntrada, noRetry };
        });
        assert.equal(r.naPrimeiraEntrada, 1, 'a primeira entrada não ligou a graça — pré-condição do caso quebrada');
        assert.equal(r.noRetry, 1,
          'JOGAR DE NOVO não rearmou a graça — depois da 1ª morte o jogador nunca mais tem proteção inicial');
      });
  });
