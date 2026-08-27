/* ================================================================
   INTERAÇÃO PELA MÃO EM VR — pegar o carro, abrir o baú, pegar o item.

   POR QUE ISTO EXISTE. O relato do dono foi "não consigo pegar o carro, abrir
   os baús". A causa NÃO era alcance: eram dois defeitos silenciosos.

   1. O AVISO NÃO EXISTE NO HEADSET. O prompt de interação é DOM (`#prompt`,
      index.html:55) e DOM não é renderizado dentro de uma sessão imersiva. O
      jogador nunca viu "E — ENTRAR NO VEÍCULO" — e não existe tecla E num
      Touch. A recomendação da Meta para interação com as mãos é explícita:
      "include visual and audio cues to indicate which object is currently
      targeted". Sem sinal, interagir em VR é adivinhação. Daí o marcador 3D:
      um ANEL no chão com o RAIO REAL da regra de gameplay (ou seja, o anel
      responde "onde eu preciso estar") e um rótulo flutuante com a ação.

   2. O BAÚ DO BR NUNCA ABRIA. `js/interact.js` lê o Set `justPressed`, mas o
      baú do battle royale é aberto por um listener de `keydown` DE VERDADE
      (br-game.js:1828). O caminho de VR escrevia direto no Set, sem evento —
      então o botão "usar" do Touch abria baú no solo e NUNCA no BR, sem erro
      e sem console. Aqui o gesto emite um `KeyboardEvent` real, que é o mesmo
      truque que js/touchcontrols.js já usa no celular pelo mesmo motivo.

   O GESTO É A EMPUNHADURA DA MÃO DE APOIO, e são DOIS VERBOS, não um.

   Era o gatilho, e isso reprovava por dois motivos ao mesmo tempo. Primeiro o
   botão: VRC.Quest.Input.2 é literal — "use the Touch controller's grip button
   rather than the trigger button" — e o grab do Immersive Web SDK da própria
   Meta roteia por `squeeze`, o `GrabTypes` padrão do SteamVR é `Grip`, e o
   `pickup_axis_action` do Godot XR Tools nasce em "grip". Segundo a distância:
   a mão não entrava na conta em momento nenhum, então "pegar" era na verdade um
   comando de proximidade do CORPO, que é o outro jeito de reprovar D3.

   Agora são dois verbos, do jeito que os kits de VR separam:

   · AGARRE DIRETO — a mão encostada. `RAIO_AGARRE` = 7,5 cm, que é o
     `controllerHoverRadius` da Valve (o `hoverSphereRadius` de 5 cm é da mão
     rastreada; o de 2,5 cm é por articulação de dedo). Dispara na BORDA do
     grip, sem fricção nenhuma: encostou e apertou, pegou.

   · AGARRE À DISTÂNCIA — a mão apontada, o alvo longe. É verbo separado porque
     a Meta trata `Distance Grab` como modo próprio, com métodos próprios, e
     porque a régua exige. Confirma de duas formas, ambas do mesmo verbo: o
     PUXÃO (o "simple flick of the wrist to summon an object to your hand" das
     gravity gloves do Alyx) ou MANTER o grip apontado por `HOLD_LONGE`. As duas
     porque exigir amplitude de movimento exclui quem joga sentado ou com o
     braço apoiado, e a plataforma pede o contrário — "make sure the user can
     remain in a neutral body position as much as possible".

   O PUXÃO É MEDIDO POR DIREÇÃO, não por módulo: só conta a velocidade da mão
   projetada no SENTIDO CONTRÁRIO ao que ela aponta. Empurrar a mão na direção
   do alvo com a mesma velocidade não pode agarrar — um teste de módulo passaria
   e o jogador levaria susto.

   A DISTÂNCIA É ATÉ A CASCA, NÃO ATÉ O CENTRO. Os kits medem contra colisores
   (o Godot usa uma esfera para o grab direto e um cilindro para o agarre à
   distância). Medindo do centro, NADA com volume seria agarrável: a mão nunca
   chega a 7,5 cm do centro de um carro. Cada classe declara o raio da sua
   casca — o colisor barato deste jogo.

   O ALCANCE DE GAMEPLAY NÃO MUDA. Os raios aqui são LEITURA dos mesmos raios
   de js/interact.js e do BR; a mão só ESCOLHE e MOSTRA, e o gesto emite a
   mesma tecla de sempre — quem decide a ação continua sendo o jogo. Ampliar
   alcance seria abrir vetor de trapaça (test/security-regression.test.js).

   UM GESTO, UM EVENTO — e isto é um CONTRATO com quem faz o wiring. O game.js
   tem (ou vai ter) a sua própria ponte que traduz a entrada de VR em
   `KeyboardEvent` para alcançar o resto do que o BR escuta no teclado (pulo da
   nave, paraquedas, teclas de arma). Para as duas coisas não dispararem a ação
   duas vezes, a divisão é:

     · ESTE módulo é dono do GATILHO DA MÃO DE APOIO, e só dele. Esse botão não
       existe no mapa de js/xr/xrinput.js, então nada mais o lê.
     · O botão "usar" (X) continua sendo da ponte do game.js. NÃO passe `usar`
       para `update()` se a ponte já o traduz — o parâmetro existe só para o
       caso de não haver ponte.
     · Se a ponte preferir ser a ÚNICA a despachar teclado, crie o módulo com
       `despachar: false`: `update()` passa a só devolver `gesto: true` na
       borda de subida, e quem emite o evento é ela.

   NADA É CRIADO NO BOOT: o marcador nasce no primeiro frame DENTRO da sessão.
   Todo `Object3D` gasta 4 números do `Math.random` seedado no UUID, e a ordem
   de consumo é contrato do worldgen.
   ================================================================ */

import { criarRadialXR, RADIAL_FATIAS } from './xrinput.js';
import { pontoDeAlcance } from '../interact.js';

/* Alcance da MÃO (não do jogo): dentro disto o alvo é "pegável" e a escolha é
   por distância; fora, a escolha é por ÂNGULO, como o distance grab da Meta
   ("implement magnetism to simplify targeting"). */
export const ALCANCE_MAO = 0.9;
export const CONE = Math.cos(35 * Math.PI / 180);   // 35° de meia-abertura
export const OLHAR_LONGE = 9;                       // até onde a mão consegue MARCAR

/* AGARRE DIRETO: `controllerHoverRadius` do SteamVR Unity Plugin, o valor da
   Valve para controle na mão. `ALCANCE_MAO` acima é outra coisa e não se
   confunde com este: aquele decide QUAL alvo a mão prefere (magnetismo), este
   decide se a mão está ENCOSTANDO. */
export const RAIO_AGARRE = 0.075;

/* Casca agarrável por classe — o colisor barato. Medir do centro faria a mão
   nunca alcançar nada que tenha volume. Os números são a metade da maior
   dimensão de cada coisa no mundo, arredondada para baixo: a casca só serve
   para o agarre direto, e errar para menos custa um passo a mais, enquanto
   errar para mais devolveria o "pegar de longe" que a régua reprova. */
export const CASCA = {
  bau: 0.45, bauBR: 0.45, bazuca: 0.30, carro: 1.60,
  heli: 2.50, canhao: 1.20, toy: 0.80, segredo: 0.40,
};

/* PUXÃO: velocidade mínima da mão no sentido contrário ao apontar. Um flick de
   pulso move a mão ~0,25 m em ~0,15 s (≈1,7 m/s); mirar de leve fica em
   0,2–0,4 m/s. 1,2 m/s separa os dois com folga dos dois lados. */
export const FLICK_VEL = 1.2;

/* E a via de quem não dá o flick: manter o grip apontado. 0,30 s é curto o
   bastante para não parecer travado e longo o bastante para não se confundir
   com um toque — o mesmo raciocínio da borda do gatilho. */
export const HOLD_LONGE = 0.30;

const COR_PODE = 0x5ce27a;     // dá pra usar daqui
const COR_LONGE = 0xffb347;    // é isso, mas você precisa chegar mais perto

/* ================================================================
   O RADIAL QUE SE VÊ (critério D4).

   A máquina de estado dos quatro verbos já existia, testada, em
   js/xr/xrinput.js — e não havia NADA visível. O jogador apertava o gatilho e
   não via menu nenhum: não sabia que fatias existem, qual estava selecionada,
   nem que soltar no centro cancela. Dentro de uma sessão `immersive-vr` sem
   `dom-overlay` o DOM não chega ao compositor, então qualquer `<div>`
   continuaria correta e continuaria invisível.

   ONDE O DISCO FICA — e o palpite óbvio está ERRADO. "Prende no pulso da mão
   que abriu" é desaconselhado pela própria Meta, com as duas metades ditas na
   mesma página: *"Avoid anchoring menus to an active, moving wrist"* … *"Spawning
   a menu from the wrist … is fine, as long as the menu is static once it
   appears and is positioned in world space rather than following the wrist."*
   E o outro lado já estava na régua: *"Avoid locking HUD style content to the
   user's head movements."*

   Então são três coisas, e o disco tem de fazer as três:

   · **NASCE NA DIREÇÃO DA MÃO** que abriu — quem abriu o menu está dito pela
     geometria, sem seta nem legenda;
   · **CONGELA** ao aparecer: tremor de pulso não sacode o texto, e o polegar
     empurra o analógico sem arrastar o alvo de leitura junto;
   · **NÃO SEGUE A CABEÇA**: virar o pescoço não move o disco.

   E congela contra o CORPO (`player.pos`), não contra o mundo absoluto: num
   veículo, ou com o jogador andando fisicamente durante a escolha, o disco
   viaja junto em vez de ficar plantado no chão. É o *"loosely follow the
   user"* que a mesma página da Meta oferece como alternativa ao head-lock.

   A QUE DISTÂNCIA. A Meta dá números diferentes para coisas diferentes:
   *"Position UI between 42cm and 46cm from the user when you want to encourage
   touch"*, e *"at least 0.5 meters"* para o que o olho vai FIXAR por muito
   tempo. O radial é ação rápida (*"Use hand menu for quick action"*), então
   vale o de perto: nasce entre 0,42 m e 0,55 m do olho, na direção da mão. O
   teto existe para o braço esticado não empurrar o texto para longe demais —
   abaixo de 0,7° de maiúscula o glifo deixa de ser legível.

   NADA ENTRA NO OLHO (I3). Congelado, o disco não persegue ninguém — mas o
   jogador pode avançar a cabeça para cima dele. Chegando a menos de 0,30 m,
   ele é empurrado de volta ao longo do eixo olho→disco. É guarda de segurança,
   não comportamento normal: nascendo a 0,42 m, só age se o jogador avançar
   12 cm com o menu aberto.

   CUSTO: **uma draw call por olho** — um sprite, uma textura de canvas,
   repintada só quando a fatia MUDA (mesma disciplina do rótulo do marcador:
   repintar canvas a 90 Hz num Snapdragon é queimar o frame por nada).

   NADA É CRIADO NO BOOT, nem no primeiro frame da sessão: o disco nasce no
   PRIMEIRO APERTO. Todo `Object3D` gasta 4 números do `Math.random` seedado no
   UUID, e a ordem de consumo é contrato do worldgen.

   Fontes, com link, em docs/vr/referencia-interacao.md §7.
   ================================================================ */
export const RADIAL_W = 0.18;          // lado do disco, em metros
export const RADIAL_CV = 512;          // lado do canvas, em pixels
export const RADIAL_R_PX = 236;        // raio do disco no canvas
export const RADIAL_MIOLO_PX = 96;     // raio do miolo (cancelar)
export const RADIAL_FONTE_PX = 40;     // rótulo da fatia
export const RADIAL_FONTE_MIOLO_PX = 30;
export const RADIAL_CAP = 0.72;        // altura de maiúscula / tamanho de fonte
/* Onde o disco NASCE, medido do olho na direção da mão (Meta: 42–46 cm para UI
   de perto). O teto não é conforto, é legibilidade: a 0,55 m a maiúscula do
   miolo mede 0,79°, e o alvo desta base é 0,7°. */
export const RADIAL_PERTO_MIN = 0.42;
export const RADIAL_PERTO_MAX = 0.55;
/* I3 proíbe geometria a menos de 0,15 m do olho; 0,30 m dá o dobro de margem. */
export const RADIAL_MIN_OLHO = 0.30;

const hipot = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

export function createXrInteract({
  THREE, scene, player, state, heightAt, Structures, Car, Heli, arsenal,
  getCannon = () => null, getMapToys = () => null, getSecrets = () => null,
  win = typeof window === 'undefined' ? null : window,
  despachar = true,
  /* A MESMA RÉGUA DE js/interact.js, pelos mesmos parâmetros. Não é conforto:
     o marcador diz ao jogador "dá pra usar daqui", e a tecla que o gesto emite
     é resolvida lá. Duas réguas seria o jogador ver verde e o jogo recusar. */
  cabecaXR = null, foraXR = null,
} = {}) {
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
  const _maoPos = new THREE.Vector3(), _maoDir = new THREE.Vector3(), _q = new THREE.Quaternion();
  /* pose da mão no frame anterior + velocidade: é com isto que o puxão existe.
     `Vector3` não é `Object3D` nem `BufferGeometry`, então não gasta número do
     `Math.random` seedado — criar aqui é seguro para o worldgen. */
  const _maoAnt = new THREE.Vector3(), _vel = new THREE.Vector3();
  /* a régua compartilhada com js/interact.js (ver o parâmetro `cabecaXR`) */
  const _ref = new THREE.Vector3(), _cabRef = new THREE.Vector3();
  const alcanceDe = () => pontoDeAlcance(
    _ref, player.pos, cabecaXR ? cabecaXR(_cabRef) : null, foraXR ? foraXR() : undefined);

  let grupo = null, anel = null, rotulo = null, ctx = null, textura = null;
  let textoNoRotulo = null;
  let montado = false;
  let alvoAtual = null;
  let gripAntes = false, usarAntes = false;
  let gripSeguraT = 0, agarrouNesteAperto = false, temAnterior = false;
  let radialLocal = null;
  let pulso = 0;
  /* o disco do radial e o que ele precisa lembrar entre frames */
  let radial = null, radialCtx = null, radialTex = null;
  let radialNasceu = false, radialFatiaPintada = null;
  let _rigDaMao = null, _camDoRig = null;
  const _radialPos = new THREE.Vector3(), _radialOff = new THREE.Vector3();
  const _cabRadial = new THREE.Vector3();

  /* ---------------------------------------------------------------- */
  /* CANDIDATOS — a mesma ORDEM DE PRIORIDADE de js/interact.js `current()`,
     porque o gesto dispara a MESMA tecla: se a marcação divergisse da ação, o
     jogador veria uma coisa e o jogo faria outra. Cada classe é uma lista, e é
     DENTRO da classe que a mão escolhe (dois baús ao alcance, por exemplo). */
  function classes() {
    const P = alcanceDe();
    const noBR = !!(win && win.__BR_active);
    const fora = [];

    // dirigindo/voando: a ação é SAIR, e sair não precisa de alvo apontado
    if (state && (state.driving || state.flying)) return [];

    const cannon = getCannon && getCannon();
    if (cannon && cannon.prompt) {
      const cp = cannon.prompt(P);
      if (cp) {
        const p = cannon.pos || (cannon.group && cannon.group.position);
        fora.push([{ id: 'canhao', txt: cp.txt, pos: p ? _pto(p.x, p.y, p.z) : null, raio: 4.6, casca: CASCA.canhao, acionavel: true }]);
      }
    }

    const toys = getMapToys && getMapToys();
    if (toys && toys.prompt) {
      const tp = toys.prompt(P);
      if (tp) {
        // a alavanca da galeria não tem posição exposta hoje (js/maptoys.js);
        // sem posição não há marcador — mas o gesto continua valendo
        const fw = toys.spots && toys.spots.fireworks;
        const ehFogos = fw && hipot(P.x, P.z, fw.x, fw.z) < 3.2;
        fora.push([{ id: 'toy', txt: tp.txt, pos: ehFogos ? _pto(fw.x, fw.y, fw.z) : null, raio: ehFogos ? 3.2 : 2.6, casca: CASCA.toy, acionavel: true }]);
      }
    }

    const secrets = getSecrets && getSecrets();
    if (secrets && secrets.prompt) {
      const sp = secrets.prompt(P);
      if (sp) {
        const n = secrets.nest, c = secrets.vault;
        const p = (n && hipot(P.x, P.z, n.x, n.z) < 2.2) ? n
          : (c && hipot(P.x, P.z, c.x, c.z) < 2.4) ? c : null;
        fora.push([{ id: 'segredo', txt: sp.txt, pos: p ? _pto(p.x, p.y, p.z) : null, raio: p === n ? 2.2 : 2.4, casca: CASCA.segredo, acionavel: true }]);
      }
    }

    if (!noBR && Structures) {
      const bz = Structures.bazookaSpot;
      if (bz && arsenal && arsenal[3] && arsenal[3].locked &&
          hipot(P.x, P.z, bz.x, bz.z) < 2.8 && Math.abs(P.y - bz.y) < 3.5) {
        fora.push([{ id: 'bazuca', txt: 'PEGAR BAZUCA', pos: _pto(bz.x, bz.y, bz.z), raio: 2.8, casca: CASCA.bazuca, acionavel: true }]);
      }
      const baus = [];
      for (const s of Structures.chestSpots || []) {
        const d = hipot(P.x, P.z, s.x, s.z);
        if (d < OLHAR_LONGE) {
          baus.push({ id: 'bau', txt: 'USAR BAÚ', pos: _pto(s.x, heightAt(s.x, s.z), s.z), raio: 2.4, casca: CASCA.bau, acionavel: d < 2.4 });
        }
      }
      if (baus.length) fora.push(baus);
    }

    /* Baús do BR: caminho paralelo (br-game.js), com o MESMO raio de 2,4 m e a
       banda vertical de 3 m que ele já usa. Sem isto o alvo mais apertado da
       partida ficaria invisível justamente no modo principal. */
    const crates = win && win.__BR_debug && win.__BR_debug.crates;
    if (noBR && crates && crates.length) {
      const lista = [];
      for (const c of crates) {
        if (!c || c.opened || !c.g) continue;
        const d = hipot(P.x, P.z, c.g.position.x, c.g.position.z);
        if (d < OLHAR_LONGE && Math.abs(P.y - c.g.position.y) < 3) {
          lista.push({ id: 'bauBR', txt: 'ABRIR BAÚ', pos: _pto(c.g.position.x, c.g.position.y, c.g.position.z), raio: 2.4, casca: CASCA.bauBR, acionavel: d < 2.4 });
        }
      }
      if (lista.length) fora.push(lista);
    }

    if (Heli && Heli.group) {
      const d = P.distanceTo(Heli.group.position);
      if (d < OLHAR_LONGE) {
        fora.push([{ id: 'heli', txt: 'PILOTAR HELICÓPTERO', pos: _pto(Heli.group.position.x, Heli.group.position.y, Heli.group.position.z), raio: 5, casca: CASCA.heli, acionavel: d < 5 }]);
      }
    }

    /* O VEÍCULO é sempre o `nearest` do JOGO, nunca o que a mão apontar: quem
       entra no carro é `tryToggleCar`, e marcar outro seria mentir. */
    if (Car && Car.nearest) {
      const near = Car.nearest(P);
      if (near && near.v && near.v.group && near.d < OLHAR_LONGE) {
        const nome = (near.v.cfg && near.v.cfg.name) || 'VEÍCULO';
        fora.push([{ id: 'carro', txt: 'ENTRAR — ' + nome, pos: _pto(near.v.group.position.x, near.v.group.position.y, near.v.group.position.z), raio: 4.5, casca: CASCA.carro, acionavel: near.d < 4.5 }]);
      }
    }

    return fora;
  }

  const _pto = (x, y, z) => ({ x, y: y || 0, z });

  /* Dentro da classe escolhida, quem decide é a MÃO: perto vence por distância
     (grab direto), longe vence por ÂNGULO (distance grab). É a divisão que a
     Meta documenta — e não se combina distância com ângulo num score só,
     porque aí um alvo distante e bem apontado perderia para um encostado nas
     costas do jogador. */
  function escolher(lista) {
    let melhorPerto = null, dPerto = Infinity;
    let melhorLonge = null, cosLonge = CONE;
    for (const c of lista) {
      if (!c.pos) { if (!melhorPerto && !melhorLonge) melhorLonge = melhorLonge || c; continue; }
      _v.set(c.pos.x, c.pos.y, c.pos.z);
      const d = _v.distanceTo(_maoPos);
      if (d <= ALCANCE_MAO) {
        if (d < dPerto) { dPerto = d; melhorPerto = c; }
        continue;
      }
      _v2.copy(_v).sub(_maoPos);
      if (_v2.lengthSq() < 1e-6) continue;
      const cos = _v2.normalize().dot(_maoDir);
      if (cos > cosLonge) { cosLonge = cos; melhorLonge = c; }
    }
    /* `porMao` é a MARCA DE PROCEDÊNCIA do alvo, e ela decide se o agarre à
       distância pode acontecer. Sem essa marca, o fallback de proximidade lá
       embaixo devolveria um alvo às costas do jogador e o grip apontado para o
       nada o agarraria — que é, palavra por palavra, o "comando de proximidade
       do corpo" que a régua reprova. O alvo continua sendo MARCADO (o jogador
       precisa ver que há algo ali); o que ele não pode é ser AGARRADO. */
    if (melhorPerto) { melhorPerto.porMao = true; return melhorPerto; }
    if (melhorLonge) { melhorLonge.porMao = true; return melhorLonge; }
    /* Mão apontando para o outro lado: em vez de apagar o aviso (o jogador
       ficaria sem saber que há algo ali), cai no mais perto do JOGADOR — que é
       exatamente o critério que js/interact.js já usa, e pela MESMA régua. */
    let melhor = null, dj = Infinity;
    for (const c of lista) {
      if (!c.pos) continue;
      const d = hipot(_ref.x, _ref.z, c.pos.x, c.pos.z);
      if (d < dj) { dj = d; melhor = c; }
    }
    return melhor || lista[0] || null;
  }

  /* ---------------------------------------------------------------- */
  /* MARCADOR — criado DENTRO da sessão, nunca no boot. */
  function montar() {
    /* SEGUNDA SESSÃO. `exit()` tira o objeto da cena mas NÃO o joga fora — e a
       versão anterior desta linha era `if (grupo) return`, então a partir da
       segunda entrada em VR o marcador existia, estava "visível" pelo estado, e
       nunca mais voltava para a cena. Medido por validação independente: o
       destaque dos baús sumia para o resto da sessão depois de sair do VR uma
       vez. Reanexar é idempotente e não cria objeto novo. */
    if (grupo) { if (!grupo.parent) scene.add(grupo); return; }
    grupo = new THREE.Group();
    grupo.name = 'xrInteracaoMarcador';
    grupo.visible = false;
    /* anel unitário: o raio real entra pela escala, então o mesmo objeto serve
       para o baú (2,4 m) e para o carro (4,5 m) sem geometria nova */
    anel = new THREE.Mesh(
      new THREE.RingGeometry(0.93, 1, 56),
      new THREE.MeshBasicMaterial({ color: COR_PODE, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    anel.rotation.x = -Math.PI / 2;
    grupo.add(anel);

    const cv = win && win.document ? win.document.createElement('canvas') : null;
    if (cv) {
      cv.width = 512; cv.height = 128;
      ctx = cv.getContext('2d');
      textura = new THREE.CanvasTexture(cv);
      textura.colorSpace = THREE.SRGBColorSpace;
      rotulo = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura, transparent: true, depthWrite: false, depthTest: false }));
      rotulo.scale.set(1.6, 0.4, 1);
      rotulo.renderOrder = 999;   // o rótulo é informação: não pode ficar atrás do baú
      grupo.add(rotulo);
    }
    scene.add(grupo);
    montado = true;
  }

  /* o texto só é redesenhado quando MUDA — repintar canvas a 90 Hz num
     headset é queimar orçamento de frame por nada (mesma disciplina do
     `setPrompt` de js/interact.js) */
  function escrever(txt, podeUsar) {
    if (!ctx || txt === textoNoRotulo) return;
    textoNoRotulo = txt;
    ctx.clearRect(0, 0, 512, 128);
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(8,12,18,0.72)';
    ctx.fillRect(0, 24, 512, 80);
    ctx.fillStyle = podeUsar ? '#9dffb8' : '#ffd7a0';
    ctx.fillText(txt, 256, 64, 480);
    if (textura) textura.needsUpdate = true;
  }

  function mostrar(alvo, dt) {
    montar();
    if (!alvo || !alvo.pos) { if (grupo) grupo.visible = false; return; }
    grupo.visible = true;
    grupo.position.set(alvo.pos.x, alvo.pos.y, alvo.pos.z);
    anel.scale.setScalar(alvo.raio);
    anel.position.y = 0.05;   // fora do z-fighting com o chão
    pulso += dt || 0;
    anel.material.color.setHex(alvo.acionavel ? COR_PODE : COR_LONGE);
    anel.material.opacity = 0.4 + 0.22 * (0.5 + 0.5 * Math.sin(pulso * 3.2));
    if (rotulo) {
      rotulo.position.set(0, 1.35, 0);
      escrever(alvo.acionavel ? alvo.txt : alvo.txt + ' (aproxime-se)', alvo.acionavel);
    }
  }

  /* ---------------------------------------------------------------- */
  /* O RADIAL, DESENHADO. Ver o bloco de constantes lá em cima para o porquê de
     cada número. */

  /* A CABEÇA, sem depender de quem fia. O grafo em XR é contrato desta base:
     `scene > xrRig > camera` (js/xr/xrrig.js `enter()` faz `rig.add(camera)`) e
     os controles são pendurados no MESMO rig (js/xr/xrhands.js `anexar()`).
     Então a cabeça é a câmera irmã da mão. Sem mão não há radial, e sem radial
     não se pergunta pela cabeça — por isso a busca sai daqui e não da cena. */
  function cabecaDaMao(mao, out) {
    const rig = mao && mao.parent;
    if (!rig) return null;
    if (rig !== _rigDaMao) { _rigDaMao = rig; _camDoRig = null; }
    if (!_camDoRig || _camDoRig.parent !== rig) {
      _camDoRig = null;
      for (const o of rig.children) if (o.isCamera) { _camDoRig = o; break; }
      if (!_camDoRig) return null;
    }
    _camDoRig.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(_camDoRig.matrixWorld);
  }

  function montarRadial() {
    // mesmo defeito de segunda sessão do `montar()` — ver o comentário lá
    if (radial) { if (!radial.parent) scene.add(radial); return; }
    const cv = win && win.document ? win.document.createElement('canvas') : null;
    if (!cv) return;
    cv.width = RADIAL_CV; cv.height = RADIAL_CV;
    radialCtx = cv.getContext('2d');
    radialTex = new THREE.CanvasTexture(cv);
    radialTex.colorSpace = THREE.SRGBColorSpace;
    radial = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTex, transparent: true, depthWrite: false, depthTest: false, fog: false,
    }));
    radial.name = 'xrRadialMenu';
    radial.scale.set(RADIAL_W, RADIAL_W, 1);
    radial.renderOrder = 1200;   // é menu: nada do mundo passa na frente
    radial.visible = false;
    scene.add(radial);
  }

  /* Ângulo do CENTRO de cada fatia no canvas. A fatia 0 é CIMA, e em canvas o
     zero de `arc` é +X e o Y cresce para baixo: cima é −90°. A ordem
     (cima, direita, baixo, esquerda) é o contrato de `RADIAL_FATIAS`. */
  const anguloDaFatia = i => (-90 + i * 90) * Math.PI / 180;

  function pintarRadial(fatia) {
    const c = radialCtx;
    if (!c) return;
    const M = RADIAL_CV / 2, R = RADIAL_R_PX, Q = RADIAL_MIOLO_PX;
    c.clearRect(0, 0, RADIAL_CV, RADIAL_CV);
    /* Fundo em 0,90 de alfa e não menos: com 0,78 sobre um céu claro o texto
       branco caía para 3,7:1, e a WCAG 2.1 que a Meta adota pede 4,5:1. */
    c.beginPath(); c.arc(M, M, R, 0, Math.PI * 2);
    c.fillStyle = 'rgba(10,14,20,0.90)'; c.fill();
    c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.30)'; c.stroke();

    // a fatia escolhida é a ÚNICA acesa — é ela que sai se o jogador soltar
    if (fatia >= 0) {
      const a = anguloDaFatia(fatia), meia = Math.PI / 4;
      c.beginPath();
      c.arc(M, M, R, a - meia, a + meia);
      c.arc(M, M, Q, a + meia, a - meia, true);
      c.closePath();
      c.fillStyle = 'rgba(92,226,122,0.92)'; c.fill();
    }
    // divisórias: dizem que são QUATRO direções, mesmo com nenhuma escolhida
    c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.22)';
    for (let i = 0; i < 4; i++) {
      const a = anguloDaFatia(i) + Math.PI / 4;
      c.beginPath();
      c.moveTo(M + Math.cos(a) * Q, M + Math.sin(a) * Q);
      c.lineTo(M + Math.cos(a) * R, M + Math.sin(a) * R);
      c.stroke();
    }

    // MIOLO: aceso quando soltar ali CANCELA, que é o estado de polegar parado
    c.beginPath(); c.arc(M, M, Q, 0, Math.PI * 2);
    c.fillStyle = fatia < 0 ? 'rgba(255,138,110,0.92)' : 'rgba(10,14,20,0.95)';
    c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.28)'; c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `bold ${RADIAL_FONTE_MIOLO_PX}px system-ui, sans-serif`;
    c.fillStyle = fatia < 0 ? '#2a0f08' : '#ffd0c0';
    c.fillText('CANCELA', M, M, Q * 1.7);

    /* Rótulos no meio da faixa. Quebra no espaço em vez de espremer a letra: as
       fatias da esquerda e da direita têm metade da largura do canvas, e
       "KIT MÉDICO" numa linha só sairia condensada a 72%. */
    c.font = `bold ${RADIAL_FONTE_PX}px system-ui, sans-serif`;
    const raio = (R + Q) / 2;
    for (let i = 0; i < 4; i++) {
      const a = anguloDaFatia(i);
      const x = M + Math.cos(a) * raio, y = M + Math.sin(a) * raio;
      const linhas = (RADIAL_FATIAS[i].rotulo || '').split(' ');
      const largura = (i === 1 || i === 3) ? RADIAL_CV / 2 - 24 : RADIAL_CV - 24;
      c.fillStyle = i === fatia ? '#0b1420' : '#e8f2ff';
      const alt = RADIAL_FONTE_PX * 1.1;
      const y0 = y - (linhas.length - 1) * alt / 2;
      for (let k = 0; k < linhas.length; k++) c.fillText(linhas[k], x, y0 + k * alt, largura);
    }
    if (radialTex) radialTex.needsUpdate = true;
  }

  /* Onde o disco NASCE: na direção olho→mão, a uma distância confortável de
     leitura. Guardado como deslocamento até `player.pos` — o disco fica parado
     em relação ao CORPO, não ao pulso e não à cabeça. */
  function nascerRadial(mao) {
    const cab = cabecaDaMao(mao, _cabRadial);
    if (!cab) return false;
    mao.updateWorldMatrix(true, false);
    _v.setFromMatrixPosition(mao.matrixWorld).sub(cab);
    let d = _v.length();
    if (!(d > 1e-4)) { _v.set(0, 0, -1); d = 1; }
    _v.divideScalar(d);
    const dist = Math.min(RADIAL_PERTO_MAX, Math.max(RADIAL_PERTO_MIN, d));
    _radialPos.copy(cab).addScaledVector(_v, dist);
    _radialOff.copy(_radialPos).sub(player.pos);
    return true;
  }

  function desenharRadial(est, mao, cabPassada) {
    const aberto = !!(est && est.aberto);
    if (!aberto) {
      if (radial) radial.visible = false;
      radialNasceu = false;
      return;
    }
    if (!radialNasceu) {
      montarRadial();
      if (!radial || !nascerRadial(mao)) { if (radial) radial.visible = false; return; }
      radialNasceu = true;
      radialFatiaPintada = null;
    }
    _radialPos.copy(player.pos).add(_radialOff);
    /* I3: nada a menos de 0,15 m do olho. O disco não persegue ninguém — mas se
       a cabeça avançar para cima dele, ele sai do caminho pelo eixo olho→disco.
       É correção, e não o comportamento normal: nascendo a 0,42 m, só age se o
       jogador avançar 12 cm com o menu aberto. */
    const cab = cabPassada || cabecaDaMao(mao, _cabRadial);
    if (cab) {
      _v.copy(_radialPos).sub(cab);
      const d = _v.length();
      if (d < RADIAL_MIN_OLHO) {
        if (d > 1e-4) _v.divideScalar(d); else _v.set(0, 0, -1);
        _radialPos.copy(cab).addScaledVector(_v, RADIAL_MIN_OLHO);
      }
    }
    radial.position.copy(_radialPos);
    radial.visible = true;
    const f = est.fatia >= 0 ? est.fatia : -1;
    if (f !== radialFatiaPintada) { radialFatiaPintada = f; pintarRadial(f); }
  }

  /* ---------------------------------------------------------------- */
  /* GESTO. Lê a EMPUNHADURA da mão de apoio (botão 1 do xr-standard) direto da
     fonte de entrada. `inputSources` NÃO é Array no navegador nativo, e o
     emulador faz `class XRInputSourceArray extends Array` — `Array.isArray`
     diverge entre os dois, então os três formatos são aceitos. */
  function gripDaMao(fontes, qual) {
    if (!fontes) return false;
    let lista;
    if (Array.isArray(fontes)) lista = fontes;
    else if (typeof fontes[Symbol.iterator] === 'function') lista = Array.from(fontes);
    else if (typeof fontes.length === 'number') lista = Array.prototype.slice.call(fontes);
    else return false;
    for (const f of lista) {
      if (!f || f.handedness !== qual) continue;
      const b = f.gamepad && f.gamepad.buttons && f.gamepad.buttons[1];
      return !!(b && b.pressed);
    }
    return false;
  }

  /* O EVENTO É DE VERDADE. `justPressed` cobre js/interact.js, mas o baú do BR
     escuta `keydown` no window (br-game.js:1828): sem evento real ele nunca
     abre. E o game.js tem um listener global de `keydown` que popula
     `keys`/`justPressed` (game.js:1433) — então UM `dispatchEvent` alcança os
     dois caminhos, que é o mesmo truque de js/touchcontrols.js no celular.
     O `keyup` sai junto de propósito: sem ele `keys[code]` fica preso em true
     para sempre e a tecla nunca mais acusa borda. */
  function acionar(code = 'KeyE') {
    if (!win || typeof win.KeyboardEvent !== 'function') return false;
    const op = { code, key: code, bubbles: true, cancelable: true };
    try {
      win.dispatchEvent(new win.KeyboardEvent('keydown', op));
      win.dispatchEvent(new win.KeyboardEvent('keyup', op));
    } catch { return false; }
    return true;
  }

  /* Distância da mão à CASCA do alvo. Negativa quer dizer mão dentro do volume,
     e isso continua sendo agarre direto. */
  function aCasca(alvo) {
    if (!alvo || !alvo.pos) return Infinity;
    _v.set(alvo.pos.x, alvo.pos.y, alvo.pos.z);
    return _v.distanceTo(_maoPos) - (alvo.casca || 0);
  }

  /* Velocidade da mão projetada no sentido CONTRÁRIO ao apontar — é o puxão.
     Empurrar dá negativo e não conta. Sem quadro anterior, ou sem dt, dá zero:
     um frame de teleporte da mão (recenter, retomada de sessão) não pode virar
     um agarre que ninguém pediu. */
  function puxao(dt) {
    if (!temAnterior || !(dt > 0)) return 0;
    _vel.copy(_maoPos).sub(_maoAnt).divideScalar(dt);
    return -_vel.dot(_maoDir);
  }

  /* ---------------------------------------------------------------- */
  function update({ maoRaio, maoPunho, fontes, usar = false, dt = 0, radial: radialEst } = {}) {
    const mao = maoPunho || maoRaio;
    if (mao) {
      mao.updateWorldMatrix(true, false);
      mao.getWorldPosition(_maoPos);
      (maoRaio || mao).updateWorldMatrix(true, false);
      (maoRaio || mao).getWorldQuaternion(_q);
      /* `getWorldDirection` devolve o +Z do objeto — só `Camera` devolve -Z.
         Usado direto aqui, a mão apontaria para trás. */
      _maoDir.set(0, 0, -1).applyQuaternion(_q);
    } else {
      _maoPos.copy(player.pos); _maoPos.y += 1.4;
      _maoDir.set(0, 0, -1);
    }

    const grupos = classes();
    alvoAtual = grupos.length ? escolher(grupos[0]) : null;
    mostrar(alvoAtual, dt);

    const grip = gripDaMao(fontes, 'left');
    const bordaGrip = grip && !gripAntes;
    const bordaUsar = !!usar && !usarAntes;
    /* Retenção do grip: zera no aperto e cresce enquanto ele fica apertado. É
       o relógio do agarre à distância, e ele mora fora do `if` do alvo porque
       trocar de alvo no meio não pode reiniciar a contagem. */
    if (bordaGrip) gripSeguraT = 0;
    else if (grip) gripSeguraT += Math.max(0, dt);
    else gripSeguraT = 0;

    /* DOIS VERBOS.
       · DIRETO: a mão está encostada na casca. Vale na borda, sem fricção.
       · DISTÂNCIA: o alvo está apontado (o `escolher` já fez o magnetismo) e a
         confirmação é o PUXÃO ou a RETENÇÃO. Nunca a borda seca: o grip
         apertado sozinho, de longe, é justamente o comando de proximidade do
         corpo que a régua reprova. */
    /* O ALCANCE DE GAMEPLAY MANDA. `acionavel` é a leitura do raio que
       js/interact.js e o BR já usam; sem esta guarda o gesto emitiria a tecla
       para um baú a 7,5 m — o jogo recusaria, mas a camada de VR estaria
       pedindo, e pedir é o começo de qualquer vetor de trapaça. */
    const perto = alvoAtual && aCasca(alvoAtual) <= RAIO_AGARRE;
    let modo = null;
    if (alvoAtual && alvoAtual.acionavel && grip) {
      if (perto) { if (bordaGrip) modo = 'direto'; }
      else if (alvoAtual.porMao && !agarrouNesteAperto &&
        (puxao(dt) >= FLICK_VEL || gripSeguraT >= HOLD_LONGE)) modo = 'distancia';
    }
    // um aperto, um agarre — segurar não pode entrar e sair do carro em rajada
    if (modo) agarrouNesteAperto = true;
    if (!grip) agarrouNesteAperto = false;

    gripAntes = grip;
    usarAntes = !!usar;
    _maoAnt.copy(_maoPos);
    temAnterior = true;

    /* APERTAR não é SEGURAR: sem a borda, o botão "usar" viraria rajada. */
    const gesto = !!modo || bordaUsar;
    // com `despachar: false` quem emite o teclado é a ponte do game.js (ver o
    // cabeçalho): aqui só sai o sinal, e a ação nunca dispara duas vezes
    const acionou = gesto && despachar ? acionar('KeyE') : false;

    /* RADIAL — os quatro verbos que não couberam em botão (D1). A máquina de
       estado é de js/xr/xrinput.js; aqui sai o EVENTO, porque é este módulo que
       tem `window`.

       QUEM EMITE DEPENDE DE QUEM CHAMA, e a razão é a ORDEM DO FRAME:

       · SEM `radial` no parâmetro, este módulo lê as fontes sozinho e despacha.
         Isso alcança tudo o que escuta `keydown` de verdade (o baú do BR é
         assim), e faz o verbo existir mesmo sem ponte nenhuma.
       · COM `radial` vindo da ponte, quem despacha é ELA, e este módulo se
         cala. Não é preferência: `shootUpdate` (game.js:3536) lê `justPressed`
         ANTES de este `update` rodar (3550), e `justPressed.clear()` (3635)
         apaga tudo no fim do mesmo frame. Um code escrito aqui nunca é visto
         por `shootUpdate` — foi medido, não suposto. As quatro teclas do radial
         são lidas exatamente ali, então elas PRECISAM ser escritas cedo, pela
         ponte, com `teclaXR`. Emitir nos dois lugares dispararia o evento duas
         vezes para quem escuta `keydown`.

       E O DESENHO RODA SEMPRE. A máquina local existia só no caso sem ponte;
       agora ela roda todo frame porque é ela que alimenta o DISCO (D4). As duas
       instâncias são alimentadas pelas MESMAS fontes no MESMO frame, então
       dizem a mesma coisa — o que continua valendo é a divisão de quem
       DESPACHA, que é o parágrafo acima. */
    if (!radialLocal) radialLocal = criarRadialXR();
    const radialLido = radialLocal.ler(fontes);
    let verbo;
    if (radialEst !== undefined) verbo = null;   // a ponte é a dona do despacho
    else verbo = radialLido.confirmou;
    if (verbo && despachar) acionar(verbo);
    /* O disco lê o estado da PONTE quando ela existe (é o que despacha), e o
       local quando não existe. Um só desenho, uma só verdade. */
    desenharRadial(radialEst && typeof radialEst === 'object' ? radialEst : radialLido, mao);

    return { alvo: alvoAtual, gesto, acionou, modo, verbo };
  }

  function exit() {
    if (grupo) { grupo.visible = false; if (grupo.parent) grupo.parent.remove(grupo); }
    /* O disco também sai da cena: sem isto ele fica flutuando no mundo do
       monitor depois que o jogador tira o headset. */
    if (radial) { radial.visible = false; if (radial.parent) radial.parent.remove(radial); }
    radialNasceu = false; radialFatiaPintada = null;
    _rigDaMao = null; _camDoRig = null;
    montado = false;
    alvoAtual = null;
    gripAntes = false; usarAntes = false;
    gripSeguraT = 0; agarrouNesteAperto = false; temAnterior = false;
  }

  return {
    update, exit, acionar,
    get montado() { return montado; },
    get radial() { return radial; },
    estado: () => ({
      alvo: alvoAtual ? {
        id: alvoAtual.id, txt: alvoAtual.txt, raio: alvoAtual.raio,
        casca: alvoAtual.casca || 0,
        acionavel: !!alvoAtual.acionavel,
        pos: alvoAtual.pos ? [alvoAtual.pos.x, alvoAtual.pos.y, alvoAtual.pos.z] : null,
      } : null,
      aCasca: aCasca(alvoAtual),
      /* METADE DE UM PAR NÃO É CONSERTO. O radial ganhou `visible && parent`
         quando validação independente mostrou que a API mentia com o objeto
         fora do grafo — e este aqui, que é o mesmo defeito no mesmo arquivo,
         ficou para trás. `visible: true` sem pai é invisível na tela e
         "visível" na API. */
      marcadorVisivel: !!(grupo && grupo.visible && grupo.parent),
      marcadorNaCena: !!(grupo && grupo.parent),
      mao: [_maoPos.x, _maoPos.y, _maoPos.z],
      direcao: [_maoDir.x, _maoDir.y, _maoDir.z],
      /* DE ONDE ESTE MÓDULO MEDIU o alcance neste frame — a mesma régua de
         js/interact.js. Divergir dela é o marcador mentir sobre a ação. */
      alcance: [_ref.x, _ref.y, _ref.z],
      /* O DISCO. Só POSIÇÃO e estado: quem calcula distância e ângulo é quem
         mede, com a própria leitura da cabeça — números que se conferem
         sozinhos não conferem nada. */
      radial: {
        existe: !!radial,
        /* `visible` NÃO BASTA, e isso custou um defeito inteiro: `exit()` tira o
           objeto da cena sem mexer em `visible`, então o estado reportava
           `visivel: true` com o disco fora do grafo — invisível na tela e
           "visível" na API. Quem pergunta se dá para ver tem de receber as duas
           condições. */
        visivel: !!(radial && radial.visible && radial.parent),
        naCena: !!(radial && radial.parent),
        aberto: radialNasceu,
        fatia: radialFatiaPintada === null ? -1 : radialFatiaPintada,
        pos: radial && radial.visible ? radial.position.toArray() : null,
      },
    }),
  };
}
