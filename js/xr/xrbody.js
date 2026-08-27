/* ================================================================
   ALTURA, POSTURA E CORPO VIRTUAL EM VR.

   Resolve três relatos do dono do projeto, que são o mesmo defeito visto
   de ângulos diferentes: "o boneco parece às vezes enterrado no chão" e
   "o corpo onde segura a arma parece deslocado do centro".

   O DIAGNÓSTICO, MEDIDO DENTRO DE UMA SESSÃO IMERSIVA
   ---------------------------------------------------
   O corpo em primeira pessoa (js/fpbody.js) foi desenhado para câmera de
   MOUSE: é FILHO DA CÂMERA, com o topo da cabeça 0,20 m acima do olho e
   altura fixa de 1,78 × 1,18 = 2,10 m. Isso amarra os pés a
   "altura do olho − 1,90 m". No desktop o olho está SEMPRE a 1,62 m, e a
   conta fecha em −0,28 m — que ninguém via, porque no desktop não se olha
   direto para baixo. Em VR a altura do olho é a do JOGADOR. Medido:

       cabeça a 1,90 m → pés a  −0,00 m do chão   (o boneco é um gigante
       cabeça a 1,60 m → pés a  −0,30 m            de 1,90 m de olho: só um
       cabeça a 1,25 m → pés a  −0,65 m            jogador dessa altura fecha)

   O "às vezes" do relato é isto: quanto mais baixo o jogador, mais fundo
   o boneco afunda. E, sendo filho da câmera, o tronco herda o PITCH:
   olhando 55° para baixo o eixo vertical do corpo cai para 0,574 — o
   corpo inteiro tomba para a frente e cruza o campo de visão. É o
   "deslocado do centro".

   O QUE ESTE MÓDULO FAZ, E DE ONDE VEM CADA REGRA
   -----------------------------------------------
   1. TIRA O CORPO DA CÂMERA e pendura no RIG. A câmera é a cabeça: só a
      cabeça pode herdar a pose dela. O tronco fica EM PÉ, sempre.
   2. DIMENSIONA O BONECO PELO JOGADOR. A escala sai da altura calibrada
      do headset, de forma que o olho do modelo caia na altura do olho
      real — é a mesma correção que Population: ONE publicou em patch
      ("Eye position is now lower & better matches eye height on
      characters"). Escalar o AVATAR é o caminho certo; escalar o mundo é
      anti-padrão documentado.
   3. PÉS PRESOS NO CHÃO. A origem do corpo acompanha a cabeça, mas nunca
      abaixo do ponto que deixaria o pé furar o piso. É o "floating
      stand-off" do Immersive Web SDK ("keeps you slightly above ground")
      e o `minHeadHeight` do VRIK: altura mínima da cabeça em relação à
      raiz, para a câmera não sair pelo chão.
   4. ÂNCORA NO CENTRO DA CABEÇA, NÃO NO HEADSET. A pose do visor fica à
      frente dos olhos; ancorar o tronco nela empurra o peito para dentro
      do campo de visão. Population: ONE consertou exatamente isso ("Set
      height at center of head instead of headset").
   5. PESCOÇO COM FOLGA. O quadril só começa a acompanhar a guinada da
      cabeça depois de 25° — o `maxRootAngle` do VRIK (o solver que a
      Oculus Studios criou para "Dead and Buried"), que é o número que a
      indústria calibrou para isso. Sem folga, o tronco cola na cabeça e
      olhar de lado torce os ombros junto com a arma.
   6. AGACHAR DE VERDADE. Baixar a cabeça agacha o jogador NO JOGO: a
      queda de altura vira a mesma tecla que o teclado escreveria, então
      colisão, velocidade e deslize continuam sendo o código já testado.
      Em Onward a altura do headset é entrada de gameplay — o jogo deriva
      dela se você está em pé, agachado ou deitado.

   Fontes e links: docs/vr/referencia-locomocao.md.

   NADA AQUI CRIA `Object3D`. É contrato do worldgen: todo `Object3D`
   gasta 4 números do `Math.random` seedado no UUID, e a ordem de consumo
   é o que faz servidor e bots reconstruírem o mesmo mundo. Este módulo só
   MOVE um objeto que já existe.
   ================================================================ */

/* graus */
const PESCOCO = 25 * Math.PI / 180;   // folga do quadril (VRIK maxRootAngle)
const QUADRIL = 8;                    // rapidez com que o quadril come o excesso
const RECUO = 0.08;                   // centro da cabeça atrás da pose do visor (m)
const RECUO_AGACHADO = 0.06;          // e mais um tanto agachado (VRIK moveBodyBackWhenCrouching)
const AFUNDA_MAX = 0.02;              // tolerância do pé abaixo do piso (m)
const AGACHA_ENTRA = 0.28;            // queda de cabeça que conta como agachar (m)
const AGACHA_SAI = 0.20;              // e a que devolve o "em pé" (histerese)
const AGACHA_CHEIO = 0.55;            // queda que conta como agachamento total
const DE_PE = [1.10, 2.10];           // faixa plausível de altura de olho (m)
/* SUBIR A REFERÊNCIA EXIGE SUSTENTAÇÃO. Ela era o MÁXIMO histórico absoluto,
   e máximo absoluto não tem como desfazer engano: 0,4 s de headset erguido
   (jogador ajeitando a correia, rastreio pulando, aparelho na mão) travava a
   altura "em pé" em 2,05 m, e o jogador DE PÉ passava o resto da sessão com
   `agachado: true` e `crouchT: 1` — colisor menor e velocidade de agachado —
   com o boneco 21 % maior. Medido em sessão.

   Quem cresceu de verdade continua alto no frame seguinte; um pico, não. 0,75 s
   é mais que qualquer falha de rastreio e menos que qualquer "levantei". */
const SUSTENTA = 0.75;
const ESCALA = [0.70, 1.15];          // trava da escala do boneco
const CABECA_MIN = 0.15;              // abaixo disso a leitura não é de cabeça de gente

const trava = (v, [a, b]) => Math.min(b, Math.max(a, v));

export function criarCorpoXR({ THREE, camera }) {
  let corpo = null, rig = null;
  let salvo = null;                 // como o corpo estava antes do VR (desktop)
  let olhoModelo = 0;               // distância pés → origem do corpo, no modelo
  let alturaModelo = 0;
  let alturaCabeca = 0, alturaDePe = 0;
  let agachado = false, agacharFrac = 0;
  let yawCorpo = 0, escala = 1;
  let afundou = 0;                  // quanto o pé passa do chão (m) — o preço declarado
  let suspeita = false;
  let candidato = 0, candidatoT = 0;   // altura alta ainda não confirmada (ver SUSTENTA)

  const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
  const _cx = new THREE.Box3(), _cx2 = new THREE.Box3();
  const _f = new THREE.Vector3(), _u = new THREE.Vector3();
  const _qr = new THREE.Quaternion();

  /* Mede o modelo NO ESPAÇO DO PRÓPRIO CORPO. Traversar filho a filho (em vez
     de `Box3.setFromObject` seguido de uma inversão) evita inflar a caixa: uma
     AABB de mundo desrotacionada cresce, e o número que interessa aqui — onde
     ficam os PÉS em relação à origem — é justamente o que a inflação estraga. */
  function medirModelo() {
    if (!corpo) return false;
    corpo.updateWorldMatrix(true, true);
    _m.copy(corpo.matrixWorld).invert();
    _cx.makeEmpty();
    corpo.traverse(o => {
      const g = o.geometry;
      if (!g) return;
      if (!g.boundingBox) g.computeBoundingBox();
      if (!g.boundingBox) return;
      _cx2.copy(g.boundingBox).applyMatrix4(_m2.multiplyMatrices(_m, o.matrixWorld));
      _cx.union(_cx2);
    });
    const h = _cx.max.y - _cx.min.y;
    if (!Number.isFinite(h) || h < 0.5) return false;   // GLB ainda baixando
    alturaModelo = h;
    olhoModelo = -_cx.min.y;
    return olhoModelo > 0.5;
  }

  /* `rigObj` é o Group do js/xr/xrrig.js; `corpoObj` é a raiz do boneco em
     primeira pessoa (FpBody.bodyRoot). Guarda como estava para devolver o
     desktop intacto — a versão de mouse não pode regredir em nada. */
  function anexar(rigObj, corpoObj) {
    if (!rigObj || !corpoObj) return false;
    if (corpo === corpoObj && rig === rigObj) return true;
    corpo = corpoObj;
    rig = rigObj;
    salvo = {
      pai: corpo.parent,
      position: corpo.position.clone(),
      quaternion: corpo.quaternion.clone(),
      scale: corpo.scale.clone(),
    };
    medirModelo();
    rig.add(corpo);
    corpo.rotation.set(0, yawCorpo, 0);
    return true;
  }

  function soltar() {
    if (!corpo || !salvo) return;
    /* SAI DA SESSÃO, SAI A ORDEM. `encurtar` deixado para trás faria o boneco
       do desktop andar agachado pelo resto da partida: js/fpbody.js só cai no
       agachamento do teclado quando este campo NÃO existe. */
    delete corpo.userData.encurtar;
    delete corpo.userData.recuoOlho;
    if (salvo.pai) salvo.pai.add(corpo);
    else if (corpo.parent) corpo.parent.remove(corpo);
    corpo.position.copy(salvo.position);
    corpo.quaternion.copy(salvo.quaternion);
    corpo.scale.copy(salvo.scale);
    corpo = null; rig = null; salvo = null;
  }

  /* Adota a altura atual como "em pé". O jogador que entra sentado e depois
     levanta (ou o contrário) recalibra por aqui em vez de ficar preso. */
  function calibrar() {
    alturaDePe = trava(alturaCabeca, DE_PE);
  }

  /* Guinada da CABEÇA relativa ao rig. Perto do zênite/nadir o "para frente"
     da cabeça vira vertical e a guinada fica indefinida — olhar direto para
     baixo é comum em VR (é como se olha para a própria arma e para o chão).
     Aí quem dá a direção é o "para cima" do capacete. */
  function guinadaDaCabeca() {
    _f.set(0, 0, -1).applyQuaternion(camera.quaternion);
    if (_f.x * _f.x + _f.z * _f.z < 0.0225) {
      _u.set(0, 1, 0).applyQuaternion(camera.quaternion);
      const s = _f.y < 0 ? 1 : -1;
      _f.set(s * _u.x, 0, s * _u.z);
      if (_f.x * _f.x + _f.z * _f.z < 1e-6) return yawCorpo;
    }
    return Math.atan2(-_f.x, -_f.z);
  }

  function update(dt) {
    const passo = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    const y = camera.position.y;

    /* LEITURA DE ALTURA IMPLAUSÍVEL = REFERÊNCIA ERRADA, não jogador agachado.
       Sessão que nasce em `local` (origem na CABEÇA, não no chão) devolve ~0
       aqui, sem uma linha de erro no console — é o defeito que a ordem de
       `setReferenceSpaceType` previne em js/xr/xrsession.js. Tratar isso como
       agachamento deixaria o jogador agachado para sempre. */
    suspeita = !(Number.isFinite(y) && y > CABECA_MIN);
    if (!suspeita) {
      alturaCabeca = y;
      /* "EM PÉ" É A MAIOR ALTURA SUSTENTADA, não a maior leitura. Em XR o
         pulo do JOGO move o rig e não a cabeça, então subir aqui é subir de
         verdade — mas "de verdade" inclui o headset erguido pela mão e o
         rastreio pulando, e o máximo absoluto não tinha como desfazer isso.
         O candidato guarda o MENOR valor mantido durante a janela: um pico
         dentro dela não puxa a referência para cima junto. */
      if (alturaDePe === 0) alturaDePe = trava(alturaCabeca, DE_PE);
      else if (alturaCabeca > alturaDePe) {
        if (candidatoT > 0) candidato = Math.min(candidato, alturaCabeca);
        else { candidato = alturaCabeca; }
        candidatoT += passo;
        if (candidatoT >= SUSTENTA) {
          alturaDePe = trava(candidato, DE_PE);
          candidatoT = 0;
        }
      } else { candidato = 0; candidatoT = 0; }
    }

    const queda = suspeita ? 0 : Math.max(0, alturaDePe - alturaCabeca);
    agacharFrac = Math.min(1, queda / AGACHA_CHEIO);
    if (suspeita) agachado = false;
    else if (queda >= AGACHA_ENTRA) agachado = true;
    else if (queda <= AGACHA_SAI) agachado = false;

    if (!corpo || !rig) return;
    if (olhoModelo <= 0 && !medirModelo()) return;   // GLB ainda não chegou

    escala = trava(alturaDePe / olhoModelo, ESCALA);
    const olho = olhoModelo * escala;      // distância pé → origem, já escalada

    // guinada: o quadril só come o que passar da folga do pescoço
    const alvo = guinadaDaCabeca();
    let d = alvo - yawCorpo;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const excesso = Math.abs(d) - PESCOCO;
    if (excesso > 0) {
      const k = passo > 0 ? 1 - Math.exp(-QUADRIL * passo) : 1;
      yawCorpo += Math.sign(d) * excesso * k;
    }

    /* ORIGEM DO CORPO: A CABEÇA MANDA, E A PERNA SE VIRA.

       Era o contrário, e o preço estava medido: com os PÉS tendo prioridade
       (`max(alturaCabeca, olho − AFUNDA_MAX)`), o jogador que agachava 0,55 m
       ficava com o ombro do boneco 0,190 m ACIMA do próprio olho e o topo do
       boneco 0,709 m acima — a vista saindo do meio do tórax. O VRIK nomeia
       esse trade-off pelo nome (`plantFeet` "can cause the camera to exit the
       head") e o critério C5 cobra o outro lado ("corpo ancorado na cabeça
       com erro ≤ 0,05 m").

       A troca só ficou possível quando js/fpbody.js passou a ENCURTAR A PERNA
       de verdade (IK analítico de 2 ossos com o pé como alvo). Antes disso,
       ancorar na cabeça enterrava o pé exatamente o tanto que o jogador
       agachava — o mesmo cobertor curto visto do outro lado.

       A CONTA, e é uma só:

         corpo.y  = alturaCabeca        (sempre — a cabeça manda até o fim)
         encurtar = olho − corpo.y      (o pedido, que a perna clampa em
                                         `pernaDobra`)

       ATÉ A RODADA PASSADA HAVIA UM PISO AQUI, e ele era a exceção que
       reprovava o critério citado três parágrafos acima. Era
       `max(alturaCabeca, olho − dobraMax − AFUNDA_MAX)`: enquanto a perna
       dobrava, o corpo descia com a cabeça; passado esse ponto o corpo PARAVA
       e a cabeça continuava descendo — a raiz do boneco subia acima do olho e
       o ombro ia junto. Medido por validação independente: com a cabeça a
       0,95 m — o jogador SENTADO NO CHÃO, que a VRC.Quest.Tracking.1 aceita
       como modo válido — o ombro ficava **+0,0521 m ACIMA do olho**, com
       0,20 m de erro de âncora contra os 0,05 m que C5 escreve. Era o
       `plantFeet` do VRIK voltando pela porta dos fundos.

       O QUE ISSO CUSTA, DECLARADO: o que a perna não dobra vira pé abaixo do
       chão. Para o preço ficar pequeno no agachamento NORMAL, o joelho de
       js/fpbody.js passou do limite ativo (150°) para o passivo (158°, a
       flexão "heel to buttock"), e a perna encurta 0,60 m em vez de 0,542 m —
       que é exatamente o agachamento de 0,60 m de cabeça que o jogo usa. Quem
       agacha MAIS que isso (sentar no chão) vê o pé afundar; `afundou` mede
       quanto, e o número sai no QA em vez de ficar escondido.

       Quem está DENTRO do corpo não vê o próprio pé furar o piso; vê o
       próprio ombro na frente do olho.

       `pernaDobra` chega em unidades da RAIZ do corpo (js/fpbody.js), por
       `userData` no mesmo objeto que este módulo já recebe: não passa pelo
       game.js e não cria objeto nenhum. */
    const dobraMax = (corpo.userData.pernaDobra || 0) * escala;
    afundou = Math.max(0, (olho - dobraMax - AFUNDA_MAX) - alturaCabeca);
    const alturaCorpo = alturaCabeca;
    corpo.userData.encurtar = Math.max(0, olho - alturaCorpo);
    const recuo = RECUO + RECUO_AGACHADO * agacharFrac;
    corpo.position.set(
      camera.position.x + Math.sin(yawCorpo) * recuo,
      alturaCorpo,
      camera.position.z + Math.cos(yawCorpo) * recuo,
    );
    /* E O ÚLTIMO MILÍMETRO VEM DE QUEM VÊ A MALHA. js/fpbody.js mede, depois
       do IK, se algum vértice ainda está dentro da bolha do olho (critério
       I3) e publica em `userData.recuoOlho` o empurrão que falta, em metros
       de MUNDO — mesmo canal de `pernaDobra`/`encurtar`, sem passar pelo
       game.js. Ele NÃO pode escrever `position` direto: esta função roda
       depois dele no frame e apagaria o valor. O empurrão é de mundo e a
       posição é local ao rig, então tira a rotação do rig antes de somar. */
    const rec = corpo.userData.recuoOlho;
    if (rec && rec.lengthSq() > 1e-12 && rig) {
      _f.copy(rec).applyQuaternion(rig.getWorldQuaternion(_qr).invert());
      corpo.position.add(_f);
    }
    corpo.rotation.set(0, yawCorpo, 0);   // EM PÉ: nada de pitch nem roll da cabeça
    corpo.scale.setScalar(escala);
  }

  return {
    anexar, soltar, update, calibrar,
    get agachado() { return agachado; },
    get agacharFrac() { return agacharFrac; },
    get alturaCabeca() { return alturaCabeca; },
    get alturaDePe() { return alturaDePe; },
    get escala() { return escala; },
    /* QA: metros que o pé passa do chão porque a perna acabou de dobrar. É o
       preço declarado de a cabeça mandar até o fim (ver `update`). */
    get afundou() { return afundou; },
    get olhoModelo() { return olhoModelo; },
    get alturaModelo() { return alturaModelo; },
    get referenciaSuspeita() { return suspeita; },
    get anexado() { return !!corpo; },
    get guinada() { return yawCorpo; },
  };
}
