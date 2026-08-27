/* ================================================================
   QA — O MENU PRINCIPAL DENTRO DO MUNDO (IWER, sessão imersiva real).

   O QUE ESTÁ SENDO COBRADO. Entrar em VR CHAMAVA `startGame(false)`
   (game.js:3234) porque o menu é DOM e DOM não é desenhado dentro de uma
   sessão `immersive-vr`: sem menu no mundo, começar a partida à força era o
   único estado alcançável. O preço era o jogador não escolher NADA — nem solo
   nem multijogador, nem ver o lobby, nem configurar. É o critério F5 do
   docs/vr/criterio-aaa.md ("o jogador chega ao menu, escolhe modo, entra em
   partida, joga, morre, volta ao menu e sai — sem tirar o aparelho") e o I4
   ("nenhum estado sem saída").

   COMO ESTE ARQUIVO EVITA MEDIR A SI MESMO. Regra desta frente, quebrada seis
   vezes: andaime que CONDUZ o produto mede a si mesmo. Aqui não há condutor
   nenhum — quem chama `update()` uma vez por frame é o `tick` do game.js, que
   já fia o painel. O teste faz três coisas e só três:

     1. FIA o menu na instância do jogo (`G.XRUI.conectarMenu`), que é
        exatamente o que o wiring vai fazer — a mesma porta do
        `conectarSocial`, e a mesma instância (nunca uma segunda);
     2. aciona controle DE VERDADE pelo `window.__A` (o kit da Meta);
     3. LÊ. Nenhuma asserção chama a função sob teste.

   E as ações são as DO JOGO onde o jogo as exporta: JOGAR SOLO chama o
   `startGame` de verdade (escritor único de `state.started`) e SAIR DO VR
   chama o `XR.exit()` de verdade. O que o `window.__game` não exporta
   (`entrarEmSolo`, que além de começar fecha o socket) fica com um contador —
   e essa parte é do game.js, coberta por test/solo-com-sala.test.js.

   O ESTADO DE ANTES DA PARTIDA É ALCANÇADO PELO CAMINHO DO PRODUTO. Sem o
   wiring aplicado, entrar em VR ainda começa a partida à força; `voltarAoMenu()`
   (a ação que o painel de pausa já oferece) devolve o jogo ao menu, e o par
   `voltarAoMenu(); abrir('menu')` é feito no MESMO turno síncrono de propósito:
   entre as duas linhas nenhum frame corre, então a partida forçada não tem
   janela para disparar. É o mesmo estado que o wiring vai produzir sozinho.

   O HARNESS NASCE ONLINE (`online: true` → `__BR_active = true` e um socket de
   verdade contra o server.js): a sala EXISTE, e é por isso que MULTIJOGADOR
   aparece como botão. A sala fora do ar é medida desligando a leitura, não a
   rede — o que se cobra é a REGRA ("sem sala não há botão"), não o socket.

   PORTAS 3520–3529 (só deste arquivo).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3520;

const mediana = xs => {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/* Ferramentas instaladas NA PÁGINA. `page.evaluate` com string ignora os
   argumentos — por isso tudo aqui é função normal em `window.__M`, mesmo
   motivo do `window.__A` de test/helpers/iwer.js. */
async function instalar() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  window.__mod = await import('/js/xr/xrmenu.js');

  window.__conta = { solo: 0, multi: 0, sairVR: 0 };
  /* Leitura de estado que o teste consegue TORCER sem mexer na rede: a regra
     cobrada é "sem sala não há botão de multijogador", e derrubar o socket de
     verdade mediria o socket.io, não a regra. */
  window.__gate = { sala: true, voltando: false, quebrado: null };

  /* A FIAÇÃO, no mesmo método que o game.js vai usar. UMA instância: a que o
     painel do jogo já hospeda. */
  G.XRUI.conectarMenu({
    ler: () => ({
      pronto: !!G.MenuGate.wired,
      jogando: !!G.state.started,
      sala: window.__gate.sala && !!(MP.socket && MP.socket.connected),
      caiu: !!G.MenuGate.dropped,
      solo: !!G.MenuGate.soloChosen || !!window.__MP_soloOnly,
      voltando: window.__gate.voltando || !!G.MenuGate.voltando,
      quebrado: window.__gate.quebrado || G.MenuGate.broken || window.__BR_loadFailed || null,
    }),
    acoes: {
      /* o efeito que importa é do JOGO: `startGame` é o escritor único de
         `state.started`. O fechamento do socket (o resto do `entrarEmSolo`) é
         do game.js e não tem como ser chamado daqui. */
      solo: () => { window.__conta.solo++; G.startGame(false); },
      multi: () => { window.__conta.multi++; },
      sairVR: () => { window.__conta.sairVR++; G.XR.exit(); },
    },
  });

  const v3 = a => new T.Vector3(a[0], a[1], a[2]);

  window.__M = {
    /* espera FRAMES do renderer do jogo (não uma cadeia de rAF própria: essa
       morre quando outro caminho também agenda, e contador parado vira falso
       negativo) */
    async esperar(n) {
      const alvo = MP.renderer.info.render.frame + n;
      const t0 = Date.now();
      while (MP.renderer.info.render.frame < alvo && Date.now() - t0 < 10000) {
        await new Promise(r => setTimeout(r, 16));
      }
    },
    estado: () => G.XRUI.estado(),
    linha: id => (G.XRUI.estado().linhas || []).find(l => l.id === id) || null,
    ids: () => (G.XRUI.estado().linhas || []).map(l => l.id),
    jogo: () => ({ started: G.state.started, paused: G.state.paused }),
    pos: () => { const p = MP.player.pos; return [p.x, p.y, p.z]; },
    drawCalls: () => MP.renderer.info.render.calls,
    naCena: nome => !!MP.scene.getObjectByName(nome),
    filhosDaCena: () => MP.scene.children.length,
    /* a UI INTEIRA (malha do painel + raio da mão): é o custo conhecido contra
       o qual o zero do menu é medido */
    painelVisivel: v => {
      for (const n of ['xrUiPainel', 'xrUiRaio']) {
        const o = MP.scene.getObjectByName(n);
        if (o) o.visible = v;
      }
    },

    /* ESPERA O JOGADOR ASSENTAR. O painel nasce onde o olho está no instante
       da abertura e depois fica ancorado NO MUNDO: abrir no meio da queda do
       spawn deixa o menu acima da cabeça e a medição de ângulo mente. */
    async assentar() {
      let ant = MP.camera.getWorldPosition(new T.Vector3()).y;
      const t0 = Date.now();
      while (Date.now() - t0 < 12000) {
        await new Promise(r => setTimeout(r, 200));
        const y = MP.camera.getWorldPosition(new T.Vector3()).y;
        if (MP.player.onGround && Math.abs(y - ant) < 0.005) return true;
        ant = y;
      }
      return false;
    },

    /* O ESTADO DE ANTES DA PARTIDA, pelo caminho do produto. As duas linhas no
       MESMO turno síncrono: sem frame no meio, a partida forçada do game.js
       (`!state.started && !XRUI.aberto`) não tem janela para disparar. */
    aoMenu() {
      G.voltarAoMenu();
      G.XRUI.abrir('menu');
      return G.XRUI.estado().modo;
    },
    /* replanta o painel onde o olho está AGORA (o jogador pode ter sido
       teleportado pelo reinício); fechar e abrir é síncrono pelo mesmo motivo */
    replantar() {
      G.XRUI.fechar();
      G.XRUI.abrir('menu');
      return G.XRUI.estado().distancia;
    },

    /* aponta a mão de verdade para um ponto do MUNDO (mesma receita do
       test/xr-ui.test.js: o controle vive no espaço de referência = o rig) */
    apontar: (qual, alvoMundo) => {
      const dev = window.__xrEmulado, rig = G.XR.rig;
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
    /* tira AS DUAS mãos do painel: o painel tenta a direita e depois a
       esquerda, e o controle esquerdo parado acerta a tela */
    async paraLonge() {
      const p = G.XRUI.painel;
      if (!p) return null;
      p.updateWorldMatrix(true, false);
      const fora = p.getWorldPosition(new T.Vector3());
      fora.y -= 4;
      window.__M.apontar('right', fora.toArray());
      window.__M.apontar('left', fora.toArray());
      await window.__M.esperar(3);
      return G.XRUI.estado().item;
    },
    async mirar(id) {
      const l = window.__M.linha(id);
      if (!l) return null;
      window.__M.apontar('right', l.centro);
      await window.__M.esperar(4);
      return G.XRUI.estado().item;
    },
    async clicar() {
      window.__A.botao('right', 'trigger', 1);
      await window.__A.espera(160);
      window.__A.botao('right', 'trigger', 0);
      await window.__A.espera(220);
    },
    /* clique do analógico direito: o botão que abre e fecha o painel */
    async botaoMenu() {
      window.__A.botao('right', 'thumbstick', 1);
      await window.__A.espera(150);
      window.__A.botao('right', 'thumbstick', 0);
      await window.__A.espera(250);
    },
  };
  return true;
}

describe('menu principal dentro do mundo (IWER, sessão imersiva real)',
  { timeout: 900000, skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;

    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      await h.play(instalar);
      const assentou = await h.play(() => window.__M.assentar());
      assert.equal(assentou, true, 'o jogador não assentou: o painel nasceria no meio da queda');
      const modo = await h.play(() => window.__M.aoMenu());
      assert.equal(modo, 'menu', 'o painel não entrou no modo de menu principal');
      await h.play(() => window.__M.replantar());
      await h.play(() => window.__M.esperar(6));
    });

    after(async () => { if (h) await h.close(); });

    /* ---------------------------------------------------------------- */
    it('não cria nada: zero Object3D e zero números do Math.random', async () => {
      /* Todo `Object3D` gasta 4 números do `Math.random` seedado no UUID e a
         ordem de consumo é contrato do worldgen (CLAUDE.md): um Group a mais
         desloca o mapa de TODOS os jogadores. Falha se alguém der ao menu uma
         malha própria em vez de pintar no canvas que o painel já tem. */
      const r = await h.play(async () => {
        const MP = window.__MP, mod = window.__mod;
        const antes = MP.scene.children.length;
        const orig = Math.random;
        let n = 0;
        Math.random = () => { n++; return orig(); };
        /* instância DESCARTÁVEL: nunca encosta no painel, ninguém a conduz e
           ela morre nesta linha. O que se mede é o CUSTO DE CRIAR — o do
           produto já foi pago no `conectarMenu` do preparo. */
        const m = mod.createXrMenu({ ler: () => ({ pronto: true, sala: true }), acoes: {} });
        m.linhas({ opcoes: [] });
        m.assinatura();
        m.estado();
        Math.random = orig;
        return { consumo: n, novos: MP.scene.children.length - antes };
      });
      assert.equal(r.consumo, 0, 'gastar Math.random desloca o worldgen de todos');
      assert.equal(r.novos, 0, 'nada de Object3D: o menu mora no canvas do painel');
    });

    it('entrar no menu NÃO começa a partida — e o analógico não anda com ninguém', async () => {
      /* O defeito que esta rodada veio matar: `startGame(false)` disparado por
         `xrOn`. Provado por mutação — reinjetando a linha antiga do game.js
         (`if (xrOn && !state.started) startGame(false)`) este caso morre em
         `started`.

         HONESTIDADE SOBRE A TERCEIRA ASSERÇÃO: com a partida parada o `tick`
         retorna antes do `playerUpdate`, então o analógico não andaria de
         qualquer jeito — o que esta linha pega é DERIVA DO RIG (o dreno do
         passo físico, `XR.consumirPasso`, roda mesmo com a partida parada, e
         um menu que empurrasse o rig apareceria aqui). A prova de que a
         captura de entrada é devolvida está no caso "o jogador anda depois de
         começar pelo menu", onde o número mede o jogo rodando. */
      const r = await h.play(async () => {
        const antes = window.__M.pos();
        window.__A.stick('left', 0, -1);
        await window.__A.espera(1500);
        window.__A.solta();
        await window.__M.esperar(4);
        const j = window.__M.jogo();
        return {
          started: j.started, paused: j.paused, aberto: window.__M.estado().aberto,
          andou: Math.hypot(window.__M.pos()[0] - antes[0], window.__M.pos()[2] - antes[2]),
        };
      });
      assert.equal(r.started, false,
        'a partida começou sozinha no menu — é o `startGame(false)` forçado de volta');
      assert.equal(r.aberto, true, 'o menu fechou sozinho: o jogador ficaria de pé no mundo sem tela');
      assert.ok(r.andou <= 0.10,
        `o jogador andou ${r.andou.toFixed(3)} m com o menu aberto — o menu não capturou a entrada`);
      console.log(`      1,5 s de analógico no talo dentro do menu: ${(r.andou * 1000).toFixed(0)} mm`);
    });

    it('o menu oferece SOLO, MULTIJOGADOR, as opções de conforto e a saída', async () => {
      const r = await h.play(() => ({ ids: window.__M.ids(), e: window.__M.estado() }));
      for (const id of ['solo', 'multi', 'giroModo', 'vinheta', 'recentrar', 'sairVR']) {
        assert.ok(r.ids.includes(id),
          `o menu principal não oferece "${id}": ${r.ids.join(', ')}`);
      }
      /* as opções são as MESMAS do painel de pausa, não uma segunda lista */
      assert.ok(r.ids.includes('passo') || r.ids.includes('velocidade'),
        `o menu não oferece o ajuste do giro: ${r.ids.join(', ')}`);
      assert.equal(r.e.modo, 'menu');
      assert.equal(r.e.aba, 'pausa', 'o menu abriu numa aba social: SOLO e MULTIJOGADOR ficariam escondidos');
      console.log(`      linhas do menu: ${r.ids.join(' · ')}`);
    });

    it('fica a ~1,0 m, dentro do terço central, com texto acima de 0,7°', async () => {
      const e = await h.play(() => window.__M.estado());
      console.log(`      menu a ${e.distancia.toFixed(3)} m · ${e.grausH.toFixed(1)}° × ${e.grausV.toFixed(1)}°` +
        ` · linha ${e.grausLinha.toFixed(2)}° · texto ${e.grausTexto.toFixed(2)}°`);
      assert.ok(e.distancia >= 0.75 && e.distancia <= 1.25,
        `menu a ${e.distancia.toFixed(3)} m — fora da faixa de leitura (Oculus BP: nada abaixo de 0,75 m)`);
      assert.ok(e.grausH >= 20 && e.grausH <= 36.7,
        `o menu ocupa ${e.grausH.toFixed(1)}° na horizontal — fora do terço central da vista`);
      assert.ok(e.grausTexto >= 0.7,
        `texto com ${e.grausTexto.toFixed(2)}° — abaixo do alvo de 0,7° (Microsoft/Android XR)`);
      /* alvo de apontar: o Oculus BP manda os itens serem "large and
         well-spaced enough for users to accurately target them" com raio */
      assert.ok(e.grausLinha >= 2.0,
        `cada linha ocupa ${e.grausLinha.toFixed(2)}° — alvo pequeno demais para o raio da mão`);
    });

    it('o botão de menu NÃO fecha o menu principal (não existe estado sem saída)', async () => {
      /* Fechar antes da partida deixaria o jogador de pé no mundo, sem tela
         nenhuma e sem jogo: é o beco do critério I4. Falha se alguém tratar o
         menu principal como a pausa. */
      const r = await h.play(async () => {
        await window.__M.paraLonge();
        await window.__M.botaoMenu();
        await window.__M.esperar(4);
        const e = window.__M.estado();
        return { aberto: e.aberto, modo: e.modo, started: window.__M.jogo().started };
      });
      assert.equal(r.aberto, true, 'o clique do analógico fechou o menu principal — beco sem saída (I4)');
      assert.equal(r.modo, 'menu');
      assert.equal(r.started, false, 'o menu virou partida');
    });

    it('apontar marca a linha apontada — e as notas de estado não são botões', async () => {
      const r = await h.play(async () => {
        const fora = [];
        for (const l of window.__M.estado().linhas) {
          window.__M.apontar('right', l.centro);
          await window.__M.esperar(4);
          const e = window.__M.estado();
          fora.push({ pedido: l.id, tipo: l.tipo, lido: e.item && e.item.id });
        }
        return fora;
      });
      for (const x of r) {
        if (x.tipo === 'nota') {
          assert.equal(x.lido, null,
            `a nota "${x.pedido}" foi marcada como alvo — nota de estado não é botão`);
        } else {
          assert.equal(x.lido, x.pedido, `apontei para "${x.pedido}" e o menu marcou "${x.lido}"`);
        }
      }
      console.log(`      ${r.length} linhas apontadas, ${r.filter(x => x.lido === x.pedido).length} acertos`);
    });

    it('MULTIJOGADOR abre o LOBBY (a aba SALA) e NÃO começa a partida', async () => {
      /* "não vê o lobby antes de entrar" era metade da queixa. O lobby já
         existe como aba do painel (js/xr/xrsocial.js): o menu leva até ela em
         vez de duplicar a sala numa segunda tela. */
      const r = await h.play(async () => {
        await window.__M.mirar('multi');
        const marcou = window.__M.estado().item;
        await window.__M.clicar();
        await window.__M.esperar(4);
        const e = window.__M.estado();
        return {
          marcou: marcou && marcou.id, aba: e.aba, chamou: window.__conta.multi,
          started: window.__M.jogo().started, aberto: e.aberto,
        };
      });
      assert.equal(r.marcou, 'multi', 'a linha do multijogador não foi reconhecida');
      assert.equal(r.chamou, 1, 'o clique em MULTIJOGADOR não chamou a ação do jogo');
      assert.equal(r.aba, 'sala', 'MULTIJOGADOR não levou ao lobby: a aba continuou em "' + r.aba + '"');
      assert.equal(r.started, false, 'MULTIJOGADOR começou a partida — quem começa é o anfitrião, no lobby');
      assert.equal(r.aberto, true, 'o painel fechou e o jogador ficou sem lobby');
      console.log(`      MULTIJOGADOR → aba "${r.aba}" (o lobby que já existe), partida ainda parada`);
    });

    it('sem sala no ar, MULTIJOGADOR vira nota de estado e não aceita clique', async () => {
      /* Botão que recusa é pior que botão ausente — regra desta base (a tela
         de morte já ofereceu "JOGAR DE NOVO" numa partida online e a ação
         respondia com um aviso no console). Falha se a linha continuar sendo
         botão com a sala fora do ar. */
      const r = await h.play(async () => {
        const G = window.__game;
        G.XRUI.social.selecionar('pausa');
        await window.__M.esperar(3);
        window.__gate.sala = false;
        await window.__M.esperar(4);
        const l = window.__M.linha('multi');
        const nota = (window.__M.estado().linhas || []).find(x => x.tipo === 'nota');
        const antes = window.__conta.multi;
        let acionou = null;
        if (nota) {
          window.__M.apontar('right', nota.centro);
          await window.__M.esperar(4);
          await window.__M.clicar();
          await window.__M.esperar(3);
          acionou = window.__M.estado().item;
        }
        window.__gate.sala = true;
        await window.__M.esperar(4);
        return {
          virouNota: !l, nota: nota && { id: nota.id, txt: nota.txt },
          marcou: acionou, chamouDepois: window.__conta.multi - antes,
          voltou: !!window.__M.linha('multi'),
        };
      });
      assert.equal(r.virouNota, true, 'com a sala fora do ar o menu manteve o botão de multijogador');
      assert.ok(r.nota, 'a sala fora do ar não foi explicada em lugar nenhum — o jogador só vê a opção sumir');
      assert.equal(r.marcou, null, 'a nota de estado aceitou virar alvo do raio');
      assert.equal(r.chamouDepois, 0, 'a nota de estado disparou a ação de multijogador');
      assert.equal(r.voltou, true, 'a sala voltou ao ar e o botão não voltou');
      console.log(`      sala fora do ar: "${r.nota.txt}" (nota, não botão)`);
    });

    it('as opções de conforto valem ANTES da partida: o giro muda de verdade', async () => {
      /* A2 do criterio-aaa: a preferência de giro só existia em API. Aqui ela
         tem tela ANTES de a partida começar — que é quando alguém configura.
         O efeito medido é o do módulo de giro do jogo, não um contador. */
      const r = await h.play(async () => {
        const G = window.__game;
        const antes = G.XR.giro.prefs.modo;
        await window.__M.mirar('giroModo');
        await window.__M.clicar();
        await window.__M.esperar(4);
        const depois = G.XR.giro.prefs.modo;
        let salvo;
        try { salvo = JSON.parse(window.localStorage.getItem('callofai_vr') || '{}'); } catch { salvo = {}; }
        return { antes, depois, salvo: salvo.modo, started: window.__M.jogo().started };
      });
      assert.notEqual(r.depois, r.antes, `o modo de giro não mudou (continua "${r.antes}")`);
      assert.equal(r.salvo, r.depois, 'a escolha feita no menu não foi persistida');
      assert.equal(r.started, false, 'configurar começou a partida');
      console.log(`      giro no menu: ${r.antes} → ${r.depois} (persistido)`);
    });

    it('o menu custa ZERO draw call a mais: mora no painel que já existe', async () => {
      /* O orçamento é 180 por olho e o castelo mede 374 (docs/vr/perf-xr.md).
         O instrumento é CALIBRADO antes: um "zero" só quer dizer alguma coisa
         se a medição enxergar um custo conhecido no mesmo instante. */
      const r = await h.play(async () => {
        const M = window.__M;
        await M.paraLonge();
        const conhecido = [];
        for (let i = 0; i < 7; i++) {
          M.painelVisivel(true); await M.esperar(2);
          const com = M.drawCalls();
          M.painelVisivel(false); await M.esperar(2);
          conhecido.push(com - M.drawCalls());
        }
        M.painelVisivel(true); await M.esperar(2);
        return {
          conhecido, total: M.drawCalls(),
          objetos: ['xrUiPainel', 'xrUiRaio', 'xrMenuPainel', 'xrMenu'].filter(n => M.naCena(n)),
        };
      });
      const custo = mediana(r.conhecido);
      assert.ok(r.total > 50, `a cena desenhou ${r.total} draw calls — medida cega`);
      /* 2 = a malha do painel × 2 olhos. O raio da mão volta a `visible` no
         frame seguinte (quem o escreve é o `update()` do painel, todo frame),
         então o que a medição de fora consegue apagar é o painel — e são os
         mesmos 2+2 que test/xr-ui.test.js mede para a pausa. O TETO em 4 é o
         que pega a regressão que já aconteceu aqui: material transparente com
         `DoubleSide` é desenhado em DOIS passes e o custo vai a 6+. */
      assert.ok(custo >= 2 && custo <= 4,
        `a UI do menu custou ${custo} draw calls — esperado 2 (malha do painel, × 2 olhos): [${r.conhecido}]`);
      assert.deepEqual(r.objetos, ['xrUiPainel', 'xrUiRaio'],
        `o menu criou objeto próprio na cena: ${r.objetos.join(', ')}`);
      console.log(`      custo do menu (estéreo, diferença pareada): ${custo} draw calls — ` +
        'o mesmo painel de sessão, nenhum objeto novo');
    });

    it('JOGAR SOLO começa a partida e o menu sai da frente', async () => {
      /* O efeito é do jogo: `startGame` é o escritor único de `state.started`,
         e `setPaused(false)` é o que devolve o analógico ao jogador. */
      const r = await h.play(async () => {
        await window.__M.mirar('solo');
        const marcou = window.__M.estado().item;
        await window.__M.clicar();
        await window.__M.esperar(6);
        const j = window.__M.jogo();
        return {
          marcou: marcou && marcou.id, chamou: window.__conta.solo,
          started: j.started, paused: j.paused, aberto: window.__M.estado().aberto,
        };
      });
      assert.equal(r.marcou, 'solo', 'a linha do solo não foi reconhecida');
      assert.equal(r.chamou, 1, 'o clique em JOGAR SOLO não chamou a ação do jogo');
      assert.equal(r.started, true, 'JOGAR SOLO não começou a partida');
      assert.equal(r.paused, false, 'a partida começou pausada — o analógico não moveria ninguém');
      assert.equal(r.aberto, false, 'o menu ficou na frente do jogo depois de começar a partida');
    });

    it('o jogador anda depois de começar pelo menu (a captura de entrada foi devolvida)', async () => {
      const r = await h.play(async () => {
        const antes = window.__M.pos();
        window.__A.stick('left', 0, -1);
        await window.__A.espera(1500);
        window.__A.solta();
        await window.__M.esperar(4);
        const d = window.__M.pos();
        return { andou: Math.hypot(d[0] - antes[0], d[2] - antes[2]) };
      });
      assert.ok(r.andou > 0.3,
        `o jogador andou só ${r.andou.toFixed(3)} m depois de começar pelo menu — a captura ficou presa`);
      console.log(`      1,5 s de analógico depois do SOLO: ${r.andou.toFixed(2)} m`);
    });

    it('SAIR DO VR encerra a sessão — a saída que a loja exige (F5)', async () => {
      /* ÚLTIMO de propósito: encerra a sessão imersiva. Contador provaria só
         que a função foi chamada; o que importa é o jogador realmente sair. */
      const r = await h.play(async () => {
        window.__M.aoMenu();
        window.__M.replantar();
        await window.__M.esperar(6);
        const tinha = !!window.__M.linha('sairVR');
        await window.__M.mirar('sairVR');
        await window.__M.clicar();
        await window.__A.espera(800);
        return { tinha, chamou: window.__conta.sairVR, presenting: window.__game.XR.presenting };
      });
      assert.equal(r.tinha, true, 'o menu principal não oferece saída do VR');
      assert.equal(r.chamou, 1, 'SAIR DO VR não chamou a ação');
      assert.equal(r.presenting, false,
        'acionar SAIR DO VR não encerrou a sessão: o jogador continuaria preso dentro do headset');
    });

    it('sem erro de console durante a sessão inteira (I2)', async () => {
      assert.deepEqual(h.pageErrors, [], 'erro de página durante a sessão');
      assert.deepEqual(h.consoleErrors, [], 'erro de console durante a sessão');
    });
  });
