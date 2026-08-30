/* ================================================================
   A ARMA NA MÃO EM VR — empunhadura, linha de mira e ADS físico.

   POR QUE ISTO EXISTE. Pendurar a arma no controle e reaproveitar o ADS de
   mouse produz exatamente a experiência que o dono do projeto reprovou: "a
   mira e a forma de mirar estão horríveis... não consigo ver o buraco da mira
   da arma, de forma real" e "o corpo onde segura a arma parece deslocado do
   centro". São QUATRO defeitos distintos, e este módulo resolve os quatro.
   O estudo completo, com fontes, está em docs/vr/referencia-arma-mira.md.

   1. O ESPAÇO ERRADO. A spec do WebXR define dois espaços por controle:
      `targetRaySpace` ("para onde este controle aponta") e `gripSpace`
      ("if the user was holding a straight rod in their hand, it would be
      aligned with the negative Z axis and the origin rests at their palm").
      A recomendação é literal: "The gripSpace should be used instead to place
      the renderable model of a 'tracked-pointer'". E a diferença NÃO é
      cosmética — decodificando a `gripOffsetMatrix` do config oficial da Meta
      (o mesmo do Quest 3), os dois espaços diferem de **45,4° de inclinação e
      ~5 cm de deslocamento**. Arma no raio de mira = punho 45° torto.

   2. OFFSET DE PC APLICADO NA MÃO. No desktop a arma é filha da CÂMERA e a
      pose é escrita todo frame em coordenadas relativas ao OLHO (hip do fuzil
      = 0.26, −0.185, −0.44). Trocando só o PAI, esse mesmo offset passou a
      significar "meio metro à frente do punho". Por isso este módulo REESCREVE
      a pose depois do `applyFpsCamera`: a pose de VR é da mão, não da tela.
      A âncora usada é a `gripR` do perfil da arma (js/weaponrig.js), que já é
      calibrada contra os GLBs reais.

   3. A MIRA NÃO ERA A DA ARMA. O tiro saía do raio do controle, sem nenhuma
      relação com o desenho das miras. Aqui nasce um objeto — a LINHA DE MIRA —
      posicionado na ocular e orientado pelo eixo óptico `eye → front` do
      perfil ativo, que é a MESMA fonte que o ADS de PC usa. O game.js aponta
      `fonteDaMira()` para ele e o tiro passa a sair pelas miras: alinhar o
      ferro vira a mecânica, não a decoração.

   4. ADS DE BOTÃO. Em VR não existe "aim down sights" animado: o jogador
      ENCOSTA a arma no olho (é para isso que existe a indústria de gunstock).
      Aqui `adsT` deixa de vir do botão e passa a ser MEDIDO — o quanto o olho
      está perto da linha de mira e a que distância da ocular. O que ele
      controla continua sendo o mesmo (espalhamento, recuo, retículo); o que
      sai é mover a arma na frente do jogador, que é enjoo e não game feel.

   DUAS MÃOS (Onward/Pavlov): quando a mão de apoio chega perto da âncora
   `supportHand`, a direção do cano passa a ser a LINHA ENTRE AS MÃOS. A
   transição é SUAVE de propósito: com controles, "a direção que cada mão
   aponta" e "a linha entre as mãos" não coincidem como no mundo real, e o
   engate seco faz a mira SALTAR — é a reclamação clássica do gênero. Engate e
   solta têm histerese, como o "break distance" do Pavlov.

   NADA AQUI É CRIADO NO BOOT: o objeto da linha de mira nasce no primeiro
   frame DENTRO da sessão. Todo `Object3D` gasta 4 números do `Math.random`
   seedado no UUID, e a ordem de consumo é contrato do worldgen.

   ARMADILHA DO THREE: `getWorldDirection` devolve o +Z do objeto — só
   `Camera` sobrescreve para -Z. Toda direção aqui sai do quaternion de mundo
   (`set(0,0,-1).applyQuaternion(q)`), que vale para os dois.
   ================================================================ */

/* Janela de mira: o olho precisa estar ATRÁS da ocular, entre estes limites,
   e perto do eixo. Os números são a "sight picture" possível com o Touch na
   mão — folgados o bastante para não exigir precisão de milímetro, apertados
   o bastante para que a arma no quadril não conte como mirada. */
/* MAIOR QUE `CABECA_RAIO`, e isso é INVARIANTE, não gosto. Enquanto valeu 0,06
   as duas janelas se sobrepunham em 6 cm: medido, recuo de 0,1004 m dava
   `mirando: true` E `naCara: true` — o jogador fazia exatamente o gesto de
   mirar que pediu e a arma DESAPARECIA. Mirar e sumir não podem coexistir; a
   asserção logo abaixo trava isso. */
export const RECUO_MIN = 0.14;   // colado demais: a ocular estaria na pupila
export const RECUO_MAX = 0.45;   // além disso a arma está no quadril
export const PERP_MAX = 0.085;   // desvio lateral do olho até o eixo óptico

/* Guarda-mão: engata perto, solta longe. A histerese impede o liga-desliga
   quando a mão de apoio fica na fronteira. */
export const APOIO_PEGA = 0.20;
export const APOIO_SOLTA = 0.32;

/* A CULATRA NA CARA: a arma SOME, ela não é empurrada. Empurrar seria a
   correção intuitiva e é a errada — ela desgruda a arma da mão, que é
   justamente o defeito que este módulo veio consertar, e o jogador sente a
   arma "escorregando" do punho. O que os jogos do gênero fazem é não deixar o
   jogador ver o interior do modelo; o plano próximo da câmera (0,08 m) já corta
   quase tudo, e este raio é a margem em cima dele. É rede de segurança, não
   mecânica: com o controle na bochecha a ocular fica a ~20 cm do olho, bem
   fora daqui. */
export const CABECA_RAIO = 0.12;

/* O invariante que amarra os dois números acima: NENHUM recuo pode estar ao
   mesmo tempo dentro da janela de mira e dentro do raio que esconde a arma.
   Deixado implícito, isso já produziu o defeito de a arma sumir no gesto
   principal do jogo — e nenhum teste de unidade pegava, porque cada constante
   estava "certa" sozinha. */
export const JANELAS_SEPARADAS = RECUO_MIN > CABECA_RAIO;

/* ================================================================
   SEGURAR, COLDREAR, VER A JANELA DE MIRA E RECARREGAR COM A MÃO.

   O dono do jogo reprovou três coisas de uma vez: "a mira e segurar a arma...
   precisamos de um botão, que segura e ele mira... inclusive segurar a arma e
   recarregar e mirar, isso está completamente bugado". Medido no produto, eram
   QUATRO defeitos distintos, e nenhum deles era a mecânica:

   1. NÃO EXISTIA EMPUNHADURA. A arma era solda na mão — sem empunhar, sem
      soltar, sem coldre. O verbo "segurar" não tinha implementação.
   2. O BOTÃO DE MIRAR NÃO MOSTRAVA NADA. Ele acendia `mouse.aiming`, e a pose
      da arma era reescrita por `aplicar()` logo depois: o jogador apertava e a
      tela não mudava.
   3. A JANELA DE MIRA ERA INVISÍVEL. O ADS físico já funcionava (medido: acende
      em 1,000 com o olho a 0,220 m atrás da ocular), mas fora da janela nada
      acontecia — sem dica, sem tolerância, sem sinal de "está quase". O jogador
      não tinha como descobrir onde ela fica.
   4. A RECARGA ERA UMA MENTIRA NO HEADSET. O `tilt` da coreografia do game.js
      ia para `weaponRoot.quaternion` e era SOBRESCRITO aqui no frame seguinte:
      o pente caía sozinho e uma mão esquerda de MENTIRA fazia o gesto, com a
      mão esquerda real do jogador parada em outro lugar.

   O QUE ESTE MÓDULO PASSA A FAZER, e a fonte de cada decisão
   (docs/vr/referencia-empunhadura-recarga.md, com citação literal):

   · O GRIP DIREITO SEGURA E GUARDA. Sticky (Unity XRI), grip e não gatilho
     (VRC.Quest.Input.2), e SOLTAR É COLDREAR, nunca deixar cair: num battle
     royale perder a arma por erro de botão é perder a partida, e nenhuma fonte
     pede isso. O gesto é o do Body Holsters do Alyx — levar a mão ao slot,
     sentir a vibração, soltar.
   · MIRAR CONTINUA SENDO FÍSICO. Oito de oito FPS de VR medem a mira pelo
     GESTO de trazer a arma ao olho; nenhum tem botão de ADS, e a régua deste
     projeto proíbe teleportar a arma no botão (B4). O botão não move a arma um
     milímetro — e há teste medindo isso em metros e em graus.
   · A JANELA GANHA CORPO NO MUNDO. Um aro na ocular, do tamanho EXATO da
     tolerância lateral (`PERP_MAX`), que acende ANTES da janela e apaga quando
     ela engata — mais o ponto vermelho COLIMADO, desenhado em `(olho.x,
     olho.y, 0)` do espaço da mira, cujo ângulo até o eixo do cano é zero para
     QUALQUER posição do olho. É o "visual and audio cues to indicate which
     object is currently targeted" da Meta, dentro do mundo (D4), e não um
     retículo de DOM colado na cara (H1/H2).
   · A RECARGA VIRA GESTO. O `tilt` passa a ser calculado AQUI, então ele
     sobrevive; o pente só volta quando a mão de apoio REAL chega ao poço; e a
     mão esquerda do modelo deixa de fingir. Os três caminhos (gesto, botão,
     tempo) gastam o MESMO `gun.reloadTime` — transformar acessibilidade em
     desvantagem competitiva num jogo multiplayer é o oposto do que a
     Xbox Accessibility Guideline 107 pede.
   · E A ESCOPETA CARREGA CARTUCHO A CARTUCHO, COM A MÃO. Ela tinha ficado de
     fora: `gun.reloadPerShell` distribui os cartuchos ao longo de
     `gun.reloadTime` no relógio, e no headset isso é um pente-fantasma numa
     arma que não tem pente — medido antes desta rodada, CINCO cartuchos
     entraram sozinhos com a mão de apoio parada a 1,000 m da arma. Agora cada
     chegada da mão à PORTA DE CARREGAMENTO (a âncora `ejection` do perfil) vale
     um cartucho, com rearme por histerese e piso de cadência em
     `gun.reloadPerShell` — o gesto nunca é mais rápido que o relógio. O
     cancelamento e o parcial continuam sendo do game.js: uma regra só para
     desktop e VR.
   · O GRIP ESQUERDO GANHA ORDEM: PENTE → APOIO → AGARRAR, decidida na borda de
     subida e TRAVADA até soltar. A ordem resolve o empate (as duas zonas se
     sobrepõem de verdade) e a trava fecha a porta do agarre à distância, que
     ficava aberta durante o gesto do pente.

   NADA AQUI NASCE NO BOOT. Aro, ponto e pente-fantasma são criados no primeiro
   frame DENTRO da sessão, pelo mesmo motivo do `miraNo`: todo `Object3D` — e
   toda `BufferGeometry`, e todo `Material` — gasta números do `Math.random`
   seedado no UUID, e a ordem de consumo é contrato do worldgen.
   ================================================================ */

/* COLDRE. Posição no espaço da VISTA (yaw da cabeça), a partir da cabeça:
   ombro direito, um palmo abaixo, atrás da linha do ombro. É ergonomia SEM
   LASTRO EXTERNO — nenhum jogo publicou as coordenadas do próprio coldre — e
   fica marcada como tal, para ser corrigida por humano de headset. */
export const COLDRE_OFF = [0.22, -0.28, 0.16];
export const COLDRE_ANIM = 0.20;   // s até a arma chegar às costas (e voltar)

/* A GUIA DA JANELA DE MIRA. Estes dois números são o quanto ANTES da janela a
   affordance começa a aparecer — e existir fora da janela é o ponto todo: uma
   dica que só acende depois que a mira engatou não ensina nada, porque nesse
   instante o jogador já está mirando. */
export const GUIA_FOLGA_RECUO = 0.25;    // m de folga além de RECUO_MIN/MAX
export const GUIA_FOLGA_DESVIO = 0.16;   // m de folga além de PERP_MAX
/* Acima disto o aro apaga: a mira ENGATOU e quem manda agora é o ferro da arma.
   É o comportamento do POPULATION: ONE ("o retículo some ao mirar", NÃO
   VERIFICADO — ver §3 da referência) e é o critério H3 desta base. */
export const GUIA_APAGA_ADS = 0.6;

/* RECARGA. `MAGWELL_MAX` é o quanto a mão de apoio precisa chegar perto do poço
   do carregador para o pente ser aceito; `PEITO_*` é a zona de onde ele é
   sacado. Os dois são ergonomia sem lastro externo (nenhum jogo publicou o
   próprio limiar) e estão marcados como tal. */
export const MAGWELL_MAX = 0.12;
export const PEITO_OFF = [0, -0.45, -0.15];
export const PEITO_RAIO = 0.25;

/* GRANADA e KIT MÉDICO — o gatilho esquerdo virou ADS (Rodada 16) e o radial
   de 4 fatias ficou sem botão (docs/vr/progresso.md, docs/vr/referencia-
   interacao.md Parte III). A pesquisa daquela rodada recomenda a MESMA
   receita do peito: zona corporal fixa (offset de vista, girada pela guinada
   da cabeça) + grip da mão de apoio, sem botão novo e sem menu de invocação.
   Ombro ESQUERDO para granada (o COLDRE já ocupa o ombro direito, atrás —
   `COLDRE_OFF` acima — e sobrepor as duas zonas voltaria a ter um empate
   como pente×apoio); quadril ESQUERDO para o kit médico, abaixo do ombro.
   Ergonomia SEM LASTRO EXTERNO — nenhuma fonte encontrada publica a distância
   exata (referência, Parte III, §12) — marcado como tal, candidato a ajuste
   por humano de headset.

   CORREÇÃO (validação independente, docs/vr/validacao-d59830e.md §2): os
   offsets originais [-0.18,-0.12,-0.05] (ombro) e [-0.15,-0.55,0.02]
   (quadril) colidiam com a zona do PEITO — o centro do quadril caía a
   2,2 mm *dentro* do raio do peito, e `pedeRecargaPulso`/`pedeKitMedicoPulso`
   são checagens independentes (nenhuma consulta a outra, ao contrário do
   pente×apoio, que tem `gripModo` como árbitro) — medido AO VIVO em
   `test/xr-verbo-corporal.test.js` que alcançar o quadril também disparava
   pedido de recarga no mesmo aperto. Os offsets abaixo mantêm o raio de cada
   zona intacto e movem os CENTROS pra fora do peito com folga real (>5 cm de
   sobra além da soma dos raios, não só "não toca no papel") — ombro mais pro
   lado (mesma altura/profundidade de antes), quadril mais pro lado e mais
   baixo (coxa, não quadril alto — ainda plausível para uma zona corporal,
   ergonomia SEM LASTRO do mesmo jeito que os originais). */
export const OMBRO_OFF = [-0.34, -0.12, -0.05];
export const OMBRO_RAIO = 0.18;
export const QUADRIL_OFF = [-0.40, -0.72, 0.02];
export const QUADRIL_RAIO = 0.20;

/* A ESCOPETA, CARTUCHO A CARTUCHO. `PORTA_MAX` é a mesma grandeza do
   `MAGWELL_MAX` — "a mão chegou ao ponto em que a arma recebe munição" — e por
   isso é o mesmo número: um significado, uma medida. `PORTA_REARME` é a
   histerese que transforma FICAR na porta em CHEGAR à porta; sem ela, a mão
   parada na porta pediria um cartucho por frame, que a 72 Hz enche a escopeta
   em 83 ms. É o mesmo rearme do `peitoArmado` e do giro em passos.
   Os dois são ergonomia SEM LASTRO EXTERNO — nenhum jogo publicou o próprio
   limiar (referência §3, item 9) — e ficam marcados como tal. */
export const PORTA_MAX = 0.12;
export const PORTA_REARME = 0.22;
/* Quanto tempo o pedido de recarga feito no PEITO continua valendo como
   "origem: gesto". O game.js só transforma o pulso em `KeyR` no frame
   SEGUINTE, e só chama `startReload` depois disso: quando `gun.reloading`
   acende aqui já se passaram 2–3 frames. A janela é folgada o bastante para
   cobrir isso com carga e curta o bastante para não confundir um gesto que não
   pegou com um aperto de botão feito meio segundo depois. */
export const PEDIDO_JANELA = 0.35;
/* Fases da recarga em fração de `gun.reloadTime`, para que arma lenta e arma
   rápida tenham a MESMA coreografia esticada no tempo certo. */
export const FASE_PENTE_FORA = 0.18;
export const FASE_LIMITE_GESTO = 0.70;   // depois disto o relógio assume sozinho
/* Quanto a arma inclina na recarga. O desktop usa 0,32 rad de arfagem e 0,38 de
   rolagem; em VR isso é aplicado em torno da PALMA (nunca deslocando a arma da
   mão, que quebraria B1), e 60% já é um gesto claramente legível a um palmo do
   rosto sem virar cambalhota. */
export const RECARGA_CANT = 0.60;
/* O boneco nunca estica: a mão do MODELO não se afasta mais que isto da âncora
   do punho, aconteça o que acontecer com o controle real. */
export const MAO_ALCANCE = 0.55;

/* Carência do háptico da janela de mira. A Meta manda "avoid long or
   overlapping haptic effects", e a mira cruza a fronteira dezenas de vezes por
   minuto: sem carência isto vira vibração contínua, que é exatamente o defeito
   que a diretriz nomeia. A referência (§4.5) chega a recomendar NÃO ter pulso
   nenhum aqui; o pedido do dono foi explícito por háptico em toda ação de arma,
   então ele existe, é o pulso mais fraco do vocabulário (0,18 / 12 ms) e só sai
   uma vez a cada `MIRA_CARENCIA_MS`. */
export const MIRA_CARENCIA_MS = 900;

const SUAVIZA_ADS = 14;    // 1/s — sobe rápido, mas não pisca com tremor de mão
const SUAVIZA_MAOS = 12;   // 1/s — transição de uma para duas mãos

const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * Math.max(0, dt || 0)));
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const suave = (v, a, b) => { const k = clamp01((v - a) / (b - a || 1)); return k * k * (3 - 2 * k); };

export function createXrWeapon({ THREE, WeaponRig, arsenal }) {
  /* temporários: nada de alocar por frame dentro do loop de render */
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  const _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3();
  const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  const _m = new THREE.Matrix4(), _mInv = new THREE.Matrix4();
  const _ocular = new THREE.Vector3(), _eixo = new THREE.Vector3();
  const _apoioMundo = new THREE.Vector3();
  const _punhoMundo = new THREE.Vector3(), _apoioMao = new THREE.Vector3();

  let miraNo = null;          // o objeto que o game.js usa como fonte da mira
  let armaDoNo = null;        // de qual arma ele é filho hoje
  let cache = null;           // geometria da mira/empunhadura da arma atual
  let chaveCache = '';

  const _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3();
  const _qCant = new THREE.Quaternion(), _eCant = new THREE.Euler(), _eYaw = new THREE.Euler();
  const _qPai = new THREE.Quaternion();
  const _coldre = new THREE.Vector3(), _peito = new THREE.Vector3();
  const _ombro = new THREE.Vector3(), _quadril = new THREE.Vector3();
  const _magwell = new THREE.Vector3(), _eixoLocal = new THREE.Vector3();
  const _porta = new THREE.Vector3();   // a porta de carregamento da escopeta
  const _qVista = new THREE.Quaternion();

  let adsT = 0;
  let mistura = 0;            // 0 = uma mão, 1 = duas mãos
  let engatado = false;
  let temApoio = false;
  let medida = { recuo: 0, desvio: 1 };
  let naCara = false;
  let vivo = false;

  /* ---- empunhadura ---- */
  let coldreK = 0;            // 0 = na palma, 1 = nas costas
  let empunhadaAntes = true;

  /* ---- affordance da janela de mira ---- */
  let guiaAro = null, guiaPonto = null, guiaOpac = 0, guiaPerto = 0;
  let miraDentroAntes = false, miraUltimoPulso = -1e9;

  /* ---- recarga ---- */
  let recEstado = 'ociosa';
  let recVia = null;
  let recEvento = null;       // CONGELADO na transição: a 72 Hz o frame escapa do poll
  let recPenteNaMao = false;
  let penteFantasma = null;
  let pedeRecargaPulso = false;
  let peitoArmado = true;     // a mão precisa SAIR do peito para pedir de novo
  let pedidoT = -1e9;         // quando o peito pediu: decide a ORIGEM da recarga
  let pedeGranadaPulso = false, pedeKitMedicoPulso = false;
  let ombroArmado = true, quadrilArmado = true;   // mesma histerese do peito
  let gripDOmbro = Infinity, gripDQuadril = Infinity;

  /* ---- recarga CARTUCHO A CARTUCHO (escopeta) ---- */
  let recPorCartucho = false;
  let recOrigem = null;       // 'gesto' (a mão manda) | 'botao' (o relógio manda)
  let recCartuchos = 0;
  let recUltimoCartuchoT = -1e9;
  let portaArmada = true;     // a mão precisa SAIR da porta para o próximo cartucho
  let cartuchoPulso = false;  // UM frame: há um cartucho a creditar agora
  let recEventoCartucho = null;   // CONGELADO no frame do crédito

  /* ---- prioridade do grip ESQUERDO (referência §4.3) ---- */
  let gripModo = 'livre';     // 'livre' | 'pente' | 'apoio' | 'agarrar'
  let gripAntes = false;
  let gripDesdeT = 0;
  let gripDPeito = Infinity;  // mão de apoio ↔ zona do carregador, em metros
  let gripDApoio = Infinity;  // mão de apoio ↔ linha do cano, em metros

  /* Um relógio de jogo só é confiável enquanto o jogo o passa; guardamos o
     último para que `recarga()` responda coerente entre frames. */
  let tAgora = 0;
  let gunAtual = null;
  /* O segmento `gripR → muzzle` no mundo, do frame anterior: é a LINHA em que
     a mão de apoio pega (ver o bloco do apoio em `aplicar`). */
  const _gripMundo = new THREE.Vector3(), _muzzleMundo = new THREE.Vector3();
  let temSegmento = false;

  /* Coordenadas efetivas da mira: o perfil traz um conjunto calibrado contra o
     GLB e outro de fallback pro modelo procedural. Mesma regra do
     `sightCoords` de js/weaponrig.js — repetida aqui, e não importada, porque
     lá ela é interna; se um dia virar exportada, esta some. */
  function coordsDaMira(gun, sight) {
    if (!sight) return null;
    return (gun.modelStatus === 'fallback' && sight.fb) ? sight.fb : sight;
  }

  /* Geometria da arma em espaço LOCAL do `gun.group`:
       eye  — a ocular (onde o olho encosta)
       bore — o eixo óptico, normalizado (eye → front)
       grip — o punho, que vai coincidir com a palma
       apoio— o guarda-mão, alvo da mão de apoio
       qAlinha — leva `bore` para o -Z: é a mesma conta do `computePose` do
                 rig de PC, e é o que faz o eixo óptico e o -Z concordarem. */
  function geometria(gun) {
    const idx = arsenal ? arsenal.indexOf(gun) : -1;
    const perfil = idx >= 0 && WeaponRig.inspect ? WeaponRig.inspect(idx) : null;
    const anchors = (perfil && perfil.anchors) || {};
    const sight = WeaponRig.activeSight ? WeaponRig.activeSight(gun) : null;
    const c = coordsDaMira(gun, sight);

    const eye = new THREE.Vector3();
    const bore = new THREE.Vector3();
    if (c) {
      eye.fromArray(c.eye);
      bore.fromArray(c.front).sub(eye);
    } else {
      /* faca e qualquer arma sem perfil de mira: o eixo é punho → boca. Pior
         referência que a mira, mas infinitamente melhor que o -Z do controle. */
      eye.fromArray(anchors.gripR || [0, 0, 0]);
      bore.fromArray(anchors.muzzle || [0, 0, -1]).sub(eye);
    }
    if (bore.lengthSq() < 1e-10) bore.set(0, 0, -1);
    bore.normalize();

    _r.crossVectors(bore, _u.set(0, 1, 0));
    if (_r.lengthSq() < 1e-8) _r.set(1, 0, 0); else _r.normalize();
    _u.crossVectors(_r, bore).normalize();
    _m.makeBasis(_r, _u, _v1.copy(bore).negate());
    const qAlinha = new THREE.Quaternion().setFromRotationMatrix(_m).invert();

    return {
      eye, bore, qAlinha,
      grip: new THREE.Vector3().fromArray(anchors.gripR || [0, 0, 0]),
      apoio: anchors.supportHand ? new THREE.Vector3().fromArray(anchors.supportHand) : null,
      /* A BOCA, em espaço local do modelo. É ela que dá o SEGMENTO em que a mão
         de apoio pode pousar — e é por isso que a arma nunca estica: o ponto de
         apoio é a projeção da mão sobre `gripR → muzzle`, LIMITADA ao segmento.
         O controle real pode estar dois metros fora; o boneco não sai da arma. */
      muzzle: anchors.muzzle ? new THREE.Vector3().fromArray(anchors.muzzle) : null,
      /* A PORTA DE CARREGAMENTO. É a âncora `ejection` do perfil — na escopeta
         procedural ela cai exatamente sobre a caixinha que `buildShotgun`
         desenha e chama de "porta de carregamento" (0.04, -0.01, 0.04), e nas
         armas de ferrolho é a janela de ejeção. Numa escopeta as duas são o
         mesmo lado do mesmo receptor, e reusar a âncora existente evita
         inventar um número novo para uma coisa que o modelo já marca. Sem
         `ejection` (bazuca, plasma, faca) o campo é nulo e o caminho por
         cartucho nem existe — nenhuma dessas arma tem `parts.pump`. */
      porta: anchors.ejection ? new THREE.Vector3().fromArray(anchors.ejection) : null,
      temMira: !!c,
    };
  }

  function geometriaDe(gun) {
    const sight = WeaponRig.activeSight ? WeaponRig.activeSight(gun) : null;
    const chave = `${arsenal ? arsenal.indexOf(gun) : -1}:${gun.modelStatus || 'procedural'}:${sight ? sight.id : '-'}`;
    if (chave !== chaveCache || !cache) { cache = geometria(gun); chaveCache = chave; }
    return cache;
  }

  /* O objeto da LINHA DE MIRA vive dentro do `gun.group`, então herda recuo,
     troca de arma e animação de mecanismo de graça. Reconciliado por frame
     porque a arma troca — e porque o modelo GLB pode chegar depois. */
  function ajustarMiraNo(gun, geo) {
    if (!miraNo) {
      miraNo = new THREE.Object3D();
      miraNo.name = 'xrLinhaDeMira';
      miraNo.matrixAutoUpdate = true;
    }
    if (armaDoNo !== gun || miraNo.parent !== gun.group) {
      gun.group.add(miraNo);
      armaDoNo = gun;
    }
    miraNo.position.copy(geo.eye);
    miraNo.quaternion.copy(geo.qAlinha).invert();
  }

  /* ================================================================
     A JANELA DE MIRA GANHA CORPO NO MUNDO.

     São DOIS objetos, com papéis opostos e que nunca aparecem juntos:

     · O ARO fica na ocular, no plano perpendicular ao eixo óptico, com raio
       EXTERNO igual a `PERP_MAX` — ou seja, ele não "representa" a tolerância,
       ele É a tolerância desenhada em tamanho natural. Acende progressivamente
       ANTES da janela (é para isso que existem `GUIA_FOLGA_*`) e apaga quando
       o ADS engata: passada a porta, quem manda é o ferro da arma.
     · O PONTO VERMELHO é o colimador. Desenhado em `(olho.x, olho.y, 0)` do
       espaço da mira, com a lente em z = 0, ele tem ângulo ZERO até o eixo do
       cano para QUALQUER posição do olho — que é a definição de red dot, e o
       que faz o jogador poder mirar sem alinhar o rosto.

     Os dois SAEM DO GRAFO quando não valem nada, em vez de ficarem com
     `visible: false`. Não é elegância: objeto com `visible: true` e sem pai não
     é desenhado por ninguém, e um teste que lê `visible` sem perguntar pelo
     grafo já ficou 11 de 12 verde nesta base sobre produto quebrado. Fora do
     grafo, a pergunta "isto está na tela?" tem uma resposta só, e ela custa
     zero draw call quando a resposta é não.
     ================================================================ */
  function criarGuia() {
    if (guiaAro) return;
    const aroGeo = new THREE.RingGeometry(PERP_MAX * 0.86, PERP_MAX, 40);
    guiaAro = new THREE.Mesh(aroGeo, new THREE.MeshBasicMaterial({
      color: 0x8fd8ff, transparent: true, opacity: 0, side: THREE.DoubleSide,
      depthTest: false, depthWrite: false, toneMapped: false,
    }));
    guiaAro.name = 'xrGuiaJanelaMira';
    guiaAro.renderOrder = 10;
    guiaAro.matrixAutoUpdate = true;

    const pontoGeo = new THREE.CircleGeometry(0.0034, 14);
    guiaPonto = new THREE.Mesh(pontoGeo, new THREE.MeshBasicMaterial({
      color: 0xff2b2b, transparent: true, opacity: 0,
      depthTest: false, depthWrite: false, toneMapped: false,
    }));
    guiaPonto.name = 'xrPontoColimado';
    guiaPonto.renderOrder = 11;
    guiaPonto.matrixAutoUpdate = true;
  }

  function noGrafo(obj, pai, dentro) {
    if (!obj) return;
    if (dentro) { if (obj.parent !== pai) pai.add(obj); }
    else if (obj.parent) obj.parent.remove(obj);
  }

  /* Quão perto da janela o olho está, em [0,1], CONTÍNUO e não-zero FORA dela.
     Vale 1 em qualquer ponto de dentro e cai a 0 ao longo da folga declarada —
     é o que transforma "acertei por acaso" em "estou chegando". */
  function proximidadeDaJanela(recuo, desvio) {
    if (!(recuo > 0)) return 0;
    const foraRecuo = recuo < RECUO_MIN ? (RECUO_MIN - recuo)
      : recuo > RECUO_MAX ? (recuo - RECUO_MAX) : 0;
    const foraDesvio = Math.max(0, desvio - PERP_MAX);
    const pr = 1 - clamp01(foraRecuo / GUIA_FOLGA_RECUO);
    const pd = 1 - clamp01(foraDesvio / GUIA_FOLGA_DESVIO);
    return pr * pd;
  }

  /* O pente-fantasma NÃO é objeto com física, e isso é decisão, não atalho:
     POPULATION: ONE resolve a recarga com dois apertos de botão e nenhum pente
     rastreado, e exigir manipulação fina de um objeto solto em pleno tiroteio é
     onde a recarga por gesto costuma virar frustração. Aqui ele é um mesh preso
     à mão de apoio, e o que o jogo cobra é o LUGAR da mão, não a destreza. */
  function criarPente() {
    if (penteFantasma) return;
    const g = new THREE.BoxGeometry(0.036, 0.11, 0.024);
    penteFantasma = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: 0xd8c58a, transparent: true, opacity: 0.92, toneMapped: false,
    }));
    penteFantasma.name = 'xrPenteFantasma';
    penteFantasma.position.set(0, -0.02, -0.05);
    penteFantasma.matrixAutoUpdate = true;
  }

  /* ================================================================
     A RECARGA COMO MÁQUINA DE ESTADOS OBSERVÁVEL.

     Ela não INVENTA tempo: o relógio continua sendo `gun.reloadTime`, e o
     game.js continua dono de `startReload`/`finishReload`. O que nasce aqui é
     (a) a coreografia que o headset mostra e (b) o registro CONGELADO da
     transição — porque a 72 Hz o frame em que ela acontece escapa de qualquer
     `poll`, e medir por amostragem seria medir outra coisa.

     `via` diz por qual dos três caminhos o pente entrou: 'gesto' (a mão chegou
     ao poço), 'tempo' (estourou `FASE_LIMITE_GESTO` e o relógio assumiu) ou
     'botao'. Sem esse campo não há como um teste distinguir "o gesto foi
     exigido" de "o relógio salvou o jogador" — que é a diferença entre a
     mecânica funcionar e ela ser enfeite. */
  function fracaoRecarga(gun, t) {
    if (!gun || !gun.reloading || !(gun.reloadTime > 0)) return -1;
    return clamp01(1 - (gun.reloadEnd - t) / gun.reloadTime);
  }

  function encaixar(via, dist, k, tato) {
    recEstado = 'encaixando';
    recVia = via;
    recPenteNaMao = false;
    recEvento = { via, distancia: dist, k, t: tAgora };
    if (tato) tato.emitir('recarga-pronta', { mao: 'right' });
  }

  /* Tudo que a recarga guarda entre frames, de volta ao repouso. Existe como
     função porque são NOVE campos e esquecer um deixa a próxima recarga
     nascendo com metade do estado da anterior — o tipo de resíduo que só
     aparece na segunda recarga da partida. */
  function zerarRecarga() {
    recEstado = 'ociosa'; recVia = null; recPenteNaMao = false;
    recPorCartucho = false; recOrigem = null; recCartuchos = 0;
    portaArmada = true; cartuchoPulso = false; recEventoCartucho = null;
  }

  /* ================================================================
     A ESCOPETA: UM CARTUCHO POR CHEGADA DA MÃO À PORTA.

     POR QUE ELA NÃO CABE NA MÁQUINA DO PENTE. A recarga por pente tem um FIM
     declarado (`gun.reloadEnd`) e o pente é UM objeto; a da escopeta não tem
     fim — ela acaba quando o tubo enche, quando a reserva acaba ou quando o
     jogador desiste, e cada cartucho é um evento independente que já credita
     munição sozinho (o game.js faz isso desde sempre, e o desktop depende
     disso: "cancelável mantendo o parcial"). Enfiar isso nas fases de
     `FASE_PENTE_FORA`/`FASE_LIMITE_GESTO` produziria um pente-fantasma numa
     arma que não tem pente — que é literalmente o defeito que esta rodada veio
     consertar, só que ao contrário.

     O QUE ESTA MÁQUINA FAZ, e o que ela DEIXA no game.js: ela decide QUANDO um
     cartucho pode entrar; quem credita `mag`/`reserve` continua sendo o
     `updateReload`. Assim o cancelamento, o estorno e o parcial continuam com
     uma regra só para desktop e VR — a referência §4.6 é explícita em não
     inventar uma segunda regra para o headset.

     DUAS TRAVAS, e as duas se medem:
       · REARME — a mão tem de SAIR da porta (`PORTA_REARME`) para o próximo
         cartucho valer. Sem isso, a mão parada na porta pede um cartucho por
         frame e a 72 Hz a escopeta enche em 83 ms.
       · PISO DE CADÊNCIA — nunca mais rápido que `gun.reloadPerShell`, que é o
         MESMO relógio do desktop. Referência §4.1 D5: os três caminhos gastam
         o mesmo tempo, porque transformar VR em vantagem competitiva num jogo
         multiplayer é o oposto do que a Xbox Accessibility Guideline 107 pede.

     E QUEM COMEÇOU MANDA ATÉ O FIM. Se a recarga nasceu do BOTÃO (Y esquerdo,
     ou o `KeyR` do teclado), `recOrigem` é `'botao'` e esta máquina não toca em
     nada: `consumirCartucho()` devolve `null` e o relógio do game.js segue como
     sempre. É a acessibilidade do Firewall Ultra — quem não consegue fazer o
     gesto aperta o botão e carrega na mesma cadência, sem modo separado.
     ================================================================ */
  function passoCartucho(gun, t, apoioMao, tato) {
    if (recEstado === 'ociosa') {
      recPorCartucho = true;
      recCartuchos = 0;
      recUltimoCartuchoT = t;
      portaArmada = true;
      cartuchoPulso = false;
      recEvento = null; recEventoCartucho = null;
      recOrigem = (tAgora - pedidoT) <= PEDIDO_JANELA ? 'gesto' : 'botao';
      recVia = recOrigem;
      recEstado = recOrigem === 'gesto' ? 'cartucho-espera' : 'cartucho-relogio';
    }
    if (recOrigem !== 'gesto') return;

    let d = Infinity;
    if (apoioMao) { apoioMao.getWorldPosition(_v4); d = _v4.distanceTo(_porta); }
    if (d >= PORTA_REARME) {
      portaArmada = true;
      if (recEstado === 'cartucho-entrando') recEstado = 'cartucho-espera';
    }
    /* O piso vem de `gun.reloadPerShell`, que é escrito pelo `startReload` do
       game.js — de propósito: a régua da cadência é a do desktop, e não um
       número que este módulo escolha para si. O fallback só existe para a arma
       que chegar aqui sem ter passado pelo `startReload`. */
    const piso = gun.reloadPerShell > 0
      ? gun.reloadPerShell
      : (gun.reloadTime || 0) / Math.max(1, (gun.magSize || 1) - (gun.mag || 0));
    if (recEstado === 'cartucho-espera' && portaArmada
        && d <= PORTA_MAX && (t - recUltimoCartuchoT) >= piso) {
      portaArmada = false;
      recEstado = 'cartucho-entrando';
      recCartuchos += 1;
      recUltimoCartuchoT = t;
      cartuchoPulso = true;
      /* CONGELADO no frame do crédito: a 72 Hz o instante em que a mão chega à
         porta escapa de qualquer amostragem de fora, e um teste que amostra
         mede outra coisa. */
      recEventoCartucho = { n: recCartuchos, distancia: d, t: tAgora, via: 'gesto' };
      /* A mão de APOIO sente o cartucho sair dela (`cartucho` sai na outra mão
         da que é pedida — ver a tabela de js/xr/xrhaptics.js); a mão da ARMA
         sente ele assentar, e esse pulso é o `recarga-pronta` que o game.js já
         emite ao creditar. Duas mãos, um evento. */
      if (tato) tato.emitir('cartucho', { mao: 'right' });
    }
  }

  function passoRecarga(gun, t, apoioMao, tato) {
    const k = fracaoRecarga(gun, t);
    if (k < 0) {
      zerarRecarga();
      return -1;
    }
    /* A ESCOPETA TEM CAMINHO PRÓPRIO. `parts.pump` é a mesma condição que o
       `startReload`/`updateReload` do game.js usa para escolher a recarga por
       cartucho: uma pergunta, uma resposta, nos dois lados. */
    if (gun.parts && gun.parts.pump) { passoCartucho(gun, t, apoioMao, tato); return k; }
    if (recPorCartucho) zerarRecarga();   // trocou de arma no meio: sem resíduo
    if (recEstado === 'ociosa') {
      /* Recarga COMEÇOU. O crédito de munição acontece só em `finishReload`, e
         é por isso que abortar no meio (coldrear) não come bala nenhuma. */
      recEstado = 'pente-fora'; recVia = null; recEvento = null; recPenteNaMao = false;
    }
    if (recEstado === 'pente-fora' && k >= FASE_PENTE_FORA) {
      recEstado = 'aguardando-pente';
      recPenteNaMao = true;
      if (tato) tato.emitir('pegar', { mao: 'left' });   // o pente na mão de apoio
    }
    if (recEstado === 'aguardando-pente') {
      let d = Infinity;
      if (apoioMao) { apoioMao.getWorldPosition(_v4); d = _v4.distanceTo(_magwell); }
      if (d <= MAGWELL_MAX) encaixar('gesto', d, k, tato);
      else if (k >= FASE_LIMITE_GESTO) encaixar('tempo', d, k, tato);
    }
    return k;
  }

  /* ---------------------------------------------------------------- */
  /* Uma passada por frame, DEPOIS do applyFpsCamera (que escreve a pose de
     desktop no mesmo objeto). Tudo é calculado em mundo e convertido para o
     espaço do PAI no fim — assim funciona com a arma pendurada no punho ou,
     se o gripSpace não existir, no raio de mira, sem mudar uma linha. */
  function aplicar({
    gun, weaponRoot, punho, raio, apoio, cabeca, dt = 0, oculto = false,
    /* NOVOS, e todos OPCIONAIS de propósito: sem a fiação do game.js este
       módulo se comporta exatamente como antes (arma sempre na mão, sem guia,
       sem coreografia de recarga). Fiação pela metade não pode piorar o jogo. */
    t = 0, vista = null, empunhar, apoioBotao, tato = null,
  } = {}) {
    const mao = punho || raio;
    if (!gun || !gun.group || !weaponRoot || !weaponRoot.parent || !mao || !raio) return null;

    vivo = true;
    tAgora = t;
    gunAtual = gun;
    const geo = geometriaDe(gun);
    ajustarMiraNo(gun, geo);

    /* EMPUNHADURA. `undefined` = ninguém ligou o botão ainda: a arma fica na
       mão, que é o comportamento de antes desta rodada. */
    const empunhada = empunhar === undefined ? true : !!empunhar;
    if (empunhada !== empunhadaAntes) {
      if (tato) tato.emitir(empunhada ? 'pegar' : 'coldre', { mao: 'right' });
      empunhadaAntes = empunhada;
    }
    /* Passo LINEAR e não amortecido: `COLDRE_ANIM` é uma duração declarada em
       segundos, e um `damp` exponencial nunca chega ao fim — o que deixaria a
       arma "quase guardada" para sempre e o teste sem número inteiro para
       cobrar. */
    const passoColdre = COLDRE_ANIM > 0 ? Math.max(0, dt) / COLDRE_ANIM : 1;
    coldreK = clamp01(coldreK + (empunhada ? -passoColdre : passoColdre));

    mao.updateWorldMatrix(true, false);
    raio.updateWorldMatrix(true, false);
    weaponRoot.parent.updateWorldMatrix(true, false);
    mao.getWorldPosition(_punhoMundo);

    /* ---- direção do cano ---- */
    raio.getWorldQuaternion(_q1);
    _f.set(0, 0, -1).applyQuaternion(_q1);            // para onde o controle aponta
    _u.set(0, 1, 0).applyQuaternion(_q1);             // o "em cima" do punho: o roll segue o pulso

    temApoio = false;
    /* ================================================================
       O APOIO ENGATA NA LINHA DO CANO, NÃO NUM PONTO.

       O engate era por proximidade da âncora `supportHand`, e outra frente
       mediu que essa âncora é INALCANÇÁVEL por um braço humano: ombro→âncora
       0,9443 m no fuzil (pior na escopeta e na DMR) contra 0,5881 m de braço
       do boneco em escala de VR — resíduo de 0,3924 m, com o cotovelo travado
       em 176,0°. Com `APOIO_PEGA` em 0,20 m, o jogador teria de pôr a mão da
       frente a 0,9–1,07 m do próprio ombro para as duas mãos engatarem. Ou
       seja: B5 estava inalcançável por GEOMETRIA, não por defeito de estado —
       o modo de duas mãos praticamente nunca engatava.

       A saída NÃO é baixar a âncora: ela é geometria do modelo desenhado e tem
       outros leitores (js/weaponrig.js posiciona `gun.parts.handL` nela para o
       desktop). A saída é o guarda-mão DESLIZAR: o que engata é a distância
       PERPENDICULAR da mão ao eixo do cano, com o pé da perpendicular limitado
       ao segmento `gripR → muzzle`. O jogador põe a mão em qualquer ponto
       alcançável da arma e ela pega ali — que é o que a mão faz numa arma de
       verdade, e é o que sobra quando o braço não alcança a ponta.

       O botão NÃO é exigido. O Onward documenta os dois modos ("There are two
       grip options. Proximity and clicking"), e exigir o clique aqui quebraria
       o contrato já verde de `test/xr-weapon.test.js` — que engata só pela
       pose — trocando um defeito por uma regressão. `apoioBotao` continua
       servindo ao GESTO DA RECARGA, que é outra coisa.
       ================================================================ */
    /* UMA MÃO, UM TRABALHO. Enquanto ela carrega o pente ela NÃO está apoiando
       a arma — e sem esta condição as duas coisas disputavam a mesma mão: o
       apoio (que agora engata na LINHA do cano, e por isso alcança muito mais
       pose) prendia a mão do boneco ao guarda-mão no meio da recarga, e o
       gesto do pente voltava a ser mentira. Medido: a mão do modelo ficava a
       0,259 m do controle real em vez de 0,089 m. */
    /* A ESCOPETA CARREGANDO TAMBÉM OCUPA A MÃO. É a mesma regra do pente, e
       pelo mesmo motivo: a mão que leva cartucho à porta não está segurando o
       guarda-mão. Sem esta condição há ainda um efeito pior que o boneco
       mentindo — o apoio muda a direção do cano, o cano move a arma, a arma
       move a PORTA, e a mão persegue um alvo que foge dela. */
    const carregandoCartucho = recPorCartucho && recOrigem === 'gesto'
      && (recEstado === 'cartucho-espera' || recEstado === 'cartucho-entrando');
    const podeApoiar = coldreK < 0.5 && !recPenteNaMao && !carregandoCartucho;
    /* A DISTÂNCIA À LINHA DO CANO É MEDIDA SEMPRE, mesmo quando o apoio não
       pode engatar: é ela que a máquina de prioridade do grip esquerdo lê na
       borda de subida, e medir só quando o apoio está liberado deixaria a
       decisão cega justamente durante a recarga. Medir não engata nada — quem
       engata é o `if` de baixo. */
    gripDApoio = Infinity;
    if (apoio && temSegmento) {
      apoio.updateWorldMatrix(true, false);
      apoio.getWorldPosition(_apoioMao);
      _eixoLocal.copy(_muzzleMundo).sub(_gripMundo);
      const comp = _eixoLocal.length() || 1;
      _eixoLocal.multiplyScalar(1 / comp);
      const s = Math.max(0, Math.min(comp,
        _v5.copy(_apoioMao).sub(_gripMundo).dot(_eixoLocal)));
      _apoioMundo.copy(_gripMundo).addScaledVector(_eixoLocal, s);
      gripDApoio = _apoioMao.distanceTo(_apoioMundo);
    }
    if (apoio && temSegmento && podeApoiar) {
      const d = gripDApoio;
      if (!engatado && d <= APOIO_PEGA) engatado = true;
      else if (engatado && d >= APOIO_SOLTA) engatado = false;
      temApoio = engatado;
      if (engatado) {
        _v2.copy(_apoioMao).sub(_punhoMundo);
        if (_v2.lengthSq() > 0.0025) {                // < 5 cm entre as mãos não define direção
          _v2.normalize();
          mistura = damp(mistura, 1, SUAVIZA_MAOS, dt);
          _f.lerp(_v2, mistura).normalize();
        }
      }
    }
    if (!temApoio) mistura = damp(mistura, 0, SUAVIZA_MAOS, dt);

    /* ---- rotação de mundo do quadro óptico (-Z = cano, +Y ≈ topo da mão) ---- */
    _r.crossVectors(_f, _u);
    if (_r.lengthSq() < 1e-8) _r.crossVectors(_f, _v3.set(0, 1, 0));
    if (_r.lengthSq() < 1e-8) _r.set(1, 0, 0);
    _r.normalize();
    _v3.crossVectors(_r, _f).normalize();
    _m.makeBasis(_r, _v3, _v1.copy(_f).negate());
    _q2.setFromRotationMatrix(_m);                    // rotação de MUNDO do quadro óptico

    /* ---- para o espaço do pai (o punho, ou o raio se não houver grip) ---- */
    weaponRoot.parent.getWorldQuaternion(_q1);
    _q1.invert();
    weaponRoot.quaternion.copy(_q1).multiply(_q2).multiply(geo.qAlinha);

    /* ---- A INCLINAÇÃO DA RECARGA, QUE AGORA SOBREVIVE ----
       Ela era escrita pelo game.js em `weaponRoot.quaternion` e apagada por
       esta função no frame seguinte: no headset o gesto simplesmente não
       existia. Calculada AQUI, ela entra antes da posição — e isso não é
       detalhe de ordem, é o que mantém a arma na mão: a posição é derivada de
       `palma − q·gripR`, então girar ANTES gira a arma EM TORNO da palma, e
       `gripR` continua exatamente em cima dela (B1). Girar depois, ou somar
       deslocamento como o desktop faz (`−tilt·0,07` em Y), desgrudaria a arma
       do punho — que é o defeito que este módulo inteiro veio consertar. */
    const kRec = fracaoRecarga(gun, t);
    if (kRec >= 0) {
      const cant = suave(kRec, 0, 0.16) * (1 - suave(kRec, 0.8, 0.97)) * RECARGA_CANT;
      _eCant.set(cant * 0.32, 0, -cant * 0.38);
      weaponRoot.quaternion.multiply(_qCant.setFromEuler(_eCant));
    }

    _mInv.copy(weaponRoot.parent.matrixWorld).invert();
    _v1.copy(_punhoMundo).applyMatrix4(_mInv);        // a palma, no espaço do pai
    _v2.copy(geo.grip).applyQuaternion(weaponRoot.quaternion);
    weaponRoot.position.copy(_v1).sub(_v2);           // gripR EM CIMA da palma

    /* ---- O COLDRE ----
       Soltar não é DERROPAR: a arma vai para as costas. Num battle royale
       largar a arma no chão por erro de botão é perder a partida, e nenhuma
       fonte do gênero pede isso — o Alyx guarda em coldre de corpo, o
       Contractors deixa até recarregar a arma coldreada. O alvo é montado no
       espaço da VISTA (yaw da cabeça) porque coldre é do CORPO: pendurado na
       mão ele andaria junto com o que se está tentando guardar. */
    if (coldreK > 0 && cabeca) {
      let yaw = 0;
      if (vista) { _eYaw.setFromQuaternion(_qVista.copy(vista), 'YXZ'); yaw = _eYaw.y; }
      _v4.fromArray(COLDRE_OFF).applyAxisAngle(_v5.set(0, 1, 0), yaw).add(cabeca);
      _v4.applyMatrix4(_mInv);                        // o coldre, no espaço do pai
      /* a arma deitada nas costas: cano para baixo, culatra para fora */
      _eYaw.set(-Math.PI * 0.42, yaw, 0.35);
      _qCant.setFromEuler(_eYaw);
      _q2.copy(_q1).multiply(_qCant).multiply(geo.qAlinha);
      weaponRoot.quaternion.slerp(_q2, coldreK);
      _v2.copy(geo.grip).applyQuaternion(weaponRoot.quaternion);
      _v4.sub(_v2);
      weaponRoot.position.lerp(_v4, coldreK);
    }

    /* ---- a culatra na cara: a arma some, não é empurrada (ver CABECA_RAIO) ---- */
    _ocular.copy(geo.eye).applyQuaternion(weaponRoot.quaternion).add(weaponRoot.position)
      .applyMatrix4(weaponRoot.parent.matrixWorld);
    naCara = !!cabeca && _ocular.distanceTo(cabeca) < CABECA_RAIO;
    weaponRoot.visible = !oculto && !naCara;

    /* ---- o SEGMENTO da arma no MUNDO, para o engate da próxima passada ----
       Uma passada de atraso, que é o que o código já fazia com a âncora: o
       engate do frame N usa a arma como ela ficou no frame N−1, e a alternativa
       (recalcular a pose duas vezes) custaria o dobro para mudar milímetros. */
    if (geo.muzzle) {
      _gripMundo.copy(geo.grip).applyQuaternion(weaponRoot.quaternion).add(weaponRoot.position)
        .applyMatrix4(weaponRoot.parent.matrixWorld);
      _muzzleMundo.copy(geo.muzzle).applyQuaternion(weaponRoot.quaternion).add(weaponRoot.position)
        .applyMatrix4(weaponRoot.parent.matrixWorld);
      temSegmento = true;
    } else temSegmento = false;

    /* ---- ADS FÍSICO: o olho está atrás da ocular e perto do eixo? ----
       O EIXO SAI DA POSE FINAL, não de `_f`. `_f` é a direção ANTES da
       inclinação da recarga e antes do coldre; medir por ele diria que o
       jogador está mirando por um eixo óptico que não é o que está desenhado
       na tela. É o mesmo erro de classe de ler o cano depois do disparo e
       medir o recuo — só que aqui o descasamento é de até 13°. */
    _qPai.copy(_q1).invert();
    _eixo.copy(geo.bore).applyQuaternion(weaponRoot.quaternion).applyQuaternion(_qPai).normalize();
    let alvo = 0;
    if (cabeca && geo.temMira) {
      _v1.copy(cabeca).sub(_ocular);
      const proj = _v1.dot(_eixo);
      const recuo = -proj;                            // positivo = olho ATRÁS da ocular
      _v2.copy(_v1).addScaledVector(_eixo, -proj);
      const desvio = _v2.length();
      medida = { recuo, desvio };
      if (recuo >= RECUO_MIN && recuo <= RECUO_MAX) {
        /* borda suave nas duas pontas da janela: nada de ADS piscando quando o
           jogador segura a arma bem na fronteira */
        const janela = Math.min(1, (recuo - RECUO_MIN) / 0.05, (RECUO_MAX - recuo) / 0.10);
        alvo = clamp01(janela) * clamp01(1 - desvio / PERP_MAX);
      }
    } else if (cabeca) {
      medida = { recuo: 0, desvio: cabeca.distanceTo(_ocular) };
    }
    /* Arma guardada não mira: o ADS é uma medida do olho contra a ocular, e com
       a arma nas costas essa medida existe mas não significa nada. */
    if (coldreK > 0.5) alvo = 0;
    adsT = damp(adsT, alvo, SUAVIZA_ADS, dt);

    /* As matrizes de mundo da arma acabaram de ficar velhas (mudamos a pose do
       `weaponRoot` nesta função). Tudo daqui para baixo lê nós FILHOS — a mira,
       o poço do carregador, a mão do modelo — e ler antes de atualizar mediria
       a pose do frame passado. */
    weaponRoot.updateWorldMatrix(false, true);

    /* ---- o poço do carregador, no mundo ----
       Âncora INDEPENDENTE deste módulo: é o nó `mag` do modelo desenhado. Onde
       ele não existe (arma sem pente animado), cai no punho, que também é
       geometria do modelo. */
    if (gun.parts && gun.parts.mag) gun.parts.mag.getWorldPosition(_magwell);
    else _magwell.copy(geo.grip).applyQuaternion(weaponRoot.quaternion).add(weaponRoot.position)
      .applyMatrix4(weaponRoot.parent.matrixWorld);

    /* ---- a porta de carregamento, no mundo ----
       Mesma regra do poço: a âncora `ejection` é do PERFIL da arma, calibrada
       contra o modelo desenhado, e não é gerada aqui. `gun.group` já está com a
       matriz de mundo em dia (o `updateWorldMatrix` logo acima desceu por ele),
       então basta transformar — `localToWorld` não atualiza matriz nenhuma, e
       chamá-lo sem a atualização mediria a pose do frame passado. */
    if (geo.porta) _porta.copy(geo.porta).applyMatrix4(gun.group.matrixWorld);
    else _porta.copy(_magwell);

    /* ---- A JANELA DE MIRA DEIXA DE SER INVISÍVEL ---- */
    const mostraGuia = !oculto && !naCara && coldreK < 0.5 && geo.temMira && weaponRoot.visible;
    guiaPerto = mostraGuia ? proximidadeDaJanela(medida.recuo, medida.desvio) : 0;
    const opacAro = guiaPerto * (1 - suave(adsT, GUIA_APAGA_ADS - 0.15, GUIA_APAGA_ADS)) * 0.85;
    const opacPonto = mostraGuia ? (0.25 + 0.7 * suave(adsT, 0.15, 0.7)) : 0;
    guiaOpac = opacAro;
    if (opacAro > 0.004 || opacPonto > 0.004) criarGuia();
    if (guiaAro) {
      guiaAro.material.opacity = opacAro;
      noGrafo(guiaAro, miraNo, opacAro > 0.004);
      guiaPonto.material.opacity = opacPonto;
      noGrafo(guiaPonto, miraNo, opacPonto > 0.004);
      if (opacPonto > 0.004 && cabeca) {
        /* O COLIMADOR. O olho, trazido para o espaço da mira, define X e Y; o Z
           é a LENTE, sempre em zero. Assim o vetor olho→ponto é (0, 0, −ez),
           que é o eixo óptico exato — ângulo zero para QUALQUER posição do
           olho, que é o que distingue um red dot de um adesivo na tela. */
        miraNo.updateWorldMatrix(true, false);
        _mInv.copy(miraNo.matrixWorld).invert();
        _v5.copy(cabeca).applyMatrix4(_mInv);
        guiaPonto.position.set(_v5.x, _v5.y, 0);
      }
    }

    /* Háptico da janela, na BORDA e com carência — ver MIRA_CARENCIA_MS. */
    const dentroDaJanela = guiaPerto >= 1 && adsT > 0.35;
    if (dentroDaJanela && !miraDentroAntes && (t * 1000 - miraUltimoPulso) >= MIRA_CARENCIA_MS) {
      if (tato) tato.emitir('mira', { mao: 'right' });
      miraUltimoPulso = t * 1000;
    }
    miraDentroAntes = dentroDaJanela;

    /* ---- A RECARGA, COM A MÃO DE VERDADE ---- */
    const maoApoio = apoio || null;
    passoRecarga(gun, t, maoApoio, tato);

    /* A ZONA DO PEITO É MEDIDA SEMPRE, e isso mudou nesta rodada. Ela vivia
       DENTRO do `if (recEstado === 'ociosa')` abaixo, então a distância só
       existia quando não havia recarga rolando — e a máquina de prioridade do
       grip esquerdo, que precisa dela em TODO frame para decidir na borda,
       lia `Infinity` justamente durante a recarga, que é quando a decisão
       importa. */
    gripDPeito = Infinity; gripDOmbro = Infinity; gripDQuadril = Infinity;
    if (maoApoio && cabeca) {
      let yaw = 0;
      if (vista) { _eYaw.setFromQuaternion(_qVista.copy(vista), 'YXZ'); yaw = _eYaw.y; }
      _peito.fromArray(PEITO_OFF).applyAxisAngle(_v5.set(0, 1, 0), yaw).add(cabeca);
      _ombro.fromArray(OMBRO_OFF).applyAxisAngle(_v5.set(0, 1, 0), yaw).add(cabeca);
      _quadril.fromArray(QUADRIL_OFF).applyAxisAngle(_v5.set(0, 1, 0), yaw).add(cabeca);
      maoApoio.getWorldPosition(_v4);
      gripDPeito = _v4.distanceTo(_peito);
      gripDOmbro = _v4.distanceTo(_ombro);
      gripDQuadril = _v4.distanceTo(_quadril);
    }

    /* PEDIDO DE RECARGA POR GESTO: a mão de apoio no peito, com o grip. O
       rearme (`peitoArmado`) existe pelo mesmo motivo do giro em passos —
       manter a mão no peito a 72 Hz pediria uma recarga por frame. */
    pedeRecargaPulso = false;
    if (maoApoio && cabeca && recEstado === 'ociosa' && coldreK < 0.5) {
      const noPeito = gripDPeito <= PEITO_RAIO;
      if (!noPeito) peitoArmado = true;
      else if (peitoArmado && apoioBotao) {
        pedeRecargaPulso = true; peitoArmado = false;
        /* CARIMBO DA ORIGEM. O game.js só transforma este pulso em `KeyR` no
           frame seguinte; quando `gun.reloading` acende aqui, o pulso já
           morreu. Sem o carimbo não há como a recarga saber se nasceu do GESTO
           ou do BOTÃO — e na escopeta essa é a diferença entre "a mão manda"
           e "o relógio manda". */
        pedidoT = tAgora;
      }
    }

    /* GRANADA e KIT MÉDICO POR GESTO — mesma receita do peito acima
       (zona corporal fixa + grip da mão de apoio + rearme por histerese),
       independentes de `recEstado`: pedir uma granada não tem nada a ver
       com o estado da recarga. Cada zona tem o PRÓPRIO armado/rearme —
       segurar o grip e passar do ombro pro quadril no mesmo aperto não pode
       disparar as duas, então cada uma só acende com o grip SUBINDO dentro
       da própria zona (não basta reentrar; `apoioBotao` tem de estar ativo
       nesse instante, do mesmo jeito que o peito exige). */
    pedeGranadaPulso = false;
    if (maoApoio && cabeca) {
      const noOmbro = gripDOmbro <= OMBRO_RAIO;
      if (!noOmbro) ombroArmado = true;
      else if (ombroArmado && apoioBotao) { pedeGranadaPulso = true; ombroArmado = false; }
    }
    pedeKitMedicoPulso = false;
    if (maoApoio && cabeca) {
      const noQuadril = gripDQuadril <= QUADRIL_RAIO;
      if (!noQuadril) quadrilArmado = true;
      else if (quadrilArmado && apoioBotao) { pedeKitMedicoPulso = true; quadrilArmado = false; }
    }

    /* ================================================================
       O GRIP ESQUERDO TEM TRÊS TRABALHOS E UMA ORDEM (referência §4.3).

       PENTE → APOIO → AGARRAR, avaliada UMA vez na borda de subida, e o modo
       escolhido vale ATÉ SOLTAR. As duas metades dessa frase são o conserto, e
       cada uma paga uma dívida diferente:

       · A ORDEM paga o EMPATE. Buscar o pente e apoiar a arma decidiam cada um
         por conta, por frame, e as duas zonas se sobrepõem de verdade — basta o
         jogador atravessar a arma no peito para a mão estar a menos de
         `PEITO_RAIO` do carregador E a menos de `APOIO_PEGA` da linha do cano
         ao mesmo tempo. Sem ordem declarada, quem ganhava era quem o código
         testasse primeiro, o que é uma decisão de projeto tomada por acidente
         de digitação.

       · A TRAVA paga a PORTA DO AGARRE. `js/xr/xrinteract.js` acumula
         `gripSeguraT` enquanto o grip está apertado e dispara o agarre à
         distância em `HOLD_LONGE`; o bloqueio que ele recebe (`apoiando`) é
         lido por frame, mas o TEMPORIZADOR não é zerado enquanto bloqueia. Um
         modo que troca no meio do aperto faz o bloqueio cair com o
         temporizador já estourado, e o agarre dispara no frame seguinte —
         medido antes desta rodada: buscando o pente com a mão a 0,000 m do
         peito, a porta chegou fechada em 0,0 % de 36 frames de aperto, ou seja,
         recarregar apontado para um baú abria o baú. Travando o modo na borda,
         `gripOcupado()` não pode cair enquanto o dedo não subir.

       `livre` é estado de primeira classe, e não "nenhum": ele é o que o
       game.js precisa ler para NÃO fechar a porta com o botão solto.
       ================================================================ */
    const gripAgora = !!apoioBotao;
    if (gripAgora && !gripAntes) {
      const naZonaDoPente = gripDPeito <= PEITO_RAIO;
      /* "Há trabalho de carregador" é `mag < magSize && reserve > 0` — a MESMA
         pergunta que o `startReload` do game.js faz antes de aceitar a recarga.
         Repetida e não importada porque lá ela é local; se um dia virar função
         exportada, esta some. Sem ela, levar a mão ao peito com o pente cheio
         travaria o agarre por nada. */
      const temTrabalho = gun.mag < gun.magSize && gun.reserve > 0;
      const buscandoPente = recEstado === 'aguardando-pente' || recEstado === 'cartucho-espera';
      const empunhada2 = coldreK < 0.5;
      if (empunhada2 && naZonaDoPente && (buscandoPente || (recEstado === 'ociosa' && temTrabalho))) {
        gripModo = 'pente';
      } else if (empunhada2 && gripDApoio <= APOIO_PEGA) {
        gripModo = 'apoio';
      } else {
        gripModo = 'agarrar';
      }
      gripDesdeT = tAgora;
    } else if (!gripAgora) {
      gripModo = 'livre';
    }
    gripAntes = gripAgora;

    /* O PENTE-FANTASMA na mão de apoio, e a MÃO DO MODELO parando de mentir.
       Enquanto o jogador carrega o pente, a mão esquerda do boneco vai para
       onde a mão DELE está (limitada a `MAO_ALCANCE`, para o antebraço não
       esticar); e o pente da arma fica FORA até a mão chegar ao poço — que é o
       acoplamento que faltava: hoje o pente volta sozinho no relógio, com a mão
       do jogador parada em outro lugar. */
    if (recPenteNaMao && maoApoio) criarPente();
    if (penteFantasma) noGrafo(penteFantasma, maoApoio || penteFantasma.parent, !!(recPenteNaMao && maoApoio));

    const magProc = gun.parts && gun.parts.mag && gun.parts.mag.userData
      && gun.parts.mag.userData.authority !== 'clip' && gun.parts.mag.userData.base;
    if (magProc && (recEstado === 'pente-fora' || recEstado === 'aguardando-pente')) {
      const b = gun.parts.mag.userData.base;
      gun.parts.mag.position.y = b.y - 0.19;
      gun.parts.mag.rotation.x = b.rx - 0.55;
    }

    if (gun.parts && gun.parts.handL && gun.parts.handL.userData && gun.parts.handL.userData.base) {
      const hb = gun.parts.handL.userData.base;
      if (temApoio && geo.muzzle) {
        /* A PROJEÇÃO SOBRE O CANO, LIMITADA AO SEGMENTO `gripR → muzzle`. É o
           que garante que a arma nunca estica e que o cotovelo nunca fica
           impossível: o alvo da mão está SEMPRE dentro do comprimento da arma. */
        gun.parts.handL.parent.updateWorldMatrix(true, false);
        _mInv.copy(gun.parts.handL.parent.matrixWorld).invert();
        maoApoio.getWorldPosition(_v4);
        _v4.applyMatrix4(_mInv);                       // a mão real, no espaço do nó
        _eixoLocal.copy(geo.muzzle).sub(geo.grip);
        const comp = _eixoLocal.length() || 1;
        _eixoLocal.multiplyScalar(1 / comp);
        const s = Math.max(0, Math.min(comp, _v5.copy(_v4).sub(geo.grip).dot(_eixoLocal)));
        gun.parts.handL.position.copy(geo.grip).addScaledVector(_eixoLocal, s);
      } else if ((recPenteNaMao || carregandoCartucho) && maoApoio) {
        /* A MÃO DO MODELO SEGUE A MÃO DO JOGADOR — no gesto do pente E no da
           escopeta. Sem o segundo termo, o jogador leva a mão à porta de
           carregamento e a mão do boneco fica plantada no guarda-mão: o gesto
           que o jogo COBRA é o único que a tela não mostra. */
        gun.parts.handL.parent.updateWorldMatrix(true, false);
        _mInv.copy(gun.parts.handL.parent.matrixWorld).invert();
        maoApoio.getWorldPosition(_v4);
        _v4.applyMatrix4(_mInv);
        _v5.copy(_v4).sub(hb.p);
        const d = _v5.length();
        if (d > MAO_ALCANCE) _v4.copy(hb.p).addScaledVector(_v5.multiplyScalar(1 / d), MAO_ALCANCE);
        gun.parts.handL.position.copy(_v4);
      }
    }

    return {
      ads: adsT, mirando: adsT > 0.5 && coldreK < 0.5, duasMaos: temApoio, naCara,
      empunhada, coldre: coldreK, recarga: recEstado,
    };
  }

  /* Sessão acabou (headset tirado, botão do sistema, bateria): o desktop tem
     que voltar intacto, incluindo o objeto da mira saindo do caminho. */
  function exit() {
    if (miraNo && miraNo.parent) miraNo.parent.remove(miraNo);
    /* SAIR DA SESSÃO EMPUNHANDO. Aro, ponto e pente saem do grafo — deixá-los
       pendurados mostraria um pente flutuante e um ponto vermelho no MONITOR
       depois de tirar o headset. E o estado volta a "arma na mão": a próxima
       sessão não pode nascer com a arma coldreada porque a anterior terminou
       com o botão no meio do caminho. */
    if (guiaAro && guiaAro.parent) guiaAro.parent.remove(guiaAro);
    if (guiaPonto && guiaPonto.parent) guiaPonto.parent.remove(guiaPonto);
    if (penteFantasma && penteFantasma.parent) penteFantasma.parent.remove(penteFantasma);
    armaDoNo = null;
    vivo = false;
    adsT = 0; mistura = 0; engatado = false; temApoio = false; naCara = false;
    coldreK = 0; empunhadaAntes = true; temSegmento = false;
    guiaOpac = 0; guiaPerto = 0; miraDentroAntes = false; miraUltimoPulso = -1e9;
    recEvento = null;
    zerarRecarga();
    pedeRecargaPulso = false; peitoArmado = true; pedidoT = -1e9;
    pedeGranadaPulso = false; ombroArmado = true;
    pedeKitMedicoPulso = false; quadrilArmado = true;
    recUltimoCartuchoT = -1e9;
    /* O grip esquerdo volta a `livre`: a próxima sessão não pode nascer com o
       modo travado pelo aperto em que o jogador tirou o headset. */
    gripModo = 'livre'; gripAntes = false; gripDesdeT = 0;
    gripDPeito = Infinity; gripDApoio = Infinity; gripDOmbro = Infinity; gripDQuadril = Infinity;
  }

  return {
    aplicar, exit,
    /* O objeto que o game.js usa como `fonteDaMira()`: `getWorldPosition` dá a
       ocular e o -Z do quaternion de mundo dá o eixo óptico — exatamente o que
       `miraOrigem`/`miraDirecao` já fazem, sem mudar uma linha da conta. */
    miraNode: () => (vivo ? miraNo : null),
    mirando: () => vivo && adsT > 0.5 && coldreK < 0.5,
    ads: () => (vivo ? adsT : 0),
    duasMaos: () => temApoio,
    /* Arma guardada não atira e não recarrega — quem decide é o game.js, que
       tem o gate de tiro; aqui sai só o fato. */
    empunhada: () => coldreK < 0.5,
    coldre: () => coldreK,
    /* Pulso de UM frame: a mão de apoio entrou no peito pedindo recarga. O
       game.js traduz em `KeyR`, que é o mesmo caminho do botão e do teclado —
       gesto novo não pode significar recarga nova. */
    pedeRecarga: () => pedeRecargaPulso,
    /* Pulso de UM frame cada: a mão de apoio entrou no ombro (granada) ou no
       quadril (kit médico) com o grip. O game.js traduz em `KeyG`/`KeyQ`,
       o mesmo caminho já lido por `shootUpdate`/`useMedkit` no teclado — a
       validação de inventário/uso continua sendo a mesma de sempre. */
    pedeGranada: () => pedeGranadaPulso,
    pedeKitMedico: () => pedeKitMedicoPulso,
    /* O ESTADO DA RECARGA, e o registro CONGELADO da transição. `poll` não
       serve: a 72 Hz o frame em que o pente encaixa escapa da amostragem, e um
       teste que amostra mede outra coisa. */
    recarga: () => ({
      estado: recEstado, via: recVia, penteNaMao: recPenteNaMao,
      /* A ESCOPETA, LEGÍVEL DE FORA. `porCartucho` diz que esta recarga é a de
         cartucho a cartucho; `origem` diz QUEM manda nela (o gesto ou o
         relógio); `cartuchos` é quantos o gesto já pediu. Sem `origem` não há
         como um teste distinguir "o gesto foi exigido" de "o botão salvou o
         jogador", que é a diferença entre a mecânica funcionar e ela ser
         enfeite. */
      porCartucho: recPorCartucho, origem: recOrigem, cartuchos: recCartuchos,
      mag: gunAtual ? gunAtual.mag : null,
      reserve: gunAtual ? gunAtual.reserve : null,
    }),
    recargaEventos: () => (recEvento ? { ...recEvento } : null),
    /* O ÚLTIMO CARTUCHO, CONGELADO no frame do crédito: número de ordem,
       distância da mão à porta e o instante. A 72 Hz o frame em que a mão chega
       à porta escapa de qualquer `poll`, e um teste que amostra mede outra
       coisa — é o mesmo motivo do `recargaEventos`. */
    cartuchoEventos: () => (recEventoCartucho ? { ...recEventoCartucho } : null),
    /* ================================================================
       O PORTÃO DO CARTUCHO, EM TRÊS ESTADOS — e o terceiro é o que importa.

       `null` = ESTE MÓDULO NÃO MANDA neste cartucho: fora de sessão, arma de
       pente, ou recarga que nasceu do botão. O game.js então segue com o
       relógio de `nextShellT`, exatamente como sempre — o desktop não muda uma
       linha e a acessibilidade não perde cadência.
       `true` = há um cartucho a creditar AGORA (borda, consumida na leitura).
       `false` = a mão ainda não chegou à porta.

       Consumir na leitura é intencional: o game.js chama isto uma vez por
       frame dentro do `updateReload`, e um pulso que sobrevivesse à leitura
       creditaria dois cartuchos com uma chegada só. O atraso é de UM frame
       (13,9 ms a 72 Hz), porque `updateReload` roda antes de `aplicar` no
       mesmo tick — a mesma folga já aceita no `apoiando` da interação, e
       irrelevante contra um piso de cadência de centenas de ms.
       ================================================================ */
    consumirCartucho: () => {
      if (!vivo || !recPorCartucho || recOrigem !== 'gesto') return null;
      const v = cartuchoPulso;
      cartuchoPulso = false;
      return v;
    },
    /* ================================================================
       QUAL DOS TRÊS TRABALHOS O GRIP ESQUERDO ESTÁ FAZENDO NESTE FRAME.

       `gripOcupado()` é o que o game.js passa como `apoiando` para
       js/xr/xrinteract.js: quando o botão está buscando pente ou apoiando a
       arma, ele NÃO agarra o mundo. E `gripEsquerdo()` publica a decisão
       inteira com as duas distâncias que a produziram, para que um teste possa
       provar que o caso exercitava mesmo o empate (as duas dentro dos
       limiares) em vez de só ter caído no ramo certo por sorte de geometria.
       ================================================================ */
    gripOcupado: () => vivo && (gripModo === 'pente' || gripModo === 'apoio'),
    gripEsquerdo: () => ({
      modo: gripModo,
      desde: gripDesdeT,
      dPeito: gripDPeito,
      dApoio: gripDApoio,
    }),
    /* A affordance da janela, medível de fora: a proximidade CONTÍNUA (que é o
       que a torna um guia e não um carimbo), a opacidade que saiu dela, e os
       dois objetos para o teste poder subir por `.parent` até a cena — ler
       `visible` sem perguntar pelo grafo já deixou um teste desta base 11 de 12
       verde sobre produto quebrado. */
    guia: () => ({ perto: guiaPerto, opacidade: guiaOpac, aro: guiaAro, ponto: guiaPonto }),
    estado: () => ({
      ativo: vivo,
      ads: adsT,
      mirando: vivo && adsT > 0.5,
      duasMaos: temApoio,
      naCara,
      mistura,
      coldre: coldreK,
      empunhada: coldreK < 0.5,
      recarga: recEstado,
      recargaVia: recVia,
      recargaOrigem: recOrigem,
      cartuchos: recCartuchos,
      gripModo,
      gripDPeito,
      gripDApoio,
      guiaPerto,
      guiaOpacidade: guiaOpac,
      recuo: medida.recuo,
      desvio: medida.desvio,
      ocular: _ocular.toArray(),
      eixo: _eixo.toArray(),
      apoioAlvo: _apoioMundo.toArray(),
    }),
  };
}
