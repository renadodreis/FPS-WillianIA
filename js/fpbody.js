/* Corpo do jogador em primeira pessoa — helldiver rigado (51 ossos).
   Substitui as mãos-caixa: o corpo inteiro fica pendurado na câmera e os
   braços são resolvidos por IK de 2 ossos mirando as MESMAS âncoras
   (gun.parts.handR/handL) que a coreografia de recarga do game.js já move —
   ou seja: pente saindo, tapa no carregador, bombeada da escopeta e sway
   continuam com o timing original, agora com mãos e dedos de verdade.
   Se o GLB falhar, as mãos procedurais antigas continuam no lugar. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepRiggedMesh } from './meshutils.js';

export function createFpBody(deps) {
  const { camera, player, getGun, weaponRoot } = deps;

  const bodyRoot = new THREE.Group();
  bodyRoot.visible = false;
  camera.add(bodyRoot);

  /* calibração (ajustada por screenshot no playtest) */
  const TUNE = {
    scale: 1.18,           // braços do modelo são curtos: corpo maior alcança o grip
    height: 1.78,          // altura alvo do modelo (m)
    eyeDrop: 0.2,          // topo da cabeça fica este tanto ACIMA do olho
    back: 0.05,            // centro do tronco recuado atrás da câmera (m)
    yaw: Math.PI,          // modelo olha pra -Z da câmera
    rollR: 1.4,            // rolagem do punho direito em volta do eixo dos dedos
    rollL: -1.6,           // idem esquerdo (palma abraça o guarda-mão por baixo)
    /* Quão rápido o punho esquerdo TROCA de dono: da arma (mão de apoio no
       guarda-mão) para a mão do jogador (mão livre) e de volta. 1/s. O engate
       das duas mãos tem histerese própria em js/xr/xrweapon.js (`APOIO_PEGA`
       0,20 m / `APOIO_SOLTA` 0,32 m), então aqui não pode haver histerese
       nenhuma — só a suavização, para o punho não estalar no frame em que o
       jogador solta o guarda-mão. 12 /s é a mesma constante que a arma usa para
       misturar a direção de uma para duas mãos (t95 ≈ 0,25 s). */
    punhoSuaviza: 12,
    /* FLEXÃO MÁXIMA DO TRONCO, em radianos, ACIMA da inclinação de descanso do
       rig (12,16° medidos). A flexão toracolombar de um adulto vai a ~90–105°
       (lombar ~60° + torácica ~35°); 80° somados aos 12° do rig dão 92°, dentro
       da faixa e longe do boneco dobrado ao meio. É o teto do que a coluna
       aceita pagar para tirar o quadril de dentro do chão — o que passar disso
       vira dívida declarada (`colunaDivida`) em vez de pose impossível. */
    flexaoMax: 80 * Math.PI / 180,
    // direção dos DEDOS no espaço da arma: direita envolve o grip do gatilho,
    // esquerda cruza por baixo do guarda-mão
    fingersR: [-0.8, -0.25, -0.45],
    fingersL: [0.8, 0.3, -0.4],
    elbowOut: 0.34,        // quão aberto o cotovelo fica (direção do pole)
    elbowDown: 0.5,
    /* Fração do alcance onde a mão chega: sobra dobra de cotovelo. É uma
       RAZÃO, então atravessou o conserto de escala do braço sem recalibração —
       e a prova é que a pose de VR passou a ser a MESMA do desktop: cotovelo
       direito 145,51° → 143,07°, que é o número que o desktop já dava com a
       clavícula estendida. Era um ângulo diferente porque o triângulo estava
       inconsistente, não porque a calibração pedisse outro valor. */
    reachBend: 0.95,
    /* Extensão máxima da clavícula rumo à âncora, em metros de MUNDO — e
       DELIBERADAMENTE fora da escala do avatar, ao contrário do resto da
       calibração do corpo. Medido (§5.5 do docs/vr/referencia-corpo.md):
       escalá-la junto com o boneco (0,45 × 0,89 = 0,4025 m em VR) não muda
       NADA no braço direito, que nunca encosta neste teto (ele para em
       `alcance × reachBend`), e afasta a mão ESQUERDA da âncora em mais
       0,048 m. O braço esquerdo já não alcança o guarda-mão em VR (a âncora
       fica a 0,89–1,03 m do ombro, contra 0,59 m de braço).

       0,45 M FICA, E AGORA COM MEDIÇÃO DOS DOIS LADOS. Cortar este teto para
       um valor anatômico (0,06 m) foi TENTADO e é PIOR: sem a translação, o
       IK precisa GIRAR o úmero muito mais para alcançar a mesma âncora, e o
       braço esquerdo passa a varrer o rosto — medido, a malha do `Arm_1.L`
       foi de 0,1277 m para **0,0158 m** do olho na pose de braço levantado.
       O teto grande não é elegante, mas é ele que mantém o úmero apontado
       para longe da cara. O que precisava de limite era a DIREÇÃO da
       translação (subir e cruzar o esterno), não o tamanho dela — ver
       `clavUp`/`clavCross` logo abaixo. */
    clavMax: 0.45,
    /* ...MAS QUANDO O ALVO É A MÃO DO JOGADOR, O TETO É ANATÔMICO.

       `clavMax` é grande porque a âncora `supportHand` da ARMA fica a
       0,89–1,03 m do ombro esquerdo — fora do alcance por construção, e sem a
       translação o úmero varria o rosto (medido: 0,0158 m do olho). Em VR essa
       âncora deixou de ser o alvo: quem manda é o `gripSpace`, que é a MÃO DO
       JOGADOR (MDN, XRInputSource.gripSpace: a origem fica "at the centroid —
       the center of mass — of the user's fist"). E a mão do jogador está,
       por construção, ao alcance do braço DELE — logo ao alcance do braço do
       avatar, que é escalado pela altura dele.

       Com o alvo alcançável, `need` fica em zero na esmagadora maioria das
       poses e o teto não é exercido. Quando é (o jogador estica o braço mais
       do que o avatar alcança), meio metro de clavícula seria o tronco
       viajando atrás da mão: a protração da escápula humana é de ~2–6 cm.
       6 cm é o teto, e o preço é a mão parar curta em vez de o ombro sair do
       lugar — que é o defeito visível. */
    clavMao: 0.06,
    /* ...E A ESCÁPULA ABDUZ QUANDO O BRAÇO SOBE. Este é o custo, medido, de
       consertar a mão: enquanto o braço mirava uma âncora inalcançável 0,9 m à
       frente, o úmero apontava PARA A FRENTE e passava longe da cara. Com a
       mão indo para onde a mão do jogador está de verdade, o jogador que
       levanta o controle ao lado da cabeça faz o boneco levantar o braço ao
       lado da cabeça — e o braço fica ESTICADO (o alvo cai a 0,767 m de um
       ombro que alcança 0,588 m), o que prende o úmero na reta ombro→mão.
       Medido nas dez poses do laudo: a malha do `Arm_1.L` foi de 0,1750 m para
       **0,1029 m** do olho na pose "braço para cima", contra os 0,15 m do
       critério I3. Reta presa não se conserta girando: o único jeito de tirar
       o úmero da cara é mover o OMBRO.

       E mover o ombro para o lado é o que o corpo faz. Levantar o braço abduz
       a escápula 2–6 cm lateralmente (é o mesmo movimento que `clavMax` já
       modela para a frente); o que faltava era a DIREÇÃO. Aqui o ombro é
       empurrado para longe do olho, na perpendicular da reta ombro→alvo, só o
       tanto que falta para o braço limpar a bolha do olho, com teto de 8 cm.
       Continua passando por `limitarClavicula`, então segue proibido SUBIR e
       CRUZAR o esterno — o acrômio não faz nem uma coisa nem outra. */
    clavAbduz: 0.08,
    /* E A RÉGUA DA ABDUÇÃO É MAIS LARGA QUE `olhoLivre`, porque ela mede coisa
       diferente: `olhoLivre` (0,19) é a régua da MALHA, e o guarda da escápula
       mede a RETA DO OSSO, que mora dentro da malha. Medido: com a reta a
       0,21 m do centro da cabeça a malha do úmero já estava a 0,174 m — ~0,04
       de raio de braço — e o guarda nem disparava, porque 0,21 > 0,19. Aqui
       vale 0,19 + o raio do úmero, arredondado para 0,26. Fica separado de
       `olhoLivre` de propósito: são duas medidas de coisas diferentes, e
       fundi-las é como o guarda deixou de disparar em primeiro lugar. */
    bracoLivre: 0.26,
    /* ...E A CLAVÍCULA TEM JUNTA: ELA NÃO PASSA POR DENTRO DA CABEÇA.
       Medido em sessão, com a arma trazida ao rosto: a clavícula ESQUERDA
       terminava em (0,225; −0,195; −0,337) no espaço da raiz, tendo saído de
       (0; −0,386; +0,070) — ou seja, SUBIU 0,171 m e CRUZOU 0,201 m para o
       lado direito do esterno, parando à frente do queixo. E como ela carrega
       a gola inteira, a malha dela ia junto: 0,0259 m do olho, o pior número
       do critério I3.

       O ombro humano não faz isso. A elevação do acrômio é o gesto de dar de
       ombros, que este rig não modela, e o acrômio NÃO cruza o esterno — é o
       mesmo tipo de limite de junta que o VRIK aplica no `maxRootAngle` do
       quadril. Aqui ficam dois números, em metros de MUNDO, aplicados no
       espaço do CORPO (que é o do tronco, não o da cabeça): quanto a
       clavícula pode subir, e quanto pode passar da linha média. Os dois são
       ZERO, e isso foi medido em degraus: com 0,02 m de folga em cada um, a
       malha do ombro esquerdo ficava a 0,1304 m do olho; com os dois em zero,
       a 0,1442 m. O avanço PARA A FRENTE — que é o que compra alcance e o que
       a §5.5 do referencia-corpo mediu — continua livre até `clavMax`. */
    clavUp: 0,
    clavCross: 0,
    /* A MÃO DO BONECO NÃO ENTRA NO OLHO. O jogador pode encostar o controle
       no próprio rosto; o corte estático da malha (`eyeCut`) não cobre isso,
       porque o que chega ali é o braço, que se move. O alvo do IK é empurrado
       para fora de uma bolha em volta do olho — a mesma ideia de colisão
       mão↔corpo que os FPS de VR usam para a mão não atravessar o peito. O
       raio soma os 0,15 m do critério com o tamanho de uma mão (~0,10 m), que
       é o quanto a malha se estende além do osso do punho. */
    maoLivre: 0.25,
    /* O RECORTE DO OLHO — raio e centro da bolha vazia, no espaço da RAIZ do
       corpo (ou seja, multiplicados pela escala do avatar em VR). O centro
       fica à frente da raiz porque é lá que o olho mora: js/xr/xrbody.js
       recua o corpo `RECUO` (0,08–0,14 m) atrás da câmera, o que dá 0,07–0,20
       em unidades da raiz — 0,10 é o meio dessa faixa e o erro entra como
       margem do raio. Ver `recortarOlho`. */
    eyeCut: 0.30,
    eyeCutZ: 0.10,
    /* O QUE O CORTE ESTÁTICO NÃO ALCANÇA: a malha que a POSE traz para perto.
       Sobra do I3 depois de tudo o que é geométrico: com a cabeça girada 60°,
       o úmero esquerdo cruza à frente do peito e a malha dele chega a
       0,1446 m do olho — 5,4 mm abaixo do teto. Aqui entra a última guarda,
       que é a que o gênero usa quando a câmera encosta no avatar: o CORPO
       recua o tanto que falta. `sentinelas` é quantos vértices a varredura
       rolante visita POR FRAME: 256 de 2 631, ou seja o corpo inteiro em ~11
       frames (0,12 s a 90 Hz) — de sobra para uma correção de 15 mm e metade
       do custo de varrer 512. `applyBoneTransform` são ~4 matrizes 4×4 por
       vértice, e o orçamento de XR já está 4× estourado (docs/vr/perf-xr.md). E
       `suspeitosMax` é o tamanho da lista curta que é conferida SEMPRE — quem
       já violou uma vez não sai do radar enquanto continuar violando.
       `recuoMax` é o teto do empurrão, e ele existe para
       este mecanismo nunca virar outro defeito: 0,015 m cabe folgado nos
       0,05 m de erro de âncora que o critério C5 aceita E fica abaixo dos
       0,02 m de tolerância da mão na empunhadura (o corpo recua inteiro, e a
       mão vai junto). Se um dia faltar mais que isso, o teto SEGURA e o
       número volta a aparecer no teste — que é o comportamento certo para um
       remendo: ele não pode esconder o defeito seguinte.

       `olhoLivre` NÃO é 0,15 m, e o motivo custou uma rodada: aqui só existe
       a câmera do JOGO, que em XR fica no CENTRO da cabeça, enquanto o
       critério mede a partir de CADA OLHO — e o olho está meia distância
       interpupilar para o lado (medido nesta sessão: 0,0315 m). A guarda via
       0,26 m onde a sonda via 0,14 m e nunca disparava. 0,19 = 0,15 + 0,035
       (meia IPD generosa: a faixa do Quest 3 é 53–75 mm) e ainda sobra para o
       frame de atraso da pose da câmera em XR. É conservador de propósito:
       errar para o lado de recuar 1 cm é barato; errar para o lado de não
       recuar é o defeito de volta. */
    olhoLivre: 0.19,
    recuoMax: 0.015,
    recuoSolta: 0.0006,   // quanto o recuo devolve por frame quando não há violação
    sentinelas: 256,
    suspeitosMax: 64,
    /* AGACHAR ENCURTA A PERNA. O jogo baixa o olho de 1,62 m para 1,04 m
       (game.js, `eyeH`): 0,58 m é o tanto que a perna tem de encurtar para o
       pé continuar no chão quando o corpo desce junto com a câmera. Em VR
       quem manda é a queda MEDIDA da cabeça, que js/xr/xrbody.js escreve em
       `bodyRoot.userData.encurtar` (metros de mundo). */
    crouchDrop: 0.58,
    /* Flexão máxima de joelho. Era 150° (30° de ângulo INTERNO entre coxa e
       canela), o limite ATIVO; aqui vale o PASSIVO — 158°, ou 22° internos.

       O motivo é medido, não estético: com a raiz do corpo ancorada na cabeça
       até o fim (js/xr/xrbody.js), a perna precisa encurtar EXATAMENTE o
       tanto que o jogador agachou, ou o pé fura o chão a diferença. Num
       agachamento de 0,60 m de cabeça — que é o agachamento normal do jogo —
       o limite ativo entregava 0,542 m e faltavam 0,058 m. O limite passivo
       entrega 0,60 m e o pé fica no lugar.

       E o agachamento fundo de VR é justamente o gesto passivo: a fonte que
       este repositório já cita para o joelho ([Knee, Wikipédia]) descreve a
       flexão passiva de ~160° como "heel to buttock" — que é o que o corpo
       faz num cócoras cheio. 158° deixa 2° de margem do limite publicado. */
    kneeMin: 22 * Math.PI / 180,
    /* NO AGACHAMENTO O QUADRIL VAI PARA TRÁS — e como aqui o quadril está
       preso debaixo da cabeça (que é quem manda), quem anda é o PÉ, para a
       frente. Não é enfeite: na pose de descanso o tornozelo já fica 0,107 m
       ATRÁS do quadril, e com o pé atrás não existe solução de IK com o joelho
       para a frente E para cima — o joelho mergulha. Medido com este valor em
       zero: joelho a 0,047 m do chão e a malha da perna 0,373 m ENTERRADA,
       com o tornozelo certinho no lugar. É o `moveBodyBackWhenCrouching` do
       VRIK visto do outro lado do mesmo osso. */
    footFwd: 0.22,
    stepLen: 0.75,         // passada: fração do balanço que vira avanço do pé (m/rad)
    stepLift: 0.30,        // e quanto o pé sobe na perna que vai à frente
    airTuck: 0.30,         // no ar os dois pés encolhem em direção ao corpo
    /* A CAPA VAI ATÉ O TORNOZELO (bainha a 0,089 m do chão em pé) e pendura no
       PEITO: com o corpo ancorado na cabeça, agachar levava a bainha 0,373 m
       PARA DENTRO DO CHÃO — o pé no lugar certo e o casaco atravessando o
       piso. São 3 tiras de 4 ossos, então o ângulo se acumula ao longo da
       tira; 0,38 rad por osso recolhe ~0,46 m de bainha no agachamento cheio,
       que é o casaco se juntando no chão em vez de furá-lo.

       O ângulo entra por RAIZ QUADRADA da dobra porque a bainha sobe com o
       cosseno do ângulo (quadrático perto de zero) enquanto o corpo desce
       LINEAR: com o ângulo proporcional, o meio do agachamento ficava com a
       bainha 0,045 m dentro do chão.

       0,38 → 0,42 nesta rodada, e o motivo é medido: com a raiz do corpo
       acompanhando a cabeça ATÉ O FIM (js/xr/xrbody.js), o corpo desce os
       0,60 m inteiros do agachamento em vez de parar em 0,562 m. São 0,038 m
       a mais de queda, e quem paga é a bainha — o ponto mais baixo da malha
       passou a furar o piso em 0,11 m. Recolher 0,46 m de bainha virou
       recolher ~0,51 m, e o número volta para dentro do teto. */
    cloakLift: 0.42,
    /* teto de `agacharCru` (ver `resolverPernas`): 3 agachamentos de projeto
       é mais fundo do que qualquer jogador consegue, e segura a capa se a
       leitura de altura da cabeça enlouquecer */
    cloakMax: 3,
    kneeOut: 0.25,         // joelhos abrem um pouco para fora ao dobrar
  };

  const B = {};            // ossos por apelido
  const bind = new Map();  // pose de descanso (pos+quat locais) de cada osso tocado
  let armLen = null;       // { r: {a, b}, l: {a, b} } comprimentos braço/antebraço
  let readyFlag = false, failed = false;

  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  const _tp = new THREE.Vector3(), _pole = new THREE.Vector3(), _n = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _tq = new THREE.Quaternion();
  const fingerAxis = { r: new THREE.Vector3(0, 0, -1), l: new THREE.Vector3(0, 0, -1) };
  /* ================================================================
     A POSE DO PUNHO DENTRO DA MÃO DO JOGADOR, DEDUZIDA DO PRÓPRIO RIG.

     A spec do WebXR define os eixos do `gripSpace` pela ANATOMIA da mão, e não
     por convenção arbitrária — é a mesma definição do `grip pose` do OpenXR:

       −Z  "if the user was holding a straight rod in their hand, it would be
            aligned with the negative Z axis" — o eixo do tubo formado pelos
            dedos fechados, no sentido MINDINHO → POLEGAR;
       +X   a normal da palma: PARA FORA da palma na mão esquerda, PARA DENTRO
            na direita (é essa inversão que faz um mesmo vetor em coordenadas
            de grip significar a mesma coisa ANATÔMICA nas duas mãos);
       +Y   completa a base destra.

     Disso sai uma identidade que vale para as duas mãos e que não depende de
     eu ter lido a spec direito:

         +X_grip = (direção dos DEDOS) × (direção do POLEGAR)

     Confira com a mão esquerda aberta, dedos para a frente e polegar para
     cima: (−Z) × (+Y) = +X, que aponta para fora da palma. Na direita, com a
     palma virada para o outro lado, o mesmo produto aponta para dentro. É
     exatamente o texto da spec.

     E as duas direções saem do MODELO DESENHADO, não de calibração no olho: o
     eixo dos dedos é a média das falanges base (já usado por `alignHand`) e o
     POLEGAR é o osso de falange base que nasce mais perto do punho — neste rig
     `Finger_1.L/R`, a 1,25 unidades do osso da mão contra 3,56–3,63 dos outros
     quatro, e o único deslocado no eixo lateral (∓0,586 contra ~0,05). Ou
     seja: quem decide a orientação é a geometria do GLB.

     `qPunho` guarda a rotação que leva coordenadas da MÃO para coordenadas do
     GRIP; com ela, `q_mundo_da_mão = q_mundo_do_grip · qPunho`, que é o punho
     RÍGIDO na mão do jogador — a definição que `test/xr-punho-rotacao.test.js`
     mede em graus.
     ================================================================ */
  const qPunho = { r: null, l: null };
  /* buffers DEDICADOS do rig (não podem ser _v/_v2/_v3: esses são
     consumidos entre a escrita e a leitura). update() roda todo frame —
     tudo aqui era `new THREE.Vector3()` ou `.clone()` por frame. */
  const _sPos = new THREE.Vector3(), _ePos = new THREE.Vector3();
  const _camPos = new THREE.Vector3();
  const _rp = new THREE.Vector3(), _lp = new THREE.Vector3();
  const _dirR = new THREE.Vector3(), _dirL = new THREE.Vector3();
  /* buffers da perna (não podem dividir com o braço: o alvo do pé é montado
     antes do solver e lido depois de aimBone mexer nos registradores) */
  const _alvo = new THREE.Vector3(), _poloP = new THREE.Vector3(), _poloA = new THREE.Vector3();
  /* buffers do PISO (ver `resolverPernas`): quadril em mundo, delta quadril→pé
     e a frente horizontal do corpo. Nenhum deles pode dividir com `_alvo` nem
     com `_poloP`, que atravessam o cálculo inteiro até o solver. */
  const _hipP = new THREE.Vector3(), _dlP = new THREE.Vector3(), _fwP = new THREE.Vector3();
  const _pisoV = new THREE.Vector3(), _polX = new THREE.Vector3();
  const _qf = new THREE.Quaternion(), _qf2 = new THREE.Quaternion();
  const _lenP = { a: 0, b: 0 };   // coxa/canela já na ESCALA DO MUNDO deste frame
  /* BRAÇO E ANTEBRAÇO NA ESCALA DO MUNDO DESTE FRAME — e, ao mesmo tempo, a
     única forma de medir de fora QUAL comprimento o solver alimentou na lei
     dos cossenos. Sem esta leitura, "o IK pede um braço maior do que existe"
     só dá para inferir; com ela o teste compara o número que entrou no solver
     com a distância que os ossos realmente vencem no mundo. */
  const alcanceUsado = { r: { a: 0, b: 0 }, l: { a: 0, b: 0 } };
  let legPairs = null; // montado uma vez, quando o rig fica pronto
  let legLen = null;   // { r: {a, b}, l: {a, b} } coxa/canela
  let pernaDobra = 0;  // quanto a perna encurta até o joelho chegar no limite (m)
  let vertsApagados = 0;  // vértices tirados da malha (ver apagarOsso/recortarOlho)
  let sentinelas = [];    // todos os vértices da malha, para a varredura rolante
  const suspeitos = [];   // os que já violaram: verificados todo frame (ver recuarDoOlho)
  let recuoOlho = 0;      // quanto o corpo recuou neste frame (m) — QA
  /* QA da perna: quanto o ponto mais baixo do corpo passou do piso e quanto o
     alvo do pé teve de ser ERGUIDO até ele (metros de mundo). Ver
     `resolverPernas`. */
  let afundou = 0, peErguido = 0, peAFrente = 0;
  /* profundidade do agachamento SEM teto (`k` satura em 1): é ela que a capa
     usa para continuar recolhendo a bainha depois do agachamento de projeto */
  let agacharCru = 0;
  /* QA do braço: metros de MUNDO que a clavícula transladou rumo ao alvo neste
     frame. É o "ombro viajando atrás da mão" com número. */
  const clavDelta = { r: 0, l: 0 };
  /* Caixa (espaço da RAIZ) do que o recorte do olho tirou da malha. É o número
     que diz quanto do DESKTOP mudou: lá o corpo é filho da câmera e a raiz É o
     olho, então esta caixa é exatamente a região que o jogador de monitor
     deixou de ver. Box3/Vector3 não têm `uuid` e não consomem `Math.random`. */
  const recorteCaixa = new THREE.Box3();
  let recorteNaVista = 0;   // quantos desses o desktop enxergava (ver recortarOlho)
  let olhoMin = Infinity; // menor distância malha↔olho vista neste frame — QA

  /* dedos: [curl base, curl ponta] por estado; indicador direito no gatilho */
  const GRIP = {
    default: { r: [0.85, 0.9], l: [0.8, 0.85], trigR: 0.35 },
    knife:   { r: [1.0, 1.05], l: [0.35, 0.4], trigR: 1.0 },
    pump:    { r: [0.85, 0.9], l: [0.95, 1.0], trigR: 0.35 },
    bazooka: { r: [0.9, 0.95], l: [0.9, 0.95], trigR: 0.6 },
    open:    { r: [0.12, 0.15], l: [0.12, 0.15], trigR: 0.12 },
    straps:  { r: [1.05, 1.1], l: [1.05, 1.1], trigR: 1.05 },
  };
  function gripFor(gun) {
    if (window.__FP_pose === 'chute') return GRIP.straps;
    if (window.__FP_pose === 'fall') return GRIP.open;
    if (!gun) return GRIP.default;
    if (gun.melee) return GRIP.knife;
    if (gun.parts && gun.parts.pump) return GRIP.pump;
    if (gun.rocket) return GRIP.bazooka;
    return GRIP.default;
  }

  /* ================================================================
     APAGAR UM OSSO DA MALHA — de verdade, vértice e triângulo.

     Peso a partir do qual o vértice é considerado DAQUELE osso. 0,05 apaga
     também o anel de transição (o pescoço), que é justamente o que fica mais
     perto do olho; acima disso sobrariam vértices arrastados pelo osso
     encolhido e o piso de distância voltaria.

     NADA AQUI CRIA `BufferGeometry`, `Material`, `Texture` nem `Object3D`: só
     `BufferAttribute`, que não tem `uuid` (three r0.185, `core/BufferAttribute.js`)
     e portanto NÃO consome número do `Math.random` seedado. É contrato do
     worldgen (CLAUDE.md), e este módulo carrega o GLB de forma assíncrona —
     gastar número aqui deslocaria o mundo de um jeito que depende da rede.
     ================================================================ */
  const OSSO_W = 0.05;

  function apagarOsso(model, osso) {
    const alvos = new Set();
    osso.traverse(o => { if (o.isBone) alvos.add(o); });
    return apagarSe(model, (o, g) => {
      const sk = o.skeleton;
      const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      if (!sk || !si || !sw) return null;
      const iAlvo = new Set();
      sk.bones.forEach((b, i) => { if (alvos.has(b)) iAlvo.add(i); });
      if (!iAlvo.size) return null;
      const n = g.attributes.position.count;
      const marca = new Uint8Array(n);
      for (let v = 0; v < n; v++) {
        let w = 0;
        if (iAlvo.has(si.getX(v))) w += sw.getX(v);
        if (iAlvo.has(si.getY(v))) w += sw.getY(v);
        if (iAlvo.has(si.getZ(v))) w += sw.getZ(v);
        if (iAlvo.has(si.getW(v))) w += sw.getW(v);
        marca[v] = w >= OSSO_W ? 1 : 0;
      }
      return marca;
    });
  }

  /* ================================================================
     O RECORTE DO OLHO — a bolha que nenhuma malha do corpo ocupa.

     O critério I3 proíbe geometria a menos de 0,15 m do olho, e o modelo é
     ESTILIZADO: mesmo com a cabeça fora da malha, o alto do ombro fica a
     0,053 m abaixo da câmera e a gola chega a 0,11 m. Nenhum valor de
     `eyeDrop` conserta isso sem enfiar a câmera no peito — a proporção do
     boneco é essa (do topo do crânio ao ombro ele tem 0,22 m; gente tem
     0,36 m). O que a Valve fez com esse mesmo problema foi não desenhar
     corpo nenhum em Alyx, e o critério C5 aceita as duas saídas; aqui a
     saída é intermediária e é a do gênero: o corpo fica, e o que cai DENTRO
     da bolha do olho sai da malha.

     A bolha é medida na POSE DE DESCANSO, no espaço da RAIZ do corpo, e o
     centro dela é o OLHO — que em VR mora `RECUO` à frente da raiz
     (js/xr/xrbody.js). Como o corte é estático e a raiz carrega a escala do
     avatar, o raio é escolhido para o pior caso da trava de escala:
     `eyeCut × 0,70 = 0,182 m` de folga real contra os 0,15 m exigidos.
     ================================================================ */
  function recortarOlho(model, raiz) {
    const tanV = Math.tan((camera.fov || 75) * Math.PI / 360);
    const tanH = tanV * (camera.aspect || 1);
    const olho = new THREE.Vector3(0, 0, -TUNE.eyeCutZ);
    const _p = new THREE.Vector3();
    const _m = new THREE.Matrix4();
    return apagarSe(model, (o, g) => {
      /* SÓ MATRIZ LOCAL, e isto custou uma rodada: no instante em que o GLB
         chega, `matrixWorld` da raiz e dos ossos ainda não descrevem a mesma
         coisa (o corpo é filho da câmera, e a câmera desta página ainda não
         foi posta no lugar do frame). Medido: o corte varreu a malha inteira
         e apagou ZERO vértice, porque cada vértice caía num sistema de
         coordenadas diferente do centro da bolha.

         Na POSE DE DESCANSO o skinning é a identidade por construção
         (`boneInverse` é a inversa do osso na bind), então o vértice bruto do
         atributo JÁ é a posição de descanso no espaço da malha. Subir daí até
         a raiz pela cadeia de matrizes LOCAIS não depende de nada externo. */
      _m.identity();
      for (let p = o; p && p !== raiz; p = p.parent) { p.updateMatrix(); _m.premultiply(p.matrix); }
      const pos = g.attributes.position;
      const n = pos.count;
      const marca = new Uint8Array(n);
      let algum = 0;
      for (let v = 0; v < n; v++) {
        _p.fromBufferAttribute(pos, v).applyMatrix4(_m);
        if (_p.distanceTo(olho) >= TUNE.eyeCut) continue;
        marca[v] = 1; algum++;
        recorteCaixa.expandByPoint(_p);
        /* E QUANTO DISSO O JOGADOR DE MONITOR VIA? No desktop o corpo é filho
           da câmera e a raiz É o olho, então este ponto já está em coordenadas
           de câmera. O teste é o frustum: à frente do plano near e dentro do
           cone. É o número que diz se o recorte cobrou preço no jogo que já
           está no ar — e ele não pode ficar sem medida só porque a captura de
           tela do harness não pega o canvas WebGL. */
        if (-_p.z > camera.near
          && Math.abs(_p.y) <= tanV * -_p.z && Math.abs(_p.x) <= tanH * -_p.z) recorteNaVista++;
      }
      return algum ? marca : null;
    });
  }

  /* A LISTA DE TODOS OS VÉRTICES QUE SOBRARAM, para a varredura rolante.

     TENTEI A VERSÃO CURTA PRIMEIRO e ela não serve, então fica registrado: a
     escolha óbvia é vigiar os vértices que ficam na BORDA DO RECORTE na pose
     de descanso, e ela falha porque quem chega perto do olho na pose real é o
     ÚMERO — que na pose de descanso está pendurado ao lado do corpo, longe de
     qualquer borda. Medido: 128 sentinelas escolhidas por proximidade de
     descanso, e o recuo disparou ZERO vez enquanto a malha do `Arm_1.L` estava
     a 0,1446 m do olho.

     O que funciona é varrer TUDO — só que não tudo por frame. Um `slice` por
     frame (broad phase) mais uma lista curta de suspeitos que já violaram
     (narrow phase, verificada todo frame). Assim o custo é fixo e a violação,
     depois de achada, continua sendo vista enquanto durar. */
  function listarVertices(model) {
    const todos = [];
    model.traverse(o => {
      if (!o.isSkinnedMesh || !o.geometry.attributes.position) return;
      const n = o.geometry.attributes.position.count;
      for (let v = 0; v < n; v++) todos.push({ m: o, i: v, susp: false });
    });
    return todos;
  }

  /* Núcleo compartilhado: `marcar(mesh, geometry)` devolve um Uint8Array por
     vértice (1 = sai) ou null para não mexer nesta malha. */
  function apagarSe(model, marcar) {
    let apagados = 0;
    const vazias = [];
    model.traverse(o => {
      if (!o.isSkinnedMesh) return;
      const g = o.geometry;
      if (!g.index || !g.attributes || !g.attributes.position) return;
      const doOsso = marcar(o, g);
      if (!doOsso) return;
      const n = g.attributes.position.count;

      /* Triângulo com QUALQUER vértice do osso sai inteiro: deixar o triângulo
         de transição esticaria a malha até o ponto do osso encolhido, que é
         exatamente o defeito que estamos tirando do olho. */
      const src = g.index.array;
      const fica = [];
      for (let t = 0; t + 2 < src.length; t += 3) {
        const a = src[t], b = src[t + 1], c = src[t + 2];
        if (doOsso[a] || doOsso[b] || doOsso[c]) continue;
        fica.push(a, b, c);
      }
      if (fica.length === src.length) return;

      /* remapeia: só o vértice referenciado sobrevive no atributo */
      const mapa = new Int32Array(n).fill(-1);
      let m = 0;
      for (let k = 0; k < fica.length; k++) if (mapa[fica[k]] < 0) mapa[fica[k]] = m++;
      apagados += n - m;

      /* CÓPIA CRUA, E ISSO É O PONTO DELICADO: o GLTFLoader entrega
         `skinIndex`/`skinWeight` INTERCALADOS num só buffer (uma
         `InterleavedBufferAttribute`), e ali `attr.array` é o buffer INTEIRO —
         indexar por `v * itemSize` lê o campo do vizinho. Custou uma rodada:
         os índices de osso saíam embaralhados e `applyBoneTransform` estourava
         em `skeleton.bones[i].matrixWorld` com `i` fora da faixa. O valor bruto
         (sem desnormalizar) preserva tipo e escala de qualquer atributo. */
      const bruto = (at, v, c) => (at.isInterleavedBufferAttribute
        ? at.data.array[v * at.data.stride + at.offset + c]
        : at.array[v * at.itemSize + c]);
      for (const nome of Object.keys(g.attributes)) {
        const at = g.attributes[nome];
        const it = at.itemSize;
        const novo = new at.array.constructor(m * it);
        for (let v = 0; v < n; v++) {
          const d = mapa[v];
          if (d < 0) continue;
          for (let c = 0; c < it; c++) novo[d * it + c] = bruto(at, v, c);
        }
        g.setAttribute(nome, new THREE.BufferAttribute(novo, it, at.normalized));
      }
      const Idx = m > 65535 ? Uint32Array : Uint16Array;
      const novoIdx = new Idx(fica.length);
      for (let k = 0; k < fica.length; k++) novoIdx[k] = mapa[fica[k]];
      g.setIndex(new THREE.BufferAttribute(novoIdx, 1));
      /* a caixa em cache é da malha ANTIGA; quem mede a altura do modelo
         (js/xr/xrbody.js `medirModelo`) lê `geometry.boundingBox` */
      g.computeBoundingBox();
      g.computeBoundingSphere();
      o.boundingBox = null;
      o.boundingSphere = null;
      /* MALHA QUE ERA SÓ CABEÇA some do grafo. No helldiver isso é o
         `Object_11` inteiro (628 vértices, 288 triângulos): era um objeto
         desenhado a cada frame para não mostrar nada. Sai daqui uma draw call
         por olho — em XR, duas. */
      if (m === 0) vazias.push(o);
    });
    for (const o of vazias) if (o.parent) o.parent.remove(o);
    return apagados;
  }

  new GLTFLoader().loadAsync('/assets/models/Personagens/low_poly_helldiver_rig.glb')
    .then(gltf => {
      const model = gltf.scene;
      prepRiggedMesh(model);
      /* normaliza a altura e pendura na câmera, ancorando pelo BOUNDING BOX
         (o pivô do GLB não é o pescoço — sem isto a câmera nasce dentro do peito)

         E ESTA LINHA É A ORIGEM MATERIAL DE UM DEFEITO QUE CUSTOU CARO, então
         fica escrito: `setFromObject` num `SkinnedMesh` GRAVA o resultado em
         `mesh.boundingBox`, e o three NUNCA invalida esse campo. Daqui em
         diante, qualquer `Box3.setFromObject` sobre este corpo devolve a caixa
         da pose que existia AGORA — a pose de bind —, por mais que os ossos se
         mexam depois. `computeBoundingBox` do `SkinnedMesh` é ciente da pose
         (passa por `applyBoneTransform`); quem congela é o cache, não o cálculo.

         Aqui isso é CORRETO e proposital: o que se quer é a altura em repouso,
         uma vez, para calcular a escala. O que não se pode é medir pose animada
         por caixa depois disto — mede-se por OSSO (`bone.getWorldPosition`), e
         foi por ignorar isso que três arquivos de teste desta base passaram a
         medir a RAIZ acreditando medir os pés. */
      const box = new THREE.Box3().setFromObject(model);
      const h = box.max.y - box.min.y;
      const s = (TUNE.height / Math.max(h, 1e-3)) * TUNE.scale;
      const orient = new THREE.Group();
      orient.rotation.y = TUNE.yaw;
      orient.scale.setScalar(s);
      orient.add(model);
      orient.updateMatrixWorld(true);
      const sBox = new THREE.Box3().setFromObject(orient);
      orient.position.set(
        -(sBox.min.x + sBox.max.x) * 0.5,
        TUNE.eyeDrop - sBox.max.y,          // topo da cabeça logo acima do olho
        -(sBox.min.z + sBox.max.z) * 0.5 + TUNE.back,
      );
      bodyRoot.add(orient);

      // o GLTFLoader remove pontos/espaços dos nomes ("Arm_1.L_13" → "Arm_1L_13"):
      // compara tudo normalizado pra não depender do sanitizador do three
      const norm = s => String(s).replace(/[.\s]/g, '');
      const find = frag => {
        const f = norm(frag);
        let hit = null;
        model.traverse(o => { if (!hit && o.isBone && norm(o.name).includes(f)) hit = o; });
        return hit;
      };
      B.head = find('Head_');
      B.chest = find('Chest');
      B.torso = find('Torso');
      B.shR = find('Sholder.R'); B.upR = find('Arm_1.R'); B.foR = find('Arm_2.R'); B.haR = find('Hand.R');
      B.shL = find('Sholder.L'); B.upL = find('Arm_1.L'); B.foL = find('Arm_2.L'); B.haL = find('Hand.L');
      B.pelR = find('Pelvis.R'); B.leg1R = find('Leg_1.R'); B.leg2R = find('Leg_2.R'); B.footR = find('Boot.R');
      B.pelL = find('Pelvis.L'); B.leg1L = find('Leg_1.L'); B.leg2L = find('Leg_2.L'); B.footL = find('Boot.L');
      B.cloak = [];
      model.traverse(o => { if (o.isBone && norm(o.name).startsWith('Cloak')) B.cloak.push(o); });
      B.fingersR = []; B.fingersL = [];
      model.traverse(o => {
        if (!o.isBone || !/^Finger/.test(o.name)) return;
        const n = norm(o.name);
        if (/R_\d+$/.test(n)) B.fingersR.push(o);
        else if (/L_\d+$/.test(n) || n === 'Finger_6_5') B.fingersL.push(o); // 6 = polegar esquerdo (sem sufixo no rig)
      });
      if (!B.upR || !B.foR || !B.haR || !B.upL || !B.foL || !B.haL)
        throw new Error('ossos dos braços não encontrados no helldiver');

      /* A CABEÇA NÃO ENCOLHE MAIS: ELA SAI DA MALHA.

         Encolher o osso (`scale 0.0001`) some com a cabeça na TELA e deixa os
         ~670 vértices dela empilhados no ponto do osso — que mora a 0,0972 no
         espaço da raiz, ou seja, a 8,2 cm do olho do jogador. Medido em
         sessão, na malha skinada: era esse bolo o piso permanente de todas as
         poses (0,082 m), e o critério I3 proíbe qualquer geometria dentro de
         0,15 m do olho. Objeto invisível na tela continua sendo geometria no
         olho — o critério mede a MALHA, e a malha estava lá.

         Aqui o triângulo que tem qualquer vértice da cabeça é apagado do
         índice E o vértice sai do atributo: sobra malha, não vértice órfão.
         Isso NÃO é perda de conteúdo (a cabeça já era invisível) e ainda
         devolve vértice e triângulo ao orçamento do Quest. O encolhimento do
         osso continua, para o anel de transição que sobra no pescoço (peso de
         cabeça abaixo do corte) descer em vez de subir. */
      vertsApagados = B.head ? apagarOsso(model, B.head) : 0;
      if (B.head) B.head.scale.setScalar(0.0001);
      /* E a bolha do olho, DEPOIS da cabeça (menos vértice para varrer). */
      vertsApagados += recortarOlho(model, bodyRoot);
      sentinelas = listarVertices(model);

      // guarda a pose de descanso de tudo que vamos mexer
      const track = [B.chest, B.torso, B.shR, B.upR, B.foR, B.haR, B.shL, B.upL, B.foL, B.haL,
        B.pelR, B.leg1R, B.leg2R, B.footR, B.pelL, B.leg1L, B.leg2L, B.footL,
        ...B.cloak, ...B.fingersR, ...B.fingersL];
      for (const b of track) if (b) bind.set(b, { p: b.position.clone(), q: b.quaternion.clone() });

      // comprimentos dos segmentos em unidades de MUNDO (com escala aplicada)
      bodyRoot.visible = true;
      bodyRoot.updateWorldMatrix(true, true);
      const dist = (x, y) => x.getWorldPosition(_v).distanceTo(y.getWorldPosition(_v2));
      armLen = {
        r: { a: dist(B.upR, B.foR), b: dist(B.foR, B.haR) },
        l: { a: dist(B.upL, B.foL), b: dist(B.foL, B.haL) },
      };
      medirPernas();
      medirColuna();
      // eixo real dos dedos no espaço LOCAL da mão (média das falanges base):
      // é ele que a gente alinha com a direção da empunhadura da arma
      for (const [key, hand, fingers] of [['r', B.haR, B.fingersR], ['l', B.haL, B.fingersL]]) {
        const acc = new THREE.Vector3();
        const base = [];
        for (const f of fingers) if (f.parent === hand) { acc.add(f.position); base.push(f); }
        if (acc.lengthSq() > 1e-8) fingerAxis[key].copy(acc.normalize());
        /* O POLEGAR É O QUE NASCE MAIS PERTO DO PUNHO. Anatomicamente o
           metacarpo do polegar sai do carpo, não da fileira dos nós — neste rig
           a diferença é grande (1,25 contra 3,56–3,63 ao longo do eixo dos
           dedos), então "menor projeção no eixo dos dedos" identifica o osso
           sem depender do NOME dele. E o polegar entra ortogonalizado contra os
           dedos: o que interessa é para que LADO da palma ele fica.

           E ISSO É ROBUSTO POR CONSTRUÇÃO, o que foi MEDIDO em vez de suposto:
           trocando este critério para pegar o dedo mais LONGE do punho (o
           indicador, `Finger_3`), a base deduzida gira só 34,4° — porque
           polegar e indicador ficam do MESMO lado da palma, e quem decide a
           orientação é o SINAL de `dedos × polegar`. O erro que importaria é
           o de 180°, e esse tem caso próprio no teste: negar `gx` leva a
           conferência contra a mão direita de 64,77° para 169,02°. */
        if (base.length >= 3) {
          let pol = base[0], min = Infinity;
          for (const f of base) {
            const d = f.position.dot(fingerAxis[key]);
            if (d < min) { min = d; pol = f; }
          }
          const t = new THREE.Vector3().copy(pol.position);
          t.addScaledVector(fingerAxis[key], -t.dot(fingerAxis[key]));
          if (t.lengthSq() > 1e-8) {
            t.normalize();
            /* +X do grip = dedos × polegar (ver o bloco de `qPunho`), −Y = dedos,
               e o terceiro eixo fecha a base destra. `makeBasis` põe os eixos
               do GRIP em COLUNAS, ou seja, monta grip→mão; o que o runtime usa
               é a inversa. */
            const gx = new THREE.Vector3().crossVectors(fingerAxis[key], t).normalize();
            const gy = new THREE.Vector3().copy(fingerAxis[key]).negate();
            const gz = new THREE.Vector3().crossVectors(gx, gy).normalize();
            qPunho[key] = new THREE.Quaternion()
              .setFromRotationMatrix(new THREE.Matrix4().makeBasis(gx, gy, gz))
              .invert();
          }
        }
      }
      readyFlag = true;
      // com o rig no lugar, as mãos-caixa procedurais somem de todas as armas
      for (const gun of deps.arsenal) {
        for (const k of ['handR', 'handL']) {
          if (gun.parts && gun.parts[k]) gun.parts[k].traverse(o => { if (o.isMesh) o.visible = false; });
        }
      }
    })
    .catch(err => {
      failed = true;
      console.error('FP body falhou — mantendo mãos procedurais:', err);
    });

  /* gira um osso no MUNDO de forma que a direção atual `from` aponte pra `to`.
     Escratch PRÓPRIO (_af/_at): fromDir/toDir chegam nos registradores
     compartilhados (_v/_v2/_v3) — usar _v aqui já engoliu o toDir do cotovelo
     e deixou o antebraço inerte (mão a ~0,65 m da âncora, item 6 do backlog) */
  const _af = new THREE.Vector3(), _at = new THREE.Vector3();
  function aimBone(bone, fromDir, toDir) {
    _q.setFromUnitVectors(_af.copy(fromDir).normalize(), _at.copy(toDir).normalize());
    bone.getWorldQuaternion(_q2);
    _q.multiply(_q2); // quat mundial desejado
    bone.parent.getWorldQuaternion(_q2).invert();
    bone.quaternion.copy(_q2.multiply(_q));
    bone.updateWorldMatrix(true, true);
  }
  /* punho: alinha o eixo dos dedos com a direção da empunhadura + rolagem */
  function alignHand(hand, axisLocal, worldDir, roll) {
    hand.updateWorldMatrix(true, false);
    _v.copy(axisLocal).transformDirection(hand.matrixWorld).normalize(); // dedos hoje
    _v2.copy(worldDir).normalize();
    _q.setFromUnitVectors(_v, _v2);
    hand.getWorldQuaternion(_q2);
    _q.multiply(_q2);                                   // quat mundial alinhado
    _tq.setFromAxisAngle(_v2, roll).multiply(_q);       // rolagem em volta dos dedos
    hand.parent.getWorldQuaternion(_q2).invert();
    hand.quaternion.copy(_q2.multiply(_tq));
    hand.updateWorldMatrix(true, true);
  }

  /* ================================================================
     DUAS JUNTAS QUE FALTAVAM, E AS DUAS ESTÃO NO CAMINHO DO OLHO.

     `limitarClavicula` — a clavícula é uma junta, não um elástico. Ela pode
     avançar (é o que compra alcance) mas não pode SUBIR nem CRUZAR o esterno:
     medido, ela subia 0,171 m e cruzava 0,201 m, parava à frente do queixo e
     levava a gola inteira a 0,026 m do olho. Os limites são aplicados no
     espaço do CORPO — em VR o tronco fica em pé, no desktop ele acompanha a
     câmera, e nos dois casos "para cima" e "para o lado" são do tronco.

     `foraDoOlho` — o alvo do IK da mão não entra na bolha do olho. Sem isso o
     jogador encosta o controle no próprio rosto e a mão do boneco vai junto;
     o corte estático da malha não alcança esse caso porque quem chega ali é
     um osso que se move. É colisão mão↔corpo, e o preço é a mão do boneco
     parar `maoLivre` antes do controle nessa (única) situação.
     ================================================================ */
  const _clA = new THREE.Vector3(), _clB = new THREE.Vector3();
  const _olhoW = new THREE.Vector3(), _alvoLivre = new THREE.Vector3();

  function limitarClavicula(sh, delta, sideSign) {
    /* SÓ EM VR, pelo mesmo motivo de `foraDoOlho`: a pose do desktop foi
       calibrada com a clavícula solta e não pode mudar. */
    if (!bodyRoot.parent || bodyRoot.parent === camera) return;
    sh.getWorldPosition(_clA);                 // pose de descanso (mundo)
    _clB.copy(_clA).add(delta);
    bodyRoot.worldToLocal(_clA);               // base, no espaço do corpo
    bodyRoot.worldToLocal(_clB);               // desejado, no espaço do corpo
    const s = bodyRoot.scale.x || 1;
    const teto = TUNE.clavUp / s, lado = TUNE.clavCross / s;
    if (_clB.y > _clA.y + teto) _clB.y = _clA.y + teto;
    /* o lado é dado pelo BRAÇO (no rig as duas clavículas nascem no esterno,
       em x = 0, então a base não distingue esquerda de direita) */
    if (sideSign > 0) { if (_clB.x < _clA.x - lado) _clB.x = _clA.x - lado; }
    else if (_clB.x > _clA.x + lado) _clB.x = _clA.x + lado;
    bodyRoot.localToWorld(_clA);
    bodyRoot.localToWorld(_clB);
    delta.copy(_clB).sub(_clA);
  }

  /* A ÚLTIMA GUARDA: se, DEPOIS de tudo resolvido, alguma sentinela ainda
     estiver dentro da bolha, o corpo inteiro recua o tanto que falta — na
     direção oposta à do pior vértice, com teto em `recuoMax`.

     Só em VR. No desktop o corpo é FILHO DA CÂMERA e escrever aqui moveria o
     boneco que está no ar há meses; a checagem do pai é o gate, e é a mesma
     que distingue os dois modos no resto do módulo.

     Sem histerese de propósito: `bodyRoot.position` é reescrito por
     js/xr/xrbody.js todo frame ANTES desta medição, então o valor medido é
     sempre o do corpo não-recuado. Não acumula, não oscila. */
  const _sv = new THREE.Vector3(), _fuga = new THREE.Vector3();
  const recuoMundo = new THREE.Vector3();   // servo do recuo, em metros de MUNDO
  let varreCursor = 0;
  function recuarDoOlho() {
    recuoOlho = 0;
    if (!sentinelas.length || !bodyRoot.parent || bodyRoot.parent === camera) {
      /* desktop: o corpo é filho da câmera e nada disto vale — some com o
         contrato para não deixar recuo velho preso no objeto */
      recuoMundo.set(0, 0, 0);
      delete bodyRoot.userData.recuoOlho;
      return;
    }
    camera.getWorldPosition(_olhoW);
    let falta = 0;
    olhoMin = Infinity;
    const ver = s => {
      s.m.getVertexPosition(s.i, _sv);
      _sv.applyMatrix4(s.m.matrixWorld);
      const d = _sv.distanceTo(_olhoW);
      if (d < olhoMin) olhoMin = d;
      const f = TUNE.olhoLivre - d;
      /* O CORPO FOGE DO OLHO, e o sinal aqui já esteve invertido: `olho −
         vértice` aponta PARA o olho e empurrava a gola para dentro da cara
         (medido: 0,1748 → 0,1613 m, o servo saturando e piorando). */
      if (f > falta) { falta = f; _fuga.copy(_sv).sub(_olhoW); }
      return f > 0;
    };
    /* narrow phase: quem já violou continua sendo olhado todo frame, e sai da
       lista quando para de violar (a marca vive no próprio item, para não
       varrer o array a cada candidato) */
    for (let k = suspeitos.length - 1; k >= 0; k--) {
      if (!ver(suspeitos[k])) { suspeitos[k].susp = false; suspeitos.splice(k, 1); }
    }
    /* broad phase: uma fatia do corpo por frame */
    const passo = Math.min(TUNE.sentinelas, sentinelas.length);
    for (let k = 0; k < passo; k++) {
      const s = sentinelas[(varreCursor + k) % sentinelas.length];
      if (ver(s) && !s.susp && suspeitos.length < TUNE.suspeitosMax) {
        s.susp = true;
        suspeitos.push(s);
      }
    }
    varreCursor = (varreCursor + passo) % sentinelas.length;

    /* SERVO, NÃO CORREÇÃO DIRETA — e escrever `bodyRoot.position` aqui NÃO
       FUNCIONA, o que custou uma rodada e fica registrado: js/xr/xrbody.js
       reescreve a posição da raiz MAIS TARDE no mesmo frame (game.js chama
       `FpBody.update` antes de `XR.corpo.update`), então o empurrão era
       calculado, aplicado e descartado — `recuoOlho` marcava 0,0145 m e a
       malha continuava exatamente onde estava.

       Então o recuo vai pelo MESMO canal que `pernaDobra` e `encurtar` já
       usam: `userData` no objeto que os dois módulos compartilham. E como a
       medição deste frame já enxerga o recuo do frame anterior, o valor é
       ACUMULADO (servo) e não substituído — substituir criaria o laço
       clássico: empurra, some o defeito, solta, o defeito volta. */
    if (falta > 1e-4 && _fuga.lengthSq() > 1e-9) {
      recuoMundo.addScaledVector(_fuga.normalize(), falta);
      if (recuoMundo.length() > TUNE.recuoMax) recuoMundo.setLength(TUNE.recuoMax);
    } else if (recuoMundo.lengthSq() > 1e-12) {
      recuoMundo.setLength(Math.max(0, recuoMundo.length() - TUNE.recuoSolta));
    }
    recuoOlho = recuoMundo.length();
    bodyRoot.userData.recuoOlho = recuoMundo;
  }

  function foraDoOlho(alvo) {
    /* SÓ EM VR, e o desktop provou por que: a âncora de apoio da mão ESQUERDA
       fica dentro de 0,25 m da câmera na pose calibrada por screenshot, e a
       bolha empurrava a mão do boneco para fora da arma — medido, 0,0000 →
       0,0638 m no `test/xr-braco-alcance` de desktop. No monitor não existe
       estéreo nem plano near de headset: o critério I3 não se aplica, e o que
       está no ar não pode regredir. O gate é o mesmo do resto do módulo — em
       VR o corpo é pendurado no RIG, no desktop é filho da CÂMERA. */
    if (!bodyRoot.parent || bodyRoot.parent === camera) return alvo;
    camera.getWorldPosition(_olhoW);
    const d = _olhoW.distanceTo(alvo);
    if (d >= TUNE.maoLivre || d < 1e-4) return alvo;
    return _alvoLivre.copy(alvo).sub(_olhoW).multiplyScalar(TUNE.maoLivre / d).add(_olhoW);
  }

  /* ================================================================
     A ESCÁPULA ABDUZ PARA O BRAÇO NÃO PASSAR NA CARA.

     Só em VR (mesmo portão do resto do módulo). O braço esticado prende o
     úmero na reta OMBRO→MÃO, e reta presa não sai da frente do olho por
     rotação nenhuma — quem tem de sair do lugar é o ombro. Aqui mede-se a
     distância do olho a ESSA RETA (o segmento, não a ponta: o que encosta na
     cara é o meio do úmero) e o ombro é empurrado na perpendicular, para
     longe do olho, o tanto que falta e no máximo `clavAbduz`.

     Passa por `limitarClavicula` como todo movimento de clavícula deste
     módulo: continua proibido SUBIR e CRUZAR o esterno. Sobra o que o corpo
     realmente faz ao levantar o braço — abrir o ombro para o lado.
     ================================================================ */
  const _segA = new THREE.Vector3(), _segB = new THREE.Vector3(), _segC = new THREE.Vector3();
  function abduzirDoOlho(sh, up, alvo, clavLado) {
    if (!bodyRoot.parent || bodyRoot.parent === camera) return;
    camera.getWorldPosition(_olhoW);
    up.getWorldPosition(_segA);                    // raiz do braço (ombro)
    _segB.copy(alvo).sub(_segA);                   // ombro → alvo
    const L2 = _segB.lengthSq();
    if (L2 < 1e-8) return;
    /* ponto do SEGMENTO mais perto do olho */
    let t = _segC.copy(_olhoW).sub(_segA).dot(_segB) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    _segC.copy(_segA).addScaledVector(_segB, t).sub(_olhoW);   // olho → reta
    const d = _segC.length();
    if (d >= TUNE.bracoLivre || d < 1e-4) return;
    _segC.multiplyScalar((TUNE.bracoLivre - d) / d);            // o que falta, na fuga
    /* NÃO PASSA POR `limitarClavicula`, e o motivo é o vetor, não a junta:
       aquele limitador existe para impedir que a clavícula SUBA e CRUZE o
       esterno indo atrás de uma âncora à frente, e a regra de cruzamento é uma
       trava de SINAL em x. Este empurrão aponta, por construção, para LONGE do
       olho — ele não tem como levar o ombro para a cara. Aplicado, o limitador
       zerava justamente a abdução (medido: com teto de 0,30 m o pior vértice
       andou de 0,1028 para 0,0979 m, ou seja não andou).

       O que continua valendo é a outra metade da junta: o acrômio NÃO SOBE.
       Encolher os ombros aproxima a gola do olho, e isso está medido no
       comentário de `clavUp` (0,1304 m com 2 cm de folga contra 0,1442 m com
       zero). Aqui a componente para cima é simplesmente descartada. */
    if (_segC.y > 0) _segC.y = 0;
    if (_segC.lengthSq() < 1e-8) return;
    if (_segC.length() > TUNE.clavAbduz) _segC.setLength(TUNE.clavAbduz);
    clavDelta[clavLado] += _segC.length();
    sh.parent.getWorldQuaternion(_q).invert();
    _segC.applyQuaternion(_q).divide(sh.parent.getWorldScale(_v3));
    sh.position.add(_segC);
    up.updateWorldMatrix(true, true);
  }

  /* IK analítico de 2 ossos com dobra guiada por "pole" (cotovelo) */
  function solveArm(sh, up, fore, hand, len, targetPos, sideSign, tetoClav) {
    /* O COMPRIMENTO QUE ENTRA NO SOLVER É O DESTE FRAME, não o do
       carregamento. `armLen` foi medido com a raiz em escala 1; em VR a raiz
       carrega a escala do avatar (js/xr/xrbody.js dimensiona o boneco pelo
       jogador) e o solver trabalha em MUNDO. Ver `resolverPernas`: é o mesmo
       defeito que deixava o joelho dobrado com o jogador de pé. */
    const escala = bodyRoot.scale.x || 1;
    const L = alcanceUsado[sideSign > 0 ? 'r' : 'l'];
    L.a = len.a * escala;
    L.b = len.b * escala;
    // clavícula: âncora além do alcance → o OMBRO estende rumo ao alvo até
    // sobrar dobra de cotovelo (o clamp sozinho deixava o braço reto e a mão
    // curta — a âncora de apoio fica a até ~1 m do ombro em várias armas)
    /* a bolha do olho entra ANTES da clavícula: os dois olham para o mesmo
       alvo, e mirar em pontos diferentes deixaria o ombro indo para um lugar
       onde a mão não vai */
    const alvo = foraDoOlho(targetPos);
    const clavLado = sideSign > 0 ? 'r' : 'l';
    clavDelta[clavLado] = 0;
    if (sh) {
      const teto = Number.isFinite(tetoClav) ? tetoClav : TUNE.clavMax;
      _v.copy(alvo).sub(up.getWorldPosition(_v2));
      const need = Math.min(
        Math.max(_v.length() - (L.a + L.b) * TUNE.reachBend, 0), teto);
      if (need > 1e-4) {
        _v.normalize().multiplyScalar(need);                 // delta em mundo
        limitarClavicula(sh, _v, sideSign);                  // junta, não elástico
        clavDelta[clavLado] = _v.length();                   // QA: ombro viajou tanto
        sh.parent.getWorldQuaternion(_q).invert();
        _v.applyQuaternion(_q).divide(sh.parent.getWorldScale(_v3));
        sh.position.add(_v);
      }
      abduzirDoOlho(sh, up, alvo, clavLado);
    }
    /* POLE: O COTOVELO ABRE EM RELAÇÃO AO TRONCO, NÃO À CABEÇA.

       Era `camera.getWorldQuaternion` — e no desktop dá exatamente o mesmo
       número, porque ali o corpo é FILHO da câmera com rotação identidade.
       Em VR não: a cabeça gira livre e o quadril só a segue depois de 25° de
       folga de pescoço (js/xr/xrbody.js), então olhar 60° para o lado girava
       a direção do cotovelo junto com o olhar e varria o úmero esquerdo pela
       frente do peito. Medido nessa pose: a malha do `Arm_1.L` a 0,1277 m do
       olho, contra o teto de 0,15 m do critério I3. Cotovelo é junta do
       tronco; quem manda nele é o ombro, não o pescoço. */
    bodyRoot.getWorldQuaternion(_tq);
    _poloA.set(sideSign * TUNE.elbowOut, -TUNE.elbowDown, 0.05).applyQuaternion(_tq);
    dobrar2Ossos(up, fore, hand, L, alvo, _poloA);
    // (o punho é alinhado depois por alignHand — eixo dos dedos + rolagem)
  }

  /* IK ANALÍTICO DE 2 OSSOS (lei dos cossenos), compartilhado por braço e
     perna: gira `up` e `fore` até `end` alcançar o alvo, com a junta do meio
     dobrando na direção de `poloDir`. Sem iteração — uma passada, resultado
     determinístico, mesmo número em todo frame com a mesma entrada. */
  function dobrar2Ossos(up, fore, end, len, targetPos, poloDir) {
    const sPos = up.getWorldPosition(_sPos);
    _tp.copy(targetPos).sub(sPos);
    const reach = len.a + len.b;
    let d = _tp.length();
    if (d < 1e-4) return;
    if (d > reach * 0.999) { _tp.multiplyScalar((reach * 0.999) / d); d = reach * 0.999; }
    else {
      /* ALVO DENTRO DO BURACO INTERNO. Com d < |a−b| não existe triângulo: o
         cosseno passa de 1 e a junta desanda. Perna dobrada ao máximo é o mais
         perto que a ponta chega — empurra o alvo até lá em vez de estourar. */
      const minR = Math.abs(len.a - len.b) * 1.001 + 1e-4;
      if (d < minR) { _tp.multiplyScalar(minR / d); d = minR; }
    }
    _n.copy(_tp).normalize();
    _pole.copy(poloDir);
    _pole.addScaledVector(_n, -_pole.dot(_n)); // perpendicular à linha raiz→alvo
    if (_pole.lengthSq() < 1e-6) _pole.set(0, -1, 0).addScaledVector(_n, _n.y);
    _pole.normalize();

    const cosA = Math.min(1, Math.max(-1, (len.a * len.a + d * d - len.b * len.b) / (2 * len.a * d)));
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    // posição desejada da junta do meio
    _v.copy(sPos).addScaledVector(_n, len.a * cosA).addScaledVector(_pole, len.a * sinA);

    // 1) osso de cima mira a junta desejada
    fore.getWorldPosition(_v2).sub(sPos);
    aimBone(up, _v2, _v3.copy(_v).sub(sPos));
    // 2) junta mira o alvo
    const ePos = fore.getWorldPosition(_ePos);
    end.getWorldPosition(_v3).sub(ePos);
    aimBone(fore, _v3, _v.copy(targetPos).sub(ePos));
  }

  /* ================================================================
     A PERNA QUE ENCURTA — a causa raiz do corpo "enterrado" em VR.

     O QUE HAVIA AQUI, E POR QUE NÃO FUNCIONAVA. O agachamento girava a
     bacia num sentido e o joelho no outro; a perna mudava de FORMA e o pé
     ficava no mesmo lugar. Medido: `crouchT` de 0 a 1 movia o osso do pé
     0,0559 m, com a perna encurtando 0,0884 m de 0,58 m necessários. No
     desktop ninguém via, porque a câmera desce junto e ninguém olha para
     o próprio pé. Em VR isso é o defeito inteiro: com a perna rígida,
     ancorar o corpo na CABEÇA (o que o critério C5 pede) enterra o pé
     exatamente o tanto que o jogador agachou, e ancorar nos PÉS põe o
     peito do boneco na altura dos olhos — medido, ombro 0,190 m ACIMA do
     olho e topo do boneco 0,709 m acima. É o mesmo cobertor curto: o
     VRIK, que a Oculus Studios criou para "Dead and Buried" e que virou
     o padrão do gênero, nomeia o trade-off pelo nome (`plantFeet` "can
     cause the camera to exit the head").

     O QUE ESTÁ AQUI AGORA. IK ANALÍTICO DE 2 OSSOS (coxa + canela), a
     mesma lei dos cossenos do braço, com o PÉ como alvo e o joelho
     dobrando na direção de um polo. O alvo do pé é a posição de descanso
     dele SUBIDA de `encurtar` metros: como a raiz do corpo desce esse
     mesmo tanto (a cabeça é quem manda), o pé fica parado no MUNDO.

     De onde vem `encurtar`:
       - em VR, de `bodyRoot.userData.encurtar` (metros de MUNDO), que
         js/xr/xrbody.js escreve com a queda MEDIDA da cabeça do jogador;
       - no desktop, do agachamento do teclado — o jogo baixa o olho
         0,58 m e a perna encurta esse tanto.

     O TETO É ANATÔMICO, não arbitrário: `pernaDobra` é o quanto a perna
     encurta até o joelho chegar em 30° de ângulo interno (150° de flexão,
     o máximo humano). Pedir mais que isso não dobra mais — o corpo é que
     para de descer, e quem agacha fundo demais vê o ombro subir alguns
     centímetros em vez de ver o próprio pé furar o chão.
     ================================================================ */
  const pernaRepouso = { r: null, l: null };  // pé, polo e orientação, no espaço da RAIZ

  function medirPernas() {
    const pares = [['r', B.leg1R, B.leg2R, B.footR], ['l', B.leg1L, B.leg2L, B.footL]];
    if (pares.some(([, q, j, p]) => !q || !j || !p)) return;
    bodyRoot.updateWorldMatrix(true, true);
    const dist = (x, y) => x.getWorldPosition(_v).distanceTo(y.getWorldPosition(_v2));
    legLen = {
      r: { a: dist(B.leg1R, B.leg2R), b: dist(B.leg2R, B.footR) },
      l: { a: dist(B.leg1L, B.leg2L), b: dist(B.leg2L, B.footL) },
    };
    /* Uma vez só, no carregamento: alocar Vector3/Quaternion aqui não mexe no
       `Math.random` seedado (só Object3D e BufferGeometry gastam número no
       UUID), e nada disso roda por frame. */
    const inv = new THREE.Matrix4().copy(bodyRoot.matrixWorld).invert();
    const qRaiz = bodyRoot.getWorldQuaternion(new THREE.Quaternion()).invert();

    /* A SOLA DA BOTA, MEDIDA NO VÉRTICE — e é ela, não o tornozelo, que o
       jogador vê entrar no chão.

       O alvo do IK da perna é um OSSO (o `Boot`), e a malha da bota desce
       0,165 unidades da raiz ABAIXO dele. Pôr o osso no piso enterra a bota
       inteira; pôr a bota no piso é o que se quer, e para isso é preciso saber
       essa distância. Ela é medida UMA VEZ, na pose de descanso, no espaço da
       RAIZ — na bind o skinning é a identidade por construção (`boneInverse` é
       a inversa do osso na bind), então o vértice bruto do atributo já é a
       posição de descanso na malha; subir daí até a raiz é uma multiplicação
       de matrizes. É o mesmo raciocínio de `recortarOlho`.

       CAIXA NÃO SERVE AQUI: `Box3.setFromObject` num `SkinnedMesh` grava em
       `mesh.boundingBox` e o three nunca invalida esse campo (CLAUDE.md) — e
       este arquivo ENVENENA esse cache de propósito no boot. Vértice. */
    const _vv = new THREE.Vector3(), _mm = new THREE.Matrix4();
    let sola = Infinity;
    bodyRoot.traverse(o => {
      if (!o.isSkinnedMesh || !o.geometry || !o.geometry.attributes.position) return;
      const at = o.geometry.attributes.position;
      _mm.multiplyMatrices(inv, o.matrixWorld);
      for (let v = 0; v < at.count; v++) {
        _vv.fromBufferAttribute(at, v).applyMatrix4(_mm);
        if (_vv.y < sola) sola = _vv.y;
      }
    });
    if (!Number.isFinite(sola)) sola = 0;

    let dobra = Infinity;
    for (const [k, quadril, joelho, pe] of pares) {
      const hip = quadril.getWorldPosition(new THREE.Vector3());
      const joe = joelho.getWorldPosition(new THREE.Vector3());
      const tor = pe.getWorldPosition(new THREE.Vector3());
      const eixo = tor.clone().sub(hip);
      const L0 = eixo.length();
      if (L0 < 1e-4) return;
      eixo.multiplyScalar(1 / L0);
      /* POLO DO JOELHO LIDO DO PRÓPRIO RIG: é a componente de (joelho −
         quadril) perpendicular à linha quadril→pé, ou seja, o lado para onde
         esta perna já dobra na pose de descanso. Ler do modelo em vez de
         cravar "para frente" mantém o solver honesto se o rig mudar. */
      const polo = joe.clone().sub(hip);
      polo.addScaledVector(eixo, -polo.dot(eixo));
      if (polo.lengthSq() < 1e-8) polo.set(0, 0, -1);   // rig reto: joelho pra frente
      polo.normalize();
      const peRaiz = tor.clone().applyMatrix4(inv);
      const { a, b } = legLen[k];
      const dMin = Math.sqrt(Math.max(0, a * a + b * b - 2 * a * b * Math.cos(TUNE.kneeMin)));
      pernaRepouso[k] = {
        pe: peRaiz,
        polo: polo.clone().transformDirection(inv),
        quat: qRaiz.clone().multiply(pe.getWorldQuaternion(new THREE.Quaternion())),
        lado: Math.sign(peRaiz.x) || 1,
        L0,
        /* altura do TORNOZELO acima da sola, em unidades da raiz */
        sola: peRaiz.y - sola,
        /* menor distância quadril→tornozelo que o joelho permite (raiz) */
        dMin,
      };
      dobra = Math.min(dobra, Math.max(0, L0 - dMin));
    }
    pernaDobra = Number.isFinite(dobra) ? dobra : 0;
    /* CONTRATO COM O MÓDULO DE VR, sem passar pelo game.js: quem ancora o
       corpo precisa saber até onde a perna dobra antes de mandar descer. */
    bodyRoot.userData.pernaDobra = pernaDobra;
  }

  /* ================================================================
     A COLUNA — o grau de liberdade que faltava para o jogador SENTADO NO CHÃO.

     ONDE A PERNA ACABA. A raiz do boneco acompanha a CABEÇA até o fim (C5), e
     o quadril mora 0,9414 unidades de raiz abaixo dela. Com a cabeça do jogador
     abaixo disso, o quadril está DEBAIXO do piso e nenhuma pose de perna
     resolve — medido no vértice skinado, no render:

       cabeça 0,90 → malha −0,0588 (quadril −0,0412)
       cabeça 0,80 → malha −0,1635 (quadril −0,1412)
       cabeça 0,70 → malha −0,2626 (quadril −0,2412)

     A perna responde por ~0,02 m disso; o resto é o TRONCO descendo junto com
     a raiz.

     POR QUE O CLAMP SOZINHO NÃO SERVE. Travar a raiz para o quadril não descer
     é o `plantFeet` do VRIK, que já foi removido daqui com número: com a cabeça
     a 0,95 m o ombro ia para +0,0521 m ACIMA do olho e o erro de âncora para
     0,20 m, contra os 0,05 m de C5. O jogador via a própria vista sair do meio
     do tórax.

     O QUE ESTÁ AQUI. Clamp MAIS coluna, que é o que o VRIK faz no `Spine`
     solver: a raiz sobe o tanto que o quadril precisa, e o TRONCO dobra o tanto
     que a cabeça precisa para voltar exatamente ao lugar. O osso é o `Chest`
     (a junta acima da pelve — `Torso_49` é a pelve e carrega as pernas, então
     dobrar por ele deitaria o corpo inteiro em vez de o tronco). Resultado: o
     quadril sai do chão E a cabeça do boneco continua onde o olho do jogador
     está, que é o que C5 mede.

     COMO O ÂNGULO É ACHADO. A altura do olho do modelo em função do ângulo é
     `A + B·cos θ + C·sin θ` — monótona no trecho que interessa —, e o alvo é
     conhecido. Em vez de derivar a fórmula (e errar um sinal), aqui se BUSCA:
     `poeColuna` põe o ângulo e MEDE onde o olho do modelo caiu, e a bissecção
     fecha em 14 passos (≈0,005° de resolução, ~1e-5 m de olho). Nenhuma
     constante de gosto, e o sentido "para a frente" também é medido, no
     carregamento, em vez de suposto.

     O QUE ISSO CUSTA, DECLARADO: `colunaDivida` é o quanto o quadril AINDA
     ficou abaixo do piso depois de a coluna gastar toda a flexão que tem. Com
     `flexaoMax` de 80° ela cobre bem mais que o jogador sentado.
     ================================================================ */
  let colunaGeo = null;             // { quadril, sinal } — unidades da RAIZ
  let colunaDobra = 0, colunaDivida = 0;
  const _olhoNoPeito = new THREE.Vector3();   // pose de BIND
  const _olhoUsar = new THREE.Vector3();     // ...reexpresso na pose deste frame
  const _alvoOlho = new THREE.Vector3(), _olhoAtual = new THREE.Vector3();
  const _pisoC = new THREE.Vector3(), _vCol = new THREE.Vector3();
  const _qCol = new THREE.Quaternion(), _qColW = new THREE.Quaternion();
  const _vxCol = new THREE.Vector3();

  /* A inclinação do peito que o resto do módulo já aplicava (respiração +
     agachamento). Vive aqui porque `ajustarColuna` precisa RESOLVER com ela
     incluída: as duas rotações são em volta do MESMO eixo local, então somam —
     e o bloco de sempre continua multiplicando a dele por cima. */
  function inclinacaoDoPeito(t, k) {
    return Math.sin(t * 1.6) * 0.014 + k * 0.25;
  }

  function medirColuna() {
    if (!B.chest || !B.leg1R || !B.leg1L || !bind.get(B.chest)) return;
    bodyRoot.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(bodyRoot.matrixWorld).invert();
    /* O OLHO DO MODELO É A ORIGEM DA RAIZ (js/xr/xrbody.js põe a raiz na altura
       da cabeça do jogador). Guardado no espaço do PEITO, ele passa a ser um
       ponto que a dobra CARREGA — e é por ele que se mede se a cabeça voltou. */
    const olhoW = bodyRoot.getWorldPosition(new THREE.Vector3());
    B.chest.updateWorldMatrix(true, false);
    _olhoNoPeito.copy(olhoW);
    B.chest.worldToLocal(_olhoNoPeito);

    /* O QUADRIL, E A MALHA QUE DESCE ABAIXO DELE. O alvo do clamp é o osso do
       quadril, mas quem o jogador vê entrar no chão é a malha da pelve — medida
       aqui pelo VÉRTICE (nunca `Box3`: a caixa de um `SkinnedMesh` fica
       congelada na primeira pose pedida, e este arquivo envenena esse cache de
       propósito no boot). Na bind o skinning é a identidade por construção,
       então o vértice bruto já é a posição de descanso. */
    let quadril = Infinity;
    for (const b of [B.leg1R, B.leg1L]) {
      quadril = Math.min(quadril, b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv).y);
    }
    const alvo = new Set(['Torso', 'Pelvis']);
    const _vv = new THREE.Vector3(), _mm = new THREE.Matrix4();
    bodyRoot.traverse(o => {
      if (!o.isSkinnedMesh || !o.geometry || !o.geometry.attributes.position) return;
      const g = o.geometry, at = g.attributes.position;
      const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      if (!si || !sw || !o.skeleton) return;
      _mm.multiplyMatrices(inv, o.matrixWorld);
      for (let v = 0; v < at.count; v++) {
        let bi = si.getX(v), bw = sw.getX(v);
        for (const par of [[si.getY(v), sw.getY(v)], [si.getZ(v), sw.getZ(v)],
          [si.getW(v), sw.getW(v)]]) {
          if (par[1] > bw) { bw = par[1]; bi = par[0]; }
        }
        const nome = (o.skeleton.bones[bi] && o.skeleton.bones[bi].name) || '';
        let bate = false;
        for (const a of alvo) if (nome.indexOf(a) === 0) bate = true;
        if (!bate) continue;
        _vv.fromBufferAttribute(at, v).applyMatrix4(_mm);
        if (_vv.y < quadril) quadril = _vv.y;
      }
    });
    if (!Number.isFinite(quadril) || quadril >= 0) return;

    /* PARA QUE LADO É "PARA A FRENTE": medido, não suposto. Gira o peito um
       pouco e olha para onde o olho do modelo andou no espaço da RAIZ — o
       modelo olha para −Z dela. */
    const bd = bind.get(B.chest);
    const antes = new THREE.Vector3().copy(olhoW).applyMatrix4(inv);
    B.chest.quaternion.copy(bd.q).multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.2));
    B.chest.updateWorldMatrix(false, false);
    const dep = new THREE.Vector3().copy(_olhoNoPeito)
      .applyMatrix4(B.chest.matrixWorld).applyMatrix4(inv);
    B.chest.quaternion.copy(bd.q);
    B.chest.updateWorldMatrix(false, true);
    colunaGeo = { quadril, sinal: dep.z - antes.z < 0 ? 1 : -1 };
  }

  /* Põe a coluna num ângulo TOTAL e devolve onde o olho do modelo foi parar.

     O PONTO É `_olhoUsar`, NÃO `_olhoNoPeito`, e a diferença já custou 0,0929 m
     de âncora — constante em toda a faixa, que é a assinatura de um offset e
     não de um ângulo. `_olhoNoPeito` foi medido na pose de BIND; no frame o
     peito já carrega a inclinação de respiração/agachamento (`lean`, até
     0,25 rad), e coordenada LOCAL de um ponto que não se mexe MUDA quando o
     osso gira. Usar o valor de bind fazia a dobra girar o olho a partir de uma
     pose que não é a de partida — o `lean` entrava duas vezes. `_olhoUsar` é o
     mesmo ponto reexpresso na pose deste frame. */
  function poeColuna(ang) {
    const bd = bind.get(B.chest);
    _qCol.setFromAxisAngle(_vxCol.set(1, 0, 0), ang);
    B.chest.quaternion.copy(bd.q).multiply(_qCol);
    B.chest.updateWorldMatrix(false, false);
    return _olhoAtual.copy(_olhoUsar).applyMatrix4(B.chest.matrixWorld);
  }

  function ajustarColuna(t) {
    colunaDobra = 0; colunaDivida = 0;
    const pai = bodyRoot.parent;
    if (!colunaGeo || !pai || pai === camera) {
      delete bodyRoot.userData.colunaDobra;
      delete bodyRoot.userData.colunaDivida;
      return;
    }
    const escala = bodyRoot.scale.x || 1;
    pai.updateWorldMatrix(true, false);
    const piso = _pisoC.setFromMatrixPosition(pai.matrixWorld).y;
    bodyRoot.updateWorldMatrix(true, true);
    _alvoOlho.setFromMatrixPosition(bodyRoot.matrixWorld);
    const precisa = piso - (_alvoOlho.y + colunaGeo.quadril * escala);
    bodyRoot.userData.colunaDobra = 0;
    bodyRoot.userData.colunaDivida = 0;
    if (!(precisa > 1e-4)) return;

    /* `k` do agachamento pela MESMA conta de `resolverPernas` (que roda depois
       e vai ler o `encurtar` já corrigido). Ele satura em 1 muito antes desta
       faixa — a cabeça precisa estar abaixo de ~0,94 m para a coluna engatar, e
       aí `encurtar` já passou de 0,90 contra os 0,58 de `crouchDrop` —, então
       corrigir `encurtar` abaixo não muda `lean`. */
    const kAg = Math.min(1, Math.max(0, (bodyRoot.userData.encurtar || 0) / escala)
      / Math.max(TUNE.crouchDrop, 1e-4));
    const lean = inclinacaoDoPeito(t, kAg);
    const s = colunaGeo.sinal;
    /* O ponto do olho na pose DESTE frame (ver `poeColuna`). */
    _olhoUsar.copy(_olhoNoPeito).applyQuaternion(
      _qCol.setFromAxisAngle(_vxCol.set(1, 0, 0), -lean));

    /* Quanto de queda de olho a coluna consegue entregar com toda a flexão. */
    const yBase = poeColuna(lean).y;
    const podeCair = yBase - poeColuna(lean + s * TUNE.flexaoMax).y;
    const usa = Math.min(precisa, Math.max(0, podeCair));
    colunaDivida = precisa - usa;

    const raizAntes = bodyRoot.position.y;
    bodyRoot.position.y += usa;
    /* `true, true` E NÃO `true, false`: `poeColuna` lê `B.chest.parent.matrixWorld`
       para compor a matriz do peito, e o pai é o TRONCO — que é descendente da
       raiz. Sem propagar para baixo, a busca media o olho na posição ANTIGA da
       raiz, a primeira avaliação já batia no alvo e a bissecção fechava em
       ZERO. Medido assim: quadril fora do chão (0,0273 a 0,70 m de cabeça) e
       âncora em 0,2687 m — ou seja, exatamente o `plantFeet` que este bloco
       existe para NÃO reintroduzir. */
    bodyRoot.updateWorldMatrix(true, true);

    /* BISSECÇÃO no ângulo: o alvo é a altura do olho do jogador, e quem mede é
       o próprio olho do MODELO. 14 passos sobre 80° dão ~0,005°. */
    let lo = 0, hi = TUNE.flexaoMax;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) * 0.5;
      if (poeColuna(lean + s * mid).y > _alvoOlho.y) lo = mid; else hi = mid;
    }
    colunaDobra = (lo + hi) * 0.5;
    const olhoAgora = poeColuna(lean + s * colunaDobra);
    /* E O RESTO É TRANSLAÇÃO RÍGIDA: o que faltou (sobretudo o avanço
       horizontal que a dobra produziu) sai movendo a raiz, e mover a raiz move
       o olho do modelo o mesmo tanto — fecha em um passo. A posição da raiz é
       local ao rig, então tira a rotação do rig antes de somar. */
    _vCol.copy(_alvoOlho).sub(olhoAgora)
      .applyQuaternion(pai.getWorldQuaternion(_qColW).invert());
    bodyRoot.position.add(_vCol);
    /* A COLUNA FICA SEM O `lean`: o bloco de sempre multiplica a inclinação de
       respiração/agachamento por cima, no MESMO eixo local, e as duas somam. */
    poeColuna(s * colunaDobra);
    bodyRoot.updateWorldMatrix(true, true);

    /* A PERNA TEM DE SABER. `encurtar` é "quanto a perna encurta para o pé
       ficar parado no mundo", e a raiz acabou de subir: o pedido cresce
       exatamente esse tanto. Sem isto o pé subiria junto com o quadril. */
    if (Number.isFinite(bodyRoot.userData.encurtar)) {
      bodyRoot.userData.encurtar += bodyRoot.position.y - raizAntes;
    }
    bodyRoot.userData.colunaDobra = colunaDobra;
    bodyRoot.userData.colunaDivida = colunaDivida;
  }

  function resolverPernas(stride, air) {
    if (!legLen || !pernaRepouso.r || !pernaRepouso.l) return 0;
    /* A RAIZ CARREGA A ESCALA DO AVATAR em VR (o boneco é dimensionado pelo
       jogador). `userData.encurtar` chega em metros de MUNDO; tudo aqui é no
       espaço da raiz, então divide. */
    const escala = bodyRoot.scale.x || 1;
    const pedido = Number.isFinite(bodyRoot.userData.encurtar)
      ? bodyRoot.userData.encurtar / escala
      : TUNE.crouchDrop * player.crouchT;
    /* ================================================================
       O TETO DE `pernaDobra` SAI DO CAMINHO EM VR — ELE ERA O ENTERRO.

       `pernaDobra` (0,6411 na raiz) é quanto a perna encurta com o pé subindo
       EM LINHA RETA pelo eixo quadril→tornozelo. Ele nunca foi o limite real,
       porque o pé também anda para a FRENTE (`footFwd`): medido, com
       `enc` batendo nesse teto o joelho ainda estava a 27,1°, com 5,1° de
       folga até o limite de 22°. Ou seja, o teto parava a perna ANTES do
       joelho — e o que sobrava do agachamento virava bota dentro do chão.

       Medido no vértice skinado, com o jogador agachando 0,75 m: a bota ficou
       **0,1087 m ABAIXO do piso**. O relato do dono ("o boneco parece
       enterrado") é este número.

       Em VR o pedido passa inteiro, e quem segura a perna deixa de ser um
       escalar pré-calculado e passa a ser a GEOMETRIA do frame, em duas
       guardas aplicadas ao alvo já em MUNDO, logo abaixo:
         1. a sola não passa do piso;
         2. o joelho não passa do limite humano — e quando a conta pede mais,
            quem cede é a posição do PÉ (ele desliza para a frente), que é o
            que um corpo faz ao agachar fundo, não o piso.

       No DESKTOP o teto fica: lá `pedido` vale no máximo `crouchDrop` (0,58),
       que já é menor que `pernaDobra`, então a linha nunca morde — e o que
       está no ar não muda por causa de uma correção de VR. */
    const paiCorpo = bodyRoot.parent;
    const emXR = !!(paiCorpo && paiCorpo !== camera);
    const enc = emXR
      ? Math.max(pedido, 0)
      : Math.min(Math.max(pedido, 0), pernaDobra);
    /* `k` É A PROFUNDIDADE DO AGACHAMENTO, NÃO A FRAÇÃO DA PERNA USADA — e a
       diferença entre as duas custou quatro casos de teste.

       Era `enc / pernaDobra`. Parece o mesmo número, e é, enquanto
       `pernaDobra` não muda. Quando o teto do joelho passou de 150° para 158°
       de flexão, `pernaDobra` cresceu 11 % e TODO `k` encolheu junto — sem
       que agachamento nenhum tivesse mudado. Quem paga isso é a CAPA, que
       recolhe a bainha por `sqrt(k)`: com o `k` menor a bainha subiu menos e
       o ponto mais baixo da MALHA (que é a bainha, não a bota) afundou no
       chão. Medido: agachamento raso de 0,25 m passou de dentro do teto para
       0,0738 m abaixo do piso, sem uma linha do agachamento ter mudado.

       `crouchDrop` é a régua certa: é o agachamento de projeto do jogo, em
       unidades da raiz, e não se mexe quando o limite do joelho se mexe. */
    const k = Math.min(1, enc / Math.max(TUNE.crouchDrop, 1e-4));
    /* ...MAS A CAPA PRECISA DO NÚMERO SEM TETO, e o motivo é o mesmo de
       `pernaDobra`: quem satura para de responder e o corpo continua descendo.
       `k` satura em 1 no agachamento de projeto (0,58 m); o jogador de headset
       agacha MAIS que isso, e a partir dali a bainha parava de subir enquanto
       o corpo seguia. Medido na varredura: com a cabeça a 1,20 m a bainha
       ficou 0,0463 m DENTRO do piso, com a bota certinha no lugar.
       `agacharCru` é a mesma razão sem o `min`, então vale exatamente `k` em
       todo o alcance do DESKTOP (onde `enc ≤ crouchDrop` sempre) e só passa de
       1 no agachamento fundo de VR. O teto existe para a capa não virar
       guarda-chuva se a leitura de altura enlouquecer. */
    agacharCru = Math.min(enc / Math.max(TUNE.crouchDrop, 1e-4), TUNE.cloakMax);
    if (!legPairs) {
      legPairs = [['l', B.leg1L, B.leg2L, B.footL, 1], ['r', B.leg1R, B.leg2R, B.footR, -1]];
    }
    /* O PISO, EM MUNDO. Em VR a raiz do boneco é filha do RIG, e o rig É o
       espaço de referência `local-floor` posto no mapa: y = 0 dentro dele é o
       chão em que o jogador está pisando (js/xr/xrrig.js). O rig só guina, de
       modo que a altura do piso em mundo é a origem dele. No desktop não há
       piso nenhum a consultar aqui — o corpo é filho da CÂMERA — e as duas
       guardas abaixo ficam desligadas. */
    let piso = null;
    if (emXR) {
      paiCorpo.updateWorldMatrix(true, false);
      piso = _pisoV.setFromMatrixPosition(paiCorpo.matrixWorld).y;
      /* frente HORIZONTAL do corpo (o modelo olha para −Z da raiz) */
      _fwP.set(0, 0, -1).transformDirection(bodyRoot.matrixWorld);
      _fwP.y = 0;
      if (_fwP.lengthSq() < 1e-8) _fwP.set(0, 0, -1); else _fwP.normalize();
    }
    peErguido = 0; peAFrente = 0;
    for (const [lado, quadril, joelho, pe, s] of legPairs) {
      const rep = pernaRepouso[lado];
      const sw = Math.sin(walkPh) * s * stride;
      _alvo.copy(rep.pe);
      _alvo.y += enc;                                     // encurta: o pé sobe NA RAIZ
      _alvo.z -= TUNE.footFwd * k;                        // agachou: o pé vai à frente do quadril
      _alvo.z -= sw * TUNE.stepLen;                       // passada (−Z é a frente do corpo)
      _alvo.y += Math.max(0, sw) * TUNE.stepLift + air * TUNE.airTuck;
      bodyRoot.localToWorld(_alvo);
      /* ================================================================
         AS DUAS GUARDAS DO PÉ, EM MUNDO E NESTA ORDEM.

         1) A SOLA NÃO PASSA DO PISO. O alvo é o osso do tornozelo; a bota
            desce `rep.sola` (unidades da raiz, medida no vértice em
            `medirPernas`) abaixo dele. É um MÍNIMO, não uma igualdade: a
            passada levanta o pé e tem de continuar levantando.

         2) O JOELHO NÃO PASSA DO LIMITE HUMANO, E QUEM CEDE É O PÉ. Se, com a
            sola no piso, o quadril chegou perto demais do tornozelo, não há
            triângulo com o joelho dentro de `kneeMin` — e a saída NÃO é
            afundar o pé nem dobrar o joelho ao contrário: é o pé deslizar
            para a FRENTE, que é o que um corpo faz agachando fundo (com o
            quadril preso debaixo da cabeça, "quadril para trás" e "pé para a
            frente" são o mesmo movimento visto do outro osso — é o
            `moveBodyBackWhenCrouching` do VRIK). Andar na horizontal aumenta
            a distância quadril→pé sem tirar a sola do chão, que é exatamente
            a variável livre que faltava.

            O deslize sai da equação, não de um fator de gosto:
              |d + t·f|² = dMin²  →  t = −(d·f) + √((d·f)² + dMin² − |d|²)
            com `f` a frente horizontal do corpo. É o menor avanço que fecha o
            triângulo, então o pé nunca anda mais do que o necessário. E é
            limitado por construção: t ≤ dMin (0,161 na raiz).
         ================================================================ */
      if (piso !== null) {
        const minY = piso + rep.sola * escala;
        if (_alvo.y < minY) {
          peErguido = Math.max(peErguido, minY - _alvo.y);
          _alvo.y = minY;
        }
        quadril.getWorldPosition(_hipP);
        _dlP.copy(_alvo).sub(_hipP);
        const dm = rep.dMin * escala;
        const d2 = _dlP.lengthSq();
        if (d2 < dm * dm) {
          const bd = _dlP.dot(_fwP);
          const t = -bd + Math.sqrt(Math.max(0, bd * bd + dm * dm - d2));
          _alvo.addScaledVector(_fwP, t);
          peAFrente = Math.max(peAFrente, t);
        }
      }
      _poloP.copy(rep.polo);
      _poloP.x += rep.lado * TUNE.kneeOut * k;            // joelhos abrem ao dobrar
      _poloP.transformDirection(bodyRoot.matrixWorld);
      /* ================================================================
         O JOELHO SOBE. ELE NUNCA MERGULHA.

         O polo diz de que lado da linha quadril→pé o joelho sai, e o solver o
         REPROJETA perpendicular a essa linha. Enquanto o pé está ABAIXO do
         quadril, um polo horizontal-para-a-frente reprojetado continua para a
         frente e tudo funciona. Num agachamento fundo o pé fica ACIMA do
         quadril (a sola está travada no piso e o quadril desceu junto com a
         cabeça), a linha inverte de sentido — e a MESMA reprojeção vira o polo
         PARA BAIXO. O joelho, que está a 0,376 m dessa linha, desce esse tanto
         em vez de subir.

         Medido na varredura, degrau a degrau: com a cabeça a 1,15 m o polo
         real era (0,84; +0,54; 0,08) e estava tudo certo; a 1,10 m ele virou
         (0,72; −0,68; 0,14) e a COXA foi para 0,155 m abaixo do piso, com o
         joelho 0,25 m abaixo do próprio tornozelo. É o mesmo defeito que o
         comentário de `footFwd` descreve ("o joelho mergulha"), aqui pelo
         outro gatilho: não é o pé atrás do quadril, é o pé acima dele.

         A regra é anatômica e vale sempre: agachar leva o joelho para CIMA e
         para a frente. Então a componente vertical do polo é refletida em vez
         de aceita; se a reflexão ainda apontar para baixo (a linha
         quadril→pé quase vertical torna a reprojeção instável), o polo passa a
         ser o "para cima" reprojetado, cuja componente vertical vale 1 − n_y²
         e portanto NUNCA é negativa. */
      _dlP.copy(_alvo).sub(quadril.getWorldPosition(_hipP));
      if (piso !== null && _dlP.lengthSq() > 1e-9) {
        _dlP.normalize();
        _poloP.addScaledVector(_dlP, -_poloP.dot(_dlP));  // como o solver fará
        if (_poloP.y < 0) {                               // reflete e reprojeta
          _poloP.y = -_poloP.y;
          _poloP.addScaledVector(_dlP, -_poloP.dot(_dlP));
        }
        if (_poloP.y < 0 || _poloP.lengthSq() < 1e-8) {
          /* "para cima" reprojetado: a componente vertical dele vale 1 − n_y²,
             que nunca é negativa */
          _polX.set(0, 1, 0).addScaledVector(_dlP, -_dlP.y);
          /* ...e ela é ZERO quando a linha quadril→pé é vertical, que é o
             jogador sentado no chão com o pé à frente. Aí não existe "para
             cima" perpendicular — e não precisa: com a linha vertical QUALQUER
             polo horizontal põe o joelho acima do quadril, então vale a frente
             do corpo. Sem esta segunda rede o polo refletido continuava
             valendo e o joelho voltava a mergulhar (medido: 0,062 m abaixo do
             próprio tornozelo com a cabeça a 0,70 m). */
          if (_polX.lengthSq() < 1e-6) {
            _polX.copy(_fwP).addScaledVector(_dlP, -_fwP.dot(_dlP));
          }
          if (_polX.lengthSq() > 1e-8) _poloP.copy(_polX);
        }
      }
      /* O SOLVER TRABALHA EM MUNDO, e em VR o boneco é dimensionado pelo
         jogador: `legLen` foi medido com a raiz em escala 1, então a coxa e a
         canela precisam entrar na escala DESTE frame. Sem isto o IK pede uma
         perna 12 % mais longa do que existe e dobra o joelho parado em pé —
         medido: joelho a 130,9° e pé 0,0618 m no ar, com o jogador de pé. */
      _lenP.a = legLen[lado].a * escala;
      _lenP.b = legLen[lado].b * escala;
      dobrar2Ossos(quadril, joelho, pe, _lenP, _alvo, _poloP);
      /* PÉ CHAPADO. Sem isto a canela deitada do agachamento fundo gira a bota
         junto e a ponta fura o piso. A bota volta à MESMA orientação que tem
         em pé, que é onde ela já estava certa. */
      bodyRoot.getWorldQuaternion(_qf).multiply(rep.quat);
      pe.parent.getWorldQuaternion(_qf2).invert();
      pe.quaternion.copy(_qf2.multiply(_qf));
      pe.updateWorldMatrix(false, true);
    }
    /* O PREÇO QUE SOBROU, MEDIDO NO OSSO DEPOIS DE RESOLVER — não previsto por
       fórmula. Com a sola travada no piso, o que ainda pode ficar abaixo dele é
       o QUADRIL: a raiz do boneco acompanha a cabeça até o fim (js/xr/xrbody.js,
       critério C5), e o quadril mora ~0,94 unidades da raiz abaixo dela. Cabeça
       abaixo disso é o jogador SENTADO NO CHÃO, e aí nenhuma pose de perna
       salva — o que falta é dobrar a COLUNA, que este rig não faz.

       `afundou` era uma PREVISÃO (`olho − pernaDobra − tolerância`) feita em
       js/xr/xrbody.js, e com as guardas acima ela passou a prever enterro que
       não acontece mais. Aqui é medida: o menor entre sola, quadril e joelho,
       contra o piso. Vai pelo mesmo `userData` que `pernaDobra` e `encurtar`. */
    if (piso !== null) {
      let baixo = Infinity;
      for (const [lado, quadril, joelho, pe] of legPairs) {
        const sol = pernaRepouso[lado].sola * escala;
        baixo = Math.min(baixo, pe.getWorldPosition(_hipP).y - sol,
          quadril.getWorldPosition(_hipP).y, joelho.getWorldPosition(_hipP).y);
      }
      afundou = Math.max(0, piso - baixo);
      bodyRoot.userData.afundou = afundou;
    } else {
      afundou = 0;
      delete bodyRoot.userData.afundou;
    }
    return k;
  }

  /* curl dos dedos: cada dedo tem 2 falanges (Finger_1..10 = 5 dedos × 2) */
  function curlFingers(bones, base, tip, trig, isRight, k) {
    for (const b of bones) {
      const bd = bind.get(b);
      if (!bd) continue;
      // o índice do dedo vem do NOME do osso e nunca muda: a regex rodava
      // ~40 vezes por frame (e cada match aloca um array)
      let idx = b.userData.fingerIdx;
      if (idx === undefined) idx = b.userData.fingerIdx = parseInt(b.name.match(/^Finger_(\d+)/)[1], 10);
      const isTip = idx % 2 === 0;       // pares = segunda falange
      const digit = Math.ceil(idx / 2);  // 1..5
      let amt = isTip ? tip : base;
      if (isRight && digit === 1) amt = trig;      // indicador no gatilho
      if (digit === 5) amt *= 0.75;                // polegar fecha menos
      _q.setFromAxisAngle(_v.set(1, 0, 0), amt); // + fecha a mão neste rig
      b.quaternion.copy(bd.q).multiply(_q);
      // suaviza: mistura com a pose anterior pra não "teleportar" o dedo
      if (b.userData.prevQ) b.quaternion.slerp(b.userData.prevQ, Math.max(0, 1 - k));
      b.userData.prevQ = (b.userData.prevQ || new THREE.Quaternion()).copy(b.quaternion);
    }
  }

  /* 0 = punho na ARMA, 1 = punho na MÃO DO JOGADOR (ver o bloco no fim de
     `update`). É estado de mistura, não de decisão: quem decide é
     `XRArma.duasMaos()`. */
  let punhoLivre = 0;
  const _qMao = new THREE.Quaternion();
  let walkPh = 0, gunHiddenByPose = null;
  function update(dt, t) {
    if (!readyFlag || failed) return;
    const gun = getGun();
    bodyRoot.visible = weaponRoot.visible;
    // na queda/paraquedas a arma some (as mãos estão nas alças, não no gatilho)
    const poseNow = window.__FP_pose;
    if (poseNow && gun && gun.group.visible) { gun.group.visible = false; gunHiddenByPose = gun; }
    else if (!poseNow && gunHiddenByPose) { gunHiddenByPose.group.visible = gunHiddenByPose === gun; gunHiddenByPose = null; }
    if (!bodyRoot.visible) return;

    // reset pra pose de descanso (deltas de IK não podem acumular)
    for (const [b, bd] of bind) { b.position.copy(bd.p); b.quaternion.copy(bd.q); }
    bodyRoot.updateWorldMatrix(true, true);

    /* pernas: o PÉ é que tem alvo — passada proporcional à velocidade, no ar
       encolhe, e agachar ENCURTA a perna (IK de 2 ossos, ver resolverPernas) */
    const spd = Math.hypot(player.vel.x, player.vel.z);
    walkPh += dt * Math.min(spd, 9) * 1.35;
    const stride = Math.min(spd / 5.2, 1) * (player.onGround ? 0.55 : 0.1);
    const air = player.onGround ? 0 : 1;
    /* ANTES DA PERNA, e é contrato: `ajustarColuna` levanta a RAIZ (para o
       quadril sair de dentro do piso) e corrige `encurtar`; a perna resolve em
       cima do resultado. Feito depois, o pé subiria junto com o quadril. */
    ajustarColuna(t);
    const agacharK = resolverPernas(stride, air);
    /* respiração + capa balançando. O tronco inclina com a DOBRA REAL da perna
       e não com a tecla: em VR quem agacha é a cabeça do jogador, e usar
       `crouchT` deixaria o tronco fora de fase com a perna. */
    if (B.chest) {
      _q.setFromAxisAngle(_v.set(1, 0, 0), inclinacaoDoPeito(t, agacharK));
      B.chest.quaternion.multiply(_q);
    }
    for (let i = 0; i < B.cloak.length; i++) {
      const c = B.cloak[i];
      _q.setFromAxisAngle(_v.set(1, 0, 0),
        Math.sin(t * 1.9 + i) * 0.05 + Math.min(spd / 8, 1) * 0.3
        + Math.sqrt(agacharCru) * TUNE.cloakLift);
      c.quaternion.multiply(_q);
    }

    /* alvos das mãos (posição) + direção dos dedos (empunhadura) */
    const emXR = !!(bodyRoot.parent && bodyRoot.parent !== camera);
    let alvoDaMaoDoJogador = false;
    const pose = window.__FP_pose;
    camera.getWorldQuaternion(_tq);
    const camPos = camera.getWorldPosition(_camPos);
    const rp = _rp, lp = _lp;
    const dirR = _dirR, dirL = _dirL;
    if (pose === 'chute' || pose === 'fall') { // paraquedas: mãos nas alças / caindo: braços abertos
      const up = pose === 'chute';
      rp.set(up ? 0.26 : 0.55, up ? 0.38 : -0.12, up ? -0.16 : -0.3).applyQuaternion(_tq).add(camPos);
      lp.set(up ? -0.26 : -0.55, up ? 0.38 : -0.12, up ? -0.16 : -0.3).applyQuaternion(_tq).add(camPos);
      dirR.set(0.15, up ? 0.9 : 0.1, up ? 0.25 : -0.95).applyQuaternion(_tq);
      dirL.set(-0.15, up ? 0.9 : 0.1, up ? 0.25 : -0.95).applyQuaternion(_tq);
    } else if (gun && gun.parts && gun.parts.handR) {
      gun.parts.handR.getWorldPosition(rp);
      gun.group.getWorldQuaternion(_q2);
      dirR.set(TUNE.fingersR[0], TUNE.fingersR[1], TUNE.fingersR[2]).applyQuaternion(_q2);
      if (gun.melee) { // faca: mão esquerda relaxada ao lado do corpo
        lp.set(-0.28, -0.52, -0.02).applyQuaternion(_tq).add(camPos);
        dirL.set(-0.1, -0.65, -0.75).applyQuaternion(_tq);
      } else {
        gun.parts.handL.getWorldPosition(lp);
        dirL.set(TUNE.fingersL[0], TUNE.fingersL[1], TUNE.fingersL[2]).applyQuaternion(_q2);
      }
      /* ================================================================
         EM VR A MÃO ESQUERDA DO BONECO É A MÃO ESQUERDA DO JOGADOR.

         A spec do WebXR define o `gripSpace` como o espaço que "tracks the
         pose used to render virtual objects so they appear to be held in (or
         part of) the user's hand", com a origem "located at the centroid —
         the center of mass — of the user's fist" (MDN,
         XRInputSource.gripSpace). Ou seja: o punho É a mão. O que fica
         pendurado nela é a ARMA — e é isso que js/xr/xrweapon.js faz com a
         mão direita, pondo a âncora `gripR` EM CIMA da palma.

         Do lado esquerdo esta base fazia o contrário: o IK mirava a âncora
         `supportHand` DA ARMA, que é um ponto do guarda-mão a 0,5508 m da
         empunhadura no fuzil (0,6015 na escopeta, 0,6412 no DMR). Duas
         consequências medidas, no render, com o controle esquerdo onde um
         humano põe a mão de apoio:
           · ombro→âncora 0,6682 m contra 0,6573 m de braço — fora de alcance
             POR CONSTRUÇÃO, o cotovelo travando em 176,0° (esticado);
           · a mão do boneco a **0,5244 m** da mão do jogador; e com a mão
             dele solta ao lado do corpo, a **0,9259 m**.
         O jogador soltava o guarda-mão e o boneco continuava agarrado nele.

         O alvo chega pelo `userData` que js/xr/xrbody.js já usa para
         `encurtar`/`pernaDobra`/`recuoOlho` — mesmo canal, sem passar pelo
         game.js e sem criar `Object3D` (contrato do worldgen). No desktop o
         campo não existe e a âncora da arma continua mandando: lá não há
         controle nenhum, e o que está no ar não pode regredir.

         VALE TAMBÉM PARA A FACA: com o alvo escrito à mão ao lado do corpo, o
         jogador movia o braço esquerdo e o do boneco ficava parado. */
      const maoJog = emXR ? bodyRoot.userData.maoEsq : null;
      if (maoJog) { lp.copy(maoJog); alvoDaMaoDoJogador = true; }
    } else return;

    solveArm(B.shR, B.upR, B.foR, B.haR, armLen.r, rp, 1, TUNE.clavMax);
    solveArm(B.shL, B.upL, B.foL, B.haL, armLen.l, lp, -1,
      alvoDaMaoDoJogador ? TUNE.clavMao : TUNE.clavMax);
    alignHand(B.haR, fingerAxis.r, dirR, TUNE.rollR);
    alignHand(B.haL, fingerAxis.l, dirL, TUNE.rollL);
    /* ================================================================
       E O PUNHO ESQUERDO, QUANDO A MÃO ESTÁ LIVRE, É A MÃO DO JOGADOR.

       A POSIÇÃO da mão esquerda já ia para o `gripSpace` do controle. A
       ORIENTAÇÃO continuava saindo de `gun.group` (`TUNE.fingersL` +
       `TUNE.rollL`), de modo que o jogador soltava o guarda-mão e o punho do
       boneco ficava torcido abraçando um guarda-mão que não estava ali. Medido
       no osso, no render, com a mão solta ao lado do corpo: girar o controle
       75,00° girava o punho 0,27°; e girar a ARMA 28,94°, com a mão do jogador
       PARADA, girava o punho 28,54°.

       `alignHand` não serve para isto e o motivo é geométrico: ela alinha UM
       eixo (os dedos) e rola em volta dele, então uma rotação do controle EM
       VOLTA do próprio eixo dos dedos não mexeria no punho — o mesmo giro de
       75° daria 0°. Punho rígido na mão é orientação COMPLETA:

           q_mundo_da_mão = q_mundo_do_grip · qPunho

       com `qPunho` deduzido da geometria do GLB (ver o bloco de `qPunho`).

       DOIS DONOS, E A TROCA É SUAVE. Com a mão de apoio NA ARMA
       (`XRArma.duasMaos()`), quem manda continua sendo a arma: o jogador está
       segurando um guarda-mão, e girar o pulso em volta de um cilindro não gira
       a mão que o segura. `punhoLivre` mistura os dois em `TUNE.punhoSuaviza`,
       sem histerese própria — a histerese do engate mora em js/xr/xrweapon.js e
       duplicá-la aqui criaria dois estados que discordam. ================ */
    const qGrip = emXR ? bodyRoot.userData.maoEsqQ : null;
    if (qGrip && qPunho.l) {
      const apoiado = typeof deps.apoiando === 'function' && deps.apoiando();
      const kp = dt > 0 ? 1 - Math.exp(-TUNE.punhoSuaviza * Math.min(dt, 0.1)) : 1;
      punhoLivre += ((apoiado ? 0 : 1) - punhoLivre) * kp;
      if (punhoLivre > 1e-3) {
        _qMao.copy(qGrip).multiply(qPunho.l);
        B.haL.getWorldQuaternion(_q2).slerp(_qMao, punhoLivre);
        B.haL.parent.getWorldQuaternion(_q).invert();
        B.haL.quaternion.copy(_q.multiply(_q2));
        B.haL.updateWorldMatrix(true, true);
      }
    } else punhoLivre = 0;

    /* dedos: preset da arma; na recarga a mão que viaja abre um pouco */
    const g = gripFor(gun);
    let reachK = 0;
    if (gun && gun.reloading) {
      const k = Math.min(Math.max(1 - (gun.reloadEnd - t) / gun.reloadTime, 0), 1);
      reachK = Math.sin(Math.min(k / 0.2, 1) * Math.PI) * 0.5 + (k > 0.4 && k < 0.7 ? 0.4 : 0);
    }
    curlFingers(B.fingersR, g.r[0], g.r[1], g.trigR, true, 0.65);
    curlFingers(B.fingersL, Math.max(0.15, g.l[0] - reachK), Math.max(0.2, g.l[1] - reachK), g.l[0], false, 0.65);

    /* POR ÚLTIMO, e tem de ser por último: mede a malha já resolvida deste
       frame e recua o corpo se algo ainda estiver dentro do olho (I3). */
    recuarDoOlho();
  }

  const api = {
    update,
    get ready() { return readyFlag; },
    get failed() { return failed; },
    /* quanto a perna consegue encurtar antes de o joelho passar do limite
       humano (metros, no espaço da raiz — em VR multiplique pela escala) */
    get pernaDobra() { return pernaDobra; },
    /* QA: quantos vértices saíram da malha no carregamento (cabeça + bolha do
       olho). Zero aqui significa que o bolo de geometria voltou a 8 cm do
       olho (I3). */
    get vertsSemCabeca() { return vertsApagados; },
    /* QA: quantas sentinelas estão sendo vigiadas, e quanto o corpo recuou no
       último frame para nada entrar no olho (metros; teto `TUNE.recuoMax`). */
    get sentinelas() { return sentinelas.length; },
    get recuoOlho() { return recuoOlho; },
    get olhoMin() { return olhoMin; },
    get recorteCaixa() { return recorteCaixa; },
    get recorteNaVista() { return recorteNaVista; },
    /* QA: braço e antebraço que o solver ALIMENTOU na lei dos cossenos no
       último frame, em metros de MUNDO. É o número que decide onde o cotovelo
       e a mão param; comparar com a distância real entre os ossos é o que
       separa "o IK acertou" de "o IK pediu um braço que não existe". */
    get alcanceDoIK() { return alcanceUsado; },
    /* QA da perna, em metros de MUNDO e todos medidos DEPOIS de resolver:
       `afundou`  — quanto o ponto mais baixo (sola, quadril ou joelho) passou
                    do piso. Zero é o contrato; o que sobra é o jogador
                    sentado no chão, onde falta dobrar a coluna e não a perna.
       `peErguido`— quanto o alvo do pé teve de ser puxado até o piso, ou seja
                    o tanto de enterro que a guarda evitou neste frame.
       `peAFrente`— quanto o pé deslizou para a frente para o joelho não passar
                    do limite humano. */
    get afundou() { return afundou; },
    /* QA da coluna, em radianos e metros de MUNDO:
       `colunaDobra`   — flexão do tronco ACIMA da inclinação de descanso, gasta
                         para tirar o quadril de dentro do piso (ver
                         `ajustarColuna`). Zero em pé e no agachamento normal.
       `colunaDivida`  — o que sobrou: quanto o quadril AINDA está abaixo do
                         piso depois de a coluna gastar `flexaoMax`. É o preço
                         declarado, e ele sai no QA em vez de ficar escondido. */
    get colunaDobra() { return colunaDobra; },
    get colunaDivida() { return colunaDivida; },
    get peErguido() { return peErguido; },
    get peAFrente() { return peAFrente; },
    /* QA do braço: metros de MUNDO que a clavícula transladou rumo ao alvo no
       último frame. É "o ombro viajando atrás da mão" com número — com o alvo
       na mão do jogador ele fica em zero, e o teto é `TUNE.clavMao`. */
    get clavicula() { return clavDelta; },
    /* QA do punho esquerdo: 0 = orientado pela ARMA (mão de apoio no
       guarda-mão), 1 = orientado pela MÃO DO JOGADOR (`gripSpace`). É o estado
       de mistura, não a decisão — a decisão é `XRArma.duasMaos()`. */
    get punhoLivre() { return punhoLivre; },
    /* QA: a pose do punho DENTRO do `gripSpace`, deduzida da geometria do GLB
       (ver o bloco de `qPunho`). Fica exposta porque é a única forma de um
       teste conferir a dedução contra a mão DIREITA — que segura a arma por um
       caminho de código completamente diferente (âncoras autorais da arma +
       `fingersR`/`rollR`) e serve, por isso, de âncora independente. */
    get punhoOffset() { return qPunho; },
    bones: B, TUNE, bodyRoot,
    /* inspeção: solta o corpo no mundo pra fotografar de fora (calibração) */
    debugDetach(x, y, z) {
      deps.camera.remove(bodyRoot);
      deps.camera.parent.add(bodyRoot);
      bodyRoot.position.set(x, y, z);
      bodyRoot.visible = true;
    },
    debugAttach() {
      bodyRoot.parent && bodyRoot.parent.remove(bodyRoot);
      deps.camera.add(bodyRoot);
      bodyRoot.position.set(0, 0, 0);
    },
    debugBindPose() { // volta o rig pra pose de descanso (foto de calibração)
      for (const [b, bd] of bind) { b.position.copy(bd.p); b.quaternion.copy(bd.q); }
      bodyRoot.updateWorldMatrix(true, true);
    },
  };
  window.__FP = api; // depuração/calibração nos testes
  return api;
}
