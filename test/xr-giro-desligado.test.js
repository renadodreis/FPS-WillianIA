/* ================================================================
   QA — O GIRO ARTIFICIAL PODE SER DESLIGADO, E DESLIGÁ-LO NÃO TIRA
   DO JOGADOR A CAPACIDADE DE SE VIRAR.

   O PEDIDO DO DONO, VERBATIM: "o botão de virar o personagem não se faz
   necessário, pois ao movimentar a cabeça o corpo deveria acompanhar, eu já
   consigo olhar ao redor sem enjoo ver os lados, o problema é que o boneco
   está travado e precisa virar ele com a alavanca manual".

   A PESQUISA (docs/vr/referencia-corpo-cabeca.md, com fonte e citação)
   REFUTOU metade da queixa e CONFIRMOU o resto:

   - REFUTADO: o boneco NÃO está travado. Virar a cabeça já vira a direção de
     andar (game.js:1748, `vistaMundo()`), o `rotY` mandado ao servidor
     (br-game.js:1902, `G.yawDaVista()`) e o minimapa (game.js:3275). Este
     arquivo MEDE essa refutação em vez de afirmá-la — §4.0 da pesquisa.
   - CONFIRMADO, mas com um porém de loja: o giro artificial não pode ser
     REMOVIDO. VRC.Quest.Tracking.1 é requisito obrigatório (sentado não pode
     exigir pivô > 90°), e a página de preferências da Meta e o XAUR do W3C
     pedem a opção. O caminho é a recomendação R5: um TERCEIRO MODO,
     `desligado`, com o padrão continuando ligado. Precedente citado: Alyx não
     moveu o giro de botão — ofereceu desligá-lo ("Added option to disable
     controller turning").

   COMO ESTE ARQUIVO MEDE, E POR QUE ASSIM (as nove famílias de "teste que
   passa por acidente" do CLAUDE.md, nomeadas e evitadas):

   - A RÉGUA É O DISPOSITIVO, A LEITURA É O PRODUTO. O ângulo de cabeça é
     escrito em `window.__xrEmulado.quaternion` — o headset, que o jogo NÃO
     escreve — e o número comparado é o θ que este teste MANDOU. As leituras
     (`yawDaVista()`, `MiniMap.ultimoYaw`, a direção de `player.vel`) saem do
     jogo. Entrada e saída nunca saem do mesmo cálculo (família 2: comparar
     uma reta com ela mesma — e ela quase aconteceu aqui, porque
     `MiniMap.ultimoYaw` e `yawDaVista()` são a MESMA conta sobre
     `vistaMundo()`; compará-los daria zero por álgebra).
   - O CENÁRIO 1 EXISTE PARA O CENÁRIO 2 NÃO PASSAR POR ACIDENTE (família 9).
     Com o giro artificial já valendo zero por qualquer outro motivo — sessão
     morta, analógico não lido, `place` não chamado — "desligado gira 0,0°"
     ficaria verde sobre um jogo quebrado. Por isso o mesmo ensaio, com o
     mesmo analógico, roda ANTES em `suave` e tem de render centenas de graus.
   - O CENÁRIO 4 EXIGE O CONTRÁRIO: giro artificial ZERO. Com o rig girado, a
     régua (θ do dispositivo, que vive no espaço do rig) e a leitura (guinada
     de MUNDO) ficam em espaços diferentes e o erro medido seria o giro
     artificial, não o defeito. Em XR `camera.quaternion` é pose RELATIVA ao
     rig — ler direto dá erro de até 180°, e já custou movimento invertido
     nesta base.
   - NADA AQUI CHAMA `atualizar()` NEM `update()` (família 4). O teste empurra
     o analógico do Touch sintético e espera FRAMES REAIS da sessão; quem
     conduz o giro é o game.js.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3680;

/* diferença angular mínima em graus, no intervalo (-180, 180] */
function difGraus(a, b) {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/* ---------- instalação: SÓ SONDA, não conduz nada ---------- */
async function instalar() {
  const G = window.__game, MP = window.__MP, XR = G.XR;
  const mod = await import('/js/xr/xrturn.js');
  window.__GD = {
    mod,
    /* O YAW ARTIFICIAL É O DO RIG. É a grandeza que o giro artificial move
       (js/xr/xrrig.js: `rig.rotation.y = yaw`), e ela é INDEPENDENTE da pose
       da cabeça — que é o que permite medir "desligado" sem que o headset
       parado esteja segurando o resultado. */
    rigYaw: () => XR.rig.rotation.y / (Math.PI / 180),
    /* guinada da VISTA no mundo, pela fonte única do jogo */
    vistaYaw: () => G.yawDaVista() / (Math.PI / 180),
    /* o yaw com que o MINIMAPA foi desenhado no último frame */
    mapaYaw: () => G.MiniMap.ultimoYaw / (Math.PI / 180),
    /* A RÉGUA: escreve o ângulo da CABEÇA no dispositivo emulado. O jogo não
       escreve aqui — ele lê. Devolve o θ pedido, que é o número da comparação. */
    cabeca(g) {
      const d = window.__xrEmulado;
      d.quaternion.set(0, Math.sin(g * Math.PI / 360), 0, Math.cos(g * Math.PI / 360));
      return g;
    },
    velH: () => Math.hypot(MP.player.vel.x, MP.player.vel.z),
    /* guinada de mundo do vetor velocidade: frente de guinada φ é
       (−sin φ, ·, −cos φ), então φ = atan2(−vx, −vz) */
    velYaw: () => Math.atan2(-MP.player.vel.x, -MP.player.vel.z) / (Math.PI / 180),
    prefs: () => XR.giro.prefs,
    preferir: p => XR.giro.preferir(p),
    /* zera o giro ARTIFICIAL acumulado — é o que o botão RECENTRAR do painel
       faz em produção (game.js, ação `recentrar`). Aqui é MONTAGEM DE
       CONDIÇÃO, não condução do produto: sem o rig em zero, régua (θ do
       dispositivo) e leitura (guinada de mundo) ficam em espaços diferentes e
       o erro medido seria o giro artificial. A asserção que segue continua
       CONFERINDO que ficou em zero. */
    zerarGiro: () => XR.giro.zerar(),
    pos: () => [MP.player.pos.x, MP.player.pos.y, MP.player.pos.z],
    radialAberto: () => !!(G.XRInterage.estado().radial || {}).aberto,
  };
  return { ok: true, modo: XR.giro.prefs.modo, presenting: XR.presenting };
}
/* ---------- um ensaio: segura um analógico, mede, solta ----------
   Roda inteiro DENTRO da página. As leituras de velocidade são feitas COM o
   analógico ainda segurado (soltar antes mediria a desaceleração), e as de
   yaw depois da rampa de parada — senão o freio de 0,05 s ficaria de fora. */
async function ensaio({ mao, x, y, ms }) {
  const Q = window.__GD, A = window.__A;
  A.solta();
  await A.espera(320);
  const yaw0 = Q.rigYaw();
  const p0 = Q.pos();
  A.stick(mao, x, y);
  await A.espera(ms);
  /* regime permanente, ainda com o polegar no analógico */
  const velH = Q.velH();
  const velYaw = Q.velYaw();
  const vistaYaw = Q.vistaYaw();
  A.stick(mao, 0, 0);
  await A.espera(300);
  const p1 = Q.pos();
  return {
    dYaw: Q.rigYaw() - yaw0,
    velH, velYaw, vistaYaw,
    andou: Math.hypot(p1[0] - p0[0], p1[2] - p0[2]),
    modo: Q.prefs().modo,
  };
}

/* ---------- a cabeça vira, o jogador anda pra frente ---------- */
async function ensaioCabeca(theta) {
  const Q = window.__GD, A = window.__A;
  A.solta();
  Q.zerarGiro();                  // condição do caso: giro artificial em zero
  await A.espera(260);
  const pedido = Q.cabeca(theta);
  await A.espera(420);            // deixa o corpo/HUD assentarem
  const rigYaw = Q.rigYaw();
  const vistaYaw = Q.vistaYaw();
  const mapaYaw = Q.mapaYaw();
  /* 0,8 e não 1,0: o batente (≥ 0,92) é CORRER nesta base, e medir a marcha
     com o gatilho de corrida apertado é o conflito semântico que já
     transformou "andar deu 2,800" num defeito falso. */
  A.stick('left', 0, -0.8);       // frente
  await A.espera(700);
  const velH = Q.velH();
  const velYaw = Q.velYaw();
  A.stick('left', 0, 0);
  await A.espera(200);
  return { pedido, rigYaw, vistaYaw, mapaYaw, velH, velYaw };
}

describe('giro artificial desligável (runtime emulado IWER)',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      const r = await h.play(instalar);
      assert.equal(r.ok, true);
      assert.equal(r.presenting, true, 'a sessão imersiva não subiu');
    });
    after(async () => { if (h) await h.close(); });

    /* ------------------------------------------------------------------ */
    /* M6 cenário 1 — o giro artificial EXISTE e OBEDECE.
       Este caso não é decoração: é ele que impede o cenário 2 de passar por
       acidente (família 9). */
    it('cenário 1 — em SUAVE, 2 s de analógico direito no talo giram o rig', async () => {
      await h.play(p => window.__GD.preferir(p), { modo: 'suave', velocidade: 180 });
      const r = await h.play(ensaio, { mao: 'right', x: 1, y: 0, ms: 2000 });
      console.log(`      suave/180°/s por 2,0 s: Δyaw do rig = ${r.dYaw.toFixed(1)}°, ` +
        `|vel| = ${r.velH.toFixed(3)} m/s, andou ${r.andou.toFixed(3)} m`);
      assert.equal(r.modo, 'suave', `o módulo não aceitou "suave" (ficou "${r.modo}")`);
      /* empurrar pra DIREITA é guinada NEGATIVA (anti-horário visto de cima
         cresce): medir só o módulo deixaria passar giro invertido */
      assert.ok(r.dYaw < -300,
        `2 s a 180°/s renderam ${r.dYaw.toFixed(1)}° — o esperado é ≈ −355° ` +
        '(360° menos o que a rampa de 0,12 s come)');
      assert.ok(r.dYaw > -400, `${r.dYaw.toFixed(1)}° é giro a mais do que o pedido`);
      assert.ok(r.velH < 0.2,
        `girar levou o jogador a ${r.velH.toFixed(3)} m/s — o analógico direito não anda`);
    });

    /* M6 cenário 2 — O PEDIDO DO DONO. */
    it('cenário 2 — em DESLIGADO, o mesmo analógico não move o rig (< 0,1°)', async () => {
      const p = await h.play(q => window.__GD.preferir(q), { modo: 'desligado' });
      assert.equal(p.modo, 'desligado',
        `o módulo recusou o modo "desligado" e ficou em "${p.modo}" — ` +
        'sem o terceiro modo o jogador não tem como desligar o giro (R5)');
      const r = await h.play(ensaio, { mao: 'right', x: 1, y: 0, ms: 2000 });
      console.log(`      desligado por 2,0 s no talo: Δyaw do rig = ${r.dYaw.toFixed(3)}°, ` +
        `|vel| = ${r.velH.toFixed(3)} m/s`);
      assert.ok(Math.abs(r.dYaw) < 0.1,
        `com o giro DESLIGADO o rig ainda girou ${r.dYaw.toFixed(2)}° em 2 s`);
      assert.ok(r.velH < 0.2,
        `o analógico direito virou locomoção: ${r.velH.toFixed(3)} m/s`);
    });

    it('…e desligado também não gira no modo em PASSOS travestido: o snap some', async () => {
      /* O modo em passos tem outro caminho dentro de `atualizar()` (limiar
         SNAP_ON/rearme) — desligar tem de vencer os DOIS, senão bastaria o
         jogador ter escolhido passos antes para o giro voltar sozinho. */
      await h.play(p => window.__GD.preferir(p), { modo: 'passos', passo: 45 });
      const comSnap = await h.play(ensaio, { mao: 'right', x: 1, y: 0, ms: 700 });
      await h.play(p => window.__GD.preferir(p), { modo: 'desligado' });
      const sem = await h.play(ensaio, { mao: 'right', x: 1, y: 0, ms: 700 });
      console.log(`      passos: ${comSnap.dYaw.toFixed(1)}°  →  desligado: ${sem.dYaw.toFixed(3)}°`);
      assert.ok(Math.abs(comSnap.dYaw) > 30,
        `o modo em passos rendeu ${comSnap.dYaw.toFixed(1)}° — sem snap real o caso ao lado ` +
        'ficaria verde por acidente');
      assert.ok(Math.abs(sem.dYaw) < 0.1,
        `desligado depois de passos ainda deu um passo de ${sem.dYaw.toFixed(2)}°`);
    });

    /* M6 cenário 3 — o teste de UMA frente rodado contra o código da OUTRA.
       Duas entregas certas sozinhas já quebraram juntas nesta base quando uma
       moveu `correr` para o batente do analógico. */
    it('cenário 3 — cruzado: com o giro desligado, o analógico ESQUERDO ainda anda', async () => {
      await h.play(p => window.__GD.preferir(p), { modo: 'desligado' });
      const r = await h.play(ensaio, { mao: 'left', x: 0.8, y: 0, ms: 900 });
      const perp = Math.abs(difGraus(r.velYaw, r.vistaYaw));
      console.log(`      esquerdo 0,8 pro lado: |vel| = ${r.velH.toFixed(3)} m/s, ` +
        `Δyaw do rig = ${r.dYaw.toFixed(3)}°, ângulo vel↔vista = ${perp.toFixed(1)}°`);
      assert.ok(r.velH > 0.5,
        `o analógico esquerdo rendeu ${r.velH.toFixed(3)} m/s — desligar o giro parou de andar`);
      assert.ok(Math.abs(r.dYaw) < 0.1,
        `andar de lado girou o rig ${r.dYaw.toFixed(2)}°: o eixo de andar vazou pro giro`);
      assert.ok(Math.abs(perp - 90) < 12,
        `andar de lado saiu a ${perp.toFixed(1)}° do olhar — strafe é 90°`);
    });

    /* ------------------------------------------------------------------ */
    /* §4.0 DA PESQUISA, MEDIDA: o boneco NÃO está travado.
       Com o giro artificial em ZERO (obrigatório: ver o cabeçalho), virar a
       CABEÇA tem de virar o jogo inteiro. */
    it('com o giro DESLIGADO, virar a cabeça vira a vista, o mapa e a marcha', async () => {
      await h.play(p => window.__GD.preferir(p), { modo: 'desligado' });
      const angulos = [0, 45, 90, 180, -90, -135];
      const linhas = [];
      for (const t of angulos) linhas.push(await h.play(ensaioCabeca, t));
      await h.play(t => window.__GD.cabeca(t), 0);

      for (const l of linhas) {
        const eVista = difGraus(l.vistaYaw, l.pedido);
        const eMapa = difGraus(l.mapaYaw, l.pedido);
        const eMarcha = difGraus(l.velYaw, l.pedido);
        console.log(`      cabeça ${String(l.pedido).padStart(4)}° → vista ${eVista.toFixed(2)}° · ` +
          `mapa ${eMapa.toFixed(2)}° · marcha ${eMarcha.toFixed(2)}° · ` +
          `rig ${l.rigYaw.toFixed(3)}° · |vel| ${l.velH.toFixed(2)} m/s`);
        /* a condição que torna a comparação legítima: régua e leitura no mesmo
           espaço só valem com o rig parado */
        assert.ok(Math.abs(l.rigYaw) < 0.1,
          `o rig estava a ${l.rigYaw.toFixed(2)}° — com giro artificial ≠ 0 este caso ` +
          'mediria o rig, não a cabeça');
        assert.ok(Math.abs(eVista) < 1,
          `cabeça a ${l.pedido}° e a vista do jogo em ${l.vistaYaw.toFixed(1)}° (erro ${eVista.toFixed(1)}°)`);
        assert.ok(Math.abs(eMapa) < 1,
          `o minimapa desenhou a ${l.mapaYaw.toFixed(1)}° com a cabeça a ${l.pedido}° ` +
          `(erro ${eMapa.toFixed(1)}°)`);
        assert.ok(l.velH > 0.5,
          `andar pra frente com a cabeça a ${l.pedido}° rendeu ${l.velH.toFixed(2)} m/s`);
        assert.ok(Math.abs(eMarcha) < 6,
          `com a cabeça a ${l.pedido}° o jogador andou para ${l.velYaw.toFixed(1)}° ` +
          `(erro ${eMarcha.toFixed(1)}°) — "o boneco está travado" seria isto`);
      }
    });

    /* O CASO ANTERIOR NÃO PODE COBRIR ESTE, E ISSO FOI MEDIDO.
       Reinjetando o defeito clássico desta base — `yawDaVista()` lendo
       `camera.quaternion` em vez de `vistaMundo()` — o caso de cima continuou
       VERDE nos seis ângulos, com erro 0,00°. O motivo é geométrico: ele
       precisa do rig em ZERO para a régua e a leitura ficarem no mesmo espaço,
       e com o rig em zero `camera.quaternion` É a pose de mundo. A condição
       que torna o teste capaz de falhar é exatamente a que o caso de cima tem
       de proibir — por isso são dois casos, e não um.

       Aqui o giro artificial é POSTO A ≠ 0 primeiro, e a régua passa a ser a
       SOMA de duas grandezas independentes: a rotação do rig (transformação do
       grafo de cena, escrita pelo módulo de giro) e o θ mandado ao
       dispositivo. `yawDaVista()` compõe as duas; ler a pose relativa entrega
       só a segunda, e o erro medido é o giro artificial inteiro. */
    it('com o giro LIGADO, a guinada de mundo é rig + cabeça, não a pose relativa ao rig',
      async () => {
        await h.play(p => window.__GD.preferir(p), { modo: 'suave', velocidade: 180 });
        const r = await h.play(async () => {
          const Q = window.__GD, A = window.__A;
          A.solta(); Q.zerarGiro(); Q.cabeca(0);
          await A.espera(320);
          A.stick('right', 1, 0);      // acumula giro ARTIFICIAL
          await A.espera(900);
          A.stick('right', 0, 0);
          await A.espera(320);
          const fora = [];
          for (const t of [0, 60, -120]) {
            Q.cabeca(t);
            await A.espera(420);
            fora.push({ theta: t, rigYaw: Q.rigYaw(), vistaYaw: Q.vistaYaw(), mapaYaw: Q.mapaYaw() });
          }
          Q.cabeca(0);
          await A.espera(220);
          return fora;
        });
        for (const l of r) {
          const eVista = difGraus(l.vistaYaw, l.rigYaw + l.theta);
          const eMapa = difGraus(l.mapaYaw, l.rigYaw + l.theta);
          console.log(`      rig ${l.rigYaw.toFixed(1)}° + cabeça ${String(l.theta).padStart(4)}° → ` +
            `vista ${l.vistaYaw.toFixed(1)}° (erro ${eVista.toFixed(2)}°) · ` +
            `mapa erro ${eMapa.toFixed(2)}°`);
          assert.ok(Math.abs(l.rigYaw) > 60,
            `o rig ficou em ${l.rigYaw.toFixed(1)}° — sem giro artificial ≠ 0 este caso não ` +
            'consegue distinguir a guinada de mundo da pose relativa ao rig');
          assert.ok(Math.abs(eVista) < 1,
            `a vista do jogo deu ${l.vistaYaw.toFixed(1)}° onde rig+cabeça pedem ` +
            `${(l.rigYaw + l.theta).toFixed(1)}° (erro ${eVista.toFixed(1)}°)`);
          assert.ok(Math.abs(eMapa) < 1,
            `o minimapa desenhou a ${l.mapaYaw.toFixed(1)}° (erro ${eMapa.toFixed(1)}°)`);
        }
      });

    /* ------------------------------------------------------------------ */
    /* O que dependia do giro e não pode ter quebrado. */
    /* SUSPENSO EM 2026-08-29: o gatilho esquerdo virou ADS (pedido do dono),
       js/xr/xrinput.js passa `null` para o radial e `cmd.radial.aberto`
       nunca mais fica true — a suspensão de giro em game.js:3850 continua
       escrita, mas não há mais controle que a exercite. Reabilitar quando o
       radial ganhar outro caminho (docs/vr/progresso.md, próxima prioridade). */
    it.skip('o radial continua suspendendo o giro — com o giro LIGADO de volta', async () => {
      /* Com o giro desligado este caso passaria por acidente (não há giro para
         suspender): o modo tem de voltar para `suave` antes. */
      await h.play(p => window.__GD.preferir(p), { modo: 'suave', velocidade: 180 });
      const r = await h.play(async () => {
        const Q = window.__GD, A = window.__A;
        A.solta(); await A.espera(300);
        // radial ABERTO: gatilho da mão de apoio segurado
        A.botao('left', 'trigger', 1);
        await A.espera(320);
        const aberto = Q.radialAberto();
        const y0 = Q.rigYaw();
        A.stick('right', 1, 0);
        await A.espera(900);
        A.stick('right', 0, 0);
        await A.espera(250);
        const comRadial = Q.rigYaw() - y0;
        A.botao('left', 'trigger', 0);
        await A.espera(400);
        // radial FECHADO: o mesmo analógico
        const y1 = Q.rigYaw();
        A.stick('right', 1, 0);
        await A.espera(900);
        A.stick('right', 0, 0);
        await A.espera(250);
        A.solta();
        return { aberto, comRadial, semRadial: Q.rigYaw() - y1 };
      });
      console.log(`      radial aberto: ${r.comRadial.toFixed(3)}°  ·  ` +
        `radial fechado: ${r.semRadial.toFixed(1)}°`);
      assert.equal(r.aberto, true, 'o radial não abriu: o caso não exercitou a suspensão');
      assert.ok(Math.abs(r.semRadial) > 60,
        `com o radial fechado o giro rendeu ${r.semRadial.toFixed(1)}° — sem giro real ` +
        'a suspensão passaria verde por acidente');
      assert.ok(Math.abs(r.comRadial) < 2,
        `com o radial aberto o rig girou ${r.comRadial.toFixed(1)}°: o disco congela no ` +
        'mundo e a vista gira por baixo dele');
    });

    it('a escolha do modo persiste no armazém, e a instância do jogo continua nascendo em SUAVE',
      async () => {
        const r = await h.play(() => {
          const Q = window.__GD;
          Q.preferir({ modo: 'desligado' });
          const salvo = JSON.parse(window.localStorage.getItem(Q.mod.CHAVE) || '{}');
          /* uma instância NOVA sobre o mesmo armazém é o que o jogador recebe
             na próxima sessão */
          const proxima = Q.mod.criarGiroXR({ armazem: window.localStorage }).prefs;
          /* e um armazém VAZIO é o jogador de primeira viagem: o padrão de
             fábrica não pode ter virado "desligado" (VRC.Quest.Tracking.1) */
          window.localStorage.removeItem(Q.mod.CHAVE);
          const novo = Q.mod.criarGiroXR({ armazem: window.localStorage }).prefs;
          return { salvo: salvo.modo, proxima: proxima.modo, novo };
        });
        console.log(`      salvo="${r.salvo}" · próxima sessão="${r.proxima}" · ` +
          `jogador novo="${r.novo.modo}" a ${r.novo.velocidade}°/s`);
        assert.equal(r.salvo, 'desligado', 'a escolha não foi gravada em localStorage');
        assert.equal(r.proxima, 'desligado', 'a escolha não sobrevive a uma sessão nova');
        assert.equal(r.novo.modo, 'suave',
          `o padrão de fábrica virou "${r.novo.modo}" — desligar o giro por padrão contraria ` +
          'VRC.Quest.Tracking.1 (sentado não pode exigir pivô > 90°)');
        assert.equal(r.novo.velocidade, 180, `padrão a ${r.novo.velocidade}°/s`);
      });
  });
