/* ================================================================
   POLÍTICA DE VELOCIDADE E ACELERAÇÃO DENTRO DA SESSÃO XR.

   Módulo PURO: sem DOM, sem three, sem `Object3D` (todo `Object3D` gasta
   4 números do `Math.random` seedado no UUID, e a ordem de consumo é
   contrato do worldgen).

   O PROBLEMA, medido em sessão imersiva antes de escrever uma linha
   (test/xr-locomotion.test.js reproduz):

     andar ........ 5,200 m/s     correr ....... 8,600 m/s
     agachado ..... 2,600 m/s     mirando ...... 3,400 m/s
     rampa até 95 % da velocidade ......... 270 ms   (k = 11 → 3/k)
     parada até 5 % da velocidade ......... 293 ms

   Uma caminhada humana é ~1,4 m/s e uma corrida ~2,8 m/s. O jogo ANDA
   mais rápido do que um humano CORRE, e corre a velocidade de atleta. No
   monitor isso é convenção de FPS e ninguém estranha; dentro do headset,
   com o corpo parado, é a maior fonte de conflito visual-vestibular que
   este porte ainda tinha.

   O QUE A PESQUISA DISSE — E ONDE ELA DIVERGE
   (citações, números e links em docs/vr/referencia-velocidade.md)

   1. ACELERAÇÃO: é onde as fontes CONVERGEM, e é a mudança com melhor
      lastro aqui. Oculus BPG (2017, p.17): "Instantaneous accelerations
      are more comfortable than gradual accelerations... discomfort will
      increase as a function of the frequency, size, and duration of
      acceleration". A Meta de 2025 batiza isso de velocidade QUANTIZADA:
      "setting fixed movement speeds (for example, stopped, walking,
      running) and switching between them instantly". Uma rampa de 270 ms
      é exatamente o estímulo que as duas frases mandam evitar.

   2. VELOCIDADE: as fontes DIVERGEM, e o documento diz isso em vez de
      inventar consenso. A Meta publica os números humanos (1,4 e 2,8 m/s)
      e So, Lo & Ho (2001) — o estudo que ela cita — achou náusea e vecção
      crescendo monotonicamente de 3 para 10 m/s, com PLATÔ acima disso.
      Mas Kemeny (2015) achou o oposto no eixo longitudinal (SSQ MAIOR em
      velocidade baixa) e Widdowson & LaValle (2019), na mesma revista do
      So et al. e com o ex-cientista-chefe da Oculus na autoria, não achou
      diferença nenhuma entre perfis de velocidade: "no convincing
      evidence to support the common belief that constant speed is more
      comfortable than variable speed profiles".

      O que sobrevive à divergência, e sustenta a escolha daqui: 5,2 e
      8,6 m/s caem no MEIO da faixa 3–10 m/s que é a única em que alguém
      mediu piora monotônica, e nenhuma fonte de nenhum dos lados cita
      8,6 m/s como velocidade de locomoção confortável.

   AS DUAS COISAS QUE ESTE MÓDULO NÃO PODE FAZER

   1. **Vazar para o PC.** Fora da sessão os getters devolvem o número do
      desktop, bit por bit — e não por disciplina de chamada, por
      CONSTRUÇÃO: `apresentando()` é lido em toda leitura e vem de
      `renderer.xr.isPresenting`. A sessão acaba por fora (headset tirado,
      botão do sistema, bateria) e não existe caminho em que o preset
      sobreviva a isso. `aplicar()`/`restaurar()` marcam a transição para
      a fiação e para o teste; NÃO são o que segura a velocidade. Essa
      separação é a lição do `quality.restaurar()`, que sumiu de um
      `else if` e deixou o monitor sem sombra para sempre.

   2. **Decidir sozinho o equilíbrio competitivo.** Aqui headset e monitor
      jogam a MESMA partida. Escala humana em VR é desvantagem MEDÍVEL: o
      gás da fase 1 fecha a 5,50 m/s e o da fase 2 a 4,38 m/s
      (`buildPlan`, server.js), acima da corrida de qualquer perfil
      confortável. Por isso `paridade` existe e devolve os quatro números
      do PC exatos — o critério de aceite deste porte pede "velocidade de
      PC disponível como opção declarada". O custo de cada perfil está
      medido em docs/vr/referencia-velocidade.md §5.
   ================================================================ */

/* MESMA CHAVE do giro e da vinheta (js/xr/xrturn.js, js/xr/xrui.js): a
   gravação faz spread do que já existe, então as três preferências convivem
   sem uma pisar na outra. */
export const CHAVE = 'callofai_vr';

/* Meta, *Locomotion Comfort and Usability* (Reducing Optic Flow): "Set avatar
   walking and running speeds to match real-world rates (walking ~3 mph/1.4 m/s,
   running ~6 mph/2.8 m/s) to avoid excessive optic flow." */
export const CORRIDA_HUMANA = 2.8;

/* Velocidade com que a borda do gás fecha na fase 1 do plano clássico:
   (560 − 340) m em 40 s (`buildPlan`, server.js). É o número que decide se
   quem está de headset consegue jogar a MESMA partida que quem está no
   monitor. 6,0 dá ~9 % de folga — a fuga real nunca é em linha reta. */
export const FUGA_DO_GAS = 6.0;

/* OS PERFIS SÃO ESCALAS DO CONJUNTO DO PC, não quatro números soltos.

   Escalar preserva as razões que o jogo já usa (correr = 1,654× andar,
   agachado = 0,50×, mirando = 0,654×). Isso importa por dois motivos: a
   mecânica continua significando a mesma coisa — mirar ainda custa
   mobilidade, agachar ainda é lento — e o efeito competitivo vira UM
   número verificável, em vez de quatro ajustes independentes que podem,
   sem ninguém notar, deixar quem está de headset mais rápido que quem
   está no monitor em alguma situação. Com escala ≤ 1 isso é impossível
   por construção, e há teste cobrando os quatro.

   Cada perfil é definido pela sua ÂNCORA, não por um multiplicador solto:
   assim, se as constantes do PC mudarem um dia, `conforto` continua
   pousando na corrida humana em vez de sair passeando junto. */
export const PERFIS = {
  /* CORRER pousa na corrida humana da Meta. Ancorar a CORRIDA (e não a
     caminhada) é escolha: é a velocidade que domina o fluxo óptico e é
     onde o jogador de battle royale passa a maior parte do tempo. Como as
     razões do jogo são preservadas, só dá para ancorar uma das duas — a
     caminhada cai em 1,69 m/s, 21 % acima do 1,4 de referência e abaixo
     do teto de 2,0 m/s que o critério de aceite cobra. */
  conforto: { correr: CORRIDA_HUMANA },
  /* CORRER passa a fuga do gás. Existe porque velocidade aqui não é só
     conforto, é sobrevivência: é o degrau para quem aguenta mais fluxo
     óptico e quer disputar a zona sem abrir mão de andar devagar. */
  alcance: { correr: FUGA_DO_GAS },
  /* Os quatro números do PC, sem arredondamento, E a rampa do PC junto.
     Paridade tem que ser paridade INTEIRA: dar aceleração instantânea com
     velocidade de PC deixaria quem está de headset MELHOR que quem está no
     monitor em duelo de canto (quem chega ao topo primeiro ganha a troca),
     e vantagem de headset não é conforto, é defeito de projeto. */
  paridade: { escala: 1, rampaDoPc: true },
};

export const PADRAO = { perfil: 'conforto' };

/* Ordem em que o painel do headset cicla, do mais confortável ao mais
   rápido. Exportada para o painel (js/xr/xrui.js) não repetir a lista:
   painel com um perfil a mais ou a menos que o módulo é controle que não
   faz nada. */
export const ORDEM = ['conforto', 'alcance', 'paridade'];

export const ROTULOS = {
  conforto: 'CONFORTO',
  alcance: 'ALCANCE',
  paridade: 'IGUAL AO PC',
};

/* ACELERAÇÃO. `damp(cur, alvo, k, dt) = lerp(cur, alvo, 1 − e^(−k·dt))`, então
   o tempo até 95 % é `ln(20)/k ≈ 3/k`. O PC usa k = 11 no solo: 3/11 = 273 ms,
   e a medição em sessão deu 270 ms — o modelo bate com o produto.

   Em XR o solo vai a k = 60 → **50 ms**, três a quatro frames a 72 Hz. É
   "instantâneo" para o jogador e ainda é integração contínua, sem o salto
   numérico de escrever a velocidade direto no colisor. Sobra 3× de folga
   abaixo do teto de 150 ms do critério de aceite — para subir E para parar,
   que é o mesmo k nos dois sentidos ("Slowing down or stopping... are all
   forms of acceleration", Oculus BPG p.6).

   NO AR fica o valor do PC. Ali `k` não é rampa de locomoção, é CONTROLE
   AÉREO: mexer nele muda a trajetória de todo pulo, o que é mudança de
   balanceamento e não de conforto — e o trecho é curto e dominado pela
   gravidade, que o ouvido interno também não sente com o corpo parado. */
export const ACEL_XR_SOLO = 60;

const num = (v, alt = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : alt);

/* Escala do perfil, resolvida contra as constantes do PC. Âncora com
   denominador inválido cai no perfil padrão em vez de devolver Infinity. */
function escalaDe(base, perfil) {
  const p = PERFIS[perfil];
  if (!p) return null;
  if (typeof p.escala === 'number') return p.escala;
  const denom = num(base.correr);
  if (!(denom > 0)) return null;
  return p.correr / denom;
}

/* Política PURA: dado o conjunto do PC e o nome do perfil, os quatro números
   da sessão e as duas acelerações. Sem sessão, sem three, sem armazém — dá
   para testar sem subir navegador. */
export function politicaDeVelocidade(base = {}, perfil = PADRAO.perfil) {
  let nome = perfil;
  let k = escalaDe(base, nome);
  if (k === null) { nome = PADRAO.perfil; k = escalaDe(base, nome); }
  if (k === null) k = 1;                      // base degenerada: não inventa número
  const rampaDoPc = !!(PERFIS[nome] && PERFIS[nome].rampaDoPc);
  return {
    perfil: nome,
    escala: k,
    andar: num(base.andar) * k,
    correr: num(base.correr) * k,
    agachar: num(base.agachar) * k,
    mirar: num(base.mirar) * k,
    aceleraSolo: rampaDoPc ? num(base.aceleraSolo) : ACEL_XR_SOLO,
    aceleraAr: num(base.aceleraAr),
  };
}

function lerPrefs(armazem) {
  if (!armazem || typeof armazem.getItem !== 'function') return {};
  try {
    const o = JSON.parse(armazem.getItem(CHAVE) || '{}');
    return (o && typeof o === 'object') ? o : {};
  } catch {
    return {};   // modo privado, cota, JSON corrompido: cai no padrão e segue
  }
}

function gravarPrefs(armazem, campos) {
  if (!armazem || typeof armazem.setItem !== 'function') return;
  try {
    armazem.setItem(CHAVE, JSON.stringify({ ...lerPrefs(armazem), ...campos }));
  } catch { /* sem armazenamento a preferência vale só nesta sessão */ }
}

/* `base` são as constantes do PC (game.js); `apresentando` é a leitura de
   `renderer.xr.isPresenting` — a MESMA fonte que a fachada XR usa, nunca um
   espelho local: a sessão pode acabar sem passar por nenhum código nosso. */
export function criarLocomocaoXR({ base = {}, apresentando = () => false, armazem = null } = {}) {
  const pc = {
    andar: num(base.andar), correr: num(base.correr),
    agachar: num(base.agachar), mirar: num(base.mirar),
    aceleraSolo: num(base.aceleraSolo), aceleraAr: num(base.aceleraAr),
  };
  const salvas = lerPrefs(armazem);
  let perfil = PERFIS[salvas.velocidade] ? salvas.velocidade : PADRAO.perfil;
  let plano = null;     // memo do plano do perfil atual: zero alocação por frame
  let marcado = false;  // `aplicar()` foi chamado nesta sessão

  const emXR = () => {
    try { return apresentando() === true; } catch { return false; }
  };
  const planoAtual = () => (plano || (plano = politicaDeVelocidade(pc, perfil)));

  /* TODA leitura passa por aqui, e é isto que torna o vazamento IMPOSSÍVEL:
     fora da sessão o `if` devolve o objeto do PC, e não existe estado que
     possa ficar para trás. `marcado` NÃO participa desta decisão de
     propósito — se participasse, um `restaurar()` que sumisse de um `else if`
     (exatamente o que aconteceu com o preset de qualidade) deixaria o monitor
     rodando em velocidade de headset para sempre. */
  const ativo = () => (emXR() ? planoAtual() : pc);

  /* Aplicar é DECLARAR a entrada: devolve o plano da sessão e deixa registro
     de que a fiação passou por aqui. Idempotente. */
  function aplicar() {
    marcado = true;
    return planoAtual();
  }

  /* Restaurar é largar o registro. Devolve `true` só se havia algo aplicado —
     é assim que o teste distingue "desfez" de "nunca aplicou". */
  function restaurar() {
    if (!marcado) return false;
    marcado = false;
    return true;
  }

  function preferir(p) {
    if (p && typeof p === 'object' && PERFIS[p.velocidade]) {
      perfil = p.velocidade;
      plano = null;                                // vale já na próxima leitura
      gravarPrefs(armazem, { velocidade: perfil });
    }
    return { velocidade: perfil };
  }

  /* Próximo perfil da lista, para a linha do painel que cicla (o mesmo gesto
     do `escolha` de GIRO). Fica aqui porque a ORDEM é daqui. */
  function proximo() {
    return preferir({ velocidade: ORDEM[(ORDEM.indexOf(perfil) + 1) % ORDEM.length] });
  }

  return {
    aplicar, restaurar, preferir, proximo,
    /* Os quatro números que o game.js lê no lugar das constantes. */
    get andar() { return ativo().andar; },
    get correr() { return ativo().correr; },
    get agachar() { return ativo().agachar; },
    get mirar() { return ativo().mirar; },
    /* Quem sabe se o pé está no chão é a física, não este módulo. */
    aceleracao(onGround) {
      const a = ativo();
      return onGround ? a.aceleraSolo : a.aceleraAr;
    },
    get dentro() { return marcado && emXR(); },
    /* O que está VALENDO agora, na mesma forma nos dois lados — fora da sessão
       o perfil é o do PC e a escala é 1, para quem lê não ter que adivinhar. */
    get plano() {
      return emXR() ? { ...planoAtual() } : { perfil: 'pc', escala: 1, ...pc };
    },
    get prefs() { return { velocidade: perfil }; },
    get rotulo() { return ROTULOS[perfil] || perfil; },
    get pc() { return { ...pc }; },
  };
}
