/* ================================================================
   QA — A ESCOLHA DO GIRO É DO JOGADOR, DENTRO DO HEADSET (critério A2),
   E AGORA ELA INCLUI DESLIGAR.

   O A2 de docs/vr/criterio-aaa.md cobra, literalmente: "abrir o painel de
   opções EM VR e conferir que oferece pelo menos 30°, 45°, 60° de passo e
   giro suave com velocidade ajustável; para cada valor, medir o yaw aplicado
   por inclinada"; aprova com "cada incremento oferecido bate com o medido em
   ± 0,5°". A fonte que ele cita é a Meta (*Locomotion comfort and usability*,
   incrementos "15, 30, 45, 90 ou 180 graus") e VRC.Quest.Accessibility.8.

   O que este arquivo acrescenta ao que já existia é o TERCEIRO MODO. O pedido
   do dono foi "o botão de virar o personagem não se faz necessário"; a
   pesquisa (docs/vr/referencia-corpo-cabeca.md, R5) mostrou que remover é
   proibido — VRC.Quest.Tracking.1 é obrigatório e exige o app jogável
   sentado — e que o precedente do gênero é a Half-Life: Alyx, que ofereceu
   DESLIGAR ("Added option to disable controller turning"). Desligável só vale
   se der para desligar SEM TIRAR O APARELHO, que é o que se mede aqui.

   COMO ESTE ARQUIVO MEDE, E POR QUE ASSIM:

   - NADA CHAMA `acionar()`. O caminho é o do jogador: a MÃO aponta para a
     linha (pose escrita no controle Touch sintético, em espaço de rig) e o
     GATILHO aciona. Um teste que chamasse `XRUI.acionar('giroModo')` mediria
     a função, não a tela — é a família 4 ("o teste dirigir o produto"), a que
     deixou os nove casos de `xr-hud.test.js` verdes sem o `update()` no loop.

   - A ÂNCORA DO A2 É O TEXTO QUE O JOGADOR LÊ, não a preferência guardada.
     `l.val` é a string pintada na linha ("30°"); o número comparado com ela é
     o yaw que o RIG andou. Comparar `prefs.passo` com o yaw seria comparar a
     mesma variável com ela mesma passando por uma multiplicação (família 2).

   - O PAINEL FICA FECHADO NA HORA DE MEDIR. Com ele aberto o game.js suspende
     o giro de propósito (o disco do radial congela no mundo e a vista giraria
     por baixo dele), então medir com o painel na frente daria zero em todo
     caso — inclusive nos que deveriam girar, e o A2 passaria por acidente.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3682;

/* ---------- instalação: aponta, clica, lê. Não aciona nada por dentro ---------- */
async function instalar() {
  const G = window.__game, MP = window.__MP, T = window.__MP.THREE, XR = G.XR;
  const mod = await import('/js/xr/xrturn.js');
  const v3 = a => new T.Vector3(a[0], a[1], a[2]);
  window.__P = {
    MODOS: mod.MODOS,
    ui: G.XRUI,
    estado: () => G.XRUI.estado(),
    linha: id => (G.XRUI.estado().linhas || []).find(l => l.id === id) || null,
    ids: () => (G.XRUI.estado().linhas || []).map(l => l.id),
    prefs: () => XR.giro.prefs,
    salvo: () => { try { return JSON.parse(window.localStorage.getItem(mod.CHAVE) || '{}'); } catch { return {}; } },
    rigYaw: () => XR.rig.rotation.y / (Math.PI / 180),
    started: () => G.state.started,
    /* A MÃO APONTA PARA UM PONTO DO MUNDO. Mesma pose e mesmo caminho de
       `test/xr-ui.test.js`: `dev.controllers[*]` vive no espaço de referência,
       que é o RIG — por isso a conversão, e não uma pose de mundo direta. */
    apontar(qual, alvoMundo) {
      const dev = window.__xrEmulado, rig = XR.rig;
      rig.updateWorldMatrix(true, false);
      MP.camera.updateWorldMatrix(true, false);
      const cab = MP.camera.getWorldPosition(new T.Vector3());
      const mao = new T.Vector3(cab.x + (qual === 'left' ? -0.22 : 0.22), cab.y - 0.35, cab.z);
      const m = new T.Matrix4().lookAt(mao, v3(alvoMundo), new T.Vector3(0, 1, 0));
      const q = new T.Quaternion().setFromRotationMatrix(m);
      const p = mao.clone();
      rig.worldToLocal(p);
      q.premultiply(rig.getWorldQuaternion(new T.Quaternion()).invert());
      dev.controllers[qual].position.set(p.x, p.y, p.z);
      dev.controllers[qual].quaternion.set(q.x, q.y, q.z, q.w);
    },
    async clique() {
      window.__A.botao('right', 'trigger', 1);
      await window.__A.espera(150);
      window.__A.botao('right', 'trigger', 0);
      await window.__A.espera(220);
    },
    /* aponta para um ponto de uma linha e aperta o gatilho — o caminho do
       jogador, do começo ao fim */
    async tocar(id, onde = 'centro') {
      const l = this.linha(id);
      if (!l) return { erro: `linha "${id}" não existe na tela` };
      this.apontar('right', l[onde]);
      await window.__A.espera(230);
      const sob = (this.estado().item || {});
      await this.clique();
      return { marcou: sob.id, zona: sob.zona };
    },
    /* abre/fecha o painel pelo CLIQUE do analógico direito, que é como o
       jogador abre (o único botão livre do mapa de controles) */
    async botaoMenu() {
      window.__A.botao('right', 'thumbstick', 1);
      await window.__A.espera(150);
      window.__A.botao('right', 'thumbstick', 0);
      await window.__A.espera(260);
    },
  };
  return { ok: true, presenting: XR.presenting, modo: G.XRUI.estado().modo };
}

/* ---------- UMA INCLINADA no analógico direito, com o painel FECHADO ----------
   Devolve o yaw que o rig realmente andou, em graus. */
async function inclinada(ms) {
  const P = window.__P, A = window.__A;
  A.solta();
  await A.espera(320);
  const y0 = P.rigYaw();
  A.stick('right', 1, 0);
  await A.espera(ms);
  A.stick('right', 0, 0);
  await A.espera(300);
  return { dYaw: P.rigYaw() - y0, aberto: !!P.estado().aberto };
}

describe('a escolha do giro dentro do headset (A2 + o modo desligado)',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      /* `emJogo: false` de propósito: o primeiro caso mede o MENU, que é o
         estado ANTES da partida — o buraco de ESTADO que esta base já pagou
         caro (cinco arquivos verdes com o carro errado na primeira tela). */
      h = await bootEmVR(bootGame, { port: PORT, emJogo: false });
      const r = await h.play(instalar);
      assert.equal(r.ok, true);
      assert.equal(r.presenting, true, 'a sessão imersiva não subiu');
    });
    after(async () => { if (h) await h.close(); });

    it('a opção de giro existe ANTES da partida, no menu do mundo', async () => {
      const r = await h.play(async () => {
        const P = window.__P;
        await window.__A.espera(600);
        const e = P.estado();
        const antes = P.prefs().modo;
        const toque = await P.tocar('giroModo');
        await window.__A.espera(250);
        return {
          modoPainel: e.modo, aberto: e.aberto, started: P.started(),
          ids: P.ids(), antes, depois: P.prefs().modo, toque,
        };
      });
      console.log(`      painel="${r.modoPainel}" · started=${r.started} · linhas=[${r.ids.join(', ')}]`);
      console.log(`      giro no menu: ${r.antes} → ${r.depois}`);
      assert.equal(r.started, false, 'a partida já tinha começado: este caso não mede o menu');
      assert.equal(r.modoPainel, 'menu', `o painel abriu em "${r.modoPainel}", não no menu`);
      assert.ok(r.ids.includes('giroModo'),
        `o menu de antes da partida não oferece a opção de giro (linhas: ${r.ids.join(', ')})`);
      assert.equal(r.toque.marcou, 'giroModo', `a mão apontou e o painel marcou "${r.toque.marcou}"`);
      assert.notEqual(r.depois, r.antes,
        `o gatilho não mudou o modo no menu (continua "${r.antes}")`);
    });

    it('a linha GIRO roda pelos TRÊS modos e volta — e cada um fica salvo', async () => {
      const r = await h.play(async () => {
        const P = window.__P;
        // começa em SUAVE, seja qual for o estado deixado pelo caso anterior
        for (let i = 0; i < 4 && P.prefs().modo !== 'suave'; i++) await P.tocar('giroModo');
        const passos = [{ modo: P.prefs().modo, val: P.linha('giroModo').val, salvo: P.salvo().modo }];
        for (let i = 0; i < 3; i++) {
          await P.tocar('giroModo');
          await window.__A.espera(200);
          passos.push({ modo: P.prefs().modo, val: P.linha('giroModo').val, salvo: P.salvo().modo });
        }
        return { passos, MODOS: P.MODOS };
      });
      for (const p of r.passos) console.log(`      modo="${p.modo}" · tela="${p.val}" · salvo="${p.salvo}"`);
      const seq = r.passos.map(p => p.modo);
      assert.deepEqual(seq, ['suave', 'passos', 'desligado', 'suave'],
        `o ciclo da linha GIRO foi ${seq.join(' → ')} — o esperado é ` +
        'suave → passos → desligado → suave (MODOS de js/xr/xrturn.js)');
      /* o TEXTO tem de acompanhar o modo: linha que diz "SUAVE" com o giro
         desligado é pior que não ter opção */
      const vals = r.passos.map(p => p.val);
      assert.deepEqual(vals, ['SUAVE', 'EM PASSOS', 'DESLIGADO', 'SUAVE'],
        `a tela mostrou ${vals.join(' → ')} enquanto o modo ia ${seq.join(' → ')}`);
      for (const p of r.passos) {
        assert.equal(p.salvo, p.modo, `"${p.modo}" não foi persistido (armazém tem "${p.salvo}")`);
      }
    });

    it('com o giro DESLIGADO a tela não oferece ajuste nenhum — nada de botão morto', async () => {
      const r = await h.play(async () => {
        const P = window.__P;
        const fora = {};
        for (const alvo of ['suave', 'passos', 'desligado']) {
          for (let i = 0; i < 4 && P.prefs().modo !== alvo; i++) await P.tocar('giroModo');
          fora[alvo] = { ids: P.ids(), modo: P.prefs().modo };
        }
        return fora;
      });
      for (const k of Object.keys(r)) console.log(`      ${k}: [${r[k].ids.join(', ')}]`);
      assert.ok(r.suave.ids.includes('velocidade'),
        'em SUAVE a velocidade do giro não é ajustável — o A2 cobra isso');
      assert.ok(!r.suave.ids.includes('passo'), 'em SUAVE apareceu o ângulo do passo');
      assert.ok(r.passos.ids.includes('passo'),
        'em EM PASSOS o ângulo do passo não é ajustável — o A2 cobra isso');
      assert.ok(!r.passos.ids.includes('velocidade'), 'em EM PASSOS apareceu a velocidade');
      assert.ok(!r.desligado.ids.includes('velocidade') && !r.desligado.ids.includes('passo'),
        `com o giro desligado a tela ainda oferece [${r.desligado.ids.join(', ')}] — ` +
        'controle que não faz nada é a regra que a tela de morte já quebrou uma vez');
    });

    /* ------------------------------------------------------------------ */
    /* A2 — o incremento OFERECIDO tem de bater com o MEDIDO em ± 0,5°.
       A partida precisa estar rodando: é onde o giro vale. */
    it('A2 — 30°, 45° e 60° escolhidos na tela são os graus que o rig anda (± 0,5°)', async () => {
      await h.play(() => { window.__game.forceStart(); });
      await h.play(() => window.__A.espera(900));
      const alvos = [30, 45, 60];
      const linhas = [];
      for (const alvo of alvos) {
        const oferecido = await h.play(async (a) => {
          const P = window.__P;
          if (!P.estado().aberto) await P.botaoMenu();
          for (let i = 0; i < 4 && P.prefs().modo !== 'passos'; i++) await P.tocar('giroModo');
          /* chega no alvo SÓ pelo + e pelo − da tela, um clique de cada vez */
          for (let i = 0; i < 20 && Math.round(P.prefs().passo) !== a; i++) {
            await P.tocar('passo', Math.round(P.prefs().passo) < a ? 'mais' : 'menos');
          }
          /* A ÂNCORA: o texto pintado na linha, que é o que o jogador lê */
          const val = P.linha('passo').val;
          await P.tocar('retomar');           // fecha o painel pelo caminho do jogador
          await window.__A.espera(350);
          return { val, aberto: !!P.estado().aberto };
        }, alvo);
        const m = await h.play(inclinada, 420);
        linhas.push({ alvo, ...oferecido, ...m });
      }
      for (const l of linhas) {
        console.log(`      tela diz "${l.val}" → o rig andou ${l.dYaw.toFixed(2)}° ` +
          `(erro ${(Math.abs(l.dYaw) - parseFloat(l.val)).toFixed(3)}°)`);
      }
      for (const l of linhas) {
        assert.equal(l.aberto, false,
          'o painel ficou aberto na hora de medir: o game.js suspende o giro com o menu na ' +
          'frente, e todo caso daria zero');
        assert.equal(parseFloat(l.val), l.alvo,
          `pedi ${l.alvo}° pelo + e pelo − e a tela ficou em "${l.val}"`);
        assert.ok(Math.abs(Math.abs(l.dYaw) - l.alvo) <= 0.5,
          `a tela oferece ${l.val} e uma inclinada girou ${Math.abs(l.dYaw).toFixed(2)}° ` +
          `(erro ${(Math.abs(l.dYaw) - l.alvo).toFixed(2)}°, teto do A2 é 0,5°)`);
        assert.ok(l.dYaw < 0,
          `a inclinada pra direita rendeu ${l.dYaw.toFixed(2)}° — sinal positivo é giro invertido`);
      }
    });

    /* ------------------------------------------------------------------ */
    /* A ESCOLHA CHEGA AO JOGO — que é o que separa "tem tela" de "funciona". */
    it('escolher DESLIGADO na tela para o giro de verdade; escolher SUAVE devolve', async () => {
      const escolher = async (alvo) => h.play(async (a) => {
        const P = window.__P;
        if (!P.estado().aberto) await P.botaoMenu();
        for (let i = 0; i < 4 && P.prefs().modo !== a; i++) await P.tocar('giroModo');
        const val = P.linha('giroModo').val;
        await P.tocar('retomar');
        await window.__A.espera(350);
        return { modo: P.prefs().modo, val, aberto: !!P.estado().aberto };
      }, alvo);

      const off = await escolher('desligado');
      const mOff = await h.play(inclinada, 1400);
      const on = await escolher('suave');
      const mOn = await h.play(inclinada, 1400);

      console.log(`      tela "${off.val}" → 1,4 s no talo girou ${mOff.dYaw.toFixed(3)}°`);
      console.log(`      tela "${on.val}"  → 1,4 s no talo girou ${mOn.dYaw.toFixed(1)}°`);
      assert.equal(off.modo, 'desligado', `a tela não chegou a "desligado" (ficou "${off.modo}")`);
      assert.equal(off.aberto, false, 'o painel ficou aberto: a medida seria a suspensão, não o modo');
      assert.equal(on.aberto, false, 'o painel ficou aberto na medida de controle');
      /* o caso de controle vem PRIMEIRO na leitura: sem giro real do outro
         lado, "desligado gira 0°" ficaria verde sobre um jogo morto */
      assert.ok(Math.abs(mOn.dYaw) > 100,
        `de volta em SUAVE, 1,4 s no talo renderam ${mOn.dYaw.toFixed(1)}° — sem giro real ` +
        'o caso ao lado passa por acidente');
      assert.ok(Math.abs(mOff.dYaw) < 0.1,
        `com DESLIGADO escolhido na tela o rig ainda girou ${mOff.dYaw.toFixed(2)}° em 1,4 s`);
    });
  });
