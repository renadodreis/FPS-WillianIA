/* ================================================================
   QA — HÁPTICO DOS CONTROLES EM XR (critério B6).

   Ponto de partida, medido pelo validador em `98b114f` e reconferido no
   HEAD: **zero** chamadas de háptico no repositório inteiro, com **dois
   atuadores disponíveis** (um por controle). O jogador não sente o tiro.

   COMO ESTE ARQUIVO MEDE, e por que assim:

   1. **O teste OBSERVA, não conduz.** O IWER guarda o último pulso que
      chegou em cada atuador (`GamepadHapticActuator.pulse` grava
      `{ value, duration, startTime }` em `lastPulse`, e o símbolo
      `P_GAMEPAD` é exportado pelo pacote). Então o que se lê aqui é o
      REGISTRO DO PRÓPRIO RUNTIME, sem espião, sem embrulho, sem uma
      segunda instância de nada. Nesta frente um andaime que chamava o
      que o game.js deveria chamar já fez o giro contar duas vezes e o
      clique alternar duas vezes — aqui não há o que contar em dobro.
   2. **Mede a COISA:** que o pulso chegou no atuador da MÃO certa, com
      a intensidade e a duração daquele evento. "A função foi chamada"
      não aparece em asserção nenhuma.
   3. **O instrumento é calibrado antes de ser usado.** O primeiro caso
      prova que `P_GAMEPAD` existe, que há 2 atuadores e que um pulso
      emitido à mão aparece em `lastPulse`. Sem isso, um `null` de
      leitura faria toda asserção de "não saiu pulso" passar sempre — que
      é exatamente o defeito que já passou por aqui (getter inexistente
      caindo num literal).

   Referência e números: docs/vr/referencia-tato-sessao.md
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3450;

/* ================================================================
   POLÍTICA PURA — o vocabulário, sem three, sem sessão, sem headset.
   ================================================================ */
describe('vocabulário de pulsos (unidade, sem navegador)', () => {
  let planoDePulso, PULSO_MIN_MS, PULSO_MAX_MS, PRIORIDADE;
  before(async () => {
    ({ planoDePulso, PULSO_MIN_MS, PULSO_MAX_MS, PRIORIDADE } =
      await import('../js/xr/xrhaptics.js'));
  });

  // armas REAIS do arsenal (js/weapons.js) reduzidas ao que a política lê
  const FUZIL = { rpm: 690, kick: 0.055, pellets: 1 };
  const BAZUCA = { rpm: 30, kick: 0.3, pellets: 1 };

  it('o tiro sai na mão que segura a arma, e só nela', () => {
    const p = planoDePulso('tiro', { arma: FUZIL, mao: 'right' });
    assert.equal(p.length, 1, 'coice de arma é de UMA mão — a que segura');
    assert.equal(p[0].mao, 'right');
    assert.equal(planoDePulso('tiro', { arma: FUZIL, mao: 'left' })[0].mao, 'left',
      'canhoto existe: a mão é parâmetro, não constante');
  });

  it('arma pesada bate mais forte e mais longo que arma leve', () => {
    const leve = planoDePulso('tiro', { arma: FUZIL })[0];
    const pesada = planoDePulso('tiro', { arma: BAZUCA })[0];
    assert.ok(pesada.intensidade > leve.intensidade * 2,
      `bazuca ${pesada.intensidade} contra fuzil ${leve.intensidade}: sem separação a mão não sabe o que segura`);
    assert.ok(pesada.ms > leve.ms * 2,
      `bazuca ${pesada.ms} ms contra fuzil ${leve.ms} ms`);
  });

  it('o pulso NUNCA ocupa mais que 60% do intervalo entre dois tiros', () => {
    /* `pulse()` sobrescreve o pulso anterior (MDN). Pulso mais longo que a
       cadência vira vibração contínua — o "excessive or continuous haptic
       effects" que a Meta manda evitar. O fuzil dispara a cada 87 ms.

       O CASO QUE FAZ ESTA TRAVA VALER ALGUMA COISA é o `trauma` explícito.
       `shotTrauma` já limita o peso pela cadência SOZINHA — mas só quando o
       peso é calculado. Com `trauma:` escrito à mão em js/weapons.js (a FACA
       tem), o teto de cadência é pulado, e uma arma rápida com trauma alto
       pediria um pulso mais longo que o próprio intervalo. Sem os dois casos
       abaixo esta asserção não podia falhar: a lista de rpm sozinha passa com
       a trava removida. */
    const casos = [
      { rpm: 690, kick: 0.3, pellets: 1 }, { rpm: 430, kick: 0.3, pellets: 1 },
      { rpm: 175, kick: 0.3, pellets: 1 }, { rpm: 78, kick: 0.3, pellets: 1 },
      { rpm: 30, kick: 0.3, pellets: 1 },
      { rpm: 690, trauma: 0.6, pellets: 1 },   // trauma à mão pula o teto de cadência
      { rpm: 900, trauma: 0.5, pellets: 1 },
      { rpm: 1200, trauma: 0.9, pellets: 1 },
    ];
    for (const arma of casos) {
      const p = planoDePulso('tiro', { arma })[0];
      const intervalo = 60000 / arma.rpm;
      assert.ok(p.ms <= intervalo * 0.6 + 1e-6,
        `a ${arma.rpm} rpm o intervalo é ${intervalo.toFixed(1)} ms e o pulso é ${p.ms} ms: vira zumbido`);
    }
  });

  it('o sabor do acerto cresce igual ao da tela: hit < head < kill', () => {
    const hit = planoDePulso('acerto', { sabor: 'hit' })[0];
    const head = planoDePulso('acerto', { sabor: 'head' })[0];
    const kill = planoDePulso('acerto', { sabor: 'kill' })[0];
    assert.ok(hit.intensidade < head.intensidade && head.intensidade < kill.intensidade,
      `${hit.intensidade} / ${head.intensidade} / ${kill.intensidade}`);
    assert.ok(hit.ms < head.ms && head.ms < kill.ms, `${hit.ms} / ${head.ms} / ${kill.ms}`);
    // e mais curto que o hitmarker visual (110/170/260 ms em js/hitfeel-core.js):
    // tato é clique de confirmação, não segunda animação
    assert.ok(hit.ms < 110 && head.ms < 170 && kill.ms < 260);
  });

  it('a recarga é das DUAS mãos, em tempos diferentes e papéis diferentes', () => {
    const puxa = planoDePulso('recarga', { mao: 'right' });
    const encaixa = planoDePulso('recarga-pronta', { mao: 'right' });
    assert.equal(puxa[0].mao, 'left', 'quem busca e leva o carregador é a mão de APOIO');
    assert.equal(encaixa[0].mao, 'right', 'o ferrolho fechando é sentido por quem segura a arma');
    assert.ok(encaixa[0].intensidade > puxa[0].intensidade && encaixa[0].ms < puxa[0].ms,
      '"encaixou" é forte e curto; "saiu o carregador" é fraco e longo');
    assert.equal(planoDePulso('recarga', { mao: 'left' })[0].mao, 'right',
      'com a arma na esquerda o apoio é a direita');
  });

  it('o dano é sentido nas DUAS mãos — dano é no corpo, não na arma', () => {
    const p = planoDePulso('dano', { dano: 20 });
    assert.equal(p.length, 2);
    assert.deepEqual(p.map(x => x.mao).sort(), ['left', 'right']);
    assert.equal(p[0].intensidade, p[1].intensidade, 'o corpo inteiro leva o mesmo golpe');
  });

  it('o golpe que quase mata bate mais forte que o arranhão', () => {
    const arranhao = planoDePulso('dano', { dano: 4 })[0];
    const grande = planoDePulso('dano', { dano: 60 })[0];
    const letal = planoDePulso('dano', { dano: 60, letal: true })[0];
    assert.ok(arranhao.intensidade < grande.intensidade);
    assert.ok(grande.intensidade < letal.intensidade && grande.ms < letal.ms,
      'letal tem que ser distinguível de "levei um tiro"');
  });

  it('passar o dedo no painel é o evento MAIS LEVE do vocabulário inteiro', () => {
    const foco = planoDePulso('ui-foco', { mao: 'right' })[0];
    const toque = planoDePulso('ui-toque', { mao: 'right' })[0];
    assert.ok(foco.intensidade < toque.intensidade && foco.ms < toque.ms,
      'hover tem que ser mais discreto que o clique');
    const resto = [
      ...planoDePulso('tiro', { arma: FUZIL }), ...planoDePulso('tiro', { arma: BAZUCA }),
      ...planoDePulso('acerto', { sabor: 'hit' }), ...planoDePulso('acerto', { sabor: 'kill' }),
      ...planoDePulso('recarga', {}), ...planoDePulso('recarga-pronta', {}),
      ...planoDePulso('dano', {}), ...planoDePulso('pegar', {}), toque,
    ];
    for (const p of resto) {
      assert.ok(foco.intensidade <= p.intensidade && foco.ms <= p.ms,
        `${p.evento} (${p.intensidade}/${p.ms}ms) é mais discreto que passar o dedo num menu (${foco.intensidade}/${foco.ms}ms)`);
    }
    // e o clique do menu não pode bater como coice de arma pesada nem como dano
    assert.ok(toque.intensidade < planoDePulso('tiro', { arma: BAZUCA })[0].intensidade);
    assert.ok(toque.ms < planoDePulso('dano', { dano: 30 })[0].ms);
    assert.equal(foco.mao, 'right');
    assert.equal(planoDePulso('ui-foco', { mao: 'left' })[0].mao, 'left');
  });

  it('todo pulso cabe na faixa que a API promete e na que o VCM sente', () => {
    const todos = [
      ...planoDePulso('tiro', { arma: FUZIL }), ...planoDePulso('tiro', { arma: BAZUCA }),
      ...planoDePulso('acerto', { sabor: 'kill' }), ...planoDePulso('recarga', {}),
      ...planoDePulso('recarga-pronta', {}), ...planoDePulso('dano', { dano: 999, letal: true }),
      ...planoDePulso('pegar', {}), ...planoDePulso('ui-foco', {}), ...planoDePulso('ui-toque', {}),
    ];
    assert.ok(todos.length >= 9);
    for (const p of todos) {
      assert.ok(p.intensidade > 0 && p.intensidade <= 1,
        `intensidade ${p.intensidade} fora de 0..1 (MDN: 0.0 a 1.0)`);
      assert.ok(p.ms >= PULSO_MIN_MS && p.ms <= PULSO_MAX_MS,
        `duração ${p.ms} ms fora da faixa util ${PULSO_MIN_MS}..${PULSO_MAX_MS}`);
      assert.ok(p.mao === 'left' || p.mao === 'right');
      assert.ok(Number.isFinite(p.prioridade));
    }
  });

  it('evento desconhecido não vira pulso nem exceção', () => {
    assert.deepEqual(planoDePulso('coisa-que-nao-existe', {}), []);
    assert.deepEqual(planoDePulso(null, {}), []);
    assert.deepEqual(planoDePulso(undefined), []);
  });

  it('a tabela de prioridade põe o dano acima de tudo e a UI abaixo de tudo', () => {
    assert.ok(PRIORIDADE.dano > PRIORIDADE.acerto);
    assert.ok(PRIORIDADE.acerto > PRIORIDADE.tiro);
    assert.ok(PRIORIDADE.tiro > PRIORIDADE['ui-toque']);
    assert.ok(PRIORIDADE['ui-toque'] > PRIORIDADE['ui-foco']);
  });
});

/* ================================================================
   A FORMA QUE O NAVEGADOR ENTREGA — e que o emulado NÃO reproduz.

   O IWER devolve `session.inputSources` como Array de verdade
   (`inputSourceArray: []` em `lib/session/XRSession.js`), então
   `Array.isArray` passa nele. O navegador nativo entrega
   `XRInputSourceArray`, que reprova — e `gamepad.hapticActuators` é
   `FrozenArray`, sem promessa de ser Array real.

   MEDIDO: com o defeito `Array.isArray(inputSources) ? ... : []`
   reintroduzido de propósito, a suíte inteira de sessão emulada deste arquivo
   continua VERDE. Só o bloco abaixo fica vermelho. É a mesma divisão de
   trabalho que já existe entre xr-controle-anda e xr-input, e existe porque
   esse exato guarda descartou os dois controles do aparelho, todo frame, para
   sempre — com vinte testes verdes.
   ================================================================ */
describe('a forma NATIVA do navegador (o emulado imita por conveniência)', () => {
  let createXrHaptics;
  before(async () => { ({ createXrHaptics } = await import('../js/xr/xrhaptics.js')); });

  // array-like com length e índices, iterável, mas NÃO Array — igual ao real
  function comoOWebXREntrega(itens) {
    const o = { length: itens.length, [Symbol.iterator]: Array.prototype[Symbol.iterator] };
    itens.forEach((v, i) => { o[i] = v; });
    return o;
  }

  function sessaoNativa() {
    const recebido = { left: [], right: [] };
    const fonte = qual => ({
      handedness: qual,
      gamepad: {
        hapticActuators: comoOWebXREntrega([{
          pulse: (v, d) => { recebido[qual].push({ v, d }); return Promise.resolve(true); },
        }]),
      },
    });
    return {
      recebido,
      sessao: { visibilityState: 'visible', inputSources: comoOWebXREntrega([fonte('left'), fonte('right')]) },
    };
  }

  it('o pulso chega mesmo quando inputSources e hapticActuators NÃO são Array', () => {
    const { sessao, recebido } = sessaoNativa();
    assert.equal(Array.isArray(sessao.inputSources), false,
      'o dublê virou Array — assim ele não testa nada');
    const H = createXrHaptics({ getSession: () => sessao });
    const saiu = H.emitir('tiro', { arma: { rpm: 30, kick: 0.3, pellets: 1 }, mao: 'right' });
    assert.equal(recebido.right.length, 1,
      'o atuador não recebeu nada: a coleção do navegador foi descartada em silêncio');
    assert.equal(recebido.left.length, 0);
    assert.deepEqual(recebido.right[0], { v: saiu[0].intensidade, d: saiu[0].ms });
  });

  it('fonte sem gamepad, sem atuador ou com pulse quebrado degrada sem exceção', () => {
    const quebrados = [
      { handedness: 'right' },                                        // sem gamepad
      { handedness: 'right', gamepad: {} },                           // sem hapticActuators
      { handedness: 'right', gamepad: { hapticActuators: comoOWebXREntrega([]) } },
      { handedness: 'right', gamepad: { hapticActuators: comoOWebXREntrega([{}]) } },
      { handedness: 'right', gamepad: { hapticActuators: comoOWebXREntrega([{ pulse: () => { throw new Error('atuador ocupado'); } }]) } },
    ];
    for (const f of quebrados) {
      const sessao = { visibilityState: 'visible', inputSources: comoOWebXREntrega([f]) };
      const H = createXrHaptics({ getSession: () => sessao });
      assert.deepEqual(H.emitir('tiro', { arma: { rpm: 30, kick: 0.3 }, mao: 'right' }), [],
        `reportou pulso emitido em ${JSON.stringify(Object.keys(f.gamepad || {}))}`);
    }
  });

  it('`vibrationActuator` serve de alternativa quando não há hapticActuators', () => {
    const recebido = [];
    const sessao = {
      visibilityState: 'visible',
      inputSources: comoOWebXREntrega([{
        handedness: 'right',
        gamepad: { vibrationActuator: { pulse: (v, d) => { recebido.push({ v, d }); return Promise.resolve(true); } } },
      }]),
    };
    const H = createXrHaptics({ getSession: () => sessao });
    H.emitir('ui-toque', { mao: 'right' });
    assert.equal(recebido.length, 1);
  });
});

/* ================================================================
   O ATUADOR DE VERDADE, DENTRO DA SESSÃO IMERSIVA.
   ================================================================ */
describe('háptico na sessão de verdade', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootEmVR(bootGame, { port: PORT });
    // o módulo entra na página uma vez; os casos abaixo só OBSERVAM o atuador
    await h.play(async () => {
      const { createXrHaptics } = await import('/js/xr/xrhaptics.js');
      const R = window.__MP.renderer;
      window.__H = createXrHaptics({ getSession: () => R.xr.getSession() });
      /* leitura do registro que o PRÓPRIO runtime faz do pulso recebido.
         Nada aqui embrulha, espiona ou substitui o caminho do produto. */
      window.__lerAtuador = qual => {
        const s = R.xr.getSession();
        const P = window.IWER && window.IWER.P_GAMEPAD;
        if (!s || !P) return { erro: 'sem sessão ou sem P_GAMEPAD' };
        for (const f of Array.from(s.inputSources)) {
          if (f.handedness !== qual) continue;
          const g = f.gamepad;
          const a = g && g.hapticActuators && g.hapticActuators[0];
          if (!a) return { atuador: false };
          const r = a[P] && a[P].lastPulse;
          return {
            atuador: true,
            ultimo: r ? { value: r.value, duration: r.duration, startTime: r.startTime } : null,
          };
        }
        return { atuador: false, semFonte: true };
      };
    });
  });
  after(async () => { if (h) await h.close(); });

  it('CALIBRAÇÃO: há 2 atuadores e o runtime registra o pulso que recebe', async () => {
    /* Sem este caso, uma leitura que devolvesse null para sempre faria todas as
       asserções de "não saiu pulso" passarem sem nada acontecer. O instrumento
       é conferido antes de virar prova. */
    const r = await h.play(async () => {
      const R = window.__MP.renderer;
      const s = R.xr.getSession();
      const atuadores = Array.from(s.inputSources).map(f => {
        const g = f.gamepad;
        return { mao: f.handedness, n: (g && g.hapticActuators && g.hapticActuators.length) || 0 };
      });
      // pulso emitido À MÃO só para calibrar o instrumento (não é o produto)
      for (const f of Array.from(s.inputSources)) {
        if (f.handedness === 'right') await f.gamepad.hapticActuators[0].pulse(0.42, 33);
      }
      return { atuadores, temP: !!(window.IWER && window.IWER.P_GAMEPAD),
        lido: window.__lerAtuador('right') };
    });
    assert.equal(r.temP, true, 'sem IWER.P_GAMEPAD não há como ler o registro do runtime');
    assert.equal(r.atuadores.length, 2, `fontes de entrada com gamepad: ${JSON.stringify(r.atuadores)}`);
    for (const a of r.atuadores) assert.equal(a.n, 1, `${a.mao} sem atuador: ${a.n}`);
    assert.equal(r.lido.atuador, true);
    assert.deepEqual({ v: r.lido.ultimo.value, d: r.lido.ultimo.duration }, { v: 0.42, d: 33 },
      'o runtime não registrou o pulso que recebeu — o instrumento não serve');
  });

  it('o TIRO chega no atuador da mão da arma, com o valor e a duração da arma', async () => {
    const r = await h.play(async () => {
      const G = window.__game;
      const antesE = window.__lerAtuador('left').ultimo;
      const fuzil = G.arsenal[0];       // FUZIL "VAGALUME", 690 rpm
      const { planoDePulso } = await import('/js/xr/xrhaptics.js');
      const plano = planoDePulso('tiro', { arma: fuzil, mao: 'right' })[0];
      window.__H.emitir('tiro', { arma: fuzil, mao: 'right' });
      return {
        plano, arma: { nome: fuzil.name, rpm: fuzil.rpm },
        direita: window.__lerAtuador('right').ultimo,
        esquerda: window.__lerAtuador('left').ultimo,
        antesE,
      };
    });
    assert.ok(r.direita, 'nenhum pulso chegou no controle da direita ao atirar');
    assert.equal(r.direita.value, r.plano.intensidade,
      `intensidade errada no atuador: ${r.direita.value} em vez de ${r.plano.intensidade}`);
    assert.equal(r.direita.duration, r.plano.ms,
      `duração errada no atuador: ${r.direita.duration} ms em vez de ${r.plano.ms} ms`);
    assert.deepEqual(r.esquerda, r.antesE,
      'a mão que NÃO segura a arma vibrou junto — VRC.Quest.Input.3: mão virtual = mão real');
  });

  it('arma pesada e arma leve chegam DIFERENTES no atuador', async () => {
    const r = await h.play(async () => {
      const G = window.__game;
      window.__H.emitir('tiro', { arma: G.arsenal[0], mao: 'right' });   // fuzil
      const fuzil = window.__lerAtuador('right').ultimo;
      await new Promise(res => setTimeout(res, 120));                    // deixa o pulso terminar
      window.__H.emitir('tiro', { arma: G.arsenal[3], mao: 'right' });   // bazuca
      const bazuca = window.__lerAtuador('right').ultimo;
      return { fuzil, bazuca, nomes: [G.arsenal[0].name, G.arsenal[3].name] };
    });
    assert.ok(r.bazuca.value > r.fuzil.value * 2 && r.bazuca.duration > r.fuzil.duration * 2,
      `${r.nomes[1]} ${r.bazuca.value}/${r.bazuca.duration}ms contra ${r.nomes[0]} ${r.fuzil.value}/${r.fuzil.duration}ms`);
  });

  it('a RECARGA vai para a mão de apoio, e o encaixe volta para a da arma', async () => {
    const r = await h.play(async () => {
      const antesD = window.__lerAtuador('right').ultimo;
      window.__H.emitir('recarga', { mao: 'right' });
      const puxou = { E: window.__lerAtuador('left').ultimo, D: window.__lerAtuador('right').ultimo };
      await new Promise(res => setTimeout(res, 120));
      window.__H.emitir('recarga-pronta', { mao: 'right' });
      const encaixou = { E: window.__lerAtuador('left').ultimo, D: window.__lerAtuador('right').ultimo };
      return { antesD, puxou, encaixou };
    });
    assert.ok(r.puxou.E, 'o carregador saiu e a mão de apoio não sentiu nada');
    assert.deepEqual(r.puxou.D, r.antesD, 'a mão da arma vibrou no puxão do carregador');
    assert.ok(r.encaixou.D && r.encaixou.D.startTime > (r.antesD ? r.antesD.startTime : -1),
      'o ferrolho fechou e a mão da arma não sentiu');
    assert.ok(r.encaixou.D.value > r.puxou.E.value, 'o encaixe tem que ser mais firme que o puxão');
  });

  it('o DANO chega nas duas mãos no mesmo golpe', async () => {
    const r = await h.play(async () => {
      await new Promise(res => setTimeout(res, 200));
      const antes = { E: window.__lerAtuador('left').ultimo, D: window.__lerAtuador('right').ultimo };
      window.__H.emitir('dano', { dano: 34 });
      return { antes, E: window.__lerAtuador('left').ultimo, D: window.__lerAtuador('right').ultimo };
    });
    assert.ok(r.E.startTime > r.antes.E.startTime, 'a esquerda não sentiu o dano');
    assert.ok(r.D.startTime > r.antes.D.startTime, 'a direita não sentiu o dano');
    assert.equal(r.E.value, r.D.value);
    assert.equal(r.E.duration, r.D.duration);
  });

  it('pulso fraco NÃO corta pulso forte em voo; pulso forte corta', async () => {
    /* `pulse()` sobrescreve o anterior (MDN/W3C): sem prioridade, o tique de
       menu de 10 ms decapita o coice de 27 ms e o jogador não sente nem um nem
       outro. Os dois emites acontecem no MESMO turno, sem espera no meio —
       é o caso real (hitmarker chega ~2 ms depois do tiro). */
    const r = await h.play(async () => {
      const G = window.__game;
      await new Promise(res => setTimeout(res, 250));
      window.__H.emitir('tiro', { arma: G.arsenal[3], mao: 'right' });   // bazuca: 90 ms
      const doTiro = window.__lerAtuador('right').ultimo;
      window.__H.emitir('ui-foco', { mao: 'right' });                    // prioridade mínima
      const depoisDoFraco = window.__lerAtuador('right').ultimo;
      window.__H.emitir('dano', { dano: 40 });                           // prioridade máxima
      const depoisDoForte = window.__lerAtuador('right').ultimo;
      return { doTiro, depoisDoFraco, depoisDoForte };
    });
    assert.deepEqual(r.depoisDoFraco, r.doTiro,
      `o tique de UI cortou o coice em voo: ${JSON.stringify(r.depoisDoFraco)}`);
    /* Compara o CONTEÚDO do pulso, não o carimbo de tempo: os três `emitir`
       acontecem no mesmo turno síncrono e `performance.now()` pode devolver o
       mesmo valor para todos, o que fazia `startTime >` falhar de vez em
       quando sem nada estar errado. O que prova a substituição é o pulso do
       dano estar no atuador — valor e duração dele, não os da bazuca. */
    assert.notDeepEqual(
      { v: r.depoisDoForte.value, d: r.depoisDoForte.duration },
      { v: r.doTiro.value, d: r.doTiro.duration },
      'o dano NÃO passou por cima do tiro — levar tiro tem que interromper qualquer coisa');
  });

  it('depois que o pulso termina, o próximo passa mesmo sendo fraco', async () => {
    const r = await h.play(async () => {
      const G = window.__game;
      window.__H.emitir('tiro', { arma: G.arsenal[3], mao: 'right' });   // 90 ms
      const doTiro = window.__lerAtuador('right').ultimo;
      await new Promise(res => setTimeout(res, 160));                    // já acabou
      window.__H.emitir('ui-foco', { mao: 'right' });
      return { doTiro, depois: window.__lerAtuador('right').ultimo };
    });
    assert.ok(r.depois.startTime > r.doTiro.startTime,
      'a prioridade virou mordaça permanente: pulso terminado continua bloqueando');
    assert.ok(r.depois.duration < r.doTiro.duration);
  });

  it('SEM FOCO não sai pulso nenhum — VRC.Quest.Input.4', async () => {
    /* POR QUE O ESTADO DE FOCO É INJETADO E NÃO SOPRADO NO RUNTIME: com blur de
       verdade o IWER ESVAZIA `inputSources` (`get activeInputs()` devolve `[]`
       fora de `visible`). Aí "não vibrou" não provaria portão nenhum — provaria
       que não havia atuador para vibrar, e a asserção passaria com o portão
       removido. É a armadilha do "teste que não pode falhar", e ela já pegou
       esta base uma vez. Aqui a sessão fica VISÍVEL o tempo todo, com os dois
       controles presentes e alcançáveis: a única coisa que segura o pulso é o
       portão de foco do produto. Tire a linha do portão e este caso fica
       vermelho. A volta do foco de verdade é o caso seguinte. */
    const r = await h.play(async () => {
      const G = window.__game;
      const { createXrHaptics } = await import('/js/xr/xrhaptics.js');
      const R = window.__MP.renderer;
      window.__vis = 'visible';
      const H2 = createXrHaptics({
        getSession: () => R.xr.getSession(),
        getVisibilidade: () => window.__vis,
      });
      await new Promise(res => setTimeout(res, 250));
      const antes = window.__lerAtuador('right').ultimo;
      window.__vis = 'visible-blurred';
      const nBorrado = H2.emitir('tiro', { arma: G.arsenal[3], mao: 'right' }).length;
      const borrado = window.__lerAtuador('right').ultimo;
      window.__vis = 'hidden';
      const nEscondido = H2.emitir('dano', { dano: 90, letal: true }).length;
      const escondido = window.__lerAtuador('right').ultimo;
      window.__vis = 'visible';
      const nDevolta = H2.emitir('tiro', { arma: G.arsenal[3], mao: 'right' }).length;
      const devolta = window.__lerAtuador('right').ultimo;
      const fontes = Array.from(R.xr.getSession().inputSources).map(f => f.handedness).sort();
      return { antes, borrado, escondido, devolta, nBorrado, nEscondido, nDevolta, fontes,
        vis: R.xr.getSession().visibilityState, erros: G.errors.slice() };
    });
    assert.equal(r.vis, 'visible');
    assert.deepEqual(r.fontes, ['left', 'right'],
      'os controles não estavam na sessão — o caso não teria como provar o portão');
    assert.deepEqual(r.borrado, r.antes,
      'vibrou com a sessão em visible-blurred: o app está furando o foco do sistema');
    assert.equal(r.nBorrado, 0);
    assert.deepEqual(r.escondido, r.antes, 'vibrou com a sessão hidden');
    assert.equal(r.nEscondido, 0);
    assert.ok(r.devolta.startTime > (r.antes ? r.antes.startTime : -1) && r.nDevolta === 1,
      'com foco de volta o háptico não saiu — o portão virou desligamento definitivo');
    assert.deepEqual(r.erros, [], `erro de console durante o ciclo de foco: ${r.erros.join(' | ')}`);
  });

  it('o foco DE VERDADE indo e voltando devolve o háptico', async () => {
    /* Complemento do caso acima com o runtime mexendo de verdade. O que ESTE
       caso prova é a VOLTA: um portão que travasse ligado depois de um blur
       deixaria o jogador sem tato pelo resto da partida, e nenhum outro teste
       veria isso. */
    const r = await h.play(async () => {
      const G = window.__game, dev = window.__xrEmulado;
      await new Promise(res => setTimeout(res, 250));
      const antes = window.__lerAtuador('right').ultimo;
      dev.updateVisibilityState('visible-blurred');
      await new Promise(res => setTimeout(res, 120));
      const visBorrado = window.__MP.renderer.xr.getSession().visibilityState;
      window.__H.emitir('tiro', { arma: G.arsenal[3], mao: 'right' });
      dev.updateVisibilityState('visible');
      await new Promise(res => setTimeout(res, 200));
      const n = window.__H.emitir('tiro', { arma: G.arsenal[3], mao: 'right' }).length;
      return { antes, n, visBorrado, depois: window.__lerAtuador('right').ultimo,
        erros: G.errors.slice() };
    });
    assert.equal(r.visBorrado, 'visible-blurred', 'o runtime não chegou a perder o foco');
    assert.equal(r.n, 1, 'o foco voltou e o háptico continuou mudo');
    assert.ok(r.depois.startTime > (r.antes ? r.antes.startTime : -1));
    assert.deepEqual(r.erros, [], `erro de console: ${r.erros.join(' | ')}`);
  });

  it('MUDO desliga de verdade, e religar volta a valer', async () => {
    const r = await h.play(async () => {
      const G = window.__game;
      await new Promise(res => setTimeout(res, 250));
      const antes = window.__lerAtuador('right').ultimo;
      window.__H.ligado = false;
      window.__H.emitir('tiro', { arma: G.arsenal[3], mao: 'right' });
      const mudo = window.__lerAtuador('right').ultimo;
      window.__H.ligado = true;
      window.__H.emitir('tiro', { arma: G.arsenal[3], mao: 'right' });
      return { antes, mudo, devolta: window.__lerAtuador('right').ultimo };
    });
    assert.deepEqual(r.mudo, r.antes, 'mudo e vibrando: a Meta exige que dê para desligar');
    assert.ok(r.devolta.startTime > r.antes.startTime, 'religou e continuou mudo');
  });

  it('controle sumido degrada sem erro — e o outro continua sentindo', async () => {
    const r = await h.play(async () => {
      const G = window.__game, dev = window.__xrEmulado;
      await new Promise(res => setTimeout(res, 250));
      dev.controllers.left.connected = false;   // o esquerdo dormiu / desligou
      await new Promise(res => setTimeout(res, 200));
      const semEsquerdo = window.__lerAtuador('left');
      const saiu = window.__H.emitir('recarga', { mao: 'right' });   // ia para a ESQUERDA
      const antesD = window.__lerAtuador('right').ultimo;
      const saiuD = window.__H.emitir('dano', { dano: 20 });         // as duas mãos
      const depoisD = window.__lerAtuador('right').ultimo;
      dev.controllers.left.connected = true;
      await new Promise(res => setTimeout(res, 200));
      return {
        temEsquerdo: semEsquerdo.atuador, saiu: saiu.length, saiuD: saiuD.length,
        antesD, depoisD, erros: G.errors.slice(),
      };
    });
    assert.equal(r.temEsquerdo, false, 'o controle não saiu da sessão — o teste não mediu a falta dele');
    assert.equal(r.saiu, 0, 'reportou pulso emitido num atuador que não existe');
    assert.equal(r.saiuD, 1, 'com uma mão fora, a outra tinha que continuar sentindo o dano');
    assert.ok(r.depoisD.startTime > r.antesD.startTime, 'a mão presente não recebeu o pulso');
    assert.deepEqual(r.erros, [], `atuador ausente gerou erro: ${r.erros.join(' | ')}`);
  });

  it('fora da sessão o háptico é no-op, e nada disso deixou erro no console', async () => {
    const r = await h.play(async () => {
      const G = window.__game;
      await G.XR.exit();
      for (let i = 0; i < 30 && G.XR.presenting; i++) await new Promise(res => setTimeout(res, 50));
      const saiu = window.__H.emitir('tiro', { arma: G.arsenal[0], mao: 'right' });
      return { presenting: G.XR.presenting, saiu: saiu.length, erros: G.errors.slice() };
    });
    assert.equal(r.presenting, false, 'a sessão não terminou — o caso não mediu o fora da sessão');
    assert.equal(r.saiu, 0, 'emitiu pulso sem sessão');
    assert.deepEqual(r.erros, [], `erros no console durante a sessão: ${r.erros.join(' | ')}`);
  });
});
