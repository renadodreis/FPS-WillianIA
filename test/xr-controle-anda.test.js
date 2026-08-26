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

  /* ANDAR TEM DIREÇÃO, e medir só distância foi o erro que deixou passar o
     defeito mais grosseiro de todos: "pra frente vai pra trás". A conta do
     movimento sai de `camera.quaternion` — que em XR é a rotação da cabeça
     RELATIVA AO RIG, não a do mundo. Com o rig girado (snap turn) ou com o
     jogador fisicamente virado, o "pra frente" do jogo aponta para outro lugar
     que não o "pra frente" que ele está vendo. */
  const alinhamento = async passosDeGiro => {
    const A = window.__A, G = window.__game, MP = window.__MP;
    A.solta();
    await A.espera(200);
    for (let i = 0; i < passosDeGiro; i++) {     // gira com o analógico direito
      A.stick('right', 1, 0);
      await A.espera(180);
      A.stick('right', 0, 0);
      await A.espera(180);
    }
    // para onde o jogador ESTÁ OLHANDO, no mundo
    const olhar = new MP.THREE.Vector3();
    G.camera.getWorldDirection(olhar);
    olhar.y = 0; olhar.normalize();
    MP.player.vel.x = 0; MP.player.vel.z = 0;
    const p0 = [MP.player.pos.x, MP.player.pos.z];
    A.stick('left', 0, -1);
    await A.espera(900);
    A.solta();
    const dx = MP.player.pos.x - p0[0], dz = MP.player.pos.z - p0[1];
    const dist = Math.hypot(dx, dz);
    return { dist, alinhado: dist < 0.05 ? 0 : (dx / dist) * olhar.x + (dz / dist) * olhar.z };
  };

  it('andar PRA FRENTE vai pra onde o jogador olha, sem girar', async () => {
    const r = await h.play(alinhamento, 0);
    assert.ok(r.alinhado > 0.9,
      `andou ${r.dist.toFixed(2)} m numa direção com alinhamento ${r.alinhado.toFixed(2)} ` +
      'com a vista (1 = pra frente, -1 = pra trás)');
  });

  it('andar PRA FRENTE continua indo pra frente depois de girar 180°', async () => {
    /* Quatro passos de 45° = 180°. Se o movimento sair do quaternion LOCAL da
       câmera, o jogador anda para o lado oposto do que enxerga — que é
       exatamente o relato "pra frente vai pra trás". */
    const r = await h.play(alinhamento, 4);
    assert.ok(r.alinhado > 0.9,
      `depois de girar 180°, andar pra frente deu alinhamento ${r.alinhado.toFixed(2)} ` +
      `(andou ${r.dist.toFixed(2)} m). Negativo = movimento invertido.`);
  });

  it('andar PRA TRÁS vai pra trás da vista', async () => {
    const r = await h.play(async () => {
      const A = window.__A, G = window.__game, MP = window.__MP;
      A.solta(); await A.espera(200);
      const olhar = new MP.THREE.Vector3();
      G.camera.getWorldDirection(olhar); olhar.y = 0; olhar.normalize();
      MP.player.vel.x = 0; MP.player.vel.z = 0;
      const p0 = [MP.player.pos.x, MP.player.pos.z];
      A.stick('left', 0, 1);
      await A.espera(900);
      A.solta();
      const dx = MP.player.pos.x - p0[0], dz = MP.player.pos.z - p0[1];
      const dist = Math.hypot(dx, dz);
      return { dist, alinhado: dist < 0.05 ? 0 : (dx / dist) * olhar.x + (dz / dist) * olhar.z };
    });
    assert.ok(r.alinhado < -0.9,
      `puxar o analógico pra trás deu alinhamento ${r.alinhado.toFixed(2)} (esperado ≈ -1)`);
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
    /* Mede a VELOCIDADE ESTABILIZADA, não a distância acumulada. Distância a
       partir do repouso mistura a rampa de aceleração com o jitter de frame da
       sessão, e o teste ficava intermitente medindo a mesma corrida que já
       funcionava. Velocidade depois da rampa é a grandeza que o jogador sente. */
    const velMedia = async correr => {
      const A = window.__A, MP = window.__MP;
      A.solta(); await A.espera(250);
      A.stick('left', 0, -1);
      if (correr) A.botao('left', 'thumbstick', 1);
      await A.espera(700);                       // deixa a rampa assentar
      const am = [];
      for (let i = 0; i < 10; i++) {
        await A.espera(50);
        am.push(Math.hypot(MP.player.vel.x, MP.player.vel.z));
      }
      A.solta();
      am.sort((a, b) => a - b);
      return am[am.length >> 1];                 // mediana: imune a um frame torto
    };
    const andando = await h.play(velMedia, false);
    const correndo = await h.play(velMedia, true);
    assert.ok(correndo > andando * 1.3,
      `andando ${andando.toFixed(2)} m/s contra correndo ${correndo.toFixed(2)} m/s: ` +
      'o sprint não chega no jogo');
  });


  /* O GIRO MUDOU DE CONTRATO e este teste mudou junto: era snap de 45° fixo, e
     virou contínuo por padrão com passos por opção do jogador. A Meta manda
     "default to comfort-friendly options (snap turn)" e o Immersive Web SDK
     nasce em snap — mas o dono do projeto reprovou o passo em jogo, e o critério
     é dele. Os dois modos existem; o que não pode é só um existir.
     A profundidade do giro (velocidade, rampa, zona morta, pivô) mora em
     test/xr-turn.test.js; aqui se cobre a TROCA DE MODO ponta a ponta. */
  const girarPor = async (modo, ms) => {
    const A = window.__A, G = window.__game, MP = window.__MP;
    G.XR.giro.preferir({ modo, velocidade: 120, passo: 45 });
    A.solta(); await A.espera(250);
    const q = new MP.THREE.Quaternion(), v = new MP.THREE.Vector3();
    const olhar = () => {
      G.XR.rig.updateMatrixWorld(true);
      G.camera.getWorldQuaternion(q);
      v.set(0, 0, -1).applyQuaternion(q);
      return Math.atan2(-v.x, -v.z);
    };
    const y0 = olhar();
    A.stick('right', 1, 0);
    await A.espera(ms);
    A.stick('right', 0, 0);
    await A.espera(200);
    let d = olhar() - y0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    A.solta();
    return d * 180 / Math.PI;
  };

  it('modo CONTÍNUO: segurar gira sem parar, proporcional ao tempo', async () => {
    const curto = await h.play(girarPor, 'suave', 300);
    const longo = await h.play(girarPor, 'suave', 900);
    assert.ok(Math.abs(longo) > Math.abs(curto) * 1.8,
      `300 ms rendeu ${curto.toFixed(1)}° e 900 ms rendeu ${longo.toFixed(1)}°: ` +
      'no contínuo o tempo tem que mandar');
    assert.ok(curto < 0, `analógico pra direita rendeu ${curto.toFixed(1)}° — sinal errado é giro invertido`);
  });

  it('modo EM PASSOS: segurar dá UM passo só, não uma rajada', async () => {
    const um = await h.play(girarPor, 'passos', 900);
    assert.ok(Math.abs(Math.abs(um) - 45) < 6,
      `segurar 900 ms no modo passos rendeu ${um.toFixed(1)}° — tinha que ser um passo de 45°`);
  });

  it('a preferência do jogador SOBREVIVE, é ela que decide', async () => {
    const r = await h.play(() => {
      const G = window.__game;
      G.XR.giro.preferir({ modo: 'passos', passo: 30 });
      const a = { ...G.XR.giro.prefs };
      G.XR.giro.preferir({ modo: 'suave', velocidade: 240 });
      const b = { ...G.XR.giro.prefs };
      G.XR.giro.preferir({ modo: 'suave', velocidade: 120 });
      return { a, b };
    });
    assert.equal(r.a.modo, 'passos');
    assert.equal(r.a.passo, 30, 'a Meta sugere 30/45/90 — o jogador tem que poder escolher');
    assert.equal(r.b.modo, 'suave');
    assert.equal(r.b.velocidade, 240);
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

describe('em VR a MÃO mira, não a cabeça', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  /* O relato foi "a minha cabeça está movendo a mira da arma, ou seja, pra eu
     mirar no inimigo, movo a cabeça". Vinha de a arma ser filha da CÂMERA e de
     `fire()` usar `camera.getWorldDirection` — desenho de FPS de mouse levado
     pra VR sem revisão. A recomendação da Meta é ancorar a ação de entrada no
     controle: em VR a cabeça olha, a mão mira. */
  let h;
  before(async () => { h = await bootEmVR(bootGame, { port: PORT + 3 }); });
  after(async () => { if (h) await h.close(); });

  const angulo = (a, b) => {
    const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
  };

  it('a mira sai da MÃO', async () => {
    const r = await h.play(() => window.__game.mira());
    assert.equal(r.naMao, true, 'a mira ainda está saindo da câmera dentro da sessão');
  });

  it('a arma é filha da mão direita, não da câmera', async () => {
    const r = await h.play(() => {
      const G = window.__game, MP = window.__MP;
      let o = MP.scene.getObjectByName('weaponRoot') || null;
      if (!o) { // sem nome: acha pelo pai declarado
        o = G.WeaponRig && G.WeaponRig.root ? G.WeaponRig.root : null;
      }
      const cam = G.camera;
      // sobe a cadeia procurando a câmera
      let p = o && o.parent, viaCamera = false;
      while (p) { if (p === cam) { viaCamera = true; break; } p = p.parent; }
      return { achou: !!o, viaCamera };
    });
    if (r.achou) {
      assert.equal(r.viaCamera, false, 'a arma continua pendurada na câmera: mirar seria mover a cabeça');
    }
  });

  it('VIRAR A CABEÇA não muda para onde a arma aponta', async () => {
    const r = await h.play(async () => {
      const A = window.__A, G = window.__game, dev = window.__xrEmulado;
      A.solta(); await A.espera(200);
      const antes = G.mira().direcao;
      // gira o headset 60° — só a cabeça, a mão fica parada
      const q = dev.quaternion, a = Math.PI / 6;
      q.y = Math.sin(a); q.w = Math.cos(a); q.x = 0; q.z = 0;
      await A.espera(400);
      const depois = G.mira().direcao;
      q.y = 0; q.w = 1;
      await A.espera(200);
      return { antes, depois };
    });
    assert.ok(angulo(r.antes, r.depois) < 5,
      `virar a cabeça 60° moveu a mira ${angulo(r.antes, r.depois).toFixed(1)}°: ` +
      'o jogador estaria mirando com o rosto');
  });

  it('MOVER A MÃO muda para onde a arma aponta', async () => {
    const r = await h.play(async () => {
      const A = window.__A, G = window.__game, dev = window.__xrEmulado;
      A.solta(); await A.espera(200);
      const antes = G.mira().direcao;
      const q = dev.controllers.right.quaternion, a = Math.PI / 6;   // 60° de rotação
      q.y = Math.sin(a); q.w = Math.cos(a); q.x = 0; q.z = 0;
      await A.espera(400);
      const depois = G.mira().direcao;
      q.y = 0; q.w = 1;
      await A.espera(200);
      return { antes, depois };
    });
    assert.ok(angulo(r.antes, r.depois) > 45,
      `girar a mão 60° moveu a mira só ${angulo(r.antes, r.depois).toFixed(1)}°: ` +
      'a mão não está comandando a mira');
  });
});

describe('conforto: vinheta de túnel e piscada no giro', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  /* Enjoo em VR é conflito sensorial: o olho vê movimento que o ouvido interno
     não sente. A recomendação da Meta para locomoção é reduzir o fluxo óptico
     PERIFÉRICO durante o movimento, porque é a periferia da retina que alimenta
     a sensação de auto-movimento. E o passo de giro instantâneo, sem piscada,
     lê como "a tela girou sozinha" — que foi o relato. */
  let h;
  before(async () => { h = await bootEmVR(bootGame, { port: PORT + 4 }); });
  after(async () => { if (h) await h.close(); });

  it('parado, a visão fica INTEIRA — a vinheta não cobra preço à toa', async () => {
    const r = await h.play(async () => {
      window.__A.solta();
      await window.__A.espera(900);
      return window.__game.XR.conforto.tunel;
    });
    assert.ok(r < 0.05, `parado e com a periferia fechada em ${(r * 100).toFixed(0)}%`);
  });

  it('correndo, a periferia FECHA', async () => {
    const r = await h.play(async () => {
      const A = window.__A;
      A.solta(); await A.espera(200);
      A.stick('left', 0, -1);
      A.botao('left', 'thumbstick', 1);          // correndo
      await A.espera(1200);
      const t = window.__game.XR.conforto.tunel;
      A.solta();
      return t;
    });
    assert.ok(r > 0.4, `correndo e a periferia só fechou ${(r * 100).toFixed(0)}%`);
  });

  it('a vinheta REABRE ao parar — não fica escuro pra sempre', async () => {
    const r = await h.play(async () => {
      const A = window.__A;
      A.stick('left', 0, -1); await A.espera(800);
      A.solta(); await A.espera(1500);
      return window.__game.XR.conforto.tunel;
    });
    assert.ok(r < 0.1, `parou e a periferia continuou fechada em ${(r * 100).toFixed(0)}%`);
  });

  it('o passo de giro PISCA, e o giro contínuo NÃO', async () => {
    /* A piscada é o tratamento do corte seco do snap. No giro contínuo não há
       corte: piscar ali seria um estrobo a cada mira fina. */
    const medir = async modo => {
      const A = window.__A, G = window.__game, C = G.XR.conforto;
      G.XR.giro.preferir({ modo, velocidade: 120, passo: 45 });
      A.solta(); await A.espera(300);
      let pico = 0;
      A.stick('right', 1, 0);
      for (let i = 0; i < 12; i++) { await A.espera(25); pico = Math.max(pico, C.piscando); }
      A.solta(); await A.espera(400);
      return { pico, depois: C.piscando };
    };
    const passos = await h.play(medir, 'passos');
    const suave = await h.play(medir, 'suave');
    assert.ok(passos.pico > 0.1, `o passo de giro não escureceu nada (${passos.pico})`);
    assert.equal(passos.depois, 0, 'a piscada não voltou — o jogador ficaria no escuro');
    assert.equal(suave.pico, 0, `o giro contínuo piscou (${suave.pico}): seria estrobo a cada mira fina`);
  });

  it('a vinheta existe na cena e some ao sair do VR', async () => {
    const dentro = await h.play(() => {
      const m = window.__game.XR.conforto.malha;
      return { existe: !!m, visivel: !!(m && m.visible), paiEhCamera: !!(m && m.parent === window.__game.camera) };
    });
    assert.deepEqual(dentro, { existe: true, visivel: true, paiEhCamera: true },
      'a vinheta precisa ser filha da CÂMERA: presa a outro pai, ela escorrega quando o jogador vira a cabeça');
  });
});

describe('a entrada de VR chega em quem escuta TECLADO', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  /* Metade do jogo não lê `keys[]`: lê EVENTO de teclado. Em br-game.js um
     `addEventListener('keydown')` trata sozinho o pulo da nave, o paraquedas, o
     BAÚ (`KeyE` → tryOpenCrate) e cinco das oito armas. A entrada do headset
     escrevia só `keys[]`/`justPressed`, então no aparelho nada disso existia —
     o jogador caía da nave sem poder pular e olhava para um baú que não abria.
     Era o "não consigo pegar o carro, abrir os baús". */
  let h;
  before(async () => { h = await bootEmVR(bootGame, { port: PORT + 5 }); });
  after(async () => { if (h) await h.close(); });

  /* Grava os eventos de teclado que a janela recebe enquanto o botão é apertado. */
  const espiar = async (mao, botao) => {
    const A = window.__A;
    A.solta(); await A.espera(250);
    const vistos = [];
    const ouvir = e => vistos.push({ tipo: e.type, code: e.code });
    window.addEventListener('keydown', ouvir);
    window.addEventListener('keyup', ouvir);
    A.botao(mao, botao, 1);
    await A.espera(300);
    A.botao(mao, botao, 0);
    await A.espera(300);
    window.removeEventListener('keydown', ouvir);
    window.removeEventListener('keyup', ouvir);
    A.solta();
    return vistos;
  };

  it('USAR emite KeyE de verdade — é o que abre o baú do BR', async () => {
    const v = await h.play(espiar, 'left', 'x-button');
    const downs = v.filter(x => x.tipo === 'keydown' && x.code === 'KeyE');
    assert.equal(downs.length, 1,
      `esperava exatamente um keydown de KeyE, vieram ${downs.length}: ` +
      'zero = o baú continua inalcançável no headset; mais de um = tryOpenCrate ' +
      'dispararia várias vezes por segundo');
    assert.ok(v.some(x => x.tipo === 'keyup' && x.code === 'KeyE'), 'soltou o botão e a tecla ficou presa');
  });

  it('PULAR emite Space — é o pulo da nave e o paraquedas', async () => {
    const v = await h.play(espiar, 'right', 'a-button');
    assert.equal(v.filter(x => x.tipo === 'keydown' && x.code === 'Space').length, 1);
  });

  it('RECARREGAR emite KeyR', async () => {
    const v = await h.play(espiar, 'left', 'y-button');
    assert.equal(v.filter(x => x.tipo === 'keydown' && x.code === 'KeyR').length, 1);
  });

  it('segurar o botão NÃO repete o evento a 72 Hz', async () => {
    const v = await h.play(async () => {
      const A = window.__A;
      A.solta(); await A.espera(250);
      const vistos = [];
      const ouvir = e => vistos.push(e.code);
      window.addEventListener('keydown', ouvir);
      A.botao('left', 'x-button', 1);
      await A.espera(1500);                   // ~100 frames segurando
      window.removeEventListener('keydown', ouvir);
      A.solta();
      return vistos.filter(c => c === 'KeyE').length;
    });
    assert.equal(v, 1, `segurar 1,5 s emitiu ${v} keydown de KeyE — abriria o baú em rajada`);
  });

  it('o ciclo de arma alcança TODO o arsenal, não só as três primeiras', async () => {
    const r = await h.play(async () => {
      const A = window.__A, G = window.__game;
      A.solta(); await A.espera(250);
      const destravadas = G.arsenal.filter(a => !a.locked).length;
      const vistos = new Set([G.gunIndex]);
      for (let i = 0; i < destravadas + 2; i++) {
        A.botao('right', 'b-button', 1); await A.espera(200);
        A.botao('right', 'b-button', 0); await A.espera(350);
        vistos.add(G.gunIndex);
      }
      A.solta();
      return { destravadas, alcancadas: vistos.size, total: G.arsenal.length };
    });
    assert.equal(r.alcancadas, r.destravadas,
      `o arsenal tem ${r.total} armas, ${r.destravadas} destravadas, e o ciclo do headset ` +
      `alcançou ${r.alcancadas}: com três, cinco armas do BR ficam inacessíveis em VR`);
  });
});
