/* ================================================================
   QA — OS CONTROLES DE VR MOVEM O JOGADOR, NO RUNTIME EMULADO OFICIAL.

   Este arquivo roda dentro de uma sessão `immersive-vr` DE VERDADE, aberta
   pelo IWER (Immersive Web Emulation Runtime, o kit de desenvolvimento
   WebXR que a Meta publica), com controles Touch sintéticos acionados pela
   API documentada dele: `updateAxes('thumbstick', x, y)` e
   `updateButtonValue('trigger', 1)`.

   POR QUE ASSIM, E NÃO COM DUBLÊ ESCRITO À MÃO. A primeira versão destes
   testes inventava objetos `{handedness, gamepad:{axes, buttons}}`. Dublê
   escrito à mão tem a forma que quem escreveu IMAGINOU, e por isso a suíte
   ficava verde enquanto o jogo, no aparelho, ignorava os dois controles.
   Aqui o teste aciona o mesmo caminho que o navegador percorre: sessão
   real, `inputSources` da sessão, gamepad montado a partir do config
   oficial da Meta (`oculus-touch-v3`, o mesmo do Quest 3).

   O perfil do Quest 3 é `meta-quest-touch-plus`; `oculus-touch-v3` é do
   Quest 2 e vem só como fallback.

   O MAPA DE BOTÕES SAI DO CONFIG OFICIAL, não de chute:
   índice 0 `trigger`, 1 `squeeze`, 3 clique do `thumbstick`,
   4 `x-button`/`a-button`, 5 `y-button`/`b-button`;
   eixos 0 e 1 nulos, 2 e 3 o analógico.

   O QUE O EMULADO NÃO PEGA está no fim do arquivo, medido e explicado.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3414;

/* ---------- acionadores ----------
   `window.__A` é instalado junto com o runtime (test/helpers/iwer.js) e fala a
   API do IWER: `updateAxes('thumbstick', x, y)` e `updateButtonValue(id, v)`.
   `updateButtonValue` passa pelo mecanismo de pendência do IWER — aplica no
   frame seguinte, que é o comportamento real. Por isso as medições esperam
   TEMPO em vez de chamar `tick` na mão: dentro de uma sessão imersiva quem
   chama o frame é a sessão, e forçar `tick` seria medir o harness. */

/* Distância percorrida no plano enquanto os comandos ficam valendo. */
async function andouCom(comandos, ms) {
  const A = window.__A, MP = window.__MP;
  A.solta();
  await A.espera(200);
  MP.player.vel.x = 0; MP.player.vel.z = 0;
  for (const c of comandos) A[c[0]](...c.slice(1));
  const p0 = [MP.player.pos.x, MP.player.pos.z];
  await A.espera(ms);
  const d = Math.hypot(MP.player.pos.x - p0[0], MP.player.pos.z - p0[1]);
  A.solta();
  return d;
}

describe('controles de VR no runtime emulado (IWER)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootEmVR(bootGame, { port: PORT }); });
  after(async () => { if (h) await h.close(); });

  it('a sessão entrega DOIS controles Touch, com o perfil do Quest', async () => {
    const r = await h.play(() => {
      const s = window.__MP.renderer.xr.getSession();
      return Array.from(s.inputSources).map(f => ({
        mao: f.handedness,
        perfil: f.profiles[0],
        perfis: [...f.profiles],
        eixos: f.gamepad ? f.gamepad.axes.length : 0,
        botoes: f.gamepad ? f.gamepad.buttons.length : 0,
      })).sort((a, b) => a.mao.localeCompare(b.mao));
    });
    assert.equal(r.length, 2, `a sessão trouxe ${r.length} fontes de entrada, não duas`);
    assert.deepEqual(r.map(x => x.mao), ['left', 'right']);
    for (const c of r) {
      /* O Quest 3 anuncia `meta-quest-touch-plus` — NÃO `oculus-touch-v3`, que
         é do Quest 2 e aqui aparece só como fallback. Quem escolhe modelo de
         mão pelo perfil precisa saber disso: casar só com `oculus-touch-v3`
         deixa o Quest 3 sem controle na tela. */
      assert.equal(c.perfil, 'meta-quest-touch-plus', `perfil inesperado: ${c.perfil}`);
      assert.ok(c.perfis.includes('oculus-touch-v3'),
        `sem o fallback oculus-touch-v3: ${c.perfis.join(', ')}`);
      assert.ok(c.eixos >= 4, `${c.mao} veio com ${c.eixos} eixos`);
      assert.ok(c.botoes >= 6, `${c.mao} veio com ${c.botoes} botões`);
    }
  });

  it('entrar em VR já coloca o jogador em jogo', async () => {
    const r = await h.play(() => ({ started: window.__game.state.started, paused: window.__game.state.paused }));
    assert.equal(r.started, true, 'sem menu dentro do mundo, ficar no menu em VR é beco sem saída');
    assert.equal(r.paused, false);
  });

  it('analógico esquerdo pra frente ANDA', async () => {
    const d = await h.play(andouCom, [['stick', 'left', 0, -1]], 1000);
    assert.ok(d > 1.0, `analógico no batente por 1 s moveu ${d.toFixed(3)} m: a entrada não chega no jogo`);
  });

  it('analógico no centro NÃO anda', async () => {
    const d = await h.play(andouCom, [], 1000);
    assert.ok(d < 0.3, `parado, o jogador andou ${d.toFixed(3)} m — andar sem querer em VR é enjoo`);
  });

  it('repouso do analógico (±0,1) NÃO anda', async () => {
    const d = await h.play(andouCom, [['stick', 'left', 0.1, -0.1]], 1000);
    assert.ok(d < 0.3, `o repouso do analógico moveu ${d.toFixed(3)} m`);
  });

  it('clique do analógico faz CORRER', async () => {
    const andando = await h.play(andouCom, [['stick', 'left', 0, -1]], 1000);
    const correndo = await h.play(andouCom,
      [['stick', 'left', 0, -1], ['botao', 'left', 'thumbstick', 1]], 1000);
    assert.ok(correndo > andando * 1.15,
      `correndo ${correndo.toFixed(2)} m contra andando ${andando.toFixed(2)} m: o sprint não chega`);
  });

  it('analógico direito gira em PASSOS de 45°, um por inclinada', async () => {
    const r = await h.play(async () => {
      const A = window.__A, G = window.__game;
      const yaw = () => G.camera.parent ? G.camera.parent.rotation.y : 0;
      A.solta(); await A.espera(200);
      const y0 = yaw();
      A.stick('right', 1, 0);
      await A.espera(600);                             // segurando: não pode repetir
      const segurando = yaw() - y0;
      A.solta(); await A.espera(300);
      A.stick('right', 1, 0);
      await A.espera(300);
      const segundo = yaw() - y0;
      A.solta();
      return { segurando, segundo };
    });
    const passo = Math.PI / 4;
    assert.ok(Math.abs(Math.abs(r.segurando) - passo) < 0.05,
      `segurar meio segundo girou ${(r.segurando * 180 / Math.PI).toFixed(1)}° — tinha que ser um passo de 45°`);
    assert.ok(Math.abs(Math.abs(r.segundo) - 2 * passo) < 0.05,
      `soltar e inclinar de novo tinha que dar o segundo passo, deu ${(r.segundo * 180 / Math.PI).toFixed(1)}°`);
  });
});

describe('gatilho de VR atira (IWER)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootEmVR(bootGame, { port: PORT + 1 }); });
  after(async () => { if (h) await h.close(); });

  /* Segura o gatilho por `ms` com a arma forçada a automática ou semi e conta
     quanto saiu do pente. Semi-automática é OUTRO caminho de código:
     `gun.auto ? mouse.shooting : mouse.clicked` — e `mouse.clicked` é clique,
     não estado. */
  const disparou = async (auto, ms) => {
    const A = window.__A, G = window.__game;
    A.solta(); await A.espera(200);
    const arma = G.arsenal[G.gunIndex];
    arma.auto = auto; arma.mag = 30; arma.reloading = false; arma.lastShot = -99;
    const antes = arma.mag;
    A.botao('right', 'trigger', 1);
    await A.espera(ms);
    A.solta();
    await A.espera(100);
    return antes - arma.mag;
  };

  it('arma AUTOMÁTICA dispara em rajada segurando o gatilho', async () => {
    const n = await h.play(disparou, true, 600);
    assert.ok(n > 1, `segurou o gatilho e saíram ${n} balas de uma automática`);
  });

  it('arma SEMI-AUTOMÁTICA dispara ao apertar', async () => {
    /* O caminho que faltava: em VR só `mouse.shooting` era escrito, então
       pistola, sniper e escopeta ficavam MUDAS — sem erro e sem console,
       enquanto o fuzil funcionava. Parece defeito de arma, é de entrada. */
    const n = await h.play(disparou, false, 600);
    assert.ok(n > 0, 'apertou o gatilho e a semi-automática não disparou');
  });

  it('semi-automática sai UMA por aperto, não vira automática de graça', async () => {
    const n = await h.play(disparou, false, 900);
    assert.equal(n, 1, `segurar o gatilho numa semi-automática saiu ${n} balas`);
  });

  it('botão B troca a arma equipada', async () => {
    const r = await h.play(async () => {
      const A = window.__A, G = window.__game;
      A.solta(); await A.espera(200);
      const passou = [G.gunIndex];
      for (let i = 0; i < 2; i++) {
        A.botao('right', 'b-button', 1);
        await A.espera(250);
        A.botao('right', 'b-button', 0);
        await A.espera(450);
        passou.push(G.gunIndex);
      }
      A.solta();
      return passou;
    });
    assert.ok(new Set(r).size > 1,
      `o jogador ficou preso na arma ${r[0]} (${JSON.stringify(r)}): sem fileira de números ` +
      'e sem roda do mouse, o headset não tem outro jeito de trocar');
  });
});

describe('o limite do emulado — medido, não suposto', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootEmVR(bootGame, { port: PORT + 2 }); });
  after(async () => { if (h) await h.close(); });

  it('no IWER `inputSources` É um Array; no navegador nativo NÃO é', async () => {
    /* MEDIÇÃO, não leitura de código: o IWER declara
       `class XRInputSourceArray extends Array`, e subclasse de Array PASSA em
       `Array.isArray`. O navegador nativo implementa a interface do WebIDL,
       que não herda de Array e portanto REPROVA.

       Consequência prática, e é a razão deste teste existir: um guarda
       `Array.isArray(session.inputSources) ? ... : []` fica VERDE no emulado e
       descarta os dois controles no aparelho. Foi exatamente esse o defeito de
       "os controles de VR não funcionam" — e nem o emulado nem dublê nenhum o
       pegariam. Quem pega é `test/xr-input.test.js`, que exercita o módulo com
       uma coleção da forma NATIVA (array-like sem herdar de Array).

       Se um dia esta asserção falhar, o IWER passou a imitar a forma nativa e
       o caso separado lá vira redundante — mas até lá, ele é a única defesa. */
    const r = await h.play(() => {
      const s = window.__MP.renderer.xr.getSession();
      return {
        ehArray: Array.isArray(s.inputSources),
        tipo: Object.prototype.toString.call(s.inputSources),
        herdaDeArray: s.inputSources instanceof Array,
      };
    });
    assert.equal(r.ehArray, true,
      `o IWER mudou: agora inputSources é ${r.tipo}. Reveja o caso de forma nativa em xr-input.test.js`);
    assert.equal(r.herdaDeArray, true);
  });
});
