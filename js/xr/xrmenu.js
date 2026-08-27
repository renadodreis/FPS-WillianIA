/* ================================================================
   O MENU PRINCIPAL DENTRO DO MUNDO — o que vem ANTES da partida.

   POR QUE ISTO EXISTE. O game.js chamava `startGame(false)` assim que a sessão
   imersiva subia, com o comentário dizendo por quê: o menu é DOM, DOM não é
   desenhado dentro de uma sessão `immersive-vr`, e quem entrasse ficava de pé
   no mundo com `started` falso — sem nada para apertar. Começar à força era o
   único estado alcançável. O preço era o jogador não ESCOLHER NADA: nem solo
   nem multijogador, sem ver o lobby, sem configurar. É o critério F5 do
   docs/vr/criterio-aaa.md ("o jogador chega ao menu, escolhe modo, entra em
   partida, joga, morre, volta ao menu e sai — sem tirar o aparelho") e o I4
   ("nenhum estado sem saída"). A pesquisa está em docs/vr/referencia-menu.md.

   CINCO DECISÕES QUE SÃO CONTRATO, NÃO GOSTO
   ------------------------------------------

   1. ISTO NÃO É UMA SEGUNDA TELA — É UM MODO DO PAINEL QUE JÁ EXISTE. O painel
      de sessão (js/xr/xrui.js) já resolveu ancoragem com amortecimento,
      distância de 1,0 m, raio da mão, realce, repintura por assinatura e abas.
      Um segundo objeto flutuante custaria mais 2 draw calls POR OLHO num
      orçamento que está em 374 contra teto de 180 (docs/vr/perf-xr.md), e
      duplicaria a máquina de painel — duas cópias divergem em silêncio. Este
      módulo é só a LISTA DE LINHAS de antes da partida e o que cada uma faz;
      quem pinta, aponta e aciona continua sendo o painel. Custo: ZERO draw
      call a mais, e zero `Object3D` (que gastaria 4 números do `Math.random`
      seedado no UUID — a ordem de consumo é contrato do worldgen).

   2. AS OPÇÕES SÃO AS MESMAS, LITERALMENTE. Giro, velocidade de locomoção,
      vinheta e recentrar chegam aqui em `opcoes` — a lista que o painel de
      pausa monta, a mesma instância de linhas. Reescrevê-las aqui daria duas
      telas de opções que divergem no primeiro ajuste. E elas precisam existir
      ANTES da partida: configurar conforto é o que se faz no menu, não no meio
      do tiroteio (VRC.Quest.Accessibility.8 pede múltiplos estilos de
      locomoção; o critério A2 cobra a escolha).

   3. O LOBBY NÃO É REESCRITO AQUI. A sala do BR já é uma aba deste mesmo
      painel (js/xr/xrsocial.js, aba `sala`), com roster, anfitrião e COMEÇAR
      PARTIDA. MULTIJOGADOR só LEVA até ela (`aba: 'sala'`) — daí "não vê o
      lobby antes de entrar" deixar de ser verdade sem uma linha de UI nova.

   4. NENHUM BOTÃO MORTO. Regra desta base, paga caro: a tela de morte já
      ofereceu "JOGAR DE NOVO" numa partida online e a ação recusava com um
      aviso no console. Quando a sala não está no ar, MULTIJOGADOR não vira
      botão travado — vira NOTA DE ESTADO (`tipo: 'nota'`), que o painel pinta
      apagada e o raio não marca. O jogador lê o motivo em vez de clicar num
      botão que não responde. É a mesma informação que o `#menuNotice` do DOM
      dá no monitor.

   5. O MENU NÃO CONHECE O JOGO. Nada de `state`, `socket` ou `startGame` aqui
      dentro: o que ele sabe do mundo chega por `ler()` e o que ele faz sai por
      `acoes` — o mesmo contrato de js/xr/xrsocial.js. É o que permite testar a
      regra ("sem sala não há botão") sem derrubar a rede, e é o que mantém
      este arquivo fora do caminho de qualquer coisa que o game.js reorganize.

   O QUE O JOGADOR VÊ ATRÁS DO PAINEL É O MAPA, E ISSO TAMBÉM É DECISÃO. Fora
   de VR o menu é um passeio de câmera pelo mapa (`MenuCam`); dentro do headset
   esse passeio NÃO roda — arrastar a cabeça de quem está com o aparelho na
   cara é enjoo, e o Oculus Best Practices é literal: "The display should
   respond to the user's movements at all times, without exception. Even in
   menus, when the game is paused, or during cut scenes, users should be able
   to look around." O jogador fica de pé no spawn, com o mundo vivo em volta —
   a sala de espera diegética sai de graça, e o mapa se vê virando a cabeça.
   ================================================================ */

/* Ids das linhas próprias deste módulo. Nomeados de forma a NÃO colidir com as
   do painel de pausa (`sair` lá é "sair da partida"; aqui a saída é do VR). */
export const ID_SOLO = 'solo';
export const ID_MULTI = 'multi';
export const ID_SAIR_VR = 'sairVR';
export const ID_JOGO = 'retomar';       // o painel já sabe fechar nesta linha

const txt = v => (typeof v === 'string' ? v : v == null ? '' : String(v));

function comoLista(v) {
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== 'object') return [];
  if (typeof v[Symbol.iterator] === 'function') return Array.from(v);
  if (typeof v.length === 'number') return Array.prototype.slice.call(v);
  return [];
}

export function createXrMenu({ ler = () => ({}), acoes = {} } = {}) {
  let _ler = typeof ler === 'function' ? ler : () => ({});
  let _acoes = (acoes && typeof acoes === 'object') ? acoes : {};
  let ultimo = null;

  /* O ESTADO DO PORTÃO DO MENU, saneado. Os nomes são os do game.js
     (`MenuGate`) porque é de lá que eles vêm — traduzir dificultaria conferir
     o wiring, que é onde este tipo de bandeira costuma trocar de sentido.
     `pronto` nasce VERDADEIRO: sem leitura o menu é utilizável, senão um
     wiring incompleto deixaria o jogador olhando uma tela morta. */
  function lido() {
    const d = (typeof _ler === 'function' ? _ler() : null) || {};
    return {
      pronto: d.pronto !== false,      // MenuGate.wired: os botões têm dono
      jogando: !!d.jogando,            // state.started
      sala: !!d.sala,                  // existe sala online para usar
      caiu: !!d.caiu,                  // MenuGate.dropped: caiu sem ninguém pedir
      solo: !!d.solo,                  // o jogador escolheu solo e saiu da sala
      voltando: !!d.voltando,          // MenuGate.voltando: reconectando
      quebrado: d.quebrado ? txt(d.quebrado) : null,
    };
  }

  function chamar(nome) {
    const f = _acoes && _acoes[nome];
    if (typeof f !== 'function') return false;
    try { f(); } catch { return false; }
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* AS LINHAS. Montadas a cada leitura porque o que o menu oferece depende do
     estado da sala, e mostrar uma opção que não leva a lugar nenhum é o
     defeito que o item 4 do cabeçalho proíbe. */

  function linhaJogar(s) {
    /* Partida em andamento com o menu na frente é estado de transição (o
       wiring fecha o menu quando `started` sobe). Se ele acontecer mesmo
       assim, a primeira linha tem que ser a VOLTA — nunca um "novo jogo" que
       o `startGame` recusaria em silêncio. */
    if (s.jogando) return { id: ID_JOGO, tipo: 'botao', txt: 'VOLTAR AO JOGO', fecha: true };
    if (!s.pronto) return { id: 'carregando', tipo: 'nota', txt: 'CARREGANDO O MUNDO…' };
    return {
      id: ID_SOLO, tipo: 'botao', dono: 'menu', txt: 'JOGAR SOLO',
      /* mesma informação que o aviso do menu de DOM dá: em solo o jogador NÃO
         está na sala online, e é bom saber disso antes de escolher */
      val: (s.solo && s.sala) ? 'FORA DA SALA' : '',
      fecha: true,
    };
  }

  function linhaSala(s) {
    if (s.jogando || !s.pronto) return null;
    if (s.voltando) return { id: 'salaVoltando', tipo: 'nota', txt: 'VOLTANDO PRA SALA…' };
    if (s.quebrado) return { id: 'salaFora', tipo: 'nota', txt: 'SALA ONLINE NÃO CARREGOU' };
    if (!s.sala) return { id: 'salaFora', tipo: 'nota', txt: 'SALA ONLINE FORA DO AR' };
    if (s.caiu) return { id: 'salaCaiu', tipo: 'nota', txt: 'CONEXÃO COM A SALA CAIU…' };
    /* `aba: 'sala'` é o que leva ao LOBBY que já existe (item 3 do cabeçalho):
       o painel troca para a aba social depois de a ação passar. */
    return {
      id: ID_MULTI, tipo: 'botao', dono: 'menu', aba: 'sala',
      txt: s.solo ? 'VOLTAR PRA SALA' : 'MULTIJOGADOR',
    };
  }

  /* `opcoes` são as linhas de conforto do painel de pausa, recebidas prontas
     (item 2 do cabeçalho). Lista vazia = menu sem opções, que é o que acontece
     se alguém fiar o módulo sem passar nada — e aí a falta aparece na tela em
     vez de virar uma segunda lista divergente. */
  function linhas({ opcoes = [] } = {}) {
    const s = lido();
    const l = [linhaJogar(s)];
    const sala = linhaSala(s);
    if (sala) l.push(sala);
    for (const o of comoLista(opcoes)) if (o && o.id) l.push(o);
    l.push({ id: ID_SAIR_VR, tipo: 'botao', dono: 'menu', txt: 'SAIR DO VR', fecha: true });
    return l;
  }

  /* ---------------------------------------------------------------- */
  /* AÇÕES. Nada de jogo mora aqui: quem sabe entrar em solo, voltar para a
     sala e encerrar a sessão é o game.js, e chega por `acoes`. Devolve o id
     acionado (nunca `true`): o painel usa o id para o tato e para o registro. */
  function acionar(id) {
    if (id === ID_SOLO) return chamar('solo') ? (ultimo = id) : null;
    if (id === ID_MULTI) return chamar('multi') ? (ultimo = id) : null;
    if (id === ID_SAIR_VR) return chamar('sairVR') ? (ultimo = id) : null;
    return null;      // nota de estado ou linha do painel: não é nossa
  }

  /* Só o que MUDA A TELA. Sem isto o painel repintaria 1024 × 768 a cada frame
     ou — pior — não repintaria quando a sala caísse. */
  function assinatura() {
    const s = lido();
    return [s.pronto ? 'p' : '.', s.jogando ? 'j' : '.', s.sala ? 's' : '.',
      s.caiu ? 'c' : '.', s.solo ? '1' : '.', s.voltando ? 'v' : '.',
      s.quebrado || ''].join('|');
  }

  /* A fiação pode chegar depois (a sala do BR só existe quando o socket
     responde). Devolve a anterior, para quem quiser encadear. */
  function conectar({ ler: l, acoes: a } = {}) {
    const antes = { ler: _ler, acoes: _acoes };
    if (typeof l === 'function') _ler = l;
    if (a && typeof a === 'object') _acoes = a;
    return antes;
  }

  return {
    linhas, acionar, assinatura, conectar,
    titulo: () => 'MENU',
    /* leitura para QA: NADA aqui aciona coisa nenhuma — sonda que aciona mede
       a si mesma (a armadilha que já apareceu seis vezes nesta frente). */
    estado() {
      const s = lido();
      return { ...s, ultimoAcionado: ultimo };
    },
  };
}
