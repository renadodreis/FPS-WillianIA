/* ================================================================
   CONVERSA, PLACAR E SALA DENTRO DO MUNDO (as três abas sociais).

   POR QUE ISTO EXISTE. A §7 de docs/vr/referencia-ui.md fechou a rodada
   passada declarando três pendências do critério H1: "Chat, placar e lobby do
   BR — dos 17 itens da lista fechada do H1, estes três continuam só no DOM.
   São texto longo e interação de teclado, e o caminho honesto é o painel de
   sessão ganhar abas — não um quarto objeto." É isso que este arquivo é.

   Dentro de uma sessão `immersive-vr` sem `dom-overlay` o DOM não chega ao
   compositor: o `<input>` do chat (br-game.js, `openChat`) recebe foco e fica
   invisível, o `#brRoster` fica invisível, e o lobby inteiro fica invisível.
   Com o aparelho na cara o jogador não conversa, não vê quem está vivo e não
   entra numa partida.

   QUATRO DECISÕES QUE SÃO CONTRATO, NÃO GOSTO
   -------------------------------------------

   1. NÃO SE DIGITA DURANTE A PARTIDA, E O MOTIVO NÃO É "não dá" — É QUE
      DIGITAR CONGELA O JOGADOR. O teclado do sistema do Horizon OS EXISTE para
      WebXR: `XRSession.isSystemKeyboardSupported` + `focus()` num `<input>`,
      documentado pela Meta e no ar desde o Quest Browser 31.2 (jan/2024). O
      que ele faz é o problema — a spec do WebXR manda a sessão para
      `visible-blurred` enquanto o teclado está de pé, e ali "Input is not
      processed by the XRSession", com as poses dos controles indo a `null`.
      Num battle royale isso é o jogador parado, cego e indefeso enquanto
      escreve. (O `dom-overlay`, esse sim, é recusado fora do `immersive-ar`
      pelo Chromium, e o `XR_META_virtual_keyboard` é OpenXR nativo.)

      Sobra, DENTRO da partida: teclado apontado com o raio, ditado, ou
      mensagem pré-definida. O teclado apontado é medido em 15,4 pal/min
      (Speicher, CHI 2018) contra 36,2 pal/min da MESMA pessoa no celular
      (Palin, MobileHCI 2019) — menos da metade, e as duas mãos ocupadas. Por
      isso a conversa aqui é uma LISTA FECHADA de mensagens rápidas. Duas
      consequências boas de graça: nenhuma delas passa de 20 caracteres (logo
      todas cabem numa linha legível), e nenhuma é texto do jogador (logo não
      há nada para sanear além do que o servidor já sanea).

      O teclado do sistema continua sendo o caminho certo FORA da partida
      (apelido, lobby, tela de morte), onde congelar não custa nada. Isso é
      outra rodada. Fontes, números e a receita em docs/vr/referencia-social-vr.md.

   2. NÃO EXISTE PING NEM MARCADOR NO MUNDO, e isso é ANTI-CHEAT, não escopo.
      A tentação óbvia num battle royale é o ping do Apex ("inimigo aqui"), que
      manda uma COORDENADA. O servidor deste jogo não transmite posição de
      jogador no `roster` de propósito — `server.js`, `roster(withPos)`: "pos
      só no init — broadcast viraria wallhack". Uma UI que criasse esse canal
      estaria distribuindo exatamente o que o anti-cheat retira. As mensagens
      rápidas saem pelo evento `chat` que já existe, que o servidor já limita
      (1200 ms) e já corta em 120 caracteres. Nenhum canal novo.

   3. O PLACAR SÓ MOSTRA O QUE O SERVIDOR JÁ TRANSMITE. Os campos são os do
      `roster()` do server.js — `id, nick, colors, kills, alive, spectator,
      bot` — e entram por uma LISTA BRANCA (`sanear`), não por cópia. Se um dia
      alguém acrescentar posição ao roster, ela não vaza para cá por acidente:
      tem que ser escrita à mão neste arquivo. Há teste cravando isso.

   4. ZERO DRAW CALL, E ISSO É ESTRUTURAL. Este módulo não cria `Object3D`
      nenhum: ele PINTA no canvas que o painel de sessão já tem
      (js/xr/xrui.js), e o painel já custa 2 por olho. Um quarto objeto na cena
      custaria mais 2 num orçamento que está em 508 draw calls contra teto de
      180 (docs/vr/perf-xr.md). Como corolário, nada aqui gasta `Math.random`:
      todo `Object3D` gastaria 4 números do fluxo seedado no UUID e a ordem de
      consumo é contrato do worldgen.

   O TAMANHO DA LISTA É DERIVADO, NÃO CHUTADO. O alvo de altura angular de
   texto em que Microsoft (tipografia em MR) e Android XR convergem é 0,7°,
   com piso absoluto em 0,35°. O painel mede 0,62 × 0,465 m a 1,00 m com
   textura 1024 × 768, então 1 px de canvas = 0,0347° de altura. 0,7° pede
   maiúscula de >= 20,2 px, ou seja fonte >= 28 px (a maiúscula é ~0,72 do
   corpo). Com a faixa de abas ocupando 104 px sobram 664 px de conteúdo:
   linhas de 72 px com fonte 38 dão maiúscula de 27 px = 0,95°, e cabem 7 por
   coluna. DUAS COLUNAS dobram a capacidade sem encolher a letra — é por isso
   que o placar cabe 14 nomes por página em vez de 7, e é por isso que passar
   de 14 vira PÁGINA e nunca fonte menor.

   COMO O PAINEL HOSPEDA ISTO. O contrato com js/xr/xrui.js é pequeno de
   propósito, e quem CHAMA tudo isto é o `update()` do painel — uma vez por
   frame, um condutor só:

     · `pintarAbas(ctx, {w, faixa, titulo})` — a faixa de abas, sempre;
     · `pintar(ctx, {w, h})`          — a tela inteira, quando a aba é social;
     · `apontar(u, v)`                — o (u,v) que o `bater()` do xrui já
                                        calcula. Devolve `null` SÓ quando o
                                        ponto é do dono (corpo do painel na aba
                                        PAUSA); numa aba social o corpo inteiro
                                        é nosso, e o vazio devolve a zona
                                        `fundo`, que não aciona nada. `null`
                                        significa "não é meu", e é assim que o
                                        painel decide se marca linha própria;
     · `soltar()`                     — o raio saiu do painel: esquece o alvo,
                                        senão o gatilho acionaria a última zona
                                        apontada com a mão longe da tela;
     · `acionar()`                    — na borda de subida do gatilho;
     · `assinatura()`                 — para repintar só quando muda;
     · `conectar({ler, enviar, acoes})` — a fiação chega DEPOIS. O painel nasce
                                        junto com o jogo e a sala do BR só
                                        existe quando o socket responde: sem
                                        isto, ou o painel nasceria tarde ou a
                                        conversa nasceria sem servidor.

   A FAIXA DE ABAS TEM UM DONO SÓ. A altura da faixa chega por parâmetro
   (`faixa`) porque quem reserva esse espaço no canvas é o painel: duas cópias
   do mesmo 104 divergiriam em silêncio e o clique cairia uma faixa acima do
   que está desenhado.

   O CANVAS SÓ É REPINTADO QUANDO MUDA. Repintar 1024 × 768 a 72 Hz num
   Snapdragon é queimar o quadro por nada — mesma disciplina do painel de
   sessão e do HUD.
   ================================================================ */

/* Faixa de abas: o MESMO 104 px que o xrui.js já reserva para o título, para
   que hospedar isto não mexa na altura do corpo do painel. */
export const FAIXA_ABAS = 104;
export const CV_W = 1024, CV_H = 768;

export const ABAS = [
  { id: 'pausa', titulo: 'PAUSA' },
  { id: 'chat', titulo: 'CONVERSA' },
  { id: 'placar', titulo: 'PLACAR' },
  { id: 'sala', titulo: 'SALA' },
];

/* MENSAGENS RÁPIDAS — a lista fechada. Oito porque a grade é 4 × 2 e a grade
   é 4 × 2 porque é o que cabe acima de 0,7° de altura angular (ver o
   cabeçalho). Todas em caixa alta e curtas: a leitura em RV é pior que a de
   monitor e o painel fica a um metro.

   O VOCABULÁRIO É DITADO PELO SERVIDOR, NÃO PELO GÊNERO. A primeira versão
   desta lista era de esquadrão ("PRECISO DE AJUDA!", "INIMIGO POR PERTO!",
   "VAMOS!", "ESPERA AÍ") — o modelo do Apex. Ele não cabe aqui, e dá pra
   medir: `server.js` não tem a palavra `team`, `squad`, `equipe`, `duo` nem
   `trio` em lugar nenhum (é todos contra todos), e `socket.on('chat')`
   termina em `io.emit('chat', …)` — o chat é GLOBAL. Ou seja: não existe
   aliado para pedir ajuda, e "INIMIGO POR PERTO" seria avisado ao próprio
   inimigo. O precedente que serve é o quick chat do Rocket League, que também
   é global e também atravessa lados: reação, elogio, cortesia.

   Nenhuma delas nomeia lugar: dizer ONDE é o que o servidor não autoriza (ver
   a decisão 2 do cabeçalho). */
export const RAPIDAS = [
  'OI, PESSOAL!',
  'BORA COMEÇAR!',
  'QUE TIRO!',
  'ESSA DOEU',
  'QUASE!',
  'VALEU!',
  'FOI MAL',
  'BOM JOGO',
];

/* O servidor descarta mensagem a menos de 1200 ms da anterior (server.js,
   `socket.on('chat')`) e não avisa ninguém. Segurar aqui, com folga, é o que
   evita o pior defeito de UI possível: o jogador escolhe, nada acontece, e
   ele não sabe se foi ele, a rede ou o jogo. */
export const INTERVALO_MS = 1300;

/* Capacidades por página, derivadas do orçamento angular (ver cabeçalho). */
export const LINHAS_PLACAR = 7;     // por coluna; 2 colunas = 14 por página
export const LINHAS_SALA = 6;       // por coluna; 2 colunas = 12 por página
export const LINHAS_LOG = 4;        // mensagens visíveis na aba de conversa
export const MAX_LOG = 40;          // memória do histórico, em mensagens

const COR = {
  fundo: 'rgba(8,12,18,0.90)',
  borda: 'rgba(157,216,255,0.55)',
  titulo: '#9dd8ff',
  texto: '#e6eef7',
  fraco: '#8fa3b8',
  destaque: '#9dffb8',
  valor: '#ffd7a0',
  eu: '#ffd76a',
  morto: '#7c8794',
  realce: 'rgba(92,226,122,0.16)',
  abaAtiva: 'rgba(157,216,255,0.18)',
};

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const txt = v => (typeof v === 'string' ? v : v == null ? '' : String(v));
const corta = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/* LISTA BRANCA do jogador. Não é `{...p}` de propósito: ver a decisão 3 do
   cabeçalho. Um campo novo no roster do servidor NÃO aparece aqui sozinho. */
function sanear(p) {
  return {
    id: txt(p && p.id),
    nick: corta(txt(p && p.nick) || '???', 14),
    kills: Math.max(0, Math.round(num(p && p.kills))),
    alive: !!(p && p.alive),
    spectator: !!(p && p.spectator),
    bot: !!(p && p.bot),
  };
}

function comoLista(v) {
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== 'object') return [];
  if (typeof v[Symbol.iterator] === 'function') return Array.from(v);
  if (typeof v.length === 'number') return Array.prototype.slice.call(v);
  return [];
}

export function createXrSocial({
  ler = () => ({}),
  enviar = null,
  acoes = {},
  agora = () => (typeof performance !== 'undefined' && performance.now
    ? performance.now() : Date.now()),
  /* altura da faixa de abas, em px de canvas. Vem do painel (ver o cabeçalho):
     é ele que reserva o espaço, então é ele que diz quanto. */
  faixa = FAIXA_ABAS,
} = {}) {
  const FAIXA = Math.max(1, Math.round(num(faixa) || FAIXA_ABAS));
  let _ler = typeof ler === 'function' ? ler : () => ({});
  let _enviar = typeof enviar === 'function' ? enviar : null;
  let _acoes = (acoes && typeof acoes === 'object') ? acoes : {};
  let aba = 'pausa';
  let pagina = 0;
  let sob = null;                       // zona sob o ponteiro
  let jogadores = [];                   // já saneados
  let hostId = '', fase = '', vivos = 0;
  const log = [];                       // { nick, msg, sys }
  let ultimoEnvio = -1e9;
  let zonasCache = null, zonasChave = '';

  /* ---------------------------------------------------------------- */
  /* ENTRADA DE DADOS. Os dois vêm do wiring, e os dois passam por filtro. */

  function roster(d) {
    jogadores = comoLista(d && d.players).map(sanear);
    hostId = txt(d && d.hostId);
    fase = txt(d && d.phase);
    vivos = d && Number.isFinite(d.aliveCount)
      ? Math.max(0, Math.round(d.aliveCount))
      : jogadores.filter(p => p.alive).length;
    pagina = 0;
    zonasCache = null;
  }

  function receber(d) {
    const msg = corta(txt(d && d.msg), 120);
    if (!msg) return false;
    log.push({ nick: corta(txt(d && d.nick) || '', 14), msg, sys: !!(d && d.sys) });
    while (log.length > MAX_LOG) log.shift();
    zonasCache = null;
    return true;
  }

  /* ---------------------------------------------------------------- */
  const eu = () => {
    const e = (_ler() || {}).eu;
    return (e && txt(e.id)) || '';
  };
  const souAnfitriao = () => !!hostId && hostId === eu();
  const bloqueado = () => (agora() - ultimoEnvio) < INTERVALO_MS;

  /* placar: vivos na frente, e entre eles quem tem mais abates. É a mesma
     ordem do `#brRoster` do DOM (br-game.js: filtra vivos, ordena por kills),
     só que sem jogar os mortos fora — em VR não há um segundo lugar pra ver
     quem já caiu. */
  function ordenados() {
    return jogadores.slice().sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      if (b.kills !== a.kills) return b.kills - a.kills;
      return a.nick.localeCompare(b.nick);
    });
  }

  const paginas = (n, porPagina) => Math.max(1, Math.ceil(n / porPagina));

  /* ---------------------------------------------------------------- */
  /* LAYOUT. Puro: nada aqui mede texto nem toca em canvas, por isso `zonas()`
     vale antes de qualquer pintura. É o que permite ao anfitrião perguntar o
     que está sob o raio no MESMO frame em que abre a aba. */

  function zonasAbas() {
    const larg = CV_W / ABAS.length;
    return ABAS.map((a, i) => ({
      id: 'aba:' + a.id, tipo: 'aba', txt: a.titulo, dados: null,
      x0: i * larg, y0: 0, x1: (i + 1) * larg, y1: FAIXA,
    }));
  }

  /* grade de duas colunas — a decisão que dobra a capacidade sem encolher a
     letra (ver o cabeçalho) */
  function grade(itens, { y0, linhas, altura, faz }) {
    const out = [];
    const colL = (CV_W - 36) / 2;
    for (let i = 0; i < itens.length && i < linhas * 2; i++) {
      const col = Math.floor(i / linhas), lin = i % linhas;
      const x0 = 12 + col * (colL + 12);
      const y = y0 + lin * altura;
      out.push({ ...faz(itens[i], i), x0, y0: y, x1: x0 + colL, y1: y + altura - 4 });
    }
    return out;
  }

  /* Cabeçalho em DUAS zonas (esquerda grande, direita pequena) para que as
     duas sejam medidas separadamente: uma zona só esconderia texto pequeno
     atrás de texto grande na hora de medir a altura angular. */
  function zonasCabecalho(esq, dir) {
    const out = [{ id: 'cab', tipo: 'cabecalho', txt: esq, dados: null,
      x0: 24, y0: 110, x1: 640, y1: 172 }];
    if (dir) {
      out.push({ id: 'cabDir', tipo: 'cabecalho', txt: dir, dados: null,
        x0: 660, y0: 110, x1: CV_W - 24, y1: 172 });
    }
    return out;
  }

  function zonaPagina(p, nPag, y0, y1) {
    return {
      id: 'pagina', tipo: 'pagina', dados: null,
      txt: '◀  ' + (p + 1) + ' / ' + nPag + '  ▶',
      x0: 12, y0, x1: CV_W - 12, y1,
    };
  }

  function zonasChat() {
    const out = zonasCabecalho('MENSAGENS RECEBIDAS',
      bloqueado() ? 'AGUARDE…' : 'ESCOLHA UMA');
    const vis = log.slice(-LINHAS_LOG);
    for (let i = 0; i < vis.length; i++) {
      const m = vis[i];
      out.push({
        id: 'log:' + i, tipo: 'log', dados: null,
        txt: m.sys ? m.msg : (m.nick + ': ' + m.msg),
        sys: m.sys,
        x0: 24, y0: 180 + i * 67, x1: CV_W - 24, y1: 180 + (i + 1) * 67 - 4,
      });
    }
    out.push(...grade(RAPIDAS, {
      y0: 464, linhas: 4, altura: 74,
      faz: (m, i) => ({ id: 'rapida:' + i, tipo: 'rapida', txt: m, dados: null }),
    }));
    return out;
  }

  function zonasPlacar() {
    const d = _ler() || {};
    const lista = ordenados();
    const porPagina = LINHAS_PLACAR * 2;
    const nPag = paginas(lista.length, porPagina);
    const p = Math.min(pagina, nPag - 1);
    const fatia = lista.slice(p * porPagina, (p + 1) * porPagina);
    const meu = eu();
    const out = zonasCabecalho(vivos + ' VIVOS' + (fase ? ' · ' + fase : ''), txt(d.tempo));
    out.push(...grade(fatia, {
      y0: 180, linhas: LINHAS_PLACAR, altura: 72,
      faz: (j, i) => ({
        id: 'jog:' + (p * porPagina + i), tipo: 'jogador',
        txt: (j.alive ? '' : '† ') + j.nick + (j.id === meu ? ' (você)' : ''),
        dados: j,
      }),
    }));
    if (nPag > 1) out.push(zonaPagina(p, nPag, 692, 756));
    return out;
  }

  function zonasSala() {
    const d = _ler() || {};
    const lista = jogadores.slice();
    const porPagina = LINHAS_SALA * 2;
    const nPag = paginas(lista.length, porPagina);
    const p = Math.min(pagina, nPag - 1);
    const fatia = lista.slice(p * porPagina, (p + 1) * porPagina);
    const out = zonasCabecalho(
      'SALA' + (d.partida ? ' #' + d.partida : '') + ' · ' + lista.length + ' AQUI',
      souAnfitriao() ? 'VOCÊ É O ANFITRIÃO'
        : (hostId ? 'AGUARDANDO O ANFITRIÃO' : 'SALA SEM ANFITRIÃO'));
    out.push(...grade(fatia, {
      y0: 180, linhas: LINHAS_SALA, altura: 72,
      faz: (j, i) => ({
        id: 'sala:' + (p * porPagina + i), tipo: 'jogador',
        txt: j.nick + (j.id === hostId ? ' ♛' : '') + (j.spectator ? ' (espectador)' : ''),
        dados: j,
      }),
    }));
    if (nPag > 1) out.push(zonaPagina(p, nPag, 616, 676));
    /* COMEÇAR PARTIDA só para o anfitrião, e é a mesma regra do lobby de DOM
       (`btn.disabled = !isHost`). Botão que recusa é pior que botão ausente:
       na rodada passada a tela de morte oferecia JOGAR DE NOVO em partida
       online e a ação respondia com um aviso no console.

       72 px de altura NÃO é enfeite: a 1,0 m isso é 4,4 cm = 2,5° de alvo, e
       apontar com o raio da mão a um metro tem tremor de fração de grau. */
    const colL = (CV_W - 36) / 2;
    if (souAnfitriao()) {
      out.push({
        id: 'comecar', tipo: 'botao', txt: 'COMEÇAR PARTIDA', dados: null,
        x0: 12, y0: 684, x1: 12 + colL, y1: 756,
      });
    }
    out.push({
      id: 'sair', tipo: 'botao', txt: 'SAIR DA PARTIDA', dados: null,
      x0: 24 + colL, y0: 684, x1: 24 + colL * 2, y1: 756,
    });
    return out;
  }

  /* Chave do LAYOUT — de propósito mais estreita que a assinatura de pintura:
     passar o ponteiro por cima muda a tela, mas não muda onde as coisas
     ficam, e refazer a lista a cada frame de hover seria lixo por nada. */
  function chaveLayout() {
    const d = _ler() || {};
    return aba + '|' + pagina + '|' + hostId + '|' + eu() + '|' + vivos + '|' + fase +
      '|' + txt(d.tempo) + '|' + txt(d.partida) + '|' + (bloqueado() ? 'x' : '.') +
      '|' + jogadores.map(p =>
      p.nick + ':' + p.kills + (p.alive ? 'v' : 'm') + (p.spectator ? 'e' : '')).join(',') +
      '|' + log.slice(-LINHAS_LOG).map(m => (m.sys ? '!' : m.nick) + ':' + m.msg).join('/');
  }

  function zonas() {
    const chave = chaveLayout();
    if (zonasCache && chave === zonasChave) return zonasCache;
    const corpo = aba === 'chat' ? zonasChat()
      : aba === 'placar' ? zonasPlacar()
        : aba === 'sala' ? zonasSala() : [];
    zonasCache = zonasAbas().concat(corpo);
    zonasChave = chave;
    return zonasCache;
  }

  /* A zona que não faz nada, e que existe justamente para dizer "este pedaço
     de tela é MEU". Sem ela, o vazio entre duas linhas de uma aba social
     devolveria `null` e o painel entenderia "não é dele": marcaria e acionaria
     a PRÓPRIA linha (RETOMAR, SAIR DA PARTIDA) por baixo do placar desenhado.
     Botão invisível é o pior tipo de botão. */
  const FUNDO = { id: 'fundo', tipo: 'fundo', txt: '', dados: null,
    x0: 0, y0: FAIXA, x1: CV_W, y1: CV_H };

  /* ---------------------------------------------------------------- */
  /* APONTAR. (u,v) normalizados do painel — exatamente o que o `bater()` do
     xrui.js já devolve. Na aba PAUSA o corpo do painel NÃO é nosso: devolver
     algo ali comeria o clique de RETOMAR/SAIR do menu do jogo. */
  function apontar(u, v) {
    const x = num(u) * CV_W, y = num(v) * CV_H;
    if (y <= FAIXA) {
      sob = zonasAbas().find(z => x >= z.x0 && x < z.x1) || null;
      return sob;
    }
    if (aba === 'pausa') { sob = null; return null; }
    sob = zonas().find(z => z.tipo !== 'aba' &&
      x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) || FUNDO;
    return sob;
  }

  /* O raio saiu do painel. Sem isto o alvo antigo fica de pé: o jogador tira a
     mão da tela, puxa o gatilho para atirar e manda "BOM JOGO" — ou pior, sai
     da partida. */
  function soltar() { sob = null; }

  /* A FIAÇÃO CHEGA DEPOIS (ver o cabeçalho). Devolve a fiação anterior para
     que quem conecta possa encadear em vez de substituir. */
  function conectar({ ler: l, enviar: e, acoes: a } = {}) {
    const antes = { ler: _ler, enviar: _enviar, acoes: _acoes };
    if (typeof l === 'function') _ler = l;
    if (typeof e === 'function') _enviar = e;
    if (a && typeof a === 'object') _acoes = a;
    zonasCache = null;
    return antes;
  }

  function chamar(nome) {
    const f = _acoes && _acoes[nome];
    if (typeof f !== 'function') return false;
    try { f(); } catch { return false; }
    return true;
  }

  function enviarRapida(i) {
    const m = RAPIDAS[i];
    if (!m) return false;
    if (bloqueado()) return false;      // o servidor descartaria em silêncio
    if (typeof _enviar !== 'function') return false;
    ultimoEnvio = agora();
    try { _enviar(m); } catch { return false; }
    return true;
  }

  /* Aciona o que estiver sob o ponteiro. Devolve o id acionado, ou null —
     nunca `true`: quem chama (o painel) usa o id para o tato e para o log. */
  function acionar() {
    if (!sob) return null;
    const id = sob.id;
    if (sob.tipo === 'aba') { selecionar(id.slice(4)); return id; }
    if (sob.tipo === 'rapida') {
      return enviarRapida(parseInt(id.slice(7), 10)) ? id : null;
    }
    if (sob.tipo === 'pagina') {
      const lista = aba === 'sala' ? jogadores : ordenados();
      const porPagina = (aba === 'sala' ? LINHAS_SALA : LINHAS_PLACAR) * 2;
      pagina = (pagina + 1) % paginas(lista.length, porPagina);
      zonasCache = null;
      return id;
    }
    if (id === 'comecar') return chamar('comecar') ? id : null;
    if (id === 'sair') return chamar('sair') ? id : null;
    return null;    // linha de leitura (log, jogador, nota): não faz nada
  }

  function selecionar(qual) {
    const achou = ABAS.find(a => a.id === qual);
    if (!achou) return false;
    if (aba !== achou.id) { aba = achou.id; pagina = 0; sob = null; zonasCache = null; }
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* ASSINATURA. Só o que MUDA A TELA entra: o intervalo do envio entra como
     booleano (não como milissegundos restantes), senão o painel repintaria
     1024 × 768 todo frame durante 1,3 s. */
  function assinatura() {
    const d = _ler() || {};
    const base = aba + '|' + pagina + '|' + (sob ? sob.id : '');
    if (aba === 'pausa') return base;
    if (aba === 'chat') {
      return base + '|' + (bloqueado() ? 'x' : '.') + '|' +
        log.slice(-LINHAS_LOG).map(m => (m.sys ? '!' : m.nick) + ':' + m.msg).join('/');
    }
    const gente = jogadores.map(p =>
      p.nick + ':' + p.kills + (p.alive ? 'v' : 'm') + (p.spectator ? 'e' : '')).join(',');
    if (aba === 'placar') {
      return base + '|' + vivos + '|' + fase + '|' + txt(d.tempo) + '|' + gente;
    }
    return base + '|' + fase + '|' + hostId + '|' + txt(d.partida) + '|' + gente;
  }

  /* ---------------------------------------------------------------- */
  /* PINTURA. Um canvas só, o do painel: por isso o custo é zero draw call.
     As fontes vêm do orçamento angular do cabeçalho — mexer nelas sem refazer
     a conta é como o texto some do headset sem sumir do monitor. */

  function pintarAbas(ctx, { w = CV_W, faixa = FAIXA, titulo = '' } = {}) {
    const larg = w / ABAS.length;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    for (let i = 0; i < ABAS.length; i++) {
      const x = i * larg, ativa = ABAS[i].id === aba;
      const focada = sob && sob.id === 'aba:' + ABAS[i].id;
      if (ativa) { ctx.fillStyle = COR.abaAtiva; ctx.fillRect(x + 3, 3, larg - 6, faixa - 6); }
      else if (focada) { ctx.fillStyle = COR.realce; ctx.fillRect(x + 3, 3, larg - 6, faixa - 6); }
      ctx.font = 'bold 40px system-ui, sans-serif';
      ctx.fillStyle = ativa ? COR.titulo : focada ? COR.destaque : COR.fraco;
      /* o rótulo da PRIMEIRA aba é do painel, não nosso: morto, ela deixa de
         ser "PAUSA" e vira a tela de morte. Quem sabe disso é o xrui.js. */
      ctx.fillText((i === 0 && titulo) ? titulo : ABAS[i].titulo,
        x + larg / 2, faixa / 2, larg - 24);
      if (i > 0) {
        ctx.strokeStyle = 'rgba(157,216,255,0.22)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, 14); ctx.lineTo(x, faixa - 14); ctx.stroke();
      }
    }
    ctx.strokeStyle = COR.borda;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, faixa); ctx.lineTo(w, faixa); ctx.stroke();
  }

  function fundo(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COR.fundo;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = COR.borda;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  }

  function realce(ctx, z) {
    if (!sob || sob.id !== z.id) return;
    ctx.fillStyle = COR.realce;
    ctx.fillRect(z.x0, z.y0 + 2, z.x1 - z.x0, z.y1 - z.y0 - 4);
  }

  function pintarCabecalho(ctx, z) {
    const meio = (z.y0 + z.y1) / 2;
    if (z.id === 'cab') {
      ctx.font = 'bold 42px system-ui, sans-serif';
      ctx.textAlign = 'left'; ctx.fillStyle = COR.titulo;
      ctx.fillText(z.txt, z.x0, meio, z.x1 - z.x0);
    } else {
      ctx.font = 'bold 34px system-ui, sans-serif';
      ctx.textAlign = 'right'; ctx.fillStyle = COR.valor;
      ctx.fillText(z.txt, z.x1, meio, z.x1 - z.x0);
    }
  }

  function pintarLog(ctx, z) {
    ctx.font = '40px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = z.sys ? COR.valor : COR.texto;
    ctx.fillText(corta(z.txt, 46), z.x0 + 4, (z.y0 + z.y1) / 2, z.x1 - z.x0 - 8);
  }

  function pintarRapida(ctx, z) {
    realce(ctx, z);
    ctx.strokeStyle = 'rgba(157,216,255,0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(z.x0, z.y0 + 2, z.x1 - z.x0, z.y1 - z.y0 - 4);
    ctx.font = 'bold 38px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = bloqueado() ? COR.morto
      : (sob && sob.id === z.id) ? COR.destaque : COR.texto;
    ctx.fillText(z.txt, (z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2, z.x1 - z.x0 - 24);
  }

  function pintarLinhaJogador(ctx, z, comAbates) {
    realce(ctx, z);
    const j = z.dados;
    ctx.font = 'bold 38px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = j.id === eu() ? COR.eu : j.alive ? COR.texto : COR.morto;
    ctx.fillText(z.txt, z.x0 + 8, (z.y0 + z.y1) / 2, (z.x1 - z.x0) - (comAbates ? 130 : 16));
    if (comAbates) {
      ctx.textAlign = 'right';
      ctx.fillStyle = j.alive ? COR.valor : COR.morto;
      ctx.fillText('☠ ' + j.kills, z.x1 - 8, (z.y0 + z.y1) / 2, 120);
    }
  }

  function pintarPagina(ctx, z) {
    realce(ctx, z);
    ctx.font = 'bold 38px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = (sob && sob.id === z.id) ? COR.destaque : COR.fraco;
    ctx.fillText(z.txt, (z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2, z.x1 - z.x0);
  }

  function pintarBotao(ctx, z) {
    realce(ctx, z);
    ctx.strokeStyle = 'rgba(157,216,255,0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(z.x0, z.y0 + 2, z.x1 - z.x0, z.y1 - z.y0 - 4);
    ctx.font = 'bold 38px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = (sob && sob.id === z.id) ? COR.destaque : COR.texto;
    ctx.fillText(z.txt, (z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2, z.x1 - z.x0 - 20);
  }

  /* Uma passagem só sobre as zonas: o que está desenhado é EXATAMENTE o que
     está clicável. Pintar por um caminho e mapear o clique por outro é como
     nascem os botões que não respondem onde parecem estar. */
  function pintar(ctx, { w = CV_W, h = CV_H, titulo = '' } = {}) {
    if (!ctx) return false;
    const zs = zonas();
    fundo(ctx, w, h);
    pintarAbas(ctx, { w, faixa: FAIXA, titulo });
    ctx.textBaseline = 'middle';
    if (aba === 'chat' && !log.length) {
      ctx.font = '38px system-ui, sans-serif';
      ctx.textAlign = 'left'; ctx.fillStyle = COR.fraco;
      ctx.fillText('ninguém falou nada ainda', 28, 214, CV_W - 56);
    }
    if (aba === 'chat') {
      ctx.strokeStyle = 'rgba(157,216,255,0.30)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(24, 452); ctx.lineTo(CV_W - 24, 452); ctx.stroke();
    }
    for (const z of zs) {
      if (z.tipo === 'cabecalho') pintarCabecalho(ctx, z);
      else if (z.tipo === 'log') pintarLog(ctx, z);
      else if (z.tipo === 'rapida') pintarRapida(ctx, z);
      else if (z.tipo === 'jogador') pintarLinhaJogador(ctx, z, aba === 'placar');
      else if (z.tipo === 'pagina') pintarPagina(ctx, z);
      else if (z.tipo === 'botao') pintarBotao(ctx, z);
    }
    return true;
  }

  return {
    roster, receber, apontar, soltar, acionar, selecionar, zonas, assinatura,
    conectar, pintar, pintarAbas,
    get aba() { return aba; },
    get pagina() { return pagina; },
    get sob() { return sob; },
    /* leitura para QA: NADA aqui aciona coisa nenhuma — sonda que aciona mede
       a si mesma (a armadilha que já apareceu seis vezes nesta frente). */
    estado() {
      return {
        aba, pagina, vivos, fase, anfitriao: souAnfitriao(),
        jogadores: jogadores.length, mensagens: log.length,
        bloqueado: bloqueado(),
      };
    },
  };
}
