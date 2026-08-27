/* ================================================================
   ENTRADA DOS CONTROLES DE VR — módulo PURO (sem DOM, sem three).

   Recebe `session.inputSources` por parâmetro e devolve INTENÇÃO:
   quanto andar, quantos passos girar, o que está pressionado. Quem
   traduz intenção em jogo é o game.js — e ele faz isso escrevendo nas
   MESMAS teclas que o teclado escreveria, para que colisão, rampa,
   veículo e tudo o mais continuem sendo o código já testado. Controle
   novo não pode significar física nova.

   DUAS DECISÕES DE CONFORTO, que aqui são contrato e não gosto:

   1. GIRO EM PASSOS (snap turn), 45° por inclinada. Girar o mundo de
      forma suave debaixo de quem está fisicamente parado é a causa mais
      conhecida de enjoo em VR — o olho vê rotação que o ouvido interno
      não sente. Em passos, o cérebro trata como corte de câmera. E é UM
      passo por inclinada: segurar pro lado não gira em rajada; o
      analógico precisa voltar ao centro pra liberar o próximo.

   2. ZONA MORTA. O analógico do Touch descansa em ±0,1 sozinho. Sem
      zona morta o jogador anda sem querer, e andar sem querer em VR é
      enjoo na veia. A zona morta é DESCONTADA (não cortada): logo
      depois dela o passo é pequeno e cresce liso, sem salto de 0 pra 1.

   MAPA DE EIXOS DO TOUCH: o gamepad expõe 4 eixos e os que valem são os
   índices 2 e 3. O par 0/1 é do touchpad, que o Touch não tem — ler 0/1
   dá analógico morto no aparelho, e isso não se descobre sem um Quest na
   mão. Eixo 3 negativo é "pra frente".

   BOTÕES (perfil xr-standard do Touch): 0 gatilho, 1 empunhadura,
   3 clique do analógico, 4 e 5 os botões A/B (direita) e X/Y (esquerda).

   O ORÇAMENTO DE BOTÕES É FECHADO, e isso decide o resto deste arquivo. O
   perfil `meta-quest-touch-plus` também lista o índice 2 (nulo, era touchpad),
   o 6 (thumbrest, CAPACITIVO: o polegar em repouso já o "aperta") e o 7 (menu,
   só na mão esquerda). O 7 não pode ser usado: a especificação de gamepads do
   WebXR é literal — "Buttons reserved by the UA or platform MUST NOT be exposed
   on the Gamepad". Sobram CINCO botões pressionáveis por mão: 0, 1, 3, 4, 5.

   TRÊS BOTÕES MUDARAM DE DONO NESTA RODADA, em cascata a partir de um só fato:
   a empunhadura é do AGARRAR. Não é gosto — VRC.Quest.Input.2 diz "use the
   Touch controller's grip button rather than the trigger button", o grab do
   Immersive Web SDK da própria Meta roteia por `squeeze`, o `GrabTypes` padrão
   do SteamVR é `Grip` e o `pickup_axis_action` do Godot XR Tools nasce em
   "grip". Com o grip ocupado, AGACHAR desce para o clique do analógico, e
   CORRER sai do clique para o BATENTE do analógico — que é a convenção do
   gênero e não custa botão nenhum. Agachar continua tendo a via física
   (a cabeça baixando), então ninguém fica sem ele.

   E O QUE NÃO CABE VIRA FATIA. Granada, kit médico, comer e troca de acessório
   de mira são quatro verbos, e a mudança acima liberou UM botão: o gatilho
   esquerdo. Um botão para quatro só fecha com um seletor: segurar o gatilho da
   mão de apoio abre um radial, o analógico DA MESMA MÃO escolhe a direção,
   soltar confirma. Quatro fatias é teto de ergonomia, não preguiça ("keep the
   number of buttons small… the attentional cone of vision is roughly 10
   degrees"). Os detalhes de por que NÃO é o clique do analógico direito estão
   em `criarRadialXR`, e cada um deles é uma colisão medida, não suposta.

   Fontes, com link, em docs/vr/referencia-interacao.md.
   ================================================================ */

export const DEADZONE = 0.18;      // acima do repouso típico (~0,1) com folga
export const SNAP_RAD = Math.PI / 4;   // 45°: o passo padrão de conforto
const SNAP_ON = 0.7;               // inclinada que dispara o passo
const SNAP_OFF = 0.35;             // e o quanto precisa voltar pra rearmar

/* CORRER é o analógico no batente. O limiar fica alto de propósito: andar
   depressa não pode virar corrida sem o jogador pedir, e o batente é a única
   posição que ele alcança de propósito sem olhar. */
export const CORRER_TILT = 0.92;

/* RADIAL. Entra na fatia acima de RADIAL_ON, larga a fatia abaixo de
   RADIAL_OFF — histerese, pelo mesmo motivo da zona morta: o analógico do Touch
   descansa em ±0,1 e a fatia não pode piscar sozinha entre dois verbos.
   A ORDEM É O CONTRATO: cima, direita, baixo, esquerda. */
const RADIAL_ON = 0.5;
const RADIAL_OFF = 0.3;
export const RADIAL_FATIAS = [
  { code: 'KeyG', rotulo: 'GRANADA' },
  { code: 'KeyQ', rotulo: 'KIT MÉDICO' },
  { code: 'KeyF', rotulo: 'COMER' },
  { code: 'KeyT', rotulo: 'MIRA' },
];

/* Direção → fatia. `atan2(x, -y)` põe o zero em CIMA (eixo 3 negativo é frente
   no Touch) e cresce no sentido horário, então o arredondamento por quadrante
   cai direto no índice da tabela acima. */
function fatiaDe(x, y) {
  const i = Math.round(Math.atan2(x, -y) / (Math.PI / 2));
  return ((i % 4) + 4) % 4;
}

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/* zona morta DESCONTADA e normalizada: 0 no limiar, 1 no batente */
function semZonaMorta(v) {
  const a = Math.abs(v);
  if (a <= DEADZONE) return 0;
  return Math.sign(v) * ((a - DEADZONE) / (1 - DEADZONE));
}

function eixos(fonte) {
  const g = fonte && fonte.gamepad;
  const a = g && Array.isArray(g.axes) ? g.axes : (g && g.axes ? Array.from(g.axes) : null);
  if (!a || a.length < 4) return { x: 0, y: 0 };
  return { x: num(a[2]), y: num(a[3]) };
}

/* `session.inputSources` NÃO é um Array: é um `XRInputSourceArray`, e
   `Array.isArray()` devolve FALSE nele. Guardar a entrada com `Array.isArray`
   descarta os dois controles TODO FRAME no aparelho — sem erro, sem console,
   só analógico morto. Aceite qualquer coisa iterável ou com `length`. */
function comoLista(v) {
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== 'object') return [];
  if (typeof v[Symbol.iterator] === 'function') return Array.from(v);
  if (typeof v.length === 'number') return Array.prototype.slice.call(v);
  return [];
}

function botao(fonte, i) {
  const g = fonte && fonte.gamepad;
  const b = g && g.buttons && g.buttons[i];
  return !!(b && b.pressed);
}

export function maoDe(fontes, qual) {
  for (const f of comoLista(fontes)) if (f && f.handedness === qual) return f;
  return null;
}

/* O RADIAL MORA NUMA FÁBRICA PRÓPRIA porque tem DOIS leitores: a entrada
   (que precisa saber que o jogador está escolhendo, e não andando) e a camada
   de interação (que é quem despacha a tecla, por ser a que tem `window`).
   Duplicar a máquina de estado em dois arquivos seria pedir para eles
   divergirem no dia em que um deles for chamado num frame diferente do outro.

   TUDO NA MÃO DE APOIO: o GATILHO ESQUERDO abre, o analógico ESQUERDO escolhe.
   Indicador segura, polegar aponta a direção, soltar confirma. O gatilho está
   livre porque foi a correção de D3 que o liberou — o agarre saiu dele e foi
   para a empunhadura.

   OS DOIS PALPITES ÓBVIOS ESTÃO ERRADOS, e os dois custam caro:
   · o clique do analógico DIREITO já é a PAUSA (js/xr/xrui.js, BOTAO_MENU = 3),
     que a loja exige. Abrir o radial ali abriria a pausa junto, e com o jogo
     pausado o verbo nem chega a ser processado — medido, não suposto;
   · escolher a fatia no analógico DIREITO dispara o giro em passos ao empurrar
     para o lado. E o giro que vale é lido por outro módulo (js/xr/xrturn.js,
     direto das fontes), fora do alcance deste — um radial que gira a vista 45°
     ao abrir seria pior que a falta dele. */
export function criarRadialXR() {
  let aberto = false, fatia = -1;

  /* `esquerda` traz o BOTÃO (gatilho, índice 0) e a DIREÇÃO (eixos 2 e 3) */
  function passo(esquerda) {
    const out = { aberto: false, fatia: -1, code: null, rotulo: null, confirmou: null };
    if (!esquerda) {
      /* Controle sumindo NÃO confirma fatia: perder o rastreamento por um frame
         não pode gastar uma granada. O radial simplesmente fecha. */
      aberto = false; fatia = -1;
      return out;
    }
    const e = eixos(esquerda);
    if (botao(esquerda, 0)) {
      /* Abrir é imediato no aperto — esperar um tempo mínimo faria o menu
         parecer travado. O que leva tempo é a ESCOLHA, e ela é do jogador. */
      aberto = true;
      const m = Math.hypot(num(e.x), num(e.y));
      if (m >= RADIAL_ON) fatia = fatiaDe(num(e.x), num(e.y));
      else if (m <= RADIAL_OFF) fatia = -1;
      // entre os dois limiares a fatia é MANTIDA: é a histerese
    } else if (aberto) {
      /* Soltar confirma — e soltar no centro cancela. Abrir sem querer não pode
         gastar o único kit médico da partida. E a confirmação é SÓ aqui: manter
         o polegar na fatia a 72 Hz jogaria uma granada por frame. */
      if (fatia >= 0) out.confirmou = RADIAL_FATIAS[fatia].code;
      aberto = false; fatia = -1;
    }
    out.aberto = aberto;
    out.fatia = fatia;
    if (fatia >= 0) {
      out.code = RADIAL_FATIAS[fatia].code;
      out.rotulo = RADIAL_FATIAS[fatia].rotulo;
    }
    return out;
  }

  return { passo, ler: fontes => passo(maoDe(fontes, 'left')) };
}

export function criarEntradaXR() {
  let girarArmado = true;   // rearma quando o analógico volta pro centro
  let gatilhoAntes = false; // pra separar APERTAR de ESTAR SEGURANDO
  let trocaAntes = false;   // idem pra troca de arma: ciclar em rajada é inútil
  const radial = criarRadialXR();   // seletor dos quatro verbos que não têm botão
  /* REARME DA LOCOMOÇÃO. O analógico que escolhe a fatia é o mesmo de andar, e
     o jogador solta o gatilho com o polegar AINDA na direção que escolheu. Sem
     este rearme ele confirma "granada" e sai correndo para a frente no mesmo
     instante — medido em sessão real, não suposto. Mesma ideia do `girarArmado`:
     o analógico precisa passar pelo centro para valer de novo. */
  let andarArmado = true;

  function ler(fontes) {
    const out = {
      andar: { x: 0, y: 0 },
      girar: 0,
      atirar: false, atirarAgora: false,
      mirar: false, pular: false, agachar: false, recarregar: false, usar: false,
      correr: false, trocarArma: false, agarrar: false,
      radial: { aberto: false, fatia: -1, code: null, rotulo: null, confirmou: null },
    };
    const lista = comoLista(fontes);
    let esquerda = null, direita = null;
    for (const f of lista) {
      if (!f) continue;
      if (f.handedness === 'left') esquerda = f;
      else if (f.handedness === 'right') direita = f;
      // qualquer outra mão ('none', ausente) é ignorada: não dá pra saber
      // se anda ou se gira, e chutar seria mover o jogador sem ele pedir
    }

    /* RADIAL PRIMEIRO: o analógico esquerdo é o mesmo de andar, e é o radial
       que decide de quem ele é neste frame. */
    out.radial = radial.passo(esquerda);

    if (out.radial.aberto) andarArmado = false;

    if (esquerda) {
      const e = eixos(esquerda);
      /* magnitude CRUA: o batente é físico (é onde o polegar sente o anel), e
         descontar a zona morta antes moveria esse ponto junto com a DEADZONE */
      const mCru = Math.hypot(num(e.x), num(e.y));
      if (!andarArmado && mCru <= DEADZONE) andarArmado = true;
      /* enquanto escolhe — e até o polegar voltar ao centro depois de escolher —
         o analógico é do menu, não das pernas */
      const escolhendo = out.radial.aberto || !andarArmado;
      const x = escolhendo ? 0 : semZonaMorta(e.x);
      const y = escolhendo ? 0 : -semZonaMorta(e.y);   // eixo 3 negativo = frente
      const m = Math.hypot(x, y);
      // diagonal não pode andar mais rápido que reto
      const k = m > 1 ? 1 / m : 1;
      /* `+ 0` normaliza o zero NEGATIVO que `Math.sign` propaga: -0 e 0 são
         iguais em `===` mas diferentes em `Object.is`, e comparação estrita
         de teste (e qualquer `Object.is` no caminho) enxerga a diferença. */
      out.andar.x = x * k + 0;
      out.andar.y = y * k + 0;
      /* A EMPUNHADURA É DO AGARRAR (D3). Quem faz a borda é quem age
         (js/xr/xrinteract.js): aqui sai o ESTADO, porque o agarre à distância
         precisa saber quanto tempo o grip está sendo mantido. */
      out.agarrar = botao(esquerda, 1);
      out.agachar = botao(esquerda, 3);
      /* CORRER NO BATENTE — e a fatia do radial É o batente, então correr entra
         na mesma suspensão do andar. Sem isso, escolher qualquer fatia mandava
         um `ShiftLeft` junto: o jogador confirmava o item já em disparada. */
      out.correr = !escolhendo && mCru >= CORRER_TILT;
      out.usar = botao(esquerda, 4);
      out.recarregar = botao(esquerda, 5);
    }

    if (direita) {
      const d = eixos(direita);
      const lado = num(d.x);

      if (out.radial.aberto) {
        /* GIRO SUSPENSO. Zerar a saída não bastaria: o rearme também tem que
           ficar travado, senão o analógico volta ao centro DENTRO do radial, o
           giro rearma escondido, e o primeiro movimento depois de fechar vira um
           passo de 45° que o jogador não pediu. */
        girarArmado = false;
      } else if (girarArmado && Math.abs(lado) >= SNAP_ON) {
        out.girar = lado > 0 ? -1 : 1;   // empurrou pra direita = gira pra direita (yaw negativo)
        girarArmado = false;
      } else if (Math.abs(lado) <= SNAP_OFF) {
        girarArmado = true;
      }
      out.atirar = botao(direita, 0);
      out.mirar = botao(direita, 1);
      out.pular = botao(direita, 4);
    } else {
      girarArmado = true;   // controle sumiu: não deixa o giro travado armado errado
    }

    /* APERTAR não é SEGURAR. Arma automática lê o estado contínuo; a
       semi-automática lê o CLIQUE (`gun.auto ? mouse.shooting : mouse.clicked`
       no game.js), e clique é borda. Sem esta linha, pistola, sniper e escopeta
       ficam mudas em VR — sem erro, sem console. A borda é calculada FORA do
       `if (direita)` de propósito: com o controle sumindo no meio do aperto, o
       estado volta a falso e o próximo aperto conta como aperto novo. */
    out.atirarAgora = out.atirar && !gatilhoAntes;
    gatilhoAntes = out.atirar;

    /* B da direita CICLA a arma, um passo por aperto. Segurar não pode virar
       rajada de troca: o jogador nunca pararia na arma que quer. Mesmo motivo
       do giro em passos, e a borda mora fora do `if (direita)` pela mesma razão
       do gatilho — controle sumindo não deixa a troca travada. */
    const trocaAgora = botao(direita, 5);
    out.trocarArma = trocaAgora && !trocaAntes;
    trocaAntes = trocaAgora;

    return out;
  }

  return { ler, get girarArmado() { return girarArmado; } };
}
